#!/usr/bin/env python3
"""Gera catalogo_tabela.json (itens da loja sem personalização) a partir das tabelas de preço do Start.
Uso: python3 gera_catalogo.py TABELA_PRECOS_GLOBO_2026.xlsx LAMINAS.xls ENVELOPES.xls
Preço do site = o MAIOR entre Tabela I/II/III × 1,10 (decisão do Leo, 16-11-2026: quem não é cliente paga o mais caro
+10%; o cliente recebe o "desconto" com o cupom do vendedor, que também serve para mapear comissão)."""
import sys, json, re, os, openpyxl, xlrd
XLSX, LAM, ENV = sys.argv[1:4]
FATOR = 1.10
PULA = {'QUANTIDADE MÍNIMA','CONDIÇÕES PAGAMENTO','TABELAS APLICADAS','Planilha5','k35 bandeja'}  # 'k35 bandeja' repete as bobinas
def num(v):
    if isinstance(v,(int,float)): return float(v)
    s=str(v or '').replace('R$','').strip()
    if not s: return None
    s=s.replace('.','').replace(',','.') if ',' in s else s
    try: return float(s)
    except: return None
def limpa(t): return re.sub(r'\s+',' ',str(t)).strip()
itens=[]
def add(linha, categoria_planilha, ident, precos, fonte):
    ps=[p for p in precos if p]
    if not ps: return
    itens.append({'linha':linha, 'cat_tab':limpa(categoria_planilha), 'ident':limpa(ident), 'tab':[round(p,2) if p else None for p in precos],
                  'preco':round(max(ps)*FATOR,2), 'fonte':fonte})
wb=openpyxl.load_workbook(XLSX, data_only=True)
for ws in wb:
    if ws.title in PULA: continue
    linha=ws.title.split()[0].upper()
    for r in ws.iter_rows(values_only=True):
        r=[c for c in r]
        if not r or all(c is None for c in r): continue
        # formatos: Categoria, Identificação, I, II, III   |   Linha, Categoria, Identificação, I, II, III   |   Produto, Identificação, I, II, III
        vals=[num(c) for c in r]
        nums=[i for i,v in enumerate(vals) if v is not None and not isinstance(r[i],str) or (isinstance(r[i],str) and 'R$' in r[i])]
        if len(nums)<3: continue
        i0=nums[-3]; textos=[limpa(c) for c in r[:i0] if c is not None and str(c).strip()]
        if len(textos)<2: continue
        add(linha, textos[-2], textos[-1], [vals[i0],vals[i0+1],vals[i0+2]], os.path.basename(XLSX)+' › '+ws.title)
def xls(path, linha):
    b=xlrd.open_workbook(path)
    for s in b.sheets():
        for i in range(s.nrows):
            r=s.row_values(i); t=[c for c in r if c!='']
            if t and isinstance(t[0],float) and t[0]>1e12:
                nome=limpa(t[2]); 
                if i+1<s.nrows:
                    cont=[c for c in s.row_values(i+1) if c!='']
                    if cont and isinstance(cont[0],float): cont=[]
                    if len(cont)==1 and isinstance(cont[0],str): nome=limpa(nome+' '+cont[0])
                add(linha, 'G34 '+('ENVELOPES ANTIGORDURA' if linha=='G34ENV' else 'LÂMINAS ANTIGORDURA'), t[1], [num(t[3]),num(t[4]),num(t[5])], os.path.basename(path))
                itens[-1]['nome_start']=nome; itens[-1]['ean']=str(int(t[0]))
xls(LAM,'G34LAM'); xls(ENV,'G34ENV')
# ---- classificação para a loja ----
PAPEL={'KB30':'Kraft branco 30 g','KB35':'Kraft branco 35 g','KB40':'Kraft branco 40 g','K32':'Kraft pardo 32 g','K35':'Kraft pardo 35 g',
       'K40':'Kraft pardo 40 g','K60':'Kraft pardo 60 g','N40':'Semi kraft 40 g','G34':'Antigordura 34 g','STRONG':'Strong'}
def papel(it):
    u=it['ident'].upper().replace('K40 TALHERES','K40 ')
    if 'STRONG' in u: return 'STRONG'
    m=re.search(r'\b(KB30|KB35|KB40|K32|K35|K40|K60|N40|G34)\b', u) or re.search(r'(KB30|KB35|KB40|K32|K35|K40|K60|N40|G34)', u)
    if m: return m.group(1)
    c=it['cat_tab'].upper(); g=re.search(r'(\d\d)\s*GRS', c)
    if g:
        if 'SEMI' in c: return 'N'+g.group(1)
        return ('KB' if 'BRANCO' in c else 'K')+g.group(1)
    return {'BOBINAS':'KB40'}.get(it['linha'],'?')
def medida(t):
    m=re.search(r'(\d+(?:[.,]\d+)?)[.,]?\s*(?:CM)?\s*[Xx]\s*(\d+(?:[.,]\d+)?)', t, re.I)
    return (m.group(1).replace('.',',')+' × '+m.group(2).replace('.',',')) if m else None
SACO_NOME=[('1/2',"Saco ½ kg",'pao'),('900','Saco 900 g','pao'),('15 KG','Saco 15 kg','pao'),('10 KG','Saco 10 kg','pao'),('7,5','Saco 7,5 kg','pao'),
    ('5 KG','Saco 5 kg','pao'),('5KG','Saco 5 kg','pao'),('3 KG','Saco 3 kg','pao'),('3KG','Saco 3 kg','pao'),('2 KG','Saco 2 kg','pao'),('2KG','Saco 2 kg','pao'),
    ('1 KG','Saco 1 kg','pao'),('1KG','Saco 1 kg','pao'),('BAGUETE VIS','Saco baguete com visor','pao'),('BAGUETE','Saco baguete','pao'),
    ('MINIBURGER','Saco miniburger','lanche'),('HAMBURG','Saco hamburgão','lanche'),('HAMBURGER','Saco hambúrguer','lanche'),('BATATINHA','Saco batatinha','lanche'),
    ('SEMENTE','Saco semente','lanche'),('PIPOQUINHA','Saco pipoquinha','lanche'),('PIPOCA','Saco pipoca','lanche'),('STICKS','Porta-sticks','lanche'),
    ('BIJOUTERIA','Saco bijuteria','outros'),('FARMACIA','Saco farmácia','outros'),('N.2','Saco nº 2','outros')]
MIN={'Saco ½ kg':15000,'Saco 1 kg':10000,'Saco 2 kg':8000,'Saco 3 kg':5000,'Saco 5 kg':5000,'Saco 7,5 kg':5000,'Saco 10 kg':5000,'Saco 15 kg':5000,
     'Saco hamburgão':10000,'Saco hambúrguer':20000,'Saco batatinha':20000,'Saco semente':20000}
out=[]
for it in itens:
    u=it['ident'].upper(); pp=papel(it); o={'id':'c_'+re.sub(r'[^a-z0-9]+','_',(it['linha']+' '+it['ident']).lower()).strip('_'),
       'papel':PAPEL.get(pp,pp),'cod':pp,'preco':it['preco'],'un':'milheiro','tab':it['tab'],'fonte':it['fonte']}
    if 'ean' in it: o['ean']=it['ean']
    if it['linha']=='BOBINAS':
        larg=re.search(r'(\d+)\s*CM',u).group(1); o.update(cat='bobina', nome=f"Bobina {larg} cm"+(' timbrada' if 'TIMBRAD' in u else ' lisa' if 'LISA' in u else ''), un='kg',
            minimo=('60 kg' if larg=='60' else '40 kg'))
    elif it['linha']=='G34LAM':
        o.update(cat='lamina', nome='Lâmina antigordura '+(medida(it['nome_start']) or medida(it['ident']))+' cm', minimo=5000)
        if 'AU AU' in it.get('nome_start','').upper(): o['nome']+=' (modelo Au Au New York)'
    elif it['linha']=='G34ENV':
        ns=it['nome_start'].upper(); md=medida(ns) or medida(it['ident'])
        tipo='Envelope hot dog' if 'HOT DOG' in ns else 'Envelope batatinha' if 'BATATINHA' in ns else 'Envelope aberto' if 'ABERTO' in ns else 'Envelope fechado'
        md=re.sub(r'(\d+) × (\d+) CM',r'\1 × \2',md or ''); o.update(cat='envelope', nome=f"{tipo} {md} cm".replace('  ',' '),
            minimo=20000 if 'aberto' in tipo else 15000)
    elif 'BANDEJA' in u or 'BANDEJA' in it['cat_tab'].upper():
        o.update(cat='bandeja', nome='Fundo de bandeja '+medida(it['ident'])+' cm', minimo=10000)
    elif 'TALHER' in u:
        o.update(cat='talher', nome='Porta-talher '+('largo' if 'LARGO' in u else 'estreito'), minimo=10000)
    else:
        md=medida(it['ident'])
        if md: o.update(cat='lanche', nome=f'Saco {md} cm', minimo=10000 if md.startswith('13,5') else None)
        else:
            hit=next(((n,c) for k,n,c in SACO_NOME if k in u.replace('HAMBURGAO','HAMBURGÃO').replace('HAMBURGÃO','HAMBURGÃO') and not (k=='HAMBURG' and 'HAMBURGER' in u)), None)
            if not hit: raise SystemExit('sem nome: '+it['ident'])
            o.update(nome=hit[0], cat=hit[1], minimo=MIN.get(hit[0]))
    if o.get('minimo') is None: o.pop('minimo',None)
    out.append(o)
ids=[o['id'] for o in out]; assert len(ids)==len(set(ids)), 'ids repetidos'
ORD={'pao':0,'lanche':1,'envelope':2,'talher':3,'lamina':4,'bandeja':5,'bobina':6,'outros':7}
def chave(o):
    n=[float(x.replace(',','.')) for x in re.findall(r'\d+(?:,\d+)?', o['nome'])]
    if '½' in o['nome']: n=[0.5]
    kg=n[0]*(1 if 'kg' in o['nome'] else 0.001 if ' g' in o['nome'] else 1) if n else 999
    saco_kg = o['cat']=='pao' and n and ('kg' in o['nome'] or ' g' in o['nome'])
    return (ORD[o['cat']], 0 if saco_kg else 1, kg if saco_kg else 0, o['nome'] if not saco_kg else '', [x for x in n] if not saco_kg else [], o['cod'])
out.sort(key=chave)
json.dump({'gerado':'tabelas do Start: TABELA PREÇOS GLOBO 2026 (25-08-2026), Lâminas e Envelopes (30-06-2026)','fator':FATOR,'itens':out},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'catalogo_tabela.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), Counter(o['cat'] for o in out))
for o in out: print(f"{o['cat']:8} {o['nome']:42} {o['papel']:20} {o['preco']:>8.2f}/{o['un']:8} min {o.get('minimo','-')}")
