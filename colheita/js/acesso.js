// acesso.js — os módulos da área Colheita e Produção e o menu (20/10/2026).
//
// Mesmo motor de menu das outras molduras: faixa de módulos e faixa de
// telas, montadas a partir de MODULOS. Todo botão tem ícone ao lado do nome
// (padrão visual dos menus, 15/10/2026). Quem chega aqui já passou pela
// regra da área (módulo 'colheita' em Usuários - Acessos, ou administrador).

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Ícones (traço, 24x24) dos módulos e telas. */
const ICONES = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  historico: '<path d="M3 3v18h18"/><path d="M7 16v-4M11 16V9M15 16v-6M19 16V6"/>',
  carga: '<path d="M2 16V7a1 1 0 0 1 1-1h11v10"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  balanca: '<path d="M12 3v18M5 21h14"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/>',
  conferir: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  importar: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  plantio: '<path d="M12 22V12"/><path d="M12 12c-4 0-7-3-7-7 4 0 7 3 7 7z"/><path d="M12 15c0-4 3-7 7-7 0 4-3 7-7 7z"/>',
  cadastros: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
  safra: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  caminhao: '<path d="M2 16V7a1 1 0 0 1 1-1h11v10"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  financeiro: '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3.5-5-3.5S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5S14.8 17 12 17s-5-1.6-5-3.5"/>',
  param: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cultura: '<path d="M12 21c-5 0-8-4-8-9 3 0 6 1 8 4 2-3 5-4 8-4 0 5-3 9-8 9z"/><path d="M12 16V3"/><path d="M9 6l3-3 3 3"/>',
  lavador: '<path d="M4 10h16l-1.5 10h-13z"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M9 14h6M10 17h4"/>',
  nota: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h7"/>',
  venda: '<path d="M3 3h2l2.5 12h11L21 7H6.2"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
  pivo: '<circle cx="12" cy="12" r="9"/><path d="M12 12L19 7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  variedade: '<path d="M12 21V10"/><path d="M12 10c-3 0-5-2.5-5-6 3 0 5 2.5 5 6z"/><path d="M12 14c3 0 5-2.5 5-6-3 0-5 2.5-5 6z"/><path d="M8 21h8"/>',
  carga_inicial: '<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/><path d="M12 12v6M9 15l3 3 3-3"/>',
};
export const svgIcone = nome =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

/* Os módulos da área (20/10/2026). A ordem daqui é a ordem das abas. Módulo
   novo: mais um item aqui, as <section> no index.html e o arquivo em js/. */
export const MODULOS = [
  { id: 'painel', nome: 'Painel da safra', icone: 'painel', subs: [
    { id: 'cpSubPainel', nome: 'Painel', icone: 'painel', telas: [
      ['cpPainel',    'Painel da safra',       'painel'],
      ['cpHistorico', 'Comparativo de safras', 'historico'],
    ] },
  ] },
  { id: 'cargas', nome: 'Cargas', icone: 'carga', subs: [
    { id: 'cpSubCargas', nome: 'Cargas', icone: 'carga', telas: [
      ['cpCargas', 'Lançar e consultar cargas', 'lista'],
    ] },
  ] },
  /* O caminho da carga (26/10/2026, pedido dele): cargas - balança -
     beneficiamento - comercialização. O id 'conciliacao' continua o da
     Balança (é o que acessos e atalhos já conhecem). */
  { id: 'conciliacao', nome: 'Balança', icone: 'balanca', subs: [
    { id: 'cpSubConc', nome: 'Balança', icone: 'balanca', telas: [
      ['cpImportar',    'Importar relatório da balança', 'importar'],
      ['cpConferencia', 'Conferência carga × balança',   'conferir'],
    ] },
  ] },
  { id: 'beneficiamento', nome: 'Beneficiamento', icone: 'lavador', subs: [
    { id: 'cpSubBenef', nome: 'Beneficiamento', icone: 'lavador', telas: [
      ['cpBenef', 'Boletins do lavador (Cat 1, 2 e 3)', 'lavador'],
    ] },
  ] },
  { id: 'comercializacao', nome: 'Comercialização', icone: 'venda', subs: [
    { id: 'cpSubCom', nome: 'Comercialização', icone: 'venda', telas: [
      ['cpCom',     'Notas fiscais (NF-e com PDF)',    'nota'],
      ['cpImpCoop', 'Importar relatório da cooperativa', 'importar'],
    ] },
  ] },
  { id: 'cadastros', nome: 'Cadastros', icone: 'cadastros', subs: [
    { id: 'cpSubCad', nome: 'Cadastros', icone: 'cadastros', telas: [
      ['cpPlantios', 'Plantios / quadras', 'plantio'],
      ['cpSafras',   'Safras',             'safra'],
      ['cpPivos',    'Pivôs / talhões',    'pivo'],
      ['cpVariedades', 'Variedades',       'variedade'],
      ['cpVeiculos', 'Placas e motoristas', 'caminhao'],
      ['cpHistCad',  'Histórico de safras', 'historico'],
    ] },
  ] },
  { id: 'financeiro', nome: 'Financeiro', icone: 'financeiro', subs: [
    { id: 'cpSubFin', nome: 'Financeiro', icone: 'financeiro', telas: [
      ['cpFretes', 'Controle de pagamento de fretes', 'caminhao'],
    ] },
  ] },
  { id: 'parametros', nome: 'Parâmetros', icone: 'param', subs: [
    { id: 'cpSubParam', nome: 'Parâmetros', icone: 'param', telas: [
      ['cpCulturas',    'Culturas (unidade, classificação, tolerâncias)', 'cultura'],
      ['cpCargaInicial', 'Carga inicial das planilhas', 'carga_inicial'],
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

/** Abre um módulo: faixa 2 = submódulos, faixa 3 = telas. */
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
