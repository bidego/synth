import { Patch } from '../services/presets';

// Un buffer de ruido compartido por AudioContext
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer {
    let buffer = noiseCache.get(ctx);
    if (!buffer) {
        buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
        noiseCache.set(ctx, buffer);
    }
    return buffer;
}

// El instrumento depende del pitch class de la nota, asi el kit se repite en cada octava
export const DRUM_NAMES = ['Kick', 'Rim', 'Snare', 'Clap', 'Snare 2', 'Tom L', 'Hat', 'Tom M', 'Hat soft', 'Tom H', 'Hat open', 'Cowbell'];

/** Un golpe de percusion sintetizado. Misma interfaz que Voice (release/setBend no hacen nada). */
export class DrumVoice {
    public onEnded: () => void;
    private nodes: Array<AudioNode> = [];

    constructor(private ctx: AudioContext, destination: AudioNode, patch: Patch, midi: number, velocity: number, when?: number) {
        const t = when !== undefined ? when : ctx.currentTime;
        const is808 = patch.drumStyle == '808';
        const out = ctx.createGain();
        out.gain.value = 0.3 + 0.7 * velocity;
        out.connect(destination);
        this.nodes.push(out);

        // Tono con caida de frecuencia y de volumen (bombos, toms, cuerpo de la caja)
        const tone = (type: OscillatorType, f0: number, f1: number, fall: number, dur: number, peak: number, at = 0) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f0, t + at);
            osc.frequency.exponentialRampToValueAtTime(f1, t + at + fall);
            g.gain.setValueAtTime(peak, t + at);
            g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
            osc.connect(g);
            g.connect(out);
            osc.start(t + at);
            osc.stop(t + at + dur + 0.02);
            this.nodes.push(osc, g);
        };
        // Golpe de ruido filtrado (platillos, caja, palmas)
        const hit = (type: BiquadFilterType, freq: number, q: number, dur: number, peak: number, at = 0) => {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuffer(ctx);
            src.loop = true;
            const filter = ctx.createBiquadFilter();
            filter.type = type;
            filter.frequency.value = freq;
            filter.Q.value = q;
            const g = ctx.createGain();
            g.gain.setValueAtTime(peak, t + at);
            g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
            src.connect(filter);
            filter.connect(g);
            g.connect(out);
            src.start(t + at);
            src.stop(t + at + dur + 0.02);
            this.nodes.push(src, filter, g);
        };

        let length: number;
        switch (((midi % 12) + 12) % 12) {
            case 0: // kick
                length = is808 ? 1 : 0.4;
                tone('sine', is808 ? 120 : 170, is808 ? 42 : 45, is808 ? 0.25 : 0.1, length, 1);
                break;
            case 1: // rim
                length = 0.08;
                tone('triangle', 1700, 1300, 0.03, 0.05, 0.6);
                hit('highpass', 3000, 0.7, 0.04, 0.4);
                break;
            case 2: // snare
                length = is808 ? 0.3 : 0.25;
                hit('highpass', is808 ? 1800 : 1200, 0.7, is808 ? 0.25 : 0.2, 0.8);
                tone('triangle', is808 ? 190 : 220, 140, 0.1, is808 ? 0.2 : 0.12, 0.5);
                break;
            case 3: // clap: varios golpes seguidos + cola
                length = 0.3;
                [0, 0.012, 0.024].forEach(at => hit('bandpass', 1100, 1.2, 0.015, 0.7, at));
                hit('bandpass', 1100, 1.2, 0.18, 0.6, 0.036);
                break;
            case 4: // snare 2
                length = 0.2;
                hit('highpass', 2500, 0.7, 0.14, 0.7);
                tone('triangle', 330, 220, 0.06, 0.1, 0.5);
                break;
            case 5: case 7: case 9: { // toms
                const f = [100, 0, 150, 0, 210][(midi % 12 - 5) / 2];
                length = is808 ? 0.6 : 0.4;
                tone('sine', f, f * 0.55, 0.15, length, 0.9);
                break;
            }
            case 6: // hat cerrado
                length = 0.08;
                hit('highpass', 7500, 0.7, 0.05, 0.5);
                break;
            case 8: // hat suave
                length = 0.12;
                hit('highpass', 7000, 0.7, 0.08, 0.3);
                break;
            case 10: // hat abierto
                length = 0.45;
                hit('highpass', 7000, 0.7, 0.4, 0.45);
                break;
            default: // cowbell
                length = 0.35;
                tone('square', 560, 560, 0.01, 0.3, 0.25);
                tone('square', 845, 845, 0.01, 0.3, 0.25);
        }
        setTimeout(() => this.dispose(), (t - ctx.currentTime + length) * 1000 + 100);
    }

    release(fast = false, when?: number) {}
    setBend(cents: number) {}

    private dispose() {
        this.nodes.forEach(n => n.disconnect());
        if (this.onEnded)
            this.onEnded();
    }
}
