// fretes.js — Financeiro › Controle de pagamento de fretes (26/10/2026).
//
// Pedido do Guilherme: "Custos da colheita por plantio" não vai precisar;
// "quero é um financeiro, controle pagamento fretes". Respostas dele: o valor
// do frete muda por cultura e ele digita na mão; o pagamento é carga por carga.
// Uma linha por carga da cultura/safra escolhida no topo, com o valor do frete
// (cp_cargas.valor_frete, o mesmo campo de "Custos desta carga") e a situação
// do pagamento em campos próprios do frete (frete_situacao, frete_pago_em,
// frete_forma, frete_obs) — situacao_pagto/data_pagto continuam sendo do
// pagamento da cooperativa (batata). Carga com frete "Próprio" ou "Sem frete"
// não entra na lista de pagamento.
import { $, esc, pronto, carregando, gravar, aviso, culturaSel, safraSel, cargasDa, plantio, nomePlantio,
  dataBR, num, reais, lerNumero, semAcento } from './dados.js';
import { baixarXlsx } from '../../js/excel.js';

const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const vazio = v => v === null || v === undefined || v === '';
const pago = c => c.frete_situacao === 'Pago';
const semFrete = c => /pr[óo]prio|sem frete/i.test(c.frete_tipo || '');
const FORMAS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cheque'];
let filtro = 'pendentes', busca = '';

function desenhar() {
  const alvo = $('cpFretesCorpo'); if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  const todas = cargasDa(saf.id).filter(c => !semFrete(c)).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const pend = todas.filter(c => !pago(c)), pg = todas.filter(pago);
  const semValor = pend.filter(c => vazio(c.valor_frete));
  const soma = l => l.reduce((s, c) => s + Number(c.valor_frete || 0), 0);
  let lista = filtro === 'pendentes' ? pend : filtro === 'pagos' ? pg : filtro === 'semvalor' ? semValor : todas;
  if (busca) { const b = semAcento(busca); lista = lista.filter(c => semAcento([c.placa, c.motorista, c.ticket_faz, c.ticket_balanca, (plantio(c.plantio_id) || {}).nome].join(' ')).includes(b)); }
  const porMot = new Map();
  pend.forEach(c => { const k = c.motorista || c.placa || '—'; const x = porMot.get(k) || { n: 0, v: 0 }; x.n++; x.v += Number(c.valor_frete || 0); porMot.set(k, x); });
  alvo.innerHTML = `
    <div class="cb-kpis">
      <div class="cp-k-pend"><span>A pagar</span><b>${reais(soma(pend))}</b><small>${pend.length} carga(s) pendente(s)</small></div>
      <div class="cp-k-ok"><span>Pago</span><b>${reais(soma(pg))}</b><small>${pg.length} carga(s)</small></div>
      <div class="cp-k-div"><span>Sem valor</span><b>${semValor.length}</b><small>carga(s) sem o valor do frete</small></div>
      <div><span>Total da safra</span><b>${reais(soma(todas))}</b><small>${todas.length} carga(s) com frete</small></div>
    </div>
    <div class="barra" style="margin-top:0">
      <label class="campo">Mostrar<select id="cpFrFiltro">${[['pendentes', `A pagar (${pend.length})`], ['semvalor', `Sem valor (${semValor.length})`], ['pagos', `Pagos (${pg.length})`], ['todos', `Todos (${todas.length})`]]
        .map(([v, r]) => `<option value="${v}"${v === filtro ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1;min-width:180px">Procurar<input type="text" id="cpFrBusca" value="${esc(busca)}" placeholder="placa, motorista, ticket…"></label>
      <button class="btn" type="button" id="cpFrXlsx">Excel</button>
    </div>
    ${lista.length ? `<div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Data</th><th>Placa</th><th>Motorista</th><th>Talhão</th><th>Ticket faz.</th><th class="dir">Qtde</th><th class="dir">Peso líq. (kg)</th>
      <th class="dir">Frete (R$)</th><th>Situação</th><th>Pago em</th><th></th></tr></thead><tbody>
      ${lista.map(c => { const p = plantio(c.plantio_id);
        return `<tr><td>${dataBR(c.data)}</td><td>${esc(c.placa || '')}</td><td>${esc(c.motorista || '')}</td><td>${p ? esc(nomePlantio(p)) : '—'}</td><td>${esc(c.ticket_faz || '')}</td>
          <td class="dir">${num(c.quantidade, 0)}</td><td class="dir">${num(c.peso_liquido, 0)}</td>
          <td class="dir">${pago(c) ? `<b>${num(c.valor_frete, 2)}</b>` : `<input type="text" inputmode="decimal" class="cp-fr-valor" data-valor="${esc(c.id)}" value="${vazio(c.valor_frete) ? '' : esc(num(c.valor_frete, 2))}" placeholder="0,00" aria-label="Valor do frete">`}</td>
          <td>${pago(c) ? `<span class="cb-pin ok">Pago</span>${c.frete_forma ? ` <small class="dc-sem">${esc(c.frete_forma)}</small>` : ''}` : '<span class="cb-pin alerta">A pagar</span>'}</td>
          <td>${pago(c) ? dataBR(c.frete_pago_em) : ''}</td>
          <td class="dir">${pago(c) ? `<button class="btn mini" type="button" data-pagar="${esc(c.id)}">Ver</button>` : `<button class="btn mini principal" type="button" data-pagar="${esc(c.id)}">Pagar</button>`}</td></tr>`; }).join('')}
      </tbody><tfoot><tr class="dc-total"><td colspan="7">${lista.length} carga(s)</td><td class="dir">${num(soma(lista), 2)}</td><td colspan="3"></td></tr></tfoot></table></div>`
      : `<div class="vazio">${filtro === 'pendentes' ? 'Nenhum frete a pagar nesta safra.' : 'Nada para mostrar.'}</div>`}
    ${filtro === 'pendentes' && porMot.size > 1 ? `<h3 class="cb-secao">A pagar por motorista</h3><div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Motorista / placa</th><th class="dir">Cargas</th><th class="dir">Valor (R$)</th></tr></thead><tbody>
      ${[...porMot.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="dir">${x.n}</td><td class="dir">${num(x.v, 2)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="dc-sem">O valor do frete é digitado em cada carga (aqui ou na carga, em “Custos desta carga”). Cargas com frete “Próprio” ou “Sem frete” não entram.</p>`;
  $('cpFrFiltro').onchange = e => { filtro = e.target.value; desenhar(); };
  $('cpFrBusca').oninput = e => { busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const i = $('cpFrBusca'); i.focus(); i.setSelectionRange(pos, pos); };
  $('cpFrXlsx').onclick = () => exportar(cult, saf, todas);
  alvo.querySelectorAll('[data-valor]').forEach(inp => inp.addEventListener('change', async () => {
    const c = todas.find(x => x.id === inp.dataset.valor); if (!c) return;
    const v = lerNumero(inp.value);
    if (Number.isNaN(v) || (v !== null && v < 0)) { aviso('Confira o valor do frete.', true); return; }
    await gravar('cp_cargas', { ...c, valor_frete: v }); desenhar();
  }));
  alvo.querySelectorAll('[data-pagar]').forEach(b => b.addEventListener('click', () => formPagar(todas.find(x => x.id === b.dataset.pagar))));
}

function formPagar(c) {
  if (!c) return;
  const p = plantio(c.plantio_id);
  window.abrirModal(pago(c) ? 'Frete pago' : 'Pagar frete', `
    <form class="grade" id="cpFrForm" autocomplete="off">
      <p class="plena dc-sem" style="margin:0">${dataBR(c.data)} · ${esc(c.placa || '')}${c.motorista ? ' · ' + esc(c.motorista) : ''} · ${p ? esc(nomePlantio(p)) : '—'} · ticket ${esc(c.ticket_faz || '—')} · ${num(c.quantidade, 0)} · ${num(c.peso_liquido, 0)} kg</p>
      <label class="campo">Valor do frete (R$)<input type="text" inputmode="decimal" id="frValor" value="${vazio(c.valor_frete) ? '' : esc(num(c.valor_frete, 2))}" required></label>
      <label class="campo">Pago em<input type="date" id="frData" value="${esc(String(c.frete_pago_em || hoje()).slice(0, 10))}"></label>
      <label class="campo">Forma<select id="frForma"><option value=""></option>${FORMAS.map(f => `<option${f === c.frete_forma ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="campo plena">Observação<input type="text" id="frObs" value="${esc(c.frete_obs || '')}"></label>
      <div class="barra entre plena">
        ${pago(c) ? '<button class="btn perigo" type="button" id="frDesfazer">Voltar para “a pagar”</button>' : '<span></span>'}
        <span class="barra" style="margin:0"><button class="btn" type="button" id="frCancelar">Cancelar</button><button class="btn principal" type="submit">${pago(c) ? 'Salvar' : 'Confirmar pagamento'}</button></span>
      </div>
    </form>`, corpo => {
    corpo.querySelector('#frCancelar').onclick = () => window.fecharModal();
    corpo.querySelector('#frDesfazer')?.addEventListener('click', async () => {
      await gravar('cp_cargas', { ...c, frete_situacao: 'Pendente', frete_pago_em: null, frete_forma: null });
      window.fecharModal(); aviso('Frete voltou para “a pagar”.'); desenhar();
    });
    corpo.querySelector('#cpFrForm').addEventListener('submit', async e => {
      e.preventDefault();
      const v = lerNumero($('frValor').value);
      if (v === null || Number.isNaN(v) || v < 0) { aviso('Informe o valor do frete.', true); return; }
      if (!$('frData').value) { aviso('Informe a data do pagamento.', true); return; }
      await gravar('cp_cargas', { ...c, valor_frete: v, frete_situacao: 'Pago', frete_pago_em: $('frData').value, frete_forma: $('frForma').value || null, frete_obs: $('frObs').value.trim() || null });
      window.fecharModal(); aviso('Frete pago: ' + reais(v) + '.'); desenhar();
    });
  });
}

function exportar(cult, saf, todas) {
  baixarXlsx(`Fretes ${cult.nome} ${String(saf.nome).replace(/\//g, '-')}`, [{ nome: 'Fretes', titulo: `Controle de pagamento de fretes · ${cult.nome} · safra ${saf.nome}`,
    colunas: [{ rot: 'Data', larg: 11 }, { rot: 'Placa', larg: 10 }, { rot: 'Motorista', larg: 22 }, { rot: 'Talhão', larg: 18 }, { rot: 'Ticket faz.', larg: 11 },
      { rot: 'Qtde', larg: 8, tipo: 'num' }, { rot: 'Peso líq. (kg)', larg: 13, tipo: 'num' }, { rot: 'Frete (R$)', larg: 12, tipo: 'num', casas: 2 },
      { rot: 'Situação', larg: 10 }, { rot: 'Pago em', larg: 11 }, { rot: 'Forma', larg: 12 }, { rot: 'Observação', larg: 30 }],
    linhas: todas.map(c => [dataBR(c.data), c.placa || '', c.motorista || '', (plantio(c.plantio_id) || {}).nome || '', c.ticket_faz || '',
      c.quantidade == null ? null : Number(c.quantidade), c.peso_liquido == null ? null : Number(c.peso_liquido), c.valor_frete == null ? null : Number(c.valor_frete),
      pago(c) ? 'Pago' : 'A pagar', dataBR(c.frete_pago_em), c.frete_forma || '', c.frete_obs || '']) }]);
}

export function abrirFretes() { desenhar(); }
