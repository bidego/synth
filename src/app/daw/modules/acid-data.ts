// Generado por acidline/scripts/gen_web.py desde el motor del plugin (ac_params.cpp) y acidline/presets/ac-presets.json: no editar a mano.

import { SynthParam, SynthPreset } from './worklet-synth.module';

export const AC_PARAMS: ReadonlyArray<SynthParam> = [
    { id: 'waveform', name: 'Waveform', choices: 2, def: 0, labels: ['Saw', 'Square'] },
    { id: 'tune', name: 'Tuning', choices: 0, def: 0.5, labels: [] },
    { id: 'cutoff', name: 'Cutoff Freq', choices: 0, def: 0.4, labels: [] },
    { id: 'resonance', name: 'Resonance', choices: 0, def: 0.65, labels: [] },
    { id: 'envMod', name: 'Env Mod', choices: 0, def: 0.6, labels: [] },
    { id: 'decay', name: 'Decay', choices: 0, def: 0.4, labels: [] },
    { id: 'accent', name: 'Accent', choices: 0, def: 0.6, labels: [] },
    { id: 'accentVel', name: 'Accent Velocity', choices: 0, def: 0.75, labels: [] },
    { id: 'slideTime', name: 'Slide Time', choices: 0, def: 0.35, labels: [] },
    { id: 'drive', name: 'Drive', choices: 0, def: 0, labels: [] },
    { id: 'volume', name: 'Volume', choices: 0, def: 0.7, labels: [] },
];

export const AC_PRESETS: ReadonlyArray<SynthPreset> = [
    { name: 'Init', category: 'Init', values: { volume: 0.6 } },
    { name: 'Classic Acid', category: 'Acidos', values: { waveform: 0, cutoff: 0.35, resonance: 0.75, envMod: 0.6, decay: 0.35, accent: 0.6, slideTime: 0.35, volume: 0.55 } },
    { name: 'Squelch', category: 'Acidos', values: { waveform: 0, cutoff: 0.3, resonance: 0.9, envMod: 0.8, decay: 0.3, accent: 0.7, slideTime: 0.3, volume: 0.46 } },
    { name: 'Rubber Slide', category: 'Acidos', values: { waveform: 0, cutoff: 0.25, resonance: 0.85, envMod: 0.9, decay: 0.25, accent: 0.5, slideTime: 0.7, volume: 0.45 } },
    { name: 'Screamer', category: 'Acidos', values: { waveform: 0, cutoff: 0.5, resonance: 0.95, envMod: 0.7, decay: 0.6, accent: 0.9, drive: 0.45, slideTime: 0.3, volume: 0.5 } },
    { name: 'Chirp', category: 'Acidos', values: { waveform: 0, cutoff: 0.4, resonance: 0.8, envMod: 0.95, decay: 0.12, accent: 0.5, slideTime: 0.2, volume: 0.56 } },
    { name: 'Long Sweep', category: 'Acidos', values: { waveform: 0, cutoff: 0.2, resonance: 0.7, envMod: 0.7, decay: 0.9, accent: 0.4, slideTime: 0.4, volume: 0.59 } },
    { name: 'Dirty Acid', category: 'Acidos', values: { waveform: 0, cutoff: 0.35, resonance: 0.8, envMod: 0.65, decay: 0.35, accent: 0.7, drive: 0.8, slideTime: 0.35, volume: 0.5 } },
    { name: 'Square Bass', category: 'Bajos', values: { waveform: 1, cutoff: 0.3, resonance: 0.5, envMod: 0.5, decay: 0.4, accent: 0.5, slideTime: 0.3, volume: 0.36 } },
    { name: 'Hollow', category: 'Bajos', values: { waveform: 1, cutoff: 0.2, resonance: 0.7, envMod: 0.4, decay: 0.5, accent: 0.6, slideTime: 0.4, volume: 0.34 } },
    { name: 'Dub Pulse', category: 'Bajos', values: { waveform: 1, cutoff: 0.15, resonance: 0.3, envMod: 0.3, decay: 0.7, accent: 0.3, slideTime: 0.5, volume: 0.33 } },
    { name: 'Soft Acid', category: 'Bajos', values: { waveform: 0, cutoff: 0.3, resonance: 0.4, envMod: 0.4, decay: 0.5, accent: 0.4, slideTime: 0.4, volume: 0.58 } },
    { name: 'Wide Open', category: 'Bajos', values: { waveform: 0, cutoff: 0.8, resonance: 0.3, envMod: 0.3, decay: 0.5, accent: 0.5, slideTime: 0.3, volume: 0.6 } },
    { name: 'Growl', category: 'Bajos', values: { waveform: 1, cutoff: 0.25, resonance: 0.8, envMod: 0.7, decay: 0.45, accent: 0.8, drive: 0.6, slideTime: 0.5, volume: 0.38 } },
];
