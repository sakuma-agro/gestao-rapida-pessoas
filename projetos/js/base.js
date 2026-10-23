/* =====================================================================
   LOP - Gestão Rápida · área Projetos (PMBOK) — o que é só desta área (23/10/2026)
   O que é comum a todas as molduras (IndexedDB, fila de envio, sessão
   emprestada, modal, avisos, tela "aguardando envio") mora em
   ../js/moldura-nucleo.js, carregado antes deste arquivo. As telas desta área
   são módulos (js/app.js e os outros) e conversam com o núcleo pelo que ele
   publica em window (App, gravar, inativar, aviso…) e pelo evento
   'projetos-dados', disparado quando a base local muda.
   ===================================================================== */

const TABELAS_BASE = ['pj_projetos', 'pj_partes', 'pj_eap', 'pj_raci', 'pj_riscos', 'pj_comunicacao',
  'pj_reunioes', 'pj_custos', 'pj_mudancas', 'pj_ocorrencias', 'pj_licoes', 'pj_status', 'pj_premissas', 'pj_requisitos'];
const GERADAS_NO_BANCO = {};
const CHAVE_PK = {};
/* A RACI tem chave de texto montada no aparelho ('<eap>:<parte>'): grava por
   upsert direto. As outras conferem conflito pelo carimbo. */
const CHAVE_COMPOSTA = { pj_raci: ['id'] };
function chaveDrive(caminho) { return 'projetos/' + String(caminho).toLowerCase(); }

/* Avisa as telas (módulos) que a base local mudou. */
function avisarDados() { window.dispatchEvent(new Event('projetos-dados')); }

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'projetos' nos módulos. Sem internet, usa o
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

/* Nomes dos funcionários ativos, para escolher gerente, patrocinador e
   responsáveis (a pessoa pode digitar outro nome). Só lê se a RLS deixar
   (quem tem o Pessoas); sem isso, a lista vem das partes interessadas. */
async function lerNomesPessoas() {
  if (App.online) {
    try {
      const r = await App.sb.from('funcionarios').select('nome, cargo, situacao').eq('situacao', 'ATIVO').order('nome').limit(2000);
      if (!r.error && r.data) {
        App.pessoas = r.data.map(x => ({ nome: x.nome, cargo: x.cargo || '' }));
        await meta('pessoas', App.pessoas);
        return;
      }
    } catch (e) { /* segue com o guardado */ }
  }
  App.pessoas = (await meta('pessoas')) || [];
}

/* O layout desta área não tem #menu/#tela: o recado vai numa faixa própria. */
function telaSemAcesso(texto) {
  const el = document.getElementById('pjSemAcesso');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

async function iniciarSessao() {
  const sessao = await sessaoDoPrincipal();
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para usar a área Projetos.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('projetos')) {
    telaSemAcesso('Seu login não tem a área Projetos liberada. Peça ao administrador em Usuários - Acessos.');
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
    await lerNomesPessoas();
  } finally {
    App.carregando = false;
    avisarDados();
  }
  if (!App.online) aviso('Sem internet: usando os projetos guardados no aparelho. O que for digitado sobe quando o sinal voltar.');
  sincronizar();
}

async function abrirArea() {
  try { await iniciarSessao(); }
  catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir a área Projetos agora (' + (e && e.message || e) + '). Feche e abra a área de novo.');
  }
}

/* O núcleo chama irPara em alguns pontos; aqui a navegação é do app.js. */
function irPara(nome) { if (window.abrirTelaProjetos) window.abrirTelaProjetos(nome); }
/* Depois de "Usar o do servidor" na fila, a tela se redesenha. */
function repintarTela() { avisarDados(); }

window.addEventListener('online', () => setTimeout(avisarDados, 1500));

Object.assign(window, { irPara, avisarDados, repintarTela });
