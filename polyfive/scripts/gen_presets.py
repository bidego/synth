#!/usr/bin/env python3
"""Genera engine/pf_presets.inc (C++) desde presets/pf-presets.json, la unica fuente de los sonidos del Poly Five."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'presets', 'pf-presets.json')
OUT = os.path.join(HERE, '..', 'engine', 'pf_presets.inc')

# id del control -> nombre en el enum de pf_params.h (en el mismo orden)
ENUM = ['AOct','ATune','APw','ASaw','APulse','Sync','BOct','BFreq','BFine','BPw','BSaw','BTri','BPulse','BLow','BKbd','PmEnv','PmB','PmFreqA','PmPwA','PmFilter','MixA','MixB','MixNoise','Cutoff','Resonance','EnvAmt','KbdTrack','FAtk','FDec','FSus','FRel','AAtk','ADec','ASus','ARel','LfoFreq','LfoShape','LfoAmt','WmMix','WmFreqA','WmFreqB','WmPwA','WmPwB','WmFilter','ModWheel','Glide','GlideOn','Unison','Tune','Volume','Velocity']
IDS = {e[0].lower() + e[1:]: e for e in ENUM}

presets = json.load(open(SRC, encoding='utf-8'))
names = set()
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Generado por polyfive/scripts/gen_presets.py desde polyfive/presets/pf-presets.json: no editar a mano.\n')
    for p in presets:
        assert p['name'] not in names, 'nombre repetido: ' + p['name']
        names.add(p['name'])
        for k in p['values']:
            assert k in IDS, 'control desconocido %r en %r' % (k, p['name'])
        vals = ', '.join('{%s, %s}' % (IDS[k], ('%gf' % v) if float(v) != int(v) else str(int(v))) for k, v in p['values'].items())
        f.write('    { "%s", "%s", { %s } },\n' % (p['name'], p['category'], vals))
print('%d sonidos -> %s' % (len(presets), os.path.relpath(OUT, os.path.join(HERE, '..'))))
