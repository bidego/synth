import { Component } from '@angular/core';
import { FaderComponent } from './fader.component';

/**
 * Deslizador del Juno-106: ranura negra con la escala 0-10 al costado y un capuchon gris con una marca blanca.
 * Hereda el arrastre, la rueda, el teclado y la automatizacion del fader.
 */
@Component({
    selector: 'app-juno-slider',
    template: `
<div class="fader jslider" [class.auto]="automated" [class.rec]="autoRecording" [class.drag]="dragging" [class.focus]="focused"
    [style.height.px]="length" (pointerdown)="down($event)" (dblclick)="reset()" [title]="tooltip">
    <div class="scale"><span *ngFor="let n of numbers" [style.bottom.%]="n * 10">{{ n }}</span></div>
    <div class="slot"><span class="mark" *ngFor="let n of numbers" [style.bottom.%]="n * 10"></span></div>
    <div class="cap" [style.bottom.%]="norm * 100"><i></i></div>
    <input class="native" type="range" [class]="'native ' + (inputClass || '')" [min]="min" [max]="max" [step]="nativeStep" [value]="value"
        (input)="onNative($event.target.valueAsNumber)" (focus)="focused = true" (blur)="focused = false" [attr.aria-label]="ariaLabel" aria-orientation="vertical">
</div>`,
    styles: [`
:host { display: inline-block; }
.jslider { position: relative; width: 44px; touch-action: none; user-select: none; -webkit-user-select: none; cursor: pointer; }
.scale span { position: absolute; left: 0; width: 12px; margin-bottom: -5px; font: 8px/10px var(--mono); color: #c9c9c4; text-align: right; }
.slot { position: absolute; left: 24px; top: 7px; bottom: 7px; width: 5px; transform: translateX(-50%); background: #050506; border-radius: 1px;
    box-shadow: inset 0 1px 2px #000, 0 0 0 1px #5a5b5f; }
.mark { position: absolute; left: -9px; width: 5px; height: 1px; background: #c9c9c4; }
.cap { position: absolute; left: 24px; width: 24px; height: 16px; margin: 0 0 -8px -12px; border-radius: 2px;
    background: linear-gradient(#8c8d92, #55565b 45%, #3a3b3f); border: 1px solid #1a1a1c; box-shadow: 0 2px 3px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.35);
    display: flex; align-items: center; justify-content: center; pointer-events: none; }
.cap i { display: block; width: 18px; height: 2px; background: #f4f4ee; box-shadow: 0 0 2px rgba(255, 255, 255, 0.5); }
.jslider:hover .cap, .jslider.drag .cap { border-color: #e8532b; }
.jslider.auto .cap i { background: var(--info); }
.jslider.rec .cap i { background: var(--danger); }
.jslider.focus .cap { border-color: var(--info); }
.native { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; margin: 0; }
`]
})
export class JunoSliderComponent extends FaderComponent {
    public numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
}
