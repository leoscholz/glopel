/* =========================================================
   Orçamentos — gerador de PDF com visualização 3D (27-11-2026)
   Comercial › Orçamentos do Sistema Globo. Carregado DEPOIS do script principal do index.html
   (usa esc, brl, fmt, iso, hoje, addD, dBR, CATALOGO, kBase, fpDL, fpCli, fpProd, fpRot, fpAvisoMin, FP_PAG, FP_TAB,
   REM, L, salvaL, API, gravarSis, avisoGrav, gravBox, remBanner, quem, render, fpNova).
   Grava na planilha do site (aba Orcamentos) pelo porteiro (upsert genérico); sem porteiro, fica só neste navegador.
   3D: fotos prontas do GloboEditor com arte demonstrativa "SUA MARCA" (sistema/orcamento/3d/<faca>_<kraft|branco>.jpg,
   geradas por sistema/orcamento/render_3d_orcamento.py). Sem faca no editor: foto do catálogo da loja.
   PDF: jsPDF 2.5.1 (cdnjs) + Inter / Archivo Narrow embutidas (orcamento/fontes.js, carregado sob demanda).
   ========================================================= */
const ORC_ST = {'RASCUNHO':'grey', 'ENVIADO':'warn', 'APROVADO':'ok', 'RECUSADO':'bad'};
const ORC_EMP = {razao:'EMBALAGENS GLOBO INDÚSTRIA E COMÉRCIO LTDA', cnpj:'77.071.967/0001-99', ie:'10.135.951-40',
  end:'Rod. dos Minérios (PR-092), 1158 · Taboão · Curitiba-PR · CEP 82130-570', tel:'(41) 3364-7082', wa:'(41) 99145-5539', site:'embalagens.app'};
/* nome do produto no catálogo → faca do GloboEditor (mesmo mapa do FACA_TAB do editor, invertido) */
const ORC_FACA = {'Saco ½ kg':'f05', 'Saco 900 g':'f900', 'Saco 1 kg':'f1', 'Saco 2 kg':'f2', 'Saco 3 kg':'f3', 'Saco 5 kg':'f5', 'Saco 7,5 kg':'f75',
  'Saco 10 kg':'f10', 'Saco 15 kg':'f15', 'Saco batatinha 120 g':'fbat120', 'Saco batatinha 180 g':'fbat180', 'Saco semente':'fsem',
  'Saco hambúrguer':'fhb', 'Saco hamburgão':'fham', 'Saco 13,5 × 17,5 cm':'f1317', 'Porta-talher estreito':'t65', 'Porta-talher largo':'t85'};
/* sem faca no editor: foto do catálogo da loja (editor-sacolas/fotos_catalogo), como o FOTO_REUSO da loja */
const ORC_FOTO = {'Saco 13,5 × 21,5 cm':'135x215', 'Saco baguete':'baguete', 'Saco baguete com visor':'baguete_visor', 'Saco miniburger':'miniburger',
  'Saco pipoca':'pipoca', 'Saco pipoquinha':'pipoquinha', 'Saco bijuteria':'bijuteria', 'Saco farmácia':'farmacia', 'Saco nº 2':'n2', 'Saco 13,5 × 27 cm':'n2',
  'Envelope aberto 14 × 14 cm':'env_140x135', 'Envelope aberto 14 × 17,5 cm':'env_140x175', 'Envelope aberto 16,5 × 17,5 cm':'env_170x170',
  'Envelope aberto 20 × 21,5 cm':'env_170x170', 'Envelope aberto 16,5 × 21 cm':'env_170x210', 'Envelope aberto 16,5 × 25 cm':'env_170x250',
  'Envelope batatinha 10 × 12 cm':'envelopinho10', 'Envelope fechado 18 × 21,5 cm':'envelopinho10'};
const ORC_FOTO_CAT = {lamina:'real_lamina', bandeja:'real_bandeja', bobina:'real_bobina'};
const ORC_VALIDADE = 15;   // dias (padrão; editável em cada orçamento)
let ORC = null, orcVer = null, orcBusca = '', orcFilt = 'todos', ORC_PDF = null;

const orcs = () => (REM && REM.orcs) ? REM.orcs : (L.orcs || []);
const orcPapel3d = p => /pardo|semi/i.test(p.papel || '') ? 'kraft' : 'branco';
function orcVisual(p){
  if (!p) return null;
  const f = ORC_FACA[p.nome]; if (f) return {src:`orcamento/3d/${f}_${orcPapel3d(p)}.jpg`, tipo:'3d'};
  const k = ORC_FOTO[p.nome] || ORC_FOTO_CAT[p.cat]; return k ? {src:`../editor-sacolas/fotos_catalogo/${k}.webp`, tipo:'foto'} : null;
}
const ORC_VEND_NOME = {'MARCIA':'Márcia', 'DAIANE':'Daiane', 'EDSON TONET':'Edson Tonet', 'WALMOR':'Walmor', 'MARIANE':'Mariane'};
const orcNomeVend = v => !v ? 'Embalagens Globo' : ORC_VEND_NOME[v] || String(v).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const orcDesc = (o) => { const t = String(o.desc_txt || '').trim(); if (!t) return 0; const m = /^(-?[\d.,]+)\s*%$/.exec(t);
  return m ? fpR2(o.bruto * nV(m[1]) / 100) : (nV(t) || 0); };
function orcCalc(o){
  o.itens.forEach(it => { it.total = fpR2(fpN(it.mil) * fpN(it.preco)); });
  o.bruto = fpR2(o.itens.reduce((a, it) => a + it.total, 0));
  o.cliches = fpR2(o.itens.reduce((a, it) => a + (it.arte_nova ? fpN(it.cliche) : 0), 0));
  o.clicheAconf = o.itens.some(it => it.arte_nova && !fpN(it.cliche) && it.prod);
  o.desc = orcDesc(o);
  o.total = fpR2(o.bruto + o.cliches + fpN(o.frete_valor) - o.desc);
  o.validade = addD(o.data, Number(o.validade_dias) || ORC_VALIDADE);
  return o;
}
const orcItemVazio = () => ({pid:'', prod:'', mil:'', preco:'', cores:'1 cor', arte_nova:true, cliche:'', obs:'', total:0});
function orcNova(base){
  const H = iso(hoje());
  ORC = {id:null, num:null, data:H, status:'RASCUNHO', cli_chave:'', cli_nome:'', cli_doc:'', contato:'', cli_fone:'', cli_email:'', cli_local:'',
    vendedor:(quem() || 'MARCIA').toUpperCase(), tabela:0, itens:[], desc_txt:'', frete:'', frete_valor:'', pag:FP_PAG[0][0], entrega:'',
    validade_dias:ORC_VALIDADE, obs:'', ver3d:true, verUnit:true, criado_em:''};
  if (base){
    const {id, num, status, criado_em, por, atualizado_em, ...resto} = base;
    Object.assign(ORC, JSON.parse(JSON.stringify(resto)), {data:H});
  } else ORC.itens.push(orcItemVazio());
  orcCalc(ORC); orcVer = null; ORC_PDF = null; render(); scrollTo(0, 0);
}
function orcSet(k, v){ ORC[k] = v; orcCalc(ORC); orcPinta(); }
function orcIt(i, k, v){ ORC.itens[i][k] = v; orcCalc(ORC); orcPinta(); }
function orcPinta(){
  ORC.itens.forEach((it, i) => { const el = document.getElementById('orT' + i); if (el) el.textContent = brl(it.total);
    const m = document.getElementById('orM' + i); if (m) m.innerHTML = fpAvisoMin(it); });
  const t = document.getElementById('orTot'); if (t) t.innerHTML = orcTotHtml(ORC);
  const v = document.getElementById('orVal'); if (v) v.textContent = dBR(ORC.validade);
}
const orcTotHtml = o => `<div style="display:grid;grid-template-columns:auto auto;gap:4px 18px;justify-content:end;text-align:right">
  <span class="mut">Produtos</span><b>${brl(o.bruto)}</b>
  ${o.cliches || o.clicheAconf ? `<span class="mut">+ clichês</span><span>${o.cliches ? brl(o.cliches) : ''}${o.clicheAconf ? ' <span class="pill warn">valor a confirmar</span>' : ''}</span>` : ''}
  ${fpN(o.frete_valor) ? `<span class="mut">+ frete</span><span>${brl(fpN(o.frete_valor))}</span>` : ''}
  ${o.desc ? `<span class="mut">− desconto</span><span>${brl(o.desc)}</span>` : ''}
  <span style="font-size:16px">Total</span><b style="font-size:20px;color:var(--acc)">${brl(o.total)}</b></div>`;

function orcEscolheCli(txt){
  const ch = fpDL().cli[txt];
  if (!ch){ Object.assign(ORC, {cli_chave:'', cli_nome:txt.trim(), cli_doc:'', cli_fone:'', cli_local:''}); render(); return; }
  const c = fpCli(ch);
  Object.assign(ORC, {cli_chave:c.chave, cli_nome:c.nome, cli_doc:c.doc || '', cli_fone:[c.cel, c.tel].filter(Boolean).join(' · '),
    cli_local:[c.bairro, c.cidade && c.cidade + (c.uf ? '/' + c.uf : '')].filter(Boolean).join(' · '),
    vendedor: c.vn && c.vn !== '—' && c.vn !== 'VENDEDOR PADRÃO' ? kVn(c.vn) : ORC.vendedor});
  render();
}
function orcEscolheProd(i, txt){
  const it = ORC.itens[i], id = fpDL().prod[txt];
  if (!id){ it.pid = ''; it.prod = txt; render(); return; }
  const p = fpProd(id);
  it.pid = id; it.prod = fpRot(p); it.preco = p.tab ? p.tab[ORC.tabela] : p.preco;
  if (!fpN(it.mil) && p.minimo) it.mil = String(p.minimo / 1000);
  if (!ORC_FACA[p.nome]) { it.arte_nova = it.arte_nova && /sac|envelope|talher/i.test(p.nome); }
  orcCalc(ORC); render();
}
function orcTabela(t){
  ORC.tabela = Number(t);
  ORC.itens.forEach(it => { const p = fpProd(it.pid); if (p && p.tab) it.preco = p.tab[ORC.tabela]; });
  orcCalc(ORC); render();
}
function orcAddItem(){ ORC.itens.push(orcItemVazio()); render(); }
function orcDelItem(i){ ORC.itens.splice(i, 1); if (!ORC.itens.length) ORC.itens.push(orcItemVazio()); orcCalc(ORC); render(); }
function orcMoveItem(i, d){ const j = i + d; if (j < 0 || j >= ORC.itens.length) return; [ORC.itens[i], ORC.itens[j]] = [ORC.itens[j], ORC.itens[i]]; render(); }

/* registro ⇄ planilha (texto; itens em JSON numa célula) */
function orcReg(o){
  const its = o.itens.filter(it => it.prod && fpN(it.mil) > 0);
  return {id:o.id, num:String(o.num), data:o.data, status:o.status, cliente:o.cli_nome, cliente_chave:o.cli_chave, cliente_doc:o.cli_doc,
    contato:o.contato, cliente_fone:o.cli_fone, cliente_email:o.cli_email, cliente_local:o.cli_local, vendedor:o.vendedor, tabela:FP_TAB[o.tabela],
    itens_txt: its.map(it => `${fpN(it.mil)} mil ${fpProd(it.pid) ? fpStartId(fpProd(it.pid)) : it.prod}${it.arte_nova ? ' (CLICHÊ NOVO ' + (it.cores || '') + ')' : ''}`).join(' | '),
    itens: JSON.stringify(its.map(({pid, prod, mil, preco, cores, arte_nova, cliche, obs}) => ({pid, prod, mil:fpN(mil), preco:fpN(preco), cores, arte_nova:!!arte_nova, cliche:fpN(cliche), obs}))),
    total_itens:String(o.bruto), cliches:String(o.cliches), desconto_txt:o.desc_txt || '', desconto:String(o.desc), frete:o.frete || '', frete_valor:String(fpN(o.frete_valor)),
    total:String(o.total), pagamento:o.pag, entrega:o.entrega || '', validade_dias:String(o.validade_dias), validade:o.validade, obs:o.obs || '',
    ver3d:o.ver3d ? 'SIM' : 'NÃO', ver_unit:o.verUnit ? 'SIM' : 'NÃO', criado_em:o.criado_em || new Date().toISOString()};
}
function orcLer(r){
  let its = []; try { its = JSON.parse(r.itens || '[]'); } catch(e) {}
  const o = {id:r.id, num:Number(r.num) || 0, data:dV(r.data), status:r.status || 'RASCUNHO', cli_chave:r.cliente_chave || '', cli_nome:r.cliente || '',
    cli_doc:r.cliente_doc || '', contato:r.contato || '', cli_fone:r.cliente_fone || '', cli_email:r.cliente_email || '', cli_local:r.cliente_local || '',
    vendedor:r.vendedor || '', tabela:Math.max(0, FP_TAB.indexOf(r.tabela)), itens:its.map(it => ({...it, total:0})),
    desc_txt:r.desconto_txt || (fpN(r.desconto) ? String(r.desconto) : ''), frete:r.frete || '', frete_valor:r.frete_valor || '', pag:r.pagamento || '',
    entrega:r.entrega || '', validade_dias:Number(r.validade_dias) || ORC_VALIDADE, obs:r.obs || '', ver3d:r.ver3d !== 'NÃO', verUnit:r.ver_unit !== 'NÃO',
    criado_em:r.criado_em, por:r.por, atualizado_em:r.atualizado_em};
  return orcCalc(o);
}
async function orcGrava(o, okTxt){
  const reg = orcReg(o);
  if (API() && REM){ await gravarSis('Orcamentos', reg, okTxt); return; }
  L.orcs = (L.orcs || []).filter(x => x.id !== o.id).concat([orcLer({...reg, por:quem(), atualizado_em:new Date().toISOString()})]);
  salvaL(); avisoGrav(okTxt + ' (só neste navegador — o porteiro não está ligado)', 'ok'); render();
}
function orcFaltas(o){
  const f = [];
  if (!String(o.cli_nome || '').trim()) f.push('o nome do cliente');
  if (!o.itens.some(it => it.prod && fpN(it.mil) > 0)) f.push('pelo menos um produto com quantidade');
  if (o.itens.some(it => it.prod && fpN(it.mil) > 0 && !fpN(it.preco))) f.push('o preço de todos os itens');
  return f;
}
async function orcSalvar(gerar){
  const falta = orcFaltas(ORC);
  if (falta.length){ avisoGrav('Falta preencher: ' + falta.join(', ') + '.', 'erro'); return; }
  ORC.itens = ORC.itens.filter(it => it.prod && fpN(it.mil) > 0); orcCalc(ORC);
  if (!ORC.id){ const n = Math.max(0, ...orcs().map(x => x.num || 0)) + 1; ORC.num = n; ORC.id = 'ORC-' + String(n).padStart(4, '0'); ORC.criado_em = new Date().toISOString(); }
  const o = ORC; await orcGrava(o, `Orçamento ${o.id} salvo.`);
  ORC = null; orcVer = o.id; render(); scrollTo(0, 0);
  if (gerar) orcGerarPDF(o.id);
}
async function orcStatus(id, st){ const o = orcs().find(x => x.id === id); if (!o) return; const c = JSON.parse(JSON.stringify(o)); c.status = st; orcCalc(c); await orcGrava(c, `${id}: ${st}.`); }
function orcEditar(id){ const o = orcs().find(x => x.id === id); ORC = JSON.parse(JSON.stringify(o)); orcCalc(ORC); orcVer = null; ORC_PDF = null; render(); scrollTo(0, 0); }
function orcParaFicha(id){
  const o = orcs().find(x => x.id === id); if (!o) return;
  const base = {origem:FP_ORIG[0], cli_chave:o.cli_chave, cli_nome:o.cli_nome, cli_doc:o.cli_doc, cli_fone:o.cli_fone, cli_local:o.cli_local, empresa:'Globo',
    vendedor:o.vendedor, tabela:o.tabela, pag:o.pag,
    itens:o.itens.map(it => ({pid:it.pid, prod:it.prod, arte:fpArteBase(o.cli_nome), arte_nova:!!it.arte_nova, cores:it.cores || '', mil:it.mil, preco:it.preco, obs:it.obs || ''}))};
  atual = 'pedidos'; location.hash = 'pedidos'; fpNova(base);
  FP.obs = `Do orçamento ${o.id} (${dBR(o.data)})` + (o.desc ? ` · desconto no orçamento ${brl(o.desc)}` : '') + (o.cliches ? ` · clichês ${brl(o.cliches)}` : '');
  if (o.desc) { FP.desc = o.desc; fpCalc(FP); }
  render();
}

/* ---------------- telas ---------------- */
function vOrcamentos(){
  if (ORC) return vOrcEditor();
  if (orcVer){ const o = orcs().find(x => x.id === orcVer); if (o) return vOrcVer(o); orcVer = null; }
  const H = iso(hoje()), O = orcs().slice().sort((a, b) => b.num - a.num);
  const bq = orcBusca.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let Lo = orcFilt === 'todos' ? O : orcFilt === 'validos' ? O.filter(o => o.status === 'ENVIADO' && o.validade >= H) : O.filter(o => o.status === orcFilt);
  if (bq) Lo = Lo.filter(o => [o.id, o.cli_nome, o.contato, o.vendedor, o.itens.map(i => i.prod).join(' ')].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(bq));
  const env = O.filter(o => o.status === 'ENVIADO'), mes = H.slice(0, 7), doMes = O.filter(o => (o.data || '').slice(0, 7) === mes);
  const decid = doMes.filter(o => o.status === 'APROVADO' || o.status === 'RECUSADO');
  return `${remBanner()}${gravBox()}
  <div class="banner ok">Monte o orçamento, clique em <b>📄 Gerar PDF</b> e mande para o cliente. O PDF sai com a identidade da Embalagens Globo e a <b>visualização 3D</b> de cada saco (arte demonstrativa "SUA MARCA"). Aprovado? <b>➜ Virar ficha de pedido</b> copia tudo para a ficha.</div>
  <div class="grid kpis">
    <div class="card kpi"><div class="v">${env.length}</div><div class="l">enviados, esperando resposta</div></div>
    <div class="card kpi"><div class="v">${brl(env.reduce((a, o) => a + o.total, 0))}</div><div class="l">em negociação</div></div>
    <div class="card kpi ${env.filter(o => o.validade < H).length ? 'warn' : ''}"><div class="v">${env.filter(o => o.validade < H).length}</div><div class="l">enviados e já vencidos</div></div>
    <div class="card kpi"><div class="v">${decid.length ? fmt(doMes.filter(o => o.status === 'APROVADO').length / decid.length * 100) + '%' : '—'}</div><div class="l">aprovados no mês (dos decididos)</div></div>
  </div>
  <div class="filtros"><button class="btn pri" onclick="orcNova()">+ Novo orçamento</button>
    <select onchange="orcFilt=this.value;render()">${[['todos','Todos'],['validos','Enviados e válidos'],...Object.keys(ORC_ST).map(s => [s, s])].map(([v, t]) => `<option value="${v}" ${v === orcFilt ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <input placeholder="buscar cliente, nº, produto…" value="${esc(orcBusca)}" oninput="orcBusca=this.value;clearTimeout(window._orb);window._orb=setTimeout(()=>{render();const e=document.querySelector('.filtros input');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}},250)">
    <label style="display:flex;gap:6px;align-items:center" class="mut">Quem está registrando<input value="${esc(quem())}" placeholder="seu nome" onchange="defQuem(this.value)" style="min-width:120px;max-width:160px"></label></div>
  ${O.length ? `<div class="card" style="padding:0"><div class="tw"><table>
    <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th class="n">Total</th><th>Válido até</th><th>Status</th></tr></thead>
    <tbody>${Lo.map(o => `<tr style="cursor:pointer" onclick="orcVer='${o.id}';ORC_PDF=null;render();scrollTo(0,0)"><td class="cod">${esc(o.id)}</td><td>${dBR(o.data)}</td>
      <td><b>${esc(o.cli_nome)}</b>${o.cli_chave ? '' : ' <span class="pill grey">novo</span>'}<div class="mut" style="font-size:12px">${esc([o.contato, o.vendedor].filter(Boolean).join(' · '))}</div></td>
      <td style="white-space:normal;min-width:220px;font-size:13px">${o.itens.map(it => `${fmt(fpN(it.mil), 1)} mil ${esc(fpProd(it.pid) ? fpProd(it.pid).nome + ' · ' + fpProd(it.pid).cod : it.prod)}`).join('<br>')}</td>
      <td class="n">${brl(o.total)}</td><td>${o.status === 'ENVIADO' && o.validade < H ? `<span class="pill bad">${dBR(o.validade)}</span>` : dBR(o.validade)}</td>
      <td><span class="pill ${ORC_ST[o.status] || 'grey'}">${esc(o.status)}</span></td></tr>`).join('') || '<tr><td colspan="7" class="mut">Nenhum orçamento neste filtro.</td></tr>'}</tbody></table></div></div>`
  : `<div class="empty"><div class="ic">📄</div><b>Nenhum orçamento ainda</b><div>Clique em <b>+ Novo orçamento</b>: escolha o cliente (ou digite o nome de quem ainda não é cliente), os produtos e as quantidades.</div></div>`}
  <p class="note">Caminho: <b>RASCUNHO</b> → <b>ENVIADO</b> (PDF mandado ao cliente) → <b>APROVADO</b> ou <b>RECUSADO</b>. Orçamento não entra em nenhum painel de vendas: só a ficha de pedido conta.</p>`;
}

function vOrcVer(o){
  const p3 = o.itens.map(it => orcVisual(fpProd(it.pid))).filter(Boolean);
  return `${remBanner()}${gravBox()}
  <div class="filtros"><button class="btn" onclick="orcVer=null;ORC_PDF=null;render()">← Orçamentos</button>
    <button class="btn pri" onclick="orcGerarPDF('${o.id}')">📄 Gerar PDF</button>
    ${o.status === 'RASCUNHO' ? `<button class="btn" onclick="orcStatus('${o.id}','ENVIADO')">📨 Marcar como enviado</button>` : ''}
    ${o.status === 'ENVIADO' ? `<button class="btn" onclick="orcStatus('${o.id}','APROVADO')">✔ Aprovado</button><button class="btn" onclick="orcStatus('${o.id}','RECUSADO')">✕ Recusado</button>` : ''}
    <button class="btn" onclick="orcParaFicha('${o.id}')">➜ Virar ficha de pedido</button>
    <button class="btn" onclick="orcEditar('${o.id}')">✏️ Editar</button>
    <button class="btn" onclick="orcNova(orcs().find(x=>x.id==='${o.id}'))">⧉ Duplicar</button>
    <span class="sp"></span><span class="pill ${ORC_ST[o.status] || 'grey'}" style="font-size:14px">${esc(o.status)}</span></div>
  <div id="orcPdfBox">${ORC_PDF && ORC_PDF.id === o.id ? orcPdfHtml() : ''}</div>
  <div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">${esc(o.id)} · ${esc(o.cli_nome)}</h3>
      <div class="mut" style="font-size:13px;margin-bottom:8px">${esc([o.contato, o.cli_fone, o.cli_email, o.cli_local].filter(Boolean).join(' · ') || '—')}</div>
      <div class="tw"><table><thead><tr><th>Produto</th><th class="n">Milheiros</th><th class="n">R$/mil</th><th class="n">Total</th></tr></thead><tbody>
      ${o.itens.map(it => { const p = fpProd(it.pid); return `<tr><td style="white-space:normal">${esc(p ? p.nome : it.prod)}<div class="mut" style="font-size:11px">${esc(p ? p.papel + (p.medidas ? ' · ' + p.medidas + ' cm' : '') : '')}${it.arte_nova ? ` · clichê novo ${esc(it.cores || '')} ${fpN(it.cliche) ? brl(fpN(it.cliche)) : '(valor a confirmar)'}` : ''}</div></td>
        <td class="n">${fmt(fpN(it.mil), 1)}</td><td class="n">${brl(fpN(it.preco))}</td><td class="n">${brl(it.total)}</td></tr>`; }).join('')}</tbody></table></div>
      <div style="margin-top:10px">${orcTotHtml(o)}</div></div>
    <div class="card"><h3 style="margin-top:0">Condições</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px">
        <span class="mut">Tabela</span><span>TABELA ${FP_TAB[o.tabela]}</span>
        <span class="mut">Pagamento</span><span>${esc(o.pag || '—')}</span>
        <span class="mut">Entrega</span><span>${esc(o.entrega || '—')}</span>
        <span class="mut">Frete</span><span>${esc(o.frete || '—')}${fpN(o.frete_valor) ? ' · ' + brl(fpN(o.frete_valor)) : ''}</span>
        <span class="mut">Válido até</span><span>${dBR(o.validade)} (${o.validade_dias} dias)</span>
        <span class="mut">Vendedor</span><span>${esc(o.vendedor || '—')}</span>
        <span class="mut">Obs.</span><span style="white-space:pre-wrap">${esc(o.obs || '—')}</span></div>
      ${p3.length && o.ver3d ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">${p3.slice(0, 6).map(v => `<img src="${v.src}" alt="" style="width:84px;height:94px;object-fit:cover;border-radius:8px;background:#dad6cd">`).join('')}</div>` : ''}
      <p class="note">Registrado por ${esc(o.por || '—')}${o.atualizado_em ? ' · ' + new Date(o.atualizado_em).toLocaleString('pt-BR') : ''}.</p></div>`;
}

function vOrcEditor(){
  const o = ORC, D = fpDL(), c = fpCli(o.cli_chave);
  const lab = (t, h) => `<label>${t}${h}</label>`;
  const inp = (k, ph, w) => `<input value="${esc(o[k] || '')}" placeholder="${esc(ph || '')}" style="min-width:${w || 160}px" oninput="orcSet('${k}',this.value)">`;
  const vends = [...new Set(['MARCIA','DAIANE','EDSON TONET','WALMOR','MARIANE', ...(SEG && SEG.cli ? SEG.cli.vend.map(kVn) : []), o.vendedor])].filter(v => v && v !== 'VENDEDOR PADRÃO' && !/^ZZZ/.test(v));
  return `${D.html}${gravBox()}
  <div class="filtros"><button class="btn" onclick="if(confirm('Sair sem salvar?')){ORC=null;render()}">← Voltar</button>
    <b style="font-size:16px">${o.id ? 'Editar orçamento ' + esc(o.id) : 'Novo orçamento'}</b><span class="sp"></span>
    <button class="btn" onclick="orcSalvar(false)">💾 Salvar</button>
    <button class="btn pri" onclick="orcSalvar(true)">📄 Salvar e gerar PDF</button></div>

  <div class="card" style="margin-bottom:12px"><form class="inline" onsubmit="return false" style="margin:0">
    ${lab('Cliente', `<input list="dlCli" value="${esc(o.cli_nome)}" placeholder="cliente da base, ou digite o nome de quem ainda não é cliente" style="min-width:340px" onchange="orcEscolheCli(this.value)">`)}
    ${lab('Contato (pessoa)', inp('contato', 'ex.: Guilherme'))}
    ${lab('Telefone / WhatsApp', inp('cli_fone', '(41) 9…'))}
    ${lab('E-mail', inp('cli_email', 'opcional'))}
    ${lab('Cidade / bairro', inp('cli_local', 'opcional'))}
    ${lab('CNPJ / CPF', inp('cli_doc', 'opcional', 140))}
  </form>
  ${o.cli_nome ? `<div style="margin-top:8px;font-size:13px">${c ? (c.chave === 'TESTE' ? '<span class="pill warn">🧪 cliente fictício</span>' : `<span class="mut">Cliente da base</span> ${kPill(c.sit)}${c.ciclo ? ` <span class="mut">compra a cada ~${c.ciclo} dias</span>` : ''}`) : '<span class="pill grey">ainda não é cliente (prospect)</span>'}</div>` : ''}
  <form class="inline" onsubmit="return false" style="margin:10px 0 0">
    ${lab('Data', `<input type="date" value="${o.data}" onchange="orcSet('data',this.value)">`)}
    ${lab('Vendedor', `<select onchange="orcSet('vendedor',this.value)">${vends.map(v => `<option ${v === o.vendedor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`)}
    ${lab('Tabela de preço', `<select onchange="orcTabela(this.value)">${FP_TAB.map((t, i) => `<option value="${i}" ${i === o.tabela ? 'selected' : ''}>TABELA ${t}</option>`).join('')}</select>`)}
  </form></div>

  <div class="card" style="padding:0;margin-bottom:12px"><div class="tw"><table>
    <thead><tr><th></th><th>Produto (faca + papel)</th><th>Impressão</th><th class="n">Milheiros</th><th class="n">R$ / milheiro</th><th class="n">Total</th><th></th></tr></thead>
    <tbody>${o.itens.map((it, i) => { const p = fpProd(it.pid), vis = orcVisual(p); return `<tr>
      <td style="width:62px">${vis ? `<img src="${vis.src}" alt="" title="${vis.tipo === '3d' ? 'visualização 3D que vai no PDF' : 'foto do catálogo que vai no PDF'}" style="width:54px;height:60px;object-fit:cover;border-radius:6px;background:#dad6cd">` : `<div style="width:54px;height:60px;border-radius:6px;background:var(--bg2,#eef1f5);display:grid;place-items:center;font-size:20px">📦</div>`}</td>
      <td style="min-width:300px"><input list="dlProd" value="${esc(it.prod)}" placeholder="ex.: K35 5 kg" style="width:100%" onchange="orcEscolheProd(${i},this.value)">
        <div class="mut" style="font-size:11px;margin-top:2px">${p ? `${esc(p.papel)}${p.medidas ? ' · ' + esc(p.medidas) + ' cm' : ''} · Tab. I/II/III ${p.tab.map(x => brl(x)).join(' / ')}${p.minimo ? ' · mín. ' + fmt(p.minimo / 1000) + ' mil' : ''}${p.fora_site ? ' · ⚠️ ' + esc(p.fora_site) : ''}` : it.prod ? '⚠️ produto fora do catálogo — preencha o preço' : ''}</div>
        <input value="${esc(it.obs || '')}" placeholder="obs. que vai no PDF (opcional)" style="width:100%;margin-top:3px;font-size:12px" oninput="orcIt(${i},'obs',this.value)"></td>
      <td style="min-width:150px"><select onchange="orcIt(${i},'cores',this.value)">${['1 cor','2 cores','3 cores','sem impressão'].map(x => `<option ${x === it.cores ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label class="mut" style="font-size:11px;display:flex;gap:4px;align-items:center;margin-top:4px"><input type="checkbox" ${it.arte_nova ? 'checked' : ''} onchange="orcIt(${i},'arte_nova',this.checked);render()"> cobrar clichê novo</label>
        ${it.arte_nova ? `<input inputmode="decimal" value="${esc(String(it.cliche || '').replace('.', ','))}" placeholder="R$ (vazio = a confirmar)" title="valor do clichê; vazio sai como 'a confirmar'" style="width:100%;margin-top:3px;font-size:12px" oninput="orcIt(${i},'cliche',this.value)">` : ''}</td>
      <td class="n"><input inputmode="decimal" value="${esc(String(it.mil))}" style="width:80px;text-align:right" oninput="orcIt(${i},'mil',this.value)"><div id="orM${i}">${fpAvisoMin(it)}</div></td>
      <td class="n"><input inputmode="decimal" value="${esc(String(it.preco).replace('.', ','))}" style="width:90px;text-align:right" oninput="orcIt(${i},'preco',this.value)"></td>
      <td class="n"><b id="orT${i}">${brl(it.total)}</b></td>
      <td style="white-space:nowrap"><button class="btn" style="padding:3px 7px" title="subir" onclick="orcMoveItem(${i},-1)">↑</button><button class="btn" style="padding:3px 7px" title="descer" onclick="orcMoveItem(${i},1)">↓</button><button class="btn" style="padding:3px 7px" title="remover item" onclick="orcDelItem(${i})">✕</button></td></tr>`; }).join('')}</tbody></table></div>
    <div style="padding:10px 12px"><button class="btn" onclick="orcAddItem()">+ Produto</button> <span class="mut" style="font-size:12px">O primeiro produto é o destaque da capa do PDF.</span></div></div>

  <div class="two" style="margin-top:0">
    <div class="card"><form class="inline" onsubmit="return false" style="margin:0">
      ${lab('Pagamento', `<select onchange="orcSet('pag',this.value)">${FP_PAG.map(x => x[0]).map(x => `<option ${x === o.pag ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`)}
      ${lab('Prazo de entrega', inp('entrega', 'ex.: 15 dias após aprovar a arte', 220))}
      ${lab('Frete', inp('frete', 'ex.: grátis em Curitiba', 180))}
      ${lab('Frete R$', `<input inputmode="decimal" value="${esc(String(o.frete_valor || ''))}" placeholder="0" style="min-width:80px;width:80px" oninput="orcSet('frete_valor',this.value)">`)}
      ${lab('Desconto', `<input value="${esc(o.desc_txt || '')}" placeholder="R$ ou 5%" style="min-width:90px;width:90px" oninput="orcSet('desc_txt',this.value)">`)}
      ${lab('Validade (dias)', `<input inputmode="numeric" value="${esc(String(o.validade_dias))}" style="min-width:60px;width:60px" oninput="orcSet('validade_dias',this.value)">`)}
    </form>
    <div class="mut" style="font-size:12px;margin-top:6px">Válido até <b id="orVal">${dBR(o.validade)}</b>. Campo vazio não aparece no PDF.</div>
    <label style="display:block;margin-top:10px"><span class="mut" style="font-size:12px">Observações (vão no PDF)</span>
      <textarea rows="3" style="width:100%;font:inherit" oninput="orcSet('obs',this.value)">${esc(o.obs || '')}</textarea></label>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:13px">
      <label><input type="checkbox" ${o.ver3d ? 'checked' : ''} onchange="orcSet('ver3d',this.checked)"> visualizações 3D no PDF</label>
      <label><input type="checkbox" ${o.verUnit ? 'checked' : ''} onchange="orcSet('verUnit',this.checked)"> mostrar preço por milheiro</label></div></div>
    <div class="card" id="orTot">${orcTotHtml(o)}</div>
  </div>`;
}

/* ---------------- PDF ---------------- */
const orcScript = (src, teste) => teste() ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = () => no(new Error('não consegui carregar ' + src)); document.head.appendChild(s); });
/* imagem → JPEG com fundo e cantos arredondados (jsPDF não lê webp e não arredonda imagem) */
function orcImg(src, W, H, raio, fundo, modo){
  return new Promise(ok => {
    const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.save(); g.beginPath(); if (g.roundRect) g.roundRect(0, 0, W, H, raio); else g.rect(0, 0, W, H); g.clip();
      g.fillStyle = fundo; g.fillRect(0, 0, W, H);
      const r = modo === 'contain' ? Math.min(W / im.width, H / im.height) : Math.max(W / im.width, H / im.height);
      const w = im.width * r, h = im.height * r; g.drawImage(im, (W - w) / 2, modo === 'contain' ? (H - h) / 2 : (H - h) * 0.42, w, h); g.restore();
      ok(c.toDataURL('image/jpeg', 0.9)); };
    im.onerror = () => ok(null); im.src = src; });
}
const ORC_COR = {azul:[31,95,174], escuro:[16,45,99], claro:[47,127,208], tinta:[24,31,45], cinza:[100,108,122], linha:[223,228,236], fundo:[244,246,250], render:[218,214,205], ceu:[150,195,245]};
function orcPdfHtml(){
  return ORC_PDF.erro ? `<div class="banner">Não consegui gerar o PDF: ${esc(ORC_PDF.erro)}</div>`
    : !ORC_PDF.url ? `<div class="banner">Montando o PDF com as visualizações 3D…</div>`
    : `<div class="card" style="margin-bottom:12px;padding:10px"><div class="filtros" style="margin:0 0 8px"><b>${esc(ORC_PDF.nome)}</b><span class="sp"></span>
        <a class="btn pri" href="${ORC_PDF.url}" download="${esc(ORC_PDF.nome)}">⬇️ Baixar PDF</a><a class="btn" href="${ORC_PDF.url}" target="_blank" rel="noopener">Abrir em outra aba</a>
        <button class="btn" onclick="ORC_PDF=null;render()">Fechar prévia</button></div>
        <iframe src="${ORC_PDF.url}" title="Prévia do PDF" style="width:100%;height:78vh;border:0;border-radius:8px;background:#525659"></iframe></div>`;
}
async function orcGerarPDF(id){
  const o = orcs().find(x => x.id === id); if (!o) return;
  if (ORC_PDF && ORC_PDF.url) URL.revokeObjectURL(ORC_PDF.url);
  ORC_PDF = {id, url:null}; const box = () => document.getElementById('orcPdfBox'); if (box()) box().innerHTML = orcPdfHtml();
  try {
    const blob = await orcMontaPDF(o);
    ORC_PDF = {id, url:URL.createObjectURL(blob), nome:`Orcamento ${o.id} - ${String(o.cli_nome).replace(/[\\/:*?"<>|]+/g, '').trim()}.pdf`};
  } catch(e) { console.error(e); ORC_PDF = {id, erro:e.message || String(e)}; }
  if (box()) box().innerHTML = orcPdfHtml();
}
async function orcMontaPDF(o){
  await orcScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf);
  await orcScript('orcamento/fontes.js', () => window.ORC_ATIVOS);
  const A = window.ORC_ATIVOS, doc = new window.jspdf.jsPDF({unit:'mm', format:'a4', compress:true});
  [['Inter','inter','normal'], ['Inter','inter-b','bold'], ['InterK','inter-k','normal'], ['Archivo','archivo-b','bold']].forEach(([fam, k, st]) => {
    doc.addFileToVFS(k + '.ttf', A[k]); doc.addFont(k + '.ttf', fam, st); });
  doc.setProperties({title:`Orçamento ${o.id} — ${o.cli_nome}`, author:'Embalagens Globo', creator:'Sistema Globo'});
  const W = 210, Hp = 297, M = 14, R = W - M;
  const cor = (k, tipo) => { const c = ORC_COR[k] || k; tipo === 'f' ? doc.setFillColor(...c) : tipo === 'd' ? doc.setDrawColor(...c) : doc.setTextColor(...c); };
  const fonte = (fam, st, pt, c) => { doc.setFont(fam, st); doc.setFontSize(pt); if (c) cor(c); };
  const txt = (s, x, y, op) => doc.text(Array.isArray(s) ? s.map(String) : String(s), x, y, op || {});
  const esp = (v) => doc.setCharSpace(v || 0);
  const alpha = (a) => doc.setGState(new doc.GState({opacity:a}));

  /* itens + imagens */
  const its = o.itens.filter(it => it.prod && fpN(it.mil) > 0).map(it => ({it, p:fpProd(it.pid)}));
  for (const x of its){ const v = o.ver3d ? orcVisual(x.p) : null; x.vis = v;
    if (v){ x.thumb = await orcImg(v.src, 240, 240, 26, `rgb(${ORC_COR.render})`, v.tipo === '3d' ? 'cover' : 'contain'); } }
  const heroIts = [], vistos = new Set();
  its.forEach(x => { if (x.vis && x.vis.tipo === '3d' && !vistos.has(x.vis.src) && heroIts.length < 3){ vistos.add(x.vis.src); heroIts.push(x); } });
  for (const x of heroIts) x.hero = await orcImg(x.vis.src, 540, 600, 26, `rgb(${ORC_COR.render})`, 'cover');
  for (let k = heroIts.length - 1; k >= 0; k--) if (!heroIts[k].hero) heroIts.splice(k, 1);   // foto que não carregou fica de fora

  /* ---- cabeçalho ---- */
  const cabecalho = (pag) => {
    if (pag === 1){
      cor('escuro', 'f'); doc.rect(0, 0, W, 44, 'F');
      alpha(0.07); doc.setFillColor(255, 255, 255); doc.circle(W - 18, 6, 46, 'F'); doc.circle(W - 4, 40, 22, 'F'); alpha(1);
      cor('claro', 'f'); doc.rect(0, 44, W, 1.3, 'F');
      doc.addImage('data:image/png;base64,' + A.logo, 'PNG', M, 11, 22, 20.2);
      fonte('Inter', 'bold', 6.6); doc.setTextColor(185, 205, 235); esp(0.62); txt('EMBALAGENS', M + 25.5, 18.2); esp(0);
      fonte('Archivo', 'bold', 25); doc.setTextColor(255, 255, 255); esp(0.3); txt('GLOBO', M + 25, 28.6); esp(0);
      fonte('Inter', 'normal', 7.2); doc.setTextColor(185, 205, 235); txt('Embalagens de papel · fábrica própria em Curitiba desde 1976', M, 38.5);
      fonte('InterK', 'normal', 8); cor('ceu'); esp(0.75); txt('ORÇAMENTO', R, 16, {align:'right'}); esp(0);
      fonte('Inter', 'bold', 21); doc.setTextColor(255, 255, 255); txt(o.id, R, 26.5, {align:'right'});
      fonte('Inter', 'normal', 8.2); doc.setTextColor(215, 228, 246);
      txt('Curitiba, ' + new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR', {day:'numeric', month:'long', year:'numeric'}), R, 33, {align:'right'});
      return 54;
    }
    cor('escuro', 'f'); doc.rect(0, 0, W, 16, 'F'); cor('claro', 'f'); doc.rect(0, 16, W, 0.8, 'F');
    doc.addImage('data:image/png;base64,' + A.logo, 'PNG', M, 3.6, 9.5, 8.7);
    fonte('Archivo', 'bold', 13); doc.setTextColor(255, 255, 255); esp(0.18); txt('GLOBO', M + 11.5, 10.6); esp(0);
    fonte('Inter', 'bold', 9); doc.setTextColor(255, 255, 255); txt(`Orçamento ${o.id} · ${o.cli_nome}`, R, 10.2, {align:'right'});
    return 26;
  };
  const rodape = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++){
      doc.setPage(i); cor('linha', 'd'); doc.setLineWidth(0.25); doc.line(M, Hp - 17, R, Hp - 17);
      fonte('Inter', 'bold', 6.8, 'tinta'); txt(ORC_EMP.razao, M, Hp - 12.2);
      fonte('Inter', 'normal', 6.6, 'cinza'); txt(`CNPJ ${ORC_EMP.cnpj} · IE ${ORC_EMP.ie} · ${ORC_EMP.end}`, M, Hp - 8.6);
      txt(`Telefone ${ORC_EMP.tel} · WhatsApp ${ORC_EMP.wa} · ${ORC_EMP.site}`, M, Hp - 5.2);
      fonte('Inter', 'bold', 7, 'azul'); txt(`${i} / ${n}`, R, Hp - 12.2, {align:'right'});
    }
  };
  const LIM = Hp - 24;
  let pag = 1, y = cabecalho(1);
  const novaPag = () => { doc.addPage(); pag++; y = cabecalho(pag); };
  const cabe = (h) => { if (y + h > LIM) novaPag(); };

  /* ---- para / atendimento ---- */
  const rotulo = (s, x, yy, c) => { fonte('Inter', 'bold', 6.4, c || 'azul'); esp(0.42); txt(s, x, yy); esp(0); };
  rotulo('PREPARADO PARA', M, y);
  fonte('Inter', 'bold', 15, 'tinta'); const nomeL = doc.splitTextToSize(o.cli_nome, 112); txt(nomeL.slice(0, 2), M, y + 7);
  let yy = y + 7 + (Math.min(nomeL.length, 2) - 1) * 6.2 + 5.6;
  fonte('Inter', 'normal', 8.6, 'cinza');
  const linhasCli = [o.contato ? 'A/C ' + o.contato : '', [o.cli_fone, o.cli_email].filter(Boolean).join(' · '), [o.cli_doc ? 'CNPJ/CPF ' + o.cli_doc : '', o.cli_local].filter(Boolean).join(' · ')].filter(Boolean);
  linhasCli.forEach(l => { doc.splitTextToSize(l, 112).slice(0, 2).forEach(s => { txt(s, M, yy); yy += 4.4; }); });
  const xA = 136; cor('fundo', 'f'); doc.roundedRect(xA - 4, y - 4.6, R - xA + 4, 35, 2.5, 2.5, 'F');
  rotulo('ATENDIMENTO', xA, y);
  fonte('Inter', 'bold', 10.5, 'tinta'); txt(orcNomeVend(o.vendedor), xA, y + 6.5);
  fonte('Inter', 'normal', 8.2, 'cinza'); txt('WhatsApp ' + ORC_EMP.wa, xA, y + 11.6); txt(ORC_EMP.site, xA, y + 15.8);
  rotulo('VÁLIDO ATÉ', xA, y + 22.2, 'cinza');
  fonte('Inter', 'bold', 10.5, 'azul'); txt(dBR(o.validade), xA, y + 27.4);
  y = Math.max(yy, y + 31) + 6;

  /* ---- vitrine 3D ---- */
  if (heroIts.length){
    const hH = heroIts.length === 1 ? 92 : 76, gap = 4, n = heroIts.length;
    const wImg = Math.min((R - M - gap * (n - 1)) / n, hH * 0.9), totW = wImg * n + gap * (n - 1), x0 = M + (R - M - totW) / 2;
    heroIts.forEach((x, k) => { const xi = x0 + k * (wImg + gap);
      doc.addImage(x.hero, 'JPEG', xi, y, wImg, hH, 'hero' + k, 'FAST');
      fonte('Inter', 'bold', 7.6); const lw = Math.max(doc.getTextWidth(x.p.nome), (doc.setFontSize(6.6), doc.getTextWidth(x.p.papel))) + 7;
      alpha(0.88); doc.setFillColor(255, 255, 255); doc.roundedRect(xi + (wImg - lw) / 2, y + hH - 11.4, lw, 8.6, 2, 2, 'F'); alpha(1);
      fonte('Inter', 'bold', 7.6, 'tinta'); txt(x.p.nome, xi + wImg / 2, y + hH - 6.9, {align:'center'});
      fonte('Inter', 'normal', 6.6, 'cinza'); txt(x.p.papel, xi + wImg / 2, y + hH - 3.7, {align:'center'}); });
    y += hH + 4.2;
    fonte('Inter', 'normal', 6.8, 'cinza');
    txt('Visualização 3D ilustrativa feita no GloboEditor com arte demonstrativa. A arte com a sua marca é montada e aprovada por você antes de produzir.', M, y);
    y += 9;
  }

  /* ---- tabela de itens ---- */
  const cQ = 128, cP = 160;
  const cabTab = () => {
    rotulo('PRODUTO', o.ver3d ? M + 19 : M, y, 'cinza');
    fonte('Inter', 'bold', 6.4, 'cinza'); esp(0.42); txt('QUANTIDADE', cQ, y, {align:'right'}); if (o.verUnit) txt('R$ / MILHEIRO', cP, y, {align:'right'}); txt('TOTAL', R, y, {align:'right'}); esp(0);
    y += 2.4; cor('tinta', 'd'); doc.setLineWidth(0.35); doc.line(M, y, R, y); y += 1.5;
  };
  cabTab();
  const tX = o.ver3d ? M + 19 : M;
  its.forEach(({it, p, thumb}, k) => {
    const sub = [p ? p.papel : '', p && p.medidas ? p.medidas + ' cm' : '', it.cores && it.cores !== 'sem impressão' ? 'impressão ' + it.cores : it.cores].filter(Boolean).join(' · ');
    fonte('Inter', 'normal', 7.4); const obsL = it.obs ? doc.splitTextToSize(it.obs, cQ - 30 - tX) : [];
    const clich = !!it.arte_nova;
    const h = Math.max(o.ver3d ? 19 : 13, 12.5 + obsL.length * 3.4) + (clich ? 6.4 : 0);
    if (y + h > LIM){ novaPag(); cabTab(); }
    const y0 = y + 2.2;
    if (o.ver3d){ if (thumb) doc.addImage(thumb, 'JPEG', M, y0, 15.5, 15.5, 'th' + k, 'FAST'); else { cor('fundo', 'f'); doc.roundedRect(M, y0, 15.5, 15.5, 2, 2, 'F'); } }
    fonte('Inter', 'bold', 10, 'tinta'); txt(p ? p.nome : it.prod, tX, y0 + 4.6);
    fonte('Inter', 'normal', 7.6, 'cinza'); txt(sub, tX, y0 + 8.8);
    if (obsL.length){ fonte('Inter', 'normal', 7.4, 'azul'); obsL.forEach((l, j) => txt(l, tX, y0 + 12.6 + j * 3.4)); }
    fonte('Inter', 'bold', 9.6, 'tinta'); txt(`${fmt(fpN(it.mil), 1)} milheiro${fpN(it.mil) === 1 ? '' : 's'}`, cQ, y0 + 4.6, {align:'right'});
    fonte('Inter', 'normal', 7.2, 'cinza'); txt(`${fmt(fpN(it.mil) * 1000)} unidades`, cQ, y0 + 8.6, {align:'right'});
    if (o.verUnit){ fonte('Inter', 'normal', 9.4, 'tinta'); txt(brl(fpN(it.preco)), cP, y0 + 4.6, {align:'right'}); }
    fonte('Inter', 'bold', 10, 'tinta'); txt(brl(it.total), R, y0 + 4.6, {align:'right'});
    if (clich){
      const yc = y + h - 6.6; cor('fundo', 'f'); doc.roundedRect(tX, yc, R - tX, 5.2, 1.2, 1.2, 'F');
      fonte('Inter', 'normal', 7.2, 'cinza'); txt(`Clichê novo (${it.cores || '1 cor'}) — pago uma vez só; repetindo a mesma arte, não se paga de novo.`, tX + 2, yc + 3.5);
      fonte('Inter', 'bold', 7.6, fpN(it.cliche) ? 'tinta' : 'cinza'); txt(fpN(it.cliche) ? brl(fpN(it.cliche)) : 'a confirmar', R - 2, yc + 3.5, {align:'right'});
    }
    y += h; cor('linha', 'd'); doc.setLineWidth(0.2); doc.line(M, y, R, y);
  });
  y += 7;

  /* ---- condições + totais ---- */
  const cond = [['Pagamento', o.pag], ['Prazo de entrega', o.entrega], ['Frete', [o.frete, fpN(o.frete_valor) ? brl(fpN(o.frete_valor)) : ''].filter(Boolean).join(' · ')],
    ['Validade', `${o.validade_dias} dias (até ${dBR(o.validade)})`], ['Observações', o.obs]].filter(c => String(c[1] || '').trim());
  fonte('Inter', 'normal', 8.2); const condL = cond.map(([k, v]) => [k, doc.splitTextToSize(String(v), 76)]);
  const hCond = 7 + condL.reduce((a, c) => a + c[1].length * 4 + 2.6, 0);
  const linT = [['Produtos', brl(o.bruto)]];
  if (o.cliches || o.clicheAconf) linT.push(['Clichês', o.cliches ? brl(o.cliches) + (o.clicheAconf ? ' + a confirmar' : '') : 'a confirmar']);
  if (fpN(o.frete_valor)) linT.push(['Frete', brl(fpN(o.frete_valor))]);
  if (o.desc) linT.push(['Desconto', '− ' + brl(o.desc)]);
  const hTot = 8 + linT.length * 5.6 + 16;
  cabe(Math.max(hCond, hTot));
  const yB = y, xT = 124;
  rotulo('CONDIÇÕES', M, yB); let yc = yB + 6;
  condL.forEach(([k, ls]) => { fonte('Inter', 'bold', 7.6, 'tinta'); txt(k, M, yc); fonte('Inter', 'normal', 8.2, 'cinza'); ls.forEach((l, j) => txt(l, M + 26, yc + j * 4)); yc += ls.length * 4 + 2.6; });
  cor('fundo', 'f'); doc.roundedRect(xT, yB - 4.6, R - xT, hTot, 2.5, 2.5, 'F');
  let yt = yB + 1.6;
  linT.forEach(([k, v]) => { fonte('Inter', 'normal', 8.6, 'cinza'); txt(k, xT + 5, yt); fonte('Inter', 'normal', 8.6, 'tinta'); txt(v, R - 5, yt, {align:'right'}); yt += 5.6; });
  cor('azul', 'd'); doc.setLineWidth(0.4); doc.line(xT + 5, yt - 2.6, R - 5, yt - 2.6);
  rotulo('TOTAL', xT + 5, yt + 4.4, 'azul');
  fonte('InterK', 'normal', 17, 'azul'); txt(brl(o.total), R - 5, yt + 6.6, {align:'right'});
  if (o.clicheAconf){ fonte('Inter', 'normal', 6.4, 'cinza'); txt('+ clichês a confirmar', R - 5, yt + 10.4, {align:'right'}); }
  y = Math.max(yc, yB - 4.6 + hTot) + 8;

  /* ---- por que a Globo ---- */
  const prova = [['Fábrica própria', 'Produzimos em Curitiba desde 1976, com papel kraft, branco e antigordura.'],
    ['Sua marca em 3D', 'A arte é montada no GloboEditor e você vê o saco pronto antes de aprovar.'],
    ['Do jeito que você pede', 'Impressão em até 3 cores e pedidos repetidos sem pagar clichê de novo.']];
  if (y + 30 <= LIM){
    y = Math.max(y, LIM - 30);   // ancorada logo acima do rodapé
    const cw = (R - M - 8) / 3;
    prova.forEach(([t, d], k) => { const x = M + k * (cw + 4);
      cor('azul', 'f'); doc.rect(x, y, 1.2, 15, 'F');
      fonte('Inter', 'bold', 8.4, 'tinta'); txt(t, x + 4, y + 3.6);
      fonte('Inter', 'normal', 7.2, 'cinza'); txt(doc.splitTextToSize(d, cw - 6).slice(0, 3), x + 4, y + 7.6); });
    y += 21;
    fonte('Inter', 'bold', 8, 'azul');
    txt('Para aprovar, é só responder pelo WhatsApp ' + ORC_EMP.wa + ' citando o ' + o.id + '.', M, y + 2);
  } else if (y + 6 <= LIM){
    fonte('Inter', 'bold', 8, 'azul'); txt('Para aprovar, é só responder pelo WhatsApp ' + ORC_EMP.wa + ' citando o ' + o.id + '.', M, y + 2);
  }
  rodape();
  return doc.output('blob');
}
