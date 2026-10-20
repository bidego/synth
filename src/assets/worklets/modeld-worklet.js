// Model D: el motor de audio del plugin (modeld/engine/md_engine.cpp) traducido a JavaScript para correr en un AudioWorklet.
// Es el mismo diseno y las mismas cuentas, sample a sample: 3 osciladores libres (PolyBLEP), mezclador que satura, filtro de escalera
// de 24 dB, contornos analogicos, glide, legato y modulacion; todo sobremuestreado 4 veces y decimado con dos FIR de media banda.
// Se puede probar en Node (module.exports) contra el motor en C++: modeld/tests/compare_js.js.
'use strict';
(function () {

    // --- BEGIN GENERATED PARAMS (modeld/scripts/gen_web.py: no editar a mano) ---
    var PARAM_IDS = ['tune', 'glide', 'glideOn', 'modMix', 'modWheel', 'osc1Range', 'osc1Wave', 'osc2Range', 'osc2Tune', 'osc2Wave', 'osc3Range', 'osc3Tune', 'osc3Wave', 'osc3Kbd', 'osc1On', 'osc2On', 'osc3On', 'noiseOn', 'vol1', 'vol2', 'vol3', 'volNoise', 'noiseType', 'cutoff', 'emphasis', 'contourAmt', 'fAtk', 'fDec', 'fSus', 'lAtk', 'lDec', 'lSus', 'kbd1', 'kbd2', 'decayOn', 'oscMod', 'filtMod', 'volume', 'a440', 'velocity'];
    var PARAM_CHOICES = [0, 0, 2, 0, 0, 6, 6, 6, 0, 6, 6, 0, 6, 2, 2, 2, 2, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 2, 0];
    var PARAM_DEFAULTS = [0.5, 0.3, 0, 0, 0, 3, 2, 3, 0.5, 2, 3, 0.5, 2, 1, 1, 1, 0, 0, 0.8, 0.8, 0, 0, 0, 0.5, 0.25, 0.5, 0, 0.4, 0.3, 0, 0.45, 0.8, 1, 0, 1, 0, 0, 0.7, 0, 0.4];
    // --- END GENERATED PARAMS ---

    var P = {};
    PARAM_IDS.forEach(function (id, i) { P[id] = i; });
    var NUM_PARAMS = PARAM_IDS.length;

    var PI = Math.PI;
    var ATTACK_TARGET = 1.3;
    var CTRL = 8;            // las modulaciones lentas se actualizan cada 8 muestras sobremuestreadas
    var OVERSAMPLE = 4;

    function polyBlep(t, dt) {
        if (t < dt) {
            t /= dt;
            return t + t - t * t - 1.0;
        }
        if (t > 1.0 - dt) {
            t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }
        return 0;
    }

    function coefFor(seconds, sr) {
        return 1.0 - Math.exp(-1.0 / (Math.max(seconds, 1e-5) * sr));
    }

    function attackSeconds(x) { return 0.001 * Math.pow(10000.0, x); }   // 1 ms - 10 s
    function decaySeconds(x) { return 0.002 * Math.pow(5000.0, x); }     // 2 ms - 10 s

    // Triangulo, diente de tiburon, sierra, cuadrada, pulso ancho y pulso angosto
    function pulse(t, dt, duty) {
        var v = t < duty ? 1 : -1;
        v += polyBlep(t, dt);
        var q = t + 1.0 - duty;
        q -= Math.floor(q);
        v -= polyBlep(q, dt);
        return v - (2.0 * duty - 1.0);   // sin continua
    }

    function waveform(type, t, dt) {
        switch (type) {
            case 0: return t < 0.5 ? 4.0 * t - 1.0 : 3.0 - 4.0 * t;
            case 1: return (t < 0.72 ? -1.0 + 2.0 * (t / 0.72) : 1.0 - 2.0 * ((t - 0.72) / 0.28)) * 0.98;
            case 2: return (2.0 * t - 1.0) - polyBlep(t, dt);
            case 3: return pulse(t, dt, 0.5);
            case 4: return pulse(t, dt, 0.33);
            default: return pulse(t, dt, 0.15);
        }
    }

    // --- Filtro de escalera de 4 polos: realimentacion resuelta sin retardo y saturacion suave en cada etapa ---
    function Ladder() {
        this.z = [0, 0, 0, 0];
        this.G = 0;
    }
    Ladder.prototype.reset = function () { this.z[0] = this.z[1] = this.z[2] = this.z[3] = 0; };
    Ladder.prototype.setCutoff = function (fc, fs) {
        var g = Math.tan(PI * Math.min(fc, 0.45 * fs) / fs);
        this.G = g / (1.0 + g);
    };
    Ladder.prototype.process = function (x, k) {
        var G = this.G, G2 = G * G, G4 = G2 * G2, a = 1 - G, z = this.z;
        var S = a * (G2 * G * z[0] + G2 * z[1] + G * z[2] + z[3]);
        var inp = (x - k * S) / (1 + k * G4);
        for (var i = 0; i < 4; ++i) {
            var v = G * (Math.tanh(inp) - z[i]);
            var y = v + z[i];
            z[i] = y + v;
            inp = y;
        }
        return inp;
    };

    // --- Contorno analogico ---
    var IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;
    function Contour() {
        this.stage = IDLE;
        this.level = 0;
    }
    Contour.prototype.gateOn = function () { this.stage = ATTACK; };
    Contour.prototype.gateOff = function () { if (this.stage !== IDLE) this.stage = RELEASE; };
    Contour.prototype.step = function (attackCoef, decayCoef, sustain, releaseCoef) {
        switch (this.stage) {
            case IDLE: return 0;
            case ATTACK:
                this.level += (ATTACK_TARGET - this.level) * attackCoef;
                if (this.level >= 1) { this.level = 1; this.stage = DECAY; }
                break;
            case DECAY:
                this.level += (sustain - this.level) * decayCoef;
                if (Math.abs(this.level - sustain) < 1e-4) { this.level = sustain; this.stage = SUSTAIN; }
                break;
            case SUSTAIN: this.level = sustain; break;
            case RELEASE:
                this.level -= this.level * releaseCoef;
                if (this.level < 1e-4) { this.level = 0; this.stage = IDLE; }
                break;
        }
        return this.level;
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
        // Los coeficientes de posicion par (salvo el central) son ceros exactos en una media banda: se saltean
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
        this.gate = false;
        this.played = false;
        this.note = 60; this.targetNote = 60;
        this.vel = 1; this.bend = 0; this.modExt = 0;
        this.phase = [0.1, 0.4, 0.7];
        this.baseFreq = [110, 110, 110];
        this.osc3Value = 0;
        this.drift = [0, 0, 0]; this.driftTarget = [0, 0, 0];
        this.driftCount = 0; this.driftAmount = 3.0;
        this.gain = [0, 0, 0, 0]; this.gainTarget = [0, 0, 0, 0];
        this.pink = [0, 0, 0];
        this.rng = 1234567;
        this.ladder = new Ladder();
        this.fEnv = new Contour(); this.lEnv = new Contour();
        this.fAtk = 0; this.fDec = 0; this.fRelOn = 0; this.relFast = 0; this.lAtk = 0; this.lDec = 0; this.lRelOn = 0;
        this.resK = 0; this.cutoffCents = 0; this.ctrlCount = 0;
        this.outGain = 0; this.tonePhase = 0; this.dcX = 0; this.dcY = 0;
        this.stage = new Float64Array(OVERSAMPLE);
        this.sr = 44100; this.osr = 176400;
    }

    Engine.prototype.prepare = function (sampleRate) {
        this.sr = sampleRate;
        this.osr = sampleRate * OVERSAMPLE;
        for (var i = 0; i < NUM_PARAMS; i++) this.p[i] = PARAM_DEFAULTS[i];
        this.reset();
        this.updateTimes();
        this.controlUpdate();
        for (i = 0; i < 4; ++i) this.gain[i] = this.gainTarget[i];
        this.outGain = this.p[P.volume];
    };

    Engine.prototype.reset = function () {
        this.heldCount = 0;
        this.gate = false;
        this.played = false;
        this.note = this.targetNote = 60;
        this.bend = this.modExt = 0;
        this.ladder.reset();
        this.fEnv = new Contour(); this.lEnv = new Contour();
        this.dec1.reset(); this.dec2.reset();
        this.dcX = this.dcY = 0;
        this.drift = [0, 0, 0];
        this.ctrlCount = 0;
    };

    Engine.prototype.updateTimes = function () {
        var p = this.p, osr = this.osr, k = Math.log(ATTACK_TARGET / (ATTACK_TARGET - 1.0));
        this.fAtk = coefFor(attackSeconds(p[P.fAtk]) / k, osr);
        this.fDec = coefFor(decaySeconds(p[P.fDec]) / 3.0, osr);
        this.lAtk = coefFor(attackSeconds(p[P.lAtk]) / k, osr);
        this.lDec = coefFor(decaySeconds(p[P.lDec]) / 3.0, osr);
        this.fRelOn = this.fDec;
        this.lRelOn = this.lDec;
        this.relFast = coefFor(0.012 / 3.0, osr);
    };

    Engine.prototype.setParam = function (id, value) {
        if (!(id >= 0 && id < NUM_PARAMS) || value !== value) return;
        var ch = PARAM_CHOICES[id];
        if (ch) this.p[id] = Math.round(Math.min(ch - 1, Math.max(0, value)));
        else this.p[id] = Math.min(1, Math.max(0, value));
        if (id === P.fAtk || id === P.fDec || id === P.lAtk || id === P.lDec) this.updateTimes();
    };

    // --- Notas (monofonico, ultima nota, legato) ---
    Engine.prototype.noteOn = function (note, velocity) {
        var w = 0, held = this.held;
        for (var i = 0; i < this.heldCount; ++i) if (held[i] !== note) held[w++] = held[i];
        this.heldCount = w;
        if (this.heldCount < 32) held[this.heldCount++] = note;
        this.targetNote = note;
        if (!this.played) { this.played = true; this.note = this.targetNote; }
        this.vel = Math.min(1, Math.max(0, velocity));
        if (!this.gate) {
            this.gate = true;
            this.fEnv.gateOn();
            this.lEnv.gateOn();
            if (this.p[P.glideOn] < 1) this.note = this.targetNote;
        }
        if (this.p[P.glideOn] < 1) this.note = this.targetNote;
    };

    Engine.prototype.noteOff = function (note) {
        var w = 0, held = this.held;
        for (var i = 0; i < this.heldCount; ++i) if (held[i] !== note) held[w++] = held[i];
        this.heldCount = w;
        if (this.heldCount > 0) {
            this.targetNote = held[this.heldCount - 1];
            if (this.p[P.glideOn] < 1) this.note = this.targetNote;
        } else if (this.gate) {
            this.gate = false;
            this.fEnv.gateOff();
            this.lEnv.gateOff();
        }
    };

    Engine.prototype.allNotesOff = function () {
        this.heldCount = 0;
        if (this.gate) {
            this.gate = false;
            this.fEnv.gateOff();
            this.lEnv.gateOff();
        }
    };

    Engine.prototype.setBend = function (norm) { this.bend = Math.min(1, Math.max(-1, norm)); };
    Engine.prototype.setModWheelExt = function (norm) { this.modExt = Math.min(1, Math.max(0, norm)); };
    Engine.prototype.setDriftAmount = function (cents) { this.driftAmount = cents; };

    // --- Audio ---
    Engine.prototype.nextRandom = function () {
        var r = this.rng;
        r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
        this.rng = r >>> 0;
        return this.rng;
    };

    Engine.prototype.noise = function (pink) {
        var white = this.nextRandom() * (2 / 4294967296) - 1;
        if (!pink) return white * 0.85;
        var b = this.pink;
        b[0] = 0.99765 * b[0] + white * 0.0990460;
        b[1] = 0.96300 * b[1] + white * 0.2965164;
        b[2] = 0.57000 * b[2] + white * 1.0526913;
        return (b[0] + b[1] + b[2] + white * 0.1848) * 0.32;
    };

    Engine.prototype.controlUpdate = function () {
        var p = this.p, ctrlDt = CTRL / this.osr, i;

        // Glide exponencial
        if (p[P.glideOn] >= 1) {
            var tc = 0.004 + p[P.glide] * p[P.glide] * 2.5;
            this.note += (this.targetNote - this.note) * (1.0 - Math.exp(-ctrlDt / tc));
        } else {
            this.note = this.targetNote;
        }

        // Deriva lenta de la afinacion
        if (++this.driftCount >= 400) {
            this.driftCount = 0;
            for (i = 0; i < 3; ++i) this.driftTarget[i] = (this.nextRandom() * (1 / 4294967296) - 0.5) * this.driftAmount;
        }
        for (i = 0; i < 3; ++i) this.drift[i] += (this.driftTarget[i] - this.drift[i]) * 0.003;

        // Frecuencias base de cada oscilador
        var RANGE = [P.osc1Range, P.osc2Range, P.osc3Range];
        var tuneCents = (p[P.tune] - 0.5) * 200.0;
        for (i = 0; i < 3; ++i) {
            var range = p[RANGE[i]] | 0;   // 0 LO, 1 32', 2 16', 3 8', 4 4', 5 2'
            var semis = 0;
            if (i === 1) semis += (p[P.osc2Tune] - 0.5) * 14.0;
            if (i === 2) semis += (p[P.osc3Tune] - 0.5) * 14.0;
            var follows = i < 2 || p[P.osc3Kbd] >= 1;
            var f;
            if (range === 0) {
                if (!follows) f = 0.3 * Math.pow(2.0, p[P.osc3Tune] * 7.5);
                else f = 440.0 * Math.pow(2.0, (this.note - 69.0 - 72.0 + semis) / 12.0);
            } else {
                var oct = range - 3;
                var base = follows ? this.note : 60.0;
                f = 440.0 * Math.pow(2.0, (base - 69.0 + 12.0 * oct + semis) / 12.0);
            }
            this.baseFreq[i] = f * Math.pow(2.0, (tuneCents + this.drift[i]) / 1200.0);
        }

        // Mezclador
        var VOL = [P.vol1, P.vol2, P.vol3, P.volNoise], ON = [P.osc1On, P.osc2On, P.osc3On, P.noiseOn];
        for (i = 0; i < 4; ++i) this.gainTarget[i] = p[ON[i]] >= 1 ? Math.pow(p[VOL[i]], 1.6) : 0;
        for (i = 0; i < 4; ++i) this.gain[i] += (this.gainTarget[i] - this.gain[i]) * 0.02;

        // Filtro: base + seguimiento de teclado (1/3 + 1/3) + velocidad
        var kbd = (p[P.kbd1] >= 1 ? 1 / 3 : 0) + (p[P.kbd2] >= 1 ? 1 / 3 : 0);
        this.cutoffCents = (p[P.cutoff] * 10.0) * 1200.0 + (this.note - 60.0) * 100.0 * kbd - (1 - this.vel) * p[P.velocity] * 2400.0;
        this.resK = p[P.emphasis] * 4.1;
        this.outGain += (p[P.volume] - this.outGain) * 0.02;
    };

    var WAVE = [P.osc1Wave, P.osc2Wave, P.osc3Wave];

    Engine.prototype.processOne = function () {
        var p = this.p;
        if (this.ctrlCount === 0) this.controlUpdate();
        if (++this.ctrlCount >= CTRL) this.ctrlCount = 0;

        // Modulacion
        var wheel = Math.min(1, p[P.modWheel] + this.modExt);
        var modSrc = (1 - p[P.modMix]) * this.osc3Value + p[P.modMix] * this.noise(false);
        var modAmt = modSrc * wheel;
        var pitchCents = this.bend * 200.0 + (p[P.oscMod] >= 1 ? modAmt * 600.0 : 0.0);
        var pitchMul = Math.pow(2, pitchCents / 1200.0);
        var bendMul = Math.pow(2, this.bend * 200.0 / 1200.0);

        // Osciladores
        var o = [0, 0, 0], osr = this.osr;
        for (var i = 0; i < 3; ++i) {
            var f = this.baseFreq[i] * (i < 2 ? pitchMul : bendMul);
            var dt = Math.min(0.45, f / osr);
            var ph = this.phase[i] + dt;
            ph -= Math.floor(ph);
            this.phase[i] = ph;
            o[i] = waveform(p[WAVE[i]] | 0, ph, dt);
        }
        this.osc3Value = o[2];

        // Mezclador: la suma satura el filtro
        var pink = p[P.noiseType] >= 1;
        var nz = this.gain[3] > 1e-4 ? this.noise(pink) : 0;
        var mix = (o[0] * this.gain[0] + o[1] * this.gain[1] + o[2] * this.gain[2] + nz * this.gain[3]) * 0.55;

        // Filtro
        if ((this.ctrlCount & 3) === 0) {
            var cents = this.cutoffCents + this.fEnv.level * p[P.contourAmt] * 6000.0;
            if (p[P.filtMod] >= 1) cents += modAmt * 3600.0;
            var fc = Math.min(20000.0, 16.0 * Math.pow(2.0, cents / 1200.0));
            this.ladder.setCutoff(fc, osr);
        }
        var y = this.ladder.process(mix, this.resK);
        y *= 1 + 0.35 * this.resK;

        // Contornos y VCA
        var dec = p[P.decayOn] >= 1;
        this.fEnv.step(this.fAtk, this.fDec, p[P.fSus], dec ? this.fRelOn : this.relFast);
        var lenv = this.lEnv.step(this.lAtk, this.lDec, p[P.lSus], dec ? this.lRelOn : this.relFast);
        var velGain = 1 - p[P.velocity] * (1 - this.vel);
        var out = y * lenv * velGain * this.outGain * 1.6;

        if (p[P.a440] >= 1) {
            this.tonePhase += 440.0 / osr;
            this.tonePhase -= Math.floor(this.tonePhase);
            out += 0.12 * Math.sin(2.0 * PI * this.tonePhase);
        }
        return out;
    };

    Engine.prototype.process = function (left, right, n) {
        var st = this.stage;
        for (var i = 0; i < n; ++i) {
            for (var k = 0; k < OVERSAMPLE; ++k) st[k] = this.processOne();
            var a = this.dec1.process(st[0], st[1]);
            var b = this.dec1.process(st[2], st[3]);
            var s = this.dec2.process(a, b);
            // Bloqueo de continua y limitador suave (transparente hasta 0.85)
            var x = s;
            s = x - this.dcX + 0.9995 * this.dcY;
            this.dcX = x; this.dcY = s;
            var m = Math.abs(s);
            if (m > 0.85) s = (s < 0 ? -1 : 1) * (0.85 + 0.15 * Math.tanh((m - 0.85) / 0.15));
            left[i] = right[i] = s;
        }
    };

    var api = { Engine: Engine, P: P, PARAM_IDS: PARAM_IDS, PARAM_CHOICES: PARAM_CHOICES, PARAM_DEFAULTS: PARAM_DEFAULTS, Decimator2: Decimator2, Ladder: Ladder };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // --- El procesador del AudioWorklet ---
    if (typeof registerProcessor !== 'undefined' && typeof AudioWorkletProcessor !== 'undefined') {
        class ModelDProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.engine = new Engine();
                this.engine.prepare(sampleRate);
                this.events = [];   // notas agendadas: { t: instante del AudioContext, kind, a, b }
                this.port.onmessage = (e) => this.onMessage(e.data);
            }

            onMessage(m) {
                var eng = this.engine;
                switch (m.type) {
                    case 'param': eng.setParam(m.id, m.value); break;
                    case 'params': for (var i = 0; i < m.values.length; ++i) eng.setParam(i, m.values[i]); break;
                    case 'bend': eng.setBend(m.value); break;
                    case 'mod': eng.setModWheelExt(m.value); break;
                    case 'allOff': this.events.length = 0; eng.allNotesOff(); break;
                    case 'on': case 'off': {
                        var ev = { t: m.t || 0, kind: m.type, a: m.note, b: m.vel };
                        // Orden de tiempo (los que llegan primero y son del mismo instante, en orden de llegada)
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
        registerProcessor('modeld-processor', ModelDProcessor);
    }
})();
