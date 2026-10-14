import { Component, ElementRef, NgZone, OnInit, OnDestroy, HostBinding, HostListener, ViewChild } from '@angular/core';
import { UiService } from '../../services/ui.service';
import { TransportService, BAR_OPTIONS, SIGNATURE_DENOMINATORS, MAX_TRANSPOSE } from '../core/transport.service';
import { RackService } from '../core/rack.service';
import { AutomationService } from '../core/automation.service';

/** Barra de transporte global: grabar, reproducir, tempo, compas, loop, cuantizacion y transposicion. */
@Component({
    selector: 'app-transport',
    templateUrl: './transport-bar.component.html',
    styleUrls: ['./transport-bar.component.css']
})
export class TransportBarComponent implements OnInit, OnDestroy {
    public barOptions = BAR_OPTIONS;
    public denominators = SIGNATURE_DENOMINATORS;
    public maxTranspose = MAX_TRANSPOSE;
    public quantizes = [
        { label: 'Libre', value: 0 },
        { label: '1/4', value: 1 },
        { label: '1/8', value: 0.5 },
        { label: '1/16', value: 0.25 },
        { label: '1/32', value: 0.125 }
    ];
    private timer: any;
    // Compacto y flotante muestran lo esencial; el resto (compas, loop, cuantizar...) se abre con "Mas"
    public more = false;
    public modes: Array<{ id: 'full' | 'compact' | 'floating'; label: string; title: string }> = [
        { id: 'full', label: 'Completo', title: 'Barra de transporte completa' },
        { id: 'compact', label: 'Compacto', title: 'Una sola linea con lo esencial' },
        { id: 'floating', label: 'Flotante', title: 'Ventana flotante que se arrastra y no ocupa lugar' }
    ];
    @ViewChild('box', { static: false }) private box: ElementRef<HTMLElement>;
    private drag: { dx: number; dy: number } = null;

    constructor(public transport: TransportService, public rack: RackService, public ui: UiService,
                public automation: AutomationService, private zone: NgZone) {}

    @HostBinding('class.floating') get floating(): boolean {
        return this.ui.transportMode == 'floating';
    }

    get slim(): boolean {
        return this.ui.transportMode != 'full';
    }

    setMode(mode: 'full' | 'compact' | 'floating') {
        this.ui.setTransportMode(mode);
        this.more = false;
    }

    /** Posicion de la ventana flotante (por defecto, arriba a la derecha). */
    get floatStyle(): { [k: string]: string } {
        if (!this.floating)
            return {};
        const p = this.ui.floatPos;
        return p.x < 0 ? { top: '64px', right: '16px' } : { left: p.x + 'px', top: p.y + 'px' };
    }

    // Los eventos globales del puntero se escuchan solo mientras se arrastra y fuera de la zona de Angular:
    // un listener permanente en `document` dispara una deteccion de cambios completa en cada movimiento del mouse
    private moveFn = (e: PointerEvent) => this.onMove(e);
    private upFn = () => this.onPointerEnd();

    private listen() {
        this.zone.runOutsideAngular(() => {
            document.addEventListener('pointermove', this.moveFn);
            document.addEventListener('pointerup', this.upFn);
            document.addEventListener('pointercancel', this.upFn);
        });
    }

    private unlisten() {
        document.removeEventListener('pointermove', this.moveFn);
        document.removeEventListener('pointerup', this.upFn);
        document.removeEventListener('pointercancel', this.upFn);
    }

    startDrag(e: PointerEvent) {
        const el = this.box && this.box.nativeElement;
        if (!el || e.button > 0)
            return;
        const r = el.getBoundingClientRect();
        this.drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        this.listen();
        e.preventDefault();
    }

    private onMove(e: PointerEvent) {
        if (!this.drag || !this.box)
            return;
        const el = this.box.nativeElement;
        const x = Math.min(Math.max(0, e.clientX - this.drag.dx), Math.max(0, window.innerWidth - el.offsetWidth));
        const y = Math.min(Math.max(0, e.clientY - this.drag.dy), Math.max(0, window.innerHeight - el.offsetHeight));
        this.zone.run(() => this.ui.floatPos = { x: Math.round(x), y: Math.round(y) });
    }

    private onPointerEnd() {
        this.stopHold();
        this.endDrag();
        this.unlisten();
    }

    private endDrag() {
        if (this.drag) {
            this.drag = null;
            this.zone.run(() => this.ui.setFloatPos(this.ui.floatPos.x, this.ui.floatPos.y));
        }
    }

    /** Si la ventana se achica, la flotante no debe quedar fuera de la pantalla. */
    @HostListener('window:resize')
    keepInside() {
        const p = this.ui.floatPos;
        if (!this.floating || p.x < 0 || !this.box)
            return;
        const el = this.box.nativeElement;
        this.ui.floatPos = {
            x: Math.min(p.x, Math.max(0, window.innerWidth - el.offsetWidth)),
            y: Math.min(p.y, Math.max(0, window.innerHeight - el.offsetHeight))
        };
    }

    // Avanzar / retroceder: un toque mueve un compas; mantenido, repite cada vez mas rapido
    private holdTimer: any;
    holdSkip(dir: number, e: PointerEvent) {
        if (e.button > 0)
            return;
        this.stopHold();
        this.transport.skipBars(dir);
        this.listen();
        this.holdTimer = setTimeout(() => {
            this.holdTimer = setInterval(() => this.transport.skipBars(dir), 120);
        }, 380);
        e.preventDefault();
    }

    private stopHold() {
        clearTimeout(this.holdTimer);
        clearInterval(this.holdTimer);
        this.holdTimer = null;
    }

    resetFloat() {
        this.ui.setFloatPos(-1, -1);
    }

    /** Nombres de los instrumentos que graban (los armados). */
    get armedNames(): string {
        const names = this.rack.armedSynths.map(s => s.name + (this.rack.noteSources(s.id).length ? '' : ' (sin entrada)'));
        return names.length ? names.join(', ') : 'ninguno armado';
    }

    // Los indicadores de pulso siguen el reloj del audio: un tick de la zona alcanza para refrescarlos
    ngOnInit() {
        this.timer = setInterval(() => {}, 50);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
        this.stopHold();
        this.unlisten();
    }

    get dots(): Array<number> {
        const n = this.transport.numerator;
        return Array.from({ length: n }, (_, i) => i);
    }

    get transposeText(): string {
        const t = this.transport.transpose;
        return (t > 0 ? '+' : '') + t;
    }
}
