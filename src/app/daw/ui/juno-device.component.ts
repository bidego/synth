import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { JunoModule, JUNO_PARAMS, JUNO_PRESETS } from '../modules/juno.module';
import { RackService } from '../core/rack.service';

interface SwitchDef {
    id: string;
    label: string;
    opts: Array<{ v: number; l: string }>;
}

interface Section {
    name: string;
    sliders: Array<string>;
    switches: Array<SwitchDef>;
}

/** Panel frontal del Juno-106: las mismas secciones y en el mismo orden que el instrumento original. */
@Component({
    selector: 'app-juno-device',
    template: `
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
<div class="juno">
    <div class="brand">
        <span class="logo">JUNO-106</span>
        <span class="sub">POLYPHONIC SYNTHESIZER</span>
        <span class="stripe"><i></i><i></i><i></i><i></i></span>
        <span class="learn">
            <button [class.on]="module.learn" (click)="module.setLearn(!module.learn)" title="Asigna las perillas de tu controlador MIDI a los controles del panel">MIDI Learn</button>
            <button *ngIf="module.learn" (click)="module.clearCcMap()" title="Borra todas las asignaciones">Borrar</button>
            <small *ngIf="module.lastCc" title="Lo ultimo que mando el controlador">{{ module.lastCc }}</small>
        </span>
        <span class="leds" title="Voces sonando"><i *ngFor="let n of leds" [class.on]="n < voices"></i></span>
        <select class="presets" (change)="module.loadPreset($event.target.value)" aria-label="Sonido">
            <option *ngIf="!module.presetName" selected>(editado)</option>
            <option *ngFor="let p of presets; let i = index" [value]="i" [selected]="p.name == module.presetName">{{ p.name }}</option>
        </select>
    </div>
    <p class="learnhint" *ngIf="module.learn">
        <b>MIDI Learn:</b> toca un control del panel (queda resaltado) y mueve la perilla o el fader de tu controlador que quieras asignarle.
        <ng-container *ngIf="module.learnTarget">Esperando una perilla para <b>{{ label(module.learnTarget) }}</b>&hellip;</ng-container>
        Vuelve a tocar "MIDI Learn" para terminar.
    </p>
    <div class="panel-row" [class.learning]="module.learn">
        <div class="bender" title="Bender (vuelve al centro al soltarlo)">
            <span class="head">Bender</span>
            <input #bender type="range" min="-1" max="1" step="0.01" value="0" aria-label="Bender"
                (input)="module.setBend($event.target.valueAsNumber)"
                (pointerup)="bender.value = 0; module.setBend(0)" (pointercancel)="bender.value = 0; module.setBend(0)" (blur)="bender.value = 0; module.setBend(0)">
        </div>
        <section class="sec" *ngFor="let s of sections">
            <span class="head"><i></i>{{ s.name }}<i></i></span>
            <div class="body">
                <div class="sl" *ngFor="let id of s.sliders" [class.target]="module.learnTarget == id" (click)="pick(id)">
                    <app-juno-slider [length]="112" [value]="module.values[id]" [min]="0" [max]="1" [step]="step" [default]="def(id)" [format]="fmt"
                        [autoModule]="module.id" [autoParam]="'p.' + id" [ariaLabel]="label(id)" [label]="label(id)" (valueChange)="module.setParam(id, $event)"></app-juno-slider>
 <span class="lab">{{ label(id) }}</span>
                    <span class="cc" *ngIf="module.ccFor(id) !== null" [title]="'Asignado al CC ' + module.ccFor(id)">CC{{ module.ccFor(id) }}</span>
                </div>
                <div class="sws" *ngIf="s.switches.length">
                    <div class="sw" *ngFor="let w of s.switches" [class.target]="module.learnTarget == w.id" (click)="pick(w.id)">
                        <span class="lab">{{ w.label }}<span class="cc" *ngIf="module.ccFor(w.id) !== null" [title]="'Asignado al CC ' + module.ccFor(w.id)">CC{{ module.ccFor(w.id) }}</span></span>
                        <span class="opts">
                            <button *ngFor="let o of w.opts" [class.on]="module.values[w.id] == o.v" (click)="module.setParam(w.id, o.v)">{{ o.l }}</button>
                        </span>
                    </div>
                </div>
            </div>
        </section>
    </div>
</div>`,
    styles: [`
.inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; margin-bottom: 10px; }
.chip.src { padding-right: 2px; color: var(--accent); border-color: rgba(255, 79, 135, 0.45); }
.x { padding: 1px 3px; }
.none { color: var(--dim); }
.add { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.juno { background: #2c2d31; border: 2px solid #111; border-radius: 6px; padding: 10px 12px 12px; color: #e9e9e3;
    box-shadow: inset 0 0 0 1px #4a4b50, 0 3px 10px rgba(0, 0, 0, 0.5); }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
.logo { font: italic 800 22px/1 Georgia, 'Times New Roman', serif; letter-spacing: 0.04em; color: #f4f4ee; }
.sub { font: 600 10px/1 var(--font); letter-spacing: 0.22em; color: #c9c9c4; }
.stripe { display: inline-flex; height: 6px; width: 90px; flex: 0 0 auto; }
.stripe i { flex: 1; }
.stripe i:nth-child(1) { background: #d8402a; } .stripe i:nth-child(2) { background: #ee8a1d; }
.stripe i:nth-child(3) { background: #f2c21c; } .stripe i:nth-child(4) { background: #3b82c4; }
.leds { display: inline-flex; gap: 4px; margin-left: auto; }
.leds i { width: 7px; height: 7px; border-radius: 50%; background: #4a1a14; box-shadow: inset 0 0 1px #000; }
.leds i.on { background: #ff4a2e; box-shadow: 0 0 6px #ff4a2e; }
.presets { background: #1b1c1f; color: #e9e9e3; border: 1px solid #5a5b5f; border-radius: 3px; padding: 3px 6px; font: 600 11px var(--font); }
.panel-row { display: flex; flex-wrap: wrap; gap: 10px 4px; align-items: stretch; }
.sec { display: flex; flex-direction: column; padding: 0 8px; border-left: 1px solid #55565b; }
.head { display: flex; align-items: center; gap: 6px; font: 700 10px/1 var(--font); letter-spacing: 0.18em; text-transform: uppercase; color: #f4f4ee; margin-bottom: 8px; white-space: nowrap; }
.head i { flex: 1; height: 1px; background: #8c8d92; min-width: 6px; }
.body { display: flex; gap: 6px; align-items: flex-start; }
.sl { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 50px; }
.lab { margin-top: 6px; font: 600 9px/1.1 var(--font); letter-spacing: 0.08em; text-transform: uppercase; color: #c9c9c4; text-align: center; }
.sws { display: flex; flex-direction: column; gap: 9px; margin-left: 6px; padding-top: 2px; }
.sw { display: flex; flex-direction: column; gap: 3px; }
.opts { display: inline-flex; gap: 2px; }
.opts button { padding: 3px 7px; min-width: 30px; background: #1b1c1f; color: #c9c9c4; border: 1px solid #5a5b5f; border-radius: 2px;
    font: 700 10px var(--font); letter-spacing: 0.04em; }
.opts button:hover { color: #fff; border-color: #8c8d92; }
.opts button.on { background: #d8402a; border-color: #ff7a5e; color: #fff; box-shadow: 0 0 6px rgba(255, 74, 46, 0.5); }
.learn { display: inline-flex; align-items: center; gap: 6px; margin-left: 14px; }
.learn button { padding: 3px 9px; background: #1b1c1f; color: #c9c9c4; border: 1px solid #5a5b5f; border-radius: 3px; font: 700 10px var(--font); letter-spacing: 0.06em; text-transform: uppercase; }
.learn button.on { background: #2a7de1; border-color: #7fb4ff; color: #fff; box-shadow: 0 0 6px rgba(42, 125, 225, 0.6); }
.learn small { font: 10px var(--mono); color: #9fd0ff; }
.learnhint { margin: 0 0 8px; padding: 6px 10px; border-left: 3px solid #2a7de1; background: rgba(42, 125, 225, 0.12); font-size: 12px; color: #d8e6f8; }
.cc { display: inline-block; margin-left: 4px; padding: 0 4px; border-radius: 3px; background: #2a7de1; color: #fff; font: 700 8px/12px var(--mono); letter-spacing: 0; }
.learning .sl, .learning .sw { cursor: pointer; border-radius: 4px; outline: 1px dashed rgba(127, 180, 255, 0.35); outline-offset: 2px; }
.learning .sl > *, .learning .sw > * { pointer-events: none; }
.learning .sl:hover, .learning .sw:hover { outline-color: #7fb4ff; }
.learning .target { outline: 2px solid #2a7de1; background: rgba(42, 125, 225, 0.22); }
.bender { display: flex; flex-direction: column; justify-content: flex-start; gap: 10px; padding-right: 8px; }
.bender input { width: 88px; accent-color: #ee8a1d; }
`]
})
export class JunoDeviceComponent implements OnInit, OnDestroy {
    @Input() module: JunoModule;

    public presets = JUNO_PRESETS;
    public leds = [0, 1, 2, 3, 4, 5];
    public voices = 0;
    public step = 1 / 127;
    public sections: Array<Section> = [
        { name: 'Portamento', sliders: ['portaTime', 'bendDco', 'bendVcf'], switches: [
            { id: 'portaOn', label: 'Portamento', opts: [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }] },
            { id: 'voiceMode', label: 'Voces', opts: [{ v: 0, l: 'Poly 1' }, { v: 1, l: 'Poly 2' }, { v: 2, l: 'Unison' }] }] },
        { name: 'LFO', sliders: ['lfoRate', 'lfoDelay'], switches: [] },
        { name: 'DCO', sliders: ['dcoLfo', 'pwm', 'sub', 'noise'], switches: [
            { id: 'range', label: 'Rango', opts: [{ v: 0, l: "16'" }, { v: 1, l: "8'" }, { v: 2, l: "4'" }] },
            { id: 'pwmMode', label: 'PWM', opts: [{ v: 0, l: 'Man' }, { v: 1, l: 'LFO' }] },
            { id: 'pulse', label: 'Pulso', opts: [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }] },
            { id: 'saw', label: 'Sierra', opts: [{ v: 0, l: 'Off' }, { v: 1, l: 'On' }] }] },
        { name: 'HPF', sliders: [], switches: [
            { id: 'hpf', label: 'Pasa altos', opts: [{ v: 0, l: '0' }, { v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }] }] },
        { name: 'VCF', sliders: ['vcfFreq', 'vcfRes', 'vcfEnv', 'vcfLfo', 'vcfKybd'], switches: [
            { id: 'envPol', label: 'Env', opts: [{ v: 1, l: '+' }, { v: 0, l: '−' }] }] },
        { name: 'VCA', sliders: ['vcaLevel'], switches: [
            { id: 'vcaMode', label: 'VCA', opts: [{ v: 0, l: 'Env' }, { v: 1, l: 'Gate' }] }] },
        { name: 'Env', sliders: ['atk', 'dec', 'sus', 'rel'], switches: [] },
        { name: 'Chorus', sliders: [], switches: [
            { id: 'chorus', label: 'Chorus', opts: [{ v: 0, l: 'Off' }, { v: 1, l: 'I' }, { v: 2, l: 'II' }, { v: 3, l: 'I+II' }] }] }
    ];
    private timer: any;

    constructor(public rack: RackService) {}

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    fmt = (v: number) => (v * 10).toFixed(1);

    /** En modo learn, un clic en un control lo deja esperando una perilla del controlador. */
    pick(id: string) {
        if (this.module.learn)
            this.module.selectLearn(id);
    }

    label(id: string): string {
        return JUNO_PARAMS.find(p => p.id == id).label;
    }

    def(id: string): number {
        return JUNO_PARAMS.find(p => p.id == id).default;
    }

    ngOnInit() {
        this.timer = setInterval(() => this.voices = this.module.activeVoices(), 80);
    }

    ngOnDestroy() {
        clearInterval(this.timer);
    }
}
