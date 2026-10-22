import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';
import { TransportClient } from '../core/transport.service';
import { loadWorklet } from './worklet-synth.module';
import { TAKE_STORE } from './take-store';
import { REC_TRACKS, RecChunk, TakeMeta, assembleTake, peaks, planPlayback, wavePath } from './recorder-core';

export { REC_TRACKS, TakeMeta } from './recorder-core';

const WORKLET_URL = 'assets/worklets/recorder-worklet.js';
const WAVE_COLS = 160;
const MAX_NAME = 24;

/** Los AudioBuffer de las tomas ya cargadas, por id. El render offline y las copias del rack los reusan sin volver a IndexedDB. */
const bufferCache = new Map<string, AudioBuffer>();

export interface RecTrack {
    name: string;
    gain: number;       // 0..1.5 (fader)
    pan: number;        // -1..1
    mute: boolean;
    solo: boolean;
    armed: boolean;     // REC: esta pista captura al grabar desde el transporte (no se guarda en el proyecto)
    take: TakeMeta | null;
    buffer: AudioBuffer | null;
    loading: boolean;
    missing: boolean;   // el proyecto tiene una toma que este navegador no tiene
    wave: string;       // trazo SVG de la miniatura
}

interface TrackNodes {
    input: GainNode;
    meterIn: AnalyserNode;
    gain: GainNode;
    pan: StereoPannerNode | null;
    meterOut: AnalyserNode;
}

interface Playing {
    src: AudioBufferSourceNode;
    fade: GainNode;
    track: number;
}

interface Recording {
    mask: number;
    bpm: number;
    startBeat: number;        // negras absolutas en que empieza la captura
    endBeat: number;          // negras absolutas del final del loop en que empezo
    startTime: number | null; // instante (AudioContext) del primer cuadro de la toma, cuando el transporte lo informa
    endTime: number;
    loopStart: number;        // posicion de la toma dentro del loop (negras)
    finishing: boolean;
    chunks: Array<Array<RecChunk>>;
}

/**
 * Grabador 8 pistas de audio. Cada entrada (in1..in8) es una pista; lo que llega por el cable se graba en una toma por pista
 * y las tomas suenan en loop con el transporte, mezcladas en la salida `out`.
 *
 * Sincronia con el transporte (es un TransportClient, como los secuenciadores):
 *  - Grabar: con el boton Rec del rack, las pistas armadas (REC) capturan desde donde arranca la reproduccion (normalmente el comienzo
 *    del loop; despues de la cuenta previa) hasta el final de ese loop, o hasta Stop / Rec si se corta antes. La toma queda alineada
 *    a su posicion en el loop. La captura es exacta al cuadro (el audio se mide con el mismo reloj que el transporte), asi que no
 *    hace falta compensar latencia para lo que viene del rack; para fuentes tocadas en vivo hay "Comp. latencia" (resta baseLatency
 *    + outputLatency).
 *  - Reproducir: cada toma se agenda con un AudioBufferSourceNode a tiempo exacto en cada vuelta del loop, respeta seek, loop y
 *    cuenta previa. Las tomas estan en segundos al tempo en que se grabaron (se guarda ese bpm): si el tempo cambia, suenan con
 *    velocidad = bpm actual / bpm de grabacion (velocidad de cinta: siguen el compas pero cambian de tono; no hay estiramiento).
 *  - Una pista armada que graba no suena mientras graba (se reemplaza su toma).
 *
 * Captura: un solo AudioWorklet con 8 entradas estereo; las fuentes mono se duplican en L y R. La toma se guarda estereo, o mono si
 * L == R en toda la toma (lo habitual), para gastar la mitad.
 *
 * Persistencia: el estado del proyecto lleva solo los metadatos (nombre, nivel, paneo, mute, solo y los datos de la toma). El audio va
 * a IndexedDB por id de toma. Si no esta (proyecto de otro navegador) la pista aparece vacia con un aviso. Sin IndexedDB todo anda,
 * solo que sin persistencia.
 *
 * En el render offline (WAV del rack) no hay captura: las tomas suenan en cada vuelta del loop.
 */
export class RecorderModule extends RackModule implements TransportClient {
    readonly type = 'recorder';
    readonly ports: ReadonlyArray<PortDef>;
    public tracks: Array<RecTrack> = [];
    public compLatency = false;
    public error = '';
    public notice = '';
    /** Cuenta atras de captura: alguna pista esta grabando ahora. */
    public recording = false;
    /** Se resuelve cuando las tomas del estado ya estan cargadas (el render offline lo espera). */
    public ready: Promise<void> = Promise.resolve();

    private nodes: Array<TrackNodes> = [];
    private mix: GainNode;
    private worklet: any = null;
    private sink: GainNode | null = null;
    private rec: Recording | null = null;
    private playing = new Set<Playing>();
    private fresh = true;
    private buf: Float32Array;
    private recTimer: any = null;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const ports: Array<PortDef> = [];
        this.mix = ctx.createGain();
        this.buf = new Float32Array(512);
        for (let i = 0; i < REC_TRACKS; i++) {
            ports.push({ id: 'in' + (i + 1), kind: 'audio', dir: 'in', label: 'Pista ' + (i + 1) });
            const input = ctx.createGain();
            const meterIn = ctx.createAnalyser();
            meterIn.fftSize = 512;
            input.connect(meterIn);
            const gain = ctx.createGain();
            const pan = (ctx as any).createStereoPanner ? ctx.createStereoPanner() : null;
            const meterOut = ctx.createAnalyser();
            meterOut.fftSize = 512;
            if (pan) {
                gain.connect(pan);
                pan.connect(this.mix);
                pan.connect(meterOut);
            } else {
                gain.connect(this.mix);
                gain.connect(meterOut);
            }
            this.nodes.push({ input, meterIn, gain, pan, meterOut });
            this.tracks.push(this.emptyTrack(i));
        }
        ports.push({ id: 'out', kind: 'audio', dir: 'out', label: 'Mezcla' });
        this.ports = ports;
        this.applyAll();
        if (env.live && env.clock) {
            env.clock.register(this);
            this.startWorklet();
        }
    }

    private emptyTrack(i: number): RecTrack {
        return { name: 'Pista ' + (i + 1), gain: 0.8, pan: 0, mute: false, solo: false, armed: false, take: null, buffer: null, loading: false, missing: false, wave: '' };
    }

    // --- Captura (worklet) ---

    private startWorklet() {
        loadWorklet(this.env.ctx, WORKLET_URL).then(() => {
            const Node = (window as any).AudioWorkletNode;
            const node = new Node(this.env.ctx, 'recorder-processor', {
                numberOfInputs: REC_TRACKS, numberOfOutputs: 1, outputChannelCount: [1],
                channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers'
            });
            this.nodes.forEach((n, i) => n.input.connect(node, 0, i));
            // La salida (vacia) va a un nodo mudo: asi el navegador mantiene el worklet procesando
            this.sink = this.env.ctx.createGain();
            this.sink.gain.value = 0;
            node.connect(this.sink);
            this.sink.connect(this.env.ctx.destination);
            node.port.onmessage = (e: MessageEvent) => this.onWorkletMessage(e.data);
            this.worklet = node;
        }).catch(e => this.env.run(() => this.error = 'No se puede grabar: ' + String(e && e.message || e)));
    }

    private onWorkletMessage(m: any) {
        const rec = this.rec;
        if (!rec || !m)
            return;
        if (m.type == 'chunk' && m.t >= 0 && m.t < REC_TRACKS && m.l instanceof Float32Array && m.r instanceof Float32Array)
            rec.chunks[m.t].push({ frame: m.frame, l: m.l, r: m.r });
        else if (m.type == 'flushed')
            this.assemble(rec);
    }

    // --- TransportClient ---

    onRecordStart() {
        if (this.rec || !this.worklet || !this.env.clock)
            return;
        const clock = this.env.clock;
        let mask = 0;
        this.tracks.forEach((t, i) => mask |= t.armed ? 1 << i : 0);
        if (!mask)
            return;
        const loop = Math.max(1e-6, this.env.transport.loopBeats);
        // Con el transporte parado la reproduccion arranca en el cursor; si ya suena, la toma empieza ahora
        const startBeat = clock.playing && !clock.countingIn ? Math.max(0, clock.absBeat) : Math.max(0, clock.startBeat);
        const k = Math.floor(startBeat / loop);
        this.rec = {
            mask, bpm: this.env.transport.bpm, startBeat, endBeat: (k + 1) * loop, startTime: null, endTime: 0,
            loopStart: startBeat - k * loop, finishing: false, chunks: this.tracks.map(() => [])
        };
        this.notice = '';
        // La toma vieja de las pistas que graban se corta (se va a reemplazar)
        this.playing.forEach(p => {
            if ((mask >> p.track) & 1)
                try { p.src.stop(); } catch (e) {}
        });
        this.worklet.port.postMessage({ type: 'rec', on: true, mask });
        this.setRecording(true);
    }

    onRecordStop(endBeat: number) {
        const rec = this.rec;
        if (!rec || rec.finishing)
            return;
        const end = Math.min(endBeat, rec.endBeat);
        if (rec.startTime === null || end - rec.startBeat < 0.05)
            return this.cancelRec();
        this.finish(rec, rec.startTime + (end - rec.startBeat) * 60 / rec.bpm);
    }

    onStop() {
        this.stopPlaying();
        this.fresh = true;
    }

    schedule(b0: number, b1: number, startTime: number, beatDur: number) {
        const rec = this.rec;
        if (rec && !rec.finishing) {
            if (rec.startTime === null)
                rec.startTime = startTime + rec.startBeat * beatDur;
            // Llego el final del loop: la captura termina ahi aunque el transporte siga
            if (b1 >= rec.endBeat)
                this.finish(rec, rec.startTime + (rec.endBeat - rec.startBeat) * beatDur);
        }
        const loopBeats = this.env.transport.loopBeats;
        const now = this.env.ctx.currentTime;
        const fresh = this.fresh;
        this.fresh = false;
        this.tracks.forEach((t, i) => {
            if (!t.take || !t.buffer || (this.rec && (this.rec.mask >> i) & 1))
                return;
            planPlayback(b0, b1, startTime, beatDur, loopBeats, t.take, fresh, now).forEach(p => this.play(i, t.buffer, p));
        });
    }

    /** Render offline: agenda de una vez todas las vueltas del loop. */
    renderPasses(passes: number) {
        const t = this.env.transport;
        this.fresh = false;
        const now = this.env.ctx.currentTime;
        this.tracks.forEach((tr, i) => {
            if (tr.take && tr.buffer)
                planPlayback(0, t.loopBeats * Math.max(1, passes), 0, 60 / t.bpm, t.loopBeats, tr.take, false, now).forEach(p => this.play(i, tr.buffer, p));
        });
    }

    /** Hay algo para exportar a WAV: alguna pista tiene una toma cargada. */
    get exportable(): boolean {
        return this.tracks.some(t => !!t.take && !!t.buffer);
    }

    /** Cambio el tempo: lo que suena ahora sigue el compas con su nueva velocidad. */
    onTempo() {
        this.playing.forEach(p => {
            const take = this.tracks[p.track].take;
            if (take && this.env.live)
                p.src.playbackRate.value = this.env.transport.bpm / take.bpm;
        });
    }

    private play(i: number, buffer: AudioBuffer, p: { when: number; offset: number; duration: number; rate: number; clipped: boolean }) {
        if (p.duration <= 0)
            return;
        const ctx = this.env.ctx;
        const src = ctx.createBufferSource();
        const fade = ctx.createGain();
        src.buffer = buffer;
        src.playbackRate.value = p.rate;
        src.connect(fade);
        fade.connect(this.nodes[i].gain);
        if (p.clipped) {
            // Corte por el final del loop: fundido corto para evitar el clic
            const end = p.when + p.duration / p.rate;
            fade.gain.setValueAtTime(1, Math.max(p.when, end - 0.005));
            fade.gain.linearRampToValueAtTime(0, end);
            src.start(p.when, Math.min(p.offset, buffer.duration), p.duration);
        } else {
            src.start(p.when, Math.min(p.offset, buffer.duration));
        }
        const item: Playing = { src, fade, track: i };
        this.playing.add(item);
        src.onended = () => {
            this.playing.delete(item);
            try { src.disconnect(); fade.disconnect(); } catch (e) {}
        };
    }

    private stopPlaying() {
        this.playing.forEach(p => {
            try { p.src.stop(); p.src.disconnect(); p.fade.disconnect(); } catch (e) {}
        });
        this.playing.clear();
    }

    // --- Cierre de la captura ---

    private setRecording(on: boolean) {
        this.recording = on;
        this.env.run(() => {});
    }

    private cancelRec() {
        if (this.worklet)
            this.worklet.port.postMessage({ type: 'rec', on: false });
        clearTimeout(this.recTimer);
        this.rec = null;
        this.setRecording(false);
    }

    /** Termina la captura en `endTime` (instante del AudioContext): espera a que llegue el audio y manda el worklet a vaciar. */
    private finish(rec: Recording, endTime: number) {
        rec.finishing = true;
        rec.endTime = endTime;
        const wait = (endTime + this.latency() - this.env.ctx.currentTime) * 1000 + 120;
        this.recTimer = setTimeout(() => {
            if (this.worklet && this.rec === rec)
                this.worklet.port.postMessage({ type: 'rec', on: false });
        }, Math.max(0, wait));
    }

    /** Latencia que se descuenta de lo capturado (solo con "Comp. latencia"), en segundos. */
    private latency(): number {
        if (!this.compLatency)
            return 0;
        const c: any = this.env.ctx;
        const v = (c.baseLatency || 0) + (c.outputLatency || 0);
        return isFinite(v) && v > 0 && v < 0.5 ? v : 0;
    }

    private assemble(rec: Recording) {
        this.rec = null;
        this.env.run(() => this.recording = false);
        if (rec.startTime === null || rec.endTime <= rec.startTime)
            return;
        const ctx = this.env.ctx;
        const rate = ctx.sampleRate;
        const lat = this.latency();
        const f0 = Math.round((rec.startTime + lat) * rate);
        const n = Math.round((rec.endTime - rec.startTime) * rate);
        if (n < 1)
            return;
        for (let i = 0; i < REC_TRACKS; i++) {
            if (!((rec.mask >> i) & 1))
                continue;
            try {
                const channels = assembleTake(rec.chunks[i], f0, n);
                const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                const buffer = ctx.createBuffer(channels.length, n, rate);
                channels.forEach((c, ch) => buffer.getChannelData(ch).set(c));
                const meta: TakeMeta = { id, len: n / rate, rate, bpm: rec.bpm, start: rec.loopStart, ch: channels.length };
                bufferCache.set(id, buffer);
                // El audio va a IndexedDB; si falla la toma sigue en memoria
                TAKE_STORE.put({ id, rate, channels }).then(ok => {
                    if (!ok)
                        this.env.run(() => this.notice = 'No se pudo guardar en este navegador: las tomas se pierden al recargar (exporta a WAV)');
                });
                this.env.run(() => this.setTake(i, meta, buffer));
            } catch (e) {
                this.env.run(() => this.error = 'No se pudo armar la toma: ' + String(e && e.message || e));
            }
        }
    }

    // --- Tomas ---

    private setTake(i: number, meta: TakeMeta | null, buffer: AudioBuffer | null) {
        const t = this.tracks[i];
        const old = t.take;
        t.take = meta;
        t.buffer = buffer;
        t.missing = false;
        t.loading = false;
        t.wave = buffer ? wavePath(peaks(this.channelsOf(buffer), WAVE_COLS)) : '';
        if (old && (!meta || old.id != meta.id))
            this.dropTake(old.id);
        this.env.changed();
    }

    private channelsOf(b: AudioBuffer): Array<Float32Array> {
        const res: Array<Float32Array> = [];
        for (let c = 0; c < b.numberOfChannels; c++)
            res.push(b.getChannelData(c));
        return res;
    }

    // Una toma reemplazada o borrada se quita de la memoria y de IndexedDB (las copias del dispositivo no comparten tomas: forgetTakes)
    private dropTake(id: string) {
        bufferCache.delete(id);
        TAKE_STORE.delete(id);
    }

    /** Borra la toma de una pista. */
    clearTake(i: number) {
        if (i < 0 || i >= REC_TRACKS || (this.rec && (this.rec.mask >> i) & 1))
            return;
        this.stopPlaying();
        this.fresh = true;
        this.setTake(i, null, null);
    }

    /** Despues de duplicar el dispositivo: la copia no se queda con las tomas (no se borra su audio, es de la otra). */
    forgetTakes() {
        this.tracks.forEach(t => {
            t.take = null;
            t.buffer = null;
            t.missing = false;
            t.wave = '';
        });
    }

    private loadTake(i: number, meta: TakeMeta) {
        const t = this.tracks[i];
        t.loading = true;
        const cached = bufferCache.get(meta.id);
        if (cached) {
            this.attach(i, meta, cached);
            return Promise.resolve();
        }
        return TAKE_STORE.get(meta.id).then(stored => {
            // Puede haber cambiado la pista mientras tanto
            if (this.tracks[i].take !== meta)
                return;
            if (!stored) {
                t.loading = false;
                t.missing = true;
                this.env.run(() => {});
                return;
            }
            try {
                const len = stored.channels[0].length;
                const buffer = this.env.ctx.createBuffer(stored.channels.length, len, stored.rate);
                stored.channels.forEach((c, ch) => buffer.getChannelData(ch).set(c));
                bufferCache.set(meta.id, buffer);
                this.env.run(() => this.attach(i, meta, buffer));
            } catch (e) {
                t.loading = false;
                t.missing = true;
            }
        });
    }

    private attach(i: number, meta: TakeMeta, buffer: AudioBuffer) {
        const t = this.tracks[i];
        t.buffer = buffer;
        t.loading = false;
        t.missing = false;
        t.wave = wavePath(peaks(this.channelsOf(buffer), WAVE_COLS));
    }

    // --- Pistas ---

    get anySolo(): boolean {
        return this.tracks.some(t => t.solo);
    }

    private audible(i: number): boolean {
        const t = this.tracks[i];
        return !t.mute && (!this.anySolo || t.solo);
    }

    private applyTrack(i: number) {
        const n = this.nodes[i], t = this.tracks[i];
        this.set(n.gain.gain, this.audible(i) ? t.gain : 0, 0.015);
        if (n.pan)
            this.set(n.pan.pan, t.pan, 0.015);
    }

    private applyAll() {
        for (let i = 0; i < REC_TRACKS; i++)
            this.applyTrack(i);
    }

    setGain(i: number, v: number) {
        this.tracks[i].gain = Math.max(0, Math.min(1.5, v));
        this.applyTrack(i);
        this.env.changed();
    }

    setPan(i: number, v: number) {
        this.tracks[i].pan = Math.max(-1, Math.min(1, v));
        this.applyTrack(i);
        this.env.changed();
    }

    toggleMute(i: number) {
        this.tracks[i].mute = !this.tracks[i].mute;
        this.applyAll();
        this.env.changed();
    }

    toggleSolo(i: number) {
        this.tracks[i].solo = !this.tracks[i].solo;
        this.applyAll();
        this.env.changed();
    }

    toggleArm(i: number) {
        if (!this.rec)
            this.tracks[i].armed = !this.tracks[i].armed;
    }

    setName(i: number, name: string) {
        this.tracks[i].name = (String(name || '').trim() || 'Pista ' + (i + 1)).slice(0, MAX_NAME);
        this.env.changed();
    }

    setCompLatency(on: boolean) {
        this.compLatency = !!on;
        this.env.changed();
    }

    /** Pico de la entrada (antes de grabar) o de la reproduccion de la pista (0..1), para los medidores. */
    inLevel(i: number): number {
        return this.peak(this.nodes[i].meterIn);
    }

    outLevel(i: number): number {
        return this.peak(this.nodes[i].meterOut);
    }

    private peak(a: AnalyserNode): number {
        a.getFloatTimeDomainData(this.buf);
        let p = 0;
        for (let i = 0; i < this.buf.length; i++)
            p = Math.max(p, Math.abs(this.buf[i]));
        return Math.min(1, p);
    }

    /** Cuanto dura la toma en negras (para dibujarla dentro del loop). */
    takeBeats(i: number): number {
        const t = this.tracks[i].take;
        return t ? t.len * t.bpm / 60 : 0;
    }

    /** La velocidad con que suena la toma al tempo actual (1 = el de la grabacion). */
    takeRate(i: number): number {
        const t = this.tracks[i].take;
        return t ? this.env.transport.bpm / t.bpm : 1;
    }

    // --- Rutas, automatizacion y estado ---

    audioPort(id: string): AudioNode | null {
        if (id == 'out')
            return this.mix;
        const m = /^in(\d+)$/.exec(id);
        const i = m ? parseInt(m[1], 10) - 1 : -1;
        return i >= 0 && i < REC_TRACKS ? this.nodes[i].input : null;
    }

    /**
     * Las entradas no pasan a la salida: se graban y la salida reproduce lo grabado. Por eso no hay rutas internas y se puede
     * grabar la mezcla de este mismo dispositivo en otra pista (o en otro grabador) sin que el cable cree un bucle.
     * (Una pista que graba no suena mientras graba, asi que tampoco hay realimentacion.)
     */
    routes(): Array<[string, string]> {
        return [];
    }

    autoParam(id: string) {
        const m = /^(gain|pan)\.(\d+)$/.exec(id);
        if (!m || +m[2] >= REC_TRACKS)
            return null;
        const label = 'Pista ' + (+m[2] + 1);
        return m[1] == 'gain' ? { label: label + ' · Fader', min: 0, max: 1.5 } : { label: label + ' · Paneo', min: -1, max: 1 };
    }

    getAutoValue(id: string): number {
        const p = id.split('.');
        return p[0] == 'gain' ? this.tracks[+p[1]].gain : this.tracks[+p[1]].pan;
    }

    setAutoValue(id: string, value: number) {
        const p = id.split('.');
        if (p[0] == 'gain')
            this.setGain(+p[1], value);
        else
            this.setPan(+p[1], value);
    }

    getState() {
        return {
            compLatency: this.compLatency,
            tracks: this.tracks.map(t => ({ name: t.name, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo, take: t.take ? { ...t.take } : null }))
        };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const num = (v: any, min: number, max: number, d: number) => typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
        const list = Array.isArray(raw.tracks) ? raw.tracks : [];
        this.compLatency = raw.compLatency === true;
        const loads: Array<Promise<void>> = [];
        for (let i = 0; i < REC_TRACKS; i++) {
            const r = list[i] && typeof list[i] == 'object' ? list[i] : {};
            const t = this.tracks[i];
            t.name = typeof r.name == 'string' && r.name.trim() ? r.name.trim().slice(0, MAX_NAME) : 'Pista ' + (i + 1);
            t.gain = num(r.gain, 0, 1.5, 0.8);
            t.pan = num(r.pan, -1, 1, 0);
            t.mute = r.mute === true;
            t.solo = r.solo === true;
            const k = r.take && typeof r.take == 'object' ? r.take : null;
            const ok = k && typeof k.id == 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(k.id)
                && typeof k.len == 'number' && k.len > 0 && k.len < 7200 && typeof k.rate == 'number' && k.rate >= 3000 && k.rate <= 768000
                && typeof k.bpm == 'number' && k.bpm > 0 && k.bpm < 1000;
            const same = ok && t.take && t.take.id == k.id;
            if (!ok) {
                t.take = null;
                t.buffer = null;
                t.missing = false;
                t.loading = false;
                t.wave = '';
            } else if (!same) {
                t.take = { id: k.id, len: k.len, rate: k.rate, bpm: k.bpm, start: num(k.start, 0, 64 * 16 * 16, 0), ch: k.ch == 1 ? 1 : 2 };
                t.buffer = null;
                t.wave = '';
                t.missing = false;
                loads.push(this.loadTake(i, t.take));
            }
        }
        this.applyAll();
        this.ready = Promise.all(loads).then(() => undefined, () => undefined);
    }

    dispose() {
        if (this.env.clock)
            this.env.clock.unregister(this);
        clearTimeout(this.recTimer);
        this.stopPlaying();
        try {
            if (this.worklet) {
                this.worklet.port.postMessage({ type: 'rec', on: false });
                this.worklet.disconnect();
            }
            if (this.sink)
                this.sink.disconnect();
        } catch (e) {}
        this.nodes.forEach(n => n.input.disconnect());
        this.mix.disconnect();
    }
}
