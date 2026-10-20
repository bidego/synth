// Parametros de Poly Five (sintetizador polifonico de 5 voces con poly-mod y sync, inspirado en los clasicos de los 70).
#pragma once
#include <vector>

namespace pf {

enum ParamId {
    // Oscilador A
    AOct, ATune, APw, ASaw, APulse, Sync,
    // Oscilador B
    BOct, BFreq, BFine, BPw, BSaw, BTri, BPulse, BLow, BKbd,
    // Poly-mod: fuente (envolvente del filtro / oscilador B) y destinos
    PmEnv, PmB, PmFreqA, PmPwA, PmFilter,
    // Mezclador
    MixA, MixB, MixNoise,
    // Filtro y envolventes
    Cutoff, Resonance, EnvAmt, KbdTrack,
    FAtk, FDec, FSus, FRel, AAtk, ADec, ASus, ARel,
    // LFO y rueda de modulacion (wheel-mod)
    LfoFreq, LfoShape, LfoAmt, WmMix, WmFreqA, WmFreqB, WmPwA, WmPwB, WmFilter, ModWheel,
    // Interpretacion
    Glide, GlideOn, Unison, Tune, Volume, Velocity,
    NumParams
};

struct ParamInfo {
    const char* id;
    const char* name;
    int choices;          // 0 = perilla continua 0..1; N > 0 = N posiciones (0..N-1)
    float def;
    const char* labels;   // etiquetas de un selector separadas por '|'
};

const ParamInfo& paramInfo(int id);

struct PresetValue { int id; float value; };
struct Preset { const char* name; const char* category; std::vector<PresetValue> values; };
const std::vector<Preset>& presets();

} // namespace pf
