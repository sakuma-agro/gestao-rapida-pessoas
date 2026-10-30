// jornada-ticket.js — DP → Ticket alimentação (14/10/2026)
//
// Pedido dele: todo mês ele montava à mão o relatório "TICKET INÍCIO - <MÊS>"
// (o pagamento precisa cair até o dia 10), separado por empregador e fazenda.
//
//   • O valor de cada pessoa fica no Cadastro Nível 2 (jor_vinculos.ticket_valor)
//     junto com uma observação fixa (ticket_obs, ex.: "Pedir Cartão").
//   • Abater uma parte vale SÓ para aquele mês (jor_ticket_mes, chave
//     funcionario_id|AAAA-MM): o mês seguinte volta ao valor do cadastro.
//   • Ao imprimir, o relatório é guardado como foi emitido (jor_ticket_emissoes,
//     chave AAAA-MM, com versão): o Histórico reabre igual, mesmo que o
//     cadastro mude depois.
//
// "Mês" aqui é o mês do PAGAMENTO (o do título do relatório). Entram as
// pessoas ATIVAS com valor de ticket no cadastro.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { podeTela } from './acesso.js';
import { SENHA_SALARIO } from './rh-salarios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => Math.round((Number(v) || 0) * 100) / 100;
const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAnterior = ym => { const a = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };
const proximoMes = ym => { const a = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
const rotMes = ym => `${MESES_L[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
const br = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();
const chave = (fid, ym) => `${fid}|${ym}`;

/* Mês do pagamento padrão: até o dia 10 ainda é o mês corrente; depois, o
   próximo (é quando ele monta a lista). */
function mesPadrao() {
  const d = new Date();
  const m = d.getDate() <= 10 ? d.getMonth() : d.getMonth() + 1;
  const x = new Date(d.getFullYear(), m, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

/* "1.035,86" / "1035,86" / "1035.86" → 1035.86 */
function lerValor(t) {
  t = String(t || '').trim().replace(/[R$\s]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? num(n) : NaN;
}

let avisar = () => {};
let irPara = () => {};
const est = { mes: null, busca: '' };

/* ---------------- dados ---------------- */

const ajusteDe = (fid, ym) => (jd.dados.ticketMes || []).find(r => r.chave === chave(fid, ym)) || null;
const emissaoDe = ym => (jd.dados.ticketEmissoes || []).find(r => r.competencia === ym) || null;

/** As linhas do mês, já com empregador, fazenda, abatimento e valor a pagar. */
function linhasDoMes(ym) {
  return jd.pessoasDp()
    .filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
    .map(f => {
      const v = jd.vinculoDe(f.id);
      if (v?.ticket_valor == null) return null;
      const u = jd.unidadeDe(v);
      const a = ajusteDe(f.id, ym);
      const valor = num(v.ticket_valor);
      const abat = Math.min(valor, num(a?.abatimento));
      return {
        fid: f.id, nome: f.nome,
        empregador: jd.empregadorDe(u)?.nome || 'Sem unidade no cadastro',
        fazenda: jd.fazendaDe(u)?.nome || '—',
        valor, abat, pagar: num(valor - abat),
        motivo: a?.motivo || '',
        obs: (a?.observacao ?? v.ticket_obs) || '',
      };
    })
    .filter(Boolean);
}

/** Agrupa por empregador → fazenda, como na planilha dele. */
function agrupar(linhas) {
  const g = new Map();
  linhas.forEach(l => {
    const k = l.empregador + '|' + l.fazenda;
    if (!g.has(k)) g.set(k, { empregador: l.empregador, fazenda: l.fazenda, linhas: [] });
    g.get(k).linhas.push(l);
  });
  return [...g.values()]
    .sort((a, b) => a.empregador.localeCompare(b.empregador, 'pt-BR') || a.fazenda.localeCompare(b.fazenda, 'pt-BR'))
    .map(x => ({ ...x, linhas: x.linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }));
}
const soma = (ls, k) => num(ls.reduce((s, l) => s + (l[k] || 0), 0));

const semTicket = () => jd.pessoasDp()
  .filter(f => (f.situacao || 'ATIVO') === 'ATIVO' && jd.vinculoDe(f.id)?.ticket_valor == null)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/* ---------------- relatório ---------------- */

const obsRel = l => [l.abat ? `Abatido ${brl(l.abat)}${l.motivo ? ' — ' + l.motivo : ''}` : '', l.obs].filter(Boolean).join(' · ');

function relatorioHTML(ym, linhas, emissao) {
  const grupos = agrupar(linhas);
  const total = soma(linhas, 'pagar');
  /* 30/10/2026: em paisagem e com o mês de referência no título — o ticket
     pago no início do mês ym é o do mês anterior. */
  const ref = mesAnterior(ym);
  const nomeMes = m => MESES_L[+m.slice(5, 7) - 1].replace(/^./, c => c.toUpperCase());
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Ticket referente a ${esc(nomeMes(ref))} (pagamento início de ${esc(nomeMes(ym))})</h1>
        <p>Pagamento do ticket precisa cair até o dia 10</p></div>
      <div class="rel-comp">${emissao ? `${emissao.fechado ? 'fechado em' : 'emitido em'}<strong>${br(emissao.emitido_em)}</strong>${emissao.versao > 1 ? 'versão ' + emissao.versao : ''}`
        : `posição em<strong>${br(agora())}</strong>`}</div>
    </header>
    ${grupos.map(g => `
    <h2 class="rel-secao tk-grupo"><b>${esc(g.fazenda)}</b> · ${esc(g.empregador)}</h2>
    <table class="rel-tabela tk-rel">
      <thead><tr><th>Nome</th><th class="rel-num">Valor ticket alimentação</th><th>Observação</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr><td>${esc(l.nome)}</td>
        <td class="rel-num">${brl(l.pagar)}</td><td>${esc(obsRel(l))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Subtotal · ${esc(g.fazenda)}</td><td class="rel-num">${brl(soma(g.linhas, 'pagar'))}</td><td>${g.linhas.length} pessoa(s)</td></tr></tfoot>
    </table>`).join('') || '<div class="rel-resumo">Ninguém com ticket neste mês.</div>'}
    <div class="rel-resumo tk-total"><b>Total a pagar: ${brl(total)}</b> · ${linhas.length} pessoa(s)${
      linhas.some(l => l.abat) ? ` · abatido no mês: ${brl(soma(linhas, 'abat'))}` : ''}</div>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

function mostrarDoc(html, aoImprimir) {
  const alvo = $('jorImpressao');
  alvo.innerHTML = `<div class="rel-barra-tela">
      <button class="btn principal" type="button" data-tk-imprimir>Imprimir / salvar em PDF</button>
      <button class="btn mini" type="button" data-tk-fechar>Fechar prévia</button></div>` + html;
  alvo.querySelector('[data-tk-imprimir]').addEventListener('click', async () => {
    if (aoImprimir) await aoImprimir();
    document.body.classList.add('jor-imprimindo');
    const soltar = () => { document.body.classList.remove('jor-imprimindo'); removeEventListener('afterprint', soltar); };
    addEventListener('afterprint', soltar);
    print();
    setTimeout(soltar, 3000);
  });
  alvo.querySelector('[data-tk-fechar]').addEventListener('click', () => { alvo.hidden = true; alvo.innerHTML = ''; });
  alvo.hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Fechar para pagamento (30/10/2026, pedido dele): guarda o relatório como
   foi pago e trava o mês — sem abater nem mudar observação. Para corrigir,
   "Reabrir o mês" pede a mesma senha de mostrar os salários; ao fechar de
   novo sai uma versão nova. Imprimir com o mês aberto é só prévia. */
const fechadoDe = ym => !!emissaoDe(ym)?.fechado;

async function fecharMes(ym) {
  const linhas = linhasDoMes(ym);
  const ant = emissaoDe(ym);
  const reg = {
    competencia: ym, versao: ant ? (ant.versao || 1) + 1 : 1,
    total: soma(linhas, 'pagar'), linhas,
    emitido_por: usuario(), emitido_em: agora(),
    fechado: true, fechado_por: usuario(), fechado_em: agora(),
  };
  try { await jd.salvar('ticketEmissoes', reg); return reg; }
  catch (e) { avisar('Não consegui fechar o mês: ' + e.message); return null; }
}

async function reabrirMes(ym) {
  const em = emissaoDe(ym);
  if (!em) return;
  try {
    const { _base, ...resto } = em;
    await jd.salvar('ticketEmissoes', { ...resto, fechado: false, fechado_por: usuario(), fechado_em: agora() });
    avisar(`${rotMes(mesAnterior(ym))} reaberto para edição.`, true);
  } catch (e) { avisar('Não consegui reabrir: ' + e.message); }
  desenharMes();
}

function pedirSenhaReabrir(depois) {
  let d = $('dlgTkSenha');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgTkSenha'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">
    <h3>Reabrir o mês</h3>
    <p class="dica">O relatório já foi fechado para pagamento. Digite a senha para liberar a edição (a mesma de mostrar os valores).</p>
    <div class="aviso erro" id="tkSenhaErro" hidden></div>
    <label class="campo plena">Senha<input type="password" id="tkSenha" autocomplete="off"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="tkSenhaOk">Reabrir</button></div></form>`;
  d.querySelector('[data-fechar]').addEventListener('click', () => d.close());
  const ok = () => {
    if ($('tkSenha').value.trim() !== SENHA_SALARIO) {
      $('tkSenhaErro').textContent = 'Senha incorreta.'; $('tkSenhaErro').hidden = false; $('tkSenha').focus(); return;
    }
    d.close(); depois();
  };
  $('tkSenhaOk').addEventListener('click', ok);
  $('tkSenha').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
  d.showModal(); $('tkSenha').focus();
}

function csvMes(ym, linhas) {
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  const v = n => String(n.toFixed(2)).replace('.', ',');
  const cols = ['Nome', 'Empregador', 'Fazenda', 'Valor cadastro', 'Abatimento', 'A pagar', 'Observacao'];
  const ls = agrupar(linhas).flatMap(g => g.linhas)
    .map(l => [l.nome, l.empregador, l.fazenda, v(l.valor), v(l.abat), v(l.pagar), obsRel(l)]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + [cols, ...ls].map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  a.download = `Ticket_${ym}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------- telas ---------------- */

function cabecalho(titulo, sub, direita) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">${direita || ''}</div></header>`;
}

export async function abrirTicket(tela) {
  if (!est.mes) est.mes = mesPadrao();
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados do DP: ' + e.message); }
  }
  if (tela === 'tkMes') desenharMes();
  if (tela === 'tkHist') desenharHist();
}

function desenharMes() {
  const ym = est.mes;
  const em = emissaoDe(ym);
  const fechado = !!em?.fechado;
  // Fechado: a tela mostra o que foi pago, não o cadastro de hoje.
  const todas = fechado ? (em.linhas || []) : linhasDoMes(ym);
  const b = est.busca.trim().toLowerCase();
  const linhas = todas.filter(l => !b || l.nome.toLowerCase().includes(b));
  const grupos = agrupar(linhas);
  const sem = semTicket();
  const podeEditar = podeTela('tkMes') && !fechado;

  /* 30/10/2026: escolhe-se o mês de referência; o dado continua guardado pelo
     mês do pagamento (ym = referência + 1), então ajustes e Histórico antigos valem. */
  const ref = mesAnterior(ym);
  $('telaTkMes').innerHTML = cabecalho('Ticket alimentação', 'Mês de referência · o ticket precisa cair até o dia 10 do mês seguinte',
    `<label>mês de referência<input type="month" id="tkMesSel" class="tk-mes-sel" value="${ref}"></label>
     <div class="tk-mes-pago">pago em ${esc(rotMes(ym))}</div>`) + `
    <div class="jor-corpo">
      ${fechado ? `<div class="jor-caixa tk-fechado"><span>🔒 <b>Fechado para pagamento</b> em ${br(em.emitido_em)}${em.emitido_por ? ' por ' + esc(em.emitido_por) : ''}${em.versao > 1 ? ` (versão ${em.versao})` : ''}.
          Ninguém altera valores nem observações enquanto estiver fechado.</span>
          ${podeTela('tkMes') ? '<button class="btn mini" type="button" id="tkReabrir">Reabrir o mês</button>' : ''}</div>`
        : em ? `<div class="jor-caixa alerta" style="margin-bottom:10px">Mês <b>reaberto</b> para edição (estava fechado na versão ${em.versao || 1}).
          Ao terminar, clique em <b>Fechar para pagamento</b> de novo — sai como versão nova.</div>` : ''}
      <div class="jor-barra">
        <input id="tkBusca" type="search" placeholder="Buscar funcionário" value="${esc(est.busca)}">
        ${!fechado && podeTela('tkMes') ? '<button class="btn principal" type="button" id="tkFechar">Fechar para pagamento</button>' : ''}
        <button class="btn${fechado ? ' principal' : ''}" type="button" id="tkRel">${fechado ? 'Relatório do mês' : 'Prévia do relatório'}</button>
        <button class="btn" type="button" id="tkCsv">Excel (CSV)</button>
        <span class="dc-sem">A pagar: <b>${brl(soma(todas, 'pagar'))}</b> · ${todas.length} pessoa(s)${todas.some(l => l.abat) ? ` · abatido: <b>${brl(soma(todas, 'abat'))}</b>` : ''}</span>
      </div>
      ${grupos.length ? `<table class="dc-planilha"><thead><tr>
          <th>Funcionário</th><th class="ce">Valor do cadastro</th><th class="ce">Abatimento do mês</th>
          <th class="ce">A pagar</th><th>Observação</th><th class="ce"></th></tr></thead>
        ${grupos.map(g => `<tbody>
          <tr class="tk-grupo"><td colspan="6"><b>${esc(g.empregador)}</b> · ${esc(g.fazenda)}</td></tr>
          ${g.linhas.map(l => `<tr>
            <td>${esc(l.nome)}</td>
            <td class="ce">${brl(l.valor)}</td>
            <td class="ce">${l.abat ? `<span class="jor-pend">− ${brl(l.abat)}</span>${l.motivo ? `<br><span class="dc-sem">${esc(l.motivo)}</span>` : ''}` : '—'}</td>
            <td class="ce"><b>${brl(l.pagar)}</b></td>
            <td>${podeEditar ? `<input type="text" class="tk-obs" data-tk-obs="${l.fid}" maxlength="60" value="${esc(l.obs)}"
              placeholder="—" title="Observação deste mês — Enter ou sair do campo grava">` : (esc(l.obs) || '<span class="dc-sem">—</span>')}</td>
            <td class="ce">${podeEditar ? `<button class="btn mini" data-tk-abater="${l.fid}">${l.abat || ajusteDe(l.fid, ym) ? 'Alterar' : 'Abater'}</button>` : ''}</td>
          </tr>`).join('')}
          <tr class="jor-total"><td>Subtotal</td><td class="ce">${brl(soma(g.linhas, 'valor'))}</td>
            <td class="ce">${soma(g.linhas, 'abat') ? '− ' + brl(soma(g.linhas, 'abat')) : '—'}</td>
            <td class="ce">${brl(soma(g.linhas, 'pagar'))}</td><td colspan="2">${g.linhas.length} pessoa(s)</td></tr>
        </tbody>`).join('')}
        <tfoot><tr class="jor-total"><td>Total do mês</td><td class="ce">${brl(soma(linhas, 'valor'))}</td>
          <td class="ce">${soma(linhas, 'abat') ? '− ' + brl(soma(linhas, 'abat')) : '—'}</td>
          <td class="ce">${brl(soma(linhas, 'pagar'))}</td><td colspan="2">${linhas.length} pessoa(s)</td></tr></tfoot>
        </table>` : '<div class="vazio">Ninguém com valor de ticket no Cadastro Nível 2.</div>'}
      ${sem.length ? `<p class="dc-sem jor-nota"><b>Ativos sem ticket no cadastro (${sem.length}):</b> ${sem.map(f => esc(f.nome)).join(', ')}.
        Para incluir, preencha o valor em Cadastros › Cadastro · Nível 2.</p>` : ''}
      <p class="dc-sem jor-nota">O valor de cada pessoa vem do Cadastro Nível 2. O <b>abatimento vale só para este mês</b>:
        no mês seguinte volta o valor do cadastro.</p>
    </div>
    <dialog id="dlgTkAbater"><form method="dialog" id="formTkAbater" onsubmit="return false">
      <h3>Abater no mês</h3>
      <p class="dica" id="tkAbQuem"></p>
      <div class="grade">
        <label class="campo">Valor a abater (R$)<input type="text" id="tkAbValor" inputmode="decimal" placeholder="0,00"></label>
        <label class="campo">Motivo<input type="text" id="tkAbMotivo" maxlength="80" placeholder="Ex.: 3 faltas"></label>
        <label class="campo plena">Observação no relatório deste mês<input type="text" id="tkAbObs" maxlength="60"></label>
      </div>
      <p class="dc-sem" id="tkAbConta"></p>
      <div class="aviso erro" id="tkAbErro" hidden></div>
      <div class="barra entre">
        <button class="btn perigo" type="button" id="tkAbTirar">Tirar o abatimento</button>
        <span><button class="btn" type="button" data-fechar>Cancelar</button>
        <button class="btn principal" type="button" id="tkAbOk">Salvar</button></span>
      </div>
    </form></dialog>`;

  $('tkMesSel').addEventListener('change', ev => {
    if (!/^\d{4}-\d{2}$/.test(ev.target.value)) return;
    est.mes = proximoMes(ev.target.value); desenharMes();
  });
  $('tkBusca').addEventListener('input', ev => {
    est.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    desenharMes();
    const el = $('tkBusca'); el.focus(); try { el.setSelectionRange(pos, pos); } catch {}
  });
  $('tkRel').addEventListener('click', () => {
    if (fechado) mostrarDoc(relatorioHTML(ym, em.linhas || [], em), null);
    else mostrarDoc(relatorioHTML(ym, linhasDoMes(ym), null), null);
  });
  $('tkFechar')?.addEventListener('click', async () => {
    if (!confirm(`Fechar ${rotMes(mesAnterior(ym))} para pagamento?\n\nO relatório fica guardado como está e o mês trava: para mudar depois, só reabrindo com senha.`)) return;
    const reg = await fecharMes(ym);
    if (!reg) return;
    avisar(`${rotMes(mesAnterior(ym))} fechado para pagamento.`, true);
    desenharMes();
    mostrarDoc(relatorioHTML(ym, reg.linhas, reg), null);
  });
  $('tkReabrir')?.addEventListener('click', () => pedirSenhaReabrir(() => reabrirMes(ym)));
  $('tkCsv').addEventListener('click', () => csvMes(ym, todas));
  /* Observação direto na linha (14/10/2026, pedido dele): grava só para este
     mês; igual à do cadastro não fica guardada no mês. */
  document.querySelectorAll('#telaTkMes [data-tk-obs]').forEach(inp => {
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', () => gravarObs(inp.dataset.tkObs, inp.value));
  });
  document.querySelectorAll('#telaTkMes [data-tk-abater]').forEach(bt =>
    bt.addEventListener('click', () => abrirAbater(bt.dataset.tkAbater)));
  $('dlgTkAbater').querySelector('[data-fechar]').addEventListener('click', () => $('dlgTkAbater').close());
}

async function gravarObs(fid, texto) {
  const ym = est.mes;
  if (fechadoDe(ym)) { avisar('Mês fechado para pagamento — reabra para editar.'); return; }
  const v = jd.vinculoDe(fid);
  const a = ajusteDe(fid, ym);
  const obs = String(texto || '').trim();
  const doMes = obs === (v?.ticket_obs || '') ? null : obs;
  if (!a && doMes == null) return;
  if (a && doMes == null && !num(a.abatimento) && !a.motivo) {
    await jd.apagar('ticketMes', chave(fid, ym));
  } else {
    await jd.salvar('ticketMes', {
      chave: chave(fid, ym), funcionario_id: fid, competencia: ym,
      abatimento: num(a?.abatimento), motivo: a?.motivo || null,
      observacao: doMes, atualizado_por: usuario(), atualizado_em: agora(),
    });
  }
  avisar('Observação salva para ' + rotMes(ym) + '.', true);
}

function abrirAbater(fid) {
  const ym = est.mes;
  if (fechadoDe(ym)) { avisar('Mês fechado para pagamento — reabra para editar.'); return; }
  const l = linhasDoMes(ym).find(x => x.fid === fid);
  if (!l) return;
  const a = ajusteDe(fid, ym);
  const v = jd.vinculoDe(fid);
  $('tkAbQuem').textContent = `${l.nome} · ${rotMes(ym)} · valor do cadastro ${brl(l.valor)}. Vale só para este mês.`;
  $('tkAbValor').value = a?.abatimento ? Number(a.abatimento).toFixed(2).replace('.', ',') : '';
  $('tkAbMotivo').value = a?.motivo || '';
  $('tkAbObs').value = (a?.observacao ?? v?.ticket_obs) || '';
  $('tkAbErro').hidden = true;
  $('tkAbTirar').hidden = !a;
  const conta = () => {
    const x = lerValor($('tkAbValor').value);
    $('tkAbConta').textContent = Number.isNaN(x) ? 'Valor inválido.'
      : x > l.valor ? `Maior que o valor do cadastro (${brl(l.valor)}).`
      : `A pagar neste mês: ${brl(l.valor - x)}.`;
  };
  $('tkAbValor').oninput = conta; conta();

  $('tkAbOk').onclick = async () => {
    const x = lerValor($('tkAbValor').value);
    const erro = msg => { $('tkAbErro').textContent = msg; $('tkAbErro').hidden = false; };
    if (Number.isNaN(x)) return erro('Valor inválido.');
    if (x > l.valor) return erro(`O abatimento não pode passar do valor do cadastro (${brl(l.valor)}).`);
    if (x > 0 && $('tkAbMotivo').value.trim().length < 3) { $('tkAbMotivo').focus(); return erro('Escreva o motivo do abatimento.'); }
    const obs = $('tkAbObs').value.trim();
    await jd.salvar('ticketMes', {
      chave: chave(fid, ym), funcionario_id: fid, competencia: ym,
      abatimento: x, motivo: $('tkAbMotivo').value.trim() || null,
      // Observação igual à do cadastro não precisa ficar no mês.
      observacao: obs === (v?.ticket_obs || '') ? null : obs,
      atualizado_por: usuario(), atualizado_em: agora(),
    });
    $('dlgTkAbater').close();
    avisar(x ? `Abatido ${brl(x)} de ${l.nome} em ${rotMes(ym)}.` : 'Observação do mês salva.', true);
    desenharMes();
  };
  $('tkAbTirar').onclick = async () => {
    await jd.apagar('ticketMes', chave(fid, ym));
    $('dlgTkAbater').close();
    avisar(`${l.nome} volta ao valor do cadastro em ${rotMes(ym)}.`, true);
    desenharMes();
  };
  $('dlgTkAbater').showModal();
  $('tkAbValor').focus();
}

function desenharHist() {
  const lista = [...(jd.dados.ticketEmissoes || [])].sort((a, b) => b.competencia.localeCompare(a.competencia));
  $('telaTkHist').innerHTML = cabecalho('Ticket · histórico', 'Relatórios já emitidos, do jeito que saíram') + `
    <div class="jor-corpo">
      ${lista.length ? `<table class="dc-planilha"><thead><tr>
        <th>Mês do pagamento</th><th class="ce">Pessoas</th><th class="ce">Abatido</th><th class="ce">Total pago</th>
        <th>Emitido</th><th class="ce"></th></tr></thead><tbody>
        ${lista.map(e => `<tr><td>${esc(rotMes(e.competencia))}</td><td class="ce">${(e.linhas || []).length}</td>
          <td class="ce">${soma(e.linhas || [], 'abat') ? brl(soma(e.linhas || [], 'abat')) : '—'}</td>
          <td class="ce"><b>${brl(e.total)}</b></td>
          <td>${br(e.emitido_em)}${e.emitido_por ? ` · <span class="dc-sem">${esc(e.emitido_por)}</span>` : ''}${e.versao > 1 ? ` · versão ${e.versao}` : ''}</td>
          <td class="ce"><button class="btn mini" data-tk-ver="${esc(e.competencia)}">Ver relatório</button></td></tr>`).join('')}
        </tbody></table>` : '<div class="vazio">Nenhum relatório emitido ainda. Ele entra aqui ao imprimir em Ticket › Mês.</div>'}
      <p class="dc-sem jor-nota">Guardado ao imprimir. Reimprimir o mesmo mês gera versão nova; aqui fica a última.</p>
    </div>`;
  document.querySelectorAll('#telaTkHist [data-tk-ver]').forEach(bt => bt.addEventListener('click', () => {
    const e = emissaoDe(bt.dataset.tkVer);
    if (e) mostrarDoc(relatorioHTML(e.competencia, e.linhas || [], e), null);
  }));
}

export function ligarTicket(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}
export function limparTicket() { est.mes = null; est.busca = ''; }
