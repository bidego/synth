// Generado por plugin/scripts/gen_presets.py desde plugin/presets/juno-presets.json: no editar a mano.
// Los mismos sonidos que trae el plugin.

export interface JunoPreset {
    name: string;
    category: string;
    values: { [id: string]: number };
}

export const JUNO_PRESETS: ReadonlyArray<JunoPreset> = [
    { name: 'Init', category: 'Init', values: { vcaLevel: 0.65 } },
    { name: 'Funk Bass', category: 'Bajos', values: { range: 0, pulse: 1, saw: 0, pwm: 0, pwmMode: 0, sub: 0.7, hpf: 0, vcfFreq: 0.3, vcfRes: 0.4, vcfEnv: 0.6, vcfKybd: 0.3, atk: 0, dec: 0.5, sus: 0.1, rel: 0.2, chorus: 0, vcaLevel: 0.25 } },
    { name: 'Sub Bass', category: 'Bajos', values: { range: 0, pulse: 0, saw: 1, sub: 0.9, hpf: 0, vcfFreq: 0.28, vcfRes: 0.1, vcfEnv: 0.2, atk: 0.01, dec: 0.4, sus: 0.6, rel: 0.15, chorus: 0, vcaLevel: 0.2 } },
    { name: 'Acid Bass', category: 'Bajos', values: { range: 0, pulse: 0, saw: 1, sub: 0.2, hpf: 0, vcfFreq: 0.22, vcfRes: 0.75, vcfEnv: 0.7, vcfKybd: 0.2, atk: 0, dec: 0.45, sus: 0, rel: 0.15, voiceMode: 1, portaOn: 1, portaTime: 0.15, chorus: 0, vcaLevel: 0.69 } },
    { name: 'Pulse Bass', category: 'Bajos', values: { range: 0, pulse: 1, saw: 0, pwm: 0.35, sub: 0.5, hpf: 0, vcfFreq: 0.35, vcfRes: 0.2, vcfEnv: 0.4, atk: 0.02, dec: 0.45, sus: 0.4, rel: 0.15, chorus: 0, vcaLevel: 0.22 } },
    { name: 'Rubber Bass', category: 'Bajos', values: { range: 0, pulse: 1, saw: 1, pwm: 0.1, sub: 0.4, hpf: 0, vcfFreq: 0.25, vcfRes: 0.55, vcfEnv: 0.55, atk: 0, dec: 0.4, sus: 0.15, rel: 0.18, chorus: 0, vcaLevel: 0.58 } },
    { name: 'Wobble Bass', category: 'Bajos', values: { range: 0, pulse: 0, saw: 1, sub: 0.6, hpf: 0, vcfFreq: 0.3, vcfRes: 0.5, vcfEnv: 0.1, vcfLfo: 0.6, lfoRate: 0.45, atk: 0.01, dec: 0.5, sus: 0.8, rel: 0.2, voiceMode: 2, chorus: 0, vcaLevel: 0.19 } },
    { name: 'Strings', category: 'Cuerdas y pads', values: { range: 1, pulse: 1, saw: 1, pwm: 0.5, pwmMode: 1, lfoRate: 0.18, sub: 0, vcfFreq: 0.62, vcfRes: 0.05, vcfEnv: 0.1, atk: 0.55, dec: 0.5, sus: 0.85, rel: 0.55, chorus: 3, vcaLevel: 0.68 } },
    { name: 'Soft Pad', category: 'Cuerdas y pads', values: { range: 1, pulse: 1, saw: 0, pwm: 0.6, pwmMode: 1, lfoRate: 0.15, sub: 0.2, hpf: 1, vcfFreq: 0.45, vcfRes: 0.2, vcfEnv: 0.25, atk: 0.7, dec: 0.6, sus: 0.8, rel: 0.7, chorus: 2, vcaLevel: 0.34 } },
    { name: 'Warm Pad', category: 'Cuerdas y pads', values: { range: 1, pulse: 1, saw: 1, pwm: 0.4, pwmMode: 1, lfoRate: 0.12, sub: 0.2, vcfFreq: 0.4, vcfRes: 0.15, vcfEnv: 0.3, vcfKybd: 0.6, atk: 0.75, dec: 0.6, sus: 0.85, rel: 0.75, chorus: 1, vcaLevel: 0.71 } },
    { name: 'Choir', category: 'Cuerdas y pads', values: { range: 1, pulse: 1, saw: 0, pwm: 0.7, pwmMode: 1, lfoRate: 0.3, noise: 0.08, sub: 0.1, hpf: 2, vcfFreq: 0.5, vcfRes: 0.35, vcfEnv: 0.15, atk: 0.6, dec: 0.5, sus: 0.8, rel: 0.6, chorus: 2, vcaLevel: 0.68 } },
    { name: 'Sweep Pad', category: 'Cuerdas y pads', values: { range: 1, pulse: 0, saw: 1, sub: 0, vcfFreq: 0.25, vcfRes: 0.45, vcfEnv: 0.65, vcfLfo: 0.2, lfoRate: 0.12, atk: 0.8, dec: 0.85, sus: 0.5, rel: 0.8, chorus: 3, vcaLevel: 0.96 } },
    { name: 'Glass Pad', category: 'Cuerdas y pads', values: { range: 2, pulse: 1, saw: 0, pwm: 0.55, pwmMode: 1, lfoRate: 0.2, sub: 0, hpf: 2, vcfFreq: 0.75, vcfRes: 0.3, vcfEnv: 0.15, atk: 0.65, dec: 0.6, sus: 0.8, rel: 0.75, chorus: 3, vcaLevel: 0.42 } },
    { name: 'Dark Pad', category: 'Cuerdas y pads', values: { range: 1, pulse: 0, saw: 1, sub: 0.5, hpf: 0, vcfFreq: 0.3, vcfRes: 0.2, vcfEnv: 0.4, atk: 0.7, dec: 0.7, sus: 0.7, rel: 0.8, chorus: 2, vcaLevel: 0.4 } },
    { name: 'Brass', category: 'Metales', values: { range: 1, pulse: 0, saw: 1, sub: 0.2, vcfFreq: 0.35, vcfRes: 0.1, vcfEnv: 0.45, vcfKybd: 0.5, atk: 0.2, dec: 0.5, sus: 0.7, rel: 0.2, chorus: 1, vcaLevel: 0.63 } },
    { name: 'Brass Swell', category: 'Metales', values: { range: 1, pulse: 0, saw: 1, sub: 0.2, vcfFreq: 0.25, vcfRes: 0.15, vcfEnv: 0.6, vcfKybd: 0.5, atk: 0.55, dec: 0.6, sus: 0.8, rel: 0.35, chorus: 1, vcaLevel: 0.6 } },
    { name: 'Poly Brass', category: 'Metales', values: { range: 1, pulse: 1, saw: 1, pwm: 0.15, sub: 0.3, vcfFreq: 0.3, vcfRes: 0.2, vcfEnv: 0.55, atk: 0.3, dec: 0.45, sus: 0.7, rel: 0.25, chorus: 1, vcaLevel: 0.65 } },
    { name: 'Stab', category: 'Metales', values: { range: 1, pulse: 1, saw: 1, pwm: 0.3, sub: 0.2, vcfFreq: 0.35, vcfRes: 0.25, vcfEnv: 0.55, atk: 0, dec: 0.45, sus: 0.25, rel: 0.3, chorus: 2, vcaLevel: 0.87 } },
    { name: 'Vibrato Lead', category: 'Leads', values: { range: 1, pulse: 1, saw: 1, pwm: 0, sub: 0.15, dcoLfo: 0.25, lfoRate: 0.45, lfoDelay: 0.35, vcfFreq: 0.6, vcfRes: 0.2, vcfEnv: 0.3, atk: 0.02, dec: 0.5, sus: 0.8, rel: 0.2, voiceMode: 1, chorus: 2, vcaLevel: 0.62 } },
    { name: 'Wobble Lead', category: 'Leads', values: { range: 2, pulse: 1, saw: 1, pwm: 0.2, sub: 0, vcfFreq: 0.5, vcfRes: 0.45, vcfEnv: 0.2, vcfLfo: 0.35, lfoRate: 0.5, atk: 0.02, dec: 0.4, sus: 0.8, rel: 0.2, voiceMode: 2, portaOn: 1, portaTime: 0.25, chorus: 1, vcaLevel: 0.73 } },
    { name: 'Saw Lead', category: 'Leads', values: { range: 1, pulse: 0, saw: 1, sub: 0.25, dcoLfo: 0.12, lfoRate: 0.45, lfoDelay: 0.4, vcfFreq: 0.6, vcfRes: 0.3, vcfEnv: 0.3, atk: 0.02, dec: 0.5, sus: 0.85, rel: 0.2, voiceMode: 2, portaOn: 1, portaTime: 0.15, chorus: 1, vcaLevel: 0.63 } },
    { name: 'Pulse Lead', category: 'Leads', values: { range: 1, pulse: 1, saw: 0, pwm: 0.5, pwmMode: 1, lfoRate: 0.35, sub: 0.1, vcfFreq: 0.55, vcfRes: 0.35, vcfEnv: 0.35, atk: 0.01, dec: 0.5, sus: 0.8, rel: 0.2, voiceMode: 1, chorus: 2, vcaLevel: 0.42 } },
    { name: 'Mono Glide', category: 'Leads', values: { range: 1, pulse: 1, saw: 1, pwm: 0.2, sub: 0.35, vcfFreq: 0.45, vcfRes: 0.4, vcfEnv: 0.4, atk: 0.01, dec: 0.45, sus: 0.75, rel: 0.2, voiceMode: 2, portaOn: 1, portaTime: 0.35, chorus: 1, vcaLevel: 0.63 } },
    { name: 'Bell Tine', category: 'Teclas', values: { range: 2, pulse: 1, saw: 0, pwm: 0.5, sub: 0, noise: 0.05, hpf: 2, vcfFreq: 0.7, vcfRes: 0.5, vcfEnv: 0.3, atk: 0, dec: 0.68, sus: 0, rel: 0.6, chorus: 3, vcaLevel: 0.61 } },
    { name: 'Organ', category: 'Teclas', values: { range: 1, pulse: 1, saw: 0, pwm: 0, sub: 0.8, hpf: 1, vcfFreq: 0.75, vcfRes: 0.05, vcfEnv: 0, atk: 0, dec: 0.5, sus: 1, rel: 0.08, vcaMode: 1, chorus: 3, vcaLevel: 0.26 } },
    { name: 'Clav', category: 'Teclas', values: { range: 1, pulse: 1, saw: 0, pwm: 0.35, sub: 0, hpf: 3, vcfFreq: 0.5, vcfRes: 0.35, vcfEnv: 0.45, vcfKybd: 0.6, atk: 0, dec: 0.5, sus: 0.15, rel: 0.15, chorus: 0, vcaLevel: 1 } },
    { name: 'E.Piano', category: 'Teclas', values: { range: 1, pulse: 1, saw: 0, pwm: 0.5, sub: 0.2, hpf: 1, vcfFreq: 0.45, vcfRes: 0.2, vcfEnv: 0.4, vcfKybd: 0.7, atk: 0, dec: 0.62, sus: 0.25, rel: 0.45, velVca: 0.9, velVcf: 0.5, chorus: 2, vcaLevel: 0.46 } },
    { name: 'Harpsichord', category: 'Teclas', values: { range: 1, pulse: 1, saw: 1, pwm: 0.1, sub: 0, hpf: 2, vcfFreq: 0.6, vcfRes: 0.25, vcfEnv: 0.4, atk: 0, dec: 0.5, sus: 0, rel: 0.15, chorus: 0, vcaLevel: 1 } },
    { name: 'Pluck', category: 'Plucks', values: { range: 1, pulse: 1, saw: 1, pwm: 0.3, sub: 0.1, vcfFreq: 0.3, vcfRes: 0.3, vcfEnv: 0.6, atk: 0, dec: 0.52, sus: 0, rel: 0.35, chorus: 1, vcaLevel: 0.92 } },
    { name: 'Marimba', category: 'Plucks', values: { range: 2, pulse: 0, saw: 0, sub: 0.9, vcfFreq: 0.25, vcfRes: 0.2, vcfEnv: 0.3, vcfKybd: 0.7, atk: 0, dec: 0.5, sus: 0, rel: 0.3, chorus: 0, vcaLevel: 0.67 } },
    { name: 'Kalimba', category: 'Plucks', values: { range: 2, pulse: 1, saw: 0, pwm: 0.5, sub: 0, vcfFreq: 0.4, vcfRes: 0.3, vcfEnv: 0.35, vcfKybd: 0.8, atk: 0, dec: 0.55, sus: 0, rel: 0.4, chorus: 1, vcaLevel: 0.57 } },
    { name: 'Arp Pluck', category: 'Plucks', values: { range: 1, pulse: 1, saw: 1, pwm: 0.15, vcfFreq: 0.22, vcfRes: 0.45, vcfEnv: 0.6, atk: 0, dec: 0.4, sus: 0, rel: 0.15, voiceMode: 1, chorus: 1, vcaLevel: 1 } },
    { name: 'Noise Sweep', category: 'Efectos', values: { range: 1, pulse: 0, saw: 0, sub: 0, noise: 0.9, vcfFreq: 0.2, vcfRes: 0.6, vcfEnv: 0.7, atk: 0.65, dec: 0.8, sus: 0.3, rel: 0.6, chorus: 2, vcaLevel: 1 } },
    { name: 'Wind', category: 'Efectos', values: { range: 1, pulse: 0, saw: 0, sub: 0, noise: 1, hpf: 2, vcfFreq: 0.45, vcfRes: 0.5, vcfEnv: 0, vcfLfo: 0.5, lfoRate: 0.2, atk: 0.75, dec: 0.7, sus: 0.9, rel: 0.8, chorus: 2, vcaLevel: 1 } },
    { name: 'Laser', category: 'Efectos', values: { range: 2, pulse: 0, saw: 1, sub: 0, vcfFreq: 0.8, vcfRes: 0.6, vcfEnv: 0.8, envPol: 0, atk: 0, dec: 0.55, sus: 0, rel: 0.2, chorus: 0, vcaLevel: 0.87 } },
    { name: 'Riser', category: 'Efectos', values: { range: 1, pulse: 0, saw: 1, sub: 0, noise: 0.6, vcfFreq: 0.1, vcfRes: 0.6, vcfEnv: 0.9, atk: 0.95, dec: 0.5, sus: 1, rel: 0.6, chorus: 3, vcaLevel: 1 } },
    { name: 'Sci-Fi', category: 'Efectos', values: { range: 1, pulse: 1, saw: 0, pwm: 0.8, pwmMode: 1, lfoRate: 0.75, dcoLfo: 0.5, sub: 0, lfoDelay: 0.3, vcfFreq: 0.5, vcfRes: 0.5, vcfLfo: 0.4, atk: 0.1, dec: 0.6, sus: 0.7, rel: 0.5, chorus: 3, vcaLevel: 0.66 } },
];
