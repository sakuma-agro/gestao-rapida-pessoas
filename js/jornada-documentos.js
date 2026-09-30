// jornada-documentos.js — DP → Folha, holerite e recibo (30/09/2026)
//
// Controle mensal dos documentos que todo funcionário assina e devolve ao DP:
// folha de ponto, holerite e recibo. Em novembro entra também a 1ª parcela do
// 13º; em dezembro, a 2ª. Mesmo desenho dos Boletins diários.
//
// O processo (como ele descreveu em 30/09/2026):
//   1. recolhe os documentos e marca: Entregue, Não entregue ou Em correção
//      (devolvido ao funcionário para corrigir) — ou Não se aplica;
//   2. depois escaneia: o entregue ganha a marca "escaneado";
//   3. o painel mostra o que cada um deve e o que falta escanear.
//
// "Mês" é sempre o mês de REFERÊNCIA do documento (o holerite de setembro é
// da competência setembro, mesmo que seja assinado em outubro).
//
// Quem deve = Não entregue + Em correção. Sem marcação aparece à parte: só
// vira cobrança quando alguém marcar "Não entregue" (há botão para marcar em
// lote). Antes do primeiro mês marcado, nada é cobrado — o controle começa do
// zero, sem planilha importada.
//
// Banco: jor_doc_entregas (chave = funcionario_id|AAAA-MM|documento), RLS
// app_pode('jornada').

import { montarMulti } from './multisel.js';
import { estado } from './store.js';
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const mesAtual = () => hoje().slice(0, 7);
const somaMes = (ym, n) => { const [a, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const fimDoMes = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
export const rotMes = ym => `${MESES[+ym.slice(5) - 1]}/${ym.slice(2, 4)}`;
const rotMesLongo = ym => `${MESES_L[+ym.slice(5) - 1]} de ${ym.slice(0, 4)}`;
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();

/* ---------------- os documentos ---------------- */
export const DOCS = {
  folha_ponto: { rot: 'Folha de ponto',   curto: 'Folha' },
  holerite:    { rot: 'Holerite',         curto: 'Holerite' },
  recibo:      { rot: 'Recibo',           curto: 'Recibo' },
  decimo1:     { rot: '13º · 1ª parcela', curto: '13º 1ª' },
  decimo2:     { rot: '13º · 2ª parcela', curto: '13º 2ª' },
};
/** Os documentos de cada mês: os três de sempre, mais o 13º em novembro e dezembro. */
export const docsDoMes = ym => {
  const m = +ym.slice(5, 7);
  return ['folha_ponto', 'holerite', 'recibo', ...(m === 11 ? ['decimo1'] : m === 12 ? ['decimo2'] : [])];
};

/* ---------------- situações ---------------- */
export const SIT = {
  entregue:      { rot: 'Entregue',      curto: '✓',  cls: 'bd-ok' },
  nao_entregue:  { rot: 'Não entregue',  curto: '✗',  cls: 'bd-nao' },
  correcao:      { rot: 'Em correção',   curto: 'EC', cls: 'bd-corr' },
  nao_se_aplica: { rot: 'Não se aplica', curto: 'NA', cls: 'bd-neutro' },
};
const ORDEM = Object.keys(SIT);
export const PEND = ['nao_entregue', 'correcao'];
const ehPend = s => PEND.includes(s);
const faltaEscanear = r => r.situacao === 'entregue' && !r.escaneado;

/* ---------------- quem entra ---------------- */
const pessoa = id => estado.funcionarios.find(f => f.id === id) || null;
const ativa = f => (f.situacao || 'ATIVO') === 'ATIVO';
const admissao = f => (f?.admissao || '').slice(0, 10) || null;
const regs = () => jd.dados.docEntregas || [];

/** Quem aparece no mês: ativos já admitidos até o fim do mês, e qualquer um
 *  (mesmo desligado) que já tenha marcação naquele mês. */
export function equipeDoMes(ym) {
  const fim = fimDoMes(ym);
  const comReg = new Set(regs().filter(r => r.competencia === ym).map(r => r.funcionario_id));
  return estado.funcionarios.filter(f => comReg.has(f.id) || (ativa(f) && (!admissao(f) || admissao(f) <= fim)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const chave = (fid, ym, doc) => `${fid}|${ym}|${doc}`;
export const registro = (fid, ym, doc) => regs().find(r => r.chave === chave(fid, ym, doc)) || null;

/* O controle começa no primeiro mês que tiver marcação. */
const inicioControle = () => regs().reduce((m, r) => !m || r.competencia < m ? r.competencia : m, null);
/** Meses controlados, do primeiro marcado até o mês anterior (o do mês
 *  corrente ainda não foi emitido, então não cobra). */
function mesesControlados() {
  const i = inicioControle();
  if (!i) return [];
  const r = [];
  for (let m = i; m <= somaMes(mesAtual(), -1); m = somaMes(m, 1)) r.push(m);
  return r;
}


/* Fazendas (filtro com caixas de marcar — lista vazia = todas). */
const casaFazenda = (f, fz) => { const l = [].concat(fz || []).filter(Boolean);
  return !l.length || l.some(z => z === '-' ? !f.fazenda : f.fazenda === z); };
const rotFazendas = fz => [].concat(fz || []).filter(Boolean).map(z => z === '-' ? 'sem fazenda' : z).join(', ');
const fazendas = () => [...new Set(estado.funcionarios.filter(ativa).map(f => f.fazenda).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
const opcoesFazenda = () => [...fazendas().map(z => [z, z]), ['-', 'Sem fazenda']];
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------------- consultas ---------------- */
const dentro = (ym, de, ate) => (!de || ym >= de) && (!ate || ym <= ate);

/** Pendências (não entregue / em correção) de uma pessoa, do mês mais antigo ao mais novo. */
export const pendenciasDe = (fid, de = '', ate = '', tipo = '') => regs()
  .filter(r => r.funcionario_id === fid && (tipo ? r.situacao === tipo : ehPend(r.situacao)) && dentro(r.competencia, de, ate))
  .sort(ordemReg);
const ordemReg = (a, b) => a.competencia.localeCompare(b.competencia) ||
  Object.keys(DOCS).indexOf(a.documento) - Object.keys(DOCS).indexOf(b.documento);

/** Todas as pessoas com pendência (inclusive desligados). */
function comPendencia(de, ate, fz, tipo = '') {
  const ids = [...new Set(regs().filter(r => ehPend(r.situacao)).map(r => r.funcionario_id))];
  return ids.map(id => ({ f: pessoa(id), p: pendenciasDe(id, de, ate, tipo) }))
    .filter(x => x.f && x.p.length && casaFazenda(x.f, fz))
    .sort((a, b) => b.p.length - a.p.length || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
}

/** Entregues que ainda não foram escaneados. */
const paraEscanear = (de = '', ate = '', fz = []) => regs()
  .filter(r => faltaEscanear(r) && dentro(r.competencia, de, ate) && casaFazenda(pessoa(r.funcionario_id) || {}, fz))
  .sort((a, b) => ordemReg(a, b) || (pessoa(a.funcionario_id)?.nome || '').localeCompare(pessoa(b.funcionario_id)?.nome || '', 'pt-BR'));

/** Pessoa × documento sem nenhuma marcação nos meses controlados. */
function semMarcacao(de = '', ate = '', fz = []) {
  const r = [];
  for (const ym of mesesControlados()) {
    if (!dentro(ym, de, ate)) continue;
    for (const f of equipeDoMes(ym)) {
      if (!casaFazenda(f, fz)) continue;
      for (const doc of docsDoMes(ym)) if (!registro(f.id, ym, doc)) r.push({ f, ym, doc });
    }
  }
  return r;
}

/* ---------------- escrita ---------------- */
async function marcar(fid, ym, doc, sit, extra = {}) {
  const k = chave(fid, ym, doc);
  if (!sit) { await jd.apagar('docEntregas', k); return; }
  const antes = registro(fid, ym, doc);
  const entregue = sit === 'entregue';
  await jd.salvar('docEntregas', {
    chave: k, funcionario_id: fid, competencia: ym, documento: doc, situacao: sit,
    entregue_em: entregue ? (extra.entregue_em ?? antes?.entregue_em ?? hoje()) : null,
    escaneado: entregue ? (extra.escaneado ?? antes?.escaneado ?? false) : false,
    escaneado_em: entregue ? (extra.escaneado_em !== undefined ? extra.escaneado_em : antes?.escaneado_em ?? null) : null,
    observacao: extra.observacao ?? antes?.observacao ?? null,
    marcado_por: usuario(), marcado_em: agora(),
  });
}
async function escanear(r, sim) {
  await jd.salvar('docEntregas', { ...r, escaneado: !!sim, escaneado_em: sim ? hoje() : null,
    marcado_por: usuario(), marcado_em: agora() });
}

/* ---------------- carregamento ---------------- */
let carregado = false;
async function garantir(forcar = false) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados do DP: ' + e.message); }
  }
  if (carregado && !forcar) return;
  try { await jd.carregarDocs(); carregado = true; }
  catch (e) { avisar('Sem conexão: mostrando o que ficou guardado neste aparelho. ' + (e.message || '')); }
}

/* ===================================================================
   DOCUMENTOS (prévia no #jorImpressao, moldura .rel)
   =================================================================== */

function cabecalhoDoc(titulo, sub, direita) {
  return `<header class="rel-cabecalho">
    <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
    <div class="rel-comp">${direita}</div></header>`;
}
const rodapeLop = () => `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>`;
const rotPeriodo = (de, ate) => !de && !ate ? 'todos os meses em aberto' : `${de ? rotMes(de) : 'início'} a ${ate ? rotMes(ate) : rotMes(mesAtual())}`;
const nDoc = n => `${n} ${n === 1 ? 'documento' : 'documentos'}`;
const itemTxt = r => `${rotMes(r.competencia)} · ${DOCS[r.documento].rot}${r.situacao === 'correcao' ? ' (correção)' : ''}`;

/** Aviso ao funcionário: o que ele deve, mês a mês. Sem responsável no pé. */
export function relIndividual(fid, de = '', ate = '', tipo = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, de, ate, tipo);
  const quem = [f?.cargo, f?.fazenda].filter(Boolean).map(esc).join(' · ');
  const nNao = p.filter(r => r.situacao === 'nao_entregue').length, nCor = p.length - nNao;
  const oque = r => r.situacao === 'correcao' ? 'Corrigir e devolver ao DP' : 'Assinar e entregar no DP';
  return `<article class="rel">
    ${cabecalhoDoc('Documentos a entregar no DP', 'Aviso ao funcionário', `data<strong>${br(hoje())}</strong>`)}
    <div style="margin:4px 0 14px"><div style="font-size:17px;font-weight:700;color:#51534A">${esc(f?.nome || '')}</div>
      <div style="font-size:11px;color:#8A8D86;margin-top:2px">${quem}</div></div>
    ${p.length ? `
      <div style="font-size:13px;color:#51534A;margin-bottom:12px">Faltam <b>${nDoc(p.length)}</b>${nNao && nCor ?
        `: ${nNao} não ${nNao === 1 ? 'entregue' : 'entregues'} e ${nCor} em correção` : ''}.</div>
      <table class="rel-tabela"><thead><tr><th>Mês</th><th>Documento</th><th>Situação</th><th>O que fazer</th></tr></thead>
      <tbody>${p.map(r => `<tr><td>${esc(rotMesLongo(r.competencia))}</td><td>${esc(DOCS[r.documento].rot)}</td>
        <td><b style="color:${r.situacao === 'correcao' ? '#8a6d00' : '#744F28'}">${SIT[r.situacao].rot}</b></td><td>${oque(r)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td>${nDoc(p.length)}</td></tr></tfoot></table>
      <div class="rel-resumo" style="font-size:12px;margin-top:14px">Entregue no escritório (DP) os documentos da lista${
        nCor ? ' — os que estão em correção precisam ser corrigidos antes' : ''}.</div>`
      : '<div class="rel-resumo" style="font-size:12px"><b>Tudo em dia.</b> Nenhum documento pendente.</div>'}
    ${rodapeLop()}</article>`;
}

/** Relatório geral: todos que devem. */
export function relGeral(de = '', ate = '', fz = [], tipo = '') {
  const l = comPendencia(de, ate, fz, tipo);
  const tot = l.reduce((s, x) => s + x.p.length, 0);
  const scan = paraEscanear(de, ate, fz).length;
  return `<article class="rel">
    ${cabecalhoDoc('Folha de ponto, holerite e recibo', 'Documentos pendentes de entrega',
      `posição em<strong>${br(hoje())}</strong>${esc(rotPeriodo(de, ate))}${rotFazendas(fz) ? ' · ' + esc(rotFazendas(fz)) : ''}`)}
    <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th class="rel-num">Pendentes</th><th>O que falta</th></tr></thead>
    <tbody>${l.map(x => `<tr><td>${esc(x.f.nome)}${ativa(x.f) ? '' : ' <span class="rel-mini">(inativo)</span>'}</td><td>${esc(x.f.fazenda || '—')}</td>
      <td class="rel-num">${x.p.length}</td><td>${x.p.map(r => esc(itemTxt(r))).join('; ')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="rel-vazio">Ninguém com documento pendente.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="rel-num">${tot}</td><td>${l.length} pessoa(s)</td></tr></tfoot></table>
    ${scan ? `<div class="rel-resumo" style="font-size:12px;margin-top:12px">Além disso, <b>${nDoc(scan)}</b> já ${scan === 1 ? 'foi entregue' : 'foram entregues'} e ainda ${scan === 1 ? 'falta' : 'faltam'} escanear.</div>` : ''}
    ${rodapeLop()}</article>`;
}

export function textoZap(fid, de = '', ate = '', tipo = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, de, ate, tipo);
  const cab = `*DOCUMENTOS DO DP*\n*${f?.nome || ''}*\n\n`;
  if (!p.length) return cab + 'Nenhum documento pendente. Obrigado!';
  const bloco = (k, rot) => { const l = p.filter(r => r.situacao === k);
    return l.length ? `${rot}\n` + l.map(r => `• ${rotMes(r.competencia)} – ${DOCS[r.documento].rot}`).join('\n') : ''; };
  return cab + [bloco('nao_entregue', 'Falta entregar:'), bloco('correcao', 'Devolvido para correção:')].filter(Boolean).join('\n\n') +
    `\n\nTotal: ${nDoc(p.length)}. Favor entregar no DP.\n\nSAKUMA Agronegócios`;
}
const linkZap = t => `https://wa.me/?text=${encodeURIComponent(t)}`;

function csvMes(ym, lista) {
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  const docs = docsDoMes(ym);
  const cols = ['Funcionario', 'Fazenda', ...docs.flatMap(d => [DOCS[d].rot, DOCS[d].rot + ' - escaneado'])];
  const linhas = lista.map(f => [f.nome, f.fazenda || '', ...docs.flatMap(d => {
    const r = registro(f.id, ym, d);
    return [r ? SIT[r.situacao].rot : '', r?.situacao === 'entregue' ? (r.escaneado ? 'Sim' : 'Nao') : ''];
  })]);
  return { nome: `Documentos_${ym}.csv`, conteudo: '﻿' + [cols, ...linhas].map(l => l.map(q).join(';')).join('\r\n') };
}
function baixarCSV({ nome, conteudo }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8;' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

let barraAtual = null;
function mostrarDoc(html, barraId) {
  const alvo = $('jorImpressao');
  alvo.innerHTML = html; alvo.hidden = false;
  if (barraAtual && barraAtual !== barraId && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = barraId;
  if ($(barraId)) $(barraId).hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function fecharDocDocumentos() {
  if (barraAtual && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = null;
}
function fecharPrevia() { const a = $('jorImpressao'); a.innerHTML = ''; a.hidden = true; fecharDocDocumentos(); }
function imprimirDoc() {
  document.body.classList.add('jor-imprimindo');
  const soltar = () => { document.body.classList.remove('jor-imprimindo'); removeEventListener('afterprint', soltar); };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);
}
const barraDoc = id => `<div id="${id}" hidden><div class="jor-acoes">
  <button class="btn principal" type="button" data-doc-imprimir>Imprimir / salvar em PDF</button>
  <button class="btn mini" type="button" data-doc-fechar>Fechar prévia</button></div></div>`;
function ligarBarraDoc(raiz) {
  raiz.querySelectorAll('[data-doc-imprimir]').forEach(b => b.addEventListener('click', imprimirDoc));
  raiz.querySelectorAll('[data-doc-fechar]').forEach(b => b.addEventListener('click', fecharPrevia));
}

/* ===================================================================
   TELAS
   =================================================================== */

let avisar = () => {};
let irPara = () => {};
/* Mês padrão: o anterior — é dele que se recolhe folha, holerite e recibo. */
const est = { mes: null, busca: '', fazenda: [], de: '', ate: '', pFaz: [], tipo: '', sDe: '', sAte: '', sFaz: [], sTodos: false, sel: new Set() };
const TIPOS = { '': 'Todos os pendentes', nao_entregue: 'Só não entregue', correcao: 'Só em correção' };

function cabecalho(titulo, sub, direita) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">${direita}</div></header>`;
}
const rotCel = r => !r ? '' : r.situacao === 'entregue' && r.escaneado ? 'ESC' : SIT[r.situacao].curto;
const clsCel = r => !r ? '' : r.situacao === 'entregue' && r.escaneado ? 'bd-ok dm-esc' : SIT[r.situacao].cls;
const titCel = (f, ym, doc, r) => `${f.nome} · ${DOCS[doc].rot} · ${rotMes(ym)} — ${!r ? 'sem marcação'
  : SIT[r.situacao].rot + (r.situacao === 'entregue' ? (r.escaneado ? `, escaneado${r.escaneado_em ? ' em ' + br(r.escaneado_em) : ''}` : ', falta escanear') : '')}`;

export async function abrirDocumentos(tela) {
  if (!est.mes) est.mes = somaMes(mesAtual(), -1);
  await garantir(true);
  if (tela === 'dmPainel') desenharPainel();
  if (tela === 'dmMes') desenharMes();
  if (tela === 'dmScan') desenharScan();
}
const redesenharAberta = () => {
  if ($('telaDmPainel') && !$('telaDmPainel').hidden) desenharPainel();
  if ($('telaDmMes') && !$('telaDmMes').hidden) desenharMes();
  if ($('telaDmScan') && !$('telaDmScan').hidden) desenharScan();
};

/* ---------------- Painel (o que devem) ---------------- */

function desenharPainel() {
  const { de, ate, pFaz, tipo } = est;
  const todos = comPendencia(de, ate, pFaz).flatMap(x => x.p);
  const nNao = todos.filter(r => r.situacao === 'nao_entregue').length;
  const nCor = todos.filter(r => r.situacao === 'correcao').length;
  const l = comPendencia(de, ate, pFaz, tipo);
  const scan = paraEscanear(de, ate, pFaz);
  const sm = semMarcacao(de, ate, pFaz);

  // Quadro por mês: pendentes de cada documento (e o que falta escanear).
  const meses = [...new Set([...mesesControlados(), ...regs().map(r => r.competencia)])]
    .filter(ym => dentro(ym, de, ate)).sort().reverse();
  const cel = (ym, doc) => {
    if (!docsDoMes(ym).includes(doc)) return '<td class="ce dc-sem">—</td>';
    const eq = equipeDoMes(ym).filter(f => casaFazenda(f, pFaz));
    const rs = eq.map(f => registro(f.id, ym, doc));
    const pend = rs.filter(r => r && ehPend(r.situacao)).length;
    const ok = rs.filter(r => r && ['entregue', 'nao_se_aplica'].includes(r.situacao)).length;
    const vaz = rs.filter(r => !r).length;
    return `<td class="ce">${pend ? `<span class="pv-num-perigo">${pend}</span> <span class="dc-sem">devem</span>`
      : vaz ? `<span class="dc-sem">${ok}/${eq.length}</span>` : '<span class="dm-tudo">✓ ok</span>'}${
      vaz && pend ? `<br><span class="dc-sem">${vaz} sem marcação</span>` : ''}</td>`;
  };
  const docsCol = ['folha_ponto', 'holerite', 'recibo'];
  const temDecimo = meses.some(ym => ['11', '12'].includes(ym.slice(5)));

  $('telaDmPainel').innerHTML = cabecalho('Folha, holerite e recibo', 'O que cada funcionário ainda deve ao DP e o que falta escanear',
    `posição em<strong class="jor-cabecalho__competencia">${br(hoje())}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <label class="fer-filtro">De <input type="month" id="dmDe" value="${de}" max="${mesAtual()}"></label>
        <label class="fer-filtro">até <input type="month" id="dmAte" value="${ate}" max="${mesAtual()}"></label>
        <select id="dmTipo" class="dc-mini bd-sel" aria-label="O que cobrar">
          ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <div id="dmPFaz" aria-label="Fazenda"></div>
        ${de || ate || pFaz.length || tipo ? '<button class="btn mini" type="button" id="dmLimpa">Limpar filtro</button>' : ''}
      </div>
      <div class="pv-cards bd-cards">
        <button type="button" class="pv-card ${nNao ? 'pv-atencao' : 'pv-ok'}" data-tipo="nao_entregue" aria-pressed="${tipo === 'nao_entregue'}"><span>Não entregue</span><strong>${nNao}</strong><small>${de || ate ? 'no período' : 'todos em aberto'}</small></button>
        <button type="button" class="pv-card ${nCor ? 'pv-alerta' : 'pv-ok'}" data-tipo="correcao" aria-pressed="${tipo === 'correcao'}"><span>Em correção</span><strong>${nCor}</strong><small>devolvidos para corrigir</small></button>
        <button type="button" class="pv-card ${scan.length ? 'pv-alerta' : 'pv-ok'}" data-ir="dmScan"><span>Falta escanear</span><strong>${scan.length}</strong><small>entregues, sem escanear</small></button>
        <button type="button" class="pv-card ${sm.length ? 'pv-alerta' : 'pv-ok'}" data-ir="dmMes"><span>Sem marcação</span><strong>${sm.length}</strong><small>${inicioControle() ? 'desde ' + rotMes(inicioControle()) : 'nada marcado ainda'}</small></button>
      </div>
      ${!inicioControle() ? `<div class="jor-caixa">Nenhum documento marcado ainda. Comece em <b>Mês</b>: escolha o mês e marque o que cada um entregou.
        <button class="btn mini" type="button" data-ir="dmMes">Abrir o mês</button></div>` : ''}

      <h3 class="jor-h3">Por mês</h3>
      <div class="fer-rola"><table class="dc-planilha fer-tabela dm-meses"><thead><tr><th>Mês</th>
        ${docsCol.map(d => `<th class="ce">${DOCS[d].rot}</th>`).join('')}${temDecimo ? '<th class="ce">13º salário</th>' : ''}<th class="ce">Falta escanear</th></tr></thead><tbody>
        ${meses.map(ym => {
          const sc = scan.filter(r => r.competencia === ym).length;
          const dec = ym.slice(5) === '11' ? 'decimo1' : ym.slice(5) === '12' ? 'decimo2' : null;
          return `<tr class="fer-clica" data-mes="${ym}" tabindex="0"><td><b>${rotMes(ym)}</b></td>${docsCol.map(d => cel(ym, d)).join('')}
            ${temDecimo ? (dec ? cel(ym, dec) : '<td class="ce dc-sem">—</td>') : ''}
            <td class="ce">${sc ? `<span class="dm-scan-n">${sc}</span>` : '<span class="dc-sem">—</span>'}</td></tr>`;
        }).join('') || `<tr><td colspan="${5 + (temDecimo ? 1 : 0)}" class="vazio">Nenhum mês controlado ainda.</td></tr>`}
      </tbody></table></div>

      <h3 class="jor-h3">Quem deve</h3>
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="dmRelGeral" ${l.length ? '' : 'disabled'}>Relatório geral (todos)</button>
        ${tipo ? `<span class="dc-sem">Mostrando: <b>${TIPOS[tipo].toLowerCase()}</b> — relatórios e WhatsApp seguem o filtro.</span>` : ''}
      </div>
      ${barraDoc('dmBarraPainel')}
      <div class="fer-rola"><table class="dc-planilha fer-tabela bd-pend"><thead><tr><th>Funcionário</th><th class="ce">Pendentes</th><th>O que falta</th><th></th></tr></thead><tbody>
        ${l.map(x => `<tr class="fer-clica" data-pessoa="${x.f.id}" tabindex="0">
          <td><b>${esc(x.f.nome)}</b>${ativa(x.f) ? '' : ' <span class="tag inativo">inativo</span>'}<br><span class="dc-sem">${esc(x.f.fazenda || 'sem fazenda')}</span></td>
          <td class="ce"><span class="pv-num-perigo">${x.p.length}</span></td>
          <td>${x.p.slice(0, 8).map(r => `<span class="bd-dt ${SIT[r.situacao].cls}" title="${SIT[r.situacao].rot}">${rotMes(r.competencia)} · ${DOCS[r.documento].curto}</span>`).join(' ')}${
            x.p.length > 8 ? ` <span class="dc-sem">+${x.p.length - 8}</span>` : ''}</td>
          <td class="bd-acoes-l"><button class="btn mini" type="button" data-rel="${x.f.id}">Relatório</button>
            <button class="btn mini btn-zap" type="button" data-zap="${x.f.id}"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button></td></tr>`).join('')
          || '<tr><td colspan="4" class="vazio">Ninguém devendo documento. 👏</td></tr>'}
      </tbody></table></div>
      <p class="dc-sem jor-nota">Em marrom: não entregue · em amarelo: devolvido para correção. Clique nos cartões para cobrar só um tipo,
        no mês para abrir a grade, na pessoa para dar baixa quando o documento chegar. "Sem marcação" só vira cobrança quando for marcado como Não entregue.</p>
    </div>`;

  const t = $('telaDmPainel');
  const setF = (k, v) => { est[k] = v; desenharPainel(); };
  $('dmDe').addEventListener('change', ev => setF('de', ev.target.value));
  $('dmAte').addEventListener('change', ev => setF('ate', ev.target.value));
  $('dmTipo').addEventListener('change', ev => setF('tipo', ev.target.value));
  montarMulti($('dmPFaz'), { opcoes: opcoesFazenda(), marcados: est.pFaz, todas: 'Todas as fazendas', plural: 'fazendas' });
  $('dmPFaz').addEventListener('change', () => setF('pFaz', $('dmPFaz').valores));
  $('dmLimpa')?.addEventListener('click', () => { Object.assign(est, { de: '', ate: '', pFaz: [], tipo: '' }); desenharPainel(); });
  t.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => setF('tipo', est.tipo === b.dataset.tipo ? '' : b.dataset.tipo)));
  t.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.ir === 'dmMes' && sm.length) est.mes = sm[sm.length - 1].ym;
    irPara(b.dataset.ir);
  }));
  t.querySelectorAll('tr[data-mes]').forEach(r => {
    const ir = () => { est.mes = r.dataset.mes; irPara('dmMes'); };
    r.addEventListener('click', ir);
    r.addEventListener('keydown', ev => { if (ev.key === 'Enter') ir(); });
  });
  $('dmRelGeral').addEventListener('click', () => mostrarDoc(relGeral(de, ate, pFaz, tipo), 'dmBarraPainel'));
  ligarBarraDoc(t);
  t.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); mostrarDoc(relIndividual(b.dataset.rel, de, ate, tipo), 'dmBarraPainel');
  }));
  t.querySelectorAll('[data-zap]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); window.open(linkZap(textoZap(b.dataset.zap, de, ate, tipo)), '_blank', 'noopener');
  }));
  t.querySelectorAll('tr[data-pessoa]').forEach(r => {
    r.addEventListener('click', () => dlgPessoa(r.dataset.pessoa));
    r.addEventListener('keydown', ev => { if (ev.key === 'Enter') dlgPessoa(r.dataset.pessoa); });
  });
}

/* ---------------- Mês (a grade) ---------------- */

const filtrada = ym => equipeDoMes(ym).filter(f => casaFazenda(f, est.fazenda) &&
  (!est.busca || normal(f.nome + ' ' + (f.apelido || '')).includes(normal(est.busca))));

function desenharMes() {
  const ym = est.mes;
  const docs = docsDoMes(ym);
  const lista = filtrada(ym);
  const conta = (doc, fn) => lista.filter(f => fn(registro(f.id, ym, doc))).length;
  const vazios = lista.reduce((s, f) => s + docs.filter(d => !registro(f.id, ym, d)).length, 0);

  $('telaDmMes').innerHTML = cabecalho('Documentos do mês', 'Uma linha por pessoa, uma coluna por documento — clique na célula para marcar',
    `mês de referência<strong class="jor-cabecalho__competencia">${rotMes(ym)}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <span class="bd-dia">
          <button class="btn mini" type="button" id="dmAnt" aria-label="Mês anterior">◀</button>
          <input type="month" id="dmMesSel" value="${ym}" max="${mesAtual()}">
          <button class="btn mini" type="button" id="dmProx" aria-label="Próximo mês" ${ym >= mesAtual() ? 'disabled' : ''}>▶</button>
        </span>
        <input id="dmBusca" type="search" placeholder="Buscar funcionário" value="${esc(est.busca)}">
        <div id="dmFaz" aria-label="Fazenda"></div>
        <button class="btn mini" type="button" id="dmCsv">Baixar o mês (CSV)</button>
      </div>
      ${docs.length > 3 ? `<div class="jor-caixa">Em ${MESES_L[+ym.slice(5) - 1]} entra também o <b>${DOCS[docs[3]].rot}</b>.</div>` : ''}
      <div class="bd-legenda">${ORDEM.map(k => `<span><i class="bd-cel ${SIT[k].cls}">${SIT[k].curto}</i>${SIT[k].rot}${k === 'entregue' ? ' (falta escanear)' : ''}</span>`).join('')}
        <span><i class="bd-cel bd-ok dm-esc">ESC</i>Entregue e escaneado</span><span><i class="bd-cel bd-vazio-cob"></i>Sem marcação</span></div>
      ${vazios ? `<div class="jor-acoes dm-lote">
        <span class="dc-sem">${vazios} sem marcação neste mês${est.busca || est.fazenda.length ? ' (no filtro)' : ''}. Marcar em lote:</span>
        <select id="dmLoteDoc" class="dc-mini bd-sel" aria-label="Documento">
          <option value="">todos os documentos</option>${docs.map(d => `<option value="${d}">${DOCS[d].rot}</option>`).join('')}</select>
        <button class="btn mini" type="button" data-lote="entregue">como Entregue</button>
        <button class="btn mini" type="button" data-lote="nao_entregue">como Não entregue</button>
      </div>` : ''}
      <div class="bd-rola"><table class="bd-grade dm-grade"><thead><tr><th class="bd-nome">Funcionário</th>
        ${docs.map(d => `<th>${esc(DOCS[d].curto)}</th>`).join('')}<th class="bd-tot" title="Pendentes (não entregue + em correção)">Pend.</th></tr></thead><tbody>
        ${lista.map(f => {
          let n = 0;
          const cels = docs.map(d => {
            const r = registro(f.id, ym, d);
            if (r && ehPend(r.situacao)) n++;
            return `<td class="${r ? clsCel(r) : 'bd-vazio-cob'}"><button type="button" data-fid="${f.id}" data-doc="${d}" title="${esc(titCel(f, ym, d, r))}">${rotCel(r)}</button></td>`;
          }).join('');
          return `<tr><th class="bd-nome"><button type="button" class="bd-pessoa" data-pessoa="${f.id}">${esc(f.nome)}</button>${
            ativa(f) ? '' : ' <span class="tag inativo">inativo</span>'}</th>${cels}<td class="bd-tot ${n ? 'bd-tem' : ''}">${n || ''}</td></tr>`;
        }).join('') || `<tr><td colspan="${docs.length + 2}" class="vazio">Ninguém com esse filtro.</td></tr>`}
      </tbody><tfoot>
        <tr><th class="bd-nome">Entregues</th>${docs.map(d => `<td>${conta(d, r => r?.situacao === 'entregue') || ''}</td>`).join('')}<td class="bd-tot"></td></tr>
        <tr><th class="bd-nome">Devem</th>${docs.map(d => `<td>${conta(d, r => r && ehPend(r.situacao)) || ''}</td>`).join('')}
          <td class="bd-tot">${lista.reduce((s, f) => s + docs.filter(d => ehPend(registro(f.id, ym, d)?.situacao)).length, 0) || ''}</td></tr>
        <tr><th class="bd-nome">Falta escanear</th>${docs.map(d => `<td>${conta(d, r => r && faltaEscanear(r)) || ''}</td>`).join('')}<td class="bd-tot"></td></tr>
      </tfoot></table></div>
      ${barraDoc('dmBarraMes')}
      <p class="dc-sem jor-nota">Clique na célula e escolha no menu (Esc fecha) — é ali também que se marca o escaneado.
        Clique no nome para ver tudo o que a pessoa deve. Só aparece quem está ativo e já admitido no mês, e quem tiver marcação nele.</p>
    </div>`;

  const irMes = m => { est.mes = m; desenharMes(); };
  $('dmAnt').addEventListener('click', () => irMes(somaMes(ym, -1)));
  $('dmProx').addEventListener('click', () => { if (ym < mesAtual()) irMes(somaMes(ym, 1)); });
  $('dmMesSel').addEventListener('change', ev => { const v = ev.target.value; if (v && v <= mesAtual()) irMes(v); });
  $('dmBusca').addEventListener('input', ev => {
    est.busca = ev.target.value; desenharMes();
    const el = $('dmBusca'); el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {}
  });
  montarMulti($('dmFaz'), { opcoes: opcoesFazenda(), marcados: est.fazenda, todas: 'Todas as fazendas', plural: 'fazendas' });
  $('dmFaz').addEventListener('change', () => { est.fazenda = $('dmFaz').valores; desenharMes(); });
  $('dmCsv').addEventListener('click', () => baixarCSV(csvMes(ym, lista)));
  ligarBarraDoc($('telaDmMes'));
  document.querySelectorAll('#telaDmMes [data-lote]').forEach(b => b.addEventListener('click', async () => {
    const sit = b.dataset.lote, so = $('dmLoteDoc').value;
    const alvo = [];
    for (const f of filtrada(ym)) for (const d of (so ? [so] : docs)) if (!registro(f.id, ym, d)) alvo.push([f.id, d]);
    if (!alvo.length) return;
    if (!confirm(`Marcar ${alvo.length} documento(s) sem marcação de ${rotMes(ym)} como ${SIT[sit].rot}?`)) return;
    for (const [fid, d] of alvo) await marcar(fid, ym, d, sit);
    avisar(`${alvo.length} marcado(s) como ${SIT[sit].rot}.` + (navigator.onLine ? '' : ' Sem rede — vai subir sozinho.'), true);
    desenharMes();
  }));
  document.querySelectorAll('#telaDmMes td button[data-doc]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); menuCelula(b);
  }));
  document.querySelectorAll('#telaDmMes [data-pessoa]').forEach(b => b.addEventListener('click', () => dlgPessoa(b.dataset.pessoa)));
}

/* Menu ao clicar na célula — o mesmo jeito dos Boletins diários. */
function fecharMenu() {
  $('dmMenu')?.remove();
  document.removeEventListener('pointerdown', foraDoMenu, true);
  document.removeEventListener('keydown', teclaMenu, true);
  window.removeEventListener('resize', fecharMenu);
  document.querySelector('#telaDmMes .bd-rola')?.removeEventListener('scroll', fecharMenu);
}
function foraDoMenu(ev) { if (!ev.target.closest('#dmMenu')) fecharMenu(); }
function teclaMenu(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); fecharMenu(); return; }
  if (!['ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  const bs = [...document.querySelectorAll('#dmMenu button')];
  const i = bs.indexOf(document.activeElement);
  ev.preventDefault();
  bs[(i + (ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
}
function menuCelula(cel) {
  fecharMenu();
  const fid = cel.dataset.fid, doc = cel.dataset.doc, ym = est.mes;
  const r = registro(fid, ym, doc);
  const f = pessoa(fid);
  const m = document.createElement('div');
  m.id = 'dmMenu'; m.className = 'bd-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="bd-menu-tit"><b>${esc((f?.apelido || f?.nome || '').split(' ').slice(0, 2).join(' '))}</b>${esc(DOCS[doc].rot)} · ${rotMes(ym)}</div>
    ${ORDEM.map(k => `<button type="button" role="menuitem" data-sit="${k}" class="${r?.situacao === k ? 'bd-atual' : ''}">
      <i class="bd-cel ${SIT[k].cls}">${SIT[k].curto}</i>${SIT[k].rot}</button>`).join('')}
    ${r?.situacao === 'entregue' ? `<button type="button" role="menuitem" data-scan="${r.escaneado ? '0' : '1'}" class="dm-menu-scan">
      <i class="bd-cel bd-ok dm-esc">ESC</i>${r.escaneado ? 'Desfazer escaneado' : 'Escaneado'}${r.escaneado && r.escaneado_em ? ` <small>(${br(r.escaneado_em)})</small>` : ''}</button>`
      : `<button type="button" role="menuitem" data-sit="entregue" data-escaneia="1" class="dm-menu-scan"><i class="bd-cel bd-ok dm-esc">ESC</i>Entregue e já escaneado</button>`}
    ${r ? `<button type="button" role="menuitem" data-sit="" class="bd-menu-apaga"><i class="bd-cel"></i>Apagar marcação</button>` : ''}
    ${r?.entregue_em ? `<div class="bd-menu-nota">Entregue em ${br(r.entregue_em)}.</div>` : ''}`;
  document.body.appendChild(m);
  const rc = cel.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(rc.left + rc.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
  m.style.top = (rc.bottom + h + 8 <= innerHeight ? rc.bottom + 4 : Math.max(8, rc.top - h - 4)) + 'px';
  (m.querySelector('.bd-atual') || m.querySelector('button')).focus();
  const depois = () => {
    const x = document.querySelector('#telaDmMes .bd-rola')?.scrollLeft || 0;
    desenharMes();
    const r2 = document.querySelector('#telaDmMes .bd-rola'); if (r2) r2.scrollLeft = x;
    document.querySelector(`#telaDmMes button[data-fid="${fid}"][data-doc="${doc}"]`)?.focus();
  };
  m.querySelectorAll('button[data-sit]').forEach(b => b.addEventListener('click', async () => {
    fecharMenu();
    const extra = b.dataset.escaneia ? { escaneado: true, escaneado_em: hoje() } : {};
    await marcar(fid, ym, doc, b.dataset.sit || null, extra);
    depois();
  }));
  m.querySelector('[data-scan]')?.addEventListener('click', async ev => {
    fecharMenu();
    await escanear(r, ev.currentTarget.dataset.scan === '1');
    depois();
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', foraDoMenu, true);
    document.addEventListener('keydown', teclaMenu, true);
    window.addEventListener('resize', fecharMenu);
    document.querySelector('#telaDmMes .bd-rola')?.addEventListener('scroll', fecharMenu);
  });
}
export const fecharMenuDocumentos = fecharMenu;

/* ---------------- Escanear ---------------- */

function desenharScan() {
  const { sDe, sAte, sFaz, sTodos } = est;
  const falta = paraEscanear(sDe, sAte, sFaz);
  const feitos = sTodos ? regs().filter(r => r.situacao === 'entregue' && r.escaneado && dentro(r.competencia, sDe, sAte) &&
    casaFazenda(pessoa(r.funcionario_id) || {}, sFaz)).sort(ordemReg).reverse() : [];
  // A seleção só guarda o que ainda está na lista.
  est.sel = new Set([...est.sel].filter(k => falta.some(r => r.chave === k)));
  const porMes = [...new Set(falta.map(r => r.competencia))].sort();
  const linha = r => { const f = pessoa(r.funcionario_id);
    return `<tr><td class="ce"><input type="checkbox" data-k="${esc(r.chave)}" ${est.sel.has(r.chave) ? 'checked' : ''} aria-label="Selecionar"></td>
      <td><b>${esc(f?.nome || '—')}</b><br><span class="dc-sem">${esc(f?.fazenda || 'sem fazenda')}</span></td>
      <td>${esc(DOCS[r.documento].rot)}</td><td>${br(r.entregue_em)}</td>
      <td class="ce"><button class="btn mini" type="button" data-um="${esc(r.chave)}">Escaneado</button></td></tr>`; };

  $('telaDmScan').innerHTML = cabecalho('Escanear', 'Documentos já entregues que ainda não foram escaneados',
    `faltam<strong class="jor-cabecalho__competencia">${falta.length}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <label class="fer-filtro">De <input type="month" id="dsDe" value="${sDe}" max="${mesAtual()}"></label>
        <label class="fer-filtro">até <input type="month" id="dsAte" value="${sAte}" max="${mesAtual()}"></label>
        <div id="dsFaz" aria-label="Fazenda"></div>
        <label class="fer-filtro"><input type="checkbox" id="dsTodos" ${sTodos ? 'checked' : ''}> mostrar os já escaneados</label>
      </div>
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="dsMarcar" ${est.sel.size ? '' : 'disabled'}>Marcar ${est.sel.size || ''} como escaneado${est.sel.size === 1 ? '' : 's'}</button>
        <button class="btn mini" type="button" id="dsTudo" ${falta.length ? '' : 'disabled'}>${est.sel.size === falta.length && falta.length ? 'Desmarcar todos' : 'Selecionar todos'}</button>
      </div>
      ${porMes.map(ym => `<h3 class="jor-h3">${rotMes(ym)} <span class="dc-sem">· ${falta.filter(r => r.competencia === ym).length}</span>
          <button class="btn mini" type="button" data-selmes="${ym}">Selecionar o mês</button></h3>
        <div class="fer-rola"><table class="dc-planilha fer-tabela"><thead><tr><th></th><th>Funcionário</th><th>Documento</th><th>Entregue em</th><th></th></tr></thead>
        <tbody>${falta.filter(r => r.competencia === ym).map(linha).join('')}</tbody></table></div>`).join('')
        || '<div class="vazio">Nada para escanear. 👏</div>'}
      ${sTodos ? `<h3 class="jor-h3">Já escaneados <span class="dc-sem">· ${feitos.length}</span></h3>
        <div class="fer-rola"><table class="dc-planilha fer-tabela"><thead><tr><th>Mês</th><th>Funcionário</th><th>Documento</th><th>Escaneado em</th><th></th></tr></thead>
        <tbody>${feitos.slice(0, 300).map(r => `<tr><td>${rotMes(r.competencia)}</td><td>${esc(pessoa(r.funcionario_id)?.nome || '—')}</td>
          <td>${esc(DOCS[r.documento].rot)}</td><td>${br(r.escaneado_em)}</td>
          <td class="ce"><button class="btn mini" type="button" data-desfaz="${esc(r.chave)}">Desfazer</button></td></tr>`).join('')
          || '<tr><td colspan="5" class="vazio">Nenhum ainda.</td></tr>'}</tbody></table></div>` : ''}
      <p class="dc-sem jor-nota">Aqui só entra o que foi marcado como <b>Entregue</b>. O que estiver em correção ou não entregue aparece no Painel.</p>
    </div>`;

  const set = (k, v) => { est[k] = v; desenharScan(); };
  $('dsDe').addEventListener('change', ev => set('sDe', ev.target.value));
  $('dsAte').addEventListener('change', ev => set('sAte', ev.target.value));
  $('dsTodos').addEventListener('change', ev => set('sTodos', ev.target.checked));
  montarMulti($('dsFaz'), { opcoes: opcoesFazenda(), marcados: est.sFaz, todas: 'Todas as fazendas', plural: 'fazendas' });
  $('dsFaz').addEventListener('change', () => set('sFaz', $('dsFaz').valores));
  const t = $('telaDmScan');
  t.querySelectorAll('input[data-k]').forEach(c => c.addEventListener('change', () => {
    if (c.checked) est.sel.add(c.dataset.k); else est.sel.delete(c.dataset.k);
    desenharScan();
  }));
  $('dsTudo').addEventListener('click', () => {
    est.sel = est.sel.size === falta.length ? new Set() : new Set(falta.map(r => r.chave)); desenharScan();
  });
  t.querySelectorAll('[data-selmes]').forEach(b => b.addEventListener('click', () => {
    falta.filter(r => r.competencia === b.dataset.selmes).forEach(r => est.sel.add(r.chave)); desenharScan();
  }));
  const acha = k => regs().find(r => r.chave === k);
  $('dsMarcar').addEventListener('click', async () => {
    const ks = [...est.sel];
    for (const k of ks) { const r = acha(k); if (r) await escanear(r, true); }
    est.sel.clear();
    avisar(`${ks.length} documento(s) marcado(s) como escaneado(s).`, true);
    desenharScan();
  });
  t.querySelectorAll('[data-um]').forEach(b => b.addEventListener('click', async () => {
    const r = acha(b.dataset.um); if (r) await escanear(r, true); desenharScan();
  }));
  t.querySelectorAll('[data-desfaz]').forEach(b => b.addEventListener('click', async () => {
    const r = acha(b.dataset.desfaz); if (r) await escanear(r, false); desenharScan();
  }));
}

/* ---------------- Diálogo da pessoa ---------------- */

function dlgPessoa(fid) {
  const f = pessoa(fid);
  if (!f) return;
  const p = pendenciasDe(fid, est.de, est.ate, est.tipo);
  const sc = regs().filter(r => r.funcionario_id === fid && faltaEscanear(r)).sort(ordemReg);
  const dlg = $('dlgBd');
  $('dlgBdCorpo').innerHTML = `<h3>${esc(f.nome)}</h3>
    <p class="dc-sem">${esc(f.fazenda || 'sem fazenda')}${f.cargo ? ' · ' + esc(f.cargo) : ''} · ${nDoc(p.length)} pendente(s)</p>
    ${p.length ? `<table class="dc-planilha"><thead><tr><th>Mês</th><th>Documento</th><th>Situação</th><th></th></tr></thead><tbody>
      ${p.map(r => `<tr><td>${rotMes(r.competencia)}</td><td>${esc(DOCS[r.documento].rot)}</td>
        <td><span class="bd-dt ${SIT[r.situacao].cls}">${SIT[r.situacao].rot}</span></td>
        <td class="ce"><button class="btn mini" type="button" data-chegou="${esc(r.chave)}">${r.situacao === 'correcao' ? 'Voltou corrigido' : 'Chegou hoje'}</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="vazio">Nada pendente.</div>'}
    ${sc.length ? `<p class="dc-sem" style="margin-top:8px">Entregues e ainda sem escanear: ${sc.map(r => esc(`${rotMes(r.competencia)} · ${DOCS[r.documento].curto}`)).join(', ')}.</p>` : ''}
    <label class="campo plena" style="margin-top:10px">Recado para o WhatsApp
      <textarea id="dmZapTexto" rows="7" readonly>${esc(textoZap(fid, est.de, est.ate, est.tipo))}</textarea></label>
    <div class="barra entre" style="margin-top:10px"><button class="btn" type="button" id="dmDlgFechar">Fechar</button>
      <span><button class="btn mini" type="button" id="dmCopiar">Copiar texto</button>
      <button class="btn mini btn-zap" type="button" id="dmDlgZap"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button>
      <button class="btn principal" type="button" id="dmDlgRel">Relatório individual</button></span></div>`;
  if (!dlg.open) dlg.showModal();
  $('dmDlgFechar').addEventListener('click', () => dlg.close());
  $('dmCopiar').addEventListener('click', async () => {
    const t = $('dmZapTexto').value;
    try { await navigator.clipboard.writeText(t); avisar('Texto copiado — é só colar na conversa.', true); }
    catch { $('dmZapTexto').select(); document.execCommand?.('copy'); avisar('Texto selecionado — use Ctrl+C.', true); }
  });
  $('dmDlgZap').addEventListener('click', () => window.open(linkZap(textoZap(fid, est.de, est.ate, est.tipo)), '_blank', 'noopener'));
  $('dmDlgRel').addEventListener('click', () => {
    dlg.close();
    const barra = !$('telaDmMes')?.hidden ? 'dmBarraMes' : 'dmBarraPainel';
    mostrarDoc(relIndividual(fid, est.de, est.ate, est.tipo), barra);
  });
  $('dlgBdCorpo').querySelectorAll('[data-chegou]').forEach(b => b.addEventListener('click', async () => {
    const r = regs().find(x => x.chave === b.dataset.chegou);
    if (!r) return;
    await marcar(fid, r.competencia, r.documento, 'entregue', { entregue_em: hoje() });
    avisar(`${DOCS[r.documento].rot} de ${rotMes(r.competencia)} ${r.situacao === 'correcao' ? 'voltou corrigido' : 'chegou'} em ${br(hoje())}.`, true);
    dlgPessoa(fid);
    redesenharAberta();
  }));
}

/* ---------------- resumo para o Painel do DP ---------------- */
export function resumoPainel() {
  const pend = regs().filter(r => ehPend(r.situacao));
  return { pendentes: pend.length, pessoas: new Set(pend.map(r => r.funcionario_id)).size,
    naoEntregue: pend.filter(r => r.situacao === 'nao_entregue').length,
    correcao: pend.filter(r => r.situacao === 'correcao').length,
    escanear: regs().filter(faltaEscanear).length };
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */
export function ligarDocumentos(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}
export function limparDocumentos() {
  carregado = false;
  Object.assign(est, { mes: null, busca: '', fazenda: [], de: '', ate: '', pFaz: [], tipo: '', sDe: '', sAte: '', sFaz: [], sTodos: false, sel: new Set() });
}
