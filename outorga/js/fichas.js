// fichas.js — Imprimir fichas (12/11/2026). O mesmo desenho das fichas do app
// avulso "Controle de Outorga e Irrigação", aprovado pelo Guilherme em set/2026:
//   - A4 retrato, uma via por mês (sem frente e verso), margens mínimas;
//   - outorga: uma linha por dia do mês; DATA larga (escrita à mão), HORA e
//     M³ mais largas, RESPONSÁVEL menor; colunas pelo tipo do ponto
//     (horímetro = horas, hidrômetro = m³);
//   - irrigação: CONTROLE MENSAL IRRIGAÇÃO por fazenda + produtor, cada
//     combinação numa página (DATA, HORA LIGOU, HORA DESLIGOU, CULTURA, PIVÔ, PLANTIO);
//   - pé só com a linha "Responsável" para assinar (sem "Visto") e a marca LOP.
import { $, esc, pronto, carregando, aviso, locais, local, pontosDe, ponto, produtores, itens,
  colunasDe, mesAtual, mesMais, NomeMes, diasNoMes, MESES } from './dados.js';

/* ---------------- desenho da ficha ---------------- */
function largurasColunas(colunas) {
  const estreita = c => /^(HORA|M³|HOR[ÍI]METRO)/i.test(c);
  const pesos = colunas.map((c, i) => i === 0 ? 22 : (estreita(c) ? 21 : 0));
  const fixo = pesos.reduce((a, b) => a + b, 0);
  const livres = pesos.filter(p => p === 0).length;
  const sobra = livres ? (100 - fixo) / livres : 0;
  return pesos.map(p => (p === 0 ? sobra : p));
}
const mesAno = m => MESES[Number(m.slice(5, 7)) - 1].toUpperCase() + ' / ' + m.slice(0, 4);

function pagina({ titulo, localTxt, esquerda, direita, colunas, larguras, linhas }) {
  return `<div class="ficha-pag">
    <div class="ficha-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios"><span>${esc(esquerda[1])}</span></div>
    <p class="ficha-titulo">${esc(titulo)}</p>
    <p class="ficha-local">${esc(localTxt)}</p>
    <div class="ficha-meta"><span><b>${esc(esquerda[0])}:</b> ${esc(esquerda[1])}</span><span><b>${esc(direita[0])}:</b> ${esc(direita[1])}</span></div>
    <table class="ficha-tab">
      <colgroup>${larguras.map(w => `<col style="width:${w.toFixed(2)}%">`).join('')}</colgroup>
      <thead><tr>${colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${Array.from({ length: linhas }, () => `<tr>${colunas.map(() => '<td></td>').join('')}</tr>`).join('')}</tbody>
    </table>
    <div class="ficha-pe"><div class="ficha-ass">Responsável</div><img src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/** Ficha de outorga de um ponto de controle num mês. */
export function fichaOutorga(c, m) {
  const l = local(c.local_id) || {};
  const cols = colunasDe(c);
  return pagina({ titulo: c.titulo || 'CONTROLE', localTxt: c.header || l.cabecalho || l.nome || '',
    esquerda: ['Período', mesAno(m)], direita: ['Local', l.nome || ''],
    colunas: cols, larguras: largurasColunas(cols), linhas: diasNoMes(m) });
}

/** Ficha de irrigação de uma fazenda + produtor num mês. */
const COLS_IRR = ['DATA', 'HORA LIGOU', 'HORA DESLIGOU', 'CULTURA', 'PIVÔ', 'PLANTIO'];
export function fichaIrrigacao(l, prod, m, linhas = 26) {
  const nomeFaz = l.cabecalho ? l.cabecalho.replace(/^FAZ:\s*/i, 'FAZ. ') : String(l.nome || '').toUpperCase();
  return pagina({ titulo: 'CONTROLE MENSAL IRRIGAÇÃO', localTxt: `${nomeFaz}  /  ${prod}`,
    esquerda: ['Mês', mesAno(m)], direita: ['Produtor', prod],
    colunas: COLS_IRR, larguras: [16, 13, 13, 22, 12, 24], linhas });
}

/** Põe as páginas na prévia e imprime (a prévia some ao trocar de tela). */
export function imprimirPaginas(html, imprimir = true) {
  const f = $('otFolha');
  f.innerHTML = html;
  if (imprimir && html) setTimeout(() => window.print(), 200);
}

/* ---------------- tela: fichas de outorga ---------------- */
const sel = { mes: mesAtual(), pontos: null, irrMes: mesAtual(), prods: null, locs: null, linhas: 26 };

export function abrirFichasOutorga() {
  const alvo = $('otFichasOutCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ls = locais();
  const todosPontos = ls.flatMap(l => pontosDe(l.id));
  if (!sel.pontos) sel.pontos = new Set(todosPontos.map(c => c.id));
  const doRecolhimento = new Set(itens().map(i => i.controle_id).filter(Boolean));
  const escolhidos = todosPontos.filter(c => sel.pontos.has(c.id));
  alvo.innerHTML = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn" type="button" id="foAnt" aria-label="Mês anterior">‹</button>
        <label class="campo" style="margin:0">Mês da ficha <input type="month" id="foMes" value="${esc(sel.mes)}"></label>
        <button class="btn" type="button" id="foSeg" aria-label="Mês seguinte">›</button>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="foVer">Ver as fichas</button>
        <button class="btn principal" type="button" id="foImp"${escolhidos.length ? '' : ' disabled'}>Imprimir ${escolhidos.length} ficha${escolhidos.length === 1 ? '' : 's'}</button>
      </div>
    </div>
    <div class="ot-sel">
      <div class="barra entre" style="margin:0 0 4px"><h3>Pontos de controle · ${escolhidos.length} de ${todosPontos.length}</h3>
        <span class="barra" style="margin:0"><button class="btn mini" type="button" id="foTodos">Todos</button>
        <button class="btn mini" type="button" id="foRec" title="Só os pontos ligados a um item do recolhimento">Só os do recolhimento</button>
        <button class="btn mini" type="button" id="foNenhum">Nenhum</button></span></div>
      <div class="ot-pontos">${ls.map(l => {
        const ps = pontosDe(l.id);
        return `<div class="ot-local">${esc(l.nome)}</div>` + (ps.map(c => `<label><input type="checkbox" data-pt="${esc(c.id)}"${sel.pontos.has(c.id) ? ' checked' : ''}>
          <span>${esc(c.nav_label)} <small class="dc-sem">· ${esc(/HIDR/i.test(c.titulo) ? 'hidrômetro' : /LEITURA/i.test(c.titulo) ? 'leitura' : 'horímetro')}</small></span></label>`).join('') || '<span class="dc-sem">sem pontos</span>');
      }).join('') || '<span class="dc-sem">Nenhum local cadastrado. Cadastre em Cadastros › Locais e pontos de controle.</span>'}</div>
    </div>
    <p class="dc-sem" style="margin:0">Uma página A4 por ponto, com uma linha para cada dia de ${esc(NomeMes(sel.mes).toLowerCase())} (${diasNoMes(sel.mes)} dias). Para mudar o título, o cabeçalho ou as colunas de um ponto, use Cadastros.</p>`;

  const ir = m => { sel.mes = m; abrirFichasOutorga(); };
  $('foAnt').onclick = () => ir(mesMais(sel.mes, -1));
  $('foSeg').onclick = () => ir(mesMais(sel.mes, 1));
  $('foMes').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(e.target.value); };
  $('foTodos').onclick = () => { sel.pontos = new Set(todosPontos.map(c => c.id)); abrirFichasOutorga(); };
  $('foNenhum').onclick = () => { sel.pontos = new Set(); abrirFichasOutorga(); };
  $('foRec').onclick = () => { sel.pontos = new Set(todosPontos.filter(c => doRecolhimento.has(c.id)).map(c => c.id)); abrirFichasOutorga(); };
  alvo.querySelectorAll('[data-pt]').forEach(cx => cx.onchange = () => {
    if (cx.checked) sel.pontos.add(cx.dataset.pt); else sel.pontos.delete(cx.dataset.pt);
    abrirFichasOutorga();
  });
  const html = () => escolhidos.map(c => fichaOutorga(c, sel.mes)).join('');
  $('foVer').onclick = () => { imprimirPaginas(html(), false); $('otFolha').scrollIntoView({ behavior: 'smooth' }); };
  $('foImp').onclick = () => imprimirPaginas(html());
  if ($('otFolha').innerHTML) imprimirPaginas(html(), false);
}

/* ---------------- tela: fichas de irrigação ---------------- */
export function abrirFichasIrrigacao() {
  const alvo = $('otFichasIrrCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ps = produtores().map(p => p.nome), ls = locais();
  if (!sel.prods) sel.prods = new Set(ps);
  if (!sel.locs) sel.locs = new Set(ls.map(l => l.id));
  const pEsc = ps.filter(p => sel.prods.has(p)), lEsc = ls.filter(l => sel.locs.has(l.id));
  const total = pEsc.length * lEsc.length;
  alvo.innerHTML = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn" type="button" id="fiAnt" aria-label="Mês anterior">‹</button>
        <label class="campo" style="margin:0">Mês da ficha <input type="month" id="fiMes" value="${esc(sel.irrMes)}"></label>
        <button class="btn" type="button" id="fiSeg" aria-label="Mês seguinte">›</button>
        <label class="campo" style="margin:0">Linhas por ficha <input type="number" id="fiLinhas" min="5" max="40" value="${sel.linhas}" style="width:80px"></label>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="fiVer">Ver as fichas</button>
        <button class="btn principal" type="button" id="fiImp"${total ? '' : ' disabled'}>Imprimir ${total} ficha${total === 1 ? '' : 's'}</button>
      </div>
    </div>
    <div class="ot-sel"><h3>Produtores</h3><div class="ot-chips">${ps.map(p => `<button type="button" class="ot-chip${sel.prods.has(p) ? ' on' : ''}" data-prod="${esc(p)}">${esc(p)}</button>`).join('') || '<span class="dc-sem">Cadastre os produtores em Cadastros.</span>'}</div>
      <h3>Fazendas</h3><div class="ot-chips">${ls.map(l => `<button type="button" class="ot-chip${sel.locs.has(l.id) ? ' on' : ''}" data-loc="${esc(l.id)}">${esc(l.nome)}</button>`).join('')}</div></div>
    <p class="dc-sem" style="margin:0">Cada combinação fazenda + produtor sai numa página própria (${pEsc.length} produtor${pEsc.length === 1 ? '' : 'es'} × ${lEsc.length} fazenda${lEsc.length === 1 ? '' : 's'}).</p>`;
  const ir = m => { sel.irrMes = m; abrirFichasIrrigacao(); };
  $('fiAnt').onclick = () => ir(mesMais(sel.irrMes, -1));
  $('fiSeg').onclick = () => ir(mesMais(sel.irrMes, 1));
  $('fiMes').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(e.target.value); };
  $('fiLinhas').onchange = e => { const v = parseInt(e.target.value, 10); if (v >= 5 && v <= 40) { sel.linhas = v; abrirFichasIrrigacao(); } };
  alvo.querySelectorAll('[data-prod]').forEach(b => b.onclick = () => { const k = b.dataset.prod; sel.prods.has(k) ? sel.prods.delete(k) : sel.prods.add(k); abrirFichasIrrigacao(); });
  alvo.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { const k = b.dataset.loc; sel.locs.has(k) ? sel.locs.delete(k) : sel.locs.add(k); abrirFichasIrrigacao(); });
  const html = () => pEsc.flatMap(p => lEsc.map(l => fichaIrrigacao(l, p, sel.irrMes, sel.linhas))).join('');
  $('fiVer').onclick = () => { imprimirPaginas(html(), false); $('otFolha').scrollIntoView({ behavior: 'smooth' }); };
  $('fiImp').onclick = () => imprimirPaginas(html());
  if ($('otFolha').innerHTML) imprimirPaginas(html(), false);
}

/** Ficha de um item do recolhimento (botão "Imprimir ficha" do Recebimento). */
export function fichaDoItem(it, m) {
  if (it.tipo === 'irrigacao') {
    const l = local(it.local_id);
    return l ? fichaIrrigacao(l, it.produtor || 'SAKUMA', m, sel.linhas) : '';
  }
  const c = it.controle_id ? ponto(it.controle_id) : null;
  return c ? fichaOutorga(c, m) : '';
}
export { aviso };
