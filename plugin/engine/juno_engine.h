// Motor de audio del Juno-106: C++ puro (sin JUCE), para probarlo solo y usarlo dentro del plugin.
//
// Por voz: DCO (sierra + pulso con PWM + sub + ruido, con PolyBLEP contra el aliasing), pasa altos de 4 posiciones,
// filtro pasa bajos de 24 dB (escalera de 4 polos, resonancia hasta autooscilar), VCA y un envolvente ADSR
// compartido por el filtro y el VCA. Global: LFO triangular con retardo y chorus I / II estereo.
// Es el mismo diseno que la version web, con mas fidelidad donde el navegador no dejaba (filtro, envolvente, DCO).
#pragma once
#include <array>
#include <cstdint>
#include "juno_params.h"

namespace juno {

constexpr int kVoices = 6;

struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
    void setHighpass(double sr, double f, double q);
    void setLowShelf(double sr, double f, double gainDb);
    void setFlat() { b0 = 1; b1 = b2 = a1 = a2 = 0; }
    float process(float x) {
        const float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }
    void reset() { z1 = z2 = 0; }
};

/** Envolvente analogico: ataque que apunta por encima de 1 (RC), decaimiento y liberacion exponenciales. */
struct Envelope {
    enum Stage { Idle, Attack, Decay, Sustain, Release };
    Stage stage = Idle;
    float level = 0;
    void trigger() { stage = Attack; }
    void release() { if (stage != Idle) stage = Release; }
    void kill() { stage = Idle; level = 0; }
    /** Un paso: los coeficientes ya vienen calculados (1 - exp(-1/(tc*sr))). */
    float step(float attackCoef, float decayCoef, float sustain, float releaseCoef);
};

struct Voice {
    // Nota
    int note = -1;
    float vel = 1;
    bool held = false;
    bool sustained = false;
    uint64_t order = 0;           // para robar la voz mas vieja
    // Altura
    double freq = 440, targetFreq = 440;
    float detuneCents = 0;
    double phase = 0, subPhase = 0;
    // Filtros y envolventes
    Biquad hpf, shelf;
    float lad[4] = { 0, 0, 0, 0 };
    Envelope amp, flt;
    // LFO con retardo de entrada
    float lfoAge = 0, lfoFade = 0;
    // Nota nueva que espera a que esta voz (robada) termine de apagarse
    bool pending = false;
    int pNote = 0;
    float pVel = 1, pDetune = 0, pGain = 1;
    float stealGain = 1;          // 1 normal; baja a 0 mientras se roba
    bool stealing = false;
    float outGain = 1;            // unison / resonancia / velocidad
    float kfCents = 0;            // seguimiento de teclado y velocidad en el corte del filtro

    bool active() const { return amp.stage != Envelope::Idle; }
};

class Engine {
public:
    void prepare(double sampleRate);
    void reset();

    /** Deslizadores: 0..1. Interruptores: el indice de la posicion (0..N-1). */
    void setParam(int id, float value);
    float param(int id) const { return p_[id]; }
    void loadPreset(int index);

    void noteOn(int note, float velocity);   // velocity 0..1
    void noteOff(int note);
    void allNotesOff();
    void sustainPedal(bool on);
    void setBend(float norm);                // -1..1
    void setModWheel(float norm);            // 0..1: suma vibrato (la palanca del 106 hacia el costado)

    /** Genera n muestras estereo (sobrescribe los buffers). */
    void process(float* left, float* right, int n);

    int activeVoices() const;

private:
    static constexpr int kCtrl = 8;          // las modulaciones se actualizan cada 8 muestras

    void startVoice(Voice& v, int note, float vel, float detune, float gain);
    void beginNote(Voice& v, int note, float vel, float detune, float gain);
    void releaseVoice(Voice& v);
    Voice* allocate();
    void updateTimes();
    void applyHpf();
    void renderBlock(float* mono, int n);
    float noise();
    float kfFor(const Voice& v) const;

    double sr_ = 44100;
    float p_[NumParams] = {};
    std::array<Voice, kVoices> voices_;
    uint64_t counter_ = 0;
    int nextVoice_ = 0;
    bool sustain_ = false;
    float bend_ = 0, modWheel_ = 0;
    double lastFreq_ = 0;
    int stack_[16] = {};                     // notas apretadas en modo Unison
    float stackVel_[16] = {};
    int stackSize_ = 0;
    uint32_t rng_ = 22222;

    // Tiempos de los envolventes (coeficientes)
    float aAtk_ = 0, aDec_ = 0, aRel_ = 0;
    float gAtk_ = 0, gRel_ = 0;              // gate

    // LFO global
    double lfoPhase_ = 0;
    float lfoValue_ = 0;

    // Chorus
    static constexpr int kChorusLen = 4096;
    float chorusBuf_[kChorusLen] = {};
    int chorusPos_ = 0;
    double chorusPhase_ = 0;
    float wetL_ = 0, wetR_ = 0;              // filtro de la rama humeda
    float chorusDry_ = 1, chorusWet_ = 0;    // suavizados
};

} // namespace juno
