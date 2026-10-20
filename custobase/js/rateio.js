// rateio.js — Rateio mensal culturas › Rateio do mês (20/10/2026).
//
// Processo em três partes independentes (pedido dele, 20/10/2026):
//   Parâmetros (culturas) → Cadastro de plantios (data inicial e qtde de
//   meses) → Rateio do mês, que se monta sozinho: entra no mês todo plantio
//   cujo período cobre o mês (data inicial até o dia 15 entra naquele mês;
//   do 16 em diante, no seguinte). Sem caixinha de "entra": quem decide é o
//   cadastro. Cada linha tem a marcação "Lançado no Agro".
// Mês aberto acompanha o cadastro e os parâmetros (área, índice, ciclo).
// Mês fechado fica com cadeado: guarda os números da época.
// O custo ADM do mês é opcional: sem ele sai só o % (direcionador).
import { $, esc, pronto, carregando, todos, gravar, aviso, souAdmin, meuNome, lerNumero, num, pct, reais,
  mes, meses, ultimoMes, mesAtual, mesAnterior, mesSeguinte, nomeMes, mesCurto, idItem, itensDoMes, mesFechado,
  calcularMes, situacaoCiclo, talhoes, talhao, cultura, culturas, nomeCurto, dataHora, seloFechado,
  entraNoMes, periodoDe, DIA_CORTE } from './dados.js';
import { etiquetaMeses, editar as editarPlantio } from './talhoes.js';
import { baixarXlsx } from '../../js/excel.js';
import { enviarWhatsapp, rodapeLop, botaoZap } from './pdf.js';

let ouvindo = false;
let mesSel = null;
let sincronizando = false;

export function irParaMes(m) { mesSel = m; desenhar(); }

/** Acerta um mês ABERTO com o cadastro: entra quem o período cobre, sai quem
 *  não cobre, e área/índice/ciclo seguem o cadastro e os parâmetros.
 *  Devolve true se mudou alguma coisa. Mês fechado nunca é tocado. */
export async function sincronizarMes(mesId) {
  if (!mes(mesId) || mesFechado(mesId)) return false;
  let mudou = false;
  const atuais = itensDoMes(mesId);
  for (const t of talhoes().filter(t => entraNoMes(t, mesId))) {
    const c = cultura(t.cultura_id) || {};
    const id = idItem(mesId, t.id);
    const it = atuais.find(x => x.talhao_id === t.id);
    const novo = { id, mes: mesId, talhao_id: t.id, cultura_id: t.cultura_id || null,
      area: Number(t.area || 0), indice: Number(c.indice || 0), ciclo: Number(c.ciclo || 1), incluido: true };
    if (!it) { await gravar('cb_itens', { ...novo, lancado_agro: false }); mudou = true; }
    else if (Number(it.area) !== novo.area || Number(it.indice) !== novo.indice || Number(it.ciclo) !== novo.ciclo
      || it.cultura_id !== novo.cultura_id || it.incluido === false) {
      await gravar('cb_itens', { ...it, ...novo, id: it.id }); mudou = true;
    }
  }
  for (const it of atuais) {
    if (!entraNoMes(talhao(it.talhao_id), mesId)) {
      try { await window.apagarItemMes(it.id); mudou = true; } catch (e) { console.warn('não tirei do mês', e); }
    }
  }
  return mudou;
}
/** Acerta todos os meses abertos (chamado depois de mudar o cadastro). */
export async function sincronizarAbertos() {
  const lista = meses().filter(m => m.status !== 'fechado').map(m => m.id);
  const mudaram = [];
  for (const id of lista) if (await sincronizarMes(id)) mudaram.push(id);
  return mudaram;
}

window.cbSincronizarAbertos = sincronizarAbertos;

function desenhar() {
  const alvo = $('cbMesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; $('cbMesFolha').innerHTML = ''; return; }
  if (!mesSel) mesSel = ultimoMes() || mesAtual();
  const m = mes(mesSel);

  const cabecalho = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn mini" type="button" id="cbMesAnt" title="mês anterior">◀</button>
        <label class="campo">Mês do rateio <input type="month" id="cbMesInput" value="${esc(mesSel)}"></label>
        <button class="btn mini" type="button" id="cbMesSeg" title="mês seguinte">▶</button>
      </div>
      <div class="cb-mes-estado">${m
        ? (m.status === 'fechado' ? seloFechado(m.fechado_por, m.fechado_em) : '<span class="tag alerta">aberto · segue o cadastro</span>')
        : '<span class="tag neutra">mês ainda não criado</span>'}</div>
    </div>`;

  if (!m) {
    const vao = talhoes().filter(t => entraNoMes(t, mesSel));
    alvo.innerHTML = cabecalho + `
      <div class="cb-vazio-mes">
        <p><b>${esc(nomeMes(mesSel))}</b> ainda não tem rateio.</p>
        <p class="dc-sem">Pelo cadastro de plantios, ${vao.length} ${vao.length === 1 ? 'plantio entra' : 'plantios entram'} neste mês
          (data inicial até o dia ${DIA_CORTE} entra no próprio mês; do ${DIA_CORTE + 1} em diante, no seguinte).</p>
        <div class="barra"><button class="btn principal" type="button" id="cbCriar">Criar o rateio de ${esc(mesCurto(mesSel))}</button></div>
      </div>`;
    $('cbMesFolha').innerHTML = '';
    ligarNav();
    $('cbCriar').addEventListener('click', async () => {
      await gravar('cb_meses', { id: mesSel, status: 'aberto', custo_adm: null });
      await sincronizarMes(mesSel);
      aviso('Rateio criado pelo cadastro de plantios.');
      desenhar();
    });
    return;
  }

  // mês aberto: confere com o cadastro antes de mostrar (uma vez por desenho)
  if (m.status !== 'fechado' && !sincronizando) {
    sincronizando = true;
    sincronizarMes(mesSel).then(mudou => { sincronizando = false; if (mudou) desenhar(); }, () => { sincronizando = false; });
  }

  const c = calcularMes(mesSel);
  const fechado = m.status === 'fechado';
  const linhas = c.linhas;
  const completaram = linhas.filter(l => situacaoCiclo(l.meses, l.limite) === 'ultimo');
  const agro = linhas.filter(l => l.lancado_agro).length;

  alvo.innerHTML = cabecalho + `
    <div class="cb-kpis">
      <div><span>Plantios no rateio</span><b>${c.incluidos}</b><small>pelo cadastro de plantios</small></div>
      <div><span>Área (ha)</span><b>${esc(num(c.area))}</b></div>
      <div><span>Lançados no Agro</span><b>${agro} / ${linhas.length}</b><small>${agro === linhas.length && linhas.length ? 'todos lançados' : 'falta lançar ' + (linhas.length - agro)}</small></div>
      <div class="cb-kpi-custo"><span>Custo ADM do mês (R$)</span>
        <input type="text" id="cbCusto" inputmode="decimal" placeholder="opcional" value="${c.custo !== null ? esc(num(c.custo)) : ''}"${fechado ? ' disabled' : ''}>
        <small>${c.custo !== null ? 'rateado pelo %' : 'sem valor: sai só o %'}</small></div>
    </div>
    ${completaram.length ? `<div class="aviso info cb-aviso"><b>Último mês no rateio:</b> ${completaram.map(l => `${esc(l.talhao.nome)} (${l.meses}º de ${l.limite})`).join(', ')}. No próximo mês ${completaram.length === 1 ? 'ele sai' : 'eles saem'} sozinho${completaram.length === 1 ? '' : 's'}.</div>` : ''}
    <div class="barra entre naoimprimir">
      <div class="barra" style="margin:0">
        <span class="dc-sem">Quem entra no mês é definido no <a href="#" id="cbIrCadastro">cadastro de plantios</a> (data inicial e qtde de meses).</span>
        <label class="cb-check"><input type="checkbox" id="cbAgroTodos"${agro === linhas.length && linhas.length ? ' checked' : ''}> marcar todos como lançados no Agro</label>
      </div>
      <div class="barra" style="margin:0">
        ${botaoZap('cbZap')}
        <button class="btn" type="button" id="cbImprimir">Imprimir</button>
        <button class="btn" type="button" id="cbExcel">Exportar Excel</button>
        ${fechado ? (souAdmin() ? '<button class="btn" type="button" id="cbReabrir">Reabrir mês</button>' : '')
                  : '<button class="btn principal" type="button" id="cbFechar">Fechar mês</button>'}
      </div>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab cb-rateio">
      <thead><tr>
        <th>Cód.</th><th>Plantio / talhão</th><th>Cultura</th>
        <th class="dir">Área (ha)</th><th class="dir">Índice</th><th class="dir">Ciclo</th><th class="dir">Peso</th>
        <th class="dir">%</th>${c.custo !== null ? '<th class="dir">R$</th>' : ''}<th>Meses no rateio</th><th class="ce">Lançado no Agro</th><th></th>
      </tr></thead>
      <tbody>${linhas.map(l => `<tr data-id="${esc(l.id)}">
        <td>${esc(l.talhao.cod_agro || '')}</td>
        <td><b>${esc(l.talhao.nome || '—')}</b>${l.talhao.fazenda ? `<small class="dc-sem"> · ${esc(nomeCurto(l.talhao.fazenda))}</small>` : ''}</td>
        <td>${esc(l.culturaNome)}</td>
        <td class="dir">${esc(num(l.area))}</td>
        <td class="dir">${esc(num(l.indice, 0))}</td>
        <td class="dir">${esc(l.ciclo)}</td>
        <td class="dir">${esc(num(l.peso, 0))}</td>
        <td class="dir"><b>${esc(pct(l.pct))}</b></td>
        ${c.custo !== null ? `<td class="dir">${esc(reais(l.valor))}</td>` : ''}
        <td>${etiquetaMeses(l.meses, l.limite, { curta: true })}</td>
        <td class="ce"><input type="checkbox" class="cb-agro" data-agro="${esc(l.id)}"${l.lancado_agro ? ' checked' : ''} title="lançado no sistema Agro"></td>
        <td class="dir naoimprimir"><button class="btn mini" type="button" data-ed="${esc(l.talhao_id)}" title="editar o plantio no cadastro">✎</button></td>
      </tr>`).join('') || `<tr><td colspan="12" class="vazio">Nenhum plantio neste mês. Cadastre em Cadastro de plantios, com a data inicial.</td></tr>`}
      </tbody>
      <tfoot><tr class="dc-total">
        <td></td><td>Total</td><td>${c.incluidos} ${c.incluidos === 1 ? 'plantio' : 'plantios'}</td>
        <td class="dir">${esc(num(c.area))}</td><td></td><td></td><td class="dir">${esc(num(c.total, 0))}</td>
        <td class="dir">100%</td>${c.custo !== null ? `<td class="dir">${esc(reais(c.custo))}</td>` : ''}<td></td><td class="ce">${agro}/${linhas.length}</td><td></td>
      </tr></tfoot>
    </table></div>
    <p class="dc-sem" style="margin-top:8px">Peso = índice × área × (12 ÷ ciclo). A marcação "Lançado no Agro" pode ser feita mesmo com o mês fechado.</p>`;

  ligarNav();
  $('cbIrCadastro').addEventListener('click', e => { e.preventDefault(); window.abrirTelaCustoBase('rtTalhoes'); });
  $('cbCusto')?.addEventListener('change', async e => {
    const v = lerNumero(e.target.value);
    if (Number.isNaN(v)) { aviso('Custo ADM: use só números (ex.: 185.000,00).', true); return; }
    await gravar('cb_meses', { ...m, custo_adm: v });
    desenhar();
  });
  alvo.querySelectorAll('[data-agro]').forEach(cx => cx.addEventListener('change', async () => {
    const it = todos('cb_itens').find(x => x.id === cx.dataset.agro);
    if (!it) return;
    await gravar('cb_itens', { ...it, lancado_agro: cx.checked });
    desenhar();
  }));
  $('cbAgroTodos').addEventListener('change', async e => {
    for (const it of itensDoMes(mesSel)) if (!!it.lancado_agro !== e.target.checked) await gravar('cb_itens', { ...it, lancado_agro: e.target.checked });
    desenhar();
  });
  alvo.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => editarPlantio(b.dataset.ed, desenhar)));
  $('cbFechar')?.addEventListener('click', async () => {
    if (!confirm(`Fechar o rateio de ${nomeMes(mesSel)}?\n\nO mês fica com cadeado: os números ficam travados e mudar o cadastro ou os parâmetros não altera mais este mês. "Lançado no Agro" continua podendo ser marcado. Só o administrador reabre.`)) return;
    await gravar('cb_meses', { ...m, status: 'fechado', fechado_por: meuNome(), fechado_em: new Date().toISOString() });
    aviso('Mês fechado.');
    desenhar();
  });
  $('cbReabrir')?.addEventListener('click', async () => {
    if (!confirm(`Reabrir o rateio de ${nomeMes(mesSel)}? O cadeado sai e o mês volta a seguir o cadastro e os parâmetros de agora.`)) return;
    await gravar('cb_meses', { ...m, status: 'aberto', fechado_por: null, fechado_em: null });
    desenhar();
  });
  $('cbImprimir').addEventListener('click', () => { desenharFolha(c); setTimeout(() => window.print(), 150); });
  $('cbZap').addEventListener('click', e => enviarWhatsapp(pdfRateio(c), resumoRateio(c), e.currentTarget));
  $('cbExcel').addEventListener('click', () => exportarExcel(c).catch(e => aviso(e.message || 'Não consegui gerar o Excel.', true)));
  desenharFolha(c);
}

function ligarNav() {
  $('cbMesAnt').addEventListener('click', () => irParaMes(mesAnterior(mesSel)));
  $('cbMesSeg').addEventListener('click', () => irParaMes(mesSeguinte(mesSel)));
  $('cbMesInput').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) irParaMes(e.target.value); });
}

/* =============== folha A4 (padrão SAKUMA; pé só com a marca LOP) =============== */
function desenharFolha(c) {
  const el = $('cbMesFolha');
  if (!el) return;
  const linhas = c.linhas.filter(l => l.incluido !== false);
  const porCultura = {};
  for (const l of linhas) {
    const k = l.culturaNome;
    porCultura[k] = porCultura[k] || { n: 0, area: 0, pct: 0, valor: 0 };
    porCultura[k].n++; porCultura[k].area += Number(l.area || 0); porCultura[k].pct += l.pct; porCultura[k].valor += l.valor || 0;
  }
  const temRS = c.custo !== null;
  el.innerHTML = `<div class="rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA">
      <div class="rel-tit"><h1>Rateio mensal por cultura · ${esc(nomeMes(mesSel))}</h1>
        <p>Direcionador do custo administrativo por plantio · peso = índice × área × (12 ÷ ciclo)${c.mes.status === 'fechado' ? ' · mês fechado' : ' · rascunho (mês aberto)'}</p></div>
    </div>
    <div class="rel-kpis">
      <div><span>Plantios</span><b>${c.incluidos}</b></div>
      <div><span>Área (ha)</span><b>${esc(num(c.area))}</b></div>
      <div><span>Culturas</span><b>${Object.keys(porCultura).length}</b></div>
      <div><span>Soma dos pesos</span><b>${esc(num(c.total, 0))}</b></div>
      <div><span>Custo ADM</span><b>${temRS ? esc(reais(c.custo)) : '—'}</b></div>
    </div>
    <p class="rel-secao">Por plantio</p>
    <table class="rel-tab"><thead><tr><th>Cód.</th><th>Plantio / talhão</th><th>Cultura</th><th class="dir">Área (ha)</th><th class="dir">Índice</th><th class="dir">Ciclo</th><th class="dir">Peso</th><th class="dir">%</th>${temRS ? '<th class="dir">R$</th>' : ''}<th class="ce">Mês</th></tr></thead>
    <tbody>${linhas.map(l => `<tr><td>${esc(l.talhao.cod_agro || '')}</td><td>${esc(l.talhao.nome)}</td><td>${esc(l.culturaNome)}</td>
      <td class="dir">${esc(num(l.area))}</td><td class="dir">${esc(num(l.indice, 0))}</td><td class="dir">${esc(l.ciclo)}</td><td class="dir">${esc(num(l.peso, 0))}</td>
      <td class="dir"><b>${esc(pct(l.pct))}</b></td>${temRS ? `<td class="dir">${esc(num(l.valor))}</td>` : ''}<td class="ce">${l.meses}º${l.limite ? '/' + l.limite : ''}</td></tr>`).join('')}
    </tbody>
    <tfoot><tr class="rel-total"><td></td><td>Total</td><td>${c.incluidos} plantios</td><td class="dir">${esc(num(c.area))}</td><td></td><td></td><td class="dir">${esc(num(c.total, 0))}</td><td class="dir">100%</td>${temRS ? `<td class="dir">${esc(num(c.custo))}</td>` : ''}<td></td></tr></tfoot></table>
    <p class="rel-secao">Por cultura</p>
    <table class="rel-tab rel-meia"><thead><tr><th>Cultura</th><th class="dir">Plantios</th><th class="dir">Área (ha)</th><th class="dir">%</th>${temRS ? '<th class="dir">R$</th>' : ''}</tr></thead>
    <tbody>${Object.entries(porCultura).sort((a, b) => b[1].pct - a[1].pct).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="dir">${v.n}</td><td class="dir">${esc(num(v.area))}</td><td class="dir"><b>${esc(pct(v.pct))}</b></td>${temRS ? `<td class="dir">${esc(num(v.valor))}</td>` : ''}</tr>`).join('')}</tbody></table>
    ${rodapeLop()}
  </div>`;
}

/* =============== Excel, no mesmo formato da aba da planilha =============== */
async function exportarExcel(c) {
  const linhas = c.linhas.filter(l => l.incluido !== false);
  const temRS = c.custo !== null;
  const colunas = [
    { rot: 'Cod. Agro', larg: 10 }, { rot: 'Talhão', larg: 42 }, { rot: 'Cultura', larg: 12 },
    { rot: 'Área', tipo: 'num', casas: 2, larg: 9 }, { rot: 'Indice', tipo: 'num', larg: 9 }, { rot: 'Ciclo', tipo: 'num', larg: 7 },
    { rot: 'Total (peso)', tipo: 'num', casas: 2, larg: 13 }, { rot: '%', tipo: 'pct', larg: 9 },
    ...(temRS ? [{ rot: 'ADM (R$)', tipo: 'num', casas: 2, larg: 13 }] : []),
    { rot: 'Meses no rateio', larg: 14 }, { rot: 'Lançado no Agro', larg: 12 },
  ];
  const aba = {
    nome: nomeMes(mesSel), titulo: 'Cálculo do Rateio Administrativo · ' + nomeMes(mesSel),
    subtitulo: 'SAKUMA Agronegócios · peso = índice × área × (12 ÷ ciclo) · % = peso ÷ soma dos pesos',
    colunas,
    linhas: linhas.map(l => [l.talhao.cod_agro || '', l.talhao.nome, l.culturaNome, Number(l.area), Number(l.indice), Number(l.ciclo),
      l.peso, l.pct, ...(temRS ? [l.valor] : []), l.meses + (l.limite ? ' de ' + l.limite : ''), l.lancado_agro ? 'sim' : 'não']),
    total: ['', 'Total', '', c.area, '', '', c.total, 1, ...(temRS ? [c.custo] : []), '', ''],
    notas: [c.mes.status === 'fechado' ? 'Mês fechado' + (c.mes.fechado_por ? ' por ' + c.mes.fechado_por : '') : 'Mês aberto (rascunho)',
      'Gerado pelo LOP - Gestão Rápida · Custo Base'],
  };
  const abaCult = {
    nome: 'Culturas', colunas: [{ rot: 'Culturas', larg: 14 }, { rot: 'Indice', tipo: 'num', larg: 9 }, { rot: 'Ciclo', tipo: 'num', larg: 7 }, { rot: 'Meses no rateio', larg: 14 }],
    linhas: culturas().map(x => [x.nome, Number(x.indice), Number(x.ciclo), x.permanente ? 'permanente' : String(mesesDaCultura(x))]),
  };
  await baixarXlsx('Rateio ADM ' + mesSel, [aba, abaCult]);
}

/* ---- PDF para o WhatsApp: o mesmo conteúdo da folha impressa ---- */
function porCulturaDe(c) {
  const g = {};
  for (const l of c.linhas) {
    const k = l.culturaNome;
    g[k] = g[k] || { n: 0, area: 0, pct: 0, valor: 0 };
    g[k].n++; g[k].area += Number(l.area || 0); g[k].pct += l.pct; g[k].valor += l.valor || 0;
  }
  return Object.entries(g).sort((a, b) => b[1].pct - a[1].pct);
}
function pdfRateio(c) {
  const temRS = c.custo !== null;
  return {
    titulo: 'Rateio mensal por cultura · ' + nomeMes(mesSel),
    subtitulo: 'Direcionador do custo administrativo por plantio · peso = índice × área × (12 ÷ ciclo)' + (c.mes.status === 'fechado' ? ' · mês fechado' : ' · rascunho (mês aberto)'),
    arquivo: 'Rateio ADM ' + mesSel,
    kpis: [['Plantios', c.incluidos], ['Área (ha)', num(c.area)], ['Culturas', porCulturaDe(c).length], ['Soma dos pesos', num(c.total, 0)], ['Custo ADM', temRS ? reais(c.custo) : '—']],
    secoes: [
      { titulo: 'Por plantio', dir: temRS ? [3, 4, 5, 6, 7, 8, 9] : [3, 4, 5, 6, 7, 8],
        head: ['Cód.', 'Plantio / talhão', 'Cultura', 'Área (ha)', 'Índice', 'Ciclo', 'Peso', '%', ...(temRS ? ['R$'] : []), 'Mês'],
        body: c.linhas.map(l => [l.talhao.cod_agro || '', l.talhao.nome || '', l.culturaNome, num(l.area), num(l.indice, 0), String(l.ciclo),
          num(l.peso, 0), pct(l.pct), ...(temRS ? [num(l.valor)] : []), l.meses + 'º' + (l.limite ? '/' + l.limite : '')]),
        total: ['', 'Total', c.incluidos + ' plantios', num(c.area), '', '', num(c.total, 0), '100%', ...(temRS ? [num(c.custo)] : []), ''] },
      { titulo: 'Por cultura', largura: 'meia', dir: temRS ? [1, 2, 3, 4] : [1, 2, 3],
        head: ['Cultura', 'Plantios', 'Área (ha)', '%', ...(temRS ? ['R$'] : [])],
        body: porCulturaDe(c).map(([k, v]) => [k, String(v.n), num(v.area), pct(v.pct), ...(temRS ? [num(v.valor)] : [])]) },
    ],
  };
}
function resumoRateio(c) {
  const top = porCulturaDe(c).slice(0, 4).map(([k, v]) => `${k} ${pct(v.pct, 1)}`).join(' · ');
  return `*Rateio ADM · ${nomeMes(mesSel)}* — SAKUMA\n${c.incluidos} plantios · ${num(c.area)} ha` +
    (c.custo !== null ? ` · custo ADM ${reais(c.custo)}` : '') + `\n${top}`;
}

export function abrirRateio() {
  if (!ouvindo) { window.addEventListener('custobase-dados', () => { if (!$('telaRtMes').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
export const mesSelecionado = () => mesSel;
