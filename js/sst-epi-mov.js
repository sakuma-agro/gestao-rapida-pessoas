// sst-epi-mov.js — SST › EPI's › Entregas, Entradas e Saldo por estoque (13/11/2026).
//
// Pedido do Guilherme: "quero dar saída pelo sistema, controlando entrada e
// saída… usar a mesma ficha de EPI que temos. Se o funcionário pegou EPI hoje,
// gera uma ficha; se pegou amanhã, gera outra."
// Escolhas dele (13/11/2026):
//   · o EPI sai SEMPRE do Estoque (Cadastros › Itens do grupo EPIs, um item por
//     CA e tamanho) e o histórico fica também no Estoque (est_movimentos);
//   · saldo = última contagem + entradas − saídas (js/epi-saldo.js);
//   · o funcionário confirma no papel: cada entrega imprime a ficha de EPI de
//     sempre (js/ficha.js) já preenchida, e depois marca-se "ficha assinada".
// Cada entrega = um lançamento (lancamento_id) com uma linha por EPI;
// origem = 'epi', mer = motivo (M.E.R da ficha), faz = letra da fazenda.
// A próxima troca vem da periodicidade do item (est_itens.troca_qtd/unidade).
import { estado, modeloAtual } from './store.js';
import { acesso } from './acesso.js';
import { montarFicha, linhaVazia } from './ficha.js';
import { mostrar } from './jornada-relatorios.js';
import { estadoCa, caReprovado } from './ca.js';
import { saldosEpi, ehQuebraCocao, semAcento, tipoDoEpi, somarPrazo } from './epi-saldo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : NaN; };
const mostra = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('pt-BR');
const chip = (cor, txt) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const quem = () => estado.sessao?.user?.email || '';
const admin = () => !!acesso.admin;

export const TELAS_EPI_MOV = ['epiSaida', 'epiEntrada', 'epiSaldo'];

/* ===================================================================
   DADOS — lidos direto do banco (precisa de internet)
   =================================================================== */
const D = { locais: [], itens: [], movimentos: [], contagens: [], grupos: [], linhas: [], minimos: [], lido: 0, erro: '' };
async function tudo(tabela, colunas = '*', filtro) {
  let saida = [];
  for (let de = 0; ; de += 1000) {
    let q = estado.cliente.from(tabela).select(colunas);
    if (filtro) q = filtro(q);
    const r = await q.range(de, de + 999);
    if (r.error) throw r.error;
    saida = saida.concat(r.data || []);
    if (!r.data || r.data.length < 1000) break;
  }
  return saida;
}
async function carregar(forcar) {
  if (!forcar && D.lido && Date.now() - D.lido < 60000) return;
  if (!estado.cliente) { D.erro = 'sem conexão com o banco'; return; }
  try {
    const [locais, itens, movimentos, contagens, grupos, linhas, minimos] = await Promise.all([
      tudo('est_locais', '*', q => q.eq('ativo', true).order('ordem')),
      tudo('est_itens', 'id,nome,unidade,grupo,ca,ca_situacao,ca_validade,ca_conferido_em,troca_qtd,troca_unidade,lavagens_max,estoque_minimo,pedido_reposicao,locais_contagem,codigo,ativo', q => q.eq('grupo', 'EPIs')),
      tudo('est_movimentos', '*', q => q.order('data')),
      tudo('est_contagens'),
      tudo('est_contagem_grupos', '*', q => q.eq('grupo', 'EPIs')),
      tudo('est_contagem_itens', 'id,contagem_id,item_id,quantidade'),
      tudo('est_minimos'),
    ]);
    const ids = new Set(itens.map(i => i.id));
    Object.assign(D, { locais, itens, contagens, grupos, minimos,
      movimentos: movimentos.filter(m => ids.has(m.item_id)),
      linhas: linhas.filter(l => ids.has(l.item_id)), lido: Date.now(), erro: '' });
  } catch (e) {
    console.error(e);
    D.erro = (e && (e.message || e.details)) || String(e);
  }
}
const ativos = l => l.filter(x => x.ativo !== false);
const itemDe = id => D.itens.find(i => i.id === id) || { nome: '(item apagado)', unidade: '' };
const localDe = id => D.locais.find(l => l.id === id) || { nome: '—' };
const funcDe = id => (estado.funcionarios || []).find(f => f.id === id);
const contaNoLocal = (i, localId) => !Array.isArray(i.locais_contagem) || !i.locais_contagem.length || i.locais_contagem.includes(localId);
const saldosDo = localId => saldosEpi(D, localId);
const minimoDe = (item, localId) => {
  const m = D.minimos.find(x => x.item_id === item.id && x.local_id === localId && x.ativo !== false);
  const v = m && m.estoque_minimo !== null && m.estoque_minimo !== '' ? m.estoque_minimo : item.estoque_minimo;
  return v === null || v === undefined || v === '' ? null : Number(v);
};
const nomeSemCa = n => String(n || '').replace(/\s*\(\s*ca[^)]*\)/ig, '').replace(/\s+/g, ' ').trim();

/* Estoque padrão do funcionário: a fazenda do cadastro. */
function localDoFunc(f) {
  const fz = semAcento(f && f.fazenda);
  if (!fz) return '';
  const l = D.locais.find(x => fz.includes(semAcento(x.fazenda || x.nome).replace(/^FAZ(ENDA)?\.?\s+/, '')) || semAcento(x.fazenda) === fz);
  return l ? l.id : '';
}
/* Letra da coluna FAZ da ficha, pela legenda do Modelo da ficha ("F - FACA", "L - LOTE 35"…). */
function letraFaz(local) {
  const pares = [];
  for (const linha of (modeloAtual().legenda_faz || [])) for (const parte of String(linha).split('/')) {
    const m = /^\s*([A-Z])\s*-\s*(.+?)\s*$/i.exec(parte);
    if (m) pares.push([m[1].toUpperCase(), semAcento(m[2])]);
  }
  const n = semAcento((local.fazenda || '') + ' ' + local.nome);
  const p = pares.find(([, nome]) => n.includes(nome));
  return p ? p[0] : (semAcento(local.nome).replace(/^FAZ(ENDA)?\.?\s+/, '')[0] || '');
}
/* Motivos M.E.R da ficha: "1- Substituição por Dano Justificado" → { cod: '1', texto }. */
const motivos = () => (modeloAtual().legenda_mer || []).map(t => {
  const m = /^\s*(\d+)\s*-\s*(.+)$/.exec(t); return m ? { cod: m[1], texto: m[2] } : null;
}).filter(Boolean);

/* Entregas = lançamentos de saída para funcionário (origem 'epi' ou saída de EPI com funcionário). */
function entregas() {
  const g = new Map();
  for (const m of ativos(D.movimentos)) {
    if (m.sentido !== 'saida' || !m.funcionario_id || m.pendente) continue;
    const k = m.lancamento_id || m.id;
    if (!g.has(k)) g.set(k, { id: k, data: String(m.data).slice(0, 10), funcionario_id: m.funcionario_id, funcionario: m.funcionario,
      local_id: m.local_id, linhas: [], assinada: true, por: m.criado_por || m.operador || '', origem: m.origem || '' });
    const e = g.get(k);
    e.linhas.push(m);
    if (!m.ficha_assinada) e.assinada = false;
  }
  return [...g.values()].sort((a, b) => b.data.localeCompare(a.data) || String(a.funcionario).localeCompare(String(b.funcionario), 'pt-BR'));
}
function entradas() {
  const g = new Map();
  for (const m of ativos(D.movimentos)) {
    if (m.sentido !== 'entrada' || m.origem !== 'epi') continue;
    const k = m.lancamento_id || m.id;
    if (!g.has(k)) g.set(k, { id: k, data: String(m.data).slice(0, 10), local_id: m.local_id, tipo: m.tipo, documento: m.documento,
      fornecedor: m.fornecedor || m.outra_fazenda, linhas: [], por: m.criado_por || '' });
    g.get(k).linhas.push(m);
  }
  return [...g.values()].sort((a, b) => b.data.localeCompare(a.data));
}

/* Próxima troca: última entrega de cada TIPO de EPI (sem CA e tamanho) a cada funcionário. */
function trocas() {
  const ult = new Map();
  for (const m of ativos(D.movimentos)) {
    if (m.sentido !== 'saida' || !m.funcionario_id || m.pendente) continue;
    const it = itemDe(m.item_id);
    if (!it.troca_qtd) continue;
    const k = m.funcionario_id + '|' + tipoDoEpi(it.nome);
    const dia = String(m.data).slice(0, 10);
    const a = ult.get(k);
    if (!a || dia > a.data) ult.set(k, { funcionario_id: m.funcionario_id, funcionario: m.funcionario, item: it, data: dia, tipo: tipoDoEpi(it.nome) });
  }
  const h = hoje();
  return [...ult.values()].map(t => {
    const proxima = somarPrazo(t.data, t.item.troca_qtd, t.item.troca_unidade);
    const dias = Math.round((Date.parse(proxima) - Date.parse(h)) / 86400000);
    const f = funcDe(t.funcionario_id);
    const sit = f && f.situacao && f.situacao !== 'ATIVO' ? { chave: 'fora', cor: 'neutra', rotulo: 'desligado' }
      : dias < 0 ? { chave: 'atrasada', cor: 'perigo', rotulo: `atrasada ${-dias} dia${dias === -1 ? '' : 's'}` }
        : dias <= 15 ? { chave: 'logo', cor: 'alerta', rotulo: dias ? `em ${dias} dia${dias === 1 ? '' : 's'}` : 'hoje' }
          : { chave: 'emdia', cor: 'ativo', rotulo: 'em dia' };
    return { ...t, proxima, dias, sit };
  }).sort((a, b) => a.proxima.localeCompare(b.proxima));
}
const textoTroca = it => it && it.troca_qtd ? `a cada ${it.troca_qtd} ${Number(it.troca_qtd) === 1 ? ({ dias: 'dia', semanas: 'semana', meses: 'mês' })[it.troca_unidade || 'meses'] : (it.troca_unidade || 'meses')}` : 'conforme desgaste';

/* ===================================================================
   FICHA (a mesma do SST › Fichas) — uma por entrega
   =================================================================== */
function fichaHtml(e) {
  const f = funcDe(e.funcionario_id) || { id: e.funcionario_id, nome: e.funcionario || '' };
  const m = modeloAtual();
  const local = localDe(e.local_id);
  const faz = letraFaz(local);
  const dt = new Date(e.data + 'T12:00:00');
  const linhas = e.linhas.map(l => {
    const it = itemDe(l.item_id);
    return { ...linhaVazia(), faz: l.faz || faz, data: br(e.data), qtd: mostra(l.quantidade), ca: it.ca || '',
      descricao: nomeSemCa(it.nome).toUpperCase(), mer: l.mer || '' };
  });
  const n = Math.max(linhas.length, Number(m.linhas_padrao) || 20);
  while (linhas.length < n) linhas.push(linhaVazia());
  return montarFicha(f, m, { mes: dt.getMonth(), ano: dt.getFullYear(), linhas, chave: 'epm|' + e.id });
}
function imprimirFichas(lista) {
  if (!lista.length) { alert('Nenhuma entrega para imprimir.'); return; }
  mostrar(`<div class="previa" style="margin-top:0">${lista.map(fichaHtml).join('')}</div>`, { barra: true });
}

/* ===================================================================
   TELAS
   =================================================================== */
const F = { busca: '', mes: hoje().slice(0, 7), sit: '', local: '', soMin: false, histBusca: '', verTrocas: '' };
let telaAtual = '';

export async function abrirEpiMov(nome) {
  telaAtual = nome;
  const tela = $('tela' + nome[0].toUpperCase() + nome.slice(1));
  if (!tela) return;
  if (!D.lido) tela.innerHTML = '<div class="cartao"><p class="dica">Abrindo o estoque de EPIs…</p></div>';
  await carregar(false);
  desenhar();
}
function desenhar() {
  const nome = telaAtual;
  const tela = $('tela' + nome[0].toUpperCase() + nome.slice(1));
  if (!tela || tela.hidden) return;
  if (D.erro && !D.itens.length) {
    tela.innerHTML = `<div class="cartao"><p class="aviso erro">Não consegui ler o estoque de EPIs (${esc(D.erro)}). Confira a internet e abra de novo.</p></div>`;
    return;
  }
  if (nome === 'epiSaida') telaSaida(tela);
  else if (nome === 'epiEntrada') telaEntrada(tela);
  else if (nome === 'epiSaldo') telaSaldo(tela);
}

/* ---------------- ENTREGAS (saída para o funcionário) ----------------
   Lean (13/11/2026, pedido dele "deixe o painel mais lean"): a entrega se faz
   na própria tela, sem janela — funcionário, data, EPI, quantidade, salvar.
   Estoque e motivo vêm sozinhos (dá para trocar). Pendências viram 2 avisos
   curtos; a lista do mês fica embaixo, só com Ficha e Assinada. */
const FORM = { func: '', data: '', local: '', linhas: [{ item: '', qtd: '1', mer: '' }] };
const limparForm = () => Object.assign(FORM, { func: '', data: '', local: '', linhas: [{ item: '', qtd: '1', mer: '' }] });

function guia(id, passos) {
  try { if (localStorage.getItem('gr.guia.' + id) === 'x') return ''; } catch (e) { /* sem armazenamento */ }
  return `<div class="guia" data-guia="${id}">${passos.map((t, i) => `<span class="guia-p"><i>${i + 1}</i><span>${t}</span></span>`).join('')}
    <button type="button" class="guia-x" title="Entendi, esconder" aria-label="Esconder o passo a passo">✕</button></div>`;
}

function telaSaida(tela) {
  const todas = entregas();
  const tr = trocas().filter(t => t.sit.chave !== 'fora');
  const pendAss = todas.filter(e => !e.assinada);
  const atras = tr.filter(t => t.sit.chave === 'atrasada');
  const q = semAcento(F.busca);
  const vis = todas.filter(e => (F.sit === 'pend' ? !e.assinada : (!F.mes || e.data.startsWith(F.mes)))
    && (!q || semAcento(e.funcionario + ' ' + e.linhas.map(l => itemDe(l.item_id).nome).join(' ')).includes(q)));
  const listaTrocas = F.verTrocas ? atras : [];

  tela.innerHTML = `<div class="cartao naoimprimir epm-lean">
    <div class="barra entre" style="margin:0 0 8px">
      <h2 style="margin:0">Entrega de EPI</h2>
      <button class="btn mini" type="button" id="epmAtualizar" title="Ler de novo do banco">↻ Atualizar</button>
    </div>
    ${guia('epi-entrega', ['Escolha o <b>funcionário</b>', 'Escolha o <b>EPI</b> e a <b>quantidade</b>', '<b>Salvar</b> e imprimir a ficha', 'Ele assinou? Toque em <b>Assinada ✓</b>'])}
    <form id="epmForm" class="epm-form" autocomplete="off">
      <div class="epm-topo">
        <label class="campo epm-func">Funcionário <input type="text" id="epmFunc" list="epmFuncs" value="${esc(FORM.func)}" placeholder="digite o nome"></label>
        <label class="campo epm-data">Data <input type="date" id="epmData" value="${esc(FORM.data || hoje())}" max="${hoje()}"></label>
      </div>
      <datalist id="epmFuncs"></datalist>
      <p class="epm-info" id="epmInfo"></p>
      <div id="epmLinhas" class="epm-itens"></div>
      <datalist id="epmItens"></datalist>
      <div class="barra entre epm-pe">
        <button class="btn" type="button" id="epmMais">+ Outro EPI</button>
        <span class="barra" style="margin:0">
          <button class="btn" type="button" id="epmLimpar">Limpar</button>
          <button class="btn principal" type="submit" id="epmSalvar">Salvar e imprimir ficha</button>
        </span>
      </div>
      <p class="aviso erro" id="epmAviso" hidden></p>
    </form>

    ${pendAss.length || atras.length ? `<div class="epm-pend">
      ${pendAss.length ? `<button type="button" class="epm-chip alerta${F.sit === 'pend' ? ' on' : ''}" id="epmVerPend">✍ ${pendAss.length} ficha${pendAss.length > 1 ? 's' : ''} sem assinatura</button>` : ''}
      ${atras.length ? `<button type="button" class="epm-chip perigo${F.verTrocas ? ' on' : ''}" id="epmVerTrocas">⟳ ${atras.length} troca${atras.length > 1 ? 's' : ''} atrasada${atras.length > 1 ? 's' : ''}</button>` : ''}
    </div>` : ''}
    ${listaTrocas.length ? `<div class="tc-rolo epm-trocas"><table class="dc-planilha"><tbody>
      ${listaTrocas.map((t, i) => `<tr><td><b>${esc(t.funcionario)}</b></td><td>${esc(nomeSemCa(t.item.nome))}</td>
        <td class="dc-sem">recebeu ${br(t.data)} · troca ${esc(textoTroca(t.item))}</td><td>${chip(t.sit.cor, t.sit.rotulo)}</td>
        <td><button class="btn mini principal" type="button" data-epm-trocar="${i}">Entregar</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}

    <div class="barra entre epm-listacab">
      <h3 style="margin:0">${F.sit === 'pend' ? 'Fichas sem assinatura' : 'Entregas'}</h3>
      <span class="barra" style="margin:0">
        <input type="search" id="epmBusca" value="${esc(F.busca)}" placeholder="Buscar">
        ${F.sit === 'pend' ? '' : `<input type="month" id="epmMes" value="${esc(F.mes)}">`}
        <button class="btn mini" type="button" id="epmImpLista" ${vis.length ? '' : 'disabled'} title="Imprimir todas as fichas da lista">🖨 ${vis.length}</button>
      </span>
    </div>
    <div class="epm-lista">
    ${vis.length ? vis.map(e => `<div class="epm-ent">
      <div class="epm-ent-txt"><b>${esc(e.funcionario)}</b> <span class="dc-sem">${br(e.data)} · ${esc(localDe(e.local_id).nome)}</span><br>
        <span class="epm-ent-itens">${e.linhas.map(l => `${esc(mostra(l.quantidade))} ${esc(nomeSemCa(itemDe(l.item_id).nome))}`).join(' · ')}</span></div>
      <div class="epm-ent-acoes">
        <button class="btn mini" type="button" data-epm-ficha="${esc(e.id)}">🖨 Ficha</button>
        ${e.assinada ? `<button class="btn mini epm-ok" type="button" data-epm-assinar="${esc(e.id)}" title="Desmarcar">✓ Assinada</button>`
          : `<button class="btn mini principal" type="button" data-epm-assinar="${esc(e.id)}">Assinada ✓</button>`}
        ${admin() ? `<button class="btn mini epm-x" type="button" data-epm-cancelar="${esc(e.id)}" title="Cancelar a entrega">✕</button>` : ''}
      </div></div>`).join('') : `<p class="dc-sem" style="margin:8px 0">${F.sit === 'pend' ? 'Todas as fichas estão assinadas.' : 'Nenhuma entrega neste mês.'}</p>`}
    </div>
  </div>`;

  ligarForm();
  $('epmAtualizar').onclick = async () => { await carregar(true); desenhar(); };
  $('epmVerPend')?.addEventListener('click', () => { F.sit = F.sit === 'pend' ? '' : 'pend'; desenhar(); });
  $('epmVerTrocas')?.addEventListener('click', () => { F.verTrocas = F.verTrocas ? '' : 'atrasada'; desenhar(); });
  tela.querySelectorAll('[data-epm-trocar]').forEach(b => b.addEventListener('click', () => {
    const t = listaTrocas[+b.dataset.epmTrocar], f = funcDe(t.funcionario_id);
    Object.assign(FORM, { func: f ? rotFunc(f) : t.funcionario, local: '', linhas: [{ item: t.item.nome, qtd: '1', mer: '1' }] });
    F.verTrocas = ''; desenhar(); $('epmForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('epmBusca').addEventListener('input', ev => { F.busca = ev.target.value; const p = ev.target.selectionStart; desenhar(); const i = $('epmBusca'); i.focus(); i.setSelectionRange(p, p); });
  $('epmMes')?.addEventListener('change', ev => { F.mes = ev.target.value; desenhar(); });
  $('epmImpLista').addEventListener('click', () => imprimirFichas([...vis].reverse()));
  tela.querySelectorAll('[data-epm-ficha]').forEach(b => b.addEventListener('click', () => imprimirFichas([todas.find(e => e.id === b.dataset.epmFicha)])));
  tela.querySelectorAll('[data-epm-assinar]').forEach(b => b.addEventListener('click', async () => {
    const e = todas.find(x => x.id === b.dataset.epmAssinar);
    b.disabled = true;
    await marcarLinhas(e.linhas, { ficha_assinada: !e.assinada });
    desenhar();
  }));
  tela.querySelectorAll('[data-epm-cancelar]').forEach(b => b.addEventListener('click', async () => {
    const e = todas.find(x => x.id === b.dataset.epmCancelar);
    if (!confirm(`Cancelar a entrega de ${br(e.data)} para ${e.funcionario}? Os EPIs voltam para o saldo do estoque.`)) return;
    await marcarLinhas(e.linhas, { ativo: false });
    desenhar();
  }));
}

async function marcarLinhas(linhas, mudanca) {
  for (const l of linhas) {
    const r = await estado.cliente.from('est_movimentos').update(mudanca).eq('id', l.id).select().maybeSingle();
    if (r.error) { alert('Não consegui gravar: ' + r.error.message); return false; }
    Object.assign(l, r.data || mudanca);
    const m = D.movimentos.find(x => x.id === l.id); if (m) Object.assign(m, r.data || mudanca);
  }
  return true;
}

function dialogo(html) {
  let d = $('dlgEpiMov');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgEpiMov'; d.className = 'epm-dlg'; document.body.appendChild(d); }
  d.innerHTML = html;
  d.showModal();
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  return d;
}

/* Lista de EPIs do estoque com o saldo, para o campo de escolha. */
function opcoesItens(localId, sal) {
  return ativos(D.itens).filter(i => contaNoLocal(i, localId))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(i => `<option value="${esc(i.nome)}" label="saldo ${esc(mostra((sal.get(i.id) || {}).saldo || 0))} ${esc(i.unidade || '')}">`).join('');
}
const itemPeloNome = (txt, localId) => {
  const t = semAcento(txt);
  return ativos(D.itens).find(i => semAcento(i.nome) === t && (!localId || contaNoLocal(i, localId)))
    || ativos(D.itens).find(i => semAcento(i.nome) === t);
};

const rotFunc = f => `${f.nome}${f.cadastro ? ' · nº ' + f.cadastro : ''}`;
const MER_CURTO = { 1: 'Troca (dano justificado)', 2: 'Troca (dano/perda dele)', 3: 'Devolução/mudança', 4: 'Primeira entrega' };

/* O formulário da entrega, na própria tela. O estado mora em FORM, então
   redesenhar a tela (assinar uma ficha, buscar) não perde o que foi digitado. */
function ligarForm() {
  const funcs = (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('epmFuncs').innerHTML = funcs.map(f => `<option value="${esc(rotFunc(f))}">`).join('');
  const mot = motivos();
  const funcSel = () => { const t = semAcento($('epmFunc').value); return t ? funcs.find(f => semAcento(rotFunc(f)) === t) || funcs.find(f => semAcento(f.nome) === t) : null; };
  const localAtual = () => FORM.local || (D.locais[0] || {}).id || '';
  let sal = new Map();
  const jaRecebeu = (fid, item) => ativos(D.movimentos).some(m => m.sentido === 'saida' && m.funcionario_id === fid && tipoDoEpi(itemDe(m.item_id).nome) === tipoDoEpi(item.nome));

  const info = () => {
    const f = funcSel();
    const locSel = `<select id="epmLocal" title="Estoque de onde o EPI sai">${D.locais.map(l => `<option value="${esc(l.id)}"${l.id === localAtual() ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select>`;
    if (!f) { $('epmInfo').innerHTML = `Sai do estoque ${locSel}`; ligarLocal(); return; }
    const tr = trocas().filter(t => t.funcionario_id === f.id);
    const atr = tr.filter(t => t.sit.chave === 'atrasada' || t.sit.chave === 'logo');
    $('epmInfo').innerHTML = `${esc(f.cargo || '—')}${f.tam_calcado ? ' · calçado <b>' + esc(f.tam_calcado) + '</b>' : ''}${f.tam_camisa ? ' · roupa <b>' + esc(f.tam_camisa) + '</b>' : ''}
      · sai do estoque ${locSel}
      ${atr.length ? `<br><span class="epm-avisinho">⟳ trocar: ${atr.map(t => esc(nomeSemCa(t.item.nome)) + ' (' + esc(t.sit.rotulo) + ')').join(', ')}</span>` : ''}
      ${!tr.length ? '<br><span class="dc-sem">Primeira entrega registrada para ele.</span>' : ''}`;
    ligarLocal();
  };
  const ligarLocal = () => $('epmLocal').addEventListener('change', ev => { FORM.local = ev.target.value; trocarLocal(); });
  const infoItem = l => {
    const it = l.item ? itemPeloNome(l.item, localAtual()) : null;
    if (!it) return l.item ? '<span class="es-num-falta">não está no cadastro de EPIs</span>' : '';
    const s = (sal.get(it.id) || {}).saldo || 0, ca = estadoCa(it);
    const ruim = ['vencido', 'irregular'].includes(ca.chave);
    return `${it.ca ? `<span class="${ruim ? 'es-num-falta' : ''}">CA ${esc(it.ca)}${ruim ? ' ' + esc(ca.rotulo) : ''}</span> · ` : ''}<span class="${s <= 0 ? 'es-num-falta' : ''}">tem ${esc(mostra(s))} ${esc(it.unidade || '')}</span>`;
  };
  const merSel = (l, i) => `<select data-l="${i}" data-c="mer" class="epm-mer" title="Motivo (M.E.R) — sai na ficha">${mot.map(m =>
    `<option value="${esc(m.cod)}"${l.mer === m.cod ? ' selected' : ''}>${esc(m.cod)} · ${esc(MER_CURTO[m.cod] || m.texto)}</option>`).join('')}</select>`;
  const desenharLinhas = () => {
    $('epmLinhas').innerHTML = FORM.linhas.map((l, i) => `<div class="epm-linha">
      <label class="campo epm-epi">${i ? '' : 'EPI'}<input type="text" list="epmItens" data-l="${i}" data-c="item" value="${esc(l.item)}" placeholder="digite o EPI">
        <small data-info="${i}">${infoItem(l)}</small></label>
      <label class="campo epm-qtd">${i ? '' : 'Qtd'}<input type="number" min="1" step="1" inputmode="numeric" data-l="${i}" data-c="qtd" value="${esc(l.qtd)}"></label>
      <label class="campo epm-mot">${i ? '' : 'Motivo'}${merSel(l, i)}</label>
      ${FORM.linhas.length > 1 ? `<button class="btn mini epm-x" type="button" data-tirar="${i}" title="Tirar este EPI">✕</button>` : '<span class="epm-x"></span>'}
    </div>`).join('');
    $('epmLinhas').querySelectorAll('[data-l]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => { FORM.linhas[+inp.dataset.l][inp.dataset.c] = inp.value; });
      if (inp.dataset.c === 'item') inp.addEventListener('change', () => {
        const i = +inp.dataset.l, l = FORM.linhas[i], f = funcSel(), it = itemPeloNome(inp.value, localAtual());
        if (it && !l.merManual) { l.mer = f && jaRecebeu(f.id, it) ? '1' : '4'; $('epmLinhas').querySelector(`select[data-l="${i}"]`).value = l.mer; }
        $('epmLinhas').querySelector(`[data-info="${i}"]`).innerHTML = infoItem(l);
      });
      if (inp.dataset.c === 'mer') inp.addEventListener('change', () => { FORM.linhas[+inp.dataset.l].merManual = true; });
    });
    $('epmLinhas').querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => { FORM.linhas.splice(+b.dataset.tirar, 1); desenharLinhas(); }));
  };
  const trocarLocal = () => {
    sal = saldosDo(localAtual());
    $('epmItens').innerHTML = opcoesItens(localAtual(), sal);
    desenharLinhas();
  };

  $('epmFunc').addEventListener('input', () => { FORM.func = $('epmFunc').value; });
  $('epmFunc').addEventListener('change', () => {
    FORM.func = $('epmFunc').value;
    const f = funcSel();
    const l = f ? localDoFunc(f) : '';
    if (l && l !== localAtual()) { FORM.local = l; info(); trocarLocal(); } else info();
    for (const [i, ln] of FORM.linhas.entries()) {   // motivo automático conforme o histórico dele
      const it = ln.item && itemPeloNome(ln.item, localAtual());
      if (f && it && !ln.merManual) { ln.mer = jaRecebeu(f.id, it) ? '1' : '4'; const s = $('epmLinhas').querySelector(`select[data-l="${i}"]`); if (s) s.value = ln.mer; }
    }
  });
  $('epmData').addEventListener('change', ev => { FORM.data = ev.target.value; });
  $('epmMais').addEventListener('click', () => { FORM.linhas.push({ item: '', qtd: '1', mer: '4' }); desenharLinhas(); $('epmLinhas').querySelector(`[data-l="${FORM.linhas.length - 1}"][data-c="item"]`).focus(); });
  $('epmLimpar').addEventListener('click', () => { limparForm(); desenhar(); });
  if (!FORM.local) { const f = funcSel(); FORM.local = (f && localDoFunc(f)) || ''; }
  info(); trocarLocal();
  for (const l of FORM.linhas) if (!l.mer) l.mer = '4';

  $('epmForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const aviso = t => { $('epmAviso').textContent = t; $('epmAviso').hidden = !t; };
    aviso('');
    const f = funcSel();
    if (!f) { aviso('Escolha o funcionário na lista.'); $('epmFunc').focus(); return; }
    const data = $('epmData').value || hoje(), localId = localAtual();
    const local = localDe(localId);
    const boas = [];
    for (const l of FORM.linhas) {
      if (!String(l.item).trim()) continue;
      const it = itemPeloNome(l.item, localId);
      const q = num(l.qtd);
      if (!it) { aviso(`"${l.item}" não está no cadastro de EPIs do Estoque.`); return; }
      if (!(q > 0)) { aviso(`Quantidade inválida em ${nomeSemCa(it.nome)}.`); return; }
      boas.push({ it, q, mer: l.mer || '4' });
    }
    if (!boas.length) { aviso('Escolha pelo menos um EPI.'); return; }
    const faltam = boas.filter(b => ((sal.get(b.it.id) || {}).saldo || 0) < b.q);
    const vencidos = boas.filter(b => caReprovado(b.it));
    const avisos = [];
    if (faltam.length) avisos.push(`O estoque ${local.nome} não tem o suficiente de: ${faltam.map(b => nomeSemCa(b.it.nome)).join(', ')}.`);
    if (vencidos.length) avisos.push(`CA vencido ou irregular: ${vencidos.map(b => `${nomeSemCa(b.it.nome)} (CA ${b.it.ca})`).join(', ')}.`);
    if (avisos.length && !confirm(avisos.join('\n\n') + '\n\nSalvar a entrega mesmo assim?')) return;
    $('epmSalvar').disabled = true;
    const lanc = crypto.randomUUID();
    const faz = letraFaz(local);
    const rows = boas.map(b => ({ id: crypto.randomUUID(), local_id: localId, data, sentido: 'saida', tipo: 'uso', item_id: b.it.id,
      quantidade: b.q, documento: 'Ficha de EPI', funcionario_id: f.id, funcionario: f.nome, operador: quem(), criado_por: quem(),
      lancamento_id: lanc, ativo: true, origem: 'epi', mer: b.mer || null, faz, ficha_assinada: false }));
    const r = await estado.cliente.from('est_movimentos').insert(rows).select();
    if (r.error) { aviso('Não consegui gravar: ' + r.error.message); $('epmSalvar').disabled = false; return; }
    D.movimentos.push(...(r.data || rows));
    limparForm();
    F.sit = ''; F.mes = data.slice(0, 7);
    desenhar();
    const e = entregas().find(x => x.id === lanc);
    if (e) imprimirFichas([e]);
  });
}

/* ---------------- ENTRADAS ---------------- */
const TIPOS_ENT = { compra: 'Compra', transferencia: 'Transferência', devolucao: 'Devolução de funcionário', ajuste: 'Acerto' };
function telaEntrada(tela) {
  const todas = entradas().filter(e => !F.mes || e.data.startsWith(F.mes));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Entradas de EPI</h2>
        <p class="dica" style="margin:2px 0 0">EPI que chegou no estoque (compra, transferência entre fazendas, devolução). Soma no saldo depois da última contagem.</p></div>
      <span class="barra"><button class="btn" type="button" id="epeAtualizar" title="Ler de novo do banco">↻</button>
        <button class="btn principal" type="button" id="epeNova">+ Nova entrada</button></span>
    </div>
    <div class="grade larga" style="margin-top:12px"><label class="campo">Mês <input type="month" id="epeMes" value="${esc(F.mes)}"></label></div>
    <div class="tc-rolo"><table class="dc-planilha"><thead><tr><th>Data</th><th>Estoque</th><th>Tipo</th><th>NF / doc.</th><th>Origem</th><th>EPIs</th><th style="width:1%"></th></tr></thead><tbody>
    ${todas.length ? todas.map(e => `<tr><td>${br(e.data)}</td><td>${esc(localDe(e.local_id).nome)}</td><td>${esc(TIPOS_ENT[e.tipo] || e.tipo || '—')}</td>
      <td>${esc(e.documento || '—')}</td><td>${esc(e.fornecedor || '—')}</td>
      <td>${e.linhas.map(l => `${esc(mostra(l.quantidade))} ${esc(itemDe(l.item_id).unidade || '')} · ${esc(nomeSemCa(itemDe(l.item_id).nome))}`).join('<br>')}</td>
      <td>${admin() ? `<button class="btn mini perigo" type="button" data-epe-cancelar="${esc(e.id)}">Cancelar</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="7" class="dc-sem">Nenhuma entrada neste mês.</td></tr>'}
    </tbody></table></div>
    <p class="dica" style="margin:8px 0 0">As entradas da Faz. Quebra Cocão também podem ser lançadas em Estoque › Estoque Quebra Cocão — as duas telas usam o mesmo saldo.</p>
  </div>`;
  $('epeNova').onclick = dialogoEntrada;
  $('epeAtualizar').onclick = async () => { await carregar(true); desenhar(); };
  $('epeMes').addEventListener('change', ev => { F.mes = ev.target.value; desenhar(); });
  tela.querySelectorAll('[data-epe-cancelar]').forEach(b => b.addEventListener('click', async () => {
    const e = todas.find(x => x.id === b.dataset.epeCancelar);
    if (!confirm(`Cancelar a entrada de ${br(e.data)} em ${localDe(e.local_id).nome}?`)) return;
    await marcarLinhas(e.linhas, { ativo: false }); desenhar();
  }));
}

function dialogoEntrada() {
  const linhas = [{ item: '', qtd: '', valor: '' }];
  const d = dialogo(`<form method="dialog" id="epeForm" autocomplete="off">
    <h3>Nova entrada de EPI</h3>
    <div class="grade">
      <label class="campo">Estoque <select id="epeLocal">${D.locais.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo">Data <input type="date" id="epeData" value="${hoje()}" max="${hoje()}" required></label>
      <label class="campo">Tipo <select id="epeTipo">${Object.entries(TIPOS_ENT).filter(([k]) => k !== 'ajuste').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="campo">NF / documento <input type="text" id="epeDoc" placeholder="nº da nota"></label>
      <label class="campo plena">Origem <input type="text" id="epeOrigem" placeholder="fornecedor, fazenda de origem ou funcionário"></label>
    </div>
    <table class="dc-planilha epm-linhas"><thead><tr><th>EPI</th><th style="width:90px">Qtd</th><th style="width:110px">R$ unitário</th><th style="width:1%"></th></tr></thead><tbody id="epeLinhas"></tbody></table>
    <datalist id="epeItens"></datalist>
    <div class="barra" style="margin:6px 0"><button class="btn mini" type="button" id="epeMais">+ EPI</button></div>
    <p class="dica" id="epeAviso" style="margin:6px 0 0"></p>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="submit" id="epeSalvar">Salvar entrada</button>
    </div></form>`);
  const desenharL = () => {
    $('epeLinhas').innerHTML = linhas.map((l, i) => `<tr>
      <td><input type="text" list="epeItens" data-l="${i}" data-c="item" value="${esc(l.item)}" placeholder="escolha o EPI" style="width:100%"></td>
      <td><input type="text" inputmode="decimal" data-l="${i}" data-c="qtd" value="${esc(l.qtd)}" style="width:100%"></td>
      <td><input type="text" inputmode="decimal" data-l="${i}" data-c="valor" value="${esc(l.valor)}" placeholder="opcional" style="width:100%"></td>
      <td>${linhas.length > 1 ? `<button class="btn mini" type="button" data-tirar="${i}">✕</button>` : ''}</td></tr>`).join('');
    $('epeLinhas').querySelectorAll('[data-l]').forEach(inp => inp.addEventListener('change', () => { linhas[+inp.dataset.l][inp.dataset.c] = inp.value; }));
    $('epeLinhas').querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => { linhas.splice(+b.dataset.tirar, 1); desenharL(); }));
  };
  const trocar = () => { $('epeItens').innerHTML = opcoesItens($('epeLocal').value, saldosDo($('epeLocal').value)); };
  $('epeLocal').addEventListener('change', trocar);
  $('epeMais').addEventListener('click', () => { linhas.push({ item: '', qtd: '', valor: '' }); desenharL(); });
  trocar(); desenharL();
  $('epeForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const localId = $('epeLocal').value, tipo = $('epeTipo').value;
    const boas = [];
    for (const l of linhas) {
      if (!l.item.trim()) continue;
      const it = itemPeloNome(l.item, localId), q = num(l.qtd), v = l.valor ? num(l.valor) : null;
      if (!it) { $('epeAviso').textContent = `"${l.item}" não está no cadastro de EPIs do Estoque.`; return; }
      if (!(q > 0)) { $('epeAviso').textContent = `Quantidade inválida em ${it.nome}.`; return; }
      if (v !== null && !(v >= 0)) { $('epeAviso').textContent = `Valor inválido em ${it.nome}.`; return; }
      boas.push({ it, q, v });
    }
    if (!boas.length) { $('epeAviso').textContent = 'Escolha pelo menos um EPI.'; return; }
    $('epeSalvar').disabled = true;
    const lanc = crypto.randomUUID(), origem = $('epeOrigem').value.trim() || null;
    const rows = boas.map(b => ({ id: crypto.randomUUID(), local_id: localId, data: $('epeData').value, sentido: 'entrada',
      tipo: tipo === 'devolucao' ? 'transferencia' : tipo, item_id: b.it.id, quantidade: b.q, valor_unitario: b.v,
      documento: $('epeDoc').value.trim() || (tipo === 'devolucao' ? 'Devolução' : null),
      fornecedor: tipo === 'compra' ? origem : null, outra_fazenda: tipo !== 'compra' ? origem : null,
      operador: quem(), criado_por: quem(), lancamento_id: lanc, ativo: true, origem: 'epi',
      obs: tipo === 'devolucao' ? 'Devolução de EPI pelo funcionário' : null }));
    const r = await estado.cliente.from('est_movimentos').insert(rows).select();
    if (r.error) { $('epeAviso').textContent = 'Não consegui gravar: ' + r.error.message; $('epeSalvar').disabled = false; return; }
    D.movimentos.push(...(r.data || rows));
    d.close(); desenhar();
  });
}

/* ---------------- SALDO POR ESTOQUE + HISTÓRICO ---------------- */
function telaSaldo(tela) {
  if (!F.local || !D.locais.some(l => l.id === F.local)) F.local = (D.locais[0] || {}).id || '';
  const local = localDe(F.local);
  const sal = saldosDo(F.local);
  const q = semAcento(F.busca);
  const linhas = ativos(D.itens).filter(i => contaNoLocal(i, F.local) || sal.has(i.id))
    .map(i => ({ i, s: sal.get(i.id) || { base: 0, baseData: '', entradas: 0, saidas: 0, saldo: 0 }, min: minimoDe(i, F.local) }))
    .filter(x => (!q || semAcento(x.i.nome + ' ' + (x.i.ca || '')).includes(q)) && (!F.soMin || (x.min !== null && x.s.saldo <= x.min)))
    .sort((a, b) => a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  const baseData = [...sal.values()].map(v => v.baseData).find(Boolean) || '';
  const abaixo = ativos(D.itens).filter(i => { const m = minimoDe(i, F.local); return m !== null && ((sal.get(i.id) || {}).saldo || 0) <= m; }).length;
  const qc = ehQuebraCocao(local);
  const hb = semAcento(F.histBusca);
  const hist = ativos(D.movimentos).filter(m => m.local_id === F.local && !m.pendente && (!F.mes || String(m.data).startsWith(F.mes)))
    .filter(m => !hb || semAcento(itemDe(m.item_id).nome + ' ' + (m.funcionario || '') + ' ' + (m.documento || '')).includes(hb))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Saldo de EPI por estoque</h2>
        <p class="dica" style="margin:2px 0 0">${qc ? 'A Faz. Quebra Cocão vive de entradas e saídas: saldo = soma dos lançamentos.'
          : `Saldo = ${baseData ? `contagem de EPIs de <b>${br(baseData)}</b>` : '<b>sem contagem fechada de EPIs</b> (parte do zero)'} + entradas − saídas lançadas depois dela.`}</p></div>
      <span class="barra"><button class="btn" type="button" id="epsAtualizar" title="Ler de novo do banco">↻</button>
        <button class="btn" type="button" id="epsImprimir">Imprimir saldo</button></span>
    </div>
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Estoque <select id="epsLocal">${D.locais.map(l => `<option value="${esc(l.id)}"${l.id === F.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="campo">Buscar <input type="text" id="epsBusca" value="${esc(F.busca)}" placeholder="EPI ou CA"></label>
      <label class="es-check" style="align-self:end"><input type="checkbox" id="epsMin"${F.soMin ? ' checked' : ''}> só no mínimo ou abaixo (${abaixo})</label>
    </div>
    <div class="tc-rolo" id="epsTabela"><table class="dc-planilha"><thead><tr>
      <th>EPI</th><th>CA</th>${qc ? '' : '<th class="ce">Contagem</th>'}<th class="ce">+ Entradas</th><th class="ce">− Saídas</th><th class="ce">Saldo</th><th class="ce">Mínimo</th>
    </tr></thead><tbody>
    ${linhas.length ? linhas.map(({ i, s, min }) => {
      const ca = estadoCa(i);
      const baixo = min !== null && s.saldo <= min;
      return `<tr${baixo ? ' class="epm-baixo"' : ''}><td>${esc(nomeSemCa(i.nome))} <small class="dc-sem">${esc(i.unidade || '')}</small></td>
        <td>${esc(i.ca || '—')}${ca.rotulo ? ' ' + chip(ca.cor, ca.rotulo) : ''}</td>
        ${qc ? '' : `<td class="ce">${esc(mostra(s.base))}</td>`}<td class="ce">${s.entradas ? esc(mostra(s.entradas)) : '—'}</td>
        <td class="ce">${s.saidas ? esc(mostra(s.saidas)) : '—'}</td><td class="ce"><b${s.saldo < 0 ? ' class="es-num-falta"' : ''}>${esc(mostra(s.saldo))}</b></td>
        <td class="ce">${min === null ? '—' : esc(mostra(min))}${baixo ? ' ' + chip('alerta', 'repor') : ''}</td></tr>`;
    }).join('') : '<tr><td colspan="7" class="dc-sem">Nenhum EPI neste filtro.</td></tr>'}
    </tbody></table></div>

    <h3 style="margin:18px 0 6px">Histórico de entradas e saídas · ${esc(local.nome)}</h3>
    <div class="grade larga">
      <label class="campo">Mês <input type="month" id="epsMes" value="${esc(F.mes)}"></label>
      <label class="campo">Buscar <input type="text" id="epsHist" value="${esc(F.histBusca)}" placeholder="EPI, funcionário ou documento"></label>
    </div>
    <div class="tc-rolo"><table class="dc-planilha"><thead><tr><th>Data</th><th>Mov.</th><th>EPI</th><th class="ce">Qtd</th><th>Funcionário / origem</th><th>Documento</th><th>Lançado por</th></tr></thead><tbody>
    ${hist.length ? hist.map(m => `<tr><td>${br(m.data)}</td>
      <td>${m.sentido === 'entrada' ? chip('ativo', 'entrada') : chip('neutra', 'saída')}${m.tipo === 'ajuste' ? ' <small class="dc-sem">ajuste</small>' : ''}</td>
      <td>${esc(nomeSemCa(itemDe(m.item_id).nome))}</td><td class="ce">${esc(mostra(m.quantidade))}</td>
      <td>${esc(m.funcionario || m.fornecedor || m.outra_fazenda || m.plantio || '—')}</td><td>${esc(m.documento || '—')}</td>
      <td class="dc-sem">${esc(m.criado_por || m.operador || '—')}</td></tr>`).join('')
      : '<tr><td colspan="7" class="dc-sem">Nada lançado neste mês.</td></tr>'}
    </tbody></table></div>
  </div>`;
  $('epsAtualizar').onclick = async () => { await carregar(true); desenhar(); };
  $('epsLocal').addEventListener('change', ev => { F.local = ev.target.value; desenhar(); });
  $('epsMin').addEventListener('change', ev => { F.soMin = ev.target.checked; desenhar(); });
  $('epsBusca').addEventListener('input', ev => { F.busca = ev.target.value; const p = ev.target.selectionStart; desenhar(); const i = $('epsBusca'); i.focus(); i.setSelectionRange(p, p); });
  $('epsHist').addEventListener('input', ev => { F.histBusca = ev.target.value; const p = ev.target.selectionStart; desenhar(); const i = $('epsHist'); i.focus(); i.setSelectionRange(p, p); });
  $('epsMes').addEventListener('change', ev => { F.mes = ev.target.value; desenhar(); });
  $('epsImprimir').addEventListener('click', () => mostrar(docSaldo(local, linhas, baseData, qc), { barra: true }));
}

function docSaldo(local, linhas, baseData, qc) {
  return `<article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Saldo de EPI · ${esc(local.nome)}</h1>
        <p>${qc ? 'Entradas − saídas lançadas' : baseData ? `Contagem de ${br(baseData)} + entradas − saídas` : 'Sem contagem fechada: entradas − saídas'}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span></span></div>
    </header>
    <table class="rel-tabela"><thead><tr><th>EPI</th><th>CA</th>${qc ? '' : '<th style="text-align:center">Contagem</th>'}<th style="text-align:center">Entradas</th>
      <th style="text-align:center">Saídas</th><th style="text-align:center">Saldo</th><th style="text-align:center">Mínimo</th></tr></thead><tbody>
    ${linhas.map(({ i, s, min }) => `<tr><td>${esc(nomeSemCa(i.nome))}</td><td>${esc(i.ca || '—')}</td>${qc ? '' : `<td style="text-align:center">${esc(mostra(s.base))}</td>`}
      <td style="text-align:center">${esc(mostra(s.entradas))}</td><td style="text-align:center">${esc(mostra(s.saidas))}</td>
      <td style="text-align:center"><b>${esc(mostra(s.saldo))}</b></td>
      <td style="text-align:center">${min === null ? '—' : (s.saldo <= min ? `<span class="rel-pend">${esc(mostra(min))}</span>` : esc(mostra(min)))}</td></tr>`).join('')}
    </tbody></table>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

/* Para o painel de lavagem: entregas de vestimenta a um funcionário. */
export async function entregasDeEpi(forcar) { await carregar(forcar); return { D, itemDe, entregas: entregas() }; }
export function redesenharEpiMov() { if (TELAS_EPI_MOV.includes(telaAtual)) desenhar(); }
