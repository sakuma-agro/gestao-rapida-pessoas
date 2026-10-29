/* folhas-estoque.js — folhas de ENTRADA e SAÍDA do estoque e as placas das
   pranchetas (29/10/2026).

   Pedido do Guilherme: "crie em estoque esses FORM para impressão e também na
   certificação! Colocamos em estoque pq nem todos têm acesso à certificação".
   As folhas ficam na prancheta de cada estoque, uma para ENTRADA (azul) e uma
   para SAÍDA (vermelho), por tipo de estoque. FORM da Lista mestra (decisão
   dele, 29/10/2026 à tarde: "um número de FORM para entrada e outro para
   saída, pra o pessoal não se confundir; um geral para todos os tipos"):
     ENTRADA = FORM 048 · SAÍDA = FORM 049 (os FORM 055–057 por tipo, criados
     de manhã, foram apagados).
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
    { id: 'def', nome: 'Defensivos',
      destino: 'Destino: plantio / talhão.   Informar o nº do receituário.' },
    { id: 'fer', nome: 'Fertilizantes',
      destino: 'Destino: plantio / talhão (e quadra do barracão).' },
    { id: 'epi', nome: 'EPI',
      destino: 'Destino: nome do funcionário que recebeu.',
      legendas: {
        entrada: 'CA: nº do Certificado de Aprovação (vem no EPI ou na embalagem).   Origem: fornecedor ou estoque de onde veio.   NF / Transf: nº da nota ou da transferência.',
        saida: 'Funcionário: quem recebeu o EPI.   Entregue por: quem entregou.   CA: nº do Certificado de Aprovação.   Transferência: escrever o estoque de destino em Funcionário.',
      } },
    { id: 'lim', nome: 'Material de limpeza',
      destino: 'Destino: local ou setor (sede, banheiros, refeitório, packing...).' },
    { id: 'lub', nome: 'Lubrificantes',
      destino: 'Destino: máquina ou implemento (e horímetro, se tiver).' },
  ];
  const MOV = {
    entrada: { titulo: 'ENTRADA', form: 'FORM 048', cor: '#1F5FA8', claro: '#E6EEF8',
      legenda: 'Origem: fornecedor ou estoque de onde veio.   NF / Transf: nº da nota ou da transferência (devolução de sobra: escrever "devolução").',
      frase: 'Chegou produto? Anote aqui antes de guardar.' },
    saida: { titulo: 'SAÍDA', form: 'FORM 049', cor: '#C62828', claro: '#FBE7E7',
      legenda: 'Transferência: escrever o estoque de destino.   Descarte: escrever "vencido" ou "descarte" no Destino.   ',
      frase: 'Vai retirar produto? Anote aqui antes de levar.' },
  };
  /* Controle do documento (Lista mestra: FORM 048 e 049, rev. 02 de 01/11/2026),
     no mesmo padrão dos outros FORMs da Certificação. */
  const REV = { data: '01/11/2026', rev: '02', elab: 'Guilherme Ribeiro Lopes', aprov: 'Produtor – Fabio Massao Sakuma' };
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
    /* Quadro de controle do documento, como nos outros FORMs da Certificação
       (pedido dele, 29/10/2026: "nos forms precisamos criar data de revisão e etc"):
       Código | Data | Revisão | Página. */
    const cw = 56, cx0 = W - M - cw, rh4 = 4.1, cy0 = M;
    const linhas = [['Código', cfg.form], ['Data', REV.data], ['Revisão', REV.rev], ['Página', '1 / 1']];
    doc.setLineWidth(0.25); doc.setDrawColor(COR);
    linhas.forEach(([r, v], i) => {
      const y = cy0 + i * rh4;
      doc.setFillColor(cfg.claro); doc.rect(cx0, y, 20, rh4, 'FD');
      doc.setFillColor('#FFFFFF'); doc.rect(cx0 + 20, y, cw - 20, rh4, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(CINZA);
      doc.text(r, cx0 + 2, y + rh4 - 1.2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(i === 0 ? COR : CINZA);
      doc.text(v, cx0 + 22, y + rh4 - 1.1);
    });
    // quadro do tipo, à esquerda do controle
    const bw = 50, bh = 4 * rh4, bx = cx0 - 4 - bw, by = cy0;
    doc.setDrawColor(COR); doc.setLineWidth(1.2); doc.setFillColor('#FFFFFF');
    doc.rect(bx, by, bw, bh, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(CINZA);
    doc.text('TIPO DE ESTOQUE', bx + bw / 2, by + 4.2, { align: 'center' });
    let fs = 16;
    doc.setFont('helvetica', 'bold');
    while (fs > 8) { doc.setFontSize(fs); if (doc.getTextWidth(tipo.nome.toUpperCase()) <= bw - 4) break; fs -= 0.5; }
    doc.setTextColor(COR);
    doc.text(tipo.nome.toUpperCase(), bx + bw / 2, by + bh - 3.2, { align: 'center' });
    const hb = M + lh + 2;
    doc.setDrawColor(COR); doc.setLineWidth(1.6); doc.line(M, hb, W - M, hb);

    // pé: legenda, SAKUMA Agronegócios e a assinatura da LOP
    const sh = 7, sw = sh * img.lop.w / img.lop.h;
    doc.addImage(img.lop.url, 'PNG', W - M - sw, H - M + 1 - sh, sw, sh);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(CINZA);
    doc.text(`Elaboração/Revisão: ${REV.elab}     Aprovação: ${REV.aprov}     SAKUMA Agronegócios`, M, H - M - 2);
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
  const PL = 220;   // largura da placa da prancheta, em mm
  function placa(doc, img, y0, h, tipo, mov, estoque) {
    const cfg = MOV[mov], COR = cfg.cor;
    /* 22 cm de largura, a largura da prancheta (pedido dele, 29/10/2026). */
    const x0 = (W - PL) / 2, x1 = x0 + PL, top = y0 + 4, alt = h - 8, bot = top + alt;
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
    doc.text(cfg.form, x1 - fw - 8, top + 13, { align: 'right' });
    if (estoque) { doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.text(estoque, x1 - fw - 8, top + 20, { align: 'right' }); }
    // palavra grande, tipo e a frase
    const tx = x0 + 8;
    let fp = 82;
    doc.setFont('helvetica', 'bold');
    while (fp > 30) { doc.setFontSize(fp); if (doc.getTextWidth(cfg.titulo) <= x1 - fw - tx - 6) break; fp -= 1; }
    doc.setTextColor(COR);
    doc.text(cfg.titulo, tx, bot - 30);
    let fs = 30;
    while (fs > 12) { doc.setFontSize(fs); if (doc.getTextWidth(tipo.nome.toUpperCase()) <= x1 - fw - tx - 8) break; fs -= 1; }
    doc.setTextColor(CINZA);
    doc.text(tipo.nome.toUpperCase(), tx, bot - 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    doc.text(cfg.frase, tx, bot - 7);
  }

  /* ---------------- etiqueta da pasta L (80 × 110 mm) ----------------
     Pedido dele (29/10/2026): "as folhas de estoque ficaram dentro de uma pasta
     L transparente na prancheta; quero pôr uma etiqueta na pasta L de entrada e
     saída. Medida 80x110 mm" — e "publique em sinaléticas". 4 por folha A4 em
     pé, com marcas de corte; imprimir em tamanho real (100%). */
  const EW = 80, EH = 110;
  const FRASES = { entrada: ['Chegou produto?', 'Anote aqui antes de guardar.'],
                   saida: ['Vai retirar produto?', 'Anote aqui antes de levar.'] };
  function etiquetaL(doc, img, x, y, tipo, mov) {
    const cfg = MOV[mov], COR = cfg.cor, cx = x + EW / 2, m = 3;
    // marcas de corte nos cantos (para fora)
    doc.setDrawColor(CORTE); doc.setLineWidth(0.15);
    [[x, y], [x + EW, y], [x, y + EH], [x + EW, y + EH]].forEach(([px, py]) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => doc.line(px + dx * 1.5, py + dy * 1.5, px + dx * 4, py + dy * 4)));
    doc.setDrawColor(COR); doc.setLineWidth(1.6); doc.setFillColor('#FFFFFF');
    doc.roundedRect(x + m, y + m, EW - 2 * m, EH - 2 * m, 3, 3, 'FD');
    // faixa colorida com a palavra
    const fh = 30;
    doc.setFillColor(COR);
    doc.roundedRect(x + m, y + m, EW - 2 * m, fh, 3, 3, 'F');
    doc.rect(x + m, y + m + fh - 5, EW - 2 * m, 5, 'F');
    let fs = 34;
    doc.setFont('helvetica', 'bold');
    while (fs > 14) { doc.setFontSize(fs); if (doc.getTextWidth(cfg.titulo) <= EW - 2 * m - 8) break; fs -= 1; }
    doc.setTextColor('#FFFFFF');
    doc.text(cfg.titulo, cx, y + m + fh / 2, { align: 'center', baseline: 'middle' });
    // logo, tipo, FORM e frase
    const lh = 11, lw = lh * img.sakuma.w / img.sakuma.h;
    doc.addImage(img.sakuma.url, 'PNG', cx - lw / 2, y + m + fh + 3, lw, lh);
    const ty = y + m + fh + lh + 12;
    fs = 20;
    while (fs > 9) { doc.setFontSize(fs); if (doc.getTextWidth(tipo.nome.toUpperCase()) <= EW - 2 * m - 6) break; fs -= 0.5; }
    doc.setTextColor(CINZA);
    doc.text(tipo.nome.toUpperCase(), cx, ty, { align: 'center' });
    doc.setFontSize(11); doc.setTextColor(COR);
    doc.text(cfg.form, cx, ty + 7, { align: 'center' });
    doc.setFontSize(10.5); doc.setTextColor(CINZA);
    doc.text(FRASES[mov][0], cx, ty + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(FRASES[mov][1], cx, ty + 20, { align: 'center' });
    // seta para baixo
    const aTop = ty + 24, aBot = y + EH - m - 5, larg = 16, haste = larg * 0.42, cab = (aBot - aTop) * 0.5;
    doc.setFillColor(COR);
    doc.rect(cx - haste / 2, aTop, haste, aBot - cab - aTop + 0.2, 'F');
    doc.triangle(cx - larg / 2, aBot - cab, cx + larg / 2, aBot - cab, cx, aBot, 'F');
  }

  /* ---------------- adesivo ENTRADA / SAÍDA ----------------
     Pedido dele (29/10/2026): "faça menor, para eu fazer adesivos — entrada e
     saída somente, azul e vermelho, com a logo". Logo da SAKUMA no alto, em
     fundo branco (sem mexer na logo), e a palavra em branco na faixa colorida. */
  const TAM_ADESIVO = { p: [45, 30], m: [60, 40], g: [90, 60] };
  function adesivo(doc, img, x, y, w, h, mov) {
    const cfg = MOV[mov], COR = cfg.cor, cx = x + w / 2, r = Math.min(w, h) * 0.08;
    doc.setDrawColor(CORTE); doc.setLineWidth(0.15);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py]) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => doc.line(px + dx * 1, py + dy * 1, px + dx * 2.8, py + dy * 2.8)));
    const lw = Math.max(0.8, w * 0.018);
    doc.setDrawColor(COR); doc.setLineWidth(lw); doc.setFillColor('#FFFFFF');
    doc.roundedRect(x + lw / 2, y + lw / 2, w - lw, h - lw, r, r, 'FD');
    const faixa = h * 0.55;
    doc.setFillColor(COR);
    doc.roundedRect(x, y + h - faixa, w, faixa, r, r, 'F');
    doc.rect(x, y + h - faixa, w, r, 'F');
    // logo no branco de cima, centralizada
    const area = h - faixa, lh = Math.min(area * 0.72, (w * 0.62) * img.sakuma.h / img.sakuma.w), lwid = lh * img.sakuma.w / img.sakuma.h;
    doc.addImage(img.sakuma.url, 'PNG', cx - lwid / 2, y + (area - lh) / 2 + lw / 2, lwid, lh);
    let fs = 60;
    doc.setFont('helvetica', 'bold');
    while (fs > 6) { doc.setFontSize(fs); if (doc.getTextWidth(cfg.titulo) <= w * 0.84 && fs * 0.3528 <= faixa * 0.62) break; fs -= 0.5; }
    doc.setTextColor('#FFFFFF');
    doc.text(cfg.titulo, cx, y + h - faixa / 2, { align: 'center', baseline: 'middle' });
  }

  /* ---------------- PDF ---------------- */
  async function montar(o) {
    if (o.adesivos) {
      await carregarJsPdf();
      const img = { sakuma: await imagem('sakuma-logo.png') };
      const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const [w, h] = TAM_ADESIVO[o.tam] || TAM_ADESIVO.m;
      const gap = 5, marg = 8;
      const cols = Math.floor((210 - 2 * marg + gap) / (w + gap)), lins = Math.floor((297 - 2 * marg + gap) / (h + gap));
      const x0 = (210 - cols * w - (cols - 1) * gap) / 2, y0 = (297 - lins * h - (lins - 1) * gap) / 2;
      const lista = [...Array(o.qEnt).fill('entrada'), ...Array(o.qSai).fill('saida')];
      lista.forEach((m, i) => {
        const k = i % (cols * lins);
        if (i && k === 0) doc.addPage('a4', 'portrait');
        adesivo(doc, img, x0 + (k % cols) * (w + gap), y0 + Math.floor(k / cols) * (h + gap), w, h, m);
      });
      doc.setProperties({ title: o.titulo, author: 'SAKUMA Agronegócios' });
      return doc;
    }
    if (o.etiquetas) {
      await carregarJsPdf();
      const img = { sakuma: await imagem('sakuma-logo.png') };
      const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const lista = [];
      for (const t of o.tipos) for (let c = 0; c < (o.copias || 1); c++) for (const m of o.movs) lista.push([t, m]);
      const gap = 6, x0 = (210 - 2 * EW - gap) / 2, y0 = (297 - 2 * EH - gap) / 2;
      const pos = [[x0, y0], [x0 + EW + gap, y0], [x0, y0 + EH + gap], [x0 + EW + gap, y0 + EH + gap]];
      lista.forEach(([t, m], i) => {
        if (i && i % 4 === 0) doc.addPage('a4', 'portrait');
        etiquetaL(doc, img, pos[i % 4][0], pos[i % 4][1], t, m);
      });
      doc.setProperties({ title: o.titulo, author: 'SAKUMA Agronegócios' });
      return doc;
    }
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
          const xa = (W - PL) / 2, xb = xa + PL;
          doc.line(0, H / 2, W, H / 2); doc.line(xa, 0, xa, H); doc.line(xb, 0, xb, H); doc.setLineDashPattern([], 0);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(CORTE);
          doc.text('cortar aqui', 3, H / 2 - 1);
          doc.text('placa com 22 cm de largura — imprimir em tamanho real (100%)', W / 2, H - 1.5, { align: 'center' });
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
.fe-sub{margin:16px 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#51534A}
.fe-colunas{overflow-x:auto}
.fe-colunas table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:560px}
.fe-colunas th,.fe-colunas td{border:1px solid #DFE2D8;padding:6px 8px;text-align:left;vertical-align:top}
.fe-colunas th{background:#F6F7F2;color:#51534A;font-size:11.5px}
.fe-colunas th.ent{color:#1F5FA8;background:#E6EEF8}.fe-colunas th.sai{color:#C62828;background:#FBE7E7}
.fe-colunas td small{display:block;color:#8A8C83;font-size:11px}
.fe-colunas tr.dif td:first-child{border-left:3px solid #744F28}
.fe-colunas b{color:#744F28}
.fe-colunas .fe-tagdif{display:inline-block;margin-top:3px;font-size:10.5px;font-weight:700;color:#744F28;background:#F3EBDF;border-radius:4px;padding:1px 6px}`;
    document.head.appendChild(s);
  }

  /**
   * Desenha a tela dentro de `el`.
   * opcoes = { tela: 'folhas' | 'placas' | 'etiquetas' | 'adesivos', estoques: [nomes] (padrão: os 5) }
   */
  /* Por folha A4, em cada tamanho (o mesmo cálculo do montar). */
  function porFolha(tam) {
    const [w, h] = TAM_ADESIVO[tam] || TAM_ADESIVO.m, gap = 5, marg = 8;
    return Math.floor((210 - 2 * marg + gap) / (w + gap)) * Math.floor((297 - 2 * marg + gap) / (h + gap));
  }
  function desenharAdesivos(el) {
    const op = t => `<option value="${t}"${t === 'm' ? ' selected' : ''}>${{ p: 'Pequeno', m: 'Médio', g: 'Grande' }[t]} — ${TAM_ADESIVO[t][0]} × ${TAM_ADESIVO[t][1]} mm (${porFolha(t)} por folha)</option>`;
    el.innerHTML = `
<div class="cartao">
  <h2>Adesivos entrada e saída</h2>
  <p class="dica">Adesivo só com <strong>ENTRADA</strong> (azul) ou <strong>SAÍDA</strong> (vermelho) e a logo da SAKUMA, para colar na pasta, na prancheta ou na porta. Folha A4 com marcas de corte; imprima em <strong>tamanho real (100%)</strong>, em papel adesivo.</p>
  <div class="fe-grade">
    <div class="fe-bloco"><h3>Tamanho</h3>
      <label class="campo">Tamanho do adesivo<select name="tam">${['p', 'm', 'g'].map(op).join('')}</select></label></div>
    <div class="fe-bloco"><h3>Quantidade</h3>
      <label class="campo"><span><span class="fe-tag" style="background:#1F5FA8;display:inline-block"></span> Entrada</span><input class="fe-num" type="number" name="qEnt" min="0" max="200" value="6"></label>
      <label class="campo" style="margin-top:8px"><span><span class="fe-tag" style="background:#C62828;display:inline-block"></span> Saída</span><input class="fe-num" type="number" name="qSai" min="0" max="200" value="6"></label>
      <button type="button" class="fe-todos" data-cheia>encher a folha (metade de cada)</button></div>
  </div>
  <p class="fe-resumo" data-resumo></p>
  <div class="barra fim">
    <button type="button" class="btn" data-acao="baixar">Baixar PDF</button>
    <button type="button" class="btn principal" data-acao="abrir">Abrir para imprimir</button>
  </div>
</div>`;
    const v = n => Math.max(0, Math.min(200, Number(el.querySelector(`[name=${n}]`).value) || 0));
    const ler = () => {
      const tam = el.querySelector('[name=tam]').value, qEnt = v('qEnt'), qSai = v('qSai'), n = qEnt + qSai;
      return { adesivos: true, tam, qEnt, qSai, n, paginas: Math.ceil(n / porFolha(tam)),
        titulo: 'Adesivos entrada e saída', arquivo: 'Adesivos_Entrada_Saida_' + TAM_ADESIVO[tam].join('x') };
    };
    const resumo = () => {
      const o = ler();
      el.querySelector('[data-resumo]').innerHTML = o.n
        ? `Vão sair <strong>${o.n} adesivo${o.n > 1 ? 's' : ''}</strong> (${o.qEnt} de entrada e ${o.qSai} de saída) em ${o.paginas} folha${o.paginas > 1 ? 's' : ''} A4.`
        : 'Coloque a quantidade de entrada ou de saída.';
      el.querySelectorAll('[data-acao]').forEach(b => { b.disabled = !o.n; });
    };
    el.querySelector('[data-cheia]').addEventListener('click', () => {
      const n = porFolha(el.querySelector('[name=tam]').value);
      el.querySelector('[name=qEnt]').value = Math.ceil(n / 2); el.querySelector('[name=qSai]').value = Math.floor(n / 2); resumo();
    });
    el.addEventListener('change', resumo); el.addEventListener('input', resumo);
    el.querySelectorAll('[data-acao]').forEach(b => b.addEventListener('click', () => { const o = ler(); if (o.n) entregar(o, b.dataset.acao, b); }));
    resumo();
  }

  function desenhar(el, opcoes) {
    if (!el) return;
    estilo();
    const op = opcoes || {};
    if (op.tela === 'adesivos') return desenharAdesivos(el);
    const est = (op.estoques && op.estoques.length) ? op.estoques : ESTOQUES;
    const placas = op.tela === 'placas';
    const etiq = op.tela === 'etiquetas';
    const chk = (nome, valor, rot, extra, marcado = true) =>
      `<label class="fe-op"><input type="checkbox" name="${nome}" value="${esc(valor)}"${marcado ? ' checked' : ''}>${rot}${extra ? `<small>${esc(extra)}</small>` : ''}</label>`;

    el.innerHTML = `
<div class="cartao">
  <h2>${etiq ? 'Etiquetas da pasta L' : placas ? 'Placas das pranchetas' : 'Folhas de entrada e saída'}</h2>
  <p class="dica">${etiq
    ? 'Etiqueta de 80 × 110 mm para a pasta L transparente onde ficam as folhas da prancheta: ENTRADA em azul e SAÍDA em vermelho, com o tipo e o FORM. Saem 4 por folha A4, com marcas de corte. Imprima em <strong>tamanho real (100%)</strong>, sem "ajustar à página".'
    : placas
    ? 'Placa para pendurar em cima da prancheta: ENTRADA em azul e SAÍDA em vermelho, com a seta para a folha. Cada placa tem 22 cm de largura (a largura da prancheta). Sai uma folha A4 por tipo, com as duas placas e as linhas de corte; imprima em tamanho real (100%) e plastifique para durar.'
    : 'As folhas da prancheta de cada estoque: ENTRADA em azul e SAÍDA em vermelho, uma por tipo, com o nome do estoque e o FORM da Certificação já impressos (entrada FORM 048, saída FORM 049, para todos os tipos). A4 deitado, 15 linhas por folha, corpo em cinza e branco para gastar pouca tinta.'}</p>
  <div class="fe-grade">
    ${placas || etiq ? '' : `<div class="fe-bloco" data-grupo="est"><h3>Estoque</h3>
      ${est.map(e => chk('est', e, esc(e), '', est.length === 1 || !op.estoqueUnico)).join('')}
      ${est.length > 1 ? '<button type="button" class="fe-todos" data-alternar="est">marcar / desmarcar todos</button>' : ''}</div>`}
    <div class="fe-bloco" data-grupo="tipo"><h3>Tipo de estoque</h3>
      ${TIPOS.map(t => chk('tipo', t.id, esc(t.nome), '')).join('')}
      <button type="button" class="fe-todos" data-alternar="tipo">marcar / desmarcar todos</button></div>
    <div class="fe-bloco"><h3>${placas ? 'Opções' : etiq ? 'Etiquetas' : 'Folhas'}</h3>
      ${placas && !etiq
        ? `<label class="campo">Nome do estoque na placa (opcional)
             <select name="estPlaca"><option value="">Sem nome — serve em qualquer estoque</option>${est.map(e => `<option>${esc(e)}</option>`).join('')}</select></label>`
        : `${chk('mov', 'entrada', '<span class="fe-tag" style="background:#1F5FA8"></span> Entrada', 'FORM 048 · azul')}
           ${chk('mov', 'saida', '<span class="fe-tag" style="background:#C62828"></span> Saída', 'FORM 049 · vermelho')}`}
      <label class="campo" style="margin-top:8px">Cópias de cada ${etiq ? 'etiqueta' : placas ? 'folha de placas' : 'folha'}
        <input class="fe-num" type="number" name="copias" min="1" max="20" value="1"></label>
    </div>
  </div>
  ${placas || etiq ? '' : `<h3 class="fe-sub">O que vai em cada folha</h3><div class="fe-colunas" data-colunas></div>`}
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
      if (etiq) {
        const movs = ['entrada', 'saida'].filter(m => marcados('mov').includes(m));
        const n = tipos.length * movs.length * copias;
        return { etiquetas: true, tipos, movs, copias, n, paginas: Math.ceil(n / 4),
          titulo: 'Etiquetas da pasta L — entrada e saída (80 × 110 mm)', arquivo: 'Etiquetas_Pasta_L_80x110' };
      }
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
    /* Colunas de cada tipo marcado (pedido dele, 29/10/2026: "como ficou em forms,
       para saber diferenciar?"): o que difere do padrão aparece em marrom. */
    const PADRAO = new Set(['Data', 'Produto', 'Qtd', 'Origem', 'NF / Transf', 'Recebido por', 'Destino', 'Doc. / Transf', 'Retirado por', 'Lanç.']);
    const listaCols = (mov, t) => colunas(mov, t).map(([n]) => n).filter(n => n !== 'Data' && n !== 'Lanç.')
      .map(n => PADRAO.has(n) ? esc(n) : `<b>${esc(n)}</b>`).join(' · ');
    const desenharColunas = tipos => {
      const alvo = el.querySelector('[data-colunas]');
      if (!alvo) return;
      if (!tipos.length) { alvo.innerHTML = ''; return; }
      alvo.innerHTML = `<table><thead><tr><th>Tipo</th><th class="ent">Entrada (azul) · FORM 048</th><th class="sai">Saída (vermelho) · FORM 049</th></tr></thead><tbody>${
        tipos.map(t => `<tr class="${t.id === 'epi' ? 'dif' : ''}"><td><strong>${esc(t.nome)}</strong>${
          t.id === 'epi' ? '<span class="fe-tagdif">folha própria</span>' : ''}</td>
          <td>${listaCols('entrada', t)}</td><td>${listaCols('saida', t)}</td></tr>`).join('')}</tbody></table>
        <p class="dica" style="margin:6px 0 0">Todas têm Data no começo e Lanç. no fim. Em <b style="color:#744F28">marrom</b>, o que muda em relação às outras folhas.</p>`;
    };
    const resumo = () => {
      const o = ler();
      if (!placas && !etiq) desenharColunas(o.tipos);
      el.querySelector('[data-resumo]').innerHTML = !o.paginas ? 'Marque pelo menos um item em cada bloco.'
        : etiq ? `Vão sair <strong>${o.n} etiqueta${o.n > 1 ? 's' : ''}</strong> de 80 × 110 mm em ${o.paginas} folha${o.paginas > 1 ? 's' : ''} A4.`
        : `Vai sair <strong>${o.paginas} folha${o.paginas > 1 ? 's' : ''} A4</strong> deitada${o.paginas > 1 ? 's' : ''}${placas ? ` (${o.paginas * 2} placas)` : ''}.`
        ;
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
