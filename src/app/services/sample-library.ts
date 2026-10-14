import { Injectable } from '@angular/core';
import { BANK_BASE_URL, KIT_FIRST_NOTE, KIT_LAST_NOTE } from './gm';

export type BankKind = 'melodic' | 'kit';

export interface SampleRef {
    font: string;
    id: number;      // melodic: programa GM (0..127); kit: variacion de kit
}

export interface EnvPoint {
    duration: number;
    volume: number;
}

/** Una muestra con su rango de teclas, afinacion original y puntos de loop. */
export interface Zone {
    low: number;
    high: number;
    buffer: AudioBuffer;
    originalPitch: number;   // centesimas de semitono
    coarseTune: number;
    fineTune: number;
    loop: boolean;
    loopStart: number;       // s
    loopEnd: number;         // s
    envelope: Array<EnvPoint> | null;  // caida natural del instrumento (piano, cuerdas...)
}

export interface Instrument {
    key: string;
    kind: BankKind;
    zones: Array<Zone>;
    lastUsed: number;
}

export interface LoadStatus {
    state: 'loading' | 'ready' | 'error';
    progress: number;   // 0..1
    message?: string;
}

const CACHE_NAME = 'synth-samples-v1';
const MAX_INSTRUMENTS = 14;      // limite de memoria: se descarta el menos usado
const MAX_FILE_CHARS = 40 * 1000 * 1000;
const PARALLEL_FETCHES = 6;
const FETCH_ATTEMPTS = 3;

// Envolvente por defecto de WebAudioFont cuando la zona dice `ahdsr: true`
const DEFAULT_ENVELOPE: Array<EnvPoint> = [
    { duration: 0, volume: 1 }, { duration: 0.5, volume: 1 }, { duration: 1.5, volume: 0.5 }, { duration: 3, volume: 0 }
];

/**
 * Convierte el archivo de datos (un literal JavaScript) a un objeto SIN ejecutarlo:
 * se transforma a JSON y se parsea. Los archivos son datos propios del banco, pero igual se tratan como no confiables.
 */
export function parsePresetFile(text: string): any {
    if (text.length > MAX_FILE_CHARS)
        throw new Error('archivo demasiado grande');
    const eq = text.indexOf('=');
    const start = eq < 0 ? -1 : text.indexOf('{', eq);
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start)
        throw new Error('formato inesperado');
    let body = text.slice(start, end + 1);
    body = body.replace(/^[ \t]*\/\/.*$/gm, '');                    // comentarios de linea completa
    body = body.replace(/'/g, '"');                                 // el base64 no contiene comillas
    body = body.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":'); // claves sin comillas
    body = body.replace(/,(\s*[}\]])/g, '$1');                      // comas finales
    return JSON.parse(body);
}

const num = (v: any, fallback: number): number => typeof v == 'number' && isFinite(v) ? v : fallback;

/** Biblioteca de instrumentos de muestras: descarga, decodifica y guarda en memoria. */
@Injectable()
export class SampleLibrary {
    private instruments = new Map<string, Instrument>();
    private pending = new Map<string, Promise<Instrument>>();
    private statuses = new Map<string, LoadStatus>();
    private tick = 0;

    constructor(private audioCtx: AudioContext) {}

    key(kind: BankKind, ref: SampleRef): string {
        return kind + ':' + ref.font + ':' + ref.id;
    }

    /** Instrumento ya cargado (o undefined). Cuenta como uso para el control de memoria. */
    get(kind: BankKind, ref: SampleRef): Instrument | undefined {
        const instrument = this.instruments.get(this.key(kind, ref));
        if (instrument)
            instrument.lastUsed = ++this.tick;
        return instrument;
    }

    status(kind: BankKind, ref: SampleRef): LoadStatus | undefined {
        return this.statuses.get(this.key(kind, ref));
    }

    load(kind: BankKind, ref: SampleRef): Promise<Instrument> {
        const key = this.key(kind, ref);
        const ready = this.instruments.get(key);
        if (ready) {
            ready.lastUsed = ++this.tick;
            return Promise.resolve(ready);
        }
        let promise = this.pending.get(key);
        if (!promise) {
            const status: LoadStatus = { state: 'loading', progress: 0 };
            this.statuses.set(key, status);
            promise = (kind == 'kit' ? this.loadKit(ref, status) : this.loadMelodic(ref, status))
                .then(zones => {
                    const instrument: Instrument = { key, kind, zones, lastUsed: ++this.tick };
                    this.instruments.set(key, instrument);
                    status.state = 'ready';
                    status.progress = 1;
                    this.evict(key);
                    return instrument;
                })
                .catch(error => {
                    status.state = 'error';
                    status.message = String(error && error.message || error);
                    throw error;
                })
                .then(i => { this.pending.delete(key); return i; }, e => { this.pending.delete(key); throw e; });
            this.pending.set(key, promise);
        }
        return promise;
    }

    // --- Carga ---

    private urlMelodic(ref: SampleRef): string {
        const file = ('0000' + ref.id * 10).slice(-4);
        return BANK_BASE_URL + '/' + file + '_' + ref.font + '_sf2_file.js';
    }

    private urlDrum(ref: SampleRef, note: number): string {
        return BANK_BASE_URL + '/128' + note + '_' + ref.id + '_' + ref.font + '_sf2_file.js';
    }

    private async loadMelodic(ref: SampleRef, status: LoadStatus): Promise<Array<Zone>> {
        const preset = parsePresetFile(await this.fetchText(this.urlMelodic(ref)));
        status.progress = 0.1;
        const raw: Array<any> = Array.isArray(preset.zones) ? preset.zones : [];
        let done = 0;
        const zones = await Promise.all(raw.map(async z => {
            const zone = await this.buildZone(z);
            status.progress = 0.1 + 0.9 * (++done / raw.length);
            return zone;
        }));
        const valid = zones.filter(z => !!z);
        if (!valid.length)
            throw new Error('el instrumento no tiene muestras');
        return valid;
    }

    // Una bateria son hasta 47 archivos chicos (uno por pieza); los que no existan se omiten
    private async loadKit(ref: SampleRef, status: LoadStatus): Promise<Array<Zone>> {
        const notes: Array<number> = [];
        for (let n = KIT_FIRST_NOTE; n <= KIT_LAST_NOTE; n++)
            notes.push(n);
        const zones: Array<Zone> = [];
        let next = 0;
        let done = 0;
        const worker = async () => {
            while (next < notes.length) {
                const note = notes[next++];
                try {
                    const preset = parsePresetFile(await this.fetchText(this.urlDrum(ref, note)));
                    for (const z of (Array.isArray(preset.zones) ? preset.zones : [])) {
                        const zone = await this.buildZone(z);
                        if (zone) {
                            zone.low = zone.high = note;
                            zones.push(zone);
                        }
                    }
                } catch (e) {
                    // pieza inexistente o danada: queda sin sonido
                }
                status.progress = ++done / notes.length;
            }
        };
        const workers = [];
        for (let i = 0; i < PARALLEL_FETCHES; i++)
            workers.push(worker());
        await Promise.all(workers);
        if (!zones.length)
            throw new Error('el kit no tiene muestras');
        return zones;
    }

    /** Valida y decodifica una zona. Devuelve null si no es utilizable. */
    private async buildZone(z: any): Promise<Zone> {
        if (!z || typeof z != 'object')
            return null;
        const sampleRate = num(z.sampleRate, 44100);
        if (sampleRate < 8000 || sampleRate > 192000)
            return null;
        let buffer: AudioBuffer;
        try {
            if (typeof z.sample == 'string') {
                // PCM crudo de 16 bits little-endian, mono
                const bytes = this.base64ToBytes(z.sample);
                const frames = Math.floor(bytes.length / 2);
                buffer = this.audioCtx.createBuffer(1, frames, sampleRate);
                const data = buffer.getChannelData(0);
                const view = new DataView(bytes.buffer);
                for (let i = 0; i < frames; i++)
                    data[i] = view.getInt16(i * 2, true) / 32768;
            } else if (typeof z.file == 'string') {
                const bytes = this.base64ToBytes(z.file);
                buffer = await this.decode(bytes.buffer as ArrayBuffer);
            } else {
                return null;
            }
        } catch (e) {
            return null;
        }
        const loopStart = num(z.loopStart, 0);
        const loopEnd = num(z.loopEnd, 0);
        const loop = loopStart > 1 && loopStart < loopEnd && loopEnd / sampleRate <= buffer.duration + 0.01;
        let envelope: Array<EnvPoint> | null = null;
        if (Array.isArray(z.ahdsr))
            envelope = z.ahdsr.map((p: any) => ({ duration: Math.max(0, num(p && p.duration, 0)), volume: Math.max(0, Math.min(1, num(p && p.volume, 1))) }));
        else if (z.ahdsr === true)
            envelope = DEFAULT_ENVELOPE;
        return {
            low: num(z.keyRangeLow, 0),
            high: num(z.keyRangeHigh, 127),
            buffer,
            originalPitch: num(z.originalPitch, 6000),
            coarseTune: num(z.coarseTune, 0),
            fineTune: num(z.fineTune, 0),
            loop,
            loopStart: loopStart / sampleRate,
            loopEnd: loopEnd / sampleRate,
            envelope
        };
    }

    private base64ToBytes(b64: string): Uint8Array {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // decodeAudioData con promesa donde existe, con callbacks en navegadores viejos
    private decode(data: ArrayBuffer): Promise<AudioBuffer> {
        return new Promise((resolve, reject) => {
            const result = this.audioCtx.decodeAudioData(data, resolve, reject);
            if (result && typeof (result as any).then == 'function')
                (result as any).then(resolve, reject);
        });
    }

    // Descarga con cache persistente (Cache Storage): la segunda vez, y sin red, sale de ahi
    private async fetchText(url: string): Promise<string> {
        let cache: Cache = null;
        try {
            cache = typeof caches != 'undefined' ? await caches.open(CACHE_NAME) : null;
        } catch (e) {}
        let response = cache ? await cache.match(url) : undefined;
        if (!response) {
            response = await this.fetchWithRetry(url);
            if (cache)
                cache.put(url, response.clone()).catch(() => {});
        }
        return response.text();
    }

    // Un corte de red momentaneo o un 5xx no debe dejar el instrumento sin cargar: reintenta con espera.
    // Un 404 no se reintenta (la pieza simplemente no existe).
    private async fetchWithRetry(url: string): Promise<Response> {
        let lastError: any;
        for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
            if (attempt)
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            try {
                const response = await fetch(url, { mode: 'cors' });
                if (response.ok)
                    return response;
                lastError = new Error('HTTP ' + response.status);
                if (response.status < 500)
                    break;
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError;
    }

    // Control de memoria: descarta el instrumento menos usado si hay demasiados
    private evict(keep: string) {
        while (this.instruments.size > MAX_INSTRUMENTS) {
            let oldest: Instrument = null;
            this.instruments.forEach(i => {
                if (i.key != keep && (!oldest || i.lastUsed < oldest.lastUsed))
                    oldest = i;
            });
            if (!oldest)
                return;
            this.instruments.delete(oldest.key);
            this.statuses.delete(oldest.key);
        }
    }
}

/** Zona que corresponde a la nota (misma regla que el reproductor original: la ultima que la cubre). */
export function findZone(instrument: Instrument, midi: number): Zone | null {
    const zones = instrument.zones;
    if (instrument.kind == 'kit')
        return zones.find(z => z.low == midi) || null;   // cada pieza es una nota exacta
    for (let i = zones.length - 1; i >= 0; i--)
        if (zones[i].low <= midi && zones[i].high + 1 >= midi)
            return zones[i];
    return zones[0];
}
