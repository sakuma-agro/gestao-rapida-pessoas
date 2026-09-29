// cad-relatorios.js — Cadastros › Relatórios (29/09/2026)
//
// Mesmo formato do DP › Relatórios, a pedido dele: filtros no alto, uma aba
// por assunto e, em cada relatório, Visualizar, Imprimir e Excel. Tudo sai do
// cadastro de funcionários (estado.funcionarios) — não depende do RH nem do DP.
//
// Documentos no padrão SAKUMA (verde #84BD00, marrom #744F28, cinza #51534A,
// Arial, sem preto), marca no alto e LOP no rodapé, como os do DP e do RH.

import { estado } from './store.js';
import { montarMulti } from './multisel.js';
import { mostrar, imprimir } from './jornada-relatorios.js';
import { quadroPara } from './rh.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const anosDesde = iso => {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const [ha, hm, hd] = hoje().split('-').map(Number);
  let n = ha - a;
  if (hm < m || (hm === m && hd < d)) n--;
  return n >= 0 ? n : null;
};
const tempoCasa = iso => {
  const n = anosDesde(iso);
  if (n == null) return '';
  return n === 0 ? 'menos de 1 ano' : n === 1 ? '1 ano' : `${n} anos`;
};
const limpo = s => String(s || '').trim();
const cpfBR = c => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : limpo(c);
};

/* ---------------- filtros ---------------- */

const est = {
  aba: 'equipe',
  situacao: 'ATIVO',
  empregador: '',
  fazendas: [],
  mes: new Date().getMonth(),
};

const doFiltro = () => estado.funcionarios.filter(f =>
  (!est.situacao || (f.situacao || 'ATIVO') === est.situacao) &&
  (!est.empregador || limpo(f.empregador) === est.empregador) &&
  (!est.fazendas.length || est.fazendas.some(z => z === '-' ? !limpo(f.fazenda) : limpo(f.fazenda) === z)))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const valores = campo => [...new Set(estado.funcionarios.map(f => limpo(f[campo])).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));

const rotSituacao = () => est.situacao === 'ATIVO' ? 'só ativos' : est.situacao === 'INATIVO' ? 'só inativos' : 'ativos e inativos';
const rotFazendas = () => est.fazendas.length
  ? est.fazendas.map(z => z === '-' ? 'sem fazenda' : z).join(', ') : 'todas as fazendas';
const recorte = () => [est.empregador, rotFazendas(), rotSituacao()].filter(Boolean).join(' · ');

/* ---------------- moldura do documento ---------------- */

function documento({ titulo, subtitulo, corpo, paisagem = false }) {
  return `
  <article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>${esc(titulo)}</h1>
        <p>${esc(subtitulo)}</p>
      </div>
      <div class="rel-comp">
        <span>emitido em</span>
        <strong>${br(hoje())}</strong>
        <span>${esc(recorte())}</span>
      </div>
    </header>
    ${corpo}
    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

const tabela = (cols, linhas, total, vazio = 'Ninguém neste recorte.') => `
  <table class="rel-tabela">
    <thead><tr>${cols.map(c => `<th${c.num ? ' class="rel-num"' : ''}>${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.length ? linhas.map(l => `<tr>${l.map((v, i) =>
      `<td${cols[i].num ? ' class="rel-num"' : ''}>${v}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="rel-vazio">${vazio}</td></tr>`}</tbody>
    ${total ? `<tfoot><tr><td colspan="${cols.length}">${total}</td></tr></tfoot>` : ''}
  </table>`;

function baixarCsv(nome, linhas) {
  const limpar = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = linhas.map(l => l.map(limpar).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const nomeArq = base => `${base}-${recorte().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${hoje()}.csv`;

/* ---------------- os relatórios ---------------- */

/* Quadro de pessoal: o mesmo documento de sempre, com os filtros daqui. */
function quadro() {
  return quadroPara({
    gente: doFiltro(),
    rotulo: [est.empregador, rotFazendas()].filter(Boolean).join(' · '),
    empFixo: !!est.empregador,
    fazUma: est.fazendas.length === 1,
    situacao: rotSituacao(),
  });
}

function lista() {
  const l = doFiltro();
  const cols = ['Nome', 'Empregador', 'Fazenda', 'Setor', 'Cargo', 'Admissão', 'Tempo de casa', 'Situação'];
  const linhas = l.map(f => [f.nome, limpo(f.empregador), limpo(f.fazenda), limpo(f.setor), limpo(f.cargo),
    br(f.admissao), tempoCasa(f.admissao), f.situacao || 'ATIVO']);
  return {
    html: documento({
      titulo: 'LISTA DE FUNCIONÁRIOS', subtitulo: 'Cadastro · quem está no recorte escolhido', paisagem: true,
      corpo: tabela(cols.map(t => ({ t })), linhas.map(r => r.map(esc)), `${l.length} funcionário(s)`),
    }),
    csv: [cols, ...linhas],
  };
}

function emergencia() {
  const l = doFiltro();
  const cols = ['Nome', 'Fazenda', 'Telefone', 'Recado', 'Contato de emergência', 'Parentesco', 'Telefone de emergência'];
  const linhas = l.map(f => [f.nome, limpo(f.fazenda), limpo(f.telefone), limpo(f.telefone_recado),
    limpo(f.emergencia_nome), limpo(f.emergencia_parentesco), limpo(f.emergencia_telefone)]);
  const sem = l.filter(f => !limpo(f.emergencia_telefone)).length;
  return {
    html: documento({
      titulo: 'CONTATOS DE EMERGÊNCIA', subtitulo: 'Para deixar na sede e nos veículos', paisagem: true,
      corpo: tabela(cols.map(t => ({ t })), linhas.map(r => r.map(v => esc(v) || '—')),
        `${l.length} funcionário(s)${sem ? ` · ${sem} sem telefone de emergência no cadastro` : ''}`),
    }),
    csv: [cols, ...linhas],
  };
}

function transporte() {
  const l = doFiltro();
  const sim = v => v === true || v === 'true' ? 'Sim' : v === false || v === 'false' ? 'Não' : '';
  const cols = ['Nome', 'Fazenda', 'Município', 'Bairro', 'Transporte da empresa', 'Ponto de embarque', 'Alojamento'];
  const linhas = l.map(f => [f.nome, limpo(f.fazenda), limpo(f.municipio), limpo(f.bairro),
    sim(f.transporte_empresa), limpo(f.ponto_embarque), sim(f.alojamento)]);
  return {
    html: documento({
      titulo: 'TRANSPORTE E ALOJAMENTO', subtitulo: 'Onde mora, embarque e alojamento', paisagem: true,
      corpo: tabela(cols.map(t => ({ t })), linhas.map(r => r.map(v => esc(v) || '—')), `${l.length} funcionário(s)`),
    }),
    csv: [cols, ...linhas],
  };
}

function aniversariantes() {
  const l = doFiltro()
    .filter(f => f.nascimento && Number(String(f.nascimento).slice(5, 7)) - 1 === est.mes)
    .sort((a, b) => String(a.nascimento).slice(8, 10).localeCompare(String(b.nascimento).slice(8, 10)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const cols = ['Dia', 'Nome', 'Fazenda', 'Idade que completa'];
  const ano = new Date().getFullYear();
  const linhas = l.map(f => [String(f.nascimento).slice(8, 10), f.nome + (f.apelido ? ` (${limpo(f.apelido)})` : ''),
    limpo(f.fazenda), String(ano - Number(String(f.nascimento).slice(0, 4)))]);
  return {
    html: documento({
      titulo: `ANIVERSARIANTES DE ${MESES[est.mes].toUpperCase()}`, subtitulo: `${ano} · SAKUMA Agronegócios`,
      corpo: tabela([{ t: 'Dia' }, { t: 'Nome' }, { t: 'Fazenda' }, { t: 'Idade que completa', num: true }],
        linhas.map(r => r.map(esc)), `${l.length} aniversariante(s) em ${MESES[est.mes]}`),
    }),
    csv: [cols, ...linhas],
  };
}

/* O que falta no cadastro — para completar antes que outro módulo precise. */
const CAMPOS = [
  ['admissao', 'admissão'], ['nascimento', 'nascimento'], ['sexo', 'sexo'], ['cpf', 'CPF'],
  ['pis', 'PIS'], ['cargo', 'cargo'], ['setor', 'setor'], ['empregador', 'empregador'],
  ['fazenda', 'fazenda'], ['telefone', 'telefone'], ['emergencia_telefone', 'contato de emergência'],
];
function incompleto() {
  const l = doFiltro().map(f => ({ f, falta: CAMPOS.filter(([k]) => !limpo(f[k])).map(([, t]) => t) }))
    .filter(x => x.falta.length)
    .sort((a, b) => b.falta.length - a.falta.length || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  const porCampo = CAMPOS.map(([, t]) => [t, l.filter(x => x.falta.includes(t)).length]).filter(([, n]) => n);
  const cols = ['Nome', 'Fazenda', 'CPF', 'Faltam', 'O que falta'];
  const linhas = l.map(x => [x.f.nome, limpo(x.f.fazenda), cpfBR(x.f.cpf), String(x.falta.length), x.falta.join(', ')]);
  const total = doFiltro().length;
  return {
    html: documento({
      titulo: 'CADASTRO INCOMPLETO', subtitulo: 'Quem tem campo importante em branco',
      corpo: `
        <div class="rel-ficha">
          <div><span>No recorte</span><b>${total}</b></div>
          <div><span>Completos</span><b>${total - l.length}</b></div>
          <div><span>Com falta</span><b>${l.length}</b></div>
        </div>
        ${porCampo.length ? `<p class="rel-nota">${porCampo.map(([t, n]) => `<b>${esc(t)}</b>: ${n}`).join(' · ')}</p>` : ''}
        ${tabela([{ t: 'Nome' }, { t: 'Fazenda' }, { t: 'CPF' }, { t: 'Faltam', num: true }, { t: 'O que falta' }],
          linhas.map(r => r.map(v => esc(v) || '—')), l.length ? `${l.length} cadastro(s) para completar` : '',
          'Todos os cadastros deste recorte estão completos.')}`,
    }),
    csv: [cols, ...linhas],
  };
}

const ABAS = [
  ['equipe', 'Equipe'],
  ['contato', 'Contato e transporte'],
  ['aniversario', 'Aniversários'],
  ['conferencia', 'Conferência do cadastro'],
];
const RELS = {
  equipe: [
    { k: 'quadro', nome: 'Quadro de pessoal', desc: 'Composição do time: empregador, fazenda, setor, cargo, sexo, idade e tempo de casa', gerar: quadro, principal: true },
    { k: 'lista', nome: 'Lista de funcionários', desc: 'Nome, empregador, fazenda, setor, cargo, admissão e tempo de casa', gerar: lista },
  ],
  contato: [
    { k: 'emergencia', nome: 'Contatos de emergência', desc: 'Telefone, recado e a quem avisar em caso de acidente', gerar: emergencia, principal: true },
    { k: 'transporte', nome: 'Transporte e alojamento', desc: 'Município, bairro, ponto de embarque e alojamento', gerar: transporte },
  ],
  aniversario: [
    { k: 'aniv', nome: 'Aniversariantes do mês', desc: 'Dia, nome, fazenda e a idade que completa', gerar: aniversariantes, principal: true },
  ],
  conferencia: [
    { k: 'incompleto', nome: 'Cadastro incompleto', desc: 'Quem está sem admissão, nascimento, sexo, CPF, PIS, cargo, fazenda, telefone ou contato de emergência', gerar: incompleto, principal: true },
  ],
};
const DICAS = {
  equipe: 'Os filtros do alto valem para todos os relatórios desta tela.',
  contato: 'Uso interno — traz telefones. Imprima só o que for para ficar na sede ou nos veículos.',
  aniversario: 'Escolha o mês ao lado. A folha decorada para o mural continua em Funcionários › Aniversariantes.',
  conferencia: 'Uso interno — para completar o cadastro antes que outro módulo precise do dado.',
};

/* ---------------- a tela ---------------- */

export function desenharCadRelatorios() {
  const alvo = $('telaCadRelatorios');
  if (!alvo) return;
  const n = doFiltro().length;
  const emps = valores('empregador');

  alvo.innerHTML = `
    <header class="jor-cabecalho"><div>
      <div class="jor-cabecalho__titulo">Relatórios</div>
      <div class="jor-cabecalho__sub">Uma aba por assunto; prévia na tela primeiro</div></div>
      <div class="jor-cabecalho__direita">posição em<strong class="jor-cabecalho__competencia">${br(hoje())}</strong></div></header>
    <div class="jor-corpo">
      <div class="jor-barra rel-filtros cr-filtros">
        <label>Situação <select id="crSit" class="dc-mini">
          <option value="ATIVO"${est.situacao === 'ATIVO' ? ' selected' : ''}>Só ativos</option>
          <option value=""${est.situacao === '' ? ' selected' : ''}>Todos</option>
          <option value="INATIVO"${est.situacao === 'INATIVO' ? ' selected' : ''}>Só inativos</option></select></label>
        <label>Empregador <select id="crEmp" class="dc-mini">
          <option value="">Todos os empregadores</option>
          ${emps.map(e => `<option${e === est.empregador ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
        <div class="cr-campo">Fazenda <div id="crFaz"></div></div>
        <span class="dc-sem">${n} pessoa(s) no recorte</span>
      </div>
      <div class="rel-abas" role="tablist">
        ${ABAS.map(([k, t]) => `<button type="button" role="tab" class="rel-aba${k === est.aba ? ' ativa' : ''}" data-cr-aba="${k}">${t}</button>`).join('')}
      </div>
      <div class="rel-abacorpo">
        ${est.aba === 'aniversario' ? `<div class="jor-barra rel-filtros"><label>Mês <select id="crMes" class="dc-mini">
          ${MESES.map((m, i) => `<option value="${i}"${i === est.mes ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>` : ''}
        <p class="dc-sem jor-nota rel-dica">${DICAS[est.aba]}</p>
        ${RELS[est.aba].map(r => `<div class="rel-linha">
          <b>${esc(r.nome)}</b><span class="dc-sem">${esc(r.desc)}</span>
          <span class="rel-linha__acoes">
            <button class="btn${r.principal ? ' principal' : ''}" type="button" data-cr-ver="${r.k}">Visualizar</button>
            <button class="btn" type="button" data-cr-imp="${r.k}">Imprimir</button>
            <button class="btn mini" type="button" data-cr-csv="${r.k}">Excel</button>
          </span></div>`).join('')}
      </div>
    </div>`;

  const fechar = () => { const p = $('jorImpressao'); if (p) { p.hidden = true; p.innerHTML = ''; } };
  $('crSit').addEventListener('change', ev => { est.situacao = ev.target.value; fechar(); desenharCadRelatorios(); });
  $('crEmp').addEventListener('change', ev => { est.empregador = ev.target.value; fechar(); desenharCadRelatorios(); });
  $('crMes')?.addEventListener('change', ev => { est.mes = Number(ev.target.value); fechar(); desenharCadRelatorios(); });
  const semFaz = estado.funcionarios.some(f => !limpo(f.fazenda));
  montarMulti($('crFaz'), {
    opcoes: [...valores('fazenda').map(z => [z, z]), ...(semFaz ? [['-', 'Sem fazenda']] : [])],
    marcados: est.fazendas, todas: 'Todas as fazendas', plural: 'fazendas',
  });
  $('crFaz').addEventListener('change', () => { est.fazendas = $('crFaz').valores; fechar(); desenharCadRelatorios(); });
  alvo.querySelectorAll('[data-cr-aba]').forEach(b => b.addEventListener('click', () => {
    est.aba = b.dataset.crAba; fechar(); desenharCadRelatorios();
  }));

  const achar = k => RELS[est.aba].find(r => r.k === k);
  alvo.querySelectorAll('[data-cr-ver]').forEach(b => b.addEventListener('click', () => mostrar(achar(b.dataset.crVer).gerar().html, { barra: true })));
  alvo.querySelectorAll('[data-cr-imp]').forEach(b => b.addEventListener('click', () => {
    mostrar(achar(b.dataset.crImp).gerar().html, { barra: true });
    setTimeout(() => imprimir(), 300);   // deixa a marca carregar antes do papel
  }));
  alvo.querySelectorAll('[data-cr-csv]').forEach(b => b.addEventListener('click', () => {
    const r = achar(b.dataset.crCsv);
    baixarCsv(nomeArq(r.nome.toLowerCase().replace(/\s+/g, '-')), r.gerar().csv);
  }));
}
