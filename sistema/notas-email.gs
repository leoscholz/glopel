/**
 * Sistema Globo — Caixa de notas (NF-e que chegam por email → A pagar)
 *
 * O que faz, a cada 30 min:
 *   1. Procura no Gmail desta conta emails com XML de NF-e (ou .zip com XML) ainda não lidos por ele.
 *   2. Lê o XML: fornecedor, número, valor, duplicatas (vencimentos).
 *   3. Guarda XML + PDF no Drive (pasta "NF-e recebidas (email)/AAAA-MM").
 *   4. Grava na planilha do site:  NFe_Recebidas (1 linha por nota) · NFe_Parcelas (1 linha por vencimento)
 *      → as parcelas aparecem sozinhas em Financeiro › A pagar e no Calendário do Sistema Globo.
 *   5. Põe o marcador "NF-e/lida" no email. Email só com PDF (sem XML) vai para a aba NFe_SemXML.
 *   Evento de cancelamento (XML de cancelamento) marca a nota CANCELADA e tira as parcelas do A pagar.
 *   Itens de cada nota → aba NFe_Itens (kg, R$/kg, SKU da bobina): alimentam Bobinas (chegada) e o preço do papel.
 *   Fatura de consumo (Copel, Vivo, SKY…): lê valor e vencimento do email ou do PDF (OCR do Drive) → A pagar.
 *   Nota EMITIDA pela própria empresa (cópia no email) → NFe_Emitidas / NFe_Emitidas_Parcelas (vendas e A receber).
 *   Artes da clicheria (remetentes na aba Artes_Fontes) → Drive "Artes (email)" + aba Artes_Email.
 *   Uma vez só, sozinho: releitura dos emails já lidos (itens e notas emitidas) e raio-x da caixa (aba Email_RaioX).
 *
 * Nunca paga, nunca responde email, nunca apaga nada (nem email, nem linha).
 *
 * INSTALAR (5 min), na conta Google que RECEBE as notas (ou para onde elas são encaminhadas):
 *   1. script.google.com › Novo projeto › colar este arquivo › salvar (nome: "Caixa de notas").
 *   2. Se essa conta NÃO for a dona da planilha do site, compartilhar a planilha com ela (Editor).
 *   3. Preencher CNPJS_EMPRESA abaixo (opcional, mas evita ler nota que a própria Globo emitiu).
 *   4. Escolher a função "instalar" no menu de cima › Executar › autorizar (Gmail, Drive, Planilhas).
 *      Ela cria o gatilho de 30 em 30 min e já faz a primeira leitura (últimos DIAS_INICIO dias).
 *   Testar sem gravar nada: função "testarSemGravar" › Executar › ver o Registro de execução.
 */

// Planilha do site (a mesma que o porteiro usa)
const PLANILHA_SITE = '1EcJLIH3Yqd7Byx9bEdJ167BDf6enCF-oRmwvy2Ozo8g';

// CNPJs das empresas (só números). Nota com destinatário fora desta lista é ignorada.
// Vazio = aceita tudo, menos nota emitida por "EMBALAGENS GLOBO" / "GLOBO IMPRESSOS".
const CNPJS_EMPRESA = {
  '77071967000199': 'Embalagens',
  '59957970000122': 'Impressos',
};

const PASTA_ID = '';          // pasta do Drive para os arquivos; vazio = cria "NF-e recebidas (email)" no Meu Drive
const DIAS_INICIO = 60;       // primeira leitura: quantos dias para trás
const MAX_EMAILS = 25;        // por rodada (o Apps Script tem limite de 6 min)
const MARCA_LIDA = 'NF-e/lida';
const MARCA_ERRO = 'NF-e/erro';
// Auto-ignorar: a lista fica na aba NFe_Ignorar da planilha do site (texto, motivo, status ATIVA/REMOVIDO)
// e é editada pelo site (Financeiro › A pagar › Ignorar automaticamente). Não precisa mexer neste script.

const CAB = {
  NFe_Recebidas: ['id', 'numero', 'serie', 'emissao', 'emitente', 'cnpj_emitente', 'destinatario', 'cnpj_destinatario', 'empresa',
    'valor_total', 'valor_produtos', 'ipi', 'frete', 'n_parcelas', 'forma_pagamento', 'natureza', 'itens', 'categoria',
    'conferir', 'status', 'xml', 'pdf', 'email_de', 'email_assunto', 'email_data', 'atualizado_em', 'por'],
  NFe_Parcelas: ['id', 'chave', 'numero', 'emitente', 'empresa', 'parcela', 'vencimento', 'valor', 'categoria', 'conferir',
    'status', 'pdf', 'atualizado_em', 'por'],
  NFe_SemXML: ['id', 'email_data', 'email_de', 'email_assunto', 'anexos', 'link_email', 'status', 'fornecedor', 'valor', 'vencimento',
    'categoria', 'leitura', 'pdf', 'atualizado_em', 'por'],
  NFe_Itens: ['id', 'chave', 'numero', 'emitente', 'emissao', 'item', 'codigo', 'descricao', 'quantidade', 'unidade', 'kg',
    'valor_unit', 'valor', 'ipi', 'rkg', 'sku', 'papel', 'pedido', 'lote', 'atualizado_em', 'por'],
  NFe_Log: ['id', 'quando', 'o_que', 'detalhe'],
  NFe_Ignorar: ['id', 'texto', 'motivo', 'status', 'atualizado_em', 'por'],
  NFe_Emitidas: ['id', 'numero', 'serie', 'emissao', 'empresa', 'cliente', 'cnpj_cliente', 'valor_total', 'n_parcelas', 'forma_pagamento',
    'natureza', 'itens', 'status', 'email_de', 'email_data', 'atualizado_em', 'por'],
  NFe_Emitidas_Parcelas: ['id', 'chave', 'numero', 'cliente', 'empresa', 'parcela', 'vencimento', 'valor', 'status', 'atualizado_em', 'por'],
  Artes_Fontes: ['id', 'texto', 'nome', 'status', 'atualizado_em', 'por'],
  Artes_Email: ['id', 'email_data', 'fonte', 'email_de', 'assunto', 'arquivo', 'tipo', 'kb', 'link', 'cliente_sugerido', 'status',
    'link_email', 'atualizado_em', 'por'],
  Email_RaioX: ['remetente', 'nome', 'emails', 'com_anexo', 'tipos_anexo', 'ultimo', 'assuntos', 'atualizado_em'],
};

/* ===================== gatilho ===================== */
function instalar() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rodar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rodar').timeBased().everyMinutes(30).create();
  ['NFe_Recebidas', 'NFe_Parcelas', 'NFe_SemXML', 'NFe_Itens', 'NFe_Log', 'NFe_Emitidas', 'NFe_Emitidas_Parcelas', 'Artes_Fontes', 'Artes_Email', 'Email_RaioX'].forEach(n => aba_(SpreadsheetApp.openById(PLANILHA_SITE), n));
  const r = rodar();
  Logger.log('Instalado. Gatilho a cada 30 min. Primeira rodada: ' + JSON.stringify(r));
}
function testarSemGravar() { Logger.log(JSON.stringify(rodar({ seco: true }), null, 1)); }

/* ===================== rodada ===================== */
function rodar(op) {
  op = op || {};
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(10000)) return { ok: false, erro: 'outra rodada em andamento' };
  const t0 = Date.now();
  const res = { emails: 0, notas: 0, repetidas: 0, canceladas: 0, so_pdf: 0, ignoradas: 0, erros: [] };
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_SITE);
    const shN = aba_(ss, 'NFe_Recebidas'), shP = aba_(ss, 'NFe_Parcelas'), shS = aba_(ss, 'NFe_SemXML'), shI = aba_(ss, 'NFe_Itens');
    garantirColunas_(shS, CAB.NFe_SemXML);
    const shE = aba_(ss, 'NFe_Emitidas'), shEP = aba_(ss, 'NFe_Emitidas_Parcelas');
    const jaN = ids_(shN), jaS = ids_(shS), jaE = ids_(shE);
    const novasE = [], novasEP = [];
    const regras = regrasIgnorar_(aba_(ss, 'NFe_Ignorar'));
    const lida = marca_(MARCA_LIDA), erro = marca_(MARCA_ERRO);
    const q = 'has:attachment (filename:xml OR filename:zip OR filename:pdf) -label:' + MARCA_LIDA.replace('/', '-') +
      ' -label:' + MARCA_ERRO.replace('/', '-') + ' newer_than:' + DIAS_INICIO + 'd';
    const threads = GmailApp.search(q, 0, MAX_EMAILS);
    const novasN = [], novasP = [], novasS = [], novasI = [], cancelar = [];
    threads.forEach(th => {
      let fio_ok = true, achouNFe = false;
      th.getMessages().forEach(m => {
        res.emails++;
        const anexos = m.getAttachments({ includeInlineImages: false });
        const xmls = [], pdfs = [];
        anexos.forEach(a => {
          const n = (a.getName() || '').toLowerCase();
          try {
            if (n.endsWith('.xml')) xmls.push({ nome: a.getName(), txt: a.getDataAsString('UTF-8'), blob: a });
            else if (n.endsWith('.pdf')) pdfs.push(a);
            else if (n.endsWith('.zip')) Utilities.unzip(a.copyBlob().setContentType('application/zip')).forEach(b => {
              const bn = (b.getName() || '').toLowerCase();
              if (bn.endsWith('.xml')) xmls.push({ nome: b.getName(), txt: b.getDataAsString('UTF-8'), blob: b });
              else if (bn.endsWith('.pdf')) pdfs.push(b);
            });
          } catch (x) { res.erros.push(a.getName() + ': ' + x); fio_ok = false; }
        });
        let nfesDoEmail = 0;
        xmls.forEach(x => {
          let r;
          try { r = lerXmlNFe(x.txt); } catch (e) { res.erros.push(x.nome + ': ' + e); fio_ok = false; return; }
          if (!r) return;                                   // XML que não é NF-e (ex.: CT-e, NFS-e) → ignora
          achouNFe = true;
          if (r.tipo === 'cancelamento') { cancelar.push(r.chave); res.canceladas++; return; }
          const n = r.nota;
          if (emitidaPor_(n)) {   // nota que a própria empresa emitiu (cópia no email) → vendas / A receber
            achouNFe = true;
            if (!jaE.has(n.chave) && !novasE.some(z => z.id === n.chave)) { emitida_(n, m, novasE, novasEP); res.emitidas = (res.emitidas || 0) + 1; }
            return;
          }
          const emp = empresa_(n);
          if (emp === null) { res.ignoradas++; return; }    // de outro destinatário
          nfesDoEmail++;
          if (jaN.has(n.chave) || novasN.some(z => z.id === n.chave)) { res.repetidas++; return; }
          const ign = ignorar_(regras, [m.getFrom(), m.getSubject(), n.emitenteRazao, n.emitente, n.cnpjEmit].join(' '));
          if (ign) {   // registra a nota (para não ler de novo), sem parcelas e sem itens
            novasN.push({ id: n.chave, numero: n.numero, serie: n.serie, emissao: n.emissao, emitente: n.emitente, cnpj_emitente: n.cnpjEmit,
              destinatario: n.destinatario, cnpj_destinatario: n.cnpjDest, empresa: emp, valor_total: n.vNF, n_parcelas: n.parcelas.length,
              status: 'IGNORADA (' + ign.texto + ')', email_de: m.getFrom(), email_assunto: m.getSubject(), email_data: iso_(m.getDate()) });
            res.ignoradas_regra = (res.ignoradas_regra || 0) + 1; return;
          }
          const pdf = pdfs.find(p => (p.getName() || '').indexOf(n.chave) >= 0) || (pdfs.length === 1 ? pdfs[0] : null);
          const links = op.seco ? { xml: '', pdf: '' } : guardar_(n, x.blob, pdf);
          const cat = categoria_(n.emitente, n.itens);
          const conf = n.parcelas.length ? '' : (n.forma === 'sem pagamento' ? 'sem pagamento na nota' : 'nota sem vencimento: conferir boleto');
          novasN.push({
            id: n.chave, numero: n.numero, serie: n.serie, emissao: n.emissao, emitente: n.emitente, cnpj_emitente: n.cnpjEmit,
            destinatario: n.destinatario, cnpj_destinatario: n.cnpjDest, empresa: emp, valor_total: n.vNF, valor_produtos: n.vProd,
            ipi: n.vIPI, frete: n.vFrete, n_parcelas: n.parcelas.length, forma_pagamento: n.forma, natureza: n.natureza,
            itens: n.itens, categoria: cat, conferir: conf, status: n.autorizada ? 'RECEBIDA' : 'SEM PROTOCOLO',
            xml: links.xml, pdf: links.pdf, email_de: m.getFrom(), email_assunto: m.getSubject(), email_data: iso_(m.getDate()),
          });
          const parc = n.parcelas.length ? n.parcelas
            : (n.forma === 'sem pagamento' ? [] : [{ nDup: '1', venc: n.emissao, valor: n.vNF }]);
          parc.forEach((p, i) => novasP.push({
            id: n.chave + ':' + (p.nDup || (i + 1)), chave: n.chave, numero: n.numero, emitente: n.emitente, empresa: emp,
            parcela: (i + 1) + '/' + parc.length, vencimento: p.venc, valor: p.valor, categoria: cat, conferir: conf,
            status: 'ATIVA', pdf: links.pdf,
          }));
          n.det.forEach(d => novasI.push(Object.assign({ id: n.chave + ':' + d.item, chave: n.chave, numero: n.numero, emitente: n.emitente, emissao: n.emissao }, d)));
          res.notas++;
        });
        if (!xmls.length && pdfs.length && pareceNota_(m, pdfs)) {
          const id = m.getId();
          if (!jaS.has(id)) {
            const st = tipoSemXml_(m, pdfs);
            const reg = { id, email_data: iso_(m.getDate()), email_de: m.getFrom(), email_assunto: m.getSubject(),
              anexos: pdfs.map(p => p.getName()).join(' | '), link_email: 'https://mail.google.com/mail/u/0/#all/' + th.getId(), status: st };
            const ignF = ignorar_(regras, m.getFrom() + ' ' + m.getSubject() + ' ' + reg.anexos);
            if (ignF) { reg.status = 'IGNORADA (' + ignF.texto + ')'; res.ignoradas_regra = (res.ignoradas_regra || 0) + 1; }
            else if (st === 'FATURA DE CONSUMO' && !op.seco) Object.assign(reg, lerFatura_(m, pdfs[0]));
            novasS.push(reg);
            res.so_pdf++;
          }
        }
      });
      if (!op.seco) th.addLabel(fio_ok ? lida : erro);
    });
    if (!op.seco) {
      anexar_(shN, novasN); anexar_(shP, novasP); anexar_(shS, novasS); anexar_(shI, novasI); anexar_(shE, novasE); anexar_(shEP, novasEP);
      res.faturas_completadas = completarFaturas_(shS);
      try { res.artes = artes_(ss); } catch (e) { res.erros.push('artes: ' + e); }
      try { res.extra = extras_(ss, t0); } catch (e) { res.erros.push('extra: ' + e); }
      if (cancelar.length) { cancelar_(shN, shP, cancelar); cancelar_(shE, shEP, cancelar); }
      if (res.notas || res.so_pdf || res.canceladas || res.emitidas || res.artes || res.extra || res.erros.length) log_(ss, 'rodada', res);
    } else { res.previa = { notas: novasN, parcelas: novasP, so_pdf: novasS, cancelar }; }
    return res;
  } finally { trava.releaseLock(); }
}

/* ===================== leitura do XML (sem dependências; testável fora do Google) ===================== */
function lerXmlNFe(xml) {
  xml = String(xml || '');
  const T = (s, t) => { const r = new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + t + '>').exec(s); return r ? dec_(r[1].trim()) : ''; };
  const B = (s, t) => { const out = [], re = new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'g'); let r; while ((r = re.exec(s))) out.push(r[1]); return out; };
  const N = v => { const x = parseFloat(v); return isNaN(x) ? '' : Math.round(x * 100) / 100; };
  // evento de cancelamento
  if (/<(?:\w+:)?(procEventoNFe|envEvento|evento)[\s>]/.test(xml) && !/<(?:\w+:)?infNFe[\s>]/.test(xml)) {
    if (T(xml, 'tpEvento') === '110111' && (!T(xml, 'cStat') || /^(135|136|155)$/.test(T(B(xml, 'retEvento')[0] || xml, 'cStat'))))
      return { tipo: 'cancelamento', chave: T(xml, 'chNFe') };
    return null;
  }
  const inf = B(xml, 'infNFe')[0];
  if (!inf) return null;
  const idm = /<(?:\w+:)?infNFe[^>]*Id="(?:NFe)?(\d{44})"/.exec(xml);
  const chave = idm ? idm[1] : T(xml, 'chNFe');
  if (!chave) return null;
  const ide = B(inf, 'ide')[0] || '', emit = B(inf, 'emit')[0] || '', dest = B(inf, 'dest')[0] || '', tot = B(inf, 'ICMSTot')[0] || '';
  const emis = (T(ide, 'dhEmi') || T(ide, 'dEmi')).slice(0, 10);
  const dups = B(B(inf, 'cobr')[0] || '', 'dup').map(d => ({ nDup: T(d, 'nDup'), venc: T(d, 'dVenc').slice(0, 10), valor: N(T(d, 'vDup')) }))
    .filter(d => d.venc).sort((a, b) => a.venc < b.venc ? -1 : 1);
  const tp = B(B(inf, 'pag')[0] || '', 'detPag').map(d => T(d, 'tPag'));
  const FORMAS = { '01': 'dinheiro', '02': 'cheque', '03': 'cartão de crédito', '04': 'cartão de débito', '05': 'crédito loja', '15': 'boleto', '16': 'depósito', '17': 'Pix', '18': 'transferência', '90': 'sem pagamento', '99': 'outros' };
  const itens = B(inf, 'det').map(d => { const p = B(d, 'prod')[0] || ''; return T(p, 'xProd') + ' (' + fmtQ_(T(p, 'qCom')) + ' ' + T(p, 'uCom') + ')'; });
  const det = B(inf, 'det').map((d, i) => {
    const p = B(d, 'prod')[0] || '', q = parseFloat(T(p, 'qCom')), u = T(p, 'uCom').toUpperCase(), v = N(T(p, 'vProd'));
    const kg = isNaN(q) ? '' : /^(T|TO|TON|TL|TONELADA)/.test(u) ? Math.round(q * 1000 * 10) / 10 : /^KG|^QUILO/.test(u) ? q : '';
    const desc = T(p, 'xProd'), sku = skuDe_(desc);
    return { item: i + 1, codigo: T(p, 'cProd'), descricao: desc, quantidade: isNaN(q) ? '' : q, unidade: T(p, 'uCom'), kg,
      valor_unit: N(T(p, 'vUnCom')), valor: v, ipi: N(T(B(d, 'IPITrib')[0] || '', 'vIPI')) || 0,
      rkg: kg && v !== '' ? Math.round(v / kg * 10000) / 10000 : '', sku, papel: papelDe_(sku),
      pedido: T(p, 'xPed'), lote: T(B(d, 'rastro')[0] || '', 'nLote') || ((T(d, 'infAdProd').match(/LOTE[:\s]*([\w\/-]+)/i) || [])[1] || '') };
  });
  const prot = B(xml, 'protNFe')[0] || '';
  return {
    tipo: 'nfe',
    nota: {
      chave, numero: T(ide, 'nNF'), serie: T(ide, 'serie'), emissao: emis, natureza: T(ide, 'natOp'), tpNF: T(ide, 'tpNF'),
      emitente: T(emit, 'xFant') && T(emit, 'xFant').length < T(emit, 'xNome').length ? T(emit, 'xFant') + ' (' + T(emit, 'xNome') + ')' : T(emit, 'xNome'),
      emitenteRazao: T(emit, 'xNome'), cnpjEmit: T(emit, 'CNPJ') || T(emit, 'CPF'),
      destinatario: T(dest, 'xNome'), cnpjDest: T(dest, 'CNPJ') || T(dest, 'CPF'),
      vNF: N(T(tot, 'vNF')), vProd: N(T(tot, 'vProd')), vIPI: N(T(tot, 'vIPI')), vFrete: N(T(tot, 'vFrete')),
      parcelas: dups, det, forma: tp.map(t => FORMAS[t] || t).filter((v, i, a) => a.indexOf(v) === i).join(' + '),
      itens: (itens.slice(0, 4).join(' · ') + (itens.length > 4 ? ' · +' + (itens.length - 4) + ' itens' : '')).slice(0, 480),
      autorizada: !prot || T(prot, 'cStat') === '100' || T(prot, 'cStat') === '150',
    },
  };
}
function dec_(s) { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'"); }
function fmtQ_(q) { const x = parseFloat(q); return isNaN(x) ? q : String(Math.round(x * 1000) / 1000).replace('.', ','); }

/* ===================== bobinas: SKU a partir da descrição do item ===================== */
// Regra do SKU (doc Bobinas-Estoque): TIPO + gramatura + '-' + largura cm. Ex.: "PAPEL FINE KRAFT BRANCO 40gr 150X800" → KB40-15
function skuDe_(desc) {
  const u = String(desc || '').toUpperCase();
  if (!/PAPEL|KRAFT|MONOL|\bMG\b|GREASE|STRONG/.test(u)) return '';
  const g = (u.match(/(\d{2})\s*(?:GR|GRS|G\/M|G\b|GM)/) || [])[1];
  let cm = '';
  const mx = u.match(/(\d{2,4})\s*X\s*\d{3,4}/), mc = u.match(/(\d{2,3})\s*CM/);
  if (mx) cm = String(Math.round(parseInt(mx[1], 10) / 10)); else if (mc) cm = String(parseInt(mc[1], 10));
  const t = /GREASE/.test(u) ? 'G' : /STRONG/.test(u) ? 'ST' : /MONOL|\bMG\b/.test(u) ? 'MG' : /BRANCO/.test(u) ? 'KB' : /KRAFT/.test(u) ? 'KN' : '';
  return t && g && cm ? t + g + '-' + cm : '';
}
// Código do papel na tabela de preços / Precificador: KB40, K35, M30, G32, STRONG
function papelDe_(sku) {
  const m = String(sku || '').match(/^([A-Z]+)(\d+)-/); if (!m) return '';
  return ({ KB: 'KB', KN: 'K', MG: 'M', G: 'G' })[m[1]] ? ({ KB: 'KB', KN: 'K', MG: 'M', G: 'G' })[m[1]] + m[2] : m[1] === 'ST' ? 'STRONG' : '';
}

/* ===================== faturas de consumo: valor e vencimento ===================== */
function fornecedorFatura_(de, assunto) {
  const t = (de + ' ' + assunto).toUpperCase();
  const L = [['COPEL', 'Copel', 'Energia e água'], ['SANEPAR', 'Sanepar', 'Energia e água'], ['VIVO', 'Vivo', 'Assinaturas'], ['CLARO', 'Claro', 'Assinaturas'],
    ['SKY', 'SKY', 'Assinaturas'], ['TIM', 'TIM', 'Assinaturas'], ['OI ', 'Oi', 'Assinaturas']];
  for (const [k, n, c] of L) if (new RegExp('\\b' + k.trim() + '\\b').test(t)) return { fornecedor: n, categoria: c };
  const nome = (String(de).match(/^\s*"?([^"<]+?)"?\s*</) || [])[1] || String(de).replace(/.*@/, '').split('.')[0];
  return { fornecedor: nome.trim(), categoria: 'Outros' };
}
function extrairValorVenc_(txt, ref) {
  const t = String(txt || '').replace(/\s+/g, ' ');
  // Fatura costuma trazer vencimentos antigos (histórico): vale o 1º vencimento a partir de 10 dias antes do email
  const lim = ref ? new Date(ref.getTime() - 10 * 864e5).toISOString().slice(0, 10) : '';
  const todas = [...t.matchAll(/venc[a-zçã]*\s*(?:em|:)?\s*[^\d]{0,25}(\d{2}\/\d{2}\/\d{2,4})/gi)].map(x => x[1]);
  const isoD = s => { const [d, mo, y] = s.split('/'); return (y.length === 2 ? '20' + y : y) + '-' + mo + '-' + d; };
  const dm = todas.length ? [null, (todas.find(x => isoD(x) >= lim) || todas[0])] : null;
  const vm = t.match(/(?:total a pagar|valor a pagar|valor total|total da fatura|valor do documento|valor cobrado|valor da fatura|total)\s*[:\-]?\s*(?:R\$)?\s*([\d.]{1,9},\d{2})/i);
  let venc = '';
  if (dm) venc = isoD(dm[1]);
  if (venc && lim && venc < lim) venc = '';   // só achou data velha: deixa para conferir
  return { valor: vm ? Math.round(parseFloat(vm[1].replace(/\./g, '').replace(',', '.')) * 100) / 100 : '', vencimento: venc };
}
function lerFatura_(m, pdf) {
  const out = fornecedorFatura_(m.getFrom(), m.getSubject());
  let r = extrairValorVenc_(m.getPlainBody(), m.getDate()), fonte = 'email';
  if ((!r.valor || !r.vencimento) && pdf) {
    try { const o = extrairValorVenc_(ocr_(pdf), m.getDate()); r = { valor: r.valor || o.valor, vencimento: r.vencimento || o.vencimento }; fonte = 'pdf'; }
    catch (e) { fonte = 'erro OCR: ' + String(e).slice(0, 80); }
  }
  if (pdf) { try { out.pdf = guardarFatura_(out.fornecedor, iso_(m.getDate()), pdf); } catch (e) { } }
  return Object.assign(out, r, { leitura: r.valor && r.vencimento ? fonte : 'conferir (' + (fonte === 'pdf' || fonte === 'email' ? 'faltou ' + (!r.valor ? 'valor' : 'vencimento') : fonte.replace('Drive 400', 'PDF com senha ou ilegível')) + ')' });
}
function completarFaturas_(sh) {
  const v = sh.getDataRange().getDisplayValues(), h = v[0], c = k => h.indexOf(k);
  let n = 0;
  for (let i = 1; i < v.length && n < 10; i++) {
    if (v[i][c('status')] !== 'FATURA DE CONSUMO' || v[i][c('valor')] || v[i][c('leitura')]) continue;
    let m; try { m = GmailApp.getMessageById(v[i][c('id')]); } catch (e) { continue; }
    const pdf = m.getAttachments({ includeInlineImages: false }).filter(a => /\.pdf$/i.test(a.getName()))[0];
    const r = lerFatura_(m, pdf);
    ['fornecedor', 'valor', 'vencimento', 'categoria', 'leitura', 'pdf'].forEach(k => { if (c(k) >= 0 && r[k] != null) sh.getRange(i + 1, c(k) + 1).setNumberFormat('@').setValue(String(r[k])); });
    n++;
  }
  return n;
}
// OCR do Drive: converte o PDF em Google Doc temporário, lê o texto e manda o Doc para a lixeira
function ocr_(pdf) {
  const meta = { name: 'tmp-ocr-' + Date.now(), mimeType: 'application/vnd.google-apps.document' };
  const b = Utilities.getUuid(), blob = pdf.copyBlob();
  const corpo = Utilities.newBlob('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
    '\r\n--' + b + '\r\nContent-Type: application/pdf\r\n\r\n').getBytes().concat(blob.getBytes()).concat(Utilities.newBlob('\r\n--' + b + '--').getBytes());
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=pt', {
    method: 'post', contentType: 'multipart/related; boundary=' + b, payload: corpo,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('Drive ' + r.getResponseCode());
  const id = JSON.parse(r.getContentText()).id;
  try { return DocumentApp.openById(id).getBody().getText(); } finally { DriveApp.getFileById(id).setTrashed(true); }
}
function guardarFatura_(forn, data, pdf) {
  const raiz = pasta_(), it = raiz.getFoldersByName('Faturas'), f = it.hasNext() ? it.next() : raiz.createFolder('Faturas');
  const nome = data + '_' + forn.replace(/[^\wÀ-ú]/g, '') + '.pdf', ex = f.getFilesByName(nome);
  return (ex.hasNext() ? ex.next() : f.createFile(pdf.copyBlob().setName(nome))).getUrl();
}
function garantirColunas_(sh, cab) {
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(String);
  cab.forEach(c => { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setNumberFormat('@').setValue(c); } });
}

/* ===================== notas emitidas pela própria empresa ===================== */
function emitidaPor_(n) { return CNPJS_EMPRESA[String(n.cnpjEmit || '').replace(/\D/g, '')] || null; }
function emitida_(n, m, novasE, novasEP) {
  const emp = emitidaPor_(n);
  novasE.push({ id: n.chave, numero: n.numero, serie: n.serie, emissao: n.emissao, empresa: emp, cliente: n.destinatario, cnpj_cliente: n.cnpjDest,
    valor_total: n.vNF, n_parcelas: n.parcelas.length, forma_pagamento: n.forma, natureza: n.natureza, itens: n.itens,
    status: n.autorizada ? 'AUTORIZADA' : 'SEM PROTOCOLO', email_de: m.getFrom(), email_data: iso_(m.getDate()) });
  n.parcelas.forEach((p, i) => novasEP.push({ id: n.chave + ':' + (p.nDup || (i + 1)), chave: n.chave, numero: n.numero, cliente: n.destinatario,
    empresa: emp, parcela: (i + 1) + '/' + n.parcelas.length, vencimento: p.venc, valor: p.valor, status: 'ATIVA' }));
}

/* ===================== tarefas de uma vez só (releitura, raio-x) — uma por rodada, com folga de tempo ===================== */
function extras_(ss, t0) {
  const P = PropertiesService.getScriptProperties();
  if (Date.now() - t0 > 60000) return '';
  if (!P.getProperty('releitura_v1')) { const r = releitura_(ss); P.setProperty('releitura_v1', new Date().toISOString()); return 'releitura ' + JSON.stringify(r); }
  if (!P.getProperty('raiox_v1')) { const r = raioX_(ss); P.setProperty('raiox_v1', new Date().toISOString()); return 'raio-x ' + r; }
  return '';
}
// Rodar à mão quando quiser: raio-x agora (e marca como feito)
function raioX() { Logger.log(raioX_(SpreadsheetApp.openById(PLANILHA_SITE))); PropertiesService.getScriptProperties().setProperty('raiox_v1', new Date().toISOString()); }
function releitura() { Logger.log(JSON.stringify(releitura_(SpreadsheetApp.openById(PLANILHA_SITE)))); PropertiesService.getScriptProperties().setProperty('releitura_v1', new Date().toISOString()); }
// Emails já marcados NF-e/lida: pega notas emitidas e os itens das notas recebidas que ficaram sem itens
function releitura_(ss) {
  const shN = aba_(ss, 'NFe_Recebidas'), shI = aba_(ss, 'NFe_Itens'), shE = aba_(ss, 'NFe_Emitidas'), shEP = aba_(ss, 'NFe_Emitidas_Parcelas');
  const jaN = ids_(shN), jaE = ids_(shE), comItens = new Set([...ids_(shI)].map(x => x.split(':')[0]));
  const novasI = [], novasE = [], novasEP = [];
  GmailApp.search('label:' + MARCA_LIDA.replace('/', '-') + ' newer_than:' + DIAS_INICIO + 'd', 0, 100).forEach(th => th.getMessages().forEach(m => {
    m.getAttachments({ includeInlineImages: false }).filter(a => /\.xml$/i.test(a.getName())).forEach(a => {
      let r; try { r = lerXmlNFe(a.getDataAsString('UTF-8')); } catch (e) { return; }
      if (!r || r.tipo !== 'nfe') return; const n = r.nota;
      if (emitidaPor_(n)) { if (!jaE.has(n.chave) && !novasE.some(z => z.id === n.chave)) emitida_(n, m, novasE, novasEP); return; }
      if (jaN.has(n.chave) && !comItens.has(n.chave)) { comItens.add(n.chave);
        n.det.forEach(d => novasI.push(Object.assign({ id: n.chave + ':' + d.item, chave: n.chave, numero: n.numero, emitente: n.emitente, emissao: n.emissao }, d))); }
    });
  }));
  anexar_(shI, novasI); anexar_(shE, novasE); anexar_(shEP, novasEP);
  return { itens: novasI.length, emitidas: novasE.length };
}
// Raio-x: quem manda email e com que anexos (últimos 90 dias). Só cabeçalho: remetente, assunto, tipo de anexo.
function raioX_(ss) {
  const sh = aba_(ss, 'Email_RaioX'), t0 = Date.now(), M = {};
  for (let i = 0; i < 1000 && Date.now() - t0 < 200000; i += 100) {
    const ths = GmailApp.search('newer_than:90d', i, 100); if (!ths.length) break;
    GmailApp.getMessagesForThreads(ths).forEach(ms => ms.forEach(m => {
      const de = m.getFrom(), em = ((de.match(/<([^>]+)>/) || [])[1] || de).toLowerCase().trim();
      const x = M[em] = M[em] || { nome: (de.match(/^\s*"?([^"<]+?)"?\s*</) || [])[1] || '', n: 0, anexo: 0, tipos: {}, ult: '', ass: [] };
      x.n++; const d = iso_(m.getDate()); if (d > x.ult) x.ult = d;
      const s = m.getSubject().replace(/^(re|fw|fwd|enc|res):\s*/i, '').slice(0, 70); if (x.ass.length < 4 && x.ass.indexOf(s) < 0) x.ass.push(s);
      if (Date.now() - t0 < 200000) { const at = m.getAttachments({ includeInlineImages: false });
        if (at.length) { x.anexo++; at.forEach(a => { const e = ((a.getName() || '').match(/\.([a-z0-9]{2,4})$/i) || [, '?'])[1].toLowerCase(); x.tipos[e] = (x.tipos[e] || 0) + 1; }); } }
    }));
  }
  const agora = new Date().toISOString();
  const linhas = Object.entries(M).sort((a, b) => b[1].n - a[1].n).map(([em, x]) => [em, x.nome, String(x.n), String(x.anexo),
    Object.entries(x.tipos).map(([k, v]) => k + ':' + v).join(' '), x.ult, x.ass.join(' | '), agora]);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CAB.Email_RaioX.length).clearContent();
  if (linhas.length) sh.getRange(2, 1, linhas.length, CAB.Email_RaioX.length).setNumberFormat('@').setValues(linhas);
  return linhas.length + ' remetentes';
}

/* ===================== artes da clicheria ===================== */
const EXT_ARTE = /\.(pdf|ai|eps|cdr|svg|jpe?g|png|tiff?|zip|psd)$/i;
function fontesArtes_(sh) {
  const v = sh.getDataRange().getDisplayValues(); if (v.length < 2) return [];
  const h = v[0], it = h.indexOf('texto'), inm = h.indexOf('nome'), is = h.indexOf('status');
  return v.slice(1).filter(r => r[it] && String(r[is] || 'ATIVA').toUpperCase() === 'ATIVA').map(r => ({ texto: r[it].trim(), nome: r[inm] || r[it].trim() }));
}
function artes_(ss) {
  const shF = aba_(ss, 'Artes_Fontes'), shA = aba_(ss, 'Artes_Email'), F = fontesArtes_(shF);
  if (!F.length) return 0;                                        // sem fonte cadastrada: não faz nada
  const marca = marca_('Artes/lida'), ja = ids_(shA), novas = [];
  const q = '(' + F.map(f => '"' + f.texto.replace(/"/g, '') + '"').join(' OR ') + ') has:attachment -label:artes-lida newer_than:120d';
  GmailApp.search(q, 0, 20).forEach(th => {
    th.getMessages().forEach(m => {
      const at = m.getAttachments({ includeInlineImages: false });
      const temXml = at.some(a => /\.xml$/i.test(a.getName()));
      const fonte = (F.find(f => normal_(m.getFrom() + ' ' + m.getSubject()).indexOf(normal_(f.texto)) >= 0) || F[0]).nome;
      at.forEach((a, i) => {
        const nome = a.getName() || ('anexo' + i), kb = Math.round(a.getSize() / 1024);
        if (!EXT_ARTE.test(nome) || kb < 25) return;              // assinatura, logo de rodapé
        if (temXml && /\.pdf$/i.test(nome)) return;                // DANFE de nota fiscal, não é arte
        const id = m.getId() + ':' + i; if (ja.has(id)) return;
        const link = guardarArte_(fonte, iso_(m.getDate()), nome, a);
        novas.push({ id, email_data: iso_(m.getDate()), fonte, email_de: m.getFrom(), assunto: m.getSubject(), arquivo: nome,
          tipo: (nome.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase(), kb, link, cliente_sugerido: clienteDe_(m.getSubject() + ' ' + nome),
          status: 'NOVA', link_email: 'https://mail.google.com/mail/u/0/#all/' + th.getId() });
      });
    });
    th.addLabel(marca);
  });
  anexar_(shA, novas);
  return novas.length;
}
function guardarArte_(fonte, data, nome, blob) {
  const raizIt = DriveApp.getFoldersByName('Artes (email)'), raiz = raizIt.hasNext() ? raizIt.next() : DriveApp.createFolder('Artes (email)');
  const sub = (pai, n) => { const it = pai.getFoldersByName(n); return it.hasNext() ? it.next() : pai.createFolder(n); };
  const pasta = sub(sub(raiz, fonte.replace(/[\/\\]/g, '-')), data.slice(0, 7));
  const arq = data + '_' + nome, ex = pasta.getFilesByName(arq);
  return (ex.hasNext() ? ex.next() : pasta.createFile(blob.copyBlob().setName(arq))).getUrl();
}
// Palpite do cliente pelo assunto/nome do arquivo (a conferência é humana; o casamento com o cadastro fica para o site)
function clienteDe_(t) {
  return String(t || '').replace(/\.[a-z0-9]{2,4}\b/gi, ' ')
    .replace(/\b(re|fw|fwd|enc|res|prova|provas|arte|artes|layout|clich[eê]s?|clicheria|aprova[cç][aã]o|aprovad[oa]|ok|final|novo|nova|revis[aã]o|rev\d*|v\d+|cores?|saco|sacos|pdf|jpg|png|segue|seguem|em anexo|anexo|para|de|do|da)\b/gi, ' ')
    .replace(/\d+\s*x\s*\d+/gi, ' ').replace(/[_\-–.,:;()\[\]#]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 50);
}

/* ===================== auto-ignorar ===================== */
const normal_ = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function regrasIgnorar_(sh) {
  const v = sh.getDataRange().getDisplayValues(); if (v.length < 2) return [];
  const h = v[0], it = h.indexOf('texto'), is = h.indexOf('status');
  return v.slice(1).filter(r => r[it] && String(r[is] || 'ATIVA').toUpperCase() === 'ATIVA').map(r => ({ texto: String(r[it]).trim() }));
}
// Casa palavra inteira, sem acento e sem diferença de maiúscula ("vivo" pega "Vivo" mas não "vivos"; CNPJ também vale)
function ignorar_(regras, texto) {
  const t = normal_(texto), so = t.replace(/[^\d]/g, '');
  return regras.find(r => { const x = normal_(r.texto).trim(); if (!x) return false;
    if (/^[\d.\/-]+$/.test(x) && x.replace(/\D/g, '').length >= 8) return so.indexOf(x.replace(/\D/g, '')) >= 0;
    return new RegExp('(^|[^a-z0-9])' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t); }) || null;
}

/* ===================== regras ===================== */
function empresa_(n) {
  const so = s => String(s || '').replace(/\D/g, '');
  const lista = Object.keys(CNPJS_EMPRESA);
  if (lista.length) {
    if (lista.indexOf(so(n.cnpjEmit)) >= 0) return null;          // nota emitida pela própria Globo
    return CNPJS_EMPRESA[so(n.cnpjDest)] || null;
  }
  if (/EMBALAGENS GLOBO|GLOBO IMPRESSOS/i.test(n.emitenteRazao)) return null;
  return /IMPRESSOS/i.test(n.destinatario) ? 'Impressos' : /GLOBO/i.test(n.destinatario) ? 'Embalagens' : (n.destinatario || '?');
}
function categoria_(emit, itens) {
  const e = (String(emit || '') + ' ' + String(itens || '')).toUpperCase();
  const R = [[/IRANI|LUTEPEL|PAPEL|CELULOSE|KLABIN|SUZANO|WESTROCK|BOBINA/, 'Papel'], [/COPEL|SANEPAR|ENERGIA|SANEAMENTO/, 'Energia e água'],
    [/POSTO|COMBUST|AUTO ?PE[CÇ]|PNEU|TRANSPORT|LOG[IÍ]STICA/, 'Frota'], [/TINTA|COLA|ADESIV|QU[IÍ]MIC|CLICH|FOTOPOL|SOLVENTE|PL[AÁ]STIC|FILME|ENFESTAD|BOBINA PL/, 'Insumos'],
    [/TELECOM|INTERNET|SOFTWARE|SISTEMA|IOB|SAGE|VIVO|CLARO|TIM /, 'Assinaturas'], [/CONTAB|ADVOC|MANUTEN/, 'Serviços']];
  const so = String(emit || '').toUpperCase();
  if (R[0][0].test(so)) return 'Papel';
  for (const [re, c] of R.slice(1)) if (re.test(e)) return c;
  if (R[0][0].test(e)) return 'Papel';
  return 'Outros';
}
// Fatura de consumo (Copel, Vivo, SKY…) não tem NF-e com XML: vira conta fixa, não "pedir XML"
function tipoSemXml_(m, pdfs) {
  const t = (m.getFrom() + ' ' + m.getSubject() + ' ' + pdfs.map(p => p.getName()).join(' ')).toLowerCase();
  return /fatura|conta digital|copel|sanepar|vivo|claro|\btim\b|sky|net |oi |internet|energia/.test(t) && !/nf-?e|danfe|nota fiscal/.test(t) ? 'FATURA DE CONSUMO' : 'PEDIR XML';
}
function pareceNota_(m, pdfs) {
  const t = (m.getSubject() + ' ' + pdfs.map(p => p.getName()).join(' ')).toLowerCase();
  return /nf-?e|nota fiscal|danfe|\bnf\b|fatura|\d{44}/.test(t);
}

/* ===================== planilha / drive / gmail ===================== */
function aba_(ss, nome) {
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, CAB[nome].length).setValues([CAB[nome]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function ids_(sh) { const u = sh.getLastRow(); return new Set(u < 2 ? [] : sh.getRange(2, 1, u - 1, 1).getDisplayValues().map(r => String(r[0]))); }
function anexar_(sh, regs) {
  if (!regs.length) return;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(String);
  const agora = new Date().toISOString();
  const linhas = regs.map(r => head.map(h => h === 'atualizado_em' ? agora : h === 'por' ? 'caixa de notas' : (r[h] == null ? '' : String(r[h]))));
  const ini = sh.getLastRow() + 1;
  sh.getRange(ini, 1, linhas.length, head.length).setNumberFormat('@').setValues(linhas);
}
function cancelar_(shN, shP, chaves) {
  const set = new Set(chaves), agora = new Date().toISOString();
  [[shN, 'id', 'CANCELADA'], [shP, 'chave', 'REMOVIDO']].forEach(([sh, col, st]) => {
    const v = sh.getDataRange().getDisplayValues(), h = v[0], ic = h.indexOf(col), is = h.indexOf('status'), ia = h.indexOf('atualizado_em');
    for (let i = 1; i < v.length; i++) if (set.has(String(v[i][ic]))) {
      sh.getRange(i + 1, is + 1).setValue(st); if (ia >= 0) sh.getRange(i + 1, ia + 1).setValue(agora);
    }
  });
}
function log_(ss, oque, det) {
  aba_(ss, 'NFe_Log').appendRow([Utilities.getUuid().slice(0, 8), new Date().toISOString(), oque, JSON.stringify(det).slice(0, 4000)]);
}
function pasta_() {
  if (PASTA_ID) return DriveApp.getFolderById(PASTA_ID);
  const it = DriveApp.getFoldersByName('NF-e recebidas (email)');
  return it.hasNext() ? it.next() : DriveApp.createFolder('NF-e recebidas (email)');
}
function guardar_(n, xmlBlob, pdf) {
  const raiz = pasta_(), mes = (n.emissao || iso_(new Date())).slice(0, 7);
  const it = raiz.getFoldersByName(mes), sub = it.hasNext() ? it.next() : raiz.createFolder(mes);
  const base = n.emissao + '_' + String(n.emitenteRazao || '').replace(/[^\wÀ-ú ]/g, '').trim().split(/\s+/).slice(0, 3).join('-') + '_NF' + n.numero;
  const ex = sub.getFilesByName(base + '.xml');
  const fx = ex.hasNext() ? ex.next() : sub.createFile(xmlBlob.copyBlob().setName(base + '.xml'));
  let fp = null;
  if (pdf) { const ep = sub.getFilesByName(base + '.pdf'); fp = ep.hasNext() ? ep.next() : sub.createFile(pdf.copyBlob().setName(base + '.pdf')); }
  return { xml: fx.getUrl(), pdf: fp ? fp.getUrl() : '' };
}
function marca_(n) { return GmailApp.getUserLabelByName(n) || GmailApp.createLabel(n); }
function iso_(d) { return Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd'); }

// Para testes fora do Google (node): module.exports
if (typeof module !== 'undefined') module.exports = { clienteDe_, emitidaPor_, ignorar_, lerXmlNFe, empresa_, categoria_, tipoSemXml_, skuDe_, papelDe_, extrairValorVenc_, fornecedorFatura_ };
