import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';

/**
 * Salida de audio: el final de la cadena. Lleva el nivel general, un limitador de seguridad y el
 * analizador que alimenta el visualizador. Sin cables hacia aca no se escucha nada.
 */
export class OutputModule extends RackModule {
    readonly type = 'output';
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'in', kind: 'audio', dir: 'in', label: 'Entrada' }
    ];
    public level = 1;
    public readonly analyser: AnalyserNode;

    private input: GainNode;
    private safety: DynamicsCompressorNode;
    private buf: Float32Array;

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        this.input = ctx.createGain();
        // Muchas capas suman volumen: el compresor de seguridad evita que sature
        this.safety = ctx.createDynamicsCompressor();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        this.buf = new Float32Array(512);
        this.input.connect(this.safety);
        this.safety.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    audioPort(id: string): AudioNode | null {
        return id == 'in' ? this.input : null;
    }

    setLevel(v: number) {
        this.level = Math.max(0, Math.min(1.5, v));
        this.input.gain.setTargetAtTime(this.level, this.env.ctx.currentTime, 0.015);
        this.env.changed();
    }

    /** Pico de la salida (0..1), para el medidor. */
    peak(): number {
        const a = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(a);
        let p = 0;
        for (let i = 0; i < a.length; i++)
            p = Math.max(p, Math.abs(a[i]));
        return Math.min(1, p);
    }

    getState() {
        return { level: this.level };
    }

    setState(raw: any) {
        const v = raw && typeof raw.level == 'number' && isFinite(raw.level) ? raw.level : 1;
        this.level = Math.max(0, Math.min(1.5, v));
        this.input.gain.value = this.level;
    }

    dispose() {
        this.analyser.disconnect();
    }
}
