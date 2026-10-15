// compra.js — Compra inteligente da área Estoque (15/10/2026).
//
// Pedido do Guilherme: o agrônomo percorre as culturas, vê o que vai precisar
// aplicar e faz um levantamento em três etapas:
//   1. Levantamento — o que vai precisar e quanto.
//   2. Conferência — conta no estoque SÓ os produtos dessa lista (não tem
//      ligação com o balanço mensal da Contagem).
//   3. Compra — necessário − estoque = o que comprar, e dá para ajustar.
import {
  $, esc, pronto, todos, aviso, meuNome, locais, GRUPOS, UNIDADES,
  lerNumero, mostrarNumero, dataHora,
} from './dados.js';
import { gravar as gravarDireto } from './dados.js';

/* Gravações uma de cada vez (mesmo motivo da Contagem). */
let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const vazio = v => v === null || v === undefined || v === '';
const ETAPAS = ['Levantamento', 'Conferência', 'Compra'];

let telaAberta = null;
let aberto = null;          // id do levantamento aberto (null = lista)
let etapaVista = null;      // etapa mostrada (pode voltar sem mudar a do registro)
let verConcluidos = false;

const compras = () => todos('est_compras').filter(c => c.ativo !== false);
const compra = id => todos('est_compras').find(c => c.id === id) || null;
const linhasDe = id => [...new Map(todos('est_compra_itens')
  .filter(l => l.compra_id === id).map(l => [l.id, l])).values()].filter(l => l.ativo !== false);
const itemDe = id => todos('est_itens').find(i => i.id === id) || { nome: '(item apagado)', unidade: '' };
const nomeLocal = id => (todos('est_locais').find(l => l.id === id) || {}).nome || '—';

/* Quanto tem do produto em cada estoque (etapa 2). */
const porEstoque = linhaId => new Map(todos('est_compra_estoques')
  .filter(e => e.compra_item_id === linhaId).map(e => [e.local_id, e]));
/** "Faz. Faca 20 · Lote 35 PADAP 10" — só os estoques que têm. */
function ondeTem(l) {
  const m = porEstoque(l.id);
  return locais().map(lc => [lc, m.get(lc.id)])
    .filter(([, e]) => e && !vazio(e.quantidade) && Number(e.quantidade) > 0)
    .map(([lc, e]) => `${lc.nome} ${mostrarNumero(e.quantidade)}`).join(' · ');
}

/** O que comprar: o ajustado, se houver; senão necessário − estoque (nunca negativo). */
export function aComprar(l) {
  if (!vazio(l.comprar)) return Number(l.comprar);
  if (vazio(l.necessario)) return null;
  return Math.max(0, Number(l.necessario) - (vazio(l.estoque) ? 0 : Number(l.estoque)));
}

/* ===================================================================
   Lista de levantamentos
   =================================================================== */
function desenharLista() {
  const alvo = $('ciCorpo');
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  $('ciFolha').innerHTML = '';
  const lista = compras().filter(c => verConcluidos || c.status !== 'concluida')
    .sort((a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')));
  alvo.innerHTML = `
  <div class="cartao">
    <h2>Compra inteligente</h2>
    <p class="dica">O agrônomo levanta o que vai precisar aplicar, confere só esses produtos no estoque e o app
      mostra o que comprar. Três etapas: <strong>Levantamento → Conferência → Compra</strong>.</p>
    <form class="grade larga cad-novo" id="ciNovo" autocomplete="off">
      <label class="campo">Levantamento <input type="text" name="titulo" required placeholder="ex.: Batata Pivô 1 — novembro"></label>
      <div class="barra fim" style="align-self:end"><button class="btn principal" type="submit">Começar levantamento</button></div>
    </form>
    <div class="barra entre">
      <span class="dc-sem">${lista.length} ${lista.length === 1 ? 'levantamento' : 'levantamentos'}</span>
      <label class="es-check"><input type="checkbox" id="ciConcl"${verConcluidos ? ' checked' : ''}> mostrar concluídos</label>
    </div>
    <div class="lista">${lista.map(c => {
      const ls = linhasDe(c.id);
      const comprar = ls.filter(l => (aComprar(l) || 0) > 0).length;
      return `<div class="item"><span></span>
        <div><div class="nome">${esc(c.titulo)} ${c.status === 'concluida'
          ? '<span class="tag ativo">concluído</span>'
          : `<span class="tag alerta">etapa ${c.etapa} · ${ETAPAS[c.etapa - 1]}</span>`}</div>
          <div class="sub">${ls.length} produto(s)${c.etapa === 3 || c.status === 'concluida'
            ? ` · ${comprar} a comprar` : ''} · ${esc(c.criado_por || '')} em ${esc(dataHora(c.criado_em))}</div></div>
        <div class="acoes"><button class="btn mini principal" type="button" data-abrir="${esc(c.id)}">Abrir</button></div>
      </div>`;
    }).join('') || '<div class="vazio">Nenhum levantamento ainda.</div>'}</div>
  </div>`;

  $('ciNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const titulo = String(f.get('titulo') || '').trim();
    if (!titulo) return;
    const c = await gravar('est_compras', {
      titulo, local_id: null, etapa: 1, status: 'aberta',
      criado_por: meuNome(), criado_em: new Date().toISOString(), ativo: true,
    });
    aberto = c.id; etapaVista = 1;
    desenhar();
  });
  $('ciConcl').addEventListener('change', e => { verConcluidos = e.target.checked; desenharLista(); });
  alvo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => {
    aberto = b.dataset.abrir; etapaVista = null; desenhar();
  }));
}

/* ===================================================================
   Um levantamento aberto, com as três etapas
   =================================================================== */
function desenharLevantamento() {
  const alvo = $('ciCorpo');
  const c = compra(aberto);
  if (!c) { aberto = null; return desenharLista(); }
  const etapa = etapaVista || (c.status === 'concluida' ? 3 : c.etapa);
  const fechado = c.status === 'concluida';
  const ls = linhasDe(c.id).sort((a, b) => itemDe(a.item_id).nome.localeCompare(itemDe(b.item_id).nome, 'pt-BR'));

  const passos = ETAPAS.map((n, k) => `<button type="button" class="ci-passo${k + 1 === etapa ? ' atual' : ''}${k + 1 < c.etapa || fechado ? ' feito' : ''}"
      data-etapa="${k + 1}"><b>${k + 1}</b> ${n}</button>`).join('');

  let corpo = '';
  if (etapa === 1) corpo = etapa1(c, ls, fechado);
  if (etapa === 2) corpo = etapa2(c, ls, fechado);
  if (etapa === 3) corpo = etapa3(c, ls, fechado);

  alvo.innerHTML = `
  <div class="cartao">
    <div class="barra entre"><button class="btn mini" type="button" id="ciVoltar">‹ Levantamentos</button>
      ${fechado ? '<span class="tag ativo">concluído</span>' : ''}</div>
    <h2 style="margin-top:8px">${esc(c.titulo)}</h2>
    <p class="dica">Começado por ${esc(c.criado_por || '—')}
      em ${esc(dataHora(c.criado_em))}${fechado ? ` · concluído por ${esc(c.concluida_por || '—')} em ${esc(dataHora(c.concluida_em))}` : ''}</p>
    <div class="ci-passos">${passos}</div>
    ${corpo}
  </div>`;

  $('ciVoltar').onclick = () => { aberto = null; desenhar(); };
  alvo.querySelectorAll('[data-etapa]').forEach(b => b.addEventListener('click', () => {
    etapaVista = Number(b.dataset.etapa); desenharLevantamento();
  }));
  if (etapa === 1) ligarEtapa1(c);
  if (etapa === 2) ligarEtapa2(c);
  if (etapa === 3) ligarEtapa3(c, ls);
}

/* ---------------- Etapa 1: levantamento ---------------- */
function etapa1(c, ls, fechado) {
  const itens = todos('est_itens').filter(i => i.ativo !== false)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return `
    <h3 class="es-secao">1 · O que vai precisar</h3>
    ${fechado ? '' : `<form class="ci-add" id="ciAdd" autocomplete="off">
      <label class="campo">Produto <input type="text" name="produto" list="ciProdutos" required placeholder="digite o nome do produto"></label>
      <label class="campo">Quantidade <input type="text" name="qtd" inputmode="decimal" required placeholder="0"></label>
      <button class="btn principal" type="submit">Adicionar</button>
      <datalist id="ciProdutos">${itens.map(i => `<option value="${esc(i.nome)}">${esc(i.unidade || '')} · ${esc(i.grupo || '')}</option>`).join('')}</datalist>
    </form>`}
    <div class="ci-lista">${ls.map(l => {
      const i = itemDe(l.item_id);
      return `<div class="ci-linha" data-linha="${esc(l.id)}">
        <div class="ci-nome">${esc(i.nome)}<small>${esc(i.unidade || '')}${l.obs ? ' · ' + esc(l.obs) : ''}</small></div>
        <input class="ci-num" data-campo="necessario" type="text" inputmode="decimal" value="${esc(mostrarNumero(l.necessario))}"
          placeholder="—" aria-label="Quantidade necessária de ${esc(i.nome)}"${fechado ? ' disabled' : ''}>
        ${fechado ? '' : `<button type="button" class="cl-tirar" data-tirar="${esc(l.id)}" title="Tirar da lista">×</button>`}
      </div>`;
    }).join('') || '<div class="vazio">Nenhum produto ainda. Digite o nome e a quantidade acima.</div>'}</div>
    ${fechado || !ls.length ? '' : `<div class="barra fim ci-pe">
      <button class="btn principal" type="button" data-ir="2">Seguir para a conferência ›</button></div>`}`;
}

function ligarEtapa1(c) {
  $('ciAdd')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nome = String(f.get('produto') || '').trim();
    const qtd = lerNumero(f.get('qtd'));
    if (Number.isNaN(qtd) || qtd === null) { aviso('Quantidade: use só números (ex.: 120 ou 2,5).', true); return; }
    let item = todos('est_itens').find(i => i.ativo !== false && semAcento(i.nome) === semAcento(nome));
    if (!item) return cadastrarNaHora(nome, qtd, c);
    await adicionar(c, item, qtd);
  });
  ligarNumeros(c, 'necessario');
  ligarFluxo(c);
}

async function adicionar(c, item, qtd) {
  const ja = linhasDe(c.id).find(l => l.item_id === item.id);
  if (ja) {
    await gravar('est_compra_itens', Object.assign({}, ja, { necessario: (Number(ja.necessario) || 0) + qtd }));
    aviso(`${item.nome} já estava na lista: somei ${mostrarNumero(qtd)}.`);
  } else {
    await gravar('est_compra_itens', { compra_id: c.id, item_id: item.id, necessario: qtd, ativo: true });
  }
  desenharLevantamento();
  const campo = document.querySelector('#ciAdd [name=produto]');
  if (campo) campo.focus();
}

/** Produto que ainda não está no cadastro: cadastra ali mesmo e já põe na lista. */
function cadastrarNaHora(nome, qtd, c) {
  window.abrirModal('Produto novo', `
    <p><strong>${esc(nome)}</strong> ainda não está no cadastro de itens. Cadastrar agora?</p>
    <div class="grade">
      <label class="campo">Unidade <select id="cnUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Grupo <select id="cnGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" id="cnNao">Corrigir o nome</button>
      <button class="btn principal" type="button" id="cnSim">Cadastrar e adicionar</button></div>`, corpo => {
    corpo.querySelector('#cnNao').onclick = window.fecharModal;
    corpo.querySelector('#cnSim').onclick = async () => {
      const item = await gravar('est_itens', { nome: nome.replace(/\s+/g, ' '), unidade: corpo.querySelector('#cnUni').value,
        grupo: corpo.querySelector('#cnGrupo').value, ativo: true });
      window.fecharModal();
      await adicionar(c, item, qtd);
    };
  });
}

/* ---------------- Etapa 2: conferência ---------------- */
/* Pedido dele (15/10/2026): a conferência é nos cinco estoques — para cada
   produto, quanto tem em cada um. O total é o que desconta da compra, e o
   pedido mostra onde tem (dá para transferir em vez de comprar). */
function etapa2(c, ls, fechado) {
  const feitos = ls.filter(l => !vazio(l.estoque)).length;
  const lcs = locais();
  return `
    <h3 class="es-secao">2 · Conferência nos estoques <small>${feitos} de ${ls.length} conferidos</small></h3>
    <p class="dica">Só estes produtos, sem mexer no balanço do mês. Digite quanto tem em cada estoque;
      onde não tem, deixe em branco. Não tem em nenhum? Digite 0 em um deles.</p>
    <div class="ci-lista">${ls.map(l => {
      const i = itemDe(l.item_id);
      const m = porEstoque(l.id);
      return `<div class="ci-conf${vazio(l.estoque) ? '' : ' feito'}" data-linha="${esc(l.id)}">
        <div class="ci-conf-topo">
          <div class="ci-nome">${esc(i.nome)}<small>precisa ${esc(mostrarNumero(l.necessario))} ${esc(i.unidade || '')}</small></div>
          <div class="ci-total"><span>total</span><strong>${vazio(l.estoque) ? '—' : esc(mostrarNumero(l.estoque))}</strong></div>
        </div>
        <div class="ci-estoques">${lcs.map(lc => {
          const e = m.get(lc.id);
          return `<label>${esc(lc.nome)}<input class="ci-num ci-est" data-local="${esc(lc.id)}" type="text" inputmode="decimal"
            enterkeyhint="next" value="${esc(e ? mostrarNumero(e.quantidade) : '')}" placeholder="—"${fechado ? ' disabled' : ''}></label>`;
        }).join('')}</div>
      </div>`;
    }).join('') || '<div class="vazio">A lista está vazia. Volte à etapa 1.</div>'}</div>
    ${fechado || !ls.length ? '' : `<div class="barra entre ci-pe">
      <button class="btn" type="button" data-ir="1">‹ Levantamento</button>
      <button class="btn principal" type="button" data-ir="3">Ver o que comprar ›</button></div>`}`;
}

function ligarEtapa2(c) {
  const campos = [...document.querySelectorAll('#ciCorpo .ci-est')];
  campos.forEach((inp, k) => {
    inp.addEventListener('change', async () => {
      const digitado = inp.value;
      const n = lerNumero(digitado);
      const card = inp.closest('[data-linha]');
      if (Number.isNaN(n)) { inp.classList.add('erro'); aviso('Use só números (ex.: 120 ou 2,5).', true); return; }
      inp.classList.remove('erro');
      const l = linhasDe(c.id).find(x => x.id === card.dataset.linha);
      if (!l) return;
      await gravar('est_compra_estoques', { id: l.id + ':' + inp.dataset.local, compra_item_id: l.id,
        local_id: inp.dataset.local, quantidade: n });
      // total = soma dos estoques preenchidos (todos em branco = não conferido)
      const qs = [...porEstoque(l.id).values()].map(e => e.quantidade).filter(q => !vazio(q));
      const total = qs.length ? qs.reduce((t, q) => t + Number(q), 0) : null;
      await gravar('est_compra_itens', Object.assign({}, linhasDe(c.id).find(x => x.id === l.id), { estoque: total }));
      if (inp.value === digitado) inp.value = mostrarNumero(n);
      card.classList.toggle('feito', total !== null);
      card.querySelector('.ci-total strong').textContent = total === null ? '—' : mostrarNumero(total);
      const ls = linhasDe(c.id);
      const t = document.querySelector('#ciCorpo .es-secao small');
      if (t) t.textContent = `${ls.filter(x => !vazio(x.estoque)).length} de ${ls.length} conferidos`;
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = campos[k + 1];
      if (prox) { prox.focus(); prox.select(); } else inp.blur();
    });
  });
  ligarFluxo(c);
}

/* ---------------- Etapa 3: compra ---------------- */
function etapa3(c, ls, fechado) {
  const comprar = ls.filter(l => (aComprar(l) || 0) > 0);
  const semConf = ls.filter(l => vazio(l.estoque)).length;
  return `
    <h3 class="es-secao">3 · O que comprar <small>${comprar.length} de ${ls.length} produtos</small></h3>
    ${semConf ? `<p class="es-nota">${semConf} produto(s) ainda sem conferência: a conta considera estoque zero para eles.</p>` : ''}
    <div class="ci-tab">
      <div class="ci-cab"><span>Produto</span><span>Precisa</span><span>Estoque</span><span>Comprar</span></div>
      ${ls.map(l => {
        const i = itemDe(l.item_id);
        const valor = aComprar(l);
        const ajustado = !vazio(l.comprar);
        return `<div class="ci-trio${(valor || 0) > 0 ? ' comprar' : ''}" data-linha="${esc(l.id)}">
          <span class="ci-nome">${esc(i.nome)}<small>${esc(i.unidade || '')}${ajustado ? ' · <b>ajustado</b>' : ''}</small>
            ${ondeTem(l) ? `<small class="ci-onde">tem em: ${esc(ondeTem(l))}</small>` : ''}</span>
          <span>${esc(mostrarNumero(l.necessario))}</span>
          <span>${vazio(l.estoque) ? '—' : esc(mostrarNumero(l.estoque))}</span>
          <span class="ci-comprar">
            <input class="ci-num" data-campo="comprar" type="text" inputmode="decimal" value="${esc(mostrarNumero(valor))}"
              aria-label="Comprar de ${esc(i.nome)}"${fechado ? ' disabled' : ''}>
            ${ajustado && !fechado ? `<button type="button" class="ci-refaz" data-refaz="${esc(l.id)}" title="Voltar ao calculado">↺</button>` : ''}
          </span>
        </div>`;
      }).join('')}
    </div>
    <div class="barra entre ci-pe">
      ${fechado ? (window.App?.usuario?.admin ? '<button class="btn" type="button" id="ciReabrir">Reabrir</button>' : '<span></span>')
        : '<button class="btn" type="button" data-ir="2">‹ Conferência</button>'}
      <span class="barra" style="margin:0">
        <button class="btn" type="button" id="ciImprimir"${comprar.length ? '' : ' disabled'}>Imprimir pedido de compra</button>
        ${fechado ? '' : '<button class="btn principal" type="button" id="ciConcluir">Concluir</button>'}
      </span>
    </div>`;
}

function ligarEtapa3(c, ls) {
  ligarNumeros(c, 'comprar');
  ligarFluxo(c);
  document.querySelectorAll('[data-refaz]').forEach(b => b.addEventListener('click', async () => {
    const l = linhasDe(c.id).find(x => x.id === b.dataset.refaz);
    if (l) { await gravar('est_compra_itens', Object.assign({}, l, { comprar: null })); desenharLevantamento(); }
  }));
  $('ciImprimir')?.addEventListener('click', () => { montarFolha(c); setTimeout(() => window.print(), 50); });
  $('ciConcluir')?.addEventListener('click', async () => {
    if (!confirm('Concluir este levantamento? A lista fica guardada e não muda mais.')) return;
    await gravar('est_compras', Object.assign({}, c, { status: 'concluida', etapa: 3,
      concluida_por: meuNome(), concluida_em: new Date().toISOString() }));
    aviso('Levantamento concluído.');
    desenharLevantamento();
  });
  $('ciReabrir')?.addEventListener('click', async () => {
    await gravar('est_compras', Object.assign({}, c, { status: 'aberta', concluida_por: null, concluida_em: null }));
    desenharLevantamento();
  });
}

/* ---------------- comum às etapas ---------------- */

/** Campos numéricos da lista: grava ao sair do campo; Enter pula para o próximo. */
function ligarNumeros(c, campo) {
  const campos = [...document.querySelectorAll(`#ciCorpo .ci-num[data-campo="${campo}"]`)];
  campos.forEach((inp, k) => {
    inp.addEventListener('change', async () => {
      const digitado = inp.value;
      const n = lerNumero(digitado);
      const div = inp.closest('[data-linha]');
      if (Number.isNaN(n)) { div.classList.add('erro'); aviso('Use só números (ex.: 120 ou 2,5).', true); return; }
      div.classList.remove('erro');
      const l = linhasDe(c.id).find(x => x.id === div.dataset.linha);
      if (!l) return;
      // na etapa 3, digitar o mesmo número do calculado não conta como ajuste
      let valor = n;
      if (campo === 'comprar' && n !== null && vazio(l.comprar) && n === aComprar(l)) return;
      if (campo === 'comprar' && n === null) valor = null;
      await gravar('est_compra_itens', Object.assign({}, l, { [campo]: valor }));
      if (inp.value === digitado) inp.value = mostrarNumero(n);
      if (campo === 'estoque') {
        div.classList.toggle('feito', n !== null);
        const t = document.querySelector('#ciCorpo .es-secao small');
        const ls = linhasDe(c.id);
        if (t) t.textContent = `${ls.filter(x => !vazio(x.estoque)).length} de ${ls.length} conferidos`;
      }
      if (campo === 'comprar') desenharLevantamento();
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = campos[k + 1];
      if (prox) { prox.focus(); prox.select(); } else inp.blur();
    });
  });
  document.querySelectorAll('#ciCorpo [data-tirar]').forEach(b => b.addEventListener('click', async () => {
    const l = linhasDe(c.id).find(x => x.id === b.dataset.tirar);
    if (!l) return;
    await gravar('est_compra_itens', Object.assign({}, l, { ativo: false }));
    desenharLevantamento();
  }));
}

/** Botões "Seguir": avançam a etapa do levantamento (nunca voltam a etapa gravada). */
function ligarFluxo(c) {
  document.querySelectorAll('#ciCorpo [data-ir]').forEach(b => b.addEventListener('click', async () => {
    if (document.activeElement && document.activeElement.classList.contains('ci-num')) document.activeElement.blur();
    const ir = Number(b.dataset.ir);
    const atual = compra(c.id);
    if (ir > atual.etapa) await gravar('est_compras', Object.assign({}, atual, { etapa: ir }));
    etapaVista = ir;
    desenharLevantamento();
    window.scrollTo({ top: 0 });
  }));
}

/** Folha A4 do pedido de compra, no padrão SAKUMA. */
function montarFolha(c) {
  const ls = linhasDe(c.id).filter(l => (aComprar(l) || 0) > 0)
    .sort((a, b) => itemDe(a.item_id).nome.localeCompare(itemDe(b.item_id).nome, 'pt-BR'));
  $('ciFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Pedido de Compra</h1>
        <p>${esc(c.titulo)} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p>
      </div>
    </div>
    <table class="rel-tab" style="margin-top:6mm"><thead><tr><th>Produto</th><th class="ce">Unidade</th>
      <th class="ce">Necessário</th><th class="ce">Em estoque</th><th>Onde tem</th><th class="ce">Comprar</th></tr></thead>
    <tbody>${ls.map(l => { const i = itemDe(l.item_id); return `<tr><td>${esc(i.nome)}</td><td class="ce">${esc(i.unidade || '')}</td>
      <td class="ce">${esc(mostrarNumero(l.necessario))}</td><td class="ce">${vazio(l.estoque) ? '—' : esc(mostrarNumero(l.estoque))}</td>
      <td style="font-size:7.8pt">${esc(ondeTem(l) || '—')}</td>
      <td class="ce"><b>${esc(mostrarNumero(aComprar(l)))}</b></td></tr>`; }).join('')}</tbody></table>
    <div class="rel-pe">
      <div class="rel-assina"><span></span><small>Responsável pela compra</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`;
}

/* ===================================================================
   ligação com o app.js
   =================================================================== */
function desenhar() {
  if (telaAberta !== 'ciLista') return;
  if (aberto) desenharLevantamento(); else desenharLista();
}

export function abrirCompra(tela) { telaAberta = tela; desenhar(); }
export function soltarCompra() { telaAberta = null; }

window.addEventListener('estoque-dados', () => {
  if (telaAberta !== 'ciLista') return;
  const foco = document.activeElement;
  if (foco && foco.closest && foco.closest('#ciCorpo') && /INPUT|SELECT|TEXTAREA/.test(foco.tagName)) return;
  if (document.querySelector('#modal') && !document.querySelector('#modal.oculto')) return;
  desenhar();
});
