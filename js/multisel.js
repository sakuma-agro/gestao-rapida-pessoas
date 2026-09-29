// multisel.js — lista suspensa com caixas de marcar (29/09/2026)
//
// Para filtrar por mais de uma fazenda de uma vez. Modelo: o filtro de
// plantio do sistema de campo — Exibir tudo, busca, "Selecionar tudo ·
// Limpar", uma caixa por opção e o atalho "só" para ficar só com ela.
//
// Uso:
//   montarMulti($('meuFiltro'), { opcoes: [['valor', 'Texto'], …], marcados: ['valor'],
//     todas: 'Todas as fazendas', plural: 'fazendas' });
//   $('meuFiltro').addEventListener('change', () => $('meuFiltro').valores);
//
// `valores` vazio = todas (sem filtro). Marcar tudo ou desmarcar tudo dá no mesmo.
// O container guarda `valores` e `rotulos` e dispara 'change' ao aplicar.

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let aberto = null;   // só um painel aberto por vez

document.addEventListener('mousedown', ev => {
  if (aberto && !aberto.contains(ev.target)) aberto._fechar(true);
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && aberto) aberto._fechar(false);
});

export function montarMulti(el, { opcoes = [], marcados = [], todas = 'Todas', plural = 'itens' } = {}) {
  if (!el) return;
  const validos = new Set(opcoes.map(o => o[0]));
  const inicial = (marcados || []).filter(v => validos.has(v));
  el.valores = inicial.length === opcoes.length ? [] : inicial;
  el.rotulos = el.valores.map(v => opcoes.find(o => o[0] === v)[1]);
  el.classList.add('msel');

  const resumo = () => !el.valores.length ? todas
    : el.valores.length === 1 ? el.rotulos[0] : `${el.valores.length} ${plural}`;

  el.innerHTML = `
    <button type="button" class="msel-botao" aria-haspopup="true" aria-expanded="false" title="${esc(el.rotulos.join(', ') || todas)}">
      <span>${esc(resumo())}</span><span class="msel-seta" aria-hidden="true">▾</span></button>
    <div class="msel-painel" hidden>
      <button type="button" class="msel-tudo">Exibir tudo</button>
      <input type="search" class="msel-busca" placeholder="Pesquisar…" aria-label="Pesquisar">
      <div class="msel-atalhos"><button type="button" data-msel="todos">Selecionar tudo</button> ·
        <button type="button" data-msel="nenhum">Limpar</button></div>
      <ul class="msel-lista">
        ${opcoes.map(([v, t]) => `<li data-v="${esc(v)}" data-busca="${esc(normal(t))}">
          <label><input type="checkbox" value="${esc(v)}"><span>${esc(t)}</span></label>
          <button type="button" class="msel-so" title="Só esta">só</button></li>`).join('')}
      </ul>
      <div class="msel-rodape"><span class="msel-conta"></span>
        <button type="button" class="btn principal mini msel-aplicar">Aplicar</button></div>
    </div>`;

  const botao = el.querySelector('.msel-botao');
  const painel = el.querySelector('.msel-painel');
  // O 'change' das caixas e da busca não pode subir: quem ouve o filtro só deve
  // saber quando a escolha é aplicada (o 'change' do próprio container).
  painel.addEventListener('change', ev => ev.stopPropagation());
  const caixas = [...el.querySelectorAll('.msel-lista input')];
  const conta = () => {
    const n = caixas.filter(c => c.checked).length;
    el.querySelector('.msel-conta').textContent = n === caixas.length || !n ? 'todas' : `${n} de ${caixas.length}`;
  };
  const marcar = sel => { caixas.forEach(c => { c.checked = sel(c.value); }); conta(); };

  const aplicar = () => {
    const sel = caixas.filter(c => c.checked).map(c => c.value);
    const novos = sel.length === caixas.length ? [] : sel;
    const mudou = novos.join('|') !== el.valores.join('|');
    el.valores = novos;
    el.rotulos = novos.map(v => opcoes.find(o => o[0] === v)[1]);
    botao.querySelector('span').textContent = resumo();
    botao.title = el.rotulos.join(', ') || todas;
    if (mudou) el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  el._fechar = aplicarAoFechar => {
    painel.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    if (aberto === el) aberto = null;
    if (aplicarAoFechar) aplicar();
  };

  botao.addEventListener('click', () => {
    if (!painel.hidden) { el._fechar(true); return; }
    if (aberto) aberto._fechar(true);
    marcar(v => !el.valores.length || el.valores.includes(v));
    el.querySelector('.msel-busca').value = '';
    el.querySelectorAll('.msel-lista li').forEach(li => { li.hidden = false; });
    painel.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    aberto = el;
  });
  el.querySelector('.msel-tudo').addEventListener('click', () => { marcar(() => true); el._fechar(true); });
  el.querySelector('[data-msel="todos"]').addEventListener('click', () => marcar(() => true));
  el.querySelector('[data-msel="nenhum"]').addEventListener('click', () => marcar(() => false));
  el.querySelector('.msel-busca').addEventListener('input', ev => {
    const q = normal(ev.target.value);
    el.querySelectorAll('.msel-lista li').forEach(li => { li.hidden = !!q && !li.dataset.busca.includes(q); });
  });
  el.querySelectorAll('.msel-so').forEach(b => b.addEventListener('click', () => {
    const v = b.closest('li').dataset.v;
    marcar(x => x === v);
    el._fechar(true);
  }));
  caixas.forEach(c => c.addEventListener('change', conta));
  el.querySelector('.msel-aplicar').addEventListener('click', () => el._fechar(true));
}
