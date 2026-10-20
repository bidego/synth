// Generado por modeld/scripts/gen_web.py desde el motor del plugin (md_params.cpp) y modeld/presets/md-presets.json: no editar a mano.

export interface MdParam {
    id: string;
    name: string;
    choices: number;   // 0 = perilla 0..1; N = selector o interruptor de N posiciones
    def: number;
    labels: Array<string>;
}

export interface MdPreset {
    name: string;
    category: string;
    values: { [id: string]: number };
}

export const MD_PARAMS: ReadonlyArray<MdParam> = [
    { id: 'tune', name: 'Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'glide', name: 'Glide', choices: 0, def: 0.3, labels: [] },
    { id: 'glideOn', name: 'Glide On', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'modMix', name: 'Modulation Mix', choices: 0, def: 0, labels: [] },
    { id: 'modWheel', name: 'Mod Wheel', choices: 0, def: 0, labels: [] },
    { id: 'osc1Range', name: 'Osc 1 Range', choices: 6, def: 3, labels: ['LO', '32\'', '16\'', '8\'', '4\'', '2\''] },
    { id: 'osc1Wave', name: 'Osc 1 Waveform', choices: 6, def: 2, labels: ['Triangle', 'Shark', 'Saw', 'Square', 'Wide Pulse', 'Narrow Pulse'] },
    { id: 'osc2Range', name: 'Osc 2 Range', choices: 6, def: 3, labels: ['LO', '32\'', '16\'', '8\'', '4\'', '2\''] },
    { id: 'osc2Tune', name: 'Osc 2 Frequency', choices: 0, def: 0.5, labels: [] },
    { id: 'osc2Wave', name: 'Osc 2 Waveform', choices: 6, def: 2, labels: ['Triangle', 'Shark', 'Saw', 'Square', 'Wide Pulse', 'Narrow Pulse'] },
    { id: 'osc3Range', name: 'Osc 3 Range', choices: 6, def: 3, labels: ['LO', '32\'', '16\'', '8\'', '4\'', '2\''] },
    { id: 'osc3Tune', name: 'Osc 3 Frequency', choices: 0, def: 0.5, labels: [] },
    { id: 'osc3Wave', name: 'Osc 3 Waveform', choices: 6, def: 2, labels: ['Triangle', 'Shark', 'Saw', 'Square', 'Wide Pulse', 'Narrow Pulse'] },
    { id: 'osc3Kbd', name: 'Osc 3 Keyboard', choices: 2, def: 1, labels: ['Off', 'On'] },
    { id: 'osc1On', name: 'Osc 1 On', choices: 2, def: 1, labels: ['Off', 'On'] },
    { id: 'osc2On', name: 'Osc 2 On', choices: 2, def: 1, labels: ['Off', 'On'] },
    { id: 'osc3On', name: 'Osc 3 On', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'noiseOn', name: 'Noise On', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'vol1', name: 'Osc 1 Level', choices: 0, def: 0.8, labels: [] },
    { id: 'vol2', name: 'Osc 2 Level', choices: 0, def: 0.8, labels: [] },
    { id: 'vol3', name: 'Osc 3 Level', choices: 0, def: 0, labels: [] },
    { id: 'volNoise', name: 'Noise Level', choices: 0, def: 0, labels: [] },
    { id: 'noiseType', name: 'Noise Type', choices: 2, def: 0, labels: ['White', 'Pink'] },
    { id: 'cutoff', name: 'Cutoff', choices: 0, def: 0.5, labels: [] },
    { id: 'emphasis', name: 'Emphasis', choices: 0, def: 0.25, labels: [] },
    { id: 'contourAmt', name: 'Contour Amount', choices: 0, def: 0.5, labels: [] },
    { id: 'fAtk', name: 'Filter Attack', choices: 0, def: 0, labels: [] },
    { id: 'fDec', name: 'Filter Decay', choices: 0, def: 0.4, labels: [] },
    { id: 'fSus', name: 'Filter Sustain', choices: 0, def: 0.3, labels: [] },
    { id: 'lAtk', name: 'Loudness Attack', choices: 0, def: 0, labels: [] },
    { id: 'lDec', name: 'Loudness Decay', choices: 0, def: 0.45, labels: [] },
    { id: 'lSus', name: 'Loudness Sustain', choices: 0, def: 0.8, labels: [] },
    { id: 'kbd1', name: 'Keyboard Control 1', choices: 2, def: 1, labels: ['Off', 'On'] },
    { id: 'kbd2', name: 'Keyboard Control 2', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'decayOn', name: 'Decay', choices: 2, def: 1, labels: ['Off', 'On'] },
    { id: 'oscMod', name: 'Oscillator Modulation', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'filtMod', name: 'Filter Modulation', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'volume', name: 'Volume', choices: 0, def: 0.7, labels: [] },
    { id: 'a440', name: 'A-440', choices: 2, def: 0, labels: ['Off', 'On'] },
    { id: 'velocity', name: 'Velocity', choices: 0, def: 0.4, labels: [] },
];

export const MD_PRESETS: ReadonlyArray<MdPreset> = [
    { name: 'Init', category: 'Init', values: { volume: 0.55 } },
    { name: 'Classic Bass', category: 'Bajos', values: { osc1Range: 2, osc1Wave: 2, osc2Range: 2, osc2Wave: 2, osc2Tune: 0.52, vol1: 0.8, vol2: 0.7, cutoff: 0.35, emphasis: 0.35, contourAmt: 0.6, fAtk: 0, fDec: 0.35, fSus: 0.2, lAtk: 0, lDec: 0.35, lSus: 0.7, kbd1: 1, decayOn: 1, volume: 0.56 } },
    { name: 'Fat Bass', category: 'Bajos', values: { osc1Range: 1, osc1Wave: 3, osc2Range: 2, osc2Wave: 2, osc3Range: 2, osc3Wave: 2, osc3Tune: 0.48, osc3On: 1, vol1: 0.8, vol2: 0.7, vol3: 0.6, cutoff: 0.3, emphasis: 0.3, contourAmt: 0.55, fDec: 0.3, fSus: 0.15, lDec: 0.3, lSus: 0.8, volume: 0.35 } },
    { name: 'Sub Bass', category: 'Bajos', values: { osc1Range: 1, osc1Wave: 0, osc2Range: 1, osc2Wave: 1, vol1: 0.9, vol2: 0.6, cutoff: 0.28, emphasis: 0.15, contourAmt: 0.3, fDec: 0.4, fSus: 0.5, lDec: 0.5, lSus: 1, volume: 0.33 } },
    { name: 'Squelch Bass', category: 'Bajos', values: { osc1Range: 2, osc1Wave: 2, osc2On: 0, vol1: 0.9, cutoff: 0.3, emphasis: 0.75, contourAmt: 0.7, fDec: 0.3, fSus: 0.1, lDec: 0.3, lSus: 0.6, volume: 0.58 } },
    { name: 'Acid Bass', category: 'Bajos', values: { osc1Range: 2, osc1Wave: 2, osc2On: 0, vol1: 0.9, cutoff: 0.32, emphasis: 0.8, contourAmt: 0.8, fDec: 0.25, fSus: 0.15, lDec: 0.3, lSus: 0.6, glideOn: 1, glide: 0.2, volume: 0.7 } },
    { name: 'Pulse Bass', category: 'Bajos', values: { osc1Range: 2, osc1Wave: 4, osc2Range: 2, osc2Wave: 5, osc2Tune: 0.5, vol1: 0.8, vol2: 0.6, cutoff: 0.4, emphasis: 0.3, contourAmt: 0.5, fDec: 0.3, fSus: 0.2, lDec: 0.35, lSus: 0.6, volume: 0.51 } },
    { name: 'Emerson Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.53, osc3Range: 0, osc3Kbd: 0, osc3Tune: 0.55, osc3Wave: 0, glideOn: 1, glide: 0.25, vol1: 0.8, vol2: 0.7, cutoff: 0.55, emphasis: 0.4, contourAmt: 0.5, fDec: 0.4, fSus: 0.6, lDec: 0.5, lSus: 0.9, oscMod: 1, modWheel: 0, volume: 0.42 } },
    { name: 'Fat Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.53, osc3Range: 3, osc3Wave: 2, osc3Tune: 0.47, osc3On: 1, vol1: 0.7, vol2: 0.7, vol3: 0.7, cutoff: 0.5, emphasis: 0.3, contourAmt: 0.45, fDec: 0.4, fSus: 0.5, lDec: 0.5, lSus: 0.9, volume: 0.32 } },
    { name: 'Square Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 3, osc2Range: 4, osc2Wave: 3, osc2Tune: 0.5, vol1: 0.8, vol2: 0.4, cutoff: 0.5, emphasis: 0.35, contourAmt: 0.4, fDec: 0.4, fSus: 0.5, lDec: 0.5, lSus: 0.9, kbd1: 1, kbd2: 1, volume: 0.36 } },
    { name: 'Soft Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 0, osc2Range: 3, osc2Wave: 1, osc2Tune: 0.51, vol1: 0.8, vol2: 0.6, cutoff: 0.6, emphasis: 0.1, contourAmt: 0.2, fAtk: 0.1, lAtk: 0.1, fDec: 0.5, fSus: 0.7, lDec: 0.5, lSus: 1, volume: 0.39 } },
    { name: 'Glide Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 4, osc2Tune: 0.5, glideOn: 1, glide: 0.5, vol1: 0.8, vol2: 0.6, cutoff: 0.5, emphasis: 0.45, contourAmt: 0.5, fDec: 0.35, fSus: 0.5, lDec: 0.5, lSus: 0.9, volume: 0.37 } },
    { name: 'Vibrato Lead', category: 'Leads', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.51, osc3Range: 0, osc3Kbd: 0, osc3Tune: 0.6, osc3Wave: 0, oscMod: 1, modWheel: 0.25, vol1: 0.8, vol2: 0.7, cutoff: 0.55, emphasis: 0.3, contourAmt: 0.4, fDec: 0.4, fSus: 0.6, lDec: 0.5, lSus: 0.9, volume: 0.47 } },
    { name: 'Brass', category: 'Metales y cuerdas', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.5, vol1: 0.8, vol2: 0.7, cutoff: 0.3, emphasis: 0.15, contourAmt: 0.7, fAtk: 0.35, fDec: 0.5, fSus: 0.6, lAtk: 0.25, lDec: 0.5, lSus: 1, volume: 0.52 } },
    { name: 'Mono Strings', category: 'Metales y cuerdas', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.53, osc3Range: 4, osc3Wave: 2, osc3Tune: 0.47, osc3On: 1, vol1: 0.5, vol2: 0.5, vol3: 0.4, cutoff: 0.55, emphasis: 0.1, contourAmt: 0.2, lAtk: 0.45, lDec: 0.6, lSus: 1, fAtk: 0.4, fSus: 0.6, volume: 0.51 } },
    { name: 'Pad', category: 'Metales y cuerdas', values: { osc1Range: 3, osc1Wave: 4, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.52, osc3Range: 2, osc3Wave: 0, osc3On: 1, osc3Tune: 0.5, vol1: 0.6, vol2: 0.5, vol3: 0.5, cutoff: 0.45, emphasis: 0.2, contourAmt: 0.3, fAtk: 0.55, fDec: 0.7, fSus: 0.6, lAtk: 0.55, lDec: 0.7, lSus: 1, volume: 0.38 } },
    { name: 'Pluck', category: 'Teclas y plucks', values: { osc1Range: 3, osc1Wave: 3, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.5, vol1: 0.8, vol2: 0.6, cutoff: 0.3, emphasis: 0.45, contourAmt: 0.65, fDec: 0.3, fSus: 0, lDec: 0.3, lSus: 0, volume: 1 } },
    { name: 'Clav', category: 'Teclas y plucks', values: { osc1Range: 3, osc1Wave: 5, osc2Range: 3, osc2Wave: 4, osc2Tune: 0.5, vol1: 0.8, vol2: 0.7, cutoff: 0.4, emphasis: 0.35, contourAmt: 0.6, fDec: 0.25, fSus: 0.05, lDec: 0.3, lSus: 0.1, volume: 1 } },
    { name: 'Organ', category: 'Teclas y plucks', values: { osc1Range: 3, osc1Wave: 3, osc2Range: 4, osc2Wave: 3, osc2Tune: 0.5, osc3Range: 2, osc3Wave: 3, osc3On: 1, vol1: 0.6, vol2: 0.5, vol3: 0.5, cutoff: 0.8, emphasis: 0.05, contourAmt: 0, decayOn: 0, lSus: 1, lDec: 0.3, fSus: 1, volume: 0.32 } },
    { name: 'Flute', category: 'Teclas y plucks', values: { osc1Range: 3, osc1Wave: 0, osc2On: 0, noiseOn: 1, volNoise: 0.12, noiseType: 1, vol1: 0.9, cutoff: 0.5, emphasis: 0.1, contourAmt: 0.2, lAtk: 0.15, fAtk: 0.1, lDec: 0.4, lSus: 0.9, volume: 0.45 } },
    { name: 'Marimba', category: 'Teclas y plucks', values: { osc1Range: 3, osc1Wave: 0, osc2Range: 4, osc2Wave: 0, osc2Tune: 0.5, vol1: 0.9, vol2: 0.3, cutoff: 0.4, emphasis: 0.15, contourAmt: 0.35, fDec: 0.3, fSus: 0, lDec: 0.35, lSus: 0, volume: 1 } },
    { name: 'Wind', category: 'Efectos', values: { osc1On: 0, osc2On: 0, noiseOn: 1, volNoise: 0.9, noiseType: 1, cutoff: 0.4, emphasis: 0.6, contourAmt: 0.4, fAtk: 0.6, fDec: 0.6, fSus: 0.4, lAtk: 0.5, lDec: 0.6, lSus: 1, volume: 0.66 } },
    { name: 'Sweep', category: 'Efectos', values: { osc1Range: 3, osc1Wave: 2, osc2Range: 3, osc2Wave: 2, osc2Tune: 0.6, cutoff: 0.1, emphasis: 0.7, contourAmt: 1, fAtk: 0.8, fDec: 0.9, fSus: 0.5, lAtk: 0.6, lSus: 1, volume: 0.24 } },
    { name: 'Space Drone', category: 'Efectos', values: { osc1Range: 1, osc1Wave: 2, osc2Range: 2, osc2Wave: 2, osc2Tune: 0.52, osc3Range: 0, osc3Kbd: 0, osc3Tune: 0.3, osc3Wave: 0, filtMod: 1, modWheel: 0.6, vol1: 0.8, vol2: 0.6, cutoff: 0.35, emphasis: 0.45, contourAmt: 0.2, lAtk: 0.6, lDec: 0.8, lSus: 1, fSus: 0.7, volume: 0.51 } },
    { name: 'Wobble', category: 'Efectos', values: { osc1Range: 2, osc1Wave: 2, osc2On: 0, vol1: 0.9, osc3Range: 0, osc3Kbd: 0, osc3Tune: 0.65, osc3Wave: 0, filtMod: 1, modWheel: 0.8, cutoff: 0.3, emphasis: 0.5, contourAmt: 0.1, fDec: 0.5, fSus: 0.8, lDec: 0.5, lSus: 0.9, volume: 0.5 } },
    { name: 'Bleeps', category: 'Efectos', values: { osc1Range: 4, osc1Wave: 3, osc2On: 0, vol1: 0.9, osc3Range: 0, osc3Kbd: 0, osc3Tune: 0.7, osc3Wave: 3, oscMod: 1, modMix: 0.5, modWheel: 0.4, cutoff: 0.6, emphasis: 0.4, contourAmt: 0.3, fDec: 0.3, fSus: 0.2, lDec: 0.3, lSus: 0.2, volume: 0.76 } },
];
