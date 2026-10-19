#!/usr/bin/env python3
"""Genera, desde plugin/presets/juno-presets.json (la unica fuente), la lista de sonidos del plugin (C++) y de la web (TypeScript).

    python3 plugin/scripts/gen_presets.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'plugin', 'presets', 'juno-presets.json')
CPP = os.path.join(ROOT, 'plugin', 'engine', 'juno_presets.inc')
TS = os.path.join(ROOT, 'src', 'app', 'daw', 'modules', 'juno-presets.ts')

# id del control -> nombre en el enum de juno_params.h (en el mismo orden)
ENUM = ['PortaTime', 'PortaOn', 'VoiceMode', 'BendDco', 'BendVcf', 'LfoRate', 'LfoDelay', 'DcoLfo', 'Pwm', 'PwmMode', 'Range', 'Pulse', 'Saw',
        'Sub', 'Noise', 'Hpf', 'VcfFreq', 'VcfRes', 'VcfEnv', 'VcfLfo', 'VcfKybd', 'EnvPol', 'VcaLevel', 'VcaMode', 'Atk', 'Dec', 'Sus', 'Rel',
        'VelVca', 'VelVcf', 'Chorus']
IDS = {e[0].lower() + e[1:]: e for e in ENUM}

presets = json.load(open(SRC, encoding='utf-8'))
names = set()
for p in presets:
    assert p['name'] not in names, 'nombre repetido: ' + p['name']
    names.add(p['name'])
    for k in p['values']:
        assert k in IDS, 'control desconocido %r en %r' % (k, p['name'])


with open(CPP, 'w', encoding='utf-8') as f:
    f.write('// Generado por plugin/scripts/gen_presets.py desde plugin/presets/juno-presets.json: no editar a mano.\n')
    for p in presets:
        vals = ', '.join('{%s, %s}' % (IDS[k], ('%gf' % v) if float(v) != int(v) else str(int(v))) for k, v in p['values'].items())
        f.write('    { "%s", "%s", { %s } },\n' % (p['name'], p['category'], vals))

with open(TS, 'w', encoding='utf-8') as f:
    f.write('// Generado por plugin/scripts/gen_presets.py desde plugin/presets/juno-presets.json: no editar a mano.\n')
    f.write('// Los mismos sonidos que trae el plugin.\n\n')
    f.write('export interface JunoPreset {\n    name: string;\n    category: string;\n    values: { [id: string]: number };\n}\n\n')
    f.write('export const JUNO_PRESETS: ReadonlyArray<JunoPreset> = [\n')
    for p in presets:
        vals = ', '.join('%s: %s' % (k, ('%g' % v)) for k, v in p['values'].items())
        f.write("    { name: '%s', category: '%s', values: { %s } },\n" % (p['name'], p['category'], vals))
    f.write('];\n')
print('%d sonidos -> %s, %s' % (len(presets), os.path.relpath(CPP, ROOT), os.path.relpath(TS, ROOT)))
