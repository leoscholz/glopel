/**
 * Sistema Globo — porteiro da planilha da Secretaria (Glopel)
 * O site (GitHub Pages) manda pedidos para cá; este script confere a chave e grava.
 *
 * Instalar: na planilha "Glopel — Secretaria (registro WhatsApp)" › Extensões › Apps Script,
 * colar este arquivo, salvar, e Implantar › Nova implantação › App da Web
 *   Executar como: Eu · Quem pode acessar: Qualquer pessoa
 * Copiar o URL (termina em /exec) e mandar para o Claude guardar no cofre do site.
 *
 * A CHAVE abaixo também está dentro do cofre cifrado do site. Trocar a chave = mudar aqui,
 * salvar, "Gerenciar implantações › Editar › Nova versão", e pedir ao Claude para trocar no cofre.
 */
const CHAVE = 'COLE_AQUI_A_CHAVE_DO_COFRE';  // a chave real está no cofre (api.chave) e no script instalado

// Planilha só do site (funcionários, contas fixas, pagamentos e o que vier): qualquer aba dela pode ser lida/gravada
const SIS = '1EcJLIH3Yqd7Byx9bEdJ167BDf6enCF-oRmwvy2Ozo8g';

const ABAS = {
  saidas: ['Bobinas', 'A2:Q'],
  skus: ['Bob_SKU', 'A2:J'],
  ent: ['Bob_Entradas', 'A2:J'],
  inv: ['Bob_Inventario', 'A2:F'],
};

function doGet() {
  return saida({ ok: true, msg: 'Porteiro do Sistema Globo no ar. Use POST.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return saida({ ok: false, erro: 'pedido inválido' }); }
  if (!req || req.chave !== CHAVE) return saida({ ok: false, erro: 'chave' });
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return saida({ ok: false, erro: 'ocupado, tente de novo' });
  try {
    const d = req.dados || {};
    let r;
    switch (req.acao) {
      case 'ler': r = ler(); break;
      case 'pedido': r = pedido(d); break;
      case 'chegou': r = chegou(d); break;
      case 'cancelar': r = cancelar(d); break;
      case 'contagem': r = contagem(d); break;
      case 'saida': r = saidaBobina(d); break;
      case 'tabelas': r = tabelas(d); break;
      case 'upsert': r = upsert(d, req.quem); break;
      default: return saida({ ok: false, erro: 'ação desconhecida: ' + req.acao });
    }
    if (req.acao !== 'ler' && req.acao !== 'tabelas') registrarLog(req.acao, req.quem, d);
    return saida(Object.assign({ ok: true }, r));
  } catch (x) {
    return saida({ ok: false, erro: String(x && x.message || x) });
  } finally {
    trava.releaseLock();
  }
}

/* ---------- leitura (mesmo formato do get_values: texto como aparece na tela) ---------- */
function ler() {
  const ss = SpreadsheetApp.getActive(), out = {};
  Object.keys(ABAS).forEach(k => {
    const [nome, rng] = ABAS[k];
    const sh = ss.getSheetByName(nome);
    if (!sh) { out[k] = []; return; }
    const ult = sh.getLastRow();
    out[k] = ult < 2 ? [] : sh.getRange(rng.replace(/:([A-Z]+)$/, ':$1' + ult)).getDisplayValues();
  });
  out.lido = new Date().toISOString();
  return { dados: out };
}

/* ---------- gravação ---------- */
function pedido(d) {
  exigir(d, ['sku', 'qtd', 'pedido']);
  aba('Bob_Entradas').appendRow(['PEDIDO', data(d.pedido), data(d.previsao), '', d.sku, d.fornecedor || '', num(d.qtd), '', '', '']);
  return { msg: 'Pedido registrado.' };
}
function chegou(d) {
  exigir(d, ['linha', 'sku', 'receb']);
  const sh = aba('Bob_Entradas'), lin = Number(d.linha);
  const atual = sh.getRange(lin, 1, 1, 5).getDisplayValues()[0];
  if (String(atual[4]) !== String(d.sku) || String(atual[0]).toUpperCase() !== 'PEDIDO') throw new Error('a linha ' + lin + ' mudou na planilha; atualize a página');
  sh.getRange(lin, 1).setValue('RECEBIDO');
  sh.getRange(lin, 4).setValue(data(d.receb));
  if (d.peso !== '' && d.peso != null) sh.getRange(lin, 8).setValue(num(d.peso));
  if (d.nf) sh.getRange(lin, 9).setValue(String(d.nf));
  return { msg: 'Chegada registrada.' };
}
function cancelar(d) {
  exigir(d, ['linha', 'sku']);
  const sh = aba('Bob_Entradas'), lin = Number(d.linha);
  const atual = sh.getRange(lin, 1, 1, 5).getDisplayValues()[0];
  if (String(atual[4]) !== String(d.sku) || String(atual[0]).toUpperCase() !== 'PEDIDO') throw new Error('a linha ' + lin + ' mudou na planilha; atualize a página');
  sh.getRange(lin, 1).setValue('CANCELADO');
  return { msg: 'Pedido cancelado.' };
}
function contagem(d) {
  exigir(d, ['data', 'sku', 'qtd']);
  aba('Bob_Inventario').appendRow([data(d.data), d.sku, num(d.qtd), '', d.por || '', 'registrado no site']);
  return { msg: 'Contagem registrada.' };
}
function saidaBobina(d) {
  exigir(d, ['data', 'sku']);
  aba('Bobinas').appendRow([data(d.data), d.hora || '', d.autor || '', '', '', '', d.autor || '', 'registrado no site', '', d.fornecedor || '', '', '', '', '', '', d.sku, d.peso ? num(d.peso) : '']);
  return { msg: 'Saída registrada.' };
}

/* ---------- genérico: planilha do site (SIS) ---------- */
function nomeAba(n) {
  n = String(n || '');
  if (!/^[A-Za-z0-9_]{1,40}$/.test(n)) throw new Error('nome de aba inválido: ' + n);
  return n;
}
function tabelas(d) {
  const ss = SpreadsheetApp.openById(SIS), out = {};
  (d.abas || []).forEach(n => {
    const sh = ss.getSheetByName(nomeAba(n));
    out[n] = sh ? sh.getDataRange().getDisplayValues() : [];
  });
  return { dados: out, lido: new Date().toISOString() };
}
function upsert(d, quem) {
  const reg = d.registro || {};
  if (!reg.id) throw new Error('falta id');
  const ss = SpreadsheetApp.openById(SIS), nome = nomeAba(d.aba);
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, 1).setValue('id');
    sh.setFrozenRows(1);
  }
  let head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(String);
  const campos = Object.keys(reg).concat(['atualizado_em', 'por']);
  campos.forEach(c => { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setNumberFormat('@').setValue(c); } });
  const val = Object.assign({}, reg, { atualizado_em: new Date().toISOString(), por: quem || '' });
  const ult = sh.getLastRow();
  const ids = ult < 2 ? [] : sh.getRange(2, 1, ult - 1, 1).getDisplayValues().map(r => String(r[0]));
  let lin = ids.indexOf(String(reg.id));
  if (lin < 0) {
    const row = head.map(h => val[h] === undefined || val[h] === null ? '' : String(val[h]));
    lin = ult + 1;
    sh.getRange(lin, 1, 1, head.length).setNumberFormat('@').setValues([row]);
    return { msg: 'Gravado (novo).', linha: lin };
  }
  lin += 2;
  head.forEach((h, i) => { if (val[h] !== undefined) sh.getRange(lin, i + 1).setNumberFormat('@').setValue(val[h] === null ? '' : String(val[h])); });
  return { msg: 'Gravado.', linha: lin };
}

/* ---------- apoio ---------- */
function aba(nome) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!sh) throw new Error('aba ' + nome + ' não existe');
  return sh;
}
function exigir(d, campos) {
  campos.forEach(c => { if (d[c] === undefined || d[c] === null || d[c] === '') throw new Error('falta ' + c); });
}
function data(s) {               // 'AAAA-MM-DD' → data de verdade na planilha
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}
function num(v) { const x = Number(String(v).replace(',', '.')); return isFinite(x) ? x : ''; }
function registrarLog(acao, quem, d) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_log_site');
  if (!sh) { sh = ss.insertSheet('_log_site'); sh.appendRow(['Quando', 'Ação', 'Quem', 'Dados']); }
  sh.appendRow([new Date(), acao, quem || '', JSON.stringify(d)]);
}
function saida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
