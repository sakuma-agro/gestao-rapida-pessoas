// historico.js — Rateio mensal culturas › Histórico (20/10/2026).
// Duas leituras: a lista dos meses (como o índice de abas da planilha) e a
// linha do tempo dos plantios — em quais meses cada um entrou no rateio e
// quantos meses já são, com o aviso de ciclo (pedido dele, 20/10/2026).
import { $, esc, pronto, carregando, todos, meses, nomeMes, mesCurto, calcularMes, num, pct, reais,
  talhoes, talhao, cultura, mesesDaCultura, nomeCurto, semAcento, souAdmin, mes, CADEADO } from './dados.js';
import { etiquetaMeses } from './talhoes.js';
import { irParaMes } from './rateio.js';

let ouvindo = false;
let janela = 12;      // quantos meses na linha do tempo
let busca = '';
let soAtivos = true;

function desenhar() {
  const alvo = $('cbHistCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = meses();
  if (!lista.length) { alvo.innerHTML = '<div class="vazio">Nenhum mês de rateio ainda. Crie o primeiro em "Rateio do mês".</div>'; return; }

  const resumo = lista.slice().reverse().map(m => ({ m, c: calcularMes(m.id) }));
  const ultimos = lista.slice(-janela).map(m => m.id);
  const itens = todos('cb_itens');
  const plantios = talhoes()
    .filter(t => itens.some(i => i.talhao_id === t.id && i.incluido !== false && ultimos.includes(i.mes)) || (!soAtivos && itens.some(i => i.talhao_id === t.id)))
    .filter(t => !busca || semAcento(t.nome + ' ' + (t.cod_agro || '')).includes(semAcento(busca)))
    .sort((a, b) => String(cultura(a.cultura_id)?.nome || '').localeCompare(String(cultura(b.cultura_id)?.nome || ''), 'pt-BR')
      || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));

  alvo.innerHTML = `
    <h3 class="cb-secao">Meses</h3>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Mês</th><th>Situação</th><th class="dir">Plantios</th><th class="dir">Área (ha)</th><th class="dir">Soma dos pesos</th><th class="dir">Custo ADM</th><th>Maior %</th><th></th></tr></thead>
      <tbody>${resumo.map(({ m, c }) => {
        const maior = c.linhas.filter(l => l.incluido !== false).sort((a, b) => b.pct - a.pct)[0];
        return `<tr>
          <td><b>${esc(nomeMes(m.id))}</b></td>
          <td>${m.status === 'fechado' ? `<span class="cb-cadeado">${CADEADO} Fechado</span>` : '<span class="tag alerta">aberto</span>'}</td>
          <td class="dir">${c.incluidos}</td><td class="dir">${esc(num(c.area))}</td><td class="dir">${esc(num(c.total, 0))}</td>
          <td class="dir">${c.custo !== null ? esc(reais(c.custo)) : '—'}</td>
          <td>${maior ? esc(maior.talhao.nome) + ' · <b>' + esc(pct(maior.pct, 1)) + '</b>' : '—'}</td>
          <td class="dir"><button class="btn mini" type="button" data-abrir="${esc(m.id)}">Abrir</button></td>
        </tr>`; }).join('')}
      </tbody></table></div>

    <h3 class="cb-secao">Linha do tempo dos plantios <small>em quais meses cada plantio entrou no rateio</small></h3>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar <input type="text" id="cbHistBusca" placeholder="nome ou código" value="${esc(busca)}"></label>
      <label class="campo">Meses na tela <select id="cbHistJanela">${[6, 12, 18, 24].map(n => `<option value="${n}"${n === janela ? ' selected' : ''}>últimos ${n}</option>`).join('')}</select></label>
      <label class="cb-check"><input type="checkbox" id="cbHistAtivos"${soAtivos ? ' checked' : ''}> só quem entrou nesses meses</label>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab cb-linha-tempo">
      <thead><tr><th>Cód.</th><th>Plantio / talhão</th><th>Cultura</th>${ultimos.map(m => `<th class="ce">${esc(mesCurto(m))}</th>`).join('')}<th>Meses no rateio</th></tr></thead>
      <tbody>${plantios.map(t => {
        const c = cultura(t.cultura_id);
        const lim = mesesDaCultura(c);
        const seus = itens.filter(i => i.talhao_id === t.id);
        const total = seus.filter(i => i.incluido !== false).length;
        let n = seus.filter(i => i.incluido !== false && i.mes < ultimos[0]).length;   // meses antes da janela
        const cels = ultimos.map(m => {
          const it = seus.find(i => i.mes === m);
          if (!it) return '<td class="ce cb-ct-vazio"></td>';
          if (it.incluido === false) return '<td class="ce cb-ct-fora" title="no mês, fora do rateio">○</td>';
          n++;
          const sit = !lim ? '' : n > lim ? ' cb-ct-passou' : n === lim ? ' cb-ct-ultimo' : '';
          return `<td class="ce cb-ct-sim${sit}" title="${esc(nomeMes(m))} · ${n}º mês · ${esc(pct(calcularPct(it, m), 1))}">${n}</td>`;
        }).join('');
        return `<tr${t.ativo === false ? ' class="cb-inativa"' : ''}><td>${esc(t.cod_agro || '')}</td><td><b>${esc(t.nome)}</b>${t.ativo === false ? ' <span class="tag inativo">encerrado</span>' : ''}</td><td>${esc(c ? c.nome : '—')}</td>${cels}<td>${etiquetaMeses(total, lim)}</td></tr>`;
      }).join('') || `<tr><td colspan="${ultimos.length + 4}" class="vazio">Nenhum plantio nesse período.</td></tr>`}
      </tbody></table></div>
    <p class="dc-sem" style="margin-top:8px">Número na célula = o mês de participação (1º, 2º…). Amarelo = completou o ciclo da cultura (último mês); vermelho = passou do ciclo. ○ = estava no mês, mas fora do rateio.</p>`;

  alvo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { irParaMes(b.dataset.abrir); window.abrirTelaCustoBase('rtMes'); }));
  $('cbHistBusca').addEventListener('input', e => { busca = e.target.value; const p = e.target.selectionStart; desenhar(); const el = $('cbHistBusca'); el.focus(); el.setSelectionRange(p, p); });
  $('cbHistJanela').addEventListener('change', e => { janela = Number(e.target.value); desenhar(); });
  $('cbHistAtivos').addEventListener('change', e => { soAtivos = e.target.checked; desenhar(); });
}

const cachePct = {};
function calcularPct(it, m) {
  if (!cachePct[m]) cachePct[m] = calcularMes(m);
  const l = cachePct[m].linhas.find(x => x.id === it.id);
  return l ? l.pct : 0;
}

export function abrirHistorico() {
  for (const k of Object.keys(cachePct)) delete cachePct[k];
  if (!ouvindo) { window.addEventListener('custobase-dados', () => { if (!$('telaRtHistorico').hidden) { for (const k of Object.keys(cachePct)) delete cachePct[k]; desenhar(); } }); ouvindo = true; }
  desenhar();
}
