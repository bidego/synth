import { Observable } from 'rxjs';
import { SampleLibrary } from '../../services/sample-library';

/** Un cable une un puerto de salida con uno de entrada del mismo tipo. */
export type PortKind = 'audio' | 'note';
export type PortDir = 'in' | 'out';

export interface PortDef {
    id: string;
    kind: PortKind;
    dir: PortDir;
    label: string;
}

export interface CableModel {
    id: string;
    fromModule: string;
    fromPort: string;
    toModule: string;
    toPort: string;
}

/** Mensajes que viajan por los cables de notas (MIDI simplificado). */
export type NoteMsg =
    // `when` = instante del AudioContext en que debe sonar (el secuenciador agenda con adelanto);
    // `id` distingue notas de la misma altura que se superponen
    | { type: 'on'; midi: number; velocity: number; when?: number; id?: string }
    | { type: 'off'; midi: number; when?: number; id?: string }
    | { type: 'sustain'; on: boolean }
    | { type: 'bend'; cents: number }
    // Control change de un controlador MIDI (perillas y faders): `value` va de 0 a 127
    | { type: 'cc'; cc: number; value: number }
    | { type: 'allOff' };

/** Lo que los modulos necesitan saber del transporte (en vivo o una copia fija para el render offline). */
export interface TransportInfo {
    bpm: number;
    transpose: number;   // semitonos
    loopBeats: number;   // largo del loop en negras
}

/** El reloj en vivo que usan los secuenciadores (solo existe en el AudioContext real). */
export interface Clock extends TransportInfo {
    playing: boolean;
    recording: boolean;
    countingIn: boolean;
    position: number;    // 0..1 dentro del loop
    absBeat: number;
    beatDur: number;
    startBeat: number;   // beat del loop desde donde arranca la reproduccion
    quantize: number;
    register(client: any): void;
    unregister(client: any): void;
}

/** Todo lo que un modulo necesita del entorno; no depende de Angular ni del AudioContext en vivo. */
/** Eventos de entrada de la computadora (teclado y MIDI) para los modulos de teclado. */
export interface InputHub {
    keys: Observable<KeyboardEvent>;
    midi: Observable<NoteMsg>;
}

export interface ModuleEnv {
    ctx: BaseAudioContext;
    transport: TransportInfo;
    library: SampleLibrary;
    live: boolean;                  // false en el render offline: sin teclado, MIDI ni temporizadores
    clock?: Clock;                  // reloj del transporte (solo en vivo)
    inputs?: InputHub;              // teclado y MIDI (solo en vivo)
    run: (fn: () => void) => void;  // ejecuta dentro de la zona de Angular (para refrescar la pantalla)
    changed: () => void;            // avisa que algo cambio (autoguardado)
}

export type ModuleCategory = 'instrument' | 'io' | 'mixing' | 'effect' | 'dynamics' | 'patch';

export interface ModuleMeta {
    type: string;
    label: string;
    description: string;
    category: ModuleCategory;
    unique?: boolean;   // solo puede haber uno (ej. la salida)
}

export const CATEGORY_LABELS: { [c: string]: string } = {
    instrument: 'Instrumentos',
    io: 'Entrada y salida',
    mixing: 'Mezcla',
    effect: 'Efectos',
    dynamics: 'Dinamica',
    patch: 'Patcheras'
};
