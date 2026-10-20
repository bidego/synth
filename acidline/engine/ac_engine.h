// Motor de audio de Acid Line: un oscilador (sierra o cuadrada), filtro de escalera de 3 polos (18 dB/oct) con resonancia que roba
// graves, envolvente de decaimiento para el filtro, acento, slide (las notas ligadas se deslizan sin reiniciar) y overdrive.
// C++ puro (sin JUCE). Todo el camino de audio va sobremuestreado 4 veces.
#pragma once
#include <cstdint>
#include <vector>
#include "ac_params.h"

namespace ac {

constexpr int kOversample = 4;

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

/** Escalera de 4 polos con saturacion en cada etapa; la salida se toma del 3er polo (18 dB/oct) y la realimentacion del 4to. */
struct Ladder3 {
    float z[4] = { 0, 0, 0, 0 };
    float G = 0.f;
    void reset() { z[0] = z[1] = z[2] = z[3] = 0.f; }
    void setCutoff(double fc, double fs);
    float process(float x, float k);
};

class Engine {
public:
    Engine();
    void prepare(double sampleRate);
    void reset();

    void setParam(int id, float value);   // perillas 0..1; el selector, el indice
    float param(int id) const { return p_[id]; }
    void loadPreset(int index);

    void noteOn(int note, float velocity);
    void noteOff(int note);
    void allNotesOff();
    void setBend(float norm) { bend_ = norm < -1.f ? -1.f : norm > 1.f ? 1.f : norm; }
    void setDriftAmount(float cents) { driftAmount_ = cents; }

    void process(float* left, float* right, int n);

    bool gate() const { return gate_; }
    bool accentOn() const { return accent_ > 0.5f; }

private:
    float processOne();
    void controlUpdate();

    double sr_ = 44100, osr_ = 176400;
    float p_[NumParams] = {};

    int held_[32] = {};
    int heldCount_ = 0;
    bool gate_ = false;
    bool played_ = false;
    double note_ = 48, targetNote_ = 48;
    bool sliding_ = false;
    float accentTarget_ = 0.f, accent_ = 0.f;   // el acento se suaviza (sin clicks)
    float bend_ = 0.f;
    double phase_ = 0.0;
    float drift_ = 0.f, driftTarget_ = 0.f;
    float driftAmount_ = 2.0f;
    int driftCount_ = 0;
    uint32_t rng_ = 987654;

    // Envolventes
    float filtEnv_ = 0.f;       // decae exponencialmente desde 1
    float ampEnv_ = 0.f;        // ataque y liberacion cortos
    float decayCoef_ = 0.f, attackCoef_ = 0.f, releaseCoef_ = 0.f;

    Ladder3 ladder_;
    float resK_ = 0.f;
    float cutoffBase_ = 0.f;
    int ctrlCount_ = 0;
    float outGain_ = 0.f;
    float dcX_ = 0.f, dcY_ = 0.f;
    Decimator2 dec1_, dec2_;
    float stage_[kOversample] = {};
    double freq_ = 110.0;
};

} // namespace ac
