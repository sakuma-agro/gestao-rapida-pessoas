// app.js — telas e arranque da área Colheita e Produção dentro do LOP - Gestão Rápida (20/10/2026).
//
// Esta página mora numa moldura do app principal: quem entra, sai, instala e
// troca senha é o LOP, e quem pode abrir a área é marcado em Usuários -
// Acessos (módulo 'colheita'). Aqui não há login nem topo de marca.
//
// No topo de toda tela fica a faixa "cultura + safra": é ela que diz de qual
// planilha (cenoura, batata, café, milho, trigo, abacate) se está falando.
import { MODULOS, telasDe, subsDe, montarMenu, mostrarInicio, abrirModulo, svgIcone } from './acesso.js';
import { $, esc, pronto, carregando, culturas, culturaSel, safraSel, safrasDe, escolherCultura, escolherSafra,
  resumoSafra, unidadeRot, num } from './dados.js';
import { abrirPainel, abrirHistorico } from './painel.js';
import { abrirCargas } from './cargas.js';
import { abrirConferencia, abrirImportar, abrirImportarCoop } from './conciliacao.js';
import { abrirPlantios, abrirSafras, abrirVeiculos, abrirPivos, abrirVariedades, abrirHistCad } from './cadastros.js';
import { abrirFretes } from './fretes.js';
import { abrirBeneficiamento, abrirComercializacao, temBeneficiamento } from './venda.js';
import { abrirCulturas, abrirCargaInicial } from './parametros.js';

const TELAS = ['inicio', ...MODULOS.flatMap(m => telasDe(m).map(([t]) => t))];
const idDaTela = t => 'tela' + t.charAt(0).toUpperCase() + t.slice(1);
/* Telas que não dependem da cultura escolhida: a faixa do topo some nelas. */
const SEM_SELETOR = new Set(['inicio', 'cpVeiculos', 'cpPivos', 'cpCulturas', 'cpCargaInicial']);
const ABRIR = {
  cpPainel: abrirPainel, cpHistorico: abrirHistorico, cpCargas: abrirCargas,
  cpConferencia: abrirConferencia, cpImportar: abrirImportar,
  cpBenef: abrirBeneficiamento, cpCom: abrirComercializacao, cpImpCoop: abrirImportarCoop,
  cpPlantios: abrirPlantios, cpSafras: abrirSafras, cpVeiculos: abrirVeiculos, cpPivos: abrirPivos, cpVariedades: abrirVariedades, cpHistCad: abrirHistCad,
  cpFretes: abrirFretes, cpCulturas: abrirCulturas, cpCargaInicial: abrirCargaInicial,
};
let telaAtual = 'inicio';

function abrirAba(nome) {
  telaAtual = nome;
  for (const t of TELAS) {
    const el = $(idDaTela(t));
    if (el) el.hidden = t !== nome;
  }
  $('cpFolha').innerHTML = '';
  desenharSeletor();
  if (ABRIR[nome]) ABRIR[nome]();
  if (nome === 'inicio') desenharInicio();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---- faixa cultura + safra ---- */
function desenharSeletor() {
  const el = $('cpSeletor');
  if (!el) return;
  /* Beneficiamento só para cultura com classificação (26/10/2026): milho e trigo não têm. */
  const cs = pronto() ? culturaSel() : null;
  document.querySelectorAll('[data-modulo="beneficiamento"], [data-ir="cpBenef"]').forEach(b => { b.style.display = cs && !temBeneficiamento(cs) ? "none" : ""; });
  el.hidden = SEM_SELETOR.has(telaAtual) || !pronto();
  if (el.hidden) return;
  const c = culturaSel(), s = safraSel();
  const ls = c ? safrasDe(c.id) : [];
  el.innerHTML = `
    <div class="cp-chips" role="tablist" aria-label="Cultura">${culturas().map(x => `
      <button type="button" class="cp-chip${c && x.id === c.id ? ' ativo' : ''}" data-cultura="${esc(x.slug)}" style="--cor:${esc(x.cor || '#84BD00')}" aria-selected="${c && x.id === c.id}">
        <i></i>${esc(x.nome)}</button>`).join('')}</div>
    <label class="cp-safra">Safra
      <select id="cpSafraSel">${ls.map(x => `<option value="${esc(x.id)}"${s && x.id === s.id ? ' selected' : ''}>${esc(x.nome)}${x.atual ? ' · atual' : ''}</option>`).join('') || '<option value="">— cadastre uma safra —</option>'}</select>
    </label>`;
  el.querySelectorAll('[data-cultura]').forEach(b => b.addEventListener('click', () => escolherCultura(b.dataset.cultura)));
  $('cpSafraSel').addEventListener('change', e => escolherSafra(e.target.value));
}

/* ---- tela inicial: um cartão por cultura com o resumo da safra atual ---- */
function desenharInicio() {
  const el = $('cpIniCulturas');
  if (!el) return;
  if (!pronto() || carregando()) { el.innerHTML = '<p class="in-dica">Abrindo…</p>'; return; }
  el.innerHTML = culturas().map(c => {
    const s = safrasDe(c.id).find(x => x.atual) || safrasDe(c.id)[0];
    const r = s ? resumoSafra(s.id, c) : null;
    return `<button type="button" class="cp-ini-card" data-cultura="${esc(c.slug)}" style="--cor:${esc(c.cor || '#84BD00')}">
      <span class="cp-ini-nome">${esc(c.nome)}</span>
      <span class="cp-ini-safra">${esc(s ? s.nome : 'sem safra')}</span>
      <b>${r && r.tot.cargas ? num(r.tot.un, 0) : '—'}</b>
      <small>${esc(unidadeRot(c))}${r && r.unHa ? ' · ' + num(r.unHa, 0) + '/ha' : ''}</small>
    </button>`;
  }).join('') + '<p class="in-dica">Escolha a cultura para abrir o painel da safra.</p>';
  el.querySelectorAll('[data-cultura]').forEach(b => b.addEventListener('click', () => {
    escolherCultura(b.dataset.cultura);
    window.abrirTelaColheita('cpPainel');
  }));
}

/* Abre uma tela pelo nome, marcando o módulo certo no menu. */
window.abrirTelaColheita = tela => {
  const m = MODULOS.find(x => telasDe(x).some(([t]) => t === tela));
  if (m) abrirModulo(m.id, tela);
};

/* Acesso rápido da tela inicial (lateral, como no Pessoas). */
function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  let primeiro = true;
  nav.innerHTML = MODULOS.map(m => `<div class="ql-grupo">${m.nome}</div>` + subsDe(m).flatMap(s => s.telas).map(([t, rot, ic]) => {
    const b = `<button type="button" class="ql-item${primeiro ? ' prim' : ''}" data-ir="${t}">${svgIcone(ic)}<span>${rot.replace(/ \(.*\)$/, '')}</span></button>`;
    primeiro = false; return b;
  }).join('')).join('');
  nav.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.abrirTelaColheita(b.dataset.ir)));
}
desenharAtalhos();

/* Troca de cultura/safra ou dados novos: redesenha a tela aberta. */
window.addEventListener('colheita-selecao', () => abrirAba(telaAtual));
let pendente = null;
window.addEventListener('colheita-dados', () => {
  clearTimeout(pendente);
  pendente = setTimeout(() => {
    desenharSeletor();
    if (telaAtual === 'inicio') desenharInicio();
    else if (ABRIR[telaAtual] && !document.querySelector('#modal:not(.oculto)')) ABRIR[telaAtual]({ soDados: true });
  }, 120);
});

montarMenu(abrirAba);

window.areaPronta = true;
window.voltarAoInicioDaArea = () => mostrarInicio();
