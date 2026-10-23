// jornada-dados.js — camada de dados do módulo de Jornada
//
// Segue o mesmo desenho do store.js do app: cache local, escrita otimista
// e fila de envio quando falta rede. Usa o cliente e a sessão que o
// store.js já criou — não cria outra conexão nem outro login.
//
// Nada aqui altera tabela existente: só as tabelas jor_*.

import { estado, novoId } from './store.js';
import { acesso, dpRestrito, veDestino } from './acesso.js';
import * as nucleo from './nucleo.js';

/* Rodada B (15/10/2026): cache e fila no IndexedDB pelo núcleo (js/nucleo.js),
   caixa 'jor.cache' e camada 'jor'. A gravação confere conflito por
   atualizado_em (campo local `_base`). */
const CAIXA = 'jor.cache';
const CAMADA = 'jor';

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
  // Tipos de hora extra especial (25/09/2026): Irrigação 1 = 1h, Irrigação 2 = 2h…
  tiposHe:      'jor_tipos_he_especial',
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
  // Folha, holerite e recibo (30/09/2026): entrega mensal dos documentos
  // assinados. Chave = funcionario_id|AAAA-MM|documento.
  docEntregas:   'jor_doc_entregas',
  // Indicadores de absenteísmo e turnover (30/09/2026): histórico de vínculos
  // (admissão e desligamento) e a lista de tipos de desligamento.
  indVinculos:   'rh_ind_vinculos',
  tiposDeslig:   'rh_ind_tipos_deslig',
  /* Horas guardadas (01/10/2026): movimentos guardar / pagar / usar.
     PROVISÓRIO: a tabela própria (jor_banco_horas, ver supabase.sql) não pôde
     ser criada; cada movimento é uma linha de jor_folha_ponto_config, com a
     chave começando por "bh|" e o movimento inteiro em `valor`. A folha de
     ponto só lê a chave 'ajuste', então as duas não se misturam. */
  banco:         'jor_folha_ponto_config',
  /* Ticket alimentação (14/10/2026): o valor de cada pessoa mora no vínculo
     (Cadastro Nível 2, ticket_valor/ticket_obs). Aqui ficam o abatimento e a
     observação de UM mês (chave = funcionario_id|AAAA-MM) e o retrato de cada
     relatório emitido (chave = AAAA-MM). */
  ticketMes:      'jor_ticket_mes',
  ticketEmissoes: 'jor_ticket_emissoes',
  /* Admissão e demissão (23/10/2026): listas modelo e as tarefas de cada
     pessoa. Chave da tarefa = funcionario_id|evento|data|modelo. */
  tarefaModelos:  'jor_tarefa_modelos',
  tarefas:        'jor_tarefas',
};

/* Leituras de apoio que não são tabela própria: as faltas de todo o histórico
   (para a contagem do período aquisitivo) e os boletins que caem dentro de
   férias lançadas (o pessoal tira férias "no papel" e continua trabalhando). */
const APOIO = ['faltas', 'bolFerias', 'bolJornada'];

/* A chave primária de cada coleção. jor_vinculos e jor_apuracoes não usam
   "id" — o vínculo é do funcionário, a apuração é do boletim. */
const CHAVE = { vinculos: 'funcionario_id', apuracoes: 'boletim_id', feriasInicial: 'funcionario_id', bolEntregas: 'chave', docEntregas: 'chave', banco: 'chave', ticketMes: 'chave', ticketEmissoes: 'competencia', tarefas: 'chave' };
const chaveDe = c => CHAVE[c] || 'id';

export const dados = Object.fromEntries([...Object.keys(TABELAS), ...APOIO].map(k => [k, []]));
dados.carregado = false;

const ouvintes = new Set();
export const aoMudarJornada = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach(fn => fn());

export const pendentes = () => nucleo.pendentes(CAMADA);
export const parados = () => nucleo.parados(CAMADA);
/* O carimbo do servidor viaja em `_base` (ver nucleo.gravarRegistro). */
const comBase = lista => (lista || []).map(r => ({ ...r, _base: r.atualizado_em ?? null }));
nucleo.aoMudarFila(avisar);

/* ---------------- cache ---------------- */

async function carregarCache() {
  const c = await nucleo.lerCaixa(CAIXA, null);
  await nucleo.contarFila(CAMADA);
  if (!c) return;
  for (const k of [...Object.keys(TABELAS), ...APOIO]) dados[k] = c[k] || [];
  recortar();
}

/* ---------------- recorte por DP (07/10/2026) ----------------
   Login com "DP que enxerga" = um DP só (acesso.destinos): o movimento das
   pessoas dos outros DP sai da memória logo depois de cada leitura, e as telas
   do DP listam pessoas por pessoasDp() e destinos por destinosDp(). Assim
   contagens, listas e relatórios ficam no DP dele sem cada tela ter de saber.
   Cadastros (vínculos, unidades, destinos) e os vínculos dos indicadores
   ficam inteiros: a aba Cadastros continua mostrando todo mundo. */
const POR_PESSOA = ['boletins', 'ocorrencias', 'emprestimos', 'abatimentos', 'salarios',
  'afastamentos', 'feriasInicial', 'feriasGozos', 'feriasPerdas', 'bolEntregas',
  'docEntregas', 'banco', 'ticketMes', 'tarefas', 'faltas', 'bolFerias', 'bolJornada'];

/** Destino de DP da pessoa, pelo vínculo → unidade. */
export const destinoIdDoFuncionario = fid => unidadeDe(vinculoDe(fid))?.destino_id || null;
/** A pessoa é do DP que este login enxerga? (sem recorte: sempre sim) */
export const noMeuDp = fid => !dpRestrito() || veDestino(destinoIdDoFuncionario(fid));
/** As pessoas que as telas do DP mostram. */
export const pessoasDp = () => dpRestrito() ? estado.funcionarios.filter(f => noMeuDp(f.id)) : estado.funcionarios;
/** Os destinos ativos que este login enxerga. */
export const destinosDp = () => dados.destinos.filter(d => d.ativo !== false && veDestino(d.id));
export { dpRestrito };

/** Tira da memória o movimento de quem é de outro DP. */
export function recortar() {
  if (!dpRestrito()) return;
  for (const k of POR_PESSOA) {
    if (Array.isArray(dados[k])) dados[k] = dados[k].filter(x => !x?.funcionario_id || noMeuDp(x.funcionario_id));
  }
  dados.competencias = (dados.competencias || []).filter(c => veDestino(c.destino_id));
  const bol = new Set(dados.boletins.map(b => b.id));
  dados.apuracoes = (dados.apuracoes || []).filter(a => bol.has(a.boletim_id));
}
const soMeuDp = lista => dpRestrito() ? (lista || []).filter(x => !x?.funcionario_id || noMeuDp(x.funcionario_id)) : lista;

function salvarCache() {
  const c = {};
  for (const k of [...Object.keys(TABELAS), ...APOIO]) c[k] = dados[k];
  nucleo.gravarCaixa(CAIXA, c);
}

/* ---------------- leitura ---------------- */

/**
 * Traz os cadastros inteiros (são pequenos) e o movimento da competência
 * pedida. Boletim de outro mês só é lido quando alguém pede.
 * @param {string} competencia 'YYYY-MM-01'
 */
let ultimaCompetencia = null;
export const competenciaCarregada = () => ultimaCompetencia;
export async function carregar(competencia = competenciaAtual()) {
  await carregarCache();
  if (!estado.cliente || !estado.sessao) return dados;
  ultimaCompetencia = competencia;

  await enviarFila();

  const c = estado.cliente;
  const cadastros = ['destinos','empregadores','fazendas','unidades','jornadas',
                     'setores','funcoes','tipos','feriados','parametros','vinculos'];

  const respostas = await Promise.all([
    ...cadastros.map(k => c.from(TABELAS[k]).select('*')),
    c.from(TABELAS.boletins).select('*').eq('competencia', competencia),
    // Todas as competências (tabela pequena: destino × mês). O boletim atrasado
    // precisa saber se o mês DO FATO já foi enviado, não só o mês aberto na tela.
    c.from(TABELAS.competencias).select('*'),
    c.from(TABELAS.ocorrencias).select('*').gte('data_fim', competencia),
  ]);

  const erro = respostas.find(r => r.error)?.error;
  if (erro) throw erro;

  cadastros.forEach((k, i) => { dados[k] = comBase(respostas[i].data); });
  dados.boletins     = comBase(respostas[cadastros.length].data);
  dados.competencias = comBase(respostas[cadastros.length + 1].data);
  dados.ocorrencias  = comBase(respostas[cadastros.length + 2].data);

  // Daqui para baixo nada depende de nada, a não ser as apurações (precisam
  // dos boletins) e o apoio de férias (precisa dos tipos e dos gozos).
  // Antes eram ~8 idas ao servidor em fila; agora vão todas juntas
  // (15/10/2026). Cada parte que falhar continua não derrubando o DP.
  const lerTabela = async k => {
    const r = await c.from(TABELAS[k]).select('*');
    if (!r.error) dados[k] = comBase(r.data);
    else dados[k] = dados[k] || [];
  };
  const ids = dados.boletins.map(b => b.id);
  const FER = ['afastamentos', 'feriasInicial', 'feriasGozos', 'feriasPerdas'];
  const [a, m] = competencia.split('-').map(Number);
  const [apur] = await Promise.all([
    ids.length ? c.from(TABELAS.apuracoes).select('*').in('boletim_id', ids)
               : Promise.resolve({ data: [], error: null }),
    // Tipos de hora extra especial (25/09/2026): se falhar, só o seletor fica vazio.
    lerTabela('tiposHe'),
    // Empréstimos: pequenos, vêm inteiros — o saldo depende de todo o histórico.
    ...['emprestimos', 'abatimentos', 'salarios'].map(k => lerTabela(k)),
    // Férias e afastamentos: inteiros pelo mesmo motivo; o apoio vem logo depois.
    Promise.all(FER.map(k => lerTabela(k)))
      .then(() => carregarApoioFerias()).catch(() => { /* sem rede: fica o cache */ }),
    // Boletins diários: o mês da competência e as pendências em aberto (painel).
    carregarEntregas(competencia, new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10))
      .catch(() => { /* sem permissão ou sem rede: o DP abre mesmo assim */ }),
    // Folha, holerite e recibo: tabela pequena, vem inteira (painel do DP).
    carregarDocs().catch(() => {}),
    // Horas guardadas: o saldo é de todo o histórico.
    c.from(TABELAS.banco).select('*').like('chave', 'bh|%').then(bh => {
      dados.banco = bh.error ? (dados.banco || [])
        : (bh.data || []).map(r => ({ ...(r.valor || {}), chave: r.chave, _base: r.atualizado_em ?? null }));
    }),
    // Ticket e vínculos dos indicadores: pequenos, vêm inteiros.
    ...['ticketMes', 'ticketEmissoes', 'indVinculos', 'tiposDeslig'].map(k => lerTabela(k)),
    // Admissão e demissão: pequenas, vêm inteiras (painel do DP).
    carregarTarefas().catch(() => {}),
  ]);
  if (apur.error) throw apur.error;
  dados.apuracoes = comBase(apur.data);

  recortar();
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
  if (!gozos.length) { dados.bolFerias = []; recortar(); salvarCache(); return; }
  // Uma consulta só (15/10/2026) — antes era uma por férias lançada. Vem tudo
  // entre a primeira e a última férias dos funcionários envolvidos, em páginas
  // de 1.000, e o recorte de cada período é feito aqui.
  const ini = gozos.reduce((m, g) => g.data_ini < m ? g.data_ini : m, gozos[0].data_ini);
  const fim = gozos.reduce((m, g) => g.data_fim > m ? g.data_fim : m, gozos[0].data_fim);
  const funcs = [...new Set(gozos.map(g => g.funcionario_id))];
  const todosBol = await todas(() => c.from(TABELAS.boletins)
    .select('id,funcionario_id,data_fato,competencia,situacao')
    .in('funcionario_id', funcs).gte('data_fato', ini).lte('data_fato', fim).order('data_fato'));
  const porFunc = new Map();
  gozos.forEach(g => { if (!porFunc.has(g.funcionario_id)) porFunc.set(g.funcionario_id, []); porFunc.get(g.funcionario_id).push(g); });
  dados.bolFerias = todosBol.filter(b => b.situacao !== 'cancelado'
    && (porFunc.get(b.funcionario_id) || []).some(g => b.data_fato >= g.data_ini && b.data_fato <= g.data_fim));
  recortar();
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
/** Qualidade dos boletins (28/09/2026): boletins de um período, só os campos
 *  do painel. Sem rede, usa o que já está carregado. */
export async function boletinsDoPeriodo(ini, fim) {
  const c = estado.cliente;
  const campos = 'id,funcionario_id,unidade_id,data_fato,numero,hora_ini,hora_fim,intervalo_min,qualidade,marcado,situacao,observacao,origem_alteracao,motivo_alteracao';
  const local = () => dados.boletins.filter(b => b.data_fato >= ini && b.data_fato <= fim);
  if (!c || !estado.sessao) return local();
  try {
    return soMeuDp(await todas(() => c.from(TABELAS.boletins).select(campos)
      .gte('data_fato', ini).lte('data_fato', fim).order('data_fato')));
  } catch { return local(); }
}

/** Apurações de uma lista de boletins (Marcado × Conferido por período). */
export async function apuracoesDe(ids) {
  const c = estado.cliente;
  const local = () => dados.apuracoes.filter(a => ids.includes(a.boletim_id));
  if (!ids.length) return [];
  if (!c || !estado.sessao) return local();
  try {
    const out = [];
    for (let i = 0; i < ids.length; i += 150) {
      const r = await c.from(TABELAS.apuracoes).select('boletim_id,min_extra_50,min_extra_100,min_deficit').in('boletim_id', ids.slice(i, i + 150));
      if (r.error) throw r.error;
      out.push(...(r.data || []));
    }
    return out;
  } catch { return local(); }
}

/* Folha, holerite e recibo (30/09/2026): pessoa × mês × documento. Pequena
   (≈ 50 pessoas × 3 documentos × 12 meses), vem inteira. O que ainda está na
   fila (a nuvem não sabe dele) fica como está no aparelho. */
export async function carregarDocs() {
  const c = estado.cliente;
  if (!c || !estado.sessao) return;
  await enviarFila();
  const todos = comBase(await todas(() => c.from(TABELAS.docEntregas).select('*').order('competencia')));
  const fila = new Set((await nucleo.listarFila(CAMADA)).filter(p => p.colecao === 'docEntregas').map(p => p.item.chave));
  const mapa = new Map(todos.filter(x => !fila.has(x.chave)).map(x => [x.chave, x]));
  for (const x of dados.docEntregas || []) if (fila.has(x.chave)) mapa.set(x.chave, x);
  dados.docEntregas = [...mapa.values()];
  recortar();
  salvarCache();
}

/* Admissão e demissão (23/10/2026): modelos e tarefas vêm inteiros. O que
   ainda está na fila fica como está no aparelho. */
export async function carregarTarefas() {
  const c = estado.cliente;
  if (!c || !estado.sessao) return;
  await enviarFila();
  const [mods, tars] = await Promise.all([
    todas(() => c.from(TABELAS.tarefaModelos).select('*').order('ordem')),
    todas(() => c.from(TABELAS.tarefas).select('*').order('data_evento')),
  ]);
  const naFila = (await nucleo.listarFila(CAMADA));
  for (const [col, lista] of [['tarefaModelos', mods], ['tarefas', tars]]) {
    const k = chaveDe(col);
    const fila = new Set(naFila.filter(p => p.colecao === col).map(p => p.item[k]));
    const mapa = new Map(comBase(lista).filter(x => !fila.has(x[k])).map(x => [x[k], x]));
    for (const x of dados[col] || []) if (fila.has(x[k])) mapa.set(x[k], x);
    dados[col] = [...mapa.values()];
  }
  recortar();
  salvarCache();
}

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
  const fila = new Set((await nucleo.listarFila(CAMADA)).filter(p => p.colecao === 'bolEntregas').map(p => p.item.chave));
  const mapa = new Map();
  // Fica do cache o que está fora do intervalo e não é pendência, e o que
  // ainda está na fila (a nuvem não sabe dele).
  for (const x of dados.bolEntregas) {
    if (fila.has(x.chave) || ((x.data < ini || x.data > fim) && !['nao_entregou', 'correcao'].includes(x.situacao))) mapa.set(x.chave, x);
  }
  for (const x of comBase([...pend, ...marc])) if (!fila.has(x.chave)) mapa.set(x.chave, x);
  dados.bolEntregas = [...mapa.values()];
  const outros = (dados.bolJornada || []).filter(b => b.data_fato < ini || b.data_fato > fim);
  dados.bolJornada = [...outros, ...bol.filter(b => b.situacao !== 'cancelado')];
  recortar();
  salvarCache();
}

/* Painel do DP, visão Geral (23/10/2026): entregas e lançamentos de TODOS os
   meses, só os campos que a conta usa. Sem rede, fica com o que já está na
   memória. Recortado pelo DP do login. */
export async function carregarRecebidosGeral() {
  const c = estado.cliente;
  const local = () => ({ bolEntregas: dados.bolEntregas || [], bolJornada: dados.bolJornada || [] });
  if (!c || !estado.sessao) return local();
  try {
    const [ent, bol] = await Promise.all([
      todas(() => c.from(TABELAS.bolEntregas).select('funcionario_id,data,situacao')
        .in('situacao', ['entregou', 'nao_entregou', 'correcao']).order('data')),
      todas(() => c.from(TABELAS.boletins).select('funcionario_id,data_fato,situacao').order('data_fato')),
    ]);
    return { bolEntregas: soMeuDp(ent), bolJornada: soMeuDp(bol) };
  } catch { return local(); }
}

/* ---------------- escrita ---------------- */

/* Coleções gravadas num formato diferente do que a tela usa. */
const PARA_BANCO = {
  banco: m => {
    const { chave, ...resto } = m;
    return { chave, valor: resto, atualizado_em: new Date().toISOString(), atualizado_por: estado.sessao?.user?.email || null };
  },
};
const paraBanco = (colecao, item) => (PARA_BANCO[colecao] ? PARA_BANCO[colecao](item) : item);

/* Rodada B: um caminho só — tudo entra na fila do núcleo e sobe dali, com
   rede ou sem. O núcleo garante um envio por vez e a ordem de preenchimento. */
const CAMADA_DEF = {
  tabelaDe: c => TABELAS[c],
  chaveDe,
  paraBanco,
  cliente: () => estado.cliente,
  podeEnviar: () => !!(estado.cliente && estado.sessao && navigator.onLine),
  aoEnviado: (colecao, salvo) => {
    const k = chaveDe(colecao);
    const alvo = (dados[colecao] || []).find(x => x[k] === salvo[k]);
    if (alvo) { alvo.atualizado_em = salvo.atualizado_em; alvo._base = salvo.atualizado_em; salvarCache(); }
  },
};
export const enviarFila = () => nucleo.enviarFila(CAMADA, CAMADA_DEF);

async function enviar(colecao, acao, item, base = null) {
  await nucleo.adicionarNaFila(CAMADA, { colecao, acao, item, base });
  if (CAMADA_DEF.podeEnviar()) { try { await enviarFila(); } catch {} }
  return nucleo.pendentes(CAMADA) === 0;
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
  const base = i >= 0 ? (lista[i]._base ?? null) : null;
  if (i >= 0) lista[i] = { ...lista[i], ...item, _base: base }; else lista.push({ ...item, _base: null });
  salvarCache(); avisar();
  await enviar(colecao, 'salvar', item, base);
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

const semBase = o => { if (!o || typeof o !== 'object') return o || null; const { _base, ...r } = o; return r; };
/** Trilha de auditoria (RN-126). Justificativa é obrigatória na alteração. */
export async function registrar({ tabela, registro_id, acao, antes, depois, justificativa }) {
  const linha = {
    id: novoId(), tabela, registro_id, acao,
    antes: semBase(antes), depois: semBase(depois),
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

/* Pendências do mês anterior (23/10/2026). Os boletins em memória são só os
   da competência aberta; o Fechamento busca à parte os do mês anterior, com
   as apurações, para o botão "Pendências do mês anterior". Sem rede: lista vazia. */
dados.bolAnterior = [];
dados.apurAnterior = [];
let anteriorDe = null;
export async function carregarAnterior(competencia, forcar = false) {
  const [a, m] = competencia.split('-').map(Number);
  const ant = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
  if (!forcar && anteriorDe === ant) return;
  const c = estado.cliente;
  if (!c || !estado.sessao) return;
  try {
    const r = await c.from(TABELAS.boletins).select('*').eq('competencia', ant).neq('situacao', 'cancelado');
    if (r.error) throw r.error;
    const ids = r.data.map(b => b.id);
    const ap = ids.length ? await c.from(TABELAS.apuracoes).select('*').in('boletim_id', ids) : { data: [] };
    if (ap.error) throw ap.error;
    dados.bolAnterior = r.data;
    dados.apurAnterior = ap.data;
    anteriorDe = ant;
  } catch (e) {
    console.warn('[jornada] pendências do mês anterior:', e.message || e);
  }
}

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

/** Recebe periculosidade na data? (23/10/2026, pedido dele) — marcada no
    vínculo OU no salário vigente do RH › Salários (o "base + peric.").
    Periculosidade e insalubridade não acumulam (CLT, art. 193, §2º): quem tem
    periculosidade não marca insalubridade no boletim, e o fechamento não paga
    insalubridade para essa pessoa, mesmo que algum boletim esteja marcado. */
export function recebePericulosidade(funcionarioId, data) {
  if (!funcionarioId) return false;
  if (vinculoDe(funcionarioId)?.periculosidade) return true;
  const d = String(data || new Date().toISOString()).slice(0, 10);
  const s = (dados.salarios || []).filter(x => x.funcionario_id === funcionarioId && String(x.desde || '') <= d)
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)))[0];
  return !!s && Number(s.periculosidade) > 0;
}

export const setorDe = vinculo =>
  dados.setores.find(s => s.id === vinculo?.setor_id) || null;

/** De onde vem a jornada (29/09/2026): a própria do vínculo; senão a da
    função (cadastrada em Cadastros › Estrutura › Funções); senão a do setor
    (RN-07.1). */
export const funcaoDe = vinculo => (dados.funcoes || []).find(f => f.id === vinculo?.funcao_id) || null;
export function origemJornada(vinculo) {
  if (vinculo?.jornada_id) return 'propria';
  if (funcaoDe(vinculo)?.jornada_id) return 'funcao';
  if (setorDe(vinculo)?.jornada_id) return 'setor';
  return '';
}
export function jornadaDe(vinculo) {
  const s = setorDe(vinculo);
  const id = vinculo?.jornada_id || funcaoDe(vinculo)?.jornada_id || s?.jornada_id;
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

/**
 * Competência de PAGAMENTO de um boletim (RN-18, 28/09/2026). É o mês do fato,
 * a não ser que esse mês já tenha sido enviado ao DP daquele destino: aí o
 * boletim atrasado vai para o primeiro mês seguinte ainda aberto, e o mês do
 * fato continua fechado e intacto.
 */
export function competenciaDePagamento(dataISO, destinoId) {
  let c = competenciaDe(dataISO);
  if (!destinoId) return c;
  for (let i = 0; i < 24 && travada(c, destinoId); i++) {
    const [a, m] = c.split('-').map(Number);
    c = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  }
  return c;
}

/** Boletim cujo fato é de um mês anterior ao da competência em que ele é pago. */
export const deCompetenciaAnterior = b => !!b && competenciaDe(b.data_fato) < b.competencia;

/**
 * Boletins já lançados para a pessoa naquele dia, de qualquer competência
 * (28/09/2026). O dia 30/09 pode estar num mês já fechado e fora do que a
 * tela carregou — por isso vai ao banco. Sem rede, fica com o cache.
 */
export async function boletinsDoDia(fid, data) {
  const vivo = b => b.funcionario_id === fid && b.data_fato === data && b.situacao !== 'cancelado';
  let boletins = dados.boletins.filter(vivo);
  let apuracoes = dados.apuracoes.filter(a => boletins.some(b => b.id === a.boletim_id));
  if (!estado.cliente || !estado.sessao) return { boletins, apuracoes };
  try {
    const c = estado.cliente;
    const r = await c.from(TABELAS.boletins).select('*').eq('funcionario_id', fid).eq('data_fato', data);
    if (r.error) throw r.error;
    const mapa = new Map((r.data || []).filter(vivo).map(b => [b.id, b]));
    boletins.forEach(b => mapa.set(b.id, b));             // o local (recém-gravado) vale mais
    boletins = [...mapa.values()].filter(vivo);
    const ids = boletins.map(b => b.id);
    if (ids.length) {
      const a = await c.from(TABELAS.apuracoes).select('*').in('boletim_id', ids);
      if (a.error) throw a.error;
      const am = new Map((a.data || []).map(x => [x.boletim_id, x]));
      apuracoes.forEach(x => am.set(x.boletim_id, x));
      apuracoes = [...am.values()].filter(x => ids.includes(x.boletim_id));
    }
  } catch { /* sem rede: fica com o que já estava na memória */ }
  return { boletins, apuracoes };
}

/* Rede de volta (15/10/2026, rodada A): antes a fila do DP só subia quando
   alguém abria o DP de novo — o store.js só esvaziava a fila do EPI. */
addEventListener('online', () => { enviarFila().then(avisar).catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && pendentes()) enviarFila().catch(() => {}); });
setInterval(() => { if (pendentes() > 0) enviarFila().catch(() => {}); }, 2 * 60 * 1000);

export function limparJornadaDados() {
  for (const k of [...Object.keys(TABELAS), ...APOIO]) dados[k] = [];
  dados.carregado = false;
  nucleo.apagarCaixa(CAIXA);
}
