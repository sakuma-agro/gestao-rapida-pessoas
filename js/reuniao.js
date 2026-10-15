// reuniao.js — Pessoas › Reunião semanal (15/10/2026)
//
// Pedido do Guilherme: toda semana o administrativo faz a reunião semanal.
//   • Cada semana uma pessoa do ADM traz a FRASE DA SEMANA. Ela aparece na
//     tela principal (ao lado do "Boa tarde, …"), com o nome de quem trouxe.
//   • Os responsáveis pela frase ficam fixos, numa ordem: o rodízio anda uma
//     pessoa por semana.
//   • As ATIVIDADES da semana (café e geladeira, varrer e lixo, impressora e
//     móveis…) também rodam entre as pessoas, uma semana de cada vez.
//
// Telas: Esta semana · Frases · Responsáveis · Atividades.
//
// Rodízio: semana = segunda-feira. k = semanas desde o "início" gravado em
// reu_config ('rodizio'). Frase: pessoas[k mod n]. Atividade j:
// pessoas[(k + j) mod n] — com 5 pessoas e 3 atividades, 2 ficam livres e
// todo mundo passa por todas. Troca de UMA semana só fica em
// reu_semanas.ajustes e não mexe no rodízio.
//
// Offline (regra do app): tudo fica num cache local; gravação sem rede entra
// numa fila e sobe sozinha quando a rede voltar. Leitura é liberada para
// todo login (a frase aparece na tela principal); gravar exige o módulo
// 'reuniao' (RLS app_pode('reuniao')).

import { estado, novoId } from './store.js';
import { acesso, podeTela } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();
const semAcento = s => limpo(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const TELAS_REUNIAO = ['reuSemana', 'reuFrases', 'reuResp', 'reuAtiv'];

const TABELAS = { pessoas: 'reu_pessoas', atividades: 'reu_atividades', semanas: 'reu_semanas', config: 'reu_config' };
const CHAVE = { pessoas: 'id', atividades: 'id', semanas: 'semana', config: 'chave' };
const CACHE = 'gr.reuniao';
const FILA = 'gr.reuniao.fila';

const ler = (k, p) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const dados = { pessoas: [], atividades: [], semanas: [], config: [], carregado: false };
(() => { const c = ler(CACHE, null); if (c) Object.assign(dados, c, { carregado: false }); })();
const salvarCache = () => gravar(CACHE, { pessoas: dados.pessoas, atividades: dados.atividades, semanas: dados.semanas, config: dados.config });

/* ---------------- datas ---------------- */

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDe = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
export function segundaDe(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
}
const somarSemanas = (s, n) => { const d = dataDe(s); d.setDate(d.getDate() + 7 * n); return iso(d); };
const semanasEntre = (de, ate) => Math.round((dataDe(ate) - dataDe(de)) / (7 * 864e5));
const br = s => s ? s.split('-').reverse().join('/') : '';
const brCurto = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
const faixaSemana = s => { const d = dataDe(s); d.setDate(d.getDate() + 4); return `${brCurto(s)} a ${brCurto(iso(d))}`; };
const mod = (a, n) => ((a % n) + n) % n;

/* ---------------- rodízio ---------------- */

const ordem = (a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome, 'pt-BR');
const pessoasAtivas = () => dados.pessoas.filter(p => p.ativo !== false).sort(ordem);
const naFrase = () => pessoasAtivas().filter(p => p.frase !== false);
const nasTarefas = () => pessoasAtivas().filter(p => p.tarefas !== false);
const atividadesAtivas = () => dados.atividades.filter(a => a.ativo !== false).sort(ordem);
const pessoa = id => dados.pessoas.find(p => p.id === id) || null;
const rodizio = () => {
  const c = dados.config.find(x => x.chave === 'rodizio')?.valor || {};
  const hoje = segundaDe();
  return { inicio_frase: c.inicio_frase || hoje, inicio_tarefas: c.inicio_tarefas || hoje };
};
const semanaReg = s => dados.semanas.find(x => x.semana === s) || null;

/** Quem traz a frase na semana s (com a troca da semana, se houver). */
export function responsavelFrase(s) {
  const aj = semanaReg(s)?.ajustes?.frase;
  if (aj && pessoa(aj)) return { pessoa: pessoa(aj), trocado: true };
  const lista = naFrase();
  if (!lista.length) return { pessoa: null };
  return { pessoa: lista[mod(semanasEntre(rodizio().inicio_frase, s), lista.length)], trocado: false };
}

/** Atividades da semana s: [{ atividade, pessoa, trocado, feito }]. */
export function escalaDaSemana(s) {
  const reg = semanaReg(s);
  const lista = nasTarefas();
  const k = semanasEntre(rodizio().inicio_tarefas, s);
  return atividadesAtivas().map((a, j) => {
    const aj = reg?.ajustes?.['atv:' + a.id];
    const p = aj && pessoa(aj) ? pessoa(aj) : (lista.length ? lista[mod(k + j, lista.length)] : null);
    return { atividade: a, pessoa: p, trocado: !!(aj && pessoa(aj)), feito: !!reg?.feitos?.[a.id] };
  });
}

/* ---------------- banco ---------------- */

let ouvintes = new Set();
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch {} });

export async function carregarReuniao() {
  if (!estado.cliente || !estado.sessao) return dados;
  await enviarFila();
  await enviarMarcas().catch(() => {});
  const c = estado.cliente;
  const rs = await Promise.all(Object.values(TABELAS).map(t => c.from(t).select('*')));
  if (rs.some(r => r.error)) return dados;  // sem rede: fica o cache
  Object.keys(TABELAS).forEach((k, i) => { dados[k] = rs[i].data || []; });
  aplicarFilaLocal();
  dados.carregado = true;
  salvarCache();
  avisar();
  return dados;
}

/* O que está na fila e ainda não subiu continua valendo na tela. */
function aplicarFilaLocal() {
  for (const p of ler(FILA, [])) {
    const k = CHAVE[p.colecao], lista = dados[p.colecao];
    const i = lista.findIndex(x => x[k] === p.item[k]);
    if (i >= 0) lista[i] = { ...lista[i], ...p.item }; else lista.push(p.item);
  }
}

let filaRodando = null;
function enviarFila() {
  if (!filaRodando) filaRodando = (async () => {
    const fila = ler(FILA, []);
    if (!fila.length || !estado.cliente || !estado.sessao) return;
    const resto = [];
    for (const p of fila) {
      const { error } = await estado.cliente.from(TABELAS[p.colecao])
        .upsert(p.item, { onConflict: CHAVE[p.colecao] }).then(r => r, e => ({ error: e }));
      if (error) resto.push(p);
    }
    gravar(FILA, [...resto, ...ler(FILA, []).slice(fila.length)]);
  })().finally(() => { filaRodando = null; });
  return filaRodando;
}
window.addEventListener('online', () => { enviarFila().then(() => carregarReuniao()).catch(() => {}); });

async function salvar(colecao, item) {
  const k = CHAVE[colecao];
  if (!item[k]) item[k] = novoId();
  const lista = dados[colecao];
  const i = lista.findIndex(x => x[k] === item[k]);
  if (i >= 0) lista[i] = { ...lista[i], ...item }; else lista.push(item);
  salvarCache(); avisar();
  const enfileirar = () => { const f = ler(FILA, []); f.push({ colecao, item }); gravar(FILA, f); };
  if (!estado.cliente || !estado.sessao || !navigator.onLine) { enfileirar(); return 'fila'; }
  const { error } = await estado.cliente.from(TABELAS[colecao]).upsert(item, { onConflict: k })
    .then(r => r, e => ({ error: e }));
  if (error) {
    // sem permissão não adianta guardar na fila: volta ao que o banco tem
    if (/row-level|permission|42501/i.test(error.message || error.code || '')) {
      await carregarReuniao(); throw new Error('Seu login não tem permissão para alterar a Reunião semanal.');
    }
    enfileirar(); return 'fila';
  }
  return 'ok';
}

const quem = () => estado.sessao?.user?.email || null;
async function salvarSemana(s, parcial) {
  const atual = semanaReg(s) || { semana: s, ajustes: {}, feitos: {} };
  return salvar('semanas', { ...atual, ...parcial, semana: s,
    atualizado_em: new Date().toISOString(), atualizado_por: quem() });
}
async function salvarRodizio(parcial) {
  return salvar('config', { chave: 'rodizio', valor: { ...rodizio(), ...parcial } });
}

/* ---------------- tela principal (áreas) ---------------- */

let pintarInicio = null;
/** Cartão da frase da semana ao lado do "Boa tarde, …". */
export function desenharFraseInicio(alvo, { abrir } = {}) {
  if (!alvo) return;
  /* 15/10/2026, ajuste dele: no painel principal fica SÓ a frase (e quem
     trouxe). Sem frase cadastrada na semana, o cartão não aparece. */
  const pintar = () => {
    const s = segundaDe();
    const reg = semanaReg(s);
    const frase = limpo(reg?.frase);
    if (!frase) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    const autor = limpo(reg?.autor_nome) || responsavelFrase(s).pessoa?.nome || '';
    alvo.hidden = false;
    alvo.innerHTML = `
      <div class="reu-ini-rot">${icone('aspas')} Frase da semana</div>
      <blockquote class="reu-ini-frase">“${esc(frase)}”</blockquote>
      ${autor ? `<div class="reu-ini-autor">— ${esc(autor)}</div>` : ''}`;
  };
  if (pintarInicio) ouvintes.delete(pintarInicio);
  pintarInicio = pintar;
  ouvintes.add(pintar);
  pintar();
  carregarReuniao().catch(() => {});
}

/* Alerta da atividade da semana (15/10/2026, pedido dele): na tela principal
   a atividade NÃO fica no cartão da frase — vira uma mensagem de alerta só
   para quem está com ela, com "Marcar como concluído" na própria mensagem.
   Marca pela função reu_marcar_feito (qualquer login pode marcar a própria
   atividade, mesmo sem o módulo). Sem rede, fica guardado e sobe depois. */
const MARCAS = 'gr.reuniao.marcas';
let pintarAlerta = null;

function meuNome() {
  const n = limpo(acesso.nome) || limpo(acesso.email).split('@')[0];
  return semAcento(n.split(/[\s._-]+/)[0]);
}

async function marcarFeito(s, atividadeId, feito) {
  const reg = semanaReg(s) || { semana: s, ajustes: {}, feitos: {} };
  const feitos = { ...(reg.feitos || {}) };
  if (feito) feitos[atividadeId] = true; else delete feitos[atividadeId];
  const i = dados.semanas.findIndex(x => x.semana === s);
  if (i >= 0) dados.semanas[i] = { ...reg, feitos }; else dados.semanas.push({ ...reg, feitos });
  salvarCache(); avisar();
  const marca = { semana: s, atividade: atividadeId, feito };
  const guardar = () => { const m = ler(MARCAS, []); m.push(marca); gravar(MARCAS, m); };
  if (!estado.cliente || !estado.sessao || !navigator.onLine) { guardar(); return 'fila'; }
  const { error } = await estado.cliente.rpc('reu_marcar_feito', { p_semana: s, p_atividade: atividadeId, p_feito: feito })
    .then(r => r, e => ({ error: e }));
  if (error) { guardar(); return 'fila'; }
  return 'ok';
}
async function enviarMarcas() {
  const m = ler(MARCAS, []);
  if (!m.length || !estado.cliente || !estado.sessao) return;
  const resto = [];
  for (const x of m) {
    const { error } = await estado.cliente.rpc('reu_marcar_feito', { p_semana: x.semana, p_atividade: x.atividade, p_feito: x.feito })
      .then(r => r, e => ({ error: e }));
    if (error) resto.push(x);
  }
  gravar(MARCAS, [...resto, ...ler(MARCAS, []).slice(m.length)]);
}

/** Mensagem de alerta com a atividade da semana de quem está logado. */
let abrirTela = null;
export function desenharAlertaAtividade(alvo, { abrir } = {}) {
  if (!alvo) return;
  abrirTela = abrir || null;
  const pintar = () => {
    const s = segundaDe();
    const eu = meuNome();
    const casa = p => p && eu && semAcento(p.nome.split(' ')[0]) === eu;
    const minhas = escalaDaSemana(s).filter(e => e.pessoa?.tarefas !== false && casa(e.pessoa) && !e.feito);
    /* 15/10/2026, pedido dele: virou a semana, quem traz a frase recebe o
       alerta ao abrir o app. Some quando a frase da semana é cadastrada (ou
       quando a pessoa toca em "Ok, entendi" — vale só para aquela semana,
       neste aparelho). */
    const respFrase = responsavelFrase(s).pessoa;
    const vistoFrase = ler('gr.reuniao.vistoFrase', '') === s;
    const alertaFrase = casa(respFrase) && !limpo(semanaReg(s)?.frase) && !vistoFrase;
    if (!minhas.length && !alertaFrase) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    alvo.hidden = false;
    alvo.innerHTML = (alertaFrase ? `
      <div class="reu-alerta" role="alert">
        <span class="reu-alerta-ic">${icone('alerta')}</span>
        <div class="reu-alerta-txt">
          <b>Frase da semana</b>
          <span>Nesta semana (${faixaSemana(s)}) é você quem traz a frase da reunião semanal.</span>
        </div>
        ${podeTela('reuSemana') ? `<button type="button" class="btn mini reu-alerta-ok" data-frase="ir">${icone('aspas')} Cadastrar a frase</button>` : ''}
        <button type="button" class="btn mini" data-frase="ok">Ok, entendi</button>
      </div>` : '') + minhas.map(e => `
      <div class="reu-alerta" role="alert">
        <span class="reu-alerta-ic">${icone('alerta')}</span>
        <div class="reu-alerta-txt">
          <b>Sua atividade desta semana</b>
          <span>${esc(e.atividade.nome)}</span>
        </div>
        <button type="button" class="btn mini reu-alerta-ok" data-ok="${e.atividade.id}">${icone('check')} Marcar como concluído</button>
      </div>`).join('');
    alvo.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await marcarFeito(s, b.dataset.ok, true);
      if (r === 'fila') mostrarAviso('Sem conexão: marcado neste aparelho, sobe sozinho quando a rede voltar.');
      else mostrarAviso('Atividade marcada como concluída. Obrigado!');
    }));
    alvo.querySelectorAll('[data-frase]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.frase === 'ir' && abrirTela) return abrirTela('reuSemana');
      gravar('gr.reuniao.vistoFrase', s);
      pintar();
    }));
  };
  if (pintarAlerta) ouvintes.delete(pintarAlerta);
  pintarAlerta = pintar;
  ouvintes.add(pintar);
  pintar();
}

/* ---------------- ícones próprios ---------------- */

const IC = {
  aspas: '<path d="M10 7H6a2 2 0 00-2 2v3a2 2 0 002 2h2v1a3 3 0 01-3 3"/><path d="M20 7h-4a2 2 0 00-2 2v3a2 2 0 002 2h2v1a3 3 0 01-3 3"/>',
  cima: '<path d="M6 15l6-6 6 6"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>',
  esq: '<path d="M15 5l-7 7 7 7"/>',
  dir: '<path d="M9 5l7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
};
const icone = n => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ---------------- módulo ---------------- */

const est = { semana: null, busca: '' };
let telaAberta = null;
let aviso = () => {};

function mostrarAviso(texto, tipo = 'ok') {
  const a = $('avisoGlobal');
  if (!a) return;
  a.textContent = texto; a.className = 'aviso ' + tipo; a.hidden = false;
  clearTimeout(mostrarAviso.t);
  mostrarAviso.t = setTimeout(() => { a.hidden = true; }, 5000);
}
aviso = mostrarAviso;
const resultado = r => aviso(r === 'fila' ? 'Sem conexão: salvo neste aparelho, sobe sozinho quando a rede voltar.' : 'Salvo.');
const tentar = async fn => { try { resultado(await fn()); } catch (e) { aviso(e.message || String(e), 'erro'); } };

export function abrirReuniao(tela) {
  telaAberta = tela;
  if (!est.semana) est.semana = segundaDe();
  desenhar();
  if (!ouvintes.has(redesenhar)) ouvintes.add(redesenhar);
  carregarReuniao().catch(() => {});
}
function redesenhar() {
  if (!telaAberta) return;
  const sec = $('tela' + telaAberta[0].toUpperCase() + telaAberta.slice(1));
  if (!sec || sec.hidden) return;
  // não redesenha por baixo de quem está digitando
  if (sec.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  desenhar();
}
function desenhar() {
  const t = telaAberta;
  const sec = $('tela' + t[0].toUpperCase() + t.slice(1));
  if (!sec) return;
  const pode = podeTela(t);
  if (t === 'reuSemana') telaSemana(sec, pode);
  if (t === 'reuFrases') telaFrases(sec);
  if (t === 'reuResp') telaResp(sec, pode);
  if (t === 'reuAtiv') telaAtiv(sec, pode);
}

const COMO_FUNCIONA = `
  <details class="reu-como" open>
    <summary>${icone('info')} Como funciona a reunião semanal</summary>
    <ol>
      <li><b>Toda semana uma pessoa do administrativo traz uma frase.</b> Quem traz segue a ordem da tela <b>Responsáveis</b>, uma pessoa por semana.</li>
      <li><b>Cadastre a frase aqui, em “Esta semana”.</b> Ela aparece na tela principal do LOP, ao lado do “Bom dia / Boa tarde”, com o nome de quem trouxe.</li>
      <li><b>As atividades da semana também rodam.</b> Cada pessoa fica com uma atividade (tela <b>Atividades</b>); na semana seguinte todo mundo anda uma posição.</li>
      <li><b>Alguém vai faltar?</b> Use “Trocar só nesta semana”. O rodízio das próximas semanas não muda.</li>
      <li><b>Na reunião</b>, marque o que foi feito na semana. Todas as frases ficam guardadas na tela <b>Frases</b>.</li>
    </ol>
  </details>`;

function seletorSemana(s) {
  const atual = segundaDe();
  return `<div class="reu-semana">
    <button type="button" class="btn mini" data-sem="-1" title="Semana anterior">${icone('esq')}</button>
    <div class="reu-semana-rot"><b>Semana de ${br(s)}</b><small>${faixaSemana(s)}${s === atual ? ' · esta semana' : ''}</small></div>
    <button type="button" class="btn mini" data-sem="1" title="Próxima semana">${icone('dir')}</button>
    ${s !== atual ? '<button type="button" class="btn mini" data-sem="0">Voltar para esta semana</button>' : ''}
  </div>`;
}
function ligarSemana(sec) {
  sec.querySelectorAll('[data-sem]').forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.sem);
    est.semana = n === 0 ? segundaDe() : somarSemanas(est.semana, n);
    desenhar();
  }));
}
const opcoesPessoas = (sel, lista = pessoasAtivas()) =>
  lista.map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.nome)}</option>`).join('');

/* ----- Esta semana ----- */
function telaSemana(sec, pode) {
  const s = est.semana;
  const reg = semanaReg(s);
  const rf = responsavelFrase(s);
  const escala = escalaDaSemana(s);
  const dis = pode ? '' : ' disabled';
  sec.innerHTML = `
    <div class="cartao">
      <div class="reu-cabeca">
        <div><h2>Reunião semanal</h2><p class="dica" style="margin:0">A frase e as atividades do administrativo desta semana.</p></div>
        ${seletorSemana(s)}
      </div>
      ${COMO_FUNCIONA}
    </div>

    <div class="cartao">
      <h2>${icone('aspas')} Frase da semana</h2>
      <p class="dica">Quem traz nesta semana: <b>${esc(rf.pessoa?.nome || 'ninguém no rodízio')}</b>${rf.trocado ? ' <span class="tag alerta">trocado só nesta semana</span>' : ''}</p>
      <label class="reu-campo">Frase
        <textarea id="reuFrase" rows="3" maxlength="400" placeholder="Escreva aqui a frase que a pessoa trouxe"${dis}>${esc(reg?.frase || '')}</textarea>
      </label>
      <div class="reu-linha">
        <label class="reu-campo">Quem trouxe
          <select id="reuAutor"${dis}>${opcoesPessoas(reg?.autor_id || rf.pessoa?.id)}</select>
        </label>
        <label class="reu-campo">Trocar só nesta semana
          <select id="reuTrocaFrase"${dis}><option value="">— segue o rodízio —</option>${opcoesPessoas(reg?.ajustes?.frase, naFrase())}</select>
        </label>
      </div>
      ${pode ? '<div class="reu-acoes"><button class="btn principal" id="reuSalvarFrase">Salvar frase</button></div>' : '<p class="dica">Só consulta: seu login não altera a reunião semanal.</p>'}
    </div>

    <div class="cartao">
      <h2>Atividades da semana</h2>
      <p class="dica">Cada um cuida da sua durante a semana. Na reunião, marque o que foi feito.</p>
      ${escala.length ? `<div class="reu-escala">${escala.map(e => `
        <div class="reu-atv${e.feito ? ' feito' : ''}">
          <label class="reu-check"><input type="checkbox" data-feito="${e.atividade.id}"${e.feito ? ' checked' : ''}${dis}><span>${e.feito ? 'Feito' : 'Marcar feito'}</span></label>
          <div class="reu-atv-txt">
            <b>${esc(e.atividade.nome)}</b>
            ${limpo(e.atividade.passos) ? `<ul>${limpo(e.atividade.passos).split('\n').filter(x => limpo(x)).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class="reu-atv-quem">
            <span class="reu-pessoa">${esc(e.pessoa?.nome || '—')}</span>
            ${e.trocado ? '<span class="tag alerta">trocado</span>' : ''}
            ${pode ? `<select data-troca="${e.atividade.id}" title="Trocar só nesta semana"><option value="">trocar nesta semana…</option>${opcoesPessoas(reg?.ajustes?.['atv:' + e.atividade.id], nasTarefas())}</select>` : ''}
          </div>
        </div>`).join('')}</div>` : '<p class="dica">Nenhuma atividade cadastrada. Cadastre na tela Atividades.</p>'}
      ${livres(escala).length ? `<p class="dica" style="margin:10px 0 0">Livres nesta semana: ${livres(escala).map(p => esc(p.nome)).join(', ')}.</p>` : ''}
      <label class="reu-campo" style="margin-top:12px">Anotações da reunião
        <textarea id="reuObs" rows="3" placeholder="O que foi combinado na reunião (opcional)"${dis}>${esc(reg?.obs || '')}</textarea>
      </label>
      ${pode ? '<div class="reu-acoes"><button class="btn" id="reuSalvarObs">Salvar anotações</button></div>' : ''}
    </div>`;
  ligarSemana(sec);
  if (!pode) return;

  $('reuTrocaFrase').addEventListener('change', ev => {
    const p = ev.target.value || rf.pessoa?.id;
    // o autor acompanha a troca, se ainda não tem frase gravada
    if (!limpo(reg?.frase)) {
      const novo = ev.target.value ? ev.target.value : (() => {
        const l = naFrase(); return l.length ? l[mod(semanasEntre(rodizio().inicio_frase, s), l.length)].id : '';
      })();
      $('reuAutor').value = novo || p || '';
    }
  });
  $('reuSalvarFrase').addEventListener('click', () => tentar(async () => {
    const frase = limpo($('reuFrase').value);
    const autor = pessoa($('reuAutor').value);
    const troca = $('reuTrocaFrase').value;
    const ajustes = { ...(reg?.ajustes || {}) };
    if (troca) ajustes.frase = troca; else delete ajustes.frase;
    return salvarSemana(s, { frase: frase || null, autor_id: autor?.id || null, autor_nome: autor?.nome || null, ajustes });
  }));
  $('reuSalvarObs').addEventListener('click', () => tentar(() => salvarSemana(s, { obs: limpo($('reuObs').value) || null })));
  sec.querySelectorAll('[data-feito]').forEach(c => c.addEventListener('change', () => tentar(() => {
    const feitos = { ...(semanaReg(s)?.feitos || {}) };
    if (c.checked) feitos[c.dataset.feito] = true; else delete feitos[c.dataset.feito];
    return salvarSemana(s, { feitos });
  })));
  sec.querySelectorAll('[data-troca]').forEach(sl => sl.addEventListener('change', () => tentar(() => {
    const ajustes = { ...(semanaReg(s)?.ajustes || {}) };
    if (sl.value) ajustes['atv:' + sl.dataset.troca] = sl.value; else delete ajustes['atv:' + sl.dataset.troca];
    return salvarSemana(s, { ajustes });
  })));
}
const livres = escala => {
  const ocupados = new Set(escala.map(e => e.pessoa?.id));
  return nasTarefas().filter(p => !ocupados.has(p.id));
};

/* ----- Frases ----- */
function telaFrases(sec) {
  const b = semAcento(est.busca);
  const lista = dados.semanas.filter(r => limpo(r.frase))
    .filter(r => !b || semAcento(r.frase + ' ' + (r.autor_nome || '')).includes(b))
    .sort((a, c) => c.semana.localeCompare(a.semana));
  sec.innerHTML = `
    <div class="cartao">
      <div class="reu-cabeca">
        <div><h2>Frases da semana</h2><p class="dica" style="margin:0">Todas as frases já trazidas, da mais nova para a mais antiga.</p></div>
        <input type="search" id="reuBusca" placeholder="Buscar frase ou pessoa" value="${esc(est.busca)}" style="max-width:260px">
      </div>
      ${lista.length ? `<div class="reu-frases">${lista.map(r => `
        <div class="reu-fr">
          <div class="reu-fr-data">${br(r.semana)}</div>
          <blockquote>“${esc(r.frase)}”</blockquote>
          <div class="reu-fr-autor">— ${esc(r.autor_nome || '')}</div>
        </div>`).join('')}</div>`
        : `<p class="dica">${b ? 'Nenhuma frase encontrada.' : 'Nenhuma frase guardada ainda. Cadastre a primeira em “Esta semana”.'}</p>`}
      <p class="dica" style="margin:12px 0 0">${lista.length} frase${lista.length === 1 ? '' : 's'}.</p>
    </div>`;
  const i = $('reuBusca');
  i.addEventListener('input', () => { est.busca = i.value; telaFrases(sec); const n = $('reuBusca'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
}

/* ----- prévia do rodízio ----- */
function previa(tipo, semanas = 8) {
  const s0 = segundaDe();
  const linhas = [];
  for (let i = 0; i < semanas; i++) {
    const s = somarSemanas(s0, i);
    if (tipo === 'frase') {
      linhas.push(`<tr${i === 0 ? ' class="atual"' : ''}><td>${br(s)}</td><td>${esc(responsavelFrase(s).pessoa?.nome || '—')}</td></tr>`);
    } else {
      const e = escalaDaSemana(s);
      linhas.push(`<tr${i === 0 ? ' class="atual"' : ''}><td>${br(s)}</td>${e.map(x => `<td>${esc(x.pessoa?.nome || '—')}</td>`).join('')}</tr>`);
    }
  }
  const cab = tipo === 'frase' ? '<th>Semana</th><th>Traz a frase</th>'
    : '<th>Semana</th>' + atividadesAtivas().map(a => `<th>${esc(a.nome)}</th>`).join('');
  return `<div class="reu-tab-rolar"><table class="reu-tab"><thead><tr>${cab}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
}

/* "Quem começa nesta semana": recalcula o início para a pessoa escolhida
   cair na semana atual. */
function inicioPara(pessoaId, lista, deslocamento = 0) {
  const i = lista.findIndex(p => p.id === pessoaId);
  if (i < 0) return null;
  return somarSemanas(segundaDe(), -(i - deslocamento));
}

/* ----- Responsáveis ----- */
function telaResp(sec, pode) {
  const lista = [...dados.pessoas].sort((a, b) => (a.ativo === false) - (b.ativo === false) || ordem(a, b));
  const dis = pode ? '' : ' disabled';
  const atual = responsavelFrase(segundaDe());
  sec.innerHTML = `
    <div class="cartao">
      <h2>Responsáveis da reunião semanal</h2>
      <p class="dica">A ordem desta lista é a ordem do rodízio: cada semana a próxima pessoa traz a frase. Use as setas para mudar a ordem.
        Desmarque “Frase” ou “Atividades” para tirar alguém de um dos rodízios sem apagar.</p>
      <div class="reu-tab-rolar"><table class="reu-tab">
        <thead><tr><th>Ordem</th><th>Nome</th><th>Frase</th><th>Atividades</th><th>Situação</th><th></th></tr></thead>
        <tbody>${lista.map((p, i) => `<tr${p.ativo === false ? ' class="inativo"' : ''}>
          <td class="reu-ord">${p.ativo === false ? '—' : `${i + 1}
            ${pode ? `<button class="btn mini" data-sobe="${p.id}" title="Subir"${i === 0 ? ' disabled' : ''}>${icone('cima')}</button>
            <button class="btn mini" data-desce="${p.id}" title="Descer"${i === pessoasAtivas().length - 1 ? ' disabled' : ''}>${icone('baixo')}</button>` : ''}`}</td>
          <td><input type="text" data-nome="${p.id}" value="${esc(p.nome)}"${dis}></td>
          <td><input type="checkbox" data-fr="${p.id}"${p.frase !== false ? ' checked' : ''}${dis}></td>
          <td><input type="checkbox" data-tf="${p.id}"${p.tarefas !== false ? ' checked' : ''}${dis}></td>
          <td><span class="tag ${p.ativo === false ? 'inativo' : 'ativo'}">${p.ativo === false ? 'Inativo' : 'Ativo'}</span></td>
          <td>${pode ? `<button class="btn mini" data-ativo="${p.id}">${p.ativo === false ? 'Reativar' : 'Desativar'}</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      ${pode ? `<div class="reu-linha" style="margin-top:12px">
        <label class="reu-campo">Nova pessoa<input type="text" id="reuNovaPessoa" placeholder="Nome"></label>
        <div class="reu-acoes" style="align-self:end"><button class="btn" id="reuAddPessoa">Adicionar</button></div>
      </div>` : ''}
    </div>

    <div class="cartao">
      <h2>Rodízio da frase</h2>
      <p class="dica">Escolha quem traz a frase <b>nesta semana</b>; as próximas seguem a ordem acima.</p>
      ${pode ? `<label class="reu-campo" style="max-width:320px">Nesta semana quem traz é
        <select id="reuComecaFrase">${opcoesPessoas(atual.trocado ? null : atual.pessoa?.id, naFrase())}</select></label>` : ''}
      <h3 class="reu-sub">Próximas 8 semanas</h3>
      ${previa('frase')}
    </div>`;
  if (!pode) return;
  const ativos = () => pessoasAtivas();
  const reordenar = async (id, dir) => {
    const l = ativos(); const i = l.findIndex(p => p.id === id); const j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    let r = 'ok';
    for (let k = 0; k < l.length; k++) if (l[k].ordem !== k + 1) r = (await salvar('pessoas', { ...l[k], ordem: k + 1 })) === 'fila' ? 'fila' : r;
    return r;
  };
  sec.querySelectorAll('[data-sobe]').forEach(b => b.addEventListener('click', () => tentar(() => reordenar(b.dataset.sobe, -1))));
  sec.querySelectorAll('[data-desce]').forEach(b => b.addEventListener('click', () => tentar(() => reordenar(b.dataset.desce, 1))));
  sec.querySelectorAll('[data-nome]').forEach(i => i.addEventListener('change', () => {
    const nome = limpo(i.value); if (!nome) { i.value = pessoa(i.dataset.nome).nome; return; }
    tentar(() => salvar('pessoas', { ...pessoa(i.dataset.nome), nome }));
  }));
  sec.querySelectorAll('[data-fr]').forEach(c => c.addEventListener('change', () =>
    tentar(() => salvar('pessoas', { ...pessoa(c.dataset.fr), frase: c.checked }))));
  sec.querySelectorAll('[data-tf]').forEach(c => c.addEventListener('change', () =>
    tentar(() => salvar('pessoas', { ...pessoa(c.dataset.tf), tarefas: c.checked }))));
  sec.querySelectorAll('[data-ativo]').forEach(b => b.addEventListener('click', () => {
    const p = pessoa(b.dataset.ativo);
    tentar(() => salvar('pessoas', { ...p, ativo: p.ativo === false, ordem: p.ativo === false ? pessoasAtivas().length + 1 : p.ordem }));
  }));
  $('reuAddPessoa').addEventListener('click', () => {
    const nome = limpo($('reuNovaPessoa').value);
    if (!nome) return aviso('Escreva o nome.', 'erro');
    tentar(() => salvar('pessoas', { id: novoId(), nome, ordem: pessoasAtivas().length + 1, frase: true, tarefas: true, ativo: true }));
  });
  $('reuComecaFrase').addEventListener('change', ev => {
    const ini = inicioPara(ev.target.value, naFrase());
    if (ini) tentar(() => salvarRodizio({ inicio_frase: ini }));
  });
}

/* ----- Atividades ----- */
function telaAtiv(sec, pode) {
  const lista = [...dados.atividades].sort((a, b) => (a.ativo === false) - (b.ativo === false) || ordem(a, b));
  const dis = pode ? '' : ' disabled';
  const primeira = atividadesAtivas()[0];
  const atual = primeira ? escalaDaSemana(segundaDe())[0] : null;
  sec.innerHTML = `
    <div class="cartao">
      <h2>Atividades semanais do escritório</h2>
      <p class="dica">Cada atividade tem um passo a passo (uma linha por passo) — é o que aparece em “Esta semana” para quem está com ela.
        A cada semana as pessoas andam uma posição: quem fez a atividade 1 passa para a 2, e assim por diante.</p>
      <div class="reu-ativs">${lista.map((a, i) => `
        <div class="reu-ativ${a.ativo === false ? ' inativo' : ''}">
          <div class="reu-ativ-num">${a.ativo === false ? '—' : 'Atividade ' + (i + 1)}</div>
          <label class="reu-campo">Nome<input type="text" data-anome="${a.id}" value="${esc(a.nome)}"${dis}></label>
          <label class="reu-campo">Passo a passo (uma linha por passo)
            <textarea rows="4" data-apassos="${a.id}"${dis}>${esc(a.passos || '')}</textarea></label>
          ${pode ? `<div class="reu-acoes">
            <button class="btn mini" data-asobe="${a.id}"${i === 0 || a.ativo === false ? ' disabled' : ''}>${icone('cima')} Subir</button>
            <button class="btn mini" data-adesce="${a.id}"${i >= atividadesAtivas().length - 1 || a.ativo === false ? ' disabled' : ''}>${icone('baixo')} Descer</button>
            <button class="btn mini" data-asalvar="${a.id}">Salvar</button>
            <button class="btn mini perigo" data-aativo="${a.id}">${a.ativo === false ? 'Reativar' : 'Desativar'}</button>
          </div>` : ''}
        </div>`).join('')}</div>
      ${pode ? `<div class="reu-acoes" style="margin-top:12px"><button class="btn" id="reuAddAtv">Nova atividade</button></div>` : ''}
    </div>

    <div class="cartao">
      <h2>Escala das atividades</h2>
      ${pode && primeira ? `<label class="reu-campo" style="max-width:420px">Nesta semana, “${esc(primeira.nome)}” fica com
        <select id="reuComecaAtv">${opcoesPessoas(atual?.trocado ? null : atual?.pessoa?.id, nasTarefas())}</select></label>
        <p class="dica">As outras atividades seguem a ordem da tela Responsáveis a partir dessa pessoa.</p>` : ''}
      <h3 class="reu-sub">Próximas 8 semanas</h3>
      ${atividadesAtivas().length ? previa('tarefas') : '<p class="dica">Cadastre uma atividade para ver a escala.</p>'}
    </div>`;
  if (!pode) return;
  const reordenar = async (id, dir) => {
    const l = atividadesAtivas(); const i = l.findIndex(a => a.id === id); const j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    let r = 'ok';
    for (let k = 0; k < l.length; k++) if (l[k].ordem !== k + 1) r = (await salvar('atividades', { ...l[k], ordem: k + 1 })) === 'fila' ? 'fila' : r;
    return r;
  };
  const atv = id => dados.atividades.find(a => a.id === id);
  sec.querySelectorAll('[data-asobe]').forEach(b => b.addEventListener('click', () => tentar(() => reordenar(b.dataset.asobe, -1))));
  sec.querySelectorAll('[data-adesce]').forEach(b => b.addEventListener('click', () => tentar(() => reordenar(b.dataset.adesce, 1))));
  sec.querySelectorAll('[data-asalvar]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.asalvar;
    const nome = limpo(sec.querySelector(`[data-anome="${id}"]`).value);
    if (!nome) return aviso('A atividade precisa de um nome.', 'erro');
    const passos = sec.querySelector(`[data-apassos="${id}"]`).value.split('\n').map(limpo).filter(Boolean).join('\n');
    tentar(() => salvar('atividades', { ...atv(id), nome, passos: passos || null }));
  }));
  sec.querySelectorAll('[data-aativo]').forEach(b => b.addEventListener('click', () => {
    const a = atv(b.dataset.aativo);
    tentar(() => salvar('atividades', { ...a, ativo: a.ativo === false, ordem: a.ativo === false ? atividadesAtivas().length + 1 : a.ordem }));
  }));
  $('reuAddAtv').addEventListener('click', () =>
    tentar(() => salvar('atividades', { id: novoId(), nome: 'Nova atividade', passos: null, ordem: atividadesAtivas().length + 1, ativo: true })));
  const sel = $('reuComecaAtv');
  if (sel) sel.addEventListener('change', () => {
    const ini = inicioPara(sel.value, nasTarefas());
    if (ini) tentar(() => salvarRodizio({ inicio_tarefas: ini }));
  });
}

export function limparReuniao() { telaAberta = null; est.semana = null; est.busca = ''; }
