// ficha-cadastral.js — a "Ficha do Funcionário": os dados básicos do cadastro
// numa folha A4, uma pessoa por folha.
//
// Não é a ficha de EPI (essa é a ficha.js, que reproduz a planilha célula por
// célula). Aqui é documento de consulta: sai do botão "Ficha" da lista do
// Cadastro · Nível 1 e serve para levar o cadastro ao campo, conferir com a
// pessoa ou anexar a uma pasta.
//
// Identidade: padrão SAKUMA — verde #84BD00, marrom #744F28, cinza #51534A,
// Arial, sem preto. As classes (.rel, .rel-ficha, .rel-nota) vêm do
// css/jornada-impressao.css, que o index.html já carrega para o app inteiro.
// Nenhum CSS novo: um arquivo de módulo não pode declarar @page.
//
// Escolhas confirmadas pelo Guilherme em 18/09/2026:
//   conteúdo — só o básico (sem documentos, endereço e emergência)
//   formato  — uma ficha por folha
//   emissão  — só o botão individual na lista
//   rodapé   — só a data de emissão, sem linha de assinatura

const $ = id => document.getElementById(id);

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/* CPF e telefone saem formatados; se o cadastro tiver algo fora do padrão,
   o valor original é mostrado como está — não se inventa máscara. */
const cpfBr = v => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v || '');
};
const telBr = v => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
};

/* Idade e tempo de casa não são campo do cadastro: são conta feita na hora,
   a partir de nascimento e admissão. Por isso aparecem como complemento da
   data, em letra menor, e não como dado próprio. */
function anosDesde(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Date();
  let a = h.getFullYear() - d.getFullYear();
  const mes = h.getMonth() - d.getMonth();
  if (mes < 0 || (mes === 0 && h.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

const campo = (rotulo, valor, extra = '') => {
  const v = String(valor == null ? '' : valor).trim();
  return `<div><span>${esc(rotulo)}</span><b>${v ? esc(v) : '—'}` +
    (v && extra ? ` <small style="font-weight:400;color:#8A8D86">${esc(extra)}</small>` : '') +
    '</b></div>';
};

/** O documento em si. Recebe o funcionário como está no cadastro. */
export function documentoFichaCadastral(f) {
  const idade = anosDesde(f.nascimento);
  const casa = anosDesde(f.admissao);
  const situacao = String(f.situacao || '').toUpperCase();

  const corpo = `
    <h2 class="rel-unidade" style="font-size:17px;margin-top:4px">${esc(f.nome || '—')}
      <small>${esc(f.cargo || 'sem função registrada')}${f.apelido ? ` · conhecido como ${esc(f.apelido)}` : ''}</small>
    </h2>

    <div class="rel-ficha">
      ${campo('Nº de cadastro', f.cadastro)}
      ${campo('CPF', cpfBr(f.cpf))}
      ${campo('Situação', situacao)}
      ${campo('Nascimento', dataBr(f.nascimento), idade == null ? '' : `${idade} anos`)}
      ${campo('Admissão', dataBr(f.admissao), casa == null ? '' : (casa < 1 ? 'menos de 1 ano de casa' : `${casa} ano${casa > 1 ? 's' : ''} de casa`))}
      ${campo('Telefone', telBr(f.telefone))}
      ${campo('Empregador', f.empregador)}
      ${campo('Fazenda', f.fazenda)}
      ${campo('Setor', f.setor)}
    </div>

    <p class="rel-nota">Documento de uso interno, emitido do cadastro do Gestão Rápida (Pessoas).
      Traz apenas os dados básicos: documentos, endereço e contato de emergência ficam no cadastro,
      na tela de edição do funcionário.</p>`;

  return `
  <article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>Ficha do Funcionário</h1>
        <p>Dados básicos do cadastro · SAKUMA Agronegócios</p>
      </div>
      <div class="rel-comp">
        <span>emitido em</span>
        <strong>${dataBr(hoje())}</strong>
        <span>${f.cadastro ? `nº ${esc(f.cadastro)}` : ''}</span>
      </div>
    </header>
    ${corpo}
    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

/* ------------------------------------------------------------------
   Prévia e impressão — mesmo caminho dos outros documentos do app:
   o HTML vai para #jorImpressao (que fica fora do #app) e a classe
   jor-imprimindo no body manda só ele para o papel.
   ------------------------------------------------------------------ */

let documentoAtual = '';
let tituloAtual = '';
const limparNome = t => String(t || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

/** Mostra a ficha na prévia e acende a barra de impressão. */
export function verFichaCadastral(f) {
  if (!f) return;
  const alvo = $('jorImpressao');
  if (!alvo) return;
  documentoAtual = documentoFichaCadastral(f);
  // É o document.title que vira o nome do arquivo no "Salvar como PDF".
  tituloAtual = limparNome(`Ficha do funcionario - ${f.nome || ''}`);
  alvo.innerHTML = documentoAtual;
  alvo.hidden = false;
  const barra = $('barraFichaCad');
  if (barra) barra.hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function fecharFichaCadastral() {
  documentoAtual = '';
  const alvo = $('jorImpressao');
  if (alvo) { alvo.innerHTML = ''; alvo.hidden = true; }
  const barra = $('barraFichaCad');
  if (barra) barra.hidden = true;
}

export function imprimirFichaCadastral() {
  if (!documentoAtual) return;
  const tituloDaAba = document.title;
  if (tituloAtual) document.title = tituloAtual;
  document.body.classList.add('jor-imprimindo');
  const soltar = () => {
    document.body.classList.remove('jor-imprimindo');
    document.title = tituloDaAba;
    removeEventListener('afterprint', soltar);
  };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);   // navegador que não dispara afterprint
}
