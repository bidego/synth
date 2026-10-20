#include "ac_params.h"

namespace ac {

static const ParamInfo kInfo[NumParams] = {
    /* Waveform   */ { "waveform", "Waveform", 2, 0.f, "Saw|Square" },
    /* Tune       */ { "tune", "Tuning", 0, 0.5f, "" },
    /* Cutoff     */ { "cutoff", "Cutoff Freq", 0, 0.4f, "" },
    /* Resonance  */ { "resonance", "Resonance", 0, 0.65f, "" },
    /* EnvMod     */ { "envMod", "Env Mod", 0, 0.6f, "" },
    /* Decay      */ { "decay", "Decay", 0, 0.4f, "" },
    /* Accent     */ { "accent", "Accent", 0, 0.6f, "" },
    /* AccentVel  */ { "accentVel", "Accent Velocity", 0, 0.75f, "" },
    /* SlideTime  */ { "slideTime", "Slide Time", 0, 0.35f, "" },
    /* Drive      */ { "drive", "Drive", 0, 0.f, "" },
    /* Volume     */ { "volume", "Volume", 0, 0.7f, "" },
};

const ParamInfo& paramInfo(int id) { return kInfo[id]; }

const std::vector<Preset>& presets() {
    static const std::vector<Preset> list = {
#include "ac_presets.inc"
    };
    return list;
}

} // namespace ac
