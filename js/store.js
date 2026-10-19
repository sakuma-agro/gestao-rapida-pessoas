// store.js — Supabase + cache local + fila de envios offline
import { SEED_FUNCIONARIOS, SEED_EPIS, SEED_MODELO } from './seed.js';
import * as nucleo from './nucleo.js';

/* Rodada B (15/10/2026): cache e fila moram no IndexedDB (js/nucleo.js),
   caixa 'epi.cache' e camada 'epi' da fila. localStorage fica só para flags. */
const CAIXA = 'epi.cache';
const CAMADA = 'epi';

// Projeto Supabase da SAKUMA. A chave "publishable" é feita para ficar
// visível no navegador: quem protege os dados são as regras de acesso
// (RLS) do supabase.sql, que só liberam leitura e escrita para quem está
// logado. Sem login, esta chave não enxerga nada.
// Para apontar o app para outro projeto, troque estes dois valores.
export const CONEXAO = {
  url: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co',
  chave: 'sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn',
};

export const estado = {
  cliente: null,
  sessao: null,
  funcionarios: [],
  epis: [],
  fichas: [],
  modelo: null,
  online: navigator.onLine,
  pendentes: 0,      // fila do EPI (esta camada)
  pendentesTotal: 0, // todas as filas do app (DP, Reunião, anexos, molduras) — ver app.js
};

const ouvintes = new Set();
export const aoMudar = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => ouvintes.forEach(fn => fn());

/* ---------------- utilidades ---------------- */
export const novoId = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

const ler = (chave, padrao) => {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; }
  catch { return padrao; }
};
/* Armazenamento cheio (15/10/2026, rodada A). O localStorage tem ~5 MB por
   site, divididos entre todas as áreas. Antes, estourada a cota, o setItem
   falhava em silêncio — e a FILA de envio deixava de ser gravada: o lançamento
   sumia ao fechar a aba sem ninguém saber. Agora a falha vira um aviso na
   tela (evento 'gr:armazenamento-cheio', ouvido pelo app.js). */
export const armazenamento = { cheio: false, chave: null };
export function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    if (armazenamento.cheio && armazenamento.chave === chave) { armazenamento.cheio = false; dispatchEvent(new Event('gr:armazenamento-ok')); }
    return true;
  } catch (e) {
    armazenamento.cheio = true; armazenamento.chave = chave;
    try { dispatchEvent(new CustomEvent('gr:armazenamento-cheio', { detail: { chave, erro: String(e?.name || e) } })); } catch {}
    return false;
  }
}
const gravar = gravarLocal;

/* ---------------- conexão ---------------- */
/* Onde a sessão fica (10/10/2026).
   Padrão: `sessionStorage` — morre quando a janela do app fecha. Foi pedido:
   computador desligado tem de voltar pedindo senha.
   Exceção: quem marca "Manter conectado neste aparelho" no login tem a sessão
   em `localStorage` e volta a abrir o app já dentro. A escolha é POR APARELHO
   (marca 'gr.manter' no localStorage), para o tablet de uso pessoal não
   obrigar o computador do escritório a fazer o mesmo. "Sair" apaga a sessão
   dos dois lugares — é o jeito de trancar um aparelho que ficou conectado.
   A senha nunca é guardada: só o token que o Supabase já guardaria. */
const MANTER = 'gr.manter';
export function manterConectado() {
  try { return localStorage.getItem(MANTER) === '1'; } catch { return false; }
}
export function definirManter(sim) {
  try { sim ? localStorage.setItem(MANTER, '1') : localStorage.removeItem(MANTER); } catch {}
}
const tentar = fn => { try { return fn(); } catch { return null; } };
const guardaDaSessao = () => ({
  getItem: k => tentar(() => sessionStorage.getItem(k))
             ?? (manterConectado() ? tentar(() => localStorage.getItem(k)) : null),
  setItem: (k, v) => {
    if (manterConectado()) {
      tentar(() => localStorage.setItem(k, v));
      tentar(() => sessionStorage.removeItem(k));
    } else {
      tentar(() => sessionStorage.setItem(k, v));
      tentar(() => localStorage.removeItem(k));
    }
  },
  removeItem: k => {
    tentar(() => sessionStorage.removeItem(k));
    tentar(() => localStorage.removeItem(k));
  },
});

/* A sessão morava em localStorage sob 'epi.auth'. Mudou de lugar, mas a
   antiga ficaria lá para sempre — um token de acesso esquecido no navegador é
   exatamente o que esta mudança quis eliminar. Então some com ela na primeira
   abertura. */
function limparSessaoAntiga() {
  try { localStorage.removeItem('epi.auth'); } catch {}
}

function criarCliente() {
  if (!window.supabase) return null;
  limparSessaoAntiga();
  estado.cliente = window.supabase.createClient(CONEXAO.url, CONEXAO.chave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'gr.auth',
      storage: guardaDaSessao(),
    },
  });
  return estado.cliente;
}

/* ---------------- sessão ---------------- */
/* Sessão guardada no aparelho (19/10/2026). Só existe em localStorage quando
   a pessoa marcou "Manter conectado". É o que permite abrir o app sem sinal:
   o token pode estar vencido, mas a pessoa continua sendo quem é — e sem rede
   nada sai do aparelho de qualquer jeito. */
export function sessaoGuardada() {
  if (!manterConectado()) return null;
  const v = tentar(() => localStorage.getItem('gr.auth'));
  if (!v) return null;
  try { const s = JSON.parse(v); return s && s.access_token && s.user ? s : null; }
  catch { return null; }
}

/* Entrar sem rede. Quando o sinal voltar o supabase-js renova o token sozinho
   (autoRefreshToken) e avisa pelo onAuthStateChange. */
export function entrarSemRede() {
  const s = sessaoGuardada();
  if (!s) return false;
  estado.sessao = s;
  avisar();
  return true;
}

export async function iniciar() {
  await nucleo.migrarDoLocalStorage({ 'epi.cache': CAIXA, 'epi.fila': { camada: CAMADA }, 'jor.cache': 'jor.cache', 'jor.fila': { camada: 'jor' } });
  await carregarCache();
  criarCliente();
  /* getSession() renova o token pela rede quando ele venceu. Sem sinal (ou com
     sinal fraco que não responde), isso falha ou fica pendurado. Então: até
     6 segundos; se não vier, usa a sessão guardada no aparelho. Antes, a
     pessoa com "Manter conectado" caía na tela de login no meio do campo —
     e offline não dá para entrar. */
  try {
    const r = await Promise.race([
      estado.cliente.auth.getSession(),
      new Promise(ok => setTimeout(() => ok(null), 6000)),
    ]);
    estado.sessao = (r && r.data && r.data.session) || null;
  } catch { estado.sessao = null; }
  let semRede = false;
  if (!estado.sessao && (!navigator.onLine || sessaoGuardada())) {
    semRede = entrarSemRede();
  }
  estado.cliente.auth.onAuthStateChange((_evt, sessao) => {
    /* Sem rede, o supabase-js pode responder "sem sessão" a um refresh que
       não chegou ao servidor. Não derruba quem entrou com a sessão guardada. */
    if (!sessao && _evt !== 'SIGNED_OUT' && sessaoGuardada()) return;
    estado.sessao = sessao; avisar();
  });
  return estado.sessao ? { etapa: 'app', semRede } : { etapa: 'login' };
}

const pareceEmail = v => /@/.test(String(v || ''));

/* Entra pelo nome de login ou pelo e-mail — os dois servem.
   Com e-mail, é o caminho direto do Supabase. Com nome, quem traduz é a
   função 'entrar' no servidor: a tabela que liga nome e e-mail só é legível
   para quem já está logado, e o e-mail de ninguém pode vazar para quem chuta
   nomes. Por isso ela devolve a sessão pronta, não o e-mail. */
export async function entrar(login, senha) {
  const quem = String(login || '').trim();

  if (pareceEmail(quem)) {
    const { data, error } = await estado.cliente.auth
      .signInWithPassword({ email: quem.toLowerCase(), password: senha });
    if (error) throw error;
    estado.sessao = data.session;
    return data;
  }

  const { data, error } = await estado.cliente.functions.invoke('entrar', {
    body: { usuario: quem.toLowerCase(), senha },
  });
  if (error && !data?.erro) throw new Error('Não consegui falar com o servidor de login.');
  if (data?.erro) throw new Error(data.erro);

  const { data: sessao, error: erroSessao } = await estado.cliente.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (erroSessao) throw erroSessao;
  estado.sessao = sessao.session;
  return sessao;
}

export async function sair() {
  try { await estado.cliente.auth.signOut(); } catch {}
  estado.sessao = null;
  avisar();
}

/* Esqueci minha senha: manda o e-mail com o link de recuperação.
   O link volta para o próprio app, com um endereço que precisa estar
   liberado no Supabase (Authentication → URL Configuration). */
export async function pedirRecuperacao(login) {
  // sempre a pasta do app, nunca ".../index.html": é um endereço só para
  // liberar na lista do Supabase (Authentication → URL Configuration)
  const volta = location.origin + location.pathname.replace(/index\.html$/, '');
  const quem = String(login || '').trim();

  if (pareceEmail(quem)) {
    const { error } = await estado.cliente.auth
      .resetPasswordForEmail(quem.toLowerCase(), { redirectTo: volta });
    if (error) throw error;
    return;
  }

  /* Pelo nome, quem sabe o e-mail é o servidor. Ele responde "ok" ache ou
     não ache — a tela já diz "se existir, a mensagem está a caminho", e
     assim ninguém descobre quais logins existem. */
  const { data, error } = await estado.cliente.functions.invoke('entrar', {
    body: { acao: 'recuperar', usuario: quem.toLowerCase(), volta },
  });
  if (error && !data?.ok) throw new Error('Não consegui falar com o servidor de login.');
}

/* Grava a senha nova. Só funciona com a sessão temporária que vem do link. */
export async function trocarSenha(senha) {
  const { data, error } = await estado.cliente.auth.updateUser({ password: senha });
  if (error) throw error;
  return data;
}

/* ---------------- cache ---------------- */
async function carregarCache() {
  const c = await nucleo.lerCaixa(CAIXA, null);
  estado.funcionarios = c?.funcionarios ?? [];
  estado.epis = c?.epis ?? [];
  estado.fichas = c?.fichas ?? [];
  estado.modelo = c?.modelo ?? null;
  estado.pendentes = (await nucleo.contarFila(CAMADA)).pendentes;
}

function salvarCache() {
  nucleo.gravarCaixa(CAIXA, {
    funcionarios: estado.funcionarios,
    epis: estado.epis,
    fichas: estado.fichas,
    modelo: estado.modelo,
  });
}
/* O carimbo do servidor viaja em `_base`: é com ele que a gravação confere se
   alguém mexeu no registro desde a leitura (ver nucleo.gravarRegistro). */
const comBase = lista => (lista || []).map(r => ({ ...r, _base: r.atualizado_em ?? null }));
nucleo.aoMudarFila(() => { estado.pendentes = nucleo.pendentes(CAMADA); estado.parados = nucleo.parados(CAMADA); avisar(); });

/* ---------------- leitura ---------------- */
export async function sincronizar() {
  if (!estado.cliente || !estado.sessao) return;
  await enviarFila();
  const [f, e, fi, m] = await Promise.all([
    estado.cliente.from('funcionarios').select('*').order('nome'),
    estado.cliente.from('epis').select('*').order('descricao'),
    estado.cliente.from('fichas').select('*'),
    estado.cliente.from('modelo').select('*').eq('id', 1).maybeSingle(),
  ]);
  const erro = f.error || e.error || fi.error || m.error;
  if (erro) throw erro;

  estado.funcionarios = comBase(f.data);
  estado.epis = comBase(e.data);
  estado.fichas = comBase(fi.data);
  estado.modelo = m.data ? { ...m.data, _base: m.data.atualizado_em ?? null } : null;

  // Primeira execução: leva os dados da planilha para o banco — só com a
  // pessoa confirmando (rodada C): um login que por engano enxergasse zero
  // linhas não pode encher o cadastro com a planilha-semente sozinho.
  if (!estado.funcionarios.length && !estado.epis.length && !estado.modelo) {
    if (confirm('O cadastro no servidor está vazio. Carregar os dados iniciais da planilha?')) await semear();
  } else if (!estado.modelo) {
    estado.modelo = { ...SEED_MODELO };
    await salvarModelo(estado.modelo);
  }
  salvarCache();
  nucleo.gravarMeta('ultima_sinc', new Date().toISOString());
  avisar();
}

export async function semear() {
  const modelo = { ...SEED_MODELO };
  const funcs = SEED_FUNCIONARIOS.map(f => ({ ...f }));
  const epis = SEED_EPIS.map(e => ({ ...e }));
  const r1 = await estado.cliente.from('funcionarios').upsert(funcs).select();
  if (r1.error) throw r1.error;
  const r2 = await estado.cliente.from('epis').upsert(epis).select();
  if (r2.error) throw r2.error;
  const r3 = await estado.cliente.from('modelo').upsert(modelo).select().single();
  if (r3.error) throw r3.error;
  estado.funcionarios = comBase(r1.data); estado.epis = comBase(r2.data); estado.modelo = { ...r3.data, _base: r3.data.atualizado_em ?? null };
  salvarCache();
}

/* ---------------- escrita (otimista + fila) ----------------
   Rodada B: toda gravação passa pela fila do núcleo, mesmo com rede — assim
   o caminho é um só (ordem garantida, conflito conferido, erro visível). */
const listaDe = tabela => ({
  funcionarios: 'funcionarios', epis: 'epis', fichas: 'fichas',
}[tabela]);

/* O que o núcleo precisa saber desta camada. */
const CAMADA_DEF = {
  tabelaDe: c => c,
  chaveDe: () => 'id',
  paraBanco: (c, item) => item,
  cliente: () => estado.cliente,
  podeEnviar: () => !!(estado.cliente && estado.sessao && navigator.onLine),
  aoEnviado: (tabela, salvo) => {
    // Só o carimbo: o resto do registro local pode já ter edição mais nova.
    const lista = tabela === 'modelo' ? null : estado[listaDe(tabela)];
    const alvo = lista ? lista.find(x => x.id === salvo.id) : estado.modelo;
    if (alvo) { alvo.atualizado_em = salvo.atualizado_em; alvo._base = salvo.atualizado_em; salvarCache(); }
  },
};
export const enviarFila = () => nucleo.enviarFila(CAMADA, CAMADA_DEF);

async function gravarRemoto(tabela, acao, dados, base) {
  await nucleo.adicionarNaFila(CAMADA, { colecao: tabela, acao, item: dados, base });
  if (CAMADA_DEF.podeEnviar()) { try { await enviarFila(); } catch {} }
  return nucleo.pendentes(CAMADA) === 0;
}

async function salvarItem(tabela, item) {
  const lista = estado[listaDe(tabela)];
  const i = lista.findIndex(x => x.id === item.id);
  const base = i >= 0 ? (lista[i]._base ?? null) : null;
  if (i >= 0) lista[i] = { ...lista[i], ...item, _base: base }; else lista.push({ ...item, _base: null });
  if (tabela === 'funcionarios') lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  salvarCache(); avisar();
  await gravarRemoto(tabela, 'salvar', item, base);
  avisar();
  return item;
}

async function apagarItem(tabela, id) {
  const nome = listaDe(tabela);
  estado[nome] = estado[nome].filter(x => x.id !== id);
  salvarCache(); avisar();
  await gravarRemoto(tabela, 'apagar', { id });
  avisar();
}

export const salvarFuncionario = f => salvarItem('funcionarios', f);
export const apagarFuncionario = id => apagarItem('funcionarios', id);
export const salvarEpi = e => salvarItem('epis', e);
export const apagarEpi = id => apagarItem('epis', id);
export const salvarFicha = f => salvarItem('fichas', f);
export const apagarFicha = id => apagarItem('fichas', id);

export async function salvarModelo(m) {
  const base = estado.modelo?._base ?? null;
  estado.modelo = { ...m, id: 1, _base: base };
  salvarCache(); avisar();
  await gravarRemoto('modelo', 'salvar', { ...m, id: 1 }, base);
  avisar();
}

export function modeloAtual() { return estado.modelo || { ...SEED_MODELO }; }

/* ---------------- rede ---------------- */
addEventListener('online', async () => {
  estado.online = true;
  try { await enviarFila(); } catch {}
  avisar();
});
/* Rodada B: fila com algo pendente tenta de novo ao voltar para a tela e a cada 2 min. */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && nucleo.pendentes(CAMADA)) enviarFila().catch(() => {}); });
setInterval(() => { if (nucleo.pendentes(CAMADA) - nucleo.parados(CAMADA) > 0) enviarFila().catch(() => {}); }, 2 * 60 * 1000);
addEventListener('offline', () => { estado.online = false; avisar(); });
