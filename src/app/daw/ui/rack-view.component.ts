import { Component } from '@angular/core';
import { RackService } from '../core/rack.service';

/** Vista Rack: los dispositivos apilados, cada uno con su panel frontal. */
@Component({
    selector: 'app-rack-view',
    template: `
<div class="rack">
    <div class="empty" *ngIf="!rack.modules.length">
        <p><b>El rack esta vacio.</b></p>
        <p>Agrega dispositivos desde la pestana <b>Dispositivos</b> del panel lateral y conectalos en la vista <b>Cableado</b>.</p>
    </div>
    <app-device *ngFor="let m of rack.modules; trackBy: trackId" [module]="m"></app-device>
</div>`,
    styles: [`
.rack { display: flex; flex-direction: column; gap: 12px; }
.empty { padding: 30px; text-align: center; color: var(--dim); }
.empty b { color: var(--text); }
`]
})
export class RackViewComponent {
    constructor(public rack: RackService) {}

    trackId(index: number, m: { id: string }) {
        return m.id;
    }
}
