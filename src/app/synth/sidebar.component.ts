import { Component } from '@angular/core';
import { RackService } from '../daw/core/rack.service';
import { MODULE_META } from '../daw/modules/registry';
import { CATEGORY_LABELS, ModuleMeta } from '../daw/core/types';
import { UiService } from '../services/ui.service';
import { PRESETS, Preset, makeSamplerPatch, makeKitPatch } from '../services/presets';
import { BANK_FONTS, FAMILIES, GM_PROGRAMS, DRUM_KITS, DrumKit } from '../services/gm';

interface Group {
    id: string;
    label: string;
    presets: Array<Preset>;
}

// Orden y nombre de las categorias de presets: primero lo que usa muestras reales
const CATEGORY_ORDER: Array<{ id: string; label: string }> = [
    { id: 'Sampled', label: 'Instrumentos de muestras' },
    { id: 'Kits', label: 'Baterias de muestras' },
    { id: 'Lead', label: 'Leads' },
    { id: 'Brass', label: 'Metales' },
    { id: 'Pad', label: 'Pads y cuerdas' },
    { id: 'Bass', label: 'Bajos' },
    { id: 'Keys', label: 'Teclas' },
    { id: 'Drums', label: 'Percusion sintetizada' },
    { id: 'FX', label: 'Efectos' }
];

const MAX_RESULTS = 60;

/** Panel lateral de sonidos: presets, banco de muestras GM y kits, con buscador. Colapsable. */
@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
    public query = '';
    public font = BANK_FONTS[0].id;
    public fonts = BANK_FONTS;
    public families = FAMILIES;
    public names = GM_PROGRAMS;
    public kits = DRUM_KITS;
    public groups: Array<Group>;

    public tab: 'sounds' | 'devices' = 'sounds';
    public deviceGroups: Array<{ label: string; items: Array<ModuleMeta> }>;

    constructor(public rack: RackService, public ui: UiService) {
        const order = ['instrument', 'io', 'mixing', 'effect', 'dynamics', 'patch'];
        this.deviceGroups = order.map(c => ({ label: CATEGORY_LABELS[c], items: MODULE_META.filter(m => m.category == c) }));
        this.groups = CATEGORY_ORDER
            .map(c => ({ id: c.id, label: c.label, presets: PRESETS.filter(p => p.category == c.id) }))
            .filter(g => g.presets.length);
    }

    /** Instrumento al que apuntan los sonidos: el Synth Studio seleccionado (o el primero). */
    get engine() {
        const synth = this.rack.activeSynth;
        return synth ? synth.engine : null;
    }

    /** Pista en foco del instrumento activo: los sonidos que se elijan le cambian el instrumento a ella. */
    get focusTrack() {
        const synth = this.rack.activeSynth;
        return synth ? synth.sequencer.selectedTrack : undefined;
    }

    releaseFocus() {
        const synth = this.rack.activeSynth;
        if (synth)
            synth.sequencer.select(null);
    }

    get activeName(): string {
        const synth = this.rack.activeSynth;
        return synth ? synth.name : '';
    }

    // --- Dispositivos ---

    countOf(type: string): number {
        return this.rack.modules.filter(m => m.type == type).length;
    }

    addDevice(meta: ModuleMeta) {
        this.rack.add(meta.type);
        this.afterPick();
    }

    // --- Busqueda ---

    private get q(): string {
        return this.query.trim().toLowerCase();
    }

    get searching(): boolean {
        return this.q.length > 0;
    }

    get presetResults(): Array<Preset> {
        return PRESETS.filter(p => (p.name + ' ' + p.category + ' ' + p.description).toLowerCase().indexOf(this.q) >= 0);
    }

    get programResults(): Array<number> {
        const found: Array<number> = [];
        for (let i = 0; i < GM_PROGRAMS.length && found.length < MAX_RESULTS; i++)
            if ((GM_PROGRAMS[i] + ' ' + FAMILIES[Math.floor(i / 8)]).toLowerCase().indexOf(this.q) >= 0)
                found.push(i);
        return found;
    }

    get kitResults(): Array<DrumKit> {
        return DRUM_KITS.filter(k => (k.label + ' kit bateria').toLowerCase().indexOf(this.q) >= 0);
    }

    get noResults(): boolean {
        return !this.presetResults.length && !this.programResults.length && !this.kitResults.length;
    }

    setQuery(value: string) {
        this.query = value;
    }

    // Esc: borra la busqueda y suelta el foco, para poder tocar enseguida (los campos de texto bloquean las notas)
    clearSearch(event: Event) {
        event.stopPropagation();
        this.query = '';
        (event.target as HTMLElement).blur();
    }

    // Enter: elige el primer resultado
    pickFirst(event: Event) {
        if (!this.searching)
            return;
        const preset = this.presetResults[0], program = this.programResults[0], kit = this.kitResults[0];
        if (preset)
            this.pickPreset(preset);
        else if (program !== undefined)
            this.pickProgram(program);
        else if (kit)
            this.pickKit(kit);
        else
            return;
        this.query = '';
        (event.target as HTMLElement).blur();
    }

    // --- Estado ---

    isCurrentPreset(p: Preset): boolean {
        return this.engine.patch.name == p.name;
    }

    isCurrentProgram(program: number): boolean {
        const p = this.engine.patch;
        return p.kind == 'sampler' && !!p.sample && p.sample.font == this.font && p.sample.id == program;
    }

    isCurrentKit(id: number): boolean {
        const p = this.engine.patch;
        return p.kind == 'kit' && !!p.sample && p.sample.id == id;
    }

    get fontLabel(): string {
        return this.fonts.filter(f => f.id == this.font).map(f => f.label)[0];
    }

    familyName(program: number): string {
        return FAMILIES[Math.floor(program / 8)];
    }

    programs(family: number): Array<number> {
        return [0, 1, 2, 3, 4, 5, 6, 7].map(i => family * 8 + i);
    }

    // Secciones: abiertas por defecto las de instrumentos de muestras y la del instrumento actual
    open(id: string, fallback = false): boolean {
        return this.ui.isSectionOpen(id, fallback);
    }

    toggle(id: string, fallback = false) {
        this.ui.toggleSection(id, fallback);
    }

    // --- Acciones ---

    pickPreset(p: Preset) {
        this.engine.loadPatch(p);
        this.afterPick();
    }

    pickProgram(program: number) {
        this.engine.loadPatch(makeSamplerPatch(this.font, program, GM_PROGRAMS[program]));
        this.afterPick();
    }

    pickKit(kit: DrumKit) {
        this.engine.loadPatch(makeKitPatch(kit.id, kit.label + ' Kit'));
        this.afterPick();
    }

    // En pantallas angostas el panel es un cajon: se cierra al elegir
    private afterPick() {
        if (this.ui.isNarrow() && this.ui.sidebarOpen)
            this.ui.toggleSidebar();
    }

    tag(p: Preset): string {
        return p.kind == 'sampler' ? 'MUESTRA' : p.kind == 'kit' ? 'KIT' : p.kind == 'drums' ? 'PERC' : 'SYNTH';
    }
}
