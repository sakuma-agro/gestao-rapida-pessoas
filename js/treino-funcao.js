// treino-funcao.js — os treinamentos que cada função exige (20/10/2026).
//
// Pedido dele: no mesmo molde de "Exames por função", uma matriz função ×
// treinamento preenchida à mão no app (não veio de planilha). Ela alimenta:
//   - o "Não têm" do painel de um treinamento, que passa a cobrar só de quem a
//     função exige (função ainda sem lista continua sendo cobrada, como antes);
//   - o bloco de pendências do relatório de treinamentos do funcionário;
//   - a linha "Treinamentos da função" no cadastro do funcionário;
//   - o quadro geral para conferir com o técnico de segurança.
//
// Reciclagem conta junto: se a função exige o curso inicial e a pessoa tem a
// reciclagem que o renova (recicla_tipo_id no catálogo), o curso está feito.
// Tabela: sst_treinamentos_funcao (funcao, tipo_id).
import { estado } from './store.js';
import { LOGO, PE_LOP } from './seed.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/* =============== dados =============== */
const T = { porFuncao: [], carregado: false };
/* O catálogo e os lançamentos moram no sst.js; aqui só se guarda como lê-los,
   para nunca ficar com uma cópia velha depois de salvar ou apagar um tipo. */
let lerTipos = () => [];
let REGS = () => [];
export const definirTiposTr = (tipos, regs) => { lerTipos = tipos; REGS = regs; };
const TIPOS_ = () => lerTipos() || [];
const tipo = id => TIPOS_().find(t => t.id === id);

/** O treinamento que manda no assunto: ele mesmo ou o inicial que ele recicla. */
export function grupoTr(tipoId) {
  let id = tipoId;
  for (let volta = 0; volta < 10; volta++) {
    const t = tipo(id);
    if (!t || !t.recicla_tipo_id) return id;
    id = t.recicla_tipo_id;
  }
  return id;
}

export async function carregarTreinoFuncao() {
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) { if (T.carregado) return; throw new Error('sem internet'); }
  const { data, error } = await c.from('sst_treinamentos_funcao').select('funcao,tipo_id');
  if (error) throw error;
  T.porFuncao = data || [];
  T.carregado = true;
}
/* Cópia local: vai na mesma caixa do SST, para o painel e o relatório abrirem sem sinal. */
export const dadosTreinoFuncao = () => T.porFuncao;
export function definirTreinoFuncao(lista) {
  if (!lista) return;
  T.porFuncao = lista; T.carregado = true;
}
export function limparTreinoFuncao() { T.porFuncao = []; T.carregado = false; }

/** A função tem lista montada? (Sem lista, nada é cobrado por função.) */
export const temListaTr = funcao => T.porFuncao.some(x => so(x.funcao) === so(funcao));

/** Os treinamentos que essa função exige, na ordem do catálogo. */
export function exigidosTrDe(funcao) {
  const ids = T.porFuncao.filter(x => so(x.funcao) === so(funcao)).map(x => x.tipo_id);
  return TIPOS_().filter(t => ids.includes(t.id));
}

/** A função dessa pessoa exige esse assunto (grupo)? null = função sem lista. */
export function funcaoExige(funcionario, grupo) {
  if (!temListaTr(funcionario?.cargo)) return null;
  return exigidosTrDe(funcionario.cargo).some(t => grupoTr(t.id) === grupo);
}

/**
 * O que a função exige e a pessoa nunca fez (nem o curso, nem a reciclagem dele).
 * Treinamento feito e vencido não entra aqui: esse aparece na tabela, como vencido.
 */
export function pendenciasTrDe(funcionario, regs) {
  const exigidos = exigidosTrDe(funcionario?.cargo);
  if (!exigidos.length) return { lista: [], semLista: true };
  const feitos = new Set((regs || []).map(x => grupoTr(x.tipo_id)));
  return { lista: exigidos.filter(t => !feitos.has(grupoTr(t.id))), semLista: false };
}

/** A linha do cadastro do funcionário: o que a função pede e o que falta. */
export function resumoCadastro(funcao, funcionarioId) {
  if (!so(funcao)) return '';
  if (!T.carregado) return '';
  const exigidos = exigidosTrDe(funcao);
  if (!exigidos.length) return `Treinamentos: a função ${funcao} ainda não tem lista em SST › Treinamentos por função.`;
  const regs = REGS().filter(x => x.funcionario_id === funcionarioId);
  const { lista } = pendenciasTrDe({ cargo: funcao }, regs);
  const nomes = exigidos.map(t => t.nome).join(', ');
  return `Treinamentos da função (${exigidos.length}): ${nomes}.` +
    (lista.length ? ` Falta(m) ${lista.length}: ${lista.map(t => t.nome).join(', ')}.` : ' Todos já lançados.');
}

/* ==================================================================
   TELA · TREINAMENTOS POR FUNÇÃO
   ================================================================== */
export function funcoesTr() {
  const doCadastro = estado.funcionarios
    .filter(f => f.situacao === 'ATIVO').map(f => so(f.cargo)).filter(Boolean);
  const daLista = T.porFuncao.map(x => so(x.funcao));
  return [...new Set([...doCadastro, ...daLista])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
const pessoasNa = funcao => estado.funcionarios
  .filter(f => f.situacao === 'ATIVO' && so(f.cargo) === so(funcao));

export async function abrirTreinoFuncao() {
  try { await carregarTreinoFuncao(); } catch (e) {
    if (!T.carregado) {
      $('tfLista').innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`;
      return;
    }
  }
  const sel = $('tfFuncao');
  const antes = sel.value;
  const lista = funcoesTr();
  sel.innerHTML = '<option value="">Escolha a função</option>' +
    lista.map(f => `<option value="${esc(f)}">${esc(f)}${temListaTr(f) ? '' : ' · sem lista'}</option>`).join('');
  sel.value = lista.includes(antes) ? antes : (lista[0] || '');
  desenhar();
  montarFiltro();
}

function desenhar() {
  const funcao = $('tfFuncao').value;
  const exigidos = exigidosTrDe(funcao);
  const montadas = funcoesTr().filter(temListaTr).length;
  $('bExcluirTf').hidden = !funcao || !temListaTr(funcao);
  $('bCopiarTf').hidden = !funcao;

  $('tfResumo').innerHTML = funcao
    ? `<b>${exigidos.length}</b> treinamento(s) na lista de ${esc(funcao)} · ` +
      `${pessoasNa(funcao).length} pessoa(s) ativa(s) nessa função · ` +
      `${montadas} de ${funcoesTr().length} funções com lista montada.`
    : '';

  /* Só os do catálogo em uso. Reciclagem aparece com o aviso de que conta
     junto com o curso que ela renova — normalmente basta marcar o inicial. */
  const todos = TIPOS_().filter(t => t.ativo !== false || exigidos.some(e => e.id === t.id));
  $('tfLista').innerHTML = !funcao ? '<div class="vazio">Escolha uma função.</div>'
    : !todos.length ? '<div class="vazio">Nenhum treinamento no catálogo. Cadastre em Tipos e periodicidade.</div>' : `
    <div class="lista">
      ${todos.map(t => {
        const marcado = exigidos.some(e => e.id === t.id);
        const recicla = t.recicla_tipo_id ? tipo(t.recicla_tipo_id) : null;
        const sub = [
          t.meses ? `reciclagem a cada ${t.meses} meses` : 'não vence',
          t.carga_horaria ? `${Number(t.carga_horaria)} h` : '',
          recicla ? `renova: ${recicla.nome} (conta junto)` : '',
        ].filter(Boolean).join(' · ');
        return `<label class="item" for="tf_${t.id}" style="grid-template-columns:22px 1fr auto">
          <input type="checkbox" id="tf_${t.id}" data-trein="${t.id}" ${marcado ? 'checked' : ''}>
          <span><span class="nome">${esc(t.nome)}</span><br><span class="sub">${esc(sub)}</span></span>
          <span class="acoes">${t.ativo === false ? '<span class="tag inativo">desativado</span>' : ''}</span>
        </label>`;
      }).join('')}
    </div>`;

  $('tfLista').querySelectorAll('[data-trein]').forEach(cx =>
    cx.addEventListener('change', () => trocar(funcao, cx.dataset.trein, cx.checked, cx)));
}

async function trocar(funcao, tipoId, ligar, caixa) {
  caixa.disabled = true;
  try {
    if (ligar) {
      const { error } = await estado.cliente.from('sst_treinamentos_funcao').upsert({ funcao, tipo_id: tipoId });
      if (error) throw error;
      T.porFuncao.push({ funcao, tipo_id: tipoId });
    } else {
      const { error } = await estado.cliente.from('sst_treinamentos_funcao')
        .delete().eq('funcao', funcao).eq('tipo_id', tipoId);
      if (error) throw error;
      T.porFuncao = T.porFuncao.filter(x => !(so(x.funcao) === so(funcao) && x.tipo_id === tipoId));
    }
    desenhar();
    atualizarOpcao(funcao);
    montarFiltro();
  } catch (e) {
    caixa.checked = !ligar;
    alert('Não deu para salvar: ' + (e.message || e));
  } finally { caixa.disabled = false; }
}

/* O "· sem lista" do seletor acompanha a marcação sem redesenhar tudo. */
function atualizarOpcao(funcao) {
  const op = [...$('tfFuncao').options].find(o => o.value === funcao);
  if (op) op.textContent = funcao + (temListaTr(funcao) ? '' : ' · sem lista');
}

/* Copiar a lista de outra função: Tratorista I a IV costumam pedir o mesmo. */
async function copiarDe() {
  const funcao = $('tfFuncao').value;
  if (!funcao) return;
  const origens = funcoesTr().filter(f => f !== funcao && temListaTr(f));
  if (!origens.length) return alert('Nenhuma outra função tem lista montada ainda.');
  $('tfcDestino').textContent = funcao;
  $('tfcOrigem').innerHTML = origens.map(f =>
    `<option value="${esc(f)}">${esc(f)} (${exigidosTrDe(f).length})</option>`).join('');
  $('dlgCopiarTf').showModal();
}

async function confirmarCopia(ev) {
  ev.preventDefault();
  const funcao = $('tfFuncao').value;
  const origem = $('tfcOrigem').value;
  if (!funcao || !origem) return;
  const novos = exigidosTrDe(origem).filter(t => !exigidosTrDe(funcao).some(e => e.id === t.id));
  const b = $('bConfirmarCopiaTf');
  b.disabled = true;
  try {
    if (novos.length) {
      const { error } = await estado.cliente.from('sst_treinamentos_funcao')
        .upsert(novos.map(t => ({ funcao, tipo_id: t.id })));
      if (error) throw error;
      novos.forEach(t => T.porFuncao.push({ funcao, tipo_id: t.id }));
    }
    $('dlgCopiarTf').close();
    desenhar();
    atualizarOpcao(funcao);
  } catch (e) {
    alert('Não deu para copiar: ' + (e.message || e));
  } finally { b.disabled = false; }
}

async function excluir() {
  const funcao = $('tfFuncao').value;
  if (!funcao) return;
  const n = exigidosTrDe(funcao).length;
  const gente = pessoasNa(funcao).length;
  if (!confirm(`Limpar a lista de ${n} treinamento(s) da função "${funcao}"?` +
    (gente ? `\n\n${gente} pessoa(s) ativa(s) têm essa função: elas voltam a ser cobradas de todos os treinamentos no painel.` : '') +
    '\n\nOs treinamentos já lançados não mudam.')) return;
  const b = $('bExcluirTf');
  b.disabled = true;
  try {
    const { error } = await estado.cliente.from('sst_treinamentos_funcao').delete().eq('funcao', funcao);
    if (error) throw error;
    T.porFuncao = T.porFuncao.filter(x => so(x.funcao) !== so(funcao));
    await abrirTreinoFuncao();
  } catch (e) {
    alert('Não deu para excluir: ' + (e.message || e));
  } finally { b.disabled = false; }
}

/* ==================================================================
   OS DOCUMENTOS
   ================================================================== */
const folha = (titulo, subtitulo, corpo, pe, deitada) => `
  <div class="an-folha${deitada ? ' deitada' : ''}">
    <div class="an-topo">
      <img src="${LOGO}" alt="">
      <div class="an-tit">
        <h1>${esc(titulo)}</h1>
        <p>${esc(subtitulo)}</p>
      </div>
    </div>
    ${corpo}
    <div class="an-pe"><span>${esc(pe || '')}</span><span>SAKUMA Agronegócios</span></div>
    ${PE_LOP}
  </div>`;

/** O quadro de todas as funções × treinamentos, para conferir com o técnico. */
export function documentoQuadroTr() {
  const lista = funcoesTr().filter(f => exigidosTrDe(f).length);
  const usados = TIPOS_().filter(t => T.porFuncao.some(x => x.tipo_id === t.id));
  const corpo = lista.length ? `
    <table class="an-tab aso-quadro">
      <thead><tr>
        <th>FUNÇÃO</th>
        ${usados.map(t => `<th class="ce aso-vert">${esc(t.nome)}</th>`).join('')}
        <th class="ce">TOTAL</th>
      </tr></thead>
      <tbody>
        ${lista.map(f => {
          const ids = exigidosTrDe(f).map(t => t.id);
          return `<tr>
            <td class="an-nome">${esc(f)}</td>
            ${usados.map(t => `<td class="ce">${ids.includes(t.id) ? '<b>X</b>' : ''}</td>`).join('')}
            <td class="ce"><b>${ids.length}</b></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="aso-nota">
      Relação cadastrada no LOP - Gestão Rápida. A reciclagem conta junto com o treinamento que ela renova.
    </div>` : '<p class="pn-nada">Nenhuma função tem lista de treinamentos montada ainda.</p>';
  return folha('TREINAMENTOS POR FUNÇÃO', `Quadro geral · ${dataBr(hoje())}`,
    corpo, `${lista.length} função(ões)`, true);
}

/** Todas as pendências dos ativos (função com lista): [{ f, t }], por função e nome. */
export function pendenciasTodos(funcionarioId = '') {
  const ativos = estado.funcionarios
    .filter(f => f.situacao === 'ATIVO' && temListaTr(f.cargo) && (!funcionarioId || f.id === funcionarioId))
    .sort((a, b) => so(a.cargo).localeCompare(so(b.cargo), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const linhas = [];
  ativos.forEach(f => {
    const regs = REGS().filter(x => x.funcionario_id === f.id);
    pendenciasTrDe(f, regs).lista.forEach(t => linhas.push({ f, t }));
  });
  return linhas;
}

/* Quem está devendo treinamento da função (20/10/2026: paisagem, a pedido
   dele, para o nome do treinamento caber inteiro; filtro por funcionário).
   O nome e a função saem só na primeira linha de cada pessoa em cada folha. */
const POR_FOLHA_TF = 14;
export function documentoPendenciasTr(funcionarioId = '') {
  const linhas = pendenciasTodos(funcionarioId);
  const pessoa = funcionarioId ? estado.funcionarios.find(f => f.id === funcionarioId) : null;
  const subt = (pessoa ? `${pessoa.nome} · ` : 'Ativos · ') + dataBr(hoje());
  const pe = `${linhas.length} pendência(s) · ${new Set(linhas.map(l => l.f.id)).size} pessoa(s)`;
  if (!linhas.length) {
    return folha('TREINAMENTOS DA FUNÇÃO NUNCA REALIZADOS', subt,
      `<p class="pn-nada">${pessoa ? 'Nenhum treinamento da função pendente para esta pessoa.' : 'Ninguém devendo treinamento da função.'}</p>`,
      pe, true);
  }
  const total = Math.ceil(linhas.length / POR_FOLHA_TF);
  const folhas = [];
  for (let p = 0; p < total; p++) {
    const fatia = linhas.slice(p * POR_FOLHA_TF, (p + 1) * POR_FOLHA_TF);
    const corpo = `
    <table class="an-tab tf-pend">
      <colgroup><col style="width:78mm"><col style="width:52mm"><col></colgroup>
      <thead><tr><th>FUNCIONÁRIO</th><th>FUNÇÃO</th><th>TREINAMENTO NUNCA REALIZADO</th></tr></thead>
      <tbody>${fatia.map((l, i) => {
        const primeira = i === 0 || fatia[i - 1].f.id !== l.f.id;
        return `<tr${primeira && i ? ' class="tf-nova"' : ''}>
          <td class="an-nome">${primeira ? esc(l.f.nome) : ''}</td>
          <td>${primeira ? esc(l.f.cargo || '—') : ''}</td>
          <td>${esc(l.t.nome)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${p === total - 1 ? '<div class="aso-nota">Só entram funções com lista montada. Treinamento feito e vencido aparece no painel de vencimentos, não aqui.</div>' : ''}`;
    folhas.push(folha('TREINAMENTOS DA FUNÇÃO NUNCA REALIZADOS', subt, corpo,
      pe + (total > 1 ? ` · folha ${p + 1} de ${total}` : ''), true));
  }
  return folhas.join('');
}

/* O filtro de funcionário do relatório: só quem tem alguma pendência. */
function montarFiltro() {
  const sel = $('tfFiltroFunc');
  if (!sel) return;
  const antes = sel.value;
  const gente = [...new Map(pendenciasTodos().map(l => [l.f.id, l.f])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  sel.innerHTML = `<option value="">Todos (${gente.length})</option>` +
    gente.map(f => `<option value="${f.id}">${esc(f.nome)} — ${esc(f.cargo || '')}</option>`).join('');
  sel.value = gente.some(f => f.id === antes) ? antes : '';
}
let saidaAtual = '';

/* =============== ligações =============== */
export function ligarTreinoFuncao() {
  $('tfFuncao').addEventListener('change', desenhar);
  $('bExcluirTf').addEventListener('click', excluir);
  $('bCopiarTf').addEventListener('click', copiarDe);
  $('formCopiarTf').addEventListener('submit', confirmarCopia);
  $('bCancelarCopiaTf').addEventListener('click', () => $('dlgCopiarTf').close());
  const mostrar = (html, qual) => {
    saidaAtual = qual;
    $('tfSaida').innerHTML = html;
    $('tfSaida').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('bQuadroTf').addEventListener('click', () => mostrar(documentoQuadroTr(), 'quadro'));
  $('bPendTf').addEventListener('click', () => { montarFiltro(); mostrar(documentoPendenciasTr($('tfFiltroFunc').value), 'pend'); });
  $('tfFiltroFunc').addEventListener('change', () =>
    mostrar(documentoPendenciasTr($('tfFiltroFunc').value), 'pend'));
  $('bImprimirTf').addEventListener('click', () => {
    if (!so($('tfSaida').innerHTML)) return;
    window.print();
  });
}
