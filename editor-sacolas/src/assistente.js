/* =====================================================================
   ASSISTENTE ("Criar com ajuda"): dados da padaria → estilo → cores
   Gera a arte nativamente em CADA faca do carrinho; textos ficam ligados
   aos campos (camada.campo) para "📝 Dados da padaria" mudar tudo de uma vez.
   Estilos baseados em artes reais de clientes da Glopel (Drive "artes").
   ===================================================================== */
const CAMPOS = [
  ['nome','Nome da padaria','Ex.: Padaria Bom Dia'],
  ['slogan','Frase (opcional)','Ex.: Panificadora e Confeitaria'],
  ['telefone','Telefone','Ex.: (41) 3333-0000'],
  ['instagram','Instagram','Ex.: @padariabomdia'],
  ['endereco','Endereço','Ex.: Rua das Flores, 123 — Curitiba'],
  ['extra','Recado (opcional)','Ex.: Aceitamos encomendas de bolos e tortas'],
];
const PALETAS_PRONTAS = [
  {id:'classica', nome:'Clássica', c:[['PANTONE 1805 C',[0,91,100,23]],['PANTONE Black C',[0,13,49,98]]]},
  {id:'natural',  nome:'Natural',  c:[['PANTONE 356 C',[91,0,100,27]],['PANTONE 4625 C',[30,72,80,70]]]},
  {id:'cafe',     nome:'Café',     c:[['PANTONE 469 C',[20,70,95,55]],['PANTONE 138 C',[0,52,100,0]]]},
  {id:'azul',     nome:'Azul',     c:[['PANTONE 286 C',[100,75,0,0]],['PANTONE 1235 C',[0,31,98,0]]]},
  {id:'vinho',    nome:'Vinho',    c:[['PANTONE 7621 C',[0,93,85,28]],['PANTONE 7530 C',[33,35,42,8]]]},
  {id:'preto',    nome:'Só preto (1 cor)', c:[['PANTONE Black C',[0,13,49,98]]]},
];
const ESTILOS = [
  {id:'classico', nome:'Clássico', desc:'Nome grande no centro e contatos embaixo'},
  {id:'lista',    nome:'Logo + contatos', desc:'Logo em destaque e lista de contatos'},
  {id:'faixas',   nome:'Faixas laterais', desc:'Laterais coloridas com o Instagram'},
  {id:'estampa',  nome:'Estampa', desc:'Ilustrações de padaria nas bordas'},
  {id:'selo',     nome:'Selo', desc:'Selo redondo discreto no meio'},
];

/* ---------- medir e encaixar texto (cm) ---------- */
const _mc = document.createElement('canvas').getContext('2d');
function larguraTexto(txt, fonte, pt, esp=0){
  const F=FONTES[fonte]||FONTES.Inter; _mc.font=`${F.s} ${F.w} 100px ${F.f}`;
  const tam=pt*PT_CM, linhas=String(txt).split('\n');
  return Math.max(...linhas.map(l=>_mc.measureText(l).width/100*tam + Math.max(0,l.length-1)*esp/1000*tam));
}
function encaixa(txt, fonte, maxW, ptMax, ptMin, esp=0){
  let pt=ptMax; const w=larguraTexto(txt,fonte,pt,esp); if(w>maxW) pt=Math.max(ptMin, pt*maxW/w*0.97); return +pt.toFixed(1);
}
const altLinha = pt => pt*PT_CM*1.25;

/* ---------- logo ---------- */
function camadaLogo(dados, id, cx, cy, larg, corK, painel){
  const L=dados.logo; if(!L) return null;
  let vb, svg, mapa={};
  if(L.tipo==='banco'){ const b=BANCO[L.k]; if(!b) return null; vb=b.vb; svg=b.svg; mapa={'#000000':corK,'#ffffff':'papel'}; }
  else if(L.tipo==='asset'){ const a=ASSETS[L.id]; if(!a) return null;
    if(a.tipo==='img'){ const w=larg; return {id, campo:'logo', painel, tipo:'meiotom', asset:L.id, ar:a.ar, w:+w.toFixed(2), x:+(cx-w/2).toFixed(2), y:+(cy-w*a.ar/2).toFixed(2), cor:corK, angulo:45, forma:'ponto', brilho:0, contraste:0.2, inverter:false, corte:0.05, cheio:0.94}; }
    vb=a.vb; svg=a.svg; Object.keys(a.cores||{}).forEach(h=>mapa[h]= luz(hex2rgb(h))>=0.9 ? 'papel' : corK); }
  const ar=vb[3]/vb[2]; let w=larg; if(w*ar>larg*0.9) w=larg*0.9/ar;
  return {id, campo:'logo', painel, tipo:'vetor', vb, svg, mapa, asset:L.tipo==='asset'?L.id:undefined, w:+w.toFixed(2), x:+(cx-w/2).toFixed(2), y:+(cy-w*ar/2).toFixed(2)};
}

/* ---------- gerador por estilo ---------- */
function gerarArte(estilo, g, dados, c1, c2){
  const P=g.paineis.frente, W=P.w, H=P.h, m=Math.max(M, 0.7), cx=W/2, uw=W-2*m, out=[];
  const S=Math.min(1.25, Math.max(0.55, Math.sqrt(W*H/(17.5*41.5))));     // escala tipográfica pela área da frente
  const temSanf = g.paineis.sanfona_esq && !g.paineis.sanfona_esq.oculto && g.paineis.sanfona_esq.w>0;
  const txt=(campo, y, fonte, ptMax, cor, opts={})=>{ const t=dados[campo]; if(!t) return y;
    const pt=encaixa(t, fonte, opts.maxW||uw, ptMax*S, Math.max(7, ptMax*S*0.35), opts.esp||0);
    out.push({id:opts.id||campo, campo, painel:'frente', tipo:'texto', texto:t, fonte, tamanho_pt:pt, alinhamento:opts.al||'centro', x:opts.x??cx, y:+y.toFixed(2), cor, espacamento:opts.esp||0});
    return y - altLinha(pt)*(opts.gap||1.35); };
  const contatos=(yTop, cor, ptBase=12)=>{ let y=yTop;
    ['telefone','instagram','endereco'].forEach(k=>{ y=txt(k, y, k==='telefone'?'Heros Bold':'Heros', ptBase, cor, {gap:1.2}); });
    if(dados.extra) y=txt('extra', y-0.2, 'Pagella Italic', ptBase*0.95, cor, {gap:1.2});
    return y; };
  const nomeFonte = {classico:'Bonum Bold', lista:'Bonum Bold', faixas:'Heros Cond Bold', estampa:'Heros Cond Bold', selo:'Bonum Bold'}[estilo];

  if(estilo==='classico'){
    let y=H*0.80;
    const lg=camadaLogo(dados,'logo',cx,y,Math.min(uw*0.55,H*0.2),c2||c1,'frente'); if(lg){ out.push(lg); y-= (lg.w*(lg.vb?lg.vb[3]/lg.vb[2]:lg.ar||1))/2 + 1.8*S; } else y=H*0.70;
    y=txt('nome', y, nomeFonte, 40, c1);
    y=txt('slogan', y+0.2*S, 'Heros Bold', 13, c2||c1, {esp:180});
    out.push({id:'divisor', painel:'frente', tipo:'linha', x1:+(cx-uw*0.3).toFixed(2), y1:+(y+0.25*S).toFixed(2), x2:+(cx+uw*0.3).toFixed(2), y2:+(y+0.25*S).toFixed(2), contorno:c2||c1, traco_mm:0.6});
    contatos(Math.min(y-0.6*S, H*0.30), c1);
  }
  if(estilo==='lista'){
    let y=H*0.74;
    const lg=camadaLogo(dados,'logo',cx,y,Math.min(uw*0.75,H*0.3),c1,'frente');
    if(lg){ out.push(lg); y-=(lg.w*(lg.vb?lg.vb[3]/lg.vb[2]:lg.ar||1))/2+1.4*S; y=txt('nome', y, 'Pagella Italic', 22, c1); }
    else { y=txt('nome', H*0.66, 'Pagella Italic', 44, c1); }
    y=txt('slogan', y, 'Heros', 11, c2||c1, {esp:120});
    const x0 = m + uw*0.12, rot={telefone:'Fone', instagram:'Insta', endereco:'End.'}; y-=0.8*S;
    ['telefone','instagram','endereco'].forEach(k=>{ if(!dados[k]) return; const pt=encaixa(dados[k],'Heros Bold',uw*0.62,12*S,7);
      out.push({id:'rot_'+k, painel:'frente', tipo:'texto', texto:rot[k], fonte:'Heros', tamanho_pt:+(pt*0.8).toFixed(1), alinhamento:'esquerda', x:+x0.toFixed(2), y:+y.toFixed(2), cor:c2||c1});
      out.push({id:k, campo:k, painel:'frente', tipo:'texto', texto:dados[k], fonte:'Heros Bold', tamanho_pt:pt, alinhamento:'esquerda', x:+(x0+uw*0.2).toFixed(2), y:+y.toFixed(2), cor:c1});
      y-=altLinha(pt)*1.5; });
    if(dados.extra) txt('extra', y-0.3*S, 'Pagella Italic', 12, c1);
  }
  if(estilo==='faixas'){
    let y=H*0.72;
    const lg=camadaLogo(dados,'logo',cx,y,Math.min(uw*0.6,H*0.22),c2||c1,'frente'); if(lg){ out.push(lg); y-=(lg.w*(lg.vb?lg.vb[3]/lg.vb[2]:lg.ar||1))/2+1.6*S; } else y=H*0.66;
    y=txt('nome', y, nomeFonte, 46, c1, {esp:40});
    y=txt('slogan', y, 'Heros Bold', 12, c2||c1, {esp:160});
    contatos(Math.min(y-0.8*S, H*0.28), c1);
    if(temSanf) ['sanfona_esq','sanfona_dir'].forEach(sf=>{ const p=g.paineis[sf], hw=p.w/2;
      out.unshift({id:'faixa_'+sf, painel:sf, tipo:'retangulo', x:0, y:0, w:p.w, h:p.h, cor:c2||c1, fundo:true});
      const lado = dados.instagram||dados.nome||''; if(!lado) return;
      [hw/2, hw*1.5].forEach((xx,i)=>{ const pt=encaixa(lado,'Heros Cond Bold',p.h*0.8, Math.min(26, hw*0.62/PT_CM), 7, 100);
        out.push({id:`lat_${sf}_${i}`, campo: dados.instagram?'instagram':'nome', painel:sf, tipo:'texto', texto:lado, fonte:'Heros Cond Bold', tamanho_pt:pt, alinhamento:'centro', x:+(xx+pt*PT_CM*0.35).toFixed(2), y:+(p.h/2).toFixed(2), rotacao:90, cor:'papel', espacamento:100}); });
    });
  }
  if(estilo==='estampa'){
    const b=BANCO.pattern, faixaW=Math.min(W*0.2, 4), ar=b.vb[3]/b.vb[2];
    [0, W-faixaW].forEach((x,i)=>{ const w=faixaW, hh=w*ar; let yy=0, n=0; while(yy<H && n<6){ out.push({id:`estampa_${i}_${n}`, painel:'frente', tipo:'vetor', vb:b.vb, svg:b.svg, mapa:{'#000000':c2||c1,'#ffffff':'papel'}, w:+w.toFixed(2), x:+x.toFixed(2), y:+yy.toFixed(2), fundo:true}); yy+=hh; n++; } });
    const iw=W-2*faixaW-0.6; let y=H*0.58;
    const lg=camadaLogo(dados,'logo',cx,H*0.76,Math.min(iw*0.6,H*0.18),c1,'frente'); if(lg) out.push(lg);
    y=txt('nome', y, nomeFonte, 48, c1, {maxW:iw});
    y=txt('slogan', y, 'Heros Bold', 11, c1, {maxW:iw, esp:140});
    let yc=Math.min(y-0.6*S, H*0.3); ['telefone','instagram','endereco','extra'].forEach(k=>{ yc=txt(k, yc, k==='extra'?'Pagella Italic':'Heros Bold', 11, c1, {maxW:iw, gap:1.2}); });
  }
  if(estilo==='selo'){
    const r=Math.min(uw*0.42, H*0.17), cy=H*0.56;
    out.push({id:'selo_fundo', painel:'frente', tipo:'elipse', x:cx, y:+cy.toFixed(2), rx:+r.toFixed(2), ry:+r.toFixed(2), cor:c1});
    out.push({id:'selo_anel', painel:'frente', tipo:'elipse', x:cx, y:+cy.toFixed(2), rx:+(r*0.88).toFixed(2), ry:+(r*0.88).toFixed(2), contorno:'papel', traco_mm:0.7});
    const lg=camadaLogo(dados,'logo',cx,cy+r*0.35,r*0.7,'papel','frente'); if(lg){ if(lg.mapa) Object.keys(lg.mapa).forEach(h=>{ if(lg.mapa[h]!=='papel') lg.mapa[h]='papel'; else lg.mapa[h]=c1; }); out.push(lg); }
    if(dados.nome){ const pt=encaixa(dados.nome, nomeFonte, r*1.5, 26*S, 7); out.push({id:'nome', campo:'nome', painel:'frente', tipo:'texto', texto:dados.nome, fonte:nomeFonte, tamanho_pt:pt, alinhamento:'centro', x:cx, y:+(cy-(lg?r*0.15:0)-pt*PT_CM*0.35).toFixed(2), cor:'papel'}); }
    let y=cy-r-1.4*S; y=txt('slogan', y, 'Heros Bold', 11, c2||c1, {esp:160});
    contatos(y-0.2*S, c2||c1, 10);
  }
  // nada pode passar da área útil: encolhe o bloco inteiro de baixo se precisar
  const baixo=out.filter(c=>c.painel==='frente' && c.tipo==='texto' && !c.rotacao).map(c=>c.y-(c.tamanho_pt||12)*PT_CM*0.3);
  const minY=Math.min(...baixo, Infinity);
  if(minY < m){ const topoY=H*0.85, f=(topoY-m)/(topoY-minY); out.forEach(c=>{ if(c.painel!=='frente'||c.fundo) return;
    if(typeof c.y==='number') c.y=+(topoY-(topoY-c.y)*f).toFixed(2); if(c.tipo==='linha'){ c.y1=c.y2=+(topoY-(topoY-c.y1)*f).toFixed(2); }
    if(c.tipo==='texto') c.tamanho_pt=+Math.max(g.regras.texto_min_pt+0.5, c.tamanho_pt*Math.max(0.75,f)).toFixed(1); }); }
  return out;
}

/* ---------- prévia pequena (frente) ---------- */
function previaFrente(camadas, g, paleta, alt=150){
  const P=g.paineis.frente, gA=GAB, aA=arte, mA=modo;
  GAB=g; arte={cliente:'',paleta,camadas}; modo='previa';
  let s=''; try{ s=camadas.filter(c=>c.painel==='frente').map(c=>elSVG(c,true)).join(''); }finally{ GAB=gA; arte=aA; modo=mA; }
  const k=alt/P.h; return `<svg width="${P.w*k}" height="${alt}" viewBox="0 ${-P.h} ${P.w} ${P.h}"><rect x="0" y="${-P.h}" width="${P.w}" height="${P.h}" fill="${COR_PAPEL[g.papel]}"/>${s}</svg>`;
}

/* ---------- o assistente ---------- */
let WZ=null;
function abrePorta(){
  modal(`<h3 style="margin:0 0 6px;color:var(--ink);font-size:18px;text-transform:none;letter-spacing:0">Como você quer começar?</h3>
    <div class="hint" style="margin-bottom:14px">Dá para mudar tudo depois, nas duas opções.</div>
    <div class="porta"><button id="ptAj" class="pri"><b>✨ Criar com ajuda</b><span>Responda 4 perguntas e a arte fica pronta em todas as sacolas</span></button>
    <button id="ptZero"><b>Começar do zero</b><span>Folha em branco para montar do seu jeito</span></button></div>`);
  $('ptAj').onclick=()=>assistente(); $('ptZero').onclick=()=>{ design.portaVista=true; agendaSalvar(); fecha(); };
}
function assistente(){
  WZ={passo:0, dados:Object.assign({}, design.dados||{}), estilo:design.estilo||'classico', pal:design.paletaPronta||'classica'};
  if(!WZ.dados.nome && design.cliente && design.cliente!=='Minha padaria') WZ.dados.nome=design.cliente;
  passoWZ();
}
function paletaDe(id){ const p=PALETAS_PRONTAS.find(x=>x.id===id)||PALETAS_PRONTAS[0]; const pal={}, ks=[];
  p.c.forEach(([n,cm],i)=>{ const k=i?'secundaria':'principal'; pal[k]={pantone:n,cmyk:cm}; ks.push(k); }); return {pal, c1:ks[0], c2:ks[1]}; }
function gabPrevia(){ const id=design.carrinho.includes(design.atual)?design.atual:design.carrinho[0]; return CATALOGO[id]||CATALOGO.f5_kraft; }
function passoWZ(){
  const P=WZ.passo, tit=['Seus dados','Seu logo','Escolha o estilo','Escolha as cores'][P];
  const barra=`<div class="wzbar">${[0,1,2,3].map(i=>`<i class="${i<=P?'on':''}"></i>`).join('')}</div>`;
  let corpo='';
  if(P===0) corpo = CAMPOS.map(([k,l,ph])=>`<div class="row"><label>${l}</label><input data-c="${k}" value="${esc(WZ.dados[k]||'')}" placeholder="${esc(ph)}"></div>`).join('');
  if(P===1){ const L=WZ.dados.logo, sel=k=>L&&L.tipo==='banco'&&L.k===k?'on':'';
    corpo = `<div class="hint" style="margin-bottom:8px">Envie o logo (SVG é o ideal) ou escolha um desenho. Pode pular.</div>
      <div style="display:flex;gap:8px;margin-bottom:10px"><button id="wzUp" class="pri">⬆ Enviar meu logo</button><button id="wzSem" class="${!L?'on':''}">Sem logo</button></div>
      ${L&&L.tipo==='asset'&&ASSETS[L.id]?`<div class="hint">✓ Usando <b>${esc(ASSETS[L.id].nome)}</b></div>`:''}
      <div class="tiles">${['trigo','pao','croissant','baguete','xicara','coracao','estrela'].map(k=>`<button class="tile ${sel(k)}" data-k="${k}"><span class="ti">${miniVetor(BANCO[k].vb,BANCO[k].svg,{'#000000':1,'#ffffff':'papel'})}</span><span class="tn">${BANCO[k].nome}</span></button>`).join('')}</div>`; }
  if(P===2){ const g=gabPrevia(), {pal,c1,c2}=paletaDe(WZ.pal);
    corpo = `<div class="hint" style="margin-bottom:8px">Prévia na ${esc(g.nome)}. As outras sacolas recebem o mesmo estilo no tamanho delas.</div><div class="estilos">${ESTILOS.map(e=>
      `<button class="est ${e.id===WZ.estilo?'on':''}" data-e="${e.id}">${previaFrente(gerarArte(e.id,g,WZ.dados,c1,c2),g,pal,150)}<b>${e.nome}</b><span>${e.desc}</span></button>`).join('')}</div>`; }
  if(P===3){ const g=gabPrevia();
    corpo = `<div class="estilos">${PALETAS_PRONTAS.map(p=>{ const {pal,c1,c2}=paletaDe(p.id);
      return `<button class="est ${p.id===WZ.pal?'on':''}" data-p="${p.id}">${previaFrente(gerarArte(WZ.estilo,g,WZ.dados,c1,c2),g,pal,130)}<b>${p.nome}</b><span>${p.c.map(c=>`<i class="pchip" style="background:${cmyk2hex(c[1])}"></i>`).join('')}</span></button>`; }).join('')}</div>
      <div class="hint" style="margin-top:6px">Kraft ou branco você escolhe na loja. Cores avulsas: aba 🎨 Cores depois.</div>`; }
  modal(`<div class="wz"><h3 style="margin:0 0 4px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">✨ ${tit} <span style="color:var(--mute);font-weight:500;font-size:13px">· passo ${P+1} de 4</span></h3>${barra}
    <div class="wzc">${corpo}</div>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px"><button id="wzV">${P?'← Voltar':'Cancelar'}</button><button id="wzN" class="pri">${P<3?'Continuar →':'✨ Criar minha arte'}</button></div></div>`);
  $('mbox').classList.add('largo');
  const salvaCampos=()=>$('mbox').querySelectorAll('input[data-c]').forEach(i=>WZ.dados[i.dataset.c]=i.value.trim());
  if(P===0){ const i=$('mbox').querySelector('input'); i&&i.focus(); }
  if(P===1){ $('wzUp').onclick=()=>{ const f=$('file'); const ant=f.onchange; f.onchange=async e=>{ const arq=e.target.files[0]; e.target.value=''; f.onchange=ant; if(!arq) return;
      const ext=arq.name.split('.').pop().toLowerCase();
      if(ext==='svg'){ try{ const d=normalizaSVG(await arq.text()); const id=novoAsset('vet'); ASSETS[id]={tipo:'svg',nome:arq.name,vb:d.vb,svg:d.markup,cores:d.cores}; salvaAssets(); WZ.dados.logo={tipo:'asset',id}; }catch(err){ toast('⚠️ SVG inválido'); } }
      else if(['png','jpg','jpeg','webp'].includes(ext)){ const data=await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(arq); }); const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=data; });
        const W=Math.min(900,img.naturalWidth), H=Math.round(W*img.naturalHeight/img.naturalWidth), cv=document.createElement('canvas'); cv.width=W; cv.height=H; const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,W,H); x.drawImage(img,0,0,W,H);
        const id=novoAsset('img'); ASSETS[id]={tipo:'img',nome:arq.name,data:cv.toDataURL('image/jpeg',0.86),ar:H/W}; salvaAssets(); WZ.dados.logo={tipo:'asset',id}; toast('Foto vira retícula de 1 cor. Para um logo nítido, use SVG.'); }
      renderElementos(); passoWZ(); }; f.click(); };
    $('wzSem').onclick=()=>{ WZ.dados.logo=null; passoWZ(); };
    $('mbox').querySelectorAll('.tile').forEach(t=>t.onclick=()=>{ WZ.dados.logo={tipo:'banco',k:t.dataset.k}; passoWZ(); }); }
  $('mbox').querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{ WZ.estilo=b.dataset.e; passoWZ(); });
  $('mbox').querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{ WZ.pal=b.dataset.p; passoWZ(); });
  $('wzV').onclick=()=>{ salvaCampos(); if(P){ WZ.passo--; passoWZ(); } else { $('mbox').classList.remove('largo'); fecha(); } };
  $('wzN').onclick=()=>{ salvaCampos();
    if(P===0 && !WZ.dados.nome){ toast('Escreva pelo menos o nome.'); $('mbox').querySelector('input').focus(); return; }
    if(P<3){ WZ.passo++; passoWZ(); } else { aplicaAssistente(); } };
}
function aplicaAssistente(){
  sincroniza(); const antes=hpos, {pal,c1,c2}=paletaDe(WZ.pal);
  design.dados=WZ.dados; design.estilo=WZ.estilo; design.paletaPronta=WZ.pal; design.portaVista=true;
  design.cliente=WZ.dados.nome||design.cliente;
  Object.keys(design.paleta).forEach(k=>delete design.paleta[k]); Object.assign(design.paleta, pal);
  design.carrinho.forEach(id=>{ const b=design.sacolas[id]; b.camadas=gerarArte(WZ.estilo, CATALOGO[id], WZ.dados, c1, c2); b.estado='auto'; b.proprio=[]; });
  design.confirmadas=[]; design.ultima=design.atual;
  $('mbox').classList.remove('largo'); fecha();
  propagando=false; abreSacola(design.atual, true, true); propagando=true; salvaHist(); atualizaSacolas();
  faixa(`✨ Arte criada em ${design.carrinho.length} sacola${design.carrinho.length>1?'s':''}. Confira cada uma (🟡) e ajuste o que quiser.`, [['↶ Desfazer', ()=>restaura(antes)]], 12000);
}

/* ---------- 📝 Dados da padaria (muda o texto em todas as sacolas) ---------- */
function painelDados(){
  const d=design.dados||{};
  modal(`<h3 style="margin:0 0 4px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">📝 Dados da padaria</h3>
    <div class="hint" style="margin-bottom:10px">Mudou algo aqui? Muda em <b>todas as sacolas</b>, sem desfazer seus ajustes de posição.</div>
    ${CAMPOS.map(([k,l,ph])=>`<div class="row"><label>${l}</label><input data-c="${k}" value="${esc(d[k]||'')}" placeholder="${esc(ph)}"></div>`).join('')}
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:12px"><button id="dtEst">🎨 Trocar estilo…</button><span><button id="dtX">Cancelar</button> <button id="dtOk" class="pri">Aplicar</button></span></div>`);
  $('dtX').onclick=fecha; $('dtEst').onclick=()=>{ fecha(); assistente(); WZ.passo=2; passoWZ(); };
  $('dtOk').onclick=()=>{ sincroniza(); const novo=Object.assign({}, d); $('mbox').querySelectorAll('input[data-c]').forEach(i=>novo[i.dataset.c]=i.value.trim());
    let n=0; const faltam=[];
    design.carrinho.forEach(id=>{ const vis=c=>{ if(c.campo && c.tipo==='texto' && c.campo in novo){ const v=novo[c.campo]; if(v){ if(c.texto!==v){ c.texto=v; n++; } c.visivel=true; } else if(c.visivel!==false){ c.visivel=false; n++; } } (c.filhos||[]).forEach(vis); };
      design.sacolas[id].camadas.forEach(vis); });
    CAMPOS.forEach(([k,l])=>{ if(novo[k] && !d[k]) faltam.push(l); });
    design.dados=novo; if(novo.nome) design.cliente=novo.nome;
    fecha(); propagando=false; abreSacola(design.atual, true, true); propagando=true; salvaHist(); atualizaSacolas();
    toast(`📝 ${n} texto${n===1?'':'s'} atualizado${n===1?'':'s'} nas sacolas.${faltam.length?` Para incluir ${faltam.join(', ')}, use 🎨 Trocar estilo.`:''}`); };
}
