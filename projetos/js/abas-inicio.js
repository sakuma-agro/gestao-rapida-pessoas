// abas-inicio.js — Termo de abertura, Partes interessadas e Comunicação (23/10/2026).
import { esc, gravar, aviso, meuNome, apagar, dataBR, hojeISO, NIVEL3, estrategiaParte,
  nomesSugeridos, datalist, doProjeto, linhas } from './dados.js';
import { campos, lerForm, formModal, vazio } from './ui.js';
import { imprimirTermoAbertura } from './relatorio.js';

/* ============================== TERMO DE ABERTURA ============================== */
const CAMPOS_TAP = [
  { k: 'nome', rot: 'Nome do projeto', req: true, plena: true },
  { k: 'objetivo', rot: 'Objetivo', tipo: 'area', plena: true, linhas: 3, dica: 'O que o projeto vai entregar e o resultado esperado — de preferência mensurável.' },
  { k: 'justificativa', rot: 'Justificativa', tipo: 'area', plena: true, linhas: 3, dica: 'Por que fazer agora: problema, oportunidade ou exigência.' },
  { k: 'business_case', rot: 'Business case / viabilidade', tipo: 'area', plena: true, linhas: 3, dica: 'Por que vale a pena: retorno esperado, custo de não fazer, alternativas avaliadas.' },
  { k: 'categoria', rot: 'Categoria', lista: 'pjCategorias' },
  { k: 'inovacao_objeto', rot: 'Tipo de inovação', tipo: 'select', ops: [['', '— não se aplica —'], ['produto', 'Produto ou serviço'], ['processo', 'Processo'], ['marketing', 'Marketing'], ['organizacional', 'Organizacional']] },
  { k: 'inovacao_grau', rot: 'Grau de novidade', tipo: 'select', ops: [['', '—'], ['incremental', 'Incremental (melhoria)'], ['radical', 'Radical (algo novo)']] },
  { k: 'escopo', rot: 'Escopo macro do projeto (o que está dentro)', tipo: 'area', plena: true, linhas: 4, dica: 'As grandes entregas. O detalhe vai na EAP.' },
  { k: 'fora_escopo', rot: 'Fora do escopo', tipo: 'area', plena: true, linhas: 2 },
  { k: 'premissas', rot: 'Premissas', tipo: 'area', linhas: 3, dica: 'O que se considera verdadeiro para planejar.' },
  { k: 'restricoes', rot: 'Restrições', tipo: 'area', linhas: 3, dica: 'Limites de prazo, custo, recursos, normas.' },
  { k: 'recursos', rot: 'Recursos iniciais', tipo: 'area', plena: true, linhas: 2, dica: 'Pessoas, máquinas, verba e materiais já alocados.' },
  { k: 'inicio', rot: 'Início', tipo: 'date' },
  { k: 'fim_previsto', rot: 'Término previsto (prazo)', tipo: 'date' },
  { k: 'orcamento', rot: 'Orçamento (R$)', tipo: 'dinheiro' },
  { k: 'fazenda', rot: 'Fazenda / unidade' },
  { k: 'setor', rot: 'Setor' },
  { k: 'patrocinador', rot: 'Patrocinador', lista: 'pjNomesTap', dica: 'Quem autoriza e banca o projeto.' },
  { k: 'gerente', rot: 'Gerente do projeto', lista: 'pjNomesTap', dica: 'Quem conduz o dia a dia.' },
  { k: 'criterios_sucesso', rot: 'Critérios de sucesso (um por linha)', tipo: 'area', plena: true, linhas: 4, dica: 'Como se saberá que o projeto deu certo. São conferidos no encerramento.' },
];

export function abaTermo(alvo, r, redesenhar) {
  const p = r.p;
  alvo.innerHTML = `
    <div class="pj-secao-topo">
      <div><h4>Termo de Abertura do Projeto</h4>
        <p class="dc-sem">Formaliza o projeto e dá autoridade ao gerente. ${p.termo_aprovado_em
          ? `<b class="pj-ok">Aprovado em ${dataBR(p.termo_aprovado_em)}${p.termo_aprovado_por ? ' por ' + esc(p.termo_aprovado_por) : ''}.</b>`
          : '<b class="pj-pend">Ainda não aprovado.</b>'}</p></div>
      <div class="barra">
        <button class="btn" type="button" id="pjTapImp">Imprimir termo</button>
        ${p.termo_aprovado_em
          ? '<button class="btn" type="button" id="pjTapDesap">Desfazer aprovação</button>'
          : '<button class="btn principal" type="button" id="pjTapAprovar">Aprovar termo</button>'}
      </div>
    </div>
    <form class="grade larga pj-form" id="pjTapForm" autocomplete="off">
      ${campos(CAMPOS_TAP, p)}
      ${datalist('pjNomesTap', nomesSugeridos(p.id))}
      ${datalist('pjCategorias', ['Melhoria de processo', 'Inovação', 'Obra / infraestrutura', 'Implantação de sistema', 'Certificação', 'Segurança do trabalho', 'Produção / safra', 'Pessoas / treinamento'])}
      <div class="barra fim plena"><button class="btn principal" type="submit">Salvar termo</button></div>
    </form>`;
  const form = alvo.querySelector('#pjTapForm');
  const salvar = async () => {
    const o = lerForm(form, CAMPOS_TAP);
    if (!o.nome) { aviso('O projeto precisa de um nome.', true); return null; }
    const novo = { ...p, ...o };
    await gravar('pj_projetos', novo);
    return novo;
  };
  form.addEventListener('submit', async e => { e.preventDefault(); if (await salvar()) { aviso('Termo salvo.'); redesenhar(); } });
  alvo.querySelector('#pjTapImp').onclick = async () => { const n = await salvar(); if (n) imprimirTermoAbertura(n); };
  const ap = alvo.querySelector('#pjTapAprovar');
  if (ap) ap.onclick = async () => {
    const n = await salvar(); if (!n) return;
    const falta = ['objetivo', 'justificativa', 'escopo', 'fim_previsto', 'patrocinador', 'gerente'].filter(k => !n[k]);
    if (!linhas(n.criterios_sucesso).length) falta.push('criterios_sucesso');
    const nomes = Object.fromEntries(CAMPOS_TAP.map(c => [c.k, c.rot]));
    if (falta.length && !confirm('Ainda faltam no termo:\n\n• ' + falta.map(k => nomes[k]).join('\n• ') + '\n\nAprovar mesmo assim?')) return;
    await gravar('pj_projetos', { ...n, termo_aprovado_em: new Date().toISOString(), termo_aprovado_por: n.patrocinador || meuNome() });
    aviso('Termo de abertura aprovado.');
    redesenhar();
  };
  const ds = alvo.querySelector('#pjTapDesap');
  if (ds) ds.onclick = async () => {
    if (!confirm('Desfazer a aprovação do termo?')) return;
    await gravar('pj_projetos', { ...p, termo_aprovado_em: null, termo_aprovado_por: null });
    redesenhar();
  };
}

/* ============================== PARTES INTERESSADAS ============================== */
const ops3 = [[3, 'Alto'], [2, 'Médio'], [1, 'Baixo']];
function camposParte(pid) {
  return [
    { k: 'nome', rot: 'Nome', req: true, lista: 'pjNomesPt' },
    { k: 'papel', rot: 'Papel no projeto', ph: 'ex.: patrocinador, usuário, fornecedor, equipe' },
    { k: 'organizacao', rot: 'Setor / empresa' },
    { k: 'contato', rot: 'Contato' },
    { k: 'interesse', rot: 'Interesse', tipo: 'select', ops: ops3, int: true, padrao: 2 },
    { k: 'influencia', rot: 'Influência (poder)', tipo: 'select', ops: ops3, int: true, padrao: 2 },
    { k: 'expectativas', rot: 'Expectativas e necessidades', tipo: 'area', plena: true, linhas: 2 },
  ];
}
function editarParte(pid, x, redesenhar) {
  const lista = camposParte(pid);
  formModal(x ? 'Parte interessada' : 'Nova parte interessada', lista, x || { interesse: 2, influencia: 2 }, async o => {
    await gravar('pj_partes', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o,
      interesse: Number(o.interesse || 2), influencia: Number(o.influencia || 2) });
    redesenhar();
  }, { extra: datalist('pjNomesPt', nomesSugeridos(pid)), aoExcluir: x ? async () => { await apagar('pj_partes', x); redesenhar(); } : null });
}

export function abaPartes(alvo, r, redesenhar) {
  const pid = r.p.id, ps = r.partes;
  const cel = (inf, int) => ps.filter(x => Number(x.influencia || 2) === inf && Number(x.interesse || 2) === int)
    .map(x => `<span class="pj-chip">${esc(x.nome)}</span>`).join('');
  alvo.innerHTML = `
    <div class="pj-secao-topo">
      <div><h4>Partes interessadas</h4><p class="dc-sem">Quem influencia o projeto ou é afetado por ele, com o interesse e a influência de cada um.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjPtNovo">+ Parte interessada</button></div>
    </div>
    ${!ps.length ? vazio('Nenhuma parte interessada. Comece pelo patrocinador, o gerente e quem vai usar o resultado.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Nome</th><th>Papel</th><th>Setor / empresa</th><th class="ce">Interesse</th><th class="ce">Influência</th><th>Estratégia</th><th>Expectativas</th></tr></thead>
      <tbody>${ps.map(x => `<tr class="pj-linha" data-ed="${x.id}"><td><b>${esc(x.nome)}</b>${x.contato ? `<small class="pj-sub">${esc(x.contato)}</small>` : ''}</td>
        <td>${esc(x.papel || '')}</td><td>${esc(x.organizacao || '')}</td>
        <td class="ce">${NIVEL3[x.interesse] || '—'}</td><td class="ce">${NIVEL3[x.influencia] || '—'}</td>
        <td><b>${estrategiaParte(x)}</b></td><td>${esc(x.expectativas || '')}</td></tr>`).join('')}</tbody></table></div>
    <h4 class="pj-sub-tit">Matriz influência × interesse</h4>
    <div class="pj-matriz">
      <div class="pj-mx-eixo-y">Influência ↑</div>
      <div class="pj-mx-grade">
        ${[3, 2, 1].map(inf => [1, 2, 3].map(int => {
          const cls = inf === 3 && int === 3 ? 'perto' : inf === 3 ? 'satisfeito' : int === 3 ? 'informado' : 'monitorar';
          return `<div class="pj-mx-cel ${cls}">${cel(inf, int)}</div>`; }).join('')).join('')}
      </div>
      <div class="pj-mx-eixo-x">Interesse →</div>
    </div>
    <p class="dc-sem">Alta influência e alto interesse: <b>gerenciar de perto</b>. Alta influência: <b>manter satisfeito</b>. Alto interesse: <b>manter informado</b>. Os demais: <b>monitorar</b>.</p>`}`;
  alvo.querySelector('#pjPtNovo').onclick = () => editarParte(pid, null, redesenhar);
  alvo.querySelectorAll('[data-ed]').forEach(tr => tr.onclick = () => editarParte(pid, ps.find(x => x.id === tr.dataset.ed), redesenhar));
}

/* ============================== COMUNICAÇÃO ============================== */
const CAMPOS_COM = [
  { k: 'informacao', rot: 'O que comunicar', req: true, plena: true, ph: 'ex.: andamento do projeto, aprovação de mudanças' },
  { k: 'publico', rot: 'Para quem', lista: 'pjNomesCom' },
  { k: 'frequencia', rot: 'Frequência', lista: 'pjFreq' },
  { k: 'meio', rot: 'Meio', lista: 'pjMeio' },
  { k: 'responsavel', rot: 'Responsável', lista: 'pjNomesCom' },
];
const CAMPOS_REU = [
  { k: 'data', rot: 'Data', tipo: 'date', req: true },
  { k: 'titulo', rot: 'Assunto', ph: 'ex.: reunião semanal do projeto' },
  { k: 'participantes', rot: 'Participantes', plena: true },
  { k: 'pauta', rot: 'Pauta', tipo: 'area', plena: true, linhas: 2 },
  { k: 'decisoes', rot: 'Decisões', tipo: 'area', plena: true, linhas: 3 },
  { k: 'encaminhamentos', rot: 'Encaminhamentos (quem faz o quê, até quando)', tipo: 'area', plena: true, linhas: 3 },
];
const listasCom = pid => datalist('pjNomesCom', nomesSugeridos(pid))
  + datalist('pjFreq', ['Diária', 'Semanal', 'Quinzenal', 'Mensal', 'Por marco', 'Quando houver mudança'])
  + datalist('pjMeio', ['Reunião presencial', 'WhatsApp', 'E-mail', 'Relatório de status', 'Quadro na sede']);

export function abaComunicacao(alvo, r, redesenhar) {
  const pid = r.p.id;
  const plano = r.comunicacao;
  const reus = doProjeto('pj_reunioes', pid).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  alvo.innerHTML = `
    <div class="pj-secao-topo">
      <div><h4>Plano de comunicação</h4><p class="dc-sem">O que é informado, para quem, com que frequência e por qual meio.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjComNovo">+ Item do plano</button></div>
    </div>
    ${!plano.length ? vazio('Sem plano de comunicação. Ex.: "Andamento do projeto · patrocinador · semanal · relatório de status".') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>O que comunicar</th><th>Para quem</th><th>Frequência</th><th>Meio</th><th>Responsável</th></tr></thead>
      <tbody>${plano.map(x => `<tr class="pj-linha" data-com="${x.id}"><td><b>${esc(x.informacao)}</b></td><td>${esc(x.publico || '')}</td><td>${esc(x.frequencia || '')}</td><td>${esc(x.meio || '')}</td><td>${esc(x.responsavel || '')}</td></tr>`).join('')}</tbody>
    </table></div>`}
    <div class="pj-secao-topo" style="margin-top:22px">
      <div><h4>Reuniões do projeto</h4><p class="dc-sem">Registro curto de cada reunião: decisões e encaminhamentos.</p></div>
      <div class="barra"><button class="btn" type="button" id="pjReuNova">+ Reunião</button></div>
    </div>
    ${!reus.length ? vazio('Nenhuma reunião registrada.') : reus.map(x => `
      <article class="pj-reu" data-reu="${x.id}">
        <header><b>${dataBR(x.data)}</b> · ${esc(x.titulo || 'Reunião')}<span class="pj-cresce"></span><button class="btn mini" type="button">Editar</button></header>
        ${x.participantes ? `<p><small>Participantes:</small> ${esc(x.participantes)}</p>` : ''}
        ${x.decisoes ? `<p><small>Decisões:</small> ${esc(x.decisoes).replace(/\n/g, '<br>')}</p>` : ''}
        ${x.encaminhamentos ? `<p><small>Encaminhamentos:</small> ${esc(x.encaminhamentos).replace(/\n/g, '<br>')}</p>` : ''}
      </article>`).join('')}`;
  const edCom = x => formModal(x ? 'Item do plano de comunicação' : 'Novo item do plano', CAMPOS_COM, x || {}, async o => {
    await gravar('pj_comunicacao', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o }); redesenhar();
  }, { extra: listasCom(pid), aoExcluir: x ? async () => { await apagar('pj_comunicacao', x); redesenhar(); } : null });
  const edReu = x => formModal(x ? 'Reunião' : 'Nova reunião', CAMPOS_REU, x || { data: hojeISO() }, async o => {
    await gravar('pj_reunioes', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true }), ...o }); redesenhar();
  }, { aoExcluir: x ? async () => { await apagar('pj_reunioes', x); redesenhar(); } : null });
  alvo.querySelector('#pjComNovo').onclick = () => edCom(null);
  alvo.querySelector('#pjReuNova').onclick = () => edReu(null);
  alvo.querySelectorAll('[data-com]').forEach(tr => tr.onclick = () => edCom(plano.find(x => x.id === tr.dataset.com)));
  alvo.querySelectorAll('[data-reu]').forEach(a => a.querySelector('button').onclick = () => edReu(reus.find(x => x.id === a.dataset.reu)));
}
