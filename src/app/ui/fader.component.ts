import { Component, EventEmitter, HostListener, Input, Optional, Output } from '@angular/core';
import { AutomationService } from '../daw/core/automation.service';
import { toNorm, fromNorm, formatValue } from './controls';

/**
 * Fader (deslizador de consola): ranura con marcas, relleno de color y capuchon.
 * Vertical (mezclador, ADSR) u horizontal. Se arrastra el capuchon o se hace clic en la ranura;
 * doble clic vuelve al valor por defecto; la rueda ajusta. Lleva un <input type="range"> oculto
 * pero enfocable para el teclado y los lectores de pantalla.
 */
@Component({
    selector: 'app-fader',
    template: `
<div class="fader" [class.auto]="automated" [class.rec]="autoRecording" [class.h]="horizontal" [class.drag]="dragging" [class.focus]="focused"
    [style.height.px]="horizontal ? null : length" [style.width.px]="horizontal ? length : null"
    (pointerdown)="down($event)" (dblclick)="reset()" [title]="tooltip">
    <div class="slot">
        <span class="mark" *ngFor="let m of marks" [style.bottom.%]="horizontal ? null : m" [style.left.%]="horizontal ? m : null"></span>
        <div class="fill" [style.height.%]="horizontal ? null : fillPct" [style.width.%]="horizontal ? fillPct : null"></div>
    </div>
    <div class="cap" [style.bottom.%]="horizontal ? null : norm * 100" [style.left.%]="horizontal ? norm * 100 : null"><i></i></div>
    <input class="native" type="range" [class]="'native ' + (inputClass || '')" [min]="min" [max]="max" [step]="nativeStep" [value]="value"
        (input)="onNative($event.target.valueAsNumber)" (focus)="focused = true" (blur)="focused = false"
        [attr.aria-label]="ariaLabel" [attr.aria-orientation]="horizontal ? 'horizontal' : 'vertical'">
</div>`,
    styles: [`
:host { display: inline-block; }
.fader.auto .fill { background: var(--info); }
.fader.rec .fill { background: var(--danger); }
.fader { position: relative; width: 26px; touch-action: none; user-select: none; -webkit-user-select: none; cursor: pointer; }
.fader.h { height: 26px; }
.slot { position: absolute; left: 50%; top: 6px; bottom: 6px; width: 6px; transform: translateX(-50%); border-radius: 3px;
    background: #0a0b14; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 0 1px #2d3256; }
.h .slot { left: 6px; right: 6px; top: 50%; bottom: auto; width: auto; height: 6px; transform: translateY(-50%); }
.fill { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 3px; background: linear-gradient(to top, var(--accent), #ff9ab9);
    box-shadow: 0 0 6px rgba(255, 79, 135, 0.5); }
.h .fill { right: auto; top: 0; height: auto; background: linear-gradient(to right, var(--accent), #ff9ab9); }
.mark { position: absolute; left: -7px; width: 20px; height: 1px; background: rgba(255, 255, 255, 0.13); pointer-events: none; }
.h .mark { top: -7px; left: auto; width: 1px; height: 20px; }
.cap { position: absolute; left: 50%; width: 24px; height: 14px; margin: 0 0 -7px -12px; border-radius: 3px;
    background: linear-gradient(#5b639a, #2b3158); border: 1px solid #7a83c4; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center; pointer-events: none; }
.cap i { display: block; width: 14px; height: 2px; background: #fff; border-radius: 1px; opacity: 0.9; }
.h .cap { bottom: auto; top: 50%; width: 14px; height: 24px; margin: -12px 0 0 -7px; }
.h .cap i { width: 2px; height: 14px; }
.fader:hover .cap, .fader.drag .cap { border-color: var(--accent); }
.fader.focus .cap { border-color: var(--info); }
.native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; margin: 0; }
`]
})
export class FaderComponent {
    @Input() value = 0;
    @Input() min = 0;
    @Input() max = 1;
    @Input() step = 0;
    @Input() default: number;
    @Input() horizontal = false;
    @Input() length = 130;
    @Input() unit = '';
    @Input() label = '';
    @Input() ariaLabel = '';
    @Input() inputClass = '';
    @Input() format: (v: number) => string;
    // Para automatizar: el id del dispositivo y del parametro (si no se indican, el control no se automatiza)
    @Input() autoModule = '';
    @Input() autoParam = '';
    @Output() valueChange = new EventEmitter<number>();

    public dragging = false;
    public focused = false;
    public marks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    private grab = 0;   // distancia entre el punto tocado y el centro del capuchon (para no saltar al arrastrarlo)

    constructor(@Optional() private automation: AutomationService) {}

    private get autoOn(): boolean {
        return !!this.automation && !!this.autoModule && !!this.autoParam;
    }

    /** Tiene movimientos grabados / se esta grabando ahora (para pintar el control). */
    get automated(): boolean {
        return this.autoOn && this.automation.hasLane(this.autoModule, this.autoParam);
    }

    get autoRecording(): boolean {
        return this.autoOn && this.automation.isRecording(this.autoModule, this.autoParam);
    }

    // Todo cambio hecho por el usuario sale por aca, asi tambien llega a la automatizacion
    private emitChange(v: number) {
        this.valueChange.emit(v);
        if (this.autoOn)
            this.automation.change(this.autoModule, this.autoParam, v);
    }

    private autoBegin() {
        if (this.autoOn)
            this.automation.begin(this.autoModule, this.autoParam);
    }

    private autoEnd() {
        if (this.autoOn)
            this.automation.end(this.autoModule, this.autoParam);
    }

    get nativeStep(): number {
        return this.step > 0 ? this.step : (this.max - this.min) / 200;
    }

    get norm(): number {
        return toNorm(this.value, this.min, this.max, false);
    }

    get fillPct(): number {
        return this.norm * 100;
    }

    get tooltip(): string {
        const text = this.format ? this.format(this.value) : formatValue(this.value, this.nativeStep, this.unit);
        return (this.label ? this.label + ': ' : '') + text + ' (arrastra; doble clic = valor por defecto)';
    }

    // Posicion normalizada de un punto de la pantalla sobre la ranura (0..1)
    private normAt(e: PointerEvent, el: HTMLElement): number {
        const r = el.getBoundingClientRect();
        const travel = (this.horizontal ? r.width : r.height) - 12;   // la ranura deja 6 px de margen en cada punta
        const pos = this.horizontal ? e.clientX - r.left - 6 : r.bottom - 6 - e.clientY;
        return Math.max(0, Math.min(1, travel > 0 ? pos / travel : 0));
    }

    down(e: PointerEvent) {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        this.dragging = true;
        this.autoBegin();
        // Si se agarra el capuchon se arrastra desde donde estaba; si se toca la ranura, salta ahi
        const at = this.normAt(e, el);
        this.grab = Math.abs(at - this.norm) < 0.08 ? at - this.norm : 0;
        this.apply(at - this.grab);
        el.setPointerCapture(e.pointerId);
        const input = el.querySelector('input') as HTMLElement;
        if (input)
            input.focus();
    }

    @HostListener('pointermove', ['$event'])
    move(e: PointerEvent) {
        if (!this.dragging)
            return;
        this.apply(this.normAt(e, (e.currentTarget as HTMLElement).querySelector('.fader') as HTMLElement) - this.grab);
    }

    @HostListener('pointerup')
    @HostListener('pointercancel')
    up() {
        if (this.dragging)
            this.autoEnd();
        this.dragging = false;
    }

    @HostListener('wheel', ['$event'])
    wheel(e: WheelEvent) {
        e.preventDefault();
        this.apply(this.norm + (e.deltaY < 0 ? 0.02 : -0.02));
    }

    private apply(norm: number) {
        const v = fromNorm(norm, this.min, this.max, false, this.step);
        if (v !== this.value)
            this.emitChange(v);
    }

    reset() {
        const d = this.default !== undefined ? this.default : this.min;
        if (d !== this.value)
            this.emitChange(d);
    }

    onNative(v: number) {
        if (isFinite(v))
            this.emitChange(v);
    }
}
