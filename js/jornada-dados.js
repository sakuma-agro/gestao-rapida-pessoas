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
  // Empréstimo Funcionário (21/09/2026). Salário só volta para quem tem a
  // tela Salário base — para os outros o banco devolve lista vazia.
  emprestimos:  'jor_emprestimos',
  abatimentos:  'jor_emprestimo_abatimentos',
  salarios:     'jor_salarios',
  // Férias e afastamentos (23/09/2026). O app controla direito e prazo —
  // nenhum valor em dinheiro mora aqui.
  afastamentos:  'jor_afastamentos',
  feriasInicial: 'jor_ferias_inicial',
  feriasGozos:   'jor_ferias_gozos',
  feriasPerdas:  'jor_ferias_perdas',
  // Boletins diários (24/09/2026): entrega do boletim de serviço, uma linha
  // por pessoa por dia. Chave = funcionario_id|AAAA-MM-DD.
  bolEntregas:   'jor_bol_entregas',
};

/* Leituras de apoio que não são tabela própria: as faltas de todo o histórico
   (para a contagem do período aquisitivo) e os boletins que caem dentro de
   férias lançadas (o pessoal tira férias "no papel" e continua trabalhando). */
const APOIO = ['faltas', 'bolFerias', 'bolJornada'];

/* A chave primária de cada coleção. jor_vinculos e jor_apuracoes não usam
   "id" — o vínculo é do funcionário, a apuração é do boletim. */
const CHAVE = { vinculos: 'funcionario_id', apuracoes: 'boletim_id', feriasInicial: 'funcionario_id', bolEntregas: 'chave' };
const chaveDe = c => CHAVE[c] || 'id';

export const dados = Object.fromEntries([...Object.keys(TABELAS), ...APOIO].map(k => [k, []]));
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
  for (const k of [...Object.keys(TABELAS), ...APOIO]) dados[k] = c[k] || [];
}

function salvarCache() {
  const c = {};
  for (const k of [...Object.keys(TABELAS), ...APOIO]) c[k] = dados[k];
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

  // Empréstimos: pequenos, vêm inteiros — o saldo depende de todo o histórico.
  // Tabela que ainda não existe (ou sem permissão) não derruba o DP.
  const extras = await Promise.all(['emprestimos', 'abatimentos', 'salarios']
    .map(k => c.from(TABELAS[k]).select('*')));
  ['emprestimos', 'abatimentos', 'salarios'].forEach((k, i) => {
    dados[k] = extras[i].error ? (dados[k] || []) : (extras[i].data || []);
  });

  // Férias e afastamentos: pequenos, vêm inteiros, pelo mesmo motivo.
  const FER = ['afastamentos', 'feriasInicial', 'feriasGozos', 'feriasPerdas'];
  const fer = await Promise.all(FER.map(k => c.from(TABELAS[k]).select('*')));
  FER.forEach((k, i) => { dados[k] = fer[i].error ? (dados[k] || []) : (fer[i].data || []); });
  try { await carregarApoioFerias(); } catch { /* sem rede: fica o que estava no cache */ }

  // Boletins diários: o mês da competência e as pendências em aberto (painel).
  try {
    const [a, m] = competencia.split('-').map(Number);
    await carregarEntregas(competencia, new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10));
  } catch { /* tabela sem permissão ou sem rede: o DP abre mesmo assim */ }

  dados.carregado = true;
  salvarCache();
  avisar();
  return dados;
}

/* Faltas de todo o histórico (boletim e ocorrência com o tipo FALTA) e os
   boletins lançados dentro de férias. Só datas — nada de horas. */
export async function carregarApoioFerias() {
  const c = estado.cliente;
  if (!c || !estado.sessao) return;
  const falta = dados.tipos.filter(t => t.codigo === 'FALTA').map(t => t.id);
  const lista = [];
  if (falta.length) {
    const [b, o] = await Promise.all([
      todas(() => c.from(TABELAS.boletins).select('funcionario_id,data_fato,situacao').in('tipo_id', falta).order('data_fato')),
      todas(() => c.from(TABELAS.ocorrencias).select('funcionario_id,data_ini,data_fim').in('tipo_id', falta).order('data_ini')),
    ]);
    b.filter(x => x.situacao !== 'cancelado')
      .forEach(x => lista.push({ funcionario_id: x.funcionario_id, data: x.data_fato }));
    o.forEach(x => {
      for (let d = x.data_ini; d && d <= x.data_fim; d = somarDia(d)) lista.push({ funcionario_id: x.funcionario_id, data: d });
    });
  }
  dados.faltas = lista;

  const gozos = (dados.feriasGozos || []).filter(g => g.situacao === 'lancado');
  if (!gozos.length) { dados.bolFerias = []; salvarCache(); return; }
  // Uma consulta por férias lançada: cada uma traz no máximo ~30 boletins, e
  // assim nenhuma resposta bate no limite de 1.000 linhas do Supabase.
  const rs = await Promise.all(gozos.map(g => c.from(TABELAS.boletins)
    .select('id,funcionario_id,data_fato,competencia,situacao')
    .eq('funcionario_id', g.funcionario_id).gte('data_fato', g.data_ini).lte('data_fato', g.data_fim)));
  const erro = rs.find(r => r.error)?.error;
  if (erro) throw erro;
  const vistos = new Set();
  dados.bolFerias = rs.flatMap(r => r.data || [])
    .filter(b => b.situacao !== 'cancelado' && !vistos.has(b.id) && vistos.add(b.id));
  salvarCache();
}

/* Lê a consulta inteira em páginas de 1.000 — o teto de uma resposta. */
async function todas(consulta) {
  const saida = [];
  for (let de = 0; de < 100000; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw error;
    saida.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return saida;
}

function somarDia(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/* Boletins diários: as marcações de um intervalo de datas, mais TODOS os
   "não entregou" e "em correção" em aberto (são poucos e alimentam as pendências). Também
   traz os boletins lançados na Gestão de jornada no intervalo — boletim
   lançado lá conta como entregue. Junta com o que já está no cache. */
export async function carregarEntregas(ini, fim) {
  const c = estado.cliente;
  if (!c || !estado.sessao) return;
  await enviarFila();
  const [marc, pend, bol] = await Promise.all([
    todas(() => c.from(TABELAS.bolEntregas).select('*').gte('data', ini).lte('data', fim).order('data')),
    todas(() => c.from(TABELAS.bolEntregas).select('*').in('situacao', ['nao_entregou', 'correcao']).order('data')),
    todas(() => c.from(TABELAS.boletins).select('funcionario_id,data_fato,situacao,numero')
      .gte('data_fato', ini).lte('data_fato', fim).order('data_fato')),
  ]);
  const fila = new Set(ler(CHAVE_FILA, []).filter(p => p.colecao === 'bolEntregas').map(p => p.item.chave));
  const mapa = new Map();
  // Fica do cache o que está fora do intervalo e não é pendência, e o que
  // ainda está na fila (a nuvem não sabe dele).
  for (const x of dados.bolEntregas) {
    if (fila.has(x.chave) || ((x.data < ini || x.data > fim) && !['nao_entregou', 'correcao'].includes(x.situacao))) mapa.set(x.chave, x);
  }
  for (const x of [...pend, ...marc]) if (!fila.has(x.chave)) mapa.set(x.chave, x);
  dados.bolEntregas = [...mapa.values()];
  const outros = (dados.bolJornada || []).filter(b => b.data_fato < ini || b.data_fato > fim);
  dados.bolJornada = [...outros, ...bol.filter(b => b.situacao !== 'cancelado')];
  salvarCache();
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

/**
 * Grava só um pedaço do vínculo, sem apagar o resto. É o que permite que o
 * Nível 1 (unidade, setor, função) e o Nível 2 (jornada, riscos) mexam no
 * mesmo registro sem um derrubar o outro.
 */
export async function salvarVinculo(funcionarioId, parcial) {
  const atual = dados.vinculos.find(v => v.funcionario_id === funcionarioId) || {};
  return salvar('vinculos', {
    ...atual,
    ...parcial,
    funcionario_id: funcionarioId,
    atualizado_em: new Date().toISOString(),
  });
}

/** Apaga de verdade — só para a marcação de boletim (desmarcar o dia). */
export async function apagar(colecao, chave) {
  const k = chaveDe(colecao);
  const item = dados[colecao].find(x => x[k] === chave);
  if (!item) return;
  dados[colecao] = dados[colecao].filter(x => x[k] !== chave);
  salvarCache(); avisar();
  await enviar(colecao, 'apagar', item);
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
  for (const k of [...Object.keys(TABELAS), ...APOIO]) dados[k] = [];
  dados.carregado = false;
  try { localStorage.removeItem(CHAVE_CACHE); } catch {}
}
