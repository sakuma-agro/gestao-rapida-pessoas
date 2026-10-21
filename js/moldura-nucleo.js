/* =====================================================================
   LOP - Gestão Rápida · núcleo das molduras (rodada B, 15/10/2026)

   Um arquivo só para o que Máquinas e Patrimônio e Programação Campo (e
   qualquer área nova em moldura) fazem igual: base local em IndexedDB, fila
   de saída com estados, fotos, sessão emprestada do LOP, modal, avisos e a
   tela "aguardando envio". Antes isso vivia copiado em dois base.js e toda
   correção tinha de ser feita duas vezes.

   Cada área mantém no seu base.js só o que é dela: TABELAS_BASE,
   GERADAS_NO_BANCO, CHAVE_PK, CHAVE_COMPOSTA, chaveDrive(), quemSou(),
   iniciarSessao(), abrirArea(), irPara() e os seus exports.
   Ordem de carga na página: config.js → ../js/moldura-nucleo.js → base.js.
   (scripts clássicos partilham o escopo global: as constantes do base.js são
   lidas daqui na hora de usar, não na carga.)

   Regra: nada é considerado salvo até o servidor confirmar. Conflito: cada
   registro guarda em `_base` o atualizado_em que o servidor tinha quando foi
   lido; a gravação é UPDATE condicionado a ele. Zero linhas e o registro
   existe = alguém mexeu depois → item 'parado' e a pessoa decide.
   ===================================================================== */

const App = {
  sb: null,            // cliente Supabase
  usuario: null,       // registro da tabela usuarios
  locais: [],          // locais que o usuário enxerga
  dados: {},           // cópia em memória da base local, para a tela renderizar rápido
  online: navigator.onLine,
  pendentes: 0
};



/* ---------------------------------------------------------------- IndexedDB */
let idb = null;

function abrirBase() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(CONFIG.BASE_LOCAL, 1);
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
async function enfileirar(tabela, registro, operacao = 'upsert', base = null) {
  const item = {
    uuid: tabela + ':' + (idDe(tabela, registro) || crypto.randomUUID()),
    tabela, operacao, registro, base,
    preenchido_em: new Date().toISOString(),
    status: 'pendente',
    tentativas: 0,
    erro: null, atual: null, forcar: false
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
      // Parado volta sozinho (19/10/2026): conflito sempre (a mais recente vence);
      // recusa do servidor depois de 30 min, ou já no Sincronizar / volta do sinal.
      if (item.status === 'parado') {
        const volta = item.erro === 'conflito' || Date.now() < App.retentarAte || !item.paradoEm || Date.now() - item.paradoEm > 30 * 60 * 1000;
        if (!volta) continue;
        item.status = 'pendente'; item.tentativas = 0;
        if (item.erro === 'conflito') item.avisado = false;
      }
      try {
        let r;
        if (item.operacao === 'upsert') {
          const envio = Object.assign({}, item.registro);
          (GERADAS_NO_BANCO[item.tabela] || []).forEach(c => delete envio[c]);
          delete envio._base; delete envio.atualizado_em;   // quem carimba é o gatilho do servidor
          const chave = pk(item.tabela), id = envio[chave];
          r = null;
          if (item.base && !item.forcar && id !== undefined && !CHAVE_COMPOSTA[item.tabela]) {
            // UPDATE condicionado ao carimbo lido. Zero linhas + registro existe = conflito.
            r = await App.sb.from(item.tabela).update(envio).eq(chave, id).eq('atualizado_em', item.base).select();
            if (!r.error && !(r.data && r.data.length)) {
              const a = await App.sb.from(item.tabela).select('*').eq(chave, id).maybeSingle();
              if (a.error) throw a.error;
              if (a.data) {
                // Regra da casa (19/10/2026): a mais recente vence. A versão
                // atropelada vai para a auditoria (se a RLS deixar) e o upsert segue.
                try {
                  const u = await App.sb.auth.getUser().then(x => x.data?.user?.email || null, () => null);
                  const dep = Object.assign({}, item.registro); delete dep._base;
                  await App.sb.from('jor_auditoria').insert({ tabela: item.tabela, registro_id: /^[0-9a-f-]{36}$/i.test(String(id)) ? id : null,
                    acao: 'conflito_sobrescrito', antes: a.data, depois: dep, usuario: u,
                    justificativa: 'Conflito resolvido pela regra "a mais recente vence". Versão do servidor (' + (a.data.atualizado_em || '?') + ') substituída.' });
                } catch (_) {}
                aviso('Conflito resolvido: a sua gravação mais recente ficou (' + item.tabela + '). A anterior está na auditoria.');
              }
              r = null;   // grava por cima (ou de novo, se sumiu do servidor)
            }
          }
          if (!r) r = await App.sb.from(item.tabela).upsert(envio, { onConflict: chave }).select();
          // O servidor devolve o registro completo (com o número que ele gerou e
          // o carimbo novo): guardo na base local para a tela mostrar o nº da OS.
          if (!r.error && r.data && r.data[0]) {
            const salvo = r.data[0]; salvo._base = salvo.atualizado_em ?? null;
            const agora = await promessa(tx('fila').get(item.uuid));
            const regravado = agora && agora.preenchido_em !== item.preenchido_em;
            const lista = App.dados[item.tabela] || [];
            const i = lista.findIndex(x => x[chave] === salvo[chave]);
            if (!regravado) {
              await gravarLocal(item.tabela, [salvo]);
              if (i >= 0) Object.assign(lista[i], salvo); else lista.push(salvo);
            } else {
              // Há edição mais nova esperando: só o carimbo e o que o banco gerou,
              // e a base dela passa a ser o carimbo novo (senão "conflitaria" consigo mesma).
              const so = { _base: salvo._base, atualizado_em: salvo.atualizado_em };
              (GERADAS_NO_BANCO[item.tabela] || []).forEach(c => { so[c] = salvo[c]; });
              if (i >= 0) { Object.assign(lista[i], so); await gravarLocal(item.tabela, [lista[i]]); }
              agora.base = salvo._base; Object.assign(agora.registro, so);
              await promessa(tx('fila', 'readwrite').put(agora));
            }
          }
        } else if (item.operacao === 'excluir') {
          // Cadastro em uso nunca é apagado: "excluir" aqui é inativar.
          r = await App.sb.from(item.tabela).update({ ativo: false })
                .eq(pk(item.tabela), idDe(item.tabela, item.registro));
        }
        if (r && r.error) throw r.error;
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
        item.tentativas += 1;
        if (e && e.conflito) { item.status = 'parado'; item.erro = 'conflito'; item.atual = e.atual; }
        else { item.status = permanente || item.tentativas >= 20 ? 'parado' : 'erro'; item.erro = e.message || String(e); if (item.status === 'parado') item.paradoEm = Date.now(); }
        const avisar = item.status === 'parado' && !item.avisado;
        if (avisar) item.avisado = true;
        await promessa(tx('fila', 'readwrite').put(item));
        if (avisar) aviso(item.erro === 'conflito'
          ? 'Outra pessoa alterou um registro que você também mudou. Veja em "aguardando envio".'
          : 'Um registro não pôde ser enviado (' + item.tabela + '). Veja em "aguardando envio".', true);
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

/* chaveDrive(caminho) é da área (base.js): onde a foto mora no Drive. */
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
  const lista = App.dados[tabela] || [];
  const i = lista.findIndex(x => x[chave] === registro[chave]);
  // A base (carimbo do servidor na última leitura) viaja com o registro local
  // e com o item da fila; o envio confere se alguém mexeu depois.
  const base = i >= 0 ? (lista[i]._base ?? null) : (registro._base ?? null);
  registro._base = base;
  await gravarLocal(tabela, [registro]);
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  App.dados[tabela] = lista;
  await enfileirar(tabela, registro, 'upsert', base);
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

/* tabelas/visões sem a coluna atualizado_em (descobertas na primeira leitura) */
const SEM_CARIMBO = new Set();
async function baixarTabela(t, desde = null) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PRAZO_CONSULTA_MS);
  try {
    // Em páginas de 1.000 (rodada A, 15/10/2026): o servidor devolve no máximo
    // 1.000 linhas por resposta e antes a tabela vinha cortada — e a cópia
    // local era apagada antes de receber o resultado cortado.
    // `desde` (rodada C): só o que mudou depois desse carimbo (leitura incremental).
    // Visões que espelham cadastros do LOP (fazendas, operadores, máquinas…)
    // não têm atualizado_em: pedir ordem por ela fazia o servidor recusar e o
    // aparelho novo ficava sem essas listas (caso do Matheus, 21/10/2026).
    // Sem a coluna, a tabela vem inteira, ordenada pela chave.
    const ler = async (comCarimbo) => {
      let data = [];
      for (let de = 0; ; de += 1000) {
        let q = App.sb.from(t).select('*');
        if (comCarimbo && desde) q = q.gt('atualizado_em', desde);
        const ordem = comCarimbo ? 'atualizado_em' : (CHAVE_COMPOSTA[t] ? CHAVE_COMPOSTA[t][0] : pk(t));
        const r = await q.order(ordem).range(de, de + 999).abortSignal(ctl.signal);
        if (r.error) throw r.error;
        data = data.concat(r.data || []);
        if (!r.data || r.data.length < 1000) break;
      }
      return data;
    };
    if (SEM_CARIMBO.has(t)) return await ler(false);
    try { return await ler(true); }
    catch (e) {
      const msg = String((e && (e.message || e.details)) || '');
      if ((e && e.code === '42703') || /atualizado_em/.test(msg)) {
        SEM_CARIMBO.add(t);
        return await ler(false);
      }
      throw e;
    }
  } finally { clearTimeout(timer); }
}

/* Leitura incremental (rodada C, 15/10/2026). Toda tabela tem atualizado_em
   carimbado pelo servidor: depois da primeira carga completa, cada abertura
   pede só o que mudou desde o maior carimbo guardado por tabela. Uma carga
   completa volta a cada 24 h (ou quando a versão da base muda), para o que
   foi apagado no servidor sumir daqui também. */
const COMPLETA_A_CADA_MS = 24 * 3600 * 1000;
async function baixarBase(forcar = false) {
  if (!App.online) return false;
  const falhas = [];
  const completaEm = await meta('completa_em');
  const versao = await meta('versao_base');
  const incremental = !!completaEm && versao === CONFIG.VERSAO_BASE
    && (Date.now() - new Date(completaEm).getTime() < COMPLETA_A_CADA_MS);
  const marcas = (await meta('marcas')) || {};
  // As consultas vão todas juntas; a gravação no aparelho é uma por vez.
  // Tabela sem marca (visão sem atualizado_em, ou nunca lida) vem sempre inteira.
  const parcial = t => incremental && !!marcas[t];
  const resultados = await Promise.all(TABELAS_BASE.map(t =>
    baixarTabela(t, parcial(t) ? marcas[t] : null).then(data => ({ t, data }), e => ({ t, erro: e }))));
  for (const r of resultados) {
    if (r.erro) { console.warn('não baixou', r.t, r.erro.message || r.erro); falhas.push(r.t); continue; }
    r.data.forEach(x => { x._base = x.atualizado_em ?? null; });   // carimbo lido → base do conflito
    if (parcial(r.t)) {
      if (!r.data.length) continue;
      await gravarLocal(r.t, r.data);
      const lista = App.dados[r.t] || (App.dados[r.t] = []);
      for (const x of r.data) {
        const id = idDe(r.t, x), i = lista.findIndex(y => idDe(r.t, y) === id);
        if (i >= 0) lista[i] = x; else lista.push(x);
      }
    } else {
      await limparLocal(r.t);
      await gravarLocal(r.t, r.data);
      App.dados[r.t] = r.data;
    }
    const maior = r.data.reduce((m, x) => (x.atualizado_em && x.atualizado_em > m ? x.atualizado_em : m), marcas[r.t] || '');
    if (maior) marcas[r.t] = maior;
  }
  await meta('marcas', marcas);
  if (!incremental && !falhas.length) await meta('completa_em', new Date().toISOString());
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
  const linha = (tipo, chave, nome, quando, status, erro, atual) => {
    const conflito = erro === 'conflito' && atual;
    const quem = conflito ? (atual.atualizado_por || atual.usuario || 'outra pessoa') + ' às ' + new Date(atual.atualizado_em).toLocaleString('pt-BR') : '';
    return `
        <li>
          <div class="info">
            <strong>${esc(nome)}</strong>
            <small>${tipo === 'foto' ? 'foto tirada' : 'preenchido'} em ${new Date(quando).toLocaleString('pt-BR')}</small>
            ${conflito ? `<small style="color:var(--urgente)">Outra pessoa alterou este registro depois de você (${esc(quem)}).</small>`
                       : erro ? `<small style="color:var(--urgente)">${esc(erro)}</small>` : ''}
            ${status === 'parado' || status === 'parada' ? `<small>
              ${conflito ? `<button type="button" class="btn mini" data-fila-manter="${esc(chave)}">Manter o meu</button>
                            <button type="button" class="btn mini" data-fila-servidor="${esc(chave)}">Usar o do servidor</button>`
                         : `<button type="button" class="btn mini" data-fila-tentar="${esc(chave)}" data-tipo="${tipo}">Tentar de novo</button>`}
              <button type="button" class="btn mini" data-fila-descartar="${esc(chave)}" data-tipo="${tipo}">Descartar</button></small>` : ''}
          </div>
          <span class="etq ${status === 'erro' || status === 'parado' || status === 'parada' ? 'urgente' : 'atencao'}">${esc(status)}</span>
        </li>`; };
  const html = itens.length === 0 && fotos.length === 0
    ? '<div class="vazio"><p>Nada esperando. Tudo que você registrou já está no servidor.</p></div>'
    : '<ul class="lista">'
      + itens.map(i => linha('registro', i.uuid, i.tabela, i.preenchido_em, i.status, i.erro, i.atual)).join('')
      + fotos.map(f => linha('foto', f.id, 'foto · ' + f.caminho, f.registrado_em, f.status, f.erro)).join('')
      + '</ul>'
      + '<p class="dica">"parado" = o servidor recusou, ou outra pessoa alterou o mesmo registro depois de você; repetir não resolve sozinho. '
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
    corpo.querySelectorAll('[data-fila-manter]').forEach(b => b.onclick = async () => {
      const it = await promessa(tx('fila').get(b.dataset.filaManter));
      if (it) { it.status = 'pendente'; it.erro = null; it.tentativas = 0; it.forcar = true; it.base = null; it.avisado = false; await promessa(tx('fila', 'readwrite').put(it)); }
      await contarFila(); await sincronizar(); telaFila();
    });
    corpo.querySelectorAll('[data-fila-servidor]').forEach(b => b.onclick = async () => {
      const it = await promessa(tx('fila').get(b.dataset.filaServidor));
      if (it && it.atual) {
        const salvo = Object.assign({}, it.atual, { _base: it.atual.atualizado_em ?? null });
        await gravarLocal(it.tabela, [salvo]);
        const lista = App.dados[it.tabela] || [], chave = pk(it.tabela);
        const i = lista.findIndex(x => x[chave] === salvo[chave]);
        if (i >= 0) lista[i] = salvo; else lista.push(salvo);
      }
      await promessa(tx('fila', 'readwrite').delete(b.dataset.filaServidor));
      await contarFila(); if (window.repintarTela) repintarTela(); telaFila();
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

   A área mora dentro do LOP - Gestão Rápida, numa moldura. Quem entra, sai,
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

/* quemSou(sessao), iniciarSessao(), abrirArea() e irPara(nome) são da área. */

/* ---------------------------------------------------------------- partida */

window.addEventListener('online',  () => { App.online = true;  App.retentarAte = Date.now() + 60 * 1000; pintarEstado(); sincronizar(); enviarFotos(); });
/* Botão Sincronizar do topo do LOP (19/10/2026): o pai manda 'gr-sincronizar'
   e cada moldura envia a sua fila e as fotos. */
window.addEventListener('message', ev => {
  if (ev.origin !== location.origin || !ev.data || ev.data.tipo !== 'gr-sincronizar') return;
  App.retentarAte = Date.now() + 60 * 1000;   // o Sincronizar tenta os parados também
  App.online = navigator.onLine;
  Promise.resolve(sincronizar()).then(() => enviarFotos()).catch(() => {}).finally(() => pintarEstado());
});
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
   window. Publico o que as telas usam, para a ordem de carga não importar.
   (irPara é publicado pelo base.js da área.) */
Object.assign(window, {
  App, q, $, $$, esc, aviso, abrirModal, fecharModal,
  gravar, inativar, sincronizar, pk, meta, blobDaFoto, blobDoDrive, baixarBase,
  guardarFoto, enviarFotos, lerLocal, gravarLocal
});
