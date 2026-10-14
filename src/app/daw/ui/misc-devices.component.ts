import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { KeyboardModule } from '../modules/keyboard.module';
import { OutputModule } from '../modules/output.module';
import { SplitterModule, MergerModule } from '../modules/patchbay.module';

/** Teclado maestro: ajustes de la entrada de notas (computadora y MIDI). */
@Component({
    selector: 'app-keyboard-device',
    template: `
<div class="kb">
    <div class="ctl">
        <span class="label">Octava</span>
        <button class="icon" (click)="module.shiftOctave(-1)" aria-label="Octava abajo"><app-icon name="chevron-left" [size]="13"></app-icon></button>
        <b>{{ module.octave > 0 ? '+' : '' }}{{ module.octave }}</b>
        <button class="icon" (click)="module.shiftOctave(1)" aria-label="Octava arriba"><app-icon name="chevron-right" [size]="13"></app-icon></button>
    </div>
    <label class="ctl">
        <span class="label">Velocidad</span>
        <input type="range" min="0.1" max="1" step="0.01" [value]="module.velocity" (input)="module.velocity = $event.target.valueAsNumber" aria-label="Velocidad de las teclas">
        <output>{{ module.velocity | number:'1.2-2' }}</output>
    </label>
    <label class="ctl chk"><input type="checkbox" [checked]="module.computerKeys" (change)="module.computerKeys = $event.target.checked"> Teclado de la computadora</label>
    <label class="ctl chk"><input type="checkbox" [checked]="module.midiIn" (change)="module.midiIn = $event.target.checked"> Controlador MIDI</label>
    <p class="hint">Las notas salen por el puerto <b>Notas</b>: unilo con uno o mas Synth Studio en la vista Cableado.
       Flechas = octava &middot; Espacio = sustain.</p>
</div>`,
    styles: [`
.kb { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px; }
.ctl { display: inline-flex; align-items: center; gap: 8px; }
.ctl b { min-width: 24px; text-align: center; font-family: var(--mono); }
.chk { color: var(--dim); cursor: pointer; }
output { font-family: var(--mono); font-size: 11px; color: var(--dim); }
.hint { flex-basis: 100%; margin: 2px 0 0; color: var(--dim); font-size: 11px; }
`]
})
export class KeyboardDeviceComponent {
    @Input() module: KeyboardModule;
}

/** Salida de audio: nivel general y medidor. */
@Component({
    selector: 'app-output-device',
    template: `
<div class="out">
    <label class="ctl">
        <span class="label">Nivel</span>
        <input type="range" min="0" max="1.5" step="0.01" [value]="module.level" (input)="module.setLevel($event.target.valueAsNumber)" aria-label="Nivel de salida">
        <output>{{ module.level | number:'1.2-2' }}</output>
    </label>
    <div class="meter" title="Nivel de salida"><i [style.width.%]="level * 100"></i></div>
    <p class="hint">Todo lo que no llegue a esta salida por un cable no se escucha.</p>
</div>`,
    styles: [`
.out { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px; }
.ctl { display: inline-flex; align-items: center; gap: 8px; }
output { font-family: var(--mono); font-size: 11px; color: var(--dim); }
.meter { position: relative; width: 240px; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.meter i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(to right, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.hint { flex-basis: 100%; margin: 0; color: var(--dim); font-size: 11px; }
`]
})
export class OutputDeviceComponent implements OnInit, OnDestroy {
    @Input() module: OutputModule;
    public level = 0;
    private timer: any;

    ngOnInit() {
        this.timer = setInterval(() => this.level = this.module.peak(), 60);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }
}

/** Patcheras (splitter y merger): un mute por canal. */
@Component({
    selector: 'app-patchbay-device',
    template: `
<div class="pb">
    <div class="ch" *ngFor="let m of module.muted; let i = index">
        <span class="label">{{ module.type == 'splitter' ? 'Salida' : 'Entrada' }} {{ i + 1 }}</span>
        <button [class.mute]="m" (click)="module.toggleMute(i)">{{ m ? 'Silenciado' : 'Activo' }}</button>
    </div>
    <p class="hint">{{ module.type == 'splitter' ? 'Una entrada se reparte en cuatro salidas identicas.' : 'Cuatro entradas se suman en una salida.' }}</p>
</div>`,
    styles: [`
.pb { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; }
.ch { display: flex; flex-direction: column; gap: 4px; }
.mute { background: var(--warn); border-color: var(--warn); color: #000; }
.hint { flex-basis: 100%; margin: 0; color: var(--dim); font-size: 11px; }
`]
})
export class PatchbayDeviceComponent {
    @Input() module: SplitterModule | MergerModule;
}
