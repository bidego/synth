export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';
export type LfoTarget = 'pitch' | 'filter' | 'amp';

export interface EnvConfig {
    attack: number;   // s
    decay: number;    // s
    sustain: number;  // 0..1
    release: number;  // s
}

export interface FilterConfig {
    type: FilterType;
    cutoff: number;     // Hz
    q: number;          // resonancia
    envAmount: number;  // Hz que suma la envolvente de filtro al disparar
    envDecay: number;   // s que tarda en volver al cutoff
}

export interface LfoConfig {
    rate: number;       // Hz
    depth: number;      // pitch: cents, filter: Hz, amp: fraccion del volumen (0..1)
    target: LfoTarget;
}

export interface OscConfig {
    wave: WaveType;
    frequency: number;
    volume: number;
    key: string;
    detune?: number;    // cents
    env?: EnvConfig;
    filter?: FilterConfig;
    lfo?: LfoConfig;
}

export interface FxConfig {
    delayTime: number;      // s
    delayFeedback: number;  // 0..0.9
    delayMix: number;       // 0..1
    reverbMix: number;      // 0..1
}

export interface Preset {
    name: string;
    category: string;
    description: string;
    fx?: Partial<FxConfig>;
    oscs: Array<OscConfig>;
}

export const DEFAULT_ENV: EnvConfig = { attack: 0.005, decay: 0.1, sustain: 1, release: 0.05 };
export const DEFAULT_FILTER: FilterConfig = { type: 'lowpass', cutoff: 18000, q: 0.7, envAmount: 0, envDecay: 0.3 };
export const DEFAULT_LFO: LfoConfig = { rate: 5, depth: 0, target: 'pitch' };
export const DEFAULT_FX: FxConfig = { delayTime: 0.3, delayFeedback: 0.35, delayMix: 0, reverbMix: 0 };

// --- Helpers para escribir presets legibles ---

const NOTE_INDEX = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };

/** 'C#4' | 'Bb3' -> Hz */
export function note(name: string): number {
    const [, letter, accidental, octave] = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
    const midi = (parseInt(octave, 10) + 1) * 12 + NOTE_INDEX[letter] + shift;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

const env = (attack: number, decay: number, sustain: number, release: number): EnvConfig =>
    ({ attack, decay, sustain, release });
const filter = (type: FilterType, cutoff: number, q: number, envAmount = 0, envDecay = 0.3): FilterConfig =>
    ({ type, cutoff, q, envAmount, envDecay });
const lfo = (rate: number, depth: number, target: LfoTarget): LfoConfig => ({ rate, depth, target });

/** Un oscilador de un preset; `ratio` multiplica la frecuencia (armonicos / parciales). */
const layer = (key: string, noteName: string, o: Partial<OscConfig>, ratio = 1): OscConfig =>
    ({ wave: 'sawtooth', volume: 0.06, ...o, key, frequency: note(noteName) * ratio });

/** Cada nota se apila `detunes.length` veces con distinto detune (efecto supersaw/coro). */
const stack = (keys: string[], notes: string[], o: Partial<OscConfig>, detunes: number[]): OscConfig[] =>
    keys.reduce((acc, key, i) =>
        acc.concat(detunes.map(d => layer(key, notes[i], { ...o, detune: d }))), [] as OscConfig[]);

/** Un acorde por tecla: cada nota del acorde con un detune levemente distinto. */
const chords = (chordMap: { [key: string]: string[] }, o: Partial<OscConfig>, spread: number[]): OscConfig[] =>
    Object.keys(chordMap).reduce((acc, key) =>
        acc.concat(chordMap[key].map((n, i) => layer(key, n, { ...o, detune: spread[i % spread.length] }))), [] as OscConfig[]);

export const PRESETS: Array<Preset> = [
    {
        name: 'Supersaw Lead',
        category: 'Lead',
        description: 'A/S/D/F = Do, Mi, Sol, Do agudo. Sierras desafinadas, filtro con barrido y vibrato',
        fx: { delayTime: 0.375, delayFeedback: 0.4, delayMix: 0.25, reverbMix: 0.2 },
        oscs: stack(['a', 's', 'd', 'f'], ['C4', 'E4', 'G4', 'C5'], {
            volume: 0.05,
            env: env(0.01, 0.3, 0.7, 0.25),
            filter: filter('lowpass', 3500, 3, 2500, 0.35),
            lfo: lfo(5.5, 10, 'pitch')
        }, [-10, 10])
    },
    {
        name: 'Analog Brass',
        category: 'Brass',
        description: 'A/S/D/F = Do, Sol, Do, Mi. Ataque lento y apertura de filtro tipo metales',
        fx: { reverbMix: 0.18 },
        oscs: stack(['a', 's', 'd', 'f'], ['C3', 'G3', 'C4', 'E4'], {
            volume: 0.06,
            env: env(0.08, 0.2, 0.75, 0.15),
            filter: filter('lowpass', 800, 2, 3500, 0.25)
        }, [-6, 6])
    },
    {
        name: 'Warm Pad',
        category: 'Pad',
        description: 'A = Do maj7, S = La min7. Ataque y release largos, el filtro respira solo',
        fx: { delayTime: 0.5, delayFeedback: 0.4, delayMix: 0.2, reverbMix: 0.6 },
        oscs: chords({
            a: ['C3', 'E3', 'G3', 'B3'],
            s: ['A2', 'C3', 'E3', 'G3']
        }, {
            volume: 0.05,
            env: env(1.2, 1, 0.8, 2),
            filter: filter('lowpass', 1100, 1),
            lfo: lfo(0.2, 400, 'filter')
        }, [-6, 0, 6, 0])
    },
    {
        name: 'Strings Ensemble',
        category: 'Pad',
        description: 'A = Do, S = Fa, D = Sol (acordes mayores). Cuerdas con ataque suave',
        fx: { reverbMix: 0.5 },
        oscs: chords({
            a: ['C3', 'E3', 'G3'],
            s: ['F3', 'A3', 'C4'],
            d: ['G3', 'B3', 'D4']
        }, {
            volume: 0.05,
            env: env(0.6, 0.5, 0.85, 1.2),
            filter: filter('lowpass', 2500, 0.8),
            lfo: lfo(5, 6, 'pitch')
        }, [-8, 0, 8])
    },
    {
        name: 'Acid Bass',
        category: 'Bass',
        description: 'A/S/D/F = Do, Mib, Fa, Sol graves. Resonancia alta y barrido corto (303)',
        fx: { delayTime: 0.22, delayFeedback: 0.4, delayMix: 0.25 },
        oscs: stack(['a', 's', 'd', 'f'], ['C2', 'Eb2', 'F2', 'G2'], {
            volume: 0.12,
            env: env(0.003, 0.15, 0.4, 0.08),
            filter: filter('lowpass', 400, 12, 2500, 0.18)
        }, [0])
    },
    {
        name: 'Wobble Bass',
        category: 'Bass',
        description: 'A/S/D = Do, Fa, Sol graves. Un LFO mueve el filtro (dubstep)',
        fx: { reverbMix: 0.1 },
        oscs: stack(['a', 's', 'd'], ['C2', 'F2', 'G2'], {
            volume: 0.1,
            env: env(0.005, 0.1, 0.9, 0.1),
            filter: filter('lowpass', 500, 10),
            lfo: lfo(2, 700, 'filter')
        }, [-8, 8])
    },
    {
        name: 'Electric Piano',
        category: 'Keys',
        description: 'A/S/D/F = Do, Mi, Sol, Do agudo. Tono + armonico corto, con tremolo',
        fx: { reverbMix: 0.25 },
        oscs: ['a', 's', 'd', 'f'].reduce((acc, key, i) => {
            const n = ['C4', 'E4', 'G4', 'C5'][i];
            return acc.concat([
                layer(key, n, {
                    wave: 'triangle', volume: 0.1, env: env(0.005, 1.2, 0.1, 0.4),
                    lfo: lfo(4.5, 0.3, 'amp')
                }),
                layer(key, n, { wave: 'sine', volume: 0.04, env: env(0.003, 0.25, 0, 0.2) }, 2)
            ]);
        }, [] as OscConfig[])
    },
    {
        name: 'Glass Bell',
        category: 'Keys',
        description: 'A/S/D = Do, Mi, Sol agudos. Parciales inarmonicos que decaen distinto',
        fx: { delayTime: 0.45, delayFeedback: 0.45, delayMix: 0.3, reverbMix: 0.55 },
        oscs: ['a', 's', 'd'].reduce((acc, key, i) => {
            const n = ['C5', 'E5', 'G5'][i];
            return acc.concat([
                layer(key, n, { wave: 'sine', volume: 0.08, env: env(0.002, 2.5, 0, 1.5) }, 1),
                layer(key, n, { wave: 'sine', volume: 0.04, env: env(0.002, 1.2, 0, 0.8) }, 2.76),
                layer(key, n, { wave: 'sine', volume: 0.02, env: env(0.002, 0.5, 0, 0.4) }, 5.4)
            ]);
        }, [] as OscConfig[])
    },
    {
        name: 'Church Organ',
        category: 'Keys',
        description: 'A/S/D = Do, Mi, Sol. Tres barras de armonicos con efecto Leslie',
        fx: { reverbMix: 0.45 },
        oscs: ['a', 's', 'd'].reduce((acc, key, i) => {
            const n = ['C4', 'E4', 'G4'][i];
            return acc.concat([1, 2, 3].map((ratio, j) => layer(key, n, {
                wave: 'sine',
                volume: [0.07, 0.05, 0.03][j],
                env: env(0.01, 0.05, 1, 0.08),
                lfo: lfo(6.5, 0.25, 'amp')
            }, ratio)));
        }, [] as OscConfig[])
    },
    {
        name: 'Sci-Fi Siren',
        category: 'FX',
        description: 'A = sirena, S = onda cuadrada que respira, D = barrido lento grave',
        fx: { delayTime: 0.33, delayFeedback: 0.5, delayMix: 0.35, reverbMix: 0.3 },
        oscs: [
            layer('a', 'A4', { wave: 'sawtooth', volume: 0.05, env: env(0.05, 0.1, 1, 0.3), lfo: lfo(2.5, 700, 'pitch') }),
            layer('s', 'A5', {
                wave: 'square', volume: 0.04, env: env(0.01, 0.1, 1, 0.2),
                filter: filter('bandpass', 1500, 8), lfo: lfo(7, 1200, 'filter')
            }),
            layer('d', 'A3', { wave: 'sawtooth', volume: 0.06, env: env(0.3, 0.2, 1, 1), lfo: lfo(0.5, 1200, 'pitch') })
        ]
    }
];
