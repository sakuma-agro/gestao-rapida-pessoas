// dados.js — o que as telas da Colheita e Produção usam em comum (20/10/2026).
//
// Uma estrutura só para todas as culturas. O que muda de uma para outra mora
// no PERFIL da cultura (cp_culturas): unidade (cx 29 kg, sc 25 kg, sc 60 kg),
// classificação da carga (AAA/AA/A/G, Extra/1ª/2ª…, BX/BM/ESC), campos que
// aparecem no lançamento e o tipo de conferência (balança, cooperativa).
//
// As contas seguem as planilhas "Controle Colheita - <cultura>":
//   unidades da carga = soma das classes (batata, café)
//                     | peso líquido ÷ kg da unidade (cenoura cx 29 kg, grãos sc 60 kg)
//                     | caixas contadas (abacate)
//   produtividade     = unidades ÷ área colhida (só plantios que já têm carga)
//   ciclo             = início da colheita − início do plantio (dias)
//   % da carga        = carga com dois plantios vira duas linhas, cada uma com o seu %

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pronto = () => !!(window.App && window.App.usuario);
export const carregando = () => !!(window.App && window.App.carregando);
export const todos = t => (window.App && window.App.dados[t]) || [];
export const ativos = t => todos(t).filter(x => x.ativo !== false);
export const gravar = (t, r) => window.gravar(t, r);
export const aviso = (texto, erro) => window.aviso && window.aviso(texto, erro);
export const souAdmin = () => !!(window.App && window.App.usuario && window.App.usuario.admin);
export const meuNome = () => (window.App && window.App.usuario && window.App.usuario.nome) || '';
export const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ---------------------------------------------------------------- seleção
   Cultura e safra escolhidas na faixa do topo da área valem para todas as
   telas. Ficam lembradas no aparelho (só conveniência). */
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* segue */ } } };
const sel = { cultura: LS.get('cp-cultura'), safra: {} };
export const culturas = () => ativos('cp_culturas').slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
export const cultura = id => todos('cp_culturas').find(c => c.id === id) || null;
export function culturaSel() {
  const l = culturas();
  return l.find(c => c.slug === sel.cultura) || l[0] || null;
}
export function escolherCultura(slug) {
  sel.cultura = slug; LS.set('cp-cultura', slug);
  window.dispatchEvent(new Event('colheita-selecao'));
}
export const safrasDe = cultId => ativos('cp_safras').filter(s => s.cultura_id === cultId)
  .sort((a, b) => (b.atual ? 1 : 0) - (a.atual ? 1 : 0) || String(b.inicio || b.nome).localeCompare(String(a.inicio || a.nome), 'pt-BR', { numeric: true }));
export const safra = id => todos('cp_safras').find(s => s.id === id) || null;
export function safraSel() {
  const c = culturaSel();
  if (!c) return null;
  const l = safrasDe(c.id);
  const lembrada = sel.safra[c.id] || LS.get('cp-safra-' + c.id);
  return l.find(s => s.id === lembrada) || l.find(s => s.atual) || l[0] || null;
}
export function escolherSafra(id) {
  const c = culturaSel(); if (!c) return;
  sel.safra[c.id] = id; LS.set('cp-safra-' + c.id, id);
  window.dispatchEvent(new Event('colheita-selecao'));
}

/* ---------------------------------------------------------------- perfil */
export const campos = c => (c && c.campos) || {};
export const param = (c, k, padrao = null) => { const v = c && c.parametros && c.parametros[k]; return v === undefined || v === null || v === '' ? padrao : v; };
export const classes = c => (c && Array.isArray(c.classes) ? c.classes : []);
export const unidadeRot = c => !c ? '' : c.unidade_nome + (c.unidade_kg ? ' ' + num(c.unidade_kg, 0) + ' kg' : '');
export const porPeso = c => !!campos(c).sacas_por_peso && Number(c.unidade_kg) > 0;
export const somaClasses = c => campos(c).quantidade_auto === 'soma_classes';
export const rotArea = c => (c && c.unidade_area) || 'plantio';
export const rotAreaPl = c => ({ plantio: 'plantios', quadra: 'quadras', 'talhão': 'talhões' }[rotArea(c)] || rotArea(c) + 's');
export const Maiusc = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* ---------------------------------------------------------------- plantios */
/* Ordem: plantio pelo número (Pl 21, Pl 22…), como nas planilhas; quadra e
   talhão por fazenda e depois pelo número (o café compara Faca × Lote 35). */
export const plantiosDa = (safraId) => {
  const l = todos('cp_plantios').filter(p => p.safra_id === safraId);
  const porFaz = l.length && rotArea(cultura(l[0].cultura_id)) !== 'plantio';
  const nome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true });
  const faz = (a, b) => String(a.fazenda || '').localeCompare(String(b.fazenda || ''), 'pt-BR');
  return l.sort((a, b) => porFaz ? (faz(a, b) || nome(a, b)) : (nome(a, b) || faz(a, b)));
};
export const plantio = id => todos('cp_plantios').find(p => p.id === id) || null;
export const FAZENDAS = ['Lote 35 PADAP', 'Fazenda Faca', 'Fazenda Morro Branco', 'Fazenda Três Riachos', 'Fazenda Quebra Cocão'];
export const nomeCurto = n => String(n || '').replace(/^Faz(enda)?\.?\s+/i, '').replace(/ PADAP$/i, '');
export const nomePlantio = p => !p ? '—' : (p.fazenda && /^Q\d|^Talh/i.test(p.nome) ? nomeCurto(p.fazenda) + ' · ' : '') + p.nome;

/* ---------------------------------------------------------------- cargas */
export const cargasDa = safraId => ativos('cp_cargas').filter(c => c.safra_id === safraId)
  .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.ticket_faz || '').localeCompare(String(a.ticket_faz || ''), 'pt-BR', { numeric: true }));
export const efetivo = c => (c.pct_carga === null || c.pct_carga === undefined || c.pct_carga === '' ? 100 : Number(c.pct_carga)) / 100;
const n0 = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? 0 : Number(v);
export const valorClasse = (c, chave) => n0(c.classes && c.classes[chave]);
export function kgDe(carga, cult) {
  if (carga.peso_liquido !== null && carga.peso_liquido !== undefined && carga.peso_liquido !== '') return n0(carga.peso_liquido) * efetivo(carga);
  if (cult && Number(cult.unidade_kg) > 0 && somaClasses(cult)) return unidadesDe(carga, cult) * Number(cult.unidade_kg);
  return 0;
}
export function unidadesDe(carga, cult) {
  if (somaClasses(cult)) return classes(cult).reduce((s, k) => s + valorClasse(carga, k.chave), 0) * efetivo(carga);
  if (porPeso(cult)) return n0(carga.peso_liquido) * efetivo(carga) / Number(cult.unidade_kg);
  return n0(carga.quantidade) * efetivo(carga);
}
export const brutoDe = c => n0(c.peso_entrada) * efetivo(c);

const dias = (a, b) => (a && b) ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : null;
export const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
export const dataCurta = d => d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) : '';

/** Soma um conjunto de cargas: unidades, kg, bruto, classes, umidade/impureza ponderadas. */
export function somar(lista, cult) {
  const r = { cargas: 0, un: 0, kg: 0, bruto: 0, qtd: 0, classes: {}, lavada: 0, suja: 0, umidKg: 0, impKg: 0, pesoUmid: 0, pesoImp: 0, ini: null, fim: null, pagos: 0, pendentes: 0 };
  for (const c of lista) {
    r.cargas++;
    const u = unidadesDe(c, cult), k = kgDe(c, cult), b = brutoDe(c);
    r.un += u; r.kg += k; r.bruto += b; r.qtd += n0(c.quantidade) * efetivo(c);
    for (const cl of classes(cult)) r.classes[cl.chave] = (r.classes[cl.chave] || 0) + valorClasse(c, cl.chave) * efetivo(c);
    const tipo = semAcento(c.tipo);
    if (tipo === 'LAVADA') r.lavada += u; else if (tipo === 'SUJA') r.suja += u;
    if (c.umidade_pct !== null && c.umidade_pct !== undefined && b) { r.umidKg += n0(c.umidade_pct) * b; r.pesoUmid += b; }
    if (c.impureza_pct !== null && c.impureza_pct !== undefined && b) { r.impKg += n0(c.impureza_pct) * b; r.pesoImp += b; }
    if (!r.ini || c.data < r.ini) r.ini = c.data;
    if (!r.fim || c.data > r.fim) r.fim = c.data;
    if (semAcento(c.situacao_pagto) === 'PAGO') r.pagos++; else if (c.situacao_pagto) r.pendentes++;
  }
  const totCl = Object.values(r.classes).reduce((s, v) => s + v, 0);
  r.totalClasses = totCl;
  r.pctClasse = ch => totCl > 0 ? (r.classes[ch] || 0) / totCl : null;
  r.umidade = r.pesoUmid ? r.umidKg / r.pesoUmid / 100 : null;
  r.impureza = r.pesoImp ? r.impKg / r.pesoImp / 100 : null;
  r.pctLavada = (r.lavada + r.suja) > 0 ? r.lavada / (r.lavada + r.suja) : null;
  r.rendimento = r.un > 0 && r.bruto > 0 ? r.bruto / r.un : null;   // café: kg de roça por saca
  return r;
}

/** Indicadores por plantio da safra (ordem: fazenda › nome). */
export function porPlantio(safraId, cult) {
  const cargas = cargasDa(safraId);
  return plantiosDa(safraId).filter(p => p.ativo !== false).map(p => {
    const s = somar(cargas.filter(c => c.plantio_id === p.id), cult);
    const area = n0(p.area);
    return { p, ...s, area, colhido: s.cargas > 0,
      unHa: area > 0 && s.cargas ? s.un / area : null,
      kgHa: area > 0 && s.cargas ? s.kg / area : null,
      ciclo: dias(p.inicio_plantio, s.ini), diasColheita: s.ini ? dias(s.ini, s.fim) + 1 : null };
  });
}

/** Resumo da safra: totais, área colhida, melhor e pior plantio. */
export function resumoSafra(safraId, cult) {
  const linhas = porPlantio(safraId, cult);
  const cargas = cargasDa(safraId);
  const tot = somar(cargas, cult);
  const areaTotal = linhas.reduce((s, l) => s + l.area, 0);
  const colhidos = linhas.filter(l => l.colhido);
  const areaColhida = colhidos.reduce((s, l) => s + l.area, 0);
  const comArea = colhidos.filter(l => l.unHa !== null && l.unHa > 0);
  const ord = comArea.slice().sort((a, b) => b.unHa - a.unHa);
  const ciclos = colhidos.map(l => l.ciclo).filter(x => x !== null && x > 0);
  const semPlantio = cargas.filter(c => !c.plantio_id || !plantio(c.plantio_id));
  return { linhas, tot, areaTotal, areaColhida, areaAColher: areaTotal - areaColhida,
    unHa: areaColhida > 0 ? colhidos.reduce((s, l) => s + l.un, 0) / areaColhida : null,
    kgHa: areaColhida > 0 ? colhidos.reduce((s, l) => s + l.kg, 0) / areaColhida : null,
    colhidos: colhidos.length, aColher: linhas.length - colhidos.length,
    melhor: ord[0] || null, pior: ord.length > 1 ? ord[ord.length - 1] : null,
    cicloMedio: ciclos.length ? ciclos.reduce((s, x) => s + x, 0) / ciclos.length : null,
    semPlantio };
}

/** Agrupa as linhas de plantio por fazenda. */
export function porFazenda(linhas, cult) {
  const m = new Map();
  for (const l of linhas) {
    const f = l.p.fazenda || '—';
    const g = m.get(f) || { fazenda: f, area: 0, areaColhida: 0, un: 0, kg: 0, cargas: 0 };
    g.area += l.area; g.un += l.un; g.kg += l.kg; g.cargas += l.cargas;
    if (l.colhido) g.areaColhida += l.area;
    m.set(f, g);
  }
  return [...m.values()].map(g => ({ ...g, unHa: g.areaColhida > 0 ? g.un / g.areaColhida : null }));
}

/** Produção por dia (para o gráfico de evolução). */
export function porDia(safraId, cult) {
  const m = new Map();
  for (const c of cargasDa(safraId)) m.set(c.data, (m.get(c.data) || 0) + unidadesDe(c, cult));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* ---------------------------------------------------------------- conciliação */
const soDig = v => String(v == null ? '' : v).replace(/\D/g, '').replace(/^0+/, '');
let indice = null, indiceChave = '';
function indices() {
  const bal = todos('cp_balanca'), coop = todos('cp_cooperativa');
  const chave = bal.length + ':' + coop.length + ':' + (bal[bal.length - 1] || {}).atualizado_em + ':' + (coop[coop.length - 1] || {}).atualizado_em;
  if (indice && indiceChave === chave) return indice;
  const balTk = new Map(), balRom = new Map(), coopTk = new Map(), comRel = new Set();
  for (const b of bal) { if (b.ativo === false) continue; comRel.add(b.cultura_id + '|' + b.safra_id); balTk.set(soDig(b.ticket), b); if (b.romaneio_prop) balRom.set(soDig(b.romaneio_prop), b); }
  for (const k of coop) { if (k.ativo === false) continue; coopTk.set(soDig(k.ticket), k); }
  indice = { balTk, balRom, coopTk, comRel }; indiceChave = chave;
  return indice;
}
const temRelatorio = (cultId, safraId) => { const I = indices(); return I.comRel.has(cultId + '|' + safraId); };
export const balancaDe = c => { const I = indices(); return I.balTk.get(soDig(c.ticket_balanca)) || (c.ticket_faz ? I.balRom.get(soDig(c.ticket_faz)) : null) || null; };
export const coopDe = (c, bal) => { const I = indices(); return I.coopTk.get(soDig((bal && bal.ticket) || c.ticket_balanca)) || null; };

/** Situação da carga na conferência: { st: 'ok'|'div'|'sem_bal'|'sem_coop'|'pago'|'pendente'|'livre', msgs, bal, coop } */
export function conferir(c, cult) {
  const modo = (cult && cult.conciliacao) || 'nenhuma';
  const msgs = [];
  if (modo === 'nenhuma') return { st: 'livre', msgs, bal: null, coop: null };
  if (modo === 'coop') {
    const pago = semAcento(c.situacao_pagto) === 'PAGO';
    if (!c.ticket_coop) msgs.push('sem ticket da cooperativa');
    return { st: pago ? 'pago' : 'pendente', msgs, bal: null, coop: null };
  }
  // Sem nenhum relatório importado para a cultura/safra ainda, não há o que
  // conferir: a carga fica neutra (antes aparecia "Sem balança" em todas).
  if (!temRelatorio(c.cultura_id, c.safra_id)) return { st: 'livre', msgs: ['nenhum relatório da balança importado nesta safra'], bal: null, coop: null };
  const bal = balancaDe(c);
  const coop = modo === 'balanca_coop' ? coopDe(c, bal) : null;
  if (!bal) return { st: 'sem_bal', msgs: ['não está no relatório da balança'], bal, coop };
  const tolD = Number(param(cult, 'tolerancia_data', 3));
  const tolP = Number(param(cult, 'tolerancia_peso_pct', 0.5)) / 100;
  const dd = dias(c.data, bal.data);
  if (dd !== null && Math.abs(dd) > tolD) msgs.push(`data da balança ${dataBR(bal.data)} (${dd > 0 ? '+' : ''}${dd} dias)`);
  if (c.placa && bal.placa && semAcento(c.placa).replace(/\W/g, '') !== semAcento(bal.placa).replace(/\W/g, '')) msgs.push(`placa ${bal.placa} na balança`);
  const pl = n0(c.peso_liquido), bl = n0(bal.peso_liquido);
  if (pl && bl && Math.abs(pl - bl) / bl > tolP) msgs.push(`peso líq. ${num(pl, 0)} × balança ${num(bl, 0)} kg`);
  if (param(cult, 'conferir_nf', false) && c.nf && bal.nf && soDig(c.nf) !== soDig(bal.nf)) msgs.push(`NF ${c.nf} × balança ${bal.nf}`);
  if (modo === 'balanca_coop') {
    if (!coop) return { st: msgs.length ? 'div' : 'sem_coop', msgs: msgs.length ? msgs : ['aguardando relatório da cooperativa'], bal, coop };
    if (param(cult, 'conferir_nf', false) && c.nf && coop.nf && soDig(c.nf) !== soDig(coop.nf)) msgs.push(`NF ${c.nf} × cooperativa ${coop.nf}`);
    const cb = n0(coop.entrada_bruta), bb = n0(bal.peso_bruto);
    if (cb && bb && Math.abs(cb - bb) / bb > tolP) msgs.push(`bruto coop. ${num(cb, 0)} × balança ${num(bb, 0)} kg`);
  }
  return { st: msgs.length ? 'div' : 'ok', msgs, bal, coop };
}
export const ROT_ST = {
  ok: ['OK', 'ok'], div: ['Divergente', 'perigo'], sem_bal: ['Sem balança', 'alerta'], sem_coop: ['Aguard. cooperativa', 'neutra'],
  pago: ['Pago', 'ok'], pendente: ['Pendente', 'alerta'], livre: ['—', 'neutra'],
};
export const seloSt = st => { const [t, cl] = ROT_ST[st] || ['—', 'neutra']; return `<span class="cb-pin ${cl}">${esc(t)}</span>`; };

/** Tickets da balança desta cultura/safra que não têm carga lançada. */
export function balancaSemCarga(safraId, cult) {
  const cargas = cargasDa(safraId);
  const usados = new Set();
  for (const c of cargas) { const b = balancaDe(c); if (b) usados.add(b.id); }
  return todos('cp_balanca').filter(b => b.ativo !== false && b.cultura_id === cult.id && (!safraId || b.safra_id === safraId) && !usados.has(b.id))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

/* ---------------------------------------------------------------- números no jeito brasileiro */
export function lerNumero(txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s/g, '').replace(/^R\$/, '').replace(/%$/, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
export const num = (n, casas = 2) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
  ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (n, casas = 1) => n === null || n === undefined || Number.isNaN(Number(n)) ? '' : (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
export const reais = n => n === null || n === undefined ? '' : 'R$ ' + num(n, 2);
/** Número com casas conforme o tamanho (sacas: 0; caixas/ha: 0; kg/ha: 0). */
export const inteiro = n => num(n, 0);
