// Generado por rhythmeight/scripts/gen_web.py desde el motor del plugin (re_params.cpp) y rhythmeight/presets/re-presets.json: no editar a mano.

import { SynthParam, SynthPreset } from './worklet-synth.module';

/** Un sonido de la caja de ritmos: los controles y el patron (un texto de 16 caracteres por instrumento: '.', 'x' golpe, 'X' acento). */
export interface DrumPreset extends SynthPreset {
    pattern: { [inst: string]: string };
}

export const RE_INSTRUMENTS: ReadonlyArray<string> = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cl', 'cp', 'ma', 'cb', 'cy', 'oh', 'ch'];

export const RE_PARAMS: ReadonlyArray<SynthParam> = [
    { id: 'bdLevel', name: 'Bass Drum Level', choices: 0, def: 0.75, labels: [] },
    { id: 'bdTune', name: 'Bass Drum Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'bdDecay', name: 'Bass Drum Decay', choices: 0, def: 0.5, labels: [] },
    { id: 'bdTone', name: 'Bass Drum Tone', choices: 0, def: 0.4, labels: [] },
    { id: 'sdLevel', name: 'Snare Level', choices: 0, def: 0.75, labels: [] },
    { id: 'sdTune', name: 'Snare Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'sdTone', name: 'Snare Tone', choices: 0, def: 0.5, labels: [] },
    { id: 'sdSnappy', name: 'Snare Snappy', choices: 0, def: 0.5, labels: [] },
    { id: 'ltLevel', name: 'Low Tom Level', choices: 0, def: 0.75, labels: [] },
    { id: 'ltTune', name: 'Low Tom Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'ltDecay', name: 'Low Tom Decay', choices: 0, def: 0.5, labels: [] },
    { id: 'mtLevel', name: 'Mid Tom Level', choices: 0, def: 0.75, labels: [] },
    { id: 'mtTune', name: 'Mid Tom Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'mtDecay', name: 'Mid Tom Decay', choices: 0, def: 0.5, labels: [] },
    { id: 'htLevel', name: 'Hi Tom Level', choices: 0, def: 0.75, labels: [] },
    { id: 'htTune', name: 'Hi Tom Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'htDecay', name: 'Hi Tom Decay', choices: 0, def: 0.5, labels: [] },
    { id: 'rsLevel', name: 'Rim Shot Level', choices: 0, def: 0.7, labels: [] },
    { id: 'clLevel', name: 'Claves Level', choices: 0, def: 0.7, labels: [] },
    { id: 'cpLevel', name: 'Hand Clap Level', choices: 0, def: 0.75, labels: [] },
    { id: 'maLevel', name: 'Maracas Level', choices: 0, def: 0.7, labels: [] },
    { id: 'cbLevel', name: 'Cowbell Level', choices: 0, def: 0.7, labels: [] },
    { id: 'cbTune', name: 'Cowbell Tune', choices: 0, def: 0.5, labels: [] },
    { id: 'cyLevel', name: 'Cymbal Level', choices: 0, def: 0.7, labels: [] },
    { id: 'cyTone', name: 'Cymbal Tone', choices: 0, def: 0.5, labels: [] },
    { id: 'cyDecay', name: 'Cymbal Decay', choices: 0, def: 0.5, labels: [] },
    { id: 'ohLevel', name: 'Open Hat Level', choices: 0, def: 0.7, labels: [] },
    { id: 'ohDecay', name: 'Open Hat Decay', choices: 0, def: 0.4, labels: [] },
    { id: 'chLevel', name: 'Closed Hat Level', choices: 0, def: 0.7, labels: [] },
    { id: 'accent', name: 'Accent', choices: 0, def: 0.6, labels: [] },
    { id: 'shuffle', name: 'Shuffle', choices: 0, def: 0, labels: [] },
    { id: 'tempo', name: 'Tempo', choices: 0, def: 0.4, labels: [] },
    { id: 'steps', name: 'Pattern Length', choices: 4, def: 0, labels: ['16', '12', '8', '4'] },
    { id: 'sync', name: 'Sync', choices: 2, def: 0, labels: ['Internal', 'Host'] },
    { id: 'run', name: 'Run', choices: 2, def: 0, labels: ['Stop', 'Run'] },
    { id: 'volume', name: 'Volume', choices: 0, def: 0.7, labels: [] },
];

export const RE_PRESETS: ReadonlyArray<DrumPreset> = [
    { name: 'Classic 808', category: 'Basicos', values: { tempo: 0.35 }, pattern: { bd: 'X.....x...x.....', sd: '....X.......X...', ch: 'x.x.x.x.x.x.x.x.', oh: '......x.......x.', cp: '............x...' } },
    { name: 'Boom Bap', category: 'Hip hop', values: { tempo: 0.25, shuffle: 0.25, bdDecay: 0.6, bdTune: 0.4, sdTone: 0.6, sdSnappy: 0.4 }, pattern: { bd: 'X.....x...x.x...', sd: '....X.......X...', ch: 'x.x.x.x.x.x.x.x.', oh: '..............x.', rs: '.........x......' } },
    { name: 'Four on the Floor', category: 'House', values: { tempo: 0.42, bdTone: 0.55, bdDecay: 0.45, ohDecay: 0.3 }, pattern: { bd: 'X...X...X...X...', cp: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.', oh: '..x...x...x...x.', cy: 'x...............' } },
    { name: 'Electro', category: 'Electro', values: { tempo: 0.44, bdDecay: 0.4, sdTune: 0.6, sdSnappy: 0.7, cbTune: 0.6 }, pattern: { bd: 'X..x..x...x..x..', sd: '....X.......X...', cp: '....x.......x...', ch: 'x.xxx.xxx.xxx.xx', cb: '.......x........', oh: '..x.......x.....' } },
    { name: 'Miami Bass', category: 'Bass', values: { tempo: 0.32, bdTune: 0.25, bdDecay: 0.9, bdTone: 0.3, ltTune: 0.4, ltDecay: 0.8 }, pattern: { bd: 'X..x..x.X.....x.', sd: '....X.......X...', cp: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.', lt: '..............x.', cb: '...x.......x....' } },
    { name: 'Trap', category: 'Trap', values: { tempo: 0.5, bdTune: 0.2, bdDecay: 0.95, sdTone: 0.7, sdTune: 0.65, chLevel: 0.6 }, pattern: { bd: 'X.......x..x....', sd: '........X.......', cp: '........x.......', ch: 'x.x.xxx.x.x.x.xx', oh: '.............x..', ht: '...............x' } },
    { name: 'Techno', category: 'Techno', values: { tempo: 0.45, bdTone: 0.6, bdDecay: 0.4, cyDecay: 0.7, cyTone: 0.6 }, pattern: { bd: 'X...X...X...X...', cp: '....x.......x...', ch: '.x.x.x.x.x.x.x.x', oh: 'x...............', cy: '..............x.', rs: '...x.......x....' } },
    { name: 'Latin', category: 'Latin', values: { tempo: 0.3, cbTune: 0.45, maLevel: 0.6, htTune: 0.6, mtTune: 0.45 }, pattern: { bd: 'X.......X.......', cl: 'X..x..x...x.x...', ma: 'x.x.x.x.x.x.x.x.', cb: '..x...x...x...x.', ht: '...x............', mt: '.......x........', lt: '.............x..' } },
    { name: 'Funk Shuffle', category: 'Funk', values: { tempo: 0.29, shuffle: 0.6, sdSnappy: 0.35, bdDecay: 0.4 }, pattern: { bd: 'X..x..x...x....x', sd: '....X..x....X...', ch: 'x.x.x.x.x.x.x.x.', oh: '......x.......x.', cp: '.x..............' } },
    { name: 'Breakbeat', category: 'Breaks', values: { tempo: 0.475, sdTone: 0.55, sdSnappy: 0.6 }, pattern: { bd: 'X.....x...x.....', sd: '....X..x.x..X...', ch: 'x.x.x.x.x.x.x.x.', oh: '..............x.', cy: 'x...............' } },
    { name: 'Tom Fill', category: 'Fills', values: { tempo: 0.4, ltDecay: 0.7, mtDecay: 0.6, htDecay: 0.5 }, pattern: { bd: 'X...............', sd: 'X.x.x.x.........', ht: '..x.x.x.........', mt: '......x.x.......', lt: '............x.x.', cy: 'x...............' } },
    { name: 'Rim Groove', category: 'Groove', values: { tempo: 0.36, bdDecay: 0.35, rsLevel: 0.85, clLevel: 0.8 }, pattern: { bd: 'X..x....x..x....', rs: '....x..x....x...', cl: '..x...x...x.x...', ch: 'x.x.x.x.x.x.x.x.', ma: '.x.x.x.x.x.x.x.x', oh: '..x...........x.' } },
];
