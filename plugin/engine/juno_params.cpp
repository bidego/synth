#include "juno_params.h"

namespace juno {

static const ParamInfo kInfo[NumParams] = {
    /* PortaTime */ { "portaTime", "Portamento", 0, 0.3f, "" },
    /* PortaOn   */ { "portaOn", "Portamento On", 2, 0.f, "Off|On" },
    /* VoiceMode */ { "voiceMode", "Voice Mode", 3, 0.f, "Poly 1|Poly 2|Unison" },
    /* BendDco   */ { "bendDco", "Bender DCO", 0, 0.17f, "" },
    /* BendVcf   */ { "bendVcf", "Bender VCF", 0, 0.f, "" },
    /* LfoRate   */ { "lfoRate", "LFO Rate", 0, 0.35f, "" },
    /* LfoDelay  */ { "lfoDelay", "LFO Delay", 0, 0.f, "" },
    /* DcoLfo    */ { "dcoLfo", "DCO LFO", 0, 0.f, "" },
    /* Pwm       */ { "pwm", "PWM", 0, 0.2f, "" },
    /* PwmMode   */ { "pwmMode", "PWM Mode", 2, 0.f, "Manual|LFO" },
    /* Range     */ { "range", "DCO Range", 3, 1.f, "16'|8'|4'" },
    /* Pulse     */ { "pulse", "Pulse", 2, 1.f, "Off|On" },
    /* Saw       */ { "saw", "Saw", 2, 1.f, "Off|On" },
    /* Sub       */ { "sub", "Sub", 0, 0.3f, "" },
    /* Noise     */ { "noise", "Noise", 0, 0.f, "" },
    /* Hpf       */ { "hpf", "HPF", 4, 1.f, "0|1|2|3" },
    /* VcfFreq   */ { "vcfFreq", "VCF Freq", 0, 0.6f, "" },
    /* VcfRes    */ { "vcfRes", "VCF Res", 0, 0.15f, "" },
    /* VcfEnv    */ { "vcfEnv", "VCF Env", 0, 0.35f, "" },
    /* VcfLfo    */ { "vcfLfo", "VCF LFO", 0, 0.f, "" },
    /* VcfKybd   */ { "vcfKybd", "VCF Kybd", 0, 0.5f, "" },
    /* EnvPol    */ { "envPol", "Env Polarity", 2, 1.f, "Inverted|Normal" },
    /* VcaLevel  */ { "vcaLevel", "VCA Level", 0, 0.7f, "" },
    /* VcaMode   */ { "vcaMode", "VCA Mode", 2, 0.f, "Env|Gate" },
    /* Atk       */ { "atk", "Env A", 0, 0.05f, "" },
    /* Dec       */ { "dec", "Env D", 0, 0.4f, "" },
    /* Sus       */ { "sus", "Env S", 0, 0.6f, "" },
    /* Rel       */ { "rel", "Env R", 0, 0.3f, "" },
    /* VelVca    */ { "velVca", "Velocity VCA", 0, 0.85f, "" },
    /* VelVcf    */ { "velVcf", "Velocity VCF", 0, 0.3f, "" },
    /* Chorus    */ { "chorus", "Chorus", 4, 0.f, "Off|I|II|I+II" },
};

const ParamInfo& paramInfo(int id) { return kInfo[id]; }

const std::vector<Preset>& presets() {
    static const std::vector<Preset> list = {
#include "juno_presets.inc"
    };
    return list;
}

} // namespace juno
