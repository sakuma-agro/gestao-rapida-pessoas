// app.js — telas e arranque da área Custo Base dentro do LOP - Gestão Rápida (20/10/2026).
//
// Esta página mora numa moldura do app principal: quem entra, sai, instala e
// troca senha é o LOP, e quem pode abrir a área é marcado em Usuários -
// Acessos (módulo 'custobase'). Aqui não há login nem topo de marca.
import { MODULOS, telasDe, montarMenu, mostrarInicio, abrirModulo } from './acesso.js';
import { abrirRateio } from './rateio.js';
import { abrirHistorico } from './historico.js';
import { abrirTalhoes } from './talhoes.js';
import { abrirCulturas } from './culturas.js';

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
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu. */
window.abrirTelaCustoBase = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* Atalhos da tela de entrada. */
document.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.abrirTelaCustoBase(b.dataset.ir)));

montarMenu(abrirAba);

/* O app principal confere isto para saber se a área terminou de abrir, e
   chama voltarAoInicioDaArea quando a pessoa volta para a área já aberta. */
window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
