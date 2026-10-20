#!/usr/bin/env python3
"""Genera engine/md_presets.inc (C++) desde presets/md-presets.json, la unica fuente de los sonidos del Model D."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'presets', 'md-presets.json')
OUT = os.path.join(HERE, '..', 'engine', 'md_presets.inc')

# id del control -> nombre en el enum de md_params.h (en el mismo orden)
ENUM = ['Tune', 'Glide', 'GlideOn', 'ModMix', 'ModWheel', 'Osc1Range', 'Osc1Wave', 'Osc2Range', 'Osc2Tune', 'Osc2Wave', 'Osc3Range', 'Osc3Tune',
        'Osc3Wave', 'Osc3Kbd', 'Osc1On', 'Osc2On', 'Osc3On', 'NoiseOn', 'Vol1', 'Vol2', 'Vol3', 'VolNoise', 'NoiseType', 'Cutoff', 'Emphasis',
        'ContourAmt', 'FAtk', 'FDec', 'FSus', 'LAtk', 'LDec', 'LSus', 'Kbd1', 'Kbd2', 'DecayOn', 'OscMod', 'FiltMod', 'Volume', 'A440', 'Velocity']
IDS = {e[0].lower() + e[1:]: e for e in ENUM}

presets = json.load(open(SRC, encoding='utf-8'))
names = set()
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Generado por modeld/scripts/gen_presets.py desde modeld/presets/md-presets.json: no editar a mano.\n')
    for p in presets:
        assert p['name'] not in names, 'nombre repetido: ' + p['name']
        names.add(p['name'])
        for k in p['values']:
            assert k in IDS, 'control desconocido %r en %r' % (k, p['name'])
        vals = ', '.join('{%s, %s}' % (IDS[k], ('%gf' % v) if float(v) != int(v) else str(int(v))) for k, v in p['values'].items())
        f.write('    { "%s", "%s", { %s } },\n' % (p['name'], p['category'], vals))
print('%d sonidos -> %s' % (len(presets), os.path.relpath(OUT, os.path.join(HERE, '..'))))
