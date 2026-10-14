import { AfterViewChecked, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TransportService } from '../core/transport.service';
import { RackService } from '../core/rack.service';
import { UiService } from '../../services/ui.service';

interface Lane {
    key: string;
    label: string;
    muted: boolean;
    notes: Array<{ start: number; dur: number; midi: number }>;
}

const MAX_LANES_SHOWN = 8;
const LANE_H = 22;   // alto de cada franja (px), igual que en el css

/**
 * Linea de tiempo del loop: regla de compases, cursor de reproduccion y una franja por pista con sus notas.
 * Un clic (o arrastre) en la regla o en las franjas mueve la posicion; parado, fija desde donde arranca.
 */
@Component({
    selector: 'app-timeline',
    templateUrl: './timeline.component.html',
    styleUrls: ['./timeline.component.css']
})
export class TimelineComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('ruler', { static: false }) private rulerRef: ElementRef<HTMLElement>;
    @ViewChild('canvas', { static: false }) private canvasRef: ElementRef<HTMLCanvasElement>;
    public lanes: Array<Lane> = [];
    private dirty = true;
    private drawnWidth = 0;
    private timer: any;
    private seeking = false;

    constructor(public transport: TransportService, public rack: RackService, public ui: UiService) {}

    // El cursor sigue el reloj del audio: un tick de la zona alcanza para moverlo
    ngOnInit() {
        this.timer = setInterval(() => this.refreshLanes(), 100);
    }

    ngOnDestroy() {
        clearInterval(this.timer);
    }

    private sig = '';

    /** Las franjas se rearman solo si cambiaron las pistas o sus notas. */
    private refreshLanes() {
        if (!this.ui.timelineOpen)
            return;
        const synths = this.rack.synths;
        const sig = synths.map(s => s.id + ':' + s.name + ':' + s.sequencer.notesVersion + ':'
            + s.sequencer.tracks.map(t => t.id + (t.muted ? 'm' : '') + t.notes.length).join(',')).join('|') + '#' + this.transport.loopBeats;
        if (sig === this.sig)
            return;
        this.sig = sig;
        const lanes: Array<Lane> = [];
        synths.forEach(s => s.sequencer.tracks.forEach(t => lanes.push({
            key: s.id + ':' + t.id,
            label: s.name + ' · ' + t.name,
            muted: t.muted,
            notes: t.notes.map(n => ({ start: n.start, dur: n.dur, midi: n.midi }))
        })));
        this.lanes = lanes;
        this.dirty = true;
    }

    get shownLanes(): Array<Lane> {
        return this.lanes.slice(0, MAX_LANES_SHOWN);
    }

    get hiddenLanes(): number {
        return Math.max(0, this.lanes.length - MAX_LANES_SHOWN);
    }

    // --- Regla ---

    get bars(): Array<{ n: number; pct: number; label: boolean }> {
        const t = this.transport;
        const width = this.rulerRef ? this.rulerRef.nativeElement.clientWidth : 800;
        const px = width / t.bars;
        // Con muchos compases se rotula uno de cada tantos para que los numeros no se pisen
        const every = px >= 26 ? 1 : px >= 13 ? 2 : px >= 7 ? 4 : 8;
        return Array.from({ length: t.bars }, (_, i) => ({ n: i + 1, pct: i / t.bars * 100, label: i % every == 0 }));
    }

    get beatTicks(): Array<number> {
        const t = this.transport;
        const width = this.rulerRef ? this.rulerRef.nativeElement.clientWidth : 800;
        if (width / t.bars < 60)
            return [];
        const n = Math.round(t.barBeats / t.unitBeats);
        const out: Array<number> = [];
        for (let bar = 0; bar < t.bars; bar++)
            for (let k = 1; k < n; k++)
                out.push((bar * t.barBeats + k * t.unitBeats) / t.loopBeats * 100);
        return out;
    }

    get cursorPct(): number {
        return this.transport.position * 100;
    }

    get startPct(): number {
        return Math.min(this.transport.startBeat, this.transport.loopBeats) / this.transport.loopBeats * 100;
    }

    get lanesHeight(): number {
        return this.shownLanes.length * LANE_H;
    }

    // Las notas se dibujan en un canvas (puede haber miles): solo se repinta si cambiaron las pistas o el ancho
    ngAfterViewChecked() {
        const canvas = this.canvasRef && this.canvasRef.nativeElement;
        if (!canvas || !this.ui.timelineOpen)
            return;
        const width = canvas.clientWidth;
        if (!this.dirty && width === this.drawnWidth && canvas.height === this.lanesHeight)
            return;
        this.dirty = false;
        this.drawnWidth = width;
        this.drawLanes(canvas, width);
    }

    private drawLanes(canvas: HTMLCanvasElement, width: number) {
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, this.lanesHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        const L = this.transport.loopBeats;
        const color = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#ff4f87';
        ctx.fillStyle = color;
        this.shownLanes.forEach((lane, i) => {
            let lo = 127, hi = 0;
            lane.notes.forEach(n => { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); });
            const span = Math.max(12, hi - lo);
            ctx.globalAlpha = lane.muted ? 0.35 : 1;
            lane.notes.forEach(n => {
                const start = n.start % L;
                const x = start / L * canvas.width;
                const w = Math.max(2, Math.min(n.dur, L - start) / L * canvas.width);
                const y = i * LANE_H + LANE_H - 4 - (n.midi - lo) / span * (LANE_H - 9);
                ctx.fillRect(x, y, w, 3);
            });
        });
        ctx.globalAlpha = 1;
    }

    // --- Mover la posicion ---

    private beatAt(e: PointerEvent, shift: boolean): number {
        const el = this.rulerRef.nativeElement;
        const r = el.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const t = this.transport;
        const raw = frac * t.loopBeats;
        // Se pega al pulso (o al compas con Shift)
        const step = shift ? t.barBeats : t.unitBeats;
        return Math.min(Math.round(raw / step) * step, t.loopBeats - step);
    }

    startSeek(e: PointerEvent) {
        if (e.button > 0 || this.transport.recording)
            return;
        this.seeking = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        this.transport.seek(this.beatAt(e, e.shiftKey));
        e.preventDefault();
    }

    @HostListener('document:pointermove', ['$event'])
    moveSeek(e: PointerEvent) {
        if (this.seeking)
            this.transport.seek(this.beatAt(e, e.shiftKey));
    }

    @HostListener('document:pointerup')
    @HostListener('document:pointercancel')
    endSeek() {
        this.seeking = false;
    }
}
