import { Patch } from '../services/presets';
import { midiToHz } from '../services/keyboard-map';
import { Voice } from './voice';
import { DrumVoice } from './drums';

/** Lo que el motor y el looper necesitan de una nota sonando (sintetizador o percusion). */
export interface PlayingVoice {
    onEnded: () => void;
    release(fast?: boolean, when?: number): void;
    setBend(cents: number): void;
}

export function createVoice(ctx: AudioContext, destination: AudioNode, patch: Patch, midi: number,
                            velocity: number, bend: number, when?: number): PlayingVoice {
    return patch.kind == 'drums'
        ? new DrumVoice(ctx, destination, patch, midi, velocity, when)
        : new Voice(ctx, destination, patch, midiToHz(midi), velocity, bend, when);
}
