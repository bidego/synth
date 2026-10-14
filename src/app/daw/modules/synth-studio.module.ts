import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';
import { SynthEngine } from '../core/synth-engine';
import { Sequencer } from '../core/sequencer';
import { MasterChain } from '../../services/master-chain';
import { FxConfig, DEFAULT_FX, sanitizeFx, sanitizePatch, PRESETS, clonePatch } from '../../services/presets';

/**
 * Syntotec Synth Studio como modulo del rack: sintetizador + sampler + baterias, con su piano, sus
 * pistas de secuenciador y sus efectos propios (delay / reverb). Entra por un puerto de notas y sale
 * por un puerto de audio. Se pueden poner varios.
 */
export class SynthStudioModule extends RackModule {
    readonly type = 'synth';
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'notes', kind: 'note', dir: 'in', label: 'Notas' },
        { id: 'out', kind: 'audio', dir: 'out', label: 'Audio' },
        { id: 'seq', kind: 'note', dir: 'out', label: 'Secuenciador' }
    ];

    public readonly chain: MasterChain;
    public readonly engine: SynthEngine;
    public readonly sequencer: Sequencer;
    public fx: FxConfig = { ...DEFAULT_FX };

    constructor(env: ModuleEnv) {
        super(env);
        this.chain = new MasterChain(env.ctx);
        this.engine = new SynthEngine(env, this.chain.input);
        // Las pistas con destino "salida" mandan sus notas por el puerto Secuenciador
        this.sequencer = new Sequencer(env, this.engine, this.chain.input, msg => this.noteOut.next(msg));
        // Los efectos que trae cada preset se aplican a este instrumento
        this.engine.onPatchFx = fx => this.setFx(fx);
        this.chain.setFx(this.fx, env.live);
    }

    audioPort(id: string): AudioNode | null {
        return id == 'out' ? this.chain.output : null;
    }

    // Las notas que entran tocan este instrumento; las que salen son las del secuenciador: no hay
    // camino de una a otra (si lo hubiera, un cable de la salida a la entrada seria un bucle)
    routes(): Array<[string, string]> {
        return [];
    }

    receive(msg: NoteMsg, port: string) {
        if (port == 'notes')
            this.engine.receive(msg);
    }

    /** Avisa que el patch, la octava o el nivel cambiaron (el autoguardado los toma). */
    touch() {
        this.env.changed();
    }

    setFx(fx: Partial<FxConfig>) {
        Object.assign(this.fx, fx);
        this.chain.setFx(this.fx, this.env.live);
        this.env.changed();
    }

    getState() {
        return {
            patch: this.engine.patch,
            octave: this.engine.octave,
            fx: this.fx,
            sequencer: this.sequencer.getState()
        };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        // Sin estado guardado queda el patch por defecto
        const patch = raw.patch ? sanitizePatch(raw.patch) : clonePatch(PRESETS[0]);
        this.engine.patch = patch;
        this.engine.octave = typeof raw.octave == 'number' && isFinite(raw.octave)
            ? Math.max(-3, Math.min(3, Math.round(raw.octave))) : patch.octave;
        this.engine.level = patch.level;
        this.engine.preload(patch);
        this.fx = raw.fx ? sanitizeFx(raw.fx) : { ...DEFAULT_FX, ...patch.fx };
        this.chain.setFx(this.fx, this.env.live);
        this.sequencer.setState(raw.sequencer);
    }

    dispose() {
        this.engine.allNotesOff();
        this.sequencer.dispose();
    }
}
