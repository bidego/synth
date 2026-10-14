import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { Clock } from './types';

/** Lo que el transporte le pide a cada secuenciador (uno por instrumento con pistas). */
export interface TransportClient {
    /** Agenda lo que cae en la ventana [b0, b1) (beats absolutos, negras) desde el inicio del loop. */
    schedule(b0: number, b1: number, startTime: number, beatDur: number): void;
    /** El transporte empezo a grabar (el cliente prepara su pista armada). */
    onRecordStart(): void;
    /** Se detuvo el transporte: cortar lo que suena. */
    onStop(): void;
    /** Se dejo de grabar: cerrar las notas que seguian apretadas. */
    onRecordStop(endBeat: number): void;
}

export const BAR_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
export const SIGNATURE_DENOMINATORS = [2, 4, 8, 16];
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const MAX_TRANSPOSE = 24;

const LOOKAHEAD = 0.12;   // s agendados por adelantado
const TICK_MS = 25;

/**
 * Reloj y controles globales del DAW: tempo, compas, largo del loop, cuantizacion, metronomo,
 * transposicion general y play / stop / grabar. Todo el tiempo se mide en beats (negras), asi cambiar
 * el tempo no desarma lo grabado.
 */
@Injectable()
export class TransportService implements Clock {
    public bpm = 100;
    public bars = 2;               // largo del loop, en compases
    public numerator = 4;          // compas: numerador / denominador
    public denominator = 4;
    public quantize = 0.25;        // en negras: 0 = libre, 1 = negra, 0.5 = corchea, 0.25 = semicorchea
    public metronome = true;
    public countIn = true;
    public transpose = 0;          // semitonos, para todos los instrumentos de notas
    public playing = false;
    public recording = false;
    // Desde donde arranca la reproduccion (beats dentro del loop). Parar vuelve a este punto.
    public startBeat = 0;

    // Aviso de cambios para el autoguardado
    public changed = new Subject<void>();
    // Lo asigna el rack: garantiza que haya un instrumento armado al empezar a grabar
    public ensureArmed: () => void = () => {};

    private clients = new Set<TransportClient>();
    private counting = false;      // hay cuenta previa en curso
    private _startTime = 0;        // instante (AudioContext) del beat 0 del loop
    private playFrom = 0;          // beat en el que empezo a sonar (la cuenta previa llega hasta ahi)
    private schedFrom = 0;         // hasta donde ya se agendo
    private timer: any;
    private taps: Array<number> = [];

    constructor(private audioCtx: AudioContext, private zone: NgZone) {}

    // --- Medidas ---

    /** Negras por compas: 4/4 = 4, 3/4 = 3, 6/8 = 3, 7/8 = 3.5. */
    get barBeats(): number {
        return this.numerator * 4 / this.denominator;
    }

    get loopBeats(): number {
        return this.bars * this.barBeats;
    }

    /** Segundos por negra. */
    get beatDur(): number {
        return 60 / this.bpm;
    }

    /** Negras que dura un pulso del metronomo (el denominador del compas). */
    get unitBeats(): number {
        return 4 / this.denominator;
    }

    get startTime(): number {
        return this._startTime;
    }

    get now(): number {
        return this.audioCtx.currentTime;
    }

    /** Beat absoluto desde el inicio del loop (negativo durante la cuenta previa). */
    get absBeat(): number {
        return (this.audioCtx.currentTime - this._startTime) / this.beatDur;
    }

    get countingIn(): boolean {
        return this.playing && this.counting && this.absBeat < this.playFrom;
    }

    /** Posicion actual dentro del loop, en beats: la del cursor si esta parado o en la cuenta previa. */
    get cursor(): number {
        if (!this.playing || this.countingIn)
            return Math.min(this.startBeat, this.loopBeats);
        return Math.max(0, this.absBeat) % this.loopBeats;
    }

    /** 0..1 dentro del loop. */
    get position(): number {
        return this.cursor / this.loopBeats;
    }

    /** Pulso dentro del compas (0 = el primero), para el indicador. -1 si no esta sonando. */
    get beatInBar(): number {
        if (!this.playing)
            return -1;
        const unit = Math.floor(this.absBeat / this.unitBeats);
        return ((unit % this.numerator) + this.numerator) % this.numerator;
    }

    /** Compas y pulso actuales dentro del loop ("2.3"). */
    get positionText(): string {
        const beat = this.cursor;
        const bar = Math.floor(beat / this.barBeats) + 1;
        const unit = Math.floor((beat % this.barBeats) / this.unitBeats) + 1;
        return bar + '.' + unit;
    }

    // --- Clientes (secuenciadores) ---

    register(client: TransportClient) {
        this.clients.add(client);
    }

    unregister(client: TransportClient) {
        this.clients.delete(client);
    }

    // --- Controles ---

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
        this.ensureArmed();
        this.recording = true;
        this.clients.forEach(c => c.onRecordStart());
        if (!this.playing)
            this.start(this.countIn);
    }

    private start(withCountIn: boolean) {
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario
        this.audioCtx.resume();
        const now = this.audioCtx.currentTime;
        this.counting = withCountIn;
        this.startBeat = Math.min(this.startBeat, Math.max(0, this.loopBeats - 1e-6));
        this.playFrom = this.startBeat;
        this._startTime = now + 0.05 + (withCountIn ? this.barBeats * this.beatDur : 0) - this.startBeat * this.beatDur;
        this.schedFrom = now;
        this.playing = true;
        this.zone.runOutsideAngular(() => this.timer = setInterval(() => this.tick(), TICK_MS));
    }

    stop() {
        this.stopRecording();
        this.playing = false;
        clearInterval(this.timer);
        this.clients.forEach(c => c.onStop());
    }

    private stopRecording() {
        if (!this.recording)
            return;
        const end = this.absBeat;
        this.clients.forEach(c => c.onRecordStop(end));
        this.recording = false;
    }

    /**
     * Salta a un punto del loop (en beats). Parado, fija desde donde arrancara; sonando, cambia de lugar
     * al instante. No se puede mover mientras graba.
     */
    seek(beat: number) {
        if (this.recording || !isFinite(beat))
            return;
        beat = Math.max(0, Math.min(beat, this.loopBeats - 1e-6));
        if (this.playing) {
            const now = this.audioCtx.currentTime;
            // Lo que ya se agendo del lugar anterior se corta y se agenda desde el nuevo
            this.clients.forEach(c => c.onStop());
            this.counting = false;
            this._startTime = now + 0.03 - beat * this.beatDur;
            this.schedFrom = now;
        } else {
            this.startBeat = beat;
            this.changed.next();
        }
    }

    /** Mueve el cursor `bars` compases (negativo = hacia atras), sin salirse del loop. */
    skipBars(bars: number) {
        const b = this.barBeats;
        const from = this.cursor;
        // Alinea al inicio de compas: retroceder desde la mitad de un compas vuelve al comienzo de ese compas
        const target = bars < 0 && from % b > 0.05 && bars == -1 ? Math.floor(from / b) * b : (Math.round(from / b) * b + bars * b);
        this.seek(Math.max(0, Math.min(target, this.loopBeats - b)));
    }

    /** Vuelve al comienzo del loop y fija ahi el punto de partida. */
    rewind() {
        this.startBeat = 0;
        this.seek(0);
        this.changed.next();
    }

    /** Fija el punto de partida donde esta el cursor (para sonar y volver ahi al parar). */
    setStartHere() {
        this.startBeat = this.cursor;
        this.changed.next();
    }

    private clampStart() {
        this.startBeat = Math.min(this.startBeat, Math.max(0, this.loopBeats - this.unitBeats));
    }

    setBpm(value: any) {
        // Mantener la posicion actual del loop al cambiar de tempo
        const beat = this.playing ? this.absBeat : 0;
        const bpm = parseFloat(value);
        this.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, isFinite(bpm) ? Math.round(bpm * 10) / 10 : this.bpm));
        if (this.playing)
            this._startTime = this.audioCtx.currentTime - beat * this.beatDur;
        this.changed.next();
    }

    /** Toca el tempo: el promedio de los ultimos intervalos entre toques. */
    tap() {
        const now = performance.now();
        if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000)
            this.taps = [];
        this.taps.push(now);
        this.taps = this.taps.slice(-5);
        if (this.taps.length >= 2) {
            const span = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
            this.setBpm(60000 / span);
        }
    }

    setBars(bars: number) {
        this.bars = bars;
        this.clampStart();
        this.changed.next();
    }

    setSignature(numerator: number, denominator: number) {
        this.numerator = Math.max(1, Math.min(16, Math.round(numerator)));
        this.denominator = SIGNATURE_DENOMINATORS.indexOf(denominator) >= 0 ? denominator : this.denominator;
        this.clampStart();
        this.changed.next();
    }

    setQuantize(value: number) {
        this.quantize = value;
        this.changed.next();
    }

    setFlag(flag: 'metronome' | 'countIn', value: boolean) {
        this[flag] = value;
        this.changed.next();
    }

    setTranspose(semitones: number) {
        this.transpose = Math.max(-MAX_TRANSPOSE, Math.min(MAX_TRANSPOSE, Math.round(semitones)));
        this.changed.next();
    }

    // --- Planificador ---

    // Agenda en el AudioContext todo lo que cae dentro de la ventana de lookahead
    private tick() {
        const now = this.audioCtx.currentTime;
        const until = now + LOOKAHEAD;
        const from = this.schedFrom;
        this.schedFrom = until;
        let b0 = (from - this._startTime) / this.beatDur;
        const b1 = (until - this._startTime) / this.beatDur;

        if (this.metronome) {
            const unit = this.unitBeats;
            for (let k = Math.ceil(b0 / unit); k * unit < b1; k++)
                this.click(this._startTime + k * unit * this.beatDur, ((k % this.numerator) + this.numerator) % this.numerator == 0);
        }
        // En la cuenta previa los instrumentos todavia no suenan (solo el metronomo)
        if (this.counting && b0 < this.playFrom)
            b0 = this.playFrom;
        this.clients.forEach(c => c.schedule(b0, b1, this._startTime, this.beatDur));
    }

    private click(when: number, accent: boolean) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.frequency.value = accent ? 1500 : 1000;
        gain.gain.setValueAtTime(0.15, when);
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
        osc.connect(gain);
        // Directo a los parlantes: el metronomo no pasa por el rack ni por el visualizador
        gain.connect(this.audioCtx.destination);
        osc.start(when);
        osc.stop(when + 0.05);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    // --- Estado ---

    getState() {
        return {
            bpm: this.bpm, bars: this.bars, numerator: this.numerator, denominator: this.denominator,
            quantize: this.quantize, metronome: this.metronome, countIn: this.countIn, transpose: this.transpose,
            startBeat: this.startBeat
        };
    }

    setState(raw: any) {
        if (!raw || typeof raw != 'object')
            return;
        const num = (v: any, min: number, max: number, def: number) =>
            typeof v == 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
        this.bpm = Math.round(num(raw.bpm, MIN_BPM, MAX_BPM, 100) * 10) / 10;
        this.bars = BAR_OPTIONS.indexOf(raw.bars) >= 0 ? raw.bars : 2;
        this.numerator = Math.round(num(raw.numerator, 1, 16, 4));
        this.denominator = SIGNATURE_DENOMINATORS.indexOf(raw.denominator) >= 0 ? raw.denominator : 4;
        this.quantize = [0, 0.125, 0.25, 0.5, 1].indexOf(raw.quantize) >= 0 ? raw.quantize : 0.25;
        this.metronome = raw.metronome !== false;
        this.countIn = raw.countIn !== false;
        this.transpose = Math.round(num(raw.transpose, -MAX_TRANSPOSE, MAX_TRANSPOSE, 0));
        this.startBeat = num(raw.startBeat, 0, 64 * 16, 0);
        this.clampStart();
    }
}
