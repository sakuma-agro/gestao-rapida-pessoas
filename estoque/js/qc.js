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
  lerNumero, mostrarNumero, dataBR, hojeISO, temMinimo as temMinimoGeral, precisaRepor as precisaReporGeral, souAdmin, comMinimoDo, podeLocal, meusLocais, contaNoLocal,
} from './dados.js';
import { lerPlanilhaQc, unidadeDe } from './qc-importar.js';
import { gravar as gravarDireto } from './dados.js';

let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const vazio = v => v === null || v === undefined || v === '';
const TIPOS_ENTRADA = { compra: 'Compra', transferencia: 'Transferência', ajuste: 'Ajuste (balanço)', saldo_inicial: 'Saldo inicial' };
const TIPOS_SAIDA = { uso: 'Uso', transferencia: 'Transferência', ajuste: 'Ajuste (balanço)' };

let telaAberta = null;
let busca = '';
let grupoVisao = '';
let esconderZerados = true;
let mesLista = hojeISO().slice(0, 7);

/** O estoque da Quebra Cocão no cadastro de almoxarifados. */
const localQc = () => { const l = todos('est_locais').find(x => x.ativo !== false && semAcento(x.nome).includes('QUEBRA COCAO')) || null;
  return l && podeLocal(l.id) ? l : null; };   // quem não tem a Quebra Cocão liberada não vê este módulo
/** Produto novo criado aqui só aparece na contagem mensal da Quebra Cocão. */
const soQc = () => { const l = localQc(); return l ? [l.id] : null; };
const movimentos = () => {
  const lc = localQc();
  return lc ? [...new Map(todos('est_movimentos').filter(m => m.local_id === lc.id).map(m => [m.id, m])).values()]
    .filter(m => m.ativo !== false) : [];
};
/* Mínimo da Quebra Cocão, quando ela tem o seu (22/10/2026). */
const precisaRepor = (item, qtd) => precisaReporGeral(comMinimoDo(item, (localQc() || {}).id), qtd);
const temMinimo = item => temMinimoGeral(comMinimoDo(item, (localQc() || {}).id));
const itemDe = id => todos('est_itens').find(i => i.id === id) || { nome: '(item apagado)', unidade: '', grupo: 'Outros' };

/** Saldo de cada item (Map item_id → número). */
function saldos() {
  const m = new Map();
  for (const mv of movimentos()) {
    const q = Number(mv.quantidade) || 0;
    m.set(mv.item_id, (m.get(mv.item_id) || 0) + (mv.sentido === 'entrada' ? q : -q));
  }
  // conta de vírgula (0,1 + 0,2…) deixava "-0" e falso negativo: arredonda em milésimos
  for (const [k, v] of m) m.set(k, Math.round(v * 1000) / 1000 || 0);
  return m;
}
/* ---- valor (21/10/2026, pedido dele) ----
   Na entrada, cada produto leva o valor por unidade (R$/kg, R$/L, R$/un).
   Na saída o valor sai sozinho pelo CUSTO MÉDIO: o app percorre os lançamentos
   do item em ordem de data (entradas antes das saídas no mesmo dia); cada
   entrada com valor entra no custo médio, cada saída sai pelo custo médio do
   momento. Entrada sem valor (planilha antiga, ajuste) entra pelo custo médio
   que já existia. `ate` (AAAA-MM-DD) para o custo numa data. */
const brl = v => vazio(v) || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlU = v => vazio(v) || !isFinite(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
function custos(ate) {
  const itens = new Map(), mov = new Map();
  const lista = movimentos().filter(m => !ate || String(m.data).slice(0, 10) <= ate).sort((a, b) =>
    String(a.data).localeCompare(String(b.data))
    || (a.sentido === b.sentido ? 0 : a.sentido === 'entrada' ? -1 : 1)
    || String(a.atualizado_em || '').localeCompare(String(b.atualizado_em || '')));
  for (const m of lista) {
    let st = itens.get(m.item_id);
    if (!st) itens.set(m.item_id, st = { qtd: 0, qv: 0, valor: 0, medio: null });
    const q = Number(m.quantidade) || 0;
    if (m.sentido === 'entrada') {
      const vu = !vazio(m.valor_unitario) ? Number(m.valor_unitario) : st.medio;
      if (vu !== null) { st.valor += q * vu; st.qv += q; }
      st.qtd += q;
      if (st.qv > 1e-9) st.medio = st.valor / st.qv;
      mov.set(m.id, { vu, total: vu === null ? null : q * vu, digitado: !vazio(m.valor_unitario) });
    } else {
      const vu = st.medio;
      if (vu !== null) { st.valor -= q * vu; st.qv -= q; }
      st.qtd -= q;
      if (st.qv <= 1e-9) { st.qv = 0; st.valor = 0; }
      mov.set(m.id, { vu, total: vu === null ? null : q * vu });
    }
  }
  for (const st of itens.values()) st.emEstoque = st.medio === null ? null : Math.max(0, st.qtd) * st.medio;
  return { itens, mov };
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
  const cu = custos();
  const itens = itensOrdenados().filter(i => sd.has(i.id));
  const b = semAcento(busca);
  const grupos = [...new Set(itens.map(i => i.grupo || 'Outros'))];
  const vistos = itens.filter(i => (!grupoVisao || (i.grupo || 'Outros') === grupoVisao) && (!b || semAcento(i.nome).includes(b))
    && (!esconderZerados || Math.abs(sd.get(i.id)) > 0.0005));
  const zerados = itens.filter(i => Math.abs(sd.get(i.id)) <= 0.0005).length;
  const negativos = itens.filter(i => sd.get(i.id) < -0.0001).length;
  const repor = itens.filter(i => precisaRepor(i, sd.get(i.id))).length;
  let grupo = null;
  alvo.innerHTML = `
  <div class="cartao">
    <h2>Estoque Faz. Quebra Cocão</h2>
    <p class="dica">Saldo de cada item = entradas − saídas lançadas aqui. Não tem ligação com a contagem do mês nem com o acerto.</p>
    <div class="es-cards">
      <div class="es-card es-ok"><span>Itens com movimento</span><strong>${itens.length}</strong><small>${grupos.length} categoria(s)</small></div>
      <div class="es-card es-transf"><span>Valor em estoque</span><strong class="qc-rs">${esc(brl(vistosValor(itens, cu)))}</strong><small>pelo custo médio${semValor(itens, cu, sd) ? ` · ${semValor(itens, cu, sd)} sem valor` : ''}</small></div>
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
      <label class="es-check"><input type="checkbox" id="qcZerados"${esconderZerados ? ' checked' : ''}> esconder os zerados (${zerados})</label>
      <button class="btn principal" type="button" id="qcRelatorio"${itens.length ? '' : ' disabled'}>Emitir relatório</button>
      <button class="btn" type="button" id="qcImprimir"${vistos.length ? '' : ' disabled'}>Imprimir posição</button>
      ${souAdmin() ? `<label class="btn" for="qcImpArq">Importar planilhas antigas</label>
      <input type="file" id="qcImpArq" accept=".xlsx,.xlsm" multiple hidden>` : ''}
    </div>
    <div class="lista">${vistos.map(i => {
      const v = sd.get(i.id);
      const cab = (i.grupo || 'Outros') !== grupo ? `<h3 class="es-secao">${esc(grupo = i.grupo || 'Outros')}</h3>` : '';
      return cab + `<div class="item qc-item" data-extrato="${esc(i.id)}"><span></span>
        <div><div class="nome">${esc(i.nome)}${v < -0.0001 ? ' <span class="tag perigo">negativo</span>'
          : precisaRepor(i, v) ? ' <span class="tag alerta">no mínimo</span>' : ''}</div>
          <div class="sub">${esc(i.unidade || '')}${temMinimo(i) ? ` · mínimo ${esc(mostrarNumero(comMinimoDo(i, localQc().id).estoque_minimo))}` : ''}${(cu.itens.get(i.id) || {}).medio != null ? ` · custo médio ${esc(brlU(cu.itens.get(i.id).medio))}` : ' · sem valor'} · toque para ver o extrato</div></div>
        <div class="acoes" style="text-align:right"><strong class="qc-saldo${v < -0.0001 ? ' neg' : ''}">${esc(mostrarNumero(Math.round(v * 1000) / 1000))}</strong>
          ${(cu.itens.get(i.id) || {}).emEstoque != null && v > 0.0005 ? `<div class="sub">${esc(brl(cu.itens.get(i.id).emEstoque))}</div>` : ''}</div>
      </div>`;
    }).join('') || `<div class="vazio">${movimentos().length ? 'Nada com esse filtro.' : 'Nenhuma entrada ainda. Comece por <strong>Entradas</strong> (use "Saldo inicial" para o que já está no estoque hoje).'}</div>`}</div>
  </div>`;
  alvo.querySelectorAll('[data-qc-g]').forEach(b => b.addEventListener('click', () => { grupoVisao = b.dataset.qcG; desenharVisao(); }));
  $('qcBusca').addEventListener('input', e => {
    busca = e.target.value; const pos = e.target.selectionStart;
    desenharVisao(); const el = $('qcBusca'); el.focus(); el.setSelectionRange(pos, pos);
  });
  alvo.querySelectorAll('[data-extrato]').forEach(el => el.addEventListener('click', () => extrato(el.dataset.extrato)));
  $('qcImprimir')?.addEventListener('click', () => { montarPosicao(vistos, sd, cu); setTimeout(() => window.print(), 50); });
  $('qcRelatorio')?.addEventListener('click', abrirRelatorio);
  $('qcZerados').addEventListener('change', e => { esconderZerados = e.target.checked; desenharVisao(); });
  $('qcImpArq')?.addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) prepararImportacao(fs); });
}

const vistosValor = (itens, cu) => itens.reduce((t, i) => t + ((cu.itens.get(i.id) || {}).emEstoque || 0), 0);
const semValor = (itens, cu, sd) => itens.filter(i => sd.get(i.id) > 0.0005 && (cu.itens.get(i.id) || {}).medio == null).length;

/** Extrato do item: cada entrada e saída, com o saldo correndo. */
function extrato(itemId) {
  const i = itemDe(itemId);
  const mvs = movimentos().filter(m => m.item_id === itemId)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.atualizado_em).localeCompare(String(b.atualizado_em)));
  let saldo = 0;
  const cu = custos();
  const st = cu.itens.get(itemId);
  const linhas = mvs.map(m => {
    const q = Number(m.quantidade) || 0;
    saldo += m.sentido === 'entrada' ? q : -q;
    return { m, q, saldo };
  }).reverse();
  window.abrirModal(`Extrato · ${i.nome}`, `
    <p class="dica">Saldo atual: <strong>${esc(mostrarNumero(Math.round(saldo * 1000) / 1000))} ${esc(i.unidade || '')}</strong>${st && st.medio != null
      ? ` · custo médio <strong>${esc(brlU(st.medio))}</strong> · em estoque <strong>${esc(brl(st.emEstoque))}</strong>` : ' · sem valor lançado'}</p>
    <div class="lista">${linhas.map(({ m, q, saldo: s }) => `<div class="item"><span></span>
      <div><div class="nome">${dataBR(m.data)} · ${m.sentido === 'entrada' ? 'Entrada' : 'Saída'} — ${esc((m.sentido === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA)[m.tipo] || m.tipo)}</div>
        <div class="sub">${detalhe(m)}</div></div>
      <div class="acoes" style="text-align:right"><strong class="${m.sentido === 'entrada' ? 'qc-ent' : 'qc-sai'}">${m.sentido === 'entrada' ? '+' : '−'}${esc(mostrarNumero(q))}</strong>
        <div class="sub">saldo ${esc(mostrarNumero(Math.round(s * 1000) / 1000))}</div>
        ${(cu.mov.get(m.id) || {}).vu != null ? `<div class="sub">${esc(brlU(cu.mov.get(m.id).vu))}${m.sentido === 'saida' || !cu.mov.get(m.id).digitado ? ' (médio)' : ''} · ${esc(brl(cu.mov.get(m.id).total))}</div>` : ''}</div>
    </div>`).join('') || '<div class="vazio">Sem lançamentos.</div>'}</div>`);
}

const detalhe = m => [
  m.documento ? 'doc. ' + esc(m.documento) : '',
  m.plantio ? esc(m.plantio) : '',
  m.equipamento ? 'máquina ' + esc(m.equipamento) : '',
  m.funcionario ? 'para ' + esc(m.funcionario) : '',
  m.operador ? esc(m.operador) : '',
  m.outra_fazenda ? (m.sentido === 'entrada' ? 'de ' : 'para ') + esc(m.outra_fazenda) : '',
  m.fornecedor ? esc(m.fornecedor) : '',
  m.obs ? esc(m.obs) : '',
].filter(Boolean).join(' · ') || '—';

function montarPosicao(itens, sd, cu) {
  const grupos = [];
  for (const i of itens) {
    let g = grupos[grupos.length - 1];
    if (!g || g.nome !== (i.grupo || 'Outros')) grupos.push(g = { nome: i.grupo || 'Outros', linhas: [], valor: 0 });
    const st = cu.itens.get(i.id) || {};
    g.valor += st.emEstoque || 0;
    g.linhas.push([i.nome, i.unidade || '', mostrarNumero(Math.round(sd.get(i.id) * 1000) / 1000), brlU(st.medio), brl(st.emEstoque)]);
  }
  const total = grupos.reduce((t, g) => t + g.valor, 0);
  $('qcFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Posição do Estoque — Faz. Quebra Cocão</h1>
        <p>${itens.length} itens${grupoVisao ? ' · ' + esc(grupoVisao) : ''} · valor em estoque ${esc(brl(total))} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p></div></div>
    ${grupos.map(g => `<h3 class="rel-secao">${esc(g.nome)}</h3>
      <table class="rel-tab"><thead><tr><th>Item</th><th class="ce">Unidade</th><th class="ce">Saldo</th><th class="ce">Custo médio</th><th class="ce">Valor</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr><td>${esc(l[0])}</td><td class="ce">${esc(l[1])}</td><td class="ce">${esc(l[2])}</td><td class="ce">${esc(l[3])}</td><td class="ce">${esc(l[4])}</td></tr>`).join('')}
      <tr class="rel-total"><td colspan="4">Total ${esc(g.nome)}</td><td class="ce">${esc(brl(g.valor))}</td></tr></tbody></table>`).join('')}
    <div class="rel-pe"><div class="rel-assina"><span></span><small>Responsável pelo estoque</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ===================================================================
   Emitir relatório (21/10/2026, pedido dele) — três modelos, com período
   e categoria, para imprimir/PDF ou baixar em planilha (CSV):
     resumo   — por produto: estoque inicial, entradas, saídas e final no
                período (o mesmo desenho da aba ESTOQUE das planilhas antigas)
     consumo  — saídas de uso por direcionador (plantio/destino) e produto
     posicao  — saldo atual de cada produto
   =================================================================== */
let relOpc = null;
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;

function dadosRelatorio(o) {
  const mvs = movimentos();
  const doGrupo = i => !o.grupo || (i.grupo || 'Outros') === o.grupo;
  const cuTodos = custos();
  const valorDe = m => { const c = cuTodos.mov.get(m.id); return c && c.total !== null ? c.total : 0; };
  if (o.tipo === 'consumo') {
    const mapa = new Map();
    for (const m of mvs) {
      if (m.sentido !== 'saida' || m.tipo !== 'uso' || m.data < o.de || m.data > o.ate) continue;
      const i = itemDe(m.item_id); if (!doGrupo(i)) continue;
      const d = (m.plantio || '(sem direcionador)').trim();
      if (!mapa.has(d)) mapa.set(d, new Map());
      const g = mapa.get(d);
      const x = g.get(m.item_id) || { q: 0, v: 0 };
      x.q += Number(m.quantidade) || 0; x.v += valorDe(m);
      g.set(m.item_id, x);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([dir, its]) => {
        const linhas = [...its.entries()].map(([id, x]) => ({ i: itemDe(id), q: r3(x.q), v: x.v }))
          .sort((a, b) => a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
        return { dir, linhas, v: linhas.reduce((t, l) => t + l.v, 0) };
      });
  }
  const cuFim = o.tipo === 'posicao' ? cuTodos : custos(o.ate);
  const ids = new Set(mvs.map(m => m.item_id));
  const linhas = itensOrdenados().filter(i => ids.has(i.id) && doGrupo(i)).map(i => {
    let ini = 0, ent = 0, sai = 0, fim = 0, vEnt = 0, vSai = 0;
    for (const m of mvs) {
      if (m.item_id !== i.id) continue;
      const q = (Number(m.quantidade) || 0) * (m.sentido === 'entrada' ? 1 : -1);
      fim += q;
      if (m.data < o.de) ini += q;
      else if (m.data <= o.ate) { if (q > 0) { ent += q; vEnt += valorDe(m); } else { sai -= q; vSai += valorDe(m); } }
    }
    const finalPer = ini + ent - sai;
    const st = cuFim.itens.get(i.id) || {};
    return { i, ini: r3(ini), ent: r3(ent), sai: r3(sai), fim: r3(o.tipo === 'posicao' ? fim : finalPer),
      vEnt, vSai, medio: st.medio ?? null, vFim: st.emEstoque ?? null };
  });
  return o.zerados ? linhas : linhas.filter(l => o.tipo === 'posicao' ? Math.abs(l.fim) > 0.0005
    : (Math.abs(l.ini) > 0.0005 || l.ent || l.sai || Math.abs(l.fim) > 0.0005));
}

function abrirRelatorio() {
  const hoje = hojeISO();
  if (!relOpc) relOpc = { tipo: 'resumo', de: hoje.slice(0, 8) + '01', ate: hoje, grupo: grupoVisao || '', zerados: false };
  const grupos = [...new Set(itensOrdenados().map(i => i.grupo || 'Outros'))];
  window.abrirModal('Emitir relatório do estoque', `
    <div class="qc-tipos">
      ${[['resumo', 'Entradas e saídas do período'], ['consumo', 'Consumo por direcionador'], ['posicao', 'Posição atual (saldo)']]
        .map(([v, t]) => `<label class="qc-tipo"><input type="radio" name="relTipo" value="${v}"${relOpc.tipo === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
    <div class="grade">
      <label class="campo rel-per">De <input type="date" id="relDe" value="${esc(relOpc.de)}" max="${hoje}"></label>
      <label class="campo rel-per">Até <input type="date" id="relAte" value="${esc(relOpc.ate)}" max="${hoje}"></label>
      <label class="campo">Categoria <select id="relGrupo"><option value="">Todas</option>
        ${grupos.map(g => `<option${relOpc.grupo === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
    </div>
    <label class="es-check"><input type="checkbox" id="relZer"${relOpc.zerados ? ' checked' : ''}> incluir produtos sem movimento / zerados</label>
    <p class="dica" id="relDica"></p>
    <div class="barra fim">
      <button class="btn" type="button" id="relCsv">Baixar planilha</button>
      <button class="btn principal" type="button" id="relImp">Imprimir / PDF</button>
    </div>`, corpo => {
    const ler = () => {
      relOpc = { tipo: corpo.querySelector('[name=relTipo]:checked').value, de: $('relDe').value, ate: $('relAte').value,
        grupo: $('relGrupo').value, zerados: $('relZer').checked };
      corpo.querySelectorAll('.rel-per').forEach(el => { el.hidden = relOpc.tipo === 'posicao'; });
      $('relDica').textContent = relOpc.tipo === 'resumo' ? 'Por produto: estoque no início do período, entradas, saídas e estoque no fim — como a aba ESTOQUE das planilhas — com o valor das saídas e o valor no fim (custo médio).'
        : relOpc.tipo === 'consumo' ? 'Saídas do tipo Uso no período, somadas por direcionador (plantio/destino) e produto, com o valor pelo custo médio.'
        : 'Saldo de hoje de cada produto (entradas − saídas), com o custo médio e o valor em estoque.';
      return relOpc;
    };
    corpo.querySelectorAll('input,select').forEach(el => el.addEventListener('change', ler));
    ler();
    const valido = o => o.tipo === 'posicao' || (o.de && o.ate && o.de <= o.ate) || (aviso('Confira o período.', true), false);
    $('relImp').onclick = () => { const o = ler(); if (!valido(o)) return; window.fecharModal(); montarRelatorio(o); setTimeout(() => window.print(), 80); };
    $('relCsv').onclick = () => { const o = ler(); if (valido(o)) baixarRelatorio(o); };
  });
}

const tituloRel = o => o.tipo === 'resumo' ? 'Entradas e Saídas do Estoque' : o.tipo === 'consumo' ? 'Consumo por Direcionador' : 'Posição do Estoque';
const subRel = o => [o.tipo === 'posicao' ? 'saldo em ' + dataBR(hojeISO()) : dataBR(o.de) + ' a ' + dataBR(o.ate), o.grupo || 'todas as categorias']
  .join(' · ') + ' · emitido em ' + new Date().toLocaleDateString('pt-BR');

function montarRelatorio(o) {
  const d = dadosRelatorio(o);
  const n = v => esc(mostrarNumero(v));
  let corpo = '';
  if (o.tipo === 'consumo') {
    const totalGeral = d.reduce((t, g) => t + g.v, 0);
    corpo = d.length ? `<div class="rel-kpis" style="grid-template-columns:repeat(2,1fr)"><div><span>Direcionadores</span><b>${d.length}</b></div>
        <div><span>Valor consumido</span><b>${esc(brl(totalGeral))}</b></div></div>` + d.map(g => `<h3 class="rel-secao">${esc(g.dir)}</h3>
      <table class="rel-tab"><thead><tr><th>Produto</th><th class="ce">Categoria</th><th class="ce">Quantidade</th><th class="ce">Unid.</th><th class="ce">Valor</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr><td>${esc(l.i.nome)}</td><td class="ce">${esc(l.i.grupo || '')}</td><td class="ce">${n(l.q)}</td><td class="ce">${esc(l.i.unidade || '')}</td><td class="ce">${esc(brl(l.v))}</td></tr>`).join('')}
      <tr class="rel-total"><td colspan="4">Total ${esc(g.dir)}</td><td class="ce">${esc(brl(g.v))}</td></tr></tbody></table>`).join('')
      : '<p>Nenhuma saída de uso no período.</p>';
  } else {
    const grupos = [];
    for (const l of d) { let g = grupos[grupos.length - 1]; if (!g || g.nome !== (l.i.grupo || 'Outros')) grupos.push(g = { nome: l.i.grupo || 'Outros', linhas: [] }); g.linhas.push(l); }
    const res = o.tipo === 'resumo';
    const soma = (ls, k) => ls.reduce((t, l) => t + (l[k] || 0), 0);
    corpo = (res ? `<div class="rel-kpis" style="grid-template-columns:repeat(4,1fr)"><div><span>Produtos</span><b>${d.length}</b></div>
        <div><span>Valor das entradas</span><b>${esc(brl(soma(d, 'vEnt')))}</b></div><div><span>Valor das saídas</span><b>${esc(brl(soma(d, 'vSai')))}</b></div>
        <div><span>Valor no fim do período</span><b>${esc(brl(soma(d, 'vFim')))}</b></div></div>`
      : `<div class="rel-kpis" style="grid-template-columns:repeat(2,1fr)"><div><span>Produtos</span><b>${d.length}</b></div>
        <div><span>Valor em estoque</span><b>${esc(brl(soma(d, 'vFim')))}</b></div></div>`)
      + (grupos.map(g => `<h3 class="rel-secao">${esc(g.nome)}</h3>
      <table class="rel-tab"><thead><tr><th>Produto</th><th class="ce">Unid.</th>${res ? '<th class="ce">Estoque inicial</th><th class="ce">Entradas</th><th class="ce">Saídas</th><th class="ce">Estoque final</th><th class="ce">Valor saídas</th><th class="ce">Valor final</th>' : '<th class="ce">Saldo</th><th class="ce">Custo médio</th><th class="ce">Valor</th>'}</tr></thead>
      <tbody>${g.linhas.map(l => `<tr><td>${esc(l.i.nome)}</td><td class="ce">${esc(l.i.unidade || '')}</td>${res
        ? `<td class="ce">${n(l.ini)}</td><td class="ce">${l.ent ? n(l.ent) : '—'}</td><td class="ce">${l.sai ? n(l.sai) : '—'}</td><td class="ce"><b${l.fim < 0 ? ' style="color:#B23B2E"' : ''}>${n(l.fim)}</b></td><td class="ce">${l.sai && l.medio != null ? esc(brl(l.vSai)) : '—'}</td><td class="ce">${esc(brl(l.vFim))}</td>`
        : `<td class="ce"><b${l.fim < 0 ? ' style="color:#B23B2E"' : ''}>${n(l.fim)}</b></td><td class="ce">${esc(brlU(l.medio))}</td><td class="ce">${esc(brl(l.vFim))}</td>`}</tr>`).join('')}
      <tr class="rel-total"><td colspan="${res ? 6 : 4}">Total ${esc(g.nome)}</td>${res ? `<td class="ce">${esc(brl(soma(g.linhas, 'vSai')))}</td>` : ''}<td class="ce">${esc(brl(soma(g.linhas, 'vFim')))}</td></tr></tbody></table>`).join('') || '<p>Nada nesse filtro.</p>');
  }
  $('qcFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>${esc(tituloRel(o))} — Faz. Quebra Cocão</h1><p>${esc(subRel(o))}</p></div></div>
    ${corpo}
    <div class="rel-pe"><div class="rel-assina"><span></span><small>Responsável pelo estoque</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

function baixarRelatorio(o) {
  const d = dadosRelatorio(o);
  const num = v => String(v).replace('.', ',');
  const rs = v => v == null || !isFinite(v) ? '' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let linhas;
  if (o.tipo === 'consumo') {
    linhas = [['Direcionador', 'Produto', 'Categoria', 'Quantidade', 'Unidade', 'Valor (R$)']];
    d.forEach(g => g.linhas.forEach(l => linhas.push([g.dir, l.i.nome, l.i.grupo || '', num(l.q), l.i.unidade || '', rs(l.v)])));
  } else if (o.tipo === 'resumo') {
    linhas = [['Categoria', 'Produto', 'Unidade', 'Estoque inicial', 'Entradas', 'Saídas', 'Estoque final', 'Valor entradas (R$)', 'Valor saídas (R$)', 'Valor final (R$)']];
    d.forEach(l => linhas.push([l.i.grupo || '', l.i.nome, l.i.unidade || '', num(l.ini), num(l.ent), num(l.sai), num(l.fim), rs(l.vEnt), rs(l.vSai), rs(l.vFim)]));
  } else {
    linhas = [['Categoria', 'Produto', 'Unidade', 'Saldo', 'Custo médio (R$)', 'Valor (R$)']];
    d.forEach(l => linhas.push([l.i.grupo || '', l.i.nome, l.i.unidade || '', num(l.fim), rs(l.medio), rs(l.vFim)]));
  }
  const csv = '\ufeff' + [[tituloRel(o) + ' — Faz. Quebra Cocão'], [subRel(o)], [], ...linhas].map(r => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `Estoque QC - ${tituloRel(o)} - ${o.tipo === 'posicao' ? hojeISO() : o.de + ' a ' + o.ate}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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

/* Categoria do lançamento (pedido dele, 22/10/2026): escolhe "EPIs" e a lista
   de produtos mostra só os EPIs. Vazio = todas. Quem só vê alguns estoques vê
   só os produtos contados neles. */
const CHAVE_CAT = 'estoque.qc.categoria';
let catMov = '';
try { catMov = localStorage.getItem(CHAVE_CAT) || ''; } catch { /* sem localStorage */ }
function produtosDoForm() {
  const meus = meusLocais();
  return itensOrdenados().filter(i => (!catMov || (i.grupo || 'Outros') === catMov)
    && (!meus.length || meus.some(l => contaNoLocal(i, l))));
}
const listaProdutos = () => produtosDoForm().map(i => `<option value="${esc(i.nome)}">${esc(i.unidade || '')} · ${esc(i.grupo || '')}</option>`).join('');

/* Destino por produto na saída de uso (pedido dele, 22/10/2026):
   lubrificante sai para uma MÁQUINA ou IMPLEMENTO (catálogo de Máquinas e
   Patrimônio, pela função est_destinos_equipamentos) e EPI sai para um
   FUNCIONÁRIO (cadastro de Pessoas, só os ativos). Gravado em
   est_movimentos.equipamento_id/equipamento e funcionario_id/funcionario.
   As listas ficam guardadas no aparelho para servir sem sinal. */
const DEST = { equip: null, func: null };
const CHAVE_DEST = 'estoque.qc.destinos';
try { Object.assign(DEST, JSON.parse(localStorage.getItem(CHAVE_DEST) || '{}')); } catch { /* sem cache */ }
const destinoDe = item => {
  const g = semAcento(item && item.grupo);
  if (g === 'LUBRIFICANTES') return 'equip';
  if (g === 'EPIS') return 'func';
  return null;
};
const rotuloEquip = e => [e.codigo, e.nome].filter(Boolean).join(' - ') + (e.tipo ? ` (${e.tipo}${e.local ? ' · ' + e.local : ''})` : '');
const rotuloFunc = f => f.nome + (f.cadastro ? ` (${f.cadastro})` : '') + (f.fazenda ? ` · ${f.fazenda}` : '');
function achaDestino(tipo, texto) {
  const t = semAcento(texto);
  if (!t) return null;
  if (tipo === 'equip') {
    const e = equipVisiveis().find(x => semAcento(rotuloEquip(x)) === t)
      || equipVisiveis().find(x => semAcento(x.codigo) === t) || null;
    return e ? { id: e.id, nome: [e.codigo, e.nome].filter(Boolean).join(' - ') } : null;
  }
  const f = funcVisiveis().find(x => semAcento(rotuloFunc(x)) === t) || funcVisiveis().find(x => semAcento(x.nome) === t) || null;
  return f ? { id: f.id, nome: f.nome } : null;
}
/* Quem só vê alguns estoques (ex.: Laís, só Quebra Cocão) vê só as máquinas e
   as pessoas daquelas fazendas (22/10/2026). Compara o nome da fazenda sem
   "Faz.", "Fazenda", "Reunidas" e acentos. */
const chaveFaz = t => semAcento(t).replace(/\b(FAZ|FAZENDA|FAZENDAS|REUNIDAS)\b\.?/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
function minhasFazendas() {
  const meus = meusLocais();
  if (!meus.length) return null;
  return todos('est_locais').filter(l => meus.includes(l.id)).map(l => chaveFaz(l.nome)).filter(Boolean);
}
const daFazenda = (texto, faz) => { const k = chaveFaz(texto); return !!k && faz.some(f => k.includes(f) || f.includes(k)); };
const equipVisiveis = () => { const faz = minhasFazendas(); return (DEST.equip || []).filter(e => !faz || daFazenda(e.local, faz)); };
const funcVisiveis = () => { const faz = minhasFazendas(); return (DEST.func || []).filter(f => !faz || daFazenda(f.fazenda, faz)); };

function opcoesDestino() {
  return `<datalist id="qcEquip">${equipVisiveis().map(e => `<option value="${esc(rotuloEquip(e))}">`).join('')}</datalist>
    <datalist id="qcFunc">${funcVisiveis().map(f => `<option value="${esc(rotuloFunc(f))}">`).join('')}</datalist>`;
}
async function carregarDestinos() {
  const sb = window.App && window.App.sb;
  if (!sb || !(window.App.online !== false)) return;
  try {
    const [e, f] = await Promise.all([
      sb.schema('public').rpc('est_destinos_equipamentos'),
      sb.schema('public').from('funcionarios').select('id,nome,cadastro,fazenda,situacao').order('nome'),
    ]);
    if (!e.error) DEST.equip = e.data || [];
    if (!f.error) DEST.func = (f.data || []).filter(x => semAcento(x.situacao || 'ATIVO') === 'ATIVO');
    try { localStorage.setItem(CHAVE_DEST, JSON.stringify(DEST)); } catch { /* cheio */ }
    const lugar = $('qcDestinos');
    if (lugar) lugar.innerHTML = opcoesDestino();
  } catch (err) { console.warn('não li máquinas/funcionários', err); }
}

function linhaProduto(sentido) {
  const ent = sentido === 'entrada';
  return `<div class="qc-lin${ent ? ' com-valor' : ''}">
    <input type="text" class="qc-prod" list="qcProdutos" placeholder="produto" autocomplete="off" enterkeyhint="next">
    <input type="text" class="qc-qtd" inputmode="decimal" placeholder="qtd" autocomplete="off" enterkeyhint="next">
    ${ent ? '<input type="text" class="qc-vu" inputmode="decimal" placeholder="R$ por unid." autocomplete="off" enterkeyhint="next" aria-label="Valor por unidade">' : ''}
    <button type="button" class="cl-tirar qc-x" title="Tirar a linha" aria-label="Tirar a linha">×</button>
    <small class="qc-info"></small>
    ${ent ? '' : `<label class="qc-dest" hidden><span class="qc-dest-rot"></span>
      <input type="text" class="qc-dest-inp" autocomplete="off" enterkeyhint="next"></label>`}
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
        <label class="campo qc-so" data-so="uso">Plantio / destino <small class="dc-sem">(lubrificante e EPI: destino na linha)</small> <input type="text" name="plantio" list="qcPlantios" placeholder="plantio, área, máquina ou local"></label>
        <label class="campo">Operador <span class="qc-op-obrig">*</span> <input type="text" name="operador" list="qcOperadores"></label>
        <label class="campo qc-so" data-so="transferencia">Fazenda de destino *
          <select name="outra"><option value="">—</option>${outrasFazendas().map(n => `<option>${esc(n)}</option>`).join('')}<option>Outra</option></select></label>`}
        <label class="campo plena">Observação <input type="text" name="obs"></label>
      </div>
      <div class="ct-chips qc-cats">${[['', 'Todas'], ...GRUPOS.filter(g => itensOrdenados().some(i => i.grupo === g)).map(g => [g, g])]
        .map(([id, rot]) => `<button type="button" class="ct-chip" data-qccat="${esc(id)}" aria-pressed="${catMov === id}">${esc(rot)}</button>`).join('')}</div>
      <div class="barra entre qc-prod-cab">
        <h3 class="es-secao" style="margin:0">Produtos <small id="qcConta">0</small> <small id="qcTotal" class="qc-total"></small></h3>
        <button type="button" class="btn mini" id="qcColar">Colar lista</button>
      </div>
      ${ent ? '<p class="dc-sem qc-vu-dica">Valor por unidade: R$ por kg, por litro ou por peça, como está na nota. Na compra é obrigatório.</p>' : '<p class="dc-sem qc-vu-dica">O valor da saída sai sozinho pelo custo médio das entradas.</p>'}
      <div class="qc-lins" id="qcLins">${Array.from({ length: LINHAS_INICIAIS }, () => linhaProduto(sentido)).join('')}</div>
      <div class="barra entre">
        <button type="button" class="btn mini" id="qcMais">+ linha</button>
        <button class="btn principal" type="submit" id="qcEnviar">Lançar ${ent ? 'entrada' : 'saída'}</button>
      </div>
      <datalist id="qcProdutos">${listaProdutos()}</datalist>
      <datalist id="qcFornec">${unicos('fornecedor').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcPlantios">${unicos('plantio').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="qcOperadores">${unicos('operador').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <div id="qcDestinos">${ent ? '' : opcoesDestino()}</div>
    </form>
  </div>
  <div class="cartao" id="qcListaCartao"></div>`;

  const form = $('qcForm');
  const mostrarTipo = () => {
    const t = form.querySelector('[name=tipo]:checked').value;
    form.querySelectorAll('.qc-so').forEach(el => { el.hidden = el.dataset.so !== t; });
  };
  form.querySelectorAll('[name=tipo]').forEach(r => r.addEventListener('change', () => {
    mostrarTipo();
    document.querySelectorAll('#qcLins .qc-prod').forEach(i => i.dispatchEvent(new Event('input')));
  }));
  mostrarTipo();
  ligarLinhas(sentido);
  if (!ent) carregarDestinos();
  $('qcMais').onclick = () => { $('qcLins').insertAdjacentHTML('beforeend', linhaProduto(sentido)); ligarLinhas(sentido); };
  $('qcColar').onclick = () => colarLista(sentido);
  form.querySelectorAll('[data-qccat]').forEach(b => b.addEventListener('click', () => {
    catMov = b.dataset.qccat;
    try { localStorage.setItem(CHAVE_CAT, catMov); } catch { /* sem localStorage */ }
    form.querySelectorAll('[data-qccat]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('qcProdutos').innerHTML = listaProdutos();
    document.querySelectorAll('#qcLins .qc-prod').forEach(i => { if (i.value) i.dispatchEvent(new Event('input')); });
  }));
  form.addEventListener('submit', e => { e.preventDefault(); lancar(sentido, form); });
  desenharListaMes(sentido);
}

/** Liga as linhas de produto (as novas também): Enter pula, saldo aparece, linha nova sozinha. */
function ligarLinhas(sentido) {
  const sd = saldos();
  const cu = custos();
  document.querySelectorAll('#qcLins .qc-lin:not([data-ok])').forEach(lin => {
    lin.dataset.ok = '1';
    const prod = lin.querySelector('.qc-prod'), qtd = lin.querySelector('.qc-qtd'), info = lin.querySelector('.qc-info');
    const vuInp = lin.querySelector('.qc-vu');
    const destEl = lin.querySelector('.qc-dest');
    const mostrarDestino = it => {
      if (!destEl) return;
      const uso = (document.querySelector('#qcForm [name=tipo]:checked') || {}).value === 'uso';
      const d = uso ? destinoDe(it) : null;
      destEl.hidden = !d;
      const inp = destEl.querySelector('.qc-dest-inp');
      if (!d) { inp.value = ''; return; }
      destEl.querySelector('.qc-dest-rot').textContent = d === 'equip' ? 'Máquina / implemento *' : 'Funcionário *';
      inp.setAttribute('list', d === 'equip' ? 'qcEquip' : 'qcFunc');
      inp.placeholder = d === 'equip' ? 'código ou nome da máquina/implemento' : 'nome do funcionário';
    };
    const escreverInfo = () => {
      const it = itemPorNome(prod.value);
      mostrarDestino(it);
      lin.classList.toggle('desconhecido', !!prod.value.trim() && !it);
      if (!prod.value.trim()) { info.textContent = ''; return; }
      if (!it) { info.textContent = 'não está no cadastro'; return; }
      if (catMov && (it.grupo || 'Outros') !== catMov) { lin.classList.add('desconhecido'); info.textContent = `é de ${it.grupo || 'Outros'}, não de ${catMov}`; return; }
      const st = cu.itens.get(it.id);
      const medio = st && st.medio !== null ? st.medio : null;
      const q = lerNumero(qtd.value), vu = vuInp ? lerNumero(vuInp.value) : null;
      const partes = [`${it.unidade || ''} · saldo ${mostrarNumero(Math.round((sd.get(it.id) || 0) * 1000) / 1000)}`];
      if (sentido === 'entrada') {
        if (medio !== null) partes.push('custo médio ' + brlU(medio));
        if (q > 0 && vu > 0) partes.push('total ' + brl(q * vu));
      } else if (medio !== null) {
        partes.push('custo médio ' + brlU(medio) + (q > 0 ? ' · ' + brl(q * medio) : ''));
      } else partes.push('sem custo médio ainda');
      info.textContent = partes.join(' · ');
    };
    const atualizar = () => {
      escreverInfo();
      contar();
      // a última linha preenchida abre uma nova
      const todas = [...document.querySelectorAll('#qcLins .qc-lin')];
      if (todas[todas.length - 1] === lin && prod.value.trim()) {
        $('qcLins').insertAdjacentHTML('beforeend', linhaProduto(sentido)); ligarLinhas(sentido);
      }
    };
    prod.addEventListener('input', atualizar);
    prod.addEventListener('change', atualizar);
    qtd.addEventListener('input', () => { escreverInfo(); contar(); });
    if (vuInp) vuInp.addEventListener('input', () => { escreverInfo(); contar(); });
    if (vuInp) vuInp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = lin.nextElementSibling;
      if (prox) prox.querySelector('.qc-prod').focus();
    });
    prod.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); qtd.focus(); } });
    qtd.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (vuInp) { vuInp.focus(); return; }
      if (destEl && !destEl.hidden) { destEl.querySelector('.qc-dest-inp').focus(); return; }
      const prox = lin.nextElementSibling;
      if (prox) prox.querySelector('.qc-prod').focus();
    });
    if (destEl) destEl.querySelector('.qc-dest-inp').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = lin.nextElementSibling;
      if (prox) prox.querySelector('.qc-prod').focus();
    });
    lin.querySelector('.qc-x').onclick = () => {
      if (document.querySelectorAll('#qcLins .qc-lin').length > 1) lin.remove();
      else { prod.value = ''; qtd.value = ''; if (vuInp) vuInp.value = ''; info.textContent = ''; }
      contar();
    };
  });
  contar();
}

function linhasPreenchidas() {
  return [...document.querySelectorAll('#qcLins .qc-lin')]
    .map(lin => ({ lin, nome: lin.querySelector('.qc-prod').value.trim(), txt: lin.querySelector('.qc-qtd').value.trim(),
      vuTxt: lin.querySelector('.qc-vu') ? lin.querySelector('.qc-vu').value.trim() : '',
      destTxt: lin.querySelector('.qc-dest-inp') ? lin.querySelector('.qc-dest-inp').value.trim() : '' }))
    .filter(x => x.nome || x.txt);
}
function contar() {
  const n = linhasPreenchidas().filter(x => x.nome).length;
  const el = $('qcConta');
  if (el) el.textContent = n;
  const b = $('qcEnviar');
  if (b) b.textContent = b.textContent.replace(/ \(\d+\)$/, '') + (n ? ` (${n})` : '');
  const tot = $('qcTotal');
  if (tot) {
    let soma = 0, algum = false;
    for (const x of linhasPreenchidas()) {
      const q = lerNumero(x.txt), v = lerNumero(x.vuTxt);
      if (q > 0 && v > 0) { soma += q * v; algum = true; }
    }
    tot.textContent = algum ? '· total ' + brl(soma) : '';
  }
}

/** Cola a lista (da NF, de uma planilha): "produto ; quantidade" ou produto[tab]quantidade, uma por linha. */
function colarLista(sentido) {
  window.abrirModal('Colar lista de produtos', `
    <p class="dica">Uma linha por produto: o nome e a quantidade${sentido === 'entrada' ? ' (e, se quiser, o valor por unidade)' : ''},
      separados por ponto e vírgula ou colados das colunas da planilha.</p>
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
        $('qcLins').insertAdjacentHTML('beforeend', linhaProduto(sentido));
        const lin = $('qcLins').lastElementChild;
        lin.querySelector('.qc-prod').value = p[0].trim().replace(/\s+/g, ' ');
        lin.querySelector('.qc-qtd').value = (p[1] || '').trim();
        if (lin.querySelector('.qc-vu')) lin.querySelector('.qc-vu').value = (p[2] || '').replace(/R\$\s*/i, '').trim();
      }
      $('qcLins').insertAdjacentHTML('beforeend', linhaProduto(sentido));
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
    const vu = sentido === 'entrada' ? lerNumero(x.vuTxt) : null;
    if (!x.nome) { x.lin.classList.add('erro'); erros.push('linha sem produto'); continue; }
    if (!item) { desconhecidos.set(semAcento(x.nome), x.nome); continue; }
    if (catMov && (item.grupo || 'Outros') !== catMov) { x.lin.classList.add('erro'); erros.push(`${item.nome}: não é ${catMov}`); continue; }
    if (Number.isNaN(qtd) || !qtd || qtd <= 0) { x.lin.classList.add('erro'); erros.push(`${item.nome}: quantidade`); continue; }
    if (Number.isNaN(vu) || (sentido === 'entrada' && tipo === 'compra' && !(vu > 0))) { x.lin.classList.add('erro'); erros.push(`${item.nome}: valor`); continue; }
    let dest = null;
    const dt = sentido === 'saida' && tipo === 'uso' ? destinoDe(item) : null;
    if (dt) {
      const lista = dt === 'equip' ? DEST.equip : DEST.func;
      dest = achaDestino(dt, x.destTxt);
      // sem a lista (aparelho nunca abriu com sinal) vale o texto digitado
      if (!dest && x.destTxt && !(lista && lista.length)) dest = { id: null, nome: x.destTxt };
      if (!dest) { x.lin.classList.add('erro'); erros.push(`${item.nome}: ${dt === 'equip' ? 'máquina/implemento' : 'funcionário'}`); continue; }
    }
    linhas.push({ item, qtd, vu: vu > 0 ? vu : null, dt, dest });
  }
  if (desconhecidos.size) return cadastrarNaHora([...desconhecidos.values()], sentido, form);
  if (erros.length) {
    aviso(`Confira as linhas em vermelho (${erros.length}: ${erros.slice(0, 3).join('; ')}${erros.length > 3 ? '…' : ''}). Precisa de quantidade maior que zero${sentido === 'entrada' && tipo === 'compra' ? ' e valor por unidade (obrigatório na compra)' : ''}${sentido === 'saida' && tipo === 'uso' ? '; lubrificante pede a máquina/implemento e EPI pede o funcionário, escolhidos da lista' : ''}.`, true);
    return;
  }
  if (sentido === 'saida') {
    if (!txt('documento')) { aviso('Informe o nº do documento.', true); return; }
    // saída só de EPI (cada um com o funcionário) não pede operador (22/10/2026)
    const soEpi = tipo === 'uso' && linhas.length && linhas.every(l => l.dt === 'func' && l.dest);
    if (!txt('operador') && !soEpi) { aviso('Informe o operador.', true); return; }
    if (tipo === 'uso' && !txt('plantio') && linhas.some(l => !l.dest)) { aviso('Informe o plantio ou destino.', true); return; }
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
  for (const l of linhas) await gravar('est_movimentos', Object.assign({}, base, { item_id: l.item.id, quantidade: l.qtd,
    valor_unitario: sentido === 'entrada' ? l.vu : null,
    equipamento_id: l.dt === 'equip' ? l.dest.id : null, equipamento: l.dt === 'equip' ? l.dest.nome : null,
    funcionario_id: l.dt === 'func' ? l.dest.id : null, funcionario: l.dt === 'func' ? l.dest.nome : null }));
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
      <label class="campo">Categoria <select id="qnGrupo">${GRUPOS.map(g => `<option${g === catMov ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
    </div>
    <p class="dc-sem">Se for erro de digitação, volte e corrija o nome na linha.</p>
    <div class="barra fim"><button class="btn" type="button" id="qnNao">Corrigir os nomes</button>
      <button class="btn principal" type="button" id="qnSim">Cadastrar e lançar</button></div>`, corpo => {
    corpo.querySelector('#qnNao').onclick = window.fecharModal;
    corpo.querySelector('#qnSim').onclick = async () => {
      for (const nome of nomes) await gravar('est_itens', { nome: nome.replace(/\s+/g, ' '), unidade: corpo.querySelector('#qnUni').value,
        grupo: corpo.querySelector('#qnGrupo').value, ativo: true, locais_contagem: soQc() });
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
  const cu = custos();
  const totalDe = ms => { let t = 0, ok = false; for (const x of ms) { const c = cu.mov.get(x.id); if (c && c.total !== null) { t += c.total; ok = true; } } return ok ? t : null; };
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
          <span><b>${dataBR(m.data)} · ${esc(tipos[m.tipo] || m.tipo)}</b> · ${ms.length} produto(s)${totalDe(ms) !== null ? ' · <b>' + esc(brl(totalDe(ms))) + '</b>' : ''}
            <small>${detalhe(m)}${m.criado_por ? ' · lançado por ' + esc(m.criado_por) : ''}</small></span>
          <span class="qc-seta">${aberto ? '▾' : '▸'}</span>
        </button>
        <div class="qc-lanc-itens"${aberto ? '' : ' hidden'}>${ms.map(x => { const i = itemDe(x.item_id); const c = cu.mov.get(x.id) || {}; return `<div class="qc-lanc-item${ent ? ' com-valor' : ''}">
          <span>${esc(i.nome)}${x.equipamento || x.funcionario ? `<small class="qc-dest-txt">→ ${esc(x.equipamento || x.funcionario)}</small>` : ''}</span><strong class="${ent ? 'qc-ent' : 'qc-sai'}">${ent ? '+' : '−'}${esc(mostrarNumero(x.quantidade))} ${esc(i.unidade || '')}</strong>
          ${ent ? `<label class="qc-vu-ed" title="Valor por unidade (R$)">R$/${esc(i.unidade || 'un')} <input type="text" inputmode="decimal" data-vu="${esc(x.id)}"
            value="${vazio(x.valor_unitario) ? '' : esc(Number(x.valor_unitario).toLocaleString('pt-BR', { maximumFractionDigits: 4 }))}"
            placeholder="${c.vu !== null && c.vu !== undefined ? esc(Number(c.vu).toLocaleString('pt-BR', { maximumFractionDigits: 2 })) + ' (médio)' : '—'}"></label>
            <small class="qc-vu-tot">${c.total !== null && c.total !== undefined ? esc(brl(c.total)) : ''}</small>`
          : `<small class="qc-vu-tot" title="Custo médio na data">${c.vu !== null && c.vu !== undefined ? esc(brlU(c.vu)) + ' · ' + esc(brl(c.total)) : 'sem custo médio'}</small>`}
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
  alvo.querySelectorAll('[data-vu]').forEach(inp => inp.addEventListener('change', async () => {
    const m = movimentos().find(x => x.id === inp.dataset.vu);
    const v = lerNumero(inp.value);
    if (!m || Number.isNaN(v)) { aviso('Esse valor não deu para entender. Ex.: 3,85', true); return; }
    await gravar('est_movimentos', Object.assign({}, m, { valor_unitario: v > 0 ? v : null }));
    aviso('Valor guardado.');
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
    if (t && ![i.nome, m.documento, m.plantio, m.equipamento, m.funcionario, m.operador, m.outra_fazenda, m.fornecedor, m.obs]
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
  const cu = custos();
  const vt = l => l.reduce((t, m) => t + ((cu.mov.get(m.id) || {}).total || 0), 0);
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
      <div class="es-card es-ok"><span>Entradas</span><strong>${ent.length}</strong><small>itens em ${lancs(ent)} lançamento(s) · ${esc(brl(vt(ent)))}</small></div>
      <div class="es-card es-sobra"><span>Saídas</span><strong>${sai.length}</strong><small>itens em ${lancs(sai)} lançamento(s) · ${esc(brl(vt(sai)))}</small></div>
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
        <strong class="${e ? 'qc-ent' : 'qc-sai'}">${e ? '+' : '−'}${esc(mostrarNumero(m.quantidade))} ${esc(i.unidade || '')}
          ${(cu.mov.get(m.id) || {}).total != null ? `<small class="qc-mov-rs">${esc(brl(cu.mov.get(m.id).total))}</small>` : ''}</strong>
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
  $('pfCsv')?.addEventListener('click', () => baixarCsv(lista, cu));
  $('pfImprimir')?.addEventListener('click', () => { montarFolhaMov(lista, cu); setTimeout(() => window.print(), 50); });
}

const periodoTxt = () => pf.de || pf.ate ? `${pf.de ? dataBR(pf.de) : 'início'} a ${pf.ate ? dataBR(pf.ate) : 'hoje'}` : 'todo o período';

function baixarCsv(lista, cu) {
  const c = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rs = (v, casas = 2) => v == null || !isFinite(v) ? '' : Number(v).toFixed(casas).replace('.', ',');
  const linhas = [['Data', 'Entrada/Saída', 'Tipo', 'Produto', 'Categoria', 'Quantidade', 'Unidade', 'Valor unitário (R$)', 'Valor total (R$)', 'Documento',
    'Plantio', 'Máquina / implemento', 'Funcionário', 'Operador', 'Fazenda (origem/destino)', 'Fornecedor', 'Observação', 'Lançado por']]
    .concat(lista.map(m => { const i = itemDe(m.item_id); const k = cu.mov.get(m.id) || {}; return [dataBR(m.data), m.sentido === 'entrada' ? 'Entrada' : 'Saída',
      nomeTipo(m), i.nome, i.grupo || '', String(m.quantidade).replace('.', ','), i.unidade || '', rs(k.vu, 4), rs(k.total), m.documento, m.plantio,
      m.equipamento, m.funcionario, m.operador, m.outra_fazenda, m.fornecedor, m.obs, m.criado_por]; }));
  const blob = new Blob(['﻿' + linhas.map(l => l.map(c).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `movimentacoes-quebra-cocao-${(pf.de || 'inicio')}_${(pf.ate || 'hoje')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function montarFolhaMov(lista, cu) {
  $('qcPainelFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Movimentações do Estoque — Faz. Quebra Cocão</h1>
        <p>${esc(periodoTxt())} · ${lista.length} lançamento(s) · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p></div></div>
    <table class="rel-tab rel-mov" style="margin-top:6mm"><thead><tr><th class="ce">Data</th><th class="ce">E/S</th><th>Tipo</th><th>Produto</th>
      <th class="ce">Qtd.</th><th class="ce">Valor</th><th>Documento</th><th>Destino / Operador / Fazenda</th></tr></thead>
    <tbody>${lista.map(m => { const i = itemDe(m.item_id); return `<tr><td class="ce">${esc(dataBR(m.data))}</td>
      <td class="ce">${m.sentido === 'entrada' ? 'E' : 'S'}</td><td>${esc(nomeTipo(m))}</td><td>${esc(i.nome)}</td>
      <td class="ce">${m.sentido === 'entrada' ? '+' : '−'}${esc(mostrarNumero(m.quantidade))} ${esc(i.unidade || '')}</td>
      <td class="ce">${esc(brl((cu.mov.get(m.id) || {}).total))}</td>
      <td>${esc(m.documento || '')}</td><td>${esc([m.plantio, m.equipamento, m.funcionario, m.operador, m.outra_fazenda, m.fornecedor].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</tbody></table>
    <div class="rel-pe"><div class="rel-assina"><span></span><small>Responsável pelo estoque</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

/* ===================================================================
   Importar as planilhas antigas (15/10/2026) — ver qc-importar.js.
   Grava direto no servidor em lotes (são milhares de linhas; uma por uma pela
   fila levaria minutos) e depois confere o saldo de cada produto com o
   "ESTOQUE FINAL" da planilha.
   =================================================================== */
const ORIGEM_IMPORT = 'Importação planilha';

async function prepararImportacao(arquivos) {
  let lidos;
  try { lidos = await Promise.all(arquivos.map(f => lerPlanilhaQc(f))); }
  catch (e) { aviso(e.message || 'Não consegui ler a planilha.', true); return; }
  const itens = new Map(todos('est_itens').filter(i => i.ativo !== false).map(i => [semAcento(i.nome), i]));
  const jaImportado = g => movimentos().some(m => m.criado_por === ORIGEM_IMPORT && (itemDe(m.item_id).grupo || '') === g);
  window.abrirModal('Importar planilhas da Quebra Cocão', `
    ${lidos.map(r => {
      const nomes = new Set([...r.produtos.map(p => semAcento(p.nome)), ...r.movs.map(m => semAcento(m.produto))]);
      const novos = [...nomes].filter(n => !itens.has(n)).length;
      const ent = r.movs.filter(m => m.sentido === 'entrada').length, sai = r.movs.length - ent;
      const conta = t => r.movs.filter(m => m.tipo === t).length;
      return `<div class="qc-imp">
        <h3 class="es-secao">${esc(r.grupo)} <small>${esc(r.arquivo)}</small></h3>
        <p>${r.produtos.length} produtos (${novos} novos no cadastro) · ${r.produtos.filter(p => p.inicial).length} com estoque inicial ·
          <strong>${ent}</strong> entradas e <strong>${sai}</strong> saídas
          (compra ${conta('compra')}, uso ${conta('uso')}, transferência ${conta('transferencia')}, ajuste ${conta('ajuste')})</p>
        ${r.semTipo.length ? `<p class="es-nota">${r.semTipo.length} linha(s) <strong>sem TIPO</strong> ficam de fora (a planilha também não soma):
          ${r.semTipo.map(x => `linha ${x.linha}: ${esc(x.data ? dataBR(x.data) : '')} ${esc(x.produto)} ${esc(mostrarNumero(x.quantidade))}`).join('; ')}</p>` : ''}
        ${jaImportado(r.grupo) ? '<p class="es-nota"><strong>Já foi importada antes.</strong> Importar de novo troca a importação anterior desta categoria.</p>' : ''}
      </div>`;
    }).join('')}
    <p class="dc-sem">O estoque inicial entra como "Saldo inicial" no dia anterior à primeira movimentação. Lançamentos feitos no app
      não são tocados.</p>
    <div class="barra fim"><button class="btn" type="button" id="qiNao">Cancelar</button>
      <button class="btn principal" type="button" id="qiSim">Importar</button></div>
    <div id="qiProgresso" class="dc-sem"></div>`, corpo => {
    corpo.querySelector('#qiNao').onclick = window.fecharModal;
    corpo.querySelector('#qiSim').onclick = async () => {
      corpo.querySelector('#qiSim').disabled = true; corpo.querySelector('#qiNao').disabled = true;
      try { await importar(lidos, txt => { corpo.querySelector('#qiProgresso').textContent = txt; }); }
      catch (e) {
        console.error(e);
        corpo.querySelector('#qiProgresso').textContent = 'Parou com erro: ' + (e.message || e);
        corpo.querySelector('#qiNao').disabled = false;
      }
    };
  });
}

async function emLotes(tabela, linhas, progresso, rotulo) {
  const salvos = [];
  for (let i = 0; i < linhas.length; i += 400) {
    const r = await window.App.sb.from(tabela).upsert(linhas.slice(i, i + 400), { onConflict: 'id' }).select();
    if (r.error) throw r.error;
    salvos.push(...(r.data || []));
    progresso(`${rotulo}: ${Math.min(i + 400, linhas.length)} de ${linhas.length}…`);
  }
  // cópia local, para a tela já mostrar sem esperar a próxima carga
  salvos.forEach(x => { x._base = x.atualizado_em ?? null; });
  await window.gravarLocal(tabela, salvos);
  const lista = window.App.dados[tabela] || (window.App.dados[tabela] = []);
  const pos = new Map(lista.map((x, k) => [x.id, k]));
  for (const x of salvos) { if (pos.has(x.id)) lista[pos.get(x.id)] = x; else lista.push(x); }
  return salvos;
}

async function importar(lidos, progresso) {
  if (!window.App.online) throw new Error('Precisa de internet para importar.');
  const lc = localQc();
  const quem = ORIGEM_IMPORT;

  // 1. produtos que faltam no cadastro
  const itens = new Map(todos('est_itens').filter(i => i.ativo !== false).map(i => [semAcento(i.nome), i]));
  const novos = [];
  for (const r of lidos) {
    const nomes = new Map();
    for (const p of r.produtos) nomes.set(semAcento(p.nome), p.nome);
    for (const m of r.movs) if (!nomes.has(semAcento(m.produto))) nomes.set(semAcento(m.produto), m.produto);
    for (const [k, nome] of nomes) if (!itens.has(k)) {
      const it = { id: crypto.randomUUID(), nome, unidade: unidadeDe(nome, r.grupo), grupo: r.grupo, ativo: true,
        locais_contagem: soQc() };
      itens.set(k, it); novos.push(it);
    }
  }
  if (novos.length) await emLotes('est_itens', novos, progresso, 'Cadastrando produtos');

  // 2. tira a importação anterior das mesmas categorias
  const grupos = new Set(lidos.map(r => r.grupo));
  const antigos = movimentos().filter(m => m.criado_por === quem && grupos.has(itemDe(m.item_id).grupo || ''));
  if (antigos.length) await emLotes('est_movimentos', antigos.map(m => {
    const { _base, ...resto } = m; return Object.assign(resto, { ativo: false });
  }), progresso, 'Tirando a importação anterior');

  // 3. saldo inicial + movimentações
  const movs = [];
  for (const r of lidos) {
    const primeira = r.movs.map(m => m.data).sort()[0] || hojeISO();
    const d = new Date(primeira + 'T12:00'); d.setDate(d.getDate() - 1);
    const dataIni = d.toISOString().slice(0, 10);
    const lanIni = crypto.randomUUID();
    for (const p of r.produtos) if (p.inicial) movs.push({
      id: crypto.randomUUID(), local_id: lc.id, data: dataIni, sentido: 'entrada', tipo: 'saldo_inicial',
      item_id: itens.get(semAcento(p.nome)).id, quantidade: p.inicial, obs: 'Estoque inicial da planilha',
      criado_por: quem, ativo: true, lancamento_id: lanIni,
    });
    const lancs = new Map();
    for (const m of r.movs) {
      const chave = [m.data, m.sentido, m.tipo, m.documento || '', m.operador || m.fornecedor || ''].join('|');
      if (!lancs.has(chave)) lancs.set(chave, crypto.randomUUID());
      movs.push({
        id: crypto.randomUUID(), local_id: lc.id, data: m.data, sentido: m.sentido, tipo: m.tipo,
        item_id: itens.get(semAcento(m.produto)).id, quantidade: m.quantidade,
        documento: m.documento, plantio: m.plantio, operador: m.operador, fornecedor: m.fornecedor,
        outra_fazenda: m.outra_fazenda, obs: m.obs, criado_por: quem, ativo: true, lancamento_id: lancs.get(chave),
      });
    }
  }
  await emLotes('est_movimentos', movs, progresso, 'Importando movimentações');
  window.avisarDados && window.avisarDados();

  // 4. confere com o ESTOQUE FINAL da planilha
  const sd = saldos();
  const difs = [];
  for (const r of lidos) for (const p of r.produtos) {
    const v = sd.get(itens.get(semAcento(p.nome)).id) || 0;
    if (Math.abs(v - p.final) > 0.01) difs.push(`${p.nome}: app ${mostrarNumero(Math.round(v * 1000) / 1000)} · planilha ${mostrarNumero(Math.round(p.final * 1000) / 1000)}`);
  }
  window.abrirModal('Importação concluída', `
    <p><strong>${movs.length}</strong> lançamentos importados${novos.length ? ` e <strong>${novos.length}</strong> produtos cadastrados` : ''}.</p>
    ${difs.length ? `<p class="es-nota">${difs.length} produto(s) com saldo diferente do "ESTOQUE FINAL" da planilha
      (normalmente por lançamento feito no app depois):</p><ul class="ct-branco">${difs.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`
      : '<p>O saldo de <strong>todos os produtos</strong> bateu com o "ESTOQUE FINAL" das planilhas.</p>'}
    ${novos.length ? '<p class="dc-sem">Confira a unidade dos produtos novos em Cadastros › Itens (o app deduziu pelo nome).</p>' : ''}
    <div class="barra fim"><button class="btn principal" type="button" onclick="fecharModal()">Ver o estoque</button></div>`);
  desenharVisao();
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
