// mapa.js — Contagem › Mapa do barracão (21/10/2026, pedido do Guilherme).
//
// Na contagem dos fertilizantes, quem conta marca em qual quadra está cada
// produto e quantos bags tem ali (est_contagem_quadras). Esta tela desenha o
// barracão com a ocupação de cada quadra, a lista "onde está cada
// fertilizante", uma vista 3D (bags em pilhas de 3) e a folha A4 deitada.
// O desenho do barracão vem de est_mapas.layout (quadras, áreas reservadas,
// muros e pilares, tudo em metros, frente à esquerda).
import {
  $, esc, pronto, todos, aviso, souAdmin, gravar, locais as todosLocais, podeLocal, mesAtual, nomeMes, contagem,
  mapaDoLocal, quadrasDe, capacidadeQuadra, pesoBag, mostrarNumero, lerNumero, dataHora,
} from './dados.js';
/* Só os estoques liberados para esta pessoa (22/10/2026). */
const locais = () => todosLocais().filter(l => podeLocal(l.id));

const CHAVE = 'estoque.mapaLocal';
const sel = { localId: null, mes: mesAtual() };
try { sel.localId = localStorage.getItem(CHAVE); } catch { /* sem localStorage */ }
let modo = 'planta';        // 'planta' | '3d'
let destaque = '';          // item_id destacado no desenho
let busca = '';
let aberta = false;

/* Cores dos produtos: as da marca primeiro, depois tons que não confundem. Sem preto. */
const PALETA = ['#84BD00', '#744F28', '#2A8FA6', '#E39B00', '#7F77DD', '#D85A30', '#1D9E75',
  '#D4537E', '#9C9A92', '#5B8C2A', '#B07A3C', '#3E6FB0', '#C9A227', '#8E5BA8'];

const comMapa = () => locais().filter(l => mapaDoLocal(l.id));

/** A contagem que o mapa mostra: a do mês escolhido; sem ela, a última antes dele com quadras. */
function contagemDoMapa(localId, mes) {
  const c = contagem(localId, mes);
  if (c && quadrasDe(c.id).length) return { c, outra: false };
  const anteriores = todos('est_contagens')
    .filter(x => x.local_id === localId && x.mes <= mes && quadrasDe(x.id).length)
    .sort((a, b) => b.mes.localeCompare(a.mes));
  if (anteriores[0]) return { c: anteriores[0], outra: anteriores[0].mes !== mes };
  return { c, outra: false };
}

/** Ocupação: por quadra e por produto. */
function ocupacao(mapa, c) {
  const itens = new Map(todos('est_itens').map(i => [i.id, i]));
  const porQuadra = new Map(mapa.layout.quadras.map(q => [q.codigo, {
    q, cap: capacidadeQuadra(q, mapa.layout), bags: 0, itens: [],
  }]));
  const porItem = new Map();
  for (const l of (c ? quadrasDe(c.id) : [])) {
    const bags = Number(l.bags) || 0;
    if (!bags) continue;
    const item = itens.get(l.item_id) || { id: l.item_id, nome: '(item apagado)' };
    const pq = porQuadra.get(l.quadra);
    if (pq) { pq.bags += bags; pq.itens.push({ item, bags }); }
    if (!porItem.has(item.id)) porItem.set(item.id, { item, bags: 0, quadras: [] });
    const pi = porItem.get(item.id);
    pi.bags += bags;
    pi.quadras.push({ codigo: l.quadra, bags });
  }
  const produtos = [...porItem.values()].sort((a, b) => String(a.item.nome).localeCompare(String(b.item.nome), 'pt-BR'));
  const cores = new Map(produtos.map((p, k) => [p.item.id, PALETA[k % PALETA.length]]));
  for (const pq of porQuadra.values()) pq.itens.sort((a, b) => b.bags - a.bags);
  const cap = [...porQuadra.values()].reduce((t, x) => t + x.cap, 0);
  const ocup = [...porQuadra.values()].reduce((t, x) => t + x.bags, 0);
  return { porQuadra, produtos, cores, cap, ocup };
}

const curto = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** A planta em SVG (metros), frente à esquerda. Serve para a tela e para a folha. */
function svgPlanta(mapa, oc, opc = {}) {
  const L = mapa.layout, W = Number(L.comprimento), H = Number(L.largura);
  const m = 2.6;
  const partes = [];
  partes.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FBFBF8" stroke="#51534A" stroke-width=".18" rx=".2"/>`);
  for (const a of L.areas || []) {
    if (a.tipo === 'corredor') {
      partes.push(`<rect x="${a.x + .15}" y="${a.y + .15}" width="${a.l - .3}" height="${a.p - .3}" fill="none" stroke="#9C9A92" stroke-width=".1" stroke-dasharray=".5 .4" rx=".2"/>
        <text x="${a.x + a.l / 2}" y="${a.y + a.p / 2}" class="mp-t2">${esc(a.nome)}</text>`);
    } else {
      partes.push(`<rect x="${a.x + .15}" y="${a.y + .15}" width="${a.l - .3}" height="${a.p - .3}" fill="#EEEDE7" stroke="#C9C7BE" stroke-width=".08" rx=".25"/>
        <text x="${a.x + a.l / 2}" y="${a.y + a.p / 2 - (a.obs ? .45 : 0)}" class="mp-t1">${esc(a.nome)}</text>
        ${a.obs ? `<text x="${a.x + a.l / 2}" y="${a.y + a.p / 2 + .65}" class="mp-t3">${esc(a.obs)}</text>` : ''}`);
    }
  }
  for (const y of L.muros || []) partes.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#51534A" stroke-width=".28"/>`);
  for (const pq of oc.porQuadra.values()) {
    const q = pq.q, x = q.x + .15, y = q.y + .15, w = q.l - .3, h = q.p - .3;
    const frac = pq.cap ? Math.min(1, pq.bags / pq.cap) : 0;
    const passou = pq.cap && pq.bags > pq.cap;
    const temDestaque = destaque && pq.itens.some(i => i.item.id === destaque);
    // faixas por produto, enchendo de lado (da esquerda para a direita, coluna
    // por coluna, como os bags entram na quadra — pedido dele, 21/10/2026),
    // na proporção da capacidade
    let xx = x;
    const faixas = pq.itens.map(i => {
      const ww = pq.cap ? Math.min(w * Math.min(1, i.bags / pq.cap), x + w - xx) : 0;
      const op = destaque && i.item.id !== destaque ? .25 : .55;
      const r = `<rect x="${xx}" y="${y}" width="${Math.max(0, ww)}" height="${h}" fill="${oc.cores.get(i.item.id)}" opacity="${op}"/>`;
      xx += Math.max(0, ww);
      return r;
    }).join('');
    const nomes = pq.itens.slice(0, 2).map((i, k) => `<text x="${x + w / 2}" y="${y + 2.55 + k * .78}" class="mp-t3">${esc(curto(i.item.nome, 16))} · ${esc(mostrarNumero(i.bags))}</text>`).join('')
      + (pq.itens.length > 2 ? `<text x="${x + w / 2}" y="${y + 2.55 + 2 * .78}" class="mp-t3">+ ${pq.itens.length - 2} produto(s)</text>` : '');
    partes.push(`<g class="mp-q" data-q="${esc(q.codigo)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F3F8E8" rx=".25"/>
      ${faixas}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${passou ? '#C0392B' : temDestaque ? '#744F28' : '#84BD00'}" stroke-width="${temDestaque || passou ? .22 : .12}" rx=".25"/>
      <text x="${x + w / 2}" y="${y + 1.0}" class="mp-t1">${esc(q.codigo)}</text>
      <text x="${x + w / 2}" y="${y + 1.8}" class="mp-t2${passou ? ' mp-passou' : ''}">${esc(mostrarNumero(pq.bags))}/${pq.cap} bags${frac >= 1 && !passou ? ' · cheia' : ''}</text>
      ${nomes}
    </g>`);
  }
  for (const [px, py] of L.pilares || []) partes.push(`<rect x="${px - .2}" y="${py - .2}" width=".4" height=".4" fill="#744F28"/>`);
  const ladoE = L.frente === 'direita' ? 'Fundos' : 'Frente', ladoD = L.frente === 'direita' ? 'Frente' : 'Fundos';
  partes.push(`<text x="${-m / 2}" y="${H / 2}" class="mp-t2" transform="rotate(-90 ${-m / 2} ${H / 2})">${ladoE}</text>
    <text x="${W + m / 2}" y="${H / 2}" class="mp-t2" transform="rotate(90 ${W + m / 2} ${H / 2})">${ladoD}</text>`);
  return `<svg class="mp-svg${opc.impressao ? ' imp' : ''}" viewBox="${-m} -0.8 ${W + 2 * m} ${H + 1.6}" xmlns="http://www.w3.org/2000/svg" role="img"
    aria-label="Planta do barracão com a ocupação de cada quadra">
    <style>.mp-t1{font:700 .85px Arial,sans-serif;fill:#51534A;text-anchor:middle;dominant-baseline:middle}
    .mp-t2{font:400 .62px Arial,sans-serif;fill:#51534A;text-anchor:middle;dominant-baseline:middle}
    .mp-t3{font:400 .5px Arial,sans-serif;fill:#51534A;text-anchor:middle;dominant-baseline:middle}
    .mp-passou{fill:#C0392B;font-weight:700}</style>
    ${partes.join('')}</svg>`;
}

function legenda(oc) {
  if (!oc.produtos.length) return '';
  return `<div class="mp-leg">${oc.produtos.map(p => `<button type="button" class="mp-chip${destaque === p.item.id ? ' on' : ''}" data-dest="${esc(p.item.id)}">
    <i style="background:${oc.cores.get(p.item.id)}"></i>${esc(p.item.nome)} <small>${esc(mostrarNumero(p.bags))}</small></button>`).join('')}</div>`;
}

function tabelaProdutos(oc, mapa) {
  const b = semAcento(busca);
  const lin = oc.produtos.filter(p => !b || semAcento(p.item.nome).includes(b));
  if (!oc.produtos.length) return '<div class="vazio">Nenhum fertilizante com quadra marcada nesta contagem. Na <strong>Contagem › Contar</strong>, abra o <strong>+</strong> do fertilizante e marque a quadra e os bags.</div>';
  return `<table class="mp-tab"><thead><tr><th>Fertilizante</th><th>Onde está</th><th class="nu">Bags</th><th class="nu">Kg</th></tr></thead>
    <tbody>${lin.map(p => `<tr data-dest="${esc(p.item.id)}"${destaque === p.item.id ? ' class="on"' : ''}>
      <td><i class="mp-cor" style="background:${oc.cores.get(p.item.id)}"></i>${esc(p.item.nome)}</td>
      <td>${p.quadras.sort((a, c) => a.codigo.localeCompare(c.codigo, 'pt-BR', { numeric: true })).map(q => `<b>${esc(q.codigo)}</b> ${esc(mostrarNumero(q.bags))}`).join(' · ')}</td>
      <td class="nu">${esc(mostrarNumero(p.bags))}</td><td class="nu">${esc(mostrarNumero(p.bags * pesoBag(mapa.layout)))}</td></tr>`).join('')
      || '<tr><td colspan="4" class="dc-sem">Nenhum fertilizante com esse nome.</td></tr>'}</tbody></table>`;
}

function tabelaQuadras(oc) {
  return `<table class="mp-tab"><thead><tr><th>Quadra</th><th class="nu">Ocupado</th><th class="nu">Livre</th><th>Produtos</th></tr></thead>
    <tbody>${[...oc.porQuadra.values()].map(pq => `<tr${pq.bags > pq.cap ? ' class="passou"' : ''}><td><b>${esc(pq.q.codigo)}</b></td>
      <td class="nu">${esc(mostrarNumero(pq.bags))} / ${pq.cap}</td><td class="nu">${esc(mostrarNumero(Math.max(0, pq.cap - pq.bags)))}</td>
      <td>${pq.itens.map(i => esc(i.item.nome) + ' (' + esc(mostrarNumero(i.bags)) + ')').join(', ') || '<span class="dc-sem">vazia</span>'}</td></tr>`).join('')}</tbody></table>`;
}

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

export function desenharMapa() {
  aberta = true;
  const alvo = $('mpCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  const ls = comMapa();
  if (!ls.length) {
    alvo.innerHTML = '<div class="cartao"><h2>Mapa do barracão</h2><div class="vazio">Nenhum estoque tem mapa cadastrado ainda.</div></div>';
    return;
  }
  if (!ls.some(l => l.id === sel.localId)) sel.localId = ls[0].id;
  const mapa = mapaDoLocal(sel.localId);
  const { c, outra } = contagemDoMapa(sel.localId, sel.mes);
  const oc = ocupacao(mapa, c);
  const pct = oc.cap ? Math.round(100 * oc.ocup / oc.cap) : 0;
  const local = ls.find(l => l.id === sel.localId);
  const situ = !c ? 'sem contagem neste mês'
    : `contagem de ${nomeMes(c.mes)} · ${c.status === 'fechada' ? 'fechada em ' + dataHora(c.fechada_em) : 'em andamento'}`;

  alvo.innerHTML = `<div class="cartao naoimprimir">
    <h2>Mapa do barracão</h2>
    <p class="dica">Onde está cada fertilizante, quadra por quadra, pela contagem do mês. A quadra e os bags são marcados na
      <strong>Contagem › Contar</strong>, no <strong>+</strong> de cada fertilizante.</p>
    <div class="grade">
      <label class="campo">Estoque <select id="mpLocal">${ls.map(l => `<option value="${esc(l.id)}"${l.id === sel.localId ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo">Mês <input type="month" id="mpMes" value="${esc(sel.mes)}" max="${mesAtual()}"></label>
    </div>
  </div>
  <div class="cartao">
    <div class="ct-topo">
      <div><h2>${esc(mapa.nome || 'Barracão')} · ${esc(local.nome)}</h2>
        <div class="ct-estado"><small>${esc(situ)}${outra ? ' (último mês com quadras marcadas)' : ''}</small></div></div>
      <div class="mp-botoes naoimprimir">
        <button class="btn mini${modo === 'planta' ? ' principal' : ''}" type="button" data-modo="planta">Planta</button>
        <button class="btn mini${modo === '3d' ? ' principal' : ''}" type="button" data-modo="3d">3D</button>
        <button class="btn mini" type="button" id="mpImprimir">Imprimir</button>
        ${souAdmin() ? '<button class="btn mini" type="button" id="mpAjustar">Ajustar medidas</button>' : ''}
      </div>
    </div>
    <div class="mp-kpis">
      <div><span>Capacidade</span><b>${esc(mostrarNumero(oc.cap))}</b><small>bags · pilha de ${esc(mostrarNumero(mapa.layout.altura_pilha || 3))}</small></div>
      <div><span>Ocupado</span><b>${esc(mostrarNumero(oc.ocup))}</b><small>${esc(mostrarNumero(oc.ocup * pesoBag(mapa.layout) / 1000))} t</small></div>
      <div><span>Livre</span><b>${esc(mostrarNumero(Math.max(0, oc.cap - oc.ocup)))}</b><small>bags</small></div>
      <div><span>Ocupação</span><b>${pct}%</b><small>${oc.produtos.length} produto(s)</small></div>
    </div>
    <div id="mpDesenho" class="mp-desenho">${modo === 'planta' ? svgPlanta(mapa, oc) : '<div class="mp-3d" id="mp3d"><div class="vazio">Abrindo o 3D…</div></div>'}</div>
    ${legenda(oc)}
    <h3 class="es-secao">Onde está cada fertilizante</h3>
    <label class="campo naoimprimir" style="max-width:340px">Procurar fertilizante
      <input type="text" class="mp-sel" id="mpBusca" value="${esc(busca)}" placeholder="Digite parte do nome..."></label>
    <div id="mpProdutos">${tabelaProdutos(oc, mapa)}</div>
    <h3 class="es-secao">Quadras</h3>
    ${tabelaQuadras(oc)}
  </div>`;

  $('mpLocal').addEventListener('change', e => {
    sel.localId = e.target.value;
    try { localStorage.setItem(CHAVE, sel.localId); } catch { /* sem localStorage */ }
    desenharMapa();
  });
  $('mpMes').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { sel.mes = e.target.value; desenharMapa(); } });
  alvo.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => { modo = b.dataset.modo; pararCena(); desenharMapa(); }));
  alvo.querySelectorAll('[data-dest]').forEach(b => b.addEventListener('click', () => {
    destaque = destaque === b.dataset.dest ? '' : b.dataset.dest;
    pararCena(); desenharMapa();
  }));
  $('mpBusca').addEventListener('input', e => {
    busca = e.target.value;
    $('mpProdutos').innerHTML = tabelaProdutos(oc, mapa);
    $('mpProdutos').querySelectorAll('[data-dest]').forEach(b => b.addEventListener('click', () => {
      destaque = destaque === b.dataset.dest ? '' : b.dataset.dest; pararCena(); desenharMapa();
    }));
  });
  $('mpImprimir').addEventListener('click', () => { montarFolha(mapa, oc, local, situ); setTimeout(() => window.print(), 80); });
  $('mpAjustar')?.addEventListener('click', () => ajustar(mapa));
  if (modo === '3d') abrir3D(mapa, oc);
}

/* ---------------- folha A4 deitada, padrão SAKUMA ---------------- */
function montarFolha(mapa, oc, local, situ) {
  $('mpFolha').innerHTML = `<div class="folha rel mp-folha">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Mapa do Barracão — ${esc(local.nome)}</h1>
        <p>${esc(mapa.nome || '')} · ${esc(situ)} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p>
      </div>
    </div>
    <div class="rel-kpis" style="grid-template-columns:repeat(4,1fr)">
      <div><span>Capacidade</span><b>${esc(mostrarNumero(oc.cap))} bags</b></div>
      <div><span>Ocupado</span><b>${esc(mostrarNumero(oc.ocup))} bags</b></div>
      <div><span>Livre</span><b>${esc(mostrarNumero(Math.max(0, oc.cap - oc.ocup)))} bags</b></div>
      <div><span>Ocupação</span><b>${oc.cap ? Math.round(100 * oc.ocup / oc.cap) : 0}%</b></div>
    </div>
    <div class="mp-folha-planta">${svgPlanta(mapa, oc, { impressao: true })}</div>
    <h3 class="rel-secao">Onde está cada fertilizante</h3>
    <table class="rel-tab"><thead><tr><th>Fertilizante</th><th>Quadras (bags)</th><th class="ce">Bags</th><th class="ce">Kg</th></tr></thead>
      <tbody>${oc.produtos.map(p => `<tr><td>${esc(p.item.nome)}</td><td>${p.quadras.map(q => esc(q.codigo) + ' (' + esc(mostrarNumero(q.bags)) + ')').join(' · ')}</td>
        <td class="ce">${esc(mostrarNumero(p.bags))}</td><td class="ce">${esc(mostrarNumero(p.bags * pesoBag(mapa.layout)))}</td></tr>`).join('')
        || '<tr><td colspan="4">Nenhuma quadra marcada.</td></tr>'}</tbody></table>
    <div class="rel-pe"><span></span><img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ---------------- ajustar medidas (admin) ---------------- */
function ajustar(mapa) {
  const L = mapa.layout;
  window.abrirModal('Ajustar medidas do mapa', `
    <p class="dc-sem">A capacidade de cada quadra = bags na largura × bags no fundo × altura da pilha.
      A largura desconta a folga do pilar. Para fixar a capacidade de uma quadra, digite no campo dela (vazio = calculada).</p>
    <div class="grade">
      <label class="campo">Medida do bag no chão (m)<input id="ajMed" inputmode="decimal" value="${esc(mostrarNumero(L.medida_bag))}"></label>
      <label class="campo">Folga do pilar (m)<input id="ajFol" inputmode="decimal" value="${esc(mostrarNumero(L.folga))}"></label>
      <label class="campo">Altura da pilha (bags)<input id="ajAlt" inputmode="decimal" value="${esc(mostrarNumero(L.altura_pilha))}"></label>
      <label class="campo">Peso do bag (kg)<input id="ajPeso" inputmode="decimal" value="${esc(mostrarNumero(L.peso_bag_kg))}"></label>
    </div>
    <table class="mp-tab"><thead><tr><th>Quadra</th><th class="nu">Largura (m)</th><th class="nu">Fundo (m)</th><th class="nu">Capacidade fixa</th></tr></thead>
      <tbody>${L.quadras.map((q, k) => `<tr><td><b>${esc(q.codigo)}</b></td>
        <td class="nu"><input class="aj-l" data-k="${k}" inputmode="decimal" value="${esc(mostrarNumero(q.l))}"></td>
        <td class="nu"><input class="aj-p" data-k="${k}" inputmode="decimal" value="${esc(mostrarNumero(q.p))}"></td>
        <td class="nu"><input class="aj-c" data-k="${k}" inputmode="decimal" value="${esc(q.capacidade == null ? '' : mostrarNumero(q.capacidade))}" placeholder="${capacidadeQuadra(Object.assign({}, q, { capacidade: null }), L)}"></td></tr>`).join('')}</tbody></table>
    <div class="barra fim">
      <button class="btn" type="button" id="ajVoltar">Voltar</button>
      <button class="btn principal" type="button" id="ajSalvar">Salvar</button>
    </div>`, corpo => {
    corpo.querySelector('#ajVoltar').onclick = window.fecharModal;
    corpo.querySelector('#ajSalvar').onclick = async () => {
      const num = (v, padrao) => { const n = lerNumero(v); return n === null || Number.isNaN(n) ? padrao : n; };
      const novo = JSON.parse(JSON.stringify(L));
      novo.medida_bag = num(corpo.querySelector('#ajMed').value, L.medida_bag);
      novo.folga = num(corpo.querySelector('#ajFol').value, L.folga);
      novo.altura_pilha = num(corpo.querySelector('#ajAlt').value, L.altura_pilha);
      novo.peso_bag_kg = num(corpo.querySelector('#ajPeso').value, L.peso_bag_kg);
      corpo.querySelectorAll('.aj-l').forEach(i => { novo.quadras[i.dataset.k].l = num(i.value, novo.quadras[i.dataset.k].l); });
      corpo.querySelectorAll('.aj-p').forEach(i => { novo.quadras[i.dataset.k].p = num(i.value, novo.quadras[i.dataset.k].p); });
      corpo.querySelectorAll('.aj-c').forEach(i => {
        const n = lerNumero(i.value);
        if (n === null || Number.isNaN(n)) delete novo.quadras[i.dataset.k].capacidade;
        else novo.quadras[i.dataset.k].capacidade = n;
      });
      try {
        await gravar('est_mapas', Object.assign({}, mapa, { layout: novo }));
        window.fecharModal();
        aviso('Medidas do mapa salvas.');
        desenharMapa();
      } catch (e) { aviso('Não consegui salvar (' + (e.message || e) + ').', true); }
    };
  });
}

/* ---------------- 3D (three.js guardado em ../vendor, abre sem internet) ---------------- */
let cena = null;
const carregar = src => new Promise((ok, erro) => {
  if (document.querySelector(`script[data-src="${src}"]`)) { ok(); return; }
  const s = document.createElement('script');
  s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = () => erro(new Error('não carregou ' + src));
  document.head.appendChild(s);
});

function pararCena() {
  if (!cena) return;
  cancelAnimationFrame(cena.raf);
  try { cena.render.dispose(); cena.ctl.dispose(); } catch { /* já liberado */ }
  window.removeEventListener('resize', cena.redim);
  cena = null;
}

export function soltarMapa() { aberta = false; pararCena(); }

async function abrir3D(mapa, oc) {
  const caixa = $('mp3d');
  try {
    if (!window.THREE) await carregar('../vendor/three.min.js?v=128');
    if (!window.THREE.OrbitControls) await carregar('../vendor/three-orbit.js?v=128');
  } catch (e) {
    caixa.innerHTML = '<div class="vazio">Não consegui abrir o 3D neste aparelho. Use a planta.</div>';
    return;
  }
  if (!aberta || modo !== '3d' || !document.body.contains(caixa)) return;
  pararCena();
  const T = window.THREE, L = mapa.layout, W = Number(L.comprimento), H = Number(L.largura);
  caixa.innerHTML = '';
  const larg = caixa.clientWidth || 800, alt = Math.max(360, Math.min(560, Math.round(larg * .62)));
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(40, larg / alt, .5, 500);
  cam.position.set(W / 2, 46, H + 34);
  const render = new T.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  render.setSize(larg, alt);
  caixa.appendChild(render.domElement);
  const ctl = new T.OrbitControls(cam, render.domElement);
  ctl.target.set(W / 2, 0, H / 2 - 1); ctl.maxPolarAngle = 1.45; ctl.enableDamping = true; ctl.update();
  scene.add(new T.HemisphereLight(0xffffff, 0x8a6b4a, .85));
  const sol = new T.DirectionalLight(0xffffff, .6); sol.position.set(-20, 40, 30); scene.add(sol);
  const caixaM = (w, h, d, x, y, z, cor) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ color: cor }));
    m.position.set(x + w / 2, y + h / 2, z + d / 2); scene.add(m); return m;
  };
  const rotulo = (txt, x, y, z, w = 4.6) => {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(4, 8, 392, 80);
    g.fillStyle = '#51534A'; g.font = 'bold 36px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 200, 50);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false }));
    s.scale.set(w, w * .24, 1); s.position.set(x, y, z); scene.add(s);
  };
  caixaM(W + 10, .02, H + 10, -5, -.04, -5, 0xB98B5E);
  caixaM(W, .03, H, 0, 0, 0, 0xCDB08A);
  for (const a of L.areas || []) {
    caixaM(a.l, .05, a.p, a.x, 0, a.y, a.tipo === 'corredor' ? 0xDCC6A2 : 0xC2BCB0);
    if (a.tipo !== 'corredor') rotulo(a.nome, a.x + a.l / 2, 2.2, a.y + a.p / 2, Math.min(7, a.l * .5));
  }
  for (const y of L.muros || []) caixaM(W, 2.2, .2, 0, 0, y - .1, 0xBDBAB2);
  for (const [px, py] of L.pilares || []) caixaM(.3, 6.5, .3, px - .15, 0, py - .15, 0x8A4B2A);
  // bags: cada quadra enche as posições do canto do muro para o corredor, produto por produto
  const med = Number(L.medida_bag) || 1.2, fol = Number(L.folga) || 0, hp = Number(L.altura_pilha) || 3;
  let total = 0;
  for (const pq of oc.porQuadra.values()) total += pq.bags;
  const inst = new T.InstancedMesh(new T.BoxGeometry(med * .9, .95, med * .9), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, Math.ceil(total)));
  const d = new T.Object3D(), cor = new T.Color();
  let k = 0;
  for (const pq of oc.porQuadra.values()) {
    const q = pq.q;
    const nl = Math.max(1, Math.floor((q.l - fol) / med + 1e-9)), np = Math.max(1, Math.floor(q.p / med + 1e-9));
    const x0 = q.x + (q.l - nl * med) / 2, z0 = q.y + (q.p - np * med) / 2;
    let pos = 0;
    for (const it of pq.itens) {
      const c = it.item.id === destaque || !destaque ? oc.cores.get(it.item.id) : '#E4E2DA';
      for (let b = 0; b < Math.round(it.bags); b++, pos++) {
        const chao = Math.floor(pos / hp), nivel = pos % hp;
        const j = chao % np, i = Math.floor(chao / np) % nl;   // enche de lado: coluna inteira (muro → corredor) e passa para a próxima
        d.position.set(x0 + med / 2 + i * med, .48 + nivel * .97, z0 + med / 2 + j * med);
        d.updateMatrix(); inst.setMatrixAt(k, d.matrix); inst.setColorAt(k, cor.set(c)); k++;
      }
    }
    rotulo(`${q.codigo} · ${mostrarNumero(pq.bags)}/${pq.cap}`, q.x + q.l / 2, 4.4, q.y + q.p / 2, 4.4);
  }
  inst.count = k;
  scene.add(inst);
  rotulo(L.frente === 'direita' ? 'Fundos' : 'Frente', -2.5, 6.5, H / 2, 3.2);
  rotulo(L.frente === 'direita' ? 'Frente' : 'Fundos', W + 2.5, 6.5, H / 2, 3.2);
  const redim = () => {
    const w = caixa.clientWidth || larg, h = Math.max(360, Math.min(560, Math.round(w * .62)));
    cam.aspect = w / h; cam.updateProjectionMatrix(); render.setSize(w, h);
  };
  window.addEventListener('resize', redim);
  cena = { render, ctl, redim, raf: 0 };
  const laco = () => { if (!cena) return; cena.raf = requestAnimationFrame(laco); ctl.update(); render.render(scene, cam); };
  laco();
}
