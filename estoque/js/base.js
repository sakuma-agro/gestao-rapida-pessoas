/* =====================================================================
   LOP - Gestão Rápida · área Estoque — o que é só desta área (15/10/2026)
   O que é comum a todas as molduras (IndexedDB, fila de envio, sessão
   emprestada, modal, avisos, tela "aguardando envio") mora em
   ../js/moldura-nucleo.js, carregado antes deste arquivo. As telas desta área
   são módulos (js/app.js, contagem.js, cadastros.js, acerto.js) e conversam
   com o núcleo pelo que ele publica em window (App, q, gravar, aviso…) e pelo
   evento 'estoque-dados', disparado sempre que a base local muda.
   ===================================================================== */

/* Tudo o que a contagem precisa para funcionar sem sinal no almoxarifado. */
const TABELAS_BASE = ['est_locais', 'est_itens', 'est_contagens', 'est_contagem_itens', 'est_contagem_lotes',
  'est_compras', 'est_compra_itens', 'est_compra_estoques'];
const GERADAS_NO_BANCO = {};
const CHAVE_PK = {};
/* Na contagem vale a última gravação (15/10/2026). Com a conferência de
   conflito ligada, digitar lote, validade e quantidade em sequência fazia o
   segundo envio sair com o carimbo velho e parar como "conflito". Marcar a
   chave como "composta" (de uma parte só, o próprio id) faz o núcleo gravar por
   upsert direto, sem o carimbo. Itens e almoxarifados continuam conferindo. */
const CHAVE_COMPOSTA = { est_contagens: ['id'], est_contagem_itens: ['id'], est_contagem_lotes: ['id'],
  est_compras: ['id'], est_compra_itens: ['id'], est_compra_estoques: ['id'] };
function chaveDrive(caminho) { return 'estoque/' + String(caminho).toLowerCase(); }

/* Avisa as telas (módulos) que a base local mudou. */
function avisarDados() { window.dispatchEvent(new Event('estoque-dados')); }

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'estoque' nos módulos. Sem internet, usa o que
   ficou guardado da última entrada. */
async function quemSou(sessao) {
  const email = (sessao.user.email || '').toLowerCase();
  let u = null;
  if (App.online) {
    try {
      const { data } = await App.sb.schema('public').from('app_usuarios')
        .select('nome, usuario, admin, modulos').eq('email', email).maybeSingle();
      if (data) u = {
        id: sessao.user.id, email,
        nome: data.nome || data.usuario || email,
        usuario: data.usuario || null,
        admin: !!data.admin,
        modulos: data.modulos || [],
        ativo: true,
      };
    } catch (e) { console.warn('não li o usuário', e); }
  }
  if (!u) {
    const guardado = await meta('usuario');
    if (guardado && guardado.email === email) u = guardado;
  }
  return u;
}

/* O layout desta área não tem #menu/#tela: o recado vai numa faixa própria.
   (Substitui a versão do núcleo; o Acerto pela planilha continua usável.) */
function telaSemAcesso(texto) {
  const el = document.getElementById('estSemAcesso');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

async function iniciarSessao() {
  const sessao = await sessaoDoPrincipal();
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para usar a contagem.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('estoque')) {
    telaSemAcesso('Seu login não tem a área Estoque liberada. Peça ao administrador em Usuários - Acessos.');
    return;
  }
  await meta('usuario', App.usuario);
  avisarDados();

  /* Com a base guardada neste aparelho, a tela abre na hora e a atualização
     desce por trás. Só no primeiro uso a tela espera. */
  const jaTemBase = !!(await meta('baixada_em'));
  if (!jaTemBase) { App.carregando = true; avisarDados(); }
  try {
    await sincronizar();
    const prazo = new Promise(ok => setTimeout(() => ok('prazo'), 45000));
    const r = await Promise.race([baixarBase(true).catch(e => { console.warn(e); return false; }), prazo]);
    if (r === 'prazo') aviso('O download está demorando. Abrindo com o que já chegou.', true);
  } finally {
    App.carregando = false;
    avisarDados();
  }
  if (!App.online) aviso('Sem internet: usando a contagem guardada no aparelho. O que for digitado sobe quando o sinal voltar.');
  sincronizar();
}

async function abrirArea() {
  try { await iniciarSessao(); }
  catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir a contagem agora (' + (e && e.message || e) + '). Feche e abra a área de novo.');
  }
}

/* O núcleo chama irPara em alguns pontos; aqui a navegação é do app.js. */
function irPara(nome) { if (window.abrirTelaEstoque) window.abrirTelaEstoque(nome); }

/* Depois de gravar ou sincronizar, as telas se redesenham. */
window.addEventListener('online', () => setTimeout(avisarDados, 1500));

Object.assign(window, { irPara, avisarDados });
