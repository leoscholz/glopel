#!/usr/bin/env python3
"""Copia portal/app.html para os dois lugares de onde ele é servido:
   /404.html          → links secretos  <site>/<TOKEN>/fazerpedido  (o GitHub Pages cai no 404 e o app lê o caminho)
   /portal/index.html → fallback        <site>/portal/?t=<TOKEN>#fazerpedido
Rodar depois de mexer em app.html:  python3 portal/build.py"""
import pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
app = (raiz / 'portal' / 'app.html').read_text(encoding='utf-8')
for destino in (raiz / '404.html', raiz / 'portal' / 'index.html'):
    destino.write_text(app, encoding='utf-8'); print('ok', destino.relative_to(raiz))
