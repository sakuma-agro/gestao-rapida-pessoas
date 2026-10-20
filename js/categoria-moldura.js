/* categoria-moldura.js — menu "em categoria" nas áreas em moldura (20/10/2026).
 *
 * Pedido dele, igual ao que vale na área Pessoas: tudo em cima. A barra
 * mostra os módulos principais; ao clicar num módulo, os outros somem e os
 * filhos dele (submódulos, ou as telas quando o módulo não tem submódulo)
 * aparecem AO LADO; as telas do submódulo ficam na faixa LOGO ABAIXO, como
 * já era. Clicar no módulo aberto de novo fecha tudo e voltam os principais.
 *
 * Cada moldura tem o seu código de menu; este script não mexe nele. Ele só
 * encaixa a faixa de filhos (o próprio elemento, com os botões e os cliques
 * que já tem) dentro da barra, logo depois do módulo aberto.
 *
 * Uso, depois de montar o menu:
 *   CategoriaMoldura.ligar({ modulos: '#menu', filhos: '#menu2', inicio: () => mostrarInicio() });
 */
(function () {
  'use strict';
  const aberto = b => b.getAttribute('aria-selected') === 'true' || b.classList.contains('ativo');

  function ligar(op) {
    const nav = document.querySelector(op.modulos);
    const filhos = document.querySelector(op.filhos);
    if (!nav || !filhos || nav.dataset.categoria) return;
    nav.dataset.categoria = '1';
    filhos.classList.add('cat-filhos');
    nav.appendChild(filhos);

    const modulos = () => [...nav.children].filter(x => x.tagName === 'BUTTON');
    function arrumar() {
      obs.disconnect();
      const sel = modulos().find(aberto);
      nav.classList.toggle('cat-aberto', !!sel);
      if (sel) {
        sel.title = 'Fechar e voltar aos módulos';
        if (sel.nextElementSibling !== filhos) sel.after(filhos);
      } else if (nav.lastElementChild !== filhos) {
        nav.appendChild(filhos);
      }
      obs.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'hidden'] });
    }
    const obs = new MutationObserver(arrumar);
    arrumar();

    // Clicar no módulo aberto fecha a categoria (antes do clique da própria área).
    nav.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('button');
      if (!b || b.parentElement !== nav || !nav.classList.contains('cat-aberto') || !aberto(b)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      op.inicio && op.inicio();
    }, true);
  }

  window.CategoriaMoldura = { ligar };
})();
