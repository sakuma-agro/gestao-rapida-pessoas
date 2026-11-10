// compras.js — Compras: solicitação de compra (10/11/2026, pedido do Guilherme)
//
// "Em Rastro, conseguimos criar algo de solicitação de compra? Objetivo: todos
// os funcionários lançar o que precisa ser comprado, o comprador ia ver."
// Decisões dele: só quem já tem login no app lança; QR code na parede que
// abre direto a tela de pedido.
//
// Banco: public.cmp_pedidos (supabase/compras.sql). Quem pediu vê só os
// seus; o comprador (módulo 'compras' em Usuários e Acessos, ou admin) vê
// todos e anda com eles: Solicitado → Em cotação → Comprado → Entregue (ou
// Recusado, com motivo). Quem pediu corrige ou cancela enquanto está
// Solicitado. Cada pedido em aberto também vira item do comprador no Rastro
// (origem 'compras' em js/cronograma.js).
//
// Mora em dois lugares com a mesma tela: o cartão "Compras" da tela inicial
// (para todo mundo com login, inclusive quem não tem o Rastro) e a aba
// "Compras" dentro do Rastro. O QR code abre ?area=compras.

import { estado, gravarLocal } from './store.js';
import { acesso } from './acesso.js';
import { mostrar } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();
const norm = s => limpo(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch { return p; } };

const CACHE = 'gr.compras';
const FILA = 'gr.compras.fila';
export const LINK_PEDIR = 'https://sakuma-agro.github.io/gestao-rapida-pessoas/?area=compras';

export const ehComprador = () => !!acesso.admin || (acesso.modulos || []).includes('compras');

export const SIT = {
  solicitado: { nome: 'Solicitado', cor: '#888780' },
  cotacao: { nome: 'Em cotação', cor: '#BA7517' },
  comprado: { nome: 'Comprado', cor: '#2F6FB0' },
  entregue: { nome: 'Entregue', cor: '#5E8A00' },
  recusado: { nome: 'Recusado', cor: '#B42318' },
};
const COLUNAS = ['solicitado', 'cotacao', 'comprado', 'entregue'];
export const URG = {
  normal: { nome: 'Normal', cls: 'nor' },
  urgente: { nome: 'Urgente', cls: 'urg' },
  parou: { nome: 'Parou o serviço', cls: 'par' },
};
const UNIDADES = ['un', 'par', 'cx', 'pct', 'L', 'kg', 'm', 'rolo', 'saco', 'galão', 'jogo'];
const DESTINOS = ['Lote 35 PADAP', 'Faz. Faca', 'Faz. Morro Branco', 'Faz. Três Riachos', 'Faz. Quebra Cocão', 'Escritório', 'Oficina'];

const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const brCurto = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '';
const numTxt = p => p.numero ? `#C-${String(p.numero).padStart(3, '0')}` : '#C-…';
const qtdTxt = p => [p.quantidade != null && p.quantidade !== '' ? String(p.quantidade).replace('.', ',') : '', p.unidade || ''].filter(Boolean).join(' ');
const idade = p => {
  const dias = Math.floor((Date.now() - new Date(p.criado_em).getTime()) / 864e5);
  return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
};
const meuEmail = () => limpo(acesso.email).toLowerCase();
const primeiroNome = s => limpo(s).split(/[\s@]/)[0] || '';

/* ---------------- dados ---------------- */
const dados = { pedidos: ler(CACHE, []), em: null, carregando: false, erro: '' };
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch {} });
export const ouvirCompras = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

export async function carregarCompras() {
  if (!estado.cliente || !estado.sessao || dados.carregando) return dados.pedidos;
  dados.carregando = true; avisar();
  try {
    await enviarFila();
    const { data, error } = await estado.cliente.from('cmp_pedidos').select('*').eq('ativo', true)
      .order('criado_em', { ascending: false }).limit(2000);
    if (error) dados.erro = /does not exist|schema cache/i.test(error.message || '') ? 'O banco ainda não tem a tabela de Compras.' : 'Não deu para ler os pedidos agora.';
    else { dados.pedidos = data || []; dados.erro = ''; dados.em = new Date().toISOString(); gravarLocal(CACHE, dados.pedidos); }
  } catch { dados.erro = 'Sem conexão — mostrando o último retrato.'; }
  finally { dados.carregando = false; avisar(); }
  return dados.pedidos;
}
/** Pedidos em aberto, para o Rastro (só o comprador vê todos). */
export const pedidosAbertos = () => dados.pedidos.filter(p => p.ativo !== false && ['solicitado', 'cotacao', 'comprado'].includes(p.situacao));

/* Sem sinal: o pedido entra numa fila no aparelho e sobe quando a rede voltar. */
let filaRodando = null;
function enviarFila() {
  if (!filaRodando) filaRodando = (async () => {
    const fila = ler(FILA, []);
    if (!fila.length || !estado.cliente || !estado.sessao || !navigator.onLine) return;
    const resto = [];
    for (const p of fila) {
      const r = await estado.cliente.from('cmp_pedidos').insert(p).then(x => x, e => ({ error: e }));
      if (r.error && !/permission|policy|violates|check/i.test(r.error.message || '')) resto.push(p);
    }
    gravarLocal(FILA, [...resto, ...ler(FILA, []).slice(fila.length)]);
  })().finally(() => { filaRodando = null; });
  return filaRodando;
}
addEventListener('online', () => { enviarFila().then(() => carregarCompras()).catch(() => {}); });
const naFila = () => ler(FILA, []);

async function pedir(p) {
  const linha = { ...p, pedido_por_nome: acesso.nome || primeiroNome(acesso.email) || null, atualizado_por: acesso.nome || acesso.email || null };
  if (!estado.cliente || !estado.sessao || !navigator.onLine) {
    gravarLocal(FILA, [...naFila(), linha]); avisar(); return 'fila';
  }
  const { error } = await estado.cliente.from('cmp_pedidos').insert(linha).then(x => x, e => ({ error: e }));
  if (error) {
    if (/permission|policy|violates/i.test(error.message || '')) return 'negado';
    gravarLocal(FILA, [...naFila(), linha]); return 'fila';
  }
  await carregarCompras();
  return 'ok';
}

async function alterar(id, campos) {
  if (!estado.cliente || !estado.sessao || !navigator.onLine) return 'semrede';
  const i = dados.pedidos.findIndex(x => x.id === id);
  const mud = { ...campos, atualizado_em: new Date().toISOString(), atualizado_por: acesso.nome || acesso.email || null };
  // vale na tela na hora; se o banco recusar, relê
  if (i >= 0) { if (mud.ativo === false) dados.pedidos.splice(i, 1); else dados.pedidos[i] = { ...dados.pedidos[i], ...mud }; avisar(); }
  const { data, error } = await estado.cliente.from('cmp_pedidos').update(mud).eq('id', id).select('id').then(x => x, e => ({ error: e }));
  if (error) { await carregarCompras(); return /permission|policy|violates/i.test(error.message || '') ? 'negado' : 'erro'; }
  if (!data || !data.length) { await carregarCompras(); return 'negado'; }   // o banco não deixou (RLS não dá erro, só não muda)
  gravarLocal(CACHE, dados.pedidos);
  return 'ok';
}

/* ---------------- tela ---------------- */
const vis = ler('gr.compras.vis', {});
const est = {
  aba: vis.aba || null,         // pedir | meus | quadro
  destino: '', urg: '', busca: '',
  mostrarRecusados: false,
  rascunho: { item: '', quantidade: '', unidade: 'un', destino: vis.destino || '', urgencia: 'normal', motivo: '' },
  msg: null,
};
const guardarVis = () => gravarLocal('gr.compras.vis', { aba: est.aba, destino: est.rascunho.destino });

let alvo = null, ligado = false, dentroRastro = false;

/** Abre a tela de Compras dentro de `el`. `rastro` = mora na aba do Rastro. */
export function abrirCompras(el, { rastro = false, aba = null } = {}) {
  alvo = el; dentroRastro = rastro;
  if (aba) est.aba = aba;
  if (!est.aba || (est.aba === 'quadro' && !ehComprador())) est.aba = ehComprador() ? 'quadro' : 'pedir';
  if (!ligado) {
    ligado = true;
    ouvintes.add(() => {
      if (!alvo || !alvo.isConnected || alvo.closest('[hidden]')) return;
      if (alvo.querySelector('.cm-form') && est.aba === 'pedir') { pintarStatus(); return; } // não apaga o que está sendo digitado
      if (document.querySelector('dialog.cm-dlg[open]')) return;
      desenhar();
    });
  }
  desenhar();
  carregarCompras();
}

function pintarStatus() {
  const s = alvo?.querySelector('#cmStatus');
  if (s) s.textContent = statusTxt();
}
function statusTxt() {
  const fila = naFila().length;
  if (dados.carregando) return 'Atualizando…';
  if (dados.erro) return dados.erro;
  return (fila ? `${fila} pedido(s) esperando internet para subir · ` : '') + (dados.em ? 'Atualizado agora' : '');
}

function desenhar() {
  if (!alvo) return;
  const comp = ehComprador();
  const meus = dados.pedidos.filter(p => limpo(p.pedido_por_email).toLowerCase() === meuEmail());
  const abertosMeus = meus.filter(p => !['entregue', 'recusado'].includes(p.situacao)).length;
  const abertos = pedidosAbertos().length;
  alvo.innerHTML = `
  <div class="cm${dentroRastro ? ' cm-rastro' : ''}">
    ${dentroRastro ? '' : `<div class="cm-cab">
      <div><h2>Compras <small>Pedido de compra</small></h2>
      <p class="cm-sub">Lance o que precisa ser comprado — o comprador recebe e você acompanha · <span id="cmStatus">${esc(statusTxt())}</span></p></div>
      <div class="cm-acoes">${comp ? '<button type="button" class="btn" id="cmQr">QR code para a parede</button>' : ''}
        <button type="button" class="btn" id="cmAtualizar">Atualizar</button></div>
    </div>`}
    ${dentroRastro ? `<div class="cm-cab cm-cab-r"><p class="cm-sub" style="margin:0">Pedidos de compra · <span id="cmStatus">${esc(statusTxt())}</span></p>
      <div class="cm-acoes">${comp ? '<button type="button" class="btn" id="cmQr">QR code para a parede</button>' : ''}<button type="button" class="btn" id="cmAtualizar">Atualizar</button></div></div>` : ''}
    <div class="cm-seg" role="tablist">
      <button type="button" role="tab" data-aba="pedir" aria-selected="${est.aba === 'pedir'}">+ Pedir compra</button>
      <button type="button" role="tab" data-aba="meus" aria-selected="${est.aba === 'meus'}">Meus pedidos${abertosMeus ? ` <span>${abertosMeus}</span>` : ''}</button>
      ${comp ? `<button type="button" role="tab" data-aba="quadro" aria-selected="${est.aba === 'quadro'}">Quadro do comprador${abertos ? ` <span>${abertos}</span>` : ''}</button>` : ''}
    </div>
    ${est.msg ? `<div class="aviso ${est.msg.tipo}">${esc(est.msg.txt)}</div>` : ''}
    <div id="cmCorpo">${est.aba === 'quadro' && comp ? quadro() : est.aba === 'meus' ? listaMeus(meus) : form()}</div>
  </div>`;
  ligar();
}

function form() {
  const r = est.rascunho;
  return `<form class="cm-form" id="cmForm" autocomplete="off">
    <label class="cm-campo"><span>O que precisa? *</span>
      <input type="text" id="cmItem" value="${esc(r.item)}" placeholder="Luva nitrílica, correia do trator 7, toner…" maxlength="160" required></label>
    <div class="cm-duas">
      <label class="cm-campo"><span>Quantidade</span>
        <input type="text" inputmode="decimal" id="cmQtd" value="${esc(r.quantidade)}" placeholder="20"></label>
      <label class="cm-campo"><span>Unidade</span>
        <select id="cmUn">${UNIDADES.map(u => `<option ${r.unidade === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
    </div>
    <label class="cm-campo"><span>Para onde *</span>
      <select id="cmDest" required><option value="">Escolha</option>${DESTINOS.map(d => `<option ${r.destino === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
    <div class="cm-campo"><span>Urgência</span>
      <div class="cm-urg" role="radiogroup">${Object.entries(URG).map(([k, u]) =>
        `<button type="button" role="radio" class="cm-pill ${u.cls}" data-urg="${k}" aria-checked="${r.urgencia === k}">${esc(u.nome)}</button>`).join('')}</div></div>
    <label class="cm-campo"><span>Motivo / onde vai usar</span>
      <textarea id="cmMotivo" rows="2" maxlength="400" placeholder="Reposição da equipe de colheita">${esc(r.motivo)}</textarea></label>
    <p class="cm-erro" id="cmErro" hidden></p>
    <button type="submit" class="btn principal cm-enviar">Enviar ao comprador</button>
    <p class="cm-nota">Pedido por <b>${esc(acesso.nome || acesso.email || '')}</b>. Você acompanha em "Meus pedidos".</p>
  </form>`;
}

function cartaoMeu(p) {
  const s = SIT[p.situacao] || SIT.solicitado;
  return `<div class="cm-card">
    <div class="cm-card-top"><b>${numTxt(p)} ${esc(p.item)}</b><span class="cm-sit" style="--c:${s.cor}">${esc(s.nome)}</span></div>
    <div class="cm-meta">${esc([qtdTxt(p), p.destino].filter(Boolean).join(' · '))} · pedido ${esc(idade(p))}
      ${p.urgencia !== 'normal' ? ` · <span class="cm-pill mini ${URG[p.urgencia]?.cls || ''}">${esc(URG[p.urgencia]?.nome || '')}</span>` : ''}</div>
    ${p.situacao === 'comprado' && p.previsao ? `<div class="cm-meta">Previsão de chegada: <b>${br(p.previsao)}</b>${p.fornecedor ? ' · ' + esc(p.fornecedor) : ''}</div>` : ''}
    ${p.situacao === 'entregue' && p.entregue_em ? `<div class="cm-meta">Entregue em ${br(p.entregue_em)}</div>` : ''}
    ${p.situacao === 'recusado' ? `<div class="cm-meta cm-rec">Recusado${p.recusa_motivo ? ': ' + esc(p.recusa_motivo) : ''}</div>` : ''}
    ${p.obs_comprador && p.situacao !== 'recusado' ? `<div class="cm-meta">Comprador: ${esc(p.obs_comprador)}</div>` : ''}
    ${p.situacao === 'solicitado' ? `<div class="cm-card-acoes"><button type="button" class="btn mini" data-cancelar="${p.id}">Cancelar pedido</button></div>` : ''}
  </div>`;
}

function listaMeus(meus) {
  const fila = naFila().map(p => ({ ...p, numero: null, situacao: 'solicitado', criado_em: new Date().toISOString(), _fila: true }));
  const abertos = meus.filter(p => !['entregue', 'recusado'].includes(p.situacao));
  const fechados = meus.filter(p => ['entregue', 'recusado'].includes(p.situacao)).slice(0, 30);
  if (!meus.length && !fila.length) return `<p class="cm-vazio">Você ainda não pediu nada. Toque em "+ Pedir compra".</p>`;
  return `
    ${fila.length ? `<h3 class="cm-h3">Esperando internet</h3>${fila.map(p => `<div class="cm-card cm-fila"><b>${esc(p.item)}</b><div class="cm-meta">${esc([qtdTxt(p), p.destino].filter(Boolean).join(' · '))} · sobe sozinho quando a rede voltar</div></div>`).join('')}` : ''}
    <h3 class="cm-h3">Em andamento <span>${abertos.length}</span></h3>
    ${abertos.length ? abertos.map(cartaoMeu).join('') : '<p class="cm-vazio">Nada em andamento.</p>'}
    ${fechados.length ? `<h3 class="cm-h3">Concluídos (últimos)</h3>${fechados.map(cartaoMeu).join('')}` : ''}`;
}

const bate = (p, q) => { const n = norm(q).replace(/^#?c-?0*/, ''); return norm(p.item).includes(norm(q)) || String(p.numero) === n || norm(p.pedido_por_nome).includes(norm(q)); };
function filtrar(lista) {
  return lista.filter(p => (!est.destino || p.destino === est.destino) && (!est.urg || p.urgencia === est.urg) && (!est.busca || bate(p, est.busca)));
}
const ordemUrg = { parou: 0, urgente: 1, normal: 2 };

function cartaoQuadro(p) {
  const u = URG[p.urgencia] || URG.normal;
  const prox = { solicitado: 'cotacao', cotacao: 'comprado', comprado: 'entregue' }[p.situacao];
  return `<div class="cm-card cm-q" draggable="true" data-id="${p.id}" tabindex="0">
    <div class="cm-card-top"><span class="cm-pill mini ${u.cls}">${esc(u.nome)}</span><span class="cm-num">${numTxt(p)}</span></div>
    <b class="cm-item">${esc(p.item)}</b>
    <div class="cm-meta">${esc([qtdTxt(p), p.destino].filter(Boolean).join(' · '))}</div>
    <div class="cm-meta">${esc(primeiroNome(p.pedido_por_nome) || primeiroNome(p.pedido_por_email))} · ${esc(idade(p))}</div>
    ${p.situacao === 'comprado' && p.previsao ? `<div class="cm-meta">Chega ${brCurto(p.previsao)}${p.fornecedor ? ' · ' + esc(p.fornecedor) : ''}</div>` : ''}
    ${p.situacao === 'entregue' && p.entregue_em ? `<div class="cm-meta">Recebido ${br(p.entregue_em)}</div>` : ''}
    ${prox ? `<button type="button" class="btn mini cm-avancar" data-avancar="${p.id}" data-para="${prox}">${esc(SIT[prox].nome)} →</button>` : ''}
  </div>`;
}

function quadro() {
  const todos = filtrar(dados.pedidos.filter(p => p.ativo !== false));
  const limiteEntregue = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const cols = COLUNAS.map(s => {
    let itens = todos.filter(p => p.situacao === s);
    if (s === 'entregue') itens = itens.filter(p => (p.entregue_em || p.atualizado_em || '').slice(0, 10) >= limiteEntregue);
    itens.sort((a, b) => s === 'entregue' ? String(b.entregue_em || b.atualizado_em).localeCompare(String(a.entregue_em || a.atualizado_em))
      : (ordemUrg[a.urgencia] - ordemUrg[b.urgencia]) || String(a.criado_em).localeCompare(String(b.criado_em)));
    return { s, itens };
  });
  const recusados = todos.filter(p => p.situacao === 'recusado');
  return `
    <div class="cm-filtros">
      <input type="search" id="cmBusca" placeholder="Pesquisar nº, item ou quem pediu" value="${esc(est.busca)}" aria-label="Pesquisar pedido">
      <select id="cmFDest" aria-label="Para onde"><option value="">Todos os locais</option>${DESTINOS.map(d => `<option ${est.destino === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <select id="cmFUrg" aria-label="Urgência"><option value="">Toda urgência</option>${Object.entries(URG).map(([k, u]) => `<option value="${k}" ${est.urg === k ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>
    </div>
    <div class="cm-quadro">${cols.map(c => `
      <section class="cm-col" data-col="${c.s}">
        <h4><i style="background:${SIT[c.s].cor}"></i>${esc(SIT[c.s].nome)} <span>${c.itens.length}</span></h4>
        ${c.itens.map(cartaoQuadro).join('') || '<p class="cm-vazio">—</p>'}
        ${c.s === 'entregue' ? '<p class="cm-nota">Últimos 30 dias</p>' : ''}
      </section>`).join('')}
    </div>
    ${recusados.length ? `<details class="cm-recusados" ${est.mostrarRecusados ? 'open' : ''}><summary>Recusados (${recusados.length})</summary>
      ${recusados.slice(0, 40).map(p => `<div class="cm-linha" data-id="${p.id}"><b>${numTxt(p)} ${esc(p.item)}</b> · ${esc(primeiroNome(p.pedido_por_nome))} · ${esc(p.recusa_motivo || 'sem motivo')}</div>`).join('')}</details>` : ''}
    <p class="cm-nota">Toque no cartão para abrir (fornecedor, previsão, observação, recusar). No computador dá para arrastar entre as colunas.</p>`;
}

/* ---------------- janela do pedido (comprador) ---------------- */
function abrirPedido(id) {
  const p = dados.pedidos.find(x => x.id === id);
  if (!p) return;
  document.querySelector('dialog.cm-dlg')?.remove();
  const d = document.createElement('dialog');
  d.className = 'cm-dlg';
  const u = URG[p.urgencia] || URG.normal;
  d.innerHTML = `<form method="dialog" class="cm-dlg-in">
    <div class="cm-dlg-top"><div><span class="cm-num">${numTxt(p)}</span> <span class="cm-pill mini ${u.cls}">${esc(u.nome)}</span>
      <h3>${esc(p.item)}</h3>
      <p class="cm-meta">${esc([qtdTxt(p), p.destino].filter(Boolean).join(' · '))} · pedido por ${esc(p.pedido_por_nome || p.pedido_por_email)} em ${br(p.criado_em)}</p>
      ${p.motivo ? `<p class="cm-motivo">${esc(p.motivo)}</p>` : ''}</div>
      <button type="button" class="btn mini" data-x aria-label="Fechar">✕</button></div>
    <div class="cm-sits">${[...COLUNAS, 'recusado'].map(s => `<button type="button" data-sit="${s}" aria-pressed="${p.situacao === s}" style="--c:${SIT[s].cor}">${esc(SIT[s].nome)}</button>`).join('')}</div>
    <div class="cm-duas">
      <label class="cm-campo"><span>Fornecedor</span><input type="text" id="cmdForn" value="${esc(p.fornecedor)}" maxlength="120"></label>
      <label class="cm-campo"><span>Previsão de chegada</span><input type="date" id="cmdPrev" value="${esc(p.previsao || '')}"></label>
    </div>
    <label class="cm-campo"><span>Observação para quem pediu</span><textarea id="cmdObs" rows="2" maxlength="400">${esc(p.obs_comprador)}</textarea></label>
    <label class="cm-campo" id="cmdRecBox" ${p.situacao === 'recusado' ? '' : 'hidden'}><span>Motivo da recusa</span><input type="text" id="cmdRec" value="${esc(p.recusa_motivo)}" maxlength="200" placeholder="Tem no estoque da Faca"></label>
    <p class="cm-erro" id="cmdErro" hidden></p>
    <div class="cm-dlg-pe"><button type="button" class="btn principal" data-salvar>Salvar</button><button type="button" class="btn" data-x>Fechar</button></div>
  </form>`;
  document.body.appendChild(d);
  let sit = p.situacao;
  const pintarSit = () => { d.querySelectorAll('[data-sit]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sit === sit))); d.querySelector('#cmdRecBox').hidden = sit !== 'recusado'; };
  d.querySelectorAll('[data-sit]').forEach(b => b.onclick = () => { sit = b.dataset.sit; pintarSit(); });
  const fechar = () => { d.close(); d.remove(); desenhar(); };
  d.querySelectorAll('[data-x]').forEach(b => b.onclick = fechar);
  d.addEventListener('cancel', ev => { ev.preventDefault(); fechar(); });
  d.querySelector('[data-salvar]').onclick = async () => {
    const rec = limpo(d.querySelector('#cmdRec').value);
    const erro = d.querySelector('#cmdErro');
    if (sit === 'recusado' && !rec) { erro.textContent = 'Escreva o motivo da recusa — quem pediu vai ver.'; erro.hidden = false; return; }
    const campos = { situacao: sit, fornecedor: limpo(d.querySelector('#cmdForn').value) || null,
      previsao: d.querySelector('#cmdPrev').value || null, obs_comprador: limpo(d.querySelector('#cmdObs').value) || null,
      recusa_motivo: sit === 'recusado' ? rec : null };
    Object.assign(campos, carimbos(p, sit));
    const r = await alterar(p.id, campos);
    if (r !== 'ok') { erro.textContent = r === 'semrede' ? 'Sem internet — tente de novo quando a rede voltar.' : r === 'negado' ? 'Você não tem permissão de comprador.' : 'Não salvou. Tente de novo.'; erro.hidden = false; return; }
    fechar();
  };
  d.showModal();
}
const carimbos = (p, sit) => ({
  comprado_em: ['comprado', 'entregue'].includes(sit) ? (p.comprado_em || hojeIso()) : null,
  entregue_em: sit === 'entregue' ? (p.entregue_em || hojeIso()) : null,
});

/* ---------------- ligações ---------------- */
function ligar() {
  const r = alvo;
  r.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { est.aba = b.dataset.aba; est.msg = null; guardarVis(); desenhar(); });
  r.querySelector('#cmAtualizar')?.addEventListener('click', () => carregarCompras());
  r.querySelector('#cmQr')?.addEventListener('click', () => mostrarQr());

  const f = r.querySelector('#cmForm');
  if (f) {
    const ras = est.rascunho;
    const ligaCampo = (id, k) => r.querySelector(id).addEventListener('input', ev => { ras[k] = ev.target.value; });
    ligaCampo('#cmItem', 'item'); ligaCampo('#cmQtd', 'quantidade'); ligaCampo('#cmMotivo', 'motivo');
    r.querySelector('#cmUn').addEventListener('change', ev => { ras.unidade = ev.target.value; });
    r.querySelector('#cmDest').addEventListener('change', ev => { ras.destino = ev.target.value; guardarVis(); });
    r.querySelectorAll('[data-urg]').forEach(b => b.onclick = () => {
      ras.urgencia = b.dataset.urg;
      r.querySelectorAll('[data-urg]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const erro = r.querySelector('#cmErro');
      const item = limpo(ras.item);
      const qtd = limpo(ras.quantidade).replace(',', '.');
      if (!item) { erro.textContent = 'Escreva o que precisa ser comprado.'; erro.hidden = false; r.querySelector('#cmItem').focus(); return; }
      if (qtd && !(Number(qtd) > 0)) { erro.textContent = 'A quantidade precisa ser um número maior que zero.'; erro.hidden = false; r.querySelector('#cmQtd').focus(); return; }
      if (!ras.destino) { erro.textContent = 'Escolha para onde vai.'; erro.hidden = false; r.querySelector('#cmDest').focus(); return; }
      const bt = f.querySelector('.cm-enviar'); bt.disabled = true; bt.textContent = 'Enviando…';
      const res = await pedir({ item, quantidade: qtd ? Number(qtd) : null, unidade: ras.unidade || null,
        destino: ras.destino, urgencia: ras.urgencia || 'normal', motivo: limpo(ras.motivo) || null });
      if (res === 'negado') { bt.disabled = false; bt.textContent = 'Enviar ao comprador'; erro.textContent = 'Seu login não pode lançar pedidos. Peça ao administrador.'; erro.hidden = false; return; }
      est.msg = res === 'ok' ? { tipo: 'ok', txt: `Pedido enviado: ${item}. O comprador já vê no quadro dele.` }
        : { tipo: 'info', txt: `Sem internet: o pedido "${item}" ficou guardado no aparelho e sobe sozinho quando a rede voltar.` };
      Object.assign(ras, { item: '', quantidade: '', motivo: '', urgencia: 'normal' });
      est.aba = 'meus'; guardarVis(); desenhar();
      setTimeout(() => { est.msg = null; }, 8000);
    });
  }

  r.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
    if (!confirm('Cancelar este pedido? Ele sai do quadro do comprador.')) return;
    const res = await alterar(b.dataset.cancelar, { ativo: false });
    if (res !== 'ok') alert(res === 'semrede' ? 'Sem internet — tente de novo depois.' : 'Não deu para cancelar: o comprador já pode ter começado a cotar.');
  });

  // quadro do comprador
  const busca = r.querySelector('#cmBusca');
  if (busca) busca.addEventListener('input', ev => {
    est.busca = ev.target.value; const pos = ev.target.selectionStart;
    desenhar(); const nb = alvo.querySelector('#cmBusca'); if (nb) { nb.focus(); try { nb.setSelectionRange(pos, pos); } catch {} }
  });
  r.querySelector('#cmFDest')?.addEventListener('change', ev => { est.destino = ev.target.value; desenhar(); });
  r.querySelector('#cmFUrg')?.addEventListener('change', ev => { est.urg = ev.target.value; desenhar(); });
  r.querySelector('.cm-recusados')?.addEventListener('toggle', ev => { est.mostrarRecusados = ev.target.open; });
  r.querySelectorAll('[data-avancar]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    const p = dados.pedidos.find(x => x.id === b.dataset.avancar); if (!p) return;
    const para = b.dataset.para;
    const res = await alterar(p.id, { situacao: para, ...carimbos(p, para) });
    if (res !== 'ok') alert(res === 'semrede' ? 'Sem internet — tente de novo depois.' : 'Não salvou. Tente de novo.');
  });
  r.querySelectorAll('.cm-q, .cm-linha').forEach(c => {
    c.addEventListener('click', () => abrirPedido(c.dataset.id));
    c.addEventListener('keydown', ev => { if (ev.key === 'Enter') abrirPedido(c.dataset.id); });
  });
  // arrastar entre colunas (computador)
  r.querySelectorAll('.cm-q').forEach(c => {
    c.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('arrastando'); });
    c.addEventListener('dragend', () => c.classList.remove('arrastando'));
  });
  r.querySelectorAll('.cm-col').forEach(col => {
    col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('alvo'); });
    col.addEventListener('dragleave', () => col.classList.remove('alvo'));
    col.addEventListener('drop', async ev => {
      ev.preventDefault(); col.classList.remove('alvo');
      const p = dados.pedidos.find(x => x.id === ev.dataTransfer.getData('text/plain'));
      const para = col.dataset.col;
      if (!p || p.situacao === para) return;
      const res = await alterar(p.id, { situacao: para, ...carimbos(p, para) });
      if (res !== 'ok') alert(res === 'semrede' ? 'Sem internet — tente de novo depois.' : 'Não salvou. Tente de novo.');
    });
  });
}

/* ---------------- QR code para a parede ---------------- */
let qrLib = null;
function carregarQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLib) qrLib = new Promise((ok, nao) => {
    const s = document.createElement('script');
    s.src = 'vendor/qrcode-generator.js';
    s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; nao(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLib;
}
export async function svgQr(texto) {
  const qrcode = await carregarQrLib();
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
async function mostrarQr() {
  let svg;
  try { svg = await svgQr(LINK_PEDIR); } catch { alert('Não deu para montar o QR code agora. Tente de novo com internet.'); return; }
  const placa = `<style>
      .cm-placa{width:180mm;margin:0 auto;padding:14mm 12mm 10mm;border:1.2mm solid #1B232B;border-radius:6mm;font-family:Arial,sans-serif;color:#1B232B;text-align:center;box-sizing:border-box;background:#fff}
      .cm-placa h1{margin:0;font-size:30pt;letter-spacing:.5pt}
      .cm-placa .sub{margin:3mm 0 7mm;font-size:14pt;color:#51534A}
      .cm-placa .qr{width:110mm;height:110mm;margin:0 auto}
      .cm-placa .qr svg{width:100%;height:100%}
      .cm-placa ol{text-align:left;margin:7mm auto 0;max-width:140mm;font-size:13pt;line-height:1.55;padding-left:8mm}
      .cm-placa .faixa{margin-top:7mm;background:#84BD00;color:#1B232B;font-weight:700;font-size:12pt;padding:3mm;border-radius:2mm}
      .cm-placa footer{margin-top:7mm;display:flex;justify-content:center}
      .cm-placa footer img{height:9mm}
      @media print{.cm-placa{page-break-inside:avoid}}
    </style>
    <article class="cm-placa">
      <h1>PEDIDO DE COMPRA</h1>
      <p class="sub">Precisa de algo? Aponte a câmera do celular</p>
      <div class="qr">${svg}</div>
      <ol><li>Abra a câmera e aponte para o código.</li><li>Entre com o seu login do app LOP - Gestão Rápida.</li>
        <li>Escreva o que precisa, a quantidade e para onde vai.</li><li>Toque em <b>Enviar ao comprador</b>.</li></ol>
      <div class="faixa">Acompanhe em "Meus pedidos" — o comprador vê na hora.</div>
      <footer><img src="img/lop-marca.png" alt="LOP"></footer>
    </article>`;
  mostrar(placa, { barra: true });
}
