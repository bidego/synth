#include "md_engine.h"
#include <algorithm>
#include <cmath>

namespace md {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr float kAttackTarget = 1.3f;
constexpr int kCtrl = 8;   // las modulaciones lentas se actualizan cada 8 muestras sobrecuestreadas

inline float polyBlep(double t, double dt)
{
    if (t < dt) {
        t /= dt;
        return float(t + t - t * t - 1.0);
    }
    if (t > 1.0 - dt) {
        t = (t - 1.0) / dt;
        return float(t * t + t + t + 1.0);
    }
    return 0.f;
}

inline float coefFor(double seconds, double sr)
{
    return float(1.0 - std::exp(-1.0 / (std::max(seconds, 1e-5) * sr)));
}

inline double attackSeconds(float x) { return 0.001 * std::pow(10000.0, double(x)); }   // 1 ms - 10 s
inline double decaySeconds(float x) { return 0.002 * std::pow(5000.0, double(x)); }     // 2 ms - 10 s

// Ondas del Model D: triangulo, diente de tiburon, sierra, cuadrada, pulso ancho y pulso angosto (con PolyBLEP en los saltos)
inline float waveform(int type, double t, double dt)
{
    auto pulse = [&](double duty) {
        float v = t < duty ? 1.f : -1.f;
        v += polyBlep(t, dt);
        double q = t + 1.0 - duty; q -= std::floor(q);
        v -= polyBlep(q, dt);
        return v - float(2.0 * duty - 1.0);   // sin continua
    };
    switch (type) {
        case 0: return float(t < 0.5 ? 4.0 * t - 1.0 : 3.0 - 4.0 * t);
        case 1: return float(t < 0.72 ? -1.0 + 2.0 * (t / 0.72) : 1.0 - 2.0 * ((t - 0.72) / 0.28)) * 0.98f;
        case 2: return float(2.0 * t - 1.0) - polyBlep(t, dt);
        case 3: return pulse(0.5);
        case 4: return pulse(0.33);
        default: return pulse(0.15);
    }
}

} // namespace

// --- Filtro de escalera ---

void Ladder::setCutoff(double fc, double fs)
{
    const double g = std::tan(kPi * std::min(fc, 0.45 * fs) / fs);
    G = float(g / (1.0 + g));
}

float Ladder::process(float x, float k)
{
    const float G2 = G * G, G4 = G2 * G2, a = 1.f - G;
    // La realimentacion se resuelve en forma lineal con los estados actuales (sin retardo)...
    const float S = a * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
    float in = (x - k * S) / (1.f + k * G4);
    // ...y cada etapa satura suavemente su entrada, como los transistores del original
    for (int i = 0; i < 4; ++i) {
        const float v = G * (std::tanh(in) - z[i]);
        const float y = v + z[i];
        z[i] = y + v;
        in = y;
    }
    return in;
}

float Contour::step(float attackCoef, float decayCoef, float sustain, float releaseCoef)
{
    switch (stage) {
        case Idle: return 0.f;
        case Attack:
            level += (kAttackTarget - level) * attackCoef;
            if (level >= 1.f) { level = 1.f; stage = Decay; }
            break;
        case Decay:
            level += (sustain - level) * decayCoef;
            if (std::fabs(level - sustain) < 1e-4f) { level = sustain; stage = Sustain; }
            break;
        case Sustain: level = sustain; break;
        case Release:
            level -= level * releaseCoef;
            if (level < 1e-4f) { level = 0.f; stage = Idle; }
            break;
    }
    return level;
}

// --- Decimador ---

Decimator2::Decimator2(int taps)
{
    // Sinc de media banda con ventana de Kaiser (beta ~ 9): paso casi plano hasta ~0.45 de la nueva frecuencia y rechazo > 80 dB
    const int n = taps | 1;
    h_.assign(size_t(n), 0.f);
    buf_.assign(size_t(n), 0.f);
    const double beta = 9.0;
    auto bessel = [](double x) {
        double sum = 1.0, term = 1.0;
        for (int k = 1; k < 40; ++k) { term *= (x / (2.0 * k)) * (x / (2.0 * k)); sum += term; }
        return sum;
    };
    const double c = double(n - 1) * 0.5;
    double total = 0.0;
    for (int i = 0; i < n; ++i) {
        const double x = double(i) - c;
        const double sinc = std::fabs(x) < 1e-9 ? 0.5 : std::sin(kPi * 0.5 * x) / (kPi * x);
        const double r = x / c;
        const double w = bessel(beta * std::sqrt(std::max(0.0, 1.0 - r * r))) / bessel(beta);
        h_[size_t(i)] = float(sinc * w);
        total += sinc * w;
    }
    for (auto& v : h_) v = float(double(v) / total);
}

void Decimator2::reset()
{
    std::fill(buf_.begin(), buf_.end(), 0.f);
    pos_ = 0;
}

float Decimator2::process(float a, float b)
{
    const int n = int(h_.size());
    buf_[size_t(pos_)] = a; pos_ = (pos_ + 1) % n;
    buf_[size_t(pos_)] = b; pos_ = (pos_ + 1) % n;
    float acc = 0.f;
    int idx = pos_;   // la muestra mas vieja
    for (int i = 0; i < n; ++i) {
        acc += h_[size_t(i)] * buf_[size_t(idx)];
        if (++idx == n) idx = 0;
    }
    return acc;
}

// --- Motor ---

Engine::Engine() : dec1_(31), dec2_(63) {}

void Engine::prepare(double sampleRate)
{
    sr_ = sampleRate;
    osr_ = sampleRate * kOversample;
    for (int i = 0; i < NumParams; i++)
        p_[i] = paramInfo(i).def;
    reset();
    updateTimes();
    controlUpdate();
    for (int i = 0; i < 4; ++i) gain_[i] = gainTarget_[i];
    outGain_ = p_[Volume];
}

void Engine::reset()
{
    heldCount_ = 0;
    gate_ = false;
    played_ = false;
    note_ = targetNote_ = 60;
    bend_ = modExt_ = 0.f;
    ladder_.reset();
    fEnv_ = Contour(); lEnv_ = Contour();
    dec1_.reset(); dec2_.reset();
    dcX_ = dcY_ = 0.f;
    for (auto& d : drift_) d = 0.f;
    ctrlCount_ = 0;
}

void Engine::updateTimes()
{
    fAtk_ = coefFor(attackSeconds(p_[FAtk]) / std::log(kAttackTarget / (kAttackTarget - 1.f)), osr_);
    fDec_ = coefFor(decaySeconds(p_[FDec]) / 3.0, osr_);
    lAtk_ = coefFor(attackSeconds(p_[LAtk]) / std::log(kAttackTarget / (kAttackTarget - 1.f)), osr_);
    lDec_ = coefFor(decaySeconds(p_[LDec]) / 3.0, osr_);
    // Con el interruptor Decay la liberacion dura lo que el decaimiento; sin el, el sonido corta casi de golpe
    fRelOn_ = fDec_;
    lRelOn_ = lDec_;
    relFast_ = coefFor(0.012 / 3.0, osr_);
}

void Engine::setParam(int id, float value)
{
    if (id < 0 || id >= NumParams || !(value == value))
        return;
    const ParamInfo& info = paramInfo(id);
    if (info.choices)
        p_[id] = std::round(std::min(float(info.choices - 1), std::max(0.f, value)));
    else
        p_[id] = std::min(1.f, std::max(0.f, value));
    if (id == FAtk || id == FDec || id == LAtk || id == LDec)
        updateTimes();
}

void Engine::loadPreset(int index)
{
    const auto& list = presets();
    if (index < 0 || index >= int(list.size()))
        return;
    allNotesOff();
    for (int i = 0; i < NumParams; i++)
        setParam(i, paramInfo(i).def);
    for (const auto& pv : list[size_t(index)].values)
        setParam(pv.id, pv.value);
}

// --- Notas (monofonico, ultima nota, legato) ---

void Engine::noteOn(int note, float velocity)
{
    // Si la nota ya estaba apretada, se saca de la pila y vuelve al final
    int w = 0;
    for (int i = 0; i < heldCount_; ++i)
        if (held_[i] != note) held_[w++] = held_[i];
    heldCount_ = w;
    if (heldCount_ < 32) held_[heldCount_++] = note;
    targetNote_ = note;
    // La primera nota despues de arrancar suena en su altura (no se desliza desde el Do central)
    if (!played_) {
        played_ = true;
        note_ = targetNote_;
    }
    vel_ = std::min(1.f, std::max(0.f, velocity));
    // Solo un gate nuevo dispara los contornos: tocar ligado no los reinicia (como en el original)
    if (!gate_) {
        gate_ = true;
        fEnv_.gateOn();
        lEnv_.gateOn();
        if (p_[GlideOn] < 1.f) note_ = targetNote_;
    }
    if (p_[GlideOn] < 1.f)
        note_ = targetNote_;
}

void Engine::noteOff(int note)
{
    int w = 0;
    for (int i = 0; i < heldCount_; ++i)
        if (held_[i] != note) held_[w++] = held_[i];
    heldCount_ = w;
    if (heldCount_ > 0) {
        targetNote_ = held_[heldCount_ - 1];   // vuelve a la nota anterior, ligado
        if (p_[GlideOn] < 1.f) note_ = targetNote_;
    } else if (gate_) {
        gate_ = false;
        fEnv_.gateOff();
        lEnv_.gateOff();
    }
}

void Engine::allNotesOff()
{
    heldCount_ = 0;
    if (gate_) {
        gate_ = false;
        fEnv_.gateOff();
        lEnv_.gateOff();
    }
}

void Engine::setBend(float norm) { bend_ = std::min(1.f, std::max(-1.f, norm)); }
void Engine::setModWheelExt(float norm) { modExt_ = std::min(1.f, std::max(0.f, norm)); }

// --- Audio ---

float Engine::noise(bool pink)
{
    rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
    const float white = float(rng_) * (2.f / 4294967296.f) - 1.f;
    if (!pink)
        return white * 0.85f;
    // Ruido rosa (-3 dB/oct): filtro de Paul Kellet
    pink_[0] = 0.99765f * pink_[0] + white * 0.0990460f;
    pink_[1] = 0.96300f * pink_[1] + white * 0.2965164f;
    pink_[2] = 0.57000f * pink_[2] + white * 1.0526913f;
    return (pink_[0] + pink_[1] + pink_[2] + white * 0.1848f) * 0.32f;
}

float Engine::oscSample(int i, double dt)
{
    static const int kWaveParam[3] = { Osc1Wave, Osc2Wave, Osc3Wave };
    double& ph = phase_[i];
    ph += dt;
    ph -= std::floor(ph);
    return waveform(int(p_[kWaveParam[i]]), ph, dt);
}

void Engine::controlUpdate()
{
    const double ctrlDt = double(kCtrl) / osr_;

    // Glide: la altura se acerca a la nota exponencialmente
    if (p_[GlideOn] >= 1.f) {
        const double tc = 0.004 + double(p_[Glide]) * double(p_[Glide]) * 2.5;
        note_ += (targetNote_ - note_) * (1.0 - std::exp(-ctrlDt / tc));
    } else {
        note_ = targetNote_;
    }

    // Deriva lenta de la afinacion: cada ~20 ms un destino nuevo (+-1.5 cents) al que se acerca de a poco
    if (++driftCount_ >= 400) {
        driftCount_ = 0;
        for (int i = 0; i < 3; ++i) {
            rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
            driftTarget_[i] = (float(rng_) * (1.f / 4294967296.f) - 0.5f) * driftAmount_;
        }
    }
    for (int i = 0; i < 3; ++i)
        drift_[i] += (driftTarget_[i] - drift_[i]) * 0.003f;

    // Frecuencias base de cada oscilador
    static const int kRangeParam[3] = { Osc1Range, Osc2Range, Osc3Range };
    const double tuneCents = (double(p_[Tune]) - 0.5) * 200.0;
    for (int i = 0; i < 3; ++i) {
        const int range = int(p_[kRangeParam[i]]);   // 0 LO, 1 32', 2 16', 3 8', 4 4', 5 2'
        double semis = 0.0;
        if (i == 1) semis += (double(p_[Osc2Tune]) - 0.5) * 14.0;
        if (i == 2) semis += (double(p_[Osc3Tune]) - 0.5) * 14.0;
        const bool follows = i < 2 || p_[Osc3Kbd] >= 1.f;
        double f;
        if (range == 0) {
            // LO: oscilador lento. Libre (el osc 3 sin teclado) es un LFO de 0.3 a 54 Hz; con teclado, 6 octavas por debajo
            if (!follows) f = 0.3 * std::pow(2.0, double(p_[Osc3Tune]) * 7.5);
            else f = 440.0 * std::pow(2.0, (note_ - 69.0 - 72.0 + semis) / 12.0);
        } else {
            const double oct = double(range - 3);   // 8' = 0 ; 32' = -2 ; 2' = +2
            const double base = follows ? note_ : 60.0;
            f = 440.0 * std::pow(2.0, (base - 69.0 + 12.0 * oct + semis) / 12.0);
        }
        baseFreq_[i] = f * std::pow(2.0, (tuneCents + double(drift_[i])) / 1200.0);
    }

    // Mezclador (con las perillas en curva de audio)
    static const int kVol[4] = { Vol1, Vol2, Vol3, VolNoise };
    static const int kOn[4] = { Osc1On, Osc2On, Osc3On, NoiseOn };
    for (int i = 0; i < 4; ++i)
        gainTarget_[i] = p_[kOn[i]] >= 1.f ? std::pow(p_[kVol[i]], 1.6f) : 0.f;
    for (int i = 0; i < 4; ++i)
        gain_[i] += (gainTarget_[i] - gain_[i]) * 0.02f;   // sin clicks al prender y apagar

    // Filtro: la frecuencia base y el seguimiento de teclado (1/3 + 1/3)
    const float kbd = (p_[Kbd1] >= 1.f ? 1.f / 3.f : 0.f) + (p_[Kbd2] >= 1.f ? 1.f / 3.f : 0.f);
    cutoffCents_ = float((double(p_[Cutoff]) * 10.0) * 1200.0)                       // 16 Hz .. 16 kHz
                 + float((note_ - 60.0) * 100.0 * double(kbd))
                 - (1.f - vel_) * p_[Velocity] * 2400.f;
    resK_ = p_[Emphasis] * 4.1f;
    outGain_ += (p_[Volume] - outGain_) * 0.02f;
}

float Engine::processOne()
{
    if (ctrlCount_ == 0)
        controlUpdate();
    if (++ctrlCount_ >= kCtrl)
        ctrlCount_ = 0;

    // Modulacion: el osc 3 (o ruido) mueve el tono y/o el filtro; la cantidad la da la rueda
    const float wheel = std::min(1.f, p_[ModWheel] + modExt_);
    const float modSrc = (1.f - p_[ModMix]) * osc3Value_ + p_[ModMix] * noise(false);
    const float modAmt = modSrc * wheel;
    const double pitchCents = double(bend_) * 200.0 + (p_[OscMod] >= 1.f ? double(modAmt) * 600.0 : 0.0);
    const double pitchMul = std::exp2(pitchCents / 1200.0);

    // Osciladores
    float o[3];
    for (int i = 0; i < 3; ++i) {
        // El osc 3 no se modula a si mismo
        const double f = baseFreq_[i] * (i < 2 ? pitchMul : std::exp2(double(bend_) * 200.0 / 1200.0));
        const double dt = std::min(0.45, f / osr_);
        o[i] = oscSample(i, dt);
    }
    osc3Value_ = o[2];

    // Mezclador: la suma satura el filtro (el "overload" del original)
    const bool pink = p_[NoiseType] >= 1.f;
    const float nz = gain_[3] > 1e-4f ? noise(pink) : 0.f;
    float mix = (o[0] * gain_[0] + o[1] * gain_[1] + o[2] * gain_[2] + nz * gain_[3]) * 0.55f;

    // Filtro
    if ((ctrlCount_ & 3) == 0) {
        const float fe = fEnv_.level;
        float cents = cutoffCents_ + fe * p_[ContourAmt] * 6000.f;
        if (p_[FiltMod] >= 1.f)
            cents += modAmt * 3600.f;
        const double fc = std::min(20000.0, 16.0 * std::pow(2.0, double(cents) / 1200.0));
        ladder_.setCutoff(fc, osr_);
    }
    float y = ladder_.process(mix, resK_);
    // Con mucha resonancia la escalera pierde cuerpo (como la real); se compensa un poco
    y *= 1.f + 0.35f * resK_;

    // Contornos y VCA
    const bool dec = p_[DecayOn] >= 1.f;
    const float fenv = fEnv_.step(fAtk_, fDec_, p_[FSus], dec ? fRelOn_ : relFast_);
    (void) fenv;
    const float lenv = lEnv_.step(lAtk_, lDec_, p_[LSus], dec ? lRelOn_ : relFast_);
    const float velGain = 1.f - p_[Velocity] * (1.f - vel_);
    float out = y * lenv * velGain * outGain_ * 1.6f;

    if (p_[A440] >= 1.f) {
        tonePhase_ += 440.0 / osr_;
        tonePhase_ -= std::floor(tonePhase_);
        out += 0.12f * float(std::sin(2.0 * kPi * tonePhase_));
    }
    return out;
}

void Engine::process(float* left, float* right, int n)
{
    for (int i = 0; i < n; ++i) {
        for (int k = 0; k < kOversample; ++k)
            stage_[k] = processOne();
        const float a = dec1_.process(stage_[0], stage_[1]);
        const float b = dec1_.process(stage_[2], stage_[3]);
        float s = dec2_.process(a, b);
        // Bloqueo de continua y limitador suave (transparente hasta 0.85)
        const float x = s;
        s = x - dcX_ + 0.9995f * dcY_;
        dcX_ = x; dcY_ = s;
        const float m = std::fabs(s);
        if (m > 0.85f)
            s = std::copysign(0.85f + 0.15f * std::tanh((m - 0.85f) / 0.15f), s);
        left[i] = right[i] = s;
    }
}

} // namespace md
