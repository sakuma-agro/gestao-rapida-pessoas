// financeiro.js — Custos da colheita por plantio (20/10/2026).
//
// Como a aba Financeiro da cenoura e o Fechamento Financeiro da batata: soma
// o que foi lançado em cada carga (arranquio, frete, beneficiamento,
// embalagem, aluguel de caixas, MO, serviço) mais os custos lançados à parte
// por plantio (cp_custos). Mostra R$/ha e R$ por unidade (caixa/saca).
// A premissa de frete por carga (batata: R$ 645) entra como sugestão.
// Vendas da batata (relatório da cooperativa) ficam fora por enquanto
// (decisão dele, 20/10/2026).
import { $, esc, pronto, carregando, todos, ativos, gravar, aviso, culturaSel, safraSel, campos, param, rotArea, Maiusc,
  porPlantio, cargasDa, nomePlantio, dataBR, num, reais, lerNumero } from './dados.js';
import { ROT_VALOR } from './cargas.js';
import { baixarXlsx } from '../../js/excel.js';

const TIPOS = ['Frete', 'Beneficiamento', 'Embalagem', 'Arranquio', 'Mão de obra', 'Aluguel de caixas', 'Outros'];
const n0 = v => Number(v) || 0;

function desenhar() {
  const alvo = $('cpFinCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  const fin = campos(cult).financeiro || [];
  const linhas = porPlantio(saf.id, cult);
  const cargas = cargasDa(saf.id);
  const custos = ativos('cp_custos').filter(x => linhas.some(l => l.p.id === x.plantio_id));
  const fretePrem = Number(param(cult, 'frete_por_carga', 0));
  const dados = linhas.map(l => {
    const cs = cargas.filter(c => c.plantio_id === l.p.id);
    const porCampo = Object.fromEntries(fin.map(f => [f, cs.reduce((s, c) => s + n0(c[f]), 0)]));
    const extra = custos.filter(x => x.plantio_id === l.p.id).reduce((s, x) => s + n0(x.valor), 0);
    const total = Object.values(porCampo).reduce((s, v) => s + v, 0) + extra;
    return { l, porCampo, extra, total, sugFrete: fretePrem && !porCampo.valor_frete ? cs.length * fretePrem : 0 };
  });
  const tot = { extra: 0, total: 0, sug: 0, porCampo: Object.fromEntries(fin.map(f => [f, 0])), area: 0, un: 0 };
  for (const d of dados) { tot.extra += d.extra; tot.total += d.total; tot.sug += d.sugFrete; tot.area += d.l.area; tot.un += d.l.un; fin.forEach(f => { tot.porCampo[f] += d.porCampo[f]; }); }
  const u = cult.unidade_nome;
  alvo.innerHTML = `
    <div class="cb-kpis"><div><span>Custo de colheita</span><b>${reais(tot.total)}</b><small>${esc(saf.nome)}</small></div>
      <div><span>Por hectare</span><b>${tot.area ? reais(tot.total / tot.area) : '—'}</b><small>sobre ${num(tot.area, 2)} ha</small></div>
      <div><span>Por ${esc(u)}</span><b>${tot.un ? reais(tot.total / tot.un) : '—'}</b><small>${num(tot.un, 0)} ${esc(u)} colhidas</small></div>
      ${fretePrem ? `<div><span>Frete pela premissa</span><b>${reais(tot.sug)}</b><small>${reais(fretePrem)} × cargas sem frete lançado</small></div>` : ''}</div>
    <div class="barra" style="margin-top:0"><button class="btn principal" type="button" id="cpFinNovo">+ Lançar custo por ${esc(rotArea(cult))}</button>
      <button class="btn" type="button" id="cpFinXls">Excel</button></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>${esc(Maiusc(rotArea(cult)))}</th><th class="dir">Área (ha)</th><th class="ce">Cargas</th>${fin.map(f => `<th class="dir">${esc((ROT_VALOR[f] || f).replace(' (R$)', ''))}</th>`).join('')}<th class="dir">Outros lançados</th>
        <th class="dir">Total</th><th class="dir">R$/ha</th><th class="dir">R$/${esc(u)}</th>${fretePrem ? '<th class="dir">Frete premissa</th>' : ''}</tr></thead>
      <tbody>${dados.map(d => `<tr><td><b>${esc(nomePlantio(d.l.p))}</b></td><td class="dir">${num(d.l.area, 2)}</td><td class="ce">${d.l.cargas || ''}</td>
        ${fin.map(f => `<td class="dir">${d.porCampo[f] ? num(d.porCampo[f], 2) : ''}</td>`).join('')}<td class="dir">${d.extra ? num(d.extra, 2) : ''}</td>
        <td class="dir"><b>${d.total ? num(d.total, 2) : ''}</b></td><td class="dir">${d.total && d.l.area ? num(d.total / d.l.area, 2) : ''}</td><td class="dir">${d.total && d.l.un ? num(d.total / d.l.un, 2) : ''}</td>
        ${fretePrem ? `<td class="dir">${d.sugFrete ? num(d.sugFrete, 2) : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="20" class="vazio">Sem plantios.</td></tr>'}</tbody>
      <tfoot><tr class="dc-total"><td>Total</td><td class="dir">${num(tot.area, 2)}</td><td class="ce">${cargas.length}</td>${fin.map(f => `<td class="dir">${num(tot.porCampo[f], 2)}</td>`).join('')}<td class="dir">${num(tot.extra, 2)}</td>
        <td class="dir">${num(tot.total, 2)}</td><td class="dir">${tot.area ? num(tot.total / tot.area, 2) : ''}</td><td class="dir">${tot.un ? num(tot.total / tot.un, 2) : ''}</td>${fretePrem ? `<td class="dir">${num(tot.sug, 2)}</td>` : ''}</tr></tfoot>
    </table></div>
    ${custos.length ? `<h3 class="cb-secao">Custos lançados à parte</h3>
      <table class="dc-planilha cb-tab"><thead><tr><th>Data</th><th>${esc(Maiusc(rotArea(cult)))}</th><th>Tipo</th><th>Descrição</th><th class="dir">Qtde</th><th class="dir">R$ unit.</th><th class="dir">Valor</th><th></th></tr></thead>
      <tbody>${custos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).map(x => `<tr><td>${dataBR(x.data)}</td><td>${esc(nomePlantio(linhas.find(l => l.p.id === x.plantio_id)?.p))}</td><td>${esc(x.tipo)}</td><td>${esc(x.descricao || '')}</td>
        <td class="dir">${num(x.quantidade, 2)}</td><td class="dir">${num(x.valor_unitario, 2)}</td><td class="dir">${num(x.valor, 2)}</td><td class="dir"><button class="btn mini" type="button" data-editar="${esc(x.id)}">Editar</button></td></tr>`).join('')}</tbody></table>` : ''}`;
  $('cpFinNovo').addEventListener('click', () => editar(null, linhas, cult));
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar, linhas, cult)));
  $('cpFinXls').addEventListener('click', () => baixarXlsx('Custos colheita ' + cult.nome + ' ' + saf.nome.replace(/\//g, '-'), [{
    nome: 'Custos', titulo: 'Custos da colheita — ' + cult.nome + ' ' + saf.nome, subtitulo: 'SAKUMA Agronegócios',
    colunas: [{ rot: Maiusc(rotArea(cult)), larg: 18 }, { rot: 'Área (ha)', tipo: 'num' }, { rot: 'Cargas', tipo: 'num', casas: 0 },
      ...fin.map(f => ({ rot: (ROT_VALOR[f] || f).replace(' (R$)', ''), tipo: 'num' })), { rot: 'Outros', tipo: 'num' }, { rot: 'Total', tipo: 'num' }, { rot: 'R$/ha', tipo: 'num' }, { rot: 'R$/' + u, tipo: 'num' }],
    linhas: dados.map(d => [nomePlantio(d.l.p), d.l.area, d.l.cargas, ...fin.map(f => d.porCampo[f]), d.extra, d.total, d.l.area ? d.total / d.l.area : null, d.l.un ? d.total / d.l.un : null]),
    total: ['Total', tot.area, cargas.length, ...fin.map(f => tot.porCampo[f]), tot.extra, tot.total, tot.area ? tot.total / tot.area : null, tot.un ? tot.total / tot.un : null],
  }]).catch(e => aviso(e.message || String(e), true)));
}

function editar(id, linhas, cult) {
  const x = id ? todos('cp_custos').find(c => c.id === id) : { tipo: 'Frete', ativo: true };
  window.abrirModal(id ? 'Editar custo' : 'Lançar custo', `
    <form class="grade" id="cpFinForm" autocomplete="off">
      <label class="campo plena-2">${esc(Maiusc(rotArea(cult)))} <select name="plantio_id" required>${linhas.map(l => `<option value="${esc(l.p.id)}"${l.p.id === x.plantio_id ? ' selected' : ''}>${esc(nomePlantio(l.p))}</option>`).join('')}</select></label>
      <label class="campo">Tipo <select name="tipo">${TIPOS.map(t => `<option${t === x.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Data <input type="date" name="data" value="${esc(x.data || '')}"></label>
      <label class="campo plena">Descrição <input type="text" name="descricao" value="${esc(x.descricao || '')}" placeholder="ex.: 89 fretes × R$ 645"></label>
      <label class="campo">Quantidade <input type="text" name="quantidade" inputmode="decimal" value="${x.quantidade ? esc(num(x.quantidade, 2)) : ''}"></label>
      <label class="campo">Valor unitário (R$) <input type="text" name="valor_unitario" inputmode="decimal" value="${x.valor_unitario ? esc(num(x.valor_unitario, 2)) : ''}"></label>
      <label class="campo">Valor total (R$) <input type="text" name="valor" inputmode="decimal" value="${x.valor ? esc(num(x.valor, 2)) : ''}" placeholder="qtde × unitário"></label>
      <div class="barra entre plena">${id ? '<button class="btn perigo" type="button" id="cpFinTirar">Excluir</button>' : '<span></span>'}
        <span class="barra" style="margin:0"><button class="btn" type="button" id="cpFinNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></span></div>
    </form>`, corpo => {
    corpo.querySelector('#cpFinNao').onclick = () => window.fecharModal();
    corpo.querySelector('#cpFinTirar')?.addEventListener('click', async () => { await gravar('cp_custos', { ...x, ativo: false }); window.fecharModal(); aviso('Custo excluído.'); desenhar(); });
    corpo.querySelector('#cpFinForm').addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      const q = lerNumero(fd.get('quantidade')), vu = lerNumero(fd.get('valor_unitario'));
      let v = lerNumero(fd.get('valor'));
      if ([q, vu, v].some(n => Number.isNaN(n))) { aviso('Use só números nos valores.', true); return; }
      if (v === null && q !== null && vu !== null) v = q * vu;
      if (!v) { aviso('Informe o valor (ou quantidade e valor unitário).', true); return; }
      await gravar('cp_custos', { ...x, plantio_id: fd.get('plantio_id'), tipo: fd.get('tipo'), data: fd.get('data') || null,
        descricao: String(fd.get('descricao') || '').trim() || null, quantidade: q, valor_unitario: vu, valor: v, ativo: true });
      window.fecharModal(); aviso('Custo salvo.'); desenhar();
    });
  });
}

export function abrirFinanceiro() { desenhar(); }
