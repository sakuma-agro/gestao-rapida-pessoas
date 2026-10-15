/* =====================================================================
   Gestão Rápida · Programação Campo — peças comuns
   Datas, regra da semana, status e ajudantes de formulário.
   ===================================================================== */

const TELAS = {};
window.TELAS = TELAS;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
               'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ---------------------------------------------------------------- datas
   Tudo em texto AAAA-MM-DD, sem fuso: a data da atividade é um dia do
   calendário, não um instante. */

function hoje() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function partes(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { ano: a, mes: m, dia: d };
}
function montaData(ano, mes, dia) {
  return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
function diasNoMes(ano, mes) { return new Date(ano, mes, 0).getDate(); }
function somaDias(iso, n) {
  const p = partes(iso);
  const d = new Date(p.ano, p.mes - 1, p.dia + n);
  return montaData(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function difDias(a, b) {   // b - a, em dias
  const pa = partes(a), pb = partes(b);
  return Math.round((Date.UTC(pb.ano, pb.mes - 1, pb.dia) - Date.UTC(pa.ano, pa.mes - 1, pa.dia)) / 86400000);
}
function br(iso) {
  if (!iso) return '';
  const p = partes(iso);
  return String(p.dia).padStart(2, '0') + '/' + String(p.mes).padStart(2, '0') + '/' + p.ano;
}
function diaSemana(iso) {
  const p = partes(iso);
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(p.ano, p.mes - 1, p.dia).getDay()];
}

/* A regra do quadro da parede: a semana conta pelo dia do mês.
   1–7 = S1, 8–14 = S2, 15–21 = S3, 22 ao último dia = S4. */
function semanaDe(iso) {
  const d = partes(iso).dia;
  return Math.min(4, Math.floor((d - 1) / 7) + 1);
}
function chaveSemana(iso) {
  const p = partes(iso);
  return { ano: p.ano, mes: p.mes, semana: semanaDe(iso) };
}
function inicioSemana(ano, mes, semana) { return montaData(ano, mes, (semana - 1) * 7 + 1); }
function fimSemana(ano, mes, semana) {
  return semana === 4 ? montaData(ano, mes, diasNoMes(ano, mes)) : montaData(ano, mes, semana * 7);
}
function semanaVizinha(s, passo) {
  let { ano, mes, semana } = s;
  semana += passo;
  while (semana < 1) { semana += 4; mes -= 1; if (mes < 1) { mes = 12; ano -= 1; } }
  while (semana > 4) { semana -= 4; mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  return { ano, mes, semana };
}
function rotuloSemana(s) { return `Semana ${s.semana} de ${MESES[s.mes - 1]}/${s.ano}`; }
function mesmaSemana(iso, s) {
  const k = chaveSemana(iso);
  return k.ano === s.ano && k.mes === s.mes && k.semana === s.semana;
}

/* ---------------------------------------------------------------- status
   No banco ficam quatro. "Atrasado" é calculado: data já passou e a
   atividade continua só planejada. */

const STATUS = ['Planejado', 'Em andamento', 'Concluído', 'Cancelado'];
const STATUS_TODOS = ['Planejado', 'Em andamento', 'Atrasado', 'Concluído', 'Cancelado'];
const STATUS_CLASSE = {
  'Planejado': 'st-plan', 'Em andamento': 'st-and', 'Atrasado': 'st-atr',
  'Concluído': 'st-ok', 'Cancelado': 'st-canc'
};

function statusDe(a) {
  if (a.status === 'Planejado' && a.data < hoje()) return 'Atrasado';
  return a.status;
}
function etqStatus(a) {
  const s = typeof a === 'string' ? a : statusDe(a);
  return `<span class="etq-st ${STATUS_CLASSE[s]}">${esc(s)}</span>`;
}
const pendente = s => s === 'Planejado' || s === 'Em andamento' || s === 'Atrasado';

/* Prioridade: urgente e importante (vermelho) · importante, não urgente (amarelo) */
const PRIORIDADES = [
  { id: 'urgente', nome: 'Urgente e importante', curto: 'Urgente' },
  { id: 'importante', nome: 'Importante, não urgente', curto: 'Importante' }
];
const nomePrioridade = p => (PRIORIDADES.find(x => x.id === p) || {}).nome || '';
function etqPrioridade(a, curto = false) {
  const p = PRIORIDADES.find(x => x.id === (typeof a === 'string' ? a : a && a.prioridade));
  return p ? `<span class="etq-pri pri-${p.id}" title="${esc(p.nome)}">${esc(curto ? p.curto : p.nome)}</span>` : '';
}
const pesoPrioridade = a => a.prioridade === 'urgente' ? 0 : a.prioridade === 'importante' ? 1 : 2;

/* ---------------------------------------------------------------- atividades */

function atividadesVisiveis() {
  return q.todos('atividades').filter(a => a.ativo !== false);
}
function nomeAtividade(a) { return q.nome('tipos_atividade', a.tipo_id); }
function fazendaDoLocal(localId) {
  const l = q.por_id('locais', localId);
  return l ? l.fazenda_id : null;
}
function corCultura(id) {
  const c = q.por_id('culturas', id);
  return c ? c.cor : '#E2EFD0';
}
function locaisOrdenados(soAtivos = true) {
  const ordemFaz = {};
  q.todos('fazendas').forEach(f => { ordemFaz[f.id] = f.ordem || 0; });
  return (soAtivos ? q.ativos('locais') : q.todos('locais')).slice().sort((a, b) =>
    (ordemFaz[a.fazenda_id] - ordemFaz[b.fazenda_id]) || ((a.ordem || 0) - (b.ordem || 0)) ||
    a.nome.localeCompare(b.nome, 'pt-BR'));
}
function fazendasOrdenadas(soAtivas = true) {
  return (soAtivas ? q.ativos('fazendas') : q.todos('fazendas')).slice()
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* texto de máquina + implemento numa célula só */
function maqImpl(a) {
  return [nomeMaquina(a.maquina_id), nomeImplemento(a.implemento_id)].filter(Boolean).join(' + ');
}

/* grava uma atividade guardando quem mexeu por último */
async function gravarAtividade(a) {
  a.atualizado_em = new Date().toISOString();
  if (App.usuario && App.usuario.id) a.atualizado_por = App.usuario.id;
  if (!a.criado_em) a.criado_em = a.atualizado_em;
  if (!a.criado_por && App.usuario) a.criado_por = App.usuario.id;
  if (a.status === 'Concluído' && !a.concluida_em) a.concluida_em = hoje();
  if (a.status !== 'Concluído') a.concluida_em = null;
  return gravar('atividades', a);
}

/* ---------------------------------------------------------------- formulários */

function campoTexto(rot, nome, valor = '', tipo = 'text', ajuda = '', extra = '') {
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <input type="${tipo}" id="f-${nome}" name="${nome}" value="${esc(valor ?? '')}" ${extra}>
    ${ajuda ? `<p class="ajuda" id="aj-${nome}">${ajuda}</p>` : ''}</div>`;
}
function campoArea(rot, nome, valor = '') {
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <textarea id="f-${nome}" name="${nome}">${esc(valor ?? '')}</textarea></div>`;
}
function opcoes(lista, valor, vazio = '— selecione —') {
  return (vazio !== null ? `<option value="">${esc(vazio)}</option>` : '') + lista.map(o => {
    const id = o.id ?? o;
    const txt = o.nome ?? o;
    return `<option value="${esc(id)}"${String(id) === String(valor ?? '') ? ' selected' : ''}>${esc(txt)}</option>`;
  }).join('');
}
function campoLista(rot, nome, lista, valor, vazio = '— selecione —') {
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <select id="f-${nome}" name="${nome}">${opcoes(lista, valor, vazio)}</select></div>`;
}
/* lista de locais agrupada por fazenda */
function opcoesLocais(valor, vazio = '— selecione —', soAtivos = true) {
  let html = vazio !== null ? `<option value="">${esc(vazio)}</option>` : '';
  fazendasOrdenadas().forEach(f => {
    const ls = locaisOrdenados(soAtivos).filter(l => l.fazenda_id === f.id);
    if (!ls.length) return;
    html += `<optgroup label="${esc(f.nome)}">` + ls.map(l =>
      `<option value="${l.id}"${l.id === valor ? ' selected' : ''}>${esc(l.nome)}</option>`).join('') + '</optgroup>';
  });
  return html;
}
function lerForm(corpo) {
  const dados = {};
  corpo.querySelectorAll('input,select,textarea').forEach(el => {
    if (!el.name) return;
    if (el.type === 'checkbox' || el.type === 'radio') return;
    const v = el.value.trim();
    dados[el.name] = (v === '' ? null : v);
  });
  return dados;
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/* Máquinas e implementos (15/10/2026): os da frota vêm de Máquinas e
   Patrimônio; os genéricos (Trator, Grade…) são da Programação. A lista junta
   os dois — genéricos primeiro, que é o que mais se usa no lançamento. */
const nomeMaquina = id => id ? (q.nome('maquinas_genericas', id) || q.nome('maquinas', id)) : '';
const nomeImplemento = id => id ? (q.nome('implementos_genericos', id) || q.nome('implementos', id)) : '';
function listaMaquinas() {
  return [...q.ordenado('maquinas_genericas').map(x => ({ ...x, nome: x.nome + ' (genérico)' })),
          ...q.ordenado('maquinas').filter(x => !x.generico)];
}
function listaImplementos() {
  return [...q.ordenado('implementos_genericos').map(x => ({ ...x, nome: x.nome + ' (genérico)' })),
          ...q.ordenado('implementos').filter(x => !x.generico)];
}

Object.assign(window, {
  nomeMaquina, nomeImplemento, listaMaquinas, listaImplementos,
  MESES, MESES_CURTOS, hoje, partes, montaData, diasNoMes, somaDias, difDias, br, diaSemana,
  semanaDe, chaveSemana, inicioSemana, fimSemana, semanaVizinha, rotuloSemana, mesmaSemana,
  STATUS, STATUS_TODOS, STATUS_CLASSE, statusDe, etqStatus, pendente,
  PRIORIDADES, nomePrioridade, etqPrioridade, pesoPrioridade,
  atividadesVisiveis, nomeAtividade, fazendaDoLocal, corCultura, locaisOrdenados, fazendasOrdenadas,
  maqImpl, gravarAtividade, campoTexto, campoArea, opcoes, campoLista, opcoesLocais, lerForm, num, fmtNum
});
