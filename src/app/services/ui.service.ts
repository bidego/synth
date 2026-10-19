import { Injectable } from '@angular/core';

const STORAGE_KEY = 'synth.ui';
const USAGE_KEY = 'synth.usage';
/** Uso activo necesario para desbloquear el arte VJ (tambien se desbloquea con la palabra secreta) */
export const VJ_UNLOCK_MS = 5 * 60 * 1000;
const SECRET = 'activarvj';
// Solo cuenta el tiempo si hubo entrada del usuario en el ultimo minuto y la pestana esta visible
const IDLE_MS = 60 * 1000;
const TICK_MS = 2000;

/** Estado de la interfaz compartido entre componentes (y recordado entre sesiones). */
@Injectable()
export class UiService {
    // Modo visual: se oculta todo y queda solo el arte VJ de fondo
    public zen = false;
    // Panel lateral de sonidos
    public sidebarOpen = false;
    // Vista del area principal: el rack (paneles frontales) o el cableado (grafo de cables)
    public view: 'rack' | 'patch' = 'rack';
    // Panel de ayuda con los atajos y menu de proyecto de la cabecera
    public helpOpen = false;
    public menuOpen = false;
    // Transporte: barra completa, compacta (una linea) o flotante (ventanita arrastrable)
    public transportMode: 'full' | 'compact' | 'floating' = 'compact';
    // Linea de tiempo (debajo del transporte), colapsable
    public timelineOpen = true;
    public floatPos: { x: number; y: number } = { x: -1, y: -1 };   // -1: posicion por defecto (arriba a la derecha)
    // Paneles colapsables del area principal: id -> abierto
    public panels: { [id: string]: boolean } = {};
    // Secciones colapsables del panel de sonidos
    public sections: { [id: string]: boolean } = {};
    // Arte VJ: premio por usar la plataforma (tiempo de uso activo acumulado) o por la palabra secreta
    public vjUnlocked = false;
    public usageMs = 0;
    public toastText = '';
    private toastTimer: any;
    private typed = '';
    private lastInput = Date.now();
    private lastTick = Date.now();
    private lastSave = 0;

    constructor() {
        try {
            const usage = JSON.parse(localStorage.getItem(USAGE_KEY));
            if (usage && typeof usage == 'object') {
                this.usageMs = Math.max(0, Number(usage.ms) || 0);
                this.vjUnlocked = usage.unlocked === true;
            }
        } catch (e) {}
        if (this.usageMs >= VJ_UNLOCK_MS)
            this.vjUnlocked = true;
        if (typeof window != 'undefined') {
            ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'].forEach(name =>
                window.addEventListener(name, () => this.lastInput = Date.now(), { passive: true, capture: true } as any));
            setInterval(() => this.tick(), TICK_MS);
        }
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved == 'object') {
                if (typeof saved.sidebarOpen == 'boolean' && !this.isNarrow())
                    this.sidebarOpen = saved.sidebarOpen;
                if (saved.view == 'rack' || saved.view == 'patch')
                    this.view = saved.view;
                if (['full', 'compact', 'floating'].indexOf(saved.transportMode) >= 0)
                    this.transportMode = saved.transportMode;
                if (typeof saved.timelineOpen == 'boolean')
                    this.timelineOpen = saved.timelineOpen;
                if (saved.floatPos && isFinite(saved.floatPos.x) && isFinite(saved.floatPos.y))
                    this.floatPos = { x: saved.floatPos.x, y: saved.floatPos.y };
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
        if (!this.vjUnlocked) {
            this.toast('El arte VJ es un premio: faltan ' + this.vjRemainingLabel + ' de uso... o conoces la palabra magica');
            return;
        }
        this.zen = !this.zen;
    }

    get vjRemainingMs(): number {
        return Math.max(0, VJ_UNLOCK_MS - this.usageMs);
    }

    get vjRemainingLabel(): string {
        const s = Math.ceil(this.vjRemainingMs / 1000);
        return s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s';
    }

    /** Ultimas teclas (minusculas) para detectar la palabra secreta, incluso escribiendo en un campo de texto */
    feedSecret(key: string) {
        if (this.vjUnlocked || !key || key.length != 1)
            return;
        this.typed = (this.typed + key.toLowerCase()).slice(-SECRET.length);
        if (this.typed == SECRET)
            this.unlockVj('Arte VJ desbloqueado. Esc activa el modo visual');
    }

    unlockVj(message: string) {
        if (this.vjUnlocked)
            return;
        this.vjUnlocked = true;
        this.saveUsage(true);
        this.toast(message);
    }

    toast(text: string, ms = 4000) {
        this.toastText = text;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.toastText = '', ms);
    }

    private tick() {
        const now = Date.now();
        const elapsed = Math.min(now - this.lastTick, TICK_MS * 2);
        this.lastTick = now;
        if (this.vjUnlocked || document.hidden || now - this.lastInput > IDLE_MS)
            return;
        this.usageMs += elapsed;
        if (this.usageMs >= VJ_UNLOCK_MS)
            this.unlockVj('Arte VJ desbloqueado: 5 minutos de uso. Esc activa el modo visual');
        else if (now - this.lastSave > 10000)
            this.saveUsage();
    }

    private saveUsage(force = false) {
        this.lastSave = Date.now();
        try {
            localStorage.setItem(USAGE_KEY, JSON.stringify({ ms: Math.round(this.usageMs), unlocked: this.vjUnlocked }));
        } catch (e) {}
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        this.save();
    }

    setView(view: 'rack' | 'patch') {
        this.view = view;
        this.save();
    }

    setTransportMode(mode: 'full' | 'compact' | 'floating') {
        this.transportMode = mode;
        this.save();
    }

    toggleTimeline() {
        this.timelineOpen = !this.timelineOpen;
        this.save();
    }

    setFloatPos(x: number, y: number) {
        this.floatPos = { x: Math.round(x), y: Math.round(y) };
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
                sidebarOpen: this.sidebarOpen, view: this.view, transportMode: this.transportMode, timelineOpen: this.timelineOpen, floatPos: this.floatPos, panels: this.panels, sections: this.sections
            }));
        } catch (e) {}
    }
}
