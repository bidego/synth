import { Component, OnInit } from '@angular/core';
import { SynthEngine } from '../services/synth.engine';
import { KEY_SPAN, TOP_ROW, BOTTOM_ROW, defaultLabel, noteName } from '../services/keyboard-map';
import { DRUM_NAMES } from './drums';
import { GM_DRUM_SHORT, KIT_NOTE_OFFSET } from '../services/gm';

const BLACK_STEPS = [1, 3, 6, 8, 10];

interface PianoKey {
    offset: number;
    black: boolean;
    left: number;    // % del ancho total
    width: number;   // % del ancho total
    top: string;     // tecla fisica de la fila de arriba que toca esta nota
    bottom: string;  // tecla fisica de la fila de abajo
}

/** Teclado en pantalla (ancho fluido) con la barra de octava, nivel y voces. */
@Component({
    selector: 'app-piano',
    templateUrl: './piano.component.html',
    styleUrls: ['./piano.component.css']
})
export class PianoComponent implements OnInit {
    public keys: Array<PianoKey> = [];
    private labels: { [code: string]: string } = {};

    constructor(public engine: SynthEngine) {}

    ngOnInit() {
        // Primera pasada: posicion en "teclas blancas"; el ancho total se conoce al final
        const raw: Array<{ offset: number; black: boolean; whites: number }> = [];
        let whites = 0;
        for (let offset = 0; offset < KEY_SPAN; offset++) {
            const black = BLACK_STEPS.indexOf(offset % 12) >= 0;
            raw.push({ offset, black, whites });
            if (!black)
                whites++;
        }
        const unit = 100 / whites;
        this.keys = raw.map(k => {
            const width = k.black ? unit * 0.62 : unit - 0.3;
            return {
                offset: k.offset, black: k.black,
                left: k.black ? k.whites * unit - width / 2 : k.whites * unit,
                width,
                top: TOP_ROW[k.offset - 12],
                bottom: BOTTOM_ROW[k.offset]
            };
        });
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

    get range(): string {
        const base = this.engine.baseMidi;
        return noteName(base) + ' - ' + noteName(base + KEY_SPAN - 1);
    }

    setLevel(value) {
        this.engine.level = parseFloat(value);
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
