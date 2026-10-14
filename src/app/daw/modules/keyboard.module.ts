import { Subscription } from 'rxjs';
import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';
import { isTyping, isControl } from '../core/dom';
import { KEY_OFFSETS, BASE_MIDI } from '../../services/keyboard-map';

/**
 * Teclado maestro: convierte el teclado de la computadora y los controladores MIDI en mensajes de
 * notas que salen por un cable hacia uno o mas instrumentos.
 */
export class KeyboardModule extends RackModule {
    readonly type = 'keyboard';
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'notes', kind: 'note', dir: 'out', label: 'Notas' }
    ];
    public octave = 0;           // octava del teclado de la computadora
    public velocity = 1;         // velocidad de las teclas de la computadora
    public computerKeys = true;
    public midiIn = true;

    // Tecla fisica -> nota que dispara (para soltar la misma aunque cambie la octava)
    private down = new Map<string, number>();
    private subs: Array<Subscription> = [];
    private onBlur = () => this.allOff();

    constructor(env: ModuleEnv) {
        super(env);
        if (env.live && env.inputs) {
            this.subs.push(env.inputs.keys.subscribe(e => this.handleKey(e)));
            this.subs.push(env.inputs.midi.subscribe(m => {
                if (this.midiIn)
                    this.noteOut.next(m);
            }));
            // Si se pierde el foco no llega el keyup: soltar todo
            window.addEventListener('blur', this.onBlur);
        }
    }

    audioPort(id: string): AudioNode | null {
        return null;
    }

    shiftOctave(delta: number) {
        this.octave = Math.max(-3, Math.min(3, this.octave + delta));
        this.env.changed();
    }

    private allOff() {
        this.down.forEach(midi => this.noteOut.next({ type: 'off', midi }));
        this.down.clear();
        this.noteOut.next({ type: 'allOff' } as NoteMsg);
    }

    private handleKey(e: KeyboardEvent) {
        if (!this.computerKeys || !e || !e.code || isTyping(e.target as HTMLElement))
            return;
        if (e.code == 'Space' && !isControl(e.target as HTMLElement)) {
            // Barra espaciadora = pedal de sustain
            e.preventDefault();
            this.noteOut.next({ type: 'sustain', on: e.type == 'keydown' });
            return;
        }
        if (e.type == 'keyup') {
            const midi = this.down.get(e.code);
            if (midi !== undefined) {
                this.down.delete(e.code);
                this.noteOut.next({ type: 'off', midi });
            }
            return;
        }
        if (e.code == 'ArrowUp' || e.code == 'ArrowDown') {
            e.preventDefault();
            this.shiftOctave(e.code == 'ArrowUp' ? 1 : -1);
            return;
        }
        const offset = KEY_OFFSETS[e.code];
        if (offset === undefined || e.ctrlKey || e.metaKey || e.altKey)
            return;
        // Evita atajos del navegador (ej. "/" abre la busqueda rapida)
        e.preventDefault();
        if (e.repeat)
            return;
        const midi = BASE_MIDI + 12 * this.octave + offset;
        this.down.set(e.code, midi);
        this.noteOut.next({ type: 'on', midi, velocity: this.velocity });
    }

    getState() {
        return { octave: this.octave, velocity: this.velocity, computerKeys: this.computerKeys, midiIn: this.midiIn };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        this.octave = typeof raw.octave == 'number' && isFinite(raw.octave) ? Math.max(-3, Math.min(3, Math.round(raw.octave))) : 0;
        this.velocity = typeof raw.velocity == 'number' && isFinite(raw.velocity) ? Math.max(0.1, Math.min(1, raw.velocity)) : 1;
        this.computerKeys = raw.computerKeys !== false;
        this.midiIn = raw.midiIn !== false;
    }

    dispose() {
        this.subs.forEach(s => s.unsubscribe());
        window.removeEventListener('blur', this.onBlur);
        this.allOff();
    }
}
