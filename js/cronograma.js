// cronograma.js — área Cronograma geral (28/10/2026, pedido do Guilherme)
//
// Um lugar só com as tarefas e os vencimentos de TODAS as áreas, por pessoa
// do escritório, com duas visões: Calendário (mês, com a lista do dia) e
// Kanban (colunas por situação ou por pessoa). Telas aprovadas por ele no
// artefato "Cronograma Geral LOP".
//
// De onde vêm os itens:
//   • automáticos — lidos das outras áreas a cada abertura: exames, treinamentos,
//     C.A de EPI e medidas de acidente (SST), tarefas de admissão/demissão e
//     prazo de férias (DP), ordens de serviço e check list (Máquinas),
//     extintores e anomalias (Vistorias), requisitos, auditorias e ações de
//     melhoria (Certificação), entregas e problemas dos projetos (Projetos),
//     planos do salário digno (RH) e as atividades da reunião semanal.
//     Cada fonte só aparece para quem tem acesso a ela — quem manda é o RLS
//     do banco; a fonte que não abre fica de fora sem barulho.
//   • tarefas lançadas à mão (cron_tarefas), que podem repetir toda semana ou
//     todo mês.
//
// Situação (a fazer / fazendo / feito) e responsável de item automático e de
// ocorrência de tarefa que repete ficam em cron_estado, pela chave do item.
// A chave leva a data: quando o vencimento muda (exame renovado), nasce um
// item novo e o antigo some.
//
// Pessoas = as do escritório (reu_pessoas, as mesmas da reunião semanal).
// Responsável do item automático, nesta ordem: o que foi escolhido no card
// (cron_estado) → o nome escrito na origem, quando bate com alguém do
// escritório → o responsável padrão da origem (cron_config 'responsaveis') →
// os responsáveis da área/unidade (cron_config 'responsaveis_area'; padrão
// RESP_AREA_PADRAO, definido pelo Guilherme em 28/10/2026).
//
// 07/11/2026 — reunião matinal de 15 minutos (pedido dele): três abas —
// Calendário (tudo que tem data), Foco do dia (o que a equipe escolheu fazer:
// A fazer → Em andamento → Concluído hoje) e Reunião (uma pessoa por vez, com
// cronômetro; dali se envia tarefa para o Foco do dia). A data de envio fica
// em foco_em; a tarefa fica no foco até concluir e, passado o dia, ganha a
// etiqueta "Não feito". Bloqueado (com "depende de") tira do foco.
//
// Offline (regra do app): tudo fica em cache; gravação sem rede entra numa
// fila e sobe sozinha quando a rede voltar.

import { linhasCronograma, textoFreq } from './epi-cronograma-dados.js';
import { estado, gravarLocal } from './store.js';
import { acesso, abrirModulo, moduloDe, podeTela } from './acesso.js';
import { entrarNaArea, areasLiberadas } from './areas.js';
import { abrirCompras, carregarCompras, pedidosAbertos, ehComprador, URG as URG_CMP } from './compras.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();
const norm = s => limpo(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch { return p; } };

const CACHE = 'gr.cronograma';
const FILA = 'gr.cronograma.fila';

/* ---------------- datas ---------------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDe = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const hoje = () => iso(new Date());
const addDias = (s, n) => { const d = dataDe(s); d.setDate(d.getDate() + n); return iso(d); };
const addMeses = (s, n) => {
  const [a, m, d] = s.split('-').map(Number);
  const alvo = new Date(a, m - 1 + n, 1);
  const ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ult));
  return iso(alvo);
};
const diasAte = s => Math.round((dataDe(s) - dataDe(hoje())) / 864e5);
const brCurto = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const br = s => s ? s.split('-').reverse().join('/') : '';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* Janela que se lê das fontes: atrasados de até 6 meses, futuro até 4 meses. */
const JANELA_ATRAS = 180, JANELA_FRENTE = 120;
const naJanela = s => !!s && s >= addDias(hoje(), -JANELA_ATRAS) && s <= addDias(hoje(), JANELA_FRENTE);

/* ---------------- áreas (cor e nome) ---------------- */
export const AREAS_C = {
  dp:   { nome: 'DP', cor: '#2F6FB0' },
  sst:  { nome: 'SST', cor: '#D97000' },
  rh:   { nome: 'RH', cor: '#744F28' },
  maq:  { nome: 'Máquinas', cor: '#51534A' },
  vist: { nome: 'Vistorias', cor: '#13827A' },
  cert: { nome: 'Certificação', cor: '#5E8A00' },
  proj: { nome: 'Projetos', cor: '#7A4FB5' },
  esc:  { nome: 'Escritório', cor: '#C2185B' },
  cad:  { nome: 'Cadastros', cor: '#0E7490' },
  custo: { nome: 'Custo Base', cor: '#8A6D1F' },
  colh: { nome: 'Colheita e Produção', cor: '#C2410C' },
  prog: { nome: 'Programação Campo', cor: '#3F7D20' },
  est:  { nome: 'Estoque', cor: '#6B5B95' },
  cmp:  { nome: 'Compras', cor: '#B7791F' },   // pedidos de compra (10/11/2026)
};
const areaDe = k => AREAS_C[k] || AREAS_C.esc;

/* Responsável de cada área (28/10/2026, definido pelo Guilherme). Máquinas e
   DP se dividem por unidade: Matriz (Vinícius) e Quebra Cocão (Laís). Vale
   para os itens automáticos e para as tarefas lançadas sem responsável. O
   admin muda no botão "Responsáveis" (cron_config 'responsaveis_area'). */
const UNIDADES = ['Matriz', 'Quebra Cocão'];
const LINHAS_AREA = [
  ['custo'], ['colh'], ['maq', 'Matriz'], ['maq', 'Quebra Cocão'], ['cad'], ['rh'], ['sst'],
  ['dp', 'Matriz'], ['dp', 'Quebra Cocão'], ['vist'], ['cert'], ['proj'], ['prog'], ['est'], ['cmp'], ['esc'],
];
const RESP_AREA_PADRAO = {
  custo: ['reu-lincoln'], colh: ['reu-lincoln'],
  'maq@Matriz': ['reu-vinicius'], 'maq@Quebra Cocão': ['reu-lais'], maq: ['reu-vinicius', 'reu-lais'],
  cad: ['reu-lincoln', 'reu-vinicius'], rh: ['reu-guilherme'], sst: ['reu-vinicius'],
  'dp@Matriz': ['reu-vinicius'], 'dp@Quebra Cocão': ['reu-lais'], dp: ['reu-vinicius', 'reu-lais'],
};
/* Vínculos fixos (09/11/2026, pedido dele): toda tarefa de exames e de
   treinamentos é do Vinícius; toda de Gestão de jornada (boletim, lançamento
   de jornada, fechamento do DP) é do Lincoln. Vale para os vencimentos que
   vêm do app, para as avulsas que abrem essas telas e, nas avulsas sem
   responsável, pelo nome da tarefa. Só a troca feita à mão num item (cron_estado)
   passa por cima. */
const VINC_ORIGEM = { 'sst-exames': 'reu-vinicius', 'sst-trein': 'reu-vinicius', 'dp-emp': 'reu-guilherme' };
const VINC_TELA = { exVenc: 'reu-vinicius', trVenc: 'reu-vinicius', bdDia: 'reu-lincoln', jorLancar: 'reu-lincoln' };
const VINC_TEXTO = [
  [/\bexames?\b|\baso\b|treinament/, 'reu-vinicius'],
  [/boleti|gestao de jornada|\bjornada\b|lancar jornada|fechamento do dp/, 'reu-lincoln'],
];
/* Exceções por tarefa (09/11/2026, planilha "Atividades do app" revisada por
   ele): a origem tem o responsável padrão (cron_config 'responsaveis') e
   estas tarefas vão para outra pessoa — vale para as próximas vezes também. */
const VINC_REGRAS = [
  ['dp-tarefas', /lancar salario e ticket/, 'reu-guilherme'],
  ['cert-docs', /^an (77|10) /, 'reu-matheus'],
  ['cert-docs', /^an (58|115) /, 'reu-vinicius'],
  ['cert-melh', /caixa de reclama/, 'reu-vinicius'],
];
const vincRegra = a => VINC_REGRAS.find(([o, re]) => o === a.origem && re.test(norm(a.titulo)))?.[2] || null;
const vincTexto = t => VINC_TEXTO.find(([re]) => re.test(norm(t)))?.[1] || null;
const unidadeDeTexto = s => /quebra\s*coc/i.test(norm(s)) ? 'Quebra Cocão' : (s ? 'Matriz' : null);

/* Origens automáticas — a chave é a usada em cron_config 'responsaveis'. */
/* Origens automáticas — a chave é a usada em cron_config 'responsaveis'.
   ir: onde fica a origem, para o botão "Ir para" do card (29/10/2026, pedido
   dele). a = área (entrarNaArea), t = tela, x = parâmetro da moldura,
   m = módulo (Vistorias). Um item pode trazer o seu próprio "ir". */
const ORIGENS = {
  'sst-exames': { nome: 'SST › Exames', area: 'sst', ir: { a: 'pessoas', t: 'exVenc' } },
  'sst-trein':  { nome: 'SST › Treinamentos', area: 'sst', ir: { a: 'pessoas', t: 'trVenc' } },
  'sst-ca':     { nome: 'SST › EPI\'s (validade do C.A)', area: 'sst', ir: { a: 'pessoas', t: 'epis' } },
  'sst-epi':    { nome: 'SST › EPI\'s (troca de EPI)', area: 'sst', ir: { a: 'pessoas', t: 'epiCrono' } },
  'sst-acid':   { nome: 'SST › Acidentes', area: 'sst', ir: { a: 'pessoas', t: 'acLista' } },
  'sst-camp':   { nome: 'SST › Campanhas', area: 'sst', ir: { a: 'pessoas', t: 'camCal' } },
  'dp-tarefas': { nome: 'Cadastros › Admissão e demissão', area: 'cad', ir: { a: 'pessoas', t: 'tfPainel' } },
  'cad-aniv':   { nome: 'Cadastros › Aniversariantes', area: 'cad', ir: { a: 'pessoas', t: 'aniversarios' } },
  'dp-ferias':  { nome: 'DP › Férias (prazo de concessão)', area: 'dp', ir: { a: 'pessoas', t: 'ferPainel' } },
  'dp-gozo':    { nome: 'DP › Férias (gozo lançado)', area: 'dp', ir: { a: 'pessoas', t: 'ferPainel' } },
  'dp-afast':   { nome: 'DP › Afastamentos (retorno)', area: 'dp', ir: { a: 'pessoas', t: 'ferAfast' } },
  'dp-feriado': { nome: 'DP › Feriados', area: 'dp' },
  'dp-emp':     { nome: 'DP › Empréstimo (liberação acima do teto)', area: 'dp', ir: { a: 'pessoas', t: 'empRecibos' } },
  'maq-os':     { nome: 'Máquinas › Ordens de serviço', area: 'maq', ir: { a: 'manutencoes', x: 'acao=ordens' } },
  'maq-ck':     { nome: 'Máquinas › Check list', area: 'maq', ir: { a: 'manutencoes', x: 'acao=checklist' } },
  'maq-gar':    { nome: 'Máquinas › Garantia', area: 'maq', ir: { a: 'manutencoes', x: 'acao=maquinas' } },
  'vist-ext':   { nome: 'Vistorias › Extintores', area: 'vist', ir: { a: 'vistorias', m: 'vsEquip', t: 'vsEx' } },
  'vist-pend':  { nome: 'Vistorias › Anomalias em aberto', area: 'vist', ir: { a: 'vistorias', m: 'vsAnom', t: 'vsAnAberto' } },
  'cert-req':   { nome: 'Certificação › Requisitos', area: 'cert', ir: { a: 'certificacao', t: 'ceRequisitos' } },
  'cert-aud':   { nome: 'Certificação › Auditorias e certificados', area: 'cert', ir: { a: 'certificacao', t: 'ceCertificacoes' } },
  'cert-acoes': { nome: 'Certificação › Ações de melhoria', area: 'cert', ir: { a: 'certificacao', t: 'mcMelhorias' } },
  'cert-docs':  { nome: 'Certificação › Documentos por fazenda (AN)', area: 'cert', ir: { a: 'certificacao', t: 'ceDocumentos' } },
  'cert-rev':   { nome: 'Certificação › Revisão de documentos', area: 'cert', ir: { a: 'certificacao', t: 'ceDocumentos' } },
  'cert-ev':    { nome: 'Certificação › Calendário', area: 'cert', ir: { a: 'certificacao', t: 'ceCalendario' } },
  'cert-forn':  { nome: 'Certificação › Fornecedores', area: 'cert', ir: { a: 'certificacao', t: 'foPainel' } },
  'cert-cad':   { nome: 'Certificação › Caderno de campo', area: 'cert', ir: { a: 'certificacao', t: 'ccPainel' } },
  'cert-melh':  { nome: 'Certificação › NC, melhorias e feedbacks', area: 'cert', ir: { a: 'certificacao', t: 'mcPainel' } },
  'proj':       { nome: 'Projetos (PMBOK)', area: 'proj', ir: { a: 'projetos' } },
  'rh-sd':      { nome: 'RH › Salário digno', area: 'rh', ir: { a: 'pessoas', t: 'sdPlanos' } },
  'rh-reaj':    { nome: 'RH › Reajuste anual', area: 'rh', ir: { a: 'pessoas', t: 'rhReajuste' } },
  'rh-prop':    { nome: 'RH › Propostas (início)', area: 'rh', ir: { a: 'pessoas', t: 'rhProposta' } },
  'reuniao':    { nome: 'Reunião semanal › Atividades do escritório', area: 'esc', ir: { a: 'pessoas', t: 'reuSemana' } },
  'prog-ativ':  { nome: 'Programação Campo › Atividades', area: 'prog', ir: { a: 'programacao', x: 'acao=atividades' } },
  'prog-reu':   { nome: 'Programação Campo › Reunião', area: 'prog', ir: { a: 'programacao' } },
  'est-pend':   { nome: 'Estoque › Saídas pendentes', area: 'est', ir: { a: 'estoque' } },
  'colh-pag':   { nome: 'Colheita › Pagamento de cargas', area: 'colh', ir: { a: 'colheita', t: 'cpCargas' } },
  'compras':    { nome: 'Compras › Pedidos de compra', area: 'cmp', ir: { a: 'compras' } },
};

/* Situações (07/11/2026, pedido dele para a reunião matinal de 15 minutos):
   A fazer → Em andamento → Concluído, mais Bloqueado quando a tarefa depende
   de algo. Bloqueado guarda "depende de", quem precisa agir (alguém do
   escritório ou ninguém = fora da equipe), quando cobrar de novo e desde
   quando está parado — em cron_tarefas (tarefa simples) ou cron_estado
   (automático e repetição), colunas bloq_*. Os valores no banco continuam
   afazer / fazendo / bloqueado / feito. */
const SIT = { afazer: 'A fazer', fazendo: 'Em andamento', bloqueado: 'Bloqueado', feito: 'Concluído' };
const COR_SIT = { atraso: '#B42318', afazer: '#888780', fazendo: '#2F6FB0', bloqueado: '#BA7517', feito: '#5E8A00' };
const sitCor = it => it.sit === 'afazer' && atrasado(it) ? 'atraso' : it.sit;

/* ---------------- dados ---------------- */
const dados = {
  pessoas: [], tarefas: [], estados: [], config: [], auto: [], numeros: {},
  adm: { itens: [], lanc: [] }, hor: [], out: { itens: [], rec: [] },
  em: null, carregando: false, falhas: [],
};
(() => { const c = ler(CACHE, null); if (c) Object.assign(dados, c, { carregando: false }); })();
const salvarCache = () => gravarLocal(CACHE, {
  pessoas: dados.pessoas, tarefas: dados.tarefas, estados: dados.estados,
  config: dados.config, auto: dados.auto, numeros: dados.numeros, adm: dados.adm, hor: dados.hor, out: dados.out, em: dados.em,
});
/* Custo Base › Adm mensais (09/11/2026, pedido dele): a tarefa mensal
   "Adm - mensais" (ir = 'admMes') tem o checklist montado do cadastro do
   Custo Base (cb_adm_itens) e marcado pelo "Lançado" do mês (cb_adm_lanc).
   Quem não tem o Custo Base liberado não recebe as linhas (RLS) e vê o
   checklist guardado na tarefa. */
async function lerAdm(c) {
  const de = (() => { const d = new Date(); d.setMonth(d.getMonth() - 7); return iso(d).slice(0, 7); })();
  const [it, la] = await Promise.all([
    c.from('cb_adm_itens').select('id,nome,grupo,ordem,ativo,periodicidade,mes_anual,valor_padrao').eq('ativo', true),
    c.from('cb_adm_lanc').select('id,mes,item_id,valor,lancado').gte('mes', de).limit(5000),
  ].map(q => q.then(x => x, e => ({ error: e }))));
  if (!it.error && !la.error) dados.adm = { itens: it.data || [], lanc: la.data || [] };
  // Conferência de horímetros (09/11/2026): resumo de cada mês
  const hz = await c.from('cb_hor_conf').select('id,diferencas,corrigidas').then(x => x, e => ({ error: e }));
  if (!hz.error) dados.hor = hz.data || [];
  // Outorga e Irrigação (12/11/2026): itens do recolhimento e o que já chegou
  const de2 = (() => { const d = new Date(); d.setMonth(d.getMonth() - 4); return iso(d).slice(0, 7); })();
  const [oi, orc] = await Promise.all([
    c.from('out_itens').select('id,nome,tipo,ordem,ativo').eq('ativo', true),
    c.from('out_recebidos').select('id,mes,item_id,recebido').gte('mes', de2).limit(5000),
  ].map(q => q.then(x => x, e => ({ error: e }))));
  if (!oi.error && !orc.error) dados.out = { itens: oi.data || [], rec: orc.data || [] };
}
/* Outorga e Irrigação › Recolhimento (12/11/2026, pedido dele): a tarefa
   mensal "Recolhimento" (ir = 'outRec', Vinícius, Semana 1) tem o checklist
   montado dos itens da área (out_itens), marcado pelo "Recebido" das fichas
   do mês anterior (a de 01/11 recolhe as fichas de outubro). Os itens que a
   tarefa guarda (ex.: enviar o relatório do que falta) continuam embaixo. */
const OUT_IR = 'outRec';
function ckOut(mes, t, e) {
  const its = (dados.out?.itens || []).slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
  if (!its.length) return null;
  const grupos = [['outorga', 'Outorga'], ['irrigacao', 'Irrigação']]
    .map(([k, g]) => ({ g, i: its.filter(i => i.tipo === k).map(i => ({ t: i.nome, ir: OUT_IR, id: i.id, out: true })) }))
    .filter(g => g.i.length);
  const proprios = (Array.isArray(t.checklist) ? t.checklist : []).filter(g => (g.i || []).length);
  const ok = new Set((dados.out.rec || []).filter(r => r.mes === mes && r.recebido).map(r => r.item_id));
  const chavesProprias = new Set(proprios.flatMap(g => g.i.map(x => `${g.g}|${txtCk(x)}`)));
  const checks = [...grupos.flatMap(gr => gr.i.filter(x => ok.has(x.id)).map(x => `${gr.g}|${x.t}`)),
    ...((e?.checks) || []).filter(k => chavesProprias.has(k))];
  return { checklist: [...grupos, ...proprios], checks };
}
async function gravarOut(mes, itemId, sim) {
  const id = mes + ':' + itemId;
  const r = (dados.out.rec || []).find(x => x.id === id);
  const reg = { id, mes, item_id: itemId, recebido: !!sim, recebido_em: sim ? new Date().toISOString() : null,
    recebido_por: sim ? (acesso.nome || acesso.email || null) : null };
  if (r) Object.assign(r, reg); else dados.out.rec.push(reg);
  salvarCache();
  if (!estado.cliente || !navigator.onLine) return;
  const { error } = await estado.cliente.from('out_recebidos').upsert(reg, { onConflict: 'id' }).then(x => x, e => ({ error: e }));
  if (error) console.warn('[Rastro] não marquei na Outorga', error);
}
/* Tarefa "Conferência de horímetros" (dia 10, ir = 'hzConf'): a do dia 10 de
   novembro confere o mês anterior (outubro). Com PDF importado → Em andamento;
   sem diferença pendente → Concluída. */
const HZ_IR = 'hzConf';
const mesAntes = d => { const [a, m] = d.split('-').map(Number); const x = new Date(a, m - 2, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const ADM_IR = 'admMes';
function ckAdm(mes) {
  const its = (dados.adm?.itens || []).filter(i => i.periodicidade !== 'anual' || Number(mes.slice(5, 7)) === Number(i.mes_anual || 1))
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  if (!its.length) return null;
  const g = new Map();
  for (const i of its) { const k = i.grupo || 'Outros'; if (!g.has(k)) g.set(k, []); g.get(k).push({ t: i.nome, ir: ADM_IR, id: i.id }); }
  const checklist = [...g.entries()].map(([gg, i]) => ({ g: gg, i }));
  const ok = new Set((dados.adm.lanc || []).filter(l => l.mes === mes && l.lancado).map(l => l.item_id));
  const checks = checklist.flatMap(gr => gr.i.filter(x => ok.has(x.id)).map(x => `${gr.g}|${x.t}`));
  return { checklist, checks };
}
async function gravarAdm(mes, itemId, lancado) {
  const i = (dados.adm?.itens || []).find(x => x.id === itemId);
  if (!i) return;
  const id = mes + ':' + itemId;
  const l = (dados.adm.lanc || []).find(x => x.id === id);
  const reg = { id, mes, item_id: itemId, valor: l?.valor ?? (lancado ? (i.valor_padrao ?? null) : null), lancado,
    lancado_em: lancado ? new Date().toISOString() : null, lancado_por: lancado ? (acesso.nome || acesso.email || null) : null };
  if (l) Object.assign(l, reg); else dados.adm.lanc.push(reg);
  salvarCache();
  if (!estado.cliente || !navigator.onLine) return;
  const { error } = await estado.cliente.from('cb_adm_lanc').upsert(reg, { onConflict: 'id' }).then(x => x, e => ({ error: e }));
  if (error) console.warn('[Rastro] não marquei no Custo Base', error);
}

const pessoasAtivas = () => dados.pessoas.filter(p => p.ativo !== false)
  .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome, 'pt-BR'));
const pessoa = id => dados.pessoas.find(p => p.id === id) || null;
const iniciais = p => {
  if (!p) return '—';
  const partes = limpo(p.nome).split(/\s+/);
  return (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)).toUpperCase();
};
/* Nome escrito na origem → pessoa do escritório (primeiro nome, sem acento). */
function pessoaPorTexto(txt) {
  const t = norm(txt);
  if (!t) return null;
  const prim = t.split(/[\s,;/]+/)[0];
  return pessoasAtivas().find(p => {
    const n = norm(p.nome);
    return n === t || n.split(/\s+/)[0] === prim;
  }) || null;
}
const eu = () => pessoaPorTexto(acesso.nome || '');
const responsaveisPadrao = () => dados.config.find(c => c.chave === 'responsaveis')?.valor || {};
/* Responsáveis da área (e da unidade, quando a área se divide por unidade). */
const respAreaCfg = () => dados.config.find(c => c.chave === 'responsaveis_area')?.valor || RESP_AREA_PADRAO;
function respsDaArea(area, unid) {
  const cfg = respAreaCfg();
  const ids = (unid && cfg[`${area}@${unid}`]) || cfg[area]
    || (cfg[`${area}@Matriz`] || cfg[`${area}@Quebra Cocão`]
      ? [...new Set([...(cfg[`${area}@Matriz`] || []), ...(cfg[`${area}@Quebra Cocão`] || [])])] : []);
  return ids.filter(id => pessoa(id) && pessoa(id).ativo !== false);
}
const nomesDe = ids => ids.map(id => pessoa(id)?.nome).filter(Boolean).join(' e ');
const estadoDe = chave => dados.estados.find(e => e.chave === chave) || null;

/* ---------------- fontes automáticas ---------------- */
const cli = () => estado.cliente;
const nomeFunc = id => estado.funcionarios.find(f => f.id === id)?.nome || '';
/* Unidade (DP) do funcionário: Quebra Cocão ou Matriz, pela fazenda do cadastro. */
const unidFunc = id => unidadeDeTexto(estado.funcionarios.find(f => f.id === id)?.fazenda || '') || 'Matriz';
const funcAtivo = id => {
  const f = estado.funcionarios.find(x => x.id === id);
  return !!f && !/inativ|deslig/i.test(f.situacao || '');
};
const resolvido = s => /conclu|resolv|cancel|encerr|fechad|finaliz|realizad|^feit/i.test(String(s || ''));
const pegar = async q => { const { data, error } = await q; if (error) throw error; return data || []; };

/* Exames e treinamentos: último lançamento de cada funcionário + tipo, agrupado
   por tipo e data de vencimento (3 ASOs no mesmo dia = 1 card com 3 nomes). */
async function deVencimentos(tabela, tabelaTipos, origem, rotulo) {
  const [lanc, tipos] = await Promise.all([
    pegar(cli().from(tabela).select('funcionario_id,tipo_id,realizado,vence')),
    pegar(cli().from(tabelaTipos).select('id,nome')),
  ]);
  const ultimo = new Map();
  for (const l of lanc) {
    const k = l.funcionario_id + '|' + l.tipo_id;
    const u = ultimo.get(k);
    if (!u || (l.realizado || '') > (u.realizado || '')) ultimo.set(k, l);
  }
  const grupos = new Map();
  for (const l of ultimo.values()) {
    if (!l.vence || !naJanela(l.vence) || !funcAtivo(l.funcionario_id)) continue;
    const k = l.tipo_id + '|' + l.vence;
    if (!grupos.has(k)) grupos.set(k, { tipo: l.tipo_id, vence: l.vence, nomes: [] });
    grupos.get(k).nomes.push(nomeFunc(l.funcionario_id));
  }
  const nomeTipo = id => tipos.find(t => t.id === id)?.nome || rotulo;
  return [...grupos.values()].map(g => ({
    chave: `${origem}:${g.tipo}:${g.vence}`, origem, data: g.vence,
    titulo: g.nomes.length > 1 ? `${nomeTipo(g.tipo)} vence — ${g.nomes.length} funcionários` : `${nomeTipo(g.tipo)} vence — ${g.nomes[0]}`,
    detalhes: g.nomes.sort((a, b) => a.localeCompare(b, 'pt-BR')),
  }));
}

/* Unidade do equipamento (Matriz / Quebra Cocão) pelo local do cadastro. */
async function unidadeEquip(eq) {
  let locais = [];
  try { locais = await pegar(cli().schema('manutencao').from('locais').select('id,nome')); } catch {}
  return id => {
    const e = eq.find(x => x.id === id);
    const l = e && locais.find(x => x.id === e.local_id);
    return l ? unidadeDeTexto(l.nome) : null;
  };
}

const FONTES = [
  ['sst-exames', () => deVencimentos('sst_exames', 'sst_tipos_exame', 'sst-exames', 'Exame')],
  ['sst-trein', () => deVencimentos('sst_treinamentos', 'sst_tipos_treinamento', 'sst-trein', 'Treinamento')],
  /* Troca de EPI (28/10/2026): próxima troca de cada tipo + para quem, do
     Cronograma de troca (SST › EPI's). Lê o cadastro local — vale offline. */
  ['sst-epi', async () => linhasCronograma(estado.epis, estado.epiEntregas)
    .filter(l => l.proxima && naJanela(l.proxima))
    .map(l => ({ chave: `sst-epi:${l.chave}:${l.proxima}`, origem: 'sst-epi', data: l.proxima,
      titulo: `Trocar ${l.tipo.nome}${l.para ? ' — ' + l.para : ''} (entregue ${l.ultima.split('-').reverse().join('/')}, ${textoFreq(l.tipo.qtd, l.tipo.unidade)})` }))],
  ['sst-ca', async () => (await pegar(cli().from('epis').select('id,descricao,ca,ca_validade,ativo')))
    .filter(e => e.ativo !== false && naJanela(e.ca_validade))
    .map(e => ({ chave: `sst-ca:${e.id}:${e.ca_validade}`, origem: 'sst-ca', data: e.ca_validade,
      titulo: `C.A ${e.ca || ''} vence — ${e.descricao}` }))],
  ['sst-acid', async () => (await pegar(cli().from('sst_acidentes').select('id,funcionario_id,data,medidas,medidas_responsavel,medidas_prazo,situacao')))
    .filter(a => naJanela(a.medidas_prazo) && !resolvido(a.situacao))
    .map(a => ({ chave: `sst-acid:${a.id}:${a.medidas_prazo}`, origem: 'sst-acid', data: a.medidas_prazo,
      titulo: `Medidas do acidente de ${br(a.data)} — ${nomeFunc(a.funcionario_id) || 'funcionário'}`,
      texto: a.medidas, respTexto: a.medidas_responsavel }))
    .concat((await pegar(cli().from('sst_acidentes').select('id,funcionario_id,data,retorno_previsto,retorno_em')))
      .filter(a => !a.retorno_em && naJanela(a.retorno_previsto))
      .map(a => ({ chave: `sst-acid:r:${a.id}:${a.retorno_previsto}`, origem: 'sst-acid', data: a.retorno_previsto,
        titulo: `Retorno previsto após acidente — ${nomeFunc(a.funcionario_id) || 'funcionário'}`, texto: `Acidente de ${br(a.data)}` })))],
  ['dp-tarefas', async () => (await pegar(cli().from('jor_tarefas').select('chave,funcionario_id,evento,titulo,prazo,situacao')))
    .filter(t => t.prazo && naJanela(t.prazo) && !resolvido(t.situacao) && t.situacao !== 'dispensada')
    .map(t => ({ chave: `dp-tarefas:${t.chave}:${t.prazo}`, origem: 'dp-tarefas', data: t.prazo,
      titulo: `${t.titulo} — ${nomeFunc(t.funcionario_id) || 'funcionário'}`, unid: unidFunc(t.funcionario_id),
      texto: t.evento ? `Tarefa de ${t.evento}` : '' }))],
  /* 09/11/2026: empréstimo acima do teto esperando o administrador — sai
     sozinho quando é liberado ou recusado. */
  ['dp-emp', async () => {
    if (!acesso.admin && !podeTela('empRecibos')) return [];
    const { emprestimosAguardando } = await import('./alerta-emprestimo.js');
    return (await emprestimosAguardando()).map(e => ({
      chave: `dp-emp:${e.id}`, origem: 'dp-emp', data: (e.data || hoje()).slice(0, 10), unid: unidFunc(e.funcionario_id),
      titulo: `Liberar ou recusar empréstimo acima do teto — ${nomeFunc(e.funcionario_id) || 'funcionário'}`,
      texto: `${Number(e.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em ${e.parcelas || 1}× · lançado por ${e.criado_por || '—'}` }));
  }],
  ['dp-ferias', async () => {
    const { podeTela } = await import('./acesso.js');
    if (!podeTela('ferPainel')) return [];
    const jd = await import('./jornada-dados.js');
    const fer = await import('./jornada-ferias.js');
    if (!jd.dados.vinculos?.length) await jd.carregar();
    await jd.carregarApoioFerias();
    return fer.concessao().abertas
      .filter(x => naJanela(x.p.limite))
      .map(x => ({ chave: `dp-ferias:${x.f.id}:${x.p.limite}`, origem: 'dp-ferias', data: x.p.limite,
        titulo: `Prazo para conceder férias — ${x.f.nome}`, unid: unidFunc(x.f.id),
        texto: `Período aquisitivo ${br(x.p.iniAq)} a ${br(x.p.fimAq)} · saldo de ${x.p.saldo} dias` }));
  }],
  ['maq-os', async () => {
    const sc = cli().schema('manutencao');
    const [os, eq] = await Promise.all([
      pegar(sc.from('ordens_servico').select('id,numero,equipamento_id,prazo,status,descricao,tipo')),
      pegar(sc.from('equipamentos').select('id,codigo,descricao,apelido,local_id')),
    ]);
    const unidEq = await unidadeEquip(eq);
    const nomeEq = id => { const e = eq.find(x => x.id === id); return e ? [e.codigo, e.apelido || e.descricao].filter(Boolean).join(' · ') : ''; };
    return os.filter(o => ['ABERTA', 'EM_EXECUCAO'].includes(o.status) && naJanela(o.prazo))
      .map(o => ({ chave: `maq-os:${o.id}:${o.prazo}`, origem: 'maq-os', data: o.prazo,
        titulo: `OS ${o.numero || ''} — ${nomeEq(o.equipamento_id) || 'equipamento'}`, unid: unidEq(o.equipamento_id),
        texto: [o.status === 'EM_EXECUCAO' ? 'Em execução' : 'Aberta', o.descricao].filter(Boolean).join(' · ') }));
  }],
  ['maq-ck', async () => {
    const sc = cli().schema('manutencao');
    const [ck, eq] = await Promise.all([
      pegar(sc.from('checklists').select('equipamento_id,data_verificacao,proximo_vencimento')),
      pegar(sc.from('equipamentos').select('id,codigo,descricao,apelido,ativo,local_id')),
    ]);
    const unidEq = await unidadeEquip(eq);
    const ult = new Map();
    for (const c of ck) {
      const u = ult.get(c.equipamento_id);
      if (!u || (c.data_verificacao || '') > (u.data_verificacao || '')) ult.set(c.equipamento_id, c);
    }
    return [...ult.values()].filter(c => naJanela(c.proximo_vencimento)).map(c => {
      const e = eq.find(x => x.id === c.equipamento_id);
      if (e && e.ativo === false) return null;
      return { chave: `maq-ck:${c.equipamento_id}:${c.proximo_vencimento}`, origem: 'maq-ck', data: c.proximo_vencimento, unid: unidEq(c.equipamento_id),
        titulo: `Check list — ${e ? [e.codigo, e.apelido || e.descricao].filter(Boolean).join(' · ') : 'equipamento'}` };
    }).filter(Boolean);
  }],
  ['vist-ext', async () => {
    const ex = await pegar(cli().schema('vistorias').from('extintores').select('id,codigo,local,unidade,recarga_validade,teste_validade,ativo'));
    const out = [];
    for (const e of ex.filter(x => x.ativo !== false)) {
      const onde = [e.codigo, e.local || e.unidade].filter(Boolean).join(' · ');
      if (naJanela(e.recarga_validade)) out.push({ chave: `vist-ext:${e.id}:r:${e.recarga_validade}`, origem: 'vist-ext',
        data: e.recarga_validade, titulo: `Recarga do extintor — ${onde}` });
      if (naJanela(e.teste_validade)) out.push({ chave: `vist-ext:${e.id}:t:${e.teste_validade}`, origem: 'vist-ext',
        data: e.teste_validade, titulo: `Teste hidrostático do extintor — ${onde}` });
    }
    return out;
  }],
  ['vist-pend', async () => (await pegar(cli().schema('vistorias').from('pendencias')
      .select('id,titulo,local,unidade,status,prazo_data,responsavel,designado_nome,acao')))
    .filter(p => !resolvido(p.status) && naJanela(p.prazo_data))
    .map(p => ({ chave: `vist-pend:${p.id}:${p.prazo_data}`, origem: 'vist-pend', data: p.prazo_data,
      titulo: `Anomalia: ${p.titulo || 'sem título'}${p.local || p.unidade ? ' — ' + (p.local || p.unidade) : ''}`,
      texto: p.acao, respTexto: p.designado_nome || p.responsavel }))],
  ['cert-req', async () => (await pegar(cli().from('cert_requisitos').select('id,titulo,status,responsavel,prazo')))
    .filter(r => naJanela(r.prazo) && !/conforme|n[aã]o se aplica/i.test(r.status || ''))
    .map(r => ({ chave: `cert-req:${r.id}:${r.prazo}`, origem: 'cert-req', data: r.prazo,
      titulo: `Requisito: ${r.titulo}`, respTexto: r.responsavel }))],
  ['cert-aud', async () => {
    const cs = await pegar(cli().from('cert_certificacoes').select('id,nome,ativa,validade,proxima_auditoria'));
    const out = [];
    for (const c of cs.filter(x => x.ativa !== false)) {
      if (naJanela(c.proxima_auditoria)) out.push({ chave: `cert-aud:${c.id}:a:${c.proxima_auditoria}`, origem: 'cert-aud',
        data: c.proxima_auditoria, titulo: `Auditoria — ${c.nome}` });
      if (naJanela(c.validade)) out.push({ chave: `cert-aud:${c.id}:v:${c.validade}`, origem: 'cert-aud',
        data: c.validade, titulo: `Certificado vence — ${c.nome}` });
    }
    return out;
  }],
  ['cert-acoes', async () => (await pegar(cli().from('cmc_acoes').select('id,oque,quem,quando,status')))
    .filter(a => naJanela(a.quando) && !resolvido(a.status))
    .map(a => ({ chave: `cert-acoes:${a.id}:${a.quando}`, origem: 'cert-acoes', data: a.quando,
      titulo: `Ação de melhoria: ${a.oque || ''}`, respTexto: a.quem }))],
  /* Documentos por fazenda (AN), 29/10/2026: vencimento de cada item (validade
     informada ou última data + periodicidade). AN 55 (devolução de embalagens):
     próxima devolução programada e, se a devolução já foi feita, o prazo de 7 dias
     para os documentos carimbados voltarem. Mesmo AN + mesma data = um card só. */
  ['cert-docs', async () => {
    const [its, docs, faz] = await Promise.all([
      pegar(cli().from('cert_doc_itens').select('id,documento_id,fazenda_id,local,periodicidade,ultima_data,validade,aguardando_data').eq('ativo', true)),
      pegar(cli().from('cert_documentos').select('id,codigo,nome,periodicidade')),
      pegar(cli().from('jor_fazendas').select('id,nome')).catch(() => []),
    ]);
    const MESES = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada 2 anos': 24, 'A cada 3 anos': 36 };
    const somaMeses = (s, m) => { const [a, mm, d] = s.split('-').map(Number); const ult = new Date(a, mm - 1 + m + 1, 0).getDate();
      const x = new Date(a, mm - 1 + m, Math.min(d, ult)); return iso(x); };
    const ondeDe = i => [faz.find(f => f.id === i.fazenda_id)?.nome, i.local].filter(Boolean).join(' · ') || 'Geral';
    const grupos = new Map();
    const junta = (d, tipo, data, titulo, onde) => {
      if (!naJanela(data)) return;
      const k = `${d.id}:${tipo}:${data}`;
      if (!grupos.has(k)) grupos.set(k, { k, data, titulo, onde: [] });
      grupos.get(k).onde.push(onde);
    };
    for (const i of its) {
      const d = docs.find(x => x.id === i.documento_id);
      if (!d) continue;
      const cod = d.codigo ? d.codigo + ' — ' : '';
      if (/devolu[cç][aã]o de embalage/i.test(d.nome || '')) {
        if (i.validade) junta(d, 'dev', i.validade, `${cod}Devolução de embalagens programada`, ondeDe(i));
        if (i.aguardando_data) junta(d, 'doc', addDias(i.aguardando_data, 7),
          `${cod}Receber documentos carimbados da devolução de ${br(i.aguardando_data)}`, ondeDe(i));
        continue;
      }
      const m = MESES[i.periodicidade || d.periodicidade];
      const v = i.validade || (m && i.ultima_data ? somaMeses(i.ultima_data, m) : null);
      if (v) junta(d, 'v', v, `${cod}${d.nome} vence`, ondeDe(i));
    }
    return [...grupos.values()].map(g => ({
      chave: `cert-docs:${g.k}`, origem: 'cert-docs', data: g.data,
      titulo: g.onde.length > 1 ? `${g.titulo} — ${g.onde.length} locais` : `${g.titulo} — ${g.onde[0]}`,
      detalhes: g.onde.sort((a, b) => a.localeCompare(b, 'pt-BR')), detRot: ['local', 'locais'],
    }));
  }],
  /* ---- 29/10/2026, pedido dele: "tudo que tiver data no app, entrar no
     cronograma". Prazos, vencimentos e programações de todas as áreas.
     Datas que só registram algo que já aconteceu não entram; as datas que
     só informam (feriado, aniversário, início de férias) entram já como
     feitas quando passam, para não encher o "Atrasado". ---- */
  ['sst-camp', async () => {
    const [cs, at] = await Promise.all([
      pegar(cli().from('sst_campanhas').select('id,nome,inicio,fim,situacao,responsavel')),
      pegar(cli().from('sst_campanha_atividades').select('id,campanha_id,data,hora,tipo,titulo,local,situacao')),
    ]);
    const out = [];
    for (const c of cs) {
      if (/cancel/i.test(c.situacao || '')) continue;
      if (naJanela(c.inicio)) out.push({ chave: `sst-camp:c:${c.id}:${c.inicio}`, origem: 'sst-camp', data: c.inicio,
        titulo: `Início da campanha: ${c.nome}`, respTexto: c.responsavel, feitoNaOrigem: c.inicio < hoje(),
        texto: c.fim ? `De ${br(c.inicio)} a ${br(c.fim)}` : '' });
    }
    for (const a of at) {
      if (!naJanela(a.data) || /cancel/i.test(a.situacao || '')) continue;
      const c = cs.find(x => x.id === a.campanha_id);
      if (c && /cancel/i.test(c.situacao || '')) continue;
      out.push({ chave: `sst-camp:a:${a.id}:${a.data}`, origem: 'sst-camp', data: a.data,
        titulo: `${a.titulo || a.tipo || 'Atividade'}${c ? ' — ' + c.nome : ''}`, respTexto: c?.responsavel,
        texto: [a.hora, a.local].filter(Boolean).join(' · '), feitoNaOrigem: resolvido(a.situacao) });
    }
    return out;
  }],
  ['cad-aniv', async () => {
    const out = [], ini = addDias(hoje(), -JANELA_ATRAS), fim = addDias(hoje(), JANELA_FRENTE);
    const grupos = new Map();
    for (const f of estado.funcionarios) {
      if (!f.nascimento || /inativ|deslig/i.test(f.situacao || '')) continue;
      const md = f.nascimento.slice(5);
      for (const ano of [+ini.slice(0, 4), +fim.slice(0, 4)]) {
        const d = md === '02-29' ? `${ano}-02-28` : `${ano}-${md}`;
        if (d < ini || d > fim) continue;
        if (!grupos.has(d)) grupos.set(d, []);
        if (!grupos.get(d).includes(f.nome)) grupos.get(d).push(f.nome);
      }
    }
    for (const [d, nomes] of grupos) out.push({ chave: `cad-aniv:${d}`, origem: 'cad-aniv', data: d,
      titulo: nomes.length > 1 ? `Aniversário — ${nomes.length} funcionários` : `Aniversário — ${nomes[0]}`,
      detalhes: nomes.sort((a, b) => a.localeCompare(b, 'pt-BR')), feitoNaOrigem: d < hoje() });
    return out;
  }],
  ['dp-gozo', async () => (await pegar(cli().from('jor_ferias_gozos').select('id,funcionario_id,data_ini,data_fim,dias,situacao')))
    .filter(g => naJanela(g.data_ini) && !/cancel/i.test(g.situacao || ''))
    .map(g => ({ chave: `dp-gozo:${g.id}:${g.data_ini}`, origem: 'dp-gozo', data: g.data_ini,
      titulo: `Férias — ${nomeFunc(g.funcionario_id) || 'funcionário'}`, unid: unidFunc(g.funcionario_id),
      texto: `De ${br(g.data_ini)} a ${br(g.data_fim)}${g.dias ? ` · ${g.dias} dias` : ''}`, feitoNaOrigem: g.data_ini < hoje() }))],
  ['dp-afast', async () => (await pegar(cli().from('jor_afastamentos').select('id,funcionario_id,tipo,data_ini,fim_previsto,fim_real,situacao')))
    .filter(a => !a.fim_real && naJanela(a.fim_previsto) && !/cancel/i.test(a.situacao || ''))
    .map(a => ({ chave: `dp-afast:${a.id}:${a.fim_previsto}`, origem: 'dp-afast', data: a.fim_previsto,
      titulo: `Retorno previsto do afastamento — ${nomeFunc(a.funcionario_id) || 'funcionário'}`, unid: unidFunc(a.funcionario_id),
      texto: [a.tipo, a.data_ini ? 'desde ' + br(a.data_ini) : ''].filter(Boolean).join(' · ') }))],
  ['dp-feriado', async () => {
    const fs = (await pegar(cli().from('jor_feriados').select('id,data,nome,abrangencia,municipio,ativo')))
      .filter(f => f.ativo !== false && naJanela(f.data));
    const g = new Map();
    for (const f of fs) {
      const k = f.data + '|' + norm(f.nome);
      if (!g.has(k)) g.set(k, { ...f, onde: new Set() });
      g.get(k).onde.add(f.abrangencia === 'municipal' ? (f.municipio || 'municipal') : (f.abrangencia || ''));
    }
    return [...g.values()].map(f => ({ chave: `dp-feriado:${f.data}:${norm(f.nome)}`, origem: 'dp-feriado', data: f.data,
      titulo: `Feriado: ${f.nome}`, texto: [...f.onde].filter(Boolean).join(', '), feitoNaOrigem: f.data < hoje() }));
  }],
  ['maq-gar', async () => (await pegar(cli().schema('manutencao').from('equipamentos').select('id,codigo,descricao,apelido,ativo,garantia_fim,local_id')))
    .filter(e => e.ativo !== false && naJanela(e.garantia_fim))
    .map(e => ({ chave: `maq-gar:${e.id}:${e.garantia_fim}`, origem: 'maq-gar', data: e.garantia_fim,
      titulo: `Garantia termina — ${[e.codigo, e.apelido || e.descricao].filter(Boolean).join(' · ')}` }))],
  ['cert-ev', async () => {
    const PASSO = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };
    const ini = addDias(hoje(), -JANELA_ATRAS), fim = addDias(hoje(), JANELA_FRENTE);
    const out = [];
    for (const ev of await pegar(cli().from('cert_eventos').select('id,data,data_fim,tipo,titulo,responsavel,repetir,feitos'))) {
      const passo = PASSO[ev.repetir];
      const datas = [];
      if (!passo) { if (ev.data >= ini && ev.data <= fim) datas.push(ev.data); }
      else for (let i = 0, d = ev.data; i < 600 && d <= fim; i++, d = addMeses(ev.data, i * passo)) if (d >= ini) datas.push(d);
      for (const d of datas) out.push({ chave: `cert-ev:${ev.id}:${d}`, origem: 'cert-ev', data: d,
        titulo: `${ev.tipo ? ev.tipo + ': ' : ''}${ev.titulo}`, respTexto: ev.responsavel,
        texto: !passo && ev.data_fim && ev.data_fim !== ev.data ? `Até ${br(ev.data_fim)}` : (passo ? `Repete: ${ev.repetir.toLowerCase()}` : ''),
        feitoNaOrigem: (ev.feitos || []).includes(d) });
    }
    return out;
  }],
  ['cert-rev', async () => {
    const MESES_P = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada 2 anos': 24, 'A cada 3 anos': 36 };
    const g = new Map();
    for (const d of await pegar(cli().from('cert_documentos').select('id,codigo,nome,periodicidade,situacao,data_revisao,responsavel'))) {
      const m = MESES_P[d.periodicidade];
      if (!m || !d.data_revisao || d.situacao === 'Obsoleto' || d.situacao === 'Inativo') continue;
      const p = addMeses(d.data_revisao, m);
      if (!naJanela(p)) continue;
      if (!g.has(p)) g.set(p, []);
      g.get(p).push(d);
    }
    return [...g.entries()].map(([p, ds]) => ({ chave: `cert-rev:${p}:${ds.map(d => d.id).sort().join('.')}`, origem: 'cert-rev', data: p,
      titulo: ds.length > 1 ? `Revisão de documentos — ${ds.length} documentos` : `Revisão: ${ds[0].codigo} · ${ds[0].nome}`,
      detalhes: ds.map(d => `${d.codigo} · ${d.nome}`).sort((a, b) => a.localeCompare(b, 'pt-BR')), detRot: ['documento', 'documentos'],
      respTexto: ds.length === 1 ? ds[0].responsavel : null }));
  }],
  ['cert-forn', async () => {
    const PER = { 'Mensal': 1, 'Bimestral': 2, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada entrega': 0 };
    const [fs, av] = await Promise.all([
      pegar(cli().from('cfo_fornecedores').select('id,categoria,nome,periodicidade,cert_validade,ativo')),
      pegar(cli().from('cfo_avaliacoes').select('categoria,fornecedor,data')),
    ]);
    const out = [];
    for (const f of fs.filter(x => x.ativo !== false)) {
      const meses = PER[f.periodicidade] ?? 12;
      const ult = av.filter(a => a.categoria === f.categoria && norm(a.fornecedor) === norm(f.nome))
        .map(a => a.data).sort().pop();
      const prox = meses && ult ? addMeses(ult, meses) : null;
      if (naJanela(prox)) out.push({ chave: `cert-forn:a:${f.id}:${prox}`, origem: 'cert-forn', data: prox,
        titulo: `Avaliar fornecedor — ${f.nome}`, texto: `${f.categoria || ''} · última avaliação ${br(ult)}` });
      if (naJanela(f.cert_validade)) out.push({ chave: `cert-forn:c:${f.id}:${f.cert_validade}`, origem: 'cert-forn', data: f.cert_validade,
        titulo: `Certificado do fornecedor vence — ${f.nome}` });
    }
    return out;
  }],
  ['cert-cad', async () => {
    const [an, ca, rg, pl] = await Promise.all([
      pegar(cli().from('cc_analises').select('id,tipo,ponto,fazenda,vence')),
      pegar(cli().from('cc_calibracoes').select('id,equipamento,proxima,responsavel')),
      pegar(cli().from('cc_registros').select('id,tipo,situacao,dados,responsavel')),
      pegar(cli().from('cc_plantios').select('id,codigo,local,fazenda,cultura,variedade,status,previsao_colheita')),
    ]);
    const ir = t => ({ a: 'certificacao', t });
    const out = [];
    for (const a of an) if (naJanela(a.vence)) out.push({ chave: `cert-cad:an:${a.id}:${a.vence}`, origem: 'cert-cad', data: a.vence,
      titulo: `Análise vence: ${a.tipo} · ${a.ponto}${a.fazenda ? ' — ' + a.fazenda : ''}`, ir: ir('ccAnalises') });
    for (const c of ca) if (naJanela(c.proxima)) out.push({ chave: `cert-cad:ca:${c.id}:${c.proxima}`, origem: 'cert-cad', data: c.proxima,
      titulo: `Calibração: ${c.equipamento}`, respTexto: c.responsavel, ir: ir('ccCalibracoes') });
    for (const r of rg) {
      const pz = r.dados?.prazo;
      if (r.tipo !== 'ocorrencia' || r.situacao === 'Cancelado' || r.dados?.status === 'Encerrada' || !naJanela(pz)) continue;
      out.push({ chave: `cert-cad:nc:${r.id}:${pz}`, origem: 'cert-cad', data: pz,
        titulo: `Ação corretiva: ${r.dados.descricao || ''}`, respTexto: r.dados?.responsavel || r.responsavel, ir: ir('ccRegistros') });
    }
    for (const p of pl) if (p.status === 'Em campo' && naJanela(p.previsao_colheita))
      out.push({ chave: `cert-cad:pl:${p.id}:${p.previsao_colheita}`, origem: 'cert-cad', data: p.previsao_colheita,
        titulo: `Colheita prevista: ${[p.codigo, p.cultura, p.variedade, p.local || p.fazenda].filter(Boolean).join(' · ')}`, ir: ir('ccPlantios') });
    return out;
  }],
  ['cert-melh', async () => {
    const [cs, rg] = await Promise.all([
      pegar(cli().from('cmc_casos').select('id,natureza,tipo,titulo,responsavel,etapa,previsao,reavaliar_em,verif_data,verif_eficaz,data_encerramento')),
      pegar(cli().from('cmc_registros').select('id,status,tipo,descricao,local,previsao,resp_resolucao,data_fechamento')),
    ]);
    const out = [];
    for (const c of cs) {
      if (c.data_encerramento || /encerr|conclu|cancel/i.test(c.etapa || '')) continue;
      const nome = `${c.natureza ? c.natureza + ': ' : ''}${c.titulo || c.tipo || 'caso'}`;
      if (naJanela(c.previsao)) out.push({ chave: `cert-melh:p:${c.id}:${c.previsao}`, origem: 'cert-melh', data: c.previsao,
        titulo: `Previsão — ${nome}`, texto: c.etapa ? 'Etapa: ' + c.etapa.toLowerCase() : '', respTexto: c.responsavel });
      if (naJanela(c.reavaliar_em)) out.push({ chave: `cert-melh:r:${c.id}:${c.reavaliar_em}`, origem: 'cert-melh', data: c.reavaliar_em,
        titulo: `Reavaliar — ${nome}`, respTexto: c.responsavel });
      if (c.verif_eficaz == null && naJanela(c.verif_data)) out.push({ chave: `cert-melh:v:${c.id}:${c.verif_data}`, origem: 'cert-melh', data: c.verif_data,
        titulo: `Verificar eficácia — ${nome}`, respTexto: c.responsavel });
    }
    for (const r of rg) if (!r.data_fechamento && !resolvido(r.status) && naJanela(r.previsao))
      out.push({ chave: `cert-melh:f:${r.id}:${r.previsao}`, origem: 'cert-melh', data: r.previsao,
        titulo: `${r.tipo || 'Registro'}: ${r.descricao || ''}${r.local ? ' — ' + r.local : ''}`, respTexto: r.resp_resolucao });
    return out;
  }],
  ['rh-reaj', async () => (await pegar(cli().from('rh_reajustes').select('id,vigencia,pct,situacao,aplicado_em')))
    .filter(r => !r.aplicado_em && !/aplic|cancel/i.test(r.situacao || '') && naJanela(r.vigencia))
    .map(r => ({ chave: `rh-reaj:${r.id}:${r.vigencia}`, origem: 'rh-reaj', data: r.vigencia,
      titulo: `Reajuste anual vigora${r.pct != null ? ` (${String(r.pct).replace('.', ',')}%)` : ''}` }))],
  ['rh-prop', async () => (await pegar(cli().from('rh_propostas').select('id,tipo,funcionario_id,nome,cargo_nome,data_inicio')))
    .filter(p => naJanela(p.data_inicio))
    .map(p => ({ chave: `rh-prop:${p.id}:${p.data_inicio}`, origem: 'rh-prop', data: p.data_inicio,
      titulo: `Início — ${p.nome || nomeFunc(p.funcionario_id) || 'proposta'}${p.cargo_nome ? ' (' + p.cargo_nome + ')' : ''}`,
      texto: p.tipo ? 'Proposta: ' + p.tipo : '', feitoNaOrigem: p.data_inicio < hoje() }))],
  ['rh-sdrev', async () => (await pegar(cli().from('rh_sd_parametros').select('id,chave,proxima_revisao')))
    .filter(p => naJanela(p.proxima_revisao))
    .map(p => ({ chave: `rh-sdrev:${p.id}:${p.proxima_revisao}`, origem: 'rh-sd', data: p.proxima_revisao,
      titulo: `Salário digno: revisar o parâmetro ${p.chave}`, ir: { a: 'pessoas', t: 'sdConfig' } }))],
  ['prog-ativ', async () => {
    const sc = cli().schema('programacao');
    const [at, tp, lc, op, fz] = await Promise.all([
      pegar(sc.from('atividades').select('id,data,local_id,tipo_id,operador_id,status,concluida_em,plantio,prioridade,ativo')),
      pegar(sc.from('tipos_atividade').select('id,nome')),
      pegar(sc.from('locais').select('id,nome,fazenda_id')),
      pegar(sc.from('operadores').select('id,nome')).catch(() => []),
      pegar(sc.from('fazendas').select('id,nome')).catch(() => []),
    ]);
    const nome = (l, id) => l.find(x => x.id === id)?.nome || '';
    const g = new Map();
    for (const a of at) {
      if (a.ativo === false || a.concluida_em || /conclu|cancel/i.test(a.status || '') || !naJanela(a.data)) continue;
      const loc = lc.find(x => x.id === a.local_id);
      const faz = loc ? nome(fz, loc.fazenda_id) : '';
      const k = a.data + '|' + faz;
      if (!g.has(k)) g.set(k, { data: a.data, faz, l: [] });
      g.get(k).l.push([nome(tp, a.tipo_id) || 'Atividade', loc?.nome, a.plantio, nome(op, a.operador_id), a.prioridade ? 'prioridade ' + a.prioridade.toLowerCase() : ''].filter(Boolean).join(' · '));
    }
    return [...g.values()].map(x => ({ chave: `prog-ativ:${x.data}:${norm(x.faz)}`, origem: 'prog-ativ', data: x.data,
      unid: unidadeDeTexto(x.faz) || undefined,
      titulo: x.l.length > 1 ? `Programação Campo — ${x.l.length} atividades${x.faz ? ' · ' + x.faz : ''}` : `${x.l[0]}${x.faz ? ' — ' + x.faz : ''}`,
      detalhes: x.l.sort((a, b) => a.localeCompare(b, 'pt-BR')), detRot: ['atividade', 'atividades'] }));
  }],
  ['prog-reu', async () => {
    const sc = cli().schema('programacao');
    const [rs, fz] = await Promise.all([
      pegar(sc.from('reunioes').select('id,fazenda_id,data_reuniao,ativo')),
      pegar(sc.from('fazendas').select('id,nome')).catch(() => []),
    ]);
    return rs.filter(r => r.ativo !== false && naJanela(r.data_reuniao)).map(r => {
      const faz = fz.find(f => f.id === r.fazenda_id)?.nome || '';
      return { chave: `prog-reu:${r.id}:${r.data_reuniao}`, origem: 'prog-reu', data: r.data_reuniao,
        titulo: `Reunião da programação${faz ? ' — ' + faz : ''}`, feitoNaOrigem: r.data_reuniao < hoje() };
    });
  }],
  ['est-pend', async () => {
    const [mv, it] = await Promise.all([
      pegar(cli().from('est_movimentos').select('id,item_id,quantidade,tipo,pendente,pendente_desde,data,equipamento,funcionario,ativo').eq('pendente', true)),
      pegar(cli().from('est_itens').select('id,nome,unidade')),
    ]);
    return mv.filter(m => m.ativo !== false).map(m => {
      const i = it.find(x => x.id === m.item_id);
      const d = m.pendente_desde || m.data;
      return { chave: `est-pend:${m.id}`, origem: 'est-pend', data: d, unid: 'Quebra Cocão',
        titulo: `Saída pendente — ${i?.nome || 'item'} (${String(m.quantidade).replace('.', ',')}${i?.unidade ? ' ' + i.unidade : ''})${m.equipamento || m.funcionario ? ' → ' + (m.equipamento || m.funcionario) : ''}` };
    });
  }],
  ['colh-pag', async () => (await pegar(cli().from('cp_cargas').select('id,data,placa,nf,lote,situacao_pagto,data_pagto,ativo')))
    .filter(c => c.ativo !== false && naJanela(c.data_pagto) && !/pago|receb/i.test(c.situacao_pagto || ''))
    .map(c => ({ chave: `colh-pag:${c.id}:${c.data_pagto}`, origem: 'colh-pag', data: c.data_pagto,
      titulo: `Pagamento da carga de ${br(c.data)}${c.nf ? ' · NF ' + c.nf : ''}${c.placa ? ' · ' + c.placa : ''}` }))],
  ['proj', async () => {
    const [pjs, eap, oc] = await Promise.all([
      pegar(cli().from('pj_projetos').select('id,nome,codigo,fim_previsto,situacao,ativo')),
      pegar(cli().from('pj_eap').select('id,projeto_id,nome,responsavel,fim,fim_real,pct,ativo')),
      pegar(cli().from('pj_ocorrencias').select('id,projeto_id,descricao,responsavel,prazo,situacao,resolvida_em,ativo')),
    ]);
    const vivos = new Map(pjs.filter(p => p.ativo !== false && p.situacao === 'ativo').map(p => [p.id, p]));
    const nomeP = id => { const p = vivos.get(id); return p ? (p.codigo ? p.codigo + ' · ' : '') + p.nome : ''; };
    const out = [];
    for (const p of vivos.values()) if (naJanela(p.fim_previsto))
      out.push({ chave: `proj:p:${p.id}:${p.fim_previsto}`, origem: 'proj', data: p.fim_previsto, titulo: `Fim previsto do projeto — ${nomeP(p.id)}` });
    for (const e of eap) if (vivos.has(e.projeto_id) && e.ativo !== false && !e.fim_real && (e.pct ?? 0) < 100 && naJanela(e.fim))
      out.push({ chave: `proj:e:${e.id}:${e.fim}`, origem: 'proj', data: e.fim, titulo: `${e.nome} — ${nomeP(e.projeto_id)}`, respTexto: e.responsavel });
    const [rc, rn] = await Promise.all([
      pegar(cli().from('pj_riscos').select('id,projeto_id,descricao,dono,prazo,situacao,ativo')).catch(() => []),
      pegar(cli().from('pj_reunioes').select('id,projeto_id,data,titulo,ativo')).catch(() => []),
    ]);
    for (const r of rc) if (vivos.has(r.projeto_id) && r.ativo !== false && !resolvido(r.situacao) && !/fechad|ocorreu/i.test(r.situacao || '') && naJanela(r.prazo))
      out.push({ chave: `proj:r:${r.id}:${r.prazo}`, origem: 'proj', data: r.prazo, titulo: `Risco: ${r.descricao || ''} — ${nomeP(r.projeto_id)}`, respTexto: r.dono });
    for (const r of rn) if (vivos.has(r.projeto_id) && r.ativo !== false && naJanela(r.data))
      out.push({ chave: `proj:n:${r.id}:${r.data}`, origem: 'proj', data: r.data, titulo: `Reunião: ${r.titulo || 'do projeto'} — ${nomeP(r.projeto_id)}`, feitoNaOrigem: r.data < hoje() });
    for (const o of oc) if (vivos.has(o.projeto_id) && o.ativo !== false && !o.resolvida_em && !resolvido(o.situacao) && naJanela(o.prazo))
      out.push({ chave: `proj:o:${o.id}:${o.prazo}`, origem: 'proj', data: o.prazo, titulo: `Problema: ${o.descricao || ''} — ${nomeP(o.projeto_id)}`, respTexto: o.responsavel });
    return out;
  }],
  ['rh-sd', async () => (await pegar(cli().from('rh_sd_planos').select('id,descricao,tipo_acao,responsavel,prazo,situacao,concluido_em')))
    .filter(p => naJanela(p.prazo) && !p.concluido_em && !resolvido(p.situacao))
    .map(p => ({ chave: `rh-sd:${p.id}:${p.prazo}`, origem: 'rh-sd', data: p.prazo,
      titulo: `Salário digno: ${p.descricao || p.tipo_acao || 'plano de ação'}`, respTexto: p.responsavel }))],
  /* Compras (10/11/2026): cada pedido em aberto vira tarefa do comprador
     (responsável: "Responsáveis" › Compras). Só para quem é comprador — quem
     só pede acompanha em Compras › Meus pedidos. A chave leva a situação:
     quando o pedido anda, nasce o item da etapa seguinte. Entregue some. */
  ['compras', async () => {
    if (!ehComprador()) return [];
    await carregarCompras();
    const etapa = { solicitado: 'cotar', cotacao: 'fechar a compra', comprado: 'receber' };
    return pedidosAbertos().map(p => {
      const data = (p.situacao === 'comprado' && p.previsao) ? p.previsao : String(p.criado_em).slice(0, 10);
      const u = p.urgencia !== 'normal' ? (URG_CMP[p.urgencia]?.nome || '').toUpperCase() + ': ' : '';
      const qtd = [p.quantidade != null ? String(p.quantidade).replace('.', ',') : '', p.unidade || ''].filter(Boolean).join(' ');
      return { chave: `compras:${p.id}:${p.situacao}`, origem: 'compras', data,
        titulo: `${u}Compra #C-${String(p.numero).padStart(3, '0')} (${etapa[p.situacao]}): ${p.item}${qtd ? ' — ' + qtd : ''}${p.destino ? ' · ' + p.destino : ''}`,
        texto: [p.motivo, p.pedido_por_nome ? 'Pedido por ' + p.pedido_por_nome : ''].filter(Boolean).join('\n') };
    });
  }],
  ['reuniao', async () => {
    const reu = await import('./reuniao.js');
    await reu.carregarReuniao();
    const out = [];
    let s = reu.segundaDe();
    for (let k = 0; k < 5; k++, s = addDias(s, 7)) {
      for (const x of reu.escalaDaSemana(s)) {
        if (!x.pessoa) continue;
        out.push({ chave: `reuniao:${s}:${x.atividade.id}`, origem: 'reuniao', data: s,
          titulo: `${x.atividade.nome}`, texto: 'Atividade do escritório na semana',
          respId: x.pessoa.id, feitoNaOrigem: x.feito });
      }
    }
    return out;
  }],
];

/* ---------------- carregar ---------------- */
let ouvintes = new Set();
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch {} });

export async function carregarCronograma() {
  if (!estado.cliente || !estado.sessao || dados.carregando) return;
  dados.carregando = true; avisar();
  try {
    await enviarFila();
    const c = estado.cliente;
    const [pes, tar, est, cfg] = await Promise.all([
      c.from('reu_pessoas').select('*'),
      c.from('cron_tarefas').select('*').eq('ativo', true),
      c.from('cron_estado').select('*'),
      c.from('cron_config').select('*'),
    ]);
    if (!pes.error) dados.pessoas = pes.data || [];
    if (!tar.error) dados.tarefas = tar.data || [];
    if (!est.error) dados.estados = est.data || [];
    if (!cfg.error) dados.config = cfg.data || [];
    await lerAdm(c);
    dados.semTabelas = !!(tar.error && /does not exist|relation|schema cache/i.test(tar.error.message || ''));

    const rs = await Promise.allSettled(FONTES.map(([, fn]) => fn()));
    const auto = [], falhas = [];
    rs.forEach((r, i) => {
      if (r.status === 'fulfilled') auto.push(...r.value);
      else falhas.push(FONTES[i][0]);
    });
    dados.auto = auto; dados.falhas = falhas;
    dados.em = new Date().toISOString();
    salvarCache();
    // números do banco (os já dados) e os que faltam
    const nums = await c.from('cron_numeros').select('chave,numero').limit(20000).then(x => x, e => ({ error: e }));
    if (!nums.error) { dados.numeros = {}; for (const r of nums.data || []) dados.numeros[r.chave] = Number(r.numero); }
    dados.carregando = false;
    await garantirNumeros();
  } catch (e) {
    console.warn('[Cronograma] não carregou tudo', e);
  } finally {
    dados.carregando = false; avisar();
  }
}

/* ---------------- atualização sozinha (09/11/2026) ----------------
   Bloqueio/conclusão feito por outra pessoa aparecia só depois de tocar em
   "Atualizar". Agora, com o Cronograma aberto, a cada 30 s (e ao voltar para
   a aba) relê só as tarefas, situações e números — leve. A cada 10 min, ou
   ao voltar depois de muito tempo, recarrega tudo (vencimentos das áreas). */
let relendo = false;
async function releituraLeve() {
  if (relendo || dados.carregando || !estado.cliente || !estado.sessao || !navigator.onLine) return;
  relendo = true;
  try {
    await enviarFila();
    const c = estado.cliente;
    const [tar, est2, nums] = await Promise.all([
      c.from('cron_tarefas').select('*').eq('ativo', true),
      c.from('cron_estado').select('*'),
      c.from('cron_numeros').select('chave,numero').limit(20000).then(x => x, e => ({ error: e })),
    ]);
    await lerAdm(c);
    const antes = JSON.stringify([dados.tarefas, dados.estados, dados.numeros]);
    if (!tar.error) dados.tarefas = tar.data || [];
    if (!est2.error) dados.estados = est2.data || [];
    if (nums && !nums.error) { const n = {}; for (const r of nums.data || []) n[r.chave] = Number(r.numero); dados.numeros = n; }
    // não redesenha no meio de um arrasto nem com uma tarefa aberta (fica para a próxima volta)
    const ocupado = alvo?.querySelector('.arrastando') || document.querySelector('dialog[open]');
    if (JSON.stringify([dados.tarefas, dados.estados, dados.numeros]) !== antes) { salvarCache(); if (!ocupado) avisar(); }
    garantirNumeros();
  } catch {} finally { relendo = false; }
}
const visivel = () => alvo && !alvo.closest('[hidden]') && document.visibilityState === 'visible';
const velho = (min) => !dados.em || Date.now() - new Date(dados.em).getTime() > min * 60000;
setInterval(() => { if (visivel()) (velho(10) ? carregarCronograma() : releituraLeve()); }, 30000);
document.addEventListener('visibilitychange', () => { if (visivel()) (velho(10) ? carregarCronograma() : releituraLeve()); });

/* ---------------- número de cada tarefa ----------------
   09/11/2026 (pedido dele): cada tarefa ganha um número fixo (#123), dado
   pelo banco (cron_numeros, função cron_numerar) na ordem da data — o
   mesmo em todos os aparelhos. Serve para falar da tarefa na reunião e
   para achar na pesquisa. Tarefa nova recebe o próximo número. */
let numerando = null, semNumeracao = false;
export function garantirNumeros() {
  if (numerando || semNumeracao || !estado.cliente || !estado.sessao || !navigator.onLine) return numerando;
  const faltam = todosItens().filter(it => !dados.numeros[it.chave])
    .sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, 'pt-BR')).map(it => it.chave);
  if (!faltam.length) return null;
  numerando = (async () => {
    for (let i = 0; i < faltam.length; i += 500) {
      const { data, error } = await estado.cliente.rpc('cron_numerar', { p_chaves: faltam.slice(i, i + 500) }).then(x => x, e => ({ error: e }));
      if (error) { if (/function|does not exist|schema cache/i.test(error.message || '')) semNumeracao = true; break; }
      for (const r of data || []) dados.numeros[r.chave] = Number(r.numero);
    }
    salvarCache(); avisar();
  })().catch(() => {}).finally(() => { numerando = null; });
  return numerando;
}
const numDe = it => dados.numeros[it.chave] || null;
const seloNum = it => numDe(it) ? `<span class="cr-num">#${numDe(it)}</span>` : '';

/* ---------------- fila offline ---------------- */
let filaRodando = null;
export function enviarFila() {
  if (!filaRodando) filaRodando = (async () => {
    const fila = ler(FILA, []);
    if (!fila.length || !estado.cliente || !estado.sessao || !navigator.onLine) return;
    const resto = [];
    for (const p of fila) {
      const r = await estado.cliente.from(p.tabela).upsert(p.item, { onConflict: p.chave })
        .then(x => x, e => ({ error: e }));
      if (r.error && !/permission|policy|violates/i.test(r.error.message || '')) resto.push(p);
    }
    gravarLocal(FILA, [...resto, ...ler(FILA, []).slice(fila.length)]);
  })().finally(() => { filaRodando = null; });
  return filaRodando;
}
export const pendentesCronograma = () => ler(FILA, []).length;
window.addEventListener('online', () => { enviarFila().catch(() => {}); });

async function gravar(tabela, chaveCol, item) {
  item = { ...item, atualizado_em: new Date().toISOString(), atualizado_por: acesso.nome || acesso.email || null };
  cacheAgora = null;
  if (tabela === 'cron_config') delete item.atualizado_por;
  // vale na tela na hora
  const lista = tabela === 'cron_tarefas' ? dados.tarefas : tabela === 'cron_estado' ? dados.estados : dados.config;
  const i = lista.findIndex(x => x[chaveCol] === item[chaveCol]);
  if (i >= 0) lista[i] = { ...lista[i], ...item }; else lista.push(item);
  if (tabela === 'cron_tarefas' && item.ativo === false) dados.tarefas = dados.tarefas.filter(t => t.id !== item.id);
  salvarCache(); avisar();
  if (tabela === 'cron_tarefas') setTimeout(() => garantirNumeros(), 0);
  const enfileirar = () => {
    const f = ler(FILA, []).filter(x => !(x.tabela === tabela && x.item[chaveCol] === item[chaveCol]));
    f.push({ tabela, chave: chaveCol, item }); gravarLocal(FILA, f);
  };
  if (!estado.cliente || !estado.sessao || !navigator.onLine) { enfileirar(); return 'fila'; }
  const { error } = await estado.cliente.from(tabela).upsert(item, { onConflict: chaveCol }).then(x => x, e => ({ error: e }));
  if (error) {
    if (/permission|policy|violates/i.test(error.message || '')) return 'negado';
    enfileirar(); return 'fila';
  }
  return 'ok';
}

/* ---------------- montar a lista de itens ---------------- */
/* Rotina mensal que cai no sábado ou domingo passa para a segunda (07/11/2026:
   "Semana 1" é dia 1, "Semana 2" dia 8…). */
const diaUtil = s => { const w = dataDe(s).getDay(); return w === 6 ? addDias(s, 2) : w === 0 ? addDias(s, 1) : s; };
/* Toda semana com dias marcados (11/11/2026, pedido dele): dias_semana =
   [1,3,5] (0=dom..6=sáb). Vazio = o mesmo dia da semana da data inicial. */
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diasDe = t => (Array.isArray(t?.dias_semana) ? t.dias_semana.map(Number).filter(n => n >= 0 && n <= 6) : []);
const textoDias = t => { const ds = diasDe(t); return ds.length ? [1, 2, 3, 4, 5, 6, 0].filter(n => ds.includes(n)).map(n => DIAS_SEM[n]).join(', ') : ''; };
const seletorDias = (id, marcados) => `<div class="cr-dias" id="${id}" role="group" aria-label="Dias da semana">${[1, 2, 3, 4, 5, 6, 0].map(n =>
  `<label class="cr-dia${marcados.includes(n) ? ' on' : ''}"><input type="checkbox" value="${n}" ${marcados.includes(n) ? 'checked' : ''}>${DIAS_SEM[n]}</label>`).join('')}</div>`;
const lerDias = id => [...document.querySelectorAll(`#${id} input:checked`)].map(x => Number(x.value)).sort();
function ocorrencias(t) {
  const ini = addDias(hoje(), -JANELA_ATRAS), fim = addDias(hoje(), JANELA_FRENTE);
  if (t.recorrencia === 'nenhuma' || !t.recorrencia) return [t.data];
  const out = [];
  const ds = t.recorrencia === 'semanal' ? diasDe(t) : [];
  if (ds.length) {
    let d = t.data > ini ? t.data : ini;
    for (let k = 0; k < 800 && d <= fim && (!t.ate || d <= t.ate); k++, d = addDias(d, 1))
      if (ds.includes(dataDe(d).getDay())) out.push(d);
    return out;
  }
  let d = t.data;
  for (let k = 0; k < 400 && d <= fim && (!t.ate || d <= t.ate); k++) {
    if (d >= ini) out.push(t.recorrencia === 'mensal' ? diaUtil(d) : d);
    d = t.recorrencia === 'semanal' ? addDias(t.data, 7 * (k + 1)) : addMeses(t.data, k + 1);
  }
  return out;
}
/* Tarefa mensal com período (09/11/2026, pedido dele): começa no dia da
   vez (data) e tem prazo até o dia `prazo_dia` do mesmo mês (mês curto: o
   último dia). O item fica com data = prazo e comeca = início. */
function prazoDe(t, d) {
  if (!t.prazo_dia || t.recorrencia !== 'mensal') return null;
  const [a, m] = d.split('-').map(Number);
  const ult = new Date(a, m, 0).getDate();
  const f = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(t.prazo_dia, ult)).padStart(2, '0')}`;
  return f < d ? d : f;
}
/* Rotina que repete: das vezes que já passaram, só a mais recente continua
   aparecendo (as anteriores somem quando chega a próxima), a não ser que
   tenham sido concluídas ou estejam no foco/bloqueadas. Evita a pilha de
   "segunda-feira atrasada" de semanas atrás. */
function vezesVisiveis(t) {
  const ds = ocorrencias(t);
  if (t.recorrencia === 'nenhuma' || !t.recorrencia) return ds;
  const passadas = ds.filter(d => d <= hoje());
  const ultima = passadas[passadas.length - 1];
  return ds.filter(d => {
    if (d > hoje() || d === ultima) return true;
    const e = estadoDe(`t:${t.id}:${d}`);
    return !!e && (e.situacao === 'feito' || e.situacao === 'bloqueado' || !!e.foco_em);
  });
}

function todosItens() {
  const padrao = responsaveisPadrao();
  const itens = [];
  for (const a of dados.auto) {
    const o = ORIGENS[a.origem] || { nome: a.origem, area: 'esc' };
    const e = estadoDe(a.chave);
    const explicito = e?.responsavel_id || VINC_ORIGEM[a.origem] || vincRegra(a) || a.respId || pessoaPorTexto(a.respTexto)?.id || null;
    const resps = explicito ? [explicito] : padrao[a.origem] ? [padrao[a.origem]] : respsDaArea(o.area, a.unid);
    let sit = e?.situacao || (a.feitoNaOrigem ? 'feito' : 'afazer');
    itens.push({ ...a, ir: a.ir || o.ir || null, area: o.area, origemNome: o.nome + (a.unid ? ' · ' + a.unid : ''), auto: true,
      resp: resps[0] || null, resps, explicito, sit, feitaEm: e?.feita_em || null, ...bloqDe(e) });
  }
  for (const t of dados.tarefas) {
    if (t.ativo === false) continue;
    // privada de outra pessoa (sobra de cache num aparelho compartilhado): não mostra
    if (t.privada && String(t.dono_email || '').toLowerCase() !== meuEmail()) continue;
    const rep = t.recorrencia && t.recorrencia !== 'nenhuma';
    for (const d of vezesVisiveis(t)) {
      const chave = rep ? `t:${t.id}:${d}` : `t:${t.id}`;
      const e = rep ? estadoDe(chave) : null;
      const explicito = e?.responsavel_id || VINC_TELA[t.ir] || t.responsavel_id || vincTexto(t.titulo) || null;
      const resps = explicito ? [explicito] : respsDaArea(t.area || 'esc', null);
      const fim = prazoDe(t, d);
      itens.push({
        chave, tarefa: t, data: fim || d, comeca: fim ? d : null, titulo: t.titulo, texto: t.descricao, area: t.area || 'esc',
        ir: t.ir ? (IR_CK[t.ir] || null) : null,
        origemNome: rep ? (t.recorrencia === 'semanal' ? 'Tarefa · toda semana' + (textoDias(t) ? ' (' + textoDias(t) + ')' : '') : 'Tarefa · todo mês') : 'Tarefa',
        auto: false, resp: resps[0] || null, resps, explicito,
        sit: rep ? (e?.situacao || 'afazer') : (t.situacao || 'afazer'),
        feitaEm: rep ? e?.feita_em : t.feita_em,
        ...bloqDe(rep ? e : t),
        checklist: Array.isArray(t.checklist) && t.checklist.length ? t.checklist : null,
        checks: (rep ? e?.checks : t.checks) || [],
        privada: !!t.privada,
      });
      // Adm - mensais: checklist e marcas vêm do Custo Base (lançado do mês)
      if (t.ir === ADM_IR) {
        // sempre os lançamentos do mês anterior (11/11/2026, pedido dele): a de 10/11 confere outubro
        const it = itens[itens.length - 1], mesRef = mesAntes(d), adm = ckAdm(mesRef);
        if (adm) {
          Object.assign(it, adm, { ckDoApp: true, mesAdm: mesRef });
          const tot = adm.checklist.reduce((n, g) => n + g.i.length, 0), f = adm.checks.length;
          if (f === tot && it.sit !== 'feito') { it.sit = 'feito'; it.feitaEm = it.feitaEm || hoje(); }
          else if (f && f < tot && it.sit === 'afazer') it.sit = 'fazendo';
        }
      }
      if (t.ir === OUT_IR) {
        const it = itens[itens.length - 1], mesRef = mesAntes(d), o = ckOut(mesRef, t, rep ? estadoDe(chave) : t);
        if (o) {
          Object.assign(it, o, { ckOut: true, mesOut: mesRef });
          const tot = o.checklist.reduce((n, g) => n + g.i.length, 0), f = o.checks.length;
          if (f === tot && it.sit !== 'feito') { it.sit = 'feito'; it.feitaEm = it.feitaEm || hoje(); }
          else if (f && f < tot && it.sit === 'afazer') it.sit = 'fazendo';
        }
      }
      if (t.ir === HZ_IR) {
        const it = itens[itens.length - 1], mc = mesAntes(d), c = (dados.hor || []).find(x => x.id === mc);
        it.texto = `Conferência de ${mc.slice(5, 7)}/${mc.slice(0, 4)}` + (c ? ` · ${c.corrigidas}/${c.diferencas} diferença(s) corrigida(s)` : ' · PDF ainda não importado') + (t.descricao ? '\n' + t.descricao : '');
        if (c && c.corrigidas >= c.diferencas && it.sit !== 'feito') { it.sit = 'feito'; it.feitaEm = it.feitaEm || hoje(); }
        else if (c && it.sit === 'afazer') it.sit = 'fazendo';
      }
    }
  }
  return itens;
}
/* Tarefa privada (09/11/2026, pedido dele): só quem criou vê — o banco nem
   entrega a linha para os outros (RLS em cron_tarefas). Aqui é só o selo. */
const SELO_PRIV = '<span class="cr-priv" title="Só você vê esta tarefa">\u{1F441} Só eu</span> ';
const seloPriv = it => it?.privada ? SELO_PRIV : '';
const meuEmail = () => String(acesso.email || '').trim().toLowerCase();
/* Bloqueio e início vêm da linha que guarda a situação (tarefa ou estado). */
function bloqDe(r) {
  return {
    inicioEm: r?.inicio_em || null,
    focoEm: r?.foco_em || null,
    prio: r?.prioridade || null,
    bloq: r?.situacao === 'bloqueado'
      ? { motivo: r.bloq_motivo || '', quem: r.bloq_quem || null, cobrar: r.bloq_cobrar || null, desde: r.bloq_desde || null }
      : null,
  };
}
/* Atrasado = passou da data sem andar. Bloqueado não conta: ali o aviso é
   "parado há N dias", que diz mais na reunião. */
const atrasado = it => (it.sit === 'afazer' || it.sit === 'fazendo') && it.data < hoje();
/* Checklist (07/11/2026, rotinas do Trello): modelo em cron_tarefas.checklist
   [{g: grupo, i: [itens]}]; marcados em checks ["grupo|item"] — da tarefa ou,
   na rotina que repete, da ocorrência (cron_estado). */
const txtCk = x => typeof x === 'string' ? x : (x?.t || '');
const chaveCk = (g, i) => `${g}|${txtCk(i)}`;
const totalCk = it => (it.checklist || []).reduce((n, g) => n + (g.i || []).length, 0);
const feitosCk = it => { const set = new Set(it.checks || []); return (it.checklist || []).reduce((n, g) => n + (g.i || []).filter(x => set.has(chaveCk(g.g, x))).length, 0); };
/* Item do checklist ligado a uma tela do app (07/11/2026, pedido dele: "o que
   tem no Trello é a mesma coisa do app") — {t: texto, ir: destino}. */
const IR_CK = {
  exVenc: { a: 'pessoas', t: 'exVenc' }, trVenc: { a: 'pessoas', t: 'trVenc' },
  fichas: { a: 'pessoas', t: 'fichas' }, folhaPonto: { a: 'pessoas', t: 'folhaPonto' },
  bdDia: { a: 'pessoas', t: 'bdDia' }, jorLancar: { a: 'pessoas', t: 'jorLancar' }, dmMes: { a: 'pessoas', t: 'dmMes' },
  ordens: { a: 'manutencoes', x: 'acao=ordens' }, checklist: { a: 'manutencoes', x: 'acao=checklist' },
  horimetros: { a: 'manutencoes', x: 'acao=horimetros' }, patrimonio: { a: 'manutencoes', x: 'acao=patrimonio' },
  vistorias: { a: 'vistorias', m: 'vsAnom', t: 'vsAnAberto' },
  qcSaida: { a: 'estoque', t: 'qcSaida' }, qcEntrada: { a: 'estoque', t: 'qcEntrada' }, ctNova: { a: 'estoque', t: 'ctNova' },
  acPainel: { a: 'estoque', t: 'acPainel' }, acSaldo: { a: 'estoque', t: 'acSaldo' },
  acTransf: { a: 'estoque', t: 'acTransferencias' }, acRelatorio: { a: 'estoque', t: 'acRelatorio' },
  outRec: { a: 'outorga', t: 'otRec' }, rtMes: { a: 'custobase', t: 'rtMes' }, hhMes: { a: 'custobase', t: 'hhMes' }, admMes: { a: 'custobase', t: 'amMes' }, hzConf: { a: 'custobase', t: 'hzConf' },
  colheita: { a: 'colheita', t: 'cpCargas' }, certDocs: { a: 'certificacao', t: 'ceDocumentos' },
  vencMaq: { a: 'manutencoes', x: 'acao=vencimentos' }, certAud: { a: 'certificacao', t: 'ceCertificacoes' },
  certAcoes: { a: 'certificacao', t: 'mcMelhorias' }, cadRel: { a: 'pessoas', t: 'cadRelatorios' },
  campanhas: { a: 'pessoas', t: 'camLista' }, reuniao: { a: 'pessoas', t: 'reuSemana' },
};
const irCk = x => typeof x === 'object' && x?.ir ? (IR_CK[x.ir] || null) : null;
const seloCk = it => it.checklist ? `<span class="cr-ck${feitosCk(it) === totalCk(it) ? ' ok' : ''}">☑ ${feitosCk(it)}/${totalCk(it)}</span>` : '';
const diasParado = it => it.bloq?.desde ? Math.max(0, -diasAte(it.bloq.desde)) : null;

/* ---------------- tela ---------------- */
const vis = ler('gr.cronograma.vis', null) || {};
const est = {
  visao: vis.visao === 'kanban' ? 'foco' : (vis.visao || 'calendario'),  // calendario | foco | reuniao
  colMob: 'afazer',                     // aba do quadro no celular
  colunas: vis.colunas || 'situacao',   // situacao | pessoa
  filtro: vis.filtro || 'todos',        // todos | minhas
  pessoa: '', area: '', origem: '', busca: '', mostrar: 'abertas', prazo: vis.prazo || 'semana', abertos: new Set(ler('gr.cronograma.modAbertos', [])),
  periodo: vis.periodo || 30,
  mes: hoje().slice(0, 7), dia: hoje(),
};
const guardarVis = () => gravarLocal('gr.cronograma.vis', { visao: est.visao, colunas: est.colunas, filtro: est.filtro, periodo: est.periodo, prazo: est.prazo });

let alvo = null;
let ligado = false;

export function abrirCronograma(el) {
  alvo = el;
  if (!ligado) { ligado = true; ouvintes.add(() => {
    if (!alvo || alvo.closest('[hidden]')) return;
    if (est.visao === 'compras') return;   // a aba Compras se redesenha sozinha (js/compras.js) — não apaga o que está sendo digitado
    const b = document.activeElement?.id === 'crBusca' ? $('crBusca') : null, pos = b?.selectionStart;
    desenhar();
    if (b && $('crBusca')) { $('crBusca').focus(); try { $('crBusca').setSelectionRange(pos, pos); } catch {} }
  }); }
  desenhar();
  carregarCronograma();
}

function filtrados() {
  const meu = eu();
  return todosItens().filter(it => {
    if (est.filtro === 'minhas' && (!meu || !it.resps.includes(meu.id))) return false;
    if (est.pessoa === '-' && it.resps.length) return false;
    if (est.pessoa && est.pessoa !== '-' && !it.resps.includes(est.pessoa)) return false;
    if (est.area && it.area !== est.area) return false;
    if (est.origem === 'app' && !it.auto) return false;
    if (est.origem === 'avulsa' && it.auto) return false;
    if (est.busca && !bate(it, est.busca)) return false;
    return true;
  });
}
/* Por módulo (09/11/2026, pedido dele): todas as tarefas separadas pelos
   módulos do app — Pessoas (Cadastros, SST, RH, DP), Certificação, Máquinas…
   — e dentro de cada um pela tela de origem. Cada linha tem "Foco do dia →".
   Mostra as abertas (atrasadas primeiro); "Com concluídas" traz as feitas. */
const MODULOS = [
  { id: 'pessoas', nome: 'Pessoas', areas: ['cad', 'sst', 'rh', 'dp'] },
  { id: 'cert', nome: 'Certificação', areas: ['cert'] },
  { id: 'maq', nome: 'Máquinas e Patrimônio', areas: ['maq'] },
  { id: 'vist', nome: 'Vistorias', areas: ['vist'] },
  { id: 'custo', nome: 'Custo Base', areas: ['custo'] },
  { id: 'colh', nome: 'Colheita e Produção', areas: ['colh'] },
  { id: 'prog', nome: 'Programação Campo', areas: ['prog'] },
  { id: 'est', nome: 'Estoque', areas: ['est'] },
  { id: 'proj', nome: 'Projetos', areas: ['proj'] },
  { id: 'esc', nome: 'Escritório e avulsas gerais', areas: ['esc'] },
];
/* 09/11/2026 (pedido dele): Por módulo virou quadro estilo Kanban — uma
   coluna por módulo, cartões agrupados pela tela de origem — com o prazo
   Hoje (vence até hoje, atrasadas incluídas) / Semana (até domingo) / Tudo. */
const fimSemana = () => addDias(hoje(), 6 - dataDe(hoje()).getDay());
function noPrazo(it) {
  if (est.prazo === 'tudo') return true;
  if (it.sit === 'feito') return (it.feitaEm || it.data) >= (est.prazo === 'hoje' ? hoje() : addDias(hoje(), -dataDe(hoje()).getDay()));
  return (it.comeca || it.data) <= (est.prazo === 'hoje' ? hoje() : fimSemana());
}
function modulos() {
  const conhecidas = new Set(MODULOS.flatMap(m => m.areas));
  const itens = filtrados().filter(it => (est.mostrar === 'todas' || it.sit !== 'feito') && noPrazo(it));
  const cols = MODULOS.map(m => {
    const l = itens.filter(it => m.areas.includes(it.area) || (m.id === 'esc' && !conhecidas.has(it.area)));
    if (!l.length) return '';
    const grupos = new Map();
    for (const it of l) {
      const g = it.auto ? (ORIGENS[it.origem]?.nome || it.origemNome) : `${areaDe(it.area).nome} › Tarefas avulsas`;
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(it);
    }
    const atr = l.filter(it => it.sit !== 'feito' && atrasado(it)).length;
    const ab = l.filter(it => it.sit !== 'feito').length;
    return `<section class="cr-col cr-mod-col" data-col="mod-${m.id}">
      <header class="cr-col-cab"><span class="cr-pt" style="background:${areaDe(m.areas[0]).cor}"></span><b>${esc(m.nome)}</b>
        <span class="cr-cont">${ab}${atr ? ` · <span class="cr-at">${atr} atrasada${atr > 1 ? 's' : ''}</span>` : ''}</span></header>
      <div class="cr-col-corpo">${[...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(g =>
        `<h4 class="cr-mod-sub">${esc(g)} <span>${grupos.get(g).length}</span></h4>` +
        grupos.get(g).sort((a, b) => (a.sit === 'feito') - (b.sit === 'feito') || ordemQuadro(a, b)).map(it => card(it, { comSit: true })).join('')).join('')}</div>
    </section>`;
  }).join('');
  const nomeP = { hoje: 'para hoje', semana: 'para esta semana', tudo: '' }[est.prazo];
  return cols ? `<div class="cr-quadro cr-mods">${cols}</div>`
    : `<div class="cr-foco-vazio"><b>Nenhuma tarefa ${est.mostrar === 'todas' ? '' : 'aberta '}${nomeP} nos filtros atuais.</b><p>Troque o prazo para Semana ou Tudo, ou confira os filtros.</p></div>`;
}

/* Pesquisa (09/11/2026, pedido dele): pelo número (#123 ou 123) ou por
   qualquer palavra do nome, dos detalhes, do checklist, da origem ou da pessoa. */
function bate(it, q) {
  const n = limpo(q).replace(/^#/, '');
  if (/^\d+$/.test(n)) return String(numDe(it) || '') === n || norm(it.titulo).includes(n);
  const txt = norm([it.titulo, it.texto, it.origemNome, (it.detalhes || []).join(' '),
    ...(it.checklist || []).flatMap(g => [g.g, ...(g.i || []).map(x => typeof x === 'object' ? x.t : x)]),
    ...it.resps.map(id => pessoa(id)?.nome || '')].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every(p => txt.includes(p));
}
function resultados() {
  const itens = filtrados().sort((a, b) => (a.sit === 'feito') - (b.sit === 'feito') || (numDe(a) || 1e9) - (numDe(b) || 1e9));
  if (!itens.length) return `<div class="cr-foco-vazio"><b>Nenhuma tarefa encontrada para "${esc(est.busca)}".</b><p>Confira o número ou tente outra palavra. Os filtros de pessoa, área e origem também valem na pesquisa.</p></div>`;
  return `<p class="cr-sub">${itens.length} ${itens.length === 1 ? 'tarefa encontrada' : 'tarefas encontradas'}</p><div class="cr-lista cr-busca-res">${itens.map(linha).join('')}</div>`;
}

const tagArea = a => `<span class="cr-tag" style="background:${areaDe(a).cor}">${esc(areaDe(a).nome)}</span>`;
/* Origem (07/11/2026, aprovado por ele): "Do app" = nasce e some sozinha
   conforme a área de origem (etiqueta cheia na cor da área, com a origem);
   "Avulsa" = lançada à mão, inclusive as importadas do Trello (etiqueta só
   contornada, com quem criou). */
function quemCriou(t) {
  const c = limpo(t?.criado_por);
  if (!c || /importa/i.test(c)) return '';
  const m = c.match(/pedido d[oa]\s+([^)]+)/i);
  return limpo(m ? m[1] : c).split(/\s+/)[0];
}
const tagOrigem = it => it.auto
  ? `<span class="cr-tag" style="background:${areaDe(it.area).cor}" title="Vem sozinha de ${esc(it.origemNome)}">Do app · ${esc((ORIGENS[it.origem]?.nome || areaDe(it.area).nome))}</span>`
  : /^rotina · /i.test(it.tarefa?.descricao || '')
    ? `<span class="cr-tag rotina" title="Rotina que repete">${esc(it.tarefa.descricao.replace(/ do mês$/, ''))}</span>`
    : `<span class="cr-tag avulsa" title="Tarefa lançada à mão">Avulsa${quemCriou(it.tarefa) ? ' · ' + esc(quemCriou(it.tarefa)) : ''}</span>`;
const avatar = (id, grande) => {
  const p = pessoa(id);
  return `<span class="cr-av${grande ? ' g' : ''}${p ? '' : ' cr-ninguem'}" title="${esc(p ? p.nome : 'Sem responsável')}">${esc(iniciais(p))}</span>`;
};
const avatares = it => it.resps.length > 1
  ? `<span class="cr-avs">${it.resps.map(id => avatar(id)).join('')}</span>` : avatar(it.resp);
function rotuloData(it) {
  if (it.sit === 'feito') return { txt: it.feitaEm ? 'feito ' + brCurto(it.feitaEm) : brCurto(it.data), cls: 'ok' };
  const n = diasAte(it.data);
  if (it.comeca && n >= 0) return hoje() < it.comeca
    ? { txt: `de ${brCurto(it.comeca)} a ${brCurto(it.data)}`, cls: '' }
    : { txt: n === 0 ? 'prazo hoje' : `prazo ${brCurto(it.data)} · faltam ${n} ${n === 1 ? 'dia' : 'dias'}`, cls: n === 0 ? 'hoje' : '' };
  if (n < 0) return { txt: n === -1 ? 'venceu ontem' : `${-n} dias atrasado`, cls: 'atraso' };
  if (n === 0) return { txt: 'hoje', cls: 'hoje' };
  if (n === 1) return { txt: 'amanhã', cls: '' };
  return { txt: `${SEMANA[dataDe(it.data).getDay()].toLowerCase()} ${brCurto(it.data)}`, cls: '' };
}

function desenhar() {
  if (!alvo) return;
  cacheAgora = null;
  const meu = eu();
  const pessoas = pessoasAtivas();
  const ultima = dados.em ? new Date(dados.em) : null;
  const status = dados.carregando ? 'Atualizando…'
    : ultima ? `Atualizado às ${String(ultima.getHours()).padStart(2, '0')}:${String(ultima.getMinutes()).padStart(2, '0')}${navigator.onLine ? '' : ' · sem conexão, mostrando o último retrato'}`
    : (navigator.onLine ? 'Carregando…' : 'Sem conexão e nada guardado neste aparelho ainda.');

  alvo.innerHTML = `
  <div class="cr">
    <div class="cr-cab">
      <div>
        <h2>Rastro <small class="cr-marca">Gestão de tarefas e prazos</small></h2>
        <p class="cr-sub">Tarefas e vencimentos de todas as áreas, por pessoa · <span id="crStatus">${esc(status)}</span></p>
      </div>
      <div class="cr-acoes">
        ${acesso.admin ? '<button type="button" class="btn" id="crResp">Responsáveis</button>' : ''}
        <button type="button" class="btn" id="crAtualizar" ${dados.carregando ? 'disabled' : ''}>Atualizar</button>
        <button type="button" class="btn principal" id="crNova">+ Tarefa</button>
      </div>
    </div>
    ${dados.semTabelas ? '<div class="aviso erro">O banco ainda não tem as tabelas do Cronograma. As tarefas lançadas à mão e a mudança de situação só funcionam depois disso — os vencimentos das áreas já aparecem.</div>' : ''}
    <div class="cr-seg" role="tablist">
      <button type="button" role="tab" data-visao="calendario" aria-selected="${est.visao === 'calendario'}">Calendário</button>
      <button type="button" role="tab" data-visao="modulos" aria-selected="${est.visao === 'modulos'}">Por módulo</button>
      <button type="button" role="tab" data-visao="foco" aria-selected="${est.visao === 'foco'}">Foco do dia</button>
      <button type="button" role="tab" data-visao="reuniao" aria-selected="${est.visao === 'reuniao'}">Reunião</button>
      <button type="button" role="tab" data-visao="compras" aria-selected="${est.visao === 'compras'}">Compras</button>
    </div>
    ${est.visao === 'compras' ? '<div id="crCorpo"><div id="crCmp"></div></div>' : est.visao === 'reuniao' ? `<div id="crCorpo">${reuniao()}</div>` : `
    <div class="cr-filtros">
      <input type="search" id="crBusca" class="cr-busca" placeholder="Pesquisar nº ou nome da tarefa" value="${esc(est.busca)}" aria-label="Pesquisar tarefa" autocomplete="off">
      <button type="button" class="cr-chip" data-filtro="todos" aria-pressed="${est.filtro === 'todos'}">Todos</button>
      <button type="button" class="cr-chip" data-filtro="minhas" aria-pressed="${est.filtro === 'minhas'}" ${meu ? '' : 'disabled title="Seu nome não está entre as pessoas do escritório (Reunião semanal › Responsáveis)."'}>Só as minhas</button>
      <select id="crPessoa" aria-label="Pessoa">
        <option value="">Todas as pessoas</option>
        ${pessoas.map(p => `<option value="${p.id}" ${est.pessoa === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        <option value="-" ${est.pessoa === '-' ? 'selected' : ''}>Sem responsável</option>
      </select>
      <select id="crArea" aria-label="Área">
        <option value="">Todas as áreas</option>
        ${Object.entries(AREAS_C).map(([k, a]) => `<option value="${k}" ${est.area === k ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}
      </select>
      <select id="crOrigem" aria-label="Origem">
        <option value="">Origem: todas</option>
        <option value="app" ${est.origem === 'app' ? 'selected' : ''}>Do app</option>
        <option value="avulsa" ${est.origem === 'avulsa' ? 'selected' : ''}>Avulsas</option>
      </select>
      ${est.visao === 'modulos' ? `
        <span class="cr-sep">Prazo:</span>
        <button type="button" class="cr-chip" data-prazo="hoje" aria-pressed="${est.prazo === 'hoje'}">Hoje</button>
        <button type="button" class="cr-chip" data-prazo="semana" aria-pressed="${est.prazo === 'semana'}">Semana</button>
        <button type="button" class="cr-chip" data-prazo="tudo" aria-pressed="${est.prazo === 'tudo'}">Tudo</button>
        <span class="cr-sep">Mostrar:</span>
        <button type="button" class="cr-chip" data-mostrar="abertas" aria-pressed="${est.mostrar !== 'todas'}">Abertas</button>
        <button type="button" class="cr-chip" data-mostrar="todas" aria-pressed="${est.mostrar === 'todas'}">Com concluídas</button>` : ''}
      ${est.visao === 'foco' ? `
        <span class="cr-sep">Colunas por:</span>
        <button type="button" class="cr-chip" data-colunas="situacao" aria-pressed="${est.colunas === 'situacao'}">Situação</button>
        <button type="button" class="cr-chip" data-colunas="pessoa" aria-pressed="${est.colunas === 'pessoa'}">Pessoa</button>` : ''}
    </div>
    <div id="crCorpo">${est.busca ? resultados() : est.visao === 'foco' ? foco() : est.visao === 'modulos' ? modulos() : calendario()}</div>
    <div class="cr-legenda">${est.visao === 'calendario' ? legendaSit() : Object.values(AREAS_C).map(a => `<span><i style="background:${a.cor}"></i>${esc(a.nome)}</span>`).join('')}
      <span class="cr-auto-leg"><span class="cr-tag" style="background:#51534A">Do app</span> vem sozinha de outra área · <span class="cr-tag avulsa">Avulsa</span> lançada à mão</span></div>`}
  </div>`;
  ligarTela();
  if (est.visao === 'reuniao') ligarReuniao();
  if (est.visao === 'compras') abrirCompras($('crCmp'), { rastro: true });
}

/* Itens de um dia do calendário (o vencimento, o "Começa:" e o "Cobrar:"). */
function itensDoDia(dia) {
  const l = [];
  for (const it of filtrados()) {
    if (it.data === dia) l.push(it);
    if (it.comeca && it.comeca !== it.data && it.sit !== 'feito' && it.comeca === dia) l.push({ ...it, inicio: true });
    if (it.sit === 'bloqueado' && it.bloq?.cobrar && it.bloq.cobrar !== it.data && it.bloq.cobrar === dia) l.push({ ...it, cobrar: true });
  }
  return l.sort(ordemItens);
}
const livreFoco = it => it.sit !== 'feito' && it.sit !== 'bloqueado' && !it.focoEm;

/* Atalho "+N tarefas" (12/11/2026, pedido dele): tocar no "+9 tarefas" do
   calendário abre a lista do dia já com os botões do Foco do dia — um toque
   em Agora / Em seguida / Rápido / Por último manda a tarefa para o foco,
   sem abrir tarefa por tarefa. "Mandar todas" envia as que faltam como
   "Por último". A janela fica aberta e vai marcando o que já foi. */
function abrirAtalhoDia(dia) {
  const d = dialogo();
  const desenharAt = () => {
    const l = itensDoDia(dia);
    const vistos = new Set();
    const abertas = l.filter(it => it.sit !== 'feito' && !vistos.has(it.chave) && vistos.add(it.chave));
    const feitas = l.filter(it => it.sit === 'feito').length;
    const livres = abertas.filter(livreFoco);
    const linhaAt = it => {
      const r = rotuloData(it);
      const dir = it.sit === 'bloqueado' ? '<span class="cr-nofoco" style="color:#BA7517">🔒 bloqueada</span>'
        : it.focoEm ? `<span class="cr-nofoco">🎯 no foco</span><span class="cr-ac" role="button" tabindex="0" data-at="tirar" data-alvo="${esc(it.chave)}">Tirar</span>`
        : botoesFoco(it).replace(/data-acao=/g, 'data-at=');
      return `<div class="cr-at-lin${it.focoEm ? ' ok' : ''}">
        <span class="cr-barra" style="background:${areaDe(it.area).cor}"></span>
        <span class="cr-at-txt" role="button" tabindex="0" data-abrir="${esc(it.chave)}" title="Abrir a tarefa"><b>${numDe(it) ? `<span class="cr-num">#${numDe(it)}</span> ` : ''}${it.cobrar ? 'Cobrar: ' : ''}${it.inicio ? 'Começa: ' : ''}${seloPriv(it)}${esc(it.titulo)}</b>
          <small>${tagOrigem(it)} · ${esc(nomesDe(it.resps) || 'sem responsável')} · <span class="cr-data ${r.cls}">${esc(r.txt)}</span></small></span>
        <span class="cr-at-dir">${dir}</span></div>`;
    };
    d.innerHTML = `<form method="dialog" class="cr-at">
      <h3 style="margin:0 0 2px">🎯 Mandar para o Foco do dia</h3>
      <p class="cr-dlg-orig">${SEMANA[dataDe(dia).getDay()]}, ${brCurto(dia)} · ${abertas.length} ${abertas.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}${feitas ? ` · ${feitas} concluída${feitas === 1 ? '' : 's'}` : ''}</p>
      <p class="dc-sem" style="margin:0 0 8px">Um toque na cor manda a tarefa para o foco: <b>Agora</b> importante e urgente (até 2) · <b>Em seguida</b> importante · <b>Rápido</b> simples · <b>Por último</b> o resto.</p>
      ${livres.length > 1 ? `<div class="barra" style="margin-bottom:8px"><button type="button" class="btn" id="crAtTodas">🎯 Mandar as ${livres.length} como "Por último"</button></div>` : ''}
      <div class="cr-at-lista">${abertas.length ? abertas.map(linhaAt).join('') : '<p class="cr-vazio">Nada aberto neste dia.</p>'}</div>
      <div class="barra entre" style="margin-top:10px"><span class="dc-sem">Toque no nome para abrir a tarefa.</span><button class="btn principal" value="ok">Fechar</button></div>
    </form>`;
    d.querySelectorAll('[data-at]').forEach(b => {
      const ir = async ev => {
        ev.preventDefault(); ev.stopPropagation();
        const ac = b.dataset.at;
        if (ac === 'cheio') return alert('As 2 vagas de "Fazer agora" já estão ocupadas. Conclua uma ou escolha outra cor.');
        const it = todosItens().find(x => x.chave === b.dataset.alvo);
        if (!it) return;
        const p = ac === 'tirar' ? mudar(it, { foco: false })
          : mudar(it, { sit: it.sit === 'feito' ? 'afazer' : it.sit, foco: true, prio: ac.slice(5) });
        desenharAt(); await p; if (d.open) desenharAt();
      };
      b.onclick = ir;
      b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') ir(ev); };
    });
    d.querySelectorAll('[data-abrir]').forEach(b => {
      b.onclick = () => abrirTarefa(b.dataset.abrir);
      b.onkeydown = ev => { if (ev.key === 'Enter') abrirTarefa(b.dataset.abrir); };
    });
    if ($('crAtTodas')) $('crAtTodas').onclick = async () => {
      const ps = livres.map(x => todosItens().find(y => y.chave === x.chave)).filter(Boolean)
        .map(it => mudar(it, { sit: it.sit, foco: true, prio: 'ultimo' }));
      desenharAt(); await Promise.all(ps); if (d.open) desenharAt();
    };
  };
  desenharAt();
  if (!d.open) d.showModal();
}

function calendario() {
  const itens = filtrados();
  const [a, m] = est.mes.split('-').map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const ini = new Date(primeiro); ini.setDate(1 - primeiro.getDay());
  const ult = new Date(a, m, 0);
  const fim = new Date(ult); fim.setDate(ult.getDate() + (6 - ult.getDay()));
  const porDia = new Map();
  const por = (d, it) => { if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(it); };
  for (const it of itens) {
    por(it.data, it);
    // tarefa com período: aparece também no dia em que começa ("Começa: …")
    if (it.comeca && it.comeca !== it.data && it.sit !== 'feito') por(it.comeca, { ...it, inicio: true });
    // bloqueada com data de cobrança: aparece também no dia de cobrar
    if (it.sit === 'bloqueado' && it.bloq?.cobrar && it.bloq.cobrar !== it.data) por(it.bloq.cobrar, { ...it, cobrar: true });
  }
  let cel = '';
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const s = iso(d), fora = d.getMonth() !== m - 1;
    const l = (porDia.get(s) || []).slice().sort(ordemItens);
    const temAtraso = l.some(atrasado);
    // bolinhas = situação (07/11/2026): atrasado, a fazer, em andamento, bloqueado, concluído
    const sits = ['atraso', 'afazer', 'fazendo', 'bloqueado', 'feito'].filter(k => l.some(x => sitCor(x) === k));
    const cls = ['cr-dia', fora ? 'fora' : '', s === hoje() ? 'hoje' : '', s === est.dia ? 'sel' : '', temAtraso ? 'atraso' : ''].filter(Boolean).join(' ');
    cel += `<button type="button" class="${cls}" data-dia="${s}" aria-label="${br(s)}: ${l.length} itens">
      <span class="n">${d.getDate()}</span>
      <span class="pts">${sits.map(k => `<i style="background:${COR_SIT[k]}"></i>`).join('')}</span>
      <span class="cr-evs">${l.slice(0, 3).map(x => `<span class="cr-ev s-${sitCor(x)}">${x.cobrar ? 'Cobrar: ' : ''}${x.inicio ? 'Começa: ' : ''}${esc(x.titulo)}</span>`).join('')}${l.length > 3 ? `<span class="cr-ev-mais" role="button" tabindex="0" data-mais="${s}" title="Abrir as tarefas do dia e mandar para o Foco do dia">+${l.length - 3} ${l.length - 3 === 1 ? 'tarefa' : 'tarefas'} 🎯</span>` : ''}</span>
      ${l.length ? `<span class="q">${l.length}</span>` : ''}
    </button>`;
  }
  const doDia = (porDia.get(est.dia) || []).sort(ordemItens);
  const dd = dataDe(est.dia);
  const titulo = `${SEMANA[dd.getDay()]}, ${brCurto(est.dia)}${est.dia === hoje() ? ' · hoje' : ''}`;
  const atrasos = itens.filter(atrasado).length;
  return `<div class="cr-cal">
    <div class="cr-mes">
      <div class="cr-mes-nav">
        <button type="button" class="btn mini" data-mes="-1" aria-label="Mês anterior">‹</button>
        <b>${MESES[m - 1]} ${a}</b>
        <button type="button" class="btn mini" data-mes="1" aria-label="Próximo mês">›</button>
        <button type="button" class="btn mini" data-mes="0">Hoje</button>
      </div>
      <div class="cr-sem">${SEMANA.map(x => `<span>${x[0]}</span>`).join('')}</div>
      <div class="cr-grade">${cel}</div>
      ${atrasos ? `<p class="cr-alerta">${atrasos} ${atrasos === 1 ? 'item atrasado' : 'itens atrasados'} no filtro atual — os dias em vermelho.</p>` : ''}
    </div>
    <div class="cr-lista">
      <div class="cr-lista-cab"><b>${titulo}</b><span>${doDia.some(livreFoco) ? `<button type="button" class="btn mini cr-mais-bt" data-mais="${est.dia}">🎯 Mandar para o foco</button> ` : ''}${doDia.length} ${doDia.length === 1 ? 'item' : 'itens'}</span></div>
      ${doDia.length ? doDia.map(linha).join('') : '<p class="cr-vazio">Nada neste dia.</p>'}
    </div>
  </div>`;
}
const ordemItens = (a, b) => (a.sit === 'feito') - (b.sit === 'feito') || a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, 'pt-BR');
const legendaSit = () => [['atraso', 'Atrasado'], ['afazer', 'A fazer'], ['fazendo', 'Em andamento'], ['bloqueado', 'Bloqueado'], ['feito', 'Concluído']]
  .map(([k, n]) => `<span><i style="background:${COR_SIT[k]}"></i>${n}</span>`).join('');

/* ---------------- ir para a origem (29/10/2026, pedido dele) ----------------
   "Coloque um botão para ir para o local da atividade": o card e o detalhe
   ganham "Ir para", que abre a área e a tela de onde o item veio. */
function podeIr(ir) {
  if (!ir) return false;
  if (!areasLiberadas().some(a => a.id === ir.a)) return false;
  if (ir.a === 'pessoas') return !!ir.t && podeTela(ir.t) && !!moduloDe(ir.t);
  return true;
}
function quandoPronta(idMoldura, fn, tentativas = 60) {
  let w = null;
  try { w = $(idMoldura)?.contentWindow; } catch {}
  if (w && w.areaPronta) { try { fn(w); } catch (e) { console.warn('[Cronograma] ir para', e); } return; }
  if (tentativas > 0) setTimeout(() => quandoPronta(idMoldura, fn, tentativas - 1), 250);
}
function irPara(ir) {
  if (!podeIr(ir)) return;
  const d = $('dlgCron'); if (d?.open) d.close();
  // Compras (10/11/2026): abre a aba Compras aqui mesmo, sem sair do Rastro
  if (ir.a === 'compras') { est.visao = 'compras'; guardarVis(); desenhar(); return; }
  if (ir.a === 'pessoas') { entrarNaArea('pessoas'); abrirModulo(moduloDe(ir.t), ir.t); }
  else if (ir.a === 'certificacao') entrarNaArea('certificacao', ir.t);
  else if (ir.a === 'vistorias') { entrarNaArea('vistorias'); if (ir.m) abrirModulo(ir.m, ir.t); }
  else {
    entrarNaArea(ir.a, undefined, ir.x);
    if (ir.a === 'colheita' && ir.t) quandoPronta('molduraCP', w => w.abrirTelaColheita?.(ir.t));
    if (ir.a === 'estoque' && ir.t) quandoPronta('molduraEst', w => w.abrirTelaEstoque?.(ir.t));
    if (ir.a === 'custobase' && ir.t) quandoPronta('molduraCB', w => w.abrirTelaCustoBase?.(ir.t));
    if (ir.a === 'outorga' && ir.t) quandoPronta('molduraOT', w => w.abrirTelaOutorga?.(ir.t));
  }
  window.scrollTo?.(0, 0);
}
const botaoIr = it => podeIr(it.ir)
  ? `<span class="cr-ir" role="button" tabindex="0" data-ir="${esc(it.chave)}" title="Ir para ${esc(ORIGENS[it.origem]?.nome || '')}">Ir para ↗</span>` : '';

function linha(it) {
  const r = rotuloData(it);
  return `<button type="button" class="cr-item${it.sit === 'feito' ? ' feito' : ''}" data-item="${esc(it.chave)}">
    <span class="cr-barra" style="background:${areaDe(it.area).cor}"></span>
    <span class="cr-item-txt"><b>${numDe(it) ? `<span class="cr-num">#${numDe(it)}</span> ` : ''}${it.cobrar ? 'Cobrar: ' : ''}${it.inicio ? 'Começa: ' : ''}${it.sit === 'bloqueado' ? '🔒 ' : ''}${seloPriv(it)}${esc(it.titulo)}</b><small>${tagOrigem(it)}${it.checklist ? ' ' + seloCk(it) : ''}${it.sit !== 'afazer' && it.sit !== 'feito' ? ' · ' + SIT[it.sit].toLowerCase() : ''}</small>${it.bloq ? `<small class="cr-bloq-txt">Depende de: ${esc(it.bloq.motivo || 'a definir')}${diasParado(it) != null ? ` · parado há ${diasParado(it)} ${diasParado(it) === 1 ? 'dia' : 'dias'}` : ''}</small>` : ''}</span>
    <span class="cr-item-dir">${botaoIr(it)}${avatares(it)}<span class="cr-data ${r.cls}">${esc(r.txt)}</span>
      ${it.sit !== 'feito' && it.sit !== 'bloqueado' ? (it.focoEm ? '<span class="cr-nofoco">🎯 no foco</span>'
        : botoesFoco(it)) : ''}</span>
  </button>`;
}

/* Prioridade no Foco do dia (11/11/2026, pedido dele — matriz de Eisenhower
   com nomes de ação, porque tudo no foco já é para hoje). "Fazer agora" tem
   2 vagas por pessoa; quem não tem etiqueta conta como "Por último". O envio
   ao foco já escolhe a cor, num toque só. Fica em prioridade (cron_tarefas /
   cron_estado) e continua de um dia para o outro. */
const PRIO = [
  { id: 'agora', nome: 'Fazer agora', curto: 'Agora', exp: 'importante e urgente (até 2)', cor: '#F87168', tx: '#5D1010' },
  { id: 'seguida', nome: 'Fazer em seguida', curto: 'Em seguida', exp: 'importante, sem pressa', cor: '#FEA362', tx: '#633806' },
  { id: 'rapido', nome: 'Fazer rápido', curto: 'Rápido', exp: 'urgente, mas simples', cor: '#579DFF', tx: '#042C53' },
  { id: 'ultimo', nome: 'Por último', curto: 'Por último', exp: 'nem urgente nem importante', cor: '#C6C6BE', tx: '#444441', fundo: '#E3E3DD' },
];
const VAGAS_AGORA = 2;
const prioDe = it => PRIO.find(p => p.id === it.prio) || PRIO[3];
const rankPrio = it => PRIO.indexOf(prioDe(it));
const noFocoAberta = it => !!it.focoEm && (it.sit === 'afazer' || it.sit === 'fazendo');
/* Vagas de "Fazer agora" ocupadas, por pessoa responsável pela tarefa. */
let cacheAgora = null;   // zera a cada gravar() e desenhar()
function agoraCheio(it) {
  if (!cacheAgora) cacheAgora = todosItens().filter(x => noFocoAberta(x) && x.prio === 'agora');
  const outras = cacheAgora.filter(x => x.chave !== it.chave);
  const quem = it.resps.length ? it.resps : [null];
  return quem.some(q => outras.filter(x => q ? x.resps.includes(q) : !x.resps.length).length >= VAGAS_AGORA);
}
function botoesPrio(it, acao) {
  const cheio = agoraCheio(it);
  return `<span class="cr-prio-bts"><span class="cr-prio-l">${acao === 'foco' ? 'Foco:' : 'Trocar:'}</span>${PRIO.map(p => {
    const off = p.id === 'agora' && cheio && it.prio !== 'agora';
    const atual = acao === 'prio' && prioDe(it).id === p.id;
    return `<span class="cr-prio-bt${off ? ' off' : ''}${atual ? ' atual' : ''}" role="button" tabindex="0" ${off ? 'aria-disabled="true" title="As 2 vagas de Fazer agora estão ocupadas"' : ''} data-acao="${off ? 'cheio' : acao + ':' + p.id}" data-alvo="${esc(it.chave)}" style="--pc:${p.fundo || p.cor};--pt:${p.tx}">${off ? 'Agora · cheio' : p.curto}${atual ? ' ✓' : ''}</span>`;
  }).join('')}</span>`;
}
const botoesFoco = it => botoesPrio(it, 'foco');
const etiquetaPrio = it => { const p = prioDe(it); return `<span class="cr-prio-et" style="--pc:${p.fundo || p.cor};--pt:${p.tx}">${p.nome}</span>`; };
function legendaPrio() {
  return `<div class="cr-prio-leg">${PRIO.map(p => `<span><i style="background:${p.cor}"></i><b>${p.nome}</b> ${p.exp}</span>`).join('')}</div>`;
}

/* Ações rápidas do card (07/11/2026): no celular não dá para arrastar, então
   cada card leva o próximo passo — Iniciar, Concluir, Bloquear, Liberar. */
function acoes(it) {
  const b = (a, t, cls = '') => `<span class="cr-ac${cls}" role="button" tabindex="0" data-acao="${a}" data-alvo="${esc(it.chave)}">${t}</span>`;
  if (it.sit === 'bloqueado') return b('liberar', 'Liberar');
  if (!it.focoEm) return it.sit === 'feito' ? b('afazer', 'Reabrir') : botoesFoco(it) + b('bloquear', 'Bloquear');
  const trocar = est.prioAberta === it.chave ? botoesPrio(it, 'prio') : b('prioMenu', 'Prioridade ▾');
  // Concluir direto do A fazer (09/11/2026): tarefa rápida não precisa passar por Em andamento
  if (it.sit === 'afazer') return b('fazendo', 'Iniciar') + b('feito', '✓ Concluir', ' ok') + b('bloquear', 'Bloquear') + b('tirar', 'Tirar do foco') + trocar;
  if (it.sit === 'fazendo') return b('feito', '✓ Concluir', ' ok') + b('bloquear', 'Bloquear') + trocar;
  return b('fazendo', 'Reabrir');
}
/* No foco desde um dia anterior e não concluída = "não feito" (07/11/2026). */
const naoFeito = it => !!it.focoEm && it.sit !== 'feito' && it.focoEm < hoje();
function seloNaoFeito(it) {
  if (!naoFeito(it)) return '';
  const n = -diasAte(it.focoEm);
  return `<span class="cr-sit naofeito">Não feito · no foco desde ${brCurto(it.focoEm)}${n > 1 ? ` (${n} dias)` : ''}</span>`;
}
function seloSit(it) {
  if (atrasado(it)) { const n = -diasAte(it.data); return `<span class="cr-sit atraso">Atrasada ${n} ${n === 1 ? 'dia' : 'dias'}</span>`; }
  return '';
}
function linhaBloq(it) {
  if (!it.bloq) return '';
  const n = diasParado(it), q = it.bloq.quem ? pessoa(it.bloq.quem)?.nome : null;
  return `<small class="cr-bloq-txt">Depende de: ${esc(it.bloq.motivo || 'a definir na reunião')}${q ? ` · com ${esc(q)}` : ''}${n != null ? ` · parado há ${n} ${n === 1 ? 'dia' : 'dias'}` : ''}${it.bloq.cobrar ? ` · cobrar ${brCurto(it.bloq.cobrar)}` : ''}</small>`;
}
function card(it, { semResp = false, comSit = false, comAcoes = true, mover = false } = {}) {
  const r = it.sit === 'fazendo' && it.inicioEm ? { txt: 'iniciada ' + brCurto(it.inicioEm) + (atrasado(it) ? ' · venceu ' + brCurto(it.data) : ''), cls: atrasado(it) ? 'atraso' : '' }
    : atrasado(it) ? { txt: 'venceu ' + brCurto(it.data), cls: 'atraso' } : rotuloData(it);
  return `<button type="button" class="cr-card${it.sit === 'bloqueado' ? ' bloq' : ''}${it.sit === 'feito' ? ' feito' : ''}" draggable="true" data-item="${esc(it.chave)}">
    <span class="cr-card-top"><span class="cr-card-tags">${seloNum(it)}${tagOrigem(it)}</span>${mover ? `<span class="cr-mover"><span class="cr-mv" role="button" tabindex="0" data-acao="subir" data-alvo="${esc(it.chave)}" title="Subir">▲</span><span class="cr-mv" role="button" tabindex="0" data-acao="descer" data-alvo="${esc(it.chave)}" title="Descer">▼</span></span>` : ''}${comSit ? `<span class="cr-sit ${sitCor(it)}">${atrasado(it) ? 'Atrasada' : SIT[it.sit]}</span>` : seloSit(it)}</span>
    ${noFocoAberta(it) ? etiquetaPrio(it) : ''}
    <b>${seloPriv(it)}${esc(it.titulo)}</b>
    ${it.checklist ? `<span class="cr-ckbar"><i style="width:${Math.round(feitosCk(it) / totalCk(it) * 100)}%"></i></span>` : ''}
    ${seloNaoFeito(it)}
    ${linhaBloq(it)}
    <span class="cr-card-pe"><span class="cr-data ${r.cls}">${esc(r.txt)}</span>${seloCk(it)}<span class="cr-card-dir">${botaoIr(it)}${semResp ? '' : avatares(it)}</span></span>
    ${comAcoes ? `<span class="cr-acs">${acoes(it)}</span>` : ''}
  </button>`;
}

/* Ordem dentro da coluna: atrasadas primeiro (mais antiga em cima), depois pela data. */
const ordemQuadro = (a, b) => (atrasado(b) - atrasado(a)) || a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, 'pt-BR');

/* Foco do dia (07/11/2026): o que a equipe escolheu fazer, enviado na reunião
   (ou pelo calendário). Fica aqui até concluir; o que entrou num dia anterior
   e não terminou ganha a etiqueta "Não feito". Concluído mostra o de hoje.
   Bloquear tira do foco (volta ao calendário com cadeado). Sem limite de
   tarefas por pessoa (decisão dele). */
/* Ordem manual do Foco do dia (09/11/2026, pedido dele: "mover para cima e
   para baixo, estilo Trello"). Fica no banco, igual para todos, numa linha de
   cron_estado (chave 'ordem:foco', lista de chaves em checks). O que ainda não
   foi movido vai para o fim, na ordem de antes. */
const ORDEM_FOCO = 'ordem:foco';
const posFoco = () => { const l = estadoDe(ORDEM_FOCO)?.checks || []; return new Map(l.map((k, i) => [k, i])); };
const ordemFoco = (a, b, pos = posFoco()) => {
  const pa = pos.has(a.chave) ? pos.get(a.chave) : 1e9, pb = pos.has(b.chave) ? pos.get(b.chave) : 1e9;
  return (rankPrio(a) - rankPrio(b)) || pa - pb || ordemFocoBase(a, b);
};
const ordemFocoBase = (a, b) => (naoFeito(b) - naoFeito(a)) || (a.focoEm || '').localeCompare(b.focoEm || '') || a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, 'pt-BR');
function foco() {
  const pos = posFoco();
  const itens = filtrados().filter(it => it.focoEm && it.sit !== 'bloqueado' && (it.sit !== 'feito' || (it.feitaEm || hoje()) >= hoje())).sort((a, b) => ordemFoco(a, b, pos));
  if (!itens.length && (est.colunas === 'pessoa' || !filtrados().some(i => i.sit === 'bloqueado'))) return `<div class="cr-foco-vazio"><b>Ninguém tem tarefa no foco agora.</b>
    <p>Na reunião da manhã, cada pessoa escolhe o que vai fazer no dia e toca em "Foco do dia →". Fora da reunião, o botão também aparece nas tarefas do calendário.</p>
    <button type="button" class="btn principal" data-visao="reuniao">Abrir a reunião</button></div>`;
  let cols;
  if (est.colunas === 'pessoa') {
    const ps = pessoasAtivas();
    cols = [...ps.map(p => ({ id: p.id, nome: p.nome, cab: avatar(p.id, true), itens: itens.filter(i => i.resps.includes(p.id)) })),
      { id: '-', nome: 'Sem responsável', cab: avatar(null, true), itens: itens.filter(i => !i.resps.length) }]
      .filter(c => c.itens.length);
    return `<div class="cr-quadro">${cols.map(c => {
      const ok = c.itens.filter(i => i.sit === 'feito').length, nf = c.itens.filter(naoFeito).length;
      return `<section class="cr-col" data-col="${c.id}">
        <header class="cr-col-cab pessoa">${c.cab}<span class="cr-quem"><b>${esc(c.nome)}</b><small>${ok} de ${c.itens.length} concluídas${nf ? ` · ${nf} não feita${nf > 1 ? 's' : ''}` : ''}</small></span></header>
        <div class="cr-col-corpo">${c.itens.map(i => card(i, { semResp: true, comSit: true, mover: true })).join('')}</div>
      </section>`;
    }).join('')}</div>`;
  }
  cols = [
    { id: 'afazer', nome: 'A fazer', cor: '#51534A', itens: itens.filter(i => i.sit === 'afazer') },
    { id: 'fazendo', nome: 'Em andamento', cor: COR_SIT.fazendo, itens: itens.filter(i => i.sit === 'fazendo') },
    { id: 'feito', nome: 'Concluído hoje', cor: COR_SIT.feito, itens: itens.filter(i => i.sit === 'feito') },
    /* Bloqueado (09/11/2026, pedido dele): lista de todas as bloqueadas — no
       foco ou não — com do que depende, quem precisa agir e há quantos dias
       está parada; as paradas há mais tempo em cima. "Liberar" volta para
       A fazer no foco. Arrastar um cartão para cá pede o "depende de". */
    { id: 'bloqueado', nome: 'Bloqueado', cor: COR_SIT.bloqueado, itens: filtrados().filter(i => i.sit === 'bloqueado')
      .sort((a, b) => (a.bloq?.desde || '9').localeCompare(b.bloq?.desde || '9') || a.titulo.localeCompare(b.titulo, 'pt-BR')) },
  ];
  const extra = c => { const n = c.itens.filter(naoFeito).length; return n ? ` · <span class="cr-at">${n} não feita${n > 1 ? 's' : ''}</span>` : ''; };
  // No celular as colunas viram abas (uma por vez); no computador ficam lado a lado.
  if (!cols.some(c => c.id === est.colMob)) est.colMob = 'afazer';
  return `<div class="cr-abas" role="tablist">${cols.map(c => `<button type="button" role="tab" data-colmob="${c.id}" aria-selected="${est.colMob === c.id}">${c.nome} <span>${c.itens.length}</span></button>`).join('')}</div>
    <div class="cr-quadro sit">${cols.map(c => `<section class="cr-col col-${c.id}${est.colMob === c.id ? ' ativa' : ''}" data-col="${c.id}">
      <header class="cr-col-cab"><span class="cr-pt" style="background:${c.cor}"></span><b>${c.nome}</b><span class="cr-cont">${c.itens.length}${extra(c)}</span></header>
      ${c.id === 'afazer' ? colAfazer(c.itens) : `<div class="cr-col-corpo">${c.itens.map(i => card(i, { mover: c.id !== 'bloqueado' })).join('') || `<p class="cr-vazio">${c.id === 'bloqueado' ? 'Nenhuma tarefa bloqueada.' : 'Nada aqui.'}</p>`}</div>`}
    </section>`).join('')}</div>`;
}

/* A fazer em faixas de prioridade (11/11/2026): Fazer agora no topo, com as
   2 vagas, depois Em seguida, Rápido e Por último. Cada faixa é um
   .cr-col-corpo próprio, então ▲▼ move dentro da faixa. */
function colAfazer(itens) {
  const vagas = () => {
    if (!est.pessoa || est.pessoa === '-') return `<p class="cr-prio-vaga leve">Até ${VAGAS_AGORA} por pessoa</p>`;
    const n = itens.filter(i => i.prio === 'agora').length;
    return n < VAGAS_AGORA ? `<p class="cr-prio-vaga">${VAGAS_AGORA - n === 1 ? 'Vaga livre' : '2 vagas livres'} — escolha ${VAGAS_AGORA - n === 1 ? 'mais uma' : 'até duas'} para "Fazer agora"</p>` : '';
  };
  return legendaPrio() + PRIO.map(p => {
    const g = itens.filter(i => prioDe(i).id === p.id);
    if (!g.length && p.id !== 'agora') return '';
    const nAgora = p.id === 'agora' ? vagas() : '';
    return `<div class="cr-prio-faixa" style="--pc:${p.cor};--pt:${p.tx}"><h4>${p.nome}${g.length ? ` <span>${g.length}</span>` : ''}</h4>
      <div class="cr-col-corpo">${g.map(i => card(i, { mover: true })).join('')}${nAgora || (!g.length ? '<p class="cr-vazio">Nenhuma tarefa aqui ainda.</p>' : '')}</div></div>`;
  }).join('');
}

/* ---------------- modo Reunião (07/11/2026, pedido dele) ----------------
   Reunião matinal de 15 minutos: uma pessoa por vez, com o que concluiu desde
   o último dia útil, o que está em andamento, o que vence hoje ou está
   atrasado e o que está bloqueado (inclusive o que depende dela). O
   cronômetro é só referência: não corta ninguém, fica vermelho quando passa.
   A ordem das pessoas fica guardada neste aparelho. */
const REU_SEG = 15 * 60;
/* 09/11/2026, pedido dele: escolher quem fica na reunião (gr.cronograma.reuFora,
   guardado no aparelho como a ordem). E a reunião é vista pela equipe toda:
   tarefa "Só eu vejo" não entra nela. */
const itensReu = () => todosItens().filter(i => !i.privada);
const reu = { fora: ler('gr.cronograma.reuFora', []), ordem: ler('gr.cronograma.reuOrdem', []), atual: null, rodando: false, acum: 0, marca: 0, porPessoa: {}, timer: null, etapa: 'inicio' };
/* Pauta da reunião (09/11/2026, a do papel na parede do escritório):
   1 Bom dia! · 2 O que tínhamos para ontem? · 3 Tivemos anomalias? ·
   4 O que temos para hoje? · 5 Bom trabalho! — às 07:00. 1 e 5 são da
   equipe toda; 2, 3 e 4 se repetem para cada pessoa. */
const PAUTA = ['Bom dia!', 'O que tínhamos para ontem?', 'Tivemos anomalias?', 'O que temos para hoje?', 'Bom trabalho!'];
const ANOMALIA = 'Anomalia é tudo que atrapalha ou dificulta o meu trabalho!';
function barraPauta() {
  const ativo = k => reu.etapa === 'inicio' ? k === 0 : reu.etapa === 'fim' ? k === 4 : k >= 1 && k <= 3;
  const feito = k => (reu.etapa === 'pessoas' && k === 0) || (reu.etapa === 'fim' && k < 4);
  return `<div class="cr-pauta"><span class="cr-pauta-hora">Pauta · 07:00</span><ol>${PAUTA.map((t, k) =>
    `<li class="${ativo(k) ? 'ativo' : ''}${feito(k) ? ' foi' : ''}"><i>${k + 1}</i>${esc(t)}</li>`).join('')}</ol></div>`;
}
const agoraS = () => Date.now() / 1000;
function trecho() { return reu.rodando ? agoraS() - reu.marca : 0; }
const tempoTotal = () => reu.acum + trecho();
const tempoDe = id => (reu.porPessoa[id] || 0) + (id === reu.atual ? trecho() : 0);
function fecharTrecho() {
  if (!reu.rodando) return;
  const t = trecho();
  reu.acum += t;
  if (reu.atual) reu.porPessoa[reu.atual] = (reu.porPessoa[reu.atual] || 0) + t;
  reu.marca = agoraS();
}
const mmss = s => { const n = Math.abs(Math.round(s)); return `${s < 0 ? '+' : ''}${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

/* "Desde ontem": na segunda, desde a sexta. */
function inicioOntem() {
  const d = new Date(); const dow = d.getDay();
  return addDias(hoje(), dow === 1 ? -3 : dow === 0 ? -2 : -1);
}
function blocosDe(id, itens) {
  const desde = inicioOntem();
  const meu = it => it.resps.includes(id);
  return {
    feitos: itens.filter(it => meu(it) && it.sit === 'feito' && (it.feitaEm || it.data) >= desde),
    naoFeitos: itens.filter(it => meu(it) && naoFeito(it) && it.sit !== 'bloqueado').sort(ordemFoco),
    focoHoje: itens.filter(it => meu(it) && it.focoEm && !naoFeito(it) && (it.sit === 'afazer' || it.sit === 'fazendo')).sort(ordemFoco),
    foco: itens.filter(it => meu(it) && it.focoEm && (it.sit === 'afazer' || it.sit === 'fazendo')).sort(ordemFoco),
    hoje: itens.filter(it => meu(it) && !it.focoEm && it.sit !== 'feito' && it.sit !== 'bloqueado' && (it.comeca || it.data) <= hoje()).sort(ordemQuadro),
    proximos: itens.filter(it => meu(it) && !it.focoEm && it.sit !== 'feito' && it.sit !== 'bloqueado' && (it.comeca || it.data) > hoje() && (it.comeca || it.data) <= addDias(hoje(), 7)).sort(ordemQuadro),
    bloq: itens.filter(it => it.sit === 'bloqueado' && (meu(it) || it.bloq?.quem === id)).sort((a, b) => (a.bloq?.desde || '').localeCompare(b.bloq?.desde || '')),
  };
}
function candidatosReuniao(itens) {
  const tem = id => { const b = blocosDe(id, itens); return b.feitos.length + b.foco.length + b.hoje.length + b.proximos.length + b.bloq.length + b.naoFeitos.length > 0; };
  return pessoasAtivas().filter(p => tem(p.id));
}
function pessoasReuniao(itens) {
  const ps = candidatosReuniao(itens).filter(p => !reu.fora.includes(p.id));
  const pos = id => { const i = reu.ordem.indexOf(id); return i < 0 ? 999 : i; };
  return ps.sort((a, b) => pos(a.id) - pos(b.id) || (a.ordem ?? 999) - (b.ordem ?? 999));
}

/* Quem fica na reunião: um botão por pessoa que tem algo; tocar tira ou põe. */
function quemFica(itens) {
  const cands = candidatosReuniao(itens);
  return `<div class="cr-reu-quem"><small>Quem fica na reunião <span>(toque para tirar ou pôr)</span></small><div>${cands.map(x => {
    const fora = reu.fora.includes(x.id);
    return `<button type="button" class="cr-reu-chip${fora ? ' fora' : ''}" data-reufica="${x.id}" aria-pressed="${!fora}">${fora ? '' : '✓ '}${esc(x.nome)}</button>`;
  }).join('')}</div></div>`;
}
function reuniao() {
  const itens = itensReu();
  const ps = pessoasReuniao(itens);
  if (!candidatosReuniao(itens).length) return barraPauta() + '<p class="cr-vazio">Ninguém do escritório tem tarefa aberta agora.</p>';
  if (!ps.length) return barraPauta() + `<section class="cr-reu-abre"><h3><i>1</i> Bom dia!</h3>${quemFica(itens)}<p class="cr-vazio">Escolha pelo menos uma pessoa para a reunião.</p></section>`;
  if (!reu.atual || !ps.some(p => p.id === reu.atual)) reu.atual = ps[0].id;
  const idx = ps.findIndex(p => p.id === reu.atual), p = ps[idx], prox = ps[idx + 1];
  const b = blocosDe(p.id, itens);
  const porPessoa = REU_SEG / ps.length;
  const resto = REU_SEG - tempoTotal();
  const dow = new Date().getDay();
  const lista = (l, vazio) => l.map(i => card(i, { semResp: true })).join('') || `<p class="cr-vazio">${vazio}</p>`;
  const sub = (t, n) => `<h5 class="cr-reu-sub">${t} <span>${n}</span></h5>`;
  const abertas = itens.filter(i => i.resps.includes(p.id) && i.sit !== 'feito');
  const lado = `<aside class="cr-reu-lado">
      <small>${reu.rodando || tempoTotal() ? 'Tempo restante' : 'Reunião de 15 minutos'}</small>
      <div class="cr-reu-relogio${resto < 0 ? ' estourou' : ''}" id="crReuRel">${mmss(resto)}</div>
      <div class="cr-reu-barra"><i id="crReuBar" style="width:${Math.min(100, tempoTotal() / REU_SEG * 100)}%"></i></div>
      <small>cerca de ${mmss(porPessoa)} por pessoa</small>
      <div class="cr-reu-ctl">
        ${reu.rodando ? '<button type="button" class="btn" id="crReuPausa">Pausar</button>'
          : `<button type="button" class="btn principal" id="crReuIni">${tempoTotal() ? 'Continuar' : 'Iniciar reunião'}</button>`}
        ${tempoTotal() ? '<button type="button" class="btn" id="crReuFim">Encerrar</button>' : ''}
      </div>
      <small>Ordem</small>
      <ol class="cr-reu-fila">${ps.map((x, k) => `<li class="${reu.etapa === 'pessoas' && x.id === p.id ? 'atual' : ''}${reu.etapa === 'fim' || (reu.etapa === 'pessoas' && k < idx) ? ' foi' : ''}">
        <button type="button" class="cr-reu-p" data-reup="${x.id}">${avatar(x.id)}<span>${esc(x.nome)}</span><em data-reut="${x.id}">${tempoDe(x.id) ? mmss(tempoDe(x.id)) : ''}</em></button>
        ${k ? `<button type="button" class="cr-reu-sobe" data-reusobe="${x.id}" aria-label="Subir ${esc(x.nome)} na ordem">↑</button>` : '<span class="cr-reu-sobe"></span>'}
      </li>`).join('')}</ol>
    </aside>`;

  // 1 · Bom dia! — visão da equipe antes de começar
  if (reu.etapa === 'inicio') {
    const linhaP = x => { const y = blocosDe(x.id, itens), at = itens.filter(i => i.resps.includes(x.id) && i.sit !== 'feito' && atrasado(i)).length;
      return `<li>${avatar(x.id)}<b>${esc(x.nome)}</b><span>${y.feitos.length} feitas · ${y.naoFeitos.length ? `<em class="cr-at">${y.naoFeitos.length} não feitas</em> · ` : ''}${at ? `<em class="cr-at">${at} atrasadas</em> · ` : ''}${y.bloq.length} bloqueadas</span></li>`; };
    return barraPauta() + `<div class="cr-reu">${lado}<div class="cr-reu-main">
      <section class="cr-reu-abre">
        <h3><i>1</i> Bom dia!</h3>
        <p>${esc(SEMANA[dow])}, ${esc(br(hoje()))} · ${ps.length} ${ps.length === 1 ? 'pessoa' : 'pessoas'} na reunião</p>
        ${quemFica(itens)}
        <ul class="cr-reu-equipe">${ps.map(linhaP).join('')}</ul>
        <p class="cr-anomalia">⚠ ${esc(ANOMALIA)}</p>
        <button type="button" class="btn principal" id="crReuComecar">Começar: ${esc(ps[0].nome)} →</button>
      </section></div></div>`;
  }

  // 5 · Bom trabalho! — fechamento
  if (reu.etapa === 'fim') {
    return barraPauta() + `<div class="cr-reu">${lado}<div class="cr-reu-main">
      <section class="cr-reu-abre fim">
        <h3><i>5</i> Bom trabalho!</h3>
        <p>Reunião em ${mmss(tempoTotal())}${tempoTotal() > REU_SEG ? ' — passou dos 15 minutos' : ''}.</p>
        <ul class="cr-reu-equipe">${ps.map(x => { const y = blocosDe(x.id, itens);
          return `<li>${avatar(x.id)}<b>${esc(x.nome)}</b><span>🎯 ${y.focoHoje.length + y.naoFeitos.length} no foco hoje${y.bloq.length ? ` · 🔒 ${y.bloq.length} anomalia${y.bloq.length > 1 ? 's' : ''} em aberto` : ''}</span></li>`; }).join('')}</ul>
        <div class="cr-reu-nav"><button type="button" class="btn" id="crReuVoltar">‹ Voltar</button>
          <button type="button" class="btn principal" data-visao="foco">Abrir o Foco do dia</button></div>
      </section></div></div>`;
  }

  // 2 · 3 · 4 — uma pessoa por vez
  return barraPauta() + `<div class="cr-reu">${lado}
    <div class="cr-reu-main">
      <div class="cr-reu-cab">${avatar(p.id, true)}
        <div><b>${esc(p.nome)}</b><small>${b.focoHoje.length + b.naoFeitos.length} no foco · ${abertas.filter(atrasado).length} atrasadas · ${b.bloq.length} bloqueadas</small></div>
        <span class="cr-reu-nav">
          ${idx ? '<button type="button" class="btn" id="crReuAnt" aria-label="Pessoa anterior">‹</button>' : '<button type="button" class="btn" id="crReuInicio" aria-label="Voltar ao Bom dia">‹</button>'}
          ${prox ? `<button type="button" class="btn principal" id="crReuProx">Próxima: ${esc(prox.nome)} →</button>`
            : '<button type="button" class="btn principal" id="crReuTermina">5 · Bom trabalho! →</button>'}
        </span>
      </div>
      <div class="cr-reu-grade">
        <section class="cr-reu-bl ok"><h4><i class="cr-reu-n">2</i> O que tínhamos para ${dow === 1 ? 'sexta' : 'ontem'}?</h4>
          ${sub('✓ Feito', b.feitos.length)}${lista(b.feitos, 'Nada concluído.')}
          ${b.naoFeitos.length ? sub('✗ Não feito — continua no foco', b.naoFeitos.length) + lista(b.naoFeitos, '') : ''}
        </section>
        <section class="cr-reu-bl bq"><h4><i class="cr-reu-n">3</i> Tivemos anomalias? <span>${b.bloq.length}</span></h4>
          <p class="cr-anomalia">${esc(ANOMALIA)}</p>
          ${lista(b.bloq, 'Nenhuma anomalia registrada.')}
          <div class="cr-reu-anom"><button type="button" class="btn" id="crReuAnom" data-pessoa="${p.id}">+ Registrar anomalia</button>
            <small>Se uma tarefa travou, use Bloquear no cartão dela.</small></div>
        </section>
        <section class="cr-reu-bl and largo"><h4><i class="cr-reu-n">4</i> O que temos para hoje?</h4>
          ${sub('🎯 No foco', b.focoHoje.length)}${lista(b.focoHoje, 'Nada no foco ainda — escolha abaixo.')}
          ${sub('📅 Vence hoje ou atrasado — puxar para o foco?', b.hoje.length)}${lista(b.hoje, 'Nada vencendo hoje.')}
          ${b.proximos.length ? `<details class="cr-reu-prox"><summary>🗓 Próximos 7 dias <span>${b.proximos.length}</span></summary>${lista(b.proximos, '')}</details>` : ''}
        </section>
      </div>
    </div>
  </div>`;
}

function tic() {
  const rel = $('crReuRel');
  if (!rel || est.visao !== 'reuniao') { clearInterval(reu.timer); reu.timer = null; return; }
  const resto = REU_SEG - tempoTotal();
  rel.textContent = mmss(resto); rel.classList.toggle('estourou', resto < 0);
  const bar = $('crReuBar'); if (bar) bar.style.width = Math.min(100, tempoTotal() / REU_SEG * 100) + '%';
  const t = alvo?.querySelector(`[data-reut="${reu.atual}"]`); if (t) t.textContent = mmss(tempoDe(reu.atual));
}
function ligarReuniao() {
  const r = alvo;
  const trocar = id => { fecharTrecho(); reu.atual = id; desenhar(); window.scrollTo?.({ top: r.offsetTop, behavior: 'smooth' }); };
  if ($('crReuIni')) $('crReuIni').onclick = () => { reu.rodando = true; reu.marca = agoraS(); desenhar(); };
  const comecar = () => { if (!reu.rodando) { reu.rodando = true; reu.marca = agoraS(); } reu.etapa = 'pessoas'; reu.atual = pessoasReuniao(itensReu())[0]?.id || null; desenhar(); };
  if ($('crReuComecar')) $('crReuComecar').onclick = comecar;
  if ($('crReuInicio')) $('crReuInicio').onclick = () => { fecharTrecho(); reu.etapa = 'inicio'; desenhar(); };
  if ($('crReuTermina')) $('crReuTermina').onclick = () => { fecharTrecho(); reu.rodando = false; reu.etapa = 'fim'; desenhar(); };
  if ($('crReuVoltar')) $('crReuVoltar').onclick = () => { reu.etapa = 'pessoas'; desenhar(); };
  if ($('crReuAnom')) $('crReuAnom').onclick = () => {
    const pid = $('crReuAnom').dataset.pessoa;
    abrirItem(null);
    const t = $('crTit'); if (t) { t.value = 'Anomalia: '; t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    const r2 = $('crRespSel'); if (r2) r2.value = pid;
    const d2 = $('crData'); if (d2) d2.value = hoje();
  };
  if ($('crReuPausa')) $('crReuPausa').onclick = () => { fecharTrecho(); reu.rodando = false; desenhar(); };
  if ($('crReuFim')) $('crReuFim').onclick = () => {
    if (!confirm('Encerrar a reunião e zerar o cronômetro?')) return;
    Object.assign(reu, { rodando: false, acum: 0, marca: 0, porPessoa: {}, atual: null, etapa: 'inicio' }); desenhar();
  };
  if ($('crReuProx')) $('crReuProx').onclick = () => { const ps = pessoasReuniao(itensReu()); const i = ps.findIndex(x => x.id === reu.atual); if (ps[i + 1]) trocar(ps[i + 1].id); };
  if ($('crReuAnt')) $('crReuAnt').onclick = () => { const ps = pessoasReuniao(itensReu()); const i = ps.findIndex(x => x.id === reu.atual); if (i > 0) trocar(ps[i - 1].id); };
  r.querySelectorAll('[data-reup]').forEach(b => b.onclick = () => { reu.etapa = 'pessoas'; trocar(b.dataset.reup); });
  r.querySelectorAll('[data-reusobe]').forEach(b => b.onclick = () => {
    const ids = pessoasReuniao(itensReu()).map(x => x.id), i = ids.indexOf(b.dataset.reusobe);
    if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; reu.ordem = ids; gravarLocal('gr.cronograma.reuOrdem', ids); desenhar(); }
  });
  r.querySelectorAll('[data-reufica]').forEach(b => b.onclick = () => {
    const id = b.dataset.reufica;
    reu.fora = reu.fora.includes(id) ? reu.fora.filter(x => x !== id) : [...reu.fora, id];
    gravarLocal('gr.cronograma.reuFora', reu.fora); desenhar();
  });
  if (!reu.timer) reu.timer = setInterval(tic, 1000);
}

/* ---------------- eventos ---------------- */
function ligarTela() {
  const r = alvo;
  r.querySelectorAll('[data-visao]').forEach(b => b.onclick = () => { est.visao = b.dataset.visao; guardarVis(); desenhar(); });
  r.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { est.filtro = b.dataset.filtro; guardarVis(); desenhar(); });
  r.querySelectorAll('[data-prazo]').forEach(b => b.onclick = () => { est.prazo = b.dataset.prazo; guardarVis(); desenhar(); });
  r.querySelectorAll('[data-mostrar]').forEach(b => b.onclick = () => { est.mostrar = b.dataset.mostrar; desenhar(); });
  r.querySelectorAll('details[data-mod]').forEach(d => d.ontoggle = () => {
    if (d.open) est.abertos.add(d.dataset.mod); else est.abertos.delete(d.dataset.mod);
    gravarLocal('gr.cronograma.modAbertos', [...est.abertos]);
  });
  r.querySelectorAll('[data-colunas]').forEach(b => b.onclick = () => { est.colunas = b.dataset.colunas; guardarVis(); desenhar(); });
  if ($('crBusca')) {
    let tm = null;
    $('crBusca').oninput = e => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        const pos = e.target.selectionStart;
        est.busca = e.target.value; desenhar();
        const b = $('crBusca'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch {} }
      }, 250);
    };
  }
  if ($('crPessoa')) $('crPessoa').onchange = e => { est.pessoa = e.target.value; desenhar(); };
  if ($('crOrigem')) $('crOrigem').onchange = e => { est.origem = e.target.value; desenhar(); };
  if ($('crArea')) $('crArea').onchange = e => { est.area = e.target.value; desenhar(); };
  if ($('crPeriodo')) $('crPeriodo').onchange = e => { est.periodo = +e.target.value; guardarVis(); desenhar(); };
  $('crAtualizar').onclick = () => carregarCronograma();
  $('crNova').onclick = () => abrirItem(null);
  if ($('crResp')) $('crResp').onclick = abrirResponsaveis;
  r.querySelectorAll('[data-mes]').forEach(b => b.onclick = () => {
    const n = +b.dataset.mes;
    if (!n) { est.mes = hoje().slice(0, 7); est.dia = hoje(); }
    else { est.mes = addMeses(est.mes + '-01', n).slice(0, 7); est.dia = est.mes + '-01'; }
    desenhar();
  });
  r.querySelectorAll('[data-mais]').forEach(b => {
    const abrir = ev => { ev.preventDefault(); ev.stopPropagation(); abrirAtalhoDia(b.dataset.mais); };
    b.onclick = abrir;
    b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') abrir(ev); };
  });
  r.querySelectorAll('[data-dia]').forEach(b => b.onclick = ev => {
    if (ev.target.closest('[data-mais]')) return;
    est.dia = b.dataset.dia;
    if (est.dia.slice(0, 7) !== est.mes) est.mes = est.dia.slice(0, 7);
    desenhar();
    if (matchMedia('(max-width: 899px)').matches) r.querySelector('.cr-lista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  r.querySelectorAll('[data-colmob]').forEach(b => b.onclick = () => { est.colMob = b.dataset.colmob; desenhar(); });
  r.querySelectorAll('[data-item]').forEach(b => b.onclick = ev => {
    const ac = ev.target.closest('[data-acao]');
    if (ac) { ev.preventDefault(); ev.stopPropagation(); acaoRapida(ac.dataset.alvo, ac.dataset.acao); return; }
    const ir = ev.target.closest('[data-ir]');
    if (ir) { ev.preventDefault(); ev.stopPropagation(); irPara(todosItens().find(x => x.chave === ir.dataset.ir)?.ir); return; }
    abrirItem(b.dataset.item);
  });
  r.querySelectorAll('[data-acao]').forEach(b => b.onkeydown = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault(); ev.stopPropagation(); acaoRapida(b.dataset.alvo, b.dataset.acao);
  });
  r.querySelectorAll('[data-ir]').forEach(b => b.onkeydown = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault(); ev.stopPropagation(); irPara(todosItens().find(x => x.chave === b.dataset.ir)?.ir);
  });

  // arrastar (computador): entre colunas muda a situação/pessoa; na mesma
  // coluna, ou ao soltar entre dois cartões, muda a ordem (estilo Trello).
  let arrastando = null;
  const limparMarca = () => r.querySelectorAll('.cr-ins').forEach(x => x.classList.remove('cr-ins'));
  const cartaoAntes = (col, y) => [...col.querySelectorAll('.cr-card[data-item]')]
    .filter(c => c.dataset.item !== arrastando)
    .find(c => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; }) || null;
  r.querySelectorAll('.cr-card[draggable]').forEach(c => {
    c.addEventListener('dragstart', ev => {
      arrastando = c.dataset.item; c.classList.add('arrastando');
      ev.dataTransfer.setData('text/plain', c.dataset.item); ev.dataTransfer.effectAllowed = 'move';
    });
    c.addEventListener('dragend', () => { c.classList.remove('arrastando'); arrastando = null; limparMarca(); r.querySelectorAll('.cr-col.alvo').forEach(x => x.classList.remove('alvo')); });
  });
  r.querySelectorAll('.cr-col').forEach(col => {
    col.addEventListener('dragover', ev => {
      if (est.visao === 'modulos') return;
      ev.preventDefault(); col.classList.add('alvo');
      if (est.visao !== 'foco') return;
      limparMarca();
      const antes = cartaoAntes(col, ev.clientY);
      (antes || col.querySelector('.cr-col-corpo'))?.classList.add('cr-ins');
    });
    col.addEventListener('dragleave', ev => { if (!col.contains(ev.relatedTarget)) { col.classList.remove('alvo'); limparMarca(); } });
    col.addEventListener('drop', async ev => {
      ev.preventDefault(); col.classList.remove('alvo'); limparMarca();
      const chave = ev.dataTransfer.getData('text/plain');
      const it = todosItens().find(x => x.chave === chave);
      if (!it) return;
      const c = col.dataset.col;
      const origem = r.querySelector(`.cr-card[data-item="${CSS.escape(chave)}"]`)?.closest('.cr-col');
      if (est.visao === 'modulos') return;   // colunas de módulo não mudam a tarefa
      if (c === 'bloqueado') { if (it.sit !== 'bloqueado') abrirBloquear(it); return; }
      if (est.visao === 'foco') {
        const antes = cartaoAntes(col, ev.clientY);
        const lista = [...col.querySelectorAll('.cr-card[data-item]')].map(x => x.dataset.item).filter(k => k !== chave);
        const i = antes ? lista.indexOf(antes.dataset.item) : lista.length;
        lista.splice(i < 0 ? lista.length : i, 0, chave);
        if (origem === col) return guardarOrdemFoco(lista);
        guardarOrdemFoco(lista, false);
      }
      if (est.colunas === 'pessoa' && est.visao === 'foco') await mudar(it, { resp: c === '-' ? null : c, foco: true });
      else await mudar(it, { sit: c, foco: true });
    });
  });
}

/* Grava a nova ordem de uma coluna do Foco do dia: a coluna vem primeiro, o
   resto mantém a ordem que já tinha (só o que ainda está no foco). */
function guardarOrdemFoco(coluna, redesenhar = true) {
  const noFoco = new Set(todosItens().filter(it => it.focoEm).map(it => it.chave));
  const pos = posFoco();
  const resto = [...noFoco].filter(k => !coluna.includes(k)).sort((a, b) => (pos.has(a) ? pos.get(a) : 1e9) - (pos.has(b) ? pos.get(b) : 1e9));
  const checks = [...coluna.filter(k => noFoco.has(k)), ...resto];
  const e = estadoDe(ORDEM_FOCO);
  const p = gravar('cron_estado', 'chave', { chave: ORDEM_FOCO, situacao: e?.situacao || 'afazer', checks });
  if (redesenhar) p.then(recado);
  return p;
}
function moverNoFoco(chave, passo) {
  const corpo = alvo?.querySelector(`.cr-card[data-item="${CSS.escape(chave)}"]`)?.closest('.cr-col-corpo');
  if (!corpo) return;
  const lista = [...corpo.querySelectorAll('.cr-card[data-item]')].map(x => x.dataset.item);
  const i = lista.indexOf(chave), j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  guardarOrdemFoco(lista);
}

function acaoRapida(chave, acao) {
  const it = todosItens().find(x => x.chave === chave);
  if (!it) return;
  if (acao === 'bloquear') return abrirBloquear(it);
  if (acao === 'liberar') return est.visao === 'foco' ? mudar(it, { sit: 'afazer', foco: true }) : mudar(it, { sit: 'afazer' });
  if (acao === 'foco') return mudar(it, { sit: it.sit === 'feito' ? 'afazer' : it.sit, foco: true });
  if (acao === 'cheio') return alert('As 2 vagas de "Fazer agora" já estão ocupadas. Conclua uma ou troque a prioridade dela antes.');
  if (acao.startsWith('foco:')) return mudar(it, { sit: it.sit === 'feito' ? 'afazer' : it.sit, foco: true, prio: acao.slice(5) });
  if (acao === 'prioMenu') { est.prioAberta = chave; desenhar(); return; }
  if (acao.startsWith('prio:')) { est.prioAberta = null; return mudar(it, { prio: acao.slice(5) }); }
  if (acao === 'tirar') return mudar(it, { foco: false });
  if (acao === 'subir') return moverNoFoco(chave, -1);
  if (acao === 'descer') return moverNoFoco(chave, 1);
  return mudar(it, { sit: acao });
}

/* Grava situação + campos que andam junto com ela:
   - Em andamento: guarda desde quando (inicio_em), se ainda não tinha;
   - Bloqueado: depende de / quem / cobrar / desde (vêm em bloq);
   - qualquer outra: limpa o bloqueio. */
function camposSit(it, novaSit, bloq, foco, prio) {
  const extra = {
    prioridade: prio !== undefined ? prio : (it.prio || null),
    // Foco do dia: entra com a data do dia; sai quando bloqueia ou quando tiram
    foco_em: foco === true ? (it.focoEm || hoje()) : foco === false || novaSit === 'bloqueado' ? null : (it.focoEm || null),
    inicio_em: novaSit === 'fazendo' ? (it.inicioEm || hoje()) : (novaSit === 'afazer' ? null : it.inicioEm || null),
    bloq_motivo: null, bloq_quem: null, bloq_cobrar: null, bloq_desde: null,
  };
  if (novaSit === 'bloqueado') {
    const b = bloq || it.bloq || {};
    Object.assign(extra, { bloq_motivo: b.motivo || null, bloq_quem: b.quem || null, bloq_cobrar: b.cobrar || null,
      bloq_desde: it.sit === 'bloqueado' ? (it.bloq?.desde || hoje()) : hoje() });
  }
  return extra;
}
async function mudar(it, { sit, resp, bloq, foco, prio }) {
  const novaSit = sit ?? it.sit, novoResp = resp === undefined ? it.explicito : resp;
  const feita = novaSit === 'feito' ? (it.sit === 'feito' ? it.feitaEm || hoje() : hoje()) : null;
  const extra = camposSit(it, novaSit, bloq, foco, prio);
  let r;
  if (!it.auto && !(it.tarefa.recorrencia && it.tarefa.recorrencia !== 'nenhuma')) {
    r = await gravar('cron_tarefas', 'id', { ...it.tarefa, situacao: novaSit, feita_em: feita, responsavel_id: novoResp, ...extra });
  } else {
    r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: novaSit, feita_em: feita, responsavel_id: novoResp, ...extra });
  }
  recado(r);
}

/* Janela "Bloquear tarefa" (07/11/2026). "Depende de" é obrigatório: é o que
   se cobra na reunião. Quem precisa agir, sendo do escritório, faz a tarefa
   aparecer também na vez dessa pessoa na reunião. "Cobrar de novo em" põe a
   tarefa no calendário daquele dia. */
function abrirBloquear(it) {
  const d = dialogo();
  const b = it.bloq || {};
  d.innerHTML = `<form method="dialog" id="crBloqForm">
    <h3>🔒 Bloquear tarefa</h3>
    <p class="cr-dlg-orig">${esc(it.titulo)} · ${esc(nomesDe(it.resps) || 'sem responsável')}</p>
    <div class="grade">
      <label class="campo plena">Depende de<input id="crBqMot" required maxlength="200" value="${esc(b.motivo || '')}" placeholder="Oficina devolver as motos"></label>
      <label class="campo">Quem precisa agir<select id="crBqQuem"><option value="">Fora da equipe</option>${pessoasAtivas().map(p => `<option value="${p.id}" ${b.quem === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="campo">Cobrar de novo em<input type="date" id="crBqCob" value="${esc(b.cobrar || addDias(hoje(), 3))}"></label>
    </div>
    <p class="cr-erro" id="crBqErro" hidden>Escreva do que a tarefa depende.</p>
    <div class="barra entre"><span></span><span class="barra">
      <button class="btn" value="cancelar" formnovalidate>Cancelar</button>
      <button type="button" class="btn principal" id="crBqOk">Bloquear</button></span></div>
  </form>`;
  d.showModal();
  $('crBqMot').oninput = () => { $('crBqErro').hidden = true; };
  $('crBqOk').onclick = async () => {
    const motivo = limpo($('crBqMot').value);
    if (!motivo) { $('crBqErro').hidden = false; $('crBqMot').focus(); return; }
    d.close();
    await mudar(it, { sit: 'bloqueado', bloq: { motivo, quem: $('crBqQuem').value || null, cobrar: $('crBqCob').value || null } });
  };
}

function recado(r) {
  const a = $('avisoGlobal');
  if (!a || r === 'ok') return;
  a.textContent = r === 'fila' ? 'Sem conexão: salvo neste aparelho, sobe sozinho quando a rede voltar.'
    : 'Você não tem permissão para gravar no Cronograma. Peça ao administrador o acesso à área.';
  a.className = 'aviso ' + (r === 'fila' ? 'info' : 'erro'); a.hidden = false;
  clearTimeout(recado.t); recado.t = setTimeout(() => { a.hidden = true; }, 6000);
}

/* ---------------- checklist da tarefa (07/11/2026) ----------------
   Marcar um item grava na hora. Primeiro item marcado → Em andamento; todos
   marcados → Concluído; desmarcar um item de tarefa concluída → Em andamento. */
function ckParaTexto(ck) {
  return (ck || []).map(g => `# ${g.g}\n` + (g.i || []).map(txtCk).join('\n')).join('\n');
}
function textoParaCk(txt, antigo) {
  const links = new Map();
  (antigo || []).forEach(g => (g.i || []).forEach(x => { if (typeof x === 'object' && x.ir) links.set(txtCk(x), x.ir); }));
  const out = [];
  for (const l of String(txt || '').split('\n').map(limpo).filter(Boolean)) {
    if (l.startsWith('#')) { out.push({ g: limpo(l.slice(1)) || 'Itens', i: [] }); continue; }
    if (!out.length) out.push({ g: 'Itens', i: [] });
    out[out.length - 1].i.push(links.has(l) ? { t: l, ir: links.get(l) } : l);
  }
  return out.filter(g => g.i.length).length ? out.filter(g => g.i.length) : null;
}
/* Checklist estilo Trello (09/11/2026, pedido dele): barra de progresso com
   %, marcar direto, "Ocultar marcados", e nas tarefas avulsas "+ Adicionar um
   item" e × para tirar um item — muda o modelo da tarefa (vale para as
   próximas vezes também). */
let ocultarMarcados = false;
/* "Adicionar um item" igual ao Trello (12/11/2026, pedido dele): botão que
   abre a caixa com Adicionar / Cancelar. Enter adiciona e a caixa continua
   aberta para o próximo; Esc ou Cancelar fecha. Colar várias linhas cria um
   item por linha. Serve à tarefa nova (rascunho) e à tarefa já lançada. */
const addTrello = gi => `<div class="cr-ckadd2" data-ckbox="${gi}">
  <button type="button" class="cr-ckabrir" data-ckabrir="${gi}">Adicionar um item</button>
  <div class="cr-ckform" hidden><textarea rows="2" maxlength="400" placeholder="Adicionar um item" data-ckadd="${gi}" aria-label="Adicionar um item"></textarea>
  <div class="cr-ckform-bts"><button type="button" class="btn principal" data-ckaddbt="${gi}">Adicionar</button><button type="button" class="cr-ckcancel" data-ckcancel="${gi}">Cancelar</button></div></div></div>`;
function abrirAddCk(raiz, gi) {
  raiz.querySelectorAll('[data-ckbox]').forEach(b => { const on = b.dataset.ckbox === String(gi); b.querySelector('.cr-ckform').hidden = !on; b.querySelector('.cr-ckabrir').hidden = on; });
  raiz.querySelector(`[data-ckadd="${gi}"]`)?.focus();
}
function fecharAddCk(raiz, gi) {
  const b = raiz.querySelector(`[data-ckbox="${gi}"]`); if (!b) return;
  b.querySelector('.cr-ckform').hidden = true; b.querySelector('.cr-ckabrir').hidden = false;
  b.querySelector('textarea').value = '';
}
const linhasCk = v => String(v || '').split('\n').map(limpo).filter(Boolean);
function ligarAddTrello(raiz, adicionar) {
  raiz.querySelectorAll('[data-ckabrir]').forEach(b => b.onclick = () => abrirAddCk(raiz, b.dataset.ckabrir));
  raiz.querySelectorAll('[data-ckcancel]').forEach(b => b.onclick = () => fecharAddCk(raiz, b.dataset.ckcancel));
  const vai = gi => {
    const ta = raiz.querySelector(`[data-ckadd="${gi}"]`), ls = linhasCk(ta?.value);
    if (!ls.length) { ta?.focus(); return; }
    adicionar(+gi, ls);
  };
  raiz.querySelectorAll('[data-ckaddbt]').forEach(b => b.onclick = () => vai(b.dataset.ckaddbt));
  raiz.querySelectorAll('[data-ckadd]').forEach(ta => ta.onkeydown = ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); vai(ta.dataset.ckadd); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fecharAddCk(raiz, ta.dataset.ckadd); }
  });
}
/* Checklist da TAREFA NOVA (12/11/2026): no lugar da caixa de texto "um item
   por linha, # é o grupo", o mesmo bloco do Trello — botão "Adicionar
   checklist", título editável, barra 0%, itens com ×, "Adicionar um item" e
   "+ Outro checklist". Fica em memória (rascunho) e grava junto no "Lançar". */
/* Clicar no texto do item edita, igual ao Trello (12/11/2026, pedido dele):
   o texto vira caixa já selecionada, com Salvar / Cancelar. Enter salva,
   Esc cancela. Caixa vazia não apaga — para tirar o item é o ×. */
function editarItemCk(span, salvar) {
  const row = span.closest('.cr-cki'); if (!row || row.classList.contains('editando')) return;
  const orig = span.textContent;
  row.classList.add('editando');
  const box = document.createElement('div'); box.className = 'cr-ckform cr-ckeditbox';
  box.innerHTML = `<textarea rows="2" maxlength="400" aria-label="Editar item"></textarea>
    <div class="cr-ckform-bts"><button type="button" class="btn principal">Salvar</button><button type="button" class="cr-ckcancel">Cancelar</button></div>`;
  const ta = box.querySelector('textarea'); ta.value = orig;
  span.hidden = true; span.after(box);
  const fechar = () => { box.remove(); span.hidden = false; row.classList.remove('editando'); };
  const ok = () => { const v = limpo(ta.value.replace(/\n+/g, ' ')); if (!v || v === orig) { fechar(); return; } salvar(v); };
  box.querySelector('.principal').onclick = ok;
  box.querySelector('.cr-ckcancel').onclick = fechar;
  ta.onkeydown = ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); ok(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); }
  };
  ta.focus(); ta.select();
}
function ligarEditarCk(raiz, attr, salvar) {
  raiz.querySelectorAll(`[${attr}]`).forEach(sp => {
    const vai = () => { const [gi, xi] = sp.getAttribute(attr).split(':').map(Number); editarItemCk(sp, v => salvar(gi, xi, v)); };
    sp.onclick = vai;
    sp.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); vai(); } };
  });
}
function htmlCkRasc(rasc) {
  if (!rasc.length) return `<button type="button" class="cr-tk-ab cr-ckr-novo" data-rnovo>☑ Adicionar checklist</button>`;
  return rasc.map((g, gi) => `<div class="cr-ckbox cr-ckr">
    <div class="cr-ckcab"><span class="cr-ckr-tit">☑ <input data-rtit="${gi}" maxlength="80" value="${esc(g.g)}" aria-label="Nome do checklist"></span>
      <button type="button" class="cr-ckocultar" data-rexc="${gi}">Excluir</button></div>
    <div class="cr-ckprog"><span>0%</span><span class="cr-ckbar g"><i style="width:0%"></i></span><span>${g.i.length ? '0/' + g.i.length : ''}</span></div>
    ${g.i.map((x, xi) => `<div class="cr-cki"><label class="cr-ckmk"><input type="checkbox" disabled></label><span class="cr-cktxt" data-red="${gi}:${xi}" role="button" tabindex="0" title="Clique para editar">${esc(txtCk(x))}</span><button type="button" class="cr-ckdel" data-rdel="${gi}:${xi}" title="Tirar este item" aria-label="Tirar este item">×</button></div>`).join('')}
    ${addTrello(gi)}
  </div>`).join('') + `<button type="button" class="cr-ckmais" data-rnovo>+ Outro checklist</button>`;
}
function ligarCkRasc(lugar, rasc) {
  const desenhar = abrir => { lugar.innerHTML = htmlCkRasc(rasc); ligarCkRasc(lugar, rasc); if (abrir != null) abrirAddCk(lugar, abrir); };
  lugar.querySelectorAll('[data-rnovo]').forEach(b => b.onclick = () => { rasc.push({ g: 'Checklist', i: [] }); desenhar(rasc.length - 1); });
  lugar.querySelectorAll('[data-rtit]').forEach(i => i.oninput = () => { rasc[+i.dataset.rtit].g = i.value; });
  lugar.querySelectorAll('[data-rtit]').forEach(i => i.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); abrirAddCk(lugar, i.dataset.rtit); } });
  lugar.querySelectorAll('[data-rexc]').forEach(b => b.onclick = () => {
    const gi = +b.dataset.rexc;
    if (rasc[gi].i.length && !confirm(`Excluir o checklist "${rasc[gi].g || 'Checklist'}" com ${rasc[gi].i.length} ${rasc[gi].i.length === 1 ? 'item' : 'itens'}?`)) return;
    rasc.splice(gi, 1); desenhar();
  });
  lugar.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { const [gi, xi] = b.dataset.rdel.split(':').map(Number); rasc[gi].i.splice(xi, 1); desenhar(gi); });
  ligarAddTrello(lugar, (gi, ls) => { rasc[gi].i.push(...ls); desenhar(gi); });
  ligarEditarCk(lugar, 'data-red', (gi, xi, v) => { rasc[gi].i[xi] = typeof rasc[gi].i[xi] === 'object' ? { ...rasc[gi].i[xi], t: v } : v; desenhar(); });
}
/* O que está no rascunho vira o checklist da tarefa; texto digitado e ainda
   não adicionado também entra (melhor que perder). */
function ckDoRascunho(lugar, rasc) {
  lugar?.querySelectorAll('[data-ckadd]').forEach(ta => { const ls = linhasCk(ta.value); if (ls.length) rasc[+ta.dataset.ckadd]?.i.push(...ls); });
  const out = rasc.filter(g => g.i.length).map(g => ({ g: limpo(g.g) || 'Checklist', i: g.i }));
  return out.length ? out : null;
}
function blocoCk(it) {
  const set = new Set(it.checks || []);
  const tot = totalCk(it), feitos = feitosCk(it), pct = tot ? Math.round(feitos / tot * 100) : 0;
  const edita = !it.auto && it.tarefa && !it.ckDoApp && !it.ckOut;
  const umGrupo = it.checklist.length === 1;
  return `<div class="cr-ckbox${ocultarMarcados ? ' oculta' : ''}" id="crCkBox">
    <div class="cr-ckcab"><b>☑ Checklist</b>
      <span class="cr-ckbts"><button type="button" class="cr-ckocultar" id="crCkOcultar">${ocultarMarcados ? 'Mostrar marcados' : 'Ocultar marcados'}</button></span></div>
    ${it.ckDoApp ? `<p class="dc-sem" style="margin:2px 0 6px">Itens do cadastro de Custo Base › Adm mensais (${esc(it.mesAdm.slice(5, 7) + '/' + it.mesAdm.slice(0, 4))}). Marcar aqui marca "Lançado" lá; para incluir ou tirar um item, use o cadastro.</p>` : ''}
    ${it.ckOut ? `<p class="dc-sem" style="margin:2px 0 6px">Fichas de ${esc(it.mesOut.slice(5, 7) + '/' + it.mesOut.slice(0, 4))} da área Outorga e Irrigação. Marcar aqui marca "Recebido" lá; para incluir ou tirar uma ficha, use Cadastros › Itens do recolhimento.</p>` : ''}
    <div class="cr-ckprog"><span id="crCkPct">${pct}%</span><span class="cr-ckbar g${pct === 100 ? ' ok' : ''}"><i id="crCkBar" style="width:${pct}%"></i></span><span id="crCkCont">${feitos}/${tot}</span></div>
    ${it.checklist.map((g, gi) => { const sem = umGrupo && (norm(g.g) === norm(it.titulo) || norm(g.g) === 'checklist'); return `<fieldset class="cr-ckg">${sem && !edita ? '' : `<legend>${sem ? '' : esc(g.g)}${edita ? ` <button type="button" class="cr-ckexc" data-ckexc="${gi}">Excluir</button>` : ''}</legend>`}
      ${(g.i || []).map((x, xi) => { const ir = irCk(x), on = set.has(chaveCk(g.g, x)); return `<div class="cr-cki${on ? ' on' : ''}">
        ${edita ? `<label class="cr-ckmk"><input type="checkbox" data-ck="${gi}:${xi}" ${on ? 'checked' : ''} aria-label="Marcar ${esc(txtCk(x))}"></label><span class="cr-cktxt" data-cked="${gi}:${xi}" role="button" tabindex="0" title="Clique para editar">${esc(txtCk(x))}</span>`
          : `<label><input type="checkbox" data-ck="${gi}:${xi}" ${on ? 'checked' : ''}><span>${esc(txtCk(x))}</span></label>`}
        ${ir && podeIr(ir) ? `<button type="button" class="cr-ir" data-ckir="${gi}:${xi}">Abrir ↗</button>` : ''}
        ${edita ? `<button type="button" class="cr-ckdel" data-ckdel="${gi}:${xi}" title="Tirar este item" aria-label="Tirar este item">×</button>` : ''}</div>`; }).join('')}
      ${edita ? addTrello(gi) : ''}
    </fieldset>`; }).join('')}</div>`;
}
/* Muda o modelo do checklist (itens) de uma tarefa avulsa e redesenha o bloco. */
async function mudarModeloCk(d, it, fn) {
  const ck = JSON.parse(JSON.stringify(it.checklist));
  fn(ck);
  const limpoCk = ck.filter(g => (g.i || []).length);
  it.checklist = limpoCk.length ? limpoCk : null;
  const r = await gravar('cron_tarefas', 'id', { ...it.tarefa, checklist: it.checklist });
  it.tarefa = { ...it.tarefa, checklist: it.checklist };
  const box = d.querySelector('#crCkBox');
  if (box && it.checklist) { box.outerHTML = blocoCk(it); ligarCk(d, it); }
  else if (box) box.remove();
  recado(r);
}
const limparLugarCk = d => { const l = d.querySelector('#tkCkLugar'); if (l) l.innerHTML = ''; };
function ligarCk(d, it) {
  if (!it?.checklist) return;
  const oc = d.querySelector('#crCkOcultar');
  if (oc) oc.onclick = () => { ocultarMarcados = !ocultarMarcados; d.querySelector('#crCkBox').classList.toggle('oculta', ocultarMarcados); oc.textContent = ocultarMarcados ? 'Mostrar marcados' : 'Ocultar marcados'; };
  d.querySelectorAll('[data-ckdel]').forEach(b => b.onclick = () => {
    const [gi, xi] = b.dataset.ckdel.split(':').map(Number);
    if (!confirm(`Tirar "${txtCk(it.checklist[gi].i[xi])}" do checklist? Vale para as próximas vezes também.`)) return;
    mudarModeloCk(d, it, ck => ck[gi].i.splice(xi, 1));
  });
  const box = d.querySelector('#crCkBox');
  if (box) ligarAddTrello(box, (gi, ls) => {
    const g = it.checklist[gi]?.g;
    mudarModeloCk(d, it, ck => ck[gi].i.push(...ls)).then(() => {
      const ngi = (it.checklist || []).findIndex(x => x.g === g);
      const nb = d.querySelector('#crCkBox'); if (nb && ngi >= 0) abrirAddCk(nb, ngi);
    });
  });
  if (box) ligarEditarCk(box, 'data-cked', (gi, xi, v) => {
    const g = it.checklist[gi], x = g.i[xi];
    const velha = chaveCk(g.g, x), nova = chaveCk(g.g, v);
    const marcado = (it.checks || []).includes(velha);
    if (marcado) {
      // o item marcado continua marcado com o texto novo
      it.checks = it.checks.map(k => k === velha ? nova : k);
      const rep = it.tarefa?.recorrencia && it.tarefa.recorrencia !== 'nenhuma';
      if (rep) { const e = estadoDe(it.chave); if (e) gravar('cron_estado', 'chave', { ...e, checks: it.checks }); }
      else it.tarefa = { ...it.tarefa, checks: it.checks };
    }
    mudarModeloCk(d, it, ck => { ck[gi].i[xi] = typeof x === 'object' ? { ...x, t: v } : v; });
  });
  d.querySelectorAll('[data-ckexc]').forEach(b => b.onclick = () => {
    const gi = +b.dataset.ckexc, g = it.checklist[gi];
    if ((g.i || []).length && !confirm(`Excluir o checklist "${g.g}" com ${g.i.length} ${g.i.length === 1 ? 'item' : 'itens'}? Vale para as próximas vezes também.`)) return;
    if (!(g.i || []).length) { it.checklist.splice(gi, 1); if (!it.checklist.length) it.checklist = null; const bx = d.querySelector('#crCkBox'); if (bx && it.checklist) { bx.outerHTML = blocoCk(it); ligarCk(d, it); } else { bx?.remove(); limparLugarCk(d); } return; }
    mudarModeloCk(d, it, ck => ck.splice(gi, 1)).then(() => { if (!it.checklist) limparLugarCk(d); });
  });
  d.querySelectorAll('[data-ckir]').forEach(b => b.onclick = () => {
    const [gi, xi] = b.dataset.ckir.split(':').map(Number);
    irPara(irCk(it.checklist[gi].i[xi]));
  });
  d.querySelectorAll('[data-ck]').forEach(c => c.onchange = async () => {
    const marcados = [];
    d.querySelectorAll('[data-ck]').forEach(x => {
      if (!x.checked) return;
      const [gi, xi] = x.dataset.ck.split(':').map(Number);
      marcados.push(chaveCk(it.checklist[gi].g, it.checklist[gi].i[xi]));
    });
    it.checks = marcados;
    if (it.ckDoApp) { const [gi, xi] = c.dataset.ck.split(':').map(Number); gravarAdm(it.mesAdm, it.checklist[gi].i[xi].id, c.checked); }
    if (it.ckOut) { const [gi, xi] = c.dataset.ck.split(':').map(Number), x = it.checklist[gi].i[xi]; if (x?.out) gravarOut(it.mesOut, x.id, c.checked); }
    c.closest('.cr-cki')?.classList.toggle('on', c.checked);
    const pct = Math.round(marcados.length / totalCk(it) * 100);
    $('crCkCont').textContent = `${marcados.length}/${totalCk(it)}`;
    $('crCkPct').textContent = pct + '%';
    $('crCkBar').style.width = pct + '%';
    $('crCkBar').parentElement.classList.toggle('ok', pct === 100);
    const todos = marcados.length === totalCk(it);
    let sit = it.sit;
    if (todos) sit = 'feito';
    else if (marcados.length && (it.sit === 'afazer' || it.sit === 'feito')) sit = 'fazendo';
    const feita = sit === 'feito' ? (it.feitaEm || hoje()) : null;
    const extra = { ...camposSit(it, sit), checks: marcados };
    const rep = it.tarefa?.recorrencia && it.tarefa.recorrencia !== 'nenhuma';
    const r = rep
      ? await gravar('cron_estado', 'chave', { chave: it.chave, situacao: sit, feita_em: feita, responsavel_id: it.explicito, ...extra })
      : await gravar('cron_tarefas', 'id', { ...it.tarefa, situacao: sit, feita_em: feita, ...extra });
    it.sit = sit; it.feitaEm = feita;
    if (todos) { d.close(); }
    recado(r);
  });
}

/* ---------------- diálogo do item / tarefa nova ---------------- */
function dialogo() {
  let d = $('dlgCron');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'dlgCron'; d.className = 'cr-dlg';
    document.body.appendChild(d);
  }
  return d;
}
const opcoesPessoas = (sel, padrao) => `<option value="">${padrao ? esc('Responsável da área — ' + padrao) : 'Sem responsável'}</option>` +
  pessoasAtivas().map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');

/* ---------------- janela da tarefa estilo Trello (09/11/2026, pedido dele) ----------------
   Tudo à mostra e editável direto: nome (toca e escreve), chips de
   Responsável / Data / Repete / Área, barra de Situação, descrição que se
   edita tocando, checklist, e a coluna da direita com "Adicionar à tarefa"
   (Checklist, Data, Repetir, Só eu vejo) e Ações (Foco do dia, Bloquear,
   Abrir a tela, Apagar). Salva na hora, sem botão Salvar. A tarefa nova
   continua no formulário de antes (abrirItem(null)), com "Lançar". */
function abrirTarefa(chave) {
  const d = dialogo();
  const it = todosItens().find(x => x.chave === chave);
  if (!it) { if (d.open) d.close(); return; }
  const t = it.tarefa || null;
  const edita = !it.auto && !!t;
  const rep = !!(t && t.recorrencia && t.recorrencia !== 'nenhuma');
  const podePriv = edita && (!t.dono_email || String(t.dono_email).toLowerCase() === meuEmail());
  const r = rotuloData(it);
  const respId = rep ? (t.responsavel_id || it.explicito || it.resp) : (it.explicito || it.resp);
  const padraoArea = nomesDe(respsDaArea(it.area, it.unid));
  const chip = (cls, rot, conteudo, extra = '') => `<span class="cr-tk-chip ${cls}"${extra}><small>${rot}</small><span>${conteudo}</span></span>`;
  const selResp = `<select id="tkResp" aria-label="Responsável">${opcoesPessoas(respId || '', padraoArea)}</select>`;
  const p = pessoa(respId);
  const repTxt = !rep ? 'Não repete' : t.recorrencia === 'semanal' ? 'Toda semana' + (textoDias(t) ? ' · ' + textoDias(t) : '') : 'Todo mês';

  d.innerHTML = `<form method="dialog" class="cr-tk" id="crTk">
    <div class="cr-tk-cab">
      <div class="cr-tk-tags">${numDe(it) ? `<span class="cr-num g">#${numDe(it)}</span>` : ''}${seloPriv(it)}${tagOrigem(it)} ${tagArea(it.area)}</div>
      ${edita ? `<input class="cr-tk-tit" id="tkTit" maxlength="160" value="${esc(t.titulo || '')}" aria-label="Nome da tarefa" title="Toque para editar o nome">`
        : `<h3 class="cr-tk-tit fixo">${esc(it.titulo)}</h3>`}
      ${edita ? '<small class="cr-tk-dica">toque no nome para editar · Enter salva</small>' : ''}
      <button type="button" class="cr-tk-x" id="tkFechar" aria-label="Fechar">×</button>
    </div>
    <div class="cr-tk-corpo">
      <div class="cr-tk-main">
        <div class="cr-tk-rot">Responsável · Data${edita ? ' · Repete · Área' : ''}</div>
        <div class="cr-tk-chips">
          <label class="cr-tk-chip sel">${avatar(respId)}<span>${esc(p ? p.nome : (padraoArea ? 'Da área — ' + padraoArea : 'Sem responsável'))} ▾</span>${selResp}</label>
          ${edita && !rep ? `<span class="cr-tk-chip data ${r.cls}" id="tkDataBt" role="button" tabindex="0">📅 ${esc(br(it.data))} · ${esc(r.txt)} ▾<input type="date" id="tkData" value="${esc(t.data || '')}" tabindex="-1" aria-label="Data"></span>`
            : `<span class="cr-tk-chip data ${r.cls} fixo">📅 ${it.comeca ? `${esc(brCurto(it.comeca))} → ${esc(brCurto(it.data))} · ${esc(r.txt.replace(/^prazo \S+ · /, '').replace(/^de \S+ a \S+$/, 'ainda não começou'))}` : `${esc(br(it.data))} · ${esc(r.txt)}`}</span>`}
          ${edita ? `<label class="cr-tk-chip sel">🔁 <span>${repTxt} ▾</span><select id="tkRep" aria-label="Repete">
              <option value="nenhuma" ${!rep ? 'selected' : ''}>Não repete</option>
              <option value="semanal" ${t.recorrencia === 'semanal' ? 'selected' : ''}>Toda semana</option>
              <option value="mensal" ${t.recorrencia === 'mensal' ? 'selected' : ''}>Todo mês</option></select></label>
            <label class="cr-tk-chip sel">🏷 <span>${esc(areaDe(t.area || 'esc').nome)} ▾</span><select id="tkArea" aria-label="Área">${Object.entries(AREAS_C).map(([k, a]) => `<option value="${k}" ${(t.area || 'esc') === k ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>` : ''}
        </div>
        ${edita && rep ? `<div class="cr-tk-rep">
            <label>Começa em <input type="date" id="tkIni" value="${esc(t.data || '')}"></label>
            <label>Até <input type="date" id="tkAte" value="${esc(t.ate || '')}"></label>
            ${t.recorrencia === 'semanal' ? `<div class="cr-dias-l"><small>Dias da semana</small>${seletorDias('tkDias', diasDe(t).length ? diasDe(t) : [dataDe(t.data).getDay()])}</div>` : ''}
            ${t.recorrencia === 'mensal' ? `<label>Prazo até o dia <input type="number" id="tkPrazo" min="1" max="31" style="width:64px" value="${esc(t.prazo_dia || '')}" placeholder="—"></label>` : ''}
            <small>O responsável vale para todas as vezes.</small></div>` : ''}

        <div class="cr-tk-rot">Situação${rep ? ' (desta vez)' : ''}</div>
        <div class="cr-tk-seg" role="group" aria-label="Situação">${Object.entries(SIT).map(([k, n]) =>
          `<button type="button" data-tksit="${k}" class="${it.sit === k ? 'on' : ''}" aria-pressed="${it.sit === k}">${it.sit === k ? '● ' : ''}${n}</button>`).join('')}</div>
        ${it.sit === 'bloqueado' ? `<p class="cr-tk-bloq">🔒 Depende de: <b>${esc(it.bloq?.motivo || 'a definir')}</b>${it.bloq?.quem ? ' · com ' + esc(pessoa(it.bloq.quem)?.nome || '') : ''}${it.bloq?.cobrar ? ' · cobrar ' + esc(brCurto(it.bloq.cobrar)) : ''} <button type="button" class="cr-tk-link" id="tkBloqEd">editar</button></p>` : ''}

        ${edita ? `<div class="cr-tk-rot">Descrição</div>
          <textarea class="cr-tk-desc" id="tkDesc" rows="2" placeholder="Toque para escrever uma descrição…">${esc(t.descricao || '')}</textarea>`
          : (it.texto ? `<div class="cr-tk-rot">Descrição</div><p class="cr-tk-desc fixo">${esc(it.texto)}</p>` : '')}
        ${it.detalhes?.length ? `<div class="cr-dlg-det"><b>${it.detalhes.length} ${(it.detRot || ['pessoa', 'pessoas'])[it.detalhes.length === 1 ? 0 : 1]}</b><ul>${it.detalhes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
        <div id="tkCkLugar">${it.checklist ? `<div class="cr-tk-rot">Checklist</div>${blocoCk(it)}` : ''}</div>
        ${it.auto ? '<p class="dica">Este item vem sozinho da área de origem e some quando ela for atualizada (exame renovado, OS concluída…). Aqui você marca o andamento e quem cuida.</p>' : ''}
      </div>
      <aside class="cr-tk-lado">
        ${edita ? `<div class="cr-tk-rot">Adicionar à tarefa</div>
          ${it.checklist ? '' : '<button type="button" class="cr-tk-ab" id="tkAddCk">☑ Checklist</button>'}
          ${!rep ? '<button type="button" class="cr-tk-ab" id="tkAddData">📅 Data</button>' : ''}
          <button type="button" class="cr-tk-ab" id="tkAddRep">🔁 Repetir</button>
          ${podePriv ? `<button type="button" class="cr-tk-ab priv${t.privada ? ' on' : ''}" id="tkPriv" aria-pressed="${!!t.privada}">👁 Só eu vejo${t.privada ? ' ✓' : ''}</button>` : ''}` : ''}
        <div class="cr-tk-rot">Ações</div>
        ${it.sit !== 'feito' && it.sit !== 'bloqueado' ? `<button type="button" class="cr-tk-ab foco${it.focoEm ? ' on' : ''}" id="tkFoco">🎯 ${it.focoEm ? 'Tirar do foco' : 'Foco do dia'}</button>` : ''}
        ${it.sit === 'bloqueado' ? '<button type="button" class="cr-tk-ab" id="tkLiberar">🔓 Liberar</button>' : it.sit !== 'feito' ? '<button type="button" class="cr-tk-ab" id="tkBloq">🔒 Bloquear</button>' : ''}
        ${podeIr(it.ir) ? `<button type="button" class="cr-tk-ab" id="tkIr">↗ ${it.auto ? `Ir para ${esc(ORIGENS[it.origem]?.nome || 'a origem')}` : 'Abrir a tela no app'}</button>` : ''}
        ${edita ? `<button type="button" class="cr-tk-ab perigo" id="tkApagar">🗑 Apagar tarefa</button>` : ''}
        <small class="cr-tk-salvo" id="tkSalvo" aria-live="polite"></small>
      </aside>
    </div>
    <div class="cr-tk-pe"><small>Tudo salva na hora, sem botão Salvar.</small><button class="btn" value="fechar">Fechar</button></div>
  </form>`;
  if (!d.open) d.showModal();
  // não abre já com o nome em edição (no celular subiria o teclado)
  if (document.activeElement && d.contains(document.activeElement)) document.activeElement.blur();

  const reabrir = (k = it.chave) => setTimeout(() => abrirTarefa(k), 0);
  const salvo = r => { const s = $('tkSalvo'); if (s) { s.textContent = r === 'ok' ? '✓ Salvo' : r === 'fila' ? '✓ Salvo neste aparelho' : ''; } recado(r); };
  // grava campos da tarefa (modelo) e devolve o resultado
  const salvarT = async patch => {
    const novo = { ...t, ...patch };
    const r = await gravar('cron_tarefas', 'id', novo);
    Object.assign(t, patch); salvo(r); return r;
  };

  $('tkFechar').onclick = () => d.close();
  ligarCk(d, it);

  // nome
  const tit = $('tkTit');
  if (tit) {
    const gravarNome = async () => { const v = limpo(tit.value); if (!v) { tit.value = t.titulo; return; } if (v !== t.titulo) await salvarT({ titulo: v }); };
    tit.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); tit.blur(); } if (ev.key === 'Escape') { tit.value = t.titulo; } };
    tit.onblur = gravarNome;
  }
  // descrição
  const desc = $('tkDesc');
  if (desc) {
    const crescer = () => { desc.style.height = 'auto'; desc.style.height = Math.min(desc.scrollHeight + 2, 320) + 'px'; };
    crescer(); desc.oninput = crescer;
    desc.onblur = async () => { const v = desc.value.trim() || null; if (v !== (t.descricao || null)) await salvarT({ descricao: v }); };
  }
  // responsável
  $('tkResp').onchange = async () => {
    const v = $('tkResp').value || null;
    if (rep) {
      await salvarT({ responsavel_id: v });
      if (estadoDe(it.chave)?.responsavel_id) await mudar(it, { resp: v });
    } else if (edita) {
      await salvarT({ responsavel_id: v });
    } else {
      await mudar(it, { resp: v });
    }
    reabrir();
  };
  // data
  const dt = $('tkData');
  if (dt) {
    $('tkDataBt').onclick = ev => { if (ev.target === dt) return; try { dt.showPicker(); } catch { dt.focus(); dt.click(); } };
    dt.onchange = async () => {
      if (!dt.value || dt.value === t.data) return;
      // adiou para depois de hoje: sai do Foco do dia (volta pelo calendário/reunião no dia)
      const adiou = dt.value > hoje() && !!t.foco_em && t.situacao !== 'feito';
      await salvarT(adiou ? { data: dt.value, foco_em: null } : { data: dt.value });
      reabrir(`t:${t.id}`);
    };
  }
  if ($('tkAddData')) $('tkAddData').onclick = () => $('tkDataBt')?.click();
  // repete / começa / até
  const rp = $('tkRep');
  if (rp) rp.onchange = async () => {
    const v = rp.value;
    await salvarT({ recorrencia: v, ate: v === 'nenhuma' ? null : t.ate || null,
      dias_semana: v === 'semanal' ? (diasDe(t).length ? diasDe(t) : [dataDe(t.data).getDay()]) : null });
    const novos = todosItens().filter(x => x.tarefa?.id === t.id).sort((a, b) => (a.data < b.data ? 1 : -1));
    reabrir(novos[0]?.chave || `t:${t.id}`);
  };
  if ($('tkAddRep')) $('tkAddRep').onclick = () => { try { rp.showPicker(); } catch { rp.focus(); } };
  if ($('tkIni')) $('tkIni').onchange = async () => {
    const v = $('tkIni').value; if (!v || v === t.data) return;
    await salvarT({ data: v });
    const novos = todosItens().filter(x => x.tarefa?.id === t.id).sort((a, b) => (a.data < b.data ? 1 : -1));
    reabrir(novos[0]?.chave || it.chave);
  };
  if ($('tkAte')) $('tkAte').onchange = async () => { await salvarT({ ate: $('tkAte').value || null }); };
  if ($('tkDias')) $('tkDias').querySelectorAll('input').forEach(c => c.onchange = async () => {
    const v = lerDias('tkDias');
    if (!v.length) { c.checked = true; return; } // pelo menos um dia
    c.closest('.cr-dia')?.classList.toggle('on', c.checked);
    await salvarT({ dias_semana: v });
    const novos = todosItens().filter(x => x.tarefa?.id === t.id).sort((a, b) => (a.data < b.data ? 1 : -1));
    reabrir(novos[0]?.chave || it.chave);
  });
  if ($('tkPrazo')) $('tkPrazo').onchange = async () => {
    const n = parseInt($('tkPrazo').value, 10);
    await salvarT({ prazo_dia: n >= 1 && n <= 31 ? n : null });
    reabrir();
  };
  // área
  if ($('tkArea')) $('tkArea').onchange = async () => { await salvarT({ area: $('tkArea').value }); reabrir(); };
  // só eu vejo
  if ($('tkPriv')) $('tkPriv').onclick = async () => {
    const on = !t.privada;
    if (!on && !confirm('Deixar a tarefa visível para a equipe toda?')) return;
    await salvarT({ privada: on, dono_email: on ? (meuEmail() || t.dono_email) : (t.dono_email || meuEmail() || null) });
    reabrir();
  };
  // situação
  d.querySelectorAll('[data-tksit]').forEach(b => b.onclick = async () => {
    const s = b.dataset.tksit;
    if (s === it.sit) return;
    if (s === 'bloqueado') { abrirBloquear(it); return; }
    await mudar(it, { sit: s });
    if (s === 'feito') { d.close(); return; }
    reabrir();
  });
  if ($('tkBloq')) $('tkBloq').onclick = () => abrirBloquear(it);
  if ($('tkBloqEd')) $('tkBloqEd').onclick = () => abrirBloquear(it);
  if ($('tkLiberar')) $('tkLiberar').onclick = async () => { await mudar(it, { sit: 'afazer' }); reabrir(); };
  if ($('tkFoco')) $('tkFoco').onclick = async () => { await mudar(it, { foco: !it.focoEm }); reabrir(); };
  if ($('tkIr')) $('tkIr').onclick = () => irPara(it.ir);
  // checklist novo
  if ($('tkAddCk')) $('tkAddCk').onclick = () => {
    it.checklist = [{ g: 'Checklist', i: [] }];
    $('tkCkLugar').innerHTML = `<div class="cr-tk-rot">Checklist</div>${blocoCk(it)}`;
    ligarCk(d, it);
    $('tkAddCk').remove();
    const bx = d.querySelector('#crCkBox'); if (bx) abrirAddCk(bx, 0);
  };
  // apagar
  if ($('tkApagar')) $('tkApagar').onclick = async () => {
    if (!confirm(rep ? 'Apagar esta tarefa e todas as repetições?' : 'Apagar esta tarefa?')) return;
    const r = await gravar('cron_tarefas', 'id', { ...t, ativo: false });
    d.close(); recado(r);
  };
}

function abrirItem(chave) {
  if (chave) return abrirTarefa(chave);
  const d = dialogo();
  const it = chave ? todosItens().find(x => x.chave === chave) : null;
  if (chave && !it) return;
  const nova = !it;
  const t = it?.tarefa || null;
  const editavel = nova || !it.auto;
  const rep = t && t.recorrencia && t.recorrencia !== 'nenhuma';
  const r = it ? rotuloData(it) : null;
  d.innerHTML = `<form method="dialog" id="crForm">
    <h3>${nova ? 'Nova tarefa' : `${numDe(it) ? `<span class="cr-num g">#${numDe(it)}</span> ` : ''}${seloPriv(it)}${esc(it.titulo)}`}</h3>
    ${it ? `<p class="cr-dlg-orig">${tagOrigem(it)} ${tagArea(it.area)} · <span class="cr-data ${r.cls}">${esc(br(it.data))} · ${esc(r.txt)}</span></p>` : ''}
    ${it?.texto && !/^rotina · /i.test(it.texto) ? `<p class="cr-dlg-txt">${esc(it.texto)}</p>` : ''}
    ${it?.checklist ? blocoCk(it) : ''}
    ${it?.detalhes?.length ? `<div class="cr-dlg-det"><b>${it.detalhes.length} ${(it.detRot || ['pessoa', 'pessoas'])[it.detalhes.length === 1 ? 0 : 1]}</b><ul>${it.detalhes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    ${editavel ? `${nova ? '' : '<details class="cr-editar"><summary>Editar tarefa (nome, data, repetição, checklist)</summary>'}<div class="grade">
      <label class="campo plena">Tarefa<input id="crTit" required maxlength="160" value="${esc(t?.titulo || '')}" placeholder="O que precisa ser feito"></label>
      <label class="campo plena">Detalhes<textarea id="crDesc" rows="2" placeholder="Opcional">${esc(t?.descricao || '')}</textarea></label>
      <div class="campo plena cr-ckr-campo">Checklist <small class="dica">(opcional)</small><div id="crCkRasc"></div></div>
      <label class="campo">${rep ? 'Começa em' : 'Data'}<input type="date" id="crData" required value="${esc(t?.data || est.dia || hoje())}"></label>
      <label class="campo">Área<select id="crAreaT">${Object.entries(AREAS_C).map(([k, a]) => `<option value="${k}" ${(t?.area || 'esc') === k ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
      <label class="campo">Repete<select id="crRep">
        <option value="nenhuma" ${!rep ? 'selected' : ''}>Não repete</option>
        <option value="semanal" ${t?.recorrencia === 'semanal' ? 'selected' : ''}>Toda semana</option>
        <option value="mensal" ${t?.recorrencia === 'mensal' ? 'selected' : ''}>Todo mês</option>
      </select></label>
      <div class="campo plena" id="crDiasCampo" ${t?.recorrencia === 'semanal' ? '' : 'hidden'}>Dias da semana${seletorDias('crDias', diasDe(t).length ? diasDe(t) : [dataDe(t?.data || est.dia || hoje()).getDay()])}</div>
      <label class="campo" id="crAteCampo" ${rep ? '' : 'hidden'}>Até (opcional)<input type="date" id="crAte" value="${esc(t?.ate || '')}"></label>
      ${nova || !t?.dono_email || String(t.dono_email).toLowerCase() === meuEmail() ? `<label class="campo plena cr-priv-campo"><span><input type="checkbox" id="crPriv" ${t?.privada ? 'checked' : ''}> <b>Só eu vejo</b> — a tarefa não aparece para mais ninguém da equipe</span></label>` : ''}
    </div>${nova ? '' : '</details>'}` : ''}
    <div class="grade">
      <label class="campo">Responsável${rep && it ? ' (só desta vez)' : ''}<select id="crRespSel">${opcoesPessoas(it ? (it.explicito || '') : '', nomesDe(respsDaArea(it ? it.area : (t?.area || 'esc'), it?.unid)))}</select></label>
      ${it ? `<div class="campo">Situação${rep ? ' (desta vez)' : ''}<div class="cr-sits">${Object.entries(SIT).map(([k, n]) =>
        `<label><input type="radio" name="crSit" value="${k}" ${it.sit === k ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>` : ''}
    </div>
    ${it ? `<div class="grade cr-bloq-campos" id="crBqCampos" ${it.sit === 'bloqueado' ? '' : 'hidden'}>
      <label class="campo plena">Depende de<input id="crBqMot" maxlength="200" value="${esc(it.bloq?.motivo || '')}" placeholder="Oficina devolver as motos"></label>
      <label class="campo">Quem precisa agir<select id="crBqQuem"><option value="">Fora da equipe</option>${pessoasAtivas().map(p => `<option value="${p.id}" ${it.bloq?.quem === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="campo">Cobrar de novo em<input type="date" id="crBqCob" value="${esc(it.bloq?.cobrar || addDias(hoje(), 3))}"></label>
    </div>
    <p class="cr-erro" id="crBqErro" hidden>Escreva do que a tarefa depende.</p>` : ''}
    ${rep && it ? `<p class="dica">Para mudar o responsável de todas as vezes, edite a tarefa e escolha em "Responsável padrão" abaixo.</p>
      <label class="campo">Responsável padrão (todas as vezes)<select id="crRespPadrao">${opcoesPessoas(t.responsavel_id, nomesDe(respsDaArea(t.area || 'esc', null)))}</select></label>` : ''}
    ${it?.auto ? '<p class="dica">Este item vem sozinho da área de origem e some quando ela for atualizada (exame renovado, OS concluída…). Aqui você marca o andamento e quem cuida.</p>' : ''}
    <div class="barra entre">
      <span class="barra">${!nova && !it.auto ? '<button type="button" class="btn perigo" id="crApagar">Apagar tarefa</button>' : ''}${it && podeIr(it.ir) ? `<button type="button" class="btn" id="crIr">${it.auto ? `Ir para ${esc(ORIGENS[it.origem]?.nome || 'a origem')}` : 'Abrir a tela no app'} ↗</button>` : ''}</span>
      <span class="barra">
        <button class="btn" value="cancelar" formnovalidate>Fechar</button>
        ${it && it.sit !== 'feito' && it.sit !== 'bloqueado' ? `<button type="button" class="btn" id="crFoco">${it.focoEm ? 'Tirar do foco' : 'Foco do dia →'}</button>` : ''}
        <button type="button" class="btn principal" id="crSalvar">${nova ? 'Lançar' : 'Salvar'}</button>
      </span>
    </div>
  </form>`;
  d.showModal();
  const rasc = JSON.parse(JSON.stringify(t?.checklist || []));
  if ($('crCkRasc')) { $('crCkRasc').innerHTML = htmlCkRasc(rasc); ligarCkRasc($('crCkRasc'), rasc); }
  if ($('crIr')) $('crIr').onclick = () => irPara(it.ir);
  ligarCk(d, it);
  if ($('crFoco')) $('crFoco').onclick = async () => { d.close(); await mudar(it, { foco: !it.focoEm }); };
  // trocar a área da tarefa mostra quem é o responsável da área
  if ($('crAreaT')) $('crAreaT').onchange = () => {
    const o = $('crRespSel').options[0], n = nomesDe(respsDaArea($('crAreaT').value, null));
    o.textContent = n ? 'Responsável da área — ' + n : 'Sem responsável';
  };
  const rep2 = $('crRep');
  if (rep2) rep2.onchange = () => { $('crAteCampo').hidden = rep2.value === 'nenhuma'; $('crDiasCampo').hidden = rep2.value !== 'semanal'; };
  if ($('crDias')) $('crDias').querySelectorAll('input').forEach(c => c.onchange = () => c.closest('.cr-dia')?.classList.toggle('on', c.checked));
  d.querySelectorAll('input[name=crSit]').forEach(x => x.onchange = () => {
    if ($('crBqCampos')) $('crBqCampos').hidden = d.querySelector('input[name=crSit]:checked')?.value !== 'bloqueado';
  });
  $('crSalvar').onclick = async () => {
    const resp = $('crRespSel').value || null;
    const sit = d.querySelector('input[name=crSit]:checked')?.value || 'afazer';
    let bloq = null;
    if (sit === 'bloqueado') {
      bloq = { motivo: limpo($('crBqMot').value), quem: $('crBqQuem').value || null, cobrar: $('crBqCob').value || null };
      if (!bloq.motivo) { $('crBqErro').hidden = false; $('crBqMot').focus(); return; }
    }
    const ext = it ? camposSit(it, sit, bloq) : {};
    let r = 'ok';
    if (editavel) {
      const titulo = limpo($('crTit').value), data = $('crData').value;
      if (!titulo || !data) { (titulo ? $('crData') : $('crTit')).focus(); return; }
      const recorrencia = $('crRep').value;
      const base = {
        id: t?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        titulo, descricao: limpo($('crDesc').value) || null, data, area: $('crAreaT').value,
        recorrencia, ate: recorrencia === 'nenhuma' ? null : ($('crAte').value || null), ativo: true,
        dias_semana: recorrencia === 'semanal' && $('crDias') ? (lerDias('crDias').length ? lerDias('crDias') : [dataDe(data).getDay()]) : null,
        responsavel_id: t?.responsavel_id ?? resp,
        situacao: t?.situacao || 'afazer', feita_em: t?.feita_em || null,
        criado_por: t?.criado_por || acesso.nome || acesso.email || null,
        privada: t?.privada || false, dono_email: t?.dono_email || meuEmail() || null,
      };
      if ($('crPriv')) {
        base.privada = $('crPriv').checked;
        if (base.privada) base.dono_email = meuEmail() || base.dono_email;
      }
      if (nova || recorrencia === 'nenhuma') base.responsavel_id = resp || (nova ? vincTexto(titulo) : null);
      if ($('crRespPadrao')) base.responsavel_id = $('crRespPadrao').value || null;
      base.checklist = ckDoRascunho($('crCkRasc'), rasc);
      if (!nova && recorrencia === 'nenhuma') { base.situacao = sit; base.feita_em = sit === 'feito' ? (t.feita_em || hoje()) : null; Object.assign(base, ext);
        // data adiada para depois de hoje tira do Foco do dia
        if (data !== t.data && data > hoje() && sit !== 'feito') base.foco_em = null; }
      r = await gravar('cron_tarefas', 'id', base);
      if (!nova && rep && it) {
        // ocorrência desta vez
        const e = estadoDe(it.chave);
        if (sit !== it.sit || resp !== it.explicito || e || bloq)
          r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: sit, responsavel_id: resp,
            feita_em: sit === 'feito' ? (it.feitaEm || hoje()) : null, ...ext });
      }
    } else {
      r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: sit, responsavel_id: resp,
        feita_em: sit === 'feito' ? (it.feitaEm || hoje()) : null, ...ext });
    }
    d.close();
    recado(r);
  };
  const ap = $('crApagar');
  if (ap) ap.onclick = async () => {
    if (!confirm(rep ? 'Apagar esta tarefa e todas as repetições?' : 'Apagar esta tarefa?')) return;
    const r = await gravar('cron_tarefas', 'id', { ...t, ativo: false });
    d.close(); recado(r);
  };
}

/* ---------------- responsáveis por área e por origem (admin) ---------------- */
function abrirResponsaveis() {
  const d = dialogo();
  const atual = responsaveisPadrao();
  const porArea = respAreaCfg();
  const ps = pessoasAtivas();
  d.innerHTML = `<form method="dialog">
    <h3>Quem cuida de cada área</h3>
    <p class="dica">Os itens automáticos e as tarefas lançadas sem responsável vão para estas pessoas. Máquinas e DP se dividem por unidade (Matriz e Quebra Cocão). Com duas pessoas marcadas, o item aparece para as duas. No card dá para trocar caso a caso.</p>
    <div class="cr-resp-lista">
      ${LINHAS_AREA.map(([a, u]) => {
        const k = u ? `${a}@${u}` : a, sel = porArea[k] || [];
        return `<div class="campo cr-resp-linha"><span>${tagArea(a)}${u ? ' ' + esc(u) : ''}</span>
          <span class="cr-resp-pessoas">${ps.map(p => `<label><input type="checkbox" data-area="${esc(k)}" value="${esc(p.id)}" ${sel.includes(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('')}</span></div>`;
      }).join('')}
    </div>
    <details class="cr-resp-exc"><summary>Exceção por origem (opcional)</summary>
      <p class="dica">Só quando uma origem precisa de alguém diferente do responsável da área dela.</p>
      <div class="cr-resp-lista">
      ${Object.entries(ORIGENS).map(([k, o]) => `<label class="campo cr-resp-linha">
        <span>${tagArea(o.area)} ${esc(o.nome)}</span>
        <select data-origem="${k}">${opcoesPessoas(atual[k] || '', 'mesmo da área')}</select></label>`).join('')}
      </div>
    </details>
    <div class="barra entre"><span></span><span class="barra">
      <button class="btn" value="cancelar" formnovalidate>Fechar</button>
      <button type="button" class="btn principal" id="crRespSalvar">Salvar</button></span></div>
  </form>`;
  d.showModal();
  $('crRespSalvar').onclick = async () => {
    const valor = {}, area = {};
    d.querySelectorAll('select[data-origem]').forEach(s => { if (s.value) valor[s.dataset.origem] = s.value; });
    d.querySelectorAll('input[data-area]').forEach(c => {
      area[c.dataset.area] = area[c.dataset.area] || [];
      if (c.checked) area[c.dataset.area].push(c.value);
    });
    let r = await gravar('cron_config', 'chave', { chave: 'responsaveis', valor });
    const r2 = await gravar('cron_config', 'chave', { chave: 'responsaveis_area', valor: area });
    if (r2 !== 'ok') r = r2;
    d.close(); recado(r);
  };
}
