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
  'ordens_servico', 'os_itens', 'manutencoes',
  // Patrimônio (15/10/2026): bens fora da frota e o histórico de cada um.
  'bens_patrimonio', 'patrimonio_movimentos'
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
  const fim = new Promise((ok, erro) => {
    s.transaction.oncomplete = () => ok(true);
    s.transaction.onerror = s.transaction.onabort = () => erro(s.transaction.error);
  });
  for (const l of linhas) {
    const id = idDe(tabela, l);
    // uma linha sem chave não pode derrubar a gravação das outras
    if (id === undefined || id === null || id === '') {
      console.warn('linha sem chave, não gravada localmente:', tabela, l);
      continue;
    }
    s.put({ tabela, id, dado: l });
  }
  return fim;
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
  const fotos = await fotosNaFila();
  App.pendentes = itens.filter(i => i.status !== 'enviado').length + fotos.length;
  App.parados = itens.filter(i => i.status === 'parado').length + fotos.filter(f => f.status === 'parada').length;
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
    // Na ordem em que foi preenchido (rodada A, 15/10/2026): antes vinha em
    // ordem alfabética de tabela e a resposta/foto do checklist subia ANTES
    // do próprio checklist (filho antes do pai).
    const itens = (await itensDaFila()).filter(i => i.status !== 'enviado')
      .sort((x, y) => String(x.preenchido_em).localeCompare(String(y.preenchido_em)));
    for (const item of itens) {
      if (item.status === 'parado') continue;   // espera a pessoa decidir (tela da fila)
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
        /* Só sai da fila depois do OK do servidor — e só se ninguém regravou o
           mesmo registro enquanto ele subia (rodada A, 15/10/2026): antes o
           envio antigo apagava da fila a edição nova, que nunca subia. */
        const agora = await promessa(tx('fila').get(item.uuid));
        if (!agora || agora.preenchido_em === item.preenchido_em) {
          await promessa(tx('fila', 'readwrite').delete(item.uuid));
        }
      } catch (e) {
        /* Erro de rede (sem código) → 'erro': tenta de novo na próxima.
           Erro do banco (código Postgres/PostgREST: sem permissão, dado
           inválido…) → 'parado': repetir não resolve; a tela da fila mostra
           o motivo e a pessoa escolhe tentar de novo ou descartar. A exceção
           é chave estrangeira (23503): o pai pode subir na próxima rodada. */
        const codigo = e && e.code ? String(e.code) : '';
        const permanente = codigo && codigo !== '23503' && !/^(08|53|57|58)/.test(codigo);
        item.status = permanente || item.tentativas >= 20 ? 'parado' : 'erro';
        item.tentativas += 1;
        item.erro = e.message || String(e);
        await promessa(tx('fila', 'readwrite').put(item));
        if (item.status === 'parado') aviso('Um registro não pôde ser enviado (' + item.tabela + '). Veja em "aguardando envio".', true);
      }
    }
  } finally {
    sincronizando = false;
    await contarFila();
  }
  /* 15/10/2026: o que foi gravado enquanto a fila subia (ex.: a movimentação e
     o bem, um logo depois do outro) sobe agora, sem esperar a próxima gravação.
     Só o que nunca foi tentado — item com erro espera a próxima vez. */
  if (App.online && (await itensDaFila()).some(i => i.status === 'pendente')) sincronizar();
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
  return todas.filter(f => f.status !== 'enviada' && f.status !== 'parada');
}
async function fotosNaFila() {
  try { return (await promessa(tx('fotos').getAll())).filter(f => f.status !== 'enviada'); }
  catch (e) { return []; }
}

/* Caminho gravado nos registros (os/<código>/<id>.jpg, checklists/<código>/<id>.jpg)
   → chave do arquivo no Drive (manutencoes/os/…, manutencoes/checklist/…). */
function chaveDrive(caminho) {
  return 'manutencoes/' + caminho.replace(/^checklists\//, 'checklist/').toLowerCase();
}
async function chamarArquivos(acao, chave, init = {}, extra = '') {
  // 15/10/2026: App.sb usa a sessão emprestada (accessToken) e o supabase-js
  // proíbe App.sb.auth nesse modo — o token vem do app principal.
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
        // Enviada: sai do aparelho (rodada A, 15/10/2026). Antes ficava marcada
        // 'enviada' para sempre e o IndexedDB crescia sem parar; quem precisa
        // da foto depois baixa do Drive (blobDoDrive).
        await promessa(tx('fotos', 'readwrite').delete(f.id));
      } else if (r.status >= 500) {
        break;                                      // Drive fora ou sem autorização: tenta depois
      } else {
        // 4xx: repetir não resolve. Fica 'parada' com o motivo, visível na fila.
        let motivo = ''; try { motivo = (await r.text()).slice(0, 160); } catch (e) {}
        f.status = 'parada'; f.erro = r.status + ' ' + motivo;
        await promessa(tx('fotos', 'readwrite').put(f));
        aviso('Uma foto não pôde ser enviada (' + r.status + '). Veja em "aguardando envio".', true);
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
/* Prazo de cada consulta (15/10/2026). Sem ele, uma resposta que se perdia
   no sinal fraco deixava a tela em "Baixando os cadastros…" para sempre. */
const PRAZO_CONSULTA_MS = 20000;

async function baixarTabela(t) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PRAZO_CONSULTA_MS);
  try {
    // Em páginas de 1.000 (rodada A, 15/10/2026): o servidor devolve no máximo
    // 1.000 linhas por resposta e antes a tabela vinha cortada — e a cópia
    // local era apagada antes de receber o resultado cortado.
    let data = [];
    for (let de = 0; ; de += 1000) {
      const r = await App.sb.from(t).select('*').range(de, de + 999).abortSignal(ctl.signal);
      if (r.error) throw r.error;
      data = data.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    return data;
  } finally { clearTimeout(timer); }
}

async function baixarBase() {
  if (!App.online) return false;
  const falhas = [];
  // As consultas vão todas juntas; a gravação no aparelho é uma por vez.
  const resultados = await Promise.all(TABELAS_BASE.map(t =>
    baixarTabela(t).then(data => ({ t, data }), e => ({ t, erro: e }))));
  for (const r of resultados) {
    if (r.erro) { console.warn('não baixou', r.t, r.erro.message || r.erro); falhas.push(r.t); continue; }
    await limparLocal(r.t);
    await gravarLocal(r.t, r.data);
    App.dados[r.t] = r.data;
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
  // O "fim da transação" é ligado antes de qualquer espera: assim a promessa
  // não fica pendurada se a transação terminar antes da hora.
  const s = tx('cache', 'readwrite');
  return new Promise((ok, erro) => {
    s.transaction.oncomplete = () => ok(true);
    s.transaction.onerror = s.transaction.onabort = () => erro(s.transaction.error);
    const req = s.index('por_tabela').getAllKeys(tabela);
    req.onsuccess = () => { for (const k of req.result) s.delete(k); };
  });
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
      ? ' registro aguardando envio' : ' registros aguardando envio')
      + (App.parados ? ' · ' + App.parados + ' parado(s)' : '');
    fila.classList.remove('oculto');
  } else {
    fila.classList.add('oculto');
  }
  // Avisa o LOP (app principal) para o contador do topo somar esta área (rodada A).
  try {
    if (window.parent !== window) window.parent.postMessage({ tipo: 'gr-pendentes', area: CONFIG.SCHEMA, n: App.pendentes }, location.origin);
  } catch (e) {}
}

/* ---------------------------------------------------------------- fila: tela */
async function telaFila() {
  const itens = (await itensDaFila()).filter(i => i.status !== 'enviado')
    .sort((x, y) => String(x.preenchido_em).localeCompare(String(y.preenchido_em)));
  const fotos = await fotosNaFila();   // rodada A: a tela listava só registros; o botão contava fotos também
  const linha = (tipo, chave, nome, quando, status, erro) => `
        <li>
          <div class="info">
            <strong>${esc(nome)}</strong>
            <small>${tipo === 'foto' ? 'foto tirada' : 'preenchido'} em ${new Date(quando).toLocaleString('pt-BR')}</small>
            ${erro ? `<small style="color:var(--urgente)">${esc(erro)}</small>` : ''}
            ${status === 'parado' || status === 'parada' ? `<small>
              <button type="button" class="btn mini" data-fila-tentar="${esc(chave)}" data-tipo="${tipo}">Tentar de novo</button>
              <button type="button" class="btn mini" data-fila-descartar="${esc(chave)}" data-tipo="${tipo}">Descartar</button></small>` : ''}
          </div>
          <span class="etq ${status === 'erro' || status === 'parado' || status === 'parada' ? 'urgente' : 'atencao'}">${esc(status)}</span>
        </li>`;
  const html = itens.length === 0 && fotos.length === 0
    ? '<div class="vazio"><p>Nada esperando. Tudo que você registrou já está no servidor.</p></div>'
    : '<ul class="lista">'
      + itens.map(i => linha('registro', i.uuid, i.tabela, i.preenchido_em, i.status, i.erro)).join('')
      + fotos.map(f => linha('foto', f.id, 'foto · ' + f.caminho, f.registrado_em, f.status, f.erro)).join('')
      + '</ul>'
      + '<p class="dica">"parado" = o servidor recusou (sem permissão ou dado inválido); repetir não resolve sozinho. '
      + 'Descartar apaga o lançamento deste aparelho.</p>'
      + '<div class="acoes"><button type="button" class="btn" id="btn-sinc">Sincronizar agora</button></div>';
  abrirModal('Registros aguardando envio', html, corpo => {
    corpo.querySelectorAll('[data-fila-tentar]').forEach(b => b.onclick = async () => {
      const foto = b.dataset.tipo === 'foto';
      const loja = foto ? 'fotos' : 'fila';
      const it = await promessa(tx(loja).get(b.dataset.filaTentar));
      if (it) { it.status = 'pendente'; it.erro = null; if (!foto) it.tentativas = 0; await promessa(tx(loja, 'readwrite').put(it)); }
      await contarFila();
      foto ? enviarFotos() : await sincronizar();
      telaFila();
    });
    corpo.querySelectorAll('[data-fila-descartar]').forEach(b => b.onclick = async () => {
      if (!confirm('Descartar este lançamento? Ele some deste aparelho e não vai para o servidor.')) return;
      const loja = b.dataset.tipo === 'foto' ? 'fotos' : 'fila';
      await promessa(tx(loja, 'readwrite').delete(b.dataset.filaDescartar));
      await contarFila();
      telaFila();
    });
    const b = corpo.querySelector('#btn-sinc');
    if (b) b.onclick = async () => {
      if (!App.online) return aviso('Sem internet. A fila sobe sozinha quando o sinal voltar.', true);
      await sincronizar();
      enviarFotos();
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

/* ---------------------------------------------------------------- partida */

window.addEventListener('online',  () => { App.online = true;  pintarEstado(); sincronizar(); enviarFotos(); });
window.addEventListener('offline', () => { App.online = false; pintarEstado(); });

window.addEventListener('beforeunload', e => {
  // Item 'parado' espera decisão da pessoa; não prende a página para sempre (rodada A).
  if (App.pendentes - (App.parados || 0) > 0) { e.preventDefault(); e.returnValue = ''; }
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
  abrirArea();
});

/* O app principal chama isto quando a pessoa volta para a área já aberta. */
window.voltarAoInicioDaArea = () => { if (App.usuario && window.mostrarInicio) mostrarInicio(); };

/* Os arquivos são scripts clássicos: `const` no topo não vira propriedade de
   window. Publico o que telas.js usa, para a ordem de carga não importar. */
Object.assign(window, {
  App, q, $, $$, esc, aviso, abrirModal, fecharModal,
  gravar, inativar, irPara, sincronizar, pk, meta, blobDaFoto, blobDoDrive, baixarBase,
  guardarFoto, enviarFotos
});
