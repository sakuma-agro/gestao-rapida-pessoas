// rh-indicadores.js — RH › Indicadores › Painel (01/10/2026)
//
// Absenteísmo e turnover. Especificação: claude/07-Indicadores-Absenteismo-
// Turnover-Especificacao.md. Tudo sai de UMA consulta no banco,
// rh_ind_base(ini, fim): uma linha por mês × vínculo. Até 09/2026 ela lê o
// histórico importado (P07 + Contagri); de 10/2026 em diante, a Gestão de
// jornada. Esta tela só soma e divide — nenhuma regra de negócio mora aqui
// que não esteja escrita no topo de cada função.

import { estado } from './store.js';
import { pode, podeTela, acesso } from './acesso.js';
import { mostrar, imprimir } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ym = d => d.slice(0, 7);
const rotMes = k => MESES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
const hojeMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const num = (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Metas (D-35) — média mensal. Padrão; a tela Metas grava em rh_ind_metas e
   o carregar() troca estes valores pelos do banco. */
export const METAS = {
  absTotal: { verde: 0.03, atencao: 0.05 },
  absNj:    { verde: 0.01, atencao: 0.02 },
  turnover: { verde: 0.03, atencao: 0.05 },
};
const faixa = (v, m) => v == null || !isFinite(v) ? null : v <= m.verde ? 'verde' : v <= m.atencao ? 'atencao' : 'critico';
const SELO = { verde: ['ativo', 'verde'], atencao: ['alerta', 'atenção'], critico: ['perigo', 'crítico'] };
const selo = f => f ? `<span class="tag ${SELO[f][0]} ind-selo">${SELO[f][1]}</span>` : '';

const est = { linhas: [], lacunas: new Set(), carregado: false, erro: '', carregadoEm: null, f: null, tela: 'rhIndPainel' };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const { data, error } = await c.rpc('rh_ind_base', { p_ini: '2022-01-01', p_fim: hojeMes() + '-01' });
  if (error) throw error;
  est.linhas = (data || []).map(r => ({ ...r, m: ym(r.mes) }));
  // Metas e meses sem dados de faltas: tabelas pequenas; se falharem, valem os padrões.
  const [mt, lc] = await Promise.all([c.from('rh_ind_metas').select('*'), c.from('rh_ind_lacunas').select('mes,motivo')]);
  (mt.data || []).forEach(m => { if (METAS[m.indicador]) METAS[m.indicador] = { verde: +m.verde, atencao: +m.atencao }; });
  est.lacunas = new Set((lc.data || []).map(l => ym(l.mes)));
  est.motivoLacuna = lc.data?.[0]?.motivo || '';
  est.carregado = true; est.carregadoEm = new Date();
}

/* Meses SEM DADOS de faltas ficam fora do absenteísmo (senão entrariam com
   0%). São declarados em rh_ind_lacunas (hoje: 2025 inteiro, faltas ainda não
   recebidas) — nunca deduzidos de "não houve falta", que é um mês real. */
const mesesSemFaltas = () => est.lacunas;

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
      <span class="acoes"><button class="btn" id="indRecarregar">Atualizar</button>
        <button class="btn" id="indExcel">Excel</button>
        <button class="btn" id="indTv">Modo TV</button>
        <button class="btn principal" id="indRelatorio">Relatório</button></span>
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
  $('indRelatorio').addEventListener('click', () => mostrar(relatorioPainel(), { barra: true }));
  $('indExcel').addEventListener('click', () => excelPainel().catch(e => alertaTela(e.message)));
  $('indTv').addEventListener('click', () => abrirTv());
}

const alertaTela = msg => { const a = document.querySelector('#telaRhIndPainel .cartao'); if (a) a.insertAdjacentHTML('afterbegin', `<div class="aviso erro">${esc(msg)}</div>`); };

/* ---------------- relatório A4 e Excel do Painel ---------------- */

const txtMeta = (v, meta, meses = 1) => v == null ? '—' : pct(v) + (faixa(meses > 1 ? v / meses : v, meta) ? ' · ' + SELO[faixa(meses > 1 ? v / meses : v, meta)][1] : '');
const descFiltros = f => [f.empregador, f.fazenda, f.sexo === 'M' ? 'homens' : f.sexo === 'F' ? 'mulheres' : '',
  f.contrato, f.setor, f.funcao].filter(Boolean).join(' · ') || 'empresa inteira';
const hojeBr = () => new Date().toLocaleDateString('pt-BR');

function linhasPainel(cols) {
  return [
    ['Absenteísmo total · com afastamento', r => txtMeta(r.absCom, METAS.absTotal), r => r.absCom, 'pct'],
    ['Absenteísmo total · sem afastamento', r => txtMeta(r.absSem, METAS.absTotal), r => r.absSem, 'pct'],
    ['Não justificado · com afastamento', r => txtMeta(r.njCom, METAS.absNj), r => r.njCom, 'pct'],
    ['Não justificado · sem afastamento', r => txtMeta(r.njSem, METAS.absNj), r => r.njSem, 'pct'],
    ['Atrasos e saídas antecipadas (%)', r => pct(r.atrasoPct), r => r.atrasoPct, 'pct'],
    ['Horas ausentes', r => r.mesesAbs ? num(r.horasAus) : '—', r => r.mesesAbs ? r.horasAus : null, 'horas'],
    ['Horas previstas (sem férias)', r => r.mesesAbs ? num(r.horasBase) : '—', r => r.mesesAbs ? r.horasBase : null, 'horas'],
    ['Turnover', (r, c) => txtMeta(r.turnover, METAS.turnover, c.meses.length), r => r.turnover, 'pct'],
    ['Taxa de desligamento', r => pct(r.txDesl), r => r.txDesl, 'pct'],
    ['· voluntário (pedido)', r => pct(r.txVol), r => r.txVol, 'pct'],
    ['· involuntário', r => pct(r.txInvol), r => r.txInvol, 'pct'],
    ['Taxa de admissão', r => pct(r.txAdm), r => r.txAdm, 'pct'],
    ['Admissões', r => String(r.adm), r => r.adm, 'num'],
    ['  readmissões', r => String(r.readm), r => r.readm, 'num'],
    ['Desligamentos', r => String(r.desl), r => r.desl, 'num'],
    ['Transferências · saída', r => String(r.trSai), r => r.trSai, 'num'],
    ['Transferências · entrada', r => String(r.trEnt), r => r.trEnt, 'num'],
    ['Quadro no início', r => String(r.qIni), r => r.qIni, 'num'],
    ['Quadro no fim', r => String(r.qFim), r => r.qFim, 'num'],
    ['Quadro médio', r => num(r.qm, 1), r => r.qm, 'num'],
  ];
}

function colunasCalculadas() {
  const f = est.f, sem = mesesSemFaltas();
  const L = est.linhas.filter(r => passa(r, f));
  return colunas(f).map(c => ({ ...c, r: calcular(L, c.meses, sem) }));
}

function relatorioPainel() {
  const f = est.f, cols = colunasCalculadas();
  const cab = `<tr><th>Indicador</th>${cols.map(c => `<th class="rel-num">${esc(c.rot)}${c.apuracao ? '*' : ''}</th>`).join('')}</tr>`;
  const corpo = linhasPainel(cols).map(([rot, fn]) => `<tr><td>${esc(rot)}</td>${cols.map(c => `<td class="rel-num">${esc(fn(c.r, c))}</td>`).join('')}</tr>`).join('');
  const sem = [...mesesSemFaltas()].filter(m => m >= f.de && m <= f.ate);
  return `
  <article class="rel rel-paisagem ind-doc">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>INDICADORES · ABSENTEÍSMO E TURNOVER</h1><p>${esc(descFiltros(f))}</p></div>
      <div class="rel-comp"><span>período</span><strong>${esc(rotMes(f.de))} a ${esc(rotMes(f.ate))}</strong><span>emitido em ${hojeBr()}</span></div>
    </header>
    <table class="rel-tabela"><thead>${cab}</thead><tbody>${corpo}</tbody></table>
    <p class="rel-nota">Absenteísmo = horas ausentes ÷ (horas previstas − férias); total = falta não justificada + justificada + atestado; "com afastamento" soma afastamentos e licenças.
      Turnover = ((admissões + desligamentos) ÷ 2) ÷ quadro médio; quadro médio = (início + fim) ÷ 2; transferência entre unidades não conta. A faixa da meta do turnover usa a média mensal.
      Administrativo: dia sem lançamento conta como presente. Até 09/2026: histórico importado (P07 + Contagri); a partir de 10/2026: Gestão de jornada.
      ${sem.length ? `Sem dados de faltas em ${sem.length} mês(es) do período (${esc(rotMes(sem[0]))} a ${esc(rotMes(sem[sem.length - 1]))}).` : ''}
      ${cols.some(c => c.apuracao) ? '* mês em apuração.' : ''}</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

async function excelPainel() {
  const f = est.f, cols = colunasCalculadas();
  const linhas = linhasPainel(cols).map(([rot, , val, tipo]) => [rot, ...cols.map(c => {
    const v = val(c.r); return tipo === 'num' || tipo === 'horas' ? v : v;
  })]);
  const tipos = linhasPainel(cols).map(l => l[3]);
  // Uma coluna de Excel só aceita um formato: as linhas vão com o valor cru e a
  // aba ganha uma coluna "Unidade" dizendo se é % , horas ou quantidade.
  const abas = [{
    nome: 'Indicadores', titulo: 'Indicadores · absenteísmo e turnover',
    subtitulo: `${descFiltros(f)} · ${rotMes(f.de)} a ${rotMes(f.ate)} · emitido em ${hojeBr()}`,
    colunas: [{ rot: 'Indicador', larg: 38 }, { rot: 'Unidade', larg: 10 }, ...cols.map(c => ({ rot: c.rot + (c.apuracao ? ' *' : ''), larg: 12, tipo: 'num', casas: 3 }))],
    linhas: linhas.map((l, i) => [l[0], tipos[i] === 'pct' ? '%' : tipos[i] === 'horas' ? 'horas' : 'qtd',
      ...l.slice(1).map(v => v == null ? '' : tipos[i] === 'pct' ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10)]),
    notas: ['Percentuais já multiplicados por 100 (3,1 = 3,1%).', 'Faixas da meta: absenteísmo total até ' + pct(METAS.absTotal.verde) + ' verde / até ' + pct(METAS.absTotal.atencao) + ' atenção; turnover (média mensal) até ' + pct(METAS.turnover.verde) + ' / ' + pct(METAS.turnover.atencao) + '.',
      cols.some(c => c.apuracao) ? '* mês em apuração.' : ''].filter(Boolean),
  }];
  await baixarXlsx(`indicadores-rh-${f.de}-a-${f.ate}`, abas);
}

/* ---------------- últimos 3 meses FECHADOS (Certificação e TV) ---------------- */

function tresFechados() {
  const atual = hojeMes(); const [a, m] = atual.split('-').map(Number);
  const out = [];
  for (let i = 3; i >= 1; i--) { const d = new Date(a, m - 1 - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return out;
}
const fazendaDe = r => r.fazenda || 'Sem fazenda';

/** Por fazenda + total, nos meses dados. Grupo com menos de 3 pessoas no
 *  recorte por sexo fica oculto (n ≥ 3, achado C-01). */
function porFazenda(meses) {
  const sem = mesesSemFaltas();
  const faz = [...new Set(est.linhas.filter(r => meses.includes(r.m)).map(fazendaDe))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
  const grupo = filtro => {
    const L = est.linhas.filter(filtro);
    const r = calcular(L, meses, sem);
    const n = Math.max(r.qIni, r.qFim);
    return { ...r, n };
  };
  return {
    meses,
    linhas: faz.map(z => ({ fazenda: z, tot: grupo(r => fazendaDe(r) === z),
      M: grupo(r => fazendaDe(r) === z && r.sexo === 'M'), F: grupo(r => fazendaDe(r) === z && r.sexo === 'F') })),
    total: { fazenda: 'Total', tot: grupo(() => true), M: grupo(r => r.sexo === 'M'), F: grupo(r => r.sexo === 'F') },
  };
}
const oculto = g => g.n < 3;

/* ---------------- Certificação ---------------- */

function desenharCert() {
  const tela = $('telaRhIndCert'); if (!tela) return;
  const meses = tresFechados(), d = porFazenda(meses);
  const lin = (x, tot = false) => `<tr${tot ? ' class="ind-forte"' : ''}><th scope="row">${esc(x.fazenda)}</th><td>${num(x.tot.qm, 1)}</td>
    <td>${comMeta(x.tot.absCom, METAS.absTotal)}</td><td>${comMeta(x.tot.absSem, METAS.absTotal)}</td><td>${comMeta(x.tot.njCom, METAS.absNj)}</td>
    <td>${comMeta(x.tot.turnover, METAS.turnover, 3)}</td><td>${x.tot.adm}</td><td>${x.tot.desl}</td></tr>`;
  const sx = (g) => oculto(g) ? '<span class="ind-oculto">grupo pequeno — oculto</span>' : `${comMeta(g.absCom, METAS.absTotal)} · ${comMeta(g.turnover, METAS.turnover, 3)}`;
  const linSx = (x, tot = false) => `<tr${tot ? ' class="ind-forte"' : ''}><th scope="row">${esc(x.fazenda)}</th><td>${sx(x.M)}</td><td>${sx(x.F)}</td></tr>`;
  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Indicadores · Certificação</h2>
      <p class="dica" style="margin:2px 0 0">Sempre os 3 últimos meses fechados: <b>${meses.map(rotMes).join(', ')}</b>. Sem nomes de pessoas.</p></div>
      <span class="acoes"><button class="btn" id="certExcel">Excel</button><button class="btn principal" id="certRel">Relatório</button></span></div>
    <h3 class="ind-h3">Por fazenda</h3>
    <div class="ind-rolagem"><table class="ind-tab"><thead><tr><th>Fazenda</th><th>Quadro médio</th><th>Absent. total (com afast.)</th><th>Absent. total (sem afast.)</th>
      <th>Não justificado</th><th>Turnover</th><th>Admissões</th><th>Deslig.</th></tr></thead>
      <tbody>${d.linhas.map(x => lin(x)).join('')}${lin(d.total, true)}</tbody></table></div>
    <h3 class="ind-h3">Por sexo · absenteísmo total (com afast.) · turnover</h3>
    <div class="ind-rolagem"><table class="ind-tab"><thead><tr><th>Fazenda</th><th>Homens</th><th>Mulheres</th></tr></thead>
      <tbody>${d.linhas.map(x => linSx(x)).join('')}${linSx(d.total, true)}</tbody></table></div>
    <p class="dica">Recorte com menos de 3 pessoas fica oculto para não identificar ninguém. A faixa do turnover usa a média mensal dos 3 meses.</p>
  </div>`;
  $('certRel').addEventListener('click', () => mostrar(relatorioCert(d), { barra: true }));
  $('certExcel').addEventListener('click', () => excelCert(d).catch(e => alert(e.message)));
}

function relatorioCert(d) {
  const t = (v, m, k = 1) => esc(txtMeta(v, m, k));
  const sx = g => oculto(g) ? 'grupo pequeno — oculto' : `${t(g.absCom, METAS.absTotal)} | ${t(g.turnover, METAS.turnover, 3)}`;
  const l = x => `<tr><td>${esc(x.fazenda)}</td><td class="rel-num">${num(x.tot.qm, 1)}</td><td class="rel-num">${t(x.tot.absCom, METAS.absTotal)}</td><td class="rel-num">${t(x.tot.absSem, METAS.absTotal)}</td>
    <td class="rel-num">${t(x.tot.njCom, METAS.absNj)}</td><td class="rel-num">${t(x.tot.turnover, METAS.turnover, 3)}</td><td class="rel-num">${x.tot.adm}</td><td class="rel-num">${x.tot.desl}</td></tr>`;
  const tot = d.total;
  return `<article class="rel rel-paisagem ind-doc">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>INDICADORES DE RH · CERTIFICAÇÃO</h1><p>Absenteísmo e turnover dos 3 últimos meses fechados</p></div>
      <div class="rel-comp"><span>período</span><strong>${d.meses.map(rotMes).join(' · ')}</strong><span>emitido em ${hojeBr()}</span></div></header>
    <h2 class="rel-secao">Por fazenda</h2>
    <table class="rel-tabela"><thead><tr><th>Fazenda</th><th class="rel-num">Quadro médio</th><th class="rel-num">Absent. total (com afast.)</th><th class="rel-num">Absent. total (sem afast.)</th>
      <th class="rel-num">Não justificado</th><th class="rel-num">Turnover</th><th class="rel-num">Admissões</th><th class="rel-num">Deslig.</th></tr></thead>
      <tbody>${d.linhas.map(l).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="rel-num">${num(tot.tot.qm, 1)}</td><td class="rel-num">${t(tot.tot.absCom, METAS.absTotal)}</td><td class="rel-num">${t(tot.tot.absSem, METAS.absTotal)}</td>
      <td class="rel-num">${t(tot.tot.njCom, METAS.absNj)}</td><td class="rel-num">${t(tot.tot.turnover, METAS.turnover, 3)}</td><td class="rel-num">${tot.tot.adm}</td><td class="rel-num">${tot.tot.desl}</td></tr></tfoot></table>
    <h2 class="rel-secao">Por sexo · absenteísmo total (com afast.) | turnover</h2>
    <table class="rel-tabela"><thead><tr><th>Fazenda</th><th>Homens</th><th>Mulheres</th></tr></thead>
      <tbody>${d.linhas.map(x => `<tr><td>${esc(x.fazenda)}</td><td>${sx(x.M)}</td><td>${sx(x.F)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${sx(tot.M)}</td><td>${sx(tot.F)}</td></tr></tfoot></table>
    <p class="rel-nota">Recorte com menos de 3 pessoas fica oculto. Faixas da meta: absenteísmo total verde até ${pct(METAS.absTotal.verde)}, atenção até ${pct(METAS.absTotal.atencao)};
      não justificado ${pct(METAS.absNj.verde)} / ${pct(METAS.absNj.atencao)}; turnover (média mensal) ${pct(METAS.turnover.verde)} / ${pct(METAS.turnover.atencao)}.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

async function excelCert(d) {
  const p = v => v == null ? '' : v;
  const sx = g => oculto(g) ? ['oculto', 'oculto'] : [p(g.absCom), p(g.turnover)];
  const linha = x => [x.fazenda, x.tot.qm, p(x.tot.absCom), p(x.tot.absSem), p(x.tot.njCom), p(x.tot.turnover), x.tot.adm, x.tot.desl, ...sx(x.M), ...sx(x.F)];
  await baixarXlsx(`certificacao-indicadores-${d.meses[0]}-a-${d.meses[2]}`, [{
    nome: 'Certificação', titulo: 'Indicadores de RH · Certificação', subtitulo: `3 últimos meses fechados: ${d.meses.map(rotMes).join(', ')} · emitido em ${hojeBr()}`,
    colunas: [{ rot: 'Fazenda', larg: 28 }, { rot: 'Quadro médio', tipo: 'num', casas: 1 }, { rot: 'Absent. total (com afast.)', tipo: 'pct' }, { rot: 'Absent. total (sem afast.)', tipo: 'pct' },
      { rot: 'Não justificado', tipo: 'pct' }, { rot: 'Turnover (3 meses)', tipo: 'pct' }, { rot: 'Admissões', tipo: 'num' }, { rot: 'Deslig.', tipo: 'num' },
      { rot: 'Homens · absent.', tipo: 'pct' }, { rot: 'Homens · turnover', tipo: 'pct' }, { rot: 'Mulheres · absent.', tipo: 'pct' }, { rot: 'Mulheres · turnover', tipo: 'pct' }],
    linhas: d.linhas.map(linha), total: linha(d.total),
    notas: ['Recorte com menos de 3 pessoas fica oculto para não identificar ninguém.'],
  }]);
}

/* ---------------- Por pessoa (D-30: permissão própria) ---------------- */

const estP = { linhas: [], erro: '', todos: false };

async function desenharPessoa(recarregar = false) {
  const tela = $('telaRhIndPessoa'); if (!tela) return;
  const f = est.f;
  if (recarregar || !estP.carregado) {
    tela.innerHTML = '<div class="cartao"><p class="dica">Carregando…</p></div>';
    const { data, error } = await estado.cliente.rpc('rh_ind_pessoa', { p_ini: f.de + '-01', p_fim: f.ate + '-01' });
    estP.erro = error ? (/permiss/i.test(error.message) ? 'Seu acesso não inclui os indicadores por pessoa. Peça ao administrador para liberar a tela "Por pessoa".' : error.message) : '';
    estP.linhas = data || []; estP.carregado = !error; estP.periodo = f.de + f.ate;
  }
  if (estP.erro) { tela.innerHTML = `<div class="cartao"><div class="aviso erro">${esc(estP.erro)}</div></div>`; return; }
  const L = estP.linhas.filter(r => passa(r, f))
    .map(r => { const aus = +r.h_falta_nj + +r.h_falta_j + +r.h_atestado + +r.h_afast; const base = +r.h_prev - +r.h_ferias;
      return { ...r, aus, pct: base > 0 ? aus / base : null }; })
    .filter(r => estP.todos || r.aus > 0 || +r.h_atraso > 0)
    .sort((a, b) => b.aus - a.aus || a.nome.localeCompare(b.nome, 'pt-BR'));
  const h = v => num(+v, 1);
  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Indicadores · Por pessoa</h2>
      <p class="dica" style="margin:2px 0 0">Ausências de ${esc(rotMes(f.de))} a ${esc(rotMes(f.ate))}. Atestado é dado de saúde: tela restrita.</p></div>
      <span class="acoes"><button class="btn" id="pesExcel">Excel</button></span></div>
    <div class="grade ind-filtros" style="margin-top:12px">
      <label class="campo">De <input type="month" id="indDe" value="${f.de}" min="2022-01" max="${hojeMes()}"></label>
      <label class="campo">Até <input type="month" id="indAte" value="${f.ate}" min="2022-01" max="${hojeMes()}"></label>
      <label class="campo">Empregador <select id="indEmp">${opc(uniq('empregador'), f.empregador)}</select></label>
      <label class="campo">Fazenda <select id="indFaz">${opc(uniq('fazenda'), f.fazenda, 'Todas')}</select></label>
      <label class="campo fu-inline"><input type="checkbox" id="pesTodos" ${estP.todos ? 'checked' : ''}> Mostrar quem não faltou</label>
    </div>
    <div class="ind-rolagem"><table class="ind-tab"><thead><tr><th>Pessoa</th><th>Fazenda</th><th>Função</th><th>Falta não just. (h)</th><th>Falta just. (h)</th>
      <th>Atestado (h)</th><th>Afastamento (h)</th><th>Atrasos (h)</th><th>Total (h)</th><th>% das horas</th></tr></thead>
      <tbody>${L.map(r => `<tr><th scope="row">${esc(r.nome)}${r.desligamento ? ' <small>(saiu ' + esc(r.desligamento.split('-').reverse().join('/')) + ')</small>' : ''}</th>
        <td style="text-align:left">${esc(r.fazenda || '—')}</td><td style="text-align:left">${esc(r.funcao || '—')}</td>
        <td>${h(r.h_falta_nj)}</td><td>${h(r.h_falta_j)}</td><td>${h(r.h_atestado)}</td><td>${h(r.h_afast)}</td><td>${h(r.h_atraso)}</td>
        <td><b>${h(r.aus)}</b></td><td>${comMeta(r.pct, METAS.absTotal)}</td></tr>`).join('') || '<tr><td colspan="10" style="text-align:center">Ninguém com ausência no período.</td></tr>'}</tbody></table></div>
    <p class="dica">% das horas = ausências (com afastamento) ÷ horas previstas da pessoa no período, sem férias${est.lacunas.size ? ' e sem os meses sem dados de faltas' : ''}.</p>
  </div>`;
  ['indDe', 'indAte'].forEach(id => $(id).addEventListener('change', () => { lerFiltrosPessoa(); desenharPessoa(true); }));
  ['indEmp', 'indFaz'].forEach(id => $(id).addEventListener('change', () => { lerFiltrosPessoa(); desenharPessoa(); }));
  $('pesTodos').addEventListener('change', e => { estP.todos = e.target.checked; desenharPessoa(); });
  $('pesExcel').addEventListener('click', () => baixarXlsx(`ausencias-por-pessoa-${f.de}-a-${f.ate}`, [{
    nome: 'Por pessoa', titulo: 'Ausências por pessoa', subtitulo: `${rotMes(f.de)} a ${rotMes(f.ate)} · ${descFiltros(f)} · emitido em ${hojeBr()} · uso restrito (dado de saúde)`,
    colunas: [{ rot: 'Pessoa', larg: 34 }, { rot: 'Fazenda', larg: 22 }, { rot: 'Função', larg: 22 }, { rot: 'Falta não just. (h)', tipo: 'horas' }, { rot: 'Falta just. (h)', tipo: 'horas' },
      { rot: 'Atestado (h)', tipo: 'horas' }, { rot: 'Afastamento (h)', tipo: 'horas' }, { rot: 'Atrasos (h)', tipo: 'horas' }, { rot: 'Total (h)', tipo: 'horas' }, { rot: '% das horas', tipo: 'pct' }],
    linhas: L.map(r => [r.nome, r.fazenda || '', r.funcao || '', +r.h_falta_nj, +r.h_falta_j, +r.h_atestado, +r.h_afast, +r.h_atraso, r.aus, r.pct ?? '']),
    total: ['Total', '', '', ...['h_falta_nj', 'h_falta_j', 'h_atestado', 'h_afast', 'h_atraso'].map(k => L.reduce((a, r) => a + +r[k], 0)), L.reduce((a, r) => a + r.aus, 0), ''],
  }]).catch(e => alert(e.message)));
}
function lerFiltrosPessoa() {
  const g = id => $(id)?.value || '';
  let de = g('indDe') || est.f.de, ate = g('indAte') || est.f.ate;
  if (de > ate) [de, ate] = [ate, de];
  est.f = { ...est.f, de, ate, empregador: g('indEmp'), fazenda: g('indFaz') };
}

/* ---------------- Metas (D-35) ---------------- */

const NOMES_META = { absTotal: 'Absenteísmo total', absNj: 'Absenteísmo não justificado', turnover: 'Turnover (média mensal)' };

function desenharMetas() {
  const tela = $('telaRhIndMetas'); if (!tela) return;
  const adm = acesso.admin;
  const n = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  tela.innerHTML = `<div class="cartao"><h2>Indicadores · Metas</h2>
    <p class="dica">Faixas de cor de cada indicador, em % da média mensal. ${adm ? 'Só o administrador altera.' : 'Somente leitura — só o administrador altera.'}</p>
    <div class="ind-rolagem"><table class="ind-tab"><thead><tr><th>Indicador</th><th>Verde até (%)</th><th>Atenção até (%)</th><th>Acima disso</th></tr></thead><tbody>
    ${Object.keys(NOMES_META).map(k => `<tr><th scope="row">${NOMES_META[k]}</th>
      <td>${adm ? `<input class="ind-meta" type="number" step="0.1" min="0" data-k="${k}" data-c="verde" value="${n(METAS[k].verde).replace(',', '.')}">` : n(METAS[k].verde)}</td>
      <td>${adm ? `<input class="ind-meta" type="number" step="0.1" min="0" data-k="${k}" data-c="atencao" value="${n(METAS[k].atencao).replace(',', '.')}">` : n(METAS[k].atencao)}</td>
      <td><span class="tag perigo">crítico</span></td></tr>`).join('')}
    </tbody></table></div>
    <div class="aviso erro" id="metaErro" hidden></div>
    ${adm ? '<div class="barra entre"><span></span><button class="btn principal" id="metaSalvar">Salvar metas</button></div>' : ''}
  </div>`;
  $('metaSalvar')?.addEventListener('click', async () => {
    const novos = {};
    tela.querySelectorAll('.ind-meta').forEach(i => { (novos[i.dataset.k] ||= {})[i.dataset.c] = parseFloat(String(i.value).replace(',', '.')) / 100; });
    const ruim = Object.entries(novos).find(([, v]) => !(v.verde > 0) || !(v.atencao > v.verde));
    if (ruim) { $('metaErro').textContent = `${NOMES_META[ruim[0]]}: o limite de atenção precisa ser maior que o do verde.`; $('metaErro').hidden = false; return; }
    const linhas = Object.entries(novos).map(([indicador, v]) => ({ indicador, verde: v.verde, atencao: v.atencao, atualizado_em: new Date().toISOString() }));
    const { error } = await estado.cliente.from('rh_ind_metas').upsert(linhas, { onConflict: 'indicador' });
    if (error) { $('metaErro').textContent = 'Não consegui salvar: ' + error.message; $('metaErro').hidden = false; return; }
    Object.assign(METAS, Object.fromEntries(Object.entries(novos).map(([k, v]) => [k, { verde: v.verde, atencao: v.atencao }])));
    desenharMetas();
    tela.querySelector('.cartao').insertAdjacentHTML('beforeend', '<div class="aviso ok">Metas salvas.</div>');
  });
}

/* ---------------- Modo TV (D-36, D-14) ---------------- */

const tv = { el: null, slide: 0, giro: null, recarga: null };

function abrirTv() {
  fecharTv();
  const el = document.createElement('div');
  el.className = 'ind-tv'; el.id = 'indTvTela';
  el.innerHTML = `<div class="ind-tv-confirma"><h2>Levar os indicadores para a tela?</h2>
    <p>Só números agregados por fazenda (sem nomes). Quem estiver perto vai ver.</p>
    <div><button class="btn" id="tvNao">Cancelar</button> <button class="btn principal" id="tvSim">Mostrar na tela</button></div></div>`;
  document.body.appendChild(el); tv.el = el;
  el.querySelector('#tvNao').addEventListener('click', fecharTv);
  el.querySelector('#tvSim').addEventListener('click', () => {
    el.requestFullscreen?.().catch(() => {});
    tv.slide = 0; pintarTv();
    tv.giro = setInterval(() => { tv.slide++; pintarTv(); }, 15000);
    tv.recarga = setInterval(async () => { try { await carregar(); pintarTv(); } catch { /* fica o último dado, com o horário dele */ } }, 600000);
  });
  addEventListener('keydown', teclaTv);
}
const teclaTv = e => { if (e.key === 'Escape') fecharTv(); };
function fecharTv() {
  clearInterval(tv.giro); clearInterval(tv.recarga);
  removeEventListener('keydown', teclaTv);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  tv.el?.remove(); tv.el = null;
}
function pintarTv() {
  if (!tv.el) return;
  const meses = tresFechados(), d = porFazenda(meses);
  const slides = [d.total, ...d.linhas];
  const x = slides[tv.slide % slides.length];
  const hora = est.carregadoEm ? est.carregadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const bloco = (rot, v, meta, k) => { const fx = faixa(v == null ? null : v / k, meta);
    return `<div class="ind-tv-num ind-tv-${fx || 'sem'}"><span>${rot}</span><strong>${pct(v)}</strong><em>${fx ? SELO[fx][1] : 'sem dados'}</em></div>`; };
  tv.el.innerHTML = `<div class="ind-tv-topo"><img src="img/sakuma-logo.png" alt="SAKUMA"><div><h1>${esc(x.fazenda === 'Total' ? 'SAKUMA · todas as fazendas' : x.fazenda)}</h1>
      <p>${meses.map(rotMes).join(' · ')} · dados das ${hora}</p></div><button class="btn" id="tvSair">Sair (Esc)</button></div>
    <div class="ind-tv-corpo">
      ${bloco('Absenteísmo', x.tot.absCom, METAS.absTotal, 1)}
      ${bloco('Turnover · média mensal', x.tot.turnover == null ? null : x.tot.turnover / 3, METAS.turnover, 1)}
    </div>
    <div class="ind-tv-pe">Quadro médio ${num(x.tot.qm, 1)} · ${x.tot.adm} admissão(ões) · ${x.tot.desl} desligamento(s) · ${tv.slide % slides.length + 1} de ${slides.length}</div>`;
  tv.el.querySelector('#tvSair').addEventListener('click', fecharTv);
}

const DESENHO = { rhIndPainel: desenhar, rhIndCert: desenharCert, rhIndMetas: desenharMetas, rhIndPessoa: () => desenharPessoa() };
const TELA_ID = { rhIndPainel: 'telaRhIndPainel', rhIndPessoa: 'telaRhIndPessoa', rhIndCert: 'telaRhIndCert', rhIndMetas: 'telaRhIndMetas' };

export async function abrirIndicadores(tela = 'rhIndPainel', forcar = false) {
  est.tela = tela;
  // As telas repetem os ids dos filtros (indDe, indFaz…): esvazia as outras
  // para o $() achar sempre os da tela aberta.
  for (const [t, id] of Object.entries(TELA_ID)) if (t !== tela && $(id)) $(id).innerHTML = '';
  if (!est.f) est.f = filtrosPadrao();
  if (!est.carregado || forcar) {
    est.erro = ''; est.carregado = false;
    const alvo = $(TELA_ID[tela]); if (alvo) alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando os indicadores…</p></div>';
    try { await carregar(); }
    catch (e) { est.erro = 'Não consegui carregar os indicadores: ' + (e.message || e); }
  }
  if (est.erro) { const alvo = $(TELA_ID[tela]); if (alvo) alvo.innerHTML = `<div class="cartao"><div class="aviso erro">${esc(est.erro)}</div></div>`; return; }
  if (tela === 'rhIndPessoa' && estP.periodo !== est.f.de + est.f.ate) estP.carregado = false;
  await DESENHO[tela]?.();
}

export const TELAS_INDICADORES = Object.keys(TELA_ID);

export function limparIndicadores() { est.linhas = []; est.carregado = false; est.f = null; estP.linhas = []; estP.carregado = false; fecharTv(); }

/* Para testes e para as próximas telas (Certificação, TV, relatório). */
export const _ind = { calcular, mesesEntre, mesesSemFaltas, est };
