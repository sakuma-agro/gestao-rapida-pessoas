// alerta-emprestimo.js — empréstimo acima do teto esperando o administrador (09/11/2026)
//
// Pedido dele: o Lincoln lançou um empréstimo acima do teto, o app mostrou
// "Enviar para liberação do administrador" e nada chegou ao Guilherme — o
// aviso só existia dentro do DP (Painel e Recibos emitidos). Agora, para quem
// é administrador, a tela inicial (escolha das áreas) mostra um alerta com
// cada empréstimo aguardando e o botão que abre Recibos emitidos, onde se
// libera ou recusa. Some sozinho quando não há mais nada aguardando.
// O Cronograma geral também ganhou o item (origem 'dp-emp').
import { estado } from './store.js';
import { acesso } from './acesso.js';
import { svgIcone } from './icones.js';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numeroTxt = e => e.numero ? 'EF-' + String(e.numero).padStart(4, '0') : 'EF-····';
const dataBR = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '';

let ultimo = [];   // última lista lida, para desenhar na hora sem rede

/** Empréstimos aguardando liberação. Lê do banco; sem rede, usa o DP em cache. */
export async function emprestimosAguardando() {
  const c = estado.cliente;
  if (c && navigator.onLine !== false) {
    const { data, error } = await c.from('jor_emprestimos')
      .select('id,numero,valor,parcelas,funcionario_id,data,criado_por,situacao')
      .eq('situacao', 'aguardando').order('data');
    if (!error) return (ultimo = data || []);
  }
  try {
    const jd = await import('./jornada-dados.js');
    return (ultimo = (jd.dados.emprestimos || []).filter(e => e.situacao === 'aguardando'));
  } catch { return ultimo; }
}

const nomeFunc = id => (estado.funcionarios || []).find(f => f.id === id)?.nome || 'funcionário';
const quem = email => String(email || '').toLowerCase() || '—';

export async function desenharAlertaEmprestimo(alvo, { abrir } = {}) {
  if (!alvo) return;
  if (!acesso.admin) { alvo.hidden = true; alvo.innerHTML = ''; return; }
  const pintar = lista => {
    if (!lista.length) { alvo.hidden = true; alvo.innerHTML = ''; return; }
    alvo.hidden = false;
    alvo.innerHTML = `
      <div class="reu-alerta" role="alert">
        <span class="reu-alerta-ic">${svgIcone('alerta')}</span>
        <div class="reu-alerta-txt">
          <b>Empréstimo aguardando sua liberação</b>
          ${lista.map(e => `<span>${esc(numeroTxt(e))} · ${esc(nomeFunc(e.funcionario_id))} · ${brl(e.valor)} em ${e.parcelas || 1}× — lançado por ${esc(quem(e.criado_por))} em ${dataBR(e.data)}</span>`).join('')}
        </div>
        <button type="button" class="btn mini reu-alerta-ok" data-emp-ir>${svgIcone('check')} Liberar ou recusar</button>
      </div>`;
    alvo.querySelector('[data-emp-ir]')?.addEventListener('click', () => abrir && abrir());
  };
  pintar(ultimo);
  try { pintar(await emprestimosAguardando()); } catch { /* fica o que já estava */ }
}
