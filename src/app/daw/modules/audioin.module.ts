import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';
import { AUDIOIN_CHANNELS, chooseChannels, channelsMessage, constraintAttempts, errName, errorMessage, isFatalError, unavailableMessage } from './audioin-core';

export { AUDIOIN_CHANNELS } from './audioin-core';

const MAX_NAME = 24;

export interface InChannel {
    name: string;
    trim: number;    // 0..2 (nivel de entrada)
    mute: boolean;
}

export interface InputDevice {
    id: string;
    label: string;
}

/**
 * Entrada de audio: toma una entrada de la placa de sonido del navegador (getUserMedia) y la ofrece como fuente por cable.
 *
 *   MediaStream -> MediaStreamAudioSourceNode -> ChannelSplitter(8, discreto)
 *        -> [nivel] -> medidor        (un camino por canal)
 *        -> [mute]  -> puerto chN     (mono, "Entrada N")
 *   canales 1 y 2 -> puerto out       (estereo; si la placa entrega un solo canal suena en los dos lados)
 *
 * Todo el camino es discreto: el Web Audio no mezcla a estereo la fuente multicanal. Los canales que la placa no entrega quedan en silencio.
 *
 * Seguridad: nunca pide permiso al crearse ni al cargar un proyecto; hay que tocar "Activar entrada" (gesto del usuario). No guarda que
 * estaba activa. En el render offline (WAV) no hay captura: los puertos dan silencio y no se toca navigator.
 */
export class AudioInModule extends RackModule {
    readonly type = 'audioin';
    readonly ports: ReadonlyArray<PortDef>;
    public channels: Array<InChannel> = [];
    public deviceId = '';                 // '' = entrada predeterminada
    public devices: Array<InputDevice> = [];
    public active = false;
    public starting = false;
    public error = '';
    public notice = '';                   // avisos que no son error (se uso otra entrada, pocos canales...)
    public channelInfo = '';              // "La placa entrega N canales"
    public deviceLabel = '';              // entrada que esta capturando
    public sampleRate = 0;                // frecuencia de la captura
    public inputLatency = 0;              // segundos, de track.getSettings().latency (0 si el navegador no lo informa)
    public usable = 0;                    // canales con senal posible (1..8)

    private splitter: ChannelSplitterNode;
    private merger: ChannelMergerNode;
    private outNode: GainNode;
    private trims: Array<GainNode> = [];
    private mutes: Array<GainNode> = [];
    private chOut: Array<GainNode> = [];
    private meters: Array<AnalyserNode> = [];
    private buf: Float32Array;

    private stream: MediaStream | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private gen = 0;                      // invalida arranques viejos cuando se reinicia o se libera
    private disposed = false;
    private listening = false;
    private onDeviceChange = () => this.refreshDevices();

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        this.buf = new Float32Array(512);
        this.splitter = ctx.createChannelSplitter(AUDIOIN_CHANNELS);
        this.merger = ctx.createChannelMerger(2);
        this.outNode = ctx.createGain();
        this.setDiscrete(this.splitter, AUDIOIN_CHANNELS);
        this.setDiscrete(this.outNode, 2, 'explicit');
        this.merger.connect(this.outNode);

        const ports: Array<PortDef> = [{ id: 'out', kind: 'audio', dir: 'out', label: 'Estereo' }];
        for (let i = 0; i < AUDIOIN_CHANNELS; i++) {
            const trim = ctx.createGain();
            const mute = ctx.createGain();
            const out = ctx.createGain();
            const meter = ctx.createAnalyser();
            meter.fftSize = 512;
            this.setDiscrete(trim, 1, 'explicit');
            this.setDiscrete(mute, 1, 'explicit');
            this.setDiscrete(out, 1, 'explicit');
            this.splitter.connect(trim, i, 0);
            trim.connect(meter);
            trim.connect(mute);
            mute.connect(out);
            if (i < 2)
                mute.connect(this.merger, 0, i);
            this.trims.push(trim);
            this.mutes.push(mute);
            this.chOut.push(out);
            this.meters.push(meter);
            this.channels.push({ name: 'Entrada ' + (i + 1), trim: 1, mute: false });
            ports.push({ id: 'ch' + (i + 1), kind: 'audio', dir: 'out', label: 'Entrada ' + (i + 1) });
        }
        this.ports = ports;
        // Un solo canal (microfono): el estereo lo duplica en los dos lados
        this.fixStereo(1);

        if (env.live && typeof navigator != 'undefined' && navigator.mediaDevices) {
            // Sin pedir permiso: si el navegador ya lo recuerda, trae los nombres de las entradas
            this.refreshDevices();
        }
    }

    // Nodos discretos: sin mezcla a estereo ni mono por la interpretacion de canales
    private setDiscrete(node: AudioNode, count: number, mode: ChannelCountMode = 'explicit') {
        try {
            node.channelCount = count;
            node.channelCountMode = mode;
            node.channelInterpretation = 'discrete';
        } catch (e) {}   // el splitter tiene estos valores fijos
    }

    // El canal 1 va tambien al lado derecho del estereo cuando la placa solo entrega uno
    private fixStereo(channels: number) {
        try {
            this.mutes[0].disconnect(this.merger, 0, 1);
        } catch (e) {}
        if (channels < 2)
            this.mutes[0].connect(this.merger, 0, 1);
    }

    audioPort(id: string): AudioNode | null {
        if (id == 'out')
            return this.outNode;
        const m = /^ch(\d+)$/.exec(id);
        if (m) {
            const i = parseInt(m[1], 10) - 1;
            return i >= 0 && i < AUDIOIN_CHANNELS ? this.chOut[i] : null;
        }
        return null;
    }

    /** Es una fuente: ninguna entrada llega a ninguna salida. */
    routes(): Array<[string, string]> {
        return [];
    }

    // --- Captura ---

    get supported(): boolean {
        return this.env.live && this.unavailable == '';
    }

    get unavailable(): string {
        if (!this.env.live)
            return 'No hay entrada en vivo durante el render.';
        const w: any = typeof window != 'undefined' ? window : {};
        const nav: any = typeof navigator != 'undefined' ? navigator : {};
        return unavailableMessage({
            hasMediaDevices: !!(nav.mediaDevices && nav.mediaDevices.getUserMedia),
            secure: w.isSecureContext !== false
        });
    }

    /** Pide el permiso (si hace falta) y empieza a capturar. Hay que llamarlo desde un gesto del usuario. */
    async start(): Promise<void> {
        if (!this.env.live || this.disposed)
            return;
        const gen = ++this.gen;
        this.stopStream();
        this.error = '';
        this.notice = '';
        const na = this.unavailable;
        if (na) {
            this.error = na;
            this.refreshUi();
            return;
        }
        this.starting = true;
        this.refreshUi();
        const ctx = this.env.ctx as AudioContext;
        let stream: MediaStream | null = null;
        let firstErr: any = null;
        let used = null;
        try {
            if (ctx.state == 'suspended' && ctx.resume)
                await ctx.resume();
        } catch (e) {}
        for (const attempt of constraintAttempts(this.deviceId, ctx.sampleRate)) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
                used = attempt;
                break;
            } catch (e) {
                firstErr = firstErr || e;
                if (isFatalError(e))
                    break;
            }
        }
        if (gen != this.gen || this.disposed) {
            // Se reinicio o se quito el modulo mientras esperaba el permiso: no dejar el microfono abierto
            if (stream)
                stream.getTracks().forEach(t => t.stop());
            return;
        }
        this.starting = false;
        if (!stream) {
            this.error = errorMessage(firstErr);
            this.refreshUi();
            return;
        }
        try {
            this.attach(stream, used);
        } catch (e) {
            stream.getTracks().forEach(t => t.stop());
            this.error = 'No se pudo conectar la entrada al audio del navegador' + (e && e.message ? ': ' + e.message : '') + '.';
            this.refreshUi();
            return;
        }
        // Con el permiso ya vienen las etiquetas de las entradas
        this.refreshDevices();
        if (!this.listening && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);
            this.listening = true;
        }
        this.refreshUi();
    }

    private attach(stream: MediaStream, used: { label: string; fallbackDevice: boolean }) {
        const ctx = this.env.ctx;
        const track = stream.getAudioTracks()[0];
        if (!track)
            throw new Error('el flujo no trae audio');
        const settings: any = track.getSettings ? track.getSettings() : {};
        const src = (ctx as AudioContext).createMediaStreamSource(stream);
        src.connect(this.splitter);
        this.stream = stream;
        this.source = src;
        track.addEventListener('ended', () => {
            if (this.stream === stream) {
                this.stopStream();
                this.error = 'La entrada se desconecto o dejo de estar disponible. Toca "Activar entrada" para volver a empezar.';
                this.refreshUi();
            }
        });
        const c = chooseChannels(settings.channelCount, src.channelCount);
        const msg = channelsMessage(c);
        this.usable = c.channels;
        this.channelInfo = msg.info;
        this.sampleRate = settings.sampleRate || ctx.sampleRate;
        this.inputLatency = typeof settings.latency == 'number' && isFinite(settings.latency) && settings.latency > 0 ? settings.latency : 0;
        this.deviceLabel = track.label || '';
        this.active = true;
        this.fixStereo(c.channels);
        const notes: Array<string> = [];
        if (msg.warning)
            notes.push(msg.warning);
        if (used.fallbackDevice)
            notes.push('La entrada elegida no esta disponible: se esta usando la predeterminada.');
        if (used.label == 'basico')
            notes.push('El navegador aplico su configuracion basica: puede estar activo el procesado de voz (cancelacion de eco, supresion de ruido).');
        this.notice = notes.join(' ');
    }

    /** Libera la entrada (el navegador deja de mostrar que usa el microfono). */
    stop() {
        this.gen++;
        this.stopStream();
        this.starting = false;
        this.error = '';
        this.refreshUi();
    }

    private stopStream() {
        if (this.source) {
            try { this.source.disconnect(); } catch (e) {}
            this.source = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        this.active = false;
        this.notice = '';
        this.channelInfo = '';
        this.deviceLabel = '';
        this.usable = 0;
        this.inputLatency = 0;
        this.fixStereo(1);
    }

    /** Elegir otra entrada: si esta capturando, reinicia con la nueva. */
    setDevice(id: string) {
        this.deviceId = id || '';
        this.env.changed();
        if (this.active)
            this.start();
        else
            this.refreshUi();
    }

    async refreshDevices(): Promise<void> {
        try {
            const md: any = navigator.mediaDevices;
            if (!md || !md.enumerateDevices)
                return;
            const list: Array<MediaDeviceInfo> = await md.enumerateDevices();
            if (this.disposed)
                return;
            const inputs = list.filter(d => d.kind == 'audioinput' && d.deviceId && d.deviceId != 'default' && d.deviceId != 'communications');
            // Sin permiso las etiquetas vienen vacias: no sirve de lista
            if (!inputs.length || !inputs.some(d => d.label))
                return;
            this.devices = inputs.map((d, i) => ({ id: d.deviceId, label: d.label || 'Entrada ' + (i + 1) }));
            this.refreshUi();
        } catch (e) {}
    }

    private refreshUi() {
        this.env.run(() => {});
    }

    // --- Canales ---

    private applyChannel(i: number) {
        const c = this.channels[i];
        this.set(this.trims[i].gain, c.trim, 0.015);
        this.set(this.mutes[i].gain, c.mute ? 0 : 1, 0.015);
    }

    setTrim(i: number, v: number) {
        this.channels[i].trim = Math.max(0, Math.min(2, v));
        this.applyChannel(i);
        this.env.changed();
    }

    toggleMute(i: number) {
        this.channels[i].mute = !this.channels[i].mute;
        this.applyChannel(i);
        this.env.changed();
    }

    setName(i: number, name: string) {
        this.channels[i].name = (name || '').trim().slice(0, MAX_NAME) || 'Entrada ' + (i + 1);
        this.env.changed();
    }

    /** Pico del canal (0..1), para el medidor. */
    level(i: number): number {
        if (!this.active)
            return 0;
        this.meters[i].getFloatTimeDomainData(this.buf);
        let p = 0;
        for (let k = 0; k < this.buf.length; k++)
            p = Math.max(p, Math.abs(this.buf[k]));
        return Math.min(1, p);
    }

    // Ids automatizables: trim.i (i desde 0)
    autoParam(id: string) {
        const m = /^trim\.(\d+)$/.exec(id);
        return m && +m[1] < AUDIOIN_CHANNELS ? { label: 'Entrada ' + (+m[1] + 1) + ' · Nivel', min: 0, max: 2 } : null;
    }

    getAutoValue(id: string): number {
        return this.channels[+id.split('.')[1]].trim;
    }

    setAutoValue(id: string, value: number) {
        this.setTrim(+id.split('.')[1], value);
    }

    // --- Estado ---

    // No guarda si estaba activa: la entrada se activa a mano en cada sesion
    getState() {
        return { deviceId: this.deviceId, channels: this.channels.map(c => ({ name: c.name, trim: c.trim, mute: c.mute })) };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        this.deviceId = typeof raw.deviceId == 'string' ? raw.deviceId.slice(0, 256) : '';
        const list = Array.isArray(raw.channels) ? raw.channels : [];
        for (let i = 0; i < AUDIOIN_CHANNELS; i++) {
            const r = list[i] && typeof list[i] == 'object' ? list[i] : {};
            this.channels[i] = {
                name: typeof r.name == 'string' && r.name.trim() ? r.name.trim().slice(0, MAX_NAME) : 'Entrada ' + (i + 1),
                trim: typeof r.trim == 'number' && isFinite(r.trim) ? Math.max(0, Math.min(2, r.trim)) : 1,
                mute: r.mute === true
            };
            this.applyChannel(i);
        }
    }

    dispose() {
        this.disposed = true;
        this.gen++;
        this.stopStream();
        if (this.listening) {
            try { navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange); } catch (e) {}
            this.listening = false;
        }
        try {
            this.outNode.disconnect();
            this.chOut.forEach(o => o.disconnect());
        } catch (e) {}
    }
}
