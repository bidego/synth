// Acid Line: el motor de audio del plugin (acidline/engine/ac_engine.cpp) traducido a JavaScript para correr en un AudioWorklet.
// Mismo diseno y mismas cuentas, muestra a muestra: un oscilador (sierra o cuadrada con PolyBLEP), filtro de escalera de 3 polos
// (18 dB/oct) con resonancia, barrido de decaimiento, acento, slide y overdrive; sobremuestreo x4 con dos FIR de media banda.
// Se puede probar en Node (module.exports) contra el motor en C++: acidline/tests/compare_js.js.
'use strict';
(function () {

    // --- BEGIN GENERATED PARAMS (acidline/scripts/gen_web.py: no editar a mano) ---
    var PARAM_IDS = ['waveform', 'tune', 'cutoff', 'resonance', 'envMod', 'decay', 'accent', 'accentVel', 'slideTime', 'drive', 'volume'];
    var PARAM_CHOICES = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var PARAM_DEFAULTS = [0, 0.5, 0.4, 0.65, 0.6, 0.4, 0.6, 0.75, 0.35, 0, 0.7];
    // --- END GENERATED PARAMS ---

    var P = {};
    PARAM_IDS.forEach(function (id, i) { P[id] = i; });
    var NUM_PARAMS = PARAM_IDS.length;

    var PI = Math.PI;
    var CTRL = 8;
    var OVERSAMPLE = 4;

    function polyBlep(t, dt) {
        if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
        if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
        return 0;
    }

    function coefFor(seconds, sr) {
        return 1.0 - Math.exp(-1.0 / (Math.max(seconds, 1e-5) * sr));
    }

    // --- Escalera de 4 polos con saturacion en cada etapa; sale el 3er polo (18 dB/oct), realimenta el 4to ---
    function Ladder3() { this.z = [0, 0, 0, 0]; this.G = 0; }
    Ladder3.prototype.reset = function () { this.z[0] = this.z[1] = this.z[2] = this.z[3] = 0; };
    Ladder3.prototype.setCutoff = function (fc, fs) {
        var g = Math.tan(PI * Math.min(fc, 0.45 * fs) / fs);
        this.G = g / (1.0 + g);
    };
    Ladder3.prototype.process = function (x, k) {
        var G = this.G, G2 = G * G, G4 = G2 * G2, a = 1 - G, z = this.z;
        var S = a * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
        var inp = (x - k * S) / (1 + k * G4);
        var y3 = 0;
        for (var i = 0; i < 4; ++i) {
            var v = G * (Math.tanh(inp) - z[i]);
            var y = v + z[i];
            z[i] = y + v;
            inp = y;
            if (i === 2) y3 = y;
        }
        return y3;
    };

    // --- Decimador por 2: sinc de media banda con ventana de Kaiser (beta 9), fase lineal ---
    function bessel(x) {
        var sum = 1.0, term = 1.0;
        for (var k = 1; k < 40; ++k) { term *= (x / (2.0 * k)) * (x / (2.0 * k)); sum += term; }
        return sum;
    }
    function Decimator2(taps) {
        var n = taps | 1;
        this.n = n;
        this.h = new Float64Array(n);
        this.buf = new Float64Array(n);
        this.pos = 0;
        var beta = 9.0, c = (n - 1) * 0.5, total = 0;
        for (var i = 0; i < n; ++i) {
            var x = i - c;
            var sinc = Math.abs(x) < 1e-9 ? 0.5 : Math.sin(PI * 0.5 * x) / (PI * x);
            var r = x / c;
            var w = bessel(beta * Math.sqrt(Math.max(0.0, 1.0 - r * r))) / bessel(beta);
            this.h[i] = sinc * w;
            total += sinc * w;
        }
        for (i = 0; i < n; ++i) this.h[i] /= total;
        var idx = [];
        for (i = 0; i < n; ++i) if (Math.abs(this.h[i]) > 1e-12) idx.push(i);
        this.taps = Int32Array.from(idx);
    }
    Decimator2.prototype.reset = function () { this.buf.fill(0); this.pos = 0; };
    Decimator2.prototype.process = function (a, b) {
        var n = this.n, buf = this.buf, h = this.h, taps = this.taps;
        buf[this.pos] = a; this.pos = (this.pos + 1) % n;
        buf[this.pos] = b; this.pos = (this.pos + 1) % n;
        var acc = 0, pos = this.pos;
        for (var t = 0; t < taps.length; ++t) {
            var i = taps[t];
            var idx = pos + i;
            if (idx >= n) idx -= n;
            acc += h[i] * buf[idx];
        }
        return acc;
    };

    // --- Motor ---
    function Engine() {
        this.p = new Float64Array(NUM_PARAMS);
        this.dec1 = new Decimator2(31);
        this.dec2 = new Decimator2(63);
        this.held = new Int32Array(32);
        this.heldCount = 0;
        this.gate = false; this.played = false; this.sliding = false;
        this.note = 48; this.targetNote = 48;
        this.accentTarget = 0; this.accent = 0;
        this.bend = 0; this.phase = 0;
        this.drift = 0; this.driftTarget = 0; this.driftAmount = 2.0; this.driftCount = 0;
        this.rng = 987654;
        this.filtEnv = 0; this.ampEnv = 0;
        this.decayCoef = 0; this.attackCoef = 0; this.releaseCoef = 0;
        this.ladder = new Ladder3();
        this.resK = 0; this.cutoffBase = 0; this.ctrlCount = 0;
        this.outGain = 0; this.dcX = 0; this.dcY = 0;
        this.stage = new Float64Array(OVERSAMPLE);
        this.freq = 110;
        this.sr = 44100; this.osr = 176400;
    }

    Engine.prototype.prepare = function (sampleRate) {
        this.sr = sampleRate;
        this.osr = sampleRate * OVERSAMPLE;
        for (var i = 0; i < NUM_PARAMS; i++) this.p[i] = PARAM_DEFAULTS[i];
        this.reset();
        this.attackCoef = coefFor(0.0015 / 3.0, this.osr);
        this.releaseCoef = coefFor(0.012 / 3.0, this.osr);
        this.controlUpdate();
        this.outGain = this.p[P.volume];
    };

    Engine.prototype.reset = function () {
        this.heldCount = 0;
        this.gate = false; this.played = false; this.sliding = false;
        this.note = this.targetNote = 48;
        this.accent = this.accentTarget = 0;
        this.bend = 0;
        this.filtEnv = this.ampEnv = 0;
        this.ladder.reset();
        this.dec1.reset(); this.dec2.reset();
        this.dcX = this.dcY = 0;
        this.drift = this.driftTarget = 0;
        this.ctrlCount = 0;
    };

    Engine.prototype.setParam = function (id, value) {
        if (!(id >= 0 && id < NUM_PARAMS) || value !== value) return;
        var ch = PARAM_CHOICES[id];
        if (ch) this.p[id] = Math.round(Math.min(ch - 1, Math.max(0, value)));
        else this.p[id] = Math.min(1, Math.max(0, value));
    };

    // --- Notas: una nota que empieza con otra todavia apretada es un slide ---
    Engine.prototype.noteOn = function (note, velocity) {
        var w = 0, held = this.held;
        for (var i = 0; i < this.heldCount; ++i) if (held[i] !== note) held[w++] = held[i];
        this.heldCount = w;
        if (this.heldCount < 32) held[this.heldCount++] = note;
        this.targetNote = note;
        if (!this.played) { this.played = true; this.note = this.targetNote; }
        this.accentTarget = velocity >= this.p[P.accentVel] ? 1 : 0;
        if (!this.gate) {
            this.gate = true;
            this.sliding = false;
            this.note = this.targetNote;
            this.filtEnv = 1;
        } else {
            this.sliding = true;
        }
    };

    Engine.prototype.noteOff = function (note) {
        var w = 0, held = this.held;
        for (var i = 0; i < this.heldCount; ++i) if (held[i] !== note) held[w++] = held[i];
        this.heldCount = w;
        if (this.heldCount > 0) {
            this.targetNote = held[this.heldCount - 1];
            this.sliding = true;
        } else {
            this.gate = false;
        }
    };

    Engine.prototype.allNotesOff = function () { this.heldCount = 0; this.gate = false; };
    Engine.prototype.setBend = function (norm) { this.bend = norm < -1 ? -1 : norm > 1 ? 1 : norm; };
    Engine.prototype.setDriftAmount = function (cents) { this.driftAmount = cents; };

    Engine.prototype.controlUpdate = function () {
        var p = this.p, ctrlDt = CTRL / this.osr;
        if (this.sliding) {
            var tc = 0.006 + p[P.slideTime] * 0.09;
            this.note += (this.targetNote - this.note) * (1.0 - Math.exp(-ctrlDt / tc));
            if (Math.abs(this.targetNote - this.note) < 0.001) { this.note = this.targetNote; this.sliding = false; }
        } else {
            this.note = this.targetNote;
        }
        if (++this.driftCount >= 400) {
            this.driftCount = 0;
            var r = this.rng;
            r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
            this.rng = r >>> 0;
            this.driftTarget = (this.rng * (1 / 4294967296) - 0.5) * this.driftAmount;
        }
        this.drift += (this.driftTarget - this.drift) * 0.003;
        this.accent += (this.accentTarget - this.accent) * 0.01;

        var userDecay = 0.2 * Math.pow(12.5, p[P.decay]);
        var decay = userDecay + (0.2 - userDecay) * this.accent * p[P.accent];
        this.decayCoef = coefFor(decay / 3.0, this.osr);

        this.freq = 440.0 * Math.pow(2.0, (this.note - 69.0 + (p[P.tune] - 0.5) * 2.0 + this.bend * 2.0 + this.drift / 100.0) / 12.0);
        this.cutoffBase = Math.log2(40.0) * 1200.0 + p[P.cutoff] * 8.0 * 1200.0;
        this.resK = p[P.resonance] * 3.7 + this.accent * p[P.accent] * 0.25;
        this.outGain += (p[P.volume] - this.outGain) * 0.02;
    };

    Engine.prototype.processOne = function () {
        var p = this.p;
        if (this.ctrlCount === 0) this.controlUpdate();
        if (++this.ctrlCount >= CTRL) this.ctrlCount = 0;

        var dt = Math.min(0.45, this.freq / this.osr);
        this.phase += dt;
        this.phase -= Math.floor(this.phase);
        var ph = this.phase, osc;
        if (p[P.waveform] < 1) {
            osc = (2.0 * ph - 1.0) - polyBlep(ph, dt);
        } else {
            var v = ph < 0.5 ? 1 : -1;
            v += polyBlep(ph, dt);
            var q = ph + 0.5; q -= Math.floor(q);
            v -= polyBlep(q, dt);
            osc = v;
        }

        this.filtEnv -= this.filtEnv * this.decayCoef;
        var target = this.gate ? 1 : 0;
        this.ampEnv += (target - this.ampEnv) * (this.gate ? this.attackCoef : this.releaseCoef);

        if ((this.ctrlCount & 3) === 0) {
            var depth = p[P.envMod] * (1 + this.accent * p[P.accent] * 0.9);
            var cents = this.cutoffBase + this.filtEnv * depth * 6000.0;
            this.ladder.setCutoff(Math.min(20000.0, Math.pow(2.0, cents / 1200.0)), this.osr);
        }
        var y = this.ladder.process(osc * 0.6, this.resK);
        y *= 1 + 0.4 * this.resK;

        var acc = 1 + this.accent * p[P.accent] * 0.8;
        y *= this.ampEnv * acc;

        if (p[P.drive] > 0.001) {
            var d = 1 + p[P.drive] * 8.0;
            y = Math.tanh(y * d) / Math.sqrt(d);
        }
        return y * this.outGain * 0.7;
    };

    Engine.prototype.process = function (left, right, n) {
        var st = this.stage;
        for (var i = 0; i < n; ++i) {
            for (var k = 0; k < OVERSAMPLE; ++k) st[k] = this.processOne();
            var a = this.dec1.process(st[0], st[1]);
            var b = this.dec1.process(st[2], st[3]);
            var s = this.dec2.process(a, b);
            var x = s;
            s = x - this.dcX + 0.9995 * this.dcY;
            this.dcX = x; this.dcY = s;
            var m = Math.abs(s);
            if (m > 0.85) s = (s < 0 ? -1 : 1) * (0.85 + 0.15 * Math.tanh((m - 0.85) / 0.15));
            left[i] = right[i] = s;
        }
    };

    var api = { Engine: Engine, P: P, PARAM_IDS: PARAM_IDS, PARAM_CHOICES: PARAM_CHOICES, PARAM_DEFAULTS: PARAM_DEFAULTS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // --- El procesador del AudioWorklet (el mismo protocolo de mensajes que el Model D) ---
    if (typeof registerProcessor !== 'undefined' && typeof AudioWorkletProcessor !== 'undefined') {
        class AcidProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.engine = new Engine();
                this.engine.prepare(sampleRate);
                this.events = [];
                this.port.onmessage = (e) => this.onMessage(e.data);
            }

            onMessage(m) {
                var eng = this.engine;
                switch (m.type) {
                    case 'param': eng.setParam(m.id, m.value); break;
                    case 'params': for (var i = 0; i < m.values.length; ++i) eng.setParam(i, m.values[i]); break;
                    case 'bend': eng.setBend(m.value); break;
                    case 'allOff': this.events.length = 0; eng.allNotesOff(); break;
                    case 'on': case 'off': {
                        var ev = { t: m.t || 0, kind: m.type, a: m.note, b: m.vel };
                        var j = this.events.length;
                        while (j > 0 && this.events[j - 1].t > ev.t) --j;
                        this.events.splice(j, 0, ev);
                        break;
                    }
                }
            }

            apply(ev) {
                if (ev.kind === 'on') this.engine.noteOn(ev.a, ev.b === undefined ? 1 : ev.b);
                else this.engine.noteOff(ev.a);
            }

            process(inputs, outputs) {
                var out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, pos = 0;
                var start = currentTime, ev = this.events;
                while (ev.length) {
                    var off = ev[0].t <= 0 ? 0 : Math.round((ev[0].t - start) * sampleRate);
                    if (off >= n) break;
                    var at = Math.max(pos, off);
                    if (at > pos) { this.engine.process(L.subarray(pos, at), R.subarray(pos, at), at - pos); pos = at; }
                    this.apply(ev.shift());
                }
                if (n > pos) this.engine.process(L.subarray(pos, n), R.subarray(pos, n), n - pos);
                return true;
            }
        }
        registerProcessor('acid-processor', AcidProcessor);
    }
})();
