import { Component } from '@angular/core';
import { SynthEngine } from '../services/synth.engine';
import { makeSamplerPatch, makeKitPatch } from '../services/presets';
import { BANK_FONTS, FAMILIES, GM_PROGRAMS, DRUM_KITS } from '../services/gm';

@Component({
    selector: 'app-bank-browser',
    templateUrl: './bank-browser.component.html',
    styleUrls: ['./bank-browser.component.css']
})
export class BankBrowserComponent {
    public fonts = BANK_FONTS;
    public families = FAMILIES;
    public kits = DRUM_KITS;
    public names = GM_PROGRAMS;
    public font = BANK_FONTS[0].id;
    public family = 0;

    constructor(public engine: SynthEngine) {}

    get programs(): Array<number> {
        return [0, 1, 2, 3, 4, 5, 6, 7].map(i => this.family * 8 + i);
    }

    get credits(): Array<string> {
        return BANK_FONTS.map(f => f.credit);
    }

    isCurrent(program: number): boolean {
        const p = this.engine.patch;
        return p.kind == 'sampler' && !!p.sample && p.sample.font == this.font && p.sample.id == program;
    }

    isCurrentKit(id: number): boolean {
        const p = this.engine.patch;
        return p.kind == 'kit' && !!p.sample && p.sample.id == id;
    }

    pick(program: number) {
        this.engine.loadPatch(makeSamplerPatch(this.font, program, GM_PROGRAMS[program]));
    }

    pickKit(id: number, label: string) {
        this.engine.loadPatch(makeKitPatch(id, label + ' Kit'));
    }
}
