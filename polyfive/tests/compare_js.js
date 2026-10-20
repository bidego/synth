// Compara el motor web (AudioWorklet, JavaScript) con el del plugin (C++), muestra a muestra.
// Uso: node compare_js.js <pf_tests> [indices de sonidos...]
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pf = require('../../src/assets/worklets/polyfive-worklet.js');

const exe = process.argv[2];
const picks = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [0, 1, 4, 8, 9, 10, 16, 17, 20];
const frames = 44100, note = 40;
const presets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'presets', 'pf-presets.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfcmp-'));
let worst = 0, failed = 0;

for (const idx of picks) {
    const file = path.join(tmp, 'p' + idx + '.f32');
    execFileSync(exe, ['--dump', file, String(idx), String(note), String(frames)]);
    const buf = fs.readFileSync(file);
    const ref = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    const e = new pf.Engine();
    e.prepare(44100);
    for (let i = 0; i < pf.PARAM_IDS.length; i++) e.setParam(i, pf.PARAM_DEFAULTS[i]);
    const values = presets[idx].values;
    for (const k of Object.keys(values)) e.setParam(pf.P[k], values[k]);
    const out = new Float32Array(ref.length);
    const L = new Float32Array(128), R = new Float32Array(128);
    const at = (num, den) => Math.floor(Math.floor(frames * num / den) / 128) * 128;
    for (let pos = 0; pos < ref.length; pos += 128) {
        if (pos === 0) { e.noteOn(note, 0.9); e.noteOn(note + 4, 0.8); }
        if (pos === at(1, 5)) e.noteOn(note + 7, 0.7);
        if (pos === at(2, 5)) { e.noteOn(note + 11, 0.9); e.noteOn(note + 14, 0.6); e.noteOn(note + 17, 0.8); }
        if (pos === at(3, 5)) { e.noteOff(note); e.noteOff(note + 4); }
        if (pos === at(7, 10)) e.setBend(0.5);
        if (pos === at(4, 5)) { e.noteOff(note + 7); e.noteOff(note + 11); e.noteOff(note + 14); e.noteOff(note + 17); }
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
