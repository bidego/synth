import { ModuleEnv } from '../core/types';
import { TransportClient } from '../core/transport.service';
import { WorkletSynthModule } from './worklet-synth.module';
import { RE_INSTRUMENTS, RE_PARAMS, RE_PRESETS } from './rhythmeight-data';

export { RE_INSTRUMENTS, RE_PARAMS, RE_PRESETS } from './rhythmeight-data';

export const RE_STEPS = 16;
/** Nota GM de bateria de cada instrumento (el mismo orden que RE_INSTRUMENTS). */
export const RE_NOTES = [36, 38, 41, 45, 48, 37, 75, 39, 70, 56, 49, 46, 42];
/** Largo del patron segun el selector "Steps" (en pasos de semicorchea). */
const STEP_LENGTHS = [16, 12, 8, 4];
const CHARS = '.xX';

/**
 * Rhythm Eight: caja de ritmos analogica de 13 voces con secuenciador de 16 pasos (acento y shuffle). Mismo motor que el plugin, en un
 * AudioWorklet. Tiene dos modos de reloj:
 *  - Interna: el worklet corre su propio secuenciador (Tempo y RUN del panel).
 *  - Rack: sigue el transporte del rack (Play, loop, tempo, cuenta previa y el WAV exportado). El modulo agenda cada golpe como una
 *    nota GM con su tiempo exacto, igual que el resto de los secuenciadores, y el secuenciador del worklet queda detenido.
 */
export class RhythmEightModule extends WorkletSynthModule implements TransportClient {
    readonly type = 'rhythmeight';

    /** Un valor por paso: 0 vacio, 1 golpe, 2 acento. */
    public pattern: Array<Array<number>> = RE_INSTRUMENTS.map(() => new Array(RE_STEPS).fill(0));
    /** Paso que suena segun el worklet (reloj interno); -1 = parado. */
    private workletStep = -1;

    constructor(env: ModuleEnv) {
        super(env, { workletUrl: 'assets/worklets/rhythmeight-worklet.js', processor: 'rhythmeight-processor', params: RE_PARAMS, presets: RE_PRESETS });
        if (env.live && env.clock)
            env.clock.register(this);
    }

    // --- Reloj ---

    /** Sigue el transporte del rack (Sync = Host en el panel). */
    get rackSync(): boolean {
        return this.values.sync >= 1;
    }

    get stepLength(): number {
        return STEP_LENGTHS[this.values.steps] || RE_STEPS;
    }

    /** Tempo que se muestra: el del rack o el propio (40..240). */
    get bpm(): number {
        return this.rackSync ? this.env.transport.bpm : 40 + 200 * this.values.tempo;
    }

    /** Paso que suena ahora (para el indicador), -1 si esta parado. */
    get currentStep(): number {
        const clock = this.env.clock;
        if (!this.rackSync)
            return this.workletStep;
        if (!clock || !clock.playing || clock.countingIn)
            return -1;
        const len = this.stepLength;
        const step = Math.floor((((clock.absBeat * 4) % len) + len) % len);
        return step;
    }

    /** En modo Rack el secuenciador del worklet se mantiene detenido: los golpes llegan como notas con su tiempo. */
    protected allValues(): Array<number> {
        return this.config.params.map(p => {
            if (p.id == 'sync')
                return 0;
            if (p.id == 'run')
                return this.rackSync ? 0 : this.values.run;
            return this.values[p.id];
        });
    }

    protected onNodeMessage(msg: any) {
        if (msg && msg.type == 'step' && typeof msg.step == 'number')
            this.workletStep = msg.step;
    }

    setParam(id: string, value: number) {
        const name = this.presetName;
        super.setParam(id, value);
        if (id == 'sync' || id == 'run') {
            // El modo de reloj y RUN no cambian el sonido: el nombre del sonido se conserva
            this.presetName = name;
            this.post({ type: 'params', values: this.allValues() });
            if (id == 'sync')
                this.post({ type: 'allOff' });
        }
    }

    // --- Agenda con el transporte (modo Rack) ---

    schedule(b0: number, b1: number, startTime: number, beatDur: number) {
        if (!this.rackSync)
            return;
        const len = this.stepLength;
        const swing = this.values.shuffle * 0.125;
        const accent = 1 + 0.7 * this.values.accent;
        // Un paso dura 1/4 de negra; los impares se atrasan por el shuffle
        for (let k = Math.floor(b0 * 4) - 1; k * 0.25 < b1; k++) {
            const s = ((k % len) + len) % len;
            const t = k * 0.25 + (s & 1 ? swing : 0);
            if (t < b0 || t >= b1)
                continue;
            for (let i = 0; i < RE_INSTRUMENTS.length; i++) {
                const v = this.pattern[i][s];
                if (v)
                    this.post({ type: 'on', note: RE_NOTES[i], vel: v == 2 ? accent : 0.8, t: Math.max(0.0001, startTime + t * beatDur) });
            }
        }
    }

    /** Render offline: agenda de una vez todas las vueltas del loop (el transporte en vivo no existe). */
    renderPasses(passes: number) {
        if (!this.rackSync)
            return;
        const t = this.env.transport;
        this.schedule(0, t.loopBeats * Math.max(1, passes), 0, 60 / t.bpm);
    }

    /** Hay algo para exportar a WAV: el rack lo toca (o corre solo) y el patron no esta vacio. */
    get exportable(): boolean {
        return (this.rackSync || this.values.run >= 1) && this.pattern.some(row => row.some(v => v > 0));
    }

    onRecordStart() {}
    onRecordStop(endBeat: number) {}

    onStop() {
        if (this.rackSync)
            this.post({ type: 'allOff' });
    }

    // --- Patron ---

    setStep(inst: number, step: number, value: number) {
        if (inst < 0 || inst >= RE_INSTRUMENTS.length || step < 0 || step >= RE_STEPS || typeof value != 'number' || !isFinite(value))
            return;
        value = Math.round(Math.max(0, Math.min(2, value)));
        if (this.pattern[inst][step] == value)
            return;
        this.pattern[inst][step] = value;
        this.post({ type: 'step', inst, step, value });
        this.env.changed();
    }

    clearPattern() {
        this.pattern = RE_INSTRUMENTS.map(() => new Array(RE_STEPS).fill(0));
        this.post({ type: 'pattern', rows: this.rows() });
        this.env.changed();
    }

    /** Toca una voz desde el panel. */
    hit(inst: number) {
        if (inst >= 0 && inst < RE_NOTES.length)
            this.post({ type: 'on', note: RE_NOTES[inst], vel: 0.8, t: 0 });
    }

    private rows(): Array<string> {
        return this.pattern.map(row => row.map(v => CHARS[v] || '.').join(''));
    }

    private parseRow(text: any): Array<number> {
        const row = new Array(RE_STEPS).fill(0);
        if (typeof text == 'string')
            for (let s = 0; s < RE_STEPS && s < text.length; s++)
                row[s] = text[s] == 'X' ? 2 : text[s] == 'x' ? 1 : 0;
        return row;
    }

    loadPreset(index: number) {
        const preset = RE_PRESETS[index];
        if (!preset)
            return;
        // El modo de reloj y RUN son del panel, no del sonido
        const sync = this.values.sync, run = this.values.run;
        super.loadPreset(index);
        this.values.sync = sync;
        this.values.run = run;
        this.pattern = RE_INSTRUMENTS.map(code => this.parseRow(preset.pattern && preset.pattern[code]));
        this.post({ type: 'params', values: this.allValues() });
        this.post({ type: 'pattern', rows: this.rows() });
    }

    getState() {
        return { values: this.values, preset: this.presetName, pattern: this.rows() };
    }

    setState(raw: any) {
        super.setState(raw);
        raw = raw && typeof raw == 'object' ? raw : {};
        // Los proyectos sin patron arrancan con el patron vacio
        const saved = Array.isArray(raw.pattern) ? raw.pattern : [];
        this.pattern = RE_INSTRUMENTS.map((code, i) => this.parseRow(saved[i]));
        this.post({ type: 'pattern', rows: this.rows() });
    }

    dispose() {
        if (this.env.clock)
            this.env.clock.unregister(this);
        super.dispose();
    }
}
