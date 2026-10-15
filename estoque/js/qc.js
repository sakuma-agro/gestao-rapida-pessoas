// qc.js — Estoque Faz. Quebra Cocão (15/10/2026).
//
// Pedido do Guilherme: um estoque com entradas e saídas, sem ligação com as
// contagens nem com o acerto. Saldo de cada item = entradas − saídas.
//   Entradas: compra ou transferência (e "saldo inicial", para a implantação).
//   Saídas: uso ou transferência — nº do documento, plantio, operador e, na
//   transferência, a fazenda de destino.
//   Estoque: a posição por categoria (grupo do item), com o extrato de cada um.
import {
  $, esc, pronto, todos, aviso, meuNome, locais, itensOrdenados, GRUPOS, UNIDADES,
  lerNumero, mostrarNumero, dataBR, hojeISO, temMinimo, precisaRepor,
} from './dados.js';
import { gravar as gravarDireto } from './dados.js';

let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const vazio = v => v === null || v === undefined || v === '';
const TIPOS_ENTRADA = { compra: 'Compra', transferencia: 'Transferência', saldo_inicial: 'Saldo inicial' };
const TIPOS_SAIDA = { uso: 'Uso', transferencia: 'Transferência' };

let telaAberta = null;
let busca = '';
let grupoVisao = '';
let mesLista = hojeISO().slice(0, 7);

/** O estoque da Quebra Cocão no cadastro de almoxarifados. */
const localQc = () => todos('est_locais').find(l => l.ativo !== false && semAcento(l.nome).includes('QUEBRA COCAO')) || null;
const movimentos = () => {
  const lc = localQc();
  return lc ? [...new Map(todos('est_movimentos').filter(m => m.local_id === lc.id).map(m => [m.id, m])).values()]
    .filter(m => m.ativo !== false) : [];
};
const itemDe = id => todos('est_itens').find(i => i.id === id) || { nome: '(item apagado)', unidade: '', grupo: 'Outros' };

/** Saldo de cada item (Map item_id → número). */
function saldos() {
  const m = new Map();
  for (const mv of movimentos()) {
    const q = Number(mv.quantidade) || 0;
    m.set(mv.item_id, (m.get(mv.item_id) || 0) + (mv.sentido === 'entrada' ? q : -q));
  }
  return m;
}
const unicos = campo => [...new Set(movimentos().map(m => m[campo]).filter(v => !vazio(v)))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

function semLocal(alvo) {
  alvo.innerHTML = `<div class="cartao"><h2>Estoque Faz. Quebra Cocão</h2>
    <div class="vazio">Não achei o estoque "Faz. Quebra Cocão" em Cadastros › Almoxarifados.</div></div>`;
}

/* ===================================================================
   Visão do estoque — por categoria
   =================================================================== */
function desenharVisao() {
  const alvo = $('qcVisaoCorpo');
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  if (!localQc()) return semLocal(alvo);
  $('qcFolha').innerHTML = '';
  const sd = saldos();
  const itens = itensOrdenados().filter(i => sd.has(i.id));
  const b = semAcento(busca);
  const grupos = [...new Set(itens.map(i => i.grupo || 'Outros'))];
  const vistos = itens.filter(i => (!grupoVisao || (i.grupo || 'Outros') === grupoVisao) && (!b || semAcento(i.nome).includes(b)));
  const negativos = itens.filter(i => sd.get(i.id) < -0.0001).length;
  const repor = itens.filter(i => precisaRepor(i, sd.get(i.id))).length;
  let grupo = null;
  alvo.innerHTML = `
  <div class="cartao">
    <h2>Estoque Faz. Quebra Cocão</h2>
    <p class="dica">Saldo de cada item = entradas − saídas lançadas aqui. Não tem ligação com a contagem do mês nem com o acerto.</p>
    <div class="es-cards">
      <div class="es-card es-ok"><span>Itens com movimento</span><strong>${itens.length}</strong><small>${grupos.length} categoria(s)</small></div>
      <div class="es-card es-transf"><span>Lançamentos</span><strong>${movimentos().length}</strong><small>entradas e saídas</small></div>
      <div class="es-card es-falta"><span>Saldo negativo</span><strong>${negativos}</strong><small>saiu mais do que entrou</small></div>
      <div class="es-card es-sobra"><span>No estoque mínimo</span><strong>${repor}</strong><small>pelo cadastro do item</small></div>
    </div>
    <div class="ct-chips" style="margin-top:12px">
      <button type="button" class="ct-chip" data-qc-g="" aria-pressed="${!grupoVisao}">Todas</button>
      ${grupos.map(g => `<button type="button" class="ct-chip" data-qc-g="${esc(g)}" aria-pressed="${grupoVisao === g}">${esc(g)}
        <small>${itens.filter(i => (i.grupo || 'Outros') === g).length}</small></button>`).join('')}
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar item
        <input type="text" id="qcBusca" placeholder="Digite parte do nome..." value="${esc(busca)}"></label>
      <button class="btn" type="button" id="qcImprimir"${vistos.length ? '' : ' disabled'}>Imprimir posição</button>
    </div>
    <div class="lista">${vistos.map(i => {
      const v = sd.get(i.id);
      const cab = (i.grupo || 'Outros') !== grupo ? `<h3 class="es-secao">${esc(grupo = i.grupo || 'Outros')}</h3>` : '';
      return cab + `<div class="item qc-item" data-extrato="${esc(i.id)}"><span></span>
        <div><div class="nome">${esc(i.nome)}${v < -0.0001 ? ' <span class="tag perigo">negativo</span>'
          : precisaRepor(i, v) ? ' <span class="tag alerta">no mínimo</span>' : ''}</div>
          <div class="sub">${esc(i.unidade || '')}${temMinimo(i) ? ` · mínimo ${esc(mostrarNumero(i.estoque_minimo))}` : ''} · toque para ver o extrato</div></div>
        <div class="acoes"><strong class="qc-saldo${v < -0.0001 ? ' neg' : ''}">${esc(mostrarNumero(Math.round(v * 1000) / 1000))}</strong></div>
      </div>`;
    }).join('') || `<div class="vazio">${movimentos().length ? 'Nada com esse filtro.' : 'Nenhuma entrada ainda. Comece por <strong>Entradas</strong> (use "Saldo inicial" para o que já está no estoque hoje).'}</div>`}</div>
  </div>`;
  alvo.querySelectorAll('[data-qc-g]').forEach(b => b.addEventListener('click', () => { grupoVisao = b.dataset.qcG; desenharVisao(); }));
  $('qcBusca').addEventListener('input', e => {
    busca = e.target.value; const pos = e.target.selectionStart;
    desenharVisao(); const el = $('qcBusca'); el.focus(); el.setSelectionRange(pos, pos);
  });
  alvo.querySelectorAll('[data-extrato]').forEach(el => el.addEventListener('click', () => extrato(el.dataset.extrato)));
  $('qcImprimir')?.addEventListener('click', () => { montarPosicao(vistos, sd); setTimeout(() => window.print(), 50); });
}

/** Extrato do item: cada entrada e saída, com o saldo correndo. */
function extrato(itemId) {
  const i = itemDe(itemId);
  const mvs = movimentos().filter(m => m.item_id === itemId)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.atualizado_em).localeCompare(String(b.atualizado_em)));
  let saldo = 0;
  const linhas = mvs.map(m => {
    const q = Number(m.quantidade) || 0;
    saldo += m.sentido === 'entrada' ? q : -q;
    return { m, q, saldo };
  }).reverse();
  window.abrirModal(`Extrato · ${i.nome}`, `
    <p class="dica">Saldo atual: <strong>${esc(mostrarNumero(Math.round(saldo * 1000) / 1000))} ${esc(i.unidade || '')}</strong></p>
    <div class="lista">${linhas.map(({ m, q, saldo: s }) => `<div class="item"><span></span>
      <div><div class="nome">${dataBR(m.data)} · ${m.sentido === 'entrada' ? 'Entrada' : 'Saída'} — ${esc((m.sentido === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA)[m.tipo] || m.tipo)}</div>
        <div class="sub">${detalhe(m)}</div></div>
      <div class="acoes" style="text-align:right"><strong class="${m.sentido === 'entrada' ? 'qc-ent' : 'qc-sai'}">${m.sentido === 'entrada' ? '+' : '−'}${esc(mostrarNumero(q))}</strong>
        <div class="sub">saldo ${esc(mostrarNumero(Math.round(s * 1000) / 1000))}</div></div>
    </div>`).join('') || '<div class="vazio">Sem lançamentos.</div>'}</div>`);
}

const detalhe = m => [
  m.documento ? 'doc. ' + esc(m.documento) : '',
  m.plantio ? 'plantio ' + esc(m.plantio) : '',
  m.operador ? esc(m.operador) : '',
  m.outra_fazenda ? (m.sentido === 'entrada' ? 'de ' : 'para ') + esc(m.outra_fazenda) : '',
  m.fornecedor ? esc(m.fornecedor) : '',
  m.obs ? esc(m.obs) : '',
].filter(Boolean).join(' · ') || '—';

function montarPosicao(itens, sd) {
  const grupos = [];
  for (const i of itens) {
    let g = grupos[grupos.length - 1];
    if (!g || g.nome !== (i.grupo || 'Outros')) grupos.push(g = { nome: i.grupo || 'Outros', linhas: [] });
    g.linhas.push([i.nome, i.unidade || '', mostrarNumero(Math.round(sd.get(i.id) * 1000) / 1000)]);
  }
  $('qcFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Posição do Estoque — Faz. Quebra Cocão</h1>
        <p>${itens.length} itens${grupoVisao ? ' · ' + esc(grupoVisao) : ''} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p></div></div>
    ${grupos.map(g => `<h3 class="rel-secao">${esc(g.nome)}</h3>
      <table class="rel-tab"><thead><tr><th>Item</th><th class="ce">Unidade</th><th class="ce">Saldo</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr><td>${esc(l[0])}</td><td class="ce">${esc(l[1])}</td><td class="ce">${esc(l[2])}</td></tr>`).join('')}</tbody></table>`).join('')}
    <div class="rel-pe"><div class="rel-assina"><span></span><small>Responsável pelo estoque</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ===================================================================
   Entradas e saídas — formulário no alto, lançamentos do mês embaixo
   =================================================================== */
function opcoesItens() {
  return itensOrdenados().map(i => `<option value="${esc(i.nome)}">${esc(i.unidade || '')} · ${esc(i.grupo || '')}</option>`).join('');
}
const outrasFazendas = () => locais().filter(l => !semAcento(l.nome).includes('QUEBRA COCAO')).map(l => l.nome);

function desenharMov(sentido) {
  const alvo = $(sentido === 'entrada' ? 'qcEntradaCorpo' : 'qcSaidaCorpo');
  // um formulário só na página: o da outra tela sai (os ids se repetiriam)
  $(sentido === 'entrada' ? 'qcSaidaCorpo' : 'qcEntradaCorpo').innerHTML = '';
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  if (!localQc()) return semLocal(alvo);
  const ent = sentido === 'entrada';
  const tipos = ent ? TIPOS_ENTRADA : TIPOS_SAIDA;
  const sd = saldos();
  const doMes = movimentos().filter(m => m.sentido === sentido && String(m.data).slice(0, 7) === mesLista)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
  alvo.innerHTML = `
  <div class="cartao">
    <h2>${ent ? 'Entrada' : 'Saída'} · Faz. Quebra Cocão</h2>
    <form id="qcForm" autocomplete="off">
      <div class="qc-tipos">${Object.entries(tipos).map(([k, v], n) => `<label class="qc-tipo">
        <input type="radio" name="tipo" value="${k}"${n === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
      <div class="grade">
        <label class="campo">Data <input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}" required></label>
        <label class="campo">Produto <input type="text" name="produto" list="qcProdutos" required placeholder="digite o nome"></label>
        <label class="campo">Quantidade <input type="text" name="qtd" inputmode="decimal" required placeholder="0">
          <small class="qc-saldo-hint" id="qcHint"></small></label>
        <label class="campo">Nº do documento${ent ? ' / NF' : ' *'} <input type="text" name="documento"${ent ? '' : ' required'}></label>
        ${ent ? `
        <label class="campo qc-so" data-so="compra">Fornecedor <input type="text" name="fornecedor" list="qcFornec"></label>
        <label class="campo qc-so" data-so="transferencia">Fazenda de origem *
          <select name="outra"><option value="">—</option>${outrasFazendas().map(n => `<option>${esc(n)}</option>`).join('')}<option>Outra</option></select></label>`
        : `
        <label class="campo qc-so" data-so="uso">Plantio * <input type="text" name="plantio" list="qcPlantios" placeholder="ex.: Batata PL 21"></label>
        <label class="campo">Operador * <input type="text" name="operador" list="qcOperadores" required></label>
        <label class="campo qc-so" data-so="transferencia">Fazenda de destino *
          <select name="outra"><option value="">—</option>${outrasFazendas().map(n => `<option>${esc(n)}</option>`).join('')}<option>Outra</option></select></label>`}
        <label class="campo plena">Observação <input type="text" name="obs"></label>
      </div>
      <datalist id="qcProdutos">${opcoesItens()}</datalist>
      <datalist id="qcFornec">${unicos('fornecedor').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcPlantios">${unicos('plantio').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcOperadores">${unicos('operador').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <div class="barra fim"><button class="btn principal" type="submit">Lançar ${ent ? 'entrada' : 'saída'}</button></div>
    </form>
  </div>
  <div class="cartao">
    <div class="barra entre">
      <h2 style="margin:0">${ent ? 'Entradas' : 'Saídas'} do mês</h2>
      <label class="campo" style="margin:0"><input type="month" id="qcMes" value="${esc(mesLista)}" max="${hojeISO().slice(0, 7)}"></label>
    </div>
    <div class="lista">${doMes.map(m => {
      const i = itemDe(m.item_id);
      return `<div class="item"><span></span>
        <div><div class="nome">${esc(i.nome)} <span class="tag ${ent ? 'ativo' : 'alerta'}">${esc(tipos[m.tipo] || m.tipo)}</span></div>
          <div class="sub">${dataBR(m.data)} · ${detalhe(m)}${m.criado_por ? ' · lançado por ' + esc(m.criado_por) : ''}</div></div>
        <div class="acoes"><strong class="${ent ? 'qc-ent' : 'qc-sai'}">${ent ? '+' : '−'}${esc(mostrarNumero(m.quantidade))} ${esc(i.unidade || '')}</strong>
          <button class="btn mini" type="button" data-tirar="${esc(m.id)}" title="Tirar este lançamento">Tirar</button></div>
      </div>`;
    }).join('') || '<div class="vazio">Nada lançado neste mês.</div>'}</div>
  </div>`;

  const form = $('qcForm');
  const mostrarTipo = () => {
    const t = form.querySelector('[name=tipo]:checked').value;
    form.querySelectorAll('.qc-so').forEach(el => { el.hidden = el.dataset.so !== t; });
  };
  form.querySelectorAll('[name=tipo]').forEach(r => r.addEventListener('change', mostrarTipo));
  mostrarTipo();
  form.querySelector('[name=produto]').addEventListener('input', e => {
    const it = itensOrdenados().find(i => semAcento(i.nome) === semAcento(e.target.value));
    $('qcHint').textContent = it ? `saldo atual: ${mostrarNumero(Math.round((sd.get(it.id) || 0) * 1000) / 1000)} ${it.unidade || ''}` : '';
  });
  form.addEventListener('submit', e => { e.preventDefault(); lancar(sentido, form); });
  $('qcMes').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesLista = e.target.value; desenharMov(sentido); } });
  alvo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
    const m = movimentos().find(x => x.id === b.dataset.tirar);
    if (!m || !confirm('Tirar este lançamento? O saldo do item volta como estava.')) return;
    await gravar('est_movimentos', Object.assign({}, m, { ativo: false }));
    desenharMov(sentido);
  }));
}

async function lancar(sentido, form) {
  const f = new FormData(form);
  const tipo = f.get('tipo');
  const nome = String(f.get('produto') || '').trim();
  const qtd = lerNumero(f.get('qtd'));
  const item = itensOrdenados().find(i => semAcento(i.nome) === semAcento(nome));
  const txt = k => String(f.get(k) || '').trim() || null;
  if (!item) return cadastrarNaHora(nome, sentido, form);
  if (Number.isNaN(qtd) || !qtd || qtd <= 0) { aviso('Quantidade: use um número maior que zero (ex.: 20 ou 2,5).', true); return; }
  if (sentido === 'saida') {
    if (!txt('documento')) { aviso('Informe o nº do documento.', true); return; }
    if (!txt('operador')) { aviso('Informe o operador.', true); return; }
    if (tipo === 'uso' && !txt('plantio')) { aviso('Informe o plantio.', true); return; }
  }
  if (tipo === 'transferencia' && !txt('outra')) { aviso(sentido === 'saida' ? 'Escolha a fazenda de destino.' : 'Escolha a fazenda de origem.', true); return; }
  const saldo = saldos().get(item.id) || 0;
  if (sentido === 'saida' && qtd > saldo + 0.0001
    && !confirm(`O saldo de ${item.nome} é ${mostrarNumero(saldo)}. Lançar a saída de ${mostrarNumero(qtd)} mesmo assim? O saldo fica negativo.`)) return;
  await gravar('est_movimentos', {
    local_id: localQc().id, data: f.get('data') || hojeISO(), sentido, tipo, item_id: item.id, quantidade: qtd,
    documento: txt('documento'), plantio: sentido === 'saida' && tipo === 'uso' ? txt('plantio') : null,
    operador: sentido === 'saida' ? txt('operador') : null,
    outra_fazenda: tipo === 'transferencia' ? txt('outra') : null,
    fornecedor: sentido === 'entrada' && tipo === 'compra' ? txt('fornecedor') : null,
    obs: txt('obs'), criado_por: meuNome(), ativo: true,
  });
  aviso(`${sentido === 'entrada' ? 'Entrada' : 'Saída'} lançada: ${item.nome} ${mostrarNumero(qtd)} ${item.unidade || ''}.`);
  mesLista = String(f.get('data') || hojeISO()).slice(0, 7);
  desenharMov(sentido);
}

function cadastrarNaHora(nome, sentido, form) {
  if (!nome) return;
  window.abrirModal('Produto novo', `
    <p><strong>${esc(nome)}</strong> ainda não está no cadastro de itens. Cadastrar agora?</p>
    <div class="grade">
      <label class="campo">Unidade <select id="qnUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Categoria <select id="qnGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" id="qnNao">Corrigir o nome</button>
      <button class="btn principal" type="button" id="qnSim">Cadastrar e lançar</button></div>`, corpo => {
    corpo.querySelector('#qnNao').onclick = window.fecharModal;
    corpo.querySelector('#qnSim').onclick = async () => {
      await gravar('est_itens', { nome: nome.replace(/\s+/g, ' '), unidade: corpo.querySelector('#qnUni').value,
        grupo: corpo.querySelector('#qnGrupo').value, ativo: true });
      window.fecharModal();
      lancar(sentido, form);
    };
  });
}

/* ===================================================================
   ligação com o app.js
   =================================================================== */
const DESENHOS = { qcVisao: desenharVisao, qcEntrada: () => desenharMov('entrada'), qcSaida: () => desenharMov('saida') };
export function abrirQc(tela) { telaAberta = tela; (DESENHOS[tela] || (() => {}))(); }
export function soltarQc() {
  telaAberta = null;
  for (const id of ['qcEntradaCorpo', 'qcSaidaCorpo']) { const el = $(id); if (el) el.innerHTML = ''; }
}

window.addEventListener('estoque-dados', () => {
  if (!telaAberta || !DESENHOS[telaAberta]) return;
  const foco = document.activeElement;
  // nunca redesenha com um formulário sendo preenchido
  if (foco && foco.closest && foco.closest('#qcForm, #qcVisaoCorpo') && /INPUT|SELECT|TEXTAREA/.test(foco.tagName)) return;
  const form = $('qcForm');
  if (form && [...form.querySelectorAll('input[type=text]')].some(i => i.value)) return;
  if (document.querySelector('#modal') && !document.querySelector('#modal.oculto')) return;
  DESENHOS[telaAberta]();
});
