// Motor de audio del Model D: sintetizador monofonico de tres osciladores, mezclador que satura, filtro de escalera de 24 dB
// con resonancia y dos contornos (filtro y volumen). C++ puro (sin JUCE).
//
// Todo el camino de la senal (osciladores, mezclador, filtro, VCA) corre sobrecuestreado 4 veces y se vuelve a la frecuencia
// original con dos filtros FIR de media banda: el aliasing de las ondas y de la saturacion queda muy por debajo de lo audible.
#pragma once
#include <cstdint>
#include <vector>
#include "md_params.h"

namespace md {

constexpr int kOversample = 4;

/** Filtro de escalera de 4 polos (24 dB/oct): realimentacion resuelta sin retardo y saturacion suave en cada etapa. */
struct Ladder {
    float z[4] = { 0, 0, 0, 0 };
    float G = 0.f;     // g / (1 + g)
    void reset() { z[0] = z[1] = z[2] = z[3] = 0.f; }
    void setCutoff(double fc, double fs);
    /** k: realimentacion (0..4 autooscila en 4). */
    float process(float x, float k);
};

/** Contorno analogico: ataque RC que apunta por encima de 1, decaimiento y liberacion exponenciales. */
struct Contour {
    enum Stage { Idle, Attack, Decay, Sustain, Release };
    Stage stage = Idle;
    float level = 0.f;
    void gateOn() { stage = Attack; }
    void gateOff() { if (stage != Idle) stage = Release; }
    float step(float attackCoef, float decayCoef, float sustain, float releaseCoef);
};

/** Reduce la frecuencia a la mitad con un FIR de fase lineal. */
class Decimator2 {
public:
    explicit Decimator2(int taps = 31);
    float process(float a, float b);   // dos muestras entran, una sale
    void reset();
private:
    std::vector<float> h_, buf_;
    int pos_ = 0;
};

class Engine {
public:
    Engine();
    void prepare(double sampleRate);
    void reset();

    /** Perillas: 0..1. Selectores e interruptores: el indice de la posicion (0..N-1). */
    void setParam(int id, float value);
    float param(int id) const { return p_[id]; }
    void loadPreset(int index);

    void noteOn(int note, float velocity);
    void noteOff(int note);
    void allNotesOff();
    void setBend(float norm);           // -1..1 (+-2 semitonos)
    void setModWheelExt(float norm);    // 0..1: la rueda (se suma a la perilla "Mod Wheel")
    /** Cuanto se mueve la afinacion de cada oscilador por la deriva analogica (cents, de pico a pico; 3 por defecto, 0 la apaga). */
    void setDriftAmount(float cents) { driftAmount_ = cents; }

    void process(float* left, float* right, int n);

    bool gate() const { return gate_; }
    float currentNote() const { return float(note_); }

private:
    void controlUpdate();
    void updateTimes();
    float oscSample(int index, double dt);
    float noise(bool pink);
    float processOne();

    double sr_ = 44100, osr_ = 176400;
    float p_[NumParams] = {};

    // Notas apretadas (la ultima manda) y estado del gate
    int held_[32] = {};
    int heldCount_ = 0;
    bool gate_ = false;
    bool played_ = false;    // ya sono alguna nota (el glide parte de la ultima)
    double note_ = 60;       // altura actual (semitonos, con glide)
    double targetNote_ = 60;
    float vel_ = 1.f;
    float bend_ = 0.f, modExt_ = 0.f;

    // Osciladores (corren libres, como los analogicos)
    double phase_[3] = { 0.1, 0.4, 0.7 };
    double baseFreq_[3] = { 110, 110, 110 };
    double dt_[3] = { 0, 0, 0 };
    float osc3Value_ = 0.f;
    // Deriva lenta de la afinacion (los osciladores analogicos nunca estan quietos)
    float drift_[3] = { 0, 0, 0 }, driftTarget_[3] = { 0, 0, 0 };
    int driftCount_ = 0;
    float driftAmount_ = 3.0f;

    // Mezclador
    float gain_[4] = { 0, 0, 0, 0 };         // suavizados
    float gainTarget_[4] = { 0, 0, 0, 0 };
    float pink_[3] = { 0, 0, 0 };
    uint32_t rng_ = 1234567;

    // Filtro y contornos
    Ladder ladder_;
    Contour fEnv_, lEnv_;
    float fAtk_ = 0, fDec_ = 0, fRelOn_ = 0, relFast_ = 0, lAtk_ = 0, lDec_ = 0, lRelOn_ = 0;
    float resK_ = 0;
    float cutoffCents_ = 0;                   // base + teclado (por control)
    int ctrlCount_ = 0;

    // Salida
    float outGain_ = 0.f;
    double tonePhase_ = 0;
    float dcX_ = 0, dcY_ = 0;
    Decimator2 dec1_, dec2_;
    float stage_[kOversample] = {};
};

} // namespace md
