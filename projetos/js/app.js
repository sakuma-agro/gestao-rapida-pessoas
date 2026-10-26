// app.js — telas e arranque da área Projetos (PMBOK) dentro do LOP - Gestão Rápida (23/10/2026).
//
// Esta página mora numa moldura do app principal: quem entra, sai, instala e
// troca senha é o LOP, e quem pode abrir a área é marcado em Usuários -
// Acessos (módulo 'projetos'). Aqui não há login nem topo de marca.
import { MODULOS, telasDe, subsDe, montarMenu, mostrarInicio, abrirModulo, svgIcone } from './acesso.js';
import { abrirPainel } from './painel.js';
import { abrirProjetos } from './projetos.js';
import { abrirAlertas, contarAlertas } from './alertas.js';
import { abrirLicoes } from './licoes.js';
import { projetos, emAndamento } from './dados.js';

const $ = id => document.getElementById(id);

const TELAS = ['inicio', ...MODULOS.flatMap(m => telasDe(m).map(([t]) => t))];
const idDaTela = t => 'tela' + t.charAt(0).toUpperCase() + t.slice(1);

function abrirAba(nome) {
  for (const t of TELAS) {
    const el = $(idDaTela(t));
    if (el) el.hidden = t !== nome;
  }
  if (nome !== 'pjLista') $('pjFolha').innerHTML = '';
  if (nome === 'inicio') desenharAtalhos();
  if (nome === 'pjPainel') abrirPainel();
  if (nome === 'pjLista') abrirProjetos();
  if (nome === 'pjAlertas') abrirAlertas();
  if (nome === 'pjLicoes') abrirLicoes();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu. */
window.abrirTelaProjetos = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* Acesso rápido da tela inicial (lateral, como no Pessoas), com contadores. */
function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  let alertas = 0, andamento = 0;
  try { alertas = contarAlertas(); andamento = projetos().filter(emAndamento).length; } catch (e) { /* base ainda abrindo */ }
  const conta = { pjLista: andamento, pjAlertas: alertas };
  let primeiro = true;
  nav.innerHTML = '<div class="ql-grupo">Projetos (PMBOK)</div>' + MODULOS.flatMap(m => subsDe(m).flatMap(s => s.telas)).map(([t, rot, ic]) => {
    const n = conta[t];
    const b = `<button type="button" class="ql-item${primeiro ? ' prim' : ''}" data-ir="${t}">${svgIcone(ic)}<span>${rot}</span>${n ? `<b class="ql-num${t === 'pjAlertas' ? ' alerta' : ''}">${n}</b>` : ''}</button>`;
    primeiro = false; return b;
  }).join('');
  nav.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.abrirTelaProjetos(b.dataset.ir)));
}
window.addEventListener('projetos-dados', () => { if (!$('telaInicio').hidden) desenharAtalhos(); });

montarMenu(abrirAba);

/* O app principal confere isto para saber se a área terminou de abrir, e
   chama voltarAoInicioDaArea quando a pessoa volta para a área já aberta. */
window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
window.mostrarInicio = mostrarInicio;
