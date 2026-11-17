#!/usr/bin/env python3
"""Leva Produção e Máquinas agora (planilha da Secretaria) para dentro do cofre.

Entrada: dois JSON salvos do conector Google Sheets (get_values), formato {"values":[[...],...]}:
    _privado/producao_raw.json  ← 'Produção'!A1:L2000
    _privado/maquinas_raw.json  ← 'Máquinas agora'!A1:F30
Uso (na pasta sistema/):
    GLOPEL_SENHA='...' python3 cofre.py abrir
    python3 producao.py            # grava d['prod'] em _privado/dados.json
    GLOPEL_SENHA='...' python3 cofre.py fechar
"""
import json, re, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

P = Path(__file__).parent / '_privado'
BRT = timezone(timedelta(hours=-3))


def vals(nome):
    d = json.loads((P / nome).read_text())
    d = d.get('content', d)
    return d.get('values', [])


def iso(data, hora=''):
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', data or '')
    if not m:
        return ''
    s = f'{m[3]}-{m[2]}-{m[1]}'
    h = re.search(r'(\d{1,2}):(\d{2})', hora or '')
    return s + (f'T{int(h[1]):02d}:{h[2]}' if h else '')


def cel(r, i):
    return (r[i] if i < len(r) else '').strip()


ev = []
for r in vals('producao_raw.json')[1:]:
    if not cel(r, 0):
        continue
    ev.append({'t': iso(cel(r, 0), cel(r, 1)), 'aut': cel(r, 2), 'maq': cel(r, 3), 'serv': cel(r, 4),
               'ev': cel(r, 5).upper().split()[0] if cel(r, 5) else 'OUTRO', 'qtd': cel(r, 6), 'dur': cel(r, 7),
               'obs': cel(r, 8), 'msg': cel(r, 9), 'cli': cel(r, 10), 'foto': cel(r, 11)})
ev.sort(key=lambda e: e['t'])

maq = []
for r in vals('maquinas_raw.json')[1:]:
    if not cel(r, 0):
        continue
    maq.append({'maq': cel(r, 0), 'status': cel(r, 1), 'serv': cel(r, 2),
                'desde': iso(cel(r, 3), cel(r, 3)[10:]), 'op': cel(r, 4), 'atual': cel(r, 5)})

if len(ev) < 10 or not maq:
    sys.exit(f'Poucos dados ({len(ev)} eventos, {len(maq)} máquinas) — nada gravado.')

f = P / 'dados.json'
d = json.loads(f.read_text())
agora = datetime.now(BRT).strftime('%Y-%m-%dT%H:%M')
d['prod'] = {'atualizado': agora, 'eventos': ev, 'maquinas': maq}
f.write_text(json.dumps(d, ensure_ascii=False))
print(f'prod: {len(ev)} eventos ({ev[0]["t"][:10]} a {ev[-1]["t"][:10]}), {len(maq)} máquinas, retrato {agora}')
