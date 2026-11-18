import json,re,unicodedata,sys
d=json.load(open('/home/claude/glopel/sistema/_privado/dados.json'))
cli=d['cli']; C=[dict(zip(cli['colC'],r)) for r in cli['c']]
html=open('/home/claude/glopel/sistema/index.html',encoding='utf-8').read()
i=html.index('const CATALOGO = ')+17
cat=json.JSONDecoder().raw_decode(html[i:])[0]['itens']
norm0=lambda t: re.sub(r'[^A-Z0-9/,]','',unicodedata.normalize('NFD',t.upper()).encode('ascii','ignore').decode())
key={}
norm=lambda t: norm0(t.replace('½','1/2'))
for p in cat: key.setdefault(norm(p['cod']+p['nome'].replace('Saco ','')),p)
P=json.load(open(sys.argv[1]))
regs=[];rel=[]
for p in P:
    cs=[c for c in C if c['nome']==p['cli']] or [c for c in C if c['nome'].startswith(p['cli'])]
    c=cs[0] if cs else {}
    its=[];semcat=[]
    for it in p['itens']:
        ident,un,q,v=it[:4]; arte=it[4] if len(it)>4 else ''
        nid=ident.split(' (')[0]
        nid=re.sub(r'^G34 HAMBURGAO.*','G32 HAMBURGÃO',nid)
        m=key.get(norm(nid))
        if not m: semcat.append(ident)
        its.append({'pid':m['id'] if m else '','prod':(f"{m['cod']} {m['nome'].replace('Saco ','')} — {m['nome']} · {m['papel']}" if m else f"{ident} ({un})"),'arte':arte,'arte_nova':False,'cores':'','mil':q,'preco':v,'obs':'' if m else f'fora do catálogo · un. {un}'})
    bruto=round(sum(x['mil']*x['preco'] for x in its),2)
    txt=' | '.join(f"{x['mil']:g} {x['prod'].split(' — ')[0]}" for x in its)
    obs='Cópia automática do Start (lida em '+p.get('lido','18/11 16h')+'). Arte não aparece na lista de itens do Start.'+(' ⚠️ Pedido ainda aberto no Start (não encerrado).' if p.get('aberto') else '')
    regs.append({'id':f"ST-{p['n']}",'num':str(p['n']),'data':p.get('data','2026-11-18'),'status':'NO START','origem':'Start (cópia)','empresa':'Globo',
      'cliente':p['cli'],'cliente_chave':c.get('chave',''),'cliente_doc':c.get('doc') or '','cliente_fone':' · '.join(x for x in [c.get('cel'),c.get('tel')] if x),
      'cliente_local':' · '.join(x for x in [c.get('bairro'),(c.get('cidade') or '')+('/'+c['uf'] if c.get('uf') else '')] if x),
      'vendedor':'EDSON TONET' if p['vend'].startswith('EDSON') else p['vend'],'tabela':p['tab'],'itens_txt':txt,'itens':json.dumps(its,ensure_ascii=False),
      'total_itens':str(bruto),'acrescimo':'0','desconto':str(p['desc']),'total':str(p['total']),'pagamento':'A COMBINAR','vencimento':'','entrega_prev':'',
      'obs':obs,'start_num':str(p['n']),'criado_em':p.get('criado','2026-11-18T19:20:00Z')})
    rel.append((p['n'],p['cli'],'cli ok' if c else 'CLIENTE NÃO ACHADO',len(its),semcat,p['total']))
json.dump(regs,open('regs.json','w'),ensure_ascii=False)
for r in rel: print(r)
