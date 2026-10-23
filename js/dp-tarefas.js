// dp-tarefas.js — DP › Admissão e demissão (23/10/2026, pedido dele)
//
// "Cadastrei um funcionário, ele gera tarefas de admissão: imprimir termo
// sindicato, imprimir ficha de EPI e outros. Demissão: escanear fichas de EPI,
// arquivar tudo do funcionário, entre outros."
//
// Decisões dele (23/10/2026):
//  · fica no DP, submódulo "Admissão e demissão" (telas Painel e Listas modelo);
//  · quem tem a tela Painel marca qualquer tarefa;
//  · tudo manual — o app NÃO marca sozinho (nem com ASO lançado, EPI entregue…);
//  · só daqui para frente: as tarefas nascem para admissões e desligamentos
//    novos. Há um botão para gerar à mão, se precisar.
//
// Como funciona:
//  · jor_tarefa_modelos = as listas modelo (evento admissao|demissao, ordem,
//    título, prazo em dias depois do evento, ação = tela do app que resolve).
//  · jor_tarefas = uma linha por tarefa de uma pessoa. A tarefa guarda uma
//    CÓPIA do título e do prazo: mexer na lista modelo não muda o que já foi
//    gerado. Chave = funcionario_id|evento|data|modelo.
//  · Gera em app.js: funcionário novo ATIVO (admissão), readmissão, e o
//    desligamento (diálogo do cadastro ou botão "Registrar desligamento").
//  · Banco: app_pode_algum('{jornada,pessoas}') — quem só cadastra também gera.
import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { podeTela } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const somaDias = (iso, n) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + Number(n || 0))).toISOString().slice(0, 10);
};
const quem = () => estado.sessao?.user?.email || null;
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const TELAS_TAREFAS = ['tfPainel', 'tfModelos'];

export const EVENTOS = {
  admissao: { rot: 'Admissão', cls: 'ativo' },
  demissao: { rot: 'Demissão', cls: 'alerta' },
};

/* O que cada tarefa pode abrir no app. A chave mora em `acao` no banco. */
export const ACOES = {
  fichaCadastral: 'Ficha cadastral',
  fichaEpi:       'Ficha de EPI',
  termoSindical:  'Termo de liberdade sindical',
  termoContrato:  'Recebimento do contrato',
  exames:         'Exames (relatório por funcionário)',
  treinamentos:   'Treinamentos por função',
  salario:        'RH › Salários',
  armario:        'Etiqueta do armário',
  folhaPonto:     'Folha de ponto',
};

/* Lista de fábrica: vale só se o banco não responder (sem rede na primeira
   vez). É a mesma que foi gravada em jor_tarefa_modelos em 23/10/2026. */
const PADRAO = [
  ['admissao', 'Imprimir e assinar a ficha cadastral', 0, 'fichaCadastral'],
  ['admissao', 'ASO admissional', 0, 'exames'],
  ['admissao', 'Imprimir a ficha de EPI e colher assinatura', 1, 'fichaEpi'],
  ['admissao', 'Entregar os EPIs', 1, null],
  ['admissao', 'Imprimir o termo de liberdade sindical', 7, 'termoSindical'],
  ['admissao', 'Imprimir o recebimento do contrato', 7, 'termoContrato'],
  ['admissao', 'Integração e treinamentos da função', 7, 'treinamentos'],
  ['admissao', 'Lançar salário e ticket no RH', 5, 'salario'],
  ['admissao', 'Etiqueta do armário', 3, 'armario'],
  ['admissao', 'Folha de ponto do mês', 1, 'folhaPonto'],
  ['admissao', 'Enviar documentos à contabilidade', 2, null],
  ['admissao', 'Arquivar a pasta do funcionário', 10, null],
  ['demissao', 'ASO demissional', 0, 'exames'],
  ['demissao', 'Recolher os EPIs devolvidos', 0, null],
  ['demissao', 'Escanear as fichas de EPI', 5, null],
  ['demissao', 'Recolher folha de ponto e boletins pendentes', 1, null],
  ['demissao', 'Enviar para rescisão na contabilidade', 1, null],
  ['demissao', 'Baixa do ticket alimentação', 3, null],
  ['demissao', 'Liberar o armário', 3, null],
  ['demissao', 'Arquivar tudo do funcionário (pasta física e Drive)', 10, null],
].map(([evento, titulo, prazo_dias, acao], i) => ({ id: null, evento, ordem: i + 1, titulo, prazo_dias, acao, ativo: true }));

const modelos = () => jd.dados.tarefaModelos || [];
const tarefas = () => jd.dados.tarefas || [];
const modelosDe = evento => (modelos().length ? modelos() : PADRAO)
  .filter(m => m.evento === evento && m.ativo !== false)
  .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

const T = { evento: '', mostrar: 'abertos', busca: '', abertos: new Set(), carregado: false };
let telaAtual = '';
let irPara = () => {};
let acaoTarefa = () => {};
let avisar = () => {};

/* ===================================================================
   CARREGAR
   =================================================================== */
async function lerDoBanco() {
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) return false;
  await jd.carregarTarefas();
  return true;
}

async function garantir() {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { /* sem rede: segue com o que ficou no aparelho */ }
  }
  try { await lerDoBanco(); T.carregado = true; }
  catch (e) { avisar('Sem conexão: mostrando o que ficou guardado neste aparelho.'); }
}

/* ===================================================================
   GERAR — chamado pelo cadastro (app.js)
   =================================================================== */
const chaveDe = (fid, evento, data, m) => `${fid}|${evento}|${data}|${m.id || 'p' + m.ordem}`;

/**
 * Cria as tarefas do evento para a pessoa. Não mexe nas que já existem
 * (mesma chave): gerar duas vezes não desmarca nada.
 * Devolve quantas criou.
 */
export async function gerarTarefas(f, evento, data) {
  if (!f?.id || !EVENTOS[evento]) return 0;
  data = so(data).slice(0, 10) || hoje();
  // O DP pode ainda não ter sido aberto neste aparelho: busca modelos e o que já existe da pessoa.
  try {
    if (!modelos().length || !T.carregado) await lerDoBanco();
  } catch { /* sem rede: usa o cache ou a lista de fábrica */ }
  const existe = new Set(tarefas().filter(t => t.funcionario_id === f.id).map(t => t.chave));
  let n = 0;
  for (const m of modelosDe(evento)) {
    const chave = chaveDe(f.id, evento, data, m);
    if (existe.has(chave)) continue;
    await jd.salvar('tarefas', {
      chave, funcionario_id: f.id, evento, data_evento: data, modelo_id: m.id || null,
      ordem: m.ordem || 0, titulo: m.titulo, prazo: somaDias(data, m.prazo_dias), acao: m.acao || null,
      situacao: 'pendente', obs: null, feita_em: null, feita_por: null, atualizado_por: quem(),
    });
    n++;
  }
  return n;
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const pessoa = id => (estado.funcionarios || []).find(f => f.id === id) || null;
const atrasada = t => t.situacao === 'pendente' && t.prazo && t.prazo < hoje();

/** Agrupa por pessoa + evento + data: cada grupo é um "processo". */
function processos() {
  const mapa = new Map();
  for (const t of tarefas()) {
    if (!jd.noMeuDp(t.funcionario_id)) continue;
    const k = `${t.funcionario_id}|${t.evento}|${t.data_evento}`;
    if (!mapa.has(k)) mapa.set(k, { k, fid: t.funcionario_id, evento: t.evento, data: t.data_evento, itens: [] });
    mapa.get(k).itens.push(t);
  }
  return [...mapa.values()].map(p => {
    p.itens.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    p.f = pessoa(p.fid);
    p.nome = p.f?.nome || '(funcionário apagado)';
    p.total = p.itens.length;
    p.pend = p.itens.filter(t => t.situacao === 'pendente').length;
    p.feitas = p.total - p.pend;
    p.atras = p.itens.filter(atrasada).length;
    p.fim = !p.pend;
    p.ultima = p.itens.reduce((m, t) => (t.feita_em || '') > m ? t.feita_em : m, '');
    return p;
  });
}

export function resumoPainel() {
  const ps = processos().filter(p => !p.fim);
  return {
    pessoas: ps.length,
    admissao: ps.filter(p => p.evento === 'admissao').length,
    demissao: ps.filter(p => p.evento === 'demissao').length,
    pendentes: ps.reduce((s, p) => s + p.pend, 0),
    atrasadas: ps.reduce((s, p) => s + p.atras, 0),
  };
}

/* ===================================================================
   GRAVAR
   =================================================================== */
async function marcar(chave, situacao) {
  const t = tarefas().find(x => x.chave === chave);
  if (!t) return;
  const volta = situacao === 'pendente';
  await jd.salvar('tarefas', { ...t, situacao,
    feita_em: volta ? null : hoje(), feita_por: volta ? null : quem(), atualizado_por: quem() });
}

async function apagarProcesso(p) {
  for (const t of p.itens) await jd.apagar('tarefas', t.chave);
}

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
const chip = (cls, txt) => `<span class="tag ${cls}">${esc(txt)}</span>`;

function linhaTarefa(t, pode) {
  const atr = atrasada(t);
  const sit = t.situacao === 'feita' ? chip('ativo', `feita em ${br(t.feita_em)}`)
    : t.situacao === 'nao_aplica' ? chip('neutra', 'não se aplica')
      : atr ? chip('perigo', `atrasada · prazo ${br(t.prazo)}`) : chip('alerta', `até ${br(t.prazo)}`);
  const botoes = !pode ? '' : t.situacao === 'pendente'
    ? `<button class="btn mini principal" type="button" data-tf-marca="${esc(t.chave)}" data-sit="feita">Feita</button>
       <button class="btn mini" type="button" data-tf-marca="${esc(t.chave)}" data-sit="nao_aplica" title="Não se aplica a esta pessoa">N/A</button>`
    : `<button class="btn mini" type="button" data-tf-marca="${esc(t.chave)}" data-sit="pendente" title="Voltar para pendente">Desfazer</button>`;
  const ir = t.acao && ACOES[t.acao] && t.situacao === 'pendente'
    ? `<button class="btn mini" type="button" data-tf-acao="${esc(t.acao)}" data-f="${esc(t.funcionario_id)}" title="Abre ${esc(ACOES[t.acao])} já com a pessoa">Abrir ›</button>` : '';
  return `<tr class="${t.situacao !== 'pendente' ? 'tf-feita' : ''}">
    <td><span class="tf-tit">${esc(t.titulo)}</span>${t.feita_por && t.situacao !== 'pendente' ? `<br><span class="dc-sem">${esc(t.feita_por)}</span>` : ''}</td>
    <td class="tf-sit">${sit}</td>
    <td class="tf-bt">${ir} ${botoes}</td></tr>`;
}

function cartaoProcesso(p, pode) {
  const aberto = T.abertos.has(p.k);
  const pct = p.total ? Math.round(p.feitas / p.total * 100) : 0;
  const ev = EVENTOS[p.evento];
  return `<div class="cartao tf-proc${p.atras ? ' tf-atras' : ''}${p.fim ? ' tf-fim' : ''}">
    <button class="tf-cab" type="button" data-tf-abrir="${esc(p.k)}" aria-expanded="${aberto}">
      <span class="tf-nome"><b>${esc(p.nome)}</b>
        <span class="dc-sem">${esc([p.f?.cargo, p.f?.fazenda].filter(Boolean).join(' · '))}</span></span>
      <span class="tf-ev">${chip(ev.cls, `${ev.rot} · ${br(p.data)}`)}${p.atras ? ' ' + chip('perigo', `${p.atras} atrasada${p.atras > 1 ? 's' : ''}`) : ''}${p.fim ? ' ' + chip('ativo', 'concluído') : ''}</span>
      <span class="tf-prog"><span class="tf-barra"><i style="width:${pct}%"></i></span><small>${p.feitas} de ${p.total}</small></span>
      <span class="tf-seta">${aberto ? '▴' : '▾'}</span>
    </button>
    ${aberto ? `<table class="dc-planilha tf-tab"><tbody>${p.itens.map(t => linhaTarefa(t, pode)).join('')}</tbody></table>
      ${pode ? `<div class="barra entre" style="margin-top:8px">
        <span class="dica">Lista gerada em ${br(p.data)}. Mudanças na lista modelo não alteram esta.</span>
        <button class="btn mini perigo" type="button" data-tf-apagar="${esc(p.k)}">Apagar estas tarefas</button></div>` : ''}` : ''}
  </div>`;
}

function desenharPainel() {
  const alvo = $('telaTfPainel');
  if (!alvo) return;
  const pode = podeTela('tfPainel');
  const todos = processos();
  const r = resumoPainel();
  const busca = normal(T.busca);
  const lista = todos
    .filter(p => !T.evento || p.evento === T.evento)
    .filter(p => T.mostrar === 'todos' || (T.mostrar === 'abertos' ? !p.fim : p.fim))
    .filter(p => !busca || normal(p.nome).includes(busca))
    .sort((a, b) => (b.atras - a.atras) || (a.fim - b.fim) || String(b.data).localeCompare(String(a.data)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const concl30 = todos.filter(p => p.fim && p.ultima && p.ultima >= somaDias(hoje(), -30)).length;

  alvo.innerHTML = `<div class="cartao">
      <div class="barra entre" style="margin:0"><h2 style="margin:0">Admissão e demissão</h2>
        ${pode ? '<button class="btn" type="button" id="tfGerarBt">+ Gerar tarefas para um funcionário</button>' : ''}</div>
      <p class="dica" style="margin:6px 0 0">As tarefas nascem sozinhas ao cadastrar um funcionário novo e ao registrar o desligamento. Marque cada uma como feita ou "não se aplica".</p>
      <div class="pv-cards" style="margin-top:12px">
        <div class="pv-card pv-calma${r.admissao ? '' : ' pv-zero'}"><span>Admissões em andamento</span><strong>${r.admissao}</strong><small>pessoas</small></div>
        <div class="pv-card pv-calma${r.demissao ? '' : ' pv-zero'}"><span>Demissões em andamento</span><strong>${r.demissao}</strong><small>pessoas</small></div>
        <div class="pv-card pv-${r.atrasadas ? 'perigo' : 'calma'}${r.atrasadas ? '' : ' pv-zero'}"><span>Atrasadas</span><strong>${r.atrasadas}</strong><small>de ${r.pendentes} pendente(s)</small></div>
        <div class="pv-card pv-ok${concl30 ? '' : ' pv-zero'}"><span>Concluídos</span><strong>${concl30}</strong><small>nos últimos 30 dias</small></div>
      </div>
      <div class="tf-filtros">
        <select id="tfEvento" aria-label="Evento">
          <option value="">Admissão e demissão</option>
          <option value="admissao"${T.evento === 'admissao' ? ' selected' : ''}>Só admissão</option>
          <option value="demissao"${T.evento === 'demissao' ? ' selected' : ''}>Só demissão</option>
        </select>
        <select id="tfMostrar" aria-label="Mostrar">
          <option value="abertos"${T.mostrar === 'abertos' ? ' selected' : ''}>Em andamento</option>
          <option value="fim"${T.mostrar === 'fim' ? ' selected' : ''}>Concluídos</option>
          <option value="todos"${T.mostrar === 'todos' ? ' selected' : ''}>Todos</option>
        </select>
        <input type="search" id="tfBusca" placeholder="Buscar funcionário" value="${esc(T.busca)}">
      </div>
    </div>
    ${lista.length ? lista.map(p => cartaoProcesso(p, pode)).join('')
      : `<div class="cartao"><p class="dica" style="margin:0">${todos.length ? 'Nada com esses filtros.' : 'Nenhuma tarefa ainda. Elas aparecem quando alguém for admitido ou desligado.'}</p></div>`}`;
  ligarPainel(alvo, lista);
}

function ligarPainel(alvo, lista) {
  $('tfEvento')?.addEventListener('change', e => { T.evento = e.target.value; desenharPainel(); });
  $('tfMostrar')?.addEventListener('change', e => { T.mostrar = e.target.value; desenharPainel(); });
  $('tfBusca')?.addEventListener('input', e => {
    T.busca = e.target.value; const pos = e.target.selectionStart;
    desenharPainel(); const b = $('tfBusca'); if (b) { b.focus(); b.setSelectionRange(pos, pos); }
  });
  $('tfGerarBt')?.addEventListener('click', dlgGerar);
  alvo.querySelectorAll('[data-tf-abrir]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.tfAbrir;
    T.abertos.has(k) ? T.abertos.delete(k) : T.abertos.add(k);
    desenharPainel();
  }));
  alvo.querySelectorAll('[data-tf-marca]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await marcar(b.dataset.tfMarca, b.dataset.sit); } catch (e) { avisar('Não consegui gravar: ' + (e.message || e)); }
    desenharPainel();
  }));
  alvo.querySelectorAll('[data-tf-acao]').forEach(b => b.addEventListener('click', () =>
    acaoTarefa(b.dataset.tfAcao, b.dataset.f)));
  alvo.querySelectorAll('[data-tf-apagar]').forEach(b => b.addEventListener('click', async () => {
    const p = lista.find(x => x.k === b.dataset.tfApagar);
    if (!p || !confirm(`Apagar as ${p.total} tarefas de ${EVENTOS[p.evento].rot.toLowerCase()} de ${p.nome}?\n\nUse só se foram geradas por engano.`)) return;
    try { await apagarProcesso(p); } catch (e) { avisar('Não consegui apagar: ' + (e.message || e)); }
    T.abertos.delete(p.k);
    desenharPainel();
  }));
}

/* Gerar à mão: escolhe a pessoa, o evento e a data. */
function dlgGerar() {
  let dlg = $('dlgTfGerar');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'dlgTfGerar';
    dlg.className = 'dlg';
    document.body.appendChild(dlg);
  }
  const gente = jd.pessoasDp().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  dlg.innerHTML = `<form method="dialog" id="tfGerarForm" class="tf-dlg">
    <h3 style="margin-top:0">Gerar tarefas</h3>
    <label class="campo">Funcionário
      <select id="tfGFunc" required><option value="">Escolha…</option>
        ${gente.map(f => `<option value="${esc(f.id)}">${esc(f.nome)}${f.situacao === 'INATIVO' ? ' (inativo)' : ''}</option>`).join('')}</select></label>
    <label class="campo">Evento
      <select id="tfGEv"><option value="admissao">Admissão</option><option value="demissao">Demissão</option></select></label>
    <label class="campo">Data do evento <input type="date" id="tfGData" value="${hoje()}" required></label>
    <p class="dica">Os prazos contam a partir desta data. A admissão vem preenchida com a data do cadastro.</p>
    <div class="barra" style="justify-content:flex-end;gap:8px">
      <button class="btn" type="button" id="tfGCancelar">Cancelar</button>
      <button class="btn principal" type="submit">Gerar</button></div>
  </form>`;
  const ajustaData = () => {
    const f = pessoa($('tfGFunc').value);
    if ($('tfGEv').value === 'admissao' && f?.admissao) $('tfGData').value = String(f.admissao).slice(0, 10);
  };
  $('tfGFunc').addEventListener('change', ajustaData);
  $('tfGEv').addEventListener('change', ajustaData);
  $('tfGCancelar').addEventListener('click', () => dlg.close());
  $('tfGerarForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = pessoa($('tfGFunc').value);
    if (!f) return;
    const evento = $('tfGEv').value, data = $('tfGData').value || hoje();
    dlg.close();
    const n = await gerarTarefas(f, evento, data).catch(e => { avisar('Não consegui gerar: ' + (e.message || e)); return 0; });
    T.abertos.add(`${f.id}|${evento}|${data}`);
    avisar(n ? `${n} tarefa(s) de ${EVENTOS[evento].rot.toLowerCase()} criada(s) para ${f.nome}.` : 'Essa lista já existia — nada novo foi criado.');
    desenharPainel();
  });
  dlg.showModal();
}

/* ===================================================================
   TELA · LISTAS MODELO
   =================================================================== */
function desenharModelos() {
  const alvo = $('telaTfModelos');
  if (!alvo) return;
  const pode = podeTela('tfModelos');
  const opcAcao = sel => `<option value="">— nenhuma —</option>` + Object.entries(ACOES)
    .map(([k, v]) => `<option value="${k}"${sel === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const bloco = evento => {
    const itens = modelos().filter(m => m.evento === evento).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return `<div class="cartao">
      <div class="barra entre" style="margin:0"><h3 style="margin:0">${EVENTOS[evento].rot}</h3>
        ${pode ? `<button class="btn mini principal" type="button" data-tf-novo="${evento}">+ Tarefa</button>` : ''}</div>
      <table class="dc-planilha tf-mod" style="margin-top:10px"><thead><tr>
        <th style="width:44px">Ordem</th><th>Tarefa</th><th style="width:96px">Prazo (dias)</th><th style="width:26%">Abre no app</th><th style="width:70px" class="ce">Ativa</th></tr></thead><tbody>
      ${itens.length ? itens.map((m, i) => `<tr data-tf-mod="${esc(m.id)}" class="${m.ativo === false ? 'tf-feita' : ''}">
        <td class="ce">${pode ? `<button class="btn mini" type="button" data-tf-sobe="${esc(m.id)}" ${i ? '' : 'disabled'} title="Subir">▲</button>` : i + 1}</td>
        <td><input type="text" value="${esc(m.titulo)}" data-c="titulo" ${pode ? '' : 'disabled'}></td>
        <td><input type="number" min="0" step="1" value="${Number(m.prazo_dias || 0)}" data-c="prazo_dias" ${pode ? '' : 'disabled'}></td>
        <td><select data-c="acao" ${pode ? '' : 'disabled'}>${opcAcao(m.acao)}</select></td>
        <td class="ce"><input type="checkbox" data-c="ativo" ${m.ativo !== false ? 'checked' : ''} ${pode ? '' : 'disabled'}></td></tr>`).join('')
        : '<tr><td colspan="5" class="dc-sem">Nenhuma tarefa nesta lista.</td></tr>'}
      </tbody></table>
    </div>`;
  };
  alvo.innerHTML = `<div class="cartao">
      <h2 style="margin:0">Listas modelo</h2>
      <p class="dica" style="margin:6px 0 0">É daqui que sai a lista de cada pessoa. O prazo conta em dias a partir da data da admissão ou do desligamento.
      Alterar aqui vale para as próximas — o que já foi gerado continua como estava. Tarefa desmarcada em "Ativa" deixa de ser gerada.</p>
      ${modelos().length ? '' : '<div class="aviso" style="margin-top:10px">Sem conexão com o banco: mostrando nada. Abra com internet para editar as listas.</div>'}
    </div>
    ${bloco('admissao')}${bloco('demissao')}`;
  if (!pode) return;

  alvo.querySelectorAll('[data-tf-mod]').forEach(tr => {
    const id = tr.dataset.tfMod;
    tr.querySelectorAll('[data-c]').forEach(el => el.addEventListener('change', async () => {
      const m = modelos().find(x => x.id === id);
      if (!m) return;
      const c = el.dataset.c;
      const v = c === 'ativo' ? el.checked : c === 'prazo_dias' ? Math.max(0, parseInt(el.value, 10) || 0)
        : c === 'acao' ? (el.value || null) : so(el.value);
      if (c === 'titulo' && !v) { el.value = m.titulo; return; }
      try { await jd.salvar('tarefaModelos', { ...m, [c]: v, atualizado_por: quem() }); avisar('Lista modelo salva.'); }
      catch (e) { avisar('Não consegui gravar: ' + (e.message || e)); }
      if (c === 'ativo') desenharModelos();
    }));
  });
  alvo.querySelectorAll('[data-tf-sobe]').forEach(b => b.addEventListener('click', async () => {
    const m = modelos().find(x => x.id === b.dataset.tfSobe);
    const irmaos = modelos().filter(x => x.evento === m.evento).sort((a, c) => (a.ordem || 0) - (c.ordem || 0));
    const i = irmaos.indexOf(m);
    if (i < 1) return;
    const ant = irmaos[i - 1];
    irmaos[i - 1] = m; irmaos[i] = ant;
    // renumera a lista inteira (evita ordens repetidas)
    for (const [n, x] of irmaos.entries()) if (x.ordem !== n + 1) await jd.salvar('tarefaModelos', { ...x, ordem: n + 1, atualizado_por: quem() });
    desenharModelos();
  }));
  alvo.querySelectorAll('[data-tf-novo]').forEach(b => b.addEventListener('click', async () => {
    const evento = b.dataset.tfNovo;
    const titulo = so(prompt(`Nova tarefa de ${EVENTOS[evento].rot.toLowerCase()}:`));
    if (!titulo) return;
    const ordem = Math.max(0, ...modelos().filter(x => x.evento === evento).map(x => x.ordem || 0)) + 1;
    await jd.salvar('tarefaModelos', { evento, ordem, titulo, prazo_dias: 0, acao: null, ativo: true, atualizado_por: quem() });
    desenharModelos();
  }));
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */
export async function abrirTarefas(tela) {
  telaAtual = tela;
  const alvo = $('tela' + tela[0].toUpperCase() + tela.slice(1));
  if (alvo && !T.carregado) alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando…</p></div>';
  await garantir();
  redesenhar();
}

function redesenhar() {
  if (telaAtual === 'tfPainel' && !$('telaTfPainel')?.hidden) desenharPainel();
  if (telaAtual === 'tfModelos' && !$('telaTfModelos')?.hidden) desenharModelos();
}

export function ligarTarefas({ abrir, acao, aviso } = {}) {
  if (abrir) irPara = abrir;
  if (acao) acaoTarefa = acao;
  if (aviso) avisar = aviso;
}

export function limparTarefas() {
  Object.assign(T, { evento: '', mostrar: 'abertos', busca: '', abertos: new Set(), carregado: false });
  telaAtual = '';
}
