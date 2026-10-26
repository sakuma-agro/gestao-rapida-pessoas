// acesso.js — os módulos da área Projetos (PMBOK) e o menu (23/10/2026).
//
// Mesmo motor de menu das outras molduras: faixa de módulos e faixa de
// telas, montadas a partir de MODULOS. Todo botão tem ícone ao lado do nome
// (padrão visual dos menus, 15/10/2026). Quem chega aqui já passou pela
// regra da área (módulo 'projetos' em Usuários - Acessos, ou administrador).

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Ícones (traço, 24x24) dos módulos e telas. */
const ICONES = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projetos: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v4H9z"/><path d="M8 11h5M8 15h8"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  licoes: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
};
export const svgIcone = nome =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

/* Os módulos da área (23/10/2026). A ordem daqui é a ordem das abas na tela.
   Cada um tem uma tela só; a ficha do projeto (com as abas do PMBOK) abre
   dentro de Projetos. */
export const MODULOS = [
  { id: 'painel', nome: 'Painel', icone: 'painel', telas: [['pjPainel', 'Painel', 'painel']] },
  { id: 'projetos', nome: 'Projetos', icone: 'projetos', telas: [['pjLista', 'Projetos', 'projetos']] },
  { id: 'alertas', nome: 'Atrasos e alertas', icone: 'alerta', telas: [['pjAlertas', 'Atrasos e alertas', 'alerta']] },
  { id: 'licoes', nome: 'Lições aprendidas', icone: 'licoes', telas: [['pjLicoes', 'Lições aprendidas', 'licoes']] },
];

export const subsDe = m => m.subs || [{ id: m.id, nome: m.nome, icone: m.icone, telas: m.telas || [] }];
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

/* "Continuar de onde parou" na tela inicial do LOP (26/10/2026): avisa o app
   principal de qual tela foi aberta, com o nome "Módulo › Tela". */
function avisarRecente(t) {
  try {
    if (window.parent === window) return;
    const m = MODULOS.find(x => telasDe(x).some(([y]) => y === t));
    if (!m) return;
    const rot = String(telasDe(m).find(([y]) => y === t)[1] || '').replace(/ \(.*\)$/, '');
    window.parent.postMessage({ tipo: 'gr-recente', tela: t, rotulo: m.nome === rot ? rot : m.nome + ' › ' + rot }, location.origin);
  } catch {}
}

export function montarMenu(callback) {
  if (callback) aoTrocar = t => { callback(t); avisarRecente(t); };
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
