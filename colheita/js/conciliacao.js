// conciliacao.js — Conferência e Importar balança / cooperativa (20/10/2026).
//
// A rotina das planilhas de grãos e do café: no campo se lança a fichinha
// (ticket da fazenda); a cada 7–15 dias vem o relatório da balança (que liga
// o ticket da balança ao ticket da fazenda pelo "NÚMERO ROMANEIO
// PROPRIETÁRIO") e o da cooperativa (NF, lote, descontos). Aqui o app casa
// tudo pelo ticket, aponta divergência de data, placa, peso e NF, e copia os
// pesos oficiais para as cargas com um clique.
import { $, esc, pronto, carregando, todos, gravar, aviso, souAdmin, culturaSel, safraSel, campos, param, rotArea, Maiusc,
  cargasDa, plantio, nomePlantio, conferir, seloSt, ROT_ST, balancaSemCarga, dataBR, num, semAcento, lerNumero } from './dados.js';
import { editar as editarCarga } from './cargas.js';

let filtro = '';

/* ================================================================ conferência */
function desenharConf() {
  const alvo = $('cpConfCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  if (cult.conciliacao === 'nenhuma') { alvo.innerHTML = `<div class="vazio">${esc(cult.nome)} não tem conferência com balança ou cooperativa (mude em Parâmetros, se precisar).</div>`; return; }
  if (cult.conciliacao === 'coop') return desenharPagamentos(alvo, cult, saf);

  const cargas = cargasDa(saf.id);
  const linhas = cargas.map(c => ({ c, ...conferir(c, cult) }));
  const conta = st => linhas.filter(l => l.st === st).length;
  const semCarga = balancaSemCarga(saf.id, cult);
  const aplicaveis = linhas.filter(l => l.bal && precisaAplicar(l, cult));
  const vis = filtro ? linhas.filter(l => l.st === filtro) : linhas;
  const coop = cult.conciliacao === 'balanca_coop';
  const nBal = todos('cp_balanca').filter(b => b.cultura_id === cult.id && b.safra_id === saf.id).length;
  const nCoop = todos('cp_cooperativa').filter(b => b.cultura_id === cult.id && b.safra_id === saf.id).length;

  alvo.innerHTML = `
    <div class="cb-kpis">
      <div><span>Cargas lançadas</span><b>${cargas.length}</b><small>relatórios: ${nBal} da balança${coop ? ` · ${nCoop} da cooperativa` : ''}</small></div>
      <div class="cp-k-ok"><span>Conferidas</span><b>${conta('ok')}</b><small>batem com o relatório</small></div>
      <div class="cp-k-div"><span>Divergentes</span><b>${conta('div')}</b><small>data, placa, peso ou NF</small></div>
      <div class="cp-k-pend"><span>Aguardando</span><b>${conta('sem_bal') + conta('sem_coop')}</b><small>${conta('sem_bal')} sem balança${coop ? ` · ${conta('sem_coop')} sem cooperativa` : ''}</small></div>
      <div class="cp-k-div"><span>Na balança sem carga</span><b>${semCarga.length}</b><small>ticket sem lançamento no app</small></div>
    </div>
    <p class="dc-sem">Tolerâncias: data ±${esc(param(cult, 'tolerancia_data', 3))} dias · peso ±${esc(num(param(cult, 'tolerancia_peso_pct', 0.5), 1))}%${param(cult, 'conferir_nf', false) ? ' · confere NF' : ''} — mude em Parâmetros.</p>
    ${aplicaveis.length ? `<div class="aviso info cp-aplicar"><span><b>${aplicaveis.length}</b> ${aplicaveis.length === 1 ? 'carga tem' : 'cargas têm'} dados no relatório que ainda não estão na carga: ${esc(oQueFalta(aplicaveis, cult))}.</span>
      <button class="btn principal" type="button" id="cpAplicar">Trazer os pesos para as cargas</button></div>` : ''}
    ${semCarga.length ? `<h3 class="cb-secao">Na balança, sem lançamento no app <small>${semCarga.length}</small></h3>
      <div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Data</th><th>Ticket balança</th><th>Romaneio (ticket faz.)</th><th>Placa</th><th>NF</th><th class="dir">Bruto (kg)</th><th class="dir">Líquido (kg)</th><th></th></tr></thead>
      <tbody>${semCarga.map(b => `<tr><td>${dataBR(b.data)}</td><td>${esc(b.ticket)}</td><td>${esc(b.romaneio_prop || '')}</td><td>${esc(b.placa || '')}</td><td>${esc(b.nf || '')}</td><td class="dir">${num(b.peso_bruto, 0)}</td><td class="dir">${num(b.peso_liquido, 0)}</td>
        <td class="dir"><button class="btn mini" type="button" data-criar="${esc(b.id)}">Criar carga</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3 class="cb-secao">Cargas × relatórios</h3>
    <div class="barra" style="margin-top:0"><label class="campo">Mostrar<select id="cpConfFiltro"><option value="">Todas (${linhas.length})</option>
      ${['div', 'sem_bal', ...(coop ? ['sem_coop'] : []), 'ok'].map(s => `<option value="${s}"${s === filtro ? ' selected' : ''}>${ROT_ST[s][0]} (${conta(s)})</option>`).join('')}</select></label></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab cp-tab">
      <thead><tr><th>Data</th><th>Ticket faz.</th><th>Ticket bal.</th><th>Placa</th><th>${esc(Maiusc(rotArea(cult)))}</th><th class="dir">Líq. carga</th><th class="dir">Líq. balança</th>
        ${campos(cult).umidade ? '<th class="dir">% Umid.</th><th class="dir">% Imp.</th>' : ''}<th>NF</th>${coop ? '<th>Coop. (NF · lote)</th>' : ''}<th>Situação</th><th>Motivo</th><th></th></tr></thead>
      <tbody>${vis.map(l => { const c = l.c, b = l.bal, k = l.coop, p = plantio(c.plantio_id);
        return `<tr class="cp-st-${l.st}"><td>${dataBR(c.data)}</td><td>${esc(c.ticket_faz || '')}</td><td>${esc(c.ticket_balanca || (b ? b.ticket : ''))}</td><td>${esc(c.placa || '')}</td>
          <td>${p ? esc(nomePlantio(p)) : '<span class="cb-pin alerta">—</span>'}</td>
          <td class="dir">${num(c.peso_liquido, 0)}</td><td class="dir">${b ? num(b.peso_liquido, 0) : ''}</td>
          ${campos(cult).umidade ? `<td class="dir">${b && b.umidade_pct !== null && b.umidade_pct !== undefined ? num(b.umidade_pct, 1) : ''}</td><td class="dir">${b && b.impureza_pct !== null && b.impureza_pct !== undefined ? num(b.impureza_pct, 1) : ''}</td>` : ''}
          <td>${esc(c.nf || (b && b.nf) || '')}</td>${coop ? `<td>${k ? esc((k.nf || '') + (k.lote ? ' · ' + k.lote : '')) : ''}</td>` : ''}
          <td>${seloSt(l.st)}</td><td class="cp-motivo">${esc(l.msgs.join(' · '))}</td>
          <td class="dir"><button class="btn mini" type="button" data-editar="${esc(c.id)}">Abrir</button></td></tr>`; }).join('') || '<tr><td colspan="14" class="vazio">Nada aqui.</td></tr>'}</tbody>
    </table></div>`;

  $('cpConfFiltro').addEventListener('change', e => { filtro = e.target.value; desenharConf(); });
  $('cpAplicar')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    let n = 0;
    for (const l of aplicaveis) { await gravar('cp_cargas', aplicar(l, cult)); n++; }
    aviso(n + (n === 1 ? ' carga atualizada' : ' cargas atualizadas') + ' com os pesos do relatório.');
    desenharConf();
  });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editarCarga(b.dataset.editar)));
  alvo.querySelectorAll('[data-criar]').forEach(b => b.addEventListener('click', () => {
    const x = todos('cp_balanca').find(y => y.id === b.dataset.criar);
    if (!x) return;
    const k = todos('cp_cooperativa').find(y => String(y.ticket) === String(x.ticket));
    editarCarga(null, { data: x.data, placa: x.placa, ticket_faz: x.romaneio_prop, ticket_balanca: x.ticket, nf: x.nf || (k && k.nf),
      peso_entrada: x.peso_bruto, peso_liquido: x.peso_liquido, umidade_pct: x.umidade_pct, impureza_pct: x.impureza_pct,
      umidade_kg: x.umidade_kg, impureza_kg: x.impureza_kg, quebra_kg: x.quebrado_kg, lote: k && k.lote, nf_coop: k && k.nf });
  }));
}

/* O que o relatório traz que a carga ainda não tem. */
function novosValores(l, cult) {
  const c = l.c, b = l.bal, k = l.coop, v = {};
  const vazio = x => x === null || x === undefined || x === '';
  if (vazio(c.ticket_balanca) && b.ticket) v.ticket_balanca = b.ticket;
  const temPesoEntrada = campos(cult).peso_entrada || campos(cult).umidade;
  if (temPesoEntrada && vazio(c.peso_entrada) && b.peso_bruto) v.peso_entrada = b.peso_bruto;
  if (vazio(c.peso_liquido) && b.peso_liquido) v.peso_liquido = b.peso_liquido;
  if (campos(cult).umidade) {
    if (vazio(c.umidade_pct) && !vazio(b.umidade_pct)) v.umidade_pct = b.umidade_pct;
    if (vazio(c.impureza_pct) && !vazio(b.impureza_pct)) v.impureza_pct = b.impureza_pct;
    if (vazio(c.umidade_kg) && !vazio(b.umidade_kg)) v.umidade_kg = b.umidade_kg;
    if (vazio(c.impureza_kg) && !vazio(b.impureza_kg)) v.impureza_kg = b.impureza_kg;
    if (vazio(c.quebra_kg) && !vazio(b.quebrado_kg)) v.quebra_kg = b.quebrado_kg;
  }
  if (campos(cult).nf && vazio(c.nf) && (b.nf || (k && k.nf))) v.nf = b.nf || k.nf;
  if (k) {
    if (vazio(c.nf_coop) && k.nf) v.nf_coop = k.nf;
    if (campos(cult).lote && vazio(c.lote) && k.lote) v.lote = k.lote;
  }
  return v;
}
const ROT_CAMPO = { ticket_balanca: 'ticket da balança', peso_entrada: 'peso bruto', peso_liquido: 'peso líquido', umidade_pct: 'umidade',
  impureza_pct: 'impureza', umidade_kg: 'umidade', impureza_kg: 'impureza', quebra_kg: 'quebra', nf: 'NF', nf_coop: 'NF da cooperativa', lote: 'lote' };
function oQueFalta(lista, cult) {
  const conta = new Map();
  for (const l of lista) for (const k of Object.keys(novosValores(l, cult))) { const r = ROT_CAMPO[k] || k; conta.set(r, (conta.get(r) || 0) + 1); }
  return [...conta.entries()].map(([r, n]) => n === lista.length ? r : `${r} (${n})`).join(', ');
}
const precisaAplicar = (l, cult) => Object.keys(novosValores(l, cult)).length > 0;
function aplicar(l, cult) {
  const v = novosValores(l, cult);
  const r = { ...l.c, ...v };
  r.status_conc = conferir(r, cult).st;
  return r;
}

/* Batata: a "conferência" é a situação do pagamento na cooperativa. */
function desenharPagamentos(alvo, cult, saf) {
  const cargas = cargasDa(saf.id);
  const pend = cargas.filter(c => semAcento(c.situacao_pagto) !== 'PAGO');
  alvo.innerHTML = `
    <div class="cb-kpis"><div><span>Cargas</span><b>${cargas.length}</b><small>na safra</small></div>
      <div class="cp-k-ok"><span>Pagas</span><b>${cargas.length - pend.length}</b><small>pela cooperativa</small></div>
      <div class="cp-k-pend"><span>Pendentes</span><b>${pend.length}</b><small>sem pagamento registrado</small></div></div>
    <h3 class="cb-secao">Pagamento pendente</h3>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Data</th><th>Placa</th><th>Ticket faz.</th><th>Ticket coop.</th><th>${esc(Maiusc(rotArea(cult)))}</th><th class="dir">${esc(cult.unidade_nome)}</th><th></th></tr></thead>
    <tbody>${pend.map(c => `<tr><td>${dataBR(c.data)}</td><td>${esc(c.placa || '')}</td><td>${esc(c.ticket_faz || '')}</td><td>${esc(c.ticket_coop || '')}</td><td>${esc(nomePlantio(plantio(c.plantio_id)))}</td>
      <td class="dir">${num(c.quantidade, 0)}</td><td class="dir"><button class="btn mini" type="button" data-pago="${esc(c.id)}">Marcar pago hoje</button> <button class="btn mini" type="button" data-editar="${esc(c.id)}">Abrir</button></td></tr>`).join('')
      || '<tr><td colspan="7" class="vazio">Nenhuma carga com pagamento pendente.</td></tr>'}</tbody></table></div>`;
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editarCarga(b.dataset.editar)));
  alvo.querySelectorAll('[data-pago]').forEach(b => b.addEventListener('click', async () => {
    const c = todos('cp_cargas').find(x => x.id === b.dataset.pago);
    const d = new Date();
    await gravar('cp_cargas', { ...c, situacao_pagto: 'Pago', data_pagto: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') });
    aviso('Marcada como paga.'); desenharConf();
  }));
}

export function abrirConferencia() { desenharConf(); }

/* ================================================================ importar relatórios */
const chave = s => semAcento(s).replace(/[^A-Z0-9]/g, '');
/* Cabeçalhos aceitos (o primeiro que existir no arquivo vale). */
const MAPA = {
  balanca: {
    ticket: ['TICKET'], data: ['DATAENTRADA', 'DATA'], placa: ['PLACAVEICULO', 'PLACA'], item: ['ITEM', 'PRODUTO'],
    motorista: ['MOTORISTA'], fornecedor: ['FORNECEDOR'], obs: ['OBSERVACAO', 'OBS'],
    romaneio_prop: ['NUMEROROMANEIOPROPRIETARIO', 'ROMANEIOPROPRIETARIO', 'TICKETFAZ', 'TICKETFAZENDA'],
    peso_bruto: ['PESOSUBTOTALKG', 'PESOSUBTOTAL', 'PESOBRUTOKG'], peso_liquido: ['PESOLIQUIDOKG', 'PESOLIQUIDO'], desconto_kg: ['DESCONTOKG'],
    impureza_pct: ['IMPUREZAPERCENTUALPESO'], impureza_kg: ['IMPUREZAPESODESCONTADO'],
    umidade_pct: ['UMIDADEVALORDESCONTO'], umidade_kg: ['UMIDADEPESODESCONTADO'],
    quebrado_pct: ['QUEBRADOPERCENTUALPESO'], quebrado_kg: ['QUEBRADOPESODESCONTADO'],
  },
  cooperativa: {
    ticket: ['TICKET'], nf: ['NFDOCORIGEM', 'NF', 'NOTAFISCAL'], lote: ['LOTE'], data: ['DATA'], placa: ['PLACA'],
    material: ['TEXTOBREVEMATERIAL', 'MATERIAL'], propriedade: ['DESCPROPRIEDADE', 'PROPRIEDADE'], safra_coop: ['SAFRA'],
    entrada_bruta: ['ENTRADABRUTA'], impurezas: ['IMPUREZAS'], umidade: ['UMIDADE'], quebra: ['QUEBRA'],
    sacas_entrada: ['QUANTIDADEDEENTRADADESACAS'],
  },
};
const NUMS = new Set(['peso_bruto', 'peso_liquido', 'desconto_kg', 'impureza_pct', 'impureza_kg', 'umidade_pct', 'umidade_kg', 'quebrado_pct', 'quebrado_kg',
  'entrada_bruta', 'impurezas', 'umidade', 'quebra', 'sacas_entrada']);
function dataDe(v) {
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10); }
  return null;
}
const numDe = v => typeof v === 'number' ? v : (() => { const n = lerNumero(v); return n === null || Number.isNaN(n) ? null : n; })();
const txt = v => { if (v === null || v === undefined) return null; const s = (typeof v === 'number' && Number.isInteger(v)) ? String(v) : String(v).trim(); return s || null; };

/** Lê o arquivo e devolve { linhas, faltando, aba } já no formato da tabela. */
export async function lerRelatorio(arquivo, tipo, cult) {
  if (!window.XLSX) throw new Error('A leitura de Excel não carregou. Abra o app com internet uma vez.');
  const wb = window.XLSX.read(await arquivo.arrayBuffer(), { cellDates: true });
  const mapa = MAPA[tipo];
  let melhor = null;
  for (const aba of wb.SheetNames) {
    const m = window.XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: null, raw: true });
    for (let r = 0; r < Math.min(m.length, 15); r++) {
      const cab = (m[r] || []).map(chave);
      if (!cab.includes('TICKET')) continue;
      const pos = {};
      for (const [campo, nomes] of Object.entries(mapa)) { const i = nomes.map(n => cab.indexOf(n)).find(i => i >= 0); if (i !== undefined) pos[campo] = i; }
      const pontos = Object.keys(pos).length;
      if (!melhor || pontos > melhor.pontos) melhor = { aba, r, pos, m, pontos };
    }
  }
  if (!melhor) throw new Error('Não achei a coluna TICKET em nenhuma aba do arquivo.');
  const { m, r, pos } = melhor;
  const chaveCult = semAcento(cult.palavra_chave || cult.nome);
  const linhas = [];
  let outras = 0;
  for (const row of m.slice(r + 1)) {
    const tk = txt(row[pos.ticket]);
    if (!tk || !/\d/.test(tk)) continue;
    const reg = {};
    for (const [campo, i] of Object.entries(pos)) {
      const v = row[i];
      reg[campo] = campo === 'data' ? dataDe(v) : NUMS.has(campo) ? numDe(v) : txt(v);
    }
    const produto = semAcento(reg.item || reg.material || '');
    if (produto && chaveCult && !produto.includes(chaveCult)) { outras++; continue; }
    if (tipo === 'balanca') { const nf = String(reg.obs || '').match(/(\d{6,})/); reg.nf = nf ? nf[1] : null; delete reg.obs; }
    if (tipo === 'cooperativa' && reg.nf) { const x = String(reg.nf).match(/0*(\d+)/); reg.nf = x ? x[1] : reg.nf; }
    reg.ticket = tk.replace(/\D/g, '') || tk;
    linhas.push(reg);
  }
  const essenciais = tipo === 'balanca' ? ['peso_liquido', 'data'] : ['entrada_bruta', 'nf'];
  return { linhas, outras, aba: melhor.aba, faltando: essenciais.filter(e => pos[e] === undefined), colunas: Object.keys(pos) };
}

let lido = null;
function desenharImp() {
  const alvo = $('cpImpCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  const tipos = cult.conciliacao === 'balanca_coop' ? ['balanca', 'cooperativa'] : cult.conciliacao === 'balanca' ? ['balanca'] : [];
  if (!tipos.length) { alvo.innerHTML = `<div class="vazio">${esc(cult.nome)} não usa relatório de balança (conferência: ${esc(cult.conciliacao)}).</div>`; return; }
  const ja = t => todos(t === 'balanca' ? 'cp_balanca' : 'cp_cooperativa').filter(b => b.cultura_id === cult.id && b.safra_id === saf.id && b.ativo !== false);
  alvo.innerHTML = `
    <div class="grade">${tipos.map(t => `<div class="cp-imp-box">
      <h3 class="cb-secao">${t === 'balanca' ? 'Relatório da balança' : 'Relatório da cooperativa'}</h3>
      <p class="dc-sem">${ja(t).length} tickets já importados nesta safra${ja(t).length ? ' · último ' + dataBR(ja(t).map(x => x.data).sort().pop()) : ''}.</p>
      <label class="btn principal cp-arq">Escolher arquivo (.xlsx, .xls ou .csv)<input type="file" accept=".xlsx,.xls,.xlsm,.csv" data-tipo="${t}" hidden></label>
      ${ja(t).length && souAdmin() ? `<button class="btn mini perigo" type="button" data-limpar="${t}" style="margin-top:8px">Apagar os ${ja(t).length} tickets desta safra</button>` : ''}
    </div>`).join('')}</div>
    <div id="cpImpPrevia"></div>
    <p class="dc-sem">Só entram as linhas do produto <b>${esc(cult.palavra_chave || cult.nome)}</b> (coluna ITEM/Material) — mude a palavra-chave em Parâmetros. Ticket já importado é atualizado, não duplica.</p>`;

  alvo.querySelectorAll('input[type=file]').forEach(inp => inp.addEventListener('change', async () => {
    const arq = inp.files[0]; if (!arq) return;
    const tipo = inp.dataset.tipo;
    try {
      const r = await lerRelatorio(arq, tipo, cult);
      lido = { tipo, ...r, nome: arq.name };
      previa(cult, saf);
    } catch (e) { aviso('Não consegui ler o arquivo: ' + (e.message || e), true); }
    inp.value = '';
  }));
  alvo.querySelectorAll('[data-limpar]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Clique de novo para apagar'; return; }
    const t = b.dataset.limpar === 'balanca' ? 'cp_balanca' : 'cp_cooperativa';
    try { const n = await window.apagarLinhas(t, ja(b.dataset.limpar).map(x => x.id)); aviso(n + ' tickets apagados.'); }
    catch (e) { aviso(e.message || String(e), true); }
    desenharImp();
  }));
}

function previa(cult, saf) {
  const el = $('cpImpPrevia');
  if (!el || !lido) return;
  const tab = lido.tipo === 'balanca' ? 'cp_balanca' : 'cp_cooperativa';
  const existentes = new Map(todos(tab).map(x => [String(x.ticket), x]));
  const novos = lido.linhas.filter(l => !existentes.has(String(l.ticket))).length;
  const datas = lido.linhas.map(l => l.data).filter(Boolean).sort();
  el.innerHTML = `<div class="cartao cp-previa-imp">
    <h3 class="cb-secao">${esc(lido.nome)} <small>aba ${esc(lido.aba)}</small></h3>
    ${lido.faltando.length ? `<div class="aviso alerta">Não achei a(s) coluna(s): ${esc(lido.faltando.join(', '))}. O resto entra normalmente.</div>` : ''}
    <p><b>${lido.linhas.length}</b> tickets de ${esc(cult.nome)} (${novos} novos, ${lido.linhas.length - novos} já importados)${lido.outras ? ` · ${lido.outras} linhas de outros produtos ignoradas` : ''}${datas.length ? ` · de ${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}` : ''}.</p>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Ticket</th><th>Data</th><th>Placa</th>${lido.tipo === 'balanca' ? '<th>Romaneio</th><th class="dir">Bruto</th><th class="dir">Líquido</th><th class="dir">% Umid.</th>' : '<th>NF</th><th>Lote</th><th class="dir">Entrada bruta</th>'}</tr></thead>
    <tbody>${lido.linhas.slice(0, 8).map(l => `<tr><td>${esc(l.ticket)}</td><td>${dataBR(l.data)}</td><td>${esc(l.placa || '')}</td>${lido.tipo === 'balanca'
      ? `<td>${esc(l.romaneio_prop || '')}</td><td class="dir">${num(l.peso_bruto, 0)}</td><td class="dir">${num(l.peso_liquido, 0)}</td><td class="dir">${num(l.umidade_pct, 1)}</td>`
      : `<td>${esc(l.nf || '')}</td><td>${esc(l.lote || '')}</td><td class="dir">${num(l.entrada_bruta, 0)}</td>`}</tr>`).join('')}</tbody></table></div>
    ${lido.linhas.length > 8 ? `<p class="dc-sem">… e mais ${lido.linhas.length - 8}.</p>` : ''}
    <div class="barra"><button class="btn" type="button" id="cpImpCancelar">Cancelar</button><button class="btn principal" type="button" id="cpImpOk"${lido.linhas.length ? '' : ' disabled'}>Importar ${lido.linhas.length} tickets para ${esc(saf.nome)}</button><span class="dc-sem" id="cpImpProg"></span></div>
  </div>`;
  $('cpImpCancelar').onclick = () => { lido = null; el.innerHTML = ''; };
  $('cpImpOk').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    const regs = lido.linhas.map(l => ({ ...l, id: (existentes.get(String(l.ticket)) || {}).id || crypto.randomUUID(), cultura_id: cult.id, safra_id: saf.id, ativo: true, importado_em: new Date().toISOString() }));
    try {
      await window.gravarLote(tab, regs, { conflito: 'ticket', aoAvancar: (f, t) => { const p = $('cpImpProg'); if (p) p.textContent = f + ' de ' + t; } });
      aviso(regs.length + ' tickets importados. Veja a Conferência.');
      lido = null;
      window.abrirTelaColheita('cpConferencia');
    } catch (er) { aviso('Não consegui importar: ' + (er.message || er), true); b.disabled = false; }
  };
}

export function abrirImportar() { desenharImp(); if (lido) previa(culturaSel(), safraSel()); }
