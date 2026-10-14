import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { KeyboardModule } from '../modules/keyboard.module';
import { RackService } from '../core/rack.service';
import { MidiService } from '../../services/midi.service';
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
    <div class="ctl">
        <app-knob label="Velocidad" [size]="46" [value]="module.velocity" [min]="0.1" [max]="1" [step]="0.01" [default]="1" (valueChange)="module.setVelocity($event)" ariaLabel="Velocidad de las teclas"></app-knob>
    </div>
    <label class="ctl chk"><input type="checkbox" [checked]="module.computerKeys" (change)="module.setComputerKeys($event.target.checked)"> Teclado de la computadora</label>
    <label class="ctl chk"><input type="checkbox" [checked]="module.midiIn" (change)="module.setMidiIn($event.target.checked)"> Controlador MIDI</label>
    <div class="midi" [class.ok]="midi.status == 'ready' && midi.devices.length" [class.bad]="midi.status != 'ready'">
        <i></i>
        <span><b>MIDI:</b> {{ midi.message }}<ng-container *ngIf="midi.lastEvent"> &middot; ultima nota {{ midi.lastEvent }}</ng-container></span>
        <span class="warn" *ngIf="midi.devices.length && !module.midiIn">&mdash; el controlador esta desactivado en este teclado: marca "Controlador MIDI"</span>
        <span class="warn" *ngIf="midi.devices.length && module.midiIn && !synths.length">&mdash; no hay instrumentos a donde mandar las notas</span>
    </div>
    <div class="targets">
        <span class="label">Envia a</span>
        <label class="tgt" *ngFor="let s of synths" [class.on]="rack.isNoteLinked(module.id, s.id)">
            <input type="checkbox" [checked]="rack.isNoteLinked(module.id, s.id)" (change)="rack.toggleNoteLink(module.id, s.id)">
            {{ s.name }}
        </label>
        <span class="none" *ngIf="!synths.length">no hay instrumentos en el rack</span>
    </div>
    <p class="hint">Marca varios instrumentos para tocarlos a la vez (capas) o ninguno para dejar el teclado mudo.
       Tambien se puede cablear en la vista Cableado. Flechas = octava &middot; Espacio = sustain.</p>
</div>`,
    styles: [`
.kb { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 26px; }
.ctl { display: inline-flex; align-items: center; gap: 8px; }
.ctl b { min-width: 24px; text-align: center; font-family: var(--mono); }
.chk { color: var(--dim); cursor: pointer; }
output { font-family: var(--mono); font-size: 11px; color: var(--dim); }
.targets { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.tgt { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; cursor: pointer; color: var(--dim); }
.tgt.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.none { color: var(--dim); font-size: 12px; }
.midi { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 12px; color: var(--dim); }
.midi i { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); }
.midi.ok i { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
.midi.bad i { background: var(--danger); }
.midi b { color: var(--text); }
.midi .warn { color: var(--warn); }
.hint { flex-basis: 100%; margin: 2px 0 0; color: var(--dim); font-size: 11px; }
`]
})
export class KeyboardDeviceComponent {
    @Input() module: KeyboardModule;

    constructor(public rack: RackService, public midi: MidiService) {}

    get synths() {
        return this.rack.synths;
    }
}

/** Salida de audio: nivel general y medidor. */
@Component({
    selector: 'app-output-device',
    template: `
<div class="out">
    <div class="ctl">
        <span class="label">Nivel</span>
        <app-fader [horizontal]="true" [length]="170" [min]="0" [max]="1.5" [step]="0.01" [default]="1" [value]="module.level" autoParam="level" [autoModule]="module.id" (valueChange)="module.setLevel($event)" ariaLabel="Nivel de salida"></app-fader>
        <output>{{ module.level | number:'1.2-2' }}</output>
    </div>
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
