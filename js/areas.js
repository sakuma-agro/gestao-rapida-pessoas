// areas.js — as áreas do LOP - Gestão Rápida (09/10/2026)
//
// O app virou plataforma: depois do login a pessoa escolhe a ÁREA, e cada área
// tem o seu menu. "Pessoas" é tudo o que este app já era (Cadastros, SST, RH,
// DP) e continua igual. "Manutenções" mora na pasta manutencoes/ e abre numa
// moldura (iframe) desta mesma página: lá dentro as telas, os estilos e a base
// sem internet são os de sempre, sem se misturar com os daqui, e o login é o
// deste app — a moldura pede o token ao cliente daqui (window.grCliente).
//
// Área nova no futuro: um item em AREAS e a regra dela em liberada().
import { estado } from './store.js';
import { desenharBackupInicio } from './backup.js';
import { desenharFraseInicio, desenharAlertaAtividade } from './reuniao.js';
import { acesso, modulosLiberados, mostrarInicio, abrirModulo, telasLiberadas, montarMenu,
  registrarMenuArea, pintarModulos, desmarcarModulos, telaNaFaixa, aoPintarFaixa } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Sobe a cada publicação da área Manutenções (e nos ?v= do manutencoes/index.html). */
const VERSAO_AREA = '55';
/* Sobe a cada publicação da área Programação Campo (e nos ?v= do programacao/index.html). */
const VERSAO_PROG = '15';
/* Sobe a cada publicação da área Estoque (e nos ?v= do estoque/index.html). */
const VERSAO_EST = '35';
/* Sobe a cada publicação da área Custo Base (e nos ?v= do custobase/index.html). */
const VERSAO_CB = '19';
/* Sobe a cada publicação da área Colheita e Produção (e nos ?v= do colheita/index.html). */
const VERSAO_CP = '10';
/* Sobe a cada publicação da área Projetos (PMBOK) (e nos ?v= do projetos/index.html). */
const VERSAO_PJ = '3';

/* Ordem dos cartões (15/10/2026, pedido dele): Pessoas · Máquinas e
   Patrimônio · Certificação · Vistorias e Segurança · Programação Campo ·
   Estoque · (Usuários - Acessos, só admin). */
export const AREAS = [
  { id: 'pessoas', nome: 'Pessoas', icone: 'icons/area-pessoas.v2.svg',
    desc: 'Cadastros · SST · RH · DP · Reunião semanal' },
  /* 15/10/2026, pedido dele: a área Manutenções virou "Máquinas e Patrimônio" e
     ganhou o módulo Patrimônio. Só o nome mudou: o id segue 'manutencoes', a
     pasta segue manutencoes/ e o banco segue no esquema manutencao. */
  { id: 'manutencoes', nome: 'Máquinas e Patrimônio', icone: 'icons/area-manutencoes.v2.svg',
    desc: 'Máquinas · Patrimônio · Vencimentos · Ordens de serviço · Check list' },
  { id: 'certificacao', nome: 'Certificação', icone: 'icons/area-certificacao.v2.svg',
    desc: 'IFA · GRASP · Rainforest · SMETA — listas, cronograma e caderno de campo' },
  { id: 'vistorias', nome: 'Vistorias e Segurança', icone: 'icons/area-vistorias.v2.svg',
    desc: 'Vistorias · Checklists · Anomalias · Extintores' },
  /* Programação Campo (15/10/2026, pedido dele): o app avulso veio para dentro
     do LOP para usar os cadastros de funcionários (Pessoas) e de máquinas e
     implementos (Máquinas e Patrimônio). Mora em programacao/, numa moldura. */
  { id: 'programacao', nome: 'Programação Campo', icone: 'icons/area-programacao.v3.svg',
    desc: 'Painel anual · Atividades · Reunião semanal · Relatório diário' },
  /* Estoque (15/10/2026, pedido dele): o app avulso Gestão Rápida (Estoque
     Inteligente) veio para dentro do LOP. Balanço, não movimento: contagem,
     acerto entre as fazendas e cadastros. Mora em estoque/, numa moldura. */
  { id: 'estoque', nome: 'Estoque', icone: 'icons/area-estoque.v3.svg',
    desc: 'Contagem · Acerto entre fazendas · Cadastros' },
  /* Custo Base (20/10/2026, pedido dele): o rateio mensal do custo
     administrativo por cultura/plantio, que era a planilha "Rateio -
     Direcionador Mensal ADM". Mora em custobase/, numa moldura. */
  { id: 'custobase', nome: 'Custo Base', icone: 'icons/area-custobase.v3.svg',
    desc: 'Rateio mensal culturas · Hora-homem' },
  /* Colheita e Produção (20/10/2026, pedido dele): as planilhas "Controle
     Colheita" de cenoura, batata, café, milho, trigo e abacate numa área só.
     Mora em colheita/, numa moldura. */
  { id: 'colheita', nome: 'Colheita e Produção', icone: 'icons/area-colheita.v3.svg',
    desc: 'Painel da safra · Cargas · Balança · Beneficiamento · Comercialização · Cadastros · Pagamento de fretes' },
  /* Projetos (PMBOK) (23/10/2026, pedido dele): os projetos internos da SAKUMA
     pelas boas práticas do Guia PMBOK e do material do MBA — termo de
     abertura, partes interessadas, escopo e requisitos, EAP, rede e caminho
     crítico, RACI, riscos, comunicação, custos, mudanças, encerramento e
     lições aprendidas. Mora em projetos/, numa moldura. */
  { id: 'projetos', nome: 'Projetos (PMBOK)', icone: 'icons/area-projetos.v2.svg',
    desc: 'Painel · Projetos (termo, EAP, rede, riscos, custos, mudanças) · Alertas · Lições aprendidas' },
  /* Cronograma geral (28/10/2026, pedido dele): as tarefas e os vencimentos
     de todas as áreas num lugar só, por pessoa do escritório, com Calendário
     e Kanban. Mora nesta página (js/cronograma.js), sem moldura. */
  { id: 'cronograma', nome: 'Cronograma geral', icone: 'icons/area-cronograma.v1.svg',
    desc: 'Calendário · Kanban por situação e por pessoa · Vencimentos de todas as áreas' },
  /* Usuários - Acessos (14/10/2026, pedido dele): a antiga "Configurações ·
     quem entra e o que vê" virou um cartão da tela principal. É a tela
     telaConfig (quem acessa o quê + backup), só para administrador. */
  /* 21/10/2026, pedido dele: o cartão virou "LOP - Principal", com o ícone da
     LOP, juntando Usuários - Acessos e o Backup (que saiu da tela inicial).
     O id continua 'usuarios' (é o que o resto do app e os acessos conhecem). */
  { id: 'usuarios', nome: 'LOP - Principal', icone: 'icons/lop-gr-maskable-192.v1.png',
    desc: 'Usuários - Acessos · Backup' },
];

/* Sobe a cada publicação da área Vistorias (pasta vistorias/, gerada pelo
   montar.py do repositório sakuma-vistorias). */
const VERSAO_VIST = '18';

/* Menu da área Vistorias e Segurança (14/10/2026, pedido dele: "pegando
   referência do Pessoas, módulos, submódulos"). Ele escolheu agrupar por etapa
   do trabalho. As telas continuam as da moldura (vistorias/): cada tela daqui
   aperta a aba correspondente lá dentro — o `aba` é o nome da aba na moldura.
   O topo próprio da moldura some dentro do LOP (vistorias/lop-antes.js). */
const VIST_MODULOS = [
  /* 14/10/2026, ajuste dele: "Em aberto" é das inspeções e fica aqui;
     Anomalias e Antes e Depois são módulos, cada um com o seu em aberto. */
  { id: 'vsInsp', nome: 'Inspeções', icone: 'capacete', subs: [
    { id: 'vsSubVistoria', nome: 'Vistoria', telas: [['vsVistoria', 'Vistoria']] },
    { id: 'vsSubChecklists', nome: 'Checklists prontos', telas: [['vsChecklists', 'Checklists prontos']] },
    { id: 'vsSubAberto', nome: 'Em aberto', telas: [['vsAberto', 'Em aberto']] },
  ] },
  { id: 'vsAnom', nome: 'Anomalias', icone: 'alerta', inicial: 'vsAnAberto', subs: [
    { id: 'vsSubAnNovo', nome: 'Novo apontamento', telas: [['vsAnNovo', 'Novo apontamento']] },
    { id: 'vsSubAnAberto', nome: 'Em aberto', telas: [['vsAnAberto', 'Em aberto']] },
    { id: 'vsSubAnHist', nome: 'Histórico', telas: [['vsAnHist', 'Histórico']] },
  ] },
  { id: 'vsAntDep', nome: 'Antes e Depois', icone: 'antesDepois', inicial: 'vsAdAberto', subs: [
    { id: 'vsSubAdNovo', nome: 'Novo registro', telas: [['vsAdNovo', 'Novo registro']] },
    { id: 'vsSubAdAberto', nome: 'Em aberto', telas: [['vsAdAberto', 'Em aberto']] },
    { id: 'vsSubAdFechados', nome: 'Fechados', telas: [['vsAdFechados', 'Fechados']] },
    { id: 'vsSubAdHist', nome: 'Histórico', telas: [['vsAdHist', 'Histórico']] },
  ] },
  { id: 'vsEquip', nome: 'Equipamentos', icone: 'extintor', subs: [
    { id: 'vsSubEx', nome: 'Extintores', telas: [['vsEx', 'Extintores']] },
  ] },
  { id: 'vsRel', nome: 'Relatórios', icone: 'grafico', subs: [
    { id: 'vsSubPainel', nome: 'Painel geral', telas: [['vsPainel', 'Painel geral']] },
    { id: 'vsSubRelatorio', nome: 'Relatório da vistoria', telas: [['vsRelatorio', 'Relatório da vistoria']] },
  ] },
  /* Configurações do Vistorias (prazos, normas, anomalias, checklists): à direita da barra */
  { id: 'vsCfg', nome: 'Configurações', icone: 'config', direita: true, subs: [
    { id: 'vsSubConfig', nome: 'Configurações', telas: [['vsConfig', 'Configurações']] },
  ] },
];
registrarMenuArea(VIST_MODULOS);
/* Tela do topo → aba da moldura. As de Anomalias e Antes e Depois a moldura
   abre sozinha (window.vsIr no lop-depois.js), porque escolhem a vista lá dentro. */
const ABA_VIST = { vsVistoria: 'vistoria', vsChecklists: 'checklists', vsAberto: 'aberto',
  vsAnNovo: 'an', vsAnAberto: 'an', vsAnHist: 'an',
  vsAdNovo: 'ad', vsAdAberto: 'ad', vsAdFechados: 'ad', vsAdHist: 'ad',
  vsEx: 'ex', vsPainel: 'pg', vsRelatorio: 'relatorio', vsConfig: 'config' };
const TELA_DA_ABA = { vistoria: 'vsVistoria', checklists: 'vsChecklists', aberto: 'vsAberto', an: 'vsAnAberto',
  ad: 'vsAdAberto', ex: 'vsEx', pg: 'vsPainel', relatorio: 'vsRelatorio', config: 'vsConfig' };
/* A barra de módulos pintada agora é a do Vistorias? (cada área pinta a sua) */
const barraVist = () => !!$('navModulos').querySelector('[data-modulo="vsInsp"]');
const moduloDaTelaVist = t => VIST_MODULOS.find(m => m.subs.some(s => s.telas.some(([x]) => x === t)))?.id;
export const ehTelaVist = nome => nome in ABA_VIST;

/* Quem entra em cada área. Pessoas: quem tem algum módulo de lá. Manutenções:
   administrador ou quem tem 'manutencoes' na lista de módulos (app_usuarios) —
   a mesma regra que o banco usa (manutencao.pode). */
function liberada(id) {
  if (id === 'pessoas') return modulosLiberados().length > 0;
  if (id === 'manutencoes') return acesso.admin || (acesso.modulos || []).includes('manutencoes');
  /* Certificação (13/10/2026): módulo 'cert' do acesso.js, com menu próprio. */
  if (id === 'certificacao') return telasLiberadas('cert').length > 0;
  /* Programação Campo (15/10/2026): administrador ou módulo 'programacao' —
     a mesma regra do banco (programacao.pode_usar). */
  if (id === 'programacao') return acesso.admin || (acesso.modulos || []).includes('programacao');
  /* Vistorias e Segurança (14/10/2026): administrador ou módulo 'vistorias' —
     a mesma regra do banco (vistorias.pode_usar). */
  if (id === 'vistorias') return acesso.admin || (acesso.modulos || []).includes('vistorias');
  /* Estoque (15/10/2026): administrador ou módulo 'estoque'. */
  if (id === 'estoque') return acesso.admin || (acesso.modulos || []).includes('estoque');
  /* Custo Base (20/10/2026): administrador ou módulo 'custobase'. */
  if (id === 'custobase') return acesso.admin || (acesso.modulos || []).includes('custobase');
  /* Colheita e Produção (20/10/2026): administrador ou módulo 'colheita'. */
  if (id === 'colheita') return acesso.admin || (acesso.modulos || []).includes('colheita');
  /* Projetos (PMBOK) (23/10/2026): administrador ou módulo 'projetos'. */
  if (id === 'projetos') return acesso.admin || (acesso.modulos || []).includes('projetos');
  /* Cronograma geral (28/10/2026): administrador ou módulo 'cronograma'. */
  if (id === 'cronograma') return acesso.admin || (acesso.modulos || []).includes('cronograma');
  if (id === 'usuarios') return !!acesso.admin;
  return false;
}
export const areasLiberadas = () => AREAS.filter(a => !a.emBreve && liberada(a.id));

let aoTrocar = () => {};
let areaAtual = null;
let vistPronta = false;           // a moldura do Vistorias já abriu o app lá dentro
let vistPendente = null;          // tela pedida antes da moldura ficar pronta
let vistTela = null;              // tela do topo aberta na moldura agora
let vistNums = {};                // números das abas (pendências) para a faixa
let molduraCarregada = false;
let molduraVistCarregada = false;
let molduraProgCarregada = false;
let molduraEstCarregada = false;
let molduraCBCarregada = false;
let molduraCPCarregada = false;
let molduraPJCarregada = false;

export const areaAberta = () => areaAtual;

/** Liga a tela das áreas ao resto do app (abrirAba vem do app.js). */
export function ligarAreas(callback) {
  aoTrocar = callback;
  // logo/nome do sistema: escolher a área. Etiqueta: início da área atual.
  $('bInicio').addEventListener('click', () => { if (!$('app').hidden) mostrarAreas(); });
  $('bArea').addEventListener('click', () => { if (areaAtual) entrarNaArea(areaAtual); });
  addEventListener('resize', medirTopo);
  // A moldura pede o login por aqui.
  window.grCliente = estado.cliente;
  /* 22/10/2026: sem sinal, getSession() do cliente falha ou fica pendurado
     (token vencido, renovação não chega). As molduras perguntam então pela
     sessão que o LOP já usa — que inclui a guardada no aparelho. */
  window.grSessao = () => estado.sessao || null;
}

/* A moldura ocupa a tela inteira abaixo do topo. A altura do topo muda com a
   largura (os botões quebram linha no celular), então é medida de verdade. */
function medirTopo() {
  const topo = document.querySelector('#app .topo');
  if (topo) document.documentElement.style.setProperty('--topo-h', topo.offsetHeight + 'px');
}

function pintarEtiqueta() {
  const a = AREAS.find(x => x.id === areaAtual);
  $('bArea').hidden = !a;
  if (!a) return;
  $('areaNome').textContent = a.nome;
  $('areaIcone').src = a.icone;
}

/* Recado do backup: o mesmo #avisoGlobal do resto do app, um pouco mais
   demorado porque a frase diz onde os arquivos foram parar. */
function avisarInicio(texto) {
  const a = $('avisoGlobal');
  if (!a) return;
  a.textContent = texto; a.className = 'aviso ok'; a.hidden = false;
  clearTimeout(avisarInicio.t);
  avisarInicio.t = setTimeout(() => { a.hidden = true; a.className = 'aviso info'; }, 9000);
}

/** A tela das áreas: todas aparecem; as sem acesso ficam em cinza (15/10/2026). */
export function mostrarAreas({ direto = false } = {}) {
  window.grCliente = estado.cliente;
  /* 15/10/2026, pedido dele: a tela das áreas aparece sempre, com TODAS as
     áreas do sistema — as que a pessoa não tem acesso ficam em cinza
     (fantasma) e não abrem, para todo mundo entender o que o LOP tem. Por
     isso não entra mais direto quando a pessoa tem uma área só. */

  areaAtual = null;
  pintarEtiqueta();
  $('navModulos').hidden = true;
  $('navTelas').hidden = true;
  $('navSub').hidden = true;

  const nome = (acesso.nome || '').split(' ')[0];
  const h = new Date().getHours();
  $('arOla').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (nome ? ', ' + nome : '');

  /* Frase da semana (15/10/2026, pedido dele): ao lado do "Boa tarde, …",
     a frase que alguém do administrativo trouxe e o nome de quem trouxe. */
  try {
    const abrirReu = tela => { entrarNaArea('pessoas'); abrirModulo('reuniao', tela); };
    desenharAlertaAtividade($('arAlerta'), { abrir: abrirReu });
    desenharFraseInicio($('arFrase'), { abrir: abrirReu });
  } catch (e) { $('arFrase').hidden = true; }

  // liberadas primeiro, na ordem de AREAS; depois as fantasmas
  const lista = [...AREAS.filter(a => !a.emBreve && liberada(a.id)), ...AREAS.filter(a => a.emBreve || !liberada(a.id))];
  $('arGrade').innerHTML = lista.map(a => {
    const ok = !a.emBreve && liberada(a.id);
    const fantasma = !ok && !a.emBreve;
    return `<button type="button" class="ar-cartao${a.emBreve ? ' ar-embreve' : ''}${fantasma ? ' ar-fantasma' : ''}" data-area="${a.id}"
        ${ok ? '' : 'disabled aria-disabled="true"'} title="${fantasma ? 'Você não tem acesso a esta área. Peça ao administrador.' : esc(a.desc)}">
      <img src="${a.icone}" alt="">
      <span class="ar-txt"><b>${esc(a.nome)}</b><small>${esc(a.desc)}</small></span>
      <span class="ar-ir">${a.emBreve ? 'Em breve' : fantasma ? 'Sem acesso' : 'Entrar →'}</span>
    </button>`;
  }).join('');
  $('arGrade').querySelectorAll('[data-area]:not([disabled])').forEach(b =>
    b.addEventListener('click', () => entrarNaArea(b.dataset.area)));

  // "Configurações · quem entra e o que vê" virou o cartão Usuários - Acessos.
  /* Backup de todo o app (14/10/2026, pedido dele): faixa na tela inicial,
     só para administrador. Salva direto na pasta escolhida (js/backup.js). */
  /* 21/10/2026: o ícone do Backup foi para dentro de LOP - Principal. */
  $('arPe').innerHTML = '';

  aoTrocar('areas');
}

/** Abre uma área. `tela` = 'config' abre as Configurações; `extra` vai para a
 *  moldura (ex.: o link do relatório de check list mandado por WhatsApp). */
export function entrarNaArea(id, tela, extra) {
  if (!liberada(id)) return mostrarAreas();
  areaAtual = id;
  pintarEtiqueta();

  if (id === 'pessoas') {
    // a barra de módulos é de quem entrou por último: volta a ser a do Pessoas
    // a barra é de quem entrou por último (Vistorias, Certificação): volta a ser a do Pessoas
    if (!$('navModulos').querySelector('[data-modulo="pessoas"]')) montarMenu();
    $('navModulos').hidden = false;
    if (tela === 'config') {
      abrirModulo('config');
    } else {
      mostrarInicio();
    }
    return;
  }

  if (id === 'usuarios') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('config');
    desenharPrincipal();
    return;
  }

  if (id === 'certificacao') {
    /* 20/10/2026, pedido dele (mesmo jeito em todas as áreas): na barra de
       cima o módulo Certificação, com os submódulos ao lado e as telas do
       submódulo logo abaixo. É o único módulo da área: não fecha. */
    pintarModulos([{ id: 'cert', nome: 'Certificação', icone: 'check' }]);
    $('navModulos').hidden = false;
    abrirModulo('cert', tela && tela !== 'config' ? tela : undefined);
    return;
  }

  if (id === 'vistorias') {
    if (!barraVist())
      pintarModulos(VIST_MODULOS.map(m => ({ id: m.id, nome: m.nome, icone: m.icone, direita: m.direita })),
        { aoFechar: () => entrarNaArea('vistorias') });
    $('navModulos').hidden = false;
    desmarcarModulos();
    vistPendente = null;
    aoTrocar('vistorias');
    medirTopo();
    const moldura = $('molduraVist');
    if (!molduraVistCarregada || extra) {
      molduraVistCarregada = true;
      vistPronta = false;
      moldura.src = 'vistorias/?v=' + VERSAO_VIST + (extra ? '&' + extra : '');
    } else if (tela !== 'config') {
      try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    // vindo da tela principal: abre direto nas Configurações do Vistorias
    if (tela === 'config') abrirModulo('vsCfg', 'vsConfig');
    return;
  }

  if (id === 'programacao') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('programacao');
    medirTopo();
    const moldura = $('molduraProg');
    if (!molduraProgCarregada || extra) {
      molduraProgCarregada = true;
      moldura.src = 'programacao/?v=' + VERSAO_PROG + (extra ? '&' + extra : '');
    } else {
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'programacao/?v=' + VERSAO_PROG + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    return;
  }

  if (id === 'estoque') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('estoque');
    medirTopo();
    const moldura = $('molduraEst');
    if (!molduraEstCarregada || extra) {
      molduraEstCarregada = true;
      moldura.src = 'estoque/?v=' + VERSAO_EST + (extra ? '&' + extra : '');
    } else {
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'estoque/?v=' + VERSAO_EST + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    return;
  }

  if (id === 'custobase') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('custobase');
    medirTopo();
    const moldura = $('molduraCB');
    if (!molduraCBCarregada || extra) {
      molduraCBCarregada = true;
      moldura.src = 'custobase/?v=' + VERSAO_CB + (extra ? '&' + extra : '');
    } else {
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'custobase/?v=' + VERSAO_CB + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    return;
  }
  if (id === 'cronograma') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('cronograma');
    return;
  }
  if (id === 'projetos') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('projetos');
    medirTopo();
    const moldura = $('molduraPJ');
    if (!molduraPJCarregada || extra) {
      molduraPJCarregada = true;
      moldura.src = 'projetos/?v=' + VERSAO_PJ + (extra ? '&' + extra : '');
    } else {
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'projetos/?v=' + VERSAO_PJ + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    return;
  }
  if (id === 'colheita') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('colheita');
    medirTopo();
    const moldura = $('molduraCP');
    if (!molduraCPCarregada || extra) {
      molduraCPCarregada = true;
      moldura.src = 'colheita/?v=' + VERSAO_CP + (extra ? '&' + extra : '');
    } else {
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'colheita/?v=' + VERSAO_CP + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
    return;
  }

  if (id === 'manutencoes') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('manutencoes');
    medirTopo();
    const moldura = $('molduraManut');
    if (!molduraCarregada || extra) {
      molduraCarregada = true;
      // ?v= muda a cada publicação: o navegador guarda as páginas por alguns
      // minutos e, sem isto, abria a área com a versão anterior.
      moldura.src = 'manutencoes/?v=' + VERSAO_AREA + (extra ? '&' + extra : '');
    } else {
      // já aberta: volta para o início da área, sem recarregar a base.
      // Se a abertura anterior não terminou (ficou em "Baixando…"), recarrega.
      let pronta = false;
      try { pronta = !!moldura.contentWindow.areaPronta; } catch {}
      if (!pronta) moldura.src = 'manutencoes/?v=' + VERSAO_AREA + '&t=' + Date.now();
      else try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
  }
}

/** Depois do login: a área pedida no endereço (?area=…), senão a escolha. */
export function abrirPrimeiraTela() {
  window.grCliente = estado.cliente;
  const p = new URLSearchParams(location.search);
  const pedida = p.get('area');
  if (pedida && liberada(pedida)) {
    p.delete('area');
    const resto = p.toString();
    history.replaceState(null, '', location.pathname);
    return entrarNaArea(pedida, null, resto || null);
  }
  mostrarAreas({ direto: true });
}

/** Ao sair: esquece a área e descarrega a moldura (com a base de outro login). */
export function limparAreas() {
  areaAtual = null;
  molduraCarregada = false;
  molduraVistCarregada = false;
  molduraProgCarregada = false;
  molduraEstCarregada = false;
  molduraCBCarregada = false;
  molduraCPCarregada = false;
  molduraPJCarregada = false;
  vistPronta = false; vistPendente = null; vistTela = null; vistNums = {};
  const m = $('molduraManut');
  if (m) m.src = 'about:blank';
  const mv = $('molduraVist');
  if (mv) mv.src = 'about:blank';
  const mp = $('molduraProg');
  if (mp) mp.src = 'about:blank';
  const me = $('molduraEst');
  if (me) me.src = 'about:blank';
  const mc = $('molduraCB');
  if (mc) mc.src = 'about:blank';
  const mcp = $('molduraCP');
  if (mcp) mcp.src = 'about:blank';
  const mpj = $('molduraPJ');
  if (mpj) mpj.src = 'about:blank';
  pintarEtiqueta();
}

/* ─── Vistorias: o menu do topo manda na moldura e a moldura avisa o menu ─── */

/** Uma tela do menu do Vistorias: mostra a moldura e aperta a aba lá dentro. */
export function abrirTelaVist(tela) {
  aoTrocar('vistorias');
  medirTopo();
  const qual = ABA_VIST[tela];
  if (!molduraVistCarregada) {
    molduraVistCarregada = true;
    vistPronta = false;
    $('molduraVist').src = 'vistorias/?v=' + VERSAO_VIST;
  }
  if (!vistPronta) { vistPendente = tela; return; }
  if (vistTela === tela) return;    // já está nela (o aviso veio da própria moldura)
  irNaMoldura(tela);
}

function irNaMoldura(tela) {
  const qual = ABA_VIST[tela];
  try {
    const w = $('molduraVist').contentWindow;
    if (w.vsIr && w.vsIr(tela)) return;
    const b = w.document.getElementById('t-' + qual);
    if (b) b.click(); else w.aba?.(qual);
  } catch (e) { console.warn('vistorias: tela', tela, e); }
}

/* A moldura chama isto quando o app lá dentro terminou de abrir. */
window.vistMolduraPronta = () => {
  vistPronta = true;
  if (vistPendente) { const t = vistPendente; vistPendente = null; vistTela = null; irNaMoldura(t); }
};

/* A moldura chama isto a cada troca de aba — inclusive pelos atalhos da tela
   inicial dela —, e o menu do topo acompanha. */
window.vistAbaMudou = (qual, telaDeLa) => {
  if (vistPendente && qual === 'inicio') return;   // ainda abrindo: a tela pedida vem em seguida
  let tela = telaDeLa === undefined ? TELA_DA_ABA[qual] : telaDeLa;
  // null: a moldura não sabe dizer (ex.: editando um registro) — fica no submódulo do topo, se for do mesmo módulo
  if (tela === null) {
    const atual = telaNaFaixa();
    tela = atual && ABA_VIST[atual] === qual ? atual : TELA_DA_ABA[qual];
  }
  vistTela = tela || null;
  if (areaAtual !== 'vistorias') return;
  if (!tela) { desmarcarModulos(); return; }        // início da área
  if (telaNaFaixa() === tela) return;
  abrirModulo(moduloDaTelaVist(tela), tela);        // pinta a faixa; abrirTelaVist vê que já está nela
};

/* Números das abas (em aberto, anomalias, extintores vencendo) na faixa. */
window.vistNumeros = nums => { vistNums = nums || {}; pintarNumerosVist(); };
function pintarNumerosVist() {
  const faixa = $('navTelas');
  if (!faixa || !barraVist()) return;
  const porSub = {};
  VIST_MODULOS.forEach(m => m.subs.forEach(s => s.telas.forEach(([t]) => { porSub[s.id] = t; })));
  document.querySelectorAll('#navTelas [data-tela], #navTelas [data-sub], #navModulos .mod-subs [data-sub]').forEach(b => {
    const t = b.dataset.tela || porSub[b.dataset.sub];
    const n = vistNums[t];
    let el = b.querySelector('.rb-num');
    if (!n) { el?.remove(); return; }
    if (!el) { el = document.createElement('b'); el.className = 'rb-num'; b.appendChild(el); }
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('rb-num-alerta', t === 'vsEx');
  });
}
aoPintarFaixa(pintarNumerosVist);

/* LOP - Principal (21/10/2026, pedido dele): ao entrar, dois ícones —
   Usuários - Acessos (abre a lista de quem acessa o quê, logo abaixo) e
   Backup (toca e faz o backup, como era na tela inicial, com "trocar pasta"). */
function desenharPrincipal() {
  const hub = $('cfHub'), conteudo = $('cfConteudo');
  if (!hub || !conteudo) return;
  conteudo.hidden = true;
  hub.innerHTML = `
    <button type="button" class="ar-cartao arb-tile" id="cfHubUsuarios" title="Quem acessa o quê · Senhas">
      <img src="icons/area-usuarios.v3.svg" alt="">
      <span class="ar-txt"><b>Usuários - Acessos</b></span>
    </button>
    <div id="cfHubBackup"></div>`;
  $('cfHubUsuarios').addEventListener('click', () => {
    conteudo.hidden = !conteudo.hidden;
    $('cfHubUsuarios').classList.toggle('cf-hub-ativo', !conteudo.hidden);
    if (!conteudo.hidden) dispatchEvent(new Event('gr:tela-config'));
  });
  desenharBackupInicio($('cfHubBackup'), avisarInicio).catch(e => {
    $('cfHubBackup').innerHTML = `<p class="dica">Backup indisponível: ${esc(e.message || e)}</p>`;
  });
}
