import { Injectable } from '@angular/core';

const STORAGE_KEY = 'synth.ui';

/** Estado de la interfaz compartido entre componentes (y recordado entre sesiones). */
@Injectable()
export class UiService {
    // Modo visual: se oculta todo y queda solo el arte VJ de fondo
    public zen = false;
    // Panel lateral de sonidos
    public sidebarOpen = true;
    // Panel de ayuda con los atajos y menu de proyecto de la cabecera
    public helpOpen = false;
    public menuOpen = false;
    // Paneles colapsables del area principal: id -> abierto
    public panels: { [id: string]: boolean } = {};
    // Secciones colapsables del panel de sonidos
    public sections: { [id: string]: boolean } = {};

    constructor() {
        // En pantallas angostas el panel lateral es un cajon: arranca cerrado
        this.sidebarOpen = !this.isNarrow();
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved == 'object') {
                if (typeof saved.sidebarOpen == 'boolean' && !this.isNarrow())
                    this.sidebarOpen = saved.sidebarOpen;
                if (saved.panels && typeof saved.panels == 'object')
                    this.panels = saved.panels;
                if (saved.sections && typeof saved.sections == 'object')
                    this.sections = saved.sections;
            }
        } catch (e) {}
    }

    isNarrow(): boolean {
        return typeof window != 'undefined' && window.innerWidth < 900;
    }

    toggleZen() {
        this.zen = !this.zen;
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        this.save();
    }

    toggleHelp() {
        this.helpOpen = !this.helpOpen;
    }

    isPanelOpen(id: string, fallback = true): boolean {
        return id in this.panels ? this.panels[id] : fallback;
    }

    togglePanel(id: string, fallback = true) {
        this.panels[id] = !this.isPanelOpen(id, fallback);
        this.save();
    }

    isSectionOpen(id: string, fallback = false): boolean {
        return id in this.sections ? this.sections[id] : fallback;
    }

    toggleSection(id: string, fallback = false) {
        this.sections[id] = !this.isSectionOpen(id, fallback);
        this.save();
    }

    private save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                sidebarOpen: this.sidebarOpen, panels: this.panels, sections: this.sections
            }));
        } catch (e) {}
    }
}
