/* =====================================================================
   LOP - Gestão Rápida · área Programação Campo — núcleo (15/10/2026)
   Veio do app avulso Gestão Rápida – Programação Campo. Mora numa moldura
   do LOP e usa o login de lá (sessão emprestada, como Máquinas e Patrimônio).
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

/* ---------------------------------------------------------------- IndexedDB */
let idb = null;

function abrirBase() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(CONFIG.BASE_LOCAL || 'lop-gr-programacao', 1);
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
const CHAVE_COMPOSTA = { usuario_fazendas: ['email', 'fazenda_id'] };

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

async function limparLocal(tabela) {
  const s = tx('cache', 'readwrite');
  const chaves = await promessa(s.index('por_tabela').getAllKeys(tabela));
  chaves.forEach(k => s.delete(k));
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
let deNovo = false;   // algo entrou na fila enquanto enviava

/* Envia a fila. Idempotente: o mesmo item reenviado usa o mesmo id,
   então o upsert no servidor não duplica. */
async function sincronizar() {
  if (!App.online || !App.sb || !App.usuario) return;
  if (sincronizando) { deNovo = true; return; }
  sincronizando = true;
  try {
    // Na ordem em que foi preenchido: cadastro novo sobe antes da atividade que usa ele.
    const itens = (await itensDaFila()).filter(i => i.status !== 'enviado')
      .sort((x, y) => String(x.preenchido_em).localeCompare(String(y.preenchido_em)));
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
    if (deNovo) { deNovo = false; setTimeout(sincronizar, 300); }
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

/* ---------------------------------------------------------------- Google Drive

   Toda foto ou anexo da Programação vai para o Google Drive (decisão do
   Guilherme, 15/10/2026), pela função "arquivos" do Supabase — a mesma de
   Máquinas e Patrimônio. O caminho gravado no registro (<id do diário>/<uuid>.jpg)
   vira a chave programacao/diario/<id do diário>/<uuid>.jpg. */
function chaveDrive(caminho) {
  return 'programacao/diario/' + String(caminho).toLowerCase();
}
async function chamarArquivos(acao, chave, init = {}, extra = '') {
  const t = await tokenDoPrincipal();
  if (!t) throw new Error('sem-login');
  return fetch(CONFIG.SUPABASE_URL + '/functions/v1/arquivos?acao=' + acao + '&chave=' + encodeURIComponent(chave) + extra, {
    ...init, headers: { Authorization: 'Bearer ' + t, apikey: CONFIG.SUPABASE_ANON_KEY, ...(init.headers || {}) },
  });
}
/* Foto que já subiu (ou foi feita em outro aparelho): baixa do Drive. */
async function blobDoDrive(caminho) {
  if (!App.online || !App.sb) return null;
  try {
    const r = await chamarArquivos('ver', chaveDrive(caminho));
    return r.ok ? await r.blob() : null;
  } catch (e) { return null; }
}

let enviandoFotos = false;
async function enviarFotos() {
  if (enviandoFotos || !App.online || !App.sb) return;
  enviandoFotos = true;
  try {
    for (const f of await fotosPendentes()) {
      // Fotos no Google Drive (15/10/2026), pela função "arquivos" do Supabase.
      let r;
      try {
        r = await chamarArquivos('enviar', chaveDrive(f.caminho), {
          method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: f.blob,
        }, '&nome=' + encodeURIComponent(f.caminho.split('/').pop()));
      } catch (e) { break; }                       // sem conexão: tenta depois
      if (r.ok) {
        f.status = 'enviada';
        await promessa(tx('fotos', 'readwrite').put(f));
      } else if (r.status >= 500) break;           // Drive fora ou sem autorização: tenta depois
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

async function baixarBase(forcar = false) {
  if (!App.online) return false;
  const versao = await meta('versao_base');
  const baixadaEm = await meta('baixada_em');
  const recente = baixadaEm && (Date.now() - new Date(baixadaEm).getTime() < 6 * 3600 * 1000);
  if (!forcar && recente && versao === CONFIG.VERSAO_BASE) return false;

  for (const t of TABELAS_BASE) {
    // O servidor devolve no máximo 1000 linhas por vez: busco em páginas.
    let data = [], error = null;
    for (let de = 0; ; de += 1000) {
      const r = await App.sb.from(t).select('*').range(de, de + 999);
      if (r.error) { error = r.error; break; }
      data = data.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    if (error) { console.warn('não baixou', t, error.message); continue; }
    // apaga o que sumiu do servidor (ex.: fazenda tirada da pessoa)
    await limparLocal(t);
    // o que foi feito aqui e ainda não subiu continua valendo na tela
    const pend = (await itensDaFila()).filter(i => i.tabela === t && i.status !== 'enviado');
    pend.forEach(i => {
      const id = idDe(t, i.registro);
      const k = data.findIndex(x => idDe(t, x) === id);
      if (k >= 0) data[k] = i.registro; else data.push(i.registro);
    });
    await gravarLocal(t, data);
    App.dados[t] = data;
  }
  await meta('versao_base', CONFIG.VERSAO_BASE);
  await meta('baixada_em', new Date().toISOString());
  return true;
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
   cada chamada — assim só UM lugar renova a sessão. */
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
      try { await sincronizar(); await baixarBase(true); if (window.repintarTela) repintarTela(); }
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
    // Sessão emprestada do app principal: este cliente não guarda nem renova login.
    accessToken: tokenDoPrincipal,
  });

  const principal = clientePrincipal();
  if (principal) principal.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT') { App.usuario = null; telaSemAcesso('Sessão encerrada.'); }
  });

  await carregarDaBaseLocal();
  abrirArea();
});

/* Depois que a atualização desce por trás: redesenha só telas de consulta,
   nunca um formulário sendo preenchido nem com janela aberta. */
window.repintarTela = () => {
  if (!$('#modal').classList.contains('oculto')) return;
  const t = App.telaAtual;
  if (!t || t === 'marca') { if (window.mostrarInicio) mostrarInicio(); return; }
  if (['painel', 'atividades', 'reuniao', 'diarios'].includes(t)) irPara(t);
};

/* O app principal chama isto quando a pessoa volta para a área já aberta. */
window.voltarAoInicioDaArea = () => { if (App.usuario && window.mostrarInicio) mostrarInicio(); };

/* Os arquivos são scripts clássicos: `const` no topo não vira propriedade de
   window. Publico o que as telas usam, para a ordem de carga não importar. */
Object.assign(window, {
  App, q, $, $$, esc, aviso, abrirModal, fecharModal,
  gravar, inativar, irPara, sincronizar, pk, meta, blobDaFoto, blobDoDrive, baixarBase,
  guardarFoto, enviarFotos, lerLocal, gravarLocal
});
