import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';

export const MIXER_CHANNELS = 8;
export const AUX_BUSES = 2;

export interface MixerStrip {
    gain: number;      // 0..1.5 (fader)
    pan: number;       // -1..1
    mute: boolean;
    solo: boolean;
    sends: Array<number>;   // envio a cada bus aux, 0..1.5 (despues del fader)
}

interface StripNodes {
    input: GainNode;
    fader: GainNode;
    pan: StereoPannerNode | null;
    meter: AnalyserNode;
    sends: Array<GainNode>;
}

/**
 * Mezclador de 8 canales: fader, paneo, mute, solo, medidor y envios aux por canal, mas el master.
 * Si hay algun solo, los canales sin solo se silencian (y tampoco envian).
 *
 * Envios aux (como en un mezclador real): cada canal manda una parte de su senal, despues del fader,
 * al bus aux. La salida AUX se cablea a un efecto, y la salida del efecto vuelve por RETORNO, que se
 * suma al master sin volver a pasar por los buses (asi no hay realimentacion).
 *
 *   canal -> fader -> pan -> bus -> master -> OUT
 *              \-> envio -> bus aux -> AUX n   ... [efecto] ...  RET n -> nivel de retorno -> bus
 */
export class MixerModule extends RackModule {
    readonly type = 'mixer';
    readonly ports: ReadonlyArray<PortDef>;
    public strips: Array<MixerStrip> = [];
    public master = 1;
    public auxLevel: Array<number> = [];      // nivel de cada bus aux (lo que sale hacia el efecto)
    public returnLevel: Array<number> = [];   // nivel de cada retorno (lo que vuelve del efecto)

    private nodes: Array<StripNodes> = [];
    private bus: GainNode;
    private masterGain: GainNode;
    private outNode: GainNode;
    private auxBuses: Array<GainNode> = [];
    private returns: Array<GainNode> = [];
    private masterMeter: AnalyserNode;
    private buf: Float32Array;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const ins: Array<PortDef> = [];
        const outs: Array<PortDef> = [{ id: 'out', kind: 'audio', dir: 'out', label: 'Salida' }];
        this.bus = ctx.createGain();
        this.masterGain = ctx.createGain();
        this.outNode = ctx.createGain();
        this.masterMeter = ctx.createAnalyser();
        this.masterMeter.fftSize = 512;
        this.buf = new Float32Array(512);
        this.bus.connect(this.masterGain);
        this.masterGain.connect(this.outNode);
        this.outNode.connect(this.masterMeter);

        for (let a = 0; a < AUX_BUSES; a++) {
            this.auxBuses.push(ctx.createGain());
            const ret = ctx.createGain();
            ret.connect(this.bus);   // el retorno entra directo al bus principal: no pasa por los envios
            this.returns.push(ret);
            this.auxLevel.push(1);
            this.returnLevel.push(1);
            ins.push({ id: 'ret' + (a + 1), kind: 'audio', dir: 'in', label: 'Retorno ' + (a + 1) });
            outs.push({ id: 'aux' + (a + 1), kind: 'audio', dir: 'out', label: 'Aux ' + (a + 1) });
        }

        const chans: Array<PortDef> = [];
        for (let i = 0; i < MIXER_CHANNELS; i++) {
            chans.push({ id: 'in' + (i + 1), kind: 'audio', dir: 'in', label: 'Canal ' + (i + 1) });
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
            const sends: Array<GainNode> = [];
            for (let a = 0; a < AUX_BUSES; a++) {
                const send = ctx.createGain();
                send.gain.value = 0;
                fader.connect(send);
                send.connect(this.auxBuses[a]);
                sends.push(send);
            }
            this.nodes.push({ input, fader, pan, meter, sends });
            this.strips.push({ gain: 0.8, pan: 0, mute: false, solo: false, sends: new Array(AUX_BUSES).fill(0) });
        }
        this.ports = chans.concat(ins, outs);
        this.applyAll();
    }

    audioPort(id: string): AudioNode | null {
        if (id == 'out')
            return this.outNode;
        let m = /^in(\d+)$/.exec(id);
        if (m) {
            const i = parseInt(m[1], 10) - 1;
            return i >= 0 && i < MIXER_CHANNELS ? this.nodes[i].input : null;
        }
        m = /^ret(\d+)$/.exec(id);
        if (m) {
            const a = parseInt(m[1], 10) - 1;
            return a >= 0 && a < AUX_BUSES ? this.returns[a] : null;
        }
        m = /^aux(\d+)$/.exec(id);
        if (m) {
            const a = parseInt(m[1], 10) - 1;
            return a >= 0 && a < AUX_BUSES ? this.auxBuses[a] : null;
        }
        return null;
    }

    /**
     * Rutas internas para detectar bucles: los canales llegan a la salida y a los buses aux, pero los
     * retornos solo llegan a la salida. Por eso "aux -> efecto -> retorno" es valido y
     * "salida -> efecto -> retorno" no (volveria a la salida).
     */
    routes(): Array<[string, string]> {
        const r: Array<[string, string]> = [];
        for (let i = 1; i <= MIXER_CHANNELS; i++) {
            r.push(['in' + i, 'out']);
            for (let a = 1; a <= AUX_BUSES; a++)
                r.push(['in' + i, 'aux' + a]);
        }
        for (let a = 1; a <= AUX_BUSES; a++)
            r.push(['ret' + a, 'out']);
        return r;
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
        n.sends.forEach((send, a) => this.set(send.gain, this.strips[i].sends[a], 0.015));
    }

    private applyAll() {
        for (let i = 0; i < MIXER_CHANNELS; i++)
            this.applyStrip(i);
        this.set(this.masterGain.gain, this.master, 0.015);
        for (let a = 0; a < AUX_BUSES; a++) {
            this.set(this.auxBuses[a].gain, this.auxLevel[a], 0.015);
            this.set(this.returns[a].gain, this.returnLevel[a], 0.015);
        }
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

    setSend(i: number, aux: number, v: number) {
        this.strips[i].sends[aux] = Math.max(0, Math.min(1.5, v));
        this.applyStrip(i);
        this.env.changed();
    }

    setAuxLevel(aux: number, v: number) {
        this.auxLevel[aux] = Math.max(0, Math.min(1.5, v));
        this.set(this.auxBuses[aux].gain, this.auxLevel[aux], 0.015);
        this.env.changed();
    }

    setReturn(aux: number, v: number) {
        this.returnLevel[aux] = Math.max(0, Math.min(1.5, v));
        this.set(this.returns[aux].gain, this.returnLevel[aux], 0.015);
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
        return { strips: this.strips, master: this.master, auxLevel: this.auxLevel, returnLevel: this.returnLevel };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const num = (v: any, min: number, max: number, d: number) => typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
        const list = Array.isArray(raw.strips) ? raw.strips : [];
        for (let i = 0; i < MIXER_CHANNELS; i++) {
            const r = list[i] && typeof list[i] == 'object' ? list[i] : {};
            const sends = Array.isArray(r.sends) ? r.sends : [];
            this.strips[i] = {
                gain: num(r.gain, 0, 1.5, 0.8), pan: num(r.pan, -1, 1, 0), mute: r.mute === true, solo: r.solo === true,
                sends: Array.from({ length: AUX_BUSES }, (_, a) => num(sends[a], 0, 1.5, 0))
            };
        }
        this.master = num(raw.master, 0, 1.5, 1);
        const aux = Array.isArray(raw.auxLevel) ? raw.auxLevel : [];
        const ret = Array.isArray(raw.returnLevel) ? raw.returnLevel : [];
        for (let a = 0; a < AUX_BUSES; a++) {
            this.auxLevel[a] = num(aux[a], 0, 1.5, 1);
            this.returnLevel[a] = num(ret[a], 0, 1.5, 1);
        }
        this.applyAll();
    }

    dispose() {
        this.bus.disconnect();
        this.outNode.disconnect();
    }
}
