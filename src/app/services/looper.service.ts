import { Injectable, NgZone } from '@angular/core';
import { SoundService } from './sound.service';
import { SynthEngine, NoteEvent } from './synth.engine';
import { Patch, FxConfig, clonePatch, sanitizePatch, sanitizeFx } from './presets';
import { PlayingVoice, createVoice } from '../synth/voice-factory';
import { SampleLibrary } from './sample-library';
import { MasterChain } from './master-chain';
import { encodeWav } from './wav';

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

export interface ProjectTrack {
    name: string;
    patch: Patch;
    notes: Array<LoopNote>;
    volume: number;
    muted: boolean;
    takes: number;
}

export interface Project {
    version: number;
    name: string;
    bpm: number;
    bars: number;
    quantize: number;
    metronome: boolean;
    countIn: boolean;
    fx?: FxConfig;   // efectos master: sin ellos el proyecto suena distinto al grabado
    tracks: Array<ProjectTrack>;
}

export interface SavedProject {
    name: string;
    savedAt: number;
    tracks: number;
    data: Project;
}

const STORAGE_PROJECTS = 'synth.projects';
const STORAGE_AUTOSAVE = 'synth.autosave';
const QUANTIZES = [0, 0.25, 0.5, 1];
export const BAR_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
const MAX_NOTES_PER_TRACK = 20000;
// Un render offline de mas de esto agotaria la memoria del navegador (estereo, float32)
const MAX_EXPORT_SECONDS = 600;
const EXPORT_TAIL = 2.5;   // cola de reverb y delay
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
    // Pista abierta en el editor de piano roll
    public editingId: number = null;
    // Sube con cada cambio de notas: el editor se redibuja al notarlo
    public notesVersion = 0;
    public playing = false;
    public recording = false;
    public exporting = false;
    public projectName = '';
    public saved: Array<SavedProject> = [];
    public message = '';

    private saveTimer: any;
    private counting = false;     // hay cuenta previa en curso: lo que se toque antes del beat 0 no se graba
    private startTime = 0;       // instante (AudioContext) del beat 0 del loop
    private schedFrom = 0;       // hasta donde ya se agendo
    private timer: any;
    private pending = new Map<number, { abs: number, vel: number }>();
    private active = new Set<PlayingVoice>();
    private nextId = 1;

    constructor(private audioCtx: AudioContext, private sound: SoundService,
                private engine: SynthEngine, private zone: NgZone, private library: SampleLibrary) {
        engine.noteEvents.subscribe(e => this.capture(e));
        sound.listenKey.subscribe(e => this.handleKey(e));
        sound.fxChanged.subscribe(() => this.dirty());
        this.refreshSaved();
        this.restoreAutosave();
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

    get editingTrack(): Track {
        return this.tracks.find(t => t.id == this.editingId);
    }

    /** Abre (o cierra, si ya estaba abierta) el editor de una pista. */
    toggleEditor(track: Track) {
        this.editingId = this.editingId == track.id ? null : track.id;
    }

    /** Las ediciones manuales de notas pasan por aca: se redibuja y se autoguarda. */
    touch() {
        this.dirty();
    }

    /** Suena una nota de prueba con el instrumento de la pista (al dibujar o mover notas). */
    preview(track: Track, midi: number, vel = 0.8) {
        this.audioCtx.resume();
        const voice = createVoice(this.audioCtx, track.out, track.patch, midi, vel, 0, undefined, this.library);
        voice.release(false, this.audioCtx.currentTime + 0.25);
    }

    /**
     * Duplica la duracion del loop y copia ahi las notas de TODAS las pistas, para seguir armando
     * una segunda parte sin perder la primera. Devuelve false si ya esta en el maximo.
     */
    doubleLoop(): boolean {
        const next = BAR_OPTIONS.filter(b => b > this.bars)[0];
        if (!next || next > this.bars * 2)
            return false;
        const L = this.loopBeats;
        this.tracks.forEach(t => {
            const copies = t.notes.map(n => ({ ...n, start: (n.start % L) + L }));
            t.notes = t.notes.map(n => ({ ...n, start: n.start % L })).concat(copies);
        });
        this.bars = next;
        this.dirty();
        return true;
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
        this.counting = withCountIn;
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
        this.dirty();
    }

    setBars(bars: number) {
        this.bars = bars;
        this.dirty();
    }

    setQuantize(value: number) {
        this.quantize = value;
        this.dirty();
    }

    setFlag(flag: 'metronome' | 'countIn', value: boolean) {
        this[flag] = value;
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
        const out = this.audioCtx.createGain();
        out.connect(this.sound.input);
        const track: Track = { id: this.nextId++, name, patch, notes: [], volume: 1, muted: false, takes: 0, out };
        this.tracks.push(track);
        this.applyTrackGain(track);
        return track;
    }

    arm(track: Track) {
        this.armedId = track.id;
    }

    setVolume(track: Track, value) {
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
            if (!last)
                this.recording = false;
        }
        this.dirty();
    }

    private applyTrackGain(track: Track) {
        const gain = track.muted ? 0 : track.volume * track.patch.level;
        track.out.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.01);
    }

    // --- Grabacion ---

    private capture(e: NoteEvent) {
        if (!this.recording || !this.playing)
            return;
        let beat = this.absBeat;
        if (beat < 0) {
            // Cuenta previa: todavia no se graba. Sin cuenta previa, el margen de 50 ms de arranque
            // no debe tragarse la primera nota: va al compas 0
            if (this.counting && this.countingIn)
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
        this.dirty();
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
        const hi = b1;
        if (hi <= lo)
            return;
        this.tracks.forEach(track => {
            if (track.muted)
                return;
            for (let cycle = Math.floor(lo / L); cycle <= Math.floor(hi / L); cycle++) {
                track.notes.forEach(n => {
                    // Si se achico el loop, las notas que quedaron fuera se pliegan (y vuelven al agrandarlo)
                    const abs = cycle * L + (n.start % L);
                    if (abs >= lo && abs < hi)
                        this.playNote(track, n, this.startTime + abs * this.beatDur);
                });
            }
        });
    }

    private playNote(track: Track, n: LoopNote, when: number) {
        const voice = createVoice(this.audioCtx, track.out, track.patch, n.midi, n.vel, 0, when, this.library);
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

    // --- Guardado ---

    toProject(): Project {
        return {
            version: 1,
            name: this.projectName,
            bpm: this.bpm, bars: this.bars, quantize: this.quantize,
            metronome: this.metronome, countIn: this.countIn,
            fx: { ...this.sound.fx },
            tracks: this.tracks.map(t => ({
                name: t.name, patch: t.patch, notes: t.notes, volume: t.volume, muted: t.muted, takes: t.takes
            }))
        };
    }

    /** Reemplaza todo por el proyecto dado. Valida todo: viene de un archivo o del navegador. */
    loadProject(raw: any): boolean {
        if (!raw || typeof raw != 'object' || !Array.isArray(raw.tracks))
            return false;
        const finite = (v: any, min: number, max: number, fallback: number) =>
            typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
        this.stop();
        this.tracks.forEach(t => t.out.disconnect());
        this.tracks = [];
        this.editingId = null;
        this.bars = BAR_OPTIONS.indexOf(raw.bars) >= 0 ? raw.bars : 2;
        this.bpm = Math.round(finite(raw.bpm, 40, 220, 100));
        this.quantize = QUANTIZES.indexOf(raw.quantize) >= 0 ? raw.quantize : 0.25;
        this.metronome = raw.metronome !== false;
        this.countIn = raw.countIn !== false;
        this.projectName = typeof raw.name == 'string' ? raw.name.slice(0, 40) : '';
        // Proyectos viejos no traen efectos: se dejan los actuales
        if (raw.fx && typeof raw.fx == 'object')
            this.sound.setFx(sanitizeFx(raw.fx));
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
        return true;
    }

    // Se guarda solo, un instante despues del ultimo cambio
    private dirty() {
        this.notesVersion++;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.write(STORAGE_AUTOSAVE, this.toProject()), 400);
    }

    private restoreAutosave() {
        const data = this.read(STORAGE_AUTOSAVE);
        if (data && this.loadProject(data))
            this.message = 'Sesion anterior restaurada';
    }

    private read(key: string): any {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    private write(key: string, value: any): boolean {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            // Cuota llena o almacenamiento bloqueado
            this.message = 'No se pudo guardar en el navegador (usa Exportar .json)';
            return false;
        }
    }

    refreshSaved() {
        const all = this.read(STORAGE_PROJECTS) || {};
        this.saved = Object.keys(all)
            .map(name => ({ name, savedAt: all[name].savedAt, tracks: (all[name].data.tracks || []).length, data: all[name].data }))
            .sort((a, b) => b.savedAt - a.savedAt);
    }

    saveNamed() {
        const name = (this.projectName || '').trim().slice(0, 40);
        if (!name) {
            this.message = 'Escribi un nombre para el proyecto';
            return;
        }
        if (!this.tracks.length) {
            this.message = 'No hay pistas para guardar';
            return;
        }
        const all = this.read(STORAGE_PROJECTS) || {};
        if (all[name] && !window.confirm('Ya existe "' + name + '". Sobrescribir?'))
            return;
        this.projectName = name;
        all[name] = { savedAt: Date.now(), data: this.toProject() };
        if (this.write(STORAGE_PROJECTS, all)) {
            this.message = 'Guardado "' + name + '"';
            this.refreshSaved();
        }
    }

    loadNamed(name: string) {
        const s = this.saved.find(x => x.name == name);
        this.message = s && this.loadProject(s.data) ? 'Cargado "' + name + '"' : 'No se pudo cargar "' + name + '"';
        this.dirty();
    }

    deleteNamed(name: string) {
        if (!window.confirm('Borrar "' + name + '"?'))
            return;
        const all = this.read(STORAGE_PROJECTS) || {};
        delete all[name];
        this.write(STORAGE_PROJECTS, all);
        this.refreshSaved();
    }

    exportFile() {
        const name = (this.projectName || 'proyecto').trim() || 'proyecto';
        this.download(new Blob([JSON.stringify(this.toProject(), null, 1)], { type: 'application/json' }), name + '.synth.json');
    }

    importFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => this.zone.run(() => {
            let data = null;
            try {
                data = JSON.parse(reader.result as string);
            } catch (e) {}
            this.message = data && this.loadProject(data) ? 'Importado ' + file.name : 'El archivo no es un proyecto valido';
            this.dirty();
        });
        reader.readAsText(file);
    }

    /** Cantidad de vueltas del loop que dura el WAV exportado. */
    public exportPasses = 1;

    get exportSeconds(): number {
        return this.loopBeats * this.beatDur * this.exportPasses + EXPORT_TAIL;
    }

    /**
     * Renderiza las pistas a un WAV sin perdida. Es un render offline: no corre en tiempo real
     * (un loop largo se calcula en segundos), no interrumpe lo que se esta tocando y lleva los
     * mismos efectos que se escuchan.
     */
    async exportWav() {
        const tracks = this.tracks.filter(t => t.notes.length && !t.muted);
        if (this.exporting || !tracks.length) {
            this.message = 'No hay nada para exportar (pistas vacias o silenciadas)';
            return;
        }
        const seconds = this.exportSeconds;
        if (seconds > MAX_EXPORT_SECONDS) {
            this.message = 'Dura demasiado (' + Math.round(seconds) + ' s, maximo ' + MAX_EXPORT_SECONDS + '). Baja las repeticiones';
            return;
        }
        this.exporting = true;
        try {
            this.message = 'Preparando instrumentos...';
            // Los instrumentos de muestras tienen que estar cargados antes de renderizar
            await Promise.all(tracks.map(t => this.engine.preload(t.patch)));
            this.message = 'Renderizando ' + Math.round(seconds) + ' s de audio...';
            await new Promise(resolve => setTimeout(resolve, 30));   // deja pintar el mensaje

            const rate = this.audioCtx.sampleRate;
            const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
            const chain = new MasterChain(offline);
            chain.setFx(this.sound.fx, false);
            const L = this.loopBeats;
            const beatDur = this.beatDur;
            tracks.forEach(track => {
                const out = offline.createGain();
                out.gain.value = track.volume * track.patch.level;
                out.connect(chain.input);
                for (let pass = 0; pass < this.exportPasses; pass++) {
                    track.notes.forEach(n => {
                        const when = (pass * L + (n.start % L)) * beatDur;
                        const voice = createVoice(offline, out, track.patch, n.midi, n.vel, 0, when, this.library);
                        voice.release(false, when + n.dur * beatDur);
                    });
                }
            });
            const rendered = await offline.startRendering();
            const name = (this.projectName || 'loop').trim() || 'loop';
            this.download(encodeWav(rendered), name + '.wav');
            this.message = 'WAV exportado (' + Math.round(seconds) + ' s)';
        } catch (e) {
            this.message = 'No se pudo exportar: ' + (e && e.message || e);
        } finally {
            this.exporting = false;
        }
    }

    private download(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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
