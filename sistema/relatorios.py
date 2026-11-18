#!/usr/bin/env python3
"""Relatórios do Sistema Globo — lê os CSVs brutos do Start e grava d['rel'] dentro do cofre.

Relatório 'vendas' (histórico 2017→hoje), por empresa e somado (Grupo), a partir de:
  --periodo   Start › Vendas por Período (01/01/2017 até ontem)         → pedidos
  --produtos  Start › Vendas por Produto, um CSV por categoria (mesmo período) → itens

Uso (na pasta sistema/) — repita o bloco --empresa para cada empresa:
    GLOPEL_SENHA='...' python3 cofre.py abrir
    python3 relatorios.py --corte 17/11/2026 \
        --empresa "Embalagens Globo" --periodo Globo_Periodo.csv --produtos Globo_Produto_*.csv \
        --empresa "Globo Impressos"  --periodo Impressos_Periodo.csv --produtos Impressos_Produto_*.csv
    GLOPEL_SENHA='...' python3 cofre.py fechar

Grava d['rel']['vendas'] = {'emps': [nomes], 'por': {nome: relatório, 'Grupo': soma (se houver 2+)}}.

--corte = último dia completo do export. O nome da categoria vem do nome do arquivo
(tudo depois da data, ex. ..._18-11-2026_sacos.csv → "sacos").
Os CSVs do Start são Latin-1, separados por ';', com o layout das colunas mudando
ao longo do arquivo: o parser lê pelo conteúdo das células, não pela posição.
Cada arquivo é conferido contra os totais do próprio Start (Total Geral / totais
diários / Resumo de cada produto); se não bater, o script para.
"""
import argparse, csv, json, re, sys, collections
from pathlib import Path

AQUI = Path(__file__).parent
DADOS = AQUI / '_privado' / 'dados.json'
isI = lambda x: re.fullmatch(r'\d+', x) is not None
isN = lambda x: re.fullmatch(r'-?[\d.]+,\d+', x) is not None
isD = lambda x: re.fullmatch(r'\d\d/\d\d/\d{4}', x) is not None
num = lambda s: float(s.replace('.', '').replace(',', '.'))
CAB = ('EMBALAGENS GLOBO', 'Emitido', 'Página', 'Período', 'Situação', 'Vendas por', '*(Origem',
       'https', 'Start', 'Categoria', 'Ordenar', 'Vendedor:')
KALZ = ('G34 1/2 KG', 'G34  MINIKALZONE', 'G34 MINIKALZONE')   # sacos da rede Kalzone


def norm(c):
    c = c.upper()
    c = re.sub(r'\*+.*$', '', c)
    c = re.sub(r'\b(ENT(REGA)?\.? ?DIF(ER)?\.?|END\.? ?DIF\.?|DIF\.?|OK|AVISTA)\b', '', c)
    c = re.sub(r'[%*#]', '', c)
    return re.sub(r'\s+', ' ', c).strip(' .-')


def linhas(fn):
    return list(csv.reader(open(fn, encoding='latin1'), delimiter=';'))


def ler_periodo(fn):
    out, date, last, daytot, ccol, vcol, fim, geral = [], None, None, {}, None, None, False, None
    for r in linhas(fn):
        nz = [(i, c.strip()) for i, c in enumerate(r) if c.strip()]
        if not nz: continue
        v = [c for _, c in nz]
        if v[0] == 'Data:': date = v[1]; continue
        if v[0] == 'Total do dia:':
            daytot[[c for c in v if isD(c)][0]] = num([c for c in v if isN(c)][0]); continue
        if v[0] == 'Total Geral': geral = num([c for c in v if isN(c)][0]); fim = True
        if fim: continue
        k = 1 if v[0] in ('P', 'F') else 0
        if len(v) > k + 2 and isI(v[k]) and isI(v[k + 1]):
            rest = nz[k + 2:]
            tx = [(i, c) for i, c in rest if not isN(c)]
            ns = [num(c) for i, c in rest if isN(c)] + [0] * 5
            cli, ven = (tx + [(None, '')] * 2)[:2]
            ccol, vcol = cli[0], ven[0]
            last = dict(data=date, cli=cli[1], vend=ven[1], total=ns[0], rec=ns[4]); out.append(last); continue
        if len(nz) == 1 and last and not v[0].startswith(CAB):
            i, c = nz[0]
            if i == ccol: last['cli'] += ' ' + c
            elif i == vcol: last['vend'] += ' ' + c
    s = collections.defaultdict(float)
    for o in out: s[o['data']] += o['total']
    bad = [d for d in set(s) | set(daytot) if abs(daytot.get(d, 0) - s[d]) > 0.01]
    if bad or geral is None or abs(geral - sum(s.values())) > 0.05:
        sys.exit(f'Período não confere com o Start: {len(bad)} dias diferentes, total {geral} vs {sum(s.values()):.2f}')
    print(f'período: {len(out)} pedidos, R$ {geral:,.2f} conferido')
    return out


def ler_produtos(fn, cat):
    out, prod, tot, res, geral = [], None, collections.defaultdict(float), {}, None
    for r in linhas(fn):
        v = [x.strip() for x in r if x.strip()]
        if not v: continue
        if v[0] == 'Produto:': prod = v[1]; continue
        if v[0] == 'Resumo Geral:': geral = num(v[-1]); continue
        if v[0] == 'Resumo de:':
            if 'Total:' in v and v.index('Total:') + 1 < len(v): res[prod] = num(v[v.index('Total:') + 1])
            continue
        if isD(v[0]) and len(v) >= 12 and isI(v[1]):
            n = [num(x) for x in v[-9:]]
            out.append(dict(cat=cat, prod=prod, data=v[0], cli=' '.join(v[2:-9]), qtd=n[2], total=n[8]))
            tot[prod] += n[8]
    bad = [p for p in res if abs(res[p] - tot[p]) > 0.05]
    if bad or geral is None or abs(geral - sum(tot.values())) > 0.05:
        sys.exit(f'{fn}: não confere com o Start ({len(bad)} produtos; total {geral} vs {sum(tot.values()):.2f})')
    print(f'{cat}: {len(out)} itens, {len(res)} produtos, R$ {geral:,.2f} conferido')
    return out


def vend(v):
    if 'EDSON' in v: return 'EDSON'
    if v.startswith('DAIANE'): return 'DAIANE'
    return v.split()[0] if v else '—'


def ymd(s):
    d, m, y = s.split('/'); return int(y), int(m), int(m) * 100 + int(d)


def rel_vendas(ped, itens, corte):
    yc, _, mdc = ymd(corte)
    ped = [o for o in ped if not (ymd(o['data'])[0] == yc and ymd(o['data'])[2] > mdc)]
    itens = [o for o in itens if not (ymd(o['data'])[0] == yc and ymd(o['data'])[2] > mdc)]
    anos = sorted({ymd(o['data'])[0] for o in ped})
    A = {y: dict(t=0.0, n=0, c=set(), ytd=0.0, ytdn=0) for y in anos}
    M = collections.defaultdict(float)
    C = collections.defaultdict(lambda: collections.defaultdict(float))
    V = collections.defaultdict(float); VC = collections.defaultdict(set)
    K = collections.defaultdict(float); KC = collections.defaultdict(set)
    for o in ped:
        y, m, md = ymd(o['data']); t = o['total']; c = norm(o['cli']); v = vend(o['vend'])
        a = A[y]; a['t'] += t; a['n'] += 1; a['c'].add(c)
        if md <= mdc: a['ytd'] += t; a['ytdn'] += 1
        M[(y, m)] += t; C[c][y] += t; V[(v, y)] += t; VC[(v, y)].add(c)
        if 'KALZON' in c or 'CALZON' in c: K[y] += t; KC[y].add(c)
    ult, pen = anos[-1], anos[-2]
    proj = A[ult]['ytd'] * A[pen]['t'] / A[pen]['ytd']
    vs = sorted({k[0] for k in V}, key=lambda v: -sum(V[(v, y)] for y in anos))
    conc = []
    for y in anos:
        tp = sorted((C[c][y] for c in C), reverse=True); tot = sum(tp)
        conc.append([y, round(100 * sum(tp[:10]) / tot, 1), round(100 * sum(tp[:20]) / tot, 1)])
    ref = anos[anos.index(ult) - 3] if len(anos) > 3 else anos[0]
    perd = [c for c in C if C[c][ref] > 0 and C[c][ult] == 0]
    novos = [c for c in C if C[c][ult] > 0 and all(C[c][y] == 0 for y in anos if y < pen)]
    R = lambda x: round(x, 2)
    rel = {
        'titulo': f'Vendas {anos[0]}–{ult}',
        'fonte': 'Start › Vendas por Período e Vendas por Produto (pedidos e faturas, todas as situações)',
        'corte': f'{yc}-{corte[3:5]}-{corte[:2]}', 'pedidos': len(ped), 'anos': anos,
        'ano': [[y, R(A[y]['t']), A[y]['n'], len(A[y]['c']), R(A[y]['ytd']), A[y]['ytdn']] for y in anos],
        'proj': R(proj),
        'mes': [[R(M[(y, m)]) for m in range(1, 13)] for y in anos],
        'vend': [[v] + [R(V[(v, y)]) for y in anos] + [[len(VC[(v, y)]) for y in anos]] for v in vs],
        'kalzone': [[y, R(K[y]), len(KC[y])] for y in anos],
        'conc': conc,
        'perdidos': [ref, len(perd), R(sum(C[c][ref] for c in perd))],
        'novos': [pen, len(novos), R(sum(C[c][ult] for c in novos))],
        'cli': sorted(([c] + [round(C[c][y]) for y in anos] for c in C if c), key=lambda x: -sum(x[1:])),
    }
    if not itens: return rel
    # ---- produtos
    P = collections.defaultdict(float); Q = collections.defaultdict(float)
    PY = collections.defaultdict(float); QY = collections.defaultdict(float)
    CT = collections.defaultdict(float); info = {}
    for o in itens:
        y, _, md = ymd(o['data'])
        cod, _, desc = o['prod'].partition(' - ')
        cod = re.sub(r'\s+', ' ', cod.strip()); desc = re.sub(r'\s*-\s*Cód\. Barra:.*$', '', desc).strip()
        info.setdefault(cod, (desc, o['cat']))
        P[(cod, y)] += o['total']; Q[(cod, y)] += o['qtd']; CT[(o['cat'], y)] += o['total']
        if md <= mdc: PY[(cod, y)] += o['total']; QY[(cod, y)] += o['qtd']
    cods = sorted(info, key=lambda p: -sum(P[(p, y)] for y in anos))
    base = max(anos[:-1], key=lambda y: A[y]['t'])   # ano-base de preço = ano de pico
    pr = {p: P[(p, base)] / Q[(p, base)] for p in cods if Q[(p, base)] > 0}
    kz = {p for p in cods if p in KALZ}
    vol = []
    for y in anos:
        v = sum(QY[(p, y)] * pr[p] for p in pr); r = sum(PY[(p, y)] for p in pr)
        v2 = sum(QY[(p, y)] * pr[p] for p in pr if p not in kz)
        vol.append([y, R(r), R(v), R(v2)])
    cats = sorted({o['cat'] for o in itens}, key=lambda c: -sum(CT[(c, y)] for y in anos))
    rel['prod'] = {
        'base': base,
        'cobertura': R(sum(CT.values()) / sum(A[y]['t'] for y in anos) * 100),
        'cat': [[c] + [R(CT[(c, y)]) for y in anos] for c in cats],
        'vol': vol,                                   # [ano, faturado até o corte (itens com preço-base), volume a preços do ano-base, idem sem Kalzone]
        'kalz': [[y, R(sum(P[(p, y)] for p in kz)), round(sum(Q[(p, y)] for p in kz))] for y in anos],
        'p': [[p, info[p][0], info[p][1]] + [round(P[(p, y)]) for y in anos] + [[round(Q[(p, y)], 1) for y in anos]]
              for p in cods if any(P[(p, y)] for y in anos)],
    }
    return rel


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--corte' not in args or '--empresa' not in args:
        sys.exit(__doc__)
    corte = args[args.index('--corte') + 1]
    grupos, cur, modo = [], None, None
    for x in args:
        if x == '--empresa': cur = {'nome': None, 'periodo': None, 'produtos': []}; grupos.append(cur); modo = 'nome'
        elif x in ('--periodo', '--produtos'): modo = x[2:]
        elif x == '--corte': modo = 'corte'
        elif modo == 'corte': modo = None
        elif modo == 'nome': cur['nome'] = x; modo = None
        elif modo == 'periodo': cur['periodo'] = x; modo = None
        elif modo == 'produtos': cur['produtos'].append(x)
    por, todos_p, todos_i = {}, [], []
    for g in grupos:
        print('==', g['nome'])
        ped = ler_periodo(g['periodo'])
        itens = []
        for fn in g['produtos']:
            m = re.search(r'\d\d-\d\d-\d{4}_(.+)\.csv$', Path(fn).name)
            itens += ler_produtos(fn, (m.group(1) if m else Path(fn).stem).replace('_', ' '))
        por[g['nome']] = rel_vendas(ped, itens, corte); todos_p += ped; todos_i += itens
    emps = [g['nome'] for g in grupos]
    if len(grupos) > 1:
        tem_itens = all(g['produtos'] for g in grupos)
        por['Grupo'] = rel_vendas(todos_p, todos_i if tem_itens else [], corte)
    d = json.loads(DADOS.read_text())
    d.setdefault('rel', {})['vendas'] = {'emps': emps, 'por': por}
    DADOS.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    for k, v in por.items():
        print(f"{k}: {v['pedidos']} pedidos, {len(v['cli'])} clientes, projeção {v['proj']:,.0f}"
              + (f", {len(v['prod']['p'])} produtos, cobertura {v['prod']['cobertura']}%" if 'prod' in v else ''))
