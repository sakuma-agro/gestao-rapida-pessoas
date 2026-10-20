// horahomem.js — Custo Base › Hora-homem (20/10/2026).
//
// Substitui a planilha "Controle Mensal - Hora Homem - Campo". Por pessoa e
// por mês:
//   R$/h = (salário bruto × encargo + valor pago em recibo) ÷ horas trabalhadas
// encargo = 1,3917 (Fixo) ou 1,5705 (Temporário), na tela Índices.
// Horas trabalhadas vêm do Pessoas (DP › Gestão de jornada): a função
// cb_horas_mes(mês) soma as horas apuradas dos boletins da competência, sem
// os cancelados. Dá para corrigir à mão (horas_manual). Sem horas, vale a
// hora padrão do mês (como a planilha fazia com a aba Indices).
// Salário bruto e recibo vêm do holerite e são digitados; o salário chega
// pré-preenchido com o salário vigente do RH para quem pode ver salários.
import { $, esc, pronto, carregando, todos, gravar, aviso, souAdmin, meuNome, lerNumero, num, reais,
  mesAtual, mesAnterior, mesSeguinte, nomeMes, mesCurto, dataHora, semAcento, seloFechado, CADEADO } from './dados.js';
import { baixarXlsx } from '../../js/excel.js';
import { enviarWhatsapp, rodapeLop, botaoZap } from './pdf.js';

let ouvindo = false;
let mesSel = null;
let busca = '';
let lendoPessoas = false;
// mês aberto puxa o Pessoas sozinho, uma vez por sessão (20/10/2026: o ADM não
// tinha aparecido porque o mês foi criado antes e ninguém clicou em "Puxar").
const sincronizados = new Set();

/* ---------------- dados ---------------- */
const PADRAO = { encargo_fixo: 1.3917, encargo_temporario: 1.5705,
  horas_padrao: { '01': 192, '02': 200, '03': 208, '04': 192, '05': 208, '06': 208, '07': 200, '08': 216, '09': 200, '10': 192, '11': 192, '12': 208 } };
export const parametros = () => ({ ...PADRAO, ...(todos('cb_hh_parametros').find(p => p.id === 'geral') || {}) });
const meses = () => todos('cb_hh_meses').slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
const mes = id => todos('cb_hh_meses').find(m => m.id === id) || null;
const itensDoMes = id => todos('cb_hh_itens').filter(i => i.mes === id);
const temValor = v => v !== null && v !== undefined && v !== '';

/** Horas que valem: a correção digitada, senão a do Pessoas, senão a padrão do mês. */
export function horasDe(i, p = parametros()) {
  if (temValor(i.horas_manual)) return { h: Number(i.horas_manual), origem: i.obs === 'da planilha' ? 'planilha' : 'manual' };
  if (temValor(i.horas_pessoas) && Number(i.horas_pessoas) > 0) return { h: Number(i.horas_pessoas), origem: 'pessoas' };
  const pad = Number((p.horas_padrao || {})[String(i.mes).slice(5, 7)] || 0);
  return { h: pad, origem: 'padrao' };
}
export function calcularLinha(i, p = parametros()) {
  const enc = i.relacao === 'Temporário' ? Number(p.encargo_temporario) : Number(p.encargo_fixo);
  const sal = Number(i.salario_bruto || 0), rec = Number(i.recibo || 0);
  const { h, origem } = horasDe(i, p);
  const custo = sal * enc + rec;
  const temPag = sal > 0 || rec > 0;
  return { ...i, encargo: enc, horas: h, origemHoras: origem, total: sal + rec, custo,
    rh: temPag && h > 0 ? custo / h : null };
}
/* Cadeado (20/10/2026): mês fechado usa o encargo e a hora padrão gravados
   no fechamento; mês aberto usa os Parâmetros de agora. */
export function parametrosDoMes(id) {
  const m = mes(id);
  if (m && m.status === 'fechado' && temValor(m.encargo_fixo))
    return { encargo_fixo: Number(m.encargo_fixo), encargo_temporario: Number(m.encargo_temporario),
      horas_padrao: { [String(id).slice(5, 7)]: Number(m.horas_padrao || 0) } };
  return parametros();
}
export function calcularMesHH(id) {
  const p = parametrosDoMes(id);
  const linhas = itensDoMes(id).map(i => calcularLinha(i, p))
    .sort((a, b) => ordemSetor(a.setor) - ordemSetor(b.setor) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const dentro = linhas.filter(l => l.incluido !== false);
  const comValor = dentro.filter(l => l.rh !== null);
  const horas = comValor.reduce((s, l) => s + l.horas, 0);
  const custo = comValor.reduce((s, l) => s + l.custo, 0);
  /* Custo hora Campo e custo hora ADM (pedido dele, 20/10/2026). */
  const grupo = nome => {
    const d = dentro.filter(l => (l.setor || 'Campo') === nome), cv = d.filter(l => l.rh !== null);
    const h = cv.reduce((x, l) => x + l.horas, 0), cu = cv.reduce((x, l) => x + l.custo, 0);
    return { pessoas: d.length, semValor: d.length - cv.length, horasTodas: d.filter(l => l.origemHoras !== 'padrao').reduce((x, l) => x + l.horas, 0),
      horas: h, custo: cu, folha: cv.reduce((x, l) => x + l.total, 0), media: h > 0 ? cu / h : null };
  };
  return { linhas, campo: grupo('Campo'), adm: grupo('ADM'), pessoas: dentro.length, comValor: comValor.length,
    semValor: dentro.filter(l => l.rh === null).length,
    horasTodas: dentro.filter(l => l.origemHoras !== 'padrao').reduce((s, l) => s + l.horas, 0),   // só horas lançadas, sem a padrão
    horas, custo, folha: comValor.reduce((s, l) => s + l.total, 0), media: horas > 0 ? custo / horas : null };
}
const chaveItem = (mesId, func) => mesId + ':' + func;
export const SETORES = ['Campo', 'ADM'];
const ordemSetor = st => (st === 'ADM' ? 1 : 0);
/** Setor do cadastro do Pessoas → 'Campo' ou 'ADM'. */
const setorDe = st => /^ADM/i.test(String(st || '')) ? 'ADM' : 'Campo';
let filtroSetor = '';
const relacaoDe = tc => /temp/i.test(String(tc || '')) ? 'Temporário' : 'Fixo';

/** Lê as horas do Pessoas para o mês (precisa de internet). */
async function horasDoPessoas(mesId) {
  if (!window.App || !App.online || !App.sb) throw new Error('Sem internet: as horas do Pessoas só vêm com conexão.');
  const r = await App.sb.rpc('cb_horas_mes', { p_mes: mesId });
  if (r.error) throw r.error;
  return r.data || [];
}

/* ---------------- tela do mês ---------------- */
export function irParaMesHH(m) { mesSel = m; desenhar(); }

function desenhar() {
  const alvo = $('hhMesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; $('hhFolha').innerHTML = ''; return; }
  if (!mesSel) { const l = meses(); mesSel = l.length ? l[l.length - 1].id : mesAtual(); }
  const m = mes(mesSel);
  const fechado = m && m.status === 'fechado';
  const p = parametrosDoMes(mesSel);
  if (m && !fechado && !lendoPessoas && window.App && App.online && App.sb && !sincronizados.has(mesSel)) {
    sincronizados.add(mesSel);
    setTimeout(() => atualizarDoPessoas(mesSel, true), 0);
  }

  const topo = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn mini" type="button" id="hhAnt" title="mês anterior">◀</button>
        <label class="campo">Competência <input type="month" id="hhMesInput" value="${esc(mesSel)}"></label>
        <button class="btn mini" type="button" id="hhSeg" title="mês seguinte">▶</button>
      </div>
      <div class="cb-mes-estado">${m ? (fechado
        ? seloFechado(m.fechado_por, m.fechado_em)
        : '<span class="tag alerta">aberto</span>') : '<span class="tag neutra">mês ainda não criado</span>'}</div>
    </div>`;

  if (!m) {
    const ant = meses().filter(x => x.id < mesSel).pop();
    alvo.innerHTML = topo + `<div class="cb-vazio-mes">
      <p><b>${esc(nomeMes(mesSel))}</b> ainda não tem hora-homem.</p>
      <p class="dc-sem">Criar o mês traz do Pessoas o cadastro de <b>ativos do Campo e do Administrativo</b> (e quem tem boletim na competência), com as horas trabalhadas. Depois é só digitar salário bruto e recibo do holerite.</p>
      <div class="barra"><button class="btn principal" type="button" id="hhCriar">Criar ${esc(mesCurto(mesSel))} com o cadastro de ativos</button></div>
    </div>`;
    $('hhFolha').innerHTML = '';
    ligarNav();
    $('hhCriar').addEventListener('click', () => criarMes(mesSel, ant && ant.id));
    return;
  }

  const c = calcularMesHH(mesSel);
  const b = semAcento(busca);
  const linhas = c.linhas.filter(l => (!b || semAcento(l.nome + ' ' + (l.cadastro || '')).includes(b)) && (!filtroSetor || (l.setor || 'Campo') === filtroSetor));
  const linhaPessoa = l => `<tr class="${l.incluido === false ? 'cb-fora' : ''}">
        <td class="ce"><input type="checkbox" data-inc="${esc(l.id)}"${l.incluido !== false ? ' checked' : ''}${fechado ? ' disabled' : ''}></td>
        <td>${esc(l.cadastro || '')}</td>
        <td><b>${esc(l.nome)}</b>${l.obs && l.obs !== 'da planilha' ? `<small class="dc-sem"> · ${esc(l.obs)}</small>` : ''}</td>
        <td>${fechado ? esc(l.relacao) : `<select class="dc-mini" data-rel="${esc(l.id)}">${['Fixo', 'Temporário'].map(r => `<option${r === l.relacao ? ' selected' : ''}>${r}</option>`).join('')}</select>`}</td>
        <td class="dir">${fechado ? esc(num(l.horas, 1)) : `<input class="dc-mini hh-num" data-h="${esc(l.id)}" inputmode="decimal" value="${esc(temValor(l.horas_manual) ? num(l.horas_manual, 1) : '')}" placeholder="${esc(num(l.horas, 1))}">`}
          <small class="hh-orig hh-o-${l.origemHoras}">${l.origemHoras === 'pessoas' ? 'Pessoas' : l.origemHoras === 'planilha' ? 'planilha' : l.origemHoras === 'manual' ? 'corrigido' + (temValor(l.horas_pessoas) ? ' (Pessoas ' + num(l.horas_pessoas, 1) + ')' : '') : 'padrão do mês'}</small></td>
        <td class="dir">${fechado ? esc(num(l.salario_bruto)) : `<input class="dc-mini hh-num" data-sal="${esc(l.id)}" inputmode="decimal" value="${esc(temValor(l.salario_bruto) ? num(l.salario_bruto) : '')}">`}</td>
        <td class="dir">${fechado ? esc(num(l.recibo)) : `<input class="dc-mini hh-num" data-rec="${esc(l.id)}" inputmode="decimal" value="${esc(temValor(l.recibo) ? num(l.recibo) : '')}">`}</td>
        <td class="dir">${esc(num(l.total))}</td>
        <td class="dir">${esc(num(l.encargo, 4))}</td>
        <td class="dir"><b>${l.rh !== null ? esc(num(l.rh)) : '—'}</b></td>
        <td class="ce"><input type="checkbox" data-agro="${esc(l.id)}"${l.lancado_agro ? ' checked' : ''}></td>
      </tr>`;
  alvo.innerHTML = topo + `
    <div class="cb-kpis">
      <div><span>Pessoas</span><b>${c.pessoas}</b><small>Campo ${c.campo.pessoas} · ADM ${c.adm.pessoas}${c.semValor ? ' · ' + c.semValor + ' sem salário/recibo' : ''}</small></div>
      <div><span>Custo c/ encargos</span><b>${esc(reais(c.custo))}</b><small>folha ${esc(reais(c.folha))} · ${esc(num(c.horasTodas, 1))} h lançadas</small></div>
      <div class="cb-kpi-custo"><span>Custo hora Campo</span><b class="hh-media">${c.campo.media !== null ? esc(reais(c.campo.media)) : '—'}</b><small>${esc(reais(c.campo.custo))} ÷ ${esc(num(c.campo.horas, 1))} h</small></div>
      <div class="cb-kpi-custo"><span>Custo hora ADM</span><b class="hh-media">${c.adm.media !== null ? esc(reais(c.adm.media)) : '—'}</b><small>${c.adm.pessoas ? esc(reais(c.adm.custo)) + ' ÷ ' + esc(num(c.adm.horas, 1)) + ' h' : 'ninguém do ADM no mês'}</small></div>
    </div>
    <div class="barra entre naoimprimir">
      <div class="barra" style="margin:0">
        <label class="campo" style="min-width:200px">Procurar <input type="text" id="hhBusca" value="${esc(busca)}" placeholder="nome ou nº"></label>
        <label class="campo">Setor <select id="hhSetor"><option value="">Campo e ADM</option>${SETORES.map(x => `<option${x === filtroSetor ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        ${fechado ? '' : `<button class="btn" type="button" id="hhAtualizar">${lendoPessoas ? 'Lendo o Pessoas…' : '↻ Puxar do Pessoas (ativos e horas)'}</button>
        <button class="btn" type="button" id="hhAdd">+ Pessoa</button>`}
      </div>
      <div class="barra" style="margin:0">
        ${botaoZap('hhZap')}
        <button class="btn" type="button" id="hhImprimir">Imprimir</button>
        <button class="btn" type="button" id="hhExcel">Exportar Excel</button>
        ${fechado ? (souAdmin() ? '<button class="btn" type="button" id="hhReabrir">Reabrir mês</button>' : '')
                  : '<button class="btn principal" type="button" id="hhFechar">Fechar mês</button>'}
      </div>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab hh-tab">
      <thead><tr>
        <th class="ce" title="entra na conta">✓</th><th>Nº</th><th>Nome</th><th>Relação</th>
        <th class="dir">Horas</th><th class="dir">Salário bruto</th><th class="dir">Recibo (R$)</th>
        <th class="dir">Total</th><th class="dir">Encargo</th><th class="dir">R$/h</th><th class="ce" title="já lançado no sistema agro">Agro</th>
      </tr></thead>
      <tbody>${SETORES.map(st => {
        const ls = linhas.filter(l => (l.setor || 'Campo') === st);
        if (!ls.length) return '';
        const g = st === 'ADM' ? c.adm : c.campo;
        return `<tr class="hh-grupo"><td colspan="11">${st === 'ADM' ? 'Administrativo (ADM)' : 'Campo'} · ${g.pessoas} ${g.pessoas === 1 ? 'pessoa' : 'pessoas'}</td></tr>`
          + ls.map(linhaPessoa).join('')
          + `<tr class="dc-total hh-sub"><td></td><td></td><td>Custo hora ${st}</td><td></td><td class="dir">${esc(num(g.horasTodas, 1))}</td><td></td><td></td><td class="dir">${esc(num(g.folha))}</td><td></td><td class="dir">${g.media !== null ? esc(num(g.media)) : '—'}</td><td></td></tr>`;
      }).join('') || '<tr><td colspan="11" class="vazio">Ninguém neste mês.</td></tr>'}
      </tbody>
      <tfoot><tr class="dc-total"><td></td><td></td><td>Total · ${c.pessoas} pessoas</td><td></td>
        <td class="dir">${esc(num(c.horasTodas, 1))}</td><td></td><td></td><td class="dir">${esc(num(c.folha))}</td><td></td>
        <td class="dir">${c.media !== null ? esc(num(c.media)) : '—'}</td><td></td></tr></tfoot>
    </table></div>
    <p class="dc-sem" style="margin-top:8px">Horas em branco = vale a do Pessoas (ou a padrão do mês, ${esc(num((p.horas_padrao || {})[mesSel.slice(5)] || 0, 0))} h, se não houver). Digite um número para corrigir. R$/h = (salário × encargo + recibo) ÷ horas. Desmarcar o ✓ tira a pessoa da média do mês.</p>`;

  ligarNav();
  $('hhSetor').addEventListener('change', e => { filtroSetor = e.target.value; desenhar(); });
  $('hhBusca').addEventListener('input', e => { busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const el = $('hhBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  const item = id => todos('cb_hh_itens').find(x => x.id === id);
  const salvarNum = (sel, campo) => alvo.querySelectorAll(`[${sel}]`).forEach(inp => inp.addEventListener('change', async () => {
    const it = item(inp.getAttribute(sel)); if (!it) return;
    const v = lerNumero(inp.value);
    if (Number.isNaN(v)) { aviso('Use só números (ex.: 3.277,41).', true); inp.value = ''; return; }
    await gravar('cb_hh_itens', { ...it, [campo]: v });
    desenhar();
  }));
  salvarNum('data-h', 'horas_manual'); salvarNum('data-sal', 'salario_bruto'); salvarNum('data-rec', 'recibo');
  alvo.querySelectorAll('[data-rel]').forEach(s => s.addEventListener('change', async () => {
    const it = item(s.dataset.rel); if (it) { await gravar('cb_hh_itens', { ...it, relacao: s.value }); desenhar(); }
  }));
  alvo.querySelectorAll('[data-inc]').forEach(cx => cx.addEventListener('change', async () => {
    const it = item(cx.dataset.inc); if (it) { await gravar('cb_hh_itens', { ...it, incluido: cx.checked }); desenhar(); }
  }));
  alvo.querySelectorAll('[data-agro]').forEach(cx => cx.addEventListener('change', async () => {
    const it = item(cx.dataset.agro); if (it) { await gravar('cb_hh_itens', { ...it, lancado_agro: cx.checked }); desenhar(); }
  }));
  $('hhAtualizar')?.addEventListener('click', () => atualizarDoPessoas(mesSel));
  $('hhAdd')?.addEventListener('click', () => adicionarPessoa(mesSel));
  $('hhFechar')?.addEventListener('click', async () => {
    if (c.semValor && !confirm(`${c.semValor} pessoa(s) sem salário/recibo. Fechar mesmo assim?`)) return;
    if (!c.semValor && !confirm(`Fechar a hora-homem de ${nomeMes(mesSel)}?\n\nO mês fica com cadeado: guarda o encargo e a hora padrão de hoje, e mudar os Parâmetros depois não altera mais este mês. Só o administrador reabre.`)) return;
    const pa = parametros();
    await gravar('cb_hh_meses', { ...m, status: 'fechado', fechado_por: meuNome(), fechado_em: new Date().toISOString(),
      encargo_fixo: Number(pa.encargo_fixo), encargo_temporario: Number(pa.encargo_temporario),
      horas_padrao: Number((pa.horas_padrao || {})[mesSel.slice(5, 7)] || 0) });
    aviso('Mês fechado.'); desenhar();
  });
  $('hhReabrir')?.addEventListener('click', async () => {
    if (!confirm(`Reabrir a hora-homem de ${nomeMes(mesSel)}? O cadeado sai e o mês volta a usar os Parâmetros de agora.`)) return;
    await gravar('cb_hh_meses', { ...m, status: 'aberto', fechado_por: null, fechado_em: null,
      encargo_fixo: null, encargo_temporario: null, horas_padrao: null }); desenhar();
  });
  $('hhImprimir').addEventListener('click', () => { desenharFolha(c); setTimeout(() => window.print(), 150); });
  $('hhZap').addEventListener('click', e => enviarWhatsapp(pdfHH(c), resumoHH(c), e.currentTarget));
  $('hhExcel').addEventListener('click', () => exportar(c).catch(e => aviso(e.message || 'Não consegui gerar o Excel.', true)));
  desenharFolha(c);
}

function ligarNav() {
  $('hhAnt').addEventListener('click', () => irParaMesHH(mesAnterior(mesSel)));
  $('hhSeg').addEventListener('click', () => irParaMesHH(mesSeguinte(mesSel)));
  $('hhMesInput').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) irParaMesHH(e.target.value); });
}

/* Lista do mês = cadastro de ATIVOS do Pessoas, setor CAMPO (pedido dele,
   20/10/2026), mais quem tem boletim na competência mesmo já inativo. */
/* 20/10/2026: Campo e Administrativo (custo hora de cada um). */
const doCampo = lista => lista.filter(r => /^(CAMPO|ADM)/i.test(String(r.setor || '')));
const horasDe_ = r => Math.round(Number(r.minutos || 0) / 6) / 10;

/** Cria o mês com o cadastro de ativos do Pessoas e as horas da competência. */
async function criarMes(mesId, anterior) {
  let lista;
  try { lista = doCampo(await horasDoPessoas(mesId)); }
  catch (e) { aviso((e.message || e) + ' O mês precisa do Pessoas para nascer.', true); return; }
  await gravar('cb_hh_meses', { id: mesId, status: 'aberto' });
  const antes = anterior ? itensDoMes(anterior) : [];
  for (const r of lista) {
    const prev = antes.find(a => a.funcionario_id === r.funcionario_id);
    await gravar('cb_hh_itens', { id: chaveItem(mesId, r.funcionario_id), mes: mesId, funcionario_id: r.funcionario_id,
      cadastro: r.cadastro || null, nome: r.nome, setor: setorDe(r.setor), relacao: prev ? prev.relacao : relacaoDe(r.tipo_contrato),
      horas_pessoas: horasDe_(r), horas_manual: null,
      salario_bruto: temValor(r.salario) ? Number(r.salario) : null, recibo: null,
      lancado_agro: false, incluido: true, obs: String(r.situacao || '').toUpperCase() === 'ATIVO' ? null : 'inativo, com boletim no mês' });
  }
  const comHoras = lista.filter(r => Number(r.minutos) > 0).length;
  aviso(`Mês criado: ${lista.length} pessoa(s) do cadastro de ativos do campo, ${comHoras} com horas no Pessoas.`);
  desenhar();
}

/** Acerta o mês aberto com o Pessoas: entra quem é ativo e falta, horas
 *  atualizadas, e quem saiu do cadastro de ativos (sem boletim) fica fora. */
async function atualizarDoPessoas(mesId, sozinho) {
  if (lendoPessoas) return;
  lendoPessoas = true; desenhar();
  try {
    const lista = doCampo(await horasDoPessoas(mesId));
    const ids = new Set(lista.map(r => r.funcionario_id));
    let novos = 0, mudou = 0, sairam = 0;
    for (const r of lista) {
      const id = chaveItem(mesId, r.funcionario_id);
      const h = horasDe_(r);
      const it = todos('cb_hh_itens').find(x => x.mes === mesId && (x.id === id || x.funcionario_id === r.funcionario_id));
      if (!it) {
        novos++;
        await gravar('cb_hh_itens', { id, mes: mesId, funcionario_id: r.funcionario_id, cadastro: r.cadastro || null, nome: r.nome,
          setor: setorDe(r.setor), relacao: relacaoDe(r.tipo_contrato), horas_pessoas: h, horas_manual: null,
          salario_bruto: temValor(r.salario) ? Number(r.salario) : null, recibo: null, lancado_agro: false, incluido: true });
      } else if (Number(it.horas_pessoas || 0) !== h || it.nome !== r.nome || it.setor !== setorDe(r.setor) || it.incluido === false && it.obs === 'fora do cadastro de ativos') {
        mudou++;
        await gravar('cb_hh_itens', { ...it, horas_pessoas: h, nome: r.nome, setor: setorDe(r.setor), cadastro: r.cadastro || it.cadastro,
          incluido: it.obs === 'fora do cadastro de ativos' ? true : it.incluido,
          obs: it.obs === 'fora do cadastro de ativos' ? null : it.obs });
      }
    }
    // quem está no mês com cadastro do Pessoas mas não é mais ativo nem tem boletim
    for (const it of itensDoMes(mesId)) {
      if (it.funcionario_id && !ids.has(it.funcionario_id) && it.incluido !== false) {
        sairam++;
        await gravar('cb_hh_itens', { ...it, incluido: false, obs: 'fora do cadastro de ativos' });
      }
    }
    if (!sozinho || novos + mudou + sairam) aviso(`Pessoas: ${novos} entrou(aram), ${mudou} atualizado(s), ${sairam} fora por não estar(em) ativo(s).`);
  } catch (e) { if (!sozinho) aviso(e.message || 'Não consegui ler o Pessoas.', true); else sincronizados.delete(mesId); }
  finally { lendoPessoas = false; desenhar(); }
}

function adicionarPessoa(mesId) {
  window.abrirModal('Acrescentar pessoa', `
    <form class="grade" id="hhNova" autocomplete="off">
      <label class="campo">Nº <input type="text" name="cad" inputmode="numeric"></label>
      <label class="campo">Relação <select name="rel"><option>Fixo</option><option>Temporário</option></select></label>
      <label class="campo">Setor <select name="setor">${SETORES.map(x => `<option${x === (filtroSetor || 'Campo') ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="campo plena">Nome <input type="text" name="nome" required></label>
      <label class="campo">Horas <input type="text" name="h" inputmode="decimal" placeholder="vazio = padrão do mês"></label>
      <label class="campo">Salário bruto <input type="text" name="sal" inputmode="decimal"></label>
      <label class="campo">Recibo (R$) <input type="text" name="rec" inputmode="decimal"></label>
      <div class="barra fim plena"><button class="btn" type="button" id="hhNovaCanc">Cancelar</button><button class="btn principal" type="submit">Acrescentar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#hhNovaCanc').onclick = () => window.fecharModal();
    corpo.querySelector('#hhNova').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const nome = String(f.get('nome') || '').trim().toUpperCase();
      if (!nome) return;
      const nums = ['h', 'sal', 'rec'].map(k => lerNumero(f.get(k)));
      if (nums.some(Number.isNaN)) { aviso('Horas, salário e recibo: só números.', true); return; }
      await gravar('cb_hh_itens', { id: chaveItem(mesId, 'n-' + semAcento(nome).replace(/\W+/g, '-')), mes: mesId, funcionario_id: null,
        cadastro: String(f.get('cad') || '').trim() || null, nome, setor: f.get('setor') || 'Campo', relacao: f.get('rel'),
        horas_pessoas: null, horas_manual: nums[0], salario_bruto: nums[1], recibo: nums[2], lancado_agro: false, incluido: true });
      window.fecharModal(); desenhar();
    });
  });
}

/* ---------------- folha A4 e Excel ---------------- */
function desenharFolha(c) {
  const el = $('hhFolha'); if (!el) return;
  const m = mes(mesSel);
  const linhas = c.linhas.filter(l => l.incluido !== false);
  el.innerHTML = `<div class="rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA">
      <div class="rel-tit"><h1>Custo hora-homem · ${esc(nomeMes(mesSel))}</h1>
        <p>Campo e Administrativo · R$/h = (salário bruto × encargo + recibo) ÷ horas trabalhadas${m && m.status === 'fechado' ? ' · mês fechado' : ' · rascunho (mês aberto)'}</p></div></div>
    <div class="rel-kpis">
      <div><span>Pessoas</span><b>${c.pessoas}</b></div>
      <div><span>Folha</span><b>${esc(num(c.folha))}</b></div>
      <div><span>Custo c/ encargos</span><b>${esc(num(c.custo))}</b></div>
      <div><span>Custo hora Campo</span><b>${c.campo.media !== null ? esc(num(c.campo.media)) : '—'}</b></div>
      <div><span>Custo hora ADM</span><b>${c.adm.media !== null ? esc(num(c.adm.media)) : '—'}</b></div>
    </div>
    ${SETORES.map(st => {
      const ls = linhas.filter(l => (l.setor || 'Campo') === st); if (!ls.length) return '';
      const g = st === 'ADM' ? c.adm : c.campo;
      return `<p class="rel-secao">${st === 'ADM' ? 'Administrativo (ADM)' : 'Campo'}</p>
    <table class="rel-tab"><thead><tr><th>Nº</th><th>Nome</th><th>Relação</th><th class="dir">Horas</th><th class="dir">Salário bruto</th><th class="dir">Recibo</th><th class="dir">Total</th><th class="dir">R$/h</th></tr></thead>
    <tbody>${ls.map(l => `<tr><td>${esc(l.cadastro || '')}</td><td>${esc(l.nome)}</td><td>${esc(l.relacao)}</td>
      <td class="dir">${esc(num(l.horas, 1))}${l.origemHoras === 'padrao' ? '*' : ''}</td><td class="dir">${esc(num(l.salario_bruto))}</td><td class="dir">${esc(num(l.recibo))}</td>
      <td class="dir">${esc(num(l.total))}</td><td class="dir"><b>${l.rh !== null ? esc(num(l.rh)) : '—'}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr class="rel-total"><td></td><td>Custo hora ${st}</td><td>${g.pessoas} pessoas</td><td class="dir">${esc(num(g.horasTodas, 1))}</td><td></td><td></td><td class="dir">${esc(num(g.folha))}</td><td class="dir">${g.media !== null ? esc(num(g.media)) : '—'}</td></tr></tfoot></table>`;
    }).join('')}
    <p class="dc-sem" style="font-size:7.5pt;color:#51534A">Encargos: fixo ${esc(num(parametrosDoMes(mesSel).encargo_fixo, 4))} · temporário ${esc(num(parametrosDoMes(mesSel).encargo_temporario, 4))}. * horas padrão do mês (sem boletim no Pessoas).</p>
    ${rodapeLop()}
  </div>`;
}

function pdfHH(c) {
  const m = mes(mesSel), p = parametrosDoMes(mesSel);
  const linhas = c.linhas.filter(l => l.incluido !== false);
  const secao = st => {
    const ls = linhas.filter(l => (l.setor || 'Campo') === st); if (!ls.length) return null;
    const g = st === 'ADM' ? c.adm : c.campo;
    return { titulo: st === 'ADM' ? 'Administrativo (ADM)' : 'Campo', dir: [3, 4, 5, 6, 7],
      head: ['Nº', 'Nome', 'Relação', 'Horas', 'Salário bruto', 'Recibo', 'Total', 'R$/h'],
      body: ls.map(l => [l.cadastro || '', l.nome, l.relacao, num(l.horas, 1) + (l.origemHoras === 'padrao' ? '*' : ''),
        num(l.salario_bruto), num(l.recibo), num(l.total), l.rh !== null ? num(l.rh) : '—']),
      total: ['', 'Custo hora ' + st, g.pessoas + ' pessoas', num(g.horasTodas, 1), '', '', num(g.folha), g.media !== null ? num(g.media) : '—'] };
  };
  return {
    titulo: 'Custo hora-homem · ' + nomeMes(mesSel),
    subtitulo: `Campo e Administrativo · R$/h = (salário bruto × encargo + recibo) ÷ horas · encargo fixo ${num(p.encargo_fixo, 4)}, temporário ${num(p.encargo_temporario, 4)}` + (m && m.status === 'fechado' ? ' · mês fechado' : ' · rascunho (mês aberto)'),
    arquivo: 'Hora-homem ' + mesSel,
    kpis: [['Pessoas', c.pessoas], ['Folha', reais(c.folha)], ['Custo c/ encargos', reais(c.custo)],
      ['Custo hora Campo', c.campo.media !== null ? reais(c.campo.media) : '—'], ['Custo hora ADM', c.adm.media !== null ? reais(c.adm.media) : '—']],
    secoes: SETORES.map(secao).filter(Boolean),
  };
}
function resumoHH(c) {
  return `*Hora-homem · ${nomeMes(mesSel)}* — SAKUMA\n${c.pessoas} pessoas · custo c/ encargos ${reais(c.custo)}` +
    `\nCusto hora Campo ${c.campo.media !== null ? reais(c.campo.media) : '—'} · Custo hora ADM ${c.adm.media !== null ? reais(c.adm.media) : '—'}`;
}

async function exportar(c) {
  const linhas = c.linhas.filter(l => l.incluido !== false);
  await baixarXlsx('Hora-homem ' + mesSel, [{
    nome: nomeMes(mesSel), titulo: 'Custo Hora Homem · ' + nomeMes(mesSel),
    subtitulo: 'SAKUMA Agronegócios · R$/h = (salário bruto × encargo + recibo) ÷ horas trabalhadas',
    colunas: [{ rot: 'Agro', larg: 6 }, { rot: 'Setor', larg: 8 }, { rot: 'Num', larg: 6 }, { rot: 'Nome', larg: 36 }, { rot: 'H Trab Total', tipo: 'num', casas: 1, larg: 11 },
      { rot: 'Salário Bruto', tipo: 'num', casas: 2, larg: 13 }, { rot: 'Horas Recibo', tipo: 'num', casas: 2, larg: 13 },
      { rot: 'Total', tipo: 'num', casas: 2, larg: 13 }, { rot: 'Relação', larg: 11 }, { rot: 'Origem das horas', larg: 14 }, { rot: 'R$/H', tipo: 'num', casas: 2, larg: 10 }],
    linhas: linhas.map(l => [l.lancado_agro ? 'sim' : '', l.setor || 'Campo', l.cadastro || '', l.nome, l.horas, Number(l.salario_bruto || 0), Number(l.recibo || 0), l.total, l.relacao,
      ({ pessoas: 'Pessoas', planilha: 'planilha', manual: 'corrigido' })[l.origemHoras] || 'padrão do mês', l.rh]),
    total: ['', '', '', 'Total', c.horasTodas, '', '', c.folha, '', '', c.media],
    notas: [`Custo hora Campo: ${c.campo.media !== null ? num(c.campo.media) : '—'} (${num(c.campo.custo)} ÷ ${num(c.campo.horas, 1)} h)`,
      `Custo hora ADM: ${c.adm.media !== null ? num(c.adm.media) : '—'} (${num(c.adm.custo)} ÷ ${num(c.adm.horas, 1)} h)`],
  }]);
}

/* ---------------- histórico ---------------- */
function desenharHistorico() {
  const alvo = $('hhHistCorpo'); if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = meses();
  if (!lista.length) { alvo.innerHTML = '<div class="vazio">Nenhum mês ainda.</div>'; return; }
  const ult = lista.slice(-12).map(m => m.id);
  const porMes = Object.fromEntries(ult.map(id => [id, calcularMesHH(id)]));
  const pessoas = new Map();
  for (const id of ult) for (const l of porMes[id].linhas) {
    if (l.incluido === false) continue;
    const k = l.funcionario_id || l.nome;
    if (!pessoas.has(k)) pessoas.set(k, { nome: l.nome, cadastro: l.cadastro, setor: l.setor || 'Campo', v: {} });
    pessoas.get(k).v[id] = l.rh;
  }
  alvo.innerHTML = `
    <h3 class="cb-secao">Meses</h3>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Competência</th><th>Situação</th><th class="dir">Pessoas</th><th class="dir">Horas</th><th class="dir">Folha</th><th class="dir">Custo c/ encargos</th><th class="dir">Custo hora Campo</th><th class="dir">Custo hora ADM</th><th></th></tr></thead>
      <tbody>${lista.slice().reverse().map(m => { const c = calcularMesHH(m.id); return `<tr>
        <td><b>${esc(nomeMes(m.id))}</b></td><td>${m.status === 'fechado' ? `<span class="cb-cadeado">${CADEADO} Fechado</span>` : '<span class="tag alerta">aberto</span>'}</td>
        <td class="dir">${c.pessoas}</td><td class="dir">${esc(num(c.horasTodas, 1))}</td><td class="dir">${esc(num(c.folha))}</td>
        <td class="dir">${esc(num(c.custo))}</td><td class="dir"><b>${c.campo.media !== null ? esc(num(c.campo.media)) : '—'}</b></td><td class="dir"><b>${c.adm.media !== null ? esc(num(c.adm.media)) : '—'}</b></td>
        <td class="dir"><button class="btn mini" type="button" data-abrir="${esc(m.id)}">Abrir</button></td></tr>`; }).join('')}</tbody></table></div>
    <h3 class="cb-secao">R$/h por pessoa <small>últimos ${ult.length} meses</small></h3>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Nº</th><th>Nome</th><th>Setor</th>${ult.map(m => `<th class="dir">${esc(mesCurto(m))}</th>`).join('')}</tr></thead>
      <tbody>${[...pessoas.values()].sort((a, b) => a.setor.localeCompare(b.setor) * -1 || a.nome.localeCompare(b.nome, 'pt-BR')).map(p => `<tr><td>${esc(p.cadastro || '')}</td><td><b>${esc(p.nome)}</b></td><td>${esc(p.setor)}</td>${ult.map(m =>
        `<td class="dir">${p.v[m] === undefined ? '' : p.v[m] === null ? '—' : esc(num(p.v[m]))}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr class="dc-total"><td></td><td>Custo hora Campo</td><td></td>${ult.map(m => `<td class="dir">${porMes[m].campo.media !== null ? esc(num(porMes[m].campo.media)) : '—'}</td>`).join('')}</tr>
        <tr class="dc-total"><td></td><td>Custo hora ADM</td><td></td>${ult.map(m => `<td class="dir">${porMes[m].adm.media !== null ? esc(num(porMes[m].adm.media)) : '—'}</td>`).join('')}</tr></tfoot>
    </table></div>`;
  alvo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { irParaMesHH(b.dataset.abrir); window.abrirTelaCustoBase('hhMes'); }));
}

/* ---------------- índices ---------------- */
/* Parâmetros (20/10/2026, pedido dele: "férias, FGTS, patronal etc., quero
   poder alterar"). O encargo é montado pelos itens: encargo = 1 + Σ %.
   Dá para mudar o %, renomear, acrescentar e tirar item, no fixo e no
   temporário. A composição fica em cb_hh_parametros.componentes. */
const COMP_PADRAO = {
  fixo: [{ nome: 'Férias', pct: 11.11 }, { nome: '13º salário', pct: 8.33 }, { nome: 'FGTS', pct: 8 },
    { nome: 'Patronal', pct: 0.2 }, { nome: 'Multa rescisória', pct: 3.2 }, { nome: 'Aviso demissão', pct: 8.33 }],
  temporario: [{ nome: 'Encargos do temporário (total da planilha)', pct: 57.05 }],
};
let rascunhoComp = null;
const somaPct = l => l.reduce((s, c) => s + (Number(c.pct) || 0), 0);
const encargoDe = l => Math.round((1 + somaPct(l) / 100) * 10000) / 10000;

function desenharIndices() {
  const alvo = $('hhIndCorpo'); if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const p = parametros();
  if (!rascunhoComp) rascunhoComp = JSON.parse(JSON.stringify(p.componentes || COMP_PADRAO));
  const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const tabela = (tipo, titulo) => {
    const l = rascunhoComp[tipo] || [];
    return `<div class="hh-comp">
      <h3 class="cb-secao">${titulo} <small>encargo = 1 + soma dos itens</small></h3>
      <table class="dc-planilha cb-tab"><thead><tr><th>Item</th><th class="dir" style="width:130px">% sobre o salário</th><th style="width:44px"></th></tr></thead>
      <tbody>${l.map((c, k) => `<tr>
        <td><input class="dc-mini" data-nome="${tipo}:${k}" value="${esc(c.nome)}"></td>
        <td class="dir"><input class="dc-mini hh-num" data-pct="${tipo}:${k}" inputmode="decimal" value="${esc(num(c.pct, 2))}"></td>
        <td class="ce"><button class="btn mini perigo" type="button" data-tirar="${tipo}:${k}" title="tirar item">×</button></td></tr>`).join('')}
      </tbody>
      <tfoot><tr class="dc-total"><td>Total dos encargos</td><td class="dir">${esc(num(somaPct(l), 2))}%</td><td></td></tr>
        <tr class="dc-total"><td><b>Encargo ${tipo === 'fixo' ? 'fixo' : 'temporário'}</b> (salário × este número)</td><td class="dir"><b class="hh-media">${esc(num(encargoDe(l), 4))}</b></td><td></td></tr></tfoot></table>
      <div class="barra" style="margin-top:8px"><button class="btn mini" type="button" data-mais="${tipo}">+ Item</button></div>
    </div>`;
  };
  alvo.innerHTML = `<p class="cb-param-aviso"><span class="cb-cadeado">${CADEADO} Cadeado</span> Estes parâmetros valem para os meses <b>abertos</b> e os próximos. Mês <b>fechado</b> guardou o encargo e a hora padrão do dia do fechamento e não muda.</p>
  <div class="hh-comps">${tabela('fixo', 'Encargos trabalhistas · Fixo')}${tabela('temporario', 'Encargos trabalhistas · Temporário')}</div>
  <form id="hhIndForm" autocomplete="off">
    <h3 class="cb-secao">Horas padrão do mês <small>usadas quando a pessoa não tem horas no Pessoas</small></h3>
    <div class="grade hh-horas">${NOMES.map((n, i) => { const k = String(i + 1).padStart(2, '0'); return `<label class="campo">${n} <input type="text" name="h${k}" inputmode="numeric" value="${esc((p.horas_padrao || {})[k] ?? '')}"></label>`; }).join('')}</div>
    <div class="barra entre">
      <span class="dc-sem">Hoje: fixo ${esc(num(p.encargo_fixo, 4))} · temporário ${esc(num(p.encargo_temporario, 4))}. Nada muda até salvar.</span>
      <div class="barra" style="margin:0"><button class="btn" type="button" id="hhIndDesfazer">Desfazer</button>
      <button class="btn principal" type="submit">Salvar parâmetros</button></div>
    </div>
  </form>`;
  const pos = a => { const [t, k] = a.split(':'); return [t, Number(k)]; };
  alvo.querySelectorAll('[data-nome]').forEach(inp => inp.addEventListener('input', () => { const [t, k] = pos(inp.dataset.nome); rascunhoComp[t][k].nome = inp.value; }));
  alvo.querySelectorAll('[data-pct]').forEach(inp => inp.addEventListener('change', () => {
    const [t, k] = pos(inp.dataset.pct); const v = lerNumero(inp.value);
    if (v === null || Number.isNaN(v)) { aviso('Use só números (ex.: 11,11).', true); return desenharIndices(); }
    rascunhoComp[t][k].pct = v; desenharIndices();
  }));
  alvo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => { const [t, k] = pos(b.dataset.tirar); rascunhoComp[t].splice(k, 1); desenharIndices(); }));
  alvo.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => { rascunhoComp[b.dataset.mais].push({ nome: 'Novo item', pct: 0 }); desenharIndices(); }));
  $('hhIndDesfazer').addEventListener('click', () => { rascunhoComp = null; desenharIndices(); });
  $('hhIndForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const limpa = l => l.map(c => ({ nome: String(c.nome || '').trim() || 'Item', pct: Number(c.pct) || 0 }));
    const comp = { fixo: limpa(rascunhoComp.fixo || []), temporario: limpa(rascunhoComp.temporario || []) };
    const horas = {};
    for (let i = 1; i <= 12; i++) { const k = String(i).padStart(2, '0'); const v = lerNumero(f.get('h' + k)); if (v !== null && !Number.isNaN(v)) horas[k] = v; }
    const atual = todos('cb_hh_parametros').find(x => x.id === 'geral') || { id: 'geral' };
    await gravar('cb_hh_parametros', { ...atual, id: 'geral', componentes: comp,
      encargo_fixo: encargoDe(comp.fixo), encargo_temporario: encargoDe(comp.temporario), horas_padrao: horas });
    rascunhoComp = null;
    aviso(`Parâmetros salvos: fixo ${num(encargoDe(comp.fixo), 4)} · temporário ${num(encargoDe(comp.temporario), 4)}. Valem para os meses abertos; os fechados (cadeado) não mudam.`);
    desenharIndices();
  });
}

/* ---------------- abertura ---------------- */
export function abrirHoraHomem(tela) {
  if (!ouvindo) {
    window.addEventListener('custobase-dados', () => {
      if (!$('telaHhMes').hidden) desenhar();
      if (!$('telaHhHistorico').hidden) desenharHistorico();
      if (!$('telaHhIndices').hidden) desenharIndices();
    });
    ouvindo = true;
  }
  if (tela === 'hhMes') desenhar();
  if (tela === 'hhHistorico') desenharHistorico();
  if (tela === 'hhIndices') desenharIndices();
}
