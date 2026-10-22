// Grabador 8 pistas: captura el audio de hasta 8 entradas (estereo cada una) y lo manda al hilo principal en bloques.
// Mensajes de entrada:  { type: 'rec', on: true, mask }  empieza (mask = pistas armadas, un bit por pista)
//                       { type: 'rec', on: false }       termina: manda lo que quedaba y responde { type: 'flushed' }
// Mensajes de salida:   { type: 'chunk', t, frame, l, r }  (t = pista 0..7; frame = cuadro del AudioContext del primer cuadro)
'use strict';
(function () {
    var TRACKS = 8;
    var CHUNK = 4096;   // cuadros por mensaje (unos 11 mensajes por segundo y pista)

    function Recorder() {
        this.on = false;
        this.mask = 0;
        this.fill = 0;
        this.frame0 = 0;
        this.l = [];
        this.r = [];
    }

    Recorder.prototype.start = function (mask) {
        this.on = true;
        this.mask = mask | 0;
        this.fill = 0;
        for (var t = 0; t < TRACKS; t++) {
            this.l[t] = (this.mask >> t) & 1 ? new Float32Array(CHUNK) : null;
            this.r[t] = (this.mask >> t) & 1 ? new Float32Array(CHUNK) : null;
        }
    };

    // Manda los `n` cuadros acumulados de cada pista armada
    Recorder.prototype.flush = function (post) {
        var n = this.fill;
        if (n > 0) {
            for (var t = 0; t < TRACKS; t++) {
                if (!this.l[t])
                    continue;
                var l = n == CHUNK ? this.l[t] : this.l[t].slice(0, n);
                var r = n == CHUNK ? this.r[t] : this.r[t].slice(0, n);
                post({ type: 'chunk', t: t, frame: this.frame0, l: l, r: r }, [l.buffer, r.buffer]);
                if (this.on) {
                    this.l[t] = new Float32Array(CHUNK);
                    this.r[t] = new Float32Array(CHUNK);
                }
            }
        }
        this.fill = 0;
    };

    // `inputs`: una entrada por pista, cada una con 0, 1 o 2 canales (sin canales = nada conectado = silencio)
    Recorder.prototype.process = function (inputs, frame, post) {
        if (!this.on)
            return;
        var size = 128;
        for (var t = 0; t < TRACKS; t++)
            if (inputs[t] && inputs[t][0]) {
                size = inputs[t][0].length;
                break;
            }
        if (this.fill == 0)
            this.frame0 = frame;
        for (var t2 = 0; t2 < TRACKS; t2++) {
            if (!this.l[t2])
                continue;
            var inp = inputs[t2] || [];
            var a = inp[0], b = inp[1] || inp[0];
            if (a) {
                this.l[t2].set(a, this.fill);
                this.r[t2].set(b, this.fill);
            }   // si no hay entrada, el bloque queda en ceros (los arreglos nuevos vienen en cero)
        }
        this.fill += size;
        if (this.fill + size > CHUNK)
            this.flush(post);
    };

    if (typeof AudioWorkletProcessor !== 'undefined') {
        class RecorderProcessor extends AudioWorkletProcessor {
            constructor() {
                super();
                this.rec = new Recorder();
                var self = this;
                this.post = function (msg, transfer) { self.port.postMessage(msg, transfer); };
                this.port.onmessage = function (e) {
                    var m = e.data;
                    if (!m || m.type != 'rec')
                        return;
                    if (m.on) {
                        self.rec.start(m.mask);
                    } else {
                        self.rec.flush(self.post);
                        self.rec.on = false;
                        self.post({ type: 'flushed' });
                    }
                };
            }

            process(inputs) {
                this.rec.process(inputs, currentFrame, this.post);
                return true;
            }
        }
        registerProcessor('recorder-processor', RecorderProcessor);
    }

    if (typeof module !== 'undefined' && module.exports)
        module.exports = { Recorder: Recorder, CHUNK: CHUNK };
})();
