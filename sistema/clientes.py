#!/usr/bin/env python3
"""Clientes do Sistema Globo — põe a base de clientes e os pedidos desde 2024 dentro do cofre.

Fonte: planilha `_base_clientes_2026-11-16` (id 1C4ec3enL21Lqkn-whfO_pI4cKgBxlgKhqQ92ui7PbEY),
abas `Clientes` (A1:AB) e `Pedidos_2024+` (A1:I), lidas pelo conector Google Sheets (get_values)
e salvas em _privado/clientes_raw.json e _privado/pedidos_raw.json.

Uso (na pasta sistema/, com o cofre aberto):
    python3 clientes.py      # grava d['cli'] em _privado/dados.json

Formato compacto (as colunas ficam em d['cli']['colC'] e d['cli']['colP']).
Dado pessoal (CPF, telefone) só vive cifrado no cofre — nunca em texto no repositório.
"""
import json
from pathlib import Path

AQUI = Path(__file__).parent / '_privado'
EMP_C = {'Globo+Impressos': 0, 'Globo': 1, 'Impressos': 2}
EMP_P = {'Globo': 0, 'Impressos': 1}
REC = {'Quitado': 0, 'Aguardando': 1}


def num(v):
    v = str(v or '').strip().replace('.', '').replace(',', '.') if ',' in str(v or '') else str(v or '').strip()
    if v == '':
        return None
    f = float(v)
    return int(f) if f == int(f) else round(f, 2)


def tabela(nome):
    vals = json.loads((AQUI / nome).read_text())['values']
    h = vals[0]
    return [dict(zip(h, r + [''] * (len(h) - len(r)))) for r in vals[1:]]


def main():
    C, P = tabela('clientes_raw.json'), tabela('pedidos_raw.json')
    if len(C) < 1000 or len(P) < 1000:
        raise SystemExit(f'Poucas linhas ({len(C)} clientes, {len(P)} pedidos) — leitura incompleta?')
    vend = sorted({r['vendedor'] for r in C if r['vendedor']} | {r['vendedor'] for r in P if r['vendedor']})
    vi = {v: i for i, v in enumerate(vend)}
    ci = {r['chave']: i for i, r in enumerate(C)}
    linhas = []
    for r in C:
        nome = r['nome'].strip()
        razao = r['razao_social'].strip()
        nomes = r['nomes_no_start'].strip()
        linhas.append([
            r['chave'], EMP_C.get(r['empresa'], 0), nome,
            razao if razao and razao.upper() != nome.upper() else '',
            r['tipo'], r['cnpj_cpf'], r['cidade'], r['uf'], r['bairro'],
            r['telefone'], r['celular'], r['email'],
            vi.get(r['vendedor'], -1), num(r['pedidos']) or 0, r['primeiro'], r['ultimo'],
            num(r['ciclo_dias']), r['situacao'], num(r['pedidos_12m']) or 0,
            num(r['valor_12m']) or 0, num(r['valor_total']) or 0, num(r['ticket_medio']),
            num(r['aguardando_receb']) or 0, r['cadastrado'], 1 if r['sem_cadastro'] else 0,
            nomes if nomes and nomes != nome.upper() else '',
        ])
    peds = []
    for r in P:
        peds.append([ci[r['chave']], EMP_P.get(r['empresa'], 0), num(r['pedido']), r['data'],
                     vi.get(r['vendedor'], -1), num(r['total']) or 0,
                     1 if r['entrega'] == 'Entregue' else 0, REC.get(r['recebimento'], 2)])
    peds.sort(key=lambda x: x[3], reverse=True)
    d = json.loads((AQUI / 'dados.json').read_text())
    d['cli'] = {
        'atualizado': max(x[3] for x in peds),
        'fonte': 'Start — exports de 16-11-2026 (Clientes + Pedidos de Venda), base gerada em 17-11',
        'colC': ['chave', 'emp', 'nome', 'razao', 'tipo', 'doc', 'cidade', 'uf', 'bairro', 'tel', 'cel',
                 'email', 'vend', 'ped', 'primeiro', 'ultimo', 'ciclo', 'sit', 'ped12', 'val12', 'valtot',
                 'ticket', 'aguard', 'cadastrado', 'semcad', 'nomes'],
        'colP': ['cli', 'emp', 'num', 'data', 'vend', 'total', 'entregue', 'rec'],
        'vend': vend, 'c': linhas, 'p': peds,
    }
    (AQUI / 'dados.json').write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    print(f"cli: {len(linhas)} clientes, {len(peds)} pedidos ({min(x[3] for x in peds)} a {d['cli']['atualizado']}), "
          f"{len(json.dumps(d['cli'], ensure_ascii=False, separators=(',', ':'))):,} bytes")


if __name__ == '__main__':
    main()
