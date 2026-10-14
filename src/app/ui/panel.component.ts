import { Component, Input } from '@angular/core';
import { UiService } from '../services/ui.service';

/**
 * Panel colapsable del area principal. El estado abierto/cerrado se recuerda entre sesiones.
 * Contenido: el cuerpo (ng-content), mas `[panel-meta]` junto al titulo y `[panel-actions]` a la derecha.
 */
@Component({
    selector: 'app-panel',
    template: `
<section class="panel" [class.collapsed]="!open">
    <header>
        <button class="ghost toggle" (click)="toggle()" [attr.aria-expanded]="open" [title]="open ? 'Colapsar' : 'Expandir'">
            <app-icon [name]="open ? 'chevron-down' : 'chevron-right'" [size]="14"></app-icon>
            <h2>{{ heading }}</h2>
        </button>
        <span class="meta"><ng-content select="[panel-meta]"></ng-content></span>
        <span class="spacer"></span>
        <span class="actions"><ng-content select="[panel-actions]"></ng-content></span>
    </header>
    <div class="body" [hidden]="!open"><ng-content></ng-content></div>
</section>`,
    styles: [`
:host { display: block; }
.panel {
    background: var(--panel);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border: 1px solid var(--border);
    border-radius: var(--radius);
}
header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 4px 4px;
}
.toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
}
h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
}
.meta { color: var(--dim); font-size: 12px; }
.spacer { flex: 1; }
.actions { display: inline-flex; align-items: center; gap: 6px; }
.body { padding: 4px 12px 12px; }
.collapsed header { padding-bottom: 4px; }
`]
})
export class PanelComponent {
    @Input() heading: string;
    @Input() panelId: string;
    @Input() defaultOpen = true;

    constructor(private ui: UiService) {}

    get open(): boolean {
        return this.ui.isPanelOpen(this.panelId, this.defaultOpen);
    }

    toggle() {
        this.ui.togglePanel(this.panelId, this.defaultOpen);
    }
}
