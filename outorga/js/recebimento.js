// recebimento.js — Recebimento das fichas do mês (12/11/2026, pedido do
// Guilherme: "marcar se recebemos o formulário do mês").
//   otRec  — o mês: cada item do recolhimento com a caixinha "Recebido",
//            quem marcou e quando, observação e a ficha para reimprimir;
//            relatório do que falta (A4 e texto para o WhatsApp — é o
//            "Enviar o relatório do que falta para Sebastião" do checklist).
//   otHist — item × mês do ano (verde = recebido, amarelo = faltou).
// O mês é o DA FICHA: no começo de novembro se recolhe a ficha de outubro.
// O Rastro tem a tarefa mensal "Recolhimento" (Vinícius, Semana 1) com o
// checklist montado de out_itens: marcar lá marca aqui, e o contrário.
import { $, esc, pronto, carregando, aviso, itens, nomeLocal, recDe, recebido, marcarRecebido, gravarObs,
  mesAtual, mesMais, NomeMes, mesCurto, dataBR } from './dados.js';
import { fichaDoItem, imprimirPaginas } from './fichas.js';

const TIPOS = [['outorga', 'Outorga'], ['irrigacao', 'Irrigação']];
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
let mesSel = mesMais(mesAtual(), -1);

const contar = (m, lista) => lista.filter(i => recebido(m, i.id)).length;
const faltam = m => itens().filter(i => !recebido(m, i.id));

/* ---------------- tela inicial: resumo do mês anterior ---------------- */
export function resumoInicio(el) {
  if (!el) return;
  if (!pronto() || carregando()) { el.innerHTML = '<p class="in-dica">Abrindo…</p>'; return; }
  const m = mesMais(mesAtual(), -1), l = itens(), ok = contar(m, l);
  el.innerHTML = `<div class="cb-kpis" style="width:min(520px,100%);margin:22px auto 0;text-align:left">
      <div><span>Fichas de ${esc(MESES_PT[Number(m.slice(5, 7)) - 1])}</span><b>${ok}/${l.length}</b><small>${l.length - ok ? (l.length - ok) + ' para receber' : 'tudo recebido'}</small></div>
      <div class="cb-kpi-custo"><span>Imprimir</span><b style="font-size:15px;margin-top:6px"><button class="btn mini" type="button" id="iniFichas">Fichas de ${esc(MESES_PT[Number(mesAtual().slice(5, 7)) - 1])}</button></b><small>outorga e irrigação</small></div>
    </div>`;
  el.querySelector('#iniFichas').onclick = () => window.abrirTelaOutorga('otFichasOut');
  el.querySelector('.cb-kpis > div').style.cursor = 'pointer';
  el.querySelector('.cb-kpis > div').onclick = () => window.abrirTelaOutorga('otRec');
}

/* ---------------- o mês ---------------- */
export function abrirRecebimento() {
  const alvo = $('otRecCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = itens(), ok = contar(mesSel, lista);
  const porTipo = t => lista.filter(i => i.tipo === t);
  alvo.innerHTML = `
    <div class="cb-mes-topo">
      <div class="cb-mes-nav">
        <button class="btn" type="button" id="orAnt" aria-label="Mês anterior">‹</button>
        <label class="campo" style="margin:0">Fichas de <input type="month" id="orMes" value="${esc(mesSel)}"></label>
        <button class="btn" type="button" id="orSeg" aria-label="Mês seguinte">›</button>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="orZap">Texto do que falta (WhatsApp)</button>
        <button class="btn" type="button" id="orRel">Relatório do que falta</button>
      </div>
    </div>
    <div class="cb-kpis">
      <div><span>Recebidas</span><b>${ok}/${lista.length}</b><small>${lista.length - ok ? (lista.length - ok) + ' para receber' : 'tudo recebido'}</small></div>
      ${TIPOS.map(([t, n]) => { const l = porTipo(t); return `<div${t === 'irrigacao' ? ' class="cb-kpi-custo"' : ''}><span>${n}</span><b>${contar(mesSel, l)}/${l.length}</b><small>${esc(NomeMes(mesSel))}</small></div>`; }).join('')}
    </div>
    <p class="dc-sem" style="margin:0 0 8px">O mês é o <b>da ficha</b> (no começo de novembro se recolhem as fichas de outubro). Marque <b>Recebido</b> quando a ficha preenchida chegar ao escritório — a tarefa "Recolhimento" do Rastro marca junto.</p>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab ot-tab">
      <thead><tr><th>Ficha</th><th>Fazenda</th><th class="ce">Recebido</th><th>Quem / quando</th><th>Observação</th><th class="ce">Ficha</th></tr></thead>
      <tbody>${TIPOS.map(([t, n]) => {
        const l = porTipo(t);
        if (!l.length) return '';
        return `<tr class="ot-grupo"><td colspan="6"><b>${n}</b> <small class="dc-sem">${contar(mesSel, l)}/${l.length}</small>
            <button class="btn mini" type="button" data-todos="${t}" style="margin-left:8px">marcar todos</button></td></tr>` +
          l.map(i => {
            const r = recDe(mesSel, i.id), sim = !!r?.recebido, temFicha = i.tipo === 'irrigacao' ? !!i.local_id : !!i.controle_id;
            return `<tr class="${sim ? 'ot-ok' : ''}">
              <td><b>${esc(i.nome)}</b>${i.produtor ? ` <small class="dc-sem">· ${esc(i.produtor)}</small>` : ''}</td>
              <td>${esc(nomeLocal(i.local_id))}</td>
              <td class="ce"><input type="checkbox" data-rec="${esc(i.id)}"${sim ? ' checked' : ''} aria-label="${esc(i.nome)} recebido"></td>
              <td class="dc-sem">${sim ? esc(r.recebido_por || '') + (r.recebido_em ? ' · ' + dataBR(r.recebido_em) : '') : '<span class="ot-tag falta">falta</span>'}</td>
              <td><input class="ot-obs" type="text" maxlength="200" data-obs="${esc(i.id)}" value="${esc(r?.obs || '')}" placeholder="—" aria-label="Observação de ${esc(i.nome)}"></td>
              <td class="ce">${temFicha ? `<button class="btn mini" type="button" data-ficha="${esc(i.id)}" title="Reimprimir a ficha deste mês">Imprimir</button>` : `<span class="ot-tag semficha" title="Ligue o ponto de controle em Cadastros › Itens do recolhimento">sem ficha</span>`}</td>
            </tr>`;
          }).join('');
      }).join('') || '<tr><td colspan="6" class="vazio">Nenhum item cadastrado. Cadastre em Cadastros › Itens do recolhimento.</td></tr>'}</tbody>
      <tfoot><tr class="am-total"><td colspan="2"><b>Total</b></td><td class="ce"><b>${ok}/${lista.length}</b></td><td colspan="3"></td></tr></tfoot>
    </table></div>`;

  const ir = m => { mesSel = m; $('otFolha').innerHTML = ''; abrirRecebimento(); };
  $('orAnt').onclick = () => ir(mesMais(mesSel, -1));
  $('orSeg').onclick = () => ir(mesMais(mesSel, 1));
  $('orMes').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(e.target.value); };
  alvo.querySelectorAll('[data-rec]').forEach(cx => cx.onchange = async () => {
    await marcarRecebido(mesSel, cx.dataset.rec, cx.checked);
    abrirRecebimento();
  });
  alvo.querySelectorAll('[data-obs]').forEach(inp => inp.onchange = async () => {
    await gravarObs(mesSel, inp.dataset.obs, inp.value.trim());
  });
  alvo.querySelectorAll('[data-todos]').forEach(b => b.onclick = async () => {
    const f = lista.filter(i => i.tipo === b.dataset.todos && !recebido(mesSel, i.id));
    if (!f.length) { aviso('Já está tudo recebido.'); return; }
    if (!confirm(`Marcar ${f.length} ficha${f.length === 1 ? '' : 's'} como recebida${f.length === 1 ? '' : 's'} em ${NomeMes(mesSel).toLowerCase()}?`)) return;
    for (const i of f) await marcarRecebido(mesSel, i.id, true);
    abrirRecebimento();
  });
  alvo.querySelectorAll('[data-ficha]').forEach(b => b.onclick = () => {
    const i = lista.find(x => x.id === b.dataset.ficha);
    const h = i && fichaDoItem(i, mesSel);
    if (!h) { aviso('Este item não tem ficha ligada.', true); return; }
    imprimirPaginas(h);
  });
  $('orRel').onclick = () => { imprimirPaginas(relatorioFalta(mesSel)); };
  $('orZap').onclick = () => textoFalta(mesSel);
}

/* ---------------- o que falta: relatório A4 e texto ---------------- */
function relatorioFalta(m) {
  const lista = itens(), f = lista.filter(i => !recebido(m, i.id));
  const linhas = lista.map(i => { const r = recDe(m, i.id), sim = !!r?.recebido;
    return `<tr><td>${esc(i.tipo === 'irrigacao' ? 'Irrigação' : 'Outorga')}</td><td>${esc(i.nome)}</td><td>${esc(nomeLocal(i.local_id))}</td>
      <td class="ce ${sim ? 'ok' : 'falta'}">${sim ? 'Recebida' : 'Falta'}</td><td>${sim ? esc(dataBR(r.recebido_em)) : ''}</td><td>${esc(r?.obs || '')}</td></tr>`; }).join('');
  return `<div class="rel">
    <div class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit"><h1>Recolhimento das fichas de outorga e irrigação</h1>
      <p>Fichas de ${esc(NomeMes(m).toLowerCase())} · ${lista.length - f.length} de ${lista.length} recebidas · ${f.length ? f.length + ' faltando' : 'nenhuma faltando'} · posição em ${new Date().toLocaleDateString('pt-BR')}</p></div></div>
    <table class="rel-tab"><thead><tr><th>Tipo</th><th>Ficha</th><th>Fazenda</th><th class="ce">Situação</th><th>Recebida em</th><th>Observação</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr class="rel-total"><td colspan="3">Total</td><td class="ce">${lista.length - f.length}/${lista.length}</td><td colspan="2"></td></tr></tfoot></table>
    <div class="rel-pe"><small>SAKUMA Agronegócios · página 1</small><img src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}

async function textoFalta(m) {
  const f = faltam(m);
  const txt = f.length
    ? `*Fichas de outorga e irrigação — ${NomeMes(m)}*\nAinda faltam ${f.length}:\n` + f.map(i => `• ${i.nome}`).join('\n')
    : `*Fichas de outorga e irrigação — ${NomeMes(m)}*\nTodas as fichas foram recebidas. ✅`;
  try { await navigator.clipboard.writeText(txt); aviso('Texto copiado. Abrindo o WhatsApp…'); } catch { /* segue */ }
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
}

/* ---------------- histórico ---------------- */
let anoHist = Number(mesAtual().slice(0, 4));
export function abrirHistorico() {
  const alvo = $('otHistCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ms = Array.from({ length: 12 }, (_, k) => anoHist + '-' + String(k + 1).padStart(2, '0'));
  const limite = mesMais(mesAtual(), -1);
  const lista = itens();
  alvo.innerHTML = `
    <div class="cb-mes-nav" style="margin-bottom:10px">
      <button class="btn" type="button" id="ohAnt" aria-label="Ano anterior">‹</button>
      <b style="font-size:16px;padding:0 6px">${anoHist}</b>
      <button class="btn" type="button" id="ohSeg" aria-label="Ano seguinte">›</button>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab ot-hist">
      <thead><tr><th>Ficha</th>${ms.map(m => `<th class="ce">${esc(mesCurto(m).slice(0, 3))}</th>`).join('')}</tr></thead>
      <tbody>${lista.map(i => `<tr><td><b>${esc(i.nome)}</b></td>${ms.map(m => {
        const sim = recebido(m, i.id);
        if (sim) return `<td class="ce s" title="Recebida em ${esc(dataBR(recDe(m, i.id).recebido_em))}">✓</td>`;
        return m <= limite ? '<td class="ce n" title="Não recebida">·</td>' : '<td class="ce f"></td>';
      }).join('')}</tr>`).join('') || '<tr><td colspan="13" class="vazio">Nenhum item cadastrado.</td></tr>'}</tbody>
      <tfoot><tr class="am-total"><td><b>Recebidas</b></td>${ms.map(m => `<td class="ce"><b>${m <= limite || contar(m, lista) ? contar(m, lista) + '/' + lista.length : ''}</b></td>`).join('')}</tr></tfoot>
    </table></div>
    <p class="dc-sem" style="margin:8px 0 0">✓ verde = recebida · amarelo = não recebida (meses já vencidos).</p>`;
  $('ohAnt').onclick = () => { anoHist--; abrirHistorico(); };
  $('ohSeg').onclick = () => { anoHist++; abrirHistorico(); };
}
