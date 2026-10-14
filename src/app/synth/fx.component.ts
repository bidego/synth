import { Component, Input } from '@angular/core';
import { SynthStudioModule } from '../daw/modules/synth-studio.module';
import { DEFAULT_FX } from '../services/presets';

/** Efectos propios de un Synth Studio: delay y reverb de ese instrumento. */
@Component({
    selector: 'app-fx',
    template: `
<div class="fx">
    <app-knob *ngFor="let k of knobs" [label]="k.label" [size]="50" [value]="module.fx[k.name]" [min]="0" [max]="k.max" [step]="0.01" [default]="0"
        [unit]="k.unit" (valueChange)="set(k.name, $event)"></app-knob>
    <button (click)="reset()" title="Apagar delay y reverb de este instrumento">Restablecer</button>
</div>`,
    styles: [`
.fx { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 26px; padding-top: 6px; }
`]
})
export class FxComponent {
    @Input() module: SynthStudioModule;

    public knobs = [
        { name: 'delayMix', label: 'Delay', max: 1, step: 0.01, unit: '' },
        { name: 'delayTime', label: 'Tiempo', max: 1, step: 0.01, unit: ' s' },
        { name: 'delayFeedback', label: 'Realimentacion', max: 0.9, step: 0.01, unit: '' },
        { name: 'reverbMix', label: 'Reverb', max: 1, step: 0.01, unit: '' }
    ];

    set(name: string, value: number) {
        this.module.setFx({ [name]: value });
    }

    reset() {
        this.module.setFx({ ...DEFAULT_FX });
    }
}
