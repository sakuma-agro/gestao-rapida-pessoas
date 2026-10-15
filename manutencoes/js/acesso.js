/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — quem entra vê o quê

   Mesmo desenho do Gestão Rápida (Pessoas): a lista de gente fica na
   tabela `usuarios`, cada pessoa tem um nome de login, uma marca de
   administrador, os módulos liberados e — quando se quer apertar mais —
   as telas de dentro de cada módulo.

   Administrador enxerga tudo e é o único que mexe nesta lista.
   As fazendas continuam valendo por cima disso: o perfil diz o que a
   pessoa pode fazer, o local diz sobre quais máquinas.
   ===================================================================== */

/* Os módulos do app. Para criar um módulo novo, basta acrescentar um item
   aqui com as telas que já existem em TELAS — o menu, a tela de
   configurações e as permissões passam a enxergá-lo sozinhos. */
const MODULOS = [
  /* 15/10/2026: a área virou "Máquinas e Patrimônio" com dois módulos.
     Manutenções guarda tudo o que a área já tinha; Patrimônio é o novo.
     Os ids das telas não mudaram — atalhos e links de WhatsApp continuam. */
  { id: 'manutencoes', nome: 'Manutenções', telas: [
    ['painel', 'Painel'], ['maquinas', 'Máquinas'], ['vencimentos', 'Vencimentos'],
    ['calendario', 'Calendário'], ['ordens', 'Ordens de serviço'], ['checklist', 'Check list'],
  ] },
  { id: 'patrimonio', nome: 'Patrimônio', telas: [
    ['patrimonio', 'Bens'], ['patrimonio_mov', 'Movimentações'],
  ] },
];

/* Quem ainda não tiver módulo marcado entra com estes — assim ninguém fica
   trancado do lado de fora por esquecimento. */
const MODULOS_PADRAO = ['manutencoes', 'patrimonio'];

const Acesso = {
  admin: false,
  modulos: [...MODULOS_PADRAO],
  telas: [],
  carregado: false,
};

const soAdmin = new Set(
  MODULOS.filter(m => m.admin).flatMap(m => m.telas.map(([t]) => t))
);

const moduloDe = tela => MODULOS.find(m => m.telas.some(([t]) => t === tela))?.id || null;

const pode = m => Acesso.admin || Acesso.modulos.includes(m);

/* Permissão por tela. A lista guarda 'modulo:tela'. Enquanto nenhuma tela de
   um módulo estiver marcada, a pessoa vê o módulo inteiro — que é o caso
   normal. Basta marcar uma para o resto sumir. */
const temRestricao = m => Acesso.telas.some(x => x.startsWith(m + ':'));

function podeTela(tela) {
  if (Acesso.admin) return true;
  if (soAdmin.has(tela)) return false;
  const m = moduloDe(tela);
  if (!m || !pode(m)) return false;
  return !temRestricao(m) || Acesso.telas.includes(m + ':' + tela);
}

const telasLiberadas = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? m.telas.filter(([t]) => podeTela(t)) : [];
};

const modulosLiberados = () =>
  MODULOS.filter(m => pode(m.id) && telasLiberadas(m.id).length);

/* ---------------------------------------------------------------- carga */

function carregarAcesso(u) {
  // A lista de gente é a do app inteiro: quem tem a área liberada vê os dois
  // módulos (Manutenções e Patrimônio). Quem é administrador (do app ou só desta área) mexe nos cadastros.
  Acesso.admin = !!(u && u.admin);
  Acesso.modulos = [...MODULOS_PADRAO];
  Acesso.telas = [];
  Acesso.carregado = true;
  return Acesso;
}

/* ---------------------------------------------------------------- menu */

let moduloAberto = null;

/** Monta a primeira faixa (módulos) e abre a tela de marca. */
function montarMenu() {
  const libs = new Set(modulosLiberados().map(m => m.id));
  // Botões com ícone, como os módulos da área Pessoas (09/10/2026). Todos os
  // módulos aparecem; os sem acesso ficam em cinza e não abrem (15/10/2026).
  const ic = m => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_ATALHO[ICONE_MODULO_M[m.id]] || ''}</svg>`;
  $('#menu').innerHTML = MODULOS.map(m => libs.has(m.id)
    ? `<button type="button" data-modulo="${m.id}">${ic(m)}<span>${esc(m.nome)}</span></button>`
    : `<button type="button" class="fantasma" disabled aria-disabled="true" title="Você não tem acesso a este módulo. Peça ao administrador.">${ic(m)}<span>${esc(m.nome)}</span></button>`).join('');
  $$('#menu button[data-modulo]').forEach(b => b.onclick = () => abrirModulo(b.dataset.modulo));
  $('#menu').hidden = false;
  mostrarInicio();
}

/** A tela de entrada: nenhum módulo aberto, só SAKUMA e LOP. */
function mostrarInicio() {
  moduloAberto = null;
  $$('#menu button').forEach(b => b.classList.remove('ativo'));
  $('#menu2').hidden = true;
  $('#menu2').innerHTML = '';
  TELAS.marca($('#tela'));
}

function abrirModulo(id, tela) {
  if (!id) return;
  moduloAberto = id;
  $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === id));

  if (id === 'config') {
    document.body.classList.remove('sem-rodape');
    $('#menu2').hidden = true;
    $('#menu2').innerHTML = '';
    TELAS.config($('#tela'));
    return;
  }

  const telas = telasLiberadas(id);
  if (!telas.length) return;
  const alvo = telas.some(([t]) => t === tela) ? tela : telas[0][0];

  // Módulo de uma tela só não ganha segunda faixa: seria uma aba sozinha.
  $('#menu2').hidden = telas.length < 2;
  $('#menu2').innerHTML = telas.map(botaoTela).join('');
  $$('#menu2 button').forEach(b => b.onclick = () => irPara(b.dataset.tela));
  irPara(alvo);
}

/** Pinta as faixas quando a tela é aberta de fora (atalho, link, botão). */
function marcarMenu(tela) {
  const m = moduloDe(tela);
  if (!m) return;
  if (m !== moduloAberto) {
    moduloAberto = m;
    $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === m));
    const telas = telasLiberadas(m);
    $('#menu2').hidden = telas.length < 2;
    $('#menu2').innerHTML = telas.map(botaoTela).join('');
    $$('#menu2 button').forEach(b => b.onclick = () => irPara(b.dataset.tela));
  }
  $$('#menu2 button').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
}

/** A primeira tela que a pessoa pode ver, para atalhos e links. */
function primeiraTela() {
  const libs = modulosLiberados();
  return libs.length ? telasLiberadas(libs[0].id)[0][0] : null;
}

/* ---------------------------------------------------------------- tela de marca */

/* Acesso rápido na lateral (mesmo modelo do Programação Campo): ícone grande,
   nome embaixo. Só aparece o que a pessoa tem permissão de abrir. */
const ICONE_ATALHO = {
  check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  painel: '<path d="M5 20V10M11 20V4M17 20v-7"/>',
  venc: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v3l2 1"/>',
  os: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  anomalia: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  horimetro: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-3M9 2h6"/>',
  bens: '<rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M6 11l2-5h8l2 5"/>',
  patrimonio: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  manut: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  mov: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
};
const ICONE_MODULO_M = { manutencoes: 'manut', patrimonio: 'patrimonio' };
/* Ícone de cada tela na segunda faixa (15/10/2026, pedido dele: "que todas
   tenham um ícone"). */
ICONE_ATALHO.cal = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 18h2M12 18h2"/>';
const ICONE_TELA_M = { painel: 'painel', maquinas: 'bens', vencimentos: 'venc', calendario: 'cal',
  ordens: 'os', checklist: 'check', patrimonio: 'patrimonio', patrimonio_mov: 'mov' };
const botaoTela = ([t, rot]) =>
  `<button type="button" data-tela="${t}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_ATALHO[ICONE_TELA_M[t]] || ''}</svg><span>${esc(rot)}</span></button>`;
const ATALHOS_INICIO = [
  ['painel', 'painel', 'Painel', 'prim'],
  ['vencimentos', 'venc', 'Vencimentos'],
  ['calendario', 'venc', 'Calendário'],
  ['ordens', 'os', 'Ordens de serviço'],
  ['maquinas', 'bens', 'Máquinas'],
  ['checklist', 'check', 'Check list'],
  ['patrimonio', 'patrimonio', 'Patrimônio'],
  ['patrimonio_mov', 'mov', 'Movimentações'],
];

TELAS.marca = el => {
  // Na tela de entrada a assinatura da LOP é a grande, no meio: o rodapé fixo
  // sai de cena para a marca não aparecer duas vezes na mesma página.
  document.body.classList.add('sem-rodape');
  const atalhos = ATALHOS_INICIO.filter(([t]) => podeTela(t));
  el.innerHTML = `
    <div class="ini-lateral">
      <nav class="ql" aria-label="Acesso rápido">
        ${atalhos.map(([t, ic, rot, cl]) => `<button type="button" class="ql-item ${cl || ''}" data-ir="${t}" title="${esc(rot)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONE_ATALHO[ic]}</svg>
          <span>${esc(rot)}</span></button>`).join('')}
      </nav>
      <section class="marca-inicio">
        <img class="mi-sakuma" src="../img/sakuma-marca-vertical.png" alt="SAKUMA Agronegócios">
        <h2>Gestão Rápida <span>Máquinas e Patrimônio</span></h2>
        <p class="mi-dica">Escolha um atalho ao lado ou um módulo no menu acima.</p>
        <div class="lop-ass mi-lop" role="img" aria-label="Desenvolvido por LOP — Inteligência para o agronegócio">
          <img src="../img/lop-marca.png" alt=""><span class="lop-div"></span>
          <span class="lop-txt"><b>DESENVOLVIDO POR LOP</b><span>INTELIGÊNCIA PARA O AGRONEGÓCIO</span></span>
        </div>
      </section>
    </div>`;
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => irPara(b.dataset.ir));
};

/* ---------------------------------------------------------------- configurações

   Quem entra, as fazendas de cada pessoa e quem é administrador da área agora
   ficam em Configurações do LOP - Gestão Rápida (o app principal). */
TELAS.config = el => {
  el.innerHTML = `<h1>Configurações</h1>
    <p class="sub">O acesso à área Máquinas e Patrimônio e as fazendas de cada pessoa ficam em
    <strong>Configurações</strong>, no topo do LOP - Gestão Rápida.</p>`;
};

/* Scripts clássicos: publico o que base.js e telas.js usam. */
Object.assign(window, {
  MODULOS, Acesso, carregarAcesso, pode, podeTela, montarMenu, abrirModulo,
  marcarMenu, mostrarInicio, primeiraTela, modulosLiberados,
});
