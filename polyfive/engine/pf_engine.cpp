#include "pf_engine.h"
#include <algorithm>
#include <cmath>

namespace pf {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr float kAttackTarget = 1.3f;
constexpr int kCtrl = 8;
const float kUnisonSpread[kVoices] = { -12.f, -6.f, 0.f, 6.f, 12.f };

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

inline double attackSeconds(float x) { return 0.001 * std::pow(10000.0, double(x)); }   // 1 ms - 10 s
inline double slowSeconds(float x) { return 0.002 * std::pow(5000.0, double(x)); }      // 2 ms - 10 s

inline float pulseWave(double t, double dt, double duty)
{
    float v = t < duty ? 1.f : -1.f;
    v += polyBlep(t, dt);
    double q = t + 1.0 - duty; q -= std::floor(q);
    v -= polyBlep(q, dt);
    return v - float(2.0 * duty - 1.0);   // sin continua
}

} // namespace

// --- Filtro ---

void Ladder::setCutoff(double fc, double fs)
{
    const double g = std::tan(kPi * std::min(fc, 0.45 * fs) / fs);
    G = float(g / (1.0 + g));
}

float Ladder::process(float x, float k)
{
    const float G2 = G * G, G4 = G2 * G2, a = 1.f - G;
    const float S = a * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
    float in = (x - k * S) / (1.f + k * G4);
    for (int i = 0; i < 4; ++i) {
        const float v = G * (fastTanh(in) - z[i]);
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
    // Los coeficientes de posicion par (salvo el central) son ceros exactos en una media banda: se saltean
    for (int i = 0; i < n; ++i)
        if (std::fabs(h_[size_t(i)]) > 1e-9f) taps_.push_back(i);
}

void Decimator2::reset() { std::fill(buf_.begin(), buf_.end(), 0.f); pos_ = 0; }

float Decimator2::process(float a, float b)
{
    const int n = int(h_.size());
    buf_[size_t(pos_)] = a; pos_ = (pos_ + 1) % n;
    buf_[size_t(pos_)] = b; pos_ = (pos_ + 1) % n;
    float acc = 0.f;
    for (int i : taps_) {
        int idx = pos_ + i;
        if (idx >= n) idx -= n;
        acc += h_[size_t(i)] * buf_[size_t(idx)];
    }
    return acc;
}

// --- Motor ---

Engine::Engine() : dec_(63) {}

void Engine::prepare(double sampleRate)
{
    sr_ = sampleRate;
    osr_ = sampleRate * kOversample;
    for (int i = 0; i < NumParams; i++)
        p_[i] = paramInfo(i).def;
    reset();
    updateTimes();
    controlUpdate();
    for (int i = 0; i < 3; ++i) gain_[i] = gainTarget_[i];
    outGain_ = p_[Volume];
}

void Engine::reset()
{
    for (auto& v : voices_) v = Voice();
    counter_ = 0;
    nextVoice_ = 0;
    stackSize_ = 0;
    played_ = false;
    lastNote_ = 60;
    bend_ = modExt_ = 0.f;
    lfoPhase_ = 0.0;
    lfoValue_ = noiseHeld_ = 0.f;
    dec_.reset();
    dcX_ = dcY_ = 0.f;
    ctrlCount_ = 0;
    driftCount_ = 0;
}

void Engine::updateTimes()
{
    const double k = std::log(double(kAttackTarget) / (double(kAttackTarget) - 1.0));
    fAtk_ = coefFor(attackSeconds(p_[FAtk]) / k, osr_);
    fDec_ = coefFor(slowSeconds(p_[FDec]) / 3.0, osr_);
    fRel_ = coefFor(slowSeconds(p_[FRel]) / 3.0, osr_);
    aAtk_ = coefFor(attackSeconds(p_[AAtk]) / k, osr_);
    aDec_ = coefFor(slowSeconds(p_[ADec]) / 3.0, osr_);
    aRel_ = coefFor(slowSeconds(p_[ARel]) / 3.0, osr_);
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
    if (id >= FAtk && id <= ARel)
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

int Engine::activeVoices() const
{
    int n = 0;
    for (const auto& v : voices_) if (v.active()) n++;
    return n;
}

// --- Notas ---

void Engine::beginNote(Voice& v, int note, float vel, float detune, float gain)
{
    v.note = note;
    v.vel = vel;
    v.held = true;
    v.order = ++counter_;
    v.noteTarget = note;
    v.noteNow = (p_[GlideOn] >= 1.f && played_) ? lastNote_ : double(note);
    lastNote_ = note;
    played_ = true;
    v.detune = detune;
    v.outGain = gain;
    v.pending = false;
    v.stealing = false;
    v.stealGain = 1.f;
    if (!v.active()) {
        v.ladder.reset();
        v.fenv.level = 0.f;
        v.aenv.level = 0.f;
    }
    v.fenv.gateOn();
    v.aenv.gateOn();
}

void Engine::startVoice(Voice& v, int note, float vel, float detune, float gain)
{
    // Una voz que todavia suena con otra nota se apaga en unos milisegundos antes de arrancar la nueva (sin clicks)
    if (v.active() && v.aenv.level > 0.02f && v.note != note) {
        v.pending = true; v.pNote = note; v.pVel = vel; v.pDetune = detune; v.pGain = gain;
        v.stealing = true;
        v.held = false;
        return;
    }
    beginNote(v, note, vel, detune, gain);
}

Voice* Engine::allocate()
{
    for (int i = 0; i < kVoices; i++) {
        Voice& v = voices_[(nextVoice_ + i) % kVoices];
        if (!v.active() && !v.pending)
            return &v;
    }
    Voice* best = nullptr;
    for (auto& v : voices_)
        if (!v.held && (!best || v.order < best->order))
            best = &v;
    if (best) return best;
    for (auto& v : voices_)
        if (!best || v.order < best->order)
            best = &v;
    return best;
}

void Engine::noteOn(int note, float velocity)
{
    velocity = std::min(1.f, std::max(0.f, velocity));
    if (p_[Unison] >= 1.f) {
        int w = 0;
        for (int i = 0; i < stackSize_; i++)
            if (stack_[i] != note) { stack_[w] = stack_[i]; stackVel_[w] = stackVel_[i]; w++; }
        stackSize_ = w;
        if (stackSize_ < 16) { stack_[stackSize_] = note; stackVel_[stackSize_] = velocity; stackSize_++; }
        for (int i = 0; i < kVoices; i++)
            startVoice(voices_[i], note, velocity, kUnisonSpread[i], 0.5f);
        return;
    }
    Voice* v = nullptr;
    for (auto& c : voices_)
        if (c.note == note && c.held) { v = &c; break; }
    if (!v) {
        v = allocate();
        nextVoice_ = int(v - voices_ + 1) % kVoices;
    }
    startVoice(*v, note, velocity, 0.f, 1.f);
}

void Engine::noteOff(int note)
{
    if (p_[Unison] >= 1.f) {
        const bool wasTop = stackSize_ > 0 && stack_[stackSize_ - 1] == note;
        int w = 0;
        for (int i = 0; i < stackSize_; i++)
            if (stack_[i] != note) { stack_[w] = stack_[i]; stackVel_[w] = stackVel_[i]; w++; }
        stackSize_ = w;
        if (!wasTop)
            return;
        if (stackSize_ > 0) {
            for (int i = 0; i < kVoices; i++)
                startVoice(voices_[i], stack_[stackSize_ - 1], stackVel_[stackSize_ - 1], kUnisonSpread[i], 0.5f);
        } else {
            for (auto& v : voices_) if (v.held) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); }
        }
        return;
    }
    for (auto& v : voices_)
        if (v.held && v.note == note) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); }
}

void Engine::allNotesOff()
{
    stackSize_ = 0;
    for (auto& v : voices_) {
        v.pending = false;
        v.stealing = false;
        if (v.held || v.active()) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); }
    }
}

// --- Audio ---

float Engine::noise()
{
    rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
    return float(rng_) * (2.f / 4294967296.f) - 1.f;
}

void Engine::controlUpdate()
{
    const double ctrlDt = double(kCtrl) / osr_;

    // LFO
    const double lfoHz = 0.1 * std::pow(300.0, double(p_[LfoFreq]));
    lfoPhase_ += lfoHz * ctrlDt;
    lfoPhase_ -= std::floor(lfoPhase_);
    const int shape = int(p_[LfoShape]);
    lfoValue_ = shape == 0 ? float(lfoPhase_ < 0.5 ? 4.0 * lfoPhase_ - 1.0 : 3.0 - 4.0 * lfoPhase_)
              : shape == 1 ? float(1.0 - 2.0 * lfoPhase_) : (lfoPhase_ < 0.5 ? 1.f : -1.f);
    if (p_[WmMix] > 0.001f)
        noiseHeld_ = noise();
    wheelSrc_ = (1.f - p_[WmMix]) * lfoValue_ + p_[WmMix] * noiseHeld_;
    wheelAmt_ = std::min(1.f, p_[LfoAmt] + p_[ModWheel] + modExt_) * wheelSrc_;

    // Deriva lenta de la afinacion de cada voz
    if (++driftCount_ >= 400) {
        driftCount_ = 0;
        for (auto& v : voices_)
            v.driftTarget = (noise() * 0.5f) * driftAmount_;
    }

    // Mezclador
    static const int kMix[3] = { MixA, MixB, MixNoise };
    for (int i = 0; i < 3; ++i) {
        gainTarget_[i] = std::pow(p_[kMix[i]], 1.6f);
        gain_[i] += (gainTarget_[i] - gain_[i]) * 0.02f;
    }
    resK_ = p_[Resonance] * 4.1f;
    outGain_ += (p_[Volume] - outGain_) * 0.02f;

    const double glideTc = 0.004 + double(p_[Glide]) * double(p_[Glide]) * 2.5;
    const double tuneCents = (double(p_[Tune]) - 0.5) * 200.0;
    const int octA = int(p_[AOct]) - 2, octB = int(p_[BOct]) - 2;
    const float kbd = p_[KbdTrack] < 0.5f ? 0.f : p_[KbdTrack] < 1.5f ? 0.5f : 1.f;
    const double fineA = (double(p_[ATune]) - 0.5) * 2.0;
    const double semisB = (double(p_[BFreq]) - 0.5) * 24.0 + (double(p_[BFine]) - 0.5) * 2.0;

    for (auto& v : voices_) {
        if (!v.active() && !v.pending)
            continue;
        if (p_[GlideOn] >= 1.f)
            v.noteNow += (v.noteTarget - v.noteNow) * (1.0 - std::exp(-ctrlDt / glideTc));
        else
            v.noteNow = v.noteTarget;
        v.drift += (v.driftTarget - v.drift) * 0.003f;

        const double cents = tuneCents + double(v.drift) + double(v.detune) + double(bend_) * 200.0;
        const double noteSemis = v.noteNow + cents / 100.0;
        v.baseFreqA = 440.0 * std::pow(2.0, (noteSemis - 69.0 + 12.0 * octA + fineA) / 12.0);
        if (p_[BLow] >= 1.f) {
            if (p_[BKbd] < 1.f) v.baseFreqB = 0.2 * std::pow(2.0, double(p_[BFreq]) * 8.0);
            else v.baseFreqB = 440.0 * std::pow(2.0, (noteSemis - 69.0 - 72.0 + semisB) / 12.0);
        } else {
            const double base = p_[BKbd] >= 1.f ? noteSemis : 60.0 + cents / 100.0;
            v.baseFreqB = 440.0 * std::pow(2.0, (base - 69.0 + 12.0 * octB + semisB) / 12.0);
        }

        // Rueda: frecuencia / ancho de pulso / filtro
        v.centsA = p_[WmFreqA] >= 1.f ? wheelAmt_ * 700.f : 0.f;
        v.centsB = p_[WmFreqB] >= 1.f ? wheelAmt_ * 700.f : 0.f;
        v.pwModA = p_[WmPwA] >= 1.f ? wheelAmt_ * 0.4f : 0.f;
        v.pwModB = p_[WmPwB] >= 1.f ? wheelAmt_ * 0.4f : 0.f;
        v.wheelCutoff = p_[WmFilter] >= 1.f ? wheelAmt_ * 3600.f : 0.f;
        v.cutoffCents = float(std::log2(20.0) * 1200.0) + p_[Cutoff] * 10.f * 1200.f + float((v.noteNow - 60.0) * 100.0) * kbd - (1.f - v.vel) * p_[Velocity] * 2400.f;
    }
}

float Engine::processOne()
{
    if (ctrlCount_ == 0)
        controlUpdate();
    if (++ctrlCount_ >= kCtrl)
        ctrlCount_ = 0;

    const bool sync = p_[Sync] >= 1.f;
    const bool pmFreq = p_[PmFreqA] >= 1.f, pmPw = p_[PmPwA] >= 1.f, pmFilt = p_[PmFilter] >= 1.f;
    const float pmEnv = p_[PmEnv], pmB = p_[PmB];
    const float envAmt = p_[EnvAmt];
    const float nz = gain_[2] > 1e-4f ? noise() * gain_[2] : 0.f;
    float sum = 0.f;

    for (auto& v : voices_) {
        if (!v.active() && !v.pending)
            continue;
        // Voz robada: se apaga rapido y recien despues arranca la nota nueva
        if (v.stealing) {
            v.stealGain -= 1.f / float(0.003 * osr_);
            if (v.stealGain <= 0.f) {
                v.aenv.kill(); v.fenv.kill();
                beginNote(v, v.pNote, v.pVel, v.pDetune, v.pGain);
            }
        }
        const float fe = v.fenv.step(fAtk_, fDec_, p_[FSus], fRel_);
        const float ae = v.aenv.step(aAtk_, aDec_, p_[ASus], aRel_);

        // Oscilador B (primero: A y el filtro pueden usar su salida)
        double fB = v.baseFreqB * (v.centsB != 0.f ? std::exp2(double(v.centsB) / 1200.0) : 1.0);
        const double dtB = std::min(0.45, fB / osr_);
        v.phaseB += dtB;
        bool wrapped = false;
        double fracB = 0.0;
        if (v.phaseB >= 1.0) {
            v.phaseB -= 1.0;
            wrapped = true;
            fracB = dtB > 0 ? v.phaseB / dtB : 0.0;
        }
        const double dutyB = std::min(0.95, std::max(0.05, 0.5 + (double(p_[BPw]) - 0.5) * 0.9 + double(v.pwModB)));
        float b = 0.f;
        if (p_[BSaw] >= 1.f) b += float(2.0 * v.phaseB - 1.0) - polyBlep(v.phaseB, dtB);
        if (p_[BTri] >= 1.f) b += float(v.phaseB < 0.5 ? 4.0 * v.phaseB - 1.0 : 3.0 - 4.0 * v.phaseB);
        if (p_[BPulse] >= 1.f) b += pulseWave(v.phaseB, dtB, dutyB);

        // Oscilador A: poly-mod (envolvente del filtro y B) a frecuencia y ancho de pulso
        float centsA = v.centsA;
        if (pmFreq) centsA += pmEnv * fe * 2400.f + pmB * v.bPrev * 1200.f;
        const double fA = v.baseFreqA * (centsA != 0.f ? std::exp2(double(centsA) / 1200.0) : 1.0);
        const double dtA = std::min(0.45, fA / osr_);
        double pwA = 0.5 + (double(p_[APw]) - 0.5) * 0.9 + double(v.pwModA);
        if (pmPw) pwA += double(pmEnv * fe * 0.4f + pmB * v.bPrev * 0.4f);
        pwA = std::min(0.95, std::max(0.05, pwA));
        v.phaseA += dtA;
        v.phaseA -= std::floor(v.phaseA);
        float jump = 0.f;
        if (sync && wrapped) {
            // A se reinicia con B; el salto se suaviza con la fraccion de muestra en que ocurrio (band-limiting basico)
            double before = v.phaseA, after = fracB * dtA;
            float vb = 0.f, va = 0.f;
            if (p_[ASaw] >= 1.f) { vb += float(2.0 * before - 1.0); va += float(2.0 * after - 1.0); }
            if (p_[APulse] >= 1.f) { vb += before < pwA ? 1.f : -1.f; va += after < pwA ? 1.f : -1.f; }
            jump = (vb - va) * float(1.0 - fracB);
            v.phaseA = after;
        }
        float a = 0.f;
        if (p_[ASaw] >= 1.f) a += float(2.0 * v.phaseA - 1.0) - polyBlep(v.phaseA, dtA);
        if (p_[APulse] >= 1.f) a += pulseWave(v.phaseA, dtA, pwA);
        a += jump;
        v.bPrev = b;

        // Mezclador y filtro
        const float mix = (a * gain_[0] + b * gain_[1] + nz) * 0.3f;
        float cents = v.cutoffCents + fe * envAmt * 6000.f + v.wheelCutoff;
        if (pmFilt) cents += pmEnv * fe * 4800.f + pmB * b * 3600.f;
        if ((ctrlCount_ & 1) == 0)
            v.ladder.setCutoff(std::min(20000.0, std::pow(2.0, double(cents) / 1200.0)), osr_);
        float y = v.ladder.process(mix, resK_);
        y *= 1.f + 0.35f * resK_;
        const float velGain = 1.f - p_[Velocity] * (1.f - v.vel);
        sum += y * ae * velGain * v.outGain * (v.stealing ? v.stealGain : 1.f);
    }
    return sum * outGain_ * 1.6f;
}

void Engine::process(float* left, float* right, int n)
{
    for (int i = 0; i < n; ++i) {
        for (int k = 0; k < kOversample; ++k)
            stage_[k] = processOne();
        float s = dec_.process(stage_[0], stage_[1]);
        const float x = s;
        s = x - dcX_ + 0.9995f * dcY_;
        dcX_ = x; dcY_ = s;
        const float m = std::fabs(s);
        if (m > 0.85f)
            s = std::copysign(0.85f + 0.15f * fastTanh((m - 0.85f) / 0.15f), s);
        left[i] = right[i] = s;
    }
}

} // namespace pf
