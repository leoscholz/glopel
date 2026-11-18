#!/usr/bin/env python3
"""Relatórios do Sistema Globo — gera d['rel'] dentro do cofre.

Hoje: relatório 'vendas' (histórico 2017→hoje), a partir do relatório
"Vendas por Período" do Start já limpo (um pedido por linha):
    _privado/vendas_limpo.csv   (colunas: data;ano;mes;pedido;origem;cliente_original;
                                 cliente_normalizado;vendedor;total;vale_troca;acrescimo;desconto;recebido)

Uso (na pasta sistema/):
    GLOPEL_SENHA='...' python3 cofre.py abrir
    python3 relatorios.py _privado/vendas_limpo.csv "17/11/2026"
    GLOPEL_SENHA='...' python3 cofre.py fechar

O 2º argumento é a data de corte do export (último dia completo).
"""
import csv, json, sys, collections
from pathlib import Path

AQUI = Path(__file__).parent
DADOS = AQUI / '_privado' / 'dados.json'


def vend(v):
    if 'EDSON' in v: return 'EDSON'
    if v.startswith('DAIANE'): return 'DAIANE'
    return v.split()[0] if v else '—'


def vendas(caminho, corte):
    dd, mm, yy = corte.split('/')
    md_corte = int(mm) * 100 + int(dd)
    ano_corte = int(yy)
    linhas = list(csv.DictReader(open(caminho, encoding='utf-8-sig'), delimiter=';'))
    if len(linhas) < 10000:
        sys.exit(f'Só {len(linhas)} pedidos — export incompleto?')
    num = lambda s: float(s.replace(',', '.'))
    anos = sorted({int(r['ano']) for r in linhas})
    A = {y: dict(t=0.0, n=0, c=set(), ytd=0.0, ytdn=0) for y in anos}
    M = collections.defaultdict(float)
    C = collections.defaultdict(lambda: collections.defaultdict(float))
    V = collections.defaultdict(float); VC = collections.defaultdict(set)
    K = collections.defaultdict(float); KC = collections.defaultdict(set)
    for r in linhas:
        y, m = int(r['ano']), int(r['mes'])
        d0, m0, _ = r['data'].split('/')
        if y == ano_corte and int(m0) * 100 + int(d0) > md_corte:
            continue
        t = num(r['total']); c = r['cliente_normalizado']; v = vend(r['vendedor'])
        a = A[y]; a['t'] += t; a['n'] += 1; a['c'].add(c)
        if int(m0) * 100 + int(d0) <= md_corte: a['ytd'] += t; a['ytdn'] += 1
        M[(y, m)] += t; C[c][y] += t
        V[(v, y)] += t; VC[(v, y)].add(c)
        if 'KALZON' in c or 'CALZON' in c: K[y] += t; KC[y].add(c)
    ult, pen = anos[-1], anos[-2]
    proj = A[ult]['ytd'] * A[pen]['t'] / A[pen]['ytd']
    vs = sorted({k[0] for k in V}, key=lambda v: -sum(V[(v, y)] for y in anos))
    conc = {}
    for y in anos:
        tp = sorted((C[c][y] for c in C), reverse=True); tot = sum(tp)
        conc[y] = [round(100 * sum(tp[:10]) / tot, 1), round(100 * sum(tp[:20]) / tot, 1)]
    ref = anos[anos.index(ult) - 3] if len(anos) > 3 else anos[0]   # 3 anos antes do atual
    perd = [c for c in C if C[c][ref] > 0 and C[c][ult] == 0]
    novos = [c for c in C if C[c][ult] > 0 and all(C[c][y] == 0 for y in anos if y < pen)]
    R = lambda x: round(x, 2)
    return {
        'titulo': f'Vendas {anos[0]}–{ult}',
        'fonte': 'Start › Vendas por Período (Total da Venda; pedidos e faturas, todas as situações)',
        'corte': f'{yy}-{mm}-{dd}', 'pedidos': len(linhas),
        'anos': anos,
        'ano': [[y, R(A[y]['t']), A[y]['n'], len(A[y]['c']), R(A[y]['ytd']), A[y]['ytdn']] for y in anos],
        'proj': R(proj),
        'mes': [[R(M[(y, m)]) for m in range(1, 13)] for y in anos],
        'vend': [[v] + [R(V[(v, y)]) for y in anos] + [[len(VC[(v, y)]) for y in anos]] for v in vs],
        'kalzone': [[y, R(K[y]), len(KC[y])] for y in anos],
        'conc': [[y] + conc[y] for y in anos],
        'perdidos': [ref, len(perd), R(sum(C[c][ref] for c in perd))],
        'novos': [pen, len(novos), R(sum(C[c][ult] for c in novos))],
        # todos os clientes: nome + valor por ano (inteiro)
        'cli': sorted(([c] + [round(C[c][y]) for y in anos] for c in C if c),
                      key=lambda x: -sum(x[1:])),
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    d = json.loads(DADOS.read_text())
    rel = d.get('rel') or {}
    rel['vendas'] = vendas(sys.argv[1], sys.argv[2])
    d['rel'] = rel
    DADOS.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    v = rel['vendas']
    print(f"rel.vendas: {v['pedidos']} pedidos, {len(v['cli'])} clientes, anos {v['anos'][0]}–{v['anos'][-1]}, projeção {v['proj']:,.0f}")
