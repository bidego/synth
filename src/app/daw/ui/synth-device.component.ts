import { Component, Input } from '@angular/core';
import { SynthStudioModule } from '../modules/synth-studio.module';
import { RackService } from '../core/rack.service';

/** Panel frontal de un Syntotec Synth Studio: teclado, secuenciador, editor de notas, sonido y efectos. */
@Component({
    selector: 'app-synth-device',
    template: `
<div class="stack">
    <div class="inputs" title="De donde recibe notas este instrumento">
        <span class="label">Recibe notas de</span>
        <span class="chip src" *ngFor="let c of rack.noteSources(module.id)">
            {{ rack.graph.find(c.fromModule)?.name }}
            <button class="ghost icon x" (click)="rack.disconnect(c.id)" title="Desconectar" [attr.aria-label]="'Desconectar ' + rack.graph.find(c.fromModule)?.name"><app-icon name="close" [size]="11"></app-icon></button>
        </span>
        <span class="none" *ngIf="!rack.noteSources(module.id).length">nada (solo el piano de abajo)</span>
        <ng-container *ngFor="let k of keyboards">
            <button class="icon add" *ngIf="!rack.isNoteLinked(k.id, module.id)" (click)="rack.toggleNoteLink(k.id, module.id)" [title]="'Conectar ' + k.name">
                <app-icon name="plus" [size]="12"></app-icon> {{ k.name }}
            </button>
        </ng-container>
    </div>
    <app-piano [module]="module"></app-piano>

    <app-panel [panelId]="'seq-' + module.id" heading="Secuenciador">
        <span panel-meta>{{ module.sequencer.tracks.length }} {{ module.sequencer.tracks.length == 1 ? 'pista' : 'pistas' }}</span>
        <span panel-actions>
            <button class="arm icon" [class.on]="module.sequencer.armed" (click)="module.sequencer.toggleArmed()"
                title="Este instrumento graba cuando el transporte graba">
                <app-icon name="rec" [size]="11"></app-icon> Armar
            </button>
            <button class="icon" (click)="module.sequencer.addTrack()" title="Nueva pista (usa el sonido actual)">
                <app-icon name="plus" [size]="13"></app-icon> Pista
            </button>
        </span>
        <app-looper [module]="module"></app-looper>
    </app-panel>

    <app-roll-editor [module]="module"></app-roll-editor>

    <app-panel [panelId]="'patch-' + module.id" heading="Sonido">
        <span panel-meta>{{ kindLabel }}</span>
        <app-synth-panel [module]="module"></app-synth-panel>
    </app-panel>

    <app-panel [panelId]="'fx-' + module.id" heading="Efectos del instrumento" [defaultOpen]="false">
        <app-fx [module]="module"></app-fx>
    </app-panel>
</div>`,
    styles: [`
.stack { display: flex; flex-direction: column; gap: 10px; }
.inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; }
.chip.src { padding-right: 2px; color: var(--accent); border-color: rgba(255, 79, 135, 0.45); }
.x { padding: 1px 3px; }
.none { color: var(--dim); }
.add { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.arm { display: inline-flex; align-items: center; gap: 5px; color: var(--danger); }
.arm.on { color: #fff; background: var(--danger); border-color: var(--danger); }
.icon { display: inline-flex; align-items: center; gap: 5px; }
`]
})
export class SynthDeviceComponent {
    @Input() module: SynthStudioModule;

    constructor(public rack: RackService) {}

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    get kindLabel(): string {
        switch (this.module.engine.patch.kind) {
            case 'sampler': return 'Instrumento de muestras reales';
            case 'kit': return 'Kit de bateria de muestras';
            case 'drums': return 'Percusion sintetizada';
            default: return 'Sintetizador';
        }
    }
}
