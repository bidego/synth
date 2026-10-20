// Parametros de Acid Line (bajo monofonico de linea acida, inspirado en los bajos secuenciados de los 80).
#pragma once
#include <vector>

namespace ac {

enum ParamId {
    Waveform, Tune, Cutoff, Resonance, EnvMod, Decay, Accent, AccentVel, SlideTime, Drive, Volume,
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

} // namespace ac
