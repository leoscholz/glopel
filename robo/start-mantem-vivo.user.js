// ==UserScript==
// @name         Start — manter sessão viva (PC do robô Glopel)
// @namespace    https://github.com/leoscholz/glopel
// @version      0.1
// @description  A cada 4 minutos, mexe o mouse 1 pixel dentro da tela do Start, para a sessão não cair por inatividade. Não clica, não digita, não faz login.
// @match        https://startweb.iob.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const INTERVALO_MS = 4 * 60 * 1000; // 4 min (o Chrome segura timers de aba escondida em ~1/min; 4 min passa)
  let lado = 0;

  // A tela do Start é desenhada num <canvas> (cliente HTML5). Pega o maior canvas da página.
  function telaDoStart() {
    const cs = Array.from(document.querySelectorAll('canvas'));
    if (!cs.length) return null;
    return cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  }

  function mexer() {
    const tela = telaDoStart();
    if (!tela) { console.log('[mantem-vivo] tela do Start não encontrada (tela de login?)'); return; }
    const r = tela.getBoundingClientRect();
    // canto inferior direito, área sem botões; alterna 1 px para ser um movimento de verdade
    const x = r.right - 6 - lado, y = r.bottom - 6;
    lado = 1 - lado;
    const ev = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, view: window };
    tela.dispatchEvent(new PointerEvent('pointermove', ev));
    tela.dispatchEvent(new MouseEvent('mousemove', ev));
    console.log('[mantem-vivo] movimento enviado', new Date().toLocaleTimeString('pt-BR'));
  }

  setInterval(mexer, INTERVALO_MS);
  console.log('[mantem-vivo] ligado: um movimento a cada', INTERVALO_MS / 60000, 'min');
})();
