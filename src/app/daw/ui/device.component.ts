import { Component, Input } from '@angular/core';
import { RackService } from '../core/rack.service';
import { moduleMeta } from '../modules/registry';

/** Marco de un dispositivo en el rack: titulo, seleccion, mover, renombrar y quitar. */
@Component({
    selector: 'app-device',
    template: `
<div class="device" [class.selected]="rack.selectedId == module.id" (pointerdown)="rack.select(module.id)">
    <app-panel [panelId]="'dev-' + module.id" [heading]="module.name" [defaultOpen]="module.type == 'synth' || module.type == 'juno' || module.type == 'modeld' || module.type == 'acid' || module.type == 'polyfive' || module.type == 'rhythmeight' || module.type == 'sequencer' || module.type == 'recorder' || module.type == 'audioin'">
        <span panel-meta>{{ meta?.label }}</span>
        <span panel-actions>
            <button class="ghost icon" (click)="rename()" title="Renombrar" aria-label="Renombrar"><app-icon name="edit" [size]="13"></app-icon></button>
            <button class="ghost icon" *ngIf="rack.canDuplicate(module.id)" (click)="rack.duplicate(module.id)" title="Duplicar (con su sonido y sus pistas)" aria-label="Duplicar"><app-icon name="copy" [size]="13"></app-icon></button>
            <button class="ghost icon" (click)="rack.move(module.id, -1)" title="Subir en el rack" aria-label="Subir"><app-icon name="chevron-up" [size]="14"></app-icon></button>
            <button class="ghost icon" (click)="rack.move(module.id, 1)" title="Bajar en el rack" aria-label="Bajar"><app-icon name="chevron-down" [size]="14"></app-icon></button>
            <button class="ghost icon danger" (click)="remove()" title="Quitar del rack" aria-label="Quitar"><app-icon name="trash" [size]="13"></app-icon></button>
        </span>
        <ng-container [ngSwitch]="module.type">
            <app-synth-device *ngSwitchCase="'synth'" [module]="module"></app-synth-device>
            <app-juno-device *ngSwitchCase="'juno'" [module]="module"></app-juno-device>
            <app-modeld-device *ngSwitchCase="'modeld'" [module]="module"></app-modeld-device>
            <app-acid-device *ngSwitchCase="'acid'" [module]="module"></app-acid-device>
            <app-polyfive-device *ngSwitchCase="'polyfive'" [module]="module"></app-polyfive-device>
            <app-rhythmeight-device *ngSwitchCase="'rhythmeight'" [module]="module"></app-rhythmeight-device>
            <app-sequencer-device *ngSwitchCase="'sequencer'" [module]="module"></app-sequencer-device>
            <app-mixer-device *ngSwitchCase="'mixer'" [module]="module"></app-mixer-device>
            <app-audioin-device *ngSwitchCase="'audioin'" [module]="module"></app-audioin-device>
            <app-recorder-device *ngSwitchCase="'recorder'" [module]="module"></app-recorder-device>
            <app-keyboard-device *ngSwitchCase="'keyboard'" [module]="module"></app-keyboard-device>
            <app-output-device *ngSwitchCase="'output'" [module]="module"></app-output-device>
            <app-patchbay-device *ngSwitchCase="'splitter'" [module]="module"></app-patchbay-device>
            <app-patchbay-device *ngSwitchCase="'merger'" [module]="module"></app-patchbay-device>
            <app-effect-device *ngSwitchDefault [module]="module"></app-effect-device>
        </ng-container>
    </app-panel>
</div>`,
    styles: [`
:host { display: block; }
.device { border-radius: var(--radius); border: 1px solid transparent; }
.device.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-soft); }
.danger:hover:not(:disabled) { color: var(--danger); }
`]
})
export class DeviceComponent {
    @Input() module: any;

    constructor(public rack: RackService) {}

    get meta() {
        return moduleMeta(this.module.type);
    }

    rename() {
        const name = window.prompt('Nombre del dispositivo', this.module.name);
        if (name)
            this.rack.rename(this.module.id, name);
    }

    remove() {
        if (window.confirm('Quitar "' + this.module.name + '" del rack? Se borran tambien sus cables.'))
            this.rack.remove(this.module.id);
    }
}
