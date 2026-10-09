/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — GRUPOS DA FROTA (09/10/2026)

   Vaso de pressão não é trator. Em vez de submódulos (seis grupos × cinco
   telas), uma faixa fixa logo abaixo do menu: um toque no grupo e ele vale
   para todas as telas — Painel, Vencimentos, OS, Check list e Máquinas.
   O app lembra o último grupo escolhido neste aparelho.

   O grupo mora no TIPO da máquina (tipos_equipamento.grupo). Tipo novo sem
   grupo cai em "Outros" até alguém escolher.
   ===================================================================== */

const GRUPOS = [
  { id: 'agricolas',   nome: 'Máquinas agrícolas', ic: 'bens' },
  { id: 'veiculos',    nome: 'Veículos',           ic: 'veiculo' },
  { id: 'implementos', nome: 'Implementos',        ic: 'implemento' },
  { id: 'vasos',       nome: 'Vasos de pressão',   ic: 'vaso' },
  { id: 'diesel',      nome: 'Bombas de diesel',   ic: 'diesel' },
  { id: 'irrigacao',   nome: 'Irrigação',          ic: 'agua' },
  { id: 'outros',      nome: 'Outros',             ic: 'outros' },
];
const ICONE_GRUPO = {
  bens: '<rect x="3" y="11" width="18" height="6" rx="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M6 11l2-5h8l2 5"/>',
  veiculo: '<path d="M3 13l2-6h14l2 6v5H3z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/><path d="M3 13h18"/>',
  implemento: '<path d="M3 17h18M6 17V9h12v8M9 9V6h6v3"/><path d="M7 20l1-3M12 20v-3M17 20l-1-3"/>',
  vaso: '<rect x="7" y="4" width="10" height="16" rx="5"/><path d="M12 4V2M10 9h4"/><circle cx="12" cy="13" r="2"/>',
  diesel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M4 21h12M7 8h6"/><path d="M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  agua: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  outros: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  todos: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};

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
    GRUPOS.filter(g => conta[g.id] || g.id === 'diesel' || grupoAtual === g.id)
      .map(g => botao(g.id, g.nome, g.ic, conta[g.id] || 0)).join('');
  nav.hidden = false;
  nav.querySelectorAll('[data-grupo]').forEach(b => b.onclick = () => escolherGrupo(b.dataset.grupo));
}

function escolherGrupo(id) {
  grupoAtual = id;
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

Object.assign(window, { GRUPOS, grupoDe, noGrupo, noGrupoId, nomeGrupo, pintarGrupos, escolherGrupo });
