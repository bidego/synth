import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { PolyFiveModule, PF_PARAMS, PF_PRESETS } from '../modules/polyfive.module';
import { MoogScale } from '../../ui/moog-knob.component';
import { RackService } from '../core/rack.service';

interface KnobDef { id: string; cx: number; cy: number; scale: MoogScale; label: string; }
interface RockerDef { id: string; cx: number; top: number; label: string; }
interface SectionDef { name: string; x0: number; x1: number; y: number; }
interface KeyDef { note: number; black: boolean; left: number; width: number; }

const W = 1960, H = 800;
const ROW_A_KNOB_TOP = 100, ROW_B_KNOB_TOP = 318;
const YA = ROW_A_KNOB_TOP + 52, YB = ROW_B_KNOB_TOP + 52;

/** Panel del Model D: el mismo del plugin (madera, panel negro, perillas con escala, interruptores de palanca, ruedas y teclado). */
@Component({
    selector: 'app-polyfive-device',
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
<p class="err" *ngIf="module.error">No se pudo cargar Poly Five: {{ module.error }}</p>
<div class="fit" #fit [style.height.px]="H * scale">
    <div class="stage" [style.transform]="'scale(' + scale + ')'">
        <div class="wood l"></div><div class="wood r"></div>
        <div class="panel"></div>

        <div class="brand">POLY FIVE</div>
        <div class="bar"></div>
        <div class="sub">POLYPHONIC SYNTHESIZER</div>
        <div class="tiny" style="left:1380px;top:33px;width:48px;text-align:right">VOICES</div>
        <i class="led v" *ngFor="let i of [0, 1, 2, 3, 4]" [class.on]="i < module.heldCount" [style.left.px]="1440 + i * 18"></i>
        <div class="tiny" style="left:1542px;top:12px">PRESET</div>
        <button class="step" style="left:1542px" (click)="stepPreset(-1)" aria-label="Sonido anterior">&lt;</button>
        <select class="presets" (change)="module.loadPreset($event.target.value)" aria-label="Sonido">
            <option *ngIf="!module.presetName" selected>(editado)</option>
            <optgroup *ngFor="let g of groups" [label]="g.name">
                <option *ngFor="let p of g.items" [value]="p.index" [selected]="p.name == module.presetName">{{ p.name }}</option>
            </optgroup>
        </select>
        <button class="step" style="left:1834px" (click)="stepPreset(1)" aria-label="Sonido siguiente">&gt;</button>

        <div class="sec" *ngFor="let s of sections" [style.left.px]="s.x0" [style.top.px]="s.y" [style.width.px]="s.x1 - s.x0"><span>{{ s.name }}</span></div>
        <div class="tiny" style="left:1380px;top:312px;width:300px;text-align:center;top:432px">WHEEL-MOD DESTINATIONS</div>

        <app-moog-knob *ngFor="let k of knobs" class="abs" [style.left.px]="k.cx - 52" [style.top.px]="k.cy - 52"
            [value]="module.values[k.id]" [min]="0" [max]="maxOf(k)" [step]="stepOf(k)" [default]="defOf(k.id)" [label]="k.label" [scale]="k.scale" [steps]="stepsOf(k)"
            [autoModule]="module.id" [autoParam]="isStepped(k) ? '' : 'p.' + k.id" [ariaLabel]="k.label" [format]="fmt(k)" (valueChange)="module.setParam(k.id, $event)"></app-moog-knob>

        <button class="rocker abs" *ngFor="let r of rockers" [class.on]="module.values[r.id] >= 1" [style.left.px]="r.cx - 28" [style.top.px]="r.top"
            (click)="module.setParam(r.id, module.values[r.id] >= 1 ? 0 : 1)" [attr.aria-pressed]="module.values[r.id] >= 1" [attr.aria-label]="r.label">
            <span class="lab">{{ r.label }}</span><span class="body"><i class="lever up"></i><i class="lever down"></i></span>
        </button>

        <div class="wheel abs" style="left:104px;top:574px" [style.backgroundPositionY.px]="pitch * 90 + 0" (pointerdown)="wheelDown($event, 'pitch')" title="Tono (vuelve al centro)"><i class="mark"></i></div>
        <div class="wheel abs" style="left:158px;top:574px" [style.backgroundPositionY.px]="mod * 90" (pointerdown)="wheelDown($event, 'mod')" title="Modulacion"></div>
        <div class="tiny" style="left:100px;top:764px;width:52px;text-align:center">PITCH</div>
        <div class="tiny" style="left:154px;top:764px;width:52px;text-align:center">MOD</div>

        <div class="keys abs" style="left:230px;top:574px" (pointerup)="allKeysUp()" (pointerleave)="allKeysUp()">
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
.fit { position: relative; width: 100%; overflow: hidden; border-radius: 10px; background: #0b0a09; }
.stage { position: absolute; left: 0; top: 0; width: 1960px; height: 800px; transform-origin: 0 0; background: #0b0a09; overflow: hidden;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #f4f2ea; user-select: none; -webkit-user-select: none; }
.abs { position: absolute; }
.wood { position: absolute; top: 0; bottom: 0; width: 70px;
    background-image: repeating-linear-gradient(91deg, rgba(42, 21, 9, 0.16) 0 2px, transparent 2px 9px), repeating-linear-gradient(88.5deg, rgba(194, 138, 88, 0.1) 0 1px, transparent 1px 13px),
        linear-gradient(90deg, rgba(255, 255, 255, 0) 10%, rgba(255, 255, 255, 0.12) 28%, rgba(255, 255, 255, 0) 45%), linear-gradient(90deg, #82502c, #4a2813);
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.55), inset 0 60px 40px -30px rgba(0, 0, 0, 0.5), inset 0 -80px 50px -40px rgba(0, 0, 0, 0.55); }
.wood.l { left: 0; } .wood.r { right: 0; }
.panel { position: absolute; left: 70px; top: 10px; width: 1820px; height: 516px; border-radius: 7px; border: 1.5px solid #39393d;
    background: linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 200px), linear-gradient(#19191c, #0a0a0c); box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.12); }
.brand { position: absolute; left: 94px; top: 16px; height: 40px; font: 800 32px/40px 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.01em; }
.bar { position: absolute; left: 94px; top: 56px; width: 150px; height: 3px; background: #e8741b; }
.sub { position: absolute; left: 260px; top: 40px; font: 700 10.5px/16px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #b9b7ae; }
.tiny { position: absolute; font: 700 9px/12px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #b9b7ae; white-space: nowrap; }
.led.v { top: 32px; }
.led { position: absolute; left: 1142px; top: 32px; width: 12px; height: 12px; border-radius: 50%; background: #3c1f0c; border: 1px solid #000; }
.led.on { background: #ff9a3c; box-shadow: 0 0 10px 3px rgba(232, 116, 27, 0.6); }
.step { position: absolute; top: 24px; width: 34px; height: 28px; padding: 0; background: linear-gradient(#26262a, #101012); border: 1px solid #55554f; border-radius: 3px; color: #f4f2ea; font: 700 12px sans-serif; cursor: pointer; }
.step:hover { border-color: #9a9890; }
.presets { position: absolute; left: 1580px; top: 24px; width: 250px; height: 28px; background: #17171a; color: #f4f2ea; border: 1px solid #55554f; border-radius: 3px; padding: 0 8px; font: 700 13px 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.sec { position: absolute; height: 16px; margin-top: -8px; display: flex; align-items: center; gap: 9px; font: 700 11px 'Helvetica Neue', Helvetica, Arial, sans-serif; white-space: nowrap; }
.sec::before, .sec::after { content: ''; flex: 1; height: 8px; border-top: 1.5px solid #d9d6cb; align-self: flex-start; margin-top: 8px; }
.sec::before { border-left: 1.5px solid #d9d6cb; } .sec::after { border-right: 1.5px solid #d9d6cb; }
app-moog-knob.abs { position: absolute; }

.rocker { width: 56px; height: 74px; padding: 0; border: 0; background: none; cursor: pointer; color: #f4f2ea; }
.rocker .lab { position: absolute; left: 0; right: 0; top: 0; height: 22px; display: flex; align-items: flex-end; justify-content: center; text-align: center; font: 700 9px/1.05 'Helvetica Neue', Helvetica, Arial, sans-serif; text-transform: uppercase; }
.rocker .body { position: absolute; left: 15px; top: 29px; width: 26px; height: 40px; border-radius: 3px; background: #060607; box-shadow: 0 0 0 3px #8a8b90, 0 0 0 4px #2c2d31; }
.rocker .lever { position: absolute; left: 2.5px; right: 2.5px; border-radius: 2.5px; }
.rocker .lever.up { top: 1.5px; height: 14px; background: linear-gradient(#2a2a2d, #0d0d0f); }
.rocker .lever.down { bottom: 1.5px; height: 23px; background: linear-gradient(#efece2, #9b988c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.rocker .lever.down::after { content: ''; position: absolute; left: 4px; right: 4px; top: 50%; height: 2px; margin-top: -1px; background: #6d6b63; }
.rocker.on .lever.up { height: 23px; background: linear-gradient(#efece2, #9b988c); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5); }
.rocker.on .lever.up::after { content: ''; position: absolute; left: 4px; right: 4px; top: 50%; height: 2px; margin-top: -1px; background: #e8741b; }
.rocker.on .lever.down { height: 14px; background: linear-gradient(#2a2a2d, #0d0d0f); box-shadow: none; }
.rocker.on .lever.down::after { display: none; }
.rocker:hover .body { box-shadow: 0 0 0 3px #b7b8bc, 0 0 0 4px #2c2d31; }

.wheel { width: 44px; height: 190px; border-radius: 5px; border: 4px solid #050506; cursor: ns-resize; touch-action: none;
    background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.5) 0 1.6px, rgba(255, 255, 255, 0.1) 1.6px 3.4px, transparent 3.4px 9px),
        linear-gradient(90deg, #0d0d0f 0%, #5e5e64 35%, #77777d 50%, #2b2b2f 70%, #0d0d0f 100%);
    box-shadow: inset 0 34px 26px -18px rgba(0, 0, 0, 0.75), inset 0 -34px 26px -18px rgba(0, 0, 0, 0.75); }
.wheel .mark { position: absolute; left: -4px; right: -4px; top: 50%; margin-top: -1px; height: 2px; background: linear-gradient(90deg, #e8741b 0 4px, transparent 4px calc(100% - 4px), #e8741b calc(100% - 4px)); }

.keys { width: 1656px; height: 190px; }
.key { position: absolute; cursor: pointer; }
.key.w { top: 0; width: 46px; height: 190px; box-sizing: border-box; border: 1px solid #2a2a27; background: linear-gradient(#f7f4ea, #ddd8c8); }
.key.w::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 11px; background: #b9b4a4; }
.key.w b { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font: 700 10px sans-serif; color: #55534a; }
.key.w.down { background: linear-gradient(#e7c9a0, #c9a272); }
.key.w.down::after { height: 5px; }
.key.b { top: 0; width: 28px; height: 118px; z-index: 2; background: linear-gradient(#2b2b2f, #09090a); border: 1px solid #000; box-shadow: 2px 0 6px rgba(0, 0, 0, 0.45); }
.key.b.down { background: linear-gradient(#6a3b1d, #3d2011); }
`]
})
export class PolyFiveDeviceComponent implements OnInit, AfterViewInit, OnDestroy {
    @Input() module: PolyFiveModule;
    @ViewChild('fit', { static: false }) private fitRef: ElementRef<HTMLElement>;

    public H = H;
    public scale = 0.7;
    public pitch = 0;
    public mod = 0;
    public down = -1;

    public groups: Array<{ name: string; items: Array<{ name: string; index: number }> }> = PF_PRESETS.reduce((acc, p, index) => {
        let g = acc.find(x => x.name == p.category);
        if (!g)
            acc.push(g = { name: p.category, items: [] });
        g.items.push({ name: p.name, index });
        return acc;
    }, []);

    // Las mismas posiciones que el panel del plugin
    public sections: Array<SectionDef> = [
        { name: 'OSCILLATOR A', x0: 92, x1: 394, y: 84 }, { name: 'OSCILLATOR B', x0: 410, x1: 880, y: 84 }, { name: 'POLY-MOD', x0: 896, x1: 1140, y: 84 },
        { name: 'MIXER', x0: 1156, x1: 1470, y: 84 }, { name: 'PERFORMANCE', x0: 1490, x1: 1890, y: 84 },
        { name: 'FILTER', x0: 92, x1: 520, y: 300 }, { name: 'FILTER ENVELOPE', x0: 536, x1: 930, y: 300 }, { name: 'AMPLIFIER ENVELOPE', x0: 946, x1: 1340, y: 300 },
        { name: 'LFO AND WHEEL-MOD', x0: 1360, x1: 1770, y: 300 }
    ];
    public knobs: Array<KnobDef> = [
        { id: 'aOct', cx: 138, cy: YA, scale: 'steps', label: 'Octave' }, { id: 'aTune', cx: 234, cy: YA, scale: 'bipolar', label: 'Tune' }, { id: 'aPw', cx: 330, cy: YA, scale: 'ten', label: 'Pulse width' },
        { id: 'bOct', cx: 478, cy: YA, scale: 'steps', label: 'Octave' }, { id: 'bFreq', cx: 574, cy: YA, scale: 'bipolar', label: 'Frequency' }, { id: 'bFine', cx: 670, cy: YA, scale: 'bipolar', label: 'Fine' }, { id: 'bPw', cx: 766, cy: YA, scale: 'ten', label: 'Pulse width' },
        { id: 'pmEnv', cx: 962, cy: YA, scale: 'ten', label: 'Filter env' }, { id: 'pmB', cx: 1058, cy: YA, scale: 'ten', label: 'Osc B' },
        { id: 'mixA', cx: 1226, cy: YA, scale: 'ten', label: 'Osc A' }, { id: 'mixB', cx: 1322, cy: YA, scale: 'ten', label: 'Osc B' }, { id: 'mixNoise', cx: 1418, cy: YA, scale: 'ten', label: 'Noise' },
        { id: 'glide', cx: 1558, cy: YA, scale: 'ten', label: 'Glide' }, { id: 'tune', cx: 1654, cy: YA, scale: 'bipolar', label: 'Master tune' }, { id: 'volume', cx: 1750, cy: YA, scale: 'ten', label: 'Volume' }, { id: 'velocity', cx: 1846, cy: YA, scale: 'ten', label: 'Velocity' },
        { id: 'cutoff', cx: 138, cy: YB, scale: 'ten', label: 'Cutoff' }, { id: 'resonance', cx: 234, cy: YB, scale: 'ten', label: 'Resonance' }, { id: 'envAmt', cx: 330, cy: YB, scale: 'ten', label: 'Envelope amount' }, { id: 'kbdTrack', cx: 426, cy: YB, scale: 'steps', label: 'Keyboard' },
        { id: 'fAtk', cx: 586, cy: YB, scale: 'ten', label: 'Attack' }, { id: 'fDec', cx: 682, cy: YB, scale: 'ten', label: 'Decay' }, { id: 'fSus', cx: 778, cy: YB, scale: 'ten', label: 'Sustain' }, { id: 'fRel', cx: 874, cy: YB, scale: 'ten', label: 'Release' },
        { id: 'aAtk', cx: 1002, cy: YB, scale: 'ten', label: 'Attack' }, { id: 'aDec', cx: 1098, cy: YB, scale: 'ten', label: 'Decay' }, { id: 'aSus', cx: 1194, cy: YB, scale: 'ten', label: 'Sustain' }, { id: 'aRel', cx: 1290, cy: YB, scale: 'ten', label: 'Release' },
        { id: 'lfoFreq', cx: 1426, cy: YB, scale: 'ten', label: 'Frequency' }, { id: 'lfoShape', cx: 1522, cy: YB, scale: 'steps', label: 'Shape' }, { id: 'lfoAmt', cx: 1618, cy: YB, scale: 'ten', label: 'Initial amount' }, { id: 'wmMix', cx: 1714, cy: YB, scale: 'ten', label: 'LFO / noise' }
    ];
    public rockers: Array<RockerDef> = [
        { id: 'aSaw', cx: 138, top: 214, label: 'Saw' }, { id: 'aPulse', cx: 234, top: 214, label: 'Pulse' }, { id: 'sync', cx: 330, top: 214, label: 'Sync' },
        { id: 'bSaw', cx: 450, top: 214, label: 'Saw' }, { id: 'bTri', cx: 530, top: 214, label: 'Triangle' }, { id: 'bPulse', cx: 610, top: 214, label: 'Pulse' }, { id: 'bLow', cx: 690, top: 214, label: 'Low freq' }, { id: 'bKbd', cx: 770, top: 214, label: 'Keyboard' },
        { id: 'pmFreqA', cx: 936, top: 214, label: 'Freq A' }, { id: 'pmPwA', cx: 1008, top: 214, label: 'PW A' }, { id: 'pmFilter', cx: 1080, top: 214, label: 'Filter' },
        { id: 'glideOn', cx: 1558, top: 214, label: 'Glide' }, { id: 'unison', cx: 1654, top: 214, label: 'Unison' },
        { id: 'wmFreqA', cx: 1426, top: 438, label: 'Freq A' }, { id: 'wmFreqB', cx: 1482, top: 438, label: 'Freq B' }, { id: 'wmPwA', cx: 1538, top: 438, label: 'PW A' }, { id: 'wmPwB', cx: 1594, top: 438, label: 'PW B' }, { id: 'wmFilter', cx: 1650, top: 438, label: 'Filter' }
    ];

    // Teclado: F2 a C6 (44 teclas)
    public whiteKeys: Array<KeyDef> = [];
    public blackKeys: Array<KeyDef> = [];

    private bendSpring: any;

    constructor(private host: ElementRef, public rack: RackService) {
        let white = 0;
        for (let n = 36; n <= 96; n++) {
            const black = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0;
            if (black)
                this.blackKeys.push({ note: n, black, left: white * 46 - 14, width: 28 });
            else
                this.whiteKeys.push({ note: n, black, left: white++ * 46, width: 46 });
        }
    }

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    ngOnInit() {}

    ngAfterViewInit() {
        setTimeout(() => this.fit());
    }

    ngOnDestroy() {
        clearTimeout(this.bendSpring);
    }

    @HostListener('window:resize')
    fit() {
        const el = this.fitRef && this.fitRef.nativeElement;
        if (el && el.clientWidth)
            this.scale = Math.max(0.3, Math.min(1.1, el.clientWidth / W));
    }

    isStepped(k: KnobDef): boolean {
        return this.def(k.id).choices > 0;
    }

    def(id: string) {
        return PF_PARAMS.find(p => p.id == id);
    }

    defOf(id: string): number {
        return this.def(id).def;
    }

    maxOf(k: KnobDef): number {
        const c = this.def(k.id).choices;
        return c ? c - 1 : 1;
    }

    stepOf(k: KnobDef): number {
        return this.def(k.id).choices ? 1 : 0;
    }

    stepsOf(k: KnobDef): Array<string> {
        if (k.id == 'kbdTrack') return ['OFF', '1/2', 'FULL'];
        if (k.id == 'lfoShape') return ['TRI', 'SAW', 'SQR'];
        return k.scale == 'steps' ? this.def(k.id).labels : [];
    }

    /** Lo que muestra el tooltip de una perilla: el numero del panel, o el nombre de la posicion. */
    fmt(k: KnobDef) {
        const def = this.def(k.id);
        return (v: number) => def.choices ? def.labels[Math.round(v)] : k.scale == 'bipolar' ? ((v - 0.5) * 10).toFixed(1) : (v * 10).toFixed(1);
    }

    stepPreset(delta: number) {
        const n = PF_PRESETS.length;
        const current = PF_PRESETS.findIndex(p => p.name == this.module.presetName);
        this.module.loadPreset((current < 0 ? 0 : current + delta + n) % n);
    }

    // --- Ruedas ---
    wheelDown(e: PointerEvent, which: 'pitch' | 'mod') {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const startY = e.clientY, start = which == 'pitch' ? this.pitch : this.mod;
        const span = 95 * this.scale * (which == 'pitch' ? 1 : 1.8);
        const move = (ev: PointerEvent) => {
            const v = start + (startY - ev.clientY) / span;
            if (which == 'pitch') {
                this.pitch = Math.max(-1, Math.min(1, v));
                this.module.setBend(this.pitch);
            } else {
                this.mod = Math.max(0, Math.min(1, v));
                this.module.setModWheel(this.mod);
            }
        };
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            if (which == 'pitch') {
                this.pitch = 0;
                this.module.setBend(0);
            }
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    // --- Teclado en pantalla ---
    keyDown(note: number, e: PointerEvent) {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        // Mas abajo en la tecla = mas fuerte
        const vel = Math.max(0.3, Math.min(1, 0.35 + 0.65 * (e.clientY - r.top) / Math.max(1, r.height)));
        if (this.down >= 0 && this.down != note)
            this.module.receive({ type: 'off', midi: this.down }, 'notes');
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
