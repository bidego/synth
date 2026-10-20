// Motor de audio de Poly Five: sintetizador polifonico de 5 voces. Por voz: dos osciladores (A: sierra y pulso con ancho; B: sierra,
// triangulo y pulso, que tambien sirve de LFO; sync de A a B), poly-mod (la envolvente del filtro y el oscilador B modulan la frecuencia de A,
// su ancho de pulso o el filtro), mezclador con ruido, filtro de escalera de 24 dB que autooscila y dos envolventes ADSR. Global: LFO con
// rueda de modulacion (frecuencia, ancho de pulso y filtro), unison, glide y deriva analogica de cada voz. C++ puro (sin JUCE).
// El audio va sobremuestreado 2 veces y se decima con un FIR de media banda.
#pragma once
#include <cstdint>
#include <vector>
#include "pf_params.h"

namespace pf {

constexpr int kVoices = 5;
constexpr int kOversample = 2;

/** Tangente hiperbolica rapida (Pade): igual de suave que la real para saturar, mucho mas barata. */
inline float fastTanh(float x)
{
    if (x > 3.f) return 1.f;
    if (x < -3.f) return -1.f;
    const float x2 = x * x;
    return x * (27.f + x2) / (27.f + 9.f * x2);
}

/** Reduce la frecuencia a la mitad con un FIR de media banda de fase lineal. */
class Decimator2 {
public:
    explicit Decimator2(int taps = 63);
    float process(float a, float b);   // dos muestras entran, una sale
    void reset();
private:
    std::vector<float> h_, buf_;
    std::vector<int> taps_;
    int pos_ = 0;
};

/** Escalera de 4 polos (24 dB/oct): realimentacion resuelta sin retardo y saturacion suave en cada etapa. */
struct Ladder {
    float z[4] = { 0, 0, 0, 0 };
    float G = 0.f;
    void reset() { z[0] = z[1] = z[2] = z[3] = 0.f; }
    void setCutoff(double fc, double fs);
    float process(float x, float k);
};

/** Envolvente ADSR analogica: ataque RC que apunta por encima de 1, decaimiento y liberacion exponenciales. */
struct Contour {
    enum Stage { Idle, Attack, Decay, Sustain, Release };
    Stage stage = Idle;
    float level = 0.f;
    void gateOn() { stage = Attack; }
    void gateOff() { if (stage != Idle) stage = Release; }
    void kill() { stage = Idle; level = 0.f; }
    float step(float attackCoef, float decayCoef, float sustain, float releaseCoef);
};

struct Voice {
    int note = -1;
    float vel = 1.f;
    bool held = false;
    uint64_t order = 0;
    double noteNow = 60, noteTarget = 60;     // altura (semitonos) con glide
    double phaseA = 0, phaseB = 0;
    float bPrev = 0.f;                         // salida anterior de B (poly-mod)
    float detune = 0.f;                        // cents (unison)
    float drift = 0.f, driftTarget = 0.f;
    float outGain = 1.f;
    Ladder ladder;
    Contour fenv, aenv;
    // Nota nueva que espera a que esta voz (robada) termine de apagarse
    bool pending = false;
    int pNote = 0;
    float pVel = 1.f, pDetune = 0.f, pGain = 1.f;
    bool stealing = false;
    float stealGain = 1.f;
    // Valores de control (se actualizan cada 8 muestras)
    double baseFreqA = 110, baseFreqB = 110;
    float cutoffCents = 0.f, pwModA = 0.f, pwModB = 0.f, centsA = 0.f, centsB = 0.f, wheelCutoff = 0.f;
    bool active() const { return aenv.stage != Contour::Idle; }
};

class Engine {
public:
    Engine();
    void prepare(double sampleRate);
    void reset();

    void setParam(int id, float value);   // perillas 0..1; selectores e interruptores, el indice
    float param(int id) const { return p_[id]; }
    void loadPreset(int index);

    void noteOn(int note, float velocity);
    void noteOff(int note);
    void allNotesOff();
    void setBend(float norm) { bend_ = norm < -1.f ? -1.f : norm > 1.f ? 1.f : norm; }
    void setModWheelExt(float norm) { modExt_ = norm < 0.f ? 0.f : norm > 1.f ? 1.f : norm; }
    void setDriftAmount(float cents) { driftAmount_ = cents; }

    void process(float* left, float* right, int n);
    int activeVoices() const;

private:
    void controlUpdate();
    void beginNote(Voice& v, int note, float vel, float detune, float gain);
    void startVoice(Voice& v, int note, float vel, float detune, float gain);
    Voice* allocate();
    float processOne();
    float noise();
    void updateTimes();

    double sr_ = 44100, osr_ = 88200;
    float p_[NumParams] = {};
    Voice voices_[kVoices];
    uint64_t counter_ = 0;
    int nextVoice_ = 0;
    int stack_[16] = {};
    float stackVel_[16] = {};
    int stackSize_ = 0;
    bool played_ = false;
    double lastNote_ = 60;
    float bend_ = 0.f, modExt_ = 0.f;
    uint32_t rng_ = 24681357;
    float driftAmount_ = 3.f;
    int driftCount_ = 0;

    // LFO y fuente de la rueda
    double lfoPhase_ = 0.0;
    float lfoValue_ = 0.f, noiseHeld_ = 0.f, wheelSrc_ = 0.f, wheelAmt_ = 0.f;

    // Mezclador (suavizado)
    float gain_[3] = { 0, 0, 0 }, gainTarget_[3] = { 0, 0, 0 };

    // Tiempos de las envolventes
    float fAtk_ = 0, fDec_ = 0, fRel_ = 0, aAtk_ = 0, aDec_ = 0, aRel_ = 0;
    float resK_ = 0.f, outGain_ = 0.f;
    int ctrlCount_ = 0;
    float dcX_ = 0.f, dcY_ = 0.f;
    Decimator2 dec_;
    float stage_[kOversample] = {};
};

} // namespace pf
