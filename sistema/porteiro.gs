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
  // Oráculo: não trava a planilha (a resposta do Claude demora alguns segundos)
  if (req.acao === 'perguntar') {
    try { const r = perguntar(req.dados || {}, req.quem); registrarLog('perguntar', req.quem, { pergunta: String((req.dados || {}).pergunta || '').slice(0, 500) }); return saida(Object.assign({ ok: true }, r)); }
    catch (x) { return saida({ ok: false, erro: String(x && x.message || x) }); }
  }
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
      // 'perguntar' (Oráculo) é tratado antes da trava, lá em cima
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
  aba('Bob_Entradas').appendRow(['PEDIDO', data(d.pedido), data(d.previsao), '', d.sku, d.fornecedor || '', num(d.qtd), d.peso ? num(d.peso) : '', '', '', d.obs || '', d.peso ? 'site (Pedir já)' : '']);
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

/* ---------- Oráculo: perguntas sobre a empresa, respondidas pelo Claude ----------
 * A chave da API da Anthropic fica SÓ aqui, nas Propriedades do script (nunca no site nem no GitHub):
 *   Apps Script › ⚙️ Configurações do projeto › Propriedades do script › ANTHROPIC_KEY = sk-ant-…
 * Opcional: MODELO (padrão claude-sonnet-5-5).
 * O site manda a pergunta + o histórico da conversa + um retrato dos dados que ele já tem abertos
 * (cofre destrancado, planilha do site, bobinas). Aqui juntamos a base do Oráculo (fatos com fonte).
 */
const ORACULO = '1SUSBDzyd0ItjMlJEcnhSSr6kij_3RgWgktdikrAPf34'; // Glopel_Oraculo_Base › Fatos

function baseOraculo() {
  try {
    const sh = SpreadsheetApp.openById(ORACULO).getSheetByName('Fatos');
    if (!sh || sh.getLastRow() < 2) return '(base vazia)';
    const v = sh.getDataRange().getDisplayValues();
    const h = v[0], iV = h.indexOf('Vigente');
    return [h.join('\t')].concat(v.slice(1).filter(r => r[0] && (iV < 0 || r[iV] !== 'NÃO')).map(r => r.join('\t'))).join('\n');
  } catch (x) { return '(não consegui ler a base do Oráculo: ' + x + ')'; }
}

function perguntar(d, quem) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('ANTHROPIC_KEY');
  if (!key) throw new Error('falta a chave da Anthropic no porteiro (Propriedades do script › ANTHROPIC_KEY)');
  const modelo = props.getProperty('MODELO') || 'claude-sonnet-5-5';
  const pergunta = String(d.pergunta || '').trim();
  if (!pergunta) throw new Error('pergunta vazia');
  const hist = (d.historico || []).slice(-10).filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
  while (hist.length && hist[0].role !== 'user') hist.shift();
  const instr = [
    'Você é o Oráculo da Glopel (Embalagens Globo Indústria e Comércio Ltda, fábrica de sacos de papel para padarias em Curitiba).',
    'Quem pergunta é alguém da empresa (Márcia, a dona; Daiane, do escritório; ou Leo, o consultor). Hoje é ' + (d.hoje || '') + '. Quem está perguntando: ' + (quem || 'não informado') + '.',
    'Responda em português do Brasil, curto e direto, como uma secretária experiente: a resposta primeiro, depois o detalhe necessário. Use listas curtas e tabelas pequenas quando ajudarem. Valores em R$ com vírgula decimal; datas dd/mm/aaaa.',
    'Use SÓ os dados abaixo. Não invente número, nome, data nem prazo. Se a informação não estiver nos dados, diga claramente que não sabe e onde provavelmente está (Sage Start, Drive, uma pessoa) — essa resposta é útil.',
    'Diga de onde veio cada número importante, entre parênteses e curto: (base do Oráculo F0012), (planilha do site), (bobinas ao vivo), (retrato de produção 17/11), (vendas do Start até 16/11)…',
    'Se dois dados se contradizem, mostre os dois e diga qual é mais recente. Avise quando um dado for retrato antigo ou estimativa (ex.: comissão 5% é chute).',
    'Você só lê: não consegue gravar nada. Se pedirem para registrar algo, diga em qual página do Sistema Globo fazer isso.'
  ].join('\n');
  const dadosSite = JSON.stringify(d.contexto || {});
  const system = [
    { type: 'text', text: instr },
    { type: 'text', text: '<base_oraculo>\nFatos sobre a empresa, cada um com fonte e data de referência (vale o mais recente):\n' + baseOraculo() + '\n</base_oraculo>\n\n<dados_do_sistema>\n' + dadosSite.slice(0, 400000) + '\n</dados_do_sistema>', cache_control: { type: 'ephemeral' } }
  ];
  const corpo = { model: modelo, max_tokens: 2000, system: system, messages: hist.concat([{ role: 'user', content: pergunta }]) };
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(corpo)
  });
  const code = r.getResponseCode(), j = JSON.parse(r.getContentText() || '{}');
  if (code !== 200) throw new Error('Claude respondeu ' + code + ': ' + ((j.error && j.error.message) || r.getContentText().slice(0, 200)));
  const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  return { resposta: txt || '(sem resposta)', modelo: j.model, uso: j.usage };
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

/* ---------- Portal do cliente (link secreto no WhatsApp) → ficha WA-GLS-XXXXX ----------
 * Instalar (uma vez):
 *   1. Apps Script › ⚙️ Configurações do projeto › Propriedades do script › PORTAL_SEGREDO = <valor que o SQL portal.sql mostrou>
 *   2. Rodar portalSync() uma vez à mão (autorizar o acesso a "serviço externo").
 *   3. Rodar instalaPortalSync() uma vez → cria o gatilho que roda portalSync a cada 5 minutos.
 * A ficha nasce NOVA, origem "Portal WhatsApp": uma pessoa confere (CONFERIDA) antes de lançar no Start.
 */
const SB_URL = 'https://dzfelcufnsltutxeidow.supabase.co', SB_KEY = 'sb_publishable_kKBiEe6G8D_uEYO8NiWDCA_foi3zxwl';
function sbRpc(fn, args) {
  const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'post', contentType: 'application/json',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, payload: JSON.stringify(args), muteHttpExceptions: true });
  const t = r.getContentText();
  if (r.getResponseCode() >= 300) throw new Error(fn + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
function portalSync() {
  const seg = PropertiesService.getScriptProperties().getProperty('PORTAL_SEGREDO');
  if (!seg) throw new Error('falta PORTAL_SEGREDO nas Propriedades do script');
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return 'ocupado';
  const feitos = [];
  try {
    (sbRpc('portal_pendentes', { p_segredo: seg }) || []).forEach(p => {
      const id = 'WA-' + p.codigo;
      const its = (p.itens || []).map(l => ({ pid: l.pid || String(l.id || '').replace(/#arte.*$/, ''), prod: l.nome + (l.variacao ? ' · ' + l.variacao : ''),
        arte: l.arte_nome || 'de sempre', arte_nova: false, cores: '', mil: Number(l.qtd), preco: Number(l.preco), obs: '' }));
      const quando = p.criado_em ? new Date(p.criado_em) : new Date();
      upsert({ aba: 'Fichas_pedido', registro: { id: id, num: '', data: Utilities.formatDate(quando, 'America/Sao_Paulo', 'yyyy-MM-dd'),
        status: 'NOVA', origem: 'Portal WhatsApp', empresa: 'Globo', cliente: p.nome, cliente_chave: p.cliente_chave || '', cliente_doc: '',
        cliente_fone: p.telefone || '', cliente_local: '', vendedor: p.vendedor || '', tabela: p.tabela || 'I',
        itens_txt: its.map(i => i.mil + ' mil ' + i.prod + ' / ' + i.arte).join(' | '), itens: JSON.stringify(its),
        total_itens: String(p.total), acrescimo: '0', desconto: '0', total: String(p.total), pagamento: '', vencimento: '', entrega_prev: '',
        obs: 'Pedido feito pelo cliente no link (' + p.codigo + ')' + (p.obs ? ' — ' + p.obs : ''), start_num: '', criado_em: quando.toISOString() } }, 'portal');
      sbRpc('portal_marca', { p_segredo: seg, p_codigo: p.codigo, p_ficha: id });
      registrarLog('portal', 'portal', { codigo: p.codigo, ficha: id, total: p.total, cliente: p.nome });
      feitos.push(id);
    });
  } finally { trava.releaseLock(); }
  return feitos;
}
function instalaPortalSync() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'portalSync').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('portalSync').timeBased().everyMinutes(5).create();
  return 'gatilho criado: portalSync a cada 5 min';
}
