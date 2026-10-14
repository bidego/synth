import { AutomationService } from './automation.service';
import { SyncService } from './sync.service';
import { Injectable, NgZone } from '@angular/core';
import { RackService } from './rack.service';
import { RackGraph } from './rack-graph';
import { TransportService } from './transport.service';
import { ModuleEnv } from './types';
import { SampleLibrary } from '../../services/sample-library';
import { encodeWav } from '../../services/wav';
import { SynthStudioModule } from '../modules/synth-studio.module';
import { SHARE_PREFIX, SHARE_SOFT_LIMIT, encodeShare, decodeShare } from './share';

const SHORT_PREFIX = '#c=';
const PUBLIC_PREFIX = '#p=';
const DEMO_PREFIX = '#demo=';

/** Un proyecto completo: transporte + rack (dispositivos, ajustes, pistas y cables). */
export interface Project {
    version: number;
    name: string;
    transport: any;
    rack: any;
    automation?: any;
}

export interface PublicMeta {
    pid: string;
    author: string;
    description: string;
}

export interface SavedProject {
    name: string;
    savedAt: number;
    modules: number;
    data: any;
    pub?: PublicMeta;
}

const STORAGE_PROJECTS = 'synth.projects';
const STORAGE_AUTOSAVE = 'synth.autosave';
// Un render offline de mas de esto agotaria la memoria del navegador (estereo, float32)
const MAX_EXPORT_SECONDS = 600;
const EXPORT_TAIL = 2.5;   // cola de reverb y delay

/** Guardado (autoguardado, proyectos con nombre, archivos .json) y exportacion a WAV. */
@Injectable()
export class ProjectService {
    public projectName = '';
    public saved: Array<SavedProject> = [];
    public message = '';
    public exporting = false;
    public exportPasses = 1;
    // Enlace para compartir la sesion (ultimo generado)
    public shareUrl = '';
    public canNativeShare = typeof (navigator as any).share == 'function';

    private saveTimer: any;

    constructor(private rack: RackService, private transport: TransportService, private library: SampleLibrary,
                private audioCtx: AudioContext, private zone: NgZone, private automation: AutomationService,
                private sync: SyncService) {
        this.refreshSaved();
        // Se guarda solo, un instante despues del ultimo cambio
        rack.changed.subscribe(() => this.dirty());
        transport.changed.subscribe(() => this.dirty());
        automation.changed.subscribe(() => this.dirty());
        this.restoreAutosave();
        // Si se abrio un enlace compartido, esa sesion reemplaza a la restaurada; y si se pega otro enlace
        // en la misma pestana tambien
        this.loadFromHash();
        // Si hay servidor, los proyectos guardados se sincronizan (se traen los que faltan y se suben los nuevos)
        this.sync.check().then(ok => ok && this.reconcile());
        window.addEventListener('hashchange', () => this.zone.run(() => this.loadFromHash()));
    }

    // --- Estado ---

    toProject(): Project {
        return {
            version: 2,
            name: this.projectName,
            transport: this.transport.getState(),
            rack: this.rack.getState(),
            automation: this.automation.getState()
        };
    }

    /** Reemplaza todo por el proyecto dado (version 2, o 1 del looper de un solo instrumento). */
    load(raw: any): boolean {
        if (!raw || typeof raw != 'object')
            return false;
        // Los archivos del servidor (el repositorio de datos), los enlaces cortos y los proyectos publicos vienen envueltos:
        // { id, name, savedAt, data: <proyecto> }. Se acepta tambien ese formato, asi un archivo bajado del repo se puede importar.
        let envelopeName = '';
        if (!raw.rack && !Array.isArray(raw.tracks) && raw.data && typeof raw.data == 'object') {
            envelopeName = typeof raw.name == 'string' ? raw.name : '';
            raw = raw.data;
        }
        if (raw.rack && typeof raw.rack == 'object') {
            this.transport.stop();
            this.transport.setState(raw.transport);
            this.rack.setState(raw.rack);
            this.automation.setState(raw.automation);
        } else if (Array.isArray(raw.tracks)) {
            this.migrateV1(raw);
        } else {
            return false;
        }
        this.projectName = typeof raw.name == 'string' ? raw.name.slice(0, 40) : envelopeName.slice(0, 40);
        return true;
    }

    // El formato anterior era un solo instrumento con sus pistas: pasa a ser el rack por defecto con ese contenido
    private migrateV1(raw: any) {
        this.transport.stop();
        this.transport.setState({
            bpm: raw.bpm, bars: raw.bars, quantize: raw.quantize, metronome: raw.metronome, countIn: raw.countIn
        });
        this.rack.buildDefault();
        const synth = this.rack.synths[0];
        synth.setState({ fx: raw.fx, sequencer: { tracks: raw.tracks } });
        this.automation.setState({});
    }

    // --- Autoguardado ---

    private dirty() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.write(STORAGE_AUTOSAVE, this.toProject()), 400);
    }

    private restoreAutosave() {
        const data = this.read(STORAGE_AUTOSAVE);
        if (data && this.load(data)) {
            this.message = 'Sesion anterior restaurada';
        } else {
            this.rack.buildDefault();
        }
    }

    private read(key: string): any {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    private write(key: string, value: any): boolean {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            // Cuota llena o almacenamiento bloqueado
            this.message = 'No se pudo guardar en el navegador (usa Exportar .json)';
            return false;
        }
    }

    // --- Proyectos con nombre ---

    refreshSaved() {
        const all = this.read(STORAGE_PROJECTS) || {};
        this.saved = Object.keys(all)
            .map(name => {
                const data = all[name].data || {};
                const modules = data.rack && Array.isArray(data.rack.modules) ? data.rack.modules.length : 1;
                return { name, savedAt: all[name].savedAt, modules, data, pub: all[name].pub };
            })
            .sort((a, b) => b.savedAt - a.savedAt);
    }

    saveNamed() {
        const name = (this.projectName || '').trim().slice(0, 40);
        if (!name) {
            this.message = 'Escribi un nombre para el proyecto';
            return;
        }
        const all = this.read(STORAGE_PROJECTS) || {};
        if (all[name] && !window.confirm('Ya existe "' + name + '". Sobrescribir?'))
            return;
        this.projectName = name;
        all[name] = { savedAt: Date.now(), data: this.toProject(), pub: all[name] ? all[name].pub : undefined };
        if (this.write(STORAGE_PROJECTS, all)) {
            this.message = 'Guardado "' + name + '"';
            this.refreshSaved();
            this.sync.push(name, all[name].savedAt, all[name].data);
        }
    }

    loadNamed(name: string) {
        const s = this.saved.find(x => x.name == name);
        this.message = s && this.load(s.data) ? 'Cargado "' + name + '"' : 'No se pudo cargar "' + name + '"';
        this.dirty();
    }

    deleteNamed(name: string) {
        if (!window.confirm('Borrar "' + name + '"?'))
            return;
        const all = this.read(STORAGE_PROJECTS) || {};
        delete all[name];
        this.write(STORAGE_PROJECTS, all);
        this.refreshSaved();
        this.sync.remove(name);
    }

    // --- Sincronizacion con el servidor ---

    /** Pone al dia los proyectos guardados: trae los del servidor que faltan o son mas nuevos y sube los que el servidor no tiene. */
    async reconcile() {
        const remote = await this.sync.list();
        if (!remote)
            return;
        const all = this.read(STORAGE_PROJECTS) || {};
        let pulled = 0;
        for (const item of remote) {
            // Borrado aca y todavia sin confirmar en el servidor: no se vuelve a traer
            if (this.sync.isDeleted(item.name))
                continue;
            const local = all[item.name];
            if (!local || local.savedAt < item.savedAt) {
                const full = await this.sync.get(item.id);
                if (full && full.data && typeof full.savedAt == 'number') {
                    const meta = (full as any).public;
                    all[item.name] = {
                        savedAt: full.savedAt, data: full.data,
                        pub: item.pid && meta ? { pid: item.pid, author: meta.author || '', description: meta.description || '' } : undefined
                    };
                    pulled++;
                }
            }
        }
        const remoteByName: { [name: string]: { savedAt: number } } = {};
        remote.forEach(r => remoteByName[r.name] = r);
        // El estado de publicacion lo manda el servidor
        remote.forEach(r => {
            const l = all[r.name];
            if (l && r.pid && !l.pub)
                l.pub = { pid: r.pid, author: '', description: '' };
            else if (l && !r.pid && l.pub && r.savedAt >= l.savedAt)
                delete l.pub;
        });
        Object.keys(all).forEach(name => {
            const r = remoteByName[name];
            if (!r || r.savedAt < all[name].savedAt)
                this.sync.push(name, all[name].savedAt, all[name].data);
        });
        if (pulled && this.write(STORAGE_PROJECTS, all)) {
            this.refreshSaved();
            this.message = pulled == 1 ? 'Se trajo 1 proyecto del servidor' : 'Se trajeron ' + pulled + ' proyectos del servidor';
        }
        this.sync.markSynced();
    }

    /** Boton "Sincronizar ahora". */
    async syncNow() {
        if (await this.sync.check()) {
            this.sync.retryNow();
            await this.reconcile();
        } else {
            this.message = 'No se encontro el servidor';
        }
    }

    /** Cambia la clave de sincronizacion: los proyectos de esa clave se traen a este navegador. */
    async useKey(key: string): Promise<boolean> {
        if (!this.sync.setKey(key))
            return false;
        await this.syncNow();
        return true;
    }

    /** Proyecto nuevo: el rack inicial y el transporte por defecto. */
    newProject() {
        if (!window.confirm('Empezar un proyecto nuevo? Se pierde lo que no hayas guardado.'))
            return;
        this.transport.stop();
        this.transport.setState({});
        this.rack.buildDefault();
        this.automation.setState({});
        this.projectName = '';
        this.message = 'Proyecto nuevo';
        this.dirty();
    }

    // --- Compartir: la sesion completa dentro del hash de la URL ---

    // 'short': enlace corto (la sesion queda en el servidor); 'long': toda la sesion dentro del enlace
    public shareKind: 'short' | 'long' | '' = '';

    /**
     * El enlace para compartir la sesion. Con servidor es corto (#c=codigo: la sesion se guarda ahi);
     * sin servidor, o si falla, lleva toda la sesion adentro (#s=...) y funciona sin ningun servidor.
     */
    async buildShareLink(): Promise<string> {
        const base = location.origin + location.pathname + location.search;
        const project = this.toProject();
        const code = await this.sync.createShare((this.projectName || 'Sesion compartida').slice(0, 40), project);
        if (code) {
            this.shareKind = 'short';
            return base + SHORT_PREFIX + code;
        }
        this.shareKind = 'long';
        return base + SHARE_PREFIX + await encodeShare(JSON.stringify(project));
    }

    async copyShareLink() {
        try {
            this.shareUrl = await this.buildShareLink();
        } catch (e) {
            this.message = 'No se pudo armar el enlace: ' + (e && e.message || e);
            return;
        }
        const size = this.shareUrl.length;
        let copied = false;
        try {
            await navigator.clipboard.writeText(this.shareUrl);
            copied = true;
        } catch (e) {
            // Sin permiso del portapapeles: queda el enlace a la vista para copiarlo a mano
        }
        const big = this.shareKind == 'long' && size > SHARE_SOFT_LIMIT ? ' Es largo para un chat o un correo: si no entra, usa Exportar .json.' : '';
        const how = this.shareKind == 'short' ? 'Enlace corto' : 'Enlace';
        this.message = (copied ? how + ' copiado' : 'Copia el enlace de abajo') + ' (' + (size >= 1000 ? Math.round(size / 1000 * 10) / 10 + ' mil' : size) + ' caracteres).' + big;
    }

    /** El menu nativo de compartir del telefono o la computadora (si existe). */
    async nativeShare() {
        try {
            this.shareUrl = await this.buildShareLink();
            await (navigator as any).share({ title: 'Sesion de Syntotec' + (this.projectName ? ': ' + this.projectName : ''), url: this.shareUrl });
        } catch (e) {
            // El usuario cancelo el menu: no es un error
        }
    }

    // Abre la sesion de un enlace: #s=... (toda la sesion adentro), #c=codigo (enlace corto del servidor),
    // #p=id (proyecto publico) o #demo=nombre (proyecto de ejemplo). Es contenido no confiable: pasa por la misma
    // validacion que un archivo importado.
    private async loadFromHash() {
        const hash = location.hash;
        const kind = [SHARE_PREFIX, SHORT_PREFIX, PUBLIC_PREFIX, DEMO_PREFIX].find(p => hash.indexOf(p) == 0);
        if (!kind)
            return;
        const payload = hash.slice(kind.length);
        // El hash se saca de la URL enseguida: recargar no debe volver a pisar la sesion
        history.replaceState(null, '', location.pathname + location.search);
        try {
            let data: any, label = 'Sesion compartida abierta', name = '';
            if (kind == SHARE_PREFIX) {
                data = await decodeShare(payload);
            } else {
                const url = kind == SHORT_PREFIX && /^[0-9A-Za-z]{10}$/.test(payload) ? '/api/shares/' + payload
                    : kind == PUBLIC_PREFIX && /^p[a-f0-9]{14}$/.test(payload) ? '/api/public/' + payload
                    : kind == DEMO_PREFIX && /^[a-z0-9-]{1,40}$/.test(payload) ? '/demos/' + payload + '.json' : '';
                if (!url)
                    throw new Error('El enlace no es valido');
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok)
                    throw new Error(res.status == 404 ? 'El enlace no existe o ya no esta disponible' : 'No se pudo abrir el enlace (sin conexion con el servidor)');
                const body = await res.json();
                // Los compartidos y publicos traen { name, data }; los demos son el proyecto mismo
                data = body && body.data && !body.rack ? body.data : body;
                name = typeof body.name == 'string' ? body.name.slice(0, 40) : '';
                if (kind != SHORT_PREFIX)
                    label = (kind == DEMO_PREFIX ? 'Proyecto de ejemplo' : 'Proyecto publico') + (name ? ' "' + name + '"' : '') + ' abierto: apreta Play';
            }
            this.keepCurrentSession();
            const ok = this.load(data);
            if (ok && name)
                this.projectName = name;
            this.message = ok ? label : 'El enlace no contiene una sesion valida';
            this.dirty();
        } catch (e) {
            this.message = e && e.message || 'El enlace no es valido';
        }
        this.zone.run(() => {});
    }

    // --- Publicar: un proyecto guardado puede verse (y abrirse) por cualquiera y aparece en la landing ---

    /** Enlace publico directo a la app con el proyecto abierto. */
    publicLink(pid: string): string {
        return location.origin + location.pathname + PUBLIC_PREFIX + pid;
    }

    /** Publica un proyecto guardado (o actualiza su autor y descripcion). Devuelve el mensaje de error, o '' si salio bien. */
    async publish(name: string, author: string, description: string): Promise<string> {
        const all = this.read(STORAGE_PROJECTS) || {};
        const s = all[name];
        if (!s)
            return 'No se encontro el proyecto';
        const res = await this.sync.putNow(name, s.savedAt, s.data, { public: true, author, description });
        if (!res.pid)
            return res.error || 'No se pudo publicar';
        s.pub = { pid: res.pid, author, description };
        this.write(STORAGE_PROJECTS, all);
        this.refreshSaved();
        this.message = 'Publicado "' + name + '"';
        return '';
    }

    async unpublish(name: string): Promise<string> {
        const all = this.read(STORAGE_PROJECTS) || {};
        const s = all[name];
        if (!s)
            return 'No se encontro el proyecto';
        const res = await this.sync.putNow(name, s.savedAt, s.data, { public: false });
        if (res.error)
            return res.error;
        delete s.pub;
        this.write(STORAGE_PROJECTS, all);
        this.refreshSaved();
        this.message = '"' + name + '" ya no es publico';
        return '';
    }

    // Antes de reemplazar la sesion por la de un enlace, la actual (si tiene notas) queda como proyecto guardado
    private keepCurrentSession() {
        const cur = this.toProject();
        const hasNotes = cur.rack && Array.isArray(cur.rack.modules) && cur.rack.modules.some((m: any) =>
            m && m.type == 'synth' && m.state && m.state.sequencer && (m.state.sequencer.tracks || []).some((t: any) => t.notes && t.notes.length));
        if (!hasNotes)
            return;
        const all = this.read(STORAGE_PROJECTS) || {};
        const name = ('Antes del enlace (' + new Date().toLocaleString() + ')').slice(0, 40);
        all[name] = { savedAt: Date.now(), data: cur };
        if (this.write(STORAGE_PROJECTS, all))
            this.refreshSaved();
    }

    // --- Archivos ---

    exportFile() {
        const name = (this.projectName || 'proyecto').trim() || 'proyecto';
        this.download(new Blob([JSON.stringify(this.toProject(), null, 1)], { type: 'application/json' }), name + '.synth.json');
    }

    importFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => this.zone.run(() => {
            let data = null;
            try {
                data = JSON.parse(reader.result as string);
            } catch (e) {}
            this.message = data && this.load(data) ? 'Importado ' + file.name : 'El archivo no es un proyecto valido';
            this.dirty();
        });
        reader.readAsText(file);
    }

    // --- WAV ---

    get exportSeconds(): number {
        return this.transport.loopBeats * this.transport.beatDur * this.exportPasses + EXPORT_TAIL;
    }

    /**
     * Renderiza todo el rack a un WAV sin perdida. Es un render offline: se reconstruye el rack
     * (mismos dispositivos, ajustes y cables) sobre un OfflineAudioContext, asi no corre en tiempo
     * real, no interrumpe lo que se esta tocando y suena igual que el rack en vivo.
     */
    async exportWav() {
        const synths = this.rack.synths.filter(s => s.sequencer.hasNotes());
        if (this.exporting || !synths.length) {
            this.message = 'No hay nada para exportar (ningun instrumento tiene notas grabadas)';
            return;
        }
        if (!this.rack.graph.ofType('output').length) {
            this.message = 'Falta la salida de audio en el rack';
            return;
        }
        const seconds = this.exportSeconds;
        if (seconds > MAX_EXPORT_SECONDS) {
            this.message = 'Dura demasiado (' + Math.round(seconds) + ' s, maximo ' + MAX_EXPORT_SECONDS + '). Baja las repeticiones';
            return;
        }
        this.exporting = true;
        try {
            this.message = 'Preparando instrumentos...';
            // Los instrumentos de muestras tienen que estar cargados antes de renderizar
            await Promise.all(synths.map(s => Promise.all(
                s.sequencer.tracks.map(t => s.engine.preload(t.patch)))));
            this.message = 'Renderizando ' + Math.round(seconds) + ' s de audio...';
            await new Promise(resolve => setTimeout(resolve, 30));   // deja pintar el mensaje

            const rate = this.audioCtx.sampleRate;
            const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
            // Una copia fija del transporte: el render no depende del reloj en vivo
            const snapshot = { bpm: this.transport.bpm, transpose: this.transport.transpose, loopBeats: this.transport.loopBeats };
            const env: ModuleEnv = {
                ctx: offline, transport: snapshot, library: this.library, live: false,
                run: fn => fn(), changed: () => {}
            };
            const graph = new RackGraph(env);
            graph.setState(this.rack.getState());
            graph.ofType<SynthStudioModule>('synth').forEach(s => s.sequencer.renderPasses(this.exportPasses));
            this.scheduleAutomation(offline, graph, seconds);
            const rendered = await offline.startRendering();
            graph.dispose();
            const name = (this.projectName || 'loop').trim() || 'loop';
            this.download(encodeWav(rendered), name + '.wav');
            this.message = 'WAV exportado (' + Math.round(seconds) + ' s)';
        } catch (e) {
            this.message = 'No se pudo exportar: ' + (e && e.message || e);
        } finally {
            this.exporting = false;
        }
    }

    /** La automatizacion tambien suena en el WAV: se detiene el render cada 1/16 de beat para mover los controles. */
    private scheduleAutomation(offline: OfflineAudioContext, graph: RackGraph, seconds: number) {
        const lanes = this.automation.lanes.filter(l => l.enabled && l.points.length);
        if (!lanes.length)
            return;
        const beatDur = 60 / this.transport.bpm, loop = this.transport.loopBeats;
        const apply = (t: number) => {
            const beat = (t / beatDur) % loop;
            lanes.forEach(l => {
                const m = graph.find(l.module), v = this.automation.valueAt(l, beat);
                if (m && v !== null)
                    m.setAutoValue(l.param, v);
            });
        };
        apply(0);
        const step = beatDur / 16, quantum = 128 / offline.sampleRate;
        let last = 0;
        for (let t = step; t < seconds; t += step) {
            const at = Math.round(t / quantum) * quantum;
            if (at <= last)
                continue;
            last = at;
            offline.suspend(at).then(() => { apply(at); return offline.resume(); }).catch(() => {});
        }
    }

    private download(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
