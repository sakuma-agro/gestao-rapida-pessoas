// dados.js — o que as telas da Outorga e Irrigação usam em comum (12/11/2026).
// Os dados moram no núcleo das molduras (../../js/moldura-nucleo.js), que
// guarda tudo no aparelho e manda para o servidor quando há sinal.
//
// Tabelas (supabase/outorga.sql):
//   out_locais     — fazendas/locais (as do app avulso)
//   out_controles  — pontos de controle: cada um vira uma ficha de outorga
//   out_produtores — produtores da irrigação (G8, SAKUMA)
//   out_itens      — o que se recolhe todo mês (o checklist "Recolhimento" do Rastro)
//   out_recebidos  — recebido no mês, id 'AAAA-MM:<item>' (mês da ficha)

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pronto = () => !!(window.App && window.App.usuario);
export const carregando = () => !!(window.App && window.App.carregando);
export const todos = t => (window.App && window.App.dados[t]) || [];
export const ativos = t => todos(t).filter(x => x.ativo !== false);
export const gravar = (t, r) => window.gravar(t, r);
export const aviso = (texto, erro) => window.aviso && window.aviso(texto, erro);
export const meuNome = () => (window.App && window.App.usuario && window.App.usuario.nome) || '';
export const abrirModal = (t, h, fn) => window.abrirModal(t, h, fn);
export const fecharModal = () => window.fecharModal();

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome || a.nav_label || '').localeCompare(String(b.nome || b.nav_label || ''), 'pt-BR');

/* ---- locais, pontos, produtores, itens ---- */
export const locais = (inat) => (inat ? todos('out_locais') : ativos('out_locais')).slice().sort(porOrdem);
export const local = id => todos('out_locais').find(l => l.id === id) || null;
export const pontosDe = (localId, inat) => (inat ? todos('out_controles') : ativos('out_controles')).filter(c => c.local_id === localId).sort(porOrdem);
export const ponto = id => todos('out_controles').find(c => c.id === id) || null;
export const produtores = (inat) => (inat ? todos('out_produtores') : ativos('out_produtores')).slice().sort(porOrdem);
export const itens = (inat) => (inat ? todos('out_itens') : ativos('out_itens')).slice().sort(porOrdem);
export const nomeLocal = id => (local(id) || {}).nome || '—';
export const colunasDe = c => Array.isArray(c && c.colunas) ? c.colunas : (() => { try { return JSON.parse(c.colunas || '[]'); } catch { return []; } })();

/* ---- recebidos ---- */
export const idRec = (m, itemId) => m + ':' + itemId;
export const recDe = (m, itemId) => todos('out_recebidos').find(r => r.id === idRec(m, itemId)) || null;
export const recebido = (m, itemId) => !!recDe(m, itemId)?.recebido;
export async function marcarRecebido(m, itemId, sim, extra = {}) {
  const r = recDe(m, itemId);
  const reg = { ...(r || { id: idRec(m, itemId), mes: m, item_id: itemId, obs: null }), ...extra, recebido: !!sim,
    recebido_em: sim ? (r?.recebido && r.recebido_em ? r.recebido_em : new Date().toISOString()) : null,
    recebido_por: sim ? (r?.recebido && r.recebido_por ? r.recebido_por : (meuNome() || null)) : null };
  return gravar('out_recebidos', reg);
}
export async function gravarObs(m, itemId, obs) {
  const r = recDe(m, itemId);
  return gravar('out_recebidos', { ...(r || { id: idRec(m, itemId), mes: m, item_id: itemId, recebido: false }), obs: obs || null });
}

/* ---- meses ---- */
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesAtual = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const mesMais = (m, n) => { const [a, mm] = String(m).split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const nomeMes = m => { const [a, mm] = String(m).split('-').map(Number); return MESES[mm - 1] + ' de ' + a; };
export const NomeMes = m => { const t = nomeMes(m); return t.charAt(0).toUpperCase() + t.slice(1); };
export const mesCurto = m => { const [a, mm] = String(m).split('-').map(Number); return MESES[mm - 1].slice(0, 3) + '/' + String(a).slice(2); };
export const diasNoMes = m => { const [a, mm] = String(m).split('-').map(Number); return new Date(a, mm, 0).getDate(); };
export const dataBR = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
