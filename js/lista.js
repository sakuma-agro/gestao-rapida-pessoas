// lista.js — reproduz o formulário FORMAGR-018 "LISTA DE PRESENÇA" em A4 retrato.
//
// As medidas saíram do PDF gerado pelo próprio Word, em milímetros. O desenho
// vertical é igual ao do arquivo original; a largura foi esticada para ocupar a
// folha inteira, que foi o pedido: tudo que estava em "x" no Word vira
// X(x) = 5 + (x - 15) * K, com K escolhido para a tabela de participantes
// terminar a 5 mm da borda direita.
import { LOGO } from './seed.js';

const K = 200 / 180.6;                       // 15,0 → 195,6 mm vira 5,0 → 205,0 mm
const X = x => +(5 + (x - 15) * K).toFixed(2);
const L = (a, b) => +((b - a) * K).toFixed(2);

/* Textos do cabeçalho. Ficam salvos no banco (modelo.lista) e valem para os
   dois usuários; estes aqui são só o ponto de partida. */
export const LISTA_PADRAO = {
  titulo: 'LISTA DE PRESENÇA',
  codigo: 'FORMAGR-018-00',
  data: '14/12/2025',
  revisao: '01',
  elaboracao: 'Consultora - Camila Schorr Reinert',
  aprovacao: 'Produtor – Fabio Massao Sakuma',
};

export const listaAtual = modelo => ({ ...LISTA_PADRAO, ...(modelo?.lista || {}) });

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- posições verticais (mm, medidas no PDF do Word) ---------- */
const CAB_TOPO = 12.6;          // topo da moldura do cabeçalho
const ALT = [6.2, 6.3, 6.2, 24.3, 10.4, 6.2];   // alturas das 6 linhas do cabeçalho
const TAB1_TOPO = 222.8;        // tabela de participantes na 1ª página
const TAB_TOPO = 22.6;          // tabela nas páginas seguintes
const H_CAB = 10.1;             // linha NOME / FUNÇÃO / ASSINATURA
const H_LIN = 12.0;             // cada linha de participante
const LIM = 290;                // até onde a impressora alcança na folha

export const LINHAS_PAG1 = Math.floor((LIM - TAB1_TOPO - H_CAB) / H_LIN);  // 4
export const LINHAS_PAG = Math.floor((LIM - TAB_TOPO) / H_LIN);            // 22

/* ---------- peças soltas posicionadas na folha ---------- */
// texto ancorado pela linha de base (é assim que o Word alinha com os traços)
const txt = (x, base, pt, conteudo, extra = '') => {
  const alt = pt * 0.3528;                       // pt → mm
  return `<div class="lp-t" style="left:${X(x)}mm;top:${(base - alt * 0.8).toFixed(2)}mm;` +
    `font-size:${pt}pt;${extra}">${conteudo}</div>`;
};
// Traço horizontal. É desenhado como BORDA, não como fundo: o Chrome só imprime
// cor de fundo se a opção "Gráficos de plano de fundo" estiver marcada, e sem
// ela as linhas de preencher à mão sumiam da folha.
const reg = (x1, x2, y, esp = 0.18) =>
  `<div class="lp-r" style="left:${X(x1)}mm;top:${y}mm;width:${L(x1, x2)}mm;` +
  `border-top-width:${esp}mm"></div>`;

/* ---------- cabeçalho (moldura de cima) ---------- */
function cabecalho(cfg, pagina, total) {
  const c = [38.2, 81.0, 19.6, 36.1];
  const soma = c.reduce((a, b) => a + b, 0);
  const cols = c.map(v => `<col style="width:${(v / soma * 100).toFixed(3)}%">`).join('');
  const linha = (rot, val) =>
    `<tr style="height:${ALT[0]}mm"><td class="lp-rot">${esc(rot)}</td>` +
    `<td class="lp-val">${esc(val)}</td></tr>`;

  return `<table class="lp-cab" style="left:${X(15)}mm;top:${CAB_TOPO}mm;width:${L(15, 190.1)}mm">
    <colgroup>${cols}</colgroup><tbody>
    <tr style="height:${ALT[0]}mm">
      <td class="lp-logo" rowspan="4"><img src="${LOGO}" alt=""></td>
      <td class="lp-titulo" rowspan="4">${esc(cfg.titulo)}</td>
      <td class="lp-rot">Código:</td><td class="lp-val">${esc(cfg.codigo)}</td>
    </tr>
    ${linha('Data:', cfg.data)}
    ${linha('Revisão:', cfg.revisao)}
    <tr style="height:${ALT[3]}mm">
      <td class="lp-rot">Página:</td><td class="lp-val">${pagina} de ${total}</td>
    </tr>
    <tr style="height:${ALT[4]}mm">
      <td class="lp-rot">Elaboração/<br>Revisão:</td>
      <td class="lp-val lp-esq" colspan="3">${esc(cfg.elaboracao)}</td>
    </tr>
    <tr style="height:${ALT[5]}mm">
      <td class="lp-rot">Aprovação:</td>
      <td class="lp-val lp-esq" colspan="3">${esc(cfg.aprovacao)}</td>
    </tr>
  </tbody></table>`;
}

/* ---------- miolo em branco: data, propriedade, temas, horário, ministrante ---------- */
function miolo(d = {}) {
  const sub = t => `<span class="lp-sub">${t}</span>`;   // palavra sublinhada
  // texto digitado em cima do traço de preencher à mão (baseline 1,4 mm acima)
  const sobre = (x, y, v) => v ? txt(x, y - 1.4, 11, esc(v)) : '';
  // temas: até 3 linhas; quebra em espaço quando a linha passa de ~80 letras
  const temas = [];
  String(d.tema || '').split(/\r?\n/).forEach(l => {
    let r = l.trim();
    while (r.length > 80) {
      let i = r.lastIndexOf(' ', 80); if (i < 40) i = 80;
      temas.push(r.slice(0, i)); r = r.slice(i).trim();
    }
    if (r) temas.push(r);
  });
  return [
    // Data: ___/___/___   Nome/Assinatura: __________
    txt(18.2, 81.2, 12, 'Data:'),
    reg(28.3, 38.9, 81.7), txt(38.9, 81.2, 12, '/'),
    reg(40.5, 51.1, 81.7), txt(51.1, 81.2, 12, '/'),
    reg(52.7, 65.4, 81.7),
    txt(66.4, 81.2, 12, 'Nome/Assinatura:'),
    reg(97.7, 187.0, 81.7),

    // Propriedade: _______________________________
    txt(17.9, 91.5, 12, 'Propriedade:'),
    reg(15.0, 177.2, 97.3, 0.3),

    // I. TEMAS
    txt(21.4, 116.5, 11, 'I.', 'font-weight:bold'),
    txt(34.1, 116.5, 11, sub('TEMAS'), 'font-weight:bold'),
    reg(27.7, 187.9, 124.6), reg(27.7, 187.9, 132.3), reg(27.7, 187.9, 140.1),
    sobre(28.5, 124.6, temas[0]), sobre(28.5, 132.3, temas[1]), sobre(28.5, 140.1, temas[2]),

    // II. HORÁRIO
    txt(21.4, 154.0, 11, 'II.', 'font-weight:bold'),
    txt(35.0, 154.0, 11, sub('HORÁRIO'), 'font-weight:bold'),
    reg(27.7, 187.9, 169.8),
    sobre(28.5, 169.8, d.horario),

    // III. MINISTRANTE
    txt(21.4, 183.7, 11, 'III.', 'font-weight:bold'),
    txt(35.0, 183.7, 11, sub('MINISTRANTE'), 'font-weight:bold'),
    txt(20.3, 198.0, 11, 'Nome:', 'font-weight:bold'),
    reg(32.0, 109.0, 198.4),
    sobre(32.8, 198.4, d.ministrante),
    txt(109.0, 198.0, 11, 'Assinatura:', 'font-weight:bold'),
    reg(128.1, 190.6, 198.4),

    // IV. PARTICIPANTES
    txt(21.4, 212.2, 11, 'IV.', 'font-weight:bold'),
    txt(35.0, 212.2, 11, sub('PARTICIPANTES'), 'font-weight:bold'),
  ].join('');
}

/* ---------- tabela de participantes ---------- */
function tabela(topo, itens, comCabecalho) {
  const linhas = itens.map(p => `<tr style="height:${H_LIN}mm">` +
    `<td>${esc(p?.nome || '')}</td><td>${esc(p?.cargo || '')}</td><td></td></tr>`).join('');
  const cab = comCabecalho
    ? `<tr class="lp-th" style="height:${H_CAB}mm">` +
      '<td><span class="lp-sub">NOME</span></td>' +
      '<td><span class="lp-sub">FUNÇÃO</span></td>' +
      '<td><span class="lp-sub">ASSINATURA</span></td></tr>'
    : '';
  return `<table class="lp-tab" style="left:${X(17.2)}mm;top:${topo}mm;width:${L(17.2, 195.6)}mm">
    <colgroup><col style="width:33.32%"><col style="width:33.24%"><col style="width:33.44%"></colgroup>
    <tbody>${cab}${linhas}</tbody></table>`;
}

/* ---------- topo das páginas seguintes ---------- */
function faixa(cfg, pagina, total) {
  const t = `${esc(cfg.codigo)} &nbsp;–&nbsp; Lista de Presença &nbsp;&nbsp; Página ${pagina} de ${total}`;
  return `<div class="lp-faixa" style="left:${X(17.2)}mm;top:${(16.4 - 4.233 * 0.8).toFixed(2)}mm;` +
    `width:${L(17.2, 195.6)}mm">${t}</div>` +
    reg(17.2, 195.6, 17.6, 0.5);
}

/**
 * Monta as folhas da lista de presença.
 * @param {Array} participantes  funcionários marcados ({nome, cargo})
 * @param {Object} cfg           textos do cabeçalho (listaAtual(modelo))
 * @param {Object} dados         {tema, horario, ministrante} digitados para esta lista
 */
export function montarLista(participantes, cfg, dados = {}) {
  const gente = participantes.slice();

  // as sobras completam a última página com linhas em branco
  const total = gente.length <= LINHAS_PAG1
    ? 1
    : 1 + Math.ceil((gente.length - LINHAS_PAG1) / LINHAS_PAG);

  const folhas = [];
  for (let p = 1; p <= total; p++) {
    const quantas = p === 1 ? LINHAS_PAG1 : LINHAS_PAG;
    const de = p === 1 ? 0 : LINHAS_PAG1 + (p - 2) * LINHAS_PAG;
    const itens = Array.from({ length: quantas }, (_, i) => gente[de + i] || null);
    // 1ª folha: moldura da marca + campos em branco. Seguintes: só a faixa de
    // continuação e a tabela, igual ao arquivo do Word.
    folhas.push('<div class="lp-folha">' +
      (p === 1 ? cabecalho(cfg, 1, total) + miolo(dados) : faixa(cfg, p, total)) +
      tabela(p === 1 ? TAB1_TOPO : TAB_TOPO, itens, p === 1) +
      '</div>');
  }
  return folhas.join('');
}
