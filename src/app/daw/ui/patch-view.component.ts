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
    hit: string;  // el tramo central del cable: la zona donde se hace clic (los extremos quedan libres para los puertos)
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

type Pt = [number, number];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Divide una curva de Bezier cubica en t (De Casteljau)
function split(p: Array<Pt>, t: number): { left: Array<Pt>; right: Array<Pt> } {
    const a = lerp(p[0], p[1], t), b = lerp(p[1], p[2], t), c = lerp(p[2], p[3], t);
    const d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
    return { left: [p[0], a, d, f], right: [f, e, c, p[3]] };
}

// El tramo [t0, t1] de la curva, como atributo `d` de un path
function sliceD(p: Array<Pt>, t0: number, t1: number): string {
    const q = split(split(p, t1).left, t0 / t1).right;
    return 'M' + q[0][0] + ' ' + q[0][1] + ' C' + q[1][0] + ' ' + q[1][1] + ', ' + q[2][0] + ' ' + q[2][1] + ', ' + q[3][0] + ' ' + q[3][1];
}

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
    // Para detectar el doble clic en un puerto: solo vale si el primer clic fue limpio (sin arrastrar un cable)
    private lastJack = { key: '', time: 0, clean: false };
    private dragMoved = false;

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

    private curve(x1: number, y1: number, x2: number, y2: number): { d: string; hit: string; mx: number; my: number } {
        const dx = Math.max(60, Math.abs(x2 - x1) / 2);
        // Los cables cuelgan un poco, como cables de verdad
        const sag = Math.min(70, 20 + Math.abs(x2 - x1) / 6);
        const pts: Array<Pt> = [[x1, y1], [x1 + dx, y1 + sag], [x2 - dx, y2 + sag], [x2, y2]];
        const d = 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + (y1 + sag) + ', ' + (x2 - dx) + ' ' + (y2 + sag) + ', ' + x2 + ' ' + y2;
        // El punto del cable en t = 0.5, para el boton de borrar
        const mid = split(pts, 0.5).left[3];
        return { d, hit: sliceD(pts, 0.14, 0.86), mx: mid[0], my: mid[1] };
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
        // Doble clic en un puerto: desconecta todo lo suyo. Se detecta aca y no con el evento dblclick,
        // porque el contenedor captura el puntero y el navegador ya no lo entrega al puerto.
        const key = m.id + ':' + p.id, now = performance.now();
        const again = this.lastJack.clean && this.lastJack.key == key && now - this.lastJack.time < 350;
        this.lastJack = { key, time: again ? 0 : now, clean: false };
        this.dragMoved = false;
        if (again) {
            this.rack.graph.disconnectPort(m.id, p.id);
            this.selectedCable = null;
            return;
        }
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
            if (Math.abs(pt.x - this.drag.x) + Math.abs(pt.y - this.drag.y) > 4)
                this.dragMoved = true;
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
            // Un clic sin arrastrar deja la puerta abierta para un segundo clic (doble clic)
            this.lastJack.clean = !this.dragMoved;
            // El puerto bajo el puntero (el captura el contenedor, asi que se busca por posicion)
            const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
            const jack = hit && hit.closest ? hit.closest('[data-j]') as HTMLElement : null;
            const [mod, port] = jack ? jack.getAttribute('data-j').split(':') : ['', ''];
            // Soltar sobre el mismo puerto del que se salio (un simple clic) no es un intento de cable
            if (jack && !(mod == d.module && port == d.port)) {
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
        // Si el foco quedo en un campo de texto (ej. el buscador) Supr se tomaria como escritura
        const active = document.activeElement as HTMLElement;
        if (active && active !== document.body && active.blur)
            active.blur();
        this.selectedCable = id;
        this.rack.message = '';
    }

    // Doble clic en un puerto: se desconecta todo lo que tenga
    disconnectPort(m: RackModule, p: PortDef, e: Event) {
        e.preventDefault();
        e.stopPropagation();
        this.rack.graph.disconnectPort(m.id, p.id);
        this.selectedCable = null;
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
