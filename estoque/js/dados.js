// dados.js — o que as telas da contagem e dos cadastros usam em comum.
// Os dados moram no núcleo das molduras (../../js/moldura-nucleo.js), que
// guarda tudo no aparelho e manda para o servidor quando há sinal.

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pronto = () => !!(window.App && window.App.usuario);
export const todos = t => (window.App && window.App.dados[t]) || [];
export const ativos = t => todos(t).filter(x => x.ativo !== false);
export const gravar = (t, r) => window.gravar(t, r);
export const aviso = (texto, erro) => window.aviso && window.aviso(texto, erro);
export const souAdmin = () => !!(window.App && window.App.usuario && window.App.usuario.admin);
export const meuNome = () => (window.App && window.App.usuario && window.App.usuario.nome) || '';

const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
export const locais = () => ativos('est_locais').slice()
  .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || porNome(a, b));

/* Grupos na ordem em que se conta. Item sem grupo conhecido cai no fim. */
export const GRUPOS = ['Insumos', 'Fertilizantes', 'EPIs'];
export const UNIDADES = ['kg', 'g', 'L', 'mL', 'un', 'sc', 'cx', 'pct', 'par'];
const ordemGrupo = g => { const i = GRUPOS.indexOf(g); return i < 0 ? 99 : i; };
export const itensOrdenados = (lista = ativos('est_itens')) => lista.slice()
  .sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || porNome(a, b));

/* ---- mês ---- */
export const mesAtual = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = m => {
  const [a, mm] = String(m || '').split('-');
  return (MESES[Number(mm) - 1] || '?') + '/' + a;
};

/* ---- chaves: as mesmas em qualquer aparelho, para nunca duplicar ---- */
export const idContagem = (localId, mes) => localId + ':' + mes;
export const idLinha = (contagemId, itemId) => contagemId + ':' + itemId;

export const contagem = (localId, mes) =>
  todos('est_contagens').find(c => c.id === idContagem(localId, mes)) || null;
export const linhasDe = contagemId =>
  todos('est_contagem_itens').filter(l => l.contagem_id === contagemId);

/** Quantos itens já têm quantidade numa contagem (dos itens ativos). */
export function progresso(contagemId) {
  const itens = ativos('est_itens');
  const ids = new Set(itens.map(i => i.id));
  const feitos = linhasDe(contagemId)
    .filter(l => ids.has(l.item_id) && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '').length;
  return { feitos, total: itens.length };
}

/* ---- número no jeito brasileiro ---- */
/** "1.234,5" → 1234.5 · "12,5" → 12.5 · "12.5" → 12.5 · "1.200" → 1200 · "" → null */
export function lerNumero(txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : NaN;
}
export const mostrarNumero = n => (n === null || n === undefined || n === '')
  ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export const dataHora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR').slice(0, 5);
};
