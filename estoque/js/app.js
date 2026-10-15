// app.js — telas e arranque da área Estoque dentro do LOP - Gestão Rápida.
//
// 15/10/2026: o app avulso Gestão Rápida (Estoque Inteligente) veio para
// dentro do LOP. Esta página mora numa moldura do app principal: quem entra,
// sai, instala e troca senha é o LOP, e quem pode abrir a área é marcado em
// Usuários - Acessos (módulo 'estoque'). Aqui não há login nem topo de marca.
import { MODULOS, telasDe, montarMenu, mostrarInicio, abrirModulo } from './acesso.js';
import { ligarAcerto, abrirAcerto } from './acerto.js';
import { abrirContagem, soltarContagem } from './contagem.js';
import { abrirCadastro, soltarCadastro } from './cadastros.js';

const $ = id => document.getElementById(id);

/* Todas as telas da área, tiradas da própria lista de módulos: acrescentar uma
   tela em acesso.js e a <section> no index.html basta — aqui não se mexe. */
const TELAS = ['inicio', ...MODULOS.flatMap(m => telasDe(m).map(([t]) => t))];
const idDaTela = t => 'tela' + t.charAt(0).toUpperCase() + t.slice(1);

function abrirAba(nome) {
  for (const t of TELAS) {
    const el = $(idDaTela(t));
    if (el) el.hidden = t !== nome;
  }
  soltarContagem(); soltarCadastro();
  if (nome.startsWith('ac')) abrirAcerto(nome);
  if (nome.startsWith('ct')) abrirContagem(nome);
  if (nome.startsWith('cad')) abrirCadastro(nome);
  // a tela nova começa do alto, não no meio da anterior
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/** Recado curto no alto da página: some sozinho. */
let sumir = null;
function mostrarAviso(texto, tipo = 'info') {
  const el = $('avisoGlobal');
  el.className = 'aviso ' + tipo;
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(sumir);
  sumir = setTimeout(() => { el.hidden = true; }, 6000);
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu (usado pelos
   botões "Contar" / "Ver" que pulam de uma tela para outra). */
window.abrirTelaEstoque = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* =============== arranque =============== */
try { ligarAcerto(mostrarAviso); }
catch (e) { console.error('[Estoque] falhou ao ligar o acerto', e); }

montarMenu(abrirAba);

/* O app principal confere isto para saber se a área terminou de abrir, e
   chama voltarAoInicioDaArea quando a pessoa volta para a área já aberta. */
window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
