// sst-epi-crono.js — SST › EPI's › Cronograma de troca (28/10/2026).
//
// Pedido dele: "não quero fazer saída e entrada de EPI no sistema, mas quero,
// para alguns EPIs, marcar quando foi entregue e a próxima troca". Nasceu do
// apontamento da auditoria (1.26 Frequência de entrega e termo de EPI).
//
// · Entra no cronograma todo tipo de EPI com frequência de troca (Tipos de
//   EPI). Sem frequência = conforme desgaste = fica de fora.
// · Frequência marcada "a confirmar" é sugestão do Claude (28/10/2026, escolha
//   dele); confirmar aqui ou salvando o EPI em Tipos de EPI.
// · Marcar entregue = data + para quem (grupo/equipe/fazenda, vazio = todos).
//   Próxima troca = última entrega + frequência (js/epi-cronograma-dados.js).
// · Grava pela fila do store.js (camada do EPI): funciona sem internet.
// · As próximas trocas aparecem também no Cronograma geral (fonte 'sst-epi').
import { estado, novoId, salvarEntregaEpi, apagarEntregaEpi, salvarEpi } from './store.js';
import { linhasCronograma, tiposComTroca, textoFreq, previsaoMeses, hojeIso, normal, somarTroca } from './epi-cronograma-dados.js';
import { mostrar } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const chip = (cor, txt) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const TELAS_EPI_CRONO = ['epiCrono'];

const F = { busca: '', sit: '', aberta: null };

/* Sugestões do campo "para quem": o que já foi usado + fazendas + atividades dos EPIs. */
function sugestoesPara() {
  const s = new Set();
  for (const e of estado.epiEntregas || []) if (e.para) s.add(e.para);
  for (const f of estado.funcionarios || []) if (f.situacao === 'ATIVO' && f.fazenda) s.add(f.fazenda);
  for (const e of estado.epis || []) if (e.atividade) s.add(e.atividade);
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function linhas() { return linhasCronograma(estado.epis, estado.epiEntregas); }

/* ===================================================================
   TELA
   =================================================================== */
function desenhar() {
  const tela = $('telaEpiCrono');
  if (!tela) return;
  const todas = linhas();
  const conta = ch => todas.filter(l => l.sit.chave === ch).length;
  const aConfirmar = tiposComTroca(estado.epis).filter(t => !t.confirmada);
  const q = normal(F.busca);
  const vis = todas.filter(l => (!F.sit || l.sit.chave === F.sit)
    && (!q || normal(l.tipo.nome + ' ' + l.para).includes(q)));
  const card = (ch, nome, cor, dica) => `<button type="button" class="pv-card pv-${cor}${conta(ch) ? '' : ' pv-zero'}" data-ec-sit="${ch}">
    <span>${nome}</span><strong>${conta(ch)}</strong><small>${dica}</small></button>`;

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Cronograma de troca de EPI</h2>
        <p class="dica" style="margin:2px 0 0">Marque quando o EPI foi entregue e o app mostra a próxima troca pela frequência de cada tipo. Sem controle de estoque.</p></div>
      <span class="barra">
        <button class="btn" type="button" id="ecPdf">Cronograma PDF</button>
        <button class="btn principal" type="button" id="ecNova">Marcar entrega</button>
      </span>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${card('atrasada', 'Atrasadas', 'perigo', 'passou da data de troca')}
      ${card('logo', 'Trocar logo', 'alerta', 'dentro do prazo de aviso')}
      ${card('emdia', 'Em dia', 'calma', 'próxima troca adiante')}
      ${card('sem', 'Sem entrega marcada', 'ok', 'tipos com frequência, sem data')}
    </div>
    ${aConfirmar.length ? `<div class="aviso info" style="margin-top:10px">${aConfirmar.length} frequência${aConfirmar.length > 1 ? 's' : ''} de troca
      ${aConfirmar.length > 1 ? 'são sugestões' : 'é sugestão'} e precisa${aConfirmar.length > 1 ? 'm' : ''} ser confirmada${aConfirmar.length > 1 ? 's' : ''} com o técnico de segurança
      (etiqueta <b>a confirmar</b>). Toque em "Frequência" na linha para confirmar ou corrigir.</div>` : ''}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Buscar <input type="text" id="ecBusca" value="${esc(F.busca)}" placeholder="EPI ou para quem"></label>
      <label class="campo">Situação <select id="ecSit">
        <option value="">Todas</option>
        ${[['atrasada', 'Atrasadas'], ['logo', 'Trocar logo'], ['emdia', 'Em dia'], ['sem', 'Sem entrega marcada']]
          .map(([v, n]) => `<option value="${v}"${F.sit === v ? ' selected' : ''}>${n}</option>`).join('')}
      </select></label>
    </div>
    <div class="tc-rolo" style="margin-top:10px">
    <table class="dc-planilha"><thead><tr>
      <th>Tipo de EPI</th><th>Para quem</th><th>Frequência</th><th>Última entrega</th><th>Próxima troca</th><th>Situação</th><th style="width:1%"></th>
    </tr></thead><tbody>
    ${vis.length ? vis.map(l => linhaHtml(l)).join('') : '<tr><td colspan="7" class="dc-sem">Nada neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="dica" style="margin:8px 0 0">EPIs sem frequência (cinto, máscara de solda, respirador full face…) trocam conforme desgaste e não entram aqui.
      A frequência se muda em <a href="#" id="ecTipos">Tipos de EPI</a>.</p>
  </div>`;

  tela.querySelectorAll('[data-ec-sit]').forEach(b => b.addEventListener('click', () => { F.sit = F.sit === b.dataset.ecSit ? '' : b.dataset.ecSit; desenhar(); }));
  $('ecBusca').addEventListener('input', ev => { F.busca = ev.target.value; const p = ev.target.selectionStart; desenhar(); const i = $('ecBusca'); i.focus(); i.setSelectionRange(p, p); });
  $('ecSit').addEventListener('change', ev => { F.sit = ev.target.value; desenhar(); });
  $('ecNova').addEventListener('click', () => dialogoEntrega(null));
  $('ecPdf').addEventListener('click', () => mostrar(documento(todas), { barra: true }));
  $('ecTipos').addEventListener('click', ev => { ev.preventDefault(); irPara('epis'); });
  tela.querySelectorAll('[data-ec-entregar]').forEach(b => b.addEventListener('click', () => {
    const l = vis.find(x => x.chave === b.dataset.ecEntregar); dialogoEntrega(l);
  }));
  tela.querySelectorAll('[data-ec-freq]').forEach(b => b.addEventListener('click', () => {
    const l = vis.find(x => x.chave === b.dataset.ecFreq); dialogoFreq(l.tipo);
  }));
  tela.querySelectorAll('[data-ec-hist]').forEach(b => b.addEventListener('click', () => {
    F.aberta = F.aberta === b.dataset.ecHist ? null : b.dataset.ecHist; desenhar();
  }));
  tela.querySelectorAll('[data-ec-apagar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Apagar esta entrega do histórico?')) return;
    await apagarEntregaEpi(b.dataset.ecApagar); desenhar();
  }));
}

function linhaHtml(l) {
  const t = l.tipo;
  const cas = [...new Set(t.epis.map(e => e.ca).filter(Boolean))].join(' · ');
  const hist = F.aberta === l.chave && l.entregas.length ? `<tr class="ec-hist"><td colspan="7">
      <b>Entregas marcadas</b>
      <table class="dc-planilha" style="margin-top:6px"><thead><tr><th>Data</th><th>C.A</th><th>Observação</th><th>Marcado por</th><th style="width:1%"></th></tr></thead><tbody>
      ${l.entregas.map(en => {
        const epi = estado.epis.find(e => e.id === en.epi_id);
        return `<tr><td>${br(en.entregue_em)}</td><td>${esc(epi?.ca || '—')}</td><td>${esc(en.obs || '—')}</td><td>${esc(en.criado_por || '—')}</td>
          <td><button class="btn mini" type="button" data-ec-apagar="${en.id}">Apagar</button></td></tr>`;
      }).join('')}</tbody></table></td></tr>` : '';
  return `<tr>
    <td><b>${esc(t.nome)}</b>${cas ? `<br><span class="dc-sem">C.A ${esc(cas)}</span>` : ''}</td>
    <td>${esc(l.para || (l.entregas.length ? 'Todos' : '—'))}</td>
    <td>${esc(textoFreq(t.qtd, t.unidade))}${t.confirmada ? '' : ' ' + chip('alerta', 'a confirmar')}</td>
    <td>${br(l.ultima)}</td>
    <td><b>${br(l.proxima)}</b></td>
    <td>${chip(l.sit.cor, l.sit.rotulo)}</td>
    <td style="white-space:nowrap">
      <button class="btn mini principal" type="button" data-ec-entregar="${esc(l.chave)}">Entregue</button>
      <button class="btn mini" type="button" data-ec-freq="${esc(l.chave)}">Frequência</button>
      ${l.entregas.length ? `<button class="btn mini" type="button" data-ec-hist="${esc(l.chave)}">${F.aberta === l.chave ? 'Fechar' : 'Histórico'}</button>` : ''}
    </td></tr>${hist}`;
}

/* ===================================================================
   DIÁLOGOS (montados na hora, um de cada vez)
   =================================================================== */
function dialogo(html) {
  let d = $('dlgEpiCrono');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgEpiCrono'; document.body.appendChild(d); }
  d.innerHTML = html;
  d.showModal();
  d.querySelector('[data-fechar]')?.addEventListener('click', () => d.close());
  return d;
}

function dialogoEntrega(linha) {
  const tipos = tiposComTroca(estado.epis);
  if (!tipos.length) { alert('Nenhum EPI tem frequência de troca. Preencha em Tipos de EPI.'); return; }
  const tipo = linha?.tipo || tipos[0];
  const opcoesEpi = t => t.epis.map(e => `<option value="${e.id}">${esc(e.descricao)}${e.ca ? ' · C.A ' + esc(e.ca) : ''}</option>`).join('');
  const d = dialogo(`<form method="dialog" id="ecForm">
    <h3>Marcar entrega de EPI</h3>
    <div class="grade">
      <label class="campo plena">Tipo de EPI <select id="ecTipo">
        ${tipos.map(t => `<option value="${esc(t.chave)}"${t.chave === tipo.chave ? ' selected' : ''}>${esc(t.nome)} — ${esc(textoFreq(t.qtd, t.unidade))}</option>`).join('')}
      </select></label>
      <label class="campo plena" id="ecCaCampo">C.A entregue <select id="ecEpi">${opcoesEpi(tipo)}</select></label>
      <label class="campo">Entregue em <input type="date" id="ecData" value="${hojeIso()}" required></label>
      <label class="campo">Para quem <input type="text" id="ecPara" list="ecParaLista" value="${esc(linha?.para || '')}" placeholder="vazio = todos"></label>
      <datalist id="ecParaLista">${sugestoesPara().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="campo plena">Observação <input type="text" id="ecObs" placeholder="opcional"></label>
    </div>
    <p class="dica" id="ecPrev" style="margin:8px 0 0"></p>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="submit">Salvar</button>
    </div></form>`);
  const tipoSel = () => tipos.find(t => t.chave === $('ecTipo').value);
  const prev = () => {
    const t = tipoSel(); const dt = $('ecData').value;
    $('ecPrev').textContent = dt ? `Próxima troca: ${br(somarTroca(dt, t.qtd, t.unidade))}` : '';
  };
  const ajustaEpi = () => { const t = tipoSel(); $('ecEpi').innerHTML = opcoesEpi(t); $('ecCaCampo').hidden = t.epis.length < 2; prev(); };
  $('ecTipo').addEventListener('change', ajustaEpi);
  $('ecData').addEventListener('change', prev);
  ajustaEpi();
  $('ecForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const data = $('ecData').value;
    if (!data) return;
    await salvarEntregaEpi({ id: novoId(), epi_id: $('ecEpi').value, entregue_em: data,
      para: $('ecPara').value.trim(), obs: $('ecObs').value.trim() || null,
      criado_por: estado.sessao?.user?.email || null });
    d.close(); desenhar();
  });
}

function dialogoFreq(tipo) {
  const d = dialogo(`<form method="dialog" id="ecFormF">
    <h3>Frequência de troca</h3>
    <p class="dica" style="margin:0 0 10px"><b>${esc(tipo.nome)}</b>${tipo.confirmada ? '' : ' — hoje é sugestão; salvando, fica confirmada.'}</p>
    <div class="grade">
      <label class="campo">Trocar a cada <input type="number" id="ecQtd" min="1" step="1" inputmode="numeric" value="${tipo.qtd}" required></label>
      <label class="campo">Unidade <select id="ecUn">
        ${['dias', 'semanas', 'meses'].map(u => `<option${u === tipo.unidade ? ' selected' : ''}>${u}</option>`).join('')}
      </select></label>
    </div>
    <p class="dica" style="margin:8px 0 0">Vale para ${tipo.epis.length > 1 ? `os ${tipo.epis.length} C.As deste tipo` : 'este EPI'}.
      Para tirar do cronograma (troca conforme desgaste), apague a frequência em Tipos de EPI.</p>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="submit">Confirmar</button>
    </div></form>`);
  $('ecFormF').addEventListener('submit', async ev => {
    ev.preventDefault();
    const qtd = parseInt($('ecQtd').value, 10);
    if (!(qtd > 0)) return;
    for (const e of tipo.epis) await salvarEpi({ ...e, troca_qtd: qtd, troca_unidade: $('ecUn').value, troca_confirmada: true });
    d.close(); desenhar();
  });
}

/* ===================================================================
   DOCUMENTO (para o auditor) — paisagem, previsão dos próximos 12 meses
   =================================================================== */
function documento(todas) {
  const hoje = new Date();
  const cab = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  });
  const lin = [...todas].sort((a, b) => a.tipo.nome.localeCompare(b.tipo.nome, 'pt-BR') || a.para.localeCompare(b.para, 'pt-BR'));
  const sit = l => l.sit.chave === 'atrasada' ? `<span class="rel-pend">Atrasada</span>`
    : l.sit.chave === 'sem' ? '—' : l.sit.chave === 'logo' ? `<span class="rel-pend">Trocar logo</span>` : `<span class="rel-ok">Em dia</span>`;
  const pend = tiposComTroca(estado.epis).filter(t => !t.confirmada).length;
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Cronograma de troca de EPI</h1><p>Frequência de reposição e previsão dos próximos 12 meses</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hojeIso())}</strong><span></span></div>
    </header>
    <table class="rel-tabela"><thead><tr>
      <th>Tipo de EPI</th><th>C.A</th><th>Para quem</th><th>Frequência</th><th>Última entrega</th><th>Próxima troca</th><th>Situação</th>
      ${cab.map(c => `<th style="text-align:center">${c}</th>`).join('')}
    </tr></thead><tbody>
    ${lin.map(l => {
      const p = previsaoMeses(l);
      return `<tr><td>${esc(l.tipo.nome)}</td><td>${esc([...new Set(l.tipo.epis.map(e => e.ca).filter(Boolean))].join(' / ') || '—')}</td>
        <td>${esc(l.para || (l.entregas.length ? 'Todos' : '—'))}</td><td>${esc(textoFreq(l.tipo.qtd, l.tipo.unidade))}</td>
        <td>${br(l.ultima)}</td><td>${br(l.proxima)}</td><td>${sit(l)}</td>
        ${p.map(n => `<td style="text-align:center">${n ? (n > 1 ? n + '×' : '●') : ''}</td>`).join('')}</tr>`;
    }).join('')}
    </tbody></table>
    <p class="rel-nota">● troca prevista no mês · 2×, 4×… quantidade de trocas no mês (EPIs de troca semanal ou quinzenal).
      Próxima troca = última entrega + frequência do tipo. EPIs não listados trocam conforme desgaste, ou quando danificados, mediante devolução do usado.
      A entrega a cada funcionário é registrada na ficha de EPI assinada (termo de responsabilidade).${pend ? ` ${pend} frequência(s) ainda em conferência com o técnico de segurança.` : ''}</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

/* ===================================================================
   ENTRADA
   =================================================================== */
let irPara = () => {};
export function ligarEpiCrono({ abrir }) { irPara = abrir; }
export function abrirEpiCrono() { desenhar(); }
export function redesenharEpiCrono() { if ($('telaEpiCrono') && !$('telaEpiCrono').hidden) desenhar(); }
export function limparEpiCrono() { F.busca = ''; F.sit = ''; F.aberta = null; }
