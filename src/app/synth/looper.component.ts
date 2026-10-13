import { Component, OnInit, OnDestroy } from '@angular/core';
import { LooperService, Track, LoopNote } from '../services/looper.service';

@Component({
    selector: 'app-looper',
    templateUrl: './looper.component.html',
    styleUrls: ['./looper.component.css']
})
export class LooperComponent implements OnInit, OnDestroy {
    public barOptions = [1, 2, 4, 8];
    public quantizes = [
        { label: 'Libre', value: 0 },
        { label: '1/4', value: 1 },
        { label: '1/8', value: 0.5 },
        { label: '1/16', value: 0.25 }
    ];
    public dots = [0, 1, 2, 3];
    private timer: any;

    constructor(public looper: LooperService) {}

    // El playhead se mueve con el tiempo del audio: un tick de la zona alcanza para refrescar la vista
    ngOnInit() {
        this.timer = setInterval(() => {}, 50);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }

    get gridSize(): string {
        return 100 / this.looper.loopBeats + '% 100%';
    }

    // Altura de una nota en el mini piano roll (los kits de percusion se reparten por instrumento)
    noteBottom(track: Track, n: LoopNote): number {
        return track.patch.kind == 'drums'
            ? (n.midi % 12) / 12 * 88
            : Math.max(0, Math.min(88, (n.midi - 24) / 72 * 88));
    }

    noteWidth(n: LoopNote): number {
        return Math.max(n.dur / this.looper.loopBeats * 100, 0.8);
    }
}
