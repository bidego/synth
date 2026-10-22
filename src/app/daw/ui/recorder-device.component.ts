import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { RecorderModule, REC_TRACKS } from '../modules/recorder.module';
import { RackService } from '../core/rack.service';
import { encodeWav } from '../../services/wav';

/** Grabador 8 pistas: una tira por pista (REC, nombre, miniatura de la toma, paneo, fader con medidores, mute, solo). */
@Component({
    selector: 'app-recorder-device',
    template: `
<p class="err" *ngIf="module.error">{{ module.error }}</p>
<div class="top">
    <span class="hint">Arma las pistas (REC), cablea una fuente a cada entrada en la vista de cableado y graba con el Rec del rack: la toma abarca el loop.</span>
    <label class="comp" title="Resta la latencia de salida del navegador a lo que se captura: util para fuentes tocadas en vivo; no para lo que viene del rack">
        <input type="checkbox" [checked]="module.compLatency" (change)="module.setCompLatency($event.target.checked)"> Comp. latencia
    </label>
</div>
<div class="tracks">
    <div class="strip" *ngFor="let t of module.tracks; let i = index" [class.muted]="t.mute" [class.armed]="t.armed">
        <input class="name" [value]="t.name" maxlength="24" (change)="module.setName(i, $event.target.value)" [attr.aria-label]="'Nombre pista ' + (i + 1)" title="Nombre de la pista">
        <div class="src" [class.none]="!linked(i)">{{ linked(i) ? 'entrada conectada' : 'sin cable en la entrada' }}</div>
        <button class="rec" [class.on]="t.armed" [class.live]="module.recording && t.armed" (click)="module.toggleArm(i)" [attr.aria-pressed]="t.armed"
            title="Armar: al grabar desde el transporte esta pista captura su entrada y reemplaza su toma" [attr.aria-label]="'Armar pista ' + (i + 1)">
            <i></i> REC
        </button>
        <div class="lane" title="La toma dentro del loop">
            <svg *ngIf="t.take && t.buffer" class="wave" viewBox="0 0 160 100" preserveAspectRatio="none"
                [style.left.%]="takeLeft(i)" [style.width.%]="takeWidth(i)"><path [attr.d]="t.wave"/></svg>
            <span class="msg" *ngIf="t.loading">cargando...</span>
            <span class="msg warn" *ngIf="t.missing">toma no disponible en este navegador</span>
            <span class="msg" *ngIf="!t.take && !t.loading">sin toma</span>
            <i class="ph" [style.left.%]="playPos"></i>
        </div>
        <div class="info">{{ info(i) }}</div>
        <div class="panwrap" title="Paneo (doble clic = centro)">
            <app-knob [size]="32" [value]="t.pan" [min]="-1" [max]="1" [step]="0.01" [default]="0" [bipolar]="true" [hideValue]="true"
                [format]="panText" [autoModule]="module.id" [autoParam]="'pan.' + i" (valueChange)="module.setPan(i, $event)" [ariaLabel]="'Paneo pista ' + (i + 1)"></app-knob>
            <div class="pan-text">{{ panText(t.pan) }}</div>
        </div>
        <div class="fader-box">
            <div class="meter in" title="Entrada"><i [style.height.%]="ins[i] * 100"></i></div>
            <app-fader inputClass="fader" [length]="120" [value]="t.gain" [min]="0" [max]="1.5" [step]="0.01" [default]="0.8"
                [format]="db" [autoModule]="module.id" [autoParam]="'gain.' + i" (valueChange)="module.setGain(i, $event)" [ariaLabel]="'Fader pista ' + (i + 1)"></app-fader>
            <div class="meter" title="Reproduccion"><i [style.height.%]="outs[i] * 100"></i></div>
        </div>
        <div class="db">{{ db(t.gain) }}</div>
        <div class="btns">
            <button [class.mute]="t.mute" (click)="module.toggleMute(i)" title="Silenciar" [attr.aria-label]="'Mute pista ' + (i + 1)">M</button>
            <button [class.solo]="t.solo" (click)="module.toggleSolo(i)" title="Solo" [attr.aria-label]="'Solo pista ' + (i + 1)">S</button>
        </div>
        <div class="btns">
            <button class="ghost" [disabled]="!t.take || !t.buffer" (click)="exportTrack(i)" title="Exportar la toma de esta pista a WAV">WAV</button>
            <button class="ghost" [disabled]="!t.take" (click)="clear(i)" title="Borrar la toma de esta pista">Borrar</button>
        </div>
    </div>
</div>
<p class="note">Las grabaciones quedan en este navegador; exporta a WAV para guardarlas. El proyecto solo guarda nombres y niveles.</p>`,
    styles: [`
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 2px 2px 6px; }
.hint { font-size: 11px; color: var(--dim); }
.comp { font-size: 11px; color: var(--dim); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.err { color: var(--danger); font-size: 12px; margin: 4px 2px; }
.tracks { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 6px; }
.strip { flex: none; width: 128px; display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 8px 6px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.28)); }
.strip.armed { border-color: var(--danger); }
.strip.muted { opacity: 0.65; }
.name { width: 100%; text-align: center; font-size: 11px; padding: 2px 4px; background: #0a0b14; color: var(--text);
    border: 1px solid var(--border); border-radius: 3px; }
.src { font-size: 9px; color: var(--ok); }
.src.none { color: var(--dim); }
.rec { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; padding: 3px 0; }
.rec i { width: 9px; height: 9px; border-radius: 50%; background: #5a2a30; }
.rec.on i { background: var(--danger); }
.rec.on { border-color: var(--danger); color: var(--danger); }
.rec.live i { animation: blink 0.8s infinite; }
@keyframes blink { 50% { opacity: 0.25; } }
.lane { position: relative; width: 100%; height: 44px; background: #0a0b14; border-radius: 3px; overflow: hidden; box-shadow: inset 0 0 0 1px #2d3256; }
.wave { position: absolute; top: 0; height: 100%; }
.wave path { stroke: var(--info); stroke-width: 1; fill: none; vector-effect: non-scaling-stroke; }
.msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 9px; color: var(--dim); padding: 0 4px; line-height: 1.2; }
.msg.warn { color: var(--warn); }
.ph { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--accent); pointer-events: none; }
.info { font-size: 9px; color: var(--dim); font-family: var(--mono); min-height: 12px; text-align: center; }
.panwrap { display: flex; flex-direction: column; align-items: center; }
.pan-text { font-size: 10px; color: var(--dim); font-family: var(--mono); min-height: 13px; }
.fader-box { display: flex; gap: 6px; align-items: stretch; }
.meter { width: 7px; height: 120px; background: #0a0b14; border-radius: 3px; position: relative; overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 0 1px #2d3256; }
.meter.in i { background: linear-gradient(to top, var(--info), #bfe9ff); }
.meter i { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.db { font-size: 10px; font-family: var(--mono); color: var(--dim); }
.btns { display: flex; gap: 3px; }
.btns button { padding: 2px 8px; font-weight: 700; font-size: 11px; }
.btns .mute { background: var(--warn); border-color: var(--warn); color: #000; }
.btns .solo { background: var(--info); border-color: var(--info); color: #000; }
.note { font-size: 10px; color: var(--dim); margin: 2px 2px 0; }
`]
})
export class RecorderDeviceComponent implements OnInit, OnDestroy {
    @Input() module: RecorderModule;
    public ins: Array<number> = new Array(REC_TRACKS).fill(0);
    public outs: Array<number> = new Array(REC_TRACKS).fill(0);
    public playPos = 0;
    private timer: any;

    constructor(private rack: RackService) {}

    // Los medidores y el cursor se refrescan solos varias veces por segundo
    ngOnInit() {
        this.timer = setInterval(() => {
            this.ins = this.module.tracks.map((_, i) => this.module.inLevel(i));
            this.outs = this.module.tracks.map((_, i) => this.module.outLevel(i));
            this.playPos = this.rack.transport.position * 100;
        }, 60);
    }

    ngOnDestroy() {
        clearInterval(this.timer);
    }

    linked(i: number): boolean {
        return this.rack.graph.cablesOf(this.module.id, 'in' + (i + 1)).some(c => c.toModule == this.module.id);
    }

    private get loopBeats(): number {
        return this.rack.transport.loopBeats;
    }

    // La toma se dibuja en su lugar dentro del loop (lo que pase del final del loop no suena)
    takeLeft(i: number): number {
        const t = this.module.tracks[i].take;
        return t ? Math.min(100, t.start / this.loopBeats * 100) : 0;
    }

    takeWidth(i: number): number {
        const t = this.module.tracks[i].take;
        return t ? Math.max(0, Math.min(this.module.takeBeats(i), this.loopBeats - t.start) / this.loopBeats * 100) : 0;
    }

    info(i: number): string {
        const t = this.module.tracks[i].take;
        if (!t)
            return '';
        const rate = this.module.takeRate(i);
        const tempo = Math.abs(rate - 1) > 0.005 ? ' · ' + Math.round(rate * 100) + '% (tempo)' : '';
        return t.len.toFixed(1) + ' s · ' + Math.round(t.bpm) + ' bpm' + tempo;
    }

    clear(i: number) {
        if (window.confirm('Borrar la toma de "' + this.module.tracks[i].name + '"?'))
            this.module.clearTake(i);
    }

    exportTrack(i: number) {
        const t = this.module.tracks[i];
        if (!t.buffer)
            return;
        const url = URL.createObjectURL(encodeWav(t.buffer));
        const a = document.createElement('a');
        a.href = url;
        a.download = (t.name.replace(/[^\w\- ]+/g, '').trim() || 'pista') + '.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    panText = (p: number): string => p == 0 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);

    db = (g: number): string => g <= 0.001 ? '-inf' : (20 * Math.log10(g)).toFixed(1) + ' dB';
}
