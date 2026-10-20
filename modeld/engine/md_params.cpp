#include "md_params.h"

namespace md {

static const ParamInfo kInfo[NumParams] = {
    /* Tune       */ { "tune", "Tune", 0, 0.5f, "" },
    /* Glide      */ { "glide", "Glide", 0, 0.3f, "" },
    /* GlideOn    */ { "glideOn", "Glide On", 2, 0.f, "Off|On" },
    /* ModMix     */ { "modMix", "Modulation Mix", 0, 0.f, "" },
    /* ModWheel   */ { "modWheel", "Mod Wheel", 0, 0.f, "" },
    /* Osc1Range  */ { "osc1Range", "Osc 1 Range", 6, 3.f, "LO|32'|16'|8'|4'|2'" },
    /* Osc1Wave   */ { "osc1Wave", "Osc 1 Waveform", 6, 2.f, "Triangle|Shark|Saw|Square|Wide Pulse|Narrow Pulse" },
    /* Osc2Range  */ { "osc2Range", "Osc 2 Range", 6, 3.f, "LO|32'|16'|8'|4'|2'" },
    /* Osc2Tune   */ { "osc2Tune", "Osc 2 Frequency", 0, 0.5f, "" },
    /* Osc2Wave   */ { "osc2Wave", "Osc 2 Waveform", 6, 2.f, "Triangle|Shark|Saw|Square|Wide Pulse|Narrow Pulse" },
    /* Osc3Range  */ { "osc3Range", "Osc 3 Range", 6, 3.f, "LO|32'|16'|8'|4'|2'" },
    /* Osc3Tune   */ { "osc3Tune", "Osc 3 Frequency", 0, 0.5f, "" },
    /* Osc3Wave   */ { "osc3Wave", "Osc 3 Waveform", 6, 2.f, "Triangle|Shark|Saw|Square|Wide Pulse|Narrow Pulse" },
    /* Osc3Kbd    */ { "osc3Kbd", "Osc 3 Keyboard", 2, 1.f, "Off|On" },
    /* Osc1On     */ { "osc1On", "Osc 1 On", 2, 1.f, "Off|On" },
    /* Osc2On     */ { "osc2On", "Osc 2 On", 2, 1.f, "Off|On" },
    /* Osc3On     */ { "osc3On", "Osc 3 On", 2, 0.f, "Off|On" },
    /* NoiseOn    */ { "noiseOn", "Noise On", 2, 0.f, "Off|On" },
    /* Vol1       */ { "vol1", "Osc 1 Level", 0, 0.8f, "" },
    /* Vol2       */ { "vol2", "Osc 2 Level", 0, 0.8f, "" },
    /* Vol3       */ { "vol3", "Osc 3 Level", 0, 0.f, "" },
    /* VolNoise   */ { "volNoise", "Noise Level", 0, 0.f, "" },
    /* NoiseType  */ { "noiseType", "Noise Type", 2, 0.f, "White|Pink" },
    /* Cutoff     */ { "cutoff", "Cutoff", 0, 0.5f, "" },
    /* Emphasis   */ { "emphasis", "Emphasis", 0, 0.25f, "" },
    /* ContourAmt */ { "contourAmt", "Contour Amount", 0, 0.5f, "" },
    /* FAtk       */ { "fAtk", "Filter Attack", 0, 0.f, "" },
    /* FDec       */ { "fDec", "Filter Decay", 0, 0.4f, "" },
    /* FSus       */ { "fSus", "Filter Sustain", 0, 0.3f, "" },
    /* LAtk       */ { "lAtk", "Loudness Attack", 0, 0.f, "" },
    /* LDec       */ { "lDec", "Loudness Decay", 0, 0.45f, "" },
    /* LSus       */ { "lSus", "Loudness Sustain", 0, 0.8f, "" },
    /* Kbd1       */ { "kbd1", "Keyboard Control 1", 2, 1.f, "Off|On" },
    /* Kbd2       */ { "kbd2", "Keyboard Control 2", 2, 0.f, "Off|On" },
    /* DecayOn    */ { "decayOn", "Decay", 2, 1.f, "Off|On" },
    /* OscMod     */ { "oscMod", "Oscillator Modulation", 2, 0.f, "Off|On" },
    /* FiltMod    */ { "filtMod", "Filter Modulation", 2, 0.f, "Off|On" },
    /* Volume     */ { "volume", "Volume", 0, 0.7f, "" },
    /* A440       */ { "a440", "A-440", 2, 0.f, "Off|On" },
    /* Velocity   */ { "velocity", "Velocity", 0, 0.4f, "" },
};

const ParamInfo& paramInfo(int id) { return kInfo[id]; }

const std::vector<Preset>& presets() {
    static const std::vector<Preset> list = {
#include "md_presets.inc"
    };
    return list;
}

} // namespace md
