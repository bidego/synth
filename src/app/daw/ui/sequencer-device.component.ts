import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { SequencerModule } from '../modules/sequencer.module';
import { SeqTrack } from '../core/note-sequencer';
import { LoopNote } from '../core/sequencer';
import { RackService } from '../core/rack.service';

/** Panel del secuenciador de notas: 4 pistas con su mini piano roll, su salida de notas y el editor. */
@Component({
    selector: 'app-sequencer-device',
    template: `
<div class="stack">
    <div class="inputs" title="De donde recibe notas para grabar">
        <span class="label">Recibe notas de</span>
        <span class="chip src" *ngFor="let c of rack.noteSources(module.id)">
            {{ rack.graph.find(c.fromModule)?.name }}
            <button class="ghost icon x" (click)="rack.disconnect(c.id)" title="Desconectar" [attr.aria-label]="'Desconectar ' + rack.graph.find(c.fromModule)?.name"><app-icon name="close" [size]="11"></app-icon></button>
        </span>
        <span class="none" *ngIf="!rack.noteSources(module.id).length">nada: conecta un teclado para grabar</span>
        <ng-container *ngFor="let k of keyboards">
            <button class="icon add" *ngIf="!rack.isNoteLinked(k.id, module.id)" (click)="rack.toggleNoteLink(k.id, module.id)" [title]="'Conectar ' + k.name">
                <app-icon name="plus" [size]="12"></app-icon> {{ k.name }}
            </button>
        </ng-container>
        <span class="sp"></span>
        <label class="chk" title="Lo que tocas suena tambien por la salida de la pista armada, para oir el instrumento mientras grabas">
            <input type="checkbox" [checked]="seq.thru" (change)="seq.setThru($event.target.checked)"> Oir lo que toco
        </label>
        <button class="arm icon" [class.on]="seq.armed" (click)="seq.toggleArmed()" title="Graba cuando el transporte graba">
            <app-icon name="rec" [size]="11"></app-icon> Armar
        </button>
    </div>

    <div class="track" *ngFor="let t of seq.tracks" [class.armed]="seq.armed && seq.armedId == t.id" [class.armedoff]="!seq.armed && seq.armedId == t.id"
        [class.muted]="t.muted" [class.editing]="seq.editingId == t.id">
        <button class="rec" [class.on]="seq.armedId == t.id" (click)="seq.arm(t)" title="Grabar en esta pista" aria-label="Elegir para grabar">R</button>
        <div class="name">
            <input class="nm" [value]="t.name" maxlength="30" (change)="seq.rename(t, $event.target.value)" [attr.aria-label]="'Nombre de ' + t.name">
            <small class="dest">
                <ng-container *ngIf="targets(t).length; else nodest">&rarr; <span *ngFor="let n of targets(t); let last = last">{{ n }}<ng-container *ngIf="!last">, </ng-container></span></ng-container>
                <ng-template #nodest>sin cable de salida</ng-template>
            </small>
        </div>
        <div class="roll" [style.backgroundSize]="gridSize">
            <i class="note" *ngFor="let n of t.notes" [style.left.%]="n.start / seq.loopBeats * 100" [style.width.%]="noteWidth(n)" [style.bottom.%]="noteBottom(n)"></i>
            <i class="playhead" *ngIf="seq.playing" [style.left.%]="seq.position * 100"></i>
        </div>
        <app-fader class="vol" [horizontal]="true" [length]="88" [min]="0" [max]="1" [step]="0.01" [default]="1" [value]="t.volume" (valueChange)="seq.setVolume(t, $event)" ariaLabel="Velocidad de la pista" label="Velocidad"></app-fader>
        <div class="tools">
            <button class="icon" [class.on]="seq.editingId == t.id" (click)="seq.toggleEditor(t)" title="Editar las notas en un piano roll">
                <app-icon name="edit" [size]="13"></app-icon><span class="txt">Editar</span>
            </button>
            <button [class.on]="t.muted" (click)="seq.toggleMute(t)" title="Silenciar" aria-label="Silenciar">M</button>
            <button class="icon" (click)="seq.undoTake(t)" title="Deshacer la ultima pasada de grabacion" aria-label="Deshacer la ultima pasada"><app-icon name="undo" [size]="13"></app-icon></button>
            <button (click)="seq.clearTrack(t)" title="Borrar todas las notas de la pista">Limpiar</button>
        </div>
    </div>

    <p class="hint">Apreta <kbd>Rec</kbd> con el secuenciador armado y toca: se graba en loop y se suma en cada vuelta.
       Cada pista sale por su propio cable (vista Cableado), asi una toca el Juno-106 y otra el Synth Studio.</p>

    <app-roll-editor [module]="module"></app-roll-editor>
</div>`,
    styles: [`
.stack { display: flex; flex-direction: column; gap: 8px; }
.inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; }
.chip.src { padding-right: 2px; color: var(--accent); border-color: rgba(255, 79, 135, 0.45); }
.x { padding: 1px 3px; }
.none { color: var(--dim); }
.add { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.sp { flex: 1; }
.chk { color: var(--dim); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.arm { display: inline-flex; align-items: center; gap: 5px; color: var(--danger); }
.arm.on { color: #fff; background: var(--danger); border-color: var(--danger); }
.track { display: grid; grid-template-columns: 30px 170px 1fr 90px auto; align-items: center; gap: 10px; padding: 6px 8px;
    border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(0, 0, 0, 0.22); }
.track.armed { border-color: var(--danger); }
.track.armedoff { border-color: var(--border-strong); }
.track.editing { background: rgba(92, 200, 255, 0.08); border-color: var(--info); }
.track.muted { opacity: 0.55; }
.rec { padding: 4px 0; font-weight: 700; }
.rec.on { background: var(--danger); border-color: var(--danger); color: #fff; }
.name { min-width: 0; line-height: 1.25; }
.nm { width: 100%; background: transparent; border: 1px solid transparent; color: var(--text); font-weight: 600; padding: 1px 4px; margin: -1px -4px; }
.nm:hover, .nm:focus { border-color: var(--border-strong); background: rgba(0, 0, 0, 0.3); }
.dest { display: block; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.roll { position: relative; height: 40px; min-width: 0; background-color: rgba(255, 255, 255, 0.04);
    background-image: linear-gradient(to right, rgba(255, 255, 255, 0.13) 1px, transparent 1px); border-radius: 3px; overflow: hidden; }
.note { position: absolute; height: 4px; min-width: 2px; background: var(--info); border-radius: 1px; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: 0.85; }
.vol { width: 90px; }
.tools { display: inline-flex; gap: 4px; }
.tools .icon { display: inline-flex; align-items: center; gap: 5px; }
.hint { margin: 0; color: var(--dim); font-size: 11px; }
@media (max-width: 900px) {
    .track { grid-template-columns: 28px 1fr auto; grid-template-areas: "rec name tools" "roll roll roll" "vol vol vol"; }
    .rec { grid-area: rec; } .name { grid-area: name; } .roll { grid-area: roll; } .vol { grid-area: vol; width: 100%; } .tools { grid-area: tools; }
    .tools .txt { display: none; }
}
`]
})
export class SequencerDeviceComponent implements OnInit, OnDestroy {
    @Input() module: SequencerModule;
    private timer: any;

    constructor(public rack: RackService) {}

    get seq() {
        return this.module.sequencer;
    }

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    /** A que instrumentos llega la salida de una pista. */
    targets(t: SeqTrack): Array<string> {
        return this.rack.graph.cablesOf(this.module.id, 'out' + t.id)
            .filter(c => c.fromModule == this.module.id)
            .map(c => { const m = this.rack.graph.find(c.toModule); return m ? m.name : '?'; });
    }

    // El playhead se mueve con el tiempo del audio: un tick de la zona alcanza para refrescar la vista
    ngOnInit() {
        this.timer = setInterval(() => {}, 50);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }

    get gridSize(): string {
        return 100 / this.seq.loopBeats + '% 100%';
    }

    noteBottom(n: LoopNote): number {
        return Math.max(0, Math.min(88, (n.midi - 24) / 72 * 88));
    }

    noteWidth(n: LoopNote): number {
        return Math.max(n.dur / this.seq.loopBeats * 100, 0.8);
    }
}
