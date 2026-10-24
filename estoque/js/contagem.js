// contagem.js — módulo Contagem da área Estoque (15/10/2026).
//
// Todo mês, em cada almoxarifado, a pessoa abre a lista de insumos e digita
// só o total que está na prateleira, na frente de cada um. A lista é a mesma
// em todos os almoxarifados (decisão do Guilherme: "todos em todos"). Cada
// número é guardado no aparelho na hora e sobe quando há sinal. Fechada a
// contagem, ela entra sozinha no Acerto, no lugar das abas "Físico".
import {
  $, esc, pronto, todos, aviso, souAdmin, meuNome, locais as todosLocais, podeLocal, meusLocais, itensOrdenados, itensDoLocal,
  mesAtual, nomeMes, idContagem, idLinha, contagem, linhasDe, progresso,
  contagensDoMes, rodadaDe, nomeRodada, maisNova, saldoRegistrado, UNIDADES,
  lerNumero, mostrarNumero, dataHora, lotesDe, dataBR, hojeISO,
  temMinimo, precisaRepor as precisaReporGeral, textoPedido, comMinimoDo,
  mapaDoLocal, quadrasDe, idQuadraLinha, capacidadeQuadra, pesoBag, mesAnterior,
} from './dados.js';
/* Só os estoques liberados para esta pessoa (22/10/2026). */
const locais = () => todosLocais().filter(l => podeLocal(l.id));
/* Quem pode excluir a contagem de um tipo (pedido dele, 23/10/2026): o
   administrador e o responsável pelo estoque — quem tem esse estoque marcado
   em Usuários - Acessos › Estoques que vê (ex.: Laís na Quebra Cocão). */
const podeExcluir = localId => souAdmin() || meusLocais().includes(localId);
import { desenharMapa, soltarMapa } from './mapa.js';
import { gravar as gravarDireto } from './dados.js';

/* Gravações uma de cada vez (15/10/2026): dois campos do mesmo lote salvos
   quase juntos (lote e validade) entravam em dobro na lista do aparelho. */
let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

/* Data do dia em que se contou (pedido dele, 22/10/2026): fica na contagem
   (est_contagens.data_contagem), nasce com o dia de hoje do aparelho e pode
   ser trocada enquanto a contagem está aberta. */
const hojeLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const textoData = c => c && c.data_contagem ? 'contada em ' + dataBR(c.data_contagem) : '';

/* O que está escolhido na tela Contar. */
const CHAVE_LOCAL = 'estoque.contarLocal';
const CHAVE_GRUPO = 'estoque.contarGrupo';
const sel = { localId: null, mes: mesAtual(), grupo: null, rodada: null };

/* Mais de uma contagem no mesmo mês (pedido dele, 23/10/2026): sel.rodada
   escolhe qual (1ª, 2ª…); vazio = a mais recente do mês. Uma nova só começa
   depois que a anterior do mês fechou; o Acerto usa a última fechada. */
const atual = () => contagem(sel.localId, sel.mes, sel.rodada);
/** A contagem de antes desta: a rodada anterior do mês ou a última do mês passado. */
function anterior() {
  const c = atual();
  const r = c ? rodadaDe(c) : 1;
  if (r > 1) return contagem(sel.localId, sel.mes, r - 1);
  return contagem(sel.localId, mesAnterior(sel.mes));
}
const rotuloAnterior = ant => ant.mes === sel.mes ? nomeRodada(rodadaDe(ant)) : nomeMes(ant.mes);
const sufixoRodada = c => c && (rodadaDe(c) > 1 || contagensDoMes(c.local_id, c.mes).length > 1) ? ' · ' + nomeRodada(rodadaDe(c)) : '';
try { sel.localId = localStorage.getItem(CHAVE_LOCAL); sel.grupo = localStorage.getItem(CHAVE_GRUPO); } catch { /* sem localStorage */ }

/* Mínimo da fazenda escolhida na tela (22/10/2026). */
const precisaRepor = (item, qtd, localId = sel.localId) => precisaReporGeral(comMinimoDo(item, localId), qtd);

/* Contagem por TIPO (pedido dele, 22/10/2026): cada grupo — Defensivos, EPIs,
   Fertilizantes… — tem data, quem contou e fechamento próprios, gravados em
   est_contagem_grupos (id contagem_id:grupo). A contagem do mês
   (est_contagens) só fica "fechada" — e entra no Acerto — quando todos os
   tipos do almoxarifado fecharem. Contagem fechada antes disso existir vale
   como todos os tipos fechados. */
const idGrupoC = (cid, g) => cid + ':' + g;
const grupoDe = i => (i && i.grupo) || 'Outros';
/* Lista da contagem (pedido dele, 23/10/2026): só o que TEM em estoque —
   saldo registrado no app diferente de zero (entradas e saídas, ou o saldo do
   sistema lançado no Acerto) —, mais o que já foi lançado nesta contagem e o
   que a pessoa acrescentar pelo "+ Adicionar item". Estoque sem saldo
   registrado: o que tinha quantidade na última contagem fechada; sem nenhuma
   contagem antes, todos os itens. */
const temQtd = l => !!l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '';
const dataRef = c => (c && c.data_contagem) || hojeLocal();
/* Por TIPO (correção 24/10/2026): um tipo que ficou todo zerado/em branco na
   contagem anterior (ex.: 1ª contagem de out/2026 do Lote 35 fechada só com
   EPIs, Fertilizantes zerados) não pode sumir da próxima. Para cada tipo
   procura a última contagem fechada em que ELE teve quantidade; se nenhuma
   teve, mostra todos os itens daquele tipo no estoque. */
function contagensFechadasAntes(localId, mes, c) {
  const r = c ? rodadaDe(c) : 9999;
  return todos('est_contagens').filter(x => x.local_id === localId && x.status === 'fechada'
    && (x.mes < mes || (x.mes === mes && rodadaDe(x) < r))).sort(maisNova);
}
function itensDaContagem(localId, mes, c) {
  const todosItens = itensDoLocal(localId);
  const naContagem = new Set((c ? linhasDe(c.id) : []).map(l => l.item_id));
  const reg = saldoRegistrado(localId, mes, dataRef(c));
  const porGrupo = new Map();
  todosItens.forEach(i => { const g = grupoDe(i); if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(i); });
  const antes = reg ? null : contagensFechadasAntes(localId, mes, c);
  if (!reg && !antes.length) return { itens: todosItens, criterio: 'todos', total: todosItens.length, reg: null };
  const comQtdDe = new Map(); // contagem id -> Set de item_id com quantidade > 0
  const comQtd = cid => {
    if (!comQtdDe.has(cid)) comQtdDe.set(cid, new Set(linhasDe(cid).filter(l => Number(l.quantidade) > 0).map(l => l.item_id)));
    return comQtdDe.get(cid);
  };
  const itens = [];
  porGrupo.forEach(lista => {
    let tem = null;
    if (reg) {
      const comSaldo = lista.filter(i => (reg.saldos.get(i.id) || 0) !== 0);
      if (comSaldo.length) tem = id => (reg.saldos.get(id) || 0) !== 0;
    }
    if (!tem) {
      const lista2 = antes || contagensFechadasAntes(localId, mes, c);
      const ant = lista2.find(x => lista.some(i => comQtd(x.id).has(i.id)));
      tem = ant ? (id => comQtd(ant.id).has(id)) : (() => true);
    }
    lista.forEach(i => { if (tem(i.id) || naContagem.has(i.id)) itens.push(i); });
  });
  return { itens, criterio: reg ? 'registro' : 'anterior', total: todosItens.length, reg };
}
const gruposDaContagem = (localId, mes, c) => [...new Set(itensDaContagem(localId, mes, c).itens.map(grupoDe))];
/* tipo excluído (ativo false, 23/10/2026) conta como não começado */
const cgDe = (c, g) => { if (!c) return null; const x = todos('est_contagem_grupos').filter(y => y.id === idGrupoC(c.id, g)).pop(); return x && x.ativo !== false ? x : null; };
function grupoFechado(c, g) {
  if (!c) return false;
  const cg = cgDe(c, g);
  return cg ? cg.status === 'fechada' : c.status === 'fechada';
}
function progressoGrupo(c, lista, g) {
  const itens = lista.filter(i => grupoDe(i) === g);
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const feitos = itens.filter(i => { const l = linhas.get(i.id); return l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== ''; }).length;
  return { feitos, total: itens.length };
}
/** Situação de cada tipo de um almoxarifado no mês. */
function situacaoTipos(localId, mes, rodada) {
  const c = contagem(localId, mes, rodada);
  const { itens } = itensDaContagem(localId, mes, c);
  return [...new Set(itens.map(grupoDe))].map(g => {
    const cg = cgDe(c, g);
    const p = progressoGrupo(c, itens, g);
    const fechado = grupoFechado(c, g);
    return { g, cg, p, fechado, comecado: fechado || !!cg || p.feitos > 0 };
  });
}
/** O registro do tipo nesta contagem (nasce na primeira gravação). */
async function garantirGrupo(c, g) {
  const cg = cgDe(c, g);
  if (cg) return cg;
  return gravar('est_contagem_grupos', { id: idGrupoC(c.id, g), contagem_id: c.id, grupo: g, status: 'aberta',
    data_contagem: dataEscolhida(), responsavel: meuNome(), ativo: true });
}
/** Quando todos os tipos fecham, a contagem do mês fecha (e entra no Acerto). */
async function conferirFechamentoMes(c) {
  const tipos = gruposDaContagem(c.local_id, c.mes, c);
  const todosFechados = tipos.every(g => grupoFechado(c, g));
  const datas = tipos.map(g => (cgDe(c, g) || {}).data_contagem).filter(Boolean).sort();
  if (todosFechados && c.status !== 'fechada') {
    await gravar('est_contagens', Object.assign({}, c, { status: 'fechada', fechada_por: meuNome(),
      fechada_em: new Date().toISOString(), data_contagem: datas[datas.length - 1] || c.data_contagem || dataEscolhida() }));
    return true;
  }
  if (!todosFechados && c.status === 'fechada') {
    await gravar('est_contagens', Object.assign({}, c, { status: 'aberta', fechada_por: null, fechada_em: null }));
  }
  return false;
}

let telaAberta = null;
const abertos = new Set();   // itens com a lista de lotes aberta (sobrevive ao redesenho)
let soFalta = false;
let grupoFiltro = '';   // '' = todos os grupos
let busca = '';
let mapa = null;        // mapa do barracão do estoque escolhido (só fertilizantes)

/* ===================================================================
   Tela Contar
   =================================================================== */

function cabecalhoEscolha() {
  const ls = locais();
  if (!ls.some(l => l.id === sel.localId)) sel.localId = ls[0] ? ls[0].id : null;
  return `<div class="cartao naoimprimir">
    <h2>Contar o estoque</h2>
    <p class="dica">Escolha o almoxarifado e o mês. Depois é só digitar o total de cada item,
      do jeito que está na prateleira. Salva sozinho, mesmo sem internet.</p>
    <div class="grade">
      <label class="campo">Almoxarifado
        <select id="ctLocal">${ls.map(l =>
          `<option value="${esc(l.id)}"${l.id === sel.localId ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}
        </select></label>
      <label class="campo">Mês da contagem
        <input type="month" id="ctMes" value="${esc(sel.mes)}" max="${mesAtual()}"></label>
    </div>
    ${blocoRodadas()}
  </div>`;
}

/* As contagens do mês (1ª, 2ª…) e o botão de começar outra. */
function blocoRodadas() {
  if (!sel.localId) return '';
  const lista = contagensDoMes(sel.localId, sel.mes);
  const ultima = lista[lista.length - 1];
  const vista = atual();
  const chips = lista.length > 1 ? `<div class="ct-chips ct-rodadas" role="tablist">${lista.map(c => `<button type="button" role="tab"
    class="ct-chip${c.status === 'fechada' ? ' completo' : ''}" data-rodada="${rodadaDe(c)}" aria-pressed="${vista && vista.id === c.id}">${c.status === 'fechada' ? '✓ ' : ''}${esc(nomeRodada(rodadaDe(c)))}
    <small>${c.status === 'fechada' ? (c.data_contagem ? esc(dataBR(c.data_contagem).slice(0, 5)) : 'fechada') : 'em andamento'}</small></button>`).join('')}</div>` : '';
  const pode = ultima && ultima.status === 'fechada';
  const dica = !ultima ? '' : pode
    ? `A ${esc(nomeRodada(rodadaDe(ultima)))} de ${esc(nomeMes(sel.mes))} está fechada. Precisa contar de novo? Comece outra — a última fechada é a que vale no Acerto.`
    : lista.length > 1 || rodadaDe(ultima) > 1 ? '' : 'Para começar outra contagem neste mês, feche todos os tipos desta primeiro.';
  return `${chips}<div class="barra entre ct-rodada-pe">
    <span class="dc-sem">${dica}</span>
    ${pode ? `<button class="btn" type="button" id="ctNovaRodada">+ Nova contagem em ${esc(nomeMes(sel.mes))}</button>` : ''}
  </div>`;
}

function novaRodada() {
  const lista = contagensDoMes(sel.localId, sel.mes);
  const ultima = lista[lista.length - 1];
  if (!ultima || ultima.status !== 'fechada') return;
  const n = rodadaDe(ultima) + 1;
  const local = locais().find(l => l.id === sel.localId);
  window.abrirModal('Nova contagem no mês', `
    <p>${esc(local ? local.nome : '')} · <strong>${esc(nomeMes(sel.mes))}</strong> · <strong>${esc(nomeRodada(n))}</strong></p>
    <p>Começa uma lista em branco para contar de novo. A ${esc(nomeRodada(rodadaDe(ultima)))} continua guardada no Histórico.</p>
    <p class="dc-sem">Quando esta nova fechar, é ela que passa a valer no Acerto de ${esc(nomeMes(sel.mes))}.</p>
    <div class="barra fim">
      <button class="btn" type="button" id="ctNrVoltar">Voltar</button>
      <button class="btn principal" type="button" id="ctNrOk">Começar a ${esc(nomeRodada(n))}</button>
    </div>`, corpo => {
    corpo.querySelector('#ctNrVoltar').onclick = window.fecharModal;
    corpo.querySelector('#ctNrOk').onclick = async () => {
      corpo.querySelector('#ctNrOk').disabled = true;
      try {
        await gravar('est_contagens', {
          id: idContagem(sel.localId, sel.mes, n), local_id: sel.localId, mes: sel.mes, rodada: n,
          status: 'aberta', responsavel: meuNome(), aberta_por: meuNome(), data_contagem: hojeLocal(),
        });
        sel.rodada = n;
        abertos.clear();
        window.fecharModal();
        aviso(`${nomeRodada(n)} de ${nomeMes(sel.mes)} começada.`);
        desenharContar();
      } catch (e) {
        console.error(e);
        aviso('Não consegui começar a nova contagem (' + (e.message || e) + ').', true);
        corpo.querySelector('#ctNrOk').disabled = false;
      }
    };
  });
}

function desenharContar() {
  const alvo = $('ctCorpo');
  if (!alvo) return;
  if (!pronto()) {
    alvo.innerHTML = `<div class="cartao"><div class="vazio">${window.App && window.App.carregando
      ? 'Baixando a lista de itens para usar sem internet…'
      : 'Abrindo a contagem…'}</div></div>`;
    return;
  }
  if (!locais().length) {
    alvo.innerHTML = `<div class="cartao"><h2>Contar o estoque</h2>
      <div class="vazio">Nenhum almoxarifado cadastrado. Cadastre em <strong>Cadastros › Almoxarifados</strong>.</div></div>`;
    return;
  }
  // o almoxarifado escolhido precisa existir antes de montar a lista (nome, mapa)
  if (!locais().some(l => l.id === sel.localId)) sel.localId = locais()[0].id;
  let itens = itensDoLocal(sel.localId);
  if (!itens.length) {
    alvo.innerHTML = cabecalhoEscolha() + (itensOrdenados().length ? `<div class="cartao">
      <div class="vazio">Nenhum item marcado para ser contado neste estoque. Marque em
      <strong>Cadastros › Itens</strong> (campo "Contado em").</div></div>` : `<div class="cartao">
      <div class="vazio">Nenhum item cadastrado ainda. Cadastre os insumos em
      <strong>Cadastros › Itens</strong> — dá para colar a lista inteira de uma vez.</div></div>`);
    ligarEscolha();
    return;
  }

  const c = atual();
  const base = itensDaContagem(sel.localId, sel.mes, c);
  const tipos = situacaoTipos(sel.localId, sel.mes, sel.rodada);
  if (!tipos.length) {
    alvo.innerHTML = cabecalhoEscolha() + `<div class="cartao">
      <div class="vazio">Nada com saldo neste estoque em ${esc(nomeMes(sel.mes))}${base.reg ? ` (${esc(base.reg.texto)})` : ''}.
      Se tem algum produto na prateleira, acrescente pela busca.</div>
      <div class="barra fim"><button class="btn principal" type="button" id="ctAddItem">+ Adicionar item</button></div></div>`;
    ligarEscolha();
    $('ctAddItem').addEventListener('click', escolherItemNovo);
    return;
  }
  if (!tipos.some(t => t.g === sel.grupo)) sel.grupo = tipos[0].g;
  const tipo = tipos.find(t => t.g === sel.grupo);
  const cg = tipo.cg;
  const fechada = tipo.fechado;
  itens = base.itens.filter(i => grupoDe(i) === sel.grupo);
  const div = divergenciasDe(c, sel.localId, sel.mes, sel.grupo, fechada);
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const p = tipo.p;
  const pct = p.total ? Math.round(100 * p.feitos / p.total) : 0;
  const local = locais().find(l => l.id === sel.localId);
  mapa = mapaDoLocal(sel.localId);
  const dataTipo = (cg && cg.data_contagem) || (fechada && c && c.data_contagem) || '';

  const estado = !tipo.comecado
    ? `<span class="tag neutra">não começada</span>`
    : fechada
      ? `<span class="tag ativo">fechada</span> <small>por ${esc((cg || c).fechada_por || '—')} em ${esc(dataHora((cg || c).fechada_em))}</small>`
      : `<span class="tag alerta">em andamento</span>${(cg || c || {}).responsavel ? ` <small>começada por ${esc((cg || c).responsavel)}</small>` : ''}`;
  const nTiposFechados = tipos.filter(t => t.fechado).length;

  let grupoAtual = null;
  const corpo = itens.map(i => {
    const l = linhas.get(i.id);
    const valor = l ? mostrarNumero(l.quantidade) : '';
    const lotes = c ? lotesDe(c.id, i.id) : [];
    const comMapa = !!mapa && i.grupo === 'Fertilizantes';
    const quads = comMapa && c ? quadrasDe(c.id, i.id) : [];
    let cab = '';
    if (i.grupo !== grupoAtual) {
      grupoAtual = i.grupo;
      cab = `<h3 class="ct-grupo" data-grupo="${esc(i.grupo || 'Outros')}">${esc(i.grupo || 'Outros')}${i.grupo === 'Fertilizantes'
        ? ' <small>sempre em quilos — o peso total, não o número de sacas</small>' : ''}</h3>`;
    }
    const repor = l && precisaRepor(i, l.quantidade);
    return cab + `<div class="ct-item${repor ? ' repor' : ''}" data-nome="${esc(semAcento(i.nome))}" data-item="${esc(i.id)}" data-grupo="${esc(i.grupo || 'Outros')}">
      <div class="ct-linha${valor !== '' ? ' feito' : ''}">
        <label class="ct-nome" for="q-${esc(i.id)}">${esc(i.nome)}<small>${i.localizacao ? `📍 ${esc(i.localizacao)} · ` : ''}${esc(i.unidade || '')}${lotes.length
          ? ` · <b>${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}</b>${vencido(lotes) ? ' · <span class="ct-venc">tem lote vencido</span>' : ''}` : ''}${textoQuadras(quads)}</small>
          <span class="ct-alerta">${repor ? textoAlerta(i, l.quantidade) : ''}</span></label>
        <input class="ct-qtd" id="q-${esc(i.id)}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
          data-item="${esc(i.id)}" value="${esc(valor)}" placeholder="—"${fechada || lotes.length || quads.length ? ' disabled' : ''}
          title="${lotes.length ? 'Soma dos lotes' : quads.length ? 'Soma das quadras (bags × peso do bag)' : ''}" aria-label="Total de ${esc(i.nome)}">
        <button class="ct-mais${abertos.has(i.id) ? ' aberto' : ''}" type="button" data-mais="${esc(i.id)}"
          aria-expanded="${abertos.has(i.id)}" title="${comMapa ? 'Lotes e quadras do barracão' : 'Lotes e vencimentos'}">${abertos.has(i.id) ? '−' : '+'}</button>
      </div>
      <div class="ct-lotes"${abertos.has(i.id) ? '' : ' hidden'}>${desenharLotes(i, lotes, fechada)}${comMapa ? desenharQuadras(i, c, quads, fechada) : ''}</div>
    </div>`;
  }).join('');

  alvo.innerHTML = cabecalhoEscolha() + `
  <div class="cartao">
    <div class="ct-topo">
      <div><h2>${esc(local ? local.nome : '')} · ${esc(nomeMes(sel.mes))}${esc(sufixoRodada(c))} · ${esc(sel.grupo)}</h2>
        <div class="ct-estado">${estado}</div>
        <label class="campo ct-data">Data da contagem
          <input type="date" id="ctData" value="${esc(dataTipo || hojeLocal())}" max="${hojeLocal()}"${fechada ? ' disabled' : ''}></label></div>
      <div class="ct-topo-dir">
        ${div && div.lista.length ? `<button class="btn ct-div-btn" type="button" id="ctVerDiv">⚠ ${div.lista.length} ${div.lista.length === 1 ? 'divergência' : 'divergências'}</button>` : ''}
        <button class="btn" type="button" id="ctImprimirLista">🖨 Imprimir lista</button>
        <div class="ct-conta"><strong>${p.feitos}</strong> de ${p.total} contados</div>
      </div>
    </div>
    <div class="ct-barra"><span style="width:${pct}%"></span></div>
    ${abasTipos(tipos)}
    <p class="dc-sem ct-criterio">${textoCriterio(base)}</p>
    ${chipsGrupos(itens, linhas)}
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar item
        <input type="text" id="ctBusca" placeholder="Digite parte do nome..." value="${esc(busca)}"></label>
      <label class="es-check"><input type="checkbox" id="ctSoFalta"${soFalta ? ' checked' : ''}> só o que falta contar</label>
      ${fechada ? '' : '<button class="btn" type="button" id="ctAddItem">+ Adicionar item</button>'}
    </div>
    <div class="ct-lista${soFalta ? ' so-falta' : ''}" id="ctLista">${corpo}</div>
    <div class="barra entre ct-pe">
      <span class="dc-sem">${fechada
        ? `${esc(sel.grupo)} fechado. ${c && c.status === 'fechada' ? 'Todos os tipos fecharam: a contagem já vale no Acerto.' : `Faltam ${tipos.length - nTiposFechados} tipo(s) para a contagem do mês entrar no Acerto.`}`
        : 'Pode parar e continuar depois: o que foi digitado fica guardado.'}</span>
      <span class="barra">
      ${fechada
        ? (souAdmin() ? `<button class="btn" type="button" id="ctReabrir">Reabrir ${esc(sel.grupo)}</button>` : '')
        : `<button class="btn principal" type="button" id="ctFechar">Fechar ${esc(sel.grupo)}</button>`}
      ${podeExcluir(sel.localId) && tipo.comecado ? `<button class="btn ct-excluir" type="button" id="ctExcluir">Excluir contagem de ${esc(sel.grupo)}</button>` : ''}
      </span>
    </div>
  </div>`;

  ligarEscolha();
  filtrar();
  $('ctBusca').addEventListener('input', e => { busca = e.target.value; filtrar(); });
  ligarChips();
  document.querySelectorAll('.ct-tipos [data-tipo]').forEach(b => b.addEventListener('click', () => {
    sel.grupo = b.dataset.tipo;
    try { localStorage.setItem(CHAVE_GRUPO, sel.grupo); } catch { /* sem localStorage */ }
    grupoFiltro = '';
    desenharContar();
  }));
  $('ctSoFalta').addEventListener('change', e => {
    soFalta = e.target.checked;
    $('ctLista').classList.toggle('so-falta', soFalta);
  });
  $('ctFechar')?.addEventListener('click', confirmarFechar);
  $('ctReabrir')?.addEventListener('click', reabrir);
  $('ctExcluir')?.addEventListener('click', excluirTipo);
  $('ctData')?.addEventListener('change', salvarData);
  $('ctImprimirLista')?.addEventListener('click', escolherImpressao);
  $('ctAddItem')?.addEventListener('click', escolherItemNovo);
  $('ctVerDiv')?.addEventListener('click', () => abrirDivergencias(c, sel.grupo));

  alvo.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => alternarLotes(b.dataset.mais)));
  ligarLotes(alvo);
  ligarQuadras(alvo);

  const campos = [...alvo.querySelectorAll('.ct-qtd')];
  campos.forEach((inp, k) => {
    inp.addEventListener('change', () => salvarCampo(inp));
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // vai para o próximo campo visível
      const prox = campos.slice(k + 1).find(x => !x.disabled && x.closest('.ct-item').offsetParent !== null);
      if (prox) { prox.focus(); prox.select(); } else inp.blur();
    });
  });
}

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/* Chips dos grupos (15/10/2026): cada um com quantos já foram contados.
   Quem conta só os EPIs, por exemplo, escolhe o grupo e vê só ele. */
function chipsGrupos(itens, linhas) {
  const grupos = [];
  for (const i of itens) {
    const g = i.grupo || 'Outros';
    let r = grupos.find(x => x.nome === g);
    if (!r) grupos.push(r = { nome: g, feitos: 0, total: 0 });
    r.total++;
    const l = linhas.get(i.id);
    if (l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '') r.feitos++;
  }
  const nRepor = itens.filter(i => { const l = linhas.get(i.id); return l && precisaRepor(i, l.quantidade); }).length;
  if (!nRepor) return '';
  if (grupoFiltro === '__repor' && !nRepor) grupoFiltro = '';
  if (grupoFiltro && grupoFiltro !== '__repor' && !grupos.some(g => g.nome === grupoFiltro)) grupoFiltro = '';
  const chip = (id, rot, f, t) => `<button type="button" class="ct-chip${t && f === t ? ' completo' : ''}" data-chip="${esc(id)}"
    aria-pressed="${grupoFiltro === id}">${esc(rot)}${t ? ` <small>${f}/${t}</small>` : ''}</button>`;
  const repor = nRepor ? `<button type="button" class="ct-chip ct-chip-repor" data-chip="__repor"
    aria-pressed="${grupoFiltro === '__repor'}">A repor <small>${nRepor}</small></button>` : '';
  return `<div class="ct-chips">${chip('', 'Todos', 0, 0)}${repor}</div>`;
}

/* As abas dos tipos: um botão por grupo, com quantos foram contados e ✓ quando fechado. */
function abasTipos(tipos) {
  return `<div class="ct-chips ct-tipos" role="tablist">${tipos.map(t => `<button type="button" role="tab"
    class="ct-chip${t.fechado ? ' completo' : ''}" data-tipo="${esc(t.g)}" aria-pressed="${t.g === sel.grupo}">${t.fechado ? '✓ ' : ''}${esc(t.g)}
    <small>${t.p.feitos}/${t.p.total}</small></button>`).join('')}</div>`;
}

function ligarChips() {
  document.querySelectorAll('.ct-chips [data-chip]').forEach(b => b.addEventListener('click', () => {
    grupoFiltro = b.dataset.chip;
    document.querySelectorAll('.ct-chips [data-chip]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    filtrar();
  }));
}

/** O aviso embaixo do nome quando a contagem chegou no estoque mínimo. */
const textoAlerta = (item0, qtd) => { const item = comMinimoDo(item0, sel.localId); return `${Number(qtd) < Number(item.estoque_minimo) ? 'Abaixo do mínimo' : 'No mínimo'} (${esc(mostrarNumero(item.estoque_minimo))}) · ${esc(textoPedido(item))}`; };

/** Depois de gravar um total: liga ou desliga o aviso de reposição do item. */
function marcarMinimo(itemId, qtd) {
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  const item = todos('est_itens').find(i => i.id === itemId);
  if (!bloco || !item) return;
  const repor = precisaRepor(item, qtd);
  bloco.classList.toggle('repor', repor);
  const el = bloco.querySelector('.ct-alerta');
  if (el) el.innerHTML = repor ? textoAlerta(item, qtd) : '';
}

function filtrar() {
  const b = semAcento(busca).trim();
  const soRepor = grupoFiltro === '__repor';
  document.querySelectorAll('#ctLista .ct-item').forEach(l => {
    l.hidden = (!!b && !l.dataset.nome.includes(b))
      || (soRepor ? !l.classList.contains('repor') : (!!grupoFiltro && l.dataset.grupo !== grupoFiltro));
  });
  document.querySelectorAll('#ctLista .ct-grupo').forEach(h => {
    h.hidden = soRepor
      ? !document.querySelector(`#ctLista .ct-item.repor[data-grupo="${CSS.escape(h.dataset.grupo)}"]`)
      : !!grupoFiltro && h.dataset.grupo !== grupoFiltro;
  });
}

function ligarEscolha() {
  $('ctLocal')?.addEventListener('change', e => {
    sel.localId = e.target.value; sel.rodada = null;
    try { localStorage.setItem(CHAVE_LOCAL, sel.localId); } catch { /* sem localStorage */ }
    desenharContar();
  });
  $('ctMes')?.addEventListener('change', e => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) { sel.mes = e.target.value; sel.rodada = null; desenharContar(); }
  });
  $('ctNovaRodada')?.addEventListener('click', novaRodada);
  document.querySelectorAll('.ct-rodadas [data-rodada]').forEach(b => b.addEventListener('click', () => {
    sel.rodada = Number(b.dataset.rodada); abertos.clear(); desenharContar();
  }));
}

/* ===================================================================
   Lotes — "+" na frente do item (pedido dele, 15/10/2026): quando o produto
   tem lotes e vencimentos diferentes, cada lote vira uma linha. O total do
   item passa a ser a soma dos lotes e é ele que vai para o Acerto.
   =================================================================== */
const vencido = lotes => lotes.some(l => l.validade && String(l.validade).slice(0, 10) < hojeISO());

function linhaLote(l, fechada) {
  const venc = l.validade && String(l.validade).slice(0, 10) < hojeISO();
  if (fechada) return `<div class="ct-lote fixo">
      <span>${esc(l.lote || 'sem nº')}</span>
      <span class="${venc ? 'ct-venc' : ''}">${l.validade ? 'val. ' + esc(dataBR(l.validade)) : 'sem validade'}${venc ? ' · vencido' : ''}</span>
      <strong>${esc(mostrarNumero(l.quantidade))}</strong></div>`;
  return `<div class="ct-lote${venc ? ' vencido' : ''}" data-lote="${esc(l.id)}">
      <label>Lote <input type="text" class="cl-lote" value="${esc(l.lote || '')}" placeholder="nº do lote" autocomplete="off"></label>
      <label>Validade <input type="date" class="cl-val" value="${esc(l.validade ? String(l.validade).slice(0, 10) : '')}"></label>
      <label>Quantidade <input type="text" class="cl-qtd" inputmode="decimal" value="${esc(mostrarNumero(l.quantidade))}" placeholder="—" autocomplete="off"></label>
      <button type="button" class="cl-tirar" title="Tirar este lote" aria-label="Tirar este lote">×</button>
    </div>`;
}

function desenharLotes(item, lotes, fechada) {
  return `${lotes.map(l => linhaLote(l, fechada)).join('') || (fechada ? '<p class="dc-sem">Sem lotes separados.</p>' : '')}
    ${fechada ? '' : `<div class="ct-lotes-pe">
      <button type="button" class="btn mini" data-novo-lote="${esc(item.id)}">+ Adicionar lote</button>
      <span class="dc-sem">${lotes.length ? 'O total do item é a soma dos lotes.' : 'Use quando o produto tiver lotes ou vencimentos diferentes.'}</span>
    </div>`}`;
}

function alternarLotes(itemId) {
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  if (!bloco) return;
  const abrir = !abertos.has(itemId);
  if (abrir) abertos.add(itemId); else abertos.delete(itemId);
  bloco.querySelector('.ct-lotes').hidden = !abrir;
  const b = bloco.querySelector('[data-mais]');
  b.textContent = abrir ? '−' : '+';
  b.classList.toggle('aberto', abrir);
  b.setAttribute('aria-expanded', String(abrir));
  // sem lote nenhum ainda: já abre o primeiro para preencher
  if (abrir && !bloco.querySelector('.ct-quadras') && !bloco.querySelector('.ct-lote') && bloco.querySelector('[data-novo-lote]')) novoLote(itemId);
}

function ligarLotes(raiz) {
  raiz.querySelectorAll('[data-novo-lote]').forEach(b => b.onclick = () => novoLote(b.dataset.novoLote));
  raiz.querySelectorAll('.ct-lote[data-lote]').forEach(ligarLinhaLote);
}

function ligarLinhaLote(div) {
  div.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => salvarLote(div)));
  div.querySelector('.cl-qtd').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  div.querySelector('.cl-tirar').addEventListener('click', () => tirarLote(div));
}

/** Linha nova de lote. O primeiro lote herda o total já digitado, para nada se perder. */
function novoLote(itemId) {
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  if (!bloco) return;
  const pe = bloco.querySelector('.ct-lotes-pe');
  const primeiro = !bloco.querySelector('.ct-lote');
  const totalAtual = primeiro ? lerNumero(bloco.querySelector('.ct-qtd').value) : null;
  const tmp = document.createElement('div');
  tmp.innerHTML = linhaLote({ id: crypto.randomUUID(), quantidade: Number.isNaN(totalAtual) ? null : totalAtual }, false);
  const div = tmp.firstElementChild;
  pe.before(div);
  ligarLinhaLote(div);
  div.querySelector('.cl-lote').focus();
  if (primeiro && totalAtual !== null && !Number.isNaN(totalAtual)) salvarLote(div);
}

async function salvarLote(div) {
  const itemId = div.closest('.ct-item').dataset.item;
  const qtdInp = div.querySelector('.cl-qtd');
  const digitado = qtdInp.value;
  const n = lerNumero(digitado);
  if (Number.isNaN(n)) {
    div.classList.add('erro');
    aviso('Essa quantidade não deu para entender. Use só algarismos e vírgula, ex.: 1250,5', true);
    return;
  }
  div.classList.remove('erro');
  try {
    const c = await garantirContagem();
    if (grupoFechado(c, sel.grupo)) { aviso('A contagem de ' + sel.grupo + ' já foi fechada.', true); return; }
    const validade = div.querySelector('.cl-val').value || null;
    await gravar('est_contagem_lotes', {
      id: div.dataset.lote, contagem_id: c.id, item_id: itemId,
      lote: div.querySelector('.cl-lote').value.trim() || null,
      validade, quantidade: n, contado_por: meuNome(), ativo: true,
    });
    // só arruma o número se a pessoa não digitou outro enquanto gravava
    if (qtdInp.value === digitado) qtdInp.value = mostrarNumero(n);
    div.classList.toggle('vencido', !!validade && validade < hojeISO());
    await somarLotes(c, itemId);
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar esse lote (' + (e.message || e) + ').', true);
  }
}

async function tirarLote(div) {
  const itemId = div.closest('.ct-item').dataset.item;
  const salvo = todos('est_contagem_lotes').find(l => l.id === div.dataset.lote);
  div.remove();
  if (!salvo) return;
  await gravar('est_contagem_lotes', Object.assign({}, salvo, { ativo: false }));
  const c = atual();
  if (c) await somarLotes(c, itemId);
}

/** Total do item = soma dos lotes ativos. Sem lote nenhum, o total volta a ser digitado. */
async function somarLotes(c, itemId) {
  const lotes = lotesDe(c.id, itemId);
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  const inp = bloco && bloco.querySelector('.ct-qtd');
  if (lotes.length) {
    const comQtd = lotes.filter(l => l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '');
    const total = comQtd.length ? comQtd.reduce((t, l) => t + Number(l.quantidade), 0) : null;
    await gravar('est_contagem_itens', {
      id: idLinha(c.id, itemId), contagem_id: c.id, item_id: itemId, quantidade: total, contado_por: meuNome(),
    });
    if (inp) { inp.value = mostrarNumero(total); inp.disabled = true; inp.title = 'Soma dos lotes'; }
    marcarMinimo(itemId, total);
    if (bloco) bloco.querySelector('.ct-linha').classList.toggle('feito', total !== null);
  } else if (await somarQuadras(c, itemId, true)) { /* o total veio das quadras */ }
  else if (inp) { inp.disabled = false; inp.title = ''; }
  if (bloco) {
    const small = bloco.querySelector('.ct-nome small');
    const item = todos('est_itens').find(i => i.id === itemId);
    small.innerHTML = esc(item && item.unidade || '') + (lotes.length
      ? ` · <b>${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}</b>${vencido(lotes) ? ' · <span class="ct-venc">tem lote vencido</span>' : ''}` : '')
      + (mapa && item && item.grupo === 'Fertilizantes' ? textoQuadras(quadrasDe(c.id, itemId)) : '');
    const msg = bloco.querySelector('.ct-lotes-pe .dc-sem');
    if (msg) msg.textContent = lotes.length ? 'O total do item é a soma dos lotes.' : 'Use quando o produto tiver lotes ou vencimentos diferentes.';
  }
  atualizarConta();
}


/* ===================================================================
   Quadras do barracão (21/10/2026, pedido dele): nos fertilizantes de um
   estoque com mapa, o "+" mostra também em quais quadras o produto está e
   quantos bags tem em cada uma. Sem lotes, o total do item (kg) passa a ser
   bags × peso do bag (1 t). A posição do mês anterior pode ser repetida.
   =================================================================== */
const textoQuadras = quads => quads.length
  ? ' · <span class="ct-onde">' + quads.map(q => esc(q.quadra) + (q.bags !== null && q.bags !== undefined && q.bags !== '' ? ' (' + esc(mostrarNumero(q.bags)) + ')' : '')).join(', ') + '</span>'
  : '';

/** Bags já lançados numa quadra nesta contagem (todos os produtos). */
function ocupacao(contagemId, codigo) {
  return quadrasDe(contagemId).filter(q => q.quadra === codigo)
    .reduce((t, q) => t + (Number(q.bags) || 0), 0);
}

function opcoesQuadra(atual) {
  return mapa.layout.quadras.map(q => `<option value="${esc(q.codigo)}"${q.codigo === atual ? ' selected' : ''}>${esc(q.codigo)}</option>`).join('');
}

function linhaQuadra(q, fechada, contagemId) {
  const quadra = mapa.layout.quadras.find(x => x.codigo === q.quadra);
  const cap = quadra ? capacidadeQuadra(quadra, mapa.layout) : 0;
  const ocup = contagemId ? ocupacao(contagemId, q.quadra) : Number(q.bags) || 0;
  const passou = cap && ocup > cap;
  const peso = (Number(q.bags) || 0) * pesoBag(mapa.layout);
  if (fechada) return `<div class="ct-quad fixo"><span>Quadra <b>${esc(q.quadra)}</b></span>
      <span>${esc(mostrarNumero(q.bags))} bags</span><strong>${esc(mostrarNumero(peso))} kg</strong></div>`;
  return `<div class="ct-quad${passou ? ' cheia' : ''}" data-quad="${esc(q.quadra)}">
      <label>Quadra <select class="cq-q">${opcoesQuadra(q.quadra)}</select></label>
      <label>Bags <input type="text" class="cq-bags" inputmode="decimal" value="${esc(mostrarNumero(q.bags))}" placeholder="—" autocomplete="off"></label>
      <span class="cq-info">${peso ? esc(mostrarNumero(peso)) + ' kg' : ''}<small>${cap ? `quadra com ${esc(mostrarNumero(ocup))} de ${cap} bags${passou ? ' · passou da capacidade' : ''}` : ''}</small></span>
      <button type="button" class="cq-tirar" title="Tirar esta quadra" aria-label="Tirar esta quadra">×</button>
    </div>`;
}

function desenharQuadras(item, c, quads, fechada) {
  const ant = !fechada && !quads.length ? anterior() : null;
  const antQ = ant ? quadrasDe(ant.id, item.id).filter(q => Number(q.bags) > 0) : [];
  const totalBags = quads.reduce((t, q) => t + (Number(q.bags) || 0), 0);
  return `<div class="ct-quadras" data-item-q="${esc(item.id)}">
    <h4>Onde está no barracão <small>${esc(mapa.nome || '')}</small></h4>
    ${quads.map(q => linhaQuadra(q, fechada, c && c.id)).join('') || (fechada ? '<p class="dc-sem">Sem quadra marcada.</p>' : '')}
    ${fechada ? '' : `<div class="ct-quadras-pe">
      <button type="button" class="btn mini" data-nova-quadra="${esc(item.id)}">+ Adicionar quadra</button>
      ${antQ.length ? `<button type="button" class="btn mini" data-repetir="${esc(item.id)}">Repetir ${esc(rotuloAnterior(ant))}: ${esc(antQ.map(q => q.quadra + ' (' + mostrarNumero(q.bags) + ')').join(', '))}</button>` : ''}
      <span class="dc-sem">${quads.length ? `${esc(mostrarNumero(totalBags))} bags = ${esc(mostrarNumero(totalBags * pesoBag(mapa.layout)))} kg${lotesDe(c.id, item.id).length ? ' (o total do item vem dos lotes)' : ''}` : '1 bag = ' + esc(mostrarNumero(pesoBag(mapa.layout))) + ' kg. Marque a quadra e quantos bags tem nela.'}</span>
    </div>`}
  </div>`;
}

function ligarQuadras(raiz) {
  raiz.querySelectorAll('[data-nova-quadra]').forEach(b => b.onclick = () => novaQuadra(b.dataset.novaQuadra));
  raiz.querySelectorAll('[data-repetir]').forEach(b => b.onclick = () => repetirQuadras(b.dataset.repetir));
  raiz.querySelectorAll('.ct-quad[data-quad]').forEach(ligarLinhaQuadra);
}

function ligarLinhaQuadra(div) {
  div.querySelector('.cq-bags').addEventListener('change', () => salvarQuadra(div));
  div.querySelector('.cq-bags').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  div.querySelector('.cq-q').addEventListener('change', () => trocarQuadra(div));
  div.querySelector('.cq-tirar').addEventListener('click', () => tirarQuadra(div));
}

/** Próxima quadra ainda não usada pelo item (para a linha nova já vir escolhida). */
function quadraLivre(itemId) {
  const c = atual();
  const usadas = new Set(c ? quadrasDe(c.id, itemId).map(q => q.quadra) : []);
  const bloco = document.querySelector(`.ct-quadras[data-item-q="${CSS.escape(itemId)}"]`);
  if (bloco) bloco.querySelectorAll('.ct-quad[data-quad]').forEach(d => usadas.add(d.dataset.quad));
  const q = mapa.layout.quadras.find(x => !usadas.has(x.codigo));
  return q ? q.codigo : null;
}

function novaQuadra(itemId) {
  const bloco = document.querySelector(`.ct-quadras[data-item-q="${CSS.escape(itemId)}"]`);
  const cod = quadraLivre(itemId);
  if (!bloco || !cod) { aviso('Este produto já está em todas as quadras do mapa.', true); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = linhaQuadra({ quadra: cod, bags: null }, false, null);
  const div = tmp.firstElementChild;
  bloco.querySelector('.ct-quadras-pe').before(div);
  ligarLinhaQuadra(div);
  div.querySelector('.cq-q').focus();
}

async function salvarQuadra(div) {
  const itemId = div.closest('.ct-quadras').dataset.itemQ;
  const inp = div.querySelector('.cq-bags');
  const n = lerNumero(inp.value);
  if (Number.isNaN(n)) {
    div.classList.add('erro');
    aviso('Esse número de bags não deu para entender. Use só algarismos, ex.: 12', true);
    return;
  }
  div.classList.remove('erro');
  try {
    const c = await garantirContagem();
    if (grupoFechado(c, sel.grupo)) { aviso('A contagem de ' + sel.grupo + ' já foi fechada.', true); return; }
    const codigo = div.querySelector('.cq-q').value;
    const outra = [...div.parentElement.querySelectorAll('.ct-quad[data-quad]')].find(d => d !== div && d.dataset.quad === codigo);
    if (outra) { aviso('Esta quadra já está na lista deste produto. Some os bags na mesma linha.', true); return; }
    await gravar('est_contagem_quadras', {
      id: idQuadraLinha(c.id, itemId, codigo), contagem_id: c.id, item_id: itemId,
      quadra: codigo, bags: n, contado_por: meuNome(), ativo: true,
    });
    div.dataset.quad = codigo;
    await somarQuadras(c, itemId);
    redesenharQuadras(itemId);
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar essa quadra (' + (e.message || e) + ').', true);
  }
}

/** Trocou a quadra no seletor: a linha antiga sai e a nova entra com os mesmos bags. */
async function trocarQuadra(div) {
  const itemId = div.closest('.ct-quadras').dataset.itemQ;
  const antiga = div.dataset.quad;
  const c = atual();
  const salvo = c && todos('est_contagem_quadras').find(q => q.id === idQuadraLinha(c.id, itemId, antiga));
  if (salvo && salvo.ativo !== false) await gravar('est_contagem_quadras', Object.assign({}, salvo, { ativo: false }));
  if (lerNumero(div.querySelector('.cq-bags').value) !== null) await salvarQuadra(div);
  else div.dataset.quad = div.querySelector('.cq-q').value;
}

async function tirarQuadra(div) {
  const itemId = div.closest('.ct-quadras').dataset.itemQ;
  const c = atual();
  const salvo = c && todos('est_contagem_quadras').find(q => q.id === idQuadraLinha(c.id, itemId, div.dataset.quad));
  div.remove();
  if (!salvo) return;
  await gravar('est_contagem_quadras', Object.assign({}, salvo, { ativo: false }));
  await somarQuadras(c, itemId);
  redesenharQuadras(itemId);
}

async function repetirQuadras(itemId) {
  const ant = anterior();
  if (!ant) return;
  try {
    const c = await garantirContagem();
    for (const q of quadrasDe(ant.id, itemId).filter(x => Number(x.bags) > 0)) {
      await gravar('est_contagem_quadras', {
        id: idQuadraLinha(c.id, itemId, q.quadra), contagem_id: c.id, item_id: itemId,
        quadra: q.quadra, bags: q.bags, contado_por: meuNome(), ativo: true,
      });
    }
    await somarQuadras(c, itemId);
    redesenharQuadras(itemId);
    aviso('Posição da contagem anterior copiada. Confira os bags de cada quadra.');
  } catch (e) {
    console.error(e);
    aviso('Não consegui copiar (' + (e.message || e) + ').', true);
  }
}

/** Sem lotes, o total do item (kg) = bags das quadras × peso do bag.
    Devolve true quando o total veio das quadras. */
async function somarQuadras(c, itemId, soSeSemLotes) {
  if (!mapa) return false;
  const item = todos('est_itens').find(i => i.id === itemId);
  if (!item || item.grupo !== 'Fertilizantes') return false;
  if (lotesDe(c.id, itemId).length) return false;
  const quads = quadrasDe(c.id, itemId);
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  const inp = bloco && bloco.querySelector('.ct-qtd');
  if (!quads.length) {
    if (inp && !soSeSemLotes) { inp.disabled = false; inp.title = ''; }
    return false;
  }
  const comBags = quads.filter(q => q.bags !== null && q.bags !== undefined && q.bags !== '');
  const total = comBags.length ? comBags.reduce((t, q) => t + Number(q.bags), 0) * pesoBag(mapa.layout) : null;
  await gravar('est_contagem_itens', {
    id: idLinha(c.id, itemId), contagem_id: c.id, item_id: itemId, quantidade: total, contado_por: meuNome(),
  });
  if (inp) { inp.value = mostrarNumero(total); inp.disabled = true; inp.title = 'Soma das quadras (bags × peso do bag)'; }
  marcarMinimo(itemId, total);
  if (bloco) bloco.querySelector('.ct-linha').classList.toggle('feito', total !== null);
  atualizarConta();
  return true;
}

/** Redesenha só o quadro de quadras (e o resumo no nome) de um item. */
function redesenharQuadras(itemId) {
  const c = atual();
  const item = todos('est_itens').find(i => i.id === itemId);
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  if (!c || !item || !bloco || !mapa) return;
  const quads = quadrasDe(c.id, itemId);
  const caixa = bloco.querySelector('.ct-quadras');
  if (caixa) {
    const tmp = document.createElement('div');
    tmp.innerHTML = desenharQuadras(item, c, quads, grupoFechado(c, sel.grupo));
    caixa.replaceWith(tmp.firstElementChild);
    ligarQuadras(bloco);
  }
  const lotes = lotesDe(c.id, itemId);
  const small = bloco.querySelector('.ct-nome small');
  if (small) small.innerHTML = esc(item.unidade || '') + (lotes.length
    ? ` · <b>${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}</b>${vencido(lotes) ? ' · <span class="ct-venc">tem lote vencido</span>' : ''}` : '')
    + textoQuadras(quads);
}

/** A contagem do mês nasce no primeiro número digitado. */
async function garantirContagem() {
  let c = atual();
  if (!c) c = await gravar('est_contagens', {
    id: idContagem(sel.localId, sel.mes, sel.rodada || 1),
    local_id: sel.localId, mes: sel.mes, rodada: Number(sel.rodada) || 1, status: 'aberta',
    responsavel: meuNome(), aberta_por: meuNome(),
    data_contagem: dataEscolhida(),
  });
  // o tipo que está na tela também ganha o seu registro (data, quem começou)
  if (sel.grupo && !grupoFechado(c, sel.grupo)) await garantirGrupo(c, sel.grupo);
  return c;
}

/** A data que está no campo (ou hoje, se o campo estiver vazio ou estranho). */
function dataEscolhida() {
  const v = ($('ctData') || {}).value || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hojeLocal();
}

async function salvarData() {
  const inp = $('ctData');
  if (!inp) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) { aviso('Escolha a data do dia da contagem.', true); return; }
  if (inp.value > hojeLocal()) { aviso('A data da contagem não pode ser depois de hoje.', true); inp.value = hojeLocal(); return; }
  try {
    const c = await garantirContagem();
    if (grupoFechado(c, sel.grupo)) { aviso('A contagem de ' + sel.grupo + ' já foi fechada.', true); return; }
    const cg = await garantirGrupo(c, sel.grupo);
    if (cg.data_contagem !== inp.value) await gravar('est_contagem_grupos', Object.assign({}, cg, { data_contagem: inp.value }));
    aviso(`Data da contagem de ${sel.grupo}: ${dataBR(inp.value)}.`);
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar a data (' + (e.message || e) + ').', true);
  }
}

async function salvarCampo(inp) {
  const digitado = inp.value;
  const n = lerNumero(digitado);
  const linha = inp.closest('.ct-linha');
  if (Number.isNaN(n)) {
    linha.classList.add('erro');
    aviso('Esse número não deu para entender. Use só algarismos e vírgula, ex.: 1250,5', true);
    return;
  }
  linha.classList.remove('erro');
  try {
    const c = await garantirContagem();
    if (grupoFechado(c, sel.grupo)) { aviso('A contagem de ' + sel.grupo + ' já foi fechada.', true); return; }
    await gravar('est_contagem_itens', {
      id: idLinha(c.id, inp.dataset.item), contagem_id: c.id, item_id: inp.dataset.item,
      quantidade: n, contado_por: meuNome(),
    });
    if (inp.value === digitado) inp.value = mostrarNumero(n);
    linha.classList.toggle('feito', n !== null);
    marcarMinimo(inp.dataset.item, n);
    atualizarConta();
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar esse número (' + (e.message || e) + ').', true);
  }
}

function atualizarConta() {
  const c = atual();
  if (!c) return;
  const chips = document.querySelector('.ct-chips:not(.ct-tipos)');
  const lugar = chips || document.querySelector('.ct-barra');
  if (lugar) {
    const linhas = new Map(linhasDe(c.id).map(l => [l.item_id, l]));
    const novo = document.createElement('div');
    novo.innerHTML = chipsGrupos(itensDaContagem(sel.localId, sel.mes, atual()).itens.filter(i => grupoDe(i) === sel.grupo), linhas);
    const n = novo.firstElementChild;
    const rolagem = chips ? chips.scrollLeft : 0;
    if (chips) chips.remove();
    if (n) { (document.querySelector('.ct-tipos') || document.querySelector('.ct-barra')).after(n); n.scrollLeft = rolagem; ligarChips(); }
    const aba = document.querySelector(`.ct-tipos [data-tipo="${CSS.escape(sel.grupo)}"] small`);
    if (aba) { const pg = progressoGrupo(c, itensDaContagem(sel.localId, sel.mes, c).itens, sel.grupo); aba.textContent = pg.feitos + '/' + pg.total; }
  }
  const p = progressoGrupo(c, itensDaContagem(sel.localId, sel.mes, c).itens, sel.grupo);
  const el = document.querySelector('.ct-conta');
  if (el) el.innerHTML = `<strong>${p.feitos}</strong> de ${p.total} contados`;
  const barra = document.querySelector('.ct-barra span');
  if (barra) barra.style.width = (p.total ? Math.round(100 * p.feitos / p.total) : 0) + '%';
  const est = document.querySelector('.ct-estado');
  if (est && est.textContent.includes('não começada'))
    est.innerHTML = `<span class="tag alerta">em andamento</span> <small>começada por ${esc(c.responsavel || '')}</small>`;
}

function confirmarFechar() {
  // o que estiver no campo e ainda não saiu dele também vale
  if (document.activeElement && document.activeElement.classList.contains('ct-qtd')) document.activeElement.blur();
  const c = atual();
  const itens = itensDaContagem(sel.localId, sel.mes, c).itens.filter(i => grupoDe(i) === sel.grupo);
  const div = divergenciasDe(c, sel.localId, sel.mes, sel.grupo, true);
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const branco = itens.filter(i => {
    const l = linhas.get(i.id);
    return !l || l.quantidade === null || l.quantidade === undefined || l.quantidade === '';
  });
  const local = locais().find(l => l.id === sel.localId);
  const faltam = gruposDaContagem(sel.localId, sel.mes, c).filter(g => g !== sel.grupo && !grupoFechado(c, g));
  window.abrirModal('Fechar ' + sel.grupo, `
    <p>${esc(local ? local.nome : '')} · <strong>${esc(nomeMes(sel.mes))}${esc(sufixoRodada(atual()))}</strong> · <strong>${esc(sel.grupo)}</strong> · contada em <strong>${esc(dataBR(dataEscolhida()))}</strong></p>
    ${branco.length
      ? `<p><strong>${branco.length}</strong> ${branco.length === 1 ? 'item ficou' : 'itens ficaram'} em branco e
         ${branco.length === 1 ? 'vai entrar' : 'vão entrar'} como <strong>zero</strong> (não tem na prateleira):</p>
         <ul class="ct-branco">${branco.slice(0, 12).map(i => `<li>${esc(i.nome)}</li>`).join('')}${branco.length > 12
           ? `<li>… e mais ${branco.length - 12}</li>` : ''}</ul>`
      : '<p>Todos os itens foram contados.</p>'}
    ${blocoDivergencias(div, true)}
    <p class="dc-sem">Depois de fechado, ${esc(sel.grupo)} não pode mais ser alterado${souAdmin()
      ? ' (o administrador pode reabrir)' : ''}. ${faltam.length
      ? `A contagem do mês entra no Acerto quando os outros tipos fecharem (faltam: ${esc(faltam.join(', '))}).`
      : 'É o último tipo: com ele fechado, a contagem do mês entra no Acerto.'}</p>
    <div class="barra fim">
      <button class="btn" type="button" id="ctVoltar">Voltar e contar</button>
      <button class="btn principal" type="button" id="ctConfirmar">Fechar ${esc(sel.grupo)}</button>
    </div>`, corpo => {
    corpo.querySelector('#ctVoltar').onclick = window.fecharModal;
    corpo.querySelector('#ctConfirmar').onclick = async () => {
      corpo.querySelector('#ctConfirmar').disabled = true;
      try {
        const ct = await garantirContagem();
        for (const i of branco) {
          await gravar('est_contagem_itens', {
            id: idLinha(ct.id, i.id), contagem_id: ct.id, item_id: i.id, quantidade: 0, contado_por: meuNome(),
          });
        }
        const cg = await garantirGrupo(ct, sel.grupo);
        await gravar('est_contagem_grupos', Object.assign({}, cg, {
          status: 'fechada', fechada_por: meuNome(), fechada_em: new Date().toISOString(),
          data_contagem: cg.data_contagem || dataEscolhida(),
        }));
        const mesFechou = await conferirFechamentoMes(atual() || ct);
        window.fecharModal();
        aviso(mesFechou ? `${sel.grupo} fechado. Todos os tipos fecharam: a contagem já entra no Acerto.` : `${sel.grupo} fechado.`);
        desenharContar();
        // divergências do que acabou de fechar: aparecem na hora, para saber onde ajustar
        const depois = divergenciasDe(atual(), sel.localId, sel.mes, sel.grupo, true);
        if (depois && depois.lista.length) setTimeout(() => abrirDivergencias(atual(), sel.grupo), 300);
      } catch (e) {
        console.error(e);
        aviso('Não consegui fechar (' + (e.message || e) + ').', true);
        corpo.querySelector('#ctConfirmar').disabled = false;
      }
    };
  });
}

/* Excluir a contagem de um tipo (pedido dele, 23/10/2026): só administrador.
   Apaga os números, lotes e quadras dos itens desse tipo nesta contagem e
   volta o tipo para "não começado". Se a contagem do mês estava fechada, ela
   reabre (sai do Acerto até fechar de novo). Os outros tipos não mudam. */
function excluirTipo() {
  const c = atual();
  if (!c || !podeExcluir(sel.localId)) return;
  const g = sel.grupo;
  const ids = new Set(itensDoLocal(sel.localId).filter(i => grupoDe(i) === g).map(i => i.id));
  const linhas = linhasDe(c.id).filter(l => ids.has(l.item_id) && temQtd(l));
  const local = locais().find(l => l.id === sel.localId);
  window.abrirModal('Excluir contagem de ' + g, `
    <p>${esc(local ? local.nome : '')} · <strong>${esc(nomeMes(sel.mes))}${esc(sufixoRodada(c))}</strong> · <strong>${esc(g)}</strong></p>
    <p>Vai apagar <strong>${linhas.length}</strong> ${linhas.length === 1 ? 'quantidade contada' : 'quantidades contadas'} de ${esc(g)}, com lotes e quadras, e ${esc(g)} volta a ficar <strong>não começado</strong>. Os outros tipos continuam como estão.</p>
    ${c.status === 'fechada' ? '<p class="dc-sem">A contagem do mês estava fechada: ela reabre e sai do Acerto até fechar de novo.</p>' : ''}
    <p class="dc-sem">Não dá para desfazer.</p>
    <div class="barra fim">
      <button class="btn" type="button" id="exVoltar">Voltar</button>
      <button class="btn principal ct-excluir" type="button" id="exOk">Excluir</button>
    </div>`, corpo => {
    corpo.querySelector('#exVoltar').onclick = window.fecharModal;
    corpo.querySelector('#exOk').onclick = async ev => {
      ev.target.disabled = true;
      try {
        for (const l of linhas) await gravar('est_contagem_itens', Object.assign({}, l, { quantidade: null, contado_por: meuNome() }));
        for (const l of todos('est_contagem_lotes').filter(x => x.contagem_id === c.id && ids.has(x.item_id) && x.ativo !== false))
          await gravar('est_contagem_lotes', Object.assign({}, l, { ativo: false }));
        for (const q of todos('est_contagem_quadras').filter(x => x.contagem_id === c.id && ids.has(x.item_id) && x.ativo !== false))
          await gravar('est_contagem_quadras', Object.assign({}, q, { ativo: false }));
        // contagem fechada de antes dos tipos: os outros tipos continuam fechados
        if (c.status === 'fechada') {
          for (const o of gruposDaContagem(sel.localId, sel.mes, c)) {
            if (o !== g && !cgDe(c, o)) await gravar('est_contagem_grupos', { id: idGrupoC(c.id, o), contagem_id: c.id, grupo: o, status: 'fechada',
              data_contagem: c.data_contagem || null, fechada_por: c.fechada_por || null, fechada_em: c.fechada_em || null, ativo: true });
          }
        }
        const cg = todos('est_contagem_grupos').filter(x => x.id === idGrupoC(c.id, g)).pop();
        await gravar('est_contagem_grupos', Object.assign({ id: idGrupoC(c.id, g), contagem_id: c.id, grupo: g }, cg || {},
          { status: 'aberta', fechada_por: null, fechada_em: null, responsavel: null, data_contagem: null, ativo: false }));
        if (c.status === 'fechada') await gravar('est_contagens', Object.assign({}, c, { status: 'aberta', fechada_por: null, fechada_em: null }));
        abertos.clear();
        window.fecharModal();
        aviso(`Contagem de ${g} excluída.`);
        desenharContar();
      } catch (e) {
        console.error(e);
        aviso('Não consegui excluir (' + (e.message || e) + ').', true);
        ev.target.disabled = false;
      }
    };
  });
}

async function reabrir() {
  const c = atual();
  if (!c || !souAdmin()) return;
  if (!confirm(`Reabrir ${sel.grupo} de ${nomeMes(sel.mes)}?${c.status === 'fechada' ? ' A contagem do mês sai do Acerto até fechar de novo.' : ''}`)) return;
  // contagem fechada de antes dos tipos: os outros tipos continuam fechados
  for (const g of gruposDaContagem(sel.localId, sel.mes, c)) {
    if (g !== sel.grupo && !cgDe(c, g) && c.status === 'fechada') {
      await gravar('est_contagem_grupos', { id: idGrupoC(c.id, g), contagem_id: c.id, grupo: g, status: 'fechada',
        data_contagem: c.data_contagem || null, fechada_por: c.fechada_por || null, fechada_em: c.fechada_em || null, ativo: true });
    }
  }
  const cg = cgDe(c, sel.grupo) || { id: idGrupoC(c.id, sel.grupo), contagem_id: c.id, grupo: sel.grupo, data_contagem: c.data_contagem || null, ativo: true };
  await gravar('est_contagem_grupos', Object.assign({}, cg, { status: 'aberta', fechada_por: null, fechada_em: null }));
  if (c.status === 'fechada') await gravar('est_contagens', Object.assign({}, c, { status: 'aberta', fechada_por: null, fechada_em: null }));
  aviso(`${sel.grupo} reaberto.`);
  desenharContar();
}

/* ===================================================================
   Critério da lista e "+ Adicionar item" (pedido dele, 23/10/2026)
   =================================================================== */
function textoCriterio(base) {
  const fora = base.total - base.itens.length;
  if (base.criterio === 'todos') return `Todos os ${base.total} itens deste estoque (ainda não há saldo registrado nem contagem anterior).`;
  const de = base.criterio === 'registro' ? 'com saldo em ' + base.reg.texto : 'que tinham quantidade na última contagem fechada de cada tipo (tipo sem contagem anterior: todos os itens dele)';
  return `Mostrando ${base.itens.length} de ${base.total} itens: só os ${de}, mais os acrescentados.${fora ? ' Achou na prateleira algo que não está aqui? Use <strong>+ Adicionar item</strong>.' : ''}`;
}

function escolherItemNovo() {
  const c = atual();
  const naLista = new Set(itensDaContagem(sel.localId, sel.mes, c).itens.map(i => i.id));
  const fora = itensDoLocal(sel.localId).filter(i => !naLista.has(i.id));
  window.abrirModal('Adicionar item à contagem', `
    <p class="dc-sem">Procure o produto que está na prateleira e não apareceu na lista.</p>
    <label class="campo">Produto <input type="text" id="aiBusca" placeholder="Digite parte do nome..." autocomplete="off"></label>
    <div class="lista ai-lista" id="aiLista"></div>
    <div id="aiNovo"></div>`, corpo => {
    const busca = corpo.querySelector('#aiBusca');
    const desenhar = () => {
      const b = semAcento(busca.value).trim();
      const achados = fora.filter(i => !b || semAcento(i.nome).includes(b)).slice(0, 40);
      corpo.querySelector('#aiLista').innerHTML = achados.map(i => `<button type="button" class="item ai-item" data-add="${esc(i.id)}">
        <span></span><div><div class="nome">${esc(i.nome)}</div><div class="sub">${esc(i.grupo || 'Outros')} · ${esc(i.unidade || '')}${i.localizacao ? ' · 📍 ' + esc(i.localizacao) : ''}</div></div></button>`).join('')
        || `<div class="vazio">${b ? 'Nenhum item do cadastro com esse nome fora da lista.' : 'Todos os itens do cadastro já estão na lista.'}</div>`;
      corpo.querySelectorAll('[data-add]').forEach(x => x.addEventListener('click', () => adicionarItem(fora.find(i => i.id === x.dataset.add))));
      const nome = busca.value.replace(/\s+/g, ' ').trim();
      const existe = itensDoLocal(sel.localId).some(i => semAcento(i.nome) === semAcento(nome));
      corpo.querySelector('#aiNovo').innerHTML = nome.length >= 3 && !existe ? `<div class="cartao ai-novo">
        <p>Não achou? Cadastrar <strong>${esc(nome)}</strong> como item novo deste estoque:</p>
        <div class="grade">
          <label class="campo">Unidade <select id="aiUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
          <label class="campo">Grupo <select id="aiGrupo">${GRUPOS_TELA().map(g => `<option${g === sel.grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        </div>
        <div class="barra fim"><button class="btn principal" type="button" id="aiCadastrar">Cadastrar e adicionar</button></div></div>` : '';
      corpo.querySelector('#aiCadastrar')?.addEventListener('click', async ev => {
        ev.target.disabled = true;
        try {
          const item = await gravarDireto('est_itens', { nome, unidade: corpo.querySelector('#aiUni').value,
            grupo: corpo.querySelector('#aiGrupo').value, locais_contagem: [sel.localId], ativo: true });
          await adicionarItem(item);
        } catch (e) { console.error(e); aviso('Não consegui cadastrar (' + (e.message || e) + ').', true); ev.target.disabled = false; }
      });
    };
    busca.addEventListener('input', desenhar);
    desenhar();
    setTimeout(() => busca.focus(), 50);
  });
}
const GRUPOS_TELA = () => { const g = [...new Set(itensDoLocal(sel.localId).map(grupoDe))]; return g.length ? g : ['Defensivos']; };

async function adicionarItem(item) {
  if (!item) return;
  const g = grupoDe(item);
  const c0 = atual();
  if (c0 && grupoFechado(c0, g)) { aviso(`${g} já foi fechado nesta contagem. Para incluir ${item.nome}, reabra ${g}.`, true); return; }
  try {
    sel.grupo = g;
    try { localStorage.setItem(CHAVE_GRUPO, g); } catch { /* sem localStorage */ }
    const c = await garantirContagem();
    const ja = linhasDe(c.id).find(l => l.item_id === item.id);
    if (!ja) await gravar('est_contagem_itens', { id: idLinha(c.id, item.id), contagem_id: c.id, item_id: item.id,
      quantidade: null, contado_por: meuNome() });
    window.fecharModal();
    grupoFiltro = ''; busca = ''; soFalta = false;
    desenharContar();
    const inp = document.getElementById('q-' + item.id);
    if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
    aviso(`${item.nome} entrou na lista. Digite a quantidade.`);
  } catch (e) {
    console.error(e);
    aviso('Não consegui adicionar (' + (e.message || e) + ').', true);
  }
}

/* ===================================================================
   Divergências (pedido dele, 23/10/2026): contado × registrado no app,
   como no acerto dos defensivos e fertilizantes. Aparecem ao fechar um tipo,
   num botão no alto da contagem e no Histórico. Na Quebra Cocão (entradas e
   saídas no app) o administrador pode lançar os ajustes de balanço dali.
   =================================================================== */
/** grupo null = a contagem inteira. brancoZero: item sem número conta como zero (ao fechar). */
function divergenciasDe(c, localId, mes, grupo, brancoZero) {
  if (!localId) return null;
  const { itens } = itensDaContagem(localId, mes, c);
  const regs = new Map();
  const regDo = g => {
    if (!regs.has(g)) { const cg = c ? cgDe(c, g) : null; regs.set(g, saldoRegistrado(localId, mes, (cg && cg.data_contagem) || dataRef(c))); }
    return regs.get(g);
  };
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const lista = [];
  let reg = null;
  for (const i of itens) {
    const g = grupoDe(i);
    if (grupo && g !== grupo) continue;
    const r = regDo(g);
    if (!r) continue;
    reg = reg || r;
    const l = linhas.get(i.id);
    const cont = temQtd(l) ? Number(l.quantidade) : (brancoZero ? 0 : null);
    if (cont === null) continue;
    const registrado = r.saldos.get(i.id) || 0;
    const dif = Math.round((cont - registrado) * 1000) / 1000;
    if (dif) lista.push({ item: i, registrado, contado: cont, dif, ate: r.ate });
  }
  if (!reg) reg = grupo ? regDo(grupo) : saldoRegistrado(localId, mes, dataRef(c));
  return reg ? { reg, lista } : null;
}
const numDif = d => `<span class="${d.dif > 0 ? 'es-num-sobra' : 'es-num-falta'}">${d.dif > 0 ? '+' : '−'}${esc(mostrarNumero(Math.abs(d.dif)))} ${d.dif > 0 ? 'sobra' : 'falta'}</span>`;
function tabelaDiv(lista) {
  return `<div class="es-larga"><table class="tabela ct-div-tab"><thead><tr><th>Item</th><th class="ce">Registrado</th><th class="ce">Contado</th><th class="ce">Diferença</th></tr></thead>
    <tbody>${lista.map(d => `<tr><td>${esc(d.item.nome)} <small>${esc(d.item.unidade || '')}</small></td><td class="ce">${esc(mostrarNumero(d.registrado))}</td>
      <td class="ce">${esc(mostrarNumero(d.contado))}</td><td class="ce">${numDif(d)}</td></tr>`).join('')}</tbody></table></div>`;
}
function blocoDivergencias(div, aoFechar) {
  if (!div) return `<p class="dc-sem">Este estoque não tem saldo registrado no app para comparar (nem entradas e saídas, nem saldo do sistema do mês).</p>`;
  if (!div.lista.length) return `<p class="ct-div-ok">✓ Sem divergência: o contado bate com o registrado (${esc(div.reg.texto)}).</p>`;
  return `<div class="ct-div">
    <p><strong>⚠ ${div.lista.length} ${div.lista.length === 1 ? 'divergência' : 'divergências'}</strong> com o registrado (${esc(div.reg.texto)})${aoFechar ? ' — confira antes de fechar; item em branco entra como zero' : ''}:</p>
    ${tabelaDiv(div.lista)}
    <p class="dc-sem">${div.reg.fonte === 'movimentos'
      ? 'Onde tem diferença, o estoque precisa de ajuste de balanço (entrada se sobrou, saída se faltou).'
      : 'O ajuste é feito no sistema agro; depois, lance o saldo novo em Acerto › Saldo do sistema.'}</p></div>`;
}

function abrirDivergencias(c, grupo, folhaId = 'ctListaFolha') {
  if (!c) return;
  const div = divergenciasDe(c, c.local_id, c.mes, grupo, c.status === 'fechada' || (grupo && grupoFechado(c, grupo)));
  const local = todosLocais().find(l => l.id === c.local_id) || {};
  const titulo = `${local.nome || ''} · ${nomeMes(c.mes)}${sufixoRodada(c)}${grupo ? ' · ' + grupo : ''}`;
  const podeAjustar = div && div.lista.length && div.reg.fonte === 'movimentos' && souAdmin()
    && (grupo ? grupoFechado(c, grupo) : c.status === 'fechada');
  window.abrirModal('Divergências da contagem', `
    <p><strong>${esc(titulo)}</strong></p>
    ${blocoDivergencias(div, false)}
    <div class="barra fim">
      ${div && div.lista.length ? '<button class="btn" type="button" id="dvImprimir">🖨 Imprimir</button>' : ''}
      ${podeAjustar ? `<button class="btn principal" type="button" id="dvAjustar">Lançar ${div.lista.length} ${div.lista.length === 1 ? 'ajuste' : 'ajustes'} de balanço</button>` : ''}
      <button class="btn" type="button" id="dvFechar">Fechar</button>
    </div>`, corpo => {
    corpo.querySelector('#dvFechar').onclick = window.fecharModal;
    corpo.querySelector('#dvImprimir')?.addEventListener('click', () => {
      montarFolhaDiv(folhaId, titulo, div);
      window.fecharModal();
      setTimeout(() => window.print(), 80);
    });
    corpo.querySelector('#dvAjustar')?.addEventListener('click', async ev => {
      if (!confirm(`Lançar ${div.lista.length} ajuste(s) de balanço em ${local.nome} com data ${dataBR(div.lista[0].ate)}? O saldo do app passa a bater com a contagem.`)) return;
      ev.target.disabled = true;
      try {
        const lancamento = crypto.randomUUID();
        for (const d of div.lista) {
          await gravar('est_movimentos', { id: crypto.randomUUID(), local_id: c.local_id, data: d.ate,
            sentido: d.dif > 0 ? 'entrada' : 'saida', tipo: 'ajuste', item_id: d.item.id, quantidade: Math.abs(d.dif),
            documento: 'Contagem ' + nomeMes(c.mes), operador: meuNome(), criado_por: meuNome(), ativo: true, lancamento_id: lancamento,
            obs: `Ajuste da contagem de ${nomeMes(c.mes)}${sufixoRodada(c)} (${grupoDe(d.item)}): contado ${mostrarNumero(d.contado)}, registrado ${mostrarNumero(d.registrado)}` });
        }
        window.fecharModal();
        aviso(`${div.lista.length} ajuste(s) de balanço lançados no Estoque ${local.nome}.`);
        if (telaAberta === 'ctNova') desenharContar();
      } catch (e) {
        console.error(e);
        aviso('Não consegui lançar os ajustes (' + (e.message || e) + ').', true);
        ev.target.disabled = false;
      }
    });
  });
}

/** Folha A4 das divergências, padrão SAKUMA, sem linha de assinatura. */
function montarFolhaDiv(folhaId, titulo, div) {
  const alvo = $(folhaId);
  if (!alvo || !div) return;
  const sobra = div.lista.filter(d => d.dif > 0).length;
  alvo.innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Divergências da Contagem de Estoque</h1>
        <p>${esc(titulo)} · registrado: ${esc(div.reg.texto)}</p>
      </div>
    </div>
    <p style="font-size:9pt;color:#51534A;margin:4mm 0 3mm">${div.lista.length} ${div.lista.length === 1 ? 'item' : 'itens'} com diferença: ${sobra} com sobra (precisa de entrada de ajuste) e ${div.lista.length - sobra} com falta (precisa de saída de ajuste).</p>
    <table class="rel-tab"><thead><tr><th>Grupo</th><th>Item</th><th class="ce">Un.</th><th class="ce">Registrado</th><th class="ce">Contado</th><th class="ce">Diferença</th></tr></thead>
    <tbody>${div.lista.map(d => `<tr><td>${esc(grupoDe(d.item))}</td><td>${esc(d.item.nome)}</td><td class="ce">${esc(d.item.unidade || '')}</td>
      <td class="ce">${esc(mostrarNumero(d.registrado))}</td><td class="ce">${esc(mostrarNumero(d.contado))}</td>
      <td class="ce">${d.dif > 0 ? '+' : '−'}${esc(mostrarNumero(Math.abs(d.dif)))}</td></tr>`).join('')}</tbody></table>
    <div class="rel-pe"><span></span><img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ===================================================================
   Tela Em andamento — o mês inteiro, almoxarifado por almoxarifado
   =================================================================== */
let mesAndamento = mesAtual();

function desenharAndamento() {
  const alvo = $('ctAndCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ls = locais();
  const linhas = ls.map(l => {
    const c = contagem(l.id, mesAndamento);
    const sit = situacaoTipos(l.id, mesAndamento);
    const p = sit.reduce((t, x) => ({ feitos: t.feitos + x.p.feitos, total: t.total + x.p.total }), { feitos: 0, total: 0 });
    const rot = c && rodadaDe(c) > 1 ? ` <span class="tag neutra">${esc(nomeRodada(rodadaDe(c)))}</span>` : '';
    const situ = (!c ? '<span class="tag neutra">não começada</span>'
      : c.status === 'fechada' ? '<span class="tag ativo">fechada</span>'
        : '<span class="tag alerta">em andamento</span>') + rot;
    // um selo por tipo: ✓ fechado (com a data), em andamento ou não começado
    const tiposTxt = sit.map(t => `<button type="button" class="ct-tipo-selo ${t.fechado ? 'ok' : t.comecado ? 'and' : ''}"
      data-contar="${esc(l.id)}" data-tipo="${esc(t.g)}" title="${t.fechado ? 'fechado' : t.comecado ? 'em andamento' : 'não começado'}">${t.fechado ? '✓ ' : ''}${esc(t.g)} <small>${t.p.feitos}/${t.p.total}${t.cg && t.cg.data_contagem ? ' · ' + esc(dataBR(t.cg.data_contagem).slice(0, 5)) : ''}</small></button>`).join('');
    const quem = !c ? '' : c.status === 'fechada'
      ? `${textoData(c) ? esc(textoData(c)) + ' · ' : ''}fechada por ${esc(c.fechada_por || '—')} em ${esc(dataHora(c.fechada_em))}`
      : `${textoData(c) ? esc(textoData(c)) + ' · ' : ''}começada por ${esc(c.responsavel || '—')}`;
    return `<div class="item">
      <span></span>
      <div><div class="nome">${esc(l.nome)} ${situ}</div>
        <div class="sub">${p.feitos} de ${p.total} itens${quem ? ' · ' + quem : ''}</div>
        <div class="ct-tipos-and">${tiposTxt}</div></div>
      <div class="acoes"><button class="btn mini${c && c.status === 'fechada' ? '' : ' principal'}" type="button"
        data-contar="${esc(l.id)}">${c && c.status === 'fechada' ? 'Ver' : 'Contar'}</button></div>
    </div>`;
  }).join('');
  const fechadas = ls.filter(l => (contagem(l.id, mesAndamento) || {}).status === 'fechada').length;
  alvo.innerHTML = `
    <div class="barra">
      <label class="campo">Mês <input type="month" id="ctAndMes" value="${esc(mesAndamento)}" max="${mesAtual()}"></label>
      <span class="dc-sem">${fechadas} de ${ls.length} almoxarifados fechados em ${esc(nomeMes(mesAndamento))}</span>
    </div>
    <div class="lista">${linhas || '<div class="vazio">Nenhum almoxarifado cadastrado.</div>'}</div>`;
  $('ctAndMes').addEventListener('change', e => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesAndamento = e.target.value; desenharAndamento(); }
  });
  alvo.querySelectorAll('[data-contar]').forEach(b => b.addEventListener('click', () => {
    sel.localId = b.dataset.contar; sel.mes = mesAndamento; sel.rodada = null;
    if (b.dataset.tipo) sel.grupo = b.dataset.tipo;
    window.abrirTelaEstoque('ctNova');
  }));
}

/* ===================================================================
   Tela Histórico — contagens fechadas, com folha para imprimir
   =================================================================== */
function desenharHistorico() {
  const alvo = $('ctHistCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const nomeLocal = id => (todos('est_locais').find(l => l.id === id) || {}).nome || '—';
  const fechadas = todos('est_contagens').filter(c => c.status === 'fechada' && podeLocal(c.local_id))
    .sort((a, b) => b.mes.localeCompare(a.mes) || nomeLocal(a.local_id).localeCompare(nomeLocal(b.local_id), 'pt-BR') || rodadaDe(b) - rodadaDe(a));
  if (!fechadas.length) {
    alvo.innerHTML = '<div class="vazio">Nenhuma contagem fechada ainda.</div>';
    $('ctFolha').innerHTML = '';
    return;
  }
  let mes = null;
  alvo.innerHTML = fechadas.map(c => {
    const cab = c.mes !== mes ? `<h3 class="es-secao">${esc(nomeMes(mes = c.mes))}</h3>` : '';
    const n = linhasDe(c.id).length;
    return cab + `<div class="item"><span></span>
      <div><div class="nome">${esc(nomeLocal(c.local_id))}${esc(sufixoRodada(c))}</div>
        <div class="sub">${n} itens · ${textoData(c) ? esc(textoData(c)) + ' · ' : ''}fechada por ${esc(c.fechada_por || '—')} em ${esc(dataHora(c.fechada_em))}</div>
        ${(() => { const gs = todos('est_contagem_grupos').filter(x => x.contagem_id === c.id && x.status === 'fechada');
          return gs.length ? `<div class="sub">${gs.map(x => `${esc(x.grupo)}${x.data_contagem ? ' ' + esc(dataBR(x.data_contagem)) : ''}${x.fechada_por ? ' (' + esc(x.fechada_por) + ')' : ''}`).join(' · ')}</div>` : ''; })()}</div>
      <div class="acoes">
        <button class="btn mini" type="button" data-ver="${esc(c.id)}">Ver</button>
        <button class="btn mini" type="button" data-imprimir="${esc(c.id)}">Imprimir</button>
        <button class="btn mini" type="button" data-div="${esc(c.id)}">Divergências</button>
      </div></div>`;
  }).join('');
  alvo.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
    const c = todos('est_contagens').find(x => x.id === b.dataset.ver);
    if (!c) return;
    sel.localId = c.local_id; sel.mes = c.mes; sel.rodada = rodadaDe(c);
    window.abrirTelaEstoque('ctNova');
  }));
  alvo.querySelectorAll('[data-div]').forEach(b => b.addEventListener('click', () => {
    const c = todos('est_contagens').find(x => x.id === b.dataset.div);
    if (c) abrirDivergencias(c, null, 'ctFolha');
  }));
  alvo.querySelectorAll('[data-imprimir]').forEach(b => b.addEventListener('click', () => {
    montarFolha(b.dataset.imprimir);
    setTimeout(() => window.print(), 50);
  }));
}

/** Folha A4 no padrão SAKUMA: marca no alto, tabela com grade, LOP no pé. */
function montarFolha(contagemId) {
  const c = todos('est_contagens').find(x => x.id === contagemId);
  if (!c) return;
  const local = todos('est_locais').find(l => l.id === c.local_id) || {};
  const itens = new Map(todos('est_itens').map(i => [i.id, i]));
  const linhas = linhasDe(c.id)
    .map(l => ({ item: itens.get(l.item_id) || { nome: '(item apagado)', grupo: 'Outros' }, qtd: l.quantidade }));
  const ordenadas = itensOrdenados(linhas.map(l => l.item));
  const porItem = new Map(linhas.map(l => [l.item, l.qtd]));
  const grupos = [];
  for (const i of ordenadas) {
    let g = grupos[grupos.length - 1];
    if (!g || g.nome !== (i.grupo || 'Outros')) grupos.push(g = { nome: i.grupo || 'Outros', linhas: [] });
    g.linhas.push([i.nome, i.unidade || '', mostrarNumero(porItem.get(i))]);
    for (const l of (i.id ? lotesDe(c.id, i.id) : [])) {
      g.linhas.push(['   Lote ' + (l.lote || 's/ nº') + (l.validade ? ' · val. ' + dataBR(l.validade) : ''), '', mostrarNumero(l.quantidade), 'sub']);
    }
  }
  $('ctFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Contagem de Estoque — ${esc(local.nome || '')}</h1>
        <p>${esc(nomeMes(c.mes))}${esc(sufixoRodada(c))}${c.data_contagem ? ' · contada em ' + esc(dataBR(c.data_contagem)) : ''} · fechada em ${esc(dataHora(c.fechada_em))} · ${linhas.length} itens</p>
      </div>
    </div>
    ${grupos.map(g => `<h3 class="rel-secao">${esc(g.nome)}</h3>
      <table class="rel-tab"><thead><tr><th>Item</th><th class="ce">Unidade</th><th class="ce">Quantidade</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr${l[3] ? ' class="rel-sub"' : ''}><td>${esc(l[0])}</td><td class="ce">${esc(l[1])}</td><td class="ce">${esc(l[2])}</td></tr>`).join('')}</tbody></table>`).join('')}
    <div class="rel-pe">
      <div class="rel-assina"><span></span><small>Responsável pela contagem</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`;
}

/* ===================================================================
   Lista para imprimir (pedido dele, 22/10/2026): a folha que vai para a
   prateleira — item, unidade e espaço para escrever a quantidade (e, se
   quiser, lote e validade). Pode sair em branco ou com o que já foi digitado.
   =================================================================== */
const LINHAS_POR_FOLHA = 29;

function escolherImpressao() {
  const c = atual();
  const itens = itensDaContagem(sel.localId, sel.mes, c).itens;
  const grupos = [...new Set(itens.map(i => i.grupo || 'Outros'))];
  const fechada = grupoFechado(c, sel.grupo);
  window.abrirModal('Imprimir lista da contagem', `
    <form id="ctImpForm">
      <div class="grade">
        <label class="campo">Grupo <select name="grupo">
          <option value="">Todos os grupos (${itens.length} itens)</option>
          ${grupos.map(g => `<option${g === sel.grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}
        </select></label>
      </div>
      <label class="es-check"><input type="checkbox" name="valores"${fechada ? ' checked' : ''}> Levar as quantidades já digitadas</label>
      <label class="es-check"><input type="checkbox" name="lotes"> Colunas para lote e validade</label>
      <label class="es-check"><input type="checkbox" name="faltam"> Só os itens que faltam contar</label>
      <label class="es-check"><input type="checkbox" name="porLocal" checked> Na ordem da prateleira (localização)</label>
      <p class="dc-sem">Sai em folhas A4 no padrão SAKUMA, ${LINHAS_POR_FOLHA} linhas por folha, com espaço para escrever.</p>
      <div class="barra fim"><button class="btn principal" type="submit">Imprimir</button></div>
    </form>`, corpo => {
    corpo.querySelector('#ctImpForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      montarListaImpressao({ grupo: f.get('grupo') || '', valores: !!f.get('valores'), lotes: !!f.get('lotes'), faltam: !!f.get('faltam'), porLocal: !!f.get('porLocal') });
      window.fecharModal();
      setTimeout(() => window.print(), 80);
    });
  });
}

function montarListaImpressao(op) {
  const c = atual();
  const local = todosLocais().find(l => l.id === sel.localId) || {};
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const tem = i => { const l = linhas.get(i.id); return l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== ''; };
  const itens = itensDaContagem(sel.localId, sel.mes, c).itens
    .filter(i => !op.grupo || (i.grupo || 'Outros') === op.grupo)
    .filter(i => !op.faltam || !tem(i));
  const gsOrdem = [...new Set(itens.map(i => i.grupo || 'Outros'))];
  const GRUPOS_ORDEM = i => gsOrdem.indexOf(i.grupo || 'Outros');
  // na ordem da prateleira (22/10/2026): A.1, A.2 … B.1; sem localização vai para o fim do grupo
  const chaveLoc = i => String(i.localizacao || '').toUpperCase().replace(/\d+/g, d => d.padStart(4, '0')) || '\uffff';
  if (op.porLocal) itens.sort((a, b) => (GRUPOS_ORDEM(a) - GRUPOS_ORDEM(b)) || chaveLoc(a).localeCompare(chaveLoc(b)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const cgImp = op.grupo ? cgDe(c, op.grupo) : null;
  const data = cgImp && cgImp.data_contagem ? dataBR(cgImp.data_contagem)
    : c && c.data_contagem && (!op.grupo || grupoFechado(c, op.grupo)) ? dataBR(c.data_contagem) : (op.valores ? dataBR(dataEscolhida()) : '');

  // linhas da folha: cabeçalho de grupo + itens (o cabeçalho se repete ao virar a folha)
  const corpo = [];
  let g = null;
  for (const i of itens) {
    if ((i.grupo || 'Outros') !== g) { g = i.grupo || 'Outros'; corpo.push({ grupo: g }); }
    const l = linhas.get(i.id);
    corpo.push({ i, qtd: op.valores && l ? mostrarNumero(l.quantidade) : '' });
  }
  const folhas = [];
  let folha = [], grupoAtual = null;
  for (const r of corpo) {
    if (r.grupo) grupoAtual = r.grupo;
    if (folha.length >= LINHAS_POR_FOLHA) {
      folhas.push(folha); folha = [];
      if (!r.grupo) folha.push({ grupo: grupoAtual, cont: true });
    }
    folha.push(r);
  }
  if (folha.length || !folhas.length) folhas.push(folha);

  const temLoc = itens.some(i => i.localizacao);
  const ncol = 3 + (op.lotes ? 2 : 0) + 1 + (temLoc ? 1 : 0);
  const cab = `<tr>${temLoc ? '<th class="ce">Local</th>' : ''}<th>Item</th><th class="ce">Un.</th><th class="ce lp-qtd">Quantidade</th>${op.lotes
    ? '<th class="ce">Lote</th><th class="ce">Validade</th>' : ''}<th>Obs.</th></tr>`;
  const sub = [local.nome || '', nomeMes(sel.mes) + sufixoRodada(atual()), op.grupo || 'todos os grupos', itens.length + (itens.length === 1 ? ' item' : ' itens')]
    .filter(Boolean).join(' · ');
  $('ctListaFolha').innerHTML = folhas.map((fl, k) => `<div class="folha rel lp-folha">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Lista de Contagem de Estoque</h1>
        <p>${esc(sub)}</p>
      </div>
    </div>
    <div class="lp-campos">
      <span>Data da contagem: <b>${data ? esc(data) : '____/____/______'}</b></span>
      <span>Contado por: <b class="lp-linha">&nbsp;</b></span>
    </div>
    <table class="rel-tab lp-tab"><thead>${cab}</thead><tbody>${fl.map(r => r.grupo
      ? `<tr class="lp-grupo"><td colspan="${ncol}">${esc(r.grupo)}${r.cont ? ' (continuação)' : ''}</td></tr>`
      : `<tr>${temLoc ? `<td class="ce lp-loc">${esc(r.i.localizacao || '')}</td>` : ''}<td>${esc(r.i.nome)}${r.i.codigo ? ` <small>cód. ${esc(r.i.codigo)}</small>` : ''}</td><td class="ce">${esc(r.i.unidade || '')}</td><td class="ce lp-qtd">${esc(r.qtd)}</td>${op.lotes
        ? '<td></td><td></td>' : ''}<td></td></tr>`).join('') || `<tr><td colspan="${ncol}">Nenhum item para contar.</td></tr>`}</tbody></table>
    <div class="rel-pe">
      <div class="rel-assina"><span></span><small>Responsável pela contagem</small></div>
      <small class="lp-pag">Folha ${k + 1} de ${folhas.length}</small>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`).join('');
}

/* ===================================================================
   Tela Reposição — o que chegou no estoque mínimo na contagem do mês
   (pedido dele, 15/10/2026): contou o EPI e ele está no mínimo → aparece
   aqui com a quantidade a pedir, almoxarifado por almoxarifado.
   =================================================================== */
let mesRepor = mesAtual();
let grupoRepor = '';

function listaRepor() {
  const itens = new Map(todos('est_itens').filter(i => i.ativo !== false).map(i => [i.id, i]));
  const res = [];
  for (const l of locais()) {
    const c = contagem(l.id, mesRepor);
    if (!c) continue;
    for (const ln of linhasDe(c.id)) {
      const item = comMinimoDo(itens.get(ln.item_id), l.id);
      if (!item || !precisaReporGeral(item, ln.quantidade)) continue;
      if (grupoRepor && item.grupo !== grupoRepor) continue;
      res.push({ local: l, contagem: c, item, qtd: ln.quantidade });
    }
  }
  return res;
}

function desenharRepor() {
  const alvo = $('ctReporCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = listaRepor();
  const semMin = todos('est_itens').filter(i => i.ativo !== false && !temMinimo(i)).length;
  const grupos = [...new Set(todos('est_itens').filter(i => i.ativo !== false).map(i => i.grupo))];
  const porLocal = new Map();
  for (const r of lista) {
    if (!porLocal.has(r.local.id)) porLocal.set(r.local.id, []);
    porLocal.get(r.local.id).push(r);
  }
  alvo.innerHTML = `
    <div class="grade">
      <label class="campo">Mês <input type="month" id="rpMes" value="${esc(mesRepor)}" max="${mesAtual()}"></label>
      <label class="campo">Grupo <select id="rpGrupo"><option value="">Todos</option>${grupos.map(g =>
        `<option${g === grupoRepor ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
    </div>
    ${semMin ? `<p class="es-nota">${semMin} ${semMin === 1 ? 'item ainda não tem' : 'itens ainda não têm'} estoque mínimo e não
      ${semMin === 1 ? 'entra' : 'entram'} nesta lista. Defina em <strong>Cadastros › Itens</strong>.</p>` : ''}
    ${lista.length ? [...porLocal.values()].map(rs => `
      <h3 class="es-secao">${esc(rs[0].local.nome)} <small>${rs[0].contagem.status === 'fechada' ? 'contagem fechada' : 'contagem em andamento'}</small></h3>
      <div class="lista">${rs.map(r => `<div class="item"><span></span>
        <div><div class="nome">${esc(r.item.nome)} <span class="tag alerta">${esc(r.item.grupo || '')}</span></div>
          <div class="sub">contado ${esc(mostrarNumero(r.qtd))} ${esc(r.item.unidade || '')} · mínimo ${esc(mostrarNumero(r.item.estoque_minimo))}</div></div>
        <div class="acoes"><strong class="rp-pedir">${esc(textoPedido(r.item))}</strong></div>
      </div>`).join('')}</div>`).join('')
      + `<div class="barra fim"><button class="btn principal" type="button" id="rpImprimir">Imprimir o pedido</button></div>`
      : `<div class="vazio">Nada no estoque mínimo nas contagens de ${esc(nomeMes(mesRepor))}${grupoRepor ? ' (' + esc(grupoRepor) + ')' : ''}.</div>`}`;
  $('rpMes').addEventListener('change', e => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesRepor = e.target.value; desenharRepor(); }
  });
  $('rpGrupo').addEventListener('change', e => { grupoRepor = e.target.value; desenharRepor(); });
  $('rpImprimir')?.addEventListener('click', () => { montarFolhaRepor(lista); setTimeout(() => window.print(), 50); });
}

/** Folha A4 do pedido de reposição, no padrão SAKUMA. */
function montarFolhaRepor(lista) {
  const linhas = lista.map(r => [r.local.nome, r.item.nome, r.item.grupo || '',
    mostrarNumero(r.qtd) + ' ' + (r.item.unidade || ''), mostrarNumero(r.item.estoque_minimo),
    r.item.pedido_reposicao != null && r.item.pedido_reposicao !== '' ? mostrarNumero(r.item.pedido_reposicao) + ' ' + (r.item.unidade || '') : '—']);
  $('rpFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Pedido de Reposição</h1>
        <p>Itens no estoque mínimo · contagem de ${esc(nomeMes(mesRepor))}${grupoRepor ? ' · ' + esc(grupoRepor) : ''} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p>
      </div>
    </div>
    <table class="rel-tab" style="margin-top:6mm"><thead><tr><th>Almoxarifado</th><th>Item</th><th>Grupo</th>
      <th class="ce">Contado</th><th class="ce">Mínimo</th><th class="ce">Pedir</th></tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((v, k) => `<td${k >= 3 ? ' class="ce"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="rel-pe">
      <div class="rel-assina"><span></span><small>Responsável pelo pedido</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`;
}

/* ===================================================================
   ligação com o app.js
   =================================================================== */
const DESENHOS = { ctNova: desenharContar, ctAndamento: desenharAndamento, ctRepor: desenharRepor, ctHistorico: desenharHistorico, ctMapa: desenharMapa };

export function abrirContagem(tela) {
  telaAberta = tela;
  (DESENHOS[tela] || (() => {}))();
}

/* A base mudou (chegou do servidor ou terminou de abrir): redesenha, mas
   nunca embaixo do dedo de quem está digitando um número. */
window.addEventListener('estoque-dados', () => {
  if (!telaAberta || !DESENHOS[telaAberta]) return;
  const foco = document.activeElement;
  if (foco && (foco.classList.contains('ct-qtd') || foco.id === 'ctBusca' || foco.closest && (foco.closest('.ct-lote') || foco.closest('.ct-quad') || foco.closest('.mp-sel')))) return;
  if (!document.querySelector('#modal.oculto') && document.querySelector('#modal')) return;
  DESENHOS[telaAberta]();
});

export const telaAtualDaContagem = () => telaAberta;
export function soltarContagem() { telaAberta = null; soltarMapa(); }
