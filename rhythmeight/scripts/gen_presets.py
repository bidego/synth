#!/usr/bin/env python3
"""Genera engine/re_presets.inc (C++) desde presets/re-presets.json, la unica fuente de los sonidos y patrones de Rhythm Eight."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'presets', 're-presets.json')
OUT = os.path.join(HERE, '..', 'engine', 're_presets.inc')
PARAMS_H = os.path.join(HERE, '..', 'engine', 're_params.h')

# id del control -> nombre en el enum de re_params.h (en el mismo orden)
header = open(PARAMS_H, encoding='utf-8').read()
body = header[header.index('enum ParamId {'):header.index('NumParams')]
ENUM = [e for e in re.findall(r'\b([A-Z][A-Za-z]+)\b', re.sub(r'//[^\n]*', '', body.split('{', 1)[1]))]
IDS = {e[0].lower() + e[1:]: e for e in ENUM}
INST = ['bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cl', 'cp', 'ma', 'cb', 'cy', 'oh', 'ch']

presets = json.load(open(SRC, encoding='utf-8'))
names = set()
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Generado por rhythmeight/scripts/gen_presets.py desde rhythmeight/presets/re-presets.json: no editar a mano.\n')
    for p in presets:
        assert p['name'] not in names, 'nombre repetido: ' + p['name']
        names.add(p['name'])
        for k in p['values']:
            assert k in IDS, 'control desconocido %r en %r' % (k, p['name'])
        for k, s in p['pattern'].items():
            assert k in INST, 'instrumento desconocido %r en %r' % (k, p['name'])
            assert len(s) == 16 and set(s) <= set('.xX'), 'patron invalido %r en %r' % (s, p['name'])
        vals = ', '.join('{%s, %s}' % (IDS[k], ('%gf' % v) if float(v) != int(v) else str(int(v))) for k, v in p['values'].items())
        pats = ', '.join('"%s"' % p['pattern'].get(i, '') for i in INST)
        f.write('    { "%s", "%s", { %s }, { %s } },\n' % (p['name'], p['category'], vals, pats))
print('%d sonidos -> %s' % (len(presets), os.path.relpath(OUT, os.path.join(HERE, '..'))))
