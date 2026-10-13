import { Injectable, NgZone } from '@angular/core';
import { SoundService } from './sound.service';
import { Subject } from 'rxjs';
import { PlayingVoice, createVoice } from '../synth/voice-factory';
import { Patch, PRESETS, DEFAULT_FX, clonePatch } from './presets';
import { KEY_OFFSETS, BASE_MIDI } from './keyboard-map';

const MAX_VOICES = 24;
export interface NoteEvent {
    type: 'on' | 'off';
    midi: number;
    velocity: number;
}

const MIN_OCTAVE = -3;
const MAX_OCTAVE = 3;

/** Motor polifonico: traduce teclas de computadora y notas MIDI a voces usando el patch actual. */
@Injectable()
export class SynthEngine {
    public patch: Patch = clonePatch(PRESETS[0]);
    public octave: number = 0;
    public sustain: boolean = false;
    // Pitch bend actual en cents (rueda del controlador MIDI)
    private bend: number = 0;
    // Notas sostenidas, por id (tecla fisica, 'mouse' o nota MIDI)
    private held = new Map<string, { voice: PlayingVoice, midi: number }>();
    // Notas ya soltadas pero retenidas por el pedal de sustain (voz -> nota)
    private sustained = new Map<PlayingVoice, number>();
    private voices = new Set<PlayingVoice>();
    // Lo que se toca, venga de donde venga; el looper lo graba
    public noteEvents = new Subject<NoteEvent>();
    private patchOut: GainNode;

    constructor(private audioCtx: AudioContext, private sound: SoundService, private zone: NgZone) {
        this.patchOut = audioCtx.createGain();
        this.patchOut.connect(sound.input);
        this.loadPatch(PRESETS[0]);
        sound.listenKey.subscribe(e => this.handleKey(e));
        // Si se pierde el foco no llega el keyup: soltar todo
        window.addEventListener('blur', () => this.allNotesOff());
    }

    get voiceCount(): number {
        return this.voices.size;
    }

    get level(): number {
        return this.patch.level;
    }
    set level(value: number) {
        this.patch.level = value;
        this.patchOut.gain.setTargetAtTime(value, this.audioCtx.currentTime, 0.02);
    }

    get baseMidi(): number {
        return BASE_MIDI + 12 * this.octave;
    }

    loadPatch(preset: Patch) {
        this.allNotesOff();
        this.patch = clonePatch(preset);
        this.octave = this.patch.octave;
        this.level = this.patch.level;
        this.sound.setFx({ ...DEFAULT_FX, ...this.patch.fx });
    }

    shiftOctave(delta: number) {
        this.octave = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, this.octave + delta));
    }

    isHeld(offset: number): boolean {
        const midi = this.baseMidi + offset;
        let found = false;
        this.held.forEach(h => found = found || h.midi == midi);
        return found;
    }

    /** Tecla de computadora / mouse: la nota es relativa a la octava del teclado. */
    noteOn(id: string, offset: number) {
        this.noteOnMidi(id, this.baseMidi + offset, 1);
    }

    /** Nota absoluta (MIDI 0..127) con velocidad 0..1. */
    noteOnMidi(id: string, midi: number, velocity: number) {
        // Retrigger de una nota que solo seguia viva por el pedal
        this.noteOffNow(id);
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario
        this.audioCtx.resume();
        if (this.voices.size >= MAX_VOICES)
            this.voices.values().next().value.release(true);
        const voice = createVoice(this.audioCtx, this.patchOut, this.patch, midi, velocity, this.bend);
        // onended de WebAudio llega fuera de la zona: sin esto la pantalla no refresca el contador
        voice.onEnded = () => this.zone.run(() => {
            this.voices.delete(voice);
            this.sustained.delete(voice);
        });
        this.voices.add(voice);
        this.held.set(id, { voice, midi });
        this.noteEvents.next({ type: 'on', midi, velocity });
    }

    noteOff(id: string) {
        const h = this.held.get(id);
        if (!h)
            return;
        this.held.delete(id);
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

    private handleKey(e: KeyboardEvent) {
        if (!e || !e.code || this.isTyping(e.target as HTMLElement))
            return;
        if (e.code == 'Space' && !this.isControl(e.target as HTMLElement)) {
            // Barra espaciadora = pedal de sustain
            e.preventDefault();
            this.setSustain(e.type == 'keydown');
            return;
        }
        if (e.type == 'keyup') {
            this.noteOff(e.code);
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
        if (!e.repeat)
            this.noteOn(e.code, offset);
    }

    // Los sliders y botones no capturan teclas de notas; los campos de texto y selects si
    public isTyping(target: HTMLElement): boolean {
        if (!target)
            return false;
        if (target.tagName == 'SELECT' || target.tagName == 'TEXTAREA')
            return true;
        return target.tagName == 'INPUT' && ['range', 'checkbox', 'button'].indexOf((target as HTMLInputElement).type) < 0;
    }

    // Espacio sobre un boton enfocado debe seguir "clickeandolo"
    public isControl(target: HTMLElement): boolean {
        return !!target && (target.tagName == 'BUTTON' || target.tagName == 'A');
    }
}
