import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AudioInModule, AUDIOIN_CHANNELS } from '../modules/audioin.module';

/** Entrada de audio: selector de entrada, Activar/Detener, estado y ocho tiras (nombre, nivel, medidor, mute). */
@Component({
    selector: 'app-audioin-device',
    template: `
<div class="top">
    <label class="dev">
        <span>Entrada</span>
        <select [value]="module.deviceId" (change)="module.setDevice($event.target.value)" aria-label="Entrada de audio" title="Entrada de la placa de sonido">
            <option value="" [selected]="!module.deviceId">Predeterminada</option>
            <option *ngFor="let d of module.devices" [value]="d.id" [selected]="d.id == module.deviceId">{{ d.label }}</option>
            <option *ngIf="module.deviceId && !known" [value]="module.deviceId" selected>Entrada guardada (activa para ver la lista)</option>
        </select>
    </label>
    <button *ngIf="!module.active" class="go" [disabled]="module.starting || !module.supported" (click)="module.start()"
        title="Pide permiso al navegador y empieza a capturar">{{ module.starting ? 'Activando...' : 'Activar entrada' }}</button>
    <button *ngIf="module.active" (click)="module.stop()" title="Libera la entrada de audio">Detener</button>
    <span class="state" [class.on]="module.active">{{ module.active ? 'activa' : 'inactiva' }}</span>
</div>
<p class="err" *ngIf="module.error" role="alert">{{ module.error }}</p>
<p class="err" *ngIf="!module.error && !module.supported">{{ module.unavailable }}</p>
<p class="info" *ngIf="module.active">
    {{ module.channelInfo }} &middot; {{ module.sampleRate | number:'1.0-0' }} Hz<span *ngIf="module.inputLatency"> &middot; latencia de entrada {{ module.inputLatency * 1000 | number:'1.0-1' }} ms</span><span *ngIf="module.deviceLabel"> &middot; {{ module.deviceLabel }}</span>
</p>
<p class="warn" *ngIf="module.notice">{{ module.notice }}</p>
<p class="info" *ngIf="!module.active && !module.error && module.supported">La entrada no se activa sola: toca "Activar entrada" en cada sesion (el navegador pide permiso la primera vez).</p>
<div class="chans">
    <div class="strip" *ngFor="let c of module.channels; let i = index" [class.muted]="c.mute" [class.off]="module.active && i >= module.usable">
        <input class="name" [value]="c.name" maxlength="24" (change)="module.setName(i, $event.target.value)" [attr.aria-label]="'Nombre entrada ' + (i + 1)" title="Nombre del canal">
        <div class="src">{{ !module.active ? 'inactiva' : i < module.usable ? 'canal ' + (i + 1) + ' de la placa' : 'sin senal' }}</div>
        <div class="fader-box">
            <app-fader inputClass="fader" [length]="110" [value]="c.trim" [min]="0" [max]="2" [step]="0.01" [default]="1"
                [format]="db" [autoModule]="module.id" [autoParam]="'trim.' + i" (valueChange)="module.setTrim(i, $event)" [ariaLabel]="'Nivel entrada ' + (i + 1)"></app-fader>
            <div class="meter" title="Nivel"><i [style.height.%]="levels[i] * 100"></i></div>
        </div>
        <div class="db">{{ db(c.trim) }}</div>
        <button [class.mute]="c.mute" (click)="module.toggleMute(i)" title="Silenciar" [attr.aria-label]="'Mute entrada ' + (i + 1)" [attr.aria-pressed]="c.mute">M</button>
    </div>
</div>
<p class="note">Si lo cableas a la salida y usas parlantes, hay acople: usa auriculares o el monitoreo directo de tu placa. La captura va sin cancelacion de eco, supresion de ruido ni control de ganancia.</p>`,
    styles: [`
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 2px 2px 6px; }
.dev { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dim); }
.dev select { max-width: 280px; }
.go { font-weight: 700; }
.state { font-size: 11px; color: var(--dim); }
.state.on { color: var(--ok); }
.err { color: var(--danger); font-size: 12px; margin: 4px 2px; }
.warn { color: var(--warn); font-size: 11px; margin: 4px 2px; }
.info { color: var(--dim); font-size: 11px; margin: 4px 2px; }
.chans { display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 6px; }
.strip { flex: none; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 8px 6px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.28)); }
.strip.muted { opacity: 0.65; }
.strip.off { opacity: 0.45; }
.name { width: 100%; text-align: center; font-size: 11px; padding: 2px 4px; background: #0a0b14; color: var(--text);
    border: 1px solid var(--border); border-radius: 3px; }
.src { font-size: 9px; color: var(--dim); }
.fader-box { display: flex; gap: 8px; align-items: stretch; }
.meter { width: 8px; height: 110px; background: #0a0b14; border-radius: 3px; position: relative; overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 0 1px #2d3256; }
.meter i { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, var(--ok) 60%, var(--warn) 85%, var(--danger)); }
.db { font-size: 10px; font-family: var(--mono); color: var(--dim); }
button.mute { background: var(--warn); border-color: var(--warn); color: #000; }
button { padding: 2px 10px; font-weight: 700; }
.note { font-size: 10px; color: var(--dim); margin: 2px 2px 0; }
`]
})
export class AudioInDeviceComponent implements OnInit, OnDestroy {
    @Input() module: AudioInModule;
    public levels: Array<number> = new Array(AUDIOIN_CHANNELS).fill(0);
    private raf = 0;
    private last = 0;
    private gone = false;

    constructor(private zone: NgZone, private cd: ChangeDetectorRef, private el: ElementRef) {}

    get known(): boolean {
        return this.module.devices.some(d => d.id == this.module.deviceId);
    }

    // Los medidores se leen con requestAnimationFrame fuera de la zona y solo mientras el panel se ve (abierto y pestana visible)
    ngOnInit() {
        this.zone.runOutsideAngular(() => {
            const tick = (t: number) => {
                if (this.gone)
                    return;
                this.raf = requestAnimationFrame(tick);
                const host: HTMLElement = this.el.nativeElement;
                if (t - this.last < 45 || document.hidden || !host.offsetParent)
                    return;
                this.last = t;
                if (!this.module.active && this.levels.every(l => l == 0))
                    return;
                this.levels = this.module.channels.map((_, i) => this.module.level(i));
                this.cd.detectChanges();
            };
            this.raf = requestAnimationFrame(tick);
        });
    }

    ngOnDestroy() {
        this.gone = true;
        cancelAnimationFrame(this.raf);
    }

    db = (g: number): string => g <= 0.001 ? '-inf' : (20 * Math.log10(g)).toFixed(1) + ' dB';
}
