#include "juno_engine.h"
#include <algorithm>
#include <cmath>

namespace juno {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr float kMaxCents = 9600.f;
constexpr float kBendFullCents = 1200.f;
const float kUnisonSpread[kVoices] = { -14.f, -8.f, -3.f, 3.f, 8.f, 14.f };

inline float polyBlep(double t, double dt) {
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

inline float coefFor(double seconds, double sr) {
    return float(1.0 - std::exp(-1.0 / (std::max(seconds, 1e-5) * sr)));
}

// Curvas de tiempo (las mismas que la version web): ataque 1 ms - 3 s; decaimiento y liberacion 2 ms - 12 s
inline double attackTime(float x) { return 0.001 * std::pow(3000.0, x); }
inline double slowTime(float x) { return 0.002 * std::pow(6000.0, x); }

// Ataque RC hacia un objetivo mayor que 1: llega a 1 en exactamente el tiempo pedido
constexpr float kAttackTarget = 1.3f;

} // namespace

// --- Filtros auxiliares ---

void Biquad::setHighpass(double sr, double f, double q) {
    const double w = 2 * kPi * f / sr, c = std::cos(w), s = std::sin(w), alpha = s / (2 * q);
    const double a0 = 1 + alpha;
    b0 = float((1 + c) / 2 / a0); b1 = float(-(1 + c) / a0); b2 = b0;
    a1 = float(-2 * c / a0); a2 = float((1 - alpha) / a0);
}

void Biquad::setLowShelf(double sr, double f, double gainDb) {
    const double A = std::pow(10.0, gainDb / 40), w = 2 * kPi * f / sr, c = std::cos(w), s = std::sin(w);
    const double alpha = s / 2 * std::sqrt(2.0), sq = 2 * std::sqrt(A) * alpha;
    const double a0 = (A + 1) + (A - 1) * c + sq;
    b0 = float(A * ((A + 1) - (A - 1) * c + sq) / a0);
    b1 = float(2 * A * ((A - 1) - (A + 1) * c) / a0);
    b2 = float(A * ((A + 1) - (A - 1) * c - sq) / a0);
    a1 = float(-2 * ((A - 1) + (A + 1) * c) / a0);
    a2 = float(((A + 1) + (A - 1) * c - sq) / a0);
}

float Envelope::step(float attackCoef, float decayCoef, float sustain, float releaseCoef) {
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
            if (level < 1e-4f) { level = 0; stage = Idle; }
            break;
    }
    return level;
}

// --- Motor ---

void Engine::prepare(double sampleRate) {
    sr_ = sampleRate;
    for (int i = 0; i < NumParams; i++)
        p_[i] = paramInfo(i).def;
    reset();
    updateTimes();
    applyHpf();
}

void Engine::reset() {
    for (auto& v : voices_) {
        v = Voice();
        v.hpf.setFlat();
        v.shelf.setFlat();
    }
    counter_ = 0;
    nextVoice_ = 0;
    sustain_ = false;
    stackSize_ = 0;
    lastFreq_ = 0;
    lfoPhase_ = 0;
    std::fill(std::begin(chorusBuf_), std::end(chorusBuf_), 0.f);
    chorusPos_ = 0;
    wetL_ = wetR_ = 0;
    chorusDry_ = 1;
    chorusWet_ = 0;
}

void Engine::updateTimes() {
    aAtk_ = coefFor(attackTime(p_[Atk]) / std::log(kAttackTarget / (kAttackTarget - 1.f)), sr_);
    aDec_ = coefFor(slowTime(p_[Dec]) / 3.0, sr_);
    aRel_ = coefFor(slowTime(p_[Rel]) / 3.0, sr_);
    gAtk_ = coefFor(0.003 / std::log(kAttackTarget / (kAttackTarget - 1.f)), sr_);
    gRel_ = coefFor(0.008 / 3.0, sr_);
}

void Engine::applyHpf() {
    // 0: refuerzo de graves, 1: plano, 2 y 3: pasa altos cada vez mas arriba
    const int pos = int(p_[Hpf]);
    for (auto& v : voices_) {
        if (pos == 0) v.shelf.setLowShelf(sr_, 100.0, 7.0); else v.shelf.setFlat();
        v.hpf.setHighpass(sr_, pos == 2 ? 240.0 : pos == 3 ? 720.0 : 10.0, 0.7);
    }
}

void Engine::setParam(int id, float value) {
    if (id < 0 || id >= NumParams || !(value == value))
        return;
    const ParamInfo& info = paramInfo(id);
    // Los deslizadores van de 0 a 1; los interruptores son el indice de la posicion (0..N-1)
    if (info.choices)
        p_[id] = std::round(std::min(float(info.choices - 1), std::max(0.f, value)));
    else
        p_[id] = std::min(1.f, std::max(0.f, value));
    if (id == Atk || id == Dec || id == Rel)
        updateTimes();
    if (id == Hpf)
        applyHpf();
}

void Engine::loadPreset(int index) {
    const auto& list = presets();
    if (index < 0 || index >= int(list.size()))
        return;
    allNotesOff();
    for (int i = 0; i < NumParams; i++)
        setParam(i, paramInfo(i).def);
    for (const auto& pv : list[size_t(index)].values)
        setParam(pv.id, pv.value);
}

float Engine::kfFor(const Voice& v) const {
    return float(v.note - 60) * 100.f * p_[VcfKybd] - (1.f - v.vel) * p_[VelVcf] * 4800.f;
}

float Engine::noise() {
    rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
    return float(rng_) * (2.f / 4294967296.f) - 1.f;
}

// --- Notas ---

void Engine::beginNote(Voice& v, int note, float vel, float detune, float gain) {
    const double f = 440.0 * std::pow(2.0, double(note - 69) / 12.0 + double(p_[Range] - 1.f));
    const bool glide = p_[PortaOn] >= 1.f && lastFreq_ > 0;
    v.freq = glide ? lastFreq_ : f;
    v.targetFreq = f;
    lastFreq_ = f;
    v.note = note;
    v.vel = vel;
    v.held = true;
    v.sustained = false;
    v.order = ++counter_;
    v.detuneCents = detune;
    v.lfoAge = 0;
    v.lfoFade = 0;
    v.pending = false;
    v.stealing = false;
    v.stealGain = 1.f;
    // La resonancia le saca cuerpo a la escalera (como en el original); se compensa en parte para que el volumen no se hunda
    v.outGain = gain * (1.f + 0.25f * p_[VcfRes] * 4.2f) * (1.f - p_[VelVca] * (1.f - vel));
    v.kfCents = kfFor(v);
    v.amp.trigger();
    v.flt.trigger();
    // El filtro arranca limpio en una voz que estaba apagada (sin restos del sonido anterior)
    if (v.amp.level <= 0.f) {
        v.lad[0] = v.lad[1] = v.lad[2] = v.lad[3] = 0.f;
        v.hpf.reset();
        v.shelf.reset();
    }
}

void Engine::startVoice(Voice& v, int note, float vel, float detune, float gain) {
    // Una voz que todavia suena con otra nota se apaga en unos milisegundos antes de arrancar la nueva (sin clicks)
    if (v.active() && v.amp.level > 0.02f && v.note != note) {
        v.pending = true; v.pNote = note; v.pVel = vel; v.pDetune = detune; v.pGain = gain;
        v.stealing = true;
        v.held = false;
        v.sustained = false;
        return;
    }
    beginNote(v, note, vel, detune, gain);
}

Voice* Engine::allocate() {
    // Poly 2 usa siempre la primera libre; Poly 1 va rotando
    if (p_[VoiceMode] >= 1.f) {
        for (auto& v : voices_)
            if (!v.active() && !v.pending)
                return &v;
    } else {
        for (int i = 0; i < kVoices; i++) {
            Voice& v = voices_[size_t((nextVoice_ + i) % kVoices)];
            if (!v.active() && !v.pending)
                return &v;
        }
    }
    // Todas ocupadas: la mas vieja que ya se esta liberando, o la mas vieja de todas
    Voice* best = nullptr;
    for (auto& v : voices_)
        if (!v.held && !v.sustained && (!best || v.order < best->order))
            best = &v;
    if (best)
        return best;
    for (auto& v : voices_)
        if (!best || v.order < best->order)
            best = &v;
    return best;
}

void Engine::noteOn(int note, float velocity) {
    velocity = std::min(1.f, std::max(0.f, velocity));
    if (p_[VoiceMode] >= 2.f) {
        // Unison: las 6 voces tocan la nota; las anteriores quedan apiladas para volver a ellas al soltar
        int w = 0;
        for (int i = 0; i < stackSize_; i++)
            if (stack_[i] != note) { stack_[w] = stack_[i]; stackVel_[w] = stackVel_[i]; w++; }
        stackSize_ = w;
        if (stackSize_ < 16) { stack_[stackSize_] = note; stackVel_[stackSize_] = velocity; stackSize_++; }
        for (int i = 0; i < kVoices; i++)
            startVoice(voices_[size_t(i)], note, velocity, kUnisonSpread[i], 0.45f);
        return;
    }
    Voice* v = nullptr;
    for (auto& c : voices_)
        if (c.note == note && c.held) { v = &c; break; }   // la misma nota vuelve a su voz
    if (!v) {
        v = allocate();
        nextVoice_ = int(v - voices_.data() + 1) % kVoices;
    }
    startVoice(*v, note, velocity, 0.f, 1.f);
}

void Engine::releaseVoice(Voice& v) {
    v.held = false;
    v.sustained = false;
    v.amp.release();
    v.flt.release();
}

void Engine::noteOff(int note) {
    if (p_[VoiceMode] >= 2.f) {
        const bool wasTop = stackSize_ > 0 && stack_[stackSize_ - 1] == note;
        int w = 0;
        for (int i = 0; i < stackSize_; i++)
            if (stack_[i] != note) { stack_[w] = stack_[i]; stackVel_[w] = stackVel_[i]; w++; }
        stackSize_ = w;
        if (!wasTop || sustain_)
            return;
        if (stackSize_ > 0) {
            for (int i = 0; i < kVoices; i++)
                startVoice(voices_[size_t(i)], stack_[stackSize_ - 1], stackVel_[stackSize_ - 1], kUnisonSpread[i], 0.45f);
        } else {
            for (auto& v : voices_) if (v.held) releaseVoice(v);
        }
        return;
    }
    for (auto& v : voices_) {
        if (v.held && v.note == note) {
            if (sustain_) { v.sustained = true; v.held = false; }
            else releaseVoice(v);
        }
    }
}

void Engine::sustainPedal(bool on) {
    sustain_ = on;
    if (!on) {
        for (auto& v : voices_) if (v.sustained) releaseVoice(v);
        if (p_[VoiceMode] >= 2.f && stackSize_ == 0)
            for (auto& v : voices_) if (v.held) releaseVoice(v);
    }
}

void Engine::allNotesOff() {
    stackSize_ = 0;
    sustain_ = false;
    for (auto& v : voices_) {
        v.pending = false;
        v.stealing = false;
        if (v.held || v.sustained) releaseVoice(v);
    }
}

void Engine::setBend(float norm) { bend_ = std::min(1.f, std::max(-1.f, norm)); }
void Engine::setModWheel(float norm) { modWheel_ = std::min(1.f, std::max(0.f, norm)); }

int Engine::activeVoices() const {
    int n = 0;
    for (const auto& v : voices_) if (v.active()) n++;
    return n;
}

// --- Audio ---

void Engine::renderBlock(float* mono, int n) {
    const double invSr = 1.0 / sr_;
    const float lfoRate = 0.3f * std::pow(80.f, p_[LfoRate]);
    const float vibCents = p_[DcoLfo] * p_[DcoLfo] * 300.f + modWheel_ * 60.f;
    const float filtLfoCents = p_[VcfLfo] * p_[VcfLfo] * 2400.f;
    const float bendDco = bend_ * p_[BendDco] * kBendFullCents;
    const float bendVcf = bend_ * p_[BendVcf] * 2400.f;
    const bool pwmLfo = p_[PwmMode] >= 1.f;
    const float pw = p_[Pwm];
    const float sawOn = p_[Saw], pulseOn = p_[Pulse], subLevel = p_[Sub] * 0.9f, noiseLevel = p_[Noise] * 0.8f;
    const float baseCutoff = 30.f * std::pow(700.f, p_[VcfFreq]);
    const float envCents = (p_[EnvPol] >= 1.f ? 1.f : -1.f) * p_[VcfEnv] * kMaxCents;
    const float resK = p_[VcfRes] * 4.2f;   // pasa de 4 al final del recorrido: ahi la escalera autooscila (la saturacion la acota)
    const bool gate = p_[VcaMode] >= 1.f;
    const float sus = p_[Sus];
    const float lfoDelay = p_[LfoDelay] * p_[LfoDelay] * 3.f;
    const float portaTc = std::max(0.001f, p_[PortaTime] * p_[PortaTime]);
    const float mix = 0.14f;
    const double maxFc = std::min(20000.0, 0.45 * sr_);

    for (int pos = 0; pos < n; pos += kCtrl) {
        const int len = std::min(kCtrl, n - pos);
        // LFO triangular compartido
        lfoPhase_ += double(lfoRate) * len * invSr;
        lfoPhase_ -= std::floor(lfoPhase_);
        lfoValue_ = float(lfoPhase_ < 0.5 ? 4.0 * lfoPhase_ - 1.0 : 3.0 - 4.0 * lfoPhase_);

        for (auto& v : voices_) {
            if (!v.active() && !v.pending)
                continue;
            // Retardo de entrada del LFO
            v.lfoAge += float(len * invSr);
            if (lfoDelay <= 0.001f) v.lfoFade = 1.f;
            else if (v.lfoAge >= lfoDelay) v.lfoFade = std::min(1.f, (v.lfoAge - lfoDelay) / std::max(0.05f, lfoDelay * 0.5f));
            else v.lfoFade = 0.f;
            const float lfoV = lfoValue_ * v.lfoFade;

            // Portamento: la altura se acerca a la nota exponencialmente
            if (v.freq != v.targetFreq)
                v.freq += (v.targetFreq - v.freq) * (1.0 - std::exp(-double(len) * invSr / double(portaTc)));
            const float cents = v.detuneCents + bendDco + lfoV * vibCents;
            const double f = v.freq * std::pow(2.0, double(cents) / 1200.0);
            const double dt = std::min(0.45, f * invSr);
            const double subDt = dt * 0.5;
            const float duty = pwmLfo ? 0.5f + pw * 0.4f * lfoV : 0.5f + pw * 0.45f;

            // Corte del filtro: base + envolvente + LFO + palanca + teclado/velocidad
            const float envNow = v.flt.level;
            const float cutCents = envNow * envCents + lfoV * filtLfoCents + bendVcf + v.kfCents;
            const double fc = std::min(maxFc, std::max(20.0, double(baseCutoff) * std::pow(2.0, double(cutCents) / 1200.0)));
            const float g = float(std::tan(kPi * fc * invSr));
            const float G = g / (1.f + g);
            const float G2 = G * G, G4 = G2 * G2;
            const float oneMinusG = 1.f - G;

            for (int i = 0; i < len; i++) {
                // Voz robada: se apaga rapido y recien despues arranca la nota nueva
                if (v.stealing) {
                    v.stealGain -= 1.f / float(0.003 * sr_);
                    if (v.stealGain <= 0.f) {
                        v.stealGain = 1.f;
                        v.amp.kill(); v.flt.kill();
                        beginNote(v, v.pNote, v.pVel, v.pDetune, v.pGain);
                    }
                }
                const float ampEnv = gate ? v.amp.step(gAtk_, 1.f, 1.f, gRel_) : v.amp.step(aAtk_, aDec_, sus, aRel_);
                v.flt.step(aAtk_, aDec_, sus, aRel_);

                // DCO
                float s = 0.f;
                if (sawOn > 0.5f)
                    s += float(2.0 * v.phase - 1.0) - polyBlep(v.phase, dt);
                if (pulseOn > 0.5f) {
                    float pl = v.phase < duty ? 1.f : -1.f;
                    pl += polyBlep(v.phase, dt);
                    double q = v.phase + 1.0 - duty; q -= std::floor(q);
                    pl -= polyBlep(q, dt);
                    s += pl;
                }
                if (subLevel > 0.f) {
                    float sq = v.subPhase < 0.5 ? 1.f : -1.f;
                    sq += polyBlep(v.subPhase, subDt);
                    double q = v.subPhase + 0.5; q -= std::floor(q);
                    sq -= polyBlep(q, subDt);
                    s += sq * subLevel;
                }
                if (noiseLevel > 0.f)
                    s += noise() * noiseLevel;
                v.phase += dt; if (v.phase >= 1.0) v.phase -= 1.0;
                v.subPhase += subDt; if (v.subPhase >= 1.0) v.subPhase -= 1.0;

                // HPF y filtro de 24 dB (escalera de 4 polos con realimentacion resuelta sin retardo)
                float x = v.hpf.process(v.shelf.process(s * mix));
                const float Sx = oneMinusG * (G2 * G * v.lad[0] + G2 * v.lad[1] + G * v.lad[2] + v.lad[3]);
                float u = (x - resK * Sx) / (1.f + resK * G4);
                u = std::tanh(u);
                float y1 = G * u + oneMinusG * v.lad[0];
                float y2 = G * y1 + oneMinusG * v.lad[1];
                float y3 = G * y2 + oneMinusG * v.lad[2];
                float y4 = G * y3 + oneMinusG * v.lad[3];
                v.lad[0] = 2 * y1 - v.lad[0];
                v.lad[1] = 2 * y2 - v.lad[1];
                v.lad[2] = 2 * y3 - v.lad[2];
                v.lad[3] = 2 * y4 - v.lad[3];

                mono[pos + i] += y4 * ampEnv * v.outGain * (v.stealing ? v.stealGain : 1.f);
            }
        }
    }
}

void Engine::process(float* left, float* right, int n) {
    if (n <= 0)
        return;
    // Trabajo en bloques chicos: el chorus y la mezcla necesitan un buffer mono
    static thread_local float mono[4096];
    int done = 0;
    while (done < n) {
        const int len = std::min(n - done, 4096);
        std::fill(mono, mono + len, 0.f);
        renderBlock(mono, len);

        // Chorus estereo: dos lineas de retardo movidas por un LFO en contrafase
        const int mode = int(p_[Chorus]);
        const float rate = mode == 1 ? 0.513f : mode == 2 ? 0.863f : 9.75f;
        const double depth = (mode == 3 ? 0.00025 : 0.0019) * sr_;
        const double center = 0.00345 * sr_;
        const float dryTarget = mode ? 0.8f : 1.f, wetTarget = mode ? 0.6f : 0.f;
        const float lp = float(1.0 - std::exp(-2.0 * kPi * 9000.0 / sr_));
        const float master = p_[VcaLevel] * 1.25f;
        for (int i = 0; i < len; i++) {
            chorusDry_ += (dryTarget - chorusDry_) * 0.002f;
            chorusWet_ += (wetTarget - chorusWet_) * 0.002f;
            const float in = mono[i];
            chorusBuf_[chorusPos_] = in;
            chorusPhase_ += double(rate) * (1.0 / sr_);
            chorusPhase_ -= std::floor(chorusPhase_);
            const double tri = chorusPhase_ < 0.5 ? 4.0 * chorusPhase_ - 1.0 : 3.0 - 4.0 * chorusPhase_;
            auto tap = [&](double delay) {
                double rp = double(chorusPos_) - delay;
                while (rp < 0) rp += kChorusLen;
                const int i0 = int(rp) % kChorusLen, i1 = (i0 + 1) % kChorusLen;
                const float fr = float(rp - std::floor(rp));
                return chorusBuf_[i0] * (1.f - fr) + chorusBuf_[i1] * fr;
            };
            wetL_ += (tap(center + tri * depth) - wetL_) * lp;
            wetR_ += (tap(center - tri * depth) - wetR_) * lp;
            chorusPos_ = (chorusPos_ + 1) % kChorusLen;
            float l = (in * chorusDry_ + wetL_ * chorusWet_) * master;
            float r = (in * chorusDry_ + wetR_ * chorusWet_) * master;
            // Limitador suave: transparente hasta 0.8 y despues se curva sin recortar
            auto soft = [](float x) {
                const float a = std::fabs(x);
                return a < 0.8f ? x : std::copysign(0.8f + 0.2f * std::tanh((a - 0.8f) / 0.2f), x);
            };
            left[done + i] = soft(l);
            right[done + i] = soft(r);
        }
        done += len;
    }
}

} // namespace juno
