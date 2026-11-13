/* ---------- NUVEM: login (Supabase) e "Minhas artes" ---------- */
const NUVEM = __NUVEM__;   // true no GitHub; false no artifact (a página do Claude não alcança outros servidores)
const SB_URL = 'https://dzfelcufnsltutxeidow.supabase.co', SB_KEY = 'sb_publishable_kKBiEe6G8D_uEYO8NiWDCA_foi3zxwl';
let SB = null, USUARIO = null, ARTE_ID = null, ARTE_NOME = '';
const emailDe = u => u.includes('@') ? u.trim() : u.trim().toLowerCase() + '@globoeditor.app';
const nomeDe = e => (e||'').replace('@globoeditor.app','');
function nuvemInit(){
  if(!NUVEM){ document.querySelectorAll('.so-nuvem').forEach(e=>e.style.display='none'); return; }
  const sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  sc.onload=async()=>{ SB=window.supabase.createClient(SB_URL, SB_KEY);
    const {data}=await SB.auth.getSession(); USUARIO=data.session?data.session.user:null; atualizaConta();
    SB.auth.onAuthStateChange((_e,s)=>{ USUARIO=s?s.user:null; atualizaConta(); }); };
  sc.onerror=()=>{ document.querySelectorAll('.so-nuvem').forEach(e=>e.style.display='none'); };
  document.head.appendChild(sc);
  try{ const m=JSON.parse(localStorage.getItem('glopel_arte_atual')||'null'); if(m){ ARTE_ID=m.id; ARTE_NOME=m.nome; } }catch(_){}
}
function lembraArte(){ try{ localStorage.setItem('glopel_arte_atual', JSON.stringify(ARTE_ID?{id:ARTE_ID,nome:ARTE_NOME}:null)); }catch(_){} }
function atualizaConta(){
  const t = USUARIO ? `👤 ${esc(nomeDe(USUARIO.email))}` : '👤 Entrar';
  ['conta','conta2'].forEach(id=>{ if($(id)) $(id).innerHTML=t; });
  if($('nuvemNome')) $('nuvemNome').textContent = ARTE_ID ? `☁️ ${ARTE_NOME}` : '';
}
function modal(html){ $('mbox').innerHTML=html; $('modal').style.display='flex'; }
const fecha = ()=>{ $('modal').style.display='none'; };
function telaLogin(depois){
  modal(`<h3 style="margin:0 0 4px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">Entrar</h3>
    <div class="hint" style="margin-bottom:12px">Entre para salvar suas artes e abrir em qualquer computador.</div>
    <form id="fLogin"><div class="row"><label>Usuário</label><input id="lgU" autocomplete="username" placeholder="admin"></div>
    <div class="row"><label>Senha</label><input id="lgP" type="password" autocomplete="current-password"></div>
    <div id="lgErr" style="color:var(--err);font-size:13px;min-height:18px"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" id="lgX">Cancelar</button><button class="pri" id="lgOk">Entrar</button></div></form>`);
  $('lgU').focus(); $('lgX').onclick=fecha;
  $('fLogin').onsubmit=async e=>{ e.preventDefault(); if(!SB){ $('lgErr').textContent='Sem conexão com o servidor.'; return; }
    $('lgOk').disabled=true; $('lgOk').textContent='Entrando…';
    const {error}=await SB.auth.signInWithPassword({email:emailDe($('lgU').value), password:$('lgP').value});
    $('lgOk').disabled=false; $('lgOk').textContent='Entrar';
    if(error){ $('lgErr').textContent = /invalid/i.test(error.message)?'Usuário ou senha incorretos.':error.message; return; }
    fecha(); toast(`👋 Olá, <b>${esc(nomeDe(USUARIO&&USUARIO.email))}</b>!`); if(depois) depois(); };
}
function menuConta(){
  if(!USUARIO){ telaLogin(); return; }
  modal(`<h3 style="margin:0 0 10px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">👤 ${esc(nomeDe(USUARIO.email))}</h3>
    <div style="display:flex;flex-direction:column;gap:8px"><button class="pri" id="cmA">📂 Minhas artes</button><button id="cmS">Sair</button><button id="cmX">Fechar</button></div>`);
  $('cmA').onclick=minhasArtes; $('cmX').onclick=fecha;
  $('cmS').onclick=async()=>{ await SB.auth.signOut(); ARTE_ID=null; lembraArte(); fecha(); atualizaConta(); toast('Você saiu.'); };
}
function pacoteArte(){
  sincroniza();
  const usados={}; const vis=el=>{ if(el.asset && ASSETS[el.asset]) usados[el.asset]=ASSETS[el.asset]; (el.filhos||[]).forEach(vis); };
  Object.values(design.sacolas).forEach(b=>b.camadas.forEach(vis));
  return {versao:VERSAO, design:JSON.parse(JSON.stringify(design)), assets:usados};
}
function resumoArte(){ return design.carrinho.map(id=>CATALOGO[id]?CATALOGO[id].nome:id).join(' · '); }
async function salvarNuvem(comoNova){
  if(!NUVEM){ toast('Salvar na nuvem só funciona no site (GitHub).'); return; }
  if(!USUARIO){ telaLogin(()=>salvarNuvem(comoNova)); return; }
  if(!design.carrinho.length){ toast('Não há nenhuma sacola para salvar.'); return; }
  if(!ARTE_ID || comoNova){
    modal(`<h3 style="margin:0 0 8px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">💾 Salvar arte</h3>
      <form id="fNome"><div class="row"><label>Nome</label><input id="anNome" value="${esc(comoNova&&ARTE_NOME?ARTE_NOME+' (cópia)':(design.cliente&&design.cliente!=='Minha padaria'?design.cliente:''))}" placeholder="Ex.: Padaria Bom Dia — Natal"></div>
      <div class="hint">Salva todas as sacolas do carrinho, as cores e as imagens.</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" id="anX">Cancelar</button><button class="pri">Salvar</button></div></form>`);
    $('anNome').focus(); $('anNome').select(); $('anX').onclick=fecha;
    $('fNome').onsubmit=async e=>{ e.preventDefault(); const nome=$('anNome').value.trim()||'Sem nome';
      const {data,error}=await SB.from('artes').insert({nome, dados:pacoteArte(), resumo:resumoArte()}).select('id').single();
      if(error){ toast('⚠️ Não salvou: '+esc(error.message)); return; }
      ARTE_ID=data.id; ARTE_NOME=nome; lembraArte(); fecha(); atualizaConta(); toast(`☁️ <b>${esc(nome)}</b> salva na nuvem.`); };
    return;
  }
  const {error}=await SB.from('artes').update({dados:pacoteArte(), resumo:resumoArte(), atualizado:new Date().toISOString()}).eq('id',ARTE_ID);
  if(error){ toast('⚠️ Não salvou: '+esc(error.message)); return; }
  toast(`☁️ <b>${esc(ARTE_NOME)}</b> atualizada.`);
}
async function minhasArtes(){
  if(!NUVEM) return; if(!USUARIO){ telaLogin(minhasArtes); return; }
  modal('<div class="empty">Carregando…</div>');
  const {data,error}=await SB.from('artes').select('id,nome,resumo,atualizado').order('atualizado',{ascending:false});
  if(error){ modal(`<div style="color:var(--err)">${esc(error.message)}</div><div style="text-align:right;margin-top:10px"><button onclick="document.getElementById('modal').style.display='none'">Fechar</button></div>`); return; }
  const dt = s=>new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
  modal(`<h3 style="margin:0 0 10px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">📂 Minhas artes</h3>
    ${data.length?data.map(a=>`<div class="pr" data-id="${a.id}"><div class="nm"><b>${esc(a.nome)}</b>${a.id===ARTE_ID?' <span class="tag">aberta</span>':''}<div class="st" style="color:var(--mute)">${esc(a.resumo||'')} · ${dt(a.atualizado)}</div></div>
      <button data-a="abrir" class="pri">Abrir</button><button data-a="ren">✏️</button><button data-a="del" title="Apagar">🗑</button></div>`).join(''):'<div class="empty">Nenhuma arte salva ainda. No editor, use 💾 Salvar.</div>'}
    <div style="display:flex;justify-content:space-between;margin-top:12px"><button id="maNova">＋ Começar arte nova</button><button id="maX">Fechar</button></div>`);
  $('maX').onclick=fecha;
  $('maNova').onclick=()=>{ fecha(); ARTE_ID=null; lembraArte(); design=designVazio(); novaHistoria(); atualizaConta(); vaiLoja(); toast('Arte nova: escolha as sacolas.'); };
  $('mbox').querySelectorAll('.pr button').forEach(b=>b.onclick=async()=>{ const id=b.closest('.pr').dataset.id, a=data.find(x=>x.id===id);
    if(b.dataset.a==='abrir'){ const {data:row,error}=await SB.from('artes').select('*').eq('id',id).single(); if(error){ toast('⚠️ '+esc(error.message)); return; }
      Object.assign(ASSETS, row.dados.assets||{}); salvaAssets();
      design=row.dados.design; design.qtd=design.qtd||{}; design.confirmadas=design.confirmadas||[];
      design.carrinho=(design.carrinho||[]).filter(i=>CATALOGO[i]); Object.keys(CATALOGO).forEach(i=>{ if(!design.sacolas[i]) design.sacolas[i]={estado:'nenhum',proprio:[],camadas:[]}; });
      ARTE_ID=id; ARTE_NOME=row.nome; lembraArte(); fecha(); novaHistoria(); renderElementos(); atualizaConta();
      if(design.carrinho.length) vaiEditor(design.carrinho.includes(design.atual)?design.atual:design.carrinho[0]); else vaiLoja();
      toast(`📂 <b>${esc(row.nome)}</b> aberta.`); }
    if(b.dataset.a==='ren'){ const li=b.closest('.pr'); li.querySelector('.nm').innerHTML=`<input value="${esc(a.nome)}">`; const inp=li.querySelector('input'); inp.focus(); inp.select();
      b.textContent='✓'; b.onclick=async()=>{ const nome=inp.value.trim()||a.nome; await SB.from('artes').update({nome}).eq('id',id); if(id===ARTE_ID){ ARTE_NOME=nome; lembraArte(); atualizaConta(); } minhasArtes(); }; }
    if(b.dataset.a==='del'){ if(b.dataset.ok!=='1'){ b.dataset.ok='1'; b.textContent='Apagar?'; b.style.color='var(--err)'; return; }
      await SB.from('artes').delete().eq('id',id); if(id===ARTE_ID){ ARTE_ID=null; lembraArte(); atualizaConta(); } minhasArtes(); }
  });
}
