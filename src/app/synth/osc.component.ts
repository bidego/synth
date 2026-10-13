import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterContentInit, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SoundService, NoteModel } from '../services/sound.service';
import {
    OscConfig, WaveType, FilterType, LfoTarget,
    DEFAULT_ENV, DEFAULT_FILTER, DEFAULT_LFO
} from '../services/presets';

// Parametros editables desde el panel "Patch"
interface PatchParams {
    detune: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    filterType: FilterType;
    cutoff: number;
    q: number;
    filterEnvAmount: number;
    filterEnvDecay: number;
    lfoRate: number;
    lfoDepth: number;
    lfoTarget: LfoTarget;
}

@Component({
  selector: 'osc-component',
  templateUrl: './osc.component.html',
  styleUrls: ['./osc.component.css']
})
export class OscComponent implements OnInit, AfterContentInit, AfterViewInit, OnDestroy {
    public version:String = "0.2v";
    private static COUNT:number = 0;
    // osc -> filter -> envGain (ADSR) -> gainNode (volumen) -> bus master
    private osc: OscillatorNode;
    private filter: BiquadFilterNode;
    private envGain: GainNode;
    private gainNode: GainNode;
    private lfo: OscillatorNode;
    private lfoGain: GainNode;
    private gateOn:boolean = false;
    private frequencyValue:number;
    private volumeValue:number = 0.1;
    waveType;
    // Configuracion inicial (presets)
    public config: OscConfig;
    public params: PatchParams;
    public filterTypes: Array<FilterType> = ['lowpass', 'highpass', 'bandpass'];
    public lfoTargets: Array<LfoTarget> = ['pitch', 'filter', 'amp'];
    public knobs = [
        { name: 'detune', label: 'Detune', min: -100, max: 100, step: 1, unit: 'ct' },
        { name: 'attack', label: 'Attack', min: 0, max: 4, step: 0.01, unit: 's' },
        { name: 'decay', label: 'Decay', min: 0.01, max: 4, step: 0.01, unit: 's' },
        { name: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, unit: '' },
        { name: 'release', label: 'Release', min: 0.01, max: 5, step: 0.01, unit: 's' },
        { name: 'cutoff', label: 'Cutoff', min: 50, max: 18000, step: 1, unit: 'Hz' },
        { name: 'q', label: 'Reso', min: 0.1, max: 20, step: 0.1, unit: '' },
        { name: 'filterEnvAmount', label: 'Flt env', min: 0, max: 8000, step: 10, unit: 'Hz' },
        { name: 'filterEnvDecay', label: 'Flt dec', min: 0.02, max: 2, step: 0.01, unit: 's' },
        { name: 'lfoRate', label: 'LFO rate', min: 0.1, max: 30, step: 0.1, unit: 'Hz' }
    ];
    private keySub: Subscription;
    @ViewChild("osc", { static: false })
    private me:ElementRef;
    @ViewChild("frequencyView", { static: false })
    private frequencyView:ElementRef;
    @ViewChild("volumeView", { static: false })
    private volumeView:ElementRef;
    @ViewChild("sliderFrequency", { static: false })
    private sliderFrequency:ElementRef;
    @ViewChild("sliderVolume", { static: false })
    private sliderVolume:ElementRef;
    @ViewChild("triggerKey", { static: false })
    private triggerKey:ElementRef;
    @ViewChild("note", { static: false })
    private noteSelect:ElementRef;
    @ViewChild("sine", { static: false })
    private sine:ElementRef;
    @ViewChild("square", { static: false })
    private square:ElementRef;
    @ViewChild("triangle", { static: false })
    private triangle:ElementRef;
    @ViewChild("sawtooth", { static: false })
    private sawtooth:ElementRef;
    
    private triggerKeyValue:String;
    public notes: Array<NoteModel>;
    public keys: Array<String>;

    constructor(private audioCtx:AudioContext, private soundService: SoundService) {
        OscComponent.increaseCount();
        this.notes = this.soundService.notes;
        this.keys = [ "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l"];
    }
    ngOnInit() {
        const c = this.config;
        const env = { ...DEFAULT_ENV, ...(c && c.env) };
        const filter = { ...DEFAULT_FILTER, ...(c && c.filter) };
        const lfo = { ...DEFAULT_LFO, ...(c && c.lfo) };
        this.params = {
            detune: (c && c.detune) || 0,
            attack: env.attack,
            decay: env.decay,
            sustain: env.sustain,
            release: env.release,
            filterType: filter.type,
            cutoff: filter.cutoff,
            q: filter.q,
            filterEnvAmount: filter.envAmount,
            filterEnvDecay: filter.envDecay,
            lfoRate: lfo.rate,
            lfoDepth: lfo.depth,
            lfoTarget: lfo.target
        };
        if (c)
            this.volumeValue = this.limit(c.volume);
    }
    ngAfterContentInit() {
        this.initializeOscilator();
        this.keySub = this.soundService.listenKey.subscribe(e => this.handleKeys(e));
    }
    ngAfterViewInit() {
        if (this.config)
            this.applyConfig(this.config);
    }
    ngOnDestroy() {
        this.keySub.unsubscribe();
        this.osc.stop();
        this.lfo.stop();
        this.gainNode.disconnect();
        this.lfoGain.disconnect();
        OscComponent.COUNT--;
    }
    // Parte "visible" de la config (controles del panel principal); lo sonoro ya esta en params
    applyConfig(c: OscConfig) {
        this.setWaveType(c.wave);
        this.frequencyValue = c.frequency;
        this.sliderFrequency.nativeElement.value = c.frequency;
        this.frequencyView.nativeElement.value = c.frequency;
        this.osc.frequency.value = c.frequency;
        this.sliderVolume.nativeElement.value = this.volumeValue;
        this.volumeView.nativeElement.value = this.volumeValue;
        this.gainNode.gain.value = this.volumeValue;
        this.applyLfo();
        this.triggerKey.nativeElement.value = c.key;
        this.triggerKeyValue = c.key;
        const note = this.notes.find(n => Math.abs(n.frequency - c.frequency) < 0.01);
        if (note)
            this.noteSelect.nativeElement.value = String(note.frequency);
    }
    static increaseCount() {
        OscComponent.COUNT++;
    }
    static getCount() {
        return OscComponent.COUNT || 0;
    }

    toggleWaveType(event) {
        this.setWaveType(event.srcElement.value);
    }

    setWaveType(type: WaveType) {
        const waveTypes = [ this.sine, this.sawtooth, this.triangle, this.square];
        this.osc.type = type;
        waveTypes.forEach( function waveTypeReducer(el) {
            el.nativeElement.setAttribute("style", type == el.nativeElement.value ? "color: #F00" : "");
        });
    }

    // Cambio de un parametro del panel Patch
    setParam(name: string, value) {
        this.params[name] = (name == 'filterType' || name == 'lfoTarget') ? value : parseFloat(value);
        this.applyParams();
    }

    get lfoDepthRange() {
        switch (this.params.lfoTarget) {
            case 'pitch': return { max: 1200, step: 1, unit: 'ct' };
            case 'filter': return { max: 6000, step: 10, unit: 'Hz' };
            default: return { max: 1, step: 0.01, unit: '' };
        }
    }

    private applyParams() {
        const p = this.params;
        const t = this.audioCtx.currentTime;
        this.osc.detune.setValueAtTime(p.detune, t);
        this.filter.type = p.filterType;
        this.filter.Q.setValueAtTime(p.q, t);
        this.filter.frequency.cancelScheduledValues(t);
        this.filter.frequency.setValueAtTime(p.cutoff, t);
        this.lfo.frequency.setValueAtTime(p.lfoRate, t);
        this.applyLfo();
    }

    // El LFO modula un AudioParam segun el destino elegido; la profundidad se escala por destino
    private applyLfo() {
        const p = this.params;
        this.lfoGain.disconnect();
        if (p.lfoTarget == 'pitch') {
            this.lfoGain.gain.value = p.lfoDepth;
            this.lfoGain.connect(this.osc.detune);
        } else if (p.lfoTarget == 'filter') {
            this.lfoGain.gain.value = p.lfoDepth;
            this.lfoGain.connect(this.filter.frequency);
        } else {
            this.lfoGain.gain.value = p.lfoDepth * this.volumeValue;
            this.lfoGain.connect(this.gainNode.gain);
        }
    }

    // Los sliders son la fuente de verdad de frecuencia y volumen
    private syncFromSliders() {
        const t = this.audioCtx.currentTime;
        const freq = parseFloat(this.sliderFrequency.nativeElement.value);
        const vol = parseFloat(this.sliderVolume.nativeElement.value);
        this.osc.frequency.setValueAtTime(freq, t);
        this.volumeValue = this.limit(vol);
        this.gainNode.gain.setValueAtTime(this.volumeValue, t);
        this.applyLfo();
    }

    // Gate on: ataque -> decay -> sustain, y barrido de filtro
    connectGainNode(event) {
        if (this.gateOn)
            return;
        this.gateOn = true;
        // Chrome crea el contexto suspendido hasta que hay un gesto del usuario
        this.audioCtx.resume();
        this.syncFromSliders();
        const p = this.params;
        const t = this.audioCtx.currentTime;
        const attack = Math.max(p.attack, 0.003);
        const g = this.envGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(1, t + attack);
        g.setTargetAtTime(p.sustain, t + attack, Math.max(p.decay, 0.005) / 3);
        if (p.filterEnvAmount) {
            const f = this.filter.frequency;
            f.cancelScheduledValues(t);
            f.setValueAtTime(Math.min(p.cutoff + p.filterEnvAmount, 20000), t);
            f.setTargetAtTime(p.cutoff, t, Math.max(p.filterEnvDecay, 0.01) / 3);
        }
        this.me.nativeElement.setAttribute("style", "background-color: #F88");
    }
    // Gate off: release
    disconnectGainNode(event) {
        if (!this.gateOn)
            return;
        this.gateOn = false;
        const t = this.audioCtx.currentTime;
        const g = this.envGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(0, t, Math.max(this.params.release, 0.01) / 3);
        this.me.nativeElement.setAttribute("style", "");
    }
    initializeOscilator() {
        console.log("Oscilator Initialized");
        this.osc = this.audioCtx.createOscillator();
        this.osc.type = this.waveType || 'sine';
        this.osc.frequency.value = 600;
        this.filter = this.audioCtx.createBiquadFilter();
        this.envGain = this.audioCtx.createGain();
        this.envGain.gain.value = 0;
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.volumeValue;
        this.lfo = this.audioCtx.createOscillator();
        this.lfoGain = this.audioCtx.createGain();
        this.osc.connect(this.filter);
        this.filter.connect(this.envGain);
        this.envGain.connect(this.gainNode);
        this.gainNode.connect(this.soundService.input);
        this.lfo.connect(this.lfoGain);
        this.applyParams();
        // Siempre corriendo: el sonido lo controla la envolvente
        this.osc.start();
        this.lfo.start();
    }

    handleFrequency(e) {
        this.frequencyValue = e.value || e.srcElement.value;
        if (e.srcElement.type != "range")
            this.sliderFrequency.nativeElement.value = this.frequencyValue;
        else
            this.frequencyView.nativeElement.value = this.frequencyValue;
        this.osc.frequency.setValueAtTime(this.frequencyValue, this.audioCtx.currentTime);
    }
    handleVolume(e) {
        let value = e.value || e.srcElement.value
        this.volumeValue = this.limit(value);
        if (e.srcElement.type != "range")
            this.sliderVolume.nativeElement.value = this.volumeValue;
        else
            this.volumeView.nativeElement.value = this.volumeValue
        this.gainNode.gain.setValueAtTime(this.volumeValue, this.audioCtx.currentTime);
        this.applyLfo();
    }
    handleKeys(e:KeyboardEvent) {
        if (e && e.key && this.triggerKey) {
            const key = e.key.toLowerCase();
            const triggerValue = this.triggerKey.nativeElement.selectedOptions[0].value;
            if (key == triggerValue) {
                if (e.type == "keydown")
                    this.connectGainNode(e);
                else
                    this.disconnectGainNode(null);
            }
        }
    }
    handleKeyChange(event) {
        this.triggerKeyValue = event.srcElement.value;
    }
    handleNoteChange(event) {
        let { value:note } = event.srcElement;
        this.sliderFrequency.nativeElement.value = note;
        this.frequencyView.nativeElement.value = note;
        this.osc.frequency.setValueAtTime(note, this.audioCtx.currentTime);
    }
    limit = n => n >= 0.5 ? 0.5 : n;

}
