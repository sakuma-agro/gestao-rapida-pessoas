/* =====================================================================
   LOP - Gestão Rápida · área Colheita e Produção — o que é só desta área (20/10/2026)
   O que é comum a todas as molduras (IndexedDB, fila de envio, sessão
   emprestada, modal, avisos, tela "aguardando envio") mora em
   ../js/moldura-nucleo.js, carregado antes deste arquivo. As telas desta área
   são módulos (js/app.js, painel.js, cargas.js, conciliacao.js, cadastros.js,
   financeiro.js, parametros.js) e
   conversam com o núcleo pelo que ele publica em window (App, q, gravar,
   aviso…) e pelo evento 'colheita-dados', disparado quando a base local muda.
   ===================================================================== */

const TABELAS_BASE = ['cp_culturas', 'cp_safras', 'cp_plantios', 'cp_cargas', 'cp_balanca', 'cp_cooperativa', 'cp_historico', 'cp_custos', 'cp_veiculos', 'cp_lotes_venda', 'cp_notas_fiscais'];
const GERADAS_NO_BANCO = {};
const CHAVE_PK = {};
/* Todas as tabelas desta área têm id uuid gerado no aparelho: o núcleo confere
   conflito pelo carimbo (a gravação mais recente vence). */
const CHAVE_COMPOSTA = {};
function chaveDrive(caminho) { return 'colheita/' + String(caminho).toLowerCase(); }

/* Avisa as telas (módulos) que a base local mudou. */
function avisarDados() { window.dispatchEvent(new Event('colheita-dados')); }

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'colheita' nos módulos. Sem internet, usa o
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
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para usar o Colheita e Produção.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('colheita')) {
    telaSemAcesso('Seu login não tem a área Colheita e Produção liberada. Peça ao administrador em Usuários - Acessos.');
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
  if (!App.online) aviso('Sem internet: usando a colheita guardada no aparelho. O que for digitado sobe quando o sinal voltar.');
  sincronizar();
}

async function abrirArea() {
  try { await iniciarSessao(); }
  catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir o Colheita e Produção agora (' + (e && e.message || e) + '). Feche e abra a área de novo.');
  }
}

/* O núcleo chama irPara em alguns pontos; aqui a navegação é do app.js. */
function irPara(nome) { if (window.abrirTelaColheita) window.abrirTelaColheita(nome); }

/* Apagar de verdade linhas importadas (balança/cooperativa) — só com internet. */
async function apagarLinhas(tabela, ids) {
  if (!ids.length) return 0;
  if (!App.online || !App.sb) throw new Error('Sem internet: apagar uma importação precisa de sinal.');
  for (let i = 0; i < ids.length; i += 200) {
    const r = await App.sb.from(tabela).delete().in('id', ids.slice(i, i + 200));
    if (r.error) throw r.error;
  }
  const fora = new Set(ids);
  App.dados[tabela] = (App.dados[tabela] || []).filter(x => !fora.has(x.id));
  try { const s = tx('cache', 'readwrite'); ids.forEach(id => s.delete([tabela, id])); } catch (e) { /* segue */ }
  return ids.length;
}

/* Grava muitas linhas de uma vez direto no servidor (importação de relatório
   e carga inicial). Com internet só; sem sinal, a pessoa importa depois. */
async function gravarLote(tabela, linhas, { ignorarRepetidos = false, conflito = 'id', aoAvancar } = {}) {
  if (!App.online || !App.sb) throw new Error('Sem internet: a importação precisa de sinal.');
  let feitas = 0;
  for (let i = 0; i < linhas.length; i += 250) {
    const parte = linhas.slice(i, i + 250).map(l => { const x = Object.assign({}, l); delete x._base; delete x.atualizado_em; return x; });
    const r = await App.sb.from(tabela).upsert(parte, { onConflict: conflito, ignoreDuplicates: ignorarRepetidos, defaultToNull: false }).select();
    if (r.error) throw r.error;
    const salvas = (r.data || []).map(x => Object.assign(x, { _base: x.atualizado_em }));
    if (salvas.length) {
      await gravarLocal(tabela, salvas);
      const lista = App.dados[tabela] || (App.dados[tabela] = []);
      for (const s of salvas) { const k = lista.findIndex(x => x.id === s.id); if (k >= 0) lista[k] = s; else lista.push(s); }
    }
    feitas += parte.length;
    if (aoAvancar) aoAvancar(feitas, linhas.length);
  }
  avisarDados();
  return feitas;
}

window.addEventListener('online', () => setTimeout(avisarDados, 1500));

Object.assign(window, { irPara, avisarDados, apagarLinhas, gravarLote });
