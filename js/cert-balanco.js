// cert-balanco.js — Certificação › Balanço de massa (FORM 013), 26/10/2026.
//
// Pedido do Guilherme: "a de 2026 é o modelo … pegue os dados de 2025 e 2024";
// depois, explicando a planilha parte por parte: "vamos fazer melhor, pesquise
// sobre rastreabilidade, quero deixar fácil de entender, e preciso colocar sobre
// o calibre do abacate hass, a qtde % de cada um", "quero um campo para colocar
// a qtde de cat 1, cat 2 e cat 3 de cada boletim feito do lavador" e "preciso
// apresentar para o auditor essa rastreabilidade, como o modo visualização que
// apareça tudo".
//
// A cadeia (GLOBALG.A.P.: "um passo atrás, um passo à frente"):
//   1. Talhão            — cp_plantios (Colheita e Produção), com a produção prevista
//   2. Carga             — cp_cargas: controle de carregamento da fazenda (data, placa,
//                          ticket da fazenda, caixas, ticket da balança)
//   3. Balança           — cp_balanca: relatório de pesagens da Coopadap; o ticket liga
//                          a carga ao peso líquido. Caminhão com dois talhões = duas
//                          linhas com o % de cada uma (pct_carga).
//   4. Boletim do lavador — cp_lotes_venda: junta várias cargas; Cat 1/2/3 e refugo
//                          digitados do boletim. Carga suja = lote "NF …" sem boletim.
//   5. Notas de venda    — cp_vendas_itens: linhas do relatório de vendas da Coopadap
//                          (NF × material). O material diz calibre (T12…T32 = frutos
//                          por caixa de 4 kg), categoria e embalagem.
// Contas: colhido = peso da balança (× % da linha); vendido do lote = soma das
// notas dele (sem notas, o número digitado); o vendido é repartido entre as
// cargas pelo peso; descarte = colhido − vendido.
// Tabelas: supabase/cert-balanco.sql. Sem internet: só consulta ('balanco.cache').

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx, lerPlanilha } from './excel.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const semAc = s => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const t = String(v ?? '').trim(); if (!t) return null; const n = parseFloat(t.replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const fmt = (n, c = 0) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const pct = (a, b, c = 1) => b ? fmt(a / b * 100, c) + '%' : '—';
const doisD = n => String(n).padStart(2, '0');
const isoD = d => `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`;
const hoje = () => isoD(new Date());
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const ddmm = s => s ? br(s).slice(0, 5) : '—';
const dias = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) + 1 : 0;
const ehSujo = c => /suj/i.test(c.tipo || '');
const ton = kg => fmt(kg / 1000, 1) + ' t';

const FORM = { codigo: 'FORM 013', alt: 'FMAGR-013', titulo: 'Balanço de massa', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
const COLHEITA_URL = 'colheita/';
/* Calibre do Hass = nº de frutos numa caixa de 4 kg. Faixas de peso do código de
   tamanho do Codex/UNECE para abacate (o 32 não consta da tabela). */
const REF_CAL = { 10: '364–462 g', 12: '300–371 g', 14: '258–313 g', 16: '227–274 g', 18: '203–243 g', 20: '184–217 g',
  22: '165–196 g', 24: '151–175 g', 26: '144–157 g', 28: '134–147 g', 30: '123–137 g', 32: 'abaixo de 123 g', 34: 'abaixo de 123 g' };
const faixaCal = c => c <= 16 ? 'graudo' : c <= 22 ? 'medio' : 'miudo';
const ROT_FAIXA = { graudo: 'Graúdos (T10–T16)', medio: 'Médios (T18–T22)', miudo: 'Miúdos (T24–T32)' };
const CATS = [['cat1_kg', 'Cat 1'], ['cat2_kg', 'Cat 2'], ['cat3_kg', 'Cat 3'], ['refugo_kg', 'Refugo']];

/* ---------------- estado ---------------- */
const B = {
  carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [], itens: [], balanca: [],
  f: { safra: '', faz: null }, fr: { q: '', ver: 'cadeia' }, fv: { q: '', lote: '' },
};
const CAIXA = 'balanco.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { cult: B.cult, safras: B.safras, plantios: B.plantios, cargas: B.cargas, lotes: B.lotes, itens: B.itens, balanca: B.balanca });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !B.carregado) { Object.assign(B, { cult: c0.cult, safras: c0.safras || [], plantios: c0.plantios || [], cargas: c0.cargas || [], lotes: c0.lotes || [], itens: c0.itens || [], balanca: c0.balanca || [] }); B.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (B.carregado) return;
    throw new Error('Sem internet e sem cópia do balanço de massa neste aparelho.');
  }
  const cu = await c.from('cp_culturas').select('*').eq('slug', 'abacate').maybeSingle();
  if (cu.error) { if (B.carregado) return; throw new Error(/permission|policy|does not exist/i.test(cu.error.message) ? 'As tabelas da Colheita não estão liberadas para a Certificação (supabase/cert-balanco.sql).' : cu.error.message); }
  if (!cu.data) throw new Error('A cultura Abacate não está cadastrada na Colheita e Produção.');
  const id = cu.data.id;
  const [s, p, g, l, it, ba] = await Promise.all([
    c.from('cp_safras').select('*').eq('cultura_id', id).eq('ativo', true),
    c.from('cp_plantios').select('*').eq('cultura_id', id),
    c.from('cp_cargas').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
    c.from('cp_lotes_venda').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
    c.from('cp_vendas_itens').select('*').eq('cultura_id', id).eq('ativo', true).order('data').range(0, 9999),
    c.from('cp_balanca').select('id,ticket,data,placa,motorista,peso_bruto,peso_liquido,safra_id').eq('cultura_id', id).range(0, 9999),
  ]);
  const erro = s.error || p.error || g.error || l.error || it.error;
  if (erro) { if (B.carregado) return; throw erro; }
  Object.assign(B, { cult: cu.data, safras: s.data || [], plantios: p.data || [], cargas: g.data || [], lotes: l.data || [], itens: it.data || [], balanca: ba.error ? [] : ba.data || [], carregado: true });
  salvarCaixa();
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const plantio = id => B.plantios.find(p => p.id === id) || null;
const lote = id => B.lotes.find(l => l.id === id) || null;
const fazDe = c => plantio(c.plantio_id)?.fazenda || '—';
const ef = c => (c.pct_carga == null || c.pct_carga === '' ? 100 : Number(c.pct_carga)) / 100;
const kgC = c => Number(c.peso_liquido || 0) * ef(c);
const cxC = c => Number(c.quantidade || 0) * ef(c);
const dividida = c => ef(c) < 0.9999;
const safrasOrd = () => B.safras.slice().sort((a, b) => String(b.nome).localeCompare(String(a.nome), 'pt-BR', { numeric: true }));
const safraPadrao = () => (safrasOrd().find(s => B.cargas.some(c => c.safra_id === s.id)) || safrasOrd()[0])?.id || '';
const safraNome = id => B.safras.find(s => s.id === id)?.nome || '';
const fazendas = safraId => [...new Set(B.plantios.filter(p => !safraId || p.safra_id === safraId).map(p => p.fazenda).filter(Boolean))].sort();
function fazPadrao(safraId) { const com = [...new Set(B.cargas.filter(c => c.safra_id === safraId).map(fazDe))]; return com.includes('Faz. Faca') ? 'Faz. Faca' : ''; }
const cargasDoLote = id => B.cargas.filter(c => c.lote_venda_id === id);
const itensDoLote = id => B.itens.filter(i => i.lote_venda_id === id);
const entradaLote = l => cargasDoLote(l.id).reduce((s, c) => s + kgC(c), 0);
/** Vendido do lote: a soma das notas; sem notas, o que foi digitado. */
function vendidoLote(l) { const it = itensDoLote(l.id); return it.length ? it.reduce((s, i) => s + Number(i.kg || 0), 0) : (l.peso_vendido != null ? Number(l.peso_vendido) : null); }
const balancaDe = c => c.ticket_balanca ? B.balanca.find(b => String(b.ticket) === String(c.ticket_balanca)) : null;
function rateio() {
  const m = new Map(), ent = {}, vend = {};
  for (const l of B.lotes) { ent[l.id] = entradaLote(l); vend[l.id] = vendidoLote(l); }
  for (const c of B.cargas) { const l = c.lote_venda_id; m.set(c.id, l && vend[l] != null && ent[l] ? vend[l] * kgC(c) / ent[l] : null); }
  return m;
}
function somar(lista, vend) {
  const r = { n: lista.length, cx: 0, kg: 0, benef: 0, sujo: 0, vend: 0, semVenda: 0, ini: '', fim: '' };
  for (const c of lista) {
    const kg = kgC(c);
    r.cx += cxC(c); r.kg += kg;
    if (ehSujo(c)) r.sujo += kg; else r.benef += kg;
    const v = vend.get(c.id);
    if (v == null) { if (kg) r.semVenda++; } else r.vend += v;
    if (kg || c.quantidade) { if (!r.ini || c.data < r.ini) r.ini = c.data; if (!r.fim || c.data > r.fim) r.fim = c.data; }
  }
  r.desc = r.kg - r.vend; r.perda = r.kg ? r.desc / r.kg : 0;
  return r;
}
/** Categorias (boletim) e calibres (notas) das cargas da lista: cada lote entra com a fração do peso dele que está na lista. */
function classif(cargas) {
  const porLote = new Map();
  for (const c of cargas) if (c.lote_venda_id) porLote.set(c.lote_venda_id, (porLote.get(c.lote_venda_id) || 0) + kgC(c));
  const cat = { cat1_kg: 0, cat2_kg: 0, cat3_kg: 0, refugo_kg: 0, base: 0, lotes: 0 };
  const cal = new Map(); const catNotas = { 'CAT 1': 0, 'CAT 2': 0, 'CAT 3': 0, Sujo: 0, Outros: 0 };
  for (const [id, kg] of porLote) {
    const l = lote(id); if (!l) continue;
    const ent = entradaLote(l); const f = ent ? kg / ent : 0;
    if (CATS.some(([k]) => l[k] != null)) { cat.lotes++; cat.base += kg; for (const [k] of CATS) cat[k] += Number(l[k] || 0) * f; }
    for (const i of itensDoLote(id)) {
      const q = Number(i.kg || 0) * f;
      catNotas[i.categoria in catNotas ? i.categoria : 'Outros'] += q;
      if (i.calibre) { const x = cal.get(i.calibre) || { kg: 0, c1: 0, c2: 0, cx: 0 }; x.kg += q; if (i.categoria === 'CAT 1') x.c1 += q; else x.c2 += q; x.cx += Number(i.caixas || 0) * f; cal.set(i.calibre, x); }
    }
  }
  const totCal = [...cal.values()].reduce((s, x) => s + x.kg, 0);
  const calibres = [...cal.entries()].sort((a, b) => a[0] - b[0]).map(([c, x]) => ({ c, ...x, p: totCal ? x.kg / totCal : 0 }));
  const faixas = { graudo: 0, medio: 0, miudo: 0 }; for (const x of calibres) faixas[faixaCal(x.c)] += x.kg;
  const top = calibres.slice().sort((a, b) => b.kg - a.kg)[0] || null;
  const somaCat = CATS.reduce((s, [k]) => s + cat[k], 0);
  return { cat, somaCat, calibres, totCal, faixas, top, catNotas };
}
/** Tudo o que o painel, o FORM, a apresentação e o Excel usam para uma safra (e uma propriedade). */
function resumo(safraId, faz) {
  const vend = rateio();
  const cargas = B.cargas.filter(c => c.safra_id === safraId && (!faz || fazDe(c) === faz));
  const pls = B.plantios.filter(p => p.safra_id === safraId && (!faz || p.fazenda === faz))
    .sort((a, b) => String(a.fazenda).localeCompare(String(b.fazenda)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
  const talhoes = pls.map(p => {
    const cs = cargas.filter(c => c.plantio_id === p.id);
    const s = somar(cs, vend);
    const area = Number(p.area || 0), exp = p.expectativa_kg != null ? Number(p.expectativa_kg) : null;
    return { p, ...s, cs, area, exp, kgHa: area && s.kg ? s.kg / area : null, vendHa: area && s.vend ? s.vend / area : null, aprov: exp ? s.kg / exp : null, cl: classif(cs) };
  });
  const tot = somar(cargas, vend);
  const area = talhoes.filter(t => t.n).reduce((s, t) => s + t.area, 0) || talhoes.reduce((s, t) => s + t.area, 0);
  const expTot = talhoes.some(t => t.exp != null) ? talhoes.reduce((s, t) => s + (t.exp || 0), 0) : null;
  const ids = new Set(cargas.map(c => c.lote_venda_id).filter(Boolean));
  const lotes = B.lotes.filter(l => ids.has(l.id) || (l.safra_id === safraId && !faz && !cargasDoLote(l.id).length))
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  return { safraId, faz, cargas, talhoes, tot, area, expTot, vend, lotes, cl: classif(cargas),
    kgHa: area ? tot.kg / area : null, vendHa: area ? tot.vend / area : null, kgCx: tot.cx ? tot.kg / tot.cx : null,
    lotesVazios: lotes.filter(l => !cargasDoLote(l.id).length),
    itensSemLote: B.itens.filter(i => i.safra_id === safraId && !i.lote_venda_id) };
}
/** Um passo atrás, um passo à frente: acha o lote a partir de NF, boletim, placa, ticket ou código de rastreio. */
function rastrear(txt, safraId) {
  const q = semAc(txt).replace(/^0+/, ''); if (q.length < 2) return [];
  const bate = v => { const s = semAc(v); return s && (s === q || s.replace(/^0+/, '') === q || s.includes(q)); };
  const achados = new Map();
  const add = (l, porque) => { if (l && (!safraId || l.safra_id === safraId)) { const a = achados.get(l.id) || { l, porque: new Set() }; a.porque.add(porque); achados.set(l.id, a); } };
  for (const l of B.lotes) { if (bate(l.codigo) || bate(l.rastreio)) add(l, 'lote'); if (String(l.nfs || '').split(/[\s,/;]+/).some(bate)) add(l, 'NF do lote'); }
  for (const i of B.itens) if (bate(i.nf) || bate(i.boletim)) add(lote(i.lote_venda_id), 'NF ' + i.nf);
  for (const c of B.cargas) if ([c.placa, c.ticket_faz, c.ticket_balanca, c.nf, c.boletim, c.rastreio].some(bate)) add(lote(c.lote_venda_id), `carga ${br(c.data)} ${c.placa || ''}`);
  return [...achados.values()];
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
const nomeTal = c => plantio(c.plantio_id)?.nome || '?';

/* ---------- peças de categoria e calibre (tela, apresentação e impresso) ---------- */
function barraCats(o, base, rel) {
  const tot = CATS.reduce((s, [k]) => s + Number(o[k] || 0), 0); if (!tot) return '';
  return `<div class="bm-cats${rel ? ' bm-cats-rel' : ''}">${CATS.map(([k, r], i) => Number(o[k]) ? `<i class="bm-c${i + 1}" style="flex:${Number(o[k])}" title="${r}: ${fmt(o[k])} kg">${Number(o[k]) / tot > 0.07 ? `${r} ${pct(Number(o[k]), tot, 0)}` : ''}</i>` : '').join('')}</div>
    <p class="${rel ? 'rel-nota' : 'dica'}" style="margin:4px 0 0">${CATS.filter(([k]) => Number(o[k])).map(([k, r]) => `${r}: <b>${fmt(o[k])} kg</b> (${pct(Number(o[k]), tot)})`).join(' · ')}${base ? ` · soma ${fmt(tot)} de ${fmt(base)} kg que entraram (${pct(tot, base, 0)})` : ''}</p>`;
}
function graficoCal(cl, rel) {
  if (!cl.calibres.length) return `<p class="${rel ? 'rel-nota' : 'dica'}">Sem notas de venda com calibre neste recorte.</p>`;
  const max = Math.max(...cl.calibres.map(x => x.p), 0.0001);
  return `<div class="bm-cal${rel ? ' bm-cal-rel' : ''}">${cl.calibres.map(x => `<div class="bm-calc" title="T${x.c} (${REF_CAL[x.c] || ''}): ${fmt(x.kg)} kg · ${pct(x.kg, cl.totCal)}">
      <span class="bm-calp">${fmt(x.p * 100, 1)}%</span>
      <div class="bm-calb" style="height:${Math.max(2, Math.round(x.p / max * 100))}%"><i class="bm-c1" style="flex:${x.c1}"></i><i class="bm-c2" style="flex:${x.c2}"></i></div>
      <span class="bm-caln">T${x.c}</span><span class="bm-calg">${esc((REF_CAL[x.c] || '').replace(' g', ''))}</span></div>`).join('')}</div>
    <p class="${rel ? 'rel-nota' : 'dica'}" style="margin:4px 0 0"><span class="en-leg bm-c1"></span> Cat 1 <span class="en-leg bm-c2"></span> Cat 2 · % do peso vendido em caixas com calibre (${fmt(cl.totCal)} kg) · faixa de peso do fruto em gramas</p>
    <div class="bm-faixas">${Object.entries(ROT_FAIXA).map(([k, r]) => `<span><b>${pct(cl.faixas[k], cl.totCal, 0)}</b> ${r}</span>`).join('')}${cl.top ? `<span>Calibre que mais saiu: <b>T${cl.top.c}</b> (${pct(cl.top.kg, cl.totCal, 0)})</span>` : ''}</div>`;
}
function tabelaCal(cl, rel) {
  if (!cl.calibres.length) return '';
  const cls = rel ? 'rel-tabela bm-rel' : 'dc-planilha bm-tab';
  return `<table class="${cls}"><thead><tr><th>Calibre</th><th>Peso do fruto</th><th class="ce">Cat 1 (kg)</th><th class="ce">Cat 2 (kg)</th><th class="ce">Total (kg)</th><th class="ce">%</th></tr></thead><tbody>
    ${cl.calibres.map(x => `<tr><td><b>T${x.c}</b></td><td>${esc(REF_CAL[x.c] || '—')}</td><td class="ce rel-num">${fmt(x.c1)}</td><td class="ce rel-num">${fmt(x.c2)}</td><td class="ce rel-num">${fmt(x.kg)}</td><td class="ce rel-num"><b>${pct(x.kg, cl.totCal)}</b></td></tr>`).join('')}
    <tr class="en-total"><td colspan="2"><b>Total</b></td><td class="ce rel-num">${fmt(cl.calibres.reduce((s, x) => s + x.c1, 0))}</td><td class="ce rel-num">${fmt(cl.calibres.reduce((s, x) => s + x.c2, 0))}</td><td class="ce rel-num"><b>${fmt(cl.totCal)}</b></td><td class="ce rel-num">100%</td></tr></tbody></table>`;
}
const EXPLICA_CAL = 'Calibre do Hass = quantos frutos cabem numa caixa de 4 kg: quanto menor o número, maior o fruto (T12 ≈ 300–371 g; T30 ≈ 123–137 g).';

/* ---------- a cadeia de um lote (tela, apresentação e impresso) ---------- */
function cadeiaLote(l, k, rel = false) {
  const cs = cargasDoLote(l.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const ent = entradaLote(l), vend = vendidoLote(l), it = itensDoLote(l.id);
  const nfs = [...new Set(it.map(i => i.nf))];
  const cl = classif(cs);
  const tals = [...new Set(cs.map(nomeTal))];
  const suj = /suj/i.test(l.tipo || '');
  const T = rel ? 'rel-tabela bm-rel' : 'dc-planilha bm-tab';
  return `<article class="bm-cadeia${rel ? ' bm-cadeia-rel' : ''}">
    <header class="bm-cad-cab"><div><h3>${esc(l.codigo)}</h3><p>${esc(l.destino || 'packing house não informado')} · ${esc(l.tipo || '')}${l.certificacao ? ' · ' + esc(l.certificacao) : ''}${l.rastreio ? ' · rastreio ' + esc(l.rastreio) : ''}</p></div>
      <div class="bm-cad-num"><span>entrou <b>${fmt(ent)} kg</b></span><span>vendido <b>${fmt(vend)} kg</b></span><span>descarte <b>${vend != null && ent ? pct(ent - vend, ent) : '—'}</b></span></div></header>
    <ol class="bm-passos">
      <li><span class="bm-pn">1</span><div><b>Talhão</b><p>${tals.map(esc).join(', ') || '—'}</p></div></li>
      <li><span class="bm-pn">2</span><div><b>Colheita</b><p>${cs.length} carga(s) · ${fmt(cs.reduce((s, c) => s + cxC(c), 0))} cx · ${cs.length ? `${br(cs[0].data)} a ${br(cs[cs.length - 1].data)}` : '—'}</p></div></li>
      <li><span class="bm-pn">3</span><div><b>Balança</b><p>${fmt(ent)} kg · ${[...new Set(cs.map(c => c.ticket_balanca).filter(Boolean))].length} ticket(s)</p></div></li>
      <li><span class="bm-pn">4</span><div><b>${suj ? 'Carga suja' : 'Boletim do lavador'}</b><p>${suj ? 'vendida sem beneficiar' : CATS.some(([kk]) => l[kk] != null) ? CATS.filter(([kk]) => Number(l[kk])).map(([kk, r]) => `${r} ${pct(Number(l[kk]), CATS.reduce((s, [x]) => s + Number(l[x] || 0), 0), 0)}`).join(' · ') : 'categorias não lançadas'}</p></div></li>
      <li><span class="bm-pn">5</span><div><b>Venda</b><p>${nfs.length ? `${nfs.length} NF-e` : esc(l.nfs ? String(l.nfs).split(/[,/]/).length + ' NF-e' : '—')} · ${fmt(vend)} kg</p></div></li>
    </ol>
    <table class="${T}"><thead><tr><th>Data</th><th>Placa</th><th>Ticket faz.</th><th>Talhão</th><th class="ce">Caixas</th><th>Ticket balança</th><th class="ce">Peso (kg)</th><th class="ce">Vendido (kg)</th></tr></thead><tbody>
      ${cs.map(c => { const b = balancaDe(c), v = k?.vend?.get(c.id); return `<tr><td>${br(c.data)}</td><td>${esc(c.placa || '')}</td><td>${esc(c.ticket_faz || '')}</td><td>${esc(nomeTal(c))}</td>
        <td class="ce rel-num">${fmt(cxC(c))}${dividida(c) ? ` <small>(${fmt(ef(c) * 100, 0)}% do caminhão)</small>` : ''}</td><td>${esc(c.ticket_balanca || '—')}${b ? ' ✓' : ''}</td><td class="ce rel-num">${fmt(kgC(c))}</td><td class="ce rel-num">${v != null ? fmt(v) : '—'}</td></tr>`; }).join('')}</tbody></table>
    ${!suj && CATS.some(([kk]) => Number(l[kk])) ? `<p class="${rel ? 'rel-secao' : 'bm-sub'}">Boletim do lavador — categorias</p>${barraCats(l, ent, rel)}` : ''}
    ${cl.calibres.length ? `<p class="${rel ? 'rel-secao' : 'bm-sub'}">Calibres vendidos</p>${graficoCal(cl, rel)}` : ''}
    ${nfs.length ? `<p class="${rel ? 'rel-secao' : 'bm-sub'}">Notas de venda (${nfs.length})</p><p class="${rel ? 'rel-nota' : 'bm-nfs'}">${nfs.map(n => { const s = it.filter(i => i.nf === n); return `<span>${esc(n)} · ${br(s[0].data)} · ${fmt(s.reduce((a, i) => a + Number(i.kg || 0), 0))} kg</span>`; }).join('')}</p>`
      : l.nfs ? `<p class="${rel ? 'rel-nota' : 'bm-nfs'}">NF-e: ${esc(l.nfs)}</p>` : ''}
  </article>`;
}

/* ===================================================================
   TELA · PAINEL (FORM 013)
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
      <p class="dica" style="margin:4px 0 0">${pct(t.benef, t.kg, 0)} benef. · ${pct(t.sujo, t.kg, 0)} sujo · perda ${pct(t.desc, t.kg)} · ${fmt(t.kgHa / 1000, 1)} t/ha${t.cl.top ? ` · calibre que mais saiu T${t.cl.top.c}` : ''}</p>` : '<p class="dica">Sem carga nesta safra.</p>'}
  </div>`;
}
function tabelaBalanco(k) {
  const L = k.talhoes;
  return `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr>
    <th>Talhão</th><th>Variedade</th><th class="ce">Área (ha)</th><th class="ce">Início</th><th class="ce">Fim</th><th class="ce bm-digita">Produção prevista (kg)</th><th class="ce">Caixas</th>
    <th class="ce">Peso líq. colhido (kg)</th><th class="ce">Produção (t/ha)</th><th class="ce">% aprov.</th><th class="ce">Peso sujo</th><th class="ce">Peso benef.</th><th class="ce">Peso vendido</th><th class="ce">Descarte</th><th class="ce">% perda</th></tr></thead><tbody>
    ${L.map(t => `<tr${t.n ? '' : ' class="cf-inativa"'}><td><b>${esc(t.p.nome)}</b><br><small class="dica">${esc(t.p.fazenda || '')}</small></td><td>${esc(t.p.variedade || '')}</td>
      <td class="ce">${fmt(t.area, 2)}</td><td class="ce">${t.n ? br(t.ini) : '—'}</td><td class="ce">${t.n ? br(t.fim) : '—'}</td>
      <td class="ce bm-digita"><input type="text" inputmode="decimal" class="bm-exp" data-exp="${esc(t.p.id)}" value="${t.exp != null ? esc(fmt(t.exp)) : ''}" placeholder="digite" aria-label="Produção prevista de ${esc(t.p.nome)} em kg"></td>
      <td class="ce">${fmt(t.cx)}</td><td class="ce"><b>${fmt(t.kg)}</b></td><td class="ce">${t.kgHa != null ? fmt(t.kgHa / 1000, 2) : '—'}</td><td class="ce">${t.aprov != null ? fmt(t.aprov * 100, 0) + '%' : '—'}</td>
      <td class="ce">${fmt(t.sujo)}</td><td class="ce">${fmt(t.benef)}</td><td class="ce">${fmt(t.vend)}</td><td class="ce">${fmt(t.desc)}</td><td class="ce">${t.kg ? pct(t.desc, t.kg) : '—'}</td></tr>`).join('')}
    <tr class="en-total"><td colspan="2">Total</td><td class="ce">${fmt(k.area, 2)}</td><td class="ce">${br(k.tot.ini)}</td><td class="ce">${br(k.tot.fim)}</td><td class="ce">${k.expTot != null ? fmt(k.expTot) : '—'}</td>
      <td class="ce">${fmt(k.tot.cx)}</td><td class="ce">${fmt(k.tot.kg)}</td><td class="ce">${k.kgHa != null ? fmt(k.kgHa / 1000, 2) : '—'}</td><td class="ce">${k.expTot ? fmt(k.tot.kg / k.expTot * 100, 0) + '%' : '—'}</td>
      <td class="ce">${fmt(k.tot.sujo)}</td><td class="ce">${fmt(k.tot.benef)}</td><td class="ce">${fmt(k.tot.vend)}</td><td class="ce">${fmt(k.tot.desc)}</td><td class="ce">${pct(k.tot.desc, k.tot.kg)}</td></tr>
  </tbody></table></div>`;
}
function tabelaCatTalhao(k, rel) {
  const L = k.talhoes.filter(t => t.n && (t.cl.somaCat || t.cl.totCal));
  if (!L.length) return '';
  const cls = rel ? 'rel-tabela bm-rel' : 'dc-planilha bm-tab';
  const c = (o, kk) => o.somaCat ? `${fmt(o.cat[kk])} <small>(${pct(o.cat[kk], o.somaCat, 0)})</small>` : '—';
  return `<table class="${cls}"><thead><tr><th>Talhão</th><th class="ce">Beneficiado (kg)</th>${CATS.map(([, r]) => `<th class="ce">${r} (kg)</th>`).join('')}<th class="ce">Graúdos</th><th class="ce">Médios</th><th class="ce">Miúdos</th><th class="ce">Calibre que mais saiu</th></tr></thead><tbody>
    ${L.map(t => `<tr><td><b>${esc(t.p.nome)}</b></td><td class="ce rel-num">${fmt(t.benef)}</td>${CATS.map(([kk]) => `<td class="ce rel-num">${c(t.cl, kk)}</td>`).join('')}
      ${['graudo', 'medio', 'miudo'].map(f => `<td class="ce rel-num">${pct(t.cl.faixas[f], t.cl.totCal, 0)}</td>`).join('')}<td class="ce">${t.cl.top ? 'T' + t.cl.top.c : '—'}</td></tr>`).join('')}
    <tr class="en-total"><td>Total</td><td class="ce rel-num">${fmt(k.tot.benef)}</td>${CATS.map(([kk]) => `<td class="ce rel-num">${c(k.cl, kk)}</td>`).join('')}
      ${['graudo', 'medio', 'miudo'].map(f => `<td class="ce rel-num">${pct(k.cl.faixas[f], k.cl.totCal, 0)}</td>`).join('')}<td class="ce">${k.cl.top ? 'T' + k.cl.top.c : '—'}</td></tr></tbody></table>`;
}
function avisosDe(k) {
  const a = [];
  if (k.tot.semVenda) a.push(`${k.tot.semVenda} carga(s) sem boletim/lote de venda — o vendido delas conta como zero. Ligue em <b>Boletins e vendas</b>.`);
  const semBal = k.cargas.filter(c => Number(c.peso_liquido) && !balancaDe(c) && B.balanca.some(b => b.safra_id === c.safra_id)).length;
  if (semBal) a.push(`${semBal} carga(s) sem o ticket no relatório da balança importado.`);
  const semCat = k.lotes.filter(l => !/suj/i.test(l.tipo || '') && cargasDoLote(l.id).length && !CATS.some(([kk]) => l[kk] != null)).length;
  if (semCat) a.push(`${semCat} boletim(ns) do lavador sem Cat 1 / Cat 2 / Cat 3 lançadas.`);
  if (k.lotesVazios.length) a.push(`${k.lotesVazios.length} lote(s) de venda sem carga ligada.`);
  if (k.itensSemLote.length) a.push(`${k.itensSemLote.length} linha(s) de nota sem boletim (${fmt(k.itensSemLote.reduce((s, i) => s + Number(i.kg || 0), 0))} kg) — fora do balanço.`);
  return a;
}
function desenharPainel() {
  const tela = $('telaBmPainel');
  const fil = filtros();
  const k = resumo(B.f.safra, B.f.faz);
  const t = k.tot;
  const av = avisosDe(k);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Balanço de massa — Abacate', `${FORM.codigo} · o resultado da rastreabilidade: talhão → carga → balança → boletim → venda. Você só digita a produção prevista; o resto vem das cargas e das notas.`,
      `<button class="btn principal" type="button" id="bmApr">▶ Apresentar ao auditor</button>`)}
    <div class="grade larga" style="margin-top:12px">${fil}</div>
    ${k.cargas.length ? `
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Janela de colheita', `${dias(t.ini, t.fim)} dias`, `${ddmm(t.ini)} a ${ddmm(t.fim)}`)}
      ${cartao('calma', 'Caixas colhidas', fmt(t.cx), k.talhoes.filter(x => x.n).map(x => `${fmt(x.cx)} ${x.p.nome.replace('Talhão ', 'T')}`).join(' · '), 'bmRastreio')}
      ${cartao('calma', 'Peso colhido', ton(t.kg), `${pct(t.benef, t.kg, 0)} benef. · ${pct(t.sujo, t.kg, 0)} sujo`)}
      ${cartao('calma', 'Peso vendido', ton(t.vend), `${pct(t.vend, t.kg)} do peso colhido`, 'bmLotes')}
      ${cartao(t.perda > .2 ? 'alerta' : t.perda > .1 ? 'atencao' : 'calma', 'Descarte', pct(t.desc, t.kg), `${fmt(t.desc)} kg`)}
      ${cartao('calma', 'Produção', k.kgHa != null ? fmt(k.kgHa / 1000, 1) + ' t/ha' : '—', `${fmt(k.area, 2)} ha · ${fmt(k.kgCx, 1)} kg/cx`, 'bmFechamento')}
      ${k.cl.somaCat ? cartao('calma', 'Cat 1 no lavador', pct(k.cl.cat.cat1_kg, k.cl.somaCat, 0), `Cat 2 ${pct(k.cl.cat.cat2_kg, k.cl.somaCat, 0)} · Cat 3 ${pct(k.cl.cat.cat3_kg, k.cl.somaCat, 0)}`) : ''}
      ${k.cl.top ? cartao('calma', 'Calibre que mais saiu', 'T' + k.cl.top.c, `${pct(k.cl.top.kg, k.cl.totCal, 0)} · graúdos ${pct(k.cl.faixas.graudo, k.cl.totCal, 0)}`) : ''}
    </div>
    ${av.length ? `<div class="aviso" style="margin-top:12px">${av.join('<br>')}</div>` : ''}
    <div class="qp-bloco"><h3>Balanço por talhão</h3>${tabelaBalanco(k)}
      <p class="dica" style="margin-top:6px">A coluna verde é a única que você digita (salva ao sair do campo). Área e variedade vêm do cadastro do talhão na Colheita e Produção.</p></div>
    <div class="qp-bloco"><h3>Detalhamento por talhão</h3><div class="bm-talhoes">${k.talhoes.filter(x => x.n).map(blocoTalhao).join('')}</div></div>
    <div class="qp-bloco"><h3>Categorias do boletim do lavador</h3>${k.cl.somaCat ? barraCats(k.cl.cat, k.tot.benef) : '<p class="dica">Nenhum boletim com Cat 1 / 2 / 3 lançadas neste recorte. Lance em <b>Boletins e vendas</b>.</p>'}
      <div class="ac-rola" style="margin-top:8px">${tabelaCatTalhao(k)}</div></div>
    <div class="qp-bloco"><h3>Calibres do Hass vendidos</h3><p class="dica" style="margin:0 0 6px">${EXPLICA_CAL}</p>${graficoCal(k.cl)}
      <details style="margin-top:8px"><summary class="ce-link">Ver a tabela de calibres</summary><div class="ac-rola">${tabelaCal(k.cl)}</div></details></div>`
    : '<div class="vazio" style="margin-top:12px">Nenhuma carga nesta safra ainda. As cargas são lançadas na Colheita e Produção.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="bmImpForm">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="bmImpTudo">Imprimir a rastreabilidade completa</button>
    <button class="btn" type="button" id="bmXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharPainel);
  $('bmApr').addEventListener('click', () => apresentar());
  $('bmImpForm').addEventListener('click', () => mostrar(docForm(k), { barra: true }));
  $('bmImpTudo').addEventListener('click', () => mostrar(docCompleto(k), { barra: true }));
  $('bmXlsx').addEventListener('click', () => exportar(k));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', b.dataset.ir)));
  tela.querySelectorAll('[data-exp]').forEach(inp => inp.addEventListener('change', () => salvarExpectativa(inp)));
}
async function salvarExpectativa(inp) {
  if (precisaRede()) return;
  const p = plantio(inp.dataset.exp); if (!p) return;
  const v = num(inp.value);
  if (Number.isNaN(v) || (v != null && v < 0)) { inp.classList.add('bm-erro'); return; }
  inp.disabled = true;
  const { data, error } = await estado.cliente.from('cp_plantios').update({ expectativa_kg: v }).eq('id', p.id).select().single();
  if (error) { inp.disabled = false; inp.classList.add('bm-erro'); alert('Não consegui gravar: ' + error.message); return; }
  trocar(B.plantios, data); salvarCaixa(); redesenhar();
}

/* ===================================================================
   TELA · RASTREABILIDADE (a cadeia de cada boletim, e o "rastrear")
   =================================================================== */
const PASSOS = [['Talhão', 'onde foi colhido'], ['Carga', 'controle de carregamento da fazenda'], ['Balança', 'ticket da Coopadap = peso líquido'],
  ['Boletim do lavador', 'junta as cargas · Cat 1, 2 e 3'], ['Notas de venda', 'calibre, categoria e peso vendido']];
const fluxo = () => `<ol class="bm-fluxo">${PASSOS.map(([t, d], i) => `<li><span class="bm-pn">${i + 1}</span><b>${t}</b><small>${d}</small></li>`).join('')}</ol>`;
function desenharRastreio() {
  const tela = $('telaBmRastreio');
  const fil = filtros();
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Rastreabilidade', 'Um passo atrás e um passo à frente: de qualquer nota de venda se chega ao talhão, e de qualquer carga se chega às notas.',
      `<button class="btn principal" type="button" id="brApr">▶ Apresentar ao auditor</button>`)}
    ${fluxo()}
    <div class="grade larga" style="margin-top:12px">${fil}
      <label class="campo" style="grid-column:span 2">Rastrear <input type="search" id="brQ" value="${esc(B.fr.q)}" placeholder="NF, boletim, placa, ticket da fazenda ou da balança, código de rastreio"></label>
      <label class="campo">Mostrar <select id="brVer">${opcoes([['cadeia', 'A cadeia de cada boletim'], ['tabela', 'Tabela de cargas']], B.fr.ver)}</select></label>
    </div>
    <div id="brCorpo" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="brImp">Imprimir a rastreabilidade completa</button>
    <button class="btn" type="button" id="brTeste">Imprimir teste de rastreabilidade</button>
    <button class="btn" type="button" id="brXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharRastreio);
  $('brQ').addEventListener('input', e => { B.fr.q = e.target.value; corpoRastreio(); });
  $('brVer').addEventListener('change', e => { B.fr.ver = e.target.value; corpoRastreio(); });
  $('brApr').addEventListener('click', () => apresentar());
  $('brImp').addEventListener('click', () => mostrar(docCompleto(resumo(B.f.safra, B.f.faz)), { barra: true }));
  $('brTeste').addEventListener('click', () => { if (!so(B.fr.q)) return alert('Digite no "Rastrear" a NF (ou boletim, placa, ticket) que o auditor escolheu.'); mostrar(docTeste(B.fr.q), { barra: true }); });
  $('brXlsx').addEventListener('click', () => exportar(resumo(B.f.safra, B.f.faz)));
  corpoRastreio();
}
function corpoRastreio() {
  const k = resumo(B.f.safra, B.f.faz);
  const alvo = $('brCorpo'); if (!alvo) return;
  const q = so(B.fr.q);
  let lotes = k.lotes, cab = '';
  if (q) {
    const ach = rastrear(q, B.f.safra);
    lotes = ach.map(a => a.l);
    cab = ach.length ? `<div class="aviso ok">“${esc(q)}” leva a ${ach.length === 1 ? 'este lote' : ach.length + ' lotes'}: ${ach.map(a => `<b>${esc(a.l.codigo)}</b> (${esc([...a.porque].slice(0, 3).join(', '))})`).join(' · ')}</div>`
      : `<div class="aviso">Nada encontrado para “${esc(q)}” na safra ${esc(safraNome(B.f.safra))}.</div>`;
  }
  if (B.fr.ver === 'tabela') { alvo.innerHTML = cab + tabelaCargas(k, q ? new Set(lotes.map(l => l.id)) : null); ligarTabela(alvo); return; }
  const semLote = q ? [] : k.cargas.filter(c => !c.lote_venda_id && kgC(c));
  alvo.innerHTML = cab + (lotes.length ? lotes.map(l => `<div class="bm-cad-wrap">${cadeiaLote(l, k)}<div class="barra fim" style="margin:6px 0 0">
      ${evid(l.evid_url, 'Evidência da venda ↗')}<button class="btn mini" type="button" data-lv="${esc(l.id)}">Editar boletim / lote</button></div></div>`).join('') : '')
    + (semLote.length ? `<div class="aviso" style="margin-top:10px">Cargas sem boletim/lote: ${semLote.map(c => `${br(c.data)} ${esc(c.placa || '')} (${fmt(kgC(c))} kg)`).join(' · ')}</div>` : '');
  alvo.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => formLote(lote(b.dataset.lv))));
}
function tabelaCargas(k, filtroLotes) {
  const l = k.cargas.filter(c => !filtroLotes || filtroLotes.has(c.lote_venda_id)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const s = somar(l, k.vend);
  return l.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr>
    <th class="ce">Data</th><th>Placa</th><th class="ce">Ticket</th><th>Talhão</th><th class="ce">Caixas</th><th class="ce">Ticket bal.</th><th class="ce">Peso líq.</th><th class="ce">kg/cx</th>
    <th>Packing house</th><th>Tipo</th><th>Boletim / NF</th><th class="ce">Vendido</th><th class="ce">Descarte</th><th class="ce">%</th><th class="ce">Evid.</th><th></th></tr></thead><tbody>
    ${l.map(c => { const lv = lote(c.lote_venda_id), v = k.vend.get(c.id), kg = kgC(c), cx = cxC(c), b = balancaDe(c);
      return `<tr><td class="ce">${br(c.data)}</td><td>${esc(c.placa || '')}</td><td class="ce">${esc(c.ticket_faz || '')}</td><td>${esc(nomeTal(c))}${c.conferido ? ' <span title="Inspeção da colheita feita">✓</span>' : ''}</td>
        <td class="ce">${fmt(cx)}${dividida(c) ? ` <small class="dica">${fmt(ef(c) * 100, 0)}%</small>` : ''}</td><td class="ce">${esc(c.ticket_balanca || '')}${b ? ' <span title="Achado no relatório da balança">✓</span>' : ''}</td><td class="ce">${fmt(kg)}</td><td class="ce">${cx ? fmt(kg / cx, 1) : '—'}</td>
        <td>${esc(lv?.destino || '')}</td><td>${esc(c.tipo || '')}</td>
        <td>${lv ? `<b>${esc(lv.codigo)}</b>` : tag('sem lote', 'alerta')}${c.rastreio ? `<br><small class="dica">${esc(c.rastreio)}</small>` : ''}</td>
        <td class="ce">${v != null ? fmt(v) : '—'}</td><td class="ce">${v != null ? fmt(kg - v) : '—'}</td><td class="ce">${v != null && kg ? pct(kg - v, kg) : '—'}</td>
        <td class="ce">${evid(c.evid_url, 'carga')} ${evid(lv?.evid_url, 'venda')}</td>
        <td class="ce"><button class="btn mini" type="button" data-cg="${esc(c.id)}">Abrir</button></td></tr>`; }).join('')}
    <tr class="en-total"><td colspan="4">${l.length} carga(s)</td><td class="ce">${fmt(s.cx)}</td><td></td><td class="ce">${fmt(s.kg)}</td><td class="ce">${s.cx ? fmt(s.kg / s.cx, 1) : ''}</td><td colspan="3"></td>
      <td class="ce">${fmt(s.vend)}</td><td class="ce">${fmt(s.desc)}</td><td class="ce">${pct(s.desc, s.kg)}</td><td colspan="2"></td></tr>
  </tbody></table></div>` : '<div class="vazio">Nenhuma carga.</div>';
}
function ligarTabela(el) { el.querySelectorAll('[data-cg]').forEach(b => b.addEventListener('click', () => formCarga(B.cargas.find(c => c.id === b.dataset.cg)))); }
function formCarga(c) {
  if (!c) return;
  const lotes = B.lotes.filter(l => l.safra_id === c.safra_id);
  const b = balancaDe(c);
  dialogo(`<h3>Carga de ${br(c.data)} · ${esc(c.placa || '')}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <p class="dica">${esc(nomeTal(c))} · ${fmt(cxC(c))} cx · ${fmt(kgC(c))} kg${dividida(c) ? ` (${fmt(ef(c) * 100, 1)}% do caminhão de ${fmt(c.quantidade)} cx / ${fmt(c.peso_liquido)} kg)` : ''} · ticket ${esc(c.ticket_faz || '—')} · balança ${esc(c.ticket_balanca || '—')}${b ? ` ✓ (${br(b.data)}, ${fmt(b.peso_liquido)} kg)` : ''}.
      Data, talhão, caixas e pesos se corrigem na <a class="ce-link" href="${COLHEITA_URL}" target="_blank" rel="noopener">Colheita e Produção</a>.</p>
    <div class="grade">
      <label class="campo">Boletim / lote de venda <select id="fcLote">${opcoes(lotes.map(l => [l.id, `${l.codigo}${l.destino ? ' · ' + l.destino : ''}`]), c.lote_venda_id, '— sem lote —')}</select></label>
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
   TELA · BOLETINS E VENDAS (lotes, categorias e notas)
   =================================================================== */
function desenharLotes() {
  const tela = $('telaBmLotes');
  const fil = filtros(false);
  const vend = rateio();
  const lotes = B.lotes.filter(l => l.safra_id === B.f.safra).sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const linhas = lotes.map(l => ({ l, s: somar(cargasDoLote(l.id), vend), v: vendidoLote(l), it: itensDoLote(l.id) }));
  const semLote = B.cargas.filter(c => c.safra_id === B.f.safra && !c.lote_venda_id && kgC(c));
  const itSem = B.itens.filter(i => i.safra_id === B.f.safra && !i.lote_venda_id);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Boletins e vendas', 'Cada boletim do lavador (ou NF de carga suja) junta as cargas que entraram nele. Aqui você lança Cat 1, Cat 2 e Cat 3 do boletim e importa o relatório de vendas da Coopadap, que traz os calibres.',
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="blImp">Importar relatório de vendas</button><button class="btn principal" type="button" id="blNovo">Novo boletim / lote</button></div>`)}
    <div class="grade larga" style="margin-top:12px">${fil}</div>
    ${semLote.length ? `<div class="aviso" style="margin-top:12px">${semLote.length} carga(s) desta safra ainda sem boletim/lote: ${semLote.slice(0, 6).map(c => `${br(c.data)} ${esc(c.placa || '')}`).join(' · ')}${semLote.length > 6 ? '…' : ''}</div>` : ''}
    ${itSem.length ? `<div class="aviso" style="margin-top:12px">${itSem.length} linha(s) de nota sem boletim (${fmt(itSem.reduce((s, i) => s + Number(i.kg || 0), 0))} kg): NF ${[...new Set(itSem.map(i => i.nf))].map(esc).join(', ')}.</div>` : ''}
    ${linhas.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha bm-tab"><thead><tr><th>Boletim / lote</th><th class="ce">Data</th><th>Destino</th><th>Tipo</th><th class="ce">Cargas</th><th class="ce">Entrou (kg)</th>
      <th class="ce">Cat 1</th><th class="ce">Cat 2</th><th class="ce">Cat 3</th><th class="ce">Refugo</th><th class="ce">NF-e</th><th class="ce">Vendido (kg)</th><th class="ce">Descarte</th><th></th></tr></thead><tbody>
      ${linhas.map(({ l, s, v, it }) => { const tc = CATS.reduce((a, [k]) => a + Number(l[k] || 0), 0);
        return `<tr><td><b>${esc(l.codigo)}</b>${l.rastreio ? `<br><small class="dica">${esc(l.rastreio)}</small>` : ''}</td><td class="ce">${br(l.data)}</td><td>${esc(l.destino || '')}</td><td>${esc(l.tipo || '')}</td>
        <td class="ce">${s.n || tag('0', 'alerta')}</td><td class="ce">${fmt(s.kg)}</td>
        ${CATS.map(([k]) => `<td class="ce">${l[k] != null ? `${fmt(l[k])}<br><small class="dica">${pct(Number(l[k]), tc, 0)}</small>` : /suj/i.test(l.tipo || '') ? '' : '<small class="dica">—</small>'}</td>`).join('')}
        <td class="ce">${it.length ? new Set(it.map(i => i.nf)).size : (l.nfs ? String(l.nfs).split(/[,/]/).filter(x => so(x)).length : 0)}</td>
        <td class="ce"><b>${fmt(v)}</b>${it.length ? '' : v != null ? '<br><small class="dica">digitado</small>' : ''}</td><td class="ce">${s.kg && v != null ? pct(s.kg - v, s.kg) : '—'}</td>
        <td class="ce"><button class="btn mini" type="button" data-lv="${esc(l.id)}">Abrir</button></td></tr>`; }).join('')}
      <tr class="en-total"><td colspan="4">${linhas.length} lote(s)</td><td class="ce">${linhas.reduce((a, x) => a + x.s.n, 0)}</td><td class="ce">${fmt(linhas.reduce((a, x) => a + x.s.kg, 0))}</td>
        ${CATS.map(([k]) => `<td class="ce">${fmt(linhas.reduce((a, x) => a + Number(x.l[k] || 0), 0))}</td>`).join('')}<td></td>
        <td class="ce">${fmt(linhas.reduce((a, x) => a + Number(x.v || 0), 0))}</td><td colspan="2"></td></tr>
    </tbody></table></div>` : '<div class="vazio" style="margin-top:12px">Nenhum boletim/lote nesta safra.</div>'}
  </div>`;
  ligarFiltros(desenharLotes);
  $('blNovo').addEventListener('click', () => formLote(null));
  $('blImp').addEventListener('click', () => formImportar());
  tela.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => formLote(lote(b.dataset.lv))));
}
function formLote(l) {
  const saf = l?.safra_id || B.f.safra || safraPadrao();
  const v = l || { codigo: '', data: hoje(), destino: 'Coopadap', tipo: 'Beneficiado', certificacao: '', rastreio: '', nfs: '', peso_vendido: null, evid_url: '', obs: '' };
  const cargas = B.cargas.filter(c => c.safra_id === saf && (kgC(c) || c.lote_venda_id === l?.id)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const destinos = [...new Set(['Coopadap', 'Carlini', ...B.lotes.map(x => x.destino).filter(Boolean)])];
  const it = l ? itensDoLote(l.id) : [];
  const nkg = n => n != null ? esc(fmt(n, Number(n) % 1 ? 2 : 0)) : '';
  dialogo(`<h3>${l ? esc(l.codigo) : 'Novo boletim / lote de venda'} · safra ${esc(safraNome(saf))}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <div class="grade">
      <label class="campo">Identificação <input type="text" id="lvCod" value="${esc(v.codigo)}" placeholder="Boletim 798 · NF 001031094-2"></label>
      <label class="campo">Data <input type="date" id="lvData" value="${esc(String(v.data || '').slice(0, 10))}"></label>
      <label class="campo">Destino (packing house) <input type="text" id="lvDest" value="${esc(v.destino || '')}" list="lvDests"></label>
      <label class="campo">Tipo <select id="lvTipo">${opcoes(['Beneficiado', 'Sujo', 'Lavado'], v.tipo, '—')}</select></label>
      <label class="campo">Certificação <select id="lvCert">${opcoes(['Com certificação', 'Sem certificação'], v.certificacao, '—')}</select></label>
      <label class="campo">Código de rastreabilidade <input type="text" id="lvRast" value="${esc(v.rastreio || '')}"></label>
    </div>
    <fieldset class="cp-fs bm-fs-cat"><legend>Boletim do lavador — o que saiu de cada categoria (kg) <span class="dica" id="lvCatSoma"></span></legend>
      <div class="grade">${CATS.map(([k, r]) => `<label class="campo">${r} <input type="text" inputmode="decimal" id="lv_${k}" value="${nkg(v[k])}"></label>`).join('')}</div></fieldset>
    <div class="grade">
      <label class="campo">Peso vendido (kg) ${it.length ? `<input type="text" disabled value="${esc(fmt(vendidoLote(l), 2))} (soma de ${it.length} linha(s) de nota)">` : `<input type="text" inputmode="decimal" id="lvVend" value="${nkg(v.peso_vendido)}">`}</label>
      <label class="campo">Evidência da venda (link) <input type="url" id="lvEv" value="${esc(v.evid_url || '')}" placeholder="https://…"></label>
    </div>
    <datalist id="lvDests">${destinos.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <label class="campo">NF-e(s) <textarea id="lvNfs" rows="2">${esc(v.nfs || '')}</textarea></label>
    <fieldset class="cp-fs"><legend>Cargas deste lote <span class="dica" id="lvSoma"></span></legend>
      <div class="bm-cargas">${cargas.map(c => { const outro = c.lote_venda_id && c.lote_venda_id !== l?.id ? lote(c.lote_venda_id) : null;
        return `<label class="rs-check${outro ? ' dica' : ''}"><input type="checkbox" value="${esc(c.id)}" data-kg="${kgC(c)}" ${l && c.lote_venda_id === l.id ? 'checked' : ''}>
          ${br(c.data)} · ${esc(nomeTal(c))} · ${esc(c.placa || '')} · ${fmt(cxC(c))} cx · ${fmt(kgC(c))} kg${c.tipo ? ' · ' + esc(c.tipo) : ''}${outro ? ` <small>(hoje em ${esc(outro.codigo)})</small>` : ''}</label>`; }).join('') || '<p class="dica">Nenhuma carga nesta safra.</p>'}</div>
    </fieldset>
    ${it.length ? `<details class="cp-fs"><summary class="ce-link">Notas de venda deste lote (${new Set(it.map(i => i.nf)).size} NF, ${it.length} linhas)</summary>${tabelaCal(classif(cargasDoLote(l.id)))}</details>` : ''}
    <label class="campo">Observação <textarea id="lvObs" rows="2">${esc(v.obs || '')}</textarea></label>
    <div class="barra entre"><div>${l ? '<button class="btn perigo" type="button" id="lvApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="lvOk">Salvar</button></div></div>`, d => {
    const marcadas = () => [...d.querySelectorAll('.bm-cargas input:checked')];
    const conta = () => {
      const kg = marcadas().reduce((s, i) => s + Number(i.dataset.kg), 0); const vv = $('lvVend') ? num($('lvVend').value) : vendidoLote(l);
      $('lvSoma').textContent = `— ${marcadas().length} carga(s), ${fmt(kg)} kg entraram${vv && kg ? ` · descarte ${pct(kg - vv, kg)}` : ''}`;
      const tc = CATS.reduce((s, [k]) => s + (num($('lv_' + k).value) || 0), 0);
      $('lvCatSoma').textContent = tc ? `— soma ${fmt(tc)} kg${kg ? ` (${pct(tc, kg, 0)} do que entrou)` : ''}` : '';
    };
    d.querySelectorAll('.bm-cargas input, .bm-fs-cat input').forEach(i => i.addEventListener('input', conta));
    d.querySelectorAll('.bm-cargas input').forEach(i => i.addEventListener('change', conta));
    $('lvVend')?.addEventListener('input', conta); conta();
    $('lvOk').addEventListener('click', () => salvarLote(l, saf, marcadas().map(i => i.value)));
    $('lvApagar')?.addEventListener('click', () => apagarLote(l));
  });
}
async function salvarLote(atual, saf, ids) {
  if (precisaRede()) return;
  const ev = so($('lvEv').value);
  const linha = { codigo: so($('lvCod').value), data: $('lvData').value || null, destino: so($('lvDest').value) || null, tipo: $('lvTipo').value || null,
    certificacao: $('lvCert').value || null, rastreio: so($('lvRast').value) || null, evid_url: ev || null, nfs: so($('lvNfs').value) || null, obs: so($('lvObs').value) || null };
  if ($('lvVend')) { const vend = num($('lvVend').value); if (Number.isNaN(vend) || (vend != null && vend < 0)) return erroDlg('Confira o peso vendido.'); linha.peso_vendido = vend; }
  for (const [k, r] of CATS) { const x = num($('lv_' + k).value); if (Number.isNaN(x) || (x != null && x < 0)) return erroDlg(`Confira ${r}.`); linha[k] = x; }
  if (!linha.codigo) return erroDlg('Informe a identificação (ex.: Boletim 798).');
  if (ev && !/^https?:\/\//i.test(ev)) return erroDlg('O link da evidência precisa começar com https://');
  $('lvOk').disabled = true;
  try {
    const t = estado.cliente.from('cp_lotes_venda');
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single()
      : await t.insert({ ...linha, cultura_id: B.cult.id, safra_id: saf, criado_por: quem() }).select().single();
    if (error) throw error;
    trocar(B.lotes, data);
    const antes = new Set(cargasDoLote(data.id).map(c => c.id));
    const entra = ids.filter(id => !antes.has(id)), sai = [...antes].filter(id => !ids.includes(id));
    if (entra.length) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: data.id }).in('id', entra).select(); if (r.error) throw r.error; r.data.forEach(x => trocar(B.cargas, x)); }
    if (sai.length) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: null }).in('id', sai).select(); if (r.error) throw r.error; r.data.forEach(x => trocar(B.cargas, x)); }
    salvarCaixa(); fechar(); redesenhar();
  } catch (e) { if ($('lvOk')) $('lvOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
}
function apagarLote(l) {
  const n = cargasDoLote(l.id).length, ni = itensDoLote(l.id).length;
  dialogo(`<h3>Apagar ${esc(l.codigo)}</h3><div class="aviso erro" id="bmErro" hidden></div>
    <p>${n ? `${n} carga(s) ficam sem lote (as cargas não são apagadas).` : 'Nenhuma carga ligada.'}${ni ? ` ${ni} linha(s) de nota ficam sem boletim.` : ''}</p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="laOk">Apagar</button></div>`, () => {
    $('laOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('laOk').disabled = true;
      if (n) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: null }).eq('lote_venda_id', l.id).select(); if (r.error) { $('laOk').disabled = false; return erroDlg(esc(r.error.message)); } r.data.forEach(x => trocar(B.cargas, x)); }
      const { error } = await estado.cliente.from('cp_lotes_venda').delete().eq('id', l.id);
      if (error) { $('laOk').disabled = false; return erroDlg('Não consegui apagar: ' + esc(error.message)); }
      B.lotes = B.lotes.filter(x => x.id !== l.id); B.itens.forEach(i => { if (i.lote_venda_id === l.id) i.lote_venda_id = null; });
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}
/* ---------- importar o relatório de vendas da Coopadap (xlsx) ---------- */
const H = s => semAc(s).replace(/[^A-Z0-9]/g, '');
function lerMaterial(m) {
  const t = so(m).toUpperCase(); const cal = t.match(/\bT(\d{2})\b/);
  return { calibre: cal ? Number(cal[1]) : null,
    categoria: /SUJO/.test(t) ? 'Sujo' : /CAT\s*3/.test(t) ? 'CAT 3' : /CAT\s*2|CAT1\*/.test(t) ? 'CAT 2' : 'CAT 1',
    embalagem: /CONTENTOR/.test(t) ? 'Contentor' : /4\s*KG/.test(t) ? 'CX 4 kg' : /10\s*KG/.test(t) ? 'CX 10 kg' : 'Granel',
    kgCx: /4\s*KG/.test(t) ? 4 : 10 };
}
function formImportar() {
  dialogo(`<h3>Importar relatório de vendas da Coopadap</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <p class="dica">O mesmo relatório que vai na aba “Vendas Coop”: uma linha por NF e material, com as colunas <b>Material</b>, <b>ID da NF</b>, <b>Boletim</b>, <b>Data de emissão</b>, <b>UM básica</b> e <b>Quantidade</b> (Documento de compras e Item, se vierem, evitam linha repetida).
      Cada linha entra na safra <b>${esc(safraNome(B.f.safra))}</b> e se liga ao lote pelo boletim (beneficiado) ou pela NF (carga suja). Boletim que ainda não existe vira lote novo.</p>
    <label class="campo">Arquivo (.xlsx ou .csv) <input type="file" id="viArq" accept=".xlsx,.xls,.csv"></label>
    <div id="viPrev"></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="viOk" disabled>Importar</button></div>`, () => {
    let linhas = [];
    $('viArq').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { linhas = prepararImport(await lerPlanilha(f)); } catch (er) { linhas = []; return erroDlg(esc(er.message || er)); }
      const kg = linhas.reduce((s, x) => s + (x.kg || 0), 0); const novas = linhas.filter(x => !B.itens.some(i => i.chave === x.chave));
      $('viPrev').innerHTML = `<div class="aviso ok">${linhas.length} linha(s) · ${new Set(linhas.map(x => x.nf)).size} NF · ${fmt(kg)} kg · boletins ${[...new Set(linhas.map(x => x.boletim).filter(Boolean))].join(', ') || '—'}. <b>${novas.length}</b> nova(s), ${linhas.length - novas.length} já importada(s).</div>`;
      $('viOk').disabled = !novas.length;
    });
    $('viOk').addEventListener('click', () => importarItens(linhas));
  });
}
function prepararImport(abas) {
  for (const a of abas) {
    const i = a.linhas.findIndex(r => (r || []).some(v => H(v) === 'MATERIAL') && (r || []).some(v => H(v) === 'IDDANF'));
    if (i < 0) continue;
    const cab = a.linhas[i].map(H); const col = n => cab.indexOf(n);
    const c = { mat: col('MATERIAL'), nf: col('IDDANF'), bol: col('BOLETIM'), dt: col('DATADEEMISSAO'), um: col('UMBASICA'), q: col('QUANTIDADE'), doc: col('DOCUMENTODECOMPRAS'), item: col('ITEM'), tal: col('TALHAO'), cat: col('CATEGORIA') };
    const out = [];
    for (const r of a.linhas.slice(i + 1)) {
      if (!r || !r[c.mat] || !r[c.nf]) continue;
      const m = lerMaterial(r[c.mat]); const q = Number(r[c.q]) || 0; const um = semAc(r[c.um]);
      let d = r[c.dt]; d = d instanceof Date ? isoD(d) : /^\d{2}\/\d{2}\/\d{4}/.test(so(d)) ? so(d).slice(0, 10).split('/').reverse().join('-') : so(d).slice(0, 10) || null;
      const bol = so(r[c.bol]); const nf = so(r[c.nf]);
      out.push({ nf, boletim: bol && bol !== '0' ? bol : null, material: so(r[c.mat]), data: d, ...m, categoria: c.cat >= 0 && /suj/i.test(so(r[c.cat])) ? 'Sujo' : m.categoria,
        caixas: um === 'CX' ? q : null, kg: um === 'CX' ? q * m.kgCx : q, talhao: c.tal >= 0 ? so(r[c.tal]) || null : null,
        chave: [nf, c.doc >= 0 ? so(r[c.doc]) : '', c.item >= 0 ? so(r[c.item]) : '', so(r[c.mat]), q].join('|') });
    }
    if (out.length) return out;
  }
  throw new Error('Não achei a tabela do relatório (colunas “Material” e “ID da NF”).');
}
async function importarItens(linhas) {
  if (precisaRede()) return;
  $('viOk').disabled = true;
  try {
    const saf = B.f.safra; const novas = linhas.filter(x => !B.itens.some(i => i.chave === x.chave));
    const loteDe = async x => {
      const cod = x.categoria === 'Sujo' ? 'NF ' + x.nf : x.boletim ? 'Boletim ' + x.boletim : null;
      if (!cod) return null;
      let l = B.lotes.find(y => y.safra_id === saf && y.codigo === cod);
      if (!l) {
        const { data, error } = await estado.cliente.from('cp_lotes_venda').insert({ cultura_id: B.cult.id, safra_id: saf, codigo: cod, data: x.data, destino: 'Coopadap',
          tipo: x.categoria === 'Sujo' ? 'Sujo' : 'Beneficiado', nfs: x.categoria === 'Sujo' ? x.nf : null, criado_por: quem() }).select().single();
        if (error) throw error; trocar(B.lotes, data); l = data;
      }
      return l.id;
    };
    const reg = [];
    for (const x of novas) reg.push({ cultura_id: B.cult.id, safra_id: saf, lote_venda_id: await loteDe(x), chave: x.chave, data: x.data, nf: x.nf, boletim: x.boletim, material: x.material,
      categoria: x.categoria, calibre: x.calibre, embalagem: x.embalagem, caixas: x.caixas, kg: x.kg, talhao: x.talhao, origem: 'Relatório de vendas importado em ' + br(hoje()), criado_por: quem() });
    for (let i = 0; i < reg.length; i += 200) {
      const { data, error } = await estado.cliente.from('cp_vendas_itens').insert(reg.slice(i, i + 200)).select();
      if (error) throw error; data.forEach(x => B.itens.push(x));
    }
    salvarCaixa(); fechar(); redesenhar();
    alert(`${reg.length} linha(s) importada(s). Confira em cada boletim se as cargas estão ligadas.`);
  } catch (e) { if ($('viOk')) $('viOk').disabled = false; erroDlg('Não consegui importar: ' + esc(e.message || e)); }
}

/* ===================================================================
   TELA · FECHAMENTO (comparativo entre safras)
   =================================================================== */
function comparativo(faz) { return safrasOrd().slice().reverse().map(s => ({ s, k: resumo(s.id, faz) })).filter(x => x.k.cargas.length); }
const INDIC = [
  ['Área (ha)', k => fmt(k.area, 2)], ['Início da colheita', k => br(k.tot.ini)], ['Fim da colheita', k => br(k.tot.fim)],
  ['Caixas colhidas', k => fmt(k.tot.cx)], ['Peso colhido (kg)', k => fmt(k.tot.kg)], ['Colhido (kg/ha)', k => fmt(k.kgHa)], ['Peso médio (kg/cx)', k => fmt(k.kgCx, 1)],
  ['Produção prevista (kg)', k => k.expTot != null ? fmt(k.expTot) : '—'], ['% aproveitamento', k => k.expTot ? pct(k.tot.kg, k.expTot, 0) : '—'],
  ['Beneficiado (kg)', k => fmt(k.tot.benef)], ['Sujo (kg)', k => fmt(k.tot.sujo)],
  ['Cat 1 no lavador', k => k.cl.somaCat ? pct(k.cl.cat.cat1_kg, k.cl.somaCat) : '—'], ['Cat 2 no lavador', k => k.cl.somaCat ? pct(k.cl.cat.cat2_kg, k.cl.somaCat) : '—'], ['Cat 3 no lavador', k => k.cl.somaCat ? pct(k.cl.cat.cat3_kg, k.cl.somaCat) : '—'],
  ['Graúdos T10–T16', k => k.cl.totCal ? pct(k.cl.faixas.graudo, k.cl.totCal) : '—'], ['Calibre que mais saiu', k => k.cl.top ? 'T' + k.cl.top.c : '—'],
  ['Peso vendido (kg)', k => fmt(k.tot.vend)], ['Vendido (kg/ha)', k => fmt(k.vendHa)], ['Peso descarte (kg)', k => fmt(k.tot.desc)], ['% perda', k => pct(k.tot.desc, k.tot.kg)],
];
function graficoSafras(L, rel) {
  const max = Math.max(...L.map(x => x.k.tot.kg), 1);
  return `<div class="bm-graf${rel ? ' bm-graf-rel' : ''}">${L.map(x => `<div class="bm-gl"><span class="bm-gr">${esc(x.s.nome)}</span>
    <div class="bm-gb"><i class="bm-b" style="width:${x.k.tot.vend / max * 100}%"></i><i class="bm-s" style="width:${Math.max(0, x.k.tot.desc) / max * 100}%"></i></div>
    <span class="bm-gv">${ton(x.k.tot.kg)} · vendido ${pct(x.k.tot.vend, x.k.tot.kg, 0)}</span></div>`).join('')}</div>
    <p class="${rel ? 'rel-nota' : 'dica'}" style="margin:4px 0 0"><span class="en-leg en-ren"></span> vendido <span class="en-leg en-nao"></span> descarte</p>`;
}
function tabelaCalSafras(L, rel) {
  const cals = [...new Set(L.flatMap(x => x.k.cl.calibres.map(c => c.c)))].sort((a, b) => a - b);
  if (!cals.length) return '';
  const cls = rel ? 'rel-tabela bm-rel' : 'dc-planilha bm-tab';
  return `<table class="${cls}"><thead><tr><th>Calibre</th><th>Peso do fruto</th>${L.map(x => `<th class="ce">${esc(x.s.nome)}</th>`).join('')}</tr></thead><tbody>
    ${cals.map(c => `<tr><td><b>T${c}</b></td><td>${esc(REF_CAL[c] || '')}</td>${L.map(x => { const r = x.k.cl.calibres.find(y => y.c === c); return `<td class="ce rel-num">${r ? pct(r.kg, x.k.cl.totCal) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
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
    <div class="qp-bloco"><h3>Calibres por safra (% do peso vendido)</h3><div class="ac-rola">${tabelaCalSafras(L) || '<p class="dica">Sem notas com calibre.</p>'}</div></div>
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
   APRESENTAR AO AUDITOR — tela cheia, um assunto por página
   =================================================================== */
let apr = null;
function slidesDe(k) {
  const t = k.tot, S = [];
  S.push({ t: 'Balanço de massa', h: `<p class="bm-ap-sub">Abacate · safra ${esc(safraNome(k.safraId))} · ${esc(k.faz || 'todas as propriedades')} · ${FORM.codigo}</p>
    <div class="bm-ap-kpis">
      <div><span>Colheita</span><b>${ddmm(t.ini)} a ${ddmm(t.fim)}</b><small>${dias(t.ini, t.fim)} dias · ${k.cargas.length} cargas</small></div>
      <div><span>Caixas</span><b>${fmt(t.cx)}</b><small>${fmt(k.kgCx, 1)} kg por caixa</small></div>
      <div><span>Colhido</span><b>${ton(t.kg)}</b><small>${fmt(k.kgHa / 1000, 1)} t/ha em ${fmt(k.area, 2)} ha</small></div>
      <div><span>Vendido</span><b>${ton(t.vend)}</b><small>${pct(t.vend, t.kg)} do colhido</small></div>
      <div><span>Descarte</span><b>${pct(t.desc, t.kg)}</b><small>${fmt(t.desc)} kg</small></div>
      ${k.expTot ? `<div><span>Aproveitamento</span><b>${pct(t.kg, k.expTot, 0)}</b><small>do previsto (${ton(k.expTot)})</small></div>` : ''}
    </div>
    <h4>Como a rastreabilidade funciona</h4>${fluxo()}
    <p class="dica">Toda carga sai da fazenda com ticket; o ticket da balança da Coopadap dá o peso; as cargas entram num boletim do lavador; o boletim vira as notas de venda. Assim, de qualquer nota se chega ao talhão (um passo atrás) e de qualquer carga se chega às notas (um passo à frente).</p>` });
  S.push({ t: 'Balanço por talhão', h: tabelaBalanco(k).replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1') + `<div class="bm-talhoes" style="margin-top:12px">${k.talhoes.filter(x => x.n).map(blocoTalhao).join('')}</div>` });
  if (k.cl.somaCat || k.cl.totCal) S.push({ t: 'Categorias e calibres', h: `${k.cl.somaCat ? `<h4>Boletins do lavador — categorias</h4>${barraCats(k.cl.cat, k.tot.benef)}<div class="ac-rola" style="margin-top:8px">${tabelaCatTalhao(k)}</div>` : ''}
    ${k.cl.totCal ? `<h4>Calibres vendidos</h4><p class="dica">${EXPLICA_CAL}</p>${graficoCal(k.cl)}` : ''}` });
  for (const l of k.lotes) S.push({ t: `Cadeia · ${l.codigo}`, h: cadeiaLote(l, k) });
  S.push({ t: 'Teste de rastreabilidade', h: `<p>Peça ao auditor uma nota fiscal, um boletim, uma placa ou um ticket e digite abaixo: o app mostra o caminho inteiro.</p>
    <label class="campo"><input type="search" id="apQ" placeholder="NF, boletim, placa ou ticket" style="font-size:18px"></label><div id="apRes" style="margin-top:10px"></div>` });
  return S;
}
function apresentar() {
  const k = resumo(B.f.safra, B.f.faz);
  if (!k.cargas.length) return alert('Nenhuma carga nesta safra.');
  const S = slidesDe(k);
  fecharApr();
  const el = document.createElement('div'); el.id = 'bmApresenta'; el.className = 'bm-ap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  apr = { S, i: 0, el, k, tecla: e => { if (e.target.closest('input')) return; if (e.key === 'ArrowRight' || e.key === 'PageDown') ir(1); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') ir(-1); else if (e.key === 'Escape') fecharApr(); } };
  document.addEventListener('keydown', apr.tecla);
  desenharSlide();
}
function ir(d) { if (!apr) return; apr.i = Math.max(0, Math.min(apr.S.length - 1, apr.i + d)); desenharSlide(); }
function desenharSlide() {
  const { S, i, el } = apr; const s = S[i];
  el.innerHTML = `<header class="bm-ap-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios"><div><h2>${esc(s.t)}</h2><small>${FORM.codigo} · ${esc(safraNome(B.f.safra))} · ${esc(B.f.faz || 'todas as propriedades')}</small></div>
      <select id="apIr" aria-label="Ir para">${S.map((x, j) => `<option value="${j}" ${j === i ? 'selected' : ''}>${j + 1}. ${esc(x.t)}</option>`).join('')}</select>
      <button class="btn" type="button" id="apSair">Sair (Esc)</button></header>
    <main class="bm-ap-corpo">${s.h}</main>
    <footer class="bm-ap-pe"><button class="btn" type="button" id="apAnt" ${i ? '' : 'disabled'}>← Anterior</button><span>${i + 1} de ${S.length}</span>
      <button class="btn principal" type="button" id="apProx" ${i < S.length - 1 ? '' : 'disabled'}>Próximo →</button><img src="img/lop-marca.png" alt="LOP" class="bm-ap-lop"></footer>`;
  $('apSair').onclick = fecharApr; $('apAnt').onclick = () => ir(-1); $('apProx').onclick = () => ir(1);
  $('apIr').onchange = e => { apr.i = Number(e.target.value); desenharSlide(); };
  el.querySelector('.bm-ap-corpo').scrollTop = 0;
  $('apQ')?.addEventListener('input', e => {
    const ach = rastrear(e.target.value, B.f.safra);
    $('apRes').innerHTML = so(e.target.value).length < 2 ? '' : ach.length ? ach.map(a => `<div class="aviso ok">Encontrado em <b>${esc(a.l.codigo)}</b> por ${esc([...a.porque].slice(0, 3).join(', '))}</div>${cadeiaLote(a.l, apr.k)}`).join('') : '<div class="aviso">Nada encontrado nesta safra.</div>';
  });
}
function fecharApr() { if (!apr) return; document.removeEventListener('keydown', apr.tecla); apr.el.remove(); apr = null; }

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
  return `<table class="rel-tabela bm-rel"><thead><tr><th>Talhão</th><th>Variedade</th><th>Área (ha)</th><th>Início</th><th>Fim</th><th>Prevista (kg)</th><th>Caixas</th><th>Peso líq. (kg)</th><th>t/ha</th><th>% aprov.</th><th>Sujo</th><th>Benef.</th><th>Vendido</th><th>Descarte</th><th>% perda</th></tr></thead><tbody>
    ${k.talhoes.map(t => `<tr><td>${esc(t.p.nome)}</td><td>${esc(t.p.variedade || '')}</td><td class="rel-num">${fmt(t.area, 2)}</td><td>${t.n ? br(t.ini) : '—'}</td><td>${t.n ? br(t.fim) : '—'}</td><td class="rel-num">${t.exp != null ? fmt(t.exp) : '—'}</td>
      <td class="rel-num">${fmt(t.cx)}</td><td class="rel-num">${fmt(t.kg)}</td><td class="rel-num">${t.kgHa != null ? fmt(t.kgHa / 1000, 2) : '—'}</td><td class="rel-num">${t.aprov != null ? fmt(t.aprov * 100, 0) + '%' : '—'}</td>
      <td class="rel-num">${fmt(t.sujo)}</td><td class="rel-num">${fmt(t.benef)}</td><td class="rel-num">${fmt(t.vend)}</td><td class="rel-num">${fmt(t.desc)}</td><td class="rel-num">${t.kg ? pct(t.desc, t.kg) : '—'}</td></tr>`).join('')}
    <tr><td colspan="2"><b>Total</b></td><td class="rel-num"><b>${fmt(k.area, 2)}</b></td><td>${br(k.tot.ini)}</td><td>${br(k.tot.fim)}</td><td class="rel-num">${k.expTot != null ? fmt(k.expTot) : '—'}</td><td class="rel-num"><b>${fmt(k.tot.cx)}</b></td>
      <td class="rel-num"><b>${fmt(k.tot.kg)}</b></td><td class="rel-num">${k.kgHa != null ? fmt(k.kgHa / 1000, 2) : '—'}</td><td class="rel-num">${k.expTot ? fmt(k.tot.kg / k.expTot * 100, 0) + '%' : '—'}</td>
      <td class="rel-num">${fmt(k.tot.sujo)}</td><td class="rel-num">${fmt(k.tot.benef)}</td><td class="rel-num"><b>${fmt(k.tot.vend)}</b></td><td class="rel-num">${fmt(k.tot.desc)}</td><td class="rel-num"><b>${pct(k.tot.desc, k.tot.kg)}</b></td></tr></tbody></table>`;
}
const fichaForm = k => `<div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo} (${FORM.alt})</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div><div><span>Propriedade</span><b>${esc(k.faz || 'Todas')}</b></div>
  <div><span>Cultura</span><b>Abacate</b></div><div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>`;
function docForm(k) {
  return documento({ titulo: 'Balanço de massa', subtitulo: subt(k), canto: FORM.codigo, paisagem: true, corpo: `${fichaForm(k)}${tabelaBalRel(k)}
    ${k.cl.somaCat ? `<p class="rel-secao">Categorias do boletim do lavador</p>${barraCats(k.cl.cat, k.tot.benef, true)}${tabelaCatTalhao(k, true)}` : ''}
    ${k.cl.totCal ? `<p class="rel-secao">Calibres vendidos — ${EXPLICA_CAL}</p>${graficoCal(k.cl, true)}` : ''}
    <p class="rel-secao">Boletins e lotes de venda</p>
    <table class="rel-tabela bm-rel"><thead><tr><th>Lote</th><th>Data</th><th>Destino</th><th>Tipo</th><th>Cargas</th><th>Entrou (kg)</th><th>Cat 1</th><th>Cat 2</th><th>Cat 3</th><th>Vendido (kg)</th><th>% perda</th></tr></thead><tbody>
      ${k.lotes.map(l => { const s = somar(k.cargas.filter(c => c.lote_venda_id === l.id), k.vend); const tc = CATS.reduce((a, [kk]) => a + Number(l[kk] || 0), 0);
        return `<tr><td>${esc(l.codigo)}</td><td>${br(l.data)}</td><td>${esc(l.destino || '')}</td><td>${esc(l.tipo || '')}</td><td class="rel-num">${s.n}</td><td class="rel-num">${fmt(s.kg)}</td>
        ${['cat1_kg', 'cat2_kg', 'cat3_kg'].map(kk => `<td class="rel-num">${l[kk] != null ? pct(Number(l[kk]), tc, 0) : '—'}</td>`).join('')}<td class="rel-num">${fmt(s.vend)}</td><td class="rel-num">${pct(s.desc, s.kg)}</td></tr>`; }).join('')}</tbody></table>
    <p class="rel-nota">Peso colhido = peso líquido da balança da Coopadap (ticket). Vendido = notas de venda do packing house por boletim (ou NF da carga suja), repartido entre as cargas pelo peso. Descarte = colhido − vendido.</p>` });
}
function docCompleto(k) {
  return documento({ titulo: 'Rastreabilidade completa', subtitulo: subt(k), canto: FORM.codigo, paisagem: true, corpo: `${fichaForm(k)}
    <ol class="bm-fluxo bm-fluxo-rel">${PASSOS.map(([t, d], i) => `<li><span class="bm-pn">${i + 1}</span><b>${t}</b><small>${d}</small></li>`).join('')}</ol>
    ${tabelaBalRel(k)}
    ${k.cl.somaCat ? `<p class="rel-secao">Categorias do boletim do lavador</p>${barraCats(k.cl.cat, k.tot.benef, true)}` : ''}
    ${k.cl.totCal ? `<p class="rel-secao">Calibres vendidos</p>${graficoCal(k.cl, true)}${tabelaCal(k.cl, true)}` : ''}
    ${k.lotes.map(l => cadeiaLote(l, k, true)).join('')}` });
}
function docTeste(q) {
  const k = resumo(B.f.safra, ''); const ach = rastrear(q, B.f.safra);
  return documento({ titulo: 'Teste de rastreabilidade', subtitulo: `Abacate · safra ${safraNome(B.f.safra)} · busca por “${q}”`, canto: 'FORM 021', paisagem: true, corpo: `
    <div class="rel-ficha"><div><span>Item rastreado</span><b>${esc(q)}</b></div><div><span>Data do teste</span><b>${br(hoje())}</b></div><div><span>Resultado</span><b>${ach.length ? 'Rastreado até o talhão' : 'Não encontrado'}</b></div>
      <div><span>Lote(s)</span><b>${ach.map(a => esc(a.l.codigo)).join(', ') || '—'}</b></div><div><span>Talhão(ões)</span><b>${esc([...new Set(ach.flatMap(a => cargasDoLote(a.l.id).map(nomeTal)))].join(', ') || '—')}</b></div><div><span>Responsável</span><b>&nbsp;</b></div></div>
    ${ach.map(a => cadeiaLote(a.l, k, true)).join('')}
    <p class="rel-nota">Um passo atrás (da venda até o talhão e a carga) e um passo à frente (da carga até as notas de venda), conforme a GLOBALG.A.P.</p>` });
}
function docFechamento(L) {
  return documento({ titulo: 'Fechamento — comparativo entre safras', subtitulo: `Abacate · ${B.f.faz || 'todas as propriedades'}`, canto: FORM.codigo, paisagem: true, corpo: `
    ${graficoSafras(L, true)}
    <table class="rel-tabela" style="margin-top:10px"><thead><tr><th>Indicador</th>${L.map(x => `<th>${esc(x.s.nome)}</th>`).join('')}</tr></thead><tbody>
      ${INDIC.map(([r, f]) => `<tr><td>${r}</td>${L.map(x => `<td class="rel-num">${f(x.k)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${tabelaCalSafras(L, true) ? `<p class="rel-secao">Calibres por safra (% do peso vendido)</p>${tabelaCalSafras(L, true)}` : ''}
    <p class="rel-nota">Safra = ano da colheita. Vendido conforme as notas de venda do packing house (Coopadap / Carlini).</p>` });
}
async function exportar(k) {
  const l = k.cargas.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const tit = `${FORM.codigo} — ${FORM.titulo} · ${subt(k)}`, sub = `SAKUMA Agronegócios · emitido em ${br(hoje())}`;
  const ids = new Set(k.lotes.map(x => x.id));
  await baixarXlsx(`balanco-massa-${safraNome(k.safraId)}-${hoje()}`, [
    { nome: 'Rastreabilidade', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Data colheita', larg: 12, tipo: 'data' }, { rot: 'Placa', larg: 10 }, { rot: 'Ticket', larg: 9 }, { rot: 'Propriedade', larg: 14 }, { rot: 'Talhão', larg: 12 }, { rot: 'Variedade', larg: 10 },
        { rot: 'Caixas', larg: 8, tipo: 'num', casas: 0 }, { rot: '% do caminhão', larg: 9, tipo: 'num', casas: 0 }, { rot: 'Ticket balança', larg: 10 }, { rot: 'Peso líq. (kg)', larg: 12, tipo: 'num', casas: 2 }, { rot: 'kg/cx', larg: 8, tipo: 'num', casas: 2 },
        { rot: 'Packing house', larg: 12 }, { rot: 'Tipo', larg: 11 }, { rot: 'Boletim / lote', larg: 18 }, { rot: 'Peso vendido (kg)', larg: 12, tipo: 'num', casas: 2 },
        { rot: 'Peso descarte (kg)', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Inspeção', larg: 8 }, { rot: 'Rastreabilidade', larg: 22 }, { rot: 'Evidência carga', larg: 30 }, { rot: 'Evidência venda', larg: 30 }],
      linhas: l.map(c => { const p = plantio(c.plantio_id), lv = lote(c.lote_venda_id), v = k.vend.get(c.id), kg = kgC(c), cx = cxC(c);
        return [c.data, c.placa || '', c.ticket_faz || '', p?.fazenda || '', p?.nome || '', p?.variedade || '', cx, ef(c) * 100, c.ticket_balanca || '', kg, cx ? kg / cx : null,
          lv?.destino || '', c.tipo || '', lv?.codigo || '', v, v != null ? kg - v : null, c.conferido ? 'SIM' : '', c.rastreio || lv?.rastreio || '', c.evid_url || '', lv?.evid_url || '']; }) },
    { nome: 'Balanço de massa', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Talhão', larg: 14 }, { rot: 'Propriedade', larg: 14 }, { rot: 'Variedade', larg: 10 }, { rot: 'Área (ha)', larg: 9, tipo: 'num', casas: 2 }, { rot: 'Início', larg: 11, tipo: 'data' }, { rot: 'Fim', larg: 11, tipo: 'data' },
        { rot: 'Produção prevista (kg)', larg: 12, tipo: 'num', casas: 0 }, { rot: 'Caixas', larg: 8, tipo: 'num', casas: 0 }, { rot: 'Peso líq. colhido (kg)', larg: 14, tipo: 'num', casas: 2 }, { rot: 'Produção (t/ha)', larg: 10, tipo: 'num', casas: 2 },
        { rot: 'Peso sujo', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso beneficiado', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso vendido', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Peso descarte', larg: 12, tipo: 'num', casas: 2 }, { rot: '% perda', larg: 8, tipo: 'pct' }],
      linhas: k.talhoes.map(t => [t.p.nome, t.p.fazenda || '', t.p.variedade || '', t.area, t.ini || null, t.fim || null, t.exp, t.cx, t.kg, t.kgHa != null ? t.kgHa / 1000 : null, t.sujo, t.benef, t.vend, t.desc, t.kg ? t.desc / t.kg : null]) },
    { nome: 'Boletins e vendas', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Boletim / lote', larg: 20 }, { rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'Destino', larg: 12 }, { rot: 'Tipo', larg: 11 }, { rot: 'Certificação', larg: 15 }, { rot: 'Cargas', larg: 7, tipo: 'num', casas: 0 },
        { rot: 'Entrou (kg)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Cat 1 (kg)', larg: 10, tipo: 'num', casas: 0 }, { rot: 'Cat 2 (kg)', larg: 10, tipo: 'num', casas: 0 }, { rot: 'Cat 3 (kg)', larg: 10, tipo: 'num', casas: 0 }, { rot: 'Refugo (kg)', larg: 10, tipo: 'num', casas: 0 },
        { rot: 'Vendido (kg)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Rastreabilidade', larg: 22 }, { rot: 'NF-e', larg: 60 }, { rot: 'Evidência', larg: 40 }],
      linhas: k.lotes.map(lv => [lv.codigo, lv.data, lv.destino || '', lv.tipo || '', lv.certificacao || '', cargasDoLote(lv.id).length, entradaLote(lv),
        ...CATS.map(([kk]) => lv[kk] != null ? Number(lv[kk]) : null), vendidoLote(lv), lv.rastreio || '', lv.nfs || [...new Set(itensDoLote(lv.id).map(i => i.nf))].join(', '), lv.evid_url || '']) },
    { nome: 'Notas e calibres', titulo: tit, subtitulo: sub,
      colunas: [{ rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'NF', larg: 14 }, { rot: 'Boletim / lote', larg: 18 }, { rot: 'Material', larg: 44 }, { rot: 'Categoria', larg: 9 }, { rot: 'Calibre', larg: 8, tipo: 'num', casas: 0 },
        { rot: 'Embalagem', larg: 11 }, { rot: 'Caixas', larg: 8, tipo: 'num', casas: 0 }, { rot: 'kg', larg: 11, tipo: 'num', casas: 2 }],
      linhas: B.itens.filter(i => ids.has(i.lote_venda_id)).map(i => [i.data, i.nf, lote(i.lote_venda_id)?.codigo || '', i.material, i.categoria, i.calibre, i.embalagem, i.caixas != null ? Number(i.caixas) : null, Number(i.kg || 0)]) },
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
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgBm')?.open && !apr && !document.activeElement?.classList?.contains('bm-exp')) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparBalanco() {
  Object.assign(B, { carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [], itens: [], balanca: [] });
  Object.assign(B.f, { safra: '', faz: null }); Object.assign(B.fr, { q: '', ver: 'cadeia' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar(); fecharApr();
}
export const _bm = { B, resumo, rateio, classif, rastrear };
