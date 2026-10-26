// cert-balanco.js — Certificação › Balanço de massa (FORM 013), 26/10/2026.
//
// Pedido do Guilherme: "a de 2026 é o modelo, depois quero que você siga o
// modelo de 2026, e pegue os dados de 2025 e 2024". Substitui as planilhas
// "Balanço de Massa - 2025/2026.xlsx" e "Planilha de rastreabilidade -
// Sakuma.xlsx" (2024): abas Dashboard, 1 - Rastreabilidade, 2 - Balanço de
// Massa e Fechamento (comparativo entre safras).
//
// De onde vêm os dados (decisão de 26/10/2026: "Colheita + painel na
// Certificação"): as CARGAS são as da área Colheita e Produção (cp_cargas,
// cultura abacate) — lança uma vez e serve aos dois. A Certificação acrescenta
// os LOTES DE VENDA (cp_lotes_venda): um boletim de beneficiamento ou uma NF
// de carga suja, com o peso vendido que a cooperativa informou. O vendido do
// lote é repartido entre as cargas dele pelo peso líquido (como a planilha de
// 2026 fazia com o SUMIFS das NF), e daí sai o descarte de cada talhão.
//   peso colhido  = soma do peso líquido das cargas
//   beneficiado   = cargas lavadas/beneficiadas · sujo = cargas sujas
//   descarte      = colhido − vendido · % perda = descarte ÷ colhido
// Tabelas em supabase/cert-balanco.sql. Sem internet: só consulta ('balanco.cache').

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const t = String(v ?? '').trim(); if (!t) return null; const n = parseFloat(t.replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const fmt = (n, c = 0) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const pct = (a, b, c = 1) => b ? fmt(a / b * 100, c) + '%' : '—';
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const ddmm = s => s ? br(s).slice(0, 5) : '—';
const dias = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) : 0;
const ehSujo = c => /suj/i.test(c.tipo || '');

const FORM = { codigo: 'FORM 013', alt: 'FMAGR-013', titulo: 'Balanço de massa', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
const COLHEITA_URL = 'colheita/';

/* ---------------- estado ---------------- */
const B = {
  carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [],
  f: { safra: '', faz: null }, fr: { q: '', talhao: '', lote: '' },
};
const CAIXA = 'balanco.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { cult: B.cult, safras: B.safras, plantios: B.plantios, cargas: B.cargas, lotes: B.lotes });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !B.carregado) { Object.assign(B, { cult: c0.cult, safras: c0.safras || [], plantios: c0.plantios || [], cargas: c0.cargas || [], lotes: c0.lotes || [] }); B.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (B.carregado) return;
    throw new Error('Sem internet e sem cópia do balanço de massa neste aparelho.');
  }
  const cu = await c.from('cp_culturas').select('*').eq('slug', 'abacate').maybeSingle();
  if (cu.error) { if (B.carregado) return; throw new Error(/permission|policy|does not exist/i.test(cu.error.message) ? 'As tabelas da Colheita não estão liberadas para a Certificação (supabase/cert-balanco.sql).' : cu.error.message); }
  if (!cu.data) throw new Error('A cultura Abacate não está cadastrada na Colheita e Produção.');
  const id = cu.data.id;
  const [s, p, g, l] = await Promise.all([
    c.from('cp_safras').select('*').eq('cultura_id', id).eq('ativo', true),
    c.from('cp_plantios').select('*').eq('cultura_id', id),
    c.from('cp_cargas').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
    c.from('cp_lotes_venda').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
  ]);
  const erro = s.error || p.error || g.error || l.error;
  if (erro) { if (B.carregado) return; throw erro; }
  Object.assign(B, { cult: cu.data, safras: s.data || [], plantios: p.data || [], cargas: g.data || [], lotes: l.data || [], carregado: true });
  salvarCaixa();
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const plantio = id => B.plantios.find(p => p.id === id) || null;
const lote = id => B.lotes.find(l => l.id === id) || null;
const fazDe = c => plantio(c.plantio_id)?.fazenda || '—';
const safrasOrd = () => B.safras.slice().sort((a, b) => String(b.nome).localeCompare(String(a.nome), 'pt-BR', { numeric: true }));
const safraPadrao = () => (safrasOrd().find(s => B.cargas.some(c => c.safra_id === s.id)) || safrasOrd()[0])?.id || '';
const safraNome = id => B.safras.find(s => s.id === id)?.nome || '';
const fazendas = safraId => [...new Set(B.plantios.filter(p => !safraId || p.safra_id === safraId).map(p => p.fazenda).filter(Boolean))].sort();
function fazPadrao(safraId) {
  const com = [...new Set(B.cargas.filter(c => c.safra_id === safraId).map(fazDe))];
  return com.includes('Faz. Faca') ? 'Faz. Faca' : '';
}
/** Vendido de cada carga: o do lote repartido pelo peso líquido. */
function rateio() {
  const somaLote = {};
  for (const c of B.cargas) if (c.lote_venda_id) somaLote[c.lote_venda_id] = (somaLote[c.lote_venda_id] || 0) + Number(c.peso_liquido || 0);
  const m = new Map();
  for (const c of B.cargas) {
    const l = lote(c.lote_venda_id);
    m.set(c.id, l && l.peso_vendido != null && somaLote[l.id] ? Number(l.peso_vendido) * Number(c.peso_liquido || 0) / somaLote[l.id] : null);
  }
  return m;
}
function somar(lista, vend) {
  const r = { n: lista.length, cx: 0, kg: 0, benef: 0, sujo: 0, vend: 0, semVenda: 0, ini: '', fim: '' };
  for (const c of lista) {
    const kg = Number(c.peso_liquido || 0);
    r.cx += Number(c.quantidade || 0); r.kg += kg;
    if (ehSujo(c)) r.sujo += kg; else r.benef += kg;
    const v = vend.get(c.id);
    if (v == null) { if (kg) r.semVenda++; } else r.vend += v;
    if (kg || c.quantidade) { if (!r.ini || c.data < r.ini) r.ini = c.data; if (!r.fim || c.data > r.fim) r.fim = c.data; }
  }
  r.desc = r.kg - r.vend; r.perda = r.kg ? r.desc / r.kg : 0;
  return r;
}
/** Tudo o que o painel, o FORM e o Excel usam para uma safra (e uma fazenda). */
function resumo(safraId, faz) {
  const vend = rateio();
  const cargas = B.cargas.filter(c => c.safra_id === safraId && (!faz || fazDe(c) === faz));
  const pls = B.plantios.filter(p => p.safra_id === safraId && (!faz || p.fazenda === faz))
    .sort((a, b) => String(a.fazenda).localeCompare(String(b.fazenda)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
  const talhoes = pls.map(p => {
    const s = somar(cargas.filter(c => c.plantio_id === p.id), vend);
    const area = Number(p.area || 0), exp = p.expectativa_kg != null ? Number(p.expectativa_kg) : null;
    return { p, ...s, area, exp, kgHa: area && s.kg ? s.kg / area : null, vendHa: area && s.vend ? s.vend / area : null, aprov: exp ? s.kg / exp : null };
  });
  const tot = somar(cargas, vend);
  const area = talhoes.filter(t => t.n).reduce((s, t) => s + t.area, 0) || talhoes.reduce((s, t) => s + t.area, 0);
  const expTot = talhoes.some(t => t.exp != null) ? talhoes.reduce((s, t) => s + (t.exp || 0), 0) : null;
  const ids = new Set(cargas.map(c => c.lote_venda_id).filter(Boolean));
  const lotes = B.lotes.filter(l => ids.has(l.id) || (l.safra_id === safraId && !faz && !B.cargas.some(c => c.lote_venda_id === l.id)));
  return { safraId, faz, cargas, talhoes, tot, area, expTot, vend, lotes,
    kgHa: area ? tot.kg / area : null, vendHa: area ? tot.vend / area : null, kgCx: tot.cx ? tot.kg / tot.cx : null,
    lotesVazios: lotes.filter(l => !B.cargas.some(c => c.lote_venda_id === l.id)) };
}

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
const cartao = (cor, rot, val, dica, alvo) => `<button type="button" class="pv-card pv-${cor}" ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></button>`;
const ton = kg => fmt(kg / 1000, 1) + ' t';
const evid = (url, rot = '↗') => url ? `<a class="ce-link" href="${esc(url)}" target="_blank" rel="noopener" title="Abrir evidência">${rot}</a>` : '';
function filtros(comFaz = true) {
  if (!B.f.safra || !B.safras.some(s => s.id === B.f.safra)) { B.f.safra = safraPadrao(); B.f.faz = null; }
  if (B.f.faz === null) B.f.faz = fazPadrao(B.f.safra);
  return `<label class="campo">Safra <select id="bmSafra">${opcoes(safrasOrd().map(s => [s.id, s.nome]), B.f.safra)}</select></label>
    ${comFaz ? `<label class="campo">Propriedade <select id="bmFaz">${opcoes(fazendas(B.f.safra), B.f.faz, 'Todas')}</select></label>` : ''}`;
}
function ligarFiltros(redes) {
  $('bmSafra')?.addEventListener('change', e => { B.f.safra = e.target.value; B.f.faz = null; redes(); });
  $('bmFaz')?.addEventListener('change', e => { B.f.faz = e.target.value; redes(); });
}
function dialogo(html, ligar) {
  let d = $('dlgBm');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgBm'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgBm')?.open && $('dlgBm').close();
const erroDlg = t => { const e = $('bmErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgBm')) $('dlgBm').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
function trocar(lista, linha) { const i = lista.findIndex(x => x.id === linha.id); if (i >= 0) lista[i] = linha; else lista.push(linha); }

/* ===================================================================
   TELA · PAINEL (Dashboard 2 + Balanço por talhão)
   =================================================================== */
function blocoTalhao(t) {
  return `<div class="bm-talhao">
    <h4>${esc(t.p.nome)} <small class="dica">${esc(t.p.variedade || '')} · ${fmt(t.area, 2)} ha · ${esc(t.p.fazenda || '')}</small></h4>
    <div class="bm-mini">
      <div><span>Colheita</span><b>${t.n ? `${ddmm(t.ini)} → ${ddmm(t.fim)}` : '—'}</b></div>
      <div><span>Caixas</span><b>${fmt(t.cx)}</b></div>
      <div><span>Peso colhido</span><b>${ton(t.kg)}</b></div>
      <div><span>Beneficiado</span><b>${ton(t.benef)}</b></div>
      <div><span>Sujo</span><b>${ton(t.sujo)}</b></div>
      <div><span>Vendido</span><b>${ton(t.vend)}</b></div>
    </div>
    ${t.kg ? `<div class="bm-barra" title="Beneficiado ${pct(t.benef, t.kg)} · sujo ${pct(t.sujo, t.kg)}"><i class="bm-b" style="flex:${t.benef}"></i><i class="bm-s" style="flex:${t.sujo}"></i></div>
      <p class="dica" style="margin:4px 0 0">${pct(t.benef, t.kg, 0)} benef. · ${pct(t.sujo, t.kg, 0)} sujo · perda ${pct(t.desc, t.kg)} · ${fmt(t.kgHa / 1000, 1)} t/ha</p>` : '<p class="dica">Sem carga nesta safra.</p>'}
  </div>`;
}
function tabelaBalanco(k) {
  const L = k.talhoes;
  return `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr>
    <th>Talhão</th><th>Variedade</th><th class="ce">Área (ha)</th><th class="ce">Início</th><th class="ce">Fim</th><th class="ce">Expectativa (kg)</th><th class="ce">Caixas</th>
    <th class="ce">Peso líq. colhido (kg)</th><th class="ce">Produção (t/ha)</th><th class="ce">% aprov.</th><th class="ce">Peso sujo</th><th class="ce">Peso benef.</th><th class="ce">Peso vendido</th><th class="ce">Descarte</th><th class="ce">% perda</th></tr></thead><tbody>
    ${L.map(t => `<tr${t.n ? '' : ' class="cf-inativa"'}><td><button class="ce-link" type="button" data-pl="${esc(t.p.id)}" title="Expectativa de produção">${esc(t.p.nome)}</button><br><small class="dica">${esc(t.p.fazenda || '')}</small></td><td>${esc(t.p.variedade || '')}</td>
      <td class="ce">${fmt(t.area, 2)}</td><td class="ce">${t.n ? br(t.ini) : '—'}</td><td class="ce">${t.n ? br(t.fim) : '—'}</td><td class="ce">${t.exp != null ? fmt(t.exp) : '—'}</td>
      <td class="ce">${fmt(t.cx)}</td><td class="ce"><b>${fmt(t.kg)}</b></td><td class="ce">${t.kgHa != null ? fmt(t.kgHa / 1000, 2) : '—'}</td><td class="ce">${t.aprov != null ? fmt(t.aprov * 100, 0) + '%' : '—'}</td>
      <td class="ce">${fmt(t.sujo)}</td><td class="ce">${fmt(t.benef)}</td><td class="ce">${fmt(t.vend)}</td><td class="ce">${fmt(t.desc)}</td><td class="ce">${t.kg ? pct(t.desc, t.kg) : '—'}</td></tr>`).join('')}
    <tr class="en-total"><td colspan="2">Total</td><td class="ce">${fmt(k.area, 2)}</td><td class="ce">${br(k.tot.ini)}</td><td class="ce">${br(k.tot.fim)}</td><td class="ce">${k.expTot != null ? fmt(k.expTot) : '—'}</td>
      <td class="ce">${fmt(k.tot.cx)}</td><td class="ce">${fmt(k.tot.kg)}</td><td class="ce">${k.kgHa != null ? fmt(k.kgHa / 1000, 2) : '—'}</td><td class="ce">${k.expTot ? fmt(k.tot.kg / k.expTot * 100, 0) + '%' : '—'}</td>
      <td class="ce">${fmt(k.tot.sujo)}</td><td class="ce">${fmt(k.tot.benef)}</td><td class="ce">${fmt(k.tot.vend)}</td><td class="ce">${fmt(k.tot.desc)}</td><td class="ce">${pct(k.tot.desc, k.tot.kg)}</td></tr>
  </tbody></table></div>`;
}
function desenharPainel() {
  const tela = $('telaBmPainel');
  const fil = filtros();
  const k = resumo(B.f.safra, B.f.faz);
  const t = k.tot;
  const avisos = [];
  if (t.semVenda) avisos.push(`${t.semVenda} carga(s) sem lote de venda — o vendido delas conta como zero. Ligue em <b>Lotes de venda</b>.`);
  const zeradas = k.cargas.filter(c => !Number(c.peso_liquido)).length;
  if (zeradas) avisos.push(`${zeradas} carga(s) com peso líquido zero (ex.: a linha de 09/03/2026 da planilha). Confira em Rastreabilidade.`);
  if (k.lotesVazios.length) avisos.push(`${k.lotesVazios.length} lote(s) de venda sem carga ligada.`);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Balanço de massa — Abacate', `${FORM.codigo} · colheita · beneficiamento · vendas. As cargas vêm da <a class="ce-link" href="${COLHEITA_URL}" target="_blank" rel="noopener">Colheita e Produção</a>.`,
      `<button class="btn principal" type="button" id="bmNovoLote">Novo lote de venda</button>`)}
    <div class="grade larga" style="margin-top:12px">${fil}</div>
    ${k.cargas.length ? `
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Janela de colheita', `${dias(t.ini, t.fim)} dias`, `${ddmm(t.ini)} a ${ddmm(t.fim)}`)}
      ${cartao('calma', 'Caixas colhidas', fmt(t.cx), k.talhoes.filter(x => x.n).map(x => `${fmt(x.cx)} ${x.p.nome.replace('Talhão ', 'T')}`).join(' · '), 'bmRastreio')}
      ${cartao('calma', 'Peso colhido', ton(t.kg), `${pct(t.benef, t.kg, 0)} benef. · ${pct(t.sujo, t.kg, 0)} sujo`)}
      ${cartao('calma', 'Peso vendido', ton(t.vend), `${pct(t.vend, t.kg)} do peso colhido`, 'bmLotes')}
      ${cartao(t.perda > .2 ? 'alerta' : t.perda > .1 ? 'atencao' : 'calma', 'Descarte', pct(t.desc, t.kg), `${fmt(t.desc)} kg`)}
      ${cartao('calma', 'Produção', k.kgHa != null ? fmt(k.kgHa / 1000, 1) + ' t/ha' : '—', `${fmt(k.area, 2)} ha · ${fmt(k.kgCx, 1)} kg/cx`, 'bmFechamento')}
    </div>
    ${avisos.length ? `<div class="aviso" style="margin-top:12px">${avisos.join('<br>')}</div>` : ''}
    <div class="qp-bloco"><h3>Detalhamento por talhão</h3><div class="bm-talhoes">${k.talhoes.filter(x => x.n).map(blocoTalhao).join('')}</div></div>
    <div class="qp-bloco"><h3>Balanço por talhão</h3>${tabelaBalanco(k)}
      <p class="dica" style="margin-top:6px">Clique no talhão para informar a expectativa de produção. Área e variedade são da Colheita e Produção.</p></div>`
    : '<div class="vazio" style="margin-top:12px">Nenhuma carga nesta safra ainda. As cargas são lançadas na Colheita e Produção.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="bmImpForm">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="bmImpPainel">Imprimir o painel</button>
    <button class="btn" type="button" id="bmXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharPainel);
  $('bmNovoLote').addEventListener('click', () => formLote(null));
  $('bmImpForm').addEventListener('click', () => mostrar(docForm(k), { barra: true }));
  $('bmImpPainel').addEventListener('click', () => mostrar(docPainel(k), { barra: true }));
  $('bmXlsx').addEventListener('click', () => exportar(k));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', b.dataset.ir)));
  tela.querySelectorAll('[data-pl]').forEach(b => b.addEventListener('click', () => formTalhao(plantio(b.dataset.pl))));
}
function formTalhao(p) {
  if (!p) return;
  dialogo(`<h3>${esc(p.nome)} · ${esc(safraNome(p.safra_id))}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <p class="dica">${esc(p.fazenda || '')} · ${esc(p.variedade || '')} · ${fmt(p.area, 2)} ha (área e variedade: Colheita e Produção).</p>
    <div class="grade">
      <label class="campo">Expectativa de produção (kg) <input type="text" inputmode="decimal" id="tpExp" value="${p.expectativa_kg != null ? esc(fmt(p.expectativa_kg)) : ''}"></label>
      <label class="campo">ou em t/ha <input type="text" inputmode="decimal" id="tpHa" value="${p.expectativa_kg != null && Number(p.area) ? esc(fmt(p.expectativa_kg / p.area / 1000, 2)) : ''}"></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="tpOk">Salvar</button></div>`, () => {
    $('tpHa').addEventListener('input', () => { const h = num($('tpHa').value); if (h != null && !Number.isNaN(h) && Number(p.area)) $('tpExp').value = fmt(h * 1000 * p.area); });
    $('tpOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const v = num($('tpExp').value);
      if (Number.isNaN(v) || (v != null && v < 0)) return erroDlg('Confira a expectativa.');
      $('tpOk').disabled = true;
      const { data, error } = await estado.cliente.from('cp_plantios').update({ expectativa_kg: v }).eq('id', p.id).select().single();
      if (error) { $('tpOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      trocar(B.plantios, data); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · RASTREABILIDADE (uma linha por carga, como a aba 1)
   =================================================================== */
function linhasRastreio(k) {
  const q = so(B.fr.q).toLowerCase();
  return k.cargas.filter(c => (!B.fr.talhao || c.plantio_id === B.fr.talhao) && (!B.fr.lote || (B.fr.lote === '-' ? !c.lote_venda_id : c.lote_venda_id === B.fr.lote))
    && (!q || [c.placa, c.ticket_faz, c.ticket_balanca, c.nf, c.boletim, c.rastreio, lote(c.lote_venda_id)?.codigo, lote(c.lote_venda_id)?.nfs].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.ticket_faz || '').localeCompare(String(b.ticket_faz || ''), 'pt-BR', { numeric: true }));
}
function desenharRastreio() {
  const tela = $('telaBmRastreio');
  const fil = filtros();
  const k = resumo(B.f.safra, B.f.faz);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Rastreabilidade das cargas', 'Da colheita à venda: cada carga com talhão, balança, packing house, boletim, NF e o vendido repartido do lote.',
      `<a class="btn" href="${COLHEITA_URL}" target="_blank" rel="noopener">Lançar carga na Colheita ↗</a>`)}
    <div class="grade larga" style="margin-top:12px">${fil}
      <label class="campo">Talhão <select id="brTal">${opcoes(k.talhoes.filter(t => t.n).map(t => [t.p.id, t.p.nome]), B.fr.talhao, 'Todos')}</select></label>
      <label class="campo">Lote de venda <select id="brLote">${opcoes([['-', 'Sem lote'], ...k.lotes.map(l => [l.id, l.codigo])], B.fr.lote, 'Todos')}</select></label>
      <label class="campo">Buscar <input type="text" id="brQ" value="${esc(B.fr.q)}" placeholder="Placa, ticket, NF, boletim"></label>
    </div>
    <div id="brTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="brImp">Imprimir a rastreabilidade</button>
    <button class="btn" type="button" id="brXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharRastreio);
  const liga = (id, kk, ev = 'change') => $(id).addEventListener(ev, e => { B.fr[kk] = e.target.value; tabelaRastreio(); });
  liga('brTal', 'talhao'); liga('brLote', 'lote'); liga('brQ', 'q', 'input');
  $('brImp').addEventListener('click', () => mostrar(docRastreio(resumo(B.f.safra, B.f.faz)), { barra: true }));
  $('brXlsx').addEventListener('click', () => exportar(resumo(B.f.safra, B.f.faz)));
  tabelaRastreio();
}
function tabelaRastreio() {
  const k = resumo(B.f.safra, B.f.faz);
  const l = linhasRastreio(k);
  const s = somar(l, k.vend);
  $('brTabela').innerHTML = l.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr>
    <th class="ce">Data</th><th>Placa</th><th class="ce">Ticket</th><th>Talhão</th><th class="ce">Caixas</th><th class="ce">Ticket bal.</th><th class="ce">Peso líq.</th><th class="ce">kg/cx</th>
    <th>Packing house</th><th>Tipo</th><th>Boletim / NF</th><th class="ce">Vendido</th><th class="ce">Descarte</th><th class="ce">%</th><th class="ce">Evid.</th><th></th></tr></thead><tbody>
    ${l.map(c => { const p = plantio(c.plantio_id), lv = lote(c.lote_venda_id), v = k.vend.get(c.id), kg = Number(c.peso_liquido || 0);
      return `<tr><td class="ce">${br(c.data)}</td><td>${esc(c.placa || '')}</td><td class="ce">${esc(c.ticket_faz || '')}</td><td>${esc(p?.nome || '?')}${c.conferido ? ' <span title="Inspeção da colheita feita">✓</span>' : ''}</td>
        <td class="ce">${fmt(c.quantidade)}</td><td class="ce">${esc(c.ticket_balanca || '')}</td><td class="ce">${fmt(kg)}</td><td class="ce">${c.quantidade ? fmt(kg / c.quantidade, 1) : '—'}</td>
        <td>${esc(lv?.destino || '')}</td><td>${esc(c.tipo || '')}</td>
        <td>${lv ? `<b>${esc(lv.codigo)}</b>` : tag('sem lote', 'alerta')}${c.rastreio ? `<br><small class="dica">${esc(c.rastreio)}</small>` : ''}</td>
        <td class="ce">${v != null ? fmt(v) : '—'}</td><td class="ce">${v != null ? fmt(kg - v) : '—'}</td><td class="ce">${v != null && kg ? pct(kg - v, kg) : '—'}</td>
        <td class="ce">${evid(c.evid_url, 'carga')} ${evid(lv?.evid_url, 'venda')}</td>
        <td class="ce"><button class="btn mini" type="button" data-cg="${esc(c.id)}">Abrir</button></td></tr>`; }).join('')}
    <tr class="en-total"><td colspan="4">${l.length} carga(s)</td><td class="ce">${fmt(s.cx)}</td><td></td><td class="ce">${fmt(s.kg)}</td><td class="ce">${s.cx ? fmt(s.kg / s.cx, 1) : ''}</td><td colspan="3"></td>
      <td class="ce">${fmt(s.vend)}</td><td class="ce">${fmt(s.desc)}</td><td class="ce">${pct(s.desc, s.kg)}</td><td colspan="2"></td></tr>
  </tbody></table></div>` : '<div class="vazio">Nenhuma carga com esse filtro.</div>';
  $('brTabela').querySelectorAll('[data-cg]').forEach(b => b.addEventListener('click', () => formCarga(B.cargas.find(c => c.id === b.dataset.cg))));
}
function formCarga(c) {
  if (!c) return;
  const p = plantio(c.plantio_id);
  const lotes = B.lotes.filter(l => l.safra_id === c.safra_id);
  dialogo(`<h3>Carga de ${br(c.data)} · ${esc(c.placa || '')}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <p class="dica">${esc(p?.nome || '')} · ${fmt(c.quantidade)} cx · ${fmt(c.peso_liquido)} kg · ticket ${esc(c.ticket_faz || '—')} · balança ${esc(c.ticket_balanca || '—')}${c.nf ? ' · NF ' + esc(c.nf) : ''}.
      Data, talhão, caixas e pesos se corrigem na <a class="ce-link" href="${COLHEITA_URL}" target="_blank" rel="noopener">Colheita e Produção</a>.</p>
    <div class="grade">
      <label class="campo">Lote de venda <select id="fcLote">${opcoes(lotes.map(l => [l.id, `${l.codigo}${l.destino ? ' · ' + l.destino : ''}`]), c.lote_venda_id, '— sem lote —')}</select></label>
      <label class="campo">Tipo da carga <select id="fcTipo">${opcoes(['Beneficiado', 'Sujo', 'Lavado'], c.tipo, '—')}</select></label>
      <label class="campo">Código de rastreabilidade <input type="text" id="fcRast" value="${esc(c.rastreio || '')}"></label>
      <label class="campo">Evidência da carga (link) <input type="url" id="fcEv" value="${esc(c.evid_url || '')}" placeholder="https://…"></label>
    </div>
    <label class="campo rs-check"><input type="checkbox" id="fcInsp" ${c.conferido ? 'checked' : ''}> Inspeção da colheita feita</label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="fcOk">Salvar</button></div>`, () => {
    $('fcOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const ev = so($('fcEv').value);
      if (ev && !/^https?:\/\//i.test(ev)) return erroDlg('O link da evidência precisa começar com https://');
      const l = { lote_venda_id: $('fcLote').value || null, tipo: $('fcTipo').value || null, rastreio: so($('fcRast').value) || null, evid_url: ev || null, conferido: $('fcInsp').checked };
      $('fcOk').disabled = true;
      const { data, error } = await estado.cliente.from('cp_cargas').update(l).eq('id', c.id).select().single();
      if (error) { $('fcOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      trocar(B.cargas, data); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · LOTES DE VENDA
   =================================================================== */
function desenharLotes() {
  const tela = $('telaBmLotes');
  const fil = filtros(false);
  const vend = rateio();
  const lotes = B.lotes.filter(l => l.safra_id === B.f.safra).sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const linhas = lotes.map(l => ({ l, s: somar(B.cargas.filter(c => c.lote_venda_id === l.id), vend) }));
  const semLote = B.cargas.filter(c => c.safra_id === B.f.safra && !c.lote_venda_id && Number(c.peso_liquido));
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Lotes de venda', 'Cada boletim de beneficiamento ou NF de carga suja: destino, peso vendido (relatório da cooperativa) e as cargas que entraram nele.',
      `<button class="btn principal" type="button" id="blNovo">Novo lote</button>`)}
    <div class="grade larga" style="margin-top:12px">${fil}</div>
    ${semLote.length ? `<div class="aviso" style="margin-top:12px">${semLote.length} carga(s) desta safra ainda sem lote de venda: ${semLote.slice(0, 6).map(c => `${br(c.data)} ${esc(c.placa || '')}`).join(' · ')}${semLote.length > 6 ? '…' : ''}</div>` : ''}
    ${linhas.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha bm-tab"><thead><tr><th>Lote</th><th class="ce">Data</th><th>Destino</th><th>Tipo</th><th>Certificação</th><th class="ce">Cargas</th><th class="ce">Peso colhido</th><th class="ce">Vendido</th><th class="ce">Descarte</th><th class="ce">%</th><th>NF-e</th><th class="ce">Evid.</th><th></th></tr></thead><tbody>
      ${linhas.map(({ l, s }) => `<tr><td><b>${esc(l.codigo)}</b>${l.rastreio ? `<br><small class="dica">${esc(l.rastreio)}</small>` : ''}</td><td class="ce">${br(l.data)}</td><td>${esc(l.destino || '')}</td><td>${esc(l.tipo || '')}</td><td>${esc(l.certificacao || '')}</td>
        <td class="ce">${s.n || tag('0', 'alerta')}</td><td class="ce">${fmt(s.kg)}</td><td class="ce"><b>${fmt(l.peso_vendido)}</b></td><td class="ce">${s.n ? fmt(s.kg - Number(l.peso_vendido || 0)) : '—'}</td><td class="ce">${s.kg ? pct(s.kg - Number(l.peso_vendido || 0), s.kg) : '—'}</td>
        <td><small title="${esc(l.nfs || '')}">${esc(String(l.nfs || '').length > 40 ? String(l.nfs).slice(0, 38) + '…' : l.nfs || '')}</small></td><td class="ce">${evid(l.evid_url)}</td>
        <td class="ce"><button class="btn mini" type="button" data-lv="${esc(l.id)}">Abrir</button></td></tr>`).join('')}
      <tr class="en-total"><td colspan="5">${linhas.length} lote(s)</td><td class="ce">${linhas.reduce((a, x) => a + x.s.n, 0)}</td><td class="ce">${fmt(linhas.reduce((a, x) => a + x.s.kg, 0))}</td>
        <td class="ce">${fmt(linhas.reduce((a, x) => a + Number(x.l.peso_vendido || 0), 0))}</td><td colspan="5"></td></tr>
    </tbody></table></div>` : '<div class="vazio" style="margin-top:12px">Nenhum lote de venda nesta safra.</div>'}
  </div>`;
  ligarFiltros(desenharLotes);
  $('blNovo').addEventListener('click', () => formLote(null));
  tela.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => formLote(lote(b.dataset.lv))));
}
function formLote(l) {
  const saf = l?.safra_id || B.f.safra || safraPadrao();
  const v = l || { codigo: '', data: hoje(), destino: 'Coopadap', tipo: 'Beneficiado', certificacao: '', rastreio: '', nfs: '', peso_vendido: null, evid_url: '', obs: '' };
  const cargas = B.cargas.filter(c => c.safra_id === saf && (Number(c.peso_liquido) || c.lote_venda_id === l?.id))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const destinos = [...new Set(['Coopadap', 'Carlini', ...B.lotes.map(x => x.destino).filter(Boolean)])];
  dialogo(`<h3>${l ? 'Lote de venda' : 'Novo lote de venda'} · safra ${esc(safraNome(saf))}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <div class="grade">
      <label class="campo">Identificação <input type="text" id="lvCod" value="${esc(v.codigo)}" placeholder="Boletim 798 · NF 001031094-2"></label>
      <label class="campo">Data <input type="date" id="lvData" value="${esc(String(v.data || '').slice(0, 10))}"></label>
      <label class="campo">Destino (packing house) <input type="text" id="lvDest" value="${esc(v.destino || '')}" list="lvDests"></label>
      <label class="campo">Tipo <select id="lvTipo">${opcoes(['Beneficiado', 'Sujo', 'Lavado'], v.tipo, '—')}</select></label>
      <label class="campo">Certificação <select id="lvCert">${opcoes(['Com certificação', 'Sem certificação'], v.certificacao, '—')}</select></label>
      <label class="campo">Peso vendido (kg) <input type="text" inputmode="decimal" id="lvVend" value="${v.peso_vendido != null ? esc(fmt(v.peso_vendido, Number(v.peso_vendido) % 1 ? 2 : 0)) : ''}"></label>
      <label class="campo">Código de rastreabilidade <input type="text" id="lvRast" value="${esc(v.rastreio || '')}"></label>
      <label class="campo">Evidência da venda (link) <input type="url" id="lvEv" value="${esc(v.evid_url || '')}" placeholder="https://…"></label>
    </div>
    <datalist id="lvDests">${destinos.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <label class="campo">NF-e(s) <textarea id="lvNfs" rows="2">${esc(v.nfs || '')}</textarea></label>
    <fieldset class="cp-fs"><legend>Cargas deste lote <span class="dica" id="lvSoma"></span></legend>
      <div class="bm-cargas">${cargas.map(c => { const outro = c.lote_venda_id && c.lote_venda_id !== l?.id ? lote(c.lote_venda_id) : null;
        return `<label class="rs-check${outro ? ' dica' : ''}"><input type="checkbox" value="${esc(c.id)}" data-kg="${Number(c.peso_liquido || 0)}" ${l && c.lote_venda_id === l.id ? 'checked' : ''}>
          ${br(c.data)} · ${esc(plantio(c.plantio_id)?.nome || '')} · ${esc(c.placa || '')} · ${fmt(c.quantidade)} cx · ${fmt(c.peso_liquido)} kg${c.tipo ? ' · ' + esc(c.tipo) : ''}${outro ? ` <small>(hoje em ${esc(outro.codigo)})</small>` : ''}</label>`; }).join('') || '<p class="dica">Nenhuma carga nesta safra.</p>'}</div>
    </fieldset>
    <label class="campo">Observação <textarea id="lvObs" rows="2">${esc(v.obs || '')}</textarea></label>
    <div class="barra entre"><div>${l ? '<button class="btn perigo" type="button" id="lvApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="lvOk">Salvar</button></div></div>`, d => {
    const marcadas = () => [...d.querySelectorAll('.bm-cargas input:checked')];
    const conta = () => { const kg = marcadas().reduce((s, i) => s + Number(i.dataset.kg), 0); const vv = num($('lvVend').value);
      $('lvSoma').textContent = `— ${marcadas().length} carga(s), ${fmt(kg)} kg colhidos${vv && kg ? ` · descarte ${pct(kg - vv, kg)}` : ''}`; };
    d.querySelectorAll('.bm-cargas input').forEach(i => i.addEventListener('change', conta)); $('lvVend').addEventListener('input', conta); conta();
    $('lvOk').addEventListener('click', () => salvarLote(l, saf, marcadas().map(i => i.value)));
    $('lvApagar')?.addEventListener('click', () => apagarLote(l));
  });
}
async function salvarLote(atual, saf, ids) {
  if (precisaRede()) return;
  const vend = num($('lvVend').value), ev = so($('lvEv').value);
  const linha = { codigo: so($('lvCod').value), data: $('lvData').value || null, destino: so($('lvDest').value) || null, tipo: $('lvTipo').value || null,
    certificacao: $('lvCert').value || null, peso_vendido: vend, rastreio: so($('lvRast').value) || null, evid_url: ev || null, nfs: so($('lvNfs').value) || null, obs: so($('lvObs').value) || null };
  if (!linha.codigo) return erroDlg('Informe a identificação do lote (ex.: Boletim 798).');
  if (Number.isNaN(vend) || (vend != null && vend < 0)) return erroDlg('Confira o peso vendido.');
  if (ev && !/^https?:\/\//i.test(ev)) return erroDlg('O link da evidência precisa começar com https://');
  $('lvOk').disabled = true;
  try {
    const t = estado.cliente.from('cp_lotes_venda');
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single()
      : await t.insert({ ...linha, cultura_id: B.cult.id, safra_id: saf, criado_por: quem() }).select().single();
    if (error) throw error;
    trocar(B.lotes, data);
    const antes = new Set(B.cargas.filter(c => c.lote_venda_id === data.id).map(c => c.id));
    const entra = ids.filter(id => !antes.has(id)), sai = [...antes].filter(id => !ids.includes(id));
    if (entra.length) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: data.id }).in('id', entra).select(); if (r.error) throw r.error; r.data.forEach(x => trocar(B.cargas, x)); }
    if (sai.length) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: null }).in('id', sai).select(); if (r.error) throw r.error; r.data.forEach(x => trocar(B.cargas, x)); }
    salvarCaixa(); fechar(); redesenhar();
  } catch (e) { if ($('lvOk')) $('lvOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
}
function apagarLote(l) {
  const n = B.cargas.filter(c => c.lote_venda_id === l.id).length;
  dialogo(`<h3>Apagar o lote ${esc(l.codigo)}</h3><div class="aviso erro" id="bmErro" hidden></div>
    <p>${n ? `${n} carga(s) ficam sem lote de venda (as cargas não são apagadas).` : 'Nenhuma carga ligada.'}</p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="laOk">Apagar</button></div>`, () => {
    $('laOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('laOk').disabled = true;
      if (n) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: null }).eq('lote_venda_id', l.id).select(); if (r.error) { $('laOk').disabled = false; return erroDlg(esc(r.error.message)); } r.data.forEach(x => trocar(B.cargas, x)); }
      const { error } = await estado.cliente.from('cp_lotes_venda').delete().eq('id', l.id);
      if (error) { $('laOk').disabled = false; return erroDlg('Não consegui apagar: ' + esc(error.message)); }
      B.lotes = B.lotes.filter(x => x.id !== l.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · FECHAMENTO (comparativo entre safras)
   =================================================================== */
function comparativo(faz) {
  return safrasOrd().slice().reverse().map(s => ({ s, k: resumo(s.id, faz) })).filter(x => x.k.cargas.length);
}
const INDIC = [
  ['Área (ha)', k => fmt(k.area, 2)],
  ['Início da colheita', k => br(k.tot.ini)],
  ['Fim da colheita', k => br(k.tot.fim)],
  ['Caixas colhidas', k => fmt(k.tot.cx)],
  ['Peso colhido (kg)', k => fmt(k.tot.kg)],
  ['Colhido (kg/ha)', k => fmt(k.kgHa)],
  ['Peso médio (kg/cx)', k => fmt(k.kgCx, 1)],
  ['Beneficiado (kg)', k => fmt(k.tot.benef)],
  ['Sujo (kg)', k => fmt(k.tot.sujo)],
  ['Peso vendido (kg)', k => fmt(k.tot.vend)],
  ['Vendido (kg/ha)', k => fmt(k.vendHa)],
  ['Peso descarte (kg)', k => fmt(k.tot.desc)],
  ['% perda', k => pct(k.tot.desc, k.tot.kg)],
];
function graficoSafras(L, rel) {
  const max = Math.max(...L.map(x => x.k.tot.kg), 1);
  return `<div class="bm-graf${rel ? ' bm-graf-rel' : ''}">${L.map(x => `<div class="bm-gl"><span class="bm-gr">${esc(x.s.nome)}</span>
    <div class="bm-gb"><i class="bm-b" style="width:${x.k.tot.vend / max * 100}%"></i><i class="bm-s" style="width:${x.k.tot.desc / max * 100}%"></i></div>
    <span class="bm-gv">${ton(x.k.tot.kg)} · vendido ${pct(x.k.tot.vend, x.k.tot.kg, 0)}</span></div>`).join('')}</div>
    <p class="${rel ? 'rel-nota' : 'dica'}" style="margin:4px 0 0"><span class="en-leg en-ren"></span> vendido <span class="en-leg en-nao"></span> descarte</p>`;
}
function desenharFechamento() {
  const tela = $('telaBmFechamento');
  if (B.f.faz === null) B.f.faz = fazPadrao(B.f.safra || safraPadrao());
  const L = comparativo(B.f.faz);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Fechamento — comparativo entre safras', `Abacate · ${esc(B.f.faz || 'todas as propriedades')}. Safra = ano da colheita (na planilha, 2024 aparecia como “2022/2023”, 2025 como “2023/2024” e 2026 como “2024/2025”).`)}
    <div class="grade larga" style="margin-top:12px"><label class="campo">Propriedade <select id="bmFaz">${opcoes(fazendas(''), B.f.faz, 'Todas')}</select></label></div>
    ${L.length ? `<div class="qp-bloco"><h3>Colhido × vendido</h3>${graficoSafras(L)}</div>
    <div class="qp-bloco"><h3>Indicadores</h3><div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr><th>Indicador</th>${L.map(x => `<th class="ce">${esc(x.s.nome)}</th>`).join('')}</tr></thead><tbody>
      ${INDIC.map(([r, f]) => `<tr><td>${r}</td>${L.map(x => `<td class="ce">${f(x.k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="qp-bloco"><h3>Por talhão</h3><div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr><th>Talhão</th>${L.map(x => `<th class="ce" colspan="3">${esc(x.s.nome)}</th>`).join('')}</tr>
      <tr><th></th>${L.map(() => '<th class="ce">Colhido (kg)</th><th class="ce">kg/ha</th><th class="ce">% perda</th>').join('')}</tr></thead><tbody>
      ${[...new Set(L.flatMap(x => x.k.talhoes.filter(t => t.n).map(t => t.p.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(nome => `<tr><td>${esc(nome)}</td>${L.map(x => { const t = x.k.talhoes.find(y => y.p.nome === nome && y.n);
        return t ? `<td class="ce">${fmt(t.kg)}</td><td class="ce">${fmt(t.kgHa)}</td><td class="ce">${pct(t.desc, t.kg)}</td>` : '<td class="ce">—</td><td></td><td></td>'; }).join('')}</tr>`).join('')}
    </tbody></table></div></div>` : '<div class="vazio" style="margin-top:12px">Nenhuma carga.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="bfImp">Imprimir o fechamento</button></div>`;
  $('bmFaz').addEventListener('change', e => { B.f.faz = e.target.value; desenharFechamento(); });
  $('bfImp').addEventListener('click', () => mostrar(docFechamento(L), { barra: true }));
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
const subt = k => `Abacate · safra ${safraNome(k.safraId)} · ${k.faz || 'todas as propriedades'}`;
function tabelaBalRel(k) {
  return `<table class="rel-tabela bm-rel"><thead><tr><th>Talhão</th><th>Variedade</th><th>Área (ha)</th><th>Início</th><th>Fim</th><th>Expect. (kg)</th><th>Caixas</th><th>Peso líq. (kg)</th><th>t/ha</th><th>% aprov.</th><th>Sujo</th><th>Benef.</th><th>Vendido</th><th>Descarte</th><th>% perda</th></tr></thead><tbody>
    ${k.talhoes.map(t => `<tr><td>${esc(t.p.nome)}</td><td>${esc(t.p.variedade || '')}</td><td class="rel-num">${fmt(t.area, 2)}</td><td>${t.n ? br(t.ini) : '—'}</td><td>${t.n ? br(t.fim) : '—'}</td><td class="rel-num">${t.exp != null ? fmt(t.exp) : '—'}</td>
      <td class="rel-num">${fmt(t.cx)}</td><td class="rel-num">${fmt(t.kg)}</td><td class="rel-num">${t.kgHa != null ? fmt(t.kgHa / 1000, 2) : '—'}</td><td class="rel-num">${t.aprov != null ? fmt(t.aprov * 100, 0) + '%' : '—'}</td>
      <td class="rel-num">${fmt(t.sujo)}</td><td class="rel-num">${fmt(t.benef)}</td><td class="rel-num">${fmt(t.vend)}</td><td class="rel-num">${fmt(t.desc)}</td><td class="rel-num">${t.kg ? pct(t.desc, t.kg) : '—'}</td></tr>`).join('')}
    <tr><td colspan="2"><b>Total</b></td><td class="rel-num"><b>${fmt(k.area, 2)}</b></td><td>${br(k.tot.ini)}</td><td>${br(k.tot.fim)}</td><td class="rel-num">${k.expTot != null ? fmt(k.expTot) : '—'}</td><td class="rel-num"><b>${fmt(k.tot.cx)}</b></td>
      <td class="rel-num"><b>${fmt(k.tot.kg)}</b></td><td class="rel-num">${k.kgHa != null ? fmt(k.kgHa / 1000, 2) : '—'}</td><td class="rel-num">${k.expTot ? fmt(k.tot.kg / k.expTot * 100, 0) + '%' : '—'}</td>
      <td class="rel-num">${fmt(k.tot.sujo)}</td><td class="rel-num">${fmt(k.tot.benef)}</td><td class="rel-num"><b>${fmt(k.tot.vend)}</b></td><td class="rel-num">${fmt(k.tot.desc)}</td><td class="rel-num"><b>${pct(k.tot.desc, k.tot.kg)}</b></td></tr></tbody></table>`;
}
function docForm(k) {
  return documento({ titulo: 'Balanço de massa', subtitulo: subt(k), canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo} (${FORM.alt})</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div><div><span>Propriedade</span><b>${esc(k.faz || 'Todas')}</b></div>
      <div><span>Cultura</span><b>Abacate</b></div><div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>
    ${tabelaBalRel(k)}
    <p class="rel-secao">Lotes de venda</p>
    <table class="rel-tabela bm-rel"><thead><tr><th>Lote</th><th>Data</th><th>Destino</th><th>Tipo</th><th>Certificação</th><th>Cargas</th><th>Colhido (kg)</th><th>Vendido (kg)</th><th>% perda</th></tr></thead><tbody>
      ${k.lotes.map(l => { const s = somar(k.cargas.filter(c => c.lote_venda_id === l.id), k.vend); return `<tr><td>${esc(l.codigo)}</td><td>${br(l.data)}</td><td>${esc(l.destino || '')}</td><td>${esc(l.tipo || '')}</td><td>${esc(l.certificacao || '')}</td>
        <td class="rel-num">${s.n}</td><td class="rel-num">${fmt(s.kg)}</td><td class="rel-num">${fmt(s.vend)}</td><td class="rel-num">${pct(s.desc, s.kg)}</td></tr>`; }).join('')}</tbody></table>
    <p class="rel-nota">Peso colhido = peso líquido da balança. Vendido = relatório do packing house por lote (boletim ou NF), repartido entre as cargas do lote pelo peso líquido. Descarte = colhido − vendido.</p>` });
}
function docPainel(k) {
  const t = k.tot;
  return documento({ titulo: 'Balanço de massa — painel', subtitulo: subt(k), canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-qkpis">
      <div><span>Janela de colheita</span><strong>${dias(t.ini, t.fim)}</strong><small>dias · ${ddmm(t.ini)} a ${ddmm(t.fim)}</small></div>
      <div><span>Caixas</span><strong>${fmt(t.cx)}</strong><small>${fmt(k.kgCx, 1)} kg/cx</small></div>
      <div><span>Peso colhido</span><strong>${fmt(t.kg / 1000, 1)}</strong><small>t · ${pct(t.benef, t.kg, 0)} benef.</small></div>
      <div class="rel-q--otimo-t"><span>Vendido</span><strong>${fmt(t.vend / 1000, 1)}</strong><small>t · ${pct(t.vend, t.kg)} do colhido</small></div>
      <div class="rel-q--bom-t"><span>Descarte</span><strong>${pct(t.desc, t.kg)}</strong><small>${fmt(t.desc)} kg</small></div>
      <div><span>Produção</span><strong>${k.kgHa != null ? fmt(k.kgHa / 1000, 1) : '—'}</strong><small>t/ha · ${fmt(k.area, 2)} ha</small></div>
    </div>
    <p class="rel-secao">Balanço por talhão</p>${tabelaBalRel(k)}` });
}
function docRastreio(k) {
  const l = linhasRastreio(k);
  return documento({ titulo: 'Rastreabilidade das cargas', subtitulo: subt(k), canto: FORM.codigo, paisagem: true, corpo: `
    <table class="rel-tabela bm-rel"><thead><tr><th>Data</th><th>Placa</th><th>Ticket</th><th>Talhão</th><th>Caixas</th><th>Ticket bal.</th><th>Peso líq.</th><th>Destino</th><th>Tipo</th><th>Lote</th><th>NF / rastreio</th><th>Vendido</th><th>% desc.</th></tr></thead><tbody>
      ${l.map(c => { const lv = lote(c.lote_venda_id), v = k.vend.get(c.id), kg = Number(c.peso_liquido || 0);
        return `<tr><td>${br(c.data)}</td><td>${esc(c.placa || '')}</td><td>${esc(c.ticket_faz || '')}</td><td>${esc(plantio(c.plantio_id)?.nome || '')}</td><td class="rel-num">${fmt(c.quantidade)}</td><td>${esc(c.ticket_balanca || '')}</td>
          <td class="rel-num">${fmt(kg)}</td><td>${esc(lv?.destino || '')}</td><td>${esc(c.tipo || '')}</td><td>${esc(lv?.codigo || '—')}</td><td>${esc(c.nf || c.rastreio || '')}</td><td class="rel-num">${v != null ? fmt(v) : '—'}</td><td class="rel-num">${v != null && kg ? pct(kg - v, kg) : '—'}</td></tr>`; }).join('')}
    </tbody></table>` });
}
function docFechamento(L) {
  return documento({ titulo: 'Fechamento — comparativo entre safras', subtitulo: `Abacate · ${B.f.faz || 'todas as propriedades'}`, canto: FORM.codigo, paisagem: true, corpo: `
    ${graficoSafras(L, true)}
    <table class="rel-tabela" style="margin-top:10px"><thead><tr><th>Indicador</th>${L.map(x => `<th>${esc(x.s.nome)}</th>`).join('')}</tr></thead><tbody>
      ${INDIC.map(([r, f]) => `<tr><td>${r}</td>${L.map(x => `<td class="rel-num">${f(x.k)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="rel-nota">Safra = ano da colheita. Vendido conforme relatórios do packing house (Coopadap / Carlini).</p>` });
}
async function exportar(k) {
  const l = linhasRastreio({ ...k, cargas: k.cargas });
  const tit = `${FORM.codigo} — ${FORM.titulo} · ${subt(k)}`, sub = `SAKUMA Agronegócios · emitido em ${br(hoje())}`;
  await baixarXlsx(`balanco-massa-${safraNome(k.safraId)}-${hoje()}.xlsx`, [
    { nome: 'Rastreabilidade', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Data colheita', larg: 12, tipo: 'data' }, { rot: 'Placa', larg: 10 }, { rot: 'Ticket', larg: 9 }, { rot: 'Propriedade', larg: 14 }, { rot: 'Talhão', larg: 12 }, { rot: 'Variedade', larg: 10 },
        { rot: 'Caixas', larg: 8, tipo: 'num', casas: 0 }, { rot: 'Ticket balança', larg: 10 }, { rot: 'Peso líq. (kg)', larg: 12, tipo: 'num', casas: 2 }, { rot: 'kg/cx', larg: 8, tipo: 'num', casas: 2 },
        { rot: 'Packing house', larg: 12 }, { rot: 'Tipo', larg: 11 }, { rot: 'Boletim', larg: 9 }, { rot: 'Lote de venda', larg: 18 }, { rot: 'NF-e', larg: 30 }, { rot: 'Peso vendido (kg)', larg: 12, tipo: 'num', casas: 2 },
        { rot: 'Peso descarte (kg)', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Inspeção', larg: 8 }, { rot: 'Rastreabilidade', larg: 22 }, { rot: 'Evidência carga', larg: 30 }, { rot: 'Evidência venda', larg: 30 }],
      linhas: l.map(c => { const p = plantio(c.plantio_id), lv = lote(c.lote_venda_id), v = k.vend.get(c.id), kg = Number(c.peso_liquido || 0);
        return [c.data, c.placa || '', c.ticket_faz || '', p?.fazenda || '', p?.nome || '', p?.variedade || '', Number(c.quantidade || 0), c.ticket_balanca || '', kg, c.quantidade ? kg / c.quantidade : null,
          lv?.destino || '', c.tipo || '', c.boletim || '', lv?.codigo || '', c.nf || lv?.nfs || '', v, v != null ? kg - v : null, c.conferido ? 'SIM' : '', c.rastreio || lv?.rastreio || '', c.evid_url || '', lv?.evid_url || '']; }) },
    { nome: 'Balanço de massa', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Talhão', larg: 14 }, { rot: 'Propriedade', larg: 14 }, { rot: 'Variedade', larg: 10 }, { rot: 'Área (ha)', larg: 9, tipo: 'num', casas: 2 }, { rot: 'Início', larg: 11, tipo: 'data' }, { rot: 'Fim', larg: 11, tipo: 'data' },
        { rot: 'Expectativa (kg)', larg: 12, tipo: 'num', casas: 0 }, { rot: 'Caixas', larg: 8, tipo: 'num', casas: 0 }, { rot: 'Peso líq. colhido (kg)', larg: 14, tipo: 'num', casas: 2 }, { rot: 'Produção (t/ha)', larg: 10, tipo: 'num', casas: 2 },
        { rot: 'Peso sujo', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso beneficiado', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso vendido', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso descarte', larg: 12, tipo: 'num', casas: 2 }, { rot: '% perda', larg: 8, tipo: 'num', casas: 2 }],
      linhas: k.talhoes.map(t => [t.p.nome, t.p.fazenda || '', t.p.variedade || '', t.area, t.ini || null, t.fim || null, t.exp, t.cx, t.kg, t.kgHa != null ? t.kgHa / 1000 : null, t.sujo, t.benef, t.vend, t.desc, t.kg ? t.desc / t.kg * 100 : null]) },
    { nome: 'Lotes de venda', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Lote', larg: 20 }, { rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'Destino', larg: 12 }, { rot: 'Tipo', larg: 11 }, { rot: 'Certificação', larg: 15 }, { rot: 'Cargas', larg: 7, tipo: 'num', casas: 0 },
        { rot: 'Peso colhido (kg)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Peso vendido (kg)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Rastreabilidade', larg: 22 }, { rot: 'NF-e', larg: 60 }, { rot: 'Evidência', larg: 40 }],
      linhas: k.lotes.map(lv => { const s = somar(B.cargas.filter(c => c.lote_venda_id === lv.id), k.vend); return [lv.codigo, lv.data, lv.destino || '', lv.tipo || '', lv.certificacao || '', s.n, s.kg, lv.peso_vendido != null ? Number(lv.peso_vendido) : null, lv.rastreio || '', lv.nfs || '', lv.evid_url || '']; }) },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_BALANCO = ['bmPainel', 'bmRastreio', 'bmLotes', 'bmFechamento'];
const DESENHO = { bmPainel: desenharPainel, bmRastreio: desenharRastreio, bmLotes: desenharLotes, bmFechamento: desenharFechamento };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirBalanco(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!B.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o balanço de massa…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o balanço de massa: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgBm')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparBalanco() {
  Object.assign(B, { carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [] });
  Object.assign(B.f, { safra: '', faz: null }); Object.assign(B.fr, { q: '', talhao: '', lote: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _bm = { B, resumo, rateio };
