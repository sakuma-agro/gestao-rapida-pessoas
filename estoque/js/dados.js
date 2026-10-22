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
// Os grupos de contagem (pedido dele, 15/10/2026), na ordem da tela. Sementes entrou em 22/10/2026 com o cadastro consolidado.
export const GRUPOS = ['Defensivos', 'Fertilizantes', 'Sementes', 'EPIs', 'Lubrificantes', 'Material de limpeza', 'Papelaria'];
export const UNIDADES = ['kg', 'g', 'L', 'mL', 'un', 'sc', 'cx', 'pct', 'par'];
const ordemGrupo = g => { const i = GRUPOS.indexOf(g); return i < 0 ? 99 : i; };
export const itensOrdenados = (lista = ativos('est_itens')) => lista.slice()
  .sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || porNome(a, b));

/* ---- em quais estoques o item é contado ----
   locais_contagem vazio/nulo = conta em todos (pedido dele, 15/10/2026). */
export const contaNoLocal = (item, localId) => {
  const l = item && item.locais_contagem;
  return !Array.isArray(l) || !l.length || l.includes(localId);
};
export const itensDoLocal = localId => itensOrdenados().filter(i => contaNoLocal(i, localId));

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
  const localId = String(contagemId).split(':')[0];
  const itens = ativos('est_itens').filter(i => contaNoLocal(i, localId));
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

/** Lotes ativos de um item numa contagem, do que vence primeiro ao último. */
export const lotesDe = (contagemId, itemId) => [...new Map(todos('est_contagem_lotes')
  .filter(l => l.contagem_id === contagemId && l.item_id === itemId)
  .map(l => [l.id, l])).values()]          // um por id, o mais recente vale
  .filter(l => l.ativo !== false)
  .sort((a, b) => String(a.validade || '9999').localeCompare(String(b.validade || '9999'))
    || String(a.lote || '').localeCompare(String(b.lote || ''), 'pt-BR'));

export const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
export const hojeISO = () => new Date().toISOString().slice(0, 10);

/* ---- estoque mínimo (pedido dele, 15/10/2026) ----
   Cada item pode ter um estoque mínimo e a quantidade a pedir. Contou e deu
   igual ou abaixo do mínimo → o item entra na reposição. */
export const temMinimo = item => item && item.estoque_minimo !== null && item.estoque_minimo !== undefined && item.estoque_minimo !== '';
export const precisaRepor = (item, qtd) => temMinimo(item) && qtd !== null && qtd !== undefined && qtd !== ''
  && Number(qtd) <= Number(item.estoque_minimo);
export const textoPedido = item => item.pedido_reposicao !== null && item.pedido_reposicao !== undefined && item.pedido_reposicao !== ''
  ? 'pedir ' + mostrarNumero(item.pedido_reposicao) + ' ' + (item.unidade || '') : 'definir quanto pedir';

/* ---- mapa do barracão (21/10/2026, pedido dele) ----
   Um estoque pode ter um mapa (est_mapas, id = local_id): as quadras, as áreas
   reservadas e os pilares do barracão. Na contagem dos fertilizantes, cada
   item diz em quais quadras está e quantos bags tem em cada uma
   (est_contagem_quadras, id contagem_id:item_id:quadra). */
export const mapaDoLocal = localId => {
  const m = todos('est_mapas').find(x => x.id === String(localId) && x.ativo !== false);
  return m && m.layout && Array.isArray(m.layout.quadras) && m.layout.quadras.length ? m : null;
};
export const idQuadraLinha = (contagemId, itemId, quadra) => contagemId + ':' + itemId + ':' + quadra;
/** Quadras de um item numa contagem (só as com bags ou ativas), na ordem do mapa. */
export const quadrasDe = (contagemId, itemId) => [...new Map(todos('est_contagem_quadras')
  .filter(l => l.contagem_id === contagemId && (!itemId || l.item_id === itemId))
  .map(l => [l.id, l])).values()].filter(l => l.ativo !== false)
  .sort((a, b) => String(a.quadra).localeCompare(String(b.quadra), 'pt-BR', { numeric: true }));
/** Quantos bags cabem numa quadra: posições no chão × altura da pilha.
    A largura desconta a folga do pilar; capacidade digitada no mapa vale mais. */
export function capacidadeQuadra(q, layout) {
  if (q.capacidade !== undefined && q.capacidade !== null && q.capacidade !== '') return Number(q.capacidade);
  const m = Number(layout.medida_bag) || 1.2, f = Number(layout.folga) || 0, h = Number(layout.altura_pilha) || 3;
  const nl = Math.max(0, Math.floor((Number(q.l) - f) / m + 1e-9));
  const np = Math.max(0, Math.floor(Number(q.p) / m + 1e-9));
  return nl * np * h;
}
export const pesoBag = layout => Number(layout && layout.peso_bag_kg) || 1000;
/** Mês anterior a 'AAAA-MM'. */
export const mesAnterior = m => {
  const [a, mm] = String(m).split('-').map(Number);
  const d = new Date(a, mm - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
