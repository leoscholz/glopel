#!/usr/bin/env python3
"""Cofre do Sistema Globo — cifra os dados reais que vão no index.html público.

Os dados reais (bobinas, notas de papel, preço do papel, vendas por vendedor,
funcionários, contas a pagar) ficam CIFRADOS dentro do index.html, no bloco
    const COFRE = {...}; /*__COFRE_FIM__*/
A página pede a senha e decifra no navegador (PBKDF2-SHA256 600 mil voltas + AES-256-GCM).
Sem a senha, o repositório público só mostra texto embaralhado.

Uso (na pasta sistema/):
    GLOPEL_SENHA='...' python3 cofre.py abrir    # index.html → _privado/dados.json
    (editar _privado/dados.json)
    GLOPEL_SENHA='...' python3 cofre.py fechar   # _privado/dados.json → index.html

A pasta _privado/ está no .gitignore: NUNCA commitar o dados.json.
Trocar a senha = abrir com a antiga e fechar com a nova.
"""
import base64, gzip, json, os, re, sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

AQUI = Path(__file__).parent
HTML = AQUI / 'index.html'
DADOS = AQUI / '_privado' / 'dados.json'
ITER = 600_000
RX = re.compile(r'const COFRE = (\{.*?\}); /\*__COFRE_FIM__\*/', re.S)
b64 = lambda b: base64.b64encode(b).decode()


def chave(senha, salt, it=ITER):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(senha.encode())


def senha():
    s = os.environ.get('GLOPEL_SENHA')
    if not s:
        sys.exit('Defina GLOPEL_SENHA com a senha do sistema.')
    return s


def fechar():
    dados = DADOS.read_bytes()
    json.loads(dados)  # valida
    salt, iv = os.urandom(16), os.urandom(12)
    # v2: gzip antes de cifrar (o navegador descomprime com DecompressionStream)
    ct = AESGCM(chave(senha(), salt)).encrypt(iv, gzip.compress(dados, 9, mtime=0), None)
    bloco = json.dumps({'v': 2, 'z': 1, 'it': ITER, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(ct)})
    html = HTML.read_text()
    if not RX.search(html):
        sys.exit('Bloco COFRE não encontrado no index.html')
    HTML.write_text(RX.sub(lambda m: f'const COFRE = {bloco}; /*__COFRE_FIM__*/', html, count=1))
    print(f'Cifrado: {len(dados):,} bytes de dados → index.html')


def abrir():
    c = json.loads(RX.search(HTML.read_text()).group(1))
    d = base64.b64decode
    dados = AESGCM(chave(senha(), d(c['salt']), c['it'])).decrypt(d(c['iv']), d(c['ct']), None)
    if c.get('z'):
        dados = gzip.decompress(dados)
    DADOS.parent.mkdir(exist_ok=True)
    DADOS.write_bytes(dados)
    print(f'Decifrado em {DADOS}')


if __name__ == '__main__':
    {'abrir': abrir, 'fechar': fechar}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
