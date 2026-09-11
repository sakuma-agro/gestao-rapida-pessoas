// store.js — Supabase + cache local + fila de envios offline
import { SEED_FUNCIONARIOS, SEED_EPIS, SEED_MODELO } from './seed.js';

const CHAVE_CACHE = 'epi.cache';
const CHAVE_FILA = 'epi.fila';

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
  pendentes: 0,
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
const gravar = (chave, valor) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
};

/* ---------------- conexão ---------------- */
/* A sessão fica em `sessionStorage`, não em `localStorage`: ela morre quando
   a janela do app fecha. Foi pedido — computador desligado tem de voltar
   pedindo senha. O preço é entrar de novo toda vez que fechar o navegador;
   o cache dos dados continua em localStorage, então a abertura é rápida.
   Onde sessionStorage não existir (modo estranho de navegador), o login
   simplesmente não é guardado, que é o lado seguro do erro. */
const guardaDaSessao = () => {
  try {
    sessionStorage.setItem('gr.teste', '1');
    sessionStorage.removeItem('gr.teste');
    return sessionStorage;
  } catch { return undefined; }
};

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
export async function iniciar() {
  carregarCache();
  criarCliente();
  try {
    const { data } = await estado.cliente.auth.getSession();
    estado.sessao = data.session || null;
  } catch { estado.sessao = null; }
  estado.cliente.auth.onAuthStateChange((_evt, sessao) => { estado.sessao = sessao; avisar(); });
  return estado.sessao ? { etapa: 'app' } : { etapa: 'login' };
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
function carregarCache() {
  const c = ler(CHAVE_CACHE, null);
  estado.funcionarios = c?.funcionarios ?? [];
  estado.epis = c?.epis ?? [];
  estado.fichas = c?.fichas ?? [];
  estado.modelo = c?.modelo ?? null;
  estado.pendentes = ler(CHAVE_FILA, []).length;
}

function salvarCache() {
  gravar(CHAVE_CACHE, {
    funcionarios: estado.funcionarios,
    epis: estado.epis,
    fichas: estado.fichas,
    modelo: estado.modelo,
  });
}

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

  estado.funcionarios = f.data || [];
  estado.epis = e.data || [];
  estado.fichas = fi.data || [];
  estado.modelo = m.data || null;

  // Primeira execução: leva os dados da planilha para o banco.
  if (!estado.funcionarios.length && !estado.epis.length && !estado.modelo) {
    await semear();
  } else if (!estado.modelo) {
    estado.modelo = { ...SEED_MODELO };
    await salvarModelo(estado.modelo);
  }
  salvarCache();
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
  estado.funcionarios = r1.data; estado.epis = r2.data; estado.modelo = r3.data;
  salvarCache();
}

/* ---------------- escrita (otimista + fila) ---------------- */
function enfileirar(tabela, acao, dados) {
  const fila = ler(CHAVE_FILA, []);
  fila.push({ tabela, acao, dados, em: Date.now() });
  gravar(CHAVE_FILA, fila);
  estado.pendentes = fila.length;
}

export async function enviarFila() {
  let fila = ler(CHAVE_FILA, []);
  if (!fila.length || !estado.cliente || !estado.sessao) return;
  const restantes = [];
  for (const item of fila) {
    try {
      const q = estado.cliente.from(item.tabela);
      const { error } = item.acao === 'apagar'
        ? await q.delete().eq('id', item.dados.id)
        : await q.upsert(item.dados);
      if (error) throw error;
    } catch { restantes.push(item); }
  }
  gravar(CHAVE_FILA, restantes);
  estado.pendentes = restantes.length;
}

async function gravarRemoto(tabela, acao, dados) {
  if (!estado.cliente || !estado.sessao || !navigator.onLine) { enfileirar(tabela, acao, dados); return false; }
  try {
    const q = estado.cliente.from(tabela);
    const { error } = acao === 'apagar'
      ? await q.delete().eq('id', dados.id)
      : await q.upsert(dados);
    if (error) throw error;
    return true;
  } catch {
    enfileirar(tabela, acao, dados);
    return false;
  }
}

const listaDe = tabela => ({
  funcionarios: 'funcionarios', epis: 'epis', fichas: 'fichas',
}[tabela]);

async function salvarItem(tabela, item) {
  const lista = estado[listaDe(tabela)];
  const i = lista.findIndex(x => x.id === item.id);
  if (i >= 0) lista[i] = { ...lista[i], ...item }; else lista.push(item);
  if (tabela === 'funcionarios') lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  salvarCache(); avisar();
  await gravarRemoto(tabela, 'salvar', item);
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
  estado.modelo = { ...m, id: 1 };
  salvarCache(); avisar();
  await gravarRemoto('modelo', 'salvar', estado.modelo);
  avisar();
}

export function modeloAtual() { return estado.modelo || { ...SEED_MODELO }; }

/* ---------------- rede ---------------- */
addEventListener('online', async () => {
  estado.online = true;
  try { await enviarFila(); } catch {}
  avisar();
});
addEventListener('offline', () => { estado.online = false; avisar(); });
