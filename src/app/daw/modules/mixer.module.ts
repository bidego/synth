import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';

export const MIXER_CHANNELS = 8;

export interface MixerStrip {
    gain: number;    // 0..1.5 (fader)
    pan: number;     // -1..1
    mute: boolean;
    solo: boolean;
}

interface StripNodes {
    input: GainNode;
    fader: GainNode;
    pan: StereoPannerNode | null;
    meter: AnalyserNode;
}

/**
 * Mezclador de 8 canales: fader, paneo, mute, solo y medidor por canal, mas un fader master.
 * Si hay algun solo, los canales sin solo se silencian.
 */
export class MixerModule extends RackModule {
    readonly type = 'mixer';
    readonly ports: ReadonlyArray<PortDef>;
    public strips: Array<MixerStrip> = [];
    public master = 1;

    private nodes: Array<StripNodes> = [];
    private bus: GainNode;
    private masterGain: GainNode;
    private outNode: GainNode;
    private masterMeter: AnalyserNode;
    private buf: Float32Array;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const ports: Array<PortDef> = [];
        this.bus = ctx.createGain();
        this.masterGain = ctx.createGain();
        this.outNode = ctx.createGain();
        this.masterMeter = ctx.createAnalyser();
        this.masterMeter.fftSize = 512;
        this.buf = new Float32Array(512);
        this.bus.connect(this.masterGain);
        this.masterGain.connect(this.outNode);
        this.outNode.connect(this.masterMeter);
        for (let i = 0; i < MIXER_CHANNELS; i++) {
            ports.push({ id: 'in' + (i + 1), kind: 'audio', dir: 'in', label: 'Canal ' + (i + 1) });
            const input = ctx.createGain();
            const fader = ctx.createGain();
            const pan = (ctx as any).createStereoPanner ? ctx.createStereoPanner() : null;
            const meter = ctx.createAnalyser();
            meter.fftSize = 512;
            input.connect(fader);
            if (pan) {
                fader.connect(pan);
                pan.connect(this.bus);
                pan.connect(meter);
            } else {
                fader.connect(this.bus);
                fader.connect(meter);
            }
            this.nodes.push({ input, fader, pan, meter });
            this.strips.push({ gain: 0.8, pan: 0, mute: false, solo: false });
        }
        ports.push({ id: 'out', kind: 'audio', dir: 'out', label: 'Salida' });
        this.ports = ports;
        this.applyAll();
    }

    audioPort(id: string): AudioNode | null {
        if (id == 'out')
            return this.outNode;
        const m = /^in(\d+)$/.exec(id);
        const i = m ? parseInt(m[1], 10) - 1 : -1;
        return i >= 0 && i < MIXER_CHANNELS ? this.nodes[i].input : null;
    }

    get anySolo(): boolean {
        return this.strips.some(s => s.solo);
    }

    // Un canal suena si no esta en mute y (no hay solos, o es uno de los solos)
    private audible(i: number): boolean {
        const s = this.strips[i];
        return !s.mute && (!this.anySolo || s.solo);
    }

    private applyStrip(i: number) {
        const n = this.nodes[i];
        this.set(n.fader.gain, this.audible(i) ? this.strips[i].gain : 0, 0.015);
        if (n.pan)
            this.set(n.pan.pan, this.strips[i].pan, 0.015);
    }

    private applyAll() {
        for (let i = 0; i < MIXER_CHANNELS; i++)
            this.applyStrip(i);
        this.set(this.masterGain.gain, this.master, 0.015);
    }

    setGain(i: number, v: number) {
        this.strips[i].gain = Math.max(0, Math.min(1.5, v));
        this.applyStrip(i);
        this.env.changed();
    }

    setPan(i: number, v: number) {
        this.strips[i].pan = Math.max(-1, Math.min(1, v));
        this.applyStrip(i);
        this.env.changed();
    }

    toggleMute(i: number) {
        this.strips[i].mute = !this.strips[i].mute;
        this.applyAll();
        this.env.changed();
    }

    toggleSolo(i: number) {
        this.strips[i].solo = !this.strips[i].solo;
        this.applyAll();   // un solo afecta a todos los canales
        this.env.changed();
    }

    setMaster(v: number) {
        this.master = Math.max(0, Math.min(1.5, v));
        this.set(this.masterGain.gain, this.master, 0.015);
        this.env.changed();
    }

    private peak(a: AnalyserNode): number {
        a.getFloatTimeDomainData(this.buf);
        let p = 0;
        for (let i = 0; i < this.buf.length; i++)
            p = Math.max(p, Math.abs(this.buf[i]));
        return Math.min(1, p);
    }

    /** Pico del canal (0..1), para el medidor. */
    channelLevel(i: number): number {
        return this.peak(this.nodes[i].meter);
    }

    masterLevel(): number {
        return this.peak(this.masterMeter);
    }

    getState() {
        return { strips: this.strips, master: this.master };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const num = (v: any, min: number, max: number, d: number) => typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
        const list = Array.isArray(raw.strips) ? raw.strips : [];
        for (let i = 0; i < MIXER_CHANNELS; i++) {
            const r = list[i] && typeof list[i] == 'object' ? list[i] : {};
            this.strips[i] = { gain: num(r.gain, 0, 1.5, 0.8), pan: num(r.pan, -1, 1, 0), mute: r.mute === true, solo: r.solo === true };
        }
        this.master = num(raw.master, 0, 1.5, 1);
        this.applyAll();
    }

    dispose() {
        this.bus.disconnect();
        this.outNode.disconnect();
    }
}
