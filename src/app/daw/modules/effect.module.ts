import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';

export interface ParamChoice {
    label: string;
    value: number;
}

/** Descripcion de un parametro: con esto una sola interfaz genera los controles de cualquier efecto. */
export interface ParamDef {
    id: string;
    label: string;
    kind: 'range' | 'toggle' | 'choice';
    default: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    log?: boolean;              // el slider es logaritmico (frecuencias)
    options?: Array<ParamChoice>;
}

/**
 * Base de los efectos y dinamicos: una entrada de audio, una salida y un bypass.
 *
 *  in -> [efecto] -> fxGain  -> out
 *     -> bypassGain -----------^
 */
export abstract class EffectModule extends RackModule {
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'in', kind: 'audio', dir: 'in', label: 'Entrada' },
        { id: 'out', kind: 'audio', dir: 'out', label: 'Salida' }
    ];
    abstract readonly paramDefs: ReadonlyArray<ParamDef>;

    public values: { [id: string]: number } = {};
    public bypass = false;
    public readonly meter: AnalyserNode;

    private inNode: GainNode;
    private outNode: GainNode;
    private fxGain: GainNode;
    private bypassGain: GainNode;
    private meterBuf: Float32Array;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        this.inNode = ctx.createGain();
        this.outNode = ctx.createGain();
        this.fxGain = ctx.createGain();
        this.bypassGain = ctx.createGain();
        this.bypassGain.gain.value = 0;
        this.meter = ctx.createAnalyser();
        this.meter.fftSize = 512;
        this.meterBuf = new Float32Array(this.meter.fftSize);
        this.fxGain.connect(this.outNode);
        this.inNode.connect(this.bypassGain);
        this.bypassGain.connect(this.outNode);
        this.outNode.connect(this.meter);
    }

    /** Las subclases la llaman al final de su constructor, con el circuito del efecto ya armado. */
    protected init(fxInput: AudioNode, fxOutput: AudioNode) {
        this.inNode.connect(fxInput);
        fxOutput.connect(this.fxGain);
        // Primero todos los valores y despues aplicarlos: algunos efectos combinan varios parametros
        // (ej. el delay calcula su tiempo con sync + division + time)
        this.paramDefs.forEach(def => this.values[def.id] = def.default);
        this.paramDefs.forEach(def => this.apply(def.id, def.default));
    }

    /** Aplica el valor de un parametro al circuito. */
    protected abstract apply(id: string, value: number): void;

    audioPort(id: string): AudioNode | null {
        return id == 'in' ? this.inNode : id == 'out' ? this.outNode : null;
    }

    setParam(id: string, value: number) {
        const def = this.paramDefs.find(d => d.id == id);
        if (!def || typeof value != 'number' || !isFinite(value))
            return;
        if (def.kind == 'range')
            value = Math.max(def.min, Math.min(def.max, value));
        else if (def.kind == 'toggle')
            value = value ? 1 : 0;
        else if (!def.options.some(o => o.value == value))
            return;
        this.values[id] = value;
        this.apply(id, value);
        this.env.changed();
    }

    autoParam(id: string) {
        const def = id.indexOf('p.') == 0 ? this.paramDefs.find(d => d.id == id.slice(2)) : null;
        return def && def.kind == 'range' ? { label: def.label, min: def.min, max: def.max } : null;
    }

    getAutoValue(id: string): number {
        return this.values[id.slice(2)];
    }

    setAutoValue(id: string, value: number) {
        this.setParam(id.slice(2), value);
    }

    setBypass(on: boolean) {
        this.bypass = on;
        this.set(this.fxGain.gain, on ? 0 : 1, 0.01);
        this.set(this.bypassGain.gain, on ? 1 : 0, 0.01);
        this.env.changed();
    }

    /** Pico de la senal de salida (0..1), para el medidor. */
    level(): number {
        this.meter.getFloatTimeDomainData(this.meterBuf);
        let peak = 0;
        for (let i = 0; i < this.meterBuf.length; i++)
            peak = Math.max(peak, Math.abs(this.meterBuf[i]));
        return Math.min(1, peak);
    }

    getState() {
        return { values: this.values, bypass: this.bypass };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const values = raw.values && typeof raw.values == 'object' ? raw.values : {};
        this.paramDefs.forEach(def => {
            if (typeof values[def.id] == 'number')
                this.setParam(def.id, values[def.id]);
        });
        this.setBypass(raw.bypass === true);
    }

    dispose() {
        this.inNode.disconnect();
        this.outNode.disconnect();
    }
}

/** dB -> ganancia lineal. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
