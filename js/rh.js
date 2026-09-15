// rh.js — módulo RH: plano de cargos e salários, proposta em PDF e quadro de pessoal.
//
// O que veio do módulo DP (e vale a pena repetir):
//  · a moldura de documento `.rel` — marca da SAKUMA no alto, LOP uma vez só no
//    rodapé, tabela com grade e cabeçalho verde (css/jornada-impressao.css);
//  · prévia na tela antes de qualquer impressão — nada sai no papel sem ele ver;
//  · toda saída tem duas formas: documento para apresentar e CSV para trabalhar;
//  · nenhuma tela mostra dado de exemplo; o que falta, o app diz que falta.
//
// Salário é dado sensível: as tabelas rh_* só abrem para quem tem o módulo RH,
// e isso é conferido no banco (política app_pode('rh')), não só na tela.
import { estado } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

/* Empregador, fazenda, setor e cargo são texto livre no cadastro, e o mesmo
   lugar aparece escrito de jeitos diferentes: "FABIO MASSAO SAKUMA" e "Fabio
   Massao Sakuma", "CAMPO" e "Campo". Contadas como se fossem coisas
   diferentes, viravam duas linhas no quadro — cada uma com a sua fatia.
   A chave de agrupamento ignora caixa, acento e espaço sobrando; o rótulo que
   aparece na tela é a grafia mais usada. */
const chaveDeGrupo = v => so(v).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

/* Agrupa os valores de um campo e devolve, para cada grupo, a grafia
   escolhida: a mais frequente e, no empate, a primeira em ordem alfabética —
   assim o rótulo não muda a cada recarga. */
function agrupar(gente, campo) {
  const grupos = new Map();
  gente.forEach(f => {
    const bruto = so(f[campo]);
    const k = chaveDeGrupo(bruto);
    if (!grupos.has(k)) grupos.set(k, { total: 0, grafias: new Map() });
    const g = grupos.get(k);
    g.total++;
    if (bruto) g.grafias.set(bruto, (g.grafias.get(bruto) || 0) + 1);
  });
  /* Desempate: mais gente escreveu assim > tem acento (COCÃO ganha de COCAO,
     que é a mesma palavra com informação a menos) > ordem alfabética, para o
     rótulo não mudar de uma recarga para a outra. */
  const comAcento = t => (t.normalize('NFD').match(/[\u0300-\u036f]/g) || []).length;
  for (const g of grupos.values()) {
    g.rotulo = [...g.grafias.entries()]
      .sort((a, b) => b[1] - a[1]
        || comAcento(b[0]) - comAcento(a[0])
        || a[0].localeCompare(b[0], 'pt-BR'))[0]?.[0] || 'Não informado';
  }
  return grupos;
}
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const porExtenso = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : '';
};

export const dinheiro = v => (v == null || v === '' || isNaN(v))
  ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pct = (parte, total) => (total ? `${(parte * 100 / total).toFixed(1).replace('.', ',')}%` : '—');

/* O adicional de periculosidade da NR-16: 30% sobre o salário base. */
export const PERICULOSIDADE = 0.30;

/* As cinco faixas da tabela salarial: A, B, C, D e E. A B é a "média", o
   salário ideal conforme o mercado — a coluna do banco ainda se chama
   faixa_media por isso, mas na tela e no papel ela é a B. */
export const FAIXAS = [
  ['faixa_a', 'A'], ['faixa_media', 'B'], ['faixa_c', 'C'], ['faixa_d', 'D'], ['faixa_e', 'E'],
];

/* =============== dados =============== */
const R = { cargos: [], modelo: null, propostas: [], carregado: false };
let editandoCargo = null;
let documentoAtual = '';   // o que está na prévia, para imprimir

export async function carregarRh() {
  const c = estado.cliente;
  const [cg, md, pr] = await Promise.all([
    c.from('rh_cargos').select('*').order('ordem').order('nome'),
    c.from('rh_modelo').select('*').eq('id', 1).maybeSingle(),
    c.from('rh_propostas').select('*').order('criado_em', { ascending: false }).limit(30),
  ]);
  if (cg.error || pr.error) throw (cg.error || pr.error);
  R.cargos = cg.data || [];
  R.modelo = md.data || {};
  R.propostas = pr.data || [];
  R.carregado = true;
}

export function limparRh() {
  R.cargos = []; R.modelo = null; R.propostas = []; R.carregado = false;
  documentoAtual = '';
}

const cargoPorId = id => R.cargos.find(c => c.id === id);
const cargoPorNome = nome => R.cargos.find(c =>
  so(c.nome).toLowerCase() === so(nome).toLowerCase());

/* =============== idade e tempo de casa =============== */
const anosDesde = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const h = new Date();
  let a = h.getFullYear() - +m[1];
  const mes = h.getMonth() + 1, dia = h.getDate();
  if (mes < +m[2] || (mes === +m[2] && dia < +m[3])) a--;
  return a >= 0 && a < 120 ? a : null;
};

const FAIXA_IDADE = [
  ['Até 25 anos', 0, 25], ['26 a 35 anos', 26, 35], ['36 a 45 anos', 36, 45],
  ['46 a 55 anos', 46, 55], ['56 anos ou mais', 56, 200],
];
const FAIXA_CASA = [
  ['Menos de 1 ano', 0, 0], ['1 a 3 anos', 1, 2], ['3 a 5 anos', 3, 4],
  ['5 a 10 anos', 5, 9], ['Mais de 10 anos', 10, 200],
];
const naFaixa = (v, tabela) => v == null ? null
  : (tabela.find(([, a, b]) => v >= a && v <= b) || [])[0] || null;

/* =============== moldura de documento (herdada do DP) =============== */
/* `assinatura` vazia = documento sem linha de assinatura, e é esse o padrão:
   ele pediu o nome fora dos relatórios. Quem quiser assinar de novo preenche o
   campo "Assinatura" em RH → Modelo — não volte a cravar um nome no código. */
function documento({ titulo, subtitulo, canto, corpo, assinatura }) {
  return `
  <article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>${esc(titulo)}</h1>
        <p>${esc(subtitulo)}</p>
      </div>
      <div class="rel-comp">
        <span>emitido em</span>
        <strong>${dataBr(hoje())}</strong>
        <span>${esc(canto || '')}</span>
      </div>
    </header>
    ${corpo}
    ${assinatura ? `<div class="rel-assinaturas">
      <div class="rel-assina"><span></span><small>${esc(assinatura)}</small></div>
    </div>` : ''}
    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

/** Põe o documento na prévia. Nada vai para o papel sem passar por aqui. */
function verPrevia(html) {
  documentoAtual = html;
  const alvo = $('jorImpressao');
  if (!alvo) return;
  alvo.innerHTML = html;
  alvo.hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function imprimirPrevia() {
  if (!documentoAtual) return;
  document.body.classList.add('jor-imprimindo');
  const soltar = () => {
    document.body.classList.remove('jor-imprimindo');
    removeEventListener('afterprint', soltar);
  };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);
}

function baixarCsv(nome, linhas) {
  const limpar = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = linhas.map(l => l.map(limpar).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* =============== abrir uma tela =============== */
export async function abrirRh(tela) {
  if (!['rhCargos', 'rhProposta', 'rhQuadro'].includes(tela)) return;
  if (!R.carregado) {
    try { await carregarRh(); } catch (e) {
      const alvo = tela === 'rhCargos' ? 'rhTabelaCargos' : (tela === 'rhProposta' ? 'rhUltimas' : 'rhQuadroResumo');
      if ($(alvo)) $(alvo).innerHTML = `<div class="vazio">Não deu para abrir o RH: ${esc(e.message || e)}</div>`;
      return;
    }
  }
  if (tela === 'rhCargos') desenharCargos();
  if (tela === 'rhProposta') abrirProposta();
  if (tela === 'rhQuadro') desenharQuadro();
}

/* ==================================================================
   1 · PLANO DE CARGOS E SALÁRIOS
   ================================================================== */
function desenharCargos() {
  const q = so($('rhBuscaCargo').value).toLowerCase();
  const lista = R.cargos.filter(c => !q ||
    [c.nome, c.nivel].some(v => so(v).toLowerCase().includes(q)));

  $('rhTabelaCargos').innerHTML = lista.length ? `
    <table class="dc-planilha">
      <thead><tr>
        <th>Cargo</th><th>Nível</th>
        ${FAIXAS.map(([, r]) => `<th class="ce">${r}</th>`).join('')}
        <th></th>
      </tr></thead>
      <tbody>${lista.map(c => `
        <tr${c.ativo === false ? ' class="rh-off"' : ''}>
          <td><strong>${esc(c.nome)}</strong>${c.ativo === false ? ' <span class="tag inativo">inativo</span>' : ''}</td>
          <td>${esc(c.nivel || '—')}</td>
          ${FAIXAS.map(([campo]) => `<td class="ce">${dinheiro(c[campo])}</td>`).join('')}
          <td class="ce"><button class="btn mini" data-cargo="${c.id}">Editar</button></td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div class="vazio">Nenhum cargo encontrado.</div>';

  $('rhTabelaCargos').querySelectorAll('[data-cargo]').forEach(b =>
    b.addEventListener('click', () => abrirCargo(b.dataset.cargo)));

  const regras = so(R.modelo?.regras);
  $('rhRegras').innerHTML = regras
    ? `<strong>Como as faixas funcionam</strong><ul>${regras.split('\n').filter(Boolean)
      .map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '';
  $('rhRegras').hidden = !regras;
}

function abrirCargo(id) {
  const c = id ? cargoPorId(id) : null;
  editandoCargo = c ? { ...c } : { ativo: true, ordem: (R.cargos.at(-1)?.ordem || 0) + 10 };
  $('tituloCargo').textContent = c ? 'Editar cargo' : 'Novo cargo';
  $('cgNome').value = c?.nome || '';
  $('cgNivel').value = c?.nivel || '';
  FAIXAS.forEach(([campo], i) => { $(`cgF${i}`).value = emCampo(c?.[campo]); });
  $('cgObs').value = c?.observacao || '';
  $('cgAtivo').value = (c && c.ativo === false) ? '0' : '1';
  $('erroCargo').hidden = true;
  $('bApagarCargo').hidden = !c;
  $('dlgCargo').showModal();
}

/**
 * Lê dinheiro digitado do jeito que vier: "3.105,96", "3105,96" ou "3105.96".
 * O ponto só é separador de milhar quando não há vírgula e ele separa grupos
 * de três — senão o ponto é a casa decimal, e trocar isso multiplicava o
 * salário por cem.
 */
function numeroOuNulo(v) {
  let t = so(v).replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return isNaN(n) ? null : n;
}

/** Como o valor aparece num campo de digitar: 3105,96 */
const emCampo = v => (v == null || v === '') ? '' : Number(v).toFixed(2).replace('.', ',');

/** Documento com a tabela salarial inteira. */
function documentoCargos() {
  const lista = R.cargos.filter(c => c.ativo !== false);
  const corpo = `
    <table class="rel-tabela">
      <thead><tr>
        <th>Cargo</th><th>Nível</th>
        ${FAIXAS.map(([, r]) => `<th class="rel-num">${r}</th>`).join('')}
      </tr></thead>
      <tbody>${lista.map(c => `<tr>
        <td>${esc(c.nome)}</td><td>${esc(c.nivel || '')}</td>
        ${FAIXAS.map(([campo]) => `<td class="rel-num">${dinheiro(c[campo])}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>
    ${so(R.modelo?.regras) ? `<div class="rel-resumo">
      ${so(R.modelo.regras).split('\n').filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('')}
    </div>` : ''}
    <p class="rel-nota">Documento de uso interno. As faixas seguem a tabela salarial vigente.</p>`;

  return documento({
    titulo: 'PLANO DE CARGOS E SALÁRIOS',
    subtitulo: 'SAKUMA Agronegócios · tabela salarial vigente',
    canto: `${lista.length} cargos`,
    corpo,
    assinatura: so(R.modelo?.assinatura),
  });
}

/* ==================================================================
   2 · PROPOSTA
   ================================================================== */
function abrirProposta() {
  const m = R.modelo || {};
  const sel = $('ppCargo');
  if (!sel.dataset.pronto) {
    sel.innerHTML = '<option value="">Escolha o cargo</option>' + R.cargos
      .filter(c => c.ativo !== false)
      .map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    $('ppFaixa').innerHTML = FAIXAS.map(([campo, rotulo]) =>
      `<option value="${campo}"${campo === 'faixa_media' ? ' selected' : ''}>${rotulo}</option>`).join('');
    $('ppPessoa').innerHTML = '<option value="">Escolha a pessoa</option>' + estado.funcionarios
      .filter(f => f.situacao === 'ATIVO')
      .map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('');
    sel.dataset.pronto = '1';
  }
  if (!so($('ppJornada').value)) $('ppJornada').value = m.jornada || '';
  if (!so($('ppLocal').value)) $('ppLocal').value = m.local_trabalho || '';
  if (!so($('ppExperiencia').value)) $('ppExperiencia').value = m.experiencia || '';
  if (!so($('ppBeneficios').value)) montarBeneficios();
  if (!so($('ppObs').value)) $('ppObs').value = m.observacoes || '';
  if (!so($('ppInicio').value)) $('ppInicio').value = hoje();
  trocarTipo();
  desenharUltimas();
}

/* Os benefícios saem do modelo: os de todo mundo e, se mora na fazenda,
   mais os de morador. Marcar a caixa remonta a lista. */
function montarBeneficios() {
  const m = R.modelo || {};
  const base = so(m.beneficios).split('\n').filter(Boolean);
  const extra = $('ppMorador').checked ? so(m.beneficios_morador).split('\n').filter(Boolean) : [];
  $('ppBeneficios').value = [...base, ...extra].join('\n');
}

function trocarTipo() {
  const promocao = $('ppTipo').value === 'promocao';
  $('campoPessoa').hidden = !promocao;
  $('campoNome').hidden = promocao;
  $('campoAtual').hidden = !promocao;
}

/** Ao escolher a pessoa, traz o cargo de hoje e o salário que a tabela mostra. */
function escolherPessoa() {
  const f = estado.funcionarios.find(x => x.id === $('ppPessoa').value);
  if (!f) return;
  $('ppCargoAtual').value = f.cargo || '';
  // o salário de hoje é da pessoa, não do cargo — quem digita é ele
  const c = cargoPorNome(f.cargo);
  if (c && !$('ppCargo').value) { $('ppCargo').value = c.id; escolherCargo(); }
}

/** Cargo + faixa mandam o salário; ele pode mudar em cima. */
function escolherCargo() {
  const c = cargoPorId($('ppCargo').value);
  $('ppNivel').textContent = c?.nivel ? `Nível ${c.nivel}` : '';
  aplicarFaixa();
}

function aplicarFaixa() {
  const c = cargoPorId($('ppCargo').value);
  const campo = $('ppFaixa').value;
  if (c && c[campo] != null) $('ppSalario').value = emCampo(c[campo]);
  const dica = $('ppDicaFaixa');
  dica.textContent = c
    ? FAIXAS.map(([k, r]) => `${r}: ${dinheiro(c[k])}`).join('   ·   ')
    : '';
}

function dadosDaProposta() {
  const promocao = $('ppTipo').value === 'promocao';
  const c = cargoPorId($('ppCargo').value);
  const pessoa = estado.funcionarios.find(x => x.id === $('ppPessoa').value);
  return {
    tipo: promocao ? 'promocao' : 'contratacao',
    funcionario_id: promocao ? (pessoa?.id || null) : null,
    nome: promocao ? so(pessoa?.nome) : so($('ppNome').value),
    cargo_id: c?.id || null,
    cargo_nome: c?.nome || '',
    nivel: c?.nivel || '',
    faixa: (FAIXAS.find(([k]) => k === $('ppFaixa').value) || [])[1] || '',
    salario: numeroOuNulo($('ppSalario').value),
    cargo_atual: promocao ? so($('ppCargoAtual').value) : '',
    salario_atual: promocao ? numeroOuNulo($('ppSalarioAtual').value) : null,
    morador: $('ppMorador').checked,
    periculosidade: $('ppPeric').checked,
    data_inicio: so($('ppInicio').value) || null,
    local_trabalho: so($('ppLocal').value),
    jornada: so($('ppJornada').value),
    experiencia: so($('ppExperiencia').value),
    beneficios: so($('ppBeneficios').value),
    observacao: so($('ppObs').value),
  };
}

export function documentoProposta(p) {
  const m = R.modelo || {};
  const promocao = p.tipo === 'promocao';
  const dif = (promocao && p.salario != null && p.salario_atual)
    ? ((p.salario - p.salario_atual) * 100 / p.salario_atual) : null;

  /* O valor da tabela salarial já vem COM a periculosidade dentro — foi o que
     ele confirmou. Então a conta é para trás: base = total / 1,30, e o
     adicional é o que sobra. Escrever "30% de 3.105,96" seria errado. */
  const comPeric = !!p.periculosidade && p.salario != null;
  const base = comPeric ? p.salario / (1 + PERICULOSIDADE) : null;
  const adicional = comPeric ? p.salario - base : null;

  const composicao = comPeric ? `
    <table class="rel-tabela">
      <thead><tr><th colspan="2">Como o salário é composto</th></tr></thead>
      <tbody>
        <tr><td style="width:60%">Salário base</td><td class="rel-num">${dinheiro(base)}</td></tr>
        <tr><td>Adicional de periculosidade (${(PERICULOSIDADE * 100).toFixed(0)}%)</td>
            <td class="rel-num">${dinheiro(adicional)}</td></tr>
      </tbody>
      <tfoot><tr><td>Total mensal</td><td class="rel-num">${dinheiro(p.salario)}</td></tr></tfoot>
    </table>
    <p class="rel-nota">O adicional de periculosidade é pago enquanto durar a atividade que lhe dá
      direito; cessada a condição, cessa o pagamento.</p>` : '';

  const ficha = `
    <div class="rel-ficha">
      <div><span>Nome</span><b>${esc(p.nome || '—')}</b></div>
      <div><span>Cargo</span><b>${esc(p.cargo_nome || '—')}</b></div>
      <div><span>Nível</span><b>${esc(p.nivel || '—')}</b></div>
      <div><span>Faixa salarial</span><b>${esc(p.faixa || '—')}</b></div>
      <div><span>Salário mensal</span><b>${dinheiro(p.salario)}${comPeric ? ' <small style="font-weight:400">(com periculosidade)</small>' : ''}</b></div>
      <div><span>${promocao ? 'Vigência a partir de' : 'Início previsto'}</span><b>${dataBr(p.data_inicio)}</b></div>
    </div>`;

  const comparativo = promocao ? `
    <table class="rel-tabela">
      <thead><tr><th></th><th>Hoje</th><th>Proposto</th></tr></thead>
      <tbody>
        <tr><td>Cargo</td><td>${esc(p.cargo_atual || '—')}</td><td>${esc(p.cargo_nome || '—')}</td></tr>
        <tr><td>Salário mensal</td><td class="rel-num">${dinheiro(p.salario_atual)}</td>
            <td class="rel-num">${dinheiro(p.salario)}</td></tr>
        ${dif != null ? `<tr><td>Diferença</td><td class="rel-num">—</td>
            <td class="rel-num">${dif >= 0 ? '+' : ''}${dif.toFixed(1).replace('.', ',')}%</td></tr>` : ''}
      </tbody>
    </table>` : '';

  const condicoes = `
    <table class="rel-tabela">
      <thead><tr><th colspan="2">Condições de trabalho</th></tr></thead>
      <tbody>
        <tr><td style="width:34%">Jornada</td><td>${esc(p.jornada || '—')}</td></tr>
        <tr><td>Local de trabalho</td><td>${esc(p.local_trabalho || '—')}</td></tr>
        <tr><td>Período de experiência</td><td>${esc(p.experiencia || '—')}</td></tr>
      </tbody>
    </table>`;

  const beneficios = so(p.beneficios) ? `
    <table class="rel-tabela">
      <thead><tr><th>Benefícios</th></tr></thead>
      <tbody>${so(p.beneficios).split('\n').filter(Boolean)
        .map(b => `<tr><td>${esc(b.trim())}</td></tr>`).join('')}</tbody>
    </table>` : '';

  const corpo = `
    <p>${esc(m.abertura || '')}</p>
    ${ficha}
    ${composicao}
    ${comparativo}
    ${condicoes}
    ${beneficios}
    ${so(p.observacao) ? `<div class="rel-resumo">${so(p.observacao).split('\n')
      .filter(Boolean).map(l => `<div>${esc(l.trim())}</div>`).join('')}</div>` : ''}
    ${so(m.fechamento) ? `<p class="rel-nota">${esc(m.fechamento)}</p>` : ''}
    <p class="rel-nota">São Gotardo, ${porExtenso(hoje())}.</p>`;

  return documento({
    titulo: promocao ? 'PROPOSTA DE PROMOÇÃO' : (m.titulo || 'PROPOSTA DE TRABALHO'),
    subtitulo: 'Plano de Cargos e Salários · SAKUMA Agronegócios',
    canto: esc(p.cargo_nome || ''),
    corpo,
    assinatura: so(m.assinatura),
  });
}

function desenharUltimas() {
  const alvo = $('rhUltimas');
  if (!alvo) return;
  alvo.innerHTML = R.propostas.length ? R.propostas.map(p => `
    <div class="item" style="grid-template-columns:1fr auto">
      <span>
        <span class="nome">${esc(p.nome)}</span>
        <span class="tag ${p.tipo === 'promocao' ? 'alerta' : 'ativo'}">${p.tipo === 'promocao' ? 'promoção' : 'contratação'}</span><br>
        <span class="sub">${esc(p.cargo_nome || '')} · faixa ${esc(p.faixa || '—')} · ${dinheiro(p.salario)} · ${dataBr(String(p.criado_em).slice(0, 10))}</span>
      </span>
      <span class="acoes"><button class="btn mini" data-prop="${p.id}">Ver de novo</button></span>
    </div>`).join('')
    : '<div class="vazio">Nenhuma proposta emitida ainda.</div>';

  alvo.querySelectorAll('[data-prop]').forEach(b => b.addEventListener('click', () => {
    const p = R.propostas.find(x => x.id === b.dataset.prop);
    if (p) verPrevia(documentoProposta(p));
  }));
}

/* ==================================================================
   3 · QUADRO DE PESSOAL
   ================================================================== */
function gentePara() {
  const sit = $('qpSituacao').value;
  const emp = $('qpEmpregador').value;
  const faz = $('qpFazenda').value;
  return estado.funcionarios.filter(f =>
    (!sit || f.situacao === sit) &&
    (!emp || chaveDeGrupo(f.empregador) === emp) &&
    (!faz || chaveDeGrupo(f.fazenda) === faz));
}

/** Como o recorte escolhido é dito no documento e no CSV. */
function recorte() {
  /* O valor da opção virou a chave do grupo, que é minúscula e sem acento —
     boa para comparar, péssima para escrever no documento. Então aqui vale o
     que está ESCRITO na opção escolhida. */
  const escolhido = id => {
    const sel = $(id);
    return sel.value ? (sel.selectedOptions[0]?.textContent || '').trim() : '';
  };
  const emp = escolhido('qpEmpregador');
  const faz = escolhido('qpFazenda');
  if (emp && faz) return `${faz} · ${emp}`;
  if (faz) return faz;
  if (emp) return emp;
  return 'todos os empregadores';
}

const contarPor = (gente, campo) =>
  [...agrupar(gente, campo).values()]
    .map(g => [g.rotulo, g.total])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));

const contarFaixa = (gente, valorDe, tabela) => {
  const mapa = new Map(tabela.map(([r]) => [r, 0]));
  let sem = 0;
  gente.forEach(f => {
    const r = naFaixa(valorDe(f), tabela);
    if (r == null) sem++; else mapa.set(r, mapa.get(r) + 1);
  });
  const linhas = [...mapa.entries()];
  if (sem) linhas.push(['Não informado', sem]);
  return linhas;
};

/** Os blocos do relatório. O que o filtro já fixou não vira tabela de uma linha. */
function blocosDe(g) {
  const blocos = [];
  if (!$('qpEmpregador').value) blocos.push(['Empregador', contarPor(g, 'empregador')]);
  if (!$('qpFazenda').value) blocos.push(['Fazenda', contarPor(g, 'fazenda')]);
  blocos.push(['Setor', contarPor(g, 'setor')]);
  blocos.push(['Cargo', contarPor(g, 'cargo')]);
  blocos.push(['Faixa etária', contarFaixa(g, f => anosDesde(f.nascimento), FAIXA_IDADE)]);
  blocos.push(['Tempo de casa', contarFaixa(g, f => anosDesde(f.admissao), FAIXA_CASA)]);
  return blocos;
}

function numeros() {
  const gente = gentePara();
  const total = gente.length;
  const h = gente.filter(f => f.sexo === 'M').length;
  const mu = gente.filter(f => f.sexo === 'F').length;
  const semSexo = total - h - mu;
  const idades = gente.map(f => anosDesde(f.nascimento)).filter(v => v != null);
  const casas = gente.map(f => anosDesde(f.admissao)).filter(v => v != null);
  const media = l => l.length ? (l.reduce((a, b) => a + b, 0) / l.length) : null;
  return {
    gente, total, h, mu, semSexo,
    idadeMedia: media(idades), semNascimento: total - idades.length,
    casaMedia: media(casas), semAdmissao: total - casas.length,
  };
}

/* =============== gráficos =================================================
   Tudo desenhado em SVG, na mão. Forma vetorial imprime sempre; se fossem
   `div` com cor de fundo sumiriam no papel, porque o Chrome imprime sem
   gráficos de plano de fundo. Mesma regra da lista de presença.
   ========================================================================= */
const CORES = {
  homem: '#84BD00', mulher: '#744F28', semSexo: '#C9CCC2',
  trilho: '#E7EBDE', barra: '#84BD00',
};

/** Barra horizontal proporcional, para as tabelas. */
function barra(v, total) {
  const larg = total > 0 ? Math.min(100, v * 100 / total) : 0;
  return `<svg class="g-barra" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
    <rect x="0" y="1" width="100" height="6" fill="${CORES.trilho}"/>
    <rect x="0" y="1" width="${larg.toFixed(2)}" height="6" fill="${CORES.barra}"/>
  </svg>`;
}

/**
 * Rosca de homens x mulheres. Cada fatia é um arco de círculo feito com
 * tracejado (stroke-dasharray), que é o jeito mais simples de fazer rosca
 * sem biblioteca nenhuma.
 */
function roscaSexo(n) {
  const conhecidos = n.h + n.mu;
  if (!conhecidos) {
    return `<div class="g-vazio">Ainda não dá para desenhar: ninguém tem o sexo
      informado neste recorte. Marque na caixa abaixo e o gráfico aparece.</div>`;
  }

  const raio = 60, grosso = 26, volta = 2 * Math.PI * raio;
  const fatias = [
    { rotulo: 'Homens', v: n.h, cor: CORES.homem },
    { rotulo: 'Mulheres', v: n.mu, cor: CORES.mulher },
  ];
  if (n.semSexo) fatias.push({ rotulo: 'Não informado', v: n.semSexo, cor: CORES.semSexo });

  const totalRosca = fatias.reduce((a, f) => a + f.v, 0);
  let virado = 0;
  const arcos = fatias.filter(f => f.v > 0).map(f => {
    const trecho = volta * f.v / totalRosca;
    const el = `<circle cx="80" cy="80" r="${raio}" fill="none" stroke="${f.cor}"
      stroke-width="${grosso}" stroke-dasharray="${trecho.toFixed(2)} ${(volta - trecho).toFixed(2)}"
      stroke-dashoffset="${(-virado).toFixed(2)}" transform="rotate(-90 80 80)"/>`;
    virado += trecho;
    return el;
  }).join('');

  // As fatias e os números da legenda saem todos sobre o mesmo total: o que
  // está desenhado na rosca. Percentual que não bate com o desenho engana.
  const maior = n.h >= n.mu ? fatias[0] : fatias[1];
  const legenda = fatias.map(f => `
    <div class="g-item">
      <svg class="g-cor" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="${f.cor}"/></svg>
      <span class="g-nome">${esc(f.rotulo)}</span>
      <b>${f.v}</b>
      <small>${pct(f.v, totalRosca)}</small>
    </div>`).join('');

  return `
    <div class="g-rosca">
      <svg viewBox="0 0 160 160" class="g-donut" role="img"
           aria-label="Homens ${pct(n.h, conhecidos)}, mulheres ${pct(n.mu, conhecidos)}">
        ${arcos}
        <text x="80" y="74" text-anchor="middle" class="g-centro-n">${pct(maior.v, totalRosca)}</text>
        <text x="80" y="94" text-anchor="middle" class="g-centro-r">${esc(maior.rotulo.toLowerCase())}</text>
      </svg>
      <div class="g-legenda">
        ${legenda}
        ${n.semSexo ? `<p class="g-nota">Contando só quem já tem o sexo no cadastro
          (${conhecidos} de ${n.total}): ${pct(n.h, conhecidos)} homens e
          ${pct(n.mu, conhecidos)} mulheres.</p>` : ''}
      </div>
    </div>`;
}

/** Enche os dois filtros. As fazendas seguem o empregador escolhido. */
function preencherFiltros() {
  /* O valor da opção é a CHAVE do grupo, não a grafia: assim escolher
     "FABIO MASSAO SAKUMA" também traz quem foi cadastrado como "Fabio Massao
     Sakuma". O que aparece escrito é a grafia mais usada. */
  const opcoes = (grupos, vazio) => `<option value="">${vazio}</option>` +
    [...grupos.entries()]
      .filter(([k]) => k)
      .sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo, 'pt-BR'))
      .map(([k, g]) => `<option value="${esc(k)}">${esc(g.rotulo)}</option>`).join('');

  const sel = $('qpEmpregador');
  if (!sel.dataset.pronto) {
    sel.innerHTML = opcoes(agrupar(estado.funcionarios, 'empregador'), 'Todos os empregadores');
    sel.dataset.pronto = '1';
  }

  // só as fazendas de quem está selecionado — nada de opção que não traz ninguém
  const emp = sel.value;
  const selFaz = $('qpFazenda');
  const escolhida = selFaz.value;
  const sit = $('qpSituacao').value;
  const grupos = agrupar(estado.funcionarios.filter(f =>
    (!emp || chaveDeGrupo(f.empregador) === emp) && (!sit || f.situacao === sit)), 'fazenda');

  selFaz.innerHTML = opcoes(grupos, 'Todas as fazendas');
  selFaz.value = grupos.has(escolhida) ? escolhida : '';
}

function desenharQuadro() {
  preencherFiltros();

  const n = numeros();
  const um = (rotulo, valor, nota) => `
    <div class="qp-card">
      <span>${esc(rotulo)}</span>
      <strong>${esc(valor)}</strong>
      ${nota ? `<small>${esc(nota)}</small>` : ''}
    </div>`;

  $('rhQuadroResumo').innerHTML = [
    um('Pessoas', String(n.total), recorte()),
    // percentual sobre o total, igual ao da rosca — indicador só pode ter um valor
    um('Homens', `${n.h}`, pct(n.h, n.total)),
    um('Mulheres', `${n.mu}`, pct(n.mu, n.total)),
    um('Idade média', n.idadeMedia == null ? '—' : `${n.idadeMedia.toFixed(1).replace('.', ',')} anos`,
      n.semNascimento ? `${n.semNascimento} sem data de nascimento` : ''),
    um('Tempo de casa', n.casaMedia == null ? '—' : `${n.casaMedia.toFixed(1).replace('.', ',')} anos`,
      n.semAdmissao ? `${n.semAdmissao} sem admissão` : ''),
  ].join('');

  $('rhGraficoSexo').innerHTML = roscaSexo(n);

  const tabela = (titulo, linhas, total) => `
    <div class="qp-bloco">
      <h3>${esc(titulo)}</h3>
      <table class="dc-planilha g-tab">
        <thead><tr>
          <th>${esc(titulo)}</th><th class="ce">Pessoas</th><th class="ce">%</th><th></th>
        </tr></thead>
        <tbody>${linhas.map(([k, v]) => `<tr>
          <td>${esc(k)}</td><td class="ce">${v}</td><td class="ce">${pct(v, total)}</td>
          <td class="g-cel">${barra(v, total)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;

  const g = n.gente;
  $('rhQuadroTabelas').innerHTML = blocosDe(g).map(([titulo, linhas]) =>
    tabela(titulo, linhas, n.total)).join('');

  desenharMarcacaoSexo();
}

/** Painel para marcar o sexo de quem ainda não tem — sem ele não sai o %. */
function desenharMarcacaoSexo() {
  const faltam = estado.funcionarios
    .filter(f => f.situacao === 'ATIVO' && !f.sexo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  $('rhCartaoSexo').hidden = !faltam.length;
  if (!faltam.length) return;

  $('rhFaltamSexo').textContent =
    `${faltam.length} pessoa(s) ativa(s) ainda sem sexo informado. Enquanto faltar gente aqui, o percentual sai só sobre quem já está marcado.`;

  $('rhListaSexo').innerHTML = faltam.map(f => `
    <div class="item" style="grid-template-columns:1fr auto">
      <span><span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}</span></span>
      <span class="acoes">
        <button class="btn mini" data-sexo="M" data-id="${f.id}">Homem</button>
        <button class="btn mini" data-sexo="F" data-id="${f.id}">Mulher</button>
      </span>
    </div>`).join('');
}

/** Documento do quadro de pessoal. */
function documentoQuadro() {
  const n = numeros();
  const g = n.gente;
  const bloco = (titulo, linhas) => `
    <table class="rel-tabela g-tab">
      <colgroup><col><col style="width:16mm"><col style="width:16mm"><col style="width:42mm"></colgroup>
      <thead><tr><th>${esc(titulo)}</th><th class="rel-num">Pessoas</th><th class="rel-num">%</th><th></th></tr></thead>
      <tbody>${linhas.map(([k, v]) => `<tr><td>${esc(k)}</td>
        <td class="rel-num">${v}</td><td class="rel-num">${pct(v, n.total)}</td>
        <td class="g-cel">${barra(v, n.total)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="rel-num">${n.total}</td><td class="rel-num">100,0%</td><td></td></tr></tfoot>
    </table>`;

  const corpo = `
    <div class="rel-ficha">
      <div><span>Pessoas</span><b>${n.total}</b></div>
      <div><span>Homens</span><b>${n.h} · ${pct(n.h, n.total)}</b></div>
      <div><span>Mulheres</span><b>${n.mu} · ${pct(n.mu, n.total)}</b></div>
      <div><span>Idade média</span><b>${n.idadeMedia == null ? '—' : n.idadeMedia.toFixed(1).replace('.', ',') + ' anos'}</b></div>
      <div><span>Tempo de casa</span><b>${n.casaMedia == null ? '—' : n.casaMedia.toFixed(1).replace('.', ',') + ' anos'}</b></div>
      <div><span>Situação</span><b>${esc($('qpSituacao').value || 'todas')}</b></div>
      <div><span>Recorte</span><b>${esc(recorte())}</b></div>
    </div>
    <h2 class="rel-secao">Homens e mulheres</h2>
    ${roscaSexo(n)}
    ${blocosDe(g).map(([titulo, linhas]) => bloco(titulo, linhas)).join('')}`;

  return documento({
    titulo: 'QUADRO DE PESSOAL',
    subtitulo: 'SAKUMA Agronegócios · composição do time',
    canto: recorte(),
    corpo,
    assinatura: so(R.modelo?.assinatura),
  });
}

function csvQuadro() {
  const n = numeros();
  const linhas = [['Bloco', 'Item', 'Pessoas', 'Percentual']];
  const juntar = (titulo, dados) => dados.forEach(([k, v]) =>
    linhas.push([titulo, k, v, pct(v, n.total)]));
  linhas.push(['Recorte', recorte(), n.total, '100,0%']);
  juntar('Sexo', [['Homens', n.h], ['Mulheres', n.mu], ['Não informado', n.semSexo]]);
  blocosDe(n.gente).forEach(([titulo, dados]) => juntar(titulo, dados));
  return linhas;
}

/* ==================================================================
   ligações
   ================================================================== */
export function ligarRh(avisar = () => {}, redesenharFuncionarios = () => {}) {
  /* --- cargos --- */
  $('rhBuscaCargo').addEventListener('input', desenharCargos);
  $('bNovoCargo').addEventListener('click', () => abrirCargo(null));
  $('bImprimirCargos').addEventListener('click', () => verPrevia(documentoCargos()));

  $('formCargo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const nome = so($('cgNome').value);
    if (!nome) return;
    const item = {
      ...editandoCargo,
      nome,
      nivel: so($('cgNivel').value) || null,
      observacao: so($('cgObs').value) || null,
      ativo: $('cgAtivo').value === '1',
    };
    FAIXAS.forEach(([campo], i) => { item[campo] = numeroOuNulo($(`cgF${i}`).value); });

    const { data, error } = await estado.cliente.from('rh_cargos').upsert(item).select().single();
    if (error) {
      $('erroCargo').textContent = /duplicate|unique/i.test(error.message)
        ? 'Já existe um cargo com esse nome.' : error.message;
      $('erroCargo').hidden = false;
      return;
    }
    const i = R.cargos.findIndex(c => c.id === data.id);
    if (i >= 0) R.cargos[i] = data; else R.cargos.push(data);
    R.cargos.sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'));
    $('ppCargo').dataset.pronto = '';
    $('dlgCargo').close();
    desenharCargos();
    avisar('Cargo salvo.');
  });

  $('bApagarCargo').addEventListener('click', async () => {
    if (!editandoCargo?.id) return;
    const usado = R.propostas.some(p => p.cargo_id === editandoCargo.id);
    if (usado) {
      $('erroCargo').textContent = 'Esse cargo já saiu em proposta. Desmarque "cargo ativo" em vez de apagar, para o histórico não sumir.';
      $('erroCargo').hidden = false;
      return;
    }
    if (!confirm(`Apagar o cargo "${editandoCargo.nome}"?`)) return;
    const { error } = await estado.cliente.from('rh_cargos').delete().eq('id', editandoCargo.id);
    if (error) { $('erroCargo').textContent = error.message; $('erroCargo').hidden = false; return; }
    R.cargos = R.cargos.filter(c => c.id !== editandoCargo.id);
    $('ppCargo').dataset.pronto = '';
    $('dlgCargo').close();
    desenharCargos();
  });

  /* --- proposta --- */
  $('ppTipo').addEventListener('change', trocarTipo);
  $('ppMorador').addEventListener('change', montarBeneficios);
  $('ppPessoa').addEventListener('change', escolherPessoa);
  $('ppCargo').addEventListener('change', escolherCargo);
  $('ppFaixa').addEventListener('change', aplicarFaixa);

  $('bPreviaProposta').addEventListener('click', () => {
    const p = dadosDaProposta();
    if (!p.nome) return avisar('Falta o nome da pessoa.');
    if (!p.cargo_id) return avisar('Escolha o cargo.');
    verPrevia(documentoProposta(p));
  });

  $('bSalvarProposta').addEventListener('click', async ev => {
    const p = dadosDaProposta();
    if (!p.nome || !p.cargo_id) return avisar('Preencha o nome e o cargo antes de salvar.');
    const botao = ev.currentTarget;
    botao.disabled = true;
    try {
      const { data, error } = await estado.cliente.from('rh_propostas')
        .insert({ ...p, emitida_por: estado.sessao?.user?.email || null }).select().single();
      if (error) throw error;
      R.propostas.unshift(data);
      desenharUltimas();
      verPrevia(documentoProposta(data));
      avisar('Proposta salva. A prévia está aí embaixo, pronta para imprimir.');
    } catch (e) {
      avisar(`Não deu para salvar: ${e.message || e}`);
    } finally { botao.disabled = false; }
  });

  /* --- textos fixos da proposta --- */
  $('bTextosProposta').addEventListener('click', () => {
    const m = R.modelo || {};
    $('rmTitulo').value = m.titulo || '';
    $('rmAbertura').value = m.abertura || '';
    $('rmFechamento').value = m.fechamento || '';
    $('rmAssinatura').value = m.assinatura || '';
    $('rmRegras').value = m.regras || '';
    $('rmBeneficios').value = m.beneficios || '';
    $('rmBeneficiosMorador').value = m.beneficios_morador || '';
    $('rmObservacoes').value = m.observacoes || '';
    $('rmJornada').value = m.jornada || '';
    $('rmLocal').value = m.local_trabalho || '';
    $('rmExperiencia').value = m.experiencia || '';
    $('dlgRhModelo').showModal();
  });

  $('formRhModelo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const novo = {
      id: 1,
      titulo: so($('rmTitulo').value),
      abertura: so($('rmAbertura').value),
      fechamento: so($('rmFechamento').value),
      assinatura: so($('rmAssinatura').value),
      regras: $('rmRegras').value,
      jornada: so($('rmJornada').value) || null,
      local_trabalho: so($('rmLocal').value) || null,
      experiencia: so($('rmExperiencia').value) || null,
      beneficios: $('rmBeneficios').value,
      beneficios_morador: $('rmBeneficiosMorador').value,
      observacoes: $('rmObservacoes').value,
    };
    const { data, error } = await estado.cliente.from('rh_modelo').upsert(novo).select().single();
    if (error) return avisar(`Não deu para salvar: ${error.message}`);
    R.modelo = data;
    $('dlgRhModelo').close();
    montarBeneficios();
    avisar('Textos da proposta salvos.');
  });

  /* --- quadro de pessoal --- */
  $('qpSituacao').addEventListener('change', desenharQuadro);
  $('qpEmpregador').addEventListener('change', desenharQuadro);
  $('qpFazenda').addEventListener('change', desenharQuadro);
  $('bPreviaQuadro').addEventListener('click', () => verPrevia(documentoQuadro()));
  $('bCsvQuadro').addEventListener('click', () =>
    baixarCsv(`quadro-de-pessoal-${recorte().replace(/\W+/g, '-').toLowerCase()}-${hoje()}.csv`, csvQuadro()));

  $('rhListaSexo').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-sexo]');
    if (!b) return;
    b.disabled = true;
    const f = estado.funcionarios.find(x => x.id === b.dataset.id);
    if (!f) return;
    const { error } = await estado.cliente.from('funcionarios')
      .update({ sexo: b.dataset.sexo }).eq('id', f.id);
    if (error) { b.disabled = false; return avisar(`Não deu para gravar: ${error.message}`); }
    f.sexo = b.dataset.sexo;
    desenharQuadro();
    redesenharFuncionarios();
  });

  /* --- imprimir a prévia --- */
  document.querySelectorAll('[data-imprimir-rh]').forEach(b =>
    b.addEventListener('click', imprimirPrevia));
}
