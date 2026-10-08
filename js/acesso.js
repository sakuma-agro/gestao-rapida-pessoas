// acesso.js — quem entra vê o quê
// A lista fica na tabela app_usuarios. Quem é administrador enxerga tudo
// e pode mexer nesta lista; os outros só leem a própria linha.
import { estado } from './store.js';
import { ICONE_TELA, ICONE_MODULO, svgIcone } from './icones.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Os módulos do app. Para criar um módulo novo no futuro, basta acrescentar
   um item aqui (com as telas que já existirem no index.html) — o menu, a tela
   de configurações e as permissões passam a enxergá-lo sozinhos.

   Um módulo pode ter as telas direto em `telas` (duas faixas de menu) ou
   agrupá-las em `subs`, os submódulos (três faixas: módulo, submódulo, tela).
   É o caso do SST. */
export const MODULOS = [
  /* A ordem daqui é a ordem das abas na tela, e é ela que ele pediu:
     Cadastros, SST, RH, DP.

     "Cadastros" reúne o que todo o resto do app consome: as pessoas, as
     funções e a estrutura (empregador, fazenda, unidade). Antes isso estava
     espalhado — função e setor não tinham tela nenhuma, e empregador e fazenda
     só existiam escondidos dentro de DP → Configurações. A Certificação, que
     era módulo solto com uma tela só, virou submódulo daqui.
     `admin: true` no submódulo deixa a faixa só para administrador. */
  { id: 'pessoas', nome: 'Cadastros', subs: [
    { id: 'gente', nome: 'Funcionários', telas: [
      ['funcionarios', 'Cadastro · Nível 1'],
      ['funcionariosN2', 'Cadastro · Nível 2'],
      ['aniversarios', 'Aniversariantes'],
    ] },
    /* Folha de ponto (28/09/2026): imprime empregador, nome, mês e ano na
       folha de ponto que vem da gráfica. Ele pediu aqui em Cadastros. */
    { id: 'folhaPonto', nome: 'Folha de ponto', telas: [
      ['folhaPonto', 'Folha de ponto'],
    ] },
    { id: 'certificacao', nome: 'Certificação', telas: [
      ['lista', 'Lista de presença'],
      ['termoSindical', 'Termo de liberdade sindical'],
      ['termoContrato', 'Recebimento do contrato'],
    ] },
    /* Quadro de pessoal (29/09/2026): saiu de RH › Relatórios a pedido dele — é
       relatório do cadastro de funcionários. A chave da tela (rhQuadro) não mudou. */
    { id: 'relatoriosCad', nome: 'Relatórios', telas: [
      ['cadRelatorios', 'Relatórios'],
      ['rhQuadro', 'Quadro de pessoal'],
    ] },
    /* "Estrutura" (29/09/2026): Funções e setores e Empregador e fazenda viraram
       um submódulo só, a pedido dele. As chaves das telas não mudaram. */
    { id: 'estrutura', nome: 'Estrutura', admin: true, telas: [
      ['cadFuncoes', 'Funções e setores'],
      ['cadEstrutura', 'Empregador e fazenda'],
    ] },
  ] },
  { id: 'sst', nome: 'SST', subs: [
    { id: 'epis', nome: "EPI's", telas: [
      ['fichas', 'Fichas'],
      ['epis', 'Tipos de EPI'],
      ['modelo', 'Modelo da ficha'],
    ] },
    { id: 'exames', nome: 'Exames', telas: [
      ['exPainel', 'Painel'],
      ['exVenc', 'Vencimentos'],
      ['exFuncoes', 'Exames por função'],
      ['exTipos', 'Tipos e periodicidade'],
    ] },
    { id: 'treinamentos', nome: 'Treinamentos', telas: [
      ['trPainel', 'Painel'],
      ['trVenc', 'Vencimentos'],
      ['trTipos', 'Tipos e periodicidade'],
    ] },
    /* Acidentes e CAT (08/10/2026): js/sst-acidentes.js, tabela sst_acidentes. */
    { id: 'acidentes', nome: 'Acidentes', telas: [
      ['acPainel', 'Painel'],
      ['acLista', 'Registros e CAT'],
    ] },
  ] },
  { id: 'rh', nome: 'RH', subs: [
    { id: 'disc', nome: 'DISC', telas: [
      ['disc', 'Perfil comportamental'],
    ] },
    { id: 'cargos', nome: 'Cargos e salários', telas: [
      ['rhCargos', 'Plano de cargos'],
      /* Salários e projeção por pessoa (01/10/2026) — js/rh-salarios.js. */
      ['rhSalarios', 'Salários'],
      ['rhSalProj', 'Projeção'],
      ['rhProposta', 'Gerar proposta'],
    ] },
    /* Organograma (29/09/2026): hierarquia por função — js/organograma.js. */
    { id: 'organograma', nome: 'Organograma', telas: [
      ['rhOrganograma', 'Organograma'],
    ] },
    /* Salário digno (07/10/2026): função + faixa em uso × benchmark, planos de
       ação e parâmetros com vigência — js/rh-salario-digno.js. */
    { id: 'salarioDigno', nome: 'Salário digno', telas: [
      ['sdQuadro', 'Funções'],
      ['sdPlanos', 'Planos de ação'],
      ['sdConfig', 'Configurações'],
    ] },
    /* Indicadores (01/10/2026): absenteísmo e turnover — js/rh-indicadores.js. */
    { id: 'indicadores', nome: 'Indicadores', telas: [
      ['rhIndPainel', 'Painel'],
      ['rhIndPessoa', 'Por pessoa'],
      ['rhIndCert', 'Certificação'],
      ['rhIndMetas', 'Metas'],
    ] },
  ] },
  /* DP em submódulos (21/09/2026). O Painel é a tela de abertura, fora dos
     submódulos — submódulo de uma tela só esconde a terceira faixa. As chaves
     das telas antigas (jorLancar, jorBoletins…) não mudaram: a permissão por
     tela que já estiver gravada em app_usuarios continua valendo. */
  { id: 'jornada', nome: 'DP', subs: [
    { id: 'dpPainel', nome: 'Painel', telas: [
      ['jorPainel',       'Painel'],
    ] },
    { id: 'gestaoJornada', nome: 'Gestão de jornada', telas: [
      ['jorLancar',       'Lançar jornada'],
      ['jorBoletins',     'Lançados'],
      ['jorAbatimento',   'Abatimento de horas'],
      ['jorFechamento',   'Fechamento'],
      ['jorHistorico',    'Histórico de fechamentos'],
    ] },
    /* Boletins diários (24/09/2026): quem entregou o boletim de serviço do dia
       e o relatório individual do que falta. Substitui a planilha
       Controle_Entrega_Boletim.xlsx. */
    { id: 'boletinsDiarios', nome: 'Boletins diários', telas: [
      ['bdDia',           'Marcar o dia'],
      ['bdMes',           'Mês'],
      ['bdPend',          'Pendências'],
    ] },
    /* Folha, holerite e recibo (30/09/2026): os documentos que todo mês o
       funcionário assina e devolve — mais o 13º em novembro e dezembro —, e o
       escaneamento depois. js/jornada-documentos.js. */
    { id: 'docMensais', nome: 'Folha, holerite e recibo', telas: [
      ['dmPainel',        'Painel'],
      ['dmMes',           'Mês'],
      ['dmScan',          'Escanear'],
    ] },
    { id: 'emprestimo', nome: 'Empréstimo Funcionário', telas: [
      ['empEmissao',      'Emissão recibo'],
      ['empRecibos',      'Recibos emitidos'],
      ['empHistorico',    'Conta corrente'],
    ] },
    /* Férias (23/09/2026): direito e prazo, sem valores. Afastamento mora aqui
       porque é ele que decide a perda do período aquisitivo — e o bloqueio da
       parcela do empréstimo lê o mesmo lançamento. */
    { id: 'ferias', nome: 'Férias', telas: [
      ['ferPainel',       'Painel'],
      ['ferPrev',         'Previsão'],
      ['ferLanc',         'Lançamentos'],
      ['ferAfast',        'Afastamentos'],
      ['ferRisco',        'Períodos em risco'],
      ['ferIni',          'Situação inicial'],
    ] },
    { id: 'dpRelatorios', nome: 'Relatórios', telas: [
      ['jorRelatorios',   'Relatórios'],
    ] },
    { id: 'dpConfig', nome: 'Configurações', telas: [
      ['jorConfig',       'Jornada'],
      ['empSalarios',     'Salário base'],
    ] },
  ] },
];

/* Um módulo sem submódulo se comporta como se tivesse um só, com o nome dele.
   Assim o resto do código não precisa saber qual é qual. */
export const subsDe = m => m.subs || [{ id: m.id, nome: m.nome, telas: m.telas || [] }];
export const telasDe = m => subsDe(m).flatMap(s => s.telas);

export const moduloDe = tela =>
  MODULOS.find(m => telasDe(m).some(([t]) => t === tela))?.id || null;

/* O que algumas telas deixam FAZER, além de ver. Aparece embaixo da tela na
   lista de permissões (Configurações), para quem dá o acesso saber o que está
   liberando. Quem não tem a tela não tem a ação — e o banco confere também. */
export const ACAO_TELA = {
  dmPainel: 'consulta: quem deve e o que falta escanear',
  dmMes:    'marca entregue, não entregue, em correção',
  dmScan:   'marca escaneado (só o que já foi entregue)',
};

// Quem ainda não estiver na lista entra com estes módulos — assim ninguém
// fica trancado do lado de fora; RH e Configurações ficam sempre de fora.
const PADRAO = ['pessoas', 'sst'];

export const acesso = { email: '', admin: false, modulos: [...PADRAO], telas: [], destinos: [], carregado: false };

/* DP que o login enxerga (07/10/2026, pedido dele: "um cadastro que tem acesso
   somente ao DP 2"). Lista de jor_destinos_dp.id em app_usuarios.destinos;
   vazia = todos, como sempre foi. Administrador vê tudo. O recorte é de tela —
   decisão dele: quem tem esse login não acessa o banco por fora. */
export const dpRestrito = () => !acesso.admin && (acesso.destinos || []).length > 0;
export const veDestino = id => !dpRestrito() || acesso.destinos.includes(id);
/* Configurações do DP valem para a empresa toda: ficam fora de quem vê um DP só. */
const SO_DP_INTEIRO = new Set(['jorConfig', 'empSalarios']);
let usuarios = [];
let editando = null;
/* Destinos de DP para o campo "DP que enxerga" (lidos ao abrir Configurações). */
let destinosDp = [];
const rotuloDp = d => d.organograma ? `${d.nome} · ${d.organograma}` : d.nome;
const nomesDp = ids => ids.map(id => destinosDp.find(d => d.id === id)).filter(Boolean).map(rotuloDp).join(' e ') || 'DP escolhido';

export const pode = m => acesso.admin || acesso.modulos.includes(m);

/* Permissão por tela (submódulo). A lista guarda 'modulo:tela'.
   Enquanto nenhuma tela de um módulo estiver na lista, a pessoa vê o módulo
   inteiro — que é como sempre funcionou. Basta marcar uma para o resto sumir. */
const temRestricao = m => acesso.telas.some(x => x.startsWith(m + ':'));

/* Telas de submódulo marcado com `admin: true`. Ficam fora para quem não é
   administrador, mesmo que o módulo inteiro esteja liberado — é o caso de
   empregador, fazenda e funções, que a equipe consulta mas não edita. */
const soAdmin = new Set(
  MODULOS.flatMap(m => subsDe(m).filter(s => s.admin).flatMap(s => s.telas.map(([t]) => t)))
);

export function podeTela(tela) {
  if (acesso.admin) return true;
  if (soAdmin.has(tela)) return false;
  if (SO_DP_INTEIRO.has(tela) && dpRestrito()) return false;
  const m = moduloDe(tela);
  if (!m || !pode(m)) return false;
  return !temRestricao(m) || acesso.telas.includes(m + ':' + tela);
}

export const telasLiberadas = m => {
  const mod = MODULOS.find(x => x.id === m);
  return mod ? telasDe(mod).filter(([t]) => podeTela(t)) : [];
};

/** Submódulos com pelo menos uma tela liberada. */
export const subsLiberados = m => {
  const mod = MODULOS.find(x => x.id === m);
  if (!mod) return [];
  return subsDe(mod)
    .map(s => ({ ...s, telas: s.telas.filter(([t]) => podeTela(t)) }))
    .filter(s => s.telas.length);
};

export async function carregarAcesso() {
  acesso.email = (estado.sessao?.user?.email || '').toLowerCase();
  try {
    const { data, error } = await estado.cliente
      .from('app_usuarios').select('*').order('email');
    if (error) throw error;
    usuarios = data || [];
    const meu = usuarios.find(u => (u.email || '').toLowerCase() === acesso.email);
    acesso.admin = !!meu?.admin;
    acesso.modulos = meu ? (meu.modulos || []) : [...PADRAO];
    // quem tinha o módulo antigo "EPIs" enxerga o SST, que tomou o lugar dele
    if (acesso.modulos.includes('epis') && !acesso.modulos.includes('sst')) acesso.modulos.push('sst');
    acesso.telas = meu ? (meu.telas || []) : [];
    acesso.destinos = meu ? (meu.destinos || []) : [];
    /* "Certificação" era módulo próprio e virou submódulo de Cadastros. Quem
       tinha só ela continua entrando na lista de presença — e só nela, pelo
       recorte por tela; quem já tinha Cadastros não muda nada. */
    if (acesso.modulos.includes('certificacao') && !acesso.modulos.includes('pessoas')) {
      acesso.modulos = [...acesso.modulos, 'pessoas'];
      acesso.telas = [...acesso.telas, 'pessoas:lista'];
    }
  } catch {
    acesso.admin = false;
    acesso.modulos = [...PADRAO];
    acesso.telas = [];
    acesso.destinos = [];
  }
  acesso.carregado = true;
  return acesso;
}

/* =============== menu =============== */
let aoTrocar = () => {};
let moduloAberto = null;

export const modulosLiberados = () =>
  MODULOS.filter(m => pode(m.id) && telasLiberadas(m.id).length);

/** Monta o menu com o que a pessoa pode ver e abre o primeiro módulo. */
export function montarMenu(callback) {
  if (callback) aoTrocar = callback;
  const libs = modulosLiberados();

  /* Módulos como botões com ícone (30/09/2026, pedido dele: "dar mais
     destaque"). O aberto fica verde cheio; Configurações vai para a direita. */
  $('navModulos').innerHTML = libs.map(m =>
    `<button class="aba" role="tab" data-modulo="${m.id}" aria-selected="false">${svgIcone(ICONE_MODULO[m.id] || 'lista')}<span>${esc(m.nome)}</span></button>`).join('')
    + (acesso.admin
      ? `<button class="aba aba-config" role="tab" data-modulo="config" aria-selected="false">${svgIcone('config')}<span>Configurações</span></button>`
      : '');

  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.addEventListener('click', () => abrirModulo(b.dataset.modulo)));

  // Entra na tela de marca, não num módulo: quem escolhe o que abrir é ele.
  mostrarInicio();
}

/** A tela de entrada: nenhum módulo aberto, só SAKUMA e LOP. */
export function mostrarInicio() {
  moduloAberto = null;
  $('navModulos').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', 'false'));
  $('navTelas').hidden = true;
  $('navSub').hidden = true;
  aoTrocar('inicio');
}

export function abrirModulo(id, tela) {
  if (!id) return;
  moduloAberto = id;
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.modulo === id)));

  if (id === 'config') {
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('config');
    return;
  }

  const subs = subsLiberados(id);
  if (!subs.length) return;
  desenharFaixa(id, subs, tela);
}

/* Faixa de ícones (29/09/2026, pedido dele a partir de um protótipo): no lugar
   das duas faixas de botões de texto (submódulo e tela), todas as telas do
   módulo aparecem de uma vez, como botões com ícone, agrupadas pelo
   submódulo, com o nome do grupo numa faixa colorida embaixo. Acima do
   conteúdo fica o caminho "Módulo › Submódulo › Tela". Permissão continua
   igual: só entra o que subsLiberados() devolve. */
const CORES_GRUPO = ['rb-verde', 'rb-marrom', 'rb-cinza'];

/* Submódulos primeiro (30/09/2026, pedido dele — "está com muitos itens
   abertos"). Módulo com mais de um submódulo abre mostrando só um ícone por
   submódulo; clicar num submódulo de várias telas troca a faixa para as telas
   dele, com "← Módulo" para voltar. Submódulo de uma tela só abre direto.
   Módulo de um submódulo só continua mostrando as telas. */
const ICONE_SUB = {
  gente: 'pessoa', folhaPonto: 'calendario', certificacao: 'check', relatoriosCad: 'grafico', estrutura: 'predio',
  epis: 'escudo', exames: 'exame', treinamentos: 'treino',
  disc: 'disc', cargos: 'cargo', organograma: 'organograma', indicadores: 'grafico', salarioDigno: 'balanca',
  dpPainel: 'painel', gestaoJornada: 'relogio', boletinsDiarios: 'boletim', docMensais: 'recibo',
  emprestimo: 'dinheiro', ferias: 'sol', dpRelatorios: 'grafico', dpConfig: 'config',
};
const iconeSub = (s, id) => ICONE_SUB[s.id] || ICONE_TELA[s.telas[0]?.[0]] || ICONE_MODULO[id] || 'lista';
/* Submódulo aberto na faixa (null = nível dos submódulos) e última tela usada em cada um. */
const faixaEstado = { modulo: null, sub: null, tela: null };
const ultimaTela = {};

function desenharFaixa(id, subs, tela) {
  const todas = subs.flatMap(s => s.telas);
  const alvo = todas.some(([t]) => t === tela) ? tela : todas[0][0];
  const subAlvo = subs.find(s => s.telas.some(([t]) => t === alvo));
  // Veio com tela escolhida (atalho, link de outra tela) e ela mora num
  // submódulo de várias telas: já abre dentro dele. Senão, nível dos submódulos.
  const dentro = subs.length > 1 && tela && subAlvo.telas.length > 1 ? subAlvo.id : null;
  faixaEstado.modulo = id; faixaEstado.sub = subs.length > 1 ? dentro : subAlvo.id; faixaEstado.tela = alvo;
  pintarFaixa(id, subs);
  marcarTela(id, subs, alvo, true);
}

function pintarFaixa(id, subs) {
  const faixa = $('navTelas');
  faixa.hidden = false;
  faixa.classList.add('rb');
  const mod = MODULOS.find(m => m.id === id);
  const atual = subs.find(s => s.telas.some(([t]) => t === faixaEstado.tela));
  const botaoTela = (t, rot) => `<button type="button" class="rb-btn" role="tab" data-tela="${t}" aria-selected="${t === faixaEstado.tela}" title="${esc(rot)}">
          ${svgIcone(ICONE_TELA[t] || ICONE_MODULO[id] || 'lista')}<span>${esc(rot)}</span></button>`;

  if (subs.length === 1) {
    // Um submódulo só: as telas direto, como sempre foi.
    faixa.innerHTML = `<section class="rb-grupo ${CORES_GRUPO[0]}" aria-label="${esc(subs[0].nome)}">
      <div class="rb-botoes">${subs[0].telas.map(([t, rot]) => botaoTela(t, rot)).join('')}</div></section>`;
  } else if (!faixaEstado.sub) {
    // Nível dos submódulos: um ícone por submódulo.
    faixa.innerHTML = `<section class="rb-grupo rb-subs" aria-label="${esc(mod?.nome || '')}"><div class="rb-botoes">${subs.map(s => `
      <button type="button" class="rb-btn rb-sub" data-sub="${s.id}" aria-selected="${s === atual}" title="${esc(s.nome)}">
        ${svgIcone(iconeSub(s, id))}<span>${esc(s.nome)}</span>${s.telas.length > 1 ? `<small>${s.telas.length} telas</small>` : ''}</button>`).join('')}
    </div></section>`;
  } else {
    // Dentro de um submódulo: voltar + as telas dele.
    const s = subs.find(x => x.id === faixaEstado.sub);
    const i = subs.indexOf(s);
    faixa.innerHTML = `<button type="button" class="rb-voltar" data-voltar title="Voltar aos submódulos de ${esc(mod?.nome || '')}">
        ${svgIcone('seta-esq')}<span>${esc(mod?.nome || 'Voltar')}</span></button>
      <section class="rb-grupo ${CORES_GRUPO[i % CORES_GRUPO.length]}" aria-label="${esc(s.nome)}">
        <div class="rb-botoes">${s.telas.map(([t, rot]) => botaoTela(t, rot)).join('')}</div>
        <div class="rb-rotulo">${esc(s.nome)}</div></section>`;
  }

  faixa.querySelectorAll('[data-tela]').forEach(b =>
    b.addEventListener('click', () => {
      faixaEstado.tela = b.dataset.tela;
      if (faixaEstado.sub) ultimaTela[faixaEstado.sub] = b.dataset.tela;
      marcarTela(id, subs, b.dataset.tela, true);
    }));
  faixa.querySelectorAll('[data-sub]').forEach(b =>
    b.addEventListener('click', () => {
      const s = subs.find(x => x.id === b.dataset.sub);
      const t = (ultimaTela[s.id] && s.telas.some(([x]) => x === ultimaTela[s.id])) ? ultimaTela[s.id] : s.telas[0][0];
      faixaEstado.tela = t;
      faixaEstado.sub = s.telas.length > 1 ? s.id : null;
      pintarFaixa(id, subs);
      marcarTela(id, subs, t, true);
    }));
  faixa.querySelector('[data-voltar]')?.addEventListener('click', () => {
    faixaEstado.sub = null;
    pintarFaixa(id, subs);   // só a faixa: a tela aberta continua a mesma
  });
  faixa.scrollLeft = 0;
  faixa.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  sombraFaixa();
  requestAnimationFrame(sombraFaixa);
}

/* Faixa maior que a tela (o DP tem muitas telas): um esmaecido na borda avisa
   que há mais para o lado; some quando se chega ao fim. */
function sombraFaixa() {
  const f = $('navTelas');
  if (!f) return;
  const resto = f.scrollWidth - f.clientWidth - f.scrollLeft;
  f.classList.toggle('rb-mais', resto > 4);
}
addEventListener('resize', sombraFaixa);
document.addEventListener('scroll', ev => { if (ev.target?.id === 'navTelas') sombraFaixa(); }, true);

function marcarTela(id, subs, tela, abrir) {
  $('navTelas').querySelectorAll('[data-tela]').forEach(x =>
    x.setAttribute('aria-selected', String(x.dataset.tela === tela)));
  const subDaTela = subs.find(s => s.telas.some(([t]) => t === tela));
  $('navTelas').querySelectorAll('[data-sub]').forEach(x =>
    x.setAttribute('aria-selected', String(x.dataset.sub === subDaTela?.id)));
  const mod = MODULOS.find(m => m.id === id);
  const sub = subs.find(s => s.telas.some(([t]) => t === tela));
  const rot = sub?.telas.find(([t]) => t === tela)?.[1] || '';
  const partes = [mod?.nome, subs.length > 1 && sub && sub.nome !== rot ? sub.nome : null, rot].filter(Boolean);
  const cam = $('navSub');
  cam.hidden = false;
  cam.classList.add('rb-caminho');
  cam.innerHTML = partes.map((p, i) => i === partes.length - 1
    ? `<b>${esc(p)}</b>` : `<span>${esc(p)}</span><span class="rb-sep" aria-hidden="true">›</span>`).join('');
  if (abrir) aoTrocar(tela);
}

/* =============== tela de configurações =============== */

/* Telas que dá para liberar a quem não é administrador (as de submódulo
   `admin: true` ficam de fora: essas só o administrador vê). */
const telasLiberaveis = m => subsDe(m).filter(s => !s.admin).flatMap(s => s.telas.map(([t]) => t));

/** O que a pessoa u enxerga no módulo m: lista de telas (vazia = nada). */
function telasVistas(u, m) {
  const todas = telasLiberaveis(m);
  if (u.admin) return telasDe(m).map(([t]) => t);
  if (!(u.modulos || []).includes(m.id)) return [];
  const marc = (u.telas || []).filter(x => x.startsWith(m.id + ':')).map(x => x.slice(m.id.length + 1));
  return marc.length ? todas.filter(t => marc.includes(t)) : todas;
}

/** Grava em u a lista de telas vistas de um módulo, no formato do banco:
 *  nenhuma = sem o módulo; todas = módulo inteiro (sem restrição, pega telas
 *  novas no futuro); algumas = só elas. */
function definirTelas(u, m, vistas) {
  const todas = telasLiberaveis(m);
  const set = new Set(vistas.filter(t => todas.includes(t)));
  const mods = new Set(u.modulos || []);
  let telas = (u.telas || []).filter(x => !x.startsWith(m.id + ':'));
  if (!set.size) mods.delete(m.id);
  else {
    mods.add(m.id);
    if (set.size < todas.length) telas = [...telas, ...[...set].map(t => m.id + ':' + t)];
  }
  u.modulos = [...mods];
  u.telas = telas;
}

function resumoModulo(u, m) {
  const v = telasVistas(u, m), total = telasLiberaveis(m).length;
  if (u.admin) return { txt: 'tudo', cls: 'cf-tudo' };
  if (!v.length) return null;
  if (v.length >= total) return { txt: 'tudo', cls: 'cf-tudo' };
  return { txt: `${v.length} de ${total} telas`, cls: 'cf-parte' };
}

export function desenharConfig() {
  const aviso = $('cfAviso');
  if (!acesso.admin) {
    aviso.textContent = 'Só quem é administrador mexe nesta lista.';
    aviso.hidden = false;
    $('cfTabela').innerHTML = '';
    return;
  }
  aviso.hidden = true;
  if (!destinosDp.length && estado.cliente) {
    estado.cliente.from('jor_destinos_dp').select('id,nome,organograma,ativo').order('nome')
      .then(({ data }) => {
        destinosDp = (data || []).filter(d => d.ativo !== false);
        if (destinosDp.length) desenharConfig();
      });
  }

  $('cfTabela').innerHTML = usuarios.length ? `
    <table class="dc-planilha cf-tab"><thead><tr>
      <th>Pessoa</th><th>Login</th><th>O que enxerga</th><th></th>
    </tr></thead><tbody>${usuarios.map(u => {
      const eu = (u.email || '').toLowerCase() === acesso.email;
      const chips = u.admin
        ? '<span class="cf-chip cf-admin">Administrador · tudo, inclusive Configurações</span>'
        : MODULOS.map(m => { const r = resumoModulo(u, m);
            const dp = r && m.id === 'jornada' && (u.destinos || []).length
              ? (r.txt === 'tudo' ? '' : r.txt + ' · ') + 'só ' + nomesDp(u.destinos) : '';
            return r ? `<button type="button" class="cf-chip ${dp ? 'cf-parte' : r.cls}" data-editar-us="${esc(u.email)}" data-foco="${m.id}">${esc(m.nome)} · ${esc(dp || r.txt)}</button>` : ''; })
            .join('') || '<span class="dc-sem">nenhum módulo — não vê nada</span>';
      return `<tr>
        <td><b>${esc(u.nome || u.email)}</b>${eu ? ' <span class="tag ativo">você</span>' : ''}
          <br><span class="dc-sem">${esc(u.email)}</span></td>
        <td>${u.usuario ? `<code>${esc(u.usuario)}</code>` : '<span class="dc-sem">entra pelo e-mail</span>'}</td>
        <td><div class="cf-chips">${chips}</div></td>
        <td class="ce"><button class="btn mini" data-editar-us="${esc(u.email)}">Editar acesso</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Ninguém cadastrado ainda.</div>';

  $('cfTabela').querySelectorAll('[data-editar-us]').forEach(b =>
    b.addEventListener('click', () => abrirUsuario(b.dataset.editarUs, b.dataset.foco)));
}

async function gravar(u) {
  const { error } = await estado.cliente.from('app_usuarios').upsert({
    email: u.email.trim().toLowerCase(), nome: u.nome || null,
    usuario: u.usuario || null,
    admin: !!u.admin, modulos: u.modulos || [], telas: u.telas || [],
    destinos: u.admin ? [] : (u.destinos || []),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'email' });
  if (error) {
    const a = $('cfAviso');
    a.textContent = erroDeLogin(error) || ('Não consegui salvar: ' + error.message);
    a.hidden = false;
    return false;
  }
  $('cfAviso').hidden = true;
  return true;
}

/* O banco é quem garante que não existem dois logins iguais e que o formato
   está certo. Aqui só traduzimos o que ele reclama. */
function erroDeLogin(error) {
  const m = String(error?.message || '');
  if (/app_usuarios_usuario_unico|duplicate key/i.test(m)) {
    return 'Esse login já é de outra pessoa. Escolha outro.';
  }
  if (/app_usuarios_usuario_formato|violates check constraint/i.test(m)) {
    return 'Login inválido: use de 3 a 30 caracteres, só letras, números, '
      + 'ponto, traço ou sublinhado — sem espaço e sem acento.';
  }
  return null;
}

/* Cria o login de verdade (Supabase Auth) e o acesso, de uma vez.
   Quem cria é a função 'criar-usuario' no servidor: ela confere se quem
   pediu é administrador e devolve a senha uma única vez. */
async function criarLogin(u) {
  const aviso = $('cfAviso');
  try {
    const { data, error } = await estado.cliente.functions.invoke('criar-usuario', {
      body: { email: u.email, nome: u.nome, admin: !!u.admin,
              modulos: u.modulos || [], telas: u.telas || [] },
    });
    if (error) throw error;
    if (data?.erro) throw new Error(data.erro);

    const i = usuarios.findIndex(x => x.email === u.email);
    const linha = { email: u.email, nome: u.nome, usuario: u.usuario || null,
                    admin: !!u.admin,
                    modulos: u.modulos || [], telas: u.telas || [] };
    if (i >= 0) usuarios[i] = linha; else usuarios.push(linha);
    usuarios.sort((a, b) => a.email.localeCompare(b.email));

    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.innerHTML = data.jaExistia
      ? `<b>Esse e-mail já tinha login.</b> A senha continua a mesma;
         o que mudou foi o acesso aos módulos e telas.`
      : `<b>Login criado.</b> Anote a senha agora — ela não fica guardada
         e não dá para ver de novo:<br><br>
         <code id="usSenhaTexto">${esc(data.senha)}</code>
         <div class="barra"><button type="button" class="btn mini" id="bCopiarSenha">Copiar</button>
         <span class="dc-sem">Peça para a pessoa trocar no primeiro acesso.</span></div>`;

    $('bCopiarSenha')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.senha);
        $('bCopiarSenha').textContent = 'Copiada';
      } catch { $('bCopiarSenha').textContent = 'Selecione e copie'; }
    });

    editando.novo = false;
    editando.emailOriginal = u.email;
    aviso.hidden = true;
    return true;
  } catch (e) {
    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.className = 'us-senha erro';
    caixa.innerHTML = '<b>Não consegui criar o acesso.</b><br>' + esc(e.message || String(e));
    return false;
  }
}

function mostrarErroNoDialogo(titulo, texto) {
  const caixa = $('usSenha');
  caixa.hidden = false;
  caixa.className = 'us-senha erro';
  caixa.innerHTML = '<b>' + esc(titulo) + '</b><br>' + esc(texto);
}

/* Troca o e-mail de quem já tem login. Quem faz é a função 'criar-usuario'
   (acao 'email'), porque mexer na conta exige a chave de serviço. A senha e o
   login (nome de usuário) continuam os mesmos. */
async function trocarEmail(antigo, novo) {
  try {
    const { data, error } = await estado.cliente.functions.invoke('criar-usuario', {
      body: { acao: 'email', email: antigo, novo },
    });
    if (error) {
      // a função devolve o motivo no corpo mesmo quando o status é de erro
      let motivo = '';
      try { motivo = (await error.context?.json())?.erro || ''; } catch {}
      throw new Error(motivo || error.message);
    }
    if (data?.erro) throw new Error(data.erro);
    return true;
  } catch (e) {
    mostrarErroNoDialogo('Não troquei o e-mail.', e.message || String(e));
    return false;
  }
}

function abrirUsuario(email, foco) {
  const u = email ? usuarios.find(x => x.email === email) : null;
  editando = u ? { ...u, telas: [...(u.telas || [])], destinos: [...(u.destinos || [])], novo: false, emailOriginal: u.email }
                : { email: '', nome: '', usuario: '', admin: false,
                    modulos: [...PADRAO], telas: [], destinos: [], novo: true };
  $('usSenha').hidden = true;
  $('usSenha').className = 'us-senha';
  $('usSenha').innerHTML = '';
  $('bSalvarUsuario').textContent = u ? 'Salvar' : 'Criar login e acesso';
  $('tituloUsuario').textContent = u ? 'Editar pessoa' : 'Adicionar pessoa';
  $('usEmail').value = editando.email || '';
  $('usEmail').disabled = false;
  $('usNome').value = editando.nome || '';
  $('usUsuario').value = editando.usuario || '';
  $('bApagarUsuario').hidden = !u || (u.email || '').toLowerCase() === acesso.email;
  $('bNovaSenha').hidden = !u;
  desenharPermissoes();
  $('dlgUsuario').showModal();
  if (foco) $('usPermissoes').querySelector(`[data-bloco="${foco}"]`)?.scrollIntoView({ block: 'start' });
}

/* O que a pessoa enxerga, em árvore: módulo → submódulo → tela.
   Marcado = enxerga. Tudo marcado num módulo é gravado como "módulo
   inteiro" (e aí tela nova que surgir depois já entra); parte marcada é
   gravada tela a tela. O banco lê o mesmo formato (app_pode_tela). */
function desenharPermissoes() {
  const e = editando;
  if (!e) return;
  const outros = usuarios.filter(u => u.email !== e.email && !u.admin);

  $('usPermissoes').innerHTML = `
    <label class="us-admin"><input type="checkbox" id="usAdmin" ${e.admin ? 'checked' : ''}
        ${(e.email || '').toLowerCase() === acesso.email ? 'disabled title="Você não pode tirar o próprio acesso de administrador"' : ''}>
      <span><b>Administrador</b><br><span class="dc-sem">Enxerga e faz tudo, inclusive esta tela de Configurações.</span></span></label>
    ${e.admin ? '' : `
    <div class="us-copiar">
      <select id="usCopiar" aria-label="Copiar acesso de outra pessoa">
        <option value="">Copiar o acesso de outra pessoa…</option>
        ${outros.map(u => `<option value="${esc(u.email)}">${esc(u.nome || u.email)}</option>`).join('')}
      </select>
      <button type="button" class="btn mini" data-tudo="1">Marcar tudo</button>
      <button type="button" class="btn mini" data-tudo="0">Limpar tudo</button>
    </div>
    ${MODULOS.map(m => {
      const vistas = telasVistas(e, m), todas = telasLiberaveis(m);
      const estadoCx = !vistas.length ? '' : vistas.length >= todas.length ? 'checked' : 'data-meio="1"';
      return `<div class="us-mod ${vistas.length ? '' : 'desligado'}" data-bloco="${m.id}">
        <label class="us-mod__topo">
          <input type="checkbox" data-mod="${m.id}" ${estadoCx}>
          <b>${esc(m.nome)}</b>
          <span class="dc-sem">${!vistas.length ? 'não enxerga' : vistas.length >= todas.length ? 'o módulo inteiro' : `${vistas.length} de ${todas.length} telas`}</span>
        </label>
        ${m.id === 'jornada' && vistas.length && destinosDp.length ? `
        <label class="us-dp campo">DP que enxerga
          <select id="usDestinos">
            <option value="">Todos os DP</option>
            ${destinosDp.map(d => `<option value="${d.id}"${(e.destinos || []).length === 1 && e.destinos[0] === d.id ? ' selected' : ''}>Só ${esc(rotuloDp(d))}</option>`).join('')}
          </select>
          <small class="dc-sem">Com um DP só, as telas do DP mostram apenas as pessoas dele; Jornada e Salário base (configurações) ficam fora.</small>
        </label>` : ''}
        ${subsDe(m).map(sb => {
          const ts = sb.telas.map(([t]) => t);
          const nSub = ts.filter(t => vistas.includes(t)).length;
          return `<div class="us-subbloco">
          ${m.subs ? `<label class="us-sub">${sb.admin ? '' : `<input type="checkbox" data-mod="${m.id}" data-sub="${sb.id}"
              ${nSub === ts.length ? 'checked' : nSub ? 'data-meio="1"' : ''}>`}${esc(sb.nome)}${sb.admin ? ' <span class="us-soadmin">só administrador</span>' : ''}</label>` : ''}
          <div class="us-telas">
            ${sb.telas.map(([tid, rot]) => `
              <label class="us-tela ${ACAO_TELA[tid] ? 'com-acao' : ''}">
                <input type="checkbox" data-mod="${m.id}" data-tela="${tid}" ${vistas.includes(tid) ? 'checked' : ''} ${sb.admin ? 'disabled' : ''}>
                <span>${esc(rot)}${ACAO_TELA[tid] ? `<small>${esc(ACAO_TELA[tid])}</small>` : ''}</span>
              </label>`).join('')}
          </div></div>`;
        }).join('')}
      </div>`;
    }).join('')}`}`;

  const raiz = $('usPermissoes');
  raiz.querySelectorAll('[data-meio]').forEach(cx => { cx.indeterminate = true; });
  $('usAdmin')?.addEventListener('change', ev => { e.admin = ev.target.checked; desenharPermissoes(); });
  $('usDestinos')?.addEventListener('change', ev => { e.destinos = ev.target.value ? [ev.target.value] : []; });
  $('usCopiar')?.addEventListener('change', ev => {
    const o = usuarios.find(u => u.email === ev.target.value);
    if (!o) return;
    e.modulos = [...(o.modulos || [])]; e.telas = [...(o.telas || [])]; e.destinos = [...(o.destinos || [])];
    desenharPermissoes();
  });
  raiz.querySelectorAll('[data-tudo]').forEach(b => b.addEventListener('click', () => {
    MODULOS.forEach(m => definirTelas(e, m, b.dataset.tudo === '1' ? telasLiberaveis(m) : []));
    desenharPermissoes();
  }));
  raiz.querySelectorAll('input[data-mod]').forEach(cx => cx.addEventListener('change', () => {
    const m = MODULOS.find(x => x.id === cx.dataset.mod);
    let vistas = telasVistas(e, m);
    if (cx.dataset.tela) {
      vistas = cx.checked ? [...vistas, cx.dataset.tela] : vistas.filter(t => t !== cx.dataset.tela);
    } else if (cx.dataset.sub) {
      const ts = subsDe(m).find(x => x.id === cx.dataset.sub).telas.map(([t]) => t);
      vistas = cx.checked ? [...vistas, ...ts] : vistas.filter(t => !ts.includes(t));
    } else {
      vistas = cx.checked ? telasLiberaveis(m) : [];
    }
    definirTelas(e, m, vistas);
    desenharPermissoes();
  }));
}

export function ligarAcesso() {
  $('cfNovo').addEventListener('click', () => abrirUsuario(null));

  $('formUsuario').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editando) return;
    const email = $('usEmail').value.trim().toLowerCase();
    if (!email) return;

    const usuario = $('usUsuario').value.trim().toLowerCase();
    if (usuario && !/^[a-z0-9._-]{3,30}$/.test(usuario)) {
      const a = $('cfAviso');
      a.textContent = 'Login inválido: use de 3 a 30 caracteres, só letras, '
        + 'números, ponto, traço ou sublinhado — sem espaço e sem acento.';
      a.hidden = false;
      return;
    }
    // conferência amigável antes de bater no banco; a garantia de verdade é o índice único
    if (usuario && usuarios.some(x => (x.usuario || '') === usuario && x.email !== email)) {
      const a = $('cfAviso');
      a.textContent = 'Esse login já é de outra pessoa. Escolha outro.';
      a.hidden = false;
      return;
    }

    const u = { ...editando, email, nome: $('usNome').value.trim(),
                 usuario: usuario || null,
                 modulos: editando.modulos || [], telas: editando.telas || [],
                 destinos: editando.destinos || [] };

    if (editando.novo) {
      // Pessoa nova: o login precisa ser criado no servidor, porque a chave
      // que cria login não pode existir no navegador.
      const ok = await criarLogin(u);
      if (!ok) return;                 // erro já apareceu; o diálogo fica aberto
      // A função do servidor grava módulos e telas; o recorte de DP vai à parte.
      if ((u.destinos || []).length && await gravar(u)) {
        const i = usuarios.findIndex(x => x.email === u.email);
        if (i >= 0) usuarios[i] = { ...usuarios[i], destinos: u.destinos };
      }
      desenharConfig();
      return;                          // fica aberto para copiar a senha
    }

    // Trocou o e-mail de quem já tem login: a conta de login e as tabelas
    // que usam o e-mail como chave mudam juntas, no servidor.
    const antigo = (editando.emailOriginal || '').toLowerCase();
    const trocouEmail = antigo && email !== antigo;
    if (trocouEmail) {
      if (usuarios.some(x => (x.email || '').toLowerCase() === email)) {
        mostrarErroNoDialogo('Não troquei o e-mail.', 'Esse e-mail já é de outra pessoa no app.');
        return;
      }
      const ok = await trocarEmail(antigo, email);
      if (!ok) return;                 // erro já apareceu; o diálogo fica aberto
      usuarios = usuarios.filter(x => (x.email || '').toLowerCase() !== antigo);
      editando.email = email;
      editando.emailOriginal = email;
      // Foi o próprio e-mail: o token atual ainda carrega o endereço velho, e
      // é por ele que o banco reconhece o administrador. Renova já, antes de
      // gravar o resto — senão o banco recusa por não achar o admin.
      if (antigo === acesso.email) {
        try {
          const { data } = await estado.cliente.auth.refreshSession();
          if (data?.session) estado.sessao = data.session;
        } catch {}
      }
    }

    if (await gravar(u)) {
      const i = usuarios.findIndex(x => x.email === email);
      if (i >= 0) usuarios[i] = u; else usuarios.push(u);
      usuarios.sort((a, b) => a.email.localeCompare(b.email));
    }

    if (trocouEmail && antigo === acesso.email) {
      await carregarAcesso();
      montarMenu();
      abrirModulo('config');
    }
    $('dlgUsuario').close();
    desenharConfig();
  });

  $('bNovaSenha').addEventListener('click', async () => {
    if (!editando?.email) return;
    if (!confirm(`Gerar uma senha nova para ${editando.email}?\n\n` +
                 'A senha atual deixa de funcionar na hora, e a nova aparece uma vez só.')) return;
    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.className = 'us-senha';
    caixa.textContent = 'Gerando...';
    try {
      const { data, error } = await estado.cliente.functions.invoke('criar-usuario', {
        body: { acao: 'senha', email: editando.email },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      caixa.innerHTML = `<b>Senha nova.</b> Anote agora — ela não fica guardada:<br><br>
        <code>${esc(data.senha)}</code>
        <div class="barra"><button type="button" class="btn mini" id="bCopiarSenha">Copiar</button>
        <span class="dc-sem">A senha anterior já não funciona mais.</span></div>`;
      $('bCopiarSenha').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.senha);
          $('bCopiarSenha').textContent = 'Copiada';
        } catch { $('bCopiarSenha').textContent = 'Selecione e copie'; }
      });
    } catch (e) {
      caixa.className = 'us-senha erro';
      caixa.innerHTML = '<b>Não consegui trocar a senha.</b><br>' + esc(e.message || String(e));
    }
  });

  $('bApagarUsuario').addEventListener('click', async () => {
    if (!editando?.email) return;
    if (!confirm(`Tirar o acesso de ${editando.email}? A conta continua existindo no Supabase, ` +
      'mas o app deixa de mostrar qualquer aba para ela.')) return;
    const { error } = await estado.cliente.from('app_usuarios').delete().eq('email', editando.email);
    if (error) { alert('Não consegui tirar: ' + error.message); return; }
    usuarios = usuarios.filter(x => x.email !== editando.email);
    $('dlgUsuario').close();
    desenharConfig();
  });
}

export function limparAcesso() {
  usuarios = []; editando = null;
  acesso.email = ''; acesso.admin = false;
  acesso.modulos = [...PADRAO]; acesso.destinos = []; acesso.carregado = false;
  destinosDp = [];
}
