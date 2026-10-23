// painel.js — Painel da área Projetos: projetos por fase, atrasos, custos e marcos (23/10/2026).
import { $, esc, pronto, carregando, projetos, resumo, semaforos, FASES, emAndamento, pct, reais, reaisCurto,
  dataBR, dataCurta, hojeISO, somarDias, bolinha, NOME_COR } from './dados.js';
import { barra, vazio } from './ui.js';

let ouvindo = false;
let soAndamento = true;

function desenhar() {
  const alvo = $('pjPainelCorpo');
  if (!pronto() || carregando()) { alvo.innerHTML = vazio('Abrindo…'); return; }
  const todos = projetos();
  if (!todos.length) {
    alvo.innerHTML = `<div class="pj-vazio-grande"><p><b>Nenhum projeto ainda.</b></p><p class="dc-sem">Cadastre o primeiro em Projetos › + Novo projeto.</p>
      <button class="btn principal" type="button" id="pjPnIr">Ir para Projetos</button></div>`;
    $('pjPnIr').onclick = () => window.abrirTelaProjetos('pjLista');
    return;
  }
  const lista = todos.filter(p => !soAndamento || emAndamento(p));
  const rs = lista.map(p => ({ p, r: resumo(p.id) })).map(x => ({ ...x, s: semaforos(x.r) }));
  const hoje = hojeISO(), em30 = somarDias(hoje, 30);
  const atrasadas = rs.flatMap(({ p, r }) => r.atrasadas.map(t => ({ p, t }))).sort((a, b) => String(a.t.fim).localeCompare(String(b.t.fim)));
  const marcos = rs.flatMap(({ p, r }) => r.arv.filter(i => (i.tipo === 'marco' || i.tipo === 'entrega') && i.fim && i.fim >= hoje && i.fim <= em30 && r.calc[i.id].pct < 1).map(i => ({ p, i })))
    .sort((a, b) => String(a.i.fim).localeCompare(String(b.i.fim)));
  const orc = rs.reduce((s, x) => s + Number(x.p.orcamento || 0), 0);
  const real = rs.reduce((s, x) => s + x.r.custoReal, 0);
  const mudPend = rs.reduce((s, x) => s + x.r.mudPend.length, 0);
  const altosSem = rs.reduce((s, x) => s + x.r.altosSemPlano.length, 0);
  const criticos = rs.filter(x => [x.s.prazo, x.s.custo, x.s.escopo].includes('vermelho')).length;
  const maxCusto = Math.max(1, ...rs.map(x => Math.max(Number(x.p.orcamento || 0), x.r.custoReal)));

  alvo.innerHTML = `
    <div class="barra pj-filtros">
      <label class="pj-check"><input type="checkbox" id="pjPnAnd"${soAndamento ? ' checked' : ''}> só projetos em andamento</label>
      <span class="pj-cresce"></span><span class="dc-sem">${lista.length} projeto(s) · situação em ${dataBR(hoje)}</span>
    </div>
    <div class="pj-kpis">
      <div><span>Projetos</span><b>${lista.length}</b><small>${rs.filter(x => x.p.situacao === 'suspenso').length} suspenso(s)</small></div>
      <div class="${criticos ? 'pj-kpi-alerta' : ''}"><span>Com semáforo vermelho</span><b>${criticos}</b><small>prazo, custo ou escopo</small></div>
      <div class="${atrasadas.length ? 'pj-kpi-alerta' : ''}"><span>Tarefas atrasadas</span><b>${atrasadas.length}</b></div>
      <div><span>Realizado / orçado</span><b>${reaisCurto(real)}</b><small>de ${reaisCurto(orc)}${orc ? ' · ' + pct(real / orc) : ''}</small></div>
      <div class="${mudPend ? 'pj-kpi-alerta' : ''}"><span>Mudanças pendentes</span><b>${mudPend}</b></div>
      <div class="${altosSem ? 'pj-kpi-alerta' : ''}"><span>Riscos altos sem plano</span><b>${altosSem}</b></div>
    </div>

    <h4 class="pj-sub-tit">Projetos por fase</h4>
    <div class="pj-kanban">${FASES.map(([f, n]) => { const cs = rs.filter(x => x.p.fase === f); return `
      <section><header>${esc(n)} <span>${cs.length}</span></header>
        ${cs.map(({ p, r, s }) => `<article class="pj-card" data-abrir="${p.id}" tabindex="0">
          <small>${esc(p.codigo || '')}${p.situacao === 'suspenso' ? ' · suspenso' : ''}</small>
          <b>${esc(p.nome)}</b>
          <div class="pj-card-av">${barra(r.fisico)}<span>${pct(r.fisico)}</span></div>
          <div class="pj-card-sem">${bolinha(s.prazo, 'Prazo: ' + NOME_COR[s.prazo])}${bolinha(s.custo, 'Custo: ' + NOME_COR[s.custo])}${bolinha(s.escopo, 'Escopo: ' + NOME_COR[s.escopo])}
            <span>${p.fim_previsto ? 'até ' + dataCurta(p.fim_previsto) : ''}</span>${r.atrasadas.length ? `<span class="pj-tag perigo">${r.atrasadas.length} atras.</span>` : ''}</div>
          ${p.gerente ? `<small>${esc(p.gerente)}</small>` : ''}
        </article>`).join('') || '<p class="dc-sem pj-kb-vazio">—</p>'}
      </section>`; }).join('')}</div>

    <div class="pj-duas">
      <div>
        <h4 class="pj-sub-tit">Custos: orçado × realizado</h4>
        ${!rs.length ? vazio('—') : `<div class="pj-custos-barras">${rs.map(({ p, r }) => {
          const o = Number(p.orcamento || 0), estouro = o && r.custoReal > o;
          return `<div class="pj-cb-linha" data-abrir="${p.id}"><span class="pj-cb-nome">${esc(p.codigo || '')} ${esc(p.nome)}</span>
            <span class="pj-cb-barras"><i class="o" style="width:${o / maxCusto * 100}%"></i><i class="r${estouro ? ' estouro' : ''}" style="width:${r.custoReal / maxCusto * 100}%"></i></span>
            <span class="pj-cb-val">${reaisCurto(r.custoReal)} <small>/ ${reaisCurto(o)}</small></span></div>`; }).join('')}</div>
          <p class="dc-sem"><span class="pj-leg o"></span> orçado · <span class="pj-leg r"></span> realizado · <span class="pj-leg e"></span> acima do orçado</p>`}
      </div>
      <div>
        <h4 class="pj-sub-tit">Próximos marcos e entregas (30 dias)</h4>
        ${!marcos.length ? vazio('Nada vencendo nos próximos 30 dias.') : `<table class="dc-planilha pj-tab"><tbody>${marcos.slice(0, 12).map(({ p, i }) =>
          `<tr class="pj-linha" data-abrir="${p.id}" data-aba="eap"><td>${dataCurta(i.fim)}</td><td>${i.tipo === 'marco' ? '◆' : '▣'} <b>${esc(i.nome)}</b><small class="pj-sub">${esc(p.codigo || '')} ${esc(p.nome)}</small></td><td class="dir">${pct(resumo(p.id).calc[i.id].pct)}</td></tr>`).join('')}</tbody></table>`}
      </div>
    </div>

    <h4 class="pj-sub-tit">Tarefas atrasadas</h4>
    ${!atrasadas.length ? vazio('Nenhuma tarefa atrasada.') : `<div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Projeto</th><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th class="dir">Dias de atraso</th><th class="dir">Feito</th></tr></thead>
      <tbody>${atrasadas.slice(0, 20).map(({ p, t }) => `<tr class="pj-linha" data-abrir="${p.id}" data-aba="eap"><td>${esc(p.codigo || '')} ${esc(p.nome)}</td><td><b>${t._cod} ${esc(t.nome)}</b></td><td>${esc(t.responsavel || '')}</td>
        <td>${dataBR(t.fim)}</td><td class="dir">${Math.round((new Date(hoje) - new Date(t.fim)) / 864e5)}</td><td class="dir">${Number(t.pct || 0)}%</td></tr>`).join('')}</tbody></table></div>`}`;

  $('pjPnAnd').onchange = e => { soAndamento = e.target.checked; desenhar(); };
  alvo.querySelectorAll('[data-abrir]').forEach(el => {
    const ir = () => window.pjAbrirProjeto(el.dataset.abrir, el.dataset.aba || 'eap');
    el.addEventListener('click', ir);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
  });
}

export function abrirPainel() {
  if (!ouvindo) { window.addEventListener('projetos-dados', () => { if (!$('telaPjPainel').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
