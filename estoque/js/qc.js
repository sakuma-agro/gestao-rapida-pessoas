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
   Entradas e saídas — vários produtos num lançamento só (15/10/2026)
   Pedido dele: entradas e saídas com mais de 10 produtos. O cabeçalho (tipo,
   data, documento, plantio, operador, fazenda) é preenchido UMA vez e os
   produtos vão em linhas: produto + quantidade, Enter pula para a próxima,
   uma linha nova aparece sozinha. Dá também para colar a lista da NF.
   Cada linha vira um movimento; todos levam o mesmo lancamento_id.
   =================================================================== */
const outrasFazendas = () => locais().filter(l => !semAcento(l.nome).includes('QUEBRA COCAO')).map(l => l.nome);
const itemPorNome = nome => itensOrdenados().find(i => semAcento(i.nome) === semAcento(nome));
const LINHAS_INICIAIS = 6;
let abertos = new Set();     // lançamentos expandidos na lista do mês

function linhaProduto() {
  return `<div class="qc-lin">
    <input type="text" class="qc-prod" list="qcProdutos" placeholder="produto" autocomplete="off" enterkeyhint="next">
    <input type="text" class="qc-qtd" inputmode="decimal" placeholder="qtd" autocomplete="off" enterkeyhint="next">
    <button type="button" class="cl-tirar qc-x" title="Tirar a linha" aria-label="Tirar a linha">×</button>
    <small class="qc-info"></small>
  </div>`;
}

function desenharMov(sentido) {
  const alvo = $(sentido === 'entrada' ? 'qcEntradaCorpo' : 'qcSaidaCorpo');
  // um formulário só na página: o da outra tela sai (os ids se repetiriam)
  $(sentido === 'entrada' ? 'qcSaidaCorpo' : 'qcEntradaCorpo').innerHTML = '';
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  if (!localQc()) return semLocal(alvo);
  const ent = sentido === 'entrada';
  const tipos = ent ? TIPOS_ENTRADA : TIPOS_SAIDA;
  alvo.innerHTML = `
  <div class="cartao">
    <h2>${ent ? 'Entrada' : 'Saída'} · Faz. Quebra Cocão</h2>
    <form id="qcForm" autocomplete="off">
      <div class="qc-tipos">${Object.entries(tipos).map(([k, v], n) => `<label class="qc-tipo">
        <input type="radio" name="tipo" value="${k}"${n === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
      <div class="grade">
        <label class="campo">Data <input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}" required></label>
        <label class="campo">Nº do documento${ent ? ' / NF' : ' *'} <input type="text" name="documento"></label>
        ${ent ? `
        <label class="campo qc-so" data-so="compra">Fornecedor <input type="text" name="fornecedor" list="qcFornec"></label>
        <label class="campo qc-so" data-so="transferencia">Fazenda de origem *
          <select name="outra"><option value="">—</option>${outrasFazendas().map(n => `<option>${esc(n)}</option>`).join('')}<option>Outra</option></select></label>`
        : `
        <label class="campo qc-so" data-so="uso">Plantio * <input type="text" name="plantio" list="qcPlantios" placeholder="ex.: Batata PL 21"></label>
        <label class="campo">Operador * <input type="text" name="operador" list="qcOperadores"></label>
        <label class="campo qc-so" data-so="transferencia">Fazenda de destino *
          <select name="outra"><option value="">—</option>${outrasFazendas().map(n => `<option>${esc(n)}</option>`).join('')}<option>Outra</option></select></label>`}
        <label class="campo plena">Observação <input type="text" name="obs"></label>
      </div>
      <div class="barra entre qc-prod-cab">
        <h3 class="es-secao" style="margin:0">Produtos <small id="qcConta">0</small></h3>
        <button type="button" class="btn mini" id="qcColar">Colar lista</button>
      </div>
      <div class="qc-lins" id="qcLins">${Array.from({ length: LINHAS_INICIAIS }, linhaProduto).join('')}</div>
      <div class="barra entre">
        <button type="button" class="btn mini" id="qcMais">+ linha</button>
        <button class="btn principal" type="submit" id="qcEnviar">Lançar ${ent ? 'entrada' : 'saída'}</button>
      </div>
      <datalist id="qcProdutos">${itensOrdenados().map(i => `<option value="${esc(i.nome)}">${esc(i.unidade || '')} · ${esc(i.grupo || '')}</option>`).join('')}</datalist>
      <datalist id="qcFornec">${unicos('fornecedor').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcPlantios">${unicos('plantio').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcOperadores">${unicos('operador').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
    </form>
  </div>
  <div class="cartao" id="qcListaCartao"></div>`;

  const form = $('qcForm');
  const mostrarTipo = () => {
    const t = form.querySelector('[name=tipo]:checked').value;
    form.querySelectorAll('.qc-so').forEach(el => { el.hidden = el.dataset.so !== t; });
  };
  form.querySelectorAll('[name=tipo]').forEach(r => r.addEventListener('change', mostrarTipo));
  mostrarTipo();
  ligarLinhas(sentido);
  $('qcMais').onclick = () => { $('qcLins').insertAdjacentHTML('beforeend', linhaProduto()); ligarLinhas(sentido); };
  $('qcColar').onclick = () => colarLista(sentido);
  form.addEventListener('submit', e => { e.preventDefault(); lancar(sentido, form); });
  desenharListaMes(sentido);
}

/** Liga as linhas de produto (as novas também): Enter pula, saldo aparece, linha nova sozinha. */
function ligarLinhas(sentido) {
  const sd = saldos();
  document.querySelectorAll('#qcLins .qc-lin:not([data-ok])').forEach(lin => {
    lin.dataset.ok = '1';
    const prod = lin.querySelector('.qc-prod'), qtd = lin.querySelector('.qc-qtd'), info = lin.querySelector('.qc-info');
    const atualizar = () => {
      const it = itemPorNome(prod.value);
      lin.classList.toggle('desconhecido', !!prod.value.trim() && !it);
      info.textContent = !prod.value.trim() ? '' : it
        ? `${it.unidade || ''} · saldo ${mostrarNumero(Math.round((sd.get(it.id) || 0) * 1000) / 1000)}`
        : 'não está no cadastro';
      contar();
      // a última linha preenchida abre uma nova
      const todas = [...document.querySelectorAll('#qcLins .qc-lin')];
      if (todas[todas.length - 1] === lin && prod.value.trim()) {
        $('qcLins').insertAdjacentHTML('beforeend', linhaProduto()); ligarLinhas(sentido);
      }
    };
    prod.addEventListener('input', atualizar);
    prod.addEventListener('change', atualizar);
    qtd.addEventListener('input', contar);
    prod.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); qtd.focus(); } });
    qtd.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = lin.nextElementSibling;
      if (prox) prox.querySelector('.qc-prod').focus();
    });
    lin.querySelector('.qc-x').onclick = () => {
      if (document.querySelectorAll('#qcLins .qc-lin').length > 1) lin.remove();
      else { prod.value = ''; qtd.value = ''; info.textContent = ''; }
      contar();
    };
  });
  contar();
}

function linhasPreenchidas() {
  return [...document.querySelectorAll('#qcLins .qc-lin')]
    .map(lin => ({ lin, nome: lin.querySelector('.qc-prod').value.trim(), txt: lin.querySelector('.qc-qtd').value.trim() }))
    .filter(x => x.nome || x.txt);
}
function contar() {
  const n = linhasPreenchidas().filter(x => x.nome).length;
  const el = $('qcConta');
  if (el) el.textContent = n;
  const b = $('qcEnviar');
  if (b) b.textContent = b.textContent.replace(/ \(\d+\)$/, '') + (n ? ` (${n})` : '');
}

/** Cola a lista (da NF, de uma planilha): "produto ; quantidade" ou produto[tab]quantidade, uma por linha. */
function colarLista(sentido) {
  window.abrirModal('Colar lista de produtos', `
    <p class="dica">Uma linha por produto: o nome e a quantidade, separados por ponto e vírgula ou colados de duas colunas
      da planilha.</p>
    <pre class="cad-exemplo">Afalon ; 20
Atrazina ; 15,5
Luva nitrílica ; 30</pre>
    <label class="campo plena">Lista <textarea id="clTexto" rows="10" placeholder="Cole aqui..."></textarea></label>
    <div class="barra fim"><button class="btn principal" type="button" id="clOk">Pôr na lista</button></div>`, corpo => {
    corpo.querySelector('#clOk').onclick = () => {
      const linhas = corpo.querySelector('#clTexto').value.split(/\r?\n/)
        .map(l => l.split(/\s*[;\t]\s*/)).filter(p => (p[0] || '').trim());
      // tira as linhas vazias do formulário e põe as coladas
      document.querySelectorAll('#qcLins .qc-lin').forEach(lin => {
        if (!lin.querySelector('.qc-prod').value.trim() && !lin.querySelector('.qc-qtd').value.trim()) lin.remove();
      });
      for (const p of linhas) {
        $('qcLins').insertAdjacentHTML('beforeend', linhaProduto());
        const lin = $('qcLins').lastElementChild;
        lin.querySelector('.qc-prod').value = p[0].trim().replace(/\s+/g, ' ');
        lin.querySelector('.qc-qtd').value = (p[1] || '').trim();
      }
      $('qcLins').insertAdjacentHTML('beforeend', linhaProduto());
      window.fecharModal();
      ligarLinhas(sentido);
      document.querySelectorAll('#qcLins .qc-prod').forEach(i => i.dispatchEvent(new Event('change')));
      aviso(`${linhas.length} produto(s) na lista. Confira e lance.`);
    };
  });
}

async function lancar(sentido, form) {
  const f = new FormData(form);
  const tipo = f.get('tipo');
  const txt = k => String(f.get(k) || '').trim() || null;
  const preenchidas = linhasPreenchidas();
  if (!preenchidas.length) { aviso('Ponha pelo menos um produto.', true); return; }

  // confere as linhas: produto cadastrado e quantidade válida
  const erros = [];
  const desconhecidos = new Map();
  const linhas = [];
  for (const x of preenchidas) {
    x.lin.classList.remove('erro');
    const item = itemPorNome(x.nome);
    const qtd = lerNumero(x.txt);
    if (!x.nome) { x.lin.classList.add('erro'); erros.push('linha sem produto'); continue; }
    if (!item) { desconhecidos.set(semAcento(x.nome), x.nome); continue; }
    if (Number.isNaN(qtd) || !qtd || qtd <= 0) { x.lin.classList.add('erro'); erros.push(`${item.nome}: quantidade`); continue; }
    linhas.push({ item, qtd });
  }
  if (desconhecidos.size) return cadastrarNaHora([...desconhecidos.values()], sentido, form);
  if (erros.length) { aviso(`Confira as linhas em vermelho (${erros.length}): quantidade maior que zero.`, true); return; }
  if (sentido === 'saida') {
    if (!txt('documento')) { aviso('Informe o nº do documento.', true); return; }
    if (!txt('operador')) { aviso('Informe o operador.', true); return; }
    if (tipo === 'uso' && !txt('plantio')) { aviso('Informe o plantio.', true); return; }
  }
  if (tipo === 'transferencia' && !txt('outra')) { aviso(sentido === 'saida' ? 'Escolha a fazenda de destino.' : 'Escolha a fazenda de origem.', true); return; }

  if (sentido === 'saida') {
    const sd = saldos();
    const soma = new Map();
    for (const l of linhas) soma.set(l.item.id, (soma.get(l.item.id) || 0) + l.qtd);
    const falta = [...soma.entries()].filter(([id, q]) => q > (sd.get(id) || 0) + 0.0001)
      .map(([id, q]) => `${itemDe(id).nome}: sai ${mostrarNumero(q)}, saldo ${mostrarNumero(sd.get(id) || 0)}`);
    if (falta.length && !confirm(`Estes itens ficam com saldo negativo:\n\n${falta.join('\n')}\n\nLançar mesmo assim?`)) return;
  }

  $('qcEnviar').disabled = true;
  const lancamento = crypto.randomUUID();
  const base = {
    local_id: localQc().id, data: f.get('data') || hojeISO(), sentido, tipo,
    documento: txt('documento'), plantio: sentido === 'saida' && tipo === 'uso' ? txt('plantio') : null,
    operador: sentido === 'saida' ? txt('operador') : null,
    outra_fazenda: tipo === 'transferencia' ? txt('outra') : null,
    fornecedor: sentido === 'entrada' && tipo === 'compra' ? txt('fornecedor') : null,
    obs: txt('obs'), criado_por: meuNome(), ativo: true, lancamento_id: lancamento,
  };
  for (const l of linhas) await gravar('est_movimentos', Object.assign({}, base, { item_id: l.item.id, quantidade: l.qtd }));
  aviso(`${sentido === 'entrada' ? 'Entrada' : 'Saída'} lançada: ${linhas.length} produto(s).`);
  mesLista = String(base.data).slice(0, 7);
  abertos.add(lancamento);
  desenharMov(sentido);
}

/** Produtos que não estão no cadastro: cadastra todos de uma vez e segue. */
function cadastrarNaHora(nomes, sentido, form) {
  window.abrirModal('Produtos novos', `
    <p>${nomes.length === 1 ? 'Este produto ainda não está' : `Estes ${nomes.length} produtos ainda não estão`} no cadastro de itens:</p>
    <ul class="ct-branco">${nomes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    <div class="grade">
      <label class="campo">Unidade <select id="qnUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Categoria <select id="qnGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
    </div>
    <p class="dc-sem">Se for erro de digitação, volte e corrija o nome na linha.</p>
    <div class="barra fim"><button class="btn" type="button" id="qnNao">Corrigir os nomes</button>
      <button class="btn principal" type="button" id="qnSim">Cadastrar e lançar</button></div>`, corpo => {
    corpo.querySelector('#qnNao').onclick = window.fecharModal;
    corpo.querySelector('#qnSim').onclick = async () => {
      for (const nome of nomes) await gravar('est_itens', { nome: nome.replace(/\s+/g, ' '), unidade: corpo.querySelector('#qnUni').value,
        grupo: corpo.querySelector('#qnGrupo').value, ativo: true });
      window.fecharModal();
      lancar(sentido, form);
    };
  });
}

/** Lançamentos do mês, agrupados: um cartão por lançamento (NF/requisição), com os itens dentro. */
function desenharListaMes(sentido) {
  const alvo = $('qcListaCartao');
  if (!alvo) return;
  const ent = sentido === 'entrada';
  const tipos = ent ? TIPOS_ENTRADA : TIPOS_SAIDA;
  const doMes = movimentos().filter(m => m.sentido === sentido && String(m.data).slice(0, 7) === mesLista);
  const grupos = new Map();
  for (const m of doMes) {
    const k = m.lancamento_id || m.id;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  const lista = [...grupos.entries()].sort((a, b) => String(b[1][0].data).localeCompare(String(a[1][0].data))
    || String(b[1][0].atualizado_em).localeCompare(String(a[1][0].atualizado_em)));
  alvo.innerHTML = `
    <div class="barra entre">
      <h2 style="margin:0">${ent ? 'Entradas' : 'Saídas'} do mês</h2>
      <label class="campo" style="margin:0"><input type="month" id="qcMes" value="${esc(mesLista)}" max="${hojeISO().slice(0, 7)}"></label>
    </div>
    <div class="lista">${lista.map(([k, ms]) => {
      const m = ms[0];
      const aberto = abertos.has(k);
      return `<div class="qc-lanc">
        <button type="button" class="qc-lanc-cab" data-abre="${esc(k)}" aria-expanded="${aberto}">
          <span><b>${dataBR(m.data)} · ${esc(tipos[m.tipo] || m.tipo)}</b> · ${ms.length} produto(s)
            <small>${detalhe(m)}${m.criado_por ? ' · lançado por ' + esc(m.criado_por) : ''}</small></span>
          <span class="qc-seta">${aberto ? '▾' : '▸'}</span>
        </button>
        <div class="qc-lanc-itens"${aberto ? '' : ' hidden'}>${ms.map(x => { const i = itemDe(x.item_id); return `<div class="qc-lanc-item">
          <span>${esc(i.nome)}</span><strong class="${ent ? 'qc-ent' : 'qc-sai'}">${ent ? '+' : '−'}${esc(mostrarNumero(x.quantidade))} ${esc(i.unidade || '')}</strong>
          <button class="btn mini" type="button" data-tirar="${esc(x.id)}">Tirar</button></div>`; }).join('')}
          ${ms.length > 1 ? `<div class="barra fim"><button class="btn mini" type="button" data-tirar-tudo="${esc(k)}">Tirar o lançamento inteiro</button></div>` : ''}
        </div>
      </div>`;
    }).join('') || '<div class="vazio">Nada lançado neste mês.</div>'}</div>`;
  $('qcMes').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesLista = e.target.value; desenharListaMes(sentido); } });
  alvo.querySelectorAll('[data-abre]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.abre;
    if (abertos.has(k)) abertos.delete(k); else abertos.add(k);
    desenharListaMes(sentido);
  }));
  alvo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
    const m = movimentos().find(x => x.id === b.dataset.tirar);
    if (!m || !confirm(`Tirar ${itemDe(m.item_id).nome} deste lançamento? O saldo volta como estava.`)) return;
    await gravar('est_movimentos', Object.assign({}, m, { ativo: false }));
    desenharListaMes(sentido);
  }));
  alvo.querySelectorAll('[data-tirar-tudo]').forEach(b => b.addEventListener('click', async () => {
    const ms = movimentos().filter(x => (x.lancamento_id || x.id) === b.dataset.tirarTudo);
    if (!confirm(`Tirar o lançamento inteiro (${ms.length} produtos)? Os saldos voltam como estavam.`)) return;
    for (const m of ms) await gravar('est_movimentos', Object.assign({}, m, { ativo: false }));
    desenharListaMes(sentido);
  }));
}

/* ===================================================================
   Movimentações — painel consolidado (pedido dele, 15/10/2026): todas as
   entradas e saídas em ordem de data, com filtros, totais e impressão.
   =================================================================== */
const pf = { de: hojeISO().slice(0, 8) + '01', ate: hojeISO(), sentido: '', tipo: '', grupo: '', texto: '' };

function filtrados() {
  const t = semAcento(pf.texto);
  return movimentos().filter(m => {
    const d = String(m.data).slice(0, 10);
    if (pf.de && d < pf.de) return false;
    if (pf.ate && d > pf.ate) return false;
    if (pf.sentido && m.sentido !== pf.sentido) return false;
    if (pf.tipo && m.tipo !== pf.tipo) return false;
    const i = itemDe(m.item_id);
    if (pf.grupo && (i.grupo || 'Outros') !== pf.grupo) return false;
    if (t && ![i.nome, m.documento, m.plantio, m.operador, m.outra_fazenda, m.fornecedor, m.obs]
      .some(v => semAcento(v).includes(t))) return false;
    return true;
  }).sort((a, b) => String(b.data).localeCompare(String(a.data))
    || String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')));
}

const nomeTipo = m => (m.sentido === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA)[m.tipo] || m.tipo;

function desenharPainel() {
  const alvo = $('qcPainelCorpo');
  if (!pronto()) { alvo.innerHTML = '<div class="cartao"><div class="vazio">Abrindo…</div></div>'; return; }
  if (!localQc()) return semLocal(alvo);
  $('qcPainelFolha').innerHTML = '';
  const lista = filtrados();
  const ent = lista.filter(m => m.sentido === 'entrada'), sai = lista.filter(m => m.sentido === 'saida');
  const lancs = l => new Set(l.map(m => m.lancamento_id || m.id)).size;
  const grupos = [...new Set(itensOrdenados().map(i => i.grupo || 'Outros'))];
  const tipos = pf.sentido === 'entrada' ? TIPOS_ENTRADA : pf.sentido === 'saida' ? TIPOS_SAIDA
    : { ...TIPOS_ENTRADA, uso: 'Uso' };
  let dia = null;
  alvo.innerHTML = `
  <div class="cartao">
    <h2>Movimentações · Faz. Quebra Cocão</h2>
    <p class="dica">Todas as entradas e saídas, da mais nova para a mais antiga.</p>
    <div class="grade">
      <label class="campo">De <input type="date" id="pfDe" value="${esc(pf.de)}"></label>
      <label class="campo">Até <input type="date" id="pfAte" value="${esc(pf.ate)}"></label>
      <label class="campo">Entradas e saídas <select id="pfSentido">
        <option value="">Todas</option><option value="entrada"${pf.sentido === 'entrada' ? ' selected' : ''}>Só entradas</option>
        <option value="saida"${pf.sentido === 'saida' ? ' selected' : ''}>Só saídas</option></select></label>
      <label class="campo">Tipo <select id="pfTipo"><option value="">Todos</option>${Object.entries(tipos).map(([k, v]) =>
        `<option value="${k}"${pf.tipo === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="campo">Categoria <select id="pfGrupo"><option value="">Todas</option>${grupos.map(g =>
        `<option${pf.grupo === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="campo">Procurar <input type="text" id="pfTexto" value="${esc(pf.texto)}" placeholder="produto, documento, plantio, operador…"></label>
    </div>
    <div class="ct-chips">
      ${[['mes', 'Este mês'], ['30', 'Últimos 30 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo']].map(([k, v]) =>
        `<button type="button" class="ct-chip" data-periodo="${k}">${v}</button>`).join('')}
    </div>
    <div class="es-cards">
      <div class="es-card es-ok"><span>Entradas</span><strong>${ent.length}</strong><small>itens em ${lancs(ent)} lançamento(s)</small></div>
      <div class="es-card es-sobra"><span>Saídas</span><strong>${sai.length}</strong><small>itens em ${lancs(sai)} lançamento(s)</small></div>
      <div class="es-card es-transf"><span>Transferências</span><strong>${lista.filter(m => m.tipo === 'transferencia').length}</strong><small>entrando e saindo</small></div>
      <div class="es-card"><span>Produtos diferentes</span><strong>${new Set(lista.map(m => m.item_id)).size}</strong><small>no período</small></div>
    </div>
    <div class="barra fim" style="margin-top:10px">
      <button class="btn" type="button" id="pfCsv"${lista.length ? '' : ' disabled'}>Baixar planilha</button>
      <button class="btn" type="button" id="pfImprimir"${lista.length ? '' : ' disabled'}>Imprimir</button>
    </div>
  </div>
  <div class="cartao">
    <div class="qc-mov">${lista.map(m => {
      const i = itemDe(m.item_id);
      const d = String(m.data).slice(0, 10);
      const cab = d !== dia ? `<h3 class="es-secao">${esc(dataBR(dia = d))} <small>${esc(new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long' }))}</small></h3>` : '';
      const e = m.sentido === 'entrada';
      return cab + `<div class="qc-mov-lin ${e ? 'ent' : 'sai'}">
        <span class="qc-mov-sinal">${e ? 'E' : 'S'}</span>
        <div class="qc-mov-txt"><b>${esc(i.nome)}</b> <span class="tag ${e ? 'ativo' : 'alerta'}">${esc(nomeTipo(m))}</span>
          <small>${detalhe(m)}</small></div>
        <strong class="${e ? 'qc-ent' : 'qc-sai'}">${e ? '+' : '−'}${esc(mostrarNumero(m.quantidade))} ${esc(i.unidade || '')}</strong>
      </div>`;
    }).join('') || '<div class="vazio">Nenhuma movimentação com esses filtros.</div>'}</div>
  </div>`;

  const refaz = () => desenharPainel();
  $('pfDe').onchange = e => { pf.de = e.target.value; refaz(); };
  $('pfAte').onchange = e => { pf.ate = e.target.value; refaz(); };
  $('pfSentido').onchange = e => { pf.sentido = e.target.value; pf.tipo = ''; refaz(); };
  $('pfTipo').onchange = e => { pf.tipo = e.target.value; refaz(); };
  $('pfGrupo').onchange = e => { pf.grupo = e.target.value; refaz(); };
  $('pfTexto').oninput = e => {
    pf.texto = e.target.value; const pos = e.target.selectionStart;
    refaz(); const el = $('pfTexto'); el.focus(); el.setSelectionRange(pos, pos);
  };
  alvo.querySelectorAll('[data-periodo]').forEach(b => b.onclick = () => {
    const hoje = hojeISO();
    if (b.dataset.periodo === 'mes') { pf.de = hoje.slice(0, 8) + '01'; pf.ate = hoje; }
    if (b.dataset.periodo === '30') { const d = new Date(); d.setDate(d.getDate() - 30); pf.de = d.toISOString().slice(0, 10); pf.ate = hoje; }
    if (b.dataset.periodo === 'ano') { pf.de = hoje.slice(0, 4) + '-01-01'; pf.ate = hoje; }
    if (b.dataset.periodo === 'tudo') { pf.de = ''; pf.ate = ''; }
    refaz();
  });
  $('pfCsv')?.addEventListener('click', () => baixarCsv(lista));
  $('pfImprimir')?.addEventListener('click', () => { montarFolhaMov(lista); setTimeout(() => window.print(), 50); });
}

const periodoTxt = () => pf.de || pf.ate ? `${pf.de ? dataBR(pf.de) : 'início'} a ${pf.ate ? dataBR(pf.ate) : 'hoje'}` : 'todo o período';

function baixarCsv(lista) {
  const c = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Entrada/Saída', 'Tipo', 'Produto', 'Categoria', 'Quantidade', 'Unidade', 'Documento',
    'Plantio', 'Operador', 'Fazenda (origem/destino)', 'Fornecedor', 'Observação', 'Lançado por']]
    .concat(lista.map(m => { const i = itemDe(m.item_id); return [dataBR(m.data), m.sentido === 'entrada' ? 'Entrada' : 'Saída',
      nomeTipo(m), i.nome, i.grupo || '', String(m.quantidade).replace('.', ','), i.unidade || '', m.documento, m.plantio,
      m.operador, m.outra_fazenda, m.fornecedor, m.obs, m.criado_por]; }));
  const blob = new Blob(['﻿' + linhas.map(l => l.map(c).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `movimentacoes-quebra-cocao-${(pf.de || 'inicio')}_${(pf.ate || 'hoje')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function montarFolhaMov(lista) {
  $('qcPainelFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Movimentações do Estoque — Faz. Quebra Cocão</h1>
        <p>${esc(periodoTxt())} · ${lista.length} lançamento(s) · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p></div></div>
    <table class="rel-tab rel-mov" style="margin-top:6mm"><thead><tr><th class="ce">Data</th><th class="ce">E/S</th><th>Tipo</th><th>Produto</th>
      <th class="ce">Qtd.</th><th>Documento</th><th>Plantio / Operador / Fazenda</th></tr></thead>
    <tbody>${lista.map(m => { const i = itemDe(m.item_id); return `<tr><td class="ce">${esc(dataBR(m.data))}</td>
      <td class="ce">${m.sentido === 'entrada' ? 'E' : 'S'}</td><td>${esc(nomeTipo(m))}</td><td>${esc(i.nome)}</td>
      <td class="ce">${m.sentido === 'entrada' ? '+' : '−'}${esc(mostrarNumero(m.quantidade))} ${esc(i.unidade || '')}</td>
      <td>${esc(m.documento || '')}</td><td>${esc([m.plantio, m.operador, m.outra_fazenda, m.fornecedor].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</tbody></table>
    <div class="rel-pe"><div class="rel-assina"><span></span><small>Responsável pelo estoque</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ===================================================================
   ligação com o app.js
   =================================================================== */
const DESENHOS = { qcVisao: desenharVisao, qcPainel: desenharPainel, qcEntrada: () => desenharMov('entrada'), qcSaida: () => desenharMov('saida') };
export function abrirQc(tela) { telaAberta = tela; (DESENHOS[tela] || (() => {}))(); }
export function soltarQc() {
  telaAberta = null;
  for (const id of ['qcEntradaCorpo', 'qcSaidaCorpo']) { const el = $(id); if (el) el.innerHTML = ''; }
}

window.addEventListener('estoque-dados', () => {
  if (!telaAberta || !DESENHOS[telaAberta]) return;
  const foco = document.activeElement;
  // nunca redesenha com um formulário sendo preenchido
  if (foco && foco.closest && foco.closest('#qcForm, #qcVisaoCorpo, #qcPainelCorpo') && /INPUT|SELECT|TEXTAREA/.test(foco.tagName)) return;
  const form = $('qcForm');
  if (form && [...form.querySelectorAll('input[type=text]')].some(i => i.value)) { desenharListaMes(telaAberta === 'qcEntrada' ? 'entrada' : 'saida'); return; }
  if (document.querySelector('#modal') && !document.querySelector('#modal.oculto')) return;
  DESENHOS[telaAberta]();
});
