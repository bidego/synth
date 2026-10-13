import { Injectable, NgZone } from '@angular/core';
import { SoundService } from './sound.service';
import { SynthEngine, NoteEvent } from './synth.engine';
import { Patch, clonePatch } from './presets';
import { PlayingVoice, createVoice } from '../synth/voice-factory';

/** Una nota grabada. El tiempo va en beats (negras), no en segundos: cambiar el BPM no la desarma. */
export interface LoopNote {
    start: number;  // beat dentro del loop
    dur: number;    // beats
    midi: number;
    vel: number;
    take: number;   // pasada de grabacion, para poder deshacer
}

export interface Track {
    id: number;
    name: string;
    patch: Patch;   // el sonido con el que se grabo
    notes: Array<LoopNote>;
    volume: number;
    muted: boolean;
    takes: number;
    out: GainNode;
}

const BEATS_PER_BAR = 4;
const LOOKAHEAD = 0.12;   // s agendados por adelantado
const TICK_MS = 25;
const MAX_TRACKS = 8;

/**
 * Looper multipista con overdub. Mientras corre el transporte suenan todas las pistas;
 * si ademas se esta grabando, lo que se toca se agrega a la pista armada y suena
 * desde la proxima vuelta.
 */
@Injectable()
export class LooperService {
    public bpm = 100;
    public bars = 2;
    public quantize = 0.25;   // en beats: 0 = libre, 1 = negra, 0.5 = corchea, 0.25 = semicorchea
    public metronome = true;
    public countIn = true;
    public tracks: Array<Track> = [];
    public armedId: number = null;
    public playing = false;
    public recording = false;

    private startTime = 0;       // instante (AudioContext) del beat 0 del loop
    private schedFrom = 0;       // hasta donde ya se agendo
    private timer: any;
    private pending = new Map<number, { abs: number, vel: number }>();
    private active = new Set<PlayingVoice>();
    private nextId = 1;

    constructor(private audioCtx: AudioContext, private sound: SoundService,
                private engine: SynthEngine, private zone: NgZone) {
        engine.noteEvents.subscribe(e => this.capture(e));
        sound.listenKey.subscribe(e => this.handleKey(e));
    }

    get loopBeats(): number {
        return this.bars * BEATS_PER_BAR;
    }

    private get beatDur(): number {
        return 60 / this.bpm;
    }

    // Beat absoluto desde el inicio del loop (negativo durante la cuenta previa)
    private get absBeat(): number {
        return (this.audioCtx.currentTime - this.startTime) / this.beatDur;
    }

    /** 0..1 dentro del loop */
    get position(): number {
        if (!this.playing || this.absBeat < 0)
            return 0;
        return (this.absBeat % this.loopBeats) / this.loopBeats;
    }

    get countingIn(): boolean {
        return this.playing && this.absBeat < 0;
    }

    /** Beat dentro del compas (0..3) para el indicador */
    get beatInBar(): number {
        if (!this.playing)
            return -1;
        const beat = Math.floor(this.absBeat);
        return ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
    }

    get armedTrack(): Track {
        return this.tracks.find(t => t.id == this.armedId);
    }

    // --- Transporte ---

    togglePlay() {
        if (this.playing)
            this.stop();
        else
            this.start(false);
    }

    toggleRecord() {
        if (this.recording) {
            this.stopRecording();
            return;
        }
        if (!this.armedTrack)
            this.addTrack();
        this.armedTrack.takes++;
        this.recording = true;
        if (!this.playing)
            this.start(this.countIn);
    }

    private start(withCountIn: boolean) {
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario
        this.audioCtx.resume();
        const now = this.audioCtx.currentTime;
        this.startTime = now + 0.05 + (withCountIn ? BEATS_PER_BAR * this.beatDur : 0);
        this.schedFrom = now;
        this.playing = true;
        this.zone.runOutsideAngular(() => this.timer = setInterval(() => this.tick(), TICK_MS));
    }

    stop() {
        this.stopRecording();
        this.playing = false;
        clearInterval(this.timer);
        this.active.forEach(v => v.release(true));
        this.active.clear();
    }

    private stopRecording() {
        if (!this.recording)
            return;
        // Notas que seguian apretadas: cerrarlas ahora
        const end = this.absBeat;
        this.pending.forEach((p, midi) => this.finalize(midi, p, end));
        this.pending.clear();
        this.recording = false;
    }

    setBpm(value) {
        // Mantener la posicion actual del loop al cambiar de tempo
        const beat = this.playing ? this.absBeat : 0;
        this.bpm = Math.max(40, Math.min(220, parseFloat(value)));
        if (this.playing)
            this.startTime = this.audioCtx.currentTime - beat * this.beatDur;
    }

    // --- Pistas ---

    addTrack(): Track {
        if (this.tracks.length >= MAX_TRACKS)
            return this.tracks[this.tracks.length - 1];
        const out = this.audioCtx.createGain();
        out.connect(this.sound.input);
        const track: Track = {
            id: this.nextId, name: 'Pista ' + this.nextId, patch: clonePatch(this.engine.patch),
            notes: [], volume: 1, muted: false, takes: 0, out
        };
        this.nextId++;
        this.tracks.push(track);
        this.armedId = track.id;
        this.applyTrackGain(track);
        return track;
    }

    arm(track: Track) {
        this.armedId = track.id;
    }

    setVolume(track: Track, value) {
        track.volume = parseFloat(value);
        this.applyTrackGain(track);
    }

    toggleMute(track: Track) {
        track.muted = !track.muted;
        this.applyTrackGain(track);
    }

    clearTrack(track: Track) {
        track.notes = [];
    }

    // Borra la ultima pasada de grabacion de la pista (deshacer overdub)
    undoTake(track: Track) {
        const last = track.notes.reduce((max, n) => Math.max(max, n.take), 0);
        track.notes = track.notes.filter(n => n.take != last);
    }

    removeTrack(track: Track) {
        track.out.disconnect();
        this.tracks = this.tracks.filter(t => t != track);
        if (this.armedId == track.id) {
            const last = this.tracks[this.tracks.length - 1];
            this.armedId = last ? last.id : null;
            if (!last)
                this.recording = false;
        }
    }

    private applyTrackGain(track: Track) {
        const gain = track.muted ? 0 : track.volume * track.patch.level;
        track.out.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.01);
    }

    // --- Grabacion ---

    private capture(e: NoteEvent) {
        if (!this.recording || !this.playing)
            return;
        const beat = this.absBeat;
        if (beat < 0)   // cuenta previa: todavia no se graba
            return;
        if (e.type == 'on') {
            const track = this.armedTrack;
            // La primera nota fija el sonido de la pista (se pudo cambiar de preset al armarla)
            if (!track.notes.length && !this.pending.size) {
                track.patch = clonePatch(this.engine.patch);
                this.applyTrackGain(track);
            }
            this.pending.set(e.midi, { abs: beat, vel: e.velocity });
        } else {
            const p = this.pending.get(e.midi);
            if (p) {
                this.pending.delete(e.midi);
                this.finalize(e.midi, p, beat);
            }
        }
    }

    private finalize(midi: number, p: { abs: number, vel: number }, endBeat: number) {
        const track = this.armedTrack;
        if (!track)
            return;
        const L = this.loopBeats;
        const snapped = this.quantize ? Math.round(p.abs / this.quantize) * this.quantize : p.abs;
        track.notes.push({
            start: snapped % L,
            dur: Math.max(0.05, Math.min(endBeat - p.abs, L)),
            midi, vel: p.vel, take: track.takes
        });
    }

    // --- Reproduccion ---

    // Agenda en el AudioContext todo lo que cae dentro de la ventana de lookahead
    private tick() {
        const now = this.audioCtx.currentTime;
        const until = now + LOOKAHEAD;
        const from = this.schedFrom;
        this.schedFrom = until;
        const b0 = (from - this.startTime) / this.beatDur;
        const b1 = (until - this.startTime) / this.beatDur;
        const L = this.loopBeats;

        if (this.metronome)
            for (let k = Math.ceil(b0); k < b1; k++)
                this.click(this.startTime + k * this.beatDur, ((k % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR == 0);

        const lo = Math.max(b0, 0);
        if (b1 <= lo)
            return;
        this.tracks.forEach(track => {
            if (track.muted)
                return;
            for (let cycle = Math.floor(lo / L); cycle <= Math.floor(b1 / L); cycle++) {
                track.notes.forEach(n => {
                    const abs = cycle * L + n.start;
                    if (abs >= lo && abs < b1)
                        this.playNote(track, n, this.startTime + abs * this.beatDur);
                });
            }
        });
    }

    private playNote(track: Track, n: LoopNote, when: number) {
        const voice = createVoice(this.audioCtx, track.out, track.patch, n.midi, n.vel, 0, when);
        voice.release(false, when + n.dur * this.beatDur);
        voice.onEnded = () => this.active.delete(voice);
        this.active.add(voice);
    }

    private click(when: number, accent: boolean) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.frequency.value = accent ? 1500 : 1000;
        gain.gain.setValueAtTime(0.15, when);
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
        osc.connect(gain);
        // Directo a los parlantes: el metronomo no lleva FX ni se ve en el visualizador
        gain.connect(this.audioCtx.destination);
        osc.start(when);
        osc.stop(when + 0.05);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    // Enter = play/stop, ` = grabar (no se usan para notas)
    private handleKey(e: KeyboardEvent) {
        if (!e || e.type != 'keydown' || e.repeat || !e.code
            || this.engine.isTyping(e.target as HTMLElement) || this.engine.isControl(e.target as HTMLElement))
            return;
        if (e.code == 'Enter') {
            e.preventDefault();
            this.togglePlay();
        } else if (e.code == 'Backquote') {
            e.preventDefault();
            this.toggleRecord();
        }
    }
}
