// nucleo.js — núcleo offline do LOP - Gestão Rápida (rodada B, 15/10/2026)
//
// Um lugar só para o que toda camada de dados precisa:
//   - guarda no aparelho em IndexedDB (banco 'lop-gr'), e não mais em
//     localStorage: a cota de ~5 MB por site era dividida com as fotos da
//     Vistorias e, cheia, a fila de envio deixava de ser gravada em silêncio;
//   - fila de envio única para as camadas do Pessoas ('epi' = Cadastros/EPI,
//     'jor' = DP), com estados: pendente → (erro: rede, tenta de novo) ou
//     (parado: o servidor recusou ou alguém mudou o registro — a pessoa decide);
//   - controle de conflito por `atualizado_em`: cada registro guarda em `_base`
//     o carimbo que o servidor tinha quando foi lido; a gravação é um UPDATE
//     condicionado a esse carimbo. Zero linhas e o registro existe = outra
//     pessoa mexeu depois de você → item 'parado' com a versão dela guardada.
//
// As molduras (Máquinas e Patrimônio, Programação Campo) ainda têm as suas
// próprias bases em IndexedDB; migram para cá na rodada seguinte.

const NOME_BD = 'lop-gr';
const VERSAO_BD = 1;
let bd = null;

/* ---------------- IndexedDB ---------------- */
const promessa = req => new Promise((ok, erro) => { req.onsuccess = () => ok(req.result); req.onerror = () => erro(req.error); });

export function abrir() {
  if (bd) return Promise.resolve(bd);
  return new Promise((ok, erro) => {
    let req;
    try { req = indexedDB.open(NOME_BD, VERSAO_BD); } catch (e) { return erro(e); }
    req.onupgradeneeded = () => {
      const b = req.result;
      if (!b.objectStoreNames.contains('caixas')) b.createObjectStore('caixas');           // chave = nome da caixa, valor = objeto inteiro
      if (!b.objectStoreNames.contains('fila')) {
        const f = b.createObjectStore('fila', { keyPath: 'uuid' });
        f.createIndex('por_camada', 'camada');
      }
      if (!b.objectStoreNames.contains('meta')) b.createObjectStore('meta');
    };
    req.onsuccess = () => { bd = req.result; bd.onversionchange = () => { bd.close(); bd = null; }; ok(bd); };
    req.onerror = () => erro(req.error);
    req.onblocked = () => erro(new Error('IndexedDB bloqueado'));
  });
}

function tx(loja, modo = 'readonly') { return bd.transaction(loja, modo).objectStore(loja); }
function fimDe(loja) {
  return new Promise((ok, erro) => {
    loja.transaction.oncomplete = () => ok(true);
    loja.transaction.onerror = loja.transaction.onabort = () => erro(loja.transaction.error);
  });
}

/* Armazenamento cheio: mesmo aviso que o store.js dava para o localStorage. */
export const armazenamento = { cheio: false, chave: null };
function avisarCheio(chave, e) {
  armazenamento.cheio = true; armazenamento.chave = chave;
  try { dispatchEvent(new CustomEvent('gr:armazenamento-cheio', { detail: { chave, erro: String(e?.name || e) } })); } catch {}
}
function avisarOk(chave) {
  if (armazenamento.cheio && armazenamento.chave === chave) { armazenamento.cheio = false; try { dispatchEvent(new Event('gr:armazenamento-ok')); } catch {} }
}

/* ---------------- caixas (cache de uma camada inteira) ---------------- */
export async function lerCaixa(nome, padrao = null) {
  try { await abrir(); const v = await promessa(tx('caixas').get(nome)); return v === undefined ? padrao : v; }
  catch { return padrao; }
}
let gravacoes = Promise.resolve();
/** Grava a caixa inteira. As gravações seguem na ordem em que foram pedidas. */
export function gravarCaixa(nome, valor) {
  gravacoes = gravacoes.then(async () => {
    try {
      await abrir();
      const s = tx('caixas', 'readwrite');
      s.put(valor, nome);
      await fimDe(s);
      avisarOk(nome);
      return true;
    } catch (e) { avisarCheio(nome, e); return false; }
  });
  return gravacoes;
}
export async function apagarCaixa(nome) {
  try { await abrir(); const s = tx('caixas', 'readwrite'); s.delete(nome); await fimDe(s); } catch {}
}
export async function lerMeta(chave, padrao = null) {
  try { await abrir(); const v = await promessa(tx('meta').get(chave)); return v === undefined ? padrao : v; } catch { return padrao; }
}
export async function gravarMeta(chave, valor) {
  try { await abrir(); const s = tx('meta', 'readwrite'); s.put(valor, chave); await fimDe(s); } catch {}
}

/* ---------------- mudança de casa: localStorage → IndexedDB ----------------
   Uma vez só, na primeira abertura desta versão: o que estava guardado em
   localStorage (cache e fila do EPI e do DP) vem para cá e sai de lá. */
export async function migrarDoLocalStorage(mapa) {
  // mapa: { 'epi.cache': 'epi.cache', 'epi.fila': { camada: 'epi' }, ... }
  for (const [chaveLs, destino] of Object.entries(mapa)) {
    let v = null;
    try { const s = localStorage.getItem(chaveLs); v = s ? JSON.parse(s) : null; } catch { v = null; }
    if (v === null) continue;
    if (typeof destino === 'string') {
      if (await gravarCaixa(destino, v)) { try { localStorage.removeItem(chaveLs); } catch {} }
    } else if (Array.isArray(v)) {
      // fila antiga: { tabela|colecao, acao, dados|item, em }
      let ok = true;
      for (const p of v) {
        const r = await adicionarNaFila(destino.camada, {
          colecao: p.colecao || p.tabela, acao: p.acao, item: p.item || p.dados, em: p.em || Date.now(), base: null,
        });
        if (!r) ok = false;
      }
      if (ok) { try { localStorage.removeItem(chaveLs); } catch {} }
    }
  }
}

/* ---------------- fila ---------------- */
const contadores = {};   // camada → { pendentes, parados }
const ouvintes = new Set();
export const aoMudarFila = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch {} });

export const pendentes = camada => camada ? (contadores[camada]?.pendentes || 0)
  : Object.values(contadores).reduce((n, c) => n + (c.pendentes || 0), 0);
export const parados = camada => camada ? (contadores[camada]?.parados || 0)
  : Object.values(contadores).reduce((n, c) => n + (c.parados || 0), 0);

export async function listarFila(camada) {
  try { await abrir(); const l = await promessa(tx('fila').index('por_camada').getAll(camada)); return l.sort((a, b) => a.em - b.em); }
  catch { return []; }
}
export async function contarFila(camada) {
  const l = await listarFila(camada);
  contadores[camada] = { pendentes: l.length, parados: l.filter(x => x.status === 'parado').length };
  avisar();
  return contadores[camada];
}
export async function adicionarNaFila(camada, { colecao, acao, item, base, em }) {
  try {
    await abrir();
    const p = { uuid: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      camada, colecao, acao, item, base: base ?? null, em: em || Date.now(), status: 'pendente', tentativas: 0, erro: null, atual: null };
    const s = tx('fila', 'readwrite'); s.put(p); await fimDe(s);
    avisarOk('fila.' + camada);
    await contarFila(camada);
    return p;
  } catch (e) { avisarCheio('fila.' + camada, e); return null; }
}
async function porFila(p) { const s = tx('fila', 'readwrite'); s.put(p); await fimDe(s); }
export async function removerDaFila(uuid, camada) {
  try { await abrir(); const s = tx('fila', 'readwrite'); s.delete(uuid); await fimDe(s); } catch {}
  if (camada) await contarFila(camada);
}
export async function itemDaFila(uuid) { try { await abrir(); return await promessa(tx('fila').get(uuid)); } catch { return null; } }

/* Erro do banco que repetir não resolve: tem código Postgres/PostgREST e não
   é falha de conexão (08…), recurso (53…), operador (57…) nem chave
   estrangeira (23503 — o pai pode subir na rodada seguinte). */
export function erroPermanente(e) {
  const c = e && e.code ? String(e.code) : '';
  return !!c && c !== '23503' && !/^(08|53|57|58)/.test(c);
}

/* ---------------- gravação com controle de conflito ----------------
   envio: o registro sem os campos locais (_base) e sem atualizado_em — quem
   carimba é o gatilho do servidor. base: o atualizado_em que o servidor tinha
   quando este aparelho leu o registro (null = registro novo aqui). */
export async function gravarRegistro(cliente, tabela, pk, item, base, { forcar = false } = {}) {
  const envio = { ...item }; delete envio._base; delete envio.atualizado_em;
  // Chave composta (ex.: sst_aso_itens = exame_id + tipo_id): sem conferência
  // de conflito, upsert direto com onConflict nas duas colunas.
  if (Array.isArray(pk)) {
    const r = await cliente.from(tabela).upsert(envio, { onConflict: pk.join(',') }).select();
    if (r.error) throw r.error;
    return r.data && r.data[0] ? r.data[0] : null;
  }
  const id = item[pk];
  if (base && !forcar && id !== undefined && id !== null) {
    const r = await cliente.from(tabela).update(envio).eq(pk, id).eq('atualizado_em', base).select();
    if (r.error) throw r.error;
    if (r.data && r.data.length) return r.data[0];
    const a = await cliente.from(tabela).select('*').eq(pk, id).maybeSingle();
    if (a.error) throw a.error;
    if (a.data) { const e = new Error('conflito'); e.conflito = true; e.atual = a.data; throw e; }
    // sumiu do servidor: grava de novo
  }
  const r = await cliente.from(tabela).upsert(envio, { onConflict: pk }).select();
  if (r.error) throw r.error;
  return r.data && r.data[0] ? r.data[0] : null;
}
export async function apagarRegistro(cliente, tabela, pk, id) {
  let q = cliente.from(tabela).delete();
  if (Array.isArray(pk)) { for (const c of pk) q = q.eq(c, id[c]); } else q = q.eq(pk, id);
  const r = await q;
  if (r.error) throw r.error;
}

/* ---------------- envio da fila ----------------
   Um envio por camada por vez. `camadaDef` descreve a camada:
     tabelaDe(colecao) → nome da tabela; chaveDe(colecao) → coluna pk;
     paraBanco(colecao, item) → registro como vai para o banco;
     aoEnviado(colecao, registroDoServidor) → atualiza o cache da camada;
     cliente() → cliente Supabase; podeEnviar() → há sessão e rede. */
const emCurso = {};
/* Itens parados voltam sozinhos (19/10/2026, pedido do Guilherme: "ao pegar
   sinal, se auto atualizar"). Antes, uma recusa do servidor parava o item para
   sempre até alguém tocar em "Tentar de novo" — e quando a causa era do lado
   do servidor (ex.: o check de jor_auditoria), ninguém sabia que já estava
   corrigido. Agora:
   - toda rodada de envio tenta de novo os parados com mais de 30 min;
   - "Sincronizar" e a volta do sinal (retentarParados) tentam todos já.
   Conflito já voltava sozinho pela regra "a mais recente vence". */
const ESFRIAR_MS = 30 * 60 * 1000;
let retentarAte = 0;
export function retentarParados() { retentarAte = Date.now() + 60 * 1000; }
export function enviarFila(camada, def) {
  if (!emCurso[camada]) emCurso[camada] = enviarAgora(camada, def).finally(() => { emCurso[camada] = null; });
  return emCurso[camada];
}
async function enviarAgora(camada, def) {
  if (!def.podeEnviar()) return;
  const fila = await listarFila(camada);
  if (!fila.length) return;
  const cliente = def.cliente();
  for (const p of fila) {
    // Conflito parado de antes da regra "a mais recente vence" (19/10/2026):
    // volta à fila e passa pelo caminho novo (auditoria + grava por cima).
    if (p.status === 'parado') {
      const volta = p.erro === 'conflito' || Date.now() < retentarAte || !p.paradoEm || Date.now() - p.paradoEm > ESFRIAR_MS;
      if (!volta) continue;
      p.status = 'pendente'; p.tentativas = 0;
      if (p.erro === 'conflito') p.avisado = false;
    }
    const tabela = def.tabelaDe(p.colecao), pk = def.chaveDe(p.colecao);
    try {
      if (p.acao === 'rpc') {
        // Chamada de função do banco (item = { nome, args }); o resultado vai para aoEnviado.
        const r = await cliente.rpc(p.item.nome, p.item.args);
        if (r.error) throw r.error;
        def.aoEnviado(p.colecao, r.data);
      } else if (p.acao === 'apagar') {
        await apagarRegistro(cliente, tabela, pk, Array.isArray(pk) ? p.item : p.item[pk]);
      } else {
        let salvo;
        try {
          salvo = await gravarRegistro(cliente, tabela, pk, def.paraBanco(p.colecao, p.item), p.base, { forcar: !!p.forcar });
        } catch (e) {
          if (!e?.conflito) throw e;
          // Regra da casa (Guilherme, 19/10/2026): a gravação mais recente vence,
          // sem perguntar. A versão atropelada vai para a auditoria (acao
          // 'conflito_sobrescrito') para dar para recuperar se foi engano.
          await anotarAtropelo(cliente, tabela, pk, e.atual, p).catch(() => {});
          salvo = await gravarRegistro(cliente, tabela, pk, def.paraBanco(p.colecao, p.item), null, { forcar: true });
          try { dispatchEvent(new CustomEvent('gr:conflito-resolvido', { detail: { camada, colecao: p.colecao, item: p.item, atual: e.atual } })); } catch {}
        }
        if (salvo) {
          def.aoEnviado(p.colecao, salvo);
          // Regravação do mesmo registro ainda na fila: a base dela passa a ser
          // o carimbo novo — senão ela chegaria com a base velha e "conflitaria"
          // consigo mesma.
          for (const q of fila) {
            if (q !== p && q.colecao === p.colecao && q.status !== 'parado' && !Array.isArray(pk) && q.item?.[pk] === p.item[pk]) {
              q.base = salvo.atualizado_em ?? q.base; await porFila(q);
            }
          }
        }
      }
      const s = tx('fila', 'readwrite'); s.delete(p.uuid); await fimDe(s);
    } catch (e) {
      p.tentativas += 1;
      p.erro = e?.message || String(e);
      if (e?.conflito) { p.status = 'parado'; p.atual = e.atual; p.erro = 'conflito'; }
      else if (erroPermanente(e) || p.tentativas >= 20) { p.status = 'parado'; p.paradoEm = Date.now(); }
      else p.status = 'erro';
      try { await porFila(p); } catch {}
      if (p.status === 'parado' && !p.avisado) {
        p.avisado = true; try { await porFila(p); } catch {}
        try { dispatchEvent(new CustomEvent('gr:fila-parada', { detail: { camada, uuid: p.uuid, colecao: p.colecao, conflito: !!e?.conflito } })); } catch {}
      }
    }
  }
  await contarFila(camada);
}

/* A versão do servidor que foi atropelada pela gravação mais recente vai para
   jor_auditoria. Se o usuário não tem o módulo jornada a RLS recusa — não
   importa, a gravação segue; quem chama ignora o erro. */
const pareceUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function anotarAtropelo(cliente, tabela, pk, atual, p) {
  let usuario = null;
  try { usuario = (await cliente.auth.getUser()).data?.user?.email || null; } catch {}
  const id = Array.isArray(pk) ? null : atual?.[pk];
  const depois = { ...p.item }; delete depois._base;
  await cliente.from('jor_auditoria').insert({
    tabela, registro_id: pareceUuid(id) ? id : null, acao: 'conflito_sobrescrito',
    antes: atual, depois,
    justificativa: `Conflito resolvido pela regra "a mais recente vence". Versão do servidor (${atual?.atualizado_em || '?'}) substituída pela gravação de ${new Date(p.em || Date.now()).toISOString()}${id && !pareceUuid(id) ? ` · chave ${id}` : ''}.`,
    usuario,
  });
}

/* Decisões da pessoa sobre um item parado. */
export async function tentarDeNovo(uuid, camada) {
  const p = await itemDaFila(uuid); if (!p) return;
  p.status = 'pendente'; p.tentativas = 0; p.erro = null; p.avisado = false;
  await porFila(p); await contarFila(camada);
}
/** Manter o meu: grava por cima do que está no servidor. */
export async function manterMeu(uuid, camada) {
  const p = await itemDaFila(uuid); if (!p) return;
  p.status = 'pendente'; p.tentativas = 0; p.erro = null; p.avisado = false; p.forcar = true; p.base = null;
  await porFila(p); await contarFila(camada);
}
/** Usar o do servidor / descartar: o item sai da fila; devolve a versão do servidor (se houver) para a camada guardar. */
export async function descartar(uuid, camada) {
  const p = await itemDaFila(uuid);
  await removerDaFila(uuid, camada);
  return p;
}
