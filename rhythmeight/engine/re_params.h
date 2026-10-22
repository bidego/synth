// Parametros de Rhythm Eight (caja de ritmos analogica de 13 voces con secuenciador de 16 pasos, inspirada en las clasicas de los 80).
#pragma once
#include <vector>

namespace re {

constexpr int kInst = 13;     // instrumentos
constexpr int kSteps = 16;    // pasos del patron

enum Inst { BD, SD, LT, MT, HT, RS, CL, CP, MA, CB, CY, OH, CH };

enum ParamId {
    // Bombo, caja, toms
    BdLevel, BdTune, BdDecay, BdTone,
    SdLevel, SdTune, SdTone, SdSnappy,
    LtLevel, LtTune, LtDecay,
    MtLevel, MtTune, MtDecay,
    HtLevel, HtTune, HtDecay,
    // Rim shot, claves, palmas, maracas, cowbell
    RsLevel, ClLevel, CpLevel, MaLevel,
    CbLevel, CbTune,
    // Platillo y hi-hats
    CyLevel, CyTone, CyDecay,
    OhLevel, OhDecay, ChLevel,
    // Secuenciador y salida
    Accent, Shuffle, Tempo, Steps, Sync, Run, Volume,
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

/** Nombre corto y nombre largo de cada instrumento, y la nota GM de la bateria con la que suena por MIDI. */
const char* instCode(int inst);   // "bd", "sd", ...
const char* instName(int inst);   // "Bass Drum", ...
int instNote(int inst);           // 36, 38, ...
int noteToInst(int note);         // -1 si no es una nota de bateria conocida

struct PresetValue { int id; float value; };
struct Preset {
    const char* name;
    const char* category;
    std::vector<PresetValue> values;
    const char* pattern[kInst];   // 16 caracteres por instrumento: '.' vacio, 'x' golpe, 'X' acento ("" = vacio)
};
const std::vector<Preset>& presets();

} // namespace re
