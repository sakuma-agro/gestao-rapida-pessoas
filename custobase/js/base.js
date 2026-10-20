/* =====================================================================
   LOP - Gestão Rápida · área Custo Base — o que é só desta área (20/10/2026)
   O que é comum a todas as molduras (IndexedDB, fila de envio, sessão
   emprestada, modal, avisos, tela "aguardando envio") mora em
   ../js/moldura-nucleo.js, carregado antes deste arquivo. As telas desta área
   são módulos (js/app.js, rateio.js, talhoes.js, culturas.js, historico.js) e
   conversam com o núcleo pelo que ele publica em window (App, q, gravar,
   aviso…) e pelo evento 'custobase-dados', disparado quando a base local muda.
   ===================================================================== */

const TABELAS_BASE = ['cb_culturas', 'cb_talhoes', 'cb_meses', 'cb_itens'];
const GERADAS_NO_BANCO = {};
const CHAVE_PK = {};
/* Mês e itens do mês têm chave de texto montada no aparelho ('2026-10',
   '2026-10:<talhao>'): o núcleo grava por upsert direto, sem conferir carimbo.
   Culturas e talhões continuam conferindo conflito. */
const CHAVE_COMPOSTA = { cb_meses: ['id'], cb_itens: ['id'] };
function chaveDrive(caminho) { return 'custobase/' + String(caminho).toLowerCase(); }

/* Avisa as telas (módulos) que a base local mudou. */
function avisarDados() { window.dispatchEvent(new Event('custobase-dados')); }

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'custobase' nos módulos. Sem internet, usa o
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
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para usar o Custo Base.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('custobase')) {
    telaSemAcesso('Seu login não tem a área Custo Base liberada. Peça ao administrador em Usuários - Acessos.');
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
  if (!App.online) aviso('Sem internet: usando o rateio guardado no aparelho. O que for digitado sobe quando o sinal voltar.');
  sincronizar();
}

async function abrirArea() {
  try { await iniciarSessao(); }
  catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir o Custo Base agora (' + (e && e.message || e) + '). Feche e abra a área de novo.');
  }
}

/* O núcleo chama irPara em alguns pontos; aqui a navegação é do app.js. */
function irPara(nome) { if (window.abrirTelaCustoBase) window.abrirTelaCustoBase(nome); }

/* Apagar de verdade uma linha do mês (tirar um plantio de um mês aberto).
   Só com internet; sem sinal a linha fica fora do rateio (incluido=false). */
async function apagarItemMes(id) {
  const lista = App.dados.cb_itens || [];
  const i = lista.findIndex(x => x.id === id);
  if (i >= 0) lista.splice(i, 1);
  // tx() é do núcleo (script clássico: função global). A chave do cache é [tabela, id].
  try { tx('cache', 'readwrite').delete(['cb_itens', id]); } catch (e) { /* segue */ }
  if (App.online && App.sb) {
    const r = await App.sb.from('cb_itens').delete().eq('id', id);
    if (r.error) throw r.error;
  }
}

window.addEventListener('online', () => setTimeout(avisarDados, 1500));

Object.assign(window, { irPara, avisarDados, apagarItemMes });
