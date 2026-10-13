import { FxConfig } from './presets';

/**
 * Cadena master: delay + reverb + compresor + analyser.
 * Se arma igual sobre el AudioContext en vivo y sobre el OfflineAudioContext del export a WAV,
 * asi el archivo suena igual que lo que se escucha.
 *
 *  input -> dry ------------------------------> sum -> compresor -> analyser -> destino
 *        -> delay (con realimentacion) -> wet -> sum
 *        -> reverb (convolver) --------> wet -> sum
 */
export class MasterChain {
    public input: GainNode;
    public analyser: AnalyserNode;
    private delay: DelayNode;
    private feedback: GainNode;
    private delayWet: GainNode;
    private reverbWet: GainNode;

    constructor(private ctx: BaseAudioContext) {
        this.input = ctx.createGain();
        const dry = ctx.createGain();
        const sum = ctx.createGain();

        this.delay = ctx.createDelay(2);
        this.feedback = ctx.createGain();
        const delayTone = ctx.createBiquadFilter();
        delayTone.type = 'lowpass';
        delayTone.frequency.value = 3500;
        this.delayWet = ctx.createGain();

        const reverb = ctx.createConvolver();
        reverb.buffer = this.createImpulse(2.8, 3);
        this.reverbWet = ctx.createGain();

        // Muchas capas suman volumen: el compresor evita que sature
        const compressor = ctx.createDynamicsCompressor();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;

        this.input.connect(dry);
        dry.connect(sum);
        this.input.connect(this.delay);
        this.delay.connect(delayTone);
        delayTone.connect(this.feedback);
        this.feedback.connect(this.delay);
        delayTone.connect(this.delayWet);
        this.delayWet.connect(sum);
        this.input.connect(reverb);
        reverb.connect(this.reverbWet);
        this.reverbWet.connect(sum);
        sum.connect(compressor);
        compressor.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    // Respuesta al impulso sintetica: ruido estereo con decaimiento exponencial
    private createImpulse(seconds: number, decay: number): AudioBuffer {
        const rate = this.ctx.sampleRate;
        const length = Math.floor(rate * seconds);
        const buffer = this.ctx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++)
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
        return buffer;
    }

    /** `smooth`: en vivo se interpola para evitar clicks; offline se fija el valor desde el inicio. */
    setFx(fx: FxConfig, smooth = true) {
        const t = this.ctx.currentTime;
        const set = (param: AudioParam, value: number) => {
            if (smooth)
                param.setTargetAtTime(value, t, 0.05);
            else
                param.value = value;
        };
        set(this.delay.delayTime, fx.delayTime);
        set(this.feedback.gain, Math.min(fx.delayFeedback, 0.9));
        set(this.delayWet.gain, fx.delayMix);
        set(this.reverbWet.gain, fx.reverbMix);
    }
}
