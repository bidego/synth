import { Injectable, NgZone } from '@angular/core';
import { RackService } from './rack.service';
import { RackGraph } from './rack-graph';
import { TransportService } from './transport.service';
import { ModuleEnv } from './types';
import { SampleLibrary } from '../../services/sample-library';
import { encodeWav } from '../../services/wav';
import { SynthStudioModule } from '../modules/synth-studio.module';

/** Un proyecto completo: transporte + rack (dispositivos, ajustes, pistas y cables). */
export interface Project {
    version: number;
    name: string;
    transport: any;
    rack: any;
}

export interface SavedProject {
    name: string;
    savedAt: number;
    modules: number;
    data: any;
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

    private saveTimer: any;

    constructor(private rack: RackService, private transport: TransportService, private library: SampleLibrary,
                private audioCtx: AudioContext, private zone: NgZone) {
        this.refreshSaved();
        // Se guarda solo, un instante despues del ultimo cambio
        rack.changed.subscribe(() => this.dirty());
        transport.changed.subscribe(() => this.dirty());
        this.restoreAutosave();
    }

    // --- Estado ---

    toProject(): Project {
        return {
            version: 2,
            name: this.projectName,
            transport: this.transport.getState(),
            rack: this.rack.getState()
        };
    }

    /** Reemplaza todo por el proyecto dado (version 2, o 1 del looper de un solo instrumento). */
    load(raw: any): boolean {
        if (!raw || typeof raw != 'object')
            return false;
        if (raw.rack && typeof raw.rack == 'object') {
            this.transport.stop();
            this.transport.setState(raw.transport);
            this.rack.setState(raw.rack);
        } else if (Array.isArray(raw.tracks)) {
            this.migrateV1(raw);
        } else {
            return false;
        }
        this.projectName = typeof raw.name == 'string' ? raw.name.slice(0, 40) : '';
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
                return { name, savedAt: all[name].savedAt, modules, data };
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
        all[name] = { savedAt: Date.now(), data: this.toProject() };
        if (this.write(STORAGE_PROJECTS, all)) {
            this.message = 'Guardado "' + name + '"';
            this.refreshSaved();
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
    }

    /** Proyecto nuevo: el rack inicial y el transporte por defecto. */
    newProject() {
        if (!window.confirm('Empezar un proyecto nuevo? Se pierde lo que no hayas guardado.'))
            return;
        this.transport.stop();
        this.transport.setState({});
        this.rack.buildDefault();
        this.projectName = '';
        this.message = 'Proyecto nuevo';
        this.dirty();
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
