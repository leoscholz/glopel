/* ================== KIT PARA A GRÁFICA (clicheria) ==================
   ZIP por pedido com, para cada sacola do carrinho:
   - ARTE-FINAL.pdf: pág. 1 = arte 1:1 com cores especiais (Separation) por Pantone, texto em curvas,
     faca em cor especial "FACA - NAO IMPRIMIR", marcas de registro (All) e bloco de informações;
     pág. seguintes = uma chapa por cor (preto, 1:1); última = ficha técnica (A4).
   - prévia planificada, chapas em PNG, prévias 3D de vários ângulos, arquivos originais.
   Tudo roda no navegador: jsPDF/JSZip/opentype pelo cdnjs; svg2pdf embutido (não está no cdnjs);
   fontes .woff embutidas (as mesmas famílias da tela) para converter texto em curvas. */
const FONTE_ARQ = { "Inter":"inter-latin-400-normal", "Inter Bold":"inter-latin-700-normal", "Inter Black":"inter-latin-900-normal",
  "Heros":"arimo-latin-400-normal", "Heros Bold":"arimo-latin-700-normal", "Heros Cond Bold":"archivo-narrow-latin-700-normal",
  "Bonum Bold":"libre-baskerville-latin-700-normal", "Schola Bold":"libre-baskerville-latin-700-normal",
  "Pagella Italic":"eb-garamond-latin-400-italic", "Chorus":"eb-garamond-latin-500-italic" };
const FONTES_B64 = __FONTES_CURVA__;
var OT_FONTES = {}, CURVAS = false;
function carregaScript(url){ return new Promise((ok,erro)=>{ const s=document.createElement('script'); s.src=url; s.onload=ok; s.onerror=()=>erro(new Error('não carregou '+url)); document.head.appendChild(s); }); }
async function carregaLibsKit(){
  if(!window.jspdf) await carregaScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if(!window.svg2pdf){ const s=document.createElement('script'); s.textContent=$('lib-svg2pdf').textContent; document.head.appendChild(s); }
  if(!window.JSZip) await carregaScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  if(!window.opentype) await carregaScript('https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js');
}
function fonteOT(nome){ const arq=FONTE_ARQ[nome]||FONTE_ARQ.Inter;
  if(!OT_FONTES[arq]){ const bin=atob(FONTES_B64[arq]), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); OT_FONTES[arq]=opentype.parse(u.buffer); }
  return OT_FONTES[arq]; }
// texto → contorno (mesma regra do <text> da tela: âncora, entrelinha, espaçamento, kerning)
function textoEmCurvas(el, linhas, tam, lh, anc){
  const f=fonteOT(el.fonte), esc_=tam/f.unitsPerEm, ls=(el.espacamento||0)/1000*tam; let d='';
  linhas.forEach((l,i)=>{ const gs=f.stringToGlyphs(l||''); let pen=0; const pos=[];
    gs.forEach((g,j)=>{ pos.push(pen); pen += (g.advanceWidth||0)*esc_ + ls; if(j<gs.length-1) pen += f.getKerningValue(g, gs[j+1])*esc_; });
    const x0 = anc==='middle' ? -pen/2 : anc==='end' ? -pen : 0;
    gs.forEach((g,j)=>{ d += g.getPath(x0+pos[j], i*lh, tam).toPathData(4); }); });
  return d || 'M0 0';
}

// ---- SVG de exportação (folha inteira, em cm, y para baixo como na tela) ----
const MG_KIT = {l:2.5, r:2.5, t:2.5, b:8.5};   // margens da página (cm); embaixo vai o bloco de informações
function svgKit(op){   // op: {cor:k=>css, faca:css|null, papel:css|null, marcas:css|null}
  const W=xmax-xmin, H=ymax-ymin, vb=`${xmin-MG_KIT.l} ${-ymax-MG_KIT.t} ${W+MG_KIT.l+MG_KIT.r} ${H+MG_KIT.t+MG_KIT.b}`;
  const antes=corOverride; corOverride=op.cor; CURVAS=true;
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W+MG_KIT.l+MG_KIT.r}cm" height="${H+MG_KIT.t+MG_KIT.b}cm"><defs>`;
  PAINEIS.forEach(pn=>GAB.paineis[pn].partes.forEach((p,i)=>{ s+=`<clipPath id="kc-${pn}-${i}"><rect x="${p.x}" y="${-(p.y+p.h)}" width="${p.w}" height="${p.h}"/></clipPath>`; }));
  s+=`</defs>`;
  if(op.papel) s+=`<path d="${contornoD()}" fill="${op.papel}"/>`;
  try{ arte.camadas.forEach((c,ci)=>{ if(c.visivel===false) return; const pn=GAB.paineis[c.painel]; if(!pn||pn.oculto) return;
    pn.partes.forEach((p,i)=>{ if(!(p.w>0)) return; s+=`<g data-cam="${ci}" clip-path="url(#kc-${c.painel}-${i})"><g transform="translate(${p.x-p.px},${-p.y})">${elSVG(c,true)}</g></g>`; }); }); }
  finally{ corOverride=antes; CURVAS=false; }
  if(op.faca){ const k=op.faca; s+=`<g fill="none" stroke="${k}" stroke-width="0.03"><path d="${contornoD()}"/>`;
    GAB.dobras.forEach(([a,b])=>{ s+=`<line x1="${a[0]}" y1="${-a[1]}" x2="${b[0]}" y2="${-b[1]}" stroke-dasharray="0.3 0.2"/>`; });
    PAINEIS.forEach(pn=>(GAB.paineis[pn].linhas_internas||[]).forEach(li=>{ const pt=GAB.paineis[pn].partes[0]; if(li.tipo==='emenda'){ const x=pt.x-pt.px+li.x; s+=`<line x1="${x}" y1="${-(pt.y+pt.h)}" x2="${x}" y2="${-pt.y}" stroke-dasharray="0.1 0.15"/>`; } }));
    GAB.areas_cola.forEach(r=>{ s+=`<rect x="${r.x}" y="${-(r.y+r.h)}" width="${r.w}" height="${r.h}" stroke-dasharray="0.15 0.15"/>`; });
    s+=`</g>`; }
  if(op.marcas){ const m=op.marcas, cs=[[xmin-1.2,-ymax-1.2],[xmax+1.2,-ymax-1.2],[xmin-1.2,-ymin+1.2],[xmax+1.2,-ymin+1.2]];
    cs.forEach(([x,y])=>{ s+=`<g fill="none" stroke="${m}" stroke-width="0.025"><circle cx="${x}" cy="${y}" r="0.35"/><line x1="${x-0.6}" y1="${y}" x2="${x+0.6}" y2="${y}"/><line x1="${x}" y1="${y-0.6}" x2="${x}" y2="${y+0.6}"/></g><circle cx="${x}" cy="${y}" r="0.12" fill="${m}"/>`; }); }
  s+=`</svg>`;
  return resolveFuros(s.replace(/fill="transparent"/g,'fill="none"'));
}
// "papel" dentro de um vetor = furo. Na tela isso é máscara; o svg2pdf não faz máscara, então:
// o furo é pintado da cor do papel (recorta as tintas) e as camadas de trás são redesenhadas recortadas no formato do furo.
function resolveFuros(txt){
  if(!txt.includes('data-furo')) return txt;
  const box=document.createElement('div'); box.style.cssText='position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden'; box.innerHTML=txt; document.body.appendChild(box);
  try{ const root=box.firstElementChild, NS='http://www.w3.org/2000/svg', defs=root.querySelector('defs'), base=root.getScreenCTM().inverse(); let n=0;
    const grupos=[...root.children].filter(g=>g.hasAttribute('data-cam'));
    grupos.forEach(g=>{ const furos=[...g.querySelectorAll('[data-furo]')]; if(!furos.length) return; const ci=+g.getAttribute('data-cam');
      const atras=grupos.filter(h=>+h.getAttribute('data-cam')<ci); if(!atras.length) return;
      const cp=document.createElementNS(NS,'clipPath'); cp.id='furo'+(++n);
      furos.forEach(f=>{ const m=base.multiply(f.getScreenCTM()), k=f.cloneNode(false); k.removeAttribute('data-furo'); ['fill','stroke','clip-path','mask','style','class'].forEach(a=>k.removeAttribute(a));
        k.setAttribute('transform',`matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')})`); cp.appendChild(k); });
      defs.appendChild(cp);
      const w=document.createElementNS(NS,'g'); w.setAttribute('clip-path',`url(#${cp.id})`); atras.forEach(h=>{ const k=h.cloneNode(true); k.removeAttribute('data-cam'); w.appendChild(k); });
      g.after(w); });
    root.querySelectorAll('[data-furo]').forEach(f=>f.removeAttribute('data-furo'));
    return root.outerHTML; }
  finally{ box.remove(); }
}

// ---- cores especiais (Separation) no jsPDF: cor "sentinela" no SVG → operador de cor especial no PDF ----
const nomePDF = t => '/'+String(t).replace(/[^A-Za-z0-9\-_.]/g, ch=>'#'+ch.charCodeAt(0).toString(16).padStart(2,'0').toUpperCase());
function novoPDF(w,h){ const {jsPDF}=window.jspdf; return new jsPDF({unit:'cm', format:[w,h], orientation: w>h?'landscape':'portrait', compress:true}); }
function ligaSpots(doc, spots){   // spots: [{nome, cmyk:[c,m,y,k] 0..1, hex sentinela}]
  const porHex={}; spots.forEach((s,i)=>{ s.cs='CS'+i; porHex[s.hex.toLowerCase()]=s; });
  // jsPDF 2.5.1 não tem evento para o dicionário de recursos: fechamos o /XObject e abrimos o /ColorSpace
  // (o ">>" que o jsPDF escreve depois fecha o /ColorSpace). Inscrito só na hora de gerar, para ser o último.
  doc.__ligaCores = ()=> doc.internal.events.subscribe('putXobjectDict', ()=>{
    doc.internal.write('>> /ColorSpace <<'+spots.map(s=>`/${s.cs} [/Separation ${nomePDF(s.nome)} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${s.cmyk.map(v=>(+v).toFixed(3)).join(' ')}] /N 1 >>]`).join(' ')); });
  const hexDe=a=>{ if(typeof a[0]==='string'){ const v=a[0].trim().toLowerCase(); if(v[0]==='#') return v.length===4?'#'+[...v.slice(1)].map(c=>c+c).join(''):v; const m=v.match(/rgb\(([^)]+)\)/); if(m) return rgb2hex(...m[1].split(',').map(x=>Math.round(+x))); return null; }
    if(a.length>=3 && a.slice(0,3).every(x=>typeof x==='number')){ const t=a.slice(0,3), u=t.every(y=>y<=1)&&t.some(y=>!Number.isInteger(y)); return rgb2hex(...t.map(x=>u?x*255:x)); } return null; };
  ['setFillColor','setDrawColor'].forEach((fn,ix)=>{ const orig=doc[fn].bind(doc);
    doc[fn]=function(...a){ const h=hexDe(a), s=h&&porHex[h]; if(s){ doc.internal.write(`/${s.cs} ${ix?'CS':'cs'} 1 ${ix?'SCN':'scn'}`); return doc; } return orig(...a); }; });
  return porHex;
}
const SENT = i => rgb2hex(17+i*7, 3+i*5, 211-i*3);   // cores-sentinela improváveis
async function svgNoPDF(doc, svgTxt, x, y, w, h){
  const box=document.createElement('div'); box.style.cssText='position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden'; box.innerHTML=svgTxt; document.body.appendChild(box);
  try{ await doc.svg(box.firstElementChild, {x, y, width:w, height:h}); } finally { box.remove(); } }

const nomeArq = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'');
const fmt = (v,d=1) => (+v).toFixed(d).replace('.',',');
function infoCores(){ return Object.keys(arte.paleta).filter(k=>coresEmUso().has(k)).map((k,i)=>({k, nome:arte.paleta[k].pantone, cmyk:arte.paleta[k].cmyk.map(v=>v/100), hex:cmyk2hex(arte.paleta[k].cmyk), sent:SENT(i)})); }
function textoDoBloco(doc, x, y, linhas){ linhas.forEach(([t,tam,neg,cor],i)=>{ doc.setFont('helvetica', neg?'bold':'normal'); doc.setFontSize(tam); doc.setTextColor(cor||'#111111'); doc.text(t, x, y); y += tam*0.045; }); return y; }

async function pdfDaSacola(id, ped, previas){
  const g=CATALOGO[id], cores=infoCores(), W=xmax-xmin+MG_KIT.l+MG_KIT.r, H=ymax-ymin+MG_KIT.t+MG_KIT.b;
  const doc=novoPDF(W,H);
  const spots=[...cores.map(c=>({nome:c.nome, cmyk:c.cmyk, hex:c.sent})), {nome:'FACA - NAO IMPRIMIR', cmyk:[0,1,0,0], hex:'#fe00fd'}, {nome:'All', cmyk:[1,1,1,1], hex:'#010203'}];
  ligaSpots(doc, spots);
  doc.setProperties({title:`Arte-final ${g.nome} — ${ped.cliente}`, subject:`Pedido ${ped.num}`, creator:'GloboEditor · Embalagens Globo', keywords:'flexografia, arte-final, Pantone'});
  // pág. 1: arte com cores especiais
  const mapa={}; cores.forEach(c=>mapa[c.k]=c.sent);
  await svgNoPDF(doc, svgKit({cor:k=>k==='papel'?'#ffffff':(mapa[k]||'#ffffff'), faca:'#fe00fd', papel:null, marcas:'#010203'}), 0, 0, W, H);
  // bloco de informações (fica fora da faca, embaixo)
  let y=ymax-ymin+MG_KIT.t+1.3; const x0=MG_KIT.l;
  y=textoDoBloco(doc, x0, y, [[`ARTE-FINAL · ${g.nome}`, 20, true], [`Cliente: ${ped.cliente}   ·   Pedido: ${ped.num}   ·   Data: ${ped.data}   ·   Quantidade: ${ped.qtd(id)} mil`, 11],
    [`Faca ${String(g.fonte||g.nome).replace(/\.pdf$/i,'')} · folha aberta ${fmt(xmax-xmin)} × ${fmt(ymax-ymin)} cm · frente ${fmt(g.paineis.frente.w)} × ${fmt(g.paineis.frente.h)} cm · papel ${g.papel==='branco'?'branco monolúcido':'kraft natural'} · ESCALA 1:1`, 11],
    [`${cores.length} cor${cores.length!==1?'es':''} especiais (Pantone) · textos convertidos em curvas · linha magenta "FACA - NAO IMPRIMIR" é só referência · margem de segurança ${M*10} mm`, 10, false, '#444444']]);
  y+=0.3; let sx=x0;
  cores.forEach((c,i)=>{ doc.setFillColor(c.sent); doc.rect(sx, y, 1.6, 1.1, 'F'); doc.setDrawColor('#999999'); doc.setLineWidth(0.01); doc.rect(sx,y,1.6,1.1,'S');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor('#111111'); doc.text(`CHAPA ${i+1}: ${c.nome}`, sx+1.9, y+0.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor('#555555'); doc.text(`ref. CMYK ${c.cmyk.map(v=>Math.round(v*100)).join('/')} (só tela)`, sx+1.9, y+0.95); sx += 9.5; });
  // pág. das chapas (uma por cor, preto 100%, mesmo registro)
  for(let i=0;i<cores.length;i++){ const c=cores[i]; doc.addPage([W,H], W>H?'landscape':'portrait');
    await svgNoPDF(doc, svgKit({cor:k=>k===c.k?'#000000':'#ffffff', faca:'#fe00fd', papel:null, marcas:'#010203'}), 0, 0, W, H);
    textoDoBloco(doc, x0, ymax-ymin+MG_KIT.t+1.3, [[`CHAPA ${i+1} de ${cores.length} — ${c.nome}`, 20, true], [`${g.nome} · ${ped.cliente} · pedido ${ped.num} · prova de separação em preto (a tinta é ${c.nome})`, 11]]); }
  // ficha técnica (A4)
  doc.addPage('a4','portrait'); fichaTecnica(doc, id, ped, cores, previas);
  doc.__ligaCores(); return doc.output('blob');
}
function fichaTecnica(doc, id, ped, cores, previas){
  const g=CATALOGO[id], L=1.6; let y=1.8;
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor('#1f5fae'); doc.text('Ficha técnica para a clicheria', L, y); y+=0.7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor('#333333'); doc.text(`Embalagens Globo · GloboEditor · gerado em ${ped.data} ${ped.hora}`, L, y); y+=0.9;
  const lin=(a,b)=>{ doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor('#111111'); doc.text(a, L, y); doc.setFont('helvetica','normal'); const t=doc.splitTextToSize(String(b), 13.2); doc.text(t, L+4.4, y); y+=0.5*t.length+0.12; };
  lin('Cliente', ped.cliente); lin('Pedido', `${ped.num} · ${ped.qtd(id)} mil unidades`); lin('Produto', `${g.nome} (faca ${String(g.fonte||'—').replace(/\.pdf$/i,'')})`);
  lin('Papel', g.papel==='branco'?'Branco monolúcido':'Kraft natural'); lin('Folha aberta', `${fmt(xmax-xmin)} × ${fmt(ymax-ymin)} cm — escala 1:1`);
  PAINEIS.forEach(pn=>{ const p=GAB.paineis[pn]; lin({frente:'Frente',verso:'Verso',sanfona_esq:'Lateral esq.',sanfona_dir:'Lateral dir.'}[pn]||pn, `${fmt(p.w)} × ${fmt(p.h)} cm${(p.linhas_internas||[]).length?' · com '+p.linhas_internas.map(l=>l.tipo).join(', '):''}`); });
  lin('Status da arte', ped.aprovada(id) ? 'APROVADA pelo cliente no editor' : 'ATENÇÃO: ainda NÃO aprovada pelo cliente');
  const pend=valida(); lin('Checagem', pend.length ? pend.map(p=>`${nomeDeId(p[1])}: ${p[2]}`).join(' · ') : 'sem pendências (margem, dobras, cola, texto ≥ '+GAB.regras.texto_min_pt+' pt, traço ≥ '+fmt(GAB.regras.linha_min_mm,2)+' mm)');
  y+=0.2; doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor('#1f5fae'); doc.text('Cores (chapas)', L, y); y+=0.55;
  cores.forEach((c,i)=>{ doc.setFillColor(c.hex); doc.rect(L, y-0.38, 0.9, 0.55, 'F'); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor('#111111');
    const usos=[...new Set(arte.camadas.filter(e=>JSON.stringify(e).includes(`"${c.k}"`)).map(nomeAmigavel))]; doc.text(`Chapa ${i+1}: ${c.nome}`, L+1.2, y);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor('#555555'); const t=doc.splitTextToSize(`usada em: ${usos.join(', ')||'—'}`, 16); doc.text(t, L+1.2, y+0.45); y+=0.45+0.4*t.length+0.35; });
  const fotos=[]; const varre=e=>{ if(e.tipo==='meiotom') fotos.push(e); (e.filhos||[]).forEach(varre); }; arte.camadas.forEach(varre);
  if(fotos.length){ y+=0.2; doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor('#1f5fae'); doc.text('Retículas (fotos)', L, y); y+=0.55;
    fotos.forEach(f=>{ lin(nomeAmigavel(f), f.forma==='cheio' ? `cor lisa (sem retícula), ${arte.paleta[f.cor]?arte.paleta[f.cor].pantone:f.cor}` : `${f.forma==='linha'?'linhas':'pontos'} · ${lpiMax()} lpi · ângulo ${f.angulo??45}° · ponto mínimo ${GAB.regras.ponto_min_pct||6}% · ${arte.paleta[f.cor]?arte.paleta[f.cor].pantone:f.cor}`); }); }
  const fontes=[...new Set(arte.camadas.filter(e=>e.tipo==='texto').map(e=>e.fonte||'Inter'))];
  if(fontes.length) lin('Fontes', fontes.join(', ')+' — todas convertidas em curvas no PDF');
  lin('Observações', 'Cores especiais nomeadas pelo código Pantone (o CMYK é só referência de tela). A cor especial "FACA - NAO IMPRIMIR" e as marcas de registro (All) não fazem parte da arte. Área hachurada = cola. Linhas tracejadas = dobras/emenda.');
  y+=0.3; const iw=8.6; let ix=L;
  [previas.plan, previas.frente].filter(Boolean).forEach(u=>{ try{ const p=doc.getImageProperties(u), ih=Math.min(9, iw*p.height/p.width); if(y+ih>28.5){ doc.addPage('a4','portrait'); y=1.6; } doc.addImage(u, 'JPEG', ix, y, iw, ih); ix+=iw+0.4; }catch(_){} });
}

// ---- PNG: prévia planificada e chapas ----
async function pngDoSvg(svgTxt, pxPorCm){ const W=xmax-xmin+MG_KIT.l+MG_KIT.r, H=ymax-ymin+MG_KIT.t+MG_KIT.b;
  const c=await svgCanvas(svgTxt.replace(/ width="[^"]*cm" height="[^"]*cm"/, ` width="${Math.round(W*pxPorCm)}" height="${Math.round(H*pxPorCm)}"`), Math.round(W*pxPorCm), Math.round(H*pxPorCm));
  return c; }
const blobDe = c => new Promise(ok=>c.toBlob(ok,'image/png'));

// ---- 3D: vistas para a gráfica (sem comida; uma ambientada) ----
async function esperaProduto(){ const t0=Date.now(); await new Promise(r=>setTimeout(r,400));
  while(Date.now()-t0<90000){ if(P3 && P3.malhas && P3.malhas.length && $('prodmsg').style.display==='none') return true; await new Promise(r=>setTimeout(r,250)); } return false; }
function captura3D(v, w, h, tipo){ const {r,cam,scene}=P3, T=P3.T, s0=r.getSize(new T.Vector2()), pr=r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix();
  const a=P3.alvo, rad=v.rad; cam.position.set(a.x+rad*Math.sin(v.phi)*Math.cos(v.theta), a.y+rad*Math.cos(v.phi), a.z+rad*Math.sin(v.phi)*Math.sin(v.theta)); cam.lookAt(a);
  r.render(scene,cam); const url=r.domElement.toDataURL(tipo||'image/png', 0.88);
  r.setPixelRatio(pr); r.setSize(s0.x, s0.y, false); cam.aspect=s0.x/s0.y; cam.updateProjectionMatrix(); return url; }
function vistas3D(){ const W=GAB.paineis.frente.w, D=GAB.paineis.sanfona_esq.w||1, tam=Math.max(ymax, W+D*0.6), rad=tam*0.5/Math.tan(32*Math.PI/360)*1.25;
  return [['01_frente',Math.PI/2,1.45,rad],['02_tres-quartos-esquerda',Math.PI/2+0.62,1.25,rad],['03_tres-quartos-direita',Math.PI/2-0.62,1.25,rad],
    ['04_costas',-Math.PI/2,1.45,rad],['05_lateral',0.02,1.45,rad*0.95],['06_de-cima',Math.PI/2-0.3,0.42,rad*1.05]].map(([n,theta,phi,r])=>({n,theta,phi,rad:r})); }

function progressoKit(txt, pct){ let o=$('kitprog'); if(!o){ o=document.createElement('div'); o.id='kitprog'; o.innerHTML='<div class="kp-box"><b>📦 Montando o kit para a gráfica</b><div class="kp-t"></div><div class="kp-bar"><i></i></div><div class="kp-h">Não feche esta aba. A tela vai trocar de sacola e de vista sozinha.</div></div>'; document.body.appendChild(o); }
  if(txt===null){ o.remove(); return; } o.querySelector('.kp-t').textContent=txt; o.querySelector('.kp-bar i').style.width=Math.round(pct*100)+'%'; }

// "🔒 Kit" é para funcionário da Globo (mandar à clicheria), não para o cliente. Por ora QUALQUER senha passa.
function senhaKit(acao){
  modal(`<h3 style="margin:0 0 4px;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">🔒 Kit para a gráfica</h3>
    <div class="hint" style="margin-bottom:10px">Área da equipe Embalagens Globo. Digite a senha de funcionário.</div>
    <form id="fKit"><div class="row"><label>Senha</label><input id="kitSenha" type="password" autocomplete="off"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" id="kitX">Cancelar</button><button class="pri">Gerar kit</button></div></form>`);
  setTimeout(()=>$('kitSenha').focus(), 30);
  $('kitX').onclick=fecha;
  $('fKit').onsubmit=e=>{ e.preventDefault(); /* TODO: conferir senha de funcionário */ fecha(); acao(); };
}
async function baixarKit(op={}){
  sincroniza();
  const ids=(op.ids||design.carrinho.slice()).filter(i=>design.sacolas[i]&&design.sacolas[i].camadas&&design.sacolas[i].camadas.length), aprov=new Set(op.aprovadas||ids.filter(i=>design.sacolas[i]&&design.sacolas[i].estado==='conferida'));
  if(!ids.length){ toast('Nenhuma sacola com arte ainda. Crie a arte primeiro.'); return; }
  const naoAprov=ids.filter(i=>!aprov.has(i));
  if(naoAprov.length && !confirm(`${naoAprov.length===1?'1 sacola ainda não foi aprovada':naoAprov.length+' sacolas ainda não foram aprovadas'}: ${naoAprov.map(i=>CATALOGO[i].nome).join(', ')}.\n\nO kit vai marcar isso na ficha técnica. Gerar mesmo assim?`)) return;
  const volta={id:design.atual, modo}, agora=new Date(), ped={cliente:(design.dados&&design.dados.nome)||design.cliente||'Cliente', num:op.num||'(ainda sem número: kit gerado antes de finalizar)', aprovada:i=>aprov.has(i),
    data:agora.toLocaleDateString('pt-BR'), hora:agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}), qtd:i=>(design.qtd&&design.qtd[i])||1};
  try{
    progressoKit('Carregando as ferramentas de PDF…', 0.02); await carregaLibsKit();
    const zip=new JSZip(), N=ids.length, resumo=[];
    for(let n=0;n<N;n++){ const id=ids[n], g=CATALOGO[id], pasta=zip.folder(`${String(n+1).padStart(2,'0')}_${nomeArq(g.nome)}`), passo=k=>(n+k)/N;
      progressoKit(`${g.nome}: abrindo…`, passo(0.05));
      if(design.atual!==id) abreSacola(id, true); if(['produto','mockup'].includes(modo)){ modo='previa'; $('modo').value='previa'; } render();
      // prévias planificadas e chapas (PNG)
      progressoKit(`${g.nome}: prévia e chapas…`, passo(0.15));
      const cores=infoCores(), papelCor=COR_PAPEL[g.papel]||'#c8a374';
      const plan=await pngDoSvg(svgKit({cor:k=>k==='papel'?papelCor:(arte.paleta[k]?cmyk2hex(arte.paleta[k].cmyk):papelCor), faca:'#e5007e', papel:papelCor, marcas:'#000000'}), 60);
      pasta.file('previa_planificada.png', await blobDe(plan));
      for(let i=0;i<cores.length;i++){ const c=cores[i], cv=await pngDoSvg(svgKit({cor:k=>k===c.k?'#000000':'#ffffff', faca:'#e5007e', papel:'#ffffff', marcas:'#000000'}), 60);
        pasta.file(`chapas/CHAPA-${i+1}_${nomeArq(c.nome)}.png`, await blobDe(cv)); }
      // 3D
      progressoKit(`${g.nome}: fotos 3D…`, passo(0.3));
      modo='produto'; $('modo').value='produto'; render(); const ok=await esperaProduto(); const previas={plan:(()=>{ const k=document.createElement('canvas'); k.width=plan.width; k.height=plan.height; const x=k.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,k.width,k.height); x.drawImage(plan,0,0); return k.toDataURL('image/jpeg',0.85); })()};
      if(ok){ const comida=P3_comida||[]; comida.forEach(o=>o.visible=false);
        for(const v of vistas3D()){ const u=captura3D(v, 1600, 1200); pasta.file(`3d/${v.n}.png`, u.split(',')[1], {base64:true}); if(v.n==='02_tres-quartos-esquerda') previas.frente=captura3D(v, 1200, 900, 'image/jpeg'); }
        comida.forEach(o=>o.visible=true); const v0=vistas3D()[1]; pasta.file('3d/07_ambientado-com-comida.png', captura3D({...v0, rad:v0.rad*1.25}, 1600, 1200).split(',')[1], {base64:true}); }
      modo='previa'; $('modo').value='previa'; render();
      // PDF
      progressoKit(`${g.nome}: PDF da arte-final…`, passo(0.6));
      pasta.file(`ARTE-FINAL_${nomeArq(g.nome)}.pdf`, await pdfDaSacola(id, ped, previas));
      // originais enviados pelo cliente
      const ass=new Set(); const varre=e=>{ if(e.asset) ass.add(e.asset); (e.filhos||[]).forEach(varre); }; arte.camadas.forEach(varre);
      ass.forEach(a=>{ const A=ASSETS[a]; if(!A) return; const d=A.data||A.svg; if(!d) return; const nm=String(A.nome||a).replace(/\.[a-z0-9]+$/i,'');
        if(String(d).startsWith('data:')) pasta.file(`originais/${nomeArq(nm)}.${(d.match(/^data:image\/(\w+)/)||[,'bin'])[1].replace('svg+xml','svg').replace('jpeg','jpg')}`, d.split(',')[1], {base64:true});
        else pasta.file(`originais/${nomeArq(nm)}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(A.vb||[0,0,100,100]).join(' ')}">${d}</svg>`); });
      resumo.push({produto:g.nome, faca:String(g.fonte||'').replace(/\.pdf$/i,''), papel:g.papel, quantidade_mil:ped.qtd(id), aprovada:aprov.has(id), folha_cm:[+(xmax-xmin).toFixed(2), +(ymax-ymin).toFixed(2)],
        cores:cores.map((c,i)=>({chapa:i+1, pantone:c.nome})), pasta:pasta.root||'' });
    }
    zip.file('LEIA-ME.txt', leiaMe(ped, resumo));
    zip.file('dados_do_pedido.json', JSON.stringify({cliente:ped.cliente, pedido:ped.num, gerado:agora.toISOString(), gerador:'GloboEditor (Embalagens Globo)', sacolas:resumo}, null, 2));
    progressoKit('Compactando…', 0.97);
    const blob=await zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:6}});
    progressoKit(null); await salvaArquivo(`Kit-grafica_${nomeArq(ped.cliente)}_${agora.toISOString().slice(0,10)}.zip`, blob);
  }catch(e){ console.error(e); toast('⚠️ Não consegui montar o kit: '+esc(e.message||String(e)), 9000); }
  finally{ progressoKit(null); if(volta.id && design.sacolas[volta.id] && design.atual!==volta.id) abreSacola(volta.id, true); modo=volta.modo==='produto'?'previa':volta.modo; $('modo').value=modo; render(); }
}
// dentro do Claude (artifact) o download passa pela capability "downloads"; no site, link normal
async function salvaArquivo(nome, blob){
  let dl=null; if(!NUVEM && window.claude && claude.use){ try{ dl=await claude.use('downloads'); }catch(_){ dl=null; } }
  if(dl){ try{ await dl.save({filename:nome, data:blob}); toast('📦 Kit salvo.', 5000); }
    catch(e){ toast(e&&e.code==='declined' ? 'Download cancelado.' : '⚠️ Não consegui salvar o kit aqui ('+esc((e&&e.code)||'erro')+'). Use a versão do site.', 7000); } return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('📦 Kit baixado.', 5000);
}
function leiaMe(ped, resumo){ return [
`KIT PARA A GRÁFICA — Embalagens Globo (GloboEditor)`,
`Cliente: ${ped.cliente}    Pedido: ${ped.num}    Gerado em: ${ped.data} ${ped.hora}`, ``,
`CONTEÚDO (uma pasta por sacola):`,
`  ARTE-FINAL_*.pdf   pág. 1 = arte em ESCALA 1:1, cores especiais com o nome do Pantone (uma por chapa),`,
`                     textos convertidos em curvas, faca na cor especial "FACA - NAO IMPRIMIR" (só referência),`,
`                     marcas de registro na cor "All".`,
`                     págs. seguintes = prova de cada chapa em preto, mesma posição/registro.`,
`                     última pág. = ficha técnica (medidas, cores, retículas, fontes, status de aprovação).`,
`  previa_planificada.png   arte aberta sobre o papel, para conferência visual.`,
`  chapas/*.png             o que vai em cada chapa (preto = tinta).`,
`  3d/*.png                 a sacola montada de vários ângulos (a grade do chão tem quadrados de 1 cm).`,
`  originais/               arquivos que o cliente enviou (logo, foto), se houver.`, ``,
`SACOLAS:`, ...resumo.map((r,i)=>`  ${i+1}. ${r.produto} · faca ${r.faca||'—'} · papel ${r.papel} · ${r.quantidade_mil} mil · ${r.aprovada?'APROVADA':'NÃO APROVADA'} · ${r.cores.map(c=>`chapa ${c.chapa}: ${c.pantone}`).join(' · ')}`), ``,
`OBSERVAÇÕES:`,
`  - O CMYK mostrado na ficha é só referência de tela: imprima pelo código Pantone.`,
`  - Linhas tracejadas = dobras e emenda; retângulo tracejado = área de cola.`,
`  - Dúvidas: fale com a Embalagens Globo antes de gravar as chapas.`, ``].join('\r\n'); }
