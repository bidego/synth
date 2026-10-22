// Motor de audio de Rhythm Eight: caja de ritmos analogica de 13 voces. Cada voz es una sintesis propia (como los circuitos de las clasicas de
// los 80): bombo con barrido de tono, caja de dos tonos y ruido, toms, rim shot, claves, palmas (rafagas de ruido), maracas, cowbell de dos
// cuadradas y platillo / hi-hats de seis cuadradas. Mas un secuenciador de 16 pasos con acento, shuffle y tempo propio o del anfitrion.
// C++ puro (sin JUCE). Todo en doble precision: el motor web (AudioWorklet) hace las mismas cuentas.
#pragma once
#include <cstdint>
#include "re_params.h"

namespace re {

/** Tangente hiperbolica rapida (Pade), para saturar suave. */
inline double fastTanh(double x)
{
    if (x > 3.0) return 1.0;
    if (x < -3.0) return -1.0;
    const double x2 = x * x;
    return x * (27.0 + x2) / (27.0 + 9.0 * x2);
}

/** Ruido blanco (xorshift32) en [-1, 1): la misma secuencia en C++ y en JavaScript. */
struct Noise {
    uint32_t s = 2463534242u;
    double next()
    {
        s ^= s << 13; s ^= s >> 17; s ^= s << 5;
        return double(s) / 2147483648.0 - 1.0;
    }
};

/** Filtro bicuadratico (forma transpuesta II). */
struct Biquad {
    double b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
    void bandpass(double f, double q, double sr);
    void highpass(double f, double q, double sr);
    void lowpass(double f, double q, double sr);
    void reset() { z1 = z2 = 0; }
    double process(double x)
    {
        const double y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }
};

/** Estado de una voz: los campos se reutilizan segun el instrumento. */
struct Voice {
    bool active = false;
    double vel = 1.0;
    double n = 0.0;                 // muestras desde el golpe
    double ph[3] = { 0, 0, 0 };     // fases de los osciladores
    double f[3] = { 0, 0, 0 };      // frecuencias base (Hz)
    double e[4] = { 0, 0, 0, 0 };   // envolventes
    double c[4] = { 0, 0, 0, 0 };   // coeficientes de decaimiento por muestra
    double g[4] = { 0, 0, 0, 0 };   // ganancias de la voz
    bool choked = false;
    Biquad q1, q2;
    Noise rng;
};

class Engine {
public:
    Engine();
    void prepare(double sampleRate);
    void reset();

    void setParam(int id, float value);   // perillas 0..1; selectores e interruptores, el indice
    float param(int id) const { return p_[id]; }
    void loadPreset(int index);

    // Golpes sueltos (MIDI) y patron
    void noteOn(int note, float velocity);
    void noteOff(int) {}
    void allNotesOff();
    void trigger(int inst, double velocity, bool accent);

    void setStep(int inst, int step, int value);   // 0 vacio, 1 golpe, 2 acento
    int step(int inst, int step) const { return steps_[inst][step]; }
    void clearPattern();
    void setPatternString(int inst, const char* s);

    /** Transporte del anfitrion: se usa solo con Sync = Host. ppq = posicion al inicio del bloque en negras. */
    void setTransport(bool playing, double ppq, double bpm);
    double bpm() const;
    int stepLength() const;
    /** Paso que sono por ultima vez (-1 si el secuenciador esta parado): para el indicador de la interfaz. */
    int currentStep() const { return running_ ? lastFired_ : -1; }

    void process(float* left, float* right, int n);
    int activeVoices() const;

private:
    double level(int id) const;
    void sequencerTick(double posBeats);
    double renderVoice(int inst);
    double metal();

    double sr_ = 44100;
    float p_[NumParams] = {};
    Voice v_[kInst];
    uint8_t steps_[kInst][kSteps] = {};
    double gainL_[kInst], gainR_[kInst];

    // Secuenciador
    bool running_ = false, wasRunning_ = false, hostPlaying_ = false;
    double hostPpq_ = 0, hostBpm_ = 120, ppq_ = 0;
    int lastFired_ = -1;

    // Banco metalico compartido (seis cuadradas) de platillo y hi-hats
    double mph_[6] = { 0, 0, 0, 0, 0, 0 };
    double metalNow_ = 0.0;
};

} // namespace re
