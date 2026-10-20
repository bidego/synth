import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';
import { MD_PARAMS, MD_PRESETS, MdParam } from './modeld-data';

export { MD_PARAMS, MD_PRESETS, MdParam, MdPreset } from './modeld-data';

const WORKLET_URL = 'assets/worklets/modeld-worklet.js';
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Carga el procesador del Model D en un AudioContext (una sola vez por contexto). Se baja como texto y se registra desde un Blob:
 * asi anda igual en el navegador, en la app de escritorio (esquema propio) y en el render offline.
 */
export function loadModelDWorklet(ctx: BaseAudioContext): Promise<void> {
    let p = loaded.get(ctx);
    if (!p) {
        const worklet = (ctx as any).audioWorklet;
        p = worklet
            ? fetch(new URL(WORKLET_URL, document.baseURI).toString())
                .then(r => {
                    if (!r.ok)
                        throw new Error('no se pudo bajar el motor del Model D (' + r.status + ')');
                    return r.text();
                })
                .then(code => worklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))))
            : Promise.reject(new Error('este navegador no soporta AudioWorklet (usa Chrome, Edge o Firefox actuales)'));
        loaded.set(ctx, p);
    }
    return p;
}

/**
 * Model D: sintetizador monofonico de tres osciladores y filtro de escalera, inspirado en el Minimoog. El audio lo genera el
 * mismo motor que el plugin (traducido a un AudioWorklet); este modulo solo le manda las notas y los controles.
 */
export class ModelDModule extends RackModule {
    readonly type = 'modeld';
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'notes', kind: 'note', dir: 'in', label: 'Notas' },
        { id: 'out', kind: 'audio', dir: 'out', label: 'Audio' }
    ];

    public values: { [id: string]: number } = {};
    public presetName = 'Init';
    public error = '';
    public gate = false;
    /** Se resuelve cuando el motor ya esta cargado y recibio todo (el render offline lo espera). */
    public readonly ready: Promise<void>;

    private out: GainNode;
    private node: any = null;
    private queue: Array<any> = [];
    private held = new Set<number>();

    constructor(env: ModuleEnv) {
        super(env);
        this.out = env.ctx.createGain();
        MD_PARAMS.forEach(p => this.values[p.id] = p.def);
        this.ready = loadModelDWorklet(env.ctx).then(() => {
            const Node = (window as any).AudioWorkletNode;
            this.node = new Node(env.ctx, 'modeld-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
            this.node.connect(this.out);
            this.node.port.postMessage({ type: 'params', values: this.allValues() });
            this.queue.forEach(m => this.node.port.postMessage(m));
            this.queue = [];
        }).catch(e => {
            this.error = String(e && e.message || e);
        });
    }

    private allValues(): Array<number> {
        return MD_PARAMS.map(p => this.values[p.id]);
    }

    private post(msg: any) {
        if (this.node)
            this.node.port.postMessage(msg);
        else if (!this.error)
            this.queue.push(msg);
    }

    audioPort(id: string): AudioNode | null {
        return id == 'out' ? this.out : null;
    }

    receive(msg: NoteMsg, port: string) {
        if (port != 'notes')
            return;
        switch (msg.type) {
            case 'on':
                this.held.add(msg.midi);
                this.gate = true;
                this.post({ type: 'on', note: msg.midi, vel: msg.velocity, t: msg.when || 0 });
                break;
            case 'off':
                this.held.delete(msg.midi);
                this.gate = this.held.size > 0;
                this.post({ type: 'off', note: msg.midi, t: msg.when || 0 });
                break;
            case 'bend':
                this.post({ type: 'bend', value: Math.max(-1, Math.min(1, msg.cents / 200)) });
                break;
            case 'cc':
                if (msg.cc == 1)
                    this.post({ type: 'mod', value: Math.max(0, Math.min(1, msg.value / 127)) });
                break;
            case 'allOff':
                this.held.clear();
                this.gate = false;
                this.post({ type: 'allOff' });
                break;
        }
    }

    /** La rueda de modulacion del panel (0..1). */
    setModWheel(v: number) {
        this.post({ type: 'mod', value: v });
    }

    /** La rueda de tono del panel (-1..1, vuelve al centro). */
    setBend(v: number) {
        this.post({ type: 'bend', value: v });
    }

    def(id: string): MdParam {
        return MD_PARAMS.find(p => p.id == id);
    }

    setParam(id: string, value: number) {
        const def = this.def(id);
        const index = MD_PARAMS.indexOf(def);
        if (!def || typeof value != 'number' || !isFinite(value))
            return;
        value = def.choices ? Math.round(Math.max(0, Math.min(def.choices - 1, value))) : Math.max(0, Math.min(1, value));
        this.values[id] = value;
        this.presetName = '';
        this.post({ type: 'param', id: index, value });
        this.env.changed();
    }

    loadPreset(index: number) {
        const preset = MD_PRESETS[index];
        if (!preset)
            return;
        this.receive({ type: 'allOff' }, 'notes');
        MD_PARAMS.forEach(p => this.values[p.id] = preset.values[p.id] !== undefined ? preset.values[p.id] : p.def);
        this.presetName = preset.name;
        this.post({ type: 'params', values: this.allValues() });
        this.env.changed();
    }

    // --- Automatizacion y estado ---

    autoParam(id: string) {
        const def = id.indexOf('p.') == 0 ? this.def(id.slice(2)) : null;
        return def && !def.choices ? { label: def.name, min: 0, max: 1 } : null;
    }

    getAutoValue(id: string): number {
        return this.values[id.slice(2)];
    }

    setAutoValue(id: string, value: number) {
        this.setParam(id.slice(2), value);
    }

    getState() {
        return { values: this.values, preset: this.presetName };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const saved = raw.values && typeof raw.values == 'object' ? raw.values : {};
        MD_PARAMS.forEach(p => {
            const x = typeof saved[p.id] == 'number' && isFinite(saved[p.id]) ? saved[p.id] : p.def;
            this.values[p.id] = p.choices ? Math.round(Math.max(0, Math.min(p.choices - 1, x))) : Math.max(0, Math.min(1, x));
        });
        this.presetName = typeof raw.preset == 'string' ? raw.preset : '';
        this.post({ type: 'params', values: this.allValues() });
    }

    dispose() {
        try {
            if (this.node) {
                this.node.port.postMessage({ type: 'allOff' });
                this.node.disconnect();
            }
        } catch (e) {}
        this.out.disconnect();
    }
}
