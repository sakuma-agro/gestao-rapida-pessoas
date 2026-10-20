// rateio.js — Rateio mensal culturas › Rateio do mês (20/10/2026).
//
// Cada mês é como uma aba da planilha: a lista dos plantios que entram no
// rateio, com área, índice e ciclo copiados na hora. O mês novo nasce da
// cópia do anterior; quem completou o ciclo da cultura vem desmarcado
// (fora do rateio) e o aviso diz por quê (pedido dele, 20/10/2026).
// O custo ADM do mês é opcional: sem ele sai só o % (direcionador).
import { $, esc, pronto, carregando, todos, gravar, aviso, souAdmin, meuNome, lerNumero, num, pct, reais,
  mes, meses, ultimoMes, mesAtual, mesAnterior, mesSeguinte, nomeMes, mesCurto, idItem, itensDoMes, mesFechado,
  calcularMes, mesesParticipados, mesesDaCultura, situacaoCiclo, talhoes, talhao, cultura, culturas, nomeCurto, dataHora, seloFechado } from './dados.js';
import { etiquetaMeses, novoPlantioModal, editar as editarPlantio } from './talhoes.js';
import { baixarXlsx } from '../../js/excel.js';

let ouvindo = false;
let mesSel = null;
let soIncluidos = false;

export function irParaMes(m) { mesSel = m; desenhar(); }

function desenhar() {
  const alvo = $('cbMesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; $('cbMesFolha').innerHTML = ''; return; }
  if (!mesSel) mesSel = ultimoMes() || mesAtual();
  const m = mes(mesSel);
  const existentes = meses().map(x => x.id);

  const cabecalho = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn mini" type="button" id="cbMesAnt" title="mês anterior">◀</button>
        <label class="campo">Mês do rateio <input type="month" id="cbMesInput" value="${esc(mesSel)}"></label>
        <button class="btn mini" type="button" id="cbMesSeg" title="mês seguinte">▶</button>
      </div>
      <div class="cb-mes-estado">${m
        ? (m.status === 'fechado'
          ? seloFechado(m.fechado_por, m.fechado_em)
          : '<span class="tag alerta">aberto</span>')
        : '<span class="tag neutra">mês ainda não criado</span>'}</div>
    </div>`;

  if (!m) {
    const anteriores = existentes.filter(x => x < mesSel);
    const base = anteriores.length ? anteriores[anteriores.length - 1] : (existentes.length ? existentes[existentes.length - 1] : null);
    alvo.innerHTML = cabecalho + `
      <div class="cb-vazio-mes">
        <p><b>${esc(nomeMes(mesSel))}</b> ainda não tem rateio.</p>
        ${base ? `<p class="dc-sem">Criar a partir de <b>${esc(nomeMes(base))}</b>: copia os plantios daquele mês; quem completou o ciclo da cultura vem desmarcado, para sair do rateio.</p>` : '<p class="dc-sem">Não há mês anterior para copiar: o mês nasce vazio e você adiciona os plantios.</p>'}
        <div class="barra">
          ${base ? `<button class="btn principal" type="button" id="cbCriarCopia">Criar a partir de ${esc(mesCurto(base))}</button>` : ''}
          <button class="btn" type="button" id="cbCriarVazio">Criar mês vazio</button>
        </div>
      </div>`;
    $('cbMesFolha').innerHTML = '';
    ligarNav();
    $('cbCriarCopia')?.addEventListener('click', () => criarMes(mesSel, base));
    $('cbCriarVazio').addEventListener('click', () => criarMes(mesSel, null));
    return;
  }

  const c = calcularMes(mesSel);
  const fechado = m.status === 'fechado';
  const linhas = soIncluidos ? c.linhas.filter(l => l.incluido !== false) : c.linhas;
  const completaram = c.linhas.filter(l => l.incluido !== false && situacaoCiclo(l.meses, l.limite) === 'ultimo');
  const passaram = c.linhas.filter(l => l.incluido !== false && situacaoCiclo(l.meses, l.limite) === 'passou');
  const fora = c.linhas.filter(l => l.incluido === false);
  const foraDoMes = talhoes().filter(t => t.ativo !== false && !c.linhas.some(l => l.talhao_id === t.id));

  alvo.innerHTML = cabecalho + `
    <div class="cb-kpis">
      <div><span>Plantios no rateio</span><b>${c.incluidos}</b><small>${fora.length ? fora.length + ' fora' : 'nenhum fora'}</small></div>
      <div><span>Área (ha)</span><b>${esc(num(c.area))}</b></div>
      <div><span>Soma dos pesos</span><b>${esc(num(c.total, 0))}</b><small>índice × área × 12 ÷ ciclo</small></div>
      <div class="cb-kpi-custo"><span>Custo ADM do mês (R$)</span>
        <input type="text" id="cbCusto" inputmode="decimal" placeholder="opcional" value="${c.custo !== null ? esc(num(c.custo)) : ''}"${fechado ? ' disabled' : ''}>
        <small>${c.custo !== null ? 'rateado pelo %' : 'sem valor: sai só o %'}</small></div>
    </div>
    ${completaram.length || passaram.length ? `<div class="aviso info cb-aviso">
      ${completaram.length ? `<b>Atenção:</b> ${completaram.map(l => `${esc(l.talhao.nome)} (${esc(l.culturaNome)}, ${l.meses}º mês)`).join(', ')} ${completaram.length === 1 ? 'completou' : 'completaram'} o ciclo da cultura — ${completaram.length === 1 ? 'sai' : 'saem'} do rateio no próximo mês.` : ''}
      ${passaram.length ? `<br><b>Passou do ciclo:</b> ${passaram.map(l => `${esc(l.talhao.nome)} (${l.meses} meses, limite ${l.limite})`).join(', ')} — confira se ainda deve${passaram.length === 1 ? '' : 'm'} entrar.` : ''}
    </div>` : ''}
    <div class="barra entre naoimprimir">
      <div class="barra" style="margin:0">
        ${fechado ? '' : `<label class="campo">Adicionar plantio cadastrado
          <select id="cbAddTalhao"><option value="">escolha…</option>${foraDoMes.map(t => `<option value="${esc(t.id)}">${esc(t.cod_agro ? t.cod_agro + ' · ' : '')}${esc(t.nome)} · ${esc(num(t.area))} ha</option>`).join('')}</select></label>
        <button class="btn" type="button" id="cbNovoPlantio">+ Novo plantio</button>`}
        <label class="cb-check"><input type="checkbox" id="cbSoInc"${soIncluidos ? ' checked' : ''}> só os que entram</label>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="cbExcel">Exportar Excel</button>
        <button class="btn" type="button" id="cbImprimir">Imprimir / PDF</button>
        ${fechado ? (souAdmin() ? '<button class="btn" type="button" id="cbReabrir">Reabrir mês</button>' : '')
                  : '<button class="btn principal" type="button" id="cbFechar">Fechar mês</button>'}
      </div>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab cb-rateio">
      <thead><tr>
        <th class="ce" title="entra no rateio">✓</th><th>Cód.</th><th>Plantio / talhão</th><th>Cultura</th>
        <th class="dir">Área (ha)</th><th class="dir">Índice</th><th class="dir">Ciclo</th><th class="dir">Peso</th>
        <th class="dir">%</th>${c.custo !== null ? '<th class="dir">R$</th>' : ''}<th>Meses no rateio</th><th></th>
      </tr></thead>
      <tbody>${linhas.map(l => `<tr class="${l.incluido === false ? 'cb-fora' : ''}" data-id="${esc(l.id)}">
        <td class="ce"><input type="checkbox" data-inc="${esc(l.id)}"${l.incluido !== false ? ' checked' : ''}${fechado ? ' disabled' : ''}></td>
        <td>${esc(l.talhao.cod_agro || '')}</td>
        <td><b>${esc(l.talhao.nome || '—')}</b>${l.talhao.fazenda ? `<small class="dc-sem"> · ${esc(nomeCurto(l.talhao.fazenda))}</small>` : ''}</td>
        <td>${esc(l.culturaNome)}</td>
        <td class="dir">${fechado ? esc(num(l.area)) : `<input class="dc-mini cb-area" data-area="${esc(l.id)}" inputmode="decimal" value="${esc(num(l.area))}">`}</td>
        <td class="dir">${esc(num(l.indice, 0))}</td>
        <td class="dir">${esc(l.ciclo)}</td>
        <td class="dir">${l.incluido === false ? '—' : esc(num(l.peso, 0))}</td>
        <td class="dir"><b>${l.incluido === false ? '—' : esc(pct(l.pct))}</b></td>
        ${c.custo !== null ? `<td class="dir">${l.incluido === false ? '—' : esc(reais(l.valor))}</td>` : ''}
        <td>${etiquetaMeses(l.incluido === false ? mesesParticipados(l.talhao_id, mesSel) : l.meses, l.limite, { curta: true })}</td>
        <td class="dir naoimprimir"><button class="btn mini" type="button" data-ed="${esc(l.talhao_id)}" title="editar o plantio">✎</button>${fechado ? '' : `<button class="btn mini perigo" type="button" data-tirar="${esc(l.id)}" title="tirar deste mês">×</button>`}</td>
      </tr>`).join('') || `<tr><td colspan="12" class="vazio">Nenhum plantio neste mês. Adicione acima.</td></tr>`}
      </tbody>
      <tfoot><tr class="dc-total">
        <td></td><td></td><td>Total</td><td>${c.incluidos} ${c.incluidos === 1 ? 'plantio' : 'plantios'}</td>
        <td class="dir">${esc(num(c.area))}</td><td></td><td></td><td class="dir">${esc(num(c.total, 0))}</td>
        <td class="dir">100%</td>${c.custo !== null ? `<td class="dir">${esc(reais(c.custo))}</td>` : ''}<td></td><td></td>
      </tr></tfoot>
    </table></div>
    <p class="dc-sem" style="margin-top:8px">Desmarcar o ✓ deixa o plantio no mês, fora da conta (ex.: completou o ciclo). O × tira a linha do mês. O histórico de meses conta só os meses em que o plantio entrou na conta.</p>`;

  ligarNav();
  $('cbSoInc').addEventListener('change', e => { soIncluidos = e.target.checked; desenhar(); });
  $('cbCusto')?.addEventListener('change', async e => {
    const v = lerNumero(e.target.value);
    if (Number.isNaN(v)) { aviso('Custo ADM: use só números (ex.: 185.000,00).', true); return; }
    await gravar('cb_meses', { ...m, custo_adm: v });
    desenhar();
  });
  $('cbAddTalhao')?.addEventListener('change', async e => {
    const t = talhao(e.target.value);
    if (!t) return;
    await adicionarAoMes(mesSel, t);
    aviso('Plantio adicionado ao mês.');
    desenhar();
  });
  $('cbNovoPlantio')?.addEventListener('click', () => novoPlantioModal(async reg => {
    await adicionarAoMes(mesSel, reg);
    aviso('Plantio criado e adicionado ao mês.');
    desenhar();
  }));
  alvo.querySelectorAll('[data-inc]').forEach(cx => cx.addEventListener('change', async () => {
    const it = todos('cb_itens').find(x => x.id === cx.dataset.inc);
    if (!it) return;
    await gravar('cb_itens', { ...it, incluido: cx.checked });
    desenhar();
  }));
  alvo.querySelectorAll('[data-area]').forEach(inp => inp.addEventListener('change', async () => {
    const it = todos('cb_itens').find(x => x.id === inp.dataset.area);
    const v = lerNumero(inp.value);
    if (!it) return;
    if (v === null || Number.isNaN(v)) { aviso('Área: use só números.', true); inp.value = num(it.area); return; }
    await gravar('cb_itens', { ...it, area: v });
    desenhar();
  }));
  alvo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
    const it = todos('cb_itens').find(x => x.id === b.dataset.tirar);
    if (!it) return;
    const t = talhao(it.talhao_id) || {};
    if (!confirm(`Tirar "${t.nome || 'plantio'}" do rateio de ${nomeMes(mesSel)}? O plantio continua cadastrado.`)) return;
    try { await window.apagarItemMes(it.id); aviso('Tirado deste mês.'); }
    catch (e) { aviso('Não consegui tirar agora: ' + (e.message || e), true); }
    desenhar();
  }));
  alvo.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => editarPlantio(b.dataset.ed, desenhar)));
  $('cbFechar')?.addEventListener('click', async () => {
    if (!confirm(`Fechar o rateio de ${nomeMes(mesSel)}?\n\nO mês fica com cadeado: os números ficam travados e mudar o índice ou o ciclo de uma cultura não altera mais este mês. Só o administrador reabre.`)) return;
    await gravar('cb_meses', { ...m, status: 'fechado', fechado_por: meuNome(), fechado_em: new Date().toISOString() });
    aviso('Mês fechado.');
    desenhar();
  });
  $('cbReabrir')?.addEventListener('click', async () => {
    if (!confirm(`Reabrir o rateio de ${nomeMes(mesSel)}? O cadeado sai e o mês volta a aceitar mudanças.`)) return;
    await gravar('cb_meses', { ...m, status: 'aberto', fechado_por: null, fechado_em: null });
    desenhar();
  });
  $('cbImprimir').addEventListener('click', () => { desenharFolha(c); setTimeout(() => window.print(), 150); });
  $('cbExcel').addEventListener('click', () => exportarExcel(c).catch(e => aviso(e.message || 'Não consegui gerar o Excel.', true)));
  desenharFolha(c);
}

function ligarNav() {
  $('cbMesAnt').addEventListener('click', () => irParaMes(mesAnterior(mesSel)));
  $('cbMesSeg').addEventListener('click', () => irParaMes(mesSeguinte(mesSel)));
  $('cbMesInput').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) irParaMes(e.target.value); });
}

/** Põe um plantio no mês com os números de agora (área padrão, índice e ciclo da cultura). */
async function adicionarAoMes(mesId, t) {
  const c = cultura(t.cultura_id) || {};
  const id = idItem(mesId, t.id);
  const ja = todos('cb_itens').find(x => x.id === id);
  if (ja) { if (ja.incluido === false) await gravar('cb_itens', { ...ja, incluido: true }); return; }
  await gravar('cb_itens', { id, mes: mesId, talhao_id: t.id, cultura_id: t.cultura_id || null,
    area: Number(t.area || 0), indice: Number(c.indice || 0), ciclo: Number(c.ciclo || 1), incluido: true });
}

/** Cria o mês; com `base`, copia os plantios dele. Quem completou o ciclo vem desmarcado. */
async function criarMes(mesId, base) {
  await gravar('cb_meses', { id: mesId, status: 'aberto', custo_adm: null });
  let desmarcados = [];
  if (base) {
    for (const it of itensDoMes(base)) {
      if (it.incluido === false) continue;              // já estava fora: não volta
      const t = talhao(it.talhao_id);
      if (!t || t.ativo === false) continue;             // encerrado: não entra
      const c = cultura(it.cultura_id || t.cultura_id) || {};
      const n = mesesParticipados(t.id, base);
      const lim = mesesDaCultura(c);
      const entra = !(lim && n >= lim);
      if (!entra) desmarcados.push(t.nome);
      await gravar('cb_itens', { id: idItem(mesId, t.id), mes: mesId, talhao_id: t.id, cultura_id: t.cultura_id || it.cultura_id || null,
        area: Number(it.area || 0), indice: Number(c.indice ?? it.indice ?? 0), ciclo: Number(c.ciclo ?? it.ciclo ?? 1), incluido: entra });
    }
  }
  aviso(base ? `Mês criado a partir de ${mesCurto(base)}.${desmarcados.length ? ' Fora do rateio por ciclo completo: ' + desmarcados.join(', ') + '.' : ''}` : 'Mês criado vazio.');
  desenhar();
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
    <div class="rel-pe"><small>Rateio ADM · ${esc(nomeMes(mesSel))} · emitido em ${new Date().toLocaleDateString('pt-BR')}</small><img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
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
    { rot: 'Meses no rateio', larg: 14 },
  ];
  const aba = {
    nome: nomeMes(mesSel), titulo: 'Cálculo do Rateio Administrativo · ' + nomeMes(mesSel),
    subtitulo: 'SAKUMA Agronegócios · peso = índice × área × (12 ÷ ciclo) · % = peso ÷ soma dos pesos',
    colunas,
    linhas: linhas.map(l => [l.talhao.cod_agro || '', l.talhao.nome, l.culturaNome, Number(l.area), Number(l.indice), Number(l.ciclo),
      l.peso, l.pct, ...(temRS ? [l.valor] : []), l.meses + (l.limite ? ' de ' + l.limite : '')]),
    total: ['', 'Total', '', c.area, '', '', c.total, 1, ...(temRS ? [c.custo] : []), ''],
    notas: [c.mes.status === 'fechado' ? 'Mês fechado' + (c.mes.fechado_por ? ' por ' + c.mes.fechado_por : '') : 'Mês aberto (rascunho)',
      'Gerado pelo LOP - Gestão Rápida · Custo Base'],
  };
  const abaCult = {
    nome: 'Culturas', colunas: [{ rot: 'Culturas', larg: 14 }, { rot: 'Indice', tipo: 'num', larg: 9 }, { rot: 'Ciclo', tipo: 'num', larg: 7 }, { rot: 'Meses no rateio', larg: 14 }],
    linhas: culturas().map(x => [x.nome, Number(x.indice), Number(x.ciclo), x.permanente ? 'permanente' : String(mesesDaCultura(x))]),
  };
  await baixarXlsx('Rateio ADM ' + mesSel, [aba, abaCult]);
}

export function abrirRateio() {
  if (!ouvindo) { window.addEventListener('custobase-dados', () => { if (!$('telaRtMes').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
export const mesSelecionado = () => mesSel;
