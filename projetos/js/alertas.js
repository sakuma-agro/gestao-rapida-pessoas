// alertas.js — Atrasos e alertas de todos os projetos em andamento (23/10/2026).
import { $, esc, pronto, carregando, projetos, resumo, emAndamento, dataBR, hojeISO, nivelNum, diasEntre, reais, pct } from './dados.js';
import { vazio, etiqueta } from './ui.js';

let ouvindo = false;

function desenhar() {
  const alvo = $('pjAlertasCorpo');
  if (!pronto() || carregando()) { alvo.innerHTML = vazio('Abrindo…'); return; }
  const hoje = hojeISO();
  const rs = projetos().filter(emAndamento).map(p => ({ p, r: resumo(p.id) }));
  const linha = (p, aba, txt, det, cls = '') => `<tr class="pj-linha" data-abrir="${p.id}" data-aba="${aba}"><td>${esc(p.codigo || '')} ${esc(p.nome)}</td><td class="${cls}"><b>${txt}</b></td><td>${det}</td></tr>`;
  const grupos = [
    ['Tarefas atrasadas', 'perigo', rs.flatMap(({ p, r }) => r.atrasadas.map(t => linha(p, 'eap', t._cod + ' ' + esc(t.nome),
      `${esc(t.responsavel || 'sem responsável')} · prazo ${dataBR(t.fim)} · ${diasEntre(t.fim, hoje)} dia(s) de atraso · ${Number(t.pct || 0)}% feito`)))],
    ['Projetos com prazo vencido', 'perigo', rs.filter(x => x.r.prazoVencido).map(({ p, r }) => linha(p, 'eap', 'Término previsto ' + dataBR(p.fim_previsto), `avanço ${pct(r.fisico)}`))],
    ['Custo acima do orçamento', 'perigo', rs.filter(({ p, r }) => p.orcamento && r.custoReal > p.orcamento).map(({ p, r }) => linha(p, 'custos', reais(r.custoReal) + ' de ' + reais(p.orcamento), pct(r.custoReal / p.orcamento) + ' do orçamento'))],
    ['Riscos altos sem plano de resposta', 'perigo', rs.flatMap(({ p, r }) => r.altosSemPlano.map(x => linha(p, 'riscos', esc(x.descricao), 'nível ' + nivelNum(x) + (x.dono ? ' · dono: ' + esc(x.dono) : ''))))],
    ['Tarefas que vencem em até 7 dias', 'alerta', rs.flatMap(({ p, r }) => r.aVencer.map(t => linha(p, 'eap', t._cod + ' ' + esc(t.nome), `${esc(t.responsavel || 'sem responsável')} · prazo ${dataBR(t.fim)} · ${Number(t.pct || 0)}% feito`)))],
    ['Mudanças pendentes há mais de 7 dias', 'alerta', rs.flatMap(({ p, r }) => r.mudPendVelhas.map(m => linha(p, 'mudancas', 'Nº ' + m.numero + ' · ' + esc(m.descricao), 'pedida em ' + dataBR(m.data) + (m.solicitante ? ' por ' + esc(m.solicitante) : ''))))],
    ['Problemas com ação vencida', 'alerta', rs.flatMap(({ p }) => (window.App.dados.pj_ocorrencias || []).filter(o => o.ativo !== false && o.projeto_id === p.id && o.situacao === 'aberta' && o.prazo && o.prazo < hoje)
      .map(o => linha(p, 'problemas', esc(o.descricao), 'ação: ' + esc(o.acao || '—') + ' · prazo ' + dataBR(o.prazo))))],
    ['Termo de abertura não aprovado', 'neutra', rs.filter(({ p }) => !p.termo_aprovado_em).map(({ p }) => linha(p, 'termo', 'Termo pendente de aprovação', 'fase: ' + esc(p.fase)))],
  ];
  const total = grupos.reduce((s, g) => s + g[2].length, 0);
  alvo.innerHTML = !total ? `<div class="pj-vazio-grande"><p><b>Nenhum alerta.</b></p><p class="dc-sem">Todos os projetos em andamento estão no rumo.</p></div>`
    : grupos.filter(g => g[2].length).map(([t, cls, ls]) => `
      <h4 class="pj-sub-tit">${etiqueta(ls.length, cls)} ${t}</h4>
      <div class="pj-rolagem"><table class="dc-planilha pj-tab pj-alertas"><tbody>${ls.join('')}</tbody></table></div>`).join('');
  alvo.querySelectorAll('[data-abrir]').forEach(tr => tr.onclick = () => window.pjAbrirProjeto(tr.dataset.abrir, tr.dataset.aba));
}

/** Quantos alertas (para o acesso rápido). */
export function contarAlertas() {
  if (!pronto()) return 0;
  return projetos().filter(emAndamento).map(p => resumo(p.id))
    .reduce((s, r) => s + r.atrasadas.length + r.altosSemPlano.length + r.mudPendVelhas.length + (r.prazoVencido ? 1 : 0), 0);
}

export function abrirAlertas() {
  if (!ouvindo) { window.addEventListener('projetos-dados', () => { if (!$('telaPjAlertas').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
