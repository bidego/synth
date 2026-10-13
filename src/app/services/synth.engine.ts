import { Injectable, NgZone } from '@angular/core';
import { SoundService } from './sound.service';
import { Voice } from '../synth/voice';
import { Patch, PRESETS, DEFAULT_FX, clonePatch } from './presets';
import { KEY_OFFSETS, BASE_MIDI, midiToHz } from './keyboard-map';

const MAX_VOICES = 24;
const MIN_OCTAVE = -3;
const MAX_OCTAVE = 3;

/** Motor polifonico: traduce teclas a voces usando el patch actual. */
@Injectable()
export class SynthEngine {
    public patch: Patch = clonePatch(PRESETS[0]);
    public octave: number = 0;
    // Notas sostenidas, por id de tecla fisica (o 'mouse')
    private held = new Map<string, { voice: Voice, offset: number }>();
    private voices = new Set<Voice>();
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
        let found = false;
        this.held.forEach(h => found = found || h.offset == offset);
        return found;
    }

    noteOn(id: string, offset: number) {
        if (this.held.has(id))
            return;
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario
        this.audioCtx.resume();
        if (this.voices.size >= MAX_VOICES)
            this.voices.values().next().value.release(true);
        const voice = new Voice(this.audioCtx, this.patchOut, this.patch, midiToHz(this.baseMidi + offset));
        // onended de WebAudio llega fuera de la zona: sin esto la pantalla no refresca el contador
        voice.onEnded = () => this.zone.run(() => this.voices.delete(voice));
        this.voices.add(voice);
        this.held.set(id, { voice, offset });
    }

    noteOff(id: string) {
        const h = this.held.get(id);
        if (h) {
            h.voice.release();
            this.held.delete(id);
        }
    }

    allNotesOff() {
        this.held.forEach(h => h.voice.release());
        this.held.clear();
    }

    private handleKey(e: KeyboardEvent) {
        if (!e || !e.code || this.isTyping(e.target as HTMLElement))
            return;
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
    private isTyping(target: HTMLElement): boolean {
        if (!target)
            return false;
        if (target.tagName == 'SELECT' || target.tagName == 'TEXTAREA')
            return true;
        return target.tagName == 'INPUT' && ['range', 'checkbox', 'button'].indexOf((target as HTMLInputElement).type) < 0;
    }
}
