/* sinaletica.js — Certificação › Sinalética › Placas (29/10/2026).

   Pedido do Guilherme: "sobre a sinalética, C:\NUVEM\OneDrive\1 - ADM -
   PRINCIPAL\18 - Placas, segue onde tem as placas; quero que você faça
   aparecer as imagens das placas, para selecionar e imprimir".

   As placas da pasta viraram o catálogo sinaletica/placas.json (uma entrada
   por placa: título, categoria, tamanho em mm e nº de folhas), com a miniatura
   em sinaletica/t/<id>.jpg e o PDF original da placa em sinaletica/p/<id>.pdf
   (cada página dos PDFs/PowerPoints da pasta separada na sua placa; o mapa de
   acesso ao pronto-socorro ficou uma placa só, de 10 folhas). Ficaram de fora o
   que não é placa (rotina IMAS, adesivos do quadro, formulário de reclamação),
   repetidas, a página do PowerPoint que saiu quebrada e as que têm nome ou
   telefone de pessoa (telefones úteis, etiquetas "José de Oliveira") — o
   repositório é público.

   Na tela: categorias, busca, miniaturas para marcar; "Abrir para imprimir" /
   "Baixar PDF" junta as marcadas num PDF só com o pdf-lib (vendor/pdf-lib.min.js,
   carregado na hora). Cada placa sai numa folha A4, no tamanho original
   (centralizada, reduzida só se não couber) ou ampliada para ocupar a folha.

   Script comum (window.Sinaletica.desenhar(el)); o app principal chama ao abrir
   a tela siPlacas. Para acrescentar placas: rodar de novo o catálogo a partir
   da pasta (ver claude/cert-sinaletica.md no projeto). */
(function () {
  'use strict';

  const RAIZ = (function () {
    try { return new URL('..', document.currentScript.src).href; } catch (e) { return './'; }
  })();
  const PASTA = RAIZ + 'sinaletica/';

  let catalogo = null;
  async function carregar() {
    if (catalogo) return catalogo;
    const r = await fetch(PASTA + 'placas.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('não achei o catálogo das placas');
    catalogo = await r.json();
    return catalogo;
  }

  let libPromessa = null;
  function carregarPdfLib() {
    if (window.PDFLib) return Promise.resolve();
    if (libPromessa) return libPromessa;
    libPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = RAIZ + 'vendor/pdf-lib.min.js';
      s.onload = () => ok();
      s.onerror = () => { libPromessa = null; falha(new Error('O juntador de PDF não carregou. Abra o app com internet uma vez.')); };
      document.head.appendChild(s);
    });
    return libPromessa;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const semAcento = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function tamanho(p) {
    const [a, b] = [Math.min(p.larg, p.alt), Math.max(p.larg, p.alt)];
    const deitado = p.larg > p.alt;
    const perto = (x, y) => Math.abs(x - y) <= 3;
    if (perto(a, 210) && perto(b, 297)) return 'A4 ' + (deitado ? 'deitado' : 'em pé');
    if (perto(a, 148) && perto(b, 210)) return 'A5 ' + (deitado ? 'deitado' : 'em pé');
    const cm = v => (v / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return `${cm(p.larg)} × ${cm(p.alt)} cm`;
  }

  /* ---------------- PDF ---------------- */
  const A4 = [595.28, 841.89];
  async function montar(placas, copias, modo) {
    await carregarPdfLib();
    const { PDFDocument } = window.PDFLib;
    const saida = await PDFDocument.create();
    saida.setTitle('Placas — Sinalética'); saida.setAuthor('SAKUMA Agronegócios');
    for (const p of placas) {
      const bytes = await fetch(PASTA + 'p/' + p.id + '.pdf').then(r => { if (!r.ok) throw new Error('não abri a placa ' + p.titulo); return r.arrayBuffer(); });
      const origem = await PDFDocument.load(bytes);
      const paginas = await saida.embedPdf(origem, origem.getPageIndices());
      for (let c = 0; c < copias; c++) {
        for (const pg of paginas) {
          if (modo === 'arquivo') {   // como está no arquivo, sem folha A4 em volta
            const nova = saida.addPage([pg.width, pg.height]);
            nova.drawPage(pg, { x: 0, y: 0, width: pg.width, height: pg.height });
            continue;
          }
          const deitada = pg.width > pg.height;
          const [W, H] = deitada ? [A4[1], A4[0]] : A4;
          const marg = 14;   // ~5 mm
          const caber = Math.min((W - 2 * marg) / pg.width, (H - 2 * marg) / pg.height);
          const esc_ = modo === 'ampliar' ? caber : Math.min(1, caber);
          const w = pg.width * esc_, h = pg.height * esc_;
          const nova = saida.addPage([W, H]);
          nova.drawPage(pg, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
        }
      }
    }
    return saida.save();
  }

  async function entregar(placas, copias, modo, acao, botao) {
    const rot = botao.textContent;
    botao.disabled = true; botao.textContent = 'Preparando…';
    try {
      const bytes = await montar(placas, copias, modo);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (acao === 'abrir') {
        const j = window.open(url, '_blank');
        if (j) { setTimeout(() => URL.revokeObjectURL(url), 120000); return; }
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = (placas.length === 1 ? 'Placa_' + semAcento(placas[0].titulo).replace(/[^\w]+/g, '_') : 'Placas_Sinaletica') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      alert('Não consegui montar o PDF: ' + (e.message || e));
    } finally {
      botao.disabled = false; botao.textContent = rot;
    }
  }

  /* ---------------- tela ---------------- */
  function estilo() {
    if (document.getElementById('sgEstilo')) return;
    const s = document.createElement('style');
    s.id = 'sgEstilo';
    s.textContent = `
.sg-filtros{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}
.sg-chip{font:inherit;font-size:12.5px;border:1px solid #D5D8CC;background:#fff;color:#51534A;border-radius:999px;padding:5px 11px;cursor:pointer}
.sg-chip[aria-pressed="true"]{background:#84BD00;border-color:#84BD00;color:#fff;font-weight:600}
.sg-chip small{opacity:.75;margin-left:3px}
.sg-busca{width:100%;max-width:360px;margin-bottom:10px}
.sg-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.sg-card{position:relative;border:2px solid #E1E3DA;border-radius:10px;background:#fff;cursor:pointer;display:flex;flex-direction:column;overflow:hidden;transition:border-color .12s}
.sg-card:hover{border-color:#B9C99A}
.sg-card.marcada{border-color:#84BD00;box-shadow:0 0 0 2px #E3F0C4}
.sg-img{height:130px;display:flex;align-items:center;justify-content:center;background:#F4F5F0;padding:8px}
.sg-img img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 1px 3px rgba(0,0,0,.18);background:#fff}
.sg-info{padding:7px 9px 9px;font-size:12.5px;line-height:1.3;color:#3A3C35}
.sg-info small{display:block;color:#8A8C83;font-size:11px;margin-top:3px}
.sg-check{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:6px;border:2px solid #fff;background:rgba(81,83,74,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700}
.sg-card.marcada .sg-check{background:#84BD00}
.sg-ver{position:absolute;top:7px;right:7px;font-size:11px;background:rgba(255,255,255,.92);border:1px solid #D5D8CC;border-radius:6px;padding:2px 7px;color:#51534A;text-decoration:none}
.sg-cat-tit{grid-column:1/-1;margin:10px 0 0;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#744F28;display:flex;align-items:center;gap:10px}
.sg-cat-tit button{font:inherit;font-size:11.5px;text-transform:none;letter-spacing:0;background:none;border:0;color:#5E8A00;text-decoration:underline;cursor:pointer;padding:0}
.sg-barra{position:sticky;bottom:0;z-index:5;margin-top:14px;background:#fff;border:1px solid #E1E3DA;border-radius:12px;padding:10px 12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;box-shadow:0 -4px 14px rgba(0,0,0,.06)}
.sg-barra .sg-n{font-size:13.5px;color:#51534A;margin-right:auto}
.sg-barra .sg-n strong{color:#744F28}
.sg-barra label{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#51534A}
.sg-barra input[type=number]{width:60px}
.sg-vazio{padding:20px;text-align:center;color:#8A8C83}`;
    document.head.appendChild(s);
  }

  async function desenhar(el) {
    if (!el) return;
    estilo();
    el.innerHTML = '<div class="cartao"><p class="dica">Carregando as placas…</p></div>';
    let cat;
    try { cat = await carregar(); }
    catch (e) { el.innerHTML = `<div class="cartao"><p class="dica">Não consegui abrir as placas: ${esc(e.message || e)}. Abra com internet uma vez.</p></div>`; return; }

    const placas = cat.placas;
    const nomes = cat.categorias;
    const ordemCat = Object.keys(nomes);
    const marcadas = new Set();
    const filtro = { cat: '', busca: '' };

    el.innerHTML = `
<div class="cartao">
  <h2>Placas</h2>
  <p class="dica">As placas da pasta <strong>18 - Placas</strong>. Toque nas placas para marcar e depois em <strong>Abrir para imprimir</strong>: sai um PDF só, uma placa por folha A4. "Ver" abre a placa sozinha.</p>
  <div class="sg-filtros" data-filtros></div>
  <input class="sg-busca" type="search" placeholder="Procurar placa (ex.: EPI, lama, T.05)" data-busca>
  <div class="sg-grade" data-grade></div>
  <div class="sg-barra">
    <span class="sg-n" data-n></span>
    <label>Cópias <input type="number" min="1" max="20" value="1" data-copias></label>
    <label>Tamanho
      <select data-modo>
        <option value="original">Original, numa folha A4</option>
        <option value="ampliar">Ampliar para ocupar a A4</option>
        <option value="arquivo">Como está no arquivo</option>
      </select></label>
    <button type="button" class="btn" data-limpar>Limpar</button>
    <button type="button" class="btn" data-acao="baixar">Baixar PDF</button>
    <button type="button" class="btn principal" data-acao="abrir">Abrir para imprimir</button>
  </div>
</div>`;

    const $ = s => el.querySelector(s);
    const contar = c => placas.filter(p => !c || p.cat === c).length;

    function desenharFiltros() {
      $('[data-filtros]').innerHTML =
        `<button type="button" class="sg-chip" data-cat="" aria-pressed="${!filtro.cat}">Todas<small>${placas.length}</small></button>` +
        ordemCat.map(c => `<button type="button" class="sg-chip" data-cat="${c}" aria-pressed="${filtro.cat === c}">${esc(nomes[c])}<small>${contar(c)}</small></button>`).join('');
      $('[data-filtros]').querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
        filtro.cat = b.dataset.cat; desenharFiltros(); desenharGrade();
      }));
    }

    const cartao = p => `
<div class="sg-card${marcadas.has(p.id) ? ' marcada' : ''}" data-id="${p.id}" role="checkbox" aria-checked="${marcadas.has(p.id)}" tabindex="0">
  <span class="sg-check">${marcadas.has(p.id) ? '✓' : ''}</span>
  <a class="sg-ver" href="${PASTA}p/${p.id}.pdf" target="_blank" rel="noopener" data-ver>Ver</a>
  <div class="sg-img"><img loading="lazy" src="${PASTA}t/${p.id}.jpg" alt=""></div>
  <div class="sg-info">${esc(p.titulo)}<small>${esc(tamanho(p))}${p.folhas > 1 ? ' · ' + p.folhas + ' folhas' : ''}</small></div>
</div>`;

    function desenharGrade() {
      const b = semAcento(filtro.busca.trim());
      const lista = placas.filter(p => (!filtro.cat || p.cat === filtro.cat) && (!b || semAcento(p.titulo + ' ' + nomes[p.cat]).includes(b)));
      if (!lista.length) { $('[data-grade]').innerHTML = '<div class="sg-vazio">Nenhuma placa com esse filtro.</div>'; return; }
      $('[data-grade]').innerHTML = ordemCat.filter(c => lista.some(p => p.cat === c)).map(c =>
        `<h3 class="sg-cat-tit">${esc(nomes[c])}<button type="button" data-marcar-cat="${c}">marcar todas</button></h3>` +
        lista.filter(p => p.cat === c).map(cartao).join('')).join('');
      $('[data-grade]').querySelectorAll('.sg-card').forEach(card => {
        const alternar = () => {
          const id = card.dataset.id;
          if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id);
          const on = marcadas.has(id);
          card.classList.toggle('marcada', on); card.setAttribute('aria-checked', on);
          card.querySelector('.sg-check').textContent = on ? '✓' : '';
          resumo();
        };
        card.addEventListener('click', ev => { if (!ev.target.closest('[data-ver]')) alternar(); });
        card.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); alternar(); } });
      });
      $('[data-grade]').querySelectorAll('[data-marcar-cat]').forEach(bt => bt.addEventListener('click', () => {
        const ids = lista.filter(p => p.cat === bt.dataset.marcarCat).map(p => p.id);
        const todas = ids.every(id => marcadas.has(id));
        ids.forEach(id => todas ? marcadas.delete(id) : marcadas.add(id));
        desenharGrade(); resumo();
      }));
    }

    function resumo() {
      const sel = placas.filter(p => marcadas.has(p.id));
      const folhas = sel.reduce((s, p) => s + p.folhas, 0) * (Math.max(1, Number($('[data-copias]').value) || 1));
      $('[data-n]').innerHTML = sel.length
        ? `<strong>${sel.length} placa${sel.length > 1 ? 's' : ''}</strong> marcada${sel.length > 1 ? 's' : ''} · ${folhas} folha${folhas > 1 ? 's' : ''}`
        : 'Nenhuma placa marcada';
      el.querySelectorAll('[data-acao],[data-limpar]').forEach(b => { b.disabled = !sel.length; });
    }

    $('[data-busca]').addEventListener('input', ev => { filtro.busca = ev.target.value; desenharGrade(); });
    $('[data-copias]').addEventListener('input', resumo);
    $('[data-limpar]').addEventListener('click', () => { marcadas.clear(); desenharGrade(); resumo(); });
    el.querySelectorAll('[data-acao]').forEach(b => b.addEventListener('click', () => {
      const sel = placas.filter(p => marcadas.has(p.id));
      if (!sel.length) return;
      const copias = Math.max(1, Math.min(20, Number($('[data-copias]').value) || 1));
      entregar(sel, copias, $('[data-modo]').value, b.dataset.acao, b);
    }));
    desenharFiltros(); desenharGrade(); resumo();
  }

  window.Sinaletica = { desenhar, montar, carregar };
})();
