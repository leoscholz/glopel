# GloboEditor — hand-off (alpha 0.1 · 13-11-2026)

## O que é
Editor online de arte para sacos de papel da **Embalagens Globo (Glopel)**, embutido numa loja de demonstração.
Objetivo de negócio: o cliente (padaria) monta a arte sozinho e a Glopel manda o arquivo **direto para a clicheria**, sem passar pelo departamento de design. Quem usa é **leigo em design** — tudo tem de ser óbvio, gentil e à prova de erro.

## Onde está
| O quê | Onde |
|---|---|
| Demo pública (Pedir ao Claude desativado) | https://leoscholz.github.io/glopel/editor-sacolas/ |
| Versão no Claude (Pedir ao Claude ativo, capability `sample`) | artifact "Editor de Arte — Sacolas Glopel (protótipo)" · slug `a2f29c09-79bc-4147-92d6-24516b2f288a` |
| Código-fonte | `leoscholz/glopel` › `editor-sacolas/src/` |
| Fonte única | `src/editor_template.html` (HTML+CSS+JS num arquivo) |
| Build | `python3 src/build.py` → `../index.html` (GitHub) e `src/dist/artifact.html` (artifact) |
| Facas OHDE (PDF 1:1) | `src/facas/*.pdf` · medidas extraídas com `src/facas/extrai_medidas.py` |
| Motor de PDF p/ clicheria (v1, Python/reportlab) | `src/motor_pdf_render.py` — ainda NÃO lê vetor enviado nem retícula |

Publicar: GitHub = commit + push em `main` (Pages serve `editor-sacolas/index.html`). Artifact = `publish_files` com `src/dist/artifact.html` como `index.html`, mode patch, base_version = versão viva (`get_artifact`).

## Estado (alpha 0.1)
**Loja** — identidade Embalagens Globo (logo vetor redesenhado, azul `#1f5fae`/`#2f7fd0`); 6 facas × 2 papéis (kraft, branco monolúcido); carrinho lateral; Personalizar adiciona ao carrinho sozinho; Finalizar só com todas as artes aprovadas. Preço ilustrativo (função da área).

**Editor**
- Várias sacolas do carrinho; faixa de miniaturas com status ⚪ falta criar · 🟡 adaptada/conferir · 🟢 conferida · ✏️ mudança só nesta · ✅ aprovada.
- Adaptação automática entre facas (topo/base ancorados, meio proporcional; nunca abaixo de texto/traço mínimo).
- Mudanças ficam **só na sacola atual** por padrão; faixa "Aplicar nas outras sacolas" leva o estado FINAL (decisão do Leo — não reverter).
- Salva sozinho (localStorage `glopel_editor_projeto_v2`, assets em `glopel_editor_assets_v1`); começa vazio; ❓ › Carregar exemplo / Recomeçar (desfazível).
- Ferramentas: Selecionar, Tamanho, Texto, Forma, Centralizar, Mover tela, Ímã; barra arrastável e vertical/horizontal; multi-seleção (shift, retângulo, Ctrl+A); pastas (Ctrl+G); duplo-clique edita texto no canvas; guias tipo Figma; Espaço+arrastar.
- Abas recolhíveis: Camadas, Cores, 🧩 Elementos (esq.) · Ajustes, Checagem (dir.).
- Elementos: banco (trigo, pão, croissant, baguete, café, coração, estrela, selo, faixa, pattern padaria); upload SVG → redução p/ ≤3 cores Pantone (agrupamento em Lab); upload foto → **retícula** de 1 cor, lineatura fixa no máximo da faca (30 lpi kraft / 40 branco, a confirmar), escala do elemento = resolução, ponto mínimo 6%.
- Vistas: Prévia no papel, Chapa por Pantone (rótulo na cor real), Mockup 3D (CSS), Produto final (three.js r128: saco em pé, base achatada, kraft granular, AO, sombra, HDRI desfocado, pão francês + batata frita).
- Pedir ao Claude: modelo `claude-fable-5-2` (cai para tier complex), devolve JSON `{resposta, ops[]}` com ops editar/mover/escalar/criar/apagar/ordem/agrupar/desagrupar/centralizar/cor; desfazer por pedido.
- Marca d'água "PRÉVIA · GLOPEL"; checagem de clicheria ao vivo.

## Regras de produto (não quebrar)
- Máx. **3 cores Pantone** por arte (total, não por elemento). Nada de degradê/transparência na saída.
- Margem 0,5 cm; texto ≥ 6 pt; traço ≥ 0,3 mm; não cruzar dobra da sanfona nem emenda do verso; nada em área de cola.
- Facas 1/2 kg e 1 kg: **tira de cola compõe o verso** (vd 7 + cola 3 = 10) — premissa a confirmar com a Glopel.
- Interface para leigo: linguagem simples, botões grandes, nada destrutivo sem desfazer.

## Pendências
1. Ficha técnica da clicheria: formato, nº máx. de cores, lineatura máx., ponto mínimo, traço/texto mínimos.
2. Confirmar com a Glopel: cola no verso (1/2, 1 kg); verso do Hamburgão (5,2+8,2=13,4 vs frente 13,5); quais facas existem em papel branco.
3. Dados reais da loja (pedido mínimo, atendimento, pagamento).
4. **PDF real no "Pronto"**: portar o motor (vetor enviado, retícula, várias facas) — passo que torna isto produção.
5. Upload PDF/AI/EPS; editar item dentro de pasta; persistência em servidor (hoje só navegador).
