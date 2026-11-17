#!/usr/bin/env python3
"""Snapshot do antigo catálogo Suri Shop (TOTVS) da Embalagens Globo → dados + fotos para a loja.
Uso: python3 baixa_surishop.py [pasta_cache]
  1. Abre https://embalagensglobo.surishop.ai/catalog no Playwright (Node) e captura as respostas da API
     (/api/catalog/products/search e /api/catalog/top) → 81 produtos.
  2. Baixa a foto principal de cada um (blob público cbmstg) para a pasta de cache.
  3. Recorta o branco em volta, reduz para no máx. 520 px e grava editor-sacolas/fotos_suri/_orig/<id>.webp.
     Depois rode python3 src/trata_fotos.py (cor/contraste) → fotos_suri/<id>.webp, que é o que o build usa.
  4. Grava catalogo/surishop_2025.json (id, nome, categoria Suri, preço Suri 2025, descrição).
ATENÇÃO: preços dos SACOS no Suri são placeholders (10,00/10,01…) — a loja usa a tabela 2026 para eles.
Plásticos e Gerais usam o preço Suri 2025 como REFERÊNCIA provisória (a confirmar com o Leo)."""
import json, os, re, subprocess, sys
from PIL import Image, ImageChops
AQUI = os.path.dirname(os.path.abspath(__file__))
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/surishop'
os.makedirs(os.path.join(CACHE, 'img'), exist_ok=True)
FOTOS = os.path.join(AQUI, '..', '..', 'fotos_suri', '_orig'); os.makedirs(FOTOS, exist_ok=True)   # originais; o tratamento (src/trata_fotos.py) grava em fotos_suri/
JS = r"""
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const R=[];
p.on('response',async r=>{const u=r.url();if(/catalog\/(products\/search|top|categories)/.test(u)){try{R.push({u,body:await r.text()})}catch(e){}}});
await p.goto('https://embalagensglobo.surishop.ai/catalog',{waitUntil:'networkidle',timeout:60000});
for(let i=0;i<15;i++){await p.mouse.wheel(0,3000);await p.waitForTimeout(700);}
require('fs').writeFileSync(process.argv[2],JSON.stringify(R));await b.close();})();"""
cap = os.path.join(CACHE, 'api.json')
if not os.path.exists(cap):
    open(os.path.join(CACHE, 'cap.js'), 'w').write(JS)
    subprocess.run(['node', os.path.join(CACHE, 'cap.js'), cap], check=True)
R = json.load(open(cap))
cats = {}; P = {}
for x in R:
    if not re.search(r'catalog/(products/search|top|categories)', x['u']): continue
    d = json.loads(x['body'])['data']
    if 'categories' in x['u']:
        for c in d['data']:
            cats[c['id']] = c['name']
            for ch in c['children']: cats[ch['id']] = c['name']
    else:
        for it in d['data']: P[it['id']] = it
out = []
for k, it in P.items():
    url = it['images'][0]['url'] if it['images'] else None
    jp = os.path.join(CACHE, 'img', k + '.jpeg')
    if url and not os.path.exists(jp): subprocess.run(['curl', '-sS', '-f', '--max-time', '120', '-o', jp, url], check=True)
    if url:
        im = Image.open(jp).convert('RGB')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bb = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 18 else 0).getbbox()
        if bb:
            m = int(0.03 * max(im.size)); im = im.crop((max(0, bb[0]-m), max(0, bb[1]-m), min(im.width, bb[2]+m), min(im.height, bb[3]+m)))
        im.thumbnail((520, 520), Image.LANCZOS)
        im.save(os.path.join(FOTOS, k + '.webp'), 'WEBP', quality=72, method=6)
    out.append({'id': k, 'nome': it['name'].strip(), 'cat_suri': cats.get(it['category']['id'], ''), 'preco_suri': it['price'],
                'desc': (it.get('description') or '').strip(), 'foto': bool(url)})
out.sort(key=lambda r: (r['cat_suri'], r['nome']))
json.dump({'fonte': 'https://embalagensglobo.surishop.ai/catalog', 'capturado': '2026-11-17', 'itens': out},
          open(os.path.join(AQUI, 'surishop_2025.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'produtos;', len(os.listdir(FOTOS)), 'fotos')
