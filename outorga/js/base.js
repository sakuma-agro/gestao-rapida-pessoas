/* =====================================================================
   LOP - Gestão Rápida · área Outorga e Irrigação — o que é só desta área (12/11/2026)
   O que é comum a todas as molduras (IndexedDB, fila de envio, sessão
   emprestada, modal, avisos, tela "aguardando envio") mora em
   ../js/moldura-nucleo.js, carregado antes deste arquivo. As telas desta área
   são módulos (js/app.js, recebimento.js, fichas.js, cadastros.js) e
   conversam com o núcleo pelo que ele publica em window (App, q, gravar,
   aviso…) e pelo evento 'outorga-dados', disparado quando a base local muda.
   ===================================================================== */

const TABELAS_BASE = ['out_locais', 'out_controles', 'out_produtores', 'out_itens', 'out_recebidos'];
const GERADAS_NO_BANCO = {};
const CHAVE_PK = {};
/* Recebido do mês tem chave de texto montada no aparelho ('2026-10:<item>'):
   o núcleo grava por upsert direto, sem conferir carimbo. */
const CHAVE_COMPOSTA = { out_recebidos: ['id'] };
function chaveDrive(caminho) { return 'outorga/' + String(caminho).toLowerCase(); }

/* Avisa as telas (módulos) que a base local mudou. */
function avisarDados() { window.dispatchEvent(new Event('outorga-dados')); }

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'outorga' nos módulos. Sem internet, usa o
   que ficou guardado da última entrada. */
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

/* O layout desta área não tem #menu/#tela: o recado vai numa faixa própria. */
function telaSemAcesso(texto) {
  const el = document.getElementById('cbSemAcesso');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

async function iniciarSessao() {
  const sessao = await sessaoDoPrincipal();
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para usar a Outorga e Irrigação.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('outorga')) {
    telaSemAcesso('Seu login não tem a área Outorga e Irrigação liberada. Peça ao administrador em Usuários - Acessos.');
    return;
  }
  await meta('usuario', App.usuario);
  avisarDados();

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
  if (!App.online) aviso('Sem internet: usando o que ficou guardado no aparelho. O que for digitado sobe quando o sinal voltar.');
  sincronizar();
}

async function abrirArea() {
  try { await iniciarSessao(); }
  catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir a Outorga e Irrigação agora (' + (e && e.message || e) + '). Feche e abra a área de novo.');
  }
}

/* O núcleo chama irPara em alguns pontos; aqui a navegação é do app.js. */
function irPara(nome) { if (window.abrirTelaOutorga) window.abrirTelaOutorga(nome); }

window.addEventListener('online', () => setTimeout(avisarDados, 1500));

Object.assign(window, { irPara, avisarDados });
