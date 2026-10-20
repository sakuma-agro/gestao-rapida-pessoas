/* tv-moldura.js — "estilo TOTVS" para as áreas em moldura (20/10/2026).
 *
 * Pedido dele, depois de aprovar o estilo na área Pessoas: levar o mesmo
 * desenho para Máquinas e Patrimônio, Estoque e Custo Base. Cada moldura tem
 * o seu próprio código de menu; em vez de reescrever os três, esta "pele"
 * trabalha em cima do que eles já desenham:
 *
 *  - a barra de MÓDULOS vira menu lateral de ícones (computador) e barra fixa
 *    embaixo (celular), com um botão Início no topo;
 *  - a faixa de TELAS (a que tem botões [data-tela]) vira o rodapé fixo de
 *    ações: até 4 botões (2 no celular), o resto em "Ações ▾", e Sair;
 *  - a tela inicial com atalhos (.ql) vira grade de cartões (só CSS).
 *
 * Os botões originais são MOVIDOS, não copiados — os cliques continuam os do
 * código de cada área. Faixa de submódulos ([data-sub]) fica no topo.
 *
 * Uso (no fim do arranque de cada moldura):
 *   TvMoldura.ligar({ modulos: '#navModulos', telas: ['#navTelas', '#navSub'],
 *                     inicio: () => mostrarInicio() });
 */
(function () {
  'use strict';
  const IC = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    sair: '<path d="M15 5l-7 7 7 7"/>',
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const celular = () => matchMedia('(max-width:640px)').matches;
  const selecionado = b => b.getAttribute('aria-selected') === 'true' || b.classList.contains('ativo');

  function ligar(op) {
    const nav = document.querySelector(op.modulos);
    const faixas = (op.telas || []).map(s => document.querySelector(s)).filter(Boolean);
    if (!nav) return;
    document.body.classList.add('tv-lateral');
    nav.classList.add('tv-mods');

    /* ---------- menu lateral: botão Início ---------- */
    let inicio = null;
    function porInicio() {
      if (nav.querySelector('.tv-inicio')) return;
      inicio = document.createElement('button');
      inicio.type = 'button';
      inicio.className = 'tv-inicio';
      inicio.title = 'Início';
      inicio.innerHTML = svg('inicio') + '<span>Início</span>';
      inicio.addEventListener('click', () => op.inicio && op.inicio());
      nav.prepend(inicio);
    }
    function marcarInicio() {
      if (!inicio) return;
      const algum = [...nav.querySelectorAll('button:not(.tv-inicio)')].some(selecionado);
      if (inicio.classList.contains('tv-on') === !algum) return;
      inicio.classList.toggle('tv-on', !algum);
      inicio.setAttribute('aria-current', String(!algum));
    }
    /* Nome de duas palavras: no celular só a primeira ("Compra inteligente" → "Compra"). */
    function nomesCurtos() {
      nav.querySelectorAll('button:not(.tv-inicio)').forEach(b => {
        if (b.dataset.tvCurto) return;
        const sp = b.querySelector('span') || null;
        const txt = (sp ? sp.textContent : b.textContent).trim();
        b.dataset.tvCurto = '1';
        b.title = b.title || txt;
        if (!txt.includes(' ')) return;
        const longo = `<span class="ab-longo">${txt}</span><span class="ab-curto">${txt.split(' ')[0]}</span>`;
        if (sp) sp.outerHTML = longo;
        else b.innerHTML = longo;
      });
    }
    const obsNav = new MutationObserver(() => { obsNav.disconnect(); porInicio(); nomesCurtos(); marcarInicio(); ligarObsNav(); });
    const ligarObsNav = () => obsNav.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
    porInicio(); nomesCurtos(); marcarInicio(); ligarObsNav();

    /* ---------- rodapé de ações ---------- */
    let ordem = 0;
    function arrumar(f) {
      const botoes = [...f.querySelectorAll('[data-tela]')];
      const visivel = !f.hidden && botoes.length > 1;
      f.classList.toggle('tv-rodape-faixa', visivel);
      // Sobras de uma arrumação antiga
      const velhos = f.querySelectorAll('.tv-rel, .tv-sair');
      if (!visivel) { velhos.forEach(x => x.remove()); return; }
      botoes.forEach(b => { if (!b.dataset.tvI) b.dataset.tvI = String(ordem++); b.classList.add('tv-btn'); });
      botoes.sort((a, b) => +a.dataset.tvI - +b.dataset.tvI);
      const max = celular() ? 2 : 4;
      let fica = botoes.slice(0, max);
      const sel = botoes.find(selecionado);
      if (botoes.length > max && sel && !fica.includes(sel)) fica = [...fica.slice(0, max - 1), sel];
      const vai = botoes.filter(b => !fica.includes(b));
      velhos.forEach(x => x.remove());
      fica.forEach(b => f.appendChild(b));
      if (vai.length) {
        const rel = document.createElement('span');
        rel.className = 'tv-rel';
        rel.innerHTML = `<button type="button" class="tv-btn tv-acoes" aria-haspopup="menu" aria-expanded="false">${svg('lista')}<span class="ab-longo">Ações relacionadas</span><span class="ab-curto">Ações</span><i aria-hidden="true">▾</i></button><div class="tv-menu" role="menu" hidden></div>`;
        const menu = rel.querySelector('.tv-menu');
        vai.forEach(b => { b.setAttribute('role', 'menuitem'); menu.appendChild(b); });
        const gat = rel.querySelector('.tv-acoes');
        gat.addEventListener('click', ev => {
          ev.stopPropagation();
          const abre = menu.hidden;
          fecharMenus();
          menu.hidden = !abre;
          gat.setAttribute('aria-expanded', String(abre));
        });
        menu.addEventListener('click', () => fecharMenus());
        f.appendChild(rel);
      }
      fica.forEach(b => b.setAttribute('role', 'tab'));
      const sair = document.createElement('button');
      sair.type = 'button';
      sair.className = 'tv-btn tv-sair';
      sair.title = 'Voltar ao início';
      sair.innerHTML = svg('sair') + '<span>Sair</span>';
      sair.addEventListener('click', () => { fecharMenus(); op.inicio && op.inicio(); });
      f.appendChild(sair);
    }
    function fecharMenus() {
      document.querySelectorAll('.tv-rodape-faixa .tv-menu').forEach(m => { m.hidden = true; });
      document.querySelectorAll('.tv-rodape-faixa .tv-acoes').forEach(g => g.setAttribute('aria-expanded', 'false'));
    }
    function tudo() {
      obsFaixas.disconnect();
      // só a ÚLTIMA faixa visível com telas vira rodapé (a de submódulos fica no topo)
      const comTelas = faixas.filter(f => !f.hidden && f.querySelectorAll('[data-tela]').length > 1);
      const alvo = comTelas[comTelas.length - 1] || null;
      faixas.forEach(f => {
        if (f === alvo) arrumar(f);
        else { f.classList.remove('tv-rodape-faixa'); f.querySelectorAll('.tv-rel, .tv-sair').forEach(x => x.remove());
          f.querySelectorAll('.tv-menu [data-tela]').forEach(b => f.appendChild(b)); }
      });
      document.body.classList.toggle('com-rodape', !!alvo);
      faixas.forEach(f => obsFaixas.observe(f, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-selected'] }));
    }
    /* 20/10/2026, pedido dele: a faixa de telas fica no topo, como era
       (o rodapé embaixo não ficou bom). Só liga com { rodape: true }. */
    if (!op.rodape) return;
    const obsFaixas = new MutationObserver(() => requestAnimationFrame(tudo));
    tudo();
    addEventListener('resize', () => requestAnimationFrame(tudo));
    document.addEventListener('click', ev => { if (!ev.target.closest || !ev.target.closest('.tv-rel')) fecharMenus(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharMenus(); });
  }

  window.TvMoldura = { ligar };
})();
