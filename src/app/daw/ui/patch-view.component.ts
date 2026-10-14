import { Component, ElementRef, HostListener, AfterViewChecked, ViewChild } from '@angular/core';
import { RackService } from '../core/rack.service';
import { RackModule } from '../core/module';
import { PortDef, PortKind } from '../core/types';
import { moduleMeta } from '../modules/registry';
import { isTyping } from '../core/dom';

interface CablePath {
    id: string;
    kind: PortKind;
    d: string;
    mx: number;   // punto medio, para el boton de borrar
    my: number;
}

interface Drag {
    module: string;
    port: string;
    dir: 'in' | 'out';
    kind: PortKind;
    x: number;
    y: number;
}

const NODE_W = 210;

/**
 * Vista Cableado: los dispositivos como nodos que se arrastran, con sus puertos (jacks) a los lados.
 * Se arrastra de un puerto a otro para tender un cable; un clic sobre un cable lo selecciona
 * (Suprimir o la X lo borra).
 */
@Component({
    selector: 'app-patch-view',
    templateUrl: './patch-view.component.html',
    styleUrls: ['./patch-view.component.css']
})
export class PatchViewComponent implements AfterViewChecked {
    @ViewChild('wrap', { static: true }) private wrapRef: ElementRef<HTMLElement>;

    public paths: Array<CablePath> = [];
    public drag: Drag = null;
    public selectedCable: string = null;
    public width = 1000;
    public height = 600;

    private moving: { module: RackModule; dx: number; dy: number } = null;
    private signature = '';

    constructor(public rack: RackService) {}

    // --- Datos ---

    inPorts(m: RackModule): Array<PortDef> {
        return m.ports.filter(p => p.dir == 'in');
    }

    outPorts(m: RackModule): Array<PortDef> {
        return m.ports.filter(p => p.dir == 'out');
    }

    typeLabel(m: RackModule): string {
        const meta = moduleMeta(m.type);
        return meta ? meta.label : m.type;
    }

    connected(m: RackModule, p: PortDef): boolean {
        return this.rack.graph.cablesOf(m.id, p.id).length > 0;
    }

    /** Durante un arrastre, los puertos que aceptan el cable se resaltan. */
    canDrop(m: RackModule, p: PortDef): boolean {
        const d = this.drag;
        if (!d)
            return false;
        const r = d.dir == 'out'
            ? this.rack.graph.canConnect(d.module, d.port, m.id, p.id)
            : this.rack.graph.canConnect(m.id, p.id, d.module, d.port);
        return r.ok;
    }

    // --- Posiciones de los jacks (se leen del DOM) ---

    private jackCenter(moduleId: string, portId: string): { x: number; y: number } | null {
        const wrap = this.wrapRef.nativeElement;
        const el = wrap.querySelector('[data-j="' + moduleId + ':' + portId + '"]') as HTMLElement;
        if (!el)
            return null;
        const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        return { x: r.left - w.left + wrap.scrollLeft + r.width / 2, y: r.top - w.top + wrap.scrollTop + r.height / 2 };
    }

    private curve(x1: number, y1: number, x2: number, y2: number): { d: string; mx: number; my: number } {
        const dx = Math.max(60, Math.abs(x2 - x1) / 2);
        // Los cables cuelgan un poco, como cables de verdad
        const sag = Math.min(70, 20 + Math.abs(x2 - x1) / 6);
        const d = 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + (y1 + sag) + ', ' + (x2 - dx) + ' ' + (y2 + sag) + ', ' + x2 + ' ' + y2;
        return { d, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 + sag * 0.75 };
    }

    ngAfterViewChecked() {
        const g = this.rack.graph;
        const sig = g.modules.map(m => m.id + ':' + m.pos.x + ',' + m.pos.y + ':' + m.ports.length).join('|')
            + '#' + g.cables.map(c => c.id).join(',') + '#' + (this.drag ? this.drag.x + ',' + this.drag.y : '');
        if (sig === this.signature)
            return;
        this.signature = sig;
        // Despues de pintar: se mide el DOM y se vuelve a pintar con los cables en su lugar
        Promise.resolve().then(() => this.recompute());
    }

    @HostListener('window:resize')
    recompute() {
        const g = this.rack.graph;
        const wrap = this.wrapRef.nativeElement;
        this.paths = g.cables.map(c => {
            const a = this.jackCenter(c.fromModule, c.fromPort), b = this.jackCenter(c.toModule, c.toPort);
            const kind = g.find(c.fromModule).portDef(c.fromPort).kind;
            if (!a || !b)
                return null;
            return { id: c.id, kind, ...this.curve(a.x, a.y, b.x, b.y) };
        }).filter(p => !!p);
        this.width = Math.max(wrap.clientWidth, ...g.modules.map(m => m.pos.x + NODE_W + 80));
        this.height = Math.max(wrap.clientHeight, ...g.modules.map(m => m.pos.y + 320));
    }

    get dragPath(): string {
        const d = this.drag;
        if (!d)
            return '';
        const j = this.jackCenter(d.module, d.port);
        if (!j)
            return '';
        return d.dir == 'out' ? this.curve(j.x, j.y, d.x, d.y).d : this.curve(d.x, d.y, j.x, j.y).d;
    }

    // --- Cables ---

    private local(e: PointerEvent): { x: number; y: number } {
        const wrap = this.wrapRef.nativeElement, w = wrap.getBoundingClientRect();
        return { x: e.clientX - w.left + wrap.scrollLeft, y: e.clientY - w.top + wrap.scrollTop };
    }

    startCable(m: RackModule, p: PortDef, e: PointerEvent) {
        e.preventDefault();
        e.stopPropagation();
        // Mayuscula + clic: desconecta todo lo de ese puerto
        if (e.shiftKey) {
            this.rack.graph.disconnectPort(m.id, p.id);
            return;
        }
        this.rack.select(m.id);
        this.selectedCable = null;
        this.rack.message = '';
        const pt = this.local(e);
        this.drag = { module: m.id, port: p.id, dir: p.dir, kind: p.kind, x: pt.x, y: pt.y };
        this.wrapRef.nativeElement.setPointerCapture(e.pointerId);
    }

    @HostListener('pointermove', ['$event'])
    onMove(e: PointerEvent) {
        if (this.drag) {
            const pt = this.local(e);
            this.drag.x = pt.x;
            this.drag.y = pt.y;
        } else if (this.moving) {
            const pt = this.local(e);
            this.moving.module.pos = {
                x: Math.max(0, Math.round(pt.x - this.moving.dx)),
                y: Math.max(0, Math.round(pt.y - this.moving.dy))
            };
        }
    }

    @HostListener('pointerup', ['$event'])
    onUp(e: PointerEvent) {
        if (this.drag) {
            const d = this.drag;
            this.drag = null;
            // El puerto bajo el puntero (el captura el contenedor, asi que se busca por posicion)
            const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
            const jack = hit && hit.closest ? hit.closest('[data-j]') as HTMLElement : null;
            if (jack) {
                const [mod, port] = jack.getAttribute('data-j').split(':');
                if (d.dir == 'out')
                    this.rack.connect(d.module, d.port, mod, port);
                else
                    this.rack.connect(mod, port, d.module, d.port);
            }
        }
        if (this.moving) {
            this.moving = null;
            this.rack.changed.next();
        }
    }

    // --- Nodos ---

    startMove(m: RackModule, e: PointerEvent) {
        e.preventDefault();
        this.rack.select(m.id);
        this.selectedCable = null;
        const pt = this.local(e);
        this.moving = { module: m, dx: pt.x - m.pos.x, dy: pt.y - m.pos.y };
        this.wrapRef.nativeElement.setPointerCapture(e.pointerId);
    }

    // --- Seleccion y borrado de cables ---

    selectCable(id: string, e: Event) {
        e.stopPropagation();
        this.selectedCable = id;
        this.rack.message = '';
    }

    deleteCable(id: string) {
        this.rack.disconnect(id);
        this.selectedCable = null;
    }

    clearSelection() {
        this.selectedCable = null;
    }

    @HostListener('document:keydown', ['$event'])
    onKey(e: KeyboardEvent) {
        if (this.selectedCable && (e.code == 'Delete' || e.code == 'Backspace') && !isTyping(e.target as HTMLElement)) {
            e.preventDefault();
            this.deleteCable(this.selectedCable);
        }
    }

    // --- Orden automatico ---

    /** Acomoda los dispositivos en columnas segun su distancia desde las fuentes (de izquierda a derecha). */
    autoLayout() {
        const g = this.rack.graph;
        const depth = new Map<string, number>();
        const calc = (id: string, seen: Set<string>): number => {
            if (depth.has(id))
                return depth.get(id);
            if (seen.has(id))
                return 0;
            seen.add(id);
            const incoming = g.cables.filter(c => c.toModule == id);
            const d = incoming.length ? 1 + Math.max(...incoming.map(c => calc(c.fromModule, seen))) : 0;
            depth.set(id, d);
            return d;
        };
        g.modules.forEach(m => calc(m.id, new Set<string>()));
        const rows = new Map<number, number>();
        g.modules.forEach(m => {
            const col = depth.get(m.id) || 0;
            const row = rows.get(col) || 0;
            rows.set(col, row + 1);
            const tall = Math.max(this.inPorts(m).length, this.outPorts(m).length);
            m.pos = { x: 40 + col * (NODE_W + 90), y: 40 + row * (110 + tall * 24) };
        });
        this.rack.changed.next();
    }
}
