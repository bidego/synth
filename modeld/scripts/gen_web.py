#!/usr/bin/env python3
"""Genera los datos del Model D para la version web (Syntotec) desde el motor C++ (md_params.cpp) y los sonidos (md-presets.json):

  - el bloque de parametros de src/assets/worklets/modeld-worklet.js
  - src/app/daw/modules/modeld-data.ts (parametros y sonidos para el modulo y el panel)

    python3 modeld/scripts/gen_web.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
PARAMS_CPP = os.path.join(HERE, '..', 'engine', 'md_params.cpp')
PRESETS = os.path.join(HERE, '..', 'presets', 'md-presets.json')
WORKLET = os.path.join(ROOT, 'src', 'assets', 'worklets', 'modeld-worklet.js')
TS = os.path.join(ROOT, 'src', 'app', 'daw', 'modules', 'modeld-data.ts')

row = re.compile(r'/\*\s*(\w+)\s*\*/\s*\{\s*"(\w+)",\s*"([^"]*)",\s*(\d+),\s*([0-9.]+)f?,\s*"([^"]*)"\s*\}')
params = []
for m in row.finditer(open(PARAMS_CPP, encoding='utf-8').read()):
    enum, pid, name, choices, default, labels = m.groups()
    params.append({'id': pid, 'name': name, 'choices': int(choices), 'def': float(default), 'labels': labels.split('|') if labels else []})
assert len(params) == 40, 'se esperaban 40 parametros, hay %d' % len(params)

def num(v):
    return str(int(v)) if float(v) == int(v) else repr(float(v))

block = ("    // --- BEGIN GENERATED PARAMS (modeld/scripts/gen_web.py: no editar a mano) ---\n"
         "    var PARAM_IDS = [%s];\n"
         "    var PARAM_CHOICES = [%s];\n"
         "    var PARAM_DEFAULTS = [%s];\n"
         "    // --- END GENERATED PARAMS ---") % (
             ', '.join("'%s'" % p['id'] for p in params),
             ', '.join(str(p['choices']) for p in params),
             ', '.join(num(p['def']) for p in params))
src = open(WORKLET, encoding='utf-8').read()
a = src.index('    // --- BEGIN GENERATED PARAMS')
b = src.index('    // --- END GENERATED PARAMS ---') + len('    // --- END GENERATED PARAMS ---')
open(WORKLET, 'w', encoding='utf-8').write(src[:a] + block + src[b:])

presets = json.load(open(PRESETS, encoding='utf-8'))
ids = {p['id'] for p in params}
with open(TS, 'w', encoding='utf-8') as f:
    f.write('// Generado por modeld/scripts/gen_web.py desde el motor del plugin (md_params.cpp) y modeld/presets/md-presets.json: no editar a mano.\n\n')
    f.write('export interface MdParam {\n    id: string;\n    name: string;\n    choices: number;   // 0 = perilla 0..1; N = selector o interruptor de N posiciones\n    def: number;\n    labels: Array<string>;\n}\n\n')
    f.write('export interface MdPreset {\n    name: string;\n    category: string;\n    values: { [id: string]: number };\n}\n\n')
    f.write('export const MD_PARAMS: ReadonlyArray<MdParam> = [\n')
    for p in params:
        f.write("    { id: '%s', name: '%s', choices: %d, def: %s, labels: [%s] },\n" % (p['id'], p['name'], p['choices'], num(p['def']), ', '.join("'%s'" % l.replace("'", "\\'") for l in p['labels'])))
    f.write('];\n\nexport const MD_PRESETS: ReadonlyArray<MdPreset> = [\n')
    for p in presets:
        for k in p['values']:
            assert k in ids, 'control desconocido %r' % k
        f.write("    { name: '%s', category: '%s', values: { %s } },\n" % (p['name'], p['category'], ', '.join('%s: %s' % (k, num(v)) for k, v in p['values'].items())))
    f.write('];\n')
print('%d parametros y %d sonidos -> worklet y modeld-data.ts' % (len(params), len(presets)))
