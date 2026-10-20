import { moduleMeta } from '../modules/registry';
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
import { SequencerModule } from '../modules/sequencer.module';
import { OutputModule } from '../modules/output.module';
import { MixerModule, MIXER_CHANNELS, AUX_BUSES } from '../modules/mixer.module';
import { EffectModule } from '../modules/effect.module';

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
    // Un dispositivo se duplico: lo usa la automatizacion para copiar sus pistas
    public readonly duplicated = new Subject<{ from: string; to: string }>();

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

    get sequencers(): Array<SequencerModule> {
        return this.graph.ofType<SequencerModule>('sequencer');
    }

    /** Los instrumentos que reciben notas por cable (Synth Studio y Juno-106). */
    get notePlayers(): Array<RackModule> {
        return this.graph.modules.filter(m => m.ports.some(p => p.id == 'notes' && p.dir == 'in'));
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
        this.message = '';
        this.autoWire(module);   // puede dejar un aviso en `message`
        this.selectedId = module.id;
        this.changed.next();
        return module;
    }

    /** Se puede duplicar todo lo que no sea unico (la salida de audio y el teclado/MIDI no). */
    canDuplicate(id: string): boolean {
        const m = this.graph.find(id);
        const meta = m && moduleMeta(m.type);
        return !!meta && !meta.unique;
    }

    /**
     * Copia un dispositivo con todo su estado (sonido, efectos y pistas del secuenciador) justo debajo del original.
     * La copia no hereda los cables: un instrumento queda conectado a un canal libre del mezclador, asi cada
     * copia puede sonar por su propio canal; las notas se le dan a mano (teclado o cable).
     */
    duplicate(id: string): RackModule | null {
        const src = this.graph.find(id);
        if (!src || !this.canDuplicate(id)) {
            this.message = 'Este dispositivo no se puede duplicar';
            return null;
        }
        const copy = this.graph.add(src.type);
        if (!copy) {
            this.message = 'No se pudo duplicar (demasiados dispositivos)';
            return null;
        }
        const defaultName = copy.name;
        copy.setState(JSON.parse(JSON.stringify(src.getState())));
        // Si el original conserva su nombre automatico la copia sigue la numeracion; si no, se marca como copia
        const meta = moduleMeta(src.type);
        copy.name = new RegExp('^' + meta.label + ' \\d+$').test(src.name) ? defaultName : (src.name + ' copia').slice(0, 40);
        copy.pos = { x: src.pos.x + 40, y: src.pos.y + 90 };
        // Queda justo despues del original en el rack
        const list = this.graph.modules;
        list.splice(list.indexOf(copy), 1);
        list.splice(list.indexOf(src) + 1, 0, copy);
        this.message = '';
        if (copy.type == 'synth' || copy.type == 'juno' || copy.type == 'modeld' || copy.type == 'acid')
            this.wireAudioOut(copy, 'out');
        this.selectedId = copy.id;
        this.changed.next();
        this.duplicated.next({ from: src.id, to: copy.id });
        return copy;
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
        if (m.type == 'synth' || m.type == 'juno' || m.type == 'modeld' || m.type == 'acid') {
            const kb = g.ofType('keyboard')[0];
            if (kb && !g.cablesOf(kb.id, 'notes').length)
                g.connect(kb.id, 'notes', m.id, 'notes');
            else if (kb)
                // El teclado ya toca a otro instrumento: no se agrega solo para que no suenen los dos
                this.message = '"' + m.name + '" no recibe el teclado todavia: activalo en el panel del instrumento o del Teclado / MIDI';
            this.wireAudioOut(m, 'out');
        } else if (m.type == 'sequencer') {
            // La primera pista toca al primer instrumento que todavia no recibe notas de nadie
            const free = this.notePlayers.find(s => s.type != 'sequencer' && !g.cablesOf(s.id, 'notes').length);
            if (free)
                g.connect(m.id, 'out1', free.id, 'notes');
        } else if (m.type == 'keyboard') {
            const free = this.notePlayers.find(s => s.type != 'sequencer' && !g.cablesOf(s.id, 'notes').length);
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

    // --- Conexiones de notas (teclado / MIDI -> instrumentos) ---

    /** Cables de notas que llegan a la entrada de un instrumento. */
    noteSources(moduleId: string): Array<CableModel> {
        return this.graph.cables.filter(c => c.toModule == moduleId && c.toPort == 'notes');
    }

    /** Instrumentos a los que llega la salida de notas de un teclado. */
    noteTargets(keyboardId: string): Array<CableModel> {
        return this.graph.cables.filter(c => c.fromModule == keyboardId && c.fromPort == 'notes');
    }

    isNoteLinked(keyboardId: string, synthId: string): boolean {
        return this.graph.cables.some(c => c.fromModule == keyboardId && c.fromPort == 'notes' && c.toModule == synthId && c.toPort == 'notes');
    }

    /** Conecta o desconecta el teclado de un instrumento (un clic, sin ir a la vista de cableado). */
    toggleNoteLink(keyboardId: string, synthId: string) {
        const cable = this.graph.cables.find(c => c.fromModule == keyboardId && c.fromPort == 'notes' && c.toModule == synthId && c.toPort == 'notes');
        if (cable)
            this.disconnect(cable.id);
        else
            this.connect(keyboardId, 'notes', synthId, 'notes');
    }

    // --- Envios aux ---

    get mixer(): MixerModule | undefined {
        return this.graph.ofType<MixerModule>('mixer')[0];
    }

    /** Este efecto esta cableado como envio aux (aux -> efecto -> retorno) de ese bus? (aux: 0..) */
    isSend(effectId: string, aux: number): boolean {
        const mixer = this.mixer;
        if (!mixer)
            return false;
        const g = this.graph;
        return g.cables.some(c => c.fromModule == mixer.id && c.fromPort == 'aux' + (aux + 1) && c.toModule == effectId && c.toPort == 'in')
            && g.cables.some(c => c.fromModule == effectId && c.fromPort == 'out' && c.toModule == mixer.id && c.toPort == 'ret' + (aux + 1));
    }

    /**
     * Usa un efecto como envio aux: mezclador (aux n) -> efecto -> mezclador (retorno n), y lo deja al 100 %
     * de mezcla (en un envio el efecto solo tiene que dar la parte "mojada"). Reemplaza el cableado que
     * tuviera el efecto en su entrada y salida.
     */
    wireAsSend(effectId: string, aux: number): boolean {
        const g = this.graph, mixer = this.mixer, fx = g.find(effectId) as EffectModule;
        if (!mixer || !fx || aux < 0 || aux >= AUX_BUSES) {
            this.message = 'Hace falta un mezclador en el rack';
            return false;
        }
        g.disconnectPort(fx.id, 'in');
        g.disconnectPort(fx.id, 'out');
        const a = g.connect(mixer.id, 'aux' + (aux + 1), fx.id, 'in');
        const b = a.ok ? g.connect(fx.id, 'out', mixer.id, 'ret' + (aux + 1)) : a;
        this.message = b.ok ? '' : (b.error || '');
        if (b.ok && fx.paramDefs.some(d => d.id == 'mix'))
            fx.setParam('mix', 1);
        return b.ok;
    }

    /** Saca al efecto del envio: quita los cables de su entrada y su salida. */
    unwireSend(effectId: string) {
        this.graph.disconnectPort(effectId, 'in');
        this.graph.disconnectPort(effectId, 'out');
        this.message = '';
    }

    // --- Grabacion y loop ---

    /** Instrumentos armados para grabar. */
    get armedSynths(): Array<SynthStudioModule> {
        return this.synths.filter(s => s.sequencer.armed);
    }

    // Al empezar a grabar tiene que haber un instrumento armado QUE RECIBA NOTAS. Un instrumento que
    // quedo armado de antes pero ya no esta conectado al teclado no sirve: se arma el seleccionado
    // (si esta conectado), si no el primero conectado, y en ultimo caso el activo (se toca con su piano).
    private ensureArmed() {
        const receives = (s: SynthStudioModule) => this.noteSources(s.id).length > 0;
        // Un secuenciador de notas armado y conectado a un teclado ya recibe lo que se toca
        const seqReceives = (s: SequencerModule) => this.noteSources(s.id).length > 0;
        if (this.armedSynths.some(receives) || this.sequencers.some(s => s.sequencer.armed && seqReceives(s)))
            return;
        // Si el secuenciador seleccionado esta conectado, graba en el (aunque haya quedado desarmado)
        const selSeq = this.selected && this.selected.type == 'sequencer' ? this.selected as SequencerModule : null;
        const target0 = selSeq && seqReceives(selSeq) ? selSeq : this.sequencers.find(seqReceives);
        if (target0) {
            target0.sequencer.armed = true;
            return;
        }
        const selected = this.selected && this.selected.type == 'synth' ? this.selected as SynthStudioModule : null;
        const target = (selected && receives(selected) ? selected : null)
            || this.synths.find(receives)
            || this.activeSynth;
        if (target)
            target.sequencer.armed = true;
    }

    /** Duplica la duracion del loop copiando las notas de todos los instrumentos. Devuelve false si ya es el maximo. */
    doubleLoop(): boolean {
        const bars = this.transport.bars;
        const next = BAR_OPTIONS.filter(b => b > bars)[0];
        if (!next || next > bars * 2)
            return false;
        const oldLoop = this.transport.loopBeats;
        this.synths.forEach(s => s.sequencer.doubleNotes(oldLoop));
        this.sequencers.forEach(s => s.sequencer.doubleNotes(oldLoop));
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
