// irrigacao.js — Custo Base › Controle de irrigação (09/11/2026, pedido do Guilherme).
// Substitui a planilha "Custo Irrigação" seguindo o modelo dela:
//   · um acerto por fazenda e mês (cada aba da planilha), id 'AAAA-MM:<fazenda>'
//   · Conta 1 / Conta 2 (fatura CEMIG) → FATURA TOTAL
//   · lançamentos: Data Ligou, Hr. Ligou, Hr. Desligou, Horas Ligado, %, Valor R$,
//     PLANTIO, Produtor (Sakuma / G8)
//   · Acerto Irrigação: Valor à pagar, Horas e % de cada produtor
//   · Envio do acerto: Para, Anexo, Assunto, Mensagem
//   · Resumo por plantio com "Lançado Agro"
// A CONTA é a da planilha:
//   Horas ligado = Hr. Desligou − Hr. Ligou (passou da meia-noite: + 24 h)
//   %            = horas da linha ÷ horas de todas as linhas com produtor
//   Valor R$     = % × fatura total
//   produtor     = horas do produtor ÷ soma das horas dos produtores × fatura
// Telas: irMes (acerto do mês), irHistorico, irFazendas (parâmetros).
// Tabelas cb_irr_acertos e cb_irr_fazendas (supabase/custobase-irrigacao.sql).
import { $, esc, pronto, carregando, todos, gravar, aviso, num, reais, pct, nomeMes, mesCurto, mesAtual, mesAnterior, mesSeguinte, meuNome, FAZENDAS, nomeCurto } from './dados.js';
import { montarPdf, enviarWhatsapp, botaoZap } from './pdf.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MSG_PADRAO = 'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.';
const mesExtenso = m => MESES[Number(String(m).slice(5, 7)) - 1] + ' ' + String(m).slice(0, 4);

/* ================= a conta (igual à planilha) ================= */
const minutos = t => {
  const r = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return r ? Number(r[1]) * 60 + Number(r[2]) : null;
};
/** Horas ligado em fração de dia, como a coluna E da planilha (vazio = null). */
export function fracDia(l) {
  const c = minutos(l.liga), d = minutos(l.desliga);
  if (c === null || d === null) return null;
  return (d < c ? d - c + 1440 : d - c) / 1440;
}
const hhmm = frac => {
  if (frac === null || frac === undefined) return '';
  const m = Math.round(frac * 1440);
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
};
const temProd = l => String(l.produtor || '').trim() !== '';

/* Vários plantios numa linha (pivô "pizza", 09/11/2026, pedido dele): cada
   combinação é uma linha própria no Resumo por plantio, com as horas e o %
   dela. Para a mesma combinação cair sempre na mesma linha, o texto é
   padronizado: maiúsculas, "pl 1" → "PL1", separados por vírgula e em
   ordem ("pl3 , pl2" → "PL2, PL3"). */
export function padronizarPlantio(txt) {
  let t = String(txt || '');
  // só números de PL separados por espaço ("pl1 pl2 pl3") também vale como lista
  if (/^\s*(pl\s*\d+\s*)+$/i.test(t)) t = t.match(/pl\s*\d+/gi).join(',');
  const partes = t.split(/\s*[,;+]\s*/)
    .map(p => p.trim().replace(/\s+/g, ' ').toUpperCase().replace(/\bPL\s+(\d)/g, 'PL$1'))
    .filter(Boolean);
  if (partes.length < 2) return partes[0] || '';
  return [...new Set(partes)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).join(', ');
}

/** Calcula o acerto inteiro: linhas, totais por produtor e resumo por plantio. */
export function calcular(ac, produtores) {
  const fatura = (ac.contas || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const linhas = (ac.linhas || []).map(l => ({ ...l, frac: fracDia(l) }));
  const base = linhas.reduce((s, l) => s + (temProd(l) && l.frac !== null ? l.frac : 0), 0);
  for (const l of linhas) {
    l.pct = l.frac === null ? null : (base > 0 ? l.frac / base : null);
    l.valor = l.pct === null ? null : l.pct * fatura;
  }
  const prods = (produtores && produtores.length ? produtores : ['Sakuma', 'G8']).slice();
  for (const l of linhas) if (temProd(l) && !prods.includes(l.produtor)) prods.push(l.produtor);
  const porProd = prods.map(p => ({ produtor: p, horas: linhas.filter(l => l.produtor === p).reduce((s, l) => s + (l.frac || 0), 0) * 24 }));
  const hTot = porProd.reduce((s, p) => s + p.horas, 0);
  for (const p of porProd) { p.pct = hTot === 0 ? 0 : p.horas / hTot; p.valor = fatura * p.pct; }
  const nomes = [...new Set(linhas.map(l => padronizarPlantio(l.plantio)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const resumo = nomes.map(n => {
    const ls = linhas.filter(l => padronizarPlantio(l.plantio) === n);
    const quem = prods.filter(p => ls.some(l => l.produtor === p));
    const horas = ls.reduce((s, l) => s + (l.frac || 0), 0) * 24;
    return { plantio: n, produtor: quem.join('/'), horas, pct: base === 0 ? null : horas / 24 / base,
      valor: ls.reduce((s, l) => s + (l.valor || 0), 0), lancado: !!(ac.lancado_agro || {})[n] };
  });
  return { fatura, linhas, base, porProd, hTot, resumo,
    horasRes: resumo.reduce((s, r) => s + r.horas, 0), valorRes: resumo.reduce((s, r) => s + r.valor, 0) };
}

/* ================= dados ================= */
const idAcerto = (m, f) => m + ':' + f;
const acertoDe = (m, f) => todos('cb_irr_acertos').find(a => a.id === idAcerto(m, f)) || null;
const novoAcerto = (m, f) => ({ id: idAcerto(m, f), mes: m, fazenda: f,
  contas: [{ nome: 'Conta 1', valor: null }, { nome: 'Conta 2', valor: null }], linhas: [], lancado_agro: {} });
const paramDe = f => todos('cb_irr_fazendas').find(x => x.id === f) || { id: f, produtores: ['Sakuma', 'G8'], email: '', anexo: 'Faturas CEMIG em PDF', mensagem: MSG_PADRAO, ativo: true };
const produtoresDe = f => { const p = paramDe(f).produtores; return Array.isArray(p) && p.length ? p : ['Sakuma', 'G8']; };
const fazendas = () => {
  const cad = todos('cb_irr_fazendas').filter(x => x.ativo !== false).map(x => x.id);
  return [...new Set(FAZENDAS.filter(f => !todos('cb_irr_fazendas').some(x => x.id === f && x.ativo === false)).concat(cad))];
};
const novoIdLinha = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let fazSel = null, mesSel = null, ouvindo = false;
let rascunho = null;      // acerto em edição (só vai para o banco quando tem algo)

function escolherPadrao() {
  if (!fazSel) {
    const ult = todos('cb_irr_acertos').slice().sort((a, b) => String(b.mes).localeCompare(String(a.mes)))[0];
    fazSel = ult ? ult.fazenda : 'Fazenda Faca';
  }
  if (!mesSel) {
    const daFaz = todos('cb_irr_acertos').filter(a => a.fazenda === fazSel).map(a => a.mes).sort();
    mesSel = daFaz.length ? daFaz[daFaz.length - 1] : mesAnterior(mesAtual());
  }
}
function atual() {
  const salvo = acertoDe(mesSel, fazSel);
  if (salvo) { rascunho = null; return salvo; }
  if (!rascunho || rascunho.id !== idAcerto(mesSel, fazSel)) rascunho = novoAcerto(mesSel, fazSel);
  return rascunho;
}
async function salvar(ac) {
  const reg = { ...ac, atualizado_por: meuNome() || null };
  await gravar('cb_irr_acertos', reg);
  rascunho = null;
  return reg;
}

/* ================= tela do acerto ================= */
function desenharMes() {
  const alvo = $('irMesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  escolherPadrao();
  const ac = atual(), prm = paramDe(fazSel), prods = produtoresDe(fazSel);
  const r = calcular(ac, prods);
  const plantiosUsados = [...new Set(todos('cb_irr_acertos').filter(a => a.fazenda === fazSel).flatMap(a => (a.linhas || []).map(l => l.plantio)).filter(Boolean))].sort();
  const assunto = `Acerto Irrigação - ${fazSel} - ${mesExtenso(mesSel)}`;
  alvo.innerHTML = `
    <div class="cb-mes-topo naoimprimir">
      <div class="cb-mes-nav">
        <label class="campo" style="margin:0">Fazenda <select id="irFaz">${fazendas().map(f => `<option${f === fazSel ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <button class="btn" type="button" id="irAnt" aria-label="Mês anterior">‹</button>
        <label class="campo" style="margin:0">Mês <input type="month" id="irMesInp" value="${esc(mesSel)}"></label>
        <button class="btn" type="button" id="irSeg" aria-label="Mês seguinte">›</button>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="irPdf">Imprimir / PDF</button>
        ${botaoZap('irZap')}
        <button class="btn" type="button" id="irXls">Excel</button>
      </div>
    </div>

    <div class="ir-titulo"><span>🌱 CONTROLE DE IRRIGAÇÃO — ${esc(fazSel.toUpperCase())}</span><b>${esc(mesExtenso(mesSel).toUpperCase())}</b></div>

    <div class="ir-contas">
      ${(ac.contas || []).map((c, k) => `<label class="ir-conta"><input class="ir-conta-nome" data-cnome="${k}" value="${esc(c.nome || 'Conta ' + (k + 1))}" aria-label="Nome da conta"> ▶
        <input class="ir-conta-valor" data-cvalor="${k}" type="text" inputmode="decimal" value="${c.valor === null || c.valor === undefined ? '' : esc(num(c.valor))}" placeholder="0,00" aria-label="Valor da ${esc(c.nome || 'conta')}">
        ${(ac.contas || []).length > 1 ? `<button type="button" class="ir-x" data-cdel="${k}" title="Tirar esta conta" aria-label="Tirar conta">×</button>` : ''}</label>`).join('')}
      <button class="btn mini" type="button" id="irMaisConta">+ conta</button>
      <span class="dc-sem">← digitar o valor de cada conta da fatura</span>
    </div>

    <div class="cb-kpis ir-kpis" id="irKpis">${kpisHtml(r)}</div>

    <div class="ir-grade">
      <div class="ir-esq">
        <div class="cb-rolagem"><table class="dc-planilha cb-tab ir-tab">
          <thead><tr><th>Data Ligou</th><th>Hr. Ligou</th><th>Hr. Desligou</th><th class="ce">Horas Ligado</th><th class="dir">%</th><th class="dir">Valor R$</th><th>Plantio</th><th>Produtor</th><th class="naoimprimir"></th></tr></thead>
          <tbody>${r.linhas.map(l => `
            <tr data-lin="${esc(l.id)}">
              <td><input type="date" data-c="data" value="${esc(l.data || '')}"${l.data && String(l.data).slice(0, 7) !== mesSel ? ' class="ir-fora" title="Data fora do mês do acerto"' : ''}></td>
              <td><input type="time" data-c="liga" value="${esc(l.liga || '')}"></td>
              <td><input type="time" data-c="desliga" value="${esc(l.desliga || '')}"></td>
              <td class="ce" data-o="horas">${esc(hhmm(l.frac))}</td>
              <td class="dir" data-o="pct">${l.pct === null ? '' : esc(pct(l.pct))}</td>
              <td class="dir" data-o="valor">${l.valor === null ? '' : esc(num(l.valor))}</td>
              <td><input type="text" data-c="plantio" list="irPlantios" value="${esc(l.plantio || '')}" placeholder="ex.: PL1, PL2, PL3" title="Vários plantios no mesmo pivô: separe por vírgula"></td>
              <td><select data-c="produtor"><option value=""></option>${prods.concat(temProd(l) && !prods.includes(l.produtor) ? [l.produtor] : []).map(p => `<option${p === l.produtor ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></td>
              <td class="naoimprimir"><button type="button" class="ir-x" data-del="${esc(l.id)}" title="Apagar esta linha" aria-label="Apagar linha">×</button></td>
            </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum lançamento neste mês. Toque em “+ Linha”.</td></tr>'}
          </tbody>
          <tfoot><tr class="am-total"><td colspan="3"><b>Total</b> <small class="dc-sem">${r.linhas.length} linha(s)</small></td><td class="ce" id="irTotH"><b>${esc(hhmm(r.linhas.reduce((s, l) => s + (l.frac || 0), 0)))}</b></td><td></td><td class="dir" id="irTotV"><b>${esc(num(r.linhas.reduce((s, l) => s + (l.valor || 0), 0)))}</b></td><td colspan="3"></td></tr></tfoot>
        </table></div>
        <datalist id="irPlantios">${plantiosUsados.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
        <div class="barra naoimprimir" style="margin-top:8px">
          <button class="btn principal" type="button" id="irMaisLinha">+ Linha</button>
          <button class="btn" type="button" id="irOrdenar">Ordenar por data</button>
          <span class="dc-sem">Passou da meia-noite? Desligou menor que ligou soma 24 h, como na planilha.</span>
        </div>
      </div>

      <div class="ir-dir">
        <div class="ir-caixa" id="irAcerto">${acertoHtml(r)}</div>
        <div class="ir-caixa ir-envio">
          <div class="ir-cx-tit">📧 ENVIO DO ACERTO</div>
          <label class="ir-env"><span>Para:</span><input type="email" id="irPara" value="${esc(prm.email || '')}" placeholder="e-mail de quem paga"></label>
          <div class="ir-env"><span>Anexo:</span><b>📎 ${esc(prm.anexo || 'Faturas CEMIG em PDF')}</b></div>
          <div class="ir-env"><span>Assunto:</span><b id="irAssunto">${esc(assunto)}</b></div>
          <div class="ir-env ir-env-msg"><span>Mensagem:</span><div>${esc(prm.mensagem || MSG_PADRAO).replace(/\n/g, '<br>')}</div></div>
          <div class="barra" style="margin:8px 0 0">
            <button class="btn principal" type="button" id="irEmail">Abrir e-mail</button>
            <button class="btn" type="button" id="irCopiar">Copiar texto</button>
            <label class="cb-check"><input type="checkbox" id="irEnviado"${ac.enviado_em ? ' checked' : ''}> enviado${ac.enviado_em ? ` <small class="dc-sem">${esc(ac.enviado_por || '')} · ${esc(new Date(ac.enviado_em).toLocaleDateString('pt-BR'))}</small>` : ''}</label>
          </div>
        </div>
      </div>
    </div>

    <div class="ir-resumo" id="irResumo">${resumoHtml(r)}</div>`;

  ligarMes(alvo, ac, assunto);
}

function kpisHtml(r) {
  const p = r.porProd;
  return `
    <div class="cb-kpi-custo"><span>Fatura total (R$)</span><b>${esc(reais(r.fatura))}</b><small>soma das contas</small></div>
    ${p.slice(0, 3).map(x => `<div><span>${esc(x.produtor)} (R$)</span><b>${esc(reais(x.valor))}</b><small>${esc(num(x.horas))} h</small></div>`).join('')}
    <div><span>Valor fatura (R$)</span><b>${esc(reais(r.fatura))}</b><small>${esc(num(r.hTot))} h no total</small></div>
    ${p.slice(0, 3).map(x => `<div><span>${esc(x.produtor)} (%)</span><b>${esc(pct(x.pct))}</b><small>das horas</small></div>`).join('')}`;
}
function acertoHtml(r) {
  return `
    <div class="ir-cx-tit">Acerto Irrigação - ${esc(mesExtenso(mesSel))} &nbsp; ${esc(fazSel)}</div>
    <table class="dc-planilha cb-tab ir-ac">
      <tr><td><b>Valor Fatura</b></td><td class="dir" colspan="3"><b>${esc(reais(r.fatura))}</b></td></tr>
      <tr class="ir-ac-cab"><th>Produtor</th><th class="dir">Valor à Pagar</th><th class="dir">Horas Irrigação</th><th class="dir">%</th></tr>
      ${r.porProd.map(p => `<tr><td>${esc(p.produtor)}</td><td class="dir">${esc(reais(p.valor))}</td><td class="dir">${esc(num(p.horas))}</td><td class="dir">${esc(pct(p.pct))}</td></tr>`).join('')}
      <tr class="ir-ac-tot"><td><b>Total</b></td><td class="dir"><b>${esc(reais(r.porProd.reduce((s, p) => s + p.valor, 0)))}</b></td><td class="dir"><b>${esc(num(r.hTot))}</b></td><td class="dir"><b>${esc(pct(r.porProd.reduce((s, p) => s + p.pct, 0)))}</b></td></tr>
    </table>`;
}
function resumoHtml(r) {
  const ok = r.resumo.filter(x => x.lancado).length;
  return `
    <div class="barra entre" style="margin:14px 0 6px"><h3 style="margin:0">Resumo por plantio</h3><span class="dc-sem">Lançado Agro: <b>${ok}/${r.resumo.length}</b></span></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab ir-res">
      <thead><tr><th>Resumo por plantio</th><th>Produtor</th><th class="dir">Horas (h)</th><th class="dir">% do Total</th><th class="dir">Valor R$</th><th class="ce">Lançado Agro</th></tr></thead>
      <tbody>${r.resumo.map(x => `<tr class="${x.lancado ? 'am-ok' : 'am-pend'}">
        <td><b>${esc(x.plantio)}</b></td><td>${esc(x.produtor)}</td><td class="dir">${esc(num(x.horas))}</td>
        <td class="dir">${x.pct === null ? '' : esc(pct(x.pct))}</td><td class="dir">${esc(num(x.valor))}</td>
        <td class="ce"><input type="checkbox" data-agro="${esc(x.plantio)}"${x.lancado ? ' checked' : ''} aria-label="${esc(x.plantio)} lançado no Agro"></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">O resumo aparece quando houver lançamentos com plantio.</td></tr>'}
      </tbody>
      <tfoot><tr class="am-total"><td colspan="2"><b>TOTAL GERAL</b></td><td class="dir"><b>${esc(num(r.horasRes))}</b></td><td class="dir"><b>${r.base ? esc(pct(r.horasRes / 24 / r.base)) : ''}</b></td><td class="dir"><b>${esc(num(r.valorRes))}</b></td><td class="ce"><b>${ok}/${r.resumo.length}</b></td></tr></tfoot>
    </table></div>`;
}

/* Recalcula sem redesenhar os campos (não perde o cursor ao passar de um campo a outro). */
function recalcular(ac) {
  const r = calcular(ac, produtoresDe(fazSel));
  for (const l of r.linhas) {
    const tr = document.querySelector(`#irMesCorpo tr[data-lin="${CSS.escape(l.id)}"]`);
    if (!tr) continue;
    tr.querySelector('[data-o="horas"]').textContent = hhmm(l.frac);
    tr.querySelector('[data-o="pct"]').textContent = l.pct === null ? '' : pct(l.pct);
    tr.querySelector('[data-o="valor"]').textContent = l.valor === null ? '' : num(l.valor);
    const d = tr.querySelector('[data-c="data"]');
    d.classList.toggle('ir-fora', !!l.data && String(l.data).slice(0, 7) !== mesSel);
  }
  const h = $('irTotH'), v = $('irTotV');
  if (h) h.innerHTML = '<b>' + esc(hhmm(r.linhas.reduce((s, l) => s + (l.frac || 0), 0))) + '</b>';
  if (v) v.innerHTML = '<b>' + esc(num(r.linhas.reduce((s, l) => s + (l.valor || 0), 0))) + '</b>';
  $('irKpis').innerHTML = kpisHtml(r);
  $('irAcerto').innerHTML = acertoHtml(r);
  $('irResumo').innerHTML = resumoHtml(r);
  ligarResumo(ac);
}

function ligarResumo(ac) {
  document.querySelectorAll('#irResumo [data-agro]').forEach(cx => cx.addEventListener('change', async () => {
    const a = { ...ac, lancado_agro: { ...(ac.lancado_agro || {}), [cx.dataset.agro]: cx.checked } };
    if (!cx.checked) delete a.lancado_agro[cx.dataset.agro];
    await salvar(a);
    desenharMes();
  }));
}

function ligarMes(alvo, ac, assunto) {
  const ir = (m, f) => { if (m) mesSel = m; if (f) fazSel = f; rascunho = null; desenharMes(); };
  $('irFaz').onchange = e => { const f = e.target.value; const ms = todos('cb_irr_acertos').filter(a => a.fazenda === f).map(a => a.mes); fazSel = f; ir(ms.includes(mesSel) ? mesSel : mesSel, f); };
  $('irAnt').onclick = () => ir(mesAnterior(mesSel));
  $('irSeg').onclick = () => ir(mesSeguinte(mesSel));
  $('irMesInp').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(e.target.value); };

  // contas
  alvo.querySelectorAll('[data-cvalor]').forEach(inp => inp.addEventListener('change', async () => {
    const t = String(inp.value).trim().replace(/\s|R\$/g, '');
    const v = t === '' ? null : Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    if (v !== null && !isFinite(v)) { aviso('Valor da conta: use só números (ex.: 11.762,17).', true); inp.focus(); return; }
    const contas = ac.contas.map((c, k) => k === Number(inp.dataset.cvalor) ? { ...c, valor: v } : c);
    ac = await salvar({ ...ac, contas });
    inp.value = v === null ? '' : num(v);
    recalcular(ac);
  }));
  alvo.querySelectorAll('[data-cnome]').forEach(inp => inp.addEventListener('change', async () => {
    const contas = ac.contas.map((c, k) => k === Number(inp.dataset.cnome) ? { ...c, nome: inp.value.trim() || 'Conta ' + (k + 1) } : c);
    ac = await salvar({ ...ac, contas });
  }));
  alvo.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
    const k = Number(b.dataset.cdel), c = ac.contas[k];
    if (c.valor && !confirm(`Tirar ${c.nome} (${reais(c.valor)}) do acerto?`)) return;
    await salvar({ ...ac, contas: ac.contas.filter((_, i) => i !== k) });
    desenharMes();
  });
  $('irMaisConta').onclick = async () => {
    await salvar({ ...ac, contas: (ac.contas || []).concat([{ nome: 'Conta ' + ((ac.contas || []).length + 1), valor: null }]) });
    desenharMes();
  };

  // linhas
  alvo.querySelectorAll('tr[data-lin] [data-c]').forEach(inp => inp.addEventListener('change', async () => {
    const id = inp.closest('tr').dataset.lin, campo = inp.dataset.c;
    const val = campo === 'plantio' ? padronizarPlantio(inp.value) : inp.value;
    if (campo === 'plantio') inp.value = val;
    ac = await salvar({ ...ac, linhas: ac.linhas.map(l => l.id === id ? { ...l, [campo]: val } : l) });
    recalcular(ac);
  }));
  alvo.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const l = ac.linhas.find(x => x.id === b.dataset.del);
    if ((l.liga || l.plantio) && !confirm(`Apagar a linha de ${l.data ? l.data.split('-').reverse().join('/') : 'sem data'}${l.plantio ? ' — ' + l.plantio : ''}?`)) return;
    await salvar({ ...ac, linhas: ac.linhas.filter(x => x.id !== b.dataset.del) });
    desenharMes();
  });
  $('irMaisLinha').onclick = async () => {
    const ult = ac.linhas[ac.linhas.length - 1];
    const prods = produtoresDe(fazSel);
    const nova = { id: novoIdLinha(), data: ult?.data || mesSel + '-01', liga: '', desliga: '', plantio: '', produtor: ult?.produtor || prods[0] || '' };
    await salvar({ ...ac, linhas: ac.linhas.concat([nova]) });
    desenharMes();
    const tr = document.querySelector(`#irMesCorpo tr[data-lin="${CSS.escape(nova.id)}"]`);
    if (tr) { tr.scrollIntoView({ block: 'center' }); tr.querySelector('[data-c="liga"]').focus(); }
  };
  $('irOrdenar').onclick = async () => {
    const linhas = ac.linhas.slice().sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')) || String(a.liga || '').localeCompare(String(b.liga || '')));
    await salvar({ ...ac, linhas });
    desenharMes();
  };
  ligarResumo(ac);

  // envio
  $('irPara').onchange = async e => {
    await gravar('cb_irr_fazendas', { ...paramDe(fazSel), email: e.target.value.trim() || null });
    aviso('E-mail da ' + fazSel + ' guardado para os próximos acertos.');
  };
  const textoMsg = () => paramDe(fazSel).mensagem || MSG_PADRAO;
  $('irEmail').onclick = () => {
    const para = $('irPara').value.trim();
    location.href = 'mailto:' + encodeURIComponent(para) + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(textoMsg());
    aviso('Anexe as faturas CEMIG em PDF antes de enviar.');
  };
  $('irCopiar').onclick = async () => {
    const t = `Para: ${$('irPara').value.trim()}\nAssunto: ${assunto}\n\n${textoMsg()}`;
    try { await navigator.clipboard.writeText(t); aviso('Texto copiado.'); } catch (e) { aviso('Não consegui copiar. Selecione o texto na tela.', true); }
  };
  $('irEnviado').onchange = async e => {
    await salvar({ ...ac, enviado_em: e.target.checked ? new Date().toISOString() : null, enviado_por: e.target.checked ? (meuNome() || null) : null });
    desenharMes();
  };

  // relatórios
  $('irPdf').onclick = async () => {
    try { const doc = await montarPdf(relatorio(ac)); window.open(URL.createObjectURL(doc.output('blob')), '_blank'); }
    catch (e) { aviso('Não consegui montar o PDF: ' + (e.message || e), true); }
  };
  $('irZap').onclick = () => {
    const r = calcular(ac, produtoresDe(fazSel));
    enviarWhatsapp(relatorio(ac), `*${assunto}*\nFatura: ${reais(r.fatura)}\n` + r.porProd.map(p => `${p.produtor}: ${reais(p.valor)} (${pct(p.pct)})`).join('\n'), $('irZap'));
  };
  $('irXls').onclick = () => exportarExcel(ac);
}

/* ================= PDF ================= */
function relatorio(ac) {
  const r = calcular(ac, produtoresDe(ac.fazenda));
  const dt = d => d ? String(d).split('-').reverse().join('/') : '';
  return {
    titulo: 'Controle de irrigação — ' + ac.fazenda,
    subtitulo: 'Acerto Irrigação - ' + mesExtenso(ac.mes) + ' · ' + (ac.contas || []).map(c => `${c.nome}: ${reais(Number(c.valor) || 0)}`).join(' · '),
    arquivo: `Acerto_Irrigacao_${nomeCurto(ac.fazenda)}_${ac.mes}`,
    kpis: [['Fatura total', reais(r.fatura)], ...r.porProd.slice(0, 3).map(p => [p.produtor, reais(p.valor) + ' · ' + pct(p.pct)]), ['Horas', num(r.hTot) + ' h']],
    secoes: [
      { titulo: 'Acerto por produtor', head: ['Produtor', 'Valor à pagar', 'Horas irrigação', '%'], dir: [1, 2, 3], largura: 'meia',
        body: r.porProd.map(p => [p.produtor, reais(p.valor), num(p.horas), pct(p.pct)]),
        total: ['Total', reais(r.porProd.reduce((s, p) => s + p.valor, 0)), num(r.hTot), pct(r.porProd.reduce((s, p) => s + p.pct, 0))] },
      { titulo: 'Lançamentos', head: ['Data ligou', 'Hr. ligou', 'Hr. desligou', 'Horas ligado', '%', 'Valor R$', 'Plantio', 'Produtor'], dir: [3, 4, 5],
        body: r.linhas.map(l => [dt(l.data), l.liga || '', l.desliga || '', hhmm(l.frac), l.pct === null ? '' : pct(l.pct), l.valor === null ? '' : num(l.valor), l.plantio || '', l.produtor || '']),
        total: ['Total', '', '', hhmm(r.linhas.reduce((s, l) => s + (l.frac || 0), 0)), '', num(r.linhas.reduce((s, l) => s + (l.valor || 0), 0)), '', ''] },
      { titulo: 'Resumo por plantio', head: ['Plantio', 'Produtor', 'Horas (h)', '% do total', 'Valor R$', 'Lançado Agro'], dir: [2, 3, 4],
        body: r.resumo.map(x => [x.plantio, x.produtor, num(x.horas), x.pct === null ? '' : pct(x.pct), num(x.valor), x.lancado ? 'Sim' : 'Pendente']),
        total: ['TOTAL GERAL', '', num(r.horasRes), r.base ? pct(r.horasRes / 24 / r.base) : '', num(r.valorRes), r.resumo.filter(x => x.lancado).length + '/' + r.resumo.length] },
    ],
  };
}

/* ================= Excel no desenho da planilha ================= */
function exportarExcel(ac) {
  const X = window.XLSX;
  if (!X || !X.utils) { aviso('O gerador de Excel ainda não carregou. Tente de novo em alguns segundos.', true); return; }
  const r = calcular(ac, produtoresDe(ac.fazenda));
  const ws = {}, merges = [];
  const borda = { top: { style: 'thin', color: { rgb: 'C9D9A6' } }, bottom: { style: 'thin', color: { rgb: 'C9D9A6' } }, left: { style: 'thin', color: { rgb: 'C9D9A6' } }, right: { style: 'thin', color: { rgb: 'C9D9A6' } } };
  const f = (rgb, cor = 'FFFFFF', b = true, sz = 11, h = 'center') => ({ fill: { fgColor: { rgb } }, font: { name: 'Arial', bold: b, sz, color: { rgb: cor } }, alignment: { horizontal: h, vertical: 'center' }, border: borda });
  const S = { tit: f('80561B', 'FFFFFF', true, 18, 'left'), rot: f('80561B', 'F0E6D3', true, 10, 'right'), conta: { ...f('5C3D10', 'FFE0A0', true, 13), numFmt: '"R$" #,##0.00' },
    mes: f('80561B', 'F0E6D3', true, 16), kpi: c => ({ ...f('F5F5F5', c, true, 18), numFmt: '"R$" #,##0.00' }), kpiP: c => ({ ...f('F5F5F5', c, true, 18), numFmt: '0.00%' }), kpiR: c => f('F5F5F5', c, true, 9),
    cab: f('84BD50', 'FFFFFF', true, 12), cel: (fmt, alt) => ({ ...f(alt ? 'F3F8E8' : 'FFFFFF', '51534A', false, 12), numFmt: fmt || 'General' }),
    marrom: f('80561B', 'FFFFFF', true, 11, 'left'), marromN: fmt => ({ ...f('80561B', 'FFFFFF', true, 11), numFmt: fmt }), clara: f('F5F0EB', '80561B', true, 10, 'left'), claraT: f('F5F0EB', '51534A', false, 11, 'left') };
  const put = (ref, v, s, fml) => { const c = { v, s, t: typeof v === 'number' ? 'n' : (typeof v === 'boolean' ? 'b' : 's') }; if (fml) c.f = fml; if (v === null || v === undefined) { c.v = ''; c.t = 's'; } ws[ref] = c; };
  const serial = iso => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const hora = t => { const m = minutos(t); return m === null ? null : m / 1440; };
  const ult = Math.max(880, 5 + r.linhas.length);
  const E = `$E$6:$E$${ult}`, I = `$I$6:$I$${ult}`, H = `$H$6:$H$${ult}`;
  const contas = ac.contas || [];
  const c1 = Number(contas[0]?.valor) || 0, c2 = contas.slice(1).reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const prodA = r.porProd[0] || { produtor: 'Sakuma', valor: 0, horas: 0, pct: 0 }, prodB = r.porProd[1] || { produtor: 'G8', valor: 0, horas: 0, pct: 0 };

  put('B1', '🌱  CONTROLE DE IRRIGAÇÃO  —  ' + ac.fazenda.toUpperCase(), S.tit); for (const c of 'CDEF') put(c + '1', '', S.tit);
  put('G1', (contas[0]?.nome || 'Conta 1') + ' ▶', S.rot); put('H1', c1, S.conta);
  put('I1', mesExtenso(ac.mes).toUpperCase(), S.mes); for (const c of 'JKLMN') put(c + '1', '', S.mes); merges.push({ s: { r: 0, c: 8 }, e: { r: 0, c: 13 } });
  put('G2', (contas.length > 2 ? 'Contas 2+' : (contas[1]?.nome || 'Conta 2')) + ' ▶', S.rot); put('H2', c2, S.conta);
  put('B3', r.fatura, S.kpi('80561B'), 'H3'); put('D3', prodA.valor, S.kpi('2E7D32'), 'IFERROR(L8,0)'); put('F3', prodB.valor, S.kpi('51534A'), 'IFERROR(L9,0)');
  put('H3', r.fatura, S.kpi('555555'), 'SUM(H1:H2)'); put('J3', prodA.pct, S.kpiP('2E7D32'), 'IFERROR(N8,0)'); put('L3', prodB.pct, S.kpiP('51534A'), 'IFERROR(N9,0)');
  put('B4', 'FATURA TOTAL (R$)', S.kpiR('80561B')); put('C4', '← digitar em H1 e H2', S.kpiR('8A8C83')); put('D4', prodA.produtor.toUpperCase() + '  (R$)', S.kpiR('2E7D32'));
  put('F4', prodB.produtor.toUpperCase() + '  (R$)', S.kpiR('51534A')); put('H4', 'VALOR FATURA (R$)', S.kpiR('555555'));
  put('J4', prodA.produtor.toUpperCase() + '  (%)', S.kpiR('2E7D32')); put('L4', prodB.produtor.toUpperCase() + '  (%)', S.kpiR('51534A'));
  ['Data Ligou', 'Hr. Ligou', 'Hr. Desligou', 'Horas Ligado', '%', 'Valor R$', 'PLANTIO', 'Produtor'].forEach((t, k) => put('BCDEFGHI'[k] + '5', t, S.cab));
  r.linhas.forEach((l, k) => {
    const n = 6 + k, alt = k % 2 === 1;
    put('B' + n, serial(l.data), S.cel('dd/mm/yy', alt)); put('C' + n, hora(l.liga), S.cel('h:mm', alt)); put('D' + n, hora(l.desliga), S.cel('h:mm', alt));
    put('E' + n, l.frac, S.cel('[h]:mm', alt), `IF(AND(C${n}="",D${n}=""),"",IF(AND(ISNUMBER(C${n}),ISNUMBER(D${n})),IF(D${n}<C${n},D${n}-C${n}+1,D${n}-C${n}),""))`);
    put('F' + n, l.pct, S.cel('0.00%', alt), `IF(E${n}="","",E${n}/SUMIF(${I},"?*",${E}))`);
    put('G' + n, l.valor, S.cel('"R$" #,##0.00', alt), `IF(F${n}="","",F${n}*$H$3)`);
    put('H' + n, l.plantio || '', S.cel('General', alt)); put('I' + n, l.produtor || '', S.cel('General', alt));
  });
  // acerto (K5:N10)
  put('K5', `Acerto Irrigação - ${mesExtenso(ac.mes)}   ${ac.fazenda}`, { font: { name: 'Arial', bold: true, sz: 18, color: { rgb: '744F28' } }, alignment: { horizontal: 'center' } }); merges.push({ s: { r: 4, c: 10 }, e: { r: 4, c: 13 } });
  put('K6', 'Valor Fatura', { font: { name: 'Arial', bold: true, sz: 11, color: { rgb: '51534A' } } }); put('L6', r.fatura, { font: { name: 'Arial', bold: true, sz: 11, color: { rgb: '51534A' } }, numFmt: '"R$" #,##0.00' }, 'H3');
  ['Produtor', 'Valor á Pagar', 'Horas Irrigação', '%'].forEach((t, k) => put('KLMN'[k] + '7', t, f('84BD50', 'FFFFFF', true, 12)));
  [prodA, prodB].forEach((p, k) => {
    const n = 8 + k, cel = fmt => ({ ...f('FFFFFF', '51534A', false, 11), numFmt: fmt });
    put('K' + n, p.produtor, { ...cel('General'), alignment: { horizontal: 'left' } }); put('L' + n, p.valor, cel('"R$" #,##0.00'), `L6*N${n}`);
    put('M' + n, p.horas, cel('0.00'), `SUMIF(${I},"${p.produtor}",${E})*24`); put('N' + n, p.pct, cel('0.00%'), `IF(M10=0,0,M${n}/M10)`);
  });
  put('K10', 'Total', S.marrom); put('L10', prodA.valor + prodB.valor, S.marromN('"R$" #,##0.00'), 'SUM(L8:L9)'); put('M10', prodA.horas + prodB.horas, S.marromN('0.00'), 'SUM(M8:M9)'); put('N10', prodA.pct + prodB.pct, S.marromN('0.00%'), 'SUM(N8:N9)');
  // envio (K12:N17)
  const prm = paramDe(ac.fazenda);
  put('K12', '📧  ENVIO DO ACERTO', S.marrom); for (const c of 'LMN') put(c + '12', '', S.marrom);
  [['Para:', prm.email || ''], ['Anexo:', '📎  ' + (prm.anexo || 'Faturas CEMIG em PDF')], ['Assunto:', `Acerto Irrigação - ${ac.fazenda} - ${mesExtenso(ac.mes)}`], ['Mensagem:', String(prm.mensagem || MSG_PADRAO).replace(/\n+/g, ' ')]].forEach(([a, b], k) => {
    const n = 13 + k; put('K' + n, a, S.clara); put('L' + n, b, S.claraT); put('M' + n, '', S.claraT); put('N' + n, '', S.claraT); merges.push({ s: { r: n - 1, c: 11 }, e: { r: n - 1, c: 13 } });
  });
  // resumo por plantio
  const r0 = Math.max(83, 8 + r.linhas.length);
  ['RESUMO POR PLANTIO', 'Produtor', 'Horas (h)', '% do Total', 'Valor R$'].forEach((t, k) => put('BCDEF'[k] + r0, t, S.cab)); put('G' + r0, 'Lançado Agro', f('80561B'));
  r.resumo.forEach((x, k) => {
    const n = r0 + 1 + k, alt = k % 2 === 1, okF = x.lancado ? 'D9E8BD' : null;
    const cel = fmt => ({ ...S.cel(fmt, alt), ...(okF ? { fill: { fgColor: { rgb: okF } } } : {}) });
    put('B' + n, x.plantio, cel('General')); put('C' + n, x.produtor, cel('General'));
    put('D' + n, x.horas, cel('0.00'), `SUMIFS(${E},${H},B${n})*24`); put('E' + n, x.pct, cel('0.00%'), `D${n}/24/SUMIF(${I},"?*",${E})`);
    put('F' + n, x.valor, cel('"R$" #,##0.00'), `SUMIFS($G$6:$G$${ult},${H},B${n})`); put('G' + n, x.lancado, cel('General'));
  });
  const rt = r0 + 1 + r.resumo.length;
  put('B' + rt, 'TOTAL GERAL', S.cab); put('C' + rt, '', S.cab); put('D' + rt, r.horasRes, { ...S.cab, numFmt: '0.00' }, `SUM(D${r0 + 1}:D${rt - 1})`);
  put('E' + rt, '', S.cab); put('F' + rt, r.valorRes, { ...S.cab, numFmt: '"R$" #,##0.00' }, `SUM(F${r0 + 1}:F${rt - 1})`);

  ws['!ref'] = 'A1:N' + rt;
  ws['!merges'] = merges;
  ws['!cols'] = [2.9, 25.7, 16.3, 22.7, 21.4, 21.7, 18.1, 41.7, 17.3, 3.9, 22.4, 16, 22.7, 9.3].map(w => ({ wch: w }));
  ws['!rows'] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 30 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, mesExtenso(ac.mes).toUpperCase().slice(0, 31));
  X.writeFile(wb, `Custo Irrigação - ${nomeCurto(ac.fazenda)} - ${mesExtenso(ac.mes)}.xlsx`);
}

/* ================= histórico ================= */
let anoHist = null;
function desenharHistorico() {
  const alvo = $('irHistCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = todos('cb_irr_acertos').slice();
  const anos = [...new Set(lista.map(a => Number(String(a.mes).slice(0, 4))).concat([Number(mesAtual().slice(0, 4))]))].sort();
  if (!anoHist) anoHist = anos[anos.length - 1];
  const doAno = lista.filter(a => String(a.mes).startsWith(anoHist + '-')).sort((a, b) => String(b.mes).localeCompare(String(a.mes)) || a.fazenda.localeCompare(b.fazenda, 'pt-BR'));
  const prods = [...new Set(doAno.flatMap(a => produtoresDe(a.fazenda)))];
  let tF = 0, tH = 0; const tP = {};
  const linhas = doAno.map(a => {
    const r = calcular(a, produtoresDe(a.fazenda));
    tF += r.fatura; tH += r.hTot;
    for (const p of r.porProd) tP[p.produtor] = (tP[p.produtor] || 0) + p.valor;
    const ok = r.resumo.filter(x => x.lancado).length;
    return `<tr class="ir-link" data-abrir="${esc(a.id)}">
      <td><b>${esc(mesCurto(a.mes))}</b></td><td>${esc(a.fazenda)}</td><td class="dir">${esc(num(r.fatura))}</td><td class="dir">${esc(num(r.hTot))}</td>
      ${prods.map(p => { const x = r.porProd.find(y => y.produtor === p); return `<td class="dir">${x ? esc(num(x.valor)) + ` <small class="dc-sem">${esc(pct(x.pct, 1))}</small>` : ''}</td>`; }).join('')}
      <td class="ce ${ok === r.resumo.length && r.resumo.length ? 'am-c-ok' : 'am-c-pend'}">${ok}/${r.resumo.length}</td>
      <td class="ce">${a.enviado_em ? '<span class="tag">enviado</span>' : '<span class="am-tag">não enviado</span>'}</td></tr>`;
  }).join('');
  alvo.innerHTML = `
    <div class="barra entre">
      <label class="campo" style="margin:0">Ano <select id="irAno">${anos.map(a => `<option${a === anoHist ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <span class="dc-sem">Toque num mês para abrir o acerto.</span>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab ir-hist">
      <thead><tr><th>Mês</th><th>Fazenda</th><th class="dir">Fatura (R$)</th><th class="dir">Horas</th>${prods.map(p => `<th class="dir">${esc(p)} (R$)</th>`).join('')}<th class="ce">Lançado Agro</th><th class="ce">Envio</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="${6 + prods.length}" class="vazio">Nenhum acerto em ${anoHist}.</td></tr>`}</tbody>
      <tfoot><tr class="am-total"><td colspan="2"><b>Total ${anoHist}</b></td><td class="dir"><b>${esc(num(tF))}</b></td><td class="dir"><b>${esc(num(tH))}</b></td>${prods.map(p => `<td class="dir"><b>${esc(num(tP[p] || 0))}</b></td>`).join('')}<td></td><td></td></tr></tfoot>
    </table></div>`;
  $('irAno').onchange = e => { anoHist = Number(e.target.value); desenharHistorico(); };
  alvo.querySelectorAll('[data-abrir]').forEach(tr => tr.onclick = () => {
    const a = lista.find(x => x.id === tr.dataset.abrir);
    fazSel = a.fazenda; mesSel = a.mes; rascunho = null;
    window.abrirTelaCustoBase && window.abrirTelaCustoBase('irMes');
  });
}

/* ================= parâmetros por fazenda ================= */
function desenharFazendas() {
  const alvo = $('irFazCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = [...new Set(FAZENDAS.concat(todos('cb_irr_fazendas').map(x => x.id)))];
  alvo.innerHTML = lista.map(f => {
    const p = paramDe(f);
    return `<form class="grade ir-param" data-faz="${esc(f)}" autocomplete="off">
      <h3 class="plena" style="margin:0">${esc(f)} ${p.ativo === false ? '<span class="tag inativo">fora do controle</span>' : ''}</h3>
      <label class="campo">Produtores (separe por vírgula) <input name="produtores" value="${esc(produtoresDe(f).join(', '))}" placeholder="Sakuma, G8"></label>
      <label class="campo">E-mail (Para) <input type="email" name="email" value="${esc(p.email || '')}" placeholder="quem recebe o acerto"></label>
      <label class="campo">Anexo <input name="anexo" value="${esc(p.anexo || 'Faturas CEMIG em PDF')}"></label>
      <label class="campo plena-2">Mensagem <textarea name="mensagem" rows="3">${esc(p.mensagem || MSG_PADRAO)}</textarea></label>
      <label class="cb-check"><input type="checkbox" name="ativo"${p.ativo !== false ? ' checked' : ''}> aparece no Controle de irrigação</label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Salvar</button></div>
    </form>`;
  }).join('');
  alvo.querySelectorAll('form[data-faz]').forEach(fm => fm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(fm), f = fm.dataset.faz;
    const produtores = String(d.get('produtores') || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (!produtores.length) { aviso('Informe pelo menos um produtor.', true); return; }
    await gravar('cb_irr_fazendas', { ...paramDe(f), produtores, email: String(d.get('email') || '').trim() || null,
      anexo: String(d.get('anexo') || '').trim() || null, mensagem: String(d.get('mensagem') || '').trim() || MSG_PADRAO, ativo: d.get('ativo') === 'on' });
    aviso('Parâmetros da ' + f + ' salvos.');
    desenharFazendas();
  }));
}

const TELAS = { irMes: desenharMes, irHistorico: desenharHistorico, irFazendas: desenharFazendas };
const telaDe = { irMes: 'telaIrMes', irHistorico: 'telaIrHistorico', irFazendas: 'telaIrFazendas' };
export function abrirIrrigacao(nome) {
  if (!ouvindo) {
    ouvindo = true;
    window.addEventListener('custobase-dados', () => {
      const foco = document.activeElement;
      if (foco && foco.closest && foco.closest('#telaIrMes, #telaIrFazendas') && foco.matches('input, select, textarea')) return;
      for (const [t, fn] of Object.entries(TELAS)) if ($(telaDe[t]) && !$(telaDe[t]).hidden) fn();
    });
  }
  (TELAS[nome] || desenharMes)();
}
