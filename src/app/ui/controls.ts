/** Matematica comun de perillas y faders: valor <-> posicion normalizada (0..1). */

export function toNorm(value: number, min: number, max: number, log: boolean): number {
    if (max <= min)
        return 0;
    const n = log ? Math.log(Math.max(value, min) / min) / Math.log(max / min) : (value - min) / (max - min);
    return Math.max(0, Math.min(1, n));
}

export function fromNorm(norm: number, min: number, max: number, log: boolean, step: number): number {
    const n = Math.max(0, Math.min(1, norm));
    let v = log ? min * Math.pow(max / min, n) : min + n * (max - min);
    if (step > 0)
        v = Math.round(v / step) * step;
    // Evita colas como 0.30000000000000004
    return Math.max(min, Math.min(max, parseFloat(v.toFixed(6))));
}

/** Decimales a mostrar segun el paso. */
export function decimalsFor(step: number): number {
    if (step >= 1)
        return 0;
    if (step >= 0.1)
        return 1;
    return step >= 0.01 ? 2 : 3;
}

export function formatValue(v: number, step: number, unit: string): string {
    const abs = Math.abs(v);
    // Los valores grandes (frecuencias) no necesitan decimales
    const d = abs >= 1000 ? 0 : abs >= 100 ? Math.min(decimalsFor(step), 1) : decimalsFor(step);
    return v.toFixed(d) + (unit || '');
}

/** Punto sobre una circunferencia; el angulo se mide desde arriba (0 = arriba), en sentido horario. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
    const a = deg * Math.PI / 180;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** Arco SVG entre dos angulos. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
    if (Math.abs(to - from) < 0.01)
        return '';
    const a = polar(cx, cy, r, from), b = polar(cx, cy, r, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return 'M' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
}
