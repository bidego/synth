import { AfterViewChecked, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TransportService } from '../core/transport.service';
import { RackService } from '../core/rack.service';
import { AutomationService, AutoLane } from '../core/automation.service';
import { UiService } from '../../services/ui.service';

interface Lane {
    key: string;
    label: string;
    muted: boolean;
    notes: Array<{ start: number; dur: number; midi: number }>;
    auto?: AutoLane;   // franja de automatizacion: en vez de notas se dibuja la curva del parametro
    min?: number;
    max?: number;
}

const MAX_LANES_SHOWN = 16;
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

    constructor(public transport: TransportService, public rack: RackService, public ui: UiService,
                public automation: AutomationService, private zone: NgZone) {}

    // El cursor sigue el reloj del audio: un tick de la zona alcanza para moverlo
    ngOnInit() {
        this.timer = setInterval(() => this.refreshLanes(), 100);
    }

    ngOnDestroy() {
        clearInterval(this.timer);
        this.endSeek();
    }

    private sig = '';

    /** Las franjas se rearman solo si cambiaron las pistas o sus notas. */
    private refreshLanes() {
        if (!this.ui.timelineOpen)
            return;
        const synths = this.rack.synths;
        const sig = synths.map(s => s.id + ':' + s.name + ':' + s.sequencer.notesVersion + ':'
            + s.sequencer.tracks.map(t => t.id + (t.muted ? 'm' : '') + t.notes.length).join(',')).join('|') + '#' + this.transport.loopBeats
            + '#' + this.automation.lanes.map(l => l.module + l.param + l.points.length + (l.enabled ? 'e' : 'd')).join(',');
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
        this.automation.lanes.forEach(l => {
            const r = this.automation.range(l);
            lanes.push({ key: 'a:' + l.module + l.param, label: this.automation.label(l), muted: !l.enabled, notes: [], auto: l, min: r.min, max: r.max });
        });
        this.lanes = lanes;
        this.dirty = true;
    }

    get shownLanes(): Array<Lane> {
        return this.lanes.slice(0, MAX_LANES_SHOWN);
    }

    get hiddenLanes(): number {
        return Math.max(0, this.lanes.length - MAX_LANES_SHOWN);
    }

    // La curva de una pista de automatizacion: sube y baja segun el valor del parametro
    private drawCurve(ctx: CanvasRenderingContext2D, lane: Lane, row: number, width: number, L: number) {
        const pts = lane.auto.points.filter(p => p.b <= L);
        if (!pts.length)
            return;
        const span = (lane.max - lane.min) || 1;
        const y = (v: number) => row * LANE_H + LANE_H - 3 - (v - lane.min) / span * (LANE_H - 6);
        ctx.strokeStyle = '#5cc8ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, y(pts[0].v));
        pts.forEach(p => ctx.lineTo(p.b / L * width, y(p.v)));
        ctx.lineTo(width, y(pts[pts.length - 1].v));
        ctx.stroke();
    }

    removeLane(lane: Lane) {
        if (lane.auto && window.confirm('Borrar la automatizacion "' + lane.label + '"?'))
            this.automation.remove(lane.auto);
    }

    toggleLane(lane: Lane) {
        if (lane.auto)
            this.automation.setEnabled(lane.auto, !lane.auto.enabled);
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
            if (lane.auto) {
                this.drawCurve(ctx, lane, i, canvas.width, L);
                return;
            }
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

    // Los eventos globales del puntero se escuchan solo mientras se arrastra, fuera de la zona de Angular
    private moveFn = (e: PointerEvent) => this.zone.run(() => this.moveSeek(e));
    private upFn = () => this.endSeek();

    startSeek(e: PointerEvent) {
        if (e.button > 0 || this.transport.recording)
            return;
        this.seeking = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        this.transport.seek(this.beatAt(e, e.shiftKey));
        this.zone.runOutsideAngular(() => {
            document.addEventListener('pointermove', this.moveFn);
            document.addEventListener('pointerup', this.upFn);
            document.addEventListener('pointercancel', this.upFn);
        });
        e.preventDefault();
    }

    private moveSeek(e: PointerEvent) {
        if (this.seeking)
            this.transport.seek(this.beatAt(e, e.shiftKey));
    }

    private endSeek() {
        this.seeking = false;
        document.removeEventListener('pointermove', this.moveFn);
        document.removeEventListener('pointerup', this.upFn);
        document.removeEventListener('pointercancel', this.upFn);
    }
}
