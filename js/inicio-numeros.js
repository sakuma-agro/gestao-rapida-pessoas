// inicio-numeros.js — o número de cada cartão da tela inicial do Pessoas
// (estilo TOTVS, 20/10/2026, aprovado por ele).
//
// Cada tela do acesso rápido pode ter uma conta: devolve { txt, alerta } ou
// null (cartão fica sem número). As contas usam o que o app já carregou; SST
// e Salários leem do banco só se ainda não leram. Tudo com import() para não
// prender o arranque nem criar ciclo de importação. Erro = sem número.

import { estado } from './store.js';
import { podeTela } from './acesso.js';

const ativos = () => (estado.funcionarios || []).filter(f => (f.situacao || 'ATIVO') === 'ATIVO');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

async function sst(kind) {
  const m = await import('./sst.js');
  if (!m.sstCarregado()) await m.garantirSst();
  const r = m.resumoSst(kind);
  if (r.vencido) return { txt: plural(r.vencido, 'vencido', 'vencidos') + (r.ate30 ? ` · ${r.ate30} em 30 dias` : ''), alerta: true };
  if (r.ate30) return { txt: plural(r.ate30, 'vence em 30 dias', 'vencem em 30 dias'), alerta: true };
  return { txt: 'tudo em dia' };
}
async function ferias() {
  const r = (await import('./jornada-ferias.js')).resumoPainel();
  if (!r) return null;
  if (r.vencida) return { txt: plural(r.vencida, 'com limite vencido', 'com limite vencido'), alerta: true };
  if (r.f30) return { txt: `${r.f30} com limite em 30 dias`, alerta: true };
  if (r.risco) return { txt: plural(r.risco, 'período em risco', 'períodos em risco'), alerta: true };
  return { txt: r.afastados ? plural(r.afastados, 'afastado hoje', 'afastados hoje') : 'em dia' };
}
async function competencia() {
  const jd = await import('./jornada-dados.js');
  const c = jd.competenciaCarregada() || jd.competenciaAtual();
  return { txt: `competência ${c.slice(5, 7)}/${c.slice(2, 4)}` };
}
async function boletins() {
  const jd = await import('./jornada-dados.js');
  if (!(jd.dados.bolEntregas || []).length) return null;
  const r = (await import('./jornada-boletins.js')).resumoPainel();
  return r.pendentes ? { txt: plural(r.pendentes, 'pendente', 'pendentes'), alerta: true } : { txt: 'nada pendente' };
}
async function documentos() {
  const r = (await import('./jornada-documentos.js')).resumoPainel();
  if (r.pendentes) return { txt: plural(r.pendentes, 'pendente', 'pendentes'), alerta: true };
  return r.escanear ? { txt: `${r.escanear} para escanear` } : null;
}
async function emprestimos() {
  const r = (await import('./jornada-emprestimos.js')).resumoPainel();
  if (!r) return null;
  if (r.aguardando) return { txt: plural(r.aguardando, 'aguardando liberação', 'aguardando liberação'), alerta: true };
  return { txt: plural(r.desconto, 'em desconto', 'em desconto') };
}
async function salarios() {
  const r = await (await import('./rh-salarios.js')).resumoSalarios();
  if (!r) return null;
  if (r.abaixo) return { txt: plural(r.abaixo, 'abaixo da faixa', 'abaixo da faixa'), alerta: true };
  if (r.sem) return { txt: plural(r.sem, 'sem salário no app', 'sem salário no app'), alerta: true };
  return { txt: 'todos na tabela' };
}

const CONTAS = {
  funcionarios: async () => ({ txt: plural(ativos().length, 'ativo', 'ativos') }),
  aniversarios: async () => {
    const { aniversariantes } = await import('./aniversarios.js');
    const n = aniversariantes(estado.funcionarios || [], new Date().getMonth()).length;
    return { txt: n ? plural(n, 'no mês', 'no mês') : 'nenhum no mês' };
  },
  exVenc: () => sst('exame'), exPainel: () => sst('exame'),
  trVenc: () => sst('treinamento'), trPainel: () => sst('treinamento'),
  ferPainel: ferias, ferPrev: ferias, ferLanc: ferias, ferRisco: ferias, cadFerias: ferias,
  jorPainel: competencia, jorLancar: competencia, jorFechamento: competencia, jorBoletins: competencia,
  bdPend: boletins, bdDia: boletins, bdMes: boletins,
  dmPainel: documentos, dmMes: documentos, dmScan: documentos,
  empEmissao: emprestimos, empRecibos: emprestimos, empHistorico: emprestimos,
  rhSalarios: salarios, rhEnquadra: salarios,
};

/** Preenche o número de cada cartão `[data-num="tela"]` dentro de `raiz`. */
export function preencherNumeros(raiz) {
  raiz.querySelectorAll('[data-num]').forEach(async el => {
    const tela = el.dataset.num;
    const conta = CONTAS[tela];
    if (!conta || !podeTela(tela)) return;
    try {
      const r = await conta();
      if (!r || !el.isConnected) return;
      el.textContent = r.txt;
      el.classList.toggle('tv-num-alerta', !!r.alerta);
      el.hidden = false;
    } catch { /* sem rede ou sem permissão: o cartão fica sem número */ }
  });
}
