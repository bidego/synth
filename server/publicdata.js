'use strict';
// Datos derivados de un proyecto para mostrarlo en la galeria publica: estadisticas y una vista previa liviana
// (unas pocas notas por pista) con la que la landing dibuja una miniatura sin descargar el proyecto entero.

const MAX_PREVIEW_TRACKS = 4;
const MAX_PREVIEW_NOTES = 64;

const num = (v, d) => typeof v == 'number' && isFinite(v) ? v : d;

function clean(text, max) {
    // Sin caracteres de control (incluidos los separadores de linea y de parrafo de Unicode) y con espacios simples
    const out = Array.from(String(text == null ? '' : text)).map(c => {
        const k = c.charCodeAt(0);
        return k < 32 || k == 127 || k == 0x2028 || k == 0x2029 ? ' ' : c;
    }).join('');
    return out.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Todas las pistas de notas del proyecto (de todos los instrumentos), formato v2 o el v1 de un solo instrumento. */
function tracksOf(data) {
    const out = [];
    if (data && data.rack && Array.isArray(data.rack.modules)) {
        data.rack.modules.forEach(m => {
            const seq = m && m.state && m.state.sequencer;
            if (m && m.type == 'synth' && seq && Array.isArray(seq.tracks))
                seq.tracks.forEach(t => out.push({ module: m, track: t }));
        });
    } else if (data && Array.isArray(data.tracks)) {
        data.tracks.forEach(t => out.push({ module: null, track: t }));
    }
    return out.filter(x => x.track && Array.isArray(x.track.notes));
}

function summarize(data) {
    const t = data && data.transport || {};
    const bpm = Math.max(40, Math.min(240, num(t.bpm, 100)));
    const num_ = Math.max(1, Math.min(16, Math.round(num(t.numerator, 4))));
    const den = [2, 4, 8, 16].indexOf(t.denominator) >= 0 ? t.denominator : 4;
    const bars = [1, 2, 4, 8, 16, 32, 64].indexOf(t.bars) >= 0 ? t.bars : 2;
    const barBeats = num_ * 4 / den;
    const loopBeats = bars * barBeats;
    const modules = data && data.rack && Array.isArray(data.rack.modules) ? data.rack.modules : [];
    const tracks = tracksOf(data);
    const notes = tracks.reduce((n, x) => n + x.track.notes.length, 0);
    const instruments = [];
    tracks.forEach(x => {
        const name = clean(x.track.patch && x.track.patch.name, 30);
        if (name && instruments.indexOf(name) < 0)
            instruments.push(name);
    });
    const effects = modules.filter(m => m && m.type && ['keyboard', 'synth', 'mixer', 'output', 'splitter', 'merger'].indexOf(m.type) < 0).length;
    const automation = data && data.automation && Array.isArray(data.automation.lanes) ? data.automation.lanes.length : 0;
    return {
        bpm: Math.round(bpm * 10) / 10,
        signature: num_ + '/' + den,
        bars,
        seconds: Math.round(loopBeats * 60 / bpm * 10) / 10,
        modules: modules.length || 1,
        tracks: tracks.length,
        notes,
        effects,
        automation,
        instruments: instruments.slice(0, 6)
    };
}

function previewOf(data) {
    const t = data && data.transport || {};
    const num_ = Math.max(1, Math.min(16, Math.round(num(t.numerator, 4))));
    const den = [2, 4, 8, 16].indexOf(t.denominator) >= 0 ? t.denominator : 4;
    const bars = [1, 2, 4, 8, 16, 32, 64].indexOf(t.bars) >= 0 ? t.bars : 2;
    const loopBeats = bars * num_ * 4 / den;
    const tracks = tracksOf(data)
        .filter(x => x.track.notes.length)
        .sort((a, b) => b.track.notes.length - a.track.notes.length)
        .slice(0, MAX_PREVIEW_TRACKS)
        .map(x => {
            const all = x.track.notes;
            // Si hay muchas notas se toma una de cada tantas, parejo a lo largo del loop
            const step = Math.max(1, Math.ceil(all.length / MAX_PREVIEW_NOTES));
            const notes = [];
            for (let i = 0; i < all.length && notes.length < MAX_PREVIEW_NOTES; i += step) {
                const n = all[i];
                if (n && isFinite(n.start) && isFinite(n.dur) && isFinite(n.midi))
                    notes.push([Math.round(n.start * 100) / 100, Math.round(n.dur * 100) / 100, Math.max(0, Math.min(127, Math.round(n.midi)))]);
            }
            const kind = x.track.patch && x.track.patch.kind;
            return { drums: kind == 'kit' || kind == 'drums', notes };
        });
    return { loopBeats, tracks };
}

module.exports = { summarize, previewOf, clean, tracksOf };
