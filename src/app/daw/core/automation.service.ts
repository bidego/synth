import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { RackService } from './rack.service';
import { TransportService, TransportClient } from './transport.service';

export interface AutoPoint {
    b: number;   // beat dentro del loop
    v: number;
}

export interface AutoLane {
    module: string;
    param: string;
    points: Array<AutoPoint>;   // ordenados por beat
    enabled: boolean;
}

const MAX_LANES = 64;
const MAX_POINTS = 4000;
const MIN_STEP_BEATS = 1 / 32;     // resolucion maxima al grabar
const IDLE_MS = 400;               // un cambio suelto (rueda, teclado) cuenta como un "toque" de este largo

interface Touch {
    explicit: boolean;               // mantenido con el mouse o el dedo (termina al soltar)
    recording: boolean;
    segments: Array<Array<AutoPoint>>;
    timer?: any;
}

/**
 * Automatizacion de parametros: graba el movimiento de una perilla o fader mientras el transporte graba y
 * lo reproduce en cada vuelta del loop. Cada parametro tiene una "pista" de puntos (beat, valor) que se
 * interpolan en linea recta. Mientras se toca el control, la pista no lo pisa; al soltarlo vuelve a mandar.
 *
 * El parametro lo define el dispositivo (`autoParam`, `getAutoValue`, `setAutoValue`): asi sigue andando
 * aunque el panel del dispositivo no este a la vista.
 */
@Injectable()
export class AutomationService implements TransportClient {
    public lanes: Array<AutoLane> = [];
    // Graba el movimiento de los controles cuando el transporte graba
    public armed = true;
    public changed = new Subject<void>();

    private touches = new Map<string, Touch>();
    private lastApplied = new Map<string, number>();

    constructor(private rack: RackService, private transport: TransportService) {
        transport.register(this);
        // Un dispositivo que se quita se lleva sus pistas
        rack.changed.subscribe(() => this.prune());
        rack.duplicated.subscribe(d => this.copyLanes(d.from, d.to));
    }

    // --- Consulta ---

    static key(module: string, param: string): string {
        return module + '|' + param;
    }

    lane(module: string, param: string): AutoLane | undefined {
        return this.lanes.find(l => l.module == module && l.param == param);
    }

    hasLane(module: string, param: string): boolean {
        const l = this.lane(module, param);
        return !!l && l.points.length > 0;
    }

    /** Esta grabando el movimiento de este control ahora mismo. */
    isRecording(module: string, param: string): boolean {
        const t = this.touches.get(AutomationService.key(module, param));
        return !!t && t.recording;
    }

    /** Nombre legible: "Delay 1 · Feedback". */
    label(lane: AutoLane): string {
        const m = this.rack.graph.find(lane.module);
        const info = m && m.autoParam(lane.param);
        return m && info ? m.name + ' · ' + info.label : lane.module + ' · ' + lane.param;
    }

    /** "Mix · Delay 1": el parametro primero (la columna es angosta y el nombre del dispositivo se corta). */
    shortLabel(lane: AutoLane): string {
        const m = this.rack.graph.find(lane.module);
        const info = m && m.autoParam(lane.param);
        return m && info ? info.label.replace(/^Canal (\d+) · /, 'C$1 · ') + ' · ' + m.name : lane.module + ' · ' + lane.param;
    }

    range(lane: AutoLane): { min: number; max: number } {
        const m = this.rack.graph.find(lane.module);
        const info = m && m.autoParam(lane.param);
        return info ? { min: info.min, max: info.max } : { min: 0, max: 1 };
    }

    private get canRecord(): boolean {
        const t = this.transport;
        return this.armed && t.recording && t.playing && !t.countingIn;
    }

    // --- Valor de una pista en un beat ---

    valueAt(lane: AutoLane, beat: number): number | null {
        const p = lane.points;
        if (!p.length)
            return null;
        if (beat <= p[0].b)
            return p[0].v;
        const last = p[p.length - 1];
        if (beat >= last.b)
            return last.v;
        let lo = 0, hi = p.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (p[mid].b <= beat)
                lo = mid;
            else
                hi = mid;
        }
        const span = p[hi].b - p[lo].b;
        return span > 0 ? p[lo].v + (p[hi].v - p[lo].v) * (beat - p[lo].b) / span : p[hi].v;
    }

    // --- Grabacion: lo llaman las perillas y los faders ---

    /** Se agarro el control (mouse o dedo). */
    begin(module: string, param: string) {
        const key = AutomationService.key(module, param);
        this.finish(key);
        this.touches.set(key, { explicit: true, recording: this.canRecord && this.known(module, param), segments: [] });
    }

    /** El usuario cambio el valor del control. */
    change(module: string, param: string, value: number) {
        if (!this.known(module, param))
            return;
        const key = AutomationService.key(module, param);
        let t = this.touches.get(key);
        if (!t) {
            // Rueda o teclado: un toque corto que se cierra solo
            t = { explicit: false, recording: this.canRecord, segments: [] };
            this.touches.set(key, t);
        }
        if (!t.explicit) {
            clearTimeout(t.timer);
            t.timer = setTimeout(() => this.finish(key), IDLE_MS);
        }
        // Si el toque empezo antes de grabar (o en la cuenta previa), se une a la grabacion cuando llega
        if (!t.recording && this.canRecord)
            t.recording = true;
        if (t.recording)
            this.record(t, value);
    }

    /** Se solto el control. */
    end(module: string, param: string) {
        this.finish(AutomationService.key(module, param));
    }

    private known(module: string, param: string): boolean {
        const m = this.rack.graph.find(module);
        return !!m && !!m.autoParam(param);
    }

    private record(t: Touch, value: number) {
        const beat = this.transport.cursor;
        let seg = t.segments[t.segments.length - 1];
        // Si el loop dio la vuelta durante el toque, empieza otro tramo
        if (seg && beat < seg[seg.length - 1].b - this.transport.loopBeats / 2)
            seg = null;
        if (!seg) {
            seg = [];
            t.segments.push(seg);
        }
        const last = seg[seg.length - 1];
        if (last && beat - last.b < MIN_STEP_BEATS) {
            last.v = value;   // el mismo instante: queda el ultimo valor
            return;
        }
        seg.push({ b: beat, v: value });
    }

    // Cierra el toque: el tramo grabado reemplaza lo que habia en ese rango de la pista
    private finish(key: string) {
        const t = this.touches.get(key);
        if (!t)
            return;
        clearTimeout(t.timer);
        this.touches.delete(key);
        this.lastApplied.delete(key);
        if (!t.recording)
            return;
        const [module, param] = key.split('|');
        // El valor final se asegura aunque el control haya quedado quieto
        const m = this.rack.graph.find(module);
        const seg = t.segments[t.segments.length - 1];
        if (m && seg && seg.length) {
            const end = this.transport.cursor;
            const last = seg[seg.length - 1];
            const v = m.getAutoValue(param);
            if (end - last.b >= MIN_STEP_BEATS && end >= last.b)
                seg.push({ b: end, v });
        }
        let lane = this.lane(module, param);
        t.segments.filter(s => s.length).forEach(s => {
            if (!lane) {
                if (this.lanes.length >= MAX_LANES)
                    return;
                lane = { module, param, points: [], enabled: true };
                this.lanes.push(lane);
            }
            const from = s[0].b, to = s[s.length - 1].b;
            lane.points = lane.points.filter(p => p.b < from - 1e-6 || p.b > to + 1e-6).concat(s)
                .sort((a, b) => a.b - b.b).slice(0, MAX_POINTS);
        });
        this.changed.next();
        this.rack.changed.next();
    }

    // --- Reproduccion ---

    // El reloj del transporte nos llama cada ~25 ms: es el pulso de la automatizacion
    schedule() {
        if (!this.lanes.length)
            return;
        const beat = this.transport.cursor;
        this.lanes.forEach(lane => {
            if (!lane.enabled || !lane.points.length)
                return;
            const key = AutomationService.key(lane.module, lane.param);
            if (this.touches.has(key))
                return;
            const m = this.rack.graph.find(lane.module);
            const info = m && m.autoParam(lane.param);
            if (!m || !info)
                return;
            const v = this.valueAt(lane, beat);
            if (v === null)
                return;
            const prev = this.lastApplied.get(key);
            if (prev !== undefined && Math.abs(prev - v) <= (info.max - info.min) * 0.0004)
                return;
            this.lastApplied.set(key, v);
            m.setAutoValue(lane.param, v);
        });
    }

    onRecordStart() {}
    onRecordStop() {
        this.touches.forEach((_, key) => this.finish(key));
    }
    onStop() {
        this.lastApplied.clear();
    }

    // --- Edicion ---

    setArmed(on: boolean) {
        this.armed = on;
        this.changed.next();
    }

    setEnabled(lane: AutoLane, on: boolean) {
        lane.enabled = on;
        this.changed.next();
        this.rack.changed.next();
    }

    remove(lane: AutoLane) {
        this.lanes = this.lanes.filter(l => l !== lane);
        this.changed.next();
        this.rack.changed.next();
    }

    /** Borra las pistas de dispositivos o parametros que ya no existen. */
    private prune() {
        const before = this.lanes.length;
        this.lanes = this.lanes.filter(l => {
            const m = this.rack.graph.find(l.module);
            return !!m && !!m.autoParam(l.param);
        });
        if (this.lanes.length != before)
            this.changed.next();
    }

    /** Copia las pistas de un dispositivo a otro (al duplicarlo). */
    copyLanes(from: string, to: string) {
        this.lanes.filter(l => l.module == from).forEach(l => {
            if (this.lanes.length < MAX_LANES && this.rack.graph.find(to) && this.rack.graph.find(to).autoParam(l.param))
                this.lanes.push({ module: to, param: l.param, points: l.points.map(p => ({ ...p })), enabled: l.enabled });
        });
        this.changed.next();
    }

    // --- Estado ---

    getState() {
        return {
            armed: this.armed,
            lanes: this.lanes.map(l => ({
                module: l.module, param: l.param, enabled: l.enabled,
                points: l.points.map(p => [Math.round(p.b * 1000) / 1000, Math.round(p.v * 10000) / 10000])
            }))
        };
    }

    /** Se llama despues de armar el rack: las pistas se validan contra los dispositivos que quedaron. */
    setState(raw: any) {
        this.lanes = [];
        this.lastApplied.clear();
        this.touches.clear();
        raw = raw && typeof raw == 'object' ? raw : {};
        this.armed = raw.armed !== false;
        const list = Array.isArray(raw.lanes) ? raw.lanes.slice(0, MAX_LANES) : [];
        list.forEach((r: any) => {
            if (!r || typeof r.module != 'string' || typeof r.param != 'string' || !Array.isArray(r.points))
                return;
            const m = this.rack.graph.find(r.module);
            const info = m && m.autoParam(r.param);
            if (!info)
                return;
            const points: Array<AutoPoint> = r.points.slice(0, MAX_POINTS)
                .filter((p: any) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
                .map((p: any) => ({ b: Math.max(0, Math.min(1024, +p[0])), v: Math.max(info.min, Math.min(info.max, +p[1])) }))
                .sort((a: AutoPoint, b: AutoPoint) => a.b - b.b);
            if (points.length)
                this.lanes.push({ module: r.module, param: r.param, points, enabled: r.enabled !== false });
        });
        this.changed.next();
    }
}
