// etiquetas.js — Cadastros › Etiquetas › Armários (23/10/2026)
//
// Pedido do Guilherme: etiqueta de armário igual à que já usa (moldura verde,
// "80 – Nome do funcionário" e a marca da SAKUMA no canto), mas no tamanho
// certo para o plástico de plastificar dele: 110 × 170 mm, com 4 ou 5
// etiquetas em cada plástico.
//
// Medidas (mm):
//   5 por plástico → etiqueta 96 × 28, 4 mm entre elas → coluna 96 × 156
//   4 por plástico → etiqueta 96 × 36, 4 mm entre elas → coluna 96 × 156
// Sobra 7 mm de cada lado e 7 mm em cima/embaixo no plástico, para a selagem.
// Na folha A4 vão duas colunas (dois plásticos) lado a lado: recorta a coluna
// inteira, plastifica e depois corta no meio do vão de 4 mm.
//
// O número vem do nº de cadastro do funcionário e pode ser trocado na tela
// (o número do armário nem sempre é o do cadastro). Seleção, números e nomes
// trocados ficam guardados só neste navegador.

import { estado } from './store.js';
import { mostrar, imprimir } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();

export const TELAS_ETIQUETAS = ['etqArmarios'];

/* ---------------- medidas ---------------- */
const FORMATOS = {
  5: { w: 96, h: 28, vao: 4 },
  4: { w: 96, h: 36, vao: 4 },
};
const PAGINA = { w: 210, h: 297, colunas: 2, vaoColuna: 8, topo: 12 };

/* ---------------- o que fica guardado no navegador ---------------- */
const CHAVE = 'gr-etiquetas-armarios';
const est = {
  porPlastico: 5,
  situacao: 'ATIVO',
  fazenda: '',
  busca: '',
  marcados: [],      // ids de funcionários
  num: {},           // id → número trocado
  nome: {},          // id → nome trocado
  avulsas: [],       // [{ k, num, nome, marcado }]
};
(function ler() {
  try { Object.assign(est, JSON.parse(localStorage.getItem(CHAVE)) || {}); } catch { /* sem armazenamento */ }
  est.busca = '';
  if (![4, 5].includes(Number(est.porPlastico))) est.porPlastico = 5;
})();
function gravar() {
  const { busca, ...resto } = est;
  try { localStorage.setItem(CHAVE, JSON.stringify(resto)); } catch { /* vale só agora */ }
}

/* ---------------- dados ---------------- */
const pessoas = () => estado.funcionarios
  .filter(f => (!est.situacao || (f.situacao || 'ATIVO') === est.situacao) &&
    (!est.fazenda || limpo(f.fazenda) === est.fazenda))
  .filter(f => !est.busca || [f.nome, f.cadastro].some(v => String(v || '').toLowerCase().includes(est.busca.toLowerCase())))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const numDe = f => (String(f.id) in est.num) ? est.num[f.id] : limpo(f.cadastro);
const nomeDe = f => limpo(est.nome[f.id]) || limpo(f.nome);

/* As etiquetas que vão sair, na ordem: funcionários marcados (por número,
   depois nome) e as avulsas marcadas no fim. */
function escolhidas() {
  const porId = new Map(estado.funcionarios.map(f => [String(f.id), f]));
  const fs = est.marcados.map(id => porId.get(String(id))).filter(Boolean)
    .map(f => ({ num: limpo(numDe(f)), nome: nomeDe(f) }));
  const ordemNum = s => { const n = parseInt(s, 10); return Number.isNaN(n) ? Infinity : n; };
  fs.sort((a, b) => ordemNum(a.num) - ordemNum(b.num) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const av = est.avulsas.filter(a => a.marcado && (limpo(a.num) || limpo(a.nome)))
    .map(a => ({ num: limpo(a.num), nome: limpo(a.nome) }));
  return [...fs, ...av];
}

const fazendas = () => [...new Set(estado.funcionarios.map(f => limpo(f.fazenda)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* ---------------- a tela ---------------- */
export function abrirEtiquetas() { desenhar(); }

function desenhar() {
  const alvo = $('telaEtqArmarios');
  if (!alvo) return;
  const lista = pessoas();
  const marc = new Set(est.marcados.map(String));
  const total = escolhidas().length;
  const fmt = FORMATOS[est.porPlastico];
  const porFolha = est.porPlastico * PAGINA.colunas;
  const folhas = Math.ceil(total / porFolha);
  const plasticos = Math.ceil(total / est.porPlastico);

  alvo.innerHTML = `
    <header class="jor-cabecalho"><div>
      <div class="jor-cabecalho__titulo">Etiquetas de armário</div>
      <div class="jor-cabecalho__sub">Número e nome, moldura verde e a marca da SAKUMA — no tamanho do plástico 110 × 170 mm</div></div>
      <div class="jor-cabecalho__direita">selecionadas<strong class="jor-cabecalho__competencia">${total}</strong></div></header>
    <div class="jor-corpo">
      <div class="jor-barra rel-filtros et-barra">
        <label>Por plástico <select id="etPor" class="dc-mini">
          <option value="5"${est.porPlastico == 5 ? ' selected' : ''}>5 etiquetas (96 × 28 mm)</option>
          <option value="4"${est.porPlastico == 4 ? ' selected' : ''}>4 etiquetas (96 × 36 mm)</option></select></label>
        <button class="btn principal" type="button" id="etVer"${total ? '' : ' disabled'}>Visualizar</button>
        <button class="btn" type="button" id="etImp"${total ? '' : ' disabled'}>Imprimir</button>
        <span class="dc-sem">${total ? `${total} etiqueta(s) · ${plasticos} plástico(s) · ${folhas} folha(s) A4` : 'Marque quem vai ganhar etiqueta'}</span>
      </div>
      <p class="dc-sem jor-nota">Cada folha A4 sai com ${PAGINA.colunas} colunas de ${est.porPlastico} etiquetas
        (${fmt.w} × ${fmt.h} mm). Cada coluna é um plástico: recorte a coluna, plastifique e corte no meio do vão entre as etiquetas.
        Na impressão: A4, <b>100% / tamanho real</b>, margens <b>Nenhuma</b>.</p>

      <div class="jor-barra rel-filtros et-barra">
        <label>Situação <select id="etSit" class="dc-mini">
          <option value="ATIVO"${est.situacao === 'ATIVO' ? ' selected' : ''}>Só ativos</option>
          <option value=""${est.situacao === '' ? ' selected' : ''}>Todos</option>
          <option value="INATIVO"${est.situacao === 'INATIVO' ? ' selected' : ''}>Só inativos</option></select></label>
        <label>Fazenda <select id="etFaz" class="dc-mini">
          <option value="">Todas</option>
          ${fazendas().map(z => `<option${z === est.fazenda ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label>Buscar <input id="etBusca" class="dc-mini" type="search" placeholder="nome ou nº" value="${esc(est.busca)}"></label>
        <button class="btn mini" type="button" id="etTodos">Marcar os ${lista.length} da lista</button>
        <button class="btn mini" type="button" id="etNenhum">Desmarcar tudo</button>
      </div>

      <div class="et-lista">
        <div class="et-linha et-cab"><span></span><span>Nº</span><span>Nome na etiqueta</span><span>Fazenda</span></div>
        ${lista.map(f => `<div class="et-linha">
          <input type="checkbox" data-et-f="${esc(f.id)}"${marc.has(String(f.id)) ? ' checked' : ''}>
          <input class="et-num" type="text" inputmode="numeric" data-et-num="${esc(f.id)}" value="${esc(numDe(f))}" placeholder="—">
          <input class="et-nome" type="text" data-et-nome="${esc(f.id)}" value="${esc(nomeDe(f))}">
          <span class="dc-sem">${esc(f.fazenda || '—')}</span></div>`).join('') ||
          '<p class="dc-sem" style="padding:8px">Ninguém neste filtro.</p>'}
      </div>

      <h3 class="et-sub">Etiquetas avulsas</h3>
      <p class="dc-sem jor-nota">Para armário reserva, visitante ou quem ainda não está no cadastro.</p>
      <div class="et-lista">
        ${est.avulsas.map(a => `<div class="et-linha">
          <input type="checkbox" data-et-av="${a.k}"${a.marcado ? ' checked' : ''}>
          <input class="et-num" type="text" data-et-avnum="${a.k}" value="${esc(a.num)}" placeholder="Nº">
          <input class="et-nome" type="text" data-et-avnome="${a.k}" value="${esc(a.nome)}" placeholder="Nome">
          <button class="btn mini" type="button" data-et-avdel="${a.k}" title="Tirar">✕</button></div>`).join('')}
        <div style="padding:6px 0"><button class="btn mini" type="button" id="etAvMais">+ Etiqueta avulsa</button></div>
      </div>
    </div>`;

  const fechar = () => { const p = $('jorImpressao'); if (p) { p.hidden = true; p.innerHTML = ''; } };
  const refazer = () => { gravar(); fechar(); desenhar(); };

  $('etPor').addEventListener('change', ev => { est.porPlastico = Number(ev.target.value); refazer(); });
  $('etSit').addEventListener('change', ev => { est.situacao = ev.target.value; refazer(); });
  $('etFaz').addEventListener('change', ev => { est.fazenda = ev.target.value; refazer(); });
  $('etBusca').addEventListener('input', ev => {
    est.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    desenhar();
    const b = $('etBusca'); b.focus(); try { b.setSelectionRange(pos, pos); } catch { /* */ }
  });
  $('etTodos').addEventListener('click', () => {
    const s = new Set(est.marcados); lista.forEach(f => s.add(String(f.id))); est.marcados = [...s]; refazer();
  });
  $('etNenhum').addEventListener('click', () => {
    est.marcados = []; est.avulsas.forEach(a => { a.marcado = false; }); refazer();
  });

  /* Mudança de número/nome só grava; não redesenha (perderia o foco). */
  const contar = () => {
    const n = escolhidas().length;
    alvo.querySelector('.jor-cabecalho__competencia').textContent = n;
    $('etVer').disabled = $('etImp').disabled = !n;
  };
  alvo.querySelectorAll('[data-et-f]').forEach(c => c.addEventListener('change', () => {
    const id = c.dataset.etF;
    est.marcados = c.checked ? [...new Set([...est.marcados.map(String), id])] : est.marcados.filter(x => String(x) !== id);
    refazer();
  }));
  alvo.querySelectorAll('[data-et-num]').forEach(i => {
    i.addEventListener('input', () => { est.num[i.dataset.etNum] = i.value; gravar(); fechar(); });
  });
  alvo.querySelectorAll('[data-et-nome]').forEach(i => {
    i.addEventListener('input', () => {
      const f = estado.funcionarios.find(x => String(x.id) === i.dataset.etNome);
      if (f && limpo(i.value) === limpo(f.nome)) delete est.nome[i.dataset.etNome];
      else est.nome[i.dataset.etNome] = i.value;
      gravar(); fechar();
    });
  });
  const avulsa = k => est.avulsas.find(a => String(a.k) === String(k));
  alvo.querySelectorAll('[data-et-av]').forEach(c => c.addEventListener('change', () => {
    const a = avulsa(c.dataset.etAv); if (a) a.marcado = c.checked; refazer();
  }));
  alvo.querySelectorAll('[data-et-avnum]').forEach(i => i.addEventListener('input', () => {
    const a = avulsa(i.dataset.etAvnum); if (a) a.num = i.value; gravar(); fechar(); contar();
  }));
  alvo.querySelectorAll('[data-et-avnome]').forEach(i => i.addEventListener('input', () => {
    const a = avulsa(i.dataset.etAvnome); if (a) a.nome = i.value; gravar(); fechar(); contar();
  }));
  alvo.querySelectorAll('[data-et-avdel]').forEach(b => b.addEventListener('click', () => {
    est.avulsas = est.avulsas.filter(a => String(a.k) !== b.dataset.etAvdel); refazer();
  }));
  $('etAvMais').addEventListener('click', () => {
    est.avulsas.push({ k: Date.now(), num: '', nome: '', marcado: true }); refazer();
  });

  $('etVer').addEventListener('click', () => gerar(false));
  $('etImp').addEventListener('click', () => gerar(true));
}

/* ---------------- a folha ---------------- */
/* Marca da SAKUMA como enviada (600 × 691 px), com largura fixa para o
   texto já ser medido no espaço certo antes de a imagem carregar. */
const logoMm = fmt => { const h = Math.min(fmt.h - 3.2 - 4, 22); return { h, w: +(h * 600 / 691).toFixed(2) }; };

function etiquetaHtml(e, fmt) {
  const texto = e.num && e.nome ? `${e.num} – ${e.nome}` : (e.num || e.nome);
  const lg = logoMm(fmt);
  return `<div class="et-etq" style="width:${fmt.w}mm;height:${fmt.h}mm">
    <div class="et-txt"><span>${esc(texto)}</span></div>
    <img class="et-logo" src="img/sakuma-marca-vertical.png" alt="SAKUMA Agronegócios" style="width:${lg.w}mm;height:${lg.h}mm">
  </div>`;
}

function gerar(paraImprimir) {
  const lista = escolhidas();
  if (!lista.length) return;
  const fmt = FORMATOS[est.porPlastico];
  const n = est.porPlastico;
  const porFolha = n * PAGINA.colunas;
  const larg = PAGINA.colunas * fmt.w + (PAGINA.colunas - 1) * PAGINA.vaoColuna;
  const esq = (PAGINA.w - larg) / 2;

  const folhas = [];
  for (let i = 0; i < lista.length; i += porFolha) {
    const da = lista.slice(i, i + porFolha);
    const cols = [];
    for (let c = 0; c < PAGINA.colunas; c++) {
      const etqs = da.slice(c * n, c * n + n);
      if (!etqs.length) break;
      cols.push(`<div class="et-col" style="left:${esq + c * (fmt.w + PAGINA.vaoColuna)}mm;top:${PAGINA.topo}mm;gap:${fmt.vao}mm">
        ${etqs.map(e => etiquetaHtml(e, fmt)).join('')}</div>`);
    }
    folhas.push(`<div class="et-folha">${cols.join('')}</div>`);
  }
  const aviso = `<p class="et-aviso-tela">${lista.length} etiqueta(s) em ${folhas.length} folha(s) A4 · ${n} por plástico (${fmt.w} × ${fmt.h} mm).
    Na janela de impressão: <b>A4</b>, <b>100% / tamanho real</b>, <b>Margens: Nenhuma</b> e sem "Cabeçalhos e rodapés".</p>`;
  mostrar(`<div class="et-lote">${aviso}${folhas.join('')}</div>`, { barra: true });
  caber();
  if (paraImprimir) setTimeout(imprimirSemTitulo, 400);
}

/* Nome comprido: diminui a letra até caber em duas linhas. */
function caber() {
  document.querySelectorAll('#jorImpressao .et-txt').forEach(box => {
    const s = box.firstElementChild;
    const alto = box.clientHeight;
    let pt = est.porPlastico === 4 ? 22 : 18;
    s.style.fontSize = pt + 'pt';
    while ((s.scrollHeight > alto || s.scrollWidth > box.clientWidth || linhas(s) > 2) && pt > 7) {
      pt -= 0.5; s.style.fontSize = pt + 'pt';
    }
  });
}
const linhas = s => Math.round(s.getBoundingClientRect().height / (parseFloat(getComputedStyle(s).lineHeight) || 1));

function imprimirSemTitulo() {
  const titulo = document.title;
  document.title = ' ';
  const volta = () => { document.title = titulo; removeEventListener('afterprint', volta); };
  addEventListener('afterprint', volta);
  imprimir();
  setTimeout(volta, 3000);
}
