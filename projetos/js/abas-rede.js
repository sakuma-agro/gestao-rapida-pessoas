// abas-rede.js — Rede do projeto: diagrama de atividade no nó (AoN), CPM/PERT e caminho crítico (23/10/2026).
// Material do MBA (Desenvolvimento de um plano de projeto I e II): predecessoras,
// relações FI/II/TT/IT com espera/antecipação, DIMC, DTMC, DIMT, DTMT, folga
// total, folga livre e caminho crítico (folga zero).
import { esc, gravar, aviso, num, dataBR, somarDias, todos, rede } from './dados.js';
import { vazio } from './ui.js';

const W = 178, H = 70, GX = 56, GY = 22, M = 16;

function diagrama(r, rd) {
  const ordem = rd.ordem;
  if (!ordem.length) return '';
  // nível = maior número de ligações desde o início
  const nivel = {};
  ordem.forEach(k => { const n = rd.nos[k]; nivel[k] = n.preds.length ? Math.max(...n.preds.map(p => nivel[p.id] ?? 0)) + 1 : 1; });
  const maxN = Math.max(...Object.values(nivel));
  const colunas = {};
  ordem.forEach(k => (colunas[nivel[k]] = colunas[nivel[k]] || []).push(k));
  // dentro da coluna, críticas primeiro (o caminho crítico fica numa linha mais reta)
  Object.values(colunas).forEach(c => c.sort((a, b) => (rd.nos[b].critico - rd.nos[a].critico) || rd.nos[a].es - rd.nos[b].es));
  const linhas = Math.max(...Object.values(colunas).map(c => c.length));
  const pos = {};
  Object.entries(colunas).forEach(([n, c]) => c.forEach((k, i) => { pos[k] = { x: M + Number(n) * (W + GX), y: M + i * (H + GY) }; }));
  const alt = M * 2 + linhas * (H + GY) - GY;
  pos.__ini = { x: M, y: Math.max(M, alt / 2 - 20) };
  pos.__fim = { x: M + (maxN + 1) * (W + GX), y: Math.max(M, alt / 2 - 20) };
  const larg = pos.__fim.x + 90 + M;
  const seta = (x1, y1, x2, y2, cls, rot) => {
    const dx = Math.max(24, (x2 - x1) / 2);
    return `<path class="pj-rd-seta ${cls}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}" marker-end="url(#pjSeta${cls ? 'C' : ''})"/>`
      + (rot ? `<text class="pj-rd-rot" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}">${esc(rot)}</text>` : '');
  };
  let setas = '';
  ordem.forEach(k => {
    const n = rd.nos[k], b = pos[k];
    if (!n.preds.length) setas += seta(pos.__ini.x + 70, pos.__ini.y + 20, b.x, b.y + H / 2, n.critico ? 'c' : '');
    n.preds.forEach(p => {
      const a = pos[p.id], na = rd.nos[p.id];
      if (!a) return;
      const rot = (p.rel !== 'FI' ? p.rel : '') + (p.lag ? (p.lag > 0 ? ' +' : ' ') + p.lag + 'd' : '');
      setas += seta(a.x + W, a.y + H / 2, b.x, b.y + H / 2, n.critico && na.critico ? 'c' : '', rot.trim());
    });
    if (!n.succs.length) setas += seta(b.x + W, b.y + H / 2, pos.__fim.x, pos.__fim.y + 20, n.critico ? 'c' : '');
  });
  const caixa = k => {
    const n = rd.nos[k], { x, y } = pos[k], it = n.it;
    const nome = (it._cod + ' ' + it.nome);
    const curto = nome.length > 26 ? nome.slice(0, 25) + '…' : nome;
    return `<g class="pj-rd-no${n.critico ? ' c' : ''}${it.tipo === 'marco' ? ' marco' : ''}"><title>${esc(nome)} · duração ${num(n.dur, 1)} d · folga total ${num(n.ft, 1)}</title>
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8"/>
      <line x1="${x}" y1="${y + 20}" x2="${x + W}" y2="${y + 20}"/><line x1="${x}" y1="${y + H - 20}" x2="${x + W}" y2="${y + H - 20}"/>
      <line x1="${x + W / 3}" y1="${y}" x2="${x + W / 3}" y2="${y + 20}"/><line x1="${x + 2 * W / 3}" y1="${y}" x2="${x + 2 * W / 3}" y2="${y + 20}"/>
      <line x1="${x + W / 3}" y1="${y + H - 20}" x2="${x + W / 3}" y2="${y + H}"/><line x1="${x + 2 * W / 3}" y1="${y + H - 20}" x2="${x + 2 * W / 3}" y2="${y + H}"/>
      <text x="${x + W / 6}" y="${y + 14}">${num(n.es, 0)}</text><text class="d" x="${x + W / 2}" y="${y + 14}">${num(n.dur, n.dur % 1 ? 1 : 0)}d</text><text x="${x + 5 * W / 6}" y="${y + 14}">${num(n.ef, 0)}</text>
      <text class="n" x="${x + W / 2}" y="${y + H / 2 + 4}">${esc(curto)}</text>
      <text x="${x + W / 6}" y="${y + H - 6}">${num(n.ls, 0)}</text><text class="f" x="${x + W / 2}" y="${y + H - 6}">F ${num(n.ft, n.ft % 1 ? 1 : 0)}</text><text x="${x + 5 * W / 6}" y="${y + H - 6}">${num(n.lf, 0)}</text>
    </g>`;
  };
  return `<div class="pj-rd-rolagem"><svg class="pj-rd" viewBox="0 0 ${larg} ${alt}" width="${larg}" height="${alt}" role="img" aria-label="Diagrama de rede do projeto">
    <defs>
      <marker id="pjSeta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="pj-rd-ponta"/></marker>
      <marker id="pjSetaC" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="pj-rd-ponta c"/></marker>
    </defs>
    ${setas}
    <g class="pj-rd-ext"><rect x="${pos.__ini.x}" y="${pos.__ini.y}" width="70" height="40" rx="20"/><text x="${pos.__ini.x + 35}" y="${pos.__ini.y + 25}">Início</text></g>
    <g class="pj-rd-ext"><rect x="${pos.__fim.x}" y="${pos.__fim.y}" width="90" height="40" rx="20"/><text x="${pos.__fim.x + 45}" y="${pos.__fim.y + 18}">Fim</text><text class="d" x="${pos.__fim.x + 45}" y="${pos.__fim.y + 33}">${num(rd.duracao, rd.duracao % 1 ? 1 : 0)} dias</text></g>
    ${ordem.map(caixa).join('')}
  </svg></div>
  <p class="dc-sem pj-rd-leg">Cada caixa: em cima <b>início mais cedo · duração · término mais cedo</b>; embaixo <b>início mais tarde · folga total · término mais tarde</b> (em dias desde o início do projeto). Em marrom, o <b>caminho crítico</b>.</p>`;
}

async function programar(r, rd) {
  const ini = r.p.inicio;
  if (!ini) { aviso('Informe a data de início no Termo de Abertura.', true); return; }
  if (rd.ciclo) { aviso('A rede tem um círculo de predecessoras. Corrija antes de programar.', true); return; }
  if (!confirm('Recalcular as datas de início e término de todas as tarefas pela rede (início mais cedo), a partir de ' + dataBR(ini) + '?\n\nAs durações são mantidas.')) return;
  let n = 0;
  for (const k of rd.ordem) {
    const no = rd.nos[k];
    const x = todos('pj_eap').find(y => y.id === k);
    if (!x) continue;
    const di = Math.floor(no.es), dur = Math.max(0, Math.ceil(no.dur));
    const inicio = somarDias(ini, di);
    const fim = x.tipo === 'marco' ? inicio : somarDias(ini, di + Math.max(1, dur) - 1);
    const novo = { ...x, inicio, fim };
    if (x.duracao == null && x.dur_provavel == null && x.tipo !== 'marco') novo.duracao = no.dur;
    if (novo.inicio !== x.inicio || novo.fim !== x.fim) { await gravar('pj_eap', novo); n++; }
  }
  aviso(n ? n + ' tarefa(s) reprogramada(s) pela rede.' : 'As datas já batem com a rede.');
}

export function abaRede(alvo, r, redesenhar) {
  const rd = rede(r);
  const ini = r.p.inicio;
  const fimCalc = ini && rd.ordem.length ? somarDias(ini, Math.ceil(rd.duracao) - 1) : null;
  const cod = id => (rd.nos[id] ? rd.nos[id].it._cod : '?');
  const dataDia = d => ini ? dataBR(somarDias(ini, Math.floor(d))) : '';
  const usaPert = Object.values(rd.nos).some(n => n.fonte === 'PERT');
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Rede do projeto e caminho crítico</h4>
      <p class="dc-sem">Diagrama de atividade no nó (AoN) pelo método do caminho crítico (CPM). As entregas são atividades sumarizadoras: entram as tarefas e os marcos. Predecessoras e duração ficam no <b>Editar</b> de cada tarefa (aba EAP e cronograma).</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjRdProg"${!rd.ordem.length ? ' disabled' : ''}>Programar pelas dependências</button></div></div>
    ${!rd.ordem.length ? vazio('Monte a EAP com tarefas primeiro.') : `
    ${rd.ciclo ? '<div class="aviso erro">As predecessoras formam um círculo (uma atividade depende, por outro caminho, dela mesma). As atividades do círculo ficaram fora do cálculo.</div>' : ''}
    ${!rd.temDependencia ? '<div class="aviso info">Nenhuma predecessora cadastrada: todas as atividades aparecem começando no dia 0. Abra cada tarefa em EAP e cronograma e informe quais vêm antes dela.</div>' : ''}
    <div class="pj-kpis">
      <div><span>Duração pela rede</span><b>${num(rd.duracao, rd.duracao % 1 ? 1 : 0)} dias</b><small>${usaPert ? 'com durações PERT' : 'CPM (uma estimativa por atividade)'}</small></div>
      <div><span>Término calculado</span><b>${fimCalc ? dataBR(fimCalc) : '—'}</b><small>${!ini ? 'informe o início no termo' : r.p.fim_previsto ? 'prazo do termo: ' + dataBR(r.p.fim_previsto) : ''}</small></div>
      <div class="${fimCalc && r.p.fim_previsto && fimCalc > r.p.fim_previsto ? 'pj-kpi-alerta' : ''}"><span>Folga do projeto</span><b>${fimCalc && r.p.fim_previsto ? (Math.round((new Date(r.p.fim_previsto) - new Date(fimCalc)) / 864e5)) + ' dias' : '—'}</b><small>prazo do termo − término pela rede</small></div>
      <div><span>Atividades críticas</span><b>${rd.criticos.length}</b><small>de ${rd.ordem.length}</small></div>
      ${usaPert ? `<div><span>Desvio padrão (PERT)</span><b>± ${num(rd.sigma, 1)} d</b><small>do caminho crítico</small></div>` : ''}
    </div>
    ${diagrama(r, rd)}
    <h4 class="pj-sub-tit">Tabela do caminho crítico</h4>
    <div class="pj-rolagem"><table class="dc-planilha pj-tab pj-cpm">
      <thead><tr><th>EAP</th><th>Atividade</th><th class="dir">Duração</th><th>Predecessoras</th>
        <th class="dir" title="Data de início mais cedo">DIMC</th><th class="dir" title="Data de término mais cedo">DTMC</th>
        <th class="dir" title="Data de início mais tarde">DIMT</th><th class="dir" title="Data de término mais tarde">DTMT</th>
        <th class="dir">Folga total</th><th class="dir">Folga livre</th><th class="ce">Crítica</th></tr></thead>
      <tbody>${rd.ordem.map(k => { const n = rd.nos[k]; return `<tr class="${n.critico ? 'pj-critica' : ''}">
        <td class="pj-cod">${n.it._cod}</td><td><b>${esc(n.it.nome)}</b>${n.it.tipo === 'marco' ? ' <small class="dc-sem">marco</small>' : ''}</td>
        <td class="dir">${num(n.dur, n.dur % 1 ? 1 : 0)} d<small class="pj-sub">${esc(n.fonte)}${n.sigma ? ' · σ ' + num(n.sigma, 1) : ''}</small></td>
        <td>${n.preds.map(p => cod(p.id) + (p.rel !== 'FI' ? ' ' + p.rel : '') + (p.lag ? (p.lag > 0 ? '+' : '') + p.lag + 'd' : '')).join(', ') || '—'}</td>
        <td class="dir">${num(n.es, 0)}<small class="pj-sub">${dataDia(n.es)}</small></td>
        <td class="dir">${num(n.ef, 0)}<small class="pj-sub">${n.dur ? dataDia(n.ef - 1) : dataDia(n.ef)}</small></td>
        <td class="dir">${num(n.ls, 0)}<small class="pj-sub">${dataDia(n.ls)}</small></td>
        <td class="dir">${num(n.lf, 0)}<small class="pj-sub">${n.dur ? dataDia(n.lf - 1) : dataDia(n.lf)}</small></td>
        <td class="dir"><b>${num(n.ft, n.ft % 1 ? 1 : 0)}</b></td><td class="dir">${num(n.fl, n.fl % 1 ? 1 : 0)}</td>
        <td class="ce">${n.critico ? '<span class="pj-tag critica">sim</span>' : ''}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="dc-sem" style="margin-top:6px"><b>Folga total</b>: quanto a atividade pode atrasar sem atrasar o projeto. <b>Folga livre</b>: quanto pode atrasar sem atrasar a próxima. Caminho crítico = folga total zero: qualquer atraso ali atrasa o término. Relações: FI término→início · II início→início · TT término→término · IT início→término.</p>`}`;
  const b = alvo.querySelector('#pjRdProg');
  if (b) b.onclick = async () => { await programar(r, rd); redesenhar(); };
}
