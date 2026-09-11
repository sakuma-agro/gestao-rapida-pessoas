// aso.js — os exames que cada função exige, e a conferência dentro do ASO.
//
// A ideia: o PCMSO diz, para cada função, quais exames complementares entram
// no ASO. Aqui isso vira uma lista por função (sst_exames_funcao). Quando o
// ASO de alguém é lançado, essa lista aparece dentro do lançamento e vai sendo
// marcada (sst_aso_itens). Enquanto faltar exame, o ASO sai como incompleto.
//
// A mesma lista alimenta dois papéis: a guia que o candidato leva na clínica e
// o quadro geral de todas as funções, para conferir com o técnico.
import { estado } from './store.js';
import { LOGO } from './seed.js';

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
const A = {
  porFuncao: [],      // { funcao, tipo_id }
  itens: new Map(),   // exame_id -> [ { tipo_id, feito, realizado } ]
  carregado: false,
};

/* Os tipos vêm do sst.js, que já os carrega. Para não buscar duas vezes,
   quem chama passa a lista. */
let TIPOS = [];
export const definirTipos = lista => { TIPOS = lista || []; };

const tipo = id => TIPOS.find(t => t.id === id);
export const complementares = () => TIPOS.filter(t => t.categoria !== 'aso');
export const tiposAso = () => TIPOS.filter(t => t.categoria === 'aso');

/** As funções que aparecem: as do cadastro mais as que já têm lista montada. */
export function funcoes() {
  const doCadastro = estado.funcionarios
    .filter(f => f.situacao === 'ATIVO').map(f => so(f.cargo)).filter(Boolean);
  const daLista = A.porFuncao.map(x => x.funcao);
  return [...new Set([...doCadastro, ...daLista])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Os exames que essa função exige, na ordem do cadastro de tipos. */
export function exigidosDe(funcao) {
  const ids = A.porFuncao.filter(x => so(x.funcao) === so(funcao)).map(x => x.tipo_id);
  return TIPOS.filter(t => ids.includes(t.id));
}

export async function carregarAso() {
  const c = estado.cliente;
  const [pf, it] = await Promise.all([
    c.from('sst_exames_funcao').select('*'),
    c.from('sst_aso_itens').select('*'),
  ]);
  if (pf.error || it.error) throw (pf.error || it.error);
  A.porFuncao = pf.data || [];
  A.itens = new Map();
  (it.data || []).forEach(x => {
    if (!A.itens.has(x.exame_id)) A.itens.set(x.exame_id, []);
    A.itens.get(x.exame_id).push(x);
  });
  A.carregado = true;
}

export function limparAso() {
  A.porFuncao = []; A.itens = new Map(); A.carregado = false;
  pendentes = null;
}

/**
 * Como está a conferência de um ASO lançado.
 * Só vale para lançamento de categoria 'aso'; complementar solto não tem lista.
 */
export function conferenciaDo(exame, funcionario) {
  const t = tipo(exame?.tipo_id);
  if (!t || t.categoria !== 'aso') return null;
  const exigidos = exigidosDe(funcionario?.cargo);
  if (!exigidos.length) return null;
  const marcados = A.itens.get(exame.id) || [];
  const feitos = exigidos.filter(e => marcados.some(m => m.tipo_id === e.id && m.feito)).length;
  return { feitos, total: exigidos.length, completo: feitos === exigidos.length };
}

/* =============== a lista dentro do lançamento ===============
   Enquanto o diálogo está aberto, a marcação vive aqui. Só vai para o banco
   depois que o ASO for salvo — um ASO novo ainda não tem id. */
let pendentes = null;   // Map tipo_id -> { feito, realizado }

/** Monta a lista de conferência para o ASO que está sendo lançado. */
export function desenharItens(exameId, funcionarioId, tipoId) {
  const caixa = $('exItens');
  if (!caixa) return;

  const t = tipo(tipoId);
  const f = estado.funcionarios.find(x => x.id === funcionarioId);

  if (!t || t.categoria !== 'aso') {
    caixa.hidden = true; pendentes = null; return;
  }
  if (!f) {
    caixa.hidden = false;
    caixa.innerHTML = '<p class="dica" style="margin:0">Escolha o funcionário para ver os exames da função dele.</p>';
    pendentes = null; return;
  }

  const exigidos = exigidosDe(f.cargo);
  if (!exigidos.length) {
    caixa.hidden = false;
    caixa.innerHTML = `<p class="dica" style="margin:0">
      A função <b>${esc(f.cargo || '—')}</b> ainda não tem exames cadastrados.
      Monte a lista em <b>Exames por função</b>.</p>`;
    pendentes = null; return;
  }

  // parte do que já está gravado, se o ASO já existe
  const gravados = A.itens.get(exameId) || [];
  pendentes = new Map(exigidos.map(e => {
    const g = gravados.find(x => x.tipo_id === e.id);
    return [e.id, { feito: !!g?.feito, realizado: g?.realizado || null }];
  }));

  caixa.hidden = false;
  caixa.innerHTML = `
    <div class="aso-cab">
      <b>Exames da função ${esc(f.cargo || '—')}</b>
      <span class="dc-sem" id="exItensConta"></span>
    </div>
    <div class="lista" id="exItensLista">
      ${exigidos.map(e => {
        const p = pendentes.get(e.id);
        return `<label class="item aso-item" for="it_${e.id}">
          <input type="checkbox" id="it_${e.id}" data-item="${e.id}" ${p.feito ? 'checked' : ''}>
          <span><span class="nome">${esc(e.nome)}</span></span>
          <span class="acoes">
            <input type="date" class="aso-data" data-data="${e.id}"
                   value="${p.realizado || ''}" ${p.feito ? '' : 'disabled'}>
          </span>
        </label>`;
      }).join('')}
    </div>`;

  caixa.querySelectorAll('[data-item]').forEach(cx => cx.addEventListener('change', () => {
    const p = pendentes.get(cx.dataset.item);
    p.feito = cx.checked;
    const campo = caixa.querySelector(`[data-data="${cx.dataset.item}"]`);
    campo.disabled = !cx.checked;
    if (cx.checked && !campo.value) { campo.value = $('exData')?.value || hoje(); p.realizado = campo.value; }
    contarItens();
  }));
  caixa.querySelectorAll('[data-data]').forEach(dt => dt.addEventListener('change', () => {
    pendentes.get(dt.dataset.data).realizado = dt.value || null;
  }));
  contarItens();
}

function contarItens() {
  const alvo = $('exItensConta');
  if (!alvo || !pendentes) return;
  const feitos = [...pendentes.values()].filter(p => p.feito).length;
  alvo.textContent = `${feitos} de ${pendentes.size} marcado(s)`;
}

/** Grava a marcação depois que o ASO foi salvo e já tem id. */
export async function salvarItens(exameId) {
  if (!pendentes || !exameId) return;
  const linhas = [...pendentes.entries()].map(([tipo_id, p]) => ({
    exame_id: exameId, tipo_id,
    feito: !!p.feito,
    realizado: p.feito ? (p.realizado || null) : null,
  }));
  const { error } = await estado.cliente.from('sst_aso_itens').upsert(linhas);
  if (error) throw error;
  A.itens.set(exameId, linhas);
}

/* ==================================================================
   TELA · EXAMES POR FUNÇÃO
   ================================================================== */
export async function abrirFuncoes() {
  if (!A.carregado) {
    try { await carregarAso(); } catch (e) {
      $('efLista').innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`;
      return;
    }
  }
  const sel = $('efFuncao');
  const antes = sel.value;
  const lista = funcoes();
  sel.innerHTML = '<option value="">Escolha a função</option>' +
    lista.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  sel.value = lista.includes(antes) ? antes : (lista[0] || '');
  desenharFuncao();
}

function desenharFuncao() {
  const funcao = $('efFuncao').value;
  const exigidos = exigidosDe(funcao);
  const todos = complementares();

  $('efResumo').textContent = funcao
    ? `${exigidos.length} exame(s) na lista de ${funcao}. ` +
      `${estado.funcionarios.filter(f => f.situacao === 'ATIVO' && so(f.cargo) === so(funcao)).length} pessoa(s) nessa função.`
    : '';

  $('efLista').innerHTML = !funcao ? '<div class="vazio">Escolha uma função.</div>' : `
    <div class="lista">
      ${todos.map(t => {
        const marcado = exigidos.some(e => e.id === t.id);
        return `<label class="item" for="ef_${t.id}" style="grid-template-columns:22px 1fr auto">
          <input type="checkbox" id="ef_${t.id}" data-exame="${t.id}" ${marcado ? 'checked' : ''}>
          <span><span class="nome">${esc(t.nome)}</span>
            ${t.meses ? `<br><span class="sub">tem validade própria de ${t.meses} meses</span>` : ''}</span>
          <span class="acoes">${t.ativo === false ? '<span class="tag inativo">desativado</span>' : ''}</span>
        </label>`;
      }).join('')}
    </div>`;

  $('efLista').querySelectorAll('[data-exame]').forEach(cx =>
    cx.addEventListener('change', () => trocarExame(funcao, cx.dataset.exame, cx.checked, cx)));
}

async function trocarExame(funcao, tipoId, ligar, caixa) {
  caixa.disabled = true;
  try {
    if (ligar) {
      const { error } = await estado.cliente.from('sst_exames_funcao')
        .upsert({ funcao, tipo_id: tipoId });
      if (error) throw error;
      A.porFuncao.push({ funcao, tipo_id: tipoId });
    } else {
      const { error } = await estado.cliente.from('sst_exames_funcao')
        .delete().eq('funcao', funcao).eq('tipo_id', tipoId);
      if (error) throw error;
      A.porFuncao = A.porFuncao.filter(x => !(so(x.funcao) === so(funcao) && x.tipo_id === tipoId));
    }
    desenharFuncao();
  } catch (e) {
    caixa.checked = !ligar;
    alert('Não deu para salvar: ' + (e.message || e));
  } finally { caixa.disabled = false; }
}

/* ==================================================================
   OS DOIS DOCUMENTOS
   ================================================================== */
/* `deitada` vira A4 em paisagem — o quadro geral tem uma coluna por exame e
   em pé os nomes dos exames se atropelam. Quem faz a virada é a classe
   `.deitada` + a `@page paisagem` no css/app.css. */
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
  </div>`;

/** A guia que o candidato leva na clínica. */
export function documentoGuia(funcao, nome, tipoAso) {
  const exigidos = exigidosDe(funcao);
  const corpo = `
    <table class="an-tab aso-guia">
      <colgroup><col style="width:38mm"><col></colgroup>
      <tbody>
        <tr><td class="aso-rot">NOME</td><td>${esc(nome) || '&nbsp;'}</td></tr>
        <tr><td class="aso-rot">FUNÇÃO</td><td>${esc(funcao) || '&nbsp;'}</td></tr>
        <tr><td class="aso-rot">TIPO DE ASO</td><td>${esc(tipoAso) || '&nbsp;'}</td></tr>
        <tr><td class="aso-rot">DATA</td><td>${dataBr(hoje())}</td></tr>
      </tbody>
    </table>

    <table class="an-tab aso-guia" style="margin-top:6mm">
      <colgroup><col style="width:12mm"><col><col style="width:32mm"></colgroup>
      <thead><tr><th>Nº</th><th>EXAME A REALIZAR</th><th>DATA / VISTO</th></tr></thead>
      <tbody>
        ${exigidos.length
          ? exigidos.map((t, i) => `<tr>
              <td class="ce">${i + 1}</td>
              <td class="an-nome">${esc(t.nome)}</td>
              <td></td>
            </tr>`).join('')
          : '<tr><td colspan="3" class="an-vazio">Nenhum exame cadastrado para esta função.</td></tr>'}
        ${Array.from({ length: Math.max(2, 10 - exigidos.length) },
          () => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')}
      </tbody>
    </table>

    <div class="aso-nota">
      Exame clínico ocupacional obrigatório em todo ASO, além dos exames listados acima.
      Os exames seguem o PCMSO vigente da empresa.
    </div>

    <div class="aso-assinaturas">
      <div><span></span><small>Responsável pela emissão</small></div>
      <div><span></span><small>Médico examinador</small></div>
    </div>`;

  return folha('GUIA DE EXAMES OCUPACIONAIS',
    `${exigidos.length} exame(s) complementar(es) · ${dataBr(hoje())}`,
    corpo, funcao || '');
}

/** O quadro de todas as funções, para conferir com o técnico. */
export function documentoQuadro() {
  const lista = funcoes().filter(f => exigidosDe(f).length);
  const usados = complementares().filter(t => A.porFuncao.some(x => x.tipo_id === t.id));

  const corpo = `
    <table class="an-tab aso-quadro">
      <thead><tr>
        <th>FUNÇÃO</th>
        ${usados.map(t => `<th class="ce aso-vert">${esc(t.nome)}</th>`).join('')}
        <th class="ce">TOTAL</th>
      </tr></thead>
      <tbody>
        ${lista.map(f => {
          const ids = exigidosDe(f).map(t => t.id);
          return `<tr>
            <td class="an-nome">${esc(f)}</td>
            ${usados.map(t => `<td class="ce">${ids.includes(t.id) ? '<b>X</b>' : ''}</td>`).join('')}
            <td class="ce"><b>${ids.length}</b></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="aso-nota">
      Exame clínico ocupacional obrigatório em todo ASO, além dos exames marcados.
      Esta relação é a que está cadastrada no app — o documento que manda é o PCMSO.
    </div>`;

  return folha('EXAMES POR FUNÇÃO',
    `Quadro geral · ${dataBr(hoje())}`, corpo, `${lista.length} função(ões)`, true);
}

/* =============== ligações =============== */
export function ligarAso() {
  $('efFuncao').addEventListener('change', desenharFuncao);

  $('bGuiaFuncao').addEventListener('click', () => {
    const funcao = $('efFuncao').value;
    if (!funcao) return;
    $('gfFuncao').textContent = funcao;
    $('gfNome').value = '';
    $('gfTipo').innerHTML = tiposAso()
      .map(t => `<option value="${esc(t.nome)}">${esc(t.nome)}</option>`).join('');
    $('dlgGuia').showModal();
  });

  $('formGuia').addEventListener('submit', ev => {
    ev.preventDefault();
    const funcao = $('efFuncao').value;
    $('efSaida').innerHTML = documentoGuia(funcao, so($('gfNome').value), $('gfTipo').value);
    $('dlgGuia').close();
    $('efSaida').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('bQuadroFuncoes').addEventListener('click', () => {
    $('efSaida').innerHTML = documentoQuadro();
    $('efSaida').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('bImprimirEf').addEventListener('click', () => {
    if (!so($('efSaida').innerHTML)) return;
    window.print();
  });
}
