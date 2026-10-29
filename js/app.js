// app.js — telas, eventos e ligação com o armazenamento
import * as db from './store.js';
import { estado, modeloAtual } from './store.js';
import { montarFicha, linhaVazia, MESES, TRACO } from './ficha.js';
import { montarLista, listaAtual, LISTA_PADRAO } from './lista.js';
import { lerFuncionarios, comparar, aplicarEm } from './planilha.js';
import { aniversariantes, semNascimento, montarAniversarios, textoWhatsapp, linkWhatsapp,
  imagemAniversarios, nomeImagem } from './aniversarios.js';
import { SEED_MODELO } from './seed.js';
import { ligarDisc, abrirDisc, limparDisc } from './disc.js';
import { desenharCadastros, NIVEIS } from './jornada-cadastros.js';
import { carregarAcesso, montarMenu, desenharConfig, ligarAcesso, limparAcesso,
  mostrarInicio, abrirModulo, moduloDe } from './acesso.js';
import { ligarJornada, abrirJornada, limparJornada } from './jornada.js';
import { abrirEmprestimo, fecharDocEmprestimo } from './jornada-emprestimos.js';
import { abrirFerias, etiquetaFicha } from './jornada-ferias.js';
import { abrirBoletins, fecharDocBoletins, fecharMenuBoletins } from './jornada-boletins.js';
import { abrirDocumentos, fecharDocDocumentos, fecharMenuDocumentos } from './jornada-documentos.js';
import { abrirTicket } from './jornada-ticket.js';
import { desenharAtalhos, carregarAtalhos, ligarAtalhos, limparAtalhos } from './atalhos.js';
import { ligarSst, abrirSst, limparSst, limparPreviaSst, enviarFilaSst, carregarSst, garantirSst, sstCarregado } from './sst.js';
const sstPronto = () => sstCarregado() ? Promise.resolve() : garantirSst();
import { abrirAcidentes, limparAcidentes, TELAS_ACIDENTES } from './sst-acidentes.js';
import { abrirCalendarioSst } from './sst-calendario.js';
import { abrirCampanhas, limparCampanhas, TELAS_CAMPANHAS } from './sst-campanhas.js';
import { abrirBrigada, limparBrigada, ligarBrigada, avisoDesligamentoBrigada, TELAS_BRIGADA } from './sst-brigada.js';
import { abrirNrs, limparNrs } from './sst-nrs.js';
import { abrirEpiCrono, limparEpiCrono, ligarEpiCrono, redesenharEpiCrono } from './sst-epi-crono.js';
import { abrirReuniao, TELAS_REUNIAO, limparReuniao, pendentesReuniao, sincronizarReuniao } from './reuniao.js';
import { abrirCronograma, pendentesCronograma, enviarFila as enviarFilaCron } from './cronograma.js';
import { ligarAso, abrirFuncoes } from './aso.js';
import { ligarRelExames, abrirRelExames } from './sst-exames-rel.js';
import { ligarTreinoFuncao, abrirTreinoFuncao, resumoCadastro } from './treino-funcao.js';
import { ligarConsolidado, abrirConsolidado } from './treino-consolidado.js';
import { ligarAtividades, abrirAtividades, desenharAtvFuncionario } from './sst-atividades.js';
import { ligarTermos, abrirTermos } from './termos.js';
import { abrirContrato, ligarContrato, contratoDe } from './contrato-trabalho.js';
import { estadoCa, caReprovado, linkCa, dataBr as dataBrCa, conferirCas } from './ca.js';
import { ligarRh, abrirRh, limparRh } from './rh.js';
import * as jd from './jornada-dados.js';
import * as nucleo from './nucleo.js';
import * as iv from './rh-ind-vinculos.js';
import * as folhaPonto from './jornada-folhaponto.js';
import { pode, podeTela, acesso, TELAS_JUNTAS } from './acesso.js';
import { ligarBackup } from './backup.js';
import { campoAnexos, contarPendentes as pendentesAnexos, enviarPendentes as enviarAnexos,
  fotosDe, urlDoArquivo } from './arquivos.js';
import { desenharCadRelatorios, desenharCadFerias } from './cad-relatorios.js';
import { abrirEtiquetas } from './etiquetas.js';
import { abrirEnvelopes } from './etiquetas-envelope.js';
import { abrirOrganograma, limparOrganograma } from './organograma.js';
import { abrirIndicadores, limparIndicadores, TELAS_INDICADORES } from './rh-indicadores.js';
import { abrirSalarios, limparSalarios, TELAS_SALARIOS, _sal } from './rh-salarios.js';
import { abrirTarefas, limparTarefas, ligarTarefas, gerarTarefas, TELAS_TAREFAS } from './dp-tarefas.js';
import { abrirEnquadra, limparEnquadra, TELAS_ENQUADRA } from './rh-enquadramento.js';
import { abrirSalarioDigno, limparSalarioDigno, TELAS_SALARIO_DIGNO } from './rh-salario-digno.js';
import { verFichaCadastral, imprimirFichaCadastral, fecharFichaCadastral } from './ficha-cadastral.js';
import { ligarAreas, abrirPrimeiraTela, limparAreas, ehTelaVist, abrirTelaVist, mostrarAreas, areaAberta } from './areas.js';
import { abrirCertificacao, limparCertificacao, TELAS_CERT, enviarFilaCert, auditorLigado } from './certificacao.js';
import { abrirCaderno, limparCaderno, TELAS_CADERNO, enviarFilaCaderno, recarregarCaderno } from './cert-caderno.js';
import { abrirFauna, limparFauna, TELAS_FAUNA } from './cert-fauna.js';
import { abrirEnergia, limparEnergia, TELAS_ENERGIA } from './cert-energia.js';
import { abrirResiduos, limparResiduos, TELAS_RESIDUOS } from './cert-residuos.js';
import { abrirGrasp, limparGrasp, TELAS_GRASP } from './cert-grasp.js';
import { abrirBanho, limparBanho, TELAS_BANHO } from './cert-banho.js';
import { abrirChecklist, limparChecklist, TELAS_CHECKLIST } from './cert-checklist.js';
import { abrirFornecedores, limparFornecedores, TELAS_FORNECEDORES } from './cert-fornecedores.js';
import { abrirMelhorias, limparMelhorias, TELAS_MELHORIAS } from './cert-melhorias.js';
import { abrirBalanco, limparBalanco, TELAS_BALANCO } from './cert-balanco.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

const marcados = new Set();     // ids de funcionários selecionados (fichas)
const naLista = new Set();      // ids de funcionários na lista de presença
const naListaEmp = new Set();   // ids de empregadores na lista (saem como "Proprietário")
const rascunhos = new Map();    // chave -> {linhas:[], id}
let editandoFunc = null;
let editandoEpi = null;

/* =============== telas =============== */
function mostrar(qual) {
  $('telaLogin').hidden = qual !== 'login';
  $('telaNovaSenha').hidden = qual !== 'novaSenha';
  $('app').hidden = qual !== 'app';
}

/* A prévia dos documentos vive toda no #jorImpressao, que fica fora do #app e
   é de todos os módulos: Ficha do Funcionário, relatório do SST, documentos do
   DP e do RH. Ela só nasce depois que a tela já está aberta, então trocar de
   tela sempre pode apagá-la — e precisa: senão ela fica pendurada embaixo da
   tela nova, com a barra de impressão de outro módulo, e ainda sai no papel na
   impressão seguinte. */
function limparPrevias() {
  fecharFichaCadastral();   // esconde a barra do Cadastro · Nível 1
  limparPreviaSst();        // esconde as barras do SST e devolve a da lista
  fecharDocEmprestimo();    // esconde a barra do recibo / extrato do empréstimo
  fecharDocBoletins();      // esconde a barra do relatório de boletins
  fecharMenuBoletins();     // fecha o menu da célula da grade do mês
  fecharDocDocumentos();    // barra do relatório de folha/holerite/recibo
  fecharMenuDocumentos();   // menu da célula da grade de documentos
  const alvo = $('jorImpressao');
  if (alvo) { alvo.innerHTML = ''; alvo.hidden = true; }
}

/* Acesso rápido na lateral da tela inicial: mora em js/atalhos.js desde
   24/09/2026 — cada login escolhe os seus (tabela app_preferencias). */

/* Telas que só funcionam com internet (rodada C): sem cópia local nem fila.
   Offline, a pessoa vê um aviso honesto em vez de uma tela vazia sem explicação. */
const SO_ONLINE = new Set(['disc', 'config', 'exFuncoes', 'trFuncoes', 'sstAtv',
  'rhCargos', 'rhProposta', 'rhQuadro', 'rhOrganograma',
  ...TELAS_ACIDENTES, ...TELAS_CAMPANHAS, ...TELAS_BRIGADA, ...TELAS_INDICADORES, ...TELAS_SALARIOS, ...TELAS_ENQUADRA, ...TELAS_SALARIO_DIGNO]);
function avisarSoOnline(nome) {
  $('avisoSoOnline').hidden = !(SO_ONLINE.has(nome) && !navigator.onLine);
}
addEventListener('online', () => { $('avisoSoOnline').hidden = true; });

function abrirAba(nome) {
  // telas do menu do Vistorias: moram na moldura (js/areas.js)
  if (ehTelaVist(nome)) return abrirTelaVist(nome);
  limparPrevias();
  avisarSoOnline(nome);
  $('telaInicio').hidden = nome !== 'inicio';
  $('telaAreas').hidden = nome !== 'areas';
  $('telaManut').hidden = nome !== 'manutencoes';
  $('telaVist').hidden = nome !== 'vistorias';
  $('telaProg').hidden = nome !== 'programacao';
  $('telaEst').hidden = nome !== 'estoque';
  $('telaCB').hidden = nome !== 'custobase';
  $('telaCP').hidden = nome !== 'colheita';
  $('telaPJ').hidden = nome !== 'projetos';
  $('telaCron').hidden = nome !== 'cronograma';
  if (nome === 'cronograma') abrirCronograma($('crAlvo'));
  document.body.classList.toggle('na-moldura', ['manutencoes', 'vistorias', 'programacao', 'estoque', 'custobase', 'colheita', 'projetos'].includes(nome));
  if (nome === 'inicio') desenharAtalhos();
  $('telaFichas').hidden = nome !== 'fichas';
  $('telaLista').hidden = nome !== 'lista';
  $('telaTermoSindical').hidden = nome !== 'termoSindical';
  $('telaTermoContrato').hidden = nome !== 'termoContrato';
  $('telaContratoTrab').hidden = nome !== 'contratoTrab';
  if (nome === 'contratoTrab') abrirContrato();
  $('telaFuncionarios').hidden = nome !== 'funcionarios';
  $('telaAniversarios').hidden = nome !== 'aniversarios';
  $('telaCadFuncoes').hidden = nome !== 'cadFuncoes';
  $('telaCadEstrutura').hidden = nome !== 'cadEstrutura';
  $('telaFolhaPonto').hidden = nome !== 'folhaPonto';
  if (nome === 'folhaPonto') folhaPonto.desenhar($('folhaPontoAlvo'), { aviso: () => {} });
  $('telaEpis').hidden = nome !== 'epis';
  $('telaEpiCrono').hidden = nome !== 'epiCrono';   // Cronograma de troca (28/10/2026)
  $('telaModelo').hidden = nome !== 'modelo';
  $('telaDisc').hidden = nome !== 'disc';
  $('telaConfig').hidden = nome !== 'config';
  if (nome === 'config') dispatchEvent(new Event('gr:tela-config'));
  $('telaExPainel').hidden = nome !== 'exPainel';
  $('telaTrPainel').hidden = nome !== 'trPainel';
  $('telaExVenc').hidden  = nome !== 'exVenc';
  $('telaExTipos').hidden = nome !== 'exTipos';
  $('telaExFuncoes').hidden = nome !== 'exFuncoes';
  $('telaExRel').hidden = nome !== 'exRel';
  $('telaTrVenc').hidden  = nome !== 'trVenc';
  $('telaTrTipos').hidden = nome !== 'trTipos';
  $('telaTrFuncoes').hidden = nome !== 'trFuncoes';
  $('telaTrConsol').hidden = nome !== 'trConsol';
  $('telaSstAtv').hidden = nome !== 'sstAtv';
  $('telaJorPainel').hidden       = nome !== 'jorPainel';
  $('telaJorLancar').hidden       = nome !== 'jorLancar';
  $('telaJorBoletins').hidden     = nome !== 'jorBoletins';
  $('telaJorExtras').hidden       = nome !== 'jorExtras';
  $('telaJorFechamento').hidden   = nome !== 'jorFechamento';
  $('telaJorAbatimento').hidden   = nome !== 'jorAbatimento';
  $('telaJorHistorico').hidden    = nome !== 'jorHistorico';
  $('telaJorRelatorios').hidden   = nome !== 'jorRelatorios';
  $('telaJorConfig').hidden       = nome !== 'jorConfig';
  $('telaEmpEmissao').hidden      = nome !== 'empEmissao';
  $('telaEmpRecibos').hidden      = nome !== 'empRecibos';
  $('telaEmpHistorico').hidden    = nome !== 'empHistorico';
  $('telaEmpSalarios').hidden     = nome !== 'empSalarios';
  ['ferPainel', 'ferPrev', 'ferLanc', 'ferAfast', 'ferRisco', 'ferIni'].forEach(t =>
    { $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t; });
  ['bdDia', 'bdMes', 'bdPend', 'dmPainel', 'dmMes', 'dmScan', 'tkMes', 'tkHist'].forEach(t =>
    { $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t; });
  if (nome === 'lista') { preencherLista(); desenharSelecaoLista(); }
  if (nome === 'termoSindical' || nome === 'termoContrato') abrirTermos(nome);
  if (nome === 'aniversarios') atualizarAniversarios();
  if (nome === 'funcionarios') desenharFuncionarios();
  /* Os cadastros estruturais desenham a partir da mesma receita do DP; cada
     tela escolhe o seu punhado. Depois de salvar, as listas do cadastro de
     funcionário são remontadas, senão a função nova só aparece ao recarregar. */
  if (nome === 'cadFuncoes') desenharCadastros('cadFuncoesLista', ['funcoes', 'setores'], desenharFuncionarios);
  if (nome === 'cadEstrutura') desenharCadastros('cadEstruturaLista',
    ['empregadores', 'fazendas', 'unidades', 'destinos'], desenharFuncionarios);
  if (nome === 'epis') { desenharEpis(); conferirCa(false); }
  if (nome === 'epiCrono') abrirEpiCrono();
  if (nome === 'modelo') preencherModelo();
  $('telaRhCargos').hidden   = nome !== 'rhCargos';
  $('telaRhProposta').hidden = nome !== 'rhProposta';
  $('telaRhOrganograma').hidden = nome !== 'rhOrganograma';
  if (nome === 'rhOrganograma') abrirOrganograma();
  for (const t of TELAS_INDICADORES) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_INDICADORES.includes(nome)) abrirIndicadores(nome);
  for (const t of TELAS_SALARIOS) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_SALARIOS.includes(nome)) abrirSalarios(nome);
  for (const t of TELAS_ENQUADRA) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_ENQUADRA.includes(nome)) abrirEnquadra(nome);
  for (const t of TELAS_SALARIO_DIGNO) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_SALARIO_DIGNO.includes(nome)) abrirSalarioDigno(nome, { abrirFuncionario });
  $('telaRhQuadro').hidden   = nome !== 'rhQuadro';
  $('telaCadRelatorios').hidden = nome !== 'cadRelatorios';
  if (nome === 'cadRelatorios') desenharCadRelatorios();
  $('telaCadFerias').hidden = nome !== 'cadFerias';
  if (nome === 'cadFerias') desenharCadFerias();
  $('telaEtqArmarios').hidden = nome !== 'etqArmarios';
  if (nome === 'etqArmarios') abrirEtiquetas();
  $('telaEtqEnvelopes').hidden = nome !== 'etqEnvelopes';
  if (nome === 'etqEnvelopes') abrirEnvelopes();
  if (nome === 'disc') abrirDisc();
  if (['rhCargos', 'rhProposta', 'rhQuadro'].includes(nome)) abrirRh(nome);
  if (nome === 'config') desenharConfig();
  if (['exPainel', 'exVenc', 'exTipos', 'trPainel', 'trVenc', 'trTipos'].includes(nome)) abrirSst(nome);
  if (nome === 'exFuncoes') abrirFuncoes();
  if (nome === 'exRel') abrirRelExames();
  if (nome === 'trFuncoes') sstPronto().catch(() => {}).then(abrirTreinoFuncao);
  if (nome === 'trConsol') abrirConsolidado();
  if (nome === 'sstAtv') abrirAtividades();
  for (const t of TELAS_ACIDENTES) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_ACIDENTES.includes(nome)) abrirAcidentes(nome);
  // SST › Campanhas (21/10/2026) — js/sst-campanhas.js
  for (const t of TELAS_CAMPANHAS) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_CAMPANHAS.includes(nome)) abrirCampanhas(nome);
  // SST › Brigada e primeiros socorros (22/10/2026) — js/sst-brigada.js
  for (const t of TELAS_BRIGADA) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_BRIGADA.includes(nome)) abrirBrigada(nome);
  // SST › NRs (29/10/2026) — js/sst-nrs.js; funciona sem internet (só o botão do portal precisa)
  $('telaSstNrs').hidden = nome !== 'sstNrs';
  if (nome === 'sstNrs') abrirNrs();
  $('telaSstCal').hidden = nome !== 'sstCal';
  if (nome === 'sstCal') abrirCalendarioSst();
  // Reunião semanal (15/10/2026) — js/reuniao.js
  for (const t of TELAS_REUNIAO) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_REUNIAO.includes(nome)) abrirReuniao(nome);
  // Área Certificação (13/10/2026) — js/certificacao.js
  for (const t of TELAS_CERT) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_CERT.includes(nome)) abrirCertificacao(nome);
  // Certificação › Caderno de campo (19/10/2026) — js/cert-caderno.js
  for (const t of TELAS_CADERNO) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_CADERNO.includes(nome)) abrirCaderno(nome);
  // Certificação › Biodiversidade (26/10/2026) — js/cert-fauna.js
  for (const t of TELAS_FAUNA) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_FAUNA.includes(nome)) abrirFauna(nome);
  // Certificação › Energia (26/10/2026) — js/cert-energia.js
  for (const t of TELAS_ENERGIA) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_ENERGIA.includes(nome)) abrirEnergia(nome);
  // Certificação › Resíduos (27/10/2026) — js/cert-residuos.js
  for (const t of TELAS_RESIDUOS) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_RESIDUOS.includes(nome)) abrirResiduos(nome);
  // Certificação › Reunião GRASP (27/10/2026) — js/cert-grasp.js
  for (const t of TELAS_GRASP) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_GRASP.includes(nome)) abrirGrasp(nome);
  // Certificação › Banho e higiene pessoal (28/10/2026) — js/cert-banho.js
  for (const t of TELAS_BANHO) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_BANHO.includes(nome)) abrirBanho(nome);
  // Certificação › Check List Digital (29/10/2026) — js/cert-checklist.js
  for (const t of TELAS_CHECKLIST) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_CHECKLIST.includes(nome)) abrirChecklist(nome);
  // Certificação › Folhas de estoque (29/10/2026) — js/folhas-estoque.js (o mesmo da área Estoque)
  // e Certificação › Sinalética › Placas do estoque (29/10/2026) — mesmo arquivo
  for (const t of ['feFolhas', 'siPlacasEstoque', 'siPlacas', 'siEtiquetasL', 'siAdesivos']) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  // Sinalética › Adesivos entrada e saída (29/10/2026) — só a palavra e a logo, js/folhas-estoque.js
  if (nome === 'siAdesivos' && window.FolhasEstoque) window.FolhasEstoque.desenhar($('telaSiAdesivos'), { tela: 'adesivos' });
  // Sinalética › Etiquetas da pasta L (29/10/2026) — 80 × 110 mm, js/folhas-estoque.js
  if (nome === 'siEtiquetasL' && window.FolhasEstoque) window.FolhasEstoque.desenhar($('telaSiEtiquetasL'), { tela: 'etiquetas' });
  // Sinalética › Placas (29/10/2026) — as placas da pasta 18 - Placas, js/sinaletica.js
  if (nome === 'siPlacas' && window.Sinaletica) window.Sinaletica.desenhar($('telaSiPlacas'));
  if ((nome === 'feFolhas' || nome === 'siPlacasEstoque') && window.FolhasEstoque)
    window.FolhasEstoque.desenhar($('tela' + nome[0].toUpperCase() + nome.slice(1)), { tela: nome === 'feFolhas' ? 'folhas' : 'placas' });
  // Certificação › Fornecedores (26/10/2026) — js/cert-fornecedores.js
  for (const t of TELAS_FORNECEDORES) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_FORNECEDORES.includes(nome)) abrirFornecedores(nome);
  // Certificação › Melhoria contínua (26/10/2026) — js/cert-melhorias.js
  for (const t of TELAS_MELHORIAS) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_MELHORIAS.includes(nome)) abrirMelhorias(nome);
  // Certificação › Balanço de massa (26/10/2026) — js/cert-balanco.js
  for (const t of TELAS_BALANCO) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_BALANCO.includes(nome)) abrirBalanco(nome);
  if (nome.startsWith('jor')) abrirJornada(nome);
  if (nome.startsWith('emp')) abrirEmprestimo(nome);
  if (nome.startsWith('fer')) abrirFerias(nome);
  if (nome.startsWith('bd')) abrirBoletins(nome);
  if (nome.startsWith('dm')) abrirDocumentos(nome);
  // Cadastros › Admissão e demissão (23/10/2026) — js/dp-tarefas.js
  for (const t of TELAS_TAREFAS) $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t;
  if (TELAS_TAREFAS.includes(nome)) abrirTarefas(nome);
  if (nome.startsWith('tk')) abrirTicket(nome);
  // Certificação, etapa 4 (29/10/2026): modo auditor só vale dentro da Certificação
  document.body.classList.toggle('modo-auditor', auditorLigado() && moduloDe(nome) === 'cert');
  // Certificação, etapa 2 (29/10/2026): o histórico aparece logo abaixo do painel, na mesma aba
  for (const [painel, hist] of Object.entries(TELAS_JUNTAS)) {
    const el = $('tela' + hist[0].toUpperCase() + hist.slice(1));
    if (!el) continue;
    el.classList.toggle('tela-junta', nome === painel);
    if (nome === painel) el.hidden = false;
  }
}

/* =============== login =============== */
$('formLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('erroLogin'); erro.hidden = true;
  const botao = $('btnEntrar'); botao.disabled = true; botao.textContent = 'Entrando...';
  try {
    db.definirManter($('logManter').checked);
    const r = await db.entrar($('logEmail').value.trim(), $('logSenha').value);
    mostrar('app');
    if (r?.offline) mostrarAviso('Sem internet. Entrou com o acesso guardado neste aparelho — o que você lançar fica na fila e sobe quando o sinal voltar.');
    await carregarTudo();
  } catch (e) {
    erro.textContent = traduzirErro(e);
    erro.hidden = false;
  } finally {
    botao.disabled = false; botao.textContent = 'Entrar';
  }
});

/* A logo da LOP e o nome do sistema, no alto, levam à escolha das áreas; a
   etiqueta da área leva ao início dela (js/areas.js, 09/10/2026). */
ligarAreas(abrirAba);

/* Trocar a própria senha já logado. Usa a mesma tela do link do e-mail —
   é o caminho que não depende do e-mail de recuperação chegar certo. */
let trocandoLogado = false;
$('btnTrocarSenha').addEventListener('click', () => {
  trocandoLogado = true;
  $('nsSenha').value = ''; $('nsSenha2').value = '';
  $('erroNovaSenha').hidden = true;
  const email = estado.sessao?.user?.email;
  $('nsQuem').textContent = email
    ? `Login ${email}. Escolha a senha que você vai usar daqui em diante.`
    : 'Escolha a senha que você vai usar daqui em diante.';
  $('bSalvarNovaSenha').textContent = 'Salvar';
  $('bSalvarNovaSenha').disabled = false;
  $('bCancelarNovaSenha').hidden = false;
  mostrar('novaSenha');
  $('nsSenha').focus();
});
$('bCancelarNovaSenha').addEventListener('click', () => {
  trocandoLogado = false;
  $('bCancelarNovaSenha').hidden = true;
  $('bSalvarNovaSenha').textContent = 'Salvar e entrar';
  mostrar('app');
});

$('btnSair').addEventListener('click', async () => {
  await db.sair();
  marcados.clear(); rascunhos.clear(); limparAtalhos();
  limparAreas(); limparDisc(); limparAcesso(); limparJornada(); limparSst(); limparAcidentes(); limparCampanhas(); limparBrigada(); limparNrs(); limparEpiCrono(); limparCertificacao(); limparCaderno(); limparFauna(); limparEnergia(); limparResiduos(); limparGrasp(); limparBanho(); limparChecklist(); limparFornecedores(); limparMelhorias(); limparBalanco(); limparRh(); limparOrganograma(); limparIndicadores(); limparSalarios(); limparEnquadra(); limparSalarioDigno(); limparReuniao(); limparTarefas();
  mostrar('login');
});

/* =============== esqueci minha senha =============== */
function painelEsqueci(mostrando) {
  $('formLogin').hidden = mostrando;
  $('formEsqueci').hidden = !mostrando;
  $('erroLogin').hidden = true;
  if (mostrando) {
    $('recEmail').value = $('logEmail').value.trim();
    $('recEmail').focus();
  }
}

$('bEsqueci').addEventListener('click', () => painelEsqueci(true));
$('bVoltarLogin').addEventListener('click', () => painelEsqueci(false));

$('formEsqueci').addEventListener('submit', async ev => {
  ev.preventDefault();
  const quem = $('recEmail').value.trim();
  const erro = $('erroLogin'); erro.hidden = true;
  if (!quem) return;

  const botao = $('bEnviarLink');
  botao.disabled = true; botao.textContent = 'Enviando...';
  try {
    await db.pedirRecuperacao(quem);
    // De propósito não dizemos se existe ou não: isso evita que alguém
    // descubra quem tem acesso ao app só testando nomes e endereços.
    $('formEsqueci').innerHTML = `
      <p class="sub" style="text-align:left">
        Se esse login existir no app, a mensagem com o link já está a caminho
        do e-mail cadastrado. O link vale por 1 hora. Confira também a caixa
        de spam.
      </p>
      <div class="barra fim">
        <button class="btn principal" type="button" id="bVoltarDepois">Voltar ao login</button>
      </div>`;
    $('bVoltarDepois').addEventListener('click', () => location.reload());
  } catch (e) {
    erro.textContent = traduzirErro(e);
    erro.hidden = false;
    botao.disabled = false; botao.textContent = 'Enviar link';
  }
});

/* =============== nova senha (chegou pelo link do e-mail) =============== */
$('formNovaSenha').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('erroNovaSenha'); erro.hidden = true;
  const a = $('nsSenha').value, b = $('nsSenha2').value;

  if (a.length < 8) {
    erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    erro.hidden = false; return;
  }
  if (a !== b) {
    erro.textContent = 'As duas senhas não são iguais.';
    erro.hidden = false; return;
  }

  const botao = $('bSalvarNovaSenha');
  botao.disabled = true; botao.textContent = 'Salvando...';
  try {
    await db.trocarSenha(a);
    if (trocandoLogado) {
      // já estava dentro: só volta para onde estava, sem recarregar nada
      trocandoLogado = false;
      $('bCancelarNovaSenha').hidden = true;
      botao.disabled = false; botao.textContent = 'Salvar e entrar';
      mostrar('app');
      mostrarAviso('Senha trocada. Da próxima vez entre com ela.');
      return;
    }
    history.replaceState(null, '', location.pathname);   // tira o token da barra de endereço
    mostrar('app');
    await carregarTudo();
    mostrarAviso('Senha trocada. Da próxima vez entre com ela.');
  } catch (e) {
    erro.textContent = traduzirErro(e);
    erro.hidden = false;
    botao.disabled = false; botao.textContent = trocandoLogado ? 'Salvar' : 'Salvar e entrar';
  }
});

function traduzirErro(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Confirme no painel do Supabase.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o Supabase. Verifique a internet ou a URL do projeto.';
  /* 504/502/503 e "timeout" querem dizer sempre a mesma coisa aqui: o servidor
     do banco não respondeu. No plano gratuito isso é quase sempre o projeto
     pausado ou sem responder — e "HTTP 504" na tela não ajuda ninguém. */
  if (/\b(504|502|503)\b|gateway|timeout|timed out|AbortError/i.test(m)) {
    return 'O banco de dados não respondeu. Ele costuma ficar assim quando está '
      + 'pausado ou fora do ar. Espere um minuto e tente de novo; se insistir, '
      + 'é preciso reiniciar o projeto no painel do Supabase.';
  }
  if (/relation .* does not exist/i.test(m)) return 'As tabelas ainda não existem. Rode o SQL do arquivo supabase.sql no SQL Editor.';
  if (/only request this after (\d+) seconds/i.test(m)) {
    return `Espere ${/after (\d+) seconds/i.exec(m)[1]} segundos para pedir outro link.`;
  }
  if (/rate limit/i.test(m)) return 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
  if (/should be different from the old password/i.test(m)) return 'A senha nova precisa ser diferente da anterior.';
  if (/Auth session missing|session_not_found/i.test(m)) {
    return 'O link de recuperação venceu. Peça outro em "Esqueci minha senha".';
  }
  if (/Error sending recovery email|SMTP/i.test(m)) {
    return 'O envio de e-mail ainda não está configurado no Supabase. Fale com o administrador.';
  }
  return m || 'Não foi possível concluir.';
}

/* =============== carga =============== */
/* A ordem aqui importa: o menu sobe ANTES das telas.
   Ele é o esqueleto do app — se uma tela tropeça no meio do caminho, a pessoa
   ainda tem por onde andar, e o tropeço aparece no aviso do topo. Antes, um
   erro em qualquer preparação deixava a pessoa presa na tela de entrada, sem
   menu e sem explicação, porque a tela de entrada é a visível por padrão. */
async function carregarTudo() {
  const recado = [];

  /* Abertura em paralelo (15/10/2026). Antes era uma fila: cadastros
     básicos → permissões → atalhos → DP. Os básicos (funcionários, EPIs,
     fichas, modelo) não dependem de nada e vão logo; o DP precisa saber as
     permissões (o que a pessoa vê e o recorte de DP), então espera só elas. */
  const basicos = db.sincronizar().catch(e => {
    recado.push('Usando os dados salvos neste aparelho. ' + traduzirErro(e));
  });

  try {
    await carregarAcesso();
  } catch (e) {
    recado.push('Não consegui ler suas permissões: ' + (e.message || e));
  }

  /* Os cadastros do DP (unidade, setor, função, jornada) alimentam as listas
     do cadastro de funcionário. Carrega aqui para elas estarem prontas mesmo
     que a pessoa vá direto para Funcionários, sem abrir o DP. */
  /* Quem tem só Cadastros também precisa delas: sem isso as listas de
     unidade, setor e função do cadastro de funcionário abrem vazias. */
  /* 22/10/2026 (Vinícius: "loga e fica sem aparecer os ícones"): a tela
     das áreas sobe logo depois das permissões. Antes ela esperava também a
     sincronização dos cadastros, a fila e o DP — com sinal fraco ou muita
     coisa para baixar, a pessoa ficava olhando a tela vazia. As telas
     abrem com os dados guardados no aparelho e se atualizam quando a
     sincronização terminar. */
  montarMenu(abrirAba);
  abrirPrimeiraTela();
  if (acesso.provisorio) tentarAcessoDeNovo();
  try { preencherControles(); desenharSelecao(); } catch { /* refeito depois da sincronização */ }

  await Promise.all([
    basicos,
    carregarAtalhos().catch(e => {
      recado.push('Não consegui ler suas permissões: ' + (e.message || e));
    }),
    (pode('jornada') || pode('pessoas'))
      ? jd.carregar().catch(() => { /* sem rede: usa o que está no cache */ })
      : null,
  ]);

  // Ainda na escolha das áreas: redesenha (frase da semana e alertas usam os dados).
  if (!areaAberta() && !$('telaAreas').hidden) mostrarAreas();

  try {
    preencherControles();
    desenharSelecao();
  } catch (e) {
    recado.push('A tela de fichas não montou por inteiro: ' + (e.message || e));
  }

  const aviso = $('avisoGlobal');
  aviso.innerHTML = recado.map(esc).join('<br>');
  aviso.hidden = !recado.length;
}

/* Permissões não chegaram e não havia cópia neste aparelho: o app abriu
   só com o padrão (Pessoas). Tenta de novo algumas vezes e, quando vier,
   remonta o menu e as áreas — sem a pessoa precisar sair e entrar. */
function tentarAcessoDeNovo(vez = 1) {
  if (vez > 6) return;
  setTimeout(async () => {
    if (!estado.sessao) return;
    await carregarAcesso().catch(() => {});
    if (acesso.provisorio) return tentarAcessoDeNovo(vez + 1);
    if (!areaAberta()) { montarMenu(abrirAba); mostrarAreas(); }
    else mostrarAviso('Suas permissões chegaram. Volte à tela das áreas para ver tudo o que você acessa.');
  }, 4000 * vez);
}

function preencherControles() {
  const m = modeloAtual();
  if (!$('selMes').options.length) {
    MESES.forEach((nome, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = nome[0].toUpperCase() + nome.slice(1);
      $('selMes').appendChild(o);
    });
    const hoje = new Date();
    $('selMes').value = hoje.getMonth();
    $('selAno').value = hoje.getFullYear();
  }
  if (!$('selLinhas').value) $('selLinhas').value = m.linhas_padrao || 20;

  const emps = [...new Set(estado.funcionarios.map(f => f.empregador).filter(Boolean))].sort();
  /* As três caixas de unidade. O que está marcado vive no mapa `selecoes`, não
     no HTML, então remontar aqui (depois de salvar alguém, por exemplo) não
     joga o filtro de volta para "Todas". */
  desenharFiltroUnidades('uniFichas', desenharSelecao);
  desenharFiltroUnidades('uniLista', desenharSelecaoLista);
  desenharFiltroUnidades('uniFunc', desenharFuncionarios);
  $('lista-empregadores').innerHTML =
    [...new Set([...(m.empregadores || []), ...emps])].map(e => `<option value="${esc(e)}">`).join('');
  const cargos = [...new Set([...(m.cargos || []), ...estado.funcionarios.map(f => f.cargo).filter(Boolean)])].sort();
  $('lista-cargos').innerHTML = cargos.map(c => `<option value="${esc(c)}">`).join('');
  const fazendas = [...new Set(estado.funcionarios.map(f => f.fazenda).filter(Boolean))].sort();
  $('lista-fazendas').innerHTML = fazendas.map(f => `<option value="${esc(f)}">`).join('');
  if (!$('anMes').options.length) {
    MESES.forEach((nome, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = nome[0].toUpperCase() + nome.slice(1);
      $('anMes').appendChild(o);
    });
    const hoje = new Date();
    $('anMes').value = hoje.getMonth();
    $('anAno').value = hoje.getFullYear();
  }
  $('lista-epis').innerHTML = estado.epis.filter(e => e.ativo !== false)
    .map(e => {
      const s = estadoCa(e);
      const alerta = ['vencido', 'irregular', 'vencendo'].includes(s.chave) ? ` — C.A ${s.rotulo}` : '';
      return `<option value="${esc(e.descricao)}">${esc((e.ca ? 'C.A ' + e.ca : '') + alerta)}</option>`;
    }).join('');
}

/* ---- filtro de unidades: empregador + fazenda, com várias marcadas ----
   O mesmo empregador assina em mais de uma fazenda, e o recorte quase sempre é
   por fazenda. Antes era uma caixa de escolher uma; agora são caixinhas, e dá
   para juntar duas ou três unidades num filtro só — foi o pedido dele.

   As opções saem de DOIS lugares, de propósito: o cadastro de unidades
   (Cadastros › Empregador e fazenda), que manda na grafia, e o texto gravado em
   cada funcionário, que garante que ninguém suma enquanto a unidade não estiver
   escolhida para todo mundo. A comparação é por uma chave que ignora acento,
   caixa e espaço sobrando — senão "Quebra Cocão" e "Quebra Cocao" viravam duas
   linhas, cada uma com um pedaço da gente.

   Nada marcado = todas, que é o padrão e o que a caixa mostra. */
const SEP = ' || ';
const SEM_FAZENDA = '(SEM FAZENDA)';

const chaveUni = v => String(v == null ? '' : v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();
const chaveDoPar = (emp, faz) =>
  chaveUni(emp) + SEP + (so(faz) ? chaveUni(faz) : SEM_FAZENDA);

const selecoes = new Map();          // id da caixa -> Set de chaves marcadas
const selDe = id => {
  if (!selecoes.has(id)) selecoes.set(id, new Set());
  return selecoes.get(id);
};
/** Sem nada marcado, passa todo mundo. */
const casaUnidade = (f, sel) => !sel.size || sel.has(chaveDoPar(f.empregador, f.fazenda));

function unidadesDoFiltro() {
  const mapa = new Map();
  const por = (emp, faz) => {
    const k = chaveDoPar(emp, faz);
    if (!mapa.has(k)) mapa.set(k, { chave: k, emp: so(emp), faz: so(faz), qtd: 0, cadastro: false });
    return mapa.get(k);
  };
  (jd.dados.unidades || []).filter(u => u.ativo !== false).forEach(u => {
    const it = por(jd.empregadorDe(u)?.nome || '', jd.fazendaDe(u)?.nome || '');
    it.cadastro = true;
    if (jd.empregadorDe(u)?.nome) it.emp = jd.empregadorDe(u).nome;
    if (jd.fazendaDe(u)?.nome) it.faz = jd.fazendaDe(u).nome;
  });
  estado.funcionarios.forEach(f => { por(f.empregador, f.fazenda).qtd++; });

  const grupos = new Map();
  [...mapa.values()].forEach(it => {
    const g = chaveUni(it.emp);
    if (!grupos.has(g)) grupos.set(g, { rotulo: it.emp || 'Sem empregador no cadastro', itens: [] });
    if (it.cadastro && it.emp) grupos.get(g).rotulo = it.emp;   // a grafia do cadastro manda
    grupos.get(g).itens.push(it);
  });
  return [...grupos.values()]
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .map(g => {
      g.itens.sort((a, b) => (a.faz ? 0 : 1) - (b.faz ? 0 : 1) || a.faz.localeCompare(b.faz, 'pt-BR'));
      return g;
    });
}

function resumoDaSelecao(sel, grupos) {
  if (!sel.size) return 'Todas';
  const itens = grupos.flatMap(g => g.itens).filter(i => sel.has(i.chave));
  if (itens.length === 1) {
    const i = itens[0];
    return i.faz ? `${i.emp} · ${i.faz}` : `${i.emp} · sem fazenda`;
  }
  return `${itens.length} unidades`;
}

/** Desenha a caixa de unidades no container `id` e avisa quem precisa redesenhar. */
function desenharFiltroUnidades(id, aoMudar) {
  const caixa = $(id);
  if (!caixa) return;
  const sel = selDe(id);
  const grupos = unidadesDoFiltro();

  // Unidade que sumiu do cadastro não pode ficar marcada e filtrando escondido.
  const validas = new Set(grupos.flatMap(g => g.itens.map(i => i.chave)));
  [...sel].forEach(k => { if (!validas.has(k)) sel.delete(k); });

  const aberta = caixa.querySelector('details')?.open || false;
  caixa.innerHTML = `
    <details class="uni" ${aberta ? 'open' : ''}>
      <summary>
        <span class="uni-rot">Empregador e fazenda</span>
        <b data-uni-resumo>${esc(resumoDaSelecao(sel, grupos))}</b>
      </summary>
      <div class="uni-painel">
        <div class="uni-acoes">
          <button type="button" class="btn mini" data-uni-todas>Todas</button>
          <span class="dica" style="margin:0">marque quantas quiser</span>
        </div>
        ${grupos.map(g => `<div class="uni-grupo">
          <h4>${esc(g.rotulo)}</h4>
          ${g.itens.map(i => `<label class="uni-item">
            <input type="checkbox" value="${esc(i.chave)}" ${sel.has(i.chave) ? 'checked' : ''}>
            <span>${esc(i.faz || 'Sem fazenda no cadastro')}</span>
            <small>${i.qtd}</small>
          </label>`).join('')}
        </div>`).join('')}
      </div>
    </details>`;

  /* Marcar uma caixinha NÃO redesenha o painel: redesenhar fecharia o
     <details> na cara de quem está marcando a segunda unidade. Só o resumo
     do topo é reescrito. */
  const resumo = caixa.querySelector('[data-uni-resumo]');
  const atualizar = () => {
    resumo.textContent = resumoDaSelecao(sel, grupos);
    aoMudar();
  };
  caixa.querySelectorAll('input[type=checkbox]').forEach(c =>
    c.addEventListener('change', () => {
      if (c.checked) sel.add(c.value); else sel.delete(c.value);
      atualizar();
    }));
  caixa.querySelector('[data-uni-todas]').addEventListener('click', () => {
    sel.clear();
    caixa.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; });
    atualizar();
  });
}

/* =============== aba FICHAS =============== */
function visiveis() {
  const q = $('busca').value.trim().toLowerCase();
  const s = $('fSit').value, sel = selDe('uniFichas');
  return estado.funcionarios.filter(f =>
    (!q || f.nome.toLowerCase().includes(q)) &&
    (!s || f.situacao === s) &&
    casaUnidade(f, sel));
}

function desenharSelecao() {
  const vs = visiveis(), box = $('listaSel');
  box.innerHTML = vs.length ? vs.map(f => `
    <label class="item" for="s_${f.id}">
      <input type="checkbox" id="s_${f.id}" data-id="${f.id}" ${marcados.has(f.id) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
    </label>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  box.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? marcados.add(cb.dataset.id) : marcados.delete(cb.dataset.id);
      atualizarFichas();
    }));
  atualizarFichas();
}

const chaveFicha = (id, mes, ano) => `${id}|${mes}|${ano}`;

function linhasDe(func, mes, ano, n) {
  const ch = chaveFicha(func.id, mes, ano);
  if (!rascunhos.has(ch)) {
    const salva = estado.fichas.find(f =>
      f.funcionario_id === func.id && f.mes === mes && f.ano === ano);
    rascunhos.set(ch, {
      id: salva?.id || db.novoId(),
      linhas: Array.isArray(salva?.linhas) ? salva.linhas.map(l => ({ ...linhaVazia(), ...l })) : [],
    });
  }
  const r = rascunhos.get(ch);
  while (r.linhas.length < n) r.linhas.push(linhaVazia());
  return { chave: ch, rascunho: r, linhas: r.linhas.slice(0, n) };
}

function atualizarFichas() {
  const n = marcados.size;
  $('cnt').textContent = n;
  ['bImprimir', 'bSalvarFichas', 'bLimparFichas'].forEach(id => { $(id).disabled = n === 0; });

  const mes = +$('selMes').value, ano = +$('selAno').value || new Date().getFullYear();
  const qtd = Math.max(1, Math.min(40, parseInt($('selLinhas').value) || 20));
  const modelo = modeloAtual();
  const sel = estado.funcionarios.filter(f => marcados.has(f.id));

  $('saida').innerHTML = sel.map(f => {
    const { chave, linhas } = linhasDe(f, mes, ano, qtd);
    return montarFicha(f, modelo, { mes, ano, linhas, chave });
  }).join('');
}

// digitação dentro das fichas
$('saida').addEventListener('input', ev => {
  const alvo = ev.target;
  if (!alvo.classList.contains('cx')) return;
  const ficha = alvo.closest('.ficha');
  const r = rascunhos.get(ficha.dataset.chave);
  if (!r) return;
  const i = +alvo.dataset.linha, campo = alvo.dataset.campo;
  while (r.linhas.length <= i) r.linhas.push(linhaVazia());
  r.linhas[i][campo] = alvo.value;
  alvo.closest('.cw').classList.toggle('preenchida', alvo.value !== '');

  // ao escolher um EPI do catálogo, completa o C.A da mesma linha
  if (campo === 'descricao') {
    const epi = estado.epis.find(e => e.descricao.toLowerCase() === alvo.value.trim().toLowerCase());
    if (epi && epi.ca) {
      const campoCa = ficha.querySelector(`.cx[data-linha="${i}"][data-campo="ca"]`);
      if (campoCa && !campoCa.value) {
        campoCa.value = epi.ca;
        r.linhas[i].ca = epi.ca;
        campoCa.closest('.cw').classList.add('preenchida');
      }
      // avisa, mas não impede: quem decide é você
      if (caReprovado(epi)) {
        mostrarAviso(`Atenção: o C.A ${epi.ca} de ${epi.descricao} está ${estadoCa(epi).rotulo} no ConsultaCA.`);
      }
    }
  }
});

$('bSalvarFichas').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  botao.disabled = true; botao.textContent = 'Salvando...';
  const mes = +$('selMes').value, ano = +$('selAno').value;
  const usadas = new Set();
  for (const f of estado.funcionarios.filter(x => marcados.has(x.id))) {
    const ch = chaveFicha(f.id, mes, ano);
    const r = rascunhos.get(ch);
    if (!r) continue;
    const linhas = r.linhas.filter(l => Object.values(l).some(v => String(v || '').trim()));
    usadas.add(ch);
    await db.salvarFicha({
      id: r.id, funcionario_id: f.id, mes, ano,
      setor: f.setor || modeloAtual().setor_padrao || 'CAMPO', linhas,
    });
  }
  botao.textContent = usadas.size ? 'Salvo' : 'Salvar preenchimento';
  setTimeout(() => { botao.textContent = 'Salvar preenchimento'; botao.disabled = false; }, 1600);
});

$('bLimparFichas').addEventListener('click', () => {
  if (!confirm('Limpar as linhas preenchidas das fichas visíveis?')) return;
  const mes = +$('selMes').value, ano = +$('selAno').value;
  estado.funcionarios.filter(f => marcados.has(f.id))
    .forEach(f => rascunhos.delete(chaveFicha(f.id, mes, ano)));
  atualizarFichas();
});

['busca', 'fSit'].forEach(id => $(id).addEventListener('input', desenharSelecao));
['selMes', 'selAno', 'selLinhas'].forEach(id => $(id).addEventListener('input', atualizarFichas));
$('bTodos').addEventListener('click', () => { visiveis().forEach(f => marcados.add(f.id)); desenharSelecao(); });
$('bNenhum').addEventListener('click', () => { marcados.clear(); desenharSelecao(); });
$('bImprimir').addEventListener('click', () => window.print());
$('zoom').addEventListener('input', () => {
  const z = $('zoom').value;
  $('zoomV').textContent = z + '%';
  $('saida').style.transform = `scale(${z / 100})`;
  $('saida').style.transformOrigin = 'top center';
});

/* =============== aba LISTA DE PRESENÇA =============== */
function preencherLista() {
  const c = listaAtual(modeloAtual());
  $('lpTitulo').value = c.titulo || '';
  $('lpCodigo').value = c.codigo || '';
  $('lpData').value = c.data || '';
  $('lpRevisao').value = c.revisao || '';
  $('lpElaboracao').value = c.elaboracao || '';
  $('lpAprovacao').value = c.aprovacao || '';
}

function visiveisLista() {
  const q = $('buscaLista').value.trim().toLowerCase();
  const s = $('fSitLista').value, sel = selDe('uniLista');
  return estado.funcionarios.filter(f =>
    (!q || f.nome.toLowerCase().includes(q)) &&
    (!s || f.situacao === s) &&
    casaUnidade(f, sel));
}

function desenharSelecaoLista() {
  const vs = visiveisLista(), box = $('listaSelLista');
  // empregadores (21/10/2026): entram na lista com a função "Proprietário"
  const emps = (jd.dados.empregadores || []).filter(e => e.ativo !== false)
    .slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const q = $('buscaLista').value.trim().toLowerCase();
  const blocoEmp = emps.filter(e => !q || (e.nome || '').toLowerCase().includes(q)).map(e => `
    <label class="item" for="le_${e.id}">
      <input type="checkbox" id="le_${e.id}" data-emp="${e.id}" ${naListaEmp.has(String(e.id)) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(e.nome)}</span><br>
        <span class="sub">Proprietário · empregador</span>
      </span>
      <span class="tag ativo">EMPREGADOR</span>
    </label>`).join('');
  box.innerHTML = blocoEmp + (vs.length ? vs.map(f => `
    <label class="item" for="l_${f.id}">
      <input type="checkbox" id="l_${f.id}" data-id="${f.id}" ${naLista.has(f.id) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
    </label>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>');

  box.querySelectorAll('input[type=checkbox][data-id]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? naLista.add(cb.dataset.id) : naLista.delete(cb.dataset.id);
      atualizarLista();
    }));
  box.querySelectorAll('input[type=checkbox][data-emp]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? naListaEmp.add(cb.dataset.emp) : naListaEmp.delete(cb.dataset.emp);
      atualizarLista();
    }));
  atualizarLista();
}

// o que está digitado no cabeçalho agora (aparece na prévia antes de salvar)
const cabecalhoLista = () => ({
  ...listaAtual(modeloAtual()),
  titulo: $('lpTitulo').value,
  codigo: $('lpCodigo').value,
  data: $('lpData').value,
  revisao: $('lpRevisao').value,
  elaboracao: $('lpElaboracao').value,
  aprovacao: $('lpAprovacao').value,
});

function atualizarLista() {
  // empregadores marcados vêm primeiro, como "Proprietário"
  const patroes = (jd.dados.empregadores || [])
    .filter(e => naListaEmp.has(String(e.id)))
    .map(e => ({ nome: e.nome, cargo: 'Proprietário' }));
  const gente = [...patroes, ...estado.funcionarios.filter(f => naLista.has(f.id))];
  $('cntLista').textContent = gente.length;
  $('saidaLista').innerHTML = montarLista(gente, cabecalhoLista(), {
    tema: $('lpTema').value, horario: $('lpHorario').value, ministrante: $('lpMinistrante').value,
  });
  $('cntFolhas').textContent = $('saidaLista').children.length;
}

['lpTitulo', 'lpCodigo', 'lpData', 'lpRevisao', 'lpElaboracao', 'lpAprovacao',
 'lpTema', 'lpHorario', 'lpMinistrante']
  .forEach(id => $(id).addEventListener('input', atualizarLista));

['buscaLista', 'fSitLista'].forEach(id =>
  $(id).addEventListener('input', desenharSelecaoLista));
$('bTodosLista').addEventListener('click', ev => {
  ev.preventDefault();
  visiveisLista().forEach(f => naLista.add(f.id));
  desenharSelecaoLista();
});
$('bNenhumLista').addEventListener('click', ev => {
  ev.preventDefault();
  naLista.clear(); naListaEmp.clear();
  desenharSelecaoLista();
});
$('bImprimirLista').addEventListener('click', () => window.print());

/* Campanhas (21/10/2026): "Gerar lista" chega aqui com tema, horário,
   ministrante e os funcionários já marcados. */
window.prepararListaPresenca = ({ tema = '', horario = '', ministrante = '', ids = [] } = {}) => {
  $('lpTema').value = tema; $('lpHorario').value = horario; $('lpMinistrante').value = ministrante;
  naLista.clear(); naListaEmp.clear();
  ids.forEach(id => naLista.add(id));
  $('fSitLista').value = ''; $('buscaLista').value = '';
  desenharSelecaoLista();
};
$('zoomLista').addEventListener('input', () => {
  const z = $('zoomLista').value;
  $('zoomVLista').textContent = z + '%';
  $('saidaLista').style.transform = `scale(${z / 100})`;
  $('saidaLista').style.transformOrigin = 'top center';
});

$('formLista').addEventListener('submit', async ev => {
  ev.preventDefault();
  const c = cabecalhoLista();
  await db.salvarModelo({
    ...modeloAtual(),
    lista: {
      titulo: c.titulo.trim(), codigo: c.codigo.trim(), data: c.data.trim(),
      revisao: c.revisao.trim(), elaboracao: c.elaboracao.trim(), aprovacao: c.aprovacao.trim(),
    },
  });
  atualizarLista();
  const b = ev.submitter; if (b) { b.textContent = 'Salvo'; setTimeout(() => b.textContent = 'Salvar cabeçalho', 1600); }
});

$('bRestaurarLista').addEventListener('click', async () => {
  if (!confirm('Voltar os textos do cabeçalho ao original do formulário?')) return;
  await db.salvarModelo({ ...modeloAtual(), lista: { ...LISTA_PADRAO } });
  preencherLista(); atualizarLista();
});

/* =============== aba FUNCIONÁRIOS =============== */
function desenharFuncionarios() {
  const q = $('buscaFunc').value.trim().toLowerCase();
  const s = $('fSitFunc').value;
  const sel = selDe('uniFunc');
  const lista = estado.funcionarios.filter(f =>
    (!q || [f.nome, f.cargo, f.cadastro, f.empregador, f.fazenda].some(v => String(v || '').toLowerCase().includes(q))) &&
    (!s || f.situacao === s) &&
    casaUnidade(f, sel));
  const total = estado.funcionarios.length;
  $('cntFunc').textContent = lista.length === total ? total : `${lista.length} de ${total}`;
  $('listaFunc').innerHTML = lista.length ? lista.map(f => `
    <div class="item" data-id="${f.id}" style="grid-template-columns:1fr auto auto">
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')}${faixaDe(f.id) ? ' · faixa ' + faixaDe(f.id) : ''} · ${esc(f.empregador || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}${f.admissao ? ' · desde ' + esc(dataBr(f.admissao)) : ''}</span>${
          f.situacao === 'ATIVO' && etiquetaFicha(f.id) ? `<br><span class="fer-etiquetas">${etiquetaFicha(f.id)}</span>` : ''}
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
      <span class="acoes">
        ${iv.desligPendente(f) ? `<button class="btn mini perigo" data-deslig="${f.id}" title="Inativo sem data, tipo e motivo do desligamento">Registrar desligamento</button>` : ''}
        <button class="btn mini" data-ficha="${f.id}">Ficha</button>
        <button class="btn mini" data-editar="${f.id}">Editar</button>
      </span>
    </div>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  /* Inativado sem passar pelo diálogo (ex.: importação de planilha): o
     turnover precisa da data, do tipo e do motivo (D-28). */
  $('listaFunc').querySelectorAll('[data-deslig]').forEach(b =>
    b.addEventListener('click', async () => {
      const f = estado.funcionarios.find(x => x.id === b.dataset.deslig);
      const mov = f && await iv.pedirMovimento('desligar', { nome: f.nome, admissao: iv.abertoDe(f.id)?.admissao || f.admissao });
      if (!mov) return;
      await iv.desligar(f, mov);
      await tarefasDoMovimento(f, 'demissao', mov.data);
      desenharFuncionarios();
    }));

  $('listaFunc').querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirFuncionario(b.dataset.editar)));
  desenharPendentesPlano();
  /* Ficha do Funcionário: prévia na tela primeiro, imprimir é escolha dele. */
  $('listaFunc').querySelectorAll('[data-ficha]').forEach(b =>
    b.addEventListener('click', () =>
      verFichaCadastral(estado.funcionarios.find(x => x.id === b.dataset.ficha))));
}

const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

/* =============== plano de cargos no cadastro (24/09/2026) ===============
   A função do funcionário segue o plano de cargos do RH: o nível
   (Estratégico, Tático, Operacional) vem da função, a faixa (A a E) é da
   pessoa e fica no vínculo. Só a letra — o valor em dinheiro continua só
   no RH, onde a RLS de rh_* segura quem vê salário. */
const faixaDe = id => jd.vinculoDe(id)?.faixa || '';
const funcaoDe = id => jd.dados.funcoes.find(x => x.id === jd.vinculoDe(id)?.funcao_id);

/* Quem está ativo e ainda não tem função do plano (sem função, ou numa
   função que saiu de uso, como o "Tratorista" sem nível). Decisão dele:
   ninguém é chutado para um nível — fica pendente até alguém escolher. */
function desenharPendentesPlano() {
  const caixa = $('avisoPlano');
  if (!caixa) return;
  const ativos = estado.funcionarios.filter(f => (f.situacao || 'ATIVO') === 'ATIVO');
  const semFuncao = ativos.filter(f => { const fn = funcaoDe(f.id); return !fn || fn.ativo === false; })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const semFaixa = ativos.filter(f => { const fn = funcaoDe(f.id); return fn?.rh_cargo_id && fn.ativo !== false && !faixaDe(f.id); })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  if (!semFuncao.length && !semFaixa.length) { caixa.hidden = true; caixa.innerHTML = ''; return; }
  const aberto = caixa.open;
  const pedaco = (lista, titulo) => lista.length ? `<p style="margin:8px 0 4px"><b>${titulo}</b></p>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${lista.map(f =>
      `<button type="button" class="btn mini" data-pend="${f.id}" title="${esc(f.cargo || 'sem função')}">${esc(f.nome)}</button>`).join('')}</div>` : '';
  caixa.innerHTML = `<summary style="cursor:pointer">Plano de cargos: <b>${semFuncao.length}</b> ativo(s) sem função do plano`
    + ` · <b>${semFaixa.length}</b> sem faixa — clique para ver</summary>`
    + pedaco(semFuncao, 'Sem função do plano — escolha a função com o nível certo (ex.: Tratorista I a IV):')
    + pedaco(semFaixa, 'Com função do plano, sem faixa:');
  caixa.open = aberto;
  caixa.hidden = false;
  caixa.querySelectorAll('[data-pend]').forEach(b =>
    b.addEventListener('click', () => abrirFuncionario(b.dataset.pend)));
}

function mostrarNivel() {
  const fn = jd.dados.funcoes.find(x => x.id === $('fuCargo').value);
  mostrarTreinos(fn);
  $('fuNivel').textContent = !fn ? ''
    : fn.ativo === false ? 'Função fora de uso — escolha a do plano de cargos.'
    : fn.rh_cargo_id ? `Nível ${fn.nivel || '—'}`
    : `Fora do plano de cargos${fn.nivel ? ' · nível ' + fn.nivel : ''}`;
}

/* Treinamentos da função (20/10/2026): ao escolher a função no cadastro, a
   linha embaixo diz o que ela exige (SST › Treinamentos por função) e o que
   essa pessoa ainda não fez. O SST carrega em segundo plano se preciso. */
function mostrarTreinos(fn) {
  const alvo = $('fuTreinos');
  if (!alvo) return;
  const nome = fn?.nome || '';
  const id = editandoFunc?.id;
  alvo.textContent = resumoCadastro(nome, id);
  // Atividades que a pessoa faz (22/10/2026): marcar muda o que ela é cobrada
  desenharAtvFuncionario(id, () => { alvo.textContent = resumoCadastro(nome, id); });
  if (nome && !alvo.textContent) {
    sstPronto().then(() => {
      if (($('fuCargo').value || '') === (fn.id || '')) alvo.textContent = resumoCadastro(nome, id);
    }).catch(() => {});
  }
}

/* Funções agrupadas pelo nível, na ordem do plano de cargos. A função atual
   que saiu de uso continua aparecendo, marcada, para não sumir calada. */
function opcoesFuncao(sel) {
  const todas = jd.dados.funcoes;
  const uso = todas.filter(x => x.ativo !== false)
    .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const opt = x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`;
  const grupos = [...NIVEIS.map(n => [n, uso.filter(x => x.rh_cargo_id && x.nivel === n)]),
    ['', uso.filter(x => !x.rh_cargo_id || !NIVEIS.includes(x.nivel))]]
    .filter(([, itens]) => itens.length)
    .map(([n, itens]) => `<optgroup label="${esc(n ? 'Nível ' + n : 'Fora do plano de cargos')}">${itens.map(opt).join('')}</optgroup>`)
    .join('');
  const atual = todas.find(x => x.id === sel && x.ativo === false);
  return '<option value=""></option>'
    + (atual ? `<option value="${atual.id}" selected>${esc(atual.nome)} (fora de uso — escolha o nível)</option>` : '')
    + grupos;
}

/** Gera as tarefas de admissão/demissão sem travar o cadastro se falhar. */
async function tarefasDoMovimento(f, evento, data) {
  try {
    const n = await gerarTarefas(f, evento, data);
    if (n) mostrarAviso(`${n} tarefa(s) de ${evento === 'admissao' ? 'admissão' : 'demissão'} criada(s) — Cadastros › Admissão e demissão.`);
  } catch (e) { console.warn('tarefas de admissão/demissão', e); }
}

function abrirFuncionario(id) {
  const f = id ? estado.funcionarios.find(x => x.id === id) : null;
  editandoFunc = f ? { ...f } : { id: db.novoId(), situacao: 'ATIVO', setor: modeloAtual().setor_padrao || 'CAMPO' };
  $('tituloFunc').textContent = f ? 'Editar funcionário' : 'Novo funcionário';
  $('fuNome').value = editandoFunc.nome || '';
  $('fuApelido').value = editandoFunc.apelido || '';
  $('fuCadastro').value = editandoFunc.cadastro || '';
  $('fuNascimento').value = (editandoFunc.nascimento || '').slice(0, 10);
  $('fuSexo').value = editandoFunc.sexo || '';
  $('fuOrigem').value = editandoFunc.origem || '';
  $('fuTelefone').value = editandoFunc.telefone || '';
  $('fuAdmissao').value = (editandoFunc.admissao || '').slice(0, 10);
  $('fuCpf').value = mascaraCpf(editandoFunc.cpf || '');
  conferirCampoCpf(false);
  montarListasDoCadastro(editandoFunc);
  $('fuCalcado').value = editandoFunc.tam_calcado || '';
  $('fuCamisa').value = editandoFunc.tam_camisa || '';
  $('fuSituacao').value = editandoFunc.situacao || 'ATIVO';
  preencherFichaCompleta(editandoFunc);
  $('bApagarFunc').hidden = !f;
  fotoFunc().abrir(f ? f.id : null);
  $('dlgFunc').showModal();
}

/* Foto do funcionário no Google Drive (15/10/2026). */
let _fotoFunc = null;
const fotoFunc = () => _fotoFunc || (_fotoFunc = campoAnexos($('fuFoto'),
  { area: 'pessoas', tipo: 'funcionario', rotulo: 'Foto do funcionário', dica: 'tire ou escolha uma foto', foto: true }));

/* Os três blocos recolhidos da ficha: contato e emergência, endereço e
   transporte, documentos. Um mapa só serve para preencher e para salvar —
   acrescentar campo novo é mexer aqui e no index.html, em mais lugar nenhum. */
const FICHA = {
  fuTelRecado: 'telefone_recado',
  fuEmergNome: 'emergencia_nome',
  fuEmergParentesco: 'emergencia_parentesco',
  fuEmergTelefone: 'emergencia_telefone',
  fuCep: 'cep',
  fuLogradouro: 'logradouro',
  fuBairro: 'bairro',
  fuMunicipio: 'municipio',
  fuReferencia: 'referencia',
  fuPontoEmbarque: 'ponto_embarque',
  fuRg: 'rg',
  fuRgOrgao: 'rg_orgao',
  fuPis: 'pis',
  fuCtps: 'ctps',
  fuEstadoCivil: 'estado_civil',
  fuEscolaridade: 'escolaridade',
  fuNomeMae: 'nome_mae',
  fuNaturalidade: 'naturalidade',
  // Dados bancários e Pix (19/10/2026) — a chave Pix sai no recibo de empréstimo.
  fuBanco: 'banco',
  fuAgencia: 'agencia',
  fuConta: 'conta',
  fuContaTipo: 'conta_tipo',
  fuPixTipo: 'pix_tipo',
  fuPixChave: 'pix_chave',
};
/* Sim/Não/não informado: no banco é true, false ou nulo. */
const FICHA_SN = { fuAlojamento: 'alojamento', fuTransporte: 'transporte_empresa' };
const sn = v => (v === true ? '1' : v === false ? '0' : '');

function preencherFichaCompleta(f) {
  Object.entries(FICHA).forEach(([campo, col]) => { $(campo).value = f[col] || ''; });
  Object.entries(FICHA_SN).forEach(([campo, col]) => { $(campo).value = sn(f[col]); });
  /* Bloco que já tem algo preenchido abre sozinho — senão a informação fica
     escondida atrás de um triângulo e ninguém lembra de olhar. */
  document.querySelectorAll('#formFunc .fu-bloco').forEach(b => {
    b.open = [...b.querySelectorAll('input, select')].some(e => e.value);
  });
}

function lerFichaCompleta() {
  const dados = {};
  Object.entries(FICHA).forEach(([campo, col]) => { dados[col] = $(campo).value.trim() || null; });
  Object.entries(FICHA_SN).forEach(([campo, col]) => {
    const v = $(campo).value;
    dados[col] = v === '1' ? true : v === '0' ? false : null;
  });
  return dados;
}

/* As listas de unidade, setor e função saem dos cadastros do DP — é o que
   faz o cadastro do funcionário servir todos os módulos, sem digitar
   empregador e fazenda na mão em cada tela. */
function montarListasDoCadastro(f) {
  const temDP = pode('jornada') || pode('pessoas');
  const v = jd.vinculoDe(f.id);
  const opcoes = (lista, sel, rotulo = x => x.nome) =>
    '<option value=""></option>' + lista
      .filter(x => x.ativo !== false)
      .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(rotulo(x))}</option>`)
      .join('');

  $('fuUnidade').innerHTML = opcoes(jd.dados.unidades, v?.unidade_id, u => jd.nomeUnidade(u));
  $('fuSetor').innerHTML   = opcoes(jd.dados.setores, v?.setor_id);
  $('fuCargo').innerHTML   = opcoesFuncao(v?.funcao_id);
  $('fuFaixa').value = v?.faixa || '';
  /* Jornada e matrícula vieram do antigo Nível 2 (20/10/2026). Em branco, a
     jornada é a da função (ou do setor) — a dica diz qual. */
  $('fuJornada').innerHTML = opcoes(jd.dados.jornadas, v?.jornada_id);
  const jf = jd.dados.jornadas.find(j => j.id === jd.funcaoDe(v)?.jornada_id);
  const js = jd.dados.jornadas.find(j => j.id === jd.setorDe(v)?.jornada_id);
  $('fuJornadaDica').textContent = jf ? `Em branco = usa a jornada da função: ${jf.nome}.`
    : js ? `Em branco = usa a jornada do setor: ${js.nome}.` : 'Em branco = sem jornada (a função e o setor não têm).';
  $('fuMatricula').value = v?.matricula || f.cadastro || '';
  mostrarNivel();

  // Ainda sem vínculo: mostra o que estava escrito, para não parecer que sumiu.
  const escrito = [f.empregador, f.fazenda].filter(Boolean).join(' · ');
  $('fuUnidadeAtual').textContent = (!v?.unidade_id && escrito)
    ? 'Hoje está escrito: ' + escrito + ' — escolha a unidade para padronizar.'
    : '';

}

/* O Cadastro Nível 2 (jornada e riscos) foi desligado em 20/10/2026: jornada e
   matrícula vieram para o Nível 1; periculosidade, insalubridade, contrato e
   ticket foram para RH › Salários, na ficha da pessoa. */

$('bNovoFunc').addEventListener('click', () => abrirFuncionario(null));
$('bImprimirFichaCad').addEventListener('click', imprimirFichaCadastral);
$('bFecharFichaCad').addEventListener('click', fecharFichaCadastral);
['buscaFunc', 'fSitFunc'].forEach(id => $(id).addEventListener('input', desenharFuncionarios));
$('fuCargo').addEventListener('change', mostrarNivel);

$('formFunc').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = {
    ...editandoFunc,
    nome: $('fuNome').value.trim().replace(/\s+/g, ' '),
    apelido: $('fuApelido').value.trim(),
    cadastro: $('fuCadastro').value.trim(),
    nascimento: $('fuNascimento').value || null,
    sexo: $('fuSexo').value || null,
    origem: $('fuOrigem').value || null,
    telefone: $('fuTelefone').value.trim(),
    admissao: $('fuAdmissao').value || null,
    cpf: mascaraCpf($('fuCpf').value),
    tam_calcado: $('fuCalcado').value.trim(),
    tam_camisa: $('fuCamisa').value.trim(),
    situacao: $('fuSituacao').value,
    ...lerFichaCompleta(),
  };
  if (!f.nome) return;
  /* CPF (26/10/2026): em branco pode; preenchido, tem que ser válido e não
     pode ser de outro funcionário já cadastrado. */
  const problemaCpf = conferirCampoCpf(true);
  if (problemaCpf) {
    const el = $('fuCpf');
    el.setCustomValidity(problemaCpf); el.reportValidity(); el.focus();
    return;
  }
  // Unidade, setor e função são do módulo Cadastros: quem tem Cadastros grava.
  const temDP = pode('jornada') || pode('pessoas');

  /* Indicadores (30/09/2026): antes de salvar, pergunta o que aconteceu
     quando a situação ou o empregador muda. Cancelar = não salva nada. */
  const antes = estado.funcionarios.find(x => x.id === f.id) || null;
  const eraAtivo = antes ? (antes.situacao || 'ATIVO') === 'ATIVO' : null;
  const vAntes = jd.vinculoDe(f.id);
  const retratoAntes = antes ? iv.retrato(antes) : null;
  const uNova = temDP ? jd.dados.unidades.find(u => u.id === $('fuUnidade').value) : null;
  let mov = null;
  if (antes && eraAtivo && f.situacao === 'INATIVO') {
    mov = await iv.pedirMovimento('desligar', { nome: f.nome, admissao: iv.abertoDe(f.id)?.admissao || f.admissao });
    if (!mov) return;
  } else if (antes && !eraAtivo && f.situacao === 'ATIVO') {
    mov = await iv.pedirMovimento('reativar', { nome: f.nome });
    if (!mov) return;
    if (mov.escolha === 'readmissao') f.admissao = mov.data;
  } else if (antes && eraAtivo && f.situacao === 'ATIVO' && vAntes?.unidade_id && uNova && uNova.id !== vAntes.unidade_id) {
    const uVelha = jd.dados.unidades.find(u => u.id === vAntes.unidade_id);
    mov = await iv.pedirMovimento('transferir', {
      nome: f.nome, de: jd.nomeUnidade(uVelha), para: jd.nomeUnidade(uNova),
      mesmoEmpregador: uVelha?.empregador_id === uNova.empregador_id,
    });
    if (!mov) return;
  }

  /* O que foi escolhido nas listas vira também texto no cadastro, porque a
     ficha de EPI e a lista de presença imprimem esses nomes. Sem escolha,
     o que já estava escrito fica como estava. */
  const unidade = temDP ? jd.dados.unidades.find(u => u.id === $('fuUnidade').value) : null;
  const setor   = temDP ? jd.dados.setores.find(s => s.id === $('fuSetor').value) : null;
  const funcao  = temDP ? jd.dados.funcoes.find(x => x.id === $('fuCargo').value) : null;

  if (unidade) {
    f.empregador = jd.empregadorDe(unidade)?.nome || f.empregador;
    f.fazenda = jd.fazendaDe(unidade)?.nome || f.fazenda;
  }
  if (setor) f.setor = setor.nome;
  if (funcao) f.cargo = funcao.nome;

  /* Empregador, fazenda, setor e cargo saem daqui sempre em maiúsculas.
     São texto livre gravado no funcionário, e é por eles que o quadro de
     pessoal agrupa: uma pessoa cadastrada como "Campo" e o resto como "CAMPO"
     abria duas linhas no relatório, cada uma com a sua fatia. O padrão é
     maiúscula porque o nome das pessoas já é assim. */
  ['empregador', 'fazenda', 'setor', 'cargo'].forEach(k => {
    if (f[k]) f[k] = String(f[k]).trim().replace(/\s+/g, ' ').toUpperCase();
  });

  await db.salvarFuncionario(f);
  try { await fotoFunc().salvar(f.id); } catch (e) { alert('O cadastro foi salvo, mas a foto não: ' + e.message); }

  if (temDP) {
    /* Periculosidade, insalubridade, contrato e ticket NÃO passam por aqui:
       moram no RH › Salários (ficha da pessoa), desde 20/10/2026. */
    await jd.salvarVinculo(f.id, {
      unidade_id: $('fuUnidade').value || null,
      setor_id: $('fuSetor').value || null,
      funcao_id: $('fuCargo').value || null,
      faixa: $('fuFaixa').value || null,
      jornada_id: $('fuJornada').value || null,
      matricula: $('fuMatricula').value.trim() || null,
      admissao: f.admissao,
      ativo: f.situacao === 'ATIVO',
    });
  }

  /* Vínculo dos indicadores: desligamento, readmissão, transferência ou só
     manter em dia o retrato (unidade, setor, sexo…) do vínculo aberto. */
  try {
    if (mov?.modo === 'desligar') await iv.desligar(f, mov);
    else if (mov?.modo === 'reativar') await (mov.escolha === 'readmissao' ? iv.readmitir(f, mov.data) : iv.corrigirReativacao(f));
    else if (mov?.modo === 'transferir' && mov.escolha === 'transferencia')
      await iv.transferir(f, retratoAntes, mov.data, mov.tipo, jd.nomeUnidade(uNova));
    else await iv.sincronizar(f);
  } catch (e) { console.warn('vínculo dos indicadores', e); }

  /* Admissão e demissão (23/10/2026): funcionário novo ativo e readmissão
     geram a lista de admissão; desligamento, a de demissão. Só daqui para
     frente — decisão dele. */
  if (!antes && f.situacao === 'ATIVO') await tarefasDoMovimento(f, 'admissao', f.admissao);
  else if (mov?.modo === 'reativar' && mov.escolha === 'readmissao') await tarefasDoMovimento(f, 'admissao', mov.data);
  else if (mov?.modo === 'desligar') await tarefasDoMovimento(f, 'demissao', mov.data);

  $('dlgFunc').close();
  preencherControles(); desenharFuncionarios(); desenharSelecao();

  /* Brigada e primeiros socorros (22/10/2026): se quem saiu era brigadista ou
     socorrista designado, avisa como fica a conta e quem pode repor. */
  if (mov?.modo === 'desligar') {
    const aviso = await avisoDesligamentoBrigada(f.id).catch(() => '');
    if (aviso) alert(aviso);
  }
});

$('bApagarFunc').addEventListener('click', async () => {
  if (!editandoFunc?.id) return;
  if (!confirm(`Apagar ${editandoFunc.nome}? As fichas salvas dele também saem.`)) return;
  await db.apagarFuncionario(editandoFunc.id);
  marcados.delete(editandoFunc.id);
  naLista.delete(editandoFunc.id);
  $('dlgFunc').close();
  desenharFuncionarios(); desenharSelecao();
});

/* =============== importar a planilha =============== */
const ROTULOS = {
  apelido: 'apelido', cpf: 'CPF', nascimento: 'nascimento', telefone: 'telefone',
  cadastro: 'nº de cadastro', admissao: 'admissão', empregador: 'empregador',
  fazenda: 'fazenda', setor: 'setor', cargo: 'cargo',
  tam_camisa: 'tam. camisa', tam_calcado: 'tam. calçado',
};
let importacao = null;   // { novos, completar } segurando o resultado da conferência

$('bImportar').addEventListener('click', () => { $('arqPlanilha').value = ''; $('arqPlanilha').click(); });

$('arqPlanilha').addEventListener('change', async ev => {
  const arquivo = ev.target.files && ev.target.files[0];
  if (!arquivo) return;
  const erro = $('erroImportar'); erro.hidden = true;
  $('resumoImportar').innerHTML = '<div class="imp-nada">Lendo a planilha...</div>';
  $('bConfirmarImportar').disabled = true;
  $('dicaImportar').textContent = '';
  $('dlgImportar').showModal();
  try {
    const daPlanilha = await lerFuncionarios(arquivo);
    if (!daPlanilha.length) throw new Error('Não achei nenhuma pessoa preenchida na aba Funcionários.');
    importacao = comparar(daPlanilha, estado.funcionarios);
    desenharImportacao(arquivo.name, daPlanilha.length);
  } catch (e) {
    importacao = null;
    $('resumoImportar').innerHTML = '';
    erro.textContent = e?.message || 'Não consegui ler a planilha.';
    erro.hidden = false;
  }
});

function desenharImportacao(nomeArquivo, lidas) {
  const { novos, completar, iguais } = importacao;
  const bloco = (titulo, itens, corpo) => `
    <div class="imp-grupo">
      <h4>${esc(titulo)}</h4>
      <div class="cx">${itens.length ? itens.map(corpo).join('') : '<div class="imp-nada">Nenhum.</div>'}</div>
    </div>`;

  $('resumoImportar').innerHTML =
    `<p class="dica">${esc(nomeArquivo)} · ${lidas} pessoa(s) na planilha.</p>` +
    bloco(`Entram no cadastro (${novos.length})`, novos, p => `
      <div class="imp-linha"><b>${esc(p.nome)}</b>
        <span class="sub">${esc(p.cargo || '—')} · ${esc(p.empregador || '—')}${p.cadastro ? ' · nº ' + esc(p.cadastro) : ''}${p.nascimento ? ' · nasc. ' + esc(dataBr(p.nascimento)) : ''}</span>
      </div>`) +
    bloco(`Já cadastrados, completando o que está em branco (${completar.length})`, completar, c => `
      <div class="imp-linha"><b>${esc(c.atual.nome)}</b>
        <span class="sub">achado por ${esc(c.por)} · ${c.campos.length ? 'completa ' + c.campos.map(x => ROTULOS[x] || x).join(', ') : 'sem campos a completar'}${c.trocaSituacao ? ` · passa para ${esc(c.planilha.situacao)}` : ''}</span>
      </div>`);

  $('dicaImportar').textContent = `${iguais.length} já estão iguais e não serão tocados.`;
  $('bConfirmarImportar').disabled = !(novos.length || completar.length);
}

$('formImportar').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!importacao) return;
  const botao = $('bConfirmarImportar');
  botao.disabled = true; botao.textContent = 'Gravando...';
  const { novos, completar } = importacao;
  try {
    for (const p of novos) {
      const f = { id: db.novoId() };
      for (const campo of ['nome', 'apelido', 'cpf', 'nascimento', 'telefone', 'cadastro',
        'admissao', 'empregador', 'fazenda', 'setor', 'cargo', 'tam_camisa', 'tam_calcado', 'situacao']) {
        f[campo] = p[campo] || (campo === 'nascimento' || campo === 'admissao' ? null : '');
      }
      f.situacao = p.situacao;
      await db.salvarFuncionario(f);
    }
    for (const c of completar) {
      await db.salvarFuncionario(aplicarEm(c.atual, c.planilha, c.campos, c.trocaSituacao));
    }
    mostrarAviso(`Importação pronta: ${novos.length} novo(s) e ${completar.length} completado(s).`);
  } finally {
    botao.textContent = 'Gravar';
    importacao = null;
    $('dlgImportar').close();
    preencherControles(); desenharFuncionarios(); desenharSelecao(); desenharSelecaoLista();
  }
});

function mostrarAviso(texto) {
  const a = $('avisoGlobal');
  a.textContent = texto; a.className = 'aviso ok'; a.hidden = false;
  setTimeout(() => { a.hidden = true; a.className = 'aviso info'; }, 6000);
}

/* CPF com pontos e traço ao digitar (pedido dele, 20/10/2026): ele digita só os
   números e a máscara 000.000.000-00 entra sozinha. Vale ao digitar, ao colar e
   ao abrir um cadastro antigo gravado só com dígitos. Até 11 dígitos. */
function mascaraCpf(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
}
$('fuCpf').addEventListener('input', ev => {
  const el = ev.target;
  const noFim = el.selectionStart === el.value.length;
  el.value = mascaraCpf(el.value);
  if (noFim) el.setSelectionRange(el.value.length, el.value.length);
  conferirCampoCpf(false);
});

/* Validação do CPF (pedido dele, 26/10/2026). Regra da Receita: 11 dígitos,
   não todos iguais, e os dois dígitos verificadores batendo (módulo 11).
   Em branco é permitido — tem cadastro antigo sem CPF. */
function cpfValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += +d[i] * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

/* Devolve o problema do CPF digitado (ou '' se está tudo certo) e mostra o
   recado embaixo do campo. Enquanto ainda está digitando (ao salvar = false),
   não reclama de CPF incompleto. */
function conferirCampoCpf(aoSalvar) {
  const el = $('fuCpf'), msg = $('fuCpfMsg');
  const d = el.value.replace(/\D/g, '');
  let problema = '';
  if (d && (d.length === 11 || aoSalvar)) {
    if (d.length !== 11) problema = 'CPF incompleto: são 11 números.';
    else if (!cpfValido(d)) problema = 'CPF inválido: confira os números.';
    else {
      const outro = estado.funcionarios.find(x => x.id !== editandoFunc?.id &&
        String(x.cpf || '').replace(/\D/g, '') === d);
      if (outro) problema = `Este CPF já está no cadastro de ${outro.nome}.`;
    }
  }
  el.setCustomValidity(problema);
  msg.textContent = problema || (d.length === 11 ? 'CPF válido.' : '');
  msg.className = 'cpf-msg' + (problema ? ' erro' : ' ok');
  msg.hidden = !msg.textContent;
  return problema;
}

/* =============== aba ANIVERSARIANTES =============== */
function listaAniversarios() {
  const mes = +$('anMes').value;
  const soAtivos = $('anSit').value === 'ativos';
  // os empregadores entram na mesma folha quando têm data de nascimento
  const patroes = jd.dados.empregadores || [];
  return { mes, ano: +$('anAno').value || new Date().getFullYear(), soAtivos, patroes,
    gente: aniversariantes(estado.funcionarios, mes, soAtivos, patroes) };
}

/* Formato "Com fotos" (20/10/2026): a foto de cada funcionário vem do Drive
   (chave pessoas/funcionario/<id>/foto.*), num pedido só para a lista toda.
   Devolve Map id → endereço blob:; quem não tem foto (ou é empregador, que
   não tem cadastro de foto) fica de fora e sai com as iniciais. */
const comFotos = () => $('anFormato').value === 'fotos';
async function fotosAniversarios(gente) {
  const ids = gente.filter(a => !a.eEmpregador).map(a => String(a.id));
  const fotos = new Map();
  if (!ids.length) return fotos;
  try {
    const chaves = await fotosDe('pessoas', 'funcionario', ids);
    await Promise.all([...chaves].map(async ([id, chave]) => {
      try { fotos.set(id, await urlDoArquivo(chave)); } catch { /* sem internet: iniciais */ }
    }));
  } catch { /* sem banco: iniciais */ }
  return fotos;
}

let vezAniv = 0;
async function atualizarAniversarios() {
  const { mes, ano, soAtivos, gente, patroes } = listaAniversarios();
  const vez = ++vezAniv;

  $('anLista').innerHTML = gente.length ? gente.map(a => `
    <div class="item" style="grid-template-columns:auto 1fr">
      <span class="tag ativo">dia ${String(a.dia).padStart(2, '0')}</span>
      <span class="nome">${esc(a.nome)}${a.apelido ? ' (' + esc(a.apelido) + ')' : ''}</span>
    </div>`).join('')
    : '<div class="vazio">Ninguém faz aniversário neste mês.</div>';

  const faltando = semNascimento(estado.funcionarios, soAtivos, patroes);
  const aviso = $('anAviso');
  if (faltando) {
    aviso.textContent = `${faltando} pessoa(s) ainda estão sem data de nascimento no cadastro — `
      + 'preencha em Cadastros › Funcionários (ou em Empregador e fazenda, no caso dos '
      + 'empregadores) para aparecerem aqui.';
    aviso.hidden = false;
  } else aviso.hidden = true;

  // sem fotos sai na hora; com fotos sai primeiro com as iniciais e, quando as
  // fotos chegam do Drive, a folha é redesenhada (se ele não mudou o filtro)
  const fotos = comFotos() ? new Map() : null;
  $('saidaAniversarios').innerHTML = montarAniversarios(gente, mes, ano, fotos);
  if (fotos) {
    const prontas = await fotosAniversarios(gente);
    if (vez === vezAniv && prontas.size) $('saidaAniversarios').innerHTML = montarAniversarios(gente, mes, ano, prontas);
  }
}

['anMes', 'anAno', 'anSit', 'anFormato'].forEach(id => $(id).addEventListener('input', atualizarAniversarios));
$('bImprimirAniv').addEventListener('click', () => window.print());
$('zoomAniv').addEventListener('input', () => {
  const z = $('zoomAniv').value;
  $('zoomVAniv').textContent = z + '%';
  $('saidaAniversarios').style.transform = `scale(${z / 100})`;
  $('saidaAniversarios').style.transformOrigin = 'top center';
});

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Manda a imagem do mês junto com o texto. O link do wa.me só carrega texto,
   então o caminho bom é o compartilhamento do próprio aparelho
   (navigator.share); onde ele não existe, a imagem é baixada e o WhatsApp abre
   com o texto para ele anexar. */
$('bWhatsapp').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  const { mes, ano, gente } = listaAniversarios();
  const texto = textoWhatsapp(gente, mes, ano);
  botao.disabled = true; botao.textContent = 'Preparando...';
  try {
    const png = await imagemAniversarios(gente, mes, ano, comFotos() ? await fotosAniversarios(gente) : null);
    const arquivo = new File([png], nomeImagem(mes, ano), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: texto });
    } else {
      baixar(png, arquivo.name);
      window.open(linkWhatsapp(texto), '_blank', 'noopener');
      mostrarAviso('A imagem foi baixada. No WhatsApp que abriu, anexe o arquivo ' +
        arquivo.name + ' junto com o texto.');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;          // ele fechou o compartilhamento
    window.open(linkWhatsapp(texto), '_blank', 'noopener');
  } finally {
    botao.disabled = false;
    botao.innerHTML = '<img class="ic-zap" src="img/whatsapp.png" alt="">Enviar no WhatsApp';
  }
});

$('bBaixarAniv').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  const { mes, ano, gente } = listaAniversarios();
  botao.disabled = true;
  try {
    baixar(await imagemAniversarios(gente, mes, ano, comFotos() ? await fotosAniversarios(gente) : null), nomeImagem(mes, ano));
  } finally { botao.disabled = false; }
});

$('bCopiarAniv').addEventListener('click', async ev => {
  const { mes, ano, gente } = listaAniversarios();
  const botao = ev.currentTarget;
  try {
    await navigator.clipboard.writeText(textoWhatsapp(gente, mes, ano));
    botao.textContent = 'Copiado';
  } catch { botao.textContent = 'Não deu para copiar'; }
  setTimeout(() => { botao.textContent = 'Copiar texto'; }, 1600);
});

/* =============== aba EPIS =============== */
// O número do C.A vira link para o ConsultaCA e a etiqueta ao lado mostra a
// validade que veio de lá. Quem busca no site é a função "consulta-ca".
// Periodicidade de troca do EPI: número + unidade. Em branco = conforme desgaste.
function textoTroca(e) {
  const n = Number(e.troca_qtd);
  if (!n) return '';
  const u = e.troca_unidade || 'meses';
  const sing = { dias: 'dia', semanas: 'semana', meses: 'mês' }[u] || u;
  return `troca a cada ${n} ${n === 1 ? sing : u}`;
}

function desenharEpis() {
  const q = $('buscaEpi').value.trim().toLowerCase();
  const lista = estado.epis.filter(e =>
    !q || [e.descricao, e.ca, e.atividade].some(v => String(v || '').toLowerCase().includes(q)));

  $('listaEpi').innerHTML = lista.length ? lista.map(e => {
    const s = estadoCa(e);
    const link = linkCa(e.ca);
    const numero = e.ca
      ? (link
        ? `<a href="${link}" target="_blank" rel="noopener">C.A ${esc(e.ca)}</a>`
        : `C.A ${esc(e.ca)}`)
      : 'sem C.A';
    return `
    <div class="item" style="grid-template-columns:1fr auto">
      <span>
        <span class="nome">${esc(e.descricao)}</span>
        ${s.rotulo ? `<span class="tag ${s.cor}">${esc(s.rotulo)}</span>` : ''}<br>
        <span class="sub">${numero}${e.observacao ? ' · ' + esc(e.observacao) : ''}${e.atividade ? ' · ' + esc(e.atividade) : ''} · ${textoTroca(e) ? '<b>' + esc(textoTroca(e)) + '</b>' + (e.troca_confirmada ? '' : ' <span class="tag alerta">a confirmar</span>') : 'troca conforme desgaste'}</span>
      </span>
      <span class="acoes"><button class="btn mini" data-editar="${e.id}">Editar</button></span>
    </div>`;
  }).join('')
    : '<div class="vazio">Nenhum EPI encontrado.</div>';

  $('listaEpi').querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirEpi(b.dataset.editar)));

  desenharRecadoCa();
}

function desenharRecadoCa() {
  const com = estado.epis.filter(e => e.ca && e.ca_conferido_em);
  const ruins = estado.epis.filter(e => caReprovado(e)).length;
  const perto = estado.epis.filter(e => estadoCa(e).chave === 'vencendo').length;
  const ultima = com.map(e => e.ca_conferido_em).sort().pop();

  const partes = [];
  if (ultima) partes.push(`Conferido no ConsultaCA em ${dataBrCa(ultima.slice(0, 10))}`);
  if (ruins) partes.push(`${ruins} C.A vencido ou irregular`);
  if (perto) partes.push(`${perto} vencendo em até 30 dias`);
  if (!ultima) partes.push('Os C.As ainda não foram conferidos no ConsultaCA.');
  $('caRecado').textContent = partes.join(' · ');
}

let conferindoCa = false;

async function conferirCa(forcar) {
  if (conferindoCa) return;
  conferindoCa = true;
  const botao = $('bConferirCa');
  const rotulo = botao.textContent;
  botao.disabled = true; botao.textContent = 'Conferindo...';
  try {
    const r = await conferirCas(estado.cliente, estado.epis, { forcar }, db.salvarEpi);
    desenharEpis(); preencherControles();
    if (r.erro && forcar) mostrarAviso(`Não deu para conferir agora: ${r.erro}`);
    else if (forcar) mostrarAviso(`C.As conferidos no ConsultaCA: ${r.conferidos}.`);
  } finally {
    botao.disabled = false; botao.textContent = rotulo;
    conferindoCa = false;
  }
}

$('bConferirCa').addEventListener('click', () => conferirCa(true));

function abrirEpi(id) {
  const e = id ? estado.epis.find(x => x.id === id) : null;
  editandoEpi = e ? { ...e } : { id: db.novoId(), ativo: true };
  $('tituloEpi').textContent = e ? 'Editar EPI' : 'Novo EPI';
  $('epDescricao').value = editandoEpi.descricao || '';
  $('epCa').value = editandoEpi.ca || '';
  $('epObs').value = editandoEpi.observacao || '';
  $('epAtividade').value = editandoEpi.atividade || '';
  $('epTrocaQtd').value = editandoEpi.troca_qtd || '';
  $('epTrocaUnidade').value = editandoEpi.troca_unidade || 'meses';
  $('bApagarEpi').hidden = !e;
  $('dlgEpi').showModal();
}

$('bNovoEpi').addEventListener('click', () => abrirEpi(null));
$('buscaEpi').addEventListener('input', desenharEpis);

$('formEpi').addEventListener('submit', async ev => {
  ev.preventDefault();
  const e = {
    ...editandoEpi,
    descricao: $('epDescricao').value.trim(),
    ca: $('epCa').value.trim(),
    observacao: $('epObs').value.trim(),
    atividade: $('epAtividade').value.trim(),
  };
  const qtd = parseInt($('epTrocaQtd').value, 10);
  e.troca_qtd = qtd > 0 ? qtd : null;
  e.troca_unidade = e.troca_qtd ? $('epTrocaUnidade').value : null;
  // Salvar aqui confirma a frequência (deixa de ser sugestão no Cronograma de troca).
  e.troca_confirmada = !!e.troca_qtd;
  if (!e.descricao) return;
  await db.salvarEpi(e);
  $('dlgEpi').close();
  preencherControles(); desenharEpis();
});

$('bApagarEpi').addEventListener('click', async () => {
  if (!editandoEpi?.id) return;
  if (!confirm(`Apagar "${editandoEpi.descricao}" do catálogo?`)) return;
  await db.apagarEpi(editandoEpi.id);
  $('dlgEpi').close();
  preencherControles(); desenharEpis();
});

/* =============== aba MODELO =============== */
function preencherModelo() {
  const m = modeloAtual();
  $('mTitulo').value = m.titulo || '';
  $('mRotuloFaz').value = m.rotulo_faz || '';
  $('mRotuloMer').value = m.rotulo_mer || '';
  $('mLegFaz').value = (m.legenda_faz || []).join('\n');
  $('mLegMer').value = (m.legenda_mer || []).join('\n');
  $('mDeclTitulo').value = m.declaracao_titulo || '';
  $('mDecls').value = (m.declaracoes || []).join('\n');
  $('mDeclLonga').value = m.declaracao_longa || '';
  $('mRodape').value = m.rodape_demissao || '';
  $('mSetor').value = m.setor_padrao || '';
  $('mLinhas').value = m.linhas_padrao || 20;
}

const emLinhas = txt => txt.split('\n').map(s => s.trim()).filter(Boolean);

$('formModelo').addEventListener('submit', async ev => {
  ev.preventDefault();
  await db.salvarModelo({
    ...modeloAtual(),
    titulo: $('mTitulo').value,
    rotulo_faz: $('mRotuloFaz').value,
    rotulo_mer: $('mRotuloMer').value,
    legenda_faz: emLinhas($('mLegFaz').value),
    legenda_mer: emLinhas($('mLegMer').value),
    declaracao_titulo: $('mDeclTitulo').value,
    declaracoes: emLinhas($('mDecls').value),
    declaracao_longa: $('mDeclLonga').value,
    rodape_demissao: $('mRodape').value,
    setor_padrao: $('mSetor').value,
    linhas_padrao: Math.max(1, Math.min(40, parseInt($('mLinhas').value) || 20)),
  });
  atualizarFichas();
  const b = ev.submitter; if (b) { b.textContent = 'Salvo'; setTimeout(() => b.textContent = 'Salvar modelo', 1600); }
});

$('bRestaurarModelo').addEventListener('click', async () => {
  if (!confirm('Voltar todos os textos ao original da planilha?')) return;
  await db.salvarModelo({ ...SEED_MODELO });
  preencherModelo(); atualizarFichas();
});

/* =============== geral =============== */
iv.ligarMovVinc();
document.querySelectorAll('[data-fechar]').forEach(b =>
  b.addEventListener('click', () => b.closest('dialog').close()));

/* Contador do topo (15/10/2026, rodada A). Antes "N para enviar" contava só a
   fila do EPI; DP, Reunião, anexos e as molduras (Máquinas e Patrimônio,
   Programação Campo) têm filas próprias que o topo não via. Agora soma todas:
   as do Pessoas direto, as das molduras pelo recado 'gr-pendentes' que cada
   iframe manda ao repintar o seu estado. */
const pendentesMoldura = {};
let contandoPendentes = null;
async function contarPendentes() {
  if (contandoPendentes) return contandoPendentes;
  contandoPendentes = (async () => {
    let n = nucleo.pendentes() + pendentesReuniao() + pendentesCronograma();   // todas as camadas do núcleo (EPI, DP, SST)
    try { n += await pendentesAnexos(); } catch {}
    for (const k in pendentesMoldura) n += pendentesMoldura[k] || 0;
    estado.pendentesTotal = n;
    pintarEstadoRede();
  })().finally(() => { contandoPendentes = null; });
  return contandoPendentes;
}
function pintarEstadoRede() {
  const online = estado.online, n = estado.pendentesTotal, par = nucleo.parados();
  $('estadoTexto').textContent = n
    ? `${n} para enviar` + (par ? ` · ${par} parado${par > 1 ? 's' : ''}` : '')
    : (online ? 'sincronizado' : 'offline');
  $('estadoRede').title = par ? 'Toque para ver o que parou e decidir.'
    : n ? 'Lançamentos feitos sem internet; sobem sozinhos quando o sinal volta. Toque para ver.' : '';
  $('estadoRede').style.cursor = n ? 'pointer' : '';
  $('estadoRede').querySelector('.pt').classList.toggle('off', !online || n > 0);
}

/* Tela da fila do Pessoas (rodada B): o que espera envio e o que parou, com
   as decisões sobre conflito. As molduras têm a tela delas ("aguardando envio"). */
const NOME_COLECAO = { funcionarios: 'funcionário', epis: 'EPI', fichas: 'ficha de EPI', modelo: 'modelo da ficha',
  boletins: 'boletim', apuracoes: 'apuração', ocorrencias: 'ocorrência', vinculos: 'cadastro nível 2', emprestimos: 'empréstimo',
  abatimentos: 'abatimento', salarios: 'salário', afastamentos: 'afastamento', feriasInicial: 'férias (inicial)', feriasGozos: 'férias',
  feriasPerdas: 'perda de férias', bolEntregas: 'entrega de boletim', docEntregas: 'entrega de documento', banco: 'horas guardadas',
  ticketMes: 'ticket do mês', ticketEmissoes: 'emissão de ticket', competencias: 'competência', auditoria: 'auditoria',
  sst_exames: 'exame', sst_tipos_exame: 'tipo de exame', sst_treinamentos: 'treinamento', sst_tipos_treinamento: 'tipo de treinamento', sst_aso_itens: 'marcação do ASO',
  cert_eventos: 'evento da certificação (feito)',
  cc_plantios: 'plantio', cc_insumos: 'insumo', cc_analises: 'análise', cc_calibracoes: 'calibração', cc_registros: 'lançamento de campo', cc_config: 'responsável técnico' };
const rotuloItem = p => {
  const it = p.acao === 'rpc' ? { nome: (p.item?.args?.p_ocorr ? 'ocorrência de ' + String(p.item.args.p_ocorr).split('-').reverse().join('/') : '') } : (p.item || {});
  const quem = it.funcionario_id ? estado.funcionarios.find(f => f.id === it.funcionario_id)?.nome : (it.nome || it.descricao || '');
  return `${NOME_COLECAO[p.colecao] || p.colecao}${quem ? ' · ' + quem : ''}${it.data_fato ? ' · ' + it.data_fato.split('-').reverse().join('/') : ''}`;
};
async function desenharDlgFila() {
  const lista = [...await nucleo.listarFila('epi'), ...await nucleo.listarFila('jor'), ...await nucleo.listarFila('sst'), ...await nucleo.listarFila('cert'), ...await nucleo.listarFila('caderno')].sort((a, b) => a.em - b.em);
  const alvo = $('dlgFilaLista');
  if (!lista.length) { alvo.innerHTML = '<p class="dica">Nada esperando. Tudo o que você lançou já está no servidor.</p>'; return; }
  alvo.innerHTML = lista.map(p => {
    const quando = new Date(p.em).toLocaleString('pt-BR');
    const conflito = p.erro === 'conflito' && p.atual;
    const parado = p.status === 'parado';
    const quemMexeu = conflito ? (p.atual.atualizado_por || p.atual.usuario || 'outra pessoa') + ' às ' + new Date(p.atual.atualizado_em).toLocaleString('pt-BR') : '';
    return `<div class="aviso ${parado ? 'erro' : 'info'}" style="margin:0 0 8px">
      <strong>${esc(rotuloItem(p))}</strong> <small>· ${p.acao === 'apagar' ? 'exclusão' : 'gravação'} em ${quando}</small><br>
      ${parado ? (conflito ? `<small>Este registro foi alterado no servidor depois de você abrir a tela (${esc(quemMexeu)}). Sua gravação ficou em cima de uma versão antiga.</small>
        <small style="display:block;margin-top:4px"><b>O que causa isso:</b> outra pessoa editou o mesmo registro; você editou em dois aparelhos ou duas abas; ou a tela ficou aberta muito tempo sem atualizar.</small>
        <small style="display:block;margin-top:4px"><b>Manter o meu</b> grava a sua versão por cima (a outra se perde). <b>Usar o do servidor</b> descarta a sua e traz a atual — depois confira e refaça só o que faltar.</small>` : `<small>O servidor recusou: ${esc(p.erro || '')}</small>`)
               : `<small>${p.status === 'erro' ? 'Falhou por rede; tenta de novo sozinho.' : 'Esperando rede.'}</small>`}
      ${parado && !conflito ? `<small style="display:block;margin-top:2px">O app tenta de novo sozinho ao voltar o sinal, no Sincronizar e a cada 30 min.</small>` : ''}
      ${parado ? `<div class="barra" style="margin-top:6px">
        ${conflito ? `<button type="button" class="btn mini" data-fila-manter="${p.uuid}" data-camada="${p.camada}">Manter o meu</button>
                      <button type="button" class="btn mini" data-fila-servidor="${p.uuid}" data-camada="${p.camada}">Usar o do servidor</button>`
                   : `<button type="button" class="btn mini" data-fila-tentar="${p.uuid}" data-camada="${p.camada}">Tentar de novo</button>`}
        <button type="button" class="btn mini" data-fila-descartar="${p.uuid}" data-camada="${p.camada}">Descartar</button>
      </div>` : ''}
    </div>`;
  }).join('');
}
function abrirDlgFila() { desenharDlgFila().then(() => $('dlgFila').showModal()); }
$('estadoRede').addEventListener('click', () => { if (estado.pendentesTotal) abrirDlgFila(); });
$('dlgFilaEnviar').addEventListener('click', async () => { await sincronizarTudo(); desenharDlgFila(); });

/* Botão Sincronizar do topo (19/10/2026). Antes o "Enviar agora" ficava
   escondido na lista da fila e o envio automático só acontecia com o app
   aberto. Um toque: sobe todas as filas (Pessoas, Reunião, anexos e as
   molduras Máquinas, Programação e Estoque) e relê o que mudou no servidor.
   Se sobrar algo parado, abre a lista para a pessoa decidir. */
let sincronizandoTudo = false;
async function sincronizarTudo() {
  if (sincronizandoTudo) return;
  const b = $('btnSincronizar');
  if (!navigator.onLine) { alert('Sem internet agora. Os lançamentos ficam guardados neste aparelho e sobem na próxima sincronização.'); return; }
  sincronizandoTudo = true;
  const rotulo = b.textContent; b.textContent = 'Sincronizando…'; b.disabled = true;
  nucleo.retentarParados();   // os parados também voltam à fila neste toque
  try {
    for (const fn of [() => db.enviarFila(), () => jd.enviarFila(), () => enviarFilaSst(), () => enviarFilaCert(), () => enviarFilaCaderno(), () => sincronizarReuniao(), () => enviarFilaCron(), () => enviarAnexos()]) {
      try { await fn(); } catch {}
    }
    for (const id of ['molduraManut', 'molduraProg', 'molduraEst', 'molduraCB', 'molduraCP', 'molduraPJ']) {
      const m = $(id); try { if (m && m.src) m.contentWindow.postMessage({ tipo: 'gr-sincronizar' }, location.origin); } catch {}
    }
    try { await db.sincronizar(); } catch {}
    if (jd.dados.carregado) { try { await jd.carregar(jd.competenciaCarregada() || undefined); } catch {} }
    try { await carregarSst(); } catch {}
    await contarPendentes();
    const par = nucleo.parados();
    b.textContent = par ? `${par} parado${par > 1 ? 's' : ''}` : estado.pendentesTotal ? 'Ainda enviando…' : 'Sincronizado ✓';
    if (par && !$('dlgFila').open) abrirDlgFila();
  } finally {
    sincronizandoTudo = false; b.disabled = false;
    setTimeout(() => { b.textContent = rotulo; }, 2500);
  }
}
$('btnSincronizar').addEventListener('click', sincronizarTudo);
$('dlgFilaLista').addEventListener('click', async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const { camada } = b.dataset;
  const enviar = () => (camada === 'epi' ? db.enviarFila() : camada === 'sst' ? enviarFilaSst() : camada === 'cert' ? enviarFilaCert() : camada === 'caderno' ? enviarFilaCaderno() : jd.enviarFila()).catch(() => {});
  if (b.dataset.filaManter) { await nucleo.manterMeu(b.dataset.filaManter, camada); await enviar(); }
  else if (b.dataset.filaTentar) { await nucleo.tentarDeNovo(b.dataset.filaTentar, camada); await enviar(); }
  else if (b.dataset.filaServidor || b.dataset.filaDescartar) {
    const uuid = b.dataset.filaServidor || b.dataset.filaDescartar;
    if (b.dataset.filaDescartar && !confirm('Descartar este lançamento? Ele some deste aparelho e não vai para o servidor.')) return;
    await nucleo.descartar(uuid, camada);
    // o cache deste aparelho volta a espelhar o servidor
    try { camada === 'epi' ? await db.sincronizar() : camada === 'sst' ? await carregarSst() : camada === 'caderno' ? await recarregarCaderno() : await jd.carregar(jd.competenciaCarregada() || undefined); } catch {}
  }
  desenharDlgFila(); contarPendentes();
});
/* Conflito resolvido sozinho (regra "a mais recente vence", 19/10/2026): uma
   linha de aviso, sem pedir decisão. A versão anterior fica na auditoria. */
addEventListener('gr:conflito-resolvido', ev => {
  const a = $('avisoGlobal');
  const d = ev.detail || {};
  const rot = (() => { try { return rotuloItem({ colecao: d.colecao, item: d.item }); } catch { return d.colecao || 'registro'; } })();
  a.textContent = `Conflito resolvido: a sua gravação mais recente ficou (${rot}). A versão anterior está guardada na auditoria.`;
  a.hidden = false;
  contarPendentes();
});
addEventListener('gr:fila-parada', ev => {
  const a = $('avisoGlobal');
  a.textContent = ev.detail?.conflito
    ? 'Outra pessoa alterou um registro que você também mudou. Toque em "parado" no topo para decidir.'
    : 'Um lançamento não pôde ser enviado. Toque em "parado" no topo para ver o motivo.';
  a.hidden = false;
  contarPendentes();
});

/* Saúde deste aparelho (rodada C): em Usuários - Acessos › Backup. */
const kb = n => n == null ? '—' : n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
async function desenharSaude() {
  const linhas = [];
  let est = null; try { est = await navigator.storage.estimate(); } catch {}
  linhas.push(['Versão do app', await versaoDoApp()]);
  linhas.push(['Internet agora', navigator.onLine ? 'sim' : 'não']);
  linhas.push(['Última leitura do servidor', (await nucleo.lerMeta('ultima_sinc')) ? new Date(await nucleo.lerMeta('ultima_sinc')).toLocaleString('pt-BR') : 'nunca neste aparelho']);
  linhas.push(['Para enviar · parados (Cadastros, DP, SST, Certificação)', `${nucleo.pendentes()} · ${nucleo.parados()}`]);
  for (const k in pendentesMoldura) linhas.push([`Para enviar (${k})`, String(pendentesMoldura[k])]);
  linhas.push(['Espaço usado pelo app', est ? `${kb(est.usage)} de ${kb(est.quota)}` : 'não informado']);
  linhas.push(['Cadastro local', `${estado.funcionarios.length} funcionários · ${estado.fichas.length} fichas · ${jd.dados.boletins.length} boletins do mês`]);
  linhas.push(['Manter conectado neste aparelho', db.manterConectado() ? 'sim' : 'não']);
  linhas.push(['Navegador', navigator.userAgent.replace(/^.*\) /, '').slice(0, 80)]);
  $('cfSaude').querySelector('tbody').innerHTML = linhas.map(([a, b]) => `<tr><th style="text-align:left;padding:4px 10px 4px 0;border-bottom:1px solid rgba(0,0,0,.06)">${esc(a)}</th><td style="padding:4px 0;border-bottom:1px solid rgba(0,0,0,.06)">${esc(b)}</td></tr>`).join('');
}
async function versaoDoApp() {
  try { const t = await (await fetch('./sw.js', { cache: 'no-store' })).text(); return (t.match(/VERSAO = '([^']+)'/) || [])[1] || '?'; }
  catch { return 'sem rede para conferir'; }
}
$('cfSaudeAtualizar').addEventListener('click', desenharSaude);
$('cfLimparLocal').addEventListener('click', async () => {
  if (nucleo.pendentes()) return alert('Ainda há lançamentos para enviar. Conecte na internet, espere "sincronizado" e tente de novo.');
  if (!confirm('Apagar a cópia local deste aparelho e baixar tudo de novo do servidor?')) return;
  await nucleo.apagarCaixa('epi.cache'); await nucleo.apagarCaixa('jor.cache');
  try { localStorage.removeItem('gr.reuniao'); localStorage.removeItem('gr.arquivos.lista'); } catch {}
  location.reload();
});
addEventListener('gr:tela-config', desenharSaude);

/* Dados renovam ao voltar para a tela (rodada B): tablet aberto o dia todo
   mostrava o cadastro da manhã. Se ficou mais de 10 min fora, relê Cadastros/
   EPI e o DP (mesma competência aberta) por trás, sem trocar de tela. */
let escondidoDesde = null;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { escondidoDesde = Date.now(); return; }
  if (!escondidoDesde || Date.now() - escondidoDesde < 10 * 60 * 1000) return;
  escondidoDesde = null;
  if (!estado.sessao || !navigator.onLine) return;
  try { await db.sincronizar(); } catch {}
  if (jd.dados.carregado) { try { await jd.carregar(jd.competenciaCarregada() || undefined); } catch {} }
});
db.aoMudar(() => { contarPendentes(); });
jd.aoMudarJornada(() => { contarPendentes(); });
addEventListener('online', () => setTimeout(contarPendentes, 1500));
/* Voltou o sinal: os parados voltam à fila e sobem junto (19/10/2026). As
   camadas já disparam o próprio envio no 'online'; aqui só liberamos os parados. */
addEventListener('online', () => nucleo.retentarParados());
/* Entrou sem internet (26/10/2026): quando a sessão é religada ao voltar o
   sinal, sobe a fila e atualiza os dados. */
addEventListener('gr:sessao-religada', () => {
  db.sincronizar().catch(() => {});
  nucleo.retentarParados();
  setTimeout(contarPendentes, 1500);
});
setInterval(contarPendentes, 60 * 1000);
addEventListener('message', ev => {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  if (d && d.tipo === 'gr-pendentes' && typeof d.n === 'number' && d.area) {
    pendentesMoldura[d.area] = d.n;
    contarPendentes();
  }
});

/* Erro que escapa (rodada A, 15/10/2026). Antes, um erro dentro de um botão
   sumia sem rastro: o botão ficava travado e a pessoa não sabia o quê. Agora
   aparece uma faixa com a mensagem e um botão para copiar o erro (para mandar
   no WhatsApp). Não trata nada — só mostra. */
let errosMostrados = 0;
function mostrarErroGlobal(origem, e) {
  const msg = (e && (e.message || e.reason?.message || e.reason)) || String(e);
  if (!msg || /ResizeObserver|AbortError|Load failed|Failed to fetch|NetworkError/i.test(String(msg))) return; // rede e ruído do navegador
  if (++errosMostrados > 3) return;  // não inunda a tela
  const a = $('avisoErro');
  const txt = `${origem}: ${String(msg).slice(0, 300)}`;
  a.innerHTML = '';
  a.append('Algo deu errado nesta tela. Se um botão parou de responder, feche e abra o app de novo. ');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn mini'; b.textContent = 'Copiar o erro';
  b.onclick = () => { try { navigator.clipboard.writeText(txt + ' · ' + navigator.userAgent); b.textContent = 'Copiado'; } catch { b.textContent = txt; } };
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'btn mini'; x.textContent = 'Fechar';
  x.onclick = () => { a.hidden = true; };
  a.append(b, ' ', x);
  a.hidden = false;
  console.error('[LOP]', txt, e);
}
addEventListener('error', ev => mostrarErroGlobal('Erro', ev.error || ev.message));
addEventListener('unhandledrejection', ev => mostrarErroGlobal('Falha', ev.reason));

/* Armazenamento do aparelho cheio (rodada A): a fila de envio não pôde ser
   gravada. Aviso vermelho fixo até a gravação voltar a dar certo. */
addEventListener('gr:armazenamento-cheio', ev => {
  const a = $('avisoArmazenamento');
  a.textContent = 'O armazenamento deste aparelho para o app encheu e o último lançamento '
    + 'NÃO ficou guardado para envio. Conecte na internet e abra de novo; se seguir assim, '
    + 'o administrador precisa limpar fotos antigas (Vistorias) ou dados do aparelho. '
    + '(' + (ev.detail?.chave || '') + ')';
  a.hidden = false;
});
addEventListener('gr:armazenamento-ok', () => { $('avisoArmazenamento').hidden = true; });

/* =============== manter conectado neste aparelho =============== */
$('logManter').checked = db.manterConectado();
$('logManterDica').hidden = !$('logManter').checked;
$('logManter').addEventListener('change', () => {
  $('logManterDica').hidden = !$('logManter').checked;
});

/* =============== instalar o aplicativo (10/10/2026) ===============
   Botão em três lugares (login, tela de entrada e topo), todos com
   data-instalar. Aparece sempre que o app NÃO está aberto como instalado:
   - Chrome/Edge que já avisaram (beforeinstallprompt): abre o convite direto.
   - Senão (iPhone, Chrome que ainda não avisou, Samsung Internet...): abre
     um passo a passo do menu do próprio navegador. Nunca fica sem saída.
   O aviso é capturado cedo por um script no <head> do index.html. */
const jaInstalado = () =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: window-controls-overlay)').matches ||
  navigator.standalone === true;

let instalouAgora = false;
function atualizarInstalar() {
  const esconder = instalouAgora || jaInstalado();
  document.querySelectorAll('[data-instalar]').forEach(b => { b.hidden = esconder; });
}

function passosInstalar() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return `
    <p>No iPhone e no iPad a instalação é pelo <b>Safari</b>:</p>
    <ol><li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li>
      <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>
      <li>Toque em <b>Adicionar</b>.</li></ol>`;
  if (/SamsungBrowser/.test(ua)) return `
    <ol><li>Toque no menu <b>☰</b> no canto de baixo.</li>
      <li>Toque em <b>Adicionar página a</b> → <b>Tela inicial</b>.</li></ol>`;
  if (/Android/.test(ua)) return `
    <p><b>Abriu por um link do WhatsApp, do Claude ou de outro app?</b> Ali não dá
      para instalar. Toque em <b>Copiar endereço</b>, abra o <b>Chrome</b> e cole na
      barra de cima.</p>
    <button class="btn" type="button" id="bCopiarEndereco">Copiar endereço</button>
    <p style="margin-top:12px">Já no Chrome:</p>
    <ol><li>Toque nos <b>três pontinhos ⋮</b>, no canto de cima.</li>
      <li>Toque em <b>Instalar aplicativo</b> (ou <b>Adicionar à tela inicial</b>).</li>
      <li>Confirme em <b>Instalar</b>.</li></ol>
    <p class="dica">Se a opção não aparecer, recarregue a página e espere alguns
      segundos — o Chrome só oferece depois de carregar o app inteiro.</p>`;
  return `
    <ol><li>No Chrome ou no Edge, procure o ícone de <b>instalar</b> no fim da
      barra de endereço (um monitor com uma seta).</li>
      <li>Ou abra o menu <b>⋮</b> / <b>…</b> e escolha <b>Instalar LOP - Gestão Rápida</b>
      (no Edge: <b>Aplicativos → Instalar este site como aplicativo</b>).</li></ol>`;
}

async function instalar() {
  const ev = window.__promptInstalar;
  if (ev) {
    ev.prompt();
    try { await ev.userChoice; } catch {}
    window.__promptInstalar = null;   // o convite só vale uma vez
    atualizarInstalar();
    return;
  }
  $('instalarPassos').innerHTML = passosInstalar();
  $('bCopiarEndereco')?.addEventListener('click', async ev => {
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Endereço copiado ✓'; }
    catch { ev.target.textContent = url; }
  });
  $('dlgInstalar').showModal();
}

document.querySelectorAll('[data-instalar]').forEach(b => b.addEventListener('click', instalar));
document.addEventListener('gr-instalavel', atualizarInstalar);
addEventListener('appinstalled', () => { instalouAgora = true; window.__promptInstalar = null; atualizarInstalar(); });
matchMedia('(display-mode: standalone)').addEventListener?.('change', atualizarInstalar);
atualizarInstalar();

if ('serviceWorker' in navigator) {
  /* Atualização com o app aberto (15/10/2026). O app instalado no tablet
     fica dias aberto e não pegava a versão nova sem ser fechado. Agora ele
     confere ao voltar para a tela e a cada 30 min; quando a versão nova
     assume, aparece uma faixa "Nova versão — atualizar". */
  const jaTinhaControle = !!navigator.serviceWorker.controller;
  let faixaMostrada = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaTinhaControle || faixaMostrada) return;
    faixaMostrada = true;
    const f = document.createElement('div');
    f.className = 'faixa-versao';
    f.innerHTML = '<span>Nova versão do app publicada.</span><button type="button">Atualizar agora</button>';
    f.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(f);
  });
  /* Versão ao lado de "sincronizado" (20/10/2026, pedido dele): só o número,
     o que o service worker deste aparelho está servindo — assim dá para ver
     na hora se o app pegou a publicação nova. */
  const mostrarVersao = () => navigator.serviceWorker.controller?.postMessage({ tipo: 'gr-versao' });
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data?.tipo === 'gr-versao' && $('versaoApp')) $('versaoApp').textContent = ev.data.versao;
  });
  navigator.serviceWorker.addEventListener('controllerchange', mostrarVersao);
  mostrarVersao();
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(reg => {
    mostrarVersao();
    const conferir = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferir(); });
    setInterval(conferir, 30 * 60 * 1000);
  }).catch(() => {}));
}

/* arranque
   Cada ligação vai isolada. Se uma tela tiver um botão faltando — acontece
   quando o navegador serve um index.html velho junto com um js novo — o resto
   do app ainda sobe. Antes, um erro em qualquer uma delas derrubava o arranque
   inteiro e a pessoa via uma página em branco, sem uma palavra escrita. */
const falhasAoLigar = [];
function ligar(nome, fn) {
  try { fn(); }
  catch (e) {
    falhasAoLigar.push(`${nome}: ${e.message || e}`);
    console.error('[LOP - Gestão Rápida] falhou ao ligar', nome, e);
  }
}

ligar('DISC', ligarDisc);
ligar('acesso', ligarAcesso);
/* Quando o DP manda para outra tela (ex.: "Emitir relatório"), a faixa de
   ícones e o caminho acompanham (29/09/2026). */
const irParaTela = t => { const m = moduloDe(t); if (m) abrirModulo(m, t); else abrirAba(t); };
ligar('DP', () => ligarJornada(irParaTela));
ligar('SST', () => ligarSst(mostrarAviso));
ligar('RH', () => ligarRh(mostrarAviso, desenharFuncionarios));
ligar('exames por função', ligarAso);
ligar('relatório de exames', ligarRelExames);
ligar('treinamentos por função', ligarTreinoFuncao);
ligar('treinamentos consolidados', ligarConsolidado);
ligar('atividades do sst', ligarAtividades);
ligar('brigada e socorros', () => ligarBrigada({ abrir: irParaTela }));
ligar('cronograma de troca de EPI', () => ligarEpiCrono({ abrir: irParaTela }));
/* Cadastros › Admissão e demissão (23/10/2026): o botão "Abrir ›" de cada tarefa
   leva à tela que resolve, já com a pessoa escolhida quando dá. */
const depois = (fn, tentativas = 20) => setTimeout(() => { if (!fn() && tentativas > 0) depois(fn, tentativas - 1); }, 250);
function acaoDaTarefa(acao, fid) {
  const f = estado.funcionarios.find(x => x.id === fid);
  if (!f) return;
  const escolher = (sel, tela) => { irParaTela(tela); depois(() => {
    const s = $(sel); if (!s || ![...s.options].some(o => o.value === fid)) return false;
    s.value = fid; s.dispatchEvent(new Event('change')); return true; }); };
  if (acao === 'termoSindical') return escolher('tmSinFunc', 'termoSindical');
  if (acao === 'termoContrato') return escolher('tmConFunc', 'termoContrato');
  if (acao === 'contratoTrab') { irParaTela('contratoTrab'); contratoDe(fid); return; }
  if (acao === 'fichaEpi') { marcados.clear(); marcados.add(fid); irParaTela('fichas'); desenharSelecao(); return; }
  if (acao === 'fichaCadastral') { irParaTela('funcionarios'); verFichaCadastral(f); return; }
  if (acao === 'exames') { irParaTela('exRel'); depois(() => { const b = $('erBusca'); if (!b) return false;
    b.value = f.nome; b.dispatchEvent(new Event('input')); return true; }); return; }
  if (acao === 'salario') { irParaTela('rhSalarios'); depois(() => { if (!_sal.S.carregado) return false; _sal.abrirFicha(fid); return true; }); return; }
  if (acao === 'treinamentos') return irParaTela('trFuncoes');
  if (acao === 'armario') return irParaTela('etqArmarios');
  if (acao === 'folhaPonto') return irParaTela('folhaPonto');
}
ligar('admissão e demissão', () => ligarTarefas({ abrir: irParaTela, acao: acaoDaTarefa, aviso: mostrarAviso }));
ligar('termos', () => ligarTermos(mostrarAviso));
ligar('contrato de trabalho', () => ligarContrato(mostrarAviso));
ligar('backup', () => ligarBackup(mostrarAviso));
ligar('acesso rápido', () => ligarAtalhos(abrirModulo, mostrarAviso));

/** Nunca deixe a tela vazia: se nem o login der para montar, escreva o motivo. */
function telaDeSocorro(texto) {
  document.body.innerHTML =
    `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:Arial,Helvetica,sans-serif;color:#51534A;padding:24px">
      <div style="max-width:420px;text-align:center">
        <h1 style="font-size:19px;color:#744F28;margin:0 0 10px">O app não conseguiu abrir</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 18px">${esc(texto)}</p>
        <p style="font-size:13px;color:#7d8175;line-height:1.6">
          Tente recarregar a página. Se continuar, avise o Guilherme com este recado.</p>
      </div>
    </div>`;
}

(async () => {
  /* O link do e-mail volta com #type=recovery. O Supabase consome esse
     pedaço do endereço ao iniciar, então é preciso olhar antes. */
  const marca = location.hash || '';
  const recuperando = /type=recovery/.test(marca);
  const linkRuim = /error=|error_code=/.test(marca);

  /* Com o token vencido, o supabase-js tenta renovar antes de responder — e se
     o servidor estiver lento ou pausado essa chamada fica pendurada. Como nada
     é mostrado antes dela, a pessoa fica olhando uma página vazia. Então: 12
     segundos e cai no login com o recado. Se o banco acordar depois, o app
     entra sozinho. */
  let demorou = false;
  const arranque = db.iniciar();
  window.grAbertura?.etapa(0.3, 'Conectando ao banco…');
  const r = await Promise.race([
    arranque,
    new Promise(ok => setTimeout(() => { demorou = true; ok({ etapa: 'login' }); }, 12000)),
  ]);

  if (linkRuim) {
    history.replaceState(null, '', location.pathname);
    mostrar('login');
    const erro = $('erroLogin');
    erro.textContent = /expired/.test(marca)
      ? 'Esse link de recuperação já venceu. Peça outro em "Esqueci minha senha".'
      : 'Não deu para usar esse link de recuperação. Peça outro em "Esqueci minha senha".';
    erro.hidden = false;
    window.grAbertura?.pronto();
    return;
  }

  if (recuperando) {
    $('nsQuem').textContent = estado.sessao?.user?.email
      ? `Login ${estado.sessao.user.email}. Escolha a senha que você vai usar daqui em diante.`
      : 'Escolha a senha que você vai usar daqui em diante.';
    mostrar('novaSenha');
    window.grAbertura?.pronto();
    return;
  }

  mostrar(r.etapa);

  if (demorou) {
    const erro = $('erroLogin');
    erro.textContent = navigator.onLine
      ? 'O servidor está demorando para responder. Pode ser o banco pausado — espere um minuto e recarregue.'
      : 'Sem internet. Entre com seu usuário e senha: se você já entrou neste aparelho com internet, o app abre com os dados guardados.';
    erro.hidden = false;
    window.grAbertura?.alerta(navigator.onLine ? 'O banco está demorando para responder…' : 'Sem internet');
    arranque.then(x => { if (x?.etapa === 'app') { mostrar('app'); carregarTudo(); } }).catch(() => {});
    return;
  }

  if (r.etapa === 'app') {
    if (r.semRede) mostrarAviso('Sem internet. Abrindo com os dados guardados neste aparelho — o que você lançar fica na fila e sobe quando o sinal voltar.');
    window.grAbertura?.etapa(0.65, 'Carregando suas áreas…');
    /* A abertura não espera a carga inteira: no máximo 6 s e o app aparece. */
    const carga = carregarTudo();
    Promise.race([carga, new Promise(ok => setTimeout(ok, 6000))])
      .then(() => window.grAbertura?.pronto(), () => window.grAbertura?.pronto());
    await carga;
  } else {
    window.grAbertura?.pronto();
  }

  if (falhasAoLigar.length) {
    const aviso = $('avisoGlobal');
    aviso.innerHTML = 'Uma parte do app não carregou:<br>' + falhasAoLigar.map(esc).join('<br>');
    aviso.hidden = false;
  }
})().catch(e => {
  window.grAbertura?.fechar();
  console.error('[LOP - Gestão Rápida] o arranque parou', e);
  telaDeSocorro(e.message || String(e));
});
