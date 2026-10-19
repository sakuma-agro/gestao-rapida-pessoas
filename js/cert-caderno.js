// cert-caderno.js — Certificação › Caderno de Campo (19/10/2026)
//
// Registra, por plantio, tudo o que acontece no campo e gera os registros que
// a auditoria GLOBALG.A.P. IFA v6 (Frutas e Hortaliças) pede — e o que coincide
// em GRASP, Rainforest e SMETA. Rastreabilidade por lote NÃO mora aqui (vai
// ser outro app): a colheita leva só um "código do lote" de referência.
//
// Tabelas (supabase/cert-caderno.sql), todas trancadas por app_pode('cert'):
//  · cc_plantios     — o plantio (talhão + cultura + data); tudo pendura nele
//  · cc_insumos      — defensivos, fertilizantes, corretivos (nº MAPA, carência, REI, dose máx.)
//  · cc_analises     — laudos de água/solo/resíduos com vencimento
//  · cc_calibracoes  — calibração dos pulverizadores
//  · cc_registros    — o lançamento (tipo + dados jsonb) com situação Lançado › Aprovado › assinado
//  · cc_registro_versoes — versão anterior de registro aprovado que foi retificado (gatilho no banco)
//  · cc_config       — responsável técnico (nome, CREA)
// O que vem de outras áreas (talhões, culturas, fazendas, pulverizadores,
// aplicadores com NR-31 e ASO) chega pela RPC cc_referencias(), porque um login
// só de Certificação não passa pela RLS de programacao/manutencao/sst.
//
// Offline: cópia local em 'caderno.cache'; toda gravação vai para a fila
// 'caderno' (nucleo.js) e sobe quando tiver sinal — a mais recente vence.

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';
import { campoAnexos, donosComArquivo } from './arquivos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtN = (n, c = 2) => n == null || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: c });

const doisD = n => String(n).padStart(2, '0');
const isoD = d => `${d.getUTCFullYear()}-${doisD(d.getUTCMonth() + 1)}-${doisD(d.getUTCDate())}`;
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const agoraHM = () => { const d = new Date(); return `${doisD(d.getHours())}:${doisD(d.getMinutes())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const brHora = s => s ? String(s).slice(0, 5) : '';
const brDH = s => { if (!s) return '—'; const d = new Date(s); return `${doisD(d.getDate())}/${doisD(d.getMonth() + 1)}/${d.getFullYear()} ${doisD(d.getHours())}:${doisD(d.getMinutes())}`; };
const utc = s => new Date(s + 'T12:00:00Z');
const entre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const somaDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return isoD(d); };

/* ===================================================================
   O QUE CADA TIPO DE LANÇAMENTO GUARDA EM `dados`
   =================================================================== */
export const TIPOS = {
  aplicacao:     { nome: 'Aplicação de defensivo', curto: 'Aplicação',   cor: 'perigo',  icone: '🧴' },
  adubacao:      { nome: 'Adubação / correção',    curto: 'Adubação',    cor: 'ativo',   icone: '🌱' },
  irrigacao:     { nome: 'Irrigação',              curto: 'Irrigação',   cor: 'neutra',  icone: '💧' },
  monitoramento: { nome: 'Monitoramento (MIP)',    curto: 'MIP',         cor: 'alerta',  icone: '🔍' },
  operacao:      { nome: 'Operação cultural',      curto: 'Operação',    cor: 'neutra',  icone: '🚜' },
  colheita:      { nome: 'Colheita',               curto: 'Colheita',    cor: 'ativo',   icone: '🧺' },
  higiene:       { nome: 'Higiene e segurança',    curto: 'Higiene',     cor: 'neutra',  icone: '🧼' },
  ocorrencia:    { nome: 'Não conformidade',       curto: 'NC',          cor: 'perigo',  icone: '⚠️' },
};
const EMBALAGENS = ['Tríplice lavagem e devolução', 'Devolução sem lavagem (lavagem sob pressão)', 'Pendente de devolução', 'Não se aplica'];
const DECISOES = ['Aplicar', 'Não aplicar', 'Monitorar de novo'];
const OPERACOES = ['Preparo de solo', 'Plantio', 'Desbaste', 'Capina', 'Roçada', 'Poda', 'Amontoa', 'Dessecação', 'Outra'];
const UNID_COLHEITA = ['caixas', 'kg', 'sacas', 'toneladas', 'bins'];
const UNID_DOSE = ['L/ha', 'mL/ha', 'kg/ha', 'g/ha', 'mL/100 L', 'g/100 L', 'L/1000 L', 'kg/1000 L', 't/ha'];
const HIGIENE_ITENS = [['banheiro', 'Banheiros limpos e abastecidos'], ['agua', 'Água potável disponível'], ['maos', 'Ponto de lavagem de mãos com sabão'],
  ['lixo', 'Lixo recolhido / sem resíduo na lavoura'], ['epi', 'EPI em uso e em bom estado'], ['equip', 'Equipamentos e caixas limpos']];
const TIPOS_HIGIENE = ['Checklist diário', 'Limpeza de equipamento', 'Acidente', 'Quase acidente'];
const STATUS_NC = ['Aberta', 'Em andamento', 'Encerrada'];
const COR_SIT = { 'Lançado': 'alerta', 'Aprovado': 'ativo', 'Cancelado': 'inativo' };
const COR_PLANTIO = { 'Planejado': 'neutra', 'Em campo': 'ativo', 'Colhido': 'alerta', 'Encerrado': 'inativo' };
const TIPOS_INSUMO = ['Defensivo', 'Biológico', 'Adjuvante', 'Fertilizante', 'Corretivo'];
const TIPOS_ANALISE = ['Água de irrigação', 'Água de lavagem', 'Água potável', 'Solo', 'Resíduos no produto', 'Folha', 'Outra'];

/* Cada relatório do caderno × pontos de controle IFA v6 (F&V) que ele atende.
   Os códigos são os mesmos das referências dos requisitos (cert_requisitos),
   então o índice de evidências cruza os dois. */
export const EVIDENCIAS = [
  { id: 'caderno',   nome: 'Caderno de campo por plantio',        codigos: ['FV-GFS 01.01', 'FV-GFS 32.02', 'FV-GFS 32.03', 'FV-GFS 21.03'] },
  { id: 'aplic',     nome: 'Registro de aplicação de agroquímicos', codigos: ['FV-GFS 32.01', 'FV-GFS 32.02', 'FV-GFS 32.03', 'FV-GFS 32.06', 'FV-GFS 32.11'] },
  { id: 'fert',      nome: 'Registro de fertilização',             codigos: ['FV-GFS 29.01', 'FV-GFS 29.02', 'FV-GFS 29.03', 'FV-GFS 29.04'] },
  { id: 'irrig',     nome: 'Registro de irrigação',                codigos: ['FV-GFS 30.03', 'FV-GFS 30.06'] },
  { id: 'mip',       nome: 'Monitoramento de pragas (MIP)',        codigos: ['FV-GFS 31.01', 'FV-GFS 31.03', 'FV-GFS 31.04', 'FV-GFS 31.05'] },
  { id: 'colheita',  nome: 'Registro de colheita e carência',      codigos: ['FV-GFS 07.03', 'FV-GFS 19.08', 'FV-GFS 32.07', 'FV-GFS 32.08'] },
  { id: 'higiene',   nome: 'Higiene e segurança na lavoura',       codigos: ['FV-GFS 19.02', 'FV-GFS 19.03', 'FV-GFS 19.04', 'FV-GFS 19.07', 'FV-GFS 21.04'] },
  { id: 'produtos',  nome: 'Produtos usados na safra (nº MAPA)',   codigos: ['FV-GFS 32.01', 'FV-GFS 32.11', 'FV-GFS 05.02'] },
  { id: 'calib',     nome: 'Calibração de equipamentos',           codigos: ['FV-GFS 32.04'] },
  { id: 'analises',  nome: 'Análises laboratoriais (água, solo, resíduos)', codigos: ['FV-GFS 30.01', 'FV-GFS 30.05', 'FV-GFS 32.07'] },
  { id: 'aplicad',   nome: 'Aplicadores: treinamento NR-31 e ASO', codigos: ['FV-GFS 03.03', 'FV-GFS 20.03', 'FV-GFS 32.10'] },
  { id: 'nc',        nome: 'Não conformidades e ações corretivas', codigos: ['FV-GFS 09.01', 'FV-GFS 11.01'] },
];

/* ===================================================================
   ESTADO, CÓPIA LOCAL E FILA
   =================================================================== */
const C = {
  carregado: false, erroCarga: null,
  plantios: [], insumos: [], analises: [], calibs: [], regs: [], config: [], reqs: [],
  ref: { talhoes: [], culturas: [], fazendas: [], equipamentos: [], pessoas: [] },
  fr: { plantio: '', tipo: '', de: '', ate: '', sit: '' },
  fp: { q: '', status: 'ativos' },
  fi: { q: '', tipo: '' },
  rel: { plantio: '', de: '', ate: '' },
  arq: new Set(),
};
const LISTAS = { cc_plantios: 'plantios', cc_insumos: 'insumos', cc_analises: 'analises', cc_calibracoes: 'calibs', cc_registros: 'regs', cc_config: 'config' };
const CAIXA = 'caderno.cache';
const CAMADA = 'caderno';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { plantios: C.plantios, insumos: C.insumos, analises: C.analises, calibs: C.calibs, regs: C.regs, config: C.config, reqs: C.reqs, ref: C.ref });
const limpo = item => { const o = {}; for (const k of Object.keys(item)) if (!k.startsWith('_')) o[k] = item[k]; return o; };
const CAMADA_DEF = {
  tabelaDe: c => c, chaveDe: c => (c === 'cc_config' ? 'chave' : 'id'), paraBanco: (c, i) => limpo(i),
  cliente: () => estado.cliente,
  podeEnviar: () => !!(estado.cliente && estado.sessao && navigator.onLine),
  aoEnviado: (colecao, dado) => {
    const lista = C[LISTAS[colecao]]; if (!lista || !dado) return;
    const pk = CAMADA_DEF.chaveDe(colecao);
    const i = lista.findIndex(x => x[pk] === dado[pk]);
    if (i >= 0) lista[i] = dado; else lista.push(dado);
    salvarCaixa();
    if (telaAtual && TELAS_CADERNO.includes(telaAtual) && !$('dlgCc')?.open) redesenhar();
  },
};
export const enviarFilaCaderno = () => nucleo.enviarFila(CAMADA, CAMADA_DEF);
addEventListener('online', () => { enviarFilaCaderno().catch(() => {}); });
setInterval(() => { if (nucleo.pendentes(CAMADA) - nucleo.parados(CAMADA) > 0) enviarFilaCaderno().catch(() => {}); }, 2 * 60 * 1000);

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !C.carregado) {
    for (const k of ['plantios', 'insumos', 'analises', 'calibs', 'regs', 'config', 'reqs']) C[k] = c0[k] || [];
    C.ref = c0.ref || C.ref;
    C.carregado = true;
  }
  await nucleo.contarFila(CAMADA);
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (C.carregado) return;
    throw new Error('Sem internet e sem cópia do caderno de campo neste aparelho.');
  }
  await enviarFilaCaderno().catch(() => {});
  // Ainda há lançamento deste aparelho esperando subir: não reler o servidor
  // agora, senão a cópia local (que já mostra o lançamento) seria atropelada.
  if (C.carregado && nucleo.pendentes(CAMADA) > 0) return;
  const [p, i, a, k, r, g, q, ref] = await Promise.all([
    c.from('cc_plantios').select('*').order('data_plantio', { ascending: false }),
    c.from('cc_insumos').select('*').order('tipo').order('nome'),
    c.from('cc_analises').select('*').order('data', { ascending: false }),
    c.from('cc_calibracoes').select('*').order('data', { ascending: false }),
    c.from('cc_registros').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }),
    c.from('cc_config').select('*'),
    c.from('cert_requisitos').select('id,tema,titulo,status,referencias,documentos').order('id'),
    c.rpc('cc_referencias'),
  ]);
  const erro = p.error || i.error || a.error || k.error || r.error || g.error || ref.error;
  if (erro && C.carregado) return;   // rede falhou: fica a cópia
  if (erro) {
    if (/cc_|relation|does not exist|schema cache|cc_referencias/i.test(erro.message || ''))
      throw new Error('As tabelas do Caderno de Campo ainda não foram criadas no banco (supabase/cert-caderno.sql).');
    throw erro;
  }
  C.plantios = p.data || []; C.insumos = i.data || []; C.analises = a.data || []; C.calibs = k.data || [];
  C.regs = r.data || []; C.config = g.data || []; C.reqs = q.data || []; C.ref = ref.data || C.ref;
  C.carregado = true;
  salvarCaixa();
  C.arq = await donosComArquivo('certificacao', 'caderno').catch(() => new Set());
}

/* Gravação: primeiro na cópia local (aparece na hora), depois na fila. */
async function gravar(tabela, item, { novo = false } = {}) {
  const lista = C[LISTAS[tabela]];
  const pk = CAMADA_DEF.chaveDe(tabela);
  const base = novo ? null : (item.atualizado_em || null);
  const i = lista.findIndex(x => x[pk] === item[pk]);
  const local = { ...item, _pendente: true };
  if (i >= 0) lista[i] = local; else lista.unshift(local);
  salvarCaixa();
  await nucleo.adicionarNaFila(CAMADA, { colecao: tabela, acao: 'salvar', item: limpo(item), base });
  if (CAMADA_DEF.podeEnviar()) enviarFilaCaderno().catch(() => {});
  return local;
}
async function apagarItem(tabela, id) {
  const lista = C[LISTAS[tabela]];
  const i = lista.findIndex(x => x.id === id);
  if (i >= 0) lista.splice(i, 1);
  salvarCaixa();
  await nucleo.adicionarNaFila(CAMADA, { colecao: tabela, acao: 'apagar', item: { id }, base: null });
  if (CAMADA_DEF.podeEnviar()) enviarFilaCaderno().catch(() => {});
}

/* ===================================================================
   REGRAS: CARÊNCIA, REENTRADA, APLICADOR, CULTURA, DOSE
   =================================================================== */
const plantioPorId = id => C.plantios.find(p => p.id === id);
const insumoPorId = id => C.insumos.find(x => x.id === id);
const pessoaPorId = id => C.ref.pessoas.find(x => x.id === id);
const rotPlantio = p => p ? `${p.codigo ? p.codigo + ' · ' : ''}${p.cultura} · ${p.local}${p.data_plantio ? ' · ' + br(p.data_plantio) : ''}` : '—';
const regsDo = (pid, tipo) => C.regs.filter(r => r.plantio_id === pid && (!tipo || r.tipo === tipo) && r.situacao !== 'Cancelado');
const tecnico = () => (C.config.find(x => x.chave === 'tecnico')?.valor) || { nome: '', crea: '' };

/** Carência (dias) de um insumo para uma cultura: a específica, senão a padrão. */
const carenciaDe = (ins, cultura) => {
  if (!ins) return null;
  const esp = ins.carencias && cultura ? ins.carencias[cultura] : null;
  return esp != null && esp !== '' ? Number(esp) : (ins.carencia_dias ?? null);
};
/** Liberações de uma aplicação: a maior carência e o maior REI entre os produtos. */
function liberacoes(data, horaFim, produtos, cultura) {
  let carencia = 0, rei = 0, temCar = false, temRei = false;
  for (const pr of produtos || []) {
    const ins = insumoPorId(pr.insumo_id);
    const c = carenciaDe(ins, cultura); if (c != null) { temCar = true; carencia = Math.max(carencia, Number(c)); }
    const r = ins?.reentrada_horas; if (r != null) { temRei = true; rei = Math.max(rei, Number(r)); }
  }
  const fim = new Date(`${data}T${horaFim || '18:00'}:00`);
  return {
    colheita: temCar ? somaDias(data, carencia) : null,
    reentrada: temRei ? new Date(fim.getTime() + rei * 3600000).toISOString() : null,
    carencia, rei,
  };
}
/** Aplicador habilitado na data: NR-31 (defensivos) e ASO vigentes no cadastro de Pessoas. */
function habilitacao(pessoa, data) {
  if (!pessoa) return { ok: false, motivos: ['não está no cadastro de Pessoas'] };
  const m = [];
  if (!pessoa.nr31_vence) m.push('sem treinamento de defensivos (NR-31) lançado');
  else if (pessoa.nr31_vence < data) m.push(`NR-31 vencido em ${br(pessoa.nr31_vence)}`);
  if (!pessoa.aso_vence) m.push('sem ASO lançado');
  else if (pessoa.aso_vence < data) m.push(`ASO vencido em ${br(pessoa.aso_vence)}`);
  return { ok: !m.length, motivos: m };
}
/** O plantio está sob carência/reentrada nessa data? Devolve a aplicação que trava. */
function travaColheita(pid, data) {
  return regsDo(pid, 'aplicacao').filter(r => r.liberado_colheita && r.liberado_colheita > data && r.data <= data)
    .sort((a, b) => b.liberado_colheita.localeCompare(a.liberado_colheita))[0] || null;
}
function travaReentrada(pid, quando = new Date().toISOString()) {
  return regsDo(pid, 'aplicacao').filter(r => r.liberado_reentrada && r.liberado_reentrada > quando)
    .sort((a, b) => b.liberado_reentrada.localeCompare(a.liberado_reentrada))[0] || null;
}
/** Última calibração válida do equipamento. */
function calibDe(equipId) {
  const l = C.calibs.filter(c => c.equipamento_id === equipId && c.resultado === 'Aprovado').sort((a, b) => b.data.localeCompare(a.data));
  return l[0] || null;
}
const calibVencida = (equipId, data = hoje()) => { const c = calibDe(equipId); return !c || (c.proxima && c.proxima < data); };

/* Validação da aplicação. Devolve { erros:[], avisos:[] }. */
function validarAplicacao(plantio, dados, data) {
  const erros = [], avisos = [];
  if (!(dados.produtos || []).length) erros.push('Informe ao menos um produto.');
  for (const pr of dados.produtos || []) {
    const ins = insumoPorId(pr.insumo_id);
    if (!ins) { erros.push(`Produto “${pr.nome}” não está no cadastro de insumos.`); continue; }
    if (!ins.ativo) erros.push(`${ins.nome} está desativado no cadastro.`);
    if ((ins.culturas || []).length && !ins.culturas.includes(plantio.cultura)) erros.push(`${ins.nome} não está autorizado para ${plantio.cultura} (culturas cadastradas: ${ins.culturas.join(', ')}).`);
    if (ins.dose_max != null && pr.dose != null && pr.unidade === ins.dose_unidade && Number(pr.dose) > Number(ins.dose_max)) erros.push(`${ins.nome}: dose ${fmtN(pr.dose, 3)} ${pr.unidade} acima da máxima (${fmtN(ins.dose_max, 3)} ${ins.dose_unidade}).`);
    if (ins.tipo === 'Defensivo' && !so(ins.registro_mapa)) avisos.push(`${ins.nome} está sem nº de registro MAPA no cadastro.`);
    if (ins.max_aplicacoes) {
      const n = regsDo(plantio.id, 'aplicacao').filter(r => r.id !== dados._id && (r.dados?.produtos || []).some(x => x.insumo_id === ins.id)).length;
      if (n + 1 > ins.max_aplicacoes) avisos.push(`${ins.nome}: esta é a ${n + 1}ª aplicação no plantio — o máximo cadastrado é ${ins.max_aplicacoes}.`);
    }
  }
  if (dados.aplicador_id) {
    const h = habilitacao(pessoaPorId(dados.aplicador_id), data);
    if (!h.ok) erros.push(`Aplicador não habilitado: ${h.motivos.join('; ')}. Regularize em Pessoas › SST antes de lançar.`);
  } else if (!so(dados.aplicador)) erros.push('Informe o aplicador.');
  else avisos.push('Aplicador fora do cadastro de Pessoas: o auditor vai pedir o certificado NR-31 e o ASO dele.');
  if (dados.equipamento_id && calibVencida(dados.equipamento_id, data)) avisos.push('O equipamento está sem calibração válida na data (lance em Calibrações).');
  if (!so(dados.receituario)) avisos.push('Sem nº do receituário agronômico — anexe ou informe o número.');
  if (!so(dados.alvo)) erros.push('Informe o alvo (praga, doença ou planta daninha).');
  return { erros, avisos };
}

/* ===================================================================
   PAINEL DE CONFORMIDADE (cálculo)
   =================================================================== */
function conformidade() {
  const hj = hoje();
  const aplic = C.regs.filter(r => r.tipo === 'aplicacao' && r.situacao !== 'Cancelado');
  const semReceituario = aplic.filter(r => !so(r.dados?.receituario) && !C.arq.has(String(r.id)));
  const carenciaViolada = C.regs.filter(r => r.tipo === 'colheita' && r.situacao !== 'Cancelado').filter(r => travaColheita(r.plantio_id, r.data));
  const aplicadoresIds = [...new Set(aplic.filter(r => r.data >= somaDias(hj, -365)).map(r => r.dados?.aplicador_id).filter(Boolean))];
  const aplicadoresIrreg = aplicadoresIds.map(id => ({ p: pessoaPorId(id), h: habilitacao(pessoaPorId(id), hj) })).filter(x => x.p && !x.h.ok);
  const equipIds = [...new Set(aplic.filter(r => r.data >= somaDias(hj, -365)).map(r => r.dados?.equipamento_id).filter(Boolean))];
  const calibsVencidas = equipIds.filter(id => calibVencida(id, hj)).map(id => ({ id, nome: C.ref.equipamentos.find(e => e.id === id)?.descricao || aplic.find(r => r.dados?.equipamento_id === id)?.dados?.equipamento || id, calib: calibDe(id) }));
  const analisesVencidas = C.analises.filter(a => a.vence && a.vence < hj);
  const tiposAnaliseSem = ['Água de irrigação', 'Água potável'].filter(t => !C.analises.some(a => a.tipo === t && (!a.vence || a.vence >= hj)));
  const semAssinatura = C.regs.filter(r => r.situacao === 'Aprovado' && !r.assinado_em);
  const lancados = C.regs.filter(r => r.situacao === 'Lançado');
  const ncAbertas = C.regs.filter(r => r.tipo === 'ocorrencia' && r.situacao !== 'Cancelado' && r.dados?.status !== 'Encerrada');
  const ncAtrasadas = ncAbertas.filter(r => r.dados?.prazo && r.dados.prazo < hj);
  const emCampo = C.plantios.filter(p => p.status === 'Em campo');
  const sobCarencia = emCampo.map(p => ({ p, t: travaColheita(p.id, hj) })).filter(x => x.t);
  const sobReentrada = emCampo.map(p => ({ p, t: travaReentrada(p.id) })).filter(x => x.t);
  return { semReceituario, carenciaViolada, aplicadoresIrreg, calibsVencidas, analisesVencidas, tiposAnaliseSem, semAssinatura, lancados, ncAbertas, ncAtrasadas, emCampo, sobCarencia, sobReentrada };
}

/* ===================================================================
   PEÇAS DE TELA
   =================================================================== */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const datalist = (id, itens) => `<datalist id="${id}">${[...new Set(itens.filter(Boolean))].map(i => `<option value="${esc(i)}">`).join('')}</datalist>`;
function dialogo(html, ligar) {
  let d = $('dlgCc');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCc'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgCc')?.open && $('dlgCc').close();
const erroDlg = t => { const e = $('ccErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgCc')) $('dlgCc').scrollTop = 0; };
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
const opcoesPlantio = (val, vazio = 'Todos') => opcoes(C.plantios.map(p => [p.id, rotPlantio(p)]), val, vazio);
const pendTag = r => r._pendente ? ' <span class="tag neutra" title="Aguardando envio">⏳</span>' : '';
const confirmar = (titulo, texto, rotulo, acao, perigo = true) => dialogo(`<h3>${esc(titulo)}</h3><p>${texto}</p>
  <div class="aviso erro" id="ccErro" hidden></div>
  <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
    <button class="btn ${perigo ? 'perigo' : 'principal'}" type="button" id="ccConfOk">${esc(rotulo)}</button></div>`,
  () => $('ccConfOk').addEventListener('click', async () => { $('ccConfOk').disabled = true; try { await acao(); fechar(); redesenhar(); } catch (e) { $('ccConfOk').disabled = false; erroDlg(esc(e.message || e)); } }));

/* ===================================================================
   TELA · PAINEL DE CONFORMIDADE
   =================================================================== */
function desenharPainel() {
  const tela = $('telaCcPainel');
  const k = conformidade();
  const hj = hoje();
  const cartao = (cor, rot, n, dica, alvo) => `<button type="button" class="pv-card pv-${cor}${n ? '' : ' pv-zero'}" ${alvo ? `data-ir="${alvo}"` : ''}>
    <span>${esc(rot)}</span><strong>${n}</strong><small>${esc(dica)}</small></button>`;
  const semaforo = (n, ok = 'ok') => n ? 'perigo' : ok;
  const linhaLib = (x, tipo) => `<tr><td><b>${esc(rotPlantio(x.p))}</b></td><td>${esc(tipo)}</td>
    <td class="ce">${tipo === 'Carência' ? br(x.t.liberado_colheita) : brDH(x.t.liberado_reentrada)}</td>
    <td class="rel-miudo">${esc((x.t.dados?.produtos || []).map(p => p.nome).join(', '))} · ${br(x.t.data)}</td></tr>`;
  const proximos = [
    ...C.analises.filter(a => a.vence && a.vence >= hj && a.vence <= somaDias(hj, 60)).map(a => ({ data: a.vence, o: `Análise: ${a.tipo} · ${a.ponto}`, ir: 'ccAnalises' })),
    ...C.calibs.filter(c => c.proxima && c.proxima >= hj && c.proxima <= somaDias(hj, 60)).map(c => ({ data: c.proxima, o: `Calibração: ${c.equipamento}`, ir: 'ccCalibracoes' })),
    ...C.regs.filter(r => r.tipo === 'ocorrencia' && r.situacao !== 'Cancelado' && r.dados?.status !== 'Encerrada' && r.dados?.prazo && r.dados.prazo >= hj).map(r => ({ data: r.dados.prazo, o: `Ação corretiva: ${r.dados.descricao || ''}`, ir: 'ccRegistros' })),
    ...C.plantios.filter(p => p.status === 'Em campo' && p.previsao_colheita && p.previsao_colheita >= hj && p.previsao_colheita <= somaDias(hj, 60)).map(p => ({ data: p.previsao_colheita, o: `Colheita prevista: ${rotPlantio(p)}`, ir: 'ccPlantios' })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Caderno de campo', `${k.emCampo.length} plantio(s) em campo · ${C.regs.filter(r => r.situacao !== 'Cancelado').length} lançamento(s)`,
      `<button class="btn principal" type="button" id="ccPnNovo">Novo lançamento</button>`)}
    <div class="pv-cards" style="margin-top:14px">
      ${cartao(semaforo(k.semReceituario.length), 'Aplicações sem receituário', k.semReceituario.length, 'sem nº nem arquivo anexado', 'receit')}
      ${cartao(semaforo(k.carenciaViolada.length), 'Carência violada', k.carenciaViolada.length, 'colheita antes da liberação', 'colheita')}
      ${cartao(semaforo(k.aplicadoresIrreg.length), 'Aplicadores irregulares', k.aplicadoresIrreg.length, 'NR-31 ou ASO vencido', 'aplicad')}
      ${cartao(semaforo(k.calibsVencidas.length, 'calma'), 'Calibrações vencidas', k.calibsVencidas.length, 'pulverizadores usados no ano', 'ccCalibracoes')}
      ${cartao(semaforo(k.analisesVencidas.length + k.tiposAnaliseSem.length, 'calma'), 'Análises vencidas', k.analisesVencidas.length + k.tiposAnaliseSem.length, k.tiposAnaliseSem.length ? 'faltam: ' + k.tiposAnaliseSem.join(', ') : 'água, solo, resíduos', 'ccAnalises')}
      ${cartao(k.lancados.length ? 'alerta' : 'ok', 'Aguardando aprovação', k.lancados.length, 'lançados e não aprovados', 'lancados')}
      ${cartao(k.semAssinatura.length ? 'alerta' : 'ok', 'Sem assinatura', k.semAssinatura.length, 'aprovados sem o técnico', 'semass')}
      ${cartao(semaforo(k.ncAtrasadas.length, k.ncAbertas.length ? 'alerta' : 'ok'), 'Não conformidades', k.ncAbertas.length, k.ncAtrasadas.length ? `${k.ncAtrasadas.length} com prazo vencido` : 'em aberto', 'nc')}
    </div>

    <div class="qp-bloco"><h3>Plantios em carência ou reentrada agora</h3>
      ${k.sobCarencia.length + k.sobReentrada.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Plantio</th><th>Trava</th><th class="ce">Liberado em</th><th>Aplicação</th></tr></thead><tbody>
        ${k.sobReentrada.map(x => linhaLib(x, 'Reentrada')).join('')}${k.sobCarencia.map(x => linhaLib(x, 'Carência')).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhum plantio travado por carência ou reentrada.</div>'}
    </div>
    <div class="qp-bloco"><h3>Próximos 60 dias</h3>
      ${proximos.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>O quê</th><th></th></tr></thead><tbody>
        ${proximos.map(x => `<tr><td class="ce">${br(x.data)}</td><td>${esc(x.o)}</td><td class="ce"><button class="btn mini" type="button" data-ir="${x.ir}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhum vencimento nos próximos 60 dias.</div>'}
    </div>
    ${k.aplicadoresIrreg.length ? `<div class="qp-bloco"><h3>Aplicadores com pendência em Pessoas</h3><div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Aplicador</th><th>Pendência</th></tr></thead><tbody>
      ${k.aplicadoresIrreg.map(x => `<tr><td><b>${esc(x.p.nome)}</b></td><td>${esc(x.h.motivos.join('; '))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${k.calibsVencidas.length ? `<div class="qp-bloco"><h3>Pulverizadores sem calibração válida</h3><div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Equipamento</th><th class="ce">Última</th><th class="ce">Venceu</th></tr></thead><tbody>
      ${k.calibsVencidas.map(x => `<tr><td><b>${esc(x.nome)}</b></td><td class="ce">${x.calib ? br(x.calib.data) : 'nunca'}</td><td class="ce">${x.calib?.proxima ? tag(br(x.calib.proxima), 'perigo') : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ccPnImprimir">Imprimir o painel</button>
    <button class="btn" type="button" id="ccPnRel">Relatórios para auditoria</button>
  </div>`;
  $('ccPnNovo').addEventListener('click', () => escolherTipo());
  $('ccPnImprimir').addEventListener('click', () => mostrar(docPainel(k, proximos), { barra: true }));
  $('ccPnRel').addEventListener('click', () => abrirModulo('cert', 'ccRelatorios'));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.ir;
    const f = { plantio: '', tipo: '', de: '', ate: '', sit: '' };
    if (a === 'receit') Object.assign(f, { tipo: 'aplicacao', sit: 'receit' });
    else if (a === 'colheita') Object.assign(f, { tipo: 'colheita', sit: 'carencia' });
    else if (a === 'aplicad') Object.assign(f, { tipo: 'aplicacao', sit: 'aplicad' });
    else if (a === 'lancados') Object.assign(f, { sit: 'Lançado' });
    else if (a === 'semass') Object.assign(f, { sit: 'semass' });
    else if (a === 'nc') Object.assign(f, { tipo: 'ocorrencia', sit: 'nc' });
    else return abrirModulo('cert', a);
    Object.assign(C.fr, f); abrirModulo('cert', 'ccRegistros');
  }));
}

/* ===================================================================
   TELA · PLANTIOS
   =================================================================== */
function desenharPlantios() {
  const tela = $('telaCcPlantios');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Plantios', 'Cada plantio é um talhão + cultura + data. Todo lançamento do caderno pendura num plantio.',
      `<button class="btn principal" type="button" id="ccPlNovo">Novo plantio</button>`)}
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Buscar <input type="text" id="ccPlQ" value="${esc(C.fp.q)}" placeholder="Código, cultura, talhão, fazenda"></label>
      <label class="campo">Situação <select id="ccPlSt">${opcoes([['ativos', 'Planejados e em campo'], 'Planejado', 'Em campo', 'Colhido', 'Encerrado', ['todos', 'Todos']], C.fp.status)}</select></label>
    </div>
    <div id="ccPlTabela" style="margin-top:12px"></div>
  </div>`;
  $('ccPlQ').addEventListener('input', e => { C.fp.q = e.target.value; tabelaPlantios(); });
  $('ccPlSt').addEventListener('change', e => { C.fp.status = e.target.value; tabelaPlantios(); });
  $('ccPlNovo').addEventListener('click', () => formPlantio(null));
  tabelaPlantios();
}
function plantiosFiltrados() {
  const q = so(C.fp.q).toLowerCase(), st = C.fp.status;
  return C.plantios.filter(p => (st === 'todos' || (st === 'ativos' ? ['Planejado', 'Em campo'].includes(p.status) : p.status === st))
    && (!q || `${p.codigo} ${p.cultura} ${p.variedade} ${p.local} ${p.fazenda}`.toLowerCase().includes(q)));
}
function tabelaPlantios() {
  const lista = plantiosFiltrados(), hj = hoje();
  $('ccPlTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th>Código</th><th>Cultura</th><th>Talhão / pivô</th><th>Fazenda</th><th class="ce">Plantio</th><th class="ce">Área (ha)</th><th class="ce">Prev. colheita</th><th class="ce">Lançamentos</th><th class="ce">Liberação</th><th class="ce">Status</th><th></th></tr></thead><tbody>
    ${lista.map(p => { const tc = p.status === 'Em campo' ? travaColheita(p.id, hj) : null; const tr = p.status === 'Em campo' ? travaReentrada(p.id) : null; return `<tr>
      <td><b>${esc(p.codigo || '—')}</b>${pendTag(p)}</td><td>${esc(p.cultura)}${p.variedade ? `<br><span class="dc-sem">${esc(p.variedade)}</span>` : ''}</td>
      <td>${esc(p.local)}</td><td>${esc(p.fazenda || '')}</td><td class="ce">${br(p.data_plantio)}</td><td class="ce">${fmtN(p.area_ha)}</td>
      <td class="ce">${br(p.previsao_colheita)}</td><td class="ce">${regsDo(p.id).length}</td>
      <td class="ce">${tr ? tag('reentrada ' + brDH(tr.liberado_reentrada), 'perigo') : tc ? tag('colheita ' + br(tc.liberado_colheita), 'alerta') : p.status === 'Em campo' ? tag('livre', 'ativo') : '—'}</td>
      <td class="ce">${tag(p.status, COR_PLANTIO[p.status])}</td>
      <td class="ce"><button class="btn mini" type="button" data-pl="${p.id}">Abrir</button> <button class="btn mini" type="button" data-cad="${p.id}" title="Caderno de campo deste plantio">🖨</button></td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="vazio">${C.plantios.length ? 'Nada com esses filtros.' : 'Nenhum plantio cadastrado. Comece por “Novo plantio”.'}</div>`;
  $('ccPlTabela').querySelectorAll('[data-pl]').forEach(b => b.addEventListener('click', () => formPlantio(b.dataset.pl)));
  $('ccPlTabela').querySelectorAll('[data-cad]').forEach(b => b.addEventListener('click', () => mostrar(docCaderno(plantioPorId(b.dataset.cad)), { barra: true })));
}
function formPlantio(id) {
  const p = id ? plantioPorId(id) : null;
  const v = p || { status: 'Em campo', data_plantio: hoje() };
  const val = k => esc(v[k] ?? '');
  const talhoes = C.ref.talhoes;
  dialogo(`<h3>${p ? 'Plantio ' + esc(p.codigo || '') : 'Novo plantio'}</h3>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="grade">
      <label class="campo plena">Talhão / pivô (cadastro da Programação Campo) <select id="cpLocal">${opcoes(talhoes.map(t => [t.id, `${t.fazenda ? t.fazenda + ' › ' : ''}${t.nome}`]), v.local_id, p && !v.local_id ? v.local : '— escolha ou digite abaixo —')}</select></label>
      <label class="campo">Talhão (nome livre) <input type="text" id="cpLocalTxt" maxlength="120" value="${val('local')}" placeholder="Se não estiver na lista"></label>
      <label class="campo">Fazenda <input type="text" id="cpFaz" list="ccLFaz" maxlength="80" value="${val('fazenda')}"></label>
      <label class="campo">Cultura <input type="text" id="cpCult" list="ccLCult" maxlength="60" value="${val('cultura')}" required></label>
      <label class="campo">Variedade / cultivar <input type="text" id="cpVar" maxlength="80" value="${val('variedade')}"></label>
      <label class="campo">Código do plantio <input type="text" id="cpCod" maxlength="40" value="${val('codigo')}" placeholder="Ex.: CEN-26-P1L35"></label>
      <label class="campo">Data do plantio <input type="date" id="cpData" value="${val('data_plantio')}" required></label>
      <label class="campo">Área (ha) <input type="number" step="0.01" min="0" id="cpArea" value="${val('area_ha')}"></label>
      <label class="campo">Densidade / espaçamento <input type="text" id="cpDens" maxlength="80" value="${val('densidade')}" placeholder="Ex.: 1,2 milhão pl/ha · 0,25 × 0,10"></label>
      <label class="campo">Origem da semente / muda <input type="text" id="cpOrig" maxlength="120" value="${val('origem_semente')}" placeholder="Fornecedor"></label>
      <label class="campo">Lote da semente / muda <input type="text" id="cpLote" maxlength="80" value="${val('lote_semente')}"></label>
      <label class="campo">Previsão de colheita <input type="date" id="cpPrev" value="${val('previsao_colheita')}"></label>
      <label class="campo">Status <select id="cpStatus">${opcoes(Object.keys(COR_PLANTIO), v.status)}</select></label>
      <label class="campo plena">Observação <textarea id="cpObs" rows="2" maxlength="1000">${val('observacao')}</textarea></label>
    </div>
    ${datalist('ccLFaz', C.ref.fazendas)}${datalist('ccLCult', C.ref.culturas)}
    <div class="barra fim">
      ${p ? '<button class="btn perigo" type="button" id="cpApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cpGravar">Gravar</button>
    </div>`, () => {
    $('cpLocal').addEventListener('change', () => {
      const t = talhoes.find(x => x.id === $('cpLocal').value); if (!t) return;
      $('cpLocalTxt').value = t.nome; if (t.fazenda) $('cpFaz').value = t.fazenda; if (t.cultura && !$('cpCult').value) $('cpCult').value = t.cultura;
    });
    $('cpGravar').addEventListener('click', async () => {
      const g = i => so($(i).value) || null;
      const linha = { ...(p || { id: novoId(), criado_por: quem() }),
        local_id: g('cpLocal'), local: g('cpLocalTxt') || talhoes.find(x => x.id === g('cpLocal'))?.nome, fazenda: g('cpFaz'), cultura: g('cpCult'), variedade: g('cpVar'),
        codigo: g('cpCod'), data_plantio: g('cpData'), area_ha: num($('cpArea').value), densidade: g('cpDens'), origem_semente: g('cpOrig'), lote_semente: g('cpLote'),
        previsao_colheita: g('cpPrev'), status: $('cpStatus').value, observacao: g('cpObs') };
      if (!linha.local || !linha.cultura || !linha.data_plantio) return erroDlg('Informe o talhão, a cultura e a data do plantio.');
      await gravar('cc_plantios', linha, { novo: !p }); fechar(); redesenhar();
    });
    $('cpApagar')?.addEventListener('click', () => {
      if (regsDo(p.id).length) return erroDlg('Este plantio já tem lançamentos — mude o status para Encerrado em vez de apagar.');
      confirmar('Apagar plantio', esc(rotPlantio(p)), 'Apagar', () => apagarItem('cc_plantios', p.id));
    });
  });
}

/* ===================================================================
   TELA · LANÇAMENTOS
   =================================================================== */
function desenharRegistros() {
  const tela = $('telaCcRegistros');
  const f = C.fr;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Lançamentos de campo', 'Aplicação, adubação, irrigação, monitoramento, operações, colheita, higiene e não conformidades — tudo por plantio, com data, responsável e trilha de auditoria.',
      `<button class="btn principal" type="button" id="ccRgNovo">Novo lançamento</button>`)}
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Plantio <select id="ccRgPl">${opcoesPlantio(f.plantio)}</select></label>
      <label class="campo">Tipo <select id="ccRgTipo">${opcoes(Object.entries(TIPOS).map(([k, t]) => [k, t.nome]), f.tipo, 'Todos')}</select></label>
      <label class="campo">De <input type="date" id="ccRgDe" value="${esc(f.de)}"></label>
      <label class="campo">Até <input type="date" id="ccRgAte" value="${esc(f.ate)}"></label>
      <label class="campo">Situação <select id="ccRgSit">${opcoes(['Lançado', 'Aprovado', 'Cancelado', ['semass', 'Aprovado sem assinatura'], ['receit', 'Aplicação sem receituário'], ['carencia', 'Colheita em carência'], ['aplicad', 'Aplicador irregular'], ['nc', 'NC em aberto']], f.sit, 'Todas')}</select></label>
    </div>
    <div class="barra" id="ccRgResumo"></div>
    <div id="ccRgTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ccRgImprimir">Imprimir a lista</button>
    <button class="btn" type="button" id="ccRgExcel">Exportar Excel</button>
  </div>`;
  const ligar = (id, k, ev = 'change') => $(id).addEventListener(ev, e => { f[k] = e.target.value; tabelaRegistros(); });
  ligar('ccRgPl', 'plantio'); ligar('ccRgTipo', 'tipo'); ligar('ccRgDe', 'de'); ligar('ccRgAte', 'ate'); ligar('ccRgSit', 'sit');
  $('ccRgNovo').addEventListener('click', () => escolherTipo(f.plantio || null));
  $('ccRgImprimir').addEventListener('click', () => mostrar(docRegistros(regsFiltrados()), { barra: true }));
  $('ccRgExcel').addEventListener('click', () => exportarRegistros(regsFiltrados()));
  tabelaRegistros();
}
function regsFiltrados() {
  const f = C.fr, hj = hoje();
  return C.regs.filter(r => (!f.plantio || r.plantio_id === f.plantio) && (!f.tipo || r.tipo === f.tipo)
    && (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate)
    && (!f.sit || (['Lançado', 'Aprovado', 'Cancelado'].includes(f.sit) ? r.situacao === f.sit
      : f.sit === 'semass' ? (r.situacao === 'Aprovado' && !r.assinado_em)
      : f.sit === 'receit' ? (r.tipo === 'aplicacao' && r.situacao !== 'Cancelado' && !so(r.dados?.receituario) && !C.arq.has(String(r.id)))
      : f.sit === 'carencia' ? (r.tipo === 'colheita' && !!travaColheita(r.plantio_id, r.data))
      : f.sit === 'aplicad' ? (r.tipo === 'aplicacao' && r.dados?.aplicador_id && !habilitacao(pessoaPorId(r.dados.aplicador_id), hj).ok)
      : f.sit === 'nc' ? (r.tipo === 'ocorrencia' && r.situacao !== 'Cancelado' && r.dados?.status !== 'Encerrada') : true)))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)));
}
/** Uma linha de resumo do lançamento, por tipo. */
function resumo(r) {
  const d = r.dados || {};
  const prods = (d.produtos || []).map(p => `${p.nome} ${p.dose != null ? fmtN(p.dose, 3) + ' ' + (p.unidade || '') : ''}`.trim()).join(' + ');
  switch (r.tipo) {
    case 'aplicacao': return `${prods}${d.alvo ? ' · alvo: ' + d.alvo : ''}${d.volume_calda ? ' · ' + fmtN(d.volume_calda) + ' L/ha' : ''}`;
    case 'adubacao': return `${prods}${d.forma ? ' · ' + d.forma : ''}`;
    case 'irrigacao': return `${d.lamina_mm != null ? fmtN(d.lamina_mm) + ' mm' : ''}${d.horas ? ' · ' + fmtN(d.horas) + ' h' : ''}${d.fonte ? ' · ' + d.fonte : ''}`;
    case 'monitoramento': return `${d.alvo || ''}${d.nivel ? ' · nível ' + d.nivel : ''}${d.decisao ? ' · ' + d.decisao : ''}`;
    case 'operacao': return `${d.operacao || ''}${d.descricao ? ' · ' + d.descricao : ''}`;
    case 'colheita': return `${d.quantidade != null ? fmtN(d.quantidade) + ' ' + (d.unidade || '') : ''}${d.destino ? ' · ' + d.destino : ''}${d.lote ? ' · lote ' + d.lote : ''}`;
    case 'higiene': return `${d.evento || ''}${d.evento === 'Checklist diário' ? ' · ' + HIGIENE_ITENS.filter(([k]) => d.itens?.[k] === false).length + ' item(ns) com falha' : ''}${d.descricao ? ' · ' + d.descricao : ''}`;
    case 'ocorrencia': return `${d.descricao || ''}${d.status ? ' · ' + d.status : ''}${d.prazo ? ' · prazo ' + br(d.prazo) : ''}`;
  }
  return '';
}
function alertasDe(r) {
  const a = [];
  if (r.tipo === 'aplicacao' && r.situacao !== 'Cancelado') {
    if (!so(r.dados?.receituario) && !C.arq.has(String(r.id))) a.push(tag('sem receituário', 'alerta'));
    if (r.dados?.aplicador_id && !habilitacao(pessoaPorId(r.dados.aplicador_id), r.data).ok) a.push(tag('aplicador irregular', 'perigo'));
  }
  if (r.tipo === 'colheita' && travaColheita(r.plantio_id, r.data)) a.push(tag('carência violada', 'perigo'));
  if (r.tipo === 'ocorrencia' && r.dados?.status !== 'Encerrada' && r.dados?.prazo && r.dados.prazo < hoje()) a.push(tag('prazo vencido', 'perigo'));
  if (r.situacao === 'Aprovado' && !r.assinado_em) a.push(tag('sem assinatura', 'neutra'));
  if (r.versao > 1) a.push(tag('retificado v' + r.versao, 'neutra'));
  return a.join(' ');
}
function tabelaRegistros() {
  const lista = regsFiltrados();
  const conta = s => lista.filter(r => r.situacao === s).length;
  $('ccRgResumo').innerHTML = `<span class="contagem"><b>${lista.length}</b> lançamento(s)</span>
    ${['Lançado', 'Aprovado', 'Cancelado'].map(s => conta(s) ? `<span class="contagem">${tag(s, COR_SIT[s])} <b>${conta(s)}</b></span>` : '').join('')}`;
  $('ccRgTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th class="ce">Data</th><th>Tipo</th><th>Plantio</th><th>Resumo</th><th>Responsável</th><th class="ce">Liberações</th><th class="ce">Situação</th><th></th></tr></thead><tbody>
    ${lista.map(r => `<tr>
      <td class="ce">${br(r.data)}${r.hora_inicio ? `<br><span class="dc-sem">${brHora(r.hora_inicio)}${r.hora_fim ? '–' + brHora(r.hora_fim) : ''}</span>` : ''}</td>
      <td>${TIPOS[r.tipo]?.icone || ''} ${esc(TIPOS[r.tipo]?.curto || r.tipo)}${pendTag(r)}</td>
      <td>${esc(rotPlantio(plantioPorId(r.plantio_id)))}</td>
      <td>${esc(resumo(r))}${C.arq.has(String(r.id)) ? ' 📎' : ''}<br>${alertasDe(r)}</td>
      <td>${esc(r.responsavel || '—')}</td>
      <td class="ce">${r.tipo === 'aplicacao' ? `<span class="dc-sem">reentrada ${brDH(r.liberado_reentrada)}<br>colheita ${br(r.liberado_colheita)}</span>` : '—'}</td>
      <td class="ce">${tag(r.situacao, COR_SIT[r.situacao])}${r.assinado_em ? '<br><span class="dc-sem">assinado</span>' : ''}</td>
      <td class="ce"><button class="btn mini" type="button" data-rg="${r.id}">Abrir</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="vazio">${C.regs.length ? 'Nada com esses filtros.' : 'Nenhum lançamento ainda.'}</div>`;
  $('ccRgTabela').querySelectorAll('[data-rg]').forEach(b => b.addEventListener('click', () => formRegistro(b.dataset.rg)));
}

/** Botões grandes para escolher o tipo — pensado para o celular no campo. */
function escolherTipo(plantioId) {
  if (!C.plantios.some(p => ['Em campo', 'Planejado'].includes(p.status))) return dialogo(`<h3>Novo lançamento</h3><p class="dica">Cadastre um plantio primeiro: todo lançamento pendura num plantio.</p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button><button class="btn principal" type="button" id="ccIrPl">Novo plantio</button></div>`,
    () => $('ccIrPl').addEventListener('click', () => formPlantio(null)));
  dialogo(`<h3>O que aconteceu no campo?</h3>
    <div class="cc-tipos">${Object.entries(TIPOS).map(([k, t]) => `<button type="button" class="cc-tipo" data-tipo="${k}"><span>${t.icone}</span>${esc(t.nome)}</button>`).join('')}</div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button></div>`,
    d => d.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => formRegistro(null, b.dataset.tipo, plantioId))));
}

/* ----- o formulário de lançamento (um por tipo, mesma moldura) ----- */
let anexosReg = null;
let prodTipos = TIPOS_INSUMO;
function linhaProd(p = {}) {
  const ins = C.insumos.filter(i => i.ativo && prodTipos.includes(i.tipo));
  return `<div class="cc-prod">
    <select class="cc-pi">${opcoes(ins.map(i => [i.id, `${i.nome}${i.tipo === 'Defensivo' && i.registro_mapa ? ' · MAPA ' + i.registro_mapa : ''}`]), p.insumo_id, '— produto —')}</select>
    <input type="number" step="0.001" min="0" class="cc-pd" value="${esc(p.dose ?? '')}" placeholder="dose">
    <select class="cc-pu">${opcoes(UNID_DOSE, p.unidade || '', '—')}</select>
    <button type="button" class="btn mini cc-px" title="Tirar">✕</button></div>`;
}
function campoProdutos(lista, tipos) {
  prodTipos = tipos;
  return `<div class="campo plena"><span>Produtos <small>${tipos.join(', ').toLowerCase()} do cadastro de insumos</small></span>
    <div id="cpProds">${(lista.length ? lista : [{}]).map(p => linhaProd(p)).join('')}</div>
    <div><button type="button" class="btn mini" id="cpProdMais">+ produto</button></div>
    <p class="dica" id="cpProdInfo"></p></div>`;
}
function lerProdutos() {
  return [...document.querySelectorAll('#cpProds .cc-prod')].map(d => {
    const id = d.querySelector('.cc-pi').value, ins = insumoPorId(id);
    return id ? { insumo_id: id, nome: ins?.nome || '', dose: num(d.querySelector('.cc-pd').value), unidade: d.querySelector('.cc-pu').value || null, registro_mapa: ins?.registro_mapa || null, ingrediente_ativo: ins?.ingrediente_ativo || null } : null;
  }).filter(Boolean);
}
function ligarProdutos(cultura) {
  const info = () => {
    const ps = lerProdutos();
    $('cpProdInfo').innerHTML = ps.map(p => { const i = insumoPorId(p.insumo_id); if (!i) return '';
      const c = carenciaDe(i, cultura);
      return `<b>${esc(i.nome)}</b>: ${i.ingrediente_ativo ? esc(i.ingrediente_ativo) + ' · ' : ''}${c != null ? 'carência ' + c + ' d' : 'carência não cadastrada'}${i.reentrada_horas != null ? ' · REI ' + i.reentrada_horas + ' h' : ''}${i.dose_max != null ? ' · máx. ' + fmtN(i.dose_max, 3) + ' ' + (i.dose_unidade || '') : ''}${(i.culturas || []).length && !i.culturas.includes(cultura) ? ' · <span class="tag perigo">não autorizado para ' + esc(cultura) + '</span>' : ''}`; }).join('<br>');
    const ev = new CustomEvent('cc:produtos'); document.dispatchEvent(ev);
  };
  $('cpProds').addEventListener('change', e => {
    if (e.target.classList.contains('cc-pi')) { const i = insumoPorId(e.target.value); const u = e.target.closest('.cc-prod').querySelector('.cc-pu'); if (i?.dose_unidade && !u.value) u.value = i.dose_unidade; }
    info();
  });
  $('cpProds').addEventListener('input', info);
  $('cpProds').addEventListener('click', e => { if (e.target.classList.contains('cc-px')) { if ($('cpProds').children.length > 1) e.target.closest('.cc-prod').remove(); info(); } });
  $('cpProdMais').addEventListener('click', () => { $('cpProds').insertAdjacentHTML('beforeend', linhaProd()); });
  info();
}
function camposDoTipo(tipo, d, plantio) {
  const val = k => esc(d[k] ?? '');
  const pessoas = C.ref.pessoas, equips = C.ref.equipamentos;
  const selPessoa = (id, idSel, rot, txtId, txt) => `<label class="campo">${rot} <select id="${idSel}">${opcoes(pessoas.map(p => [p.id, `${p.nome}${p.cargo ? ' · ' + p.cargo : ''}`]), id, '— do cadastro de Pessoas —')}</select></label>
    <label class="campo">${rot} (fora do cadastro) <input type="text" id="${txtId}" maxlength="120" value="${esc(txt || '')}" placeholder="Nome, se não estiver na lista"></label>`;
  const selEquip = (id, txt) => `<label class="campo">Equipamento <select id="cpEquip">${opcoes(equips.map(e => [e.id, `${e.codigo} · ${e.descricao}`]), id, txt ? txt : '— nenhum —')}</select></label>`;
  switch (tipo) {
    case 'aplicacao': return `
      ${campoProdutos(d.produtos || [], ['Defensivo', 'Biológico', 'Adjuvante'])}
      <label class="campo">Alvo (praga, doença, planta daninha) <input type="text" id="cpAlvo" list="ccLAlvo" maxlength="120" value="${val('alvo')}" required></label>
      <label class="campo">Justificativa técnica <input type="text" id="cpJust" maxlength="200" value="${val('justificativa')}" placeholder="Nível de dano, monitoramento de…"></label>
      <label class="campo">Volume de calda (L/ha) <input type="number" step="0.1" min="0" id="cpCalda" value="${val('volume_calda')}"></label>
      <label class="campo">Área tratada (ha) <input type="number" step="0.01" min="0" id="cpArea" value="${esc(d.area_ha ?? plantio?.area_ha ?? '')}"></label>
      ${selEquip(d.equipamento_id, d.equipamento_id ? '' : d.equipamento)}
      ${selPessoa(d.aplicador_id, 'cpAplic', 'Aplicador', 'cpAplicTxt', d.aplicador_id ? '' : d.aplicador)}
      <p class="dica plena" id="cpHabil"></p>
      <label class="campo">Vento (km/h) <input type="number" step="0.1" min="0" id="cpVento" value="${val('vento')}"></label>
      <label class="campo">Temperatura (°C) <input type="number" step="0.1" id="cpTemp" value="${val('temperatura')}"></label>
      <label class="campo">Umidade (%) <input type="number" step="1" min="0" max="100" id="cpUmid" value="${val('umidade')}"></label>
      <label class="campo plena">EPI usado <input type="text" id="cpEpi" maxlength="200" value="${esc(d.epi ?? 'Macacão hidrorrepelente, luvas nitrílicas, botas, viseira, respirador')}"></label>
      <label class="campo">Nº do receituário agronômico <input type="text" id="cpRec" maxlength="60" value="${val('receituario')}"></label>
      <label class="campo">Embalagens vazias <select id="cpEmb">${opcoes(EMBALAGENS, d.embalagens || EMBALAGENS[0])}</select></label>
      <p class="dica plena" id="cpLib"></p>
      ${datalist('ccLAlvo', C.regs.filter(r => r.tipo === 'aplicacao').map(r => r.dados?.alvo))}`;
    case 'adubacao': return `
      ${campoProdutos(d.produtos || [], ['Fertilizante', 'Corretivo'])}
      <label class="campo">Forma de aplicação <input type="text" id="cpForma" list="ccLForma" maxlength="80" value="${val('forma')}"></label>
      <label class="campo">Área (ha) <input type="number" step="0.01" min="0" id="cpArea" value="${esc(d.area_ha ?? plantio?.area_ha ?? '')}"></label>
      <label class="campo">Lote do produto <input type="text" id="cpLote" maxlength="80" value="${val('lote')}"></label>
      <label class="campo">Recomendação técnica <input type="text" id="cpRecom" maxlength="200" value="${val('recomendacao')}" placeholder="Nº / análise de solo de referência"></label>
      ${selEquip(d.equipamento_id, d.equipamento_id ? '' : d.equipamento)}
      ${datalist('ccLForma', ['A lanço', 'Sulco de plantio', 'Cobertura', 'Fertirrigação', 'Foliar', 'Incorporado'])}`;
    case 'irrigacao': return `
      <label class="campo">Lâmina (mm) <input type="number" step="0.1" min="0" id="cpLamina" value="${val('lamina_mm')}"></label>
      <label class="campo">Horas de funcionamento <input type="number" step="0.1" min="0" id="cpHoras" value="${val('horas')}"></label>
      <label class="campo">Fonte de água <input type="text" id="cpFonte" list="ccLFonte" maxlength="80" value="${val('fonte')}" placeholder="Poço, córrego, reservatório"></label>
      <label class="campo">Outorga nº <input type="text" id="cpOutorga" maxlength="60" value="${val('outorga')}"></label>
      ${selEquip(d.equipamento_id, d.equipamento_id ? '' : d.equipamento)}
      <label class="campo">Método <input type="text" id="cpMetodo" list="ccLMet" maxlength="60" value="${val('metodo')}"></label>
      ${datalist('ccLFonte', C.analises.map(a => a.ponto))}${datalist('ccLMet', ['Pivô central', 'Gotejamento', 'Aspersão', 'Microaspersão'])}`;
    case 'monitoramento': return `
      <label class="campo">Alvo monitorado <input type="text" id="cpAlvo" list="ccLAlvo" maxlength="120" value="${val('alvo')}" required></label>
      <label class="campo">Nível encontrado <input type="text" id="cpNivel" maxlength="60" value="${val('nivel')}" placeholder="Ex.: 3 lagartas/m · 12% de folhas"></label>
      <label class="campo">Método de contagem <input type="text" id="cpMetodo" maxlength="80" value="${val('metodo')}" placeholder="Pano de batida, armadilha, 10 pontos"></label>
      <label class="campo">Nível de ação <input type="text" id="cpNivelAcao" maxlength="60" value="${val('nivel_acao')}"></label>
      <label class="campo">Decisão <select id="cpDecisao">${opcoes(DECISOES, d.decisao || 'Monitorar de novo')}</select></label>
      <label class="campo plena">Observação <textarea id="cpObs" rows="2" maxlength="600">${val('observacao')}</textarea></label>
      ${datalist('ccLAlvo', C.regs.filter(r => ['aplicacao', 'monitoramento'].includes(r.tipo)).map(r => r.dados?.alvo))}`;
    case 'operacao': return `
      <label class="campo">Operação <select id="cpOper">${opcoes(OPERACOES, d.operacao || OPERACOES[0])}</select></label>
      ${selEquip(d.equipamento_id, d.equipamento_id ? '' : d.equipamento)}
      <label class="campo plena">Descrição <input type="text" id="cpDesc" maxlength="300" value="${val('descricao')}"></label>`;
    case 'colheita': return `
      <label class="campo">Quantidade <input type="number" step="0.01" min="0" id="cpQtd" value="${val('quantidade')}" required></label>
      <label class="campo">Unidade <select id="cpUnid">${opcoes(UNID_COLHEITA, d.unidade || 'caixas')}</select></label>
      <label class="campo">Equipe / nº de pessoas <input type="text" id="cpEquipe" maxlength="120" value="${val('equipe')}"></label>
      <label class="campo">Destino <input type="text" id="cpDest" list="ccLDest" maxlength="120" value="${val('destino')}" placeholder="Packing, cliente"></label>
      <label class="campo">Código do lote <small>referência para o app de rastreabilidade</small> <input type="text" id="cpLote" maxlength="60" value="${val('lote')}"></label>
      <p class="dica plena" id="cpCarencia"></p>
      ${datalist('ccLDest', C.regs.filter(r => r.tipo === 'colheita').map(r => r.dados?.destino))}`;
    case 'higiene': return `
      <label class="campo">Evento <select id="cpEvento">${opcoes(TIPOS_HIGIENE, d.evento || TIPOS_HIGIENE[0])}</select></label>
      <div class="campo plena" id="cpItensWrap"><span>Checklist</span><div class="ce-caixas">
        ${HIGIENE_ITENS.map(([k, t]) => `<label class="rs-check"><input type="checkbox" data-hi="${k}" ${d.itens?.[k] !== false ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>
      <label class="campo plena">Descrição / o que foi feito <textarea id="cpDesc" rows="2" maxlength="600">${val('descricao')}</textarea></label>`;
    case 'ocorrencia': return `
      <label class="campo plena">Não conformidade <textarea id="cpDesc" rows="2" maxlength="600" required>${val('descricao')}</textarea></label>
      <label class="campo plena">Ação corretiva <textarea id="cpAcao" rows="2" maxlength="600">${val('acao_corretiva')}</textarea></label>
      <label class="campo">Responsável pela ação <input type="text" id="cpRespAcao" maxlength="120" value="${val('responsavel_acao')}"></label>
      <label class="campo">Prazo <input type="date" id="cpPrazo" value="${val('prazo')}"></label>
      <label class="campo">Status <select id="cpStatusNc">${opcoes(STATUS_NC, d.status || 'Aberta')}</select></label>
      <label class="campo">Encerrada em <input type="date" id="cpEnc" value="${val('encerrada_em')}"></label>`;
  }
  return '';
}
function lerDados(tipo) {
  const g = i => so($(i)?.value) || null, n = i => num($(i)?.value);
  const equip = () => { const id = g('cpEquip'); const e = C.ref.equipamentos.find(x => x.id === id); return { equipamento_id: id, equipamento: e ? `${e.codigo} · ${e.descricao}` : null }; };
  switch (tipo) {
    case 'aplicacao': { const ap = pessoaPorId(g('cpAplic')); return { produtos: lerProdutos(), alvo: g('cpAlvo'), justificativa: g('cpJust'), volume_calda: n('cpCalda'), area_ha: n('cpArea'), ...equip(),
      aplicador_id: ap?.id || null, aplicador: ap?.nome || g('cpAplicTxt'), vento: n('cpVento'), temperatura: n('cpTemp'), umidade: n('cpUmid'), epi: g('cpEpi'), receituario: g('cpRec'), embalagens: g('cpEmb') }; }
    case 'adubacao': return { produtos: lerProdutos(), forma: g('cpForma'), area_ha: n('cpArea'), lote: g('cpLote'), recomendacao: g('cpRecom'), ...equip() };
    case 'irrigacao': return { lamina_mm: n('cpLamina'), horas: n('cpHoras'), fonte: g('cpFonte'), outorga: g('cpOutorga'), metodo: g('cpMetodo'), ...equip() };
    case 'monitoramento': return { alvo: g('cpAlvo'), nivel: g('cpNivel'), metodo: g('cpMetodo'), nivel_acao: g('cpNivelAcao'), decisao: g('cpDecisao'), observacao: g('cpObs') };
    case 'operacao': return { operacao: g('cpOper'), descricao: g('cpDesc'), ...equip() };
    case 'colheita': return { quantidade: n('cpQtd'), unidade: g('cpUnid'), equipe: g('cpEquipe'), destino: g('cpDest'), lote: g('cpLote') };
    case 'higiene': { const itens = {}; document.querySelectorAll('#dlgCc [data-hi]').forEach(x => { itens[x.dataset.hi] = x.checked; }); return { evento: g('cpEvento'), itens, descricao: g('cpDesc') }; }
    case 'ocorrencia': return { descricao: g('cpDesc'), acao_corretiva: g('cpAcao'), responsavel_acao: g('cpRespAcao'), prazo: g('cpPrazo'), status: g('cpStatusNc'), encerrada_em: g('cpEnc') };
  }
  return {};
}
function responsavelDe(tipo, dados, formulario) {
  if (tipo === 'aplicacao') return dados.aplicador || null;
  return so($('cpResp')?.value) || null;
}

function formRegistro(id, tipoNovo, plantioId) {
  const r = id ? C.regs.find(x => x.id === id) : null;
  const tipo = r ? r.tipo : tipoNovo;
  const T = TIPOS[tipo];
  const d = r ? (r.dados || {}) : {};
  const aprovado = r?.situacao === 'Aprovado';
  const plantioIni = r?.plantio_id || plantioId || (C.plantios.find(p => p.status === 'Em campo')?.id ?? '');
  dialogo(`<h3>${T.icone} ${esc(T.nome)}${r ? ` <span class="tag ${COR_SIT[r.situacao]}">${esc(r.situacao)}</span>${r.versao > 1 ? ` <span class="tag neutra">v${r.versao}</span>` : ''}` : ''}</h3>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="aviso info" id="ccAviso" hidden></div>
    <div class="grade">
      <label class="campo plena">Plantio <select id="cpPlantio" ${aprovado ? 'disabled' : ''}>${opcoes(C.plantios.filter(p => ['Em campo', 'Planejado'].includes(p.status) || p.id === plantioIni).map(p => [p.id, rotPlantio(p)]), plantioIni, '— escolha —')}</select></label>
      <label class="campo">Data <input type="date" id="cpData" value="${esc(r?.data || hoje())}" required></label>
      <label class="campo">Início <input type="time" id="cpHi" value="${esc(brHora(r?.hora_inicio) || (r ? '' : agoraHM()))}"></label>
      <label class="campo">Fim <input type="time" id="cpHf" value="${esc(brHora(r?.hora_fim))}"></label>
      ${tipo !== 'aplicacao' ? `<label class="campo">Responsável <input type="text" id="cpResp" list="ccLResp" maxlength="120" value="${esc(r?.responsavel || '')}"></label>` : ''}
      ${camposDoTipo(tipo, d, plantioPorId(plantioIni))}
      <div class="plena" id="cpAnexos"></div>
      ${aprovado ? `<label class="campo plena">Motivo da retificação <small>obrigatório: o registro já foi aprovado e a versão anterior fica guardada</small><input type="text" id="cpMotivo" maxlength="300" required></label>` : ''}
    </div>
    ${r ? `<p class="dica" style="margin-top:10px">Lançado por ${esc(r.criado_por || '—')} em ${brDH(r.criado_em)}${r.aprovado_em ? ` · aprovado por ${esc(r.aprovado_por)} em ${brDH(r.aprovado_em)}` : ''}${r.assinado_em ? ` · assinado por ${esc(r.assinado_por)} em ${brDH(r.assinado_em)}` : ''}${r.lat ? ` · GPS ${r.lat}, ${r.lng}` : ''}</p>
      ${r.versao > 1 ? `<button class="ce-link dc-sem" type="button" id="cpVersoes">Ver versões anteriores</button><div id="cpVersoesLista"></div>` : ''}` : ''}
    ${datalist('ccLResp', [...C.ref.pessoas.map(p => p.nome), ...C.regs.map(x => x.responsavel)])}
    <div class="barra fim">
      ${r && r.situacao !== 'Aprovado' && r.situacao !== 'Cancelado' ? '<button class="btn perigo" type="button" id="cpApagar">Apagar</button>' : ''}
      ${r && r.situacao === 'Aprovado' ? '<button class="btn perigo" type="button" id="cpCancelar">Cancelar registro</button>' : ''}
      <span class="cresce"></span>
      ${r && r.situacao === 'Lançado' ? '<button class="btn" type="button" id="cpAprovar">Aprovar</button>' : ''}
      ${r && r.situacao === 'Aprovado' && !r.assinado_em ? '<button class="btn" type="button" id="cpAssinar">Assinar (técnico)</button>' : ''}
      <button class="btn" type="button" data-fechar>Fechar</button>
      ${r?.situacao === 'Cancelado' ? '' : '<button class="btn principal" type="button" id="cpGravar">Gravar</button>'}
    </div>`, () => {
    const plantio = () => plantioPorId($('cpPlantio').value);
    // dicas vivas
    if (tipo === 'aplicacao') {
      ligarProdutos(plantio()?.cultura);
      const lib = () => { const l = liberacoes($('cpData').value || hoje(), $('cpHf').value, lerProdutos(), plantio()?.cultura);
        $('cpLib').innerHTML = (l.colheita ? `Colheita liberada em <b>${br(l.colheita)}</b> (carência ${l.carencia} d)` : 'Carência não cadastrada nos produtos') + ' · ' + (l.reentrada ? `reentrada liberada em <b>${brDH(l.reentrada)}</b> (REI ${l.rei} h)` : 'REI não cadastrado'); };
      const hab = () => { const p = pessoaPorId($('cpAplic').value); if (!p) { $('cpHabil').innerHTML = ''; return; } const h = habilitacao(p, $('cpData').value || hoje());
        $('cpHabil').innerHTML = h.ok ? `<span class="tag ativo">habilitado</span> NR-31 até ${br(p.nr31_vence)} · ASO até ${br(p.aso_vence)}` : `<span class="tag perigo">não habilitado</span> ${esc(h.motivos.join('; '))}`; };
      document.addEventListener('cc:produtos', lib); ['cpData', 'cpHf', 'cpPlantio'].forEach(i => $(i).addEventListener('change', lib)); ['cpAplic', 'cpData'].forEach(i => $(i).addEventListener('change', hab)); lib(); hab();
    }
    if (tipo === 'adubacao') ligarProdutos(plantio()?.cultura);
    if (tipo === 'colheita') {
      const car = () => { const t = travaColheita($('cpPlantio').value, $('cpData').value || hoje());
        $('cpCarencia').innerHTML = t ? `<span class="tag perigo">em carência</span> ${esc((t.dados?.produtos || []).map(p => p.nome).join(', '))} aplicado em ${br(t.data)} — colheita liberada só em <b>${br(t.liberado_colheita)}</b>.` : '<span class="tag ativo">carência OK</span> nenhuma aplicação trava a colheita nessa data.'; };
      ['cpPlantio', 'cpData'].forEach(i => $(i).addEventListener('change', car)); car();
    }
    if (tipo === 'higiene') { const mostra = () => { $('cpItensWrap').hidden = $('cpEvento').value !== 'Checklist diário'; }; $('cpEvento').addEventListener('change', mostra); mostra(); }
    anexosReg = campoAnexos($('cpAnexos'), { area: 'certificacao', tipo: 'caderno', rotulo: 'Anexos', dica: tipo === 'aplicacao' ? 'receituário, nota da embalagem, foto' : 'fotos e documentos' });
    anexosReg.abrir(r ? r.id : null);
    $('cpVersoes')?.addEventListener('click', async () => {
      const { data, error } = await estado.cliente.from('cc_registro_versoes').select('*').eq('registro_id', r.id).order('versao');
      $('cpVersoesLista').innerHTML = error ? `<p class="dica">Não consegui ler (${esc(error.message)}).</p>` : (data || []).map(v => `<p class="dica"><b>v${v.versao}</b> · ${brDH(v.alterado_em)} · ${esc(v.alterado_por || '')} · motivo: ${esc(v.motivo || '')}<br><span class="rel-miudo">${esc(resumo(v.conteudo))} · ${br(v.conteudo.data)} · ${esc(v.conteudo.responsavel || '')}</span></p>`).join('') || '<p class="dica">Sem versões.</p>';
    });

    $('cpGravar')?.addEventListener('click', async () => {
      const p = plantio(); if (!p) return erroDlg('Escolha o plantio.');
      const data = $('cpData').value; if (!data) return erroDlg('Informe a data.');
      const dados = lerDados(tipo); dados._id = r?.id;
      const linha = { ...(r || { id: novoId(), situacao: 'Lançado', versao: 1, criado_por: quem(), criado_em: new Date().toISOString() }),
        plantio_id: p.id, tipo, data, hora_inicio: $('cpHi').value || null, hora_fim: $('cpHf').value || null, dados };
      delete dados._id;
      linha.responsavel = tipo === 'aplicacao' ? (dados.aplicador || null) : (so($('cpResp')?.value) || null);
      if (aprovado) { linha.motivo_retificacao = so($('cpMotivo').value); if (!linha.motivo_retificacao) return erroDlg('Informe o motivo da retificação.'); }
      else linha.motivo_retificacao = null;
      let avisos = [];
      if (tipo === 'aplicacao') {
        const v = validarAplicacao(p, { ...dados, _id: r?.id }, data);
        if (v.erros.length) return erroDlg('<b>Não dá para lançar:</b><br>' + v.erros.map(esc).join('<br>'));
        avisos = v.avisos;
        const l = liberacoes(data, linha.hora_fim, dados.produtos, p.cultura);
        linha.liberado_colheita = l.colheita; linha.liberado_reentrada = l.reentrada;
      }
      if (tipo === 'colheita') {
        const t = travaColheita(p.id, data);
        if (t) return erroDlg(`<b>Colheita bloqueada:</b> ${esc((t.dados?.produtos || []).map(x => x.nome).join(', '))} aplicado em ${br(t.data)} libera a colheita só em ${br(t.liberado_colheita)}.`);
        if (dados.quantidade == null) return erroDlg('Informe a quantidade colhida.');
        dados.carencia_ok = true;
      }
      if (tipo === 'ocorrencia' && !dados.descricao) return erroDlg('Descreva a não conformidade.');
      if (tipo === 'monitoramento' && !dados.alvo) return erroDlg('Informe o alvo monitorado.');
      if (avisos.length && !$('ccAviso').dataset.visto) { $('ccAviso').innerHTML = '<b>Atenção</b> (pode gravar mesmo assim):<br>' + avisos.map(esc).join('<br>'); $('ccAviso').hidden = false; $('ccAviso').dataset.visto = '1'; $('cpGravar').textContent = 'Gravar mesmo assim'; $('dlgCc').scrollTop = 0; return; }
      if (!r) await posicao(linha);
      const anexos = anexosReg;
      $('cpGravar').disabled = true;
      await gravar('cc_registros', linha, { novo: !r });
      if (anexos?.mudou) C.arq.add(String(linha.id));
      if (anexos) anexos.salvar(linha.id).catch(e => alert('O lançamento foi gravado, mas o anexo não: ' + e.message));
      fechar(); redesenhar();
    });
    $('cpAprovar')?.addEventListener('click', () => confirmar('Aprovar lançamento', 'Depois de aprovado, o registro só muda com motivo e a versão anterior fica guardada.', 'Aprovar',
      () => gravar('cc_registros', { ...r, situacao: 'Aprovado', aprovado_por: quem(), aprovado_em: new Date().toISOString() }), false));
    $('cpAssinar')?.addEventListener('click', () => {
      const t = tecnico();
      if (!t.nome) return erroDlg('Cadastre o responsável técnico (nome e CREA) em Relatórios › Responsável técnico.');
      confirmar('Assinar como responsável técnico', `${esc(t.nome)}${t.crea ? ' · CREA ' + esc(t.crea) : ''} assina este registro agora (${brDH(new Date().toISOString())}).`, 'Assinar',
        () => gravar('cc_registros', { ...r, assinado_por: `${t.nome}${t.crea ? ' · CREA ' + t.crea : ''}`, assinado_em: new Date().toISOString() }), false);
    });
    $('cpApagar')?.addEventListener('click', () => confirmar('Apagar lançamento', 'Só registros ainda não aprovados podem ser apagados.', 'Apagar', () => apagarItem('cc_registros', r.id)));
    $('cpCancelar')?.addEventListener('click', () => {
      const motivo = so($('cpMotivo')?.value); if (!motivo) return erroDlg('Informe o motivo (campo “Motivo da retificação”) para cancelar um registro aprovado.');
      confirmar('Cancelar registro', 'O registro fica marcado como Cancelado e a versão aprovada fica guardada.', 'Cancelar registro', () => gravar('cc_registros', { ...r, situacao: 'Cancelado', motivo_retificacao: motivo }));
    });
  });
}
/** GPS no primeiro lançamento (não trava: 4 s e segue sem). */
function posicao(linha) {
  return new Promise(res => {
    if (!navigator.geolocation) return res();
    let feito = false; const fim = () => { if (!feito) { feito = true; res(); } };
    navigator.geolocation.getCurrentPosition(p => { linha.lat = Number(p.coords.latitude.toFixed(6)); linha.lng = Number(p.coords.longitude.toFixed(6)); fim(); }, fim, { timeout: 4000, maximumAge: 60000 });
    setTimeout(fim, 4500);
  });
}

/* ===================================================================
   TELA · INSUMOS
   =================================================================== */
function desenharInsumos() {
  const tela = $('telaCcInsumos');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Insumos', 'Defensivos, biológicos, adjuvantes, fertilizantes e corretivos. A carência, o REI e a dose máxima daqui alimentam as travas do lançamento.',
      `<button class="btn principal" type="button" id="ccInNovo">Novo insumo</button>`)}
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Buscar <input type="text" id="ccInQ" value="${esc(C.fi.q)}" placeholder="Nome, ingrediente ativo, nº MAPA"></label>
      <label class="campo">Tipo <select id="ccInTipo">${opcoes(TIPOS_INSUMO, C.fi.tipo, 'Todos')}</select></label>
    </div>
    <div id="ccInTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="ccInImprimir">Imprimir a lista</button></div>`;
  $('ccInQ').addEventListener('input', e => { C.fi.q = e.target.value; tabelaInsumos(); });
  $('ccInTipo').addEventListener('change', e => { C.fi.tipo = e.target.value; tabelaInsumos(); });
  $('ccInNovo').addEventListener('click', () => formInsumo(null));
  $('ccInImprimir').addEventListener('click', () => mostrar(docInsumos(insumosFiltrados()), { barra: true }));
  tabelaInsumos();
}
const insumosFiltrados = () => { const q = so(C.fi.q).toLowerCase(); return C.insumos.filter(i => (!C.fi.tipo || i.tipo === C.fi.tipo) && (!q || `${i.nome} ${i.ingrediente_ativo} ${i.registro_mapa}`.toLowerCase().includes(q))); };
function tabelaInsumos() {
  const lista = insumosFiltrados();
  $('ccInTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th>Produto</th><th>Tipo</th><th>Ingrediente ativo / fórmula</th><th class="ce">Nº MAPA</th><th class="ce">Tox.</th><th class="ce">Carência</th><th class="ce">REI</th><th class="ce">Dose máx.</th><th>Culturas</th><th class="ce">Ativo</th><th></th></tr></thead><tbody>
    ${lista.map(i => `<tr>
      <td><b>${esc(i.nome)}</b>${pendTag(i)}</td><td>${esc(i.tipo)}</td><td>${esc(i.ingrediente_ativo || i.formula || '—')}</td>
      <td class="ce">${i.tipo === 'Defensivo' ? (i.registro_mapa ? esc(i.registro_mapa) : tag('falta', 'perigo')) : esc(i.registro_mapa || '—')}</td><td class="ce">${esc(i.classe_tox || '—')}</td>
      <td class="ce">${i.carencia_dias != null ? i.carencia_dias + ' d' : '—'}${Object.keys(i.carencias || {}).length ? `<br><span class="dc-sem">${esc(Object.entries(i.carencias).map(([c, d]) => c + ' ' + d + 'd').join(' · '))}</span>` : ''}</td>
      <td class="ce">${i.reentrada_horas != null ? i.reentrada_horas + ' h' : '—'}</td><td class="ce">${i.dose_max != null ? fmtN(i.dose_max, 3) + ' ' + esc(i.dose_unidade || '') : '—'}</td>
      <td class="rel-miudo">${esc((i.culturas || []).join(', ') || 'sem restrição')}</td><td class="ce">${tag(i.ativo ? 'sim' : 'não', i.ativo ? 'ativo' : 'inativo')}</td>
      <td class="ce"><button class="btn mini" type="button" data-in="${i.id}">Abrir</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="vazio">${C.insumos.length ? 'Nada com esses filtros.' : 'Nenhum insumo cadastrado. Comece pelos defensivos usados na safra, com o nº MAPA, a carência e o intervalo de reentrada do rótulo.'}</div>`;
  $('ccInTabela').querySelectorAll('[data-in]').forEach(b => b.addEventListener('click', () => formInsumo(b.dataset.in)));
}
function formInsumo(id) {
  const i = id ? insumoPorId(id) : null;
  const v = i || { tipo: C.fi.tipo || 'Defensivo', ativo: true, culturas: [], carencias: {} };
  const val = k => esc(v[k] ?? '');
  const cults = [...new Set([...C.ref.culturas, ...C.plantios.map(p => p.cultura), ...(v.culturas || []), ...Object.keys(v.carencias || {})])].filter(Boolean).sort();
  dialogo(`<h3>${i ? esc(i.nome) : 'Novo insumo'}</h3>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="grade">
      <label class="campo">Tipo <select id="ciTipo">${opcoes(TIPOS_INSUMO, v.tipo)}</select></label>
      <label class="campo">Nome comercial <input type="text" id="ciNome" maxlength="120" value="${val('nome')}" required></label>
      <label class="campo">Ingrediente ativo <input type="text" id="ciIa" maxlength="200" value="${val('ingrediente_ativo')}"></label>
      <label class="campo">Nº registro MAPA <input type="text" id="ciMapa" maxlength="30" value="${val('registro_mapa')}"></label>
      <label class="campo">Classe toxicológica <select id="ciTox">${opcoes(['I', 'II', 'III', 'IV', 'V', 'NC'], v.classe_tox, '—')}</select></label>
      <label class="campo">Classe ambiental <select id="ciAmb">${opcoes(['I', 'II', 'III', 'IV'], v.classe_amb, '—')}</select></label>
      <label class="campo">Grupo químico <input type="text" id="ciGrupo" maxlength="120" value="${val('grupo_quimico')}"></label>
      <label class="campo">Fórmula (fertilizante) <input type="text" id="ciForm" maxlength="60" value="${val('formula')}" placeholder="04-14-08"></label>
      <label class="campo">Carência padrão (dias) <input type="number" min="0" step="1" id="ciCar" value="${val('carencia_dias')}"></label>
      <label class="campo">Reentrada – REI (horas) <input type="number" min="0" step="0.5" id="ciRei" value="${val('reentrada_horas')}"></label>
      <label class="campo">Dose máxima <input type="number" min="0" step="0.001" id="ciDose" value="${val('dose_max')}"></label>
      <label class="campo">Unidade da dose <select id="ciUnid">${opcoes(UNID_DOSE, v.dose_unidade, '—')}</select></label>
      <label class="campo">Nº máx. de aplicações por ciclo <input type="number" min="0" step="1" id="ciMax" value="${val('max_aplicacoes')}"></label>
      <label class="campo">Fornecedor <input type="text" id="ciForn" maxlength="120" value="${val('fornecedor')}"></label>
      <div class="campo plena"><span>Culturas autorizadas <small>vazio = sem restrição cadastrada · a carência por cultura vale sobre a padrão</small></span>
        <div class="cc-cults">${cults.map(c => `<label class="rs-check"><input type="checkbox" data-cult="${esc(c)}" ${(v.culturas || []).includes(c) ? 'checked' : ''}> ${esc(c)}
          <input type="number" min="0" step="1" class="cc-carc" data-carc="${esc(c)}" value="${esc(v.carencias?.[c] ?? '')}" placeholder="carência d" title="Carência específica (dias)"></label>`).join('')}
        <label class="rs-check">+ <input type="text" id="ciCultNova" placeholder="outra cultura" maxlength="60"></label></div></div>
      <label class="campo plena">Observação <textarea id="ciObs" rows="2" maxlength="600">${val('observacao')}</textarea></label>
      <label class="campo rs-check"><input type="checkbox" id="ciAtivo" ${v.ativo ? 'checked' : ''}> Ativo (aparece nos lançamentos)</label>
    </div>
    <div class="barra fim">
      ${i ? '<button class="btn perigo" type="button" id="ciApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="ciGravar">Gravar</button>
    </div>`, () => {
    $('ciGravar').addEventListener('click', async () => {
      const g = x => so($(x).value) || null;
      const culturas = [...document.querySelectorAll('#dlgCc [data-cult]')].filter(x => x.checked).map(x => x.dataset.cult);
      const nova = g('ciCultNova'); if (nova) culturas.push(nova);
      const carencias = {}; document.querySelectorAll('#dlgCc [data-carc]').forEach(x => { if (so(x.value) !== '') carencias[x.dataset.carc] = Number(x.value); });
      const linha = { ...(i || { id: novoId() }), tipo: $('ciTipo').value, nome: g('ciNome'), ingrediente_ativo: g('ciIa'), registro_mapa: g('ciMapa'), classe_tox: g('ciTox'), classe_amb: g('ciAmb'),
        grupo_quimico: g('ciGrupo'), formula: g('ciForm'), carencia_dias: num($('ciCar').value), carencias, reentrada_horas: num($('ciRei').value), dose_max: num($('ciDose').value), dose_unidade: g('ciUnid'),
        max_aplicacoes: num($('ciMax').value), culturas, fornecedor: g('ciForn'), observacao: g('ciObs'), ativo: $('ciAtivo').checked };
      if (!linha.nome) return erroDlg('Informe o nome do produto.');
      if (linha.tipo === 'Defensivo' && (linha.carencia_dias == null || linha.reentrada_horas == null)) return erroDlg('Defensivo precisa de carência (dias) e intervalo de reentrada (horas) — está no rótulo e no AGROFIT.');
      await gravar('cc_insumos', linha, { novo: !i }); fechar(); redesenhar();
    });
    $('ciApagar')?.addEventListener('click', () => {
      if (C.regs.some(r => (r.dados?.produtos || []).some(p => p.insumo_id === i.id))) return erroDlg('Este insumo já foi usado em lançamentos — desative em vez de apagar.');
      confirmar('Apagar insumo', esc(i.nome), 'Apagar', () => apagarItem('cc_insumos', i.id));
    });
  });
}

/* ===================================================================
   TELA · ANÁLISES
   =================================================================== */
function desenharAnalises() {
  const tela = $('telaCcAnalises'), hj = hoje();
  const lista = [...C.analises].sort((a, b) => b.data.localeCompare(a.data));
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Análises laboratoriais', 'Água de irrigação e de lavagem, água potável, solo, resíduos no produto. O vencimento entra no painel.',
      `<button class="btn principal" type="button" id="ccAnNovo">Nova análise</button>`)}
    <div id="ccAnTabela" style="margin-top:14px">${lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
      <th>Tipo</th><th>Ponto</th><th>Fazenda</th><th class="ce">Data</th><th class="ce">Vence</th><th>Laboratório</th><th class="ce">Resultado</th><th></th></tr></thead><tbody>
      ${lista.map(a => `<tr><td><b>${esc(a.tipo)}</b>${pendTag(a)}</td><td>${esc(a.ponto)}</td><td>${esc(a.fazenda || '')}</td><td class="ce">${br(a.data)}</td>
        <td class="ce">${a.vence ? (a.vence < hj ? tag(br(a.vence), 'perigo') : br(a.vence)) : '—'}</td><td>${esc(a.laboratorio || '')}</td>
        <td class="ce">${tag(a.resultado, a.resultado === 'Conforme' ? 'ativo' : a.resultado === 'Aguardando' ? 'neutra' : 'perigo')}${C.arq.has(String(a.id)) ? ' 📎' : ''}${a.link ? ` <a class="ce-link" href="${esc(a.link)}" target="_blank" rel="noopener">laudo ↗</a>` : ''}</td>
        <td class="ce"><button class="btn mini" type="button" data-an="${a.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma análise lançada.</div>'}</div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="ccAnImprimir">Imprimir a lista</button></div>`;
  $('ccAnNovo').addEventListener('click', () => formAnalise(null));
  $('ccAnImprimir').addEventListener('click', () => mostrar(docAnalises(lista), { barra: true }));
  tela.querySelectorAll('[data-an]').forEach(b => b.addEventListener('click', () => formAnalise(b.dataset.an)));
}
let anexosAn = null;
function formAnalise(id) {
  const a = id ? C.analises.find(x => x.id === id) : null;
  const v = a || { tipo: 'Água de irrigação', data: hoje(), resultado: 'Conforme' };
  const val = k => esc(v[k] ?? '');
  dialogo(`<h3>${a ? esc(a.tipo) + ' · ' + esc(a.ponto) : 'Nova análise'}</h3>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="grade">
      <label class="campo">Tipo <select id="caTipo">${opcoes(TIPOS_ANALISE, v.tipo)}</select></label>
      <label class="campo">Ponto de coleta <input type="text" id="caPonto" list="ccLPonto" maxlength="120" value="${val('ponto')}" required placeholder="Poço, pivô, bebedouro"></label>
      <label class="campo">Fazenda <input type="text" id="caFaz" list="ccLFaz" maxlength="80" value="${val('fazenda')}"></label>
      <label class="campo">Data da coleta <input type="date" id="caData" value="${val('data')}" required></label>
      <label class="campo">Válida até <input type="date" id="caVence" value="${val('vence')}"></label>
      <label class="campo">Laboratório <input type="text" id="caLab" maxlength="120" value="${val('laboratorio')}"></label>
      <label class="campo">Resultado <select id="caRes">${opcoes(['Conforme', 'Não conforme', 'Aguardando'], v.resultado)}</select></label>
      <label class="campo plena">Link do laudo (OneDrive) <input type="url" id="caLink" maxlength="2000" value="${val('link')}"></label>
      <div class="plena" id="caAnexos"></div>
      <label class="campo plena">Observação <textarea id="caObs" rows="2" maxlength="600">${val('observacao')}</textarea></label>
    </div>
    ${datalist('ccLPonto', C.analises.map(x => x.ponto))}${datalist('ccLFaz', C.ref.fazendas)}
    <div class="barra fim">
      ${a ? '<button class="btn perigo" type="button" id="caApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="caGravar">Gravar</button>
    </div>`, () => {
    $('caData').addEventListener('change', () => { if (!$('caVence').value && $('caData').value) $('caVence').value = somaDias($('caData').value, 365); });
    if (!a) $('caVence').value = somaDias(v.data, 365);
    anexosAn = campoAnexos($('caAnexos'), { area: 'certificacao', tipo: 'caderno', rotulo: 'Laudo', dica: 'PDF ou foto' });
    anexosAn.abrir(a ? a.id : null);
    $('caGravar').addEventListener('click', async () => {
      const g = x => so($(x).value) || null;
      const linha = { ...(a || { id: novoId() }), tipo: $('caTipo').value, ponto: g('caPonto'), fazenda: g('caFaz'), data: g('caData'), vence: g('caVence'), laboratorio: g('caLab'), resultado: $('caRes').value, link: g('caLink'), observacao: g('caObs') };
      if (!linha.ponto || !linha.data) return erroDlg('Informe o ponto de coleta e a data.');
      const anexos = anexosAn;
      await gravar('cc_analises', linha, { novo: !a });
      if (anexos?.mudou) C.arq.add(String(linha.id));
      if (anexos) anexos.salvar(linha.id).catch(e => alert('A análise foi gravada, mas o laudo não: ' + e.message));
      fechar(); redesenhar();
    });
    $('caApagar')?.addEventListener('click', () => confirmar('Apagar análise', `${esc(a.tipo)} · ${esc(a.ponto)} · ${br(a.data)}`, 'Apagar', () => apagarItem('cc_analises', a.id)));
  });
}

/* ===================================================================
   TELA · CALIBRAÇÕES
   =================================================================== */
function desenharCalibracoes() {
  const tela = $('telaCcCalibracoes'), hj = hoje();
  const lista = [...C.calibs].sort((a, b) => b.data.localeCompare(a.data));
  const usados = [...new Set(C.regs.filter(r => r.tipo === 'aplicacao' && r.dados?.equipamento_id).map(r => r.dados.equipamento_id))];
  const pend = usados.filter(id => calibVencida(id, hj));
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Calibração dos pulverizadores', 'Registro de calibração (IFA 32.04): pelo menos uma por ano, após manutenção e antes de trocar o tipo de produto. Os equipamentos vêm de Máquinas e Patrimônio.',
      `<button class="btn principal" type="button" id="ccCbNovo">Nova calibração</button>`)}
    ${pend.length ? `<div class="aviso erro" style="margin-top:12px">${pend.length} equipamento(s) usado(s) em aplicações sem calibração válida: ${esc(pend.map(id => C.ref.equipamentos.find(e => e.id === id)?.codigo || id).join(', '))}</div>` : ''}
    <div style="margin-top:14px">${lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
      <th>Equipamento</th><th class="ce">Data</th><th>Responsável</th><th>Bicos</th><th>Vazão</th><th class="ce">Resultado</th><th class="ce">Próxima</th><th></th></tr></thead><tbody>
      ${lista.map(c => `<tr><td><b>${esc(c.equipamento)}</b>${pendTag(c)}</td><td class="ce">${br(c.data)}</td><td>${esc(c.responsavel || '')}</td><td>${esc(c.bicos || '')}</td><td>${esc(c.vazao || '')}</td>
        <td class="ce">${tag(c.resultado, c.resultado === 'Aprovado' ? 'ativo' : 'perigo')}</td><td class="ce">${c.proxima ? (c.proxima < hj ? tag(br(c.proxima), 'perigo') : br(c.proxima)) : '—'}</td>
        <td class="ce"><button class="btn mini" type="button" data-cb="${c.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma calibração lançada.</div>'}</div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="ccCbImprimir">Imprimir a lista</button></div>`;
  $('ccCbNovo').addEventListener('click', () => formCalibracao(null));
  $('ccCbImprimir').addEventListener('click', () => mostrar(docCalibracoes(lista), { barra: true }));
  tela.querySelectorAll('[data-cb]').forEach(b => b.addEventListener('click', () => formCalibracao(b.dataset.cb)));
}
function formCalibracao(id) {
  const c = id ? C.calibs.find(x => x.id === id) : null;
  const v = c || { data: hoje(), resultado: 'Aprovado' };
  const val = k => esc(v[k] ?? '');
  const equips = C.ref.equipamentos;
  dialogo(`<h3>${c ? esc(c.equipamento) : 'Nova calibração'}</h3>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="grade">
      <label class="campo plena">Equipamento <select id="ccbEquip">${opcoes(equips.map(e => [e.id, `${e.codigo} · ${e.descricao}`]), v.equipamento_id, c && !v.equipamento_id ? v.equipamento : '— escolha —')}</select></label>
      <label class="campo">Equipamento (fora da lista) <input type="text" id="ccbEquipTxt" maxlength="120" value="${esc(v.equipamento_id ? '' : (v.equipamento || ''))}"></label>
      <label class="campo">Data <input type="date" id="ccbData" value="${val('data')}" required></label>
      <label class="campo">Responsável <input type="text" id="ccbResp" list="ccLResp" maxlength="120" value="${val('responsavel')}"></label>
      <label class="campo">Bicos (modelo / nº) <input type="text" id="ccbBicos" maxlength="120" value="${val('bicos')}"></label>
      <label class="campo">Vazão medida <input type="text" id="ccbVazao" maxlength="120" value="${val('vazao')}" placeholder="L/min por bico · L/ha"></label>
      <label class="campo">Resultado <select id="ccbRes">${opcoes(['Aprovado', 'Reprovado'], v.resultado)}</select></label>
      <label class="campo">Próxima calibração <input type="date" id="ccbProx" value="${esc(v.proxima || somaDias(v.data, 365))}"></label>
      <label class="campo plena">Observação <textarea id="ccbObs" rows="2" maxlength="600">${val('observacao')}</textarea></label>
    </div>
    ${datalist('ccLResp', [...C.ref.pessoas.map(p => p.nome), ...C.calibs.map(x => x.responsavel)])}
    <div class="barra fim">
      ${c ? '<button class="btn perigo" type="button" id="ccbApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="ccbGravar">Gravar</button>
    </div>`, () => {
    $('ccbData').addEventListener('change', () => { if ($('ccbData').value) $('ccbProx').value = somaDias($('ccbData').value, 365); });
    $('ccbGravar').addEventListener('click', async () => {
      const g = x => so($(x).value) || null;
      const e = equips.find(x => x.id === g('ccbEquip'));
      const linha = { ...(c || { id: novoId() }), equipamento_id: e?.id || null, equipamento: e ? `${e.codigo} · ${e.descricao}` : g('ccbEquipTxt'), data: g('ccbData'), responsavel: g('ccbResp'),
        bicos: g('ccbBicos'), vazao: g('ccbVazao'), resultado: $('ccbRes').value, proxima: g('ccbProx'), observacao: g('ccbObs') };
      if (!linha.equipamento || !linha.data) return erroDlg('Informe o equipamento e a data.');
      await gravar('cc_calibracoes', linha, { novo: !c }); fechar(); redesenhar();
    });
    $('ccbApagar')?.addEventListener('click', () => confirmar('Apagar calibração', `${esc(c.equipamento)} · ${br(c.data)}`, 'Apagar', () => apagarItem('cc_calibracoes', c.id)));
  });
}

/* ===================================================================
   TELA · RELATÓRIOS PARA AUDITORIA
   =================================================================== */
function desenharRelatorios() {
  const tela = $('telaCcRelatorios');
  const f = C.rel; const t = tecnico();
  const btn = (id, nome, dica) => `<button type="button" class="pv-card pv-calma" data-rel="${id}"><span>Relatório</span><strong style="font-size:15px">${esc(nome)}</strong><small>${esc(dica)}</small></button>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Relatórios para auditoria', 'Cada relatório sai em PDF (A4) com a marca da SAKUMA, a LOP no pé e os pontos de controle IFA que ele atende. Escolha o período ou o plantio antes.',
      `<button class="btn" type="button" id="ccRlTec">Responsável técnico</button>`)}
    <p class="dica" style="margin:8px 0 0">${t.nome ? `Assina como responsável técnico: <b>${esc(t.nome)}</b>${t.crea ? ' · CREA ' + esc(t.crea) : ''}` : 'Responsável técnico ainda não cadastrado — os relatórios saem sem a linha de assinatura.'}</p>
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Plantio <select id="ccRlPl">${opcoesPlantio(f.plantio, 'Todos os plantios')}</select></label>
      <label class="campo">De <input type="date" id="ccRlDe" value="${esc(f.de)}"></label>
      <label class="campo">Até <input type="date" id="ccRlAte" value="${esc(f.ate)}"></label>
    </div>
    <div class="pv-cards" style="margin-top:14px">
      ${btn('caderno', 'Caderno de campo por plantio', 'todos os lançamentos em ordem cronológica')}
      ${btn('aplic', 'Aplicações de agroquímicos', 'produto, nº MAPA, dose, alvo, aplicador, carência e REI')}
      ${btn('fert', 'Fertilização', 'adubações e correções')}
      ${btn('irrig', 'Irrigação', 'lâmina, horas, fonte e outorga')}
      ${btn('mip', 'Monitoramento (MIP)', 'alvo, nível, decisão')}
      ${btn('colheita', 'Colheita e carência', 'quantidade, destino e checagem de carência')}
      ${btn('higiene', 'Higiene e segurança', 'checklists, limpezas e acidentes')}
      ${btn('produtos', 'Produtos usados na safra', 'lista única com nº MAPA e ingrediente ativo')}
      ${btn('calib', 'Calibração de equipamentos', 'pulverizadores')}
      ${btn('analises', 'Análises laboratoriais', 'água, solo e resíduos com validade')}
      ${btn('aplicad', 'Aplicadores', 'NR-31 e ASO de quem aplicou no período')}
      ${btn('nc', 'Não conformidades', 'ações corretivas e prazos')}
      ${btn('indice', 'Índice de evidências IFA', 'relatório × ponto de controle × requisito')}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn" type="button" id="ccRlExcel">Exportar lançamentos em Excel</button>
  </div>`;
  $('ccRlPl').addEventListener('change', e => { f.plantio = e.target.value; });
  $('ccRlDe').addEventListener('change', e => { f.de = e.target.value; });
  $('ccRlAte').addEventListener('change', e => { f.ate = e.target.value; });
  $('ccRlTec').addEventListener('click', formTecnico);
  $('ccRlExcel').addEventListener('click', () => exportarRegistros(regsRel()));
  tela.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.rel, p = f.plantio ? plantioPorId(f.plantio) : null;
    if (id === 'caderno' && !p) return dialogo(`<h3>Caderno de campo</h3><p class="dica">Escolha um plantio no filtro acima: o caderno sai um por plantio.</p><div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button></div>`);
    const html = id === 'caderno' ? docCaderno(p) : id === 'aplic' ? docAplicacoes(regsRel('aplicacao')) : id === 'fert' ? docFertilizacao(regsRel('adubacao'))
      : id === 'irrig' ? docSimples('Registro de irrigação', regsRel('irrigacao'), 'irrig') : id === 'mip' ? docSimples('Monitoramento de pragas (MIP)', regsRel('monitoramento'), 'mip')
      : id === 'colheita' ? docColheita(regsRel('colheita')) : id === 'higiene' ? docSimples('Higiene e segurança na lavoura', regsRel('higiene'), 'higiene')
      : id === 'produtos' ? docProdutos(regsRel('aplicacao'), regsRel('adubacao')) : id === 'calib' ? docCalibracoes([...C.calibs].sort((a, b) => b.data.localeCompare(a.data)))
      : id === 'analises' ? docAnalises([...C.analises].sort((a, b) => b.data.localeCompare(a.data))) : id === 'aplicad' ? docAplicadores(regsRel('aplicacao'))
      : id === 'nc' ? docNc(regsRel('ocorrencia')) : docIndice();
    mostrar(html, { barra: true });
  }));
}
const regsRel = tipo => C.regs.filter(r => r.situacao !== 'Cancelado' && (!tipo || r.tipo === tipo) && (!C.rel.plantio || r.plantio_id === C.rel.plantio) && (!C.rel.de || r.data >= C.rel.de) && (!C.rel.ate || r.data <= C.rel.ate))
  .sort((a, b) => a.data.localeCompare(b.data) || String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')));
function formTecnico() {
  const t = tecnico();
  dialogo(`<h3>Responsável técnico</h3>
    <p class="dica">Quem assina os registros aprovados e aparece na linha de assinatura dos relatórios.</p>
    <div class="aviso erro" id="ccErro" hidden></div>
    <div class="grade">
      <label class="campo">Nome <input type="text" id="ctNome" maxlength="120" value="${esc(t.nome || '')}"></label>
      <label class="campo">CREA <input type="text" id="ctCrea" maxlength="40" value="${esc(t.crea || '')}"></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="ctGravar">Gravar</button></div>`, () => {
    $('ctGravar').addEventListener('click', async () => {
      const atual = C.config.find(x => x.chave === 'tecnico');
      await gravar('cc_config', { ...(atual || { chave: 'tecnico' }), valor: { nome: so($('ctNome').value), crea: so($('ctCrea').value) } }, { novo: !atual });
      fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   DOCUMENTOS IMPRESSOS (moldura .rel, marca SAKUMA no topo, LOP no pé)
   =================================================================== */
const periodoTxt = () => (C.rel.de || C.rel.ate) ? `${C.rel.de ? 'de ' + br(C.rel.de) : ''}${C.rel.ate ? ' até ' + br(C.rel.ate) : ''}`.trim() : 'todo o período';
const codigosTxt = id => (EVIDENCIAS.find(e => e.id === id)?.codigos || []).join(' · ');
function documento({ titulo, subtitulo, canto, corpo, paisagem, evid, assinatura = true }) {
  const t = tecnico();
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${evid ? `<p class="rel-miudo" style="margin:0 0 8px">Evidência GLOBALG.A.P. IFA v6 (F&amp;V): ${esc(codigosTxt(evid))}</p>` : ''}
    ${corpo}
    ${assinatura && t.nome ? `<div class="rel-assinaturas"><div class="rel-assina"><span>${esc(t.nome)}${t.crea ? ' · CREA ' + esc(t.crea) : ''}</span><small>Responsável técnico</small></div></div>` : ''}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
const fichaPlantio = p => `<div class="rel-ficha">
  <div><span>Plantio</span><b>${esc(p.codigo || '—')}</b></div><div><span>Cultura / variedade</span><b>${esc(p.cultura)}${p.variedade ? ' · ' + esc(p.variedade) : ''}</b></div>
  <div><span>Talhão / fazenda</span><b>${esc(p.local)}${p.fazenda ? ' · ' + esc(p.fazenda) : ''}</b></div>
  <div><span>Data do plantio</span><b>${br(p.data_plantio)}</b></div><div><span>Área</span><b>${fmtN(p.area_ha)} ha</b></div><div><span>Densidade</span><b>${esc(p.densidade || '—')}</b></div>
  <div><span>Semente / muda</span><b>${esc(p.origem_semente || '—')}${p.lote_semente ? ' · lote ' + esc(p.lote_semente) : ''}</b></div>
  <div><span>Previsão de colheita</span><b>${br(p.previsao_colheita)}</b></div><div><span>Status</span><b>${esc(p.status)}</b></div></div>`;
const prodTxt = r => (r.dados?.produtos || []).map(p => `${p.nome}${p.registro_mapa ? ' (MAPA ' + p.registro_mapa + ')' : ''} ${p.dose != null ? fmtN(p.dose, 3) + ' ' + (p.unidade || '') : ''}`.trim()).join('; ');
const sitTxt = r => `${r.situacao}${r.assinado_em ? ' · assinado' : ''}${r.versao > 1 ? ' · v' + r.versao : ''}`;
const clsSit = r => r.situacao === 'Aprovado' ? 'rel-ok' : r.situacao === 'Cancelado' ? '' : 'rel-pend';
const plantioTxt = r => rotPlantio(plantioPorId(r.plantio_id));
const vazia = (n, t = 'Nenhum registro no período.') => `<tr><td colspan="${n}" class="rel-vazio">${t}</td></tr>`;

function docCaderno(p) {
  const regs = C.regs.filter(r => r.plantio_id === p.id && r.situacao !== 'Cancelado').sort((a, b) => a.data.localeCompare(b.data) || String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')));
  const aplic = regs.filter(r => r.tipo === 'aplicacao');
  return documento({ titulo: 'Caderno de campo', subtitulo: `${p.cultura} · ${p.local}${p.fazenda ? ' · ' + p.fazenda : ''} · plantio ${br(p.data_plantio)}`, canto: `${regs.length} registro(s)`, evid: 'caderno', paisagem: true,
    corpo: `${fichaPlantio(p)}
      <div class="rel-resumo"><b>${aplic.length}</b> aplicação(ões) · <b>${regs.filter(r => r.tipo === 'adubacao').length}</b> adubação(ões) · <b>${regs.filter(r => r.tipo === 'irrigacao').length}</b> irrigação(ões) · <b>${regs.filter(r => r.tipo === 'monitoramento').length}</b> monitoramento(s) · <b>${regs.filter(r => r.tipo === 'colheita').length}</b> colheita(s) · <b>${regs.filter(r => r.tipo === 'ocorrencia').length}</b> NC</div>
      <table class="rel-tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Registro</th><th>Responsável</th><th>Liberações</th><th>Situação</th></tr></thead><tbody>
      ${regs.map(r => `<tr><td>${br(r.data)}${r.hora_inicio ? '<br><span class="rel-miudo">' + brHora(r.hora_inicio) + (r.hora_fim ? '–' + brHora(r.hora_fim) : '') + '</span>' : ''}</td><td>${esc(TIPOS[r.tipo]?.nome)}</td>
        <td>${esc(resumo(r))}${r.tipo === 'aplicacao' ? `<br><span class="rel-miudo">${esc([r.dados?.justificativa ? 'justif.: ' + r.dados.justificativa : '', r.dados?.equipamento ? 'equip.: ' + r.dados.equipamento : '', r.dados?.receituario ? 'receit. ' + r.dados.receituario : 'sem receituário', r.dados?.embalagens ? 'emb.: ' + r.dados.embalagens : ''].filter(Boolean).join(' · '))}</span>` : ''}</td>
        <td>${esc(r.responsavel || '')}</td><td>${r.tipo === 'aplicacao' ? `REI ${brDH(r.liberado_reentrada)}<br>colheita ${br(r.liberado_colheita)}` : ''}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`).join('') || vazia(6, 'Nenhum lançamento neste plantio.')}
      </tbody></table>` });
}
function docAplicacoes(regs) {
  return documento({ titulo: 'Registro de aplicação de agroquímicos', subtitulo: `${C.rel.plantio ? rotPlantio(plantioPorId(C.rel.plantio)) + ' · ' : ''}${periodoTxt()}`, canto: `${regs.length} aplicação(ões)`, evid: 'aplic', paisagem: true,
    corpo: `<table class="rel-tabela"><thead><tr><th>Data / hora</th><th>Plantio</th><th>Produto · nº MAPA · dose</th><th>Alvo / justificativa</th><th>Calda · área</th><th>Equipamento</th><th>Aplicador</th><th>Clima</th><th>Receituário</th><th>REI · carência</th><th>Embalagens</th><th>Sit.</th></tr></thead><tbody>
      ${regs.map(r => { const d = r.dados || {}; return `<tr><td>${br(r.data)}<br><span class="rel-miudo">${brHora(r.hora_inicio)}${r.hora_fim ? '–' + brHora(r.hora_fim) : ''}</span></td><td>${esc(plantioTxt(r))}</td>
        <td>${(d.produtos || []).map(p => `<b>${esc(p.nome)}</b>${p.ingrediente_ativo ? ' <span class="rel-miudo">' + esc(p.ingrediente_ativo) + '</span>' : ''}<br><span class="rel-miudo">${p.registro_mapa ? 'MAPA ' + esc(p.registro_mapa) + ' · ' : ''}${p.dose != null ? fmtN(p.dose, 3) + ' ' + esc(p.unidade || '') : ''}</span>`).join('<br>')}</td>
        <td>${esc(d.alvo || '')}${d.justificativa ? '<br><span class="rel-miudo">' + esc(d.justificativa) + '</span>' : ''}</td><td>${d.volume_calda != null ? fmtN(d.volume_calda) + ' L/ha' : ''}${d.area_ha != null ? '<br>' + fmtN(d.area_ha) + ' ha' : ''}</td>
        <td>${esc(d.equipamento || '')}</td><td>${esc(d.aplicador || r.responsavel || '')}${d.epi ? '<br><span class="rel-miudo">EPI: ' + esc(d.epi) + '</span>' : ''}</td>
        <td class="rel-miudo">${[d.vento != null ? 'vento ' + fmtN(d.vento, 1) + ' km/h' : '', d.temperatura != null ? fmtN(d.temperatura, 1) + ' °C' : '', d.umidade != null ? 'UR ' + fmtN(d.umidade, 0) + '%' : ''].filter(Boolean).join(' · ')}</td>
        <td class="${d.receituario ? '' : 'rel-pend'}">${esc(d.receituario || (C.arq.has(String(r.id)) ? 'anexado' : 'não informado'))}</td>
        <td class="rel-miudo">${brDH(r.liberado_reentrada)}<br>${br(r.liberado_colheita)}</td><td class="rel-miudo">${esc(d.embalagens || '')}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`; }).join('') || vazia(12)}
      </tbody></table>` });
}
function docFertilizacao(regs) {
  return documento({ titulo: 'Registro de fertilização', subtitulo: `${C.rel.plantio ? rotPlantio(plantioPorId(C.rel.plantio)) + ' · ' : ''}${periodoTxt()}`, canto: `${regs.length} registro(s)`, evid: 'fert',
    corpo: `<table class="rel-tabela"><thead><tr><th>Data</th><th>Plantio</th><th>Produto · dose</th><th>Forma</th><th>Área</th><th>Lote</th><th>Recomendação</th><th>Responsável</th><th>Sit.</th></tr></thead><tbody>
      ${regs.map(r => { const d = r.dados || {}; return `<tr><td>${br(r.data)}</td><td>${esc(plantioTxt(r))}</td><td>${esc(prodTxt(r))}</td><td>${esc(d.forma || '')}</td><td>${d.area_ha != null ? fmtN(d.area_ha) + ' ha' : ''}</td><td>${esc(d.lote || '')}</td><td>${esc(d.recomendacao || '')}</td><td>${esc(r.responsavel || '')}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`; }).join('') || vazia(9)}
      </tbody></table>` });
}
function docSimples(titulo, regs, evid) {
  return documento({ titulo, subtitulo: `${C.rel.plantio ? rotPlantio(plantioPorId(C.rel.plantio)) + ' · ' : ''}${periodoTxt()}`, canto: `${regs.length} registro(s)`, evid,
    corpo: `<table class="rel-tabela"><thead><tr><th>Data</th><th>Plantio</th><th>Registro</th><th>Responsável</th><th>Sit.</th></tr></thead><tbody>
      ${regs.map(r => `<tr><td>${br(r.data)}${r.hora_inicio ? '<br><span class="rel-miudo">' + brHora(r.hora_inicio) + '</span>' : ''}</td><td>${esc(plantioTxt(r))}</td><td>${esc(resumo(r))}${r.tipo === 'higiene' && r.dados?.evento === 'Checklist diário' ? '<br><span class="rel-miudo">' + HIGIENE_ITENS.map(([k, t]) => (r.dados.itens?.[k] === false ? '✗ ' : '✓ ') + t).join(' · ') + '</span>' : ''}${r.dados?.observacao ? '<br><span class="rel-miudo">' + esc(r.dados.observacao) + '</span>' : ''}</td><td>${esc(r.responsavel || '')}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`).join('') || vazia(5)}
      </tbody></table>` });
}
function docColheita(regs) {
  return documento({ titulo: 'Registro de colheita e carência', subtitulo: `${C.rel.plantio ? rotPlantio(plantioPorId(C.rel.plantio)) + ' · ' : ''}${periodoTxt()}`, canto: `${regs.length} colheita(s)`, evid: 'colheita',
    corpo: `<table class="rel-tabela"><thead><tr><th>Data</th><th>Plantio</th><th>Quantidade</th><th>Equipe</th><th>Destino</th><th>Lote (ref.)</th><th>Última aplicação</th><th>Carência</th><th>Sit.</th></tr></thead><tbody>
      ${regs.map(r => { const d = r.dados || {}; const ult = regsDo(r.plantio_id, 'aplicacao').filter(a => a.data <= r.data).sort((a, b) => b.data.localeCompare(a.data))[0]; const viol = travaColheita(r.plantio_id, r.data);
        return `<tr><td>${br(r.data)}</td><td>${esc(plantioTxt(r))}</td><td>${d.quantidade != null ? fmtN(d.quantidade) + ' ' + esc(d.unidade || '') : ''}</td><td>${esc(d.equipe || '')}</td><td>${esc(d.destino || '')}</td><td>${esc(d.lote || '')}</td>
        <td class="rel-miudo">${ult ? br(ult.data) + ' · ' + esc((ult.dados?.produtos || []).map(p => p.nome).join(', ')) + ' · liberado ' + br(ult.liberado_colheita) : 'sem aplicação'}</td>
        <td class="${viol ? 'rel-pend' : 'rel-ok'}">${viol ? 'VIOLADA' : 'OK'}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`; }).join('') || vazia(9)}
      </tbody></table>` });
}
function docProdutos(aplic, adub) {
  const mapa = new Map();
  for (const r of [...aplic, ...adub]) for (const p of r.dados?.produtos || []) {
    const i = insumoPorId(p.insumo_id) || { nome: p.nome, registro_mapa: p.registro_mapa, ingrediente_ativo: p.ingrediente_ativo, tipo: r.tipo === 'aplicacao' ? 'Defensivo' : 'Fertilizante' };
    const k = p.insumo_id || p.nome; const e = mapa.get(k) || { i, n: 0, primeira: r.data, ultima: r.data, plantios: new Set() };
    e.n++; e.primeira = e.primeira < r.data ? e.primeira : r.data; e.ultima = e.ultima > r.data ? e.ultima : r.data; e.plantios.add(r.plantio_id); mapa.set(k, e);
  }
  const lista = [...mapa.values()].sort((a, b) => a.i.tipo.localeCompare(b.i.tipo) || a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  return documento({ titulo: 'Produtos usados na safra', subtitulo: `${C.rel.plantio ? rotPlantio(plantioPorId(C.rel.plantio)) + ' · ' : ''}${periodoTxt()}`, canto: `${lista.length} produto(s)`, evid: 'produtos',
    corpo: `<table class="rel-tabela"><thead><tr><th>Produto</th><th>Tipo</th><th>Ingrediente ativo</th><th>Nº MAPA</th><th>Classe tox.</th><th>Carência</th><th>REI</th><th>Usos</th><th>Período</th><th>Plantios</th></tr></thead><tbody>
      ${lista.map(e => `<tr><td><b>${esc(e.i.nome)}</b></td><td>${esc(e.i.tipo)}</td><td>${esc(e.i.ingrediente_ativo || e.i.formula || '')}</td><td class="${e.i.tipo === 'Defensivo' && !e.i.registro_mapa ? 'rel-pend' : ''}">${esc(e.i.registro_mapa || (e.i.tipo === 'Defensivo' ? 'FALTA' : ''))}</td><td>${esc(e.i.classe_tox || '')}</td>
        <td>${e.i.carencia_dias != null ? e.i.carencia_dias + ' d' : ''}</td><td>${e.i.reentrada_horas != null ? e.i.reentrada_horas + ' h' : ''}</td><td>${e.n}</td><td>${br(e.primeira)} – ${br(e.ultima)}</td><td>${e.plantios.size}</td></tr>`).join('') || vazia(10)}
      </tbody></table>` });
}
function docCalibracoes(lista) {
  return documento({ titulo: 'Calibração de equipamentos de aplicação', subtitulo: 'Pulverizadores · registro de calibração', canto: `${lista.length} registro(s)`, evid: 'calib',
    corpo: `<table class="rel-tabela"><thead><tr><th>Equipamento</th><th>Data</th><th>Responsável</th><th>Bicos</th><th>Vazão</th><th>Resultado</th><th>Próxima</th><th>Observação</th></tr></thead><tbody>
      ${lista.map(c => `<tr><td><b>${esc(c.equipamento)}</b></td><td>${br(c.data)}</td><td>${esc(c.responsavel || '')}</td><td>${esc(c.bicos || '')}</td><td>${esc(c.vazao || '')}</td><td class="${c.resultado === 'Aprovado' ? 'rel-ok' : 'rel-pend'}">${esc(c.resultado)}</td><td class="${c.proxima && c.proxima < hoje() ? 'rel-pend' : ''}">${br(c.proxima)}</td><td class="rel-miudo">${esc(c.observacao || '')}</td></tr>`).join('') || vazia(8, 'Nenhuma calibração registrada.')}
      </tbody></table>` });
}
function docAnalises(lista) {
  return documento({ titulo: 'Análises laboratoriais', subtitulo: 'Água de irrigação e lavagem, água potável, solo e resíduos', canto: `${lista.length} análise(s)`, evid: 'analises',
    corpo: `<table class="rel-tabela"><thead><tr><th>Tipo</th><th>Ponto</th><th>Fazenda</th><th>Coleta</th><th>Válida até</th><th>Laboratório</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>
      ${lista.map(a => `<tr><td><b>${esc(a.tipo)}</b></td><td>${esc(a.ponto)}</td><td>${esc(a.fazenda || '')}</td><td>${br(a.data)}</td><td class="${a.vence && a.vence < hoje() ? 'rel-pend' : ''}">${br(a.vence)}</td><td>${esc(a.laboratorio || '')}</td><td class="${a.resultado === 'Conforme' ? 'rel-ok' : 'rel-pend'}">${esc(a.resultado)}</td><td class="rel-miudo">${esc(a.observacao || '')}</td></tr>`).join('') || vazia(8, 'Nenhuma análise registrada.')}
      </tbody></table>` });
}
function docAplicadores(aplic) {
  const ids = [...new Set(aplic.map(r => r.dados?.aplicador_id).filter(Boolean))];
  const fora = [...new Set(aplic.filter(r => !r.dados?.aplicador_id).map(r => r.dados?.aplicador).filter(Boolean))];
  const hj = hoje();
  return documento({ titulo: 'Aplicadores de agroquímicos', subtitulo: `Treinamento NR-31 (defensivos) e ASO · ${periodoTxt()}`, canto: `${ids.length + fora.length} aplicador(es)`, evid: 'aplicad',
    corpo: `<table class="rel-tabela"><thead><tr><th>Aplicador</th><th>Cargo</th><th>Aplicações</th><th>NR-31 válido até</th><th>ASO válido até</th><th>Situação hoje</th></tr></thead><tbody>
      ${ids.map(id => { const p = pessoaPorId(id) || { nome: aplic.find(r => r.dados?.aplicador_id === id)?.dados?.aplicador }; const h = habilitacao(p, hj);
        return `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.cargo || '')}</td><td>${aplic.filter(r => r.dados?.aplicador_id === id).length}</td><td class="${p.nr31_vence && p.nr31_vence >= hj ? '' : 'rel-pend'}">${br(p.nr31_vence)}</td><td class="${p.aso_vence && p.aso_vence >= hj ? '' : 'rel-pend'}">${br(p.aso_vence)}</td><td class="${h.ok ? 'rel-ok' : 'rel-pend'}">${h.ok ? 'Habilitado' : esc(h.motivos.join('; '))}</td></tr>`; }).join('')}
      ${fora.map(n => `<tr><td><b>${esc(n)}</b></td><td>fora do cadastro</td><td>${aplic.filter(r => r.dados?.aplicador === n).length}</td><td colspan="3" class="rel-pend">Comprovar NR-31 e ASO à parte</td></tr>`).join('')}
      ${ids.length + fora.length ? '' : vazia(6)}
      </tbody></table>` });
}
function docNc(regs) {
  return documento({ titulo: 'Não conformidades e ações corretivas', subtitulo: periodoTxt(), canto: `${regs.filter(r => r.dados?.status !== 'Encerrada').length} em aberto`, evid: 'nc',
    corpo: `<table class="rel-tabela"><thead><tr><th>Data</th><th>Plantio</th><th>Não conformidade</th><th>Ação corretiva</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Encerrada</th></tr></thead><tbody>
      ${regs.map(r => { const d = r.dados || {}; return `<tr><td>${br(r.data)}</td><td>${esc(plantioTxt(r))}</td><td>${esc(d.descricao || '')}</td><td>${esc(d.acao_corretiva || '')}</td><td>${esc(d.responsavel_acao || r.responsavel || '')}</td><td class="${d.prazo && d.prazo < hoje() && d.status !== 'Encerrada' ? 'rel-pend' : ''}">${br(d.prazo)}</td><td class="${d.status === 'Encerrada' ? 'rel-ok' : 'rel-pend'}">${esc(d.status || '')}</td><td>${br(d.encerrada_em)}</td></tr>`; }).join('') || vazia(8)}
      </tbody></table>` });
}
function docIndice() {
  const reqsDe = cods => C.reqs.filter(r => (Array.isArray(r.referencias) ? r.referencias : []).some(x => x.norma === 'GlobalG.A.P.' && cods.includes(x.codigo)));
  return documento({ titulo: 'Índice de evidências — Caderno de campo', subtitulo: 'Relatório × ponto de controle GLOBALG.A.P. IFA v6 (F&V) × requisito da lista consolidada', canto: `${EVIDENCIAS.length} relatório(s)`, assinatura: false,
    corpo: `<table class="rel-tabela"><thead><tr><th>Relatório do caderno</th><th>Pontos de controle IFA</th><th>Requisitos que comprova (lista consolidada)</th></tr></thead><tbody>
      ${EVIDENCIAS.map(e => `<tr><td><b>${esc(e.nome)}</b></td><td class="rel-miudo">${esc(e.codigos.join(' · '))}</td><td>${reqsDe(e.codigos).map(r => `${esc(r.titulo)} <span class="rel-miudo ${r.status === 'Conforme' ? 'rel-ok' : 'rel-pend'}">(${esc(r.status)})</span>`).join('<br>') || '<span class="rel-miudo">—</span>'}</td></tr>`).join('')}
      </tbody></table>
      <p class="rel-nota">Os relatórios saem deste módulo (LOP - Gestão Rápida › Certificação › Caderno de campo). Registros aprovados não são apagados: toda alteração exige motivo e guarda a versão anterior.</p>` });
}
function docRegistros(regs) {
  return documento({ titulo: 'Lançamentos de campo', subtitulo: `${C.fr.plantio ? rotPlantio(plantioPorId(C.fr.plantio)) + ' · ' : ''}${C.fr.tipo ? TIPOS[C.fr.tipo].nome + ' · ' : ''}${(C.fr.de || C.fr.ate) ? `${C.fr.de ? 'de ' + br(C.fr.de) : ''}${C.fr.ate ? ' até ' + br(C.fr.ate) : ''}` : 'todo o período'}`, canto: `${regs.length} registro(s)`, paisagem: true,
    corpo: `<table class="rel-tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Plantio</th><th>Registro</th><th>Responsável</th><th>Liberações</th><th>Situação</th></tr></thead><tbody>
      ${regs.map(r => `<tr><td>${br(r.data)}</td><td>${esc(TIPOS[r.tipo]?.curto)}</td><td>${esc(plantioTxt(r))}</td><td>${esc(resumo(r))}</td><td>${esc(r.responsavel || '')}</td><td class="rel-miudo">${r.tipo === 'aplicacao' ? brDH(r.liberado_reentrada) + '<br>' + br(r.liberado_colheita) : ''}</td><td class="${clsSit(r)}">${esc(sitTxt(r))}</td></tr>`).join('') || vazia(7)}
      </tbody></table>` });
}
function docInsumos(lista) {
  return documento({ titulo: 'Cadastro de insumos', subtitulo: 'Defensivos, fertilizantes e corretivos com nº MAPA, carência e reentrada', canto: `${lista.length} insumo(s)`, evid: 'produtos', assinatura: false,
    corpo: `<table class="rel-tabela"><thead><tr><th>Produto</th><th>Tipo</th><th>Ingrediente ativo / fórmula</th><th>Nº MAPA</th><th>Tox.</th><th>Carência</th><th>REI</th><th>Dose máx.</th><th>Culturas</th></tr></thead><tbody>
      ${lista.map(i => `<tr><td><b>${esc(i.nome)}</b>${i.ativo ? '' : ' <span class="rel-miudo">(inativo)</span>'}</td><td>${esc(i.tipo)}</td><td>${esc(i.ingrediente_ativo || i.formula || '')}</td><td class="${i.tipo === 'Defensivo' && !i.registro_mapa ? 'rel-pend' : ''}">${esc(i.registro_mapa || '')}</td><td>${esc(i.classe_tox || '')}</td><td>${i.carencia_dias != null ? i.carencia_dias + ' d' : ''}</td><td>${i.reentrada_horas != null ? i.reentrada_horas + ' h' : ''}</td><td>${i.dose_max != null ? fmtN(i.dose_max, 3) + ' ' + esc(i.dose_unidade || '') : ''}</td><td class="rel-miudo">${esc((i.culturas || []).join(', '))}</td></tr>`).join('') || vazia(9, 'Nenhum insumo.')}
      </tbody></table>` });
}
function docPainel(k, proximos) {
  const linha = (rot, n, ok) => `<tr><td>${esc(rot)}</td><td class="${n ? (ok ? 'rel-pend' : 'rel-pend') : 'rel-ok'}">${n ? n : 'OK'}</td></tr>`;
  return documento({ titulo: 'Painel de conformidade — Caderno de campo', subtitulo: `${k.emCampo.length} plantio(s) em campo`, canto: br(hoje()), assinatura: false,
    corpo: `<table class="rel-tabela" style="max-width:520px"><thead><tr><th>Critério</th><th>Pendências</th></tr></thead><tbody>
      ${linha('Aplicações sem receituário', k.semReceituario.length)}${linha('Colheita com carência violada', k.carenciaViolada.length)}${linha('Aplicadores com NR-31/ASO vencido', k.aplicadoresIrreg.length)}
      ${linha('Pulverizadores sem calibração válida', k.calibsVencidas.length)}${linha('Análises vencidas ou faltando', k.analisesVencidas.length + k.tiposAnaliseSem.length)}${linha('Lançamentos aguardando aprovação', k.lancados.length)}
      ${linha('Aprovados sem assinatura do técnico', k.semAssinatura.length)}${linha('Não conformidades em aberto', k.ncAbertas.length)}
      </tbody></table>
      <p class="rel-secao">Plantios travados por carência ou reentrada</p>
      <table class="rel-tabela"><thead><tr><th>Plantio</th><th>Trava</th><th>Liberado em</th><th>Aplicação</th></tr></thead><tbody>
      ${k.sobReentrada.map(x => `<tr><td>${esc(rotPlantio(x.p))}</td><td>Reentrada</td><td>${brDH(x.t.liberado_reentrada)}</td><td>${esc((x.t.dados?.produtos || []).map(p => p.nome).join(', '))} · ${br(x.t.data)}</td></tr>`).join('')}
      ${k.sobCarencia.map(x => `<tr><td>${esc(rotPlantio(x.p))}</td><td>Carência</td><td>${br(x.t.liberado_colheita)}</td><td>${esc((x.t.dados?.produtos || []).map(p => p.nome).join(', '))} · ${br(x.t.data)}</td></tr>`).join('')}
      ${k.sobReentrada.length + k.sobCarencia.length ? '' : vazia(4, 'Nenhum.')}</tbody></table>
      <p class="rel-secao">Próximos 60 dias</p>
      <table class="rel-tabela"><thead><tr><th>Data</th><th>O quê</th></tr></thead><tbody>${proximos.map(x => `<tr><td>${br(x.data)}</td><td>${esc(x.o)}</td></tr>`).join('') || vazia(2, 'Nada.')}</tbody></table>` });
}

/* ===================================================================
   EXCEL
   =================================================================== */
async function exportarRegistros(regs) {
  const linhas = regs.map(r => [r.data, TIPOS[r.tipo]?.nome, plantioTxt(r), resumo(r), r.responsavel || '', r.tipo === 'aplicacao' ? prodTxt(r) : '', r.dados?.alvo || '', r.liberado_reentrada ? brDH(r.liberado_reentrada) : '', r.liberado_colheita || '', r.situacao, r.assinado_por || '', r.versao]);
  await baixarXlsx(`caderno-de-campo-${hoje()}.xlsx`, [{ nome: 'Lançamentos', titulo: 'Caderno de campo — lançamentos', subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Tipo', larg: 22 }, { rot: 'Plantio', larg: 34 }, { rot: 'Registro', larg: 60 }, { rot: 'Responsável', larg: 26 }, { rot: 'Produtos', larg: 40 }, { rot: 'Alvo', larg: 22 }, { rot: 'Reentrada liberada', larg: 18 }, { rot: 'Colheita liberada', larg: 16, tipo: 'data' }, { rot: 'Situação', larg: 12 }, { rot: 'Assinado por', larg: 28 }, { rot: 'Versão', larg: 8, tipo: 'num', casas: 0 }],
    linhas }]);
}

/* ===================================================================
   ENTRADA DO MÓDULO
   =================================================================== */
export const TELAS_CADERNO = ['ccPainel', 'ccRegistros', 'ccPlantios', 'ccInsumos', 'ccAnalises', 'ccCalibracoes', 'ccRelatorios'];
const DESENHO = { ccPainel: desenharPainel, ccRegistros: desenharRegistros, ccPlantios: desenharPlantios, ccInsumos: desenharInsumos, ccAnalises: desenharAnalises, ccCalibracoes: desenharCalibracoes, ccRelatorios: desenharRelatorios };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }

export async function abrirCaderno(tela) {
  const alvo = $(idTela(tela));
  if (!alvo) return;
  telaAtual = tela;
  if (!C.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o caderno de campo…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o caderno de campo: ${esc(e.message || e)}</div></div>`; return; }
  } else if (CAMADA_DEF.podeEnviar()) carregar().then(() => { if (telaAtual === tela && !$('dlgCc')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export async function recarregarCaderno() { C.carregado = false; await carregar(); redesenhar(); }
export function limparCaderno() {
  C.carregado = false;
  for (const k of ['plantios', 'insumos', 'analises', 'calibs', 'regs', 'config', 'reqs']) C[k] = [];
  C.ref = { talhoes: [], culturas: [], fazendas: [], equipamentos: [], pessoas: [] };
  nucleo.apagarCaixa(CAIXA);
  Object.assign(C.fr, { plantio: '', tipo: '', de: '', ate: '', sit: '' });
  telaAtual = ''; fechar();
}
/** Vencimentos do caderno para o calendário da Certificação (análises, calibrações, prazos de NC, previsão de colheita). */
export function itensCaderno(de, ate) {
  if (!C.carregado) return [];
  const it = [];
  for (const a of C.analises) if (a.vence && a.vence >= de && a.vence <= ate) it.push({ data: a.vence, titulo: `Análise vence: ${a.tipo} · ${a.ponto}`, tipo: 'Atividade', tela: 'ccAnalises' });
  for (const c of C.calibs) if (c.proxima && c.proxima >= de && c.proxima <= ate) it.push({ data: c.proxima, titulo: `Calibração: ${c.equipamento}`, tipo: 'Atividade', tela: 'ccCalibracoes' });
  for (const r of C.regs) if (r.tipo === 'ocorrencia' && r.situacao !== 'Cancelado' && r.dados?.status !== 'Encerrada' && r.dados?.prazo >= de && r.dados?.prazo <= ate) it.push({ data: r.dados.prazo, titulo: `Ação corretiva: ${r.dados.descricao || ''}`, tipo: 'Atividade', tela: 'ccRegistros' });
  for (const p of C.plantios) if (p.status === 'Em campo' && p.previsao_colheita >= de && p.previsao_colheita <= ate) it.push({ data: p.previsao_colheita, titulo: `Colheita prevista: ${rotPlantio(p)}`, tipo: 'Atividade', tela: 'ccPlantios' });
  return it;
}
/* Para testes. */
export const _cc = { C, liberacoes, habilitacao, travaColheita, travaReentrada, validarAplicacao, conformidade, carenciaDe };
