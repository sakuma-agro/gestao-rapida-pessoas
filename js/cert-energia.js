// cert-energia.js — Certificação › Energia: consumo de energias (FORM 043), 26/10/2026.
//
// Pedido do Guilherme: "o form 43, gostaria de ter um igual o form 50 … uma
// tela, um sub modulo". Substitui a planilha FORM 043 - TABELA CONSUMO DE
// ENERGIAS.xlsx: cada fonte (solar, elétrica da rede, gasolina, diesel…) tem
// unidade e fator para kWh; o painel soma tudo em kWh e mostra quanto é
// renovável. Os dados das abas 2024 e 2025 foram importados (cada parcela da
// planilha, como "=8750+5640", virou um lançamento).
//
// Tabelas (supabase/cert-energia.sql), trancadas por app_pode('cert'):
//  · ce_fontes   — nome, renovável, unidade, fator_kwh, ordem, ativa
//  · ce_consumos — competência (dia 1 do mês), fonte, quantidade, origem, fazenda
// Anexo do lançamento (fatura, nota): Drive certificacao/energia/<id>/…
// Sem internet: só consulta (cópia 'energia.cache').

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

const FORM = { codigo: 'FORM 043', titulo: 'Consumo de energias', data: '01/12/2026', nrev: '02',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };

/* ---------------- estado ---------------- */
const E = {
  carregado: false, fontes: [], regs: [], arq: new Set(),
  fp: { periodo: '' },
  fl: { fonte: '', ano: '', q: '' },
};
const CAIXA = 'energia.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { fontes: E.fontes, regs: E.regs });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { E.fontes = c0.fontes || []; E.regs = c0.regs || []; E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia do consumo de energia neste aparelho.');
  }
  const [f, r] = await Promise.all([
    c.from('ce_fontes').select('*').order('ordem').order('nome'),
    c.from('ce_consumos').select('*').order('competencia', { ascending: false }),
  ]);
  const erro = f.error || r.error;
  if (erro && E.carregado) return;
  if (erro) {
    if (/ce_|relation|does not exist|schema cache/i.test(erro.message || '')) throw new Error('As tabelas de energia ainda não foram criadas no banco (supabase/cert-energia.sql).');
    throw erro;
  }
  E.fontes = f.data || []; E.regs = r.data || []; E.carregado = true;
  salvarCaixa();
  E.arq = await donosComArquivo('certificacao', 'energia').catch(() => new Set());
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const fontePorId = id => E.fontes.find(x => x.id === id);
const kwh = r => { const f = fontePorId(r.fonte_id); return f ? Number(r.quantidade) * Number(f.fator_kwh) : 0; };
const anos = () => [...new Set(E.regs.map(r => r.competencia.slice(0, 4)))].sort().reverse();
function periodoPadrao() { return anos()[0] || mesAtual().slice(0, 4); }
function limites(p) {
  if (p === 'tudo') return ['', ''];
  if (p === '12m') { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return [`${d.getFullYear()}-${doisD(d.getMonth() + 1)}-01`, `${mesAtual()}-01`]; }
  return [`${p}-01-01`, `${p}-12-01`];
}
const rotPeriodo = p => p === 'tudo' ? 'todo o histórico' : p === '12m' ? 'últimos 12 meses' : `ano de ${p}`;
function regsPeriodo(p) { const [de, ate] = limites(p); return E.regs.filter(r => (!de || r.competencia >= de) && (!ate || r.competencia <= ate)); }

function resumo(regs) {
  const meses = [...new Set(regs.map(r => r.competencia.slice(0, 7)))].sort();
  const porMes = meses.map(m => {
    const l = regs.filter(r => r.competencia.startsWith(m));
    const ren = l.filter(r => fontePorId(r.fonte_id)?.renovavel).reduce((s, r) => s + kwh(r), 0);
    const nao = l.filter(r => !fontePorId(r.fonte_id)?.renovavel).reduce((s, r) => s + kwh(r), 0);
    return { m, ren, nao, tot: ren + nao };
  });
  const porFonte = E.fontes.map(f => {
    const l = regs.filter(r => r.fonte_id === f.id);
    return { f, qtd: l.reduce((s, r) => s + Number(r.quantidade), 0), kwh: l.reduce((s, r) => s + kwh(r), 0), n: l.length,
      meses: Object.fromEntries(meses.map(m => [m, l.filter(r => r.competencia.startsWith(m)).reduce((s, r) => s + Number(r.quantidade), 0)])) };
  });
  const ren = porMes.reduce((s, x) => s + x.ren, 0), nao = porMes.reduce((s, x) => s + x.nao, 0), tot = ren + nao;
  return { regs, meses, porMes, porFonte, ren, nao, tot, pctRen: tot ? ren / tot * 100 : 0,
    eletrica: porFonte.filter(x => x.f.unidade === 'kWh').reduce((s, x) => s + x.qtd, 0),
    litros: porFonte.filter(x => /litro/i.test(x.f.unidade)).reduce((s, x) => s + x.qtd, 0),
    ultimo: E.regs.map(r => r.competencia).sort().pop() || '' };
}

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
function dialogo(html, ligar) {
  let d = $('dlgEn');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgEn'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgEn')?.open && $('dlgEn').close();
const erroDlg = t => { const e = $('enErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgEn')) $('dlgEn').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
async function gravar(tabela, lista, atual, linha, botao) {
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
    erroDlg(/duplicate|unique/i.test(m) ? 'Já existe uma fonte com esse nome.' : 'Não consegui gravar: ' + esc(m));
    return null;
  }
}
function confirmarApagar(tabela, lista, item, nome) {
  dialogo(`<h3>Apagar</h3><p>${esc(nome)}</p><div class="aviso erro" id="enErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="enApOk">Apagar</button></div>`, () => {
    $('enApOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('enApOk').disabled = true;
      const { error } = await estado.cliente.from(tabela).delete().eq('id', item.id);
      if (error) { $('enApOk').disabled = false; return erroDlg(/foreign key/i.test(error.message) ? 'Tem lançamentos com esta fonte: desative em vez de apagar.' : 'Não consegui apagar: ' + esc(error.message)); }
      const i = lista.findIndex(x => x.id === item.id); if (i >= 0) lista.splice(i, 1);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function grafico(porMes) {
  if (!porMes.length) return '<div class="vazio">Nenhum lançamento no período.</div>';
  const max = Math.max(...porMes.map(x => x.tot), 1);
  return `<div class="cf-graf en-graf" role="img" aria-label="Consumo por mês em kWh">
    ${porMes.map(x => `<div class="cf-col" title="${rotMes(x.m)}: ${fmt(x.tot)} kWh (renovável ${fmt(x.ren)}, não renovável ${fmt(x.nao)})">
      <span class="cf-val">${fmt(x.tot / 1000, 1)}</span>
      <div class="en-pilha" style="height:${Math.round(x.tot / max * 100)}%">
        <div class="en-nao" style="flex:${x.nao}"></div><div class="en-ren" style="flex:${x.ren}"></div></div>
      <span class="cf-mes">${rotMes(x.m)}</span><span class="cf-sub">${x.tot ? fmt(x.ren / x.tot * 100) + '% ren.' : ''}</span></div>`).join('')}
  </div><p class="dica" style="margin:4px 0 0"><span class="en-leg en-ren"></span> renovável <span class="en-leg en-nao"></span> não renovável · valores em MWh (mil kWh)</p>`;
}
function desenharPainel() {
  const tela = $('telaEnPainel');
  if (!E.fp.periodo) E.fp.periodo = periodoPadrao();
  const k = resumo(regsPeriodo(E.fp.periodo));
  const cartao = (cor, rot, val, dica, alvo) => `<button type="button" class="pv-card pv-${cor}" ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></button>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Consumo de energias', `${FORM.codigo} · ${rotPeriodo(E.fp.periodo)} · tudo convertido para kWh pelo fator de cada fonte`,
      `<button class="btn principal" type="button" id="enNovo">Novo lançamento</button>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Período <select id="enPer">${opcoes([...anos().map(a => [a, 'Ano ' + a]), ['12m', 'Últimos 12 meses'], ['tudo', 'Todo o histórico']], E.fp.periodo)}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Consumo total', fmt(k.tot) + ' kWh', `${k.meses.length} mês(es) com lançamento`, 'enLancamentos')}
      ${cartao(k.pctRen >= 50 ? 'calma' : 'alerta', 'Renovável', fmt(k.pctRen, 1) + '%', `${fmt(k.ren)} kWh`)}
      ${cartao('atencao', 'Não renovável', fmt(100 - k.pctRen, 1) + '%', `${fmt(k.nao)} kWh`)}
      ${cartao('calma', 'Energia elétrica', fmt(k.eletrica) + ' kWh', 'faturas de energia')}
      ${cartao('atencao', 'Combustíveis', fmt(k.litros) + ' L', 'gasolina, diesel, etanol')}
      ${cartao(k.ultimo && k.ultimo.slice(0, 7) < mesAnterior() ? 'alerta' : 'calma', 'Último mês lançado', k.ultimo ? rotMes(k.ultimo) : '—', k.ultimo && k.ultimo.slice(0, 7) < mesAnterior() ? `faltam os meses até ${rotMes(mesAnterior())}` : 'em dia', 'enLancamentos')}
    </div>
    <div class="qp-bloco"><h3>Consumo por mês</h3>${grafico(k.porMes)}</div>
    <div class="qp-bloco"><h3>Por fonte</h3>
      <div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Fonte</th><th>Tipo</th><th class="ce">Unidade</th>${k.meses.map(m => `<th class="ce">${rotMes(m)}</th>`).join('')}<th class="ce">Total</th><th class="ce">Fator kWh</th><th class="ce">kWh</th><th class="ce">%</th></tr></thead><tbody>
      ${k.porFonte.filter(x => x.n || x.f.ativa).map(x => `<tr><td><b>${esc(x.f.nome)}</b></td><td>${x.f.renovavel ? tag('Renovável', 'ativo') : tag('Não renovável', 'alerta')}</td><td class="ce">${esc(x.f.unidade)}</td>
        ${k.meses.map(m => `<td class="ce">${x.meses[m] ? fmt(x.meses[m]) : '<span class="dica">0</span>'}</td>`).join('')}
        <td class="ce"><b>${fmt(x.qtd)}</b></td><td class="ce">${fmt(x.f.fator_kwh, 2)}</td><td class="ce"><b>${fmt(x.kwh)}</b></td><td class="ce">${k.tot ? fmt(x.kwh / k.tot * 100, 1) : '—'}</td></tr>`).join('')}
      <tr class="en-total"><td colspan="${3 + k.meses.length + 2}">Total</td><td class="ce">${fmt(k.tot)}</td><td class="ce">100</td></tr>
      </tbody></table></div>
    </div>
    ${E.fontes.some(f => /2,52|2\.52/.test(f.observacao || '')) ? `<div class="aviso" style="margin-top:12px">Diesel S10: na planilha o fator era 2,52 (parece fator de CO₂ em kg/L). Aqui está 9,94 kWh/L, igual ao Diesel. Confira em <b>Fontes</b>.</div>` : ''}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="enImpPainel">Imprimir o painel</button>
    <button class="btn" type="button" id="enImpForm">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="enXlsx">Excel</button>
  </div>`;
  $('enPer').addEventListener('change', e => { E.fp.periodo = e.target.value; desenharPainel(); });
  $('enNovo').addEventListener('click', () => formLanc(null));
  $('enImpPainel').addEventListener('click', () => mostrar(docPainel(k), { barra: true }));
  $('enImpForm').addEventListener('click', () => mostrar(docForm(k), { barra: true }));
  $('enXlsx').addEventListener('click', () => exportar(k.regs));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => { E.fl.ano = /^\d{4}$/.test(E.fp.periodo) ? E.fp.periodo : ''; abrirModulo('cert', b.dataset.ir); }));
}
function mesAnterior() { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}`; }

/* ===================================================================
   TELA · LANÇAMENTOS
   =================================================================== */
function lancFiltrados() {
  const q = so(E.fl.q).toLowerCase();
  return E.regs.filter(r => (!E.fl.fonte || r.fonte_id === E.fl.fonte) && (!E.fl.ano || r.competencia.startsWith(E.fl.ano))
    && (!q || [fontePorId(r.fonte_id)?.nome, r.origem, r.fazenda, r.observacao].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.competencia.localeCompare(a.competencia) || (fontePorId(a.fonte_id)?.ordem || 0) - (fontePorId(b.fonte_id)?.ordem || 0));
}
function desenharLancamentos() {
  const tela = $('telaEnLancamentos');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Lançamentos de consumo', 'Um lançamento por fatura, nota ou abastecimento do mês. Anexe a fatura: vira evidência.',
      `<button class="btn principal" type="button" id="elNovo">Novo lançamento</button>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Buscar <input type="text" id="elQ" value="${esc(E.fl.q)}" placeholder="Origem, fazenda, observação"></label>
      <label class="campo">Fonte <select id="elFonte">${opcoes(E.fontes.map(f => [f.id, f.nome]), E.fl.fonte, 'Todas')}</select></label>
      <label class="campo">Ano <select id="elAno">${opcoes(anos(), E.fl.ano, 'Todos')}</select></label>
    </div>
    <div id="elTabela" style="margin-top:12px"></div>
  </div>`;
  const liga = (id, k, ev = 'change') => $(id).addEventListener(ev, e => { E.fl[k] = e.target.value; tabelaLanc(); });
  liga('elQ', 'q', 'input'); liga('elFonte', 'fonte'); liga('elAno', 'ano');
  $('elNovo').addEventListener('click', () => formLanc(null));
  tabelaLanc();
}
function tabelaLanc() {
  const l = lancFiltrados();
  $('elTabela').innerHTML = l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Mês</th><th>Fonte</th><th class="ce">Quantidade</th><th class="ce">kWh</th><th>Origem</th><th>Fazenda</th><th></th></tr></thead><tbody>
    ${l.map(r => { const f = fontePorId(r.fonte_id); return `<tr><td class="ce">${rotMes(r.competencia)}</td><td><b>${esc(f?.nome || '?')}</b>${f && !f.renovavel ? ' ' + tag('não ren.', 'alerta') : ''}</td>
      <td class="ce">${fmt(r.quantidade, Number(r.quantidade) % 1 ? 2 : 0)} ${esc(f?.unidade || '')}</td><td class="ce">${fmt(kwh(r))}</td>
      <td>${esc(r.origem || '')}${E.arq.has(String(r.id)) ? ' <span title="Tem fatura/nota anexada">📎</span>' : ''}</td><td>${esc(r.fazenda || '')}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(r.id)}">Abrir</button></td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="vazio">Nenhum lançamento.</div>';
  $('elTabela').querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formLanc(E.regs.find(r => r.id === b.dataset.ed))));
}
let anexos = null;
function formLanc(r, rascunho = null) {
  const v = rascunho || r || { competencia: `${mesAnterior()}-01`, fonte_id: '', quantidade: '', origem: '', fazenda: '', observacao: '' };
  dialogo(`<h3>${r ? 'Lançamento de consumo' : 'Novo lançamento de consumo'}</h3>
    <div class="aviso erro" id="enErro" hidden></div>
    <div class="grade">
      <label class="campo">Mês <input type="month" id="lcMes" value="${esc(String(v.competencia).slice(0, 7))}" max="${mesAtual()}"></label>
      <label class="campo">Fonte <select id="lcFonte">${opcoes(E.fontes.filter(f => f.ativa || f.id === v.fonte_id).map(f => [f.id, `${f.nome} (${f.unidade})`]), v.fonte_id, 'Escolha…')}</select></label>
      <label class="campo">Quantidade <span id="lcUn" class="dica"></span><input type="text" inputmode="decimal" id="lcQtd" value="${esc(v.quantidade === '' ? '' : String(v.quantidade).replace('.', ','))}" placeholder="0"></label>
      <label class="campo">Equivale a <input type="text" id="lcKwh" disabled></label>
      <label class="campo">Origem <input type="text" id="lcOrig" value="${esc(v.origem || '')}" placeholder="Ex.: fatura CEMIG instalação 3012…, posto, nota 1234" list="lcOrigs"></label>
      <label class="campo">Fazenda <input type="text" id="lcFaz" value="${esc(v.fazenda || '')}" list="lcFazs"></label>
    </div>
    <datalist id="lcOrigs">${[...new Set(E.regs.map(x => x.origem).filter(Boolean))].map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <datalist id="lcFazs">${[...new Set(E.regs.map(x => x.fazenda).filter(Boolean))].map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <div id="lcAnexos" style="margin-top:8px"></div>
    <label class="campo">Observação <textarea id="lcObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre">
      <div>${r ? '<button class="btn perigo" type="button" id="lcApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button>
        ${r ? '' : '<button class="btn" type="button" id="lcMais">Salvar e lançar outro</button>'}
        <button class="btn principal" type="button" id="lcOk">Salvar</button></div>
    </div>`, () => {
    anexos = campoAnexos($('lcAnexos'), { area: 'certificacao', tipo: 'energia', rotulo: 'Fatura / nota', dica: 'PDF ou foto — vira evidência do FORM 043' });
    anexos.abrir(r ? r.id : null);
    const conta = () => { const f = fontePorId($('lcFonte').value); const q = num($('lcQtd').value);
      $('lcUn').textContent = f ? `(${f.unidade})` : ''; $('lcKwh').value = f && q != null ? `${fmt(q * f.fator_kwh)} kWh` : ''; };
    $('lcFonte').addEventListener('change', conta); $('lcQtd').addEventListener('input', conta); conta();
    $('lcOk').addEventListener('click', () => salvarLanc(r, false));
    $('lcMais')?.addEventListener('click', () => salvarLanc(r, true));
    $('lcApagar')?.addEventListener('click', () => confirmarApagar('ce_consumos', E.regs, r, `${rotMes(r.competencia)} · ${fontePorId(r.fonte_id)?.nome || ''} · ${fmt(r.quantidade)}`));
  });
}
async function salvarLanc(atual, outro) {
  const mes = $('lcMes').value, fonte = $('lcFonte').value, q = num($('lcQtd').value);
  if (!/^\d{4}-\d{2}$/.test(mes)) return erroDlg('Informe o mês.');
  if (mes > mesAtual()) return erroDlg('O mês está no futuro.');
  if (!fonte) return erroDlg('Escolha a fonte.');
  if (q == null || q < 0) return erroDlg('Informe a quantidade.');
  const l = { competencia: `${mes}-01`, fonte_id: fonte, quantidade: q, origem: so($('lcOrig').value) || null, fazenda: so($('lcFaz').value) || null, observacao: so($('lcObs').value) || null };
  const salvo = await gravar('ce_consumos', E.regs, atual, atual ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, outro ? 'lcMais' : 'lcOk');
  if (!salvo) return;
  if (anexos?.mudou) { await anexos.salvar(salvo.id); E.arq.add(String(salvo.id)); }
  fechar();
  if (outro) return formLanc(null, { competencia: l.competencia, fonte_id: '', quantidade: '', origem: '', fazenda: l.fazenda, observacao: '' });
  redesenhar();
}

/* ===================================================================
   TELA · FONTES
   =================================================================== */
function desenharFontes() {
  const tela = $('telaEnFontes');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Fontes de energia', 'Cada fonte tem a unidade em que é lançada e o fator para virar kWh (1 unidade = X kWh).',
      `<button class="btn principal" type="button" id="efNova">Nova fonte</button>`)}
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr><th>Fonte</th><th>Tipo</th><th class="ce">Unidade</th><th class="ce">Fator kWh</th><th class="ce">Lançamentos</th><th>Observação</th><th></th></tr></thead><tbody>
    ${E.fontes.map(f => `<tr${f.ativa ? '' : ' class="cf-inativa"'}><td><b>${esc(f.nome)}</b></td><td>${f.renovavel ? tag('Renovável', 'ativo') : tag('Não renovável', 'alerta')}</td>
      <td class="ce">${esc(f.unidade)}</td><td class="ce">${fmt(f.fator_kwh, 2)}</td><td class="ce">${E.regs.filter(r => r.fonte_id === f.id).length}</td>
      <td><small>${esc(f.observacao || '')}</small></td><td class="ce"><button class="btn mini" type="button" data-ed="${esc(f.id)}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="dica" style="margin-top:10px">Referência usada na planilha: gasolina 9,7 kWh/L · diesel 9,94 kWh/L · etanol 6,26 kWh/L · eletricidade 1 kWh = 1 kWh.</p>
  </div>`;
  $('efNova').addEventListener('click', () => formFonte(null));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formFonte(fontePorId(b.dataset.ed))));
}
function formFonte(f) {
  const v = f || { nome: '', renovavel: false, unidade: 'litros', fator_kwh: 1, ordem: E.fontes.length + 1, ativa: true, observacao: '' };
  dialogo(`<h3>${f ? 'Fonte de energia' : 'Nova fonte de energia'}</h3>
    <div class="aviso erro" id="enErro" hidden></div>
    <div class="grade">
      <label class="campo">Nome <input type="text" id="foNome" value="${esc(v.nome)}"></label>
      <label class="campo">Unidade <input type="text" id="foUn" value="${esc(v.unidade)}" list="foUns"></label>
      <label class="campo">Fator (1 unidade = X kWh) <input type="text" inputmode="decimal" id="foFator" value="${esc(String(v.fator_kwh).replace('.', ','))}"></label>
      <label class="campo">Ordem <input type="number" id="foOrdem" value="${esc(v.ordem)}"></label>
    </div>
    <datalist id="foUns"><option value="kWh"><option value="litros"><option value="m³"><option value="kg"></datalist>
    <label class="campo rs-check"><input type="checkbox" id="foRen" ${v.renovavel ? 'checked' : ''}> Renovável</label>
    <label class="campo rs-check"><input type="checkbox" id="foAtiva" ${v.ativa ? 'checked' : ''}> Ativa (aparece ao lançar)</label>
    <label class="campo">Observação <textarea id="foObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre"><div>${f ? '<button class="btn perigo" type="button" id="foApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="foOk">Salvar</button></div></div>`, () => {
    $('foOk').addEventListener('click', async () => {
      const l = { nome: so($('foNome').value), unidade: so($('foUn').value) || 'kWh', fator_kwh: num($('foFator').value), ordem: Number($('foOrdem').value) || 0,
        renovavel: $('foRen').checked, ativa: $('foAtiva').checked, observacao: so($('foObs').value) || null };
      if (!l.nome) return erroDlg('Informe o nome.');
      if (!(l.fator_kwh > 0)) return erroDlg('Informe o fator (maior que zero).');
      const s = await gravar('ce_fontes', E.fontes, f, f ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'foOk');
      if (!s) return;
      E.fontes.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)); fechar(); redesenhar();
    });
    $('foApagar')?.addEventListener('click', () => {
      if (E.regs.some(r => r.fonte_id === f.id)) return erroDlg('Tem lançamentos com esta fonte. Desmarque “Ativa” em vez de apagar.');
      confirmarApagar('ce_fontes', E.fontes, f, f.nome);
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
function tabelaFontes(k, renov) {
  const l = k.porFonte.filter(x => x.f.renovavel === renov && (x.n || x.f.ativa));
  const tot = l.reduce((s, x) => s + x.kwh, 0);
  return `<table class="rel-tabela"><thead><tr><th>${renov ? 'Renovável' : 'Não renovável'}</th><th>Unidade</th>${k.meses.map(m => `<th>${rotMes(m)}</th>`).join('')}<th>kWh</th></tr></thead><tbody>
    ${l.map(x => `<tr><td>${esc(x.f.nome)}</td><td>${esc(x.f.unidade)}</td>${k.meses.map(m => `<td class="rel-num">${fmt(x.meses[m] || 0)}</td>`).join('')}<td class="rel-num">${fmt(x.kwh)}</td></tr>`).join('')}
    <tr><td colspan="${2 + k.meses.length}"><b>Total kWh</b></td><td class="rel-num"><b>${fmt(tot)}</b></td></tr></tbody></table>`;
}
function docForm(k) {
  return documento({ titulo: 'Consumo de energias', subtitulo: rotPeriodo(E.fp.periodo), canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div><div><span>Período</span><b>${k.meses.length ? rotMes(k.meses[0]) + ' a ' + rotMes(k.meses[k.meses.length - 1]) : '—'}</b></div></div>
    <div class="en-duas">${tabelaFontes(k, true)}${tabelaFontes(k, false)}</div>
    <table class="rel-tabela" style="max-width:420px;margin-top:10px"><thead><tr><th>Consumo de energias</th><th>kWh</th><th>%</th></tr></thead><tbody>
      <tr><td>Energia renovável</td><td class="rel-num">${fmt(k.ren)}</td><td class="rel-num">${fmt(k.pctRen, 1)}</td></tr>
      <tr><td>Energia não renovável</td><td class="rel-num">${fmt(k.nao)}</td><td class="rel-num">${fmt(100 - k.pctRen, 1)}</td></tr>
      <tr><td><b>Total</b></td><td class="rel-num"><b>${fmt(k.tot)}</b></td><td class="rel-num">100</td></tr></tbody></table>
    <p class="rel-nota">Fatores de conversão para kWh: ${E.fontes.filter(f => f.unidade !== 'kWh').map(f => `${esc(f.nome)} ${fmt(f.fator_kwh, 2)} kWh/${esc(f.unidade.replace(/s$/, ''))}`).join(' · ')}.</p>` });
}
function docPainel(k) {
  const max = Math.max(...k.porMes.map(x => x.tot), 1);
  return documento({ titulo: 'Consumo de energias', subtitulo: `Painel · ${rotPeriodo(E.fp.periodo)}`, canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-qkpis">
      <div><span>Consumo total</span><strong>${fmt(k.tot)}</strong><small>kWh</small></div>
      <div class="rel-q--otimo-t"><span>Renovável</span><strong>${fmt(k.pctRen, 1)}%</strong><small>${fmt(k.ren)} kWh</small></div>
      <div class="rel-q--bom-t"><span>Não renovável</span><strong>${fmt(100 - k.pctRen, 1)}%</strong><small>${fmt(k.nao)} kWh</small></div>
      <div><span>Energia elétrica</span><strong>${fmt(k.eletrica)}</strong><small>kWh</small></div>
      <div><span>Combustíveis</span><strong>${fmt(k.litros)}</strong><small>litros</small></div>
      <div><span>Meses</span><strong>${k.meses.length}</strong><small>com lançamento</small></div>
    </div>
    <p class="rel-secao">Consumo por mês (MWh)</p>
    <div class="cf-graf cf-graf-rel en-graf">${k.porMes.map(x => `<div class="cf-col"><span class="cf-val">${fmt(x.tot / 1000, 1)}</span>
      <div class="en-pilha" style="height:${Math.round(x.tot / max * 100)}%"><div class="en-nao" style="flex:${x.nao}"></div><div class="en-ren" style="flex:${x.ren}"></div></div><span class="cf-mes">${rotMes(x.m)}</span></div>`).join('')}</div>
    <p class="rel-nota">Verde: renovável · marrom: não renovável.</p>
    <p class="rel-secao">Por fonte</p>
    <div class="en-duas">${tabelaFontes(k, true)}${tabelaFontes(k, false)}</div>` });
}
async function exportar(regs) {
  const linhas = regs.slice().sort((a, b) => a.competencia.localeCompare(b.competencia)).map(r => { const f = fontePorId(r.fonte_id);
    return [r.competencia, f?.nome || '', f?.renovavel ? 'Renovável' : 'Não renovável', Number(r.quantidade), f?.unidade || '', Number(f?.fator_kwh || 0), kwh(r), r.origem || '', r.fazenda || '', r.observacao || '']; });
  await baixarXlsx(`consumo-energia-${hoje()}.xlsx`, [{ nome: 'Lançamentos', titulo: `${FORM.codigo} — ${FORM.titulo}`, subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Mês', larg: 12, tipo: 'data' }, { rot: 'Fonte', larg: 22 }, { rot: 'Tipo', larg: 14 }, { rot: 'Quantidade', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Unidade', larg: 9 },
      { rot: 'Fator kWh', larg: 10, tipo: 'num', casas: 2 }, { rot: 'kWh', larg: 12, tipo: 'num', casas: 0 }, { rot: 'Origem', larg: 30 }, { rot: 'Fazenda', larg: 20 }, { rot: 'Observação', larg: 40 }],
    linhas }]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_ENERGIA = ['enPainel', 'enLancamentos', 'enFontes'];
const DESENHO = { enPainel: desenharPainel, enLancamentos: desenharLancamentos, enFontes: desenharFontes };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirEnergia(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o consumo de energia…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o consumo de energia: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgEn')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparEnergia() {
  E.carregado = false; E.fontes = []; E.regs = []; E.arq = new Set(); E.fp.periodo = '';
  Object.assign(E.fl, { fonte: '', ano: '', q: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _ce2 = { E, resumo, kwh };
