import { Subscription } from 'rxjs';
import { RackModule } from './module';
import { CableModel, ModuleEnv, PortKind } from './types';
import { MODULE_META, createModule, moduleMeta } from '../modules/registry';

export interface ConnectResult {
    ok: boolean;
    error?: string;
    cable?: CableModel;
}

const MAX_MODULES = 40;

/**
 * El grafo del rack: los dispositivos y los cables entre ellos. Es TypeScript puro (no sabe de
 * Angular ni de la pantalla), asi tambien se arma sobre un OfflineAudioContext para exportar a WAV.
 *
 * Los cables de audio conectan nodos de WebAudio de verdad; los de notas reenvian mensajes.
 */
export class RackGraph {
    public modules: Array<RackModule> = [];
    public cables: Array<CableModel> = [];

    private noteSubs = new Map<string, Subscription>();
    private nextModuleId = 1;
    private nextCableId = 1;

    constructor(public env: ModuleEnv) {}

    // --- Dispositivos ---

    find(id: string): RackModule | undefined {
        return this.modules.find(m => m.id == id);
    }

    ofType<T extends RackModule>(type: string): Array<T> {
        return this.modules.filter(m => m.type == type) as Array<T>;
    }

    /** Agrega un dispositivo. Devuelve null si el tipo no existe, si es unico y ya esta, o si hay demasiados. */
    add(type: string, id?: string): RackModule | null {
        const meta = moduleMeta(type);
        if (!meta || this.modules.length >= MAX_MODULES)
            return null;
        if (meta.unique && this.modules.some(m => m.type == type))
            return null;
        const module = createModule(type, this.env);
        if (!module)
            return null;
        module.id = id && !this.find(id) ? id : 'm' + this.nextModuleId;
        this.nextModuleId = Math.max(this.nextModuleId, (parseInt(module.id.replace(/\D/g, ''), 10) || 0) + 1);
        const same = this.modules.filter(m => m.type == type).length + 1;
        module.name = meta.unique ? meta.label : meta.label + ' ' + same;
        this.modules.push(module);
        return module;
    }

    remove(id: string) {
        const module = this.find(id);
        if (!module)
            return;
        this.cables.filter(c => c.fromModule == id || c.toModule == id).forEach(c => this.disconnect(c.id));
        this.modules = this.modules.filter(m => m !== module);
        module.dispose();
    }

    // --- Cables ---

    cablesOf(moduleId: string, portId?: string): Array<CableModel> {
        return this.cables.filter(c =>
            (c.fromModule == moduleId && (!portId || c.fromPort == portId)) ||
            (c.toModule == moduleId && (!portId || c.toPort == portId)));
    }

    /** Valida un cable. Siempre va de una salida a una entrada del mismo tipo, sin repetirse ni formar bucles. */
    canConnect(fromModule: string, fromPort: string, toModule: string, toPort: string): ConnectResult {
        const from = this.find(fromModule), to = this.find(toModule);
        if (!from || !to)
            return { ok: false, error: 'El dispositivo no existe' };
        const a = from.portDef(fromPort), b = to.portDef(toPort);
        if (!a || !b)
            return { ok: false, error: 'El puerto no existe' };
        if (a.dir != 'out' || b.dir != 'in')
            return { ok: false, error: 'Un cable va de una salida a una entrada' };
        if (a.kind != b.kind)
            return { ok: false, error: 'No se puede unir ' + (a.kind == 'audio' ? 'audio con notas' : 'notas con audio') };
        if (this.cables.some(c => c.fromModule == fromModule && c.fromPort == fromPort && c.toModule == toModule && c.toPort == toPort))
            return { ok: false, error: 'Ese cable ya existe' };
        if (this.reaches(a.kind, toModule, fromModule))
            return { ok: false, error: 'Ese cable crearia un bucle' };
        return { ok: true };
    }

    // Hay camino de `start` a `target` siguiendo los cables de ese tipo? (tambien detecta unirse a si mismo)
    private reaches(kind: PortKind, start: string, target: string): boolean {
        if (start == target)
            return true;
        const seen = new Set<string>();
        const stack = [start];
        while (stack.length) {
            const id = stack.pop();
            if (id == target)
                return true;
            if (seen.has(id))
                continue;
            seen.add(id);
            const mod = this.find(id);
            this.cables.forEach(c => {
                if (c.fromModule != id)
                    return;
                const p = mod && mod.portDef(c.fromPort);
                if (p && p.kind == kind)
                    stack.push(c.toModule);
            });
        }
        return false;
    }

    connect(fromModule: string, fromPort: string, toModule: string, toPort: string): ConnectResult {
        const check = this.canConnect(fromModule, fromPort, toModule, toPort);
        if (!check.ok)
            return check;
        const from = this.find(fromModule), to = this.find(toModule);
        const kind = from.portDef(fromPort).kind;
        const cable: CableModel = { id: 'c' + this.nextCableId++, fromModule, fromPort, toModule, toPort };
        if (kind == 'audio') {
            const out = from.audioPort(fromPort), input = to.audioPort(toPort);
            if (!out || !input)
                return { ok: false, error: 'El puerto no tiene audio' };
            out.connect(input);
        } else {
            this.noteSubs.set(cable.id, from.noteOut.subscribe(msg => to.receive(msg, toPort)));
        }
        this.cables.push(cable);
        this.env.changed();
        return { ok: true, cable };
    }

    disconnect(cableId: string) {
        const cable = this.cables.find(c => c.id == cableId);
        if (!cable)
            return;
        const from = this.find(cable.fromModule), to = this.find(cable.toModule);
        const sub = this.noteSubs.get(cableId);
        if (sub) {
            sub.unsubscribe();
            this.noteSubs.delete(cableId);
            // Al soltar el cable de notas no pueden quedar notas colgadas en el instrumento
            if (to)
                to.receive({ type: 'allOff' }, cable.toPort);
        } else if (from && to) {
            const out = from.audioPort(cable.fromPort), input = to.audioPort(cable.toPort);
            if (out && input) {
                try {
                    out.disconnect(input);
                } catch (e) {
                    // ya estaba desconectado
                }
            }
        }
        this.cables = this.cables.filter(c => c.id != cableId);
        this.env.changed();
    }

    disconnectPort(moduleId: string, portId: string) {
        this.cablesOf(moduleId, portId).forEach(c => this.disconnect(c.id));
    }

    // --- Estado ---

    clear() {
        this.cables.slice().forEach(c => this.disconnect(c.id));
        this.modules.slice().forEach(m => this.remove(m.id));
        this.nextModuleId = 1;
        this.nextCableId = 1;
    }

    getState() {
        return {
            modules: this.modules.map(m => ({ id: m.id, type: m.type, name: m.name, pos: m.pos, state: m.getState() })),
            cables: this.cables.map(c => ({ ...c }))
        };
    }

    /** Reemplaza todo por lo guardado. Valida cada dispositivo y cada cable: puede venir de un archivo. */
    setState(raw: any) {
        this.clear();
        const mods = raw && Array.isArray(raw.modules) ? raw.modules : [];
        mods.slice(0, MAX_MODULES).forEach((r: any) => {
            if (!r || typeof r != 'object' || typeof r.type != 'string')
                return;
            const id = typeof r.id == 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(r.id) ? r.id : undefined;
            const module = this.add(r.type, id);
            if (!module)
                return;
            if (typeof r.name == 'string' && r.name.trim())
                module.name = r.name.slice(0, 40);
            if (r.pos && typeof r.pos.x == 'number' && typeof r.pos.y == 'number' && isFinite(r.pos.x) && isFinite(r.pos.y))
                module.pos = { x: Math.max(0, Math.min(5000, r.pos.x)), y: Math.max(0, Math.min(5000, r.pos.y)) };
            module.setState(r.state);
        });
        const cables = raw && Array.isArray(raw.cables) ? raw.cables : [];
        cables.slice(0, 400).forEach((c: any) => {
            if (c && typeof c == 'object')
                this.connect(String(c.fromModule), String(c.fromPort), String(c.toModule), String(c.toPort));
        });
    }

    dispose() {
        this.clear();
    }

    get catalog() {
        return MODULE_META;
    }
}
