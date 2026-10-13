import { Patch } from '../services/presets';
import { midiToHz } from '../services/keyboard-map';
import { KIT_NOTE_OFFSET } from '../services/gm';
import { SampleLibrary } from '../services/sample-library';
import { Voice } from './voice';
import { DrumVoice } from './drums';
import { SampleVoice } from './sample-voice';

/** Lo que el motor y el looper necesitan de una nota sonando (sintetizador, muestras o percusion). */
export interface PlayingVoice {
    onEnded: () => void;
    release(fast?: boolean, when?: number): void;
    setBend(cents: number): void;
}

// Nota que no suena (banco todavia cargando o pieza inexistente); termina enseguida
class SilentVoice implements PlayingVoice {
    public onEnded: () => void;
    constructor() {
        setTimeout(() => this.onEnded && this.onEnded());
    }
    release() {}
    setBend() {}
}

export function createVoice(ctx: BaseAudioContext, destination: AudioNode, patch: Patch, midi: number,
                            velocity: number, bend: number, when: number | undefined,
                            library: SampleLibrary): PlayingVoice {
    switch (patch.kind) {
        case 'drums':
            return new DrumVoice(ctx, destination, patch, midi, velocity, when);
        case 'sampler':
        case 'kit': {
            const kind = patch.kind == 'kit' ? 'kit' : 'melodic';
            const instrument = patch.sample && library.get(kind, patch.sample);
            if (!instrument) {
                // Todavia no esta cargado: se pide y esta nota se pierde
                if (patch.sample)
                    library.load(kind, patch.sample).catch(() => {});
                return new SilentVoice();
            }
            // Las baterias GM se tocan desde la fila de abajo (Do3 = bombo)
            const note = kind == 'kit' ? midi - KIT_NOTE_OFFSET : midi;
            return new SampleVoice(ctx, destination, patch, note, velocity, bend, when, instrument);
        }
        default:
            return new Voice(ctx, destination, patch, midiToHz(midi), velocity, bend, when);
    }
}
