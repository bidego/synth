// Compara el motor web (AudioWorklet, JavaScript) con el del plugin (C++): mismo sonido, mismas notas, muestra a muestra.
// Uso: node compare_js.js <md_tests> [indices de sonidos...]
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const md = require('../../src/assets/worklets/modeld-worklet.js');

const exe = process.argv[2];
const picks = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [0, 1, 4, 7, 16, 21, 24];
const frames = 44100;
const note = 40;
const presets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'presets', 'md-presets.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdcmp-'));
let worst = 0, failed = 0;

for (const idx of picks) {
    const file = path.join(tmp, 'p' + idx + '.f32');
    execFileSync(exe, ['--dump', file, String(idx), String(note), String(frames)]);
    const buf = fs.readFileSync(file);
    const ref = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);

    const e = new md.Engine();
    e.prepare(44100);
    // loadPreset: valores por defecto y los del sonido
    for (let i = 0; i < md.PARAM_IDS.length; i++) e.setParam(i, md.PARAM_DEFAULTS[i]);
    const values = presets[idx].values;
    for (const k of Object.keys(values)) e.setParam(md.P[k], values[k]);
    const out = new Float32Array(ref.length);
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let pos = 0; pos < ref.length; pos += 128) {
        if (pos === 0) e.noteOn(note, 0.9);
        if (pos === Math.floor(frames * 2 / 5 / 128) * 128) e.noteOn(note + 7, 0.7);
        if (pos === Math.floor(frames * 13 / 20 / 128) * 128) e.noteOff(note + 7);
        if (pos === Math.floor(frames * 4 / 5 / 128) * 128) e.noteOff(note);
        e.process(L, R, 128);
        out.set(L, pos);
    }
    let maxDiff = 0, sumDiff = 0, sumRef = 0, peak = 0;
    for (let i = 0; i < ref.length; i++) {
        const d = Math.abs(out[i] - ref[i]);
        maxDiff = Math.max(maxDiff, d); sumDiff += d * d; sumRef += ref[i] * ref[i]; peak = Math.max(peak, Math.abs(ref[i]));
    }
    const rel = Math.sqrt(sumDiff / Math.max(sumRef, 1e-20));
    worst = Math.max(worst, rel);
    const ok = rel < 0.01 && maxDiff < 0.02;
    if (!ok) failed++;
    console.log((ok ? 'ok   ' : 'FALLA') + ' ' + presets[idx].name.padEnd(14) + ' pico ' + peak.toFixed(3) + '  error max ' + maxDiff.toExponential(2) + '  relativo ' + (rel * 100).toFixed(4) + ' %');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? failed + ' sonidos distintos' : 'el motor web coincide con el del plugin (peor error relativo ' + (worst * 100).toFixed(4) + ' %)');
process.exit(failed ? 1 : 0);
