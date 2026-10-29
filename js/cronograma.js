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
// Offline (regra do app): tudo fica em cache; gravação sem rede entra numa
// fila e sobe sozinha quando a rede voltar.

import { linhasCronograma, textoFreq } from './epi-cronograma-dados.js';
import { estado, gravarLocal } from './store.js';
import { acesso, abrirModulo, moduloDe, podeTela } from './acesso.js';
import { entrarNaArea, areasLiberadas } from './areas.js';

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
};
const areaDe = k => AREAS_C[k] || AREAS_C.esc;

/* Responsável de cada área (28/10/2026, definido pelo Guilherme). Máquinas e
   DP se dividem por unidade: Matriz (Vinícius) e Quebra Cocão (Laís). Vale
   para os itens automáticos e para as tarefas lançadas sem responsável. O
   admin muda no botão "Responsáveis" (cron_config 'responsaveis_area'). */
const UNIDADES = ['Matriz', 'Quebra Cocão'];
const LINHAS_AREA = [
  ['custo'], ['colh'], ['maq', 'Matriz'], ['maq', 'Quebra Cocão'], ['cad'], ['rh'], ['sst'],
  ['dp', 'Matriz'], ['dp', 'Quebra Cocão'], ['vist'], ['cert'], ['proj'], ['prog'], ['est'], ['esc'],
];
const RESP_AREA_PADRAO = {
  custo: ['reu-lincoln'], colh: ['reu-lincoln'],
  'maq@Matriz': ['reu-vinicius'], 'maq@Quebra Cocão': ['reu-lais'], maq: ['reu-vinicius', 'reu-lais'],
  cad: ['reu-lincoln', 'reu-vinicius'], rh: ['reu-guilherme'], sst: ['reu-vinicius'],
  'dp@Matriz': ['reu-vinicius'], 'dp@Quebra Cocão': ['reu-lais'], dp: ['reu-vinicius', 'reu-lais'],
};
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
      if (!m || !d.data_revisao || d.situacao === 'Obsoleto') continue;
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
    const explicito = e?.responsavel_id || a.respId || pessoaPorTexto(a.respTexto)?.id || null;
    const resps = explicito ? [explicito] : padrao[a.origem] ? [padrao[a.origem]] : respsDaArea(o.area, a.unid);
    let sit = e?.situacao || (a.feitoNaOrigem ? 'feito' : 'afazer');
    itens.push({ ...a, ir: a.ir || o.ir || null, area: o.area, origemNome: o.nome + (a.unid ? ' · ' + a.unid : ''), auto: true,
      resp: resps[0] || null, resps, explicito, sit, feitaEm: e?.feita_em || null });
  }
  for (const t of dados.tarefas) {
    if (t.ativo === false) continue;
    const rep = t.recorrencia && t.recorrencia !== 'nenhuma';
    for (const d of ocorrencias(t)) {
      const chave = rep ? `t:${t.id}:${d}` : `t:${t.id}`;
      const e = rep ? estadoDe(chave) : null;
      const explicito = e?.responsavel_id || t.responsavel_id || null;
      const resps = explicito ? [explicito] : respsDaArea(t.area || 'esc', null);
      itens.push({
        chave, tarefa: t, data: d, titulo: t.titulo, texto: t.descricao, area: t.area || 'esc',
        origemNome: rep ? (t.recorrencia === 'semanal' ? 'Tarefa · toda semana' : 'Tarefa · todo mês') : 'Tarefa',
        auto: false, resp: resps[0] || null, resps, explicito,
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
    if (est.filtro === 'minhas' && (!meu || !it.resps.includes(meu.id))) return false;
    if (est.pessoa === '-' && it.resps.length) return false;
    if (est.pessoa && est.pessoa !== '-' && !it.resps.includes(est.pessoa)) return false;
    if (est.area && it.area !== est.area) return false;
    return true;
  });
}

const tagArea = a => `<span class="cr-tag" style="background:${areaDe(a).cor}">${esc(areaDe(a).nome)}</span>`;
const avatar = (id, grande) => {
  const p = pessoa(id);
  return `<span class="cr-av${grande ? ' g' : ''}${p ? '' : ' cr-ninguem'}" title="${esc(p ? p.nome : 'Sem responsável')}">${esc(iniciais(p))}</span>`;
};
const avatares = it => it.resps.length > 1
  ? `<span class="cr-avs">${it.resps.map(id => avatar(id)).join('')}</span>` : avatar(it.resp);
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
  if (ir.a === 'pessoas') { entrarNaArea('pessoas'); abrirModulo(moduloDe(ir.t), ir.t); }
  else if (ir.a === 'certificacao') entrarNaArea('certificacao', ir.t);
  else if (ir.a === 'vistorias') { entrarNaArea('vistorias'); if (ir.m) abrirModulo(ir.m, ir.t); }
  else {
    entrarNaArea(ir.a, undefined, ir.x);
    if (ir.a === 'colheita' && ir.t) quandoPronta('molduraCP', w => w.abrirTelaColheita?.(ir.t));
  }
  window.scrollTo?.(0, 0);
}
const botaoIr = it => podeIr(it.ir)
  ? `<span class="cr-ir" role="button" tabindex="0" data-ir="${esc(it.chave)}" title="Ir para ${esc(ORIGENS[it.origem]?.nome || '')}">Ir para ↗</span>` : '';

function linha(it) {
  const r = rotuloData(it);
  return `<button type="button" class="cr-item${it.sit === 'feito' ? ' feito' : ''}" data-item="${esc(it.chave)}">
    <span class="cr-barra" style="background:${areaDe(it.area).cor}"></span>
    <span class="cr-item-txt"><b>${esc(it.titulo)}</b><small>${esc(it.origemNome)}${it.auto ? ' · automático' : ''}${it.sit === 'fazendo' ? ' · fazendo' : ''}</small></span>
    <span class="cr-item-dir">${botaoIr(it)}${avatares(it)}<span class="cr-data ${r.cls}">${esc(r.txt)}</span></span>
  </button>`;
}

function card(it, { semResp = false, comSit = false } = {}) {
  const r = rotuloData(it);
  return `<button type="button" class="cr-card" draggable="true" data-item="${esc(it.chave)}">
    <span class="cr-card-top">${tagArea(it.area)}${comSit ? `<span class="cr-sit ${it.sit}${atrasado(it) ? ' atraso' : ''}">${atrasado(it) && it.sit === 'afazer' ? 'Atrasado' : SIT[it.sit]}</span>` : (it.auto ? '<span class="cr-auto">⟳ automático</span>' : '')}</span>
    <b>${esc(it.titulo)}</b>
    <span class="cr-card-pe"><span class="cr-data ${r.cls}">${esc(r.txt)}</span><span class="cr-card-dir">${botaoIr(it)}${semResp ? '' : avatares(it)}</span></span>
  </button>`;
}

function kanban() {
  const limite = addDias(hoje(), +est.periodo);
  const corte = addDias(hoje(), -30);
  const itens = filtrados().filter(it => it.sit === 'feito' ? (it.feitaEm || it.data) >= corte : it.data <= limite).sort(ordemItens);
  let cols;
  if (est.colunas === 'pessoa') {
    const ps = pessoasAtivas();
    cols = [...ps.map(p => ({ id: p.id, nome: p.nome, cab: avatar(p.id, true), itens: itens.filter(i => i.resps.includes(p.id) && i.sit !== 'feito') })),
      { id: '-', nome: 'Sem responsável', cab: avatar(null, true), itens: itens.filter(i => !i.resps.length && i.sit !== 'feito') }]
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
  r.querySelectorAll('[data-item]').forEach(b => b.onclick = ev => {
    const ir = ev.target.closest('[data-ir]');
    if (ir) { ev.preventDefault(); ev.stopPropagation(); irPara(todosItens().find(x => x.chave === ir.dataset.ir)?.ir); return; }
    abrirItem(b.dataset.item);
  });
  r.querySelectorAll('[data-ir]').forEach(b => b.onkeydown = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault(); ev.stopPropagation(); irPara(todosItens().find(x => x.chave === b.dataset.ir)?.ir);
  });

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
  const novaSit = sit ?? it.sit, novoResp = resp === undefined ? it.explicito : resp;
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
const opcoesPessoas = (sel, padrao) => `<option value="">${padrao ? esc('Responsável da área — ' + padrao) : 'Sem responsável'}</option>` +
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
    ${it?.detalhes?.length ? `<div class="cr-dlg-det"><b>${it.detalhes.length} ${(it.detRot || ['pessoa', 'pessoas'])[it.detalhes.length === 1 ? 0 : 1]}</b><ul>${it.detalhes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
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
      <label class="campo">Responsável${rep && it ? ' (só desta vez)' : ''}<select id="crRespSel">${opcoesPessoas(it ? (it.explicito || '') : '', nomesDe(respsDaArea(it ? it.area : (t?.area || 'esc'), it?.unid)))}</select></label>
      ${it ? `<div class="campo">Situação${rep ? ' (desta vez)' : ''}<div class="cr-sits">${Object.entries(SIT).map(([k, n]) =>
        `<label><input type="radio" name="crSit" value="${k}" ${it.sit === k ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>` : ''}
    </div>
    ${rep && it ? `<p class="dica">Para mudar o responsável de todas as vezes, edite a tarefa e escolha em "Responsável padrão" abaixo.</p>
      <label class="campo">Responsável padrão (todas as vezes)<select id="crRespPadrao">${opcoesPessoas(t.responsavel_id, nomesDe(respsDaArea(t.area || 'esc', null)))}</select></label>` : ''}
    ${it?.auto ? '<p class="dica">Este item vem sozinho da área de origem e some quando ela for atualizada (exame renovado, OS concluída…). Aqui você marca o andamento e quem cuida.</p>' : ''}
    <div class="barra entre">
      ${!nova && !it.auto ? '<button type="button" class="btn perigo" id="crApagar">Apagar tarefa</button>' : (it && podeIr(it.ir) ? `<button type="button" class="btn" id="crIr">Ir para ${esc(ORIGENS[it.origem]?.nome || 'a origem')} ↗</button>` : '<span></span>')}
      <span class="barra">
        <button class="btn" value="cancelar">Fechar</button>
        <button type="button" class="btn principal" id="crSalvar">${nova ? 'Lançar' : 'Salvar'}</button>
      </span>
    </div>
  </form>`;
  d.showModal();
  if ($('crIr')) $('crIr').onclick = () => irPara(it.ir);
  // trocar a área da tarefa mostra quem é o responsável da área
  if ($('crAreaT')) $('crAreaT').onchange = () => {
    const o = $('crRespSel').options[0], n = nomesDe(respsDaArea($('crAreaT').value, null));
    o.textContent = n ? 'Responsável da área — ' + n : 'Sem responsável';
  };
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
        if (sit !== it.sit || resp !== it.explicito || e)
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
      <button class="btn" value="cancelar">Fechar</button>
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
