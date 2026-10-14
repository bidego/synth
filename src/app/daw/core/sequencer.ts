import { PlayingVoice, createVoice } from '../../synth/voice-factory';
import { Patch, clonePatch, sanitizePatch } from '../../services/presets';
import { TransportClient } from './transport.service';
import { ModuleEnv } from './types';
import { SynthEngine, NoteEvent } from './synth-engine';

/** Una nota grabada. El tiempo va en beats (negras), no en segundos: cambiar el BPM no la desarma. */
export interface LoopNote {
    start: number;  // beat dentro del loop
    dur: number;    // beats
    midi: number;
    vel: number;
    take: number;   // pasada de grabacion, para poder deshacer (0 = dibujada a mano)
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

const MAX_NOTES_PER_TRACK = 20000;
const MAX_TRACKS = 8;

/**
 * Secuenciador de un instrumento: pistas de notas que suenan en loop sincronizadas con el transporte
 * global. Si el instrumento esta armado y el transporte graba, lo que se toca entra en la pista armada
 * y suena desde la vuelta siguiente (overdub).
 */
export class Sequencer implements TransportClient {
    public tracks: Array<Track> = [];
    public armedId: number = null;
    // Pista abierta en el editor de piano roll
    public editingId: number = null;
    // Sube con cada cambio de notas: el editor se redibuja al notarlo
    public notesVersion = 0;
    // Este instrumento graba cuando el transporte graba
    public armed = false;

    private pending = new Map<number, { abs: number, vel: number }>();
    private active = new Set<PlayingVoice>();
    private nextId = 1;

    constructor(private env: ModuleEnv, private engine: SynthEngine, private destination: AudioNode) {
        if (env.live && env.clock) {
            env.clock.register(this);
            engine.noteEvents.subscribe(e => this.capture(e));
        }
    }

    dispose() {
        if (this.env.clock)
            this.env.clock.unregister(this);
        this.active.forEach(v => v.release(true));
        this.tracks.forEach(t => t.out.disconnect());
    }

    // --- Reloj (solo en vivo) ---

    get playing(): boolean {
        return !!this.env.clock && this.env.clock.playing;
    }
    get position(): number {
        return this.env.clock ? this.env.clock.position : 0;
    }
    get countingIn(): boolean {
        return !!this.env.clock && this.env.clock.countingIn;
    }
    get loopBeats(): number {
        return this.env.transport.loopBeats;
    }

    get editingTrack(): Track {
        return this.tracks.find(t => t.id == this.editingId);
    }

    get armedTrack(): Track {
        return this.tracks.find(t => t.id == this.armedId);
    }

    /** Abre (o cierra, si ya estaba abierta) el editor de una pista. */
    toggleEditor(track: Track) {
        this.editingId = this.editingId == track.id ? null : track.id;
    }

    /** Las ediciones manuales de notas pasan por aca: se redibuja y se autoguarda. */
    touch() {
        this.dirty();
    }

    private dirty() {
        this.notesVersion++;
        this.env.changed();
    }

    /** Suena una nota de prueba con el instrumento de la pista (al dibujar o mover notas). */
    preview(track: Track, midi: number, vel = 0.8) {
        if ((this.env.ctx as any).resume)
            (this.env.ctx as AudioContext).resume();
        const sounding = Math.max(0, Math.min(127, midi + this.engine.transposeFor(track.patch)));
        const voice = createVoice(this.env.ctx, track.out, track.patch, sounding, vel, 0, undefined, this.env.library);
        voice.release(false, this.env.ctx.currentTime + 0.25);
    }

    /** Copia las notas dentro del loop doble (el transporte duplica los compases). */
    doubleNotes(oldLoopBeats: number) {
        this.tracks.forEach(t => {
            const copies = t.notes.map(n => ({ ...n, start: (n.start % oldLoopBeats) + oldLoopBeats }));
            t.notes = t.notes.map(n => ({ ...n, start: n.start % oldLoopBeats })).concat(copies);
        });
        this.dirty();
    }

    // --- Pistas ---

    addTrack(): Track {
        if (this.tracks.length >= MAX_TRACKS)
            return this.tracks[this.tracks.length - 1];
        const track = this.createTrack('Pista ' + this.nextId, clonePatch(this.engine.patch));
        this.armedId = track.id;
        this.dirty();
        return track;
    }

    private createTrack(name: string, patch: Patch): Track {
        const out = this.env.ctx.createGain();
        out.connect(this.destination);
        const track: Track = { id: this.nextId++, name, patch, notes: [], volume: 1, muted: false, takes: 0, out };
        this.tracks.push(track);
        this.applyTrackGain(track);
        return track;
    }

    arm(track: Track) {
        this.armedId = track.id;
    }

    setVolume(track: Track, value: any) {
        track.volume = parseFloat(value);
        this.applyTrackGain(track);
        this.dirty();
    }

    toggleMute(track: Track) {
        track.muted = !track.muted;
        this.applyTrackGain(track);
        this.dirty();
    }

    clearTrack(track: Track) {
        track.notes = [];
        this.dirty();
    }

    // Borra la ultima pasada de grabacion de la pista (deshacer overdub)
    undoTake(track: Track) {
        // take 0 son las notas dibujadas a mano en el editor: no son una pasada de grabacion
        const last = track.notes.reduce((max, n) => Math.max(max, n.take), 0);
        if (last > 0)
            track.notes = track.notes.filter(n => n.take != last);
        this.dirty();
    }

    removeTrack(track: Track) {
        track.out.disconnect();
        this.tracks = this.tracks.filter(t => t != track);
        if (this.editingId == track.id)
            this.editingId = null;
        if (this.armedId == track.id) {
            const last = this.tracks[this.tracks.length - 1];
            this.armedId = last ? last.id : null;
        }
        this.dirty();
    }

    private applyTrackGain(track: Track) {
        const gain = track.muted ? 0 : track.volume * track.patch.level;
        track.out.gain.setTargetAtTime(gain, this.env.ctx.currentTime, 0.01);
    }

    // --- Grabacion ---

    onRecordStart() {
        if (!this.armed)
            return;
        if (!this.armedTrack)
            this.addTrack();
        this.armedTrack.takes++;
    }

    private capture(e: NoteEvent) {
        const clock = this.env.clock;
        if (!this.armed || !clock || !clock.recording || !clock.playing || !this.armedTrack)
            return;
        let beat = clock.absBeat;
        if (beat < 0) {
            // Cuenta previa: todavia no se graba. Sin cuenta previa, el margen de 50 ms de arranque
            // no debe tragarse la primera nota: va al compas 0
            if (clock.countingIn)
                return;
            beat = 0;
        }
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

    onRecordStop(endBeat: number) {
        // Notas que seguian apretadas: cerrarlas ahora
        this.pending.forEach((p, midi) => this.finalize(midi, p, endBeat));
        this.pending.clear();
    }

    private finalize(midi: number, p: { abs: number, vel: number }, endBeat: number) {
        const track = this.armedTrack;
        if (!track)
            return;
        const clock = this.env.clock;
        const L = this.loopBeats;
        const q = clock ? clock.quantize : 0;
        const snapped = q ? Math.round(p.abs / q) * q : p.abs;
        track.notes.push({
            start: snapped % L,
            dur: Math.max(0.05, Math.min(endBeat - p.abs, L)),
            midi, vel: p.vel, take: track.takes
        });
        this.dirty();
    }

    // --- Reproduccion ---

    onStop() {
        this.active.forEach(v => v.release(true));
        this.active.clear();
    }

    schedule(b0: number, b1: number, startTime: number, beatDur: number) {
        const lo = Math.max(b0, 0);
        if (b1 <= lo)
            return;
        const L = this.loopBeats;
        this.tracks.forEach(track => {
            if (track.muted)
                return;
            for (let cycle = Math.floor(lo / L); cycle <= Math.floor(b1 / L); cycle++) {
                track.notes.forEach(n => {
                    // Si se achico el loop, las notas que quedaron fuera se pliegan (y vuelven al agrandarlo)
                    const abs = cycle * L + (n.start % L);
                    if (abs >= lo && abs < b1)
                        this.playNote(track, n, startTime + abs * beatDur, beatDur);
                });
            }
        });
    }

    private playNote(track: Track, n: LoopNote, when: number, beatDur: number) {
        const sounding = Math.max(0, Math.min(127, n.midi + this.engine.transposeFor(track.patch)));
        const voice = createVoice(this.env.ctx, track.out, track.patch, sounding, n.vel, 0, when, this.env.library);
        voice.release(false, when + n.dur * beatDur);
        voice.onEnded = () => this.active.delete(voice);
        this.active.add(voice);
    }

    /** Render offline: agenda todas las vueltas de todas las pistas de una sola vez. */
    renderPasses(passes: number) {
        const L = this.loopBeats;
        const beatDur = 60 / this.env.transport.bpm;
        this.tracks.forEach(track => {
            if (track.muted)
                return;
            for (let pass = 0; pass < passes; pass++) {
                track.notes.forEach(n => {
                    const when = (pass * L + (n.start % L)) * beatDur;
                    const sounding = Math.max(0, Math.min(127, n.midi + this.engine.transposeFor(track.patch)));
                    const voice = createVoice(this.env.ctx, track.out, track.patch, sounding, n.vel, 0, when, this.env.library);
                    voice.release(false, when + n.dur * beatDur);
                });
            }
        });
    }

    hasNotes(): boolean {
        return this.tracks.some(t => t.notes.length && !t.muted);
    }

    // --- Estado ---

    getState() {
        return {
            armed: this.armed,
            tracks: this.tracks.map(t => ({
                name: t.name, patch: t.patch, notes: t.notes, volume: t.volume, muted: t.muted, takes: t.takes
            }))
        };
    }

    /** Valida todo: viene de un archivo o del navegador. */
    setState(raw: any) {
        this.tracks.forEach(t => t.out.disconnect());
        this.tracks = [];
        this.editingId = null;
        this.armed = !!(raw && raw.armed);
        if (!raw || !Array.isArray(raw.tracks))
            return;
        const finite = (v: any, min: number, max: number, fallback: number) =>
            typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
        const L = this.loopBeats;
        raw.tracks.slice(0, MAX_TRACKS).forEach((r: any, i: number) => {
            r = r && typeof r == 'object' ? r : {};
            const track = this.createTrack(typeof r.name == 'string' ? r.name.slice(0, 30) : 'Pista ' + (i + 1), sanitizePatch(r.patch));
            track.volume = finite(r.volume, 0, 1, 1);
            track.muted = r.muted === true;
            track.takes = Math.round(finite(r.takes, 0, 1000, 0));
            track.notes = (Array.isArray(r.notes) ? r.notes : []).slice(0, MAX_NOTES_PER_TRACK)
                .filter((n: any) => n && typeof n.midi == 'number' && isFinite(n.midi))
                .map((n: any) => ({
                    start: finite(n.start, 0, L - 0.001, 0),
                    dur: finite(n.dur, 0.05, L, 0.25),
                    midi: Math.round(finite(n.midi, 0, 127, 60)),
                    vel: finite(n.vel, 0, 1, 1),
                    take: Math.round(finite(n.take, 0, 1000, 0))
                }));
            this.applyTrackGain(track);
        });
        const last = this.tracks[this.tracks.length - 1];
        this.armedId = last ? last.id : null;
        // Los instrumentos de muestras de las pistas empiezan a bajarse ya
        this.tracks.forEach(t => this.engine.preload(t.patch));
    }
}
