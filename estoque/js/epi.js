// epi.js — Estoque › EPIs: Entradas e Saldo de EPI (13/11/2026).
//
// Pedido do Guilherme: "na entrega de EPI, no SST, não quero que tenha entrada
// de EPI lá, somente em estoque. Lá é somente a entrega." As entradas (e o
// saldo por estoque) saíram do SST e vieram para cá. A entrega ao funcionário
// continua no SST › EPI's › Entregas (js/sst-epi-mov.js do app principal) e
// grava no mesmo est_movimentos.
//   · Entrada: compra, transferência ou devolução de funcionário, com o CA
//     (o "lote" do EPI) — origem 'epi'.
//   · Saldo = última contagem de EPIs + entradas − saídas (../../js/epi-saldo.js);
//     a Quebra Cocão, que vive de movimentos, soma tudo.
// Grava pelo núcleo das molduras: funciona sem sinal e envia depois.
import { $, esc, pronto, todos, gravar, aviso, meuNome, souAdmin, locaisDoUsuario, contaNoLocal, mostrarNumero, lerNumero,
  dataBR, hojeISO, minimoDaFazenda } from './dados.js';
import { saldosEpi, ehQuebraCocao, semAcento, casDe } from '../../js/epi-saldo.js';
import { estadoCa } from '../../js/ca.js';

const TIPOS = { compra: 'Compra', transferencia: 'Transferência', devolucao: 'Devolução de funcionário' };
/* Material de limpeza (13/11/2026, pedido dele: "tem como fazer de material de
   limpeza também?"): mesma tela de entrada, sem CA — origem 'limpeza'. */
const CFG = {
  epiEntradas:  { grupo: 'EPIs', origem: 'epi', ca: true, corpo: 'epiEntradasCorpo', titulo: 'Entradas de EPI', um: 'EPI', outro: '+ Outro EPI',
    dica: 'EPI que chegou no estoque — compra, transferência entre fazendas ou devolução de funcionário. A entrega ao funcionário é no SST › EPI\'s › Entregas.' },
  limpEntradas: { grupo: 'Material de limpeza', origem: 'limpeza', ca: false, corpo: 'limpEntradasCorpo', titulo: 'Entradas de material de limpeza', um: 'produto', outro: '+ Outro produto',
    dica: 'Material de limpeza que chegou no estoque — compra ou transferência entre fazendas, com quantidade, valor e fornecedor.' },
};
const TIPOS_LIMP = { compra: 'Compra', transferencia: 'Transferência' };
let C = CFG.epiEntradas;
const F = { mes: hojeISO().slice(0, 7), local: '', busca: '', soMin: false, histBusca: '' };
let telaAberta = null;

const unicos = t => [...new Map(todos(t).map(x => [x.id, x])).values()];
const itens = (grupo = 'EPIs') => unicos('est_itens').filter(i => i.grupo === grupo && i.ativo !== false)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const itemDe = id => unicos('est_itens').find(i => i.id === id) || { nome: '(item apagado)', unidade: '' };
const localDe = id => unicos('est_locais').find(l => l.id === id) || { nome: '—' };
const dados = () => ({ locais: unicos('est_locais'), contagens: todos('est_contagens'), grupos: todos('est_contagem_grupos'),
  linhas: todos('est_contagem_itens'), lotes: todos('est_contagem_lotes'), movimentos: todos('est_movimentos'), itens: todos('est_itens') });
const caObj = ca => { const r = unicos('est_cas').find(x => x.id === ca) || {};
  return { ca, ca_situacao: r.situacao, ca_validade: r.validade, ca_conferido_em: r.conferido_em }; };
const chip = (cor, t) => `<span class="tag ${cor}">${esc(t)}</span>`;
const itemPeloNome = txt => itens(C.grupo).find(i => semAcento(i.nome) === semAcento(txt));
const minimo = (i, localId) => {
  const m = minimoDaFazenda(i.id, localId);
  const v = m && m.estoque_minimo !== null && m.estoque_minimo !== '' && m.estoque_minimo !== undefined ? m.estoque_minimo : i.estoque_minimo;
  return v === null || v === undefined || v === '' ? null : Number(v);
};

/* ===================================================================
   ENTRADAS
   =================================================================== */
function lancamentos() {
  const g = new Map();
  const epis = new Set(itens(C.grupo).map(i => i.id));
  for (const m of unicos('est_movimentos')) {
    if (m.ativo === false || m.sentido !== 'entrada' || m.origem !== C.origem || !epis.has(m.item_id)) continue;
    if (!locaisDoUsuario().some(l => l.id === m.local_id)) continue;
    const k = m.lancamento_id || m.id;
    if (!g.has(k)) g.set(k, { id: k, data: String(m.data).slice(0, 10), local_id: m.local_id, tipo: m.obs && /Devolução/.test(m.obs) ? 'devolucao' : m.tipo,
      documento: m.documento, origem: m.fornecedor || m.outra_fazenda, linhas: [], por: m.criado_por || '' });
    g.get(k).linhas.push(m);
  }
  return [...g.values()].sort((a, b) => b.data.localeCompare(a.data));
}

function desenharEntradas() {
  const alvo = $(C.corpo);
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = lancamentos().filter(e => !F.mes || e.data.startsWith(F.mes));
  alvo.innerHTML = `
    <div class="barra entre">
      <div><h2 style="margin:0">${esc(C.titulo)}</h2>
        <p class="dc-sem" style="margin:2px 0 0">${esc(C.dica)}</p></div>
      <button class="btn principal" type="button" id="epiNova">+ Nova entrada</button>
    </div>
    <div class="barra"><label class="campo">Mês <input type="month" id="epiMes" value="${esc(F.mes)}"></label></div>
    <div class="lista">${lista.length ? lista.map(e => `<div class="item"><span></span>
      <div><div class="nome">${esc(dataBR(e.data))} · ${esc(localDe(e.local_id).nome)} <span class="tag ativo">${esc(TIPOS[e.tipo] || e.tipo || '')}</span></div>
        <div class="sub">${e.linhas.map(l => `${esc(mostrarNumero(l.quantidade))} ${esc(itemDe(l.item_id).unidade || '')} ${esc(itemDe(l.item_id).nome)}${l.ca ? ' (CA ' + esc(l.ca) + ')' : ''}${l.valor_unitario ? ' a R$ ' + esc(Number(l.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ''}`).join(' · ')}
          ${e.documento ? ' · ' + esc(e.documento) : ''}${e.origem ? ' · ' + esc(e.origem) : ''}</div></div>
      <div class="acoes">${souAdmin() ? `<button class="btn mini" type="button" data-cancelar="${esc(e.id)}">Cancelar</button>` : ''}</div>
    </div>`).join('') : `<div class="vazio">Nenhuma entrada ${C.ca ? 'de EPI' : 'de material de limpeza'} neste mês.</div>`}</div>`;
  $('epiNova').onclick = novaEntrada;
  $('epiMes').onchange = ev => { F.mes = ev.target.value; desenharEntradas(); };
  alvo.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
    const e = lista.find(x => x.id === b.dataset.cancelar);
    if (!confirm(`Cancelar a entrada de ${dataBR(e.data)} em ${localDe(e.local_id).nome}?`)) return;
    for (const l of e.linhas) await gravar('est_movimentos', Object.assign({}, l, { ativo: false }));
    desenharEntradas();
  });
}

function novaEntrada() {
  const locais = locaisDoUsuario();
  const linhas = [{ item: '', ca: '', qtd: '', valor: '' }];
  const tipos = C.ca ? TIPOS : TIPOS_LIMP;
  window.abrirModal(C.ca ? 'Nova entrada de EPI' : 'Nova entrada de material de limpeza', `
    <form id="epiForm" autocomplete="off">
      <div class="grade">
        <label class="campo">Estoque <select name="local">${locais.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select></label>
        <label class="campo">Data <input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}" required></label>
        <label class="campo">Tipo <select name="tipo">${Object.entries(tipos).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="campo">NF / documento <input type="text" name="doc" placeholder="nº da nota"></label>
        <label class="campo plena">Origem <input type="text" name="origem" placeholder="${C.ca ? 'fornecedor, fazenda de origem ou funcionário' : 'fornecedor ou fazenda de origem'}"></label>
      </div>
      <div id="epiLinhas" class="epi-linhas"></div>
      <datalist id="epiItens">${itens(C.grupo).map(i => `<option value="${esc(i.nome)}">`).join('')}</datalist>
      <div class="barra"><button class="btn mini" type="button" id="epiMais">${esc(C.outro)}</button></div>
      <p class="aviso erro" id="epiAviso" hidden></p>
      <div class="barra fim"><button class="btn" type="button" id="epiCancelar">Cancelar</button>
        <button class="btn principal" type="submit" id="epiSalvar">Salvar entrada</button></div>
    </form>`, corpo => {
    const f = corpo.querySelector('#epiForm');
    const caSel = (l, i) => {
      const it = l.item ? itemPeloNome(l.item) : null;
      const cas = it ? casDe(it) : [];
      if (!it) return '<select disabled><option>—</option></select>';
      if (!cas.length) return '<span class="dc-sem">sem CA no cadastro</span>';
      if (!cas.includes(l.ca)) l.ca = cas.find(c => !['vencido', 'irregular'].includes(estadoCa(caObj(c)).chave)) || cas[0];
      return `<select data-l="${i}" data-c="ca">${cas.map(c => { const e = estadoCa(caObj(c));
        return `<option value="${esc(c)}"${c === l.ca ? ' selected' : ''}>CA ${esc(c)}${['vencido', 'irregular'].includes(e.chave) ? ' · ' + esc(e.rotulo) : ''}</option>`; }).join('')}</select>`;
    };
    const desenhar = () => {
      corpo.querySelector('#epiLinhas').innerHTML = linhas.map((l, i) => `<div class="epi-linha${C.ca ? '' : ' sem-ca'}">
        <label class="campo">${i ? '' : (C.ca ? 'EPI' : 'Produto')}<input type="text" list="epiItens" data-l="${i}" data-c="item" value="${esc(l.item)}" placeholder="digite o ${esc(C.um)}"></label>
        ${C.ca ? `<label class="campo">${i ? '' : 'CA'}<span data-casel="${i}">${caSel(l, i)}</span></label>` : ''}
        <label class="campo">${i ? '' : 'Qtd'}<input type="text" inputmode="decimal" data-l="${i}" data-c="qtd" value="${esc(l.qtd)}"></label>
        <label class="campo">${i ? '' : 'R$ unit.'}<input type="text" inputmode="decimal" data-l="${i}" data-c="valor" value="${esc(l.valor)}" placeholder="opcional"></label>
        ${linhas.length > 1 ? `<button class="btn mini" type="button" data-tirar="${i}">×</button>` : '<span></span>'}</div>`).join('');
      ligar();
    };
    const ligar = () => {
      corpo.querySelectorAll('#epiLinhas [data-l]').forEach(inp => {
        inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { linhas[+inp.dataset.l][inp.dataset.c] = inp.value; });
        if (inp.dataset.c === 'item' && C.ca) inp.addEventListener('change', () => {
          const i = +inp.dataset.l; linhas[i].ca = '';
          const sp = corpo.querySelector(`[data-casel="${i}"]`); sp.innerHTML = caSel(linhas[i], i);
          sp.querySelector('select')?.addEventListener('change', ev => { linhas[i].ca = ev.target.value; });
        });
      });
      corpo.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => { linhas.splice(+b.dataset.tirar, 1); desenhar(); });
    };
    desenhar();
    corpo.querySelector('#epiMais').onclick = () => { linhas.push({ item: '', ca: '', qtd: '', valor: '' }); desenhar(); };
    corpo.querySelector('#epiCancelar').onclick = window.fecharModal;
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const avisoEl = corpo.querySelector('#epiAviso');
      const erro = t => { avisoEl.textContent = t; avisoEl.hidden = false; };
      const fd = new FormData(f);
      const boas = [];
      for (const l of linhas) {
        if (!l.item.trim()) continue;
        const it = itemPeloNome(l.item), q = lerNumero(l.qtd), v = l.valor ? lerNumero(l.valor) : null;
        if (!it) return erro(`"${l.item}" não está no cadastro de ${C.ca ? 'EPIs' : 'material de limpeza'}.`);
        if (!(q > 0)) return erro(`Quantidade inválida em ${it.nome}.`);
        if (v !== null && !(v >= 0)) return erro(`Valor inválido em ${it.nome}.`);
        boas.push({ it, q, v, ca: C.ca ? l.ca || casDe(it)[0] || null : null });
      }
      if (!boas.length) return erro(`Escolha pelo menos um ${C.um}.`);
      corpo.querySelector('#epiSalvar').disabled = true;
      const tipo = fd.get('tipo'), origem = String(fd.get('origem') || '').trim() || null, lanc = crypto.randomUUID();
      for (const b of boas) await gravar('est_movimentos', { id: crypto.randomUUID(), local_id: fd.get('local'), data: fd.get('data'),
        sentido: 'entrada', tipo: tipo === 'devolucao' ? 'transferencia' : tipo, item_id: b.it.id, quantidade: b.q, valor_unitario: b.v,
        ca: b.ca, documento: String(fd.get('doc') || '').trim() || (tipo === 'devolucao' ? 'Devolução' : null),
        fornecedor: tipo === 'compra' ? origem : null, outra_fazenda: tipo !== 'compra' ? origem : null,
        operador: meuNome(), criado_por: meuNome(), lancamento_id: lanc, ativo: true, origem: C.origem,
        obs: tipo === 'devolucao' ? 'Devolução de EPI pelo funcionário' : null });
      window.fecharModal();
      aviso(C.ca ? 'Entrada de EPI lançada.' : 'Entrada de material de limpeza lançada.');
      desenharEntradas();
    });
  });
}

/* ===================================================================
   SALDO DE EPI
   =================================================================== */
function desenharSaldo() {
  const alvo = $('epiSaldoCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const locais = locaisDoUsuario();
  if (!F.local || !locais.some(l => l.id === F.local)) F.local = (locais[0] || {}).id || '';
  const local = localDe(F.local), qc = ehQuebraCocao(local);
  const sal = saldosEpi(dados(), F.local);
  const q = semAcento(F.busca);
  const linhas = itens().filter(i => contaNoLocal(i, F.local) || sal.has(i.id))
    .map(i => ({ i, s: sal.get(i.id) || { base: 0, entradas: 0, saidas: 0, saldo: 0, porCa: new Map() }, min: minimo(i, F.local) }))
    .filter(x => (!q || semAcento(x.i.nome + ' ' + (x.i.ca || '')).includes(q)) && (!F.soMin || (x.min !== null && x.s.saldo <= x.min)));
  const baseData = [...sal.values()].map(v => v.baseData).find(Boolean) || '';
  const hb = semAcento(F.histBusca);
  const hist = unicos('est_movimentos').filter(m => m.ativo !== false && !m.pendente && m.local_id === F.local && itemDe(m.item_id).grupo === 'EPIs'
    && (!F.mes || String(m.data).startsWith(F.mes)) && (!hb || semAcento(itemDe(m.item_id).nome + ' ' + (m.funcionario || '') + ' ' + (m.documento || '')).includes(hb)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  alvo.innerHTML = `
    <h2 style="margin:0">Saldo de EPI</h2>
    <p class="dc-sem" style="margin:2px 0 8px">${qc ? 'A Quebra Cocão vive de entradas e saídas: saldo = soma dos lançamentos.'
      : `Saldo = ${baseData ? `contagem de EPIs de <b>${esc(dataBR(baseData))}</b>` : '<b>sem contagem de EPIs fechada</b> (parte do zero)'} + entradas − saídas (entregas do SST) lançadas depois dela.`}</p>
    <div class="barra">
      <label class="campo">Estoque <select id="esLocal">${locais.map(l => `<option value="${esc(l.id)}"${l.id === F.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1;min-width:180px">Procurar <input type="text" id="esBusca" value="${esc(F.busca)}" placeholder="EPI ou CA"></label>
      <label class="es-check"><input type="checkbox" id="esMin"${F.soMin ? ' checked' : ''}> só no mínimo ou abaixo</label>
    </div>
    <div class="es-larga"><table class="tabela"><thead><tr><th>EPI</th><th>CA (quanto tem de cada)</th>${qc ? '' : '<th class="ce">Contagem</th>'}<th class="ce">+ Entradas</th><th class="ce">− Saídas</th><th class="ce">Saldo</th><th class="ce">Mínimo</th></tr></thead>
    <tbody>${linhas.map(({ i, s, min }) => {
      const cas = casDe(i), semCa = s.porCa.get('') || 0, baixo = min !== null && s.saldo <= min;
      const txtCa = cas.map(c => { const e = estadoCa(caObj(c));
        return `CA ${esc(c)}${cas.length > 1 ? ': <b>' + esc(mostrarNumero(s.porCa.get(c) || 0)) + '</b>' : ''}${e.rotulo && e.chave !== 'emdia' ? ' ' + chip(e.cor, e.rotulo) : ''}`; }).join('<br>')
        + (semCa && cas.length > 1 ? `<br><small class="dc-sem">sem separar o CA: ${esc(mostrarNumero(semCa))}</small>` : '');
      return `<tr${baixo ? ' class="epi-baixo"' : ''}><td>${esc(i.nome)} <small class="dc-sem">${esc(i.unidade || '')}</small></td><td>${txtCa || '—'}</td>
        ${qc ? '' : `<td class="ce">${esc(mostrarNumero(s.base))}</td>`}<td class="ce">${s.entradas ? esc(mostrarNumero(s.entradas)) : '—'}</td>
        <td class="ce">${s.saidas ? esc(mostrarNumero(s.saidas)) : '—'}</td><td class="ce"><b>${esc(mostrarNumero(s.saldo))}</b></td>
        <td class="ce">${min === null ? '—' : esc(mostrarNumero(min))}${baixo ? ' ' + chip('alerta', 'repor') : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="dc-sem">Nenhum EPI neste filtro.</td></tr>'}</tbody></table></div>
    <h3 style="margin:18px 0 6px">Entradas e saídas de EPI · ${esc(local.nome)}</h3>
    <div class="barra">
      <label class="campo">Mês <input type="month" id="esMes" value="${esc(F.mes)}"></label>
      <label class="campo" style="flex:1;min-width:180px">Procurar <input type="text" id="esHist" value="${esc(F.histBusca)}" placeholder="EPI, funcionário ou documento"></label>
    </div>
    <div class="es-larga"><table class="tabela"><thead><tr><th>Data</th><th>Mov.</th><th>EPI</th><th class="ce">Qtd</th><th>Funcionário / origem</th><th>Documento</th></tr></thead>
    <tbody>${hist.map(m => `<tr><td>${esc(dataBR(m.data))}</td><td>${m.sentido === 'entrada' ? chip('ativo', 'entrada') : chip('inativo', 'saída')}</td>
      <td>${esc(itemDe(m.item_id).nome)}${m.ca ? ` <small class="dc-sem">CA ${esc(m.ca)}</small>` : ''}</td><td class="ce">${esc(mostrarNumero(m.quantidade))}</td>
      <td>${esc(m.funcionario || m.fornecedor || m.outra_fazenda || '—')}</td><td>${esc(m.documento || '—')}</td></tr>`).join('')
      || '<tr><td colspan="6" class="dc-sem">Nada lançado neste mês.</td></tr>'}</tbody></table></div>`;
  $('esLocal').onchange = ev => { F.local = ev.target.value; desenharSaldo(); };
  $('esMin').onchange = ev => { F.soMin = ev.target.checked; desenharSaldo(); };
  $('esMes').onchange = ev => { F.mes = ev.target.value; desenharSaldo(); };
  const busca = (id, campo) => $(id).addEventListener('input', ev => { F[campo] = ev.target.value; const p = ev.target.selectionStart; desenharSaldo(); const el = $(id); el.focus(); el.setSelectionRange(p, p); });
  busca('esBusca', 'busca'); busca('esHist', 'histBusca');
}

const redesenhar = () => { if (CFG[telaAberta]) { C = CFG[telaAberta]; desenharEntradas(); } else if (telaAberta === 'epiSaldo') desenharSaldo(); };
export function abrirEpi(nome) {
  telaAberta = nome;
  window.addEventListener('estoque-dados', redesenhar);
  redesenhar();
}
export function soltarEpi() { telaAberta = null; window.removeEventListener('estoque-dados', redesenhar); }
