export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface OscConfig {
    wave: WaveType;
    frequency: number;
    volume: number;
    key: string;
}

export interface Preset {
    name: string;
    description: string;
    oscs: Array<OscConfig>;
}

// Frecuencias (Hz) de las notas usadas
const C2 = 65.41, F2 = 87.31, G2 = 98.00;
const C3 = 130.81, D3 = 146.83, G3 = 196.00, A3 = 220.00;
const C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392.00;
const C5 = 523.25, E5 = 659.26, G5 = 783.99;

export const PRESETS: Array<Preset> = [
    {
        name: 'Acorde C',
        description: 'Q = Do, W = Mi, E = Sol (tocalas juntas para el acorde)',
        oscs: [
            { wave: 'sine', frequency: C4, volume: 0.1, key: 'q' },
            { wave: 'sine', frequency: E4, volume: 0.1, key: 'w' },
            { wave: 'sine', frequency: G4, volume: 0.1, key: 'e' }
        ]
    },
    {
        name: 'Power chords',
        description: 'A = Do5, S = Re5: una sola tecla dispara 3 osciladores',
        oscs: [
            { wave: 'sawtooth', frequency: C3, volume: 0.06, key: 'a' },
            { wave: 'sawtooth', frequency: G3, volume: 0.06, key: 'a' },
            { wave: 'square', frequency: C4, volume: 0.04, key: 'a' },
            { wave: 'sawtooth', frequency: D3, volume: 0.06, key: 's' },
            { wave: 'sawtooth', frequency: A3, volume: 0.06, key: 's' },
            { wave: 'square', frequency: D4, volume: 0.04, key: 's' }
        ]
    },
    {
        name: 'Bajo + Lead',
        description: 'A/S/D = bajos (Do, Sol, Fa), Q/W/E = lead (Do, Mi, Sol)',
        oscs: [
            { wave: 'square', frequency: C2, volume: 0.15, key: 'a' },
            { wave: 'square', frequency: G2, volume: 0.15, key: 's' },
            { wave: 'square', frequency: F2, volume: 0.15, key: 'd' },
            { wave: 'triangle', frequency: C5, volume: 0.08, key: 'q' },
            { wave: 'triangle', frequency: E5, volume: 0.08, key: 'w' },
            { wave: 'triangle', frequency: G5, volume: 0.08, key: 'e' }
        ]
    },
    {
        name: 'Pad desafinado',
        description: 'A: tres triangulos levemente desafinados (efecto coro)',
        oscs: [
            { wave: 'triangle', frequency: 220, volume: 0.07, key: 'a' },
            { wave: 'triangle', frequency: 221.5, volume: 0.07, key: 'a' },
            { wave: 'triangle', frequency: 218.5, volume: 0.07, key: 'a' }
        ]
    },
    {
        name: 'Laser',
        description: 'A y S: dientes de sierra desafinados con batido fuerte',
        oscs: [
            { wave: 'sawtooth', frequency: 440, volume: 0.05, key: 'a' },
            { wave: 'sawtooth', frequency: 447, volume: 0.05, key: 'a' },
            { wave: 'sawtooth', frequency: 880, volume: 0.04, key: 's' },
            { wave: 'sawtooth', frequency: 893, volume: 0.04, key: 's' }
        ]
    }
];
