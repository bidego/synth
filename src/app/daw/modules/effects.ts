import { EffectModule, ParamDef, dbToGain } from './effect.module';
import { ModuleEnv } from '../core/types';

/** Delay con realimentacion, filtro de tono y sincronizacion opcional al BPM. */
export class DelayModule extends EffectModule {
    readonly type = 'delay';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'sync', label: 'Sincronizar al BPM', kind: 'toggle', default: 1 },
        { id: 'division', label: 'Division', kind: 'choice', default: 0.75, options: [
            { label: '1/2', value: 2 }, { label: '1/4', value: 1 }, { label: '1/8 punt.', value: 0.75 },
            { label: '1/8', value: 0.5 }, { label: '1/16', value: 0.25 }] },
        { id: 'time', label: 'Tiempo', kind: 'range', min: 0.01, max: 1.5, step: 0.01, unit: ' s', default: 0.3 },
        { id: 'feedback', label: 'Realimentacion', kind: 'range', min: 0, max: 0.9, step: 0.01, default: 0.4 },
        { id: 'tone', label: 'Tono', kind: 'range', min: 800, max: 12000, step: 10, unit: ' Hz', log: true, default: 4000 },
        { id: 'mix', label: 'Mezcla', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.3 }
    ];
    private delay: DelayNode;
    private feedback: GainNode;
    private tone: BiquadFilterNode;
    private wet: GainNode;
    private dry: GainNode;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const fxIn = ctx.createGain(), fxOut = ctx.createGain();
        this.delay = ctx.createDelay(2);
        this.feedback = ctx.createGain();
        this.tone = ctx.createBiquadFilter();
        this.tone.type = 'lowpass';
        this.wet = ctx.createGain();
        this.dry = ctx.createGain();
        fxIn.connect(this.dry); this.dry.connect(fxOut);
        fxIn.connect(this.delay); this.delay.connect(this.tone);
        this.tone.connect(this.feedback); this.feedback.connect(this.delay);
        this.tone.connect(this.wet); this.wet.connect(fxOut);
        this.init(fxIn, fxOut);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'sync': case 'division': case 'time': this.applyTime(); break;
            case 'feedback': this.set(this.feedback.gain, value, 0.03); break;
            case 'tone': this.set(this.tone.frequency, value, 0.03); break;
            case 'mix':
                this.set(this.wet.gain, value, 0.03);
                this.set(this.dry.gain, 1 - value * 0.5, 0.03);
                break;
        }
    }

    private applyTime() {
        const v = this.values;
        const seconds = v.sync ? v.division * 60 / this.env.transport.bpm : v.time;
        this.set(this.delay.delayTime, Math.max(0.001, Math.min(1.99, seconds)), 0.03);
    }

    onTempo() {
        if (this.values.sync)
            this.applyTime();
    }
}

/** Reverb de convolucion con una respuesta al impulso generada (ruido con decaimiento). */
export class ReverbModule extends EffectModule {
    readonly type = 'reverb';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'decay', label: 'Duracion', kind: 'range', min: 0.3, max: 6, step: 0.1, unit: ' s', default: 2.4 },
        { id: 'predelay', label: 'Pre-delay', kind: 'range', min: 0, max: 0.2, step: 0.005, unit: ' s', default: 0.02 },
        { id: 'damping', label: 'Amortiguacion', kind: 'range', min: 1000, max: 16000, step: 100, unit: ' Hz', log: true, default: 7000 },
        { id: 'mix', label: 'Mezcla', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.3 }
    ];
    private pre: DelayNode;
    private convolver: ConvolverNode;
    private damp: BiquadFilterNode;
    private wet: GainNode;
    private dry: GainNode;
    private irTimer: any;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const fxIn = ctx.createGain(), fxOut = ctx.createGain();
        this.pre = ctx.createDelay(0.5);
        this.convolver = ctx.createConvolver();
        this.damp = ctx.createBiquadFilter();
        this.damp.type = 'lowpass';
        this.wet = ctx.createGain();
        this.dry = ctx.createGain();
        fxIn.connect(this.dry); this.dry.connect(fxOut);
        fxIn.connect(this.pre); this.pre.connect(this.convolver); this.convolver.connect(this.damp);
        this.damp.connect(this.wet); this.wet.connect(fxOut);
        this.init(fxIn, fxOut);
        this.buildImpulse();
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'decay':
                // Regenerar la respuesta es caro: se espera a que el usuario suelte el control
                clearTimeout(this.irTimer);
                if (this.env.live)
                    this.irTimer = setTimeout(() => this.buildImpulse(), 150);
                else
                    this.buildImpulse();
                break;
            case 'predelay': this.set(this.pre.delayTime, value, 0.03); break;
            case 'damping': this.set(this.damp.frequency, value, 0.03); break;
            case 'mix':
                this.set(this.wet.gain, value, 0.03);
                this.set(this.dry.gain, 1 - value * 0.4, 0.03);
                break;
        }
    }

    private buildImpulse() {
        const ctx = this.env.ctx;
        const length = Math.floor(ctx.sampleRate * (this.values.decay || 2.4));
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++)
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
        }
        this.convolver.buffer = buffer;
    }

    dispose() {
        clearTimeout(this.irTimer);
        super.dispose();
    }
}

/** Chorus: dos lineas de retardo cortas moduladas por LFOs ligeramente desfasados. */
export class ChorusModule extends EffectModule {
    readonly type = 'chorus';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'rate', label: 'Velocidad', kind: 'range', min: 0.1, max: 8, step: 0.1, unit: ' Hz', default: 0.8 },
        { id: 'depth', label: 'Profundidad', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'mix', label: 'Mezcla', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5 }
    ];
    private lfos: Array<OscillatorNode> = [];
    private depths: Array<GainNode> = [];
    private wet: GainNode;
    private dry: GainNode;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const fxIn = ctx.createGain(), fxOut = ctx.createGain();
        this.wet = ctx.createGain();
        this.dry = ctx.createGain();
        fxIn.connect(this.dry); this.dry.connect(fxOut);
        this.wet.connect(fxOut);
        [0.012, 0.019].forEach((base, i) => {
            const delay = ctx.createDelay(0.1);
            delay.delayTime.value = base;
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.connect(depth); depth.connect(delay.delayTime);
            lfo.start();
            fxIn.connect(delay); delay.connect(this.wet);
            this.lfos.push(lfo); this.depths.push(depth);
        });
        this.init(fxIn, fxOut);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'rate': this.lfos.forEach((l, i) => this.set(l.frequency, value * (1 + i * 0.13), 0.05)); break;
            case 'depth': this.depths.forEach(d => this.set(d.gain, value * 0.004, 0.05)); break;
            case 'mix':
                this.set(this.wet.gain, value, 0.03);
                this.set(this.dry.gain, 1 - value * 0.4, 0.03);
                break;
        }
    }

    dispose() {
        this.lfos.forEach(l => { try { l.stop(); } catch (e) {} });
        super.dispose();
    }
}

/** Distorsion por saturacion (tanh), con tono y nivel de salida. */
export class DistortionModule extends EffectModule {
    readonly type = 'distortion';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'drive', label: 'Drive', kind: 'range', min: 1, max: 40, step: 0.5, log: true, default: 8 },
        { id: 'tone', label: 'Tono', kind: 'range', min: 800, max: 12000, step: 10, unit: ' Hz', log: true, default: 5000 },
        { id: 'level', label: 'Nivel', kind: 'range', min: 0, max: 1.5, step: 0.01, default: 0.5 },
        { id: 'mix', label: 'Mezcla', kind: 'range', min: 0, max: 1, step: 0.01, default: 1 }
    ];
    private pre: GainNode;
    private tone: BiquadFilterNode;
    private levelGain: GainNode;
    private wet: GainNode;
    private dry: GainNode;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        const fxIn = ctx.createGain(), fxOut = ctx.createGain();
        this.pre = ctx.createGain();
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(2048);
        // Se escala para que +-1 entre en el tramo no lineal de la funcion
        for (let i = 0; i < curve.length; i++)
            curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 3);
        shaper.curve = curve;
        shaper.oversample = '4x';
        this.tone = ctx.createBiquadFilter();
        this.tone.type = 'lowpass';
        this.levelGain = ctx.createGain();
        this.wet = ctx.createGain();
        this.dry = ctx.createGain();
        fxIn.connect(this.dry); this.dry.connect(fxOut);
        fxIn.connect(this.pre); this.pre.connect(shaper); shaper.connect(this.tone);
        this.tone.connect(this.levelGain); this.levelGain.connect(this.wet); this.wet.connect(fxOut);
        this.init(fxIn, fxOut);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'drive': this.set(this.pre.gain, value, 0.03); break;
            case 'tone': this.set(this.tone.frequency, value, 0.03); break;
            case 'level': this.set(this.levelGain.gain, value, 0.03); break;
            case 'mix':
                this.set(this.wet.gain, value, 0.03);
                this.set(this.dry.gain, 1 - value, 0.03);
                break;
        }
    }
}

/** Ecualizador de tres bandas: graves, medios (frecuencia ajustable) y agudos. */
export class EqModule extends EffectModule {
    readonly type = 'eq';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'low', label: 'Graves', kind: 'range', min: -15, max: 15, step: 0.5, unit: ' dB', default: 0 },
        { id: 'mid', label: 'Medios', kind: 'range', min: -15, max: 15, step: 0.5, unit: ' dB', default: 0 },
        { id: 'midFreq', label: 'Frecuencia medios', kind: 'range', min: 200, max: 5000, step: 10, unit: ' Hz', log: true, default: 1000 },
        { id: 'high', label: 'Agudos', kind: 'range', min: -15, max: 15, step: 0.5, unit: ' dB', default: 0 }
    ];
    private low: BiquadFilterNode;
    private mid: BiquadFilterNode;
    private high: BiquadFilterNode;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 120;
        this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.Q.value = 1;
        this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 8000;
        this.low.connect(this.mid); this.mid.connect(this.high);
        this.init(this.low, this.high);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'low': this.set(this.low.gain, value, 0.03); break;
            case 'mid': this.set(this.mid.gain, value, 0.03); break;
            case 'midFreq': this.set(this.mid.frequency, value, 0.03); break;
            case 'high': this.set(this.high.gain, value, 0.03); break;
        }
    }
}

/** Compresor con ataque, release, rodilla y ganancia de compensacion. */
export class CompressorModule extends EffectModule {
    readonly type = 'compressor';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'threshold', label: 'Umbral', kind: 'range', min: -60, max: 0, step: 1, unit: ' dB', default: -24 },
        { id: 'ratio', label: 'Relacion', kind: 'range', min: 1, max: 20, step: 0.5, unit: ':1', default: 4 },
        { id: 'attack', label: 'Ataque', kind: 'range', min: 0, max: 0.3, step: 0.001, unit: ' s', default: 0.01 },
        { id: 'release', label: 'Release', kind: 'range', min: 0.01, max: 1, step: 0.01, unit: ' s', default: 0.2 },
        { id: 'knee', label: 'Rodilla', kind: 'range', min: 0, max: 40, step: 1, unit: ' dB', default: 10 },
        { id: 'makeup', label: 'Ganancia', kind: 'range', min: 0, max: 24, step: 0.5, unit: ' dB', default: 0 }
    ];
    private comp: DynamicsCompressorNode;
    private makeup: GainNode;

    constructor(env: ModuleEnv) {
        super(env);
        this.comp = env.ctx.createDynamicsCompressor();
        this.makeup = env.ctx.createGain();
        this.comp.connect(this.makeup);
        this.init(this.comp, this.makeup);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'threshold': this.set(this.comp.threshold, value, 0.02); break;
            case 'ratio': this.set(this.comp.ratio, value, 0.02); break;
            case 'attack': this.set(this.comp.attack, value, 0.02); break;
            case 'release': this.set(this.comp.release, value, 0.02); break;
            case 'knee': this.set(this.comp.knee, value, 0.02); break;
            case 'makeup': this.set(this.makeup.gain, dbToGain(value), 0.02); break;
        }
    }

    /** Reduccion de ganancia actual en dB (negativa), para el medidor. */
    reduction(): number {
        const r: any = (this.comp as any).reduction;
        return typeof r == 'number' ? r : (r && r.value) || 0;
    }
}

/** Limitador: sube la senal contra un techo que no se puede pasar. */
export class LimiterModule extends EffectModule {
    readonly type = 'limiter';
    readonly paramDefs: ReadonlyArray<ParamDef> = [
        { id: 'gain', label: 'Ganancia de entrada', kind: 'range', min: 0, max: 24, step: 0.5, unit: ' dB', default: 0 },
        { id: 'ceiling', label: 'Techo', kind: 'range', min: -20, max: 0, step: 0.5, unit: ' dB', default: -1 },
        { id: 'release', label: 'Release', kind: 'range', min: 0.01, max: 0.5, step: 0.01, unit: ' s', default: 0.1 }
    ];
    private pre: GainNode;
    private comp: DynamicsCompressorNode;

    constructor(env: ModuleEnv) {
        super(env);
        this.pre = env.ctx.createGain();
        this.comp = env.ctx.createDynamicsCompressor();
        this.comp.ratio.value = 20;
        this.comp.knee.value = 0;
        this.comp.attack.value = 0.001;
        this.pre.connect(this.comp);
        this.init(this.pre, this.comp);
    }

    protected apply(id: string, value: number) {
        switch (id) {
            case 'gain': this.set(this.pre.gain, dbToGain(value), 0.02); break;
            case 'ceiling': this.set(this.comp.threshold, value, 0.02); break;
            case 'release': this.set(this.comp.release, value, 0.02); break;
        }
    }

    reduction(): number {
        const r: any = (this.comp as any).reduction;
        return typeof r == 'number' ? r : (r && r.value) || 0;
    }
}
