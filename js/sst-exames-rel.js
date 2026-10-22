// sst-exames-rel.js — SST › Exames › Relatório por funcionário (22/10/2026).
//
// Pedido dele: um relatório com os funcionários, a função e os exames que
// precisam ser feitos. Para cada funcionário ativo sai o ASO e cada exame que
// a função (Exames por função) e as atividades dele exigem, com o último
// realizado, quando vence e a situação. A conta vem de retratoExames(), no
// js/sst.js — a mesma base do painel e dos vencimentos.
//
// Duas saídas, como todo relatório do app: documento (prévia antes de
// imprimir) e CSV.
import { LOGO, PE_LOP } from './seed.js';
import { retratoExames } from './sst.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const chave = v => so(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

let BASE = [];           // [{ f, linhas, semLista }]
let atual = [];          // o recorte que está na tela

/* Situação de uma linha, com o que pesa para "precisa fazer". */
function situacao(l, prazo) {
  if (l.nunca) return { txt: 'Nunca feito', curto: 'Nunca feito', cor: 'perigo', classe: 'vencido', precisa: true, ordem: 0 };
  const s = l.sit;
  if (!s || s.chave === 'semvalidade') return { txt: 'Sem validade', curto: 'Sem validade', cor: 'neutra', classe: 'semvalidade', precisa: false, ordem: 4 };
  if (s.dias < 0) return { txt: `Vencido há ${-s.dias} dia(s)`, curto: `Vencido (${-s.dias} d)`, cor: 'perigo', classe: 'vencido', precisa: true, ordem: 1 };
  if (s.dias <= prazo) return { txt: s.dias === 0 ? 'Vence hoje' : `Vence em ${s.dias} dia(s)`, curto: s.dias === 0 ? 'Vence hoje' : `Vence em ${s.dias} d`, cor: 'alerta', classe: 'vencendo', precisa: true, ordem: 2 };
  return { txt: 'Em dia', curto: 'Em dia', cor: 'ativo', classe: 'emdia', precisa: false, ordem: 3 };
}

export async function abrirRelExames() {
  const caixa = $('erTabela');
  caixa.innerHTML = '<div class="vazio">Carregando…</div>';
  try { BASE = await retratoExames(); }
  catch (e) { caixa.innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`; return; }
  preencherFiltros();
  desenhar();
}

function preencherFiltros() {
  const opc = (sel, valores, todos) => {
    const antes = sel.value;
    const unicos = new Map();
    valores.filter(Boolean).forEach(v => { if (!unicos.has(chave(v))) unicos.set(chave(v), so(v)); });
    const lista = [...unicos.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    sel.innerHTML = `<option value="">${todos}</option>` +
      lista.map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
    sel.value = lista.some(([k]) => k === antes) ? antes : '';
  };
  opc($('erFazenda'), BASE.map(p => p.f.fazenda), 'Todas');
  opc($('erFuncao'), BASE.map(p => p.f.cargo), 'Todas');
}

function recortar() {
  const faz = $('erFazenda').value, fun = $('erFuncao').value;
  const q = chave($('erBusca').value);
  const prazo = Number($('erPrazo').value) || 60;
  const soPend = $('erMostrar').value === 'pendentes';
  return BASE
    .filter(p => (!faz || chave(p.f.fazenda) === faz) && (!fun || chave(p.f.cargo) === fun)
      && (!q || chave(p.f.nome).includes(q)))
    .map(p => {
      const linhas = p.linhas.map(l => ({ ...l, s: situacao(l, prazo) }))
        .filter(l => !soPend || l.s.precisa)
        .sort((a, b) => (a.exame === 'ASO' ? -1 : b.exame === 'ASO' ? 1 : 0) || a.s.ordem - b.s.ordem
          || a.exame.localeCompare(b.exame, 'pt-BR'));
      return { ...p, linhas };
    })
    .filter(p => p.linhas.length);
}

function textoRecorte() {
  const nome = id => { const s = $(id); return s.value ? s.options[s.selectedIndex].text : ''; };
  const partes = [];
  if (nome('erFazenda')) partes.push(nome('erFazenda'));
  if (nome('erFuncao')) partes.push(nome('erFuncao'));
  partes.push($('erMostrar').value === 'pendentes'
    ? `a fazer (vencidos, nunca feitos e vencendo em até ${$('erPrazo').value} dias)` : 'todos os exames');
  return partes.join(' · ');
}

function desenhar() {
  $('erSaida').innerHTML = '';
  atual = recortar();
  const prazoOn = $('erMostrar').value === 'pendentes';
  $('erPrazo').disabled = !prazoOn;

  const linhas = atual.flatMap(p => p.linhas);
  const conta = c => linhas.filter(l => l.s.classe === c && !(c === 'vencido' && l.nunca)).length;
  const nunca = linhas.filter(l => l.nunca).length;
  const semLista = BASE.filter(p => p.semLista);
  $('erResumo').innerHTML = `
    <span class="contagem"><b>${atual.length}</b> funcionário(s)</span>
    <span class="contagem"><b>${nunca}</b> nunca feito(s)</span>
    <span class="contagem"><b>${conta('vencido')}</b> vencido(s)</span>
    <span class="contagem"><b>${conta('vencendo')}</b> vencendo</span>`;
  $('erSemLista').hidden = !semLista.length;
  $('erSemLista').innerHTML = semLista.length
    ? `<b>${semLista.length} funcionário(s) com função sem exames cadastrados</b> (aqui só aparece o ASO deles): ` +
      semLista.map(p => `${esc(p.f.nome)} <span class="dc-sem">(${esc(p.f.cargo || 'sem função')})</span>`).join(' · ') +
      '. Monte a lista em <b>Exames por função</b>.'
    : '';

  $('erTabela').innerHTML = atual.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>Função</th><th>Exame</th>
      <th class="ce">Último</th><th class="ce">Vence</th><th class="ce">Situação</th>
    </tr></thead><tbody>
    ${atual.map(p => p.linhas.map((l, i) => `<tr${i === 0 ? ' class="er-novo"' : ''}>
        ${i === 0 ? `<td rowspan="${p.linhas.length}"><b>${esc(p.f.nome)}</b>
          ${p.f.fazenda ? `<br><span class="dc-sem">${esc(p.f.fazenda)}</span>` : ''}</td>
          <td rowspan="${p.linhas.length}">${esc(p.f.cargo || '—')}</td>` : ''}
        <td>${esc(l.exame)}${l.detalhe ? ` <span class="dc-sem">(${esc(l.detalhe)})</span>` : ''}</td>
        <td class="ce">${dataBr(l.realizado)}</td>
        <td class="ce">${dataBr(l.vence)}</td>
        <td class="ce"><span class="tag ${l.s.cor}">${esc(l.s.txt)}</span></td>
      </tr>`).join('')).join('')}
    </tbody></table>`
    : `<div class="vazio">${prazoOn ? 'Ninguém com exame a fazer nesse recorte. Tudo em ordem.' : 'Nenhum funcionário nesse recorte.'}</div>`;
}

/* =============== documento =============== */
/* Paginação por altura, não por número de linhas: a linha que mostra nome e
   função longos quebra em duas. Medido em A4 (Chrome, 8,5 pt): cabem 30
   "unidades" de linha simples por folha; linha com nome/função que quebra
   vale 2. Mexeu no CSS do .er-tab? Meça de novo. */
const UNIDADES_FOLHA = 30;
const pesoLinha = (x, mostra) => mostra && (so(x.p.f.nome).length > 22 || so(x.p.f.cargo).length > 17) ? 2 : 1;

function paginar(plano) {
  const paginas = [];
  let atualP = [], soma = 0;
  plano.forEach(x => {
    const peso = pesoLinha(x, x.primeira || !atualP.length);
    if (atualP.length && soma + peso > UNIDADES_FOLHA) {
      paginas.push(atualP); atualP = []; soma = 0;
    }
    soma += pesoLinha(x, x.primeira || !atualP.length);
    atualP.push(x);
  });
  if (atualP.length) paginas.push(atualP);
  return paginas.length ? paginas : [[]];
}

function documento() {
  // linhas achatadas; o nome do funcionário sai na primeira linha dele de cada folha
  const plano = atual.flatMap(p => p.linhas.map((l, i) => ({ p, l, primeira: i === 0 })));
  const paginas = paginar(plano);
  const total = paginas.length;
  const recorte = textoRecorte();
  const folhas = [];
  for (let n = 0; n < total; n++) {
    const fatia = paginas[n];
    folhas.push(`<div class="an-folha">
      <div class="an-topo">
        <img src="${LOGO}" alt="">
        <div class="an-tit">
          <h1>EXAMES POR FUNCIONÁRIO</h1>
          <p>${esc(recorte)} · ${dataBr(hoje())}</p>
        </div>
      </div>
      ${fatia.length ? `<table class="an-tab sst-folha-tab er-tab">
        <colgroup><col style="width:44mm"><col style="width:34mm"><col><col style="width:19mm"><col style="width:19mm"><col style="width:24mm"></colgroup>
        <thead><tr><th>FUNCIONÁRIO</th><th>FUNÇÃO</th><th>EXAME</th><th>ÚLTIMO</th><th>VENCE</th><th>SITUAÇÃO</th></tr></thead>
        <tbody>${fatia.map((x, i) => {
          const mostra = x.primeira || i === 0;
          return `<tr class="${x.primeira && i ? 'er-novo' : ''}">
            <td class="an-nome">${mostra ? esc(x.p.f.nome) : ''}</td>
            <td>${mostra ? esc(x.p.f.cargo || '—') : ''}</td>
            <td>${esc(x.l.exame)}</td>
            <td class="ce">${dataBr(x.l.realizado)}</td>
            <td class="ce">${dataBr(x.l.vence)}</td>
            <td class="ce sst-${x.l.s.classe}">${esc(x.l.s.curto)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="pn-nada">Ninguém com exame a fazer nesse recorte.</p>'}
      <div class="an-pe"><span>${atual.length} funcionário(s) · página ${n + 1} de ${total}</span><span>SAKUMA Agronegócios</span></div>
      ${PE_LOP}
    </div>`);
  }
  return folhas.join('');
}

function baixarCsv() {
  const cel = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const linhas = [['Funcionário', 'Matrícula', 'Fazenda', 'Função', 'Exame', 'Último', 'Vence', 'Situação']];
  atual.forEach(p => p.linhas.forEach(l => linhas.push([
    p.f.nome, p.f.matricula || '', p.f.fazenda || '', p.f.cargo || '',
    l.exame + (l.detalhe ? ` (${l.detalhe})` : ''),
    l.realizado ? dataBr(l.realizado) : '', l.vence ? dataBr(l.vence) : '', l.s.txt,
  ])));
  const csv = linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `exames-por-funcionario-${hoje()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function ligarRelExames() {
  ['erFazenda', 'erFuncao', 'erMostrar', 'erPrazo'].forEach(id => $(id).addEventListener('change', desenhar));
  $('erBusca').addEventListener('input', desenhar);
  $('bErDoc').addEventListener('click', () => {
    $('erSaida').innerHTML = documento();
    $('erSaida').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('bErCsv').addEventListener('click', baixarCsv);
  $('bImprimirEr').addEventListener('click', () => {
    // prévia antes de imprimir: sem documento na tela, mostra primeiro
    if (!so($('erSaida').innerHTML)) {
      $('erSaida').innerHTML = documento();
      $('erSaida').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.print();
  });
}

export const limparRelExames = () => { BASE = []; atual = []; };
