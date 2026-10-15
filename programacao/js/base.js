/* =====================================================================
   LOP - Gestão Rápida · área Programação Campo — o que é só desta área
   O que é comum a todas as molduras (IndexedDB, fila, fotos, sessão
   emprestada, modal, tela "aguardando envio") mora em ../js/moldura-nucleo.js,
   carregado antes deste arquivo (rodada B, 15/10/2026). Aqui fica só o que
   é desta área.
   ===================================================================== */

/* Tabelas que o app baixa inteiras para funcionar sem sinal.
   Sem isto o mecânico abre a OS no pátio e não vê o código da peça. */
const TABELAS_BASE = [
  // Cadastros do LOP (só leitura aqui): fazendas = Máquinas e Patrimônio,
  // operadores = funcionários do Pessoas, máquinas/implementos = frota + genéricos.
  'fazendas', 'operadores', 'maquinas', 'implementos', 'usuarios',
  // Cadastros da própria Programação
  'culturas', 'locais', 'tipos_atividade', 'maquinas_genericas', 'implementos_genericos',
  'usuario_fazendas',
  // o que muda toda semana: vem sempre de novo quando há internet
  'atividades', 'reunioes', 'diarios', 'parametros'
];

/* Colunas que o BANCO gera (identity ALWAYS). Nunca vão no envio: o Postgres
   recusa INSERT/UPSERT com valor nelas. Depois do OK o app lê o número de volta. */
const GERADAS_NO_BANCO = {
  atividades: ['ano', 'mes', 'semana'],
  diarios: ['codigo']      // RD-AAAA-0001, dado pelo banco
};

/* A tabela parametros tem "chave" como identificador, não "id". */
const CHAVE_PK = { parametros: 'chave' };

/* Tabelas de ligação não têm id próprio: a chave é o par de ids. Sem isto o
   IndexedDB recusa a linha inteira ("key path yielded a value that is not a
   valid key") e derruba a carga da base toda. Só leitura — o app não grava
   nessas tabelas. */
const CHAVE_COMPOSTA = { usuario_fazendas: ['email', 'fazenda_id'] };

/* Toda foto ou anexo da Programação vai para o Google Drive (decisão do
   Guilherme, 15/10/2026), pela função "arquivos" do Supabase. O caminho gravado
   no registro (<id do diário>/<uuid>.jpg) vira programacao/diario/<id>/<uuid>.jpg. */
function chaveDrive(caminho) {
  return 'programacao/diario/' + String(caminho).toLowerCase();
}

/* Nome e acesso vêm da lista de gente do LOP (public.app_usuarios): entra
   quem é administrador ou tem 'programacao' nos módulos. Sem internet, usa o
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

async function iniciarSessao() {
  const sessao = await sessaoDoPrincipal();
  if (!sessao) { telaSemAcesso('Entre pelo LOP - Gestão Rápida para abrir a Programação Campo.'); return; }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.admin && !(App.usuario.modulos || []).includes('programacao')) {
    telaSemAcesso('Seu login não tem a área Programação Campo liberada. Peça ao administrador em Usuários - Acessos.');
    return;
  }
  await meta('usuario', App.usuario);

  /* Com a base já guardada neste aparelho, a área abre na hora e a
     atualização desce por trás. Só no primeiro uso a tela espera. */
  const jaTemBase = !!(await meta('baixada_em'));
  if (jaTemBase) {
    (async () => {
      try { await sincronizar(); enviarFotos(); await baixarBase(true); if (window.repintarTela) repintarTela(); }
      catch (e) { console.warn('atualização da base', e); }
    })();
  } else {
    $('#tela').innerHTML = '<section class="carregando"><p>Baixando a programação para uso sem internet…</p></section>';
    const prazo = new Promise(ok => setTimeout(() => ok('prazo'), 45000));
    const r = await Promise.race([baixarBase(true).catch(e => { console.warn(e); return false; }), prazo]);
    if (r === 'prazo') aviso('O download está demorando. Abrindo com o que já chegou.', true);
    await carregarDaBaseLocal();
  }
  if (!App.online) aviso('Sem internet: usando a programação guardada no aparelho. O que for lançado sobe quando o sinal voltar.');

  carregarAcesso(App.usuario);
  montarMenu();

  const minhas = q.todos('usuario_fazendas').filter(x => (x.email || '').toLowerCase() === App.usuario.email);
  $('#lbl-local').textContent = (Acesso.admin || !minhas.length)
    ? 'Todas as fazendas'
    : minhas.map(x => q.nome('fazendas', x.fazenda_id)).join(' · ');

  const params = new URLSearchParams(location.search);
  const acao = params.get('acao');
  if (acao && TELAS[acao] && podeTela(acao)) irPara(acao);
  if (acao) history.replaceState(null, '', location.pathname);
  window.areaPronta = true;
  sincronizar();
}

/* Qualquer erro na abertura vira um aviso com "Tentar de novo". */
async function abrirArea() {
  try {
    await iniciarSessao();
  } catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir a Programação Campo agora (' + (e && e.message || e) + ').');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = 'Tentar de novo';
    b.onclick = () => location.reload();
    $('#tela .carregando').appendChild(b);
  }
}

/* ---------------------------------------------------------------- navegação */

function irPara(nome) {
  // Quem não tem a tela liberada não chega nela nem por link nem por botão.
  if (window.podeTela && nome !== 'marca' && nome !== 'config' && !podeTela(nome)) {
    aviso('Você não tem acesso a essa tela.', true);
    return mostrarInicio();
  }
  if (nome !== 'marca') document.body.classList.remove('sem-rodape');
  // o modo compacto pertence ao painel consolidado; sair dele desfaz
  if (nome !== 'painel') document.body.classList.remove('modo-quadro');
  if (window.marcarMenu) marcarMenu(nome);
  App.telaAtual = nome;
  const fn = TELAS[nome];
  if (fn) { window.scrollTo(0, 0); fn($('#tela')); }
}

/* Depois que a atualização desce por trás: redesenha só telas de consulta,
   nunca um formulário sendo preenchido nem com janela aberta. */
window.repintarTela = () => {
  if (!$('#modal').classList.contains('oculto')) return;
  const t = App.telaAtual;
  if (!t || t === 'marca') { if (window.mostrarInicio) mostrarInicio(); return; }
  if (['painel', 'atividades', 'reuniao', 'diarios'].includes(t)) irPara(t);
};

Object.assign(window, { irPara });
