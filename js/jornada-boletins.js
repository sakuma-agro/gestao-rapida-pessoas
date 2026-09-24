// jornada-boletins.js — DP → Boletins diários (24/09/2026)
//
// Substitui a planilha "Controle_Entrega_Boletim.xlsx": marca, dia a dia, quem
// entregou o boletim de serviço e, de quem não entregou, emite o relatório
// individual do que falta (folha A4 + texto pronto para o WhatsApp).
//
// Decisões do Guilherme em 24/09/2026:
//   • situações da planilha: Entregou (1), Não entregou (0), Faltou, Férias,
//     Afastado — o "2" da planilha era erro e não existe aqui; Folga entrou
//     para o dia de semana sem serviço não ficar "sem marcação" para sempre;
//   • quem aparece: só ATIVOS do Campo (setor de regime "boletim" no vínculo
//     ou, sem vínculo, setor CAMPO no cadastro). Administrativo fica de fora;
//   • nada importado da planilha — começa do zero;
//   • relatório individual em PDF A4 no padrão SAKUMA + texto para o WhatsApp.
//
// O que o app preenche sozinho (em itálico na tela; marcar por cima vale mais):
//   • boletim lançado na Gestão de jornada naquele dia → Entregou;
//   • afastamento lançado em DP → Férias e afastamentos → Afastado;
//   • férias lançadas → Férias.
// Domingo e feriado não cobram boletim — dá para marcar, mas o vazio não pesa.
//
// Banco: jor_bol_entregas (chave = funcionario_id|AAAA-MM-DD), RLS
// app_pode('jornada'). O "não entregou" que chega depois vira Entregou com
// entregue_em = dia em que chegou: some das pendências e fica o atraso.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];
const SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const SEM_CURTA = ['dom','seg','ter','qua','qui','sex','sáb'];
const SEM_LETRA = ['D','S','T','Q','Q','S','S'];

/* ---------------- datas (texto AAAA-MM-DD, sem fuso) ---------------- */
const D = s => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDias = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = s => D(s).getUTCDay();
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const brCurto = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
const fimDoMes = ym => iso(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)));
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();

/* ---------------- situações ---------------- */
export const SIT = {
  entregou:     { rot: 'Entregou',     curto: '✓',  cls: 'bd-ok' },
  nao_entregou: { rot: 'Não entregou', curto: '✗',  cls: 'bd-nao' },
  faltou:       { rot: 'Faltou',       curto: 'FT', cls: 'bd-falta' },
  ferias:       { rot: 'Férias',       curto: 'FE', cls: 'bd-neutro' },
  afastado:     { rot: 'Afastado',     curto: 'AF', cls: 'bd-neutro' },
  folga:        { rot: 'Folga',        curto: 'FG', cls: 'bd-neutro' },
};
const ORDEM = Object.keys(SIT);

/* ---------------- quem entra ---------------- */
const pessoa = id => estado.funcionarios.find(f => f.id === id) || null;
const ativa = f => (f.situacao || 'ATIVO') === 'ATIVO';
const doCampo = f => {
  const s = jd.setorDe(jd.vinculoDe(f.id));
  if (s) return s.regime === 'boletim';
  return String(f.setor || '').trim().toUpperCase() === 'CAMPO';
};
export const equipe = () => estado.funcionarios.filter(f => ativa(f) && doCampo(f))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const admissao = f => (f?.admissao || '').slice(0, 10) || null;

const municipioDe = fid => jd.fazendaDe(jd.unidadeDe(jd.vinculoDe(fid)))?.municipio || null;
export const feriado = (d, fid) => jd.feriadoEm(d, fid ? municipioDe(fid) : null);
/** Domingo ou feriado: dá para marcar, mas o vazio não é cobrado. */
export const naoCobra = (d, fid) => dow(d) === 0 || !!feriado(d, fid);

/* ---------------- a situação de um dia ---------------- */
const chave = (fid, d) => `${fid}|${d}`;
const marcacao = (fid, d) => (jd.dados.bolEntregas || []).find(x => x.chave === chave(fid, d)) || null;
const fimAfast = a => a.fim_real || a.fim_previsto || '9999-12-31';

/**
 * O que vale naquele dia para aquela pessoa.
 * origem: 'marcado' (alguém marcou) · 'jornada' · 'dp' (férias/afastamento) · null
 */
export function situacaoDia(fid, d) {
  const m = marcacao(fid, d);
  if (m) return { sit: m.situacao, origem: 'marcado', reg: m };
  if ((jd.dados.bolJornada || []).some(b => b.funcionario_id === fid && b.data_fato === d))
    return { sit: 'entregou', origem: 'jornada' };
  if ((jd.dados.afastamentos || []).some(a => a.funcionario_id === fid && a.situacao !== 'cancelado' &&
      a.data_ini <= d && fimAfast(a) >= d)) return { sit: 'afastado', origem: 'dp' };
  if ((jd.dados.feriasGozos || []).some(g => g.funcionario_id === fid && g.situacao === 'lancado' &&
      g.data_ini <= d && g.data_fim >= d)) return { sit: 'ferias', origem: 'dp' };
  return { sit: null, origem: null };
}
const ORIGEM_TXT = { jornada: 'boletim lançado na Gestão de jornada', dp: 'lançado em Férias e afastamentos' };

/** Pendências (não entregou em aberto) de uma pessoa, em ordem de data. */
export const pendenciasDe = (fid, ini = '', fim = '') => (jd.dados.bolEntregas || [])
  .filter(x => x.funcionario_id === fid && x.situacao === 'nao_entregou' &&
    (!ini || x.data >= ini) && (!fim || x.data <= fim))
  .sort((a, b) => a.data.localeCompare(b.data));

/** Todas as pessoas com pendência — inclusive quem saiu do Campo ou foi desligado. */
function comPendencia(ini, fim, fazenda) {
  const ids = [...new Set((jd.dados.bolEntregas || []).filter(x => x.situacao === 'nao_entregou').map(x => x.funcionario_id))];
  return ids.map(id => ({ f: pessoa(id), p: pendenciasDe(id, ini, fim) }))
    .filter(x => x.f && x.p.length && casaFazenda(x.f, fazenda))
    .sort((a, b) => b.p.length - a.p.length || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
}

/* O controle começou no dia da primeira marcação (nada foi importado da
   planilha). Antes dela, dia vazio não é cobrado — senão o app estrearia
   com centenas de "sem marcação". */
const inicioControle = () => (jd.dados.bolEntregas || []).reduce((m, x) => !m || x.data < m ? x.data : m, null) || hoje();

/** Dias cobrados (seg–sáb, fora feriado, desde o início do controle e a admissão, até hoje) sem nada. */
function semMarcacao(lista, ini, fim) {
  const r = [];
  const ate = fim < hoje() ? fim : hoje();
  if (ini < inicioControle()) ini = inicioControle();
  for (const f of lista) {
    const adm = admissao(f);
    for (let d = ini; d <= ate; d = addDias(d, 1)) {
      if (adm && d < adm) continue;
      if (naoCobra(d, f.id)) continue;
      if (!situacaoDia(f.id, d).sit) r.push({ f, d });
    }
  }
  return r;
}

const casaFazenda = (f, fz) => !fz || (fz === '-' ? !f.fazenda : f.fazenda === fz);
const fazendas = () => [...new Set(equipe().map(f => f.fazenda).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* ---------------- escrita ---------------- */
async function marcar(fid, d, sit, extra = {}) {
  const k = chave(fid, d);
  if (!sit) { await jd.apagar('bolEntregas', k); return; }
  const antes = marcacao(fid, d);
  await jd.salvar('bolEntregas', {
    chave: k, funcionario_id: fid, data: d, situacao: sit,
    observacao: extra.observacao ?? antes?.observacao ?? null,
    entregue_em: sit === 'entregou' ? (extra.entregue_em ?? (antes?.situacao === 'nao_entregou' && d < hoje() ? hoje() : antes?.entregue_em ?? null)) : null,
    marcado_por: usuario(), marcado_em: agora(),
  });
}

/* ---------------- carregamento ---------------- */
const carregados = new Set();
async function garantir(ini, fim, forcar = false) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados do DP: ' + e.message); }
  }
  const k = ini + '|' + fim;
  if (!forcar && carregados.has(k)) return;
  try { await jd.carregarEntregas(ini, fim); carregados.add(k); }
  catch (e) { avisar('Sem conexão: mostrando o que ficou guardado neste aparelho. ' + (e.message || '')); }
}

/* ===================================================================
   DOCUMENTOS
   =================================================================== */

function cabecalhoDoc(titulo, sub, direita) {
  return `<header class="rel-cabecalho">
    <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
    <div class="rel-comp">${direita}</div></header>`;
}
const rodapeLop = () => `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>`;
const assinaNota = () => `<p class="rel-nota">Emitido em ${br(hoje())} por ${esc(usuario() || '—')} · responsável: Guilherme Lopes, Gerente Administrativo.</p>`;
const rotPeriodo = (ini, fim) => !ini && !fim ? 'todas em aberto' : `${ini ? br(ini) : 'início'} a ${fim ? br(fim) : br(hoje())}`;
const campo = (rot, v) => `<div><span>${esc(rot)}</span><b>${esc(v || '—')}</b></div>`;

/** Relatório individual: o que a pessoa ainda não entregou. */
export function relIndividual(fid, ini = '', fim = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, ini, fim);
  return `<article class="rel">
    ${cabecalhoDoc('Boletins de serviço não entregues', 'Relatório individual do que falta entregar ao DP',
      `posição em<strong>${br(hoje())}</strong>${esc(rotPeriodo(ini, fim))}`)}
    <div class="rel-ficha">
      ${campo('Funcionário', f?.nome)}${campo('Nº de cadastro', f?.cadastro)}${campo('Função', f?.cargo)}
      ${campo('Fazenda', f?.fazenda)}${campo('Setor', f?.setor)}${campo('Admissão', admissao(f) ? br(admissao(f)) : '')}
    </div>
    <table class="rel-tabela"><thead><tr><th class="rel-num">Nº</th><th>Data</th><th>Dia da semana</th><th>Situação</th><th>Observação</th></tr></thead>
    <tbody>${p.map((x, i) => `<tr><td class="rel-num">${i + 1}</td><td>${br(x.data)}</td><td>${SEMANA[dow(x.data)]}</td>
      <td class="rel-pend">Não entregou</td><td>${esc(x.observacao || '')}</td></tr>`).join('')
      || '<tr><td colspan="5" class="rel-vazio">Nenhum boletim pendente.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total de boletins pendentes</td><td class="rel-num">${p.length}</td></tr></tfoot></table>
    <div class="rel-resumo">${p.length
      ? `<b>${p.length} boletim(ns) de serviço pendente(s).</b> Entregue ao DP os boletins das datas acima para regularizar o controle.`
      : '<b>Nada pendente.</b> Todos os boletins cobrados foram entregues.'}</div>
    ${assinaNota()}${rodapeLop()}</article>`;
}

/** Relatório geral: todos que têm pendência. */
export function relGeral(ini = '', fim = '', fazenda = '') {
  const l = comPendencia(ini, fim, fazenda);
  const tot = l.reduce((s, x) => s + x.p.length, 0);
  return `<article class="rel">
    ${cabecalhoDoc('Boletins de serviço não entregues', 'Todos os funcionários com boletim pendente',
      `posição em<strong>${br(hoje())}</strong>${esc(rotPeriodo(ini, fim))}${fazenda ? ' · ' + esc(fazenda === '-' ? 'sem fazenda' : fazenda) : ''}`)}
    <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th class="rel-num">Pendentes</th><th>Datas</th></tr></thead>
    <tbody>${l.map(x => `<tr><td>${esc(x.f.nome)}${ativa(x.f) ? '' : ' <span class="rel-mini">(inativo)</span>'}</td><td>${esc(x.f.fazenda || '—')}</td>
      <td class="rel-num">${x.p.length}</td><td>${x.p.map(y => brCurto(y.data)).join(', ')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="rel-vazio">Ninguém com boletim pendente.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="rel-num">${tot}</td><td>${l.length} pessoa(s)</td></tr></tfoot></table>
    ${assinaNota()}${rodapeLop()}</article>`;
}

/** O texto para o WhatsApp — o mesmo recado da "Área para enviar via Whatsapp". */
export function textoZap(fid, ini = '', fim = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, ini, fim);
  if (!p.length) return `*BOLETIM DE SERVIÇO*\n*${f?.nome || ''}*\n\nNenhum boletim pendente. Obrigado!`;
  return `*BOLETIM DE SERVIÇO*\n*${f?.nome || ''}*\n\nNão entregou:\n` +
    p.map(x => `• ${brCurto(x.data)} (${SEM_CURTA[dow(x.data)]})`).join('\n') +
    `\n\nTotal: ${p.length} boletim(ns) pendente(s). Favor entregar no DP.\n\nSAKUMA Agronegócios`;
}
const linkZap = t => `https://wa.me/?text=${encodeURIComponent(t)}`;

export function csvMes(ym, lista) {
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  const dias = diasDoMes(ym);
  const cols = ['Funcionario', 'Fazenda', ...dias.map(d => brCurto(d)), 'Nao entregou'];
  const linhas = lista.map(f => {
    let n = 0;
    const cel = dias.map(d => { const s = situacaoDia(f.id, d).sit; if (s === 'nao_entregou') n++; return s ? SIT[s].rot : ''; });
    return [f.nome, f.fazenda || '', ...cel, n];
  });
  return { nome: `Boletins_${ym}.csv`, conteudo: '﻿' + [cols, ...linhas].map(l => l.map(q).join(';')).join('\r\n') };
}
function baixarCSV({ nome, conteudo }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8;' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* Prévia no #jorImpressao, como os outros documentos do app. Quem limpa na
   troca de tela é o limparPrevias() do app.js, que chama fecharDocBoletins(). */
let barraAtual = null;
function mostrarDoc(html, barraId) {
  const alvo = $('jorImpressao');
  alvo.innerHTML = html;
  alvo.hidden = false;
  if (barraAtual && barraAtual !== barraId && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = barraId;
  if ($(barraId)) $(barraId).hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function fecharDocBoletins() {
  if (barraAtual && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = null;
}
function fecharPrevia() {
  const alvo = $('jorImpressao');
  alvo.innerHTML = ''; alvo.hidden = true;
  fecharDocBoletins();
}
function imprimirDoc() {
  document.body.classList.add('jor-imprimindo');
  const soltar = () => { document.body.classList.remove('jor-imprimindo'); removeEventListener('afterprint', soltar); };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);
}
/* Div sem classe em volta: .jor-acoes tem display próprio e venceria o hidden. */
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
const est = { dia: null, mes: null, busca: '', fazenda: '', pIni: '', pFim: '', pFaz: '' };

function cabecalho(titulo, sub, direita) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">${direita}</div></header>`;
}
const filtros = (idBusca, idFaz) => `
  <input id="${idBusca}" type="search" placeholder="Buscar funcionário" value="${esc(est.busca)}">
  <select id="${idFaz}" class="dc-mini bd-sel" aria-label="Fazenda">
    <option value="">Todas as fazendas</option>
    ${fazendas().map(z => `<option ${est.fazenda === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}
    <option value="-" ${est.fazenda === '-' ? 'selected' : ''}>Sem fazenda</option>
  </select>`;
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const filtrada = () => equipe().filter(f => casaFazenda(f, est.fazenda) &&
  (!est.busca || normal(f.nome + ' ' + (f.apelido || '')).includes(normal(est.busca))));
function ligarFiltros(idBusca, idFaz, redesenhar) {
  $(idBusca)?.addEventListener('input', ev => {
    est.busca = ev.target.value; redesenhar();
    const el = $(idBusca); el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {}
  });
  $(idFaz)?.addEventListener('change', ev => { est.fazenda = ev.target.value; redesenhar(); });
}

export async function abrirBoletins(tela) {
  if (!est.dia) est.dia = hoje();
  if (!est.mes) est.mes = hoje().slice(0, 7);
  if (tela === 'bdDia') {
    await garantir(est.dia.slice(0, 8) + '01', fimDoMes(est.dia.slice(0, 7)), true);
    desenharDia();
  }
  if (tela === 'bdMes') {
    await garantir(est.mes + '-01', fimDoMes(est.mes), true);
    desenharMes();
  }
  if (tela === 'bdPend') {
    const ini = addDias(hoje(), -45);
    await garantir(ini, hoje(), true);
    desenharPend();
  }
}

/* ---------------- Marcar o dia ---------------- */

function desenharDia() {
  const d = est.dia;
  const todos = equipe().filter(f => !admissao(f) || admissao(f) <= d);
  const lista = filtrada().filter(f => !admissao(f) || admissao(f) <= d);
  const cont = { entregou: 0, nao_entregou: 0, outros: 0, vazio: 0 };
  todos.forEach(f => {
    const s = situacaoDia(f.id, d).sit;
    if (!s) { if (!naoCobra(d, f.id)) cont.vazio++; }
    else if (s === 'entregou' || s === 'nao_entregou') cont[s]++;
    else cont.outros++;
  });
  const fer = feriado(d);
  const vazios = lista.filter(f => !situacaoDia(f.id, d).sit);
  const aviso = dow(d) === 0 ? 'Domingo — dia sem boletim. Marque só quem trabalhou.'
    : fer ? `Feriado (${esc(fer.nome)}) — dia sem boletim. Marque só quem trabalhou.` : '';

  $('telaBdDia').innerHTML = cabecalho('Boletins diários', 'Marque quem entregou o boletim de serviço do dia',
    `dia<strong class="jor-cabecalho__competencia">${br(d)}</strong>${SEMANA[dow(d)]}`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <span class="bd-dia">
          <button class="btn mini" type="button" id="bdAnt" aria-label="Dia anterior">◀</button>
          <input type="date" id="bdData" value="${d}" max="${hoje()}">
          <button class="btn mini" type="button" id="bdProx" aria-label="Próximo dia" ${d >= hoje() ? 'disabled' : ''}>▶</button>
          ${d !== hoje() ? '<button class="btn mini" type="button" id="bdHoje">Hoje</button>' : ''}
        </span>
        ${filtros('bdBusca', 'bdFaz')}
      </div>
      ${aviso ? `<div class="jor-caixa">${aviso}</div>` : ''}
      <div class="pv-cards bd-cards">
        <div class="pv-card pv-calma"><span>Entregou</span><strong>${cont.entregou}</strong><small>de ${todos.length} no Campo</small></div>
        <div class="pv-card ${cont.nao_entregou ? 'pv-perigo' : 'pv-ok'}"><span>Não entregou</span><strong>${cont.nao_entregou}</strong><small>entra nas pendências</small></div>
        <div class="pv-card pv-ok"><span>Faltou · férias · afast. · folga</span><strong>${cont.outros}</strong><small>não cobra boletim</small></div>
        <div class="pv-card ${cont.vazio ? 'pv-alerta' : 'pv-ok'}"><span>Sem marcação</span><strong>${cont.vazio}</strong><small>${cont.vazio ? 'falta marcar' : 'dia completo'}</small></div>
      </div>
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="bdTodos" ${vazios.length ? '' : 'disabled'}>Marcar ${vazios.length} sem marcação como Entregou</button>
        <span class="dc-sem bd-dica">Depois, troque só as exceções.</span>
      </div>
      <div class="bd-lista">
        ${lista.map(f => {
          const s = situacaoDia(f.id, d);
          const auto = s.origem && s.origem !== 'marcado';
          const atraso = s.reg?.entregue_em && s.reg.entregue_em > d;
          return `<div class="bd-linha">
            <div class="bd-quem"><b>${esc(f.nome)}</b>
              <span class="dc-sem">${esc(f.fazenda || 'sem fazenda')}${auto ? ` · <i>${esc(ORIGEM_TXT[s.origem])}</i>` : ''}${
                atraso ? ` · <span class="tag alerta">chegou em ${br(s.reg.entregue_em)}</span>` : ''}</span></div>
            <div class="bd-botoes" role="group" aria-label="Situação de ${esc(f.nome)}">
              ${ORDEM.map(k => `<button type="button" class="bd-op ${SIT[k].cls} ${auto && s.sit === k ? 'bd-auto' : ''}"
                data-fid="${f.id}" data-sit="${k}" aria-pressed="${s.sit === k}">${SIT[k].rot}</button>`).join('')}
            </div></div>`;
        }).join('') || '<div class="vazio">Ninguém do Campo com esse filtro.</div>'}
      </div>
      <p class="dc-sem jor-nota">Clique de novo no botão marcado para desmarcar. Em itálico é o que o app preencheu sozinho
        (boletim lançado na Gestão de jornada, férias ou afastamento) — marcar por cima vale mais.
        Só aparece quem está ativo no Campo.</p>
    </div>`;

  const irDia = n => { est.dia = n; abrirBoletins('bdDia'); };
  $('bdAnt').addEventListener('click', () => irDia(addDias(d, -1)));
  $('bdProx').addEventListener('click', () => { if (d < hoje()) irDia(addDias(d, 1)); });
  $('bdHoje')?.addEventListener('click', () => irDia(hoje()));
  $('bdData').addEventListener('change', ev => { const v = ev.target.value; if (v && v <= hoje()) irDia(v); });
  ligarFiltros('bdBusca', 'bdFaz', desenharDia);
  $('bdTodos').addEventListener('click', async () => {
    const alvo = filtrada().filter(f => (!admissao(f) || admissao(f) <= d) && !situacaoDia(f.id, d).sit);
    for (const f of alvo) await marcar(f.id, d, 'entregou');
    avisar(`${alvo.length} marcado(s) como Entregou em ${br(d)}.` + (navigator.onLine ? '' : ' Sem rede — vai subir sozinho.'), true);
    desenharDia();
  });
  document.querySelectorAll('#telaBdDia .bd-op').forEach(b => b.addEventListener('click', async () => {
    const fid = b.dataset.fid, k = b.dataset.sit;
    const s = situacaoDia(fid, d);
    const nova = s.origem === 'marcado' && s.sit === k ? null : k;
    await marcar(fid, d, nova);
    desenharDia();
  }));
}

/* ---------------- Mês ---------------- */

const diasDoMes = ym => { const r = []; for (let d = ym + '-01', f = fimDoMes(ym); d <= f; d = addDias(d, 1)) r.push(d); return r; };

function desenharMes() {
  const ym = est.mes;
  const dias = diasDoMes(ym);
  const lista = filtrada();
  const h = hoje();
  const pendMes = lista.reduce((s, f) => s + dias.filter(d => situacaoDia(f.id, d).sit === 'nao_entregou').length, 0);
  const sm = semMarcacao(lista, ym + '-01', fimDoMes(ym)).length;
  const ini0 = inicioControle();

  $('telaBdMes').innerHTML = cabecalho('Boletins do mês', 'A grade da planilha: uma linha por pessoa, uma coluna por dia',
    `mês<strong class="jor-cabecalho__competencia">${MESES[+ym.slice(5) - 1]}/${ym.slice(0, 4)}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <input type="month" id="bdMesSel" value="${ym}" max="${h.slice(0, 7)}">
        ${filtros('bdBuscaMes', 'bdFazMes')}
        <button class="btn mini" type="button" id="bdCsvMes">Baixar o mês (CSV)</button>
      </div>
      ${sm ? `<div class="jor-caixa alerta"><b>${sm} dia(s) cobrado(s) sem marcação</b> neste mês (segunda a sábado, fora feriado). Aparecem com fundo amarelo.</div>` : ''}
      <div class="bd-legenda">${ORDEM.map(k => `<span><i class="bd-cel ${SIT[k].cls}">${SIT[k].curto}</i>${SIT[k].rot}</span>`).join('')}
        <span><i class="bd-cel bd-nc"></i>Domingo / feriado</span><span><i class="bd-cel bd-vazio-cob"></i>Sem marcação</span></div>
      <div class="bd-rola"><table class="bd-grade"><thead><tr><th class="bd-nome">Funcionário</th>
        ${dias.map(d => `<th class="${naoCobra(d) ? 'bd-nc' : ''}" title="${SEMANA[dow(d)]}${feriado(d) ? ' · ' + esc(feriado(d).nome) : ''}">${+d.slice(8)}<small>${SEM_LETRA[dow(d)]}</small></th>`).join('')}
        <th class="bd-tot" title="Não entregou no mês">✗</th></tr></thead><tbody>
        ${lista.map(f => {
          const adm = admissao(f);
          let n = 0;
          const cels = dias.map(d => {
            if (d > h || (adm && d < adm)) return `<td class="bd-fora"></td>`;
            const s = situacaoDia(f.id, d);
            if (s.sit === 'nao_entregou') n++;
            const nc = naoCobra(d, f.id);
            const cls = s.sit ? SIT[s.sit].cls : nc ? 'bd-nc' : d < ini0 ? '' : 'bd-vazio-cob';
            const tit = `${br(d)} · ${s.sit ? SIT[s.sit].rot : 'sem marcação'}${s.origem && s.origem !== 'marcado' ? ' (' + ORIGEM_TXT[s.origem] + ')' : ''}${
              s.reg?.entregue_em && s.reg.entregue_em > d ? ' · chegou em ' + br(s.reg.entregue_em) : ''}`;
            return `<td class="${cls}${s.origem && s.origem !== 'marcado' ? ' bd-auto' : ''}${s.reg?.entregue_em > d ? ' bd-atraso' : ''}">
              <button type="button" data-fid="${f.id}" data-d="${d}" title="${esc(tit)}">${s.sit ? SIT[s.sit].curto : ''}</button></td>`;
          }).join('');
          return `<tr><th class="bd-nome"><button type="button" class="bd-pessoa" data-pessoa="${f.id}">${esc(f.nome)}</button></th>${cels}
            <td class="bd-tot ${n ? 'bd-tem' : ''}">${n || ''}</td></tr>`;
        }).join('') || `<tr><td colspan="${dias.length + 2}" class="vazio">Ninguém do Campo com esse filtro.</td></tr>`}
      </tbody><tfoot><tr><th class="bd-nome">Não entregou no dia</th>
        ${dias.map(d => { const n = lista.filter(f => situacaoDia(f.id, d).sit === 'nao_entregou').length; return `<td>${n || ''}</td>`; }).join('')}
        <td class="bd-tot">${pendMes || ''}</td></tr></tfoot></table></div>
      ${barraDoc('bdBarraMes')}
      <p class="dc-sem jor-nota">Clique na célula para trocar a situação, na ordem da legenda (a última volta a vazio).
        Clique no nome para ver as pendências da pessoa e emitir o relatório. Célula com ponto marrom: boletim que chegou atrasado.</p>
    </div>`;

  $('bdMesSel').addEventListener('change', ev => { if (ev.target.value) { est.mes = ev.target.value; abrirBoletins('bdMes'); } });
  ligarFiltros('bdBuscaMes', 'bdFazMes', desenharMes);
  $('bdCsvMes').addEventListener('click', () => baixarCSV(csvMes(ym, lista)));
  ligarBarraDoc($('telaBdMes'));
  document.querySelectorAll('#telaBdMes td button[data-d]').forEach(b => b.addEventListener('click', async () => {
    const fid = b.dataset.fid, d = b.dataset.d;
    const s = situacaoDia(fid, d);
    const i = s.origem === 'marcado' ? ORDEM.indexOf(s.sit) : -1;
    await marcar(fid, d, ORDEM[i + 1] || null);
    const rola = document.querySelector('#telaBdMes .bd-rola');
    const x = rola?.scrollLeft || 0;
    desenharMes();
    const r2 = document.querySelector('#telaBdMes .bd-rola'); if (r2) r2.scrollLeft = x;
  }));
  document.querySelectorAll('#telaBdMes [data-pessoa]').forEach(b => b.addEventListener('click', () => dlgPessoa(b.dataset.pessoa)));
}

/* ---------------- Pendências ---------------- */

function desenharPend() {
  const l = comPendencia(est.pIni, est.pFim, est.pFaz);
  const tot = l.reduce((s, x) => s + x.p.length, 0);
  const ini30 = addDias(hoje(), -30);
  const sm = semMarcacao(equipe(), ini30, addDias(hoje(), -1));

  $('telaBdPend').innerHTML = cabecalho('Pendências de boletim', 'Quem não entregou — relatório individual e recado para o WhatsApp',
    `posição em<strong class="jor-cabecalho__competencia">${br(hoje())}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <label class="fer-filtro">De <input type="date" id="bdPIni" value="${est.pIni}" max="${hoje()}"></label>
        <label class="fer-filtro">até <input type="date" id="bdPFim" value="${est.pFim}" max="${hoje()}"></label>
        <select id="bdPFaz" class="dc-mini bd-sel" aria-label="Fazenda">
          <option value="">Todas as fazendas</option>
          ${fazendas().map(z => `<option ${est.pFaz === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}
        </select>
        ${est.pIni || est.pFim || est.pFaz ? '<button class="btn mini" type="button" id="bdPLimpa">Limpar filtro</button>' : ''}
      </div>
      <div class="pv-cards bd-cards">
        <div class="pv-card ${tot ? 'pv-perigo' : 'pv-ok'}"><span>Boletins pendentes</span><strong>${tot}</strong><small>${est.pIni || est.pFim ? 'no período' : 'todos em aberto'}</small></div>
        <div class="pv-card ${l.length ? 'pv-atencao' : 'pv-ok'}"><span>Pessoas devendo</span><strong>${l.length}</strong><small>com ao menos 1 boletim</small></div>
        <div class="pv-card ${sm.length ? 'pv-alerta' : 'pv-ok'}"><span>Sem marcação</span><strong>${sm.length}</strong><small>dias cobrados · últimos 30 dias</small></div>
      </div>
      ${sm.length ? `<div class="jor-caixa alerta"><b>${sm.length} dia(s) sem marcação</b> nos últimos 30 dias — enquanto não marcar, eles não viram pendência.
        <button class="btn mini" type="button" id="bdIrMes">Abrir o mês</button></div>` : ''}
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="bdRelGeral" ${l.length ? '' : 'disabled'}>Relatório geral (todos)</button>
      </div>
      ${barraDoc('bdBarraPend')}
      <div class="fer-rola"><table class="dc-planilha fer-tabela bd-pend"><thead><tr><th>Funcionário</th><th class="ce">Pendentes</th><th>Datas</th><th></th></tr></thead><tbody>
        ${l.map(x => `<tr class="fer-clica" data-pessoa="${x.f.id}" tabindex="0">
          <td><b>${esc(x.f.nome)}</b>${ativa(x.f) ? '' : ' <span class="tag inativo">inativo</span>'}<br><span class="dc-sem">${esc(x.f.fazenda || 'sem fazenda')}</span></td>
          <td class="ce"><span class="pv-num-perigo">${x.p.length}</span></td>
          <td>${x.p.slice(0, 8).map(y => brCurto(y.data)).join(', ')}${x.p.length > 8 ? ` <span class="dc-sem">+${x.p.length - 8}</span>` : ''}</td>
          <td class="bd-acoes-l"><button class="btn mini" type="button" data-rel="${x.f.id}">Relatório</button>
            <button class="btn mini btn-zap" type="button" data-zap="${x.f.id}"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button></td></tr>`).join('')
          || '<tr><td colspan="4" class="vazio">Ninguém com boletim pendente. 👏</td></tr>'}
      </tbody></table></div>
      <p class="dc-sem jor-nota">Clique na pessoa para ver as datas e dar baixa no boletim que chegou depois — ele sai da pendência e fica registrado o dia em que chegou.</p>
    </div>`;

  const setP = (k, v) => { est[k] = v; desenharPend(); };
  $('bdPIni').addEventListener('change', ev => setP('pIni', ev.target.value));
  $('bdPFim').addEventListener('change', ev => setP('pFim', ev.target.value));
  $('bdPFaz').addEventListener('change', ev => setP('pFaz', ev.target.value));
  $('bdPLimpa')?.addEventListener('click', () => { est.pIni = ''; est.pFim = ''; est.pFaz = ''; desenharPend(); });
  $('bdIrMes')?.addEventListener('click', () => { est.mes = sm[0].d.slice(0, 7); irPara('bdMes'); });
  $('bdRelGeral').addEventListener('click', () => mostrarDoc(relGeral(est.pIni, est.pFim, est.pFaz), 'bdBarraPend'));
  ligarBarraDoc($('telaBdPend'));
  const t = $('telaBdPend');
  t.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); mostrarDoc(relIndividual(b.dataset.rel, est.pIni, est.pFim), 'bdBarraPend');
  }));
  t.querySelectorAll('[data-zap]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); window.open(linkZap(textoZap(b.dataset.zap, est.pIni, est.pFim)), '_blank', 'noopener');
  }));
  t.querySelectorAll('tr[data-pessoa]').forEach(r => {
    r.addEventListener('click', () => dlgPessoa(r.dataset.pessoa));
    r.addEventListener('keydown', ev => { if (ev.key === 'Enter') dlgPessoa(r.dataset.pessoa); });
  });
}

/* ---------------- Diálogo da pessoa ---------------- */

function dlgPessoa(fid) {
  const f = pessoa(fid);
  if (!f) return;
  const p = pendenciasDe(fid, est.pIni, est.pFim);
  const dlg = $('dlgBd');
  $('dlgBdCorpo').innerHTML = `<h3>${esc(f.nome)}</h3>
    <p class="dc-sem">${esc(f.fazenda || 'sem fazenda')}${f.cargo ? ' · ' + esc(f.cargo) : ''} · ${p.length} boletim(ns) pendente(s)${
      est.pIni || est.pFim ? ' no período ' + esc(rotPeriodo(est.pIni, est.pFim)) : ''}</p>
    ${p.length ? `<table class="dc-planilha"><thead><tr><th>Data</th><th>Dia</th><th></th></tr></thead><tbody>
      ${p.map(x => `<tr><td>${br(x.data)}</td><td>${SEMANA[dow(x.data)]}</td>
        <td class="ce"><button class="btn mini" type="button" data-chegou="${x.data}">Chegou hoje</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="vazio">Nada pendente.</div>'}
    <label class="campo plena" style="margin-top:10px">Recado para o WhatsApp
      <textarea id="bdZapTexto" rows="7" readonly>${esc(textoZap(fid, est.pIni, est.pFim))}</textarea></label>
    <div class="barra entre" style="margin-top:10px"><button class="btn" type="button" id="bdDlgFechar">Fechar</button>
      <span><button class="btn mini" type="button" id="bdCopiar">Copiar texto</button>
      <button class="btn mini btn-zap" type="button" id="bdDlgZap"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button>
      <button class="btn principal" type="button" id="bdDlgRel">Relatório individual</button></span></div>`;
  if (!dlg.open) dlg.showModal();
  $('bdDlgFechar').addEventListener('click', () => dlg.close());
  $('bdCopiar').addEventListener('click', async () => {
    const t = $('bdZapTexto').value;
    try { await navigator.clipboard.writeText(t); avisar('Texto copiado — é só colar na conversa.', true); }
    catch { $('bdZapTexto').select(); document.execCommand?.('copy'); avisar('Texto selecionado — use Ctrl+C.', true); }
  });
  $('bdDlgZap').addEventListener('click', () => window.open(linkZap(textoZap(fid, est.pIni, est.pFim)), '_blank', 'noopener'));
  $('bdDlgRel').addEventListener('click', () => {
    dlg.close();
    const tela = !$('telaBdMes')?.hidden ? 'bdMes' : 'bdPend';
    mostrarDoc(relIndividual(fid, est.pIni, est.pFim), tela === 'bdMes' ? 'bdBarraMes' : 'bdBarraPend');
  });
  $('dlgBdCorpo').querySelectorAll('[data-chegou]').forEach(b => b.addEventListener('click', async () => {
    await marcar(fid, b.dataset.chegou, 'entregou', { entregue_em: hoje() });
    avisar(`Boletim de ${br(b.dataset.chegou)} baixado — chegou em ${br(hoje())}.`, true);
    dlgPessoa(fid);
    const aberta = ['bdPend', 'bdMes', 'bdDia'].find(t => !$('tela' + t[0].toUpperCase() + t.slice(1))?.hidden);
    if (aberta === 'bdPend') desenharPend();
    if (aberta === 'bdMes') desenharMes();
  }));
}

/* ---------------- resumo para o Painel do DP ---------------- */
export function resumoPainel() {
  const pend = (jd.dados.bolEntregas || []).filter(x => x.situacao === 'nao_entregou');
  return { pendentes: pend.length, pessoas: new Set(pend.map(x => x.funcionario_id)).size };
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */

export function ligarBoletins(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}

export function limparBoletins() {
  carregados.clear();
  Object.assign(est, { dia: null, mes: null, busca: '', fazenda: '', pIni: '', pFim: '', pFaz: '' });
}
