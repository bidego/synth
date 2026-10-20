// Poly Five: el motor de audio del plugin (polyfive/engine/pf_engine.cpp) traducido a JavaScript para correr en un AudioWorklet.
// Mismo diseno y mismas cuentas, muestra a muestra: 5 voces con dos osciladores (sync, poly-mod), mezclador con ruido, filtro de escalera
// de 24 dB, dos ADSR, LFO con rueda, unison y glide; sobremuestreo x2 con un FIR de media banda.
// Se puede probar en Node (module.exports) contra el motor en C++: polyfive/tests/compare_js.js.
'use strict';
(function () {

    // --- BEGIN GENERATED PARAMS (polyfive/scripts/gen_web.py: no editar a mano) ---
    var PARAM_IDS = ['aOct', 'aTune', 'aPw', 'aSaw', 'aPulse', 'sync', 'bOct', 'bFreq', 'bFine', 'bPw', 'bSaw', 'bTri', 'bPulse', 'bLow', 'bKbd', 'pmEnv', 'pmB', 'pmFreqA', 'pmPwA', 'pmFilter', 'mixA', 'mixB', 'mixNoise', 'cutoff', 'resonance', 'envAmt', 'kbdTrack', 'fAtk', 'fDec', 'fSus', 'fRel', 'aAtk', 'aDec', 'aSus', 'aRel', 'lfoFreq', 'lfoShape', 'lfoAmt', 'wmMix', 'wmFreqA', 'wmFreqB', 'wmPwA', 'wmPwB', 'wmFilter', 'modWheel', 'glide', 'glideOn', 'unison', 'tune', 'volume', 'velocity'];
    var PARAM_CHOICES = [5, 0, 0, 2, 2, 2, 5, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 2, 2, 2, 2, 2, 0, 0, 2, 2, 0, 0, 0];
    var PARAM_DEFAULTS = [2, 0.5, 0.5, 1, 0, 0, 2, 0.5, 0.5, 0.5, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.8, 0, 0, 0.55, 0.2, 0.4, 1, 0, 0.4, 0.3, 0.3, 0, 0.4, 0.8, 0.3, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0.5, 0.7, 0.4];
    // --- END GENERATED PARAMS ---

    var P = {};
    PARAM_IDS.forEach(function (id, i) { P[id] = i; });
    var NUM_PARAMS = PARAM_IDS.length;

    var PI = Math.PI;
    var VOICES = 5;
    var OVERSAMPLE = 2;
    var CTRL = 8;
    var ATTACK_TARGET = 1.3;
    var UNISON_SPREAD = [-12, -6, 0, 6, 12];

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

    function coefFor(seconds, sr) { return 1.0 - Math.exp(-1.0 / (Math.max(seconds, 1e-5) * sr)); }
    function attackSeconds(x) { return 0.001 * Math.pow(10000.0, x); }
    function slowSeconds(x) { return 0.002 * Math.pow(5000.0, x); }

    function pulseWave(t, dt, duty) {
        var v = t < duty ? 1 : -1;
        v += polyBlep(t, dt);
        var q = t + 1.0 - duty;
        q -= Math.floor(q);
        v -= polyBlep(q, dt);
        return v - (2.0 * duty - 1.0);
    }

    // --- Escalera de 4 polos ---
    function Ladder() { this.z = [0, 0, 0, 0]; this.G = 0; }
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
            var v = G * (fastTanh(inp) - z[i]);
            var y = v + z[i];
            z[i] = y + v;
            inp = y;
        }
        return inp;
    };

    // --- ADSR analogico ---
    var IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;
    function Contour() { this.stage = IDLE; this.level = 0; }
    Contour.prototype.gateOn = function () { this.stage = ATTACK; };
    Contour.prototype.gateOff = function () { if (this.stage !== IDLE) this.stage = RELEASE; };
    Contour.prototype.kill = function () { this.stage = IDLE; this.level = 0; };
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

    // --- Decimador por 2 (63 taps, Kaiser beta 9) ---
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
        for (i = 0; i < n; ++i) if (Math.abs(this.h[i]) > 1e-9) idx.push(i);
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

    // --- Voz ---
    function Voice() {
        this.note = -1; this.vel = 1; this.held = false; this.order = 0;
        this.noteNow = 60; this.noteTarget = 60;
        this.phaseA = 0; this.phaseB = 0; this.bPrev = 0;
        this.detune = 0; this.drift = 0; this.driftTarget = 0; this.outGain = 1;
        this.ladder = new Ladder();
        this.fenv = new Contour(); this.aenv = new Contour();
        this.pending = false; this.pNote = 0; this.pVel = 1; this.pDetune = 0; this.pGain = 1;
        this.stealing = false; this.stealGain = 1;
        this.baseFreqA = 110; this.baseFreqB = 110;
        this.cutoffCents = 0; this.pwModA = 0; this.pwModB = 0; this.centsA = 0; this.centsB = 0; this.wheelCutoff = 0;
    }
    Voice.prototype.active = function () { return this.aenv.stage !== IDLE; };

    // --- Motor ---
    function Engine() {
        this.p = new Float64Array(NUM_PARAMS);
        this.voices = [];
        for (var i = 0; i < VOICES; ++i) this.voices.push(new Voice());
        this.dec = new Decimator2(63);
        this.counter = 0; this.nextVoice = 0;
        this.stack = new Int32Array(16); this.stackVel = new Float64Array(16); this.stackSize = 0;
        this.played = false; this.lastNote = 60;
        this.bend = 0; this.modExt = 0;
        this.rng = 24681357;
        this.driftAmount = 3.0; this.driftCount = 0;
        this.lfoPhase = 0; this.lfoValue = 0; this.noiseHeld = 0; this.wheelSrc = 0; this.wheelAmt = 0;
        this.gain = [0, 0, 0]; this.gainTarget = [0, 0, 0];
        this.fAtk = 0; this.fDec = 0; this.fRel = 0; this.aAtk = 0; this.aDec = 0; this.aRel = 0;
        this.resK = 0; this.outGain = 0; this.ctrlCount = 0;
        this.dcX = 0; this.dcY = 0;
        this.stage = new Float64Array(OVERSAMPLE);
        this.sr = 44100; this.osr = 88200;
    }

    Engine.prototype.prepare = function (sampleRate) {
        this.sr = sampleRate;
        this.osr = sampleRate * OVERSAMPLE;
        for (var i = 0; i < NUM_PARAMS; i++) this.p[i] = PARAM_DEFAULTS[i];
        this.reset();
        this.updateTimes();
        this.controlUpdate();
        for (i = 0; i < 3; ++i) this.gain[i] = this.gainTarget[i];
        this.outGain = this.p[P.volume];
    };

    Engine.prototype.reset = function () {
        for (var i = 0; i < VOICES; ++i) this.voices[i] = new Voice();
        this.counter = 0; this.nextVoice = 0; this.stackSize = 0;
        this.played = false; this.lastNote = 60;
        this.bend = this.modExt = 0;
        this.lfoPhase = 0; this.lfoValue = this.noiseHeld = 0;
        this.dec.reset();
        this.dcX = this.dcY = 0;
        this.ctrlCount = 0; this.driftCount = 0;
    };

    Engine.prototype.updateTimes = function () {
        var p = this.p, osr = this.osr, k = Math.log(ATTACK_TARGET / (ATTACK_TARGET - 1.0));
        this.fAtk = coefFor(attackSeconds(p[P.fAtk]) / k, osr);
        this.fDec = coefFor(slowSeconds(p[P.fDec]) / 3.0, osr);
        this.fRel = coefFor(slowSeconds(p[P.fRel]) / 3.0, osr);
        this.aAtk = coefFor(attackSeconds(p[P.aAtk]) / k, osr);
        this.aDec = coefFor(slowSeconds(p[P.aDec]) / 3.0, osr);
        this.aRel = coefFor(slowSeconds(p[P.aRel]) / 3.0, osr);
    };

    Engine.prototype.setParam = function (id, value) {
        if (!(id >= 0 && id < NUM_PARAMS) || value !== value) return;
        var ch = PARAM_CHOICES[id];
        if (ch) this.p[id] = Math.round(Math.min(ch - 1, Math.max(0, value)));
        else this.p[id] = Math.min(1, Math.max(0, value));
        if (id >= P.fAtk && id <= P.aRel) this.updateTimes();
    };

    Engine.prototype.activeVoices = function () {
        var n = 0;
        for (var i = 0; i < VOICES; ++i) if (this.voices[i].active()) n++;
        return n;
    };

    // --- Notas ---
    Engine.prototype.beginNote = function (v, note, vel, detune, gain) {
        v.note = note; v.vel = vel; v.held = true; v.order = ++this.counter;
        v.noteTarget = note;
        v.noteNow = (this.p[P.glideOn] >= 1 && this.played) ? this.lastNote : note;
        this.lastNote = note; this.played = true;
        v.detune = detune; v.outGain = gain;
        v.pending = false; v.stealing = false; v.stealGain = 1;
        if (!v.active()) { v.ladder.reset(); v.fenv.level = 0; v.aenv.level = 0; }
        v.fenv.gateOn(); v.aenv.gateOn();
    };

    Engine.prototype.startVoice = function (v, note, vel, detune, gain) {
        if (v.active() && v.aenv.level > 0.02 && v.note !== note) {
            v.pending = true; v.pNote = note; v.pVel = vel; v.pDetune = detune; v.pGain = gain;
            v.stealing = true; v.held = false;
            return;
        }
        this.beginNote(v, note, vel, detune, gain);
    };

    Engine.prototype.allocate = function () {
        var i, v;
        for (i = 0; i < VOICES; i++) {
            v = this.voices[(this.nextVoice + i) % VOICES];
            if (!v.active() && !v.pending) return v;
        }
        var best = null;
        for (i = 0; i < VOICES; i++) { v = this.voices[i]; if (!v.held && (!best || v.order < best.order)) best = v; }
        if (best) return best;
        for (i = 0; i < VOICES; i++) { v = this.voices[i]; if (!best || v.order < best.order) best = v; }
        return best;
    };

    Engine.prototype.noteOn = function (note, velocity) {
        velocity = Math.min(1, Math.max(0, velocity));
        var i, w;
        if (this.p[P.unison] >= 1) {
            w = 0;
            for (i = 0; i < this.stackSize; i++)
                if (this.stack[i] !== note) { this.stack[w] = this.stack[i]; this.stackVel[w] = this.stackVel[i]; w++; }
            this.stackSize = w;
            if (this.stackSize < 16) { this.stack[this.stackSize] = note; this.stackVel[this.stackSize] = velocity; this.stackSize++; }
            for (i = 0; i < VOICES; i++) this.startVoice(this.voices[i], note, velocity, UNISON_SPREAD[i], 0.5);
            return;
        }
        var v = null;
        for (i = 0; i < VOICES; i++) { var c = this.voices[i]; if (c.note === note && c.held) { v = c; break; } }
        if (!v) {
            v = this.allocate();
            this.nextVoice = (this.voices.indexOf(v) + 1) % VOICES;
        }
        this.startVoice(v, note, velocity, 0, 1);
    };

    Engine.prototype.noteOff = function (note) {
        var i, w, v;
        if (this.p[P.unison] >= 1) {
            var wasTop = this.stackSize > 0 && this.stack[this.stackSize - 1] === note;
            w = 0;
            for (i = 0; i < this.stackSize; i++)
                if (this.stack[i] !== note) { this.stack[w] = this.stack[i]; this.stackVel[w] = this.stackVel[i]; w++; }
            this.stackSize = w;
            if (!wasTop) return;
            if (this.stackSize > 0) {
                for (i = 0; i < VOICES; i++)
                    this.startVoice(this.voices[i], this.stack[this.stackSize - 1], this.stackVel[this.stackSize - 1], UNISON_SPREAD[i], 0.5);
            } else {
                for (i = 0; i < VOICES; i++) { v = this.voices[i]; if (v.held) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); } }
            }
            return;
        }
        for (i = 0; i < VOICES; i++) {
            v = this.voices[i];
            if (v.held && v.note === note) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); }
        }
    };

    Engine.prototype.allNotesOff = function () {
        this.stackSize = 0;
        for (var i = 0; i < VOICES; i++) {
            var v = this.voices[i];
            v.pending = false; v.stealing = false;
            if (v.held || v.active()) { v.held = false; v.fenv.gateOff(); v.aenv.gateOff(); }
        }
    };

    Engine.prototype.setBend = function (norm) { this.bend = norm < -1 ? -1 : norm > 1 ? 1 : norm; };
    Engine.prototype.setModWheelExt = function (norm) { this.modExt = norm < 0 ? 0 : norm > 1 ? 1 : norm; };
    Engine.prototype.setDriftAmount = function (cents) { this.driftAmount = cents; };

    // --- Audio ---
    Engine.prototype.noise = function () {
        var r = this.rng;
        r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
        this.rng = r >>> 0;
        return this.rng * (2 / 4294967296) - 1;
    };

    Engine.prototype.controlUpdate = function () {
        var p = this.p, ctrlDt = CTRL / this.osr, i, v;

        var lfoHz = 0.1 * Math.pow(300.0, p[P.lfoFreq]);
        this.lfoPhase += lfoHz * ctrlDt;
        this.lfoPhase -= Math.floor(this.lfoPhase);
        var shape = p[P.lfoShape] | 0;
        this.lfoValue = shape === 0 ? (this.lfoPhase < 0.5 ? 4.0 * this.lfoPhase - 1.0 : 3.0 - 4.0 * this.lfoPhase)
                      : shape === 1 ? 1.0 - 2.0 * this.lfoPhase : (this.lfoPhase < 0.5 ? 1 : -1);
        if (p[P.wmMix] > 0.001) this.noiseHeld = this.noise();
        this.wheelSrc = (1 - p[P.wmMix]) * this.lfoValue + p[P.wmMix] * this.noiseHeld;
        this.wheelAmt = Math.min(1, p[P.lfoAmt] + p[P.modWheel] + this.modExt) * this.wheelSrc;

        if (++this.driftCount >= 400) {
            this.driftCount = 0;
            for (i = 0; i < VOICES; i++) this.voices[i].driftTarget = (this.noise() * 0.5) * this.driftAmount;
        }

        var MIX = [P.mixA, P.mixB, P.mixNoise];
        for (i = 0; i < 3; ++i) {
            this.gainTarget[i] = Math.pow(p[MIX[i]], 1.6);
            this.gain[i] += (this.gainTarget[i] - this.gain[i]) * 0.02;
        }
        this.resK = p[P.resonance] * 4.1;
        this.outGain += (p[P.volume] - this.outGain) * 0.02;

        var glideTc = 0.004 + p[P.glide] * p[P.glide] * 2.5;
        var tuneCents = (p[P.tune] - 0.5) * 200.0;
        var octA = (p[P.aOct] | 0) - 2, octB = (p[P.bOct] | 0) - 2;
        var kt = p[P.kbdTrack];
        var kbd = kt < 0.5 ? 0 : kt < 1.5 ? 0.5 : 1;
        var fineA = (p[P.aTune] - 0.5) * 2.0;
        var semisB = (p[P.bFreq] - 0.5) * 24.0 + (p[P.bFine] - 0.5) * 2.0;

        for (i = 0; i < VOICES; i++) {
            v = this.voices[i];
            if (!v.active() && !v.pending) continue;
            if (p[P.glideOn] >= 1) v.noteNow += (v.noteTarget - v.noteNow) * (1.0 - Math.exp(-ctrlDt / glideTc));
            else v.noteNow = v.noteTarget;
            v.drift += (v.driftTarget - v.drift) * 0.003;

            var cents = tuneCents + v.drift + v.detune + this.bend * 200.0;
            var noteSemis = v.noteNow + cents / 100.0;
            v.baseFreqA = 440.0 * Math.pow(2.0, (noteSemis - 69.0 + 12.0 * octA + fineA) / 12.0);
            if (p[P.bLow] >= 1) {
                if (p[P.bKbd] < 1) v.baseFreqB = 0.2 * Math.pow(2.0, p[P.bFreq] * 8.0);
                else v.baseFreqB = 440.0 * Math.pow(2.0, (noteSemis - 69.0 - 72.0 + semisB) / 12.0);
            } else {
                var base = p[P.bKbd] >= 1 ? noteSemis : 60.0 + cents / 100.0;
                v.baseFreqB = 440.0 * Math.pow(2.0, (base - 69.0 + 12.0 * octB + semisB) / 12.0);
            }
            v.centsA = p[P.wmFreqA] >= 1 ? this.wheelAmt * 700.0 : 0;
            v.centsB = p[P.wmFreqB] >= 1 ? this.wheelAmt * 700.0 : 0;
            v.pwModA = p[P.wmPwA] >= 1 ? this.wheelAmt * 0.4 : 0;
            v.pwModB = p[P.wmPwB] >= 1 ? this.wheelAmt * 0.4 : 0;
            v.wheelCutoff = p[P.wmFilter] >= 1 ? this.wheelAmt * 3600.0 : 0;
            v.cutoffCents = Math.log2(20.0) * 1200.0 + p[P.cutoff] * 10.0 * 1200.0 + (v.noteNow - 60.0) * 100.0 * kbd - (1 - v.vel) * p[P.velocity] * 2400.0;
        }
    };

    Engine.prototype.processOne = function () {
        var p = this.p;
        if (this.ctrlCount === 0) this.controlUpdate();
        if (++this.ctrlCount >= CTRL) this.ctrlCount = 0;

        var sync = p[P.sync] >= 1;
        var pmFreq = p[P.pmFreqA] >= 1, pmPw = p[P.pmPwA] >= 1, pmFilt = p[P.pmFilter] >= 1;
        var pmEnv = p[P.pmEnv], pmB = p[P.pmB], envAmt = p[P.envAmt];
        var nz = this.gain[2] > 1e-4 ? this.noise() * this.gain[2] : 0;
        var osr = this.osr, sum = 0;
        var aSaw = p[P.aSaw] >= 1, aPulse = p[P.aPulse] >= 1;
        var bSaw = p[P.bSaw] >= 1, bTri = p[P.bTri] >= 1, bPulse = p[P.bPulse] >= 1;
        var fSus = p[P.fSus], aSus = p[P.aSus];

        for (var vi = 0; vi < VOICES; ++vi) {
            var v = this.voices[vi];
            if (!v.active() && !v.pending) continue;
            if (v.stealing) {
                v.stealGain -= 1 / (0.003 * osr);
                if (v.stealGain <= 0) {
                    v.aenv.kill(); v.fenv.kill();
                    this.beginNote(v, v.pNote, v.pVel, v.pDetune, v.pGain);
                }
            }
            var fe = v.fenv.step(this.fAtk, this.fDec, fSus, this.fRel);
            var ae = v.aenv.step(this.aAtk, this.aDec, aSus, this.aRel);

            // Oscilador B
            var fB = v.baseFreqB * (v.centsB !== 0 ? Math.pow(2, v.centsB / 1200.0) : 1.0);
            var dtB = Math.min(0.45, fB / osr);
            v.phaseB += dtB;
            var wrapped = false, fracB = 0;
            if (v.phaseB >= 1.0) {
                v.phaseB -= 1.0;
                wrapped = true;
                fracB = dtB > 0 ? v.phaseB / dtB : 0;
            }
            var dutyB = Math.min(0.95, Math.max(0.05, 0.5 + (p[P.bPw] - 0.5) * 0.9 + v.pwModB));
            var b = 0;
            if (bSaw) b += (2.0 * v.phaseB - 1.0) - polyBlep(v.phaseB, dtB);
            if (bTri) b += v.phaseB < 0.5 ? 4.0 * v.phaseB - 1.0 : 3.0 - 4.0 * v.phaseB;
            if (bPulse) b += pulseWave(v.phaseB, dtB, dutyB);

            // Oscilador A con poly-mod
            var centsA = v.centsA;
            if (pmFreq) centsA += pmEnv * fe * 2400.0 + pmB * v.bPrev * 1200.0;
            var fA = v.baseFreqA * (centsA !== 0 ? Math.pow(2, centsA / 1200.0) : 1.0);
            var dtA = Math.min(0.45, fA / osr);
            var pwA = 0.5 + (p[P.aPw] - 0.5) * 0.9 + v.pwModA;
            if (pmPw) pwA += pmEnv * fe * 0.4 + pmB * v.bPrev * 0.4;
            pwA = Math.min(0.95, Math.max(0.05, pwA));
            v.phaseA += dtA;
            v.phaseA -= Math.floor(v.phaseA);
            var jump = 0;
            if (sync && wrapped) {
                var before = v.phaseA, after = fracB * dtA, vb = 0, va = 0;
                if (aSaw) { vb += 2.0 * before - 1.0; va += 2.0 * after - 1.0; }
                if (aPulse) { vb += before < pwA ? 1 : -1; va += after < pwA ? 1 : -1; }
                jump = (vb - va) * (1.0 - fracB);
                v.phaseA = after;
            }
            var a = 0;
            if (aSaw) a += (2.0 * v.phaseA - 1.0) - polyBlep(v.phaseA, dtA);
            if (aPulse) a += pulseWave(v.phaseA, dtA, pwA);
            a += jump;
            v.bPrev = b;

            // Mezclador y filtro
            var mix = (a * this.gain[0] + b * this.gain[1] + nz) * 0.3;
            var cents = v.cutoffCents + fe * envAmt * 6000.0 + v.wheelCutoff;
            if (pmFilt) cents += pmEnv * fe * 4800.0 + pmB * b * 3600.0;
            if ((this.ctrlCount & 1) === 0) v.ladder.setCutoff(Math.min(20000.0, Math.pow(2.0, cents / 1200.0)), osr);
            var y = v.ladder.process(mix, this.resK);
            y *= 1 + 0.35 * this.resK;
            var velGain = 1 - p[P.velocity] * (1 - v.vel);
            sum += y * ae * velGain * v.outGain * (v.stealing ? v.stealGain : 1);
        }
        return sum * this.outGain * 1.6;
    };

    Engine.prototype.process = function (left, right, n) {
        var st = this.stage;
        for (var i = 0; i < n; ++i) {
            for (var k = 0; k < OVERSAMPLE; ++k) st[k] = this.processOne();
            var s = this.dec.process(st[0], st[1]);
            var x = s;
            s = x - this.dcX + 0.9995 * this.dcY;
            this.dcX = x; this.dcY = s;
            var m = Math.abs(s);
            if (m > 0.85) s = (s < 0 ? -1 : 1) * (0.85 + 0.15 * fastTanh((m - 0.85) / 0.15));
            left[i] = right[i] = s;
        }
    };

    var api = { Engine: Engine, P: P, PARAM_IDS: PARAM_IDS, PARAM_CHOICES: PARAM_CHOICES, PARAM_DEFAULTS: PARAM_DEFAULTS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // --- El procesador del AudioWorklet (el mismo protocolo de mensajes que los otros sintetizadores) ---
    if (typeof registerProcessor !== 'undefined' && typeof AudioWorkletProcessor !== 'undefined') {
        class PolyFiveProcessor extends AudioWorkletProcessor {
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
                    case 'mod': eng.setModWheelExt(m.value); break;
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
        registerProcessor('polyfive-processor', PolyFiveProcessor);
    }
})();
