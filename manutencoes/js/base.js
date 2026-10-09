/* =====================================================================
   Gestão Rápida · Manutenções — núcleo do aplicativo
   Base local completa em IndexedDB + fila de saída (outbox) + sincronização.
   Regra: nada é considerado salvo até o servidor confirmar.
   ===================================================================== */

const App = {
  sb: null,            // cliente Supabase
  usuario: null,       // registro da tabela usuarios
  locais: [],          // locais que o usuário enxerga
  dados: {},           // cópia em memória da base local, para a tela renderizar rápido
  online: navigator.onLine,
  pendentes: 0
};

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
  'ordens_servico', 'os_itens', 'manutencoes'
];

/* Colunas que o BANCO gera (identity ALWAYS). Nunca vão no envio: o Postgres
   recusa INSERT/UPSERT com valor nelas. Depois do OK o app lê o número de volta. */
const GERADAS_NO_BANCO = {
  checklists: ['numero'], ordens_servico: ['numero']
};

/* ---------------------------------------------------------------- IndexedDB */
let idb = null;

function abrirBase() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(CONFIG.BASE_LOCAL || 'lop-gr-manutencoes', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) {
        const s = db.createObjectStore('cache', { keyPath: ['tabela', 'id'] });
        s.createIndex('por_tabela', 'tabela');
      }
      if (!db.objectStoreNames.contains('fila')) {
        db.createObjectStore('fila', { keyPath: 'uuid' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }
      // Fotos ficam guardadas como Blob até o servidor confirmar o envio.
      if (!db.objectStoreNames.contains('fotos')) {
        db.createObjectStore('fotos', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { idb = req.result; ok(idb); };
    req.onerror = () => erro(req.error);
  });
}

function tx(store, modo = 'readonly') {
  return idb.transaction(store, modo).objectStore(store);
}

function promessa(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

/* A tabela parametros tem "chave" como identificador, não "id". */
const CHAVE_PK = { parametros: 'chave' };

/* Tabelas de ligação não têm id próprio: a chave é o par de ids. Sem isto o
   IndexedDB recusa a linha inteira ("key path yielded a value that is not a
   valid key") e derruba a carga da base toda. Só leitura — o app não grava
   nessas tabelas. */
const CHAVE_COMPOSTA = { checklist_equipamento: ['equipamento_id', 'modelo_id'] };

function pk(tabela) { return CHAVE_PK[tabela] || 'id'; }
function idDe(tabela, registro) {
  const partes = CHAVE_COMPOSTA[tabela];
  if (partes) return partes.map(c => registro[c]).join('|');
  return registro[pk(tabela)];
}

async function gravarLocal(tabela, linhas) {
  const s = tx('cache', 'readwrite');
  for (const l of linhas) {
    const id = idDe(tabela, l);
    // uma linha sem chave não pode derrubar a gravação das outras
    if (id === undefined || id === null || id === '') {
      console.warn('linha sem chave, não gravada localmente:', tabela, l);
      continue;
    }
    s.put({ tabela, id, dado: l });
  }
  return new Promise(ok => { s.transaction.oncomplete = () => ok(true); });
}

async function lerLocal(tabela) {
  const s = tx('cache').index('por_tabela');
  const res = await promessa(s.getAll(tabela));
  return res.map(r => r.dado);
}

async function meta(chave, valor) {
  if (valor === undefined) {
    const r = await promessa(tx('meta').get(chave));
    return r ? r.valor : null;
  }
  return promessa(tx('meta', 'readwrite').put({ chave, valor }));
}

/* ---------------------------------------------------------------- fila de saída */

/* Todo registro feito offline entra aqui com identificador próprio gerado no
   aparelho e carimbo do PREENCHIMENTO — não do envio. */
async function enfileirar(tabela, registro, operacao = 'upsert') {
  const item = {
    uuid: tabela + ':' + (idDe(tabela, registro) || crypto.randomUUID()),
    tabela, operacao, registro,
    preenchido_em: new Date().toISOString(),
    status: 'pendente',
    tentativas: 0,
    erro: null
  };
  await promessa(tx('fila', 'readwrite').put(item));
  await contarFila();
  sincronizar();          // tenta na hora; se não der, fica na fila
  return item;
}

async function itensDaFila() {
  return promessa(tx('fila').getAll());
}

async function contarFila() {
  const itens = await itensDaFila();
  let fotos = 0;
  try { fotos = (await promessa(tx('fotos').getAll())).filter(f => f.status !== 'enviada').length; }
  catch (e) { /* base antiga, sem a store de fotos */ }
  App.pendentes = itens.filter(i => i.status !== 'enviado').length + fotos;
  pintarEstado();
  return App.pendentes;
}

let sincronizando = false;

/* Envia a fila. Idempotente: o mesmo item reenviado usa o mesmo id,
   então o upsert no servidor não duplica. */
async function sincronizar() {
  if (sincronizando || !App.online || !App.sb || !App.usuario) return;
  sincronizando = true;
  try {
    const itens = (await itensDaFila()).filter(i => i.status !== 'enviado');
    for (const item of itens) {
      try {
        let r;
        if (item.operacao === 'upsert') {
          const envio = Object.assign({}, item.registro);
          (GERADAS_NO_BANCO[item.tabela] || []).forEach(c => delete envio[c]);
          r = await App.sb.from(item.tabela)
                .upsert(envio, { onConflict: pk(item.tabela) }).select();
          // O servidor devolve o registro completo (com o número que ele gerou):
          // guardo na base local para a tela mostrar o nº da anomalia / OS.
          if (!r.error && r.data && r.data[0]) {
            const salvo = r.data[0];
            await gravarLocal(item.tabela, [salvo]);
            const lista = App.dados[item.tabela] || [];
            const i = lista.findIndex(x => x[pk(item.tabela)] === salvo[pk(item.tabela)]);
            if (i >= 0) Object.assign(lista[i], salvo); else lista.push(salvo);
          }
        } else if (item.operacao === 'excluir') {
          // Cadastro em uso nunca é apagado: "excluir" aqui é inativar.
          r = await App.sb.from(item.tabela).update({ ativo: false })
                .eq(pk(item.tabela), idDe(item.tabela, item.registro));
        }
        if (r.error) throw r.error;
        // Só sai da fila depois do OK do servidor.
        await promessa(tx('fila', 'readwrite').delete(item.uuid));
      } catch (e) {
        item.status = 'erro';
        item.tentativas += 1;
        item.erro = e.message || String(e);
        await promessa(tx('fila', 'readwrite').put(item));
      }
    }
  } finally {
    sincronizando = false;
    await contarFila();
  }
}

/* ---------------------------------------------------------------- fotos

   A foto do adesivo é obrigatória para concluir a OS. Ela é comprimida no
   aparelho, guardada como Blob e só sobe depois — uma por vez, para não
   travar em conexão fraca de fazenda. */

async function comprimirFoto(arquivo, larguraMax = 1600) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, larguraMax / bitmap.width);
  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * escala);
  cv.height = Math.round(bitmap.height * escala);
  cv.getContext('2d').drawImage(bitmap, 0, 0, cv.width, cv.height);
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
}

/* Guarda a foto no aparelho e devolve o caminho que ela terá no Storage. */
async function guardarFoto(arquivo, bucket, prefixo) {
  const blob = await comprimirFoto(arquivo);
  const id = crypto.randomUUID();
  const caminho = prefixo + '/' + id + '.jpg';
  await promessa(tx('fotos', 'readwrite').put({
    id, bucket, caminho, blob, status: 'pendente',
    registrado_em: new Date().toISOString()
  }));
  await contarFila();
  enviarFotos();
  return caminho;
}

/* Devolve o Blob de uma foto guardada no aparelho, ou null se já não estiver aqui. */
async function blobDaFoto(caminho) {
  try {
    const todas = await promessa(tx('fotos').getAll());
    const f = todas.find(x => x.caminho === caminho);
    return f ? f.blob : null;
  } catch (e) { return null; }
}

async function fotosPendentes() {
  const todas = await promessa(tx('fotos').getAll());
  return todas.filter(f => f.status !== 'enviada');
}

let enviandoFotos = false;
async function enviarFotos() {
  if (enviandoFotos || !App.online || !App.sb) return;
  enviandoFotos = true;
  try {
    for (const f of await fotosPendentes()) {
      const { error } = await App.sb.storage.from(f.bucket)
        .upload(f.caminho, f.blob, { contentType: 'image/jpeg', upsert: true });
      if (!error || (error.message || '').includes('already exists')) {
        f.status = 'enviada';
        await promessa(tx('fotos', 'readwrite').put(f));
      }
    }
  } finally {
    enviandoFotos = false;
    await contarFila();
  }
}

/* ---------------------------------------------------------------- gravação */

/* Grava um registro: aplica na base local na hora (o usuário vê o resultado
   mesmo sem sinal) e põe na fila para subir. */
async function gravar(tabela, registro) {
  const chave = pk(tabela);
  if (!registro[chave]) registro[chave] = crypto.randomUUID();
  await gravarLocal(tabela, [registro]);
  const lista = App.dados[tabela] || [];
  const i = lista.findIndex(x => x[chave] === registro[chave]);
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  App.dados[tabela] = lista;
  await enfileirar(tabela, registro);
  return registro;
}

async function inativar(tabela, id) {
  const reg = (App.dados[tabela] || []).find(x => x[pk(tabela)] === id);
  if (reg) { reg.ativo = false; await gravar(tabela, reg); }
}

/* ---------------------------------------------------------------- carga da base */

/* Com internet, a base é baixada inteira a cada abertura: o que o mecânico
   fechou no celular aparece no escritório na próxima vez que o app abre.
   Só fica marcada como "baixada" se TODAS as tabelas vieram — uma carga que
   falhou (banco fora do ar, permissão faltando) tenta de novo na próxima vez,
   em vez de deixar a tela vazia por horas. */
async function baixarBase() {
  if (!App.online) return false;
  const falhas = [];
  for (const t of TABELAS_BASE) {
    const { data, error } = await App.sb.from(t).select('*');
    if (error) { console.warn('não baixou', t, error.message); falhas.push(t); continue; }
    await limparLocal(t);
    await gravarLocal(t, data);
    App.dados[t] = data;
  }
  // O que foi feito neste aparelho e ainda não subiu continua aparecendo.
  for (const item of await itensDaFila()) {
    if (item.operacao !== 'upsert' || item.status === 'enviado') continue;
    await gravarLocal(item.tabela, [item.registro]);
    const lista = App.dados[item.tabela] || (App.dados[item.tabela] = []);
    const chave = pk(item.tabela), id = idDe(item.tabela, item.registro);
    const i = lista.findIndex(x => idDe(item.tabela, x) === id);
    if (i >= 0) lista[i] = item.registro; else lista.push(item.registro);
  }
  if (falhas.length) {
    aviso('Não consegui baixar ' + falhas.length + ' cadastro(s) do servidor. Usando o que está guardado neste aparelho.', true);
    return false;
  }
  await meta('versao_base', CONFIG.VERSAO_BASE);
  await meta('baixada_em', new Date().toISOString());
  return true;
}

/* Apaga a cópia local de uma tabela antes de gravar a nova: assim o que foi
   inativado ou apagado no servidor some daqui também. */
async function limparLocal(tabela) {
  const s = tx('cache', 'readwrite');
  const chaves = await promessa(s.index('por_tabela').getAllKeys(tabela));
  for (const k of chaves) s.delete(k);
  return new Promise(ok => { s.transaction.oncomplete = () => ok(true); });
}

async function carregarDaBaseLocal() {
  for (const t of TABELAS_BASE) App.dados[t] = await lerLocal(t);
}

/* ---------------------------------------------------------------- consultas */

const q = {
  ativos: t => (App.dados[t] || []).filter(x => x.ativo !== false),
  todos:  t => (App.dados[t] || []),
  por_id: (t, id) => (App.dados[t] || []).find(x => x.id === id),
  nome:   (t, id) => { const r = q.por_id(t, id); return r ? (r.nome || r.descricao) : ''; },
  ordenado: (t, campo = 'nome') =>
    q.ativos(t).slice().sort((a, b) => String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR'))
};

/* ---------------------------------------------------------------- interface */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let avisoTimer;
function aviso(texto, erro = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = 'aviso' + (erro ? ' erro' : '');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add('oculto'), 3600);
}

function abrirModal(titulo, html, aoAbrir) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = html;
  $('#modal').classList.remove('oculto');
  if (aoAbrir) aoAbrir($('#modal-corpo'));
}
function fecharModal() {
  $('#modal').classList.add('oculto');
  $('#modal-corpo').innerHTML = '';
}

function pintarEstado() {
  const ponto = $('#ponto-conexao'), txt = $('#txt-conexao'), fila = $('#btn-fila');
  ponto.className = 'ponto ' + (App.online ? 'online' : 'offline');
  txt.textContent = App.online ? 'conectado' : 'sem internet';
  if (App.pendentes > 0) {
    fila.textContent = App.pendentes + (App.pendentes === 1
      ? ' registro aguardando envio' : ' registros aguardando envio');
    fila.classList.remove('oculto');
  } else {
    fila.classList.add('oculto');
  }
}

/* ---------------------------------------------------------------- fila: tela */
async function telaFila() {
  const itens = await itensDaFila();
  const html = itens.length === 0
    ? '<div class="vazio"><p>Nada esperando. Tudo que você registrou já está no servidor.</p></div>'
    : '<ul class="lista">' + itens.map(i => `
        <li>
          <div class="info">
            <strong>${esc(i.tabela)}</strong>
            <small>preenchido em ${new Date(i.preenchido_em).toLocaleString('pt-BR')}</small>
            ${i.erro ? `<small style="color:var(--urgente)">${esc(i.erro)}</small>` : ''}
          </div>
          <span class="etq ${i.status === 'erro' ? 'urgente' : 'atencao'}">${esc(i.status)}</span>
        </li>`).join('') + '</ul>'
      + '<div class="acoes"><button type="button" class="btn" id="btn-sinc">Sincronizar agora</button></div>';
  abrirModal('Registros aguardando envio', html, corpo => {
    const b = corpo.querySelector('#btn-sinc');
    if (b) b.onclick = async () => {
      if (!App.online) return aviso('Sem internet. A fila sobe sozinha quando o sinal voltar.', true);
      await sincronizar();
      aviso(App.pendentes === 0 ? 'Tudo enviado.' : 'Ainda restam ' + App.pendentes + '.');
      telaFila();
    };
  });
}

/* ---------------------------------------------------------------- sessão emprestada

   Esta área mora dentro do LOP - Gestão Rápida, numa moldura. Quem entra, sai,
   troca e recupera senha é o app principal: aqui não há tela de login. O
   cliente do Supabase desta página pede o token ao cliente do app principal a
   cada chamada — assim só UM lugar renova a sessão (dois renovando a mesma
   sessão ao mesmo tempo derrubam o login). */
function clientePrincipal() {
  try { return window.parent && window.parent !== window ? window.parent.grCliente : null; }
  catch (e) { return null; }
}

async function tokenDoPrincipal() {
  const c = clientePrincipal();
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  } catch (e) { return null; }
}

async function sessaoDoPrincipal() {
  const c = clientePrincipal();
  if (!c) return null;
  try { const { data } = await c.auth.getSession(); return data ? data.session : null; }
  catch (e) { return null; }
}

function telaSemAcesso(texto) {
  $('#menu').hidden = true;
  $('#menu2').hidden = true;
  $('#tela').innerHTML = `<section class="carregando"><p>${esc(texto)}</p></section>`;
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
    telaSemAcesso('Entre pelo LOP - Gestão Rápida para abrir as Manutenções.');
    return;
  }
  App.usuario = await quemSou(sessao);
  if (!App.usuario) {
    telaSemAcesso('Não consegui confirmar o seu acesso. Abra com internet uma vez para liberar o uso sem sinal.');
    return;
  }
  if (!App.usuario.pode && !App.usuario.admin) {
    telaSemAcesso('Seu login não tem a área Manutenções liberada. Peça ao administrador em Configurações.');
    return;
  }
  await meta('usuario', App.usuario);

  $('#tela').innerHTML = '<section class="carregando"><p>Baixando os cadastros para uso sem internet…</p></section>';
  await baixarBase();
  await carregarDaBaseLocal();

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
  sincronizar();
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

/* ---------------------------------------------------------------- partida */

window.addEventListener('online',  () => { App.online = true;  pintarEstado(); sincronizar(); enviarFotos(); });
window.addEventListener('offline', () => { App.online = false; pintarEstado(); });

window.addEventListener('beforeunload', e => {
  if (App.pendentes > 0) { e.preventDefault(); e.returnValue = ''; }
});

document.addEventListener('DOMContentLoaded', async () => {
  $('#modal-fechar').onclick = fecharModal;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });
  $('#btn-fila').onclick = telaFila;
  pintarEstado();
  await abrirBase();
  await contarFila();

  App.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    db: { schema: CONFIG.SCHEMA || 'public' },
    // Sessão emprestada do app principal: este cliente não guarda nem renova
    // login nenhum, só pede o token atual a cada chamada.
    accessToken: tokenDoPrincipal,
  });

  // O app principal avisa quando a pessoa sai ou troca de login.
  const principal = clientePrincipal();
  if (principal) principal.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT') { App.usuario = null; telaSemAcesso('Sessão encerrada.'); }
  });

  await carregarDaBaseLocal();
  iniciarSessao();
});

/* O app principal chama isto quando a pessoa volta para a área já aberta. */
window.voltarAoInicioDaArea = () => { if (App.usuario && window.mostrarInicio) mostrarInicio(); };

/* Os arquivos são scripts clássicos: `const` no topo não vira propriedade de
   window. Publico o que telas.js usa, para a ordem de carga não importar. */
Object.assign(window, {
  App, q, $, $$, esc, aviso, abrirModal, fecharModal,
  gravar, inativar, irPara, sincronizar, pk, meta, blobDaFoto, baixarBase,
  guardarFoto, enviarFotos
});
