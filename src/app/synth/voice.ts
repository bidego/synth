import { Patch, EnvConfig } from '../services/presets';

// Cancela la automatizacion pero conserva el valor actual (para ataque/release interrumpidos)
function holdValue(param: AudioParam, t: number) {
    const p = param as any;
    if (p.cancelAndHoldAtTime) {
        p.cancelAndHoldAtTime(t);
    } else {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
    }
}

/**
 * Una nota sonando. Por cada capa del patch:  osc -> envolvente propia ->
 * filtro (compartido) -> amp -> destino. Se autodestruye al terminar el release.
 */
export class Voice {
    public onEnded: () => void;
    private oscs: Array<OscillatorNode> = [];
    private lfo: OscillatorNode;
    private nodes: Array<AudioNode> = [];
    private envs: Array<{ gain: GainNode, env: EnvConfig }> = [];
    private baseDetune: Array<number> = [];
    private released = false;
    private releasedAt = Infinity;

    /** `when` agenda el inicio en el tiempo del AudioContext (looper); por defecto, ahora.
     *  `velocity` 0..1 escala el volumen de las capas; `bend` son cents de pitch bend inicial. */
    constructor(private ctx: AudioContext, destination: AudioNode, patch: Patch, freq: number, velocity = 1, bend = 0, when?: number) {
        const t = when !== undefined ? when : ctx.currentTime;
        const f = patch.filter;

        const filter = ctx.createBiquadFilter();
        filter.type = f.type;
        filter.Q.value = f.q;
        // El cutoff se mide en el Do central y acompana a la nota segun `track`
        const cutoff = f.cutoff * Math.pow(freq / 261.63, f.track);
        filter.frequency.setValueAtTime(cutoff, t);
        if (f.envAmount) {
            filter.frequency.setValueAtTime(Math.min(cutoff + f.envAmount, 20000), t);
            filter.frequency.setTargetAtTime(cutoff, t, Math.max(f.envDecay, 0.01) / 3);
        }
        const amp = ctx.createGain();
        filter.connect(amp);
        amp.connect(destination);
        this.nodes.push(filter, amp);

        // Curva suave: una nota floja sigue escuchandose
        const vel = 0.15 + 0.85 * velocity;
        patch.layers.forEach(layer => {
            if (layer.volume <= 0)
                return;
            const peak = layer.volume * vel;
            const e = layer.env || patch.env;
            const osc = ctx.createOscillator();
            osc.type = layer.wave;
            osc.frequency.value = freq * layer.ratio;
            osc.detune.value = layer.detune + bend;
            this.baseDetune.push(layer.detune);
            const gain = ctx.createGain();
            const attack = Math.max(e.attack, 0.003);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(peak, t + attack);
            gain.gain.setTargetAtTime(peak * e.sustain, t + attack, Math.max(e.decay, 0.005) / 3);
            osc.connect(gain);
            gain.connect(filter);
            osc.start(t);
            this.oscs.push(osc);
            this.nodes.push(osc, gain);
            this.envs.push({ gain, env: e });
        });

        const l = patch.lfo;
        if (l.depth > 0) {
            this.lfo = ctx.createOscillator();
            this.lfo.frequency.value = l.rate;
            const lfoGain = ctx.createGain();
            this.lfo.connect(lfoGain);
            if (l.target == 'pitch') {
                lfoGain.gain.value = l.depth;
                this.oscs.forEach(o => lfoGain.connect(o.detune));
            } else if (l.target == 'filter') {
                lfoGain.gain.value = l.depth;
                lfoGain.connect(filter.frequency);
            } else {
                // Tremolo: el amp oscila entre 1 - depth y 1
                amp.gain.value = 1 - l.depth / 2;
                lfoGain.gain.value = l.depth / 2;
                lfoGain.connect(amp.gain);
            }
            this.lfo.start(t);
            this.nodes.push(this.lfo, lfoGain);
        }

        if (this.oscs.length)
            this.oscs[0].onended = () => this.dispose();
        else
            setTimeout(() => this.dispose());
    }

    /** Pitch bend en cents, sobre el detune propio de cada capa. */
    setBend(cents: number) {
        const t = this.ctx.currentTime;
        this.oscs.forEach((o, i) => o.detune.setTargetAtTime(this.baseDetune[i] + cents, t, 0.01));
    }

    /** Suelta la nota. `fast` = robo de voz, release corto para no cortar con un click. */
    release(fast = false, when?: number) {
        const t = when !== undefined ? when : this.ctx.currentTime;
        // Un release agendado en el futuro todavia puede adelantarse (ej. al frenar el looper)
        if (this.released && t >= this.releasedAt)
            return;
        this.released = true;
        this.releasedAt = t;
        let longest = 0;
        this.envs.forEach(({ gain, env }) => {
            const release = fast ? 0.03 : Math.max(env.release, 0.01);
            holdValue(gain.gain, t);
            gain.gain.setTargetAtTime(0, t, release / 3);
            longest = Math.max(longest, release);
        });
        // 5 constantes de tiempo = 99% del release
        const stopAt = t + longest * 1.7 + 0.05;
        this.oscs.forEach(o => o.stop(stopAt));
        if (this.lfo)
            this.lfo.stop(stopAt);
    }

    private dispose() {
        this.nodes.forEach(n => n.disconnect());
        if (this.onEnded)
            this.onEnded();
    }
}
