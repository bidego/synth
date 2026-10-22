import { ChangeDetectorRef, Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { RhythmEightModule, RE_INSTRUMENTS, RE_PARAMS, RE_PRESETS, RE_STEPS } from '../modules/rhythmeight.module';
import { MoogScale } from '../../ui/moog-knob.component';
import { RackService } from '../core/rack.service';

interface KnobDef { id: string; x: number; y: number; label: string; scale: MoogScale; }
interface SectionDef { name: string; x0: number; x1: number; y: number; }
interface GroupDef { name: string; row: number; knobs: Array<[string, string]>; }

const W = 1660;
const KNOB_PITCH = 86, KNOB_SCALE = 0.82;
const ROW_Y = [112, 240];           // arriba de cada fila de perillas (la rotulo va 14 px mas arriba)
const GRID_X = 190, GRID_Y = 396, CELL_W = 74, CELL_H = 36, CELL_GAP = 6, GROUP_GAP = 20, ROW_PITCH = 41;
const H = GRID_Y + 13 * ROW_PITCH + 24;

const INST_NAMES = ['Bass Drum', 'Snare', 'Low Tom', 'Mid Tom', 'Hi Tom', 'Rim Shot', 'Claves', 'Hand Clap', 'Maracas', 'Cowbell', 'Cymbal', 'Open Hat', 'Closed Hat'];
const GROUPS: Array<GroupDef> = [
    { name: 'BASS DRUM', row: 0, knobs: [['bdLevel', 'Level'], ['bdTune', 'Tune'], ['bdDecay', 'Decay'], ['bdTone', 'Tone']] },
    { name: 'SNARE DRUM', row: 0, knobs: [['sdLevel', 'Level'], ['sdTune', 'Tune'], ['sdTone', 'Tone'], ['sdSnappy', 'Snappy']] },
    { name: 'LOW TOM', row: 0, knobs: [['ltLevel', 'Level'], ['ltTune', 'Tune'], ['ltDecay', 'Decay']] },
    { name: 'MID TOM', row: 0, knobs: [['mtLevel', 'Level'], ['mtTune', 'Tune'], ['mtDecay', 'Decay']] },
    { name: 'HI TOM', row: 0, knobs: [['htLevel', 'Level'], ['htTune', 'Tune'], ['htDecay', 'Decay']] },
    { name: 'RIM / CLAVES / CLAP / MARACAS', row: 1, knobs: [['rsLevel', 'Rim'], ['clLevel', 'Claves'], ['cpLevel', 'Clap'], ['maLevel', 'Maracas']] },
    { name: 'COWBELL', row: 1, knobs: [['cbLevel', 'Level'], ['cbTune', 'Tune']] },
    { name: 'CYMBAL', row: 1, knobs: [['cyLevel', 'Level'], ['cyTone', 'Tone'], ['cyDecay', 'Decay']] },
    { name: 'HI-HATS', row: 1, knobs: [['ohLevel', 'Open'], ['ohDecay', 'Open decay'], ['chLevel', 'Closed']] },
    { name: 'MASTER', row: 1, knobs: [['tempo', 'Tempo'], ['shuffle', 'Shuffle'], ['accent', 'Accent'], ['steps', 'Length'], ['volume', 'Volume']] }
];

/**
 * Panel de Rhythm Eight: chasis de carbon con serigrafia clara, perillas cremas por voz, master con tempo, shuffle, acento y largo, y la
 * rejilla de 13 voces x 16 pasos en cuatro grupos de colores (rojo, naranja, amarillo y crema; el acento es mas brillante).
 */
@Component({
    selector: 'app-rhythmeight-device',
    template: `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <defs>
        <radialGradient id="mk-skirt" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="#8a8b90"/><stop offset="1" stop-color="#17181a"/></radialGradient>
        <radialGradient id="mk-face" cx="35%" cy="28%" r="90%"><stop offset="0" stop-color="#4b4b50"/><stop offset="1" stop-color="#0a0a0c"/></radialGradient>
    </defs>
</svg>
<div class="inputs" title="De donde recibe notas este instrumento (las notas de bateria GM tocan las voces)">
    <span class="label">Recibe notas de</span>
    <span class="chip src" *ngFor="let c of rack.noteSources(module.id)">
        {{ rack.graph.find(c.fromModule)?.name }}
        <button class="ghost icon x" (click)="rack.disconnect(c.id)" title="Desconectar" [attr.aria-label]="'Desconectar ' + rack.graph.find(c.fromModule)?.name"><app-icon name="close" [size]="11"></app-icon></button>
    </span>
    <span class="none" *ngIf="!rack.noteSources(module.id).length">opcional: conecta un teclado o un secuenciador</span>
    <ng-container *ngFor="let k of keyboards">
        <button class="icon add" *ngIf="!rack.isNoteLinked(k.id, module.id)" (click)="rack.toggleNoteLink(k.id, module.id)" [title]="'Conectar ' + k.name">
            <app-icon name="plus" [size]="12"></app-icon> {{ k.name }}
        </button>
    </ng-container>
</div>
<p class="err" *ngIf="module.error">No se pudo cargar Rhythm Eight: {{ module.error }}</p>
<div class="fit" #fit [style.height.px]="H * scale">
    <div class="stage" [style.transform]="'scale(' + scale + ')'">
        <div class="panel"></div>

        <div class="brand">RHYTHM EIGHT</div>
        <div class="bar"><i></i><i></i><i></i><i></i></div>
        <div class="sub">ANALOG DRUM MACHINE</div>

        <div class="tiny" style="left:560px;top:20px">TEMPO</div>
        <div class="lcd" style="left:560px;top:36px" [class.dim]="module.rackSync">{{ module.bpm | number:'1.0-0' }}<small>BPM</small></div>
        <div class="tiny" style="left:700px;top:20px">CLOCK</div>
        <div class="seg" style="left:700px;top:36px" role="group" aria-label="Reloj">
            <button [class.on]="!module.rackSync" (click)="module.setParam('sync', 0)" [attr.aria-pressed]="!module.rackSync" title="Tempo y RUN propios">INTERNAL</button>
            <button [class.on]="module.rackSync" (click)="module.setParam('sync', 1)" [attr.aria-pressed]="module.rackSync" title="Sigue el Play, el loop y el tempo del rack">RACK</button>
        </div>
        <button class="run" style="left:910px;top:36px" [class.on]="module.rackSync ? rackPlaying : module.values.run >= 1" [disabled]="module.rackSync"
            (click)="module.setParam('run', module.values.run >= 1 ? 0 : 1)" [attr.aria-pressed]="module.values.run >= 1" [title]="module.rackSync ? 'En modo Rack arranca con el Play del rack' : 'Arrancar / parar'">
            {{ (module.rackSync ? rackPlaying : module.values.run >= 1) ? 'RUN' : 'STOP' }}
        </button>
        <button class="run clr" style="left:1010px;top:36px" (click)="module.clearPattern()" title="Vaciar el patron">CLEAR</button>

        <div class="tiny" style="left:1226px;top:20px">SOUND</div>
        <button class="stp" style="left:1226px;top:36px" (click)="stepPreset(-1)" aria-label="Sonido anterior">&lt;</button>
        <select class="presets" (change)="module.loadPreset($event.target.value)" aria-label="Sonido">
            <option *ngIf="!module.presetName" selected>(editado)</option>
            <optgroup *ngFor="let g of groups" [label]="g.name">
                <option *ngFor="let p of g.items" [value]="p.index" [selected]="p.name == module.presetName">{{ p.name }}</option>
            </optgroup>
        </select>
        <button class="stp" style="left:1590px;top:36px" (click)="stepPreset(1)" aria-label="Sonido siguiente">&gt;</button>
        <div class="cat" style="left:1264px;top:68px;width:320px">{{ category }}</div>

        <div class="sec" *ngFor="let s of sections" [style.left.px]="s.x0" [style.top.px]="s.y" [style.width.px]="s.x1 - s.x0"><span>{{ s.name }}</span></div>

        <app-moog-knob *ngFor="let k of knobs" class="abs" [class.dim]="module.rackSync && k.id == 'tempo'" [style.left.px]="k.x" [style.top.px]="k.y"
            [value]="module.values[k.id]" [min]="0" [max]="maxOf(k.id)" [step]="stepOf(k.id)" [default]="defOf(k.id)" [label]="k.label" [scale]="k.scale" [steps]="stepsOf(k)"
            [autoModule]="module.id" [autoParam]="isStepped(k.id) ? '' : 'p.' + k.id" [ariaLabel]="ariaOf(k)" [format]="fmt(k)" (valueChange)="module.setParam(k.id, $event)"></app-moog-knob>

        <div class="leds">
            <i *ngFor="let s of stepIdx" class="led" [class.on]="step == s" [class.off]="s >= module.stepLength" [style.left.px]="cellX(s) + CELL_W / 2 - 5"></i>
        </div>
        <div class="grid" (pointerdown)="gridDown($event)" (pointermove)="gridMove($event)">
            <ng-container *ngFor="let name of names; let i = index">
                <button class="lab" [style.top.px]="rowY(i)" (click)="module.hit(i)" [attr.aria-label]="'Tocar ' + name"><b>{{ codes[i] }}</b>{{ name }}</button>
                <i *ngFor="let s of stepIdx" class="cell" [attr.data-i]="i" [attr.data-s]="s" [class.v1]="module.pattern[i][s] == 1" [class.v2]="module.pattern[i][s] == 2"
                    [class.g0]="s < 4" [class.g1]="s >= 4 && s < 8" [class.g2]="s >= 8 && s < 12" [class.g3]="s >= 12" [class.cur]="step == s" [class.off]="s >= module.stepLength"
                    [style.left.px]="cellX(s)" [style.top.px]="rowY(i)"></i>
            </ng-container>
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
.stage { position: absolute; left: 0; top: 0; width: 1660px; height: ${H}px; transform-origin: 0 0; background: #0b0a09; overflow: hidden;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #efe6cf; user-select: none; -webkit-user-select: none; }
.abs { position: absolute; }
.panel { position: absolute; left: 14px; top: 10px; width: 1632px; height: ${H - 20}px; border-radius: 8px; border: 1.5px solid #3a3a3d;
    background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 5px), linear-gradient(rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 180px), linear-gradient(#1b1b1d, #0d0d0e);
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.1); }
.brand { position: absolute; left: 50px; top: 22px; font: 800 36px/44px 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.02em; }
.bar { position: absolute; left: 50px; top: 66px; width: 300px; height: 4px; display: flex; gap: 3px; }
.bar i { flex: 1; } .bar i:nth-child(1) { background: #e0412f; } .bar i:nth-child(2) { background: #ee8a2a; } .bar i:nth-child(3) { background: #f1c93b; } .bar i:nth-child(4) { background: #efe6cf; }
.sub { position: absolute; left: 50px; top: 76px; font: 700 10.5px/16px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #b9b7ae; letter-spacing: 0.08em; }
.tiny { position: absolute; font: 700 9px/12px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #b9b7ae; white-space: nowrap; letter-spacing: 0.06em; }
.lcd { position: absolute; width: 120px; height: 34px; box-sizing: border-box; padding: 0 10px; border-radius: 3px; background: #1a0d06; border: 1px solid #000; box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.8);
    color: #ff9a3c; text-shadow: 0 0 8px rgba(255, 130, 40, 0.7); font: 700 22px/32px 'Courier New', monospace; text-align: right; }
.lcd small { font-size: 10px; margin-left: 5px; }
.lcd.dim { opacity: 0.6; }
.seg { position: absolute; display: flex; height: 34px; border: 1px solid #55554f; border-radius: 3px; overflow: hidden; }
.seg button, .run, .stp { height: 100%; padding: 0 16px; background: linear-gradient(#26262a, #101012); border: 0; color: #b9b7ae; font: 700 12px 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.06em; cursor: pointer; }
.seg button + button { border-left: 1px solid #55554f; }
.seg button.on { background: linear-gradient(#efe6cf, #b9ae94); color: #17110a; }
.run { position: absolute; height: 34px; width: 88px; padding: 0; border: 1px solid #55554f; border-radius: 3px; }
.run.on { background: linear-gradient(#ff6a4a, #c8301c); color: #fff; box-shadow: 0 0 10px rgba(224, 65, 47, 0.55); }
.run:disabled { cursor: default; }
.run.clr { width: 76px; }
.stp { position: absolute; width: 34px; padding: 0; height: 30px; border: 1px solid #55554f; border-radius: 3px; color: #efe6cf; }
.stp:hover, .run:hover:not(:disabled) { border-color: #9a9890; }
.presets { position: absolute; left: 1264px; top: 36px; width: 320px; height: 30px; background: #17171a; color: #efe6cf; border: 1px solid #55554f; border-radius: 3px; padding: 0 8px; font: 700 13px 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cat { position: absolute; font: 700 9.5px/12px 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.08em; color: #8f8d84; text-align: center; text-transform: uppercase; }
.sec { position: absolute; height: 16px; margin-top: -8px; display: flex; align-items: center; gap: 9px; font: 700 10.5px 'Helvetica Neue', Helvetica, Arial, sans-serif; white-space: nowrap; letter-spacing: 0.04em; }
.sec::before, .sec::after { content: ''; flex: 1; height: 8px; border-top: 1.5px solid #d9d6cb; align-self: flex-start; margin-top: 8px; }
.sec::before { border-left: 1.5px solid #d9d6cb; } .sec::after { border-right: 1.5px solid #d9d6cb; }
app-moog-knob.abs { position: absolute; transform: scale(${KNOB_SCALE}); transform-origin: 0 0; --mk-ink: #efe6cf; --mk-ptr: #efe6cf; }
app-moog-knob.dim { opacity: 0.45; }

.leds { position: absolute; left: 0; top: ${GRID_Y - 22}px; }
.led { position: absolute; top: 0; width: 10px; height: 10px; border-radius: 50%; background: #2c1a10; border: 1px solid #000; }
.led.off { opacity: 0.35; }
.led.on { background: #ff6a4a; box-shadow: 0 0 10px 3px rgba(224, 65, 47, 0.65); }
.grid { position: absolute; left: 0; top: 0; width: 100%; height: 100%; touch-action: none; }
.lab { position: absolute; left: 48px; width: 130px; height: ${CELL_H}px; padding: 0 8px; display: flex; align-items: center; gap: 8px; background: linear-gradient(#26262a, #101012); border: 1px solid #55554f; border-radius: 3px;
    color: #d9d6cb; font: 700 10.5px 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; }
.lab b { width: 22px; color: #efe6cf; font-size: 12px; }
.lab:hover, .lab:active { border-color: #efe6cf; color: #fff; }
.cell { position: absolute; width: ${CELL_W}px; height: ${CELL_H}px; box-sizing: border-box; border-radius: 3px; border: 1px solid #000; cursor: pointer; --c: #e0412f; --b: #ff7a5e;
    background: linear-gradient(#2a2a2d, #151517); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 -3px 0 rgba(0, 0, 0, 0.35); }
.cell.g1 { --c: #ee8a2a; --b: #ffb35c; } .cell.g2 { --c: #f1c93b; --b: #fff07a; } .cell.g3 { --c: #efe6cf; --b: #ffffff; }
.cell.v1 { background: linear-gradient(var(--c), var(--c)); filter: saturate(0.85) brightness(0.8); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 rgba(0, 0, 0, 0.3); }
.cell.v2 { background: linear-gradient(var(--b), var(--c)); box-shadow: 0 0 12px 2px var(--c), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 0 0 3px rgba(255, 255, 255, 0.35); }
.cell.cur { outline: 2px solid #fff; outline-offset: 1px; z-index: 1; }
.cell.off { opacity: 0.3; }
`]
})
export class RhythmEightDeviceComponent implements OnInit, AfterViewInit, OnDestroy {
    @Input() module: RhythmEightModule;
    @ViewChild('fit', { static: false }) private fitRef: ElementRef<HTMLElement>;

    public H = H;
    public CELL_W = CELL_W;
    public scale = 0.6;
    public step = -1;
    public codes = RE_INSTRUMENTS.map(c => c.toUpperCase());
    public names = INST_NAMES;
    public stepIdx = Array.from({ length: RE_STEPS }, (_, i) => i);
    public sections: Array<SectionDef> = [];
    public knobs: Array<KnobDef> = [];

    public groups: Array<{ name: string; items: Array<{ name: string; index: number }> }> = RE_PRESETS.reduce((acc, p, index) => {
        let g = acc.find(x => x.name == p.category);
        if (!g)
            acc.push(g = { name: p.category, items: [] });
        g.items.push({ name: p.name, index });
        return acc;
    }, []);

    private timer: any;
    // Pintando la rejilla: el valor que se esta pintando (null = no se esta pintando)
    private paint: number = null;
    private last = '';

    constructor(public rack: RackService, private zone: NgZone, private cd: ChangeDetectorRef) {
        // Las perillas: dos filas de grupos, de izquierda a derecha
        const x = [50, 50];
        GROUPS.forEach(g => {
            const x0 = x[g.row];
            g.knobs.forEach(([id, label], i) => {
                const def = RE_PARAMS.find(p => p.id == id);
                this.knobs.push({ id, label, x: x0 + i * KNOB_PITCH, y: ROW_Y[g.row], scale: def && def.choices ? 'steps' : 'ten' });
            });
            const x1 = x0 + g.knobs.length * KNOB_PITCH - 8;
            this.sections.push({ name: g.name, x0, x1, y: ROW_Y[g.row] - 16 });
            x[g.row] = x1 + 8 + 22;
        });
    }

    get keyboards() {
        return this.rack.graph.ofType('keyboard');
    }

    get rackPlaying(): boolean {
        return this.rack.transport.playing;
    }

    get category(): string {
        const p = RE_PRESETS.find(x => x.name == this.module.presetName);
        return p ? p.category : '';
    }

    ngOnInit() {
        // El paso que suena sale del reloj del rack o del worklet: se refresca la pantalla solo cuando cambia
        this.zone.runOutsideAngular(() => this.timer = setInterval(() => {
            const s = this.module.currentStep;
            if (s != this.step) {
                this.step = s;
                this.cd.detectChanges();
            }
        }, 40));
    }

    ngAfterViewInit() {
        setTimeout(() => this.fit());
    }

    ngOnDestroy() {
        clearInterval(this.timer);
    }

    @HostListener('window:resize')
    fit() {
        const el = this.fitRef && this.fitRef.nativeElement;
        if (el && el.clientWidth)
            this.scale = Math.max(0.3, Math.min(1.1, el.clientWidth / W));
    }

    // --- Perillas ---

    def(id: string) {
        return RE_PARAMS.find(p => p.id == id);
    }

    defOf(id: string): number {
        return this.def(id).def;
    }

    isStepped(id: string): boolean {
        return this.def(id).choices > 0;
    }

    maxOf(id: string): number {
        const c = this.def(id).choices;
        return c ? c - 1 : 1;
    }

    stepOf(id: string): number {
        return this.def(id).choices ? 1 : 0;
    }

    stepsOf(k: KnobDef): Array<string> {
        return k.scale == 'steps' ? this.def(k.id).labels : [];
    }

    ariaOf(k: KnobDef): string {
        return this.def(k.id).name;
    }

    /** Lo que muestra el tooltip de una perilla: el tempo en BPM, el numero del panel o la posicion. */
    fmt(k: KnobDef) {
        const def = this.def(k.id);
        return (v: number) => def.choices ? def.labels[Math.round(v)] : k.id == 'tempo' ? Math.round(40 + 200 * v) + ' BPM' : (v * 10).toFixed(1);
    }

    stepPreset(delta: number) {
        const n = RE_PRESETS.length;
        const current = RE_PRESETS.findIndex(p => p.name == this.module.presetName);
        this.module.loadPreset((current < 0 ? 0 : current + delta + n) % n);
    }

    // --- Rejilla ---

    cellX(s: number): number {
        return GRID_X + s * (CELL_W + CELL_GAP) + Math.floor(s / 4) * (GROUP_GAP - CELL_GAP);
    }

    rowY(i: number): number {
        return GRID_Y + i * ROW_PITCH;
    }

    private cellAt(e: PointerEvent): { i: number, s: number } | null {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
        if (!el || !el.classList || !el.classList.contains('cell'))
            return null;
        return { i: +el.getAttribute('data-i'), s: +el.getAttribute('data-s') };
    }

    /** Un clic recorre vacio -> golpe -> acento -> vacio; arrastrando se pinta ese mismo valor en las demas casillas. */
    gridDown(e: PointerEvent) {
        const c = this.cellAt(e);
        if (!c)
            return;
        e.preventDefault();
        this.paint = (this.module.pattern[c.i][c.s] + 1) % 3;
        this.last = c.i + ',' + c.s;
        this.module.setStep(c.i, c.s, this.paint);
    }

    gridMove(e: PointerEvent) {
        if (this.paint === null)
            return;
        const c = this.cellAt(e);
        if (!c || this.last == c.i + ',' + c.s)
            return;
        this.last = c.i + ',' + c.s;
        this.module.setStep(c.i, c.s, this.paint);
    }

    @HostListener('window:pointerup')
    @HostListener('window:pointercancel')
    gridUp() {
        this.paint = null;
    }
}
