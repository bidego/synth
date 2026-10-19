import { TransportClient } from './transport.service';
import { LoopNote } from './sequencer';
import { ModuleEnv, NoteMsg } from './types';

/** Una pista del secuenciador de notas: solo notas, sin sonido propio (el sonido lo pone el instrumento cableado). */
export interface SeqTrack {
    id: number;
    name: string;
    notes: Array<LoopNote>;
    volume: number;    // escala la velocidad de las notas que salen
    muted: boolean;
    takes: number;
}

export const SEQ_TRACKS = 4;
const MAX_NOTES_PER_TRACK = 20000;

/**
 * Secuenciador de notas: pistas que se repiten en loop sincronizadas con el transporte y salen por
 * un puerto de notas por pista, para tocar cualquier instrumento del rack. Si esta armado y el
 * transporte graba, lo que llega por la entrada de notas se graba en la pista armada (overdub).
 */
export class NoteSequencer implements TransportClient {
    public tracks: Array<SeqTrack> = [];
    public armedId = 1;
    // Pista abierta en el editor de piano roll
    public editingId: number = null;
    // Sube con cada cambio de notas: el editor se redibuja al notarlo
    public notesVersion = 0;
    // Graba cuando el transporte graba
    public armed = false;
    // Lo que se toca llega tambien a la salida de la pista armada, para escuchar el instrumento mientras se graba
    public thru = true;

    private pending = new Map<number, { abs: number, vel: number, track: SeqTrack }>();
    private noteSeq = 0;

    /** `emit` entrega un mensaje de notas al puerto de salida de una pista. */
    constructor(private env: ModuleEnv, private emit: (track: SeqTrack, msg: NoteMsg) => void) {
        for (let i = 1; i <= SEQ_TRACKS; i++)
            this.tracks.push({ id: i, name: 'Pista ' + i, notes: [], volume: 1, muted: false, takes: 0 });
        if (env.live && env.clock)
            env.clock.register(this);
    }

    dispose() {
        if (this.env.clock)
            this.env.clock.unregister(this);
        this.allOff();
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

    get editingTrack(): SeqTrack {
        return this.tracks.find(t => t.id == this.editingId);
    }

    get armedTrack(): SeqTrack {
        return this.tracks.find(t => t.id == this.armedId);
    }

    toggleEditor(track: SeqTrack) {
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

    private allOff() {
        this.tracks.forEach(t => this.emit(t, { type: 'allOff' }));
    }

    /** Suena una nota de prueba por la salida de la pista (al dibujar o mover notas). */
    preview(track: SeqTrack, midi: number, vel = 0.8) {
        const now = this.env.ctx.currentTime;
        const id = 'pv' + (this.noteSeq++);
        this.emit(track, { type: 'on', midi, velocity: vel, when: now, id });
        this.emit(track, { type: 'off', midi, when: now + 0.25, id });
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

    toggleArmed() {
        this.armed = !this.armed;
        this.dirty();
    }

    setThru(on: boolean) {
        this.thru = on;
        this.dirty();
    }

    arm(track: SeqTrack) {
        this.armedId = track.id;
        this.dirty();
    }

    setVolume(track: SeqTrack, value: any) {
        track.volume = Math.max(0, Math.min(1, parseFloat(value) || 0));
        this.dirty();
    }

    toggleMute(track: SeqTrack) {
        track.muted = !track.muted;
        if (track.muted)
            this.emit(track, { type: 'allOff' });
        this.dirty();
    }

    clearTrack(track: SeqTrack) {
        track.notes = [];
        this.dirty();
    }

    // Borra la ultima pasada de grabacion de la pista (deshacer overdub)
    undoTake(track: SeqTrack) {
        // take 0 son las notas dibujadas a mano en el editor: no son una pasada de grabacion
        const last = track.notes.reduce((max, n) => Math.max(max, n.take), 0);
        if (last > 0)
            track.notes = track.notes.filter(n => n.take != last);
        this.dirty();
    }

    rename(track: SeqTrack, name: string) {
        track.name = (name || '').trim().slice(0, 30) || 'Pista ' + track.id;
        this.dirty();
    }

    // --- Entrada de notas: llega por cable desde un teclado ---

    input(msg: NoteMsg) {
        const track = this.armedTrack;
        if (this.armed && track && this.thru)
            this.emit(track, msg);
        if (msg.type == 'allOff') {
            this.closePending(this.recordBeat());
            return;
        }
        if (msg.type != 'on' && msg.type != 'off')
            return;
        const clock = this.env.clock;
        // Cuenta previa o transporte detenido: todavia no se graba
        if (!this.armed || !track || !clock || !clock.recording || !clock.playing || clock.countingIn)
            return;
        const beat = this.recordBeat();
        if (msg.type == 'on') {
            this.pending.set(msg.midi, { abs: beat, vel: msg.velocity, track });
        } else {
            const p = this.pending.get(msg.midi);
            if (p) {
                this.pending.delete(msg.midi);
                this.finalize(msg.midi, p, beat);
            }
        }
    }

    // Sin cuenta previa, el margen de 50 ms de arranque no debe tragarse la primera nota: va al compas 0
    private recordBeat(): number {
        return this.env.clock ? Math.max(0, this.env.clock.absBeat) : 0;
    }

    private closePending(endBeat: number) {
        this.pending.forEach((p, midi) => this.finalize(midi, p, endBeat));
        this.pending.clear();
    }

    private finalize(midi: number, p: { abs: number, vel: number, track: SeqTrack }, endBeat: number) {
        const clock = this.env.clock;
        const L = this.loopBeats;
        const q = clock ? clock.quantize : 0;
        const snapped = q ? Math.round(p.abs / q) * q : p.abs;
        p.track.notes.push({
            start: snapped % L,
            dur: Math.max(0.05, Math.min(endBeat - p.abs, L)),
            midi, vel: p.vel, take: p.track.takes
        });
        this.dirty();
    }

    // --- Cliente del transporte ---

    onRecordStart() {
        if (this.armed && this.armedTrack)
            this.armedTrack.takes++;
    }

    onRecordStop(endBeat: number) {
        // Notas que seguian apretadas: cerrarlas ahora
        this.closePending(endBeat);
    }

    onStop() {
        // Lo que ya se agendo en los instrumentos tambien se corta
        this.allOff();
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
                        this.emitNote(track, n, startTime + abs * beatDur, startTime + (abs + n.dur) * beatDur);
                });
            }
        });
    }

    // La nota sale con su instante exacto: el instrumento que la recibe la agenda con precision de audio
    private emitNote(track: SeqTrack, n: LoopNote, on: number, off: number) {
        const id = 'ns' + track.id + ':' + (this.noteSeq++);
        this.emit(track, { type: 'on', midi: n.midi, velocity: n.vel * track.volume, when: on, id });
        this.emit(track, { type: 'off', midi: n.midi, when: off, id });
    }

    /** Render offline: agenda todas las vueltas de todas las pistas de una sola vez. */
    renderPasses(passes: number) {
        const L = this.loopBeats;
        const beatDur = 60 / this.env.transport.bpm;
        this.tracks.forEach(track => {
            if (track.muted)
                return;
            for (let pass = 0; pass < passes; pass++)
                track.notes.forEach(n => {
                    const when = (pass * L + (n.start % L)) * beatDur;
                    this.emitNote(track, n, when, when + n.dur * beatDur);
                });
        });
    }

    hasNotes(): boolean {
        return this.tracks.some(t => t.notes.length && !t.muted);
    }

    // --- Estado ---

    getState() {
        return {
            armed: this.armed,
            thru: this.thru,
            armedId: this.armedId,
            tracks: this.tracks.map(t => ({ name: t.name, notes: t.notes, volume: t.volume, muted: t.muted, takes: t.takes }))
        };
    }

    /** Valida todo: viene de un archivo o del navegador. */
    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        this.armed = raw.armed === true;
        this.thru = raw.thru !== false;
        this.armedId = typeof raw.armedId == 'number' && raw.armedId >= 1 && raw.armedId <= SEQ_TRACKS ? Math.round(raw.armedId) : 1;
        this.editingId = null;
        this.pending.clear();
        const finite = (v: any, min: number, max: number, fallback: number) =>
            typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
        const L = this.loopBeats;
        const list = Array.isArray(raw.tracks) ? raw.tracks : [];
        this.tracks.forEach((track, i) => {
            const r = list[i] && typeof list[i] == 'object' ? list[i] : {};
            track.name = typeof r.name == 'string' && r.name ? r.name.slice(0, 30) : 'Pista ' + track.id;
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
        });
        this.notesVersion++;
    }
}
