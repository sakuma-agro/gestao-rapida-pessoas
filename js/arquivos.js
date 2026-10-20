// arquivos.js — anexos do LOP - Gestão Rápida no Google Drive (15/10/2026).
//
// Pedido do Guilherme: foto do funcionário, certificado de treinamento, ASO e
// exames, e o arquivo dos documentos da Certificação vão para o Google Drive
// (conta escritoriosakuma1), não para o Supabase. No banco fica só uma linha
// por arquivo (public.arquivos); quem conversa com o Google é a função
// "arquivos" do Supabase, que guarda a autorização do Drive no servidor.
//
// Sem internet o app continua: o arquivo escolhido fica guardado no aparelho
// (IndexedDB) e sobe sozinho quando a conexão volta — um por vez.
//
// Uso num diálogo:
//   const campo = campoAnexos($('meuDiv'), { area: 'pessoas', tipo: 'treinamento', rotulo: 'Certificado' });
//   campo.abrir(idDoRegistro)            // ao abrir o diálogo (null = registro novo)
//   await campo.salvar(idDoRegistro)     // depois de gravar o registro
import { estado, CONEXAO } from './store.js';

const FUNCAO = () => `${CONEXAO.url}/functions/v1/arquivos`;
const MAX_BYTES = 15 * 1024 * 1024;
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/* ---------------- fila no aparelho (IndexedDB) ---------------- */
let _db = null;
function banco() {
  if (_db) return _db;
  _db = new Promise((ok, falha) => {
    const r = indexedDB.open('gr-arquivos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fila', { keyPath: 'chave' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  return _db;
}
async function fila(modo = 'readonly') { return (await banco()).transaction('fila', modo).objectStore('fila'); }
const promessa = req => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error); });

async function pendentes() { try { return await promessa((await fila()).getAll()); } catch { return []; } }
async function porNaFila(item) { await promessa((await fila('readwrite')).put(item)); }
async function tirarDaFila(chave) { await promessa((await fila('readwrite')).delete(chave)); }

/** Quantos arquivos esperam para subir (para mostrar na tela). */
export async function contarPendentes() { return (await pendentes()).length; }

/* ---------------- conversa com a função ---------------- */
async function token() {
  const { data } = await estado.cliente.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('sem-login');
  return t;
}
async function chamar(acao, chave, init = {}, extra = '') {
  const r = await fetch(`${FUNCAO()}?acao=${acao}&chave=${encodeURIComponent(chave)}${extra}`, {
    ...init, headers: { Authorization: `Bearer ${await token()}`, apikey: CONEXAO.chave, ...(init.headers || {}) },
  });
  return r;
}

const ERROS = {
  'drive-nao-configurado': 'O Google Drive ainda não foi autorizado no servidor. O arquivo fica guardado aqui e sobe quando for.',
  'drive-autorizacao-expirou': 'A autorização do Google Drive expirou. O arquivo fica guardado aqui e sobe quando for renovada.',
  'sem-acesso': 'Seu login não tem permissão para anexar aqui.',
  'grande-demais': 'Arquivo grande demais (máximo 15 MB).',
  'tipo-invalido': 'Só dá para anexar PDF ou foto (JPG, PNG, WEBP).',
};

let enviando = false;
/** Sobe o que estiver na fila. Chamado ao gravar, ao abrir o app e quando a internet volta. */
export async function enviarPendentes() {
  if (enviando || !navigator.onLine || !estado.cliente || !estado.sessao) return;
  enviando = true;
  try {
    for (const it of await pendentes()) {
      try {
        let r;
        if (it.acao === 'apagar') {
          r = await chamar('apagar', it.chave, { method: 'POST' });
          if (r.ok || r.status === 404) { await tirarDaFila(it.chave); continue; }
        } else {
          r = await chamar('enviar', it.chave, { method: 'POST', headers: { 'Content-Type': it.mime }, body: it.blob },
            `&nome=${encodeURIComponent(it.nome)}`);
          if (r.ok) { await tirarDaFila(it.chave); avisarMudanca(it); continue; }
        }
        const d = await r.json().catch(() => ({}));
        // Erro que não se resolve tentando de novo: tira da fila e avisa.
        if (r.status === 403 || r.status === 413 || r.status === 415 || r.status === 400) {
          await tirarDaFila(it.chave);
          alert(`Não consegui anexar "${it.nome}": ${ERROS[d.erro] || d.erro || r.status}`);
          continue;
        }
        it.erro = d.erro || String(r.status);
        await porNaFila(it);
        break;                                  // Drive fora ou sem autorização: tenta depois
      } catch (e) { break; }                    // caiu a conexão: tenta depois
    }
  } finally {
    enviando = false;
    avisarMudanca();
  }
}
window.addEventListener('online', () => enviarPendentes());
setInterval(() => enviarPendentes(), 120000);

const ouvintes = new Set();
function avisarMudanca(item) { ouvintes.forEach(fn => { try { fn(item); } catch {} }); }

/* ---------------- preparar o arquivo ---------------- */
async function comprimirFoto(arquivo, larguraMax = 1600) {
  try {
    const bmp = await createImageBitmap(arquivo);
    const escala = Math.min(1, larguraMax / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * escala); cv.height = Math.round(bmp.height * escala);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
    return b && b.size < arquivo.size ? b : (arquivo.type === 'image/jpeg' ? arquivo : b || arquivo);
  } catch { return arquivo; }
}
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
function nomeDeChave(nome, ext) {
  const base = semAcento(nome).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
  return `${Date.now().toString(36)}-${base}.${ext}`;
}
async function preparar(arquivo) {
  const ehPdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
  const ehImg = /^image\//.test(arquivo.type);
  if (!ehPdf && !ehImg) throw new Error(ERROS['tipo-invalido']);
  if (ehPdf) {
    if (arquivo.size > MAX_BYTES) throw new Error(ERROS['grande-demais']);
    return { blob: arquivo, mime: 'application/pdf', ext: 'pdf', nome: arquivo.name };
  }
  const blob = await comprimirFoto(arquivo);
  if (blob.size > MAX_BYTES) throw new Error(ERROS['grande-demais']);
  const mime = blob.type || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { blob, mime, ext, nome: arquivo.name.replace(/\.[^.]+$/, '') + '.' + ext };
}

/* ---------------- abrir um arquivo ---------------- */
const cacheUrl = new Map();
/** Devolve um endereço local (blob:) do arquivo — da fila do aparelho ou do Drive. */
export async function urlDoArquivo(chave) {
  if (cacheUrl.has(chave)) return cacheUrl.get(chave);
  const local = (await pendentes()).find(x => x.chave === chave && x.acao !== 'apagar');
  let blob = local?.blob;
  if (!blob) {
    const r = await chamar('ver', chave);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(r.status === 410 ? 'O arquivo não está mais no Drive.' : ERROS[d.erro] || 'Não consegui abrir o arquivo.');
    }
    blob = await r.blob();
  }
  const u = URL.createObjectURL(blob);
  cacheUrl.set(chave, u);
  return u;
}
export async function abrirArquivo(chave) {
  const janela = window.open('', '_blank');     // abre já no clique, senão o celular bloqueia
  try {
    const u = await urlDoArquivo(chave);
    if (janela) janela.location.href = u; else location.href = u;
  } catch (e) {
    janela?.close();
    alert(navigator.onLine ? e.message : 'Sem internet: o arquivo abre quando a conexão voltar.');
  }
}

/* ---------------- lista de arquivos de um registro ---------------- */
const CACHE_LISTA = 'gr.arquivos.lista';
function lerCacheLista() { try { return JSON.parse(localStorage.getItem(CACHE_LISTA) || '{}'); } catch { return {}; } }
function gravarCacheLista(k, v) { try { const c = lerCacheLista(); c[k] = v; localStorage.setItem(CACHE_LISTA, JSON.stringify(c)); } catch {} }

export async function listarArquivos(area, tipo, dono) {
  const k = `${area}/${tipo}/${dono}`;
  let lista = lerCacheLista()[k] || [];
  if (navigator.onLine && estado.cliente) {
    const { data, error } = await estado.cliente.from('arquivos')
      .select('chave,nome,mime,tamanho,criado_em').eq('area', area).eq('tipo', tipo).eq('dono_id', String(dono))
      .order('criado_em');
    if (!error) { lista = data || []; gravarCacheLista(k, lista); }
  }
  const fila = (await pendentes()).filter(x => x.chave.startsWith(k + '/'));
  const apagando = new Set(fila.filter(x => x.acao === 'apagar').map(x => x.chave));
  lista = lista.filter(x => !apagando.has(x.chave));
  fila.filter(x => x.acao !== 'apagar' && !lista.some(y => y.chave === x.chave))
    .forEach(x => lista.push({ chave: x.chave, nome: x.nome, mime: x.mime, tamanho: x.blob.size, naFila: true }));
  return lista;
}

/** Chave da foto de cada dono, num pedido só (para a folha de aniversariantes
    com foto). Devolve Map dono_id → chave; quem não tem foto não entra.
    Sem internet, vale o que ficou guardado da última vez mais a fila local. */
export async function fotosDe(area, tipo, ids) {
  const k = `fotos:${area}/${tipo}`;
  const mapa = lerCacheLista()[k] || {};
  const pedidos = [...new Set(ids.map(String))];
  if (navigator.onLine && estado.cliente && pedidos.length) {
    const { data, error } = await estado.cliente.from('arquivos').select('dono_id,chave')
      .eq('area', area).eq('tipo', tipo).in('dono_id', pedidos);
    if (!error) {
      pedidos.forEach(id => { delete mapa[id]; });      // foto tirada some do cache
      (data || []).forEach(x => { mapa[x.dono_id] = x.chave; });
      gravarCacheLista(k, mapa);
    }
  }
  const fila = await pendentes();
  const apagando = new Set(fila.filter(x => x.acao === 'apagar').map(x => x.chave));
  const saida = new Map();
  pedidos.forEach(id => {
    const naFila = fila.find(x => x.acao !== 'apagar' && x.chave.startsWith(`${area}/${tipo}/${id}/`));
    const chave = naFila ? naFila.chave : mapa[id];
    if (chave && !apagando.has(chave)) saida.set(id, chave);
  });
  return saida;
}

/** Donos (ids) que têm pelo menos um arquivo — para marcar 📎 nas listas. */
export async function donosComArquivo(area, tipo) {
  const k = `donos:${area}/${tipo}`;
  let ids = lerCacheLista()[k] || [];
  if (navigator.onLine && estado.cliente) {
    const { data, error } = await estado.cliente.from('arquivos').select('dono_id').eq('area', area).eq('tipo', tipo);
    if (!error) { ids = [...new Set((data || []).map(x => x.dono_id))]; gravarCacheLista(k, ids); }
  }
  return new Set(ids);
}

/* ---------------- o campo de anexos ---------------- */
const normDono = id => String(id).toLowerCase().replace(/[^\w.-]/g, '_').slice(0, 80);
/**
 * Desenha o campo de anexos dentro de `el`.
 * opções: area, tipo, rotulo, dica, foto (true = uma foto só, com miniatura — foto do funcionário)
 */
export function campoAnexos(el, { area, tipo, rotulo = 'Anexos', dica = 'PDF ou foto', foto = false }) {
  let dono = null, existentes = [], novos = [], tirar = new Set(), geracao = 0;

  el.classList.add('anx');
  el.innerHTML = `
    <div class="anx-topo">
      <span class="anx-rot">${esc(rotulo)} <small>${esc(dica)} · vai para o Google Drive</small></span>
      <label class="btn mini anx-botao">${foto ? '📷 Foto' : '📎 Anexar'}
        <input type="file" hidden accept="${foto ? 'image/*' : 'application/pdf,image/*'}" ${foto ? '' : 'multiple'}></label>
    </div>
    ${foto ? '<div class="anx-foto"><img alt="" hidden><span class="anx-semfoto">Sem foto</span></div>' : ''}
    <ul class="anx-lista"></ul>
    <p class="anx-aviso" hidden></p>`;
  const entrada = el.querySelector('input[type=file]');
  const ul = el.querySelector('.anx-lista');
  const aviso = el.querySelector('.anx-aviso');
  const img = el.querySelector('.anx-foto img');
  const semFoto = el.querySelector('.anx-semfoto');

  const mostrarAviso = t => { aviso.textContent = t || ''; aviso.hidden = !t; };

  async function desenhar() {
    const vis = existentes.filter(x => !tirar.has(x.chave));
    const linhas = [
      ...vis.map(x => `<li><button type="button" class="anx-nome" data-ver="${esc(x.chave)}">${esc(x.nome)}</button>
        <small>${x.tamanho ? kb(x.tamanho) : ''}${x.naFila ? ' · aguardando envio' : ''}</small>
        <button type="button" class="anx-x" data-tirar="${esc(x.chave)}" title="Remover">✕</button></li>`),
      ...novos.map((x, i) => `<li class="anx-novo"><span class="anx-nome">${esc(x.nome)}</span>
        <small>${kb(x.blob.size)} · sobe ao salvar</small>
        <button type="button" class="anx-x" data-tirarnovo="${i}" title="Tirar">✕</button></li>`),
    ];
    ul.innerHTML = foto ? '' : linhas.join('') || '<li class="anx-vazio">Nenhum arquivo.</li>';
    if (foto) {
      const nova = novos[0];
      const atual = vis[0];
      let u = '';
      if (nova) u = URL.createObjectURL(nova.blob);
      else if (atual) { try { u = await urlDoArquivo(atual.chave); } catch { u = ''; } }
      img.hidden = !u; if (u) img.src = u;
      semFoto.hidden = !!u;
      semFoto.textContent = atual && !u ? 'Foto no Drive (sem internet para mostrar)' : 'Sem foto';
      ul.innerHTML = (nova || atual) ? `<li><small>${nova ? 'foto nova · sobe ao salvar' : atual.naFila ? 'aguardando envio' : ''}</small>
        <button type="button" class="anx-x" ${nova ? 'data-tirarnovo="0"' : `data-tirar="${esc(atual.chave)}"`}>Remover foto</button></li>` : '';
    }
  }

  ul.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.ver) abrirArquivo(b.dataset.ver);
    else if (b.dataset.tirar) { tirar.add(b.dataset.tirar); desenhar(); }
    else if (b.dataset.tirarnovo != null) { novos.splice(Number(b.dataset.tirarnovo), 1); desenhar(); }
  });
  img?.addEventListener('click', () => { const a = existentes.find(x => !tirar.has(x.chave)); if (a && !novos.length) abrirArquivo(a.chave); });

  entrada.addEventListener('change', async () => {
    mostrarAviso('');
    for (const arq of [...entrada.files]) {
      try {
        const p = await preparar(arq);
        if (foto) { novos = [p]; existentes.forEach(x => tirar.add(x.chave)); }
        else novos.push(p);
      } catch (e) { mostrarAviso(`${arq.name}: ${e.message}`); }
    }
    entrada.value = '';
    desenhar();
  });

  return {
    /** Prepara o campo para um registro (null = novo, ainda sem id). */
    async abrir(id) {
      const g = ++geracao;
      dono = id == null ? null : normDono(id);
      existentes = []; novos = []; tirar = new Set(); mostrarAviso('');
      await desenhar();
      if (dono) {
        const l = await listarArquivos(area, tipo, dono).catch(() => []);
        if (g !== geracao) return;
        existentes = l; await desenhar();
        if (!navigator.onLine) mostrarAviso('Sem internet: os anexos podem estar desatualizados.');
      }
    },
    /** Tem algo para gravar? */
    get mudou() { return novos.length > 0 || tirar.size > 0; },
    /** Grava depois do registro: põe na fila do aparelho e manda subir. */
    async salvar(id) {
      if (id == null) return;
      const d = normDono(id);
      for (const ch of tirar) await porNaFila({ chave: ch, acao: 'apagar', nome: '' });
      for (const x of novos) {
        const chave = `${area}/${tipo}/${d}/${foto ? 'foto.' + x.ext : nomeDeChave(x.nome, x.ext)}`;
        cacheUrl.delete(chave);
        await porNaFila({ chave, acao: 'enviar', nome: x.nome, mime: x.mime, blob: x.blob, criado: Date.now() });
      }
      // a lista local já reflete a mudança, mesmo antes de subir
      const k = `${area}/${tipo}/${d}`;
      const c = lerCacheLista()[k] || [];
      gravarCacheLista(k, c.filter(x => !tirar.has(x.chave)));
      novos = []; tirar = new Set();
      enviarPendentes();
    },
  };
}

/* sobe o que ficou pendente assim que o app abre logado */
setTimeout(() => enviarPendentes(), 5000);
export const aoMudarArquivos = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
