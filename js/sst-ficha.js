// sst-ficha.js — a ficha de SST de uma pessoa só: como estão os exames dela,
// ou como estão os treinamentos dela, numa folha A4.
//
// Sai do botão "Relatório do funcionário", nas duas telas de Vencimentos. As
// telas de lá olham a empresa inteira, linha por linha; esta folha vira o
// retrato de uma pessoa — para entregar ao técnico de segurança, levar à
// reunião ou guardar na pasta dela.
//
// Escolhas confirmadas pelo Guilherme em 18/09/2026:
//   documento — exames num, treinamentos noutro (não é uma folha só com os dois)
//   conteúdo  — só o que vale hoje: o lançamento mais recente de cada tipo
//   faltas    — bloco de pendências, com o que a função exige e nunca foi lançado
//               (só nos exames: treinamento não tem lista por função no app)
//
// Este arquivo não conhece o banco nem o estado do SST: recebe tudo pronto de
// quem chama (o sst.js) e devolve HTML. Assim não há import cruzado entre os
// dois, e a folha pode ser testada com dados de mentira.
//
// Identidade: padrão SAKUMA pela moldura `.rel` do css/jornada-impressao.css —
// verde #84BD00, marrom #744F28, cinza #51534A, Arial, sem preto. Nenhum CSS
// novo: arquivo de módulo não declara @page.

const $ = id => document.getElementById(id);

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/* A cor da situação vem das classes que a folha de vencimentos já usa
   (.sst-vencido, .sst-vencendo, no css/app.css) — é letra colorida, não fundo,
   então imprime mesmo com "gráficos de plano de fundo" desligado. */
const classeSit = chave =>
  chave === 'vencido' ? 'sst-vencido' : chave === 'vencendo' ? 'sst-vencendo' : '';

const campo = (rotulo, valor) => {
  const v = String(valor == null ? '' : valor).trim();
  return `<div><span>${esc(rotulo)}</span><b>${v ? esc(v) : '—'}</b></div>`;
};

/**
 * A folha.
 *
 * @param {object} d
 *   d.tipo         'exame' | 'treinamento'
 *   d.funcionario  { nome, cargo, cadastro, situacao, empregador, fazenda, admissao }
 *   d.linhas       o vigente de cada tipo, já ordenado:
 *                  { nome, realizado, vence, sit:{chave,rotulo}, carga, instrutor,
 *                    conferencia:{feitos,total,completo}|null }
 *   d.pendencias   [{ nome }] — exigido pela função e nunca lançado (só exames)
 *   d.funcaoSemLista  true quando a função da pessoa ainda não tem lista de exames
 */
export function documentoFichaSst(d) {
  const ex = d.tipo === 'exame';
  const f = d.funcionario || {};
  const linhas = d.linhas || [];
  const pend = d.pendencias || [];

  const conta = ch => linhas.filter(l => l.sit.chave === ch).length;
  const vencidos = conta('vencido');
  const vencendo = conta('vencendo');
  const emDia = conta('emdia');
  const semVal = conta('semvalidade');

  /* O resumo em uma frase: é a primeira coisa que alguém lê nesta folha, e
     tem que responder "essa pessoa está regular ou não?" sem contar linha. */
  const partes = [];
  if (vencidos) partes.push(`<b class="sst-vencido">${vencidos} vencido(s)</b>`);
  if (vencendo) partes.push(`<b class="sst-vencendo">${vencendo} vencendo em até 30 dias</b>`);
  if (emDia) partes.push(`<b>${emDia} em dia</b>`);
  if (semVal) partes.push(`${semVal} sem validade`);
  if (pend.length) partes.push(`<b class="sst-vencido">${pend.length} nunca realizado(s)</b>`);

  const resumo = `<div class="rel-resumo">
    ${linhas.length || pend.length
      ? `${esc(f.nome || 'A pessoa')} tem ${linhas.length} ${ex ? 'exame' : 'treinamento'}(s)
         lançado(s): ${partes.join(' · ')}.`
      : `Não há nenhum ${ex ? 'exame' : 'treinamento'} lançado para esta pessoa.`}
  </div>`;

  /* Carga horária, instrutor e observação vão embaixo do nome, em letra de
     nota, e não em colunas próprias: com seis colunas a tabela não cabia na
     largura do celular e a folha ganhava rolagem lateral. */
  const detalhe = l => {
    const partes = [];
    if (l.carga) partes.push(`${Number(l.carga)} h`);
    if (l.instrutor) partes.push(String(l.instrutor));
    if (l.observacao) partes.push(String(l.observacao));
    return partes.length ? `<br><span class="rel-mini">${esc(partes.join(' · '))}</span>` : '';
  };

  const tabela = linhas.length ? `
    <table class="rel-tabela">
      <thead><tr>
        <th>${ex ? 'EXAME' : 'TREINAMENTO'}</th>
        <th class="ce" style="width:14%">REALIZADO</th>
        <th class="ce" style="width:14%">VENCE</th>
        <th style="width:26%">SITUAÇÃO</th>
      </tr></thead>
      <tbody>
        ${linhas.map(l => `<tr>
          <td><b>${esc(l.nome)}</b>${ex
            ? (l.observacao ? `<br><span class="rel-mini">${esc(l.observacao)}</span>` : '')
            : detalhe(l)}</td>
          <td class="ce">${dataBr(l.realizado)}</td>
          <td class="ce">${dataBr(l.vence)}</td>
          <td class="${classeSit(l.sit.chave)}">${esc(l.sit.rotulo)}${
            l.conferencia && !l.conferencia.completo
              ? `<br><span class="rel-mini">faltam ${l.conferencia.total - l.conferencia.feitos}
                 de ${l.conferencia.total} exames da função neste ASO</span>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>`
    : `<p class="rel-vazio">Nenhum ${ex ? 'exame' : 'treinamento'} lançado para esta pessoa.</p>`;

  /* As pendências não entram na tabela de cima: lá é o que existe, aqui é o
     que falta. Misturar as duas coisas numa tabela só faria a pessoa parecer
     ter lançamento onde não tem. */
  const blocoPendencias = !ex ? '' : pend.length ? `
    <h2 class="rel-unidade">Exames da função que nunca foram lançados
      <small>${pend.length} exame(s) que a função ${esc(f.cargo || '—')} exige e não aparecem no
        histórico desta pessoa — nem como lançamento próprio, nem marcados dentro de um ASO</small>
    </h2>
    <table class="rel-tabela">
      <thead><tr><th>EXAME</th><th style="width:28%">SITUAÇÃO</th></tr></thead>
      <tbody>${pend.map(p => `<tr>
        <td><b>${esc(p.nome)}</b></td>
        <td class="sst-vencido">Nunca realizado</td>
      </tr>`).join('')}</tbody>
    </table>`
    : d.funcaoSemLista ? `
    <p class="rel-nota">A função ${esc(f.cargo || '—')} ainda não tem lista de exames montada em
      <b>SST · Exames · Exames por função</b>, então esta folha não consegue apontar o que falta.</p>`
    : `<p class="rel-nota">Nenhuma pendência: todos os exames que a função
      ${esc(f.cargo || '—')} exige já aparecem no histórico desta pessoa.</p>`;

  const nota = ex
    ? `Documento de uso interno, emitido do Gestão Rápida (Pessoas). Mostra o lançamento mais
       recente de cada exame; as reciclagens e lançamentos antigos ficam na tela de Vencimentos,
       marcando "mostrar todos os lançamentos". Quem manda no que a função exige é o PCMSO.`
    : `Documento de uso interno, emitido do Gestão Rápida (Pessoas). Mostra o lançamento mais
       recente de cada treinamento; as reciclagens anteriores ficam na tela de Vencimentos,
       marcando "mostrar todos os lançamentos".`;

  return `
  <article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>${ex ? 'Ficha de Exames Ocupacionais' : 'Ficha de Treinamentos'}</h1>
        <p>Situação por funcionário · SAKUMA Agronegócios</p>
      </div>
      <div class="rel-comp">
        <span>emitido em</span>
        <strong>${dataBr(hoje())}</strong>
        <span>${f.cadastro ? `nº ${esc(f.cadastro)}` : ''}</span>
      </div>
    </header>

    <h2 class="rel-unidade" style="font-size:17px;margin-top:4px">${esc(f.nome || '—')}
      <small>${esc(f.cargo || 'sem função registrada')}</small>
    </h2>

    <div class="rel-ficha">
      ${campo('Nº de cadastro', f.cadastro)}
      ${campo('Situação', String(f.situacao || '').toUpperCase())}
      ${campo('Admissão', dataBr(f.admissao))}
      ${campo('Empregador', f.empregador)}
      ${campo('Fazenda', f.fazenda)}
      ${campo('Setor', f.setor)}
    </div>

    ${resumo}
    ${tabela}
    ${blocoPendencias}

    <p class="rel-nota">${nota}</p>

    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

/* ------------------------------------------------------------------
   Prévia e impressão — o mesmo caminho da Ficha do Funcionário: o HTML
   vai para o #jorImpressao (fora do #app) e a classe jor-imprimindo no
   body manda só ele para o papel. Isso mantém a folha fora do zoom e da
   prévia da lista, que continuam servindo a tela de Vencimentos.
   ------------------------------------------------------------------ */

let documentoAtual = '';
let tituloAtual = '';
let barraAtual = '';
const limparNome = t => String(t || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

/** Mostra a ficha na prévia e acende a barra daquela tela. */
export function verFichaSst(html, titulo, barraId) {
  const alvo = $('jorImpressao');
  if (!alvo || !html) return;
  fecharFichaSst();
  documentoAtual = html;
  tituloAtual = limparNome(titulo);
  barraAtual = barraId;
  alvo.innerHTML = html;
  alvo.hidden = false;
  const barra = $(barraId);
  if (barra) barra.hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function fecharFichaSst() {
  documentoAtual = '';
  const alvo = $('jorImpressao');
  if (alvo) { alvo.innerHTML = ''; alvo.hidden = true; }
  // fecha a barra de qualquer uma das duas telas, não só a última aberta
  ['barraFichaEx', 'barraFichaTr'].forEach(id => { const b = $(id); if (b) b.hidden = true; });
  barraAtual = '';
}

export function imprimirFichaSst() {
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
