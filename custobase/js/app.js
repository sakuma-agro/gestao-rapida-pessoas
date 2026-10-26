// app.js — telas e arranque da área Custo Base dentro do LOP - Gestão Rápida (20/10/2026).
//
// Esta página mora numa moldura do app principal: quem entra, sai, instala e
// troca senha é o LOP, e quem pode abrir a área é marcado em Usuários -
// Acessos (módulo 'custobase'). Aqui não há login nem topo de marca.
import { MODULOS, telasDe, subsDe, montarMenu, mostrarInicio, abrirModulo, svgIcone } from './acesso.js';
import { abrirRateio } from './rateio.js';
import { abrirHistorico } from './historico.js';
import { abrirTalhoes } from './talhoes.js';
import { abrirCulturas } from './culturas.js';
import { abrirHoraHomem } from './horahomem.js';

const $ = id => document.getElementById(id);

/* Todas as telas da área, tiradas da própria lista de módulos. */
const TELAS = ['inicio', ...MODULOS.flatMap(m => telasDe(m).map(([t]) => t))];
const idDaTela = t => 'tela' + t.charAt(0).toUpperCase() + t.slice(1);

function abrirAba(nome) {
  for (const t of TELAS) {
    const el = $(idDaTela(t));
    if (el) el.hidden = t !== nome;
  }
  if (nome === 'rtMes') abrirRateio();
  if (nome === 'rtHistorico') abrirHistorico();
  if (nome === 'rtTalhoes') abrirTalhoes();
  if (nome === 'rtCulturas') abrirCulturas();
  if (nome.startsWith('hh')) abrirHoraHomem(nome);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu. */
window.abrirTelaCustoBase = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* Acesso rápido da tela inicial (lateral, como no Pessoas): as telas de cada
   módulo, agrupadas pelo nome do módulo; a primeira em destaque. */
function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  let primeiro = true;
  nav.innerHTML = MODULOS.map(m => `<div class="ql-grupo">${m.nome}</div>` + subsDe(m).flatMap(s => s.telas).map(([t, rot, ic]) => {
    const b = `<button type="button" class="ql-item${primeiro ? ' prim' : ''}" data-ir="${t}">${svgIcone(ic)}<span>${rot.replace(/ \(.*\)$/, '')}</span></button>`;
    primeiro = false; return b;
  }).join('')).join('');
  nav.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.abrirTelaCustoBase(b.dataset.ir)));
}
desenharAtalhos();

montarMenu(abrirAba);

/* O app principal confere isto para saber se a área terminou de abrir, e
   chama voltarAoInicioDaArea quando a pessoa volta para a área já aberta. */
window.abrirTelaArea = tela => window.abrirTelaCustoBase(tela);  // "Continuar de onde parou" (26/10/2026)
window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
