#!/usr/bin/env python3
"""Gera catalogo_tabela.json (itens da loja sem personalização) a partir das tabelas de preço 2026 — FONTE DE VERDADE
desde 17-11-2026 (decisão do Leo): TABELA PREÇOS GLOBO 2026.xlsx + TABELA ANTIGORDURA 2026.xlsx.
Uso: python3 gera_catalogo.py TABELA_PRECOS_GLOBO_2026.xlsx TABELA_ANTIGORDURA_2026.xlsx
Preço do site = o MAIOR entre Tabela I/II/III × 1,10 (decisão do Leo, 16-11-2026: quem não é cliente paga o mais caro
+10%; o cliente recebe o "desconto" com o cupom do vendedor, que também serve para mapear comissão).
Mínimos: aba QUANTIDADE MÍNIMA (coluna 1 cor). Medidas dos sacos: aba TAMANHOS da Antigordura.
EAN: as tabelas novas não trazem; ficam os EAN das tabelas de 30-06-2026 (ean_2026-06.json), quando o item é o mesmo."""
import sys, json, re, os, openpyxl
XLSX, ANTI = sys.argv[1:3]
AQUI = os.path.dirname(os.path.abspath(__file__))
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
def linhas(ws):
    for r in ws.iter_rows(values_only=True):
        r=list(r)
        if not r or all(c is None for c in r): continue
        vals=[num(c) if not isinstance(c,str) else None for c in r]
        nums=[i for i,v in enumerate(vals) if v is not None]
        if len(nums)<3: continue
        i0=nums[-3]; textos=[limpa(c) for c in r[:i0] if isinstance(c,str) and c.strip()]
        if not textos: continue
        yield textos, [vals[i0],vals[i0+1],vals[i0+2]]
wb=openpyxl.load_workbook(XLSX, data_only=True)
F1=os.path.basename(XLSX)
for ws in wb:
    if ws.title in PULA: continue
    linha=ws.title.split()[0].upper()
    for t,p in linhas(ws):
        if len(t)>=2: add(linha, t[-2], t[-1], p, F1+' › '+ws.title)
# ---- mínimos (aba QUANTIDADE MÍNIMA, 1 cor) ----
MIN_PLAN={}
for r in wb['QUANTIDADE MÍNIMA'].iter_rows(values_only=True):
    r=[c for c in r if c is not None and str(c).strip()]
    if len(r)>=2 and isinstance(r[0],str) and r[0].strip().upper() not in ('PRODUTO','COLUNA1'):
        MIN_PLAN[limpa(r[0]).upper()]=r[1]
# ---- Antigordura ----
wa=openpyxl.load_workbook(ANTI, data_only=True); F2=os.path.basename(ANTI)
for aba,linha in [('SACOS ANTIGORDURA','G34SAC'),('ENVELOPES ANTIGORDURA','G34ENV'),('LÂMINAS ANTIGORDURA','G34LAM')]:
    for t,p in linhas(wa[aba]):
        if t[0].upper()==aba: t=t[1:]
        if not t or t[0].upper() in ('PRODUTO','TAMANHO'): continue
        add(linha, aba, ' '.join(x for x in t if x.upper()!='LOUCO'), p, F2+' › '+aba)
# ---- medidas dos sacos (aba TAMANHOS: largura × altura × sanfona; largura da folha) ----
TAM={}
for r in wa['TAMANHOS'].iter_rows(values_only=True):
    r=[c for c in r if c is not None and str(c).strip()]
    if r and isinstance(r[0],str) and r[0].strip().upper().startswith('ALTURA X'): break
    if len(r)>=2 and isinstance(r[0],str) and isinstance(r[1],str) and re.search(r'\d\s*[xX]\s*\d', r[1]):
        TAM[limpa(r[0]).upper()]=' × '.join(limpa(x).replace('.',',') for x in re.split(r'\s*[xX]\s*', r[1].strip()))
# ---- classificação para a loja ----
PAPEL={'KB30':'Kraft branco 30 g','KB35':'Kraft branco 35 g','KB40':'Kraft branco 40 g','K32':'Kraft pardo 32 g','K35':'Kraft pardo 35 g',
       'K40':'Kraft pardo 40 g','K60':'Kraft pardo 60 g','N40':'Semi kraft 38 g','G34':'Antigordura 34 g','STRONG':'Strong'}
def papel(it):
    u=it['ident'].upper().replace('K40 TALHERES','K40 ')
    if 'STRONG' in u: return 'STRONG'
    m=re.search(r'\b(KB30|KB35|KB40|K32|K35|K40|K60|N40|G34)\b', u) or re.search(r'(KB30|KB35|KB40|K32|K35|K40|K60|N40|G34)', u)
    if m: return m.group(1)
    c=it['cat_tab'].upper(); g=re.search(r'(\d\d)\s*GRS', c)
    if g:
        if 'SEMI' in c: return 'N'+g.group(1)
        return ('KB' if 'BRANCO' in c else 'K')+g.group(1)
    if it['linha'].startswith('G34'): return 'G34'
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
MINI=lambda k: MIN_PLAN.get(k)
# planilha de mínimos → nome da loja (1 cor). Bobina 25 cm: a planilha só tem 40 e 60 → vale o de 40.
MIN_SACO={n:MIN_PLAN.get(k) for n,k in [('Saco semente','SEMENTE'),('Saco hambúrguer','HAMBURGER'),('Saco batatinha','BATATINHA'),
  ('Saco batatinha 120 g','BATATINHA'),('Saco batatinha 180 g','BATATINHA'),('Saco hamburgão','HAMBURGÃO'),('Saco 13,5 × 17,5 cm','13,5 X 17,5'),
  ('Saco 13,5 × 21,5 cm','13,5 X 21,5'),('Saco ½ kg','1/2KG'),('Saco 1 kg','1 KG'),('Saco 2 kg','2 KG'),('Saco 3 kg','3 KG'),('Saco 5 kg','5 KG'),
  ('Saco 7,5 kg','7,5 KG'),('Saco 10 kg','10 KG'),('Saco 15 kg','15 KG')]}
# nome da loja → linha da aba TAMANHOS
TAM_NOME={'Saco semente':'SEMENTE','Saco bijuteria':'BIJOUTERIA','Saco farmácia':'FARMACIA','Saco miniburger':'MINIBURGER','Saco hambúrguer':'HAMBURGER',
  'Saco hamburgão':'HAMBURGÃO','Saco batatinha':'BATATINHA','Saco batatinha 120 g':'BATATINHA 120','Saco batatinha 180 g':'BATATINHA 180',
  'Saco 13,5 × 17,5 cm':'13,5X17,5','Saco 13,5 × 21,5 cm':'13,5X21,5','Saco pipoquinha':'PIPOQUINHA','Saco pipoca':'PIPOCA','Saco 900 g':'900 GRS',
  'Saco ½ kg':'1/2KG','Saco 1 kg':'1KG','Saco 2 kg':'2KG','Saco 3 kg':'3KG','Saco 5 kg':'5KG','Saco 7,5 kg':'7,5KG','Saco 10 kg':'10KG','Saco 15 kg':'15KG',
  'Saco baguete':'BAGUETE','Saco baguete com visor':'BAGUETE','Saco nº 2':'N. 2'}
# sacos antigordura (G34) → mesmo card do saco de papel quando o produto é o mesmo
SAC_G34=[('1/2','Saco ½ kg'),('900','Saco 900 g'),('2 KG','Saco 2 kg'),('1 KG','Saco 1 kg'),('13,5 X 17,5','Saco 13,5 × 17,5 cm'),('13,5 X 21,5','Saco 13,5 × 21,5 cm'),
  ('13,5 X 27','Saco 13,5 × 27 cm'),('CHURROS GRANDE','Saco churros grande 8,5 × 21 cm'),('CHURROS PEQUENO','Saco churros pequeno 8,5 × 14 cm'),
  ('HAMBURGAO','Saco hamburgão'),('HAMBURGER','Saco hambúrguer'),('BATATINHA 120','Saco batatinha 120 g'),('BATATINHA 180','Saco batatinha 180 g'),('SEMENTE','Saco semente')]
CAT_NOME={'Saco ½ kg':'pao','Saco 900 g':'pao','Saco 1 kg':'pao','Saco 2 kg':'pao'}
_EF=os.path.join(AQUI,'ean_2026-06.json'); EAN=json.load(open(_EF)) if os.path.exists(_EF) else {}
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
        o.update(cat='lamina', nome='Lâmina antigordura '+medida(it['ident'])+' cm', minimo=MINI('LAMINAS ANTIGORDURA TAMANHOS PADRÃO'))
        if 'AU AU' in u: o['nome']+=' (modelo Au Au New York)'
    elif it['linha']=='G34ENV':
        md=medida(u)
        tipo='Envelope hot dog' if 'HOT DOG' in u else 'Envelope batatinha' if 'BATATINHA' in u else 'Envelope aberto' if 'ABERTO' in u else 'Envelope fechado'
        o.update(cat='envelope', nome=f"{tipo} {md} cm", minimo=MINI('ENVELOPES ABERTOS' if tipo=='Envelope aberto' else 'ENVELOPES FECHADOS'))
    elif it['linha']=='G34SAC':
        hit=next((n for k,n in SAC_G34 if k in u), None)
        if not hit: raise SystemExit('saco antigordura sem nome: '+it['ident'])
        o.update(nome=hit, cat=CAT_NOME.get(hit,'lanche'))
    elif 'BANDEJA' in u or 'BANDEJA' in it['cat_tab'].upper():
        o.update(cat='bandeja', nome='Fundo de bandeja '+medida(it['ident'])+' cm', minimo=10000)
    elif 'TALHER' in u:
        o.update(cat='talher', nome='Porta-talher '+('largo' if 'LARGO' in u else 'estreito'), minimo=10000)
    else:
        md=medida(it['ident'])
        if md: o.update(cat='lanche', nome=f'Saco {md} cm')
        else:
            hit=next(((n,c) for k,n,c in SACO_NOME if k in u.replace('HAMBURGAO','HAMBURGÃO').replace('HAMBURGÃO','HAMBURGÃO') and not (k=='HAMBURG' and 'HAMBURGER' in u)), None)
            if not hit: raise SystemExit('sem nome: '+it['ident'])
            o.update(nome=hit[0], cat=hit[1])
    if o['cat'] in ('pao','lanche','outros'):
        o['minimo']=MIN_SACO.get(o['nome'])
        if TAM_NOME.get(o['nome']) in TAM: o['medidas']=TAM[TAM_NOME[o['nome']]]
    if o['cat']=='bandeja': o['minimo']=MINI('BANDEJA KRAFTS')
    if o['cat']=='talher': o['minimo']=MINI('PORTA TALHERES LARGO OU ESTREITO')
    if o['cat']=='bobina': o['minimo']=str(MIN_PLAN.get('BOBINAS PAPEL 60CM' if '60' in o['nome'] else 'BOBINAS PAPEL 40CM','')).lower().replace('kilos','kg') or None
    if o['id'] in EAN: o['ean']=EAN[o['id']]
    if o.get('minimo') is None: o.pop('minimo',None)
    out.append(o)
ids=[o['id'] for o in out]; assert len(ids)==len(set(ids)), 'ids repetidos'
ORD={'pao':0,'lanche':1,'envelope':2,'talher':3,'lamina':4,'bandeja':5,'bobina':6,'outros':7}
def chave(o):
    n=[float(x.replace(',','.')) for x in re.findall(r'\d+(?:,\d+)?', o['nome'])]
    if '½' in o['nome']: n=[0.5]
    kg=n[0]*(1 if 'kg' in o['nome'] else 0.001 if ' g' in o['nome'] else 1) if n else 999
    saco_kg = o['cat']=='pao' and n and ('kg' in o['nome'] or ' g' in o['nome'])
    return (ORD[o['cat']], 0 if saco_kg else 1, kg if saco_kg else 0, o['nome'] if not saco_kg else '', [x for x in n] if not saco_kg else [], o['cod'].startswith('G'), o['cod'])

# ---- respostas da Márcia ao quiz do catálogo (17-11-2026; claude/Catalogo-Quiz-Respostas-Marcia-2026-11-17.md) ----
# Enquanto a tabela do Start não for corrigida, as correções ficam aqui. Cada item corrigido guarda o preço original em 'tab_start'.
for o in out:
    if o['cod']=='G34': o['cod']='G32'; o['papel']='Antigordura 32 g'          # papel é o Greasepack 32 g (Lutepel); "34 g" estava errado
    if o['nome']=='Saco 13,5 × 27 cm': o['nome']='Saco nº 2'; o['cat']='outros'  # é o mesmo saco nº 2 (13,5 × 26,5)
    if o['nome']=='Saco batatinha': o['nome']='Saco batatinha 180 g'          # a batatinha KB30 da tabela é a de 180 g
    if o['nome'] in TAM_NOME and TAM_NOME[o['nome']] in TAM: o['medidas']=TAM[TAM_NOME[o['nome']]]
    if o['nome']=='Porta-sticks': o['medidas']='8,5 × 16,5'                     # sem sanfona; bobina de 20 cm
    # monolúcido (Márcia, 17-11): "A troca do KB pelo M30 e M40 é só nos fundos de bandeja e lâminas, se houver. Nos sacos não mexe."
    if o['cat'] in ('bandeja','lamina') and o['cod'] in ('KB30','KB40'):
        o['cod_start']=o['cod']; o['cod']='M'+o['cod'][2:]; o['papel']='Monolúcido '+o['cod'][1:]+' g'
MIN_MARCIA={'Saco 900 g':10000,'Saco baguete':10000,'Saco baguete com visor':20000,'Saco pipoca':20000,'Saco pipoquinha':20000,'Saco miniburger':20000,
  'Saco 17,5 × 25 cm':10000,'Saco nº 2':10000,'Saco churros grande 8,5 × 21 cm':20000,'Saco churros pequeno 8,5 × 14 cm':20000,'Porta-sticks':20000,
  'Saco bijuteria':20000,'Saco farmácia':20000}
for o in out:
    if not o.get('minimo') and o['nome'] in MIN_MARCIA: o['minimo']=MIN_MARCIA[o['nome']]
# "inverter os preços dos errados": trocar as três tabelas entre os pares; na bandeja K60 40×40, trocar Tab I e Tab II
TROCA=[('c_kb35_kb35_900_grs','c_kb40_kb40_900grs'),('c_k35_k35_baguete_longo','c_kb35_kb35_baguete'),
       ('c_k35_k35_baguete_visor','c_kb35_kb35_baguete_viso'),('c_g34lam_16_5x20','c_g34lam_16_5x17_5')]
por_id={o['id']:o for o in out}
for a,b in TROCA:
    A,B=por_id[a],por_id[b]; A['tab_start'],B['tab_start']=A['tab'],B['tab']; A['tab'],B['tab']=B['tab_start'],A['tab_start']
    for X in (A,B): X['corrigido']='preço invertido (Márcia, 17-11)'
X=por_id['c_k60_k60_bandeja_40x40']; X['tab_start']=X['tab']; X['tab']=[X['tab'][1],X['tab'][0],X['tab'][2]]; X['corrigido']='Tab I e II invertidas (Márcia, 17-11)'
for o in out: o['preco']=round(max(p for p in o['tab'] if p)*FATOR,2)
# fora do site (continuam no Sistema Globo para emitir pedidos)
FORA={'c_k35_k35_17_5x25':'não vende mais',
      'c_k40_porta_sticks_kraft_pardo_40grs':'produto exclusivo de um cliente (preço negociado)',
      'c_kb30_kb30_1_2_kg':'produto exclusivo de um cliente (preço negociado)','c_kb40_kb40_900grs':'produto exclusivo de um cliente (preço negociado)',
      'c_g34sac_churros_grande_8_5_x_21cm':'produto exclusivo de um cliente (preço negociado)','c_g34sac_churros_pequeno_8_5_x_14_cm':'produto exclusivo de um cliente (preço negociado)',
      'c_g34lam_au_au_14x33':'produto exclusivo de um cliente (preço negociado)'}
for o in out:
    if o['id'] in FORA: o['fora_site']=FORA[o['id']]
assert all(k in por_id for k in FORA), [k for k in FORA if k not in por_id]
out.sort(key=chave)
json.dump({'gerado':'fonte de verdade (17-11-2026): '+F1+' + '+F2,'fator':FATOR,'itens':out},
          open(os.path.join(AQUI,'catalogo_tabela.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), Counter(o['cat'] for o in out))
for o in out: print(f"{o['cat']:8} {o['nome']:42} {o['papel']:20} {o['preco']:>8.2f}/{o['un']:8} min {o.get('minimo','-')}")
