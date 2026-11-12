// cert-croqui.js — Certificação › AN 22 Croqui da propriedade, no satélite (30/10/2026).
//
// Pedido do Guilherme: "vc consegue melhorar esse croqui? conseguimos colocar dentro do
// app?" → "estilo satélite"; "nesse kmz das pastas tem de todas as fazendas"; "parte de
// reserva, vamos fazer bem detalhado, ao apresentar ter tudo fácil".
//
// · Os desenhos vêm do KML/KMZ do Google Earth (17 - Croquis › Fazendas - Sakuma 2025.kml):
//   botão "Importar KML/KMZ" lê o arquivo no navegador e grava uma linha por fazenda em
//   cert_croquis (supabase/cert-croqui.sql). Importar de novo substitui os desenhos e mantém
//   os dados da reserva digitados no app.
// · Fundo de satélite: Esri World Imagery (Leaflet em vendor/leaflet, carregado só aqui).
// · Painel: resumo, legenda com liga/desliga por uso, Reserva legal detalhada (partes, %,
//   mínimo de 20% do Código Florestal, CAR, averbação, APP) e quadro de talhões.
// · Apresentar = tela cheia; Imprimir = A3 deitado com o painel ao lado.

import { estado } from './store.js';
import { pode } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const semAcento = s => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const ha = n => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha';
const pct = n => isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const hojeIso = () => new Date().toISOString().slice(0, 10);
const quem = () => estado.sessao?.user?.email || null;

/** Mínimo de reserva legal fora da Amazônia Legal (Lei 12.651/2012, art. 12, II). */
const RL_MIN = 20;
const m2 = n => n == null || isNaN(n) ? '—' : Math.round(n * 10000).toLocaleString('pt-BR') + ' m²';
const areaTxt = f => f.grupo === 'Construção' ? m2(f.ha) : ha(f.ha);

/** Usos (cor de preenchimento, cor da linha, nome na legenda). Cores pensadas para o satélite. */
const GRUPOS = [
  ['Abacate Margarida', '#B9DC6E', '#E6FF9E'],
  ['Abacate Hass', '#84BD00', '#C8FF3D'],
  ['Café', '#C98A4B', '#FFC48A'],
  ['Pivô', '#3FA9F5', '#9BD6FF'],
  ['Sequeiro', '#E8C547', '#FFE680'],
  ['Pasto', '#7FD1B9', '#B8F5E3'],
  ['Reserva', '#1E8C3A', '#6BFF8F'],
  ['Reserva legal (CAR)', '#0F6B2A', '#3DFF6E'],
  ['Vegetação nativa', '#2E7D32', '#A5D6A7'],
  ['APP', '#00897B', '#4DD0C4'],
  ['Servidão', '#8E24AA', '#E1BEE7'],
  ['Captação de água', '#00C2E0', '#7FF3FF'],
  ['Construção', '#FFE9A8', '#FFC400'],
  ['Outros', '#B0B0B0', '#FFFFFF'],
];
const COR = Object.fromEntries(GRUPOS.map(g => [g[0], { fill: g[1], line: g[2] }]));

let S = { lista: [], atual: null, mapa: null, camadas: {}, rotulos: true, ocultos: new Set(), sel: null, marcando: false, tempo: { ativo: false } };

/** Pontos marcados (sede, galpão…): ícone e tamanho no mapa. 03/11/2026 — "falta marcar … sede". */
const TIPO_MARCO = {
  Sede: { ico: '🏠', cls: 'sede', tam: 30 },
  'Galpão': { ico: '🏭', cls: 'galpao', tam: 26 },
  'Combustível': { ico: '⛽', cls: 'galpao', tam: 26 },
  'Refeitório': { ico: '🍽', cls: 'galpao', tam: 26 },
  Defensivos: { ico: '🧪', cls: 'galpao', tam: 26 },
  Lavador: { ico: '🚿', cls: 'galpao', tam: 26 },
  Casa: { ico: '🏡', cls: 'galpao', tam: 26 },
  Bebedouro: { ico: '💧', cls: 'beb', tam: 16 },
  Ponto: { ico: '📍', cls: 'ponto', tam: 24 },
};
const tipoDoNome = n => { const u = semAcento(n); return /^SEDE/.test(u) ? 'Sede' : /DIESEL|COMBUST|LUBRIF|TANQUE/.test(u) ? 'Combustível' : /REFEITORIO|COZINHA/.test(u) ? 'Refeitório' : /DEFENSIV|AGROTOX|CALDA/.test(u) ? 'Defensivos' : /LAVADOR|LAVAGEM/.test(u) ? 'Lavador' : /^CASA|MORADOR|CASEIRO/.test(u) ? 'Casa' : /GALPAO|BARRACAO|ARMAZEM|OFICINA|DEPOSITO/.test(u) ? 'Galpão' : /BEBEDOURO/.test(u) ? 'Bebedouro' : 'Ponto'; };

/* ---------- Leaflet sob demanda ---------- */
let leafletPronto = null;
function carregarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPronto) return leafletPronto;
  leafletPronto = new Promise((ok, erro) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script'); js.src = 'vendor/leaflet/leaflet.js';
    js.onload = () => ok(window.L); js.onerror = () => { leafletPronto = null; erro(new Error('Não carregou o mapa (sem internet?)')); };
    document.head.appendChild(js);
  });
  return leafletPronto;
}

/* ---------- geometria ---------- */
const R = 6371008.8;
function areaHa(c) {
  if (!c || c.length < 3) return 0;
  const lat0 = c.reduce((s, p) => s + p[1], 0) / c.length;
  const k = Math.cos(lat0 * Math.PI / 180);
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const [x1, y1] = c[i], [x2, y2] = c[(i + 1) % c.length];
    a += (x1 * k) * y2 - (x2 * k) * y1;
  }
  return Math.abs(a) / 2 * (Math.PI / 180) ** 2 * R * R / 1e4;
}
function dentro([x, y], poly) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/* ---------- importação KML / KMZ ---------- */
/** ZIP mínimo (diretório central + DecompressionStream): [{nome, dados:Uint8Array}] */
async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('Arquivo compactado inválido');
  const n = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + ln));
    if (!nome.endsWith('/')) {
      const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      const bruto = buf.subarray(ini, ini + tam);
      const dados = metodo === 0 ? bruto
        : new Uint8Array(await new Response(new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      out.push({ nome, dados });
    }
    p += 46 + ln + le + lc;
  }
  return out;
}
async function lerKmz(file) {
  const ents = await unzip(new Uint8Array(await file.arrayBuffer()));
  const k = ents.find(e => /\.kml$/i.test(e.nome));
  if (!k) throw new Error('Não achei o .kml dentro do KMZ');
  return new TextDecoder().decode(k.dados);
}
/** Shapefile de polígonos (.shp) → [[anel externo, ...furos], …] em [lon,lat]. */
function lerShp(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const pols = []; let p = 100;
  while (p + 8 <= b.length) {
    const tam = dv.getInt32(p + 4, false) * 2; const r = p + 8; p = r + tam;
    const tipo = dv.getInt32(r, true);
    if (![5, 15, 25].includes(tipo)) continue;
    const np = dv.getInt32(r + 36, true), nt = dv.getInt32(r + 40, true);
    const ini = []; for (let k = 0; k < np; k++) ini.push(dv.getInt32(r + 44 + k * 4, true));
    const base = r + 44 + np * 4; let atual = null;
    for (let k = 0; k < np; k++) {
      const a = [], de = ini[k], ate = k + 1 < np ? ini[k + 1] : nt;
      for (let q = de; q < ate; q++) a.push([dv.getFloat64(base + q * 16, true), dv.getFloat64(base + q * 16 + 8, true)]);
      let s2 = 0; for (let q = 0; q < a.length - 1; q++) s2 += a[q][0] * a[q + 1][1] - a[q + 1][0] * a[q][1];
      if (s2 <= 0 || !atual) { atual = [a]; pols.push(atual); } else atual.push(a);   // horário = externo
    }
  }
  return pols;
}
const CAMADA_CAR = [
  [/AREA_?IMOVEL|IMOVEL/, 'limite'],
  [/RESERVA_?LEGAL|^RL/, 'Reserva legal (CAR)'],
  [/VEGETACAO_?NATIVA|REMANESCENTE/, 'Vegetação nativa'],
  [/APP|PRESERVACAO_?PERMANENTE/, 'APP'],
  [/SERVIDAO/, 'Servidão'],
];
async function lerCarZip(buf) {
  const pilha = [{ ents: await unzip(buf) }]; const camadas = {};
  while (pilha.length) {
    for (const e of pilha.pop().ents) {
      if (/\.zip$/i.test(e.nome)) { pilha.push({ ents: await unzip(e.dados) }); continue; }
      if (!/\.shp$/i.test(e.nome)) continue;
      const nm = semAcento(e.nome.split('/').pop().replace(/\.shp$/i, ''));
      const m = CAMADA_CAR.find(([re]) => re.test(nm)); if (!m) continue;
      (camadas[m[1]] ||= []).push(...lerShp(e.dados));
    }
  }
  return camadas;
}
const areaPol = pol => Math.max(0, areaHa(pol[0]) - pol.slice(1).reduce((s, h) => s + areaHa(h), 0));

function grupoDe(txt) {
  const t = semAcento(txt);
  if (/MARGARIDA/.test(t)) return 'Abacate Margarida';
  if (/HASS|AVOCADO/.test(t)) return 'Abacate Hass';
  if (/CAFE/.test(t)) return 'Café';
  if (/RESERVA|MATA|APP\b/.test(t)) return 'Reserva';
  if (/CAPTACAO|BOMBA|PISCINAO|REPRESA|AGUA/.test(t)) return 'Captação de água';
  if (/PASTO/.test(t)) return 'Pasto';
  if (/SEQUEIRO/.test(t)) return 'Sequeiro';
  if (/PIVO/.test(t)) return 'Pivô';
  if (/ABACATE/.test(t)) return 'Abacate Margarida';
  return 'Outros';
}
function rotuloDe(nome, g) {
  const u = semAcento(nome); let m;
  if ((g === 'Abacate Margarida' || g === 'Abacate Hass') && (m = u.match(/T(?:ALHAO)?\s*-?\s*(\d+)([AB]?)/))) return `T-${m[1].padStart(2, '0')}${m[2]}`;
  if (g === 'Café' && (m = u.match(/QUADRA\s*0?(\d+)/))) return `Q-${m[1].padStart(2, '0')}`;
  if (g === 'Pivô' && (m = u.match(/PIVO?T?\s*0?(\d+)/))) return `Pivô ${m[1]}`;
  if (g === 'Pasto' && (m = u.match(/PASTO\s*-?\s*0?(\d+)/))) return `Pasto ${m[1].padStart(2, '0')}`;
  if (g === 'Reserva') return so(nome).replace(/reserva parte/i, 'Reserva');
  const n = so(nome);
  return n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n;
}
const chaveFaz = s => {
  const t = semAcento(s);
  if (/FACA/.test(t)) return 'FACA';
  if (/QUEBRA/.test(t)) return 'QUEBRA';
  if (/RIACHO/.test(t)) return 'RIACHOS';
  if (/LOTE\s*35|PADAP/.test(t)) return 'LOTE35';
  if (/MORRO/.test(t)) return 'MORRO';
  return null;
};

/** KML → [{fazenda_id, fazenda, limite, area_total, feicoes}] */
function kmlParaCroquis(xml, fazendas) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Arquivo KML inválido');
  const porChave = {};
  for (const f of fazendas) { const k = chaveFaz(f.nome); if (k) porChave[k] = f; }
  const marcas = [...doc.getElementsByTagName('Placemark')];
  const grupos = {}; // chave → {pols:[], pts:[]}
  for (const pm of marcas) {
    const cam = [];
    for (let el = pm.parentElement; el; el = el.parentElement) {
      if (el.tagName === 'Folder' || el.tagName === 'Document') {
        const nm = [...el.children].find(c => c.tagName === 'name'); if (nm) cam.unshift(so(nm.textContent));
      }
    }
    const nomeEl = [...pm.children].find(c => c.tagName === 'name');
    const nome = nomeEl ? so(nomeEl.textContent) : '';
    let k = null; for (const c of cam) { k = chaveFaz(c); if (k) break; }
    if (!k) k = chaveFaz(nome);
    if (!k || !porChave[k]) continue;
    const g = grupos[k] ||= { pols: [], pts: [] };
    const coords = el => so(el.textContent).split(/\s+/).filter(Boolean).map(t => t.split(',').slice(0, 2).map(Number));
    for (const pol of pm.getElementsByTagName('Polygon')) {
      const ob = pol.getElementsByTagName('outerBoundaryIs')[0]; const ce = ob && ob.getElementsByTagName('coordinates')[0];
      if (ce) g.pols.push({ nome, cam, c: coords(ce) });
    }
    for (const pt of pm.getElementsByTagName('Point')) {
      const ce = pt.getElementsByTagName('coordinates')[0]; if (ce && nome) g.pts.push({ nome, c: coords(ce)[0] });
    }
  }
  const out = [];
  for (const [k, g] of Object.entries(grupos)) {
    const faz = porChave[k];
    const ehLimite = p => /^AREA\b/.test(semAcento(p.nome)) || (chaveFaz(p.nome) === k && !/PIVO|SEQUEIRO|TALHAO|QUADRA|RESERVA|PASTO/.test(semAcento(p.nome)));
    let limite = g.pols.find(ehLimite) || null;
    const feicoes = [];
    for (const p of g.pols) {
      if (p === limite) continue;
      let nome = p.nome;
      if (!nome) { const pt = g.pts.find(x => dentro(x.c, p.c)); nome = pt ? pt.nome : ''; }
      const grupo = grupoDe([...p.cam.slice(1), nome].join(' '));
      const r = (v) => Math.round(v * 1e6) / 1e6;
      feicoes.push({ nome, rot: nome ? rotuloDe(nome, grupo) : grupo, grupo, ha: Math.round(areaHa(p.c) * 100) / 100, c: p.c.map(([x, y]) => [r(x), r(y)]) });
    }
    // pontos soltos do KML que viram marcos no mapa (sede, bebedouros)
    const r6 = v => Math.round(v * 1e6) / 1e6;
    const marcos = g.pts.map(p => {
      const u = semAcento(p.nome);
      const tipo = /^SEDE/.test(u) ? 'Sede' : /^BEBEDOURO/.test(u) ? 'Bebedouro' : null;
      return tipo && { nome: tipo === 'Sede' ? 'Sede' : p.nome, tipo, lon: r6(p.c[0]), lat: r6(p.c[1]), fonte: 'KML' };
    }).filter(Boolean);
    out.push({ fazenda_id: faz.id, fazenda: faz.nome, limite: limite ? limite.c : null,
      area_total: limite ? Math.round(areaHa(limite.c) * 100) / 100 : null, feicoes, marcos });
  }
  return out;
}

/* ---------- dados ---------- */
async function carregar() {
  const c = estado.cliente;
  const [cq, fz] = await Promise.all([
    c.from('cert_croquis').select('*'),
    c.from('jor_fazendas').select('id,nome').order('nome'),
  ]);
  if (cq.error) throw cq.error;
  S.fazendas = fz.data || [];
  const ordem = ['FACA', 'LOTE35', 'MORRO', 'RIACHOS', 'QUEBRA'];
  S.lista = (cq.data || []).sort((a, b) => ordem.indexOf(chaveFaz(a.fazenda)) - ordem.indexOf(chaveFaz(b.fazenda)));
}

function totais(cq) {
  const t = {}; for (const f of cq.feicoes || []) t[f.grupo] = (t[f.grupo] || 0) + (f.ha || 0);
  const desenhada = (cq.feicoes || []).reduce((s, f) => s + (f.ha || 0), 0);
  const total = cq.area_total || desenhada;
  const plantio = ['Abacate Margarida', 'Abacate Hass', 'Café', 'Pivô', 'Sequeiro'].reduce((s, g) => s + (t[g] || 0), 0);
  return { t, total, plantio, irrigada: t['Pivô'] || 0, reserva: t['Reserva'] || 0, temLimite: !!cq.area_total };
}

/* ---------- tela ---------- */
function montarOverlay() {
  let ov = $('crqOverlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'crqOverlay'; ov.className = 'crq';
  ov.innerHTML = `
    <header class="crq-topo">
      <div class="crq-tit"><b>Croqui das propriedades</b><span>AN 22 · satélite</span></div>
      <nav class="crq-faz" id="crqFaz"></nav>
      <div class="crq-acoes">
        <label class="crq-chk"><input type="checkbox" id="crqRot" checked> Nomes</label>
        <button class="btn" type="button" id="crqSede" hidden title="Aproxima na sede e lista as construções">🏠 Mapa da sede</button>
        <button class="btn" type="button" id="crqContornar" hidden title="Clique nos cantos da construção e depois em Concluir">✏ Contornar</button>
        <button class="btn" type="button" id="crqMarcar" hidden title="Clique no mapa para marcar sede, galpão, piscinão…">📍 Marcar ponto</button>
        <button class="btn" type="button" id="crqTempoBtn" title="Imagens de satélite de 2014 até hoje sobre a reserva legal">🕒 Linha do tempo</button>
        <button class="btn" type="button" id="crqApresentar">⛶ Apresentar</button>
        <button class="btn" type="button" id="crqImprimir">Imprimir</button>
        <label class="btn" id="crqImpLbl" hidden title="KML/KMZ do Google Earth (todas as fazendas) ou .zip do shapefile do CAR (fazenda aberta)">Importar<input type="file" id="crqImp" accept=".kml,.kmz,.zip" hidden></label>
        <button class="btn" type="button" id="crqFechar">Fechar</button>
      </div>
    </header>
    <div class="crq-corpo">
      <div class="crq-mapa" id="crqMapa"></div>
      <aside class="crq-painel" id="crqPainel"></aside>
    </div>
    <div class="crq-msg" id="crqMsg" hidden></div>`;
  document.body.appendChild(ov);
  $('crqFechar').addEventListener('click', fechar);
  $('crqRot').addEventListener('change', e => { S.rotulos = e.target.checked; desenhar(false); });
  $('crqApresentar').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.(); else ov.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => setTimeout(() => S.mapa?.invalidateSize(), 200));
  $('crqImprimir').addEventListener('click', imprimir);
  $('crqTempoBtn').addEventListener('click', () => linhaDoTempo(!S.tempo.ativo));
  $('crqMarcar').addEventListener('click', () => { modoContornar(false); modoMarcar(!S.marcando); });
  $('crqContornar').addEventListener('click', () => { if (S.desenho) concluirContorno(); else { modoMarcar(false); modoContornar(true); } });
  $('crqSede').addEventListener('click', () => { S.modoSede = !S.modoSede; $('crqSede').classList.toggle('principal', S.modoSede); painel(); if (S.modoSede) irParaSede(); else desenhar(true); });
  $('crqImp').addEventListener('change', importar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (S.marcando || S.desenho)) { modoMarcar(false); modoContornar(false); msg(''); return; } if (e.key === 'Escape' && !document.fullscreenElement && $('crqOverlay') && !$('crqOverlay').hidden) fechar(); });
  return ov;
}

function msg(t, erro) {
  const m = $('crqMsg'); if (!m) return;
  m.hidden = !t; m.textContent = t || ''; m.classList.toggle('erro', !!erro);
  if (t && !erro) setTimeout(() => { if (m.textContent === t) m.hidden = true; }, 4000);
}

export async function abrirCroqui(fazendaId) {
  const ov = montarOverlay(); ov.hidden = false; document.body.classList.add('crq-aberto');
  $('crqImpLbl').hidden = !pode('cert');
  $('crqMarcar').hidden = !pode('cert');
  $('crqContornar').hidden = !pode('cert');
  $('crqSede').hidden = false;
  $('crqPainel').innerHTML = '<p class="dica">Carregando…</p>';
  try {
    const [L] = await Promise.all([carregarLeaflet(), carregar()]);
    if (!S.mapa) {
      S.mapa = L.map('crqMapa', { maxZoom: 21, zoomControl: true, attributionControl: true, preferCanvas: false });
      S.base = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 21, maxNativeZoom: 18, attribution: 'Imagem © Esri, Maxar, Earthstar Geographics', crossOrigin: true,
      }).addTo(S.mapa);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(S.mapa);
      S.mapa.on('zoomend', zoomRotulos);
      S.mapa.on('click', e => { if (S.marcando) marcarAqui(e.latlng); else if (S.desenho) pontoContorno(e.latlng); });
    }
    if (!S.lista.length) {
      $('crqFaz').innerHTML = '';
      $('crqPainel').innerHTML = `<h3 class="crq-h">Nenhum croqui ainda</h3>
        <p class="dica">Clique em <b>Importar KML/KMZ</b> e escolha o arquivo do Google Earth com as fazendas
        (OneDrive › 1 - ADM - PRINCIPAL › 17 - Croquis › <b>Fazendas - Sakuma 2025.kml</b>).</p>`;
      S.mapa.setView([-19.4, -46.0], 10);
      return;
    }
    S.atual = S.lista.find(c => c.fazenda_id === fazendaId) || S.atual && S.lista.find(c => c.fazenda_id === S.atual.fazenda_id) || S.lista[0];
    abas(); desenhar(true); painel();
    setTimeout(() => S.mapa.invalidateSize(), 100);
  } catch (e) {
    $('crqPainel').innerHTML = `<p class="dica">${/cert_croquis|relation|does not exist/i.test(e.message || '') ? 'O croqui ainda não foi ativado no banco.' : esc(e.message || e)}</p>`;
  }
}

function fechar() {
  modoMarcar(false); modoContornar(false);
  if (document.fullscreenElement) document.exitFullscreen?.();
  if (S.tempo.ativo) linhaDoTempo(false);
  const ov = $('crqOverlay'); if (ov) ov.hidden = true;
  document.body.classList.remove('crq-aberto');
}

function abas() {
  $('crqFaz').innerHTML = S.lista.map(c => `<button type="button" class="${c === S.atual ? 'on' : ''}" data-faz="${c.fazenda_id}">${esc(c.fazenda)}</button>`).join('');
  $('crqFaz').querySelectorAll('[data-faz]').forEach(b => b.addEventListener('click', () => {
    S.atual = S.lista.find(c => c.fazenda_id === b.dataset.faz); S.sel = null; S.modoSede = false; $('crqSede').classList.remove('principal'); modoMarcar(false); modoContornar(false); abas(); desenhar(true); painel(); if (S.tempo.ativo) carregarTempo();
  }));
}

function desenhar(enquadrar) {
  const L = window.L, cq = S.atual; if (!L || !cq) return;
  for (const l of Object.values(S.camadas)) l.remove();
  S.camadas = {};
  const todas = [];
  if (cq.limite) {
    const lim = L.polygon(aneis(cq).map(a => a.map(([x, y]) => [y, x])), { color: '#FFFFFF', weight: 2.5, dashArray: '8 6', fill: false, interactive: false }).addTo(S.mapa);
    S.camadas.limite = lim; todas.push(lim);
  }
  const ordem = ['Vegetação nativa', 'Pivô', 'Pasto', 'Sequeiro', 'Reserva', 'Reserva legal (CAR)', 'APP', 'Servidão', 'Café', 'Abacate Margarida', 'Abacate Hass', 'Captação de água', 'Construção', 'Outros'];
  const feics = (cq.feicoes || []).map((f, i) => ({ ...f, i })).sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo));
  for (const f of feics) {
    if (S.ocultos.has(f.grupo)) continue;
    if (S.tempo.ativo && S.tempo.soRl && !AMBIENTAIS.includes(f.grupo)) continue;   // linha do tempo: só reserva e áreas ambientais
    const cor = COR[f.grupo] || COR.Outros;
    const sel = S.sel === f.i;
    const pol = L.polygon([f.c, ...(f.h || [])].map(a => a.map(([x, y]) => [y, x])), {
      color: sel ? '#FFFFFF' : cor.line, weight: sel ? 4 : f.grupo === 'Construção' ? 2.5 : 2, fillColor: cor.fill, fillOpacity: f.grupo === 'Pivô' ? 0.28 : f.grupo === 'Vegetação nativa' ? 0.25 : 0.45, dashArray: f.fonte === 'CAR' ? '5 4' : null,
    }).addTo(S.mapa);
    const ehConst = f.grupo === 'Construção';
    pol.bindPopup(`<b>${esc(f.rot || f.nome)}</b><br>${esc(f.grupo)}${f.fonte === 'CAR' ? ' · do CAR' : ''}<br>${areaTxt(f)}${f.nome && f.nome !== f.rot ? `<br><span style="color:#777">${esc(f.nome)}</span>` : ''}${ehConst && pode('cert') ? `<br><button type="button" class="btn mini" data-c-ren style="margin-top:6px">Renomear</button> <button type="button" class="btn mini" data-c-del style="margin-top:6px">Apagar contorno</button>` : ''}`);
    if (ehConst) pol.on('popupopen', ev => {
      const el = ev.popup.getElement();
      el?.querySelector('[data-c-ren]')?.addEventListener('click', () => renomearConstrucao(f.i));
      el?.querySelector('[data-c-del]')?.addEventListener('click', () => apagarConstrucao(f.i));
    });
    pol.on('click', e => {
      if (S.marcando) { S.mapa.closePopup(); marcarAqui(e.latlng); return; }   // marcar ponto em cima de talhão/pivô
      if (S.desenho) { S.mapa.closePopup(); pontoContorno(e.latlng); return; }
      S.sel = f.i; marcarLinha();
    });
    // construção que já tem ponto com o mesmo nome: o nome fica no ponto (não repete)
    const temMarco = ehConst && (cq.marcos || []).some(m => so(m.nome) === so(f.nome));
    if (S.rotulos && !temMarco) pol.bindTooltip(ehConst ? esc(f.rot || '') : `${esc(f.rot || '')}<br><small>${ha(f.ha)}</small>`, { permanent: true, direction: 'center', className: 'crq-rot crq-rot-' + (ehConst ? 'c' : f.ha < 2 && !/piscin/i.test(f.rot || '') ? 'p' : 'g') });
    S.camadas['f' + f.i] = pol; todas.push(pol);
  }
  const soRl = S.tempo.ativo && S.tempo.soRl;
  if (!soRl && !S.ocultos.has('__pontos')) (cq.pontos || []).forEach((p, k) => {
    if (!isFinite(p.lat) || !isFinite(p.lon)) return;
    const venc = p.venc && p.venc < hojeIso();
    const m = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#FFFFFF', weight: 2.5, fillColor: venc ? '#E53935' : '#0077FF', fillOpacity: 1 }).addTo(S.mapa);
    todas.push(m);
    m.bindPopup(`<b>💧 ${esc(p.nome)}</b>${p.tipo ? '<br>' + esc(p.tipo) : ''}${p.outorga ? '<br>Outorga: ' + esc(p.outorga) : ''}${p.vazao ? '<br>Vazão: ' + esc(p.vazao) : ''}${p.finalidade ? '<br>Finalidade: ' + esc(p.finalidade) : ''}${p.validade ? '<br>Validade: ' + esc(p.validade) + (venc ? ' <b style="color:#C62828">(vencida)</b>' : '') : ''}${p.curso ? '<br>' + esc(p.curso) : ''}<br><span style="color:#777">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>`);
    if (S.rotulos) m.bindTooltip('💧 ' + esc(p.nome), { permanent: true, direction: 'right', offset: [8, 0], className: 'crq-rot crq-rot-agua' });
    S.camadas['p' + k] = m;
  });
  if (!soRl && !S.ocultos.has('__marcos')) (cq.marcos || []).forEach((p, k) => {
    if (!isFinite(p.lat) || !isFinite(p.lon)) return;
    const t = TIPO_MARCO[p.tipo] || TIPO_MARCO.Ponto;
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'crq-marco crq-marco-' + t.cls, html: t.ico, iconSize: [t.tam, t.tam], iconAnchor: [t.tam / 2, t.tam / 2] }) }).addTo(S.mapa);
    todas.push(m);
    m.bindPopup(`<b>${t.ico} ${esc(p.nome)}</b>${p.tipo && p.tipo !== p.nome ? '<br>' + esc(p.tipo) : ''}${p.obs ? '<br>' + esc(p.obs) : ''}<br><span style="color:#777">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>${pode('cert') ? `<br><button type="button" class="btn mini" data-marco-del="${k}" style="margin-top:6px">Remover ponto</button>` : ''}`);
    m.on('popupopen', ev => ev.popup.getElement()?.querySelector('[data-marco-del]')?.addEventListener('click', () => removerMarco(k)));
    if (S.rotulos && p.tipo !== 'Bebedouro') m.bindTooltip(esc(p.nome), { permanent: true, direction: 'right', offset: [t.tam / 2, 0], className: 'crq-rot crq-rot-marco' });
    S.camadas['m' + k] = m;
  });
  if (enquadrar && todas.length) S.mapa.fitBounds((S.camadas.limite || L.featureGroup(todas)).getBounds(), { padding: [20, 20], maxZoom: 16 });
  zoomRotulos();
}

function painelBase() {
  if (S.modoSede) return painelSede();
  const cq = S.atual; const T = totais(cq); const rv = cq.reserva || {};
  const num = k => { const v = Number(String(rv[k] ?? '').replace(',', '.')); return isFinite(v) && rv[k] !== '' && rv[k] != null ? v : null; };
  const areaCar = num('car_area_ha');
  const base = areaCar || T.total;                               // área do imóvel usada nos 20%
  const minHa = base * RL_MIN / 100;
  const rlCar = num('rl_car_ha');
  const todas = (cq.feicoes || []).map((f, i) => ({ ...f, i, fora: foraDoLimite(cq, f) }));
  const rlPolCar = todas.filter(f => f.grupo === 'Reserva legal (CAR)');
  const rlPolCro = todas.filter(f => f.grupo === 'Reserva');
  const partes = rlPolCar.length ? rlPolCar : rlPolCro;
  const somaPartes = partes.reduce((s, p) => s + (p.ha || 0), 0);
  const rlConta = rlCar ?? (somaPartes || null);                 // vale o declarado no CAR
  const atende = rlConta != null && rlConta >= minHa - 0.005;
  const nFora = partes.filter(p => p.fora);
  const usados = GRUPOS.filter(g => T.t[g[0]]);
  const talhoes = todas.filter(f => !['Reserva', 'Reserva legal (CAR)', 'Vegetação nativa', 'APP', 'Servidão', 'Construção'].includes(f.grupo))
    .sort((a, b) => GRUPOS.findIndex(g => g[0] === a.grupo) - GRUPOS.findIndex(g => g[0] === b.grupo) || so(a.rot).localeCompare(so(b.rot), 'pt-BR', { numeric: true }));
  const ambientais = todas.filter(f => ['Vegetação nativa', 'APP', 'Servidão'].includes(f.grupo));
  const edita = pode('cert');
  const linhaCar = (r, v) => v == null || v === '' ? '' : `<tr><td>${r}</td><td>${v}</td></tr>`;
  const pctBase = v => base ? pct(v / base * 100) : '—';
  $('crqPainel').innerHTML = `
    <h3 class="crq-h">${esc(cq.fazenda)}</h3>
    <div class="crq-kpis">
      <div><span>Área do imóvel${areaCar ? ' (CAR)' : ''}</span><b>${ha(base || null)}</b>${areaCar && T.temLimite && Math.abs(areaCar - T.total) > 1 ? `<small>desenhado: ${ha(T.total)}</small>` : !T.temLimite && !areaCar ? '<small>soma do desenhado (sem limite)</small>' : ''}</div>
      <div><span>Plantio</span><b>${ha(T.plantio)}</b></div>
      <div><span>Irrigada (pivôs)</span><b>${ha(T.irrigada)}</b></div>
      <div><span>Reserva legal</span><b>${ha(rlConta)}</b>${rlConta != null && base ? `<small>${pctBase(rlConta)} · mínimo ${RL_MIN}%</small>` : ''}</div>
    </div>

    <h4 class="crq-sub">Legenda</h4>
    <div class="crq-leg">${usados.map(g => `<label class="${S.ocultos.has(g[0]) ? 'off' : ''}">
        <input type="checkbox" data-grp="${esc(g[0])}" ${S.ocultos.has(g[0]) ? '' : 'checked'}>
        <i style="background:${g[1]};border-color:${g[2]}"></i><span>${esc(g[0])}</span><b>${g[0] === 'Construção' ? m2(T.t[g[0]]) : ha(T.t[g[0]])}</b></label>`).join('')}
      ${cq.limite ? '<div class="crq-leg-lim"><i></i><span>Limite da fazenda</span></div>' : ''}
      ${(cq.marcos || []).length ? `<label><input type="checkbox" data-grp="__marcos" ${S.ocultos.has('__marcos') ? '' : 'checked'}><i class="crq-marco-leg">🏠</i><span>Sede e pontos marcados</span><b>${cq.marcos.length}</b></label>` : ''}
      ${(cq.pontos || []).length ? `<label><input type="checkbox" data-grp="__pontos" ${S.ocultos.has('__pontos') ? '' : 'checked'}><i class="crq-ponto-ico"></i><span>Captações outorgadas</span><b>${cq.pontos.length}</b></label>` : ''}</div>

    <section class="crq-rl ${rlConta == null ? 'sem' : atende ? 'ok' : 'falta'}">
      <h4 class="crq-sub">Reserva legal</h4>
      ${rlConta != null ? `<div class="crq-rl-sit">${atende ? `✔ Atende o mínimo de ${RL_MIN}%` : `⚠ Abaixo de ${RL_MIN}%: faltam ${ha(minHa - rlConta)}`}</div>` : ''}
      <table class="crq-tab"><tbody>
        <tr><td>Área do imóvel${areaCar ? ' (CAR)' : ' (desenho)'}</td><td>${ha(base || null)}</td></tr>
        <tr><td>Mínimo exigido (${RL_MIN}%)</td><td>${ha(minHa || null)}</td></tr>
        ${rlCar != null ? `<tr class="tot"><td>Declarada no CAR</td><td>${ha(rlCar)} · ${pctBase(rlCar)}</td></tr>` : ''}
        ${partes.length ? `<tr><td>Desenhada no mapa${rlPolCar.length ? ' (CAR)' : ''}</td><td>${ha(somaPartes)} · ${pctBase(somaPartes)}</td></tr>` : ''}
        ${rlConta != null ? `<tr class="${atende ? 'sobra' : 'deficit'}"><td>${atende ? 'Excedente' : 'Déficit'}</td><td>${ha(Math.abs(rlConta - minHa))}</td></tr>` : ''}
      </tbody></table>
      ${partes.length ? `<table class="crq-tab" style="margin-top:8px"><thead><tr><th>Parte desenhada</th><th>Área</th><th>% imóvel</th></tr></thead><tbody>
          ${partes.map(p => `<tr data-ir="${p.i}"><td>${esc(p.rot)}${p.fora ? ' <span class="crq-fora">fora do limite desenhado</span>' : ''}</td><td>${ha(p.ha)}</td><td>${pctBase(p.ha)}</td></tr>`).join('')}
        </tbody></table>` : `<p class="crq-alerta">O desenho da reserva desta fazenda ainda não está no mapa. Para trazer o desenho oficial: no site do CAR (consultapublica.car.gov.br), busque o nº do CAR, baixe o <b>shapefile</b> do imóvel (.zip) e clique em <b>Importar</b> com esta fazenda aberta.</p>`}
      ${nFora.length ? `<p class="crq-alerta">⚠ ${nFora.map(p => esc(p.rot) + ' · ' + ha(p.ha)).join(', ')} está fora do limite desenhado. ${rv.imovel_car && /QUILOMBO/i.test(rv.imovel_car) ? 'O CAR desta fazenda é “' + esc(rv.imovel_car) + '”, com uma parte separada a leste: confira se é a área do Quilombo.' : 'Confira se é outra área do mesmo imóvel ou compensação.'}</p>` : ''}
      ${new Set(partes.map(p => p.rot)).size < partes.length ? '<p class="crq-alerta">⚠ Há partes com o mesmo nome (ex.: duas “Reserva 4”). Vale renomear no Google Earth.</p>' : ''}
      ${rlCar != null && !atende && Number(rv.mf) > 4 ? `<p class="crq-alerta">A reserva declarada é menor que ${RL_MIN}% e o imóvel tem ${esc(String(rv.mf).replace('.', ','))} módulos fiscais (acima de 4). Vale confirmar com o responsável técnico se há compensação ou adesão ao PRA.</p>` : ''}
    </section>

    <section class="crq-car">
      <h4 class="crq-sub">Dados do CAR</h4>
      ${rv.car ? `<table class="crq-tab crq-car-tab"><tbody>
        ${linhaCar('Nº do CAR', `<span class="crq-mono">${esc(rv.car)}</span>`)}
        ${linhaCar('Imóvel no CAR', esc(rv.imovel_car || ''))}
        ${linhaCar('Município', esc(rv.municipio || ''))}
        ${linhaCar('Cadastrado em', esc(rv.data_cadastro || ''))}
        ${linhaCar('Módulos fiscais', rv.mf ? esc(String(rv.mf).replace('.', ',')) : '')}
        ${linhaCar('Área total', areaCar != null ? ha(areaCar) : '')}
        ${linhaCar('Área consolidada (uso)', num('consolidada_ha') != null ? `${ha(num('consolidada_ha'))} · ${pctBase(num('consolidada_ha'))}` : '')}
        ${linhaCar('Remanescente de vegetação nativa', num('remanescente_ha') != null ? `${ha(num('remanescente_ha'))} · ${pctBase(num('remanescente_ha'))}` : '')}
        ${linhaCar('APP', num('app_ha') != null ? `${ha(num('app_ha'))} · ${pctBase(num('app_ha'))}` : '')}
        ${linhaCar('Servidão administrativa', num('servidao_ha') ? ha(num('servidao_ha')) : '')}
        ${linhaCar('Matrículas', esc(rv.averbacao || ''))}
        ${linhaCar('Situação', esc(rv.situacao || ''))}
      </tbody></table>
      ${rv.fonte_car ? `<p class="crq-nota">Fonte: ${esc(rv.fonte_car)}</p>` : ''}` : '<p class="crq-alerta">Sem recibo do CAR desta fazenda na pasta AN 08.</p>'}
      ${rv.obs ? `<p class="crq-nota">${esc(rv.obs)}</p>` : ''}
      ${ambientais.length ? `<table class="crq-tab" style="margin-top:8px"><thead><tr><th>Área ambiental (CAR)</th><th>Área</th></tr></thead><tbody>
        ${ambientais.map(f => `<tr data-ir="${f.i}"><td>${esc(f.grupo)} ${esc(f.rot && f.rot !== f.grupo ? f.rot : '')}</td><td>${ha(f.ha)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${edita ? `<details class="crq-edit"><summary>Editar dados do CAR e da reserva</summary><div class="crq-rl-dados">
        ${[['car', 'Nº do CAR'], ['imovel_car', 'Imóvel no CAR'], ['municipio', 'Município'], ['data_cadastro', 'Cadastrado em'], ['mf', 'Módulos fiscais'], ['car_area_ha', 'Área total no CAR (ha)'], ['consolidada_ha', 'Área consolidada (ha)'], ['remanescente_ha', 'Remanescente de vegetação (ha)'], ['rl_car_ha', 'Reserva legal declarada (ha)'], ['app_ha', 'APP (ha)'], ['servidao_ha', 'Servidão (ha)'], ['averbacao', 'Matrículas / averbação'], ['situacao', 'Situação (ex.: ativo, analisado, compensação, PRA)'], ['obs', 'Observação']].map(([k, r]) =>
          `<label><span>${r}</span><input type="text" data-rv="${k}" value="${esc(rv[k] || '')}" maxlength="300"></label>`).join('')}
        <button class="btn mini principal" type="button" id="crqRvGravar">Gravar</button></div></details>` : ''}
      <p class="crq-nota">Lei 12.651/2012, art. 12, II: fora da Amazônia Legal, a reserva legal é de no mínimo ${RL_MIN}% da área do imóvel. Áreas do mapa calculadas dos desenhos (aproximadas); valem as do CAR.</p>
    </section>

    ${(cq.marcos || []).filter(m => m.tipo !== 'Bebedouro').length || edita ? `<h4 class="crq-sub">Sede e pontos marcados</h4>
      ${itensSede(cq).cons.length || itensSede(cq).mar.length ? '<button class="btn mini principal" type="button" id="crqVerSede" style="margin-bottom:6px">🏠 Ver mapa da sede</button>' : ''}
      ${(cq.marcos || []).filter(m => m.tipo !== 'Bebedouro').length ? `<table class="crq-tab crq-tal"><tbody>
      ${(cq.marcos || []).map((m, k) => m.tipo === 'Bebedouro' ? '' : `<tr data-marco="${k}"><td>${(TIPO_MARCO[m.tipo] || TIPO_MARCO.Ponto).ico} ${esc(m.nome)}</td><td class="crq-mono">${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${edita && !(cq.marcos || []).some(m => m.tipo === 'Sede') ? '<p class="crq-alerta">A sede desta fazenda ainda não está no mapa. Clique em <b>📍 Marcar ponto</b> e depois no lugar da sede.</p>' : ''}` : ''}

    ${(cq.pontos || []).length ? `<h4 class="crq-sub">Captações de água (outorgas)</h4>
      <table class="crq-tab crq-tal"><thead><tr><th>Ponto</th><th>Outorga</th><th>Validade</th></tr></thead><tbody>
      ${cq.pontos.map((p, k) => { const v = p.venc && p.venc < hojeIso(); return `<tr data-ponto="${k}"><td><i class="crq-ponto-ico${v ? ' venc' : ''}"></i>${esc(p.nome)}${p.vazao ? `<br><small>${esc(p.vazao)}${p.finalidade ? ' · ' + esc(p.finalidade) : ''}</small>` : ''}</td><td>${esc(p.outorga || '')}</td><td class="${v ? 'crq-venc' : ''}">${esc(p.validade || '')}${v ? '<br><small>vencida</small>' : ''}</td></tr>`; }).join('')}
      </tbody></table>` : ''}

    <h4 class="crq-sub">Quadro de talhões</h4>
    ${talhoes.length ? `<table class="crq-tab crq-tal"><thead><tr><th>Uso</th><th>Talhão</th><th>Área</th></tr></thead><tbody>
      ${talhoes.map(f => `<tr data-ir="${f.i}"><td><i style="background:${(COR[f.grupo] || COR.Outros).fill}"></i>${esc(f.grupo)}</td><td>${esc(f.rot)}</td><td>${ha(f.ha)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="dica">Nenhum talhão desenhado ainda. Use Importar com o KML do Google Earth.</p>'}
    <p class="crq-nota">Fonte do desenho: ${esc(cq.fonte || '—')}${cq.importado_em ? ' · importado em ' + new Date(cq.importado_em).toLocaleDateString('pt-BR') : ''}.</p>`;
  $('crqPainel').querySelectorAll('[data-grp]').forEach(c => c.addEventListener('change', () => {
    if (c.checked) S.ocultos.delete(c.dataset.grp); else S.ocultos.add(c.dataset.grp);
    c.closest('label').classList.toggle('off', !c.checked); desenhar(false);
  }));
  $('crqPainel').querySelectorAll('[data-ir]').forEach(tr => tr.addEventListener('click', () => irPara(Number(tr.dataset.ir))));
  $('crqPainel').querySelectorAll('[data-ponto]').forEach(tr => tr.addEventListener('click', () => {
    const m = S.camadas['p' + tr.dataset.ponto]; if (m) { S.mapa.setView(m.getLatLng(), 18); m.openPopup(); }
  }));
  $('crqPainel').querySelectorAll('[data-marco]').forEach(tr => tr.addEventListener('click', () => {
    const m = S.camadas['m' + tr.dataset.marco]; if (m) { S.mapa.setView(m.getLatLng(), 20); m.openPopup(); }
  }));
  $('crqVerSede')?.addEventListener('click', () => $('crqSede').click());
  $('crqRvGravar')?.addEventListener('click', gravarReserva);
  marcarLinha();
}

/** Nomes no mapa conforme o zoom: talhões pequenos só aparecem de perto. */
function zoomRotulos() {
  const z = S.mapa?.getZoom() ?? 0, el = $('crqMapa'); if (!el) return;
  el.classList.toggle('crq-z-longe', z < 14); el.classList.toggle('crq-z-medio', z < 16);
}
/** limite pode ser um anel [[lon,lat]…] ou vários (imóvel em partes, vindo do CAR). */
const aneis = cq => !cq.limite ? [] : Array.isArray(cq.limite[0]?.[0]) ? cq.limite : [cq.limite];
const centro = c => [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length];
const foraDoLimite = (cq, f) => !!cq.limite && !aneis(cq).some(a => dentro(centro(f.c), a));

function irPara(i) {
  S.sel = i; desenhar(false);
  const l = S.camadas['f' + i];
  if (l) { S.mapa.fitBounds(l.getBounds(), { padding: [60, 60], maxZoom: S.atual?.feicoes?.[i]?.grupo === 'Construção' ? 20 : 17 }); l.openPopup(); }
  marcarLinha();
}
function marcarLinha() {
  $('crqPainel')?.querySelectorAll('[data-ir]').forEach(tr => tr.classList.toggle('sel', Number(tr.dataset.ir) === S.sel));
}

/* ---------- mapa da sede ---------- */
/** Construções + pontos marcados (sem bebedouros): é "a sede". */
function itensSede(cq) {
  const cons = (cq.feicoes || []).map((f, i) => ({ ...f, i })).filter(f => f.grupo === 'Construção');
  const mar = (cq.marcos || []).map((m, k) => ({ ...m, k })).filter(m => m.tipo !== 'Bebedouro');
  return { cons, mar };
}
function irParaSede() {
  const L = window.L, cq = S.atual; if (!L || !cq) return;
  desenhar(false);
  const { cons, mar } = itensSede(cq);
  const pts = [...cons.flatMap(f => f.c.map(([x, y]) => [y, x])), ...mar.map(m => [m.lat, m.lon])];
  if (!pts.length) return msg('Esta fazenda ainda não tem sede marcada. Use 📍 Marcar ponto ou ✏ Contornar.', true);
  S.mapa.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 20 });
}
function painelSede() {
  const cq = S.atual; const { cons, mar } = itensSede(cq); const edita = pode('cert');
  const semContorno = mar.filter(m => !cons.some(f => so(f.nome) === so(m.nome)));
  const total = cons.reduce((s, f) => s + (f.ha || 0), 0);
  $('crqPainel').innerHTML = `
    <h3 class="crq-h">${esc(cq.fazenda)} · sede</h3>
    <div class="crq-kpis">
      <div><span>Construções contornadas</span><b>${cons.length}</b></div>
      <div><span>Área construída</span><b>${m2(total)}</b></div>
    </div>
    <h4 class="crq-sub">Construções</h4>
    ${cons.length ? `<table class="crq-tab crq-tal"><thead><tr><th>Construção</th><th>Área</th></tr></thead><tbody>
      ${cons.sort((a, b) => so(a.rot).localeCompare(so(b.rot), 'pt-BR')).map(f => { const m = mar.find(x => so(x.nome) === so(f.nome)); return `<tr data-ir="${f.i}"><td>${m ? (TIPO_MARCO[m.tipo] || TIPO_MARCO.Ponto).ico + ' ' : '<i style="background:#FFE9A8;border:1px solid #FFC400"></i>'}${esc(f.rot || f.nome)}</td><td>${m2(f.ha)}</td></tr>`; }).join('')}
    </tbody></table>` : '<p class="dica">Nenhuma construção contornada ainda.</p>'}
    ${semContorno.length ? `<h4 class="crq-sub">Pontos sem contorno</h4><table class="crq-tab crq-tal"><tbody>
      ${semContorno.map(m => `<tr data-marco="${m.k}"><td>${(TIPO_MARCO[m.tipo] || TIPO_MARCO.Ponto).ico} ${esc(m.nome)}</td><td class="dica">só o ponto</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${edita ? `<p class="crq-nota">Para contornar: <b>✏ Contornar</b>, clique em cada canto do telhado e depois em <b>✔ Concluir</b>. Para corrigir, toque no contorno › Apagar contorno e faça de novo. O nome igual ao de um ponto junta os dois.</p>` : ''}
    <p class="crq-nota">Contornos traçados sobre a imagem de satélite: medidas aproximadas.</p>`;
  $('crqPainel').querySelectorAll('[data-ir]').forEach(tr => tr.addEventListener('click', () => irPara(Number(tr.dataset.ir))));
  $('crqPainel').querySelectorAll('[data-marco]').forEach(tr => tr.addEventListener('click', () => {
    const m = S.camadas['m' + tr.dataset.marco]; if (m) { S.mapa.setView(m.getLatLng(), 20); m.openPopup(); }
  }));
  marcarLinha();
}

/* ---------- contornar construção ---------- */
function modoContornar(on) {
  if (!on) { S.desenho?.linha?.remove(); S.desenho?.cantos?.remove(); S.desenho = null; }
  else S.desenho = { pts: [], linha: window.L.polyline([], { color: '#FFC400', weight: 3, dashArray: '4 4', interactive: false }).addTo(S.mapa), cantos: window.L.layerGroup().addTo(S.mapa) };
  const b = $('crqContornar'); if (b) { b.classList.toggle('principal', !!on); b.textContent = on ? '✔ Concluir' : '✏ Contornar'; }
  $('crqMapa')?.classList.toggle('crq-marcando', !!on || S.marcando);
  if (on) msg('Clique em cada canto da construção. Depois toque em ✔ Concluir (Esc cancela).');
}
function pontoContorno(ll) {
  const d = S.desenho; if (!d) return;
  d.pts.push([ll.lng, ll.lat]);
  d.linha.setLatLngs([...d.pts, d.pts[0]].map(([x, y]) => [y, x]));
  window.L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#FFC400', fillOpacity: 1, interactive: false }).addTo(d.cantos);
  $('crqContornar').textContent = `✔ Concluir (${d.pts.length})`;
}
async function concluirContorno() {
  const d = S.desenho; const cq = S.atual;
  if (!d || d.pts.length < 3) { msg('Clique em pelo menos 3 cantos.', true); return; }
  const pts = d.pts.slice(); modoContornar(false);
  const nome = so(prompt('Nome da construção (ex.: Barracão de máquinas, Casa 2, Refeitório):', ''));
  if (!nome) return msg('Contorno descartado.');
  const r7 = v => Math.round(v * 1e7) / 1e7;
  const c = [...pts, pts[0]].map(([x, y]) => [r7(x), r7(y)]);
  const feicoes = [...(cq.feicoes || []), { nome, rot: nome, grupo: 'Construção', fonte: 'app', ha: Math.round(areaHa(c) * 1e4) / 1e4, c }];
  await gravarFeicoes(feicoes, `Contorno “${nome}” gravado (${m2(areaHa(c))}).`);
}
async function gravarFeicoes(feicoes, aviso) {
  const cq = S.atual;
  const { error } = await estado.cliente.from('cert_croquis').update({ feicoes, atualizado_por: quem() }).eq('fazenda_id', cq.fazenda_id);
  if (error) return msg('Não gravou: ' + error.message, true);
  cq.feicoes = feicoes; S.mapa.closePopup(); desenhar(false); painel(); msg(aviso);
}
async function renomearConstrucao(i) {
  const cq = S.atual; const f = cq.feicoes[i]; if (!f) return;
  const nome = so(prompt('Novo nome da construção:', f.nome || ''));
  if (!nome || nome === f.nome) return;
  await gravarFeicoes(cq.feicoes.map((x, k) => k === i ? { ...x, nome, rot: nome } : x), `Renomeado para “${nome}”.`);
}
async function apagarConstrucao(i) {
  const cq = S.atual; const f = cq.feicoes[i]; if (!f) return;
  if (!confirm(`Apagar o contorno “${f.rot || f.nome}”?`)) return;
  await gravarFeicoes(cq.feicoes.filter((_, k) => k !== i), `Contorno “${f.rot || f.nome}” apagado.`);
}

/* ---------- marcar ponto (sede, galpão, piscinão…) ---------- */
function modoMarcar(on) {
  S.marcando = !!on;
  $('crqMarcar')?.classList.toggle('principal', S.marcando);
  $('crqMapa')?.classList.toggle('crq-marcando', S.marcando);
  if (S.marcando) msg('Clique no mapa onde fica o ponto (Esc ou o botão de novo cancela).');
}
async function gravarMarcos(marcos, aviso) {
  const cq = S.atual;
  const { error } = await estado.cliente.from('cert_croquis').update({ marcos, atualizado_por: quem() }).eq('fazenda_id', cq.fazenda_id);
  if (error) return msg('Não gravou: ' + error.message, true);
  cq.marcos = marcos; desenhar(false); painel(); msg(aviso);
}
async function marcarAqui(ll) {
  modoMarcar(false);
  const cq = S.atual; if (!cq) return;
  const sugestao = (cq.marcos || []).some(m => m.tipo === 'Sede') ? '' : 'Sede';
  const nome = so(prompt('Nome do ponto (ex.: Sede, Galpão, Piscinão, Casa do caseiro):', sugestao));
  if (!nome) return;
  const r6 = v => Math.round(v * 1e6) / 1e6;
  await gravarMarcos([...(cq.marcos || []), { nome, tipo: tipoDoNome(nome), lat: r6(ll.lat), lon: r6(ll.lng), fonte: 'app', em: hojeIso() }], `Ponto “${nome}” marcado.`);
}
async function removerMarco(k) {
  const cq = S.atual; const m = (cq.marcos || [])[k]; if (!m) return;
  if (!confirm(`Remover o ponto “${m.nome}” do mapa?`)) return;
  S.mapa.closePopup();
  await gravarMarcos(cq.marcos.filter((_, i) => i !== k), `Ponto “${m.nome}” removido.`);
}

async function gravarReserva() {
  const cq = S.atual; const rv = { ...(cq.reserva || {}) };
  $('crqPainel').querySelectorAll('[data-rv]').forEach(i => { const v = so(i.value); if (v) rv[i.dataset.rv] = v; else delete rv[i.dataset.rv]; });
  for (const k of ['rl_car_ha', 'car_area_ha', 'consolidada_ha', 'remanescente_ha', 'app_ha', 'servidao_ha', 'mf']) if (rv[k]) rv[k] = String(rv[k]).replace(/\./g, (m, o, t) => t.indexOf(',') > o ? '' : '.').replace(',', '.');
  const { error } = await estado.cliente.from('cert_croquis').update({ reserva: rv, atualizado_por: quem() }).eq('fazenda_id', cq.fazenda_id);
  if (error) return msg('Não gravou: ' + error.message, true);
  cq.reserva = rv; painel(); msg('Dados da reserva gravados.');
}

async function importar(ev) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  try {
    msg('Lendo ' + file.name + '…');
    if (/\.zip$/i.test(file.name)) return await importarCar(file);
    const xml = /\.kmz$/i.test(file.name) ? await lerKmz(file) : await file.text();
    if (!S.fazendas) await carregar();
    const novos = kmlParaCroquis(xml, S.fazendas);
    if (!novos.length) throw new Error('Não achei nenhuma fazenda conhecida no arquivo (os nomes das pastas precisam ter Faca, Lote 35, Morro Branco, Três Riachos ou Quebra Cocão).');
    const agora = new Date().toISOString();
    // mantém o que veio do CAR (limite em partes e camadas ambientais) se já tiver sido importado
    const linhas = novos.map(n => {
      const ant = S.lista.find(c => c.fazenda_id === n.fazenda_id);
      const doCar = (ant?.feicoes || []).filter(f => f.fonte === 'CAR' || f.fonte === 'app');   // CAR e contornos feitos no app ficam
      const limCar = ant?.limite_fonte === 'CAR';
      const marcosApp = (ant?.marcos || []).filter(m => m.fonte !== 'KML');   // marcados no app ficam
      return { fazenda_id: n.fazenda_id, fazenda: n.fazenda, feicoes: [...n.feicoes, ...doCar], marcos: [...n.marcos, ...marcosApp],
        ...(limCar ? {} : { limite: n.limite, area_total: n.area_total }), fonte: file.name, importado_em: agora, atualizado_por: quem() };
    });
    const { error } = await estado.cliente.from('cert_croquis').upsert(linhas, { onConflict: 'fazenda_id' });
    if (error) throw error;
    await carregar();
    S.atual = S.lista.find(c => c.fazenda_id === S.atual?.fazenda_id) || S.lista[0];
    abas(); desenhar(true); painel();
    msg(`Importado: ${novos.map(n => `${n.fazenda} (${n.feicoes.length})`).join(' · ')}`);
  } catch (e) { msg(e.message || String(e), true); }
}

/** Shapefile do CAR (.zip baixado do SICAR) → limite oficial e camadas ambientais da fazenda aberta. */
async function importarCar(file) {
  const cq = S.atual; if (!cq) throw new Error('Abra a fazenda antes de importar o CAR.');
  const cam = await lerCarZip(new Uint8Array(await file.arrayBuffer()));
  if (!Object.keys(cam).length) throw new Error('Não achei camadas do CAR no .zip (AREA_IMOVEL, RESERVA_LEGAL, APP…).');
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const anel = a => a.map(([x, y]) => [r6(x), r6(y)]);
  const feicoes = (cq.feicoes || []).filter(f => f.fonte !== 'CAR');
  for (const [grupo, pols] of Object.entries(cam)) {
    if (grupo === 'limite') continue;
    pols.forEach((pol, k) => feicoes.push({ nome: `${grupo} ${pols.length > 1 ? k + 1 : ''}`.trim(), rot: pols.length > 1 ? `${grupo === 'Reserva legal (CAR)' ? 'RL' : grupo} ${k + 1}` : grupo === 'Reserva legal (CAR)' ? 'RL' : grupo,
      grupo, fonte: 'CAR', ha: Math.round(areaPol(pol) * 100) / 100, c: anel(pol[0]), ...(pol.length > 1 ? { h: pol.slice(1).map(anel) } : {}) }));
  }
  const upd = { feicoes, atualizado_por: quem() };
  if (cam.limite?.length) {
    upd.limite = cam.limite.map(p => anel(p[0]));
    upd.area_total = Math.round(cam.limite.reduce((s, p) => s + areaPol(p), 0) * 100) / 100;
    upd.limite_fonte = 'CAR';
  }
  const { error } = await estado.cliente.from('cert_croquis').update(upd).eq('fazenda_id', cq.fazenda_id);
  if (error) throw error;
  await carregar(); S.atual = S.lista.find(c => c.fazenda_id === cq.fazenda_id);
  abas(); desenhar(true); painel();
  msg(`CAR importado em ${cq.fazenda}: ${Object.entries(cam).map(([g, p]) => (g === 'limite' ? 'limite' : g) + ' (' + p.length + ')').join(' · ')}`);
}


/* ---------- Linha do tempo da reserva legal (12/11/2026) ----------
 * Pedido do Guilherme: acompanhar a reserva legal desde 2014 dentro do app, uma imagem por ano.
 * Fonte: World Imagery Wayback (Esri) — todas as versões da imagem de satélite publicadas desde
 * fev/2014. Para a fazenda aberta, procura as versões que mudaram no ponto central da reserva
 * (vendor/wayback/wayback-core.js, Apache-2.0), lê a data real de captura de cada uma e fica com
 * a captura mais recente de cada ano. Anos sem imagem nova naquele ponto não aparecem.
 * Resultado guardado no navegador por 30 dias. Comparar = cortina 2014 × hoje (arrastar). */
const AMBIENTAIS = ['Reserva', 'Reserva legal (CAR)', 'Vegetação nativa', 'APP', 'Servidão'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCap = ms => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${MESES[d.getUTCMonth()]}/${d.getUTCFullYear()}`; };
let waybackMod = null;
const wayback = () => (waybackMod ||= import('../vendor/wayback/wayback-core.js').catch(e => { waybackMod = null; throw e; }));

function pontoReserva(cq) {
  const rl = (cq.feicoes || []).filter(f => f.grupo === 'Reserva legal (CAR)');
  const usar = rl.length ? rl : (cq.feicoes || []).filter(f => f.grupo === 'Reserva' && !foraDoLimite(cq, f));
  let pts = usar.flatMap(f => f.c || []);
  if (!pts.length) pts = aneis(cq).flat();
  if (!pts.length) pts = (cq.feicoes || []).flatMap(f => f.c || []);
  if (!pts.length) return null;
  // centro da maior parte da reserva (o ponto precisa cair dentro dela, não entre duas partes)
  const maior = usar.length ? usar.reduce((a, b) => (b.ha || 0) > (a.ha || 0) ? b : a) : null;
  const base = maior?.c?.length ? maior.c : pts;
  let lon = base.reduce((t, p) => t + p[0], 0) / base.length, lat = base.reduce((t, p) => t + p[1], 0) / base.length;
  if (maior && !dentro([lon, lat], maior.c)) {                      // reserva em L: procura o ponto de dentro mais perto do centro
    const xs = maior.c.map(p => p[0]), ys = maior.c.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let melhor = null;
    for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
      const q = [x0 + (x1 - x0) * i / 40, y0 + (y1 - y0) * j / 40];
      if (!dentro(q, maior.c)) continue;
      const d = (q[0] - lon) ** 2 + (q[1] - lat) ** 2;
      if (!melhor || d < melhor.d) melhor = { q, d };
    }
    if (melhor) [lon, lat] = melhor.q;
  }
  return { longitude: lon, latitude: lat };
}

function urlWayback(item) {
  return item.itemURL.replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}').replace('//wayback.maptiles', '//{s}.maptiles');
}

async function anosDaFazenda(cq) {
  const pt = pontoReserva(cq); if (!pt) throw new Error('Esta fazenda ainda não tem desenho no mapa.');
  const chave = `crqTempo:v2:${cq.fazenda_id}:${pt.latitude.toFixed(4)}:${pt.longitude.toFixed(4)}`;
  try { const c = JSON.parse(localStorage.getItem(chave) || 'null'); if (c && Date.now() - c.em < 30 * 864e5 && c.anos?.length) return c; } catch { /* sem cache */ }
  const wb = await wayback();
  const ZOOM = 16;
  const itens = await wb.getWaybackItemsWithLocalChanges(pt, ZOOM);
  const lidos = [];
  for (let k = 0; k < itens.length; k += 6) {                       // 6 consultas por vez
    const lote = await Promise.all(itens.slice(k, k + 6).map(async it => {
      let m = null; try { m = await wb.getMetadata(pt, ZOOM, it.releaseNum); } catch { /* sem metadado */ }
      return { rel: it.releaseNum, url: urlWayback(it), pub: it.releaseDateLabel, data: m?.date || null, fonte: m?.provider || m?.source || '', res: m?.resolution || null };
    }));
    lidos.push(...lote);
  }
  const porAno = new Map();
  for (const r of lidos) {
    const ms = r.data || Date.parse(r.pub); if (!isFinite(ms)) continue;
    const ano = new Date(ms).getUTCFullYear();
    const atual = porAno.get(ano);
    if (!atual || ms > atual.ms) porAno.set(ano, { ano, ms, rel: r.rel, url: r.url, fonte: r.fonte, res: r.res, pub: r.pub, dataReal: !!r.data });
  }
  const anos = [...porAno.values()].sort((a, b) => a.ano - b.ano);
  // a imagem "de hoje" também tem data de captura — o auditor precisa ver qual é (pode ser de anos atrás)
  let atual = null;
  try { const novo = (await wb.getWaybackItems())[0]; const m = await wb.getMetadata(pt, ZOOM, novo.releaseNum); if (m?.date) atual = { ms: m.date, fonte: m.provider || m.source || '', res: m.resolution || null }; } catch { /* sem metadado */ }
  const r = { em: Date.now(), anos, atual };
  try { localStorage.setItem(chave, JSON.stringify(r)); } catch { /* sem espaço */ }
  return r;
}

function linhaDoTempo(on) {
  const L = window.L; if (!L || !S.mapa) return;
  S.tempo.ativo = on;
  $('crqTempoBtn').classList.toggle('principal', on);
  $('crqOverlay').classList.toggle('crq-tempo-on', on);
  if (on) {
    S.tempo.soRl = true; S.modoSede = false; $('crqSede').classList.remove('principal');
    modoMarcar(false); modoContornar(false);
    if (!S.tempo.ctrl) {
      const C = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() {
        const d = L.DomUtil.create('div', 'crq-tempo'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; } });
      S.tempo.ctrl = new C();
      const R = L.Control.extend({ options: { position: 'topleft' }, onAdd() { return L.DomUtil.create('div', 'crq-tempo-rot'); } });
      S.tempo.rot = new R();
    }
    S.tempo.ctrl.addTo(S.mapa); S.tempo.rot.addTo(S.mapa);
    carregarTempo();
  } else {
    sairComparar();
    if (S.tempo.camada) { S.tempo.camada.remove(); S.tempo.camada = null; }
    if (!S.mapa.hasLayer(S.base)) S.base.addTo(S.mapa);
    S.tempo.ctrl?.remove(); S.tempo.rot?.remove();
    S.tempo.sel = null;
  }
  desenhar(true); painel();
}

async function carregarTempo() {
  const cq = S.atual; if (!cq) return;
  S.tempo.anos = null; S.tempo.atual = null; S.tempo.sel = null; S.tempo.erro = null; sairComparar();
  if (S.tempo.camada) { S.tempo.camada.remove(); S.tempo.camada = null; }
  if (!S.mapa.hasLayer(S.base)) S.base.addTo(S.mapa);
  barraTempo(); painel();
  const faz = cq.fazenda_id;
  try {
    const { anos, atual } = await anosDaFazenda(cq);
    if (S.atual?.fazenda_id !== faz || !S.tempo.ativo) return;
    S.tempo.anos = anos; S.tempo.atual = atual;
    if (anos.length) verAno(anos[0].ano);                            // abre na imagem mais antiga
  } catch (e) {
    if (S.atual?.fazenda_id !== faz) return;
    S.tempo.erro = /fetch|network|Failed/i.test(e.message || '') ? 'Não consegui buscar as imagens antigas (sem internet?).' : (e.message || String(e));
  }
  barraTempo(); painel();
}

function verAno(ano) {
  const L = window.L; const a = (S.tempo.anos || []).find(x => x.ano === ano);
  S.tempo.sel = a ? ano : null;
  if (S.tempo.comparar) { montarComparar(); barraTempo(); painel(); return; }
  if (S.tempo.camada) { S.tempo.camada.remove(); S.tempo.camada = null; }
  if (a) {
    S.tempo.camada = L.tileLayer(a.url, { subdomains: ['wayback', 'wayback-a', 'wayback-b'], maxZoom: 21, maxNativeZoom: 18, crossOrigin: true, attribution: 'Imagem histórica © Esri World Imagery Wayback' }).addTo(S.mapa);
    S.tempo.camada.bringToBack(); S.base.remove();
  } else if (!S.mapa.hasLayer(S.base)) S.base.addTo(S.mapa);
  barraTempo(); painel();
}

function textoAno(a) {
  if (!a) { const t = S.tempo.atual; return `<b>Hoje</b> · imagem atual${t ? ', captada em ' + dataCap(t.ms) + (t.fonte ? ' · ' + esc(t.fonte) : '') : ''}`; }
  return `<b>${a.ano}</b> · ${a.dataReal ? 'imagem de ' + dataCap(a.ms) : 'versão publicada em ' + esc(a.pub)}${a.fonte ? ' · ' + esc(a.fonte) : ''}${a.res ? ' · ' + String(a.res).replace('.', ',') + ' m' : ''}`;
}

function barraTempo() {
  const el = S.tempo.ctrl?.getContainer?.(); const rot = S.tempo.rot?.getContainer?.();
  if (!el) return;
  const anos = S.tempo.anos;
  const sel = (anos || []).find(a => a.ano === S.tempo.sel);
  if (rot) rot.innerHTML = S.tempo.comparar
    ? `<span class="crq-tempo-esq">◀ ${sel ? sel.ano : '—'}</span><span class="crq-tempo-dir">Hoje ▶</span>`
    : textoAno(sel);
  if (S.tempo.erro) { el.innerHTML = `<span class="crq-tempo-av">${esc(S.tempo.erro)}</span> <button type="button" class="btn mini" data-t-de-novo>Tentar de novo</button>`; }
  else if (!anos) el.innerHTML = '<span class="crq-tempo-av">Buscando as imagens de 2014 até hoje…</span>';
  else if (!anos.length) el.innerHTML = '<span class="crq-tempo-av">Não há imagens antigas para este ponto.</span>';
  else el.innerHTML = `<div class="crq-tempo-anos">${anos.map(a => `<button type="button" class="${a.ano === S.tempo.sel ? 'on' : ''}" data-t-ano="${a.ano}">${a.ano}</button>`).join('')}
      ${S.tempo.comparar ? '' : `<button type="button" class="${S.tempo.sel == null ? 'on' : ''}" data-t-ano="">Hoje</button>`}</div>
    <div class="crq-tempo-op"><button type="button" class="btn mini${S.tempo.comparar ? ' principal' : ''}" data-t-comp>⇆ Comparar com hoje</button>
      <label><input type="checkbox" data-t-so ${S.tempo.soRl ? 'checked' : ''}> Só reserva e APP</label></div>`;
  el.querySelector('[data-t-de-novo]')?.addEventListener('click', carregarTempo);
  el.querySelectorAll('[data-t-ano]').forEach(b => b.addEventListener('click', () => verAno(b.dataset.tAno ? +b.dataset.tAno : null)));
  el.querySelector('[data-t-comp]')?.addEventListener('click', () => { if (S.tempo.comparar) { sairComparar(); verAno(S.tempo.sel); } else { if (S.tempo.sel == null && anos[0]) S.tempo.sel = anos[0].ano; S.tempo.comparar = true; verAno(S.tempo.sel); } });
  el.querySelector('[data-t-so]')?.addEventListener('change', e => { S.tempo.soRl = e.target.checked; desenhar(false); });
}

/* Comparar: ano escolhido à esquerda, hoje à direita, separados por uma cortina que se arrasta. */
function montarComparar() {
  const L = window.L, map = S.mapa;
  const a = (S.tempo.anos || []).find(x => x.ano === S.tempo.sel); if (!a) return;
  if (S.tempo.camada) { S.tempo.camada.remove(); S.tempo.camada = null; }
  if (!map.hasLayer(S.base)) S.base.addTo(map);
  if (!map.getPane('crqAntes')) { const pn = map.createPane('crqAntes'); pn.style.zIndex = 250; }
  if (S.tempo.antes) S.tempo.antes.remove();
  S.tempo.antes = L.tileLayer(a.url, { pane: 'crqAntes', subdomains: ['wayback', 'wayback-a', 'wayback-b'], maxZoom: 21, maxNativeZoom: 18, crossOrigin: true }).addTo(map);
  if (!S.tempo.cortina) {
    const c = L.DomUtil.create('div', 'crq-cortina', map.getContainer());
    c.innerHTML = '<span></span>';
    S.tempo.cortina = c; S.tempo.fr = 0.5;
    const mover = ev => { const r = map.getContainer().getBoundingClientRect(); const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left; S.tempo.fr = Math.min(0.98, Math.max(0.02, x / r.width)); cortar(); ev.preventDefault(); };
    const soltar = () => { document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); map.dragging.enable(); };
    c.addEventListener('pointerdown', ev => { map.dragging.disable(); document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar); ev.stopPropagation(); ev.preventDefault(); });
    S.tempo.cortar = cortar; map.on('move zoom resize', cortar);
  }
  S.tempo.cortina.hidden = false;
  cortar();
}
function cortar() {
  const map = S.mapa, pn = map?.getPane('crqAntes'); if (!pn || !S.tempo.cortina) return;
  const tam = map.getSize(), x = Math.round(tam.x * S.tempo.fr);
  const nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(tam), xl = map.containerPointToLayerPoint([x, 0]).x;
  pn.style.clip = `rect(${nw.y}px, ${xl}px, ${se.y}px, ${nw.x}px)`;
  S.tempo.cortina.style.left = x + 'px';
}
function sairComparar() {
  S.tempo.comparar = false;
  if (S.tempo.antes) { S.tempo.antes.remove(); S.tempo.antes = null; }
  if (S.tempo.cortina) S.tempo.cortina.hidden = true;
}

/* Marcos das normas (12/11/2026, pedido: "atender SMETA, GLOBALG.A.P., Rainforest… auditor não botar defeito"). */
const CORTE_RA = '2014-01-01';     // Rainforest Alliance 2020, Anexo Ambiental, req. 6.1.1 — sem desmatamento/conversão depois de 01/01/2014
const CORTE_EUDR = '2020-12-31';   // Regulamento UE 2023/1115 (EUDR) — data de corte 31/12/2020
const AVAL = { ok: 'Vegetação mantida', alt: 'Alteração encontrada' };
const isoDe = ms => new Date(ms).toISOString().slice(0, 10);
const brIso = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';

function avaliacoes(cq) { return (cq.reserva || {}).tempo || {}; }
function conclusao(cq) {
  const anos = S.tempo.anos || []; const av = avaliacoes(cq);
  const chaves = [...anos.map(a => String(a.ano)), 'hoje'];
  const alt = chaves.filter(k => av[k]?.sit === 'alt');
  const falta = chaves.filter(k => !av[k]?.sit);
  if (!anos.length) return { cls: 'pend', txt: 'Sem imagens para avaliar.' };
  if (alt.length) return { cls: 'alt', txt: `Alteração registrada em ${alt.map(k => k === 'hoje' ? 'hoje' : k).join(', ')}. Ver observações e plano de ação.` };
  if (falta.length) return { cls: 'pend', txt: `Avaliação incompleta: falta avaliar ${falta.map(k => k === 'hoje' ? 'a imagem atual' : k).join(', ')}.` };
  const ult = Object.values(av).map(v => v.em).filter(Boolean).sort().pop();
  const ini = anos[0].dataReal ? dataCap(anos[0].ms) : String(anos[0].ano);
  const fimMs = S.tempo.atual?.ms || anos[anos.length - 1].ms;
  const posCorte = isoDe(fimMs) > CORTE_EUDR;
  return { cls: 'ok', txt: `Nenhuma conversão de vegetação nativa identificada na reserva legal nas imagens de ${ini} a ${dataCap(fimMs)} (${chaves.length} imagens avaliadas${ult ? ', última avaliação em ' + brIso(ult) : ''}). ${posCorte ? 'As imagens cobrem as datas de corte de 01/01/2014 (Rainforest Alliance, req. 6.1.1) e de 31/12/2020 (EUDR).' : 'As imagens cobrem a data de corte de 01/01/2014 (Rainforest Alliance, req. 6.1.1); a de 31/12/2020 (EUDR) precisa de imagem posterior.'}` };
}

async function avaliar(chave, sit, obs) {
  const cq = S.atual; const rv = { ...(cq.reserva || {}) }; const t = { ...(rv.tempo || {}) };
  const a = (S.tempo.anos || []).find(x => String(x.ano) === chave);
  if (!sit) delete t[chave];
  else t[chave] = { sit, obs: so(obs || ''), em: hojeIso(), cap: chave === 'hoje' ? hojeIso() : a ? isoDe(a.ms) : '', fonte: a?.fonte || '', rel: a?.rel || null };
  rv.tempo = t;
  const { error } = await estado.cliente.from('cert_croquis').update({ reserva: rv, atualizado_por: quem() }).eq('fazenda_id', cq.fazenda_id);
  if (error) return msg('Não gravou: ' + error.message, true);
  cq.reserva = rv; painel(); barraTempo(); msg('Avaliação gravada.');
}

function notaLacunas(anos, at, cls) {
  const fal = []; for (let y = 2014; y <= new Date().getFullYear(); y++) if (!anos.some(a => a.ano === y)) fal.push(y);
  if (!fal.length) return '';
  const faixas = []; for (const y of fal) { const u = faixas[faixas.length - 1]; if (u && u[1] === y - 1) u[1] = y; else faixas.push([y, y]); }
  const txt = faixas.map(([a, b]) => a === b ? a : a + '–' + b).join(', ');
  return `<p class="${cls}">Sem imagem nova da Esri neste ponto em ${txt}${at ? ` (a imagem atual é de ${dataCap(at.ms)})` : ''}. Para esses anos, anexe outra prova (ex.: imagem histórica do Google Earth Pro ou foto datada de campo).</p>`;
}

function painelTempo() {
  const cq = S.atual; const anos = S.tempo.anos; const sel = S.tempo.sel; const av = avaliacoes(cq); const edita = pode('cert');
  const celAval = k => {
    const v = av[k];
    if (!edita) return v ? `<span class="crq-av crq-av-${v.sit}">${AVAL[v.sit]}</span>` : '<span class="crq-av">—</span>';
    return `<select data-t-av="${k}" aria-label="Avaliação ${k}"><option value="">Avaliar…</option>${[['ok', '✔ Mantida'], ['alt', '⚠ Alteração']].map(([c, r]) => `<option value="${c}" ${v?.sit === c ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  };
  const marco = a => { const d = isoDe(a.ms); return d < CORTE_RA ? '<small class="crq-marco-t">antes do corte RA</small>' : ''; };
  const linhas = (anos || []).map(a => `<tr data-t-linha="${a.ano}" class="${a.ano === sel ? 'sel' : ''}"><td>${a.ano}${marco(a)}</td><td>${a.dataReal ? dataCap(a.ms) : 'pub. ' + esc(a.pub)}</td><td>${celAval(String(a.ano))}</td></tr>
    ${av[a.ano]?.sit === 'alt' || (edita && av[a.ano]?.obs) ? `<tr class="crq-obs-l"><td colspan="3">${edita ? `<input type="text" data-t-obs="${a.ano}" value="${esc(av[a.ano]?.obs || '')}" placeholder="O que mudou e onde (obrigatório)" maxlength="300">` : esc(av[a.ano]?.obs || '')}</td></tr>` : ''}`).join('');
  const at = S.tempo.atual;
  const linhaHoje = `<tr data-t-linha="" class="${sel == null ? 'sel' : ''}"><td>Hoje<small class="crq-marco-t">imagem atual</small></td><td>${at ? dataCap(at.ms) : '—'}</td><td>${celAval('hoje')}</td></tr>
    ${av.hoje?.sit === 'alt' ? `<tr class="crq-obs-l"><td colspan="3">${edita ? `<input type="text" data-t-obs="hoje" value="${esc(av.hoje?.obs || '')}" placeholder="O que mudou e onde (obrigatório)" maxlength="300">` : esc(av.hoje?.obs || '')}</td></tr>` : ''}`;
  const c = anos?.length ? conclusao(cq) : null;
  return `<section class="crq-rl crq-tempo-pn">
    <h4 class="crq-sub" style="margin-top:10px">Monitoramento da reserva legal</h4>
    <div class="crq-cortes"><span><b>01/01/2014</b> corte Rainforest Alliance (6.1.1)</span><span><b>31/12/2020</b> corte EUDR (UE 2023/1115)</span></div>
    ${anos == null && !S.tempo.erro ? '<p class="dica">Buscando as imagens…</p>' : S.tempo.erro ? `<p class="crq-alerta">${esc(S.tempo.erro)}</p>` : !anos.length ? '<p class="dica">Sem imagens antigas para este ponto.</p>' : `
    <p class="crq-nota" style="margin:0 0 6px">Abra cada ano, compare a vegetação com o desenho da reserva e marque a avaliação. ${anos.length} imagens de ${anos[0].ano} a ${anos[anos.length - 1].ano} + a atual.</p>
    <table class="crq-tab crq-tal crq-tab-tempo"><thead><tr><th>Ano</th><th>Captura</th><th>Avaliação</th></tr></thead><tbody>${linhas}${linhaHoje}</tbody></table>
    <div class="crq-concl crq-concl-${c.cls}">${esc(c.txt)}</div>
    ${notaLacunas(anos, at, 'crq-nota crq-lacuna')}
    <button type="button" class="btn principal" data-t-laudo style="margin-top:10px;width:100%">🖨 Laudo para auditoria</button>`}
    <p class="crq-nota">Fonte: Esri World Imagery Wayback (versões da imagem de satélite desde fev/2014), data de captura lida em ${(() => { const p = pontoReserva(cq); return p ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : '—'; })()} (centro da reserva). Desenho: ${esc(cq.reserva?.fonte_car && (cq.feicoes || []).some(f => f.grupo === 'Reserva legal (CAR)') ? 'shapefile do CAR' : cq.fonte || 'croqui')}.</p>
  </section>`;
}

function painel() {
  painelBase();
  if (!S.tempo.ativo || S.modoSede) return;
  const h = $('crqPainel').querySelector('.crq-h');
  if (h) h.insertAdjacentHTML('afterend', painelTempo()); else $('crqPainel').insertAdjacentHTML('afterbegin', painelTempo());
  const pn = $('crqPainel');
  pn.querySelectorAll('[data-t-linha]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('select,input')) return; verAno(tr.dataset.tLinha ? +tr.dataset.tLinha : null); }));
  pn.querySelectorAll('[data-t-av]').forEach(sel => sel.addEventListener('change', () => {
    const k = sel.dataset.tAv;
    if (sel.value === 'alt') { const o = prompt(`O que mudou na reserva em ${k === 'hoje' ? 'hoje' : k}? (local e tamanho aproximado)`); if (!so(o || '')) { sel.value = avaliacoes(S.atual)[k]?.sit || ''; return msg('Para registrar alteração, descreva o que mudou.', true); } avaliar(k, 'alt', o); }
    else avaliar(k, sel.value, '');
  }));
  pn.querySelectorAll('[data-t-obs]').forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.tObs, v = avaliacoes(S.atual)[k]; if (v) avaliar(k, v.sit, inp.value); }));
  pn.querySelector('[data-t-laudo]')?.addEventListener('click', laudo);
}

/* Laudo para auditoria: folha A4 deitada com a ficha do CAR, as datas de corte, a conclusão
 * e uma miniatura de satélite por ano com o desenho da reserva por cima. */
async function laudo() {
  const L = window.L, cq = S.atual, anos = S.tempo.anos || []; if (!cq || !anos.length) return;
  const rv = cq.reserva || {}, av = avaliacoes(cq), c = conclusao(cq);
  const n = v => { const x = Number(String(v ?? '').replace(',', '.')); return v != null && v !== '' && isFinite(x) ? x : null; };
  const area = n(rv.car_area_ha), rl = n(rv.rl_car_ha);
  const partesCar = (cq.feicoes || []).filter(f => f.grupo === 'Reserva legal (CAR)');
  const partes = (partesCar.length ? partesCar : (cq.feicoes || []).filter(f => f.grupo === 'Reserva')).filter(f => !foraDoLimite(cq, f));
  const fora = (partesCar.length ? partesCar : (cq.feicoes || []).filter(f => f.grupo === 'Reserva')).filter(f => foraDoLimite(cq, f));
  const quadros = [...anos.map(a => ({ k: String(a.ano), tit: String(a.ano), cap: a.dataReal ? dataCap(a.ms) : 'pub. ' + a.pub, fonte: a.fonte, res: a.res, url: a.url, sub: true })),
    { k: 'hoje', tit: 'Hoje', cap: S.tempo.atual ? 'imagem atual, de ' + dataCap(S.tempo.atual.ms) : 'imagem atual', fonte: S.tempo.atual?.fonte || 'Esri World Imagery', res: S.tempo.atual?.res, url: null }];
  const POR = 6, paginas = [];
  for (let k = 0; k < quadros.length; k += POR) paginas.push(quadros.slice(k, k + POR));
  const chip = k => { const v = av[k]; return `<span class="lau-av lau-av-${v?.sit || 'nao'}">${v ? AVAL[v.sit] : 'Não avaliado'}</span>`; };
  const cab = (pg) => `<header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Monitoramento da reserva legal por satélite</h1><p>${esc(cq.fazenda)} · série histórica de imagens desde 2014</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${brIso(hojeIso())}</strong><span>folha ${pg} de ${paginas.length + 1}</span></div></header>`;
  const pe = `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>`;
  const ficha = `<div class="lau-ficha">
      <div><span>Imóvel no CAR</span><b>${esc(rv.imovel_car || cq.fazenda)}</b></div>
      <div class="lau-largo"><span>Nº do CAR</span><b>${esc(rv.car || '—')}</b></div>
      <div><span>Município</span><b>${esc(rv.municipio || '—')}</b></div>
      <div><span>Área do imóvel (CAR)</span><b>${area != null ? ha(area) : '—'}</b></div>
      <div><span>Reserva legal declarada</span><b>${rl != null ? ha(rl) + (area ? ' · ' + pct(rl / area * 100) : '') : '—'}</b></div>
      <div><span>APP</span><b>${n(rv.app_ha) != null ? ha(n(rv.app_ha)) : '—'}</b></div>
      <div><span>Matrículas</span><b>${esc(rv.averbacao || '—')}</b></div></div>
    <div class="lau-cortes"><div><b>01/01/2014</b><span>Data de corte da Rainforest Alliance (Norma 2020, Anexo Ambiental, req. 6.1.1): sem desmatamento ou conversão de ecossistema natural depois dela.</span></div>
      <div><b>31/12/2020</b><span>Data de corte do Regulamento (UE) 2023/1115 (EUDR), usada pelos compradores europeus.</span></div></div>
    <div class="lau-concl lau-concl-${c.cls}"><span>Conclusão</span>${esc(c.txt)}</div>${notaLacunas(anos, S.tempo.atual, 'lau-lacuna')}`;
  const metodo = `<div class="lau-metodo"><b>Método.</b> Imagens: Esri World Imagery Wayback, que guarda cada versão publicada da imagem de satélite desde fevereiro de 2014; para cada ano fica a captura mais recente sobre o centro da reserva (${(() => { const p = pontoReserva(cq); return p ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : '—'; })()}). Anos sem imagem nova não aparecem porque o satélite não atualizou o local. Contorno verde: reserva legal ${partesCar.length ? 'do shapefile do CAR' : 'do croqui da fazenda'}; tracejado branco: limite do imóvel. Cada imagem foi comparada com o desenho e avaliada no app LOP - Gestão Rápida (data da avaliação na tabela).${fora.length ? ` Parte da reserva fora do limite desenhado (${fora.map(f => esc(f.rot) + ' · ' + ha(f.ha)).join(', ')}) não entra nas miniaturas.` : ''}</div>`;
  const tabela = `<table class="lau-tab"><thead><tr><th>Ano</th><th>Captura</th><th>Satélite</th><th>Resolução</th><th>Avaliação</th><th>Avaliado em</th><th>Observação</th></tr></thead><tbody>
    ${quadros.map(q => `<tr><td>${q.tit}</td><td>${esc(q.cap)}</td><td>${esc(q.fonte || '—')}</td><td>${q.res ? String(q.res).replace('.', ',') + ' m' : '—'}</td><td>${chip(q.k)}</td><td>${brIso(av[q.k]?.em)}</td><td>${esc(av[q.k]?.obs || '')}</td></tr>`).join('')}</tbody></table>`;

  let el = $('crqLaudo'); if (!el) { el = document.createElement('div'); el.id = 'crqLaudo'; document.body.appendChild(el); }
  el.innerHTML = paginas.map((pg, i) => `<article class="rel lau-folha">${cab(i + 1)}${i === 0 ? ficha : ''}
    <div class="lau-grade">${pg.map(q => `<figure class="lau-q"><div class="lau-mapa" data-q="${q.k}"></div>
      <figcaption><b>${q.tit}</b><span>${esc(q.cap)}${q.fonte ? ' · ' + esc(q.fonte) : ''}</span>${chip(q.k)}</figcaption></figure>`).join('')}</div>
    ${pe}</article>`).join('') + `<article class="rel lau-folha">${cab(paginas.length + 1)}
    <h2 class="lau-h2">Registro das avaliações</h2>${tabela}${metodo}
    <div class="lau-normas"><b>Onde este laudo é usado.</b> Rainforest Alliance (Norma de Agricultura Sustentável 2020, Anexo Ambiental, req. 6.1.1 — desmatamento e conversão); GLOBALG.A.P. IFA (biodiversidade, áreas protegidas e uso do solo) e compradores sob o EUDR; SMETA 4 pilares (pilar Meio Ambiente). Guardar no AN do CAR e reserva legal, junto do recibo do CAR.</div>${pe}</article>`;
  document.body.classList.add('crq-laudo');
  msg('Montando o laudo…');

  const mapas = [];
  const limite = cq.limite ? aneis(cq).map(a => a.map(([x, y]) => [y, x])) : null;
  const espera = [];
  for (const q of quadros) {
    const div = el.querySelector(`[data-q="${q.k}"]`);
    const m = L.map(div, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25 });
    const tl = q.url
      ? L.tileLayer(q.url, { subdomains: ['wayback', 'wayback-a', 'wayback-b'], maxZoom: 21, maxNativeZoom: 18, crossOrigin: true })
      : L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 18, crossOrigin: true });
    espera.push(new Promise(ok => { tl.once('load', ok); setTimeout(ok, 9000); }));
    tl.addTo(m);
    if (limite) L.polygon(limite, { color: '#FFFFFF', weight: 1.5, dashArray: '6 5', fill: false, interactive: false }).addTo(m);
    const grupo = L.featureGroup(partes.map(f => L.polygon([f.c, ...(f.h || [])].map(a => a.map(([x, y]) => [y, x])), { color: '#3DFF6E', weight: 2.5, fillOpacity: 0.08, fillColor: '#3DFF6E', interactive: false }))).addTo(m);
    const alvo = partes.length ? grupo.getBounds() : limite ? L.polygon(limite).getBounds() : null;
    if (alvo) m.fitBounds(alvo, { padding: [8, 8] }); else m.setView([-19.4, -46.2], 13);
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 80 }).addTo(m);
    mapas.push(m);
  }
  await Promise.all(espera);
  msg('');
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.body.classList.remove('crq-laudo'); mapas.forEach(m => m.remove()); el.innerHTML = ''; }, 400);
  }, 400);
}

function imprimir() {
  document.body.classList.add('crq-imprimindo');
  S.mapa?.invalidateSize();
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.body.classList.remove('crq-imprimindo'); S.mapa?.invalidateSize(); }, 300);
  }, 500);
}

/* ---------- AN Digital (tela do menu Certificação › Registros) ---------- */
export const TELAS_AN_DIGITAL = ['anDigital'];
const CARTOES_AN = [
  ['AN 22', 'Croqui da propriedade', 'Mapa de satélite de cada fazenda: talhões, pivôs, sequeiro, pastos e áreas, com legenda e quadro de áreas.', 'mapa'],
  ['AN 08', 'CAR e reserva legal', 'Nº do CAR, área do imóvel, consolidada, vegetação, APP e reserva legal × mínimo de 20%.', 'folha'],
  ['AN 62', 'Outorgas — captações de água', 'Pontos de captação no mapa com portaria/certidão, vazão e validade (vermelho = vencida).', 'gota'],
];
export async function abrirAnDigital() {
  const el = $('telaAnDigital'); if (!el) return;
  el.innerHTML = `<div class="crq-an">
    <div class="crq-an-cab"><div><h2>AN Digital</h2><p class="dica">Anexos que abrem dentro do app. Toque num cartão para abrir o croqui no satélite.</p></div>
      <button class="btn principal" type="button" data-an-abrir>🛰 Abrir croqui no satélite</button></div>
    <div class="crq-an-cards">${CARTOES_AN.map(([c, n, d]) => `<button type="button" class="crq-an-card" data-an-abrir>
      <span class="crq-an-cod">${c}</span><b>${esc(n)}</b><span>${esc(d)}</span></button>`).join('')}</div>
    <h3 class="crq-sub" style="margin-top:22px">Resumo por fazenda</h3>
    <div id="crqAnResumo"><p class="dica">Carregando…</p></div></div>`;
  el.querySelectorAll('[data-an-abrir]').forEach(b => b.addEventListener('click', () => abrirCroqui()));
  try {
    await carregar();
    const n = v => { const x = Number(String(v ?? '').replace(',', '.')); return v != null && v !== '' && isFinite(x) ? x : null; };
    const linhas = S.lista.map(cq => {
      const rv = cq.reserva || {}; const T = totais(cq);
      const area = n(rv.car_area_ha) ?? (T.total || null), rl = n(rv.rl_car_ha);
      const p = rl != null && area ? rl / area * 100 : null;
      const pts = cq.pontos || [], venc = pts.filter(x => x.venc && x.venc < hojeIso()).length;
      return `<tr data-faz="${cq.fazenda_id}"><td><b>${esc(cq.fazenda)}</b></td><td>${ha(area)}${n(rv.car_area_ha) == null && area ? '<br><small class="dica">desenho</small>' : ''}</td>
        <td class="${p == null ? '' : p >= RL_MIN - 0.005 ? 'crq-ok' : 'crq-venc'}">${rl != null ? ha(rl) + ' · ' + pct(p) : '—'}</td>
        <td>${rv.car ? '✔' : '<span class="crq-venc">sem CAR</span>'}</td>
        <td>${(cq.feicoes || []).length ? (cq.feicoes || []).length + ' áreas' : '<span class="dica">não importado</span>'}</td>
        <td>${pts.length}${venc ? ` · <span class="crq-venc">${venc} vencida${venc > 1 ? 's' : ''}</span>` : ''}</td></tr>`;
    }).join('');
    $('crqAnResumo').innerHTML = S.lista.length ? `<div style="overflow-x:auto"><table class="crq-tab crq-an-tab"><thead><tr><th>Fazenda</th><th>Área</th><th>Reserva legal</th><th>CAR</th><th>Desenho</th><th>Captações</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="crq-nota">Toque numa fazenda para abrir o croqui dela. Mínimo de reserva legal: ${RL_MIN}% (Lei 12.651/2012, art. 12, II).</p>`
      : '<p class="dica">Nenhum dado ainda.</p>';
    $('crqAnResumo').querySelectorAll('[data-faz]').forEach(tr => tr.addEventListener('click', () => abrirCroqui(tr.dataset.faz)));
  } catch (e) {
    $('crqAnResumo').innerHTML = `<p class="dica">${esc(e.message || e)}</p>`;
  }
}

export function limparCroqui() { fechar(); S = { lista: [], atual: null, mapa: S.mapa, base: S.base, camadas: S.camadas, rotulos: true, ocultos: new Set(), sel: null, marcando: false, tempo: S.tempo }; }
