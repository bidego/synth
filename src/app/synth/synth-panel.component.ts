import { Component } from '@angular/core';
import { SynthEngine } from '../services/synth.engine';
import { WaveType, FilterType, LfoTarget, LayerConfig } from '../services/presets';
import { noteName, KEY_SPAN } from '../services/keyboard-map';

interface Knob {
    label: string;
    key: string;
    min: number;
    max: number;
    step: number;
    unit: string;
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
        { label: 'Ratio', key: 'ratio', min: 0.25, max: 6, step: 0.01, unit: 'x' },
        { label: 'Detune', key: 'detune', min: -100, max: 100, step: 1, unit: 'ct' },
        { label: 'Vol', key: 'volume', min: 0, max: 1, step: 0.01, unit: '' }
    ];
    public envKnobs: Array<Knob> = [
        { label: 'Attack', key: 'attack', min: 0, max: 4, step: 0.01, unit: 's' },
        { label: 'Decay', key: 'decay', min: 0.01, max: 4, step: 0.01, unit: 's' },
        { label: 'Sustain', key: 'sustain', min: 0, max: 1, step: 0.01, unit: '' },
        { label: 'Release', key: 'release', min: 0.01, max: 5, step: 0.01, unit: 's' }
    ];
    public filterKnobs: Array<Knob> = [
        { label: 'Cutoff', key: 'cutoff', min: 50, max: 18000, step: 1, unit: 'Hz' },
        { label: 'Reso', key: 'q', min: 0.1, max: 20, step: 0.1, unit: '' },
        { label: 'Env amt', key: 'envAmount', min: 0, max: 8000, step: 10, unit: 'Hz' },
        { label: 'Env dec', key: 'envDecay', min: 0.02, max: 2, step: 0.01, unit: 's' },
        { label: 'Key track', key: 'track', min: 0, max: 1, step: 0.01, unit: '' }
    ];

    constructor(public engine: SynthEngine) {}

    get lfoDepthRange(): Knob {
        const depth = { label: 'Depth', key: 'depth', min: 0 };
        switch (this.engine.patch.lfo.target) {
            case 'pitch': return { ...depth, max: 1200, step: 1, unit: 'ct' };
            case 'filter': return { ...depth, max: 6000, step: 10, unit: 'Hz' };
            default: return { ...depth, max: 1, step: 0.01, unit: '' };
        }
    }

    get lfoRateKnob(): Knob {
        return { label: 'Rate', key: 'rate', min: 0.1, max: 30, step: 0.1, unit: 'Hz' };
    }

    get range(): string {
        const base = this.engine.baseMidi;
        return noteName(base) + ' - ' + noteName(base + KEY_SPAN - 1);
    }

    setNum(obj: any, key: string, value) {
        obj[key] = parseFloat(value);
    }

    setLfoTarget(target: LfoTarget) {
        const lfo = this.engine.patch.lfo;
        lfo.target = target;
        lfo.depth = Math.min(lfo.depth, this.lfoDepthRange.max);
    }

    setLevel(value) {
        this.engine.level = parseFloat(value);
    }

    addLayer() {
        const layers = this.engine.patch.layers;
        if (layers.length < 6)
            layers.push({ ...layers[layers.length - 1], env: undefined } as LayerConfig);
    }

    removeLayer(index: number) {
        const layers = this.engine.patch.layers;
        if (layers.length > 1)
            layers.splice(index, 1);
    }
}
