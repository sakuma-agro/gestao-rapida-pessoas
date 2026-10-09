/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — GRUPOS DA FROTA (09/10/2026)

   Vaso de pressão não é trator. Em vez de submódulos (seis grupos × cinco
   telas), uma faixa fixa logo abaixo do menu: um toque no grupo e ele vale
   para todas as telas — Painel, Vencimentos, OS, Check list e Máquinas.
   O app lembra o último grupo escolhido neste aparelho.

   O grupo mora no TIPO da máquina (tipos_equipamento.grupo). Tipo novo sem
   grupo cai em "Outros" até alguém escolher.
   ===================================================================== */

/* Grupos de fábrica. A lista de verdade mora em parametros.grupos_frota (JSON),
   para quem usa poder criar, renomear, trocar o ícone e a ordem dos grupos em
   Máquinas → "Tipos de máquina e grupos". "Outros" sempre existe: é para onde
   vai o tipo sem grupo ou de um grupo apagado. */
const GRUPOS_PADRAO = [
  { id: 'agricolas',   nome: 'Máquinas agrícolas', ic: 'bens' },
  { id: 'veiculos',    nome: 'Veículos',           ic: 'veiculo' },
  { id: 'implementos', nome: 'Implementos',        ic: 'implemento' },
  { id: 'vasos',       nome: 'Vasos de pressão',   ic: 'vaso' },
  { id: 'diesel',      nome: 'Bombas de diesel',   ic: 'diesel' },
  { id: 'irrigacao',   nome: 'Irrigação',          ic: 'agua' },
  { id: 'outros',      nome: 'Outros',             ic: 'outros' },
];
let GRUPOS = GRUPOS_PADRAO.slice();

/** Relê os grupos gravados (ou os de fábrica) e garante o "Outros" no fim. */
function lerGrupos() {
  let lista = null;
  try { lista = JSON.parse(parametro('grupos_frota', 'null')); } catch (e) {}
  if (!Array.isArray(lista) || !lista.length) lista = GRUPOS_PADRAO.slice();
  lista = lista.filter(g => g && g.id && g.nome);
  if (!lista.some(g => g.id === 'outros')) lista.push({ id: 'outros', nome: 'Outros', ic: 'outros' });
  GRUPOS = lista.map(g => ({ id: String(g.id), nome: String(g.nome), ic: ICONE_GRUPO[g.ic] ? g.ic : 'outros' }));
  if (grupoAtual && !GRUPOS.some(g => g.id === grupoAtual)) grupoAtual = '';
  return GRUPOS;
}

/** Grava a lista de grupos (todos que usam a área passam a ver). */
async function gravarGrupos(lista) {
  await gravar('parametros', { chave: 'grupos_frota', valor: JSON.stringify(lista.map(g => ({ id: g.id, nome: g.nome, ic: g.ic }))) });
  lerGrupos();
  pintarGrupos();
}

const ICONE_GRUPO = {
  bens: '<rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M6 11l2-5h8l2 5"/>',
  veiculo: '<path d="M3 13l2-6h14l2 6v5H3z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/><path d="M3 13h18"/>',
  implemento: '<path d="M3 17h18M6 17V9h12v8M9 9V6h6v3"/><path d="M7 20l1-3M12 20v-3M17 20l-1-3"/>',
  vaso: '<rect x="7" y="4" width="10" height="16" rx="5"/><path d="M12 4V2M10 9h4"/><circle cx="12" cy="13" r="2"/>',
  diesel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M4 21h12M7 8h6"/><path d="M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  agua: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  outros: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  gerador: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M12 9l-2 4h4l-2 4"/><path d="M6 18v2M18 18v2"/>',
  ferramenta: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  predio: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  caixa: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  todos: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};

const ICONES_ESCOLHA = [['bens','Trator'],['veiculo','Veículo'],['implemento','Implemento'],['vaso','Vaso / cilindro'],['diesel','Bomba de combustível'],['agua','Água'],['gerador','Gerador / elétrico'],['ferramenta','Ferramenta'],['predio','Prédio / instalação'],['caixa','Caixa / estoque'],['outros','Outros']];

let grupoAtual = (() => { try { return localStorage.getItem('gr.manut.grupo') || ''; } catch (e) { return ''; } })();
let telaAtualGrupo = null;

/** Grupo de uma máquina (pelo tipo dela). */
function grupoDe(e) {
  const t = e ? q.por_id('tipos_equipamento', e.tipo_equipamento_id) : null;
  const g = t && t.grupo;
  return GRUPOS.some(x => x.id === g) ? g : 'outros';
}
/** A máquina está no grupo escolhido? (sem grupo escolhido, todas estão) */
function noGrupo(e) { return !grupoAtual || (e && grupoDe(e) === grupoAtual); }
function noGrupoId(idEquip) { return !grupoAtual || noGrupo(q.por_id('equipamentos', idEquip)); }
const nomeGrupo = id => (GRUPOS.find(g => g.id === id) || {}).nome || '';

function pintarGrupos() {
  lerGrupos();
  const nav = document.getElementById('grupos');
  if (!nav) return;
  const conta = {};
  q.ativos('equipamentos').filter(e => !['VENDIDO', 'BAIXADO'].includes(e.status))
    .forEach(e => { const g = grupoDe(e); conta[g] = (conta[g] || 0) + 1; });
  const total = Object.values(conta).reduce((a, b) => a + b, 0);
  const botao = (id, nome, ic, n) => `<button type="button" class="gr-btn${grupoAtual === id ? ' ativo' : ''}" data-grupo="${id}" aria-pressed="${grupoAtual === id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_GRUPO[ic]}</svg>
      <span>${esc(nome)}</span><small>${n}</small></button>`;
  nav.innerHTML = '<span class="gr-rot">Frota</span>' + botao('', 'Todos', 'todos', total) +
    GRUPOS.filter(g => conta[g.id] || g.id !== 'outros' || grupoAtual === g.id)
      .map(g => botao(g.id, g.nome, g.ic, conta[g.id] || 0)).join('');
  nav.hidden = false;
  nav.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => escolherGrupo(b.dataset.grupo));
}

/** Seletor "Grupo" para as linhas de filtro (Vencimentos, Máquinas):
 *  é a mesma escolha da faixa Frota, só que dentro dos filtros. */
function seletorGrupo(idEl) {
  lerGrupos();
  return `<select id="${idEl}" aria-label="Grupo da frota"><option value="">Todos os grupos</option>${
    GRUPOS.map(g => `<option value="${g.id}"${grupoAtual === g.id ? ' selected' : ''}>${esc(g.nome)}</option>`).join('')}</select>`;
}
function ligarSeletorGrupo(idEl) {
  const s = document.getElementById(idEl);
  if (s) s.onchange = () => escolherGrupo(s.value);
}

function escolherGrupo(id) {
  grupoAtual = id;
  // filtros que dependem do grupo (letra, tipo) voltam para "todos"
  if (typeof letraVenc !== 'undefined') letraVenc = '';
  if (typeof filtroMaq !== 'undefined' && filtroMaq) filtroMaq.tipo = '';
  try { localStorage.setItem('gr.manut.grupo', id); } catch (e) {}
  if (typeof marcadosVenc !== 'undefined') marcadosVenc.clear();
  pintarGrupos();
  if (telaAtualGrupo && TELAS[telaAtualGrupo]) irPara(telaAtualGrupo);
}

/* Lembra a tela aberta, para a troca de grupo redesenhar a mesma tela.
   Na tela de entrada (marca) a faixa some — ali não há lista para filtrar. */
const irParaOriginalGrupo = window.irPara;
window.irPara = nome => {
  telaAtualGrupo = nome;
  const nav = document.getElementById('grupos');
  if (nav) { if (nome === 'marca' || nome === 'config') nav.hidden = true; else pintarGrupos(); }
  return irParaOriginalGrupo(nome);
};
const marcaOriginalGrupo = TELAS.marca;
TELAS.marca = el => {
  telaAtualGrupo = null;
  const nav = document.getElementById('grupos'); if (nav) nav.hidden = true;
  return marcaOriginalGrupo(el);
};

Object.assign(window, { lerGrupos, gravarGrupos, ICONES_ESCOLHA, grupoDe, noGrupo, noGrupoId, nomeGrupo, pintarGrupos, escolherGrupo, seletorGrupo, ligarSeletorGrupo });
