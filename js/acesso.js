// acesso.js — quem entra vê o quê
// A lista fica na tabela app_usuarios. Quem é administrador enxerga tudo
// e pode mexer nesta lista; os outros só leem a própria linha.
import { estado } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Os módulos do app. Para criar um módulo novo no futuro, basta acrescentar
   um item aqui (com as telas que já existirem no index.html) — o menu, a tela
   de configurações e as permissões passam a enxergá-lo sozinhos. */
export const MODULOS = [
  { id: 'pessoas', nome: 'Funcionários', telas: [
    ['funcionarios', 'Cadastro'],
    ['aniversarios', 'Aniversariantes'],
  ] },
  { id: 'epis', nome: 'EPIs', telas: [
    ['fichas', 'Fichas'],
    ['epis', 'Tipos de EPI'],
    ['modelo', 'Modelo da ficha'],
  ] },
  { id: 'certificacao', nome: 'Certificação', telas: [
    ['lista', 'Lista de presença'],
  ] },
  { id: 'rh', nome: 'RH', telas: [
    ['disc', 'DISC'],
  ] },
  { id: 'jornada', nome: 'DP', telas: [
    ['jorPainel',       'Painel'],
    ['jorLancar',       'Lançar boletim'],
    ['jorBoletins',     'Boletins'],
    ['jorFuncionarios', 'Funcionários'],
    ['jorFechamento',   'Fechamento'],
    ['jorRelatorios',   'Relatórios'],
    ['jorConfig',       'Configurações'],
  ] },
];

export const moduloDe = tela =>
  MODULOS.find(m => m.telas.some(([t]) => t === tela))?.id || null;

// Quem ainda não estiver na lista entra com estes módulos — assim ninguém
// fica trancado do lado de fora; RH e Configurações ficam sempre de fora.
const PADRAO = ['pessoas', 'epis', 'certificacao'];

export const acesso = { email: '', admin: false, modulos: [...PADRAO], carregado: false };
let usuarios = [];
let editando = null;

export const pode = m => acesso.admin || acesso.modulos.includes(m);

export async function carregarAcesso() {
  acesso.email = (estado.sessao?.user?.email || '').toLowerCase();
  try {
    const { data, error } = await estado.cliente
      .from('app_usuarios').select('*').order('email');
    if (error) throw error;
    usuarios = data || [];
    const meu = usuarios.find(u => (u.email || '').toLowerCase() === acesso.email);
    acesso.admin = !!meu?.admin;
    acesso.modulos = meu ? (meu.modulos || []) : [...PADRAO];
  } catch {
    acesso.admin = false;
    acesso.modulos = [...PADRAO];
  }
  acesso.carregado = true;
  return acesso;
}

/* =============== menu =============== */
let aoTrocar = () => {};
let moduloAberto = null;

export const modulosLiberados = () => MODULOS.filter(m => pode(m.id));

/** Monta o menu com o que a pessoa pode ver e abre o primeiro módulo. */
export function montarMenu(callback) {
  if (callback) aoTrocar = callback;
  const libs = modulosLiberados();

  $('navModulos').innerHTML = libs.map(m =>
    `<button class="aba" role="tab" data-modulo="${m.id}" aria-selected="false">${m.nome}</button>`).join('')
    + (acesso.admin
      ? '<button class="aba" role="tab" data-modulo="config" aria-selected="false">Configurações</button>'
      : '');

  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.addEventListener('click', () => abrirModulo(b.dataset.modulo)));

  abrirModulo(libs[0]?.id || (acesso.admin ? 'config' : null));
}

export function abrirModulo(id, tela) {
  if (!id) return;
  moduloAberto = id;
  $('navModulos').querySelectorAll('.aba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.modulo === id)));

  if (id === 'config') {
    $('navTelas').hidden = true;
    aoTrocar('config');
    return;
  }

  const m = MODULOS.find(x => x.id === id);
  if (!m) return;
  const alvo = m.telas.some(([t]) => t === tela) ? tela : m.telas[0][0];

  // com uma tela só, o módulo não precisa de submenu
  $('navTelas').hidden = m.telas.length < 2;
  $('navTelas').innerHTML = m.telas.map(([t, rot]) =>
    `<button class="aba2" role="tab" data-tela="${t}" aria-selected="${t === alvo}">${rot}</button>`).join('');
  $('navTelas').querySelectorAll('.aba2').forEach(b =>
    b.addEventListener('click', () => {
      $('navTelas').querySelectorAll('.aba2').forEach(x =>
        x.setAttribute('aria-selected', String(x === b)));
      aoTrocar(b.dataset.tela);
    }));

  aoTrocar(alvo);
}

/* =============== tela de configurações =============== */
export function desenharConfig() {
  const aviso = $('cfAviso');
  if (!acesso.admin) {
    aviso.textContent = 'Só quem é administrador mexe nesta lista.';
    aviso.hidden = false;
    $('cfTabela').innerHTML = '';
    return;
  }
  aviso.hidden = true;

  $('cfTabela').innerHTML = usuarios.length ? `
    <table class="dc-planilha cf-tab"><thead><tr>
      <th>Pessoa</th><th class="ce">Admin</th>
      ${MODULOS.map(m => `<th class="ce">${esc(m.nome)}</th>`).join('')}
      <th></th>
    </tr></thead><tbody>${usuarios.map(u => {
      const eu = (u.email || '').toLowerCase() === acesso.email;
      return `<tr>
        <td>
          <b>${esc(u.nome || u.email)}</b>${eu ? ' <span class="tag ativo">você</span>' : ''}
          <br><span class="dc-sem">${esc(u.email)}</span>
        </td>
        <td class="ce"><input type="checkbox" class="cf-cx" data-email="${esc(u.email)}"
          data-campo="admin" ${u.admin ? 'checked' : ''} ${eu ? 'disabled title="Você não pode tirar o próprio acesso de administrador"' : ''}></td>
        ${MODULOS.map(m => `<td class="ce"><input type="checkbox" class="cf-cx"
          data-email="${esc(u.email)}" data-modulo="${m.id}"
          ${u.admin || (u.modulos || []).includes(m.id) ? 'checked' : ''}
          ${u.admin ? 'disabled title="Administrador enxerga tudo"' : ''}></td>`).join('')}
        <td class="ce"><button class="btn mini" data-editar-us="${esc(u.email)}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Ninguém cadastrado ainda.</div>';

  $('cfTabela').querySelectorAll('.cf-cx').forEach(cx =>
    cx.addEventListener('change', () => trocarPermissao(cx)));
  $('cfTabela').querySelectorAll('[data-editar-us]').forEach(b =>
    b.addEventListener('click', () => abrirUsuario(b.dataset.editarUs)));
}

async function trocarPermissao(cx) {
  const u = usuarios.find(x => x.email === cx.dataset.email);
  if (!u) return;
  const antes = { admin: u.admin, modulos: [...(u.modulos || [])] };
  if (cx.dataset.campo === 'admin') u.admin = cx.checked;
  else {
    const m = cx.dataset.modulo;
    const lista = new Set(u.modulos || []);
    cx.checked ? lista.add(m) : lista.delete(m);
    u.modulos = [...lista];
  }
  const ok = await gravar(u);
  if (!ok) { u.admin = antes.admin; u.modulos = antes.modulos; }
  desenharConfig();
  if ((u.email || '').toLowerCase() === acesso.email) {
    await carregarAcesso();
    montarMenu();
    abrirModulo('config');
  }
}

async function gravar(u) {
  const { error } = await estado.cliente.from('app_usuarios').upsert({
    email: u.email.trim().toLowerCase(), nome: u.nome || null,
    admin: !!u.admin, modulos: u.modulos || [],
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'email' });
  if (error) {
    const a = $('cfAviso');
    a.textContent = 'Não consegui salvar: ' + error.message;
    a.hidden = false;
    return false;
  }
  $('cfAviso').hidden = true;
  return true;
}

function abrirUsuario(email) {
  const u = email ? usuarios.find(x => x.email === email) : null;
  editando = u ? { ...u } : { email: '', nome: '', admin: false, modulos: [...PADRAO] };
  $('tituloUsuario').textContent = u ? 'Editar pessoa' : 'Adicionar pessoa';
  $('usEmail').value = editando.email || '';
  $('usEmail').disabled = !!u;
  $('usNome').value = editando.nome || '';
  $('bApagarUsuario').hidden = !u || (u.email || '').toLowerCase() === acesso.email;
  $('dlgUsuario').showModal();
}

export function ligarAcesso() {
  $('cfNovo').addEventListener('click', () => abrirUsuario(null));

  $('formUsuario').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editando) return;
    const email = $('usEmail').value.trim().toLowerCase();
    if (!email) return;
    const u = { ...editando, email, nome: $('usNome').value.trim() };
    if (await gravar(u)) {
      const i = usuarios.findIndex(x => x.email === email);
      if (i >= 0) usuarios[i] = u; else usuarios.push(u);
      usuarios.sort((a, b) => a.email.localeCompare(b.email));
    }
    $('dlgUsuario').close();
    desenharConfig();
  });

  $('bApagarUsuario').addEventListener('click', async () => {
    if (!editando?.email) return;
    if (!confirm(`Tirar o acesso de ${editando.email}? A conta continua existindo no Supabase, ` +
      'mas o app deixa de mostrar qualquer aba para ela.')) return;
    const { error } = await estado.cliente.from('app_usuarios').delete().eq('email', editando.email);
    if (error) { alert('Não consegui tirar: ' + error.message); return; }
    usuarios = usuarios.filter(x => x.email !== editando.email);
    $('dlgUsuario').close();
    desenharConfig();
  });
}

export function limparAcesso() {
  usuarios = []; editando = null;
  acesso.email = ''; acesso.admin = false;
  acesso.modulos = [...PADRAO]; acesso.carregado = false;
}
