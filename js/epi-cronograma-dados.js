// epi-cronograma-dados.js — a conta do Cronograma de troca de EPI (28/10/2026).
//
// Sem import de tela: serve a tela SST › EPI's › Cronograma de troca
// (js/sst-epi-crono.js) e a fonte automática do Cronograma geral
// (js/cronograma.js). Um lugar só, para os dois nunca discordarem.
//
// Regras (pedido dele, 28/10/2026): nada de entrada e saída de EPI; só marcar
// quando o EPI foi entregue e ver a próxima troca.
//  · O "tipo" é a DESCRIÇÃO do EPI (sem caixa/acento): BOTINA SEG. BC PVC tem
//    três C.As no catálogo, mas é um tipo só para o cronograma.
//  · Frequência = epis.troca_qtd/troca_unidade (vale a do registro confirmado;
//    se nenhum foi confirmado, a sugestão). Em branco = conforme desgaste,
//    e o tipo fica de fora do cronograma.
//  · Linha = tipo + "para quem" (grupo, equipe ou fazenda; vazio = todos).
//  · Próxima troca = última entrega da linha + frequência, calculada aqui.

export const normal = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDe = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
export const hojeIso = () => iso(new Date());

/** Soma a frequência a uma data ISO. Mês segura o fim do mês (31/01 + 1 mês = 28/02). */
export function somarTroca(dataIso, qtd, unidade) {
  const d = dataDe(dataIso);
  const n = Number(qtd) || 0;
  if (unidade === 'dias') d.setDate(d.getDate() + n);
  else if (unidade === 'semanas') d.setDate(d.getDate() + 7 * n);
  else {
    const dia = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ult));
  }
  return iso(d);
}

export function diasAte(dataIso, base = hojeIso()) {
  return Math.round((dataDe(dataIso) - dataDe(base)) / 86400000);
}

export function textoFreq(qtd, unidade) {
  const n = Number(qtd);
  if (!n) return 'conforme desgaste';
  const sing = { dias: 'dia', semanas: 'semana', meses: 'mês' }[unidade] || unidade;
  return `a cada ${n} ${n === 1 ? sing : unidade}`;
}

/** Prazo de aviso "vence logo": proporcional à frequência, entre 2 e 15 dias. */
export function avisoDias(qtd, unidade) {
  const dias = unidade === 'dias' ? qtd : unidade === 'semanas' ? qtd * 7 : qtd * 30;
  return Math.max(2, Math.min(15, Math.round(dias / 4)));
}

/** Os tipos que entram no cronograma: um por descrição, com a frequência que vale. */
export function tiposComTroca(epis) {
  const mapa = new Map();
  for (const e of epis || []) {
    if (e.ativo === false) continue;
    const k = normal(e.descricao);
    if (!k) continue;
    let t = mapa.get(k);
    if (!t) { t = { chave: k, nome: e.descricao, epis: [], qtd: null, unidade: null, confirmada: false }; mapa.set(k, t); }
    t.epis.push(e);
    if (Number(e.troca_qtd) > 0) {
      const conf = !!e.troca_confirmada;
      // confirmada ganha da sugestão; entre iguais vale a primeira
      if (!t.qtd || (conf && !t.confirmada)) { t.qtd = Number(e.troca_qtd); t.unidade = e.troca_unidade || 'meses'; t.confirmada = conf; }
    }
  }
  return [...mapa.values()].filter(t => t.qtd).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Situação da próxima troca. */
export function situacaoTroca(proxima, t, base = hojeIso()) {
  if (!proxima) return { chave: 'sem', rotulo: 'sem entrega marcada', cor: 'neutra', ordem: 3 };
  const d = diasAte(proxima, base);
  if (d < 0) return { chave: 'atrasada', rotulo: `atrasada há ${-d} dia${d < -1 ? 's' : ''}`, cor: 'perigo', ordem: 0, dias: d };
  if (d <= avisoDias(t.qtd, t.unidade)) return { chave: 'logo', rotulo: d === 0 ? 'trocar hoje' : `trocar em ${d} dia${d > 1 ? 's' : ''}`, cor: 'alerta', ordem: 1, dias: d };
  return { chave: 'emdia', rotulo: `em dia (${d} dias)`, cor: 'ativo', ordem: 2, dias: d };
}

/**
 * As linhas do cronograma: tipo + para quem, com a última entrega e a próxima
 * troca. Tipo com frequência e sem entrega aparece uma vez, "sem entrega".
 */
export function linhasCronograma(epis, entregas, base = hojeIso()) {
  const tipos = tiposComTroca(epis);
  const tipoDoEpi = new Map();
  for (const t of tipos) for (const e of t.epis) tipoDoEpi.set(e.id, t);
  const grupos = new Map();
  for (const en of entregas || []) {
    const t = tipoDoEpi.get(en.epi_id);
    if (!t) continue;
    const para = String(en.para || '').trim();
    const k = t.chave + '\u0001' + normal(para);
    let g = grupos.get(k);
    if (!g) { g = { chave: k, tipo: t, para, entregas: [] }; grupos.set(k, g); }
    g.entregas.push(en);
  }
  const linhas = [];
  for (const g of grupos.values()) {
    g.entregas.sort((a, b) => String(b.entregue_em).localeCompare(String(a.entregue_em)));
    const ult = g.entregas[0];
    const proxima = somarTroca(ult.entregue_em, g.tipo.qtd, g.tipo.unidade);
    linhas.push({ ...g, ultima: ult.entregue_em, proxima, sit: situacaoTroca(proxima, g.tipo, base) });
  }
  const comEntrega = new Set([...grupos.values()].map(g => g.tipo.chave));
  for (const t of tipos) if (!comEntrega.has(t.chave)) {
    linhas.push({ chave: t.chave + '\u0001', tipo: t, para: '', entregas: [], ultima: null, proxima: null, sit: situacaoTroca(null, t, base) });
  }
  return linhas.sort((a, b) => a.sit.ordem - b.sit.ordem
    || String(a.proxima || '').localeCompare(String(b.proxima || ''))
    || a.tipo.nome.localeCompare(b.tipo.nome, 'pt-BR') || a.para.localeCompare(b.para, 'pt-BR'));
}

/** Trocas previstas mês a mês nos próximos `meses`, a partir da próxima troca. */
export function previsaoMeses(linha, meses = 12, base = hojeIso()) {
  const b = dataDe(base);
  const ini = new Date(b.getFullYear(), b.getMonth(), 1);
  const cont = Array(meses).fill(0);
  if (!linha.proxima) return cont;
  // atrasada: a troca conta hoje, e as seguintes a partir de hoje
  let d = diasAte(linha.proxima, base) < 0 ? base : linha.proxima;
  for (let i = 0; i < 400; i++) {
    const x = dataDe(d);
    const idx = (x.getFullYear() - ini.getFullYear()) * 12 + x.getMonth() - ini.getMonth();
    if (idx >= meses) break;
    cont[idx]++;
    d = somarTroca(d, linha.tipo.qtd, linha.tipo.unidade);
  }
  return cont;
}
