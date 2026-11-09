// admmensais.js — Custo Base › Adm mensais (09/11/2026, pedido do Guilherme).
// Substitui a planilha "Lançamento Administrativos Mensais" (CMA2): o que o
// administrativo lança todo mês (salário ADM, consultorias, Starlink, energia,
// contabilidade…). Três telas:
//   amMes       — o mês: valor de cada item e a caixinha "Lançado"
//   amHistorico — item × mês, como a planilha (verde = lançado)
//   amItens     — cadastro: novo, editar, desativar
// Tabelas cb_adm_itens (cadastro) e cb_adm_lanc (id 'AAAA-MM:<item>').
// O Rastro tem a tarefa mensal "Adm - mensais" com o checklist montado deste
// cadastro: marcar "Lançado" aqui marca o item lá (e o contrário).
import { $, esc, pronto, carregando, todos, gravar, aviso, lerNumero, num, reais, nomeMes, mesCurto, mesAtual, mesAnterior, mesSeguinte, meuNome, semAcento } from './dados.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const UNIDADES = ['Matriz', 'Quebra Cocão', 'Lote 35 PADAP', 'Fazenda Faca', 'Fazenda Morro Branco', 'Fazenda Três Riachos'];

const itens = (comInativos) => todos('cb_adm_itens').filter(i => comInativos || i.ativo !== false)
  .slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
const idLanc = (m, itemId) => m + ':' + itemId;
const lancDe = (m, itemId) => todos('cb_adm_lanc').find(l => l.id === idLanc(m, itemId)) || null;
/** O item entra neste mês? Mensal: sempre. Anual: só no mês marcado. */
export const entraNoMes = (i, m) => i.periodicidade !== 'anual' || Number(m.slice(5, 7)) === Number(i.mes_anual || 1);
const itensDoMes = m => itens().filter(i => entraNoMes(i, m));
const valorDe = (i, l) => l && l.valor !== null && l.valor !== undefined ? Number(l.valor) : null;
const grupos = lista => {
  const g = new Map();
  for (const i of lista) { const k = i.grupo || 'Outros'; if (!g.has(k)) g.set(k, []); g.get(k).push(i); }
  return [...g.entries()];
};
const repeteTxt = i => i.periodicidade === 'anual' ? 'todo ano em ' + MESES[(Number(i.mes_anual) || 1) - 1] : 'todo mês';

let mesSel = mesAtual();
let ouvindo = false;

/* ---------------- gravar um lançamento ---------------- */
async function gravarLanc(m, i, mudar) {
  const l = lancDe(m, i.id);
  const reg = { ...(l || { id: idLanc(m, i.id), mes: m, item_id: i.id, valor: null, lancado: false }), ...mudar };
  if ('lancado' in mudar) {
    reg.lancado_em = mudar.lancado ? new Date().toISOString() : null;
    reg.lancado_por = mudar.lancado ? (meuNome() || null) : null;
    // marcar sem valor digitado leva o previsto (como a planilha, que já vinha preenchida)
    if (mudar.lancado && (reg.valor === null || reg.valor === undefined) && i.valor_padrao !== null && i.valor_padrao !== undefined) reg.valor = Number(i.valor_padrao);
  }
  return gravar('cb_adm_lanc', reg);
}

/* ---------------- o mês ---------------- */
function desenharMes() {
  const alvo = $('amMesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = itensDoMes(mesSel);
  let total = 0, previsto = 0, feitos = 0, falta = 0;
  for (const i of lista) {
    const l = lancDe(mesSel, i.id), v = valorDe(i, l);
    const val = v ?? (Number(i.valor_padrao) || 0);
    total += val;
    if (v === null) previsto += Number(i.valor_padrao) || 0;
    if (l?.lancado) feitos++; else falta += val;
  }
  alvo.innerHTML = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn" type="button" id="amAnt" aria-label="Mês anterior">‹</button>
        <label class="campo" style="margin:0">Mês <input type="month" id="amMesInp" value="${esc(mesSel)}"></label>
        <button class="btn" type="button" id="amSeg" aria-label="Mês seguinte">›</button>
        ${mesSel !== mesAtual() ? '<button class="btn" type="button" id="amHoje">Mês atual</button>' : ''}
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="amTodos">Marcar todos como lançados</button>
        <button class="btn" type="button" id="amNovoAtalho">+ Novo lançamento</button>
      </div>
    </div>
    <div class="cb-kpis">
      <div><span>Lançados</span><b>${feitos}/${lista.length}</b><small>${lista.length - feitos ? (lista.length - feitos) + ' para lançar' : 'tudo lançado'}</small></div>
      <div class="cb-kpi-custo"><span>Total do mês</span><b>${esc(reais(total))}</b><small>${previsto ? 'inclui ' + esc(reais(previsto)) + ' de previsto' : 'só valores do mês'}</small></div>
      <div><span>Falta lançar</span><b>${esc(reais(falta))}</b><small>${esc(nomeMes(mesSel))}</small></div>
    </div>
    <p class="dc-sem" style="margin:0 0 8px">Valor em cinza é o <b>previsto</b> (cadastro). Digite o valor da fatura do mês e marque <b>Lançado</b> quando estiver no sistema. Marcar sem digitar leva o previsto.</p>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab am-tab">
      <thead><tr><th>Lançamento</th><th>Unidade</th><th class="dir">Previsto</th><th class="dir">Valor do mês</th><th class="ce">Lançado</th><th>Quem / quando</th></tr></thead>
      <tbody>${grupos(lista).map(([g, its]) => {
        const sub = its.reduce((s, i) => s + (valorDe(i, lancDe(mesSel, i.id)) ?? (Number(i.valor_padrao) || 0)), 0);
        const ok = its.filter(i => lancDe(mesSel, i.id)?.lancado).length;
        return `<tr class="am-grupo"><td colspan="2"><b>${esc(g)}</b> <small class="dc-sem">${ok}/${its.length}</small></td><td></td><td class="dir"><b>${esc(num(sub))}</b></td><td class="ce"><button class="btn mini" type="button" data-grupo="${esc(g)}">marcar grupo</button></td><td></td></tr>` +
        its.map(i => {
          const l = lancDe(mesSel, i.id), v = valorDe(i, l);
          return `<tr class="${l?.lancado ? 'am-ok' : 'am-pend'}">
            <td><b>${esc(i.nome)}</b>${i.detalhe ? `<small class="cb-meses-lista">${esc(i.detalhe)}</small>` : ''}</td>
            <td>${esc(i.unidade || '—')}</td>
            <td class="dir dc-sem">${esc(num(i.valor_padrao))}</td>
            <td class="dir"><input class="am-valor" type="text" inputmode="decimal" data-valor="${esc(i.id)}" value="${v === null ? '' : esc(num(v))}" placeholder="${esc(num(i.valor_padrao))}" aria-label="Valor de ${esc(i.nome)}"></td>
            <td class="ce"><input type="checkbox" data-lanc="${esc(i.id)}"${l?.lancado ? ' checked' : ''} aria-label="${esc(i.nome)} lançado"></td>
            <td class="dc-sem">${l?.lancado ? esc(l.lancado_por || '') + (l.lancado_em ? ' · ' + new Date(l.lancado_em).toLocaleDateString('pt-BR') : '') : '<span class="am-tag">pendente</span>'}</td>
          </tr>`; }).join(''); }).join('') || '<tr><td colspan="6" class="vazio">Nenhum lançamento cadastrado para este mês.</td></tr>'}
      </tbody>
      <tfoot><tr class="am-total"><td colspan="3"><b>Total</b></td><td class="dir"><b>${esc(num(total))}</b></td><td class="ce"><b>${feitos}/${lista.length}</b></td><td></td></tr></tfoot>
    </table></div>`;

  const ir = m => { mesSel = m; desenharMes(); };
  $('amAnt').onclick = () => ir(mesAnterior(mesSel));
  $('amSeg').onclick = () => ir(mesSeguinte(mesSel));
  $('amMesInp').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(e.target.value); };
  if ($('amHoje')) $('amHoje').onclick = () => ir(mesAtual());
  $('amNovoAtalho').onclick = () => window.abrirTelaCustoBase && window.abrirTelaCustoBase('amItens');
  alvo.querySelectorAll('[data-valor]').forEach(inp => inp.addEventListener('change', async () => {
    const i = itens(true).find(x => x.id === inp.dataset.valor);
    const v = lerNumero(inp.value);
    if (Number.isNaN(v)) { aviso('Valor: use só números (ex.: 1.234,56).', true); inp.focus(); return; }
    await gravarLanc(mesSel, i, { valor: v });
    desenharMes();
  }));
  alvo.querySelectorAll('[data-lanc]').forEach(cx => cx.addEventListener('change', async () => {
    const i = itens(true).find(x => x.id === cx.dataset.lanc);
    await gravarLanc(mesSel, i, { lancado: cx.checked });
    desenharMes();
  }));
  const marcar = async lista2 => {
    const faltam = lista2.filter(i => !lancDe(mesSel, i.id)?.lancado);
    if (!faltam.length) { aviso('Já está tudo lançado.'); return; }
    if (!confirm(`Marcar ${faltam.length} ${faltam.length === 1 ? 'item' : 'itens'} como lançado em ${nomeMes(mesSel)}? Quem não tiver valor digitado leva o previsto.`)) return;
    for (const i of faltam) await gravarLanc(mesSel, i, { lancado: true });
    aviso(faltam.length + ' marcados como lançados.');
    desenharMes();
  };
  $('amTodos').onclick = () => marcar(lista);
  alvo.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => marcar(lista.filter(i => (i.grupo || 'Outros') === b.dataset.grupo)));
}

/* ---------------- histórico (como a planilha) ---------------- */
let anoHist = Number(mesAtual().slice(0, 4));
function desenharHistorico() {
  const alvo = $('amHistCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ms = Array.from({ length: 12 }, (_, k) => anoHist + '-' + String(k + 1).padStart(2, '0'));
  const lista = itens(true).filter(i => i.ativo !== false || ms.some(m => lancDe(m, i.id)));
  const anos = [...new Set(todos('cb_adm_lanc').map(l => Number(String(l.mes).slice(0, 4))).concat([Number(mesAtual().slice(0, 4))]))].sort();
  const tot = ms.map(m => lista.reduce((s, i) => s + (Number(lancDe(m, i.id)?.valor) || 0), 0));
  alvo.innerHTML = `
    <div class="barra entre">
      <label class="campo" style="margin:0">Ano <select id="amAno">${anos.map(a => `<option${a === anoHist ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <span class="dc-sem"><span class="am-leg ok"></span> lançado · <span class="am-leg pend"></span> com valor, não lançado · vazio = sem lançamento</span>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab am-hist">
      <thead><tr><th>Lançamento</th>${ms.map(m => `<th class="dir">${esc(mesCurto(m))}</th>`).join('')}<th class="dir">Total</th></tr></thead>
      <tbody>${grupos(lista).map(([g, its]) => `<tr class="am-grupo"><td colspan="14"><b>${esc(g)}</b></td></tr>` + its.map(i => {
        let s = 0;
        return `<tr${i.ativo === false ? ' class="cb-inativa"' : ''}><td>${esc(i.nome)}</td>${ms.map(m => {
          const l = lancDe(m, i.id);
          if (!l) return `<td class="dir${entraNoMes(i, m) ? '' : ' cb-ct-fora'}"></td>`;
          s += Number(l.valor) || 0;
          return `<td class="dir ${l.lancado ? 'am-c-ok' : 'am-c-pend'}" title="${l.lancado ? 'Lançado' : 'Não lançado'}">${l.valor === null || l.valor === undefined ? '✓' : esc(num(l.valor))}</td>`;
        }).join('')}<td class="dir"><b>${esc(num(s))}</b></td></tr>`; }).join('')).join('')}
      </tbody>
      <tfoot><tr class="am-total"><td><b>Total</b></td>${tot.map(t => `<td class="dir"><b>${esc(num(t))}</b></td>`).join('')}<td class="dir"><b>${esc(num(tot.reduce((a, b) => a + b, 0)))}</b></td></tr></tfoot>
    </table></div>`;
  $('amAno').onchange = e => { anoHist = Number(e.target.value); desenharHistorico(); };
}

/* ---------------- cadastro ---------------- */
let verInativos = false;
function formCampos(i = {}) {
  const gs = [...new Set(todos('cb_adm_itens').map(x => x.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const us = [...new Set(UNIDADES.concat(todos('cb_adm_itens').map(x => x.unidade).filter(Boolean)))];
  return `
    <label class="campo">Lançamento <input type="text" name="nome" required value="${esc(i.nome || '')}" placeholder="ex.: Starlink QC 4"></label>
    <label class="campo">Grupo <input type="text" name="grupo" list="amGrupos" value="${esc(i.grupo || '')}" placeholder="ex.: Starlink"></label>
    <label class="campo">Unidade <input type="text" name="unidade" list="amUnids" value="${esc(i.unidade || '')}" placeholder="ex.: Matriz"></label>
    <label class="campo">Valor previsto (R$) <input type="text" name="valor" inputmode="decimal" value="${i.valor_padrao === null || i.valor_padrao === undefined ? '' : esc(num(i.valor_padrao))}" placeholder="ex.: 249,00"></label>
    <label class="campo">Repete <select name="per">
      <option value="mensal"${i.periodicidade !== 'anual' ? ' selected' : ''}>Todo mês</option>
      ${MESES.map((m, k) => `<option value="anual:${k + 1}"${i.periodicidade === 'anual' && Number(i.mes_anual) === k + 1 ? ' selected' : ''}>Todo ano em ${m}</option>`).join('')}
    </select></label>
    <label class="campo plena-2">Detalhe <input type="text" name="detalhe" value="${esc(i.detalhe || '')}" placeholder="titular, nº da instalação, contrato…"></label>
    <datalist id="amGrupos">${gs.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <datalist id="amUnids">${us.map(u => `<option value="${esc(u)}">`).join('')}</datalist>`;
}
function lerForm(f) {
  const nome = String(f.get('nome') || '').trim().replace(/\s+/g, ' ');
  if (!nome) { aviso('Dê um nome ao lançamento.', true); return null; }
  const v = lerNumero(f.get('valor'));
  if (Number.isNaN(v)) { aviso('Valor previsto: use só números.', true); return null; }
  const per = String(f.get('per') || 'mensal');
  const limpa = k => String(f.get(k) || '').trim() || null;
  return {
    nome, grupo: limpa('grupo'), unidade: limpa('unidade'), detalhe: limpa('detalhe'), valor_padrao: v,
    periodicidade: per.startsWith('anual') ? 'anual' : 'mensal', mes_anual: per.startsWith('anual') ? Number(per.split(':')[1]) : null,
  };
}
function desenharItens() {
  const alvo = $('amItensCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = itens(verInativos);
  alvo.innerHTML = `
    <form class="grade cad-novo" id="amNovo" autocomplete="off">
      ${formCampos()}
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <div class="barra entre">
      <span class="dc-sem">${lista.filter(i => i.ativo !== false).length} lançamentos ativos · cada um vira um item do checklist da tarefa mensal "Adm - mensais" no Rastro.</span>
      <label class="cb-check"><input type="checkbox" id="amInativos"${verInativos ? ' checked' : ''}> mostrar desativados</label>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab am-tab">
      <thead><tr><th>Lançamento</th><th>Unidade</th><th>Detalhe</th><th class="dir">Previsto</th><th>Repete</th><th></th></tr></thead>
      <tbody>${grupos(lista).map(([g, its]) => `<tr class="am-grupo"><td colspan="6"><b>${esc(g)}</b> <small class="dc-sem">${its.length}</small></td></tr>` + its.map(i => `
        <tr${i.ativo === false ? ' class="cb-inativa"' : ''}>
          <td><b>${esc(i.nome)}</b>${i.ativo === false ? ' <span class="tag inativo">desativado</span>' : ''}</td>
          <td>${esc(i.unidade || '—')}</td>
          <td class="dc-sem">${esc(i.detalhe || '')}</td>
          <td class="dir">${esc(num(i.valor_padrao))}</td>
          <td>${esc(repeteTxt(i))}</td>
          <td class="dir"><button class="btn mini" type="button" data-editar="${esc(i.id)}">Editar</button></td>
        </tr>`).join('')).join('') || '<tr><td colspan="6" class="vazio">Nenhum lançamento cadastrado.</td></tr>'}
      </tbody></table></div>`;
  $('amNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const r = lerForm(new FormData(e.target));
    if (!r) return;
    if (todos('cb_adm_itens').some(x => x.ativo !== false && semAcento(x.nome) === semAcento(r.nome))) { aviso('Já existe um lançamento com esse nome.', true); return; }
    const ordem = Math.max(0, ...todos('cb_adm_itens').map(x => Number(x.ordem) || 0)) + 1;
    await gravar('cb_adm_itens', { ...r, ordem, ativo: true });
    aviso('Lançamento cadastrado. Já entra no mês e no checklist do Rastro.');
    desenharItens();
  });
  $('amInativos').addEventListener('change', e => { verInativos = e.target.checked; desenharItens(); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
}
function editar(id) {
  const i = todos('cb_adm_itens').find(x => x.id === id);
  if (!i) return;
  window.abrirModal('Editar lançamento', `
    <form class="grade" id="amEd" autocomplete="off">
      ${formCampos(i)}
      <label class="cb-check plena"><input type="checkbox" name="ativo"${i.ativo !== false ? ' checked' : ''}> ativo (entra nos meses e no checklist do Rastro)</label>
      <p class="dc-sem plena" style="margin:0">Mudar o valor previsto não mexe nos meses já lançados.</p>
      <div class="barra fim plena"><button class="btn" type="button" id="amEdCanc">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#amEdCanc').onclick = () => window.fecharModal();
    corpo.querySelector('#amEd').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = lerForm(f);
      if (!r) return;
      await gravar('cb_adm_itens', { ...i, ...r, ativo: f.get('ativo') === 'on' });
      window.fecharModal();
      aviso('Lançamento salvo.');
      desenharItens();
    });
  });
}

const TELAS = { amMes: desenharMes, amHistorico: desenharHistorico, amItens: desenharItens };
const telaDe = { amMes: 'telaAmMes', amHistorico: 'telaAmHistorico', amItens: 'telaAmItens' };
export function abrirAdmMensais(nome) {
  if (!ouvindo) {
    ouvindo = true;
    window.addEventListener('custobase-dados', () => {
      for (const [t, fn] of Object.entries(TELAS)) if ($(telaDe[t]) && !$(telaDe[t]).hidden && !document.activeElement?.matches?.('.am-valor')) fn();
    });
  }
  (TELAS[nome] || desenharMes)();
}
