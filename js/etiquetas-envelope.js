// etiquetas-envelope.js — Cadastros › Etiquetas › Envelopes (29/10/2026)
//
// Pedido do Guilherme: etiqueta para colar no envelope de cada funcionário,
// com os dados (nome, admissão, ficha, setor, departamento, cargo) e, embaixo,
// um quadro mês a mês para marcar o que já está dentro do envelope:
// holerite, folha de ponto e recibo.
// Legenda: x = arquivado · o = não tem.
//
// Medidas: etiqueta 100 mm de largura (pedido dele) × 120 mm de altura.
// Folha A4 em pé com 2 etiquetas, uma embaixo da outra, centralizadas.
// Os meses antes da admissão (no ano escolhido) saem em cinza, sem caixinha.
// Seleção e departamento trocado ficam só neste navegador.

import { estado } from './store.js';
import { mostrar, imprimir } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();
const dataBr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : limpo(iso); };

export const TELAS_ENVELOPE = ['etqEnvelopes'];

const ETQ = { w: 100, h: 120 };
const PAGINA = { w: 210, h: 297, porFolha: 2, topo: 14, vao: 14 };
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const DOCS = ['Holerite', 'Folha de ponto', 'Recibo'];

const CHAVE = 'gr-etiquetas-envelopes';
const est = { ano: new Date().getFullYear(), situacao: 'ATIVO', fazenda: '', busca: '', marcados: [], depto: {} };
(function ler() {
  try { Object.assign(est, JSON.parse(localStorage.getItem(CHAVE)) || {}); } catch { /* sem armazenamento */ }
  est.busca = '';
  if (!(Number(est.ano) > 2000)) est.ano = new Date().getFullYear();
})();
function gravar() {
  const { busca, ...resto } = est;
  try { localStorage.setItem(CHAVE, JSON.stringify(resto)); } catch { /* vale só agora */ }
}

const pessoas = () => estado.funcionarios
  .filter(f => (!est.situacao || (f.situacao || 'ATIVO') === est.situacao) &&
    (!est.fazenda || limpo(f.fazenda) === est.fazenda))
  .filter(f => !est.busca || [f.nome, f.cadastro].some(v => String(v || '').toLowerCase().includes(est.busca.toLowerCase())))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const deptoDe = f => (String(f.id) in est.depto) ? est.depto[f.id] : limpo(f.empregador);
const fazendas = () => [...new Set(estado.funcionarios.map(f => limpo(f.fazenda)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
function escolhidas() {
  const porId = new Map(estado.funcionarios.map(f => [String(f.id), f]));
  return est.marcados.map(id => porId.get(String(id))).filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ---------------- a tela ---------------- */
export function abrirEnvelopes() { desenhar(); }

function desenhar() {
  const alvo = $('telaEtqEnvelopes');
  if (!alvo) return;
  const lista = pessoas();
  const marc = new Set(est.marcados.map(String));
  const total = escolhidas().length;
  const folhas = Math.ceil(total / PAGINA.porFolha);
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
  if (!anos.includes(Number(est.ano))) anos.push(Number(est.ano));

  alvo.innerHTML = `
    <header class="jor-cabecalho"><div>
      <div class="jor-cabecalho__titulo">Etiquetas de envelope</div>
      <div class="jor-cabecalho__sub">Dados do funcionário e quadro mês a mês de holerite, folha de ponto e recibo — 10 cm de largura</div></div>
      <div class="jor-cabecalho__direita">selecionadas<strong class="jor-cabecalho__competencia">${total}</strong></div></header>
    <div class="jor-corpo">
      <div class="jor-barra rel-filtros et-barra">
        <label>Ano do quadro <select id="evAno" class="dc-mini">
          ${anos.sort().map(a => `<option${a == est.ano ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
        <button class="btn principal" type="button" id="evVer"${total ? '' : ' disabled'}>Visualizar</button>
        <button class="btn" type="button" id="evImp"${total ? '' : ' disabled'}>Imprimir</button>
        <span class="dc-sem">${total ? `${total} etiqueta(s) · ${folhas} folha(s) A4` : 'Marque quem vai ganhar etiqueta'}</span>
      </div>
      <p class="dc-sem jor-nota">Etiqueta de <b>${ETQ.w} × ${ETQ.h} mm</b>, ${PAGINA.porFolha} por folha A4. Legenda no quadro:
        <b>x</b> = arquivado · <b>o</b> = não tem. Meses antes da admissão saem em cinza.
        Na impressão: A4, <b>100% / tamanho real</b>, margens <b>Nenhuma</b>.</p>

      <div class="jor-barra rel-filtros et-barra">
        <label>Situação <select id="evSit" class="dc-mini">
          <option value="ATIVO"${est.situacao === 'ATIVO' ? ' selected' : ''}>Só ativos</option>
          <option value=""${est.situacao === '' ? ' selected' : ''}>Todos</option>
          <option value="INATIVO"${est.situacao === 'INATIVO' ? ' selected' : ''}>Só inativos</option></select></label>
        <label>Fazenda <select id="evFaz" class="dc-mini">
          <option value="">Todas</option>
          ${fazendas().map(z => `<option${z === est.fazenda ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label>Buscar <input id="evBusca" class="dc-mini" type="search" placeholder="nome ou nº" value="${esc(est.busca)}"></label>
        <button class="btn mini" type="button" id="evTodos">Marcar os ${lista.length} da lista</button>
        <button class="btn mini" type="button" id="evNenhum">Desmarcar tudo</button>
      </div>

      <div class="et-lista">
        <div class="et-linha ev-linha et-cab"><span></span><span>Nome</span><span>Departamento na etiqueta</span><span>Admissão</span></div>
        ${lista.map(f => `<div class="et-linha ev-linha">
          <input type="checkbox" data-ev-f="${esc(f.id)}"${marc.has(String(f.id)) ? ' checked' : ''}>
          <span>${esc(f.nome)}${f.cadastro ? ` <span class="dc-sem">· ficha ${esc(f.cadastro)}</span>` : ''}</span>
          <input class="et-nome" type="text" data-ev-depto="${esc(f.id)}" value="${esc(deptoDe(f))}" placeholder="—">
          <span class="dc-sem">${esc(dataBr(f.admissao) || '—')}</span></div>`).join('') ||
          '<p class="dc-sem" style="padding:8px">Ninguém neste filtro.</p>'}
      </div>
    </div>`;

  const fechar = () => { const p = $('jorImpressao'); if (p) { p.hidden = true; p.innerHTML = ''; } };
  const refazer = () => { gravar(); fechar(); desenhar(); };

  $('evAno').addEventListener('change', ev => { est.ano = Number(ev.target.value); refazer(); });
  $('evSit').addEventListener('change', ev => { est.situacao = ev.target.value; refazer(); });
  $('evFaz').addEventListener('change', ev => { est.fazenda = ev.target.value; refazer(); });
  $('evBusca').addEventListener('input', ev => {
    est.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    desenhar();
    const b = $('evBusca'); b.focus(); try { b.setSelectionRange(pos, pos); } catch { /* */ }
  });
  $('evTodos').addEventListener('click', () => {
    const s = new Set(est.marcados.map(String)); lista.forEach(f => s.add(String(f.id))); est.marcados = [...s]; refazer();
  });
  $('evNenhum').addEventListener('click', () => { est.marcados = []; refazer(); });
  alvo.querySelectorAll('[data-ev-f]').forEach(c => c.addEventListener('change', () => {
    const id = c.dataset.evF;
    est.marcados = c.checked ? [...new Set([...est.marcados.map(String), id])] : est.marcados.filter(x => String(x) !== id);
    refazer();
  }));
  alvo.querySelectorAll('[data-ev-depto]').forEach(i => i.addEventListener('input', () => {
    const f = estado.funcionarios.find(x => String(x.id) === i.dataset.evDepto);
    if (f && limpo(i.value) === limpo(f.empregador)) delete est.depto[i.dataset.evDepto];
    else est.depto[i.dataset.evDepto] = i.value;
    gravar(); fechar();
  }));
  $('evVer').addEventListener('click', () => gerar(false));
  $('evImp').addEventListener('click', () => gerar(true));
}

/* ---------------- a etiqueta ---------------- */
function etiquetaHtml(f) {
  const ano = Number(est.ano);
  const adm = /^(\d{4})-(\d{2})/.exec(String(f.admissao || ''));
  const antes = m => adm && (ano < +adm[1] || (ano === +adm[1] && m + 1 < +adm[2]));
  const linha = (rot, val) => `<div class="ev-dado"><b>${rot}:</b> ${esc(limpo(val) || '—')}</div>`;
  const meses = MESES.map((m, i) => antes(i)
    ? `<tr class="ev-fora"><td>${m}/${ano}</td>${DOCS.map(() => '<td>—</td>').join('')}</tr>`
    : `<tr><td>${m}/${ano}</td>${DOCS.map(() => '<td><span class="ev-cx"></span></td>').join('')}</tr>`).join('');
  return `<div class="ev-etq" style="width:${ETQ.w}mm;height:${ETQ.h}mm">
    <div class="ev-nome">${esc(f.nome)}</div>
    <div class="ev-dados">
      ${linha('ADMISSÃO', dataBr(f.admissao))}
      ${linha('FICHA', f.cadastro)}
      ${linha('SETOR', f.setor)}
      ${linha('DEPARTAMENTO', deptoDe(f))}
      ${linha('CARGO', f.cargo)}
    </div>
    <table class="ev-quadro">
      <thead><tr><th>Mês</th>${DOCS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${meses}</tbody>
    </table>
    <div class="ev-legenda"><b>x</b> = arquivado &nbsp;·&nbsp; <b>o</b> = não tem</div>
  </div>`;
}

function gerar(paraImprimir) {
  const lista = escolhidas();
  if (!lista.length) return;
  const esq = (PAGINA.w - ETQ.w) / 2;
  const folhas = [];
  for (let i = 0; i < lista.length; i += PAGINA.porFolha) {
    const da = lista.slice(i, i + PAGINA.porFolha);
    folhas.push(`<div class="et-folha">${da.map((f, k) =>
      `<div class="ev-pos" style="left:${esq}mm;top:${PAGINA.topo + k * (ETQ.h + PAGINA.vao)}mm">${etiquetaHtml(f)}</div>`).join('')}</div>`);
  }
  const aviso = `<p class="et-aviso-tela">${lista.length} etiqueta(s) em ${folhas.length} folha(s) A4 · ${ETQ.w} × ${ETQ.h} mm · ano ${est.ano}.
    Na janela de impressão: <b>A4</b>, <b>100% / tamanho real</b>, <b>Margens: Nenhuma</b> e sem "Cabeçalhos e rodapés".</p>`;
  mostrar(`<div class="et-lote">${aviso}${folhas.join('')}</div>`, { barra: true });
  caberNome();
  if (paraImprimir) setTimeout(imprimirSemTitulo, 400);
}

/* Nome comprido: diminui a letra até caber numa linha. */
function caberNome() {
  document.querySelectorAll('#jorImpressao .ev-nome').forEach(n => {
    let pt = 15;
    n.style.fontSize = pt + 'pt';
    while (n.scrollWidth > n.clientWidth && pt > 9) { pt -= 0.5; n.style.fontSize = pt + 'pt'; }
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
