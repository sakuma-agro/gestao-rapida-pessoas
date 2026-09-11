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
   `situacao`. Aqui ele é traduzido para o mesmo formato, com o papel marcado
   para sair identificado na folha e no WhatsApp. */
const comoPessoa = e => ({
  id: e.id,
  nome: e.nome,
  nascimento: e.nascimento,
  situacao: e.ativo === false ? 'INATIVO' : 'ATIVO',
  papel: 'Empregador',
});

/**
 * Aniversariantes de um mês, em ordem de dia.
 * @param {Array} funcionarios  lista do cadastro
 * @param {number} mes          0 a 11
 * @param {boolean} soAtivos
 * @param {Array} empregadores  entram na mesma folha, marcados como empregador
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

/** O que vem entre parênteses depois do nome: apelido ou papel. */
export const marcaDe = a => a.apelido || a.papel || '';

/* ---------------- folha impressa ---------------- */
export function montarAniversarios(lista, mes, ano) {
  const titulo = `ANIVERSARIANTES DE ${MESES[mes].toUpperCase()}`;
  const total = Math.max(1, Math.ceil(lista.length / LINHAS_POR_FOLHA));
  const folhas = [];

  for (let p = 0; p < total; p++) {
    const fatia = lista.slice(p * LINHAS_POR_FOLHA, (p + 1) * LINHAS_POR_FOLHA);
    const linhas = fatia.length
      ? fatia.map(a => `<tr>
          <td class="an-dia">${String(a.dia).padStart(2, '0')}</td>
          <td class="an-nome">${esc(a.nome)}${marcaDe(a) ? ` <span class="an-apelido">(${esc(marcaDe(a))})</span>` : ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="2" class="an-vazio">Nenhum aniversariante neste mês.</td></tr>`;

    folhas.push(`<div class="an-folha">
      <div class="an-topo">
        <img src="${LOGO}" alt="">
        <div class="an-tit">
          <h1>${titulo}</h1>
          <p>${ano} · SAKUMA Agronegócios</p>
        </div>
      </div>
      <table class="an-tab">
        <colgroup><col style="width:18mm"><col></colgroup>
        <thead><tr><th>DIA</th><th>NOME</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
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
    (marcaDe(a) ? `${a.nome} (${marcaDe(a)})` : a.nome));
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
export function imagemAniversarios(lista, mes, ano) {
  return new Promise(pronto => {
    const marca = new Image();
    marca.onload = () => pronto(desenhar(marca, lista, mes, ano));
    marca.onerror = () => pronto(desenhar(null, lista, mes, ano));
    marca.src = LOGO;
  });
}

function desenhar(marca, lista, mes, ano) {
  const L = 1080, m = 64;                       // largura e margem
  const hTopo = 250, hTh = 78, hLin = 74;
  const temRecado = lista.length > 0;
  const alturaRecado = temRecado ? 250 : 0;
  const A = hTopo + hTh + Math.max(lista.length, 1) * hLin + alturaRecado + 130;

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

  // cabeçalho da tabela
  let y = hTopo;
  g.fillStyle = CORES.verde;
  g.fillRect(m, y, L - 2 * m, hTh);
  g.fillStyle = '#fff';
  g.font = 'bold 26px Arial, Helvetica, sans-serif';
  g.fillText('DIA', m + 26, y + 50);
  g.fillText('NOME', m + 150, y + 50);
  y += hTh;

  // linhas
  if (!lista.length) {
    g.fillStyle = CORES.suave;
    g.font = '28px Arial, Helvetica, sans-serif';
    g.fillText('Nenhum aniversariante neste mês.', m + 26, y + 46);
    y += hLin;
  }
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
    if (marcaDe(a)) {
      const larg = g.measureText(a.nome).width;
      g.fillStyle = CORES.suave;
      g.font = '30px Arial, Helvetica, sans-serif';
      g.fillText(` (${marcaDe(a)})`, m + 150 + larg, y + 48);
    }
    y += hLin;
  });

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

/** Nome do arquivo da imagem do mês. */
export const nomeImagem = (mes, ano) => `aniversariantes-${MESES[mes]}-${ano}.png`;
