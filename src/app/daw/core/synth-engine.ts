import { Subject } from 'rxjs';
import { PlayingVoice, createVoice } from '../../synth/voice-factory';
import { LoadStatus } from '../../services/sample-library';
import { Patch, FxConfig, PRESETS, DEFAULT_FX, clonePatch } from '../../services/presets';
import { BASE_MIDI } from '../../services/keyboard-map';
import { ModuleEnv, NoteMsg } from './types';
import { setParam } from './audio';

const MAX_VOICES = 24;
const MIN_OCTAVE = -3;
const MAX_OCTAVE = 3;

/** Lo que se toca, venga de donde venga; el secuenciador lo graba. */
export interface NoteEvent {
    type: 'on' | 'off';
    midi: number;
    velocity: number;
}

/**
 * Motor polifonico de UN instrumento: recibe notas (del piano en pantalla o de los cables) y las
 * convierte en voces con el patch actual. Una instancia por modulo Synth Studio.
 */
export class SynthEngine {
    public patch: Patch = clonePatch(PRESETS[0]);
    public octave: number = 0;       // octava del piano en pantalla
    public sustain: boolean = false;
    // Pitch bend actual en cents
    private bend: number = 0;
    // Notas sostenidas, por id (piano en pantalla o nota recibida por cable)
    private held = new Map<string, { voice: PlayingVoice, midi: number }>();
    // Notas ya soltadas pero retenidas por el pedal de sustain (voz -> nota)
    private sustained = new Map<PlayingVoice, number>();
    private voices = new Set<PlayingVoice>();
    public noteEvents = new Subject<NoteEvent>();
    // El modulo aplica aca los efectos que trae cada preset
    public onPatchFx: (fx: Partial<FxConfig>) => void = () => {};
    // Se llama cuando el sonido actual lo cambia el usuario (preset nuevo, nivel); el modulo lo copia a la pista en foco
    public onPatchEdited: () => void = () => {};
    private adopting = false;
    private patchOut: GainNode;

    constructor(private env: ModuleEnv, destination: AudioNode) {
        this.patchOut = env.ctx.createGain();
        this.patchOut.connect(destination);
        this.patchOut.gain.value = this.patch.level;
        this.octave = this.patch.octave;
    }

    get library() {
        return this.env.library;
    }

    get voiceCount(): number {
        return this.voices.size;
    }

    get level(): number {
        return this.patch.level;
    }
    set level(value: number) {
        this.patch.level = value;
        setParam(this.env, this.patchOut.gain, value, 0.02);
        this.env.changed();
        if (!this.adopting)
            this.onPatchEdited();
    }

    get baseMidi(): number {
        return BASE_MIDI + 12 * this.octave;
    }

    /** Semitonos de transposicion general que le tocan a este patch (las baterias no se transponen). */
    transposeFor(patch: Patch): number {
        return patch.kind == 'kit' || patch.kind == 'drums' ? 0 : this.env.transport.transpose;
    }

    loadPatch(preset: Patch) {
        this.allNotesOff();
        this.patch = clonePatch(preset);
        this.octave = this.patch.octave;
        this.level = this.patch.level;
        this.onPatchFx({ ...DEFAULT_FX, ...this.patch.fx });
        this.preload(this.patch);
        this.env.changed();
        this.onPatchEdited();
    }

    /**
     * Pone como sonido actual el de una pista (al ponerla en foco). A diferencia de `loadPatch` no toca los
     * efectos del instrumento ni avisa del cambio: es mostrar el sonido de la pista, no editarlo.
     */
    adoptPatch(patch: Patch) {
        this.adopting = true;
        try {
            this.allNotesOff();
            this.patch = clonePatch(patch);
            this.octave = this.patch.octave;
            this.level = this.patch.level;
            this.preload(this.patch);
            this.env.changed();
        } finally {
            this.adopting = false;
        }
    }

    /** Pide al banco el instrumento del patch (si usa muestras); sigue el progreso con `loading`. */
    preload(patch: Patch): Promise<any> {
        if ((patch.kind == 'sampler' || patch.kind == 'kit') && patch.sample)
            return this.library.load(patch.kind == 'kit' ? 'kit' : 'melodic', patch.sample).catch(() => {});
        return Promise.resolve();
    }

    /** Estado de carga del instrumento actual (undefined si el patch no usa muestras). */
    get loading(): LoadStatus | undefined {
        const p = this.patch;
        return (p.kind == 'sampler' || p.kind == 'kit') && p.sample
            ? this.library.status(p.kind == 'kit' ? 'kit' : 'melodic', p.sample)
            : undefined;
    }

    shiftOctave(delta: number) {
        this.octave = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, this.octave + delta));
        this.env.changed();
    }

    isHeld(offset: number): boolean {
        const midi = this.baseMidi + offset;
        let found = false;
        this.held.forEach(h => found = found || h.midi == midi);
        return found;
    }

    /** Piano en pantalla: la nota es relativa a la octava del piano. */
    noteOn(id: string, offset: number) {
        this.noteOnMidi(id, this.baseMidi + offset, 1);
    }

    /**
     * Nota absoluta (MIDI 0..127) con velocidad 0..1. Con `when` (instante del AudioContext) la nota
     * se agenda en vez de sonar ya: asi las notas del secuenciador de otro instrumento caen justo.
     */
    noteOnMidi(id: string, midi: number, velocity: number, when?: number) {
        // Retrigger de una nota que solo seguia viva por el pedal (las agendadas tienen id propio)
        if (when === undefined)
            this.noteOffNow(id);
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario (el offline no se reanuda)
        if (this.env.live && (this.env.ctx as any).resume)
            (this.env.ctx as AudioContext).resume();
        if (this.voices.size >= MAX_VOICES)
            this.voices.values().next().value.release(true);
        const sounding = Math.max(0, Math.min(127, midi + this.transposeFor(this.patch)));
        const voice = createVoice(this.env.ctx, this.patchOut, this.patch, sounding, velocity, this.bend, when, this.library);
        // onended de WebAudio llega fuera de la zona: sin esto la pantalla no refresca el contador
        voice.onEnded = () => this.env.run(() => {
            this.voices.delete(voice);
            this.sustained.delete(voice);
        });
        this.voices.add(voice);
        this.held.set(id, { voice, midi });
        // Se emite la nota tocada (sin transponer): lo que se graba es lo que se toco
        this.emitAt(when, { type: 'on', midi, velocity });
    }

    // Lo que graba el secuenciador debe caer cuando la nota suena, no cuando se agenda
    private emitAt(when: number | undefined, e: NoteEvent) {
        const delay = when === undefined || !this.env.live ? 0 : (when - this.env.ctx.currentTime) * 1000;
        if (delay > 1)
            setTimeout(() => this.noteEvents.next(e), delay);
        else
            this.noteEvents.next(e);
    }

    noteOff(id: string, when?: number) {
        const h = this.held.get(id);
        if (!h)
            return;
        this.held.delete(id);
        if (when !== undefined) {
            // Soltado agendado (notas del secuenciador): no depende del pedal de sustain
            h.voice.release(false, when);
            this.emitAt(when, { type: 'off', midi: h.midi, velocity: 0 });
            return;
        }
        if (this.sustain)
            this.sustained.set(h.voice, h.midi);
        else
            this.releaseVoice(h.voice, h.midi);
    }

    private releaseVoice(voice: PlayingVoice, midi: number) {
        voice.release();
        this.noteEvents.next({ type: 'off', midi, velocity: 0 });
    }

    private noteOffNow(id: string) {
        const h = this.held.get(id);
        if (h) {
            this.releaseVoice(h.voice, h.midi);
            this.held.delete(id);
        }
    }

    setSustain(on: boolean) {
        this.sustain = on;
        if (!on) {
            this.sustained.forEach((midi, voice) => this.releaseVoice(voice, midi));
            this.sustained.clear();
        }
    }

    /** Pitch bend en cents; afecta a las notas que ya suenan y a las proximas. */
    setBend(cents: number) {
        this.bend = cents;
        this.voices.forEach(v => v.setBend(cents));
    }

    allNotesOff() {
        this.held.forEach(h => this.releaseVoice(h.voice, h.midi));
        this.held.clear();
        this.setSustain(false);
    }

    /** Mensaje que llega por el cable de notas. */
    receive(msg: NoteMsg) {
        switch (msg.type) {
            case 'on': this.noteOnMidi(msg.id || 'cable:' + msg.midi, msg.midi, msg.velocity, msg.when); break;
            case 'off': this.noteOff(msg.id || 'cable:' + msg.midi, msg.when); break;
            case 'sustain': this.setSustain(msg.on); break;
            case 'bend': this.setBend(msg.cents); break;
            case 'allOff': this.allNotesOff(); break;
        }
    }
}
