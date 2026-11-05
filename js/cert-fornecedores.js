// cert-fornecedores.js — Certificação › Fornecedores: avaliação de fornecedores (FORM 023), 26/10/2026.
//
// Pedido do Guilherme: "o form 23 conseguimos fazer uma aba no app". Segue o
// POP 021 (Fornecedores): cada entrega/visita é avaliada com as perguntas do
// FORM 023 (SIM/NÃO); a cada 4 entregas o fornecedor recebe a nota:
//   APROVADO (NOTA 10) — todas conformes · APROVADO (NOTA 8) — uma não conforme ·
//   REPROVADO — duas ou mais não conformes (buscar outro fornecedor).
// As 5 partes do FORM viram 5 categorias, cada uma com as suas perguntas.
// Tabela cfo_avaliacoes (supabase/cert-fornecedores.sql), trancada por
// app_pode('cert'). Histórico 2024–2026 importado do FORM 023 preenchido.
// Evidências: link do OneDrive (evid_url) e/ou arquivos no Drive em
// certificacao/evidencia/f23-<id>/…  Sem internet: só consulta.
//
// 05/11/2026 — CL 07 e AN 20 (supabase/cert-fornecedores-cl07.sql). Pedido do Guilherme:
// "altere essa avaliação de fornecedores, obrigatório 1 vez ou renovação de contrato! PCMSO, PGR.
// An 20 será vinculado ao Form 23. Ao criar um novo fornecedor uma pasta será criada dentro do An 20
// com o nome do fornecedor!"
//  · O CL 07 (Check List Auto Auditoria de Fornecedores, planilha com uma aba por tipo) virou a
//    qualificação documental do cadastro: obrigatória uma vez (no cadastro) e de novo só na renovação
//    do contrato. PCMSO e PGR entram em todos os modelos (SIM / NÃO / N.A.).
//  · Os tipos do CL 07 sem parte no FORM 023 (laboratório, medicina do trabalho…) viraram categorias
//    do cadastro: têm só o CL 07, sem avaliação por entrega.
//  · Fornecedor novo → o banco pede a pasta 3 - ANEXOS\AN 20 - …\<NOME> (onedrive_pastas) e o
//    computador do escritório a cria em até 5 min. O que for posto na pasta conta como evidência do AN 20.
//
// 05/11/2026 (tarde) — CL 07 igual à planilha (supabase/cert-fornecedores-categorias.sql). Pedidos dele:
// "faça igual a planilha… tem abas em baixo e cada fornecedor tem seus itens", "deixando mais lean, mais
// fácil", "se criarmos por categoria, tipo as abas, vc já vincula os itens… e quando eu for add um novo
// fornecedor vinculo ele à categoria" e "sou obrigado a fazer essa avaliação anualmente e quando renova o
// contrato, então já deixe padronizado isso para todos".
//  · Categorias = abas, na tabela cfo_categorias, com os itens do CL 07 e as perguntas do FORM 023
//    (editáveis em Cadastros). PCMSO, PGR e trabalho infantil entram em todas.
//  · Tela foCl07: a planilha — itens nas linhas, fornecedores da aba nas colunas, abas embaixo; um toque
//    grava. No celular, um fornecedor por vez. O CL 07 vale 12 meses ou até o fim do contrato.
//  · Painel em cartões: um cartão por fornecedor com documentação, validade, entregas e o próximo passo.

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { campoAnexos, donosComArquivo, pastaNoOneDrive, abrirPastaNoPc } from './arquivos.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const semAc = s => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const FORM = { codigo: 'FORM 023', titulo: 'Avaliação de fornecedores', data: '01/12/2026', nrev: '02',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };

/* As 5 partes do FORM 023, com as perguntas de cada uma (SIM/NÃO). */
/* Padrão (usado só até a tabela cfo_categorias chegar; a fonte é o banco). */
const CATS_PADRAO = [
  { id: 'viveiro', nome: 'Viveiro de mudas', forn: 'Viveiro', lote: true, nf: true,
    itens: [['nf', 'Nota fiscal'], ['defensivos', 'Declaração dos defensivos aplicados']] },
  { id: 'pragas', nome: 'Empresa de controle de pragas domissanitárias', forn: 'Empresa',
    itens: [['frequencia', 'Frequência combinada?'], ['relatorio', 'Entrega de relatório'], ['fispq', 'FISPQs dos produtos utilizados']] },
  { id: 'caixa_agua', nome: 'Empresa de limpeza de caixa d’água', forn: 'Empresa',
    itens: [['frequencia', 'Frequência combinada?'], ['relatorio', 'Entrega de relatório'], ['fispq', 'FISPQs dos produtos utilizados']] },
  { id: 'colheita', nome: 'Subcontratado da colheita', forn: 'Subcontratado',
    itens: [['pop01', 'Funcionários conhecem a higiene na colheita (POP 01)?'], ['pop06', 'Funcionários conhecem a higiene pessoal (POP 06)?'],
      ['ficha', 'Funcionários conhecem o produto (ficha técnica Hass Cat 1 e Cat 2)?'], ['produto', 'Produto final conforme a ficha técnica Hass Cat 1 e Cat 2?']] },
  { id: 'packing', nome: 'Packing house', forn: 'Packing house', nf: true, rotNf: 'NF de remessa',
    itens: [['manuseio', 'Cumpre os requisitos de manuseio das frutas no packing house?']] },
  /* 05/11/2026: tipos do CL 07 sem parte no FORM 023 — só a qualificação documental (CL 07). */
  { id: 'insumos', nome: 'Insumos (defensivos e fertilizantes)', forn: 'Fornecedor', itens: [] },
  { id: 'laboratorio', nome: 'Laboratório de análise de água', forn: 'Laboratório', itens: [] },
  { id: 'seg_trabalho', nome: 'Segurança do trabalho', forn: 'Empresa', itens: [] },
  { id: 'med_trabalho', nome: 'Medicina do trabalho', forn: 'Empresa', itens: [] },
  { id: 'calib_balanca', nome: 'Calibração de balanças', forn: 'Empresa', itens: [] },
  { id: 'calib_compressor', nome: 'Calibração de compressores', forn: 'Empresa', itens: [] },
  { id: 'consultoria', nome: 'Consultoria', forn: 'Empresa', itens: [] },
  { id: 'manutencao', nome: 'Manutenção terceirizada', forn: 'Empresa', itens: [] },
  { id: 'residuos', nome: 'Retirada de resíduos', forn: 'Empresa', itens: [] },
];

/* ---------------- CL 07 — Check List Auto Auditoria de Fornecedores de Produtos e Serviços ----------------
   Uma aba da planilha por tipo de fornecedor. Cada item: [chave, texto, conforme quando a resposta é NÃO?].
   Os textos seguem a planilha (ortografia corrigida); PGRTR/PGSSMATR atualizados para PGR e PCMSO. */
const CL07 = { codigo: 'CL 07', titulo: 'Check List Auto Auditoria de Fornecedores de Produtos e Serviços', revisao: '02',
  elaborado: 'Fernando', aprovado: 'Elcio', aprovado_em: '15/01/2026' };
const C7_INFANTIL = ['infantil', 'Existe uso de mão de obra / trabalho infantil na empresa?', true];
const C7_PCMSO_PGR = [['pcmso', 'Apresentou o PCMSO — Programa de Controle Médico de Saúde Ocupacional (NR 7)'],
  ['pgr', 'Apresentou o PGR — Programa de Gerenciamento de Riscos (NR 1 / PGRTR da NR 31)']];
const C7_BASE = {
  viveiro: [['cpf_cnpj', 'CPF ou CNPJ'], ['car', 'CAR'], ['bpa', 'Declaração de Boas Práticas Agrícolas'], ['ogm', 'Declaração de Não Organismo Geneticamente Modificado (OGM)'],
    ['escravo', 'Declaração de Não Exploração de Trabalho Infantil ou Análogo a Escravo'], ['resp_tec', 'Responsável técnico'], ['auto_aud', 'Auto-auditoria de campo (anual)'],
    ['globalgap', 'Certificado GLOBALG.A.P.'], ['espec_mp', 'Especificação da matéria-prima'], ['nf', 'Emite nota fiscal'], ['cert_pragas', 'Certificado de controle de pragas'], ['recomendado', 'É recomendado por outras empresas']],
  pragas: [['alvara_sanit', 'Alvará sanitário'], ['alvara_cnpj', 'Alvará de funcionamento e CNPJ'], ['art', 'Anotação de responsabilidade técnica (ART)'], ['residuos_dest', 'Documento de destinação correta dos resíduos'],
    ['aso', 'ASO dos técnicos'], ['trein_quim', 'Registro de treinamento dos técnicos em manipulação de produtos químicos e controle de pragas'], ['fispq', 'Ficha técnica dos produtos químicos utilizados (FISPQ/FDS)'],
    ['calendario', 'Calendário de visitas (cronograma)'], ['mapa_iscas', 'Mapeamento de iscas e armadilhas luminosas'], ['os', 'Relatório de atividades executadas (ordem de serviço)'],
    ['monit', 'Registro de monitoramento das armadilhas e porta-iscas'], ['recomendado', 'É recomendado por outras empresas']],
  caixa_agua: [['alvara_sanit', 'Alvará sanitário'], ['alvara_cnpj', 'Alvará de funcionamento e CNPJ'], ['art', 'Anotação de responsabilidade técnica (ART)'],
    ['trein_altura', 'Registro de treinamento dos técnicos em trabalho em altura e espaço confinado'], ['fispq', 'Ficha técnica dos produtos químicos utilizados (FISPQ/FDS)'],
    ['calendario', 'Calendário de visitas (cronograma)'], ['os', 'Relatório de atividades executadas (ordem de serviço)'], ['recomendado', 'É recomendado por outras empresas']],
  laboratorio: [['alvara_sanit', 'Alvará sanitário'], ['alvara_cnpj', 'Alvará de funcionamento e CNPJ'], ['iso17025', 'O laboratório é acreditado pela ISO/IEC 17025'],
    ['metodologia', 'Apresenta a metodologia de análise adotada, reconhecida, ou a menciona no certificado de análise'], ['art', 'Anotação de responsabilidade técnica (ART)'],
    ['orcamento', 'Responde rápido ao pedido de orçamento'], ['resultados', 'Os resultados das análises são claros'], ['prazos', 'Atende aos prazos de resultados'],
    ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado e recomendado por clientes']],
  seg_trabalho: [['cnpj', 'A empresa possui CNPJ regularizado'], ['prof_mte', 'O profissional é capacitado para as atividades técnicas (laudos, programas, treinamentos e perícias) e tem registro no Ministério do Trabalho e Emprego'],
    ['hist4', 'Histórico de mais de 4 anos em assessoria e consultoria em segurança do trabalho'], ['palestras', 'Ministra palestras e treinamentos técnicos com emissão legal de certificados'],
    ['elabora_pgr', 'A empresa elabora o PGR (PGRTR – NR 31) e o PCMSO'], ['auditorias', 'Realiza auditorias e treinamentos de segurança em atendimento às NR'],
    ['cronograma', 'Tem cronograma de trabalho pertinente ao atendimento às NR'], ['relatorios', 'Emite relatório técnico de cada visita, esclarecendo os trabalhos realizados'],
    ['incendio', 'Ministra treinamento de prevenção e combate a incêndio e primeiros socorros (teórico e prático), atendendo ao Corpo de Bombeiros'], ['recomendado', 'É qualificado ou recomendado por clientes']],
  med_trabalho: [['cnpj', 'A empresa possui CNPJ regularizado'], ['alvara_mun', 'Possui alvará municipal e sanitário para atendimento em sua clínica'], ['contrato_social', 'A empresa possui contrato social'],
    ['hist4', 'Histórico de mais de 4 anos em assessoria e consultoria em medicina do trabalho'],
    ['prof_crm', 'Os profissionais são capacitados (laudos, programas, treinamentos, exames e perícias) e têm registro nos órgãos de medicina'],
    ['palestras', 'Ministra palestras e treinamentos técnicos com emissão legal de certificados'], ['elabora_pcmso', 'A empresa elabora o PCMSO (NR 7) da SAKUMA, integrado ao PGR (PGRTR – NR 31)'],
    ['pericias', 'Realiza perícias médicas em medicina do trabalho'], ['exames_compl', 'Realiza exames complementares além dos exames clínicos'],
    ['venc_exames', 'Controla o vencimento dos exames clínicos e complementares'], ['absenteismo', 'Quando solicitado, faz o controle de absenteísmo e a contestação de atestados médicos'],
    ['recomendado', 'É qualificado ou recomendado por clientes']],
  calib_balanca: [['alvara_sanit', 'Alvará sanitário'], ['alvara_cnpj', 'Alvará de funcionamento e CNPJ'], ['rbc', 'Certificado RBC ou ISO 17025'],
    ['padroes', 'Certificados de calibração dos padrões rastreáveis usados para calibrar os dispositivos da empresa'], ['prontidao', 'Atende com prontidão os serviços assim que solicitado'],
    ['atendimento', 'Possui bom atendimento com clientes (dúvidas, solicitação de documento)'], ['dados_cert', 'O certificado de calibração contém todos os dados pertinentes'],
    ['prazo_cert', 'Entrega o certificado no prazo solicitado'], ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado e recomendado por clientes']],
  calib_compressor: [['alvara_sanit', 'Alvará sanitário'], ['alvara_cnpj', 'Alvará de funcionamento e CNPJ'], ['rbc', 'Certificado RBC'],
    ['padroes', 'Certificados de calibração dos padrões rastreáveis usados para calibrar os dispositivos da empresa'], ['prontidao', 'Atende com prontidão os serviços assim que solicitado'],
    ['atendimento', 'Possui bom atendimento com clientes (dúvidas, solicitação de documento)'], ['dados_cert', 'O certificado de calibração contém todos os dados pertinentes'],
    ['prazo_cert', 'Entrega o certificado no prazo solicitado'], ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado e recomendado por clientes']],
  consultoria: [['alvara', 'Possui alvará de funcionamento'], ['formacao', 'Formação e certificados'], ['relatorio', 'Relatório de atividades em todas as visitas'], ['prazos', 'Atende os prazos solicitados'],
    ['atas', 'Treinamentos e reuniões registrados em atas'], ['cert_trein', 'Emite certificado dos treinamentos'], ['prontidao', 'Atende com prontidão os serviços assim que solicitado'],
    ['atendimento', 'Possui bom atendimento com clientes (dúvidas e solicitação de documentos)'], ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado e recomendado por clientes']],
  manutencao: [['alvara', 'Possui alvará de funcionamento'], ['cnpj', 'CNPJ'], ['cert_resp', 'O responsável pela manutenção possui certificado'],
    ['prazo', 'Realiza o serviço no prazo e atende prontamente assim que solicitado'], ['qualidade', 'O serviço é bem feito, sem o problema voltar logo depois'],
    ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado ou recomendado por clientes']],
  residuos: [['alvara', 'Possui alvará de funcionamento'], ['cnpj', 'CNPJ'], ['nf', 'Nota fiscal'], ['autorizacao', 'Possui autorização para a retirada do resíduo'], ['mtr', 'Emissão do MTR'],
    ['horarios', 'Os horários de retirada são respeitados'], ['problemas', 'Qualquer problema no serviço é prontamente resolvido'], ['historico', 'Apresenta bom histórico de fornecimento'], ['recomendado', 'É qualificado ou recomendado por clientes']],
  packing: [['alvara', 'Possui alvará de funcionamento'], ['globalgap', 'Tem certificação GLOBALG.A.P. (IFA GFS v6) e GRASP (v2)'], ['aud_interna', 'Auditoria interna GLOBALG.A.P. (IFA GFS v6) e GRASP (v2)'],
    ['relatorio', 'Relatório de atividades de todos os beneficiamentos'], ['etiquetas', 'Etiquetas conforme normas vigentes, incluindo o GGN'], ['prontidao', 'Atende com prontidão os serviços assim que solicitado'],
    ['atendimento', 'Possui bom atendimento com clientes (dúvidas e solicitação de documentos)'], ['historico', 'Apresenta bom histórico de fornecimento'], ['normas_trab', 'Normas trabalhistas atendidas']],
  insumos: [['alvara', 'Possui alvará de funcionamento'], ['validade', 'Produtos comprados no prazo de validade'], ['fispq', 'Produtos possuem FISPQ/FDS'], ['metais', 'Adubos possuem certificado de metais pesados'],
    ['fispq_fert', 'Fertilizantes possuem FISPQ/FDS'], ['nf', 'Produtos entregues com nota fiscal'], ['atendimento', 'Possui bom atendimento com clientes (dúvidas e solicitação de documentos)'],
    ['historico', 'Apresenta bom histórico de fornecimento'], ['normas_trab', 'Normas trabalhistas atendidas']],
  colheita: [['treinamentos', 'Funcionários possuem treinamentos (higiene, saúde e segurança, primeiros socorros, altura e colheita, GLOBALG.A.P., GRASP)'],
    ['grasp_rep', 'Possui representação GRASP'], ['ouvidoria', 'Possui canal de ouvidoria'], ['docs_trab', 'Possui contrato de trabalho, ASO em dia, holerites, folha de ponto e ficha de EPI'],
    ['onibus', 'Ônibus em estado adequado e documentação em dia'], ['material', 'Material de colheita higienizado'], ['normas_internas', 'Segue as normas internas da empresa']],
};
/* Categorias (abas): do banco (cfo_categorias), com o padrão acima enquanto não carregou. */
const catDeLinha = r => ({ id: r.id, nome: r.nome, ordem: r.ordem ?? 100, forn: r.forn || 'Fornecedor', lote: !!r.lote, nf: !!r.nf, rotNf: r.rot_nf || undefined,
  itens: Array.isArray(r.f23_itens) ? r.f23_itens : [], cl07: Array.isArray(r.cl07_itens) ? r.cl07_itens : [], ativo: r.ativo !== false });
const cats = () => (F.cats?.length ? F.cats : CATS_PADRAO.map((c, i) => ({ ...c, ordem: (i + 1) * 10, cl07: C7_BASE[c.id] || [], ativo: true })))
  .slice().sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || a.nome.localeCompare(b.nome, 'pt-BR'));
const catsAtivas = () => cats().filter(c => c.ativo);
const catsF23 = () => cats().filter(c => c.itens.length);   /* as partes do FORM 023 (avaliação por entrega) */
const C7_FIXOS = () => [...C7_PCMSO_PGR, C7_INFANTIL];
/** Itens do CL 07 de uma categoria: os da aba + PCMSO e PGR + trabalho infantil. */
const itensCl07 = catId => [...(cat(catId)?.cl07 || []), ...C7_FIXOS()];
/** Lista do CL 07 do fornecedor: a que foi usada quando ficou pronto; senão a atual da categoria. */
const listaDe = f => (f.cl07_data && Array.isArray(f.cl07_lista) && f.cl07_lista.length ? f.cl07_lista : itensCl07(f.categoria));
const okItem = (it, v) => v === 'NA' || (it[2] ? v === 'N' : v === 'S');
/** O CL 07 vale 12 meses ou até o fim do contrato, o que vier primeiro (05/11/2026). */
function validade(f) {
  if (!f.cl07_data) return null;
  const anual = maisMeses(String(f.cl07_data).slice(0, 10), 12), contr = f.contrato_fim ? String(f.contrato_fim).slice(0, 10) : null;
  return contr && contr < anual ? contr : anual;
}
/** Situação do CL 07: todo ano e na renovação do contrato. */
function cl07De(f) {
  if (!f.ativo) return null;
  if (!f.cl07_data) { const fe = feitos(f); return { rot: fe ? `CL 07 em andamento (${fe}/${listaDe(f).length})` : 'CL 07 pendente', cor: 'perigo', nivel: 2 }; }
  const v = validade(f), d = diasAte(v), porContrato = f.contrato_fim && String(f.contrato_fim).slice(0, 10) === v;
  if (d < 0) return { rot: porContrato ? 'Contrato vencido — renovar e refazer o CL 07' : 'CL 07 vencido (anual) — refazer', cor: 'perigo', nivel: 2 };
  if (f.cl07_qualificado === false) return { rot: 'CL 07: não qualificado', cor: 'perigo', nivel: 2 };
  if (d <= 30) return { rot: `${porContrato ? 'Contrato vence' : 'CL 07 vence'} ${d ? 'em ' + d + ' d' : 'hoje'}`, cor: 'alerta', nivel: 1 };
  return { rot: 'CL 07 em dia', cor: 'ativo', nivel: 0 };
}
const cat = id => cats().find(c => c.id === id);
const JANELA = 4;   /* POP 021: monitorar a cada 4 entregas */

/* ---------------- estado ---------------- */
const F = { carregado: false, regs: [], forn: [], cats: [], arq: new Set(), fc: '', fq: '', pastas: [], an20: [], aba: '', fsel: '', catEd: '', pf: '', ultAprov: '' };
const CAIXA = 'fornecedores.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { regs: F.regs, forn: F.forn, cats: F.cats, pastas: F.pastas, an20: F.an20 });

/* Periodicidade da avaliação (cadastro do fornecedor, 26/10/2026): pedido dele
   "cadastrar o fornecedor e o tempo de avaliação, mensal, trimestral e etc, para
   alertar". Próxima = última avaliação + período; alerta vencida e até 15 dias. */
const PERIODOS = { 'Mensal': 1, 'Bimestral': 2, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada entrega': 0, 'Renovação de contrato': 0 };
const AVISO_DIAS = 15;
const maisMeses = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const diasAte = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5);
const avalsDe = f => F.regs.filter(r => r.categoria === f.categoria && semAc(r.fornecedor) === semAc(f.nome));
function agenda(f) {
  const l = avalsDe(f).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ultima = l[0]?.data || null, meses = PERIODOS[f.periodicidade] ?? 12;
  const proxima = meses && ultima ? maisMeses(ultima, meses) : null;
  let st = { rot: 'Em dia', cor: 'ativo', nivel: 0 };
  if (!f.ativo) st = { rot: 'Inativo', cor: 'neutra', nivel: 0 };
  else if (!cat(f.categoria)?.itens.length) st = { rot: 'Só CL 07', cor: 'neutra', nivel: 0 };   /* sem avaliação por entrega */
  else if (!meses) st = { rot: f.periodicidade === 'Renovação de contrato' ? 'Na renovação' : 'A cada entrega', cor: 'neutra', nivel: 0 };
  else if (!ultima) st = { rot: 'Nunca avaliado', cor: 'perigo', nivel: 2 };
  else { const d = diasAte(proxima); st = d < 0 ? { rot: `Vencida há ${-d} d`, cor: 'perigo', nivel: 2 } : d <= AVISO_DIAS ? { rot: d ? `Vence em ${d} d` : 'Vence hoje', cor: 'alerta', nivel: 1 } : { rot: 'Em dia', cor: 'ativo', nivel: 0 }; }
  let cert = null;
  if (f.ativo && f.cert_validade) { const d = diasAte(f.cert_validade); cert = d < 0 ? { rot: `Certificado vencido há ${-d} d`, cor: 'perigo', nivel: 2 } : d <= 30 ? { rot: `Certificado vence em ${d} d`, cor: 'alerta', nivel: 1 } : null; }
  return { l, ultima, proxima, st, cert, sit: l.length ? situacao(l) : null, c7: cl07De(f) };
}
/** Alertas para o painel (e para quem quiser mostrar em outro lugar). */
export function alertasFornecedores() {
  return F.forn.filter(f => f.ativo).flatMap(f => { const a = agenda(f); return [a.st.nivel ? { f, a, txt: a.st.rot, cor: a.st.cor, nivel: a.st.nivel } : null, a.cert ? { f, a, txt: a.cert.rot, cor: a.cert.cor, nivel: a.cert.nivel } : null,
    a.c7?.nivel ? { f, a, txt: a.c7.rot, cor: a.c7.cor, nivel: a.c7.nivel, cl07: true } : null].filter(Boolean); })
    .sort((x, y) => y.nivel - x.nivel);
}

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !F.carregado) { F.regs = c0.regs || []; F.forn = c0.forn || []; F.cats = c0.cats || []; F.pastas = c0.pastas || []; F.an20 = c0.an20 || []; F.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (F.carregado) return;
    throw new Error('Sem internet e sem cópia da avaliação de fornecedores neste aparelho.');
  }
  const [r, fo, ca] = await Promise.all([c.from('cfo_avaliacoes').select('*').order('data', { ascending: false }), c.from('cfo_fornecedores').select('*').order('nome'),
    c.from('cfo_categorias').select('*').order('ordem')]);
  if (!ca.error) F.cats = (ca.data || []).map(catDeLinha);
  if (r.error) {
    if (F.carregado) return;
    if (/cfo_|relation|does not exist|schema cache/i.test(r.error.message || '')) throw new Error('A tabela da avaliação de fornecedores ainda não foi criada no banco (supabase/cert-fornecedores.sql).');
    throw r.error;
  }
  F.regs = r.data || []; F.forn = fo.error ? F.forn : fo.data || []; F.carregado = true;
  F.ultAprov = F.forn.filter(f => f.cl07_aprovador && f.cl07_data).sort((a, b) => String(b.cl07_data).localeCompare(String(a.cl07_data)))[0]?.cl07_aprovador || F.ultAprov;
  /* pastas dos fornecedores no AN 20 (05/11/2026): criadas? quantos arquivos? */
  const [pa, ar] = await Promise.all([c.from('onedrive_pastas').select('rel, feito_em'),
    c.from('arquivos').select('origem, nome, data_arquivo').eq('area', 'certificacao').eq('tipo', 'documento').like('origem', 'onedrive:3 - ANEXOS/AN 20%')]);
  if (!pa.error) F.pastas = pa.data || [];
  if (!ar.error) F.an20 = ar.data || [];
  salvarCaixa();
  F.arq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}

/* ---------------- as contas (POP 021) ---------------- */
const chaveForn = r => r.categoria + '|' + semAc(r.fornecedor);
/** Situação de um fornecedor nas últimas 4 avaliações. */
function situacao(lista) {
  const ult = lista.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, JANELA);
  const nc = ult.filter(r => !r.conforme).length;
  return { ult, nc, nota: nc === 0 ? 10 : nc === 1 ? 8 : 0, rot: nc === 0 ? 'Aprovado · nota 10' : nc === 1 ? 'Aprovado · nota 8' : 'Reprovado', cor: nc === 0 ? 'ativo' : nc === 1 ? 'alerta' : 'perigo' };
}
function porFornecedor() {
  const m = new Map();
  for (const r of F.regs) { const k = chaveForn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.values()].map(l => { const s = situacao(l); return { c: cat(l[0].categoria), nome: l[0].fornecedor, n: l.length, ultima: s.ult[0]?.data, s }; })
    .sort((a, b) => cats().findIndex(c => c.id === a.c?.id) - cats().findIndex(c => c.id === b.c?.id) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
/** Conforme = todas as perguntas com SIM. */
const tudoSim = (c, itens) => c.itens.every(([k]) => itens[k] === true);

/* ---------------- peças ---------------- */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const simNao = v => v === true ? '<span class="cfo-sim">SIM</span>' : v === false ? '<span class="cfo-nao">NÃO</span>' : '—';
const linksDe = r => (Array.isArray(r.evid_links) && r.evid_links.length ? r.evid_links : r.evid_url ? [{ rot: 'Evidência', url: r.evid_url }] : []);
const evid = r => [...linksDe(r).map(x => `<a class="ce-link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.rot || 'Evidência')}</a>`), F.arq.has('f23-' + r.id) ? '📎' : ''].filter(Boolean).join('<br>') || '—';
function dialogo(html, ligar) {
  let d = $('dlgFo');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgFo'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgFo')?.open && $('dlgFo').close();
const erroDlg = t => { const e = $('foErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgFo')) $('dlgFo').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · PAINEL (situação de cada fornecedor)
   =================================================================== */
/* ===================================================================
   CL 07 IGUAL À PLANILHA — uma aba por categoria, fornecedores lado a lado (05/11/2026)
   Pedido do Guilherme: "faça igual a planilha… tem abas em baixo e cada fornecedor tem seus itens"
   e "sou obrigado a fazer essa avaliação anualmente e quando renova o contrato".
   Um toque marca SIM / NÃO / N.A. e grava na hora. Ao responder o último item, o CL 07 fica
   concluído com a data do dia e vale 12 meses ou até o fim do contrato (o que vier primeiro).
   =================================================================== */
const ehCelular = () => window.matchMedia('(max-width: 760px)').matches;
const respostas = f => f.cl07_itens || {};
const feitos = f => listaDe(f).filter(([k]) => respostas(f)[k]).length;
const ncDe = f => listaDe(f).filter(it => respostas(f)[it[0]] && !okItem(it, respostas(f)[it[0]])).length;
const fornDaAba = id => F.forn.filter(f => f.categoria === id && f.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const pendAba = id => fornDaAba(id).filter(f => (cl07De(f)?.nivel || 0) >= 2).length;

/** Grava uma ou mais colunas do fornecedor (otimista: a tela já mudou). */
async function gravarForn(f, extra) {
  if (precisaRede()) throw new Error('sem internet');
  const { data, error } = await estado.cliente.from('cfo_fornecedores').update(extra).eq('id', f.id).select().single();
  if (error) throw error;
  const i = F.forn.findIndex(x => x.id === data.id); if (i >= 0) F.forn[i] = data;
  salvarCaixa(); return data;
}
/** Marca um item; fecha o CL 07 quando é o último. */
async function marcarItem(f, k, v) {
  const r = { ...respostas(f), [k]: respostas(f)[k] === v ? null : v };
  if (r[k] === null) delete r[k];
  const lista = listaDe(f), extra = { cl07_itens: r };
  const completo = lista.every(([kk]) => r[kk]);
  const nc = lista.filter(it => r[it[0]] && !okItem(it, r[it[0]])).length;
  if (completo) {
    if (!f.cl07_data) { extra.cl07_data = hoje(); extra.cl07_lista = lista; if (!f.cl07_aprovador && F.ultAprov) extra.cl07_aprovador = F.ultAprov; }
    extra.cl07_qualificado = nc === 0;
  } else if (f.cl07_data && !f.cl07_lista) extra.cl07_lista = lista;
  Object.assign(f, extra);   /* tela já reflete */
  try { await gravarForn(f, extra); } catch (e) { alert('Não consegui gravar: ' + (e.message || e)); await carregar().catch(() => {}); }
  redesenhar();
}
/** Novo CL 07 (anual ou renovação de contrato): guarda o atual no histórico e zera. */
async function novoCl07(f) {
  const venceuContrato = f.contrato_fim && diasAte(f.contrato_fim) <= 30;
  let fim = f.contrato_fim || null;
  if (venceuContrato || confirm(`Começar um CL 07 novo para ${f.nome}?\nO atual (${br(f.cl07_data)}) vai para o histórico.`)) {
    if (venceuContrato) {
      const nova = prompt(`Renovação de contrato de ${f.nome}.\nNovo contrato válido até (dd/mm/aaaa)? Deixe vazio se não tiver data.`, '');
      if (nova === null) return;
      const m = so(nova).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (so(nova) && !m) return alert('Data no formato dd/mm/aaaa.');
      fim = m ? `${m[3]}-${doisD(m[2])}-${doisD(m[1])}` : null;
    }
  } else return;
  const hist = Array.isArray(f.cl07_hist) ? f.cl07_hist : [];
  const h = f.cl07_data ? [{ data: f.cl07_data, qualificado: f.cl07_qualificado, itens: f.cl07_itens, lista: f.cl07_lista, comentario: f.cl07_comentario, aprovador: f.cl07_aprovador, contrato_fim: f.contrato_fim }, ...hist] : hist;
  try { await gravarForn(f, { cl07_hist: h, cl07_data: null, cl07_itens: {}, cl07_lista: null, cl07_qualificado: null, cl07_comentario: null, contrato_fim: fim }); }
  catch (e) { return alert('Não consegui: ' + (e.message || e)); }
  redesenhar();
}
async function editarCampo(f, campo) {
  if (campo === 'contrato') {
    const atual = f.contrato_fim ? br(f.contrato_fim) : '';
    const nova = prompt(`Contrato de ${f.nome} válido até (dd/mm/aaaa)? Vazio = sem data.`, atual);
    if (nova === null) return;
    const m = so(nova).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (so(nova) && !m) return alert('Data no formato dd/mm/aaaa.');
    return gravarForn(f, { contrato_fim: m ? `${m[3]}-${doisD(m[2])}-${doisD(m[1])}` : null }).then(redesenhar).catch(e => alert('Não consegui: ' + (e.message || e)));
  }
  if (campo === 'comentario') {
    const t = prompt(`Comentário do CL 07 de ${f.nome}:`, f.cl07_comentario || '');
    if (t === null) return;
    return gravarForn(f, { cl07_comentario: so(t) || null }).then(redesenhar).catch(e => alert('Não consegui: ' + (e.message || e)));
  }
  if (campo === 'aprovador') {
    const t = prompt(`Aprovado por (CL 07 de ${f.nome}):`, f.cl07_aprovador || F.ultAprov || '');
    if (t === null) return;
    F.ultAprov = so(t) || F.ultAprov;
    return gravarForn(f, { cl07_aprovador: so(t) || null }).then(redesenhar).catch(e => alert('Não consegui: ' + (e.message || e)));
  }
  if (campo === 'qualificado') {
    if (!f.cl07_data) return;
    const q = !f.cl07_qualificado;
    if (!q && !f.cl07_comentario) { const t = prompt('Por que não qualificado? (comentário obrigatório)', ''); if (!so(t)) return; f.cl07_comentario = so(t); }
    return gravarForn(f, { cl07_qualificado: q, cl07_comentario: f.cl07_comentario || null }).then(redesenhar).catch(e => alert('Não consegui: ' + (e.message || e)));
  }
}
/** Abre a aba do fornecedor no CL 07 (e no celular, o próprio fornecedor). */
function irCl07(f) {
  if (!f) return;
  F.aba = f.categoria; F.fsel = f.id;
  abrirModulo('cert', 'foCl07');
}
const sn = (f, k, v, dentro) => `<span class="fo2-sn${dentro ? ' grande' : ''}">${[['S', 'SIM'], ['N', 'NÃO'], ['NA', 'N.A.']].map(([x, rot]) =>
  `<button type="button" class="${v === x ? 'on-' + x : ''}" data-m="${esc(f.id)}|${esc(k)}|${x}">${rot}</button>`).join('')}</span>`;
function rodapeColuna(f) {
  const c7 = cl07De(f), n = listaDe(f).length, fe = feitos(f), nc = ncDe(f);
  const sit = !f.cl07_data ? tag(fe ? `Faltam ${n - fe}${nc ? ' · ' + nc + ' NÃO' : ''}` : 'Não iniciado', fe ? 'alerta' : 'perigo')
    : `<button type="button" class="fo2-link" data-e="${esc(f.id)}|qualificado" title="Tocar para mudar">${tag(f.cl07_qualificado ? 'SIM · qualificado' : 'NÃO qualificado', f.cl07_qualificado ? 'ativo' : 'perigo')}</button>`;
  return { sit, c7, n, fe, nc };
}
function desenharCl07() {
  const tela = $('telaFoCl07');
  const abas = catsAtivas();
  if (!abas.some(c => c.id === F.aba)) F.aba = (abas.find(c => pendAba(c.id)) || abas.find(c => fornDaAba(c.id).length) || abas[0])?.id;
  const c = cat(F.aba), L = fornDaAba(F.aba);
  const barraAbas = `<nav class="fo2-abas">${abas.map(a => { const p = pendAba(a.id); return `<button type="button" class="${a.id === F.aba ? 'on' : ''}" data-aba="${a.id}">${esc(curto(a))}${p ? `<em>${p}</em>` : ''}</button>`; }).join('')}</nav>`;
  const topo = `<div class="barra entre" style="margin:0;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0">${CL07.codigo} · Auto auditoria de fornecedores</h2>
      <p class="dica" style="margin:2px 0 0">Uma aba por categoria. Toque em SIM, NÃO ou N.A. — grava na hora. Vale <b>12 meses</b> ou até a <b>renovação do contrato</b>, o que vier primeiro.</p></div>
      <div class="barra" style="margin:0;gap:8px"><button class="btn" type="button" id="c7ImpAba">Imprimir aba</button><button class="btn principal" type="button" id="c7NovoF">+ Fornecedor nesta aba</button></div></div>`;
  let corpo;
  if (!c) corpo = '<div class="vazio">Nenhuma categoria ativa. Crie em Cadastros.</div>';
  else if (!L.length) corpo = `<div class="vazio" style="margin:16px 0">Nenhum fornecedor ativo em <b>${esc(c.nome)}</b>. Toque em “+ Fornecedor nesta aba”.<br><small>Itens pedidos nesta aba: ${itensCl07(c.id).length}.</small></div>`;
  else if (ehCelular()) corpo = celularCl07(c, L);
  else {
    /* linhas = itens atuais da aba + itens que ficaram em CL 07 já feitos e saíram da aba */
    const linhas = itensCl07(c.id).slice();
    L.forEach(f => listaDe(f).forEach(it => { if (!linhas.some(x => x[0] === it[0])) linhas.push([...it.slice(0, 2), it[2], 'antigo']); }));
    corpo = `<div class="ac-rola fo2-folha"><table class="dc-planilha fo2-tab"><thead><tr><th class="fo2-req">Requisito <small>(${esc(c.nome)})</small></th>
      ${L.map(f => { const r = rodapeColuna(f); return `<th class="fo2-col"><b>${esc(f.nome)}</b><br><button type="button" class="fo2-link" data-e="${esc(f.id)}|contrato">${f.contrato_fim ? 'contrato até ' + br(f.contrato_fim) : '+ data do contrato'}</button>
        ${r.c7 && r.c7.nivel ? `<br>${tag(r.c7.rot, r.c7.cor)}` : ''}</th>`; }).join('')}</tr></thead><tbody>
      ${linhas.map(([k, rot, neg, antigo], i) => `<tr${antigo ? ' class="fo2-antigo"' : ''}><td class="fo2-req">${i + 1}. ${esc(rot)}${neg ? ' <small class="dica">(conforme = NÃO)</small>' : ''}${antigo ? ' <small class="dica">(saiu da aba)</small>' : ''}</td>
        ${L.map(f => { const tem = listaDe(f).some(x => x[0] === k); const v = respostas(f)[k];
          return `<td class="ce${v && tem && !okItem([k, rot, neg], v) ? ' fo2-nc' : ''}">${tem ? sn(f, k, v) : '<small class="dica">no próximo CL 07</small>'}</td>`; }).join('')}</tr>`).join('')}
      <tr class="fo2-tot"><td>Fornecedor qualificado?</td>${L.map(f => `<td class="ce">${rodapeColuna(f).sit}</td>`).join('')}</tr>
      <tr class="fo2-tot2"><td>Data · vale até</td>${L.map(f => `<td class="ce">${f.cl07_data ? br(f.cl07_data) + ' · ' + br(validade(f)) : '—'}</td>`).join('')}</tr>
      <tr class="fo2-tot2"><td>Aprovado por</td>${L.map(f => `<td class="ce"><button type="button" class="fo2-link" data-e="${esc(f.id)}|aprovador">${esc(f.cl07_aprovador || '+ quem aprovou')}</button></td>`).join('')}</tr>
      <tr class="fo2-tot2"><td>Comentário</td>${L.map(f => `<td class="ce"><button type="button" class="fo2-link" data-e="${esc(f.id)}|comentario">${esc(f.cl07_comentario || (ncDe(f) ? '+ obrigatório (tem NÃO)' : '+ comentário'))}</button></td>`).join('')}</tr>
      <tr class="fo2-tot2"><td></td>${L.map(f => `<td class="ce" style="white-space:nowrap">${botoesForn(f)}</td>`).join('')}</tr>
      </tbody></table></div>`;
  }
  tela.innerHTML = `<div class="cartao naoimprimir fo2-cartao">${topo}${corpo}</div>${barraAbas}`;
  ligarCl07(tela, c);
}
const curto = c => ({ viveiro: 'Viveiro', pragas: 'Pragas', caixa_agua: 'Caixa d’água', colheita: 'Colheita', packing: 'Packing', insumos: 'Insumos', laboratorio: 'Laboratório',
  seg_trabalho: 'Seg. trabalho', med_trabalho: 'Med. trabalho', calib_balanca: 'Balanças', calib_compressor: 'Compressores', consultoria: 'Consultoria', manutencao: 'Manutenção', residuos: 'Resíduos' })[c.id] || c.nome;
function botoesForn(f) {
  const c7 = cl07De(f);
  return `${f.cl07_data && c7 && c7.nivel ? `<button class="btn mini principal" type="button" data-novo="${esc(f.id)}">↻ Novo CL 07</button> ` : ''}<button class="btn mini" type="button" data-imp="${esc(f.id)}">Imprimir</button>${f.pasta_od ? ` <button class="btn mini" type="button" data-pasta="${esc(f.id)}">📁 AN 20</button>` : ''}`;
}
function celularCl07(c, L) {
  if (!L.some(f => f.id === F.fsel)) F.fsel = (L.find(f => (cl07De(f)?.nivel || 0) >= 2) || L[0]).id;
  const f = L.find(x => x.id === F.fsel), lista = listaDe(f), r = rodapeColuna(f);
  return `<div class="fo2-chips">${L.map(x => `<button type="button" class="${x.id === f.id ? 'on' : ''}" data-fsel="${esc(x.id)}">${esc(x.nome)}</button>`).join('')}</div>
    <div class="barra entre" style="margin:10px 0 4px"><small class="dica">${r.fe} de ${r.n} respondidos</small><small class="dica">${r.nc} NÃO</small></div>
    <div class="fo2-prog"><i style="width:${Math.round(r.fe / r.n * 100)}%"></i></div>
    <p class="dica" style="margin:8px 0 0"><button type="button" class="fo2-link" data-e="${esc(f.id)}|contrato">${f.contrato_fim ? 'Contrato até ' + br(f.contrato_fim) : '+ data do contrato'}</button>${f.cl07_data ? ' · CL 07 de ' + br(f.cl07_data) + ', vale até ' + br(validade(f)) : ''}</p>
    ${lista.map(([k, rot, neg], i) => `<div class="fo2-q${respostas(f)[k] && !okItem([k, rot, neg], respostas(f)[k]) ? ' fo2-nc' : ''}"><p>${i + 1}. ${esc(rot)}${neg ? ' <small class="dica">(conforme = NÃO)</small>' : ''}</p>${sn(f, k, respostas(f)[k], true)}</div>`).join('')}
    <div class="fo2-q"><p><b>Fornecedor qualificado?</b></p>${r.sit}
      <p style="margin:10px 0 0"><button type="button" class="fo2-link" data-e="${esc(f.id)}|aprovador">${esc(f.cl07_aprovador || '+ quem aprovou')}</button> ·
        <button type="button" class="fo2-link" data-e="${esc(f.id)}|comentario">${esc(f.cl07_comentario || (r.nc ? '+ comentário (obrigatório)' : '+ comentário'))}</button></p>
      <div style="margin-top:10px">${botoesForn(f)}</div></div>
    ${r.fe < r.n ? `<div class="fo2-fim"><button class="btn" type="button" data-tudosim="${esc(f.id)}">Tudo SIM no resto</button></div>` : ''}`;
}
function ligarCl07(tela, c) {
  tela.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => { F.aba = b.dataset.aba; F.fsel = ''; desenharCl07(); window.scrollTo(0, 0); }));
  tela.querySelectorAll('[data-fsel]').forEach(b => b.addEventListener('click', () => { F.fsel = b.dataset.fsel; desenharCl07(); }));
  tela.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { const [id, k, v] = b.dataset.m.split('|'); marcarItem(F.forn.find(x => x.id === id), k, v); }));
  tela.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => { const [id, campo] = b.dataset.e.split('|'); editarCampo(F.forn.find(x => x.id === id), campo); }));
  tela.querySelectorAll('[data-novo]').forEach(b => b.addEventListener('click', () => novoCl07(F.forn.find(x => x.id === b.dataset.novo))));
  tela.querySelectorAll('[data-imp]').forEach(b => b.addEventListener('click', () => mostrar(docCl07(F.forn.find(x => x.id === b.dataset.imp)), { barra: true })));
  tela.querySelectorAll('[data-tudosim]').forEach(b => b.addEventListener('click', async () => {
    const f = F.forn.find(x => x.id === b.dataset.tudosim);
    const faltam = listaDe(f).filter(([k]) => !respostas(f)[k]);
    if (!confirm(`Marcar os ${faltam.length} itens que faltam como conformes?`)) return;
    const r = { ...respostas(f) }; faltam.forEach(([k, , neg]) => { r[k] = neg ? 'N' : 'S'; });
    const nc = listaDe(f).filter(it => !okItem(it, r[it[0]])).length;
    const extra = { cl07_itens: r, cl07_qualificado: nc === 0, ...(f.cl07_data ? {} : { cl07_data: hoje(), cl07_lista: listaDe(f), ...(f.cl07_aprovador || !F.ultAprov ? {} : { cl07_aprovador: F.ultAprov }) }) };
    try { await gravarForn(f, extra); } catch (e) { alert('Não consegui: ' + (e.message || e)); }
    redesenhar();
  }));
  ligarPastas(tela);
  $('c7NovoF')?.addEventListener('click', () => formForn(null, c?.id));
  $('c7ImpAba')?.addEventListener('click', () => { const L = fornDaAba(F.aba); if (!L.length) return alert('Nenhum fornecedor nesta aba.'); mostrar(L.map(docCl07).join(''), { barra: true }); });
}

/* ===================================================================
   CATEGORIAS (as abas) E SEUS ITENS — editáveis (05/11/2026)
   Mudar um item vale a partir do próximo CL 07; os já feitos guardam a lista que usaram.
   =================================================================== */
const chaveNova = (txt, l) => { let k = semAc(txt).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'item'; const b = k; let i = 2; while (l.some(x => x[0] === k)) k = b + '_' + i++; return k; };
async function gravarCat(c, extra) {
  if (precisaRede()) return false;
  const { data, error } = await estado.cliente.from('cfo_categorias').update(extra).eq('id', c.id).select().single();
  if (error) { alert('Não consegui gravar a categoria: ' + error.message); return false; }
  const i = F.cats.findIndex(x => x.id === c.id); if (i >= 0) F.cats[i] = catDeLinha(data);
  salvarCaixa(); return true;
}
function htmlCategorias() {
  const lista = cats();
  if (!lista.some(c => c.id === F.catEd)) F.catEd = lista[0]?.id;
  const c = cat(F.catEd);
  const nForn = id => F.forn.filter(f => f.categoria === id && f.ativo).length;
  const ed = (campo, l, titulo, dica) => `<div class="fo2-itens"><b>${titulo}</b> <small class="dica">${dica}</small>
    <ol>${l.map(([k, rot, neg], i) => `<li><span>${esc(rot)}${neg ? ' <small class="dica">(conforme = NÃO)</small>' : ''}</span>
      <span class="fo2-ed"><button type="button" title="Subir" data-it="${campo}|${i}|sobe"${i ? '' : ' disabled'}>↑</button><button type="button" title="Descer" data-it="${campo}|${i}|desce"${i < l.length - 1 ? '' : ' disabled'}>↓</button><button type="button" title="Mudar o texto" data-it="${campo}|${i}|texto">✎</button><button type="button" title="Tirar" data-it="${campo}|${i}|tira">✕</button></span></li>`).join('')}
      ${campo === 'cl07_itens' ? C7_FIXOS().map(([, rot]) => `<li class="fo2-fixo"><span>${esc(rot)}</span><small>todas</small></li>`).join('') : ''}</ol>
    <button type="button" class="fo2-link" data-it="${campo}|-1|novo">+ Adicionar ${campo === 'cl07_itens' ? 'item' : 'pergunta'}</button></div>`;
  return `<div class="cartao naoimprimir"><div class="barra entre" style="margin:0"><div><h2 style="margin:0">Categorias e itens</h2>
      <p class="dica" style="margin:2px 0 0">Cada categoria é uma aba do CL 07. Os itens pedidos ficam presos à categoria: fornecedor novo só escolhe a categoria. Mudança vale a partir do próximo CL 07.</p></div></div>
    <div class="fo2-cats">
      <div class="fo2-catlista">${lista.map(x => `<button type="button" class="${x.id === F.catEd ? 'on' : ''}${x.ativo ? '' : ' fo2-inat'}" data-cat="${x.id}"><span>${esc(x.nome)}</span><small>${nForn(x.id)}</small></button>`).join('')}
        <button type="button" class="fo2-link" id="catNova" style="padding:8px 10px">+ Nova categoria</button></div>
      ${c ? `<div><div class="barra entre" style="margin:0 0 8px"><b style="font-size:15px">${esc(c.nome)}</b>
          <span><button class="btn mini" type="button" id="catNome">Renomear</button> <button class="btn mini" type="button" id="catAtivo">${c.ativo ? 'Desativar' : 'Reativar'}</button></span></div>
        ${ed('cl07_itens', c.cl07, 'Itens pedidos no CL 07', `${itensCl07(c.id).length} no total`)}
        ${ed('f23_itens', c.itens, 'Avaliação por entrega (FORM 023)', c.itens.length ? 'perguntas SIM/NÃO a cada entrega' : 'sem perguntas: esta categoria tem só o CL 07')}</div>` : ''}
    </div></div>`;
}
function ligarCategorias(tela) {
  tela.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { F.catEd = b.dataset.cat; desenharCadastro(); }));
  const c = cat(F.catEd);
  $('catNova')?.addEventListener('click', async () => {
    const nome = so(prompt('Nome da nova categoria (aba do CL 07):', '') || '');
    if (!nome || precisaRede()) return;
    const id = chaveNova(nome, cats().map(x => [x.id]));
    const ordem = Math.max(0, ...cats().map(x => x.ordem || 0)) + 10;
    const { data, error } = await estado.cliente.from('cfo_categorias').insert({ id, nome, ordem, forn: 'Empresa', cl07_itens: [], f23_itens: [] }).select().single();
    if (error) return alert('Não consegui criar: ' + error.message);
    F.cats.push(catDeLinha(data)); F.catEd = id; salvarCaixa(); desenharCadastro();
  });
  $('catNome')?.addEventListener('click', async () => { const n = so(prompt('Novo nome da categoria:', c.nome) || ''); if (n && await gravarCat(c, { nome: n })) desenharCadastro(); });
  $('catAtivo')?.addEventListener('click', async () => {
    if (c.ativo && F.forn.some(f => f.categoria === c.id && f.ativo) && !confirm('Há fornecedores ativos nesta categoria. Desativar mesmo assim? (a aba some do CL 07)')) return;
    if (await gravarCat(c, { ativo: !c.ativo })) desenharCadastro();
  });
  tela.querySelectorAll('[data-it]').forEach(b => b.addEventListener('click', async () => {
    const [campo, si, acao] = b.dataset.it.split('|'), i = Number(si);
    const l = (campo === 'cl07_itens' ? c.cl07 : c.itens).map(x => x.slice());
    if (acao === 'sobe') [l[i - 1], l[i]] = [l[i], l[i - 1]];
    else if (acao === 'desce') [l[i + 1], l[i]] = [l[i], l[i + 1]];
    else if (acao === 'tira') { if (!confirm(`Tirar “${l[i][1]}”?\nOs CL 07 já feitos continuam com ele; sai a partir do próximo.`)) return; l.splice(i, 1); }
    else if (acao === 'texto') { const t = so(prompt('Texto do item:', l[i][1]) || ''); if (!t) return; l[i][1] = t; }
    else if (acao === 'novo') { const t = so(prompt(campo === 'cl07_itens' ? 'Novo item pedido nesta categoria:' : 'Nova pergunta da avaliação por entrega:', '') || ''); if (!t) return;
      const all = [...c.cl07, ...c.itens, ...C7_FIXOS()]; l.push([chaveNova(t, all), t]); }
    if (await gravarCat(c, { [campo]: l })) desenharCadastro();
  }));
}

/* ===================================================================
   PAINEL EM CARTÕES (05/11/2026) — tudo de cada fornecedor num cartão
   =================================================================== */
function desenharPainel() {
  const tela = $('telaFoPainel');
  const ativos = F.forn.filter(f => f.ativo);
  const linhas = ativos.map(f => { const a = agenda(f), c = cat(f.categoria), c7 = a.c7;
    const nivel = Math.max(c7?.nivel || 0, c?.itens.length ? a.st.nivel : 0, a.cert?.nivel || 0, a.sit?.nc >= 2 ? 2 : 0);
    return { f, a, c, c7, nivel }; }).sort((x, y) => y.nivel - x.nivel || x.f.nome.localeCompare(y.f.nome, 'pt-BR'));
  const n = { ok: linhas.filter(x => x.f.cl07_data && x.f.cl07_qualificado && (x.c7?.nivel || 0) < 2).length,
    pend: linhas.filter(x => (x.c7?.nivel || 0) >= 2).length,
    vence: linhas.filter(x => x.c7?.nivel === 1).length,
    rep: linhas.filter(x => x.f.cl07_qualificado === false || (x.a.sit && x.a.sit.nc >= 2)).length };
  const filtro = F.pf || 'todos';
  const usadas = catsAtivas().filter(c => linhas.some(x => x.f.categoria === c.id));
  const vis = linhas.filter(x => filtro === 'todos' || (filtro === 'acao' ? x.nivel > 0 : x.f.categoria === filtro));
  const cartao = ({ f, a, c, c7, nivel }) => {
    const tot = listaDe(f).length, fe = feitos(f), nc = ncDe(f);
    const pior = [c7?.nivel ? c7 : null, c?.itens.length && a.st.nivel ? a.st : null, a.cert].filter(Boolean).sort((x, y) => (y.nivel || 0) - (x.nivel || 0))[0];
    const stag = pior ? tag(pior.rot, pior.cor) : tag('Em dia', 'ativo');
    const ent = c?.itens.length ? `<div class="fo2-ent">Últimas entregas ${[0, 1, 2, 3].map(i => { const r = a.sit?.ult[3 - i]; return r ? `<i class="${r.conforme ? '' : 'n'}" title="${br(r.data)}">${r.conforme ? '✓' : '✗'}</i>` : '<i class="v"></i>'; }).join('')} ${a.sit ? tag('Nota ' + (a.sit.nota || '0'), a.sit.cor) : '<small class="dica">nenhuma ainda</small>'}</div>`
      : '<div class="fo2-ent"><small class="dica">Só documentação — sem avaliação por entrega</small></div>';
    const precisaCl07 = (c7?.nivel || 0) >= 2 || !f.cl07_data;
    const principal = precisaCl07 ? `<button class="btn principal" type="button" data-c7="${esc(f.id)}">${f.cl07_data ? '↻ Refazer CL 07' : feitos(f) ? 'Continuar CL 07' : 'Preencher CL 07'}</button>`
      : c?.itens.length ? `<button class="btn principal" type="button" data-avaliar="${esc(f.id)}">Avaliar entrega</button>` : '';
    return `<div class="fo2-card n${nivel}">
      <div class="fo2-ct"><b>${esc(f.nome)}</b>${stag}</div><span class="dica">${esc(c?.nome || f.categoria)}</span>
      <div class="fo2-barra"><i style="width:${tot ? Math.round(fe / tot * 100) : 0}%${nc ? ';background:#E8B100' : ''}"></i></div>
      <div class="fo2-lin"><span>Documentação ${fe} de ${tot}${fe === tot && !nc ? ' ✓' : nc ? ` · ${nc} NÃO` : ''}</span><span>${f.cl07_data ? 'CL 07 vale até ' + br(validade(f)) : f.contrato_fim ? 'Contrato até ' + br(f.contrato_fim) : 'Contrato —'}</span></div>
      ${ent}
      <div class="fo2-bt">${principal}${precisaCl07 ? '' : `<button class="btn" type="button" data-c7="${esc(f.id)}">CL 07</button>`}${f.pasta_od ? `<button class="btn" type="button" data-pasta="${esc(f.id)}">📁 AN 20</button>` : ''}</div></div>`;
  };
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0;flex-wrap:wrap;gap:8px"><div><h2 style="margin:0">Fornecedores</h2>
      <p class="dica" style="margin:2px 0 0">Documentação (${CL07.codigo}) todo ano e na renovação do contrato · entregas (${FORM.codigo}, POP 021) · pasta no AN 20.</p></div>
      <div class="barra" style="margin:0;gap:8px"><button class="btn" type="button" id="foAbas">${CL07.codigo} (abas)</button><button class="btn principal" type="button" id="foNovoF">+ Novo fornecedor</button></div></div>
    <div class="pv-cards" style="margin-top:12px">
      <div class="pv-card pv-ok"><span>Qualificados</span><strong>${n.ok}</strong><small>CL 07 em dia</small></div>
      <div class="pv-card pv-perigo"><span>CL 07 pendente</span><strong>${n.pend}</strong><small>nunca feito ou vencido</small></div>
      <div class="pv-card pv-alerta"><span>Vence em 30 dias</span><strong>${n.vence}</strong><small>anual ou contrato</small></div>
      <div class="pv-card pv-calma"><span>Reprovados</span><strong>${n.rep}</strong><small>CL 07 ou entregas</small></div>
    </div>
    <div class="fo2-chips" style="margin-top:12px"><button type="button" class="${filtro === 'todos' ? 'on' : ''}" data-pf="todos">Todos ${linhas.length}</button>
      <button type="button" class="${filtro === 'acao' ? 'on' : ''}" data-pf="acao">Precisa de ação ${linhas.filter(x => x.nivel > 0).length}</button>
      ${usadas.map(c => `<button type="button" class="${filtro === c.id ? 'on' : ''}" data-pf="${c.id}">${esc(curto(c))}</button>`).join('')}</div>
    ${vis.length ? `<div class="fo2-cards">${vis.map(cartao).join('')}</div>` : '<div class="vazio" style="margin-top:12px">Nenhum fornecedor aqui.</div>'}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="foImp">Imprimir FORM 023</button>
    <button class="btn" type="button" id="foXlsx">Excel</button>
  </div>`;
  tela.querySelectorAll('[data-pf]').forEach(b => b.addEventListener('click', () => { F.pf = b.dataset.pf; desenharPainel(); }));
  tela.querySelectorAll('[data-avaliar]').forEach(b => b.addEventListener('click', () => { const f = F.forn.find(x => x.id === b.dataset.avaliar); formAval(null, f.categoria, f.nome); }));
  tela.querySelectorAll('[data-c7]').forEach(b => b.addEventListener('click', () => irCl07(F.forn.find(x => x.id === b.dataset.c7))));
  ligarPastas(tela);
  $('foAbas').addEventListener('click', () => abrirModulo('cert', 'foCl07'));
  $('foNovoF').addEventListener('click', () => formForn(null));
  $('foImp').addEventListener('click', () => mostrar(docForm(), { barra: true }));
  $('foXlsx').addEventListener('click', () => exportar());
}

/* ===================================================================
   TELA · AVALIAÇÕES (as tabelas do FORM 023)
   =================================================================== */
function tabCat(c, regs, edita) {
  const L = regs.filter(r => r.categoria === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const porF = new Map(); L.forEach(r => { const k = semAc(r.fornecedor); if (!porF.has(k)) porF.set(k, []); porF.get(k).push(r); });
  const sit = [...porF.values()].map(l => `${esc(l[0].fornecedor)}: ${tag(situacao(l).rot, situacao(l).cor)}`).join(' · ');
  return `<h3 class="bm-h3">${esc(c.nome)} ${sit ? `<small style="font-weight:400">— ${sit}</small>` : ''}</h3>
    ${L.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab cfo-tab"><thead><tr><th class="ce">Data</th><th>${esc(c.forn)}</th>${c.lote ? '<th>Nº lote</th>' : ''}${c.nf ? `<th>${esc(c.rotNf || 'Nota fiscal')}</th>` : ''}
      ${c.itens.map(([, r]) => `<th class="ce">${esc(r)}</th>`).join('')}<th class="ce">Conforme?</th><th>Justificativa</th><th class="ce">Evidência</th>${edita ? '<th></th>' : ''}</tr></thead><tbody>
      ${L.map(r => `<tr${r.conforme ? '' : ' class="cfo-linha-nc"'}><td class="ce">${br(r.data)}</td><td>${esc(r.fornecedor)}</td>${c.lote ? `<td>${esc(r.lote || '')}</td>` : ''}${c.nf ? `<td>${esc(r.nf || '')}</td>` : ''}
        ${c.itens.map(([k]) => `<td class="ce">${simNao((r.itens || {})[k])}</td>`).join('')}<td class="ce">${simNao(r.conforme)}</td><td>${esc(r.justificativa || '')}</td><td class="ce">${evid(r)}</td>
        ${edita ? `<td class="ce"><button class="btn mini" type="button" data-fo="${esc(r.id)}">Abrir</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Nenhuma avaliação nesta categoria.</p>'}`;
}
function desenharAval() {
  const tela = $('telaFoAvaliacoes');
  const q = semAc(F.fq);
  const regs = q ? F.regs.filter(r => semAc([r.fornecedor, r.nf, r.lote, r.justificativa].join(' ')).includes(q)) : F.regs;
  const cats = F.fc && cat(F.fc)?.itens.length ? [cat(F.fc)] : catsF23();
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Avaliações — ${FORM.codigo}</h2>
      <p class="dica" style="margin:2px 0 0">Uma linha por entrega ou visita. Conforme = todas as respostas SIM.</p></div>
      <button class="btn principal" type="button" id="foNova">+ Nova avaliação</button></div>
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Categoria <select id="foCat"><option value="">Todas</option>${catsF23().map(c => `<option value="${c.id}"${c.id === F.fc ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo" style="grid-column:span 2">Procurar <input type="search" id="foQ" value="${esc(F.fq)}" placeholder="fornecedor, NF, lote…"></label>
    </div>
    ${cats.map(c => tabCat(c, regs, true)).join('')}
  </div>`;
  $('foNova').addEventListener('click', () => formAval(null, cat(F.fc)?.itens.length ? F.fc : 'pragas'));
  $('foCat').addEventListener('change', e => { F.fc = e.target.value; desenharAval(); });
  $('foQ').addEventListener('input', e => { F.fq = e.target.value; const p = e.target.selectionStart; desenharAval(); const i = $('foQ'); i.focus(); i.setSelectionRange(p, p); });
  tela.querySelectorAll('[data-fo]').forEach(b => b.addEventListener('click', () => { const r = F.regs.find(x => x.id === b.dataset.fo); formAval(r, r.categoria); }));
}

/* ---------------- formulário ---------------- */
let anexos = null;
function formAval(r, catId, fornPre) {
  const c = cat(r ? r.categoria : catId)?.itens.length ? cat(r ? r.categoria : catId) : catsF23()[0];
  const v = r || { data: hoje(), fornecedor: fornPre || '', lote: '', nf: '', itens: {}, justificativa: '', evid_url: '', evid_links: [], observacao: '' };
  const forns = [...new Set([...F.forn.filter(x => x.categoria === c.id && x.ativo).map(x => x.nome), ...F.regs.filter(x => x.categoria === c.id).map(x => x.fornecedor)])];
  let links = linksDe(v).map(x => ({ ...x }));
  const radio = (k, val) => `<span class="cfo-sn"><label><input type="radio" name="fo_${k}" value="1" ${val === true ? 'checked' : ''}> SIM</label>
    <label><input type="radio" name="fo_${k}" value="0" ${val === false ? 'checked' : ''}> NÃO</label></span>`;
  dialogo(`<h3>${r ? 'Avaliação de ' + esc(r.fornecedor) : 'Nova avaliação'} · ${FORM.codigo}</h3>
    <div class="aviso erro" id="foErro" hidden></div>
    <div class="np-passo">1 · Quem e quando</div>
    <div class="grade">
      <label class="campo">Categoria <select id="foCatF" ${r ? 'disabled' : ''}>${catsF23().map(x => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label class="campo">Data da entrega / visita <input type="date" id="foData" value="${esc(String(v.data || '').slice(0, 10))}"></label>
      <label class="campo">${esc(c.forn)} <input type="text" id="foForn" list="foForns" value="${esc(v.fornecedor || '')}"></label>
      ${c.lote ? `<label class="campo">Nº lote <input type="text" id="foLote" value="${esc(v.lote || '')}"></label>` : ''}
      ${c.nf ? `<label class="campo">${esc(c.rotNf || 'Nota fiscal')} <input type="text" id="foNf" value="${esc(v.nf || '')}"></label>` : ''}
    </div>
    <datalist id="foForns">${forns.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <fieldset class="cp-fs"><legend>2 · Perguntas do FORM 023 <span class="dica" id="foConf"></span></legend>
      ${c.itens.map(([k, rot]) => `<div class="cfo-perg"><span>${esc(rot)}</span>${radio(k, (v.itens || {})[k])}</div>`).join('')}
    </fieldset>
    <label class="campo">Justificativa (obrigatória se alguma resposta for NÃO) <input type="text" id="foJust" value="${esc(v.justificativa || '')}"></label>
    <div class="np-passo">3 · Evidência (opcional)</div>
    <fieldset class="cp-fs"><legend>Links do OneDrive</legend><div id="foLinks"></div>
      <button class="btn mini" type="button" id="foLinkMais">＋ Link</button></fieldset>
    <div id="foAnx" style="margin-top:8px"></div>
    <label class="campo">Observação <input type="text" id="foObs" value="${esc(v.observacao || '')}"></label>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="foApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="foOk">Gravar</button></div></div>`, d => {
    anexos = campoAnexos($('foAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Evidência (arquivo)', dica: 'PDF ou foto — relatório, FISPQ, NF, declaração' });
    anexos.abrir(r ? 'f23-' + r.id : null);
    $('foCatF').addEventListener('change', e => formAval(null, e.target.value));
    const desenharLinks = () => {
      $('foLinks').innerHTML = links.map((x, i) => `<div class="cfo-link"><input type="text" data-lr="${i}" value="${esc(x.rot || '')}" placeholder="Relatório, FISPQ, NF…">
        <input type="url" data-lu="${i}" value="${esc(x.url || '')}" placeholder="https://1drv.ms/…"><button class="btn mini" type="button" data-lx="${i}" title="Tirar">✕</button>
        ${x.url ? `<a class="ce-link" href="${esc(x.url)}" target="_blank" rel="noopener">abrir</a>` : ''}</div>`).join('') || '<p class="dica" style="margin:0">Nenhum link.</p>';
      $('foLinks').querySelectorAll('[data-lr]').forEach(i => i.addEventListener('input', () => { links[i.dataset.lr].rot = i.value; }));
      $('foLinks').querySelectorAll('[data-lu]').forEach(i => i.addEventListener('input', () => { links[i.dataset.lu].url = i.value; }));
      $('foLinks').querySelectorAll('[data-lx]').forEach(b => b.addEventListener('click', () => { links.splice(Number(b.dataset.lx), 1); desenharLinks(); }));
    };
    desenharLinks();
    $('foLinkMais').addEventListener('click', () => { links.push({ rot: '', url: '' }); desenharLinks(); });
    const lerItens = () => Object.fromEntries(c.itens.map(([k]) => { const s = d.querySelector(`input[name="fo_${k}"]:checked`); return [k, s ? s.value === '1' : null]; }));
    const conta = () => { const it = lerItens(); const falta = c.itens.filter(([k]) => it[k] === null).length;
      $('foConf').textContent = falta ? `— faltam ${falta} resposta(s)` : tudoSim(c, it) ? '— CONFORME' : '— NÃO CONFORME'; };
    d.querySelectorAll('.cfo-perg input').forEach(i => i.addEventListener('change', conta)); conta();
    $('foOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const it = lerItens();
      if (c.itens.some(([k]) => it[k] === null)) return erroDlg('Responda SIM ou NÃO em todas as perguntas.');
      const linha = { categoria: c.id, data: $('foData').value, fornecedor: so($('foForn').value), lote: $('foLote') ? so($('foLote').value) || null : null,
        nf: $('foNf') ? so($('foNf').value) || null : null, itens: it, conforme: tudoSim(c, it), justificativa: so($('foJust').value) || null,
        observacao: so($('foObs').value) || null };
      const ls = links.map(x => ({ rot: so(x.rot) || 'Evidência', url: so(x.url) })).filter(x => x.url);
      if (ls.some(x => !/^https?:\/\//i.test(x.url))) return erroDlg('Os links de evidência precisam começar com https://');
      linha.evid_links = ls; linha.evid_url = ls[0]?.url || null;
      if (!linha.data) return erroDlg('Informe a data.');
      if (!linha.fornecedor) return erroDlg('Informe o fornecedor.');
      if (!linha.conforme && !linha.justificativa) return erroDlg('Escreva a justificativa da não conformidade.');
      $('foOk').disabled = true;
      try {
        const t = estado.cliente.from('cfo_avaliacoes');
        const { data, error } = r ? await t.update(linha).eq('id', r.id).select().single() : await t.insert(linha).select().single();
        if (error) throw error;
        const i = F.regs.findIndex(x => x.id === data.id); if (i >= 0) F.regs[i] = data; else F.regs.unshift(data);
        if (anexos?.mudou) { await anexos.salvar('f23-' + data.id); F.arq.add('f23-' + data.id); }
        salvarCaixa(); fechar(); redesenhar();
      } catch (e) { if ($('foOk')) $('foOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
    });
    $('foApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar esta avaliação?')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cfo_avaliacoes').delete().eq('id', r.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      F.regs = F.regs.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · CADASTRO DE FORNECEDORES (periodicidade da avaliação)
   =================================================================== */
function desenharCadastro() {
  const tela = $('telaFoCadastro');
  const ix = id => cats().findIndex(c => c.id === id);
  const L = F.forn.slice().sort((a, b) => Number(b.ativo) - Number(a.ativo) || ix(a.categoria) - ix(b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'));
  tela.innerHTML = htmlCategorias() + `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Cadastro de fornecedores</h2>
      <p class="dica" style="margin:2px 0 0">Cada fornecedor com a periodicidade da avaliação. O painel alerta quando a próxima avaliação vence ou falta ${AVISO_DIAS} dias, e quando o certificado GLOBALG.A.P. está para vencer.
        O <b>CL 07</b> (documentação, com PCMSO e PGR) vale <b>12 meses</b> ou até a <b>renovação do contrato</b>, o que vier primeiro. Cada fornecedor tem a sua pasta no <b>AN 20</b>.</p></div>
      <button class="btn principal" type="button" id="foFNovo">+ Novo fornecedor</button></div>
    ${L.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha bm-tab"><thead><tr><th>Categoria</th><th>Fornecedor</th><th>Periodicidade</th><th class="ce">Avaliações</th><th class="ce">Última</th><th class="ce">Próxima</th><th>Prazo</th><th class="ce">Certificado até</th><th>CL 07</th><th>Pasta AN 20</th><th>Contato</th><th></th></tr></thead><tbody>
      ${L.map(f => { const a = agenda(f); return `<tr${f.ativo ? '' : ' class="cfo-inativo"'}><td>${esc(cat(f.categoria)?.nome || f.categoria)}</td><td><b>${esc(f.nome)}</b>${f.ativo ? '' : ' <small class="dica">(inativo)</small>'}</td><td>${esc(f.periodicidade)}</td>
        <td class="ce">${a.l.length}</td><td class="ce">${br(a.ultima)}</td><td class="ce">${a.proxima ? br(a.proxima) : '—'}</td><td>${tag(a.st.rot, a.st.cor)}</td>
        <td class="ce">${f.cert_validade ? br(f.cert_validade) : '—'}${a.cert ? '<br>' + tag(a.cert.rot, a.cert.cor) : ''}</td>
        <td>${a.c7 ? tag(a.c7.rot, a.c7.cor) : '—'}${f.cl07_data ? `<br><small class="dica">${br(f.cl07_data)} · vale até ${br(validade(f))}</small>` : ''}</td>
        <td>${htmlPasta(f)}</td><td>${esc([f.contato, f.telefone].filter(Boolean).join(' · '))}</td>
        <td class="ce" style="white-space:nowrap"><button class="btn mini${f.ativo && !f.cl07_data ? ' principal' : ''}" type="button" data-c7="${esc(f.id)}">CL 07</button> <button class="btn mini" type="button" data-ff="${esc(f.id)}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vazio" style="margin-top:12px">Nenhum fornecedor cadastrado.</div>'}
  </div>`;
  $('foFNovo').addEventListener('click', () => formForn(null));
  tela.querySelectorAll('[data-ff]').forEach(b => b.addEventListener('click', () => formForn(F.forn.find(x => x.id === b.dataset.ff))));
  tela.querySelectorAll('[data-c7]').forEach(b => b.addEventListener('click', () => irCl07(F.forn.find(x => x.id === b.dataset.c7))));
  ligarPastas(tela);
  ligarCategorias(tela);
}
function formForn(f, catPre) {
  const v = f || { categoria: catPre || F.aba || catsAtivas()[0]?.id || 'pragas', nome: '', periodicidade: 'Trimestral', cert_validade: '', contato: '', telefone: '', email: '', servico: '', contrato_fim: '', ativo: true, observacao: '' };
  dialogo(`<h3>${f ? esc(f.nome) : 'Novo fornecedor'}</h3>
    <div class="aviso erro" id="foErro" hidden></div>
    <div class="grade">
      <label class="campo">Categoria <select id="ffCat">${cats().filter(c => c.ativo || c.id === v.categoria).map(c => `<option value="${c.id}"${c.id === v.categoria ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo">Nome <input type="text" id="ffNome" value="${esc(v.nome || '')}"></label>
      <label class="campo" id="ffPerL">Avaliar entregas <select id="ffPer">${Object.keys(PERIODOS).map(p => `<option${p === v.periodicidade ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="campo" id="ffCertL">Certificado GLOBALG.A.P. válido até <input type="date" id="ffCert" value="${esc(String(v.cert_validade || '').slice(0, 10))}"></label>
      <label class="campo">Produtos / serviços <input type="text" id="ffServ" value="${esc(v.servico || '')}"></label>
      <label class="campo">Contato (pessoa) <input type="text" id="ffCont" value="${esc(v.contato || '')}"></label>
      <label class="campo">Telefone <input type="tel" id="ffTel" value="${esc(v.telefone || '')}"></label>
      <label class="campo">E-mail <input type="email" id="ffEmail" value="${esc(v.email || '')}"></label>
      <label class="campo">Contrato válido até <input type="date" id="ffContr" value="${esc(String(v.contrato_fim || '').slice(0, 10))}"></label>
      <label class="campo rs-check" style="align-self:end"><input type="checkbox" id="ffAtivo" ${v.ativo ? 'checked' : ''}> Ativo</label>
    </div>
    <label class="campo">Observação <input type="text" id="ffObs" value="${esc(v.observacao || '')}"></label>
    <div class="aviso ok" id="ffPrev" style="margin:6px 0"></div>
    <p class="dica">“A cada entrega” e “Renovação de contrato” não geram alerta de prazo do FORM 023. O CL 07 vale 12 meses ou até o fim do contrato — o app cobra de novo sozinho. Fornecedor inativo sai dos alertas.
      ${f ? (f.pasta_od ? `Pasta no AN 20: <b>${esc(f.pasta_od.split('/').pop())}</b> (não muda se trocar o nome).` : '') : 'Ao salvar, a pasta com o nome do fornecedor é criada dentro do <b>AN 20</b> no OneDrive (em até 5 minutos) e a aba do CL 07 abre com ele.'}</p>
    <div class="barra entre"><div>${f ? '<button class="btn perigo" type="button" id="ffApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="ffOk">${f ? 'Salvar' : 'Salvar e preencher o CL 07'}</button></div></div>`, () => {
    const prev = () => { const c = cat($('ffCat').value); const n = itensCl07($('ffCat').value).length;
      $('ffPerL').hidden = $('ffCertL').hidden = !c?.itens.length;
      $('ffPrev').innerHTML = `✓ ${f ? 'Usa' : 'Vai receber'} os <b>${n} itens</b> da aba ${esc(c ? curto(c) : '')} no CL 07 (com PCMSO, PGR e trabalho infantil)${c?.itens.length ? '<br>✓ Entra na avaliação por entrega (FORM 023)' : '<br>Esta categoria tem só o CL 07 (sem avaliação por entrega)'}${f ? '' : '<br>✓ Pasta criada no AN 20'}`; };
    $('ffCat').addEventListener('change', prev); prev();
    $('ffOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const linha = { categoria: $('ffCat').value, nome: so($('ffNome').value).toUpperCase(), periodicidade: $('ffPer').value, cert_validade: $('ffCert').value || null,
        contato: so($('ffCont').value) || null, ativo: $('ffAtivo').checked, observacao: so($('ffObs').value) || null,
        servico: so($('ffServ').value) || null, telefone: so($('ffTel').value) || null, email: so($('ffEmail').value) || null, contrato_fim: $('ffContr').value || null };
      if (!linha.nome) return erroDlg('Informe o nome do fornecedor.');
      $('ffOk').disabled = true;
      try {
        const t = estado.cliente.from('cfo_fornecedores');
        const { data, error } = f ? await t.update(linha).eq('id', f.id).select().single() : await t.insert(linha).select().single();
        if (error) throw error;
        if (f && semAc(f.nome) !== semAc(linha.nome) && f.categoria === linha.categoria) {
          /* renomeou: as avaliações acompanham o nome */
          const r = await estado.cliente.from('cfo_avaliacoes').update({ fornecedor: linha.nome }).eq('categoria', f.categoria).ilike('fornecedor', f.nome).select();
          if (!r.error) r.data.forEach(x => { const i = F.regs.findIndex(y => y.id === x.id); if (i >= 0) F.regs[i] = x; });
        }
        const i = F.forn.findIndex(x => x.id === data.id); if (i >= 0) F.forn[i] = data; else F.forn.push(data);
        if (!f && data.pasta_od && !F.pastas.some(x => x.rel === data.pasta_od)) F.pastas.push({ rel: data.pasta_od, feito_em: null });
        salvarCaixa(); fechar(); redesenhar();
        if (!f) irCl07(data);   /* fornecedor novo: o CL 07 é obrigatório — já abre a aba dele */
      } catch (e) { if ($('ffOk')) $('ffOk').disabled = false; erroDlg(/duplicate|unique/i.test(String(e.message)) ? 'Esse fornecedor já está cadastrado nessa categoria.' : 'Não consegui gravar: ' + esc(e.message || e)); }
    });
    $('ffApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar o cadastro? As avaliações continuam (para tirar dos alertas, prefira desmarcar "Ativo").')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cfo_fornecedores').delete().eq('id', f.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      F.forn = F.forn.filter(x => x.id !== f.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   PASTA DO FORNECEDOR NO AN 20 (05/11/2026)
   =================================================================== */
const arqsDaPasta = f => f.pasta_od ? F.an20.filter(x => semAc(String(x.origem || '')).startsWith(semAc('onedrive:' + f.pasta_od + '/'))) : [];
function htmlPasta(f) {
  if (!f.pasta_od) return '<span class="dica">—</span>';
  const p = F.pastas.find(x => x.rel === f.pasta_od);
  const n = arqsDaPasta(f).length;
  const st = p && !p.feito_em ? '<small class="dica">criando… (até 5 min)</small>' : `<small class="dica">${n ? n + ' arquivo(s)' : 'vazia'}</small>`;
  return `<button class="ce-link" type="button" data-pasta="${esc(f.id)}" title="${esc(f.pasta_od)}">📁 Abrir</button> ${st}`;
}
function abrirPastaForn(f) {
  const p = pastaNoOneDrive(f.pasta_od + '/.');   // a própria pasta (o último pedaço é ignorado)
  const arqs = arqsDaPasta(f).sort((a, b) => String(b.data_arquivo || '').localeCompare(String(a.data_arquivo || '')));
  dialogo(`<h3>Pasta de ${esc(f.nome)} · AN 20</h3>
    <p class="dica" style="margin:0 0 10px;word-break:break-all">${esc(p.pc)}</p>
    <div class="barra" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">
      <button class="btn principal" type="button" id="foPastaPc">🖥 No computador</button>
      <a class="btn" href="${esc(p.web)}" target="_blank" rel="noopener">☁ Na nuvem</a></div>
    <p class="dica" style="margin:0 0 6px">Guarde aqui os documentos do CL 07 — CNPJ, alvará, <b>PCMSO</b>, <b>PGR</b>, contrato, certificados… Em até 1 hora eles aparecem no app e contam como evidência do AN 20.</p>
    ${arqs.length ? `<ul class="cfo-arqs">${arqs.map(x => `<li>${esc(x.nome)} <small class="dica">${br(x.data_arquivo)}</small></li>`).join('')}</ul>` : '<p class="dica">Nenhum arquivo na pasta ainda.</p>'}
    <p class="dica" id="foPastaMsg"></p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button></div>`, () => {
    $('foPastaPc').addEventListener('click', async () => { await abrirPastaNoPc(p.pc); $('foPastaMsg').textContent = 'Abrindo no Explorador… Se não abriu, o caminho já está copiado.'; });
  });
}
function ligarPastas(el) {
  el.querySelectorAll('[data-pasta]').forEach(b => b.addEventListener('click', () => abrirPastaForn(F.forn.find(x => x.id === b.dataset.pasta))));
}

/* ===================================================================
   CL 07 — QUALIFICAÇÃO DOCUMENTAL (uma vez e na renovação do contrato)
   =================================================================== */
/** CL 07 impresso, no formato da planilha (SIM / NÃO / N.A.). */
function docCl07(f) {
  const itens = listaDe(f), r = f.cl07_itens || {};
  const x = (k, v) => r[k] === v ? 'X' : '';
  return `<article class="rel">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(CL07.titulo)}</h1><p>${esc(cat(f.categoria)?.nome || '')} · POP 021 — Fornecedores</p></div>
      <div class="rel-comp"><span>${CL07.codigo}</span><strong>${f.cl07_data ? br(f.cl07_data) : '—'}</strong><span>Rev. ${CL07.revisao}</span></div></header>
    <div class="rel-ficha"><div><span>Identificação</span><b>${CL07.codigo}</b></div><div><span>Revisão</span><b>${CL07.revisao}</b></div>
      <div><span>Elaborado por</span><b>${esc(CL07.elaborado)}</b></div><div><span>Aprovado por</span><b>${esc(CL07.aprovado)}</b></div><div><span>Aprovado em</span><b>${CL07.aprovado_em}</b></div></div>
    <table class="rel-tabela"><tbody>
      <tr><th style="width:28%">Fornecedor</th><td>${esc(f.nome)}</td></tr><tr><th>Contato</th><td>${esc(f.contato || '')}</td></tr>
      <tr><th>Telefone</th><td>${esc(f.telefone || '')}</td></tr><tr><th>E-mail</th><td>${esc(f.email || '')}</td></tr>
      <tr><th>Produtos / serviços</th><td>${esc(f.servico || cat(f.categoria)?.nome || '')}</td></tr>
      <tr><th>Contrato válido até</th><td>${f.contrato_fim ? br(f.contrato_fim) : ''}</td></tr></tbody></table>
    <table class="rel-tabela"><thead><tr><th>Requisitos de sistema de gestão da qualidade</th><th style="width:9%">SIM</th><th style="width:9%">NÃO</th><th style="width:9%">N.A.</th></tr></thead><tbody>
      ${itens.map(([k, rot], i) => `<tr><td>${i + 1}. ${esc(rot)}</td><td class="ce">${x(k, 'S')}</td><td class="ce">${x(k, 'N')}</td><td class="ce">${x(k, 'NA')}</td></tr>`).join('')}
      <tr class="rel-total"><td><b>O fornecedor foi qualificado?</b></td><td class="ce">${f.cl07_qualificado === true ? 'X' : ''}</td><td class="ce">${f.cl07_qualificado === false ? 'X' : ''}</td><td></td></tr>
    </tbody></table>
    <table class="rel-tabela"><tbody><tr><th style="width:28%">Comentários</th><td>${esc(f.cl07_comentario || '')}</td></tr>
      <tr><th>Classificação de critérios</th><td>${f.cl07_qualificado === true ? 'APROVADO' : f.cl07_qualificado === false ? 'REPROVADO' : ''}</td></tr>
      <tr><th>Aprovado por / data</th><td>${esc(f.cl07_aprovador || '')}${f.cl07_data ? ' — ' + br(f.cl07_data) : ''}</td></tr></tbody></table>
    <p class="rel-nota">Obrigatório no cadastro do fornecedor e de novo a cada 12 meses ou na renovação do contrato, o que vier primeiro.${f.cl07_data ? ' Este vale até ' + br(validade(f)) + '.' : ''} Documentos do fornecedor (CNPJ, alvará, PCMSO, PGR, contrato…) na pasta dele no AN 20 — Documentação de fornecedores.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}

/* ===================================================================
   IMPRESSÃO E EXCEL
   =================================================================== */
function docForm() {
  const corpo = catsF23().map(c => {
    const L = F.regs.filter(r => r.categoria === c.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const porF = new Map(); L.forEach(r => { const k = semAc(r.fornecedor); if (!porF.has(k)) porF.set(k, []); porF.get(k).push(r); });
    return `<h2 class="rel-secao">${esc(c.nome)}</h2>
      <table class="rel-tabela"><thead><tr><th>Data</th><th>${esc(c.forn)}</th>${c.lote ? '<th>Nº lote</th>' : ''}${c.nf ? `<th>${esc(c.rotNf || 'Nota fiscal')}</th>` : ''}${c.itens.map(([, rot]) => `<th>${esc(rot)}</th>`).join('')}<th>Conforme?</th><th>Justificativa</th></tr></thead><tbody>
      ${L.map(r => `<tr><td>${br(r.data)}</td><td>${esc(r.fornecedor)}</td>${c.lote ? `<td>${esc(r.lote || '')}</td>` : ''}${c.nf ? `<td>${esc(r.nf || '')}</td>` : ''}${c.itens.map(([k]) => `<td>${(r.itens || {})[k] === true ? 'SIM' : (r.itens || {})[k] === false ? 'NÃO' : ''}</td>`).join('')}<td><b>${r.conforme ? 'SIM' : 'NÃO'}</b></td><td>${esc(r.justificativa || '')}</td></tr>`).join('') || `<tr><td colspan="${4 + c.itens.length + (c.lote ? 1 : 0) + (c.nf ? 1 : 0)}">Sem avaliações.</td></tr>`}
      </tbody></table>
      ${porF.size ? `<p class="rel-nota">Situação (últimas ${JANELA}): ${[...porF.values()].map(l => `${esc(l[0].fornecedor)} — ${situacao(l).rot}`).join(' · ')}</p>` : ''}`;
  }).join('');
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(FORM.titulo)}</h1><p>POP 021 — Fornecedores</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${FORM.codigo}</span></div></header>
    <div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>
    ${corpo}
    <p class="rel-nota">APROVADO (NOTA 10): todas as entregas conformes · APROVADO (NOTA 8): uma entrega não conforme · REPROVADO: 2 ou mais entregas não conformes. Somente são avaliados fornecedores com certificado GLOBALG.A.P. válido até a finalização da prestação do serviço.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
async function exportar() {
  const linhas = F.regs.slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || String(a.data).localeCompare(String(b.data))).map(r => { const c = cat(r.categoria);
    return [r.data, c?.nome || r.categoria, r.fornecedor, r.lote || '', r.nf || '', (c?.itens || []).map(([k, rot]) => `${rot}: ${(r.itens || {})[k] === true ? 'SIM' : (r.itens || {})[k] === false ? 'NÃO' : '—'}`).join(' | '),
      r.conforme ? 'SIM' : 'NÃO', r.justificativa || '', linksDe(r).map(x => `${x.rot}: ${x.url}`).join(' | ')]; });
  await baixarXlsx(`avaliacao-fornecedores-${hoje()}`, [{ nome: 'FORM 023', titulo: `${FORM.codigo} — ${FORM.titulo}`, subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'Categoria', larg: 30 }, { rot: 'Fornecedor', larg: 26 }, { rot: 'Lote', larg: 10 }, { rot: 'NF', larg: 12 },
      { rot: 'Respostas', larg: 70 }, { rot: 'Conforme', larg: 10 }, { rot: 'Justificativa', larg: 30 }, { rot: 'Evidência', larg: 40 }],
    linhas }]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_FORNECEDORES = ['foPainel', 'foCl07', 'foAvaliacoes', 'foCadastro'];
/* Etapa 2 (29/10/2026, claude/cert-redesenho-lean.md): a aba Registros mostra o painel e, logo abaixo, o histórico. */
const DESENHO = { foPainel: () => { desenharPainel(); desenharAval(); }, foCl07: desenharCl07, foAvaliacoes: desenharAval, foCadastro: desenharCadastro };
/* CL 07: trocar de computador para celular (girar a tela) redesenha */
try { window.matchMedia('(max-width: 760px)').addEventListener('change', () => { if (telaAtual === 'foCl07') redesenhar(); }); } catch { /* sem matchMedia */ }
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirFornecedores(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!F.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando a avaliação de fornecedores…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a avaliação de fornecedores: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgFo')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparFornecedores() {
  F.carregado = false; F.regs = []; F.forn = []; F.arq = new Set(); F.fc = ''; F.fq = '';
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
/** Meses com avaliação (evidência "viva" do FORM 023 na Lista mestra). */
export const _cfo = { F, situacao, porFornecedor };
