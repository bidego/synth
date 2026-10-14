import { Component, ElementRef, HostListener } from '@angular/core';
import { ProjectService } from '../daw/core/project.service';
import { UiService } from '../services/ui.service';

/** Menu de proyecto de la cabecera: guardar, abrir, importar y exportar. */
@Component({
    selector: 'app-project-menu',
    templateUrl: './project-menu.component.html',
    styleUrls: ['./project-menu.component.css']
})
export class ProjectMenuComponent {
    public passOptions = [1, 2, 4, 8];

    constructor(public project: ProjectService, public ui: UiService, private host: ElementRef) {}

    toggle() {
        this.ui.menuOpen = !this.ui.menuOpen;
        if (this.ui.menuOpen)
            this.project.refreshSaved();
    }

    // Un clic fuera del menu lo cierra
    @HostListener('document:pointerdown', ['$event'])
    onOutside(event: Event) {
        if (this.ui.menuOpen && !this.host.nativeElement.contains(event.target))
            this.ui.menuOpen = false;
    }

    onImport(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0])
            this.project.importFile(input.files[0]);
        // Permite volver a elegir el mismo archivo
        input.value = '';
    }

    savedAt(ms: number): string {
        return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }
}
