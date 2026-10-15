/* =====================================================================
   LOP - Gestão Rápida · área Máquinas e Patrimônio — o que é só desta área
   O que é comum a todas as molduras (IndexedDB, fila, fotos, sessão
   emprestada, modal, tela "aguardando envio") mora em ../js/moldura-nucleo.js,
   carregado antes deste arquivo (rodada B, 15/10/2026). Aqui fica só o que
   é desta área.
   ===================================================================== */

/* Tabelas que o app baixa inteiras para funcionar sem sinal.
   Sem isto o mecânico abre a OS no pátio e não vê qual óleo e filtro usar. */
const TABELAS_BASE = [
  'locais', 'setores', 'tipos_equipamento', 'tipos_manutencao', 'marcas', 'parametros',
  'equipamentos', 'planos_manutencao',
  // O check list é preenchido no campo, sem sinal.
  'checklist_modelos', 'checklist_versoes', 'checklist_grupos', 'checklist_itens',
  'checklist_equipamento', 'checklists', 'checklist_respostas', 'checklist_fotos',
  'responsaveis_manutencao',
  // O mecânico abre a OS no pátio, sem sinal.
  'ordens_servico', 'os_itens', 'manutencoes',
  // Patrimônio (15/10/2026): bens fora da frota e o histórico de cada um.
  'bens_patrimonio', 'patrimonio_movimentos'
];

/* Colunas que o BANCO gera (identity ALWAYS). Nunca vão no envio: o Postgres
   recusa INSERT/UPSERT com valor nelas. Depois do OK o app lê o número de volta. */
const GERADAS_NO_BANCO = {
  checklists: ['numero'], ordens_servico: ['numero']
};

/* A tabela parametros tem "chave" como identificador, não "id". */
const CHAVE_PK = { parametros: 'chave' };

/* Tabelas de ligação não têm id próprio: a chave é o par de ids. Sem isto o
   IndexedDB recusa a linha inteira ("key path yielded a value that is not a
   valid key") e derruba a carga da base toda. Só leitura — o app não grava
   nessas tabelas. */
const CHAVE_COMPOSTA = { checklist_equipamento: ['equipamento_id', 'modelo_id'] };

/* Caminho gravado nos registros (os/<código>/<id>.jpg, checklists/<código>/<id>.jpg)
   → chave do arquivo no Drive (manutencoes/os/…, manutencoes/checklist/…). */
function chaveDrive(caminho) {
  return 'manutencoes/' + caminho.replace(/^checklists\//, 'checklist/').toLowerCase();
}

/* Nome e e-mail vêm da lista de gente do app inteiro (public.app_usuarios);
   administrador da área é quem o banco diz que é (manutencao.eh_administrador:
   administrador do app inteiro ou só desta área). Sem internet, usa o que
   ficou guardado da última entrada. */
async function quemSou(sessao) {
  const email = (sessao.user.email || '').toLowerCase();
  let u = null;
  if (App.online) {
    try {
      const { data } = await App.sb.schema('public').from('app_usuarios')
        .select('nome, usuario, admin, modulos').eq('email', email).maybeSingle();
      const { data: adm } = await App.sb.rpc('eh_administrador');
      const { data: ul } = await App.sb.from('usuario_fazendas').select('local_id').eq('email', email);
      if (data) u = {
        id: sessao.user.id, email,
        nome: data.nome || data.usuario || email,
        usuario: data.usuario || null,
        admin: !!adm,
        pode: !!(data.admin || (data.modulos || []).includes('manutencoes')),
        locais: (ul || []).map(x => x.local_id),
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
  if (!sessao) {
    telaSemAcesso('Entre pelo LOP - Gestão Rápida para abrir Máquinas e Patrimônio.');
    return;
  }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.pode && !App.usuario.admin) {
    telaSemAcesso('Seu login não tem a área Máquinas e Patrimônio liberada. Peça ao administrador em Configurações.');
    return;
  }
  await meta('usuario', App.usuario);

  /* 15/10/2026: se este aparelho já tem a base guardada, a área abre na hora
     com ela e a atualização desce por trás. Só no primeiro uso a tela espera
     o download — e mesmo assim com prazo, nunca para sempre. */
  const jaTemBase = !!(await meta('baixada_em'));
  if (jaTemBase) {
    baixarBase().catch(e => console.warn('atualização da base', e));
  } else {
    $('#tela').innerHTML = '<section class="carregando"><p>Baixando os cadastros para uso sem internet…</p></section>';
    const prazo = new Promise(ok => setTimeout(() => ok('prazo'), 45000));
    const r = await Promise.race([baixarBase().catch(e => { console.warn(e); return false; }), prazo]);
    if (r === 'prazo') aviso('O download está demorando. Abrindo com o que já chegou.', true);
    await carregarDaBaseLocal();
  }

  // O que essa pessoa enxerga: módulos e o menu montado em cima disso.
  carregarAcesso(App.usuario);
  montarMenu();

  // A pessoa precisa enxergar em qual fazenda está trabalhando.
  $('#lbl-local').textContent = Acesso.admin
    ? 'Todas as fazendas'
    : (App.usuario.locais || []).map(id => q.nome('locais', id)).filter(Boolean).join(' · ');

  // Atalho (?acao=checklist) e link do relatório enviado por WhatsApp (?checklist=…)
  const params = new URLSearchParams(location.search);
  const acao = params.get('acao'), ck = params.get('checklist');
  if (ck && window.abrirRelatorioChecklist) { irPara('checklist'); abrirRelatorioChecklist(ck); }
  else if (acao && TELAS[acao] && podeTela(acao)) irPara(acao);
  if (acao || ck) history.replaceState(null, '', location.pathname);
  window.areaPronta = true;
  sincronizar();
  enviarFotos();   // rodada A: foto pendente de outra sessão também sobe ao abrir
}

/* Qualquer erro na abertura vira um aviso com "Tentar de novo", em vez de a
   tela ficar parada em "Baixando os cadastros…". */
async function abrirArea() {
  try {
    await iniciarSessao();
  } catch (e) {
    console.error('abertura da área', e);
    telaSemAcesso('Não consegui abrir Máquinas e Patrimônio agora (' + (e && e.message || e) + ').');
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
  if (window.marcarMenu) marcarMenu(nome);
  const fn = TELAS[nome];
  if (fn) fn($('#tela'));
}



Object.assign(window, { irPara });
