// acesso.js — os módulos da área Outorga e Irrigação e o menu (12/11/2026).
//
// Mesmo motor de menu das outras molduras: faixa de módulos e faixa de
// telas, montadas a partir de MODULOS. Todo botão tem ícone ao lado do nome
// (padrão visual dos menus, 15/10/2026). Quem chega aqui já passou pela
// regra da área (módulo 'outorga' em Usuários - Acessos, ou administrador).

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Ícones (traço, 24x24) dos módulos e telas. */
const ICONES = {
  recebido: '<path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/>',
  historico: '<path d="M3 3v18h18"/><path d="M7 16v-4M11 16V9M15 16v-6M19 16V6"/>',
  ficha: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h7"/>',
  imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  medidor: '<circle cx="12" cy="13" r="8"/><path d="M12 13l3.5-3.5"/><path d="M8 18h8"/><path d="M10 3h4"/>',
  irrigacao: '<path d="M12 2.5c-3.5 4.4-6 7.9-6 11a6 6 0 0 0 12 0c0-3.1-2.5-6.6-6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  cadastros: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
  fazenda: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.7.2 4.7 2 5.3 5"/>',
};
export const svgIcone = nome =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

/* Os módulos da área (12/11/2026, pedido dele: "marcar se recebemos o
   formulário do mês" e "imprimir as outorgas"). A ordem daqui é a ordem das
   abas. Módulo novo: mais um item aqui, as <section> no index.html e o
   arquivo em js/. */
export const MODULOS = [
  { id: 'recebimento', nome: 'Recebimento', icone: 'recebido', subs: [
    { id: 'otSubRec', nome: 'Recebimento', icone: 'recebido', telas: [
      ['otRec',  'Recebimento do mês', 'recebido'],
      ['otHist', 'Histórico',          'historico'],
    ] },
  ] },
  { id: 'fichas', nome: 'Imprimir fichas', icone: 'imprimir', subs: [
    { id: 'otSubFichas', nome: 'Fichas', icone: 'imprimir', telas: [
      ['otFichasOut', 'Fichas de outorga',   'medidor'],
      ['otFichasIrr', 'Fichas de irrigação', 'irrigacao'],
    ] },
  ] },
  { id: 'cadastros', nome: 'Cadastros', icone: 'cadastros', subs: [
    { id: 'otSubCad', nome: 'Cadastros', icone: 'cadastros', telas: [
      ['otPontos',     'Locais e pontos de controle', 'fazenda'],
      ['otItens',      'Itens do recolhimento',       'lista'],
      ['otProdutores', 'Produtores',                  'pessoas'],
    ] },
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
  /* Menu em categoria (20/10/2026, pedido dele): módulo aberto com os filhos
     ao lado e as telas logo abaixo — ../js/categoria-moldura.js. */
  if (window.CategoriaMoldura) window.CategoriaMoldura.ligar({ modulos: '#navModulos', filhos: '#navTelas', inicio: () => mostrarInicio() });
  mostrarInicio();
}

export function mostrarInicio() {
  $('navModulos').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', 'false'));
  $('navTelas').hidden = true;
  $('navSub').hidden = true;
  aoTrocar('inicio');
}

const subsLiberados = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? subsDe(m).map(s => ({ ...s, telas: s.telas.filter(([t]) => podeTela(t)) })).filter(s => s.telas.length) : [];
};

/** Abre um módulo: faixa 2 = submódulos , faixa 3 = telas. */
export function abrirModulo(id, tela) {
  if (!id) return;
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.modulo === id)));
  const subs = subsLiberados(id);
  if (!subs.length) return;
  if (!tela) tela = (MODULOS.find(x => x.id === id) || {}).inicial;
  const sub = subs.find(s => s.telas.some(([t]) => t === tela)) || subs[0];
  const f2 = $('navTelas');
  f2.hidden = subs.length < 2;
  f2.innerHTML = subs.map(s =>
    `<button class="aba2" role="tab" data-sub="${s.id}" aria-selected="${s.id === sub.id}">${svgIcone(s.icone)}<span>${esc(s.nome)}</span></button>`).join('');
  f2.querySelectorAll('[data-sub]').forEach(b =>
    b.addEventListener('click', () => abrirModulo(id, (subs.find(s => s.id === b.dataset.sub)?.telas[0] || [])[0])));
  const alvo = sub.telas.some(([t]) => t === tela) ? tela : sub.telas[0][0];
  const f3 = $('navSub');
  f3.hidden = sub.telas.length < 2;
  f3.innerHTML = sub.telas.map(([t, rot, ic]) =>
    `<button class="aba3" role="tab" data-tela="${t}" aria-selected="${t === alvo}">${svgIcone(ic)}<span>${esc(rot)}</span></button>`).join('');
  f3.querySelectorAll('[data-tela]').forEach(b =>
    b.addEventListener('click', () => {
      f3.querySelectorAll('[data-tela]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      aoTrocar(b.dataset.tela);
    }));
  aoTrocar(alvo);
}
