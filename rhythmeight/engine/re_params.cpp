#include "re_params.h"

namespace re {

static const ParamInfo kInfo[NumParams] = {
    /* BdLevel  */ { "bdLevel", "Bass Drum Level", 0, 0.75f, "" },
    /* BdTune   */ { "bdTune", "Bass Drum Tune", 0, 0.5f, "" },
    /* BdDecay  */ { "bdDecay", "Bass Drum Decay", 0, 0.5f, "" },
    /* BdTone   */ { "bdTone", "Bass Drum Tone", 0, 0.4f, "" },
    /* SdLevel  */ { "sdLevel", "Snare Level", 0, 0.75f, "" },
    /* SdTune   */ { "sdTune", "Snare Tune", 0, 0.5f, "" },
    /* SdTone   */ { "sdTone", "Snare Tone", 0, 0.5f, "" },
    /* SdSnappy */ { "sdSnappy", "Snare Snappy", 0, 0.5f, "" },
    /* LtLevel  */ { "ltLevel", "Low Tom Level", 0, 0.75f, "" },
    /* LtTune   */ { "ltTune", "Low Tom Tune", 0, 0.5f, "" },
    /* LtDecay  */ { "ltDecay", "Low Tom Decay", 0, 0.5f, "" },
    /* MtLevel  */ { "mtLevel", "Mid Tom Level", 0, 0.75f, "" },
    /* MtTune   */ { "mtTune", "Mid Tom Tune", 0, 0.5f, "" },
    /* MtDecay  */ { "mtDecay", "Mid Tom Decay", 0, 0.5f, "" },
    /* HtLevel  */ { "htLevel", "Hi Tom Level", 0, 0.75f, "" },
    /* HtTune   */ { "htTune", "Hi Tom Tune", 0, 0.5f, "" },
    /* HtDecay  */ { "htDecay", "Hi Tom Decay", 0, 0.5f, "" },
    /* RsLevel  */ { "rsLevel", "Rim Shot Level", 0, 0.7f, "" },
    /* ClLevel  */ { "clLevel", "Claves Level", 0, 0.7f, "" },
    /* CpLevel  */ { "cpLevel", "Hand Clap Level", 0, 0.75f, "" },
    /* MaLevel  */ { "maLevel", "Maracas Level", 0, 0.7f, "" },
    /* CbLevel  */ { "cbLevel", "Cowbell Level", 0, 0.7f, "" },
    /* CbTune   */ { "cbTune", "Cowbell Tune", 0, 0.5f, "" },
    /* CyLevel  */ { "cyLevel", "Cymbal Level", 0, 0.7f, "" },
    /* CyTone   */ { "cyTone", "Cymbal Tone", 0, 0.5f, "" },
    /* CyDecay  */ { "cyDecay", "Cymbal Decay", 0, 0.5f, "" },
    /* OhLevel  */ { "ohLevel", "Open Hat Level", 0, 0.7f, "" },
    /* OhDecay  */ { "ohDecay", "Open Hat Decay", 0, 0.4f, "" },
    /* ChLevel  */ { "chLevel", "Closed Hat Level", 0, 0.7f, "" },
    /* Accent   */ { "accent", "Accent", 0, 0.6f, "" },
    /* Shuffle  */ { "shuffle", "Shuffle", 0, 0.f, "" },
    /* Tempo    */ { "tempo", "Tempo", 0, 0.4f, "" },
    /* Steps    */ { "steps", "Pattern Length", 4, 0.f, "16|12|8|4" },
    /* Sync     */ { "sync", "Sync", 2, 0.f, "Internal|Host" },
    /* Run      */ { "run", "Run", 2, 0.f, "Stop|Run" },
    /* Volume   */ { "volume", "Volume", 0, 0.7f, "" },
};

const ParamInfo& paramInfo(int id) { return kInfo[id]; }

static const char* const kCode[kInst] = { "bd", "sd", "lt", "mt", "ht", "rs", "cl", "cp", "ma", "cb", "cy", "oh", "ch" };
static const char* const kName[kInst] = { "Bass Drum", "Snare", "Low Tom", "Mid Tom", "Hi Tom", "Rim Shot", "Claves", "Hand Clap", "Maracas", "Cowbell", "Cymbal", "Open Hat", "Closed Hat" };
static const int kNote[kInst] = { 36, 38, 41, 45, 48, 37, 75, 39, 70, 56, 49, 46, 42 };

const char* instCode(int inst) { return kCode[inst]; }
const char* instName(int inst) { return kName[inst]; }
int instNote(int inst) { return kNote[inst]; }

int noteToInst(int note)
{
    switch (note) {
        case 35: case 36: return BD;
        case 38: case 40: return SD;
        case 41: case 43: return LT;
        case 45: case 47: return MT;
        case 48: case 50: return HT;
        case 37: return RS;
        case 75: return CL;
        case 39: return CP;
        case 70: case 69: return MA;
        case 56: return CB;
        case 49: case 51: case 52: case 55: case 57: case 59: return CY;
        case 46: return OH;
        case 42: case 44: return CH;
        default: return -1;
    }
}

const std::vector<Preset>& presets() {
    static const std::vector<Preset> list = {
#include "re_presets.inc"
    };
    return list;
}

} // namespace re
