// Parametros del Model D (sintetizador monofonico inspirado en el Minimoog).
#pragma once
#include <vector>

namespace md {

enum ParamId {
    // Controladores
    Tune, Glide, GlideOn, ModMix, ModWheel,
    // Banco de osciladores
    Osc1Range, Osc1Wave,
    Osc2Range, Osc2Tune, Osc2Wave,
    Osc3Range, Osc3Tune, Osc3Wave, Osc3Kbd,
    // Mezclador
    Osc1On, Osc2On, Osc3On, NoiseOn, Vol1, Vol2, Vol3, VolNoise, NoiseType,
    // Filtro y contornos
    Cutoff, Emphasis, ContourAmt, FAtk, FDec, FSus, LAtk, LDec, LSus, Kbd1, Kbd2, DecayOn, OscMod, FiltMod,
    // Salida
    Volume, A440, Velocity,
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

} // namespace md
