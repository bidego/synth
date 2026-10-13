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
    cutoff: number;     // Hz, medido en el Do central
    q: number;          // resonancia
    envAmount: number;  // Hz que suma la envolvente de filtro al disparar
    envDecay: number;   // s que tarda en volver al cutoff
    track: number;      // 0..1: cuanto sigue el cutoff a la nota tocada
}

export interface LfoConfig {
    rate: number;       // Hz
    depth: number;      // pitch: cents, filter: Hz, amp: 0..1
    target: LfoTarget;
}

/** Un oscilador del patch. Cada nota tocada lo instancia. */
export interface LayerConfig {
    wave: WaveType;
    ratio: number;      // multiplicador de frecuencia (octavas, armonicos, parciales)
    detune: number;     // cents
    volume: number;     // 0..1 relativo dentro del patch
    env?: EnvConfig;    // envolvente propia; si no hay se usa la del patch
}

export interface FxConfig {
    delayTime: number;      // s
    delayFeedback: number;  // 0..0.9
    delayMix: number;       // 0..1
    reverbMix: number;      // 0..1
}

export interface Patch {
    kind?: 'synth' | 'drums';   // 'drums': cada nota (por pitch class) dispara un instrumento de percusion
    drumStyle?: '808' | 'punch';
    name: string;
    category: string;
    description: string;
    layers: Array<LayerConfig>;
    env: EnvConfig;
    filter: FilterConfig;
    lfo: LfoConfig;
    level: number;          // volumen del patch
    octave: number;         // octava inicial del teclado
    fx?: Partial<FxConfig>;
}
export type Preset = Patch;

export const DEFAULT_ENV: EnvConfig = { attack: 0.005, decay: 0.1, sustain: 1, release: 0.05 };
export const DEFAULT_FILTER: FilterConfig = { type: 'lowpass', cutoff: 18000, q: 0.7, envAmount: 0, envDecay: 0.3, track: 0.5 };
export const DEFAULT_LFO: LfoConfig = { rate: 5, depth: 0, target: 'pitch' };
export const DEFAULT_FX: FxConfig = { delayTime: 0.3, delayFeedback: 0.35, delayMix: 0, reverbMix: 0 };

export const clonePatch = (p: Patch): Patch => JSON.parse(JSON.stringify(p));

// --- Helpers para escribir presets legibles ---

const env = (attack: number, decay: number, sustain: number, release: number): EnvConfig =>
    ({ attack, decay, sustain, release });
const filter = (type: FilterType, cutoff: number, q: number, envAmount = 0, envDecay = 0.3, track = 0.5): FilterConfig =>
    ({ type, cutoff, q, envAmount, envDecay, track });
const lfo = (rate: number, depth: number, target: LfoTarget): LfoConfig => ({ rate, depth, target });
const layer = (wave: WaveType, o: Partial<LayerConfig> = {}): LayerConfig =>
    ({ wave, ratio: 1, detune: 0, volume: 0.5, ...o });

const patch = (name: string, category: string, description: string, o: Partial<Patch>): Patch => ({
    name, category, description,
    layers: [layer('sawtooth')],
    env: DEFAULT_ENV,
    filter: DEFAULT_FILTER,
    lfo: DEFAULT_LFO,
    level: 0.3,
    octave: 0,
    ...o
});

export const PRESETS: Array<Preset> = [
    patch('Supersaw Lead', 'Lead', 'Tres sierras desafinadas, filtro con barrido y vibrato', {
        layers: [layer('sawtooth', { detune: -14, volume: 0.4 }), layer('sawtooth', { volume: 0.4 }), layer('sawtooth', { detune: 14, volume: 0.4 })],
        env: env(0.01, 0.3, 0.7, 0.25),
        filter: filter('lowpass', 3500, 3, 2500, 0.35),
        lfo: lfo(5.5, 10, 'pitch'),
        fx: { delayTime: 0.375, delayFeedback: 0.4, delayMix: 0.25, reverbMix: 0.2 }
    }),
    patch('Chiptune', 'Lead', 'Cuadradas a lo consola de 8 bits, con vibrato rapido', {
        layers: [layer('square', { volume: 0.4 }), layer('square', { ratio: 2, volume: 0.15, detune: 6 })],
        env: env(0.002, 0.1, 0.6, 0.05),
        lfo: lfo(6.5, 15, 'pitch'),
        fx: { delayTime: 0.15, delayFeedback: 0.3, delayMix: 0.2 }
    }),
    patch('Analog Brass', 'Brass', 'Ataque lento y apertura de filtro tipo metales', {
        layers: [layer('sawtooth', { detune: -6 }), layer('sawtooth', { detune: 6 })],
        env: env(0.08, 0.2, 0.75, 0.15),
        filter: filter('lowpass', 800, 2, 3500, 0.25),
        fx: { reverbMix: 0.18 }
    }),
    patch('Warm Pad', 'Pad', 'Ataque y release largos, el filtro respira solo', {
        layers: [layer('sawtooth', { detune: -7, volume: 0.35 }), layer('sawtooth', { detune: 7, volume: 0.35 }), layer('triangle', { ratio: 0.5, volume: 0.4 })],
        env: env(1.2, 1, 0.8, 2),
        filter: filter('lowpass', 1100, 1),
        lfo: lfo(0.2, 400, 'filter'),
        fx: { delayTime: 0.5, delayFeedback: 0.4, delayMix: 0.2, reverbMix: 0.6 }
    }),
    patch('Strings Ensemble', 'Pad', 'Cuerdas con ataque suave y vibrato lento', {
        layers: [layer('sawtooth', { detune: -9, volume: 0.35 }), layer('sawtooth', { volume: 0.35 }), layer('sawtooth', { detune: 9, volume: 0.35 })],
        env: env(0.6, 0.5, 0.85, 1.2),
        filter: filter('lowpass', 2500, 0.8),
        lfo: lfo(5, 6, 'pitch'),
        fx: { reverbMix: 0.5 }
    }),
    patch('Acid Bass', 'Bass', 'Resonancia alta y barrido corto (303)', {
        layers: [layer('sawtooth', { volume: 0.7 })],
        env: env(0.003, 0.15, 0.4, 0.08),
        filter: filter('lowpass', 500, 12, 2500, 0.18, 0.3),
        octave: -1,
        level: 0.35,
        fx: { delayTime: 0.22, delayFeedback: 0.4, delayMix: 0.25 }
    }),
    patch('Wobble Bass', 'Bass', 'Un LFO mueve el filtro (dubstep)', {
        layers: [layer('sawtooth', { detune: -8, volume: 0.5 }), layer('sawtooth', { detune: 8, volume: 0.5 })],
        env: env(0.005, 0.1, 0.9, 0.1),
        filter: filter('lowpass', 500, 10, 0, 0.3, 0.3),
        lfo: lfo(2, 700, 'filter'),
        octave: -1,
        fx: { reverbMix: 0.1 }
    }),
    patch('Electric Piano', 'Keys', 'Tono + armonico corto, con tremolo', {
        layers: [layer('triangle', { volume: 0.6, env: env(0.005, 1.2, 0.1, 0.4) }), layer('sine', { ratio: 2, volume: 0.25, env: env(0.003, 0.25, 0, 0.2) })],
        lfo: lfo(4.5, 0.3, 'amp'),
        fx: { reverbMix: 0.25 }
    }),
    patch('Pluck', 'Keys', 'Sierra con barrido de filtro muy corto', {
        layers: [layer('sawtooth', { volume: 0.5 }), layer('square', { detune: 5, volume: 0.3 })],
        env: env(0.002, 0.25, 0, 0.2),
        filter: filter('lowpass', 1200, 3, 4000, 0.15),
        fx: { delayTime: 0.28, delayFeedback: 0.35, delayMix: 0.25, reverbMix: 0.2 }
    }),
    patch('Glass Bell', 'Keys', 'Parciales inarmonicos que decaen distinto', {
        layers: [
            layer('sine', { volume: 0.5, env: env(0.002, 2.5, 0, 1.5) }),
            layer('sine', { ratio: 2.76, volume: 0.25, env: env(0.002, 1.2, 0, 0.8) }),
            layer('sine', { ratio: 5.4, volume: 0.12, env: env(0.002, 0.5, 0, 0.4) })
        ],
        octave: 1,
        fx: { delayTime: 0.45, delayFeedback: 0.45, delayMix: 0.3, reverbMix: 0.55 }
    }),
    patch('Church Organ', 'Keys', 'Barras de armonicos con efecto Leslie', {
        layers: [
            layer('sine', { ratio: 0.5, volume: 0.3 }), layer('sine', { volume: 0.5 }),
            layer('sine', { ratio: 2, volume: 0.35 }), layer('sine', { ratio: 3, volume: 0.2 }),
            layer('sine', { ratio: 4, volume: 0.12 })
        ],
        env: env(0.01, 0.05, 1, 0.08),
        lfo: lfo(6.5, 0.25, 'amp'),
        fx: { reverbMix: 0.45 }
    }),
    patch('Drum Machine', 'Drums', 'Kit de percusion: Z=bombo, D=caja, V=hat, X/C/B/N/M toms y mas (mismo kit en cada octava)', {
        kind: 'drums', drumStyle: 'punch', level: 0.5,
        fx: { reverbMix: 0.12 }
    }),
    patch('808 Kit', 'Drums', 'Bombo largo y caja electronica estilo TR-808', {
        kind: 'drums', drumStyle: '808', level: 0.55,
        fx: { delayTime: 0.19, delayFeedback: 0.25, delayMix: 0.1, reverbMix: 0.1 }
    }),
    patch('Sci-Fi Siren', 'FX', 'Pitch LFO enorme: cada nota es una sirena', {
        layers: [layer('sawtooth', { volume: 0.5 }), layer('square', { ratio: 2, detune: 12, volume: 0.25 })],
        env: env(0.05, 0.1, 1, 0.3),
        lfo: lfo(2.5, 700, 'pitch'),
        fx: { delayTime: 0.33, delayFeedback: 0.5, delayMix: 0.35, reverbMix: 0.3 }
    })
];
