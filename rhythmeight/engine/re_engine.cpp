#include "re_engine.h"
#include <cmath>

namespace re {

static const double kPi = 3.14159265358979323846;
static const double kTwoPi = 2.0 * kPi;

// Frecuencias de las seis cuadradas del banco metalico (platillo y hi-hats)
static const double kMetal[6] = { 205.3, 304.4, 369.6, 522.7, 540.0, 800.0 };
// Panorama de cada instrumento (-1 izquierda, 1 derecha)
static const double kPan[kInst] = { 0.0, 0.05, -0.3, 0.0, 0.3, 0.15, -0.15, 0.1, -0.2, 0.2, 0.35, -0.25, 0.25 };
static const int kLevelId[kInst] = { BdLevel, SdLevel, LtLevel, MtLevel, HtLevel, RsLevel, ClLevel, CpLevel, MaLevel, CbLevel, CyLevel, OhLevel, ChLevel };
static const double kTomBase[3] = { 82.0, 123.0, 164.0 };
static const double kTomLong[3] = { 1.2, 1.0, 0.85 };
static const double kSilence = 1e-4;

static double decayCoef(double seconds, double sr) { return std::exp(-1.0 / (seconds * sr)); }

static double polyBlep(double t, double dt)
{
    if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
    if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
    return 0.0;
}

/** Cuadrada sin aliasing (PolyBLEP); avanza la fase. */
static double square(double& phase, double freq, double sr)
{
    const double dt = freq / sr;
    phase += dt;
    phase -= std::floor(phase);
    double s = phase < 0.5 ? 1.0 : -1.0;
    s += polyBlep(phase, dt);
    double p2 = phase + 0.5;
    p2 -= std::floor(p2);
    s -= polyBlep(p2, dt);
    return s;
}

void Biquad::bandpass(double f, double q, double sr)
{
    const double w = kTwoPi * f / sr, al = std::sin(w) / (2.0 * q), a0 = 1.0 + al;
    b0 = al / a0; b1 = 0.0; b2 = -al / a0; a1 = -2.0 * std::cos(w) / a0; a2 = (1.0 - al) / a0;
}

void Biquad::highpass(double f, double q, double sr)
{
    const double w = kTwoPi * f / sr, al = std::sin(w) / (2.0 * q), a0 = 1.0 + al, c = std::cos(w);
    b0 = (1.0 + c) / 2.0 / a0; b1 = -(1.0 + c) / a0; b2 = (1.0 + c) / 2.0 / a0; a1 = -2.0 * c / a0; a2 = (1.0 - al) / a0;
}

void Biquad::lowpass(double f, double q, double sr)
{
    const double w = kTwoPi * f / sr, al = std::sin(w) / (2.0 * q), a0 = 1.0 + al, c = std::cos(w);
    b0 = (1.0 - c) / 2.0 / a0; b1 = (1.0 - c) / a0; b2 = (1.0 - c) / 2.0 / a0; a1 = -2.0 * c / a0; a2 = (1.0 - al) / a0;
}

Engine::Engine()
{
    for (int i = 0; i < kInst; ++i) {
        const double th = (kPan[i] + 1.0) * kPi / 4.0;
        gainL_[i] = std::sqrt(2.0) * std::cos(th);
        gainR_[i] = std::sqrt(2.0) * std::sin(th);
    }
    for (int i = 0; i < NumParams; ++i)
        p_[i] = paramInfo(i).def;
    reset();
}

void Engine::prepare(double sampleRate)
{
    sr_ = sampleRate;
    reset();
}

void Engine::reset()
{
    for (int i = 0; i < kInst; ++i) {
        v_[i] = Voice();
        v_[i].rng.s = 2463534242u ^ (0x9E3779B9u * uint32_t(i + 1));
    }
    for (double& p : mph_) p = 0.0;
    metalNow_ = 0.0;
    running_ = wasRunning_ = false;
    ppq_ = 0.0;
    lastFired_ = -1;
}

void Engine::setParam(int id, float value)
{
    if (id < 0 || id >= NumParams)
        return;
    const ParamInfo& info = paramInfo(id);
    if (info.choices > 0) {
        int k = int(std::floor(double(value) + 0.5));
        p_[id] = float(k < 0 ? 0 : k > info.choices - 1 ? info.choices - 1 : k);
    } else {
        p_[id] = value < 0.f ? 0.f : value > 1.f ? 1.f : value;
    }
}

void Engine::loadPreset(int index)
{
    const std::vector<Preset>& list = presets();
    if (index < 0 || index >= int(list.size()))
        return;
    const Preset& pr = list[size_t(index)];
    for (int i = 0; i < NumParams; ++i)
        if (i != Run && i != Sync)
            setParam(i, paramInfo(i).def);
    for (const PresetValue& pv : pr.values)
        setParam(pv.id, pv.value);
    for (int i = 0; i < kInst; ++i)
        setPatternString(i, pr.pattern[i]);
}

void Engine::setStep(int inst, int step, int value)
{
    if (inst < 0 || inst >= kInst || step < 0 || step >= kSteps)
        return;
    steps_[inst][step] = uint8_t(value < 0 ? 0 : value > 2 ? 2 : value);
}

void Engine::clearPattern()
{
    for (int i = 0; i < kInst; ++i)
        for (int s = 0; s < kSteps; ++s)
            steps_[i][s] = 0;
}

void Engine::setPatternString(int inst, const char* s)
{
    bool end = (s == nullptr);
    for (int i = 0; i < kSteps; ++i) {
        const char c = end ? '\0' : s[i];
        if (c == '\0') end = true;
        steps_[inst][i] = c == 'X' ? 2 : c == 'x' ? 1 : 0;
    }
}

void Engine::setTransport(bool playing, double ppq, double bpm)
{
    hostPlaying_ = playing;
    hostPpq_ = ppq;
    hostBpm_ = bpm > 1.0 ? bpm : 120.0;
}

double Engine::bpm() const { return p_[Sync] >= 1.f ? hostBpm_ : 40.0 + 200.0 * double(p_[Tempo]); }

int Engine::stepLength() const
{
    static const int len[4] = { 16, 12, 8, 4 };
    return len[int(p_[Steps])];
}

double Engine::level(int id) const
{
    const double x = double(p_[id]);
    return x * x * 1.4;
}

int Engine::activeVoices() const
{
    int n = 0;
    for (const Voice& v : v_) n += v.active ? 1 : 0;
    return n;
}

void Engine::allNotesOff()
{
    for (int i = 0; i < kInst; ++i) {
        v_[i].active = false;
        v_[i].q1.reset();
        v_[i].q2.reset();
    }
}

void Engine::noteOn(int note, float velocity)
{
    const int inst = noteToInst(note);
    if (inst >= 0)
        trigger(inst, velocity < 0.2f ? 0.2 : double(velocity), false);
}

void Engine::trigger(int inst, double velocity, bool accent)
{
    if (inst < 0 || inst >= kInst)
        return;
    Voice& v = v_[inst];
    const double sr = sr_;
    const double gv = velocity * (accent ? 1.0 + 0.7 * double(p_[Accent]) : 1.0);
    Noise rng = v.rng;
    v = Voice();
    v.rng = rng;
    v.active = true;
    v.vel = gv;
    switch (inst) {
        case BD: {
            const double d = p_[BdDecay], tone = p_[BdTone];
            v.f[0] = 38.0 * std::pow(2.0, 1.2 * double(p_[BdTune]));
            v.e[0] = 1.0; v.c[0] = decayCoef(0.08 + 0.9 * d * d, sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.018, sr);
            v.e[2] = 1.0; v.c[2] = decayCoef(0.004, sr);
            v.g[0] = 0.5 * tone;
            break;
        }
        case SD: {
            const double k = std::pow(2.0, (double(p_[SdTune]) - 0.5) * 0.8), tone = p_[SdTone], sn = p_[SdSnappy];
            v.f[0] = 180.0 * k; v.f[1] = 330.0 * k;
            v.e[0] = 1.0; v.c[0] = decayCoef(0.075, sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.045, sr);
            v.e[2] = 1.0; v.c[2] = decayCoef(0.012, sr);
            v.e[3] = 1.0; v.c[3] = decayCoef(0.09 + 0.12 * sn, sr);
            v.g[0] = 0.12 + 1.0 * sn;
            v.g[1] = 0.35 + 0.65 * tone;
            v.q1.highpass(1500.0 + 2500.0 * tone, 0.7, sr);
            break;
        }
        case LT: case MT: case HT: {
            const int t = inst - LT;
            const double tune = t == 0 ? p_[LtTune] : t == 1 ? p_[MtTune] : p_[HtTune];
            const double dec = t == 0 ? p_[LtDecay] : t == 1 ? p_[MtDecay] : p_[HtDecay];
            v.f[0] = kTomBase[t] * std::pow(2.0, tune - 0.5);
            v.e[0] = 1.0; v.c[0] = decayCoef((0.05 + 0.3 * dec) * kTomLong[t], sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.04, sr);
            v.e[2] = 1.0; v.c[2] = decayCoef(0.003, sr);
            break;
        }
        case RS:
            v.f[0] = 480.0; v.f[1] = 1700.0;
            v.e[0] = 1.0; v.c[0] = decayCoef(0.009, sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.0025, sr);
            v.q1.highpass(2500.0, 0.7, sr);
            break;
        case CL:
            v.f[0] = 2500.0; v.f[1] = 3250.0;
            v.e[0] = 1.0; v.c[0] = decayCoef(0.014, sr);
            break;
        case CP:
            v.q1.bandpass(1100.0, 1.1, sr);
            break;
        case MA:
            v.q1.bandpass(6500.0, 0.8, sr);
            break;
        case CB: {
            const double k = std::pow(2.0, (double(p_[CbTune]) - 0.5) * 0.5);
            v.f[0] = 540.0 * k; v.f[1] = 800.0 * k;
            v.e[0] = 1.0; v.c[0] = decayCoef(0.012, sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.08, sr);
            v.q1.bandpass(1800.0, 0.8, sr);
            break;
        }
        case CY: {
            const double d = p_[CyDecay];
            v.e[0] = 1.0; v.c[0] = decayCoef(0.03, sr);
            v.e[1] = 1.0; v.c[1] = decayCoef(0.25 + 1.1 * d, sr);
            v.g[0] = p_[CyTone];
            v.q1.bandpass(3500.0, 0.7, sr);
            v.q2.highpass(7000.0, 0.7, sr);
            break;
        }
        case OH:
            v.e[0] = 1.0; v.c[0] = decayCoef(0.07 + 0.45 * double(p_[OhDecay]), sr);
            v.q1.bandpass(8000.0, 1.0, sr);
            v.q2.highpass(6500.0, 0.7, sr);
            break;
        case CH:
            v.e[0] = 1.0; v.c[0] = decayCoef(0.04, sr);
            v.q1.bandpass(8000.0, 1.0, sr);
            v.q2.highpass(6500.0, 0.7, sr);
            // El hi-hat cerrado corta al abierto
            if (v_[OH].active)
                v_[OH].c[0] = decayCoef(0.006, sr);
            break;
    }
}

/** Banco metalico: seis cuadradas sumadas (se calcula una vez por muestra y lo comparten platillo y hi-hats). */
double Engine::metal()
{
    double s = 0.0;
    for (int i = 0; i < 6; ++i)
        s += square(mph_[i], kMetal[i], sr_);
    return s * 0.5;
}

double Engine::renderVoice(int inst)
{
    Voice& v = v_[inst];
    const double sr = sr_;
    double out = 0.0;
    switch (inst) {
        case BD: {
            const double f = v.f[0] * (1.0 + 2.2 * v.e[1]);
            v.ph[0] += f / sr; v.ph[0] -= std::floor(v.ph[0]);
            out = fastTanh(1.6 * std::sin(kTwoPi * v.ph[0]) * v.e[0]) * 0.85 + v.rng.next() * v.e[2] * v.g[0];
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1]; v.e[2] *= v.c[2];
            if (v.e[0] < kSilence) v.active = false;
            break;
        }
        case SD: {
            const double pe = 1.0 + 0.35 * v.e[2];
            v.ph[0] += v.f[0] * pe / sr; v.ph[0] -= std::floor(v.ph[0]);
            v.ph[1] += v.f[1] * pe / sr; v.ph[1] -= std::floor(v.ph[1]);
            const double s1 = std::sin(kTwoPi * v.ph[0]) * v.e[0];
            const double s2 = std::sin(kTwoPi * v.ph[1]) * v.e[1] * v.g[1];
            const double nz = v.q1.process(v.rng.next()) * v.e[3] * v.g[0];
            out = fastTanh(1.2 * (0.7 * s1 + 0.7 * s2 + 0.55 * nz));
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1]; v.e[2] *= v.c[2]; v.e[3] *= v.c[3];
            if (v.e[0] < kSilence && v.e[3] < kSilence) v.active = false;
            break;
        }
        case LT: case MT: case HT: {
            const double f = v.f[0] * (1.0 + 0.45 * v.e[1]);
            v.ph[0] += f / sr; v.ph[0] -= std::floor(v.ph[0]);
            out = fastTanh(1.2 * std::sin(kTwoPi * v.ph[0]) * v.e[0]) * 0.85 + v.rng.next() * v.e[2] * 0.08;
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1]; v.e[2] *= v.c[2];
            if (v.e[0] < kSilence) v.active = false;
            break;
        }
        case RS: {
            v.ph[0] += v.f[0] / sr; v.ph[0] -= std::floor(v.ph[0]);
            v.ph[1] += v.f[1] / sr; v.ph[1] -= std::floor(v.ph[1]);
            const double s = (std::sin(kTwoPi * v.ph[0]) + 0.8 * std::sin(kTwoPi * v.ph[1])) * v.e[0] * 0.5
                           + v.q1.process(v.rng.next()) * v.e[1] * 0.5;
            out = fastTanh(1.5 * s);
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1];
            if (v.e[0] < kSilence) v.active = false;
            break;
        }
        case CL: {
            v.ph[0] += v.f[0] / sr; v.ph[0] -= std::floor(v.ph[0]);
            v.ph[1] += v.f[1] / sr; v.ph[1] -= std::floor(v.ph[1]);
            out = (std::sin(kTwoPi * v.ph[0]) + 0.3 * std::sin(kTwoPi * v.ph[1])) * v.e[0] * 0.7;
            v.e[0] *= v.c[0];
            if (v.e[0] < kSilence) v.active = false;
            break;
        }
        case CP: {
            const double t = v.n / sr;
            double env;
            if (t < 0.0315) env = std::exp(-std::fmod(t, 0.0105) / 0.0028);
            else env = std::exp(-(t - 0.0315) / 0.075) * 0.9;
            out = v.q1.process(v.rng.next()) * env * 3.0;
            if (env < kSilence && t > 0.0315) v.active = false;
            break;
        }
        case MA: {
            const double t = v.n / sr;
            const double env = t < 0.001 ? t / 0.001 : std::exp(-(t - 0.001) / 0.02);
            out = v.q1.process(v.rng.next()) * env * 2.5;
            if (t > 0.001 && env < kSilence) v.active = false;
            break;
        }
        case CB: {
            const double s = (square(v.ph[0], v.f[0], sr) + square(v.ph[1], v.f[1], sr)) * 0.5;
            out = v.q1.process(s) * (0.4 * v.e[0] + 0.6 * v.e[1]) * 1.6;
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1];
            if (v.e[1] < kSilence) v.active = false;
            break;
        }
        case CY: {
            const double lo = v.q1.process(metalNow_), hi = v.q2.process(metalNow_);
            out = (lo * (1.0 - v.g[0]) * 0.9 + hi * v.g[0] * 1.1) * (0.3 * v.e[0] + 0.7 * v.e[1]);
            v.e[0] *= v.c[0]; v.e[1] *= v.c[1];
            if (v.e[1] < 3e-4) v.active = false;
            break;
        }
        case OH: case CH: {
            const double y = v.q2.process(v.q1.process(metalNow_));
            out = y * v.e[0] * 1.4;
            v.e[0] *= v.c[0];
            if (v.e[0] < kSilence) v.active = false;
            break;
        }
    }
    v.n += 1.0;
    return out * v.vel;
}

void Engine::sequencerTick(double pos)
{
    const int len = stepLength();
    const double loop = len * 0.25;
    double pb = std::fmod(pos, loop);
    if (pb < 0.0) pb += loop;
    int i0 = int(std::floor(pb / 0.25));
    if (i0 >= len) i0 = len - 1;
    int cur = i0;
    if ((i0 & 1) && pb < i0 * 0.25 + double(p_[Shuffle]) * 0.125)
        cur = i0 - 1;
    if (cur == lastFired_)
        return;
    lastFired_ = cur;
    for (int i = 0; i < kInst; ++i) {
        const int s = steps_[i][cur];
        if (s)
            trigger(i, 0.8 + (s == 2 ? 0.2 : 0.0), s == 2);
    }
}

void Engine::process(float* left, float* right, int n)
{
    const bool host = p_[Sync] >= 1.f;
    running_ = host ? hostPlaying_ : p_[Run] >= 1.f;
    if (running_ && !wasRunning_) {
        lastFired_ = -1;
        if (!host) ppq_ = 0.0;
    }
    if (!running_ && wasRunning_)
        lastFired_ = -1;
    wasRunning_ = running_;
    const double bps = bpm() / (60.0 * sr_);

    double lv[kInst];
    for (int i = 0; i < kInst; ++i) lv[i] = level(kLevelId[i]);
    const double vol = double(p_[Volume]) * double(p_[Volume]) * 2.0;

    for (int i = 0; i < n; ++i) {
        if (running_) {
            sequencerTick(host ? hostPpq_ + double(i) * bps : ppq_);
            if (!host) ppq_ += bps;
        }
        if (v_[CY].active || v_[OH].active || v_[CH].active)
            metalNow_ = metal();
        double l = 0.0, r = 0.0;
        for (int k = 0; k < kInst; ++k) {
            if (!v_[k].active) continue;
            const double s = renderVoice(k) * lv[k];
            l += s * gainL_[k];
            r += s * gainR_[k];
        }
        left[i] = float(fastTanh(l * vol * 0.9));
        right[i] = float(fastTanh(r * vol * 0.9));
    }
    if (host)
        hostPpq_ += double(n) * bps;
}

} // namespace re
