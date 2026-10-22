import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';

/** Un control de un sintetizador con motor en AudioWorklet (las perillas van de 0 a 1; los selectores, de 0 a N-1). */
export interface SynthParam {
    id: string;
    name: string;
    choices: number;   // 0 = perilla 0..1; N = selector o interruptor de N posiciones
    def: number;
    labels: Array<string>;
}

export interface SynthPreset {
    name: string;
    category: string;
    values: { [id: string]: number };
}

export interface WorkletSynthConfig {
    workletUrl: string;     // relativo a <base href>
    processor: string;      // nombre con el que el worklet registra su procesador
    params: ReadonlyArray<SynthParam>;
    presets: ReadonlyArray<SynthPreset>;
}

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Carga un procesador de AudioWorklet en un AudioContext (una sola vez por contexto y archivo). Se baja como texto y se registra desde
 * un Blob: asi anda igual en el navegador, en la app de escritorio (esquema propio) y en el render offline.
 */
export function loadWorklet(ctx: BaseAudioContext, url: string): Promise<void> {
    let byUrl = loaded.get(ctx);
    if (!byUrl)
        loaded.set(ctx, byUrl = new Map());
    let p = byUrl.get(url);
    if (!p) {
        const worklet = (ctx as any).audioWorklet;
        p = worklet
            ? fetch(new URL(url, document.baseURI).toString())
                .then(r => {
                    if (!r.ok)
                        throw new Error('no se pudo bajar el motor (' + r.status + ')');
                    return r.text();
                })
                .then(code => worklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))))
            : Promise.reject(new Error('este navegador no soporta AudioWorklet (usa Chrome, Edge o Firefox actuales)'));
        byUrl.set(url, p);
    }
    return p;
}

/**
 * Base de los instrumentos cuyo audio lo genera un AudioWorklet (el mismo motor que el plugin, traducido a JavaScript): este modulo solo le
 * manda al worklet las notas y los controles. Entra por un puerto de notas y sale por uno de audio.
 */
export abstract class WorkletSynthModule extends RackModule {
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'notes', kind: 'note', dir: 'in', label: 'Notas' },
        { id: 'out', kind: 'audio', dir: 'out', label: 'Audio' }
    ];

    public values: { [id: string]: number } = {};
    public presetName = 'Init';
    public error = '';
    public gate = false;
    /** Cuantas notas estan apretadas ahora (para los LEDs del panel). */
    get heldCount(): number {
        return this.held.size;
    }

    /** Se resuelve cuando el motor ya esta cargado y recibio todo (el render offline lo espera). */
    public readonly ready: Promise<void>;

    private out: GainNode;
    private node: any = null;
    private queue: Array<any> = [];
    private held = new Set<number>();

    constructor(env: ModuleEnv, protected config: WorkletSynthConfig) {
        super(env);
        this.out = env.ctx.createGain();
        config.params.forEach(p => this.values[p.id] = p.def);
        this.ready = loadWorklet(env.ctx, config.workletUrl).then(() => {
            const Node = (window as any).AudioWorkletNode;
            this.node = new Node(env.ctx, config.processor, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
            this.node.connect(this.out);
            this.node.port.onmessage = (e: MessageEvent) => this.env.run(() => this.onNodeMessage(e.data));
            this.node.port.postMessage({ type: 'params', values: this.allValues() });
            this.queue.forEach(m => this.node.port.postMessage(m));
            this.queue = [];
        }).catch(e => {
            this.error = String(e && e.message || e);
        });
    }

    /** Lo que el worklet manda por su puerto (los sintes que no mandan nada no lo usan). */
    protected onNodeMessage(msg: any) {}

    protected allValues(): Array<number> {
        return this.config.params.map(p => this.values[p.id]);
    }

    protected post(msg: any) {
        if (this.node)
            this.node.port.postMessage(msg);
        else if (!this.error)
            this.queue.push(msg);
    }

    audioPort(id: string): AudioNode | null {
        return id == 'out' ? this.out : null;
    }

    get presets(): ReadonlyArray<SynthPreset> {
        return this.config.presets;
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

    def(id: string): SynthParam {
        return this.config.params.find(p => p.id == id);
    }

    setParam(id: string, value: number) {
        const def = this.def(id);
        if (!def || typeof value != 'number' || !isFinite(value))
            return;
        value = def.choices ? Math.round(Math.max(0, Math.min(def.choices - 1, value))) : Math.max(0, Math.min(1, value));
        this.values[id] = value;
        this.presetName = '';
        this.post({ type: 'param', id: this.config.params.indexOf(def), value });
        this.env.changed();
    }

    loadPreset(index: number) {
        const preset = this.config.presets[index];
        if (!preset)
            return;
        this.receive({ type: 'allOff' }, 'notes');
        this.config.params.forEach(p => this.values[p.id] = preset.values[p.id] !== undefined ? preset.values[p.id] : p.def);
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
        this.config.params.forEach(p => {
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
