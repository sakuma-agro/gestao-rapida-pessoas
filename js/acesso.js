// acesso.js — quem entra vê o quê
// A lista fica na tabela app_usuarios. Quem é administrador enxerga tudo
// e pode mexer nesta lista; os outros só leem a própria linha.
import { estado } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Os módulos do app. Para criar um módulo novo no futuro, basta acrescentar
   um item aqui (com as telas que já existirem no index.html) — o menu, a tela
   de configurações e as permissões passam a enxergá-lo sozinhos.

   Um módulo pode ter as telas direto em `telas` (duas faixas de menu) ou
   agrupá-las em `subs`, os submódulos (três faixas: módulo, submódulo, tela).
   É o caso do SST. */
export const MODULOS = [
  { id: 'pessoas', nome: 'Funcionários', telas: [
    ['funcionarios', 'Cadastro · Nível 1'],
    ['funcionariosN2', 'Cadastro · Nível 2'],
    ['aniversarios', 'Aniversariantes'],
  ] },
  { id: 'sst', nome: 'SST', subs: [
    { id: 'epis', nome: "EPI's", telas: [
      ['fichas', 'Fichas'],
      ['epis', 'Tipos de EPI'],
      ['modelo', 'Modelo da ficha'],
    ] },
    { id: 'exames', nome: 'Exames', telas: [
      ['exVenc', 'Vencimentos'],
      ['exTipos', 'Tipos e periodicidade'],
    ] },
    { id: 'treinamentos', nome: 'Treinamentos', telas: [
      ['trVenc', 'Vencimentos'],
      ['trTipos', 'Tipos e periodicidade'],
    ] },
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
    ['jorFechamento',   'Fechamento'],
    ['jorRelatorios',   'Relatórios'],
    ['jorConfig',       'Configurações'],
  ] },
];

/* Um módulo sem submódulo se comporta como se tivesse um só, com o nome dele.
   Assim o resto do código não precisa saber qual é qual. */
export const subsDe = m => m.subs || [{ id: m.id, nome: m.nome, telas: m.telas || [] }];
export const telasDe = m => subsDe(m).flatMap(s => s.telas);

export const moduloDe = tela =>
  MODULOS.find(m => telasDe(m).some(([t]) => t === tela))?.id || null;

// Quem ainda não estiver na lista entra com estes módulos — assim ninguém
// fica trancado do lado de fora; RH e Configurações ficam sempre de fora.
const PADRAO = ['pessoas', 'sst', 'certificacao'];

export const acesso = { email: '', admin: false, modulos: [...PADRAO], telas: [], carregado: false };
let usuarios = [];
let editando = null;

export const pode = m => acesso.admin || acesso.modulos.includes(m);

/* Permissão por tela (submódulo). A lista guarda 'modulo:tela'.
   Enquanto nenhuma tela de um módulo estiver na lista, a pessoa vê o módulo
   inteiro — que é como sempre funcionou. Basta marcar uma para o resto sumir. */
const temRestricao = m => acesso.telas.some(x => x.startsWith(m + ':'));

export function podeTela(tela) {
  if (acesso.admin) return true;
  const m = moduloDe(tela);
  if (!m || !pode(m)) return false;
  return !temRestricao(m) || acesso.telas.includes(m + ':' + tela);
}

export const telasLiberadas = m => {
  const mod = MODULOS.find(x => x.id === m);
  return mod ? telasDe(mod).filter(([t]) => podeTela(t)) : [];
};

/** Submódulos com pelo menos uma tela liberada. */
export const subsLiberados = m => {
  const mod = MODULOS.find(x => x.id === m);
  if (!mod) return [];
  return subsDe(mod)
    .map(s => ({ ...s, telas: s.telas.filter(([t]) => podeTela(t)) }))
    .filter(s => s.telas.length);
};

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
    // quem tinha o módulo antigo "EPIs" enxerga o SST, que tomou o lugar dele
    if (acesso.modulos.includes('epis') && !acesso.modulos.includes('sst')) acesso.modulos.push('sst');
    acesso.telas = meu ? (meu.telas || []) : [];
  } catch {
    acesso.admin = false;
    acesso.modulos = [...PADRAO];
    acesso.telas = [];
  }
  acesso.carregado = true;
  return acesso;
}

/* =============== menu =============== */
let aoTrocar = () => {};
let moduloAberto = null;

export const modulosLiberados = () =>
  MODULOS.filter(m => pode(m.id) && telasLiberadas(m.id).length);

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
    $('navSub').hidden = true;
    aoTrocar('config');
    return;
  }

  const subs = subsLiberados(id);
  if (!subs.length) return;

  // Módulo sem submódulo: a segunda faixa mostra as telas, como sempre foi.
  if (subs.length === 1) {
    $('navSub').hidden = true;
    desenharTelas($('navTelas'), 'aba2', subs[0].telas, tela);
    return;
  }

  // Com submódulo: segunda faixa são os submódulos, terceira são as telas.
  const sub = subs.find(s => s.telas.some(([t]) => t === tela)) || subs[0];
  $('navTelas').hidden = false;
  $('navTelas').innerHTML = subs.map(s =>
    `<button class="aba2" role="tab" data-sub="${s.id}" aria-selected="${s.id === sub.id}">${esc(s.nome)}</button>`).join('');
  $('navTelas').querySelectorAll('.aba2').forEach(b =>
    b.addEventListener('click', () => abrirModulo(id, (subs.find(s => s.id === b.dataset.sub)?.telas[0] || [])[0])));

  desenharTelas($('navSub'), 'aba3', sub.telas, tela);
}

/** Desenha uma faixa de telas e abre a escolhida (ou a primeira). */
function desenharTelas(faixa, classe, telas, tela) {
  const alvo = telas.some(([t]) => t === tela) ? tela : telas[0][0];
  faixa.hidden = telas.length < 2;
  faixa.innerHTML = telas.map(([t, rot]) =>
    `<button class="${classe}" role="tab" data-tela="${t}" aria-selected="${t === alvo}">${esc(rot)}</button>`).join('');
  faixa.querySelectorAll('[data-tela]').forEach(b =>
    b.addEventListener('click', () => {
      faixa.querySelectorAll('[data-tela]').forEach(x =>
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
    admin: !!u.admin, modulos: u.modulos || [], telas: u.telas || [],
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

/* Cria o login de verdade (Supabase Auth) e o acesso, de uma vez.
   Quem cria é a função 'criar-usuario' no servidor: ela confere se quem
   pediu é administrador e devolve a senha uma única vez. */
async function criarLogin(u) {
  const aviso = $('cfAviso');
  try {
    const { data, error } = await estado.cliente.functions.invoke('criar-usuario', {
      body: { email: u.email, nome: u.nome, admin: !!u.admin,
              modulos: u.modulos || [], telas: u.telas || [] },
    });
    if (error) throw error;
    if (data?.erro) throw new Error(data.erro);

    const i = usuarios.findIndex(x => x.email === u.email);
    const linha = { email: u.email, nome: u.nome, admin: !!u.admin,
                    modulos: u.modulos || [], telas: u.telas || [] };
    if (i >= 0) usuarios[i] = linha; else usuarios.push(linha);
    usuarios.sort((a, b) => a.email.localeCompare(b.email));

    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.innerHTML = data.jaExistia
      ? `<b>Esse e-mail já tinha login.</b> A senha continua a mesma;
         o que mudou foi o acesso aos módulos e telas.`
      : `<b>Login criado.</b> Anote a senha agora — ela não fica guardada
         e não dá para ver de novo:<br><br>
         <code id="usSenhaTexto">${esc(data.senha)}</code>
         <div class="barra"><button type="button" class="btn mini" id="bCopiarSenha">Copiar</button>
         <span class="dc-sem">Peça para a pessoa trocar no primeiro acesso.</span></div>`;

    $('bCopiarSenha')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.senha);
        $('bCopiarSenha').textContent = 'Copiada';
      } catch { $('bCopiarSenha').textContent = 'Selecione e copie'; }
    });

    editando.novo = false;
    $('usEmail').disabled = true;
    aviso.hidden = true;
    return true;
  } catch (e) {
    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.className = 'us-senha erro';
    caixa.innerHTML = '<b>Não consegui criar o acesso.</b><br>' + esc(e.message || String(e));
    return false;
  }
}

function abrirUsuario(email) {
  const u = email ? usuarios.find(x => x.email === email) : null;
  editando = u ? { ...u, telas: [...(u.telas || [])], novo: false }
                : { email: '', nome: '', admin: false, modulos: [...PADRAO], telas: [], novo: true };
  $('usSenha').hidden = true;
  $('usSenha').className = 'us-senha';
  $('usSenha').innerHTML = '';
  $('bSalvarUsuario').textContent = u ? 'Salvar' : 'Criar login e acesso';
  $('tituloUsuario').textContent = u ? 'Editar pessoa' : 'Adicionar pessoa';
  $('usEmail').value = editando.email || '';
  $('usEmail').disabled = !!u;
  $('usNome').value = editando.nome || '';
  $('bApagarUsuario').hidden = !u || (u.email || '').toLowerCase() === acesso.email;
  $('bNovaSenha').hidden = !u;
  desenharPermissoes();
  $('dlgUsuario').showModal();
}

/* O que a pessoa enxerga: o módulo e, dentro dele, as telas.
   Deixar todas as telas desmarcadas quer dizer "o módulo inteiro" — é o
   caso normal. Marcar uma só é o que se faz para quem vem de fora. */
function desenharPermissoes() {
  const e = editando;
  if (!e) return;
  const temModulo = m => e.admin || (e.modulos || []).includes(m);
  const marcada = (m, t) => (e.telas || []).includes(m + ':' + t);
  const restrito = m => (e.telas || []).some(x => x.startsWith(m + ':'));

  $('usPermissoes').innerHTML = MODULOS.map(m => `
    <div class="us-mod ${temModulo(m.id) ? '' : 'desligado'}">
      <label class="us-mod__topo">
        <input type="checkbox" data-mod="${m.id}" ${temModulo(m.id) ? 'checked' : ''}
          ${e.admin ? 'disabled title="Administrador enxerga tudo"' : ''}>
        <b>${esc(m.nome)}</b>
        <span class="dc-sem">${restrito(m.id)
          ? 'só as telas marcadas'
          : 'todas as telas'}</span>
      </label>
      ${subsDe(m).map(s => `
        ${m.subs ? `<div class="us-sub">${esc(s.nome)}</div>` : ''}
        <div class="us-telas">
          ${s.telas.map(([tid, rot]) => `
            <label class="us-tela">
              <input type="checkbox" data-mod="${m.id}" data-tela="${tid}"
                ${marcada(m.id, tid) ? 'checked' : ''}
                ${temModulo(m.id) && !e.admin ? '' : 'disabled'}>
              ${esc(rot)}
            </label>`).join('')}
        </div>`).join('')}
    </div>`).join('');

  $('usPermissoes').querySelectorAll('input[data-mod]').forEach(cx =>
    cx.addEventListener('change', () => {
      const m = cx.dataset.mod;
      if (cx.dataset.tela) {
        const chave = m + ':' + cx.dataset.tela;
        const lista = new Set(e.telas || []);
        cx.checked ? lista.add(chave) : lista.delete(chave);
        e.telas = [...lista];
      } else {
        const lista = new Set(e.modulos || []);
        if (cx.checked) lista.add(m);
        else {
          lista.delete(m);
          // tirou o módulo: as telas dele não fazem mais sentido
          e.telas = (e.telas || []).filter(x => !x.startsWith(m + ':'));
        }
        e.modulos = [...lista];
      }
      desenharPermissoes();
    }));
}

export function ligarAcesso() {
  $('cfNovo').addEventListener('click', () => abrirUsuario(null));

  $('formUsuario').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editando) return;
    const email = $('usEmail').value.trim().toLowerCase();
    if (!email) return;
    const u = { ...editando, email, nome: $('usNome').value.trim(),
                 modulos: editando.modulos || [], telas: editando.telas || [] };

    if (editando.novo) {
      // Pessoa nova: o login precisa ser criado no servidor, porque a chave
      // que cria login não pode existir no navegador.
      const ok = await criarLogin(u);
      if (!ok) return;                 // erro já apareceu; o diálogo fica aberto
      desenharConfig();
      return;                          // fica aberto para copiar a senha
    }

    if (await gravar(u)) {
      const i = usuarios.findIndex(x => x.email === email);
      if (i >= 0) usuarios[i] = u; else usuarios.push(u);
      usuarios.sort((a, b) => a.email.localeCompare(b.email));
    }
    $('dlgUsuario').close();
    desenharConfig();
  });

  $('bNovaSenha').addEventListener('click', async () => {
    if (!editando?.email) return;
    if (!confirm(`Gerar uma senha nova para ${editando.email}?\n\n` +
                 'A senha atual deixa de funcionar na hora, e a nova aparece uma vez só.')) return;
    const caixa = $('usSenha');
    caixa.hidden = false;
    caixa.className = 'us-senha';
    caixa.textContent = 'Gerando...';
    try {
      const { data, error } = await estado.cliente.functions.invoke('criar-usuario', {
        body: { acao: 'senha', email: editando.email },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      caixa.innerHTML = `<b>Senha nova.</b> Anote agora — ela não fica guardada:<br><br>
        <code>${esc(data.senha)}</code>
        <div class="barra"><button type="button" class="btn mini" id="bCopiarSenha">Copiar</button>
        <span class="dc-sem">A senha anterior já não funciona mais.</span></div>`;
      $('bCopiarSenha').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.senha);
          $('bCopiarSenha').textContent = 'Copiada';
        } catch { $('bCopiarSenha').textContent = 'Selecione e copie'; }
      });
    } catch (e) {
      caixa.className = 'us-senha erro';
      caixa.innerHTML = '<b>Não consegui trocar a senha.</b><br>' + esc(e.message || String(e));
    }
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
