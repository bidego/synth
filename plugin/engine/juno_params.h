// Parametros y sonidos del Juno-106. Los ids son los mismos que los de la version web (src/app/daw/modules/juno.module.ts),
// asi un sonido de un lado se puede llevar al otro.
#pragma once
#include <vector>

namespace juno {

enum ParamId {
    PortaTime, PortaOn, VoiceMode, BendDco, BendVcf,
    LfoRate, LfoDelay,
    DcoLfo, Pwm, PwmMode, Range, Pulse, Saw, Sub, Noise,
    Hpf,
    VcfFreq, VcfRes, VcfEnv, VcfLfo, VcfKybd, EnvPol,
    VcaLevel, VcaMode,
    Atk, Dec, Sus, Rel,
    VelVca, VelVcf,
    Chorus,
    NumParams
};

struct ParamInfo {
    const char* id;
    const char* name;
    int choices;          // 0 = deslizador 0..1; N > 0 = interruptor de N posiciones (0..N-1)
    float def;
    const char* labels;   // etiquetas de un interruptor separadas por '|'
};

const ParamInfo& paramInfo(int id);

struct PresetValue { int id; float value; };
struct Preset { const char* name; const char* category; std::vector<PresetValue> values; };

/** Los sonidos de partida; los controles que no nombra un sonido vuelven a su valor por defecto. */
const std::vector<Preset>& presets();

} // namespace juno
