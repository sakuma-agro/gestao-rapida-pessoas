// horimetros.js — Custo Base › Conferência de horímetros (09/11/2026, pedido do Guilherme).
// Trazido do HTML "Conferência de Horímetros — SAKUMA": joga-se o PDF do
// relatório "Operações Mecanizadas Analítico" e a tela mostra, por máquina,
// onde o Fim de um lançamento não bate com o Início do seguinte — igual ao HTML.
// Uma conferência por mês (cb_hor_conf, id 'AAAA-MM'); as marcas "corrigido"
// e a observação ficam em cb_hor_marcas e valem para toda a equipe.
// O PDF é lido no próprio aparelho (pdf.js em ../vendor/pdfjs/).
// A tarefa mensal do Rastro (dia 10) lê esta conferência: Em andamento quando
// existe, Concluída quando não sobra diferença pendente.
import { $, esc, pronto, carregando, todos, gravar, aviso, nomeMes, mesAtual, mesAnterior, meuNome } from './dados.js';

/* ================= núcleo de leitura (igual ao HTML, validado na Realtec) ================= */
function linhasDosItens(items) {
  const kept = items.filter(it => it && typeof it.str === 'string' && it.str.length);
  kept.sort((a, b) => { const dy = b.y - a.y; return Math.abs(dy) > 2.2 ? dy : a.x - b.x; });
  const lines = []; let cur = null, curY = null;
  for (const t of kept) {
    if (cur === null || Math.abs(t.y - curY) > 2.2) { if (cur) lines.push(cur); cur = { parts: [], endX: null }; curY = t.y; }
    if (cur.endX !== null && t.x - cur.endX > 1.2) cur.parts.push(' ');
    cur.parts.push(t.str); cur.endX = t.x + (t.width || 0);
  }
  if (cur) lines.push(cur);
  return lines.map(l => l.parts.join('').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const brNum = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
const RE_MAQ = /^Bem:\s*(.+?)\s+Respons/;
const RE_LIN = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+([\d.]+,\d{4})\s+([\d.]+,\d{4})\s+([\d.]+,\d{4})\s+([\d.]+,\d{4})/;
export function lerRelatorio(lines) {
  const segs = []; let cur = null;
  for (const line of lines) {
    const m = RE_MAQ.exec(line);
    if (m) { cur = { machine: m[1].trim(), rows: [] }; segs.push(cur); continue; }
    if (!cur) continue;
    const r = RE_LIN.exec(line);
    if (r) cur.rows.push({ data: r[1], doc: r[3], inicioTxt: r[4], fimTxt: r[5], inicio: brNum(r[4]), fim: brNum(r[5]) });
  }
  return segs;
}
const r4 = n => Math.round(n * 10000) / 10000;
function tipoDif(diff, ini) {
  if (ini === 0) return 'Indicador zerado';
  if (diff < -100) return 'Reinício do indicador';
  if (diff < 0) return 'Recuo do indicador';
  if (diff > 100) return 'Salto grande';
  return 'Horas não lançadas';
}
/** Fim de cada linha × Início da seguinte, na mesma máquina e no mesmo arquivo. */
export function calcularDiferencas(segs) {
  const por = {}, ordem = [];
  for (const seg of segs) {
    if (!por[seg.machine]) { por[seg.machine] = { machine: seg.machine, rowCount: 0, gaps: [] }; ordem.push(seg.machine); }
    const acc = por[seg.machine];
    acc.rowCount += seg.rows.length;
    for (let i = 0; i < seg.rows.length - 1; i++) {
      const a = seg.rows[i], b = seg.rows[i + 1], diff = r4(b.inicio - a.fim);
      if (Math.abs(diff) > 0.0001) acc.gaps.push({ dataFim: a.data, docFim: a.doc, fimTxt: a.fimTxt, dataIni: b.data, docIni: b.doc, inicioTxt: b.inicioTxt, diff, tipo: tipoDif(diff, b.inicio) });
    }
  }
  return ordem.map(m => por[m]);
}
const chaveDe = (m, g) => [m, g.dataFim, g.docFim, g.fimTxt, g.dataIni, g.docIni, g.inicioTxt].join('|');

/* ================= leitura do PDF ================= */
let pdfjs = null;
async function lib() {
  if (pdfjs) return pdfjs;
  await import('../../vendor/pdfjs/pdf.min.mjs');
  pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
async function lerPdf(file, aoPaginar) {
  const L = await lib();
  const doc = await L.getDocument({ data: await file.arrayBuffer() }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter(it => it.transform).map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width || 0 }));
    linhasDosItens(items).forEach(l => linhas.push(l));
    aoPaginar && aoPaginar(p, doc.numPages);
  }
  return linhas;
}

/* ================= estado da tela ================= */
const est = { mes: mesAnterior(mesAtual()), q: '', mostrar: 'all', ordem: 'count', tol: 0, abertos: {}, lendo: null, erro: '', trocar: false };
const conf = id => todos('cb_hor_conf').find(c => c.id === id) || null;
const marca = k => todos('cb_hor_marcas').find(m => m.chave === k) || null;
const ok = (m, g) => !!marca(chaveDe(m, g))?.ok;
const fmt = (n, d = 4) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const maquinasDe = c => (c?.maquinas || []).map(m => ({ ...m, gaps: (m.gaps || []).filter(g => Math.abs(g.diff) > Math.max(est.tol, 0.0001)) }));

/* Guarda no mês quantas diferenças estão corrigidas (o Rastro lê isto). */
async function atualizarResumo(c) {
  const ms = c.maquinas || [];
  let dif = 0, cor = 0;
  for (const m of ms) for (const g of m.gaps || []) { dif++; if (ok(m.machine, g)) cor++; }
  if (c.diferencas !== dif || c.corrigidas !== cor) await gravar('cb_hor_conf', { ...c, diferencas: dif, corrigidas: cor });
}

async function importar(files) {
  const pdfs = [...files].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (!pdfs.length) { est.erro = 'Escolha um arquivo <b>PDF</b> do relatório Operações Mecanizadas Analítico.'; desenhar(); return; }
  const mes = est.mes;
  if (conf(mes) && !confirm(`${nomeMes(mes)} já tem conferência. Trocar pelo PDF novo? As marcas de corrigido das diferenças que continuarem iguais ficam.`)) return;
  est.erro = '';
  let segs = []; const arquivos = [];
  try {
    for (let k = 0; k < pdfs.length; k++) {
      const f = pdfs[k];
      est.lendo = { txt: 'Lendo ' + f.name + '…', pct: k / pdfs.length * 100 }; desenhar();
      const linhas = await lerPdf(f, (p, tot) => { est.lendo = { txt: `Lendo ${f.name} — página ${p} de ${tot}`, pct: (k + p / tot) / pdfs.length * 100 }; pintarStatus(); });
      const s = lerRelatorio(linhas);
      arquivos.push({ name: f.name, machines: s.length, rows: s.reduce((n, x) => n + x.rows.length, 0) });
      segs = segs.concat(s);
    }
  } catch (e) {
    est.lendo = null;
    est.erro = 'Não consegui ler este PDF. Verifique se é o relatório <b>Operações Mecanizadas Analítico</b> gerado pelo sistema (não uma foto ou digitalização). Detalhe técnico: ' + esc(e?.message || e);
    desenhar(); return;
  }
  est.lendo = null;
  const linhas = segs.reduce((n, s) => n + s.rows.length, 0);
  if (!linhas) { est.erro = 'Li o arquivo, mas não encontrei lançamentos com as colunas <b>Início</b> e <b>Fim</b>. Gere o relatório <b>Operações Mecanizadas Analítico</b> em PDF direto do sistema e tente de novo.'; desenhar(); return; }
  const maquinas = calcularDiferencas(segs);
  const c = await gravar('cb_hor_conf', { ...(conf(mes) || {}), id: mes, arquivos, maquinas, linhas, diferencas: 0, corrigidas: 0, criado_por: meuNome() || null, criado_em: new Date().toISOString() });
  await atualizarResumo(c);
  est.trocar = false; est.abertos = {};
  aviso(`Conferência de ${nomeMes(mes)} guardada: ${maquinas.reduce((n, m) => n + m.gaps.length, 0)} diferença(s) em ${maquinas.length} máquinas.`);
  desenhar();
}

async function marcar(mes, maq, g, mudar) {
  const k = chaveDe(maq, g), m = marca(k);
  await gravar('cb_hor_marcas', { ...(m || { chave: k, ok: false, obs: null }), mes, ...mudar, atualizado_por: meuNome() || null });
  const c = conf(mes); if (c) await atualizarResumo(c);
}

/* ================= desenho ================= */
function pintarStatus() {
  const el = $('hzStatus'); if (!el || !est.lendo) return;
  el.hidden = false;
  el.querySelector('span').textContent = est.lendo.txt;
  el.querySelector('.hz-bar i').style.width = Math.round(est.lendo.pct) + '%';
}
function mesesComConf() { return todos('cb_hor_conf').map(c => c.id).sort().reverse(); }

function blocoImport(c) {
  return `<div class="hz-drop" id="hzDrop" role="button" tabindex="0" aria-label="Selecionar o PDF do relatório">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#84BD00" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
      <div class="big">${c ? 'Trocar o PDF de ' + esc(nomeMes(est.mes)) : 'Toque aqui para escolher o PDF de ' + esc(nomeMes(est.mes))}</div>
      <div class="sub">ou arraste o arquivo nesta área · pode enviar vários PDFs de uma vez</div>
      <input type="file" id="hzFile" accept="application/pdf,.pdf" multiple hidden>
    </div>
    <p class="dc-sem" style="margin:8px 2px 0">Relatório <b>Operações Mecanizadas Analítico</b> em PDF. O arquivo é lido no próprio aparelho; o resultado e as marcas ficam guardados no app para a equipe.${c ? ' <button class="btn mini" type="button" id="hzCancTroca">Cancelar</button>' : ''}</p>
    <div class="hz-status" id="hzStatus" ${est.lendo ? '' : 'hidden'}><span>${esc(est.lendo?.txt || '')}</span><div class="hz-bar"><i style="width:${Math.round(est.lendo?.pct || 0)}%"></i></div></div>
    ${est.erro ? `<div class="aviso erro" style="margin-top:12px">${est.erro}</div>` : ''}`;
}

function ordenadas(ms) {
  const arr = ms.filter(m => m.gaps.length);
  if (est.ordem === 'count') arr.sort((a, b) => b.gaps.length - a.gaps.length || a.machine.localeCompare(b.machine, 'pt-BR'));
  else if (est.ordem === 'size') { const big = m => Math.max(...m.gaps.map(g => Math.abs(g.diff))); arr.sort((a, b) => big(b) - big(a)); }
  else if (est.ordem === 'name') arr.sort((a, b) => a.machine.localeCompare(b.machine, 'pt-BR', { numeric: true }));
  return arr;
}
function visiveis(m) {
  const q = est.q.trim().toLowerCase(), hitMaq = q && m.machine.toLowerCase().includes(q);
  return m.gaps.filter(g => {
    const o = ok(m.machine, g);
    if (est.mostrar === 'pend' && o) return false;
    if (est.mostrar === 'ok' && !o) return false;
    if (q && !hitMaq && !(g.docFim + ' ' + g.docIni + ' ' + g.dataFim + ' ' + g.dataIni + ' ' + g.tipo).toLowerCase().includes(q)) return false;
    return true;
  });
}
function tabela(maq, gaps) {
  return `<table class="hz-gaps"><thead><tr><th>Data (Fim)</th><th>Doc. (Fim)</th><th>Fim</th><th>Data (Início)</th><th>Doc. (Início)</th><th>Início</th><th>Diferença</th><th>Tipo</th><th>Status</th><th>Observação</th></tr></thead><tbody>${gaps.map(g => {
    const k = chaveDe(maq, g), m = marca(k), o = !!m?.ok;
    return `<tr class="${o ? 'fixed' : ''}">
      <td data-label="Data (Fim)" class="num">${esc(g.dataFim)}</td><td data-label="Doc. (Fim)" class="num">${esc(g.docFim)}</td><td data-label="Horímetro Fim" class="num">${esc(g.fimTxt)}</td>
      <td data-label="Data (Início)" class="num">${esc(g.dataIni)}</td><td data-label="Doc. (Início)" class="num">${esc(g.docIni)}</td><td data-label="Horímetro Início" class="num">${esc(g.inicioTxt)}</td>
      <td data-label="Diferença (h)" class="diff c-diff ${g.diff < 0 ? 'neg' : 'pos'}">${g.diff > 0 ? '+' : ''}${fmt(g.diff)}</td>
      <td data-label="Tipo" class="c-tipo"><span class="hz-tag">${esc(g.tipo)}</span></td>
      <td data-label="Status" class="c-status"><label class="hz-chk${o ? ' on' : ''}"><input type="checkbox" data-k="${esc(k)}"${o ? ' checked' : ''}> ${o ? 'Corrigido' : 'Pendente'}</label>${o && m.atualizado_por ? `<small class="dc-sem"> · ${esc(m.atualizado_por)}</small>` : ''}</td>
      <td data-label="Observação" class="c-obs"><input class="hz-obs" type="text" data-obs="${esc(k)}" value="${esc(m?.obs || '')}" placeholder="motivo / o que foi ajustado"></td>
    </tr>`; }).join('')}</tbody></table>`;
}

let idx = new Map(); // chave -> {maq, g}
function desenhar() {
  const alvo = $('hzCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const c = conf(est.mes);
  const meses = [...new Set([est.mes, ...mesesComConf()])].sort().reverse();
  const topo = `<div class="cb-mes-topo hz-naoimp">
      <div class="cb-mes-nav">
        <label class="campo" style="margin:0">Mês da conferência <input type="month" id="hzMes" value="${esc(est.mes)}"></label>
        ${meses.length > 1 ? `<label class="campo" style="margin:0">Conferências feitas <select id="hzMesSel">${meses.map(m => `<option value="${m}"${m === est.mes ? ' selected' : ''}>${esc(nomeMes(m))}${conf(m) ? ` · ${conf(m).corrigidas}/${conf(m).diferencas}` : ' · sem PDF'}</option>`).join('')}</select></label>` : ''}
      </div>
      ${c && !est.trocar ? '<div class="barra" style="margin:0"><button class="btn" type="button" id="hzTrocar">Novo PDF</button></div>' : ''}
    </div>`;
  if (!c || est.trocar) { alvo.innerHTML = topo + blocoImport(c); ligarTopo(); ligarImport(); return; }

  const ms = maquinasDe(c);
  idx = new Map(); ms.forEach(m => m.gaps.forEach(g => idx.set(chaveDe(m.machine, g), { maq: m.machine, g })));
  const t = { maq: ms.length, linhas: ms.reduce((n, m) => n + (m.rowCount || 0), 0), com: ms.filter(m => m.gaps.length).length, dif: 0, ok: 0 };
  ms.forEach(m => m.gaps.forEach(g => { t.dif++; if (ok(m.machine, g)) t.ok++; }));
  const graf = ms.filter(m => m.gaps.length).sort((a, b) => b.gaps.length - a.gaps.length);
  const LIM = 12, max = graf[0]?.gaps.length || 1;
  const lista = ordenadas(ms);
  let total = 0, mostradas = 0;
  const cards = lista.map(m => {
    const gs = visiveis(m); total += m.gaps.length;
    if (!gs.length) return '';
    mostradas += gs.length;
    const nOk = m.gaps.filter(g => ok(m.machine, g)).length, feito = nOk === m.gaps.length, aberto = !!est.abertos[m.machine];
    return `<div class="hz-mach${feito ? ' done' : ''}${aberto ? ' open' : ''}" data-machine="${esc(m.machine)}">
      <button class="hz-mhead" type="button" data-toggle="${esc(m.machine)}" aria-expanded="${aberto}">
        <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        <span class="minfo"><span class="mname">${esc(m.machine)}</span><span class="msub">${m.rowCount} lançamentos · ${nOk} de ${m.gaps.length} corrigida(s)${gs.length !== m.gaps.length ? ' · ' + gs.length + ' no filtro' : ''}</span></span>
        <span class="mright"><span class="mprog"><span class="hz-bar"><i style="width:${Math.round(nOk / m.gaps.length * 100)}%"></i></span></span><span class="badge">${m.gaps.length}${feito ? ' OK' : ''}</span></span>
      </button>
      <div class="mbody">
        <div class="barra hz-naoimp" style="margin:8px 0 4px"><button class="btn mini" type="button" data-all="1" data-m="${esc(m.machine)}">Marcar todas como corrigidas</button><button class="btn mini" type="button" data-all="0" data-m="${esc(m.machine)}">Desmarcar todas</button></div>
        ${tabela(m.machine, gs)}
      </div></div>`;
  }).join('');
  const limpas = ms.filter(m => !m.gaps.length);

  alvo.innerHTML = topo + `
    <h3 class="cb-secao">Resumo da conferência · ${esc(nomeMes(est.mes))}</h3>
    <div class="hz-kpis">
      ${[[t.maq, 'Máquinas no relatório'], [t.linhas, 'Lançamentos lidos'], [t.com, 'Máquinas com diferença'], [t.dif, 'Diferenças encontradas'], [t.ok, 'Corrigidas', 'ok'], [t.dif - t.ok, 'Pendentes']]
        .map(([v, l, k]) => `<div class="hz-kpi${k ? ' ok' : ''}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
    </div>
    <p class="dc-sem" style="margin:6px 2px 0">Arquivo lido: ${esc((c.arquivos || []).map(f => `${f.name} (${f.rows} lançamentos)`).join(' · '))}${c.criado_por ? ' · importado por ' + esc(c.criado_por) : ''}${c.criado_em ? ' em ' + new Date(c.criado_em).toLocaleDateString('pt-BR') : ''}</p>
    ${graf.length ? `<h3 class="cb-secao">Diferenças por máquina <small>${graf.length > LIM ? `mostrando as ${LIM} com mais diferenças, de ${graf.length}` : graf.length + ' máquina(s) com diferença'}</small></h3>
    <div class="hz-chart">${graf.slice(0, LIM).map(m => `<div class="crow" data-goto="${esc(m.machine)}" title="${esc(m.machine)} — ${m.gaps.length} diferença(s), ${fmt(m.gaps.reduce((s, g) => s + Math.abs(g.diff), 0), 2)} h no total">
      <div class="cname">${esc(m.machine.split(' - ')[0])}</div><div class="ctrack"><div class="cbar" style="width:${Math.max(2, m.gaps.length / max * 100).toFixed(1)}%"></div></div><div class="cval">${m.gaps.length}</div></div>`).join('')}</div>` : ''}
    <div class="hz-tools hz-naoimp">
      <label class="campo">Buscar máquina ou documento <input id="hzQ" type="search" value="${esc(est.q)}" placeholder="Ex.: T.01, Ford, 69162" autocomplete="off"></label>
      <label class="campo">Mostrar <select id="hzMostrar"><option value="all">Todas as diferenças</option><option value="pend">Somente pendentes</option><option value="ok">Somente corrigidas</option></select></label>
      <label class="campo">Ordenar máquinas por <select id="hzOrdem"><option value="count">Mais diferenças primeiro</option><option value="size">Maior diferença (horas)</option><option value="name">Código da máquina</option><option value="report">Ordem do relatório</option></select></label>
      <label class="campo" style="max-width:150px">Ignorar abaixo de (h) <input id="hzTol" type="number" min="0" step="0.1" value="${est.tol}" inputmode="decimal"></label>
      <div class="barra" style="margin:0;align-self:end">
        <button class="btn mini" type="button" id="hzAbrir">Abrir todas</button>
        <button class="btn mini" type="button" id="hzFechar">Fechar todas</button>
        <button class="btn mini" type="button" id="hzImprimir">Imprimir / PDF</button>
        <button class="btn mini principal" type="button" id="hzCsv">Baixar Excel (CSV)</button>
      </div>
    </div>
    <h3 class="cb-secao">Checklist por máquina <small>${total ? mostradas + ' de ' + total + ' diferença(s) exibida(s)' : ''}</small></h3>
    <div id="hzLista">${total ? (cards || '<div class="vazio">Nenhuma diferença corresponde ao filtro atual.</div>') : '<div class="aviso info"><b>Nenhuma diferença encontrada.</b> Em todas as máquinas do relatório, o Fim de cada lançamento é igual ao Início do lançamento seguinte.</div>'}</div>
    ${limpas.length ? `<h3 class="cb-secao">Máquinas sem diferença <small>${limpas.length} máquina(s) com o horímetro sem quebra de sequência</small></h3>
    <div class="hz-chips">${limpas.map(m => `<span class="hz-chip">${esc(m.machine)} <span>${m.rowCount} lanç.</span></span>`).join('')}</div>` : ''}`;
  $('hzMostrar').value = est.mostrar; $('hzOrdem').value = est.ordem;
  ligarTopo(); ligarResultado(ms);
}

function ligarTopo() {
  $('hzMes').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { est.mes = e.target.value; est.trocar = false; est.erro = ''; desenhar(); } };
  if ($('hzMesSel')) $('hzMesSel').onchange = e => { est.mes = e.target.value; est.trocar = false; est.erro = ''; desenhar(); };
  if ($('hzTrocar')) $('hzTrocar').onclick = () => { est.trocar = true; desenhar(); };
}
function ligarImport() {
  const drop = $('hzDrop'), file = $('hzFile');
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => { if (file.files.length) importar(file.files); };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer?.files.length) importar(e.dataTransfer.files); });
  if ($('hzCancTroca')) $('hzCancTroca').onclick = () => { est.trocar = false; est.erro = ''; desenhar(); };
}
function ligarResultado(ms) {
  const alvo = $('hzCorpo');
  $('hzQ').oninput = e => { est.q = e.target.value; desenhar(); const q = $('hzQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); };
  $('hzMostrar').onchange = e => { est.mostrar = e.target.value; desenhar(); };
  $('hzOrdem').onchange = e => { est.ordem = e.target.value; desenhar(); };
  $('hzTol').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); est.tol = isFinite(v) && v > 0 ? v : 0; desenhar(); };
  $('hzAbrir').onclick = () => { ms.forEach(m => { if (m.gaps.length) est.abertos[m.machine] = true; }); desenhar(); };
  $('hzFechar').onclick = () => { est.abertos = {}; desenhar(); };
  $('hzImprimir').onclick = () => { ms.forEach(m => { if (m.gaps.length) est.abertos[m.machine] = true; }); desenhar(); setTimeout(() => window.print(), 150); };
  $('hzCsv').onclick = () => baixarCsv(ms);
  alvo.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { const n = b.dataset.toggle; est.abertos[n] = !est.abertos[n]; desenhar(); });
  alvo.querySelectorAll('[data-goto]').forEach(r => r.onclick = () => {
    const n = r.dataset.goto; est.abertos[n] = true; desenhar();
    [...alvo.querySelectorAll('[data-machine]')].find(x => x.dataset.machine === n)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  alvo.querySelectorAll('input[type=checkbox][data-k]').forEach(cx => cx.onchange = async () => {
    const it = idx.get(cx.dataset.k); if (!it) return;
    await marcar(est.mes, it.maq, it.g, { ok: cx.checked }); desenhar();
  });
  alvo.querySelectorAll('input[data-obs]').forEach(inp => inp.onchange = async () => {
    const it = idx.get(inp.dataset.obs); if (!it) return;
    await marcar(est.mes, it.maq, it.g, { obs: inp.value.trim() || null });
  });
  alvo.querySelectorAll('[data-all]').forEach(b => b.onclick = async () => {
    const quer = b.dataset.all === '1', m = ms.find(x => x.machine === b.dataset.m);
    for (const g of m?.gaps || []) if (ok(m.machine, g) !== quer) await marcar(est.mes, m.machine, g, { ok: quer });
    desenhar();
  });
}
function baixarCsv(ms) {
  const cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Maquina', 'Data (Fim)', 'Documento (Fim)', 'Horimetro Fim', 'Data (Inicio)', 'Documento (Inicio)', 'Horimetro Inicio', 'Diferenca (h)', 'Tipo', 'Status', 'Observacao']];
  for (const m of ordenadas(ms)) for (const g of m.gaps) {
    const mk = marca(chaveDe(m.machine, g));
    rows.push([m.machine, g.dataFim, g.docFim, g.fimTxt, g.dataIni, g.docIni, g.inicioTxt, g.diff.toFixed(4).replace('.', ','), g.tipo, mk?.ok ? 'Corrigido' : 'Pendente', mk?.obs || '']);
  }
  const blob = new Blob(['﻿' + rows.map(r => r.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `Conferencia_Horimetros_${est.mes}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}

let ouvindo = false;
export function abrirHorimetros() {
  if (!ouvindo) {
    ouvindo = true;
    window.addEventListener('custobase-dados', () => {
      if (!$('telaHzConf') || $('telaHzConf').hidden || est.lendo) return;
      if (document.activeElement?.matches?.('.hz-obs, #hzQ')) return;
      desenhar();
    });
  }
  desenhar();
}
/** Para o Rastro abrir no mês certo (?mes=AAAA-MM). */
window.cbHorimetrosMes = m => { if (/^\d{4}-\d{2}$/.test(m)) { est.mes = m; est.trocar = false; desenhar(); } };
