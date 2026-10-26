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
import { campoAnexos, fotosDe, abrirArquivo } from './arquivos.js';

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
  carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [], itens: [], balanca: [], notas: [], pdf: new Map(),
  f: { safra: '', faz: null }, fr: { q: '', ver: 'cadeia' }, fv: { q: '', lote: '' },
};
const CAIXA = 'balanco.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { cult: B.cult, safras: B.safras, plantios: B.plantios, cargas: B.cargas, lotes: B.lotes, itens: B.itens, balanca: B.balanca, notas: B.notas });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !B.carregado) { Object.assign(B, { cult: c0.cult, safras: c0.safras || [], plantios: c0.plantios || [], cargas: c0.cargas || [], lotes: c0.lotes || [], itens: c0.itens || [], balanca: c0.balanca || [], notas: c0.notas || [] }); B.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (B.carregado) return;
    throw new Error('Sem internet e sem cópia do balanço de massa neste aparelho.');
  }
  const cu = await c.from('cp_culturas').select('*').eq('slug', 'abacate').maybeSingle();
  if (cu.error) { if (B.carregado) return; throw new Error(/permission|policy|does not exist/i.test(cu.error.message) ? 'As tabelas da Colheita não estão liberadas para a Certificação (supabase/cert-balanco.sql).' : cu.error.message); }
  if (!cu.data) throw new Error('A cultura Abacate não está cadastrada na Colheita e Produção.');
  const id = cu.data.id;
  const [s, p, g, l, it, ba, nf] = await Promise.all([
    c.from('cp_safras').select('*').eq('cultura_id', id).eq('ativo', true),
    c.from('cp_plantios').select('*').eq('cultura_id', id),
    c.from('cp_cargas').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
    c.from('cp_lotes_venda').select('*').eq('cultura_id', id).eq('ativo', true).order('data'),
    c.from('cp_vendas_itens').select('*').eq('cultura_id', id).eq('ativo', true).order('data').range(0, 9999),
    c.from('cp_balanca').select('id,ticket,data,placa,motorista,peso_bruto,peso_liquido,safra_id').eq('cultura_id', id).range(0, 9999),
    c.from('cp_notas_fiscais').select('*').eq('cultura_id', id).eq('ativo', true).order('data_emissao').range(0, 9999),
  ]);
  const erro = s.error || p.error || g.error || l.error || it.error;
  if (erro) { if (B.carregado) return; throw erro; }
  Object.assign(B, { cult: cu.data, safras: s.data || [], plantios: p.data || [], cargas: g.data || [], lotes: l.data || [], itens: it.data || [], balanca: ba.error ? [] : ba.data || [], notas: nf.error ? B.notas : nf.data || [], carregado: true });
  salvarCaixa();
  atualizarPdfs();
}
/* PDF de cada NF-e (Google Drive, chave certificacao/evidencia/nfe-<id>/…) */
const donoNota = id => 'nfe-' + id;
async function atualizarPdfs() {
  try {
    const m = await fotosDe('certificacao', 'evidencia', B.notas.map(n => donoNota(n.id)));
    B.pdf = new Map(B.notas.filter(n => m.has(donoNota(n.id))).map(n => [n.id, m.get(donoNota(n.id))]));
    if (telaAtual && !$('dlgBm')?.open && !document.activeElement?.classList?.contains('bm-exp')) redesenhar();
    if (apr) desenharTelaCheia();
  } catch { /* sem internet: segue sem o 📄 */ }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nfpdf]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const ch = B.pdf.get(b.dataset.nfpdf);
  if (ch) abrirArquivo(ch); else alert('Esta nota ainda não tem PDF anexado.');
}, true);

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
const notasDoLote = id => B.notas.filter(n => n.lote_venda_id === id).sort((a, b) => String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')) || String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true }));
const entradaLote = l => cargasDoLote(l.id).reduce((s, c) => s + kgC(c), 0);
/** Vendido do lote: a soma das notas; sem notas, o que foi digitado. */
function vendidoLote(l) {
  const it = itensDoLote(l.id); if (it.length) return it.reduce((s, i) => s + Number(i.kg || 0), 0);
  const nf = notasDoLote(l.id).filter(n => n.peso_kg != null); if (nf.length) return nf.reduce((s, n) => s + Number(n.peso_kg), 0);
  return l.peso_vendido != null ? Number(l.peso_vendido) : null;
}
const origemVendido = l => itensDoLote(l.id).length ? 'itens' : notasDoLote(l.id).some(n => n.peso_kg != null) ? 'notas' : 'digitado';
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
  for (const n of B.notas) if (bate(n.numero) || bate(n.chave_acesso)) add(lote(n.lote_venda_id), 'NF ' + n.numero);
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

/* ===================================================================
   AS TABELAS — no formato da planilha (pedido de 26/10/2026: "ficou
   complexo, deixe simples, igual a planilha")
   =================================================================== */
const cabForm = k => `<div class="bm-form">
  <div class="bm-form-logo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios"></div>
  <div class="bm-form-tit">BALANÇO DE MASSA</div>
  <table class="bm-form-cod"><tr><td>Código:</td><td>${FORM.alt}-00</td></tr><tr><td>Revisão:</td><td>${FORM.nrev}</td></tr></table>
  <div class="bm-form-faixa"><span>PROPRIEDADE: ${esc(k.faz || 'Todas')}</span><span>CULTURA: Abacate</span></div>
  <div class="bm-form-ano">${esc(safraNome(k.safraId))}</div></div>`;

/** 2 - Balanço de Massa: uma linha por talhão. edita = a produção prevista vira campo. */
function tabBalanco(k, edita) {
  return `<div class="ac-rola"><table class="bm-pl"><thead><tr>
    <th>Talhão</th><th>Variedade</th><th>Área (ha)</th><th>Início Colheita</th><th>Fim Colheita</th><th class="bm-digita">Produção prevista (kg)</th>
    <th class="bm-az">Colheita em caixas</th><th class="bm-az">Peso líquido colhido (kg)</th><th class="bm-az">Produção (t/ha)</th><th class="bm-az">% Aproveitamento</th>
    <th class="bm-az2">Peso Sujo</th><th class="bm-az2">Peso Beneficiado</th><th class="bm-az2">Peso Vendido</th><th class="bm-az2">Peso Descarte</th><th class="bm-az2">% Perda</th></tr></thead><tbody>
    ${k.talhoes.map(t => `<tr><td>${esc(t.p.nome)}</td><td>${esc(t.p.variedade || '')}</td><td class="n">${fmt(t.area, 2)}</td><td>${t.n ? br(t.ini) : ''}</td><td>${t.n ? br(t.fim) : ''}</td>
      <td class="n bm-digita">${edita ? `<input type="text" inputmode="decimal" class="bm-exp" data-exp="${esc(t.p.id)}" value="${t.exp != null ? esc(fmt(t.exp)) : ''}" aria-label="Produção prevista de ${esc(t.p.nome)}">` : t.exp != null ? fmt(t.exp) : ''}</td>
      <td class="n">${t.n ? fmt(t.cx) : '-'}</td><td class="n">${t.n ? fmt(t.kg, 2) : '-'}</td><td class="n">${t.kgHa != null ? fmt(t.kgHa / 1000, 2) : '-'}</td><td class="n">${t.aprov != null ? fmt(t.aprov * 100, 1) + '%' : '-'}</td>
      <td class="n">${t.sujo ? fmt(t.sujo, 2) : '-'}</td><td class="n">${t.benef ? fmt(t.benef, 2) : '-'}</td><td class="n">${t.n ? fmt(t.vend, 2) : '-'}</td><td class="n">${t.n ? fmt(t.desc, 2) : '-'}</td><td class="n">${t.kg ? pct(t.desc, t.kg, 2) : '-'}</td></tr>`).join('')}
    <tr class="bm-tot"><td colspan="2">Total</td><td class="n">${fmt(k.area, 2)}</td><td>${br(k.tot.ini)}</td><td>${br(k.tot.fim)}</td><td class="n">${k.expTot != null ? fmt(k.expTot) : ''}</td>
      <td class="n">${fmt(k.tot.cx)}</td><td class="n">${fmt(k.tot.kg, 2)}</td><td class="n">${k.kgHa != null ? fmt(k.kgHa / 1000, 2) : '-'}</td><td class="n">${k.expTot ? pct(k.tot.kg, k.expTot) : '-'}</td>
      <td class="n">${fmt(k.tot.sujo, 2)}</td><td class="n">${fmt(k.tot.benef, 2)}</td><td class="n">${fmt(k.tot.vend, 2)}</td><td class="n">${fmt(k.tot.desc, 2)}</td><td class="n">${pct(k.tot.desc, k.tot.kg, 2)}</td></tr>
  </tbody></table></div>`;
}

/** 1 - Rastreabilidade: uma linha por carga; boletim/NF, vendido e descarte juntam as cargas do mesmo lote (como as células mescladas da planilha). */
function grupos(k, q) {
  const ach = so(q) ? new Set(rastrear(q, k.safraId).map(a => a.l.id)) : null;
  const porLote = new Map();
  for (const c of k.cargas.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.ticket_faz || '').localeCompare(String(b.ticket_faz || ''), 'pt-BR', { numeric: true }))) {
    const id = c.lote_venda_id || 'sem';
    if (ach && !ach.has(id)) continue;
    if (!porLote.has(id)) porLote.set(id, []);
    porLote.get(id).push(c);
  }
  const ord = l => (l && /suj/i.test(l.tipo || '')) ? 0 : l ? 1 : 2;
  return [...porLote.entries()].map(([id, cs]) => ({ l: lote(id), cs })).sort((a, b) => ord(a.l) - ord(b.l) || String(a.cs[0].data).localeCompare(String(b.cs[0].data)));
}
const nfsDe = l => { if (!l) return ''; const n = [...new Set([...notasDoLote(l.id).map(x => so(x.numero)), ...itensDoLote(l.id).map(i => so(i.nf))])].filter(Boolean); return n.length ? n.join(', ') : so(l.nfs); };
/** Botões 📄 das NF-e do lote que têm PDF anexado. */
const pdfsDe = l => l ? notasDoLote(l.id).filter(n => B.pdf.has(n.id)).map(n => `<button type="button" class="ce-link bm-pdf" data-nfpdf="${esc(n.id)}" title="Abrir o PDF da NF-e ${esc(n.numero)}">📄 ${esc(n.numero)}</button>`).join(' ') : '';
const qtdNfs = l => { const n = nfsDe(l); return n ? n.split(/[,/]/).filter(x => so(x)).length : 0; };
function tabRastreio(k, q, edita) {
  const G = grupos(k, q);
  if (!G.length) return `<div class="vazio">${so(q) ? `Nada encontrado para “${esc(q)}”.` : 'Nenhuma carga nesta safra.'}</div>`;
  const linhas = G.map(({ l, cs }) => {
    const suj = l ? /suj/i.test(l.tipo || '') : false;
    const ent = cs.reduce((s, c) => s + kgC(c), 0), vend = l ? vendidoLote(l) : null;
    const todoLote = l ? cargasDoLote(l.id).length === cs.length : true;
    return cs.map((c, i) => {
      const cx = cxC(c), kg = kgC(c), b = balancaDe(c);
      const mesc = i ? '' : `<td rowspan="${cs.length}" class="bm-nf">${l ? `${edita ? `<button type="button" class="ce-link" data-lv="${esc(l.id)}">` : ''}${esc(nfsDe(l) || '—')}${edita ? '</button>' : ''}${pdfsDe(l) ? `<br>${pdfsDe(l)}` : ''}` : '<span class="tag alerta">sem boletim / NF</span>'}</td>
        <td rowspan="${cs.length}" class="ce">${evid(l?.evid_url, 'Ver evidência')}</td>
        <td rowspan="${cs.length}" class="n"><b>${vend != null ? fmt(todoLote ? vend : vend * ent / (entradaLote(l) || 1), 2) : '-'}</b></td>
        <td rowspan="${cs.length}" class="n">${vend != null && !suj ? fmt(ent - (todoLote ? vend : vend * ent / (entradaLote(l) || 1)), 2) : '-'}</td>
        <td rowspan="${cs.length}" class="n">${vend != null && !suj && ent ? pct(ent - (todoLote ? vend : vend * ent / (entradaLote(l) || 1)), ent) : '-'}</td>`;
      return `<tr${edita ? ` data-cg="${esc(c.id)}"` : ''}><td>${br(c.data)}</td><td>${esc(c.placa || '')}</td><td class="ce">${esc(c.ticket_faz || '')}</td><td class="ce">${c.conferido ? 'SIM' : ''}</td><td class="ce">${evid(c.evid_url, 'Ver')}</td>
        <td class="ce">${esc(nomeTal(c).replace('Talhão ', 'T-').replace(/T-(\d)$/, 'T-0$1'))}</td><td class="ce">${esc(plantio(c.plantio_id)?.variedade || '')}</td><td class="n">${fmt(cx)}</td><td class="n">${fmt(ef(c) * 100, 0)}%</td>
        <td class="ce">${esc(c.ticket_balanca || '')}${b ? ' ✓' : ''}</td><td class="n">${fmt(kg)}</td><td class="n">${cx ? fmt(kg / cx, 2) : '-'}</td>
        <td class="ce">${esc(l?.destino || '')}</td><td class="ce ${suj ? 'bm-tsuja' : 'bm-tbenef'}">${suj ? 'SUJA' : l ? 'BENEF.' : ''}</td><td class="ce">${esc(c.boletim || (l && !suj ? l.codigo.replace(/^Boletim\s*/i, '') : '0'))}</td>${mesc}</tr>`;
    }).join('');
  }).join('');
  const s = somar(G.flatMap(g => g.cs), k.vend);
  return `<div class="ac-rola"><table class="bm-pl bm-rast"><thead><tr>
    <th>Data colheita</th><th>Placa</th><th>Ticket</th><th>Inspeção colheita</th><th>Evidências</th><th>Talhão</th><th>Variedade</th><th>Caixas</th><th>% Colheita</th>
    <th>Ticket balança</th><th>Peso líq</th><th>Peso / Cx</th><th>Packing House</th><th>Tipo Carga</th><th>Boletim</th><th>NF-e</th><th>Evidências</th><th>Peso Vendido</th><th>Peso Descarte</th><th>% Descarte</th></tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr class="bm-tot"><td colspan="7">Total</td><td class="n">${fmt(s.cx)}</td><td></td><td></td><td class="n">${fmt(s.kg)}</td><td class="n">${s.cx ? fmt(s.kg / s.cx, 2) : ''}</td><td colspan="5"></td>
      <td class="n">${fmt(s.vend, 2)}</td><td class="n">${fmt(s.desc, 2)}</td><td class="n">${pct(s.desc, s.kg)}</td></tr></tfoot></table></div>`;
}

/** Classificação do boletim do lavador: Cat 1, Cat 2, Cat 3 (campos) e o % de cada. */
function tabClassif(k, edita) {
  const L = k.lotes.filter(l => !/suj/i.test(l.tipo || '') && cargasDoLote(l.id).length);
  if (!L.length) return '<p class="dica">Nenhum boletim do lavador nesta safra.</p>';
  const tot = { ent: 0 }; CATS.forEach(([c]) => { tot[c] = 0; });
  const linhas = L.map(l => {
    const ent = entradaLote(l); tot.ent += ent;
    const soma = CATS.reduce((s, [c]) => s + Number(l[c] || 0), 0);
    CATS.forEach(([c]) => { tot[c] += Number(l[c] || 0); });
    return `<tr><td>${esc(l.codigo)}</td><td class="n">${fmt(ent)}</td>
      ${CATS.map(([c, r]) => `<td class="n bm-digita">${edita ? `<input type="text" inputmode="decimal" class="bm-exp" data-cat="${esc(l.id)}" data-campo="${c}" value="${l[c] != null ? esc(fmt(l[c])) : ''}" aria-label="${r} do ${esc(l.codigo)} (kg)">` : l[c] != null ? fmt(l[c]) : ''}</td><td class="n">${l[c] != null && soma ? pct(Number(l[c]), soma) : ''}</td>`).join('')}</tr>`;
  }).join('');
  const st = CATS.reduce((s, [c]) => s + tot[c], 0);
  return `<div class="ac-rola"><table class="bm-pl"><thead><tr><th>Boletim</th><th>Peso que entrou (kg)</th>${CATS.map(([, r]) => `<th class="bm-digita">${r} (kg)</th><th>%</th>`).join('')}</tr></thead>
    <tbody>${linhas}<tr class="bm-tot"><td>Total</td><td class="n">${fmt(tot.ent)}</td>${CATS.map(([c]) => `<td class="n">${fmt(tot[c])}</td><td class="n">${st ? pct(tot[c], st) : ''}</td>`).join('')}</tr></tbody></table></div>`;
}

/** Calibres: % de cada calibre no que foi vendido (notas da Coopadap). */
function tabCalibres(k) {
  const cl = k.cl;
  if (!cl.calibres.length) return '<p class="dica">Sem notas de venda com calibre nesta safra.</p>';
  return `<div class="ac-rola"><table class="bm-pl"><thead><tr><th>Calibre</th><th>Peso do fruto</th><th>Cat 1 (kg)</th><th>Cat 2 (kg)</th><th>Total (kg)</th><th>%</th></tr></thead><tbody>
    ${cl.calibres.map(x => `<tr><td class="ce"><b>${x.c}</b></td><td class="ce">${esc(REF_CAL[x.c] || '')}</td><td class="n">${fmt(x.c1)}</td><td class="n">${fmt(x.c2)}</td><td class="n">${fmt(x.kg)}</td><td class="n"><b>${pct(x.kg, cl.totCal)}</b></td></tr>`).join('')}
    <tr class="bm-tot"><td colspan="2">Total</td><td class="n">${fmt(cl.calibres.reduce((s, x) => s + x.c1, 0))}</td><td class="n">${fmt(cl.calibres.reduce((s, x) => s + x.c2, 0))}</td><td class="n">${fmt(cl.totCal)}</td><td class="n">100%</td></tr></tbody></table></div>
    <p class="dica" style="margin-top:4px">Calibre = quantos frutos cabem numa caixa de 4 kg (quanto menor o número, maior o fruto).</p>`;
}

function avisoCurto(k) {
  const a = [];
  if (k.tot.semVenda) a.push(`${k.tot.semVenda} carga(s) sem boletim/NF`);
  const semCat = k.lotes.filter(l => !/suj/i.test(l.tipo || '') && cargasDoLote(l.id).length && !CATS.some(([c]) => l[c] != null)).length;
  if (semCat) a.push(`${semCat} boletim(ns) sem Cat 1/2/3`);
  return a.length ? `<p class="dica" style="margin:8px 0 0">⚠ ${a.join(' · ')}.</p>` : '';
}
function ligarCampos(el) {
  el.querySelectorAll('[data-exp]').forEach(inp => inp.addEventListener('change', () => salvarCampo(inp, 'cp_plantios', inp.dataset.exp, 'expectativa_kg', B.plantios)));
  el.querySelectorAll('[data-cat]').forEach(inp => inp.addEventListener('change', () => salvarCampo(inp, 'cp_lotes_venda', inp.dataset.cat, inp.dataset.campo, B.lotes)));
}
async function salvarCampo(inp, tabela, id, campo, lista) {
  if (precisaRede()) return;
  const v = num(inp.value);
  if (Number.isNaN(v) || (v != null && v < 0)) { inp.classList.add('bm-erro'); return; }
  inp.disabled = true;
  const { data, error } = await estado.cliente.from(tabela).update({ [campo]: v }).eq('id', id).select().single();
  if (error) { inp.disabled = false; inp.classList.add('bm-erro'); alert('Não consegui gravar: ' + error.message); return; }
  trocar(lista, data); salvarCaixa(); redesenhar();
}

/* ===================================================================
   TELA · BALANÇO DE MASSA (painel do FORM 013)
   =================================================================== */
function desenharPainel() {
  const tela = $('telaBmPainel');
  const fil = filtros();
  const k = resumo(B.f.safra, B.f.faz);
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="grade larga">${fil}</div>
    ${cabForm(k)}
    ${tabBalanco(k, true)}
    <p class="dica" style="margin:4px 0 0">Você digita só a coluna verde (produção prevista). O resto vem das cargas e das notas.</p>
    ${avisoCurto(k)}
    <h3 class="bm-h3">Classificação do lavador (por boletim)</h3>${tabClassif(k, true)}
    <h3 class="bm-h3">Calibres vendidos</h3>${tabCalibres(k)}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="bmTela">Tela cheia (auditor)</button>
    <button class="btn" type="button" id="bmImp">Imprimir</button>
    <button class="btn" type="button" id="bmXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharPainel); ligarCampos(tela);
  $('bmTela').addEventListener('click', () => telaCheia());
  $('bmImp').addEventListener('click', () => mostrar(docForm(k), { barra: true }));
  $('bmXlsx').addEventListener('click', () => exportar(k));
}

/* ===================================================================
   TELA · RASTREABILIDADE (igual à aba 1 da planilha)
   =================================================================== */
function desenharRastreio() {
  const tela = $('telaBmRastreio');
  const fil = filtros();
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="grade larga">${fil}
      <label class="campo" style="grid-column:span 2">Procurar <input type="search" id="brQ" value="${esc(B.fr.q)}" placeholder="NF, boletim, placa ou ticket"></label></div>
    <div id="brCorpo" style="margin-top:10px"></div>
    <p class="dica" style="margin-top:6px">Clique numa carga para ligar ao boletim/NF; clique na NF para abrir o boletim. Cargas e pesos se lançam na <a class="ce-link" href="${COLHEITA_URL}" target="_blank" rel="noopener">Colheita e Produção</a>.</p>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="brTela">Tela cheia (auditor)</button>
    <button class="btn" type="button" id="brImp">Imprimir</button>
    <button class="btn" type="button" id="brXlsx">Excel</button>
  </div>`;
  ligarFiltros(desenharRastreio);
  $('brQ').addEventListener('input', e => { B.fr.q = e.target.value; corpoRastreio(); });
  $('brTela').addEventListener('click', () => telaCheia());
  $('brImp').addEventListener('click', () => mostrar(docRastreio(resumo(B.f.safra, B.f.faz)), { barra: true }));
  $('brXlsx').addEventListener('click', () => exportar(resumo(B.f.safra, B.f.faz)));
  corpoRastreio();
}
function corpoRastreio() {
  const el = $('brCorpo'); if (!el) return;
  el.innerHTML = tabRastreio(resumo(B.f.safra, B.f.faz), B.fr.q, true);
  el.querySelectorAll('[data-cg]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('a,button')) return; formCarga(B.cargas.find(c => c.id === tr.dataset.cg)); }));
  el.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => formLote(lote(b.dataset.lv))));
}

/* ===================================================================
   TELA CHEIA PARA O AUDITOR — tudo numa página só, sem edição
   =================================================================== */
let apr = null;
function telaCheia() {
  fecharApr();
  const el = document.createElement('div'); el.id = 'bmApresenta'; el.className = 'bm-ap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  apr = { el, q: '', tecla: e => { if (e.key === 'Escape') fecharApr(); } };
  document.addEventListener('keydown', apr.tecla);
  desenharTelaCheia();
}
function desenharTelaCheia() {
  const k = resumo(B.f.safra, B.f.faz);
  apr.el.innerHTML = `<header class="bm-ap-topo"><div><h2>Balanço de massa e rastreabilidade</h2><small>${FORM.codigo} · Abacate · safra ${esc(safraNome(B.f.safra))} · ${esc(B.f.faz || 'todas as propriedades')}</small></div>
      <input type="search" id="apQ" placeholder="Procurar NF, boletim, placa ou ticket" value="${esc(apr.q)}">
      <button class="btn" type="button" id="apSair">Fechar (Esc)</button></header>
    <main class="bm-ap-corpo">
      ${cabForm(k)}${tabBalanco(k, false)}
      <h3 class="bm-h3">Rastreabilidade das cargas</h3><div id="apRast">${tabRastreio(k, apr.q, false)}</div>
      <h3 class="bm-h3">Classificação do lavador (por boletim)</h3>${tabClassif(k, false)}
      <h3 class="bm-h3">Calibres vendidos</h3>${tabCalibres(k)}
    </main>`;
  $('apSair').onclick = fecharApr;
  $('apQ').addEventListener('input', e => { apr.q = e.target.value; $('apRast').innerHTML = tabRastreio(k, apr.q, false); });
}
function fecharApr() { if (!apr) return; document.removeEventListener('keydown', apr.tecla); apr.el.remove(); apr = null; }

/* ===================================================================
   TELA · FECHAMENTO (comparativo entre safras, como a aba Fechamento)
   =================================================================== */
function comparativo(faz) { return safrasOrd().slice().reverse().map(s => ({ s, k: resumo(s.id, faz) })).filter(x => x.k.cargas.length); }
const INDIC = [
  ['Área (ha)', k => fmt(k.area, 2)], ['Início Colheita', k => br(k.tot.ini)], ['Fim Colheita', k => br(k.tot.fim)],
  ['Peso Colhido (kg)', k => fmt(k.tot.kg, 2)], ['Colhido (kg/ha)', k => fmt(k.kgHa, 2)],
  ['Peso Vendido (kg)', k => fmt(k.tot.vend, 2)], ['Vendido (kg/ha)', k => fmt(k.vendHa, 2)],
  ['Peso Descarte (kg)', k => fmt(k.tot.desc, 2)], ['% Perda', k => pct(k.tot.desc, k.tot.kg, 2)],
];
function tabFechamento(L) {
  return `<div class="ac-rola"><table class="bm-pl"><thead><tr><th>Indicador</th>${L.map(x => `<th>${esc(x.s.nome)}</th>`).join('')}</tr></thead><tbody>
    ${INDIC.map(([r, f]) => `<tr><td>${r}</td>${L.map(x => `<td class="n">${f(x.k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function tabFechTalhao(L) {
  const nomes = [...new Set(L.flatMap(x => x.k.talhoes.filter(t => t.n).map(t => t.p.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return `<div class="ac-rola"><table class="bm-pl"><thead><tr><th rowspan="2">Talhão</th>${L.map(x => `<th colspan="3">${esc(x.s.nome)}</th>`).join('')}</tr>
    <tr>${L.map(() => '<th>Colhido (kg)</th><th>Vendido (kg)</th><th>% Perda</th>').join('')}</tr></thead><tbody>
    ${nomes.map(n => `<tr><td>${esc(n)}</td>${L.map(x => { const t = x.k.talhoes.find(y => y.p.nome === n && y.n); return t ? `<td class="n">${fmt(t.kg, 2)}</td><td class="n">${fmt(t.vend, 2)}</td><td class="n">${pct(t.desc, t.kg, 2)}</td>` : '<td class="n">-</td><td class="n">-</td><td class="n">-</td>'; }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function desenharFechamento() {
  const tela = $('telaBmFechamento');
  if (B.f.faz === null) B.f.faz = fazPadrao(B.f.safra || safraPadrao());
  const L = comparativo(B.f.faz);
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="grade larga"><label class="campo">Propriedade <select id="bmFaz">${opcoes(fazendas(''), B.f.faz, 'Todas')}</select></label></div>
    <h3 class="bm-h3">Comparativo entre safras — Abacate · ${esc(B.f.faz || 'todas as propriedades')}</h3>
    ${L.length ? tabFechamento(L) + `<h3 class="bm-h3">Por talhão</h3>${tabFechTalhao(L)}<p class="dica" style="margin-top:6px">Safra = ano da colheita (na planilha: 2024 = “2022/2023”, 2025 = “2023/2024”, 2026 = “2024/2025”).</p>` : '<div class="vazio">Nenhuma carga.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="bfImp">Imprimir</button></div>`;
  $('bmFaz').addEventListener('change', e => { B.f.faz = e.target.value; desenharFechamento(); });
  $('bfImp').addEventListener('click', () => mostrar(docFechamento(L), { barra: true }));
}

/* ===================================================================
   IMPRESSOS
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo }) {
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div></header>
    <div class="bm-impresso">${corpo}</div>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
const subt = k => `Abacate · safra ${safraNome(k.safraId)} · ${k.faz || 'todas as propriedades'}`;
function docForm(k) {
  return documento({ titulo: 'Balanço de massa', subtitulo: subt(k), canto: `${FORM.codigo} (${FORM.alt}) · rev. ${FORM.nrev}`, corpo: `
    ${tabBalanco(k, false)}
    <p class="rel-secao">Classificação do lavador (por boletim)</p>${tabClassif(k, false)}
    <p class="rel-secao">Calibres vendidos</p>${tabCalibres(k)}` });
}
function docRastreio(k) {
  return documento({ titulo: 'Rastreabilidade', subtitulo: subt(k), canto: FORM.codigo, corpo: tabRastreio(k, B.fr.q, false) });
}
function docFechamento(L) {
  return documento({ titulo: 'Fechamento — comparativo entre safras', subtitulo: `Abacate · ${B.f.faz || 'todas as propriedades'}`, canto: FORM.codigo, corpo: `${tabFechamento(L)}<p class="rel-secao">Por talhão</p>${tabFechTalhao(L)}` });
}

/* ===================================================================
   CARGA (o que a Certificação completa)
   =================================================================== */
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

/* ===================================================================
   TELA · BOLETINS E VENDAS
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
        ${CATS.map(([k]) => `<td class="ce">${l[k] != null ? `${fmt(l[k])}<br><small class="dica">${pct(Number(l[k]), tc, 0)}</small>` : /suj/i.test(l.tipo || '') ? '' : `<button class="ce-link" type="button" data-lv="${esc(l.id)}" title="Lançar a quantidade">lançar</button>`}</td>`).join('')}
        <td class="ce">${qtdNfs(l)}${notasDoLote(l.id).some(n => B.pdf.has(n.id)) ? ' 📄' : ''}</td>
        <td class="ce"><b>${fmt(v)}</b>${it.length || v == null ? '' : `<br><small class="dica">${origemVendido(l) === 'notas' ? 'das NF-e' : 'digitado'}</small>`}</td><td class="ce">${s.kg && v != null ? pct(s.kg - v, s.kg) : '—'}</td>
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
  const nfs = l ? notasDoLote(l.id) : [];
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
    <fieldset class="cp-fs bm-fs-cat"><legend>Quantidade de Cat 1, Cat 2 e Cat 3 do boletim do lavador (kg) <span class="dica" id="lvCatSoma"></span></legend>
      <div class="grade">${CATS.map(([k, r]) => `<label class="campo">${r} <input type="text" inputmode="decimal" id="lv_${k}" value="${nkg(v[k])}"></label>`).join('')}</div></fieldset>
    <div class="grade">
      <label class="campo">Peso vendido (kg) ${it.length ? `<input type="text" disabled value="${esc(fmt(vendidoLote(l), 2))} (soma de ${it.length} linha(s) de nota)">` : l && origemVendido(l) === 'notas' ? `<input type="text" disabled value="${esc(fmt(vendidoLote(l), 2))} (soma das NF-e cadastradas)">` : `<input type="text" inputmode="decimal" id="lvVend" value="${nkg(v.peso_vendido)}">`}</label>
      <label class="campo">Evidência da venda (link) <input type="url" id="lvEv" value="${esc(v.evid_url || '')}" placeholder="https://…"></label>
    </div>
    <datalist id="lvDests">${destinos.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <fieldset class="cp-fs"><legend>NF-e do lote</legend>
      ${nfs.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr><th>NF-e</th><th class="ce">Emissão</th><th>Destinatário</th><th class="ce">Peso (kg)</th><th class="ce">Valor (R$)</th><th class="ce">PDF</th><th></th></tr></thead><tbody>
        ${nfs.map(n => `<tr><td><b>${esc(n.numero)}</b>${n.serie ? ` <small class="dica">série ${esc(n.serie)}</small>` : ''}${n.chave_acesso ? `<br><small class="dica">${esc(n.chave_acesso)}</small>` : ''}</td><td class="ce">${br(n.data_emissao)}</td><td>${esc(n.destinatario || '')}</td>
          <td class="ce">${n.peso_kg != null ? fmt(n.peso_kg, 2) : '—'}</td><td class="ce">${n.valor != null ? fmt(n.valor, 2) : '—'}</td>
          <td class="ce">${B.pdf.has(n.id) ? `<button type="button" class="ce-link" data-nfpdf="${esc(n.id)}">📄 Abrir</button>` : '<span class="tag alerta">sem PDF</span>'}</td>
          <td class="ce"><button class="btn mini" type="button" data-nfed="${esc(n.id)}">Editar</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="dica" style="margin:4px 0">Nenhuma NF-e cadastrada neste lote.</p>'}
      <div class="barra" style="margin:8px 0 0"><button class="btn" type="button" id="lvNfNova">＋ Cadastrar NF-e (com PDF)</button>
        <small class="dica">${l ? 'O lote é salvo antes de abrir a nota.' : 'O lote é salvo primeiro; depois abre a nota.'}</small></div>
      ${v.nfs ? `<details style="margin-top:6px"><summary class="ce-link">NF-e em texto (lançamento antigo)</summary><textarea id="lvNfs" rows="2">${esc(v.nfs || '')}</textarea></details>` : ''}
    </fieldset>
    <fieldset class="cp-fs"><legend>Cargas deste lote <span class="dica" id="lvSoma"></span></legend>
      <div class="bm-cargas">${cargas.map(c => { const outro = c.lote_venda_id && c.lote_venda_id !== l?.id ? lote(c.lote_venda_id) : null;
        return `<label class="rs-check${outro ? ' dica' : ''}"><input type="checkbox" value="${esc(c.id)}" data-kg="${kgC(c)}" ${l && c.lote_venda_id === l.id ? 'checked' : ''}>
          ${br(c.data)} · ${esc(nomeTal(c))} · ${esc(c.placa || '')} · ${fmt(cxC(c))} cx · ${fmt(kgC(c))} kg${c.tipo ? ' · ' + esc(c.tipo) : ''}${outro ? ` <small>(hoje em ${esc(outro.codigo)})</small>` : ''}</label>`; }).join('') || '<p class="dica">Nenhuma carga nesta safra.</p>'}</div>
    </fieldset>
    ${it.length ? `<details class="cp-fs"><summary class="ce-link">Notas de venda deste lote (${new Set(it.map(i => i.nf)).size} NF, ${it.length} linhas)</summary>${tabCalibres({ cl: classif(cargasDoLote(l.id)) })}</details>` : ''}
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
    $('lvNfNova').addEventListener('click', () => salvarLote(l, saf, marcadas().map(i => i.value), novo => formNota(null, novo)));
    d.querySelectorAll('[data-nfed]').forEach(b => b.addEventListener('click', () => salvarLote(l, saf, marcadas().map(i => i.value), novo => formNota(B.notas.find(n => n.id === b.dataset.nfed), novo))));
    $('lvApagar')?.addEventListener('click', () => apagarLote(l));
  });
}
async function salvarLote(atual, saf, ids, depois) {
  if (precisaRede()) return;
  const ev = so($('lvEv').value);
  const linha = { codigo: so($('lvCod').value), data: $('lvData').value || null, destino: so($('lvDest').value) || null, tipo: $('lvTipo').value || null,
    certificacao: $('lvCert').value || null, rastreio: so($('lvRast').value) || null, evid_url: ev || null, nfs: $('lvNfs') ? so($('lvNfs').value) || null : (atual?.nfs || null), obs: so($('lvObs').value) || null };
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
    salvarCaixa();
    if (depois) { redesenhar(); return depois(data); }
    fechar(); redesenhar();
  } catch (e) { if ($('lvOk')) $('lvOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
}

/* ---------- cadastro da NF-e, com o PDF (pedido de 26/10/2026) ----------
   "Em nf-e, vamos colocar uma forma de cadastrar a nota, e anexar o pdf."
   Abre no mesmo diálogo do lote; ao salvar ou voltar, o lote reabre. */
let anexoNota = null;
function formNota(n, l) {
  if (!l) return;
  const v = n || { numero: '', serie: '', data_emissao: l.data || hoje(), chave_acesso: '', destinatario: l.destino || '', peso_kg: null, valor: null, obs: '' };
  const destinos = [...new Set(['Coopadap', 'Carlini', ...B.lotes.map(x => x.destino), ...B.notas.map(x => x.destinatario)].filter(Boolean))];
  const nn = (x, c) => x != null ? esc(fmt(x, c)) : '';
  dialogo(`<h3>${n ? 'NF-e ' + esc(n.numero) : 'Cadastrar NF-e'} · ${esc(l.codigo)}</h3>
    <div class="aviso erro" id="bmErro" hidden></div>
    <div class="grade">
      <label class="campo">Número da NF-e * <input type="text" id="nfNum" inputmode="numeric" value="${esc(v.numero || '')}" placeholder="001031094"></label>
      <label class="campo">Série <input type="text" id="nfSerie" value="${esc(v.serie || '')}" placeholder="2"></label>
      <label class="campo">Data de emissão <input type="date" id="nfData" value="${esc(String(v.data_emissao || '').slice(0, 10))}"></label>
      <label class="campo">Destinatário <input type="text" id="nfDest" value="${esc(v.destinatario || '')}" list="nfDests"></label>
      <label class="campo">Peso (kg) <input type="text" inputmode="decimal" id="nfPeso" value="${nn(v.peso_kg, 2)}"></label>
      <label class="campo">Valor (R$) <input type="text" inputmode="decimal" id="nfValor" value="${nn(v.valor, 2)}"></label>
    </div>
    <label class="campo">Chave de acesso (44 números) <input type="text" inputmode="numeric" id="nfChave" value="${esc(v.chave_acesso || '')}" placeholder="opcional"></label>
    <datalist id="nfDests">${destinos.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div id="nfAnexo" style="margin-top:8px"></div>
    <label class="campo">Observação <textarea id="nfObs" rows="2">${esc(v.obs || '')}</textarea></label>
    <p class="dica">O peso das NF-e cadastradas vira o peso vendido do lote quando não há relatório de vendas importado.</p>
    <div class="barra entre"><div>${n ? '<button class="btn perigo" type="button" id="nfApagar">Apagar nota</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" id="nfVolta">Voltar ao lote</button><button class="btn principal" type="button" id="nfOk">Salvar nota</button></div></div>`, () => {
    anexoNota = campoAnexos($('nfAnexo'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'PDF da NF-e', dica: 'PDF (ou foto) da nota' });
    anexoNota.abrir(n ? donoNota(n.id) : null);
    $('nfVolta').addEventListener('click', () => formLote(lote(l.id)));
    $('nfOk').addEventListener('click', () => salvarNota(n, l));
    $('nfApagar')?.addEventListener('click', () => apagarNota(n, l));
  });
}
async function salvarNota(atual, l) {
  if (precisaRede()) return;
  const chave = so($('nfChave').value).replace(/\D/g, '');
  const linha = { numero: so($('nfNum').value).replace(/^NF-?e?\s*/i, ''), serie: so($('nfSerie').value) || null, data_emissao: $('nfData').value || null,
    destinatario: so($('nfDest').value) || null, chave_acesso: chave || null, obs: so($('nfObs').value) || null, lote_venda_id: l.id, safra_id: l.safra_id };
  if (!linha.numero) return erroDlg('Informe o número da NF-e.');
  if (chave && chave.length !== 44) return erroDlg(`A chave de acesso tem 44 números (esta tem ${chave.length}).`);
  for (const [id, campo, rot] of [['nfPeso', 'peso_kg', 'o peso'], ['nfValor', 'valor', 'o valor']]) {
    const x = num($(id).value); if (Number.isNaN(x) || (x != null && x < 0)) return erroDlg(`Confira ${rot}.`); linha[campo] = x;
  }
  const rep = B.notas.find(x => x.id !== atual?.id && x.safra_id === l.safra_id && so(x.numero).replace(/^0+/, '') === linha.numero.replace(/^0+/, '') && so(x.serie) === so(linha.serie));
  if (rep) return erroDlg(`A NF-e ${esc(linha.numero)} já está cadastrada${lote(rep.lote_venda_id) ? ' em ' + esc(lote(rep.lote_venda_id).codigo) : ''}.`);
  $('nfOk').disabled = true;
  try {
    const t = estado.cliente.from('cp_notas_fiscais');
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single()
      : await t.insert({ ...linha, cultura_id: B.cult.id, criado_por: quem() }).select().single();
    if (error) throw error;
    trocar(B.notas, data);
    if (anexoNota?.mudou) { await anexoNota.salvar(donoNota(data.id)); }
    salvarCaixa();
    await atualizarPdfs();
    formLote(lote(l.id)); redesenhar();
  } catch (e) { if ($('nfOk')) $('nfOk').disabled = false; erroDlg('Não consegui gravar a nota: ' + esc(e.message || e)); }
}
function apagarNota(n, l) {
  if (!confirm(`Apagar a NF-e ${n.numero}? O PDF anexado sai junto.`)) return;
  if (precisaRede()) return;
  (async () => {
    const { error } = await estado.cliente.from('cp_notas_fiscais').delete().eq('id', n.id);
    if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
    if (B.pdf.has(n.id) && anexoNota) { /* tira o PDF do Drive */ document.querySelectorAll('#nfAnexo [data-tirar]').forEach(b => b.click()); if (anexoNota.mudou) await anexoNota.salvar(donoNota(n.id)); }
    B.notas = B.notas.filter(x => x.id !== n.id); B.pdf.delete(n.id);
    salvarCaixa(); formLote(lote(l.id)); redesenhar();
  })();
}
function apagarLote(l) {
  const n = cargasDoLote(l.id).length, ni = itensDoLote(l.id).length;
  dialogo(`<h3>Apagar ${esc(l.codigo)}</h3><div class="aviso erro" id="bmErro" hidden></div>
    <p>${n ? `${n} carga(s) ficam sem lote (as cargas não são apagadas).` : 'Nenhuma carga ligada.'}${ni ? ` ${ni} linha(s) de nota ficam sem boletim.` : ''}${notasDoLote(l.id).length ? ` ${notasDoLote(l.id).length} NF-e cadastrada(s) ficam sem lote.` : ''}</p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="laOk">Apagar</button></div>`, () => {
    $('laOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('laOk').disabled = true;
      if (n) { const r = await estado.cliente.from('cp_cargas').update({ lote_venda_id: null }).eq('lote_venda_id', l.id).select(); if (r.error) { $('laOk').disabled = false; return erroDlg(esc(r.error.message)); } r.data.forEach(x => trocar(B.cargas, x)); }
      const { error } = await estado.cliente.from('cp_lotes_venda').delete().eq('id', l.id);
      if (error) { $('laOk').disabled = false; return erroDlg('Não consegui apagar: ' + esc(error.message)); }
      B.lotes = B.lotes.filter(x => x.id !== l.id); B.itens.forEach(i => { if (i.lote_venda_id === l.id) i.lote_venda_id = null; }); B.notas.forEach(x => { if (x.lote_venda_id === l.id) x.lote_venda_id = null; });
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
  Object.assign(B, { carregado: false, cult: null, safras: [], plantios: [], cargas: [], lotes: [], itens: [], balanca: [], notas: [], pdf: new Map() });
  Object.assign(B.f, { safra: '', faz: null }); Object.assign(B.fr, { q: '', ver: 'cadeia' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar(); fecharApr();
}
export const _bm = { B, resumo, rateio, classif, rastrear };
