import { Component, OnInit, OnDestroy } from '@angular/core';
import { LooperService, BAR_OPTIONS } from '../services/looper.service';

/** Barra de transporte: grabar, reproducir, tempo, largo del loop, cuantizacion y metronomo. */
@Component({
    selector: 'app-transport',
    templateUrl: './transport.component.html',
    styleUrls: ['./transport.component.css']
})
export class TransportComponent implements OnInit, OnDestroy {
    public barOptions = BAR_OPTIONS;
    public quantizes = [
        { label: 'Libre', value: 0 },
        { label: '1/4', value: 1 },
        { label: '1/8', value: 0.5 },
        { label: '1/16', value: 0.25 }
    ];
    public dots = [0, 1, 2, 3];
    private timer: any;

    constructor(public looper: LooperService) {}

    // Los indicadores de pulso siguen el reloj del audio: un tick de la zona alcanza para refrescarlos
    ngOnInit() {
        this.timer = setInterval(() => {}, 50);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }
}
