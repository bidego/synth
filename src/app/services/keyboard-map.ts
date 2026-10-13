/**
 * Disposicion tipo DAW sobre el teclado fisico (por `event.code`, asi funciona en cualquier
 * layout). Valor = semitonos sobre el Do base de la octava actual.
 *
 *  Fila de arriba (desde el Do de una octava mas):   2 3   5 6 7   9 0
 *                                                   Q W E R T Y U I O P
 *  Fila de abajo (Do base):                           S D   G H J   L ;
 *                                                   Z X C V B N M , . /
 */
export const KEY_OFFSETS: { [code: string]: number } = {
    KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
    Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
    KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
    Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28
};

export const TOP_ROW = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY',
    'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP'];
export const BOTTOM_ROW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ',
    'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];

/** Etiqueta por defecto (layout US) de una tecla fisica. */
export function defaultLabel(code: string): string {
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    return ({ Comma: ',', Period: '.', Slash: '/', Semicolon: ';' } as any)[code] || code;
}

export const BASE_MIDI = 48; // Do3: Z con octava 0
export const KEY_SPAN = 29;  // semitonos cubiertos entre Z y P

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi: number): string => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
