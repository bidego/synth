import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { EffectModule, ParamDef } from '../modules/effect.module';
import { RackService } from '../core/rack.service';

/** Panel generico de un efecto o dinamico: los controles salen de la descripcion de sus parametros. */
@Component({
    selector: 'app-effect-device',
    template: `
<div class="fx">
    <div class="top">
        <button class="bypass" [class.on]="!module.bypass" (click)="module.setBypass(!module.bypass)" [title]="module.bypass ? 'Efecto apagado: pasa la senal sin tocarla' : 'Efecto activo'">
            {{ module.bypass ? 'Bypass' : 'Activo' }}
        </button>
        <div class="meters">
            <div class="m" title="Nivel de salida"><i [style.width.%]="level * 100"></i></div>
            <div class="gr" *ngIf="hasReduction" title="Reduccion de ganancia"><i [style.width.%]="reductionPct"></i><small>{{ reduction | number:'1.1-1' }} dB</small></div>
        </div>
    </div>
    <div class="send" *ngIf="rack.mixer">
        <span class="label">Envio aux</span>
        <button *ngFor="let a of auxes" [class.on]="rack.isSend(module.id, a)" (click)="toggleSend(a)"
            [title]="rack.isSend(module.id, a) ? 'Quitar del envio ' + (a + 1) : 'Cablear como envio aux ' + (a + 1) + ' del mezclador (aux -> efecto -> retorno) al 100 % de mezcla'">
            Aux {{ a + 1 }}
        </button>
        <small>Usalo como efecto compartido: cada canal manda lo que quiera con su perilla de envio.</small>
    </div>
    <div class="params" [class.off]="module.bypass">
        <ng-container *ngFor="let d of module.paramDefs">
            <label class="param" *ngIf="d.kind == 'range'">
                <span class="label">{{ d.label }}</span>
                <input type="range" [min]="slider(d).min" [max]="slider(d).max" [step]="slider(d).step" [value]="toSlider(d)" (input)="fromSlider(d, $event.target.value)" [attr.aria-label]="d.label">
                <output>{{ format(d) }}</output>
            </label>
            <label class="param toggle" *ngIf="d.kind == 'toggle'">
                <span class="label">{{ d.label }}</span>
                <input type="checkbox" [checked]="module.values[d.id]" (change)="module.setParam(d.id, $event.target.checked ? 1 : 0)">
            </label>
            <div class="param" *ngIf="d.kind == 'choice'">
                <span class="label">{{ d.label }}</span>
                <span class="seg">
                    <button *ngFor="let o of d.options" [class.on]="module.values[d.id] == o.value" (click)="module.setParam(d.id, o.value)">{{ o.label }}</button>
                </span>
            </div>
        </ng-container>
    </div>
</div>`,
    styles: [`
.fx { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; align-items: center; gap: 16px; }
.bypass.on { background: var(--ok); border-color: var(--ok); color: #000; font-weight: 600; }
.meters { display: flex; flex-direction: column; gap: 4px; flex: 1; max-width: 260px; }
.m, .gr { position: relative; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.m i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(to right, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.gr { height: 12px; }
.gr i { position: absolute; right: 0; top: 0; bottom: 0; background: var(--info); }
.gr small { position: absolute; left: 6px; top: -1px; font-size: 9px; font-family: var(--mono); color: #fff; mix-blend-mode: difference; }
.send { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.send small { color: var(--dim); font-size: 11px; }
.params { display: flex; flex-wrap: wrap; gap: 12px 26px; }
.params.off { opacity: 0.45; }
.param { display: flex; flex-direction: column; gap: 3px; min-width: 130px; }
.param input[type=range] { width: 150px; margin: 0; }
.param.toggle { flex-direction: row; align-items: center; gap: 8px; }
output { font-family: var(--mono); font-size: 11px; color: var(--dim); }
`]
})
export class EffectDeviceComponent implements OnInit, OnDestroy {
    @Input() module: any;
    public auxes = [0, 1];
    public level = 0;
    public reduction = 0;
    private timer: any;

    constructor(public rack: RackService) {}

    toggleSend(aux: number) {
        if (this.rack.isSend(this.module.id, aux))
            this.rack.unwireSend(this.module.id);
        else
            this.rack.wireAsSend(this.module.id, aux);
    }

    get hasReduction(): boolean {
        return typeof this.module.reduction == 'function';
    }

    get reductionPct(): number {
        return Math.min(100, Math.abs(this.reduction) / 24 * 100);
    }

    ngOnInit() {
        this.timer = setInterval(() => {
            this.level = (this.module as EffectModule).level();
            if (this.hasReduction)
                this.reduction = this.module.reduction();
        }, 60);
    }
    ngOnDestroy() {
        clearInterval(this.timer);
    }

    // Los parametros "log" (frecuencias) se mueven en una escala logaritmica: se mapean a un slider 0..1
    slider(d: ParamDef) {
        return d.log ? { min: 0, max: 1, step: 0.001 } : { min: d.min, max: d.max, step: d.step };
    }

    toSlider(d: ParamDef): number {
        const v = this.module.values[d.id];
        return d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : v;
    }

    fromSlider(d: ParamDef, raw: string) {
        const x = parseFloat(raw);
        const v = d.log ? d.min * Math.pow(d.max / d.min, x) : x;
        this.module.setParam(d.id, d.log ? Math.round(v * 10) / 10 : v);
    }

    format(d: ParamDef): string {
        const v = this.module.values[d.id];
        const text = d.step && d.step < 0.01 ? v.toFixed(3) : Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v * 100) / 100).toString();
        return text + (d.unit || '');
    }
}
