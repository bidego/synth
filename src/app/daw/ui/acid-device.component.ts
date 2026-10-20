import { Component, ElementRef, HostListener, Input, AfterViewInit, ViewChild } from '@angular/core';
import { AcidLineModule, AC_PARAMS, AC_PRESETS } from '../modules/acid.module';
import { MoogScale } from '../../ui/moog-knob.component';
import { RackService } from '../core/rack.service';

interface KnobDef { id: string; cx: number; cy: number; scale: MoogScale; label: string; }
interface SectionDef { name: string; x0: number; x1: number; y: number; }
interface KeyDef { note: number; left: number; }

const W = 1340, H = 560;
const CY = 178;

/** Panel de Acid Line: chasis gris, tapa plateada con perillas negras y un teclado (la velocidad por encima del umbral es acento). */
@Component({
    selector: 'app-acid-device',
    template: `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <defs>
        <radialGradient id="mk-skirt" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="#8a8b90"/><stop offset="1" stop-color="#17181a"/></radialGradient>
        <radialGradient id="mk-face" cx="35%" cy="28%" r="90%"><stop offset="0" stop-color="#4b4b50"/><stop offset="1" stop-color="#0a0a0c"/></radialGradient>
    </defs>
</svg>
<div class="inputs" title="De donde recibe notas este instrumento">
    <span class="label">Recibe notas de</span>
    <span class="chip src" *ngFor="let c of rack.noteSources(module.id)">
        {{ rack.graph.find(c.fromModule)?.name }}
        <button class="ghost icon x" (click)="rack.disconnect(c.id)" title="Desconectar" [attr.aria-label]="'Desconectar ' + rack.graph.find(c.fromModule)?.name"><app-icon name="close" [size]="11"></app-icon></button>
    </span>
    <span class="none" *ngIf="!rack.noteSources(module.id).length">nada: conecta un teclado</span>
    <ng-container *ngFor="let k of keyboards">
        <button class="icon add" *ngIf="!rack.isNoteLinked(k.id, module.id)" (click)="rack.toggleNoteLink(k.id, module.id)" [title]="'Conectar ' + k.name">
            <app-icon name="plus" [size]="12"></app-icon> {{ k.name }}
        </button>
    </ng-container>
</div>
<p class="err" *ngIf="module.error">No se pudo cargar Acid Line: {{ module.error }}</p>
<div class="fit" #fit [style.height.px]="H * scale">
    <div class="stage" [style.transform]="'scale(' + scale + ')'">
        <div class="top"></div>

        <div class="brand">ACID LINE</div>
        <div class="stripe"><i></i><i></i><i></i></div>
        <div class="sub">BASS SYNTHESIZER</div>
        <div class="tiny" style="left:790px;top:44px">ACCENT</div>
        <i class="led acc" [class.on]="module.accentLit && module.gate" style="left:838px;top:41px"></i>
        <div class="tiny" style="left:900px;top:44px">GATE</div>
        <i class="led" [class.on]="module.gate" style="left:934px;top:41px"></i>
        <div class="tiny" style="left:1012px;top:14px">PRESET</div>
        <button class="step" style="left:1012px" (click)="stepPreset(-1)" aria-label="Sonido anterior">&lt;</button>
        <select class="presets" (change)="module.loadPreset($event.target.value)" aria-label="Sonido">
            <option *ngIf="!module.presetName" selected>(editado)</option>
            <optgroup *ngFor="let g of groups" [label]="g.name">
                <option *ngFor="let p of g.items" [value]="p.index" [selected]="p.name == module.presetName">{{ p.name }}</option>
            </optgroup>
        </select>
        <button class="step" style="left:1294px" (click)="stepPreset(1)" aria-label="Sonido siguiente">&gt;</button>

        <div class="sec" *ngFor="let s of sections" [style.left.px]="s.x0" [style.top.px]="s.y" [style.width.px]="s.x1 - s.x0"><span>{{ s.name }}</span></div>

        <!-- Forma de onda: sierra / cuadrada -->
        <div class="wave abs" style="left:56px;top:122px">
            <svg viewBox="0 0 24 14" width="30" height="18"><path d="M1 12 L16 2 L16 12 L23 12" class="wp"/></svg>
            <button class="rk" [class.on]="module.values.waveform >= 1" (click)="module.setParam('waveform', module.values.waveform >= 1 ? 0 : 1)" aria-label="Forma de onda: sierra o cuadrada">
                <span class="body"><i class="lever up"></i><i class="lever down"></i></span>
            </button>
            <svg viewBox="0 0 24 14" width="30" height="18"><path d="M1 12 L1 2 L12 2 L12 12 L23 12" class="wp"/></svg>
            <span class="wl">WAVEFORM</span>
        </div>

        <app-moog-knob *ngFor="let k of knobs" class="abs" [style.left.px]="k.cx - 52" [style.top.px]="k.cy - 52"
            [value]="module.values[k.id]" [min]="0" [max]="1" [step]="0" [default]="defOf(k.id)" [label]="k.label" [scale]="k.scale"
            [autoModule]="module.id" [autoParam]="'p.' + k.id" [ariaLabel]="k.label" [format]="fmt(k)" (valueChange)="module.setParam(k.id, $event)"></app-moog-knob>

        <div class="wheel abs" style="left:64px;top:338px" [style.backgroundPositionY.px]="pitch * 90" (pointerdown)="wheelDown($event)" title="Tono (vuelve al centro)"><i class="mark"></i></div>
        <div class="tiny dark" style="left:60px;top:528px;width:52px;text-align:center">PITCH</div>

        <div class="keys abs" style="left:136px;top:338px" (pointerup)="allKeysUp()" (pointerleave)="allKeysUp()" title="Mas abajo en la tecla = mas fuerte; por encima del umbral lleva acento">
            <div *ngFor="let k of whiteKeys" class="key w" [class.down]="down == k.note" [style.left.px]="k.left" (pointerdown)="keyDown(k.note, $event)"><b *ngIf="k.note % 12 == 0">C{{ k.note / 12 - 2 }}</b></div>
            <div *ngFor="let k of blackKeys" class="key b" [class.down]="down == k.note" [style.left.px]="k.left" (pointerdown)="keyDown(k.note, $event)"></div>
        </div>
    </div>
</div>`,
    styles: [`
:host { display: block; }
.inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; margin-bottom: 10px; }
.chip.src { padding-right: 2px; color: var(--accent); border-color: rgba(255, 79, 135, 0.45); }
.x { padding: 1px 3px; }
.none { color: var(--dim); }
.add { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.err { margin: 0 0 8px; color: var(--danger); font-size: 12px; }
.fit { position: relative; width: 100%; overflow: hidden; border-radius: 10px; background: #1b1c1f; }
.stage { position: absolute; left: 0; top: 0; width: 1340px; height: 560px; transform-origin: 0 0; overflow: hidden; background: linear-gradient(#34363b, #212327);
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #16171a; user-select: none; -webkit-user-select: none; --mk-ink: #16171a; --mk-ptr: #f4f2ea; }
.abs { position: absolute; }
.top { position: absolute; left: 22px; top: 10px; width: 1296px; height: 308px; border-radius: 8px; border: 1px solid #6b6e74;
    background: linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0) 90px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0 1px, rgba(0, 0, 0, 0.05) 1px 2px, transparent 2px 3px), linear-gradient(#d4d7db, #9fa3a9);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -2px 6px rgba(0, 0, 0, 0.35), 0 6px 14px rgba(0, 0, 0, 0.5); }
.brand { position: absolute; left: 56px; top: 22px; font: italic 800 34px/40px 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.01em; }
.stripe { position: absolute; left: 58px; top: 64px; width: 160px; height: 5px; display: flex; }
.stripe i { flex: 1; } .stripe i:nth-child(1) { background: #d8402a; } .stripe i:nth-child(2) { background: #ee8a1d; } .stripe i:nth-child(3) { background: #f2c21c; }
.sub { position: absolute; left: 240px; top: 52px; font: 700 10.5px/16px 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.12em; color: #33353a; }
.tiny { position: absolute; font: 700 9px/12px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #33353a; white-space: nowrap; }
.tiny.dark { color: #b9b7ae; }
.led { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: #5a2a14; border: 1px solid #000; }
.led.acc { background: #4b1411; } .led.acc.on { background: #ff4a2e; box-shadow: 0 0 10px 3px rgba(255, 74, 46, 0.6); }
.led.on { background: #ff9a3c; box-shadow: 0 0 10px 3px rgba(232, 116, 27, 0.6); }
.step { position: absolute; top: 28px; width: 34px; height: 28px; padding: 0; background: linear-gradient(#3b3d42, #1d1e21); border: 1px solid #1a1b1d; border-radius: 3px; color: #f4f2ea; font: 700 12px sans-serif; cursor: pointer; }
.step:hover { border-color: #e8741b; }
.presets { position: absolute; left: 1050px; top: 28px; width: 240px; height: 28px; background: #1d1e21; color: #f4f2ea; border: 1px solid #1a1b1d; border-radius: 3px; padding: 0 8px; font: 700 13px 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.sec { position: absolute; height: 16px; margin-top: -8px; display: flex; align-items: center; gap: 9px; font: 700 11px 'Helvetica Neue', Helvetica, Arial, sans-serif; white-space: nowrap; color: #16171a; }
.sec::before, .sec::after { content: ''; flex: 1; height: 8px; border-top: 1.5px solid #16171a; align-self: flex-start; margin-top: 8px; }
.sec::before { border-left: 1.5px solid #16171a; } .sec::after { border-right: 1.5px solid #16171a; }
app-moog-knob.abs { position: absolute; }

.wave { width: 100px; height: 130px; }
.wave svg { position: absolute; left: 36px; }
.wave svg:nth-of-type(1) { top: 0; } .wave svg:nth-of-type(2) { top: 100px; }
.wp { fill: none; stroke: #16171a; stroke-width: 1.5; }
.wl { position: absolute; left: 0; right: 0; top: 122px; text-align: center; font: 700 9.5px sans-serif; }
.rk { position: absolute; left: 34px; top: 22px; width: 32px; height: 76px; padding: 0; border: 0; background: none; cursor: pointer; }
.rk .body { position: absolute; left: 2px; top: 0; width: 26px; height: 76px; border-radius: 3px; background: #060607; box-shadow: 0 0 0 3px #8a8b90, 0 0 0 4px #2c2d31; }
.rk .lever { position: absolute; left: 2.5px; right: 2.5px; border-radius: 2.5px; }
.rk .lever.up { top: 1.5px; height: 28px; background: linear-gradient(#2a2a2d, #0d0d0f); }
.rk .lever.down { bottom: 1.5px; height: 44px; background: linear-gradient(#efece2, #9b988c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.rk.on .lever.up { height: 44px; background: linear-gradient(#efece2, #9b988c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.rk.on .lever.down { height: 28px; background: linear-gradient(#2a2a2d, #0d0d0f); box-shadow: none; }

.wheel { width: 44px; height: 190px; border-radius: 5px; border: 4px solid #050506; cursor: ns-resize; touch-action: none;
    background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.5) 0 1.6px, rgba(255, 255, 255, 0.1) 1.6px 3.4px, transparent 3.4px 9px),
        linear-gradient(90deg, #0d0d0f 0%, #5e5e64 35%, #77777d 50%, #2b2b2f 70%, #0d0d0f 100%);
    box-shadow: inset 0 34px 26px -18px rgba(0, 0, 0, 0.75), inset 0 -34px 26px -18px rgba(0, 0, 0, 0.75); }
.wheel .mark { position: absolute; left: -4px; right: -4px; top: 50%; margin-top: -1px; height: 2px; background: linear-gradient(90deg, #e8741b 0 4px, transparent 4px calc(100% - 4px), #e8741b calc(100% - 4px)); }

.keys { width: 1144px; height: 190px; }
.key { position: absolute; cursor: pointer; }
.key.w { top: 0; width: 52px; height: 190px; box-sizing: border-box; border: 1px solid #2a2a27; background: linear-gradient(#f7f4ea, #ddd8c8); }
.key.w::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 11px; background: #b9b4a4; }
.key.w b { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font: 700 10px sans-serif; color: #55534a; }
.key.w.down { background: linear-gradient(#e7c9a0, #c9a272); }
.key.w.down::after { height: 5px; }
.key.b { top: 0; width: 32px; height: 118px; z-index: 2; background: linear-gradient(#2b2b2f, #09090a); border: 1px solid #000; box-shadow: 2px 0 6px rgba(0, 0, 0, 0.45); }
.key.b.down { background: linear-gradient(#6a3b1d, #3d2011); }
`]
})
export class AcidDeviceComponent implements AfterViewInit {
    @Input() module: AcidLineModule;
    @ViewChild('fit', { static: false }) private fitRef: ElementRef<HTMLElement>;

    public H = H;
    public scale = 0.7;
    public pitch = 0;
    public down = -1;

    public groups: Array<{ name: string; items: Array<{ name: string; index: number }> }> = AC_PRESETS.reduce((acc, p, index) => {
        let g = acc.find(x => x.name == p.category);
        if (!g)
            acc.push(g = { name: p.category, items: [] });
        g.items.push({ name: p.name, index });
        return acc;
    }, []);

    public sections: Array<SectionDef> = [
        { name: 'OSCILLATOR', x0: 40, x1: 262, y: 100 }, { name: 'FILTER AND CONTOUR', x0: 278, x1: 710, y: 100 }, { name: 'ACCENT', x0: 726, x1: 950, y: 100 },
        { name: 'SLIDE AND DRIVE', x0: 966, x1: 1170, y: 100 }, { name: 'OUTPUT', x0: 1186, x1: 1300, y: 100 }
    ];
    public knobs: Array<KnobDef> = [
        { id: 'tune', cx: 208, cy: CY, scale: 'bipolar', label: 'Tuning' },
        { id: 'cutoff', cx: 330, cy: CY, scale: 'ten', label: 'Cutoff frequency' }, { id: 'resonance', cx: 440, cy: CY, scale: 'ten', label: 'Resonance' },
        { id: 'envMod', cx: 550, cy: CY, scale: 'ten', label: 'Env mod' }, { id: 'decay', cx: 660, cy: CY, scale: 'ten', label: 'Decay' },
        { id: 'accent', cx: 774, cy: CY, scale: 'ten', label: 'Accent' }, { id: 'accentVel', cx: 886, cy: CY, scale: 'ten', label: 'Velocity threshold' },
        { id: 'slideTime', cx: 1018, cy: CY, scale: 'ten', label: 'Slide time' }, { id: 'drive', cx: 1124, cy: CY, scale: 'ten', label: 'Drive' },
        { id: 'volume', cx: 1244, cy: CY, scale: 'ten', label: 'Volume' }
    ];

    // Teclado: C2 a C6 (la octava de un bajo)
    public whiteKeys: Array<KeyDef> = [];
    public blackKeys: Array<KeyDef> = [];

    constructor(public rack: RackService) {
        let white = 0;
        for (let n = 36; n <= 79; n++) {
            if ([1, 3, 6, 8, 10].indexOf(n % 12) >= 0)
                this.blackKeys.push({ note: n, left: white * 52 - 16 });
            else
                this.whiteKeys.push({ note: n, left: white++ * 52 });
        }
        // 22 teclas blancas entran en 1144 px
        this.whiteKeys = this.whiteKeys.slice(0, 22);
        this.blackKeys = this.blackKeys.filter(k => k.left + 16 < 22 * 52);
    }

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    ngAfterViewInit() {
        setTimeout(() => this.fit());
    }

    @HostListener('window:resize')
    fit() {
        const el = this.fitRef && this.fitRef.nativeElement;
        if (el && el.clientWidth)
            this.scale = Math.max(0.3, Math.min(1.1, el.clientWidth / W));
    }

    defOf(id: string): number {
        return AC_PARAMS.find(p => p.id == id).def;
    }

    fmt(k: KnobDef) {
        return (v: number) => k.scale == 'bipolar' ? ((v - 0.5) * 10).toFixed(1) : (v * 10).toFixed(1);
    }

    stepPreset(delta: number) {
        const n = AC_PRESETS.length;
        const current = AC_PRESETS.findIndex(p => p.name == this.module.presetName);
        this.module.loadPreset((current < 0 ? 0 : current + delta + n) % n);
    }

    wheelDown(e: PointerEvent) {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const startY = e.clientY, start = this.pitch, span = 95 * this.scale;
        const move = (ev: PointerEvent) => {
            this.pitch = Math.max(-1, Math.min(1, start + (startY - ev.clientY) / span));
            this.module.setBend(this.pitch);
        };
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            this.pitch = 0;
            this.module.setBend(0);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    keyDown(note: number, e: PointerEvent) {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        // Mas abajo en la tecla = mas fuerte (y por encima del umbral, acento)
        const vel = Math.max(0.3, Math.min(1, 0.35 + 0.65 * (e.clientY - r.top) / Math.max(1, r.height)));
        // Una tecla apretada mientras otra suena queda ligada (slide)
        this.down = note;
        this.module.receive({ type: 'on', midi: note, velocity: vel }, 'notes');
    }

    allKeysUp() {
        if (this.down >= 0) {
            this.module.receive({ type: 'off', midi: this.down }, 'notes');
            this.down = -1;
        }
    }
}
