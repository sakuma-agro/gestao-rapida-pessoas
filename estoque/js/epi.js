// epi.js — Estoque › Estoque EPI e limpeza (13/11/2026).
//
// Histórico:
//  · De manhã: "na entrega de EPI, no SST, não quero que tenha entrada de EPI
//    lá, somente em estoque" — as entradas e o saldo de EPI vieram para cá.
//  · À tarde: "eu tinha feito somente estoque quebra cocão, vamos fazer uma
//    versão de estoque epi e material de limpeza, aonde vai ter entradas,
//    saídas, transferências entre estoque, e ao lançar a entrada ter o botão
//    novo cadastro que abre o painel de cadastro sem fechar a entrada" e
//    "crie também um local aonde cadastramos fornecedores".
//
// Telas: Estoque (saldo por estoque), Entradas, Saídas, Transferências e
// Fornecedores (tabela est_fornecedores). Tudo grava em est_movimentos com
// origem 'epi' (EPIs) ou 'limpeza' (Material de limpeza):
//  · Entrada: compra ou devolução, com fornecedor, NF, quantidade e R$ unit.;
//  · Saída: uso/consumo ou perda/descarte (a entrega de EPI ao funcionário
//    continua no SST › EPI's › Entregas, por causa da ficha — e aparece aqui);
//  · Transferência: uma saída no estoque de origem + uma entrada no de destino,
//    com o mesmo lancamento_id e obs TRANSF.
// Saldo = última contagem do tipo + entradas − saídas depois dela
// (../../js/epi-saldo.js); a Quebra Cocão, que vive de movimentos, soma tudo.
// Grava pelo núcleo das molduras: funciona sem sinal e envia depois.
import { $, esc, pronto, todos, gravar, aviso, meuNome, souAdmin, locaisDoUsuario, contaNoLocal, mostrarNumero, lerNumero,
  dataBR, hojeISO, minimoDaFazenda, UNIDADES } from './dados.js';
import { saldosEpi, ehQuebraCocao, semAcento, casDe } from '../../js/epi-saldo.js';
import { estadoCa } from '../../js/ca.js';

const GRUPOS_EL = ['EPIs', 'Material de limpeza'];
const TRANSF = 'Transferência entre estoques';
const TIPOS_ENT = { compra: 'Compra', devolucao: 'Devolução de funcionário' };
const TIPOS_SAI = { uso: 'Uso / consumo', perda: 'Perda / descarte' };
const F = { mes: hojeISO().slice(0, 7), local: '', busca: '', soMin: false, histBusca: '', grupo: 'EPIs', fBusca: '' };
let telaAberta = null;

const unicos = t => [...new Map(todos(t).map(x => [x.id, x])).values()];
const ehEpi = it => !!it && it.grupo === 'EPIs';
const origemDe = it => ehEpi(it) ? 'epi' : 'limpeza';
const itens = grupo => unicos('est_itens').filter(i => (grupo ? i.grupo === grupo : GRUPOS_EL.includes(i.grupo)) && i.ativo !== false)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const itemDe = id => unicos('est_itens').find(i => i.id === id) || { nome: '(item apagado)', unidade: '' };
const localDe = id => unicos('est_locais').find(l => l.id === id) || { nome: '—' };
const fornecedores = () => unicos('est_fornecedores').filter(f => f.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const dados = () => ({ locais: unicos('est_locais'), contagens: todos('est_contagens'), grupos: todos('est_contagem_grupos'),
  linhas: todos('est_contagem_itens'), lotes: todos('est_contagem_lotes'), movimentos: todos('est_movimentos'), itens: todos('est_itens') });
const caObj = ca => { const r = unicos('est_cas').find(x => x.id === ca) || {};
  return { ca, ca_situacao: r.situacao, ca_validade: r.validade, ca_conferido_em: r.conferido_em }; };
const chip = (cor, t) => `<span class="tag ${cor}">${esc(t)}</span>`;
const itemPeloNome = txt => itens().find(i => semAcento(i.nome) === semAcento(txt));
const reais = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const minimo = (i, localId) => {
  const m = minimoDaFazenda(i.id, localId);
  const v = m && m.estoque_minimo !== null && m.estoque_minimo !== '' && m.estoque_minimo !== undefined ? m.estoque_minimo : i.estoque_minimo;
  return v === null || v === undefined || v === '' ? null : Number(v);
};
/** saldo de um item num estoque (para o aviso de saída maior que o estoque) */
function saldoDe(it, localId) {
  if (!it || !localId) return null;
  const r = saldosEpi(dados(), localId, { grupo: it.grupo }).get(it.id);
  return r ? r.saldo : 0;
}

/* ===================================================================
   LANÇAMENTOS (agrupados por lancamento_id)
   =================================================================== */
function lancamentos(tipo) {
  const ids = new Set(itens().map(i => i.id));
  const meus = new Set(locaisDoUsuario().map(l => l.id));
  const g = new Map();
  for (const m of unicos('est_movimentos')) {
    if (m.ativo === false || m.pendente || !ids.has(m.item_id) || !['epi', 'limpeza'].includes(m.origem)) continue;
    const transf = m.obs === TRANSF;
    if (tipo === 'transf' ? !transf : transf) continue;
    if (tipo === 'entrada' && m.sentido !== 'entrada') continue;
    if (tipo === 'saida' && m.sentido !== 'saida') continue;
    if (!transf && !meus.has(m.local_id)) continue;
    const k = m.lancamento_id || m.id;
    if (!g.has(k)) g.set(k, { id: k, data: String(m.data).slice(0, 10), linhas: [], de: '', para: '', local_id: m.local_id, m });
    const e = g.get(k);
    if (transf) { if (m.sentido === 'saida') { e.de = m.local_id; e.linhas.push(m); } else e.para = m.local_id; e.todas = (e.todas || []).concat(m); }
    else e.linhas.push(m);
  }
  let r = [...g.values()];
  if (tipo === 'transf') r = r.filter(e => meus.has(e.de) || meus.has(e.para));
  return r.sort((a, b) => b.data.localeCompare(a.data));
}
const textoLinhas = (ls, comValor) => ls.map(l => `${esc(mostrarNumero(l.quantidade))} ${esc(itemDe(l.item_id).unidade || '')} ${esc(itemDe(l.item_id).nome)}${l.ca ? ' (CA ' + esc(l.ca) + ')' : ''}${comValor && l.valor_unitario ? ' a R$ ' + esc(reais(l.valor_unitario)) : ''}`).join(' · ');

function desenharLista(tipo) {
  const alvo = $({ entrada: 'epiEntradasCorpo', saida: 'epiSaidasCorpo', transf: 'epiTransfCorpo' }[tipo]);
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = lancamentos(tipo).filter(e => !F.mes || e.data.startsWith(F.mes));
  const T = {
    entrada: ['Entradas', 'EPI e material de limpeza que chegou no estoque — compra ou devolução de funcionário, com fornecedor, NF, quantidade e valor.', '+ Nova entrada'],
    saida: ['Saídas', 'O que saiu do estoque — uso/consumo ou perda/descarte. A entrega de EPI ao funcionário é no SST › EPI\'s › Entregas (aparece aqui também).', '+ Nova saída'],
    transf: ['Transferências entre estoques', 'O que foi de um estoque para outro: sai de um e entra no outro no mesmo lançamento.', '+ Nova transferência'],
  }[tipo];
  alvo.innerHTML = `
    <div class="barra entre">
      <div><h2 style="margin:0">${T[0]}</h2><p class="dc-sem" style="margin:2px 0 0">${esc(T[1])}</p></div>
      <button class="btn principal" type="button" id="mvNovo">${T[2]}</button>
    </div>
    <div class="barra"><label class="campo">Mês <input type="month" id="mvMes" value="${esc(F.mes)}"></label></div>
    <div class="lista">${lista.length ? lista.map(e => {
      const m = e.m;
      const cab = tipo === 'transf'
        ? `${esc(dataBR(e.data))} · ${esc(localDe(e.de).nome)} → ${esc(localDe(e.para).nome)}`
        : `${esc(dataBR(e.data))} · ${esc(localDe(e.local_id).nome)} ${chip(tipo === 'entrada' ? 'ativo' : 'inativo',
          tipo === 'entrada' ? (/Devolução/.test(m.obs || '') ? TIPOS_ENT.devolucao : TIPOS_ENT.compra)
            : m.funcionario ? 'Entrega a funcionário (SST)' : (m.obs === TIPOS_SAI.perda ? TIPOS_SAI.perda : TIPOS_SAI.uso))}`;
      const quem = tipo === 'entrada' ? m.fornecedor || m.outra_fazenda : tipo === 'saida' ? m.funcionario || m.plantio : '';
      return `<div class="item"><span></span>
      <div><div class="nome">${cab}</div>
        <div class="sub">${textoLinhas(e.linhas, tipo === 'entrada')}${m.documento ? ' · ' + esc(m.documento) : ''}${quem ? ' · ' + esc(quem) : ''}</div></div>
      <div class="acoes">${souAdmin() && !(tipo === 'saida' && m.funcionario) ? `<button class="btn mini" type="button" data-cancelar="${esc(e.id)}">Cancelar</button>` : ''}</div>
    </div>`; }).join('') : `<div class="vazio">Nada lançado neste mês.</div>`}</div>`;
  $('mvNovo').onclick = () => formMov(tipo);
  $('mvMes').onchange = ev => { F.mes = ev.target.value; desenharLista(tipo); };
  alvo.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
    const e = lista.find(x => x.id === b.dataset.cancelar);
    if (!confirm(`Cancelar o lançamento de ${dataBR(e.data)}?`)) return;
    for (const l of (e.todas || e.linhas)) await gravar('est_movimentos', Object.assign({}, l, { ativo: false }));
    desenharLista(tipo);
  });
}

/* ===================================================================
   FORMULÁRIO (entrada, saída, transferência) + painéis de cadastro
   =================================================================== */
function formMov(tipo) {
  const locais = locaisDoUsuario();
  if (!locais.length) { aviso('Você não tem estoque liberado.', true); return; }
  const linhas = [{ item: '', ca: '', qtd: '', valor: '' }];
  const ent = tipo === 'entrada', sai = tipo === 'saida', tr = tipo === 'transf';
  const opLocais = sel => locais.map(l => `<option value="${esc(l.id)}"${l.id === sel ? ' selected' : ''}>${esc(l.nome)}</option>`).join('');
  const todosLocais = unicos('est_locais').filter(l => l.ativo !== false);
  const titulo = ent ? 'Nova entrada' : sai ? 'Nova saída' : 'Nova transferência entre estoques';
  window.abrirModal(titulo, `
    <div id="mvForm" class="mv-form">
      <div class="grade">
        ${tr ? `<label class="campo">Sai de <select id="mvLocal">${opLocais(F.local)}</select></label>
          <label class="campo">Vai para <select id="mvPara">${todosLocais.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select></label>`
          : `<label class="campo">Estoque <select id="mvLocal">${opLocais(F.local)}</select></label>`}
        <label class="campo">Data <input type="date" id="mvData" value="${hojeISO()}" max="${hojeISO()}" required></label>
        ${ent ? `<label class="campo">Tipo <select id="mvTipo">${Object.entries(TIPOS_ENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>` : ''}
        ${sai ? `<label class="campo">Tipo <select id="mvTipo">${Object.entries(TIPOS_SAI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>` : ''}
        <label class="campo">${ent ? 'NF / documento' : 'Documento'} <input type="text" id="mvDoc" placeholder="${ent ? 'nº da nota' : 'opcional'}"></label>
        ${ent ? `<label class="campo plena">Fornecedor
            <span class="mv-com-botao"><input type="text" id="mvForn" list="mvFornLista" placeholder="escolha ou digite o fornecedor (na devolução, o funcionário)">
            <button class="btn" type="button" id="mvNovoForn">+ Novo fornecedor</button></span></label>` : ''}
        ${sai ? '<label class="campo plena">Para onde / quem retirou <input type="text" id="mvDest" placeholder="setor, local ou pessoa"></label>' : ''}
      </div>
      <div id="mvSub" class="mv-sub" hidden></div>
      <div id="mvLinhas" class="epi-linhas"></div>
      <datalist id="mvItens">${itens().map(i => `<option value="${esc(i.nome)}">${esc(i.grupo === 'EPIs' ? 'EPI' : 'Limpeza')}</option>`).join('')}</datalist>
      <datalist id="mvFornLista">${fornecedores().map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist>
      <div class="barra"><button class="btn mini" type="button" id="mvMais">+ Outro item</button>
        ${ent ? '<button class="btn mini" type="button" id="mvNovoItem">+ Novo cadastro</button>' : ''}</div>
      <p class="aviso erro" id="mvAviso" hidden></p>
      <div class="barra fim"><button class="btn" type="button" id="mvCancelar">Cancelar</button>
        <button class="btn principal" type="button" id="mvSalvar">${ent ? 'Salvar entrada' : sai ? 'Salvar saída' : 'Salvar transferência'}</button></div>
    </div>`, corpo => {
    const q = s => corpo.querySelector(s);
    const caSel = (l, i) => {
      const it = l.item ? itemPeloNome(l.item) : null;
      if (!it) return '<select disabled><option>—</option></select>';
      if (!ehEpi(it)) return '<span class="dc-sem">—</span>';
      const cas = casDe(it);
      if (!cas.length) return '<span class="dc-sem">sem CA</span>';
      if (!cas.includes(l.ca)) l.ca = cas.find(c => !['vencido', 'irregular'].includes(estadoCa(caObj(c)).chave)) || cas[0];
      return `<select data-l="${i}" data-c="ca">${cas.map(c => { const e = estadoCa(caObj(c));
        return `<option value="${esc(c)}"${c === l.ca ? ' selected' : ''}>CA ${esc(c)}${['vencido', 'irregular'].includes(e.chave) ? ' · ' + esc(e.rotulo) : ''}</option>`; }).join('')}</select>`;
    };
    const temTxt = l => {
      if (ent) return '';
      const it = l.item ? itemPeloNome(l.item) : null;
      const s = saldoDe(it, q('#mvLocal').value);
      return s === null ? '' : `tem ${mostrarNumero(s)} ${it.unidade || ''}`;
    };
    const desenhar = () => {
      q('#mvLinhas').innerHTML = linhas.map((l, i) => `<div class="epi-linha${ent ? '' : ' sem-valor'}">
        <label class="campo">${linhas.length > 1 ? (i + 1) + '. ' : ''}EPI ou produto<input type="text" list="mvItens" data-l="${i}" data-c="item" value="${esc(l.item)}" placeholder="digite o nome"></label>
        <label class="campo">CA<span data-casel="${i}">${caSel(l, i)}</span></label>
        <label class="campo">Qtd<input type="text" inputmode="decimal" data-l="${i}" data-c="qtd" value="${esc(l.qtd)}"><small class="dc-sem" data-tem="${i}">${esc(temTxt(l))}</small></label>
        ${ent ? `<label class="campo">R$ unit.<input type="text" inputmode="decimal" data-l="${i}" data-c="valor" value="${esc(l.valor)}" placeholder="opcional"></label>` : ''}
        ${linhas.length > 1 ? `<button class="btn mini" type="button" data-tirar="${i}">×</button>` : '<span></span>'}</div>`).join('');
      ligar();
    };
    const atualizarLinha = i => {
      const sp = q(`[data-casel="${i}"]`); sp.innerHTML = caSel(linhas[i], i);
      sp.querySelector('select')?.addEventListener('change', ev => { linhas[i].ca = ev.target.value; });
      const t = q(`[data-tem="${i}"]`); if (t) t.textContent = temTxt(linhas[i]);
    };
    const ligar = () => {
      corpo.querySelectorAll('#mvLinhas [data-l]').forEach(inp => {
        inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { linhas[+inp.dataset.l][inp.dataset.c] = inp.value; });
        if (inp.dataset.c === 'item') inp.addEventListener('change', () => { const i = +inp.dataset.l; linhas[i].ca = ''; atualizarLinha(i); });
      });
      corpo.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => { linhas.splice(+b.dataset.tirar, 1); desenhar(); });
    };
    desenhar();
    q('#mvLocal').addEventListener('change', () => linhas.forEach((_, i) => atualizarLinha(i)));
    q('#mvMais').onclick = () => { linhas.push({ item: '', ca: '', qtd: '', valor: '' }); desenhar(); };
    q('#mvCancelar').onclick = window.fecharModal;

    /* ---- painel de cadastro dentro da entrada (não fecha a entrada) ---- */
    const fecharSub = () => { q('#mvSub').hidden = true; q('#mvSub').innerHTML = ''; };
    const abrirSub = (html, aoSalvar) => {
      const sub = q('#mvSub');
      sub.innerHTML = html + `<p class="aviso erro" id="subAviso" hidden></p>
        <div class="barra fim"><button class="btn" type="button" id="subFechar">Fechar</button><button class="btn principal" type="button" id="subOk">Salvar cadastro</button></div>`;
      sub.hidden = false;
      sub.scrollIntoView({ block: 'nearest' });
      sub.querySelector('input')?.focus();
      sub.querySelector('#subFechar').onclick = fecharSub;
      const ok = async () => {
        const err = await aoSalvar(sub);
        if (err) { const a = sub.querySelector('#subAviso'); a.textContent = err; a.hidden = false; }
      };
      sub.querySelector('#subOk').onclick = ok;
      sub.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
    };
    if (ent) q('#mvNovoItem').onclick = () => abrirSub(`<h3>Novo cadastro</h3>
      <div class="grade">
        <label class="campo">Tipo <select id="subGrupo">${GRUPOS_EL.map(g => `<option>${g}</option>`).join('')}</select></label>
        <label class="campo plena">Nome <input type="text" id="subNome" placeholder="ex.: Luva Nitrílica - M ou Detergente 500 mL"></label>
        <label class="campo">Unidade <select id="subUni">${UNIDADES.map(u => `<option${u === 'un' ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="campo" id="subCaCampo">CA <input type="text" id="subCa" placeholder="nº do CA (mais de um: separe por vírgula)"></label>
        <label class="campo">Estoque mínimo <input type="text" inputmode="decimal" id="subMin" placeholder="opcional"></label>
      </div>`, async sub => {
      const grupo = sub.querySelector('#subGrupo').value, nome = sub.querySelector('#subNome').value.trim();
      if (!nome) return 'Escreva o nome.';
      if (itemPeloNome(nome)) return `"${nome}" já está cadastrado.`;
      const min = sub.querySelector('#subMin').value.trim() ? lerNumero(sub.querySelector('#subMin').value) : null;
      if (Number.isNaN(min)) return 'Estoque mínimo: use só números.';
      const ca = grupo === 'EPIs' ? sub.querySelector('#subCa').value.split(/[,/;\s]+/).filter(Boolean).join(', ') || null : null;
      await gravar('est_itens', { nome, grupo, unidade: sub.querySelector('#subUni').value, ca, estoque_minimo: min, pedido_reposicao: null,
        locais_contagem: null, ativo: true, codigo: null, localizacao: null });
      q('#mvItens').innerHTML = itens().map(i => `<option value="${esc(i.nome)}">${esc(i.grupo === 'EPIs' ? 'EPI' : 'Limpeza')}</option>`).join('');
      let i = linhas.findIndex(l => !l.item.trim());
      if (i < 0) { linhas.push({ item: '', ca: '', qtd: '', valor: '' }); i = linhas.length - 1; }
      linhas[i].item = nome; linhas[i].ca = '';
      desenhar();
      fecharSub();
      aviso(`${nome} cadastrado.`);
      q(`#mvLinhas [data-l="${i}"][data-c="qtd"]`)?.focus();
      return '';
    });
    const subGrupo = () => { const g = q('#subGrupo'); if (g) q('#subCaCampo').hidden = g.value !== 'EPIs'; };
    q('#mvSub').addEventListener('change', e => { if (e.target.id === 'subGrupo') subGrupo(); });
    if (ent) q('#mvNovoForn').onclick = () => abrirSub(`<h3>Novo fornecedor</h3>${camposFornecedor({ nome: q('#mvForn').value })}`, async sub => {
      const r = lerFornecedor(sub);
      if (typeof r === 'string') return r;
      await gravar('est_fornecedores', r);
      q('#mvFornLista').innerHTML = fornecedores().map(f => `<option value="${esc(f.nome)}">`).join('');
      q('#mvForn').value = r.nome;
      fecharSub();
      aviso(`Fornecedor ${r.nome} cadastrado.`);
      return '';
    });

    /* ---- salvar ---- */
    q('#mvSalvar').onclick = async () => {
      const avisoEl = q('#mvAviso');
      const erro = t => { avisoEl.textContent = t; avisoEl.hidden = false; };
      const localId = q('#mvLocal').value, data = q('#mvData').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeISO()) return erro('Escolha a data (até hoje).');
      const para = tr ? q('#mvPara').value : '';
      if (tr && para === localId) return erro('Escolha estoques diferentes em "Sai de" e "Vai para".');
      const boas = [];
      for (const l of linhas) {
        if (!l.item.trim()) continue;
        const it = itemPeloNome(l.item), qn = lerNumero(l.qtd), v = ent && l.valor ? lerNumero(l.valor) : null;
        if (!it) return erro(`"${l.item}" não está no cadastro. Use "+ Novo cadastro".`);
        if (!(qn > 0)) return erro(`Quantidade inválida em ${it.nome}.`);
        if (v !== null && !(v >= 0)) return erro(`Valor inválido em ${it.nome}.`);
        boas.push({ it, q: qn, v, ca: ehEpi(it) ? l.ca || casDe(it)[0] || null : null });
      }
      if (!boas.length) return erro('Escolha pelo menos um item.');
      if (!ent) {
        const faltam = boas.filter(b => { const s = saldoDe(b.it, localId); return s !== null && b.q > s; });
        if (faltam.length && !confirm(`Saindo mais do que o estoque registra:\n${faltam.map(b => `${b.it.nome}: sai ${mostrarNumero(b.q)}, tem ${mostrarNumero(saldoDe(b.it, localId))}`).join('\n')}\n\nLançar assim mesmo?`)) return;
      }
      q('#mvSalvar').disabled = true;
      const lanc = crypto.randomUUID(), doc = q('#mvDoc').value.trim() || null, base = { data, lancamento_id: lanc, ativo: true,
        operador: meuNome(), criado_por: meuNome(), documento: doc };
      try {
        if (ent) {
          const tipoE = q('#mvTipo').value, forn = q('#mvForn').value.trim() || null;
          const f = forn && fornecedores().find(x => semAcento(x.nome) === semAcento(forn));
          for (const b of boas) await gravar('est_movimentos', Object.assign({}, base, { local_id: localId, sentido: 'entrada',
            tipo: tipoE === 'devolucao' ? 'transferencia' : 'compra', item_id: b.it.id, quantidade: b.q, valor_unitario: b.v, ca: b.ca,
            fornecedor: tipoE === 'compra' ? forn : null, fornecedor_id: tipoE === 'compra' && f ? f.id : null,
            outra_fazenda: tipoE === 'devolucao' ? forn : null, origem: origemDe(b.it),
            documento: doc || (tipoE === 'devolucao' ? 'Devolução' : null), obs: tipoE === 'devolucao' ? 'Devolução de EPI pelo funcionário' : null }));
        } else if (sai) {
          const tipoS = q('#mvTipo').value, dest = q('#mvDest').value.trim() || null;
          for (const b of boas) await gravar('est_movimentos', Object.assign({}, base, { local_id: localId, sentido: 'saida', tipo: 'uso',
            item_id: b.it.id, quantidade: b.q, ca: b.ca, plantio: dest, origem: origemDe(b.it), obs: tipoS === 'perda' ? TIPOS_SAI.perda : null }));
        } else {
          for (const b of boas) {
            await gravar('est_movimentos', Object.assign({}, base, { local_id: localId, sentido: 'saida', tipo: 'transferencia',
              item_id: b.it.id, quantidade: b.q, ca: b.ca, outra_fazenda: localDe(para).nome, origem: origemDe(b.it), obs: TRANSF }));
            await gravar('est_movimentos', Object.assign({}, base, { local_id: para, sentido: 'entrada', tipo: 'transferencia',
              item_id: b.it.id, quantidade: b.q, ca: b.ca, outra_fazenda: localDe(localId).nome, origem: origemDe(b.it), obs: TRANSF }));
          }
        }
      } catch (e) { q('#mvSalvar').disabled = false; return erro('Não consegui salvar (' + (e.message || e) + ').'); }
      F.local = localId;
      window.fecharModal();
      aviso(ent ? 'Entrada lançada.' : sai ? 'Saída lançada.' : 'Transferência lançada.');
      redesenhar();
    };
  });
}

/* ===================================================================
   FORNECEDORES
   =================================================================== */
function camposFornecedor(f = {}) {
  return `<div class="grade">
    <label class="campo plena">Nome <input type="text" id="foNome" value="${esc(f.nome || '')}" placeholder="razão social ou nome da loja"></label>
    <label class="campo">CNPJ / CPF <input type="text" id="foCnpj" value="${esc(f.cnpj || '')}"></label>
    <label class="campo">Telefone <input type="text" id="foTel" value="${esc(f.telefone || '')}"></label>
    <label class="campo">Contato <input type="text" id="foContato" value="${esc(f.contato || '')}" placeholder="vendedor"></label>
    <label class="campo">Cidade <input type="text" id="foCidade" value="${esc(f.cidade || '')}"></label>
    <label class="campo plena">Observação <input type="text" id="foObs" value="${esc(f.obs || '')}"></label>
  </div>`;
}
function lerFornecedor(raiz, atual = null) {
  const v = id => raiz.querySelector('#' + id).value.trim() || null;
  const nome = v('foNome');
  if (!nome) return 'Escreva o nome do fornecedor.';
  if (fornecedores().some(f => semAcento(f.nome) === semAcento(nome) && (!atual || f.id !== atual.id))) return `"${nome}" já está cadastrado.`;
  return Object.assign({}, atual || { ativo: true }, { nome, cnpj: v('foCnpj'), telefone: v('foTel'), contato: v('foContato'), cidade: v('foCidade'), obs: v('foObs') });
}
function desenharFornecedores() {
  const alvo = $('epiFornCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const b = semAcento(F.fBusca);
  const movs = unicos('est_movimentos').filter(m => m.ativo !== false && m.sentido === 'entrada' && (m.fornecedor_id || m.fornecedor));
  const lista = fornecedores().filter(f => !b || semAcento([f.nome, f.cnpj, f.cidade, f.contato].join(' ')).includes(b)).map(f => {
    const ms = movs.filter(m => m.fornecedor_id === f.id || semAcento(m.fornecedor) === semAcento(f.nome));
    return { f, n: new Set(ms.map(m => m.lancamento_id || m.id)).size, ult: ms.map(m => String(m.data).slice(0, 10)).sort().pop() || '' };
  });
  alvo.innerHTML = `
    <div class="barra entre">
      <div><h2 style="margin:0">Fornecedores</h2><p class="dc-sem" style="margin:2px 0 0">Quem vende EPI e material de limpeza. Aparecem para escolher na entrada.</p></div>
      <button class="btn principal" type="button" id="foNovo">+ Novo fornecedor</button>
    </div>
    <div class="barra"><label class="campo" style="flex:1"><span>Procurar</span><input type="text" id="foBusca" value="${esc(F.fBusca)}" placeholder="nome, CNPJ ou cidade"></label></div>
    <div class="lista">${lista.length ? lista.map(({ f, n, ult }) => `<div class="item"><span></span>
      <div><div class="nome">${esc(f.nome)}</div>
        <div class="sub">${[f.cnpj, f.telefone, f.contato, f.cidade].filter(Boolean).map(esc).join(' · ') || '<span class="dc-sem">sem dados</span>'}
          · ${n ? `${n} ${n === 1 ? 'entrada' : 'entradas'}, última em ${esc(dataBR(ult))}` : 'nenhuma entrada ainda'}</div></div>
      <div class="acoes"><button class="btn mini" type="button" data-editar="${esc(f.id)}">Editar</button></div></div>`).join('')
      : '<div class="vazio">Nenhum fornecedor cadastrado.</div>'}</div>`;
  const editar = f => window.abrirModal(f ? 'Editar fornecedor' : 'Novo fornecedor', `${camposFornecedor(f || {})}
    <p class="aviso erro" id="foAviso" hidden></p>
    <div class="barra entre">${f && souAdmin() ? '<button class="btn" type="button" id="foTirar">Inativar</button>' : '<span></span>'}
      <span class="barra"><button class="btn" type="button" id="foCancelar">Cancelar</button><button class="btn principal" type="button" id="foOk">Salvar</button></span></div>`, corpo => {
    corpo.querySelector('#foCancelar').onclick = window.fecharModal;
    corpo.querySelector('#foOk').onclick = async () => {
      const r = lerFornecedor(corpo, f);
      if (typeof r === 'string') { const a = corpo.querySelector('#foAviso'); a.textContent = r; a.hidden = false; return; }
      await gravar('est_fornecedores', r); window.fecharModal(); desenharFornecedores();
    };
    const t = corpo.querySelector('#foTirar');
    if (t) t.onclick = async () => { if (!confirm(`Inativar ${f.nome}?`)) return; await gravar('est_fornecedores', Object.assign({}, f, { ativo: false })); window.fecharModal(); desenharFornecedores(); };
  });
  $('foNovo').onclick = () => editar(null);
  alvo.querySelectorAll('[data-editar]').forEach(x => x.onclick = () => editar(fornecedores().find(f => f.id === x.dataset.editar)));
  $('foBusca').addEventListener('input', ev => { F.fBusca = ev.target.value; const p = ev.target.selectionStart; desenharFornecedores(); const el = $('foBusca'); el.focus(); el.setSelectionRange(p, p); });
}

/* ===================================================================
   ESTOQUE (saldo por estoque)
   =================================================================== */
function desenharSaldo() {
  const alvo = $('epiSaldoCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const locais = locaisDoUsuario();
  if (!F.local || !locais.some(l => l.id === F.local)) F.local = (locais[0] || {}).id || '';
  const local = localDe(F.local), qc = ehQuebraCocao(local), epi = F.grupo === 'EPIs';
  const sal = saldosEpi(dados(), F.local, { grupo: F.grupo });
  const q = semAcento(F.busca);
  const linhas = itens(F.grupo).filter(i => contaNoLocal(i, F.local) || sal.has(i.id))
    .map(i => ({ i, s: sal.get(i.id) || { base: 0, entradas: 0, saidas: 0, saldo: 0, porCa: new Map() }, min: minimo(i, F.local) }))
    .filter(x => (!q || semAcento(x.i.nome + ' ' + (x.i.ca || '')).includes(q)) && (!F.soMin || (x.min !== null && x.s.saldo <= x.min)));
  const baseData = [...sal.values()].map(v => v.baseData).find(Boolean) || '';
  const hb = semAcento(F.histBusca);
  const hist = unicos('est_movimentos').filter(m => m.ativo !== false && !m.pendente && m.local_id === F.local && itemDe(m.item_id).grupo === F.grupo
    && (!F.mes || String(m.data).startsWith(F.mes)) && (!hb || semAcento(itemDe(m.item_id).nome + ' ' + (m.funcionario || '') + ' ' + (m.documento || '') + ' ' + (m.fornecedor || '')).includes(hb)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const nomeG = epi ? 'EPIs' : 'material de limpeza';
  const cols = epi ? 7 : 6;

  alvo.innerHTML = `
    <div class="barra entre"><h2 style="margin:0">Estoque de EPI e limpeza</h2>
      <div class="ct-chips">${GRUPOS_EL.map(g => `<button type="button" class="ct-chip" data-grupo="${esc(g)}" aria-pressed="${g === F.grupo}">${esc(g)}</button>`).join('')}</div></div>
    <p class="dc-sem" style="margin:2px 0 8px">${qc ? 'A Quebra Cocão vive de entradas e saídas: saldo = soma dos lançamentos.'
      : `Saldo = ${baseData ? `contagem de ${esc(nomeG)} de <b>${esc(dataBR(baseData))}</b>` : `<b>sem contagem de ${esc(nomeG)} fechada</b> (parte do zero)`} + entradas − saídas lançadas depois dela.`}</p>
    <div class="barra">
      <label class="campo">Estoque <select id="esLocal">${locais.map(l => `<option value="${esc(l.id)}"${l.id === F.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1;min-width:180px">Procurar <input type="text" id="esBusca" value="${esc(F.busca)}" placeholder="${epi ? 'EPI ou CA' : 'produto'}"></label>
      <label class="es-check"><input type="checkbox" id="esMin"${F.soMin ? ' checked' : ''}> só no mínimo ou abaixo</label>
    </div>
    <div class="es-larga"><table class="tabela"><thead><tr><th>${epi ? 'EPI' : 'Produto'}</th>${epi ? '<th>CA (quanto tem de cada)</th>' : ''}${qc ? '' : '<th class="ce">Contagem</th>'}<th class="ce">+ Entradas</th><th class="ce">− Saídas</th><th class="ce">Saldo</th><th class="ce">Mínimo</th></tr></thead>
    <tbody>${linhas.map(({ i, s, min }) => {
      const cas = casDe(i), semCa = s.porCa.get('') || 0, baixo = min !== null && s.saldo <= min;
      const txtCa = cas.map(c => { const e = estadoCa(caObj(c));
        return `CA ${esc(c)}${cas.length > 1 ? ': <b>' + esc(mostrarNumero(s.porCa.get(c) || 0)) + '</b>' : ''}${e.rotulo && e.chave !== 'emdia' ? ' ' + chip(e.cor, e.rotulo) : ''}`; }).join('<br>')
        + (semCa && cas.length > 1 ? `<br><small class="dc-sem">sem separar o CA: ${esc(mostrarNumero(semCa))}</small>` : '');
      return `<tr${baixo ? ' class="epi-baixo"' : ''}><td>${esc(i.nome)} <small class="dc-sem">${esc(i.unidade || '')}</small></td>${epi ? `<td>${txtCa || '—'}</td>` : ''}
        ${qc ? '' : `<td class="ce">${esc(mostrarNumero(s.base))}</td>`}<td class="ce">${s.entradas ? esc(mostrarNumero(s.entradas)) : '—'}</td>
        <td class="ce">${s.saidas ? esc(mostrarNumero(s.saidas)) : '—'}</td><td class="ce"><b>${esc(mostrarNumero(s.saldo))}</b></td>
        <td class="ce">${min === null ? '—' : esc(mostrarNumero(min))}${baixo ? ' ' + chip('alerta', 'repor') : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="${cols}" class="dc-sem">Nada neste filtro.</td></tr>`}</tbody></table></div>
    <h3 style="margin:18px 0 6px">Entradas e saídas · ${esc(local.nome)}</h3>
    <div class="barra">
      <label class="campo">Mês <input type="month" id="esMes" value="${esc(F.mes)}"></label>
      <label class="campo" style="flex:1;min-width:180px">Procurar <input type="text" id="esHist" value="${esc(F.histBusca)}" placeholder="item, pessoa, fornecedor ou documento"></label>
    </div>
    <div class="es-larga"><table class="tabela"><thead><tr><th>Data</th><th>Mov.</th><th>Item</th><th class="ce">Qtd</th><th>Origem / destino</th><th>Documento</th></tr></thead>
    <tbody>${hist.map(m => `<tr><td>${esc(dataBR(m.data))}</td><td>${m.obs === TRANSF ? chip('neutra', m.sentido === 'entrada' ? 'transf. entrada' : 'transf. saída') : m.sentido === 'entrada' ? chip('ativo', 'entrada') : chip('inativo', 'saída')}</td>
      <td>${esc(itemDe(m.item_id).nome)}${m.ca ? ` <small class="dc-sem">CA ${esc(m.ca)}</small>` : ''}</td><td class="ce">${esc(mostrarNumero(m.quantidade))}</td>
      <td>${esc(m.funcionario || m.fornecedor || m.outra_fazenda || m.plantio || '—')}</td><td>${esc(m.documento || '—')}</td></tr>`).join('')
      || '<tr><td colspan="6" class="dc-sem">Nada lançado neste mês.</td></tr>'}</tbody></table></div>`;
  alvo.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => { F.grupo = b.dataset.grupo; desenharSaldo(); });
  $('esLocal').onchange = ev => { F.local = ev.target.value; desenharSaldo(); };
  $('esMin').onchange = ev => { F.soMin = ev.target.checked; desenharSaldo(); };
  $('esMes').onchange = ev => { F.mes = ev.target.value; desenharSaldo(); };
  const busca = (id, campo) => $(id).addEventListener('input', ev => { F[campo] = ev.target.value; const p = ev.target.selectionStart; desenharSaldo(); const el = $(id); el.focus(); el.setSelectionRange(p, p); });
  busca('esBusca', 'busca'); busca('esHist', 'histBusca');
}

/* ===================================================================
   ENTREGAS POR FAZENDA (13/11/2026)
   Pedido dele: "vamos vincular esse estoque criado com o SST… criar um módulo
   aonde mostrar o local que foi entregue os EPIs, por exemplo Guilherme, quero
   ver o que foi entregue para usar na FACA - F". Lê as entregas do SST
   (est_movimentos, origem 'epi', saída com funcionário) pela coluna FAZ da
   ficha (m.faz = letra da fazenda de uso).
   =================================================================== */
/* mesma legenda do Modelo da ficha (modelo.legenda_faz) + G = geral */
const FAZENDAS = [{ letra: 'F', nome: 'Faca' }, { letra: 'L', nome: 'Lote 35' }, { letra: 'M', nome: 'Morro Branco' },
  { letra: 'T', nome: 'Três Riachos' }, { letra: 'Q', nome: 'Quebra Cocão' }, { letra: 'G', nome: 'Geral' }];
const MER = { 1: 'Substituição por dano justificado', 2: 'Substituição por dano próprio ou perda', 3: 'Devolução/demissão/mudança de função', 4: 'Primeira entrega/admissão' };   // modelo.legenda_mer
const fazNome = l => { const z = FAZENDAS.find(x => x.letra === String(l || '').toUpperCase()); return z ? `${z.letra} · ${z.nome}` : (l || '—'); };
const inicioMes = () => hojeISO().slice(0, 8) + '01';
const U = { faz: '', func: '', de: '', ate: '' };
function desenharUso() {
  const alvo = $('epiUsoCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  if (!U.de) U.de = inicioMes();
  if (!U.ate) U.ate = hojeISO();
  const fb = semAcento(U.func);
  const meus = new Set(locaisDoUsuario().map(l => l.id));
  const ent = unicos('est_movimentos').filter(m => m.ativo !== false && m.origem === 'epi' && m.sentido === 'saida' && m.funcionario
    && meus.has(m.local_id) && (!U.faz || String(m.faz || '').toUpperCase() === U.faz)
    && String(m.data).slice(0, 10) >= U.de && String(m.data).slice(0, 10) <= U.ate
    && (!fb || semAcento(m.funcionario).includes(fb)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(a.funcionario).localeCompare(String(b.funcionario), 'pt-BR'));
  const porEpi = new Map();
  for (const m of ent) {
    const it = itemDe(m.item_id), k = m.item_id;
    if (!porEpi.has(k)) porEpi.set(k, { it, qtd: 0, cas: new Set(), funcs: new Set() });
    const r = porEpi.get(k); r.qtd += Number(m.quantidade) || 0; if (m.ca) r.cas.add(m.ca); r.funcs.add(m.funcionario);
  }
  const resumo = [...porEpi.values()].sort((a, b) => a.it.nome.localeCompare(b.it.nome, 'pt-BR'));
  const funcs = new Set(ent.map(m => m.funcionario));
  const caChip = ca => { if (!ca) return ''; const e = estadoCa(caObj(ca)); return e.rotulo && e.chave !== 'emdia' ? ' ' + chip(e.cor, e.rotulo) : ''; };
  alvo.innerHTML = `
    <h2 style="margin:0">Entregas por fazenda</h2>
    <p class="dc-sem" style="margin:2px 0 8px">EPIs entregues aos funcionários no SST › EPI's › Entregas, pela fazenda onde vão ser usados (coluna FAZ da ficha).</p>
    <div class="ct-chips">${[{ letra: '', nome: 'Todas' }, ...FAZENDAS].map(z => `<button type="button" class="ct-chip" data-faz="${z.letra}" aria-pressed="${U.faz === z.letra}">${z.letra ? esc(z.letra + ' · ' + z.nome) : 'Todas'}</button>`).join('')}</div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:180px">Funcionário <input type="text" id="usFunc" value="${esc(U.func)}" placeholder="nome do funcionário"></label>
      <label class="campo">De <input type="date" id="usDe" value="${esc(U.de)}" max="${hojeISO()}"></label>
      <label class="campo">Até <input type="date" id="usAte" value="${esc(U.ate)}" max="${hojeISO()}"></label>
      <button class="btn" type="button" id="usImprimir">🖨 Imprimir</button>
    </div>
    <p class="dc-sem"><b>${ent.length}</b> ${ent.length === 1 ? 'entrega' : 'entregas'} · <b>${funcs.size}</b> ${funcs.size === 1 ? 'funcionário' : 'funcionários'} · ${esc(dataBR(U.de))} a ${esc(dataBR(U.ate))}${U.faz ? ' · ' + esc(fazNome(U.faz)) : ''}</p>
    <h3 style="margin:14px 0 6px">Total por EPI</h3>
    <div class="es-larga"><table class="tabela"><thead><tr><th>EPI</th><th>CA</th><th class="ce">Qtd</th><th class="ce">Funcionários</th></tr></thead>
    <tbody>${resumo.map(r => `<tr><td>${esc(r.it.nome)}</td><td>${[...r.cas].map(c => 'CA ' + esc(c) + caChip(c)).join('<br>') || '—'}</td>
      <td class="ce"><b>${esc(mostrarNumero(r.qtd))}</b> <small class="dc-sem">${esc(r.it.unidade || '')}</small></td><td class="ce">${r.funcs.size}</td></tr>`).join('')
      || '<tr><td colspan="4" class="dc-sem">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div>
    <h3 style="margin:18px 0 6px">Entregas</h3>
    <div class="es-larga"><table class="tabela"><thead><tr><th>Data</th><th>Funcionário</th><th>EPI</th><th>CA</th><th class="ce">Qtd</th><th>Motivo</th><th>Fazenda de uso</th><th>Saiu do estoque</th></tr></thead>
    <tbody>${ent.map(m => `<tr><td>${esc(dataBR(m.data))}</td><td>${esc(m.funcionario)}</td><td>${esc(itemDe(m.item_id).nome)}</td>
      <td>${m.ca ? 'CA ' + esc(m.ca) + caChip(m.ca) : '—'}</td><td class="ce">${esc(mostrarNumero(m.quantidade))}</td>
      <td>${esc(MER[m.mer] || m.mer || '—')}</td><td>${esc(fazNome(m.faz))}</td><td>${esc(localDe(m.local_id).nome)}</td></tr>`).join('')
      || '<tr><td colspan="8" class="dc-sem">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div>`;
  alvo.querySelectorAll('[data-faz]').forEach(b => b.onclick = () => { U.faz = b.dataset.faz; desenharUso(); });
  $('usDe').onchange = ev => { U.de = ev.target.value || inicioMes(); desenharUso(); };
  $('usAte').onchange = ev => { U.ate = ev.target.value || hojeISO(); desenharUso(); };
  $('usImprimir').onclick = () => window.print();
  $('usFunc').addEventListener('input', ev => { U.func = ev.target.value; const p = ev.target.selectionStart; desenharUso(); const el = $('usFunc'); el.focus(); el.setSelectionRange(p, p); });
}

const DESENHOS = { epiSaldo: desenharSaldo, epiEntradas: () => desenharLista('entrada'), epiSaidas: () => desenharLista('saida'),
  epiTransf: () => desenharLista('transf'), epiUso: desenharUso, epiForn: desenharFornecedores };
export const TELAS_EPI_ESTOQUE = Object.keys(DESENHOS);
function redesenhar() { if (document.querySelector('#modal:not(.oculto)')) return; (DESENHOS[telaAberta] || (() => {}))(); }
export function abrirEpi(nome) {
  telaAberta = nome;
  window.addEventListener('estoque-dados', redesenhar);
  (DESENHOS[nome] || (() => {}))();
}
export function soltarEpi() { telaAberta = null; window.removeEventListener('estoque-dados', redesenhar); }
