// abas-controle.js — Riscos, Custos, Mudanças e Problemas/ações corretivas (23/10/2026).
import { esc, gravar, aviso, apagar, dataBR, hojeISO, somarDias, reais, num, pct, todos, doProjeto,
  nivelNum, nivelRisco, NOME_NIVEL, ESTRATEGIAS, SIT_RISCO, nomesSugeridos, datalist, meuNome, projeto } from './dados.js';
import { formModal, etiqueta, vazio, barra } from './ui.js';

const opsEap = r => [['', '— projeto (geral) —'], ...r.arv.filter(i => i.tipo !== 'marco').map(i => [i.id, i._cod + ' ' + i.nome])];
const nomeEap = (r, id) => { const i = r.arv.find(x => x.id === id); return i ? i._cod + ' ' + i.nome : ''; };

/* ============================== RISCOS ============================== */
const ESCALA = [[1, '1 · muito baixa'], [2, '2 · baixa'], [3, '3 · média'], [4, '4 · alta'], [5, '5 · muito alta']];
function camposRisco() {
  return [
    { k: 'descricao', rot: 'Risco (o que pode acontecer)', req: true, plena: true, ph: 'ex.: atraso na entrega do fornecedor de estruturas' },
    { k: 'causa', rot: 'Causa', plena: true },
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: [['ameaca', 'Ameaça'], ['oportunidade', 'Oportunidade']] },
    { k: 'categoria', rot: 'Categoria', lista: 'pjCatRisco' },
    { k: 'probabilidade', rot: 'Probabilidade', tipo: 'select', ops: ESCALA, int: true, padrao: 3 },
    { k: 'impacto', rot: 'Impacto', tipo: 'select', ops: ESCALA, int: true, padrao: 3 },
    { k: 'estrategia', rot: 'Estratégia de resposta', lista: 'pjEstrat' },
    { k: 'situacao', rot: 'Situação', tipo: 'select', ops: Object.entries(SIT_RISCO) },
    { k: 'plano', rot: 'Plano de resposta (o que fazer)', tipo: 'area', plena: true, linhas: 3 },
    { k: 'dono', rot: 'Dono do risco', lista: 'pjNomesRisco' },
    { k: 'prazo', rot: 'Prazo da resposta', tipo: 'date' },
  ];
}
function editarRisco(pid, x, redesenhar) {
  formModal(x ? 'Risco' : 'Novo risco', camposRisco(), x || { tipo: 'ameaca', probabilidade: 3, impacto: 3, situacao: 'aberto' }, async o => {
    await gravar('pj_riscos', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o,
      probabilidade: Number(o.probabilidade || 3), impacto: Number(o.impacto || 3) });
    redesenhar();
  }, {
    extra: datalist('pjCatRisco', ['Técnico', 'Prazo', 'Custo', 'Clima', 'Fornecedor', 'Pessoas', 'Segurança', 'Legal / normas', 'Qualidade', 'Comunicação'])
      + datalist('pjEstrat', [...new Set([...ESTRATEGIAS.ameaca, ...ESTRATEGIAS.oportunidade])])
      + datalist('pjNomesRisco', nomesSugeridos(pid)),
    aoExcluir: x ? async () => { await apagar('pj_riscos', x); redesenhar(); } : null,
  });
}

export function abaRiscos(alvo, r, redesenhar) {
  const pid = r.p.id;
  const lista = r.riscos.slice().sort((a, b) => {
    const fa = a.situacao === 'encerrado' ? 1 : 0, fb = b.situacao === 'encerrado' ? 1 : 0;
    return fa - fb || nivelNum(b) - nivelNum(a);
  });
  const abertos = r.riscosAbertos;
  const conta = (p, i) => abertos.filter(x => Number(x.probabilidade) === p && Number(x.impacto) === i).length;
  const corCel = (p, i) => { const n = p * i; return n >= 15 ? 'alto' : n >= 6 ? 'medio' : 'baixo'; };
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Registro de riscos</h4>
      <p class="dc-sem">Nível = probabilidade × impacto (1 a 25): <b>alto</b> a partir de 15, <b>médio</b> de 6 a 14. Risco alto precisa de plano de resposta.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjRiNovo">+ Risco</button></div></div>
    ${!lista.length ? vazio('Nenhum risco registrado. Pense em prazo, custo, fornecedores, clima, pessoas e segurança.') : `
    <div class="pj-riscos-topo">
      <div class="pj-calor">
        <div class="pj-calor-y">Probabilidade ↑</div>
        <div class="pj-calor-grade">${[5, 4, 3, 2, 1].map(p => [1, 2, 3, 4, 5].map(i => {
          const n = conta(p, i); return `<div class="pj-calor-cel ${corCel(p, i)}">${n || ''}</div>`; }).join('')).join('')}</div>
        <div class="pj-calor-x">Impacto →</div>
      </div>
      <div class="pj-kpis pj-kpis-mini">
        <div><span>Em aberto</span><b>${abertos.length}</b></div>
        <div class="${r.riscosAltos.length ? 'pj-kpi-alerta' : ''}"><span>Altos em aberto</span><b>${r.riscosAltos.length}</b></div>
        <div class="${r.altosSemPlano.length ? 'pj-kpi-alerta' : ''}"><span>Altos sem plano</span><b>${r.altosSemPlano.length}</b></div>
      </div>
    </div>
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Risco</th><th>Categoria</th><th class="ce">P</th><th class="ce">I</th><th class="ce">Nível</th><th>Estratégia</th><th>Plano de resposta</th><th>Dono</th><th>Prazo</th><th>Situação</th></tr></thead>
      <tbody>${lista.map(x => {
        const nv = nivelRisco(x);
        return `<tr class="pj-linha${x.situacao === 'encerrado' ? ' pj-apagada' : ''}" data-ri="${x.id}">
          <td><b>${esc(x.descricao)}</b>${x.tipo === 'oportunidade' ? ' ' + etiqueta('oportunidade', 'aceita') : ''}${x.causa ? `<small class="pj-sub">causa: ${esc(x.causa)}</small>` : ''}</td>
          <td>${esc(x.categoria || '')}</td><td class="ce">${x.probabilidade}</td><td class="ce">${x.impacto}</td>
          <td class="ce"><span class="pj-nivel ${nv}">${nivelNum(x)} · ${NOME_NIVEL[nv]}</span></td>
          <td>${esc(x.estrategia || '')}</td>
          <td>${x.plano ? esc(x.plano) : (nv === 'alto' && x.tipo !== 'oportunidade' ? etiqueta('sem plano', 'perigo') : '')}</td>
          <td>${esc(x.dono || '')}</td><td>${dataBR(x.prazo)}</td><td>${esc(SIT_RISCO[x.situacao] || x.situacao)}</td></tr>`;
      }).join('')}</tbody></table></div>`}`;
  alvo.querySelector('#pjRiNovo').onclick = () => editarRisco(pid, null, redesenhar);
  alvo.querySelectorAll('[data-ri]').forEach(tr => tr.onclick = () => editarRisco(pid, lista.find(x => x.id === tr.dataset.ri), redesenhar));
}

/* ============================== CUSTOS ============================== */
export function abaCustos(alvo, r, redesenhar) {
  const pid = r.p.id;
  const lanc = doProjeto('pj_custos', pid).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // entrega de topo de cada item da EAP (para somar o realizado por entrega)
  const topo = id => { let it = r.arv.find(x => x.id === id); while (it && it.pai_id) { const pai = r.arv.find(x => x.id === it.pai_id); if (!pai) break; it = pai; } return it ? it.id : ''; };
  const raizes = r.arv.filter(i => i._nivel === 0);
  const realPor = {};
  lanc.forEach(c => { const k = c.eap_id ? topo(c.eap_id) : ''; realPor[k] = (realPor[k] || 0) + Number(c.valor || 0); });
  const linhasRes = raizes.map(i => ({ nome: i._cod + ' ' + i.nome, prev: r.calc[i.id].prev, real: realPor[i.id] || 0 }));
  if (realPor[''] || !raizes.length) linhasRes.push({ nome: 'Geral do projeto (sem item da EAP)', prev: 0, real: realPor[''] || 0 });
  const orc = Number(r.p.orcamento || 0);
  const campos = [
    { k: 'data', rot: 'Data', tipo: 'date', req: true },
    { k: 'valor', rot: 'Valor (R$)', tipo: 'dinheiro', req: true },
    { k: 'descricao', rot: 'Descrição', req: true, plena: true },
    { k: 'eap_id', rot: 'Item da EAP', tipo: 'select', ops: opsEap(r), plena: true },
    { k: 'fornecedor', rot: 'Fornecedor' },
    { k: 'documento', rot: 'Documento (NF, pedido)' },
  ];
  const editar = x => formModal(x ? 'Custo lançado' : 'Lançar custo realizado', campos, x || { data: hojeISO() }, async o => {
    await gravar('pj_custos', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o, eap_id: o.eap_id || null, valor: o.valor || 0 });
    redesenhar();
  }, { aoExcluir: x ? async () => { await apagar('pj_custos', x); redesenhar(); } : null });
  const desvio = (prev, real) => prev ? `<span class="${real > prev ? 'pj-neg' : 'pj-pos'}">${reais(real - prev)} (${pct((real - prev) / prev, 1)})</span>` : '—';
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Custos — previsto × realizado</h4>
      <p class="dc-sem">O previsto vem do custo de cada item da EAP; o realizado, dos lançamentos abaixo.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjCuNovo">+ Lançar custo</button></div></div>
    <div class="pj-kpis">
      <div><span>Orçamento vigente</span><b>${reais(orc)}</b><small>${r.p.orcamento_base != null && Number(r.p.orcamento_base) !== orc ? 'linha de base: ' + reais(r.p.orcamento_base) : 'do termo de abertura'}</small></div>
      <div><span>Previsto na EAP</span><b>${reais(r.previstoEap)}</b></div>
      <div class="${orc && r.custoReal > orc ? 'pj-kpi-alerta' : ''}"><span>Realizado</span><b>${reais(r.custoReal)}</b><small>${orc ? pct(r.custoReal / orc) + ' do orçamento' : ''}</small></div>
      <div><span>Valor agregado (VA)</span><b>${reais(r.va)}</b><small>VP ${reais(r.vp)}</small></div>
      <div><span>IDC (CPI)</span><b>${r.cpi == null ? '—' : num(r.cpi)}</b><small>${r.cpi == null ? 'sem custo lançado' : r.cpi >= 1 ? 'gastando menos que o avanço' : 'gastando mais que o avanço'}</small></div>
    </div>
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Entrega</th><th class="dir">Previsto</th><th class="dir">Realizado</th><th>Consumo</th><th class="dir">Desvio</th></tr></thead>
      <tbody>${linhasRes.map(l => `<tr><td>${esc(l.nome)}</td><td class="dir">${reais(l.prev)}</td><td class="dir">${reais(l.real)}</td>
        <td>${l.prev ? barra(l.real / l.prev, l.real > l.prev ? 'estouro' : '') + ' ' + pct(l.real / l.prev) : ''}</td><td class="dir">${desvio(l.prev, l.real)}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="dc-total"><td>Total</td><td class="dir">${reais(r.previstoEap)}</td><td class="dir">${reais(r.custoReal)}</td><td></td><td class="dir">${desvio(r.previstoEap, r.custoReal)}</td></tr></tfoot>
    </table></div>
    <h4 class="pj-sub-tit">Lançamentos</h4>
    ${!lanc.length ? vazio('Nenhum custo lançado.') : `<div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Data</th><th>Descrição</th><th>Item da EAP</th><th>Fornecedor</th><th>Documento</th><th class="dir">Valor</th></tr></thead>
      <tbody>${lanc.map(c => `<tr class="pj-linha" data-cu="${c.id}"><td>${dataBR(c.data)}</td><td><b>${esc(c.descricao)}</b></td><td>${esc(nomeEap(r, c.eap_id) || 'geral')}</td><td>${esc(c.fornecedor || '')}</td><td>${esc(c.documento || '')}</td><td class="dir">${reais(c.valor)}</td></tr>`).join('')}</tbody>
    </table></div>`}`;
  alvo.querySelector('#pjCuNovo').onclick = () => editar(null);
  alvo.querySelectorAll('[data-cu]').forEach(tr => tr.onclick = () => editar(lanc.find(x => x.id === tr.dataset.cu)));
}

/* ============================== MUDANÇAS ============================== */
const SIT_MUD = { pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada' };
export function abaMudancas(alvo, r, redesenhar) {
  const pid = r.p.id;
  const lista = r.mudancas.slice().sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const campos = [
    { k: 'data', rot: 'Data', tipo: 'date', req: true },
    { k: 'solicitante', rot: 'Solicitante', lista: 'pjNomesMud' },
    { k: 'descricao', rot: 'Mudança pedida', tipo: 'area', req: true, plena: true, linhas: 2 },
    { k: 'motivo', rot: 'Motivo', tipo: 'area', plena: true, linhas: 2 },
    { k: 'impacto_prazo_dias', rot: 'Impacto no prazo (dias)', tipo: 'numero', ph: '0 · use negativo para adiantar' },
    { k: 'impacto_custo', rot: 'Impacto no custo (R$)', tipo: 'dinheiro' },
    { k: 'impacto_escopo', rot: 'Impacto no escopo', tipo: 'area', plena: true, linhas: 2 },
  ];
  const editar = x => formModal(x ? 'Pedido de mudança nº ' + x.numero : 'Novo pedido de mudança', campos, x || { data: hojeISO(), solicitante: meuNome() }, async o => {
    const numero = x ? x.numero : todos('pj_mudancas').filter(m => m.projeto_id === pid).reduce((mx, m) => Math.max(mx, m.numero || 0), 0) + 1;
    await gravar('pj_mudancas', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true, situacao: 'pendente', aplicada: false }), ...o,
      numero, impacto_prazo_dias: Math.round(o.impacto_prazo_dias || 0), impacto_custo: o.impacto_custo || 0 });
    redesenhar();
  }, { extra: datalist('pjNomesMud', nomesSugeridos(pid)), aoExcluir: x && x.situacao === 'pendente' ? async () => { await apagar('pj_mudancas', x); redesenhar(); } : null });

  const decidir = x => {
    const cd = [
      { k: 'situacao', rot: 'Decisão', tipo: 'select', ops: [['aprovada', 'Aprovar'], ['rejeitada', 'Rejeitar']] },
      { k: 'decidido_por', rot: 'Decidido por', lista: 'pjNomesDec' },
      { k: 'parecer', rot: 'Parecer', tipo: 'area', plena: true, linhas: 3 },
      { k: 'aplicar', rot: `Aplicar ao projeto: prazo ${x.impacto_prazo_dias >= 0 ? '+' : ''}${x.impacto_prazo_dias || 0} dia(s) e orçamento ${x.impacto_custo >= 0 ? '+' : ''}${reais(x.impacto_custo || 0)}`, tipo: 'check', plena: true },
    ];
    formModal('Decidir a mudança nº ' + x.numero, cd, { situacao: 'aprovada', decidido_por: r.p.patrocinador || meuNome(), aplicar: true }, async o => {
      const aplicar = o.situacao === 'aprovada' && o.aplicar && (x.impacto_prazo_dias || x.impacto_custo);
      await gravar('pj_mudancas', { ...x, situacao: o.situacao, decidido_por: o.decidido_por, parecer: o.parecer, decidido_em: hojeISO(), aplicada: !!aplicar });
      if (aplicar) {
        const p = projeto(pid);
        const novo = { ...p };
        if (x.impacto_prazo_dias && p.fim_previsto) novo.fim_previsto = somarDias(p.fim_previsto, x.impacto_prazo_dias);
        if (x.impacto_custo) novo.orcamento = Number(p.orcamento || 0) + Number(x.impacto_custo);
        await gravar('pj_projetos', novo);
        aviso('Mudança aprovada e aplicada: término ' + dataBR(novo.fim_previsto) + ', orçamento ' + reais(novo.orcamento) + '. A linha de base foi mantida.');
      } else aviso('Mudança ' + (o.situacao === 'aprovada' ? 'aprovada' : 'rejeitada') + '.');
      redesenhar();
    }, { extra: datalist('pjNomesDec', nomesSugeridos(pid)), rotuloSalvar: 'Registrar decisão', antes: `<div class="plena pj-mud-resumo"><b>${esc(x.descricao)}</b>${x.motivo ? '<br><small>' + esc(x.motivo) + '</small>' : ''}</div>` });
  };

  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Controle de mudanças</h4>
      <p class="dc-sem">Toda mudança de escopo, prazo ou custo entra como pedido e só vale depois de aprovada. Aprovada e aplicada, ela altera o prazo e o orçamento vigentes; a linha de base fica guardada.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjMuNovo">+ Pedido de mudança</button></div></div>
    ${!lista.length ? vazio('Nenhum pedido de mudança.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th class="ce">Nº</th><th>Data</th><th>Mudança</th><th>Solicitante</th><th class="dir">Prazo</th><th class="dir">Custo</th><th>Situação</th><th>Decisão</th><th></th></tr></thead>
      <tbody>${lista.map(m => `<tr>
        <td class="ce"><b>${m.numero || ''}</b></td><td>${dataBR(m.data)}</td>
        <td><b>${esc(m.descricao)}</b>${m.impacto_escopo ? `<small class="pj-sub">escopo: ${esc(m.impacto_escopo)}</small>` : ''}</td>
        <td>${esc(m.solicitante || '')}</td>
        <td class="dir">${m.impacto_prazo_dias ? (m.impacto_prazo_dias > 0 ? '+' : '') + m.impacto_prazo_dias + ' d' : '—'}</td>
        <td class="dir">${m.impacto_custo ? reais(m.impacto_custo) : '—'}</td>
        <td>${etiqueta(SIT_MUD[m.situacao], m.situacao === 'aprovada' ? 'aceita' : m.situacao === 'rejeitada' ? 'recusada' : 'alerta')}${m.aplicada ? ' <small class="dc-sem">aplicada</small>' : ''}</td>
        <td>${m.decidido_em ? `${dataBR(m.decidido_em)} · ${esc(m.decidido_por || '')}${m.parecer ? `<small class="pj-sub">${esc(m.parecer)}</small>` : ''}` : ''}</td>
        <td class="pj-acoes">${m.situacao === 'pendente' ? `<button class="btn mini principal" type="button" data-dec="${m.id}">Decidir</button> <button class="btn mini" type="button" data-mu="${m.id}">Editar</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`}`;
  alvo.querySelector('#pjMuNovo').onclick = () => editar(null);
  alvo.querySelectorAll('[data-mu]').forEach(b => b.onclick = () => editar(lista.find(x => x.id === b.dataset.mu)));
  alvo.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => decidir(lista.find(x => x.id === b.dataset.dec)));
}

/* ============================== PROBLEMAS E AÇÕES CORRETIVAS ============================== */
const GRAV = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export function abaProblemas(alvo, r, redesenhar) {
  const pid = r.p.id;
  const lista = doProjeto('pj_ocorrencias', pid).sort((a, b) =>
    (a.situacao === 'aberta' ? 0 : 1) - (b.situacao === 'aberta' ? 0 : 1) || String(b.data).localeCompare(String(a.data)));
  const campos = [
    { k: 'data', rot: 'Data', tipo: 'date', req: true },
    { k: 'gravidade', rot: 'Gravidade', tipo: 'select', ops: Object.entries(GRAV), padrao: 'media' },
    { k: 'descricao', rot: 'Problema / desvio', tipo: 'area', req: true, plena: true, linhas: 2, ph: 'ex.: tarefa de terraplenagem atrasada por chuva' },
    { k: 'eap_id', rot: 'Item da EAP', tipo: 'select', ops: opsEap(r), plena: true },
    { k: 'acao', rot: 'Ação corretiva', tipo: 'area', plena: true, linhas: 2, ph: 'ex.: redistribuir tarefas, horas extras, trocar fornecedor' },
    { k: 'responsavel', rot: 'Responsável', lista: 'pjNomesOc' },
    { k: 'prazo', rot: 'Prazo da ação', tipo: 'date' },
    { k: 'situacao', rot: 'Situação', tipo: 'select', ops: [['aberta', 'Aberta'], ['resolvida', 'Resolvida']] },
  ];
  const editar = x => formModal(x ? 'Problema' : 'Registrar problema', campos, x || { data: hojeISO(), gravidade: 'media', situacao: 'aberta' }, async o => {
    const base = x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true };
    await gravar('pj_ocorrencias', { ...base, ...o, eap_id: o.eap_id || null,
      resolvida_em: o.situacao === 'resolvida' ? (base.resolvida_em || hojeISO()) : null });
    redesenhar();
  }, { extra: datalist('pjNomesOc', nomesSugeridos(pid)), aoExcluir: x ? async () => { await apagar('pj_ocorrencias', x); redesenhar(); } : null });
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Problemas e ações corretivas</h4>
      <p class="dc-sem">Desvios que já aconteceram (diferente de risco, que ainda pode acontecer) e o que foi feito para corrigir.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjOcNovo">+ Problema</button></div></div>
    ${!lista.length ? vazio('Nenhum problema registrado.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Data</th><th>Problema</th><th>Gravidade</th><th>Item</th><th>Ação corretiva</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead>
      <tbody>${lista.map(o => {
        const vencida = o.situacao === 'aberta' && o.prazo && o.prazo < hojeISO();
        return `<tr class="pj-linha${o.situacao === 'resolvida' ? ' pj-apagada' : ''}" data-oc="${o.id}"><td>${dataBR(o.data)}</td><td><b>${esc(o.descricao)}</b></td>
        <td>${etiqueta(GRAV[o.gravidade], o.gravidade === 'alta' ? 'perigo' : o.gravidade === 'media' ? 'alerta' : '')}</td>
        <td>${esc(nomeEap(r, o.eap_id))}</td><td>${esc(o.acao || '')}</td><td>${esc(o.responsavel || '')}</td>
        <td>${dataBR(o.prazo)}${vencida ? ' ' + etiqueta('vencida', 'perigo') : ''}</td>
        <td>${o.situacao === 'resolvida' ? etiqueta('resolvida ' + dataBR(o.resolvida_em), 'aceita') : etiqueta('aberta', 'alerta')}</td></tr>`;
      }).join('')}</tbody></table></div>`}`;
  alvo.querySelector('#pjOcNovo').onclick = () => editar(null);
  alvo.querySelectorAll('[data-oc]').forEach(tr => tr.onclick = () => editar(lista.find(x => x.id === tr.dataset.oc)));
}
