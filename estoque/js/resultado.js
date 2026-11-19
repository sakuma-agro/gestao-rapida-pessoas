// resultado.js — Contagem › Resultado (17/11/2026, pedido do Guilherme).
//
// "Um local onde eu vou ver o resultado das contagens: o item, o que tem em
// cada fazenda — uma coluna de cada fazenda — e o que eu preciso comprar",
// com uma coluna só somando o que falta em todas as fazendas.
//
// De cada fazenda vale a última contagem FECHADA daquele tipo (EPIs, Material
// de limpeza…) — est_contagem_grupos fechado, ou a contagem inteira fechada
// antes de existir o fechamento por tipo. Uma contagem nova, aberta e ainda
// vazia, não esconde o resultado da anterior.
//
// Em cada fazenda onde o item ficou igual ou abaixo do mínimo da fazenda,
// entra o "pedir" do cadastro (ou, sem ele, o que falta para o mínimo). Essa
// necessidade é atendida em duas colunas (19/11/2026, pedido dele: "saber o
// que preciso fazer ao contar todos os estoques, se é transferir ou comprar"):
//   Transferir — o que o estoque principal (Lote 35) tem na prateleira e pode
//                mandar; ele pode ficar abaixo do mínimo dele, que a compra
//                repõe depois (escolha dele);
//   Comprar    — só o que o principal não tem para mandar, mais a reposição do
//                próprio principal. É o que vai no pedido de compra.
// O que já foi marcado como concluído em Contagem › Transferências sai da
// conta: não some de novo, nem no transferir nem no comprar.
import {
  $, esc, pronto, todos, locais as todosLocais, podeLocal, linhasDe, itensOrdenados, contaNoLocal,
  comMinimoDo, temMinimo, precisaRepor, lerNumero, mostrarNumero, dataBR, rodadaDe, GRUPOS, UNIDADES, aviso,
  localPrincipal, jaTransferido,
} from './dados.js';
import { enviarWhatsapp, FRASE_LOP } from './pdf.js';

const locais = () => todosLocais().filter(l => podeLocal(l.id));
const CHAVE = 'estoque.resultadoGrupo';
let grupo = 'EPIs';
let soComprar = false;
let busca = '';
/* Pedido de compra (17/11/2026): fornecedor, entregar em e observação ficam guardados no aparelho */
const CHAVE_PC = 'estoque.pedidoCompra';
/* Itens fora do pedido (19/11/2026, pedido dele: "quero poder selecionar os
   produtos que vão aparecer no pedido de compra, tem fornecedores diferentes").
   Guarda quem SAIU, não quem entrou: item novo na contagem já entra marcado.
   Fica no aparelho, junto com fornecedor e entrega, para ele fazer um pedido
   de cada fornecedor sem perder a escolha ao sair da tela. */
const PC = { aberto: false, forn: '', entrega: '', obs: '', fora: [], faturar: '', qtds: {}, extras: [] };
try { Object.assign(PC, JSON.parse(localStorage.getItem(CHAVE_PC) || '{}'), { aberto: false }); } catch { /* sem localStorage */ }
if (!Array.isArray(PC.fora)) PC.fora = [];
if (!PC.qtds || typeof PC.qtds !== 'object') PC.qtds = {};
if (!Array.isArray(PC.extras)) PC.extras = [];
/* Nasceu como "empregador" e ele corrigiu: é para quem o fornecedor fatura.
   Quem já tinha digitado não perde o que escreveu. */
if (!PC.faturar && PC.empregador) PC.faturar = PC.empregador;
delete PC.empregador;
/** O item entra no pedido? Tudo entra, menos o que ele desmarcou. */
const noPedido = r => !PC.fora.includes(r.item.id);
/* A lista do pedido: o que a contagem pediu, mais o que ele acrescentou à mão
   (19/11/2026, pedido dele: "quero poder adicionar um item que não está aqui"),
   em ordem alfabética (pedido dele no mesmo dia). O acrescentado não vem de
   contagem nenhuma: é nome, unidade e quantidade digitados, guardados no
   aparelho junto com o resto da escolha do pedido. */
const linhaExtra = x => ({ item: { id: x.id, nome: x.nome, unidade: x.unidade || '' }, comprar: Number(x.qtd) || 0, extra: true });
const paraComprar = linhas => [...linhas.filter(r => r.comprar > 0), ...PC.extras.map(linhaExtra)]
  .sort((a, b) => String(a.item.nome).localeCompare(String(b.item.nome), 'pt-BR'));
/* Quantidade que vai no pedido (19/11/2026, pedido dele: "quero poder alterar
   a qtde do pedido"): a calculada, ou a que ele digitou por cima. Guarda só o
   que foi mudado — item sem retoque acompanha a contagem nova. */
const qtdPedido = r => {
  const v = PC.qtds[r.item.id];
  return v === undefined || v === null || v === '' ? r.comprar : Number(v);
};
const qtdMudada = r => qtdPedido(r) !== r.comprar;
const doPedido = linhas => paraComprar(linhas).filter(noPedido);
const guardarPC = () => { try { localStorage.setItem(CHAVE_PC, JSON.stringify({ ...PC, aberto: false })); } catch { /* ok */ } };
try { grupo = localStorage.getItem(CHAVE) || grupo; } catch { /* sem localStorage */ }

/* Nome do estoque principal, para as notas da tela e das folhas (19/11/2026). */
const PRINC = () => { const l = localPrincipal(); return l ? l.nome : ''; };
const temQtd = l => !!l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '';
const grupoDe = i => (i && i.grupo) || 'Outros';

/** A última contagem fechada do tipo em cada fazenda: { contagem, data, quem }. */
function ultimaFechada(localId, g) {
  const contagens = [...new Map(todos('est_contagens').filter(c => c.local_id === localId).map(c => [c.id, c])).values()];
  const cgs = new Map();
  todos('est_contagem_grupos').forEach(x => cgs.set(x.id, x));   // a última versão de cada um
  const opcoes = [];
  for (const c of contagens) {
    const cg = cgs.get(c.id + ':' + g);
    if (cg && cg.ativo !== false) {
      if (cg.status === 'fechada') opcoes.push({ c, data: cg.data_contagem || c.data_contagem || '', em: cg.fechada_em || '', quem: cg.fechada_por || '' });
    } else if (c.status === 'fechada' && linhasDe(c.id).some(l => temQtd(l) && grupoDe(itemPorId().get(l.item_id)) === g)) {
      opcoes.push({ c, data: c.data_contagem || '', em: c.fechada_em || '', quem: c.fechada_por || '' });
    }
  }
  opcoes.sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.em).localeCompare(String(a.em))
    || b.c.mes.localeCompare(a.c.mes) || rodadaDe(b.c) - rodadaDe(a.c));
  return opcoes[0] || null;
}

let cacheItens = null;
const itemPorId = () => cacheItens || (cacheItens = new Map(todos('est_itens').map(i => [i.id, i])));

const numero = v => Number(v) || 0;
/** Quanto comprar para uma fazenda: o "pedir" do cadastro; sem ele, o que falta para o mínimo. */
function aComprar(item, qtd) {
  if (!precisaRepor(item, qtd)) return 0;
  const p = item.pedido_reposicao;
  if (p !== null && p !== undefined && p !== '') return numero(p);
  return Math.max(numero(item.estoque_minimo) - numero(qtd), 0);
}

/** Monta a tabela: fazendas (colunas) e itens (linhas). */
function montar(g = grupo) {
  cacheItens = null;
  const fazendas = locais().map(l => ({ local: l, ref: ultimaFechada(l.id, g) }));
  const comContagem = fazendas.filter(f => f.ref);
  const semContagem = fazendas.filter(f => !f.ref);
  const linhasPor = new Map(comContagem.map(f => [f.local.id, new Map(linhasDe(f.ref.c.id).map(l => [l.item_id, l]))]));
  const itens = itensOrdenados().filter(i => grupoDe(i) === g);
  /* A transferência sai sempre do principal (19/11/2026). Sem contagem fechada
     do principal — ou sem acesso a ele — não há de onde tirar: tudo vira
     compra, como era antes. */
  const princ = localPrincipal();
  const iP = princ ? comContagem.findIndex(f => f.local.id === princ.id) : -1;
  const linhas = [];
  for (const item of itens) {
    let total = 0, algum = false;
    const cel = comContagem.map(f => {
      const ln = linhasPor.get(f.local.id).get(item.id);
      const im = comMinimoDo(item, f.local.id);
      const conta = contaNoLocal(item, f.local.id);
      /* Item com mínimo na fazenda que não apareceu na contagem fechada: não
         tinha nada na prateleira — vale zero. Sem mínimo e sem linha: em branco. */
      let qtd = temQtd(ln) ? numero(ln.quantidade) : null;
      if (qtd === null && conta && temMinimo(im) && im.minimo_da_fazenda) qtd = 0;
      if (qtd !== null) { algum = true; total += qtd; }
      const falta = qtd !== null && precisaRepor(im, qtd);
      // tem na prateleira mas a fazenda não tem mínimo: nunca entra no Comprar (17/11/2026)
      const semMin = qtd !== null && qtd > 0 && !temMinimo(im);
      return { local: f.local, contagemId: f.ref.c.id, qtd, falta, semMin,
        minimo: temMinimo(im) ? im.estoque_minimo : null,
        precisa: qtd !== null ? aComprar(im, qtd) : 0, transferir: 0 };
    });
    const { comprar, transf } = repor(item, cel, iP, princ);
    const transferir = transf.reduce((t, x) => t + x.qtd, 0);
    // zerado em todas as fazendas e nada a fazer: não ocupa linha
    if (!algum || (!total && !comprar && !transferir)) continue;
    linhas.push({ item, cel, total, comprar, transferir, transf, grupo: g });
  }
  return { comContagem, semContagem, linhas };
}

/* A conta de cada item (19/11/2026, pedido dele):
   1. cada fazenda no mínimo ou abaixo precisa do pedido cadastrado (ou do que
      falta para o mínimo), menos o que já foi transferido por esta contagem;
   2. o que o principal tem na prateleira atende, começando por quem está mais
      abaixo do mínimo — ele pode furar o mínimo dele;
   3. a necessidade que o principal não cobriu vira compra;
   4. o principal compra o pedido dele e, tendo mandado transferência, nunca
      menos do que falta para ele voltar ao mínimo. */
function repor(item, cel, iP, princ) {
  const p = iP >= 0 ? cel[iP] : null;
  const feito = c => jaTransferido(c.contagemId, item.id, c.local.id);
  const destinos = cel.map((c, k) => ({ c, k })).filter(x => x.k !== iP && x.c.precisa > 0)
    .sort((a, b) => (numero(a.c.qtd) - numero(a.c.minimo)) - (numero(b.c.qtd) - numero(b.c.minimo)));
  let disp = p && p.qtd !== null
    ? Math.max(0, p.qtd - cel.reduce((t, c, k) => k === iP ? t : t + feito(c), 0)) : 0;
  let comprar = 0;
  const transf = [];
  for (const { c } of destinos) {
    const falta = Math.max(0, c.precisa - feito(c));
    const t = Math.min(falta, disp);
    disp -= t;
    c.transferir = t;
    if (t > 0) transf.push({ de: princ, para: c.local, qtd: t, contagemId: c.contagemId, precisa: c.precisa });
    comprar += falta - t;
  }
  if (p) {
    const saiu = numero(p.qtd) - disp;
    const gap = p.minimo !== null ? Math.max(0, numero(p.minimo) - disp) : 0;
    comprar += saiu > 0.0001 ? Math.max(p.precisa, gap) : p.precisa;
  }
  return { comprar: Math.round(comprar * 1000) / 1000, transf };
}

/** As transferências que ainda faltam fazer, de todos os tipos — tela Transferências. */
export function transferenciasAFazer() {
  const grupos = [...new Set(todos('est_itens').filter(i => i.ativo !== false).map(grupoDe))]
    .sort((a, b) => (GRUPOS.indexOf(a) + 1 || 99) - (GRUPOS.indexOf(b) + 1 || 99));
  const fora = [];
  for (const g of grupos) {
    for (const r of montar(g).linhas) {
      for (const t of r.transf) fora.push({ grupo: g, item: r.item, ...t });
    }
  }
  return fora;
}

function filtradas(linhas) {
  const b = busca.trim().toLowerCase();
  return linhas.filter(r => (!soComprar || r.comprar > 0) && (!b || String(r.item.nome).toLowerCase().includes(b)));
}

const cab = f => `${f.local.nome}`;
const dataCab = f => f.ref.data ? dataBR(f.ref.data) : '';

export function desenharResultado() {
  const alvo = $('ctResCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const grupos = [...new Set(todos('est_itens').filter(i => i.ativo !== false).map(grupoDe))]
    .sort((a, b) => (GRUPOS.indexOf(a) + 1 || 99) - (GRUPOS.indexOf(b) + 1 || 99));
  if (!grupos.includes(grupo) && grupos.length) grupo = grupos[0];
  const { comContagem, semContagem, linhas } = montar();
  const lista = filtradas(linhas);
  const nComprar = linhas.filter(r => r.comprar > 0).length;
  const nTransf = linhas.filter(r => r.transferir > 0).length;
  const nSemMin = linhas.reduce((t, r) => t + r.cel.filter(c => c.semMin).length, 0);
  const foco = document.activeElement && document.activeElement.id === 'resBusca';

  alvo.innerHTML = `
    <div class="grade">
      <label class="campo">Tipo <select id="resGrupo">${grupos.map(g =>
        `<option${g === grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="campo">Procurar item <input id="resBusca" type="search" value="${esc(busca)}" placeholder="nome do item"></label>
    </div>
    <div class="barra">
      <label class="es-check"><input type="checkbox" id="resSoComprar"${soComprar ? ' checked' : ''}> Só o que precisa comprar</label>
      <span class="dc-sem">${linhas.length} itens · ${nTransf} para transferir · ${nComprar} para comprar${nSemMin ? ` · <span class="res-semmin-txt">${nSemMin} sem mínimo</span>` : ''}</span>
    </div>
    ${semContagem.length ? `<p class="es-nota">Sem contagem fechada de ${esc(grupo)}: ${semContagem.map(f => esc(f.local.nome)).join(', ')}.</p>` : ''}
    ${!comContagem.length ? `<div class="vazio">Nenhuma contagem fechada de ${esc(grupo)} ainda.</div>` : `
    <div class="es-larga res-tab-caixa"><table class="dc-planilha res-tab"><thead><tr>
      <th>Item</th><th class="ce">Un.</th>
      ${comContagem.map(f => `<th class="ce">${esc(cab(f))}<small>${esc(dataCab(f))}</small></th>`).join('')}
      <th class="ce">Total</th><th class="ce res-transf">Transferir</th><th class="ce res-comprar">Comprar</th></tr></thead>
    <tbody>${lista.map(r => `<tr>
      <td>${esc(r.item.nome)}</td><td class="ce">${esc(r.item.unidade || '')}</td>
      ${r.cel.map(c => `<td class="ce${c.falta ? ' res-falta' : ''}"${c.minimo !== null ? ` title="mínimo ${esc(mostrarNumero(c.minimo))}"` : ''}>${c.qtd === null ? '—' : esc(mostrarNumero(c.qtd))}${c.semMin ? '<span class="res-semmin">sem mínimo</span>' : ''}</td>`).join('')}
      <td class="ce"><strong>${esc(mostrarNumero(r.total))}</strong></td>
      <td class="ce res-transf">${r.transferir > 0 ? `<strong>${esc(mostrarNumero(r.transferir))}</strong><small>${esc(r.transf.map(t => t.para.nome).join(' · '))}</small>` : ''}</td>
      <td class="ce res-comprar">${r.comprar > 0 ? `<strong>${esc(mostrarNumero(r.comprar))}</strong>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="${comContagem.length + 5}" class="ce">Nada para mostrar.</td></tr>`}</tbody></table></div>
    ${nSemMin ? `<p class="es-nota"><strong>Sem mínimo</strong>: o item tem na fazenda, mas ela não tem estoque mínimo cadastrado — ele não entra no Comprar
      até cadastrar o mínimo e o pedido em Cadastros › Produtos.</p>` : ''}
    <p class="es-nota">Em vermelho: a fazenda está no mínimo ou abaixo. O que ela precisa é o pedido cadastrado
      (Cadastros › Produtos, mínimo da fazenda) e sai primeiro do estoque principal${PRINC() ? ' (' + esc(PRINC()) + ')' : ''}:
      <strong>Transferir</strong> é o que ele tem para mandar; <strong>Comprar</strong> é só o que ele não tem, mais a reposição dele.
      Marque o que já saiu em <strong>Contagem › Transferências</strong>. Item com mínimo que não apareceu na contagem conta como zero.</p>
    ${painelPedido(linhas)}
    <div class="barra fim">
      <button class="btn" type="button" id="resPedido"${nComprar ? '' : ' disabled'}>${PC.aberto ? 'Fechar pedido de compra' : '🛒 Pedido de compra'}</button>
      <button class="btn btn-zap" type="button" id="resWhats"><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar PDF no WhatsApp</button>
      <button class="btn principal" type="button" id="resImprimir">Imprimir</button>
    </div>`}`;

  $('resGrupo').addEventListener('change', e => {
    grupo = e.target.value;
    try { localStorage.setItem(CHAVE, grupo); } catch { /* sem localStorage */ }
    desenharResultado();
  });
  $('resSoComprar').addEventListener('change', e => { soComprar = e.target.checked; desenharResultado(); });
  const ib = $('resBusca');
  ib.addEventListener('input', e => { busca = e.target.value; desenharResultado(); });
  if (foco) { ib.focus(); ib.setSelectionRange(ib.value.length, ib.value.length); }
  $('resImprimir')?.addEventListener('click', () => { montarFolha(comContagem, lista); setTimeout(() => window.print(), 50); });
  $('resWhats')?.addEventListener('click', ev => enviarWhatsapp(pdf(comContagem, lista), ev.currentTarget));
  $('resPedido')?.addEventListener('click', () => { PC.aberto = !PC.aberto; desenharResultado(); });
  if (PC.aberto && $('pcForn')) {
    const ler = () => {
      PC.forn = $('pcForn').value; PC.entrega = $('pcEntrega').value; PC.obs = $('pcObs').value;
      PC.faturar = $('pcFaturar').value.trim();
      guardarPC();
    };
    ['pcForn', 'pcEntrega', 'pcObs', 'pcFaturar'].forEach(id => $(id).addEventListener('change', ler));
    carregarEmpregadores();
    const itens = () => doPedido(linhas);
    const todosItens = paraComprar(linhas);
    const marcar = ids => { PC.fora = ids; guardarPC(); desenharResultado(); };
    $('pcTodos').addEventListener('click', () => marcar([]));
    $('pcNenhum').addEventListener('click', () => marcar(todosItens.map(r => r.item.id)));
    $('pcInverter').addEventListener('click', () => marcar(todosItens.filter(noPedido).map(r => r.item.id)));
    $('pcQtdCalc').addEventListener('click', () => { PC.qtds = {}; guardarPC(); desenharResultado(); });
    /* Acrescentar à mão: o nome puxa a unidade do cadastro, se o produto existir. */
    const doCatalogo = nome => todos('est_itens').find(i => i.ativo !== false
      && String(i.nome).trim().toLowerCase() === String(nome).trim().toLowerCase()) || null;
    $('pcNovoNome').addEventListener('change', () => {
      const i = doCatalogo($('pcNovoNome').value);
      if (i && !$('pcNovoUn').value.trim()) $('pcNovoUn').value = i.unidade || '';
    });
    const acrescentar = () => {
      const nome = $('pcNovoNome').value.trim();
      const qtd = lerNumero($('pcNovoQtd').value);
      if (!nome) { aviso('Escreva o nome do produto.', true); $('pcNovoNome').focus(); return; }
      if (!isFinite(qtd) || !(qtd > 0)) { aviso('Quantidade inválida.', true); $('pcNovoQtd').focus(); return; }
      const i = doCatalogo(nome);
      PC.extras = [...PC.extras, { id: 'extra:' + crypto.randomUUID(), nome: i ? i.nome : nome,
        unidade: $('pcNovoUn').value.trim() || (i ? i.unidade : '') || '', qtd }];
      guardarPC();
      desenharResultado();
      aviso(`${nome} entrou no pedido.`);
    };
    $('pcAdd').addEventListener('click', acrescentar);
    ['pcNovoNome', 'pcNovoQtd', 'pcNovoUn'].forEach(id => $(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); acrescentar(); }
    }));
    document.querySelectorAll('.pc-tira').forEach(b => b.addEventListener('click', () => {
      PC.extras = PC.extras.filter(x => x.id !== b.dataset.id);
      delete PC.qtds[b.dataset.id];
      guardarPC();
      desenharResultado();
    }));
    /* Digitou por cima: guarda o número dele. Caixa vazia volta ao calculado. */
    document.querySelectorAll('.pc-qtd').forEach(cx => cx.addEventListener('change', () => {
      const id = cx.dataset.id;
      const r = todosItens.find(x => x.item.id === id);
      const n = lerNumero(cx.value);
      if (cx.value.trim() === '' || (isFinite(n) && n === r.comprar)) delete PC.qtds[id];
      else if (!isFinite(n) || n === null || n < 0) { cx.value = mostrarNumero(qtdPedido(r)); return; }
      else PC.qtds[id] = n;
      guardarPC();
      cx.value = mostrarNumero(qtdPedido(r));
      cx.classList.toggle('mudada', qtdMudada(r));
      $('pcQtdCalc').disabled = !todosItens.some(qtdMudada);
    }));
    /* Marcar um item não redesenha a tela: a lista é longa e o dedo dele perde
       o lugar. Só o contador e os botões acompanham. */
    document.querySelectorAll('.pc-cx').forEach(cx => cx.addEventListener('change', () => {
      const id = cx.dataset.id;
      PC.fora = cx.checked ? PC.fora.filter(x => x !== id) : [...new Set([...PC.fora, id])];
      guardarPC();
      cx.closest('.es-check').toggleAttribute('data-fora', !cx.checked);
      const n = itens().length;
      $('pcConta').textContent = `${n} de ${todosItens.length} ${todosItens.length === 1 ? 'marcado' : 'marcados'}`;
      $('pcImp').disabled = !n; $('pcZap').disabled = !n;
    }));
    $('pcImp').addEventListener('click', () => { ler(); folhaPedido(itens()); setTimeout(() => window.print(), 60); });
    $('pcZap').addEventListener('click', ev => { ler(); enviarWhatsapp(pdfPedido(itens()), ev.currentTarget); });
  }
}

/* ---------------- Pedido de compra para o fornecedor (17/11/2026) ----------------
   Pedido dele: "um relatório de compras para ser enviado para o fornecedor, onde
   vai sair o nome do produto e qtde solicitada". Sai da coluna Comprar (soma de
   todas as fazendas), sem o que temos em estoque: Nº, Produto, Un. e Qtd. */
const fornecedores = () => [...new Map(todos('est_fornecedores').map(x => [x.id, x])).values()]
  .filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const fornPC = () => fornecedores().find(f => f.id === PC.forn) || null;
function entregaPC() {
  const ls = todosLocais();
  const l = ls.find(x => x.id === PC.entrega) || ls.find(x => /lote\s*35/i.test(x.nome)) || ls[0];
  return l ? l.nome : '';
}
function painelPedido(linhas) {
  if (!PC.aberto) return '';
  const todosItens = paraComprar(linhas);
  const escolhidos = todosItens.filter(noPedido);
  const n = escolhidos.length;
  const ls = todosLocais();
  const ent = (ls.find(x => x.id === PC.entrega) || ls.find(x => /lote\s*35/i.test(x.nome)) || ls[0] || {}).id;
  return `<div class="cartao pc-painel">
    <h3 style="margin:0 0 6px">Pedido de compra · ${esc(grupo)}</h3>
    <p class="dica" style="margin:0 0 8px">Vai para o fornecedor só o produto, a unidade e a quantidade da coluna <b>Comprar</b>.
      Desmarque o que não é deste fornecedor: a escolha fica guardada, então dá para imprimir um pedido de cada um.</p>
    <div class="barra" style="margin-bottom:6px">
      <b style="font-size:13px">Itens do pedido</b>
      <span class="dc-sem" id="pcConta">${n} de ${todosItens.length} ${todosItens.length === 1 ? 'marcado' : 'marcados'}</span>
      <span class="cresce"></span>
      <button class="btn mini" type="button" id="pcTodos">Marcar todos</button>
      <button class="btn mini" type="button" id="pcNenhum">Desmarcar todos</button>
      <button class="btn mini" type="button" id="pcInverter">Inverter</button>
      <button class="btn mini" type="button" id="pcQtdCalc"${todosItens.some(qtdMudada) ? '' : ' disabled'}>Voltar às quantidades calculadas</button>
    </div>
    <div class="pc-itens">${todosItens.map(r => `<div class="es-check pc-lin"${noPedido(r) ? '' : ' data-fora="1"'}>
      <label class="pc-marca"><input type="checkbox" class="pc-cx" data-id="${esc(r.item.id)}"${noPedido(r) ? ' checked' : ''}>
        <span class="pc-nome">${esc(r.item.nome)}</span></label>
      <input class="pc-qtd${qtdMudada(r) ? ' mudada' : ''}" inputmode="decimal" data-id="${esc(r.item.id)}"
        value="${esc(mostrarNumero(qtdPedido(r)))}" title="calculado: ${esc(mostrarNumero(r.comprar))}" aria-label="quantidade">
      <span class="pc-un">${esc(r.item.unidade || '')}</span>
      ${r.extra ? `<button class="pc-tira" type="button" data-id="${esc(r.item.id)}" title="tirar do pedido">&times;</button>` : ''}</div>`).join('')}</div>
    <div class="barra pc-novo">
      <input id="pcNovoNome" list="pcCatalogo" autocomplete="off" placeholder="acrescentar um produto que não está na lista">
      <datalist id="pcCatalogo">${itensOrdenados().filter(i => i.ativo !== false)
        .map(i => `<option value="${esc(i.nome)}">`).join('')}</datalist>
      <input id="pcNovoQtd" inputmode="decimal" placeholder="qtd">
      <input id="pcNovoUn" placeholder="un" list="pcUnidades">
      <datalist id="pcUnidades">${UNIDADES.map(u => `<option value="${esc(u)}">`).join('')}</datalist>
      <button class="btn mini" type="button" id="pcAdd">Acrescentar</button>
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Fornecedor <select id="pcForn"><option value="">— em branco (preencher à mão) —</option>${fornecedores().map(f =>
        `<option value="${esc(f.id)}"${f.id === PC.forn ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
      <label class="campo">Entregar em <select id="pcEntrega">${ls.map(l => `<option value="${esc(l.id)}"${l.id === ent ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
    </div>
    <label class="campo">Faturar em <input id="pcFaturar" list="pcFaturarLista" autocomplete="off"
      value="${esc(PC.faturar)}" placeholder="para quem o fornecedor fatura — ex.: FABIO MASSAO SAKUMA – FAZ. FACA">
      <datalist id="pcFaturarLista">${EMPREGADORES.map(e => `<option value="${esc(e)}">`).join('')}</datalist></label>
    <label class="campo">Observação <textarea id="pcObs" rows="2" placeholder="opcional">${esc(PC.obs)}</textarea></label>
    <div class="barra fim">
      <button class="btn btn-zap" type="button" id="pcZap"${n ? '' : ' disabled'}><img class="ic-zap" src="img/whatsapp.png" alt="">Pedido no WhatsApp</button>
      <button class="btn principal" type="button" id="pcImp"${n ? '' : ' disabled'}>Imprimir pedido</button>
    </div></div>`;
}
const hojeBR = () => new Date().toLocaleDateString('pt-BR');

/* Faturar em (19/11/2026, pedido dele: "quero poder selecionar o empregador,
   tipo Fabio Massao Sakuma - Faz. Faca, para sair no pedido" — e, logo
   depois: "é para quem vai faturar, fazenda"). É a quem o fornecedor emite a
   nota: a pessoa jurídica e a fazenda. A mesma fazenda pode ter mais de uma —
   o Lote 35 tem Fabio e Massato. A lista sai do cadastro de pessoal
   (funcionarios), o mesmo nome que vai no ASO, e fica guardada no aparelho
   para a tela abrir sem internet. O campo é livre: a lista é sugestão. */
const CHAVE_EMP = 'estoque.empregadores';
let EMPREGADORES = [];
try { EMPREGADORES = JSON.parse(localStorage.getItem(CHAVE_EMP) || '[]'); } catch { /* sem localStorage */ }
async function carregarEmpregadores() {
  const sb = window.App && window.App.sb;
  if (!sb || window.App.online === false) return;
  try {
    const { data, error } = await sb.schema('public').from('funcionarios').select('empregador, fazenda');
    if (error || !data) return;
    const nomes = new Set();
    for (const f of data) {
      const e = String(f.empregador || '').trim();
      if (!e) continue;
      nomes.add(e);
      const faz = String(f.fazenda || '').trim();
      if (faz) nomes.add(e + ' – ' + faz);
    }
    const lista = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (!lista.length || lista.join('|') === EMPREGADORES.join('|')) return;
    EMPREGADORES = lista;
    try { localStorage.setItem(CHAVE_EMP, JSON.stringify(lista)); } catch { /* cheio */ }
    if (PC.aberto) desenharResultado();
  } catch (e) { console.warn('não li os empregadores', e); }
}

function pdfPedido(itens) {
  const f = fornPC();
  return {
    titulo: 'Pedido de Compra',
    subtitulo: `${grupo} · emitido em ${hojeBR()}`,
    arquivo: `Pedido de Compra ${grupo} ${new Date().toISOString().slice(0, 10)}`,
    ficha: [
      ['Fornecedor', f ? f.nome : '', f && (f.contato || f.telefone) ? [f.contato, f.telefone].filter(Boolean).join(' · ') : ''],
      ['Data', hojeBR()],
      ['Faturar em', PC.faturar, 'quem recebe a nota'],
      ['Itens', String(itens.length)],
      ['Entregar em', entregaPC(), 'SAKUMA Agronegócios'],
      ['Tipo', grupo],
    ],
    secoes: [{
      titulo: 'Itens', head: ['Nº', 'Produto', 'Un.', 'Qtd. solicitada'],
      body: itens.map((r, k) => [k + 1, r.item.nome, r.item.unidade || '', mostrarNumero(qtdPedido(r))]),
      total: ['', `Total de itens: ${itens.length}`, '', ''],
      centro: [0, 2, 3], larguras: { 0: 12, 2: 18, 3: 32 },
    }],
    notas: PC.obs ? { titulo: 'Observação', texto: [PC.obs] } : undefined,
  };
}

function folhaPedido(itens) {
  const f = fornPC();
  const POR = 28, pags = [];
  for (let i = 0; i < itens.length; i += POR) pags.push(itens.slice(i, i + POR));
  if (!pags.length) pags.push([]);
  $('resFolha').innerHTML = pags.map((p, k) => `<div class="folha rel orc-folha">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Pedido de Compra</h1><p>${esc(grupo)} · emitido em ${esc(hojeBR())}</p></div>
    </div>
    ${k === 0 ? `<dl class="pc-ficha">
      <dt>Fornecedor</dt><dd${f ? '' : ' class="pontilhado"'}>${f ? esc(f.nome) : '&nbsp;'}${
        f && (f.contato || f.telefone) ? `<small>${esc([f.contato, f.telefone].filter(Boolean).join(' · '))}</small>` : ''}</dd>
      <dt>Data</dt><dd>${esc(hojeBR())}</dd>
      <dt>Faturar em</dt><dd${PC.faturar ? '' : ' class="pontilhado"'}>${PC.faturar ? esc(PC.faturar) : '&nbsp;'}<small>quem recebe a nota</small></dd>
      <dt>Itens</dt><dd>${itens.length}</dd>
      <dt>Entregar em</dt><dd>${esc(entregaPC())}<small>SAKUMA Agronegócios</small></dd>
      <dt>Tipo</dt><dd>${esc(grupo)}</dd>
    </dl>` : ''}
    <table class="rel-tab"><thead><tr><th class="ce" style="width:12mm">Nº</th><th>Produto</th><th class="ce" style="width:18mm">Un.</th><th class="ce" style="width:32mm">Qtd. solicitada</th></tr></thead>
    <tbody>${p.map(r => `<tr><td class="ce">${itens.indexOf(r) + 1}</td><td>${esc(r.item.nome)}</td><td class="ce">${esc(r.item.unidade || '')}</td>
      <td class="ce"><b>${esc(mostrarNumero(qtdPedido(r)))}</b></td></tr>`).join('')}
      ${k === pags.length - 1 ? `<tr class="rel-total"><td></td><td>Total de itens: ${itens.length}</td><td></td><td></td></tr>` : ''}</tbody></table>
    ${k === pags.length - 1 && PC.obs ? `<div class="orc-notas"><b>Observação</b><p>${esc(PC.obs)}</p></div>` : ''}
    <div class="rel-pe"><small class="lp-pag">${pags.length > 1 ? `Folha ${k + 1} de ${pags.length}` : ''}</small>
      <span class="orc-lop"><img class="rel-lop" src="img/lop-marca.png" alt="LOP"><small>${esc(FRASE_LOP)}</small></span></div>
  </div>`).join('');
}

const subtitulo = comContagem => `${grupo} · ${comContagem.map(f => f.local.nome + (dataCab(f) ? ' ' + dataCab(f) : '')).join(' · ')}${soComprar ? ' · só o que precisa comprar' : ''}`;

function pdf(comContagem, lista) {
  const hoje = new Date();
  return {
    titulo: 'Resultado da Contagem',
    subtitulo: subtitulo(comContagem) + ' · emitido em ' + hoje.toLocaleDateString('pt-BR'),
    arquivo: `Resultado da Contagem ${grupo} ${hoje.toISOString().slice(0, 10)}`,
    paisagem: comContagem.length > 3,
    secoes: [{
      titulo: grupo,
      head: ['Item', 'Un.', ...comContagem.map(f => f.local.nome + (dataCab(f) ? '\n' + dataCab(f) : '')), 'Total', 'Transferir', 'Comprar'],
      centro: [1, ...comContagem.map((_, k) => k + 2), comContagem.length + 2, comContagem.length + 3, comContagem.length + 4],
      body: lista.map(r => [r.item.nome, r.item.unidade || '', ...r.cel.map(c => c.qtd === null ? '—' : mostrarNumero(c.qtd) + (c.falta ? ' !' : '') + (c.semMin ? ' (s/ mín.)' : '')),
        mostrarNumero(r.total),
        r.transferir > 0 ? mostrarNumero(r.transferir) + ' > ' + r.transf.map(t => t.para.nome).join(' · ') : '',
        r.comprar > 0 ? mostrarNumero(r.comprar) : '']),
    }],
    notas: { titulo: '', texto: ['"!" = a fazenda está no mínimo ou abaixo. "(s/ mín.)" = sem estoque mínimo cadastrado, não entra na conta.',
      'Transferir = o que sai do estoque principal' + (PRINC() ? ' (' + PRINC() + ')' : '') + '. Comprar = o que o principal não tem para mandar, mais a reposição dele.'] },
  };
}

/** Folha A4 no padrão SAKUMA: marca no alto, tabela com grade, LOP no pé. */
function montarFolha(comContagem, lista) {
  $('resFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Resultado da Contagem</h1>
        <p>${esc(subtitulo(comContagem))} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p>
      </div>
    </div>
    <table class="rel-tab" style="margin-top:6mm"><thead><tr><th>Item</th><th class="ce">Un.</th>
      ${comContagem.map(f => `<th class="ce">${esc(f.local.nome)}${dataCab(f) ? '<br>' + esc(dataCab(f)) : ''}</th>`).join('')}
      <th class="ce">Total</th><th class="ce">Transferir</th><th class="ce">Comprar</th></tr></thead>
    <tbody>${lista.map(r => `<tr><td>${esc(r.item.nome)}</td><td class="ce">${esc(r.item.unidade || '')}</td>
      ${r.cel.map(c => `<td class="ce"${c.falta ? ' style="color:#a5342a;font-weight:bold"' : ''}>${c.qtd === null ? '—' : esc(mostrarNumero(c.qtd))}${c.semMin ? '<br><small style="color:#8a5f00">s/ mín.</small>' : ''}</td>`).join('')}
      <td class="ce">${esc(mostrarNumero(r.total))}</td>
      <td class="ce">${r.transferir > 0 ? `<b>${esc(mostrarNumero(r.transferir))}</b><br><small>${esc(r.transf.map(t => t.para.nome).join(' · '))}</small>` : ''}</td>
      <td class="ce"><b>${r.comprar > 0 ? esc(mostrarNumero(r.comprar)) : ''}</b></td></tr>`).join('')}</tbody></table>
    <p style="font-size:8pt;color:#51534A;margin:0">Em vermelho: a fazenda está no mínimo ou abaixo. "s/ mín." = sem estoque mínimo cadastrado, não entra na conta.
      Transferir = o que sai do estoque principal${PRINC() ? ' (' + esc(PRINC()) + ')' : ''}; Comprar = o que ele não tem para mandar, mais a reposição dele.</p>
    <div class="rel-pe"><span></span><img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}
