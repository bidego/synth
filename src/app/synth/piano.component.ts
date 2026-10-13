import { Component, OnInit } from '@angular/core';
import { SynthEngine } from '../services/synth.engine';
import { KEY_SPAN, TOP_ROW, BOTTOM_ROW, defaultLabel, noteName } from '../services/keyboard-map';

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
        return noteName(this.engine.baseMidi + key.offset);
    }

    // Indice en la fila de teclas de una nota (o -1 si esa fila no la cubre)
    private rowIndex(offset: number, rowStart: number): number {
        return offset - rowStart;
    }

    down(key: PianoKey) {
        this.engine.noteOn('mouse', key.offset);
    }
    up() {
        this.engine.noteOff('mouse');
    }
}
