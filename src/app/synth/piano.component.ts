import { Component, OnInit } from '@angular/core';
import { SynthEngine } from '../services/synth.engine';
import { KEY_SPAN, TOP_ROW, BOTTOM_ROW, defaultLabel, noteName } from '../services/keyboard-map';
import { DRUM_NAMES } from './drums';
import { GM_DRUM_SHORT, KIT_NOTE_OFFSET } from '../services/gm';

const WHITE_WIDTH = 46;
const BLACK_WIDTH = 30;
const BLACK_STEPS = [1, 3, 6, 8, 10];

interface PianoKey {
    offset: number;
    black: boolean;
    left: number;
    width: number;
    top: string;     // tecla fisica de la fila de arriba que toca esta nota
    bottom: string;  // tecla fisica de la fila de abajo
}

@Component({
    selector: 'app-piano',
    templateUrl: './piano.component.html',
    styleUrls: ['./piano.component.css']
})
export class PianoComponent implements OnInit {
    public keys: Array<PianoKey> = [];
    public width: number;
    private labels: { [code: string]: string } = {};

    constructor(public engine: SynthEngine) {}

    ngOnInit() {
        let whites = 0;
        for (let offset = 0; offset < KEY_SPAN; offset++) {
            const black = BLACK_STEPS.indexOf(offset % 12) >= 0;
            this.keys.push({
                offset, black,
                left: black ? whites * WHITE_WIDTH - BLACK_WIDTH / 2 : whites * WHITE_WIDTH,
                width: black ? BLACK_WIDTH : WHITE_WIDTH - 2,
                top: TOP_ROW[this.rowIndex(offset, 12)],
                bottom: BOTTOM_ROW[this.rowIndex(offset, 0)]
            });
            if (!black)
                whites++;
        }
        this.width = whites * WHITE_WIDTH;
        this.loadLayoutLabels();
    }

    // Etiquetas reales de la tecla segun el layout del usuario (Chrome); si no, las de US
    private loadLayoutLabels() {
        const keyboard = (navigator as any).keyboard;
        if (!keyboard || !keyboard.getLayoutMap)
            return;
        keyboard.getLayoutMap().then(map => {
            TOP_ROW.concat(BOTTOM_ROW).forEach(code => {
                const label = map.get(code);
                if (label)
                    this.labels[code] = label.toUpperCase();
            });
        });
    }

    label(code: string): string {
        return code ? (this.labels[code] || defaultLabel(code)) : '';
    }

    name(key: PianoKey): string {
        const midi = this.engine.baseMidi + key.offset;
        switch (this.engine.patch.kind) {
            case 'drums': return DRUM_NAMES[midi % 12];
            case 'kit': return GM_DRUM_SHORT[midi - KIT_NOTE_OFFSET] || '';
            default: return noteName(midi);
        }
    }

    // Indice en la fila de teclas de una nota (o -1 si esa fila no la cubre)
    private rowIndex(offset: number, rowStart: number): number {
        return offset - rowStart;
    }

    /**
     * Pointer events: sirven para mouse, lapiz y pantallas tactiles (varios dedos a la vez).
     * La velocidad depende de donde se toca la tecla: arriba suave, abajo fuerte.
     */
    down(key: PianoKey, event: PointerEvent) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const along = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        this.engine.noteOnMidi(this.pointerId(event), this.engine.baseMidi + key.offset, 0.25 + 0.75 * along);
    }

    up(event: PointerEvent) {
        this.engine.noteOff(this.pointerId(event));
    }

    private pointerId(event: PointerEvent): string {
        return 'ptr' + event.pointerId;
    }
}
