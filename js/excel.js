// excel.js — motor único de exportação .xlsx (01/10/2026, D-13)
//
// Uma função só para o app inteiro: baixarXlsx(nome, abas). A formatação é
// declarada aqui, uma vez, no estilo das planilhas do Guilherme: Arial,
// cabeçalho verde SAKUMA com letra branca, grade visível, linhas alternadas
// em verde claro e linha de total sombreada. Sem preto: texto em cinza SAKUMA.
//
// A biblioteca (xlsx-js-style, Apache-2.0, sobre o SheetJS 0.18.5) mora em
// vendor/ e só carrega quando alguém pede um Excel — não pesa a abertura.

const VERDE = '84BD00', MARROM = '744F28', CINZA = '51534A', CLARO = 'EEF6DC', TOTAL = 'D5E8A6';

let carregando = null;
function biblioteca() {
  if (window.XLSX?.utils) return Promise.resolve(window.XLSX);
  if (!carregando) carregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx-js-style.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { carregando = null; falha(new Error('Não consegui carregar o gerador de Excel (sem internet?).')); };
    document.head.appendChild(s);
  });
  return carregando;
}

const borda = { style: 'thin', color: { rgb: 'B7B9AE' } };
const GRADE = { top: borda, bottom: borda, left: borda, right: borda };
const fonte = (extra = {}) => ({ name: 'Arial', sz: 10, color: { rgb: CINZA }, ...extra });

/**
 * Baixa um .xlsx.
 * @param {string} nome  nome do arquivo (sem extensão)
 * @param {Array<{nome:string, titulo?:string, subtitulo?:string,
 *   colunas:Array<{rot:string, larg?:number, tipo?:'texto'|'num'|'pct'|'data'|'horas', casas?:number}>,
 *   linhas:Array<Array<any>>, total?:Array<any>, notas?:string[]}>} abas
 *   pct = fração (0,031 sai 3,1%); data = 'AAAA-MM-DD'.
 */
export async function baixarXlsx(nome, abas) {
  const XLSX = await biblioteca();
  const wb = XLSX.utils.book_new();
  for (const aba of abas) {
    const linhas = [];
    let r0 = 0;
    if (aba.titulo) { linhas.push([aba.titulo]); r0++; }
    if (aba.subtitulo) { linhas.push([aba.subtitulo]); r0++; }
    if (r0) { linhas.push([]); r0++; }
    const cab = r0;
    linhas.push(aba.colunas.map(c => c.rot));
    aba.linhas.forEach(l => linhas.push(l.map((v, i) => valor(v, aba.colunas[i]))));
    const linhaTotal = aba.total ? linhas.push(aba.total.map((v, i) => valor(v, aba.colunas[i]))) - 1 : -1;
    (aba.notas || []).forEach((n, i) => { if (i === 0) linhas.push([]); linhas.push([n]); });

    const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
    const nCol = aba.colunas.length;
    for (let r = 0; r < linhas.length; r++) {
      for (let c = 0; c < nCol; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cel = ws[ref];
        if (r < cab) {
          if (cel) cel.s = { font: fonte(r === 0 && aba.titulo ? { bold: true, sz: 14, color: { rgb: MARROM } } : { sz: 10 }) };
          continue;
        }
        if (r > cab + aba.linhas.length + (aba.total ? 1 : 0)) {   // notas, depois da tabela
          if (cel) cel.s = { font: fonte({ sz: 9, italic: true }) };
          continue;
        }
        const col = aba.colunas[c];
        const st = { font: fonte(), border: GRADE, alignment: { vertical: 'top', wrapText: col.tipo === 'texto' || !col.tipo } };
        if (r === cab) {
          st.font = fonte({ bold: true, color: { rgb: 'FFFFFF' } });
          st.fill = { patternType: 'solid', fgColor: { rgb: VERDE } };
          st.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
        } else if (r === linhaTotal) {
          st.font = fonte({ bold: true });
          st.fill = { patternType: 'solid', fgColor: { rgb: TOTAL } };
        } else if ((r - cab) % 2 === 1) {
          st.fill = { patternType: 'solid', fgColor: { rgb: CLARO } };
        }
        if (col.tipo === 'pct') st.numFmt = '0.0%';
        else if (col.tipo === 'num') st.numFmt = col.casas ? '#,##0.' + '0'.repeat(col.casas) : '#,##0';
        else if (col.tipo === 'horas') st.numFmt = '#,##0.0';
        else if (col.tipo === 'data') st.numFmt = 'dd/mm/yyyy';
        if (['pct', 'num', 'horas'].includes(col.tipo) && r !== cab) st.alignment = { horizontal: 'right', vertical: 'top' };
        if (!cel) ws[ref] = { t: 's', v: '', s: st }; else cel.s = st;
      }
    }
    ws['!cols'] = aba.colunas.map(c => ({ wch: c.larg || 14 }));
    if (aba.titulo) ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, nCol - 1) } }];
    ws['!freeze'] = { xSplit: 0, ySplit: cab + 1 };
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  }
  XLSX.writeFile(wb, `${nome}.xlsx`, { compression: true });
}

function valor(v, col = {}) {
  if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return '';
  if (col.tipo === 'data' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  return v;
}
