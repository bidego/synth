import { RackModule } from '../core/module';
import { ModuleEnv, ModuleMeta } from '../core/types';
import { SynthStudioModule } from './synth-studio.module';
import { SequencerModule } from './sequencer.module';
import { ModelDModule } from './modeld.module';
import { AcidLineModule } from './acid.module';
import { PolyFiveModule } from './polyfive.module';
import { RhythmEightModule } from './rhythmeight.module';
import { JunoModule } from './juno.module';
import { MixerModule } from './mixer.module';
import { OutputModule } from './output.module';
import { KeyboardModule } from './keyboard.module';
import { SplitterModule, MergerModule } from './patchbay.module';
import { DelayModule, ReverbModule, ChorusModule, DistortionModule, EqModule, CompressorModule, LimiterModule } from './effects';

/** Catalogo de dispositivos que se pueden agregar al rack. */
export const MODULE_META: ReadonlyArray<ModuleMeta> = [
    { type: 'synth', label: 'Syntotec Synth Studio', category: 'instrument',
      description: 'Sintetizador, sampler y baterias con secuenciador propio' },
    { type: 'polyfive', label: 'Poly Five', category: 'instrument',
      description: 'Polifonico de 5 voces: dos osciladores con sync, poly-mod, filtro de 24 dB, unison y glide' },
    { type: 'rhythmeight', label: 'Rhythm Eight', category: 'instrument',
      description: 'Caja de ritmos analogica de 13 voces con secuenciador de 16 pasos, acento y shuffle' },
    { type: 'acid', label: 'Acid Line', category: 'instrument',
      description: 'Bajo acido monofonico: filtro de 18 dB con resonancia, acento y slide' },
    { type: 'modeld', label: 'Model D', category: 'instrument',
      description: 'Sintetizador monofonico de 3 osciladores y filtro de escalera, inspirado en el Minimoog' },
    { type: 'juno', label: 'Juno-106', category: 'instrument',
      description: 'Sintetizador polifonico de 6 voces: DCO, filtro de 24 dB, LFO y chorus' },
    { type: 'sequencer', label: 'Secuenciador', category: 'instrument',
      description: '4 pistas de notas en loop con piano roll; cada pista sale por su cable a un instrumento' },
    { type: 'keyboard', label: 'Teclado / MIDI', category: 'io',
      description: 'Convierte el teclado de la computadora y el MIDI en notas' },
    { type: 'output', label: 'Salida de audio', category: 'io', unique: true,
      description: 'Los parlantes: el final de la cadena' },
    { type: 'mixer', label: 'Mezclador 8 canales', category: 'mixing',
      description: 'Fader, paneo, mute, solo y medidor por canal' },
    { type: 'delay', label: 'Delay', category: 'effect',
      description: 'Eco con realimentacion, sincronizable al tempo' },
    { type: 'reverb', label: 'Reverb', category: 'effect',
      description: 'Reverberacion de convolucion' },
    { type: 'chorus', label: 'Chorus', category: 'effect',
      description: 'Ensancha el sonido con retardos modulados' },
    { type: 'distortion', label: 'Distorsion', category: 'effect',
      description: 'Saturacion con drive, tono y nivel' },
    { type: 'eq', label: 'Ecualizador 3 bandas', category: 'effect',
      description: 'Graves, medios y agudos' },
    { type: 'compressor', label: 'Compresor', category: 'dynamics',
      description: 'Umbral, relacion, ataque, release y ganancia' },
    { type: 'limiter', label: 'Limitador', category: 'dynamics',
      description: 'Un techo que la senal no puede pasar' },
    { type: 'splitter', label: 'Patchera Splitter 1>4', category: 'patch',
      description: 'Reparte una senal en cuatro salidas' },
    { type: 'merger', label: 'Patchera Merger 4>1', category: 'patch',
      description: 'Suma cuatro senales en una' }
];

export function moduleMeta(type: string): ModuleMeta | undefined {
    return MODULE_META.find(m => m.type == type);
}

export function createModule(type: string, env: ModuleEnv): RackModule | null {
    switch (type) {
        case 'synth': return new SynthStudioModule(env);
        case 'sequencer': return new SequencerModule(env);
        case 'polyfive': return new PolyFiveModule(env);
        case 'rhythmeight': return new RhythmEightModule(env);
        case 'acid': return new AcidLineModule(env);
        case 'modeld': return new ModelDModule(env);
        case 'juno': return new JunoModule(env);
        case 'keyboard': return new KeyboardModule(env);
        case 'output': return new OutputModule(env);
        case 'mixer': return new MixerModule(env);
        case 'delay': return new DelayModule(env);
        case 'reverb': return new ReverbModule(env);
        case 'chorus': return new ChorusModule(env);
        case 'distortion': return new DistortionModule(env);
        case 'eq': return new EqModule(env);
        case 'compressor': return new CompressorModule(env);
        case 'limiter': return new LimiterModule(env);
        case 'splitter': return new SplitterModule(env);
        case 'merger': return new MergerModule(env);
        default: return null;
    }
}
