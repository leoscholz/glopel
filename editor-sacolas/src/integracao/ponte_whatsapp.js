/* GloboEditor · Ponte Site ↔ WhatsApp · contrato v1 (17-11-2026)
   Módulo isolado: NÃO está ligado ao carrinho. A sessão do catálogo/carrinho chama:
     PonteWA.leEntrada()                       -> {wa, cupom} lidos da URL (?wa=…&c=…) e guardados
     await PonteWA.fecharPedido(itens, extras) -> grava no Supabase (se der) e abre o WhatsApp
   Formato do item (uma linha do carrinho):
     {id, nome, papel, qtd, un:'milheiro', preco_unit, arte:{tem:bool, nova:bool, ref:string|null}}
   Arte (decisão Leo 17-11): pedido pelo WhatsApp = arte já cadastrada do cliente (identificado pelo número).
   arte.nova=true é exceção -> a mensagem avisa e o atendente trata.
   Regra de segurança: só a chave publishable; nunca service_role aqui. */
(function(g){
  const NUMERO_WA = '554191455539';          // chip da empresa (mesmo do Suri Shop e do LetsBot). CONFIRMAR COM O LEO.
  const PREFIXO = 'Olá, gostaria de continuar o meu pedido:';   // igual ao Suri: o cliente já conhece
  const ALFA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';               // sem 0/O/1/I
  const RX_CODIGO = /\bGLS-[2-9A-HJ-NP-Z]{5}\b/;
  const LS = 'ponteWA.v1';
  const brl = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

  function novoCodigo(){
    const a = new Uint8Array(5); (g.crypto||{}).getRandomValues ? g.crypto.getRandomValues(a) : a.forEach((_,i)=>a[i]=Math.random()*256);
    return 'GLS-' + Array.from(a, b => ALFA[b % 32]).join('');
  }

  function leEntrada(){
    let s = {}; try{ s = JSON.parse(localStorage.getItem(LS)) || {}; }catch(_){}
    try{
      const q = new URLSearchParams(location.search);
      const wa = q.get('wa'), c = q.get('c') || q.get('cupom');
      if (wa && /^[A-Za-z0-9]{8,16}$/.test(wa)) s.wa = wa;
      if (c && /^[A-Za-z0-9_-]{2,20}$/.test(c)) s.cupom = c.toUpperCase();
      localStorage.setItem(LS, JSON.stringify(s));
    }catch(_){}
    return s;
  }

  // Texto que vai no wa.me. 1ª linha é o que o bot/humano procura. Máx ~1500 caracteres.
  function montaMensagem(codigo, itens, tot, ok){
    const L = [`${PREFIXO} *${codigo}*`, ''];
    const max = 12;
    itens.slice(0, max).forEach(i => {
      const arte = !(i.arte && i.arte.tem) ? '' : i.arte.nova ? ' 🎨 ARTE NOVA (atendente confere)' : ' · arte de sempre';
      L.push(`• ${i.qtd} ${i.un==='milheiro'?'mil':'un'} × ${i.nome}${i.papel?' ('+i.papel+')':''}${arte} — ${brl(i.qtd*i.preco_unit)}`);
    });
    if (itens.length > max) L.push(`• … e mais ${itens.length-max} itens`);
    L.push('');
    if (tot.cliches) L.push(`Clichês: ${brl(tot.cliches)}`);
    L.push(`*Total do site: ${brl(tot.total)}*${tot.cupom?' · cupom '+tot.cupom:''}`);
    L.push(ok ? '_Envie esta mensagem sem alterar o código._' : '_(pedido não ficou salvo no sistema — o atendente confere por esta mensagem)_');
    return L.join('\n').slice(0, 1500);
  }

  async function fecharPedido(itens, extras){
    extras = extras || {};
    const ent = leEntrada();
    const tItens = itens.reduce((t,i)=>t + i.qtd*i.preco_unit, 0);
    const tot = {itens: +tItens.toFixed(2), cliches: +(extras.cliches||0).toFixed(2), cupom: ent.cupom||null};
    tot.total = +(tot.itens + tot.cliches).toFixed(2);
    let codigo = novoCodigo(), ok = false;
    const SB = extras.supabase || g.SB;   // cliente supabase-js já criado com a chave publishable
    if (SB) for (let t = 0; t < 3 && !ok; t++){
      const {error} = await SB.from('pedidos_site').insert({
        codigo, wa_token: ent.wa||null, cupom: ent.cupom||null, itens,
        total_itens: tot.itens, total_cliches: tot.cliches, total: tot.total,
        tem_arte: itens.some(i=>i.arte&&i.arte.tem), arte_nova: itens.some(i=>i.arte&&i.arte.nova)});
      if (!error) ok = true;
      else if (error.code === '23505') codigo = novoCodigo();   // código repetido: sorteia outro
      else break;
    }
    const url = `https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(montaMensagem(codigo, itens, tot, ok))}`;
    if (!extras.semAbrir && g.open){ const w = g.open(url, '_blank'); if (!w) location.href = url; }   // celular: popup bloqueado -> mesma aba
    return {codigo, salvo: ok, url};
  }

  g.PonteWA = {leEntrada, fecharPedido, montaMensagem, novoCodigo, RX_CODIGO, NUMERO_WA, PREFIXO};
})(typeof window !== 'undefined' ? window : globalThis);
