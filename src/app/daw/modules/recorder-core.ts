/**
 * Logica pura del Grabador 8 pistas (sin Web Audio ni Angular, asi se prueba en Node):
 * armado de la toma a partir de los bloques del worklet, agenda de la reproduccion en loop y miniatura de la onda.
 */

export const REC_TRACKS = 8;

/** Un bloque que manda el worklet: `frame` es el cuadro (muestra) del AudioContext en que empieza. */
export interface RecChunk {
    frame: number;
    l: Float32Array;
    r: Float32Array;
}

/** Los metadatos de una toma (lo unico que va al proyecto; el audio queda en IndexedDB). */
export interface TakeMeta {
    id: string;
    len: number;     // segundos
    rate: number;    // frecuencia de muestreo
    bpm: number;     // tempo del rack al grabar
    start: number;   // negras desde el comienzo del loop en que empieza la toma
    ch: number;      // 1 = mono, 2 = estereo
}

/**
 * Arma la toma: `n` cuadros a partir del cuadro `f0` del AudioContext, con los bloques recibidos (los huecos quedan en silencio).
 * Si los dos canales resultan identicos se guarda uno solo (mono): la mayoria de las fuentes del rack son mono duplicado.
 */
export function assembleTake(chunks: Array<RecChunk>, f0: number, n: number): Array<Float32Array> {
    const l = new Float32Array(n), r = new Float32Array(n);
    for (const c of chunks) {
        const from = Math.max(c.frame, f0);
        const to = Math.min(c.frame + c.l.length, f0 + n);
        if (to <= from)
            continue;
        l.set(c.l.subarray(from - c.frame, to - c.frame), from - f0);
        r.set(c.r.subarray(from - c.frame, to - c.frame), from - f0);
    }
    for (let i = 0; i < n; i++)
        if (l[i] !== r[i])
            return [l, r];
    return [l];
}

export interface PlayItem {
    when: number;       // instante (AudioContext) en que suena
    offset: number;     // desde que segundo de la toma
    duration: number;   // cuanto de la toma (segundos de la toma)
    rate: number;       // velocidad de reproduccion
    clipped: boolean;   // se corta antes de su final (fin del loop): lleva fundido
}

/**
 * Que hay que agendar de una toma en la ventana [b0, b1) (negras absolutas desde el inicio del loop; el loop se repite).
 *
 * La toma esta en segundos al tempo en que se grabo. Se reproduce con rate = bpm actual / bpm de grabacion, asi ocupa siempre
 * los mismos beats y sigue los cambios de tempo (a costa de cambiar el tono: velocidad de cinta, no estiramiento).
 * `fresh`: primera ventana despues de Play o de un salto: tambien arrancan las tomas que ya venian sonando (a mitad de camino).
 */
export function planPlayback(b0: number, b1: number, startTime: number, beatDur: number, loopBeats: number,
                             take: { start: number; len: number; bpm: number }, fresh: boolean, now: number): Array<PlayItem> {
    const out: Array<PlayItem> = [];
    if (!(take.len > 0) || !(take.bpm > 0) || take.start >= loopBeats || take.start < 0 || b1 <= b0)
        return out;
    const rate = (60 / beatDur) / take.bpm;
    const lenBeats = take.len * take.bpm / 60;
    const span = Math.min(lenBeats, loopBeats - take.start);   // lo que entra en el loop
    const clippedAll = span < lenBeats - 1e-9;
    for (let k = Math.max(-1, Math.floor((b0 - take.start - span) / loopBeats)); k * loopBeats + take.start < b1; k++) {
        const a = k * loopBeats + take.start;
        let from = a;   // desde que beat suena (a, o b0 si ya venia sonando)
        if (a < b0) {
            if (!fresh || a + span <= b0)
                continue;
            from = b0;
        }
        let when = startTime + from * beatDur;
        if (when < now) {
            when = now;
            from = Math.max(from, (now - startTime) / beatDur);
            if (a + span <= from)
                continue;
        }
        const offsetBeats = Math.max(0, from - a);
        out.push({
            when,
            offset: offsetBeats * 60 / take.bpm,
            duration: (span - offsetBeats) * 60 / take.bpm,
            rate,
            clipped: clippedAll
        });
    }
    return out;
}

/** Miniatura: `cols` picos (0..1) de la toma, tomando el mayor de los canales. */
export function peaks(channels: Array<Float32Array>, cols: number): Array<number> {
    const n = channels.length ? channels[0].length : 0;
    const res: Array<number> = [];
    for (let c = 0; c < cols; c++) {
        const i0 = Math.floor(c * n / cols), i1 = Math.max(i0 + 1, Math.floor((c + 1) * n / cols));
        let p = 0;
        for (const ch of channels)
            for (let i = i0; i < i1 && i < n; i++) {
                const v = Math.abs(ch[i]);
                if (v > p)
                    p = v;
            }
        res.push(Math.min(1, p));
    }
    return res;
}

/** Los picos como un trazo SVG (viewBox 0 0 cols 100, centrado en y = 50). */
export function wavePath(p: Array<number>): string {
    let d = '';
    p.forEach((v, x) => {
        const h = Math.max(1, v * 48);
        d += 'M' + x + ' ' + (50 - h).toFixed(1) + 'V' + (50 + h).toFixed(1);
    });
    return d;
}
