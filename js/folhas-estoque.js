/* folhas-estoque.js — folhas de ENTRADA e SAÍDA do estoque e as placas das
   pranchetas (29/10/2026).

   Pedido do Guilherme: "crie em estoque esses FORM para impressão e também na
   certificação! Colocamos em estoque pq nem todos têm acesso à certificação".
   As folhas ficam na prancheta de cada estoque, uma para ENTRADA (azul) e uma
   para SAÍDA (vermelho), por tipo de estoque, cada tipo com o seu FORM da
   Lista mestra:
     Defensivos FORM 048 · Fertilizantes FORM 049 · EPI FORM 055 ·
     Material de limpeza FORM 056 · Lubrificantes FORM 057.
   Decisões dele, na conversa do dia 29/10:
     - A4 deitado, margem mínima (5 mm), letra do pessoal é grande: linhas de
       ~1 cm, Data larga com "  /  /    " para escrever o ano inteiro;
     - corpo em cinza e branco para não gastar tinta; a cor fica só no
       cabeçalho (azul na entrada, vermelho na saída), com a logo da SAKUMA;
     - sem coluna Tipo (a NF / Transf / receituário já diz o que foi), sem
       Mês e Folha nº — no lugar, o número do FORM; coluna "Responsável"
       virou "Recebido por" (entrada) e "Retirado por" (saída);
     - nome do estoque e tipo já impressos na folha.
   Placas: uma faixa por folha A4 (duas por folha, linha de corte), ENTRADA
   azul e SAÍDA vermelha com seta para baixo "FOLHA AQUI", para pendurar em
   cima da prancheta.

   Script comum (não é módulo): carregado pela área Estoque (moldura,
   ../js/folhas-estoque.js) e pela Certificação (app principal). Monta a tela
   dentro de um elemento — window.FolhasEstoque.desenhar(el, opcoes) — e gera o
   PDF com o jsPDF, que é carregado na hora se a página ainda não tiver. */
(function () {
  'use strict';

  /* Raiz do app (a pasta deste arquivo é js/): daqui saem imagens e o jsPDF,
     esteja a página na raiz ou numa moldura. */
  const RAIZ = (function () {
    try { return new URL('..', document.currentScript.src).href; } catch (e) { return './'; }
  })();

  const ESTOQUES = ['Lote 35 PADAP', 'Faz. Faca', 'Faz. Morro Branco', 'Faz. Três Riachos', 'Faz. Quebra Cocão'];
  const TIPOS = [
    { id: 'def', nome: 'Defensivos', form: 'FORM 048',
      destino: 'Destino: plantio / talhão.   Informar o nº do receituário.' },
    { id: 'fer', nome: 'Fertilizantes', form: 'FORM 049',
      destino: 'Destino: plantio / talhão (e quadra do barracão).' },
    { id: 'epi', nome: 'EPI', form: 'FORM 055',
      destino: 'Destino: nome do funcionário que recebeu.',
      legendas: {
        entrada: 'CA: nº do Certificado de Aprovação (vem no EPI ou na embalagem).   Origem: fornecedor ou estoque de onde veio.   NF / Transf: nº da nota ou da transferência.',
        saida: 'Funcionário: quem recebeu o EPI.   Entregue por: quem entregou.   CA: nº do Certificado de Aprovação.   Transferência: escrever o estoque de destino em Funcionário.',
      } },
    { id: 'lim', nome: 'Material de limpeza', form: 'FORM 056',
      destino: 'Destino: local ou setor (sede, banheiros, refeitório, packing...).' },
    { id: 'lub', nome: 'Lubrificantes', form: 'FORM 057',
      destino: 'Destino: máquina ou implemento (e horímetro, se tiver).' },
  ];
  const MOV = {
    entrada: { titulo: 'ENTRADA', cor: '#1F5FA8', claro: '#E6EEF8',
      legenda: 'Origem: fornecedor ou estoque de onde veio.   NF / Transf: nº da nota ou da transferência (devolução de sobra: escrever "devolução").',
      frase: 'Chegou produto? Anote aqui antes de guardar.' },
    saida: { titulo: 'SAÍDA', cor: '#C62828', claro: '#FBE7E7',
      legenda: 'Transferência: escrever o estoque de destino.   Descarte: escrever "vencido" ou "descarte" no Destino.   ',
      frase: 'Vai retirar produto? Anote aqui antes de levar.' },
  };
  const CINZA = '#51534A', GRADE = '#888780', LISTRA = '#EFEFED', CORTE = '#B4B2A9';
  const W = 297, H = 210, M = 5;   // A4 deitado, margem mínima

  function colunas(mov, tipo) {
    /* EPI é diferente (pedido dele, 29/10/2026: "preciso colocar CA e o
       funcionário"): a saída é entrega ao funcionário — sem assinatura dele
       (pedido dele: "somente para qual funcionário recebeu e quem entregou"). */
    if (tipo.id === 'epi') {
      const cols = mov === 'entrada'
        ? [['Data', 34], ['EPI', 70], ['CA', 24], ['Qtd', 20], ['Origem', 56], ['NF / Transf', 30], ['Recebido por', 38]]
        : [['Data', 34], ['Funcionário', 80], ['EPI', 74], ['CA', 26], ['Qtd', 20], ['Entregue por', 38]];
      cols.push(['Lanç.', W - 2 * M - cols.reduce((s, c) => s + c[1], 0)]);
      return cols;
    }
    const meio = mov === 'entrada'
      ? [['Origem', 66], ['NF / Transf', 34], ['Recebido por', 40]]
      : [['Destino', 66], [tipo.id === 'def' ? 'Receit. / Transf' : 'Doc. / Transf', 34], ['Retirado por', 40]];
    const cols = [['Data', 34], ['Produto', 74], ['Qtd', 24], ...meio];
    cols.push(['Lanç.', W - 2 * M - cols.reduce((s, c) => s + c[1], 0)]);
    return cols;
  }

  /* ---------------- recursos ---------------- */
  let jspdfPromessa = null;
  function carregarJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (jspdfPromessa) return jspdfPromessa;
    jspdfPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = RAIZ + 'vendor/jspdf.umd.min.js';
      s.onload = () => ok();
      s.onerror = () => { jspdfPromessa = null; falha(new Error('O gerador de PDF não carregou. Abra o app com internet uma vez.')); };
      document.head.appendChild(s);
    });
    return jspdfPromessa;
  }
  const imagens = {};
  async function imagem(arq) {
    if (imagens[arq]) return imagens[arq];
    const blob = await fetch(RAIZ + 'img/' + arq).then(r => { if (!r.ok) throw new Error('imagem ' + arq); return r.blob(); });
    const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.src = url; });
    imagens[arq] = { url, ...dim };
    return imagens[arq];
  }

  /* ---------------- folha de entrada / saída ---------------- */
  function folha(doc, img, estoque, tipo, mov) {
    const cfg = MOV[mov], COR = cfg.cor;
    // cabeçalho
    const lh = 16, lw = lh * img.sakuma.w / img.sakuma.h;
    doc.addImage(img.sakuma.url, 'PNG', M, M, lw, lh);
    const tx = M + lw + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(COR);
    doc.text(cfg.titulo + ' DO ESTOQUE', tx, M + 7.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(CINZA);
    doc.text('Estoque:', tx, M + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(estoque || '______________________________', tx + 16, M + 14);
    doc.text(tipo.form, tx + 70, M + 14);
    // quadro do tipo, à direita
    const bw = 62, bh = 14, bx = W - M - bw, by = M + 1;
    doc.setDrawColor(COR); doc.setLineWidth(1.2); doc.setFillColor('#FFFFFF');
    doc.rect(bx, by, bw, bh, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(CINZA);
    doc.text('TIPO DE ESTOQUE', bx + bw / 2, by + 4, { align: 'center' });
    let fs = 16;
    doc.setFont('helvetica', 'bold');
    while (fs > 8) { doc.setFontSize(fs); if (doc.getTextWidth(tipo.nome.toUpperCase()) <= bw - 4) break; fs -= 0.5; }
    doc.setTextColor(COR);
    doc.text(tipo.nome.toUpperCase(), bx + bw / 2, by + bh - 3, { align: 'center' });
    const hb = M + lh + 2;
    doc.setDrawColor(COR); doc.setLineWidth(1.6); doc.line(M, hb, W - M, hb);

    // pé: legenda, SAKUMA Agronegócios e a assinatura da LOP
    const sh = 7, sw = sh * img.lop.w / img.lop.h;
    doc.addImage(img.lop.url, 'PNG', W - M - sw, H - M + 1 - sh, sw, sh);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(CINZA);
    doc.text('SAKUMA Agronegócios', M, H - M - 2);
    const ly = H - M - 7.5;
    doc.setFontSize(8.5);
    doc.text((tipo.legendas ? tipo.legendas[mov] : cfg.legenda + (mov === 'saida' ? tipo.destino : '')) + '   Lanç.: já lançado no app.', M, ly);

    // tabela
    const cols = colunas(mov, tipo);
    const tTop = hb + 3, hh = 8, tBot = H - (M + 11.5);
    const area = tBot - (tTop + hh);
    const n = Math.floor(area / 10), rh = area / n;
    let x = M;
    doc.setLineWidth(0.32); doc.setDrawColor(COR);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    cols.forEach(([nome, w]) => {
      // no PDF a cor do texto também é cor de preenchimento: repor a cada célula
      doc.setFillColor(cfg.claro); doc.rect(x, tTop, w, hh, 'FD');
      doc.setTextColor(COR);
      doc.text(nome, x + w / 2, tTop + hh - 2.8, { align: 'center' });
      x += w;
    });
    doc.setLineWidth(0.18); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    for (let i = 0; i < n; i++) {
      const y = tTop + hh + i * rh;
      x = M;
      cols.forEach(([nome, w]) => {
        doc.setDrawColor(GRADE); doc.setFillColor(i % 2 ? LISTRA : '#FFFFFF');
        doc.rect(x, y, w, rh, 'FD');
        if (nome === 'Lanç.') {
          doc.setDrawColor(CINZA); doc.setFillColor('#FFFFFF');
          doc.rect(x + w / 2 - 2.5, y + rh / 2 - 2.5, 5, 5, 'FD');
        }
        if (nome === 'Data') {
          doc.setTextColor(GRADE);
          doc.text('/', x + 10.5, y + rh / 2 + 1.3, { align: 'center' });
          doc.text('/', x + 20, y + rh / 2 + 1.3, { align: 'center' });
        }
        x += w;
      });
    }
  }

  /* ---------------- placa da prancheta ---------------- */
  function placa(doc, img, y0, h, tipo, mov, estoque) {
    const cfg = MOV[mov], COR = cfg.cor;
    const x0 = 6, x1 = W - 6, top = y0 + 4, alt = h - 8, bot = top + alt;
    doc.setDrawColor(COR); doc.setLineWidth(2.2); doc.setFillColor('#FFFFFF');
    doc.roundedRect(x0, top, x1 - x0, alt, 4, 4, 'FD');
    // faixa com a seta
    const fw = 58;
    doc.setFillColor(COR);
    doc.roundedRect(x1 - fw, top, fw, alt, 4, 4, 'F');
    doc.rect(x1 - fw, top, 6, alt, 'F');
    const cx = x1 - fw / 2, aTop = top + 12, aBot = bot - 14, larg = 36, haste = larg * 0.42, cab = (aBot - aTop) * 0.45;
    doc.setFillColor('#FFFFFF');
    doc.rect(cx - haste / 2, aTop, haste, aBot - cab - aTop + 0.2, 'F');
    doc.triangle(cx - larg / 2, aBot - cab, cx + larg / 2, aBot - cab, cx, aBot, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor('#FFFFFF');
    doc.text('FOLHA AQUI', cx, bot - 6, { align: 'center' });
    // marca, FORM e estoque
    const lh = 15, lw = lh * img.sakuma.w / img.sakuma.h;
    doc.addImage(img.sakuma.url, 'PNG', x0 + 8, top + 6, lw, lh);
    doc.setTextColor(CINZA); doc.setFontSize(14);
    doc.text(tipo.form, x1 - fw - 8, top + 13, { align: 'right' });
    if (estoque) { doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text(estoque, x1 - fw - 8, top + 20, { align: 'right' }); }
    // palavra grande, tipo e a frase
    const tx = x0 + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(82); doc.setTextColor(COR);
    doc.text(cfg.titulo, tx, bot - 30);
    let fs = 30;
    while (fs > 12) { doc.setFontSize(fs); if (doc.getTextWidth(tipo.nome.toUpperCase()) <= x1 - fw - tx - 8) break; fs -= 1; }
    doc.setTextColor(CINZA);
    doc.text(tipo.nome.toUpperCase(), tx, bot - 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    doc.text(cfg.frase, tx, bot - 7);
  }

  /* ---------------- PDF ---------------- */
  async function montar(o) {
    await carregarJsPdf();
    const img = { sakuma: await imagem('sakuma-logo.png'), lop: await imagem('lop-assinatura-laser-claro.png') };
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    let primeira = true;
    const nova = () => { if (!primeira) doc.addPage('a4', 'landscape'); primeira = false; };
    if (o.placas) {
      for (const t of o.tipos) {
        for (let c = 0; c < (o.copias || 1); c++) {
          nova();
          placa(doc, img, 0, H / 2, t, 'entrada', o.estoquePlaca);
          placa(doc, img, H / 2, H / 2, t, 'saida', o.estoquePlaca);
          doc.setDrawColor(CORTE); doc.setLineWidth(0.2); doc.setLineDashPattern([1.5, 1], 0);
          doc.line(0, H / 2, W, H / 2); doc.setLineDashPattern([], 0);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(CORTE);
          doc.text('cortar aqui', 3, H / 2 - 1);
        }
      }
    } else {
      for (const e of o.estoques) for (const t of o.tipos) for (const m of o.movs)
        for (let c = 0; c < (o.copias || 1); c++) { nova(); folha(doc, img, e, t, m); }
    }
    doc.setProperties({ title: o.titulo || 'Folhas de estoque', author: 'SAKUMA Agronegócios' });
    return doc;
  }

  const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

  async function entregar(o, modo, botao) {
    const rot = botao && botao.textContent;
    if (botao) { botao.disabled = true; botao.textContent = 'Preparando…'; }
    try {
      const doc = await montar(o);
      const nome = semAcento(o.arquivo) + '.pdf';
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      if (modo === 'abrir') {
        const j = window.open(url, '_blank');
        if (j) { setTimeout(() => URL.revokeObjectURL(url), 120000); return; }
      }
      const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      alert('Não consegui montar o PDF: ' + (e.message || e));
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = rot; }
    }
  }

  /* ---------------- tela ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function estilo() {
    if (document.getElementById('feEstilo')) return;
    const s = document.createElement('style');
    s.id = 'feEstilo';
    s.textContent = `
.fe-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:6px}
.fe-bloco{border:1px solid #E1E3DA;border-radius:10px;padding:10px 12px}
.fe-bloco h3{margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#51534A}
.fe-op{display:flex;align-items:center;gap:8px;font-size:13.5px;padding:4px 0;cursor:pointer}
.fe-op input{width:17px;height:17px;accent-color:#84BD00;flex:none}
.fe-op small{color:#8A8C83;font-size:11.5px;margin-left:auto}
.fe-tag{display:inline-block;width:10px;height:10px;border-radius:2px;flex:none}
.fe-todos{font-size:12px;color:#5E8A00;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;margin-top:4px}
.fe-resumo{margin-top:12px;font-size:13px;color:#51534A}
.fe-resumo strong{color:#744F28}
.fe-num{width:70px}
.fe-amostra{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.fe-amostra div{border:2px solid;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px}
.fe-amostra small{display:block;font-weight:400;color:#51534A;font-size:11.5px;margin-top:2px}
@media (max-width:560px){.fe-amostra{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  /**
   * Desenha a tela dentro de `el`.
   * opcoes = { tela: 'folhas' | 'placas', estoques: [nomes] (padrão: os 5) }
   */
  function desenhar(el, opcoes) {
    if (!el) return;
    estilo();
    const op = opcoes || {};
    const est = (op.estoques && op.estoques.length) ? op.estoques : ESTOQUES;
    const placas = op.tela === 'placas';
    const chk = (nome, valor, rot, extra, marcado = true) =>
      `<label class="fe-op"><input type="checkbox" name="${nome}" value="${esc(valor)}"${marcado ? ' checked' : ''}>${rot}${extra ? `<small>${esc(extra)}</small>` : ''}</label>`;

    el.innerHTML = `
<div class="cartao">
  <h2>${placas ? 'Placas das pranchetas' : 'Folhas de entrada e saída'}</h2>
  <p class="dica">${placas
    ? 'Placa para pendurar em cima da prancheta: ENTRADA em azul e SAÍDA em vermelho, com a seta para a folha. Sai uma folha A4 por tipo, com as duas placas e a linha de corte. Plastifique para durar.'
    : 'As folhas da prancheta de cada estoque: ENTRADA em azul e SAÍDA em vermelho, uma por tipo, com o nome do estoque e o FORM da Certificação já impressos. A4 deitado, 15 linhas por folha, corpo em cinza e branco para gastar pouca tinta.'}</p>
  <div class="fe-grade">
    ${placas ? '' : `<div class="fe-bloco" data-grupo="est"><h3>Estoque</h3>
      ${est.map(e => chk('est', e, esc(e), '', est.length === 1 || !op.estoqueUnico)).join('')}
      ${est.length > 1 ? '<button type="button" class="fe-todos" data-alternar="est">marcar / desmarcar todos</button>' : ''}</div>`}
    <div class="fe-bloco" data-grupo="tipo"><h3>Tipo de estoque</h3>
      ${TIPOS.map(t => chk('tipo', t.id, esc(t.nome), t.form)).join('')}
      <button type="button" class="fe-todos" data-alternar="tipo">marcar / desmarcar todos</button></div>
    <div class="fe-bloco"><h3>${placas ? 'Opções' : 'Folhas'}</h3>
      ${placas
        ? `<label class="campo">Nome do estoque na placa (opcional)
             <select name="estPlaca"><option value="">Sem nome — serve em qualquer estoque</option>${est.map(e => `<option>${esc(e)}</option>`).join('')}</select></label>`
        : `${chk('mov', 'entrada', '<span class="fe-tag" style="background:#1F5FA8"></span> Entrada', 'azul')}
           ${chk('mov', 'saida', '<span class="fe-tag" style="background:#C62828"></span> Saída', 'vermelho')}`}
      <label class="campo" style="margin-top:8px">Cópias de cada ${placas ? 'folha de placas' : 'folha'}
        <input class="fe-num" type="number" name="copias" min="1" max="20" value="1"></label>
    </div>
  </div>
  ${placas ? '' : `<div class="fe-amostra">
    <div style="border-color:#1F5FA8;color:#1F5FA8">ENTRADA DO ESTOQUE<small>Data · Produto · Qtd · Origem · NF / Transf · Recebido por · Lanç.</small></div>
    <div style="border-color:#C62828;color:#C62828">SAÍDA DO ESTOQUE<small>Data · Produto · Qtd · Destino · Receit. ou Doc. / Transf · Retirado por · Lanç.</small></div></div>
  <p class="dica" style="margin:8px 0 0">EPI tem folha própria: na entrada, EPI e CA; na saída, o Funcionário que recebeu, EPI, CA e quem entregou.</p>`}
  <p class="fe-resumo" data-resumo></p>
  <div class="barra fim">
    <button type="button" class="btn" data-acao="baixar">Baixar PDF</button>
    <button type="button" class="btn principal" data-acao="abrir">Abrir para imprimir</button>
  </div>
</div>`;

    const marcados = nome => [...el.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => i.value);
    const ler = () => {
      const tipos = TIPOS.filter(t => marcados('tipo').includes(t.id));
      const copias = Math.max(1, Math.min(20, Number(el.querySelector('[name=copias]').value) || 1));
      if (placas) {
        const estoquePlaca = el.querySelector('[name=estPlaca]').value;
        return { placas: true, tipos, copias, estoquePlaca, paginas: tipos.length * copias,
          titulo: 'Placas das pranchetas do estoque',
          arquivo: 'Placas_Pranchetas_Estoque' + (estoquePlaca ? '_' + estoquePlaca : '') };
      }
      const estoques = marcados('est'), movs = ['entrada', 'saida'].filter(m => marcados('mov').includes(m));
      const so = estoques.length === 1 ? '_' + estoques[0] : '';
      return { estoques, tipos, movs, copias, paginas: estoques.length * tipos.length * movs.length * copias,
        titulo: 'Folhas de entrada e saída do estoque',
        arquivo: 'Folhas_Estoque' + so + (tipos.length === 1 ? '_' + tipos[0].nome : '') +
          (movs.length === 1 ? '_' + (movs[0] === 'saida' ? 'Saida' : 'Entrada') : '') };
    };
    const resumo = () => {
      const o = ler();
      el.querySelector('[data-resumo]').innerHTML = o.paginas
        ? `Vai sair <strong>${o.paginas} folha${o.paginas > 1 ? 's' : ''} A4</strong> deitada${o.paginas > 1 ? 's' : ''}${placas ? ` (${o.paginas * 2} placas)` : ''}.`
        : 'Marque pelo menos um item em cada bloco.';
      el.querySelectorAll('[data-acao]').forEach(b => { b.disabled = !o.paginas; });
    };
    el.addEventListener('change', resumo);
    el.addEventListener('input', resumo);
    el.querySelectorAll('[data-alternar]').forEach(b => b.addEventListener('click', () => {
      const caixas = [...el.querySelectorAll(`input[name="${b.dataset.alternar}"]`)];
      const todos = caixas.every(c => c.checked);
      caixas.forEach(c => { c.checked = !todos; });
      resumo();
    }));
    el.querySelectorAll('[data-acao]').forEach(b => b.addEventListener('click', () => {
      const o = ler();
      if (!o.paginas) return;
      entregar(o, b.dataset.acao, b);
    }));
    resumo();
  }

  window.FolhasEstoque = { desenhar, montar, TIPOS, ESTOQUES };
})();
