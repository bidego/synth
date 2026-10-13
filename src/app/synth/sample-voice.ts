import { Patch } from '../services/presets';
import { Instrument, Zone, findZone } from '../services/sample-library';
import { decaysNaturally } from '../services/gm';

// Cancela la automatizacion pero conserva el valor actual (para releases interrumpidos)
function holdValue(param: AudioParam, t: number) {
    const p = param as any;
    if (p.cancelAndHoldAtTime) {
        p.cancelAndHoldAtTime(t);
    } else {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
    }
}

const NEAR_ZERO = 0.000001;

/**
 * Una nota de un instrumento de muestras (o una pieza de bateria).
 *
 *  muestra (con loop) -> caida natural -> envolvente del patch -> filtro -> amp -> destino
 *
 * - La muestra se transpone con playbackRate desde su afinacion original.
 * - La "caida natural" es la envolvente que trae el propio instrumento (piano, cuerdas...).
 * - Las piezas de bateria suenan completas: soltar la tecla no las corta.
 */
export class SampleVoice {
    public onEnded: () => void;
    private nodes: Array<AudioNode> = [];
    private src: AudioBufferSourceNode;
    private shape: GainNode;
    private oneShot: boolean;
    private released = false;
    private releasedAt = Infinity;
    private lfo: OscillatorNode;

    constructor(private ctx: BaseAudioContext, destination: AudioNode, patch: Patch, midi: number,
                velocity: number, bend: number, when: number | undefined, instrument: Instrument) {
        const t = when !== undefined ? when : ctx.currentTime;
        const isKit = instrument.kind == 'kit';
        // Las baterias usan la nota GM directa; los instrumentos, la nota tocada
        const zone: Zone = findZone(instrument, midi);
        if (!zone) {
            setTimeout(() => this.dispose());
            return;
        }
        this.oneShot = isKit;

        const src = ctx.createBufferSource();
        src.buffer = zone.buffer;
        const baseDetune = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;
        src.playbackRate.value = Math.pow(2, (100 * midi - baseDetune) / 1200);
        src.detune.value = bend;
        if (zone.loop && !isKit) {
            src.loop = true;
            src.loopStart = zone.loopStart;
            src.loopEnd = zone.loopEnd;
        }
        this.src = src;

        // Caida natural del instrumento
        const natural = ctx.createGain();
        const vel = (isKit ? 0.3 : 0.15) + (isKit ? 0.7 : 0.85) * velocity;
        let naturalEnd = Infinity;
        // Los sostenidos (cuerdas, organos, vientos...) no llevan la caida de los datos: suenan mientras dure la tecla
        const decays = !patch.sample || decaysNaturally(patch.sample.id);
        if (zone.envelope && zone.envelope.length && !isKit && decays) {
            const env = zone.envelope;
            natural.gain.setValueAtTime(Math.max(env[0].volume * vel, NEAR_ZERO), t);
            let elapsed = 0;
            env.forEach(point => {
                if (point.duration > 0) {
                    elapsed += point.duration;
                    natural.gain.linearRampToValueAtTime(Math.max(point.volume * vel, NEAR_ZERO), t + elapsed);
                }
            });
            // Si la envolvente termina en silencio, no hace falta seguir leyendo la muestra
            if (env[env.length - 1].volume <= 0.001)
                naturalEnd = t + elapsed + 0.05;
        } else {
            natural.gain.setValueAtTime(vel, t);
        }

        // Envolvente del patch: ataque suave, decay/sustain y, al soltar, release
        const shape = ctx.createGain();
        this.shape = shape;
        const e = patch.env;
        this.patchRelease = e.release;
        if (isKit) {
            shape.gain.setValueAtTime(1, t);
        } else {
            const attack = Math.max(e.attack, 0.003);
            shape.gain.setValueAtTime(0, t);
            shape.gain.linearRampToValueAtTime(1, t + attack);
            if (e.sustain < 1)
                shape.gain.setTargetAtTime(e.sustain, t + attack, Math.max(e.decay, 0.005) / 3);
        }

        const f = patch.filter;
        const filter = ctx.createBiquadFilter();
        filter.type = f.type;
        filter.Q.value = f.q;
        const cutoff = f.cutoff * Math.pow(this.hz(midi) / 261.63, f.track);
        filter.frequency.setValueAtTime(cutoff, t);
        if (f.envAmount && !isKit) {
            filter.frequency.setValueAtTime(Math.min(cutoff + f.envAmount, 20000), t);
            filter.frequency.setTargetAtTime(cutoff, t, Math.max(f.envDecay, 0.01) / 3);
        }
        const amp = ctx.createGain();

        src.connect(natural);
        natural.connect(shape);
        shape.connect(filter);
        filter.connect(amp);
        amp.connect(destination);
        this.nodes.push(src, natural, shape, filter, amp);

        const l = patch.lfo;
        if (l.depth > 0 && !isKit) {
            this.lfo = ctx.createOscillator();
            this.lfo.frequency.value = l.rate;
            const lfoGain = ctx.createGain();
            this.lfo.connect(lfoGain);
            if (l.target == 'pitch') {
                lfoGain.gain.value = l.depth;
                lfoGain.connect(src.detune);
            } else if (l.target == 'filter') {
                lfoGain.gain.value = l.depth;
                lfoGain.connect(filter.frequency);
            } else {
                amp.gain.value = 1 - l.depth / 2;
                lfoGain.gain.value = l.depth / 2;
                lfoGain.connect(amp.gain);
            }
            this.lfo.start(t);
            this.nodes.push(this.lfo, lfoGain);
        }

        src.onended = () => this.dispose();
        src.start(t);
        if (naturalEnd < Infinity)
            src.stop(naturalEnd);
    }

    private hz(midi: number): number {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    /** Pitch bend en cents. */
    setBend(cents: number) {
        if (this.src)
            this.src.detune.setTargetAtTime(cents, this.ctx.currentTime, 0.01);
    }

    release(fast = false, when?: number) {
        if (!this.src || this.oneShot)
            return;
        const t = when !== undefined ? when : this.ctx.currentTime;
        if (this.released && t >= this.releasedAt)
            return;
        this.released = true;
        this.releasedAt = t;
        const release = fast ? 0.03 : Math.max(this.releaseTime, 0.01);
        holdValue(this.shape.gain, t);
        this.shape.gain.setTargetAtTime(0, t, release / 3);
        const stopAt = t + release * 1.7 + 0.05;
        this.src.stop(stopAt);
        if (this.lfo)
            this.lfo.stop(stopAt);
    }

    private get releaseTime(): number {
        return this.patchRelease;
    }
    private patchRelease = 0.4;

    private dispose() {
        this.nodes.forEach(n => n.disconnect());
        if (this.onEnded)
            this.onEnded();
    }
}
