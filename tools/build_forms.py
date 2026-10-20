#!/usr/bin/env python3
"""Builds public/forms.json (the canonical form catalogue) from PokeAPI's CSV data.
usage: build_forms.py pokemon.csv out.json
The catalogue lists forms that exist in the Pokemon series. It does NOT say a form is available in GO."""
import csv, json, sys, re
rows = list(csv.DictReader(open(sys.argv[1])))
species_name = {r['species_id']: r['identifier'] for r in rows if r['is_default'] == '1'}
LABEL = {'alola':'Alolan','galar':'Galarian','hisui':'Hisuian','paldea':'Paldean','mega':'Mega','mega-x':'Mega X','mega-y':'Mega Y',
         'primal':'Primal','gmax':'Gigantamax','origin':'Origin','therian':'Therian','black':'Black','white':'White'}
GROUP = {'alola':'regional','galar':'regional','hisui':'regional','paldea':'regional','mega':'mega','primal':'mega','gmax':'gmax'}
out = []
for r in rows:
    if r['is_default'] == '1': continue
    sid = r['species_id']
    if int(sid) > 1025 or sid not in species_name: continue
    base = species_name[sid]
    if not r['identifier'].startswith(base + '-'): continue
    key = r['identifier'][len(base) + 1:]
    head = key.split('-')[0]
    if head not in LABEL: continue
    if head == 'mega' and key not in ('mega', 'mega-x', 'mega-y'): continue
    if head == 'gmax' and key != 'gmax': continue
    label = LABEL.get(key) or ' '.join(w.capitalize() for w in key.split('-'))
    if head in ('alola', 'galar', 'hisui', 'paldea') and key != head:
        label = LABEL[head] + ' ' + ' '.join(w.capitalize() for w in key.split('-')[1:])
    out.append([int(sid), key, label, GROUP.get(head, 'other')])
out.sort(key=lambda x: (x[0], x[1]))
json.dump({'v': 1, 'source': 'PokeAPI CSV (series catalogue, not GO availability)', 'f': out}, open(sys.argv[2], 'w'), separators=(',', ':'))
print(len(out), 'forms')
