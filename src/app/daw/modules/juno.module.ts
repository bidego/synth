import { RackModule } from '../core/module';
import { ModuleEnv, NoteMsg, PortDef } from '../core/types';

/** Un control del panel. Los deslizadores van de 0 a 1 (como la escala 0-10 del original); los interruptores, de 0 a N. */
export interface JunoParam {
    id: string;
    label: string;
    kind: 'slider' | 'switch';
    default: number;
    min: number;
    max: number;
    step: number;
}

const slider = (id: string, label: string, def: number): JunoParam =>
    ({ id, label, kind: 'slider', default: def, min: 0, max: 1, step: 1 / 127 });
const sw = (id: string, label: string, def: number, max = 1): JunoParam =>
    ({ id, label, kind: 'switch', default: def, min: 0, max, step: 1 });

/** Todos los controles del panel (los ids son los del estado guardado y los de la automatizacion). */
export const JUNO_PARAMS: ReadonlyArray<JunoParam> = [
    // Controlador
    slider('portaTime', 'Porta', 0.3),
    sw('portaOn', 'Portamento', 0),
    sw('voiceMode', 'Modo', 0, 2),             // 0 Poly 1 / 1 Poly 2 / 2 Unison
    slider('bendDco', 'Bend DCO', 0.17),
    slider('bendVcf', 'Bend VCF', 0),
    // LFO
    slider('lfoRate', 'Rate', 0.35),
    slider('lfoDelay', 'Delay', 0),
    // DCO
    slider('dcoLfo', 'LFO', 0),
    slider('pwm', 'PWM', 0.2),
    sw('pwmMode', 'PWM', 0),                    // 0 manual / 1 LFO
    sw('range', 'Rango', 1, 2),                 // 0 16' / 1 8' / 2 4'
    sw('pulse', 'Pulso', 1),
    sw('saw', 'Sierra', 1),
    slider('sub', 'Sub', 0.3),
    slider('noise', 'Ruido', 0),
    // HPF
    sw('hpf', 'HPF', 1, 3),                     // 0 refuerzo de graves / 1 plano / 2 / 3
    // VCF
    slider('vcfFreq', 'Freq', 0.6),
    slider('vcfRes', 'Res', 0.15),
    slider('vcfEnv', 'Env', 0.35),
    slider('vcfLfo', 'LFO', 0),
    slider('vcfKybd', 'Kybd', 0.5),
    sw('envPol', 'Polaridad', 1),               // 1 normal / 0 invertida
    // VCA
    slider('vcaLevel', 'Nivel', 0.7),
    sw('vcaMode', 'VCA', 0),                    // 0 envolvente / 1 gate
    // Envolvente
    slider('atk', 'A', 0.05),
    slider('dec', 'D', 0.4),
    slider('sus', 'S', 0.6),
    slider('rel', 'R', 0.3),
    // Chorus
    sw('chorus', 'Chorus', 0, 3)                // 0 off / 1 I / 2 II / 3 I+II
];

export interface JunoPreset {
    name: string;
    values: { [id: string]: number };
}

/** Sonidos de partida (no son los de fabrica del original: son retratos de los clasicos del Juno). */
export const JUNO_PRESETS: ReadonlyArray<JunoPreset> = [
    { name: 'Init', values: {} },
    { name: 'Brass', values: { range: 1, pulse: 0, saw: 1, sub: 0.2, vcfFreq: 0.35, vcfRes: 0.1, vcfEnv: 0.45, vcfKybd: 0.5, atk: 0.2, dec: 0.5, sus: 0.7, rel: 0.2, chorus: 1 } },
    { name: 'Strings', values: { range: 1, pulse: 1, saw: 1, pwm: 0.5, pwmMode: 1, lfoRate: 0.18, sub: 0, vcfFreq: 0.62, vcfRes: 0.05, vcfEnv: 0.1, atk: 0.55, dec: 0.5, sus: 0.85, rel: 0.55, chorus: 3 } },
    { name: 'Soft Pad', values: { range: 1, pulse: 1, saw: 0, pwm: 0.6, pwmMode: 1, lfoRate: 0.15, sub: 0.2, hpf: 1, vcfFreq: 0.45, vcfRes: 0.2, vcfEnv: 0.25, atk: 0.7, dec: 0.6, sus: 0.8, rel: 0.7, chorus: 2 } },
    { name: 'Funk Bass', values: { range: 0, pulse: 1, saw: 0, pwm: 0, pwmMode: 0, sub: 0.7, hpf: 0, vcfFreq: 0.3, vcfRes: 0.4, vcfEnv: 0.6, vcfKybd: 0.3, atk: 0, dec: 0.5, sus: 0.1, rel: 0.2, chorus: 0 } },
    { name: 'Sub Bass', values: { range: 0, pulse: 0, saw: 1, sub: 0.9, hpf: 0, vcfFreq: 0.28, vcfRes: 0.1, vcfEnv: 0.2, atk: 0.01, dec: 0.4, sus: 0.6, rel: 0.15, chorus: 0 } },
    { name: 'Pluck', values: { range: 1, pulse: 1, saw: 1, pwm: 0.3, sub: 0.1, vcfFreq: 0.3, vcfRes: 0.3, vcfEnv: 0.6, atk: 0, dec: 0.52, sus: 0, rel: 0.35, chorus: 1 } },
    { name: 'Wobble Lead', values: { range: 2, pulse: 1, saw: 1, pwm: 0.2, sub: 0, vcfFreq: 0.5, vcfRes: 0.45, vcfEnv: 0.2, vcfLfo: 0.35, lfoRate: 0.5, atk: 0.02, dec: 0.4, sus: 0.8, rel: 0.2, voiceMode: 2, portaOn: 1, portaTime: 0.25, chorus: 1 } },
    { name: 'Vibrato Lead', values: { range: 1, pulse: 1, saw: 1, pwm: 0, sub: 0.15, dcoLfo: 0.25, lfoRate: 0.45, lfoDelay: 0.35, vcfFreq: 0.6, vcfRes: 0.2, vcfEnv: 0.3, atk: 0.02, dec: 0.5, sus: 0.8, rel: 0.2, voiceMode: 1, chorus: 2 } },
    { name: 'Bell Tine', values: { range: 2, pulse: 1, saw: 0, pwm: 0.5, sub: 0, noise: 0.05, hpf: 2, vcfFreq: 0.7, vcfRes: 0.5, vcfEnv: 0.3, atk: 0, dec: 0.68, sus: 0, rel: 0.6, chorus: 3 } },
    { name: 'Noise Sweep', values: { range: 1, pulse: 0, saw: 0, sub: 0, noise: 0.9, vcfFreq: 0.2, vcfRes: 0.6, vcfEnv: 0.7, atk: 0.65, dec: 0.8, sus: 0.3, rel: 0.6, chorus: 2 } }
];

const VOICES = 6;
const MAX_CENTS = 9600;
const UNISON_SPREAD = [-14, -8, -3, 3, 8, 14];   // cents de cada voz en el modo Unison
const BEND_FULL = 200;                            // los cents que equivalen a la palanca a tope

/** Curvas de tiempo del original: 1 ms - 3 s el ataque, 2 ms - 12 s el decaimiento y la liberacion. */
export const attackTime = (x: number) => 0.001 * Math.pow(3000, x);
export const slowTime = (x: number) => 0.002 * Math.pow(6000, x);

interface EnvState {
    node: ConstantSourceNode;
    t0: number;      // inicio del ataque
    from: number;    // nivel de partida
    attack: number;
    decay: number;
    sustain: number;
    relT: number;    // instante de la liberacion (-1: sin liberar)
    relFrom: number;
    relTc: number;
}

interface Voice {
    saw: OscillatorNode;
    sub: OscillatorNode;
    sawGain: GainNode;
    pulseDirect: GainNode;
    pulseNeg: GainNode;
    pwmDelay: DelayNode;
    subGain: GainNode;
    noiseGain: GainNode;
    shelf: BiquadFilterNode;
    hpf: BiquadFilterNode;
    f1: BiquadFilterNode;
    f2: BiquadFilterNode;
    vca: GainNode;
    out: GainNode;
    lfoGain: GainNode;       // el LFO de esta voz con su retardo de entrada
    vibGain: GainNode;
    filtLfoGain: GainNode;
    pwmGain: GainNode;
    envGain: GainNode;
    kf: ConstantSourceNode;
    amp: EnvState;
    flt: EnvState;
    midi: number;
    id: string;
    freq: number;
    connected: boolean;      // la voz esta enchufada al bus (las libres se desenchufan y no gastan procesador)
    held: boolean;           // la tecla sigue apretada
    sustained: boolean;      // soltada pero retenida por el pedal
    startT: number;
    freeAt: number;          // desde cuando la voz esta libre (termino su liberacion)
}

/**
 * Juno-106: sintetizador polifonico de 6 voces. Por voz: un DCO (sierra + pulso con PWM + sub + ruido),
 * un filtro pasa altos de 4 posiciones, un pasa bajos resonante de 24 dB, un VCA y un envolvente ADSR
 * compartido por el filtro y el VCA; un LFO triangular con retardo y el chorus I / II estereo al final.
 *
 *  DCO -> mezcla -> HPF -> VCF 24 dB -> VCA -> (6 voces) -> chorus -> salida
 *
 * El pulso se arma restando dos sierras desplazadas (sierra - sierra retardada): sale limitado en banda
 * y el ancho no depende de la altura de la nota.
 */
export class JunoModule extends RackModule {
    readonly type = 'juno';
    readonly ports: ReadonlyArray<PortDef> = [
        { id: 'notes', kind: 'note', dir: 'in', label: 'Notas' },
        { id: 'out', kind: 'audio', dir: 'out', label: 'Audio' }
    ];

    public values: { [id: string]: number } = {};
    public presetName = 'Init';
    public readonly analyser: AnalyserNode;

    private voices: Array<Voice> = [];
    private lfo: OscillatorNode;
    private noise: AudioBufferSourceNode;
    private bendDcoSrc: ConstantSourceNode;
    private bendVcfSrc: ConstantSourceNode;
    private bus: GainNode;
    private master: GainNode;
    private glue: DynamicsCompressorNode;
    private sweeper: any;
    private output: GainNode;
    private dryL: GainNode;
    private dryR: GainNode;
    private wetL: GainNode;
    private wetR: GainNode;
    private chorusDelayL: DelayNode;
    private chorusDelayR: DelayNode;
    private chorusLfo: OscillatorNode;
    private chorusDepthL: GainNode;
    private chorusDepthR: GainNode;
    private bend = 0;
    private lastFreq = 0;
    private nextVoice = 0;
    private sustain = false;
    private stack: Array<number> = [];   // notas apretadas (modo Unison)

    // MIDI learn: cada control (CC) del controlador puede mover un control del panel
    public learn = false;
    public learnTarget: string = null;                  // el control del panel que espera su perilla
    public ccMap: { [cc: number]: string } = {};        // CC -> id del control
    public lastCc = '';                                  // el ultimo CC que llego (para ver que manda cada perilla)

    constructor(env: ModuleEnv) {
        super(env);
        const ctx = env.ctx;
        this.bus = ctx.createGain();
        this.master = ctx.createGain();
        this.output = ctx.createGain();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;

        // Chorus estereo: dos lineas de retardo que el LFO mueve en contrafase
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 9000;
        const merger = ctx.createChannelMerger(2);
        this.dryL = ctx.createGain();
        this.dryR = ctx.createGain();
        this.wetL = ctx.createGain();
        this.wetR = ctx.createGain();
        this.chorusDelayL = ctx.createDelay(0.05);
        this.chorusDelayR = ctx.createDelay(0.05);
        this.chorusDelayL.delayTime.value = 0.00345;
        this.chorusDelayR.delayTime.value = 0.00345;
        this.chorusLfo = ctx.createOscillator();
        this.chorusLfo.type = 'triangle';
        this.chorusDepthL = ctx.createGain();
        this.chorusDepthR = ctx.createGain();
        this.chorusLfo.connect(this.chorusDepthL);
        this.chorusLfo.connect(this.chorusDepthR);
        this.chorusDepthL.connect(this.chorusDelayL.delayTime);
        this.chorusDepthR.connect(this.chorusDelayR.delayTime);
        this.bus.connect(this.dryL);
        this.bus.connect(this.dryR);
        this.bus.connect(lowpass);
        lowpass.connect(this.chorusDelayL);
        lowpass.connect(this.chorusDelayR);
        this.chorusDelayL.connect(this.wetL);
        this.chorusDelayR.connect(this.wetR);
        this.dryL.connect(merger, 0, 0);
        this.wetL.connect(merger, 0, 0);
        this.dryR.connect(merger, 0, 1);
        this.wetR.connect(merger, 0, 1);
        // Un compresor suave antes del volumen: los acordes de 6 voces y las colas de las notas no recortan
        this.glue = ctx.createDynamicsCompressor();
        this.glue.threshold.value = -14;
        this.glue.knee.value = 12;
        this.glue.ratio.value = 6;
        this.glue.attack.value = 0.004;
        this.glue.release.value = 0.18;
        merger.connect(this.glue);
        this.glue.connect(this.master);
        this.master.connect(this.output);
        this.output.connect(this.analyser);
        this.chorusLfo.start();

        // LFO, ruido y palanca de pitch (compartidos por las voces)
        this.lfo = ctx.createOscillator();
        this.lfo.type = 'triangle';
        this.lfo.start();
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
        this.noise = ctx.createBufferSource();
        this.noise.buffer = buf;
        this.noise.loop = true;
        this.noise.start();
        this.bendDcoSrc = ctx.createConstantSource();
        this.bendVcfSrc = ctx.createConstantSource();
        this.bendDcoSrc.offset.value = 0;
        this.bendVcfSrc.offset.value = 0;
        this.bendDcoSrc.start();
        this.bendVcfSrc.start();

        for (let i = 0; i < VOICES; i++)
            this.voices.push(this.buildVoice());
        // En vivo, las voces libres se desenchufan: el navegador deja de calcularlas. Se vuelven a enchufar al tocar
        if (env.live) {
            this.voices.forEach(v => this.park(v));
            this.sweeper = setInterval(() => this.sweep(), 400);
        }

        JUNO_PARAMS.forEach(p => this.values[p.id] = p.default);
        JUNO_PARAMS.forEach(p => this.apply(p.id, p.default, true));
    }

    private park(v: Voice) {
        if (v.connected) {
            v.out.disconnect();
            v.connected = false;
        }
    }

    private sweep() {
        const now = this.env.ctx.currentTime;
        this.voices.forEach(v => {
            if (v.connected && !v.held && !v.sustained && now > v.freeAt + 0.1)
                this.park(v);
        });
    }

    private buildEnv(): EnvState {
        const node = this.env.ctx.createConstantSource();
        node.offset.value = 0;
        node.start();
        return { node, t0: 0, from: 0, attack: 0.001, decay: 0.1, sustain: 1, relT: 0, relFrom: 0, relTc: 0.01 };
    }

    private buildVoice(): Voice {
        const ctx = this.env.ctx;
        const g = () => ctx.createGain();
        const v: Voice = {
            saw: ctx.createOscillator(), sub: ctx.createOscillator(),
            sawGain: g(), pulseDirect: g(), pulseNeg: g(), pwmDelay: ctx.createDelay(0.5),
            subGain: g(), noiseGain: g(),
            shelf: ctx.createBiquadFilter(), hpf: ctx.createBiquadFilter(),
            f1: ctx.createBiquadFilter(), f2: ctx.createBiquadFilter(),
            vca: g(), out: g(), lfoGain: g(), vibGain: g(), filtLfoGain: g(), pwmGain: g(), envGain: g(),
            kf: ctx.createConstantSource(),
            amp: this.buildEnv(), flt: this.buildEnv(),
            midi: -1, id: '', freq: 440, connected: true, held: false, sustained: false, startT: 0, freeAt: 0
        };
        v.saw.type = 'sawtooth';
        v.sub.type = 'square';
        v.shelf.type = 'lowshelf';
        v.shelf.frequency.value = 100;
        v.hpf.type = 'highpass';
        v.hpf.Q.value = 0.7;
        v.f1.type = 'lowpass';
        v.f2.type = 'lowpass';
        v.vca.gain.value = 0;
        v.kf.offset.value = 0;

        // DCO
        v.saw.connect(v.sawGain);
        v.saw.connect(v.pulseDirect);
        v.saw.connect(v.pwmDelay);
        v.pwmDelay.connect(v.pulseNeg);
        v.sub.connect(v.subGain);
        this.noise.connect(v.noiseGain);
        const mix = g();
        mix.gain.value = 0.14;
        [v.sawGain, v.pulseDirect, v.pulseNeg, v.subGain, v.noiseGain].forEach(n => n.connect(mix));
        mix.connect(v.shelf);
        v.shelf.connect(v.hpf);
        v.hpf.connect(v.f1);
        v.f1.connect(v.f2);
        v.f2.connect(v.vca);
        v.vca.connect(v.out);
        v.out.connect(this.bus);

        // Modulaciones: LFO (vibrato, filtro, PWM), palanca, envolvente y seguimiento de teclado
        this.lfo.connect(v.lfoGain);
        v.lfoGain.connect(v.vibGain);
        v.lfoGain.connect(v.filtLfoGain);
        v.lfoGain.connect(v.pwmGain);
        v.vibGain.connect(v.saw.detune);
        v.vibGain.connect(v.sub.detune);
        v.pwmGain.connect(v.pwmDelay.delayTime);
        this.bendDcoSrc.connect(v.saw.detune);
        this.bendDcoSrc.connect(v.sub.detune);
        v.filtLfoGain.connect(v.f1.detune);
        v.filtLfoGain.connect(v.f2.detune);
        this.bendVcfSrc.connect(v.f1.detune);
        this.bendVcfSrc.connect(v.f2.detune);
        v.flt.node.connect(v.envGain);
        v.envGain.connect(v.f1.detune);
        v.envGain.connect(v.f2.detune);
        v.kf.connect(v.f1.detune);
        v.kf.connect(v.f2.detune);
        v.amp.node.connect(v.vca.gain);
        v.kf.start();
        v.saw.start();
        v.sub.start();
        return v;
    }

    audioPort(id: string): AudioNode | null {
        return id == 'out' ? this.output : null;
    }

    // --- Parametros ---

    setParam(id: string, value: number) {
        const def = JUNO_PARAMS.find(p => p.id == id);
        if (!def || typeof value != 'number' || !isFinite(value))
            return;
        value = Math.max(def.min, Math.min(def.max, value));
        if (def.kind == 'switch')
            value = Math.round(value);
        this.values[id] = value;
        this.apply(id, value, false);
        this.presetName = '';
        this.env.changed();
    }

    loadPreset(index: number) {
        const preset = JUNO_PRESETS[index];
        if (!preset)
            return;
        this.allNotesOff();
        JUNO_PARAMS.forEach(p => {
            const v = preset.values[p.id] !== undefined ? preset.values[p.id] : p.default;
            this.values[p.id] = v;
            this.apply(p.id, v, false);
        });
        this.presetName = preset.name;
        this.env.changed();
    }

    /** Frecuencia del DCO para una nota segun el rango (16' / 8' / 4'). */
    private noteFreq(midi: number): number {
        return 440 * Math.pow(2, (midi - 69) / 12 + (this.values.range - 1));
    }

    private cutoff(): number {
        return 30 * Math.pow(700, this.values.vcfFreq);
    }

    private apply(id: string, value: number, init: boolean) {
        const v = this.values;
        const each = (fn: (voice: Voice) => void) => this.voices.forEach(fn);
        switch (id) {
            case 'lfoRate':
                this.set(this.lfo.frequency, 0.3 * Math.pow(80, value), 0.03);
                break;
            case 'dcoLfo':
                each(x => this.set(x.vibGain.gain, value * value * 300, 0.03));
                break;
            case 'pwm': case 'pwmMode':
                each(x => this.applyPwm(x));
                break;
            case 'pulse':
                each(x => { this.set(x.pulseDirect.gain, value, 0.01); this.set(x.pulseNeg.gain, -value, 0.01); });
                break;
            case 'saw':
                each(x => this.set(x.sawGain.gain, value, 0.01));
                break;
            case 'sub':
                each(x => this.set(x.subGain.gain, value * 0.9, 0.02));
                break;
            case 'noise':
                each(x => this.set(x.noiseGain.gain, value * 0.8, 0.02));
                break;
            case 'hpf':
                // 0: refuerzo de graves, 1: plano, 2 y 3: pasa altos cada vez mas arriba
                each(x => {
                    this.set(x.shelf.gain, value == 0 ? 7 : 0, 0.02);
                    this.set(x.hpf.frequency, [10, 10, 240, 720][value], 0.02);
                });
                break;
            case 'vcfFreq':
                each(x => { this.set(x.f1.frequency, this.cutoff(), 0.02); this.set(x.f2.frequency, this.cutoff(), 0.02); });
                break;
            case 'vcfRes':
                // Dos etapas de 12 dB; la resonancia pesa casi toda en la segunda
                each(x => { this.set(x.f1.Q, value * 4, 0.02); this.set(x.f2.Q, value * 24, 0.02); });
                break;
            case 'vcfEnv': case 'envPol':
                each(x => this.set(x.envGain.gain, (v.envPol ? 1 : -1) * v.vcfEnv * MAX_CENTS, 0.02));
                break;
            case 'vcfLfo':
                each(x => this.set(x.filtLfoGain.gain, value * value * 2400, 0.03));
                break;
            case 'vcfKybd':
                each(x => x.midi >= 0 && this.set(x.kf.offset, (x.midi - 60) * 100 * value, 0.02));
                break;
            case 'vcaLevel':
                this.set(this.master.gain, value * 1.25, 0.02);
                break;
            case 'bendDco': case 'bendVcf':
                this.applyBend();
                break;
            case 'chorus':
                this.applyChorus(value);
                break;
            case 'voiceMode':
                if (!init)
                    this.allNotesOff();
                break;
        }
    }

    /** Ancho del pulso: a mano (el deslizador PWM fija el ancho) o movido por el LFO (el deslizador fija la profundidad). */
    private applyPwm(x: Voice) {
        const pw = this.values.pwm;
        const lfoMode = this.values.pwmMode == 1;
        const duty = lfoMode ? 0.5 : 0.5 + pw * 0.45;
        const f = Math.max(1, x.freq);
        this.set(x.pwmDelay.delayTime, Math.min(0.45, duty / f), 0.01);
        this.set(x.pwmGain.gain, lfoMode ? pw * 0.4 / f : 0, 0.01);
    }

    private applyBend() {
        this.set(this.bendDcoSrc.offset, this.bend * this.values.bendDco * 1200, 0.01);
        this.set(this.bendVcfSrc.offset, this.bend * this.values.bendVcf * 2400, 0.01);
    }

    private applyChorus(mode: number) {
        // I y II: barrido lento y ancho; I+II: vibrato rapido y corto (como el original)
        const rate = mode == 1 ? 0.513 : mode == 2 ? 0.863 : 9.75;
        const depth = mode == 3 ? 0.00025 : 0.0019;
        this.set(this.chorusLfo.frequency, rate, 0.02);
        this.set(this.chorusDepthL.gain, depth, 0.02);
        this.set(this.chorusDepthR.gain, -depth, 0.02);
        this.set(this.dryL.gain, mode ? 0.8 : 1, 0.02);
        this.set(this.dryR.gain, mode ? 0.8 : 1, 0.02);
        this.set(this.wetL.gain, mode ? 0.6 : 0, 0.02);
        this.set(this.wetR.gain, mode ? 0.6 : 0, 0.02);
    }

    // --- Envolventes ---

    /** Nivel del envolvente en un instante, segun lo que se le agendo (el AudioParam no se puede leer). */
    private envLevel(e: EnvState, t: number): number {
        if (e.relT >= 0 && t >= e.relT)
            return e.relFrom * Math.exp(-(t - e.relT) / e.relTc);
        const dt = Math.max(0, t - e.t0);
        if (dt < e.attack)
            return e.from + (1 - e.from) * dt / e.attack;
        return e.sustain + (1 - e.sustain) * Math.exp(-(dt - e.attack) / (e.decay / 3));
    }

    private triggerEnv(e: EnvState, t: number, attack: number, decay: number, sustain: number) {
        const from = Math.max(0, Math.min(1, this.envLevel(e, t)));
        const dur = Math.max(0.0015, attack * (1 - from));
        e.t0 = t; e.from = from; e.attack = dur; e.decay = Math.max(0.002, decay); e.sustain = sustain; e.relT = -1;
        const p = e.node.offset;
        p.cancelScheduledValues(t);
        p.setValueAtTime(from, t);
        p.linearRampToValueAtTime(1, t + dur);
        p.setTargetAtTime(sustain, t + dur, e.decay / 3);
    }

    private releaseEnv(e: EnvState, t: number, time: number) {
        const level = this.envLevel(e, t);
        e.relT = t; e.relFrom = level; e.relTc = Math.max(0.002, time) / 3;
        const p = e.node.offset;
        p.cancelScheduledValues(t);
        p.setValueAtTime(level, t);
        p.setTargetAtTime(0, t, e.relTc);
    }

    // --- Notas ---

    receive(msg: NoteMsg, port: string) {
        if (port != 'notes')
            return;
        const now = this.env.ctx.currentTime;
        switch (msg.type) {
            case 'on': this.noteOn(msg.midi, msg.id || '', Math.max(now, msg.when !== undefined ? msg.when : now)); break;
            case 'off': this.noteOff(msg.midi, msg.id || '', Math.max(now, msg.when !== undefined ? msg.when : now)); break;
            case 'sustain': this.setSustain(msg.on); break;
            case 'bend':
                this.bend = Math.max(-1, Math.min(1, msg.cents / BEND_FULL));
                this.applyBend();
                break;
            case 'cc': this.handleCc(msg.cc, msg.value); break;
            case 'allOff': this.allNotesOff(); break;
        }
    }

    // --- MIDI learn ---

    setLearn(on: boolean) {
        this.learn = on;
        this.learnTarget = null;
    }

    /** En modo learn: elige el control del panel al que se le va a asignar la proxima perilla. */
    selectLearn(id: string) {
        this.learnTarget = this.learnTarget == id ? null : id;
    }

    /** El CC asignado a un control (o null). */
    ccFor(id: string): number {
        const cc = Object.keys(this.ccMap).find(k => this.ccMap[+k] == id);
        return cc === undefined ? null : +cc;
    }

    clearCcMap() {
        this.ccMap = {};
        this.learnTarget = null;
        this.env.changed();
    }

    private handleCc(cc: number, value: number) {
        if (!isFinite(cc) || !isFinite(value))
            return;
        this.lastCc = 'CC ' + cc + ' = ' + Math.round(value);
        if (this.learn && this.learnTarget) {
            // Un CC mueve un solo control y un control tiene un solo CC
            Object.keys(this.ccMap).forEach(k => { if (this.ccMap[+k] == this.learnTarget || +k == cc) delete this.ccMap[+k]; });
            this.ccMap[cc] = this.learnTarget;
            this.learnTarget = null;
            this.env.changed();
        }
        const id = this.ccMap[cc];
        const def = id && JUNO_PARAMS.find(p => p.id == id);
        if (!def)
            return;
        const norm = Math.max(0, Math.min(127, value)) / 127;
        // Los interruptores se reparten en tramos iguales del recorrido de la perilla
        this.setParam(id, def.kind == 'slider' ? norm : Math.min(def.max, Math.floor(norm * (def.max + 1) * 0.9999)));
    }

    /** La palanca del panel: -1..1 (vuelve al centro al soltarla). */
    setBend(norm: number) {
        this.bend = Math.max(-1, Math.min(1, norm));
        this.applyBend();
    }

    get bendValue(): number {
        return this.bend;
    }

    private noteOn(midi: number, id: string, t: number) {
        if (this.values.voiceMode == 2) {
            this.stack = this.stack.filter(m => m != midi);
            this.stack.push(midi);
            this.voices.forEach((v, i) => this.startVoice(v, midi, id, t, UNISON_SPREAD[i], 0.45));
            return;
        }
        // Poly 2 vuelve a usar siempre la primera voz libre; Poly 1 va rotando entre las voces
        let v = this.voices.find(x => x.midi == midi && x.held);
        if (!v) {
            const free = (x: Voice) => !x.held && !x.sustained && t >= x.freeAt;
            if (this.values.voiceMode == 1)
                v = this.voices.find(free);
            else
                for (let i = 0; i < VOICES && !v; i++) {
                    const c = this.voices[(this.nextVoice + i) % VOICES];
                    if (free(c))
                        v = c;
                }
            if (!v) {
                // Todas ocupadas: se roba la mas vieja que ya se esta liberando, o la mas vieja de todas
                const releasing = this.voices.filter(x => !x.held && !x.sustained).sort((a, b) => a.startT - b.startT);
                v = releasing[0] || this.voices.slice().sort((a, b) => a.startT - b.startT)[0];
            }
            this.nextVoice = (this.voices.indexOf(v) + 1) % VOICES;
        }
        this.startVoice(v, midi, id, t, 0, 1);
    }

    private startVoice(v: Voice, midi: number, id: string, when: number, detune: number, gain: number) {
        const val = this.values;
        let t = when;
        // Una voz que todavia suena con otra nota se apaga en un instante antes de arrancar la nueva (sin clicks)
        const level = this.envLevel(v.amp, t);
        if (level > 0.02 && v.midi != midi) {
            const p = v.amp.node.offset;
            p.cancelScheduledValues(t);
            p.setValueAtTime(level, t);
            p.linearRampToValueAtTime(0, t + 0.005);
            v.amp.from = 0; v.amp.t0 = t + 0.005; v.amp.attack = 0.0001; v.amp.sustain = 0; v.amp.relT = t + 0.005; v.amp.relFrom = 0; v.amp.relTc = 0.01;
            t += 0.006;
        }
        if (!v.connected) {
            v.out.connect(this.bus);
            v.connected = true;
        }
        const f = this.noteFreq(midi);
        const prev = val.portaOn && this.lastFreq > 0 ? this.lastFreq : f;
        [[v.saw.frequency, f], [v.sub.frequency, f / 2]].forEach(pair => {
            const p = pair[0] as AudioParam;
            p.cancelScheduledValues(t);
            p.setValueAtTime(prev == f ? pair[1] as number : (pair[1] as number) * prev / f, t);
            if (prev != f)
                p.setTargetAtTime(pair[1] as number, t, Math.max(0.001, val.portaTime * val.portaTime));
        });
        // Sin cancelar, cada nota deja eventos viejos en el parametro y la linea de tiempo crece sin limite
        [v.saw.detune, v.sub.detune, v.out.gain, v.kf.offset].forEach(p => p.cancelScheduledValues(t));
        v.saw.detune.setValueAtTime(detune, t);
        v.sub.detune.setValueAtTime(detune, t);
        this.lastFreq = f;
        v.midi = midi; v.id = id; v.freq = f; v.held = true; v.sustained = false; v.startT = t; v.freeAt = Infinity;
        // La resonancia suma volumen (el pico del filtro): se compensa un poco
        v.out.gain.setValueAtTime(gain * (1 - 0.4 * val.vcfRes), t);
        this.applyPwm(v);
        v.kf.offset.setValueAtTime((midi - 60) * 100 * val.vcfKybd, t);

        // LFO: entra despues del retardo
        const delay = val.lfoDelay * val.lfoDelay * 3;
        v.lfoGain.gain.cancelScheduledValues(t);
        if (delay > 0.001) {
            v.lfoGain.gain.setValueAtTime(0, t);
            v.lfoGain.gain.setValueAtTime(0, t + delay);
            v.lfoGain.gain.linearRampToValueAtTime(1, t + delay + Math.max(0.05, delay * 0.5));
        } else
            v.lfoGain.gain.setValueAtTime(1, t);

        // Envolventes: la del filtro es siempre la ADSR; la del VCA, la ADSR o un gate corto
        const a = attackTime(val.atk), d = slowTime(val.dec), s = val.sus;
        this.triggerEnv(v.flt, t, a, d, s);
        if (val.vcaMode == 1)
            this.triggerEnv(v.amp, t, 0.003, 0.5, 1);
        else
            this.triggerEnv(v.amp, t, a, d, s);
    }

    private releaseVoice(v: Voice, t: number) {
        v.held = false;
        v.sustained = false;
        const gate = this.values.vcaMode == 1;
        const r = slowTime(this.values.rel);
        this.releaseEnv(v.flt, t, r);
        this.releaseEnv(v.amp, t, gate ? 0.008 : r);
        v.freeAt = t + (gate ? 0.008 : r) * 1.6;
    }

    private noteOff(midi: number, id: string, t: number) {
        if (this.values.voiceMode == 2) {
            const wasTop = this.stack[this.stack.length - 1] == midi;
            this.stack = this.stack.filter(m => m != midi);
            if (!wasTop || this.sustain)
                return;
            if (this.stack.length)
                this.voices.forEach((v, i) => this.startVoice(v, this.stack[this.stack.length - 1], '', t, UNISON_SPREAD[i], 0.45));
            else
                this.voices.forEach(v => v.held && this.releaseVoice(v, t));
            return;
        }
        this.voices.forEach(v => {
            if (v.held && v.midi == midi && (!id || !v.id || v.id == id)) {
                if (this.sustain) {
                    v.sustained = true;
                    v.held = false;
                } else
                    this.releaseVoice(v, t);
            }
        });
    }

    private setSustain(on: boolean) {
        this.sustain = on;
        if (!on) {
            const t = this.env.ctx.currentTime;
            this.voices.forEach(v => v.sustained && this.releaseVoice(v, t));
            if (this.values.voiceMode == 2 && !this.stack.length)
                this.voices.forEach(v => v.held && this.releaseVoice(v, t));
        }
    }

    allNotesOff() {
        const t = this.env.ctx.currentTime;
        this.stack = [];
        this.sustain = false;
        this.voices.forEach(v => (v.held || v.sustained) && this.releaseVoice(v, t));
    }

    /** Voces sonando (para el indicador del panel). */
    activeVoices(): number {
        const t = this.env.ctx.currentTime;
        return this.voices.filter(v => v.held || v.sustained || t < v.freeAt).length;
    }

    /** Pico de la senal de salida (0..1), para el medidor. */
    level(): number {
        const buf = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++)
            peak = Math.max(peak, Math.abs(buf[i]));
        return Math.min(1, peak);
    }

    // --- Automatizacion y estado ---

    autoParam(id: string) {
        const def = id.indexOf('p.') == 0 ? JUNO_PARAMS.find(p => p.id == id.slice(2)) : null;
        return def && def.kind == 'slider' ? { label: def.label, min: 0, max: 1 } : null;
    }

    getAutoValue(id: string): number {
        return this.values[id.slice(2)];
    }

    setAutoValue(id: string, value: number) {
        this.setParam(id.slice(2), value);
    }

    getState() {
        return { values: this.values, preset: this.presetName, cc: this.ccMap };
    }

    setState(raw: any) {
        raw = raw && typeof raw == 'object' ? raw : {};
        const saved = raw.values && typeof raw.values == 'object' ? raw.values : {};
        JUNO_PARAMS.forEach(p => {
            const x = typeof saved[p.id] == 'number' && isFinite(saved[p.id]) ? saved[p.id] : p.default;
            const v = Math.max(p.min, Math.min(p.max, p.kind == 'switch' ? Math.round(x) : x));
            this.values[p.id] = v;
            this.apply(p.id, v, true);
        });
        this.presetName = typeof raw.preset == 'string' ? raw.preset : '';
        this.ccMap = {};
        if (raw.cc && typeof raw.cc == 'object')
            Object.keys(raw.cc).forEach(k => {
                const cc = +k;
                if (cc >= 0 && cc <= 127 && cc == Math.round(cc) && JUNO_PARAMS.some(p => p.id == raw.cc[k]))
                    this.ccMap[cc] = raw.cc[k];
            });
    }

    dispose() {
        this.allNotesOff();
        const stop = (n: any) => { try { n.stop(); } catch (e) {} };
        [this.lfo, this.chorusLfo, this.noise, this.bendDcoSrc, this.bendVcfSrc].forEach(stop);
        this.voices.forEach(v => {
            [v.saw, v.sub, v.kf, v.amp.node, v.flt.node].forEach(stop);
            v.out.disconnect();
        });
        clearInterval(this.sweeper);
        this.output.disconnect();
    }
}
