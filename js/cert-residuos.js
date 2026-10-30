// cert-residuos.js — Certificação › Forms › Resíduos: gestão de resíduos (FORM 053), 27/10/2026.
//
// Pedido do Guilherme: "sobre gestão de resíduos, quero fazer esse form no app
// certificação, para ter indicadores". Atende o POP 004 (Gestão de Resíduos):
// o "registro de saída de resíduos" e a "avaliação do manejo de resíduos".
// Decisões dele: quantidade sempre em kg (pesada ou estimada); avaliação do
// manejo mensal, por fazenda, em check list C / NC / NA; sem meta por enquanto.
//
// Tabelas (supabase/cert-residuos.sql), trancadas por app_pode('cert'):
//  · cr_tipos       — nome, classe, destinação de costume, ordem, ativo
//  · cr_saidas      — data, fazenda_id, tipo_id, kg, destinação, destinatário, comprovante
//  · cr_avaliacoes  — competência (dia 1), fazenda_id, itens {chave: C|NC|NA}, avaliador
// Comprovante (MTR, NF de devolução, recibo): Drive certificacao/residuo/<id>/…
// Sem internet: só consulta (cópia 'residuos.cache').

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';
import { campoAnexos, donosComArquivo } from './arquivos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const n = parseFloat(String(v ?? '').replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (n, c = 0) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = am => { const [a, m] = am.slice(0, 7).split('-'); return `${MES3[Number(m) - 1]}/${a.slice(2)}`; };
const mesAtual = () => hoje().slice(0, 7);
function mesAnterior() { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}`; }

const FORM = { codigo: 'FORM 053', titulo: 'Gestão de resíduos', data: '01/12/2026', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };

export const CLASSES = ['Reciclável', 'Orgânico', 'Perigoso', 'Embalagem de agrotóxico', 'Rejeito'];
const COR_CLASSE = { 'Reciclável': 'ativo', 'Orgânico': 'ativo', 'Perigoso': 'perigo', 'Embalagem de agrotóxico': 'alerta', 'Rejeito': 'neutra' };
/* Destinações: as marcadas "reaproveita" entram no % reaproveitado (o resíduo
   volta a ser matéria-prima ou adubo, em vez de ir para aterro). */
export const DESTINOS = [
  { nome: 'Reciclagem', reaproveita: true },
  { nome: 'Compostagem', reaproveita: true },
  { nome: 'Reaproveitamento interno', reaproveita: true },
  { nome: 'Devolução de embalagens', reaproveita: true },
  { nome: 'Rerrefino / logística reversa', reaproveita: true },
  { nome: 'Empresa licenciada', reaproveita: false },
  { nome: 'Coleta municipal / aterro', reaproveita: false },
  { nome: 'Outro', reaproveita: false },
];
const reaproveita = d => !!DESTINOS.find(x => x.nome === d)?.reaproveita;

/* Check list mensal do manejo (POP 004 / GLOBALG.A.P. 25.x). A chave fica
   gravada; o texto pode ser ajustado aqui sem perder o histórico. */
export const ITENS = [
  ['lixeiras',     'Lixeiras identificadas por tipo de resíduo e em bom estado'],
  ['separacao',    'Resíduos separados corretamente, sem mistura entre tipos'],
  ['armazenamento','Área de armazenamento temporário coberta, identificada e organizada'],
  ['perigosos',    'Perigosos (óleo, filtros, baterias, lâmpadas) guardados em local com contenção'],
  ['embalagens',   'Embalagens vazias de agrotóxico lavadas (tríplice), furadas e no depósito próprio'],
  ['limpeza',      'Sede, oficina, beiras dos talhões e campo sem lixo espalhado'],
  ['queima',       'Nenhuma queima ou enterro de resíduos'],
  ['organicos',    'Restos orgânicos encaminhados à compostagem ou reaproveitamento'],
  ['comprovantes', 'Comprovantes de destinação do mês arquivados'],
  ['mapa',         'Mapa de resíduos (AN 55) atualizado e afixado'],
  ['equipe',       'Equipe orientada sobre a separação e o descarte'],
];

/* ---------------- estado ---------------- */
const E = {
  carregado: false, tipos: [], saidas: [], avals: [], faz: [], arq: new Set(),
  fp: { periodo: '', fazenda: '' },
  fs: { tipo: '', fazenda: '', ano: '', q: '' },
  fa: { ano: '' },
};
const CAIXA = 'residuos.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { tipos: E.tipos, saidas: E.saidas, avals: E.avals, faz: E.faz });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { tipos: c0.tipos || [], saidas: c0.saidas || [], avals: c0.avals || [], faz: c0.faz || [] }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia da gestão de resíduos neste aparelho.');
  }
  const [t, s, a, f] = await Promise.all([
    c.from('cr_tipos').select('*').order('ordem').order('nome'),
    c.from('cr_saidas').select('*').order('data', { ascending: false }),
    c.from('cr_avaliacoes').select('*').order('competencia', { ascending: false }),
    c.from('jor_fazendas').select('id, nome').eq('ativo', true).order('nome'),
  ]);
  const erro = t.error || s.error || a.error;
  if (erro && E.carregado) return;
  if (erro) {
    if (/cr_|relation|does not exist|schema cache/i.test(erro.message || '')) throw new Error('As tabelas de resíduos ainda não foram criadas no banco (supabase/cert-residuos.sql).');
    throw erro;
  }
  E.tipos = t.data || []; E.saidas = s.data || []; E.avals = a.data || [];
  if (!f.error) E.faz = f.data || [];
  E.carregado = true;
  salvarCaixa();
  E.arq = await donosComArquivo('certificacao', 'residuo').catch(() => new Set());
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const tipoPorId = id => E.tipos.find(x => x.id === id);
const fazPorId = id => E.faz.find(x => x.id === id);
const nomeFaz = id => fazPorId(id)?.nome || (id ? '?' : '—');
const curtoFaz = id => nomeFaz(id).replace(/^Faz\.\s*/i, '').replace(/^Fazenda\s*/i, '');
const temComprovante = s => !!so(s.comprovante) || E.arq.has(String(s.id));
const anos = () => [...new Set([...E.saidas.map(r => r.data.slice(0, 4)), ...E.avals.map(r => r.competencia.slice(0, 4))])].sort().reverse();
const periodoPadrao = () => anos()[0] || mesAtual().slice(0, 4);
function limites(p) {
  if (p === 'tudo') return ['', ''];
  if (p === '12m') { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return [`${d.getFullYear()}-${doisD(d.getMonth() + 1)}-01`, `${mesAtual()}-31`]; }
  return [`${p}-01-01`, `${p}-12-31`];
}
const rotPeriodo = p => p === 'tudo' ? 'todo o histórico' : p === '12m' ? 'últimos 12 meses' : `ano de ${p}`;
const dentro = (d, p) => { const [de, ate] = limites(p); return (!de || d >= de) && (!ate || d <= ate); };

/** Nota do check list: C ÷ (C + NC); NA fica de fora. */
export function nota(itens) {
  const v = Object.values(itens || {}); const c = v.filter(x => x === 'C').length, nc = v.filter(x => x === 'NC').length;
  return c + nc ? c / (c + nc) * 100 : null;
}
const ncsDe = a => ITENS.filter(([k]) => a.itens?.[k] === 'NC');

function resumo(p, fazenda) {
  const saidas = E.saidas.filter(s => dentro(s.data, p) && (!fazenda || s.fazenda_id === fazenda));
  const avals = E.avals.filter(a => dentro(a.competencia, p) && (!fazenda || a.fazenda_id === fazenda));
  const meses = [...new Set([...saidas.map(s => s.data.slice(0, 7)), ...avals.map(a => a.competencia.slice(0, 7))])].sort();
  const kg = l => l.reduce((t, s) => t + Number(s.kg || 0), 0);
  const porMes = meses.map(m => { const l = saidas.filter(s => s.data.startsWith(m));
    const re = kg(l.filter(s => reaproveita(s.destinacao))); const tot = kg(l);
    const av = avals.filter(a => a.competencia.startsWith(m)).map(a => nota(a.itens)).filter(x => x != null);
    return { m, re, nao: tot - re, tot, conf: av.length ? av.reduce((a, b) => a + b, 0) / av.length : null }; });
  const porClasse = CLASSES.map(c => { const l = saidas.filter(s => tipoPorId(s.tipo_id)?.classe === c);
    return { c, kg: kg(l), n: l.length, meses: Object.fromEntries(meses.map(m => [m, kg(l.filter(s => s.data.startsWith(m)))])) }; });
  const porTipo = E.tipos.map(t => { const l = saidas.filter(s => s.tipo_id === t.id); return { t, kg: kg(l), n: l.length }; }).filter(x => x.n);
  const porDestino = DESTINOS.map(d => { const l = saidas.filter(s => s.destinacao === d.nome); return { d, kg: kg(l), n: l.length }; }).filter(x => x.n);
  const fazIds = fazenda ? [fazenda] : E.faz.map(f => f.id);
  const porFaz = fazIds.map(id => { const l = saidas.filter(s => s.fazenda_id === id); const t = kg(l);
    const av = avals.filter(a => a.fazenda_id === id).map(a => nota(a.itens)).filter(x => x != null);
    return { id, kg: t, pctRe: t ? kg(l.filter(s => reaproveita(s.destinacao))) / t * 100 : null, n: l.length,
      conf: av.length ? av.reduce((a, b) => a + b, 0) / av.length : null, navals: av.length }; });
  const tot = kg(saidas), re = kg(saidas.filter(s => reaproveita(s.destinacao)));
  const perig = saidas.filter(s => tipoPorId(s.tipo_id)?.classe === 'Perigoso');
  const notas = avals.map(a => nota(a.itens)).filter(x => x != null);
  const ma = mesAnterior();
  const semAval = E.faz.filter(f => (!fazenda || f.id === fazenda) && !E.avals.some(a => a.fazenda_id === f.id && a.competencia.startsWith(ma)));
  const ultima = E.avals.filter(a => !fazenda || a.fazenda_id === fazenda).map(a => a.competencia).sort().pop() || '';
  const ncsUlt = ultima ? E.avals.filter(a => a.competencia === ultima && (!fazenda || a.fazenda_id === fazenda)).reduce((t, a) => t + ncsDe(a).length, 0) : 0;
  return { saidas, avals, meses, porMes, porClasse, porTipo, porDestino, porFaz, tot, re, pctRe: tot ? re / tot * 100 : null,
    perigKg: kg(perig), perigN: perig.length, perigSem: perig.filter(s => !temComprovante(s)).length,
    embKg: kg(saidas.filter(s => tipoPorId(s.tipo_id)?.classe === 'Embalagem de agrotóxico')),
    embUn: saidas.filter(s => tipoPorId(s.tipo_id)?.classe === 'Embalagem de agrotóxico').reduce((t, s) => t + Number(s.unidades || 0), 0),
    embN: new Set(saidas.filter(s => tipoPorId(s.tipo_id)?.classe === 'Embalagem de agrotóxico').map(s => s.data)).size,
    conf: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null, navals: notas.length,
    semAval, ultima, ncsUlt, ultSaida: E.saidas.filter(s => !fazenda || s.fazenda_id === fazenda).map(s => s.data).sort().pop() || '' };
}

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
const tagClasse = c => tag(c, COR_CLASSE[c] || 'neutra');
const corNota = n => n == null ? 'neutra' : n >= 90 ? 'ativo' : n >= 70 ? 'alerta' : 'perigo';
function dialogo(html, ligar) {
  let d = $('dlgRe');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgRe'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgRe')?.open && $('dlgRe').close();
const erroDlg = t => { const e = $('reErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgRe')) $('dlgRe').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
async function gravar(tabela, lista, atual, linha, botao, msgDup) {
  if (precisaRede()) return null;
  if (botao) $(botao).disabled = true;
  try {
    const t = estado.cliente.from(tabela);
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single() : await t.insert(linha).select().single();
    if (error) throw error;
    const i = lista.findIndex(x => x.id === data.id); if (i >= 0) lista[i] = data; else lista.unshift(data);
    salvarCaixa(); return data;
  } catch (e) {
    if (botao && $(botao)) $(botao).disabled = false;
    const m = String(e.message || e);
    erroDlg(/duplicate|unique/i.test(m) ? (msgDup || 'Já existe um registro igual.') : 'Não consegui gravar: ' + esc(m));
    return null;
  }
}
function confirmarApagar(tabela, lista, item, nome) {
  dialogo(`<h3>Apagar</h3><p>${esc(nome)}</p><div class="aviso erro" id="reErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="reApOk">Apagar</button></div>`, () => {
    $('reApOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('reApOk').disabled = true;
      const { error } = await estado.cliente.from(tabela).delete().eq('id', item.id);
      if (error) { $('reApOk').disabled = false; return erroDlg(/foreign key/i.test(error.message) ? 'Tem saídas com este tipo: desative em vez de apagar.' : 'Não consegui apagar: ' + esc(error.message)); }
      const i = lista.findIndex(x => x.id === item.id); if (i >= 0) lista.splice(i, 1);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · PAINEL (indicadores)
   =================================================================== */
function grafKg(porMes, rel = false) {
  if (!porMes.some(x => x.tot)) return '<div class="vazio">Nenhuma saída de resíduo no período.</div>';
  const max = Math.max(...porMes.map(x => x.tot), 1);
  return `<div class="cf-graf${rel ? ' cf-graf-rel' : ''} en-graf" role="img" aria-label="Resíduos destinados por mês em kg">
    ${porMes.map(x => `<div class="cf-col" title="${rotMes(x.m)}: ${fmt(x.tot)} kg (reaproveitado ${fmt(x.re)}, outros ${fmt(x.nao)})">
      <span class="cf-val">${fmt(x.tot)}</span>
      <div class="en-pilha" style="height:${Math.round(x.tot / max * 100)}%">
        <div class="en-nao" style="flex:${x.nao}"></div><div class="en-ren" style="flex:${x.re}"></div></div>
      <span class="cf-mes">${rotMes(x.m)}</span>${rel ? '' : `<span class="cf-sub">${x.tot ? fmt(x.re / x.tot * 100) + '% reap.' : ''}</span>`}</div>`).join('')}
  </div>${rel ? '' : '<p class="dica" style="margin:4px 0 0"><span class="en-leg en-ren"></span> reaproveitado (reciclagem, compostagem, devolução, logística reversa) <span class="en-leg en-nao"></span> aterro, empresa licenciada e outros · kg</p>'}`;
}
function grafConf(porMes, rel = false) {
  const l = porMes.filter(x => x.conf != null);
  if (!l.length) return '<div class="vazio">Nenhuma avaliação do manejo no período.</div>';
  return `<div class="cf-graf${rel ? ' cf-graf-rel' : ''} en-graf" role="img" aria-label="Conformidade do manejo por mês">
    ${porMes.map(x => `<div class="cf-col" title="${rotMes(x.m)}: ${x.conf == null ? 'sem avaliação' : fmt(x.conf) + '% conforme'}">
      <span class="cf-val">${x.conf == null ? '' : fmt(x.conf) + '%'}</span>
      ${x.conf == null ? '<div style="flex:0"></div>' : `<div class="en-pilha" style="height:${Math.max(2, Math.round(x.conf))}%"><div class="${x.conf < 70 ? 'en-nao' : 'en-ren'}" style="flex:1"></div></div>`}
      <span class="cf-mes">${rotMes(x.m)}</span></div>`).join('')}</div>`;
}
function desenharPainel() {
  const tela = $('telaRePainel');
  if (!E.fp.periodo) E.fp.periodo = periodoPadrao();
  const k = resumo(E.fp.periodo, E.fp.fazenda);
  const cartao = (cor, rot, val, dica, alvo) => `<button type="button" class="pv-card pv-${cor}" ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></button>`;
  const ma = mesAnterior();
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Gestão de resíduos', `${FORM.codigo} · ${rotPeriodo(E.fp.periodo)}${E.fp.fazenda ? ' · ' + esc(nomeFaz(E.fp.fazenda)) : ' · todas as fazendas'} · quantidades em kg (pesadas ou estimadas)`,
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="reNovaAv">Avaliar o manejo</button><button class="btn principal" type="button" id="reNova">Nova saída</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Período <select id="rePer">${opcoes([...anos().map(a => [a, 'Ano ' + a]), ['12m', 'Últimos 12 meses'], ['tudo', 'Todo o histórico']], E.fp.periodo)}</select></label>
      <label class="campo">Fazenda <select id="reFaz">${opcoes(E.faz.map(f => [f.id, f.nome]), E.fp.fazenda, 'Todas')}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Total destinado', fmt(k.tot) + ' kg', `${k.saidas.length} saída(s) no período`, 'reSaidas')}
      ${cartao(k.pctRe == null ? 'calma' : k.pctRe >= 50 ? 'calma' : 'alerta', 'Reaproveitado', k.pctRe == null ? '—' : fmt(k.pctRe, 1) + '%', `${fmt(k.re)} kg reciclados, compostados ou devolvidos`)}
      ${cartao(k.perigSem ? 'alerta' : 'calma', 'Perigosos', fmt(k.perigKg) + ' kg', k.perigN ? (k.perigSem ? `${k.perigSem} de ${k.perigN} saída(s) sem comprovante` : 'todas com comprovante') : 'nenhuma saída', 'reSaidas')}
      ${cartao('calma', 'Embalagens devolvidas', fmt(k.embUn), `${k.embN} entrega(s) na central${k.embKg ? ' · ' + fmt(k.embKg) + ' kg' : ''}`, 'reSaidas')}
      ${cartao(k.conf == null ? 'atencao' : k.conf >= 90 ? 'calma' : 'alerta', 'Conformidade do manejo', k.conf == null ? '—' : fmt(k.conf) + '%', k.navals ? `média de ${k.navals} avaliação(ões)${k.ncsUlt ? ` · ${k.ncsUlt} NC em ${rotMes(k.ultima)}` : ''}` : 'nenhuma avaliação', 'reAvaliacao')}
      ${cartao(k.semAval.length ? 'alerta' : 'calma', `Avaliação de ${rotMes(ma)}`, k.semAval.length ? `faltam ${k.semAval.length}` : 'em dia', k.semAval.length ? k.semAval.map(f => curtoFaz(f.id)).join(', ') : 'todas as fazendas avaliadas', 'reAvaliacao')}
    </div>
    <div class="qp-bloco"><h3>Resíduos destinados por mês</h3>${grafKg(k.porMes)}</div>
    <div class="qp-bloco"><h3>Conformidade do manejo por mês</h3>${grafConf(k.porMes)}
      <p class="dica" style="margin:4px 0 0">% de itens conformes no check list (C ÷ C + NC). Abaixo de 70% fica marrom.</p></div>
    <div class="qp-bloco"><h3>Por classe de resíduo (kg)</h3>
      <div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Classe</th>${k.meses.map(m => `<th class="ce">${rotMes(m)}</th>`).join('')}<th class="ce">Total</th><th class="ce">%</th></tr></thead><tbody>
      ${k.porClasse.map(x => `<tr><td>${tagClasse(x.c)}</td>${k.meses.map(m => `<td class="ce">${x.meses[m] ? fmt(x.meses[m]) : '<span class="dica">0</span>'}</td>`).join('')}
        <td class="ce"><b>${fmt(x.kg)}</b></td><td class="ce">${k.tot ? fmt(x.kg / k.tot * 100, 1) : '—'}</td></tr>`).join('')}
      <tr class="en-total"><td>Total</td>${k.meses.map(m => `<td class="ce">${fmt(k.porMes.find(x => x.m === m)?.tot || 0)}</td>`).join('')}<td class="ce">${fmt(k.tot)}</td><td class="ce">100</td></tr>
      </tbody></table></div></div>
    <div class="en-duas">
      <div class="qp-bloco"><h3>Por destinação</h3>
        ${k.porDestino.length ? `<table class="dc-planilha"><thead><tr><th>Destinação</th><th class="ce">Saídas</th><th class="ce">kg</th><th class="ce">%</th></tr></thead><tbody>
        ${k.porDestino.map(x => `<tr><td>${esc(x.d.nome)} ${x.d.reaproveita ? tag('reaproveita', 'ativo') : ''}</td><td class="ce">${x.n}</td><td class="ce">${fmt(x.kg)}</td><td class="ce">${k.tot ? fmt(x.kg / k.tot * 100, 1) : '—'}</td></tr>`).join('')}
        </tbody></table>` : '<div class="vazio">Sem saídas.</div>'}</div>
      <div class="qp-bloco"><h3>Por fazenda</h3>
        <table class="dc-planilha"><thead><tr><th>Fazenda</th><th class="ce">kg</th><th class="ce">Reaproveitado</th><th class="ce">Conformidade</th></tr></thead><tbody>
        ${k.porFaz.map(x => `<tr><td>${esc(nomeFaz(x.id))}</td><td class="ce">${fmt(x.kg)}</td><td class="ce">${x.pctRe == null ? '—' : fmt(x.pctRe) + '%'}</td>
          <td class="ce">${x.conf == null ? '<span class="dica">sem avaliação</span>' : tag(fmt(x.conf) + '%', corNota(x.conf), `${x.navals} avaliação(ões)`)}</td></tr>`).join('')}
        </tbody></table></div>
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="reImpPainel">Imprimir o painel</button>
    <button class="btn" type="button" id="reImpForm">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="reXlsx">Excel</button>
  </div>`;
  $('rePer').addEventListener('change', e => { E.fp.periodo = e.target.value; desenharPainel(); });
  $('reFaz').addEventListener('change', e => { E.fp.fazenda = e.target.value; desenharPainel(); });
  $('reNova').addEventListener('click', () => formSaida(null));
  $('reNovaAv').addEventListener('click', () => formAval(null, { fazenda_id: E.fp.fazenda }));
  $('reImpPainel').addEventListener('click', () => mostrar(docPainel(k), { barra: true }));
  $('reImpForm').addEventListener('click', () => mostrar(docForm(k), { barra: true }));
  $('reXlsx').addEventListener('click', () => exportar(k));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    const ano = /^\d{4}$/.test(E.fp.periodo) ? E.fp.periodo : '';
    E.fs.ano = ano; E.fs.fazenda = E.fp.fazenda; E.fa.ano = ano;
    abrirModulo('cert', b.dataset.ir); }));
}

/* ===================================================================
   TELA · SAÍDAS
   =================================================================== */
function saidasFiltradas() {
  const q = so(E.fs.q).toLowerCase();
  return E.saidas.filter(s => (!E.fs.tipo || s.tipo_id === E.fs.tipo) && (!E.fs.fazenda || s.fazenda_id === E.fs.fazenda) && (!E.fs.ano || s.data.startsWith(E.fs.ano))
    && (!q || [tipoPorId(s.tipo_id)?.nome, s.destinacao, s.destinatario, s.comprovante, s.observacao].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data));
}
function desenharSaidas() {
  const tela = $('telaReSaidas');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Saída de resíduos', 'Uma linha por coleta, entrega ou devolução. Anexe o comprovante (MTR, nota de devolução, recibo): vira evidência do RG 053.',
      `<button class="btn principal" type="button" id="rsNova">Nova saída</button>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Buscar <input type="text" id="rsQ" value="${esc(E.fs.q)}" placeholder="Destinatário, comprovante, observação"></label>
      <label class="campo">Tipo <select id="rsTipo">${opcoes(E.tipos.map(t => [t.id, t.nome]), E.fs.tipo, 'Todos')}</select></label>
      <label class="campo">Fazenda <select id="rsFaz">${opcoes(E.faz.map(f => [f.id, f.nome]), E.fs.fazenda, 'Todas')}</select></label>
      <label class="campo">Ano <select id="rsAno">${opcoes(anos(), E.fs.ano, 'Todos')}</select></label>
    </div>
    <div id="rsTabela" style="margin-top:12px"></div>
  </div>`;
  const liga = (id, k, ev = 'change') => $(id).addEventListener(ev, e => { E.fs[k] = e.target.value; tabelaSaidas(); });
  liga('rsQ', 'q', 'input'); liga('rsTipo', 'tipo'); liga('rsFaz', 'fazenda'); liga('rsAno', 'ano');
  $('rsNova').addEventListener('click', () => formSaida(null));
  tabelaSaidas();
}
function tabelaSaidas() {
  const l = saidasFiltradas();
  const tot = l.reduce((t, s) => t + Number(s.kg || 0), 0);
  $('rsTabela').innerHTML = l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>Fazenda</th><th>Resíduo</th><th>Classe</th><th class="ce">kg</th><th>Destinação</th><th>Recebido por</th><th>Comprovante</th><th></th></tr></thead><tbody>
    ${l.map(s => { const t = tipoPorId(s.tipo_id); const perig = t?.classe === 'Perigoso';
      return `<tr><td class="ce">${br(s.data)}</td><td>${esc(curtoFaz(s.fazenda_id))}</td><td><b>${esc(t?.nome || '?')}</b></td><td>${t ? tagClasse(t.classe) : ''}</td>
      <td class="ce">${s.unidades != null && !Number(s.kg) ? `${fmt(s.unidades)} emb.` : fmt(s.kg, Number(s.kg) % 1 ? 1 : 0) + (s.unidades != null ? `<br><small class="dica">${fmt(s.unidades)} emb.</small>` : '')}</td><td>${esc(s.destinacao)}</td><td>${esc(s.destinatario || '')}</td>
      <td>${esc(s.comprovante || '')}${E.arq.has(String(s.id)) ? ' <span title="Comprovante anexado">📎</span>' : ''}${!temComprovante(s) ? ' ' + tag('sem comprovante', perig ? 'perigo' : 'alerta') : ''}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(s.id)}">Abrir</button></td></tr>`; }).join('')}
    <tr class="en-total"><td colspan="4">Total (${l.length} saída${l.length > 1 ? 's' : ''})</td><td class="ce">${fmt(tot)}</td><td colspan="4"></td></tr></tbody></table></div>`
    : '<div class="vazio">Nenhuma saída de resíduo.</div>';
  $('rsTabela').querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formSaida(E.saidas.find(s => s.id === b.dataset.ed))));
}
let anexos = null;
function formSaida(r, rascunho = null) {
  const v = rascunho || r || { data: hoje(), fazenda_id: E.fp.fazenda || (E.faz.length === 1 ? E.faz[0].id : ''), tipo_id: '', kg: '', destinacao: '', destinatario: '', comprovante: '', observacao: '' };
  const grupos = CLASSES.map(c => { const l = E.tipos.filter(t => t.classe === c && (t.ativo || t.id === v.tipo_id));
    return l.length ? `<optgroup label="${esc(c)}">${l.map(t => `<option value="${esc(t.id)}" ${t.id === v.tipo_id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</optgroup>` : ''; }).join('');
  dialogo(`<h3>${r ? 'Saída de resíduo' : 'Nova saída de resíduo'}</h3>
    <div class="aviso erro" id="reErro" hidden></div>
    <div class="np-passo">1 · O que saiu e para onde</div>
    <div class="grade">
      <label class="campo">Data <input type="date" id="rsData" value="${esc(v.data)}" max="${hoje()}"></label>
      <label class="campo">Fazenda <select id="rsFazD">${opcoes(E.faz.map(f => [f.id, f.nome]), v.fazenda_id, 'Escolha…')}</select></label>
      <label class="campo">Resíduo <select id="rsTipoD"><option value="">Escolha…</option>${grupos}</select></label>
      <label class="campo">Quantidade (kg) <input type="text" inputmode="decimal" id="rsKg" value="${esc(v.kg === '' ? '' : String(v.kg).replace('.', ','))}" placeholder="pesado ou estimado"></label>
      <label class="campo" id="rsUnCampo">Nº de embalagens <input type="number" min="0" step="1" id="rsUn" value="${esc(v.unidades ?? '')}" placeholder="do registro ADICER / notas"></label>
      <label class="campo">Destinação <select id="rsDest">${opcoes(DESTINOS.map(d => d.nome), v.destinacao, 'Escolha…')}</select></label>
      <label class="campo">Recebido / transportado por <input type="text" id="rsDestin" value="${esc(v.destinatario || '')}" list="rsDestins" placeholder="Ex.: central de embalagens, cooperativa, coleta da prefeitura"></label>
      <label class="campo">Nº do comprovante <input type="text" id="rsComp" value="${esc(v.comprovante || '')}" placeholder="MTR, NF de devolução, recibo"></label>
    </div>
    <datalist id="rsDestins">${[...new Set(E.saidas.map(x => x.destinatario).filter(Boolean))].map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <p class="dica" id="rsAviso" style="margin:4px 0 0"></p>
    <div class="np-passo">2 · Evidência (opcional)</div>
    <div id="rsAnexos" style="margin-top:8px"></div>
    <label class="campo">Observação <textarea id="rsObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre">
      <div>${r ? '<button class="btn perigo" type="button" id="rsApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button>
        ${r ? '' : '<button class="btn" type="button" id="rsMais">Gravar e lançar outra</button>'}
        <button class="btn principal" type="button" id="rsOk">Gravar</button></div>
    </div>`, () => {
    anexos = campoAnexos($('rsAnexos'), { area: 'certificacao', tipo: 'residuo', rotulo: 'Comprovante', dica: 'PDF ou foto — vira evidência do RG 053' });
    anexos.abrir(r ? r.id : null);
    const avisa = () => { const t = tipoPorId($('rsTipoD').value);
      $('rsAviso').textContent = t?.classe === 'Perigoso' ? 'Resíduo perigoso: guarde o comprovante da empresa licenciada (MTR ou certificado de destinação).'
        : t?.classe === 'Embalagem de agrotóxico' ? 'Embalagens: anexe o comprovante de devolução da central/posto de recebimento.' : ''; };
    const mostraUn = () => { $('rsUnCampo').hidden = tipoPorId($('rsTipoD').value)?.classe !== 'Embalagem de agrotóxico'; };
    $('rsTipoD').addEventListener('change', () => { const t = tipoPorId($('rsTipoD').value); if (t?.destinacao && !$('rsDest').value) $('rsDest').value = t.destinacao; avisa(); mostraUn(); });
    mostraUn();
    avisa();
    $('rsOk').addEventListener('click', () => salvarSaida(r, false));
    $('rsMais')?.addEventListener('click', () => salvarSaida(r, true));
    $('rsApagar')?.addEventListener('click', () => confirmarApagar('cr_saidas', E.saidas, r, `${br(r.data)} · ${tipoPorId(r.tipo_id)?.nome || ''} · ${fmt(r.kg)} kg`));
  });
}
async function salvarSaida(atual, outra) {
  const data = $('rsData').value, faz = $('rsFazD').value, tipo = $('rsTipoD').value, kg = num($('rsKg').value), dest = $('rsDest').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erroDlg('Informe a data.');
  if (data > hoje()) return erroDlg('A data está no futuro.');
  if (!faz) return erroDlg('Escolha a fazenda.');
  if (!tipo) return erroDlg('Escolha o resíduo.');
  const semKg = tipoPorId(tipo)?.classe === 'Embalagem de agrotóxico';   // o registro ADICER traz unidades, não kg
  const un = semKg && so($('rsUn').value) !== '' ? Math.round(Number($('rsUn').value)) : null;
  if (semKg && (kg == null || kg === 0) && !(un > 0)) return erroDlg('Informe o nº de embalagens (ou o peso em kg).');
  if (!semKg && (kg == null || kg <= 0)) return erroDlg('Informe a quantidade em kg.');
  if (!dest) return erroDlg('Escolha a destinação.');
  const l = { data, fazenda_id: faz, tipo_id: tipo, kg: kg ?? 0, unidades: un, destinacao: dest, destinatario: so($('rsDestin').value) || null,
    comprovante: so($('rsComp').value) || null, observacao: so($('rsObs').value) || null };
  const salvo = await gravar('cr_saidas', E.saidas, atual, atual ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, outra ? 'rsMais' : 'rsOk');
  if (!salvo) return;
  if (anexos?.mudou) { await anexos.salvar(salvo.id); E.arq.add(String(salvo.id)); }
  E.saidas.sort((a, b) => b.data.localeCompare(a.data));
  fechar();
  if (outra) return formSaida(null, { data: l.data, fazenda_id: l.fazenda_id, tipo_id: '', kg: '', destinacao: '', destinatario: l.destinatario, comprovante: l.comprovante, observacao: '' });
  redesenhar();
}

/* ===================================================================
   TELA · AVALIAÇÃO DO MANEJO (check list mensal por fazenda)
   =================================================================== */
function desenharAvaliacao() {
  const tela = $('telaReAvaliacao');
  const mesesAno = E.fa.ano ? Array.from({ length: 12 }, (_, i) => `${E.fa.ano}-${doisD(i + 1)}`).filter(m => m <= mesAtual())
    : (() => { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < 12; i++) { out.unshift(`${d.getFullYear()}-${doisD(d.getMonth() + 1)}`); d.setMonth(d.getMonth() - 1); } return out; })();
  const cel = (f, m) => { const a = E.avals.find(x => x.fazenda_id === f.id && x.competencia.startsWith(m));
    if (!a) return `<td class="ce"><button class="btn mini" type="button" data-nova="${esc(f.id)}|${m}" title="Avaliar ${esc(f.nome)} em ${rotMes(m)}">＋</button></td>`;
    const n = nota(a.itens), nc = ncsDe(a).length;
    return `<td class="ce"><button class="btn mini" type="button" data-av="${esc(a.id)}" title="${nc} NC">${tag(n == null ? 'NA' : fmt(n) + '%', corNota(n))}${nc ? ` <small>${nc} NC</small>` : ''}</button></td>`; };
  const ultimas = E.avals.filter(a => !E.fa.ano || a.competencia.startsWith(E.fa.ano)).slice(0, 30);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Avaliação do manejo de resíduos', 'Check list mensal por fazenda (POP 004). C = conforme · NC = não conforme · NA = não se aplica. A nota é C ÷ (C + NC).',
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="raBranco">Imprimir em branco</button><button class="btn principal" type="button" id="raNova">Nova avaliação</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Ano <select id="raAno">${opcoes(anos(), E.fa.ano, 'Últimos 12 meses')}</select></label>
    </div>
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr><th>Fazenda</th>${mesesAno.map(m => `<th class="ce">${rotMes(m)}</th>`).join('')}</tr></thead><tbody>
      ${E.faz.map(f => `<tr><td><b>${esc(f.nome)}</b></td>${mesesAno.map(m => cel(f, m)).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="qp-bloco"><h3>Não conformidades nas avaliações</h3>
      ${ultimas.some(a => ncsDe(a).length) ? `<table class="dc-planilha"><thead><tr><th class="ce">Mês</th><th>Fazenda</th><th>Item não conforme</th><th>Observação</th></tr></thead><tbody>
      ${ultimas.flatMap(a => ncsDe(a).map(([, t]) => `<tr><td class="ce">${rotMes(a.competencia)}</td><td>${esc(nomeFaz(a.fazenda_id))}</td><td>${esc(t)}</td><td><small>${esc(a.observacao || '')}</small></td></tr>`)).join('')}
      </tbody></table><p class="dica" style="margin:6px 0 0">Item NC que se repete ou que é grave vira registro em Não conformidades (FORM 004).</p>` : '<div class="vazio">Nenhuma não conformidade nas avaliações.</div>'}
    </div>
  </div>`;
  $('raAno').addEventListener('change', e => { E.fa.ano = e.target.value; desenharAvaliacao(); });
  $('raNova').addEventListener('click', () => formAval(null));
  $('raBranco').addEventListener('click', () => mostrar(docChecklist(null), { barra: true }));
  tela.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => formAval(E.avals.find(a => a.id === b.dataset.av))));
  tela.querySelectorAll('[data-nova]').forEach(b => b.addEventListener('click', () => { const [f, m] = b.dataset.nova.split('|'); formAval(null, { fazenda_id: f, competencia: m + '-01' }); }));
}
function formAval(a, pre = {}) {
  const v = a || { competencia: pre.competencia || `${mesAnterior()}-01`, fazenda_id: pre.fazenda_id || '', itens: {}, avaliador: '', observacao: '' };
  const linha = ([k, t], i) => { const val = v.itens?.[k] || '';
    return `<tr><td class="ce">${i + 1}</td><td>${esc(t)}</td>${['C', 'NC', 'NA'].map(o => `<td class="ce"><label class="ra-op"><input type="radio" name="ra_${k}" value="${o}" ${val === o ? 'checked' : ''}> ${o}</label></td>`).join('')}</tr>`; };
  dialogo(`<h3>${a ? 'Avaliação do manejo' : 'Nova avaliação do manejo'}</h3>
    <div class="aviso erro" id="reErro" hidden></div>
    <div class="grade">
      <label class="campo">Mês <input type="month" id="raMes" value="${esc(String(v.competencia).slice(0, 7))}" max="${mesAtual()}"></label>
      <label class="campo">Fazenda <select id="raFaz">${opcoes(E.faz.map(f => [f.id, f.nome]), v.fazenda_id, 'Escolha…')}</select></label>
      <label class="campo">Avaliado por <input type="text" id="raQuem" value="${esc(v.avaliador || '')}" list="raQuens"></label>
      <label class="campo">Nota <input type="text" id="raNota" disabled></label>
    </div>
    <datalist id="raQuens">${[...new Set(E.avals.map(x => x.avaliador).filter(Boolean))].map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <div class="barra" style="margin:8px 0 4px"><button class="btn mini" type="button" id="raTudoC">Marcar todos C</button></div>
    <div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">#</th><th>Item</th><th class="ce">C</th><th class="ce">NC</th><th class="ce">NA</th></tr></thead><tbody>
      ${ITENS.map(linha).join('')}</tbody></table></div>
    <label class="campo">Observação / ação para os itens NC <textarea id="raObs" rows="3">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre">
      <div>${a ? '<button class="btn perigo" type="button" id="raApagar">Apagar</button> <button class="btn" type="button" id="raImp">Imprimir</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="raOk">Salvar</button></div>
    </div>`, d => {
    const lerItens = () => Object.fromEntries(ITENS.map(([k]) => [k, d.querySelector(`input[name="ra_${k}"]:checked`)?.value]).filter(([, x]) => x));
    const conta = () => { const it = lerItens(); const n = nota(it); $('raNota').value = `${n == null ? '—' : fmt(n) + '%'} · ${Object.keys(it).length} de ${ITENS.length} itens marcados`; };
    d.querySelectorAll('input[type=radio]').forEach(x => x.addEventListener('change', conta)); conta();
    $('raTudoC').addEventListener('click', () => { ITENS.forEach(([k]) => { const x = d.querySelector(`input[name="ra_${k}"][value="C"]`); if (!d.querySelector(`input[name="ra_${k}"]:checked`)) x.checked = true; }); conta(); });
    $('raImp')?.addEventListener('click', () => mostrar(docChecklist(a), { barra: true }));
    $('raApagar')?.addEventListener('click', () => confirmarApagar('cr_avaliacoes', E.avals, a, `${rotMes(a.competencia)} · ${nomeFaz(a.fazenda_id)}`));
    $('raOk').addEventListener('click', async () => {
      const mes = $('raMes').value, faz = $('raFaz').value, itens = lerItens();
      if (!/^\d{4}-\d{2}$/.test(mes)) return erroDlg('Informe o mês.');
      if (mes > mesAtual()) return erroDlg('O mês está no futuro.');
      if (!faz) return erroDlg('Escolha a fazenda.');
      if (Object.keys(itens).length < ITENS.length) return erroDlg(`Marque C, NC ou NA em todos os ${ITENS.length} itens.`);
      if (Object.values(itens).includes('NC') && !so($('raObs').value)) return erroDlg('Tem item NC: descreva o problema e a ação na observação.');
      const l = { competencia: `${mes}-01`, fazenda_id: faz, itens, avaliador: so($('raQuem').value) || null, observacao: so($('raObs').value) || null };
      const s = await gravar('cr_avaliacoes', E.avals, a, a ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'raOk',
        `Já existe avaliação de ${nomeFaz(faz)} em ${rotMes(mes)}. Abra a que existe para alterar.`);
      if (!s) return;
      E.avals.sort((x, y) => y.competencia.localeCompare(x.competencia)); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · TIPOS
   =================================================================== */
function desenharTipos() {
  const tela = $('telaReTipos');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Tipos de resíduo', 'A classe define os indicadores (perigosos, embalagens). A destinação de costume já vem marcada ao lançar a saída.',
      `<button class="btn principal" type="button" id="rtNovo">Novo tipo</button>`)}
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr><th>Resíduo</th><th>Classe</th><th>Destinação de costume</th><th class="ce">Saídas</th><th></th></tr></thead><tbody>
    ${E.tipos.map(t => `<tr${t.ativo ? '' : ' class="cf-inativa"'}><td><b>${esc(t.nome)}</b>${t.observacao ? `<br><small class="dica">${esc(t.observacao)}</small>` : ''}</td><td>${tagClasse(t.classe)}</td>
      <td>${esc(t.destinacao || '')}</td><td class="ce">${E.saidas.filter(s => s.tipo_id === t.id).length}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(t.id)}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
  $('rtNovo').addEventListener('click', () => formTipo(null));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formTipo(tipoPorId(b.dataset.ed))));
}
function formTipo(t) {
  const v = t || { nome: '', classe: 'Reciclável', destinacao: 'Reciclagem', ordem: E.tipos.length + 1, ativo: true, observacao: '' };
  dialogo(`<h3>${t ? 'Tipo de resíduo' : 'Novo tipo de resíduo'}</h3>
    <div class="aviso erro" id="reErro" hidden></div>
    <div class="grade">
      <label class="campo">Nome <input type="text" id="rtNome" value="${esc(v.nome)}"></label>
      <label class="campo">Classe <select id="rtClasse">${opcoes(CLASSES, v.classe)}</select></label>
      <label class="campo">Destinação de costume <select id="rtDest">${opcoes(DESTINOS.map(d => d.nome), v.destinacao, '—')}</select></label>
      <label class="campo">Ordem <input type="number" id="rtOrdem" value="${esc(v.ordem)}"></label>
    </div>
    <label class="campo rs-check"><input type="checkbox" id="rtAtivo" ${v.ativo ? 'checked' : ''}> Ativo (aparece ao lançar)</label>
    <label class="campo">Observação <textarea id="rtObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre"><div>${t ? '<button class="btn perigo" type="button" id="rtApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="rtOk">Salvar</button></div></div>`, () => {
    $('rtOk').addEventListener('click', async () => {
      const l = { nome: so($('rtNome').value), classe: $('rtClasse').value, destinacao: $('rtDest').value || null, ordem: Number($('rtOrdem').value) || 0,
        ativo: $('rtAtivo').checked, observacao: so($('rtObs').value) || null };
      if (!l.nome) return erroDlg('Informe o nome.');
      const s = await gravar('cr_tipos', E.tipos, t, t ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'rtOk', 'Já existe um tipo com esse nome.');
      if (!s) return;
      E.tipos.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)); fechar(); redesenhar();
    });
    $('rtApagar')?.addEventListener('click', () => {
      if (E.saidas.some(s => s.tipo_id === t.id)) return erroDlg('Tem saídas com este tipo. Desmarque “Ativo” em vez de apagar.');
      confirmarApagar('cr_tipos', E.tipos, t, t.nome);
    });
  });
}

/* ===================================================================
   IMPRESSOS E EXCEL
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo, paisagem }) {
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div></header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
const fichaForm = extra => `<div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
  <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div>${extra || ''}</div>`;
function docForm(k) {
  const l = k.saidas.slice().sort((a, b) => a.data.localeCompare(b.data));
  return documento({ titulo: FORM.titulo, subtitulo: `${rotPeriodo(E.fp.periodo)}${E.fp.fazenda ? ' · ' + nomeFaz(E.fp.fazenda) : ''}`, canto: FORM.codigo, paisagem: true, corpo: `
    ${fichaForm(`<div><span>Referência</span><b>POP 004 · AN 55 · AN 58</b></div>`)}
    <p class="rel-secao">1. Registro de saída de resíduos</p>
    <table class="rel-tabela"><thead><tr><th>Data</th><th>Fazenda</th><th>Resíduo</th><th>Classe</th><th>kg / emb.</th><th>Destinação</th><th>Recebido por</th><th>Comprovante</th></tr></thead><tbody>
      ${l.length ? l.map(s => { const t = tipoPorId(s.tipo_id); return `<tr><td>${br(s.data)}</td><td>${esc(curtoFaz(s.fazenda_id))}</td><td>${esc(t?.nome || '')}</td><td>${esc(t?.classe || '')}</td>
        <td class="rel-num">${s.unidades != null && !Number(s.kg) ? fmt(s.unidades) + ' emb.' : fmt(s.kg, Number(s.kg) % 1 ? 1 : 0)}</td><td>${esc(s.destinacao)}</td><td>${esc(s.destinatario || '')}</td><td>${esc(s.comprovante || (E.arq.has(String(s.id)) ? 'anexado' : '—'))}</td></tr>`; }).join('')
        : '<tr><td colspan="8">Nenhuma saída no período.</td></tr>'}
      <tr><td colspan="4"><b>Total</b></td><td class="rel-num"><b>${fmt(k.tot)}</b></td><td colspan="3">Reaproveitado: <b>${k.pctRe == null ? '—' : fmt(k.pctRe, 1) + '%'}</b></td></tr></tbody></table>
    <p class="rel-secao">2. Avaliação do manejo de resíduos</p>
    <table class="rel-tabela"><thead><tr><th>Mês</th><th>Fazenda</th><th>Conformidade</th><th>Itens NC</th><th>Avaliado por</th><th>Observação / ação</th></tr></thead><tbody>
      ${k.avals.length ? k.avals.slice().sort((a, b) => a.competencia.localeCompare(b.competencia) || nomeFaz(a.fazenda_id).localeCompare(nomeFaz(b.fazenda_id))).map(a => { const n = nota(a.itens);
        return `<tr><td>${rotMes(a.competencia)}</td><td>${esc(curtoFaz(a.fazenda_id))}</td><td class="rel-num">${n == null ? '—' : fmt(n) + '%'}</td>
        <td>${ncsDe(a).map(([, t]) => esc(t)).join('; ') || '—'}</td><td>${esc(a.avaliador || '')}</td><td>${esc(a.observacao || '')}</td></tr>`; }).join('')
        : '<tr><td colspan="6">Nenhuma avaliação no período.</td></tr>'}
    </tbody></table>
    <p class="rel-nota">Quantidades em kg, pesadas ou estimadas. Reaproveitado = reciclagem, compostagem, reaproveitamento interno, devolução de embalagens e logística reversa.</p>` });
}
function docPainel(k) {
  return documento({ titulo: FORM.titulo, subtitulo: `Indicadores · ${rotPeriodo(E.fp.periodo)}${E.fp.fazenda ? ' · ' + nomeFaz(E.fp.fazenda) : ''}`, canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-qkpis">
      <div><span>Total destinado</span><strong>${fmt(k.tot)}</strong><small>kg</small></div>
      <div class="rel-q--otimo-t"><span>Reaproveitado</span><strong>${k.pctRe == null ? '—' : fmt(k.pctRe, 1) + '%'}</strong><small>${fmt(k.re)} kg</small></div>
      <div><span>Perigosos</span><strong>${fmt(k.perigKg)}</strong><small>kg · ${k.perigSem} sem comprovante</small></div>
      <div><span>Embalagens devolvidas</span><strong>${fmt(k.embUn)}</strong><small>${k.embN} entrega(s)</small></div>
      <div class="rel-q--bom-t"><span>Conformidade do manejo</span><strong>${k.conf == null ? '—' : fmt(k.conf) + '%'}</strong><small>${k.navals} avaliação(ões)</small></div>
    </div>
    <p class="rel-secao">Resíduos destinados por mês (kg)</p>${grafKg(k.porMes, true)}
    <p class="rel-nota">Verde: reaproveitado · marrom: aterro, empresa licenciada e outros.</p>
    <div class="en-duas">
      <div><p class="rel-secao">Por classe</p><table class="rel-tabela"><thead><tr><th>Classe</th><th>kg</th><th>%</th></tr></thead><tbody>
        ${k.porClasse.map(x => `<tr><td>${esc(x.c)}</td><td class="rel-num">${fmt(x.kg)}</td><td class="rel-num">${k.tot ? fmt(x.kg / k.tot * 100, 1) : '—'}</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td class="rel-num"><b>${fmt(k.tot)}</b></td><td class="rel-num">100</td></tr></tbody></table></div>
      <div><p class="rel-secao">Por fazenda</p><table class="rel-tabela"><thead><tr><th>Fazenda</th><th>kg</th><th>Reaproveitado</th><th>Conformidade</th></tr></thead><tbody>
        ${k.porFaz.map(x => `<tr><td>${esc(nomeFaz(x.id))}</td><td class="rel-num">${fmt(x.kg)}</td><td class="rel-num">${x.pctRe == null ? '—' : fmt(x.pctRe) + '%'}</td><td class="rel-num">${x.conf == null ? '—' : fmt(x.conf) + '%'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <p class="rel-secao">Conformidade do manejo por mês</p>${grafConf(k.porMes, true)}` });
}
function docChecklist(a) {
  const marca = (k, o) => a ? (a.itens?.[k] === o ? '✔' : '') : '';
  return documento({ titulo: 'Avaliação do manejo de resíduos', subtitulo: a ? `${nomeFaz(a.fazenda_id)} · ${rotMes(a.competencia)}` : 'check list mensal — preencher à mão', canto: FORM.codigo, corpo: `
    ${fichaForm(`<div><span>Fazenda</span><b>${a ? esc(nomeFaz(a.fazenda_id)) : '&nbsp;'}</b></div><div><span>Mês</span><b>${a ? rotMes(a.competencia) : '&nbsp;'}</b></div><div><span>Avaliado por</span><b>${a ? esc(a.avaliador || '') : '&nbsp;'}</b></div>`)}
    <table class="rel-tabela"><thead><tr><th>#</th><th>Item</th><th>C</th><th>NC</th><th>NA</th></tr></thead><tbody>
      ${ITENS.map(([k, t], i) => `<tr><td>${i + 1}</td><td>${esc(t)}</td><td class="rel-num">${marca(k, 'C')}</td><td class="rel-num">${marca(k, 'NC')}</td><td class="rel-num">${marca(k, 'NA')}</td></tr>`).join('')}
    </tbody></table>
    <p class="rel-secao">Observação / ação para os itens NC</p>
    <div style="border:1px solid #c9cbc4;border-radius:4px;min-height:${a ? 30 : 110}px;padding:6px 8px;font-size:11px">${a ? esc(a.observacao || '') : ''}</div>
    ${a ? `<p class="rel-nota">Nota: ${nota(a.itens) == null ? '—' : fmt(nota(a.itens)) + '% conforme'} (C ÷ C + NC).</p>` : '<p class="rel-nota">C = conforme · NC = não conforme · NA = não se aplica. Lançar depois no app: Certificação › FORMS Digital › Resíduos › Avaliação.</p>'}` });
}
async function exportar(k) {
  const saidas = k.saidas.slice().sort((a, b) => a.data.localeCompare(b.data)).map(s => { const t = tipoPorId(s.tipo_id);
    return [s.data, nomeFaz(s.fazenda_id), t?.nome || '', t?.classe || '', Number(s.kg), s.unidades ?? '', s.destinacao, reaproveita(s.destinacao) ? 'Sim' : 'Não', s.destinatario || '', s.comprovante || '', E.arq.has(String(s.id)) ? 'Sim' : 'Não', s.observacao || '']; });
  const avals = k.avals.slice().sort((a, b) => a.competencia.localeCompare(b.competencia)).map(a => [a.competencia, nomeFaz(a.fazenda_id), nota(a.itens),
    ...ITENS.map(([c]) => a.itens?.[c] || ''), a.avaliador || '', a.observacao || '']);
  const sub = `SAKUMA Agronegócios · ${rotPeriodo(E.fp.periodo)} · emitido em ${br(hoje())}`;
  await baixarXlsx(`gestao-residuos-${hoje()}.xlsx`, [
    { nome: 'Saídas', titulo: `${FORM.codigo} — Saída de resíduos`, subtitulo: sub,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Fazenda', larg: 24 }, { rot: 'Resíduo', larg: 32 }, { rot: 'Classe', larg: 20 }, { rot: 'kg', larg: 10, tipo: 'num', casas: 1 }, { rot: 'Nº embalagens', larg: 12 },
        { rot: 'Destinação', larg: 26 }, { rot: 'Reaproveita', larg: 11 }, { rot: 'Recebido por', larg: 28 }, { rot: 'Comprovante', larg: 18 }, { rot: 'Anexo', larg: 8 }, { rot: 'Observação', larg: 36 }],
      linhas: saidas },
    { nome: 'Avaliações', titulo: `${FORM.codigo} — Avaliação do manejo`, subtitulo: sub,
      colunas: [{ rot: 'Mês', larg: 12, tipo: 'data' }, { rot: 'Fazenda', larg: 24 }, { rot: '% conforme', larg: 11, tipo: 'num', casas: 0 },
        ...ITENS.map(([, t], i) => ({ rot: `${i + 1}. ${t.split(' ').slice(0, 3).join(' ')}`, larg: 12 })), { rot: 'Avaliado por', larg: 20 }, { rot: 'Observação', larg: 40 }],
      linhas: avals },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_RESIDUOS = ['rePainel', 'reSaidas', 'reAvaliacao', 'reTipos'];
/* Etapa 2 (29/10/2026, claude/cert-redesenho-lean.md): a aba Registros mostra o painel e, logo abaixo, o histórico. */
const DESENHO = { rePainel: () => { desenharPainel(); desenharSaidas(); }, reSaidas: desenharSaidas, reAvaliacao: desenharAvaliacao, reTipos: desenharTipos };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirResiduos(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando a gestão de resíduos…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a gestão de resíduos: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgRe')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparResiduos() {
  E.carregado = false; E.tipos = []; E.saidas = []; E.avals = []; E.faz = []; E.arq = new Set();
  Object.assign(E.fp, { periodo: '', fazenda: '' }); Object.assign(E.fs, { tipo: '', fazenda: '', ano: '', q: '' }); E.fa.ano = '';
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cr = { E, resumo, nota, reaproveita };
