// epi-saldo.js — saldo de EPI por estoque (13/11/2026). Conta pura, sem tela.
//
// Escolha do Guilherme: saldo = última contagem + entradas − saídas.
//   · Estoque com entradas e saídas lançadas desde sempre (Quebra Cocão): o
//     saldo é a soma dos movimentos, igual ao módulo Estoque Quebra Cocão.
//   · Os outros (Lote 35, Faca, Morro Branco, Três Riachos): parte da última
//     contagem do grupo EPIs (data da contagem) e soma o que entrou e saiu
//     DEPOIS dela. Sem contagem, parte do zero.
// Usado pela SST › EPI's (Entregas, Entradas, Saldo) e pelo Estoque (aviso de
// divergência ao fechar a contagem).

export const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
export const ehQuebraCocao = local => !!local && semAcento(local.nome).includes('QUEBRA COCAO');

const fimDoMes = m => {
  const [a, mm] = String(m || '').split('-').map(Number);
  if (!a || !mm) return '';
  const d = new Date(a, mm, 0);
  return `${a}-${String(mm).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const unicos = lista => [...new Map((lista || []).map(x => [x.id, x])).values()].filter(x => x.ativo !== false);

/**
 * Data e linhas da última contagem de EPIs de um estoque.
 * @param {string} antesDe  só contagens com data < antesDe (AAAA-MM-DD); vazio = todas
 * @param {string} ateDia   só contagens com data <= ateDia
 */
export function ultimaContagemEpi(d, localId, { antesDe = '', ateDia = '', excluirId = '' } = {}) {
  const grupos = unicos(d.grupos);
  const cands = unicos(d.contagens).filter(c => c.local_id === localId && c.id !== excluirId).map(c => {
    const g = grupos.find(x => x.contagem_id === c.id && x.grupo === 'EPIs');
    const data = String((g && g.data_contagem) || c.data_contagem || fimDoMes(c.mes)).slice(0, 10);
    const fechada = (g && g.status === 'fechada') || c.status === 'fechada';
    return { c, data, fechada };
  }).filter(x => x.fechada && x.data && (!antesDe || x.data < antesDe) && (!ateDia || x.data <= ateDia))
    .sort((a, b) => b.data.localeCompare(a.data) || (Number(b.c.rodada) || 1) - (Number(a.c.rodada) || 1));
  const u = cands[0];
  if (!u) return null;
  const qtd = new Map();
  for (const l of unicos(d.linhas)) if (l.contagem_id === u.c.id && l.quantidade !== null && l.quantidade !== '' && l.quantidade !== undefined)
    qtd.set(l.item_id, Number(l.quantidade) || 0);
  return { contagem: u.c, data: u.data, qtd };
}

/**
 * Saldo de cada EPI num estoque.
 * d = { locais, contagens, grupos, linhas, movimentos, itens }
 * @returns Map item_id → { base, baseData, entradas, saidas, saldo }
 */
export function saldosEpi(d, localId, { ateDia = '', antesDe = '', excluirContagem = '' } = {}) {
  const local = (d.locais || []).find(l => l.id === localId);
  const qc = ehQuebraCocao(local);
  const epis = new Set((d.itens || []).filter(i => i.grupo === 'EPIs').map(i => i.id));
  const cont = qc ? null : ultimaContagemEpi(d, localId, { antesDe, ateDia, excluirId: excluirContagem });
  const desde = cont ? cont.data : '';
  const lim = ateDia || (antesDe ? diaAntes(antesDe) : '');
  const r = new Map();
  const linha = id => { if (!r.has(id)) r.set(id, { base: cont ? (cont.qtd.get(id) || 0) : 0, baseData: desde, entradas: 0, saidas: 0, saldo: 0 }); return r.get(id); };
  if (cont) for (const id of cont.qtd.keys()) if (epis.has(id)) linha(id);
  for (const m of unicos(d.movimentos)) {
    if (m.local_id !== localId || m.pendente || !epis.has(m.item_id)) continue;
    const dia = String(m.data || '').slice(0, 10);
    if (desde && dia <= desde) continue;      // já está dentro da contagem
    if (lim && dia > lim) continue;
    // ajuste de balanço da contagem só vale no estoque que vive de movimentos
    if (!qc && m.tipo === 'ajuste') continue;
    const q = Number(m.quantidade) || 0;
    const l = linha(m.item_id);
    if (m.sentido === 'entrada') l.entradas += q; else l.saidas += q;
  }
  for (const l of r.values()) {
    l.entradas = arred(l.entradas); l.saidas = arred(l.saidas);
    l.saldo = arred(l.base + l.entradas - l.saidas);
  }
  return r;
}
const arred = v => Math.round(v * 1000) / 1000 || 0;
function diaAntes(iso) {
  const t = Date.parse(iso + 'T12:00:00Z') - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ---- tipo do EPI e próxima troca ----
   "Bota Pvc Branca Forrada 40 (CA 42291)" e "… 41 (CA 36025)" são o mesmo tipo
   para a troca: tira o CA, o tamanho e o código do fim do nome. */
export function tipoDoEpi(nome) {
  let s = String(nome || '').replace(/\s*\(\s*ca[^)]*\)/ig, ' ').replace(/\s*-\s*c[oó]d\.?\s*\d+\s*$/i, '');
  s = s.replace(/\s*[-–]?\s*\b(pp|p|m|g|gg|xg|xxg|xgg|xxgg|xxxg|exg|exgg|eg|\d{2})\s*$/i, '');
  return semAcento(s.replace(/[-–\s]+$/, '').replace(/\s+/g, ' '));
}
export function somarPrazo(iso, qtd, unidade) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const n = Number(qtd) || 0;
  if (unidade === 'dias') d.setUTCDate(d.getUTCDate() + n);
  else if (unidade === 'semanas') d.setUTCDate(d.getUTCDate() + n * 7);
  else {   // 31/01 + 1 mês = 28/02 (não 03/03)
    const dia = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ult));
  }
  return d.toISOString().slice(0, 10);
}
