import { Component, OnInit, OnDestroy } from '@angular/core';
import { TransportService, BAR_OPTIONS, SIGNATURE_DENOMINATORS, MAX_TRANSPOSE } from '../core/transport.service';
import { RackService } from '../core/rack.service';

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

    constructor(public transport: TransportService, public rack: RackService) {}

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
