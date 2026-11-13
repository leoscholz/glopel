/* ---------- CORES: adicionar, trocar, remover ---------- */
const PANTONE_GRUPOS = [
  ['Vermelhos e laranjas', ['PANTONE 485 C','PANTONE 186 C','PANTONE 1795 C','PANTONE 1805 C','PANTONE 7621 C','PANTONE 7579 C','PANTONE 165 C','PANTONE 138 C']],
  ['Amarelos', ['PANTONE 116 C','PANTONE 7406 C','PANTONE 1235 C']],
  ['Verdes', ['PANTONE 356 C','PANTONE 349 C','PANTONE 7724 C','PANTONE 5545 C']],
  ['Azuis e roxo', ['PANTONE 3005 C','PANTONE 300 C','PANTONE 286 C','PANTONE 7547 C','PANTONE 2602 C']],
  ['Marrons, neutros e preto', ['PANTONE 469 C','PANTONE 4625 C','PANTONE 7530 C','PANTONE Black C']],
];
const pantoneInfo = nome => PANTONES.find(p=>p[0]===nome);
function coresEmUso(){ return coresUsadas(); }
function seletorPantone(titulo, sub, aoEscolher, bloqueadas){
  const tile = p=>`<button class="pt" data-p="${esc(p[0])}" ${bloqueadas.includes(p[0])?'disabled title="Já está na paleta"':''}><i style="background:${p[1]}"></i><span style="color:${p[1]}">${esc(p[0].replace('PANTONE ',''))}</span></button>`;
  $('mbox').innerHTML = `<h3 style="margin:0 0 4px;color:var(--ink);font-size:16px;text-transform:none;letter-spacing:0">${titulo}</h3>
    <div class="hint" style="margin-bottom:10px">${sub}</div>
    ${PANTONE_GRUPOS.map(([g,lista])=>`<div class="ptg"><div class="ptgt">${g}</div><div class="pts">${lista.map(n=>pantoneInfo(n)).filter(Boolean).map(tile).join('')}</div></div>`).join('')}
    <div class="ptg"><div class="ptgt">Já sabe o código?</div><div class="ptcod"><input id="ptCod" placeholder="Ex.: 7409 C"><input id="ptCor" type="color" value="#cc3333" title="Cor aproximada para ver na tela"><button id="ptUsar">Usar</button></div>
    <div class="hint">A cor da tela é só aproximada — a gráfica imprime pelo código.</div></div>
    <div style="text-align:right;margin-top:12px"><button id="ptFx">Cancelar</button></div>`;
  $('modal').style.display='flex';
  $('ptFx').onclick=()=>$('modal').style.display='none';
  $('mbox').querySelectorAll('.pt').forEach(b=>b.onclick=()=>{ const p=pantoneInfo(b.dataset.p); $('modal').style.display='none'; aoEscolher(p[0], p[2]); });
  $('ptCod').oninput=()=>{ const v=$('ptCod').value.trim().toUpperCase().replace(/^PANTONE\s*/,''); const p=PANTONES.find(x=>x[0]==='PANTONE '+v); if(p) $('ptCor').value=p[1]; };
  $('ptUsar').onclick=()=>{ let v=$('ptCod').value.trim().replace(/^pantone\s*/i,''); if(!v){ $('ptCod').focus(); return; }
    const nome='PANTONE '+v.toUpperCase(); const p=PANTONES.find(x=>x[0]===nome); const [r,g,b]=hex2rgb($('ptCor').value);
    const k=1-Math.max(r,g,b)/255, cm = k>=1?[0,0,0,100]:[ (1-r/255-k)/(1-k), (1-g/255-k)/(1-k), (1-b/255-k)/(1-k), k ].map(x=>Math.round(x*100));
    $('modal').style.display='none'; aoEscolher(nome, p?p[2]:cm); };
}
function adicionarCor(){
  const max=GAB.regras.max_cores, n=Object.keys(arte.paleta).length;
  if(n>=max){
    const naoUsadas=Object.keys(arte.paleta).filter(k=>!coresEmUso().has(k));
    $('mbox').innerHTML = `<h3 style="margin:0 0 8px;color:var(--ink);font-size:16px;text-transform:none;letter-spacing:0">Já são ${max} cores</h3>
      <div style="line-height:1.5">A impressão aceita no máximo <b>${max} cores</b> por sacola — cada cor é uma chapa.<br>
      ${naoUsadas.length?`Há cor sem uso na arte: <b>${naoUsadas.map(k=>esc(arte.paleta[k].pantone)).join(', ')}</b>. Clique nela na lista de Cores para remover.`:'Para usar outra cor, <b>clique numa cor da lista</b> e troque por outra.'}</div>
      <div style="text-align:right;margin-top:12px"><button class="pri" onclick="document.getElementById('modal').style.display='none'">Entendi</button></div>`;
    $('modal').style.display='flex'; return;
  }
  seletorPantone('＋ Adicionar cor', `Escolha uma cor de impressão. Você tem ${n} de ${max}.`, (nome,cmyk)=>{
    const k=chaveNova(nome); arte.paleta[k]={pantone:nome, cmyk}; commit(); render();
    toast(`🎨 <b>${esc(nome)}</b> adicionada. Escolha ela em Ajustes de qualquer item.`);
  }, Object.values(arte.paleta).map(p=>p.pantone));
}
function editarCor(k){
  const p=arte.paleta[k], usada=coresEmUso().has(k);
  seletorPantone(`Trocar ${esc(p.pantone)}`, `Tudo que está nesta cor muda junto${usada?', em todas as sacolas':''}. ${usada?'':'<button id="ptRem" style="margin-left:6px">🗑 Remover cor (sem uso)</button>'}`, (nome,cmyk)=>{
    arte.paleta[k]={pantone:nome, cmyk}; commit(); render(); toast(`🎨 Agora é <b>${esc(nome)}</b>.`);
  }, Object.values(arte.paleta).map(x=>x.pantone).filter(n=>n!==p.pantone));
  if($('ptRem')) $('ptRem').onclick=()=>{ delete arte.paleta[k]; $('modal').style.display='none'; commit(); render(); };
}

/* ---------- COPIAR / COLAR camadas (também entre sacolas) ---------- */
let CLIP = null;
function copiar(){
  const ls=selLayers(); if(!ls.length) return;
  CLIP={gab:design.atual, camadas:JSON.parse(JSON.stringify(ls)), vezes:0};
  toast(`📋 ${ls.length>1?ls.length+' itens copiados':'<b>'+esc(ls[0].id)+'</b> copiado'}. Ctrl+V cola${design.carrinho.length>1?' — inclusive em outra sacola':''}.`);
}
function colar(){
  if(!CLIP) return;
  const mesma = CLIP.gab===design.atual, gO=CATALOGO[CLIP.gab], gD=GAB; CLIP.vezes++;
  const novos=[];
  CLIP.camadas.forEach(c0=>{
    let c = mesma ? JSON.parse(JSON.stringify(c0)) : adaptaCamada(c0, gO, gD);
    if(!GAB.paineis[c.painel]) c.painel='frente';
    if(layer(c.id)){ c.id=novoId(c0.id.replace(/(_copia)?(_\d+)?$/,'')+'_copia'); }
    if(mesma && layer(c0.id)) mover(c, 0.5*CLIP.vezes, -0.5*CLIP.vezes);
    arred(c); arte.camadas.push(c); novos.push(c.id);
  });
  sels=novos; sel=novos[novos.length-1]; commit(); render();
  if(!mesma) toast(`📋 Colado de <b>${esc(gO.nome)}</b>, já adaptado a este tamanho.`);
}
