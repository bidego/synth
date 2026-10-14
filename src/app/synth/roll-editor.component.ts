import { Component, ElementRef, ViewChild, DoCheck, HostListener } from '@angular/core';
import { LooperService, Track, LoopNote } from '../services/looper.service';
import { SynthEngine } from '../services/synth.engine';
import { noteName } from '../services/keyboard-map';
import { GM_DRUM_SHORT, KIT_NOTE_OFFSET } from '../services/gm';
import { DRUM_NAMES } from './drums';

type Tool = 'select' | 'draw';

interface Drag {
    kind: 'move' | 'resize' | 'draw' | 'rubber' | 'velocity';
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    note?: LoopNote;
    origins: Map<LoopNote, { start: number; dur: number; midi: number }>;
    additive?: boolean;
    moved: boolean;
    lastMidi?: number;
    // Arrastre con Ctrl: las originales quedan donde estaban y lo que se mueve son las copias
    copy?: { originals: Array<LoopNote>; clones: Array<LoopNote> };
}

const GUTTER_W = 64;
const ROW_H = 14;
const LANE_H = 64;
const MIN_DUR = 0.05;
const HANDLE_PX = 6;
const BLACK = [1, 3, 6, 8, 10];
const HISTORY_LIMIT = 100;

/**
 * Editor de piano roll de una pista. Todo se dibuja en canvas (tolera cientos de notas) y las
 * ediciones modifican `track.notes` directamente: el looper las toca en la siguiente vuelta.
 */
@Component({
    selector: 'app-roll-editor',
    templateUrl: './roll-editor.component.html',
    styleUrls: ['./roll-editor.component.css']
})
export class RollEditorComponent implements DoCheck {
    @ViewChild('roll', { static: false }) private rollRef: ElementRef<HTMLCanvasElement>;
    @ViewChild('gutter', { static: false }) private gutterRef: ElementRef<HTMLCanvasElement>;
    @ViewChild('lane', { static: false }) private laneRef: ElementRef<HTMLCanvasElement>;

    public tool: Tool = 'select';
    public grids = [
        { label: '1/4', value: 1 }, { label: '1/8', value: 0.5 }, { label: '1/16', value: 0.25 },
        { label: '1/32', value: 0.125 }, { label: 'Libre', value: 0 }
    ];
    public grid = 0.25;
    public ppb = 40;            // pixeles por beat (zoom horizontal)
    public lo = 48;             // nota mas grave visible
    public hi = 72;             // nota mas aguda visible
    public selected = new Set<LoopNote>();
    public message = '';

    private trackId: number = null;
    private lastVersion = -1;
    private lastPos = -1;
    private dirtyView = true;
    private history: Array<Array<LoopNote>> = [];
    private future: Array<Array<LoopNote>> = [];
    private drag: Drag = null;

    constructor(public looper: LooperService, private engine: SynthEngine) {}

    get track(): Track {
        return this.looper.editingTrack;
    }

    get canUndo(): boolean {
        return this.history.length > 0;
    }
    get canRedo(): boolean {
        return this.future.length > 0;
    }

    private get L(): number {
        return this.looper.loopBeats;
    }

    get rows(): number {
        return this.hi - this.lo + 1;
    }

    // --- Ciclo de vida: se redibuja solo cuando hace falta ---

    ngDoCheck() {
        const t = this.track;
        if (!t) {
            this.trackId = null;
            return;
        }
        if (this.trackId !== t.id)
            this.openTrack(t);
        const pos = this.looper.playing ? Math.round(this.looper.position * 2000) : -1;
        if (this.dirtyView || this.lastVersion !== this.looper.notesVersion || pos !== this.lastPos) {
            this.lastVersion = this.looper.notesVersion;
            this.lastPos = pos;
            this.dirtyView = false;
            // Los canvas existen despues de que Angular pinta el *ngIf
            setTimeout(() => this.draw());
        }
    }

    private openTrack(t: Track) {
        this.trackId = t.id;
        this.history = [];
        this.future = [];
        this.selected.clear();
        this.message = '';
        this.ppb = Math.max(12, Math.min(80, Math.floor(900 / this.L)));
        this.fitRange(t);
        this.dirtyView = true;
    }

    // Rango de notas visible: las de la pista con margen, y al menos dos octavas
    private fitRange(t: Track) {
        let lo = 48, hi = 72;
        if (t.notes.length) {
            lo = Math.min(...t.notes.map(n => n.midi)) - 2;
            hi = Math.max(...t.notes.map(n => n.midi)) + 2;
        }
        while (hi - lo + 1 < 24) {
            lo--;
            if (hi - lo + 1 < 24)
                hi++;
        }
        this.lo = Math.max(0, lo);
        this.hi = Math.min(127, hi);
    }

    // --- Utilidades ---

    private snap(beats: number): number {
        return this.grid ? Math.round(beats / this.grid) * this.grid : beats;
    }
    private snapDown(beats: number): number {
        return this.grid ? Math.floor(beats / this.grid + 1e-9) * this.grid : beats;
    }

    rowLabel(midi: number): string {
        const t = this.track;
        if (t && t.patch.kind == 'kit')
            return GM_DRUM_SHORT[midi - KIT_NOTE_OFFSET] || noteName(midi);
        if (t && t.patch.kind == 'drums')
            return DRUM_NAMES[midi % 12];
        return noteName(midi);
    }

    private pushHistory() {
        const t = this.track;
        this.history.push(t.notes.map(n => ({ ...n })));
        if (this.history.length > HISTORY_LIMIT)
            this.history.shift();
        this.future = [];
    }

    private changed() {
        this.looper.touch();
        this.dirtyView = true;
    }

    private noteRect(n: LoopNote) {
        const x = (n.start % this.L) * this.ppb;
        return { x, y: (this.hi - n.midi) * ROW_H, w: Math.max(n.dur * this.ppb, 4), h: ROW_H };
    }

    private hitTest(x: number, y: number): { note: LoopNote, edge: boolean } | null {
        const notes = this.track.notes;
        for (let i = notes.length - 1; i >= 0; i--) {
            const r = this.noteRect(notes[i]);
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y < r.y + r.h)
                return { note: notes[i], edge: r.w > HANDLE_PX * 2 && x >= r.x + r.w - HANDLE_PX };
        }
        return null;
    }

    // Ctrl en Windows/Linux, Cmd en Mac, y Alt/Option (la convencion de varios DAWs)
    private copyModifier(event: MouseEvent): boolean {
        return event.ctrlKey || event.metaKey || event.altKey;
    }

    private local(event: PointerEvent, el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    // --- Interaccion en el roll ---

    onDown(event: PointerEvent) {
        const t = this.track;
        const canvas = this.rollRef.nativeElement;
        const { x, y } = this.local(event, canvas);
        const hit = this.hitTest(x, y);
        canvas.setPointerCapture(event.pointerId);
        const base = { startX: x, startY: y, curX: x, curY: y, origins: new Map(), moved: false };

        if (hit) {
            if (event.shiftKey && this.selected.has(hit.note)) {
                this.selected.delete(hit.note);
                this.dirtyView = true;
                return;
            }
            if (!this.selected.has(hit.note)) {
                if (!event.shiftKey)
                    this.selected.clear();
                this.selected.add(hit.note);
            }
            this.pushHistory();
            let moving = Array.from(this.selected);
            let anchor = hit.note;
            let copy: Drag['copy'];
            // Ctrl (o Cmd / Alt) + arrastrar el cuerpo de una nota: se copian las seleccionadas
            if (this.copyModifier(event) && !hit.edge) {
                const originals = moving;
                const clones = originals.map(n => ({ ...n, take: 0 }));
                t.notes.push(...clones);
                anchor = clones[originals.indexOf(hit.note)];
                this.selected.clear();
                clones.forEach(n => this.selected.add(n));
                moving = clones;
                copy = { originals, clones };
            }
            const origins = new Map<LoopNote, { start: number; dur: number; midi: number }>();
            moving.forEach(n => origins.set(n, { start: n.start, dur: n.dur, midi: n.midi }));
            this.drag = { ...base, kind: hit.edge ? 'resize' : 'move', note: anchor, origins, lastMidi: anchor.midi, copy };
            if (!hit.edge)
                this.looper.preview(t, anchor.midi, anchor.vel);
        } else if (this.tool == 'draw') {
            this.pushHistory();
            const midi = this.hi - Math.floor(y / ROW_H);
            const start = Math.max(0, Math.min(this.L - MIN_DUR, this.snapDown(x / this.ppb)));
            const note: LoopNote = { start, dur: this.grid || 0.25, midi, vel: 0.8, take: 0 };
            t.notes.push(note);
            this.selected.clear();
            this.selected.add(note);
            this.drag = { ...base, kind: 'draw', note, origins: new Map([[note, { start, dur: note.dur, midi }]]), moved: true };
            this.looper.preview(t, midi, note.vel);
            this.changed();
        } else {
            if (!event.shiftKey)
                this.selected.clear();
            this.drag = { ...base, kind: 'rubber', additive: event.shiftKey };
        }
        this.dirtyView = true;
    }

    onMove(event: PointerEvent) {
        const canvas = this.rollRef.nativeElement;
        const { x, y } = this.local(event, canvas);
        const d = this.drag;
        if (!d) {
            const hit = this.hitTest(x, y);
            canvas.style.cursor = hit ? (hit.edge ? 'ew-resize' : (this.copyModifier(event) ? 'copy' : 'grab')) : (this.tool == 'draw' ? 'crosshair' : 'default');
            return;
        }
        d.curX = x;
        d.curY = y;
        const dBeats = (x - d.startX) / this.ppb;
        const L = this.L;
        if (d.kind == 'move') {
            const delta = this.grid ? Math.round(dBeats / this.grid) * this.grid : dBeats;
            const dMidi = -Math.round((y - d.startY) / ROW_H);
            d.origins.forEach((o, n) => {
                n.start = Math.max(0, Math.min(L - MIN_DUR, o.start + delta));
                n.midi = Math.max(0, Math.min(127, o.midi + dMidi));
            });
            d.moved = d.moved || delta !== 0 || dMidi !== 0;
            if (d.note.midi !== d.lastMidi) {
                d.lastMidi = d.note.midi;
                this.looper.preview(this.track, d.note.midi, d.note.vel);
            }
            this.changed();
        } else if (d.kind == 'resize') {
            const delta = this.grid ? Math.round(dBeats / this.grid) * this.grid : dBeats;
            const min = this.grid || MIN_DUR;
            d.origins.forEach((o, n) => {
                n.dur = Math.max(min, Math.min(L - n.start, o.dur + delta));
            });
            d.moved = d.moved || delta !== 0;
            this.changed();
        } else if (d.kind == 'draw') {
            const n = d.note;
            const end = this.snap(x / this.ppb);
            n.dur = Math.max(this.grid || 0.25, Math.min(L - n.start, end - n.start));
            this.changed();
        } else if (d.kind == 'rubber') {
            this.applyRubber(d);
            this.dirtyView = true;
        }
    }

    onUp(event: PointerEvent) {
        const d = this.drag;
        this.drag = null;
        if (!d)
            return;
        // Un clic sin arrastrar no es una edicion: no ensucia el historial
        if ((d.kind == 'move' || d.kind == 'resize') && !d.moved) {
            this.history.pop();
            // Ctrl + clic sin mover: se descartan las copias (quedarian encima de las originales)
            if (d.copy) {
                const clones = new Set(d.copy.clones);
                this.track.notes = this.track.notes.filter(n => !clones.has(n));
                this.selected.clear();
                d.copy.originals.forEach(n => this.selected.add(n));
                this.changed();
            }
        } else if (d.copy) {
            this.message = d.copy.clones.length == 1 ? 'Nota copiada' : d.copy.clones.length + ' notas copiadas';
        }
        this.dirtyView = true;
    }

    // El borde derecho de una nota cambia su duracion; doble clic la borra
    onDoubleClick(event: MouseEvent) {
        const { x, y } = this.local(event as PointerEvent, this.rollRef.nativeElement);
        const hit = this.hitTest(x, y);
        if (hit) {
            this.pushHistory();
            this.track.notes = this.track.notes.filter(n => n !== hit.note);
            this.selected.delete(hit.note);
            this.changed();
        }
    }

    private applyRubber(d: Drag) {
        const x0 = Math.min(d.startX, d.curX), x1 = Math.max(d.startX, d.curX);
        const y0 = Math.min(d.startY, d.curY), y1 = Math.max(d.startY, d.curY);
        if (!d.additive)
            this.selected.clear();
        this.track.notes.forEach(n => {
            const r = this.noteRect(n);
            if (r.x <= x1 && r.x + r.w >= x0 && r.y <= y1 && r.y + r.h >= y0)
                this.selected.add(n);
        });
    }

    // --- Carril de velocidad ---

    // Con acordes varias notas empiezan en el mismo instante y sus barras se superponen:
    // gana la que tiene el tope mas cerca del puntero en vertical
    private laneNote(x: number, y: number): LoopNote | null {
        let best: LoopNote = null, bestDist = Infinity;
        this.track.notes.forEach(n => {
            if (Math.abs((n.start % this.L) * this.ppb + 2 - x) > 8)
                return;
            const top = LANE_H - n.vel * (LANE_H - 4);
            const dist = Math.abs(top - y);
            if (dist < bestDist) {
                best = n;
                bestDist = dist;
            }
        });
        return best;
    }

    onLaneDown(event: PointerEvent) {
        const canvas = this.laneRef.nativeElement;
        const { x, y } = this.local(event, canvas);
        const note = this.laneNote(x, y);
        if (!note)
            return;
        canvas.setPointerCapture(event.pointerId);
        this.pushHistory();
        if (!this.selected.has(note)) {
            if (!event.shiftKey)
                this.selected.clear();
            this.selected.add(note);
        }
        this.drag = { kind: 'velocity', startX: x, startY: y, curX: x, curY: y, note, origins: new Map(), moved: true };
        this.setVelocity(note, y);
    }

    onLaneMove(event: PointerEvent) {
        if (this.drag && this.drag.kind == 'velocity')
            this.setVelocity(this.drag.note, this.local(event, this.laneRef.nativeElement).y);
    }

    private setVelocity(note: LoopNote, y: number) {
        note.vel = Math.max(0.02, Math.min(1, 1 - y / LANE_H));
        this.changed();
    }

    // --- Acciones ---

    private targets(): Array<LoopNote> {
        // Sin seleccion, las acciones se aplican a toda la pista
        return this.selected.size ? Array.from(this.selected) : this.track.notes;
    }

    quantize() {
        if (!this.grid) {
            this.message = 'Elegi una grilla (no "Libre") para cuantizar';
            return;
        }
        this.pushHistory();
        const L = this.L;
        this.targets().forEach(n => {
            n.start = Math.min(L - this.grid, Math.max(0, Math.round((n.start % L) / this.grid) * this.grid));
        });
        this.message = '';
        this.changed();
    }

    transpose(semitones: number) {
        this.pushHistory();
        const t = this.track;
        this.targets().forEach(n => n.midi = Math.max(0, Math.min(127, n.midi + semitones)));
        const first = this.targets()[0];
        if (first)
            this.looper.preview(t, first.midi, first.vel);
        this.fitRange(t);
        this.changed();
    }

    deleteSelected() {
        if (!this.selected.size)
            return;
        this.pushHistory();
        const t = this.track;
        t.notes = t.notes.filter(n => !this.selected.has(n));
        this.selected.clear();
        this.changed();
    }

    selectAll() {
        this.track.notes.forEach(n => this.selected.add(n));
        this.dirtyView = true;
    }

    undo() {
        if (!this.history.length)
            return;
        this.future.push(this.track.notes.map(n => ({ ...n })));
        this.track.notes = this.history.pop();
        this.selected.clear();
        this.changed();
    }

    redo() {
        if (!this.future.length)
            return;
        this.history.push(this.track.notes.map(n => ({ ...n })));
        this.track.notes = this.future.pop();
        this.selected.clear();
        this.changed();
    }

    doubleLoop() {
        if (!window.confirm('Duplica el loop: se agrega una segunda mitad con una copia de las notas de TODAS las pistas. Esta accion no se puede deshacer. Continuar?'))
            return;
        if (!this.looper.doubleLoop())
            this.message = 'El loop ya esta en el maximo de compases';
        else
            this.message = 'Loop duplicado a ' + this.looper.bars + ' compases';
        this.dirtyView = true;
    }

    extendRange(delta: number) {
        if (delta > 0)
            this.hi = Math.min(127, this.hi + 12);
        else
            this.lo = Math.max(0, this.lo - 12);
        this.dirtyView = true;
    }

    setZoom(value) {
        this.ppb = parseFloat(value);
        this.dirtyView = true;
    }

    setTool(tool: Tool) {
        this.tool = tool;
    }

    setGrid(value: number) {
        this.grid = value;
    }

    close() {
        this.looper.editingId = null;
    }

    // Atajos: solo con el editor abierto y sin escribir en un campo de texto
    @HostListener('document:keydown', ['$event'])
    onKey(event: KeyboardEvent) {
        if (!this.track || this.engine.isTyping(event.target as HTMLElement))
            return;
        const mod = event.ctrlKey || event.metaKey;
        if (event.code == 'Delete' || event.code == 'Backspace') {
            event.preventDefault();
            this.deleteSelected();
        } else if (mod && event.code == 'KeyA') {
            event.preventDefault();
            this.selectAll();
        } else if (mod && event.code == 'KeyZ') {
            event.preventDefault();
            event.shiftKey ? this.redo() : this.undo();
        } else if (mod && event.code == 'KeyY') {
            event.preventDefault();
            this.redo();
        }
    }

    // --- Dibujo ---

    private prepare(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    private draw() {
        const t = this.track;
        if (!t || !this.rollRef || !this.gutterRef || !this.laneRef)
            return;
        const L = this.L;
        const w = Math.ceil(L * this.ppb), h = this.rows * ROW_H;

        // Roll
        const ctx = this.prepare(this.rollRef.nativeElement, w, h);
        for (let m = this.hi; m >= this.lo; m--) {
            const y = (this.hi - m) * ROW_H;
            ctx.fillStyle = BLACK.indexOf(m % 12) >= 0 ? '#171829' : '#222540';
            ctx.fillRect(0, y, w, ROW_H);
            ctx.fillStyle = m % 12 == 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(0, y + ROW_H - 1, w, 1);
        }
        this.gridLines(ctx, w, h);
        t.notes.forEach(n => {
            const r = this.noteRect(n);
            if (r.y < 0 || r.y >= h)
                return;
            const sel = this.selected.has(n);
            ctx.fillStyle = sel ? '#ff5a8a' : 'hsl(200, 80%, ' + (32 + n.vel * 30) + '%)';
            ctx.fillRect(r.x, r.y + 1, r.w, r.h - 2);
            ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.5)';
            ctx.strokeRect(r.x + 0.5, r.y + 1.5, r.w - 1, r.h - 3);
            if (r.w > HANDLE_PX * 2) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(r.x + r.w - 3, r.y + 3, 2, r.h - 6);
            }
        });
        if (this.drag && this.drag.kind == 'rubber') {
            const d = this.drag;
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.strokeStyle = '#fff';
            ctx.fillRect(Math.min(d.startX, d.curX), Math.min(d.startY, d.curY), Math.abs(d.curX - d.startX), Math.abs(d.curY - d.startY));
            ctx.strokeRect(Math.min(d.startX, d.curX) + 0.5, Math.min(d.startY, d.curY) + 0.5, Math.abs(d.curX - d.startX), Math.abs(d.curY - d.startY));
        }
        if (this.looper.playing && !this.looper.countingIn)
            this.playhead(ctx, h);

        // Gutter con los nombres de nota
        const g = this.prepare(this.gutterRef.nativeElement, GUTTER_W, h);
        g.font = '10px sans-serif';
        g.textBaseline = 'middle';
        for (let m = this.hi; m >= this.lo; m--) {
            const y = (this.hi - m) * ROW_H;
            g.fillStyle = BLACK.indexOf(m % 12) >= 0 ? '#111' : '#ddd';
            g.fillRect(0, y, GUTTER_W, ROW_H - 1);
            g.fillStyle = BLACK.indexOf(m % 12) >= 0 ? '#ccc' : '#333';
            g.fillText(this.rowLabel(m), 4, y + ROW_H / 2);
        }

        // Carril de velocidad
        const l = this.prepare(this.laneRef.nativeElement, w, LANE_H);
        l.fillStyle = '#171829';
        l.fillRect(0, 0, w, LANE_H);
        this.gridLines(l, w, LANE_H);
        t.notes.forEach(n => {
            const x = (n.start % L) * this.ppb;
            const bar = n.vel * (LANE_H - 4);
            l.fillStyle = this.selected.has(n) ? '#ff5a8a' : '#6cf';
            l.fillRect(x, LANE_H - bar, 4, bar);
        });
        if (this.looper.playing && !this.looper.countingIn)
            this.playhead(l, LANE_H);
    }

    private gridLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const L = this.L;
        const step = this.grid || 0.25;
        for (let b = 0; b <= L; b += step) {
            const x = Math.round(b * this.ppb) + 0.5;
            const bar = Math.abs(b % 4) < 1e-9, beat = Math.abs(b % 1) < 1e-9;
            if (!bar && !beat && step * this.ppb < 6)
                continue;
            ctx.fillStyle = bar ? 'rgba(255,255,255,0.35)' : beat ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(x, 0, 1, h);
        }
    }

    private playhead(ctx: CanvasRenderingContext2D, h: number) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(this.looper.position * this.L * this.ppb), 0, 2, h);
    }
}
