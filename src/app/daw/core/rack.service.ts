import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { RackGraph, ConnectResult } from './rack-graph';
import { RackModule } from './module';
import { TransportService, BAR_OPTIONS } from './transport.service';
import { ModuleEnv, CableModel } from './types';
import { SampleLibrary } from '../../services/sample-library';
import { SoundService } from '../../services/sound.service';
import { MidiService } from '../../services/midi.service';
import { SynthStudioModule } from '../modules/synth-studio.module';
import { OutputModule } from '../modules/output.module';
import { MixerModule, MIXER_CHANNELS } from '../modules/mixer.module';

/**
 * El rack en vivo: el grafo de dispositivos y cables sobre el AudioContext real, mas lo que la
 * pantalla necesita (dispositivo seleccionado, avisos, autocableado).
 */
@Injectable()
export class RackService {
    public readonly graph: RackGraph;
    public selectedId: string = null;
    public message = '';
    // Algo cambio: el proyecto se autoguarda
    public readonly changed = new Subject<void>();

    constructor(private audioCtx: AudioContext, public transport: TransportService, library: SampleLibrary,
                private zone: NgZone, sound: SoundService, midi: MidiService) {
        const env: ModuleEnv = {
            ctx: audioCtx,
            transport,
            library,
            live: true,
            clock: transport,
            inputs: { keys: sound.listenKey, midi: midi.messages },
            run: fn => zone.run(fn),
            changed: () => this.changed.next()
        };
        this.graph = new RackGraph(env);
        // Al grabar tiene que haber un instrumento armado
        transport.ensureArmed = () => this.ensureArmed();
        // Los efectos sincronizados al tempo siguen los cambios de BPM
        transport.changed.subscribe(() => this.graph.modules.forEach(m => m.onTempo()));
    }

    get modules(): Array<RackModule> {
        return this.graph.modules;
    }

    get cables(): Array<CableModel> {
        return this.graph.cables;
    }

    get synths(): Array<SynthStudioModule> {
        return this.graph.ofType<SynthStudioModule>('synth');
    }

    get selected(): RackModule | undefined {
        return this.graph.find(this.selectedId);
    }

    /** El Synth Studio al que apuntan el panel de sonidos y los atajos: el seleccionado, o el primero. */
    get activeSynth(): SynthStudioModule | undefined {
        const sel = this.selected;
        return sel && sel.type == 'synth' ? sel as SynthStudioModule : this.synths[0];
    }

    /** Analizador de la salida de audio (alimenta el visualizador). */
    get masterAnalyser(): AnalyserNode | null {
        const out = this.graph.ofType<OutputModule>('output')[0];
        return out ? out.analyser : null;
    }

    select(id: string) {
        this.selectedId = id;
    }

    // --- Dispositivos ---

    add(type: string): RackModule | null {
        const module = this.graph.add(type);
        if (!module) {
            this.message = type == 'output' ? 'Ya hay una salida de audio' : 'No se pudo agregar el dispositivo';
            return null;
        }
        const n = this.graph.modules.length - 1;
        module.pos = { x: 30 + (n % 4) * 260, y: 40 + Math.floor(n / 4) * 280 };
        this.autoWire(module);
        this.selectedId = module.id;
        this.message = '';
        this.changed.next();
        return module;
    }

    remove(id: string) {
        this.graph.remove(id);
        if (this.selectedId == id)
            this.selectedId = null;
        this.changed.next();
    }

    /** Mueve un dispositivo en el orden del rack. */
    move(id: string, delta: number) {
        const list = this.graph.modules;
        const i = list.findIndex(m => m.id == id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= list.length)
            return;
        [list[i], list[j]] = [list[j], list[i]];
        this.changed.next();
    }

    rename(id: string, name: string) {
        const m = this.graph.find(id);
        if (m && name.trim()) {
            m.name = name.trim().slice(0, 40);
            this.changed.next();
        }
    }

    // --- Cables ---

    connect(fromModule: string, fromPort: string, toModule: string, toPort: string): ConnectResult {
        const r = this.graph.connect(fromModule, fromPort, toModule, toPort);
        this.message = r.ok ? '' : (r.error || '');
        return r;
    }

    disconnect(cableId: string) {
        this.graph.disconnect(cableId);
        this.message = '';
    }

    // Los dispositivos nuevos se enchufan solos a donde es razonable; despues se re-cablea a gusto
    private autoWire(m: RackModule) {
        const g = this.graph;
        if (m.type == 'synth') {
            const kb = g.ofType('keyboard')[0];
            if (kb)
                g.connect(kb.id, 'notes', m.id, 'notes');
            this.wireAudioOut(m, 'out');
        } else if (m.type == 'keyboard') {
            const free = this.synths.find(s => !g.cablesOf(s.id, 'notes').length);
            if (free)
                g.connect(m.id, 'notes', free.id, 'notes');
        } else if (m.type == 'mixer') {
            const out = g.ofType('output')[0];
            if (out && !g.cablesOf(out.id, 'in').length)
                g.connect(m.id, 'out', out.id, 'in');
        } else if (m.type == 'output') {
            const mixer = g.ofType<MixerModule>('mixer').find(x => !g.cablesOf(x.id, 'out').length);
            if (mixer)
                g.connect(mixer.id, 'out', m.id, 'in');
        }
    }

    // Conecta una salida de audio a un canal libre del mezclador, o a la salida si no hay mezclador
    private wireAudioOut(m: RackModule, port: string) {
        const g = this.graph;
        for (const mixer of g.ofType<MixerModule>('mixer')) {
            for (let i = 1; i <= MIXER_CHANNELS; i++) {
                if (!g.cablesOf(mixer.id, 'in' + i).length) {
                    g.connect(m.id, port, mixer.id, 'in' + i);
                    return;
                }
            }
        }
        const out = g.ofType('output')[0];
        if (out && !g.cablesOf(out.id, 'in').length)
            g.connect(m.id, port, out.id, 'in');
    }

    // --- Grabacion y loop ---

    // Si ningun instrumento esta armado, arma el activo
    private ensureArmed() {
        if (this.synths.some(s => s.sequencer.armed))
            return;
        const s = this.activeSynth;
        if (s)
            s.sequencer.armed = true;
    }

    /** Duplica la duracion del loop copiando las notas de todos los instrumentos. Devuelve false si ya es el maximo. */
    doubleLoop(): boolean {
        const bars = this.transport.bars;
        const next = BAR_OPTIONS.filter(b => b > bars)[0];
        if (!next || next > bars * 2)
            return false;
        const oldLoop = this.transport.loopBeats;
        this.synths.forEach(s => s.sequencer.doubleNotes(oldLoop));
        this.transport.setBars(next);
        return true;
    }

    // --- Estado ---

    /** El rack inicial: teclado -> Synth Studio -> mezclador -> salida. */
    buildDefault() {
        const g = this.graph;
        g.clear();
        const kb = g.add('keyboard'), synth = g.add('synth'), mixer = g.add('mixer'), out = g.add('output');
        kb.pos = { x: 30, y: 60 };
        synth.pos = { x: 290, y: 40 };
        mixer.pos = { x: 550, y: 40 };
        out.pos = { x: 810, y: 80 };
        g.connect(kb.id, 'notes', synth.id, 'notes');
        g.connect(synth.id, 'out', mixer.id, 'in1');
        g.connect(mixer.id, 'out', out.id, 'in');
        // El Synth Studio sin estado guardado arranca con su patch por defecto
        synth.setState({});
        this.selectedId = synth.id;
    }

    getState() {
        return this.graph.getState();
    }

    setState(raw: any) {
        this.graph.setState(raw);
        const first = this.synths[0];
        this.selectedId = first ? first.id : (this.graph.modules[0] ? this.graph.modules[0].id : null);
    }
}
