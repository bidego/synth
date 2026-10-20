#!/usr/bin/env python3
"""Genera los datos de Acid Line para la version web (Syntotec) desde el motor C++ (ac_params.cpp) y los sonidos (ac-presets.json):
el bloque de parametros de src/assets/worklets/acid-worklet.js y src/app/daw/modules/acid-data.ts.

    python3 acidline/scripts/gen_web.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
PARAMS_CPP = os.path.join(HERE, '..', 'engine', 'ac_params.cpp')
PRESETS = os.path.join(HERE, '..', 'presets', 'ac-presets.json')
WORKLET = os.path.join(ROOT, 'src', 'assets', 'worklets', 'acid-worklet.js')
TS = os.path.join(ROOT, 'src', 'app', 'daw', 'modules', 'acid-data.ts')

row = re.compile(r'/\*\s*(\w+)\s*\*/\s*\{\s*"(\w+)",\s*"([^"]*)",\s*(\d+),\s*([0-9.]+)f?,\s*"([^"]*)"\s*\}')
params = []
for m in row.finditer(open(PARAMS_CPP, encoding='utf-8').read()):
    enum, pid, name, choices, default, labels = m.groups()
    params.append({'id': pid, 'name': name, 'choices': int(choices), 'def': float(default), 'labels': labels.split('|') if labels else []})
assert len(params) == 11, 'se esperaban 11 parametros, hay %d' % len(params)

def num(v):
    return str(int(v)) if float(v) == int(v) else repr(float(v))

block = ("    // --- BEGIN GENERATED PARAMS (acidline/scripts/gen_web.py: no editar a mano) ---\n"
         "    var PARAM_IDS = [%s];\n    var PARAM_CHOICES = [%s];\n    var PARAM_DEFAULTS = [%s];\n"
         "    // --- END GENERATED PARAMS ---") % (', '.join("'%s'" % p['id'] for p in params), ', '.join(str(p['choices']) for p in params), ', '.join(num(p['def']) for p in params))
src = open(WORKLET, encoding='utf-8').read()
a = src.index('    // --- BEGIN GENERATED PARAMS')
b = src.index('    // --- END GENERATED PARAMS ---') + len('    // --- END GENERATED PARAMS ---')
open(WORKLET, 'w', encoding='utf-8').write(src[:a] + block + src[b:])

presets = json.load(open(PRESETS, encoding='utf-8'))
ids = {p['id'] for p in params}
with open(TS, 'w', encoding='utf-8') as f:
    f.write('// Generado por acidline/scripts/gen_web.py desde el motor del plugin (ac_params.cpp) y acidline/presets/ac-presets.json: no editar a mano.\n\n')
    f.write("import { SynthParam, SynthPreset } from './worklet-synth.module';\n\n")
    f.write('export const AC_PARAMS: ReadonlyArray<SynthParam> = [\n')
    for p in params:
        f.write("    { id: '%s', name: '%s', choices: %d, def: %s, labels: [%s] },\n" % (p['id'], p['name'], p['choices'], num(p['def']), ', '.join("'%s'" % l for l in p['labels'])))
    f.write('];\n\nexport const AC_PRESETS: ReadonlyArray<SynthPreset> = [\n')
    for p in presets:
        for k in p['values']:
            assert k in ids, 'control desconocido %r' % k
        f.write("    { name: '%s', category: '%s', values: { %s } },\n" % (p['name'], p['category'], ', '.join('%s: %s' % (k, num(v)) for k, v in p['values'].items())))
    f.write('];\n')
print('%d parametros y %d sonidos -> worklet y acid-data.ts' % (len(params), len(presets)))
