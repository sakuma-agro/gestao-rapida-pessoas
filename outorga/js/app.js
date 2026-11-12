// app.js — telas e arranque da área Outorga e Irrigação dentro do LOP - Gestão Rápida (12/11/2026).
//
// O antigo app avulso "Controle de Outorga e Irrigação" (fichas de horímetro,
// hidrômetro e irrigação) veio para cá e foi aposentado. Esta página mora numa
// moldura do app principal: quem entra, sai, instala e troca senha é o LOP, e
// quem pode abrir a área é marcado em Usuários - Acessos (módulo 'outorga').
import { MODULOS, telasDe, subsDe, montarMenu, mostrarInicio, abrirModulo, svgIcone } from './acesso.js';
import { abrirRecebimento, abrirHistorico, resumoInicio } from './recebimento.js';
import { abrirFichasOutorga, abrirFichasIrrigacao } from './fichas.js';
import { abrirPontos, abrirItens, abrirProdutores } from './cadastros.js';

const $ = id => document.getElementById(id);
const TELAS = ['inicio', ...MODULOS.flatMap(m => telasDe(m).map(([t]) => t))];
const idDaTela = t => 'tela' + t.charAt(0).toUpperCase() + t.slice(1);
const ABRIR = {
  otRec: abrirRecebimento, otHist: abrirHistorico,
  otFichasOut: abrirFichasOutorga, otFichasIrr: abrirFichasIrrigacao,
  otPontos: abrirPontos, otItens: abrirItens, otProdutores: abrirProdutores,
};
let telaAtual = 'inicio';

function abrirAba(nome) {
  telaAtual = nome;
  for (const t of TELAS) {
    const el = $(idDaTela(t));
    if (el) el.hidden = t !== nome;
  }
  $('otFolha').innerHTML = '';
  if (ABRIR[nome]) ABRIR[nome]();
  if (nome === 'inicio') resumoInicio($('otIniResumo'));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu. */
window.abrirTelaOutorga = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* Acesso rápido da tela inicial (lateral, como no Pessoas). */
function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  let primeiro = true;
  nav.innerHTML = MODULOS.map(m => `<div class="ql-grupo">${m.nome}</div>` + subsDe(m).flatMap(s => s.telas).map(([t, rot, ic]) => {
    const b = `<button type="button" class="ql-item${primeiro ? ' prim' : ''}" data-ir="${t}">${svgIcone(ic)}<span>${rot}</span></button>`;
    primeiro = false; return b;
  }).join('')).join('');
  nav.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.abrirTelaOutorga(b.dataset.ir)));
}
desenharAtalhos();

/* Dados novos (download, outra pessoa marcou): redesenha a tela aberta. */
let pendente = null;
window.addEventListener('outorga-dados', () => {
  clearTimeout(pendente);
  pendente = setTimeout(() => {
    if (document.querySelector('#modal:not(.oculto)')) return;
    if (telaAtual === 'inicio') resumoInicio($('otIniResumo'));
    else if (ABRIR[telaAtual]) ABRIR[telaAtual]({ soDados: true });
  }, 150);
});

montarMenu(abrirAba);

window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
