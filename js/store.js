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
function criarCliente() {
  if (!window.supabase) return null;
  estado.cliente = window.supabase.createClient(CONEXAO.url, CONEXAO.chave, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'epi.auth' },
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

export async function entrar(email, senha) {
  const { data, error } = await estado.cliente.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  estado.sessao = data.session;
  return data;
}

export async function sair() {
  try { await estado.cliente.auth.signOut(); } catch {}
  estado.sessao = null;
  avisar();
}

/* Esqueci minha senha: manda o e-mail com o link de recuperação.
   O link volta para o próprio app, com um endereço que precisa estar
   liberado no Supabase (Authentication → URL Configuration). */
export async function pedirRecuperacao(email) {
  // sempre a pasta do app, nunca ".../index.html": é um endereço só para
  // liberar na lista do Supabase (Authentication → URL Configuration)
  const volta = location.origin + location.pathname.replace(/index\.html$/, '');
  const { error } = await estado.cliente.auth.resetPasswordForEmail(email, { redirectTo: volta });
  if (error) throw error;
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
