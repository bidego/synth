#include "ac_engine.h"
#include <algorithm>
#include <cmath>

namespace ac {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr int kCtrl = 8;

inline float polyBlep(double t, double dt)
{
    if (t < dt) { t /= dt; return float(t + t - t * t - 1.0); }
    if (t > 1.0 - dt) { t = (t - 1.0) / dt; return float(t * t + t + t + 1.0); }
    return 0.f;
}

inline float coefFor(double seconds, double sr)
{
    return float(1.0 - std::exp(-1.0 / (std::max(seconds, 1e-5) * sr)));
}

} // namespace

// --- Filtro ---

void Ladder3::setCutoff(double fc, double fs)
{
    const double g = std::tan(kPi * std::min(fc, 0.45 * fs) / fs);
    G = float(g / (1.0 + g));
}

float Ladder3::process(float x, float k)
{
    const float G2 = G * G, G4 = G2 * G2, a = 1.f - G;
    const float S = a * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
    float in = (x - k * S) / (1.f + k * G4);
    float y3 = 0.f;
    for (int i = 0; i < 4; ++i) {
        const float v = G * (std::tanh(in) - z[i]);
        const float y = v + z[i];
        z[i] = y + v;
        in = y;
        if (i == 2) y3 = y;
    }
    return y3;
}

// --- Decimador ---

Decimator2::Decimator2(int taps)
{
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

void Decimator2::reset() { std::fill(buf_.begin(), buf_.end(), 0.f); pos_ = 0; }

float Decimator2::process(float a, float b)
{
    const int n = int(h_.size());
    buf_[size_t(pos_)] = a; pos_ = (pos_ + 1) % n;
    buf_[size_t(pos_)] = b; pos_ = (pos_ + 1) % n;
    float acc = 0.f;
    int idx = pos_;
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
    attackCoef_ = coefFor(0.0015 / 3.0, osr_);
    releaseCoef_ = coefFor(0.012 / 3.0, osr_);
    controlUpdate();
    outGain_ = p_[Volume];
}

void Engine::reset()
{
    heldCount_ = 0;
    gate_ = false;
    played_ = false;
    sliding_ = false;
    note_ = targetNote_ = 48;
    accent_ = accentTarget_ = 0.f;
    bend_ = 0.f;
    filtEnv_ = ampEnv_ = 0.f;
    ladder_.reset();
    dec1_.reset(); dec2_.reset();
    dcX_ = dcY_ = 0.f;
    drift_ = driftTarget_ = 0.f;
    ctrlCount_ = 0;
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

// --- Notas: monofonico; una nota que empieza con otra todavia apretada es un slide (sin reiniciar la envolvente) ---

void Engine::noteOn(int note, float velocity)
{
    int w = 0;
    for (int i = 0; i < heldCount_; ++i)
        if (held_[i] != note) held_[w++] = held_[i];
    heldCount_ = w;
    if (heldCount_ < 32) held_[heldCount_++] = note;
    targetNote_ = note;
    if (!played_) { played_ = true; note_ = targetNote_; }
    accentTarget_ = velocity >= p_[AccentVel] ? 1.f : 0.f;
    if (!gate_) {
        gate_ = true;
        sliding_ = false;
        note_ = targetNote_;     // una nota nueva no se desliza: solo lo hacen las ligadas
        filtEnv_ = 1.f;          // dispara el barrido del filtro
    } else {
        sliding_ = true;         // ligada: slide, sin disparar de nuevo
    }
}

void Engine::noteOff(int note)
{
    int w = 0;
    for (int i = 0; i < heldCount_; ++i)
        if (held_[i] != note) held_[w++] = held_[i];
    heldCount_ = w;
    if (heldCount_ > 0) {
        targetNote_ = held_[heldCount_ - 1];
        sliding_ = true;
    } else {
        gate_ = false;
    }
}

void Engine::allNotesOff()
{
    heldCount_ = 0;
    gate_ = false;
}

// --- Audio ---

void Engine::controlUpdate()
{
    const double ctrlDt = double(kCtrl) / osr_;
    // Slide: la altura se acerca a la nota en un tiempo corto
    if (sliding_) {
        const double tc = 0.006 + double(p_[SlideTime]) * 0.09;
        note_ += (targetNote_ - note_) * (1.0 - std::exp(-ctrlDt / tc));
        if (std::fabs(targetNote_ - note_) < 0.001) { note_ = targetNote_; sliding_ = false; }
    } else {
        note_ = targetNote_;
    }
    if (++driftCount_ >= 400) {
        driftCount_ = 0;
        rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
        driftTarget_ = (float(rng_) * (1.f / 4294967296.f) - 0.5f) * driftAmount_;
    }
    drift_ += (driftTarget_ - drift_) * 0.003f;
    accent_ += (accentTarget_ - accent_) * 0.01f;

    // Con acento el decaimiento es corto y fijo (~0.2 s); sin el, el de la perilla (0.2 a 2.5 s)
    const double userDecay = 0.2 * std::pow(12.5, double(p_[Decay]));
    const double decay = userDecay + (0.2 - userDecay) * double(accent_) * double(p_[Accent]);
    decayCoef_ = coefFor(decay / 3.0, osr_);

    freq_ = 440.0 * std::pow(2.0, (note_ - 69.0 + (double(p_[Tune]) - 0.5) * 2.0 + double(bend_) * 2.0 + double(drift_) / 100.0) / 12.0);
    cutoffBase_ = float(std::log2(40.0) * 1200.0 + double(p_[Cutoff]) * 8.0 * 1200.0);    // 40 Hz .. 10 kHz
    resK_ = p_[Resonance] * 3.7f + accent_ * p_[Accent] * 0.25f;
    outGain_ += (p_[Volume] - outGain_) * 0.02f;
}

float Engine::processOne()
{
    if (ctrlCount_ == 0)
        controlUpdate();
    if (++ctrlCount_ >= kCtrl)
        ctrlCount_ = 0;

    // Oscilador
    const double dt = std::min(0.45, freq_ / osr_);
    phase_ += dt;
    phase_ -= std::floor(phase_);
    float osc;
    if (p_[Waveform] < 1.f) {
        osc = float(2.0 * phase_ - 1.0) - polyBlep(phase_, dt);
    } else {
        float v = phase_ < 0.5 ? 1.f : -1.f;
        v += polyBlep(phase_, dt);
        double q = phase_ + 0.5; q -= std::floor(q);
        v -= polyBlep(q, dt);
        osc = v;
    }

    // Envolventes
    filtEnv_ -= filtEnv_ * decayCoef_;
    const float target = gate_ ? 1.f : 0.f;
    ampEnv_ += (target - ampEnv_) * (gate_ ? attackCoef_ : releaseCoef_);

    // Filtro: el barrido (mas profundo con acento) empuja el corte hacia arriba
    if ((ctrlCount_ & 3) == 0) {
        const float depth = p_[EnvMod] * (1.f + accent_ * p_[Accent] * 0.9f);
        const float cents = cutoffBase_ + filtEnv_ * depth * 6000.f;
        ladder_.setCutoff(std::min(20000.0, std::pow(2.0, double(cents) / 1200.0)), osr_);
    }
    float y = ladder_.process(osc * 0.6f, resK_);
    // Con mucha resonancia se pierden graves (como el original); se compensa en parte
    y *= 1.f + 0.4f * resK_;

    const float acc = 1.f + accent_ * p_[Accent] * 0.8f;
    y *= ampEnv_ * acc;

    // Overdrive
    if (p_[Drive] > 0.001f) {
        const float d = 1.f + p_[Drive] * 8.f;
        y = std::tanh(y * d) / std::sqrt(d);
    }
    return y * outGain_ * 0.7f;
}

void Engine::process(float* left, float* right, int n)
{
    for (int i = 0; i < n; ++i) {
        for (int k = 0; k < kOversample; ++k)
            stage_[k] = processOne();
        const float a = dec1_.process(stage_[0], stage_[1]);
        const float b = dec1_.process(stage_[2], stage_[3]);
        float s = dec2_.process(a, b);
        const float x = s;
        s = x - dcX_ + 0.9995f * dcY_;
        dcX_ = x; dcY_ = s;
        const float m = std::fabs(s);
        if (m > 0.85f)
            s = std::copysign(0.85f + 0.15f * std::tanh((m - 0.85f) / 0.15f), s);
        left[i] = right[i] = s;
    }
}

} // namespace ac
