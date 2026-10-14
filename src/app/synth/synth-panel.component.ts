import { Component, Input } from '@angular/core';
import { SynthStudioModule } from '../daw/modules/synth-studio.module';
import { WaveType, FilterType, LfoTarget, LayerConfig } from '../services/presets';

interface Knob {
    label: string;
    key: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    default?: number;    // al que vuelve con doble clic
    bipolar?: boolean;   // el arco parte del centro
    log?: boolean;       // escala logaritmica (frecuencias)
}

@Component({
    selector: 'app-synth-panel',
    templateUrl: './synth-panel.component.html',
    styleUrls: ['./synth-panel.component.css']
})
export class SynthPanelComponent {
    public waves: Array<WaveType> = ['sine', 'triangle', 'sawtooth', 'square'];
    public filterTypes: Array<FilterType> = ['lowpass', 'highpass', 'bandpass'];
    public lfoTargets: Array<LfoTarget> = ['pitch', 'filter', 'amp'];
    public layerKnobs: Array<Knob> = [
        { label: 'Ratio', key: 'ratio', min: 0.25, max: 6, step: 0.01, unit: 'x', default: 1 },
        { label: 'Detune', key: 'detune', min: -100, max: 100, step: 1, unit: 'ct', default: 0, bipolar: true },
        { label: 'Vol', key: 'volume', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 }
    ];
    public envKnobs: Array<Knob> = [
        { label: 'A', key: 'attack', min: 0, max: 4, step: 0.01, unit: 's', default: 0.005 },
        { label: 'D', key: 'decay', min: 0.01, max: 4, step: 0.01, unit: 's', default: 0.1 },
        { label: 'S', key: 'sustain', min: 0, max: 1, step: 0.01, unit: '', default: 1 },
        { label: 'R', key: 'release', min: 0.01, max: 5, step: 0.01, unit: 's', default: 0.05 }
    ];
    public filterKnobs: Array<Knob> = [
        { label: 'Cutoff', key: 'cutoff', min: 50, max: 18000, step: 1, unit: 'Hz', default: 18000, log: true },
        { label: 'Reso', key: 'q', min: 0.1, max: 20, step: 0.1, unit: '', default: 0.7 },
        { label: 'Env amt', key: 'envAmount', min: 0, max: 8000, step: 10, unit: 'Hz', default: 0 },
        { label: 'Env dec', key: 'envDecay', min: 0.02, max: 2, step: 0.01, unit: 's', default: 0.3 },
        { label: 'Key track', key: 'track', min: 0, max: 1, step: 0.01, unit: '', default: 0.5 }
    ];

    @Input() module: SynthStudioModule;

    get engine() {
        return this.module.engine;
    }

    get lfoDepthRange(): Knob {
        const depth = { label: 'Depth', key: 'depth', min: 0, default: 0 };
        switch (this.engine.patch.lfo.target) {
            case 'pitch': return { ...depth, max: 1200, step: 1, unit: 'ct' };
            case 'filter': return { ...depth, max: 6000, step: 10, unit: 'Hz' };
            default: return { ...depth, max: 1, step: 0.01, unit: '' };
        }
    }

    get lfoRateKnob(): Knob {
        return { label: 'Rate', key: 'rate', min: 0.1, max: 30, step: 0.1, unit: 'Hz', default: 5 };
    }

    setNum(obj: any, key: string, value: number) {
        obj[key] = value;
        this.module.touch();
    }

    setWave(layer: LayerConfig, wave: WaveType) {
        layer.wave = wave;
        this.module.touch();
    }

    setFilterType(type: FilterType) {
        this.engine.patch.filter.type = type;
        this.module.touch();
    }

    setLfoTarget(target: LfoTarget) {
        const lfo = this.engine.patch.lfo;
        lfo.target = target;
        lfo.depth = Math.min(lfo.depth, this.lfoDepthRange.max);
        this.module.touch();
    }

    addLayer() {
        const layers = this.engine.patch.layers;
        if (layers.length < 6)
            layers.push({ ...layers[layers.length - 1], env: undefined } as LayerConfig);
        this.module.touch();
    }

    removeLayer(index: number) {
        const layers = this.engine.patch.layers;
        if (layers.length > 1)
            layers.splice(index, 1);
        this.module.touch();
    }
}
