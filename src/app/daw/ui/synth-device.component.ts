import { Component, Input } from '@angular/core';
import { SynthStudioModule } from '../modules/synth-studio.module';

/** Panel frontal de un Syntotec Synth Studio: teclado, secuenciador, editor de notas, sonido y efectos. */
@Component({
    selector: 'app-synth-device',
    template: `
<div class="stack">
    <app-piano [module]="module"></app-piano>

    <app-panel [panelId]="'seq-' + module.id" heading="Secuenciador">
        <span panel-meta>{{ module.sequencer.tracks.length }} {{ module.sequencer.tracks.length == 1 ? 'pista' : 'pistas' }}</span>
        <span panel-actions>
            <button class="arm icon" [class.on]="module.sequencer.armed" (click)="module.sequencer.armed = !module.sequencer.armed"
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
.arm { display: inline-flex; align-items: center; gap: 5px; color: var(--danger); }
.arm.on { color: #fff; background: var(--danger); border-color: var(--danger); }
.icon { display: inline-flex; align-items: center; gap: 5px; }
`]
})
export class SynthDeviceComponent {
    @Input() module: SynthStudioModule;

    get kindLabel(): string {
        switch (this.module.engine.patch.kind) {
            case 'sampler': return 'Instrumento de muestras reales';
            case 'kit': return 'Kit de bateria de muestras';
            case 'drums': return 'Percusion sintetizada';
            default: return 'Sintetizador';
        }
    }
}
