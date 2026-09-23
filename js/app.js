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
import { desenharCadastros } from './jornada-cadastros.js';
import { carregarAcesso, montarMenu, desenharConfig, ligarAcesso, limparAcesso,
  mostrarInicio, abrirModulo, moduloDe } from './acesso.js';
import { ligarJornada, abrirJornada, limparJornada } from './jornada.js';
import { abrirEmprestimo, fecharDocEmprestimo } from './jornada-emprestimos.js';
import { abrirFerias, etiquetaFicha } from './jornada-ferias.js';
import { ligarSst, abrirSst, limparSst, limparPreviaSst } from './sst.js';
import { ligarAso, abrirFuncoes } from './aso.js';
import { ligarTermos, abrirTermos } from './termos.js';
import { estadoCa, caReprovado, linkCa, dataBr as dataBrCa, conferirCas } from './ca.js';
import { ligarRh, abrirRh, limparRh } from './rh.js';
import * as jd from './jornada-dados.js';
import { pode, podeTela } from './acesso.js';
import { ligarBackup } from './backup.js';
import { verFichaCadastral, imprimirFichaCadastral, fecharFichaCadastral } from './ficha-cadastral.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

const marcados = new Set();     // ids de funcionários selecionados (fichas)
const naLista = new Set();      // ids de funcionários na lista de presença
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
  const alvo = $('jorImpressao');
  if (alvo) { alvo.innerHTML = ''; alvo.hidden = true; }
}

/* Acesso rápido na lateral da tela inicial: ícone grande e nome embaixo.
   Só aparece o que a pessoa tem permissão de abrir. */
const ICONES_ATALHO = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bolo: '<path d="M4 21h16v-7H4z"/><path d="M4 14c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1.5 4 0"/><path d="M12 10V7M12 4.5v.01"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  exame: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M12 8v6"/>',
  treino: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 10v5c3 2 7 2 10 0v-5"/>',
  painel: '<path d="M5 20V10M11 20V4M17 20v-7"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  disc: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
};
const ATALHOS_INICIO = [
  ['funcionarios', 'pessoa', 'Funcionários', 'prim'],
  ['aniversarios', 'bolo', 'Aniversariantes'],
  ['fichas', 'escudo', 'Fichas de EPI'],
  ['exVenc', 'exame', 'Exames a vencer'],
  ['trVenc', 'treino', 'Treinamentos a vencer'],
  ['jorPainel', 'painel', 'Painel DP'],
  ['jorLancar', 'relogio', 'Lançar jornada'],
  ['disc', 'disc', 'Perfil DISC'],
];
function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  const lista = ATALHOS_INICIO.filter(([t]) => podeTela(t));
  nav.hidden = !lista.length;
  nav.innerHTML = lista.map(([t, ic, rot, cl]) => `
    <button type="button" class="ql-item ${cl || ''}" data-atalho="${t}" title="${rot}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES_ATALHO[ic]}</svg>
      <span>${rot}</span></button>`).join('');
  nav.querySelectorAll('[data-atalho]').forEach(b => b.addEventListener('click', () =>
    abrirModulo(moduloDe(b.dataset.atalho), b.dataset.atalho)));
}

function abrirAba(nome) {
  limparPrevias();
  $('telaInicio').hidden = nome !== 'inicio';
  if (nome === 'inicio') desenharAtalhos();
  $('telaFichas').hidden = nome !== 'fichas';
  $('telaLista').hidden = nome !== 'lista';
  $('telaTermoSindical').hidden = nome !== 'termoSindical';
  $('telaTermoContrato').hidden = nome !== 'termoContrato';
  $('telaFuncionarios').hidden = nome !== 'funcionarios';
  $('telaFuncionariosN2').hidden = nome !== 'funcionariosN2';
  $('telaAniversarios').hidden = nome !== 'aniversarios';
  $('telaCadFuncoes').hidden = nome !== 'cadFuncoes';
  $('telaCadEstrutura').hidden = nome !== 'cadEstrutura';
  $('telaEpis').hidden = nome !== 'epis';
  $('telaModelo').hidden = nome !== 'modelo';
  $('telaDisc').hidden = nome !== 'disc';
  $('telaConfig').hidden = nome !== 'config';
  $('telaExPainel').hidden = nome !== 'exPainel';
  $('telaTrPainel').hidden = nome !== 'trPainel';
  $('telaExVenc').hidden  = nome !== 'exVenc';
  $('telaExTipos').hidden = nome !== 'exTipos';
  $('telaExFuncoes').hidden = nome !== 'exFuncoes';
  $('telaTrVenc').hidden  = nome !== 'trVenc';
  $('telaTrTipos').hidden = nome !== 'trTipos';
  $('telaJorPainel').hidden       = nome !== 'jorPainel';
  $('telaJorLancar').hidden       = nome !== 'jorLancar';
  $('telaJorBoletins').hidden     = nome !== 'jorBoletins';
  $('telaJorFechamento').hidden   = nome !== 'jorFechamento';
  $('telaJorRelatorios').hidden   = nome !== 'jorRelatorios';
  $('telaJorConfig').hidden       = nome !== 'jorConfig';
  $('telaEmpEmissao').hidden      = nome !== 'empEmissao';
  $('telaEmpRecibos').hidden      = nome !== 'empRecibos';
  $('telaEmpHistorico').hidden    = nome !== 'empHistorico';
  $('telaEmpSalarios').hidden     = nome !== 'empSalarios';
  ['ferPainel', 'ferPrev', 'ferLanc', 'ferAfast', 'ferRisco', 'ferIni'].forEach(t =>
    { $('tela' + t[0].toUpperCase() + t.slice(1)).hidden = nome !== t; });
  if (nome === 'lista') { preencherLista(); desenharSelecaoLista(); }
  if (nome === 'termoSindical' || nome === 'termoContrato') abrirTermos(nome);
  if (nome === 'aniversarios') atualizarAniversarios();
  if (nome === 'funcionarios') desenharFuncionarios();
  if (nome === 'funcionariosN2') desenharFuncN2();
  /* Os cadastros estruturais desenham a partir da mesma receita do DP; cada
     tela escolhe o seu punhado. Depois de salvar, as listas do cadastro de
     funcionário são remontadas, senão a função nova só aparece ao recarregar. */
  if (nome === 'cadFuncoes') desenharCadastros('cadFuncoesLista', ['funcoes', 'setores'], desenharFuncionarios);
  if (nome === 'cadEstrutura') desenharCadastros('cadEstruturaLista',
    ['empregadores', 'fazendas', 'unidades', 'destinos'], desenharFuncionarios);
  if (nome === 'epis') { desenharEpis(); conferirCa(false); }
  if (nome === 'modelo') preencherModelo();
  $('telaRhCargos').hidden   = nome !== 'rhCargos';
  $('telaRhProposta').hidden = nome !== 'rhProposta';
  $('telaRhQuadro').hidden   = nome !== 'rhQuadro';
  if (nome === 'disc') abrirDisc();
  if (['rhCargos', 'rhProposta', 'rhQuadro'].includes(nome)) abrirRh(nome);
  if (nome === 'config') desenharConfig();
  if (['exPainel', 'exVenc', 'exTipos', 'trPainel', 'trVenc', 'trTipos'].includes(nome)) abrirSst(nome);
  if (nome === 'exFuncoes') abrirFuncoes();
  if (nome.startsWith('jor')) abrirJornada(nome);
  if (nome.startsWith('emp')) abrirEmprestimo(nome);
  if (nome.startsWith('fer')) abrirFerias(nome);
}

/* =============== login =============== */
$('formLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('erroLogin'); erro.hidden = true;
  const botao = $('btnEntrar'); botao.disabled = true; botao.textContent = 'Entrando...';
  try {
    await db.entrar($('logEmail').value.trim(), $('logSenha').value);
    mostrar('app');
    await carregarTudo();
  } catch (e) {
    erro.textContent = traduzirErro(e);
    erro.hidden = false;
  } finally {
    botao.disabled = false; botao.textContent = 'Entrar';
  }
});

/* O nome do app no alto volta para a tela de marca e desmarca o módulo —
   é o mesmo gesto de clicar no logotipo de um site. */
$('bInicio').addEventListener('click', () => {
  if (!$('app').hidden) mostrarInicio();
});

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
  marcados.clear(); rascunhos.clear();
  limparDisc(); limparAcesso(); limparJornada(); limparSst(); limparRh();
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

  try {
    await db.sincronizar();
  } catch (e) {
    recado.push('Usando os dados salvos neste aparelho. ' + traduzirErro(e));
  }

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
  if (pode('jornada') || pode('pessoas')) {
    try { await jd.carregar(); } catch { /* sem rede: usa o que está no cache */ }
  }

  montarMenu(abrirAba);

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
  box.innerHTML = vs.length ? vs.map(f => `
    <label class="item" for="l_${f.id}">
      <input type="checkbox" id="l_${f.id}" data-id="${f.id}" ${naLista.has(f.id) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
    </label>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  box.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? naLista.add(cb.dataset.id) : naLista.delete(cb.dataset.id);
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
  const gente = estado.funcionarios.filter(f => naLista.has(f.id));
  $('cntLista').textContent = gente.length;
  $('saidaLista').innerHTML = montarLista(gente, cabecalhoLista());
  $('cntFolhas').textContent = $('saidaLista').children.length;
}

['lpTitulo', 'lpCodigo', 'lpData', 'lpRevisao', 'lpElaboracao', 'lpAprovacao']
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
  naLista.clear();
  desenharSelecaoLista();
});
$('bImprimirLista').addEventListener('click', () => window.print());
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
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}${f.admissao ? ' · desde ' + esc(dataBr(f.admissao)) : ''}</span>${
          f.situacao === 'ATIVO' && etiquetaFicha(f.id) ? `<br><span class="fer-etiquetas">${etiquetaFicha(f.id)}</span>` : ''}
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
      <span class="acoes">
        <button class="btn mini" data-ficha="${f.id}">Ficha</button>
        <button class="btn mini" data-editar="${f.id}">Editar</button>
      </span>
    </div>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  $('listaFunc').querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirFuncionario(b.dataset.editar)));
  /* Ficha do Funcionário: prévia na tela primeiro, imprimir é escolha dele. */
  $('listaFunc').querySelectorAll('[data-ficha]').forEach(b =>
    b.addEventListener('click', () =>
      verFichaCadastral(estado.funcionarios.find(x => x.id === b.dataset.ficha))));
}

const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

function abrirFuncionario(id) {
  const f = id ? estado.funcionarios.find(x => x.id === id) : null;
  editandoFunc = f ? { ...f } : { id: db.novoId(), situacao: 'ATIVO', setor: modeloAtual().setor_padrao || 'CAMPO' };
  $('tituloFunc').textContent = f ? 'Editar funcionário' : 'Novo funcionário';
  $('fuNome').value = editandoFunc.nome || '';
  $('fuApelido').value = editandoFunc.apelido || '';
  $('fuCadastro').value = editandoFunc.cadastro || '';
  $('fuNascimento').value = (editandoFunc.nascimento || '').slice(0, 10);
  $('fuSexo').value = editandoFunc.sexo || '';
  $('fuTelefone').value = editandoFunc.telefone || '';
  $('fuAdmissao').value = (editandoFunc.admissao || '').slice(0, 10);
  $('fuCpf').value = editandoFunc.cpf || '';
  montarListasDoCadastro(editandoFunc);
  $('fuCalcado').value = editandoFunc.tam_calcado || '';
  $('fuCamisa').value = editandoFunc.tam_camisa || '';
  $('fuSituacao').value = editandoFunc.situacao || 'ATIVO';
  preencherFichaCompleta(editandoFunc);
  $('bApagarFunc').hidden = !f;
  $('dlgFunc').showModal();
}

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
  const temDP = pode('jornada') || podeTela('funcionariosN2');
  const v = jd.vinculoDe(f.id);
  const opcoes = (lista, sel, rotulo = x => x.nome) =>
    '<option value=""></option>' + lista
      .filter(x => x.ativo !== false)
      .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(rotulo(x))}</option>`)
      .join('');

  $('fuUnidade').innerHTML = opcoes(jd.dados.unidades, v?.unidade_id, u => jd.nomeUnidade(u));
  $('fuSetor').innerHTML   = opcoes(jd.dados.setores, v?.setor_id);
  $('fuCargo').innerHTML   = opcoes(jd.dados.funcoes, v?.funcao_id);

  // Ainda sem vínculo: mostra o que estava escrito, para não parecer que sumiu.
  const escrito = [f.empregador, f.fazenda].filter(Boolean).join(' · ');
  $('fuUnidadeAtual').textContent = (!v?.unidade_id && escrito)
    ? 'Hoje está escrito: ' + escrito + ' — escolha a unidade para padronizar.'
    : '';

}

/* =============== cadastro nível 2 =============== */

let editandoN2 = null;

function desenharFuncN2() {
  const q = $('buscaFuncN2').value.trim().toLowerCase();
  const lista = estado.funcionarios
    .filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
    .filter(f => !q || String(f.nome || '').toLowerCase().includes(q));

  $('listaFuncN2').innerHTML = lista.length ? lista.map(f => {
    const v = jd.vinculoDe(f.id);
    const jornada = jd.dados.jornadas.find(j => j.id === v?.jornada_id);
    const setor = jd.dados.setores.find(s => s.id === v?.setor_id);
    const riscos = [
      v?.periculosidade ? 'periculosidade 30%' : null,
      v?.insalubridade && v.insalubridade !== 'nao' ? 'insalubridade ' + v.insalubridade : null,
    ].filter(Boolean).join(' · ');
    return `<div class="item" data-id="${f.id}" style="grid-template-columns:1fr auto auto">
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(jornada?.nome || (setor ? 'jornada do setor ' + setor.nome : 'sem jornada definida'))}${riscos ? ' · ' + esc(riscos) : ''}${v?.matricula ? ' · matr. ' + esc(v.matricula) : ''}</span>
      </span>
      <span class="tag ${riscos ? 'inativo' : 'ativo'}">${riscos ? 'com adicional' : 'sem adicional'}</span>
      <span class="acoes"><button class="btn mini" data-n2="${f.id}">Editar</button></span>
    </div>`;
  }).join('') : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  $('listaFuncN2').querySelectorAll('[data-n2]').forEach(b =>
    b.addEventListener('click', () => abrirFuncN2(b.dataset.n2)));
}

function abrirFuncN2(id) {
  const f = estado.funcionarios.find(x => x.id === id);
  if (!f) return;
  const v = jd.vinculoDe(id) || {};
  editandoN2 = { id, nome: f.nome };

  const opcoes = (lista, sel) => '<option value=""></option>' + lista
    .filter(x => x.ativo !== false)
    .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');

  const unidade = jd.unidadeDe(v);
  $('tituloFuncN2').textContent = f.nome;
  $('subFuncN2').textContent = unidade
    ? jd.nomeUnidade(unidade)
    : 'Sem unidade no Nível 1 — a apuração precisa dela para saber o destino de DP.';
  $('n2Jornada').innerHTML = opcoes(jd.dados.jornadas, v.jornada_id);
  $('n2Matricula').value = v.matricula || f.cadastro || '';
  $('n2Insal').value = v.insalubridade || 'nao';
  $('n2Peric').checked = !!v.periculosidade;
  $('dlgFuncN2').showModal();
}

$('buscaFuncN2').addEventListener('input', desenharFuncN2);

$('formFuncN2').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!editandoN2) return;
  await jd.salvarVinculo(editandoN2.id, {
    jornada_id: $('n2Jornada').value || null,
    matricula: $('n2Matricula').value.trim() || null,
    periculosidade: $('n2Peric').checked,
    insalubridade: $('n2Insal').value,
  });
  $('dlgFuncN2').close();
  desenharFuncN2();
});

$('bNovoFunc').addEventListener('click', () => abrirFuncionario(null));
$('bImprimirFichaCad').addEventListener('click', imprimirFichaCadastral);
$('bFecharFichaCad').addEventListener('click', fecharFichaCadastral);
['buscaFunc', 'fSitFunc'].forEach(id => $(id).addEventListener('input', desenharFuncionarios));

$('formFunc').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = {
    ...editandoFunc,
    nome: $('fuNome').value.trim().replace(/\s+/g, ' '),
    apelido: $('fuApelido').value.trim(),
    cadastro: $('fuCadastro').value.trim(),
    nascimento: $('fuNascimento').value || null,
    sexo: $('fuSexo').value || null,
    telefone: $('fuTelefone').value.trim(),
    admissao: $('fuAdmissao').value || null,
    cpf: $('fuCpf').value.trim(),
    tam_calcado: $('fuCalcado').value.trim(),
    tam_camisa: $('fuCamisa').value.trim(),
    situacao: $('fuSituacao').value,
    ...lerFichaCompleta(),
  };
  if (!f.nome) return;

  /* O que foi escolhido nas listas vira também texto no cadastro, porque a
     ficha de EPI e a lista de presença imprimem esses nomes. Sem escolha,
     o que já estava escrito fica como estava. */
  // Unidade, setor e função são do módulo Cadastros: quem tem Cadastros grava.
  const temDP = pode('jornada') || pode('pessoas');
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

  if (temDP) {
    // Só os campos do Nível 1. Jornada e riscos ficam como estão.
    await jd.salvarVinculo(f.id, {
      unidade_id: $('fuUnidade').value || null,
      setor_id: $('fuSetor').value || null,
      funcao_id: $('fuCargo').value || null,
      admissao: f.admissao,
      ativo: f.situacao === 'ATIVO',
    });
  }

  $('dlgFunc').close();
  preencherControles(); desenharFuncionarios(); desenharSelecao();
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

/* =============== aba ANIVERSARIANTES =============== */
function listaAniversarios() {
  const mes = +$('anMes').value;
  const soAtivos = $('anSit').value === 'ativos';
  // os empregadores entram na mesma folha quando têm data de nascimento
  const patroes = jd.dados.empregadores || [];
  return { mes, ano: +$('anAno').value || new Date().getFullYear(), soAtivos, patroes,
    gente: aniversariantes(estado.funcionarios, mes, soAtivos, patroes) };
}

function atualizarAniversarios() {
  const { mes, ano, soAtivos, gente, patroes } = listaAniversarios();

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

  $('saidaAniversarios').innerHTML = montarAniversarios(gente, mes, ano);
}

['anMes', 'anAno', 'anSit'].forEach(id => $(id).addEventListener('input', atualizarAniversarios));
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
    const png = await imagemAniversarios(gente, mes, ano);
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
    baixar(await imagemAniversarios(gente, mes, ano), nomeImagem(mes, ano));
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
        <span class="sub">${numero}${e.observacao ? ' · ' + esc(e.observacao) : ''}${e.atividade ? ' · ' + esc(e.atividade) : ''}</span>
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
document.querySelectorAll('[data-fechar]').forEach(b =>
  b.addEventListener('click', () => b.closest('dialog').close()));

db.aoMudar(() => {
  const online = estado.online;
  $('estadoTexto').textContent = estado.pendentes
    ? `${estado.pendentes} para enviar`
    : (online ? 'sincronizado' : 'offline');
  $('estadoRede').querySelector('.pt').classList.toggle('off', !online || estado.pendentes > 0);
});

/* instalação do PWA */
let promptInstalar = null;
addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  promptInstalar = ev;
  $('btnInstalar').hidden = false;
});
$('btnInstalar').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  $('btnInstalar').hidden = true;
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
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
    console.error('[Gestão Rápida] falhou ao ligar', nome, e);
  }
}

ligar('DISC', ligarDisc);
ligar('acesso', ligarAcesso);
ligar('DP', () => ligarJornada(abrirAba));
ligar('SST', () => ligarSst(mostrarAviso));
ligar('RH', () => ligarRh(mostrarAviso, desenharFuncionarios));
ligar('exames por função', ligarAso);
ligar('termos', () => ligarTermos(mostrarAviso));
ligar('backup', () => ligarBackup(mostrarAviso));

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
    return;
  }

  if (recuperando) {
    $('nsQuem').textContent = estado.sessao?.user?.email
      ? `Login ${estado.sessao.user.email}. Escolha a senha que você vai usar daqui em diante.`
      : 'Escolha a senha que você vai usar daqui em diante.';
    mostrar('novaSenha');
    return;
  }

  mostrar(r.etapa);

  if (demorou) {
    const erro = $('erroLogin');
    erro.textContent = 'O servidor está demorando para responder. Pode ser o banco pausado — '
      + 'espere um minuto e recarregue.';
    erro.hidden = false;
    arranque.then(x => { if (x?.etapa === 'app') { mostrar('app'); carregarTudo(); } }).catch(() => {});
    return;
  }

  if (r.etapa === 'app') await carregarTudo();

  if (falhasAoLigar.length) {
    const aviso = $('avisoGlobal');
    aviso.innerHTML = 'Uma parte do app não carregou:<br>' + falhasAoLigar.map(esc).join('<br>');
    aviso.hidden = false;
  }
})().catch(e => {
  console.error('[Gestão Rápida] o arranque parou', e);
  telaDeSocorro(e.message || String(e));
});
