// sst-brigada.js — SST › Brigada e primeiros socorros (22/10/2026, prévia aprovada por ele).
//
// Pedido dele: mostrar quantos brigadistas e socorristas a SAKUMA tem, quantos
// precisa ter e, se sair um funcionário e faltar gente, o app avisar.
// Decisões dele (22/10/2026):
//  · o mínimo é digitado por ele (tela Mínimos), um número para a empresa toda;
//  · conta quem está ATIVO, DESIGNADO e com o TREINAMENTO EM DIA.
// Designar = marcar a pessoa na atividade "Brigada de incêndio" ou "Primeiros
// socorros" (SST › Atividades, tabela sst_atividade_funcionarios). Assim a
// pessoa passa a ser cobrada do curso pelo resto do app, sem regra nova.
// O curso que vale é o que a atividade exige (sst_atividade_treinamentos),
// com a reciclagem contando pelo inicial (grupoTr). Vencido não conta; quem
// vence dentro do prazo de aviso (60 dias) aparece em amarelo.
// Configuração: sst_brigada_config (uma linha: mínimos, aviso_dias e qual
// atividade é qual). Banco trancado por app_pode_algum('{sst,epis}').
// O desligamento no cadastro chama avisoDesligamentoBrigada (app.js).
import { estado } from './store.js';
import { carregarAtividades, ligacoes, todasAtividades } from './atividades-dados.js';
import { garantirSst, sstCarregado, lancamentosSst, situacaoDe } from './sst.js';
import { grupoTr } from './treino-funcao.js';
import { mostrar } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const quem = () => estado.sessao?.user?.email || null;

export const TELAS_BRIGADA = ['brPainel', 'brMembros', 'brMinimos'];

const B = { cfg: null, carregado: false, busca: '' };
let telaAtual = '';

/* Os dois grupos. A chave casa com as colunas da configuração. */
const GRUPOS = [
  { chave: 'brigada', nome: 'Brigada de incêndio', curto: 'Brigada', papel: 'brigadista', papeis: 'brigadistas', min: 'min_brigada', atv: 'atividade_brigada_id' },
  { chave: 'socorros', nome: 'Primeiros socorros', curto: 'Primeiros socorros', papel: 'socorrista', papeis: 'socorristas', min: 'min_socorros', atv: 'atividade_socorros_id' },
];

async function carregar() {
  const c = estado.cliente;
  if (!c || !estado.sessao) throw new Error('Sem conexão com o banco.');
  if (!sstCarregado()) await garantirSst();
  const [cfg] = await Promise.all([
    c.from('sst_brigada_config').select('*').eq('id', 1).maybeSingle(),
    carregarAtividades(),
  ]);
  if (cfg.error) throw cfg.error;
  B.cfg = cfg.data || { id: 1, min_brigada: 0, min_socorros: 0, aviso_dias: 60 };
  // Atividade sem id gravado: acha pelo nome (alguém pode ter apagado a ligação).
  for (const g of GRUPOS) {
    if (!B.cfg[g.atv] || !todasAtividades().some(a => a.id === B.cfg[g.atv])) {
      B.cfg[g.atv] = todasAtividades().find(a => so(a.nome).toLowerCase() === g.nome.toLowerCase())?.id || null;
    }
  }
  B.carregado = true;
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const ativos = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO');
const avisoDias = () => Number(B.cfg?.aviso_dias ?? 60);

/** Os grupos de treinamento que a atividade exige (o inicial de cada curso). */
function cursosDe(atividadeId) {
  return [...new Set(ligacoes().trein.filter(x => x.atividade_id === atividadeId).map(x => grupoTr(x.tipo_id)))];
}
const nomeTipo = id => lancamentosSst().treinamento.tipos.find(t => t.id === id)?.nome || 'curso';

/**
 * Situação do curso da pessoa para o grupo: o lançamento mais recente de cada
 * curso exigido (inicial ou reciclagem). Vale o pior entre os cursos.
 * conta = entra na conta; logo = vence dentro do prazo de aviso.
 */
function cursoDaPessoa(funcionarioId, g) {
  const cursos = cursosDe(B.cfg?.[g.atv]);
  if (!cursos.length) return { conta: true, logo: false, rotulo: 'sem curso ligado à atividade', cor: 'neutra', vence: null };
  const regs = lancamentosSst().treinamento.regs.filter(r => r.funcionario_id === funcionarioId);
  let pior = null;
  for (const grupo of cursos) {
    const doCurso = regs.filter(r => grupoTr(r.tipo_id) === grupo)
      .sort((a, b) => String(b.realizado || '').localeCompare(String(a.realizado || '')));
    const ult = doCurso[0];
    let s;
    if (!ult) s = { conta: false, logo: false, rotulo: 'nunca fez o curso — não conta', cor: 'perigo', vence: null, ordem: 0, curso: nomeTipo(grupo) };
    else {
      const sit = situacaoDe(ult.vence);
      if (sit.chave === 'vencido') s = { conta: false, logo: false, rotulo: `curso vencido em ${br(ult.vence)} — não conta`, cor: 'perigo', vence: ult.vence, ordem: 1 };
      else if (sit.dias != null && sit.dias <= avisoDias()) s = { conta: true, logo: true, rotulo: sit.dias === 0 ? 'curso vence hoje' : `curso vence em ${sit.dias} dia${sit.dias > 1 ? 's' : ''} (${br(ult.vence)})`, cor: 'alerta', vence: ult.vence, ordem: 2 };
      else s = { conta: true, logo: false, rotulo: ult.vence ? `em dia até ${br(ult.vence)}` : 'em dia (sem validade)', cor: 'ativo', vence: ult.vence, ordem: 3 };
    }
    if (!pior || s.ordem < pior.ordem) pior = s;
  }
  return pior;
}

const designados = g => {
  const id = B.cfg?.[g.atv];
  return new Set(ligacoes().pessoas.filter(p => p.atividade_id === id).map(p => p.funcionario_id));
};

/** O retrato de um grupo: quem conta, quem não conta, quanto falta, candidatos. */
function retrato(g, { semId = null } = {}) {
  const ids = designados(g);
  const gente = ativos().filter(f => ids.has(f.id) && f.id !== semId)
    .map(f => ({ f, c: cursoDaPessoa(f.id, g) }))
    .sort((a, b) => (b.c.conta - a.c.conta) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  const tem = gente.filter(x => x.c.conta).length;
  const logo = gente.filter(x => x.c.logo).length;
  const precisa = Number(B.cfg?.[g.min] || 0);
  const candidatos = ativos().filter(f => !ids.has(f.id) && f.id !== semId)
    .map(f => ({ f, c: cursoDaPessoa(f.id, g) }))
    .filter(x => x.c.conta && cursosDe(B.cfg?.[g.atv]).length)
    .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  const desligados = (estado.funcionarios || []).filter(f => f.situacao !== 'ATIVO' && ids.has(f.id)).length;
  return { g, gente, tem, logo, precisa, falta: Math.max(0, precisa - tem), depois: Math.max(0, precisa - (tem - logo)), candidatos, desligados };
}

/** Frases de alerta para o painel. */
function alertas(r) {
  const out = [];
  if (!r.precisa) return out;
  if (r.falta) out.push({ cor: 'erro', txt: `${r.g.nome} abaixo do mínimo: tem ${r.tem} de ${r.precisa} — falta${r.falta > 1 ? 'm' : ''} ${r.falta} ${r.falta > 1 ? r.g.papeis : r.g.papel}.` });
  else if (r.logo && r.tem - r.logo < r.precisa) out.push({ cor: 'info', txt: `${r.g.nome}: ${r.logo} curso(s) vencem nos próximos ${avisoDias()} dias. Sem reciclagem, fica com ${r.tem - r.logo} de ${r.precisa}.` });
  return out;
}

/* ===================================================================
   AVISO NO DESLIGAMENTO (chamado pelo cadastro do funcionário)
   =================================================================== */
/**
 * Devolve o texto do aviso se a pessoa é brigadista/socorrista designada e a
 * saída dela deixa o grupo abaixo do mínimo (ou só avisa que era designada).
 * Sem internet ou sem dados: devolve '' e não atrapalha o cadastro.
 */
export async function avisoDesligamentoBrigada(funcionarioId) {
  try {
    if (!B.carregado) await carregar();
  } catch { return ''; }
  const linhas = [];
  for (const g of GRUPOS) {
    if (!designados(g).has(funcionarioId)) continue;
    const antes = retrato(g);
    const depois = retrato(g, { semId: funcionarioId });
    const contava = antes.gente.some(x => x.f.id === funcionarioId && x.c.conta);
    let t = `• Era ${g.papel} designado(a)`;
    if (depois.precisa) {
      t += `: ${g.curto.toLowerCase()} fica com ${depois.tem} de ${depois.precisa}`;
      if (depois.falta && contava) t += ` — FALTA${depois.falta > 1 ? 'M' : ''} ${depois.falta}`;
    }
    t += '.';
    if (depois.falta && depois.candidatos.length) t += ` Com o curso em dia e ainda não designados: ${depois.candidatos.slice(0, 4).map(x => x.f.nome.split(' ')[0]).join(', ')}${depois.candidatos.length > 4 ? '…' : ''}.`;
    linhas.push(t);
  }
  return linhas.length
    ? `Atenção — brigada e primeiros socorros\n\n${linhas.join('\n')}\n\nVeja SST › Brigada e socorros para designar quem vai repor a vaga.`
    : '';
}

/* ===================================================================
   GRAVAR
   =================================================================== */
async function designar(g, funcionarioId, entra) {
  const c = estado.cliente;
  const atv = B.cfg?.[g.atv];
  if (!atv) throw new Error(`A atividade "${g.nome}" não existe em SST › Atividades.`);
  const r = entra
    ? await c.from('sst_atividade_funcionarios').insert({ atividade_id: atv, funcionario_id: funcionarioId })
    : await c.from('sst_atividade_funcionarios').delete().eq('atividade_id', atv).eq('funcionario_id', funcionarioId);
  if (r.error && !(entra && r.error.code === '23505')) throw r.error;
  await carregarAtividades();
}

async function salvarMinimos(valores) {
  const c = estado.cliente;
  const linha = { id: 1, ...valores, atividade_brigada_id: B.cfg.atividade_brigada_id, atividade_socorros_id: B.cfg.atividade_socorros_id,
    atualizado_em: new Date().toISOString(), atualizado_por: quem() };
  const { data, error } = await c.from('sst_brigada_config').upsert(linha).select().maybeSingle();
  if (error) throw error;
  B.cfg = data || linha;
}

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
const chip = (cor, txt) => `<span class="tag ${cor}">${esc(txt)}</span>`;

function cartaoGrupo(r) {
  const corFalta = r.precisa ? (r.falta ? 'perigo' : r.logo && r.tem - r.logo < r.precisa ? 'atencao' : 'ok') : 'calma';
  return `<div class="cartao br-grupo">
    <div class="barra entre" style="margin:0"><h3 style="margin:0">${esc(r.g.nome)}</h3>
      <button class="btn mini" type="button" data-br-ir="brMembros">Designar</button></div>
    <div class="pv-cards" style="margin-top:10px">
      <div class="pv-card pv-${r.tem ? 'calma' : 'perigo'}"><span>Tem</span><strong>${r.tem}</strong><small>designados com curso em dia</small></div>
      <div class="pv-card pv-calma${r.precisa ? '' : ' pv-zero'}"><span>Precisa</span><strong>${r.precisa || '—'}</strong><small>${r.precisa ? 'mínimo definido' : 'defina em Mínimos'}</small></div>
      <div class="pv-card pv-${corFalta}${r.falta ? '' : ' pv-zero'}"><span>Falta</span><strong>${r.precisa ? r.falta : '—'}</strong><small>${r.logo ? `${r.logo} vence(m) em até ${avisoDias()} dias` : 'nenhum vencendo'}</small></div>
    </div>
    <table class="dc-planilha" style="margin-top:10px"><thead><tr><th>${esc(r.g.papeis[0].toUpperCase() + r.g.papeis.slice(1))} designados</th><th style="width:22%">Fazenda</th><th style="width:36%">Curso</th></tr></thead><tbody>
      ${r.gente.length ? r.gente.map(x => `<tr><td>${esc(x.f.nome)}<br><span class="dc-sem">${esc(x.f.cargo || '')}</span></td><td>${esc(x.f.fazenda || '—')}</td><td>${chip(x.c.cor, x.c.rotulo)}</td></tr>`).join('')
        : `<tr><td colspan="3" class="dc-sem">Ninguém designado ainda. Use "Designar".</td></tr>`}
    </tbody></table>
    ${r.desligados ? `<p class="dica" style="margin:6px 0 0">${r.desligados} designado(s) já desligado(s) — não entram na conta.</p>` : ''}
    ${r.candidatos.length ? `<div class="br-cand"><b>Podem entrar</b> <span class="dica">(curso em dia, não designados):</span>
      ${r.candidatos.map(x => `<button class="btn mini" type="button" data-br-add="${r.g.chave}" data-f="${x.f.id}" title="${esc(x.c.rotulo)}">+ ${esc(x.f.nome)}</button>`).join(' ')}</div>` : ''}
  </div>`;
}

function desenharPainel() {
  const tela = $('telaBrPainel');
  const rs = GRUPOS.map(g => retrato(g));
  const avisos = rs.flatMap(alertas);
  const semMin = rs.every(r => !r.precisa);
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Brigada e primeiros socorros</h2>
        <p class="dica" style="margin:2px 0 0">Conta quem está ativo, designado e com o curso em dia. Vencido não conta.</p></div>
      <span class="barra"><button class="btn" type="button" id="brPdf">Relatório PDF</button></span>
    </div>
    ${semMin ? '<div class="aviso info" style="margin-top:10px">Os mínimos ainda não foram definidos. Informe quantos brigadistas e socorristas a SAKUMA precisa em <a href="#" data-br-ir="brMinimos">Mínimos</a>.</div>' : ''}
    ${avisos.map(a => `<div class="aviso ${a.cor}" style="margin-top:10px">${esc(a.txt)}</div>`).join('')}
    ${!semMin && !avisos.length ? '<div class="aviso ok" style="margin-top:10px">Brigada e primeiros socorros dentro do mínimo.</div>' : ''}
  </div>
  <div class="br-grade">${rs.map(cartaoGrupo).join('')}</div>`;
  ligarComuns(tela);
  $('brPdf').addEventListener('click', () => mostrar(documentoBrigada(rs), { barra: true }));
}

/* ===================================================================
   TELA · MEMBROS
   =================================================================== */
function desenharMembros() {
  const tela = $('telaBrMembros');
  const q = so(B.busca).toLowerCase();
  const sets = GRUPOS.map(designados);
  const lista = ativos().filter(f => !q || [f.nome, f.apelido, f.cargo, f.fazenda].some(v => so(v).toLowerCase().includes(q)))
    .sort((a, b) => (Number(sets.some(s => s.has(b.id))) - Number(sets.some(s => s.has(a.id)))) || a.nome.localeCompare(b.nome, 'pt-BR'));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Membros da brigada e socorristas</h2>
        <p class="dica" style="margin:2px 0 0">Marque quem faz parte. Grava na hora e passa a cobrar o curso da pessoa (SST › Atividades).</p></div>
      <label class="campo" style="margin:0;min-width:220px">Buscar <input type="search" id="brBusca" value="${esc(B.busca)}" placeholder="Nome, função ou fazenda"></label>
    </div>
    <div class="tc-rolo" style="margin-top:10px"><table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th style="width:16%">Fazenda</th>
      ${GRUPOS.map(g => `<th style="width:24%">${esc(g.nome)}</th>`).join('')}
    </tr></thead><tbody>
    ${lista.length ? lista.map(f => `<tr><td>${esc(f.nome)}<br><span class="dc-sem">${esc(f.cargo || '')}</span></td><td>${esc(f.fazenda || '—')}</td>
      ${GRUPOS.map((g, i) => { const c = cursoDaPessoa(f.id, g); const on = sets[i].has(f.id);
        return `<td><label class="br-marca"><input type="checkbox" data-br-tog="${g.chave}" data-f="${f.id}" ${on ? 'checked' : ''}> ${on ? 'Designado' : 'Designar'}</label><br>${chip(c.cor, c.rotulo)}</td>`; }).join('')}
    </tr>`).join('') : '<tr><td colspan="4" class="dc-sem">Ninguém encontrado.</td></tr>'}
    </tbody></table></div>
    <p class="dica" id="brMsg" style="margin:8px 0 0"></p>
  </div>`;
  const busca = $('brBusca');
  busca.addEventListener('input', () => { B.busca = busca.value; const pos = busca.selectionStart; desenharMembros(); const nb = $('brBusca'); nb.focus(); try { nb.setSelectionRange(pos, pos); } catch { /* ok */ } });
  tela.querySelectorAll('[data-br-tog]').forEach(cx => cx.addEventListener('change', async () => {
    const g = GRUPOS.find(x => x.chave === cx.dataset.brTog);
    cx.disabled = true;
    try { await designar(g, cx.dataset.f, cx.checked); desenharMembros(); }
    catch (e) { cx.checked = !cx.checked; cx.disabled = false; $('brMsg').textContent = 'Não consegui gravar: ' + (e.message || e); }
  }));
}

/* ===================================================================
   TELA · MÍNIMOS
   =================================================================== */
function desenharMinimos() {
  const tela = $('telaBrMinimos');
  const cfg = B.cfg || {};
  const atvNome = id => todasAtividades().find(a => a.id === id)?.nome;
  tela.innerHTML = `<div class="cartao naoimprimir" style="max-width:640px">
    <h2 style="margin:0">Mínimos</h2>
    <p class="dica" style="margin:2px 0 12px">Quantos a SAKUMA precisa ter, um número para a empresa toda (ex.: o que pede o projeto do Corpo de Bombeiros).</p>
    <form id="brForm">
      <div class="br-form">
        <label class="campo">Brigadistas necessários <input type="number" min="0" max="999" step="1" id="brMinB" value="${Number(cfg.min_brigada || 0)}" required></label>
        <label class="campo">Socorristas necessários <input type="number" min="0" max="999" step="1" id="brMinS" value="${Number(cfg.min_socorros || 0)}" required></label>
        <label class="campo">Avisar curso que vence em até (dias) <input type="number" min="0" max="365" step="1" id="brAviso" value="${Number(cfg.aviso_dias ?? 60)}" required></label>
      </div>
      <div class="barra" style="margin-top:12px"><button class="btn principal" type="submit">Salvar</button><span class="dica" id="brMinMsg"></span></div>
    </form>
    <p class="dica" style="margin:14px 0 0">Quem conta: designado na atividade <b>${esc(atvNome(cfg.atividade_brigada_id) || 'Brigada de incêndio — não encontrada')}</b> ou
      <b>${esc(atvNome(cfg.atividade_socorros_id) || 'Primeiros socorros — não encontrada')}</b>, ativo e com o curso que a atividade exige em dia.
      Os cursos de cada atividade se ajustam em SST › Atividades.</p>
    ${cfg.atualizado_em ? `<p class="dica" style="margin:6px 0 0">Última alteração: ${br(String(cfg.atualizado_em).slice(0, 10))}</p>` : ''}
  </div>`;
  $('brForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const n = id => Math.max(0, Math.round(Number($(id).value) || 0));
    const msg = $('brMinMsg');
    msg.textContent = 'Salvando…';
    try {
      await salvarMinimos({ min_brigada: n('brMinB'), min_socorros: n('brMinS'), aviso_dias: Math.min(365, n('brAviso')) });
      msg.textContent = 'Salvo.';
    } catch (e) { msg.textContent = 'Não consegui salvar: ' + (e.message || e); }
  });
}

/* ===================================================================
   RELATÓRIO
   =================================================================== */
function documentoBrigada(rs) {
  const bloco = r => `
    <h2 class="rel-secao">${esc(r.g.nome)} — tem ${r.tem}${r.precisa ? ` de ${r.precisa}` : ''}${r.precisa && r.falta ? ` · faltam ${r.falta}` : ''}</h2>
    <table class="rel-tabela"><thead><tr><th>Nome</th><th>Função</th><th>Fazenda</th><th>Telefone</th><th>Curso</th></tr></thead>
    <tbody>${r.gente.length ? r.gente.map(x => `<tr><td>${esc(x.f.nome)}</td><td>${esc(x.f.cargo || '—')}</td><td>${esc(x.f.fazenda || '—')}</td>
      <td>${esc(x.f.telefone || '—')}</td><td>${esc(x.c.conta ? (x.c.vence ? 'Em dia até ' + br(x.c.vence) : 'Em dia') : 'Não conta: ' + x.c.rotulo.replace(' — não conta', ''))}</td></tr>`).join('')
      : '<tr><td colspan="5" class="rel-vazio">Ninguém designado.</td></tr>'}</tbody></table>`;
  return `<article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Brigada de incêndio e primeiros socorros</h1><p>Composição atual</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span></span></div>
    </header>
    ${rs.map(bloco).join('')}
    <p class="rel-nota">Conta quem está ativo, designado e com o curso em dia. Mínimos definidos pela SAKUMA para a empresa toda.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

/* ===================================================================
   ENTRADA
   =================================================================== */
let irPara = () => {};
/** O app.js passa como abrir outra tela (sem import circular). */
export function ligarBrigada({ abrir }) { irPara = abrir; }

function ligarComuns(tela) {
  tela.querySelectorAll('[data-br-ir]').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); irPara(b.dataset.brIr); }));
  tela.querySelectorAll('[data-br-add]').forEach(b => b.addEventListener('click', async () => {
    const g = GRUPOS.find(x => x.chave === b.dataset.brAdd);
    b.disabled = true;
    try { await designar(g, b.dataset.f, true); redesenhar(); }
    catch (e) { b.disabled = false; alert('Não consegui designar: ' + (e.message || e)); }
  }));
}

function redesenhar() {
  if (telaAtual === 'brPainel') desenharPainel();
  else if (telaAtual === 'brMembros') desenharMembros();
  else if (telaAtual === 'brMinimos') desenharMinimos();
}

export async function abrirBrigada(tela) {
  const alvo = $('tela' + tela[0].toUpperCase() + tela.slice(1));
  if (!alvo) return;
  telaAtual = tela;
  alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando…</p></div>';
  try { await carregar(); }
  catch (e) {
    if (!B.carregado) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir: ${esc(e.message || e)}</div></div>`; return; }
  }
  redesenhar();
}

export function limparBrigada() {
  B.cfg = null; B.carregado = false; B.busca = ''; telaAtual = '';
}
