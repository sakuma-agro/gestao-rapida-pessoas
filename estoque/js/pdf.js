// pdf.js — PDF do Estoque e envio pelo WhatsApp (27/10/2026), copiado do Custo Base.
// Na Reposição ele pediu: "não precisa mensagem, só enviar o PDF" — por isso
// enviarWhatsapp manda só o arquivo, sem texto.
//
// Origem (Custo Base, 20/10/2026):
//
// Pedido dele: "quero que apareça LOP - Inteligência para o agronegócio, igual
// aos outros relatórios de Pessoas, e o botão de enviar para WhatsApp e
// imprimir". O PDF segue o padrão SAKUMA (verde #84BD00, marrom #744F28,
// cinza #51534A, Helvetica = Arial, sem preto; tabela com grade, linhas em
// verde claro e total sombreado) e assina no pé, à direita, com a marca da
// LOP e a frase — sem nome de pessoa e sem "emitido por".
// WhatsApp: no celular compartilha o arquivo direto; no computador baixa o
// PDF e abre o WhatsApp com o resumo para anexar (mesmo jeito da
// Programação Campo).

const COR = {
  verde: '#84BD00', verdeClaro: '#F3F8E8', verdeLinha: '#C9D9A6', total: '#D9E8BD',
  marrom: '#744F28', cinza: '#51534A', cinzaClaro: '#8A8C83', branco: '#FFFFFF',
};
export const FRASE_LOP = 'Inteligência para o agronegócio';

const imagens = {};
async function imagem(caminho) {
  if (imagens[caminho]) return imagens[caminho];
  const blob = await fetch(caminho).then(r => r.blob());
  const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.src = url; });
  imagens[caminho] = { url, ...dim, tipo: blob.type.includes('png') ? 'PNG' : 'JPEG' };
  return imagens[caminho];
}

/**
 * Monta o PDF.
 * o = { titulo, subtitulo, kpis: [[rótulo, valor]], secoes: [{ titulo, head: [...], body: [[...]],
 *       total: [...], dir: [índices de colunas à direita], largura: 'meia'|undefined }], paisagem }
 */
export async function montarPdf(o) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('O gerador de PDF não carregou. Abra o app com internet uma vez.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: o.paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), A = doc.internal.pageSize.getHeight(), M = 10;
  const sakuma = await imagem('img/sakuma-logo.png');
  const lop = await imagem('img/lop-marca.png');

  // cabeçalho
  const hLogo = 16, wLogo = hLogo * sakuma.w / sakuma.h;
  doc.addImage(sakuma.url, sakuma.tipo, M, 8, wLogo, hLogo);
  const xT = M + wLogo + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(COR.marrom);
  doc.text(o.titulo, xT, 14.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(COR.cinza);
  doc.splitTextToSize(o.subtitulo || '', L - xT - M).slice(0, 2).forEach((t, i) => doc.text(t, xT, 19.5 + i * 4));
  doc.setDrawColor(COR.verde); doc.setLineWidth(1); doc.line(M, 28, L - M, 28);

  // indicadores
  let y = 32;
  const k = o.kpis || [];
  if (k.length) {
    const wC = (L - 2 * M - (k.length - 1) * 3) / k.length;
    k.forEach(([rot, v], i) => {
      const x = M + i * (wC + 3);
      doc.setFillColor(COR.branco); doc.setDrawColor('#DFE2D8'); doc.setLineWidth(0.3);
      doc.roundedRect(x, y, wC, 13, 1.2, 1.2, 'FD');
      doc.setFillColor(COR.verde); doc.rect(x, y, 1, 13, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(COR.cinza);
      doc.text(String(rot).toUpperCase(), x + 3.5, y + 4.6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(COR.marrom);
      doc.text(String(v), x + 3.5, y + 10.4);
    });
    y += 18;
  }

  // seções
  for (const s of o.secoes || []) {
    if (y > A - 40) { doc.addPage(); y = 14; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(COR.marrom);
    doc.text(s.titulo, M, y + 3);
    y += 5;
    const dir = new Set(s.dir || []);
    const estilos = {};
    s.head.forEach((_, i) => { estilos[i] = { halign: dir.has(i) ? 'right' : 'left' }; });
    const larg = s.largura === 'meia' ? (L - 2 * M) * 0.62 : null;
    doc.autoTable({
      startY: y, margin: { left: M, right: larg ? L - M - larg : M, bottom: 16, top: 12 },
      tableWidth: larg || 'auto',
      head: [s.head], body: s.body, foot: s.total ? [s.total] : undefined, showFoot: 'lastPage',
      theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7.6, textColor: COR.cinza, lineColor: COR.verdeLinha, lineWidth: 0.2,
        cellPadding: 1.3, valign: 'middle' },
      headStyles: { fillColor: COR.verde, textColor: COR.branco, fontStyle: 'bold', lineColor: COR.verde },
      bodyStyles: { fillColor: COR.branco },
      alternateRowStyles: { fillColor: COR.verdeClaro },
      footStyles: { fillColor: COR.total, textColor: COR.marrom, fontStyle: 'bold', lineColor: COR.verdeLinha },
      columnStyles: estilos,
      didParseCell: d => { if ((d.section === 'head' || d.section === 'foot') && dir.has(d.column.index)) d.cell.styles.halign = 'right'; },
    });
    y = doc.lastAutoTable.finalY + 7;
  }

  // pé de todas as folhas: marca da LOP + frase, à direita; nº da folha à esquerda
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const h = 7, w = h * lop.w / lop.h;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(COR.cinzaClaro);
    const tw = doc.getTextWidth(FRASE_LOP);
    doc.text(FRASE_LOP, L - M - tw, A - 7.2);
    doc.addImage(lop.url, lop.tipo, L - M - tw - 2 - w, A - 12.5, w, h);
    if (n > 1) doc.text(`${i} / ${n}`, M, A - 7.2);
  }
  return doc;
}

/** Gera o PDF e manda SÓ o arquivo pelo WhatsApp, sem mensagem (pedido dele,
    27/10/2026). Celular/Windows: compartilha o arquivo direto (escolhe o
    WhatsApp e o contato). Onde não dá: baixa o PDF e abre o WhatsApp para anexar. */
export async function enviarWhatsapp(o, botao) {
  const rotulo = botao && botao.innerHTML;
  if (botao) { botao.disabled = true; botao.textContent = 'Preparando…'; }
  try {
    const doc = await montarPdf(o);
    const nome = String(o.arquivo || 'Relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_') + '.pdf';
    const arq = new File([doc.output('blob')], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [arq] })) {
      try { await navigator.share({ files: [arq] }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(arq), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    window.open('https://web.whatsapp.com/', '_blank', 'noopener');
    window.aviso && window.aviso('PDF baixado (' + nome + '). Anexe o arquivo na conversa do WhatsApp que abriu.');
  } catch (e) {
    window.aviso && window.aviso('Não consegui montar o PDF: ' + (e.message || e), true);
  } finally {
    if (botao) { botao.disabled = false; botao.innerHTML = rotulo; }
  }
}

/** Rodapé das folhas em HTML (prévia e impressão), igual ao do Pessoas. */
export const rodapeLop = () => `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">${FRASE_LOP}</span></footer>`;
export const botaoZap = id => `<button class="btn btn-zap" type="button" id="${id}"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button>`;
