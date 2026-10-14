import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { toNorm, fromNorm, formatValue, arcPath, polar } from './controls';

const SWEEP = 135;            // la perilla recorre de -135 a +135 grados (270 en total)
const DRAG_RANGE = 170;       // pixeles de arrastre vertical para recorrer todo el rango
const FINE_FACTOR = 4;        // con Shift el arrastre es 4 veces mas fino

/**
 * Potenciometro rotativo: arco de valor, cuerpo con puntero, lectura numerica.
 * - Arrastrar en vertical cambia el valor (Shift = ajuste fino); la rueda tambien.
 * - Doble clic vuelve al valor por defecto.
 * - Lleva un <input type="range"> oculto pero enfocable: las flechas del teclado y los lectores de
 *   pantalla funcionan como en cualquier control nativo.
 */
@Component({
    selector: 'app-knob',
    template: `
<div class="knob" [class.drag]="dragging" [class.focus]="focused" [class.bipolar]="bipolar" [style.width.px]="size"
    (pointerdown)="down($event)" (dblclick)="reset()" [title]="tooltip">
    <span class="label" *ngIf="label">{{ label }}</span>
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 100 100" aria-hidden="true">
        <g class="ticks">
            <line *ngFor="let t of ticks" [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2"></line>
        </g>
        <path class="track" [attr.d]="trackPath"></path>
        <path class="fill" [attr.d]="fillPath"></path>
        <circle class="body" cx="50" cy="50" r="30"></circle>
        <circle class="shine" cx="50" cy="50" r="30"></circle>
        <g [attr.transform]="'rotate(' + angle + ' 50 50)'">
            <line class="pointer" x1="50" y1="26" x2="50" y2="40"></line>
        </g>
    </svg>
    <span class="value" *ngIf="!hideValue">{{ display }}</span>
    <input class="native" type="range" [class]="'native ' + (inputClass || '')"
        [min]="log ? 0 : min" [max]="log ? 1 : max" [step]="log ? 0.001 : nativeStep" [value]="log ? norm : value"
        (input)="onNative($event.target.valueAsNumber)" (focus)="focused = true" (blur)="focused = false"
        [attr.aria-label]="ariaLabel || label">
</div>`,
    styles: [`
:host { display: inline-block; }
.knob { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; touch-action: none;
    user-select: none; -webkit-user-select: none; cursor: ns-resize; }
.label { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.value { font-family: var(--mono); font-size: 10px; color: var(--dim); min-height: 13px; white-space: nowrap; }
svg { display: block; overflow: visible; }
.ticks line { stroke: rgba(255, 255, 255, 0.14); stroke-width: 1.4; }
.track { fill: none; stroke: #232844; stroke-width: 7; stroke-linecap: round; }
.fill { fill: none; stroke: var(--accent); stroke-width: 7; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(255, 79, 135, 0.55)); }
.body { fill: #1a1d32; stroke: #4a5185; stroke-width: 1.5; }
.shine { fill: none; stroke: rgba(255, 255, 255, 0.07); stroke-width: 9; clip-path: inset(0 0 55% 0); }
.pointer { stroke: #fff; stroke-width: 4; stroke-linecap: round; }
.knob:hover .body { stroke: #6a73b8; }
.knob.drag .value, .knob:hover .value { color: var(--text); }
.knob.drag .body { stroke: var(--accent); }
.knob.focus .track { stroke: #3a4272; }
.knob.focus .body { stroke: var(--info); stroke-width: 3; }
.native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; margin: 0; }
`]
})
export class KnobComponent {
    @Input() value = 0;
    @Input() min = 0;
    @Input() max = 1;
    @Input() step = 0;                 // 0 = continuo
    @Input() default: number;          // al que vuelve con doble clic (por defecto el minimo, o el centro si es bipolar)
    @Input() label = '';
    @Input() unit = '';
    @Input() log = false;              // escala logaritmica (frecuencias)
    @Input() bipolar = false;          // el arco parte del centro (paneo, detune)
    @Input() size = 46;
    @Input() ariaLabel = '';
    @Input() inputClass = '';
    @Input() hideValue = false;
    @Input() format: (v: number) => string;
    @Output() valueChange = new EventEmitter<number>();

    public dragging = false;
    public focused = false;
    public ticks = Array.from({ length: 11 }, (_, i) => {
        const a = -SWEEP + i * (2 * SWEEP / 10);
        const p1 = polar(50, 50, 44, a), p2 = polar(50, 50, 48, a);
        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
    private startY = 0;
    private startNorm = 0;

    get nativeStep(): number {
        return this.step > 0 ? this.step : (this.max - this.min) / 200;
    }

    get norm(): number {
        return toNorm(this.value, this.min, this.max, this.log);
    }

    get angle(): number {
        return -SWEEP + this.norm * 2 * SWEEP;
    }

    get trackPath(): string {
        return arcPath(50, 50, 40, -SWEEP, SWEEP);
    }

    // El arco de valor: desde el inicio, o desde el centro en los controles bipolares
    get fillPath(): string {
        return this.bipolar ? arcPath(50, 50, 40, 0, this.angle) : arcPath(50, 50, 40, -SWEEP, this.angle);
    }

    get display(): string {
        return this.format ? this.format(this.value) : formatValue(this.value, this.step || this.nativeStep, this.unit);
    }

    get tooltip(): string {
        return (this.label ? this.label + ': ' : '') + this.display + ' (arrastra; Shift = fino; doble clic = valor por defecto)';
    }

    private set(norm: number) {
        const v = fromNorm(norm, this.min, this.max, this.log, this.step);
        if (v !== this.value)
            this.valueChange.emit(v);
    }

    down(e: PointerEvent) {
        e.preventDefault();
        this.dragging = true;
        this.startY = e.clientY;
        this.startNorm = this.norm;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        // El control se enfoca para poder seguir con el teclado
        const input = (e.currentTarget as HTMLElement).querySelector('input') as HTMLElement;
        if (input)
            input.focus();
    }

    @HostListener('pointermove', ['$event'])
    move(e: PointerEvent) {
        if (!this.dragging)
            return;
        const range = e.shiftKey ? DRAG_RANGE * FINE_FACTOR : DRAG_RANGE;
        this.set(this.startNorm + (this.startY - e.clientY) / range);
    }

    @HostListener('pointerup')
    @HostListener('pointercancel')
    up() {
        this.dragging = false;
    }

    // La rueda del mouse ajusta de a poco (Shift = mas fino)
    @HostListener('wheel', ['$event'])
    wheel(e: WheelEvent) {
        e.preventDefault();
        const unit = e.shiftKey ? 0.004 : 0.02;
        this.set(this.norm + (e.deltaY < 0 ? unit : -unit));
    }

    reset() {
        const d = this.default !== undefined ? this.default : (this.bipolar ? (this.min + this.max) / 2 : this.min);
        if (d !== this.value)
            this.valueChange.emit(d);
    }

    // Cambio desde el input nativo (teclado o lector de pantalla)
    onNative(v: number) {
        if (!isFinite(v))
            return;
        this.valueChange.emit(this.log ? fromNorm(v, this.min, this.max, true, this.step) : v);
    }
}
