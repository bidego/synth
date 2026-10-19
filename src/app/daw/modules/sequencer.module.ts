import { Observable, Subject } from 'rxjs';
import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';
import { NoteSequencer, SEQ_TRACKS } from '../core/note-sequencer';

/**
 * Secuenciador de notas: 4 pistas en loop con el transporte, una salida de notas por pista.
 * Entra por un puerto de notas (para grabar desde un teclado) y no tiene audio.
 */
export class SequencerModule extends RackModule {
    readonly type = 'sequencer';
    readonly ports: ReadonlyArray<PortDef>;
    public readonly sequencer: NoteSequencer;

    private outs: Array<Subject<NoteMsg>> = [];

    constructor(env: ModuleEnv) {
        super(env);
        const ports: Array<PortDef> = [{ id: 'notes', kind: 'note', dir: 'in', label: 'Notas' }];
        for (let i = 1; i <= SEQ_TRACKS; i++) {
            ports.push({ id: 'out' + i, kind: 'note', dir: 'out', label: 'Pista ' + i });
            this.outs.push(new Subject<NoteMsg>());
        }
        this.ports = ports;
        this.sequencer = new NoteSequencer(env, (track, msg) => this.outs[track.id - 1].next(msg));
    }

    audioPort(id: string): AudioNode | null {
        return null;
    }

    noteOutFor(port: string): Observable<NoteMsg> {
        const m = /^out(\d+)$/.exec(port);
        return m && this.outs[+m[1] - 1] ? this.outs[+m[1] - 1] : this.noteOut;
    }

    receive(msg: NoteMsg, port: string) {
        if (port == 'notes')
            this.sequencer.input(msg);
    }

    getState() {
        return this.sequencer.getState();
    }

    setState(raw: any) {
        this.sequencer.setState(raw);
    }

    dispose() {
        this.sequencer.dispose();
    }
}
