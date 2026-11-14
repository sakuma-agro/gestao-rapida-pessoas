// orcamento.js — Compra inteligente › Pedido de orçamento (14/11/2026).
//
// Pedido dele: "Estamos fazendo a contagem de EPI e material de limpeza, fizemos
// do Lote 35 (o estoque matriz)… quero saber o que comprar, quero enviar para
// fornecedor tipo uma lista de solicitar orçamento" + "monte a lista que deixe
// no app para eu emitir toda vez, tipo um submódulo".
//
// Como funciona:
//  - escolhe o estoque (abre no Lote 35, o matriz) e o grupo (EPIs / limpeza…);
//  - a lista nasce sozinha da ÚLTIMA contagem do estoque: entra todo item com o
//    contado igual ou abaixo do mínimo da fazenda, com a quantidade de
//    "pedido de reposição" do cadastro (sem pedido: mínimo − contado);
//  - dá para tirar item, mudar a quantidade e pôr item fora da lista (ex.: os
//    contados sem mínimo). As mudanças ficam guardadas no aparelho para aquela
//    contagem — emitir de novo traz a mesma lista;
//  - o documento vai para o fornecedor SEM o que temos em estoque: só item, CA,
//    unidade e quantidade, com as colunas de valor em branco para ele preencher.
//    Imprimir (A4) ou PDF no WhatsApp (só o arquivo, como na Reposição).
import {
  $, esc, pronto, todos, locais as todosLocais, podeLocal, linhasDe, maisNova,
  mostrarNumero, lerNumero, dataBR, comMinimoDo, temMinimo, precisaRepor, GRUPOS,
} from './dados.js';
import { enviarWhatsapp, FRASE_LOP } from './pdf.js';

const locais = () => todosLocais().filter(l => podeLocal(l.id));
const CHAVE = 'estoque.orc';
const F = { local: null, grupo: 'EPIs', forn: '', obs: '' };
try { Object.assign(F, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch { /* sem localStorage */ }
const guardarF = () => { try { localStorage.setItem(CHAVE, JSON.stringify(F)); } catch { /* ok */ } };

/* Edições da lista, por contagem: { [itemId]: { qtd, fora, extra } } */
const chaveEd = c => CHAVE + ':' + c.id;
function lerEd(c) { try { return JSON.parse(localStorage.getItem(chaveEd(c)) || '{}'); } catch { return {}; } }
function gravarEd(c, ed) { try { localStorage.setItem(chaveEd(c), JSON.stringify(ed)); } catch { /* ok */ } }

const dataDe = c => (c && c.data_contagem) || '';
const ultimaDoLocal = id => [...new Map(todos('est_contagens').filter(c => c.local_id === id).map(c => [c.id, c])).values()]
  .sort((a, b) => (dataDe(b) || b.mes).localeCompare(dataDe(a) || a.mes) || maisNova(a, b))[0] || null;
/* Data do grupo na contagem (cada tipo fecha com a sua data). */
function dataDoGrupo(c, grupo) {
  const g = todos('est_contagem_grupos').find(x => x.contagem_id === c.id && x.grupo === grupo && x.ativo !== false);
  return (g && g.data_contagem) || c.data_contagem || '';
}
const fornecedores = () => [...new Map(todos('est_fornecedores').map(x => [x.id, x])).values()]
  .filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const num = v => v === null || v === undefined || v === '' ? null : Number(v);
const sugerido = item => {
  const p = num(item.pedido_reposicao);
  if (p !== null && p > 0) return p;
  return null;
};

/** Monta a lista do estoque/grupo escolhidos a partir da última contagem. */
function montarLista(local, c) {
  const itens = new Map(todos('est_itens').filter(i => i.ativo !== false).map(i => [i.id, i]));
  const ed = lerEd(c);
  const contados = new Map();
  for (const ln of linhasDe(c.id)) {
    const it = itens.get(ln.item_id);
    if (!it || (F.grupo && it.grupo !== F.grupo)) continue;
    if (ln.quantidade === null || ln.quantidade === undefined || ln.quantidade === '') continue;
    contados.set(it.id, { item: comMinimoDo(it, local.id), qtd: Number(ln.quantidade) });
  }
  const lista = [], semMin = [];
  for (const { item, qtd } of contados.values()) {
    const e = ed[item.id] || {};
    const automatico = precisaRepor(item, qtd);
    if (!temMinimo(item) && !e.extra) semMin.push({ item, qtd });
    if (!automatico && !e.extra) continue;
    const min = num(item.estoque_minimo);
    const base = sugerido(item) ?? (min !== null ? Math.max(min - qtd, 1) : 1);
    lista.push({ item, tem: qtd, min, pedir: e.qtd !== undefined ? e.qtd : base, fora: !!e.fora, extra: !!e.extra && !automatico });
  }
  /* itens postos à mão que não foram contados (ou não estão no grupo da contagem) */
  for (const [id, e] of Object.entries(ed)) {
    if (!e.extra || contados.has(id)) continue;
    const it = itens.get(id);
    if (!it || (F.grupo && it.grupo !== F.grupo)) continue;
    lista.push({ item: comMinimoDo(it, local.id), tem: null, min: num(comMinimoDo(it, local.id).estoque_minimo), pedir: e.qtd ?? 1, fora: !!e.fora, extra: true });
  }
  lista.sort((a, b) => a.item.nome.localeCompare(b.item.nome, 'pt-BR'));
  semMin.sort((a, b) => a.item.nome.localeCompare(b.item.nome, 'pt-BR'));
  return { lista, semMin, ed };
}

let telaAberta = false;
let ultimo = null; // { local, c, lista } para imprimir/PDF

export function desenharOrcamento() {
  telaAberta = true;
  const alvo = $('orcCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ls = locais();
  if (!ls.length) { alvo.innerHTML = '<div class="vazio">Nenhum estoque liberado para você.</div>'; return; }
  if (!ls.some(l => l.id === F.local)) F.local = (ls.find(l => /lote\s*35/i.test(l.nome)) || ls[0]).id;
  const local = ls.find(l => l.id === F.local);
  const c = ultimaDoLocal(local.id);
  const grupos = GRUPOS.filter(g => todos('est_itens').some(i => i.ativo !== false && i.grupo === g));
  const forns = fornecedores();

  const topo = `
    <div class="barra">
      <label class="campo">Estoque <select id="orcLocal">${ls.map(l => `<option value="${esc(l.id)}"${l.id === local.id ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1;min-width:200px">Fornecedor <select id="orcForn"><option value="">— em branco (preencher à mão) —</option>${forns.map(f =>
        `<option value="${esc(f.id)}"${f.id === F.forn ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
    </div>
    <div class="ct-chips" style="margin:2px 0 10px">${grupos.map(g => `<button type="button" class="ct-chip" data-g="${esc(g)}" aria-pressed="${g === F.grupo}">${esc(g)}</button>`).join('')}</div>`;

  if (!c) { alvo.innerHTML = topo + `<div class="vazio">${esc(local.nome)} ainda não tem contagem.</div>`; ligarTopo(); return; }
  const { lista, semMin, ed } = montarLista(local, c);
  const dataG = dataDoGrupo(c, F.grupo);
  const vale = lista.filter(r => !r.fora && Number(r.pedir) > 0);
  ultimo = { local, c, lista: vale, dataG };

  alvo.innerHTML = topo + `
    <p class="dica" style="margin:0 0 8px">Base: <b>contagem de ${esc(dataBR(dataG))}</b> de ${esc(local.nome)} · entra o que ficou igual ou abaixo do mínimo,
      com a quantidade de reposição do cadastro. Desmarque o que não quer pedir e ajuste a quantidade.</p>
    <div class="es-larga"><table class="tabela orc-tab"><thead><tr><th class="ce">Pedir?</th><th>Item</th><th>CA</th><th class="ce">Tem</th><th class="ce">Mínimo</th><th class="ce">Quantidade</th><th class="ce">Un.</th></tr></thead>
    <tbody>${lista.map(r => `<tr class="${r.fora ? 'orc-fora' : ''}" data-id="${esc(r.item.id)}">
      <td class="ce"><input type="checkbox" class="orc-ok"${r.fora ? '' : ' checked'}></td>
      <td>${esc(r.item.nome)}${r.extra ? ' <span class="tag">posto à mão</span>' : ''}</td>
      <td>${esc(r.item.ca || '—')}</td>
      <td class="ce">${r.tem === null ? '—' : esc(mostrarNumero(r.tem))}</td>
      <td class="ce">${r.min === null ? '—' : esc(mostrarNumero(r.min))}</td>
      <td class="ce"><input type="text" inputmode="decimal" class="orc-qtd" value="${esc(mostrarNumero(r.pedir))}" style="width:70px;text-align:center"></td>
      <td class="ce">${esc(r.item.unidade || '')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="dc-sem">Nada de ${esc(F.grupo)} no mínimo nesta contagem.</td></tr>`}</tbody></table></div>
    <div class="barra" style="margin-top:8px">
      <label class="campo" style="flex:1;min-width:220px">Pôr outro item na lista <select id="orcAdd"><option value="">— escolher —</option>${todos('est_itens')
        .filter(i => i.ativo !== false && i.grupo === F.grupo && !lista.some(r => r.item.id === i.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(i => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('')}</select></label>
      <button class="btn" type="button" id="orcLimpar">Voltar à lista automática</button>
    </div>
    ${semMin.length ? `<details class="orc-semmin"><summary>${semMin.length} ${semMin.length === 1 ? 'item contado não tem' : 'itens contados não têm'} estoque mínimo — não entram sozinhos</summary>
      <div class="lista">${semMin.map(s => `<div class="item"><span></span><div><div class="nome">${esc(s.item.nome)}</div>
        <div class="sub">contado ${esc(mostrarNumero(s.qtd))} ${esc(s.item.unidade || '')}</div></div>
        <div class="acoes"><button class="btn" type="button" data-add="${esc(s.item.id)}">+ Pedir</button></div></div>`).join('')}</div>
      <p class="dica">Defina o mínimo em Cadastros › Produtos para eles entrarem sozinhos da próxima vez.</p></details>` : ''}
    <label class="campo" style="margin-top:10px">Observação para o fornecedor <textarea id="orcObs" rows="2" placeholder="ex.: entregar na sede do Lote 35; EPIs com CA válido">${esc(F.obs)}</textarea></label>
    <div class="barra fim">
      <span class="dc-sem">${vale.length} ${vale.length === 1 ? 'item' : 'itens'} no pedido</span>
      <button class="btn btn-zap" type="button" id="orcZap"${vale.length ? '' : ' disabled'}><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar PDF no WhatsApp</button>
      <button class="btn principal" type="button" id="orcImp"${vale.length ? '' : ' disabled'}>Imprimir</button>
    </div>`;
  ligarTopo();

  const mexer = (id, f) => { const e = ed[id] || (ed[id] = {}); f(e); gravarEd(c, ed); };
  alvo.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('.orc-ok').addEventListener('change', ev => { mexer(id, e => { e.fora = !ev.target.checked; }); desenharOrcamento(); });
    tr.querySelector('.orc-qtd').addEventListener('change', ev => {
      const v = lerNumero(ev.target.value);
      mexer(id, e => { e.qtd = v === null || Number.isNaN(v) ? 0 : v; });
      desenharOrcamento();
    });
  });
  const add = id => { if (!id) return; mexer(id, e => { e.extra = true; e.fora = false; }); desenharOrcamento(); };
  $('orcAdd').addEventListener('change', ev => add(ev.target.value));
  alvo.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => add(b.dataset.add)));
  $('orcLimpar').addEventListener('click', () => {
    if (!confirm('Voltar à lista automática? As quantidades mudadas e os itens postos à mão saem.')) return;
    gravarEd(c, {}); desenharOrcamento();
  });
  $('orcObs').addEventListener('change', ev => { F.obs = ev.target.value; guardarF(); });
  $('orcImp').addEventListener('click', () => { F.obs = $('orcObs').value; guardarF(); montarFolha(); setTimeout(() => window.print(), 60); });
  $('orcZap').addEventListener('click', ev => { F.obs = $('orcObs').value; guardarF(); enviarWhatsapp(pdfOrc(), ev.currentTarget); });
}

function ligarTopo() {
  $('orcLocal').addEventListener('change', ev => { F.local = ev.target.value; guardarF(); desenharOrcamento(); });
  $('orcForn').addEventListener('change', ev => { F.forn = ev.target.value; guardarF(); });
  document.querySelectorAll('#orcCorpo .ct-chip').forEach(b => b.addEventListener('click', () => { F.grupo = b.dataset.g; guardarF(); desenharOrcamento(); }));
}

/* ---------------- o documento para o fornecedor ---------------- */
const hoje = () => new Date().toLocaleDateString('pt-BR');
const fornAtual = () => fornecedores().find(f => f.id === F.forn) || null;
const titulo = () => 'Solicitação de Orçamento';
const subtitulo = () => `${F.grupo} · entrega em ${ultimo.local.nome} · emitida em ${hoje()}`;
const PEDIMOS = [
  'Prazo de entrega:', 'Condição de pagamento:', 'Frete (CIF / FOB):', 'Validade da proposta:',
];
const notaEpi = () => F.grupo === 'EPIs' ? 'EPIs com Certificado de Aprovação (CA) válido. Se o CA for outro, informe o número e a marca/modelo ao lado do item.' : '';
const linhasDoc = () => ultimo.lista.map((r, k) => ({
  n: k + 1, nome: r.item.nome, ca: r.item.ca || '', un: r.item.unidade || '', qtd: mostrarNumero(r.pedir),
}));
const comCa = () => F.grupo === 'EPIs';

function pdfOrc() {
  const f = fornAtual();
  const head = ['Nº', 'Item', ...(comCa() ? ['CA'] : []), 'Un.', 'Qtd.', 'Marca / modelo', 'Valor unit. (R$)', 'Total (R$)'];
  const body = linhasDoc().map(l => [l.n, l.nome, ...(comCa() ? [l.ca] : []), l.un, l.qtd, '', '', '']);
  const i0 = comCa() ? 3 : 2;
  return {
    titulo: titulo(), subtitulo: 'Solicitante: SAKUMA Agronegócios · ' + subtitulo(),
    arquivo: `Solicitacao de Orcamento ${F.grupo} ${new Date().toISOString().slice(0, 10)}`,
    kpis: [['Para (fornecedor)', f ? f.nome : ' '], ['Itens', String(body.length)], ['Data', hoje()]],
    secoes: [{
      titulo: 'Itens', head, body,
      total: ['', 'Total geral', ...(comCa() ? [''] : []), '', '', '', '', ''],
      centro: [0, i0, i0 + 1], larguras: { 0: 8, [i0]: 10, [i0 + 1]: 12, [i0 + 2]: 30, [i0 + 3]: 22, [i0 + 4]: 22, ...(comCa() ? { 2: 30 } : {}) },
    }],
    notas: { titulo: 'Favor informar na proposta', linhas: PEDIMOS, texto: [notaEpi(), F.obs].filter(Boolean) },
  };
}

function montarFolha() {
  const f = fornAtual();
  const ls = linhasDoc();
  const POR = 24;
  const pags = [];
  for (let i = 0; i < ls.length; i += POR) pags.push(ls.slice(i, i + POR));
  if (!pags.length) pags.push([]);
  const ca = comCa();
  $('orcFolha').innerHTML = pags.map((p, k) => `<div class="folha rel orc-folha">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>${esc(titulo())}</h1><p>${esc(subtitulo())}</p></div>
    </div>
    ${k === 0 ? `<div class="orc-dados">
      <div><span>Para (fornecedor)</span><b>${f ? esc(f.nome) : '&nbsp;'}</b>${f && (f.contato || f.telefone) ? `<small>${esc([f.contato, f.telefone].filter(Boolean).join(' · '))}</small>` : ''}</div>
      <div><span>Solicitante</span><b>SAKUMA Agronegócios</b><small>entrega em ${esc(ultimo.local.nome)}</small></div>
      <div><span>Data</span><b>${esc(hoje())}</b><small>${ls.length} ${ls.length === 1 ? 'item' : 'itens'}</small></div>
    </div>` : ''}
    <table class="rel-tab orc-doc"><thead><tr><th class="ce">Nº</th><th>Item</th>${ca ? '<th>CA</th>' : ''}<th class="ce">Un.</th><th class="ce">Qtd.</th>
      <th>Marca / modelo</th><th class="ce">Valor unit. (R$)</th><th class="ce">Total (R$)</th></tr></thead>
    <tbody>${p.map(l => `<tr><td class="ce">${l.n}</td><td>${esc(l.nome)}</td>${ca ? `<td>${esc(l.ca)}</td>` : ''}<td class="ce">${esc(l.un)}</td>
      <td class="ce"><b>${esc(l.qtd)}</b></td><td></td><td></td><td></td></tr>`).join('')}
      ${k === pags.length - 1 ? `<tr class="rel-total"><td></td><td>Total geral</td>${ca ? '<td></td>' : ''}<td></td><td></td><td></td><td></td><td></td></tr>` : ''}</tbody></table>
    ${k === pags.length - 1 ? `<div class="orc-notas"><b>Favor informar na proposta</b>
      <div class="orc-campos">${PEDIMOS.map(t => `<div>${esc(t)} <span></span></div>`).join('')}</div>
      ${[notaEpi(), F.obs].filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
    <div class="rel-pe"><small class="lp-pag">${pags.length > 1 ? `Folha ${k + 1} de ${pags.length}` : ''}</small>
      <span class="orc-lop"><img class="rel-lop" src="img/lop-marca.png" alt="LOP"><small>${esc(FRASE_LOP)}</small></span></div>
  </div>`).join('');
}

/* redesenha quando a base muda, sem atrapalhar quem está digitando */
window.addEventListener('estoque-dados', () => {
  if (!telaAberta) return;
  const a = document.activeElement;
  if (a && (a.classList.contains('orc-qtd') || a.id === 'orcObs')) return;
  desenharOrcamento();
});
export function soltarOrcamento() { telaAberta = false; }
