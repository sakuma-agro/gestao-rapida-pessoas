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
// escritório → o responsável padrão da origem (cron_config 'responsaveis').
//
// Offline (regra do app): tudo fica em cache; gravação sem rede entra numa
// fila e sobe sozinha quando a rede voltar.

import { estado, gravarLocal } from './store.js';
import { acesso } from './acesso.js';

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
};
const areaDe = k => AREAS_C[k] || AREAS_C.esc;

/* Origens automáticas — a chave é a usada em cron_config 'responsaveis'. */
const ORIGENS = {
  'sst-exames': { nome: 'SST › Exames', area: 'sst' },
  'sst-trein':  { nome: 'SST › Treinamentos', area: 'sst' },
  'sst-ca':     { nome: 'SST › EPI\'s (validade do C.A)', area: 'sst' },
  'sst-acid':   { nome: 'SST › Acidentes (medidas)', area: 'sst' },
  'dp-tarefas': { nome: 'Cadastros › Admissão e demissão', area: 'dp' },
  'dp-ferias':  { nome: 'DP › Férias (prazo de concessão)', area: 'dp' },
  'maq-os':     { nome: 'Máquinas › Ordens de serviço', area: 'maq' },
  'maq-ck':     { nome: 'Máquinas › Check list', area: 'maq' },
  'vist-ext':   { nome: 'Vistorias › Extintores', area: 'vist' },
  'vist-pend':  { nome: 'Vistorias › Anomalias em aberto', area: 'vist' },
  'cert-req':   { nome: 'Certificação › Requisitos', area: 'cert' },
  'cert-aud':   { nome: 'Certificação › Auditorias e certificados', area: 'cert' },
  'cert-acoes': { nome: 'Certificação › Ações de melhoria', area: 'cert' },
  'proj':       { nome: 'Projetos (PMBOK)', area: 'proj' },
  'rh-sd':      { nome: 'RH › Salário digno (planos de ação)', area: 'rh' },
  'reuniao':    { nome: 'Reunião semanal › Atividades do escritório', area: 'esc' },
};

const SIT = { afazer: 'A fazer', fazendo: 'Fazendo', feito: 'Feito' };

/* ---------------- dados ---------------- */
const dados = {
  pessoas: [], tarefas: [], estados: [], config: [], auto: [],
  em: null, carregando: false, falhas: [],
};
(() => { const c = ler(CACHE, null); if (c) Object.assign(dados, c, { carregando: false }); })();
const salvarCache = () => gravarLocal(CACHE, {
  pessoas: dados.pessoas, tarefas: dados.tarefas, estados: dados.estados,
  config: dados.config, auto: dados.auto, em: dados.em,
});

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
const estadoDe = chave => dados.estados.find(e => e.chave === chave) || null;

/* ---------------- fontes automáticas ---------------- */
const cli = () => estado.cliente;
const nomeFunc = id => estado.funcionarios.find(f => f.id === id)?.nome || '';
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

const FONTES = [
  ['sst-exames', () => deVencimentos('sst_exames', 'sst_tipos_exame', 'sst-exames', 'Exame')],
  ['sst-trein', () => deVencimentos('sst_treinamentos', 'sst_tipos_treinamento', 'sst-trein', 'Treinamento')],
  ['sst-ca', async () => (await pegar(cli().from('epis').select('id,descricao,ca,ca_validade,ativo')))
    .filter(e => e.ativo !== false && naJanela(e.ca_validade))
    .map(e => ({ chave: `sst-ca:${e.id}:${e.ca_validade}`, origem: 'sst-ca', data: e.ca_validade,
      titulo: `C.A ${e.ca || ''} vence — ${e.descricao}` }))],
  ['sst-acid', async () => (await pegar(cli().from('sst_acidentes').select('id,funcionario_id,data,medidas,medidas_responsavel,medidas_prazo,situacao')))
    .filter(a => naJanela(a.medidas_prazo) && !resolvido(a.situacao))
    .map(a => ({ chave: `sst-acid:${a.id}:${a.medidas_prazo}`, origem: 'sst-acid', data: a.medidas_prazo,
      titulo: `Medidas do acidente de ${br(a.data)} — ${nomeFunc(a.funcionario_id) || 'funcionário'}`,
      texto: a.medidas, respTexto: a.medidas_responsavel }))],
  ['dp-tarefas', async () => (await pegar(cli().from('jor_tarefas').select('chave,funcionario_id,evento,titulo,prazo,situacao')))
    .filter(t => t.prazo && naJanela(t.prazo) && !resolvido(t.situacao) && t.situacao !== 'dispensada')
    .map(t => ({ chave: `dp-tarefas:${t.chave}:${t.prazo}`, origem: 'dp-tarefas', data: t.prazo,
      titulo: `${t.titulo} — ${nomeFunc(t.funcionario_id) || 'funcionário'}`,
      texto: t.evento ? `Tarefa de ${t.evento}` : '' }))],
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
        titulo: `Prazo para conceder férias — ${x.f.nome}`,
        texto: `Período aquisitivo ${br(x.p.iniAq)} a ${br(x.p.fimAq)} · saldo de ${x.p.saldo} dias` }));
  }],
  ['maq-os', async () => {
    const sc = cli().schema('manutencao');
    const [os, eq] = await Promise.all([
      pegar(sc.from('ordens_servico').select('id,numero,equipamento_id,prazo,status,descricao,tipo')),
      pegar(sc.from('equipamentos').select('id,codigo,descricao,apelido')),
    ]);
    const nomeEq = id => { const e = eq.find(x => x.id === id); return e ? [e.codigo, e.apelido || e.descricao].filter(Boolean).join(' · ') : ''; };
    return os.filter(o => ['ABERTA', 'EM_EXECUCAO'].includes(o.status) && naJanela(o.prazo))
      .map(o => ({ chave: `maq-os:${o.id}:${o.prazo}`, origem: 'maq-os', data: o.prazo,
        titulo: `OS ${o.numero || ''} — ${nomeEq(o.equipamento_id) || 'equipamento'}`,
        texto: [o.status === 'EM_EXECUCAO' ? 'Em execução' : 'Aberta', o.descricao].filter(Boolean).join(' · ') }));
  }],
  ['maq-ck', async () => {
    const sc = cli().schema('manutencao');
    const [ck, eq] = await Promise.all([
      pegar(sc.from('checklists').select('equipamento_id,data_verificacao,proximo_vencimento')),
      pegar(sc.from('equipamentos').select('id,codigo,descricao,apelido,ativo')),
    ]);
    const ult = new Map();
    for (const c of ck) {
      const u = ult.get(c.equipamento_id);
      if (!u || (c.data_verificacao || '') > (u.data_verificacao || '')) ult.set(c.equipamento_id, c);
    }
    return [...ult.values()].filter(c => naJanela(c.proximo_vencimento)).map(c => {
      const e = eq.find(x => x.id === c.equipamento_id);
      if (e && e.ativo === false) return null;
      return { chave: `maq-ck:${c.equipamento_id}:${c.proximo_vencimento}`, origem: 'maq-ck', data: c.proximo_vencimento,
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
    for (const o of oc) if (vivos.has(o.projeto_id) && o.ativo !== false && !o.resolvida_em && !resolvido(o.situacao) && naJanela(o.prazo))
      out.push({ chave: `proj:o:${o.id}:${o.prazo}`, origem: 'proj', data: o.prazo, titulo: `Problema: ${o.descricao || ''} — ${nomeP(o.projeto_id)}`, respTexto: o.responsavel });
    return out;
  }],
  ['rh-sd', async () => (await pegar(cli().from('rh_sd_planos').select('id,descricao,tipo_acao,responsavel,prazo,situacao,concluido_em')))
    .filter(p => naJanela(p.prazo) && !p.concluido_em && !resolvido(p.situacao))
    .map(p => ({ chave: `rh-sd:${p.id}:${p.prazo}`, origem: 'rh-sd', data: p.prazo,
      titulo: `Salário digno: ${p.descricao || p.tipo_acao || 'plano de ação'}`, respTexto: p.responsavel }))],
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
  } catch (e) {
    console.warn('[Cronograma] não carregou tudo', e);
  } finally {
    dados.carregando = false; avisar();
  }
}

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
  if (tabela === 'cron_config') delete item.atualizado_por;
  // vale na tela na hora
  const lista = tabela === 'cron_tarefas' ? dados.tarefas : tabela === 'cron_estado' ? dados.estados : dados.config;
  const i = lista.findIndex(x => x[chaveCol] === item[chaveCol]);
  if (i >= 0) lista[i] = { ...lista[i], ...item }; else lista.push(item);
  if (tabela === 'cron_tarefas' && item.ativo === false) dados.tarefas = dados.tarefas.filter(t => t.id !== item.id);
  salvarCache(); avisar();
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
function ocorrencias(t) {
  const ini = addDias(hoje(), -JANELA_ATRAS), fim = addDias(hoje(), JANELA_FRENTE);
  if (t.recorrencia === 'nenhuma' || !t.recorrencia) return [t.data];
  const out = [];
  let d = t.data;
  for (let k = 0; k < 400 && d <= fim && (!t.ate || d <= t.ate); k++) {
    if (d >= ini) out.push(d);
    d = t.recorrencia === 'semanal' ? addDias(t.data, 7 * (k + 1)) : addMeses(t.data, k + 1);
  }
  return out;
}

function todosItens() {
  const padrao = responsaveisPadrao();
  const itens = [];
  for (const a of dados.auto) {
    const o = ORIGENS[a.origem] || { nome: a.origem, area: 'esc' };
    const e = estadoDe(a.chave);
    const resp = e?.responsavel_id || a.respId || pessoaPorTexto(a.respTexto)?.id || padrao[a.origem] || null;
    let sit = e?.situacao || (a.feitoNaOrigem ? 'feito' : 'afazer');
    itens.push({ ...a, area: o.area, origemNome: o.nome, auto: true, resp, sit, feitaEm: e?.feita_em || null });
  }
  for (const t of dados.tarefas) {
    if (t.ativo === false) continue;
    const rep = t.recorrencia && t.recorrencia !== 'nenhuma';
    for (const d of ocorrencias(t)) {
      const chave = rep ? `t:${t.id}:${d}` : `t:${t.id}`;
      const e = rep ? estadoDe(chave) : null;
      itens.push({
        chave, tarefa: t, data: d, titulo: t.titulo, texto: t.descricao, area: t.area || 'esc',
        origemNome: rep ? (t.recorrencia === 'semanal' ? 'Tarefa · toda semana' : 'Tarefa · todo mês') : 'Tarefa',
        auto: false, resp: (e?.responsavel_id) || t.responsavel_id || null,
        sit: rep ? (e?.situacao || 'afazer') : (t.situacao || 'afazer'),
        feitaEm: rep ? e?.feita_em : t.feita_em,
      });
    }
  }
  return itens;
}
const atrasado = it => it.sit !== 'feito' && it.data < hoje();

/* ---------------- tela ---------------- */
const vis = ler('gr.cronograma.vis', null) || {};
const est = {
  visao: vis.visao || 'calendario',     // calendario | kanban
  colunas: vis.colunas || 'situacao',   // situacao | pessoa
  filtro: vis.filtro || 'todos',        // todos | minhas
  pessoa: '', area: '',
  periodo: vis.periodo || 30,
  mes: hoje().slice(0, 7), dia: hoje(),
};
const guardarVis = () => gravarLocal('gr.cronograma.vis', { visao: est.visao, colunas: est.colunas, filtro: est.filtro, periodo: est.periodo });

let alvo = null;
let ligado = false;

export function abrirCronograma(el) {
  alvo = el;
  if (!ligado) { ligado = true; ouvintes.add(() => { if (alvo && !alvo.closest('[hidden]')) desenhar(); }); }
  desenhar();
  carregarCronograma();
}

function filtrados() {
  const meu = eu();
  return todosItens().filter(it => {
    if (est.filtro === 'minhas' && (!meu || it.resp !== meu.id)) return false;
    if (est.pessoa === '-' && it.resp) return false;
    if (est.pessoa && est.pessoa !== '-' && it.resp !== est.pessoa) return false;
    if (est.area && it.area !== est.area) return false;
    return true;
  });
}

const tagArea = a => `<span class="cr-tag" style="background:${areaDe(a).cor}">${esc(areaDe(a).nome)}</span>`;
const avatar = (id, grande) => {
  const p = pessoa(id);
  return `<span class="cr-av${grande ? ' g' : ''}${p ? '' : ' cr-ninguem'}" title="${esc(p ? p.nome : 'Sem responsável')}">${esc(iniciais(p))}</span>`;
};
function rotuloData(it) {
  if (it.sit === 'feito') return { txt: it.feitaEm ? 'feito ' + brCurto(it.feitaEm) : brCurto(it.data), cls: 'ok' };
  const n = diasAte(it.data);
  if (n < 0) return { txt: n === -1 ? 'venceu ontem' : `${-n} dias atrasado`, cls: 'atraso' };
  if (n === 0) return { txt: 'hoje', cls: 'hoje' };
  if (n === 1) return { txt: 'amanhã', cls: '' };
  return { txt: `${SEMANA[dataDe(it.data).getDay()].toLowerCase()} ${brCurto(it.data)}`, cls: '' };
}

function desenhar() {
  if (!alvo) return;
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
        <h2>Cronograma geral</h2>
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
      <button type="button" role="tab" data-visao="kanban" aria-selected="${est.visao === 'kanban'}">Kanban</button>
    </div>
    <div class="cr-filtros">
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
      ${est.visao === 'kanban' ? `
        <span class="cr-sep">Colunas por:</span>
        <button type="button" class="cr-chip" data-colunas="situacao" aria-pressed="${est.colunas === 'situacao'}">Situação</button>
        <button type="button" class="cr-chip" data-colunas="pessoa" aria-pressed="${est.colunas === 'pessoa'}">Pessoa</button>
        <select id="crPeriodo" aria-label="Período">
          ${[7, 30, 90].map(n => `<option value="${n}" ${+est.periodo === n ? 'selected' : ''}>Até ${n} dias</option>`).join('')}
        </select>` : ''}
    </div>
    <div id="crCorpo">${est.visao === 'kanban' ? kanban() : calendario()}</div>
    <div class="cr-legenda">${Object.values(AREAS_C).map(a => `<span><i style="background:${a.cor}"></i>${esc(a.nome)}</span>`).join('')}
      <span class="cr-auto-leg">⟳ automático = vem sozinho de outra área</span></div>
  </div>`;
  ligarTela();
}

function calendario() {
  const itens = filtrados();
  const [a, m] = est.mes.split('-').map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const ini = new Date(primeiro); ini.setDate(1 - primeiro.getDay());
  const ult = new Date(a, m, 0);
  const fim = new Date(ult); fim.setDate(ult.getDate() + (6 - ult.getDay()));
  const porDia = new Map();
  for (const it of itens) { if (!porDia.has(it.data)) porDia.set(it.data, []); porDia.get(it.data).push(it); }
  let cel = '';
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const s = iso(d), fora = d.getMonth() !== m - 1;
    const l = porDia.get(s) || [];
    const temAtraso = l.some(atrasado);
    const areas = [...new Set(l.filter(x => x.sit !== 'feito').map(x => x.area))].slice(0, 4);
    const cls = ['cr-dia', fora ? 'fora' : '', s === hoje() ? 'hoje' : '', s === est.dia ? 'sel' : '', temAtraso ? 'atraso' : ''].filter(Boolean).join(' ');
    cel += `<button type="button" class="${cls}" data-dia="${s}" aria-label="${br(s)}: ${l.length} itens">
      <span class="n">${d.getDate()}</span>
      <span class="pts">${areas.map(k => `<i style="background:${areaDe(k).cor}"></i>`).join('')}</span>
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
      <div class="cr-lista-cab"><b>${titulo}</b><span>${doDia.length} ${doDia.length === 1 ? 'item' : 'itens'}</span></div>
      ${doDia.length ? doDia.map(linha).join('') : '<p class="cr-vazio">Nada neste dia.</p>'}
    </div>
  </div>`;
}
const ordemItens = (a, b) => (a.sit === 'feito') - (b.sit === 'feito') || a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, 'pt-BR');

function linha(it) {
  const r = rotuloData(it);
  return `<button type="button" class="cr-item${it.sit === 'feito' ? ' feito' : ''}" data-item="${esc(it.chave)}">
    <span class="cr-barra" style="background:${areaDe(it.area).cor}"></span>
    <span class="cr-item-txt"><b>${esc(it.titulo)}</b><small>${esc(it.origemNome)}${it.auto ? ' · automático' : ''}${it.sit === 'fazendo' ? ' · fazendo' : ''}</small></span>
    <span class="cr-item-dir">${avatar(it.resp)}<span class="cr-data ${r.cls}">${esc(r.txt)}</span></span>
  </button>`;
}

function card(it, { semResp = false, comSit = false } = {}) {
  const r = rotuloData(it);
  return `<button type="button" class="cr-card" draggable="true" data-item="${esc(it.chave)}">
    <span class="cr-card-top">${tagArea(it.area)}${comSit ? `<span class="cr-sit ${it.sit}${atrasado(it) ? ' atraso' : ''}">${atrasado(it) && it.sit === 'afazer' ? 'Atrasado' : SIT[it.sit]}</span>` : (it.auto ? '<span class="cr-auto">⟳ automático</span>' : '')}</span>
    <b>${esc(it.titulo)}</b>
    <span class="cr-card-pe"><span class="cr-data ${r.cls}">${esc(r.txt)}</span>${semResp ? '' : avatar(it.resp)}</span>
  </button>`;
}

function kanban() {
  const limite = addDias(hoje(), +est.periodo);
  const corte = addDias(hoje(), -30);
  const itens = filtrados().filter(it => it.sit === 'feito' ? (it.feitaEm || it.data) >= corte : it.data <= limite).sort(ordemItens);
  let cols;
  if (est.colunas === 'pessoa') {
    const ps = pessoasAtivas();
    cols = [...ps.map(p => ({ id: p.id, nome: p.nome, cab: avatar(p.id, true), itens: itens.filter(i => i.resp === p.id && i.sit !== 'feito') })),
      { id: '-', nome: 'Sem responsável', cab: avatar(null, true), itens: itens.filter(i => (!i.resp || !pessoa(i.resp)) && i.sit !== 'feito') }]
      .filter(c => c.id !== '-' || c.itens.length);
    return `<div class="cr-quadro">${cols.map(c => {
      const at = c.itens.filter(atrasado).length;
      return `<section class="cr-col" data-col="${c.id}">
        <header class="cr-col-cab pessoa">${c.cab}<span class="cr-quem"><b>${esc(c.nome)}</b><small>${c.itens.length} ${c.itens.length === 1 ? 'item' : 'itens'}${at ? ` · ${at} atrasado${at > 1 ? 's' : ''}` : ''}</small></span></header>
        <div class="cr-col-corpo">${c.itens.map(i => card(i, { semResp: true, comSit: true })).join('') || '<p class="cr-vazio">Nada pendente.</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  }
  cols = [
    { id: 'atrasado', nome: 'Atrasado', cor: '#B42318', itens: itens.filter(i => i.sit === 'afazer' && atrasado(i)) },
    { id: 'afazer', nome: 'A fazer', cor: '#51534A', itens: itens.filter(i => i.sit === 'afazer' && !atrasado(i)) },
    { id: 'fazendo', nome: 'Fazendo', cor: '#2F6FB0', itens: itens.filter(i => i.sit === 'fazendo') },
    { id: 'feito', nome: 'Feito (últimos 30 dias)', cor: '#5E8A00', itens: itens.filter(i => i.sit === 'feito') },
  ];
  return `<div class="cr-quadro">${cols.map(c => `<section class="cr-col" data-col="${c.id}">
      <header class="cr-col-cab"><span class="cr-pt" style="background:${c.cor}"></span><b>${c.nome}</b><span class="cr-cont">${c.itens.length}</span></header>
      <div class="cr-col-corpo">${c.itens.map(i => card(i)).join('') || '<p class="cr-vazio">Nada aqui.</p>'}</div>
    </section>`).join('')}</div>`;
}

/* ---------------- eventos ---------------- */
function ligarTela() {
  const r = alvo;
  r.querySelectorAll('[data-visao]').forEach(b => b.onclick = () => { est.visao = b.dataset.visao; guardarVis(); desenhar(); });
  r.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { est.filtro = b.dataset.filtro; guardarVis(); desenhar(); });
  r.querySelectorAll('[data-colunas]').forEach(b => b.onclick = () => { est.colunas = b.dataset.colunas; guardarVis(); desenhar(); });
  $('crPessoa').onchange = e => { est.pessoa = e.target.value; desenhar(); };
  $('crArea').onchange = e => { est.area = e.target.value; desenhar(); };
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
  r.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => {
    est.dia = b.dataset.dia;
    if (est.dia.slice(0, 7) !== est.mes) est.mes = est.dia.slice(0, 7);
    desenhar();
    if (matchMedia('(max-width: 899px)').matches) r.querySelector('.cr-lista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  r.querySelectorAll('[data-item]').forEach(b => b.onclick = () => abrirItem(b.dataset.item));

  // arrastar entre colunas (computador)
  r.querySelectorAll('.cr-card[draggable]').forEach(c => c.addEventListener('dragstart', ev => {
    ev.dataTransfer.setData('text/plain', c.dataset.item); ev.dataTransfer.effectAllowed = 'move';
  }));
  r.querySelectorAll('.cr-col').forEach(col => {
    col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('alvo'); });
    col.addEventListener('dragleave', () => col.classList.remove('alvo'));
    col.addEventListener('drop', async ev => {
      ev.preventDefault(); col.classList.remove('alvo');
      const it = todosItens().find(x => x.chave === ev.dataTransfer.getData('text/plain'));
      if (!it) return;
      const c = col.dataset.col;
      if (est.colunas === 'pessoa' && est.visao === 'kanban') await mudar(it, { resp: c === '-' ? null : c });
      else await mudar(it, { sit: c === 'atrasado' ? 'afazer' : c });
    });
  });
}

async function mudar(it, { sit, resp }) {
  const novaSit = sit ?? it.sit, novoResp = resp === undefined ? it.resp : resp;
  const feita = novaSit === 'feito' ? (it.sit === 'feito' ? it.feitaEm || hoje() : hoje()) : null;
  let r;
  if (!it.auto && !(it.tarefa.recorrencia && it.tarefa.recorrencia !== 'nenhuma')) {
    r = await gravar('cron_tarefas', 'id', { ...it.tarefa, situacao: novaSit, feita_em: feita, responsavel_id: novoResp });
  } else {
    r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: novaSit, feita_em: feita, responsavel_id: novoResp });
  }
  recado(r);
}

function recado(r) {
  const a = $('avisoGlobal');
  if (!a || r === 'ok') return;
  a.textContent = r === 'fila' ? 'Sem conexão: salvo neste aparelho, sobe sozinho quando a rede voltar.'
    : 'Você não tem permissão para gravar no Cronograma. Peça ao administrador o acesso à área.';
  a.className = 'aviso ' + (r === 'fila' ? 'info' : 'erro'); a.hidden = false;
  clearTimeout(recado.t); recado.t = setTimeout(() => { a.hidden = true; }, 6000);
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
const opcoesPessoas = sel => `<option value="">Sem responsável</option>` +
  pessoasAtivas().map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');

function abrirItem(chave) {
  const d = dialogo();
  const it = chave ? todosItens().find(x => x.chave === chave) : null;
  if (chave && !it) return;
  const nova = !it;
  const t = it?.tarefa || null;
  const editavel = nova || !it.auto;
  const rep = t && t.recorrencia && t.recorrencia !== 'nenhuma';
  const r = it ? rotuloData(it) : null;
  d.innerHTML = `<form method="dialog" id="crForm">
    <h3>${nova ? 'Nova tarefa' : esc(it.titulo)}</h3>
    ${it ? `<p class="cr-dlg-orig">${tagArea(it.area)} ${esc(it.origemNome)}${it.auto ? ' · automático' : ''} · <span class="cr-data ${r.cls}">${esc(br(it.data))} · ${esc(r.txt)}</span></p>` : ''}
    ${it?.texto ? `<p class="cr-dlg-txt">${esc(it.texto)}</p>` : ''}
    ${it?.detalhes?.length ? `<div class="cr-dlg-det"><b>${it.detalhes.length} ${it.detalhes.length === 1 ? 'pessoa' : 'pessoas'}</b><ul>${it.detalhes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    ${editavel ? `<div class="grade">
      <label class="campo plena">Tarefa<input id="crTit" required maxlength="160" value="${esc(t?.titulo || '')}" placeholder="O que precisa ser feito"></label>
      <label class="campo plena">Detalhes<textarea id="crDesc" rows="2" placeholder="Opcional">${esc(t?.descricao || '')}</textarea></label>
      <label class="campo">${rep ? 'Começa em' : 'Data'}<input type="date" id="crData" required value="${esc(t?.data || est.dia || hoje())}"></label>
      <label class="campo">Área<select id="crAreaT">${Object.entries(AREAS_C).map(([k, a]) => `<option value="${k}" ${(t?.area || 'esc') === k ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
      <label class="campo">Repete<select id="crRep">
        <option value="nenhuma" ${!rep ? 'selected' : ''}>Não repete</option>
        <option value="semanal" ${t?.recorrencia === 'semanal' ? 'selected' : ''}>Toda semana</option>
        <option value="mensal" ${t?.recorrencia === 'mensal' ? 'selected' : ''}>Todo mês</option>
      </select></label>
      <label class="campo" id="crAteCampo" ${rep ? '' : 'hidden'}>Até (opcional)<input type="date" id="crAte" value="${esc(t?.ate || '')}"></label>
    </div>` : ''}
    <div class="grade">
      <label class="campo">Responsável${rep && it ? ' (só desta vez)' : ''}<select id="crRespSel">${opcoesPessoas(it ? it.resp : (eu()?.id || ''))}</select></label>
      ${it ? `<div class="campo">Situação${rep ? ' (desta vez)' : ''}<div class="cr-sits">${Object.entries(SIT).map(([k, n]) =>
        `<label><input type="radio" name="crSit" value="${k}" ${it.sit === k ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>` : ''}
    </div>
    ${rep && it ? `<p class="dica">Para mudar o responsável de todas as vezes, edite a tarefa e escolha em "Responsável padrão" abaixo.</p>
      <label class="campo">Responsável padrão (todas as vezes)<select id="crRespPadrao">${opcoesPessoas(t.responsavel_id)}</select></label>` : ''}
    ${it?.auto ? '<p class="dica">Este item vem sozinho da área de origem e some quando ela for atualizada (exame renovado, OS concluída…). Aqui você marca o andamento e quem cuida.</p>' : ''}
    <div class="barra entre">
      ${!nova && !it.auto ? '<button type="button" class="btn perigo" id="crApagar">Apagar tarefa</button>' : '<span></span>'}
      <span class="barra">
        <button class="btn" value="cancelar">Fechar</button>
        <button type="button" class="btn principal" id="crSalvar">${nova ? 'Lançar' : 'Salvar'}</button>
      </span>
    </div>
  </form>`;
  d.showModal();
  const rep2 = $('crRep');
  if (rep2) rep2.onchange = () => { $('crAteCampo').hidden = rep2.value === 'nenhuma'; };
  $('crSalvar').onclick = async () => {
    const resp = $('crRespSel').value || null;
    const sit = d.querySelector('input[name=crSit]:checked')?.value || 'afazer';
    let r = 'ok';
    if (editavel) {
      const titulo = limpo($('crTit').value), data = $('crData').value;
      if (!titulo || !data) { (titulo ? $('crData') : $('crTit')).focus(); return; }
      const recorrencia = $('crRep').value;
      const base = {
        id: t?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        titulo, descricao: limpo($('crDesc').value) || null, data, area: $('crAreaT').value,
        recorrencia, ate: recorrencia === 'nenhuma' ? null : ($('crAte').value || null), ativo: true,
        responsavel_id: t?.responsavel_id ?? resp,
        situacao: t?.situacao || 'afazer', feita_em: t?.feita_em || null,
        criado_por: t?.criado_por || acesso.nome || acesso.email || null,
      };
      if (nova || recorrencia === 'nenhuma') base.responsavel_id = resp;
      if ($('crRespPadrao')) base.responsavel_id = $('crRespPadrao').value || null;
      if (!nova && recorrencia === 'nenhuma') { base.situacao = sit; base.feita_em = sit === 'feito' ? (t.feita_em || hoje()) : null; }
      r = await gravar('cron_tarefas', 'id', base);
      if (!nova && rep && it) {
        // ocorrência desta vez
        const e = estadoDe(it.chave);
        if (sit !== it.sit || resp !== it.resp || e)
          r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: sit, responsavel_id: resp,
            feita_em: sit === 'feito' ? (it.feitaEm || hoje()) : null });
      }
    } else {
      r = await gravar('cron_estado', 'chave', { chave: it.chave, situacao: sit, responsavel_id: resp,
        feita_em: sit === 'feito' ? (it.feitaEm || hoje()) : null });
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

/* ---------------- responsável padrão de cada origem (admin) ---------------- */
function abrirResponsaveis() {
  const d = dialogo();
  const atual = responsaveisPadrao();
  d.innerHTML = `<form method="dialog">
    <h3>Quem cuida de cada origem</h3>
    <p class="dica">Os itens automáticos vão para esta pessoa quando a área de origem não diz quem é o responsável (ou o nome escrito lá não é de ninguém do escritório). No card dá para trocar caso a caso. As pessoas são as da Reunião semanal.</p>
    <div class="cr-resp-lista">
      ${Object.entries(ORIGENS).map(([k, o]) => `<label class="campo cr-resp-linha">
        <span>${tagArea(o.area)} ${esc(o.nome)}</span>
        <select data-origem="${k}">${opcoesPessoas(atual[k] || '')}</select></label>`).join('')}
    </div>
    <div class="barra entre"><span></span><span class="barra">
      <button class="btn" value="cancelar">Fechar</button>
      <button type="button" class="btn principal" id="crRespSalvar">Salvar</button></span></div>
  </form>`;
  d.showModal();
  $('crRespSalvar').onclick = async () => {
    const valor = {};
    d.querySelectorAll('select[data-origem]').forEach(s => { if (s.value) valor[s.dataset.origem] = s.value; });
    const r = await gravar('cron_config', 'chave', { chave: 'responsaveis', valor });
    d.close(); recado(r);
  };
}
