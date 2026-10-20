// rh-salarios.js — RH › Cargos e salários › Salários e Projeção (01/10/2026)
//
// Pedido dele: controlar salário e cargo de cada funcionário — ver a faixa em
// que a pessoa está, qual é a próxima e projetar o futuro (por pessoa, custo
// da folha e reajuste geral). Decisões (não reabrir sem ele pedir):
//  · A régua é a tabela do app (rh_cargos, faixas A–E). A planilha "Plano de
//    cargos e salários" (A–F) só forneceu o salário atual de cada um.
//  · O salário mora num lugar só: jor_salarios (a mesma do Empréstimo). Cada
//    alteração abre uma vigência nova (`desde`); a anterior fica no histórico.
//    Ganhou rh_cargo_id, faixa e motivo em 01/10/2026.
//  · O valor sugerido pela tabela pode ser alterado à mão — e um registro já
//    gravado pode ser corrigido (com justificativa, vai para a auditoria).
//  · Os valores abrem escondidos, com a mesma senha do Plano de cargos.
//  · A projeção não grava nada: é simulação na tela, com relatório e Excel.
//  · 20/10/2026: alguns recebem salário base + periculosidade, e a SOMA é o
//    valor do plano. `valor` continua sendo o base (o Empréstimo usa no teto);
//    `periculosidade` é o adicional em R$ (30% do base por padrão, editável).
//    Posição na tabela, próxima faixa, folha e projeção usam o total.
//    Gratificação de função (gerentes, 40% do base, coluna `gratificacao`)
//    entra na soma do mesmo jeito: total = base + periculosidade + gratificação.
//    Insalubridade (quem pulveriza) é só anotação — tipo fixa/variável e valor —
//    e não entra em conta nenhuma.
//  · A ficha mostra a remuneração inteira: salário, adicionais, ticket
//    alimentação e tipo de contrato. Ticket e contrato moram no vínculo
//    (jor_vinculos). O antigo Cadastro Nível 2 foi desligado em 20/10/2026: só aqui.

import { estado, salvarFuncionario } from './store.js';
import * as jd from './jornada-dados.js';
import * as iv from './rh-ind-vinculos.js';
import { aplicarReajustesVencidos } from './rh-reajuste-tabela.js';
import { mostrar, imprimir } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/* ---------------- datas (texto AAAA-MM-DD, sem fuso) ---------------- */
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const addMeses = (s, n) => {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number);
  const r = new Date(Date.UTC(a, m - 1 + n, 1));
  const ult = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d, ult));
  return r.toISOString().slice(0, 10);
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = ym => `${MESES[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`;
const mesSeguinte = ym => addMeses(ym + '-01', 1).slice(0, 7);

/* ---------------- dinheiro ---------------- */
const brl = v => v == null || !isFinite(v) ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pctTxt = v => v == null || !isFinite(v) ? '—'
  : `${v >= 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** Aceita "3.105,96", "3105,96" e "3105.96" — mesma regra do numeroOuNulo do rh.js. */
export function lerValor(v) {
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/* ---------------- o olho (mesma senha do Plano de cargos) ---------------- */
const SENHA_SALARIO = 'sk123';
const OCULTO = '<span class="rh-oculto">••••••</span>';
let aberto = false;
const V = v => aberto ? brl(v) : OCULTO;
const P = v => aberto ? pctTxt(v) : OCULTO;

/* ---------------- dados ---------------- */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const COLUNA = { A: 'faixa_a', B: 'faixa_media', C: 'faixa_c', D: 'faixa_d', E: 'faixa_e' };
const MOTIVOS = {
  inicial: 'Salário inicial / informado',
  horizontal: 'Promoção horizontal (faixa)',
  vertical: 'Promoção vertical (cargo)',
  reajuste: 'Reajuste / dissídio',
  ajuste: 'Ajuste manual',
};

/* Periculosidade: 30% do salário base (CLT, art. 193). Total = base + adicional. */
export const PCT_PERIC = 0.30;
const r2 = v => Math.round(v * 100) / 100;
export const pericDe = s => s ? Number(s.periculosidade) || 0 : 0;
/* Gratificação de função (ex.: gerentes): 40% do salário base, soma com o
   base como a periculosidade (20/10/2026). */
export const PCT_GRAT = 0.40;
export const gratDe = s => s ? Number(s.gratificacao) || 0 : 0;
export const totalDe = s => s ? r2(Number(s.valor) + pericDe(s) + gratDe(s)) : null;
/** "base X + peric. Y + grat. Z" — só as partes que a pessoa tem. */
const quebra = (base, peric, grat, fmt = brl, longo = false) => [
  `base ${fmt(base)}`,
  peric > 0 ? `${longo ? 'periculosidade' : 'peric.'} ${fmt(peric)}` : '',
  grat > 0 ? `${longo ? 'gratificação de função' : 'grat.'} ${fmt(grat)}` : '',
].filter(Boolean).join(' + ');
const temAdicional = x => x.peric > 0 || x.grat > 0;
/** Cargo de gerência (sugere a gratificação de função ao lançar o salário). */
const ehGerencia = c => /gerente/i.test(c?.nome || '');
/** Observação do enquadramento quando o total não bate exato com a faixa
    (ex.: "R$ 41,73 abaixo da B"). Mesma regra usada no enquadramento de 20/10/2026. */
export function obsFaixa(cargo, faixa, total) {
  if (!cargo || total == null) return null;
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!faixa) {
    const a = valorFaixa(cargo, 'A');
    return a && total < a - 0.005 ? `${fmt(a - total)} abaixo da A` : null;
  }
  const v = valorFaixa(cargo, faixa);
  if (!v || Math.abs(v - total) < 0.01) return null;
  return total < v ? `${fmt(v - total)} abaixo da ${faixa}` : `${fmt(total - v)} acima da ${faixa}`;
}
/* Insalubridade (ex.: quem pulveriza): só anotação, com tipo e valor. NÃO
   entra no total — fixa = todo mês; variável = só nos meses em que pulveriza. */
export const INSAL = { fixa: 'fixa (todo mês)', variavel: 'variável (só quando pulveriza)' };
export const insalDe = s => s?.insalubridade_tipo ? { tipo: s.insalubridade_tipo, valor: Number(s.insalubridade) || 0 } : null;
const insalTxt = (s, fmt = brl) => { const i = insalDe(s); return i ? `${INSAL[i.tipo] || i.tipo}${i.valor ? ` · ${fmt(i.valor)}` : ''}` : ''; };
/** Divide um total do plano em base + adicionais: base = total ÷ (1 + 30% + 40%),
    conforme o que a pessoa recebe. O centavo de arredondamento fica no último adicional. */
export const dividir = (total, comPeric, comGrat = false) => {
  const base = r2(total / (1 + (comPeric ? PCT_PERIC : 0) + (comGrat ? PCT_GRAT : 0)));
  if (comPeric && comGrat) { const peric = r2(base * PCT_PERIC); return { base, peric, grat: r2(total - base - peric) }; }
  if (comPeric) return { base, peric: r2(total - base), grat: 0 };
  if (comGrat) return { base, peric: 0, grat: r2(total - base) };
  return { base: r2(total), peric: 0, grat: 0 };
};

const S = { cargos: [], carregado: false, erro: '', busca: '', filtro: '', passo: 12 };
const PJ = { inicio: null, meses: 12, reajPct: '', reajMes: '', encargos: '', movs: [] };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  try { await aplicarReajustesVencidos(c); } catch (e) { console.warn('reajuste da tabela', e); }
  const [cg] = await Promise.all([
    c.from('rh_cargos').select('*').order('ordem').order('nome'),
    jd.dados.carregado ? null : jd.carregar(),
  ]);
  if (cg.error) throw cg.error;
  S.cargos = cg.data || [];
  /* jd.carregar engole o erro de jor_salarios (sem permissão = lista vazia);
     aqui queremos saber, porque a tela inteira depende dela. */
  const s = await c.from('jor_salarios').select('*');
  if (s.error) throw s.error;
  jd.dados.salarios = s.data || [];
  S.carregado = true;
}

const cargoPorId = id => S.cargos.find(c => c.id === id) || null;
export const valorFaixa = (cargo, L) => {
  const v = cargo ? Number(cargo[COLUNA[L]]) : NaN;
  return isFinite(v) && v > 0 ? v : null;
};
const ativos = () => (estado.funcionarios || []).filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const pessoa = id => (estado.funcionarios || []).find(f => f.id === id) || null;

const ordenar = l => l.slice().sort((a, b) => b.desde.localeCompare(a.desde) || (b.criado_em || '').localeCompare(a.criado_em || ''));
const salariosDe = fid => ordenar((jd.dados.salarios || []).filter(s => s.funcionario_id === fid));
/** Salário que vale na data (o de maior `desde` até ela). */
export const vigenteEm = (fid, data = hoje()) => salariosDe(fid).find(s => s.desde <= data) || null;
const futurosDe = fid => salariosDe(fid).filter(s => s.desde > hoje()).reverse();

/* Escada vertical: "Tratorista I" → "Tratorista II" … (mesmo nome, numeral
   romano seguinte). Cargo sem numeral não tem degrau automático. */
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const partes = nome => { const m = /^(.*?)\s+(I{1,3}|IV|V|VI)$/i.exec(String(nome || '').trim()); return m ? [norm(m[1]), ROMANOS.indexOf(m[2].toUpperCase())] : null; };
export function cargoSeguinte(cargo) {
  const p = partes(cargo?.nome);
  if (!p) return null;
  return S.cargos.find(c => { const q = partes(c.nome); return q && q[0] === p[0] && q[1] === p[1] + 1; }) || null;
}

/** Onde o salário cai na tabela do cargo. */
export function posicao(cargo, sal) {
  if (sal == null) return { txt: 'sem salário', cls: 'perigo' };
  if (!cargo) return { txt: 'sem cargo do plano', cls: 'neutra' };
  const v = LETRAS.map(L => [L, valorFaixa(cargo, L)]).filter(x => x[1]);
  if (!v.length) return { txt: 'cargo sem valores', cls: 'neutra' };
  const igual = v.find(x => Math.abs(x[1] - sal) < 0.01);
  if (igual) return { txt: `na faixa ${igual[0]}`, cls: 'ativo', letra: igual[0] };
  if (sal < v[0][1]) return { txt: `abaixo da faixa ${v[0][0]}`, cls: 'perigo', abaixo: true };
  if (sal > v[v.length - 1][1]) return { txt: `acima da faixa ${v[v.length - 1][0]}`, cls: 'alerta', acima: true };
  const i = v.findIndex(x => x[1] > sal);
  return { txt: `entre ${v[i - 1][0]} e ${v[i][0]}`, cls: 'alerta', entre: [v[i - 1][0], v[i][0]] };
}

/** Para o cartão da tela inicial (20/10/2026): quantos abaixo da faixa e sem
    salário. Só lê — não aplica reajuste nem marca a tela como carregada,
    para Salários continuar fazendo isso ao ser aberta. */
export async function resumoSalarios() {
  let cargos = S.cargos, sals = jd.dados.salarios || [];
  if (!S.carregado) {
    const c = estado.cliente;
    if (!c) return null;
    const [cg, sl] = await Promise.all([c.from('rh_cargos').select('*'), c.from('jor_salarios').select('*')]);
    if (cg.error || sl.error) return null;
    cargos = cg.data || []; sals = sl.data || [];
  }
  const h = hoje();
  let abaixo = 0, sem = 0;
  for (const f of ativos()) {
    const s = sals.filter(x => x.funcionario_id === f.id && x.desde <= h).sort((a, b) => b.desde.localeCompare(a.desde))[0] || null;
    const fn = jd.funcaoDe(jd.vinculoDe(f.id));
    const cargo = cargos.find(c => c.id === s?.rh_cargo_id) || cargos.find(c => c.id === fn?.rh_cargo_id) || null;
    const sal = totalDe(s);
    if (sal == null) { sem++; continue; }
    if (posicao(cargo, sal).abaixo) abaixo++;
  }
  return { abaixo, sem };
}

/** A próxima faixa: a primeira da tabela que paga mais do que o salário de hoje. */
export function proxima(cargo, sal) {
  if (!cargo || sal == null) return null;
  const v = LETRAS.map(L => [L, valorFaixa(cargo, L)]).find(x => x[1] && x[1] > sal + 0.005);
  if (v) return { cargo, letra: v[0], valor: v[1], pct: v[1] / sal - 1 };
  const seg = cargoSeguinte(cargo);
  const a = seg && LETRAS.map(L => [L, valorFaixa(seg, L)]).find(x => x[1] && x[1] > sal + 0.005);
  return a ? { cargo: seg, letra: a[0], valor: a[1], pct: a[1] / sal - 1, vertical: true } : { topo: true };
}

/** Tudo o que a tela precisa de uma pessoa, de uma fonte só. */
export function situacao(f) {
  const v = jd.vinculoDe(f.id), fn = jd.funcaoDe(v);
  const s = vigenteEm(f.id);
  const cargo = cargoPorId(s?.rh_cargo_id) || cargoPorId(fn?.rh_cargo_id);
  /* sal = TOTAL (base + periculosidade + gratificação): é o que se compara com o plano. */
  const sal = totalDe(s);
  return {
    f, s, sal, base: s ? Number(s.valor) : null, peric: pericDe(s), grat: gratDe(s), insal: insalDe(s), faixaObs: s?.faixa_obs || '',
    v, ticket: v?.ticket_valor != null ? Number(v.ticket_valor) : null, ticketObs: v?.ticket_obs || '', contrato: v?.tipo_contrato || 'fixo',
    cargo, faixa: s?.faixa || v?.faixa || null, faixaCadastro: v?.faixa || null,
    pos: posicao(cargo, sal), prox: proxima(cargo, sal), futuros: futurosDe(f.id),
  };
}

/* ===================================================================
   MOLDURA DE DOCUMENTO (padrão SAKUMA, sem nome de responsável no pé)
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo, paisagem }) {
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
function baixarCsv(nome, linhas) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const blob = new Blob(['\ufeff' + linhas.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const num2 = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',');

/* ===================================================================
   DIÁLOGO (um só, criado na hora)
   =================================================================== */
function dialogo(html, ligar, largo = false) {
  let d = $('dlgRhSal');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgRhSal'; document.body.appendChild(d); }
  d.classList.toggle('rs-largo', largo);
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgRhSal')?.open && $('dlgRhSal').close();

function pedirSenha(depois) {
  if (aberto) { depois(); return; }
  dialogo(`<h3>Mostrar os salários</h3>
    <p class="dica">Os salários ficam escondidos. Digite a senha para abrir (a mesma do Plano de cargos).</p>
    <div class="aviso erro" id="rsSenhaErro" hidden></div>
    <label class="campo plena">Senha<input type="password" id="rsSenha" autocomplete="off"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="rsSenhaOk">Mostrar</button></div>`, d => {
    const ok = () => {
      if ($('rsSenha').value.trim() !== SENHA_SALARIO) {
        $('rsSenhaErro').textContent = 'Senha incorreta.'; $('rsSenhaErro').hidden = false; $('rsSenha').focus(); return;
      }
      aberto = true; d.close(); depois();
    };
    $('rsSenhaOk').addEventListener('click', ok);
    $('rsSenha').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    $('rsSenha').focus();
  });
}
const botaoOlho = id => `<button class="btn olho" type="button" id="${id}" aria-pressed="${aberto}">${aberto ? 'Esconder valores' : 'Mostrar valores'}</button>`;
function ligarOlho(id, redesenhar) {
  $(id)?.addEventListener('click', () => {
    if (aberto) { aberto = false; redesenhar(); } else pedirSenha(redesenhar);
  });
}

/* ===================================================================
   TELA · SALÁRIOS
   =================================================================== */
const FILTROS = [
  ['', 'Todos'], ['sem', 'Sem salário'], ['abaixo', 'Abaixo da tabela'],
  ['fora', 'Fora de faixa (entre/acima)'], ['nafaixa', 'Na faixa'], ['futuro', 'Com alteração programada'],
];
const passaFiltro = (x, k) => !k
  || (k === 'sem' && x.sal == null)
  || (k === 'abaixo' && x.pos.abaixo)
  || (k === 'fora' && (x.pos.entre || x.pos.acima))
  || (k === 'nafaixa' && x.pos.letra)
  || (k === 'futuro' && x.futuros.length);

function desenharSalarios() {
  const tela = $('telaRhSalarios');
  const todos = ativos().map(situacao);
  const q = norm(S.busca);
  const lista = todos.filter(x => passaFiltro(x, S.filtro)
    && (!q || [x.f.nome, x.f.fazenda, x.cargo?.nome].some(v => norm(v).includes(q))));
  const com = todos.filter(x => x.sal != null);
  const folha = com.reduce((t, x) => t + x.sal, 0);
  const folhaPeric = com.reduce((t, x) => t + x.peric, 0);
  const folhaGrat = com.reduce((t, x) => t + x.grat, 0);
  const comAdic = com.filter(temAdicional).length;
  const abaixo = todos.filter(x => x.pos.abaixo).length;
  const sem = todos.length - com.length;

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Salários</h2>
        <p class="dica" style="margin:2px 0 0">Cargo, faixa e salário de cada pessoa ativa, comparados com o Plano de cargos (faixas A–E).</p></div>
      <span class="acoes">${botaoOlho('rsOlho')}
        <button class="btn" type="button" id="rsRel">Relatório</button>
        <button class="btn mini" type="button" id="rsCsv">Excel</button></span>
    </div>
    <div class="rs-kpis">
      <div><span>Pessoas ativas</span><strong>${todos.length}</strong><small>${com.length} com salário</small></div>
      <div><span>Folha mensal (salários)</span><strong>${V(folha)}</strong><small>${comAdic ? quebra(folha - folhaPeric - folhaGrat, folhaPeric, folhaGrat, V) : 'base + adicionais, sem encargos'}</small></div>
      <div class="${abaixo ? 'rs-alerta' : ''}"><span>Abaixo da faixa A</span><strong>${abaixo}</strong><small>ganham menos que o início do cargo</small></div>
      <div class="${sem ? 'rs-alerta' : ''}"><span>Sem salário no app</span><strong>${sem}</strong><small>clique em Abrir para informar</small></div>
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Buscar<input type="search" id="rsBusca" value="${esc(S.busca)}" placeholder="Nome, fazenda ou cargo"></label>
      <label class="campo">Mostrar<select id="rsFiltro">${FILTROS.map(([k, t]) => `<option value="${k}" ${k === S.filtro ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    ${legenda(todos)}
    <div class="rolagem" style="margin-top:8px">
    <table class="dc-planilha rs-tab"><thead><tr><th>Funcionário</th><th>Cargo</th><th class="ce">Faixa</th>
      <th class="ce">Salário atual</th><th>Posição na tabela</th><th>Próximo passo</th><th></th></tr></thead><tbody>
      ${lista.map(x => `<tr>
        <td><span class="tv-led tv-${x.pos.cls}" title="${esc(x.pos.txt)}"></span><b>${esc(x.f.nome)}</b><br><span class="dc-sem" style="margin-left:18px">${esc(x.f.fazenda || '')}</span></td>
        <td>${x.cargo ? esc(x.cargo.nome) : `<span class="dc-sem">${esc(x.f.cargo || '—')}</span><br><span class="tag neutra">fora do plano</span>`}</td>
        <td class="ce">${x.faixa ? `<b>${x.faixa}</b>` : '—'}${x.faixaObs ? `<br><span class="dc-sem rs-fobs" title="Observação do enquadramento">${aberto ? esc(x.faixaObs) : esc(x.faixaObs.replace(/R\$ [\d.,]+/, 'R$ •••'))}</span>` : ''}${x.faixaCadastro && x.s?.faixa && x.faixaCadastro !== x.s.faixa ? `<br><span class="tag alerta" title="O cadastro diz faixa ${x.faixaCadastro}">cadastro: ${x.faixaCadastro}</span>` : ''}</td>
        <td class="ce">${x.sal != null ? `<b>${V(x.sal)}</b>${temAdicional(x) ? `<br><span class="dc-sem" title="Salário base + adicionais que somam no plano">${quebra(x.base, x.peric, x.grat, V)}</span>` : ''}<br><span class="dc-sem">desde ${br(x.s.desde)}</span>${x.insal ? `<br><span class="tag neutra" title="Só anotação — não entra na soma">insalubridade ${esc(INSAL[x.insal.tipo])}${x.insal.valor ? ': ' + V(x.insal.valor) : ''}</span>` : ''}` : '<span class="tag perigo">sem salário</span>'}
          ${x.futuros.length ? `<br><span class="tag ativo" title="Alteração já lançada com data futura">${br(x.futuros[0].desde)}: ${V(totalDe(x.futuros[0]))}</span>` : ''}</td>
        <td><span class="tag ${x.pos.cls}">${esc(x.pos.txt)}</span></td>
        <td>${proxTxt(x)}</td>
        <td class="ce"><button class="btn mini" type="button" data-rs-abrir="${x.f.id}">Abrir</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="vazio">Ninguém neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="dica" style="margin-top:10px">Salário atual = salário base + periculosidade + gratificação de função (quando a pessoa recebe); é essa soma que se compara com o Plano de cargos.
      A insalubridade (quem pulveriza) fica só anotada, fixa ou variável, e não entra na soma. Sem horas extras nem encargos. O Empréstimo usa só o salário base no teto de 40%.</p>
  </div>`;

  $('rsBusca').addEventListener('input', e => { S.busca = e.target.value; desenharSalarios(); const b = $('rsBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
  $('rsFiltro').addEventListener('change', e => { S.filtro = e.target.value; desenharSalarios(); });
  tela.querySelectorAll('[data-rs-leg]').forEach(b => b.addEventListener('click', () => {
    S.filtro = S.filtro === b.dataset.rsLeg ? '' : b.dataset.rsLeg; desenharSalarios(); }));
  ligarOlho('rsOlho', desenharSalarios);
  tela.querySelectorAll('[data-rs-abrir]').forEach(b => b.addEventListener('click', () => abrirFicha(b.dataset.rsAbrir)));
  $('rsRel').addEventListener('click', () => pedirSenha(() => { desenharSalarios(); mostrar(relSalarios(lista), { barra: true }); }));
  $('rsCsv').addEventListener('click', () => pedirSenha(() => { desenharSalarios(); csvSalarios(lista); }));
}

/* Legenda de cores (estilo TOTVS, 20/10/2026): o quadradinho de cada linha diz
   a situação sem abrir nada; clicar numa cor filtra a lista (clicar de novo
   desfaz). As cores são as mesmas das etiquetas de "Posição na tabela". */
const LEGENDA = [
  ['ativo',  'nafaixa', 'Na faixa',       x => x.pos.letra],
  ['perigo', 'abaixo',  'Abaixo da faixa', x => x.pos.abaixo],
  ['alerta', 'fora',    'Entre/acima',    x => x.pos.entre || x.pos.acima],
  ['neutra', 'sem',     'Sem salário ou fora do plano', x => x.sal == null || !x.cargo],
];
function legenda(todos) {
  return `<div class="rs-legenda" role="group" aria-label="Legenda"><b>Legenda</b>${LEGENDA.map(([cls, k, rot, teste]) => `
    <button type="button" data-rs-leg="${k}" aria-pressed="${S.filtro === k}" title="Mostrar só ${rot.toLowerCase()}">
      <span class="tv-led tv-${cls}"></span>${rot} <strong>${todos.filter(teste).length}</strong></button>`).join('')}</div>`;
}

function proxTxt(x) {
  const p = x.prox;
  if (!p) return '<span class="dc-sem">—</span>';
  if (p.topo) return '<span class="dc-sem">topo do cargo</span>';
  return `${p.vertical ? `<span class="tag alerta">vertical</span> ${esc(p.cargo.nome)} ` : ''}faixa <b>${p.letra}</b> · ${V(p.valor)}
    <span class="dc-sem">(${P(p.pct)})</span>`;
}

function relSalarios(lista) {
  const com = lista.filter(x => x.sal != null);
  const total = com.reduce((t, x) => t + x.sal, 0);
  const totalBase = com.reduce((t, x) => t + x.base, 0);
  const totalPeric = com.reduce((t, x) => t + x.peric, 0);
  const totalGrat = com.reduce((t, x) => t + x.grat, 0);
  return documento({
    titulo: 'Salários e enquadramento', subtitulo: 'Cargo, faixa e próximo passo de cada funcionário ativo',
    canto: `${lista.length} pessoa(s)`, paisagem: true,
    corpo: `<table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th>Cargo</th><th>Faixa</th>
      <th class="rel-num">Base</th><th class="rel-num">Peric.</th><th class="rel-num">Grat. função</th><th class="rel-num">Salário</th><th>Insalubridade (obs.)</th><th>Desde</th><th>Posição</th><th>Próximo passo</th><th class="rel-num">Valor</th><th class="rel-num">%</th></tr></thead>
      <tbody>${lista.map(x => `<tr><td>${esc(x.f.nome)}</td><td>${esc(x.f.fazenda || '—')}</td><td>${esc(x.cargo?.nome || x.f.cargo || '—')}</td>
        <td>${x.faixa || '—'}</td><td class="rel-num">${x.sal != null ? brl(x.base) : '—'}</td><td class="rel-num">${x.peric > 0 ? brl(x.peric) : '—'}</td><td class="rel-num">${x.grat > 0 ? brl(x.grat) : '—'}</td>
        <td class="rel-num"><b>${x.sal != null ? brl(x.sal) : '—'}</b></td><td>${esc(insalTxt(x.s)) || '—'}</td><td>${x.s ? br(x.s.desde) : '—'}</td>
        <td class="${x.pos.abaixo || x.sal == null ? 'rel-pend' : x.pos.letra ? 'rel-ok' : ''}">${esc(x.pos.txt)}</td>
        <td>${x.prox?.topo ? 'topo do cargo' : x.prox ? `${x.prox.vertical ? esc(x.prox.cargo.nome) + ' · ' : ''}faixa ${x.prox.letra}` : '—'}</td>
        <td class="rel-num">${x.prox?.valor ? brl(x.prox.valor) : '—'}</td><td class="rel-num">${x.prox?.pct != null ? pctTxt(x.prox.pct) : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Folha mensal · ${com.length} com salário</td><td class="rel-num">${brl(totalBase)}</td><td class="rel-num">${totalPeric ? brl(totalPeric) : '—'}</td><td class="rel-num">${totalGrat ? brl(totalGrat) : '—'}</td><td class="rel-num">${brl(total)}</td><td colspan="6"></td></tr></tfoot></table>
      <p class="rel-nota">Régua: Plano de cargos do app (faixas A–E). Salário = base + periculosidade (30% do base) + gratificação de função (40% do base), quando há; é a soma que se compara com a tabela. Insalubridade é só anotação (fixa ou variável) e não entra na soma. Sem horas extras nem encargos.</p>`,
  });
}
function csvSalarios(lista) {
  baixarCsv(`Salarios_${hoje()}.csv`, [
    ['Funcionario', 'Fazenda', 'Cargo', 'Faixa', 'Obs. da faixa', 'Salario base', 'Periculosidade', 'Gratificacao de funcao', 'Salario atual (total)', 'Insalubridade (tipo)', 'Insalubridade (valor, obs.)', 'Desde', 'Posicao na tabela', 'Proximo cargo', 'Proxima faixa', 'Valor', '% aumento'],
    ...lista.map(x => [x.f.nome, x.f.fazenda || '', x.cargo?.nome || x.f.cargo || '', x.faixa || '', x.faixaObs, num2(x.base), x.peric > 0 ? num2(x.peric) : '', x.grat > 0 ? num2(x.grat) : '', num2(x.sal), x.insal ? INSAL[x.insal.tipo] : '', x.insal?.valor ? num2(x.insal.valor) : '', x.s ? br(x.s.desde) : '',
      x.pos.txt, x.prox?.cargo?.nome || '', x.prox?.letra || (x.prox?.topo ? 'topo' : ''), num2(x.prox?.valor),
      x.prox?.pct != null ? (x.prox.pct * 100).toFixed(1).replace('.', ',') : '']),
  ]);
}

/* ===================================================================
   FICHA DA PESSOA: caminho no cargo, histórico, alterar salário
   =================================================================== */
/** O caminho daqui para a frente: faixas acima do salário de hoje, uma a cada
    `passo` meses a partir da vigência atual, e o degrau vertical depois do topo. */
export function caminho(x, passo = S.passo) {
  if (!x.cargo || x.sal == null) return [];
  const base = x.s.desde > hoje() ? x.s.desde : (x.s.desde || hoje());
  const out = [];
  let k = 0;
  const empilha = (cargo, vertical) => LETRAS.forEach(L => {
    const v = valorFaixa(cargo, L);
    if (!v || v <= (out.length ? out[out.length - 1].valor : x.sal) + 0.005) return;
    k++;
    let d = addMeses(base, k * passo);
    while (d <= hoje()) d = addMeses(d, passo);   // passo já vencido: conta a partir de hoje
    out.push({ cargo, letra: L, valor: v, pct: v / x.sal - 1, data: d, vertical });
  });
  empilha(x.cargo, false);
  const seg = cargoSeguinte(x.cargo);
  if (seg) empilha(seg, true);
  return out;
}

function abrirFicha(fid) {
  const f = pessoa(fid);
  if (!f) return;
  const x = situacao(f);
  const hist = salariosDe(fid);
  const cam = caminho(x);
  const linhaTabela = x.cargo ? LETRAS.map(L => {
    const v = valorFaixa(x.cargo, L);
    const nota = x.pos.letra === L ? 'está aqui'
      : x.pos.entre?.[0] === L ? 'já passou desta'
      : x.prox && !x.prox.topo && !x.prox.vertical && x.prox.letra === L ? 'próxima' : '';
    return `<td class="ce ${nota === 'está aqui' || nota === 'próxima' ? 'rs-aqui' : ''}">${v ? V(v) : '—'}${nota ? `<br><small>${nota}</small>` : ''}</td>`;
  }).join('') : '';

  dialogo(`<h3>${esc(f.nome)}</h3>
    <p class="dica" style="margin-top:-8px">${esc(x.cargo?.nome || f.cargo || 'sem cargo')}${x.faixa ? ` · faixa ${x.faixa}` : ''}${x.faixaObs ? ` <span class="dc-sem">(${aberto ? esc(x.faixaObs) : 'obs. escondida'})</span>` : ''} ·
      ${x.sal != null ? `${V(x.sal)}${temAdicional(x) ? ` (${quebra(x.base, x.peric, x.grat, V, true)})` : ''} desde ${br(x.s.desde)}` : 'sem salário no app'} · <span class="tag ${x.pos.cls}">${esc(x.pos.txt)}</span>${x.insal ? `<br><span class="dc-sem">Insalubridade (só anotação): ${esc(INSAL[x.insal.tipo])}${x.insal.valor ? ' · ' + V(x.insal.valor) : ''}</span>` : ''}</p>
    <div class="rs-kpis rs-remun" style="margin-top:4px">
      <div><span>Salário base</span><strong>${x.sal != null ? V(x.base) : '—'}</strong><small>${x.s ? 'desde ' + br(x.s.desde) : 'sem salário'}</small></div>
      <div><span>Periculosidade</span><strong>${x.peric > 0 ? V(x.peric) : '—'}</strong><small>${x.peric > 0 ? '30% do base' : 'não recebe'}</small></div>
      <div><span>Gratificação de função</span><strong>${x.grat > 0 ? V(x.grat) : '—'}</strong><small>${x.grat > 0 ? '40% do base' : 'não recebe'}</small></div>
      <div><span>Salário do plano</span><strong>${x.sal != null ? V(x.sal) : '—'}</strong><small>base + adicionais</small></div>
      <div><span>Insalubridade</span><strong>${x.insal?.valor ? V(x.insal.valor) : x.insal ? 'sim' : '—'}</strong><small>${x.insal ? esc(INSAL[x.insal.tipo]) + ' · só anotação' : 'não recebe'}</small></div>
      <div><span>Ticket alimentação</span><strong>${x.ticket != null ? V(x.ticket) : '—'}</strong><small>${x.ticket != null ? 'por mês' : 'não recebe'}${x.ticketObs ? ' · ' + esc(x.ticketObs) : ''} <button class="btn mini" type="button" id="rsTicket" style="margin-left:4px">Editar</button></small></div>
      <div><span>Tipo de contrato</span><strong>${x.contrato === 'safra' ? 'Safra' : 'Fixo'}</strong><small>edita em Ticket › Editar</small></div>
    </div>
    ${x.cargo ? `<div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>${esc(x.cargo.nome)}</th>${LETRAS.map(L => `<th class="ce">${L}</th>`).join('')}</tr></thead>
      <tbody><tr><td>Tabela</td>${linhaTabela}</tr></tbody></table></div>` : '<div class="aviso info">A função desta pessoa não está ligada a um cargo do plano. Escolha o cargo ao registrar o salário.</div>'}

    ${x.sal != null && x.cargo ? `<h4 class="rs-h4">Projeção: o caminho daqui para frente</h4>
      <div class="barra" style="margin-top:0"><label class="campo">Um passo a cada
        <select id="rsPasso">${[6, 12, 18, 24].map(n => `<option value="${n}" ${n === S.passo ? 'selected' : ''}>${n} meses</option>`).join('')}</select></label>
        <span class="dc-sem">Datas contadas a partir da vigência atual (${br(x.s.desde)}). É simulação — nada é gravado.</span></div>
      <table class="dc-planilha rs-mini"><thead><tr><th>Previsto para</th><th>Cargo</th><th class="ce">Faixa</th><th class="ce">Salário</th><th class="ce">Sobre o atual</th></tr></thead><tbody>
        ${cam.map(c => `<tr><td>${br(c.data)}</td><td>${c.vertical ? '<span class="tag alerta">vertical</span> ' : ''}${esc(c.cargo.nome)}</td>
          <td class="ce"><b>${c.letra}</b></td><td class="ce">${V(c.valor)}</td><td class="ce">${P(c.pct)}</td></tr>`).join('')
          || '<tr><td colspan="5" class="vazio">Já está no topo da tabela do cargo e não há cargo seguinte na escada.</td></tr>'}
      </tbody></table>` : ''}

    <h4 class="rs-h4">Histórico</h4>
    <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>Desde</th><th>Cargo</th><th class="ce">Faixa</th><th class="ce">Base</th><th class="ce">Peric.</th><th class="ce">Grat.</th><th class="ce">Salário</th><th class="ce">Variação</th><th>Motivo</th><th></th></tr></thead><tbody>
      ${hist.map((h, i) => {
        const ant = hist[i + 1];
        return `<tr><td>${br(h.desde)}${h.desde > hoje() ? ' <span class="tag ativo">programado</span>' : ''}</td>
          <td>${esc(cargoPorId(h.rh_cargo_id)?.nome || '—')}</td><td class="ce">${h.faixa || '—'}</td>
          <td class="ce">${V(Number(h.valor))}</td><td class="ce">${pericDe(h) > 0 ? V(pericDe(h)) : '—'}</td><td class="ce">${gratDe(h) > 0 ? V(gratDe(h)) : '—'}</td><td class="ce"><b>${V(totalDe(h))}</b></td>
          <td class="ce">${ant ? P(totalDe(h) / totalDe(ant) - 1) : '—'}</td>
          <td>${esc(MOTIVOS[h.motivo] || h.motivo || '—')}${h.justificativa ? `<br><span class="dc-sem">${esc(h.justificativa)}</span>` : ''}${insalDe(h) ? `<br><span class="dc-sem">insalubridade ${esc(insalTxt(h, V))}</span>` : ''}</td>
          <td class="ce"><button class="btn mini" type="button" data-rs-corrigir="${h.id}">Corrigir</button></td></tr>`;
      }).join('') || '<tr><td colspan="10" class="vazio">Nenhum salário registrado ainda.</td></tr>'}
    </tbody></table></div>

    <div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button>
      <button class="btn principal" type="button" id="rsNovo">${x.sal != null ? 'Registrar alteração de salário' : 'Informar salário'}</button></div>`, () => {
    $('rsPasso')?.addEventListener('change', e => { S.passo = +e.target.value; abrirFicha(fid); });
    $('rsNovo').addEventListener('click', () => pedirSenha(() => formAlteracao(fid)));
    $('rsTicket').addEventListener('click', () => formTicket(fid));
    document.querySelectorAll('[data-rs-corrigir]').forEach(b => b.addEventListener('click', () => pedirSenha(() => formAlteracao(fid, b.dataset.rsCorrigir))));
    if (!aberto) document.querySelector('#dlgRhSal h3').insertAdjacentHTML('afterend',
      '<p class="dica"><button class="btn mini olho" type="button" id="rsOlhoFicha">Mostrar valores</button></p>');
    $('rsOlhoFicha')?.addEventListener('click', () => pedirSenha(() => { abrirFicha(fid); desenharSalarios(); }));
  }, true);
}

/** Ticket alimentação e tipo de contrato — campos do vínculo (ex-Nível 2),
    gravados no vínculo (jor_vinculos). */
function formTicket(fid) {
  const f = pessoa(fid);
  const x = situacao(f);
  dialogo(`<h3>Ticket alimentação — ${esc(f.nome)}</h3>
    <p class="dica" style="margin-top:-8px">O que gravar aqui vale no relatório de ticket e nos indicadores (tipo de contrato).</p>
    <div class="aviso erro" id="rsTkErro" hidden></div>
    <div class="grade">
      <label class="campo">Tipo de contrato<select id="rsTkContrato"><option value="fixo" ${x.contrato !== 'safra' ? 'selected' : ''}>Fixo</option><option value="safra" ${x.contrato === 'safra' ? 'selected' : ''}>Safra</option></select></label>
      <label class="campo">Ticket alimentação (R$/mês) <small>em branco = não recebe</small>
        <input type="text" id="rsTkValor" inputmode="decimal" placeholder="0,00" value="${x.ticket != null ? x.ticket.toFixed(2).replace('.', ',') : ''}"></label>
      <label class="campo plena">Observação do ticket<input type="text" id="rsTkObs" maxlength="60" placeholder="Ex.: Pedir cartão" value="${esc(x.ticketObs)}"></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" id="rsTkVoltar">Voltar</button>
      <button class="btn principal" type="button" id="rsTkGravar">Salvar</button></div>`, () => {
    $('rsTkVoltar').addEventListener('click', () => abrirFicha(fid));
    $('rsTkGravar').addEventListener('click', async () => {
      const t = $('rsTkValor').value.trim();
      const ticket_valor = t ? lerValor(t) : null;
      if (t && ticket_valor == null) { $('rsTkErro').textContent = 'Valor do ticket inválido.'; $('rsTkErro').hidden = false; return; }
      const b = $('rsTkGravar'); b.disabled = true;
      try {
        await jd.salvarVinculo(fid, { tipo_contrato: $('rsTkContrato').value, ticket_valor, ticket_obs: $('rsTkObs').value.trim() || null });
        try { await iv.sincronizar(f); } catch (e) { console.warn('vínculo dos indicadores', e); }   // tipo de contrato também vai para os indicadores
        abrirFicha(fid);
      } catch (e) { b.disabled = false; $('rsTkErro').textContent = 'Não consegui gravar: ' + (e.message || e); $('rsTkErro').hidden = false; }
    });
  }, true);
}

/** Registrar alteração (ou corrigir um registro, quando vem `corrigirId`). */
function formAlteracao(fid, corrigirId = null) {
  const f = pessoa(fid);
  const x = situacao(f);
  const ed = corrigirId ? (jd.dados.salarios || []).find(s => s.id === corrigirId) : null;
  const sugerido = ed ? null : x.prox && !x.prox.topo ? x.prox : null;
  const cargo0 = ed ? ed.rh_cargo_id : (sugerido?.cargo?.id || x.cargo?.id || '');
  const faixa0 = ed ? (ed.faixa || '') : (sugerido?.letra || x.faixa || '');
  const motivo0 = ed ? ed.motivo : x.sal == null ? 'inicial' : sugerido?.vertical ? 'vertical' : 'horizontal';
  /* Periculosidade: quem já recebe continua recebendo na alteração nova. */
  const peric0 = ed ? pericDe(ed) > 0 : x.peric > 0;
  /* Gratificação de função: quem já recebe continua; cargo de gerente já vem marcado. */
  const grat0 = ed ? gratDe(ed) > 0 : (x.grat > 0 || ehGerencia(cargoPorId(cargo0)));
  const total0 = ed ? totalDe(ed) : (sugerido?.valor || valorFaixa(cargoPorId(cargo0), faixa0) || null);
  const div0 = ed ? { base: Number(ed.valor), peric: pericDe(ed), grat: gratDe(ed) } : (total0 ? dividir(total0, peric0, grat0) : { base: '', peric: '', grat: '' });
  const txt = v => v === '' || v == null ? '' : String(r2(v).toFixed(2)).replace('.', ',');
  const insal0 = ed ? insalDe(ed) : x.insal;   // a anotação acompanha a alteração nova

  dialogo(`<h3>${ed ? 'Corrigir registro' : 'Alterar salário'} — ${esc(f.nome)}</h3>
    <p class="dica" style="margin-top:-8px">${x.sal != null ? `Hoje: ${brl(x.sal)}${temAdicional(x) ? ` (${quebra(x.base, x.peric, x.grat, brl, true)})` : ''} desde ${br(x.s.desde)}` : 'Primeiro registro de salário desta pessoa.'}
      ${ed ? ' · Corrigir muda o registro escolhido e fica na auditoria.' : ' · Uma vigência nova; a anterior fica no histórico.'}</p>
    <div class="aviso erro" id="rsErro" hidden></div>
    <div class="grade">
      <label class="campo">Motivo<select id="rsMotivo">${Object.entries(MOTIVOS).map(([k, t]) => `<option value="${k}" ${k === motivo0 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">A partir de<input type="date" id="rsData" value="${ed ? ed.desde : hoje()}"></label>
      <label class="campo">Cargo do plano<select id="rsCargo"><option value="">— sem cargo do plano —</option>
        ${S.cargos.map(c => `<option value="${c.id}" ${c.id === cargo0 ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo">Faixa<select id="rsFaixa"><option value="">—</option>${LETRAS.map(L => `<option ${L === faixa0 ? 'selected' : ''}>${L}</option>`).join('')}</select></label>
      <label class="campo plena rs-check"><input type="checkbox" id="rsPeric" ${peric0 ? 'checked' : ''}> Recebe adicional de periculosidade (30% do salário base)</label>
      <label class="campo plena rs-check"><input type="checkbox" id="rsGrat" ${grat0 ? 'checked' : ''}> Recebe gratificação de função (40% do salário base) — ex.: gerentes
        <small class="dc-sem" style="margin-left:6px">a soma base + adicionais marcados é o valor do plano</small></label>
      <label class="campo">Salário base (R$)
        <input type="text" id="rsBase" inputmode="decimal" value="${txt(div0.base)}"></label>
      <label class="campo" id="rsPericCampo" ${peric0 ? '' : 'hidden'}>Periculosidade (R$) <small>30% do base; pode ajustar</small>
        <input type="text" id="rsPericValor" inputmode="decimal" value="${peric0 ? txt(div0.peric) : ''}"></label>
      <label class="campo" id="rsGratCampo" ${grat0 ? '' : 'hidden'}>Gratificação de função (R$) <small>40% do base; pode ajustar</small>
        <input type="text" id="rsGratValor" inputmode="decimal" value="${grat0 ? txt(div0.grat) : ''}"></label>
      <label class="campo">Salário do plano — total (R$) <small>a tabela preenche; pode alterar à mão</small>
        <input type="text" id="rsValor" inputmode="decimal" value="${total0 ? txt(total0) : ''}"></label>
      <div class="campo"><span>Conferência</span><span id="rsConf" class="rs-conf"></span></div>
      <label class="campo">Insalubridade <small>só anotação — não entra na soma</small>
        <select id="rsInsalTipo"><option value="">não recebe</option>${Object.entries(INSAL).map(([k, t]) => `<option value="${k}" ${k === insal0?.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo" id="rsInsalCampo" ${insal0 ? '' : 'hidden'}>Valor da insalubridade (R$) <small>ex.: quando pulveriza</small>
        <input type="text" id="rsInsalValor" inputmode="decimal" value="${insal0?.valor ? txt(insal0.valor) : ''}"></label>
      <label class="campo plena">${ed ? 'Justificativa da correção (obrigatória)' : 'Observação (opcional)'}<input type="text" id="rsObs" maxlength="200" value=""></label>
      ${ed ? '' : `<label class="campo plena rs-check"><input type="checkbox" id="rsCad" checked> Atualizar também o cadastro do funcionário: função, faixa e as marcações de periculosidade e insalubridade que o fechamento do DP usa (vale para a data de hoje em diante)</label>`}
    </div>
    <div class="barra fim"><button class="btn" type="button" id="rsVoltar">Voltar</button>
      <button class="btn principal" type="button" id="rsGravar">${ed ? 'Gravar correção' : 'Gravar'}</button></div>`, () => {
    const comPeric = () => $('rsPeric').checked;
    const comGrat = () => $('rsGrat').checked;
    const ler = () => ({ base: lerValor($('rsBase').value),
      peric: comPeric() ? (lerValor($('rsPericValor').value) || 0) : 0,
      grat: comGrat() ? (lerValor($('rsGratValor').value) || 0) : 0,
      total: lerValor($('rsValor').value) });
    const conf = () => {
      const c = cargoPorId($('rsCargo').value), L = $('rsFaixa').value, { base, peric, grat, total } = ler();
      const v = total;
      const tab = valorFaixa(c, L);
      const partesTxt = [];
      if ((comPeric() || comGrat()) && base) {
        const avisoP = comPeric() && Math.abs(peric - r2(base * PCT_PERIC)) > 0.011 ? ` <span class="tag alerta">peric. não é 30% (seria ${brl(r2(base * PCT_PERIC))})</span>` : '';
        const avisoG = comGrat() && Math.abs(grat - r2(base * PCT_GRAT)) > 0.011 ? ` <span class="tag alerta">grat. não é 40% (seria ${brl(r2(base * PCT_GRAT))})</span>` : '';
        partesTxt.push(`${quebra(base, peric, grat, brl, true)} = <b>${brl(r2(base + peric + grat))}</b>${avisoP}${avisoG}`);
      }
      if (v && x.sal && !ed) partesTxt.push(`<b>${pctTxt(v / x.sal - 1)}</b> sobre o atual (${brl(v - x.sal)})`);
      if (tab && v) partesTxt.push(Math.abs(tab - v) < 0.01 ? '<span class="tag ativo">igual à tabela</span>'
        : `<span class="tag alerta">tabela: ${brl(tab)}</span>`);
      if ($('rsData').value > hoje()) partesTxt.push('<span class="tag neutra">programado</span>');
      $('rsConf').innerHTML = partesTxt.join(' · ') || '—';
    };
    /* Campos amarrados: mexer no total reparte em base + 30% + 40% (o que
       estiver marcado); mexer na base refaz os adicionais e o total; mexer
       num adicional refaz só o total. */
    const doTotal = () => { const t = lerValor($('rsValor').value); if (!t) return; const d = dividir(t, comPeric(), comGrat());
      $('rsBase').value = txt(d.base); $('rsPericValor').value = comPeric() ? txt(d.peric) : ''; $('rsGratValor').value = comGrat() ? txt(d.grat) : ''; };
    const somar = () => { const { base, peric, grat } = ler(); $('rsValor').value = txt((base || 0) + peric + grat); };
    const daBase = () => { const b = lerValor($('rsBase').value); if (!b) return;
      if (comPeric()) $('rsPericValor').value = txt(b * PCT_PERIC);
      if (comGrat()) $('rsGratValor').value = txt(b * PCT_GRAT);
      somar(); };
    const doPeric = somar;
    const daTabela = () => { const v = valorFaixa(cargoPorId($('rsCargo').value), $('rsFaixa').value); if (v) { $('rsValor').value = txt(v); doTotal(); } conf(); };
    $('rsCargo').addEventListener('change', () => {
      /* Trocou para cargo de gerente: já marca a gratificação de função. */
      if (ehGerencia(cargoPorId($('rsCargo').value)) && !comGrat()) { $('rsGrat').checked = true; $('rsGratCampo').hidden = false; }
      daTabela();
    });
    $('rsFaixa').addEventListener('change', daTabela);
    $('rsPeric').addEventListener('change', () => { $('rsPericCampo').hidden = !comPeric(); doTotal(); conf(); });
    $('rsGrat').addEventListener('change', () => { $('rsGratCampo').hidden = !comGrat(); doTotal(); conf(); });
    $('rsGratValor').addEventListener('input', () => { somar(); conf(); });
    $('rsValor').addEventListener('input', () => { doTotal(); conf(); });
    $('rsBase').addEventListener('input', () => { daBase(); conf(); });
    $('rsPericValor').addEventListener('input', () => { doPeric(); conf(); });
    $('rsData').addEventListener('input', conf);
    $('rsInsalTipo').addEventListener('change', () => { $('rsInsalCampo').hidden = !$('rsInsalTipo').value; });
    $('rsMotivo').addEventListener('change', () => {
      if ($('rsMotivo').value === 'vertical' && x.cargo) {
        const seg = cargoSeguinte(x.cargo);
        if (seg) { $('rsCargo').value = seg.id; $('rsFaixa').value = 'A'; daTabela(); }
      }
    });
    conf();
    $('rsVoltar').addEventListener('click', () => abrirFicha(fid));
    $('rsGravar').addEventListener('click', async () => {
      const erro = t => { $('rsErro').textContent = t; $('rsErro').hidden = false; };
      const { base: valor, peric: periculosidade, grat: gratificacao } = ler();
      const desde = $('rsData').value, obs = $('rsObs').value.trim();
      const insalubridade_tipo = $('rsInsalTipo').value || null, insalubridade = insalubridade_tipo ? (lerValor($('rsInsalValor').value) || 0) : 0;
      const cargoId = $('rsCargo').value || null, faixa = $('rsFaixa').value || null;
      if (!valor) return erro('Informe o salário base.');
      const faixa_obs = obsFaixa(cargoPorId(cargoId), faixa, r2(valor + periculosidade + gratificacao));
      if (comPeric() && !periculosidade) return erro('Informe o valor da periculosidade (ou desmarque a opção).');
      if (comGrat() && !gratificacao) return erro('Informe o valor da gratificação de função (ou desmarque a opção).');
      if (!desde) return erro('Informe a data a partir de quando vale.');
      if (ed && !obs) return erro('Escreva o motivo da correção.');
      const mesmaData = salariosDe(fid).find(s => s.desde === desde && s.id !== ed?.id);
      if (mesmaData) return erro(`Já existe um salário começando em ${br(desde)}. Use Corrigir nele.`);
      const b = $('rsGravar'); b.disabled = true;
      try {
        const reg = ed
          ? { ...ed, valor, periculosidade, gratificacao, faixa_obs, insalubridade, insalubridade_tipo, desde, rh_cargo_id: cargoId, faixa, motivo: $('rsMotivo').value }
          : { funcionario_id: fid, valor, periculosidade, gratificacao, faixa_obs, insalubridade, insalubridade_tipo, desde, rh_cargo_id: cargoId, faixa, motivo: $('rsMotivo').value,
              justificativa: obs || null, criado_por: estado.sessao?.user?.email || null, criado_em: new Date().toISOString() };
        const g = await jd.salvar('salarios', reg);
        await jd.registrar({ tabela: 'jor_salarios', registro_id: g.id, acao: ed ? 'update' : 'insert', antes: ed || null, depois: g, justificativa: ed ? obs : (obs || null) });
        /* As marcações do vínculo (periculosidade e insalubridade) acompanham o
           salário, para o fechamento do DP enxergar a mesma coisa. */
        if (!ed && $('rsCad')?.checked && desde <= hoje()) await atualizarCadastro(f, cargoId, faixa, {
          periculosidade: periculosidade > 0,
          insalubridade: insalubridade_tipo === 'fixa' ? 'permanente' : insalubridade_tipo === 'variavel' ? 'eventual' : 'nao',
        });
        abrirFicha(fid); desenharSalarios();
      } catch (e) { b.disabled = false; erro('Não consegui gravar: ' + (e.message || e)); }
    });
  }, true);
}

/* Promoção vale também no cadastro: a faixa (Cadastro Nível 1) e, se mudou
   de cargo, a função ligada a ele — com o texto do cargo em maiúsculas, como
   o cadastro grava. Data futura não mexe no cadastro (ainda não vale). */
async function atualizarCadastro(f, cargoId, faixa, extras = {}) {
  const parcial = { ...extras };
  if (faixa) parcial.faixa = faixa;
  const fn = cargoId && (jd.dados.funcoes || []).find(x => x.rh_cargo_id === cargoId && x.ativo !== false);
  if (fn && jd.vinculoDe(f.id)?.funcao_id !== fn.id) parcial.funcao_id = fn.id;
  if (Object.keys(parcial).length) await jd.salvarVinculo(f.id, parcial);
  if (parcial.funcao_id) await salvarFuncionario({ ...f, cargo: String(fn.nome).toUpperCase() });
}

/* ===================================================================
   TELA · PROJEÇÃO DA FOLHA
   =================================================================== */
const mesesDoHorizonte = () => { const out = []; let m = PJ.inicio; for (let i = 0; i < PJ.meses; i++) { out.push(m); m = mesSeguinte(m); } return out; };

/**
 * O salário de cada pessoa em cada mês do horizonte. Ordem: salário de hoje →
 * alterações já gravadas com data futura → movimentos simulados (o mais
 * recente vence) → reajuste geral, que multiplica tudo do mês dele em diante
 * (corrige salário e tabela: promoção simulada depois dele já sai corrigida).
 */
export function projetar() {
  const meses = mesesDoHorizonte();
  const fator = (() => { const p = Number(String(PJ.reajPct).replace(',', '.')); return isFinite(p) && p ? 1 + p / 100 : 1; })();
  const pessoas = ativos().map(situacao).filter(x => x.sal != null);
  const linhas = pessoas.map(x => {
    const eventos = [
      ...x.futuros.map(s => ({ mes: s.desde.slice(0, 7), valor: totalDe(s), cargo: cargoPorId(s.rh_cargo_id), faixa: s.faixa, origem: 'lançado' })),
      ...PJ.movs.filter(m => m.fid === x.f.id).map(m => ({ mes: m.mes, valor: m.valor, cargo: cargoPorId(m.cargo), faixa: m.faixa, origem: 'simulado' })),
    ].sort((a, b) => a.mes.localeCompare(b.mes) || (a.origem === 'simulado' ? 1 : -1));
    const valores = meses.map(m => {
      let v = x.sal;
      for (const e of eventos) if (e.mes <= m) v = e.valor;
      if (PJ.reajMes && m >= PJ.reajMes) v *= fator;
      return Math.round(v * 100) / 100;
    });
    return { x, eventos, valores };
  });
  const totais = meses.map((_, i) => linhas.reduce((t, l) => t + l.valores[i], 0));
  const hojeTotal = pessoas.reduce((t, x) => t + x.sal, 0);
  const enc = Number(String(PJ.encargos).replace(',', '.'));
  return { meses, linhas, totais, hojeTotal, encargos: isFinite(enc) && enc > 0 ? enc / 100 : 0,
    semSalario: ativos().length - pessoas.length };
}

function desenharProjecao() {
  const tela = $('telaRhSalProj');
  if (!PJ.inicio) PJ.inicio = mesSeguinte(hoje().slice(0, 7));
  const r = projetar();
  const fim = r.totais[r.totais.length - 1] ?? r.hojeTotal;
  const adicional = r.totais.reduce((t, v) => t + (v - r.hojeTotal), 0);
  const ce = v => r.encargos ? v * (1 + r.encargos) : v;
  const pessoas = ativos().map(situacao).filter(x => x.sal != null);
  const opMes = sel => mesesDoHorizonte().map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${rotMes(m)}</option>`).join('');

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Projeção da folha</h2>
        <p class="dica" style="margin:2px 0 0">Simule promoções e reajuste geral e veja quanto a folha passa a custar. Nada aqui é gravado.</p></div>
      <span class="acoes">${botaoOlho('pjOlho')}
        <button class="btn" type="button" id="pjRel">Relatório</button>
        <button class="btn mini" type="button" id="pjCsv">Excel</button></span>
    </div>

    <div class="grade" style="margin-top:14px">
      <label class="campo">Começa em<input type="month" id="pjIni" value="${PJ.inicio}"></label>
      <label class="campo">Quantos meses<select id="pjMeses">${[6, 12, 18, 24, 36].map(n => `<option ${n === PJ.meses ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo">Reajuste geral (%)<input type="text" id="pjReaj" inputmode="decimal" value="${esc(PJ.reajPct)}" placeholder="ex.: 5,5"></label>
      <label class="campo">Reajuste a partir de<select id="pjReajMes"><option value="">—</option>${opMes(PJ.reajMes)}</select></label>
      <label class="campo">Encargos e provisões (%) <small>opcional</small><input type="text" id="pjEnc" inputmode="decimal" value="${esc(PJ.encargos)}" placeholder="ex.: 68"></label>
    </div>

    <h3 class="rs-h3">Promoções simuladas</h3>
    <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>Funcionário</th><th>A partir de</th><th>Cargo</th><th class="ce">Faixa</th><th class="ce">Salário</th><th class="ce">Sobre o atual</th><th></th></tr></thead><tbody>
      ${PJ.movs.map((m, i) => { const x = situacao(pessoa(m.fid)); return `<tr><td>${esc(x.f.nome)}</td><td>${rotMes(m.mes)}</td>
        <td>${esc(cargoPorId(m.cargo)?.nome || '—')}</td><td class="ce">${m.faixa || '—'}</td><td class="ce">${V(m.valor)}</td><td class="ce">${P(m.valor / x.sal - 1)}</td>
        <td class="ce"><button class="btn mini perigo" type="button" data-pj-tirar="${i}">Tirar</button></td></tr>`; }).join('')
        || '<tr><td colspan="7" class="vazio">Nenhuma promoção simulada. Use os campos abaixo ou o botão "próxima faixa para todos".</td></tr>'}
    </tbody></table></div>
    <div class="grade rs-add">
      <label class="campo">Funcionário<select id="pjPessoa"><option value=""></option>${pessoas.map(x => `<option value="${x.f.id}">${esc(x.f.nome)}</option>`).join('')}</select></label>
      <label class="campo">A partir de<select id="pjMes">${opMes(PJ.inicio)}</select></label>
      <label class="campo">Cargo<select id="pjCargo"><option value=""></option>${S.cargos.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo">Faixa<select id="pjFaixa"><option value=""></option>${LETRAS.map(L => `<option>${L}</option>`).join('')}</select></label>
      <label class="campo">Salário (R$)<input type="text" id="pjValor" inputmode="decimal" placeholder="a tabela preenche"></label>
    </div>
    <div class="barra"><button class="btn principal" type="button" id="pjAdd">Adicionar promoção</button>
      <span class="dc-sem">ou</span>
      <button class="btn" type="button" id="pjTodos">Próxima faixa para todos em</button><select id="pjTodosMes" style="width:auto">${opMes(PJ.inicio)}</select>
      ${PJ.movs.length ? '<button class="btn mini" type="button" id="pjLimpar">Limpar simulação</button>' : ''}</div>

    <div class="rs-kpis" style="margin-top:18px">
      <div><span>Folha hoje</span><strong>${V(ce(r.hojeTotal))}</strong><small>${pessoas.length} pessoa(s) com salário${r.encargos ? ' · com encargos' : ''}</small></div>
      <div><span>Folha em ${rotMes(r.meses[r.meses.length - 1])}</span><strong>${V(ce(fim))}</strong><small>${P(r.hojeTotal ? fim / r.hojeTotal - 1 : null)} sobre hoje</small></div>
      <div><span>Aumento por mês no fim</span><strong>${V(ce(fim - r.hojeTotal))}</strong><small>diferença mensal</small></div>
      <div><span>Custo a mais no período</span><strong>${V(ce(adicional))}</strong><small>${r.meses.length} meses, somados</small></div>
    </div>
    ${r.semSalario ? `<div class="aviso info" style="margin-top:12px">${r.semSalario} pessoa(s) ativa(s) sem salário no app ficam fora da conta. Informe em Salários.</div>` : ''}

    <div class="rolagem" style="margin-top:12px"><table class="dc-planilha rs-mini"><thead><tr><th>Mês</th><th class="ce">Folha (salários)</th>
      ${r.encargos ? '<th class="ce">Com encargos</th>' : ''}<th class="ce">A mais que hoje</th><th>O que muda</th></tr></thead><tbody>
      ${r.meses.map((m, i) => { const muda = r.linhas.flatMap(l => l.eventos.filter(e => e.mes === m).map(e => `${esc(l.x.f.nome.split(' ')[0])} → ${e.faixa || brl(e.valor)}${e.origem === 'lançado' ? ' (lançado)' : ''}`));
        if (PJ.reajMes === m && PJ.reajPct) muda.unshift(`<b>reajuste geral ${esc(PJ.reajPct)}%</b>`);
        return `<tr><td>${rotMes(m)}</td><td class="ce">${V(r.totais[i])}</td>${r.encargos ? `<td class="ce">${V(ce(r.totais[i]))}</td>` : ''}
          <td class="ce">${V(ce(r.totais[i] - r.hojeTotal))}</td><td class="dc-sem">${muda.join(', ') || '—'}</td></tr>`; }).join('')}
    </tbody></table></div>
  </div>`;

  /* Redesenha no próximo giro: o "change" de um campo de texto dispara no
     blur, e trocar o innerHTML no meio do blur derruba o navegador. */
  const reler = () => {
    PJ.inicio = $('pjIni').value || PJ.inicio; PJ.meses = +$('pjMeses').value;
    PJ.reajPct = $('pjReaj').value.trim(); PJ.reajMes = $('pjReajMes').value; PJ.encargos = $('pjEnc').value.trim();
    setTimeout(desenharProjecao, 0);
  };
  ['pjIni', 'pjMeses', 'pjReajMes'].forEach(id => $(id).addEventListener('change', reler));
  ['pjReaj', 'pjEnc'].forEach(id => $(id).addEventListener('change', reler));
  ligarOlho('pjOlho', desenharProjecao);
  const sugerir = () => {
    const x = $('pjPessoa').value && situacao(pessoa($('pjPessoa').value));
    if (!x) return;
    const p = x.prox && !x.prox.topo ? x.prox : null;
    $('pjCargo').value = p?.cargo.id || x.cargo?.id || ''; $('pjFaixa').value = p?.letra || '';
    preencherValor();
  };
  const preencherValor = () => { const v = valorFaixa(cargoPorId($('pjCargo').value), $('pjFaixa').value); $('pjValor').value = v ? String(v).replace('.', ',') : ''; };
  $('pjPessoa').addEventListener('change', sugerir);
  $('pjCargo').addEventListener('change', preencherValor);
  $('pjFaixa').addEventListener('change', preencherValor);
  $('pjAdd').addEventListener('click', () => {
    const fid = $('pjPessoa').value, valor = lerValor($('pjValor').value);
    if (!fid || !valor) { $('pjValor').focus(); return; }
    PJ.movs = PJ.movs.filter(m => !(m.fid === fid && m.mes === $('pjMes').value));
    PJ.movs.push({ fid, mes: $('pjMes').value, cargo: $('pjCargo').value || null, faixa: $('pjFaixa').value || null, valor });
    PJ.movs.sort((a, b) => a.mes.localeCompare(b.mes));
    desenharProjecao();
  });
  $('pjTodos').addEventListener('click', () => {
    const mes = $('pjTodosMes').value;
    pessoas.forEach(x => {
      if (!x.prox || x.prox.topo) return;
      PJ.movs = PJ.movs.filter(m => !(m.fid === x.f.id && m.mes === mes));
      PJ.movs.push({ fid: x.f.id, mes, cargo: x.prox.cargo.id, faixa: x.prox.letra, valor: x.prox.valor });
    });
    PJ.movs.sort((a, b) => a.mes.localeCompare(b.mes));
    desenharProjecao();
  });
  $('pjLimpar')?.addEventListener('click', () => { PJ.movs = []; desenharProjecao(); });
  tela.querySelectorAll('[data-pj-tirar]').forEach(b => b.addEventListener('click', () => { PJ.movs.splice(+b.dataset.pjTirar, 1); desenharProjecao(); }));
  $('pjRel').addEventListener('click', () => pedirSenha(() => { desenharProjecao(); mostrar(relProjecao(projetar()), { barra: true }); }));
  $('pjCsv').addEventListener('click', () => pedirSenha(() => { desenharProjecao(); csvProjecao(projetar()); }));
}

function relProjecao(r) {
  const ce = v => r.encargos ? v * (1 + r.encargos) : v;
  const fim = r.totais[r.totais.length - 1];
  const adicional = r.totais.reduce((t, v) => t + (v - r.hojeTotal), 0);
  const mudam = r.linhas.filter(l => l.valores[l.valores.length - 1] !== l.x.sal);
  return documento({
    titulo: 'Projeção da folha', subtitulo: `Salários de ${rotMes(r.meses[0])} a ${rotMes(r.meses[r.meses.length - 1])} — simulação`,
    canto: r.encargos ? `com encargos de ${(r.encargos * 100).toLocaleString('pt-BR')}%` : 'base + adicionais', paisagem: true,
    corpo: `<div class="rel-resumo"><b>Folha hoje:</b> ${brl(ce(r.hojeTotal))} · <b>no fim:</b> ${brl(ce(fim))} (${pctTxt(fim / r.hojeTotal - 1)}) ·
        <b>custo a mais no período:</b> ${brl(ce(adicional))}${PJ.reajPct && PJ.reajMes ? ` · <b>reajuste geral</b> ${esc(PJ.reajPct)}% em ${rotMes(PJ.reajMes)}` : ''}</div>
      <div class="rel-secao">Mês a mês</div>
      <table class="rel-tabela"><thead><tr><th>Mês</th><th class="rel-num">Folha (salários)</th>${r.encargos ? '<th class="rel-num">Com encargos</th>' : ''}<th class="rel-num">A mais que hoje</th></tr></thead>
      <tbody>${r.meses.map((m, i) => `<tr><td>${rotMes(m)}</td><td class="rel-num">${brl(r.totais[i])}</td>${r.encargos ? `<td class="rel-num">${brl(ce(r.totais[i]))}</td>` : ''}
        <td class="rel-num">${brl(ce(r.totais[i] - r.hojeTotal))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total do período</td><td class="rel-num">${brl(r.totais.reduce((t, v) => t + v, 0))}</td>${r.encargos ? `<td class="rel-num">${brl(ce(r.totais.reduce((t, v) => t + v, 0)))}</td>` : ''}
        <td class="rel-num">${brl(ce(adicional))}</td></tr></tfoot></table>
      <div class="rel-secao">Quem muda de salário</div>
      <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Cargo hoje</th><th class="rel-num">Hoje</th><th>Mudanças</th><th class="rel-num">No fim</th><th class="rel-num">%</th></tr></thead>
      <tbody>${mudam.map(l => { const v = l.valores[l.valores.length - 1]; return `<tr><td>${esc(l.x.f.nome)}</td>
        <td>${esc(l.x.cargo?.nome || '—')}${l.x.faixa ? ' · ' + l.x.faixa : ''}</td><td class="rel-num">${brl(l.x.sal)}</td>
        <td>${l.eventos.filter(e => r.meses.includes(e.mes)).map(e => `${rotMes(e.mes)}: ${esc(e.cargo?.nome || '')} ${e.faixa || ''} ${brl(e.valor)}${e.origem === 'lançado' ? ' (lançado)' : ''}`).join('<br>') || (PJ.reajPct ? 'só o reajuste geral' : '—')}</td>
        <td class="rel-num">${brl(v)}</td><td class="rel-num">${pctTxt(v / l.x.sal - 1)}</td></tr>`; }).join('')
        || '<tr><td colspan="6" class="rel-vazio">Ninguém muda de salário no período.</td></tr>'}</tbody></table>
      <p class="rel-nota">Simulação: nada foi gravado. Salário = base + periculosidade + gratificação de função (quando há), sem insalubridade, horas extras${r.encargos ? '' : ' nem encargos'}.
        ${r.semSalario ? `${r.semSalario} pessoa(s) ativa(s) sem salário no app ficaram fora da conta.` : ''}</p>`,
  });
}
function csvProjecao(r) {
  baixarCsv(`Projecao_folha_${hoje()}.csv`, [
    ['Funcionario', 'Cargo', 'Faixa', 'Hoje', ...r.meses.map(rotMes)],
    ...r.linhas.map(l => [l.x.f.nome, l.x.cargo?.nome || '', l.x.faixa || '', num2(l.x.sal), ...l.valores.map(num2)]),
    ['TOTAL', '', '', num2(r.hojeTotal), ...r.totais.map(num2)],
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_SALARIOS = ['rhSalarios', 'rhSalProj'];

export async function abrirSalarios(tela) {
  const alvo = $(tela === 'rhSalarios' ? 'telaRhSalarios' : 'telaRhSalProj');
  if (!alvo) return;
  aberto = false;   // como no Plano de cargos: entrar de novo pede a senha
  if (!S.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando os salários…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir os salários: ${esc(e.message || e)}</div></div>`; return; }
  }
  if (tela === 'rhSalarios') desenharSalarios(); else desenharProjecao();
}

export function limparSalarios() {
  S.cargos = []; S.carregado = false; S.busca = ''; S.filtro = '';
  PJ.inicio = null; PJ.movs = []; PJ.reajPct = ''; PJ.reajMes = ''; PJ.encargos = '';
  aberto = false; fechar();
}

/* Para o Enquadramento e o Reajuste anual (js/rh-enquadramento.js), que usam
   os mesmos dados, o mesmo olho e a mesma moldura de documento. */
export const api = {
  garantir: async () => { if (!S.carregado) await carregar(); },
  recarregar: async () => { S.carregado = false; await carregar(); },
  cargos: () => S.cargos, cargoPorId, ativos, situacao, salariosDe,
  V: v => V(v), P: v => P(v), aberto: () => aberto, fecharOlho: () => { aberto = false; },
  botaoOlho, ligarOlho, pedirSenha, documento, baixarCsv, dialogo, fechar, num2,
  brl, pctTxt, br, hoje, addMeses, rotMes, mesSeguinte, esc, lerValor, r2,
  abrirFicha: fid => abrirFicha(fid),
};

/* Para testes. */
export const _sal = { S, PJ, abrirFicha, formAlteracao };
