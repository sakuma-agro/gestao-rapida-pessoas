// certificacao.js — área Certificação do LOP - Gestão Rápida (13/10/2026)
//
// Decisão dele (09/10/2026): a Certificação tem "listas para imprimir e um
// calendário de cronograma". Hoje a fazenda tem GLOBALG.A.P. IFA, GLOBALG.A.P.
// GRASP, Rainforest Alliance e SMETA. Seguindo o exemplo do AgroCert que ele
// mandou (Requisitos.jsx / requisitos-consolidados.json), um requisito é
// escrito UMA vez e aponta para os códigos de cada norma que ele atende
// (campo referencias = [{norma, versao, codigo}]). Assim a mesma evidência
// serve às quatro certificações e cada uma imprime o seu check list.
//
// Tabelas (supabase/cert.sql), todas trancadas por app_pode('cert'):
//  · cert_certificacoes — as normas: ativa, versão, certificado, validade e auditorias
//  · cert_requisitos    — a lista consolidada (87 do AgroCert + 2 do SMETA)
//  · cert_documentos    — a lista mestra de documentos (anexos, IT, registros, POP, check list)
//  · cert_eventos       — o que se marca no calendário; pode repetir
//                         (mensal…anual) e cada ocorrência é dada como feita
//                         à parte (feitos = datas concluídas)
//
// O calendário junta o que foi marcado com o que já tem data em outro lugar:
// próxima auditoria e validade do certificado, prazo de requisito e próxima
// revisão de documento. Documento impresso: moldura .rel, marca da SAKUMA no
// topo e só a LOP no pé, sem nome de pessoa.

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo, registrarFaixaTela, subsLiberados, abrirGrupo, grupoAberto, aoMudarGrupo } from './acesso.js';
import { campoAnexos, donosComArquivo, listarArquivos, urlDoArquivo, abrirArquivo, enfileirarArquivo, enviarPendentes, contarPendentes, aoMudarArquivos } from './arquivos.js';
import { svgIcone } from './icones.js';
import { itensCaderno } from './cert-caderno.js';
import { abrirCroqui } from './cert-croqui.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;

/* ---------------- datas ---------------- */
const doisD = n => String(n).padStart(2, '0');
const isoD = d => `${d.getUTCFullYear()}-${doisD(d.getUTCMonth() + 1)}-${doisD(d.getUTCDate())}`;
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const utc = s => new Date(s + 'T12:00:00Z');
const entre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const somaDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return isoD(d); };
function somaMeses(s, m) {
  const d = utc(s); const dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m);
  const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ult));
  return isoD(d);
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES3 = MESES.map(m => m.slice(0, 3));
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ---------------- listas fixas ---------------- */
export const PRIORIDADES = ['Crítica', 'Maior', 'Menor'];
export const STATUS = ['Conforme', 'Em andamento', 'Pendente', 'Não conforme', 'Não se aplica'];
const COR_STATUS = { 'Conforme': 'ativo', 'Em andamento': 'neutra', 'Pendente': 'alerta', 'Não conforme': 'perigo', 'Não se aplica': 'inativo' };
const COR_PRIOR = { 'Crítica': 'perigo', 'Maior': 'alerta', 'Menor': 'neutra' };
const SITUACOES_DOC = ['Em dia', 'Revisar', 'Pendente', 'Inativo', 'Obsoleto'];
/* Inativo (30/10/2026, pedido dele: "atualiza os AN com os que estão ativos nas pastas"): documento
   guardado em "Inativos por enquanto" no OneDrive — sai da lista mestra e das pendências, mas não é
   apagado e pode voltar. Obsoleto = pasta _OBSOLETOS. */
const foraDeUso = d => d.situacao === 'Obsoleto' || d.situacao === 'Inativo';
const COR_SIT = { 'Em dia': 'ativo', 'Revisar': 'alerta', 'Pendente': 'perigo', 'Inativo': 'inativo', 'Obsoleto': 'inativo' };
const CATEGORIAS = ['ANEXO', 'CHECK LIST', 'INST. TRABALHO', 'P.O.Ps', 'POLÍTICAS', 'REGISTROS'];
const PERIODOS = ['Diário', 'Semanal', 'Mensal', 'Trimestral', 'Semestral', 'Anual', 'A cada 2 anos', 'A cada 3 anos', 'Por evento'];
/* Quantos meses até a próxima vez (o que é diário ou semanal não vai ao calendário: é rotina). */
const MESES_PERIODO = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada 2 anos': 24, 'A cada 3 anos': 36 };
const REPETIR = ['', 'Mensal', 'Trimestral', 'Semestral', 'Anual'];
const TIPOS_EVENTO = ['Auditoria externa', 'Auditoria interna', 'Treinamento', 'Simulado', 'Reunião', 'Atividade'];
/* cor no calendário (classe ce-ev-*) */
const COR_TIPO = {
  'Auditoria externa': 'marrom', 'Auditoria interna': 'verde', 'Treinamento': 'azul', 'Simulado': 'azul',
  'Reunião': 'cinza', 'Atividade': 'cinza',
  validade: 'vermelho', prazo: 'amarelo', revisao: 'cinza',
};
/* Sigla curta da norma, para as etiquetas dos códigos. */
const SIGLA = { 'GlobalG.A.P.': 'IFA', 'GRASP': 'GRASP', 'Rainforest Alliance': 'RA', 'SMETA': 'SMETA', 'ATITUDES': 'AT' };

/* ---------------- estado ---------------- */
const S = {
  carregado: false, certs: [], reqs: [], docs: [], evs: [], vinc: [], evid: [], viva: {}, itens: [], faz: [], docArq: [], docComArq: new Set(),
  fr: { q: '', cert: '', tema: '', prior: '', status: '', doc: '' },
  fd: { q: '', cat: '', per: '', sit: '', resp: '', modo: '', tipo: '', sel: null, q2: '' },
  cal: { ano: 0, mes: 0, cert: '', auto: true },
  anual: { ano: 0, cert: '', docs: false },
};

/* Cópia local (rodada C, 15/10/2026): a Certificação abre sem sinal para
   consulta (requisitos, documentos, calendário) com o que foi lido da última
   vez; marcar "feito" sem sinal entra na fila 'cert' e sobe depois, por item
   (cert_marcar_feito). Cadastrar/editar requisitos continua só com internet. */
const CAIXA = 'cert.cache';
const CAMADA = 'cert';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { certs: S.certs, reqs: S.reqs, docs: S.docs, evs: S.evs, vinc: S.vinc, evid: S.evid, viva: S.viva, itens: S.itens, faz: S.faz, docArq: S.docArq });
const CAMADA_DEF = {
  tabelaDe: c => c, chaveDe: () => 'id', paraBanco: (c, i) => i,
  cliente: () => estado.cliente,
  podeEnviar: () => !!(estado.cliente && estado.sessao && navigator.onLine),
  aoEnviado: (colecao, dado) => {
    if (colecao === 'cert_eventos' && dado && dado.id != null) {
      const i = S.evs.findIndex(x => x.id === dado.id);
      if (i >= 0) S.evs[i] = dado; else S.evs.push(dado);
      salvarCaixa();
    }
  },
};
export const enviarFilaCert = () => nucleo.enviarFila(CAMADA, CAMADA_DEF);
addEventListener('online', () => { enviarFilaCert().catch(() => {}); });
setInterval(() => { if (nucleo.pendentes(CAMADA) > 0) enviarFilaCert().catch(() => {}); }, 2 * 60 * 1000);

/* ===================================================================
   CADEIA POP → FORM → EVIDÊNCIAS (26/10/2026)
   Pedido dele: "um pop é vinculado a um form e depois aos Anexos que são
   evidências". cert_vinculos liga documento a documento (POP → FORM; as
   ligações iniciais foram lidas do texto de cada POP); cert_evidencias guarda
   cada evidência de um documento (data, descrição, link) com os arquivos no
   Drive em certificacao/evidencia/<id>. Evidência "viva": o FORM 050 e o
   FORM 043 contam como evidenciados nos meses em que o app tem lançamento
   (Biodiversidade e Energia); o FORM 013, nos meses com carga de abacate
   (Balanço de massa). Os AN foram refeitos em 27/10/2026 (o antigo AN 07
   Balanço de massa saiu: já é Form).
   =================================================================== */
const EVID_APP = {
  FORM50: { nome: 'Biodiversidade — registros das câmeras', tela: 'faPainel' },
  FORM43: { nome: 'Energia — lançamentos de consumo', tela: 'enPainel' },
  FORM53: { nome: 'Resíduos — saídas e avaliação do manejo', tela: 'rePainel' },
  FORM13: { nome: 'Balanço de massa — cargas de abacate', tela: 'bmPainel' },
  FORM23: { nome: 'Fornecedores — avaliações', tela: 'foPainel' },
  FORM4: { nome: 'Não conformidades — registro e tratamento', tela: 'mcNcs' },
  FORM20: { nome: 'Melhorias contínuas — banco e plano de melhorias', tela: 'mcMelhorias' },
  FORM42: { nome: 'Reclamações e sugestões', tela: 'mcFeedbacks' },
  FORM44: { nome: 'Reunião GRASP — atas realizadas', tela: 'gpPainel' },
};
const contaMeses = datas => datas.reduce((m, d) => { const k = String(d || '').slice(0, 7); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
async function carregarCadeia(c) {
  const [v, ev, fa, en, bm, fo, mc, cxa, it, fz, rs, ra, gp, bh, ccl, darq] = await Promise.all([
    c.from('cert_vinculos').select('*'),
    c.from('cert_evidencias').select('*').order('data', { ascending: false }),
    c.from('cf_registros').select('data'),
    c.from('ce_consumos').select('competencia'),
    c.from('cp_cargas').select('data, cp_culturas!inner(slug)').eq('cp_culturas.slug', 'abacate').eq('ativo', true),
    c.from('cfo_avaliacoes').select('data'),
    c.from('cmc_casos').select('data_abertura, tipo, natureza'),
    c.from('cmc_aberturas').select('data'),
    c.from('cert_doc_itens').select('*').eq('ativo', true),
    c.from('jor_fazendas').select('id, nome').eq('ativo', true).order('nome'),
    c.from('cr_saidas').select('data'),
    c.from('cr_avaliacoes').select('competencia'),
    c.from('cg_reunioes').select('data').eq('situacao', 'Realizada'),
    c.from('cb_banhos').select('data'),
    c.from('ccl_registros').select('data, documento_id'),
    c.from('arquivos').select('dono_id, chave, nome, origem, data_arquivo, criado_em').eq('area', 'certificacao').eq('tipo', 'documento').not('origem', 'is', null),
  ]);
  if (it && !it.error) S.itens = it.data || [];
  if (darq && !darq.error) S.docArq = darq.data || [];
  if (fz && !fz.error) S.faz = fz.data || [];
  if (!v.error) S.vinc = v.data || [];
  if (!ev.error) S.evid = ev.data || [];
  if (!fa.error) S.viva.FORM50 = contaMeses((fa.data || []).map(x => x.data));
  if (!en.error) S.viva.FORM43 = contaMeses((en.data || []).map(x => x.competencia));
  if (rs && !rs.error) S.viva.FORM53 = contaMeses((rs.data || []).map(x => x.data).concat(ra && !ra.error ? (ra.data || []).map(x => x.competencia) : []));
  if (gp && !gp.error) S.viva.FORM44 = contaMeses((gp.data || []).map(x => x.data));
  // Check List Digital (29/10/2026): cada CL preenchido no app conta como registro do RG CL nn.
  if (ccl && !ccl.error) {
    const porDoc = {};
    (ccl.data || []).forEach(x => { (porDoc[x.documento_id] = porDoc[x.documento_id] || []).push(x.data); });
    S.docs.filter(d => prefixoDoc(d) === 'CL').forEach(d => {
      const k = chaveCodigo(d.codigo);
      EVID_APP[k] = { nome: 'CHECKS Digital — preenchimentos no app', tela: 'clRegistros' };
      S.viva[k] = contaMeses(porDoc[d.id] || []);
    });
  }
  if (!bm.error) S.viva.FORM13 = contaMeses((bm.data || []).map(x => x.data));
  if (!fo.error) S.viva.FORM23 = contaMeses((fo.data || []).map(x => x.data));
  if (!mc.error) { const doTipo = n => contaMeses((mc.data || []).filter(x => x.natureza === n).map(x => x.data_abertura));
    S.viva.FORM4 = doTipo('NC'); S.viva.FORM20 = doTipo('MELHORIA'); S.viva.FORM42 = contaMeses((mc.data || []).filter(x => x.natureza === 'FEEDBACK').map(x => x.data_abertura)
      .concat(cxa && !cxa.error ? (cxa.data || []).map(x => x.data) : [])); }
  S.evArq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}
const porCodigo = (a, b) => so(a.codigo).localeCompare(so(b.codigo), 'pt-BR', { numeric: true });
const ligadosDe = d => S.vinc.filter(v => v.de_id === d.id).map(v => ({ v, d: S.docs.find(x => x.id === v.para_id) })).filter(x => x.d).sort((a, b) => porCodigo(a.d, b.d));
const ligadosPara = d => S.vinc.filter(v => v.para_id === d.id).map(v => ({ v, d: S.docs.find(x => x.id === v.de_id) })).filter(x => x.d).sort((a, b) => porCodigo(a.d, b.d));
/* Evidências por ano (29/10/2026, pedido dele: "já coloca todas as evidências aqui"): nos AN, IT e POL os
   arquivos da pasta do documento no OneDrive contam como evidência do ano da pasta (AN xx\2025\…) — ou, sem
   pasta de ano, da data do arquivo. Não são editáveis aqui: o arquivo manda (OneDrive). */
const TIPOS_EV_ARQ = new Set(['AN', 'IT', 'POL']);
function dataEvArq(x) {
  const ano = anoDaPasta(x), da = String(x.data_arquivo || '').slice(0, 10), cr = String(x.criado_em || '').slice(0, 10);
  if (ano !== '0000') return da.startsWith(ano) ? da : (ano + '-12-31' > hoje() ? hoje() : ano + '-12-31');
  return da || cr;
}
const evArqDe = d => TIPOS_EV_ARQ.has(prefixoDoc(d))
  ? (Array.isArray(S.docArq) ? S.docArq : []).filter(x => x.dono_id === String(d.id)).map(x => ({ id: 'arq:' + x.chave, documento_id: d.id, data: dataEvArq(x), _arq: x.chave,
      descricao: String(x.origem || '').split('/').slice(2).join(' / ') || x.nome, item_id: null }))
  : [];
const evidDe = d => [...S.evid.filter(e => e.documento_id === d.id), ...evArqDe(d)].sort((a, b) => b.data.localeCompare(a.data));
/* RG (27/10/2026, pedido dele: "ao preencher os forms temos registros, vamos criar o RG"):
   RG 0xx = o FORM 0xx preenchido, mesmo número. Os lançamentos feitos no app
   (EVID_APP) contam como registro do RG; o FORM fica sendo o modelo. */
const chaveApp = d => chaveCodigo(d.codigo).replace(/^RGCL/, 'CL').replace(/^RG(?=\d)/, 'FORM');
/* RG CL nn (29/10/2026): o registro de um check list é "RG CL nn" e o modelo é o CL nn. */
const ehRgCl = d => /^RGCL\d/.test(chaveCodigo(d.codigo));
const numDoc = d => (chaveCodigo(d.codigo).match(/\d+$/) || [''])[0];
const rgDe = d => prefixoDoc(d) === 'FORM' ? S.docs.find(x => prefixoDoc(x) === 'RG' && !ehRgCl(x) && numDoc(x) === numDoc(d)) || null
  : prefixoDoc(d) === 'CL' ? S.docs.find(x => ehRgCl(x) && numDoc(x) === numDoc(d)) || null : null;
const formDe = d => prefixoDoc(d) !== 'RG' ? null
  : ehRgCl(d) ? S.docs.find(x => prefixoDoc(x) === 'CL' && numDoc(x) === numDoc(d)) || null
  : S.docs.find(x => prefixoDoc(x) === 'FORM' && numDoc(x) === numDoc(d)) || null;
const vivaDe = d => (EVID_APP[chaveApp(d)] ? { ...EVID_APP[chaveApp(d)], meses: S.viva[chaveApp(d)] || {} } : null);
const ehPop = d => prefixoDoc(d) === 'POP';
/** Janelas de cobrança da evidência conforme a periodicidade (as mais recentes por último). */
function janelas(d) {
  const p = d.periodicidade || 'Mensal';
  if (p === 'Por evento') return null;
  const hj = hoje(); const ano = Number(hj.slice(0, 4)), mes = Number(hj.slice(5, 7));
  const out = [];
  if (['Diário', 'Semanal', 'Mensal'].includes(p)) {
    for (let i = 11; i >= 0; i--) { const dt = new Date(Date.UTC(ano, mes - 1 - i, 1)); const k = isoD(dt).slice(0, 7);
      out.push({ rot: MES3[dt.getUTCMonth()] + '/' + String(dt.getUTCFullYear()).slice(2), de: k + '-01', ate: k + '-31', atual: i === 0 }); }
  } else if (p === 'Trimestral' || p === 'Semestral') {
    const n = p === 'Trimestral' ? 3 : 6; const blocos = p === 'Trimestral' ? 8 : 4;
    const idx = Math.floor((mes - 1) / n);
    for (let i = blocos - 1; i >= 0; i--) { let b = idx - i, a = ano; while (b < 0) { b += 12 / n; a--; }
      const m1 = b * n + 1, m2 = m1 + n - 1;
      out.push({ rot: `${p === 'Trimestral' ? (b + 1) + 'º tri' : (b + 1) + 'º sem'}/${String(a).slice(2)}`, de: `${a}-${doisD(m1)}-01`, ate: `${a}-${doisD(m2)}-31`, atual: i === 0 }); }
  } else {
    const passo = p === 'A cada 3 anos' ? 3 : p === 'A cada 2 anos' ? 2 : 1;
    for (let i = 3; i >= 0; i--) { const a1 = ano - i * passo, a2 = a1 + passo - 1;
      out.push({ rot: passo === 1 ? String(a1) : `${a1}–${String(a2).slice(2)}`, de: `${a1}-01-01`, ate: `${a2}-12-31`, atual: i === 0 }); }
  }
  return out;
}
function cobertura(d) {
  const js = janelas(d); if (!js) return null;
  const ev = evidDe(d); const viva = vivaDe(d);
  return js.map(j => {
    const n = ev.filter(e => e.data >= j.de && e.data <= j.ate).length
      + (viva ? Object.entries(viva.meses).filter(([k]) => `${k}-01` >= j.de && `${k}-01` <= j.ate).reduce((s, [, q]) => s + q, 0) : 0);
    return { ...j, n, estado: n ? 'ok' : j.atual ? 'aberto' : 'falta' };
  });
}

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !S.carregado) {
    S.certs = c0.certs || []; S.reqs = c0.reqs || []; S.docs = c0.docs || []; S.evs = c0.evs || [];
    S.vinc = c0.vinc || []; S.evid = c0.evid || []; S.viva = c0.viva || {}; S.itens = c0.itens || []; S.faz = c0.faz || []; S.docArq = c0.docArq || [];
    S.carregado = true;
  }
  await nucleo.contarFila(CAMADA);
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (S.carregado) return;
    throw new Error('Sem internet e sem cópia da certificação neste aparelho.');
  }
  await enviarFilaCert().catch(() => {});
  const [a, b, d, e] = await Promise.all([
    c.from('cert_certificacoes').select('*').order('ordem').order('nome'),
    c.from('cert_requisitos').select('*').order('id'),
    c.from('cert_documentos').select('*').order('categoria').order('codigo'),
    c.from('cert_eventos').select('*').order('data'),
  ]);
  const erro = a.error || b.error || d.error || e.error;
  if (erro && S.carregado) return;   // rede falhou: fica a cópia
  if (erro) {
    if (/documentos/i.test(erro.message || '') && /column/i.test(erro.message || ''))
      throw new Error('Falta a coluna "documentos" em cert_requisitos no banco (supabase/cert.sql).');
    if (/cert_|relation|does not exist|schema cache/i.test(erro.message || ''))
      throw new Error('As tabelas da Certificação ainda não foram criadas no banco (supabase/cert.sql).');
    throw erro;
  }
  S.certs = a.data || []; S.reqs = b.data || []; S.docs = d.data || []; S.evs = e.data || [];
  await carregarCadeia(c);
  S.carregado = true;
  salvarCaixa();
  /* 30/10/2026: antes gravava em S.docArq e apagava a lista de arquivos das pastas (evidências dos AN/IT/POL) —
     o painel do AN quebrava ("filter is not a function"). Agora são dois nomes. */
  S.docComArq = await donosComArquivo('certificacao', 'documento').catch(() => new Set());
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const ativas = () => S.certs.filter(c => c.ativa);
const certPorId = id => S.certs.find(c => c.id === id);
const certPorNorma = n => S.certs.find(c => c.norma === n);
const refsDe = r => Array.isArray(r.referencias) ? r.referencias : [];
/** O requisito vale para a certificação c? (tem código daquela norma) */
const atende = (r, c) => refsDe(r).some(x => x.norma === c.norma);
/** Vale para alguma certificação que a fazenda tem hoje? */
const emUso = r => ativas().some(c => atende(r, c));
const codigosDe = (r, c) => refsDe(r).filter(x => x.norma === c.norma).map(x => x.codigo);
const sigla = n => SIGLA[n] || certPorNorma(n)?.id || n;
/* Documentos da lista mestra ligados ao requisito (evidência) — 13/10/2026. */
const docsDe = r => (r.documentos || []).map(id => S.docs.find(d => d.id === id)).filter(Boolean)
  .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
const reqsDoDoc = d => S.reqs.filter(r => (r.documentos || []).includes(d.id));
const rotDoc = d => `${d.codigo} · ${d.nome}`;
/* Link da pasta/arquivo no OneDrive (13/10/2026): o código vira link que abre numa aba nova. */
const linkOk = u => /^https?:\/\//i.test(so(u));
const codigoLink = (d, cls = '') => (linkOk(d.link)
  ? `<a class="ce-cod-link ${cls}" href="${esc(d.link)}" target="_blank" rel="noopener" title="Abrir no OneDrive: ${esc(d.nome)}">${esc(d.codigo)}<span aria-hidden="true">↗</span></a>`
  : `<b>${esc(d.codigo)}</b>`) + (S.docComArq?.has?.(String(d.id)) ? '<span class="ce-anx" title="Tem arquivo no Google Drive">📎</span>' : '');
/** Códigos das normas que o documento atende, pelos requisitos ligados a ele
 *  (só das certificações ligadas, sem repetir, na ordem das certificações). */
function codigosDoDoc(d) {
  const ordem = n => { const i = S.certs.findIndex(c => c.norma === n); return i < 0 ? 99 : i; };
  const vistos = new Map();
  reqsDoDoc(d).forEach(r => refsDe(r).forEach(x => {
    if (!certPorNorma(x.norma)?.ativa) return;
    const k = x.norma + '|' + x.codigo;
    if (!vistos.has(k)) vistos.set(k, x);
  }));
  return [...vistos.values()].sort((a, b) => ordem(a.norma) - ordem(b.norma)
    || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
}
const codTags = lista => lista.map(x => `<span class="ce-ref" title="${esc(x.norma)} ${esc(x.versao || '')}">${esc(sigla(x.norma))} ${esc(x.codigo)}</span>`).join('');
const codTexto = lista => lista.map(x => `${sigla(x.norma)} ${x.codigo}`).join(' · ');
const docTags = (r, clicavel = true) => docsDe(r).map(d => clicavel
  ? `<button type="button" class="ce-doc" data-vdoc="${d.id}" title="${esc(d.nome)}">${esc(d.codigo)}</button>`
  : `<span class="ce-doc" title="${esc(d.nome)}">${esc(d.codigo)}</span>`).join('');
const temas = () => [...new Set(S.reqs.map(r => r.tema).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const responsaveis = () => [...new Set([...S.reqs, ...S.docs, ...S.evs].map(x => so(x.responsavel)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Requisitos de uma certificação, sem os "não se aplica". */
function placar(c) {
  const lista = S.reqs.filter(r => atende(r, c) && r.status !== 'Não se aplica');
  const conf = lista.filter(r => r.status === 'Conforme').length;
  return {
    total: lista.length, conf,
    pct: lista.length ? Math.round(conf * 100 / lista.length) : 0,
    criticos: lista.filter(r => r.prioridade === 'Crítica' && r.status !== 'Conforme').length,
    nc: lista.filter(r => r.status === 'Não conforme').length,
  };
}

/** Próxima vez do documento: última revisão + periodicidade. */
function proximaDoc(d) {
  const m = MESES_PERIODO[d.periodicidade];
  if (!m || !d.data_revisao) return null;
  return somaMeses(d.data_revisao, m);
}
const docAtrasado = d => { if (foraDeUso(d)) return false; const p = proximaDoc(d); return !!p && p < hoje(); };
/** Situação mostrada: no AN por fazenda vem das fazendas (Pendente se alguma está sem evidência ou vencida);
    nos demais, a situação escolhida no cadastro. */
function sitDoc(d) {
  if (!d.por_fazenda || foraDeUso(d)) return d.situacao;
  const its = itensDe(d);
  if (!its.length) return d.situacao;
  return its.some(i => estadoItem(i, d).c === 'perigo') ? 'Pendente' : 'Em dia';
}

/** Ocorrências de um evento entre de e ate (inclusive). */
function ocorrencias(ev, de, ate) {
  const passo = MESES_PERIODO[ev.repetir];
  const r = [];
  if (!passo) { if (ev.data >= de && ev.data <= ate) r.push(ev.data); return r; }
  // pula direto para perto do começo do período
  let i = 0, d = ev.data;
  if (d < de) {
    const meses = (utc(de).getUTCFullYear() - utc(d).getUTCFullYear()) * 12 + utc(de).getUTCMonth() - utc(d).getUTCMonth();
    i = Math.max(0, Math.floor(meses / passo) - 1);
    d = somaMeses(ev.data, i * passo);
  }
  for (let n = 0; n < 500 && d <= ate; n++, i++, d = somaMeses(ev.data, i * passo)) if (d >= de) r.push(d);
  return r;
}
const feito = (ev, data) => (ev.feitos || []).includes(data);

/** Tudo o que cai no calendário entre de e ate. */
function itensEntre(de, ate, { cert = '', auto = true } = {}) {
  const r = [];
  const daCert = lista => !cert || (lista || []).includes(cert);
  for (const ev of S.evs) {
    if (!daCert(ev.certificacoes)) continue;
    for (const d of ocorrencias(ev, de, ate))
      r.push({ data: d, tipo: ev.tipo, cor: COR_TIPO[ev.tipo] || 'cinza', titulo: ev.titulo, ev, feito: feito(ev, d),
        certs: ev.certificacoes || [], resp: ev.responsavel });
  }
  if (!auto) return r.sort(ordemItem);
  for (const c of ativas()) {
    if (cert && c.id !== cert) continue;
    if (c.proxima_auditoria && c.proxima_auditoria >= de && c.proxima_auditoria <= ate)
      r.push({ data: c.proxima_auditoria, tipo: 'Auditoria externa', cor: 'marrom', titulo: `Auditoria ${c.nome}`, auto: 'cert', ref: c.id, certs: [c.id] });
    if (c.validade && c.validade >= de && c.validade <= ate)
      r.push({ data: c.validade, tipo: 'Validade', cor: 'vermelho', titulo: `Vence o certificado ${c.nome}`, auto: 'cert', ref: c.id, certs: [c.id] });
  }
  for (const q of S.reqs) {
    if (!q.prazo || q.prazo < de || q.prazo > ate || q.status === 'Conforme' || q.status === 'Não se aplica') continue;
    const cs = ativas().filter(c => atende(q, c)).map(c => c.id);
    if (!cs.length || (cert && !cs.includes(cert))) continue;
    r.push({ data: q.prazo, tipo: 'Prazo de requisito', cor: 'amarelo', titulo: q.titulo, auto: 'req', ref: q.id, certs: cs, resp: q.responsavel });
  }
  for (const d of S.docs) {
    const p = proximaDoc(d);
    if (!p || p < de || p > ate || foraDeUso(d)) continue;
    if (cert && (d.certificacoes || []).length && !d.certificacoes.includes(cert)) continue;
    r.push({ data: p, tipo: 'Revisão de documento', cor: 'cinza', titulo: `${d.codigo} · ${d.nome}`, auto: 'doc', ref: d.id, certs: d.certificacoes || [], resp: d.responsavel });
  }
  // Caderno de campo (19/10/2026): análises, calibrações, prazos de NC e colheitas previstas — IFA.
  if (!cert || cert === 'IFA') for (const i of itensCaderno(de, ate)) r.push({ ...i, cor: 'verde', auto: 'caderno', ref: i.tela, certs: ['IFA'] });
  return r.sort(ordemItem);
}
const ordemItem = (a, b) => a.data.localeCompare(b.data) || (a.auto ? 1 : 0) - (b.auto ? 1 : 0) || a.titulo.localeCompare(b.titulo, 'pt-BR');

/* ===================================================================
   PEDAÇOS DE TELA
   =================================================================== */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const refTags = (r, soAtivas = true) => refsDe(r)
  .filter(x => !soAtivas || certPorNorma(x.norma)?.ativa)
  .map(x => `<span class="ce-ref" title="${esc(x.norma)} ${esc(x.versao || '')}">${esc(sigla(x.norma))} ${esc(x.codigo)}</span>`).join('');
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const barraPct = pct => `<span class="ce-pct"><i style="width:${pct}%"></i></span>`;

function dialogo(html, ligar) {
  let d = $('dlgCe');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCe'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgCe')?.open && $('dlgCe').close();
const erroDlg = t => { const e = $('ceErro'); if (e) { e.textContent = t; e.hidden = false; } $('dlgCe').scrollTop = 0; };
const datalist = (id, itens) => `<datalist id="${id}">${itens.map(i => `<option value="${esc(i)}">`).join('')}</datalist>`;

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
/* Entrada da Certificação (29/10/2026, desenho aprovado — claude/cert-redesenho-lean.md):
   "O que você quer fazer?" com três portas (Documentos · Registros · Pendências)
   e os atrasados ao lado. Clicar numa porta abre a lista dela aqui mesmo (e os
   ícones dela na faixa de cima). O painel antigo fica em "Resumo completo". */
const PORTAS = [
  { g: 'Documentos', icone: 'documento', desc: 'Ver e imprimir o que a fazenda tem por escrito' },
  { g: 'Registros', icone: 'lapis', desc: 'Preencher o que acontece no dia a dia' },
  { g: 'Pendências', icone: 'calendario', desc: 'O que está atrasado ou vence logo' },
  { g: 'Indicadores', icone: 'grafico', desc: 'Absenteísmo e turnover do DP, para apresentar na auditoria' },
];
/* "FORMS Digital · Check lists e caderno" quando a porta tem seções; senão os nomes. */
const resumoPorta = subs => {
  const sec = [...new Set(subs.map(s => s.secao).filter(Boolean))];
  return sec.length ? sec.join(' · ') : subs.map(s => s.nome).join(' · ');
};
const subsDaPorta = g => subsLiberados('cert').filter(s => s.grupo === g);
function abrirSubDaPorta(id) {
  const s = subsLiberados('cert').find(x => x.id === id);
  if (s) abrirModulo('cert', s.telas[0][0]);
}

/* Atrasados, próximos 60 dias e números da certificação — usados na entrada e em Pendências. */
function dadosPendencias() {
  const hj = hoje();
  const prox = itensEntre(hj, somaDias(hj, 60)).filter(i => !i.feito);
  const atrasados = [
    ...S.docs.filter(d => !foraDeUso(d) && docAtrasado(d)).map(d => ({ data: proximaDoc(d), titulo: `${d.codigo} · ${d.nome}`, tipo: 'Revisão de documento', resp: d.responsavel })),
    ...S.reqs.filter(r => r.prazo && r.prazo < hj && emUso(r) && !['Conforme', 'Não se aplica'].includes(r.status)).map(r => ({ data: r.prazo, titulo: r.titulo, tipo: 'Prazo de requisito', resp: r.responsavel })),
    ...eventosVencidos(),
  ].sort((a, b) => a.data.localeCompare(b.data));
  const criticos = S.reqs.filter(r => emUso(r) && r.prioridade === 'Crítica' && !['Conforme', 'Não se aplica'].includes(r.status));
  const docsPend = S.docs.filter(d => ['Pendente', 'Revisar'].includes(sitDoc(d)) || docAtrasado(d));
  const emUsoTodos = S.reqs.filter(r => emUso(r) && r.status !== 'Não se aplica');
  const conf = emUsoTodos.filter(r => r.status === 'Conforme').length;

  const cartao = (cor, rot, n, dica, alvo) => `<button type="button" class="pv-card pv-${cor}${n ? '' : ' pv-zero'}" ${alvo ? `data-ir="${alvo}"` : ''}>
    <span>${esc(rot)}</span><strong>${n}</strong><small>${esc(dica)}</small></button>`;
  return { hj, prox, atrasados, criticos, docsPend, emUsoTodos, conf, cartao };
}

function desenharPainel() {
  const tela = $('telaCePainel');
  const { prox, atrasados } = dadosPendencias();


  const porta = PORTAS.some(p => p.g === grupoAberto()) ? grupoAberto() : null;
  ultimaPorta = porta;
  const listaPorta = g => {
    const subs = subsDaPorta(g);
    const secoes = [...new Set(subs.map(s => s.secao || ''))];
    return secoes.map(sec => `${sec ? `<div class="ce-ent-secao">${esc(sec)}</div>` : ''}
      <div class="ce-ent-lista">${subs.filter(s => (s.secao || '') === sec).map(s => `
        <button type="button" class="ce-ent-item" data-sub="${s.id}">
          <span class="ce-ent-nome">${esc(s.nome)}</span>${s.codigo ? `<span class="ce-ent-cod">${esc(s.codigo)}</span>` : ''}
          ${svgIcone('seta-dir')}</button>`).join('')}</div>`).join('');
  };
  const atrasoLinhas = atrasados.slice(0, 6).map(i => `<button type="button" class="ce-ent-atr" data-atr-tipo="${esc(i.tipo)}">
      <span><b>${esc(i.titulo)}</b><small>${esc(i.tipo)} · desde ${br(i.data)}${i.resp ? ' · ' + esc(i.resp) : ''}</small></span>
      <span class="ce-ent-pilula">Atrasado</span></button>`).join('');

  tela.innerHTML = `<div class="ce-ent naoimprimir">
    <div class="ce-ent-princ">
      ${porta ? `<div class="ce-ent-topo"><button type="button" class="btn ce-ent-voltar" id="ceEntVoltar">${svgIcone('seta-esq')}<span>Voltar</span></button>
          <h2>${esc(porta)}</h2></div>
        <p class="dica" style="margin:0 0 10px">${esc(PORTAS.find(p => p.g === porta).desc)}</p>
        ${listaPorta(porta)}`
      : `<div class="ce-ent-topo"><h2>O que você quer fazer?</h2>
          <div class="ce-ent-chips">${ativas().map(c => `<span>${esc(c.nome)}</span>`).join('')}</div></div>
        ${atrasados.length ? `<button type="button" class="ce-ent-alerta" id="ceEntAtr">${svgIcone('alerta')}<span>${atrasados.length} ${atrasados.length === 1 ? 'item atrasado' : 'itens atrasados'}</span><b>Ver</b></button>` : ''}
        <div class="ce-ent-portas">${PORTAS.map(p => {
          const subs = subsDaPorta(p.g);
          if (!subs.length) return '';
          return `<button type="button" class="ce-ent-porta" data-porta="${esc(p.g)}">
            <span class="ce-ent-ico">${svgIcone(p.icone)}</span>
            <span class="ce-ent-txt"><b>${esc(p.g)}</b><span>${esc(p.desc)}</span>
              <small>${esc(resumoPorta(subs))}</small></span></button>`;
        }).join('')}</div>`}
    </div>
    <aside class="ce-ent-lado" id="ceEntLado">
      <div class="ce-ent-lado-topo"><b>Atrasados · ${atrasados.length}</b><button type="button" class="btn mini" id="ceEntCal">Ver pendências</button></div>
      ${atrasoLinhas || '<div class="vazio">Nada atrasado.</div>'}
      ${atrasados.length > 6 ? `<p class="dica" style="margin:8px 0 0">e mais ${atrasados.length - 6} no calendário.</p>` : ''}
    </aside>
  </div>
`;
  tela.querySelectorAll('[data-porta]').forEach(b => b.addEventListener('click', () => b.dataset.porta === 'Pendências' ? abrirModulo('cert', 'cePendencias') : abrirGrupo('cert', b.dataset.porta)));
  tela.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => abrirSubDaPorta(b.dataset.sub)));
  $('ceEntVoltar')?.addEventListener('click', () => abrirModulo('cert', 'cePainel'));
  $('ceEntAtr')?.addEventListener('click', () => abrirModulo('cert', 'cePendencias'));
  $('ceEntCal')?.addEventListener('click', () => abrirModulo('cert', 'cePendencias'));
  tela.querySelectorAll('[data-atr-tipo]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', 'cePendencias')));
}

/* ===================================================================
   TELA · PENDÊNCIAS (etapa 3, 29/10/2026 — claude/cert-redesenho-lean.md)
   Tudo que precisa de atenção num lugar: números, atrasados, o que vence
   e os atalhos para o calendário, o cronograma anual e os indicadores.
   =================================================================== */
function desenharPendencias() {
  const tela = $('telaCePendencias');
  const { prox, atrasados, criticos, docsPend, emUsoTodos, conf, cartao } = dadosPendencias();
  tela.innerHTML = `<div class="ce-pend-topo naoimprimir">
      <div><h2 style="margin:0">Pendências</h2>
        <p class="dica" style="margin:2px 0 0">O que está atrasado, o que vence logo e como está cada certificação.</p></div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" data-ir-tela="ceCalendario">Calendário</button>
        <button class="btn" type="button" data-ir-tela="ceAnual">Cronograma anual</button>
        <button class="btn" type="button" data-ir-tela="ceIndAbs">Indicadores</button>
      </div>
    </div>

<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h3 style="margin:0">Situação das certificações</h3>
        <p class="dica" style="margin:2px 0 0">${ativas().map(c => esc(c.nome)).join(' · ') || 'Nenhuma certificação ligada'}</p></div>
      <button class="btn" type="button" id="cePnNovo">Marcar no calendário</button>
    </div>

    <div class="ce-certs">${ativas().map(c => cartaoCert(c)).join('') || '<div class="vazio">Ligue as certificações da fazenda em Certificações.</div>'}</div>

    <div class="pv-cards" style="margin-top:14px">
      ${cartao('calma', 'Requisitos conformes', `${conf}/${emUsoTodos.length}`, emUsoTodos.length ? `${Math.round(conf * 100 / emUsoTodos.length)}% das certificações ligadas` : '—', 'req')}
      ${cartao('perigo', 'Críticos em aberto', criticos.length, 'prioridade crítica sem conformidade', 'criticos')}
      ${cartao('alerta', 'Documentos a revisar', docsPend.length, 'pendentes, a revisar ou vencidos', 'docs')}
      ${cartao('atencao', 'Próximos 60 dias', prox.length, 'no calendário', 'cal')}
      ${cartao(atrasados.length ? 'perigo' : 'ok', 'Atrasados', atrasados.length, 'prazos e revisões que passaram', 'cal')}
    </div>

    ${atrasados.length ? `<div class="qp-bloco"><h3>Atrasados</h3>${tabelaItens(atrasados, '')}</div>` : ''}
    <div class="qp-bloco">
      <h3>Próximos 60 dias</h3>
      ${tabelaItens(prox, 'Nada marcado para os próximos 60 dias.')}
    </div>
    <div class="qp-bloco">
      <h3>Requisitos críticos em aberto</h3>
      ${criticos.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Requisito</th><th>Tema</th><th>Códigos</th><th class="ce">Status</th><th></th></tr></thead><tbody>
        ${criticos.map(r => `<tr><td><b>${esc(r.titulo)}</b>${r.responsavel ? `<br><span class="dc-sem">${esc(r.responsavel)}${r.prazo ? ' · prazo ' + br(r.prazo) : ''}</span>` : ''}</td>
          <td>${esc(r.tema)}</td><td><div class="ce-refs">${refTags(r)}</div></td>
          <td class="ce">${tag(r.status, COR_STATUS[r.status])}</td>
          <td class="ce"><button class="btn mini" type="button" data-req="${r.id}">Abrir</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum requisito crítico em aberto.</div>'}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="cePnImprimir">Imprimir o painel</button>
  </div>
`;
  tela.querySelectorAll('[data-ir-tela]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', b.dataset.irTela)));
  $('cePnNovo').addEventListener('click', () => formEvento(null, hoje()));
  $('cePnImprimir').addEventListener('click', () => mostrar(docPainel(prox, atrasados, criticos), { barra: true }));
  tela.querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => formRequisito(Number(b.dataset.req))));
  tela.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => {
    Object.assign(S.fr, { q: '', cert: b.dataset.cert, tema: '', prior: '', status: '', doc: '' });
    abrirModulo('cert', 'ceRequisitos');
  }));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    const alvo = b.dataset.ir;
    if (alvo === 'req' || alvo === 'criticos') {
      Object.assign(S.fr, { q: '', cert: '', tema: '', prior: alvo === 'criticos' ? 'Crítica' : '', status: alvo === 'criticos' ? 'aberto' : '', doc: '' });
      abrirModulo('cert', 'ceRequisitos');
    } else if (alvo === 'docs') {
      Object.assign(S.fd, { q: '', cat: '', per: '', sit: 'atencao', resp: '' });
      abrirModulo('cert', 'ceDocumentos');
    } else abrirModulo('cert', 'ceCalendario');
  }));
  ligarItens(tela);
}


/** Ocorrências que passaram sem serem dadas como feitas: eventos únicos e,
 *  desde 27/10/2026 (FORM 044 atrasado sem aviso), também as repetições dos
 *  últimos 12 meses. */
function eventosVencidos() {
  const hj = hoje(), de = somaMeses(hj, -12), ontem = somaDias(hj, -1);
  return S.evs.flatMap(ev => (ev.repetir ? ocorrencias(ev, de, ontem) : (ev.data < hj ? [ev.data] : []))
    .filter(d => !feito(ev, d))
    .map(d => ({ data: d, titulo: ev.titulo, tipo: ev.tipo, resp: ev.responsavel, ev })));
}

function cartaoCert(c) {
  const p = placar(c);
  const hj = hoje();
  const dVal = c.validade ? entre(hj, c.validade) : null;
  const dAud = c.proxima_auditoria ? entre(hj, c.proxima_auditoria) : null;
  const val = c.validade == null ? tag('validade não informada', 'neutra')
    : dVal < 0 ? tag(`vencido em ${br(c.validade)}`, 'perigo')
    : dVal <= 90 ? tag(`vence em ${dVal} dia(s)`, 'alerta') : `<span class="dc-sem">válido até ${br(c.validade)}</span>`;
  return `<button type="button" class="ce-cert" data-cert="${esc(c.id)}">
    <span class="ce-cert-nome"><b>${esc(c.nome)}</b><small>${esc(c.versao || '')}${c.numero ? ' · ' + esc(c.numero) : ''}</small></span>
    <span class="ce-cert-num"><strong>${p.pct}%</strong><small>${p.conf} de ${p.total} conformes</small></span>
    ${barraPct(p.pct)}
    <span class="ce-cert-pe">${p.criticos ? tag(`${p.criticos} crítico(s) em aberto`, 'perigo') : tag('sem crítico em aberto', 'ativo')}
      ${val}
      ${c.proxima_auditoria ? `<span class="dc-sem">auditoria ${br(c.proxima_auditoria)}${dAud >= 0 ? ` (em ${dAud} dia(s))` : ''}</span>` : '<span class="dc-sem">auditoria sem data</span>'}</span>
  </button>`;
}

function tabelaItens(itens, vazio) {
  if (!itens.length) return `<div class="vazio">${esc(vazio)}</div>`;
  const hj = hoje();
  return `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>O quê</th><th>Tipo</th><th>Certificação</th><th>Responsável</th><th></th></tr></thead><tbody>
    ${itens.map((i, k) => `<tr><td class="ce">${br(i.data)}${i.data < hj ? '<br>' + tag('atrasado', 'perigo') : ''}</td>
      <td><b>${esc(i.titulo)}</b></td>
      <td><span class="ce-bola ce-ev-${i.cor || COR_TIPO[i.tipo] || 'cinza'}"></span>${esc(i.tipo)}</td>
      <td>${(i.certs || []).map(id => esc(certPorId(id)?.id || id)).join(', ') || '—'}</td>
      <td>${esc(i.resp || '—')}</td>
      <td class="ce">${i.ev ? `<button class="btn mini" type="button" data-ev="${i.ev.id}" data-dia="${i.data}">Abrir</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
const ligarItens = tela => tela.querySelectorAll('[data-ev]').forEach(b =>
  b.addEventListener('click', () => formEvento(Number(b.dataset.ev), b.dataset.dia)));

/* ===================================================================
   TELA · REQUISITOS
   =================================================================== */
function reqFiltrados() {
  const f = S.fr;
  const q = so(f.q).toLowerCase();
  const cert = f.cert && f.cert !== '*' ? certPorId(f.cert) : null;
  return S.reqs.filter(r => {
    if (cert ? !atende(r, cert) : f.cert !== '*' && !emUso(r)) return false;
    if (f.tema && r.tema !== f.tema) return false;
    if (f.prior && r.prioridade !== f.prior) return false;
    if (f.status === 'aberto' ? ['Conforme', 'Não se aplica'].includes(r.status) : f.status && r.status !== f.status) return false;
    if (f.doc === 'sem' && docsDe(r).length) return false;
    if (f.doc === 'com' && !docsDe(r).length) return false;
    if (f.doc && !['sem', 'com'].includes(f.doc) && !(r.documentos || []).includes(Number(f.doc))) return false;
    if (q && ![r.titulo, r.descricao, r.evidencia, r.tema, r.responsavel, ...refsDe(r).map(x => x.codigo), ...docsDe(r).map(d => d.codigo)]
      .some(t => so(t).toLowerCase().includes(q))) return false;
    return true;
  });
}

function desenharRequisitos() {
  const tela = $('telaCeRequisitos');
  const f = S.fr;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Requisitos</h2>
        <p class="dica" style="margin:2px 0 0">Lista consolidada: cada requisito mostra os códigos de cada norma que ele atende.</p></div>
      <button class="btn principal" type="button" id="ceRqNovo">Novo requisito</button>
    </div>
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Buscar <input type="text" id="ceRqQ" value="${esc(f.q)}" placeholder="Requisito, evidência ou código (ex.: 4.6.1, FV-GFS 32.01)"></label>
      <label class="campo">Certificação <select id="ceRqCert">${opcoes([...ativas().map(c => [c.id, c.nome]), ['*', 'Todas, inclusive as desligadas']], f.cert, 'As que a fazenda tem')}</select></label>
      <label class="campo">Tema <select id="ceRqTema">${opcoes(temas(), f.tema, 'Todos')}</select></label>
      <label class="campo">Prioridade <select id="ceRqPrior">${opcoes(PRIORIDADES, f.prior, 'Todas')}</select></label>
      <label class="campo">Status <select id="ceRqStatus">${opcoes([['aberto', 'Em aberto (sem conformidade)'], ...STATUS], f.status, 'Todos')}</select></label>
      <label class="campo">Documento <select id="ceRqDoc">${opcoes([['com', 'Com documento ligado'], ['sem', 'Sem documento ligado'],
        ...S.docs.filter(d => reqsDoDoc(d).length || String(d.id) === f.doc).map(d => [String(d.id), rotDoc(d)])], f.doc, 'Todos')}</select></label>
    </div>
    <div class="barra" id="ceRqResumo"></div>
    <div id="ceRqTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ceRqCheck">Imprimir check list de auditoria</button>
    <button class="btn" type="button" id="ceRqLista">Imprimir lista</button>
    <button class="btn" type="button" id="ceRqExcel">Exportar Excel</button>
  </div>`;
  const ligarF = (id, campo, ev = 'change') => $(id).addEventListener(ev, e => { f[campo] = e.target.value; tabelaRequisitos(); });
  ligarF('ceRqQ', 'q', 'input'); ligarF('ceRqCert', 'cert'); ligarF('ceRqTema', 'tema'); ligarF('ceRqPrior', 'prior'); ligarF('ceRqStatus', 'status'); ligarF('ceRqDoc', 'doc');
  $('ceRqNovo').addEventListener('click', () => formRequisito(null));
  $('ceRqLista').addEventListener('click', () => mostrar(docListaReq(reqFiltrados()), { barra: true }));
  $('ceRqCheck').addEventListener('click', escolherChecklist);
  $('ceRqExcel').addEventListener('click', () => exportarReq(reqFiltrados()));
  tabelaRequisitos();
}

function tabelaRequisitos() {
  const lista = reqFiltrados();
  const conta = s => lista.filter(r => r.status === s).length;
  $('ceRqResumo').innerHTML = `<span class="contagem"><b>${lista.length}</b> requisito(s)</span>
    <span class="contagem"><b>${lista.filter(r => !docsDe(r).length).length}</b> sem documento ligado</span>
    ${STATUS.map(s => conta(s) ? `<span class="contagem">${tag(s, COR_STATUS[s])} <b>${conta(s)}</b></span>` : '').join('')}`;
  const todas = S.fr.cert === '*';
  $('ceRqTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha ce-tab-req"><thead><tr>
    <th>Requisito</th><th>Tema</th><th>Códigos nas normas</th><th>Documentos</th><th class="ce">Prioridade</th><th class="ce">Status</th><th>Responsável / prazo</th><th></th>
  </tr></thead><tbody>
  ${lista.map(r => `<tr>
    <td><b>${esc(r.titulo)}</b>${r.evidencia ? `<br><span class="dc-sem">${esc(r.evidencia.length > 120 ? r.evidencia.slice(0, 120) + '…' : r.evidencia)}</span>` : ''}</td>
    <td>${esc(r.tema)}</td>
    <td><div class="ce-refs">${refTags(r, !todas)}</div></td>
    <td><div class="ce-refs">${docTags(r) || '<span class="dc-sem">—</span>'}</div></td>
    <td class="ce">${tag(r.prioridade, COR_PRIOR[r.prioridade])}</td>
    <td class="ce">${tag(r.status, COR_STATUS[r.status])}</td>
    <td>${esc(r.responsavel || '—')}${r.prazo ? `<br><span class="dc-sem">${br(r.prazo)}</span>${r.prazo < hoje() && !['Conforme', 'Não se aplica'].includes(r.status) ? ' ' + tag('atrasado', 'perigo') : ''}` : ''}</td>
    <td class="ce"><button class="btn mini" type="button" data-req="${r.id}">Abrir</button></td>
  </tr>`).join('')}</tbody></table></div>`
    : `<div class="vazio">${S.reqs.length ? 'Nada com esses filtros.' : 'Nenhum requisito cadastrado.'}</div>`;
  $('ceRqTabela').querySelectorAll('[data-req]').forEach(b => b.addEventListener('click', () => formRequisito(Number(b.dataset.req))));
  $('ceRqTabela').querySelectorAll('[data-vdoc]').forEach(b => b.addEventListener('click', () => formDocumento(Number(b.dataset.vdoc))));
}

const chipDoc = d => `<span class="ce-chip" data-did="${d.id}" title="${esc(d.nome)}">${codigoLink(d)} ${esc(d.nome)}
  <button type="button" data-tirad title="Desligar este documento">✕</button></span>`;

function formRequisito(id) {
  const r = id ? S.reqs.find(x => x.id === id) : null;
  const v = r || { tema: S.fr.tema || '', prioridade: 'Maior', status: 'Pendente', referencias: S.fr.cert && S.fr.cert !== '*'
    ? [{ norma: certPorId(S.fr.cert).norma, versao: certPorId(S.fr.cert).versao, codigo: '' }] : [] };
  const val = k => esc(v[k] ?? '');
  const normas = [...new Set([...S.certs.map(c => c.norma), ...refsDe(v).map(x => x.norma)])];
  const linhaRef = x => `<div class="ce-reflinha">
    <select data-rnorma>${opcoes(normas.map(n => [n, `${certPorNorma(n)?.nome || n}`]), x.norma)}</select>
    <input type="text" data-rcod maxlength="40" value="${esc(x.codigo || '')}" placeholder="Código (ex.: 4.6.1)">
    <button class="btn mini" type="button" data-rtira title="Tirar este código">✕</button></div>`;

  dialogo(`<h3>${r ? 'Requisito' : 'Novo requisito'}</h3>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="grade">
      <label class="campo plena">Requisito <input type="text" id="cerTitulo" maxlength="300" value="${val('titulo')}" required></label>
      <label class="campo">Tema <input type="text" id="cerTema" list="ceListaTemas" maxlength="60" value="${val('tema')}"></label>
      <label class="campo">Prioridade <select id="cerPrior">${opcoes(PRIORIDADES, v.prioridade)}</select></label>
      <label class="campo">Status <select id="cerStatus">${opcoes(STATUS, v.status)}</select></label>
      <label class="campo">Responsável <input type="text" id="cerResp" list="ceListaResp" maxlength="80" value="${val('responsavel')}"></label>
      <label class="campo">Prazo <input type="date" id="cerPrazo" value="${val('prazo')}"></label>
      <label class="campo">Última verificação <input type="date" id="cerVerif" value="${val('ultima_verificacao')}"></label>
      <label class="campo">Periodicidade <input type="text" id="cerPer" list="ceListaPer" maxlength="40" value="${val('periodicidade')}"></label>
      <label class="campo plena">O que pede <textarea id="cerDesc" rows="3" maxlength="2000">${val('descricao')}</textarea></label>
      <label class="campo plena">Evidência esperada <textarea id="cerEvid" rows="3" maxlength="2000">${val('evidencia')}</textarea></label>
      <label class="campo plena">Observação <textarea id="cerObs" rows="2" maxlength="1000" placeholder="O que foi feito, onde está a evidência…">${val('observacao')}</textarea></label>
    </div>
    <h4 class="ac-h4">Códigos nas normas</h4>
    <div id="cerRefs">${refsDe(v).map(linhaRef).join('')}</div>
    <button class="btn mini" type="button" id="cerRefMais">+ Código</button>
    <h4 class="ac-h4">Documentos que comprovam <small class="dc-sem">da lista mestra</small></h4>
    <div class="ce-docs-lig" id="cerDocs">${docsDe(v).map(chipDoc).join('')}</div>
    <div class="ce-docbusca">
      <input type="text" id="cerDocQ" list="ceListaDocs" placeholder="Digite o código ou o nome (ex.: POP 08, irrigação)">
      <button class="btn mini" type="button" id="cerDocMais">Ligar</button>
    </div>
    <p class="dica" id="cerDocAviso" hidden></p>
    ${datalist('ceListaDocs', S.docs.filter(d => !foraDeUso(d)).map(rotDoc))}
    ${datalist('ceListaTemas', temas())}${datalist('ceListaResp', responsaveis())}${datalist('ceListaPer', PERIODOS)}
    ${r?.atualizado_por ? `<p class="dica">Última alteração: ${br(r.atualizado_em)} · ${esc(r.atualizado_por)}</p>` : ''}
    <div class="barra fim">
      ${r ? '<button class="btn perigo" type="button" id="cerApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cerGravar">Gravar</button>
    </div>`, d => {
    const ligarTira = () => d.querySelectorAll('[data-rtira]').forEach(b => { b.onclick = () => b.parentElement.remove(); });
    ligarTira();
    $('cerRefMais').addEventListener('click', () => {
      const ult = [...d.querySelectorAll('[data-rnorma]')].pop()?.value || ativas()[0]?.norma || normas[0];
      $('cerRefs').insertAdjacentHTML('beforeend', linhaRef({ norma: ult, codigo: '' }));
      ligarTira();
      [...d.querySelectorAll('[data-rcod]')].pop()?.focus();
    });
    const ligarChips = () => d.querySelectorAll('[data-tirad]').forEach(b => { b.onclick = () => b.parentElement.remove(); });
    ligarChips();
    const ligarDoc = () => {
      const txt = so($('cerDocQ').value);
      if (!txt) return;
      const t = txt.toLowerCase();
      const cod = t.split(' · ')[0];
      const parecidos = S.docs.filter(x => rotDoc(x).toLowerCase().includes(t));
      const achado = S.docs.find(x => rotDoc(x).toLowerCase() === t) || S.docs.find(x => x.codigo.toLowerCase() === cod)
        || (parecidos.length === 1 ? parecidos[0] : null);
      const aviso = $('cerDocAviso');
      if (!achado) {
        aviso.textContent = parecidos.length ? `${parecidos.length} documentos têm esse texto. Escolha um na lista que aparece ao digitar.` : 'Nenhum documento com esse código ou nome.';
        aviso.hidden = false; return;
      }
      aviso.hidden = true;
      if (!d.querySelector(`#cerDocs [data-did="${achado.id}"]`)) $('cerDocs').insertAdjacentHTML('beforeend', chipDoc(achado));
      ligarChips();
      $('cerDocQ').value = ''; $('cerDocQ').focus();
    };
    $('cerDocMais').addEventListener('click', ligarDoc);
    $('cerDocQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ligarDoc(); } });
    $('cerDocQ').addEventListener('change', () => { if (S.docs.some(x => rotDoc(x) === $('cerDocQ').value)) ligarDoc(); });
    $('cerGravar').addEventListener('click', () => gravarRequisito(r));
    $('cerApagar')?.addEventListener('click', () => apagar('cert_requisitos', r.id, r.titulo, () => { S.reqs = S.reqs.filter(x => x.id !== r.id); }));
  });
}

async function gravarRequisito(r) {
  const g = id => so($(id).value) || null;
  const referencias = [...document.querySelectorAll('#cerRefs .ce-reflinha')].map(l => {
    const norma = l.querySelector('[data-rnorma]').value;
    return { norma, versao: certPorNorma(norma)?.versao || refsDe(r || {}).find(x => x.norma === norma)?.versao || '', codigo: so(l.querySelector('[data-rcod]').value) };
  }).filter(x => x.codigo);
  const linha = {
    titulo: g('cerTitulo'), tema: g('cerTema') || 'Gestão', prioridade: $('cerPrior').value, status: $('cerStatus').value,
    responsavel: g('cerResp'), prazo: g('cerPrazo'), ultima_verificacao: g('cerVerif'), periodicidade: g('cerPer'),
    descricao: g('cerDesc'), evidencia: g('cerEvid'), observacao: g('cerObs'), referencias,
    documentos: [...document.querySelectorAll('#cerDocs [data-did]')].map(x => Number(x.dataset.did)),
    atualizado_em: new Date().toISOString(), atualizado_por: quem(),
  };
  if (!linha.titulo) return erroDlg('Escreva o requisito.');
  if (!referencias.length) return erroDlg('Informe pelo menos um código de norma — é ele que liga o requisito à certificação.');
  await salvar('cert_requisitos', r, linha, S.reqs, 'cerGravar');
}

/* ===================================================================
   TELA · DOCUMENTOS (lista mestra)
   =================================================================== */
function docFiltrados() {
  const f = S.fd;
  const q = so(f.q).toLowerCase();
  return S.docs.filter(d => {
    if (f.cat && d.categoria !== f.cat) return false;
    if (f.per && d.periodicidade !== f.per) return false;
    if (f.sit === 'semlink' ? linkOk(d.link) : f.sit === 'atencao' ? !(['Pendente', 'Revisar'].includes(sitDoc(d)) || docAtrasado(d)) : f.sit && sitDoc(d) !== f.sit) return false;
    if (f.resp && so(d.responsavel) !== f.resp) return false;
    if (q && ![d.codigo, d.nome, d.responsavel, d.observacao, codTexto(codigosDoDoc(d))].some(t => so(t).toLowerCase().includes(q))) return false;
    return true;
  });
}

/* -------------------------------------------------------------------
   Lista mestra por tipo de documento (26/10/2026, pedido do Guilherme):
   ao entrar aparecem cartões (POP, IT, RG, CL, AN); no cartão, a lista à
   esquerda e o documento aberto à direita — PDF vigente dentro do app
   (arquivo no Google Drive), "Abrir local" (pasta no OneDrive, campo link),
   "copiar caminho" (C:\NUVEM\OneDrive\…, campo caminho) e as revisões
   anteriores (arquivos do dono "<id>-rev"). A pasta espelho no computador é
   6 - Certificações › Certificação - Lop Gestão Rápida: o que está lá é o
   que já está no app. "Importar pasta" lê uma pasta dessas (uma subpasta
   por documento, com Revisões dentro) e sobe os PDFs para o Drive.
   ------------------------------------------------------------------- */
const TIPOS_DOC = [
  { id: 'POP', nome: 'POP', desc: 'Procedimentos operacionais', icone: 'documento', cat: 'P.O.Ps' },
  { id: 'IT', nome: 'IT', desc: 'Instruções de trabalho', icone: 'lista', cat: 'INST. TRABALHO' },
  { id: 'FORM', nome: 'FORM', desc: 'Formulários (modelos)', icone: 'boletim', cat: 'FORMULÁRIOS' },
  { id: 'RG', nome: 'RG', desc: 'Registros — FORMs preenchidos', icone: 'historico', cat: 'REGISTROS' },   // 27/10/2026
  { id: 'CL', nome: 'CL', desc: 'Check lists', icone: 'check', cat: 'CHECK LIST' },
  { id: 'AN', nome: 'AN', desc: 'Anexos', icone: 'etiqueta', cat: 'ANEXO' },
  { id: 'POL', nome: 'POL', desc: 'Políticas', icone: 'balanca', cat: 'POLÍTICAS' },   // 27/10/2026
];
/* Pasta espelho "Certificação - Lop Gestão Rápida" no OneDrive (link que ele mandou, 26/10/2026). */
const PASTA_CERT = 'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2FCertifica%C3%A7%C3%A3o%20%2D%20Lop%20Gest%C3%A3o%20R%C3%A1pida&viewid=076de95f%2D2e95%2D4233%2Da472%2D0c15d08dc08e';
const prefixoDoc = d => (so(d.codigo).toUpperCase().match(/^[A-Z]+/) || [''])[0];
const tipoDoc = id => TIPOS_DOC.find(t => t.id === id) || { id, nome: id || 'Outros', desc: 'Outros documentos', icone: 'documento', cat: '' };
const docsDoTipo = (id, comInativos = false) => S.docs.filter(d => (comInativos || !foraDeUso(d)) && (TIPOS_DOC.some(t => t.id === prefixoDoc(d)) ? prefixoDoc(d) : 'OUTROS') === id)
  .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
/* código comparável: "POP 1", "POP 001" e "POPAGR-01" viram POP1 */
const EMAIL_PC_LOCAL = 'escritoriosakuma@hotmail.com';   // login do Guilherme
const chaveCodigo = c => { const m = so(c).toUpperCase().replace(/^POPAGR/, 'POP').replace(/^POAGR/, 'POP').replace(/^FORMAGR/, 'FORM').replace(/^RG\s+CL\b/, 'RGCL').match(/^([A-Z]+)[\s._-]*0*(\d+)/); return m ? m[1] + Number(m[2]) : ''; };
const revDono = id => `${id}-rev`;
const ehPdf = x => /pdf$/i.test(x.mime || '') || /\.pdf$/i.test(x.nome || '');

/* Tipos na faixa de baixo (26/10/2026, pedido dele — sugestão 2): com a Lista
   mestra aberta, a faixa logo abaixo do verde mostra Visão geral · POP · IT ·
   FORM · CL · AN · Tabela, como as telas do Caderno de campo. Substitui o
   link "← Tipos de documento" dentro do cartão. */
function pintarFaixaDocs(faixa) {
  const f = S.fd;
  const outros = docsDoTipo('OUTROS');
  const tipos = [...TIPOS_DOC, ...(outros.length ? [{ id: 'OUTROS', nome: 'Outros', icone: 'documento' }] : [])];
  const atual = f.modo === 'tabela' ? 'tabela' : f.modo === 'tipo' ? f.tipo : 'geral';
  const btn = (id, rot, ic, n) => `<button type="button" class="rb-btn" role="tab" data-dctipo="${id}" aria-selected="${atual === id}" title="${esc(rot)}">
    ${svgIcone(ic)}<span>${esc(rot)}${n != null ? ` <small class="ce-fx-n">${n}</small>` : ''}</span></button>`;
  faixa.innerHTML = `<section class="rb-grupo rb-verde" aria-label="Lista mestra"><div class="rb-botoes">
    ${btn('geral', 'Visão geral', 'painel')}
    ${tipos.map(t => btn(t.id, t.nome, t.icone, docsDoTipo(t.id).length)).join('')}
    ${btn('tabela', 'Tabela', 'lista')}
    </div><div class="rb-rotulo">Lista mestra</div></section>`;
  faixa.querySelectorAll('[data-dctipo]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.dctipo;
    if (v === 'geral') { f.modo = ''; desenharDocumentos(); }
    else if (v === 'tabela') { f.modo = 'tabela'; desenharDocumentos(); }
    else abrirTipo(v);
  }));
}
const pintarFaixaDocsNaPorta = registrarFaixaTela('ceDocumentos', pintarFaixaDocs);

/* Repinta a faixa e o fim do caminho ("Certificação › Lista mestra › POP"). */
function atualizarFaixaDocs() {
  const faixa = $('navTelas');
  if (faixa && !faixa.hidden && faixa.querySelector('[data-dctipo]')) pintarFaixaDocsNaPorta(faixa);
  const cam = $('navSub');
  if (!cam || !/Lista mestra/.test(cam.textContent)) return;
  const f = S.fd;
  const extra = f.modo === 'tabela' ? 'Tabela' : f.modo === 'tipo' ? tipoDoc(f.tipo).nome : '';
  const base = [...cam.querySelectorAll('span:not(.rb-sep), b')].map(x => x.textContent).filter(t => t !== 'Tabela' && !TIPOS_DOC.some(y => y.nome === t) && t !== 'Outros');
  const partes = extra ? [...base, extra] : base;
  cam.innerHTML = partes.map((p, i) => i === partes.length - 1 ? `<b>${esc(p)}</b>` : `<span>${esc(p)}</span><span class="rb-sep" aria-hidden="true">›</span>`).join('');
}

function desenharDocumentos() {
  const f = S.fd;
  atualizarFaixaDocs();
  if (f.modo === 'tabela') return desenharTabelaDocs();
  if (f.modo === 'tipo') return desenharTipoDocs();
  desenharTiposDocs();
}

function desenharTiposDocs() {
  const tela = $('telaCeDocumentos');
  const f = S.fd;
  const outros = docsDoTipo('OUTROS');
  const tipos = [...TIPOS_DOC, ...(outros.length ? [{ id: 'OUTROS', nome: 'Outros', desc: 'Sem tipo no código', icone: 'documento' }] : [])];
  const cartao = t => {
    const l = docsDoTipo(t.id);
    const n = s => l.filter(d => sitDoc(d) === s).length;
    const venc = l.filter(docAtrasado).length;
    return `<button class="ce-tipo" type="button" data-tipo="${t.id}">
      <span class="ce-tipo-ic">${svgIcone(t.icone)}</span>
      <b>${esc(t.nome)}</b><span class="dc-sem">${esc(t.desc)} · ${l.length} doc.</span>
      <span class="ce-tipo-pe">${n('Em dia') ? tag(n('Em dia') + ' em dia', 'ativo') : ''}${n('Revisar') ? tag(n('Revisar') + ' revisar', 'alerta') : ''}${n('Pendente') ? tag(n('Pendente') + ' pendente', 'perigo') : ''}${venc ? tag(venc + ' revisão vencida', 'perigo') : ''}${l.length ? '' : '<span class="dc-sem">nenhum ainda</span>'}</span>
    </button>`;
  };
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Lista mestra</h2>
        <p class="dica" style="margin:2px 0 0">Escolha o tipo de documento. Cada um abre com o PDF vigente, a pasta no OneDrive e as revisões anteriores.</p></div>
      <span class="barra" style="margin:0"><a class="btn ce-btn-link" href="${PASTA_CERT}" target="_blank" rel="noopener" title="Certificação - Lop Gestão Rápida: o que está nesta pasta é o que está no app">${svgIcone('predio')} Pasta no OneDrive</a>
      <button class="btn" type="button" id="ceDcTabela2">Ver tudo em tabela</button>
      <button class="btn principal" type="button" id="ceDcNovo">Novo documento</button></span>
    </div>
    <label class="campo" style="margin-top:12px">Buscar em todos <input type="text" id="ceDcBusca" value="${esc(f.q2)}" placeholder="Código, nome ou código da norma (ex.: 4.6.1)"></label>
    <div id="ceDcAchados"></div>
    <div class="ce-tipos">${tipos.map(cartao).join('')}</div>
    ${resumoCadeia()}
  </div>`;
  tela.querySelectorAll('[data-cad-ir]').forEach(b => b.addEventListener('click', () => {
    const x = S.docs.find(y => y.id === Number(b.dataset.cadIr)); if (x) abrirTipo(prefixoDoc(x) in { POP: 1, FORM: 1, IT: 1, CL: 1, AN: 1, POL: 1 } ? prefixoDoc(x) : 'OUTROS', x.id);
  }));
  tela.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => abrirTipo(b.dataset.tipo)));
  $('ceDcTabela2').addEventListener('click', () => { f.modo = 'tabela'; desenharDocumentos(); });
  $('ceDcNovo').addEventListener('click', () => formDocumento(null));
  const achados = () => {
    const q = so(f.q2).toLowerCase();
    const l = q ? S.docs.filter(d => [d.codigo, d.nome, d.responsavel, codTexto(codigosDoDoc(d))].some(t => so(t).toLowerCase().includes(q))) : [];
    $('ceDcAchados').innerHTML = !q ? '' : l.length ? `<ul class="ce-achados">${l.slice(0, 30).map(d => `<li><button class="ce-link" type="button" data-achado="${d.id}">
      <b>${esc(d.codigo)}</b> ${esc(d.nome)}</button> ${tag(sitDoc(d), COR_SIT[sitDoc(d)])} <span class="ce-refs">${codTags(codigosDoDoc(d))}</span></li>`).join('')}</ul>`
      : '<p class="dica">Nada encontrado.</p>';
    $('ceDcAchados').querySelectorAll('[data-achado]').forEach(b => b.addEventListener('click', () => {
      const d = S.docs.find(x => x.id === Number(b.dataset.achado));
      abrirTipo(TIPOS_DOC.some(t => t.id === prefixoDoc(d)) ? prefixoDoc(d) : 'OUTROS', d.id);
    }));
  };
  $('ceDcBusca').addEventListener('input', e => { f.q2 = e.target.value; achados(); });
  achados();
}

function resumoCadeia() {
  const pops = docsDoTipo('POP'), forms = docsDoTipo('FORM'), regs = docsDoTipo('RG');
  if (!pops.length && !forms.length) return '';
  const popSem = pops.filter(d => !ligadosDe(d).length);
  const formSem = forms.filter(d => !ligadosPara(d).length);
  const semEvid = (regs.length ? regs : forms).filter(d => { const c = cobertura(d); return c && c.length > 1 && c[c.length - 2].estado === 'falta'; });
  const lista = (l, max = 14) => l.slice(0, max).map(d => `<button class="ce-link" type="button" data-cad-ir="${d.id}">${esc(d.codigo)}</button>`).join(' · ') + (l.length > max ? ` · +${l.length - max}` : '');
  return `<div class="ce-cadeia-res"><h4 class="ac-h4">Cadeia POP → FORM → RG</h4>
    <p>${tag(S.vinc.length + ' ligações', 'neutra')} ${tag(S.evid.length + ' registros e evidências', 'neutra')}</p>
    ${popSem.length ? `<p><b>POPs sem FORM ligado (${popSem.length}):</b> ${lista(popSem)}</p>` : ''}
    ${formSem.length ? `<p><b>FORMs que nenhum POP exige (${formSem.length}):</b> ${lista(formSem)}</p>` : ''}
    ${semEvid.length ? `<p><b>Sem registro no último período fechado (${semEvid.length}):</b> ${lista(semEvid)}</p>` : ''}</div>`;
}

function abrirTipo(id, sel = null) {
  Object.assign(S.fd, { modo: 'tipo', tipo: id, sel: sel ?? docsDoTipo(id)[0]?.id ?? null });
  desenharDocumentos();
}

function desenharTipoDocs() {
  const tela = $('telaCeDocumentos');
  const f = S.fd;
  const t = tipoDoc(f.tipo);
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">${esc(t.nome)} <small class="dc-sem" style="font-size:14px;font-weight:400">· ${esc(t.desc)} · ${docsDoTipo(f.tipo).length} documento(s)</small></h2></div>
      <span class="barra" style="margin:0">
        <label class="btn" title="Escolha a pasta do tipo (ex.: Certificação - Lop Gestão Rápida › 1 - POP). Cada subpasta é um documento; os PDFs sobem para o Drive.">Importar pasta
          <input type="file" id="ceDcPasta" hidden webkitdirectory multiple></label>
        <button class="btn principal" type="button" id="ceDcNovo">Novo ${esc(t.nome)}</button></span>
    </div>
    <p class="aviso" id="ceDcEnvio" hidden></p>
    <div class="ce-dv">
      <div class="ce-dv-lista">
        <input type="text" id="ceDcQ2" placeholder="Buscar ${esc(t.nome)}" value="">
        <div id="ceDcItens"></div>
      </div>
      <div class="ce-dv-painel" id="ceDcPainel"></div>
    </div>
  </div>`;
  $('ceDcNovo').addEventListener('click', () => formDocumento(null, t.cat ? { categoria: t.cat } : {}));
  $('ceDcPasta').addEventListener('change', e => importarPasta([...e.target.files]).finally(() => { e.target.value = ''; }));
  const itens = () => {
    const q = so($('ceDcQ2').value).toLowerCase();
    const l = docsDoTipo(f.tipo, !!f.verInativos).filter(d => !q || [d.codigo, d.nome, codTexto(codigosDoDoc(d))].some(x => so(x).toLowerCase().includes(q)));
    $('ceDcItens').innerHTML = l.length ? l.map(d => `<button type="button" class="ce-dv-item${d.id === f.sel ? ' on' : ''}" data-sel="${d.id}">
        <span><b>${esc(so(d.codigo).replace(/^[A-Z]+\s*/, ''))}</b> ${esc(d.nome)}</span>${tag(sitDoc(d), COR_SIT[sitDoc(d)])}</button>`).join('')
      : `<p class="dica" style="padding:8px">${docsDoTipo(f.tipo).length ? 'Nada com essa busca.' : 'Nenhum documento deste tipo ainda.'}</p>`;
    const nFora = docsDoTipo(f.tipo, true).length - docsDoTipo(f.tipo).length;
    if (nFora) $('ceDcItens').insertAdjacentHTML('beforeend', `<button type="button" class="ce-link dc-sem" id="ceDcInat" style="padding:8px">${f.verInativos ? 'Esconder' : 'Mostrar'} inativos e obsoletos (${nFora})</button>`);
    $('ceDcInat')?.addEventListener('click', () => { f.verInativos = !f.verInativos; itens(); });
    $('ceDcItens').querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
      f.sel = Number(b.dataset.sel); itens(); painelDoc();
      if (matchMedia('(max-width:760px)').matches) $('ceDcPainel').scrollIntoView({ behavior: 'smooth' });
    }));
  };
  $('ceDcQ2').addEventListener('input', itens);
  itens(); painelDoc(); mostrarEnvio();
}

let geracaoPainel = 0;
async function painelDoc() {
  const el = $('ceDcPainel'); if (!el) return;
  const d = S.docs.find(x => x.id === S.fd.sel);
  if (!d) { el.innerHTML = '<div class="vazio">Escolha um documento na lista.</div>'; return; }
  const g = ++geracaoPainel;
  const celular = matchMedia('(max-width:760px)').matches;
  /* "No computador" só para o Guilherme, no computador dele (29/10/2026: "esse de abrir no local
     no computador será somente no meu, o restante será em nuvem"). Os outros veem só "Na nuvem". */
  const pcLocal = !celular && so(estado.sessao?.user?.email).toLowerCase() === EMAIL_PC_LOCAL;
  const refs = codigosDoDoc(d);
  /* FORM feito no app (26/10/2026, pedido dele): o botão principal abre a tela
     do app (Biodiversidade, Energia, Balanço…), não o arquivo. */
  const app = EVID_APP[chaveApp(d)] || null;
  const modelo = formDe(d);   // RG: o modelo é o FORM de mesmo número
  el.innerHTML = `<div class="barra entre" style="margin:0;align-items:flex-start">
      <div><div class="dc-sem">${esc(d.codigo)}${d.revisao != null && d.revisao !== '' ? ' · Rev. ' + esc(d.revisao) : ''}${d.data_revisao ? ' · ' + br(d.data_revisao) : ''}${d.responsavel ? ' · Resp.: ' + esc(d.responsavel) : ''}</div>
        <h3 style="margin:2px 0 0">${esc(d.nome)}</h3></div>
      ${tag(sitDoc(d), COR_SIT[sitDoc(d)])}
    </div>
    <div class="barra" style="margin:12px 0 4px">
      ${app ? `<button class="btn principal" type="button" id="ceDvApp" title="${esc(app.nome)}">${svgIcone('seta-dir')} Abrir no app</button>`
        : modelo ? `<button class="btn principal" type="button" data-ir-modelo="${modelo.id}">${svgIcone('documento')} Ver o modelo (${esc(modelo.codigo)})</button>`
        : `<button class="btn principal" type="button" id="ceDvPdf" disabled>${svgIcone('documento')} Abrir PDF</button>`}
      ${pcLocal && d.caminho ? `<button class="btn" type="button" id="ceDvPc" title="Abre a pasta no Explorador de Arquivos deste computador">💻 No computador</button>` : ''}
      ${linkOk(d.link) ? `<a class="btn" id="ceDvLocal" href="${esc(d.link)}" target="_blank" rel="noopener" title="Abre a pasta do documento no OneDrive pela internet">☁ Na nuvem</a>`
        : '<button class="btn" type="button" disabled title="Sem link do OneDrive — preencha em Editar">☁ Na nuvem</button>'}
      ${pcLocal && d.caminho ? `<button class="btn" type="button" id="ceDvCopiar" title="Copiar o caminho da pasta no computador">⧉</button>` : ''}
      ${/^AN (22|0?8)$/.test(so(d.codigo)) ? `<button class="btn principal" type="button" id="ceDvCroqui" title="Croqui das fazendas no satélite, com reserva legal e áreas">🛰 Croqui no satélite</button>` : ''}
      <span class="cresce"></span>
      <button class="btn" type="button" id="ceDvEditar">${svgIcone('lapis')} Editar</button>
    </div>
    <div class="dc-sem ce-dv-caminho" id="ceDvMsg">${esc(d.caminho || '')}</div>
    ${app ? `<div class="ce-dv-app"><div><b>Este formulário é preenchido no app</b><span class="dc-sem">${esc(app.nome)}</span></div>
        <button class="btn principal" type="button" data-dv-app>${svgIcone('seta-dir')} Abrir ${esc(app.nome.split(' — ')[0])}</button></div>`
      : prefixoDoc(d) === 'RG' ? `<div class="ce-dv-app"><div><b>Registro: ${esc(modelo ? modelo.codigo : 'FORM')} preenchido</b><span class="dc-sem">Os arquivos ficam em 5 - RG no OneDrive e entram sozinhos na linha do tempo abaixo.</span></div></div>`
      : '<div class="ce-dv-pdf" id="ceDvVisor"><span class="dc-sem">Procurando o PDF…</span></div>'}
    <div class="ce-dv-info">
      <div><h4 class="ac-h4">Normas atendidas</h4>
        ${refs.length ? `<div class="ce-refs" style="max-width:none">${codTags(refs)}</div>
          <button class="ce-link dc-sem" type="button" id="ceDvReqs">${reqsDoDoc(d).length} requisito(s)</button>`
          : '<p class="dica">Nenhum requisito ligado ainda. A ligação se faz no requisito, em “Documentos que comprovam”.</p>'}
        ${d.observacao ? `<h4 class="ac-h4">Observação</h4><p class="dica">${esc(d.observacao)}</p>` : ''}</div>
      <div><h4 class="ac-h4">Revisões anteriores</h4><div id="ceDvRevs"><span class="dc-sem">…</span></div></div>
    </div>
    ${d.por_fazenda ? `<div class="ce-faz" id="ceDvFaz">${htmlFazendas(d)}</div>` : ''}
    <div class="ce-cadeia" id="ceDvCadeia">${htmlCadeia(d)}</div>`;
  ligarCadeia(d);
  if (d.por_fazenda) ligarFazendas(d);
  if (app) el.querySelectorAll('#ceDvApp, [data-dv-app]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', app.tela)));
  $('ceDvEditar').addEventListener('click', () => formDocumento(d.id));
  // AN 22 (croqui) e AN 08 (CAR) — números da Coopadap desde 30/10/2026: croqui no satélite com reserva legal detalhada (30/10/2026)
  $('ceDvCroqui')?.addEventListener('click', () => abrirCroqui());
  el.querySelector('[data-ir-modelo]')?.addEventListener('click', () => abrirTipo('FORM', modelo.id));
  $('ceDvReqs')?.addEventListener('click', () => verReqsDoDoc(d.id));
  /* Abrir no computador (29/10/2026, pedido dele: "não consigo abrir local, estão indo para
     chrome no OneDrive, coloque as duas opções local e nuvem"). O navegador não abre pasta do
     Windows sozinho: o link lop-pasta: é atendido pelo atalho instalado uma vez em cada
     computador (ferramentas/abrir-pasta, cópia no OneDrive em _ferramentas). O caminho também
     vai para a área de transferência, caso o atalho não esteja instalado. */
  $('ceDvPc')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(d.caminho); } catch { /* sem permissão: segue */ }
    const a = document.createElement('a'); a.href = 'lop-pasta:' + encodeURIComponent(d.caminho); a.click();
    $('ceDvMsg').innerHTML = 'Abrindo a pasta no Explorador… Se não abriu, o caminho já está copiado (cole na barra de endereço do Explorador). '
      + 'Para abrir direto, rode uma vez o <b>instalar.bat</b> de <i>Certificação - Lop Gestão Rápida › _ferramentas › Abrir pasta no computador</i>.';
  });
  $('ceDvCopiar')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(d.caminho); $('ceDvMsg').textContent = 'Caminho copiado. No Explorador de Arquivos, clique na barra de endereço, cole (Ctrl+V) e Enter.'; }
    catch { $('ceDvMsg').textContent = d.caminho; prompt('Copie o caminho:', d.caminho); }
  });
  const [arqs, revs] = await Promise.all([
    listarArquivos('certificacao', 'documento', d.id).catch(() => []),
    listarArquivos('certificacao', 'documento', revDono(d.id)).catch(() => []),
  ]);
  if (g !== geracaoPainel) return;
  const vig = escolherVigente(d, arqs);
  const extras = arqs.filter(x => x !== vig);
  $('ceDvRevs').innerHTML = revs.length ? revs.slice().sort((a, b) => so(b.nome).localeCompare(so(a.nome))).map(x =>
      `<button type="button" class="ce-dv-rev" data-ver="${esc(x.chave)}">${svgIcone('historico')} <span>${esc(x.nome)}</span></button>`).join('')
    : '<p class="dica">Nenhuma no app.</p>';
  $('ceDvRevs').querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => abrirArquivo(b.dataset.ver)));
  const visor = $('ceDvVisor');
  if (app || !visor) return;
  if (!vig) {
    visor.innerHTML = `<span class="dc-sem">O PDF ainda não está no app. Use “Importar pasta” ou anexe em Editar.</span>`;
    return;
  }
  const btn = $('ceDvPdf'); btn.disabled = false;
  btn.addEventListener('click', () => apresentar(d.id));
  const anexos = extras.length ? `<div class="ce-dv-extras">Também nesta pasta: ${extras.map(x => `<button class="ce-link" type="button" data-ver="${esc(x.chave)}">${esc(x.nome)}</button>`).join(' · ')}</div>` : '';
  if (celular) {
    visor.innerHTML = `<span class="dc-sem">${esc(vig.nome)} — toque em “Abrir PDF”.</span>${anexos}`;
  } else {
    visor.innerHTML = `<span class="dc-sem">Carregando ${esc(vig.nome)}…</span>`;
    try {
      const u = await urlDoArquivo(vig.chave);
      if (g !== geracaoPainel) return;
      visor.innerHTML = `<iframe title="${esc(d.codigo)}" src="${u}#view=FitH&navpanes=0"></iframe>${anexos}`;
    } catch (e) {
      if (g !== geracaoPainel) return;
      visor.innerHTML = `<span class="dc-sem">${esc(navigator.onLine ? e.message : 'Sem internet: o PDF abre quando a conexão voltar.')}</span>${anexos}`;
    }
  }
  visor.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => abrirArquivo(b.dataset.ver)));
}


/* ---- Cadeia no painel do documento ---- */
function htmlCadeia(d) {
  const de = ligadosDe(d), para = ligadosPara(d);
  const chip = (x, lado) => `<span class="ce-elo"><button type="button" class="ce-link" data-ir-doc="${x.d.id}" title="${esc(x.d.nome)}"><b>${esc(x.d.codigo)}</b> ${esc(x.d.nome)}</button>${x.v.origem === 'texto do POP' ? '<small class="dc-sem" title="Ligação lida do texto do POP">· texto</small>' : x.v.origem === 'relação' ? '<small class="dc-sem" title="Ligação pelo assunto (29/10/2026) — desfaça no ✕ se não fizer sentido">· assunto</small>' : ''}<button type="button" class="ce-elo-x" data-desligar="${x.v.id}" title="Desfazer esta ligação">✕</button></span>`;
  const candidatos = S.docs.filter(x => x.id !== d.id && !de.some(y => y.d.id === x.id) && !para.some(y => y.d.id === x.id)
    && (ehPop(d) ? !ehPop(x) : true)).sort(porCodigo);
  const alvo = rgDe(d) || d;   // no FORM, os registros são os do RG de mesmo número
  const cob = !ehPop(d) ? cobertura(alvo) : null;
  const ev = !ehPop(d) ? evidDe(alvo) : [];
  const viva = !ehPop(d) ? vivaDe(alvo) : null;
  const rotEv = prefixoDoc(alvo) === 'RG' ? 'Registros' : 'Evidências';
  const okN = cob ? cob.filter(j => j.estado === 'ok').length : 0;
  return `<div class="ce-cadeia-cab"><h4 class="ac-h4" style="margin:0">${ehPop(d) ? 'Cadeia: formulários deste POP' : 'Cadeia: exigido por / ligado a'}</h4>
      ${ehPop(d) && de.length ? '<button class="btn mini principal" type="button" id="ceCadApr">▶ Apresentar a cadeia</button>' : !ehPop(d) && (ev.length || para.length) ? '<button class="btn mini" type="button" id="ceCadApr">▶ Apresentar com evidências</button>' : ''}</div>
    ${ehPop(d)
      ? (de.length ? `<div class="ce-elos">${de.map(x => chip(x)).join('')}</div>` : '<p class="dica">Nenhum FORM ligado a este POP ainda.</p>')
      : `${para.length ? `<div class="ce-elos">${para.map(x => chip(x)).join('')}</div>` : (de.length ? '' : '<p class="dica">Nenhum documento ligado a este ainda.</p>')}
         ${de.length ? `<div class="ce-elos">${de.map(x => chip(x)).join('')}</div>` : ''}`}
    <div class="barra" style="margin:6px 0 0"><select id="ceCadSel"><option value="">${ehPop(d) ? '＋ Ligar um FORM / documento…' : '＋ Ligar a um POP / documento…'}</option>${candidatos.map(x => `<option value="${x.id}">${esc(x.codigo)} — ${esc(x.nome)}</option>`).join('')}</select>
      <button class="btn mini" type="button" id="ceCadLigar">Ligar</button></div>
    ${ehPop(d) ? '' : `<div class="ce-cadeia-cab" style="margin-top:14px"><h4 class="ac-h4" style="margin:0">${rotEv}${alvo !== d ? ` — <button class="ce-link" type="button" data-ir-doc="${alvo.id}">${esc(alvo.codigo)} ↗</button>` : ''}${alvo.periodicidade ? ` <small class="dc-sem">· ${esc(alvo.periodicidade)}</small>` : ''}</h4>
        <button class="btn mini principal" type="button" id="ceEvNova">＋ ${rotEv === 'Registros' ? 'Registro' : 'Evidência'}</button></div>
      ${viva ? `<p class="dica" style="margin:4px 0">Gerada no app: <button class="ce-link" type="button" id="ceEvViva">${esc(viva.nome)} ↗</button> — ${Object.keys(viva.meses).length} mês(es) com lançamento.</p>` : ''}
      ${cob ? `<div class="ce-janelas">${cob.map(j => `<span class="ce-jan ce-jan-${j.estado}" title="${esc(j.rot)}: ${j.n ? j.n + ' evidência(s)' : j.estado === 'aberto' ? 'período em andamento' : 'sem evidência'}">${esc(j.rot)}</span>`).join('')}</div>
        <p class="dc-sem" style="margin:2px 0 6px">${okN} de ${cob.length} período(s) com evidência.</p>` : '<p class="dc-sem" style="margin:2px 0 6px">Por evento: anexe cada ocorrência.</p>'}
      ${ev.length ? `<ul class="ce-evs">${ev.slice(0, 12).map(e => `<li><b>${br(e.data)}</b> ${esc(e.descricao || '')}
          ${e.item_id ? `<small class="dc-sem">· ${esc(rotItem(S.itens.find(i => i.id === e.item_id)))}</small>` : ''}
          ${e._arq ? `<button class="ce-link" type="button" data-arq-ver="${esc(e._arq)}">📎 abrir</button> <small class="dc-sem">· pasta</small>`
            : `${S.evArq?.has(String(e.id)) ? `<button class="ce-link" type="button" data-ev-ver="${e.id}">📎 abrir</button>` : ''}
          ${linkOk(e.link) ? `<a class="ce-link" href="${esc(e.link)}" target="_blank" rel="noopener">OneDrive ↗</a>` : ''}
          <button class="ce-link dc-sem" type="button" data-ev-ed="${e.id}">editar</button>`}</li>`).join('')}</ul>${ev.length > 12 ? `<p class="dc-sem">+ ${ev.length - 12} mais antiga(s).</p>` : ''}`
        : `<p class="dica">${rotEv === 'Registros' ? 'Nenhum registro anexado ainda.' : 'Nenhuma evidência anexada ainda.'}</p>`}`}`;
}
function ligarCadeia(d) {
  const el = $('ceDvCadeia'); if (!el) return;
  el.querySelectorAll('[data-ir-doc]').forEach(b => b.addEventListener('click', () => {
    const x = S.docs.find(y => y.id === Number(b.dataset.irDoc)); if (!x) return;
    abrirTipo(TIPOS_DOC.some(t => t.id === prefixoDoc(x)) ? prefixoDoc(x) : 'OUTROS', x.id);
  }));
  el.querySelectorAll('[data-desligar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Desfazer esta ligação?')) return;
    const { error } = await estado.cliente.from('cert_vinculos').delete().eq('id', Number(b.dataset.desligar));
    if (error) return alert('Não consegui: ' + error.message);
    S.vinc = S.vinc.filter(v => v.id !== Number(b.dataset.desligar)); salvarCaixa(); refazCadeia(d);
  }));
  $('ceCadLigar')?.addEventListener('click', async () => {
    const outro = Number($('ceCadSel').value); if (!outro) return;
    const o = S.docs.find(x => x.id === outro);
    // POP sempre na ponta de cima; entre outros documentos, quem está aberto aponta para o escolhido
    const [de, para] = !ehPop(d) && ehPop(o) ? [o.id, d.id] : [d.id, o.id];
    const { data, error } = await estado.cliente.from('cert_vinculos').insert({ de_id: de, para_id: para, origem: 'manual' }).select().single();
    if (error) return alert(/duplicate/i.test(error.message) ? 'Já estão ligados.' : 'Não consegui ligar: ' + error.message);
    S.vinc.push(data); salvarCaixa(); refazCadeia(d);
  });
  const alvo = rgDe(d) || d;
  $('ceEvNova')?.addEventListener('click', () => formEvidencia(alvo, null));
  $('ceEvViva')?.addEventListener('click', () => abrirModulo('cert', vivaDe(alvo).tela));
  el.querySelectorAll('[data-ev-ed]').forEach(b => b.addEventListener('click', () => formEvidencia(alvo, S.evid.find(e => e.id === b.dataset.evEd))));
  el.querySelectorAll('[data-arq-ver]').forEach(b => b.addEventListener('click', () => abrirArquivo(b.dataset.arqVer)));
  el.querySelectorAll('[data-ev-ver]').forEach(b => b.addEventListener('click', async () => {
    const l = await listarArquivos('certificacao', 'evidencia', b.dataset.evVer).catch(() => []);
    if (l[0]) abrirArquivo(l[0].chave); else alert('Arquivo ainda não está no Drive.');
  }));
  $('ceCadApr')?.addEventListener('click', () => apresentarCadeia(d));
}
function refazCadeia(d) { const el = $('ceDvCadeia'); if (!el) return; el.innerHTML = htmlCadeia(d); ligarCadeia(d); }

function formEvidencia(d, e, itemId = null) {
  const rd = rotDatas(d);
  const itAtual = S.itens.find(i => i.id === (e?.item_id ?? itemId));
  const v = e || { data: (rd.entrega && itAtual?.aguardando_data) || hoje(), descricao: '', link: '', item_id: itemId };
  const itensDoc = itensDe(d);
  let anx = null;
  dialogo(`<h3>${rd.entrega ? (e ? 'Documentos' : 'Chegaram os documentos') : e ? 'Evidência' : 'Nova evidência'} — ${esc(d.codigo)}${rd.entrega && itAtual ? ' · ' + esc(rotItem(itAtual)) : ''}</h3>
    <p class="dica">${rd.entrega ? 'Anexe as notas carimbadas da devolução.' : esc(d.nome)}</p>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="grade">
      <label class="campo">${rd.doc} <input type="date" id="evData" value="${esc(v.data)}" max="${hoje()}"></label>
      <label class="campo">Descrição <input type="text" id="evDesc" value="${esc(v.descricao || '')}" placeholder="Ex.: FORM preenchido de março, laudo, certificado"></label>
    </div>
    ${itensDoc.length ? `<div class="grade">
      <label class="campo">Fazenda / ponto <select id="evItem">${opcoes(itensDoc.map(i => [i.id, rotItem(i)]), v.item_id, '— geral —')}</select></label>
      <label class="campo">${rd.prox} <small>${rd.entrega ? '(confira; dá para mudar depois no ✎)' : '(laudo, licença…; atualiza a fazenda)'}</small> <input type="date" id="evValid" value="${rd.entrega && !e ? esc(itAtual?.validade || '') : ''}"></label>
    </div>` : ''}
    <label class="campo">Link no OneDrive (opcional) <input type="url" id="evLink" value="${esc(v.link || '')}" placeholder="https://…"></label>
    <div id="evAnx" style="margin-top:8px"></div>
    <div class="barra entre"><div>${e ? '<button class="btn perigo" type="button" id="evApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="evOk">Salvar</button></div></div>`, () => {
    anx = campoAnexos($('evAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Arquivo da evidência', dica: 'PDF ou foto (o FORM preenchido, laudo, certificado…)' });
    anx.abrir(e ? e.id : null);
    $('evOk').addEventListener('click', async () => {
      const linha = { documento_id: d.id, data: $('evData').value, descricao: so($('evDesc').value) || null, link: so($('evLink').value) || null,
        item_id: $('evItem')?.value || null };
      if (!linha.data) return erroDlg(rd.entrega ? 'Informe a data da devolução destes documentos.' : 'Informe a data.');
      if (rd.entrega && $('evValid')?.value && $('evValid').value <= linha.data) return erroDlg('A próxima devolução precisa ser depois desta.');
      if (linha.link && !linkOk(linha.link)) return erroDlg('O link precisa começar com https://');
      if (!e && !anx.mudou && !linha.link) return erroDlg('Anexe o arquivo ou cole o link da evidência.');
      const salvo = await salvar('cert_evidencias', e, e ? { ...linha, atualizado_por: quem() } : { ...linha, criado_por: quem() }, S.evid, 'evOk');
      if (!salvo) return;
      if (anx.mudou) { await anx.salvar(salvo.id); (S.evArq ||= new Set()).add(String(salvo.id)); }
      const it = linha.item_id && S.itens.find(i => i.id === linha.item_id);
      if (it) {   // a fazenda guarda a data da última evidência e, se veio, a nova validade
        const muda = { ultima_data: !it.ultima_data || linha.data > it.ultima_data ? linha.data : it.ultima_data, atualizado_em: new Date().toISOString() };
        if ($('evValid')?.value) muda.validade = $('evValid').value;
        // AN 55: chegaram os documentos da devolução que estava aguardando → sai do "aguardando"
        if (rd.entrega && it.aguardando_data && linha.data >= it.aguardando_data) muda.aguardando_data = null;
        const { error } = await estado.cliente.from('cert_doc_itens').update(muda).eq('id', it.id);
        if (!error) Object.assign(it, muda);
      }
      salvarCaixa(); refazCadeia(d); refazFazendas(d);
    });
    $('evApagar')?.addEventListener('click', () => apagar('cert_evidencias', e.id, `${d.codigo} · ${br(e.data)} ${e.descricao || ''}`, () => { S.evid = S.evid.filter(x => x.id !== e.id); salvarCaixa(); }));
  });
}

/* -------------------------------------------------------------------
   AN POR FAZENDA (27/10/2026, pedido dele). Um AN por assunto e, dentro,
   um item por fazenda — e, na análise de água, um item por ponto de coleta
   (poço, caixa d'água, bebedouro). cert_doc_itens guarda fazenda, local,
   periodicidade, validade, data da última evidência e o link da subpasta no
   OneDrive (3 - AN/<AN>/<FAZENDA>). A evidência pode apontar para o item
   (cert_evidencias.item_id). Na auditoria, filtra a fazenda certificada.
   ------------------------------------------------------------------- */
const nomeFaz = id => S.faz.find(f => f.id === id)?.nome || (id ? 'Sem fazenda' : 'Geral');
const rotItem = i => i ? nomeFaz(i.fazenda_id) + (i.local ? ' · ' + i.local : '') : '—';
const itensDe = d => S.itens.filter(i => i.documento_id === d.id)
  .sort((a, b) => nomeFaz(a.fazenda_id).localeCompare(nomeFaz(b.fazenda_id), 'pt-BR') || so(a.local).localeCompare(so(b.local), 'pt-BR'));
/** Rótulos das duas datas do item (29/10/2026, pedido dele): no AN 55 (devolução de
 *  embalagens) a evidência são as notas carimbadas da última devolução (data do carimbo) e a
 *  "validade" é a próxima devolução agendada. Nos outros AN segue "Válido até". */
function rotDatas(d) {
  return /devolu[cç][aã]o de embalage/i.test(so(d?.nome))
    ? { entrega: true, doc: 'Documentos da devolução de', docCurto: 'Documentos em mãos', prox: 'Próxima devolução programada', proxCurto: 'Próxima devolução' }
    : { entrega: false, doc: 'Data (ou mês de referência)', docCurto: 'última', prox: 'Válido até', proxCurto: 'Válido até' };
}
/** AN 55 tem três datas por fazenda (29/10/2026, pedido dele):
 *  ultima_data = documentos em mãos · aguardando_data = devolução feita, aguardando os
 *  documentos carimbados · validade = próxima devolução programada.
 *  Depois da devolução, os documentos carimbados voltam em até 7 dias. */
const PRAZO_NOTAS = 7;
/** Vencimento do item: a validade informada; sem ela, última evidência + periodicidade. */
function vencItem(i, d) {
  if (i.validade) return i.validade;
  const m = MESES_PERIODO[i.periodicidade || d.periodicidade];
  return m && i.ultima_data ? somaMeses(i.ultima_data, m) : null;
}
function estadoItem(i, d) {
  if (rotDatas(d).entrega) return estadoEntrega(i);
  const v = vencItem(i, d);
  if (!v) return i.ultima_data ? { t: 'Em dia', c: 'ativo' } : { t: 'Sem evidência', c: 'perigo' };
  const n = entre(hoje(), v);
  if (n < 0) return { t: `Vencido há ${-n} d`, c: 'perigo', v };
  if (n <= 30) return { t: `Vence em ${n} d`, c: 'alerta', v };
  return { t: 'Em dia', c: 'ativo', v };
}
/** Situação no AN 55: falta próxima data → aguardando documentos → devolução passou sem registro → em dia. */
function estadoEntrega(i) {
  const v = i.validade || null;
  if (!v) return { t: 'Sem próxima data', c: 'perigo' };
  if (i.aguardando_data) {
    const n = entre(i.aguardando_data, hoje());
    return n > PRAZO_NOTAS ? { t: `Documentos atrasados ${n - PRAZO_NOTAS} d`, c: 'perigo', v } : { t: 'Aguardando documentos', c: 'alerta', v };
  }
  const n = entre(hoje(), v);
  if (n < 0) return { t: 'Devolução passou — atualizar ✎', c: 'perigo', v };
  if (n <= 30) return { t: `Devolução em ${n} d`, c: 'alerta', v };
  return { t: 'Em dia', c: 'ativo', v };
}
export function pendenciasFazendas() {
  return S.itens.map(i => ({ i, d: S.docs.find(x => x.id === i.documento_id) })).filter(x => x.d)
    .map(x => ({ ...x, e: estadoItem(x.i, x.d) })).filter(x => x.e.c !== 'ativo');
}
let filtroFaz = '';
let agrupaItens = 'forn';   // itens gerais: 'forn' (por fornecedor) ou 'doc' (por tipo de documento)
let soPendItens = false;
/** Tipo de documento de um item geral ("FORNECEDOR · Documento"), para agrupar. */
function tipoDocItem(txt) {
  const t = so(txt).toLowerCase();
  if (/bombeiro|avcb/.test(t)) return 'Bombeiros';
  if (/alvar[aá] sanit/.test(t)) return 'Alvará sanitário';
  if (/alvar/.test(t)) return 'Alvará de funcionamento';
  if (/licen|las |dispensa/.test(t)) return 'Licença ambiental';
  if (/respons|crq|crbio|crea|conselho/.test(t)) return 'Responsável técnico / conselho';
  if (/globalg|grasp/.test(t)) return 'Certificado GLOBALG.A.P.';
  if (/treinamento|capacita/.test(t)) return 'Treinamento';
  if (/anp/.test(t)) return 'Autorização ANP';
  if (/acredita|17025/.test(t)) return 'Acreditação do laboratório';
  if (/registro|renasem|inmetro/.test(t)) return 'Registros (Inmetro, RENASEM…)';
  return so(txt) || 'Outros';
}
const partesItem = i => { const p = so(i.local).split(' · '); return { forn: p[0] || 'Geral', doc: p.slice(1).join(' · ') || p[0] || '' }; };
const evidItem = i => S.evid.filter(e => e.item_id === i.id).sort((a, b) => so(b.data).localeCompare(so(a.data)));
const rotItemCurto = i => i.fazenda_id ? rotItem(i) : so(i.local) || 'Item';
const slideEv = (d, i, e) => ({ id: 'ev:' + e.id, codigo: `${d.codigo} · ${rotItemCurto(i)}`, nome: `${br(e.data)}${e.descricao ? ' — ' + so(e.descricao).split(' / ').pop() : ''}`, _ev: e });
/** "Ver": abre o PDF da última evidência do item; as setas passam pelas anteriores. */
function verItem(d, i) {
  const l = evidItem(i).map(e => slideEv(d, i, e));
  if (!l.length) return alert('Este item ainda não tem evidência.');
  apresentar(l[0].id, l);
}
/** "Ver PDFs": a última evidência de cada item da lista, um atrás do outro (para o auditor). */
function verTodosItens(d, its) {
  const l = its.map(i => { const e = evidItem(i)[0]; return e ? slideEv(d, i, e) : null; }).filter(Boolean);
  if (!l.length) return alert('Nenhum item tem evidência ainda.');
  apresentar(l[0].id, l);
}
function linhaItem(i, d, rotulo, sub) {
  const e = estadoItem(i, d); const ult = S.evid.filter(x => x.item_id === i.id).length; const rd = rotDatas(d);
  return `<div class="ce-fz-item">
    <div class="ce-fz-nome"><b>${esc(rotulo)}</b>${sub ? `<span class="dc-sem">${esc(sub)}</span>` : ''}</div>
    <div class="ce-fz-dados dc-sem">${rd.entrega
      ? `<div class="ce-3d"><div class="ok"><small>Documentos em mãos</small><b>${i.ultima_data ? br(i.ultima_data) : '—'}</b></div>
        <div class="esp"><small>Devolvido, aguardando docs</small><b>${i.aguardando_data ? br(i.aguardando_data) : '—'}</b></div>
        <div class="pro"><small>Próxima devolução</small><b>${i.validade ? br(i.validade) : '<span class="vz">não marcada</span>'}</b></div></div>`
      : `${i.validade ? 'Válido até ' + br(i.validade) : e.v ? 'Próxima ' + br(e.v) : esc(i.periodicidade || d.periodicidade || '')}
      ${i.ultima_data ? ' · última ' + br(i.ultima_data) : ''}${ult ? ` · ${ult} evid.` : ''}`}</div>
    ${tag(e.t, e.c)}
    <div class="ce-fz-acoes">
      ${ult ? `<button class="btn mini" type="button" data-fz-ver="${i.id}" title="Ver o PDF da última evidência (setas ← → mostram as anteriores)">${svgIcone('documento')} Ver</button>` : ''}
      <button class="btn mini principal" type="button" data-fz-ev="${i.id}" title="${rd.entrega ? 'Chegaram os documentos carimbados' : 'Anexar evidência'}">＋ ${rd.entrega ? 'Documentos' : 'Evidência'}</button>
      ${linkOk(i.link) ? `<a class="btn mini" href="${esc(i.link)}" target="_blank" rel="noopener" title="Abrir a pasta no OneDrive">${svgIcone('predio')}</a>` : ''}
      <button class="btn mini" type="button" data-fz-ed="${i.id}" title="Editar">${svgIcone('lapis')}</button>
    </div></div>`;
}
function htmlFazendas(d) {
  const todos = itensDe(d);
  const nV = todos.filter(i => estadoItem(i, d).c === 'perigo').length;
  const gerais = todos.length && todos.every(i => !i.fazenda_id);
  const cab = (titulo, ctrl) => `<div class="ce-cadeia-cab"><h4 class="ac-h4" style="margin:0">${titulo} <small class="dc-sem">· ${todos.length} item(ns)${nV ? ` · <b style="color:#a5342a">${nV} pendente(s)</b>` : ''}</small></h4>
      <div class="barra" style="margin:0">${ctrl}${todos.some(i => S.evid.some(e => e.item_id === i.id)) ? `<button class="btn mini" type="button" id="ceFzVerTodos" title="Mostra a última evidência de cada item, uma depois da outra (setas ← →)">${svgIcone('documento')} Ver PDFs</button>` : ''}<button class="btn mini" type="button" id="ceFzNovo">＋ ${gerais ? 'Item' : 'Ponto / item'}</button></div></div>`;
  if (gerais) {
    const lista = soPendItens ? todos.filter(i => estadoItem(i, d).c === 'perigo') : todos;
    const grupos = new Map();
    for (const i of lista) {
      const p = partesItem(i);
      const k = agrupaItens === 'doc' ? tipoDocItem(p.doc) : p.forn;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    const chaves = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const ctrl = `<div class="ce-seg" role="group" aria-label="Agrupar">
        <button type="button" class="${agrupaItens === 'forn' ? 'on' : ''}" data-agrupa="forn">Por fornecedor</button>
        <button type="button" class="${agrupaItens === 'doc' ? 'on' : ''}" data-agrupa="doc">Por documento</button></div>
      <label class="ce-chk"><input type="checkbox" id="ceFzSoPend" ${soPendItens ? 'checked' : ''}> Só pendentes</label>`;
    return cab('Itens', ctrl) + (chaves.length ? `<div class="ce-fz-grupos">${chaves.map(k => {
      const its = grupos.get(k).sort((a, b) => so(a.local).localeCompare(so(b.local), 'pt-BR'));
      const np = its.filter(i => estadoItem(i, d).c === 'perigo').length;
      const prox = its.map(i => estadoItem(i, d).v).filter(Boolean).sort()[0];
      return `<details class="ce-fz-grupo"${soPendItens ? ' open' : ''}>
        <summary><b>${esc(k)}</b><span class="dc-sem">${its.length} documento(s)${prox ? ` · ${prox < hoje() ? 'venceu em' : 'próximo vencimento'} ${br(prox)}` : ''}</span>
          ${np ? tag(`${np} pendente(s)`, 'perigo') : tag('Em dia', 'ativo')}</summary>
        <div class="ce-fz-lista">${its.map(i => { const p = partesItem(i);
          return agrupaItens === 'doc' ? linhaItem(i, d, p.forn, p.doc === k ? '' : p.doc) : linhaItem(i, d, p.doc || p.forn, ''); }).join('')}</div>
      </details>`; }).join('')}</div>` : '<p class="dica">Nada pendente.</p>');
  }
  const lista = filtroFaz ? todos.filter(i => i.fazenda_id === filtroFaz) : todos;
  const ctrl = `<select id="ceFzFiltro" title="Mostrar só uma fazenda (ex.: a certificada, na auditoria)">${opcoes(S.faz.map(f => [f.id, f.nome]), filtroFaz, 'Todas as fazendas')}</select>`;
  return cab('Por fazenda', ctrl) + (lista.length ? `<div class="ce-fz-lista">${lista.map(i =>
      i.fazenda_id || !i.local ? linhaItem(i, d, nomeFaz(i.fazenda_id), i.local || '') : linhaItem(i, d, partesItem(i).forn, partesItem(i).doc)).join('')}</div>`
    : '<p class="dica">Nenhum item para esta fazenda.</p>');
}
function ligarFazendas(d) {
  const el = $('ceDvFaz'); if (!el) return;
  $('ceFzFiltro')?.addEventListener('change', ev => { filtroFaz = ev.target.value; refazFazendas(d); });
  $('ceFzSoPend')?.addEventListener('change', ev => { soPendItens = ev.target.checked; refazFazendas(d); });
  el.querySelectorAll('[data-agrupa]').forEach(b => b.addEventListener('click', () => { agrupaItens = b.dataset.agrupa; refazFazendas(d); }));
  $('ceFzNovo').addEventListener('click', () => formItem(d, null));
  $('ceFzVerTodos')?.addEventListener('click', () => {
    let its = itensDe(d);
    if (filtroFaz && !its.every(i => !i.fazenda_id)) its = its.filter(i => i.fazenda_id === filtroFaz);
    verTodosItens(d, its);
  });
  el.querySelectorAll('[data-fz-ver]').forEach(b => b.addEventListener('click', () => verItem(d, S.itens.find(i => i.id === b.dataset.fzVer))));
  el.querySelectorAll('[data-fz-ev]').forEach(b => b.addEventListener('click', () => formEvidencia(d, null, b.dataset.fzEv)));
  el.querySelectorAll('[data-fz-ed]').forEach(b => b.addEventListener('click', () => formItem(d, S.itens.find(i => i.id === b.dataset.fzEd))));
}
function refazFazendas(d) { const el = $('ceDvFaz'); if (!el) return; el.innerHTML = htmlFazendas(d); ligarFazendas(d); }

function formItem(d, it) {
  const v = it || { fazenda_id: filtroFaz || '', local: '', periodicidade: d.periodicidade, validade: null, link: d.link || '', observacao: '' };
  dialogo(`<h3>${it ? 'Fazenda / ponto' : 'Novo ponto / item'} — ${esc(d.codigo)}</h3>
    <p class="dica">${esc(d.nome)}</p>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="grade">
      <label class="campo">Fazenda <select id="fzFaz">${opcoes(S.faz.map(f => [f.id, f.nome]), v.fazenda_id, '— geral (sem fazenda) —')}</select></label>
      <label class="campo">Local / ponto <small>(opcional)</small> <input type="text" id="fzLocal" value="${esc(v.local || '')}" placeholder="Ex.: Poço 1, caixa d'água da sede, bebedouro"></label>
      <label class="campo">Periodicidade <select id="fzPer">${opcoes(PERIODOS, v.periodicidade)}</select></label>
      ${rotDatas(d).entrega ? '' : `<label class="campo">Válido até <small>(licença, laudo…)</small> <input type="date" id="fzValid" value="${esc(v.validade || '')}"></label>`}
    </div>
    ${rotDatas(d).entrega ? `<div class="grade">
      <label class="campo">Documentos em mãos <small>(data do documento)</small> <input type="date" id="fzUlt" value="${esc(v.ultima_data || '')}"></label>
      <label class="campo">Devolução feita, aguardando documentos <input type="date" id="fzAg" value="${esc(v.aguardando_data || '')}"></label>
      <label class="campo">Próxima devolução programada <input type="date" id="fzValid" value="${esc(v.validade || '')}"></label>
    </div>` : ''}
    <label class="campo">Link da pasta no OneDrive <input type="url" id="fzLink" value="${esc(v.link || '')}" placeholder="https://…"></label>
    <label class="campo">Observação <input type="text" id="fzObs" value="${esc(v.observacao || '')}" placeholder="Ex.: nº da licença, órgão emissor, laboratório"></label>
    <div class="barra entre"><div>${it ? '<button class="btn perigo" type="button" id="fzApagar">Tirar da lista</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="fzOk">Salvar</button></div></div>`, () => {
    $('fzOk').addEventListener('click', async () => {
      const linha = { documento_id: d.id, fazenda_id: $('fzFaz').value || null, local: so($('fzLocal').value) || null,
        periodicidade: $('fzPer').value || null, validade: $('fzValid').value || null, link: so($('fzLink').value) || null,
        observacao: so($('fzObs').value) || null, atualizado_em: new Date().toISOString() };
      if (rotDatas(d).entrega) { linha.ultima_data = $('fzUlt').value || null; linha.aguardando_data = $('fzAg').value || null; }
      if (!linha.fazenda_id && !linha.local) return erroDlg('Escolha a fazenda ou, num item geral (fornecedor, documento), preencha o Local / item.');
      if (linha.link && !linkOk(linha.link)) return erroDlg('O link precisa começar com https://');
      if (await salvar('cert_doc_itens', it, linha, S.itens, 'fzOk')) { salvarCaixa(); refazFazendas(d); }
    });
    $('fzApagar')?.addEventListener('click', async () => {
      if (!confirm(`Tirar ${rotItem(it)} deste AN? As evidências já anexadas continuam no AN.`)) return;
      const { error } = await estado.cliente.from('cert_doc_itens').update({ ativo: false }).eq('id', it.id);
      if (error) return erroDlg('Não consegui: ' + error.message);
      S.itens = S.itens.filter(x => x.id !== it.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/** Modo apresentação seguindo a cadeia: POP → cada FORM → as evidências dele (as 6 mais recentes). */
function apresentarCadeia(d) {
  const itens = [];
  const comEvid = f => { itens.push(f); evidDe(f).slice(0, 6).forEach(e => itens.push({ id: 'ev:' + e.id, codigo: `${f.codigo} · evidência`, nome: `${br(e.data)}${e.descricao ? ' — ' + e.descricao : ''}`, _ev: e })); };
  if (ehPop(d)) { itens.push(d); ligadosDe(d).forEach(x => comEvid(x.d)); }
  else comEvid(d);
  apresentar(d.id, itens);
}

/* -------------------------------------------------------------------
   Modo apresentação (26/10/2026, pedido dele: "o objetivo é apresentar para
   o auditor pelo app — abrir somente o PDF"). "Abrir PDF" cobre a tela do app
   só com o PDF; barra fina com código · revisão · data · nome, setas para o
   documento anterior/próximo da lista aberta (← →), tela cheia e fechar (Esc).
   ------------------------------------------------------------------- */
async function pdfVigente(d) {
  const arqs = await listarArquivos('certificacao', 'documento', d.id).catch(() => []);
  return escolherVigente(d, arqs);
}
/* PDF vigente (29/10/2026, AN 97 abria o plano de 2024 em vez do PGRS de 2026): entre os PDFs
   com o código do documento no nome (se houver algum), o da pasta de ANO mais novo (ele cria
   AN xx\2024, AN xx\2026…), depois o de data mais nova no OneDrive (arquivos.data_arquivo);
   sem data, o enviado por último. */
const anoDaPasta = x => { const m = String(x.origem || '').split('/').slice(0, -1).map(p => p.trim()).filter(p => /^(19|20)\d\d$/.test(p)); return m.length ? m[m.length - 1] : '0000'; };
function escolherVigente(d, arqs) {
  const pdfs = arqs.filter(ehPdf);
  const comCod = pdfs.filter(x => chaveCodigo(x.nome) === chaveCodigo(d.codigo));
  const base = comCod.length ? comCod : pdfs;
  const quando = x => anoDaPasta(x) + '|' + String(x.data_arquivo || '') + '|' + String(x.criado_em || '');
  return base.slice().sort((a, b) => quando(b).localeCompare(quando(a)))[0] || arqs[0] || null;
}
let apr = null;
function apresentar(id, listaPronta = null) {
  const lista = listaPronta || docsDoTipo(S.fd.tipo || prefixoDoc(S.docs.find(x => x.id === id) || {}));
  let el = $('ceApr');
  if (!el) {
    el = document.createElement('div'); el.id = 'ceApr'; el.className = 'ce-apr';
    el.innerHTML = `<div class="ce-apr-barra">
        <button type="button" class="ce-apr-b" data-a="ant" title="Documento anterior (←)">‹</button>
        <div class="ce-apr-tit"><b id="ceAprCod"></b> <span id="ceAprNome"></span></div>
        <button type="button" class="ce-apr-b" data-a="prox" title="Próximo documento (→)">›</button>
        <span class="cresce"></span>
        <button type="button" class="ce-apr-b" data-a="cheia" title="Tela cheia">⛶</button>
        <button type="button" class="ce-apr-b" data-a="aba" title="Abrir em outra aba">↗</button>
        <button type="button" class="ce-apr-b" data-a="fechar" title="Fechar (Esc)">✕</button>
      </div><div class="ce-apr-pdf" id="ceAprPdf"></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', ev => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a || !apr) return;
      if (a === 'ant') mostrarApr(apr.i - 1);
      else if (a === 'prox') mostrarApr(apr.i + 1);
      else if (a === 'fechar') fecharApr();
      else if (a === 'aba' && apr.chave) abrirArquivo(apr.chave);
      else if (a === 'cheia') { if (document.fullscreenElement) document.exitFullscreen?.(); else el.requestFullscreen?.().catch(() => {}); }
    });
    document.addEventListener('keydown', ev => {
      if (!apr || $('ceApr')?.hidden) return;
      if (ev.key === 'Escape' && !document.fullscreenElement) fecharApr();
      else if (ev.key === 'ArrowLeft') mostrarApr(apr.i - 1);
      else if (ev.key === 'ArrowRight') mostrarApr(apr.i + 1);
    });
  }
  apr = { lista, i: Math.max(0, lista.findIndex(x => x.id === id)), chave: null, g: 0 };
  el.hidden = false; document.body.classList.add('ce-apr-aberto');
  mostrarApr(apr.i);
}
function fecharApr() {
  const el = $('ceApr'); if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  el.hidden = true; $('ceAprPdf').innerHTML = ''; document.body.classList.remove('ce-apr-aberto');
  if (apr) { const atual = apr.lista[apr.i]; if (atual && typeof atual.id === 'number') S.fd.sel = atual.id; apr = null; if (S.fd.modo === 'tipo') desenharDocumentos(); }
}
async function mostrarApr(i) {
  if (!apr || !apr.lista.length) return;
  i = (i + apr.lista.length) % apr.lista.length; apr.i = i;
  const d = apr.lista[i]; const g = ++apr.g;
  $('ceAprCod').textContent = `${d.codigo}${d.revisao ? ' · Rev. ' + d.revisao : ''}${d.data_revisao ? ' · ' + br(d.data_revisao) : ''}`;
  $('ceAprNome').textContent = d.nome;
  const box = $('ceAprPdf'); box.innerHTML = '<p class="ce-apr-msg">Carregando…</p>'; apr.chave = null;
  try {
    const v = d._ev ? (d._ev._arq ? { chave: d._ev._arq, nome: d._ev.descricao } : (await listarArquivos('certificacao', 'evidencia', d._ev.id).catch(() => []))[0] || null) : await pdfVigente(d);
    if (!apr || g !== apr.g) return;
    if (!v) {
      box.innerHTML = d._ev && linkOk(d._ev.link) ? `<p class="ce-apr-msg">Evidência no OneDrive: <a href="${esc(d._ev.link)}" target="_blank" rel="noopener">abrir ↗</a></p>`
        : '<p class="ce-apr-msg">Este documento ainda não tem PDF no app.</p>';
      return;
    }
    apr.chave = v.chave;
    const u = await urlDoArquivo(v.chave);
    if (!apr || g !== apr.g) return;
    box.innerHTML = /^image\//.test(v.mime || '') ? `<img class="ce-apr-img" alt="${esc(d.nome)}" src="${u}">`
      : `<iframe title="${esc(d.codigo)}" src="${u}#view=FitH&navpanes=0"></iframe>`;
  } catch (e) {
    if (apr && g === apr.g) box.innerHTML = `<p class="ce-apr-msg">${esc(navigator.onLine ? e.message : 'Sem internet: o PDF abre quando a conexão voltar.')}</p>`;
  }
}

/* Barra de envio: quantos arquivos ainda sobem para o Drive. */
let pararAviso = null;
async function mostrarEnvio() {
  const el = $('ceDcEnvio'); if (!el) return;
  const n = await contarPendentes().catch(() => 0);
  el.hidden = !n;
  el.textContent = n ? `Enviando para o Google Drive: faltam ${n} arquivo(s). Pode continuar usando o app.` : '';
  if (!pararAviso) pararAviso = aoMudarArquivos(() => { mostrarEnvio(); if (S.fd.modo === 'tipo') painelDoc(); });
}

/** Importa uma pasta escolhida no computador (input webkitdirectory). */
async function importarPasta(arquivos) {
  if (!arquivos.length) return;
  const porCod = new Map(S.docs.map(d => [chaveCodigo(d.codigo), d]));
  const grupos = new Map();                 // doc.id → {d, raiz:[], revs:[]}
  const semCadastro = new Set();
  let ignorados = 0;
  for (const a of arquivos) {
    const partes = (a.webkitRelativePath || a.name).split('/');
    const i = partes.findIndex((p, k) => k < partes.length - 1 && chaveCodigo(p));
    if (i < 0) continue;
    const d = porCod.get(chaveCodigo(partes[i]));
    if (!d) { semCadastro.add(partes[i]); continue; }
    if (!/\.pdf$/i.test(a.name) && !/^image\//.test(a.type)) { ignorados++; continue; }
    const g = grupos.get(d.id) || { d, raiz: [], revs: [] };
    if (partes.length === i + 2) g.raiz.push(a);
    else if (/^revis/i.test(partes[i + 1])) g.revs.push(a);
    else { ignorados++; continue; }
    grupos.set(d.id, g);
  }
  if (!grupos.size) {
    alert(semCadastro.size ? `Nenhuma subpasta bate com um código cadastrado: ${[...semCadastro].join(', ')}` : 'Não achei subpastas com código (ex.: "POP 001 - …") nessa pasta.');
    return;
  }
  const dataArq = a => { const x = new Date(a.lastModified); return `${doisD(x.getDate())}-${doisD(x.getMonth() + 1)}-${x.getFullYear()}`; };
  let novos = 0, jaTinha = 0, erros = [];
  for (const { d, raiz, revs } of grupos.values()) {
    const tem = new Set((await listarArquivos('certificacao', 'documento', d.id).catch(() => [])).map(x => so(x.nome)));
    const temRev = new Set((await listarArquivos('certificacao', 'documento', revDono(d.id)).catch(() => [])).map(x => so(x.nome)));
    for (const a of raiz) {
      if (tem.has(a.name)) { jaTinha++; continue; }
      try { await enfileirarArquivo('certificacao', 'documento', d.id, a, a.name); novos++; S.docComArq?.add?.(String(d.id)); }
      catch (e) { erros.push(`${a.name}: ${e.message}`); }
    }
    for (const a of revs) {
      const nome = `${dataArq(a)} · ${a.name}`;
      if (temRev.has(nome)) { jaTinha++; continue; }
      try { await enfileirarArquivo('certificacao', 'documento', revDono(d.id), a, nome); novos++; }
      catch (e) { erros.push(`${a.name}: ${e.message}`); }
    }
  }
  enviarPendentes();
  mostrarEnvio();
  dialogo(`<h3>Importar pasta</h3>
    <p><b>${grupos.size}</b> documento(s) encontrados · <b>${novos}</b> arquivo(s) indo para o Google Drive${jaTinha ? ` · ${jaTinha} já estavam no app` : ''}.</p>
    ${ignorados ? `<p class="dica">${ignorados} arquivo(s) Word/outros ficaram de fora: o editável continua no OneDrive (botão “Abrir local”).</p>` : ''}
    ${semCadastro.size ? `<p class="dica">Sem cadastro na Lista mestra (não importados): ${esc([...semCadastro].join(', '))}. Cadastre e importe de novo.</p>` : ''}
    ${erros.length ? `<div class="aviso erro">${erros.map(esc).join('<br>')}</div>` : ''}
    <p class="dica">Os arquivos sobem um por vez; pode fechar e continuar usando o app.</p>
    <div class="barra fim"><button class="btn principal" type="button" data-fechar>Ok</button></div>`, () => {});
}

function desenharTabelaDocs() {
  const tela = $('telaCeDocumentos');
  const f = S.fd;
  const cats = [...new Set([...CATEGORIAS, ...S.docs.map(d => d.categoria)])].sort();
  const pers = [...new Set(S.docs.map(d => d.periodicidade).filter(Boolean))].sort((a, b) => PERIODOS.indexOf(a) - PERIODOS.indexOf(b));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Lista mestra · tabela</h2>
        <p class="dica" style="margin:2px 0 0">Anexos, instruções de trabalho, registros, POPs e check lists, com revisão, responsável e os códigos das normas que cada um atende.</p></div>
      <button class="btn principal" type="button" id="ceDcNovo">Novo documento</button>
    </div>
    <div class="grade larga" style="margin-top:14px">
      <label class="campo">Buscar <input type="text" id="ceDcQ" value="${esc(f.q)}" placeholder="Código, nome ou código da norma (ex.: 4.6.1)"></label>
      <label class="campo">Categoria <select id="ceDcCat">${opcoes(cats, f.cat, 'Todas')}</select></label>
      <label class="campo">Periodicidade <select id="ceDcPer">${opcoes(pers, f.per, 'Todas')}</select></label>
      <label class="campo">Situação <select id="ceDcSit">${opcoes([['atencao', 'Precisa de atenção'], ['semlink', 'Sem link do OneDrive'], ...SITUACOES_DOC], f.sit, 'Todas')}</select></label>
      <label class="campo">Responsável <select id="ceDcResp">${opcoes([...new Set(S.docs.map(d => so(d.responsavel)).filter(Boolean))].sort(), f.resp, 'Todos')}</select></label>
    </div>
    <div class="barra" id="ceDcResumo"></div>
    <div id="ceDcTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ceDcImprimir">Imprimir a lista mestra</button>
    <button class="btn" type="button" id="ceDcExcel">Exportar Excel</button>
  </div>`;
  const ligarF = (id, campo, ev = 'change') => $(id).addEventListener(ev, e => { f[campo] = e.target.value; tabelaDocumentos(); });
  ligarF('ceDcQ', 'q', 'input'); ligarF('ceDcCat', 'cat'); ligarF('ceDcPer', 'per'); ligarF('ceDcSit', 'sit'); ligarF('ceDcResp', 'resp');
  $('ceDcNovo').addEventListener('click', () => formDocumento(null));
  $('ceDcImprimir').addEventListener('click', () => mostrar(docListaDocs(docFiltrados()), { barra: true }));
  $('ceDcExcel').addEventListener('click', () => exportarDocs(docFiltrados()));
  tabelaDocumentos();
}

function tabelaDocumentos() {
  const lista = docFiltrados();
  const conta = s => lista.filter(d => sitDoc(d) === s).length;
  $('ceDcResumo').innerHTML = `<span class="contagem"><b>${lista.length}</b> documento(s)</span>
    ${SITUACOES_DOC.map(s => conta(s) ? `<span class="contagem">${tag(s, COR_SIT[s])} <b>${conta(s)}</b></span>` : '').join('')}
    ${lista.filter(docAtrasado).length ? `<span class="contagem">${tag('revisão vencida', 'perigo')} <b>${lista.filter(docAtrasado).length}</b></span>` : ''}
    <span class="contagem"><b>${lista.filter(d => !linkOk(d.link)).length}</b> sem link do OneDrive</span>`;
  $('ceDcTabela').innerHTML = lista.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr>
    <th>Código</th><th>Documento</th><th>Categoria</th><th class="ce">Periodicidade</th><th>Responsável</th><th class="ce">Revisão</th><th class="ce">Próxima</th><th>Códigos nas normas</th><th class="ce">Situação</th><th></th>
  </tr></thead><tbody>
  ${lista.map(d => { const p = proximaDoc(d); return `<tr>
    <td>${codigoLink(d)}</td><td>${esc(d.nome)}${(d.certificacoes || []).length ? `<br><span class="dc-sem">${esc(d.certificacoes.join(', '))}</span>` : ''}</td>
    <td>${esc(d.categoria)}</td><td class="ce">${esc(d.periodicidade || '—')}</td><td>${esc(d.responsavel || '—')}</td>
    <td class="ce">${d.revisao ? 'Rev. ' + esc(d.revisao) : ''}${d.data_revisao ? `<br><span class="dc-sem">${br(d.data_revisao)}</span>` : (d.revisao ? '' : '—')}</td>
    <td class="ce">${p ? (p < hoje() ? tag(br(p), 'perigo') : br(p)) : '—'}</td>
    <td>${reqsDoDoc(d).length ? `<div class="ce-refs">${codTags(codigosDoDoc(d))}</div>
      <button class="ce-link dc-sem" type="button" data-dreq="${d.id}" title="Ver os requisitos ligados">${reqsDoDoc(d).length} requisito(s)</button>` : '<span class="dc-sem">—</span>'}</td>
    <td class="ce">${tag(sitDoc(d), COR_SIT[sitDoc(d)])}</td>
    <td class="ce"><button class="btn mini" type="button" data-doc="${d.id}">Abrir</button></td></tr>`; }).join('')}
  </tbody></table></div>` : `<div class="vazio">${S.docs.length ? 'Nada com esses filtros.' : 'Nenhum documento cadastrado.'}</div>`;
  $('ceDcTabela').querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => formDocumento(Number(b.dataset.doc))));
  $('ceDcTabela').querySelectorAll('[data-dreq]').forEach(b => b.addEventListener('click', () => verReqsDoDoc(Number(b.dataset.dreq))));
}

const caixasCert = (marcadas, prefixo) => `<div class="ce-caixas">${S.certs.filter(c => c.ativa || (marcadas || []).includes(c.id)).map(c =>
  `<label class="rs-check"><input type="checkbox" data-${prefixo}="${esc(c.id)}" ${(marcadas || []).includes(c.id) ? 'checked' : ''}> ${esc(c.nome)}</label>`).join('')}</div>`;
const lerCaixas = prefixo => [...document.querySelectorAll(`#dlgCe [data-${prefixo}]`)].filter(x => x.checked).map(x => x.dataset[prefixo]);

let anexosDoc = null;
function formDocumento(id, preset = {}) {
  const d = id ? S.docs.find(x => x.id === id) : null;
  const v = d || { categoria: S.fd.cat || 'ANEXO', situacao: 'Em dia', periodicidade: 'Anual', certificacoes: [], ...preset };
  const val = k => esc(v[k] ?? '');
  dialogo(`<h3>${d ? esc(d.codigo) + ' · documento' : 'Novo documento'}</h3>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="grade">
      <label class="campo">Código <input type="text" id="cedCod" maxlength="20" value="${val('codigo')}" placeholder="Ex.: POP 08" required></label>
      <label class="campo plena">Documento <input type="text" id="cedNome" maxlength="200" value="${val('nome')}" required></label>
      <label class="campo">Categoria <input type="text" id="cedCat" list="ceListaCat" maxlength="40" value="${val('categoria')}"></label>
      <label class="campo">Periodicidade <select id="cedPer">${opcoes(PERIODOS, v.periodicidade, '—')}</select></label>
      <label class="campo">Responsável <input type="text" id="cedResp" list="ceListaResp" maxlength="80" value="${val('responsavel')}"></label>
      <label class="campo">Situação <select id="cedSit">${opcoes(SITUACOES_DOC, v.situacao)}</select></label>
      <label class="campo">Revisão nº <input type="text" id="cedRev" maxlength="10" value="${val('revisao')}"></label>
      <label class="campo">Data da revisão <input type="date" id="cedData" value="${val('data_revisao')}"></label>
      <label class="campo plena">Link no OneDrive <small>da pasta — é o que abre no botão “Abrir local”</small>
        <span class="ce-linha-link"><input type="url" id="cedLink" maxlength="2000" value="${val('link')}" placeholder="https://onedrive.live.com/… ou https://1drv.ms/…">
        <a class="btn mini" id="cedLinkAbrir" target="_blank" rel="noopener" ${linkOk(v.link) ? `href="${esc(v.link)}"` : 'hidden'}>Abrir ↗</a></span></label>
      <label class="campo plena">Caminho no computador <small>a pasta no OneDrive do escritório — o app copia para colar no Explorador</small>
        <input type="text" id="cedCaminho" maxlength="500" value="${val('caminho')}" placeholder="C:\\NUVEM\\OneDrive\\…"></label>
      <div class="plena" id="cedAnexos"></div>
      <p class="dica plena" id="cedProx"></p>
      <div class="campo plena"><span>Certificações que pedem <small>vazio = todas</small></span>${caixasCert(v.certificacoes, 'dcert')}</div>
      <label class="campo plena">Observação <textarea id="cedObs" rows="2" maxlength="1000">${val('observacao')}</textarea></label>
    </div>
    ${d && codigosDoDoc(d).length ? `<h4 class="ac-h4">Códigos nas normas</h4><div class="ce-refs" style="max-width:none">${codTags(codigosDoDoc(d))}</div>` : ''}
    ${d ? `<h4 class="ac-h4">Requisitos que este documento comprova</h4>
      ${reqsDoDoc(d).length ? `<ul class="ce-lista-req">${reqsDoDoc(d).map(r => `<li><button class="ce-link" type="button" data-lreq="${r.id}">${esc(r.titulo)}</button>
        <span class="dc-sem">${esc(refTexto(r, null))}</span></li>`).join('')}</ul>`
        : '<p class="dica">Nenhum ainda. A ligação se faz no requisito, em “Documentos que comprovam”.</p>'}` : ''}
    ${datalist('ceListaCat', CATEGORIAS)}${datalist('ceListaResp', responsaveis())}
    <div class="barra fim">
      ${d ? '<button class="btn perigo" type="button" id="cedApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cedGravar">Gravar</button>
    </div>`, () => {
    const prox = () => {
      const p = proximaDoc({ periodicidade: $('cedPer').value, data_revisao: $('cedData').value });
      $('cedProx').textContent = p ? `Próxima revisão: ${br(p)} — vai para o calendário.`
        : MESES_PERIODO[$('cedPer').value] ? 'Informe a data da revisão para o documento aparecer no calendário.' : '';
    };
    $('cedPer').addEventListener('change', prox); $('cedData').addEventListener('change', prox); prox();
    $('cedLink').addEventListener('input', () => {
      const u = so($('cedLink').value), a = $('cedLinkAbrir');
      if (linkOk(u)) { a.href = u; a.hidden = false; } else { a.removeAttribute('href'); a.hidden = true; }
    });
    document.querySelectorAll('#dlgCe [data-lreq]').forEach(b => b.addEventListener('click', () => formRequisito(Number(b.dataset.lreq))));
    // Arquivo do documento no Google Drive (15/10/2026) — o link do OneDrive continua valendo.
    anexosDoc = campoAnexos($('cedAnexos'), { area: 'certificacao', tipo: 'documento', rotulo: 'Arquivo do documento', dica: 'PDF vigente — abre dentro do app' });
    anexosDoc.abrir(d ? d.id : null);
    $('cedGravar').addEventListener('click', () => gravarDocumento(d));
    $('cedApagar')?.addEventListener('click', () => apagar('cert_documentos', d.id, `${d.codigo} · ${d.nome}`, () => { S.docs = S.docs.filter(x => x.id !== d.id); }));
  });
}

/** Leva à lista de requisitos filtrada por um documento. */
function verReqsDoDoc(id) {
  Object.assign(S.fr, { q: '', cert: '', tema: '', prior: '', status: '', doc: String(id) });
  abrirModulo('cert', 'ceRequisitos');
}

async function gravarDocumento(d) {
  const g = id => so($(id).value) || null;
  const linha = {
    codigo: g('cedCod'), nome: g('cedNome'), categoria: (g('cedCat') || 'ANEXO').toUpperCase(), periodicidade: g('cedPer'),
    responsavel: g('cedResp'), situacao: $('cedSit').value, revisao: g('cedRev'), data_revisao: g('cedData'),
    certificacoes: lerCaixas('dcert'), observacao: g('cedObs'), link: g('cedLink'), caminho: g('cedCaminho'), atualizado_em: new Date().toISOString(),
  };
  if (linha.link && !linkOk(linha.link)) return erroDlg('O link precisa começar com https:// — copie pelo botão Compartilhar › Copiar link do OneDrive.');
  if (!linha.codigo || !linha.nome) return erroDlg('Informe o código e o nome do documento.');
  if (S.docs.some(x => x.id !== d?.id && so(x.codigo).toLowerCase() === linha.codigo.toLowerCase()))
    return erroDlg(`Já existe um documento com o código ${linha.codigo}.`);
  const anexos = anexosDoc;
  const gravado = await salvar('cert_documentos', d, linha, S.docs, 'cedGravar');
  if (gravado && anexos?.mudou) { S.docComArq?.add?.(String(gravado.id)); redesenhar(); }
  if (gravado && anexos) anexos.salvar(gravado.id).catch(e => alert('O documento foi gravado, mas o arquivo não: ' + e.message));
  S.docs.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

/* ===================================================================
   TELA · CALENDÁRIO (mês)
   =================================================================== */
function desenharCalendario() {
  const tela = $('telaCeCalendario');
  const c = S.cal;
  if (!c.ano) { const d = new Date(); c.ano = d.getFullYear(); c.mes = d.getMonth(); }
  const de = `${c.ano}-${doisD(c.mes + 1)}-01`;
  const ult = new Date(Date.UTC(c.ano, c.mes + 1, 0)).getUTCDate();
  const ate = `${c.ano}-${doisD(c.mes + 1)}-${doisD(ult)}`;
  const itens = itensEntre(de, ate, { cert: c.cert, auto: c.auto });

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div class="barra" style="margin:0">
        <button class="btn mini" type="button" id="ceClAnt" title="Mês anterior">‹</button>
        <h2 style="margin:0;min-width:170px;text-align:center">${MESES[c.mes]} ${c.ano}</h2>
        <button class="btn mini" type="button" id="ceClProx" title="Próximo mês">›</button>
        <button class="btn mini" type="button" id="ceClHoje">Hoje</button>
      </div>
      <span class="barra" style="margin:0">
        <label class="campo" style="margin:0">Certificação <select id="ceClCert">${opcoes(ativas().map(x => [x.id, x.nome]), c.cert, 'Todas')}</select></label>
        <label class="rs-check" style="margin:0"><input type="checkbox" id="ceClAuto" ${c.auto ? 'checked' : ''}> Prazos e revisões</label>
        <button class="btn principal" type="button" id="ceClNovo">Marcar</button>
      </span>
    </div>
    <div class="ce-legenda">${[['marrom', 'Auditoria externa'], ['verde', 'Auditoria interna'], ['azul', 'Treinamento / simulado'], ['cinza', 'Reunião, atividade, revisão de documento'],
      ['amarelo', 'Prazo de requisito'], ['vermelho', 'Validade do certificado']].map(([k, t]) => `<span><i class="ce-bola ce-ev-${k}"></i>${t}</span>`).join('')}</div>
    ${gradeMes(c.ano, c.mes, itens, true)}
    <div class="qp-bloco"><h3>No mês</h3>${tabelaItens(itens, 'Nada neste mês.')}</div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ceClImprimir">Imprimir o mês</button>
  </div>`;
  const ir = n => { const d = new Date(Date.UTC(c.ano, c.mes + n, 1)); c.ano = d.getUTCFullYear(); c.mes = d.getUTCMonth(); desenharCalendario(); };
  $('ceClAnt').addEventListener('click', () => ir(-1));
  $('ceClProx').addEventListener('click', () => ir(1));
  $('ceClHoje').addEventListener('click', () => { c.ano = 0; desenharCalendario(); });
  $('ceClCert').addEventListener('change', e => { c.cert = e.target.value; desenharCalendario(); });
  $('ceClAuto').addEventListener('change', e => { c.auto = e.target.checked; desenharCalendario(); });
  $('ceClNovo').addEventListener('click', () => formEvento(null, c.mes === new Date().getMonth() && c.ano === new Date().getFullYear() ? hoje() : de));
  $('ceClImprimir').addEventListener('click', () => mostrar(docMes(c.ano, c.mes, itens), { barra: true }));
  tela.querySelectorAll('[data-novo-dia]').forEach(b => b.addEventListener('click', ev => {
    if (ev.target.closest('[data-ev],[data-auto]')) return;
    formEvento(null, b.dataset.novoDia);
  }));
  tela.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', () => {
    const [k, id] = b.dataset.auto.split(':');
    if (k === 'req') formRequisito(Number(id));
    else if (k === 'doc') formDocumento(Number(id));
    else if (k === 'cert') formCertificacao(id);
    else if (k === 'caderno') abrirModulo('cert', id || 'ccPainel');
  }));
  ligarItens(tela);
}

/** A grade do mês (tela e papel). */
function gradeMes(ano, mes, itens, tela) {
  const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const ult = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const hj = hoje();
  const porDia = {};
  itens.forEach(i => (porDia[i.data] = porDia[i.data] || []).push(i));
  const cel = [];
  for (let i = 0; i < primeiro; i++) cel.push('<td class="ce-fora"></td>');
  for (let d = 1; d <= ult; d++) {
    const dia = `${ano}-${doisD(mes + 1)}-${doisD(d)}`;
    const its = porDia[dia] || [];
    cel.push(`<td class="${dia === hj ? 'ce-hoje' : ''}" ${tela ? `data-novo-dia="${dia}" title="Clique para marcar neste dia"` : ''}>
      <span class="ce-dia">${d}</span>
      ${its.map(i => {
        const attr = !tela ? '' : i.ev ? `data-ev="${i.ev.id}" data-dia="${i.data}"` : i.auto ? `data-auto="${i.auto}:${i.ref}"` : '';
        return `<${tela ? 'button type="button"' : 'div'} class="ce-ev ce-ev-${i.cor}${i.feito ? ' ce-feito' : ''}" ${attr} title="${esc(i.tipo + ' · ' + i.titulo)}">${i.feito ? '✓ ' : ''}${esc(i.titulo)}</${tela ? 'button' : 'div'}>`;
      }).join('')}</td>`);
  }
  while (cel.length % 7) cel.push('<td class="ce-fora"></td>');
  const semanas = [];
  for (let i = 0; i < cel.length; i += 7) semanas.push(`<tr>${cel.slice(i, i + 7).join('')}</tr>`);
  return `<div class="ac-rola"><table class="ce-mes${tela ? '' : ' ce-mes-papel'}"><thead><tr>${SEMANA.map(s => `<th>${s}</th>`).join('')}</tr></thead>
    <tbody>${semanas.join('')}</tbody></table></div>`;
}

function formEvento(id, dia) {
  const ev = id ? S.evs.find(x => x.id === id) : null;
  const v = ev || { data: dia || hoje(), tipo: 'Atividade', certificacoes: S.cal.cert ? [S.cal.cert] : ativas().map(c => c.id), repetir: '' };
  const val = k => esc(v[k] ?? '');
  const ocorr = ev && dia ? dia : v.data;
  dialogo(`<h3>${ev ? 'No calendário' : 'Marcar no calendário'}</h3>
    <div class="aviso erro" id="ceErro" hidden></div>
    ${ev ? `<div class="aviso ${feito(ev, ocorr) ? 'ok' : ''}" style="display:flex;gap:10px;align-items:center;justify-content:space-between">
      <span>${ev.repetir ? `Ocorrência de <b>${br(ocorr)}</b>` : `<b>${br(ocorr)}</b>`}: ${feito(ev, ocorr) ? '<b>feito</b>' : 'ainda não feito'}</span>
      <button class="btn mini ${feito(ev, ocorr) ? '' : 'principal'}" type="button" id="ceeFeito">${feito(ev, ocorr) ? 'Desfazer' : 'Dar como feito'}</button></div>` : ''}
    <div class="grade">
      <label class="campo plena">O quê <input type="text" id="ceeTit" maxlength="200" value="${val('titulo')}" placeholder="Ex.: Simulado de derramamento de agroquímico" required></label>
      <label class="campo">Tipo <select id="ceeTipo">${opcoes(TIPOS_EVENTO, v.tipo)}</select></label>
      <label class="campo">Data <input type="date" id="ceeData" value="${val('data')}" required></label>
      <label class="campo">Até <small>se durar mais de um dia</small><input type="date" id="ceeFim" value="${val('data_fim')}"></label>
      <label class="campo">Repetir <select id="ceeRep">${opcoes(REPETIR.map(r => [r, r || 'Não repete']), v.repetir || '')}</select></label>
      <label class="campo">Responsável <input type="text" id="ceeResp" list="ceListaResp" maxlength="80" value="${val('responsavel')}"></label>
      <div class="campo plena"><span>Certificações</span>${caixasCert(v.certificacoes, 'ecert')}</div>
      <label class="campo plena">Observação <textarea id="ceeObs" rows="2" maxlength="1000">${val('observacao')}</textarea></label>
    </div>
    ${datalist('ceListaResp', responsaveis())}
    <div class="barra fim">
      ${ev ? '<button class="btn perigo" type="button" id="ceeApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="ceeGravar">Gravar</button>
    </div>`, () => {
    $('ceeGravar').addEventListener('click', () => gravarEvento(ev));
    $('ceeApagar')?.addEventListener('click', () => apagar('cert_eventos', ev.id, ev.titulo + (ev.repetir ? ` (e todas as repetições ${ev.repetir.toLowerCase()}s)` : ''),
      () => { S.evs = S.evs.filter(x => x.id !== ev.id); }));
    $('ceeFeito')?.addEventListener('click', async () => {
      // Por item e pela fila (rodada C): sem sinal fica guardado e sobe depois;
      // no servidor, cert_marcar_feito acrescenta/tira só esta data.
      const feitos = new Set(ev.feitos || []);
      const marcar = !feitos.has(ocorr);
      marcar ? feitos.add(ocorr) : feitos.delete(ocorr);
      $('ceeFeito').disabled = true;
      const i = S.evs.findIndex(x => x.id === ev.id);
      S.evs[i] = { ...ev, feitos: [...feitos].sort() };
      salvarCaixa();
      await nucleo.adicionarNaFila(CAMADA, { colecao: 'cert_eventos', acao: 'rpc', item: { nome: 'cert_marcar_feito', args: { p_id: ev.id, p_ocorr: ocorr, p_feito: marcar } }, base: null });
      if (CAMADA_DEF.podeEnviar()) enviarFilaCert().catch(() => {});
      fechar(); redesenhar();
    });
  });
}

async function gravarEvento(ev) {
  const g = id => so($(id).value) || null;
  const linha = {
    titulo: g('ceeTit'), tipo: $('ceeTipo').value, data: g('ceeData'), data_fim: g('ceeFim'),
    repetir: $('ceeRep').value || null, responsavel: g('ceeResp'), certificacoes: lerCaixas('ecert'), observacao: g('ceeObs'),
  };
  if (!linha.titulo) return erroDlg('Escreva o que vai acontecer.');
  if (!linha.data) return erroDlg('Informe a data.');
  if (linha.data_fim && linha.data_fim < linha.data) return erroDlg('A data final não pode ser antes da inicial.');
  // mudou a data de algo que não repete: o "feito" acompanha
  if (ev && !linha.repetir && ev.data !== linha.data && (ev.feitos || []).includes(ev.data)) linha.feitos = [linha.data];
  if (!ev) linha.criado_por = quem();
  await salvar('cert_eventos', ev, linha, S.evs, 'ceeGravar');
  S.evs.sort((a, b) => a.data.localeCompare(b.data));
}

/* ===================================================================
   TELA · CRONOGRAMA ANUAL
   =================================================================== */
/** Linhas do cronograma: o que acontece em cada mês do ano. */
function linhasAnual(ano, cert, comDocs) {
  const de = `${ano}-01-01`, ate = `${ano}-12-31`;
  const itens = itensEntre(de, ate, { cert, auto: true }).filter(i => comDocs || i.auto !== 'doc');
  const mapa = new Map();
  for (const i of itens) {
    const chave = i.ev ? 'ev' + i.ev.id : `${i.auto}:${i.ref}:${i.tipo}`;
    if (!mapa.has(chave)) mapa.set(chave, { titulo: i.titulo, tipo: i.tipo, cor: i.cor, resp: i.resp, certs: i.certs, ev: i.ev, meses: Array.from({ length: 12 }, () => []) });
    mapa.get(chave).meses[Number(i.data.slice(5, 7)) - 1].push(i);
  }
  // requisitos periódicos sem data: entram como linha, sem mês marcado, para lembrar
  for (const r of S.reqs) {
    if (!r.periodicidade || !emUso(r) || r.prazo) continue;
    const cs = ativas().filter(c => atende(r, c)).map(c => c.id);
    if (cert && !cs.includes(cert)) continue;
    mapa.set('rp' + r.id, { titulo: r.titulo, tipo: `Requisito · ${r.periodicidade.toLowerCase()}`, cor: 'amarelo', resp: r.responsavel, certs: cs, semData: true, meses: Array.from({ length: 12 }, () => []) });
  }
  const ordemTipo = t => { const i = TIPOS_EVENTO.indexOf(t); return i < 0 ? 50 : i; };
  return [...mapa.values()].sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

function desenharAnual() {
  const tela = $('telaCeAnual');
  const a = S.anual;
  if (!a.ano) a.ano = new Date().getFullYear();
  const linhas = linhasAnual(a.ano, a.cert, a.docs);
  const mesHj = new Date().getFullYear() === a.ano ? new Date().getMonth() : -1;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Cronograma anual · ${a.ano}</h2>
        <p class="dica" style="margin:2px 0 0">Auditorias, treinamentos, simulados e prazos mês a mês. ● previsto · ✓ feito.</p></div>
      <span class="barra" style="margin:0">
        <label class="campo" style="margin:0">Ano <select id="ceAnAno">${opcoes([a.ano - 1, a.ano, a.ano + 1].map(String), String(a.ano))}</select></label>
        <label class="campo" style="margin:0">Certificação <select id="ceAnCert">${opcoes(ativas().map(x => [x.id, x.nome]), a.cert, 'Todas')}</select></label>
        <label class="rs-check" style="margin:0"><input type="checkbox" id="ceAnDocs" ${a.docs ? 'checked' : ''}> Revisão de documentos</label>
        <button class="btn" type="button" id="ceAnNovo">Marcar</button>
      </span>
    </div>
    ${linhas.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha ce-anual"><thead><tr>
      <th>Atividade</th><th>Tipo</th><th>Responsável</th>${MES3.map((m, i) => `<th class="ce${i === mesHj ? ' ce-mes-atual' : ''}">${m}</th>`).join('')}
    </tr></thead><tbody>
    ${linhas.map(l => `<tr>
      <td>${l.ev ? `<button class="ce-link" type="button" data-ev="${l.ev.id}" data-dia="${l.ev.data}">${esc(l.titulo)}</button>` : esc(l.titulo)}${l.semData ? '<br><span class="dc-sem">sem data marcada</span>' : ''}</td>
      <td><span class="ce-bola ce-ev-${l.cor}"></span>${esc(l.tipo)}</td><td>${esc(l.resp || '—')}</td>
      ${l.meses.map((m, i) => `<td class="ce${i === mesHj ? ' ce-mes-atual' : ''}">${m.map(o => o.feito ? '<b class="ce-ok">✓</b>' : `<b class="ce-prev${o.data < hoje() ? ' ce-atras' : ''}">●</b>`).join('')}</td>`).join('')}
    </tr>`).join('')}</tbody></table></div>`
    : '<div class="vazio">Nada no ano. Use “Marcar” para pôr auditorias, treinamentos e simulados no calendário.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="ceAnImprimir">Imprimir o cronograma</button>
    <button class="btn" type="button" id="ceAnExcel">Exportar Excel</button>
  </div>`;
  $('ceAnAno').addEventListener('change', e => { a.ano = Number(e.target.value); desenharAnual(); });
  $('ceAnCert').addEventListener('change', e => { a.cert = e.target.value; desenharAnual(); });
  $('ceAnDocs').addEventListener('change', e => { a.docs = e.target.checked; desenharAnual(); });
  $('ceAnNovo').addEventListener('click', () => formEvento(null, hoje()));
  $('ceAnImprimir').addEventListener('click', () => mostrar(docAnual(a.ano, a.cert, linhas), { barra: true }));
  $('ceAnExcel').addEventListener('click', () => exportarAnual(a.ano, linhas));
  tela.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => formEvento(Number(b.dataset.ev), null)));
}

/* ===================================================================
   TELA · CERTIFICAÇÕES
   =================================================================== */
function desenharCertificacoes() {
  const tela = $('telaCeCertificacoes');
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Certificações</h2>
        <p class="dica" style="margin:2px 0 0">As normas da fazenda: número do certificado, validade e auditorias. Desligada = guardada, fora das listas e do calendário.</p></div>
      <button class="btn" type="button" id="ceCtNova">Nova certificação</button>
    </div>
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr>
      <th>Certificação</th><th>Versão</th><th>Certificadora / nº</th><th class="ce">Última auditoria</th><th class="ce">Próxima auditoria</th><th class="ce">Validade</th><th class="ce">Requisitos</th><th class="ce">Situação</th><th></th>
    </tr></thead><tbody>
    ${S.certs.map(c => { const p = placar(c); return `<tr${c.ativa ? '' : ' class="ce-desligada"'}>
      <td><b>${esc(c.nome)}</b><br><span class="dc-sem">${esc(c.norma)}</span></td><td>${esc(c.versao || '—')}</td>
      <td>${esc(c.certificadora || '—')}${c.numero ? `<br><span class="dc-sem">${esc(c.numero)}</span>` : ''}</td>
      <td class="ce">${br(c.ultima_auditoria)}</td><td class="ce">${br(c.proxima_auditoria)}</td>
      <td class="ce">${c.validade && c.validade < hoje() ? tag(br(c.validade), 'perigo') : br(c.validade)}</td>
      <td class="ce">${p.total ? `${p.conf}/${p.total}` : '—'}</td>
      <td class="ce">${c.ativa ? tag('Ligada', 'ativo') : tag('Desligada', 'inativo')}</td>
      <td class="ce"><button class="btn mini" type="button" data-cert="${esc(c.id)}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>
  </div>`;
  $('ceCtNova').addEventListener('click', () => formCertificacao(null));
  tela.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => formCertificacao(b.dataset.cert)));
}

function formCertificacao(id) {
  const c = id ? certPorId(id) : null;
  const v = c || { ativa: true };
  const val = k => esc(v[k] ?? '');
  dialogo(`<h3>${c ? esc(c.nome) : 'Nova certificação'}</h3>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="grade">
      <label class="campo">Sigla <input type="text" id="cecId" maxlength="12" value="${val('id')}" ${c ? 'disabled' : ''} placeholder="Ex.: FSA"></label>
      <label class="campo">Nome <input type="text" id="cecNome" maxlength="80" value="${val('nome')}" required></label>
      <label class="campo">Norma nos requisitos <input type="text" id="cecNorma" maxlength="60" value="${val('norma')}" ${c ? 'disabled' : ''} placeholder="Como aparece nos códigos"></label>
      <label class="campo">Versão <input type="text" id="cecVersao" maxlength="30" value="${val('versao')}"></label>
      <label class="campo">Certificadora <input type="text" id="cecCertif" maxlength="80" value="${val('certificadora')}"></label>
      <label class="campo">Nº do certificado / GGN / Sedex <input type="text" id="cecNum" maxlength="60" value="${val('numero')}"></label>
      <label class="campo">Última auditoria <input type="date" id="cecUlt" value="${val('ultima_auditoria')}"></label>
      <label class="campo">Próxima auditoria <input type="date" id="cecProx" value="${val('proxima_auditoria')}"></label>
      <label class="campo">Validade do certificado <input type="date" id="cecVal" value="${val('validade')}"></label>
      <label class="campo plena">Escopo <input type="text" id="cecEscopo" maxlength="300" value="${val('escopo')}" placeholder="Culturas, unidades, packing…"></label>
      <label class="campo plena">Observação <textarea id="cecObs" rows="2" maxlength="1000">${val('observacao')}</textarea></label>
      <label class="campo rs-check plena"><input type="checkbox" id="cecAtiva" ${v.ativa ? 'checked' : ''}> A fazenda tem esta certificação hoje (ligada)</label>
    </div>
    <div class="barra fim">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cecGravar">Gravar</button>
    </div>`, () => $('cecGravar').addEventListener('click', () => gravarCertificacao(c)));
}

async function gravarCertificacao(c) {
  const g = id => so($(id).value) || null;
  const linha = {
    nome: g('cecNome'), versao: g('cecVersao'), certificadora: g('cecCertif'), numero: g('cecNum'),
    ultima_auditoria: g('cecUlt'), proxima_auditoria: g('cecProx'), validade: g('cecVal'),
    escopo: g('cecEscopo'), observacao: g('cecObs'), ativa: $('cecAtiva').checked, atualizado_em: new Date().toISOString(),
  };
  if (!linha.nome) return erroDlg('Informe o nome.');
  if (!c) {
    linha.id = (g('cecId') || '').toUpperCase().replace(/\s+/g, '');
    linha.norma = g('cecNorma') || linha.nome;
    linha.ordem = Math.max(0, ...S.certs.map(x => x.ordem || 0)) + 1;
    if (!linha.id) return erroDlg('Informe a sigla.');
    if (certPorId(linha.id)) return erroDlg('Já existe uma certificação com essa sigla.');
  }
  $('cecGravar').disabled = true;
  try {
    const t = estado.cliente.from('cert_certificacoes');
    const { data, error } = c ? await t.update(linha).eq('id', c.id).select().single() : await t.insert(linha).select().single();
    if (error) throw error;
    if (c) S.certs[S.certs.findIndex(x => x.id === c.id)] = data; else S.certs.push(data);
    S.certs.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    fechar(); redesenhar();
  } catch (e) { $('cecGravar').disabled = false; erroDlg('Não consegui gravar: ' + (e.message || e)); }
}

/* ===================================================================
   GRAVAR / APAGAR (comum)
   =================================================================== */
async function salvar(tabela, atual, linha, lista, botao) {
  $(botao).disabled = true;
  try {
    const t = estado.cliente.from(tabela);
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single() : await t.insert(linha).select().single();
    if (error) throw error;
    if (atual) lista[lista.findIndex(x => x.id === atual.id)] = data; else lista.push(data);
    fechar(); redesenhar();
    return data;
  } catch (e) { $(botao).disabled = false; erroDlg('Não consegui gravar: ' + (e.message || e)); }
}

function apagar(tabela, id, nome, depois) {
  dialogo(`<h3>Apagar</h3>
    <p>${esc(nome)}</p>
    <p class="dica">Some das listas e do calendário e não volta.</p>
    <div class="aviso erro" id="ceErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn perigo" type="button" id="ceApOk">Apagar</button></div>`, () => {
    $('ceApOk').addEventListener('click', async () => {
      $('ceApOk').disabled = true;
      const { error } = await estado.cliente.from(tabela).delete().eq('id', id);
      if (error) { $('ceApOk').disabled = false; return erroDlg('Não consegui apagar: ' + error.message); }
      depois(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   DOCUMENTOS IMPRESSOS
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo, paisagem }) {
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
const refTexto = (r, cert) => cert ? codigosDe(r, cert).join(', ')
  : refsDe(r).filter(x => certPorNorma(x.norma)?.ativa).map(x => `${sigla(x.norma)} ${x.codigo}`).join(' · ');
const clsStatus = s => s === 'Conforme' ? 'rel-ok' : ['Pendente', 'Não conforme', 'Em andamento'].includes(s) ? 'rel-pend' : '';

function docListaReq(lista) {
  const cert = S.fr.cert && S.fr.cert !== '*' ? certPorId(S.fr.cert) : null;
  const porTema = agrupar(lista, r => r.tema);
  const conf = lista.filter(r => r.status === 'Conforme').length;
  return documento({ titulo: 'Lista mestra de requisitos', paisagem: true,
    subtitulo: cert ? `${cert.nome} ${cert.versao || ''}` : `Certificações: ${ativas().map(c => c.nome).join(' · ')}`,
    canto: `${lista.length} requisito(s)`,
    corpo: `<div class="rel-resumo"><b>${conf}</b> conforme(s) de <b>${lista.length}</b> ·
        <b>${lista.filter(r => r.prioridade === 'Crítica' && r.status !== 'Conforme').length}</b> crítico(s) em aberto ·
        <b>${lista.filter(r => r.status === 'Não conforme').length}</b> não conforme(s)</div>
      <table class="rel-tabela"><thead><tr><th>Requisito</th><th>${cert ? 'Código(s) ' + esc(cert.id) : 'Códigos'}</th><th>Documentos</th><th>Prioridade</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
      ${porTema.map(([tema, rs]) => `<tr class="rel-grupo"><td colspan="7">${esc(tema)} · ${rs.length}</td></tr>
        ${rs.map(r => `<tr><td><b>${esc(r.titulo)}</b>${r.evidencia ? `<br><span class="rel-miudo">${esc(r.evidencia)}</span>` : ''}</td>
          <td>${esc(refTexto(r, cert))}</td><td>${esc(docsDe(r).map(d => d.codigo).join(', '))}</td><td>${esc(r.prioridade)}</td><td>${esc(r.responsavel || '')}</td><td>${r.prazo ? br(r.prazo) : ''}</td>
          <td class="${clsStatus(r.status)}">${esc(r.status)}</td></tr>`).join('')}`).join('')
        || '<tr><td colspan="7" class="rel-vazio">Nenhum requisito.</td></tr>'}
      </tbody></table>` });
}

function escolherChecklist() {
  dialogo(`<h3>Check list de auditoria interna</h3>
    <p class="dica">Sai uma lista para levar a campo: cada requisito com os códigos da norma, a evidência esperada e os quadros C / NC / NA para marcar à mão.</p>
    <div class="grade">
      <label class="campo plena">Certificação <select id="ceckCert">${opcoes(ativas().map(c => [c.id, `${c.nome} ${c.versao || ''}`]), S.fr.cert && S.fr.cert !== '*' ? S.fr.cert : ativas()[0]?.id)}</select></label>
      <label class="campo plena">Tema <select id="ceckTema">${opcoes(temas(), S.fr.tema, 'Todos')}</select></label>
      <label class="campo rs-check plena"><input type="checkbox" id="ceckEvid" checked> Mostrar a evidência esperada</label>
      <label class="campo rs-check plena"><input type="checkbox" id="ceckSit"> Mostrar o status atual de cada requisito</label>
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="ceckOk">Gerar</button></div>`, () => {
    $('ceckOk').addEventListener('click', () => {
      const c = certPorId($('ceckCert').value);
      if (!c) return;
      const tema = $('ceckTema').value;
      const lista = S.reqs.filter(r => atende(r, c) && r.status !== 'Não se aplica' && (!tema || r.tema === tema));
      const opc = { evid: $('ceckEvid').checked, sit: $('ceckSit').checked };
      fechar();
      mostrar(docChecklist(c, lista, tema, opc), { barra: true });
    });
  });
}

function docChecklist(c, lista, tema, { evid, sit }) {
  let n = 0;
  const porTema = agrupar(lista, r => r.tema);
  return documento({ titulo: 'Check list de auditoria interna', subtitulo: `${c.nome} ${c.versao || ''}${tema ? ' · ' + tema : ''}`,
    canto: `${lista.length} requisito(s)`,
    corpo: `<div class="ce-pap-campos">
        <div><span>Data</span><i></i></div><div><span>Auditor(a) interno(a)</span><i></i></div>
        <div><span>Unidade / área auditada</span><i></i></div><div><span>Acompanhante</span><i></i></div>
      </div>
      <table class="rel-tabela ce-check"><thead><tr><th class="rel-num">Nº</th><th>Requisito</th><th>Código</th>
        <th class="ce-box">C</th><th class="ce-box">NC</th><th class="ce-box">NA</th><th class="ce-obs">Evidência vista / observação</th></tr></thead><tbody>
      ${porTema.map(([t, rs]) => `<tr class="rel-grupo"><td colspan="7">${esc(t)}</td></tr>
        ${rs.map(r => `<tr><td class="rel-num">${++n}</td>
          <td><b>${esc(r.titulo)}</b>${r.prioridade === 'Crítica' ? ' <span class="ce-crit">crítico</span>' : ''}
            ${evid && r.evidencia ? `<br><span class="rel-miudo">${esc(r.evidencia)}</span>` : ''}
            ${docsDe(r).length ? `<br><span class="rel-miudo"><b>Documentos:</b> ${esc(docsDe(r).map(rotDoc).join(' · '))}</span>` : ''}
            ${sit ? `<br><span class="rel-miudo">Status no sistema: ${esc(r.status)}</span>` : ''}</td>
          <td>${esc(codigosDe(r, c).join(', '))}</td>
          <td class="ce-box"><span></span></td><td class="ce-box"><span></span></td><td class="ce-box"><span></span></td><td></td></tr>`).join('')}`).join('')
        || '<tr><td colspan="7" class="rel-vazio">Nenhum requisito.</td></tr>'}
      </tbody></table>
      <p class="rel-nota">C = conforme · NC = não conforme · NA = não se aplica. Requisito crítico não conforme pede ação corretiva imediata.</p>
      <div class="ce-pap-campos ce-pap-fim"><div><span>Não conformidades encontradas</span><i></i></div><div><span>Prazo das ações corretivas</span><i></i></div></div>` });
}

function docListaDocs(lista) {
  const porCat = agrupar(lista, d => d.categoria);
  return documento({ titulo: 'Lista mestra', paisagem: true, subtitulo: `Controle de documentos e registros · ${ativas().map(c => c.id).join(' · ')}`,
    canto: `${lista.length} documento(s)`,
    corpo: `<table class="rel-tabela"><thead><tr><th>Código</th><th>Documento</th><th>Rev.</th><th>Data</th><th>Periodicidade</th><th>Responsável</th><th>Códigos nas normas</th><th>Situação</th></tr></thead><tbody>
      ${porCat.map(([cat, ds]) => `<tr class="rel-grupo"><td colspan="8">${esc(cat)} · ${ds.length}</td></tr>
        ${ds.map(d => `<tr><td>${codigoLink(d, 'rel-link')}</td><td>${esc(d.nome)}</td><td>${esc(d.revisao || '')}</td><td>${d.data_revisao ? br(d.data_revisao) : ''}</td>
          <td>${esc(d.periodicidade || '')}</td><td>${esc(d.responsavel || '')}</td>
          <td class="rel-miudo">${esc(codTexto(codigosDoDoc(d)))}</td>
          <td class="${sitDoc(d) === 'Em dia' && !docAtrasado(d) ? 'rel-ok' : foraDeUso(d) ? '' : 'rel-pend'}">${esc(sitDoc(d))}${docAtrasado(d) ? ' · revisão vencida' : ''}</td></tr>`).join('')}`).join('')
        || '<tr><td colspan="8" class="rel-vazio">Nenhum documento.</td></tr>'}
      </tbody></table>` });
}

function docMes(ano, mes, itens) {
  return documento({ titulo: 'Calendário da certificação', subtitulo: `${MESES[mes]} de ${ano}${S.cal.cert ? ' · ' + (certPorId(S.cal.cert)?.nome || '') : ''}`,
    canto: `${itens.length} item(ns)`, paisagem: true,
    corpo: `${gradeMes(ano, mes, itens, false)}
      ${itens.length ? `<div class="rel-secao">No mês</div><table class="rel-tabela"><thead><tr><th>Data</th><th>O quê</th><th>Tipo</th><th>Certificação</th><th>Responsável</th><th>Feito</th></tr></thead><tbody>
        ${itens.map(i => `<tr><td>${br(i.data)}</td><td>${esc(i.titulo)}</td><td>${esc(i.tipo)}</td><td>${esc((i.certs || []).join(', '))}</td><td>${esc(i.resp || '')}</td>
          <td class="${i.feito ? 'rel-ok' : ''}">${i.feito ? 'Sim' : ''}</td></tr>`).join('')}</tbody></table>` : ''}` });
}

function docAnual(ano, cert, linhas) {
  return documento({ titulo: 'Cronograma anual da certificação', paisagem: true,
    subtitulo: `${ano} · ${cert ? certPorId(cert)?.nome : ativas().map(c => c.nome).join(' · ')}`, canto: `${linhas.length} atividade(s)`,
    corpo: `<table class="rel-tabela ce-anual-papel"><thead><tr><th>Atividade</th><th>Tipo</th><th>Responsável</th>${MES3.map(m => `<th class="rel-num">${m}</th>`).join('')}</tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${esc(l.titulo)}</td><td>${esc(l.tipo)}</td><td>${esc(l.resp || '')}</td>
        ${l.meses.map(m => `<td class="rel-num">${m.map(o => o.feito ? '<b class="rel-ok">✓</b>' : '<b class="rel-pend">●</b>').join('')}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="15" class="rel-vazio">Nada no ano.</td></tr>`}
      </tbody></table>
      <p class="rel-nota">● previsto · ✓ feito. Requisito periódico sem data aparece sem mês marcado, para lembrar de agendar.</p>` });
}

function docPainel(prox, atrasados, criticos) {
  return documento({ titulo: 'Painel da certificação', subtitulo: ativas().map(c => c.nome).join(' · '), canto: '',
    corpo: `<table class="rel-tabela"><thead><tr><th>Certificação</th><th>Versão</th><th class="rel-num">Conformes</th><th class="rel-num">%</th><th class="rel-num">Críticos em aberto</th><th>Próxima auditoria</th><th>Validade</th></tr></thead><tbody>
        ${ativas().map(c => { const p = placar(c); return `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(c.versao || '')}</td><td class="rel-num">${p.conf}/${p.total}</td>
          <td class="rel-num">${p.pct}%</td><td class="rel-num ${p.criticos ? 'rel-pend' : 'rel-ok'}">${p.criticos}</td><td>${br(c.proxima_auditoria)}</td><td>${br(c.validade)}</td></tr>`; }).join('')}
      </tbody></table>
      <div class="rel-secao">Próximos 60 dias</div>
      <table class="rel-tabela"><thead><tr><th>Data</th><th>O quê</th><th>Tipo</th><th>Responsável</th></tr></thead><tbody>
        ${prox.map(i => `<tr><td>${br(i.data)}</td><td>${esc(i.titulo)}</td><td>${esc(i.tipo)}</td><td>${esc(i.resp || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="rel-vazio">Nada marcado.</td></tr>'}
      </tbody></table>
      ${atrasados.length ? `<div class="rel-secao">Atrasados</div><table class="rel-tabela"><thead><tr><th>Data</th><th>O quê</th><th>Tipo</th><th>Responsável</th></tr></thead><tbody>
        ${atrasados.map(i => `<tr><td class="rel-pend">${br(i.data)}</td><td>${esc(i.titulo)}</td><td>${esc(i.tipo)}</td><td>${esc(i.resp || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="rel-secao">Requisitos críticos em aberto</div>
      <table class="rel-tabela"><thead><tr><th>Requisito</th><th>Códigos</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
        ${criticos.map(r => `<tr><td>${esc(r.titulo)}</td><td>${esc(refTexto(r, null))}</td><td>${esc(r.responsavel || '')}</td><td class="rel-pend">${esc(r.status)}</td></tr>`).join('')
          || '<tr><td colspan="4" class="rel-vazio">Nenhum.</td></tr>'}
      </tbody></table>` });
}

function agrupar(lista, fn) {
  const m = new Map();
  lista.forEach(x => { const k = fn(x) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

/* ---------------- Excel ---------------- */
async function exportarReq(lista) {
  const cs = ativas();
  try {
    await baixarXlsx(`Requisitos_certificacao_${hoje()}`, [{
      nome: 'Requisitos', titulo: 'Requisitos da certificação · SAKUMA', subtitulo: `Emitido em ${br(hoje())}`,
      colunas: [{ rot: 'Tema', larg: 18 }, { rot: 'Requisito', larg: 50 }, ...cs.map(c => ({ rot: c.nome, larg: 18 })),
        { rot: 'Documentos', larg: 22 }, { rot: 'Prioridade', larg: 10 }, { rot: 'Status', larg: 13 }, { rot: 'Responsável', larg: 18 }, { rot: 'Prazo', tipo: 'data', larg: 11 },
        { rot: 'Periodicidade', larg: 13 }, { rot: 'O que pede', larg: 60 }, { rot: 'Evidência esperada', larg: 60 }, { rot: 'Observação', larg: 40 }],
      linhas: lista.map(r => [r.tema, r.titulo, ...cs.map(c => codigosDe(r, c).join(', ')), docsDe(r).map(d => d.codigo).join(', '), r.prioridade, r.status, r.responsavel || '',
        r.prazo || '', r.periodicidade || '', r.descricao || '', r.evidencia || '', r.observacao || '']),
    }]);
  } catch (e) { alert('Não consegui gerar o Excel: ' + (e.message || e)); }
}

async function exportarDocs(lista) {
  try {
    await baixarXlsx(`Lista_mestra_${hoje()}`, [{
      nome: 'Lista mestra', titulo: 'Lista mestra · SAKUMA', subtitulo: `Emitido em ${br(hoje())}`,
      colunas: [{ rot: 'Código', larg: 10 }, { rot: 'Documento', larg: 55 }, { rot: 'Categoria', larg: 15 }, { rot: 'Periodicidade', larg: 13 },
        { rot: 'Responsável', larg: 18 }, { rot: 'Revisão', larg: 8 }, { rot: 'Data da revisão', tipo: 'data', larg: 12 },
        { rot: 'Próxima revisão', tipo: 'data', larg: 12 }, { rot: 'Códigos nas normas', larg: 40 }, { rot: 'Requisitos ligados', tipo: 'num', casas: 0, larg: 10 }, { rot: 'Link OneDrive', larg: 40 }, { rot: 'Situação', larg: 10 }, { rot: 'Certificações', larg: 18 }, { rot: 'Observação', larg: 40 }],
      linhas: lista.map(d => [d.codigo, d.nome, d.categoria, d.periodicidade || '', d.responsavel || '', d.revisao || '', d.data_revisao || '',
        proximaDoc(d) || '', codTexto(codigosDoDoc(d)), reqsDoDoc(d).length, d.link || '', sitDoc(d), (d.certificacoes || []).join(', '), d.observacao || '']),
    }]);
  } catch (e) { alert('Não consegui gerar o Excel: ' + (e.message || e)); }
}

async function exportarAnual(ano, linhas) {
  try {
    await baixarXlsx(`Cronograma_certificacao_${ano}`, [{
      nome: String(ano), titulo: `Cronograma anual da certificação · ${ano}`, subtitulo: `Emitido em ${br(hoje())} · P = previsto, F = feito`,
      colunas: [{ rot: 'Atividade', larg: 45 }, { rot: 'Tipo', larg: 18 }, { rot: 'Responsável', larg: 16 }, ...MES3.map(m => ({ rot: m, larg: 6 }))],
      linhas: linhas.map(l => [l.titulo, l.tipo, l.resp || '', ...l.meses.map(m => m.map(o => o.feito ? 'F' : 'P').join(' '))]),
    }]);
  } catch (e) { alert('Não consegui gerar o Excel: ' + (e.message || e)); }
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_CERT = ['cePainel', 'cePendencias', 'ceRequisitos', 'ceDocumentos', 'ceCalendario', 'ceAnual', 'ceCertificacoes'];
const DESENHO = {
  cePainel: desenharPainel, cePendencias: desenharPendencias, ceRequisitos: desenharRequisitos, ceDocumentos: desenharDocumentos,
  ceCalendario: desenharCalendario, ceAnual: desenharAnual, ceCertificacoes: desenharCertificacoes,
};
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }

/* Modo auditor (etapa 4, 29/10/2026 — claude/cert-redesenho-lean.md): uma chave
   no alto da Certificação. Ligada, as mesmas telas ficam só de leitura (somem
   novo, editar, gravar, apagar e anexar — css .modo-auditor) e aparece a faixa
   marrom. Fica guardada neste aparelho. Quem protege os dados continua sendo o RLS. */
const CHAVE_AUD = 'gr.cert.auditor';
let auditor = (() => { try { return localStorage.getItem(CHAVE_AUD) === '1'; } catch { return false; } })();
export const auditorLigado = () => auditor;
function pintarChaveAuditor() {
  const nav = $('navModulos');
  if (!nav || !nav.querySelector('.aba[data-modulo="cert"]')) return;
  let b = $('ceAudChave');
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.id = 'ceAudChave'; b.className = 'aba aba-config ce-aud-chave';
    b.addEventListener('click', () => {
      auditor = !auditor;
      try { localStorage.setItem(CHAVE_AUD, auditor ? '1' : '0'); } catch {}
      document.body.classList.toggle('modo-auditor', auditor);
      pintarChaveAuditor();
    });
    nav.appendChild(b);
  }
  b.setAttribute('aria-pressed', String(auditor));
  b.title = auditor ? 'Sair do modo auditor' : 'Mostrar as telas só para leitura, para o auditor';
  b.innerHTML = `${svgIcone('escudo')}<span>${auditor ? 'Modo auditor · sair' : 'Modo auditor'}</span>`;
}
aoMudarGrupo(id => { if (id === 'cert') { pintarChaveAuditor(); document.body.classList.toggle('modo-auditor', auditor); } });

/* Porta aberta ou fechada na faixa de cima enquanto a entrada está na tela:
   redesenha a entrada (lista da porta ou as três portas). */
let ultimaPorta = null;
aoMudarGrupo((id, g, t) => {
  if (id !== 'cert' || telaAtual !== 'cePainel' || t !== 'cePainel' || !S.carregado) return;
  const porta = PORTAS.some(p => p.g === g) ? g : null;
  if (porta === ultimaPorta) return;
  ultimaPorta = porta;
  desenharPainel();
});

export async function abrirCertificacao(tela) {
  const alvo = $(idTela(tela));
  if (!alvo) return;
  telaAtual = tela;
  if (!S.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando a certificação…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a certificação: ${esc(e.message || e)}</div></div>`; return; }
  }
  if (telaAtual === tela) redesenhar();
}

export function limparCertificacao() {
  S.carregado = false; S.certs = []; S.reqs = []; S.docs = []; S.evs = []; S.vinc = []; S.evid = []; S.viva = {}; S.docArq = []; S.docComArq = new Set();
  nucleo.apagarCaixa(CAIXA);
  Object.assign(S.fr, { q: '', cert: '', tema: '', prior: '', status: '', doc: '' });
  Object.assign(S.fd, { q: '', cat: '', per: '', sit: '', resp: '', modo: '', tipo: '', sel: null, q2: '' });
  Object.assign(S.cal, { ano: 0, mes: 0, cert: '', auto: true });
  Object.assign(S.anual, { ano: 0, cert: '', docs: false });
  telaAtual = ''; fechar();
}

/* Para testes. */
export const _ce = { S, placar, proximaDoc, ocorrencias, itensEntre, linhasAnual, atende, emUso };
