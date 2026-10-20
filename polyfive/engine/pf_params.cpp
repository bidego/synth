#include "pf_params.h"

namespace pf {

static const ParamInfo kInfo[NumParams] = {
    /* AOct      */ { "aOct", "Osc A Octave", 5, 2.f, "32'|16'|8'|4'|2'" },
    /* ATune     */ { "aTune", "Osc A Tune", 0, 0.5f, "" },
    /* APw       */ { "aPw", "Osc A Pulse Width", 0, 0.5f, "" },
    /* ASaw      */ { "aSaw", "Osc A Saw", 2, 1.f, "Off|On" },
    /* APulse    */ { "aPulse", "Osc A Pulse", 2, 0.f, "Off|On" },
    /* Sync      */ { "sync", "Sync", 2, 0.f, "Off|On" },
    /* BOct      */ { "bOct", "Osc B Octave", 5, 2.f, "32'|16'|8'|4'|2'" },
    /* BFreq     */ { "bFreq", "Osc B Frequency", 0, 0.5f, "" },
    /* BFine     */ { "bFine", "Osc B Fine", 0, 0.5f, "" },
    /* BPw       */ { "bPw", "Osc B Pulse Width", 0, 0.5f, "" },
    /* BSaw      */ { "bSaw", "Osc B Saw", 2, 1.f, "Off|On" },
    /* BTri      */ { "bTri", "Osc B Triangle", 2, 0.f, "Off|On" },
    /* BPulse    */ { "bPulse", "Osc B Pulse", 2, 0.f, "Off|On" },
    /* BLow      */ { "bLow", "Osc B Low Freq", 2, 0.f, "Off|On" },
    /* BKbd      */ { "bKbd", "Osc B Keyboard", 2, 1.f, "Off|On" },
    /* PmEnv     */ { "pmEnv", "Poly-Mod Filter Env", 0, 0.f, "" },
    /* PmB       */ { "pmB", "Poly-Mod Osc B", 0, 0.f, "" },
    /* PmFreqA   */ { "pmFreqA", "Poly-Mod Freq A", 2, 0.f, "Off|On" },
    /* PmPwA     */ { "pmPwA", "Poly-Mod PW A", 2, 0.f, "Off|On" },
    /* PmFilter  */ { "pmFilter", "Poly-Mod Filter", 2, 0.f, "Off|On" },
    /* MixA      */ { "mixA", "Mix Osc A", 0, 0.8f, "" },
    /* MixB      */ { "mixB", "Mix Osc B", 0, 0.f, "" },
    /* MixNoise  */ { "mixNoise", "Mix Noise", 0, 0.f, "" },
    /* Cutoff    */ { "cutoff", "Cutoff", 0, 0.55f, "" },
    /* Resonance */ { "resonance", "Resonance", 0, 0.2f, "" },
    /* EnvAmt    */ { "envAmt", "Envelope Amount", 0, 0.4f, "" },
    /* KbdTrack  */ { "kbdTrack", "Keyboard Tracking", 3, 1.f, "Off|Half|Full" },
    /* FAtk      */ { "fAtk", "Filter Attack", 0, 0.f, "" },
    /* FDec      */ { "fDec", "Filter Decay", 0, 0.4f, "" },
    /* FSus      */ { "fSus", "Filter Sustain", 0, 0.3f, "" },
    /* FRel      */ { "fRel", "Filter Release", 0, 0.3f, "" },
    /* AAtk      */ { "aAtk", "Amp Attack", 0, 0.f, "" },
    /* ADec      */ { "aDec", "Amp Decay", 0, 0.4f, "" },
    /* ASus      */ { "aSus", "Amp Sustain", 0, 0.8f, "" },
    /* ARel      */ { "aRel", "Amp Release", 0, 0.3f, "" },
    /* LfoFreq   */ { "lfoFreq", "LFO Frequency", 0, 0.3f, "" },
    /* LfoShape  */ { "lfoShape", "LFO Shape", 3, 0.f, "Triangle|Saw|Square" },
    /* LfoAmt    */ { "lfoAmt", "LFO Initial Amount", 0, 0.f, "" },
    /* WmMix     */ { "wmMix", "Wheel Mix (LFO / Noise)", 0, 0.f, "" },
    /* WmFreqA   */ { "wmFreqA", "Wheel Freq A", 2, 0.f, "Off|On" },
    /* WmFreqB   */ { "wmFreqB", "Wheel Freq B", 2, 0.f, "Off|On" },
    /* WmPwA     */ { "wmPwA", "Wheel PW A", 2, 0.f, "Off|On" },
    /* WmPwB     */ { "wmPwB", "Wheel PW B", 2, 0.f, "Off|On" },
    /* WmFilter  */ { "wmFilter", "Wheel Filter", 2, 0.f, "Off|On" },
    /* ModWheel  */ { "modWheel", "Mod Wheel", 0, 0.f, "" },
    /* Glide     */ { "glide", "Glide", 0, 0.3f, "" },
    /* GlideOn   */ { "glideOn", "Glide On", 2, 0.f, "Off|On" },
    /* Unison    */ { "unison", "Unison", 2, 0.f, "Off|On" },
    /* Tune      */ { "tune", "Master Tune", 0, 0.5f, "" },
    /* Volume    */ { "volume", "Volume", 0, 0.7f, "" },
    /* Velocity  */ { "velocity", "Velocity", 0, 0.4f, "" },
};

const ParamInfo& paramInfo(int id) { return kInfo[id]; }

const std::vector<Preset>& presets() {
    static const std::vector<Preset> list = {
#include "pf_presets.inc"
    };
    return list;
}

} // namespace pf
