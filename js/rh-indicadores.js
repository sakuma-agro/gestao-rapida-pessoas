// rh-indicadores.js — RH › Indicadores › Painel (01/10/2026)
//
// Absenteísmo e turnover. Especificação: claude/07-Indicadores-Absenteismo-
// Turnover-Especificacao.md. Tudo sai de UMA consulta no banco,
// rh_ind_base(ini, fim): uma linha por mês × vínculo. Até 09/2026 ela lê o
// histórico importado (P07 + Contagri); de 10/2026 em diante, a Gestão de
// jornada. Esta tela só soma e divide — nenhuma regra de negócio mora aqui
// que não esteja escrita no topo de cada função.

import { estado } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ym = d => d.slice(0, 7);
const rotMes = k => MESES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
const hojeMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const num = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Metas (D-35) — média mensal. Ficam editáveis na tela Metas (etapa 5). */
export const METAS = {
  absTotal: { verde: 0.03, atencao: 0.05 },
  absNj:    { verde: 0.01, atencao: 0.02 },
  turnover: { verde: 0.03, atencao: 0.05 },
};
const faixa = (v, m) => v == null || !isFinite(v) ? null : v <= m.verde ? 'verde' : v <= m.atencao ? 'atencao' : 'critico';
const SELO = { verde: ['ativo', 'verde'], atencao: ['alerta', 'atenção'], critico: ['perigo', 'crítico'] };
const selo = f => f ? `<span class="tag ${SELO[f][0]} ind-selo">${SELO[f][1]}</span>` : '';

const est = { linhas: [], carregado: false, erro: '', carregadoEm: null, f: null };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const { data, error } = await c.rpc('rh_ind_base', { p_ini: '2022-01-01', p_fim: hojeMes() + '-01' });
  if (error) throw error;
  est.linhas = (data || []).map(r => ({ ...r, m: ym(r.mes) }));
  est.carregado = true; est.carregadoEm = new Date();
}

/* Meses do histórico sem NENHUMA ausência na empresa inteira (2025: faltas
   ainda não recebidas) ficam fora do absenteísmo — senão o mês entraria com 0%. */
function mesesSemFaltas() {
  const com = new Set(), todos = new Set();
  for (const r of est.linhas) {
    todos.add(r.m);
    if (r.fonte !== 'histórico importado' || +r.h_ferias + +r.h_falta_nj + +r.h_falta_j + +r.h_atestado + +r.h_afast + +r.h_atraso > 0) com.add(r.m);
  }
  return new Set([...todos].filter(m => !com.has(m)));
}

/* ---------------- filtros ---------------- */

const opc = (lista, sel, todos = 'Todos') => `<option value="">${todos}</option>` +
  lista.map(v => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const uniq = k => [...new Set(est.linhas.map(r => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

function filtrosPadrao() {
  const fim = hojeMes();
  return { de: fim.slice(0, 4) + '-01', ate: fim, empregador: '', fazenda: '', sexo: '', contrato: '', setor: '', funcao: '' };
}

function lerFiltros() {
  const g = id => $(id)?.value || '';
  let de = g('indDe') || est.f.de, ate = g('indAte') || est.f.ate;
  if (de > ate) [de, ate] = [ate, de];
  est.f = { de, ate, empregador: g('indEmp'), fazenda: g('indFaz'), sexo: g('indSexo'),
            contrato: g('indContrato'), setor: g('indSetor'), funcao: g('indFuncao') };
}

const passa = (r, f, semSexo = false) =>
  (!f.empregador || norm(r.empregador) === norm(f.empregador)) &&
  (!f.fazenda || norm(r.fazenda) === norm(f.fazenda)) &&
  (semSexo || !f.sexo || r.sexo === f.sexo) &&
  (!f.contrato || r.tipo_contrato === f.contrato) &&
  (!f.setor || r.setor === f.setor) &&
  (!f.funcao || r.funcao === f.funcao);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ---------------- cálculo ---------------- */

/**
 * Indicadores de um conjunto de meses (spec 07, seção 3).
 * Absenteísmo: horas ausentes ÷ (horas previstas − férias). "Sem afastamento"
 * tira o afastamento do numerador E do denominador (D-21). Meses sem faltas
 * no histórico ficam fora do absenteísmo.
 * Turnover: ((adm + desl) ÷ 2) ÷ quadro médio; quadro médio = (início + fim) ÷ 2
 * (D-25, D-26). Transferência não é admissão nem desligamento (D-23).
 */
function calcular(linhas, meses, semFaltas) {
  const set = new Set(meses);
  const L = linhas.filter(r => set.has(r.m));
  const s = k => L.reduce((a, r) => a + (+r[k] || 0), 0);
  const LA = L.filter(r => !semFaltas.has(r.m));
  const sa = k => LA.reduce((a, r) => a + (+r[k] || 0), 0);
  const base = sa('h_prev') - sa('h_ferias');
  const fnj = sa('h_falta_nj'), fj = sa('h_falta_j'), ate = sa('h_atestado'), afa = sa('h_afast'), atr = sa('h_atraso');
  const ini = meses[0], fim = meses[meses.length - 1];
  const qIni = L.filter(r => r.m === ini && r.ativo_ini).length;
  const qFim = L.filter(r => r.m === fim && r.ativo_fim).length;
  const qm = (qIni + qFim) / 2;
  const adm = L.filter(r => r.admitido).length, desl = L.filter(r => r.desligado).length;
  const vol = L.filter(r => r.desl_voluntario).length;
  const temAbs = LA.length > 0 && base > 0;
  const div = (a, b) => b > 0 ? a / b : null;
  return {
    meses: meses.length, mesesAbs: new Set(LA.map(r => r.m)).size,
    horasBase: base, horasAus: fnj + fj + ate + afa, afa, atr,
    absCom: temAbs ? div(fnj + fj + ate + afa, base) : null,
    absSem: temAbs ? div(fnj + fj + ate, base - afa) : null,
    njCom: temAbs ? div(fnj, base) : null,
    njSem: temAbs ? div(fnj, base - afa) : null,
    atrasoPct: temAbs ? div(atr, base) : null,
    qIni, qFim, qm, adm, desl, vol, invol: desl - vol,
    readm: L.filter(r => r.readmissao).length,
    trSai: L.filter(r => r.transf_saida).length, trEnt: L.filter(r => r.transf_entrada).length,
    turnover: div((adm + desl) / 2, qm), txDesl: div(desl, qm), txAdm: div(adm, qm),
    txVol: div(vol, qm), txInvol: div(desl - vol, qm),
  };
}

function mesesEntre(de, ate) {
  const out = []; let [a, m] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  while (a < a2 || (a === a2 && m <= m2)) { out.push(`${a}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}

/* Colunas das três visões (D-34): por ano, acumulado do período, últimos 3 meses. */
function colunas(f) {
  const todos = mesesEntre(f.de, f.ate).filter(m => m <= hojeMes());
  const anos = [...new Set(todos.map(m => m.slice(0, 4)))];
  const cols = anos.map(a => ({ rot: a, meses: todos.filter(m => m.startsWith(a)), grupo: 'ano' }));
  cols.push({ rot: 'Acumulado', meses: todos, grupo: 'acum' });
  const ult = todos.slice(-3);
  ult.forEach(m => cols.push({ rot: rotMes(m), meses: [m], grupo: 'mes', apuracao: m === hojeMes() }));
  if (ult.length > 1) cols.push({ rot: 'Últimos 3', meses: ult, grupo: 'tres' });
  return cols;
}

/* ---------------- desenho ---------------- */

function linhaTabela(rot, cols, fn, opts = {}) {
  return `<tr class="${opts.sub ? 'ind-sub' : ''}${opts.forte ? ' ind-forte' : ''}"><th scope="row">${rot}</th>${cols.map(c => {
    const v = fn(c.r, c);
    return `<td class="ind-g-${c.grupo}">${v}</td>`;
  }).join('')}</tr>`;
}

/* Meta da taxa: absenteísmo já é média; turnover vira média mensal (÷ meses). */
const comMeta = (v, meta, meses = 1) => v == null ? '—' : `${pct(v)}${selo(faixa(meses > 1 ? v / meses : v, meta))}`;

function tabelaAbs(cols) {
  const cab = `<tr><th></th>${cols.map(c => `<th class="ind-g-${c.grupo}">${esc(c.rot)}${c.apuracao ? '<br><small>em apuração</small>' : ''}</th>`).join('')}</tr>`;
  return `<div class="ind-rolagem"><table class="ind-tab"><thead>${cab}</thead><tbody>
    ${linhaTabela('Absenteísmo total · com afastamento', cols, r => comMeta(r.absCom, METAS.absTotal), { forte: true })}
    ${linhaTabela('Absenteísmo total · sem afastamento', cols, r => comMeta(r.absSem, METAS.absTotal))}
    ${linhaTabela('Não justificado · com afastamento', cols, r => comMeta(r.njCom, METAS.absNj))}
    ${linhaTabela('Não justificado · sem afastamento', cols, r => comMeta(r.njSem, METAS.absNj))}
    ${linhaTabela('Atrasos e saídas antecipadas', cols, r => r.atrasoPct == null ? '—' : `${pct(r.atrasoPct)} <small>${num(r.atr)} h</small>`)}
    ${linhaTabela('Horas ausentes / horas previstas', cols, r => r.mesesAbs ? `${num(r.horasAus)} / ${num(r.horasBase)}` : '—', { sub: true })}
    ${linhaTabela('Meses com dados de faltas', cols, r => `${r.mesesAbs} de ${r.meses}`, { sub: true })}
  </tbody></table></div>`;
}

function tabelaTurn(cols) {
  const cab = `<tr><th></th>${cols.map(c => `<th class="ind-g-${c.grupo}">${esc(c.rot)}${c.apuracao ? '<br><small>em apuração</small>' : ''}</th>`).join('')}</tr>`;
  return `<div class="ind-rolagem"><table class="ind-tab"><thead>${cab}</thead><tbody>
    ${linhaTabela('Turnover', cols, (r, c) => comMeta(r.turnover, METAS.turnover, c.meses.length), { forte: true })}
    ${linhaTabela('Taxa de desligamento', cols, r => pct(r.txDesl))}
    ${linhaTabela('· voluntário (pedido)', cols, r => `${pct(r.txVol)} <small>${r.vol}</small>`, { sub: true })}
    ${linhaTabela('· involuntário', cols, r => `${pct(r.txInvol)} <small>${r.invol}</small>`, { sub: true })}
    ${linhaTabela('Admissões', cols, r => `${r.adm}${r.readm ? ` <small>(${r.readm} readm.)</small>` : ''}`)}
    ${linhaTabela('Desligamentos', cols, r => String(r.desl))}
    ${linhaTabela('Transferências (saída / entrada)', cols, r => `${r.trSai} / ${r.trEnt}`, { sub: true })}
    ${linhaTabela('Quadro início → fim (médio)', cols, r => `${r.qIni} → ${r.qFim} <small>(${num(r.qm, 1)})</small>`, { sub: true })}
  </tbody></table></div>`;
}

function tabelaSexo(f, semFaltas) {
  const todos = mesesEntre(f.de, f.ate).filter(m => m <= hojeMes());
  const ult = todos.slice(-3);
  const base = est.linhas.filter(r => passa(r, f, true));
  const lin = (sx, rot) => {
    const L = base.filter(r => r.sexo === sx);
    const a = calcular(L, todos, semFaltas), u = calcular(L, ult, semFaltas);
    const pouco = Math.max(a.qIni, a.qFim) < 3;
    return `<tr><th scope="row">${rot}${pouco ? ' <small>(menos de 3 pessoas)</small>' : ''}</th>
      <td>${num(a.qm, 1)}</td><td>${comMeta(a.absCom, METAS.absTotal)}</td><td>${comMeta(a.absSem, METAS.absTotal)}</td>
      <td>${comMeta(a.turnover, METAS.turnover, todos.length)}</td><td>${a.desl}</td>
      <td class="ind-g-tres">${comMeta(u.absCom, METAS.absTotal)}</td><td class="ind-g-tres">${comMeta(u.turnover, METAS.turnover, ult.length)}</td></tr>`;
  };
  return `<div class="ind-rolagem"><table class="ind-tab"><thead><tr><th></th><th>Quadro médio</th><th>Absent. total (com afast.)</th>
    <th>Absent. total (sem afast.)</th><th>Turnover</th><th>Deslig.</th><th class="ind-g-tres">Absent. · últimos 3</th><th class="ind-g-tres">Turnover · últimos 3</th></tr></thead>
    <tbody>${lin('M', 'Homens')}${lin('F', 'Mulheres')}</tbody></table></div>`;
}

/* Barras mensais de 12 meses, com as faixas da meta ao fundo. Uma série só:
   a cor é o verde da marca; a faixa da meta é escrita no rótulo, não só na cor. */
function grafico(titulo, meses, valores, meta, rotulos) {
  const W = 900, H = 210, E = 44, T = 12, B = 24, larg = (W - E - 8) / meses.length;
  const max = Math.max(meta.atencao * 1.6, ...valores.filter(v => v != null)) || 0.1;
  const y = v => T + (H - T - B) * (1 - v / max);
  const faixaRect = (a, b, cls) => `<rect class="${cls}" x="${E}" y="${y(Math.min(b, max))}" width="${W - E - 8}" height="${Math.max(0, y(a) - y(Math.min(b, max)))}"/>`;
  const marcas = [0, meta.verde, meta.atencao, max].filter(v => v <= max);
  return `<figure class="ind-graf"><figcaption>${esc(titulo)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">
      ${faixaRect(0, meta.verde, 'ind-fx-verde')}${faixaRect(meta.verde, meta.atencao, 'ind-fx-atencao')}${faixaRect(meta.atencao, max, 'ind-fx-critico')}
      ${marcas.map(v => `<line class="ind-eixo" x1="${E}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text class="ind-txt" x="${E - 4}" y="${y(v) + 3}" text-anchor="end">${pct(v)}</text>`).join('')}
      ${meses.map((m, i) => {
        const v = valores[i], x = E + i * larg + larg * 0.2, w = larg * 0.6;
        const barra = v == null ? `<text class="ind-txt ind-sem" x="${x + w / 2}" y="${H - B - 4}" text-anchor="middle">s/d</text>`
          : `<rect class="ind-barra" x="${x}" y="${y(v)}" width="${w}" height="${Math.max(1, H - B - y(v))}" rx="3"><title>${rotMes(m)}: ${pct(v)} · ${rotulos?.[i] || ''}</title></rect>`;
        return `${barra}<text class="ind-txt" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${rotMes(m)}</text>`;
      }).join('')}
    </svg>
    <p class="ind-legenda"><span class="ind-cx ind-fx-verde"></span>verde até ${pct(meta.verde)} · <span class="ind-cx ind-fx-atencao"></span>atenção até ${pct(meta.atencao)} · <span class="ind-cx ind-fx-critico"></span>crítico acima · s/d = sem dados</p>
  </figure>`;
}

function desenhar() {
  const tela = $('telaRhIndPainel');
  if (!tela) return;
  if (est.erro) { tela.innerHTML = `<div class="cartao"><div class="aviso erro">${esc(est.erro)}</div></div>`; return; }
  if (!est.carregado) { tela.innerHTML = '<div class="cartao"><p class="dica">Carregando os indicadores…</p></div>'; return; }
  const f = est.f;
  const semFaltas = mesesSemFaltas();
  const L = est.linhas.filter(r => passa(r, f));
  const cols = colunas(f).map(c => ({ ...c, r: calcular(L, c.meses, semFaltas) }));
  const ult12 = mesesEntre(...(() => { const m = mesesEntre('2022-01', f.ate); return [m[Math.max(0, m.length - 12)], f.ate]; })());
  const porMes = ult12.map(m => calcular(L, [m], semFaltas));
  const semNoPeriodo = mesesEntre(f.de, f.ate).filter(m => semFaltas.has(m));
  const fazendas = uniq('fazenda'), empregadores = uniq('empregador');
  const hora = est.carregadoEm ? est.carregadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  tela.innerHTML = `
  <div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Indicadores · absenteísmo e turnover</h2>
        <p class="dica" style="margin:2px 0 0">Dados de ${esc(rotMes(f.de))} a ${esc(rotMes(f.ate))} · atualizado às ${hora}</p></div>
      <span class="acoes"><button class="btn" id="indRecarregar">Atualizar</button></span>
    </div>
    <div class="grade ind-filtros" style="margin-top:12px">
      <label class="campo">De <input type="month" id="indDe" value="${f.de}" min="2022-01" max="${hojeMes()}"></label>
      <label class="campo">Até <input type="month" id="indAte" value="${f.ate}" min="2022-01" max="${hojeMes()}"></label>
      <label class="campo">Empregador <select id="indEmp">${opc(empregadores, f.empregador)}</select></label>
      <label class="campo">Fazenda <select id="indFaz">${opc(fazendas, f.fazenda, 'Todas')}</select></label>
      <label class="campo">Sexo <select id="indSexo">${opc([], '')}<option value="M" ${f.sexo === 'M' ? 'selected' : ''}>Masculino</option><option value="F" ${f.sexo === 'F' ? 'selected' : ''}>Feminino</option></select></label>
      <label class="campo">Contrato <select id="indContrato">${opc([], '')}<option value="fixo" ${f.contrato === 'fixo' ? 'selected' : ''}>Fixo</option><option value="safra" ${f.contrato === 'safra' ? 'selected' : ''}>Safra</option></select></label>
      <label class="campo">Setor <select id="indSetor">${opc(uniq('setor'), f.setor)}</select></label>
      <label class="campo">Função <select id="indFuncao">${opc(uniq('funcao'), f.funcao, 'Todas')}</select></label>
    </div>
    <div class="ind-avisos">
      <p>Administrativo: dia sem lançamento conta como presente.</p>
      <p>Até 09/2026 os números vêm do histórico importado (P07 + Contagri); de 10/2026 em diante, da Gestão de jornada.</p>
      ${semNoPeriodo.length ? `<p class="ind-alerta">Sem dados de faltas em ${semNoPeriodo.length} mês(es) do período (${esc(rotMes(semNoPeriodo[0]))} a ${esc(rotMes(semNoPeriodo[semNoPeriodo.length - 1]))}): ficam fora do absenteísmo até a carga das faltas de 2025.</p>` : ''}
      ${cols.some(c => c.apuracao) ? '<p>O mês corrente está em apuração: muda até o fechamento.</p>' : ''}
    </div>
  </div>

  <div class="cartao"><h2>Absenteísmo</h2>
    <p class="dica">Total = falta não justificada + falta justificada + atestado. "Com afastamento" soma também afastamentos e licenças (como na P07). Férias saem do cálculo.</p>
    ${tabelaAbs(cols)}
    ${grafico('Absenteísmo total (com afastamento) · últimos 12 meses', ult12, porMes.map(r => r.absCom), METAS.absTotal, porMes.map(r => `${num(r.horasAus)} h de ${num(r.horasBase)} h`))}
  </div>

  <div class="cartao"><h2>Turnover</h2>
    <p class="dica">Turnover = ((admissões + desligamentos) ÷ 2) ÷ quadro médio. Quadro médio = (início + fim) ÷ 2. Transferência entre unidades não conta. A cor compara a média mensal com a meta.</p>
    ${tabelaTurn(cols)}
    ${grafico('Turnover mensal · últimos 12 meses', ult12, porMes.map(r => r.turnover), METAS.turnover, porMes.map(r => `${r.adm} adm · ${r.desl} desl · quadro ${num(r.qm, 1)}`))}
  </div>

  <div class="cartao"><h2>Por sexo</h2>
    <p class="dica">Período escolhido e últimos 3 meses. Os outros filtros valem aqui também; o filtro de sexo não.</p>
    ${tabelaSexo(f, semFaltas)}
  </div>`;

  ['indDe', 'indAte', 'indEmp', 'indFaz', 'indSexo', 'indContrato', 'indSetor', 'indFuncao'].forEach(id =>
    $(id).addEventListener('change', () => { lerFiltros(); desenhar(); }));
  $('indRecarregar').addEventListener('click', () => abrirIndicadores('rhIndPainel', true));
}

export async function abrirIndicadores(tela = 'rhIndPainel', forcar = false) {
  if (!est.f) est.f = filtrosPadrao();
  if (!est.carregado || forcar) {
    est.erro = ''; est.carregado = false; desenhar();
    try { await carregar(); }
    catch (e) { est.erro = 'Não consegui carregar os indicadores: ' + (e.message || e); }
  }
  desenhar();
}

export function limparIndicadores() { est.linhas = []; est.carregado = false; est.f = null; }

/* Para testes e para as próximas telas (Certificação, TV, relatório). */
export const _ind = { calcular, mesesEntre, mesesSemFaltas, est };
