// atalhos.js — Acesso rápido da tela inicial, editável por login (24/09/2026)
//
// Pedido do Guilherme: cada usuário escolhe o que quer deixar no acesso rápido.
// A escolha fica no banco (tabela app_preferencias, uma linha por e-mail, RLS
// "só a própria linha"), então segue a pessoa em qualquer aparelho. Uma cópia
// fica no localStorage para a tela inicial abrir na hora, mesmo sem rede.
//
// O catálogo sai sozinho do MODULOS do acesso.js: toda tela nova de qualquer
// módulo já pode virar atalho. Atalho de tela sem permissão não aparece —
// quem manda continua sendo a aba Configurações.

import { estado } from './store.js';
import { MODULOS, subsDe, podeTela, moduloDe } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- ícones ---------------- */
// Os ícones moram em js/icones.js desde 29/09/2026 — a faixa de ícones do menu usa os mesmos.
import { ICONES } from './icones.js';

/* Ícone e nome curto das telas mais usadas; o resto sai do MODULOS. */
const PROPRIOS = {
  funcionarios:  ['pessoa', 'Funcionários'],
  funcionariosN2:['pessoas', 'Funcionários nível 2'],
  aniversarios:  ['bolo', 'Aniversariantes'],
  fichas:        ['escudo', 'Fichas de EPI'],
  epis:          ['escudo', 'Tipos de EPI'],
  exVenc:        ['exame', 'Exames a vencer'],
  exPainel:      ['exame', 'Painel de exames'],
  trVenc:        ['treino', 'Treinamentos a vencer'],
  trPainel:      ['treino', 'Painel de treinamentos'],
  disc:          ['disc', 'Perfil DISC'],
  rhCargos:      ['cargo', 'Plano de cargos'],
  rhOrganograma: ['pessoas', 'Organograma'],
  rhQuadro:      ['pessoas', 'Quadro de pessoal'],
  cadRelatorios: ['pessoas', 'Relatórios de cadastro'],
  jorPainel:     ['painel', 'Painel DP'],
  jorLancar:     ['relogio', 'Lançar jornada'],
  jorBoletins:   ['relogio', 'Jornadas lançadas'],
  jorFechamento: ['calendario', 'Fechamento DP'],
  jorHistorico: ['calendario', 'Histórico de fechamentos'],
  jorRelatorios: ['documento', 'Relatórios DP'],
  bdDia:         ['boletim', 'Marcar boletins'],
  bdMes:         ['calendario', 'Boletins do mês'],
  bdPend:        ['alerta', 'Boletins pendentes'],
  dmPainel:      ['recibo', 'Folha, holerite e recibo'],
  dmMes:         ['recibo', 'Documentos do mês'],
  dmScan:        ['check', 'Escanear documentos'],
  empEmissao:    ['dinheiro', 'Emitir empréstimo'],
  empRecibos:    ['dinheiro', 'Recibos emitidos'],
  empHistorico:  ['dinheiro', 'Conta corrente'],
  ferPainel:     ['sol', 'Férias'],
  lista:         ['lista', 'Lista de presença'],
  termoSindical: ['documento', 'Termo sindical'],
  termoContrato: ['documento', 'Recebimento do contrato'],
  cadFuncoes:    ['cargo', 'Funções e setores'],
  exFuncoes:     ['exame', 'Exames por função'],
  ferPrev:       ['sol', 'Previsão de férias'],
  ferLanc:       ['sol', 'Lançar férias'],
  ferAfast:      ['sol', 'Afastamentos'],
  empSalarios:   ['dinheiro', 'Salário base'],
};
const ICONE_MODULO = { pessoas: 'pessoa', sst: 'escudo', rh: 'cargo', jornada: 'relogio' };

export const PADRAO = ['funcionarios', 'aniversarios', 'fichas', 'exVenc', 'trVenc', 'jorPainel', 'jorLancar', 'disc'];

/** Todas as telas que podem virar atalho, agrupadas como no menu. */
export function catalogo() {
  const r = [];
  for (const m of MODULOS) {
    for (const s of subsDe(m)) {
      for (const [t, rot] of s.telas) {
        if (t === 'config') continue;
        const [ic, curto] = PROPRIOS[t] || [ICONE_MODULO[m.id] || 'lista',
          s.telas.length === 1 || s.nome === rot ? rot : `${s.nome} · ${rot}`];
        r.push({ tela: t, icone: ic, nome: curto, modulo: m.nome, sub: s.nome, rot });
      }
    }
  }
  return r;
}
const itemDe = t => catalogo().find(x => x.tela === t) || null;

/* ---------------- guardar ---------------- */
const email = () => (estado.sessao?.user?.email || '').toLowerCase();
const chaveLocal = () => 'gr.atalhos.' + email();
let escolhidos = null;       // null = ainda não carregou → usa o padrão

function lerLocal() {
  try { const v = localStorage.getItem(chaveLocal()); return v ? JSON.parse(v) : null; } catch { return null; }
}
function gravarLocal(l) { try { localStorage.setItem(chaveLocal(), JSON.stringify(l)); } catch {} }

/** Lê a escolha da pessoa (nuvem primeiro, cópia local se faltar rede). */
export async function carregarAtalhos() {
  escolhidos = lerLocal();
  if (!estado.cliente || !estado.sessao || !email()) return;
  try {
    const { data, error } = await estado.cliente.from('app_preferencias')
      .select('atalhos').eq('email', email()).maybeSingle();
    if (error) throw error;
    if (data && Array.isArray(data.atalhos)) { escolhidos = data.atalhos; gravarLocal(escolhidos); }
  } catch { /* sem rede ou tabela ainda não criada: fica a cópia local / padrão */ }
}

async function salvarAtalhos(lista) {
  escolhidos = lista;
  gravarLocal(lista);
  if (!estado.cliente || !estado.sessao) return false;
  try {
    const { error } = await estado.cliente.from('app_preferencias')
      .upsert({ email: email(), atalhos: lista, atualizado_em: new Date().toISOString() }, { onConflict: 'email' });
    if (error) throw error;
    return true;
  } catch { return false; }
}

export function limparAtalhos() { escolhidos = null; }

/* ---------------- desenhar ---------------- */
let abrir = () => {};
let avisar = () => {};

export function desenharAtalhos() {
  const nav = $('atalhosInicio');
  if (!nav) return;
  const lista = (escolhidos || PADRAO).map(itemDe).filter(x => x && podeTela(x.tela));
  nav.hidden = false;
  nav.innerHTML = lista.map((x, i) => `
    <button type="button" class="ql-item ${i === 0 ? 'prim' : ''}" data-atalho="${x.tela}" title="${esc(x.modulo + ' › ' + x.sub + ' › ' + x.rot)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[x.icone]}</svg>
      <span>${esc(x.nome)}</span></button>`).join('') + `
    <button type="button" class="ql-item ql-editar" id="qlEditar" title="Escolher os atalhos desta tela">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES.lapis}</svg>
      <span>${lista.length ? 'Editar atalhos' : 'Escolher atalhos'}</span></button>`;
  nav.querySelectorAll('[data-atalho]').forEach(b => b.addEventListener('click', () =>
    abrir(moduloDe(b.dataset.atalho), b.dataset.atalho)));
  $('qlEditar').addEventListener('click', editarAtalhos);
}

/* ---------------- editar ---------------- */
let rascunho = [];

function editarAtalhos() {
  rascunho = (escolhidos || PADRAO).filter(t => { const x = itemDe(t); return x && podeTela(t); });
  const dlg = $('dlgAtalhos');
  desenharEditor();
  if (!dlg.open) dlg.showModal();
}

function desenharEditor() {
  const disp = catalogo().filter(x => podeTela(x.tela) && !rascunho.includes(x.tela));
  const grupos = [];
  disp.forEach(x => {
    let g = grupos.find(g => g.modulo === x.modulo);
    if (!g) grupos.push(g = { modulo: x.modulo, itens: [] });
    g.itens.push(x);
  });
  const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[n]}</svg>`;

  $('dlgAtalhosCorpo').innerHTML = `
    <h3>Acesso rápido</h3>
    <p class="dica" style="margin:-8px 0 12px">Escolha os atalhos da sua tela inicial e a ordem deles. Vale só para o seu login, em qualquer aparelho.</p>
    <div class="qa-tit">No acesso rápido <small>${rascunho.length}</small></div>
    <ol class="qa-lista">${rascunho.map((t, i) => {
      const x = itemDe(t);
      return `<li class="qa-item qa-sel">${ic(x.icone)}<span><b>${esc(x.nome)}</b><small>${esc(x.modulo)} › ${esc(x.sub)}</small></span>
        <span class="qa-botoes">
          <button type="button" class="btn mini" data-sobe="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(x.nome)}">▲</button>
          <button type="button" class="btn mini" data-desce="${i}" ${i === rascunho.length - 1 ? 'disabled' : ''} aria-label="Descer ${esc(x.nome)}">▼</button>
          <button type="button" class="btn mini" data-tira="${t}" aria-label="Tirar ${esc(x.nome)}">Tirar</button></span></li>`;
    }).join('') || '<li class="qa-vazio">Nenhum atalho. Adicione abaixo.</li>'}</ol>
    <div class="qa-tit">Disponíveis</div>
    <div class="qa-disp">${grupos.map(g => `<div class="qa-grupo"><h4>${esc(g.modulo)}</h4>
      ${g.itens.map(x => `<button type="button" class="qa-item qa-add" data-poe="${x.tela}">${ic(x.icone)}
        <span><b>${esc(x.nome)}</b><small>${esc(x.sub)}</small></span><span class="qa-mais">+ Adicionar</span></button>`).join('')}</div>`).join('')
      || '<p class="dica">Tudo o que você pode abrir já está no acesso rápido.</p>'}</div>
    <div class="barra entre" style="margin-top:14px">
      <button type="button" class="btn" id="qaPadrao">Voltar ao padrão</button>
      <span><button type="button" class="btn" id="qaCancelar">Cancelar</button>
      <button type="button" class="btn principal" id="qaSalvar">Salvar</button></span></div>`;

  const corpo = $('dlgAtalhosCorpo');
  const move = (i, d) => { const [x] = rascunho.splice(i, 1); rascunho.splice(i + d, 0, x); desenharEditor(); };
  corpo.querySelectorAll('[data-sobe]').forEach(b => b.addEventListener('click', () => move(+b.dataset.sobe, -1)));
  corpo.querySelectorAll('[data-desce]').forEach(b => b.addEventListener('click', () => move(+b.dataset.desce, 1)));
  corpo.querySelectorAll('[data-tira]').forEach(b => b.addEventListener('click', () => { rascunho = rascunho.filter(t => t !== b.dataset.tira); desenharEditor(); }));
  corpo.querySelectorAll('[data-poe]').forEach(b => b.addEventListener('click', () => { rascunho.push(b.dataset.poe); desenharEditor(); }));
  $('qaPadrao').addEventListener('click', () => { rascunho = PADRAO.filter(t => podeTela(t)); desenharEditor(); });
  $('qaCancelar').addEventListener('click', () => $('dlgAtalhos').close());
  $('qaSalvar').addEventListener('click', async () => {
    const b = $('qaSalvar'); b.disabled = true;
    /* Guarda também os atalhos de telas que a pessoa não vê agora (sem
       permissão no momento): se a permissão voltar, o atalho volta junto. */
    const ocultos = (escolhidos || PADRAO).filter(t => !podeTela(t) && !rascunho.includes(t));
    const ok = await salvarAtalhos([...rascunho, ...ocultos]);
    $('dlgAtalhos').close();
    desenharAtalhos();
    avisar(ok ? 'Acesso rápido salvo.' : 'Sem conexão: o acesso rápido ficou salvo só neste aparelho. Salve de novo quando a rede voltar.', true);
  });
}

/** Chamada uma vez na abertura do app. */
export function ligarAtalhos(abrirModulo, aviso) {
  if (abrirModulo) abrir = abrirModulo;
  if (aviso) avisar = aviso;
}
