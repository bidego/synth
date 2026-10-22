// Compara el motor web (AudioWorklet, JavaScript) con el del plugin (C++), muestra a muestra.
// Uso: node compare_js.js <re_tests> [indices de sonidos...]
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const re = require('../../src/assets/worklets/rhythmeight-worklet.js');

const exe = process.argv[2];
const presets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'presets', 're-presets.json'), 'utf8'));
const picks = process.argv.length > 3 ? process.argv.slice(3).map(Number) : presets.map((p, i) => i);
const frames = 44100 * 4;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recmp-'));
let worst = 0, failed = 0;

for (const idx of picks) {
    const file = path.join(tmp, 'p' + idx + '.f32');
    execFileSync(exe, ['--dump', file, String(idx), String(frames)]);
    const buf = fs.readFileSync(file);
    const ref = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    const e = new re.Engine();
    e.prepare(44100);
    for (let i = 0; i < re.PARAM_IDS.length; i++) e.setParam(i, re.PARAM_DEFAULTS[i]);
    e.loadPreset(presets[idx]);
    const out = new Float32Array(ref.length);
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let pos = 0; pos < ref.length; pos += 128) {
        if (pos === 0) e.setParam(re.P.run, 1);
        if (pos === 128 * 100) { e.trigger(0, 1.0, true); e.noteOn(38, 0.7); }
        if (pos === 128 * 200) { e.noteOn(46, 0.9); e.noteOn(56, 0.5); }
        if (pos === 128 * 260) e.noteOn(42, 0.9);
        if (pos === 128 * 300) e.noteOn(49, 1.0);
        const len = Math.min(128, ref.length - pos);
        e.process(L, R, len);
        out.set(L.subarray(0, len), pos);
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
    console.log((ok ? 'ok   ' : 'FALLA') + ' ' + presets[idx].name.padEnd(18) + ' pico ' + peak.toFixed(3) + '  error max ' + maxDiff.toExponential(2) + '  relativo ' + (rel * 100).toFixed(4) + ' %');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? failed + ' sonidos distintos' : 'el motor web coincide con el del plugin (peor error relativo ' + (worst * 100).toFixed(4) + ' %)');
process.exit(failed ? 1 : 0);
