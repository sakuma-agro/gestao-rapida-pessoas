// acesso.js — os módulos do app e quem vê o quê.
//
// É o mesmo motor de menu do Gestão Rápida (Pessoas): três faixas (módulo,
// submódulo, tela), abas montadas a partir da lista MODULOS. Enquanto o banco
// não entra, `acesso` abre tudo; quando entrar, é só trocar `carregarAcesso()`
// pela leitura da tabela de usuários — o resto daqui não muda.

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Os módulos do app. A ordem daqui é a ordem das abas na tela.

   O app é de BALANÇO, não de movimento: ninguém dá entrada nem saída por
   aqui. Conta-se o que está na prateleira (Contagem), compara-se com o saldo
   que veio do sistema (Acerto) e o cadastro só guarda o que é preciso para
   essas duas coisas funcionarem. */
export const MODULOS = [
  { id: 'contagem', nome: 'Contagem', telas: [
    ['ctNova',       'Contar'],
    ['ctAndamento',  'Em andamento'],
    ['ctRepor',      'Reposição'],
    ['ctMapa',       'Mapa do barracão'],
    ['ctHistorico',  'Histórico'],
  ] },
  { id: 'compra', nome: 'Compra inteligente', telas: [
    ['ciLista',      'Levantamentos'],
  ] },
  { id: 'qc', nome: 'Estoque Quebra Cocão', telas: [
    ['qcVisao',    'Estoque'],
    ['qcPainel',   'Movimentações'],
    ['qcEntrada',  'Entradas'],
    ['qcSaida',    'Saídas'],
  ] },
  { id: 'acerto', nome: 'Acerto', telas: [
    ['acSaldo',           'Saldo do sistema'],
    ['acPainel',          'Painel'],
    ['acDivergencias',    'Divergências'],
    ['acTransferencias',  'Transferências'],
    ['acRelatorio',       'Relatório'],
  ] },
  { id: 'cadastros', nome: 'Cadastros', subs: [
    { id: 'itens',  nome: 'Itens',  telas: [
      ['cadItens',  'Itens'],
      ['cadGrupos', 'Grupos e unidades'],
    ] },
    { id: 'locais', nome: 'Almoxarifados', telas: [
      ['cadLocais', 'Almoxarifados'],
    ] },
    { id: 'saldos', nome: 'Saldo do sistema', admin: true, telas: [
      ['cadSaldos', 'Importar saldo'],
    ] },
  ] },
];

/* Um módulo sem submódulo se comporta como se tivesse um só, com o nome dele.
   Assim o resto do código não precisa saber qual é qual. */
export const subsDe = m => m.subs || [{ id: m.id, nome: m.nome, telas: m.telas || [] }];
export const telasDe = m => subsDe(m).flatMap(s => s.telas);

export const moduloDe = tela =>
  MODULOS.find(m => telasDe(m).some(([t]) => t === tela))?.id || null;

// Dentro do LOP: quem chega aqui já passou pela regra da área (módulo
// 'estoque' em Usuários - Acessos, ou administrador). Enquanto o banco do
// Estoque não entra, quem entra na área enxerga todas as telas dela.
export const acesso = { email: '', admin: true, modulos: MODULOS.map(m => m.id), telas: [], carregado: true };

export const pode = m => acesso.admin || acesso.modulos.includes(m);

/* Permissão por tela. A lista guarda 'modulo:tela'. Enquanto nenhuma tela de
   um módulo estiver marcada, a pessoa vê o módulo inteiro. */
const temRestricao = m => acesso.telas.some(x => x.startsWith(m + ':'));

const soAdmin = new Set(
  MODULOS.flatMap(m => subsDe(m).filter(s => s.admin).flatMap(s => s.telas.map(([t]) => t)))
);

export function podeTela(tela) {
  if (acesso.admin) return true;
  if (soAdmin.has(tela)) return false;
  const m = moduloDe(tela);
  if (!m || !pode(m)) return false;
  return !temRestricao(m) || acesso.telas.includes(m + ':' + tela);
}

export const telasLiberadas = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? telasDe(m).filter(([t]) => podeTela(t)) : [];
};

const subsLiberados = id => {
  const m = MODULOS.find(x => x.id === id);
  if (!m) return [];
  return subsDe(m)
    .map(s => ({ ...s, telas: s.telas.filter(([t]) => podeTela(t)) }))
    .filter(s => s.telas.length);
};

/* =============== menu =============== */
let aoTrocar = () => {};

export const modulosLiberados = () =>
  MODULOS.filter(m => pode(m.id) && telasLiberadas(m.id).length);

/** Monta o menu com o que a pessoa pode ver e abre a tela de marca. */
export function montarMenu(callback) {
  if (callback) aoTrocar = callback;
  const libs = modulosLiberados();

  $('navModulos').innerHTML = libs.map(m =>
    `<button class="aba" role="tab" data-modulo="${m.id}" aria-selected="false">${esc(m.nome)}</button>`).join('')
;   // quem entra e o que vê fica em Usuários - Acessos, no LOP

  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.addEventListener('click', () => abrirModulo(b.dataset.modulo)));

  // Entra na tela de marca, não num módulo: quem escolhe o que abrir é ele.
  /* Menu em categoria (20/10/2026, pedido dele): módulo aberto com os filhos
     ao lado e as telas logo abaixo — ../js/categoria-moldura.js. */
  if (window.CategoriaMoldura) window.CategoriaMoldura.ligar({ modulos: '#navModulos', filhos: '#navTelas', inicio: () => mostrarInicio() });
  mostrarInicio();
}

/** A tela de entrada: nenhum módulo aberto, só SAKUMA e LOP. */
export function mostrarInicio() {
  $('navModulos').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', 'false'));
  $('navTelas').hidden = true;
  $('navSub').hidden = true;
  aoTrocar('inicio');
}

export function abrirModulo(id, tela) {
  if (!id) return;
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.modulo === id)));

  const subs = subsLiberados(id);
  if (!subs.length) return;

  // Módulo sem submódulo: a segunda faixa mostra as telas.
  if (subs.length === 1) {
    $('navSub').hidden = true;
    desenharTelas($('navTelas'), 'aba2', subs[0].telas, tela);
    return;
  }

  // Com submódulo: segunda faixa são os submódulos, terceira são as telas.
  const sub = subs.find(s => s.telas.some(([t]) => t === tela)) || subs[0];
  $('navTelas').hidden = false;
  $('navTelas').innerHTML = subs.map(s =>
    `<button class="aba2" role="tab" data-sub="${s.id}" aria-selected="${s.id === sub.id}">${esc(s.nome)}</button>`).join('');
  $('navTelas').querySelectorAll('.aba2').forEach(b =>
    b.addEventListener('click', () => abrirModulo(id, (subs.find(s => s.id === b.dataset.sub)?.telas[0] || [])[0])));

  desenharTelas($('navSub'), 'aba3', sub.telas, tela);
}

/** Desenha uma faixa de telas e abre a escolhida (ou a primeira). */
function desenharTelas(faixa, classe, telas, tela) {
  const alvo = telas.some(([t]) => t === tela) ? tela : telas[0][0];
  faixa.hidden = telas.length < 2;
  faixa.innerHTML = telas.map(([t, rot]) =>
    `<button class="${classe}" role="tab" data-tela="${t}" aria-selected="${t === alvo}">${esc(rot)}</button>`).join('');
  faixa.querySelectorAll('[data-tela]').forEach(b =>
    b.addEventListener('click', () => {
      faixa.querySelectorAll('[data-tela]').forEach(x =>
        x.setAttribute('aria-selected', String(x === b)));
      aoTrocar(b.dataset.tela);
    }));
  aoTrocar(alvo);
}
