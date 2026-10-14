import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Track, LoopNote } from '../daw/core/sequencer';
import { SynthStudioModule } from '../daw/modules/synth-studio.module';

/** Lista de pistas del looper (el transporte y el menu de proyecto viven en la cabecera). */
@Component({
    selector: 'app-looper',
    templateUrl: './looper.component.html',
    styleUrls: ['./looper.component.css']
})
export class LooperComponent implements OnInit, OnDestroy {
    @Input() module: SynthStudioModule;
    private timer: any;

    get looper() {
        return this.module.sequencer;
    }

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
        return track.patch.kind == 'drums' || track.patch.kind == 'kit'
            ? (n.midi % 12) / 12 * 88
            : Math.max(0, Math.min(88, (n.midi - 24) / 72 * 88));
    }

    noteWidth(n: LoopNote): number {
        return Math.max(n.dur / this.looper.loopBeats * 100, 0.8);
    }
}
