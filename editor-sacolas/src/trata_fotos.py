#!/usr/bin/env python3
"""Tratamento de cor das fotos da loja, para todas terem a mesma "cara" (pedido do Leo, 17-11-2026).
Originais ficam em <pasta>/_orig/ (o build só lê *.webp da pasta de cima). Rodar de novo é seguro (sempre parte do _orig).
Uso: python3 src/trata_fotos.py            (trata fotos/, fotos_catalogo/ e fotos_suri/)
Passos por foto:
  1. Fundo branco: estima a cor do fundo pela borda da imagem e corrige o balanço (o fundo vira ~branco neutro);
     tons já quase brancos vão para branco puro (assim o mix-blend da loja some com o retângulo cinza dos renders).
  2. Brancos neutros: papel branco com tom azulado/amarelado perde a dominante (cromas baixas são reduzidas;
     nas fotos de papel, toda dominante AZUL em área clara sai — o saco branco do Suri vinha azul).
  3. Kraft igual em todas: os pixels de kraft (máscara suave por matiz/saturação) são levados para o mesmo
     kraft de referência KRAFT_LAB (média entre as fotos dos gabaritos e as do Suri).
  4. Contraste e nitidez: ponto preto pelo percentil, curva S leve e máscara de nitidez.
Fotos com transparência (gabaritos OHDE em fotos/) mantêm o alfa e pulam o passo 1.
Fotos de revenda (copos, plásticos etc.) pulam o passo 3 (embalagens amarelas não podem virar kraft)."""
import os, sys, glob, json, shutil
import numpy as np
from PIL import Image, ImageFilter
from skimage import color

AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
KRAFT_LAB = np.array([68.0, 6.0, 40.0])
PASTAS = ['fotos', 'fotos_catalogo', 'fotos_suri']

def smooth(x, a, b):  # 0 abaixo de a, 1 acima de b
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def trata(rgb, alfa=None, kraft=True):
    rgb = rgb.astype(np.float64) / 255.
    fg = np.ones(rgb.shape[:2], bool) if alfa is None else alfa > 0.5
    # 1. fundo
    if alfa is None:
        h, w = rgb.shape[:2]; e = max(2, int(0.03 * min(h, w)))
        borda = np.concatenate([rgb[:e].reshape(-1, 3), rgb[-e:].reshape(-1, 3), rgb[:, :e].reshape(-1, 3), rgb[:, -e:].reshape(-1, 3)])
        lum = borda.mean(1); claro = borda[lum >= np.percentile(lum, 50)]
        bg = np.median(claro, 0)
        ganho = np.clip(0.975 / np.maximum(bg, 1e-3), 1.0, 1.30)
        rgb = np.clip(rgb * ganho, 0, 1)
    lab = color.rgb2lab(rgb)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    # 1b. fundo de estúdio cinza/degradê (renders e fotos de 2016): ilumina o fundo por um plano suave
    #     ajustado na borda (polinômio de 2º grau) e leva o fundo a ~97 (quase branco); os claros do objeto entram num
    #     "ombro" suave para não estourar (papel branco sobre fundo cinza).
    if alfa is None:
        h, w = L.shape; e = max(2, int(0.03 * min(h, w)))
        yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
        ring = np.zeros((h, w), bool); ring[:e] = ring[-e:] = True; ring[:, :e] = ring[:, -e:] = True
        if np.median(L[ring]) < 94:
            X = lambda y, x: np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)
            sel = ring & (L > np.percentile(L[ring], 30))
            coef, *_ = np.linalg.lstsq(X(yy[sel], xx[sel]), L[sel], rcond=None)
            campo = np.clip(X(yy, xx) @ coef, 40, 100)
            v = L * 101.0 / campo                      # fundo → ~96,7 depois do ombro
            L[:] = np.where(v > 90, 90 + 10 * (1 - np.exp(-(v - 90) / 10)), v)
    croma = np.hypot(A, B)
    # 2. brancos neutros (croma baixa e clara)
    neutro = (1 - smooth(croma, 6, 16)) * smooth(L, 55, 75)
    if kraft:   # foto de papel: dominante azul (b<0) em área clara é luz/câmera, não cor do produto → tira até croma ~32
        neutro = np.maximum(neutro, smooth(-B, 1, 4) * (1 - smooth(croma, 26, 36)) * smooth(L, 50, 70))
    A *= 1 - 0.85 * neutro; B *= 1 - 0.85 * neutro
    # 3. kraft
    if kraft:
        hue = np.degrees(np.arctan2(B, A)) % 360
        mk = smooth(croma, 18, 28) * (1 - smooth(np.abs(hue - 72), 14, 26)) * smooth(L, 30, 45) * fg
        if mk.sum() > 400:
            w = mk / mk.sum(); med = np.array([(L * w).sum(), (A * w).sum(), (B * w).sum()])
            d = KRAFT_LAB - med
            L += mk * d[0] * 0.8; A += mk * d[1] * 0.85; B += mk * d[2] * 0.85
    # 4. contraste: ponto preto + curva S leve (em L)
    if fg.sum() > 100:
        p0 = np.percentile(L[fg], 0.5)
        if p0 < 25: L[:] = np.clip((L - p0 * 0.6) / (100 - p0 * 0.6) * 100, 0, 100)
    x = L / 100.; L[:] = 100 * (x - 0.22 * np.sin(2 * np.pi * x) / (2 * np.pi) * (1 - smooth(x, 0.75, 0.9)))   # curva S leve, sem estourar os claros
    # fundo quase branco → branco puro
    if alfa is None:
        bra = smooth(L, 97.0, 99.3) * (1 - smooth(croma, 3, 7))
        L[:] = L + (100 - L) * bra; A *= 1 - bra; B *= 1 - bra
    out = np.clip(color.lab2rgb(np.stack([L, A, B], -1)), 0, 1)
    im = Image.fromarray((out * 255 + 0.5).astype(np.uint8))
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=2))

def revenda_ids():
    try:
        its = json.load(open(os.path.join(AQUI, 'catalogo', 'surishop_2025.json'), encoding='utf-8'))['itens']
        return {i['id'] for i in its if i['cat_suri'] in ('Gerais', 'Sacos e Sacolas Plásticas')}
    except Exception: return set()

def main():
    rev = revenda_ids(); n = 0
    for p in PASTAS:
        d = os.path.join(RAIZ, p); o = os.path.join(d, '_orig'); os.makedirs(o, exist_ok=True)
        for f in sorted(glob.glob(os.path.join(d, '*.webp'))):
            if not os.path.exists(os.path.join(o, os.path.basename(f))): shutil.copy2(f, o)
        for f in sorted(glob.glob(os.path.join(o, '*.webp'))):
            nome = os.path.basename(f); im = Image.open(f)
            kraft = not (p == 'fotos_suri' and nome[:-5] in rev)
            if im.mode == 'RGBA':
                arr = np.array(im); res = trata(arr[..., :3], arr[..., 3] / 255., kraft).convert('RGBA'); res.putalpha(Image.fromarray(arr[..., 3]))
            else:
                res = trata(np.array(im.convert('RGB')), None, kraft)
            res.save(os.path.join(d, nome), 'WEBP', quality=80, method=6); n += 1
    print(n, 'fotos tratadas')
if __name__ == '__main__': main()
