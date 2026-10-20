// acesso.js — os módulos da área Custo Base e o menu (20/10/2026).
//
// Mesmo motor de menu das outras molduras: faixa de módulos e faixa de
// telas, montadas a partir de MODULOS. Todo botão tem ícone ao lado do nome
// (padrão visual dos menus, 15/10/2026). Quem chega aqui já passou pela
// regra da área (módulo 'custobase' em Usuários - Acessos, ou administrador).

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Ícones (traço, 24x24) dos módulos e telas. */
const ICONES = {
  rateio: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/><path d="M12 12h9"/>',
  mes: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 14h3M13 14h3M8 18h3"/>',
  historico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  talhoes: '<path d="M3 11l9-7 9 7"/><path d="M4 11v9h16v-9"/><path d="M9 20v-5h6v5"/>',
  culturas: '<path d="M12 22V12"/><path d="M12 12c-4 0-7-3-7-7 4 0 7 3 7 7z"/><path d="M12 15c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
};
export const svgIcone = nome =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

/* Os módulos da área. A ordem daqui é a ordem das abas na tela. Módulo novo
   do Custo Base no futuro: mais um item aqui, as <section> no index.html e o
   arquivo de tela em js/. */
export const MODULOS = [
  { id: 'rateio', nome: 'Rateio mensal culturas', icone: 'rateio', telas: [
    ['rtMes',       'Rateio do mês', 'mes'],
    ['rtHistorico', 'Histórico',     'historico'],
    ['rtTalhoes',   'Plantios',      'talhoes'],
    ['rtCulturas',  'Culturas',      'culturas'],
  ] },
];

export const subsDe = m => m.subs || [{ id: m.id, nome: m.nome, telas: m.telas || [] }];
export const telasDe = m => subsDe(m).flatMap(s => s.telas);
export const moduloDe = tela =>
  MODULOS.find(m => telasDe(m).some(([t]) => t === tela))?.id || null;

export const acesso = { email: '', admin: true, modulos: MODULOS.map(m => m.id), telas: [], carregado: true };
export const pode = m => acesso.admin || acesso.modulos.includes(m);
export function podeTela(tela) { return !!moduloDe(tela) && pode(moduloDe(tela)); }
export const telasLiberadas = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? telasDe(m).filter(([t]) => podeTela(t)) : [];
};

/* =============== menu =============== */
let aoTrocar = () => {};
export const modulosLiberados = () => MODULOS.filter(m => pode(m.id) && telasLiberadas(m.id).length);

export function montarMenu(callback) {
  if (callback) aoTrocar = callback;
  $('navModulos').innerHTML = modulosLiberados().map(m =>
    `<button class="aba" role="tab" data-modulo="${m.id}" aria-selected="false">${svgIcone(m.icone)}<span>${esc(m.nome)}</span></button>`).join('');
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.addEventListener('click', () => abrirModulo(b.dataset.modulo)));
  mostrarInicio();
}

export function mostrarInicio() {
  $('navModulos').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', 'false'));
  $('navTelas').hidden = true;
  aoTrocar('inicio');
}

export function abrirModulo(id, tela) {
  if (!id) return;
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.modulo === id)));
  const telas = telasLiberadas(id);
  if (!telas.length) return;
  const alvo = telas.some(([t]) => t === tela) ? tela : telas[0][0];
  const faixa = $('navTelas');
  faixa.hidden = telas.length < 2;
  faixa.innerHTML = telas.map(([t, rot, ic]) =>
    `<button class="aba2" role="tab" data-tela="${t}" aria-selected="${t === alvo}">${svgIcone(ic)}<span>${esc(rot)}</span></button>`).join('');
  faixa.querySelectorAll('[data-tela]').forEach(b =>
    b.addEventListener('click', () => {
      faixa.querySelectorAll('[data-tela]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      aoTrocar(b.dataset.tela);
    }));
  aoTrocar(alvo);
}
