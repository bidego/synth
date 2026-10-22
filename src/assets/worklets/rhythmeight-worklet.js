// Rhythm Eight: el motor de audio del plugin (rhythmeight/engine/re_engine.cpp) traducido a JavaScript para correr en un AudioWorklet.
// Mismo diseno y mismas cuentas, muestra a muestra: 13 voces analogicas (bombo, caja, toms, rim, claves, palmas, maracas, cowbell, platillo y
// hi-hats) y un secuenciador de 16 pasos con acento, shuffle y tempo propio o del anfitrion.
// Se puede probar en Node (module.exports) contra el motor en C++: rhythmeight/tests/compare_js.js.
'use strict';
(function () {

    // --- BEGIN GENERATED PARAMS (rhythmeight/scripts/gen_web.py: no editar a mano) ---
    var PARAM_IDS = ['bdLevel', 'bdTune', 'bdDecay', 'bdTone', 'sdLevel', 'sdTune', 'sdTone', 'sdSnappy', 'ltLevel', 'ltTune', 'ltDecay', 'mtLevel', 'mtTune', 'mtDecay', 'htLevel', 'htTune', 'htDecay', 'rsLevel', 'clLevel', 'cpLevel', 'maLevel', 'cbLevel', 'cbTune', 'cyLevel', 'cyTone', 'cyDecay', 'ohLevel', 'ohDecay', 'chLevel', 'accent', 'shuffle', 'tempo', 'steps', 'sync', 'run', 'volume'];
    var PARAM_CHOICES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 2, 2, 0];
    var PARAM_DEFAULTS = [0.75, 0.5, 0.5, 0.4, 0.75, 0.5, 0.5, 0.5, 0.75, 0.5, 0.5, 0.75, 0.5, 0.5, 0.75, 0.5, 0.5, 0.7, 0.7, 0.75, 0.7, 0.7, 0.5, 0.7, 0.5, 0.5, 0.7, 0.4, 0.7, 0.6, 0, 0.4, 0, 0, 0, 0.7];
    // --- END GENERATED PARAMS ---

    var P = {};
    PARAM_IDS.forEach(function (id, i) { P[id] = i; });
    var NUM_PARAMS = PARAM_IDS.length;

    var PI = Math.PI;
    var TWO_PI = 2 * PI;
    var K_INST = 13, K_STEPS = 16;
    var BD = 0, SD = 1, LT = 2, MT = 3, HT = 4, RS = 5, CL = 6, CP = 7, MA = 8, CB = 9, CY = 10, OH = 11, CH = 12;
    var INST_CODES = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cl', 'cp', 'ma', 'cb', 'cy', 'oh', 'ch'];
    var INST_NOTES = [36, 38, 41, 45, 48, 37, 75, 39, 70, 56, 49, 46, 42];
    var METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
    var PAN = [0.0, 0.05, -0.3, 0.0, 0.3, 0.15, -0.15, 0.1, -0.2, 0.2, 0.35, -0.25, 0.25];
    var LEVEL_IDS = ['bdLevel', 'sdLevel', 'ltLevel', 'mtLevel', 'htLevel', 'rsLevel', 'clLevel', 'cpLevel', 'maLevel', 'cbLevel', 'cyLevel', 'ohLevel', 'chLevel'];
    var TOM_BASE = [82.0, 123.0, 164.0];
    var TOM_LONG = [1.2, 1.0, 0.85];
    var STEP_LENGTHS = [16, 12, 8, 4];
    var SILENCE = 1e-4;

    function noteToInst(note) {
        switch (note) {
            case 35: case 36: return BD;
            case 38: case 40: return SD;
            case 41: case 43: return LT;
            case 45: case 47: return MT;
            case 48: case 50: return HT;
            case 37: return RS;
            case 75: return CL;
            case 39: return CP;
            case 70: case 69: return MA;
            case 56: return CB;
            case 49: case 51: case 52: case 55: case 57: case 59: return CY;
            case 46: return OH;
            case 42: case 44: return CH;
            default: return -1;
        }
    }

    function fastTanh(x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        var x2 = x * x;
        return x * (27 + x2) / (27 + 9 * x2);
    }

    function polyBlep(t, dt) {
        if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
        if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
        return 0;
    }

    function decayCoef(seconds, sr) { return Math.exp(-1.0 / (seconds * sr)); }

    /** Cuadrada sin aliasing (PolyBLEP): avanza la fase guardada en obj[key]. */
    function square(obj, key, freq, sr) {
        var dt = freq / sr;
        var ph = obj[key] + dt;
        ph -= Math.floor(ph);
        obj[key] = ph;
        var s = ph < 0.5 ? 1.0 : -1.0;
        s += polyBlep(ph, dt);
        var p2 = ph + 0.5;
        p2 -= Math.floor(p2);
        s -= polyBlep(p2, dt);
        return s;
    }

    function Biquad() { this.b0 = 0; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
    Biquad.prototype.bandpass = function (f, q, sr) {
        var w = TWO_PI * f / sr, al = Math.sin(w) / (2.0 * q), a0 = 1.0 + al;
        this.b0 = al / a0; this.b1 = 0.0; this.b2 = -al / a0; this.a1 = -2.0 * Math.cos(w) / a0; this.a2 = (1.0 - al) / a0;
    };
    Biquad.prototype.highpass = function (f, q, sr) {
        var w = TWO_PI * f / sr, al = Math.sin(w) / (2.0 * q), a0 = 1.0 + al, c = Math.cos(w);
        this.b0 = (1.0 + c) / 2.0 / a0; this.b1 = -(1.0 + c) / a0; this.b2 = (1.0 + c) / 2.0 / a0; this.a1 = -2.0 * c / a0; this.a2 = (1.0 - al) / a0;
    };
    Biquad.prototype.reset = function () { this.z1 = 0; this.z2 = 0; };
    Biquad.prototype.process = function (x) {
        var y = this.b0 * x + this.z1;
        this.z1 = this.b1 * x - this.a1 * y + this.z2;
        this.z2 = this.b2 * x - this.a2 * y;
        return y;
    };

    function Noise(seed) { this.s = seed >>> 0; }
    Noise.prototype.next = function () {
        var s = this.s;
        s = (s ^ (s << 13)) >>> 0;
        s = (s ^ (s >>> 17)) >>> 0;
        s = (s ^ (s << 5)) >>> 0;
        this.s = s;
        return s / 2147483648.0 - 1.0;
    };

    function Voice(rng) {
        this.active = false;
        this.vel = 1.0;
        this.n = 0.0;
        this.ph = [0, 0, 0];
        this.f = [0, 0, 0];
        this.e = [0, 0, 0, 0];
        this.c = [0, 0, 0, 0];
        this.g = [0, 0, 0, 0];
        this.q1 = new Biquad();
        this.q2 = new Biquad();
        this.rng = rng;
    }

    function Engine() {
        this.sr = 44100;
        this.p = new Float32Array(NUM_PARAMS);
        this.v = [];
        this.steps = [];
        this.gainL = [];
        this.gainR = [];
        for (var i = 0; i < K_INST; ++i) {
            var th = (PAN[i] + 1.0) * PI / 4.0;
            this.gainL.push(Math.sqrt(2.0) * Math.cos(th));
            this.gainR.push(Math.sqrt(2.0) * Math.sin(th));
            this.steps.push(new Uint8Array(K_STEPS));
        }
        for (var j = 0; j < NUM_PARAMS; ++j) this.p[j] = PARAM_DEFAULTS[j];
        this.hostPlaying = false;
        this.hostPpq = 0;
        this.hostBpm = 120;
        this.reset();
    }

    Engine.prototype.prepare = function (sampleRate) {
        this.sr = sampleRate;
        this.reset();
    };

    Engine.prototype.reset = function () {
        this.v = [];
        for (var i = 0; i < K_INST; ++i) this.v.push(new Voice(new Noise((2463534242 ^ Math.imul(0x9E3779B9, i + 1)) >>> 0)));
        this.mph = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        this.metalNow = 0.0;
        this.running = false;
        this.wasRunning = false;
        this.ppq = 0.0;
        this.lastFired = -1;
    };

    Engine.prototype.setParam = function (id, value) {
        if (id < 0 || id >= NUM_PARAMS) return;
        var ch = PARAM_CHOICES[id];
        if (ch > 0) {
            var k = Math.floor(value + 0.5);
            this.p[id] = k < 0 ? 0 : k > ch - 1 ? ch - 1 : k;
        } else {
            this.p[id] = value < 0 ? 0 : value > 1 ? 1 : value;
        }
    };

    /** Igual que Engine::loadPreset de C++: valores de fabrica (menos Run y Sync) + los del sonido + el patron. */
    Engine.prototype.loadPreset = function (preset) {
        for (var i = 0; i < NUM_PARAMS; ++i)
            if (i !== P.run && i !== P.sync) this.setParam(i, PARAM_DEFAULTS[i]);
        var values = preset.values || {};
        for (var k in values) if (P[k] !== undefined) this.setParam(P[k], values[k]);
        for (var s = 0; s < K_INST; ++s) this.setPatternString(s, (preset.pattern || {})[INST_CODES[s]] || '');
    };

    Engine.prototype.setStep = function (inst, step, value) {
        if (inst < 0 || inst >= K_INST || step < 0 || step >= K_STEPS) return;
        this.steps[inst][step] = value < 0 ? 0 : value > 2 ? 2 : value;
    };

    Engine.prototype.clearPattern = function () {
        for (var i = 0; i < K_INST; ++i) this.steps[i].fill(0);
    };

    Engine.prototype.setPatternString = function (inst, s) {
        s = s || '';
        for (var i = 0; i < K_STEPS; ++i) {
            var c = i < s.length ? s.charAt(i) : '';
            this.steps[inst][i] = c === 'X' ? 2 : c === 'x' ? 1 : 0;
        }
    };

    Engine.prototype.setTransport = function (playing, ppq, bpm) {
        this.hostPlaying = !!playing;
        this.hostPpq = ppq;
        this.hostBpm = bpm > 1.0 ? bpm : 120.0;
    };

    Engine.prototype.bpm = function () { return this.p[P.sync] >= 1 ? this.hostBpm : 40.0 + 200.0 * this.p[P.tempo]; };
    Engine.prototype.stepLength = function () { return STEP_LENGTHS[this.p[P.steps] | 0]; };
    Engine.prototype.currentStep = function () { return this.running ? this.lastFired : -1; };
    Engine.prototype.level = function (id) { var x = this.p[id]; return x * x * 1.4; };

    Engine.prototype.activeVoices = function () {
        var n = 0;
        for (var i = 0; i < K_INST; ++i) n += this.v[i].active ? 1 : 0;
        return n;
    };

    Engine.prototype.allNotesOff = function () {
        for (var i = 0; i < K_INST; ++i) { this.v[i].active = false; this.v[i].q1.reset(); this.v[i].q2.reset(); }
    };

    Engine.prototype.noteOn = function (note, velocity) {
        var inst = noteToInst(note);
        if (inst >= 0) this.trigger(inst, velocity < 0.2 ? 0.2 : velocity, false);
    };

    Engine.prototype.trigger = function (inst, velocity, accent) {
        if (inst < 0 || inst >= K_INST) return;
        var sr = this.sr, p = this.p;
        var gv = velocity * (accent ? 1.0 + 0.7 * p[P.accent] : 1.0);
        var v = new Voice(this.v[inst].rng);
        this.v[inst] = v;
        v.active = true;
        v.vel = gv;
        switch (inst) {
            case BD: {
                var d = p[P.bdDecay], tone = p[P.bdTone];
                v.f[0] = 38.0 * Math.pow(2.0, 1.2 * p[P.bdTune]);
                v.e[0] = 1.0; v.c[0] = decayCoef(0.08 + 0.9 * d * d, sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.018, sr);
                v.e[2] = 1.0; v.c[2] = decayCoef(0.004, sr);
                v.g[0] = 0.5 * tone;
                break;
            }
            case SD: {
                var k = Math.pow(2.0, (p[P.sdTune] - 0.5) * 0.8), stone = p[P.sdTone], sn = p[P.sdSnappy];
                v.f[0] = 180.0 * k; v.f[1] = 330.0 * k;
                v.e[0] = 1.0; v.c[0] = decayCoef(0.075, sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.045, sr);
                v.e[2] = 1.0; v.c[2] = decayCoef(0.012, sr);
                v.e[3] = 1.0; v.c[3] = decayCoef(0.09 + 0.12 * sn, sr);
                v.g[0] = 0.12 + 1.0 * sn;
                v.g[1] = 0.35 + 0.65 * stone;
                v.q1.highpass(1500.0 + 2500.0 * stone, 0.7, sr);
                break;
            }
            case LT: case MT: case HT: {
                var t = inst - LT;
                var tune = t === 0 ? p[P.ltTune] : t === 1 ? p[P.mtTune] : p[P.htTune];
                var dec = t === 0 ? p[P.ltDecay] : t === 1 ? p[P.mtDecay] : p[P.htDecay];
                v.f[0] = TOM_BASE[t] * Math.pow(2.0, tune - 0.5);
                v.e[0] = 1.0; v.c[0] = decayCoef((0.05 + 0.3 * dec) * TOM_LONG[t], sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.04, sr);
                v.e[2] = 1.0; v.c[2] = decayCoef(0.003, sr);
                break;
            }
            case RS:
                v.f[0] = 480.0; v.f[1] = 1700.0;
                v.e[0] = 1.0; v.c[0] = decayCoef(0.009, sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.0025, sr);
                v.q1.highpass(2500.0, 0.7, sr);
                break;
            case CL:
                v.f[0] = 2500.0; v.f[1] = 3250.0;
                v.e[0] = 1.0; v.c[0] = decayCoef(0.014, sr);
                break;
            case CP:
                v.q1.bandpass(1100.0, 1.1, sr);
                break;
            case MA:
                v.q1.bandpass(6500.0, 0.8, sr);
                break;
            case CB: {
                var kc = Math.pow(2.0, (p[P.cbTune] - 0.5) * 0.5);
                v.f[0] = 540.0 * kc; v.f[1] = 800.0 * kc;
                v.e[0] = 1.0; v.c[0] = decayCoef(0.012, sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.08, sr);
                v.q1.bandpass(1800.0, 0.8, sr);
                break;
            }
            case CY:
                v.e[0] = 1.0; v.c[0] = decayCoef(0.03, sr);
                v.e[1] = 1.0; v.c[1] = decayCoef(0.25 + 1.1 * p[P.cyDecay], sr);
                v.g[0] = p[P.cyTone];
                v.q1.bandpass(3500.0, 0.7, sr);
                v.q2.highpass(7000.0, 0.7, sr);
                break;
            case OH:
                v.e[0] = 1.0; v.c[0] = decayCoef(0.07 + 0.45 * p[P.ohDecay], sr);
                v.q1.bandpass(8000.0, 1.0, sr);
                v.q2.highpass(6500.0, 0.7, sr);
                break;
            case CH:
                v.e[0] = 1.0; v.c[0] = decayCoef(0.04, sr);
                v.q1.bandpass(8000.0, 1.0, sr);
                v.q2.highpass(6500.0, 0.7, sr);
                // El hi-hat cerrado corta al abierto
                if (this.v[OH].active) this.v[OH].c[0] = decayCoef(0.006, sr);
                break;
        }
    };

    /** Banco metalico: seis cuadradas sumadas (una vez por muestra; lo comparten platillo y hi-hats). */
    Engine.prototype.metal = function () {
        var s = 0.0;
        for (var i = 0; i < 6; ++i) s += square(this.mph, i, METAL[i], this.sr);
        return s * 0.5;
    };

    Engine.prototype.renderVoice = function (inst) {
        var v = this.v[inst], sr = this.sr, out = 0.0, e = v.e, c = v.c, ph = v.ph;
        switch (inst) {
            case BD: {
                var f = v.f[0] * (1.0 + 2.2 * e[1]);
                ph[0] += f / sr; ph[0] -= Math.floor(ph[0]);
                out = fastTanh(1.6 * Math.sin(TWO_PI * ph[0]) * e[0]) * 0.85 + v.rng.next() * e[2] * v.g[0];
                e[0] *= c[0]; e[1] *= c[1]; e[2] *= c[2];
                if (e[0] < SILENCE) v.active = false;
                break;
            }
            case SD: {
                var pe = 1.0 + 0.35 * e[2];
                ph[0] += v.f[0] * pe / sr; ph[0] -= Math.floor(ph[0]);
                ph[1] += v.f[1] * pe / sr; ph[1] -= Math.floor(ph[1]);
                var s1 = Math.sin(TWO_PI * ph[0]) * e[0];
                var s2 = Math.sin(TWO_PI * ph[1]) * e[1] * v.g[1];
                var nz = v.q1.process(v.rng.next()) * e[3] * v.g[0];
                out = fastTanh(1.2 * (0.7 * s1 + 0.7 * s2 + 0.55 * nz));
                e[0] *= c[0]; e[1] *= c[1]; e[2] *= c[2]; e[3] *= c[3];
                if (e[0] < SILENCE && e[3] < SILENCE) v.active = false;
                break;
            }
            case LT: case MT: case HT: {
                var ft = v.f[0] * (1.0 + 0.45 * e[1]);
                ph[0] += ft / sr; ph[0] -= Math.floor(ph[0]);
                out = fastTanh(1.2 * Math.sin(TWO_PI * ph[0]) * e[0]) * 0.85 + v.rng.next() * e[2] * 0.08;
                e[0] *= c[0]; e[1] *= c[1]; e[2] *= c[2];
                if (e[0] < SILENCE) v.active = false;
                break;
            }
            case RS: {
                ph[0] += v.f[0] / sr; ph[0] -= Math.floor(ph[0]);
                ph[1] += v.f[1] / sr; ph[1] -= Math.floor(ph[1]);
                var sr1 = (Math.sin(TWO_PI * ph[0]) + 0.8 * Math.sin(TWO_PI * ph[1])) * e[0] * 0.5 + v.q1.process(v.rng.next()) * e[1] * 0.5;
                out = fastTanh(1.5 * sr1);
                e[0] *= c[0]; e[1] *= c[1];
                if (e[0] < SILENCE) v.active = false;
                break;
            }
            case CL: {
                ph[0] += v.f[0] / sr; ph[0] -= Math.floor(ph[0]);
                ph[1] += v.f[1] / sr; ph[1] -= Math.floor(ph[1]);
                out = (Math.sin(TWO_PI * ph[0]) + 0.3 * Math.sin(TWO_PI * ph[1])) * e[0] * 0.7;
                e[0] *= c[0];
                if (e[0] < SILENCE) v.active = false;
                break;
            }
            case CP: {
                var t = v.n / sr, env;
                if (t < 0.0315) env = Math.exp(-(t % 0.0105) / 0.0028);
                else env = Math.exp(-(t - 0.0315) / 0.075) * 0.9;
                out = v.q1.process(v.rng.next()) * env * 3.0;
                if (env < SILENCE && t > 0.0315) v.active = false;
                break;
            }
            case MA: {
                var tm = v.n / sr;
                var envm = tm < 0.001 ? tm / 0.001 : Math.exp(-(tm - 0.001) / 0.02);
                out = v.q1.process(v.rng.next()) * envm * 2.5;
                if (tm > 0.001 && envm < SILENCE) v.active = false;
                break;
            }
            case CB: {
                var sq = (square(ph, 0, v.f[0], sr) + square(ph, 1, v.f[1], sr)) * 0.5;
                out = v.q1.process(sq) * (0.4 * e[0] + 0.6 * e[1]) * 1.6;
                e[0] *= c[0]; e[1] *= c[1];
                if (e[1] < SILENCE) v.active = false;
                break;
            }
            case CY: {
                var lo = v.q1.process(this.metalNow), hi = v.q2.process(this.metalNow);
                out = (lo * (1.0 - v.g[0]) * 0.9 + hi * v.g[0] * 1.1) * (0.3 * e[0] + 0.7 * e[1]);
                e[0] *= c[0]; e[1] *= c[1];
                if (e[1] < 3e-4) v.active = false;
                break;
            }
            case OH: case CH: {
                var y = v.q2.process(v.q1.process(this.metalNow));
                out = y * e[0] * 1.4;
                e[0] *= c[0];
                if (e[0] < SILENCE) v.active = false;
                break;
            }
        }
        v.n += 1.0;
        return out * v.vel;
    };

    Engine.prototype.sequencerTick = function (pos) {
        var len = this.stepLength();
        var loop = len * 0.25;
        var pb = pos % loop;
        if (pb < 0.0) pb += loop;
        var i0 = Math.floor(pb / 0.25);
        if (i0 >= len) i0 = len - 1;
        var cur = i0;
        if ((i0 & 1) && pb < i0 * 0.25 + this.p[P.shuffle] * 0.125) cur = i0 - 1;
        if (cur === this.lastFired) return;
        this.lastFired = cur;
        for (var i = 0; i < K_INST; ++i) {
            var s = this.steps[i][cur];
            if (s) this.trigger(i, 0.8 + (s === 2 ? 0.2 : 0.0), s === 2);
        }
    };

    Engine.prototype.process = function (left, right, n) {
        var p = this.p;
        var host = p[P.sync] >= 1;
        this.running = host ? this.hostPlaying : p[P.run] >= 1;
        if (this.running && !this.wasRunning) {
            this.lastFired = -1;
            if (!host) this.ppq = 0.0;
        }
        if (!this.running && this.wasRunning) this.lastFired = -1;
        this.wasRunning = this.running;
        var bps = this.bpm() / (60.0 * this.sr);

        var lv = [];
        for (var i = 0; i < K_INST; ++i) lv.push(this.level(P[LEVEL_IDS[i]]));
        var vol = p[P.volume] * p[P.volume] * 2.0;
        var v = this.v;

        for (var j = 0; j < n; ++j) {
            if (this.running) {
                this.sequencerTick(host ? this.hostPpq + j * bps : this.ppq);
                if (!host) this.ppq += bps;
            }
            v = this.v;
            if (v[CY].active || v[OH].active || v[CH].active) this.metalNow = this.metal();
            var l = 0.0, r = 0.0;
            for (var k = 0; k < K_INST; ++k) {
                if (!v[k].active) continue;
                var s = this.renderVoice(k) * lv[k];
                l += s * this.gainL[k];
                r += s * this.gainR[k];
            }
            left[j] = fastTanh(l * vol * 0.9);
            right[j] = fastTanh(r * vol * 0.9);
        }
        if (host) this.hostPpq += n * bps;
    };

    var api = {
        Engine: Engine, P: P, PARAM_IDS: PARAM_IDS, PARAM_CHOICES: PARAM_CHOICES, PARAM_DEFAULTS: PARAM_DEFAULTS,
        INST_CODES: INST_CODES, INST_NOTES: INST_NOTES, noteToInst: noteToInst
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // --- AudioWorklet ---
    if (typeof registerProcessor !== 'undefined' && typeof AudioWorkletProcessor !== 'undefined') {
        class RhythmEightProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.engine = new Engine();
                this.engine.prepare(sampleRate);
                for (var i = 0; i < NUM_PARAMS; ++i) this.engine.setParam(i, PARAM_DEFAULTS[i]);
                this.events = [];
                this.lastStep = -2;
                this.port.onmessage = (e) => this.onMessage(e.data);
            }

            onMessage(m) {
                var eng = this.engine;
                switch (m.type) {
                    case 'param': eng.setParam(m.id, m.value); break;
                    case 'params': for (var i = 0; i < m.values.length; ++i) eng.setParam(i, m.values[i]); break;
                    case 'step': eng.setStep(m.inst, m.step, m.value); break;
                    case 'pattern':
                        // rows: un texto de 16 caracteres ('.', 'x', 'X') por instrumento, en el orden de INST_CODES
                        for (var s = 0; s < K_INST; ++s) eng.setPatternString(s, m.rows[s] || '');
                        break;
                    case 'transport': eng.setTransport(m.playing, m.ppq, m.bpm); break;
                    case 'allOff': this.events.length = 0; eng.allNotesOff(); break;
                    case 'on': case 'off': {
                        if (m.type === 'off') break;
                        var ev = { t: m.t || 0, a: m.note, b: m.vel };
                        var j = this.events.length;
                        while (j > 0 && this.events[j - 1].t > ev.t) --j;
                        this.events.splice(j, 0, ev);
                        break;
                    }
                }
            }

            process(inputs, outputs) {
                var out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, pos = 0;
                var start = currentTime, ev = this.events;
                while (ev.length) {
                    var off = ev[0].t <= 0 ? 0 : Math.round((ev[0].t - start) * sampleRate);
                    if (off >= n) break;
                    var at = Math.max(pos, off);
                    if (at > pos) { this.engine.process(L.subarray(pos, at), R.subarray(pos, at), at - pos); pos = at; }
                    var e = ev.shift();
                    this.engine.noteOn(e.a, e.b === undefined ? 1 : e.b);
                }
                if (n > pos) this.engine.process(L.subarray(pos, n), R.subarray(pos, n), n - pos);
                // El paso que suena, para el indicador del panel (solo cuando cambia)
                var step = this.engine.currentStep();
                if (step !== this.lastStep) { this.lastStep = step; this.port.postMessage({ type: 'step', step: step }); }
                return true;
            }
        }
        registerProcessor('rhythmeight-processor', RhythmEightProcessor);
    }
})();
