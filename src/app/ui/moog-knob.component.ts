import { Component, Input } from '@angular/core';
import { KnobComponent } from './knob.component';
import { polar } from './controls';

export type MoogScale = 'ten' | 'bipolar' | 'steps' | 'waves';

// Iconos de las ondas (caja de 14 x 10): triangulo, diente de tiburon, sierra, cuadrada, pulso ancho y pulso angosto
const WAVE_PATHS = [
    'M0 9 L7 1 L14 9',
    'M0 9 L10 1 L14 9',
    'M0 9 L12 1 L12 9 L14 9',
    'M0 9 L0 1 L7 1 L7 9 L14 9',
    'M0 9 L0 1 L4.6 1 L4.6 9 L14 9',
    'M0 9 L0 1 L2.1 1 L2.1 9 L14 9'
];

/**
 * Perilla del Model D: falda metalica, tapa negra con una raya blanca y la escala alrededor (numeros, posiciones o iconos de onda).
 * Hereda el arrastre, la rueda, el teclado y la automatizacion de la perilla comun.
 */
@Component({
    selector: 'app-moog-knob',
    template: `
<div class="mk" [class.drag]="dragging" [class.focus]="focused" (pointerdown)="down($event)" (dblclick)="reset()" [title]="tooltip">
    <svg class="dial" width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
        <line *ngFor="let t of ticks2" [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" [class.major]="t.major"></line>
        <text *ngFor="let n of texts" [attr.x]="n.x" [attr.y]="n.y" text-anchor="middle" dominant-baseline="central">{{ n.t }}</text>
        <path *ngFor="let w of waves" class="icon" [attr.d]="w.d" [attr.transform]="w.tf"></path>
        <circle cx="53.5" cy="55.5" r="29" class="shadow"></circle>
        <circle cx="52" cy="52" r="28" fill="url(#mk-skirt)" stroke="#050506" stroke-width="1.3"></circle>
        <circle cx="52" cy="52" r="22.4" fill="url(#mk-face)" stroke="#000" stroke-width="1"></circle>
        <g [attr.transform]="'rotate(' + angle + ' 52 52)'">
            <line x1="52.8" y1="46.2" x2="52.8" y2="26.4" class="ptr-shadow"></line>
            <line x1="52" y1="45" x2="52" y2="25.5" class="ptr"></line>
        </g>
    </svg>
    <span class="lbl">{{ label }}</span>
    <input class="native" type="range" [class]="'native ' + (inputClass || '')" [min]="min" [max]="max" [step]="nativeStep" [value]="value"
        (input)="onNative($event.target.valueAsNumber)" (focus)="focused = true" (blur)="focused = false" [attr.aria-label]="ariaLabel || label">
</div>`,
    styles: [`
:host { display: inline-block; width: 104px; height: 120px; }
.mk { position: relative; width: 104px; height: 120px; touch-action: none; user-select: none; -webkit-user-select: none; cursor: ns-resize; }
.dial { display: block; overflow: visible; }
line { stroke: rgba(244, 242, 234, 0.9); stroke-width: 1.1; }
line.major { stroke-width: 1.6; }
text { fill: #f4f2ea; font: 700 9.5px 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.icon { fill: none; stroke: #f4f2ea; stroke-width: 1.4; }
.shadow { fill: rgba(0, 0, 0, 0.6); }
.ptr { stroke: #f4f2ea; stroke-width: 2.6; stroke-linecap: round; }
.ptr-shadow { stroke: rgba(0, 0, 0, 0.55); stroke-width: 3.2; stroke-linecap: round; }
.mk:hover .ptr, .mk.drag .ptr { stroke: #ffd9b0; }
.mk.focus .dial { filter: drop-shadow(0 0 3px #5cc8ff); }
.lbl { position: absolute; left: 6px; right: 6px; top: 88px; text-align: center; color: #f4f2ea; font: 700 9.5px/1.15 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.02em; text-transform: uppercase; }
.native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; margin: 0; }
`]
})
export class MoogKnobComponent extends KnobComponent {
    @Input() scale: MoogScale = 'ten';
    @Input() steps: Array<string> = [];

    // Posicion de cada marca y de cada numero, icono o etiqueta (el angulo se mide desde arriba, en sentido horario)
    private at(prop: number, r: number) {
        return polar(52, 52, r, -135 + prop * 270);
    }

    get ticks2() {
        const out = [];
        const n = this.scale == 'steps' ? this.steps.length : this.scale == 'waves' ? 6 : 11;
        for (let i = 0; i < n; ++i) {
            const prop = n > 1 ? i / (n - 1) : 0;
            const major = (this.scale == 'ten' || this.scale == 'bipolar') ? i % 5 == 0 : true;
            const a = this.at(prop, major ? 33 : 34), b = this.at(prop, major ? (this.scale == 'steps' || this.scale == 'waves' ? 38 : 41) : 38);
            out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, major });
        }
        return out;
    }

    get texts() {
        if (this.scale == 'ten' || this.scale == 'bipolar') {
            const labels = this.scale == 'ten' ? ['0', '5', '10'] : ['-5', '0', '+5'];
            return [0, 0.5, 1].map((prop, i) => {
                const p = this.at(prop, prop == 0.5 ? 47 : 45);
                return { x: p.x, y: p.y, t: labels[i] };
            });
        }
        if (this.scale == 'steps') {
            const n = this.steps.length;
            return this.steps.map((t, i) => {
                const p = this.at(n > 1 ? i / (n - 1) : 0, 44);
                return { x: p.x, y: p.y, t };
            });
        }
        return [];
    }

    get waves() {
        if (this.scale != 'waves')
            return [];
        return WAVE_PATHS.map((d, i) => {
            const p = this.at(i / 5, 45);
            return { d, tf: 'translate(' + (p.x - 7) + ' ' + (p.y - 5) + ')' };
        });
    }
}
