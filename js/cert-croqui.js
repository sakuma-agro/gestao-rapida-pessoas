// cert-croqui.js — Certificação › AN 21 Croqui da propriedade, no satélite (30/10/2026).
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
  ['Outros', '#B0B0B0', '#FFFFFF'],
];
const COR = Object.fromEntries(GRUPOS.map(g => [g[0], { fill: g[1], line: g[2] }]));

let S = { lista: [], atual: null, mapa: null, camadas: {}, rotulos: true, ocultos: new Set(), sel: null };

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
    out.push({ fazenda_id: faz.id, fazenda: faz.nome, limite: limite ? limite.c : null,
      area_total: limite ? Math.round(areaHa(limite.c) * 100) / 100 : null, feicoes });
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
      <div class="crq-tit"><b>Croqui das propriedades</b><span>AN 21 · satélite</span></div>
      <nav class="crq-faz" id="crqFaz"></nav>
      <div class="crq-acoes">
        <label class="crq-chk"><input type="checkbox" id="crqRot" checked> Nomes</label>
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
  $('crqImp').addEventListener('change', importar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.fullscreenElement && $('crqOverlay') && !$('crqOverlay').hidden) fechar(); });
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
  $('crqPainel').innerHTML = '<p class="dica">Carregando…</p>';
  try {
    const [L] = await Promise.all([carregarLeaflet(), carregar()]);
    if (!S.mapa) {
      S.mapa = L.map('crqMapa', { zoomControl: true, attributionControl: true, preferCanvas: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagem © Esri, Maxar, Earthstar Geographics', crossOrigin: true,
      }).addTo(S.mapa);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(S.mapa);
      S.mapa.on('zoomend', zoomRotulos);
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
  if (document.fullscreenElement) document.exitFullscreen?.();
  const ov = $('crqOverlay'); if (ov) ov.hidden = true;
  document.body.classList.remove('crq-aberto');
}

function abas() {
  $('crqFaz').innerHTML = S.lista.map(c => `<button type="button" class="${c === S.atual ? 'on' : ''}" data-faz="${c.fazenda_id}">${esc(c.fazenda)}</button>`).join('');
  $('crqFaz').querySelectorAll('[data-faz]').forEach(b => b.addEventListener('click', () => {
    S.atual = S.lista.find(c => c.fazenda_id === b.dataset.faz); S.sel = null; abas(); desenhar(true); painel();
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
  const ordem = ['Vegetação nativa', 'Pivô', 'Pasto', 'Sequeiro', 'Reserva', 'Reserva legal (CAR)', 'APP', 'Servidão', 'Café', 'Abacate Margarida', 'Abacate Hass', 'Captação de água', 'Outros'];
  const feics = (cq.feicoes || []).map((f, i) => ({ ...f, i })).sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo));
  for (const f of feics) {
    if (S.ocultos.has(f.grupo)) continue;
    const cor = COR[f.grupo] || COR.Outros;
    const sel = S.sel === f.i;
    const pol = L.polygon([f.c, ...(f.h || [])].map(a => a.map(([x, y]) => [y, x])), {
      color: sel ? '#FFFFFF' : cor.line, weight: sel ? 4 : 2, fillColor: cor.fill, fillOpacity: f.grupo === 'Pivô' ? 0.28 : f.grupo === 'Vegetação nativa' ? 0.25 : 0.45, dashArray: f.fonte === 'CAR' ? '5 4' : null,
    }).addTo(S.mapa);
    pol.bindPopup(`<b>${esc(f.rot || f.nome)}</b><br>${esc(f.grupo)}${f.fonte === 'CAR' ? ' · do CAR' : ''}<br>${ha(f.ha)}${f.nome && f.nome !== f.rot ? `<br><span style="color:#777">${esc(f.nome)}</span>` : ''}`);
    pol.on('click', () => { S.sel = f.i; marcarLinha(); });
    if (S.rotulos) pol.bindTooltip(`${esc(f.rot || '')}<br><small>${ha(f.ha)}</small>`, { permanent: true, direction: 'center', className: 'crq-rot crq-rot-' + (f.ha < 2 ? 'p' : 'g') });
    S.camadas['f' + f.i] = pol; todas.push(pol);
  }
  if (!S.ocultos.has('__pontos')) (cq.pontos || []).forEach((p, k) => {
    if (!isFinite(p.lat) || !isFinite(p.lon)) return;
    const venc = p.venc && p.venc < hojeIso();
    const m = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#FFFFFF', weight: 2.5, fillColor: venc ? '#E53935' : '#0077FF', fillOpacity: 1 }).addTo(S.mapa);
    todas.push(m);
    m.bindPopup(`<b>💧 ${esc(p.nome)}</b>${p.tipo ? '<br>' + esc(p.tipo) : ''}${p.outorga ? '<br>Outorga: ' + esc(p.outorga) : ''}${p.vazao ? '<br>Vazão: ' + esc(p.vazao) : ''}${p.finalidade ? '<br>Finalidade: ' + esc(p.finalidade) : ''}${p.validade ? '<br>Validade: ' + esc(p.validade) + (venc ? ' <b style="color:#C62828">(vencida)</b>' : '') : ''}${p.curso ? '<br>' + esc(p.curso) : ''}<br><span style="color:#777">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>`);
    if (S.rotulos) m.bindTooltip('💧 ' + esc(p.nome), { permanent: true, direction: 'right', offset: [8, 0], className: 'crq-rot crq-rot-agua' });
    S.camadas['p' + k] = m;
  });
  if (enquadrar && todas.length) S.mapa.fitBounds((S.camadas.limite || L.featureGroup(todas)).getBounds(), { padding: [20, 20], maxZoom: 16 });
  zoomRotulos();
}

function painel() {
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
  const talhoes = todas.filter(f => !['Reserva', 'Reserva legal (CAR)', 'Vegetação nativa', 'APP', 'Servidão'].includes(f.grupo))
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
        <i style="background:${g[1]};border-color:${g[2]}"></i><span>${esc(g[0])}</span><b>${ha(T.t[g[0]])}</b></label>`).join('')}
      ${cq.limite ? '<div class="crq-leg-lim"><i></i><span>Limite da fazenda</span></div>' : ''}
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
      ${rv.fonte_car ? `<p class="crq-nota">Fonte: ${esc(rv.fonte_car)}</p>` : ''}` : '<p class="crq-alerta">Sem recibo do CAR desta fazenda na pasta AN 07.</p>'}
      ${rv.obs ? `<p class="crq-nota">${esc(rv.obs)}</p>` : ''}
      ${ambientais.length ? `<table class="crq-tab" style="margin-top:8px"><thead><tr><th>Área ambiental (CAR)</th><th>Área</th></tr></thead><tbody>
        ${ambientais.map(f => `<tr data-ir="${f.i}"><td>${esc(f.grupo)} ${esc(f.rot && f.rot !== f.grupo ? f.rot : '')}</td><td>${ha(f.ha)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${edita ? `<details class="crq-edit"><summary>Editar dados do CAR e da reserva</summary><div class="crq-rl-dados">
        ${[['car', 'Nº do CAR'], ['imovel_car', 'Imóvel no CAR'], ['municipio', 'Município'], ['data_cadastro', 'Cadastrado em'], ['mf', 'Módulos fiscais'], ['car_area_ha', 'Área total no CAR (ha)'], ['consolidada_ha', 'Área consolidada (ha)'], ['remanescente_ha', 'Remanescente de vegetação (ha)'], ['rl_car_ha', 'Reserva legal declarada (ha)'], ['app_ha', 'APP (ha)'], ['servidao_ha', 'Servidão (ha)'], ['averbacao', 'Matrículas / averbação'], ['situacao', 'Situação (ex.: ativo, analisado, compensação, PRA)'], ['obs', 'Observação']].map(([k, r]) =>
          `<label><span>${r}</span><input type="text" data-rv="${k}" value="${esc(rv[k] || '')}" maxlength="300"></label>`).join('')}
        <button class="btn mini principal" type="button" id="crqRvGravar">Gravar</button></div></details>` : ''}
      <p class="crq-nota">Lei 12.651/2012, art. 12, II: fora da Amazônia Legal, a reserva legal é de no mínimo ${RL_MIN}% da área do imóvel. Áreas do mapa calculadas dos desenhos (aproximadas); valem as do CAR.</p>
    </section>

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
    const m = S.camadas['p' + tr.dataset.ponto]; if (m) { S.mapa.setView(m.getLatLng(), 17); m.openPopup(); }
  }));
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
  if (l) { S.mapa.fitBounds(l.getBounds(), { padding: [60, 60], maxZoom: 17 }); l.openPopup(); }
  marcarLinha();
}
function marcarLinha() {
  $('crqPainel')?.querySelectorAll('[data-ir]').forEach(tr => tr.classList.toggle('sel', Number(tr.dataset.ir) === S.sel));
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
      const doCar = (ant?.feicoes || []).filter(f => f.fonte === 'CAR');
      const limCar = ant?.limite_fonte === 'CAR';
      return { fazenda_id: n.fazenda_id, fazenda: n.fazenda, feicoes: [...n.feicoes, ...doCar],
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

function imprimir() {
  document.body.classList.add('crq-imprimindo');
  S.mapa?.invalidateSize();
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.body.classList.remove('crq-imprimindo'); S.mapa?.invalidateSize(); }, 300);
  }, 500);
}

export function limparCroqui() { S = { lista: [], atual: null, mapa: S.mapa, camadas: S.camadas, rotulos: true, ocultos: new Set(), sel: null }; fechar(); }
