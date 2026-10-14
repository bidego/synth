import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MixerModule, AUX_BUSES } from '../modules/mixer.module';

/** Mezclador: una tira por canal (fader, paneo, mute, solo y medidor) y el fader master. */
@Component({
    selector: 'app-mixer-device',
    template: `
<div class="mixer">
    <div class="strip" *ngFor="let s of module.strips; let i = index" [class.muted]="s.mute">
        <span class="label">Canal {{ i + 1 }}</span>
        <div class="panwrap" title="Paneo (doble clic = centro)">
            <app-knob class="pan" [size]="34" [value]="s.pan" [min]="-1" [max]="1" [step]="0.01" [default]="0" [bipolar]="true" [hideValue]="true"
                [format]="panText" [autoModule]="module.id" [autoParam]="'pan.' + i" (valueChange)="module.setPan(i, $event)" [ariaLabel]="'Paneo canal ' + (i + 1)"></app-knob>
            <div class="pan-text">{{ panText(s.pan) }}</div>
        </div>
        <div class="sends">
            <label *ngFor="let a of auxes" [title]="'Envio al aux ' + (a + 1)">
                <span>A{{ a + 1 }}</span>
                <app-knob [size]="28" [value]="s.sends[a]" [min]="0" [max]="1.5" [step]="0.01" [default]="0" [hideValue]="true"
                    [autoModule]="module.id" [autoParam]="'send.' + i + '.' + a" (valueChange)="module.setSend(i, a, $event)" [ariaLabel]="'Envio aux ' + (a + 1) + ' canal ' + (i + 1)"></app-knob>
            </label>
        </div>
        <div class="fader-box">
            <app-fader inputClass="fader" [length]="140" [value]="s.gain" [min]="0" [max]="1.5" [step]="0.01" [default]="0.8"
                [format]="db" [autoModule]="module.id" [autoParam]="'gain.' + i" (valueChange)="module.setGain(i, $event)" [ariaLabel]="'Fader canal ' + (i + 1)"></app-fader>
            <div class="meter"><i [style.height.%]="levels[i] * 100"></i></div>
        </div>
        <div class="db">{{ db(s.gain) }}</div>
        <div class="btns">
            <button [class.mute]="s.mute" (click)="module.toggleMute(i)" title="Silenciar" [attr.aria-label]="'Mute canal ' + (i + 1)">M</button>
            <button [class.solo]="s.solo" (click)="module.toggleSolo(i)" title="Solo" [attr.aria-label]="'Solo canal ' + (i + 1)">S</button>
        </div>
    </div>
    <div class="strip aux">
        <span class="label">Aux</span>
        <div class="bus" *ngFor="let a of auxes">
            <b>{{ a + 1 }}</b>
            <div class="knobs">
                <label><app-knob label="Envio" [size]="38" [value]="module.auxLevel[a]" [min]="0" [max]="1.5" [step]="0.01" [default]="1"
                    [autoModule]="module.id" [autoParam]="'aux.' + a" (valueChange)="module.setAuxLevel(a, $event)" [ariaLabel]="'Nivel del bus aux ' + (a + 1)"></app-knob></label>
                <label><app-knob label="Retorno" [size]="38" [value]="module.returnLevel[a]" [min]="0" [max]="1.5" [step]="0.01" [default]="1"
                    [autoModule]="module.id" [autoParam]="'ret.' + a" (valueChange)="module.setReturn(a, $event)" [ariaLabel]="'Retorno ' + (a + 1)"></app-knob></label>
            </div>
        </div>
        <small>Cablea Aux n a un efecto y su salida al Retorno n (o usa el boton "Envio aux" del efecto).</small>
    </div>
    <div class="strip master">
        <span class="label">Master</span>
        <div class="pan-text">&nbsp;</div>
        <div class="fader-box">
            <app-fader inputClass="fader" [length]="140" [value]="module.master" [min]="0" [max]="1.5" [step]="0.01" [default]="1"
                [format]="db" autoParam="master" [autoModule]="module.id" (valueChange)="module.setMaster($event)" ariaLabel="Fader master"></app-fader>
            <div class="meter"><i [style.height.%]="masterLevel * 100"></i></div>
        </div>
        <div class="db">{{ db(module.master) }}</div>
    </div>
</div>`,
    styles: [`
.mixer { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 6px; }
.strip { flex: none; width: 82px; display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 8px 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.28)); }
.strip.master { margin-left: 10px; border-color: var(--border-strong); width: 90px; }
.strip.muted { opacity: 0.6; }
.panwrap { display: flex; flex-direction: column; align-items: center; }
.pan-text { font-size: 10px; color: var(--dim); font-family: var(--mono); min-height: 13px; }
.sends { display: flex; justify-content: center; gap: 4px; }
.sends label { display: flex; flex-direction: column; align-items: center; font-size: 9px; color: var(--info); cursor: default; }
.fader-box { display: flex; gap: 8px; align-items: stretch; margin-top: 2px; }
.meter { width: 8px; height: 140px; background: #0a0b14; border-radius: 3px; position: relative; overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 0 1px #2d3256; }
.meter i { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.db { font-size: 10px; font-family: var(--mono); color: var(--dim); }
.btns { display: flex; gap: 3px; }
.btns button { padding: 2px 8px; font-weight: 700; }
.btns .mute { background: var(--warn); border-color: var(--warn); color: #000; }
.btns .solo { background: var(--info); border-color: var(--info); color: #000; }
.strip.aux { width: 132px; align-items: stretch; margin-left: 10px; }
.strip.aux .label { align-self: center; }
.strip.aux .bus { display: flex; align-items: center; gap: 8px; padding: 6px 2px; border-top: 1px solid var(--border); }
.strip.aux .bus b { color: var(--info); font-size: 15px; }
.strip.aux .knobs { display: flex; gap: 6px; }
.strip.aux label { display: block; }
.strip.aux small { font-size: 9px; color: var(--dim); line-height: 1.35; }
`]
})
export class MixerDeviceComponent implements OnInit, OnDestroy {
    @Input() module: MixerModule;
    public auxes = Array.from({ length: AUX_BUSES }, (_, i) => i);
    public levels: Array<number> = [];
    public masterLevel = 0;
    private timer: any;

    // Los medidores se refrescan solos varias veces por segundo
    ngOnInit() {
        this.timer = setInterval(() => {
            this.levels = this.module.strips.map((_, i) => this.module.channelLevel(i));
            this.masterLevel = this.module.masterLevel();
        }, 60);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }

    // Funciones (flecha) para que los controles puedan usarlas como formato sin perder el `this`
    panText = (p: number): string => p == 0 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);

    db = (g: number): string => g <= 0.001 ? '-inf' : (20 * Math.log10(g)).toFixed(1) + ' dB';
}
