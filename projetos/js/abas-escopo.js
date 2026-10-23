// abas-escopo.js — Escopo e requisitos (23/10/2026).
// Material do MBA (Definição do escopo do projeto): escopo do produto (o quê)
// × escopo do projeto (como); premissas, restrições do projeto e restrições do
// produto; requisitos e matriz de rastreabilidade; validar o escopo (aceite
// formal das entregas, ao longo do projeto) e controlar o escopo (mudanças).
import { esc, gravar, aviso, apagar, dataBR, hojeISO, todos, doProjeto, nomesSugeridos, datalist, meuNome, projeto } from './dados.js';
import { formModal, etiqueta, vazio } from './ui.js';
import { imprimirDicionario } from './relatorio.js';

const TIPO_PR = { premissa: 'Premissa', restricao_projeto: 'Restrição do projeto', restricao_produto: 'Restrição do produto' };
const SIT_PR = { valida: 'Assumida', confirmada: 'Confirmada', falhou: 'Não se confirmou' };
const PRIOR = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const SIT_REQ = { proposto: 'Proposto', aprovado: 'Aprovado', atendido: 'Atendido', excluido: 'Excluído (fora do escopo)' };
const ACEITE = { pendente: 'Pendente', aceita: 'Aceita', recusada: 'Recusada' };

/* ============================== aceite das entregas (validar o escopo) ==============================
   Usado aqui e no Encerramento. */
export function painelAceite(r, redesenhar) {
  const html = !r.entregas.length ? vazio('Sem entregas na EAP.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>EAP</th><th>Entrega</th><th>Critério de aceitação</th><th class="ce">Avanço</th><th>Aceite</th><th></th></tr></thead>
      <tbody>${r.entregas.map(e => {
        const c = r.calc[e.id];
        return `<tr><td class="pj-cod">${e._cod}</td><td><b>${esc(e.nome)}</b></td>
          <td>${e.criterio_aceite ? esc(e.criterio_aceite) : '<span class="pj-tag alerta">sem critério</span>'}</td>
          <td class="ce">${Math.round(c.pct * 100)}%</td>
          <td>${etiqueta(ACEITE[e.aceite_situacao || 'pendente'], e.aceite_situacao === 'aceita' ? 'aceita' : e.aceite_situacao === 'recusada' ? 'recusada' : 'alerta')}
            ${e.aceite_em ? `<small class="pj-sub">${dataBR(e.aceite_em)}${e.aceite_por ? ' · ' + esc(e.aceite_por) : ''}${e.aceite_obs ? ' — ' + esc(e.aceite_obs) : ''}</small>` : ''}</td>
          <td class="pj-acoes"><button class="btn mini principal" type="button" data-aceitar="${e.id}">Aceitar</button> <button class="btn mini" type="button" data-recusar="${e.id}">Recusar</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  const ligar = alvo => {
    const decidir = (id, sit) => {
      const e = todos('pj_eap').find(x => x.id === id);
      const c = r.calc[id];
      formModal((sit === 'aceita' ? 'Aceitar' : 'Recusar') + ' a entrega', [
        { k: 'aceite_em', rot: 'Data', tipo: 'date', req: true },
        { k: 'aceite_por', rot: sit === 'aceita' ? 'Aceita por' : 'Recusada por', lista: 'pjNomesAc' },
        { k: 'aceite_obs', rot: sit === 'aceita' ? 'Observação' : 'Motivo da recusa (o que falta)', tipo: 'area', plena: true, linhas: 2, req: sit === 'recusada' },
      ], { aceite_em: hojeISO(), aceite_por: r.p.patrocinador || meuNome() }, async o => {
        await gravar('pj_eap', { ...e, ...o, aceite_situacao: sit });
        aviso('Entrega ' + (sit === 'aceita' ? 'aceita.' : 'recusada.'));
        redesenhar();
      }, {
        extra: datalist('pjNomesAc', nomesSugeridos(r.p.id)),
        antes: `<div class="plena pj-mud-resumo"><b>${esc(e.nome)}</b>${e.criterio_aceite ? `<br><small>Critério: ${esc(e.criterio_aceite)}</small>` : ''}${c && c.pct < 1 && sit === 'aceita' ? `<br><small class="pj-neg">Atenção: a entrega está em ${Math.round(c.pct * 100)}%.</small>` : ''}</div>`,
        rotuloSalvar: sit === 'aceita' ? 'Registrar aceite' : 'Registrar recusa',
      });
    };
    alvo.querySelectorAll('[data-aceitar]').forEach(b => b.onclick = () => decidir(b.dataset.aceitar, 'aceita'));
    alvo.querySelectorAll('[data-recusar]').forEach(b => b.onclick = () => decidir(b.dataset.recusar, 'recusada'));
  };
  return { html, ligar };
}

export function abaEscopo(alvo, r, redesenhar) {
  const p = r.p, pid = p.id;
  const prs = doProjeto('pj_premissas', pid).sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)));
  const reqs = doProjeto('pj_requisitos', pid).sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true }));
  const entrega = id => r.arv.find(x => x.id === id);
  const aceite = painelAceite(r, redesenhar);
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Declaração do escopo</h4>
      <p class="dc-sem"><b>Escopo do produto</b> = características e funções do resultado (o quê). <b>Escopo do projeto</b> = o trabalho para entregá-lo (como), detalhado na EAP.</p></div>
      <div class="barra"><button class="btn" type="button" id="pjEsEd">Editar escopo</button><button class="btn" type="button" id="pjEsDic">Imprimir dicionário da EAP</button></div></div>
    <div class="pj-escopo-grade">
      <div><small>Escopo do produto (o quê)</small><p>${p.escopo_produto ? esc(p.escopo_produto).replace(/\n/g, '<br>') : '<span class="dc-sem">—</span>'}</p></div>
      <div><small>Escopo do projeto (como)</small><p>${p.escopo ? esc(p.escopo).replace(/\n/g, '<br>') : '<span class="dc-sem">—</span>'}</p></div>
      <div><small>Fora do escopo</small><p>${p.fora_escopo ? esc(p.fora_escopo).replace(/\n/g, '<br>') : '<span class="dc-sem">—</span>'}</p></div>
    </div>

    <div class="pj-secao-topo" style="margin-top:22px"><div><h4>Premissas e restrições</h4>
      <p class="dc-sem"><b>Premissa</b>: o que se considera verdadeiro para planejar — se não se confirmar, vira risco. <b>Restrição do projeto</b>: limita as opções da equipe (prazo, custo, horário, local). <b>Restrição do produto</b>: limite que o resultado tem de atender (tamanho, capacidade).</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjPrNovo">+ Premissa / restrição</button></div></div>
    ${!prs.length ? vazio('Nenhuma premissa ou restrição registrada.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Tipo</th><th>Descrição</th><th>Situação</th><th>Observação</th><th></th></tr></thead>
      <tbody>${prs.map(x => `<tr class="pj-linha" data-pr="${x.id}"><td>${etiqueta(TIPO_PR[x.tipo], x.tipo === 'premissa' ? 'neutra' : 'alerta')}</td><td><b>${esc(x.descricao)}</b></td>
        <td>${esc(SIT_PR[x.situacao] || '')}${x.situacao === 'falhou' ? ' ' + etiqueta('atenção', 'perigo') : ''}</td><td>${esc(x.obs || '')}</td>
        <td class="pj-acoes">${x.tipo === 'premissa' ? (x.risco_id ? '<small class="dc-sem">virou risco</small>' : `<button class="btn mini" type="button" data-risco="${x.id}">Virar risco</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>`}

    <div class="pj-secao-topo" style="margin-top:22px"><div><h4>Requisitos e matriz de rastreabilidade</h4>
      <p class="dc-sem">Requisito = condição ou capacidade que o resultado precisa ter. Cada um é ligado à entrega que o atende e conferido no aceite dela.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjRqNovo">+ Requisito</button></div></div>
    ${!reqs.length ? vazio('Nenhum requisito registrado. Ouça o patrocinador e quem vai usar o resultado.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Cód.</th><th>Requisito</th><th>Origem</th><th>Prioridade</th><th>Critério de aceite</th><th>Entrega (EAP)</th><th>Aceite da entrega</th><th>Situação</th></tr></thead>
      <tbody>${reqs.map(q => { const e = entrega(q.eap_id); return `<tr class="pj-linha${q.situacao === 'excluido' ? ' pj-apagada' : ''}" data-rq="${q.id}">
        <td class="pj-cod">${esc(q.codigo || '')}</td><td><b>${esc(q.descricao)}</b></td><td>${esc(q.origem || '')}</td>
        <td>${etiqueta(PRIOR[q.prioridade], q.prioridade === 'alta' ? 'perigo' : q.prioridade === 'media' ? 'alerta' : '')}</td>
        <td>${esc(q.criterio_aceite || '')}</td>
        <td>${e ? esc(e._cod + ' ' + e.nome) : (q.situacao === 'excluido' ? '—' : '<span class="pj-tag alerta">sem entrega</span>')}</td>
        <td>${e ? etiqueta(ACEITE[e.aceite_situacao || 'pendente'], e.aceite_situacao === 'aceita' ? 'aceita' : e.aceite_situacao === 'recusada' ? 'recusada' : '') : ''}</td>
        <td>${esc(SIT_REQ[q.situacao] || '')}</td></tr>`; }).join('')}</tbody></table></div>`}

    <div class="pj-secao-topo" style="margin-top:22px"><div><h4>Validação do escopo (aceite das entregas)</h4>
      <p class="dc-sem">Aceite formal de cada entrega pelo patrocinador ou cliente, conforme o critério de aceitação — feito ao longo do projeto, não só no fim. O controle do escopo (mudanças) fica na aba Mudanças.</p></div></div>
    ${aceite.html}`;

  aceite.ligar(alvo);
  const camposEsc = [
    { k: 'escopo_produto', rot: 'Escopo do produto (o quê)', tipo: 'area', plena: true, linhas: 4, dica: 'Características, funções e especificações do resultado.' },
    { k: 'escopo', rot: 'Escopo do projeto (como)', tipo: 'area', plena: true, linhas: 4, dica: 'As grandes entregas e o trabalho para chegar a elas.' },
    { k: 'fora_escopo', rot: 'Fora do escopo', tipo: 'area', plena: true, linhas: 3 },
  ];
  alvo.querySelector('#pjEsEd').onclick = () => formModal('Declaração do escopo', camposEsc, p, async o => { await gravar('pj_projetos', { ...projeto(pid), ...o }); redesenhar(); });
  alvo.querySelector('#pjEsDic').onclick = () => imprimirDicionario(r);

  const camposPr = [
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: Object.entries(TIPO_PR) },
    { k: 'situacao', rot: 'Situação', tipo: 'select', ops: Object.entries(SIT_PR) },
    { k: 'descricao', rot: 'Descrição', tipo: 'area', req: true, plena: true, linhas: 2, ph: 'ex.: o fornecedor entrega a estrutura em até 30 dias após o pedido' },
    { k: 'obs', rot: 'Observação', plena: true },
  ];
  const edPr = x => formModal(x ? TIPO_PR[x.tipo] : 'Nova premissa ou restrição', camposPr, x || { tipo: 'premissa', situacao: 'valida' }, async o => {
    await gravar('pj_premissas', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o }); redesenhar();
  }, { aoExcluir: x ? async () => { await apagar('pj_premissas', x); redesenhar(); } : null });
  alvo.querySelector('#pjPrNovo').onclick = () => edPr(null);
  alvo.querySelectorAll('[data-pr]').forEach(tr => tr.addEventListener('click', ev => { if (ev.target.closest('button')) return; edPr(prs.find(x => x.id === tr.dataset.pr)); }));
  alvo.querySelectorAll('[data-risco]').forEach(b => b.onclick = async () => {
    const x = prs.find(y => y.id === b.dataset.risco);
    const id = crypto.randomUUID();
    await gravar('pj_riscos', { id, projeto_id: pid, ativo: true, tipo: 'ameaca', categoria: 'Premissa', situacao: 'aberto',
      descricao: 'Premissa não se confirmar: ' + x.descricao, probabilidade: 3, impacto: 3 });
    await gravar('pj_premissas', { ...x, risco_id: id });
    aviso('Risco criado na aba Riscos. Ajuste probabilidade, impacto e plano de resposta.');
    redesenhar();
  });

  const entregas = r.arv.filter(i => i.tipo === 'entrega');
  const camposRq = [
    { k: 'descricao', rot: 'Requisito', tipo: 'area', req: true, plena: true, linhas: 2 },
    { k: 'origem', rot: 'Origem (quem pediu)', lista: 'pjNomesRq' },
    { k: 'prioridade', rot: 'Prioridade', tipo: 'select', ops: Object.entries(PRIOR), padrao: 'media' },
    { k: 'criterio_aceite', rot: 'Critério de aceite', tipo: 'area', plena: true, linhas: 2 },
    { k: 'eap_id', rot: 'Entrega que atende', tipo: 'select', ops: [['', '— ainda não ligado —'], ...entregas.map(e => [e.id, e._cod + ' ' + e.nome])], plena: true },
    { k: 'situacao', rot: 'Situação', tipo: 'select', ops: Object.entries(SIT_REQ) },
  ];
  const edRq = x => formModal(x ? 'Requisito ' + (x.codigo || '') : 'Novo requisito', camposRq, x || { prioridade: 'media', situacao: 'proposto' }, async o => {
    const n = todos('pj_requisitos').filter(q => q.projeto_id === pid).length + 1;
    await gravar('pj_requisitos', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true, codigo: 'REQ-' + String(n).padStart(2, '0') }), ...o, eap_id: o.eap_id || null });
    redesenhar();
  }, { extra: datalist('pjNomesRq', nomesSugeridos(pid)), aoExcluir: x ? async () => { await apagar('pj_requisitos', x); redesenhar(); } : null });
  alvo.querySelector('#pjRqNovo').onclick = () => edRq(null);
  alvo.querySelectorAll('[data-rq]').forEach(tr => tr.onclick = () => edRq(reqs.find(x => x.id === tr.dataset.rq)));
}
