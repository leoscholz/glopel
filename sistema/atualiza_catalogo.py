"""Embute o catálogo da loja (editor-sacolas/src/catalogo/catalogo_tabela.json) na aba Produtos do Sistema Globo.
Uso, na raiz do repositório:  python3 sistema/atualiza_catalogo.py
Rodar sempre que o gera_catalogo.py for executado com uma tabela nova do Start."""
import json, re, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
cat = json.loads((raiz/'editor-sacolas/src/catalogo/catalogo_tabela.json').read_text(encoding='utf-8'))
p = raiz/'sistema/index.html'
s = p.read_text(encoding='utf-8')
novo = 'const CATALOGO = ' + json.dumps(cat, ensure_ascii=False, separators=(',',':')) + '; /*__CATALOGO_FIM__*/'
s2, n = re.subn(r'const CATALOGO = .*?; /\*__CATALOGO_FIM__\*/', lambda m: novo, s, flags=re.S)
assert n == 1, 'marcador do catálogo não encontrado'
p.write_text(s2, encoding='utf-8')
print(f"{len(cat['itens'])} itens embutidos em sistema/index.html")
