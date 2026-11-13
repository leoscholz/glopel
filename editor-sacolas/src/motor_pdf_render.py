#!/usr/bin/env python3
"""
Renderizador de arte para sacola (flexografia).

Entrada : arquivo de arte (.json) que referencia um gabarito (.json)
Saída   : <nome>_ARTE_FINAL.pdf   vetor, cores Pantone (spot), texto em curvas, gabarito em spot não-imprimível
          <nome>_previa.png        planificada sobre kraft
          <nome>_frente.png / _verso.png
          <nome>_separacoes.png    uma chapa por cor
          <nome>_validacao.txt

Uso: python3 render.py artes/minha_arte.json [--saida saida/]
Unidades: cm para posições/tamanhos, pt para corpo de texto, mm para espessura de traço.
"""
import json, math, os, sys, subprocess, datetime, argparse
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import CMYKColorSep, CMYKColor, Color
from reportlab.lib.units import cm
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
import svgelements as se

AQUI = os.path.dirname(os.path.abspath(__file__))
PT_CM = 2.54 / 72.0

FONTES = {
    "Inter": "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
    "Inter Bold": "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "Inter Black": "/usr/share/fonts/opentype/inter/Inter-Black.otf",
    "Heros": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheros-regular.otf",
    "Heros Bold": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheros-bold.otf",
    "Heros Cond Bold": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheroscn-bold.otf",
    "Schola": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreschola-regular.otf",
    "Schola Bold": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreschola-bold.otf",
    "Bonum Bold": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrebonum-bold.otf",
    "Pagella Italic": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrepagella-italic.otf",
    "Chorus": "/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrechorus-mediumitalic.otf",
}
_font_cache = {}

def fonte(nome):
    if nome not in _font_cache:
        caminho = FONTES.get(nome, nome)
        if not os.path.exists(caminho):
            raise ValueError(f"Fonte desconhecida: {nome}. Disponíveis: {', '.join(FONTES)}")
        f = TTFont(caminho)
        _font_cache[nome] = (f, f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm, f["hmtx"])
    return _font_cache[nome]


# ---------------------------------------------------------------- caminhos
class CanvasPen(BasePen):
    """Desenha contornos de glifo num path do reportlab (texto vira curva)."""
    def __init__(self, glyphset, path, s, dx, dy):
        super().__init__(glyphset); self.p, self.s, self.dx, self.dy = path, s, dx, dy
    def _t(self, pt): return (self.dx + pt[0] * self.s, self.dy + pt[1] * self.s)
    def _moveTo(self, pt): self.p.moveTo(*self._t(pt))
    def _lineTo(self, pt): self.p.lineTo(*self._t(pt))
    def _curveToOne(self, a, b, c): self.p.curveTo(*self._t(a), *self._t(b), *self._t(c))
    def _closePath(self): self.p.close()
    def _endPath(self): pass


def layout_texto(el):
    f, gs, cmap, upm, hmtx = fonte(el.get("fonte", "Inter"))
    tam = el.get("tamanho_pt", 12) * PT_CM          # corpo em cm
    s = tam / upm
    track = el.get("espacamento", 0) / 1000.0 * tam
    entrel = el.get("entrelinha", 1.2) * tam
    linhas = str(el.get("texto", "")).split("\n")
    res = []
    for i, ln in enumerate(linhas):
        glifos, xx = [], 0.0
        for ch in ln:
            g = cmap.get(ord(ch)) or ".notdef"
            glifos.append((g, xx))
            xx += hmtx[g][0] * s + track
        w = xx - track if ln else 0
        al = el.get("alinhamento", "esquerda")
        ox = {"esquerda": 0, "centro": -w / 2, "direita": -w}[al]
        res.append((glifos, ox, -i * entrel, w))
    return res, s, gs, tam


def path_svg_d(d):
    return se.Path(d)


def segs_para_rl(path_se, p, sx, sy, dx, dy):
    """Converte svgelements.Path em path reportlab. sy negativo inverte Y do SVG."""
    T = lambda q: (dx + q.x * sx, dy + q.y * sy)
    for seg in path_se:
        if isinstance(seg, se.Move): p.moveTo(*T(seg.end))
        elif isinstance(seg, se.Close): p.close()
        elif isinstance(seg, se.Line): p.lineTo(*T(seg.end))
        elif isinstance(seg, se.CubicBezier): p.curveTo(*T(seg.control1), *T(seg.control2), *T(seg.end))
        elif isinstance(seg, se.QuadraticBezier):
            a, c, b = seg.start, seg.control, seg.end
            c1 = se.Point(a.x + 2/3*(c.x-a.x), a.y + 2/3*(c.y-a.y)); c2 = se.Point(b.x + 2/3*(c.x-b.x), b.y + 2/3*(c.y-b.y))
            p.curveTo(*T(c1), *T(c2), *T(b))
        elif isinstance(seg, se.Arc):
            for cb in seg.as_cubic_curves():
                p.curveTo(*T(cb.control1), *T(cb.control2), *T(cb.end))


def carregar_svg(arq):
    """Logo vetorial: todas as formas viram paths (cor única definida na camada)."""
    doc = se.SVG.parse(arq, reify=True)
    paths = []
    for e in doc.elements():
        if isinstance(e, se.Shape) and not isinstance(e, se.Group):
            pth = se.Path(e)
            if len(pth) == 0: continue
            fill = e.fill
            branco = fill is not None and fill.value is not None and str(fill).lower() in ("#ffffff", "#fff", "white")
            if fill is None or fill.value is None: continue
            paths.append((pth, branco, e.values.get("fill-rule", "nonzero")))
    return paths


def bbox_paths(paths):
    xs, ys = [], []
    for pth, *_ in paths:
        b = pth.bbox()
        if b: xs += [b[0], b[2]]; ys += [b[1], b[3]]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------- bbox (validação)
def rot_pts(pts, ang, ox, oy):
    a = math.radians(ang); c, s = math.cos(a), math.sin(a)
    return [(ox + x*c - y*s, oy + x*s + y*c) for x, y in pts]


def bbox_local(el, base):
    t = el["tipo"]
    if t == "retangulo": return 0, 0, el["w"], el["h"]
    if t == "elipse": return -el["rx"], -el["ry"], el["rx"], el["ry"]
    if t == "texto":
        res, s, gs, tam = layout_texto(el)
        xs = [ox for _, ox, _, w in res] + [ox + w for _, ox, _, w in res]
        ys = [r[2] for r in res]
        return min(xs), min(ys) - 0.22*tam, max(xs), max(ys) + 0.75*tam
    if t in ("caminho", "svg"):
        paths = [(path_svg_d(el["d"]), False, "nonzero")] if t == "caminho" else carregar_svg(os.path.join(base, el["arquivo"]))
        x0, y0, x1, y1 = bbox_paths(paths); k = el["w"] / (x1 - x0)
        return 0, 0, el["w"], (y1 - y0) * k
    if t == "grupo":
        bx = [bbox_global(c, base) for c in el["filhos"] if c.get("visivel", True)]
        return min(b[0] for b in bx), min(b[1] for b in bx), max(b[2] for b in bx), max(b[3] for b in bx)
    if t == "linha": return 0, 0, 0, 0
    raise ValueError(t)


def bbox_global(el, base):
    if el["tipo"] == "linha":
        return min(el["x1"], el["x2"]), min(el["y1"], el["y2"]), max(el["x1"], el["x2"]), max(el["y1"], el["y2"])
    x0, y0, x1, y1 = bbox_local(el, base)
    esc = el.get("escala", 1)
    pts = [(x0*esc, y0*esc), (x1*esc, y0*esc), (x1*esc, y1*esc), (x0*esc, y1*esc)]
    pts = rot_pts(pts, el.get("rotacao", 0), el.get("x", 0), el.get("y", 0))
    return min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)


# ---------------------------------------------------------------- desenho
class Pintor:
    """modo: 'final' (spot), 'previa' (CMYK aprox. sobre kraft), 'sep:<chave>' (chapa em preto)."""
    def __init__(self, c, arte, modo):
        self.c, self.arte, self.modo = c, arte, modo
        self.pal = arte["paleta"]
        self.kraft = CMYKColor(0.10, 0.30, 0.55, 0.12)

    def cor(self, chave, tint=100):
        """Retorna Color ou None (= não desenhar)."""
        if self.modo == "final":
            if chave == "papel":
                k0 = next(iter(self.pal.values()))
                return CMYKColorSep(*[v/100 for v in k0["cmyk"]], spotName=k0["pantone"], density=0)
            p = self.pal[chave]
            return CMYKColorSep(*[v/100 for v in p["cmyk"]], spotName=p["pantone"], density=tint/100)
        if self.modo == "previa":
            if chave == "papel": return self.kraft
            p = self.pal[chave]; t = tint/100
            # mistura simples tinta x kraft para simular retícula
            cc = [v/100 for v in p["cmyk"]]; kk = [self.kraft.cyan, self.kraft.magenta, self.kraft.yellow, self.kraft.black]
            return CMYKColor(*[max(a*t, b) if t < 1 else max(a, b*0.4) for a, b in zip(cc, kk)])
        alvo = self.modo.split(":", 1)[1]
        if chave == alvo: return CMYKColor(0, 0, 0, tint/100)
        return CMYKColor(0, 0, 0, 0)  # outras cores vazam (knockout) esta chapa

    def aplica(self, el, fill=True):
        chave = el.get("cor" if fill else "contorno")
        if not chave: return False
        if self.modo.startswith("sep:") and el.get("sobreimpressao") and chave != self.modo[4:]:
            return False
        col = self.cor(chave, el.get("tinta", 100))
        if col is None: return False
        if fill: self.c.setFillColor(col)
        else: self.c.setStrokeColor(col)
        if self.modo == "final":
            (self.c.setFillOverprint if fill else self.c.setStrokeOverprint)(bool(el.get("sobreimpressao")))
        return True

    def desenha(self, el, base):
        if not el.get("visivel", True): return
        c = self.c; c.saveState()
        t = el["tipo"]
        if t != "linha":
            c.translate(el.get("x", 0)*cm, el.get("y", 0)*cm)
            c.rotate(el.get("rotacao", 0))
            esc = el.get("escala", 1)
            if esc != 1: c.scale(esc, esc)
        tem_f = self.aplica(el, True) if t != "linha" else False
        tem_s = self.aplica(el, False)
        if tem_s: c.setLineWidth(el.get("traco_mm", 0.5) / 10 * cm)
        if t == "retangulo":
            r = el.get("raio", 0)
            if r: c.roundRect(0, 0, el["w"]*cm, el["h"]*cm, r*cm, stroke=tem_s, fill=tem_f)
            else: c.rect(0, 0, el["w"]*cm, el["h"]*cm, stroke=tem_s, fill=tem_f)
        elif t == "elipse":
            c.ellipse(-el["rx"]*cm, -el["ry"]*cm, el["rx"]*cm, el["ry"]*cm, stroke=tem_s, fill=tem_f)
        elif t == "linha":
            if tem_s:
                c.setLineCap(1 if el.get("ponta_redonda") else 0)
                c.line(el["x1"]*cm, el["y1"]*cm, el["x2"]*cm, el["y2"]*cm)
        elif t == "texto":
            res, s, gs, tam = layout_texto(el)
            p = c.beginPath()
            for glifos, ox, by, w in res:
                for g, gx in glifos:
                    gs[g].draw(CanvasPen(gs, p, s*cm, (ox+gx)*cm, by*cm))
            c.drawPath(p, stroke=tem_s, fill=tem_f, fillMode=1)
        elif t in ("caminho", "svg"):
            paths = [(path_svg_d(el["d"]), False, el.get("regra", "nonzero"))] if t == "caminho" \
                else carregar_svg(os.path.join(base, el["arquivo"]))
            x0, y0, x1, y1 = bbox_paths(paths); k = el["w"] / (x1 - x0) * cm
            for pth, branco, regra in paths:
                if branco and t == "svg":
                    c.saveState(); c.setFillColor(self.cor("papel"))
                p = c.beginPath()
                segs_para_rl(pth, p, k, -k, -x0*k, y1*k)
                c.drawPath(p, stroke=tem_s, fill=tem_f, fillMode=(0 if regra == "evenodd" else 1))
                if branco and t == "svg": c.restoreState()
        elif t == "grupo":
            for f in el["filhos"]: self.desenha(f, base)
        c.restoreState()


# ---------------------------------------------------------------- gabarito
def serrilhado(p, a, b, amp, passo, para_fora):
    (x0, y0), (x1, y1) = a, b
    n = max(1, round(abs(x1 - x0) / passo)); dx = (x1 - x0) / n
    for i in range(n):
        xm = x0 + dx*(i + .5)
        p.lineTo(xm*cm, (y0 + amp*para_fora)*cm)
        p.lineTo((x0 + dx*(i+1))*cm, y0*cm)


def contorno_path(c, gab):
    pts = gab["contorno"]; amp, passo = gab["serrilha"]["amplitude"], gab["serrilha"]["passo"]
    p = c.beginPath(); p.moveTo(pts[0][0]*cm, pts[0][1]*cm)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i+1) % len(pts)]
        if abs(a[1] - b[1]) < 1e-6 and abs(a[0] - b[0]) > 1:   # borda horizontal = serrilha
            para_dentro = -1 if a[1] > 20 else 1          # dentes apontam para dentro do papel
            serrilhado(p, a, b, amp, passo, para_dentro)
        else:
            p.lineTo(b[0]*cm, b[1]*cm)
    p.close(); return p


def desenha_gabarito(c, gab, cor, rotulos=True, hachura=True):
    c.saveState()
    c.setStrokeColor(cor); c.setFillColor(cor); c.setStrokeOverprint(True); c.setFillOverprint(True)
    c.setLineWidth(0.25)
    c.drawPath(contorno_path(c, gab), stroke=1, fill=0)
    c.setDash(3, 2)
    for (a, b) in gab["dobras"]:
        c.line(a[0]*cm, a[1]*cm, b[0]*cm, b[1]*cm)
    c.setDash()
    if hachura:
        c.setLineWidth(0.15)
        c.saveState(); c.clipPath(contorno_path(c, gab), stroke=0, fill=0)
        for r in gab["areas_cola"]:
            c.saveState(); pth = c.beginPath(); pth.rect(r["x"]*cm, r["y"]*cm, r["w"]*cm, r["h"]*cm)
            c.clipPath(pth, stroke=0, fill=0)
            x = r["x"] - r["h"]
            while x < r["x"] + r["w"]:
                c.line(x*cm, r["y"]*cm, (x + r["h"])*cm, (r["y"] + r["h"])*cm); x += 0.6
            c.restoreState()
        c.restoreState()
    if rotulos:
        for nome, pn in gab["paineis"].items():
            for parte in pn["partes"]:
                texto_simples(c, nome.upper().replace("_", " "), (parte["x"] + parte["w"]/2), parte["h"] - 1.2, 7, cor, "centro")
        texto_simples(c, "ÁREA DE COLA", 1.5, 21, 7, cor, "centro", rot=90)
        texto_simples(c, "ÁREA DE COLA", 27.05, -1.8, 7, cor, "centro")
    c.restoreState()


def texto_simples(c, txt, x, y, pt, cor, al="esquerda", rot=0, fonte_nome="Inter"):
    el = {"tipo": "texto", "texto": txt, "tamanho_pt": pt, "fonte": fonte_nome, "alinhamento": al, "x": x, "y": y, "rotacao": rot}
    res, s, gs, tam = layout_texto(el)
    c.saveState(); c.translate(x*cm, y*cm); c.rotate(rot); c.setFillColor(cor)
    p = c.beginPath()
    for glifos, ox, by, w in res:
        for g, gx in glifos:
            gs[g].draw(CanvasPen(gs, p, s*cm, (ox+gx)*cm, by*cm))
    c.drawPath(p, stroke=0, fill=1, fillMode=1); c.restoreState()


# ---------------------------------------------------------------- página
MARG = {"esq": 3, "dir": 3, "inf": 5, "sup": 6}

def pagina(caminho, arte, gab, modo, base):
    xs = [p[0] for p in gab["contorno"]]; ys = [p[1] for p in gab["contorno"]]
    W = max(xs) - min(xs) + MARG["esq"] + MARG["dir"]; H = max(ys) - min(ys) + MARG["inf"] + MARG["sup"]
    ox, oy = MARG["esq"] - min(xs), MARG["inf"] - min(ys)
    c = rl_canvas.Canvas(caminho, pagesize=(W*cm, H*cm))
    c.setTitle(f"{arte.get('cliente','')} — {gab['referencia']} — {modo}")
    pintor = Pintor(c, arte, modo)
    spot_gab = CMYKColorSep(0, 1, 0, 0, spotName="GABARITO_NAO_IMPRIMIR")
    c.translate(ox*cm, oy*cm)

    if modo == "previa":
        c.saveState(); c.setFillColor(pintor.kraft)
        c.drawPath(contorno_path(c, gab), stroke=0, fill=1); c.restoreState()

    # arte: cada painel é recortado em suas partes físicas
    for camada in arte["camadas"]:
        if not camada.get("visivel", True): continue
        pn = gab["paineis"][camada["painel"]]
        for parte in pn["partes"]:
            c.saveState()
            clip = c.beginPath(); clip.rect(parte["x"]*cm, parte["y"]*cm, parte["w"]*cm, parte["h"]*cm)
            c.clipPath(clip, stroke=0, fill=0)
            c.translate((parte["x"] - parte["px"])*cm, parte["y"]*cm)
            pintor.desenha(camada, base)
            c.restoreState()

    # gabarito e cabeçalho
    if modo == "final":
        desenha_gabarito(c, gab, spot_gab)
        cor_info = spot_gab
    elif modo == "previa":
        desenha_gabarito(c, gab, CMYKColor(0, 0, 0, 0.55), rotulos=False, hachura=True)
        cor_info = CMYKColor(0, 0, 0, 0.8)
    else:
        desenha_gabarito(c, gab, CMYKColor(0, 0, 0, 0.25), rotulos=False, hachura=False)
        cor_info = CMYKColor(0, 0, 0, 0.8)

    topo = max(ys) + 1.8
    cores = " + ".join(p["pantone"] for p in arte["paleta"].values())
    linha1 = f"Cliente: {arte.get('cliente','')}     Referência: {gab['referencia']}     Cores ({len(arte['paleta'])}): {cores}"
    linha2 = f"Versão: {arte.get('versao','1')}     Data: {datetime.date.today().strftime('%d/%m/%Y')}     Arquivo: {os.path.basename(arte['_arquivo'])}     Escala 1:1 — medidas em cm"
    if modo.startswith("sep:"):
        k = modo[4:]; linha1 = f"SEPARAÇÃO — {arte['paleta'][k]['pantone']}"
    texto_simples(c, linha1, min(xs), topo + 1.6, 16, cor_info, fonte_nome="Inter Bold")
    texto_simples(c, linha2, min(xs), topo + 0.4, 11, cor_info)
    # marcas de corte
    c.setStrokeColor(cor_info); c.setLineWidth(0.3)
    for (x, y) in [(min(xs), min(ys)), (max(xs), min(ys)), (min(xs), max(ys)), (max(xs), max(ys))]:
        sx = -1 if x == min(xs) else 1; sy = -1 if y == min(ys) else 1
        c.line((x + sx*0.4)*cm, y*cm, (x + sx*1.4)*cm, y*cm)
        c.line(x*cm, (y + sy*0.4)*cm, x*cm, (y + sy*1.4)*cm)
    c.showPage(); c.save()
    sem_fontes(caminho)
    return ox, oy, W, H


def sem_fontes(caminho):
    """Todo texto já é curva; remove a Helvetica que o reportlab declara por padrão."""
    import pikepdf, re
    with pikepdf.open(caminho, allow_overwriting_input=True) as pdf:
        for pg in pdf.pages:
            dados = pg.Contents.read_bytes() if not isinstance(pg.Contents, pikepdf.Array) else b"".join(x.read_bytes() for x in pg.Contents)
            dados = re.sub(rb"BT /F\d+ [\d.]+ Tf [\d.]+ TL ET", b"", dados)
            pg.Contents = pdf.make_stream(dados)
            if "/Font" in pg.Resources: del pg.Resources["/Font"]
        pdf.save(caminho)


# ---------------------------------------------------------------- validação
def valida(arte, gab, base):
    R = gab["regras"]; m = R["margem_seguranca_cm"]; avisos, erros = [], []
    usadas = set()

    def coleta(el, painel, raiz):
        if not el.get("visivel", True): return
        for k in ("cor", "contorno"):
            v = el.get(k)
            if v and v != "papel":
                if v not in arte["paleta"]: erros.append(f"[{raiz}] cor '{v}' não está na paleta")
                usadas.add(v)
        if el.get("tinta", 100) < 100:
            avisos.append(f"[{raiz}] usa retícula ({el['tinta']}%) — confirmar lineatura com a clicheria")
        if el["tipo"] == "texto" and el.get("tamanho_pt", 12) * el.get("escala", 1) < R["texto_min_pt"]:
            erros.append(f"[{raiz}] texto {el.get('tamanho_pt')}pt abaixo do mínimo {R['texto_min_pt']}pt")
        if el.get("contorno") and el.get("traco_mm", 0.5) < R["linha_min_mm"]:
            erros.append(f"[{raiz}] traço {el.get('traco_mm')}mm abaixo do mínimo {R['linha_min_mm']}mm")
        for f in el.get("filhos", []): coleta(f, painel, raiz)

    for el in arte["camadas"]:
        pn = gab["paineis"].get(el["painel"])
        if not pn: erros.append(f"[{el['id']}] painel '{el['painel']}' não existe"); continue
        coleta(el, el["painel"], el["id"])
        if not el.get("visivel", True) or el.get("fundo"): continue
        x0, y0, x1, y1 = bbox_global(el, base)
        if x0 < m - 1e-6 or y0 < m - 1e-6 or x1 > pn["w"] - m + 1e-6 or y1 > pn["h"] - m + 1e-6:
            fora = x1 < 0 or y1 < 0 or x0 > pn["w"] or y0 > pn["h"]
            (erros if fora else avisos).append(
                f"[{el['id']}] {'FORA do painel' if fora else 'invade margem de segurança'} ({el['painel']}: "
                f"{x0:.1f}–{x1:.1f} × {y0:.1f}–{y1:.1f} cm; área útil {m}–{pn['w']-m:.1f} × {m}–{pn['h']-m:.1f})")
        for li in pn.get("linhas_internas", []):
            if x0 < li["x"] + m and x1 > li["x"] - m:
                avisos.append(f"[{el['id']}] cruza a {li['tipo']} em x={li['x']} cm ({el['painel']})")

    if len(arte["paleta"]) > R["max_cores"]:
        erros.append(f"paleta tem {len(arte['paleta'])} cores; máximo {R['max_cores']}")
    nao_usadas = set(arte["paleta"]) - usadas
    if nao_usadas: avisos.append(f"cores na paleta sem uso: {', '.join(nao_usadas)}")
    return erros, avisos


# ---------------------------------------------------------------- PNGs
def pdf_png(pdf, png_base, dpi):
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), "-singlefile", pdf, png_base], check=True)
    return png_base + ".png"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("arte"); ap.add_argument("--saida", default=os.path.join(AQUI, "saida"))
    ap.add_argument("--dpi", type=int, default=60)
    a = ap.parse_args()
    arte = json.load(open(a.arte)); arte["_arquivo"] = a.arte
    base = os.path.dirname(os.path.abspath(a.arte))
    gab = json.load(open(os.path.join(base, arte["gabarito"])))
    nome = os.path.splitext(os.path.basename(a.arte))[0] + f"_v{arte.get('versao', 1)}"
    os.makedirs(a.saida, exist_ok=True); S = lambda s: os.path.join(a.saida, nome + s)

    erros, avisos = valida(arte, gab, base)
    rel = [f"VALIDAÇÃO — {nome}", f"Erros: {len(erros)}   Avisos: {len(avisos)}"] + \
          [f"ERRO   {e}" for e in erros] + [f"AVISO  {x}" for x in avisos]
    open(S("_validacao.txt"), "w").write("\n".join(rel) + "\n"); print("\n".join(rel))

    pagina(S("_ARTE_FINAL.pdf"), arte, gab, "final", base)
    ox, oy, W, H = pagina(S("_previa.pdf"), arte, gab, "previa", base)
    png = pdf_png(S("_previa.pdf"), S("_previa"), a.dpi)

    # recortes frente / verso (alta resolução)
    from PIL import Image
    hi = pdf_png(S("_previa.pdf"), S("_tmp_hi"), 110)
    im = Image.open(hi); px = im.width / W
    def recorte(x0, x1, h, arq):
        box = (int((ox + x0)*px), int((H - oy - h - 0.6)*px), int((ox + x1)*px), int((H - oy + 0.2)*px))
        im.crop(box).save(arq)
    fr = gab["paineis"]["frente"]["partes"][0]
    recorte(fr["x"], fr["x"] + fr["w"], fr["h"], S("_frente.png"))
    vs = gab["paineis"]["verso"]["partes"]
    a1 = im.crop((int((ox+vs[0]['x'])*px), int((H-oy-vs[0]['h']-0.6)*px), int((ox+vs[0]['x']+vs[0]['w'])*px), int((H-oy+0.2)*px)))
    a2 = im.crop((int((ox+vs[1]['x'])*px), int((H-oy-vs[1]['h']-0.6)*px), int((ox+vs[1]['x']+vs[1]['w'])*px), int((H-oy+0.2)*px)))
    v = Image.new("RGB", (a1.width + a2.width, a1.height), "white"); v.paste(a1, (0, 0)); v.paste(a2, (a1.width, 0)); v.save(S("_verso.png"))
    os.remove(hi)

    # separações
    tiles = []
    for k in arte["paleta"]:
        f = S(f"_sep_{k}.pdf"); pagina(f, arte, gab, f"sep:{k}", base)
        tiles.append(Image.open(pdf_png(f, S(f"_sep_{k}"), 30)).convert("RGB")); os.remove(f)
    sep = Image.new("RGB", (max(t.width for t in tiles), sum(t.height for t in tiles)), "white")
    y = 0
    for k, t in zip(arte["paleta"], tiles):
        sep.paste(t, (0, y)); y += t.height; os.remove(S(f"_sep_{k}.png"))
    sep.save(S("_separacoes.png")); os.remove(S("_previa.pdf"))
    print("OK ->", a.saida)


if __name__ == "__main__":
    main()
