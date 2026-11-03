// etiquetas-pasta.js — Cadastros › Etiquetas › Pastas suspensas (03/11/2026)
//
// Pedido do Guilherme: etiqueta para o visor da pasta suspensa de cada
// funcionário, só com o nome. Modelo escolhido: "A · só o nome, grande" —
// faixa verde em cima, nome em negrito no meio e filete marrom embaixo.
// Medidas: 50 mm de comprimento × 30 mm de altura.
// Folha A4 em pé com 36 etiquetas (4 colunas × 9 linhas), coladas umas nas
// outras: cada linha tracejada é um corte só. Sobra 5 mm de cada lado e
// 13,5 mm em cima e embaixo, fora da área que a impressora não alcança.
// O nome pode ser trocado na tela (para abreviar nome comprido). Seleção e
// nomes trocados ficam só neste navegador.

import { estado } from './store.js';
import { mostrar, imprimir } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();

export const TELAS_PASTA = ['etqPastas'];

const ETQ = { w: 50, h: 30 };
const PAGINA = { w: 210, h: 297, colunas: 4, linhas: 9 };
const POR_FOLHA = PAGINA.colunas * PAGINA.linhas;
const ESQ = (PAGINA.w - PAGINA.colunas * ETQ.w) / 2;
const TOPO = (PAGINA.h - PAGINA.linhas * ETQ.h) / 2;

const CHAVE = 'gr-etiquetas-pastas';
const est = { situacao: 'ATIVO', fazenda: '', busca: '', marcados: [], nome: {}, inicio: 1 };
(function ler() {
  try { Object.assign(est, JSON.parse(localStorage.getItem(CHAVE)) || {}); } catch { /* sem armazenamento */ }
  est.busca = '';
  est.inicio = 1;
})();
function gravar() {
  const { busca, inicio, ...resto } = est;
  try { localStorage.setItem(CHAVE, JSON.stringify(resto)); } catch { /* vale só agora */ }
}

const pessoas = () => estado.funcionarios
  .filter(f => (!est.situacao || (f.situacao || 'ATIVO') === est.situacao) &&
    (!est.fazenda || limpo(f.fazenda) === est.fazenda))
  .filter(f => !est.busca || [f.nome, f.cadastro].some(v => String(v || '').toLowerCase().includes(est.busca.toLowerCase())))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const nomeDe = f => (String(f.id) in est.nome) ? est.nome[f.id] : limpo(f.nome);
const fazendas = () => [...new Set(estado.funcionarios.map(f => limpo(f.fazenda)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
function escolhidas() {
  const porId = new Map(estado.funcionarios.map(f => [String(f.id), f]));
  return est.marcados.map(id => porId.get(String(id))).filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ---------------- a tela ---------------- */
export function abrirPastas() { desenhar(); }

function desenhar() {
  const alvo = $('telaEtqPastas');
  if (!alvo) return;
  const lista = pessoas();
  const marc = new Set(est.marcados.map(String));
  const total = escolhidas().length;
  const folhas = Math.ceil((total + est.inicio - 1) / POR_FOLHA);

  alvo.innerHTML = `
    <header class="jor-cabecalho"><div>
      <div class="jor-cabecalho__titulo">Etiquetas de pasta suspensa</div>
      <div class="jor-cabecalho__sub">Nome do funcionário para o visor da pasta — 5 cm × 3 cm</div></div>
      <div class="jor-cabecalho__direita">selecionadas<strong class="jor-cabecalho__competencia">${total}</strong></div></header>
    <div class="jor-corpo">
      <div class="jor-barra rel-filtros et-barra">
        <label>Começar na posição <select id="epIni" class="dc-mini">
          ${Array.from({ length: POR_FOLHA }, (_, i) => `<option${i + 1 === est.inicio ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <button class="btn principal" type="button" id="epVer"${total ? '' : ' disabled'}>Visualizar</button>
        <button class="btn" type="button" id="epImp"${total ? '' : ' disabled'}>Imprimir</button>
        <span class="dc-sem">${total ? `${total} etiqueta(s) · ${folhas} folha(s) A4` : 'Marque quem vai ganhar etiqueta'}</span>
      </div>
      <p class="dc-sem jor-nota">Etiqueta de <b>${ETQ.w} × ${ETQ.h} mm</b>, ${POR_FOLHA} por folha A4 (${PAGINA.colunas} × ${PAGINA.linhas}), coladas umas nas outras —
        corte em cima das linhas tracejadas. "Começar na posição" aproveita folha já usada (conta da esquerda para a direita, de cima para baixo).
        Na impressão: A4, <b>100% / tamanho real</b>, margens <b>Nenhuma</b>.</p>

      <div class="jor-barra rel-filtros et-barra">
        <label>Situação <select id="epSit" class="dc-mini">
          <option value="ATIVO"${est.situacao === 'ATIVO' ? ' selected' : ''}>Só ativos</option>
          <option value=""${est.situacao === '' ? ' selected' : ''}>Todos</option>
          <option value="INATIVO"${est.situacao === 'INATIVO' ? ' selected' : ''}>Só inativos</option></select></label>
        <label>Fazenda <select id="epFaz" class="dc-mini">
          <option value="">Todas</option>
          ${fazendas().map(z => `<option${z === est.fazenda ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label>Buscar <input id="epBusca" class="dc-mini" type="search" placeholder="nome ou nº" value="${esc(est.busca)}"></label>
        <button class="btn mini" type="button" id="epTodos">Marcar os ${lista.length} da lista</button>
        <button class="btn mini" type="button" id="epNenhum">Desmarcar tudo</button>
      </div>

      <div class="et-lista">
        <div class="et-linha ep-linha et-cab"><span></span><span>Funcionário</span><span>Nome na etiqueta</span></div>
        ${lista.map(f => `<div class="et-linha ep-linha">
          <input type="checkbox" data-ep-f="${esc(f.id)}"${marc.has(String(f.id)) ? ' checked' : ''}>
          <span>${esc(f.nome)}${f.cadastro ? ` <span class="dc-sem">· ficha ${esc(f.cadastro)}</span>` : ''}</span>
          <input class="et-nome" type="text" data-ep-nome="${esc(f.id)}" value="${esc(nomeDe(f))}" maxlength="60"></div>`).join('') ||
          '<p class="dc-sem" style="padding:8px">Ninguém neste filtro.</p>'}
      </div>
    </div>`;

  const fechar = () => { const p = $('jorImpressao'); if (p) { p.hidden = true; p.innerHTML = ''; } };
  const refazer = () => { gravar(); fechar(); desenhar(); };

  $('epIni').addEventListener('change', ev => { est.inicio = Number(ev.target.value) || 1; refazer(); });
  $('epSit').addEventListener('change', ev => { est.situacao = ev.target.value; refazer(); });
  $('epFaz').addEventListener('change', ev => { est.fazenda = ev.target.value; refazer(); });
  $('epBusca').addEventListener('input', ev => {
    est.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    desenhar();
    const b = $('epBusca'); b.focus(); try { b.setSelectionRange(pos, pos); } catch { /* */ }
  });
  $('epTodos').addEventListener('click', () => {
    const s = new Set(est.marcados.map(String)); lista.forEach(f => s.add(String(f.id))); est.marcados = [...s]; refazer();
  });
  $('epNenhum').addEventListener('click', () => { est.marcados = []; refazer(); });
  alvo.querySelectorAll('[data-ep-f]').forEach(c => c.addEventListener('change', () => {
    const id = c.dataset.epF;
    est.marcados = c.checked ? [...new Set([...est.marcados.map(String), id])] : est.marcados.filter(x => String(x) !== id);
    refazer();
  }));
  alvo.querySelectorAll('[data-ep-nome]').forEach(i => i.addEventListener('input', () => {
    const f = estado.funcionarios.find(x => String(x.id) === i.dataset.epNome);
    if (f && limpo(i.value) === limpo(f.nome)) delete est.nome[i.dataset.epNome];
    else est.nome[i.dataset.epNome] = i.value;
    gravar(); fechar();
  }));
  $('epVer').addEventListener('click', () => gerar(false));
  $('epImp').addEventListener('click', () => gerar(true));
}

/* ---------------- a etiqueta ---------------- */
const etiquetaHtml = f => `<div class="ep-etq" style="width:${ETQ.w}mm;height:${ETQ.h}mm">
    <div class="ep-faixa"></div>
    <div class="ep-nome"><span>${esc(limpo(nomeDe(f)) || f.nome)}</span></div>
    <div class="ep-filete"></div>
  </div>`;

function gerar(paraImprimir) {
  const lista = escolhidas();
  if (!lista.length) return;
  const vagas = [...Array(est.inicio - 1).fill(null), ...lista];
  const folhas = [];
  for (let i = 0; i < vagas.length; i += POR_FOLHA) {
    const da = vagas.slice(i, i + POR_FOLHA);
    folhas.push(`<div class="et-folha">${da.map((f, k) => f ? `<div class="ep-pos" style="left:${ESQ + (k % PAGINA.colunas) * ETQ.w}mm;top:${TOPO + Math.floor(k / PAGINA.colunas) * ETQ.h}mm">${etiquetaHtml(f)}</div>` : '').join('')}</div>`);
  }
  const aviso = `<p class="et-aviso-tela">${lista.length} etiqueta(s) em ${folhas.length} folha(s) A4 · ${ETQ.w} × ${ETQ.h} mm.
    Na janela de impressão: <b>A4</b>, <b>100% / tamanho real</b>, <b>Margens: Nenhuma</b> e sem "Cabeçalhos e rodapés".</p>`;
  mostrar(`<div class="et-lote">${aviso}${folhas.join('')}</div>`, { barra: true });
  caberNome();
  if (paraImprimir) setTimeout(imprimirSemTitulo, 400);
}

/* Nome grande: começa em 15pt, quebra em até duas linhas e diminui a letra
   até caber, com folga porque a impressora desenha a letra um pouco maior
   que a tela (mesmo cuidado da etiqueta de envelope). */
function caberNome() {
  document.querySelectorAll('#jorImpressao .ep-nome').forEach(box => {
    const s = box.firstElementChild;
    let pt = 15;
    s.style.fontSize = pt + 'pt';
    const cabe = () => s.scrollWidth <= s.clientWidth &&
      s.getBoundingClientRect().height <= box.clientHeight * 0.88;
    while (!cabe() && pt > 7) { pt -= 0.5; s.style.fontSize = pt + 'pt'; }
  });
}

function imprimirSemTitulo() {
  const titulo = document.title;
  document.title = ' ';
  const volta = () => { document.title = titulo; removeEventListener('afterprint', volta); };
  addEventListener('afterprint', volta);
  imprimir();
  setTimeout(volta, 3000);
}
