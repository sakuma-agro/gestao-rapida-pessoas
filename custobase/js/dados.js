// dados.js — o que as telas do Custo Base usam em comum (20/10/2026).
// Os dados moram no núcleo das molduras (../../js/moldura-nucleo.js), que
// guarda tudo no aparelho e manda para o servidor quando há sinal.
//
// A CONTA é a da planilha "Rateio - Direcionador Mensal ADM":
//   peso do plantio = índice da cultura × área (ha) × (12 ÷ ciclo em dias)
//   % do plantio    = peso ÷ soma dos pesos dos plantios incluídos no mês
//   R$ do plantio   = custo ADM do mês × %   (só quando o custo é lançado)
// Índice, ciclo e área ficam copiados em cada linha do mês (cb_itens), como
// cada aba da planilha guarda os seus próprios números: mudar a cultura
// depois não mexe nos meses já feitos.

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pronto = () => !!(window.App && window.App.usuario);
export const carregando = () => !!(window.App && window.App.carregando);
export const todos = t => (window.App && window.App.dados[t]) || [];
export const ativos = t => todos(t).filter(x => x.ativo !== false);
export const gravar = (t, r) => window.gravar(t, r);
export const aviso = (texto, erro) => window.aviso && window.aviso(texto, erro);
export const souAdmin = () => !!(window.App && window.App.usuario && window.App.usuario.admin);
export const meuNome = () => (window.App && window.App.usuario && window.App.usuario.nome) || '';

const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
export const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ---- culturas ---- */
export const culturas = () => ativos('cb_culturas').slice()
  .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || porNome(a, b));
export const cultura = id => todos('cb_culturas').find(c => c.id === id) || null;
export const nomeCultura = id => (cultura(id) || {}).nome || '—';
/** Quantos meses um plantio dessa cultura fica no rateio (vazio = permanente). */
export function mesesDaCultura(c) {
  if (!c || c.permanente) return null;
  if (c.meses_rateio) return Number(c.meses_rateio);
  return Math.max(1, Math.round(Number(c.ciclo || 30) / 30));
}

/* ---- plantios (talhões) ---- */
export const talhoes = () => todos('cb_talhoes').slice().sort(porNome);
export const talhao = id => todos('cb_talhoes').find(t => t.id === id) || null;
export const FAZENDAS = ['Lote 35 PADAP', 'Fazenda Faca', 'Fazenda Morro Branco', 'Fazenda Três Riachos', 'Fazenda Quebra Cocão'];
export const nomeCurto = n => String(n || '').replace(/^Faz(enda)?\.?\s+/i, '').replace(/ PADAP$/i, '');

/* ---- meses ---- */
export const mesAtual = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
export const mesAnterior = m => {
  const [a, mm] = String(m).split('-').map(Number);
  const d = new Date(a, mm - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
export const mesSeguinte = m => {
  const [a, mm] = String(m).split('-').map(Number);
  const d = new Date(a, mm, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = m => {
  const [a, mm] = String(m || '').split('-');
  return (MESES[Number(mm) - 1] || '?') + '/' + a;
};
export const mesCurto = m => {
  const [a, mm] = String(m || '').split('-');
  return (MESES[Number(mm) - 1] || '?').slice(0, 3) + '/' + String(a).slice(2);
};
export const meses = () => todos('cb_meses').slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
export const mes = id => todos('cb_meses').find(m => m.id === id) || null;
export const ultimoMes = () => { const l = meses(); return l.length ? l[l.length - 1].id : null; };
export const idItem = (mesId, talhaoId) => mesId + ':' + talhaoId;
export const itensDoMes = mesId => todos('cb_itens').filter(i => i.mes === mesId);
export const mesFechado = mesId => (mes(mesId) || {}).status === 'fechado';

/* ---- cadeado do mês fechado (pedido dele, 20/10/2026) ----
   Mês fechado fica travado: na tela não se edita e o banco recusa qualquer
   mudança nas linhas dele (gatilho cb_trava_*). Parâmetro alterado depois
   não mexe no que já foi fechado. */
export const CADEADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
export const seloFechado = (por, em) => `<span class="cb-cadeado" title="Mês fechado: travado. Mudança de parâmetro não altera este mês.">${CADEADO} Fechado</span>${por ? ` <span class="dc-sem">por ${esc(por)}${em ? ' em ' + esc(dataHora(em)) : ''}</span>` : ''}`;

/* ---- período do plantio no rateio (pedido dele, 20/10/2026) ----
   "ADM mensal funciona assim: o que tem data inicial do dia 16 ao 31 não
   entra no mês." Data inicial até o dia 15 → entra naquele mês; do 16 em
   diante → entra no mês seguinte. Fica no rateio a qtde de meses do
   cadastro (vazio = a da cultura; cultura permanente = sempre). */
export const DIA_CORTE = 15;
export function mesDeEntrada(dataISO) {
  if (!dataISO) return null;
  const [a, m, d] = String(dataISO).slice(0, 10).split('-').map(Number);
  const base = a + '-' + String(m).padStart(2, '0');
  return d <= DIA_CORTE ? base : mesSeguinte(base);
}
export const somaMeses = (mesId, n) => { let x = mesId; for (let i = 0; i < n; i++) x = mesSeguinte(x); return x; };
/** Qtde de meses que o plantio fica no rateio (null = sem fim). */
export function qtdeDe(t) {
  if (t && t.qtde_meses) return Number(t.qtde_meses);
  return mesesDaCultura(cultura(t && t.cultura_id));
}
/** { ini, fim } em 'AAAA-MM'; fim null = sem fim (permanente). */
export function periodoDe(t) {
  const ini = mesDeEntrada(t && t.data_inicial);
  if (!ini) return { ini: null, fim: null };
  const q = qtdeDe(t);
  return { ini, fim: q ? somaMeses(ini, q - 1) : null };
}
export function entraNoMes(t, mesId) {
  if (!t || t.ativo === false) return false;
  const { ini, fim } = periodoDe(t);
  return !!ini && mesId >= ini && (!fim || mesId <= fim);
}

/* ---- a conta ---- */
export const pesoDe = i => Number(i.indice || 0) * Number(i.area || 0) * (12 / Number(i.ciclo || 1));

/** As linhas de um mês com peso, % e R$, na ordem cultura › nome. */
export function calcularMes(mesId) {
  const m = mes(mesId);
  const custo = m && m.custo_adm !== null && m.custo_adm !== undefined && m.custo_adm !== '' ? Number(m.custo_adm) : null;
  const linhas = itensDoMes(mesId).map(i => {
    const t = talhao(i.talhao_id) || {};
    const c = cultura(i.cultura_id || t.cultura_id);
    return { ...i, talhao: t, culturaNome: c ? c.nome : '—', culturaObj: c, peso: i.incluido === false ? 0 : pesoDe(i) };
  });
  const total = linhas.reduce((s, l) => s + l.peso, 0);
  for (const l of linhas) {
    l.pct = total > 0 && l.incluido !== false ? l.peso / total : 0;
    l.valor = custo !== null ? custo * l.pct : null;
    l.meses = mesesParticipados(l.talhao_id, mesId);
    l.limite = l.talhao && l.talhao.id ? qtdeDe(l.talhao) : mesesDaCultura(l.culturaObj);
  }
  linhas.sort((a, b) => a.culturaNome.localeCompare(b.culturaNome, 'pt-BR')
    || String(a.talhao.nome || '').localeCompare(String(b.talhao.nome || ''), 'pt-BR', { numeric: true }));
  return { mes: m, custo, linhas, total,
    area: linhas.filter(l => l.incluido !== false).reduce((s, l) => s + Number(l.area || 0), 0),
    incluidos: linhas.filter(l => l.incluido !== false).length };
}

/** Em quantos meses (até `ateMes`, inclusive) o plantio entrou no rateio. */
export function mesesParticipados(talhaoId, ateMes) {
  return todos('cb_itens').filter(i => i.talhao_id === talhaoId && i.incluido !== false
    && (!ateMes || String(i.mes) <= String(ateMes))).length;
}
/** Lista dos meses em que o plantio entrou, do mais antigo ao mais novo. */
export const mesesDoTalhao = talhaoId => todos('cb_itens')
  .filter(i => i.talhao_id === talhaoId && i.incluido !== false).map(i => i.mes).sort();

/** Situação do plantio quanto ao ciclo: 'ok' | 'ultimo' (completou) | 'passou'. */
export function situacaoCiclo(meses, limite) {
  if (!limite) return 'ok';
  if (meses > limite) return 'passou';
  if (meses >= limite) return 'ultimo';
  return 'ok';
}

/* ---- números no jeito brasileiro ---- */
export function lerNumero(txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : NaN;
}
export const num = (n, casas = 2) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
  ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (n, casas = 2) => n === null || n === undefined ? '' : (Number(n) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
export const reais = n => n === null || n === undefined ? '' : 'R$ ' + num(n, 2);
export const dataHora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR').slice(0, 5);
};
