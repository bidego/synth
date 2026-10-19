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
        { "Init", {} },
        { "Brass", { {Range,1}, {Pulse,0}, {Saw,1}, {Sub,.2f}, {VcfFreq,.35f}, {VcfRes,.1f}, {VcfEnv,.45f}, {VcfKybd,.5f}, {Atk,.2f}, {Dec,.5f}, {Sus,.7f}, {Rel,.2f}, {Chorus,1} } },
        { "Strings", { {Range,1}, {Pulse,1}, {Saw,1}, {Pwm,.5f}, {PwmMode,1}, {LfoRate,.18f}, {Sub,0}, {VcfFreq,.62f}, {VcfRes,.05f}, {VcfEnv,.1f}, {Atk,.55f}, {Dec,.5f}, {Sus,.85f}, {Rel,.55f}, {Chorus,3} } },
        { "Soft Pad", { {Range,1}, {Pulse,1}, {Saw,0}, {Pwm,.6f}, {PwmMode,1}, {LfoRate,.15f}, {Sub,.2f}, {Hpf,1}, {VcfFreq,.45f}, {VcfRes,.2f}, {VcfEnv,.25f}, {Atk,.7f}, {Dec,.6f}, {Sus,.8f}, {Rel,.7f}, {Chorus,2} } },
        { "Funk Bass", { {Range,0}, {Pulse,1}, {Saw,0}, {Pwm,0}, {PwmMode,0}, {Sub,.7f}, {Hpf,0}, {VcfFreq,.3f}, {VcfRes,.4f}, {VcfEnv,.6f}, {VcfKybd,.3f}, {Atk,0}, {Dec,.5f}, {Sus,.1f}, {Rel,.2f}, {Chorus,0} } },
        { "Sub Bass", { {Range,0}, {Pulse,0}, {Saw,1}, {Sub,.9f}, {Hpf,0}, {VcfFreq,.28f}, {VcfRes,.1f}, {VcfEnv,.2f}, {Atk,.01f}, {Dec,.4f}, {Sus,.6f}, {Rel,.15f}, {Chorus,0} } },
        { "Pluck", { {Range,1}, {Pulse,1}, {Saw,1}, {Pwm,.3f}, {Sub,.1f}, {VcfFreq,.3f}, {VcfRes,.3f}, {VcfEnv,.6f}, {Atk,0}, {Dec,.52f}, {Sus,0}, {Rel,.35f}, {Chorus,1} } },
        { "Wobble Lead", { {Range,2}, {Pulse,1}, {Saw,1}, {Pwm,.2f}, {Sub,0}, {VcfFreq,.5f}, {VcfRes,.45f}, {VcfEnv,.2f}, {VcfLfo,.35f}, {LfoRate,.5f}, {Atk,.02f}, {Dec,.4f}, {Sus,.8f}, {Rel,.2f}, {VoiceMode,2}, {PortaOn,1}, {PortaTime,.25f}, {Chorus,1} } },
        { "Vibrato Lead", { {Range,1}, {Pulse,1}, {Saw,1}, {Pwm,0}, {Sub,.15f}, {DcoLfo,.25f}, {LfoRate,.45f}, {LfoDelay,.35f}, {VcfFreq,.6f}, {VcfRes,.2f}, {VcfEnv,.3f}, {Atk,.02f}, {Dec,.5f}, {Sus,.8f}, {Rel,.2f}, {VoiceMode,1}, {Chorus,2} } },
        { "Bell Tine", { {Range,2}, {Pulse,1}, {Saw,0}, {Pwm,.5f}, {Sub,0}, {Noise,.05f}, {Hpf,2}, {VcfFreq,.7f}, {VcfRes,.5f}, {VcfEnv,.3f}, {Atk,0}, {Dec,.68f}, {Sus,0}, {Rel,.6f}, {Chorus,3} } },
        { "Noise Sweep", { {Range,1}, {Pulse,0}, {Saw,0}, {Sub,0}, {Noise,.9f}, {VcfFreq,.2f}, {VcfRes,.6f}, {VcfEnv,.7f}, {Atk,.65f}, {Dec,.8f}, {Sus,.3f}, {Rel,.6f}, {Chorus,2} } },
    };
    return list;
}

} // namespace juno
