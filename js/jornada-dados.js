// jornada-dados.js — camada de dados do módulo de Jornada
//
// Segue o mesmo desenho do store.js do app: cache local, escrita otimista
// e fila de envio quando falta rede. Usa o cliente e a sessão que o
// store.js já criou — não cria outra conexão nem outro login.
//
// Nada aqui altera tabela existente: só as tabelas jor_*.

import { estado, novoId } from './store.js';

const CHAVE_CACHE = 'jor.cache';
const CHAVE_FILA = 'jor.fila';

/* Cada coleção do módulo e a tabela onde ela mora. */
export const TABELAS = {
  destinos:     'jor_destinos_dp',
  empregadores: 'jor_empregadores',
  fazendas:     'jor_fazendas',
  unidades:     'jor_unidades',
  jornadas:     'jor_jornadas',
  setores:      'jor_setores',
  funcoes:      'jor_funcoes',
  tipos:        'jor_tipos_ocorrencia',
  feriados:     'jor_feriados',
  parametros:   'jor_parametros',
  vinculos:     'jor_vinculos',
  boletins:     'jor_boletins',
  apuracoes:    'jor_apuracoes',
  ocorrencias:  'jor_ocorrencias',
  competencias: 'jor_competencias',
  auditoria:    'jor_auditoria',
};

/* A chave primária de cada coleção. jor_vinculos e jor_apuracoes não usam
   "id" — o vínculo é do funcionário, a apuração é do boletim. */
const CHAVE = { vinculos: 'funcionario_id', apuracoes: 'boletim_id' };
const chaveDe = c => CHAVE[c] || 'id';

export const dados = Object.fromEntries(Object.keys(TABELAS).map(k => [k, []]));
dados.carregado = false;

const ouvintes = new Set();
export const aoMudarJornada = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach(fn => fn());

const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const pendentes = () => ler(CHAVE_FILA, []).length;

/* ---------------- cache ---------------- */

function carregarCache() {
  const c = ler(CHAVE_CACHE, null);
  if (!c) return;
  for (const k of Object.keys(TABELAS)) dados[k] = c[k] || [];
}

function salvarCache() {
  const c = {};
  for (const k of Object.keys(TABELAS)) c[k] = dados[k];
  gravar(CHAVE_CACHE, c);
}

/* ---------------- leitura ---------------- */

/**
 * Traz os cadastros inteiros (são pequenos) e o movimento da competência
 * pedida. Boletim de outro mês só é lido quando alguém pede.
 * @param {string} competencia 'YYYY-MM-01'
 */
export async function carregar(competencia = competenciaAtual()) {
  carregarCache();
  if (!estado.cliente || !estado.sessao) return dados;

  await enviarFila();

  const c = estado.cliente;
  const cadastros = ['destinos','empregadores','fazendas','unidades','jornadas',
                     'setores','funcoes','tipos','feriados','parametros','vinculos'];

  const respostas = await Promise.all([
    ...cadastros.map(k => c.from(TABELAS[k]).select('*')),
    c.from(TABELAS.boletins).select('*').eq('competencia', competencia),
    c.from(TABELAS.competencias).select('*').eq('competencia', competencia),
    c.from(TABELAS.ocorrencias).select('*').gte('data_fim', competencia),
  ]);

  const erro = respostas.find(r => r.error)?.error;
  if (erro) throw erro;

  cadastros.forEach((k, i) => { dados[k] = respostas[i].data || []; });
  dados.boletins     = respostas[cadastros.length].data || [];
  dados.competencias = respostas[cadastros.length + 1].data || [];
  dados.ocorrencias  = respostas[cadastros.length + 2].data || [];

  // Apurações dos boletins que vieram
  const ids = dados.boletins.map(b => b.id);
  if (ids.length) {
    const a = await c.from(TABELAS.apuracoes).select('*').in('boletim_id', ids);
    if (a.error) throw a.error;
    dados.apuracoes = a.data || [];
  } else {
    dados.apuracoes = [];
  }

  dados.carregado = true;
  salvarCache();
  avisar();
  return dados;
}

/* ---------------- escrita ---------------- */

function enfileirar(colecao, acao, item) {
  const fila = ler(CHAVE_FILA, []);
  fila.push({ colecao, acao, item, em: Date.now() });
  gravar(CHAVE_FILA, fila);
}

export async function enviarFila() {
  const fila = ler(CHAVE_FILA, []);
  if (!fila.length || !estado.cliente || !estado.sessao) return;
  const restantes = [];
  for (const p of fila) {
    try {
      const q = estado.cliente.from(TABELAS[p.colecao]);
      const { error } = p.acao === 'apagar'
        ? await q.delete().eq(chaveDe(p.colecao), p.item[chaveDe(p.colecao)])
        : await q.upsert(p.item, { onConflict: chaveDe(p.colecao) });
      if (error) throw error;
    } catch { restantes.push(p); }
  }
  gravar(CHAVE_FILA, restantes);
}

async function enviar(colecao, acao, item) {
  if (!estado.cliente || !estado.sessao || !navigator.onLine) { enfileirar(colecao, acao, item); return false; }
  try {
    const q = estado.cliente.from(TABELAS[colecao]);
    const { error } = acao === 'apagar'
      ? await q.delete().eq(chaveDe(colecao), item[chaveDe(colecao)])
      : await q.upsert(item, { onConflict: chaveDe(colecao) });
    if (error) throw error;
    return true;
  } catch {
    enfileirar(colecao, acao, item);
    return false;
  }
}

/**
 * Grava um item: primeiro no cache (a tela responde na hora), depois na
 * nuvem. Sem rede, entra na fila e sobe sozinho quando a rede voltar.
 */
export async function salvar(colecao, item) {
  const k = chaveDe(colecao);
  if (!item[k]) item[k] = novoId();
  const lista = dados[colecao];
  const i = lista.findIndex(x => x[k] === item[k]);
  if (i >= 0) lista[i] = { ...lista[i], ...item }; else lista.push(item);
  salvarCache(); avisar();
  await enviar(colecao, 'salvar', item);
  avisar();
  return item;
}

/** Nada é excluído de verdade (RN-129): inativa-se. */
export async function inativar(colecao, id) {
  const k = chaveDe(colecao);
  const item = dados[colecao].find(x => x[k] === id);
  if (!item) return;
  return salvar(colecao, { ...item, ativo: false });
}

/** Trilha de auditoria (RN-126). Justificativa é obrigatória na alteração. */
export async function registrar({ tabela, registro_id, acao, antes, depois, justificativa }) {
  const linha = {
    id: novoId(), tabela, registro_id, acao,
    antes: antes || null, depois: depois || null,
    justificativa: justificativa || null,
    usuario: estado.sessao?.user?.email || null,
    em: new Date().toISOString(),
  };
  dados.auditoria.push(linha);
  await enviar('auditoria', 'salvar', linha);
  return linha;
}

/* ---------------- consultas de apoio ---------------- */

export const competenciaAtual = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export const competenciaDe = dataISO => dataISO.slice(0, 8) + '01';

/**
 * Parâmetros vigentes NA DATA DO FATO (RN-124) — não na data do lançamento.
 * É o que impede que mudar um percentual hoje recalcule o mês passado.
 */
export function parametrosEm(dataISO) {
  const fora = {};
  for (const p of dados.parametros) {
    if (p.inicio > dataISO) continue;
    if (p.fim && p.fim < dataISO) continue;
    const atual = fora[p.chave];
    if (!atual || p.inicio > atual.inicio) fora[p.chave] = p;
  }
  return Object.fromEntries(Object.entries(fora).map(([k, p]) => [k, p.valor]));
}

/** Feriado aplicável à fazenda daquele vínculo, pelo município (RN-16). */
export function feriadoEm(dataISO, municipio) {
  return dados.feriados.find(f =>
    f.ativo !== false && f.data === dataISO &&
    (f.abrangencia === 'nacional' ||
     (f.abrangencia === 'municipal' && f.municipio === municipio) ||
     f.abrangencia === 'estadual')) || null;
}

export const vinculoDe = funcionarioId =>
  dados.vinculos.find(v => v.funcionario_id === funcionarioId) || null;

export const setorDe = vinculo =>
  dados.setores.find(s => s.id === vinculo?.setor_id) || null;

/** Jornada própria do vínculo ou, se não tiver, a do setor (RN-07.1). */
export function jornadaDe(vinculo) {
  const s = setorDe(vinculo);
  const id = vinculo?.jornada_id || s?.jornada_id;
  return dados.jornadas.find(j => j.id === id) || null;
}

/** O trecho da jornada que vale naquele dia da semana. */
export function jornadaDoDia(vinculo, dataISO) {
  const j = jornadaDe(vinculo);
  if (!j) return null;
  const [a, m, d] = dataISO.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return (j.dias || {})[String(dow)] || null;
}

export const unidadeDe = vinculo =>
  dados.unidades.find(u => u.id === vinculo?.unidade_id) || null;

export const fazendaDe = unidade =>
  dados.fazendas.find(f => f.id === unidade?.fazenda_id) || null;

export const empregadorDe = unidade =>
  dados.empregadores.find(e => e.id === unidade?.empregador_id) || null;

export const destinoDe = unidade =>
  dados.destinos.find(d => d.id === unidade?.destino_id) || null;

/** Nome cheio da unidade, do jeito que aparece nas telas e nos relatórios. */
export function nomeUnidade(unidade) {
  const e = empregadorDe(unidade), f = fazendaDe(unidade);
  return `${e?.nome || '—'} · ${f?.nome || '—'}`;
}

export const tipoPorCodigo = codigo =>
  dados.tipos.find(t => t.codigo === codigo) || null;

/** Situação da competência para um destino de DP. */
export const competenciaDoDestino = (competencia, destinoId) =>
  dados.competencias.find(c => c.competencia === competencia && c.destino_id === destinoId) || null;

/** Competência travada não aceita lançamento nem correção (RN-130). */
export function travada(competencia, destinoId) {
  const c = competenciaDoDestino(competencia, destinoId);
  return !!c && ['enviada', 'aprovada', 'travada'].includes(c.situacao);
}

export function limparJornadaDados() {
  for (const k of Object.keys(TABELAS)) dados[k] = [];
  dados.carregado = false;
  try { localStorage.removeItem(CHAVE_CACHE); } catch {}
}
