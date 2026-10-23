// abas-plano.js — EAP e cronograma (Gantt simples) e matriz de responsabilidades RACI (23/10/2026).
import { esc, gravar, aviso, apagar, dataBR, dataCurta, hojeISO, diasEntre, somarDias, reais, pct, lerNum,
  nomesSugeridos, datalist, todos, doProjeto, RELACOES, DEPENDENCIAS, rede } from './dados.js';
import { formModal, barra, vazio } from './ui.js';

const TIPOS = { entrega: 'Entrega', tarefa: 'Tarefa', marco: 'Marco' };
const ICONE_TIPO = { entrega: '▣', tarefa: '•', marco: '◆' };

/* ============================== EAP ============================== */
function camposEap(r, it) {
  const entregas = r.arv.filter(x => x.tipo === 'entrega' && (!it || x.id !== it.id));
  return [
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: Object.entries(TIPOS) },
    { k: 'pai_id', rot: 'Dentro de', tipo: 'select', ops: [['', '— topo da EAP —'], ...entregas.map(e => [e.id, e._cod + ' ' + e.nome])] },
    { k: 'nome', rot: 'Nome', req: true, plena: true },
    { k: 'responsavel', rot: 'Responsável', lista: 'pjNomesEap' },
    { k: 'inicio', rot: 'Início', tipo: 'date' },
    { k: 'fim', rot: 'Término previsto', tipo: 'date' },
    { k: 'pct', rot: '% concluído', tipo: 'numero', ph: '0 a 100' },
    { k: 'fim_real', rot: 'Término real', tipo: 'date' },
    { k: 'custo_previsto', rot: 'Custo previsto (R$)', tipo: 'dinheiro' },
    { k: 'duracao', rot: 'Duração (dias)', tipo: 'numero', ph: 'vazio = pelas datas', dica: 'Usada na rede (caminho crítico).' },
    { k: 'dur_otimista', rot: 'PERT · otimista (dias)', tipo: 'numero' },
    { k: 'dur_provavel', rot: 'PERT · mais provável', tipo: 'numero' },
    { k: 'dur_pessimista', rot: 'PERT · pessimista', tipo: 'numero', dica: 'Com as três, a duração é (O + 4M + P) ÷ 6.' },
    // dicionário da EAP
    { k: 'descricao', rot: 'Descrição do trabalho', tipo: 'area', plena: true, linhas: 2 },
    { k: 'criterio_aceite', rot: 'Critério de aceitação / requisitos de qualidade', tipo: 'area', plena: true, linhas: 2, dica: 'Como será conferido que está pronto e bom.' },
    { k: 'premissas', rot: 'Premissas e restrições do item', tipo: 'area', linhas: 2 },
    { k: 'recursos', rot: 'Recursos necessários', tipo: 'area', linhas: 2, ph: 'pessoas, máquinas, materiais' },
    { k: 'referencias', rot: 'Referências técnicas', plena: true, ph: 'norma, procedimento, desenho, manual' },
  ];
}

/* Editor das predecessoras (rede): uma linha por ligação. */
function editorPredecessoras(r, it) {
  const outras = r.folhas.filter(f => !it || f.id !== it.id);
  const linha = (x = {}) => `<div class="pj-pred-linha">
      <select data-p="id"><option value="">— atividade —</option>${outras.map(f => `<option value="${f.id}"${f.id === x.id ? ' selected' : ''}>${esc(f._cod + ' ' + f.nome)}</option>`).join('')}</select>
      <select data-p="rel">${Object.entries(RELACOES).map(([k, n]) => `<option value="${k}"${(x.rel || 'FI') === k ? ' selected' : ''}>${k} · ${n}</option>`).join('')}</select>
      <input type="text" inputmode="numeric" data-p="lag" value="${x.lag ? x.lag : ''}" placeholder="± dias" title="Espera (+) ou antecipação (−), em dias">
      <select data-p="dep">${Object.entries(DEPENDENCIAS).map(([k, n]) => `<option value="${k}"${(x.dep || 'obrigatoria') === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn mini" type="button" data-p="tirar" title="Tirar">×</button></div>`;
  const atuais = (it && Array.isArray(it.predecessoras) ? it.predecessoras : []);
  return {
    html: `<div class="plena pj-preds"><span class="pj-preds-tit">Predecessoras (rede do projeto)</span>
      <small class="pj-dica-campo">Quais atividades vêm antes desta. FI = só começa quando a outra terminar (o mais comum). Espera (+) ou antecipação (−) em dias.</small>
      <div id="pjPredLista">${atuais.map(linha).join('')}</div>
      <button class="btn mini" type="button" id="pjPredMais">+ predecessora</button></div>`,
    ligar(form) {
      const lista = form.querySelector('#pjPredLista');
      const ligarLinha = el => el.querySelector('[data-p="tirar"]').onclick = () => el.remove();
      lista.querySelectorAll('.pj-pred-linha').forEach(ligarLinha);
      form.querySelector('#pjPredMais').onclick = () => {
        lista.insertAdjacentHTML('beforeend', linha());
        ligarLinha(lista.lastElementChild);
      };
    },
    ler(form) {
      return [...form.querySelectorAll('.pj-pred-linha')].map(el => ({
        id: el.querySelector('[data-p="id"]').value,
        rel: el.querySelector('[data-p="rel"]').value,
        lag: Math.round(lerNum(el.querySelector('[data-p="lag"]').value) || 0),
        dep: el.querySelector('[data-p="dep"]').value,
      })).filter(x => x.id);
    },
  };
}

function editarItem(r, it, padrao, redesenhar) {
  const pid = r.p.id;
  const lista = camposEap(r, it);
  const v = it ? { ...todos('pj_eap').find(x => x.id === it.id), pai_id: it.pai_id || '' } : { tipo: 'tarefa', pct: 0, ...padrao };
  const ehFolha = !it || it._folha;
  const preds = editorPredecessoras(r, it);
  formModal(it ? (TIPOS[it.tipo] + ' ' + it._cod) : 'Novo item da EAP', lista, v, async (o, form) => {
    let p = Math.round(Number(o.pct || 0));
    p = Math.max(0, Math.min(100, isNaN(p) ? 0 : p));
    if (o.tipo === 'marco') { o.inicio = o.fim; }
    if (o.inicio && o.fim && o.fim < o.inicio) { aviso('O término não pode ser antes do início.', true); return false; }
    if (o.dur_otimista != null && o.dur_pessimista != null && o.dur_pessimista < o.dur_otimista) { aviso('No PERT, a pessimista não pode ser menor que a otimista.', true); return false; }
    const irmaos = doProjeto('pj_eap', pid).filter(x => (x.pai_id || '') === (o.pai_id || '') && (!it || x.id !== it.id));
    const base = it ? todos('pj_eap').find(x => x.id === it.id) : { id: crypto.randomUUID(), projeto_id: pid, ativo: true,
      ordem: irmaos.reduce((m, x) => Math.max(m, x.ordem || 0), 0) + 1, aceite_situacao: 'pendente' };
    const novo = { ...base, ...o, pai_id: o.pai_id || null, pct: p, custo_previsto: o.custo_previsto || 0 };
    novo.fim_real = p === 100 ? (o.fim_real || (base && base.fim_real) || hojeISO()) : null;
    if (ehFolha) novo.predecessoras = preds.ler(form);
    await gravar('pj_eap', novo);
    // ciclo na rede? avisa (a rede ignora o que fechar o círculo)
    const rd = rede({ ...r, folhas: r.folhas.map(f => f.id === novo.id ? { ...f, ...novo } : f) });
    if (rd.ciclo) aviso('Atenção: as predecessoras formam um círculo (A depende de B que depende de A). Revise a rede.', true);
    redesenhar();
  }, {
    extra: datalist('pjNomesEap', nomesSugeridos(pid)) + (ehFolha ? preds.html : ''),
    aoAbrir: form => { if (ehFolha) preds.ligar(form); },
    aoExcluir: it ? async () => {
      const descendentes = id => doProjeto('pj_eap', pid).filter(x => x.pai_id === id).flatMap(x => [x, ...descendentes(x.id)]);
      const tudo = [todos('pj_eap').find(x => x.id === it.id), ...descendentes(it.id)];
      for (const x of tudo) await apagar('pj_eap', x);
      redesenhar();
    } : null,
  });
}

async function mover(r, it, dir) {
  const irmaos = r.arv.filter(x => (x.pai_id || null) === (it.pai_id || null));
  const i = irmaos.findIndex(x => x.id === it.id), j = i + dir;
  if (j < 0 || j >= irmaos.length) return;
  // renumera os irmãos em sequência e troca os dois
  const ordem = irmaos.map(x => x.id);
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  for (let k = 0; k < ordem.length; k++) {
    const x = todos('pj_eap').find(y => y.id === ordem[k]);
    if (x && x.ordem !== k + 1) await gravar('pj_eap', { ...x, ordem: k + 1 });
  }
}

/* faixa de datas do cronograma */
function faixa(r) {
  const ds = [];
  r.arv.forEach(i => { i.inicio && ds.push(i.inicio); i.fim && ds.push(i.fim); });
  if (r.p.inicio) ds.push(r.p.inicio);
  if (r.p.fim_previsto) ds.push(r.p.fim_previsto);
  if (!ds.length) return null;
  ds.sort();
  let ini = ds[0], fim = ds[ds.length - 1];
  if (fim === ini) fim = somarDias(ini, 7);
  return { ini, fim, dias: diasEntre(ini, fim) + 1 };
}
function reguaMeses(f) {
  const marcas = [];
  let [a, m] = f.ini.split('-').map(Number);
  for (let k = 0; k < 40; k++) {
    const d = a + '-' + String(m).padStart(2, '0') + '-01';
    if (d > f.fim) break;
    const pos = Math.max(0, diasEntre(f.ini, d)) / f.dias * 100;
    marcas.push(`<span style="left:${pos}%">${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}/${String(a).slice(2)}</span>`);
    m++; if (m > 12) { m = 1; a++; }
  }
  return marcas.join('');
}

export function abaEap(alvo, r, redesenhar) {
  const pid = r.p.id, hoje = hojeISO();
  const f = faixa(r);
  const rd = rede(r);
  const crit = id => rd.temDependencia && !rd.ciclo && rd.nos[id] && rd.nos[id].critico;
  const posHoje = f && hoje >= f.ini && hoje <= f.fim ? diasEntre(f.ini, hoje) / f.dias * 100 : null;
  const linhaTempo = it => {
    if (!f || !it.fim) return '<div class="pj-gt"></div>';
    const ini = it.tipo === 'marco' || !it.inicio ? it.fim : it.inicio;
    const left = diasEntre(f.ini, ini) / f.dias * 100;
    const larg = Math.max(0.8, (diasEntre(ini, it.fim) + 1) / f.dias * 100);
    const c = r.calc[it.id];
    const atrasada = it.fim < hoje && c.pct < 1 && it._folha;
    const hojeL = posHoje == null ? '' : `<i class="pj-gt-hoje" style="left:${posHoje}%"></i>`;
    if (it.tipo === 'marco') return `<div class="pj-gt">${hojeL}<b class="pj-gt-marco${c.pct >= 1 ? ' feito' : atrasada ? ' atraso' : ''}" style="left:${left}%" title="${esc(it.nome)} · ${dataBR(it.fim)}"></b></div>`;
    return `<div class="pj-gt">${hojeL}<b class="pj-gt-barra ${it.tipo}${atrasada ? ' atraso' : ''}${crit(it.id) ? ' critica' : ''}" style="left:${left}%;width:${larg}%" title="${esc(it.nome)} · ${dataBR(ini)} a ${dataBR(it.fim)} · ${pct(c.pct)}"><i style="width:${Math.round(c.pct * 100)}%"></i></b></div>`;
  };
  alvo.innerHTML = `
    <div class="pj-secao-topo">
      <div><h4>EAP e cronograma</h4><p class="dc-sem">Estrutura Analítica do Projeto: entregas (▣), tarefas (•) e marcos (◆), com responsável, prazo, % concluído e custo previsto. O % das entregas sai das tarefas de dentro.</p></div>
      <div class="barra">
        <button class="btn principal" type="button" id="pjEapEnt">+ Entrega</button>
        <button class="btn" type="button" id="pjEapMarco">+ Marco</button>
      </div>
    </div>
    ${!r.arv.length ? vazio('EAP vazia. Comece pelas grandes entregas do escopo e quebre cada uma em tarefas.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab pj-eap">
      <thead><tr><th>EAP</th><th>Item</th><th>Responsável</th><th>Início</th><th>Término</th><th class="ce">%</th><th class="dir">Previsto</th>
        <th class="pj-gt-cab">${f ? `<div class="pj-regua">${reguaMeses(f)}</div>` : 'Cronograma'}</th><th></th></tr></thead>
      <tbody>${r.arv.map(it => {
        const c = r.calc[it.id];
        const atrasada = it._folha && it.fim && it.fim < hoje && c.pct < 1;
        return `<tr class="pj-eap-${it.tipo}${atrasada ? ' pj-atrasada' : ''}${c.pct >= 1 ? ' pj-feita' : ''}">
          <td class="pj-cod">${it._cod}</td>
          <td style="padding-left:${8 + it._nivel * 18}px"><span class="pj-tipo ${it.tipo}" title="${TIPOS[it.tipo]}">${ICONE_TIPO[it.tipo]}</span> <b>${esc(it.nome)}</b>${crit(it.id) ? ' <span class="pj-tag critica" title="No caminho crítico: atrasar esta atrasa o projeto">crítica</span>' : ''}${atrasada ? ' <span class="pj-tag perigo">atrasada</span>' : ''}${it.tipo === 'entrega' && it.aceite_situacao !== 'pendente' ? ` <span class="pj-tag ${it.aceite_situacao}">${it.aceite_situacao === 'aceita' ? 'aceita' : 'recusada'}</span>` : ''}</td>
          <td>${esc(it.responsavel || '')}</td>
          <td>${it.tipo === 'marco' ? '' : dataCurta(it.inicio)}</td>
          <td>${dataCurta(it.fim)}</td>
          <td class="ce pj-pct">${it._folha
            ? `<input type="number" min="0" max="100" step="5" value="${Number(it.pct || 0)}" data-pct="${it.id}" aria-label="% concluído">`
            : `${barra(c.pct)}<b>${pct(c.pct)}</b>`}</td>
          <td class="dir">${c.prev ? reais(c.prev) : ''}</td>
          <td class="pj-gt-cel">${linhaTempo(it)}</td>
          <td class="pj-acoes">${it.tipo === 'entrega' ? `<button class="btn mini" type="button" data-filho="${it.id}" title="Tarefa dentro desta entrega">+ tarefa</button>` : ''}
            <button class="btn mini" type="button" data-up="${it.id}" title="Subir">↑</button><button class="btn mini" type="button" data-dn="${it.id}" title="Descer">↓</button>
            <button class="btn mini" type="button" data-ed="${it.id}">Editar</button></td>
        </tr>`; }).join('')}</tbody>
      <tfoot><tr class="dc-total"><td></td><td><b>Projeto</b></td><td></td><td>${dataCurta(r.p.inicio)}</td><td>${dataCurta(r.p.fim_previsto)}</td>
        <td class="ce">${barra(r.fisico)}<b>${pct(r.fisico)}</b></td><td class="dir">${reais(r.previstoEap)}</td><td class="dc-sem">planejado hoje: ${pct(r.planejado)}</td><td></td></tr></tfoot>
    </table></div>
    <p class="dc-sem" style="margin-top:6px">Barra verde = feito; contorno vermelho = atrasada; barra marrom = caminho crítico; linha marrom = hoje. As predecessoras e a duração ficam no Editar de cada tarefa; a rede completa está na aba Rede do projeto. ${r.p.orcamento && r.previstoEap && Math.abs(r.previstoEap - r.p.orcamento) > 0.5 ? `Soma prevista na EAP (${reais(r.previstoEap)}) diferente do orçamento do termo (${reais(r.p.orcamento)}).` : ''}</p>`}`;

  alvo.querySelector('#pjEapEnt').onclick = () => editarItem(r, null, { tipo: 'entrega' }, redesenhar);
  alvo.querySelector('#pjEapMarco').onclick = () => editarItem(r, null, { tipo: 'marco' }, redesenhar);
  alvo.querySelectorAll('[data-filho]').forEach(b => b.onclick = () => editarItem(r, null, { tipo: 'tarefa', pai_id: b.dataset.filho }, redesenhar));
  alvo.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editarItem(r, r.arv.find(x => x.id === b.dataset.ed), null, redesenhar));
  alvo.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => { await mover(r, r.arv.find(x => x.id === b.dataset.up), -1); redesenhar(); });
  alvo.querySelectorAll('[data-dn]').forEach(b => b.onclick = async () => { await mover(r, r.arv.find(x => x.id === b.dataset.dn), 1); redesenhar(); });
  alvo.querySelectorAll('[data-pct]').forEach(inp => inp.addEventListener('change', async () => {
    const x = todos('pj_eap').find(y => y.id === inp.dataset.pct);
    let v = Math.round(Number(inp.value)); v = Math.max(0, Math.min(100, isNaN(v) ? 0 : v));
    await gravar('pj_eap', { ...x, pct: v, fim_real: v === 100 ? (x.fim_real || hojeISO()) : null });
    inp.blur();
    redesenhar();
  }));
}

/* ============================== RACI ============================== */
const PAPEIS = ['', 'R', 'A', 'C', 'I'];
export function abaRaci(alvo, r, redesenhar) {
  const pid = r.p.id;
  const ps = r.partes;
  const itens = r.arv.filter(i => i.tipo !== 'marco');
  const raci = doProjeto('pj_raci', pid);
  const papel = (e, p) => (raci.find(x => x.eap_id === e && x.parte_id === p) || {}).papel || '';
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Matriz de responsabilidades (RACI)</h4>
      <p class="dc-sem"><b>R</b> = executa · <b>A</b> = aprova e responde pelo resultado (um só por item) · <b>C</b> = é consultado · <b>I</b> = é informado. As colunas são as partes interessadas.</p></div></div>
    ${!ps.length || !itens.length ? vazio(!ps.length ? 'Cadastre as partes interessadas primeiro.' : 'Monte a EAP primeiro.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab pj-raci">
      <thead><tr><th>EAP</th><th>Item</th>${ps.map(p => `<th class="ce" title="${esc(p.papel || '')}">${esc(p.nome.split(' ')[0])}<small>${esc(p.papel || '')}</small></th>`).join('')}<th>Conferência</th></tr></thead>
      <tbody>${itens.map(it => {
        const ps2 = ps.map(p => papel(it.id, p.id));
        const nR = ps2.filter(x => x === 'R').length, nA = ps2.filter(x => x === 'A').length;
        const aviso2 = !nR && !nA ? '' : !nR ? 'sem R' : nA > 1 ? 'mais de um A' : !nA ? 'sem A' : '';
        return `<tr><td class="pj-cod">${it._cod}</td><td style="padding-left:${8 + it._nivel * 14}px">${esc(it.nome)}</td>
          ${ps.map((p, k) => `<td class="ce"><select class="pj-raci-sel r${ps2[k]}" data-e="${it.id}" data-p="${p.id}">${PAPEIS.map(x => `<option${x === ps2[k] ? ' selected' : ''}>${x}</option>`).join('')}</select></td>`).join('')}
          <td>${aviso2 ? `<span class="pj-tag alerta">${aviso2}</span>` : nR ? '<span class="pj-ok">ok</span>' : '<span class="dc-sem">—</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`}`;
  alvo.querySelectorAll('.pj-raci-sel').forEach(s => s.addEventListener('change', async () => {
    const id = s.dataset.e + ':' + s.dataset.p;
    const atual = todos('pj_raci').find(x => x.id === id);
    await gravar('pj_raci', { ...(atual || { id, projeto_id: pid, eap_id: s.dataset.e, parte_id: s.dataset.p }), papel: s.value, ativo: true });
    s.className = 'pj-raci-sel r' + s.value;
    s.blur();
    redesenhar();
  }));
}
