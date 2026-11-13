#!/usr/bin/env python3
"""Gera as duas versões do GloboEditor a partir de editor_template.html.
   ../index.html            → GitHub Pages (Pedir ao Claude DESATIVADO)
   dist/artifact.html       → artifact no Claude (Pedir ao Claude via capability "sample")
Uso: python3 build.py"""
import json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(AQUI, 'editor_template.html'), encoding='utf-8').read()
g = json.load(open(os.path.join(AQUI, 'gabarito_5kg.json')))
a = json.load(open(os.path.join(AQUI, 'exemplo_padaria.json')))
import base64, glob
fotos = {os.path.basename(f)[:-5]+'.pdf': 'data:image/webp;base64,'+base64.b64encode(open(f,'rb').read()).decode() for f in sorted(glob.glob(os.path.join(AQUI,'..','fotos','*.webp')))}
t = t.replace('__FOTOS__', json.dumps(fotos))
full = t.replace('__GABARITO__', json.dumps(g, ensure_ascii=False)).replace('__ARTE__', json.dumps(a, ensure_ascii=False))
GANCHO = '(async()=>{ try{ SAMPLE = await claude.use("sample"); }catch(_){ SAMPLE=null; }'
assert GANCHO in full, 'gancho do Pedir ao Claude não encontrado'
gh = full.replace(GANCHO, '''(async()=>{ SAMPLE=null;
  const tg0=document.querySelector('#chat .tag'); tg0.textContent='desativado nesta versão'; tg0.style.background='#e7e2da'; tg0.style.color='#6f665c';
  const pr=document.getElementById('prompt'); pr.disabled=true; pr.placeholder='Pedir ao Claude fica disponível na versão integrada. Aqui, edite direto na arte.';
  document.getElementById('send').disabled=true; document.getElementById('clip').disabled=true; document.getElementById('chips').style.display='none';
  document.getElementById('log').innerHTML=''; return;''', 1)
os.makedirs(os.path.join(AQUI, 'dist'), exist_ok=True)
open(os.path.join(AQUI, 'dist', 'artifact.html'), 'w', encoding='utf-8').write(full)
open(os.path.join(AQUI, '..', 'index.html'), 'w', encoding='utf-8').write(gh)
# checagem de sintaxe do JS (precisa de node)
for f in ['dist/artifact.html', '../index.html']:
    s = open(os.path.join(AQUI, f), encoding='utf-8').read()
    js = s.split('<script>')[1].split('</script>')[0]
    r = subprocess.run(['node', '-e', 'new Function(require("fs").readFileSync(0,"utf8"))'], input=js, text=True, capture_output=True)
    print(('OK   ' if r.returncode == 0 else 'ERRO ') + f + ('' if r.returncode == 0 else '\n' + r.stderr[-800:]))
    if r.returncode: sys.exit(1)
