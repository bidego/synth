import { Component, ElementRef, HostListener } from '@angular/core';
import { ProjectService } from '../daw/core/project.service';
import { UiService } from '../services/ui.service';
import { SyncService } from '../daw/core/sync.service';

/** Menu de proyecto de la cabecera: guardar, abrir, importar y exportar. */
@Component({
    selector: 'app-project-menu',
    templateUrl: './project-menu.component.html',
    styleUrls: ['./project-menu.component.css']
})
export class ProjectMenuComponent {
    public passOptions = [1, 2, 4, 8];

    constructor(public project: ProjectService, public ui: UiService, public sync: SyncService, private host: ElementRef) {}

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

    /** Copia la clave de sincronizacion (para usarla en otro navegador). */
    async copyKey() {
        try {
            await navigator.clipboard.writeText(this.sync.key);
            this.project.message = 'Clave copiada: guardala en un lugar seguro';
        } catch (e) {
            this.project.message = 'No se pudo copiar: selecciona la clave a mano';
        }
    }

    async changeKey() {
        const key = window.prompt('Pega la clave de sincronizacion (64 caracteres). Los proyectos de esa clave se traeran a este navegador y los de aca se subiran a ella.');
        if (key === null)
            return;
        if (!(await this.project.useKey(key)))
            this.project.message = 'Esa clave no es valida (son 64 letras y numeros, de 0 a 9 y de a a f)';
    }

    savedAt(ms: number): string {
        return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }
}
