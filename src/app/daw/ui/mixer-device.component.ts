import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MixerModule, AUX_BUSES } from '../modules/mixer.module';

/** Mezclador: una tira por canal (fader, paneo, mute, solo y medidor) y el fader master. */
@Component({
    selector: 'app-mixer-device',
    template: `
<div class="mixer">
    <div class="strip" *ngFor="let s of module.strips; let i = index" [class.muted]="s.mute">
        <span class="label">Canal {{ i + 1 }}</span>
        <input class="pan" type="range" min="-1" max="1" step="0.01" [value]="s.pan" (input)="module.setPan(i, $event.target.valueAsNumber)" title="Paneo" [attr.aria-label]="'Paneo canal ' + (i + 1)">
        <div class="pan-text">{{ panText(s.pan) }}</div>
        <div class="sends">
            <label *ngFor="let a of auxes" [title]="'Envio al aux ' + (a + 1)">
                <span>A{{ a + 1 }}</span>
                <input type="range" min="0" max="1.5" step="0.01" [value]="s.sends[a]" (input)="module.setSend(i, a, $event.target.valueAsNumber)" [attr.aria-label]="'Envio aux ' + (a + 1) + ' canal ' + (i + 1)">
            </label>
        </div>
        <div class="fader-box">
            <input class="fader" type="range" min="0" max="1.5" step="0.01" [value]="s.gain" (input)="module.setGain(i, $event.target.valueAsNumber)" orient="vertical" [attr.aria-label]="'Fader canal ' + (i + 1)">
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
            <label><span>Envio</span><input type="range" min="0" max="1.5" step="0.01" [value]="module.auxLevel[a]" (input)="module.setAuxLevel(a, $event.target.valueAsNumber)" [attr.aria-label]="'Nivel del bus aux ' + (a + 1)"></label>
            <label><span>Retorno</span><input type="range" min="0" max="1.5" step="0.01" [value]="module.returnLevel[a]" (input)="module.setReturn(a, $event.target.valueAsNumber)" [attr.aria-label]="'Retorno ' + (a + 1)"></label>
        </div>
        <small>Cablea Aux n a un efecto y su salida al Retorno n (o usa el boton "Envio aux" del efecto).</small>
    </div>
    <div class="strip master">
        <span class="label">Master</span>
        <div class="pan-text">&nbsp;</div>
        <div class="fader-box">
            <input class="fader" type="range" min="0" max="1.5" step="0.01" [value]="module.master" (input)="module.setMaster($event.target.valueAsNumber)" orient="vertical" aria-label="Fader master">
            <div class="meter"><i [style.height.%]="masterLevel * 100"></i></div>
        </div>
        <div class="db">{{ db(module.master) }}</div>
    </div>
</div>`,
    styles: [`
.mixer { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 2px; }
.strip { flex: none; width: 74px; display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 6px 4px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: rgba(0,0,0,0.22); }
.strip.master { margin-left: 10px; border-color: var(--border-strong); }
.strip.muted { opacity: 0.6; }
.pan { width: 60px; margin: 0; }
.sends { display: flex; flex-direction: column; gap: 1px; width: 62px; }
.sends label { display: flex; align-items: center; gap: 3px; font-size: 9px; color: var(--info); }
.sends input { width: 44px; margin: 0; }
.strip.aux { width: 150px; align-items: stretch; margin-left: 10px; }
.strip.aux .bus { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; border-top: 1px solid var(--border); }
.strip.aux .bus b { color: var(--info); }
.strip.aux label { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 10px; color: var(--dim); }
.strip.aux input { width: 80px; margin: 0; }
.strip.aux small { font-size: 9px; color: var(--dim); line-height: 1.3; }
.pan-text { font-size: 10px; color: var(--dim); font-family: var(--mono); }
.fader-box { display: flex; gap: 6px; height: 130px; }
.fader { writing-mode: vertical-lr; direction: rtl; width: 22px; height: 130px; margin: 0; }
.meter { width: 7px; height: 130px; background: var(--border); border-radius: 3px; position: relative; overflow: hidden; }
.meter i { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.db { font-size: 10px; font-family: var(--mono); color: var(--dim); }
.btns { display: flex; gap: 3px; }
.btns button { padding: 2px 7px; font-weight: 700; }
.btns .mute { background: var(--warn); border-color: var(--warn); color: #000; }
.btns .solo { background: var(--info); border-color: var(--info); color: #000; }
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

    panText(p: number): string {
        return p == 0 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);
    }

    db(g: number): string {
        return g <= 0.001 ? '-inf' : (20 * Math.log10(g)).toFixed(1) + ' dB';
    }
}
