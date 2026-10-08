// sst-acidentes.js — SST › Acidentes e CAT (08/10/2026)
//
// Uma linha por ocorrência em sst_acidentes: o que aconteceu, a lesão, o
// afastamento, a CAT e a investigação (causas e medidas). O quase acidente
// entra também — é o que mais ensina e não pede CAT.
//
// Regras que o código segura:
//  · CAT só para acidente típico, de trajeto e doença ocupacional. Prazo legal
//    (art. 22 da Lei 8.213/91): até o 1º dia útil seguinte à ocorrência; no
//    óbito, imediatamente (o próprio dia). Dia útil = sem sábado, domingo e
//    os feriados nacionais/estaduais do cadastro do DP, quando carregado.
//  · Dias perdidos: o número digitado; senão, do início do afastamento até o
//    retorno (ou até hoje, se ainda afastado).
//  · Afastamento acima de 15 dias: a partir do 16º dia é com o INSS, e o
//    funcionário tem estabilidade de 12 meses após a alta (art. 118 da mesma
//    lei). O app mostra a data, mas quem confirma é a contabilidade.
//  · Banco trancado por app_pode('sst'): tem lesão e CID.
//  · Documento na moldura .rel do DP, sem linha de assinatura; Excel pelo
//    motor único (excel.js).

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

/* ---------------- datas ---------------- */
const iso = d => d.toISOString().slice(0, 10);
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const utc = s => new Date(s + 'T12:00:00Z');
const somaDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const entre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
function somaMeses(s, m) {
  const d = utc(s); const dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m);
  const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ult));
  return iso(d);
}
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const quem = () => estado.sessao?.user?.email || null;

/* ---------------- listas fixas ---------------- */
export const TIPOS = {
  tipico: { nome: 'Típico', longo: 'Acidente típico', cat: true },
  trajeto: { nome: 'Trajeto', longo: 'Acidente de trajeto', cat: true },
  doenca: { nome: 'Doença ocupacional', longo: 'Doença ocupacional', cat: true },
  incidente: { nome: 'Quase acidente', longo: 'Quase acidente (sem lesão)', cat: false },
};
const SITUACOES = {
  aberto: ['Aberto', 'alerta'], investigacao: ['Em investigação', 'neutra'], encerrado: ['Encerrado', 'ativo'],
};
const CAT_TIPOS = { inicial: 'Inicial', reabertura: 'Reabertura', obito: 'Comunicação de óbito' };
const PARTES = ['Cabeça', 'Olhos', 'Face', 'Pescoço', 'Ombro', 'Braço', 'Cotovelo', 'Antebraço', 'Punho',
  'Mão', 'Dedos da mão', 'Tórax', 'Costas / coluna', 'Abdômen', 'Quadril', 'Coxa', 'Joelho', 'Perna',
  'Tornozelo', 'Pé', 'Dedos do pé', 'Múltiplas partes'];
const NATUREZAS = ['Corte', 'Contusão', 'Escoriação', 'Entorse', 'Distensão / lombalgia', 'Fratura', 'Luxação',
  'Queimadura', 'Perfuração', 'Amputação', 'Intoxicação', 'Picada de animal peçonhento', 'Corpo estranho', 'Outra'];
const AGENTES = ['Máquina / implemento agrícola', 'Trator / veículo', 'Ferramenta manual', 'Faca / facão',
  'Produto químico / agrotóxico', 'Animal', 'Queda de mesmo nível', 'Queda de altura', 'Esforço / postura',
  'Objeto em queda', 'Eletricidade', 'Calor / sol', 'Outro'];

/* ---------------- estado ---------------- */
const S = { carregado: false, regs: [], ano: '', filtro: { ano: '', tipo: '', sit: '', cat: '', q: '' } };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const { data, error } = await c.from('sst_acidentes').select('*')
    .order('data', { ascending: false }).order('criado_em', { ascending: false });
  if (error) throw error;
  S.regs = data || [];
  S.carregado = true;
}

const funcionario = id => (estado.funcionarios || []).find(f => f.id === id) || null;
const nomeDe = a => funcionario(a.funcionario_id)?.nome || (a.tipo === 'incidente' ? 'Sem vítima' : '—');

/* ===================================================================
   AS CONTAS (uma fonte só para painel, lista, documento e Excel)
   =================================================================== */
const pedeCat = a => !!TIPOS[a.tipo]?.cat;

function diaUtil(s) {
  const dow = utc(s).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  try { if (jd.dados?.carregado && jd.feriadoEm(s, null)) return false; } catch { /* sem feriados */ }
  return true;
}
/** Último dia para emitir a CAT. */
export function prazoCat(a) {
  if (!a?.data) return null;
  if (a.obito) return a.data;
  let d = somaDias(a.data, 1);
  for (let i = 0; i < 15 && !diaUtil(d); i++) d = somaDias(d, 1);
  return d;
}
/** naoexige | emitida | foraprazo | pendente | atrasada */
export function catDe(a) {
  if (!pedeCat(a)) return { chave: 'naoexige', rotulo: 'Não exige', cor: 'neutra' };
  const prazo = prazoCat(a);
  if (a.cat_emitida) {
    const fora = a.cat_data && prazo && a.cat_data > prazo;
    return fora ? { chave: 'foraprazo', rotulo: 'Emitida fora do prazo', cor: 'alerta', prazo }
      : { chave: 'emitida', rotulo: 'Emitida', cor: 'ativo', prazo };
  }
  if (hoje() > prazo) return { chave: 'atrasada', rotulo: `Atrasada (prazo ${br(prazo)})`, cor: 'perigo', prazo };
  return { chave: 'pendente', rotulo: `Emitir até ${br(prazo)}`, cor: 'alerta', prazo };
}
const catPendente = a => ['pendente', 'atrasada'].includes(catDe(a).chave);

export function diasPerdidos(a) {
  if (!a.afastamento) return 0;
  if (a.dias_afastamento != null && a.dias_afastamento !== '') return Number(a.dias_afastamento) || 0;
  if (!a.afastamento_inicio) return 0;
  return Math.max(0, entre(a.afastamento_inicio, a.retorno_em || hoje()));
}
const afastadoHoje = a => a.afastamento && !a.retorno_em && !a.obito;
/** Data provável do fim da estabilidade (art. 118): só com mais de 15 dias e alta registrada. */
export function estabilidadeAte(a) {
  if (!pedeCat(a) || !a.retorno_em || diasPerdidos(a) <= 15) return null;
  return somaMeses(a.retorno_em, 12);
}
const comLesao = a => a.tipo !== 'incidente';
const anoDe = a => String(a.data || '').slice(0, 4);
const anos = () => [...new Set(S.regs.map(anoDe).filter(Boolean))].sort().reverse();

/** Dias desde o último acidente com lesão (quase acidente não zera o placar). */
export function diasSemAcidente() {
  const ult = S.regs.filter(comLesao).map(a => a.data).sort().pop();
  return ult ? { dias: Math.max(0, entre(ult, hoje())), desde: ult } : null;
}

function resumoAno(ano) {
  const doAno = S.regs.filter(a => anoDe(a) === ano);
  const ac = doAno.filter(comLesao);
  return {
    doAno, ac,
    acidentes: ac.length,
    comAfast: ac.filter(a => a.afastamento).length,
    semAfast: ac.filter(a => !a.afastamento).length,
    dias: ac.reduce((t, a) => t + diasPerdidos(a), 0),
    obitos: ac.filter(a => a.obito).length,
    quase: doAno.filter(a => a.tipo === 'incidente').length,
  };
}

/** Contagem por um campo de texto, maiores primeiro. */
function contarPor(lista, fn) {
  const m = new Map();
  lista.forEach(a => { const k = so(fn(a)) || 'Não informado'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaAcPainel');
  const lista = anos();
  if (!S.ano) S.ano = String(new Date().getFullYear());
  const opcoesAno = [...new Set([String(new Date().getFullYear()), ...lista])].sort().reverse();
  const r = resumoAno(S.ano);
  const sem = diasSemAcidente();
  const pend = S.regs.filter(catPendente);
  const atras = pend.filter(a => catDe(a).chave === 'atrasada');
  const afast = S.regs.filter(afastadoHoje);
  const abertas = S.regs.filter(a => a.situacao !== 'encerrado');
  const medidaVencida = a => a.situacao !== 'encerrado' && a.medidas_prazo && a.medidas_prazo < hoje();

  const cartao = (cor, rot, n, dica, alvo) => `<button type="button" class="pv-card pv-${cor}${n ? '' : ' pv-zero'}"
      ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${n}</strong><small>${esc(dica)}</small></button>`;

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Painel de acidentes</h2>
        <p class="dica" style="margin:2px 0 0">Acidentes, quase acidentes, afastamentos e CAT. Clique num cartão para ver a lista.</p></div>
      <span class="barra">
        <label class="campo" style="margin:0">Ano <select id="acPnAno">${opcoesAno.map(a => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <button class="btn principal" type="button" id="acPnNovo">Registrar ocorrência</button>
      </span>
    </div>

    <div class="ac-placar ${sem && sem.dias < 30 ? 'ac-placar-recente' : ''}">
      <strong>${sem ? sem.dias : '—'}</strong>
      <span>${sem ? `dias sem acidente com lesão<small>último em ${br(sem.desde)}</small>` : 'nenhum acidente registrado ainda'}</span>
    </div>

    <div class="pv-cards" style="margin-top:12px">
      ${cartao('perigo', `Acidentes em ${S.ano}`, r.acidentes, `${r.comAfast} com afastamento · ${r.semAfast} sem`, 'ano')}
      ${cartao('atencao', 'Dias perdidos', r.dias, `no ano de ${S.ano}`, 'ano')}
      ${cartao('alerta', 'CAT a emitir', pend.length, atras.length ? `${atras.length} atrasada(s)` : 'dentro do prazo', 'cat')}
      ${cartao('calma', 'Afastados hoje', afast.length, afast.length ? 'aguardando retorno' : 'ninguém afastado', 'afast')}
      ${cartao('ok', 'Quase acidentes', r.quase, `em ${S.ano} · não pedem CAT`, 'quase')}
      ${cartao('ok', 'Investigações abertas', abertas.length, abertas.some(medidaVencida) ? `${abertas.filter(medidaVencida).length} com prazo vencido` : 'aberto ou em investigação', 'abertas')}
    </div>
    ${r.obitos ? `<div class="aviso erro" style="margin-top:12px"><b>${r.obitos} óbito(s) registrado(s) em ${S.ano}.</b></div>` : ''}

    <div class="qp-bloco">
      <h3>Precisa de atenção</h3>
      <p class="dica" style="margin:0 0 8px">CAT a emitir, quem está afastado e medida com prazo vencido.</p>
      ${tabelaAtencao([...new Set([...pend, ...afast, ...S.regs.filter(medidaVencida)])])}
    </div>

    <div class="qp-bloco">
      <h3>Mês a mês · ${S.ano}</h3>
      ${tabelaMeses(r.doAno)}
    </div>

    <div class="ac-grade3">
      <div class="qp-bloco"><h3>Por tipo</h3>${tabelaContagem(contarPor(r.doAno, a => TIPOS[a.tipo]?.nome), 'Tipo')}</div>
      <div class="qp-bloco"><h3>Parte do corpo</h3>${tabelaContagem(contarPor(r.ac, a => a.parte_corpo), 'Parte')}</div>
      <div class="qp-bloco"><h3>Agente causador</h3>${tabelaContagem(contarPor(r.doAno, a => a.agente_causador), 'Agente')}</div>
      <div class="qp-bloco"><h3>Setor</h3>${tabelaContagem(contarPor(r.doAno, a => a.setor || funcionario(a.funcionario_id)?.setor), 'Setor')}</div>
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="acPnImprimir">Imprimir o painel</button>
    <button class="btn" type="button" id="acPnExcel">Exportar Excel</button>
  </div>`;

  $('acPnAno').addEventListener('change', e => { S.ano = e.target.value; desenharPainel(); });
  $('acPnNovo').addEventListener('click', () => formulario(null));
  $('acPnImprimir').addEventListener('click', () => mostrar(docPainel(), { barra: true }));
  $('acPnExcel').addEventListener('click', () => exportar(S.regs.filter(a => anoDe(a) === S.ano), `Acidentes_${S.ano}`));
  tela.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => verRegistro(b.dataset.ver)));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => irParaLista(b.dataset.ir)));
}

function tabelaAtencao(lista) {
  if (!lista.length) return '<div class="vazio">Nada pendente. Tudo em ordem.</div>';
  lista.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  return `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th>Funcionário</th><th class="ce">Data</th><th>Tipo</th><th>O que falta</th><th></th></tr></thead><tbody>
    ${lista.map(a => {
      const c = catDe(a);
      const itens = [];
      if (catPendente(a)) itens.push(`<span class="tag ${c.cor}">CAT · ${esc(c.rotulo)}</span>`);
      if (afastadoHoje(a)) itens.push(`<span class="tag neutra">Afastado há ${diasPerdidos(a)} dia(s)${a.retorno_previsto ? ` · volta ${br(a.retorno_previsto)}` : ''}</span>`);
      if (a.situacao !== 'encerrado' && a.medidas_prazo && a.medidas_prazo < hoje())
        itens.push(`<span class="tag perigo">Medida vencida em ${br(a.medidas_prazo)}</span>`);
      if (afastadoHoje(a) && diasPerdidos(a) > 15) itens.push('<span class="tag alerta">Mais de 15 dias: INSS</span>');
      return `<tr><td><b>${esc(nomeDe(a))}</b><br><span class="dc-sem">${esc(a.funcao || funcionario(a.funcionario_id)?.cargo || '—')}</span></td>
        <td class="ce">${br(a.data)}</td><td>${esc(TIPOS[a.tipo]?.nome || '')}</td>
        <td>${itens.join(' ')}</td>
        <td class="ce"><button class="btn mini" type="button" data-ver="${a.id}">Abrir</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function tabelaMeses(doAno) {
  const linhas = MESES.map((m, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const doMes = doAno.filter(a => String(a.data).slice(5, 7) === mm);
    const ac = doMes.filter(comLesao);
    return { m, ac: ac.length, af: ac.filter(a => a.afastamento).length,
      dias: ac.reduce((t, a) => t + diasPerdidos(a), 0), quase: doMes.filter(a => a.tipo === 'incidente').length };
  });
  const max = Math.max(1, ...linhas.map(l => l.ac));
  const tot = k => linhas.reduce((t, l) => t + l[k], 0);
  return `<div class="ac-rola"><table class="dc-planilha ac-meses"><thead><tr>
    <th>Mês</th><th class="ce">Acidentes</th><th></th><th class="ce">Com afastamento</th><th class="ce">Dias perdidos</th><th class="ce">Quase acidentes</th>
  </tr></thead><tbody>
    ${linhas.map(l => `<tr><td>${l.m}</td><td class="ce">${l.ac || '—'}</td>
      <td class="ac-barra-cel">${barra(l.ac, max)}</td>
      <td class="ce">${l.af || '—'}</td><td class="ce">${l.dias || '—'}</td><td class="ce">${l.quase || '—'}</td></tr>`).join('')}
    <tr class="ac-total"><td><b>Total</b></td><td class="ce"><b>${tot('ac')}</b></td><td></td>
      <td class="ce"><b>${tot('af')}</b></td><td class="ce"><b>${tot('dias')}</b></td><td class="ce"><b>${tot('quase')}</b></td></tr>
  </tbody></table></div>`;
}
/* Barra em SVG: forma vetorial imprime com "gráficos de plano de fundo" desligado. */
const barra = (n, max) => n ? `<svg class="ac-barra" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
  <rect x="0" y="1" width="${Math.max(3, n * 100 / max)}" height="8" rx="2" fill="#744F28"/></svg>` : '';

function tabelaContagem(pares, rot) {
  if (!pares.length) return '<div class="vazio">Nada no ano.</div>';
  const tot = pares.reduce((t, p) => t + p[1], 0);
  return `<table class="dc-planilha"><thead><tr><th>${rot}</th><th class="ce">Qtde</th><th class="ce">%</th></tr></thead><tbody>
    ${pares.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="ce">${n}</td><td class="ce">${Math.round(n * 100 / tot)}%</td></tr>`).join('')}
  </tbody></table>`;
}

/** Os cartões apontam, a lista resolve. */
function irParaLista(alvo) {
  const f = S.filtro;
  Object.assign(f, { ano: '', tipo: '', sit: '', cat: '', q: '' });
  if (alvo === 'ano') { f.ano = S.ano; f.tipo = 'lesao'; }
  if (alvo === 'quase') { f.ano = S.ano; f.tipo = 'incidente'; }
  if (alvo === 'cat') f.cat = 'pendente';
  if (alvo === 'afast') f.cat = 'afastado';
  if (alvo === 'abertas') f.sit = 'naoencerrado';
  abrirModulo('sst', 'acLista');
}

/* ===================================================================
   TELA · REGISTROS
   =================================================================== */
function filtrados() {
  const f = S.filtro;
  const q = so(f.q).toLowerCase();
  return S.regs.filter(a => {
    if (f.ano && anoDe(a) !== f.ano) return false;
    if (f.tipo === 'lesao' && !comLesao(a)) return false;
    if (f.tipo && f.tipo !== 'lesao' && a.tipo !== f.tipo) return false;
    if (f.sit === 'naoencerrado' && a.situacao === 'encerrado') return false;
    if (f.sit && f.sit !== 'naoencerrado' && a.situacao !== f.sit) return false;
    if (f.cat === 'pendente' && !catPendente(a)) return false;
    if (f.cat === 'afastado' && !afastadoHoje(a)) return false;
    if (f.cat === 'comafast' && !a.afastamento) return false;
    if (q && ![nomeDe(a), a.descricao, a.local, a.cat_numero].some(t => so(t).toLowerCase().includes(q))) return false;
    return true;
  });
}

function desenharLista() {
  const tela = $('telaAcLista');
  const f = S.filtro;
  const sel = (id, ops, val) => `<select id="${id}">${ops.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Acidentes e CAT</h2>
        <p class="dica" style="margin:2px 0 0">Cada ocorrência com a lesão, o afastamento, a CAT e a investigação.</p></div>
      <button class="btn principal" type="button" id="acNovo">Registrar ocorrência</button>
    </div>
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Buscar <input type="text" id="acQ" value="${esc(f.q)}" placeholder="Nome, descrição, local ou nº da CAT"></label>
      <label class="campo">Ano ${sel('acAno', [['', 'Todos'], ...anos().map(a => [a, a])], f.ano)}</label>
      <label class="campo">Tipo ${sel('acTipo', [['', 'Todos'], ['lesao', 'Só acidentes (com lesão)'], ...Object.entries(TIPOS).map(([k, t]) => [k, t.longo])], f.tipo)}</label>
      <label class="campo">Situação ${sel('acSit', [['', 'Todas'], ['naoencerrado', 'Não encerradas'], ...Object.entries(SITUACOES).map(([k, s]) => [k, s[0]])], f.sit)}</label>
      <label class="campo">CAT e afastamento ${sel('acCat', [['', 'Todos'], ['pendente', 'CAT a emitir'], ['comafast', 'Com afastamento'], ['afastado', 'Afastados hoje']], f.cat)}</label>
    </div>
    <div class="barra" id="acResumo"></div>
    <div id="acTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="acImprimir">Imprimir a lista</button>
    <button class="btn" type="button" id="acExcel">Exportar Excel</button>
  </div>`;

  const ligarF = (id, campo, ev = 'change') => $(id).addEventListener(ev, e => { f[campo] = e.target.value; desenharTabela(); });
  ligarF('acQ', 'q', 'input'); ligarF('acAno', 'ano'); ligarF('acTipo', 'tipo'); ligarF('acSit', 'sit'); ligarF('acCat', 'cat');
  $('acNovo').addEventListener('click', () => formulario(null));
  $('acImprimir').addEventListener('click', () => mostrar(docLista(filtrados()), { barra: true }));
  $('acExcel').addEventListener('click', () => exportar(filtrados(), `Acidentes_${hoje()}`));
  desenharTabela();
}

function desenharTabela() {
  const lista = filtrados();
  const ac = lista.filter(comLesao);
  $('acResumo').innerHTML = `
    <span class="contagem"><b>${lista.length}</b> ocorrência(s)</span>
    <span class="contagem"><b>${ac.length}</b> acidente(s)</span>
    <span class="contagem"><b>${ac.filter(a => a.afastamento).length}</b> com afastamento</span>
    <span class="contagem"><b>${ac.reduce((t, a) => t + diasPerdidos(a), 0)}</b> dia(s) perdido(s)</span>
    <span class="contagem"><b>${lista.filter(catPendente).length}</b> CAT a emitir</span>`;
  $('acTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th class="ce">Data</th><th>Funcionário</th><th>Tipo</th><th>Lesão</th>
    <th class="ce">Afastamento</th><th class="ce">CAT</th><th class="ce">Situação</th><th></th>
  </tr></thead><tbody>
  ${lista.map(a => {
    const c = catDe(a);
    const est = estabilidadeAte(a);
    return `<tr>
      <td class="ce">${br(a.data)}${a.hora ? `<br><span class="dc-sem">${esc(String(a.hora).slice(0, 5))}</span>` : ''}</td>
      <td><b>${esc(nomeDe(a))}</b><br><span class="dc-sem">${esc(a.funcao || funcionario(a.funcionario_id)?.cargo || '—')}</span></td>
      <td>${esc(TIPOS[a.tipo]?.nome || '')}${a.obito ? ' <span class="tag perigo">óbito</span>' : ''}</td>
      <td>${esc([a.natureza_lesao, a.parte_corpo].filter(Boolean).join(' · ') || '—')}</td>
      <td class="ce">${a.afastamento ? `${diasPerdidos(a)} dia(s)${afastadoHoje(a) ? '<br><span class="tag neutra">afastado</span>' : ''}${est && est >= hoje() ? `<br><span class="dc-sem">estável até ${br(est)}</span>` : ''}` : '—'}</td>
      <td class="ce"><span class="tag ${c.cor}">${esc(c.rotulo)}</span>${a.cat_numero ? `<br><span class="dc-sem">nº ${esc(a.cat_numero)}</span>` : ''}</td>
      <td class="ce"><span class="tag ${SITUACOES[a.situacao][1]}">${SITUACOES[a.situacao][0]}</span></td>
      <td class="ce"><button class="btn mini" type="button" data-ver="${a.id}">Abrir</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`
    : `<div class="vazio">${S.regs.length ? 'Nada com esses filtros.' : 'Nenhuma ocorrência registrada. Use “Registrar ocorrência”.'}</div>`;
  $('acTabela').querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => verRegistro(b.dataset.ver)));
}

/* ===================================================================
   DIÁLOGO
   =================================================================== */
function dialogo(html, ligar) {
  let d = $('dlgAc');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgAc'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgAc')?.open && $('dlgAc').close();
const lista = (id, itens) => `<datalist id="${id}">${itens.map(i => `<option value="${esc(i)}">`).join('')}</datalist>`;

function formulario(id) {
  const a = id ? S.regs.find(x => x.id === id) : null;
  const v = a || { tipo: 'tipico', data: hoje(), situacao: 'aberto' };
  const pessoas = (estado.funcionarios || [])
    .filter(f => f.situacao === 'ATIVO' || f.id === v.funcionario_id)
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  const val = k => esc(v[k] ?? '');
  const chk = k => v[k] ? 'checked' : '';

  dialogo(`<h3>${a ? 'Editar ocorrência' : 'Registrar ocorrência'}</h3>
    <div class="aviso erro" id="acErro" hidden></div>

    <h4 class="ac-h4">O que aconteceu</h4>
    <div class="grade">
      <label class="campo">Tipo <select id="acfTipo">${Object.entries(TIPOS).map(([k, t]) =>
        `<option value="${k}" ${k === v.tipo ? 'selected' : ''}>${esc(t.longo)}</option>`).join('')}</select></label>
      <label class="campo">Funcionário <span class="dc-sem" id="acfFuncDica"></span>
        <select id="acfFunc"><option value="">Escolha...</option>${pessoas.map(f =>
          `<option value="${f.id}" ${f.id === v.funcionario_id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
      <label class="campo">Data <input type="date" id="acfData" value="${val('data')}" max="${hoje()}" required></label>
      <label class="campo">Hora <input type="time" id="acfHora" value="${esc(String(v.hora || '').slice(0, 5))}"></label>
      <label class="campo">Local <input type="text" id="acfLocal" maxlength="150" value="${val('local')}" placeholder="Fazenda, talhão, galpão..."></label>
      <label class="campo">Atividade no momento <input type="text" id="acfAtiv" maxlength="150" value="${val('atividade')}" placeholder="Ex.: colheita, aplicação, manutenção"></label>
      <label class="campo plena">Descrição <textarea id="acfDesc" rows="3" maxlength="2000" placeholder="Como aconteceu, na ordem dos fatos">${val('descricao')}</textarea></label>
    </div>

    <div id="acfLesaoBloco">
    <h4 class="ac-h4">Lesão e atendimento</h4>
    <div class="grade">
      <label class="campo">Parte do corpo <input type="text" id="acfParte" list="acListaPartes" maxlength="80" value="${val('parte_corpo')}"></label>
      <label class="campo">Natureza da lesão <input type="text" id="acfNat" list="acListaNat" maxlength="80" value="${val('natureza_lesao')}"></label>
      <label class="campo">Agente causador <input type="text" id="acfAgente" list="acListaAg" maxlength="120" value="${val('agente_causador')}"></label>
      <label class="campo">CID <small>se houver atestado</small><input type="text" id="acfCid" maxlength="12" value="${val('cid')}"></label>
      <label class="campo plena">Atendimento <input type="text" id="acfAtend" maxlength="200" value="${val('atendimento')}" placeholder="Primeiros socorros no local, UPA, hospital..."></label>
      <label class="campo rs-check"><input type="checkbox" id="acfObito" ${chk('obito')}> Houve óbito</label>
    </div>

    <h4 class="ac-h4">Afastamento</h4>
    <div class="grade">
      <label class="campo rs-check plena"><input type="checkbox" id="acfAfast" ${chk('afastamento')}> Houve afastamento do trabalho</label>
      <label class="campo ac-af">Início <input type="date" id="acfAfIni" value="${val('afastamento_inicio')}"></label>
      <label class="campo ac-af">Retorno previsto <input type="date" id="acfAfPrev" value="${val('retorno_previsto')}"></label>
      <label class="campo ac-af">Retornou em <input type="date" id="acfAfRet" value="${val('retorno_em')}"></label>
      <label class="campo ac-af">Dias perdidos <small>calcula sozinho</small><input type="number" id="acfAfDias" min="0" step="1" value="${val('dias_afastamento')}"></label>
      <p class="dica plena ac-af" id="acfAfDica"></p>
    </div>

    <h4 class="ac-h4">CAT</h4>
    <p class="dica" id="acfCatPrazo" style="margin-top:-4px"></p>
    <div class="grade">
      <label class="campo rs-check plena"><input type="checkbox" id="acfCatOk" ${chk('cat_emitida')}> CAT emitida</label>
      <label class="campo ac-cat">Nº da CAT <input type="text" id="acfCatNum" maxlength="40" value="${val('cat_numero')}"></label>
      <label class="campo ac-cat">Emitida em <input type="date" id="acfCatData" value="${val('cat_data')}"></label>
      <label class="campo ac-cat">Tipo da CAT <select id="acfCatTipo"><option value="">—</option>${Object.entries(CAT_TIPOS).map(([k, t]) =>
        `<option value="${k}" ${k === v.cat_tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo ac-cat">Emitente <input type="text" id="acfCatEmit" maxlength="120" value="${val('cat_emitente')}" placeholder="Empregador, contabilidade..."></label>
    </div>
    </div>

    <h4 class="ac-h4">Investigação</h4>
    <div class="grade">
      <label class="campo plena">Testemunhas <input type="text" id="acfTest" maxlength="300" value="${val('testemunhas')}"></label>
      <label class="campo plena">Causas <textarea id="acfCausas" rows="2" maxlength="2000" placeholder="Por que aconteceu">${val('causas')}</textarea></label>
      <label class="campo plena">Medidas para não repetir <textarea id="acfMedidas" rows="2" maxlength="2000">${val('medidas')}</textarea></label>
      <label class="campo">Responsável pelas medidas <input type="text" id="acfResp" maxlength="120" value="${val('medidas_responsavel')}"></label>
      <label class="campo">Prazo das medidas <input type="date" id="acfPrazo" value="${val('medidas_prazo')}"></label>
      <label class="campo">Situação <select id="acfSit">${Object.entries(SITUACOES).map(([k, s]) =>
        `<option value="${k}" ${k === v.situacao ? 'selected' : ''}>${s[0]}</option>`).join('')}</select></label>
      <label class="campo plena">Observação <input type="text" id="acfObs" maxlength="500" value="${val('observacao')}"></label>
    </div>
    ${lista('acListaPartes', PARTES)}${lista('acListaNat', NATUREZAS)}${lista('acListaAg', AGENTES)}

    <div class="barra fim">
      ${a ? '<button class="btn perigo" type="button" id="acfApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="acfGravar">Gravar</button>
    </div>`, () => {
    const atualizar = () => {
      const tipo = $('acfTipo').value;
      const t = TIPOS[tipo];
      $('acfLesaoBloco').hidden = tipo === 'incidente';
      $('acfFuncDica').textContent = tipo === 'incidente' ? '(opcional)' : '';
      const af = $('acfAfast').checked;
      document.querySelectorAll('#dlgAc .ac-af').forEach(e => { e.hidden = !af; });
      const catOk = $('acfCatOk').checked;
      document.querySelectorAll('#dlgAc .ac-cat').forEach(e => { e.hidden = !catOk; });
      // dias perdidos sozinhos, enquanto ninguém digitou por cima
      const ini = $('acfAfIni').value, ret = $('acfAfRet').value;
      const dd = $('acfAfDias');
      if (af && ini && dd.dataset.mexido !== '1') dd.value = Math.max(0, entre(ini, ret || hoje()));
      const dias = Number(dd.value) || 0;
      $('acfAfDica').innerHTML = af && dias > 15
        ? `Mais de 15 dias: do 16º dia em diante o afastamento é com o INSS.${ret ? ` Estabilidade provável até <b>${br(somaMeses(ret, 12))}</b> (12 meses após a alta).` : ''}`
        : '';
      const data = $('acfData').value;
      const prazo = data && t.cat ? prazoCat({ data, obito: $('acfObito').checked }) : null;
      $('acfCatPrazo').innerHTML = !t.cat ? 'Quase acidente não pede CAT.'
        : prazo ? `Prazo legal: <b>${br(prazo)}</b> ${$('acfObito').checked ? '(óbito: comunicar imediatamente)' : '(1º dia útil depois da ocorrência)'}.`
        : 'Informe a data para ver o prazo.';
      if ($('acfObito').checked && !$('acfCatTipo').value) $('acfCatTipo').value = 'obito';
      if (catOk && !$('acfCatTipo').value) $('acfCatTipo').value = 'inicial';
    };
    ['acfTipo', 'acfAfast', 'acfCatOk', 'acfAfIni', 'acfAfRet', 'acfData', 'acfObito'].forEach(i =>
      $(i).addEventListener('change', atualizar));
    $('acfAfDias').addEventListener('input', () => { $('acfAfDias').dataset.mexido = '1'; atualizar(); });
    if (a?.dias_afastamento != null) $('acfAfDias').dataset.mexido = '1';
    atualizar();

    $('acfGravar').addEventListener('click', () => gravar(a));
    $('acfApagar')?.addEventListener('click', () => apagar(a));
  });
}

async function gravar(a) {
  const erro = t => { $('acErro').textContent = t; $('acErro').hidden = false; $('dlgAc').scrollTop = 0; };
  const g = id => so($(id).value) || null;
  const tipo = $('acfTipo').value;
  const lesao = tipo !== 'incidente';
  const f = funcionario($('acfFunc').value);
  const linha = {
    tipo,
    funcionario_id: f?.id || null,
    data: g('acfData'), hora: g('acfHora'),
    local: g('acfLocal'), atividade: g('acfAtiv'), descricao: g('acfDesc'),
    funcao: a?.funcao || f?.cargo || null, setor: a?.setor || f?.setor || null,
    parte_corpo: lesao ? g('acfParte') : null, natureza_lesao: lesao ? g('acfNat') : null,
    agente_causador: g('acfAgente'), cid: lesao ? g('acfCid') : null, atendimento: lesao ? g('acfAtend') : null,
    obito: lesao && $('acfObito').checked,
    afastamento: lesao && $('acfAfast').checked,
    testemunhas: g('acfTest'), causas: g('acfCausas'), medidas: g('acfMedidas'),
    medidas_responsavel: g('acfResp'), medidas_prazo: g('acfPrazo'),
    situacao: $('acfSit').value, observacao: g('acfObs'),
    cat_emitida: lesao && $('acfCatOk').checked,
    atualizado_em: new Date().toISOString(),
  };
  // trocar de pessoa refaz a foto de função e setor
  if (a && a.funcionario_id !== linha.funcionario_id) { linha.funcao = f?.cargo || null; linha.setor = f?.setor || null; }
  Object.assign(linha, linha.afastamento ? {
    afastamento_inicio: g('acfAfIni'), retorno_previsto: g('acfAfPrev'), retorno_em: g('acfAfRet'),
    dias_afastamento: $('acfAfDias').value === '' ? null : Math.max(0, Math.round(Number($('acfAfDias').value))),
  } : { afastamento_inicio: null, retorno_previsto: null, retorno_em: null, dias_afastamento: null });
  Object.assign(linha, linha.cat_emitida ? {
    cat_numero: g('acfCatNum'), cat_data: g('acfCatData'), cat_tipo: $('acfCatTipo').value || null, cat_emitente: g('acfCatEmit'),
  } : { cat_numero: null, cat_data: null, cat_tipo: null, cat_emitente: null });

  if (!linha.data) return erro('Informe a data da ocorrência.');
  if (linha.data > hoje()) return erro('A data não pode ser futura.');
  if (lesao && !linha.funcionario_id) return erro('Escolha o funcionário. Só o quase acidente pode ficar sem vítima.');
  if (!linha.descricao) return erro('Descreva o que aconteceu.');
  if (linha.afastamento && !linha.afastamento_inicio) return erro('Informe o início do afastamento.');
  if (linha.afastamento && linha.afastamento_inicio < linha.data)
    return erro('O afastamento não pode começar antes da data da ocorrência.');
  if (linha.afastamento && linha.retorno_em && linha.retorno_em < linha.afastamento_inicio)
    return erro('O retorno não pode ser antes do início do afastamento.');
  if (linha.cat_emitida && !linha.cat_data) return erro('Informe a data de emissão da CAT.');

  $('acfGravar').disabled = true;
  try {
    const c = estado.cliente.from('sst_acidentes');
    const { data, error } = a
      ? await c.update(linha).eq('id', a.id).select().single()
      : await c.insert({ ...linha, criado_por: quem() }).select().single();
    if (error) throw error;
    if (a) S.regs[S.regs.findIndex(x => x.id === a.id)] = data;
    else S.regs.unshift(data);
    S.regs.sort((x, y) => (y.data || '').localeCompare(x.data || ''));
    fechar(); redesenhar();
    verRegistro(data.id);
  } catch (e) { $('acfGravar').disabled = false; erro('Não consegui gravar: ' + (e.message || e)); }
}

function apagar(a) {
  dialogo(`<h3>Apagar a ocorrência</h3>
    <p>${esc(nomeDe(a))} · ${br(a.data)} · ${esc(TIPOS[a.tipo]?.longo || '')}</p>
    <p class="dica">Some do painel e da lista e não volta. Use só para lançamento feito por engano.</p>
    <div class="aviso erro" id="acApErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn perigo" type="button" id="acApOk">Apagar</button></div>`, d => {
    $('acApOk').addEventListener('click', async () => {
      $('acApOk').disabled = true;
      const { error } = await estado.cliente.from('sst_acidentes').delete().eq('id', a.id);
      if (error) { $('acApOk').disabled = false; $('acApErro').textContent = 'Não consegui apagar: ' + error.message; $('acApErro').hidden = false; return; }
      S.regs = S.regs.filter(x => x.id !== a.id);
      d.close(); redesenhar();
    });
  });
}

/** A ficha da ocorrência, para ler antes de editar ou imprimir. */
function verRegistro(id) {
  const a = S.regs.find(x => x.id === id);
  if (!a) return;
  dialogo(`${corpoRegistro(a, true)}
    <div class="barra fim">
      <button class="btn" type="button" data-fechar>Fechar</button>
      <button class="btn" type="button" id="acvImprimir">Imprimir</button>
      <button class="btn principal" type="button" id="acvEditar">Editar</button>
    </div>`, () => {
    $('acvEditar').addEventListener('click', () => formulario(id));
    $('acvImprimir').addEventListener('click', () => { fechar(); mostrar(docRegistro(a), { barra: true }); });
  });
}

/** Os blocos da ficha: servem ao diálogo (tela) e ao documento (papel). */
function corpoRegistro(a, tela = false) {
  const f = funcionario(a.funcionario_id);
  const c = catDe(a);
  const est = estabilidadeAte(a);
  const campo = (rot, v) => `<div><span>${esc(rot)}</span><b>${v == null || v === '' ? '—' : v}</b></div>`;
  const tx = v => esc(v || '');
  const secao = t => tela ? `<h4 class="ac-h4">${t}</h4>` : `<div class="rel-secao">${t}</div>`;
  const texto = (rot, v) => v ? `${tela ? `<p class="ac-rot">${rot}</p>` : `<p class="rel-nota"><b>${rot}</b></p>`}<div class="rel-memoria">${esc(v)}</div>` : '';
  return `${tela ? `<h3>${esc(nomeDe(a))} · ${br(a.data)}</h3>
    <p class="dica" style="margin-top:-8px"><span class="tag ${SITUACOES[a.situacao][1]}">${SITUACOES[a.situacao][0]}</span>
      ${esc(TIPOS[a.tipo]?.longo || '')}${a.obito ? ' · <span class="tag perigo">óbito</span>' : ''}</p>` : ''}
    ${secao('Ocorrência')}
    <div class="rel-ficha">
      ${campo('Funcionário', tx(nomeDe(a)))}${campo('Função', tx(a.funcao || f?.cargo))}${campo('Setor', tx(a.setor || f?.setor))}
      ${campo('Tipo', tx(TIPOS[a.tipo]?.longo))}${campo('Data e hora', `${br(a.data)}${a.hora ? ' às ' + esc(String(a.hora).slice(0, 5)) : ''}`)}${campo('Local', tx(a.local))}
      ${campo('Atividade', tx(a.atividade))}${campo('Agente causador', tx(a.agente_causador))}${campo('Testemunhas', tx(a.testemunhas))}
    </div>
    ${texto('Descrição', a.descricao)}
    ${a.tipo !== 'incidente' ? `${secao('Lesão, afastamento e CAT')}
    <div class="rel-ficha">
      ${campo('Parte do corpo', tx(a.parte_corpo))}${campo('Natureza', tx(a.natureza_lesao))}${campo('CID', tx(a.cid))}
      ${campo('Atendimento', tx(a.atendimento))}
      ${campo('Afastamento', a.afastamento ? `${diasPerdidos(a)} dia(s)${afastadoHoje(a) ? ' · ainda afastado' : ''}` : 'Não')}
      ${campo('Período', a.afastamento ? `${br(a.afastamento_inicio)} a ${a.retorno_em ? br(a.retorno_em) : `— (previsto ${br(a.retorno_previsto)})`}` : '—')}
      ${campo('CAT', `${esc(c.rotulo)}${a.cat_numero ? ' · nº ' + esc(a.cat_numero) : ''}`)}
      ${campo('Emissão da CAT', a.cat_emitida ? `${br(a.cat_data)}${a.cat_tipo ? ' · ' + CAT_TIPOS[a.cat_tipo] : ''}` : '—')}
      ${campo('Prazo legal da CAT', br(c.prazo))}
      ${est ? campo('Estabilidade provável até', br(est)) : ''}
    </div>` : ''}
    ${secao('Investigação')}
    ${texto('Causas', a.causas)}${texto('Medidas para não repetir', a.medidas)}
    <div class="rel-ficha">
      ${campo('Responsável', tx(a.medidas_responsavel))}${campo('Prazo', br(a.medidas_prazo))}${campo('Situação', SITUACOES[a.situacao][0])}
    </div>
    ${texto('Observação', a.observacao)}
    ${!a.causas && !a.medidas ? `<p class="${tela ? 'dica' : 'rel-nota'}">Causas e medidas ainda não registradas.</p>` : ''}`;
}

/* ===================================================================
   DOCUMENTOS E EXCEL
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

function docRegistro(a) {
  return documento({ titulo: 'Registro de ocorrência', subtitulo: 'Acidente de trabalho · investigação e CAT',
    canto: br(a.data), corpo: corpoRegistro(a, false) });
}

function docLista(lista) {
  const ac = lista.filter(comLesao);
  return documento({ titulo: 'Acidentes e CAT', subtitulo: 'Ocorrências registradas no SST', canto: `${lista.length} ocorrência(s)`, paisagem: true,
    corpo: `<div class="rel-resumo"><b>${ac.length}</b> acidente(s) · <b>${ac.filter(a => a.afastamento).length}</b> com afastamento ·
      <b>${ac.reduce((t, a) => t + diasPerdidos(a), 0)}</b> dia(s) perdido(s) · <b>${lista.filter(a => a.tipo === 'incidente').length}</b> quase acidente(s) ·
      <b>${lista.filter(catPendente).length}</b> CAT a emitir</div>
    <table class="rel-tabela"><thead><tr><th>Data</th><th>Funcionário</th><th>Função</th><th>Tipo</th><th>Lesão</th>
      <th class="rel-num">Dias</th><th>CAT</th><th>Situação</th></tr></thead><tbody>
    ${lista.map(a => {
      const c = catDe(a);
      return `<tr><td>${br(a.data)}</td><td>${esc(nomeDe(a))}</td><td>${esc(a.funcao || funcionario(a.funcionario_id)?.cargo || '')}</td>
        <td>${esc(TIPOS[a.tipo]?.nome || '')}${a.obito ? ' · óbito' : ''}</td>
        <td>${esc([a.natureza_lesao, a.parte_corpo].filter(Boolean).join(' · '))}</td>
        <td class="rel-num">${a.afastamento ? diasPerdidos(a) : ''}</td>
        <td class="${c.chave === 'emitida' ? 'rel-ok' : catPendente(a) || c.chave === 'foraprazo' ? 'rel-pend' : ''}">${esc(c.rotulo)}${a.cat_numero ? ' · nº ' + esc(a.cat_numero) : ''}</td>
        <td class="${a.situacao === 'encerrado' ? 'rel-ok' : 'rel-pend'}">${SITUACOES[a.situacao][0]}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="rel-vazio">Nenhuma ocorrência.</td></tr>'}</tbody></table>
    <p class="rel-nota">CAT: prazo legal até o 1º dia útil após a ocorrência; no óbito, imediatamente (art. 22 da Lei 8.213/91). Quase acidente não pede CAT.</p>` });
}

function docPainel() {
  const r = resumoAno(S.ano);
  const sem = diasSemAcidente();
  const pend = S.regs.filter(catPendente);
  const afast = S.regs.filter(afastadoHoje);
  const linhasMes = MESES.map((m, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const doMes = r.doAno.filter(a => String(a.data).slice(5, 7) === mm);
    const ac = doMes.filter(comLesao);
    return `<tr><td>${m}</td><td class="rel-num">${ac.length || ''}</td><td class="rel-num">${ac.filter(a => a.afastamento).length || ''}</td>
      <td class="rel-num">${ac.reduce((t, a) => t + diasPerdidos(a), 0) || ''}</td><td class="rel-num">${doMes.filter(a => a.tipo === 'incidente').length || ''}</td></tr>`;
  }).join('');
  const cont = (titulo, pares) => `<div class="rel-secao">${titulo}</div><table class="rel-tabela"><thead><tr><th>${titulo}</th><th class="rel-num">Qtde</th></tr></thead><tbody>
    ${pares.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="rel-num">${n}</td></tr>`).join('') || '<tr><td colspan="2" class="rel-vazio">Nada no ano.</td></tr>'}</tbody></table>`;
  return documento({ titulo: 'Painel de acidentes', subtitulo: `SST · ano de ${S.ano}`, canto: S.ano,
    corpo: `<div class="rel-ficha">
        <div><span>Dias sem acidente com lesão</span><b>${sem ? `${sem.dias} (desde ${br(sem.desde)})` : '—'}</b></div>
        <div><span>Acidentes no ano</span><b>${r.acidentes} · ${r.comAfast} com afastamento</b></div>
        <div><span>Dias perdidos no ano</span><b>${r.dias}</b></div>
        <div><span>Quase acidentes no ano</span><b>${r.quase}</b></div>
        <div><span>CAT a emitir (hoje)</span><b>${pend.length}</b></div>
        <div><span>Afastados hoje</span><b>${afast.length}</b></div>
      </div>
      <div class="rel-secao">Mês a mês</div>
      <table class="rel-tabela"><thead><tr><th>Mês</th><th class="rel-num">Acidentes</th><th class="rel-num">Com afastamento</th>
        <th class="rel-num">Dias perdidos</th><th class="rel-num">Quase acidentes</th></tr></thead><tbody>${linhasMes}</tbody>
        <tfoot><tr><td><b>Total</b></td><td class="rel-num"><b>${r.acidentes}</b></td><td class="rel-num"><b>${r.comAfast}</b></td>
        <td class="rel-num"><b>${r.dias}</b></td><td class="rel-num"><b>${r.quase}</b></td></tr></tfoot></table>
      ${cont('Parte do corpo', contarPor(r.ac, a => a.parte_corpo))}
      ${cont('Agente causador', contarPor(r.doAno, a => a.agente_causador))}
      ${pend.length || afast.length ? `<div class="rel-secao">Pendências de hoje</div>
        <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Data</th><th>Pendência</th></tr></thead><tbody>
        ${[...new Set([...pend, ...afast])].map(a => `<tr><td>${esc(nomeDe(a))}</td><td>${br(a.data)}</td>
          <td class="rel-pend">${[catPendente(a) ? 'CAT: ' + catDe(a).rotulo : '', afastadoHoje(a) ? `afastado há ${diasPerdidos(a)} dia(s)` : ''].filter(Boolean).join(' · ')}</td></tr>`).join('')}
        </tbody></table>` : ''}` });
}

async function exportar(lista, nome) {
  try {
    await baixarXlsx(nome, [{
      nome: 'Ocorrências', titulo: 'Acidentes e CAT · SAKUMA', subtitulo: `Emitido em ${br(hoje())}`,
      colunas: [
        { rot: 'Data', tipo: 'data', larg: 11 }, { rot: 'Hora', larg: 7 }, { rot: 'Tipo', larg: 18 },
        { rot: 'Funcionário', larg: 30 }, { rot: 'Função', larg: 20 }, { rot: 'Setor', larg: 14 },
        { rot: 'Local', larg: 20 }, { rot: 'Atividade', larg: 20 }, { rot: 'Descrição', larg: 50 },
        { rot: 'Parte do corpo', larg: 16 }, { rot: 'Natureza', larg: 16 }, { rot: 'Agente causador', larg: 22 }, { rot: 'CID', larg: 8 },
        { rot: 'Óbito', larg: 7 }, { rot: 'Afastamento', larg: 11 }, { rot: 'Início', tipo: 'data', larg: 11 },
        { rot: 'Retorno', tipo: 'data', larg: 11 }, { rot: 'Dias perdidos', tipo: 'num', casas: 0, larg: 10 },
        { rot: 'CAT', larg: 20 }, { rot: 'Nº CAT', larg: 16 }, { rot: 'Emissão CAT', tipo: 'data', larg: 11 }, { rot: 'Prazo CAT', tipo: 'data', larg: 11 },
        { rot: 'Causas', larg: 40 }, { rot: 'Medidas', larg: 40 }, { rot: 'Responsável', larg: 18 }, { rot: 'Prazo medidas', tipo: 'data', larg: 11 },
        { rot: 'Situação', larg: 14 },
      ],
      linhas: lista.map(a => {
        const c = catDe(a);
        return [a.data, a.hora ? String(a.hora).slice(0, 5) : '', TIPOS[a.tipo]?.longo || '',
          nomeDe(a), a.funcao || funcionario(a.funcionario_id)?.cargo || '', a.setor || funcionario(a.funcionario_id)?.setor || '',
          a.local || '', a.atividade || '', a.descricao || '',
          a.parte_corpo || '', a.natureza_lesao || '', a.agente_causador || '', a.cid || '',
          a.obito ? 'Sim' : '', a.afastamento ? 'Sim' : 'Não', a.afastamento_inicio || '', a.retorno_em || '',
          a.afastamento ? diasPerdidos(a) : '', c.rotulo, a.cat_numero || '', a.cat_data || '', c.prazo || '',
          a.causas || '', a.medidas || '', a.medidas_responsavel || '', a.medidas_prazo || '', SITUACOES[a.situacao][0]];
      }),
      notas: ['CAT: prazo legal até o 1º dia útil após a ocorrência; no óbito, imediatamente (art. 22 da Lei 8.213/91).'],
    }]);
  } catch (e) { alert('Não consegui gerar o Excel: ' + (e.message || e)); }
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_ACIDENTES = ['acPainel', 'acLista'];
let telaAtual = '';
function redesenhar() {
  if (telaAtual === 'acPainel') desenharPainel();
  else if (telaAtual === 'acLista') desenharLista();
}

export async function abrirAcidentes(tela) {
  const alvo = $(tela === 'acPainel' ? 'telaAcPainel' : 'telaAcLista');
  if (!alvo) return;
  telaAtual = tela;
  if (!S.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando os acidentes…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir os acidentes: ${esc(e.message || e)}</div></div>`; return; }
  }
  redesenhar();
}

export function limparAcidentes() {
  S.carregado = false; S.regs = []; S.ano = '';
  Object.assign(S.filtro, { ano: '', tipo: '', sit: '', cat: '', q: '' });
  telaAtual = ''; fechar();
}

/* Para testes. */
export const _ac = { S, prazoCat, catDe, diasPerdidos, estabilidadeAte, diasSemAcidente, resumoAno };
