// aniversarios.js — folha de aniversariantes do mês, em A4 retrato, no padrão
// visual da SAKUMA (verde #84BD00, marrom #744F28, cinza #51534A, Arial).
import { LOGO, PE_LOP } from './seed.js';
import { MESES } from './ficha.js';

// 15 cabem na folha junto com o recado de parabéns (que sai na última).
const LINHAS_POR_FOLHA = 15;

// Recado de parabéns. Sai na folha impressa e na mensagem do WhatsApp.
export const SAUDACAO_TITULO = 'FELIZ ANIVERSÁRIO!';
export const SAUDACAO = 'Desejamos que seu novo ciclo seja repleto de saúde, ' +
  'felicidade, realizações e muito sucesso.';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const partes = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? { ano: +m[1], mes: +m[2] - 1, dia: +m[3] } : null;
};

/* O empregador não é funcionário — vem de outra tabela e usa `ativo` em vez de
   `situacao`. Aqui ele é traduzido para o mesmo formato. O nome sai em
   maiúsculas para ficar igual aos do cadastro de funcionários, e nada marca
   que ele é empregador: na folha todo mundo é aniversariante do mês. */
const comoPessoa = e => ({
  id: e.id,
  empregador: true,                 // não tem foto no Drive; sai com as iniciais
  nome: String(e.nome || '').toUpperCase(),
  nascimento: e.nascimento,
  situacao: e.ativo === false ? 'INATIVO' : 'ATIVO',
});

/**
 * Aniversariantes de um mês, em ordem de dia.
 * @param {Array} funcionarios  lista do cadastro
 * @param {number} mes          0 a 11
 * @param {boolean} soAtivos
 * @param {Array} empregadores  entram na mesma folha, como todo mundo
 */
export function aniversariantes(funcionarios, mes, soAtivos = true, empregadores = []) {
  return [...funcionarios, ...empregadores.map(comoPessoa)]
    .filter(f => (!soAtivos || f.situacao === 'ATIVO'))
    .map(f => ({ f, p: partes(f.nascimento) }))
    .filter(x => x.p && x.p.mes === mes)
    .sort((a, b) => a.p.dia - b.p.dia || a.f.nome.localeCompare(b.f.nome, 'pt-BR'))
    .map(x => ({ ...x.f, dia: x.p.dia, nascimentoP: x.p }));
}

/** Quantos do cadastro ainda estão sem data de nascimento. */
export const semNascimento = (funcionarios, soAtivos = true, empregadores = []) =>
  [...funcionarios, ...empregadores.map(comoPessoa)]
    .filter(f => (!soAtivos || f.situacao === 'ATIVO') && !partes(f.nascimento)).length;

/* ---------------- folha impressa ----------------
   Dois formatos (pedido dele, 20/10/2026): a lista de sempre (dia e nome) e os
   cartões com foto. `fotos` é um Map id → endereço da foto (blob:); quem não
   tem foto, ou é empregador, sai com as iniciais num círculo verde.
   Cartões: 9 por folha (3 × 3), que é o que cabe com o recado de parabéns.   */
const CARTOES_POR_FOLHA = 9;

/** Iniciais do nome (primeiro e último), para o círculo de quem não tem foto. */
export const iniciais = nome => {
  const p = String(nome || '').trim().split(/\s+/)
    .filter(x => x && !['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(x.toUpperCase()));
  if (!p.length) return '';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

const cartao = (a, fotos) => {
  const url = fotos && fotos.get(String(a.id));
  return `<div class="an-cartao">
    <div class="an-foto">${url ? `<img src="${esc(url)}" alt="">` : `<span>${esc(iniciais(a.nome))}</span>`}</div>
    <div class="an-cdia">DIA ${String(a.dia).padStart(2, '0')}</div>
    <div class="an-cnome">${esc(a.nome)}${a.apelido ? ` <span class="an-apelido">(${esc(a.apelido)})</span>` : ''}</div>
  </div>`;
};

export function montarAniversarios(lista, mes, ano, fotos = null) {
  const titulo = `ANIVERSARIANTES DE ${MESES[mes].toUpperCase()}`;
  const porFolha = fotos ? CARTOES_POR_FOLHA : LINHAS_POR_FOLHA;
  const total = Math.max(1, Math.ceil(lista.length / porFolha));
  const folhas = [];

  for (let p = 0; p < total; p++) {
    const fatia = lista.slice(p * porFolha, (p + 1) * porFolha);
    const miolo = fotos
      ? (fatia.length
        ? `<div class="an-cartoes">${fatia.map(a => cartao(a, fotos)).join('')}</div>`
        : `<div class="an-vazio">Nenhum aniversariante neste mês.</div>`)
      : `<table class="an-tab">
        <colgroup><col style="width:18mm"><col></colgroup>
        <thead><tr><th>DIA</th><th>NOME</th></tr></thead>
        <tbody>${fatia.length
          ? fatia.map(a => `<tr>
          <td class="an-dia">${String(a.dia).padStart(2, '0')}</td>
          <td class="an-nome">${esc(a.nome)}${a.apelido ? ` <span class="an-apelido">(${esc(a.apelido)})</span>` : ''}</td>
        </tr>`).join('')
          : `<tr><td colspan="2" class="an-vazio">Nenhum aniversariante neste mês.</td></tr>`}</tbody>
      </table>`;

    folhas.push(`<div class="an-folha">
      <div class="an-topo">
        <img src="${LOGO}" alt="">
        <div class="an-tit">
          <h1>${titulo}</h1>
          <p>${ano} · SAKUMA Agronegócios</p>
        </div>
      </div>
      ${miolo}
      ${lista.length && p === total - 1 ? `<div class="an-saudacao">
        <strong>${SAUDACAO_TITULO}</strong>
        <p>${SAUDACAO}</p>
      </div>` : ''}
      <div class="an-pe">
        <span>${lista.length} aniversariante(s) em ${MESES[mes]}</span>
        <span>${total > 1 ? `folha ${p + 1} de ${total}` : ''}</span>
      </div>
      ${PE_LOP}
    </div>`);
  }
  return folhas.join('');
}

/* ---------------- WhatsApp ---------------- */
/** Texto para mandar no grupo. O WhatsApp usa *asterisco* para negrito. */
export function textoWhatsapp(lista, mes, ano) {
  const cabeca = `🎉 *Aniversariantes do mês de ${MESES[mes]}*`;
  if (!lista.length) return `${cabeca}\n\nNinguém faz aniversário neste mês.`;
  const linhas = lista.map(a =>
    `${String(a.dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')} - ` +
    (a.apelido ? `${a.nome} (${a.apelido})` : a.nome));
  return `${cabeca}\n\n${linhas.join('\n')}\n\n` +
    `*Feliz aniversário!* ${SAUDACAO}\n\nSAKUMA Agronegócios`;
}

/** Abre o WhatsApp já com o texto pronto; a conversa quem escolhe é ele. */
export const linkWhatsapp = texto => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/* ---------------- imagem para mandar no WhatsApp ----------------
   O link do wa.me só leva texto: não existe jeito de anexar arquivo por URL.
   Então a folha é redesenhada em um canvas e vira um PNG, que sai junto com o
   texto pelo compartilhamento do próprio Windows/Android (navigator.share).  */
const CORES = {
  verde: '#84BD00', marrom: '#744F28', cinza: '#51534A',
  suave: '#7d8175', linha: '#dfe2d8', faixa: '#f3f8e8',
};

/** Quebra o texto em linhas que cabem na largura pedida. */
function quebrar(g, texto, largura) {
  const linhas = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    const teste = atual ? `${atual} ${p}` : p;
    if (g.measureText(teste).width > largura && atual) { linhas.push(atual); atual = p; }
    else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Desenha a folha do mês e devolve um PNG (Blob).
 * Mesmas cores e mesma ordem da versão impressa.
 */
const carregarImagem = src => new Promise(pronto => {
  if (!src) return pronto(null);
  const i = new Image();
  i.onload = () => pronto(i);
  i.onerror = () => pronto(null);
  i.src = src;
});

/** @param fotos Map id → endereço da foto; com ele a imagem sai em cartões */
export async function imagemAniversarios(lista, mes, ano, fotos = null) {
  const marca = await carregarImagem(LOGO);
  let imagens = null;
  if (fotos) {
    imagens = new Map();
    await Promise.all(lista.map(async a => {
      const i = await carregarImagem(fotos.get(String(a.id)));
      if (i) imagens.set(String(a.id), i);
    }));
  }
  return desenhar(marca, lista, mes, ano, imagens);
}

// cartões da imagem: 3 por linha
const CW = 300, CG = 26, CH = 350, FOTO_D = 184;

function desenhar(marca, lista, mes, ano, imagens) {
  const L = 1080, m = 64;                       // largura e margem
  const hTopo = 250, hTh = 78, hLin = 74;
  const temRecado = lista.length > 0;
  const alturaRecado = temRecado ? 250 : 0;
  const linhasCartoes = Math.ceil(Math.max(lista.length, 1) / 3);
  const alturaMiolo = imagens
    ? (lista.length ? linhasCartoes * (CH + CG) : hLin)
    : hTh + Math.max(lista.length, 1) * hLin;
  const A = hTopo + alturaMiolo + alturaRecado + 130;

  const tela = document.createElement('canvas');
  tela.width = L; tela.height = A;
  const g = tela.getContext('2d');
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff'; g.fillRect(0, 0, L, A);

  // marca + título
  if (marca) {
    const h = 130, w = h * (marca.naturalWidth / marca.naturalHeight);
    g.drawImage(marca, m, 52, w, h);
  }
  const xTit = m + 170;
  g.fillStyle = CORES.marrom;
  g.font = 'bold 42px Arial, Helvetica, sans-serif';
  g.fillText(`ANIVERSARIANTES DE ${MESES[mes].toUpperCase()}`, xTit, 118);
  g.fillStyle = CORES.cinza;
  g.font = '26px Arial, Helvetica, sans-serif';
  g.fillText(`${ano} · SAKUMA Agronegócios`, xTit, 160);
  g.fillStyle = CORES.verde;
  g.fillRect(m, 200, L - 2 * m, 6);

  let y = hTopo;
  if (!lista.length) {
    if (!imagens) {
      g.fillStyle = CORES.verde; g.fillRect(m, y, L - 2 * m, hTh);
      g.fillStyle = '#fff'; g.font = 'bold 26px Arial, Helvetica, sans-serif';
      g.fillText('DIA', m + 26, y + 50); g.fillText('NOME', m + 150, y + 50);
      y += hTh;
    }
    g.fillStyle = CORES.suave;
    g.font = '28px Arial, Helvetica, sans-serif';
    g.fillText('Nenhum aniversariante neste mês.', m + 26, y + 46);
    y += hLin;
  } else if (imagens) {
    y = desenharCartoes(g, lista, imagens, m, y);
  } else {
    y = desenharLinhas(g, lista, L, m, y, hTh, hLin);
  }

  // recado de parabéns
  if (temRecado) {
    y += 56;
    const alt = 170;
    g.strokeStyle = CORES.verde; g.lineWidth = 4;
    g.strokeRect(m + 2, y, L - 2 * m - 4, alt);
    g.textAlign = 'center';
    g.fillStyle = CORES.marrom;
    g.font = 'bold 32px Arial, Helvetica, sans-serif';
    g.fillText(SAUDACAO_TITULO, L / 2, y + 62);
    g.fillStyle = CORES.cinza;
    g.font = '27px Arial, Helvetica, sans-serif';
    quebrar(g, SAUDACAO, L - 2 * m - 90).forEach((linha, i) => {
      g.fillText(linha, L / 2, y + 110 + i * 38);
    });
    g.textAlign = 'left';
    y += alt;
  }

  // rodapé
  g.fillStyle = CORES.linha;
  g.fillRect(m, A - 74, L - 2 * m, 1);
  g.fillStyle = CORES.suave;
  g.font = '24px Arial, Helvetica, sans-serif';
  g.fillText('SAKUMA Agronegócios', m, A - 34);

  return new Promise(pronto => tela.toBlob(pronto, 'image/png'));
}

/** Lista de sempre: cabeçalho verde e uma linha por pessoa. Devolve o y final. */
function desenharLinhas(g, lista, L, m, y, hTh, hLin) {
  g.fillStyle = CORES.verde;
  g.fillRect(m, y, L - 2 * m, hTh);
  g.fillStyle = '#fff';
  g.font = 'bold 26px Arial, Helvetica, sans-serif';
  g.fillText('DIA', m + 26, y + 50);
  g.fillText('NOME', m + 150, y + 50);
  y += hTh;
  lista.forEach((a, i) => {
    if (i % 2 === 1) { g.fillStyle = CORES.faixa; g.fillRect(m, y, L - 2 * m, hLin); }
    g.fillStyle = CORES.linha;
    g.fillRect(m, y + hLin - 1, L - 2 * m, 1);
    g.fillStyle = CORES.marrom;
    g.font = 'bold 30px Arial, Helvetica, sans-serif';
    g.fillText(String(a.dia).padStart(2, '0'), m + 26, y + 48);
    g.fillStyle = CORES.cinza;
    g.font = 'bold 30px Arial, Helvetica, sans-serif';
    g.fillText(a.nome, m + 150, y + 48);
    if (a.apelido) {
      const larg = g.measureText(a.nome).width;
      g.fillStyle = CORES.suave;
      g.font = '30px Arial, Helvetica, sans-serif';
      g.fillText(` (${a.apelido})`, m + 150 + larg, y + 48);
    }
    y += hLin;
  });
  return y;
}

/** Cartões com foto, 3 por linha. Devolve o y final. */
function desenharCartoes(g, lista, imagens, m, y) {
  lista.forEach((a, i) => {
    const x = m + (i % 3) * (CW + CG);
    const yc = y + Math.floor(i / 3) * (CH + CG);
    // moldura do cartão
    g.fillStyle = '#fff'; g.strokeStyle = CORES.linha; g.lineWidth = 2;
    arredondado(g, x, yc, CW, CH, 14); g.fill(); g.stroke();
    // foto redonda (ou iniciais)
    const cx = x + CW / 2, cy = yc + 24 + FOTO_D / 2, r = FOTO_D / 2;
    const img = imagens.get(String(a.id));
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath(); g.clip();
    if (img) {
      const esc = Math.max(FOTO_D / img.naturalWidth, FOTO_D / img.naturalHeight);
      const w = img.naturalWidth * esc, h = img.naturalHeight * esc;
      g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    } else {
      g.fillStyle = CORES.faixa; g.fillRect(cx - r, cy - r, FOTO_D, FOTO_D);
      g.fillStyle = CORES.verde; g.textAlign = 'center';
      g.font = 'bold 64px Arial, Helvetica, sans-serif';
      g.fillText(iniciais(a.nome), cx, cy + 23);
    }
    g.restore();
    g.strokeStyle = CORES.verde; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    // dia e nome
    g.textAlign = 'center';
    g.fillStyle = CORES.marrom;
    g.font = 'bold 22px Arial, Helvetica, sans-serif';
    g.fillText(`DIA ${String(a.dia).padStart(2, '0')}`, cx, yc + 24 + FOTO_D + 40);
    g.fillStyle = CORES.cinza;
    g.font = 'bold 23px Arial, Helvetica, sans-serif';
    const nome = a.apelido ? `${a.nome} (${a.apelido})` : a.nome;
    quebrar(g, nome, CW - 28).slice(0, 3).forEach((l, k) => {
      g.fillText(l, cx, yc + 24 + FOTO_D + 74 + k * 29);
    });
    g.textAlign = 'left';
  });
  return y + Math.ceil(lista.length / 3) * (CH + CG) - CG;
}

function arredondado(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/** Nome do arquivo da imagem do mês. */
export const nomeImagem = (mes, ano) => `aniversariantes-${MESES[mes]}-${ano}.png`;
