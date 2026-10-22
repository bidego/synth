#!/usr/bin/env python3
"""Genera los datos de Rhythm Eight para la version web (Syntotec) desde el motor C++ (re_params.cpp) y los sonidos (re-presets.json):
el bloque de parametros de src/assets/worklets/rhythmeight-worklet.js y src/app/daw/modules/rhythmeight-data.ts.

    python3 rhythmeight/scripts/gen_web.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
PARAMS_CPP = os.path.join(HERE, '..', 'engine', 're_params.cpp')
PRESETS = os.path.join(HERE, '..', 'presets', 're-presets.json')
WORKLET = os.path.join(ROOT, 'src', 'assets', 'worklets', 'rhythmeight-worklet.js')
TS = os.path.join(ROOT, 'src', 'app', 'daw', 'modules', 'rhythmeight-data.ts')
INST = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cl', 'cp', 'ma', 'cb', 'cy', 'oh', 'ch']

row = re.compile(r'/\*\s*(\w+)\s*\*/\s*\{\s*"(\w+)",\s*"([^"]*)",\s*(\d+),\s*([0-9.]+)f?,\s*"([^"]*)"\s*\}')
params = []
for m in row.finditer(open(PARAMS_CPP, encoding='utf-8').read()):
    enum, pid, name, choices, default, labels = m.groups()
    params.append({'id': pid, 'name': name, 'choices': int(choices), 'def': float(default), 'labels': labels.split('|') if labels else []})
assert len(params) == 36, 'se esperaban 36 parametros, hay %d' % len(params)

def num(v):
    return str(int(v)) if float(v) == int(v) else repr(float(v))

block = ("    // --- BEGIN GENERATED PARAMS (rhythmeight/scripts/gen_web.py: no editar a mano) ---\n"
         "    var PARAM_IDS = [%s];\n    var PARAM_CHOICES = [%s];\n    var PARAM_DEFAULTS = [%s];\n"
         "    // --- END GENERATED PARAMS ---") % (', '.join("'%s'" % p['id'] for p in params), ', '.join(str(p['choices']) for p in params), ', '.join(num(p['def']) for p in params))
src = open(WORKLET, encoding='utf-8').read()
a = src.index('    // --- BEGIN GENERATED PARAMS')
b = src.index('    // --- END GENERATED PARAMS ---') + len('    // --- END GENERATED PARAMS ---')
open(WORKLET, 'w', encoding='utf-8').write(src[:a] + block + src[b:])

presets = json.load(open(PRESETS, encoding='utf-8'))
ids = {p['id'] for p in params}
with open(TS, 'w', encoding='utf-8') as f:
    f.write('// Generado por rhythmeight/scripts/gen_web.py desde el motor del plugin (re_params.cpp) y rhythmeight/presets/re-presets.json: no editar a mano.\n\n')
    f.write("import { SynthParam, SynthPreset } from './worklet-synth.module';\n\n")
    f.write("/** Un sonido de la caja de ritmos: los controles y el patron (un texto de 16 caracteres por instrumento: '.', 'x' golpe, 'X' acento). */\n")
    f.write('export interface DrumPreset extends SynthPreset {\n    pattern: { [inst: string]: string };\n}\n\n')
    f.write("export const RE_INSTRUMENTS: ReadonlyArray<string> = [%s];\n\n" % ', '.join("'%s'" % i for i in INST))
    f.write('export const RE_PARAMS: ReadonlyArray<SynthParam> = [\n')
    for p in params:
        f.write("    { id: '%s', name: '%s', choices: %d, def: %s, labels: [%s] },\n" % (p['id'], p['name'], p['choices'], num(p['def']), ', '.join("'%s'" % l.replace("'", "\\'") for l in p['labels'])))
    f.write('];\n\nexport const RE_PRESETS: ReadonlyArray<DrumPreset> = [\n')
    for p in presets:
        for k in p['values']:
            assert k in ids, 'control desconocido %r' % k
        pat = ', '.join("%s: '%s'" % (k, v) for k, v in p['pattern'].items())
        f.write("    { name: '%s', category: '%s', values: { %s }, pattern: { %s } },\n" % (p['name'], p['category'], ', '.join('%s: %s' % (k, num(v)) for k, v in p['values'].items()), pat))
    f.write('];\n')
print('%d parametros y %d sonidos -> worklet y rhythmeight-data.ts' % (len(params), len(presets)))
