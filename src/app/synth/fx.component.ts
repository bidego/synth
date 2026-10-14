import { Component, Input } from '@angular/core';
import { SynthStudioModule } from '../daw/modules/synth-studio.module';
import { DEFAULT_FX } from '../services/presets';

/** Efectos propios de un Synth Studio: delay y reverb de ese instrumento. */
@Component({
    selector: 'app-fx',
    template: `
<div class="fx">
    <label class="knob" *ngFor="let k of knobs">
        <span class="label">{{ k.label }}</span>
        <input type="range" min="0" [max]="k.max" [step]="k.step" [value]="module.fx[k.name]" (input)="set(k.name, $event.target.value)" [attr.aria-label]="k.label">
        <output>{{ module.fx[k.name] | number:'1.2-2' }}{{ k.unit }}</output>
    </label>
    <button (click)="reset()" title="Apagar delay y reverb de este instrumento">Restablecer</button>
</div>`,
    styles: [`
.fx { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 28px; padding-top: 6px; }
.knob { display: flex; flex-direction: column; gap: 3px; }
.knob input { width: 150px; margin: 0; }
output { font-family: var(--mono); font-size: 11px; color: var(--dim); }
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

    set(name: string, value) {
        this.module.setFx({ [name]: parseFloat(value) });
    }

    reset() {
        this.module.setFx({ ...DEFAULT_FX });
    }
}
