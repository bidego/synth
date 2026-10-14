import { RackModule } from '../core/module';
import { ModuleEnv, PortDef } from '../core/types';

export const PATCH_CHANNELS = 4;

/**
 * Splitter 1 -> 4: una entrada de audio que se reparte en cuatro salidas identicas (mult).
 * Cada salida tiene su propio mute, como un patchbay real.
 */
export class SplitterModule extends RackModule {
    readonly type = 'splitter';
    readonly ports: ReadonlyArray<PortDef>;
    public muted: Array<boolean> = [];
    private input: GainNode;
    private outs: Array<GainNode> = [];

    constructor(env: ModuleEnv) {
        super(env);
        const ports: Array<PortDef> = [{ id: 'in', kind: 'audio', dir: 'in', label: 'Entrada' }];
        this.input = env.ctx.createGain();
        for (let i = 0; i < PATCH_CHANNELS; i++) {
            ports.push({ id: 'out' + (i + 1), kind: 'audio', dir: 'out', label: 'Salida ' + (i + 1) });
            const out = env.ctx.createGain();
            this.input.connect(out);
            this.outs.push(out);
            this.muted.push(false);
        }
        this.ports = ports;
    }

    audioPort(id: string): AudioNode | null {
        if (id == 'in')
            return this.input;
        const m = /^out(\d+)$/.exec(id);
        const i = m ? parseInt(m[1], 10) - 1 : -1;
        return i >= 0 && i < PATCH_CHANNELS ? this.outs[i] : null;
    }

    toggleMute(i: number) {
        this.muted[i] = !this.muted[i];
        this.outs[i].gain.setTargetAtTime(this.muted[i] ? 0 : 1, this.env.ctx.currentTime, 0.01);
        this.env.changed();
    }

    getState() {
        return { muted: this.muted };
    }

    setState(raw: any) {
        const list = raw && Array.isArray(raw.muted) ? raw.muted : [];
        for (let i = 0; i < PATCH_CHANNELS; i++) {
            this.muted[i] = list[i] === true;
            this.outs[i].gain.value = this.muted[i] ? 0 : 1;
        }
    }

    dispose() {
        this.input.disconnect();
    }
}

/** Merger 4 -> 1: suma cuatro entradas de audio en una salida. Cada entrada tiene su mute. */
export class MergerModule extends RackModule {
    readonly type = 'merger';
    readonly ports: ReadonlyArray<PortDef>;
    public muted: Array<boolean> = [];
    private ins: Array<GainNode> = [];
    private sum: GainNode;

    constructor(env: ModuleEnv) {
        super(env);
        const ports: Array<PortDef> = [];
        this.sum = env.ctx.createGain();
        for (let i = 0; i < PATCH_CHANNELS; i++) {
            ports.push({ id: 'in' + (i + 1), kind: 'audio', dir: 'in', label: 'Entrada ' + (i + 1) });
            const input = env.ctx.createGain();
            input.connect(this.sum);
            this.ins.push(input);
            this.muted.push(false);
        }
        ports.push({ id: 'out', kind: 'audio', dir: 'out', label: 'Salida' });
        this.ports = ports;
    }

    audioPort(id: string): AudioNode | null {
        if (id == 'out')
            return this.sum;
        const m = /^in(\d+)$/.exec(id);
        const i = m ? parseInt(m[1], 10) - 1 : -1;
        return i >= 0 && i < PATCH_CHANNELS ? this.ins[i] : null;
    }

    toggleMute(i: number) {
        this.muted[i] = !this.muted[i];
        this.ins[i].gain.setTargetAtTime(this.muted[i] ? 0 : 1, this.env.ctx.currentTime, 0.01);
        this.env.changed();
    }

    getState() {
        return { muted: this.muted };
    }

    setState(raw: any) {
        const list = raw && Array.isArray(raw.muted) ? raw.muted : [];
        for (let i = 0; i < PATCH_CHANNELS; i++) {
            this.muted[i] = list[i] === true;
            this.ins[i].gain.value = this.muted[i] ? 0 : 1;
        }
    }

    dispose() {
        this.sum.disconnect();
    }
}
