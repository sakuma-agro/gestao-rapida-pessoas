// jornada-emprestimos.js — DP → Empréstimo Funcionário (21/09/2026)
//
// Regras aprovadas em 16/09/2026 (doc. 03 e protótipo), agora no app:
//   • empréstimo e adiantamento são a mesma coisa; sem juros e sem correção;
//   • parcelas iguais, os centavos que sobram vão para a última;
//   • teto: saldo em aberto + novo empréstimo ≤ 40% do salário base vigente;
//     acima disso só o administrador libera, com justificativa (trava no banco);
//   • quem já tem empréstimo em aberto entra na FILA: o novo começa no mês
//     seguinte à quitação do anterior;
//   • a parcela do mês baixa SOZINHA no fechamento da competência e sai como
//     coluna no arquivo "Dados para a folha"; mês sem desconto ou desconto
//     parcial empurra o que faltou para o fim;
//   • recibo em duas vias na mesma folha; reimpressão sai marcada "2ª via";
//   • desligamento: cada saldo vai para "descontar na rescisão" ou "baixar
//     como perda".
//
// O SALDO NUNCA É GRAVADO: é o valor menos a soma dos abatimentos lançados
// (lição do achado A-18). Por isso a parcela prevista também é calculada, não
// guardada — empurrar e acumular no fim saem de graça da conta.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { acesso, podeTela } from './acesso.js';
import { bloqueioInss } from './jornada-ferias.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];
const MES3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export const TETO_PERC = 40;

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => Math.round(Number(v || 0) * 100) / 100;
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const compCurta = c => c ? `${MES3[+c.slice(5, 7) - 1]}/${c.slice(2, 4)}` : '—';
const compLonga = c => c ? `${MESES[+c.slice(5, 7) - 1]} de ${c.slice(0, 4)}` : '—';
const proxComp = c => {
  const [a, m] = c.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};
const comp = iso => String(iso).slice(0, 8) + '01';
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();
const numeroTxt = e => e.numero ? 'EF-' + String(e.numero).padStart(4, '0') : 'EF-····';
const cpfBR = c => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : (c || '—');
};

const pessoa = id => estado.funcionarios.find(f => f.id === id) || null;
const nomeDe = id => pessoa(id)?.nome || '—';
const ativos = () => estado.funcionarios
  .filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export const podeVerEmprestimo = () =>
  ['empEmissao', 'empRecibos', 'empHistorico'].some(t => podeTela(t));

/* ===================================================================
   REGRAS — funções puras sobre jd.dados
   =================================================================== */

const emprestimos = () => jd.dados.emprestimos || [];
/* Só o abatimento "lancado" baixa o saldo. "ajustado" é o valor combinado para
   um mês que ainda não foi enviado (ex.: parcela de 500 que vai descontar 200). */
const abatimentos = () => (jd.dados.abatimentos || []).filter(a => a.situacao === 'lancado');
export const ajusteDe = (emprestimoId, competencia) => (jd.dados.abatimentos || [])
  .find(a => a.emprestimo_id === emprestimoId && a.competencia === competencia && a.situacao === 'ajustado') || null;

export const abatidoDe = (e, antesDe = null) => num(abatimentos()
  .filter(a => a.emprestimo_id === e.id && (!antesDe || a.competencia < antesDe))
  .reduce((s, a) => s + Number(a.valor || 0), 0));

/** Valor que ainda falta voltar, pelo que foi abatido. */
export const saldoBruto = (e, antesDe = null) => num(Number(e.valor) - abatidoDe(e, antesDe));

/** Saldo que ainda vai ser descontado no mês a mês. */
export const saldo = e => e.situacao === 'ativo' ? Math.max(0, saldoBruto(e)) : 0;

export function valoresParcelas(valor, n) {
  const base = Math.floor(valor * 100 / n) / 100;
  const l = Array(n).fill(base);
  l[n - 1] = num(valor - base * (n - 1));
  return l;
}
const base = e => Math.floor(Number(e.valor) * 100 / e.parcelas) / 100;
/* Menos de R$ 1,00 de sobra vai junto na parcela — é o "centavos na última". */
const parcelaDe = (e, restante) => (restante - base(e) < 1 ? num(restante) : base(e));

const ordem = (a, b) => (a.data || '').localeCompare(b.data || '') ||
  (a.criado_em || '').localeCompare(b.criado_em || '');

const ativosDa = fid => emprestimos().filter(e => e.funcionario_id === fid && e.situacao === 'ativo').sort(ordem);

/** Saldo em aberto da pessoa (todos os empréstimos ativos). */
export const abertoDe = fid => num(ativosDa(fid).reduce((s, e) => s + saldo(e), 0));

/**
 * A parcela que vale na competência: é do primeiro empréstimo da pessoa que
 * ainda tinha saldo ANTES dessa competência. Os outros esperam na fila.
 */
export function previstoEm(fid, competencia) {
  for (const e of ativosDa(fid)) {
    const antes = saldoBruto(e, competencia);
    if (antes <= 0.004) continue;
    if (e.primeira_comp > competencia) return null;
    const padrao = parcelaDe(e, antes);
    /* RN-80: recebendo do INSS (16º dia de afastamento em diante), a parcela
       do mês não é descontada — vai para o fim, como mês sem desconto. */
    const bloq = bloqueioInss(fid, competencia);
    if (bloq) return { emprestimo: e, saldoAntes: antes, padrao, ajuste: ajusteDe(e.id, competencia), valor: 0, bloqueado: bloq };
    const ajuste = ajusteDe(e.id, competencia);
    return { emprestimo: e, saldoAntes: antes, padrao, ajuste,
      valor: ajuste ? Math.min(num(ajuste.valor), antes) : padrao };
  }
  return null;
}

/** Os meses de cada parcela que falta, simulando a fila da pessoa. */
export function projecaoDa(fid) {
  const lista = ativosDa(fid);
  const resto = new Map(lista.map(e => [e.id, saldo(e)]));
  const atual = jd.competenciaAtual();
  // Se o mês corrente já foi abatido, a próxima parcela é do mês que vem.
  const jaAbateu = abatimentos().some(a => a.funcionario_id === fid && a.competencia === atual);
  let c = jaAbateu ? proxComp(atual) : atual;
  const saida = [];
  for (let i = 0; i < 480; i++) {
    const e = lista.find(x => resto.get(x.id) > 0.004);
    if (!e) break;
    if (e.primeira_comp > c) c = e.primeira_comp;
    if (bloqueioInss(fid, c)) { c = proxComp(c); continue; }   // RN-80: pula o mês
    const aj = ajusteDe(e.id, c);
    const v = aj ? Math.min(num(aj.valor), resto.get(e.id)) : parcelaDe(e, resto.get(e.id));
    saida.push({ emprestimo_id: e.id, competencia: c, valor: v, ajuste: aj });
    resto.set(e.id, num(resto.get(e.id) - v));
    c = proxComp(c);
  }
  return saida;
}

export function situacaoDe(e) {
  if (e.situacao !== 'ativo') return e.situacao;
  if (saldo(e) <= 0.004) return 'quitado';
  const antes = ativosDa(e.funcionario_id).filter(o => ordem(o, e) < 0 && saldo(o) > 0.004);
  return antes.length ? 'fila' : 'desconto';
}
const SIT = {
  desconto:   ['Em desconto', 'ativo'],
  fila:       ['Na fila', 'neutra'],
  aguardando: ['Aguardando liberação', 'alerta'],
  quitado:    ['Quitado', 'neutra'],
  cancelado:  ['Cancelado', 'neutra'],
  baixado:    ['Baixado como perda', 'perigo'],
  rescisao:   ['Descontar na rescisão', 'alerta'],
};
const tagSit = e => { const s = SIT[situacaoDe(e)] || [e.situacao, 'neutra']; return `<span class="tag ${s[1]}">${s[0]}</span>`; };

const MOTIVO_RN80 = 'Bloqueado: afastamento INSS a partir do 16º dia (RN-80) — a parcela vai para o fim';

const destinoDaPessoa = fid => jd.unidadeDe(jd.vinculoDe(fid))?.destino_id || null;

/* ===================================================================
   FECHAMENTO — a parcela do mês, por destino de DP
   =================================================================== */

/* Competência aberta para a pessoa: a atual, ou a seguinte se o DP dela já enviou. */
function competenciaAberta(fid) {
  let c = jd.competenciaAtual();
  const d = destinoDaPessoa(fid);
  for (let i = 0; i < 3 && d && jd.travada(c, d); i++) c = proxComp(c);
  return c;
}

export function linhasFechamento(competencia, destinoId) {
  const pessoas = [...new Set(emprestimos().map(e => e.funcionario_id))]
    .filter(fid => destinoDaPessoa(fid) === destinoId);
  return pessoas.map(fid => {
    const lancados = abatimentos().filter(a => a.funcionario_id === fid && a.competencia === competencia);
    const p = previstoEm(fid, competencia);
    if (!p && !lancados.length) return null;
    return { fid, nome: nomeDe(fid), previsto: lancados.length ? null : p, lancados };
  }).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O que vai para o escritório: o lançado, ou o previsto (com ajuste) se aberta. */
export function valorParaFolha(fid, competencia) {
  const lanc = abatimentos().filter(a => a.funcionario_id === fid && a.competencia === competencia);
  if (lanc.length) return num(lanc.reduce((s, a) => s + Number(a.valor), 0));
  return previstoEm(fid, competencia)?.valor || 0;
}

const efeito = (v, prev, saldoAntes) =>
  v > saldoAntes + 0.004 ? `<span class="jor-pend">Maior que o saldo (${brl(saldoAntes)}).</span>`
  : v <= 0.004 ? `Sem desconto neste mês: ${brl(prev)} vão para o fim.`
  : v < prev - 0.004 ? `Desconta ${brl(v)}; os ${brl(prev - v)} que faltam vão para o fim.`
  : v > prev + 0.004 ? 'Acima da parcela: antecipa a quitação.'
  : 'Desconta a parcela inteira.';

/** As linhas do mês de um destino, já no formato dos documentos. */
export function descontosDoMes(competencia, destinoId) {
  return linhasFechamento(competencia, destinoId).map(l => {
    if (l.lancados.length) {
      const a = l.lancados[0];
      const e = emprestimos().find(x => x.id === a.emprestimo_id);
      const v = num(l.lancados.reduce((s, x) => s + Number(x.valor), 0));
      return { fid: l.fid, nome: l.nome, emprestimo: e, previsto: num(a.previsto ?? v), valor: v,
        saldoAntes: e ? saldoBruto(e, competencia) : v, obs: a.justificativa || '', lancado: true };
    }
    const p = l.previsto;
    return { fid: l.fid, nome: l.nome, emprestimo: p.emprestimo, previsto: p.padrao, valor: p.valor,
      saldoAntes: p.saldoAntes, obs: p.bloqueado ? MOTIVO_RN80 : (p.ajuste?.justificativa || ''),
      ajustado: !!p.ajuste, bloqueado: !!p.bloqueado, lancado: false };
  });
}

export function blocoFechamento(competencia, destino, situacao) {
  const linhas = descontosDoMes(competencia, destino.id);
  if (!linhas.length) return '';
  const aberta = situacao === 'aberta' || situacao === 'reaberta';
  const total = num(linhas.reduce((s, l) => s + l.valor, 0));
  return `
    <h3 class="jor-h3">Empréstimo a descontar · ${esc(compLonga(competencia))}</h3>
    <table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>Empréstimo</th><th class="ce">Parcela prevista</th>
      <th class="ce">A descontar</th><th>O que acontece</th>${aberta ? '<th></th>' : ''}</tr></thead>
      <tbody>${linhas.map(l => `<tr>
        <td>${esc(l.nome)}</td>
        <td>${l.emprestimo ? numeroTxt(l.emprestimo) : '—'} <span class="dc-sem">saldo ${brl(l.saldoAntes)}</span></td>
        <td class="ce">${brl(l.previsto)}</td>
        <td class="ce"><b>${brl(l.valor)}</b>${l.bloqueado ? ' <span class="tag neutra">afastado</span>' : l.ajustado ? ' <span class="tag alerta">ajustado</span>' : ''}</td>
        <td class="dc-sem">${l.lancado ? 'baixado no envio' : l.bloqueado ? '' : efeito(l.valor, l.previsto, l.saldoAntes)}${l.obs ? `${l.bloqueado ? '' : '<br>'}${esc(l.obs)}` : ''}</td>
        ${aberta ? `<td class="ce">${l.lancado || l.bloqueado ? '' : `<button class="btn mini" type="button" data-ajustar="${l.fid}" data-comp="${competencia}">Ajustar</button>`}</td>` : ''}
      </tr>`).join('')}</tbody>
      <tfoot><tr class="jor-total"><td colspan="3">Total a descontar</td>
        <td class="ce">${brl(total)}</td><td colspan="${aberta ? 2 : 1}"></td></tr></tfoot></table>
    ${aberta ? `<p class="dc-sem jor-nota">Imprevisto? Use <b>Ajustar</b> para descontar menos (ou nada) neste mês — o que faltar vai
      para o fim. O saldo baixa quando a competência é enviada, e o valor sai no Relatório DP e na coluna
      <b>Empréstimo a descontar</b> do arquivo "Dados para a folha".</p>` : ''}`;
}

let redesenharFechamento = () => {};
export function ligarBlocoFechamento(aoMudar) {
  if (aoMudar) redesenharFechamento = aoMudar;
  document.querySelectorAll('[data-ajustar]').forEach(b =>
    b.addEventListener('click', () => dlgAjuste(b.dataset.ajustar, b.dataset.comp, redesenharFechamento)));
}

/** Confere antes do envio e devolve o que vai ser baixado. */
export function prepararAbatimentos(competencia, destinoId) {
  const itens = [];
  for (const l of linhasFechamento(competencia, destinoId).filter(x => x.previsto)) {
    if (l.previsto.valor > l.previsto.saldoAntes + 0.004)
      return { erro: `O desconto de ${l.nome} passa do saldo (${brl(l.previsto.saldoAntes)}). Ajuste antes de enviar.` };
    itens.push({ l, v: num(l.previsto.valor) });
  }
  return { itens };
}

export async function lancarAbatimentos(competencia, destinoId, prep) {
  for (const { l, v } of prep?.itens || []) {
    const p = l.previsto;
    const base = p.ajuste || {
      emprestimo_id: p.emprestimo.id, funcionario_id: l.fid, competencia,
      previsto: p.padrao, justificativa: p.bloqueado ? MOTIVO_RN80 : null, criado_por: usuario(), criado_em: agora(),
    };
    const a = { ...base, destino_id: destinoId, valor: v, situacao: 'lancado', criado_em: agora() };
    const g = await jd.salvar('abatimentos', a);
    await jd.registrar({ tabela: 'jor_emprestimo_abatimentos', registro_id: g.id,
      acao: p.ajuste ? 'update' : 'insert', antes: p.ajuste || null, depois: g, justificativa: a.justificativa });
  }
}

/* Reabrir a competência devolve ao saldo o que tinha sido baixado nela. Se o
   valor era um ajuste combinado, o ajuste volta a valer — ninguém precisa
   digitar de novo o "desconta só 200". */
export async function estornarAbatimentos(competencia, destinoId, motivo) {
  const lista = abatimentos().filter(a => a.competencia === competencia && a.destino_id === destinoId);
  for (const a of lista) {
    const novo = { ...a, situacao: 'estornado', estornado_por: usuario(), estornado_em: agora(), estorno_motivo: motivo };
    await jd.salvar('abatimentos', novo);
    await jd.registrar({ tabela: 'jor_emprestimo_abatimentos', registro_id: a.id, acao: 'update',
      antes: a, depois: novo, justificativa: motivo });
    if (a.justificativa && a.justificativa !== MOTIVO_RN80) {
      const { id, estornado_por, estornado_em, estorno_motivo, ...resto } = a;
      await jd.salvar('abatimentos', { ...resto, situacao: 'ajustado', criado_por: usuario(), criado_em: agora() });
    }
  }
}

/* Baixa manual: o valor combinado para um mês (menos que a parcela, ou nada).
   Fica gravado como "ajustado" e só baixa o saldo no envio da competência. */
function dlgAjuste(fid, competencia, depois) {
  const c = competencia || competenciaAberta(fid);
  const d = destinoDaPessoa(fid);
  if (d && jd.travada(c, d)) { avisar(`A competência de ${compLonga(c)} já foi enviada. Reabra no Fechamento para mudar o desconto.`); return; }
  const p = previstoEm(fid, c);
  if (!p) { avisar(`${nomeDe(fid)} não tem parcela prevista em ${compLonga(c)}.`); return; }
  if (p.bloqueado) { avisar(`${nomeDe(fid)} está afastado pelo INSS em ${compLonga(c)}: a parcela já não é descontada (RN-80) e vai para o fim.`); return; }
  dialogo(`<h3>Ajustar o desconto — ${esc(nomeDe(fid))}</h3>
    <p class="dc-sem">${numeroTxt(p.emprestimo)} · saldo ${brl(p.saldoAntes)} · parcela prevista de ${compLonga(c)}: <b>${brl(p.padrao)}</b>.
    O que não for descontado agora vai para o fim, como parcela a mais.</p>
    <div class="grade">
      <label class="campo">Descontar em ${esc(compLonga(c))}<input type="number" id="empAjValor" step="0.01" min="0" max="${p.saldoAntes}" value="${p.valor.toFixed(2)}"></label>
    </div>
    <p class="dc-sem" id="empAjEfeito">${efeito(p.valor, p.padrao, p.saldoAntes)}</p>
    ${campoJust('Motivo (obrigatório)')}
    ${rodapeDlg(`${p.ajuste ? '<button class="btn" type="button" id="empAjVoltar">Voltar ao previsto</button> ' : ''}<button class="btn principal" type="button" id="empOkDlg">Gravar ajuste</button>`)}`, () => {
    if (p.ajuste) $('empDlgJust').value = p.ajuste.justificativa || '';
    $('empAjValor').addEventListener('input', () => {
      $('empAjEfeito').innerHTML = efeito(Number($('empAjValor').value) || 0, p.padrao, p.saldoAntes);
    });
    $('empAjVoltar')?.addEventListener('click', async () => {
      const novo = { ...p.ajuste, situacao: 'descartado' };
      await jd.salvar('abatimentos', novo);
      await jd.registrar({ tabela: 'jor_emprestimo_abatimentos', registro_id: novo.id, acao: 'descartar', antes: p.ajuste, depois: novo });
      $('dlgEmp').close(); avisar('Ajuste desfeito: volta a valer a parcela prevista.', true); depois?.();
    });
    $('empOkDlg').addEventListener('click', async () => {
      const v = num($('empAjValor').value);
      if (v < 0 || v > p.saldoAntes + 0.004) { $('empDlgErro').textContent = `O valor vai de R$ 0,00 até o saldo (${brl(p.saldoAntes)}).`; return; }
      const j = exigeJust(); if (!j) return;
      const a = {
        ...(p.ajuste || { emprestimo_id: p.emprestimo.id, funcionario_id: fid, competencia: c }),
        destino_id: d, valor: v, previsto: p.padrao, justificativa: j, situacao: 'ajustado',
        criado_por: usuario(), criado_em: agora(),
      };
      const g = await jd.salvar('abatimentos', a);
      await jd.registrar({ tabela: 'jor_emprestimo_abatimentos', registro_id: g.id, acao: p.ajuste ? 'update' : 'ajuste',
        antes: p.ajuste || null, depois: g, justificativa: j });
      $('dlgEmp').close();
      avisar(`${nomeDe(fid)}: desconto de ${compLonga(c)} ajustado para ${brl(v)}. Vai assim para o Fechamento e o Relatório DP.`, true);
      depois?.();
    });
  });
}

/** Seção do Relatório DP: o desconto de empréstimo de cada pessoa no mês. */
export function secaoRelatorioDP(competencia, destinoId) {
  const linhas = descontosDoMes(competencia, destinoId).filter(l => l.valor > 0.004 || l.previsto > 0.004);
  if (!linhas.length) return '';
  const tot = num(linhas.reduce((s, l) => s + l.valor, 0));
  return `<h2 class="rel-unidade">Empréstimo a descontar<small>parcelas do mês, sem juros — autorizadas no recibo assinado (art. 462 da CLT)</small></h2>
    <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Empréstimo</th><th class="rel-num">Parcela prevista</th>
      <th class="rel-num">A descontar</th><th class="rel-num">Saldo depois</th><th>Observação</th></tr></thead>
    <tbody>${linhas.map(l => `<tr><td>${esc(l.nome)}</td><td>${l.emprestimo ? numeroTxt(l.emprestimo) : '—'}</td>
      <td class="rel-num">${brl(l.previsto)}</td><td class="rel-num">${brl(l.valor)}</td>
      <td class="rel-num">${brl(Math.max(0, l.saldoAntes - l.valor))}</td>
      <td class="rel-mini">${esc(l.obs || (l.valor < l.previsto - 0.004 ? 'restante vai para o fim' : ''))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">Total a descontar — ${linhas.length} pessoa(s)</td><td class="rel-num">${brl(tot)}</td><td colspan="2"></td></tr></tfoot></table>`;
}

/* ===================================================================
   PAINEL DO DP — o resumo que aparece na tela de abertura
   =================================================================== */

export function resumoPainel() {
  if (!podeVerEmprestimo()) return null;
  const l = emprestimos();
  return {
    saldo: num(l.reduce((s, e) => s + saldo(e), 0)),
    desconto: l.filter(e => situacaoDe(e) === 'desconto').length,
    fila: l.filter(e => situacaoDe(e) === 'fila').length,
    aguardando: l.filter(e => e.situacao === 'aguardando').length,
    brl,
  };
}

/* ===================================================================
   DOCUMENTOS — recibo em duas vias, extrato, "quem deve quanto"
   =================================================================== */

function extenso(valor) {
  const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze',
    'quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const d = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const c = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  const ate999 = n => {
    if (n === 100) return 'cem';
    const p = [];
    if (n >= 100) { p.push(c[Math.floor(n / 100)]); n %= 100; }
    if (n >= 20) { p.push(d[Math.floor(n / 10)]); n %= 10; }
    if (n > 0) p.push(u[n]);
    return p.join(' e ');
  };
  const inteiro = n => {
    if (n === 0) return 'zero';
    const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000;
    const p = [];
    if (mi) p.push(mi === 1 ? 'um milhão' : ate999(mi) + ' milhões');
    if (mil) p.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (r) p.push(ate999(r));
    return p.length > 1 && (r < 100 || r % 100 === 0) && r
      ? p.slice(0, -1).join(' ') + ' e ' + p[p.length - 1] : p.join(' ');
  };
  const reais = Math.floor(valor + 1e-9), cent = Math.round((valor - reais) * 100);
  const partes = [];
  if (reais) partes.push(`${inteiro(reais)}${reais % 1e6 === 0 && reais >= 1e6 ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  if (cent) partes.push(`${inteiro(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return partes.join(' e ') || 'zero real';
}

function cabecalhoDoc(titulo, sub, direita) {
  return `<header class="rel-cabecalho">
    <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
    <div class="rel-comp">${direita}</div></header>`;
}
const rodapeLop = (frase = true) => `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP">${
  frase ? '<span class="rel-lop">Inteligência para o agronegócio</span>' : ''}</footer>`;

export function reciboHTML(e, reimpressao = false) {
  const f = pessoa(e.funcionario_id) || {};
  const vs = valoresParcelas(Number(e.valor), e.parcelas);
  const proj = projecaoDa(e.funcionario_id).filter(p => p.emprestimo_id === e.id);
  const fila = situacaoDe(e) === 'fila';
  const inicio = fila
    ? `após quitar o empréstimo anterior${proj[0] ? ` (previsão: ${compLonga(proj[0].competencia)})` : ''}`
    : compLonga(proj[0]?.competencia || e.primeira_comp);
  const parc = vs[0] === vs[vs.length - 1] ? `${e.parcelas} × ${brl(vs[0])}` : `${e.parcelas} × ${brl(vs[0])} (última ${brl(vs[vs.length - 1])})`;
  const empresa = f.empregador || 'SAKUMA Agronegócios';
  const via = qual => `<article class="rel rel-via">
    ${reimpressao ? `<div class="rel-tarja">2ª VIA — reimpressão em ${dataBR(hoje())} por ${esc(usuario() || '')}</div>` : ''}
    ${cabecalhoDoc('Recibo de empréstimo', `${numeroTxt(e)} · ${qual}`, `data<strong>${dataBR(e.data)}</strong>`)}
    <div class="rel-ficha">
      <div><span>Funcionário</span><b>${esc(f.nome || '—')}</b></div>
      <div><span>CPF</span><b>${esc(cpfBR(f.cpf))}</b></div>
      <div><span>Fazenda</span><b>${esc(f.fazenda || '—')}</b></div>
      <div><span>Valor recebido</span><b>${brl(e.valor)}</b></div>
      <div><span>Parcelas</span><b>${parc}</b></div>
      <div><span>Início do desconto</span><b>${esc(inicio)}</b></div>
    </div>
    <p>Declaro que recebi de <b>${esc(empresa)}</b> a quantia de <b>${brl(e.valor)}</b> (${esc(extenso(Number(e.valor)))}),
    a título de empréstimo, <b>sem juros e sem correção</b>, e autorizo o desconto no meu pagamento nas parcelas
    indicadas, conforme o art. 462 da CLT. Em caso de desligamento, autorizo o desconto do saldo nas verbas
    rescisórias, no limite da lei.${e.motivo ? ` Motivo informado: ${esc(e.motivo)}.` : ''}</p>
    ${e.liberado_por ? `<p class="rel-nota">Liberado acima do teto de ${TETO_PERC}% do salário pelo administrador: ${esc(e.justificativa_teto || '')}</p>` : ''}
    <div class="rel-assinaturas">
      <div class="rel-assina"><span></span><small>${esc(f.nome || 'Funcionário')}</small></div>
      <div class="rel-assina"><span></span><small>${esc(empresa)}</small></div>
    </div>
    ${rodapeLop(false)}</article>`;
  return `<div class="rel-duasvias">${via('via da empresa')}<hr class="rel-corte">${via('via do funcionário')}</div>`;
}

/* Conta corrente da pessoa: todos os movimentos de todos os empréstimos numa
   linha do tempo só, com o saldo acumulado — como o extrato do banco.
   Empréstimo entra como débito (a pessoa passa a dever); abatimento, baixa e
   cancelamento entram como crédito. Estorno devolve o que tinha sido abatido. */
export function movimentosDa(fid) {
  const movs = [];
  const lista = emprestimos().filter(e => e.funcionario_id === fid && e.situacao !== 'aguardando');
  for (const e of lista) {
    const n = numeroTxt(e);
    movs.push({ quando: e.data, ordem: 0, emp: e, debito: Number(e.valor), credito: 0,
      historico: `${n} · ${e.origem === 'importado' ? 'saldo trazido da planilha' : `empréstimo em ${e.parcelas}×`}${e.motivo && e.origem !== 'importado' ? ` — ${e.motivo}` : ''}` });
    (jd.dados.abatimentos || []).filter(a => a.emprestimo_id === e.id && ['lancado', 'estornado'].includes(a.situacao)).forEach(a => {
      const lancado = (a.criado_em || a.competencia).slice(0, 10);
      movs.push({ quando: lancado, ordem: 1, emp: e, debito: 0, credito: Number(a.valor),
        historico: `${n} · ${Number(a.valor) ? 'parcela abatida' : 'mês sem desconto'} de ${compCurta(a.competencia)}${a.justificativa ? ` — ${a.justificativa}` : ''}` });
      if (a.situacao === 'estornado') movs.push({ quando: (a.estornado_em || lancado).slice(0, 10), ordem: 2, emp: e,
        debito: Number(a.valor), credito: 0, historico: `${n} · estorno da parcela de ${compCurta(a.competencia)} — ${a.estorno_motivo || 'reabertura'}` });
    });
    const quando = (e.encerrado_em || e.data).slice(0, 10);
    if (e.situacao === 'cancelado') movs.push({ quando, ordem: 3, emp: e, debito: 0, credito: Number(e.valor),
      historico: `${n} · ${e.encerramento_motivo || 'cancelado'}` });
    if (e.situacao === 'baixado') movs.push({ quando, ordem: 3, emp: e, debito: 0, credito: Math.max(0, saldoBruto(e)),
      historico: `${n} · baixado como perda no desligamento` });
    if (e.situacao === 'rescisao') movs.push({ quando, ordem: 3, emp: e, debito: 0, credito: 0,
      historico: `${n} · desligado — ${brl(Math.max(0, saldoBruto(e)))} a descontar na rescisão` });
  }
  movs.sort((a, b) => a.quando.localeCompare(b.quando) || a.ordem - b.ordem || ordem(a.emp, b.emp));
  let acum = 0;
  movs.forEach(m => { acum = num(acum + m.debito - m.credito); m.saldo = acum; });
  return movs;
}

export function resumoDa(fid) {
  const lista = emprestimos().filter(e => e.funcionario_id === fid && !['aguardando', 'cancelado'].includes(e.situacao));
  const emprestado = num(lista.reduce((s, e) => s + Number(e.valor), 0));
  const abatido = num(lista.reduce((s, e) => s + abatidoDe(e), 0));
  const rescisao = num(lista.filter(e => e.situacao === 'rescisao').reduce((s, e) => s + Math.max(0, saldoBruto(e)), 0));
  return { emprestado, abatido, aberto: abertoDe(fid), rescisao, proxima: projecaoDa(fid)[0] || null,
    aguardando: emprestimos().filter(e => e.funcionario_id === fid && e.situacao === 'aguardando') };
}

function extratoHTML(fid) {
  const f = pessoa(fid) || {};
  const movs = movimentosDa(fid), r = resumoDa(fid), proj = projecaoDa(fid);
  const numDe = id => numeroTxt(emprestimos().find(e => e.id === id) || {});
  return `<article class="rel">
    ${cabecalhoDoc('Extrato da conta corrente', f.nome || '—', `posição em<strong>${dataBR(hoje())}</strong>`)}
    <div class="rel-ficha">
      <div><span>Funcionário</span><b>${esc(f.nome || '—')}</b></div>
      <div><span>CPF</span><b>${esc(cpfBR(f.cpf))}</b></div>
      <div><span>Fazenda</span><b>${esc(f.fazenda || '—')}</b></div>
      <div><span>Total emprestado</span><b>${brl(r.emprestado)}</b></div>
      <div><span>Já abatido</span><b>${brl(r.abatido)}</b></div>
      <div><span>Saldo em aberto</span><b>${brl(r.aberto + r.rescisao)}</b></div>
    </div>
    <div class="rel-secao">Movimentos</div>
    <table class="rel-tabela"><thead><tr><th>Data</th><th>Histórico</th><th class="rel-num">Débito</th>
      <th class="rel-num">Crédito</th><th class="rel-num">Saldo</th></tr></thead>
    <tbody>${movs.map(m => `<tr><td>${dataBR(m.quando)}</td><td>${esc(m.historico)}</td>
      <td class="rel-num">${m.debito ? brl(m.debito) : ''}</td><td class="rel-num">${m.credito ? brl(m.credito) : ''}</td>
      <td class="rel-num">${brl(m.saldo)}</td></tr>`).join('') || '<tr><td colspan="5" class="rel-vazio">Nenhum movimento.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Saldo atual</td><td class="rel-num">${brl(movs.length ? movs[movs.length - 1].saldo : 0)}</td></tr></tfoot></table>
    ${proj.length ? `<div class="rel-secao">Parcelas a vencer</div>
    <table class="rel-tabela"><thead><tr><th>Competência</th><th>Empréstimo</th><th class="rel-num">Valor</th></tr></thead>
    <tbody>${proj.map(p => `<tr><td>${compLonga(p.competencia)}</td><td>${numDe(p.emprestimo_id)}</td><td class="rel-num">${brl(p.valor)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">Total a vencer</td><td class="rel-num">${brl(proj.reduce((s, p) => s + p.valor, 0))}</td></tr></tfoot></table>` : ''}
    <p class="rel-nota">Sem juros e sem correção. As parcelas a vencer são previsão: mês sem desconto ou desconto parcial empurra o que faltou para o fim.</p>
    ${rodapeLop()}</article>`;
}

function devedores() {
  const l = emprestimos().filter(e => ['desconto', 'fila'].includes(situacaoDe(e)) || e.situacao === 'rescisao');
  const grupos = {};
  l.forEach(e => {
    const f = pessoa(e.funcionario_id);
    const faz = f?.fazenda || 'Sem fazenda no cadastro';
    ((grupos[faz] ||= {})[e.funcionario_id] ||= []).push(e);
  });
  return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}
const saldoLinha = e => e.situacao === 'rescisao' ? Math.max(0, saldoBruto(e)) : saldo(e);

/* Extrato geral: uma linha por pessoa que deve, agrupada por fazenda. */
export function linhasDevedores() {
  const ids = [...new Set(devedores().flatMap(([, ps]) => Object.keys(ps)))];
  return ids.map(fid => {
    const f = pessoa(fid) || {};
    const r = resumoDa(fid), proj = projecaoDa(fid);
    const es = emprestimos().filter(e => e.funcionario_id === fid && (['desconto', 'fila'].includes(situacaoDe(e)) || e.situacao === 'rescisao'));
    return { fid, nome: f.nome || '—', cpf: f.cpf, fazenda: f.fazenda || 'Sem fazenda no cadastro',
      emprestimos: es, emprestado: r.emprestado, abatido: r.abatido, saldo: num(r.aberto + r.rescisao),
      rescisao: r.rescisao, proxima: proj[0] || null, restantes: proj.length };
  }).sort((a, b) => a.fazenda.localeCompare(b.fazenda, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function devedoresHTML() {
  const l = linhasDevedores();
  const tot = num(l.reduce((s, x) => s + x.saldo, 0));
  const fazendas = [...new Set(l.map(x => x.fazenda))];
  const prox = num(l.reduce((s, x) => s + (x.proxima?.valor || 0), 0));
  return `<article class="rel">
    ${cabecalhoDoc('Extrato geral de empréstimos', 'Todos os funcionários que devem, por fazenda', `posição em<strong>${dataBR(hoje())}</strong>`)}
    <div class="rel-ficha">
      <div><span>Saldo em aberto</span><b>${brl(tot)}</b></div>
      <div><span>Funcionários devendo</span><b>${l.length}</b></div>
      <div><span>Próximas parcelas</span><b>${brl(prox)}</b></div>
    </div>
    ${fazendas.map(faz => {
      const g = l.filter(x => x.fazenda === faz);
      return `<div class="rel-secao">${esc(faz)}</div>
      <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Empréstimos</th><th class="rel-num">Emprestado</th>
        <th class="rel-num">Abatido</th><th class="rel-num">Saldo</th><th>Próxima parcela</th><th class="rel-num">Faltam</th></tr></thead>
      <tbody>${g.map(x => `<tr><td>${esc(x.nome)}</td><td>${x.emprestimos.map(numeroTxt).join(', ')}</td>
        <td class="rel-num">${brl(x.emprestado)}</td><td class="rel-num">${brl(x.abatido)}</td><td class="rel-num">${brl(x.saldo)}</td>
        <td>${x.proxima ? `${brl(x.proxima.valor)} · ${compCurta(x.proxima.competencia)}${x.proxima.ajuste ? ' (ajustado)' : ''}`
          : x.rescisao ? 'descontar na rescisão' : '—'}</td>
        <td class="rel-num">${x.restantes || '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Subtotal ${esc(faz)}</td><td class="rel-num">${brl(g.reduce((s, x) => s + x.saldo, 0))}</td><td colspan="2"></td></tr></tfoot></table>`;
    }).join('') || '<p class="rel-vazio">Ninguém deve nada hoje.</p>'}
    <table class="rel-tabela"><tfoot><tr><td>Total geral em aberto</td><td class="rel-num">${brl(tot)}</td></tr></tfoot></table>
    <p class="rel-nota">Sem juros e sem correção. "Faltam" é o número de parcelas previstas; mês sem desconto ou desconto parcial empurra para o fim.</p>
    <p class="rel-nota">Emitido por Guilherme Lopes · Gerente Administrativo</p>
    ${rodapeLop()}</article>`;
}

export function devedoresCSV() {
  const cols = ['Fazenda', 'Funcionario', 'CPF', 'Emprestimos', 'Emprestado', 'Abatido', 'Saldo', 'Proxima parcela', 'Competencia', 'Parcelas restantes'];
  const v = x => Number(x || 0).toFixed(2).replace('.', ',');
  const linhas = linhasDevedores().map(x => [x.fazenda, x.nome, cpfBR(x.cpf), x.emprestimos.map(numeroTxt).join(' '),
    v(x.emprestado), v(x.abatido), v(x.saldo), x.proxima ? v(x.proxima.valor) : '', x.proxima ? compCurta(x.proxima.competencia) : '', x.restantes]);
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  return { nome: `Emprestimos_extrato_geral_${hoje()}.csv`,
    conteudo: '﻿' + [cols, ...linhas].map(l => l.map(q).join(';')).join('\r\n') };
}

/* Prévia no #jorImpressao, igual aos outros documentos do app. */
let barraAtual = null;
function mostrarDoc(html, barraId) {
  const alvo = $('jorImpressao');
  alvo.innerHTML = html;
  alvo.hidden = false;
  if (barraAtual && barraAtual !== barraId && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = barraId;
  if ($(barraId)) $(barraId).hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function fecharDocEmprestimo() {
  if (barraAtual && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = null;
}
function fecharPrevia() {
  const alvo = $('jorImpressao');
  alvo.innerHTML = ''; alvo.hidden = true;
  fecharDocEmprestimo();
}
function imprimirDoc() {
  document.body.classList.add('jor-imprimindo');
  const soltar = () => { document.body.classList.remove('jor-imprimindo'); removeEventListener('afterprint', soltar); };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);
}
export function baixarCSV({ nome, conteudo }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8;' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
/* A barra fica num <div> sem classe: .jor-acoes tem display:flex, que passa
   por cima do atributo hidden e deixaria o botão Imprimir sempre à mostra. */
const barraDoc = id => `<div id="${id}" hidden><div class="jor-acoes">
  <button class="btn principal" type="button" data-doc-imprimir>Imprimir / salvar em PDF</button>
  <button class="btn mini" type="button" data-doc-fechar>Fechar prévia</button></div></div>`;
function ligarBarraDoc(raiz) {
  raiz.querySelectorAll('[data-doc-imprimir]').forEach(b => b.addEventListener('click', imprimirDoc));
  raiz.querySelectorAll('[data-doc-fechar]').forEach(b => b.addEventListener('click', fecharPrevia));
}

/* ===================================================================
   TELAS
   =================================================================== */

let avisar = () => {};
let irPara = () => {};
const est = { busca: '', buscaSal: '', filtro: 'aberto', pessoa: '*', importar: false };
const focarNoFim = el => { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {} };

function cabecalho(titulo, sub) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">empréstimo<strong class="jor-cabecalho__competencia">sem juros</strong></div></header>`;
}

export async function abrirEmprestimo(tela) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados: ' + e.message); }
  }
  if (tela === 'empEmissao') desenharEmissao();
  if (tela === 'empRecibos') desenharRecibos();
  if (tela === 'empHistorico') desenharHistorico();
  if (tela === 'empSalarios') desenharSalarios();
}

/* ---------------- Emissão recibo ---------------- */

const tetoCache = new Map();
async function tetoDe(fid, data) {
  const meus = (jd.dados.salarios || []).filter(s => s.funcionario_id === fid && s.desde <= data)
    .sort((a, b) => b.desde.localeCompare(a.desde) || (b.criado_em || '').localeCompare(a.criado_em || ''));
  if (meus.length) return { teto: num(meus[0].valor * TETO_PERC / 100), salario: Number(meus[0].valor), desde: meus[0].desde };
  const k = fid + '|' + data;
  if (tetoCache.has(k)) return tetoCache.get(k);
  if (!estado.cliente || !estado.sessao || !navigator.onLine) return { teto: null, offline: true };
  const { data: v, error } = await estado.cliente.rpc('jor_teto_emprestimo', { fid, d: data });
  const r = error ? { teto: null, erro: error.message } : { teto: v == null ? null : Number(v) };
  tetoCache.set(k, r);
  return r;
}

function desenharEmissao() {
  const lista = ativos();
  const mesQueVem = proxComp(comp(hoje())).slice(0, 7);
  $('telaEmpEmissao').innerHTML = cabecalho('Emissão de recibo', 'Parcelas iguais, sem juros · teto de ' + TETO_PERC + '% do salário') + `
    <div class="jor-corpo jor-duas">
      <form id="empForm" class="jor-form" autocomplete="off">
        <label>Funcionário
          <select id="empFunc" required><option value=""></option>
            ${lista.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
        <label class="jor-inline"><input type="checkbox" id="empImportar" ${est.importar ? 'checked' : ''}>
          Saldo trazido da planilha (implantação — sem recibo e sem teto)</label>
        <div class="jor-linha">
          <label>Data <input type="date" id="empData" value="${hoje()}" required></label>
          <label><span id="empRotValor">Valor</span> <input type="number" id="empValor" min="0.01" step="0.01" required></label>
          <label><span id="empRotParc">Parcelas</span> <input type="number" id="empParc" min="1" step="1" value="1" required></label>
        </div>
        <div class="jor-linha">
          <label><span id="empRotPrim">Primeiro desconto</span> <input type="month" id="empPrim" value="${mesQueVem}" required></label>
          <label>Motivo <small class="dc-sem">opcional</small><input type="text" id="empMotivo" maxlength="120" placeholder="Ex.: conserto da moto"></label>
        </div>
        <div id="empJustBox" hidden><label>Justificativa para liberar acima do teto (obrigatória)
          <input type="text" id="empJust" maxlength="200"></label></div>
        <div class="jor-acoes">
          <button type="submit" class="btn principal" id="empOk" disabled>Lançar e emitir recibo</button>
          <button type="button" class="btn mini" id="empLimpar">Limpar</button>
        </div>
        ${barraDoc('empBarraRecibo')}
      </form>
      <aside class="jor-apurado" id="empResumo"><div class="vazio">Escolha o funcionário e o valor.</div></aside>
    </div>`;

  const f = $('empForm');
  ['empFunc', 'empData', 'empValor', 'empParc', 'empPrim', 'empImportar'].forEach(id =>
    $(id).addEventListener('input', calcular));
  $('empImportar').addEventListener('change', () => { est.importar = $('empImportar').checked; calcular(); });
  $('empLimpar').addEventListener('click', () => { f.reset(); $('empPrim').value = mesQueVem; fecharPrevia(); calcular(); });
  f.addEventListener('submit', gravarEmissao);
  ligarBarraDoc($('telaEmpEmissao'));
  calcular();
}

let ultimoCalculo = null;
let seqCalculo = 0;
async function calcular() {
  const imp = $('empImportar').checked;
  $('empRotValor').textContent = imp ? 'Saldo atual' : 'Valor';
  $('empRotParc').textContent = imp ? 'Parcelas restantes' : 'Parcelas';
  $('empRotPrim').textContent = imp ? 'Próxima parcela' : 'Primeiro desconto';
  const fid = $('empFunc').value, data = $('empData').value;
  const v = num($('empValor').value), n = Math.max(1, Math.floor(Number($('empParc').value) || 1));
  const prim = ($('empPrim').value || '') + '-01';
  const alvo = $('empResumo'), ok = $('empOk');
  ultimoCalculo = null;
  if (!fid || !data) { alvo.innerHTML = '<div class="vazio">Escolha o funcionário e o valor.</div>'; ok.disabled = true; return; }

  const eu = ++seqCalculo;
  const t = imp ? { teto: null } : await tetoDe(fid, data);
  if (eu !== seqCalculo) return;   // chegou resposta de um cálculo velho

  const aberto = abertoDe(fid), soma = num(aberto + v);
  const semTeto = !imp && t.teto == null;
  const estoura = !imp && (semTeto || soma > t.teto + 0.004);
  const fila = ativosDa(fid).some(e => saldo(e) > 0.004);
  const semVinculo = !destinoDaPessoa(fid);
  const pl = v ? valoresParcelas(v, n) : [];
  let c = prim;

  const tetoHtml = imp ? `<h4>Saldo trazido da planilha</h4><p class="dc-sem" style="margin:0">Uma vez só, na implantação.
      Não sai recibo e o teto não é conferido. Informe o saldo de hoje, as parcelas que faltam e o mês da próxima.</p>`
    : semTeto ? `<h4>Teto de ${TETO_PERC}% do salário</h4>
      <div class="jor-caixa alerta" style="margin:0">${t.offline ? 'Sem rede: não dá para conferir o teto agora.'
        : 'Sem salário base cadastrado para esta pessoa — o app não calcula o teto.'}
        ${acesso.admin ? ' Como administrador, você pode liberar com justificativa.' : ' O lançamento vai para a liberação do administrador.'}
        ${podeTela('empSalarios') ? '<br><button class="btn mini" type="button" id="empIrSal" style="margin:8px 0 0">Cadastrar salário base</button>' : ''}</div>`
    : `<h4>Teto de ${TETO_PERC}% do salário</h4>
      <dl class="jor-apurado__grade">
        ${t.salario ? `<dt>Salário base (desde ${dataBR(t.desde)})</dt><dd>${brl(t.salario)}</dd>` : ''}
        <dt>Teto</dt><dd>${brl(t.teto)}</dd>
        <dt>Saldo em aberto hoje</dt><dd>${brl(aberto)}</dd>
        <dt>Este empréstimo</dt><dd>${brl(v)}</dd>
        <dt>Soma</dt><dd class="${estoura ? 'jor-pend' : ''}">${brl(soma)}</dd>
      </dl>
      ${estoura ? `<p class="jor-avisos" style="list-style:none;padding:0">Passa do teto em ${brl(soma - t.teto)}.</p>` : ''}`;

  alvo.innerHTML = tetoHtml + (pl.length ? `
    <h4 style="margin-top:14px">Parcelas</h4>
    <table class="dc-planilha"><thead><tr><th>Parcela</th><th>Competência</th><th class="ce">Valor</th></tr></thead><tbody>
      ${pl.map((x, i) => { const r = `<tr><td>${i + 1}ª</td><td>${fila ? (i ? '…' : 'após quitar o anterior') : compCurta(c)}</td>
        <td class="ce">${brl(x)}</td></tr>`; c = proxComp(c); return r; }).join('')}
    </tbody><tfoot><tr class="jor-total"><td colspan="2">Total</td><td class="ce">${brl(pl.reduce((s, x) => s + x, 0))}</td></tr></tfoot></table>` : '') +
    `<ul class="jor-avisos">
      ${fila ? `<li>Já tem empréstimo em aberto (${brl(aberto)}). Este entra na fila e começa no mês seguinte à quitação do anterior — o recibo diz isso, sem cravar o mês.</li>` : ''}
      ${semVinculo ? '<li>Sem unidade no cadastro: a parcela só aparece no fechamento depois que a pessoa tiver unidade (Cadastro · Nível 1).</li>' : ''}
      ${n > 12 ? '<li>Mais de 12 parcelas. É só um aviso.</li>' : ''}
    </ul>`;
  $('empIrSal')?.addEventListener('click', () => irPara('empSalarios'));

  const precisaJust = estoura && acesso.admin;
  $('empJustBox').hidden = !precisaJust;
  ok.disabled = !v || v <= 0 || !$('empPrim').value;
  ok.textContent = imp ? 'Gravar saldo trazido'
    : !estoura ? 'Lançar e emitir recibo'
    : acesso.admin ? 'Liberar acima do teto e emitir recibo' : 'Enviar para liberação do administrador';
  ok.className = 'btn principal';
  ultimoCalculo = { fid, data, v, n, prim, imp, estoura, teto: t.teto };
}

async function gravarEmissao(ev) {
  ev.preventDefault();
  const k = ultimoCalculo;
  if (!k || !k.v) return;
  const just = $('empJust').value.trim();
  if (k.estoura && acesso.admin && just.length < 5) { $('empJust').focus(); avisar('Escreva a justificativa para liberar acima do teto.'); return; }

  const e = {
    numero: Math.max(0, ...emprestimos().map(x => x.numero || 0)) + 1,
    funcionario_id: k.fid, data: k.data, valor: k.v, parcelas: k.n, primeira_comp: k.prim,
    origem: k.imp ? 'importado' : 'concessao',
    situacao: k.estoura && !acesso.admin ? 'aguardando' : 'ativo',
    motivo: $('empMotivo').value.trim() || (k.imp ? 'Saldo trazido da planilha na implantação' : null),
    teto: k.teto,
    justificativa_teto: k.estoura && acesso.admin ? just : null,
    liberado_por: k.estoura && acesso.admin ? usuario() : null,
    liberado_em: k.estoura && acesso.admin ? agora() : null,
    reimpressoes: 0, criado_por: usuario(), criado_em: agora(),
  };
  const g = await jd.salvar('emprestimos', e);
  await jd.registrar({ tabela: 'jor_emprestimos', registro_id: g.id, acao: 'insert', depois: g, justificativa: e.justificativa_teto });

  const nome = nomeDe(k.fid);
  $('empForm').reset(); $('empPrim').value = proxComp(comp(hoje())).slice(0, 7);
  $('empImportar').checked = est.importar;
  await calcular();
  if (e.situacao === 'aguardando') {
    avisar(`${numeroTxt(g)} de ${nome} passou do teto e foi para a liberação do administrador. O recibo sai depois de liberado.`, true);
    return;
  }
  if (e.origem === 'importado') { avisar(`Saldo de ${nome} gravado (${numeroTxt(g)}).`, true); return; }
  avisar(`${numeroTxt(g)} lançado para ${nome}. Confira o recibo e imprima as duas vias.`, true);
  mostrarDoc(reciboHTML(g), 'empBarraRecibo');
}

/* ---------------- Recibos emitidos ---------------- */

function desenharRecibos() {
  const aguardando = emprestimos().filter(e => e.situacao === 'aguardando').sort(ordem);
  const b = est.busca.toLowerCase();
  const filtros = {
    aberto: e => ['desconto', 'fila'].includes(situacaoDe(e)),
    todos: () => true,
    quitado: e => situacaoDe(e) === 'quitado',
    encerrado: e => ['cancelado', 'baixado', 'rescisao'].includes(e.situacao),
  };
  const lista = emprestimos()
    .filter(e => e.situacao !== 'aguardando' && filtros[est.filtro](e))
    .filter(e => !b || nomeDe(e.funcionario_id).toLowerCase().includes(b) || numeroTxt(e).toLowerCase().includes(b))
    .sort((x, y) => ordem(y, x));

  $('telaEmpRecibos').innerHTML = cabecalho('Recibos emitidos', 'Reimprimir, cancelar e registrar desligamento') + `
    <div class="jor-corpo">
      ${aguardando.length ? `<h3 class="jor-h3">Aguardando liberação · acima do teto</h3>
      <div class="jor-caixa alerta">${acesso.admin ? 'Libere ou recuse com justificativa. O recibo só sai depois de liberado.'
        : 'Só o administrador decide — o banco também recusa a liberação feita por outro login.'}</div>
      <table class="dc-planilha"><thead><tr><th>Funcionário</th><th class="ce">Valor</th><th class="ce">Aberto + novo</th>
        <th class="ce">Teto</th><th>Pedido</th><th></th></tr></thead><tbody>
        ${aguardando.map(e => `<tr><td>${esc(nomeDe(e.funcionario_id))}<br><span class="dc-sem">${numeroTxt(e)} · ${dataBR(e.data)} por ${esc(e.criado_por || '—')}</span></td>
          <td class="ce">${brl(e.valor)} <span class="dc-sem">em ${e.parcelas}×</span></td>
          <td class="ce jor-pend">${brl(abertoDe(e.funcionario_id) + Number(e.valor))}</td>
          <td class="ce">${e.teto == null ? 'sem salário' : brl(e.teto)}</td>
          <td class="dc-sem">${esc(e.motivo || '—')}</td>
          <td class="ce">${acesso.admin ? `<button class="btn mini perigo" data-recusar="${e.id}">Recusar</button>
            <button class="btn mini" data-liberar="${e.id}">Liberar</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : ''}

      <div class="jor-barra" style="margin-top:${aguardando.length ? 18 : 0}px">
        <input id="empBusca" type="search" placeholder="Buscar por funcionário ou nº (EF-0001)" value="${esc(est.busca)}">
        <select id="empFiltro" class="dc-mini" style="max-width:190px">
          ${[['aberto', 'Em aberto'], ['todos', 'Todos'], ['quitado', 'Quitados'], ['encerrado', 'Cancelados e baixados']]
            .map(([k, r]) => `<option value="${k}" ${est.filtro === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <span class="dc-sem">${lista.length} empréstimo(s)</span>
      </div>
      ${lista.length ? `<table class="dc-planilha"><thead><tr><th>Nº</th><th>Funcionário</th><th>Data</th>
        <th class="ce">Valor</th><th class="ce">Parcelas</th><th class="ce">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map(e => `<tr><td>${numeroTxt(e)}${e.origem === 'importado' ? '<br><span class="dc-sem">da planilha</span>' : ''}</td>
          <td>${esc(nomeDe(e.funcionario_id))}</td><td>${dataBR(e.data)}</td>
          <td class="ce">${brl(e.valor)}</td><td class="ce">${e.parcelas}</td><td class="ce">${brl(saldoLinha(e))}</td>
          <td>${tagSit(e)}</td><td class="ce"><button class="btn mini" data-abrir="${e.id}">Abrir</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhum empréstimo nesta lista.</div>'}
      ${barraDoc('empBarraRecibos')}
    </div>`;

  $('empBusca').addEventListener('input', ev => { est.busca = ev.target.value; desenharRecibos(); focarNoFim($('empBusca')); });
  $('empFiltro').addEventListener('change', ev => { est.filtro = ev.target.value; desenharRecibos(); });
  document.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => detalhe(b.dataset.abrir)));
  document.querySelectorAll('[data-liberar]').forEach(b => b.addEventListener('click', () => liberar(b.dataset.liberar)));
  document.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', () => recusar(b.dataset.recusar)));
  ligarBarraDoc($('telaEmpRecibos'));
}

/* Diálogo único do submódulo: o conteúdo muda conforme a ação. */
function dialogo(html, aoAbrir) {
  const d = $('dlgEmp');
  $('dlgEmpCorpo').innerHTML = html;
  $('dlgEmpCorpo').querySelectorAll('[data-emp-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  aoAbrir?.();
}
const campoJust = (rot = 'Justificativa (obrigatória)') =>
  `<div class="grade"><label class="campo plena">${rot}<textarea id="empDlgJust" rows="2" maxlength="300"></textarea></label></div>`;
function exigeJust() {
  const v = ($('empDlgJust')?.value || '').trim();
  if (v.length < 5) { $('empDlgJust').focus(); $('empDlgErro').textContent = 'Escreva a justificativa (pelo menos 5 letras).'; return null; }
  return v;
}
const rodapeDlg = botoes => `<p class="jor-pend" id="empDlgErro" style="margin:8px 0 0"></p>
  <div class="barra entre"><span></span><span><button class="btn" type="button" data-emp-fechar>Voltar</button> ${botoes}</span></div>`;

function detalhe(id) {
  const e = emprestimos().find(x => x.id === id);
  if (!e) return;
  const s = situacaoDe(e);
  const abats = (jd.dados.abatimentos || []).filter(a => a.emprestimo_id === e.id && ['lancado', 'estornado'].includes(a.situacao))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  const temAbat = abats.some(a => a.situacao === 'lancado');
  const proj = projecaoDa(e.funcionario_id).filter(p => p.emprestimo_id === e.id);
  dialogo(`<h3>${numeroTxt(e)} · ${esc(nomeDe(e.funcionario_id))}</h3>
    <p class="dc-sem">${e.origem === 'importado' ? 'Saldo trazido da planilha em' : 'Concedido em'} ${dataBR(e.data)} por ${esc(e.criado_por || '—')}
      ${e.liberado_por ? ` · liberado acima do teto por ${esc(e.liberado_por)}` : ''}</p>
    <div class="jor-cartoes" style="grid-template-columns:repeat(3,1fr)">
      <div class="jor-cartao"><b>${brl(e.valor)}</b><span>EM ${e.parcelas}×</span></div>
      <div class="jor-cartao"><b>${brl(saldoLinha(e))}</b><span>SALDO</span></div>
      <div class="jor-cartao"><b style="font-size:15px;padding:6px 0">${tagSit(e)}</b><span>SITUAÇÃO</span></div>
    </div>
    ${e.justificativa_teto ? `<div class="jor-caixa">Acima do teto: ${esc(e.justificativa_teto)}</div>` : ''}
    ${e.encerramento_motivo ? `<div class="jor-caixa alerta">${esc(e.encerramento_motivo)}</div>` : ''}
    ${abats.length || proj.length ? `<table class="dc-planilha"><thead><tr><th>Competência</th><th class="ce">Valor</th><th>Situação</th></tr></thead><tbody>
      ${abats.map(a => `<tr><td>${compCurta(a.competencia)}</td><td class="ce">${brl(a.valor)}</td>
        <td>${a.situacao === 'estornado' ? `<span class="tag neutra">estornado</span> <span class="dc-sem">${esc(a.estorno_motivo || '')}</span>`
          : `<span class="tag ativo">abatido</span>${a.justificativa ? ` <span class="dc-sem">${esc(a.justificativa)}</span>` : ''}`}</td></tr>`).join('')}
      ${proj.map((p, i) => `<tr><td>${compCurta(p.competencia)}</td><td class="ce">${brl(p.valor)}</td>
        <td><span class="tag alerta">previsto</span>${s === 'fila' && i === 0 ? ' <span class="dc-sem">depois de quitar o anterior</span>' : ''}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="barra entre" style="margin-top:14px"><span></span><span>
      <button class="btn" type="button" data-emp-fechar>Fechar</button>
      ${e.origem === 'concessao' && ['desconto', 'fila', 'quitado'].includes(s) ? '<button class="btn" type="button" id="empReimp">Reimprimir recibo</button>' : ''}
      ${['desconto', 'fila'].includes(s) && !temAbat ? '<button class="btn perigo" type="button" id="empCancelar">Cancelar</button>' : ''}
      ${['desconto', 'fila'].includes(s) ? '<button class="btn principal" type="button" id="empDeslig">Registrar desligamento</button>' : ''}
    </span></div>`, () => {
    $('empReimp')?.addEventListener('click', async () => {
      const novo = { ...e, reimpressoes: (e.reimpressoes || 0) + 1, ultima_reimpressao: agora() };
      await jd.salvar('emprestimos', novo);
      await jd.registrar({ tabela: 'jor_emprestimos', registro_id: e.id, acao: 'reimpressao', antes: e, depois: novo });
      $('dlgEmp').close();
      mostrarDoc(reciboHTML(novo, true), 'empBarraRecibos');
    });
    $('empCancelar')?.addEventListener('click', () => cancelar(e));
    $('empDeslig')?.addEventListener('click', () => desligamento(e.funcionario_id));
  });
}

function cancelar(e) {
  dialogo(`<h3>Cancelar ${numeroTxt(e)}</h3>
    <p class="dc-sem">Só é possível porque nenhuma parcela foi abatida. O empréstimo fica na lista como cancelado, com a justificativa.</p>
    ${campoJust()}${rodapeDlg('<button class="btn principal" type="button" id="empOkDlg">Cancelar empréstimo</button>')}`, () =>
    $('empOkDlg').addEventListener('click', async () => {
      const j = exigeJust(); if (!j) return;
      const novo = { ...e, situacao: 'cancelado', encerrado_por: usuario(), encerrado_em: agora(), encerramento_motivo: 'Cancelado: ' + j };
      await jd.salvar('emprestimos', novo);
      await jd.registrar({ tabela: 'jor_emprestimos', registro_id: e.id, acao: 'cancelar', antes: e, depois: novo, justificativa: j });
      $('dlgEmp').close(); avisar(`${numeroTxt(e)} cancelado.`, true); desenharRecibos();
    }));
}

function liberar(id) {
  const e = emprestimos().find(x => x.id === id);
  dialogo(`<h3>Liberar ${numeroTxt(e)} acima do teto</h3>
    <p class="dc-sem">${esc(nomeDe(e.funcionario_id))} · ${brl(e.valor)} em ${e.parcelas}×. A liberação e a justificativa saem no recibo, com o seu nome.</p>
    ${campoJust()}${rodapeDlg('<button class="btn principal" type="button" id="empOkDlg">Liberar e emitir recibo</button>')}`, () =>
    $('empOkDlg').addEventListener('click', async () => {
      const j = exigeJust(); if (!j) return;
      const primeira = e.primeira_comp < comp(hoje()) ? proxComp(comp(hoje())) : e.primeira_comp;
      const novo = { ...e, situacao: 'ativo', primeira_comp: primeira, liberado_por: usuario(), liberado_em: agora(), justificativa_teto: j };
      await jd.salvar('emprestimos', novo);
      await jd.registrar({ tabela: 'jor_emprestimos', registro_id: e.id, acao: 'liberar', antes: e, depois: novo, justificativa: j });
      $('dlgEmp').close(); desenharRecibos();
      avisar(`${numeroTxt(e)} liberado. Imprima as duas vias do recibo.`, true);
      mostrarDoc(reciboHTML(novo), 'empBarraRecibos');
    }));
}

function recusar(id) {
  const e = emprestimos().find(x => x.id === id);
  dialogo(`<h3>Recusar ${numeroTxt(e)}</h3><p class="dc-sem">O pedido fica registrado como cancelado. Nenhum recibo é emitido.</p>
    ${campoJust()}${rodapeDlg('<button class="btn principal" type="button" id="empOkDlg">Recusar</button>')}`, () =>
    $('empOkDlg').addEventListener('click', async () => {
      const j = exigeJust(); if (!j) return;
      const novo = { ...e, situacao: 'cancelado', encerrado_por: usuario(), encerrado_em: agora(), encerramento_motivo: 'Recusado pelo administrador: ' + j };
      await jd.salvar('emprestimos', novo);
      await jd.registrar({ tabela: 'jor_emprestimos', registro_id: e.id, acao: 'recusar', antes: e, depois: novo, justificativa: j });
      $('dlgEmp').close(); avisar('Pedido recusado.', true); desenharRecibos();
    }));
}

function desligamento(fid) {
  const lista = ativosDa(fid).filter(e => saldo(e) > 0.004);
  const tot = num(lista.reduce((s, e) => s + saldo(e), 0));
  dialogo(`<h3>Desligamento — ${esc(nomeDe(fid))}</h3>
    <p class="dc-sem">Cada saldo em aberto precisa de um destino. O fechamento das horas da rescisão não faz parte desta etapa.</p>
    <div class="grade"><label class="campo">Data do desligamento<input type="date" id="empDesData" value="${hoje()}"></label></div>
    ${lista.map(e => `<div class="jor-caixa" style="margin:10px 0 0"><b>${numeroTxt(e)}</b> · saldo ${brl(saldo(e))}<br>
      <label class="jor-inline" style="display:inline-flex;margin-right:16px"><input type="radio" name="des_${e.id}" value="rescisao" checked> Descontar na rescisão</label>
      <label class="jor-inline" style="display:inline-flex"><input type="radio" name="des_${e.id}" value="baixado"> Baixar como perda</label></div>`).join('')}
    <p class="dc-sem" style="margin-top:10px">Total ${brl(tot)}. Na rescisão, a compensação é limitada a uma remuneração (CLT, art. 477, §5º) — confira com o escritório.</p>
    ${campoJust()}${rodapeDlg('<button class="btn principal" type="button" id="empOkDlg">Registrar desligamento</button>')}`, () =>
    $('empOkDlg').addEventListener('click', async () => {
      const j = exigeJust(); if (!j) return;
      const data = $('empDesData').value || hoje();
      for (const e of lista) {
        const destino = document.querySelector(`input[name="des_${e.id}"]:checked`)?.value || 'rescisao';
        const txt = destino === 'baixado'
          ? `Desligado em ${dataBR(data)}. Saldo de ${brl(saldo(e))} baixado como perda: ${j}`
          : `Desligado em ${dataBR(data)}. Saldo de ${brl(saldo(e))} a descontar na rescisão: ${j}`;
        const novo = { ...e, situacao: destino, desligamento_em: data, encerrado_por: usuario(), encerrado_em: agora(), encerramento_motivo: txt };
        await jd.salvar('emprestimos', novo);
        await jd.registrar({ tabela: 'jor_emprestimos', registro_id: e.id, acao: 'desligamento', antes: e, depois: novo, justificativa: j });
      }
      $('dlgEmp').close(); avisar('Desligamento registrado. Cada saldo recebeu o seu destino.', true);
      if (!$('telaEmpRecibos').hidden) desenharRecibos();
      if (!$('telaEmpHistorico').hidden) desenharHistorico();
    }));
}

/* ---------------- Conta corrente ---------------- */

function desenharHistorico() {
  const comEmp = new Set(emprestimos().map(e => e.funcionario_id));
  // Quem tem ou já teve empréstimo vem primeiro; desligado só aparece se tiver.
  const pessoas = estado.funcionarios
    .filter(f => comEmp.has(f.id) || (f.situacao || 'ATIVO') === 'ATIVO')
    .sort((a, b) => (comEmp.has(b.id) - comEmp.has(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const fid = est.pessoa;
  const opc = lista => lista.map(f => `<option value="${f.id}" ${fid === f.id ? 'selected' : ''}>${esc(f.nome)}${
    (f.situacao || 'ATIVO') !== 'ATIVO' ? ' (desligado)' : ''}</option>`).join('');

  let corpo = '<div class="vazio">Escolha o funcionário para ver a conta corrente dele.</div>';
  if (fid === '*') {
    const l = linhasDevedores();
    const tot = num(l.reduce((s2, x) => s2 + x.saldo, 0));
    corpo = `
      <div class="jor-cartoes" style="grid-template-columns:repeat(3,1fr)">
        <div class="jor-cartao alerta"><b>${brl(tot)}</b><span>SALDO EM ABERTO</span></div>
        <div class="jor-cartao"><b>${l.length}</b><span>FUNCIONÁRIOS DEVENDO</span></div>
        <div class="jor-cartao"><b>${brl(l.reduce((s2, x) => s2 + (x.proxima?.valor || 0), 0))}</b><span>PRÓXIMAS PARCELAS</span></div>
      </div>
      <h3 class="jor-h3">Todos que devem</h3>
      ${l.length ? `<table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Fazenda</th><th class="ce">Emprestado</th>
        <th class="ce">Abatido</th><th class="ce">Saldo</th><th>Próxima parcela</th><th class="ce">Faltam</th></tr></thead><tbody>
        ${l.map(x => `<tr><td><button class="btn mini" type="button" data-conta="${x.fid}">${esc(x.nome)}</button>
            <br><span class="dc-sem">${x.emprestimos.map(numeroTxt).join(', ')}</span></td>
          <td>${esc(x.fazenda)}</td><td class="ce">${brl(x.emprestado)}</td><td class="ce">${brl(x.abatido)}</td>
          <td class="ce"><b>${brl(x.saldo)}</b></td>
          <td>${x.proxima ? `${brl(x.proxima.valor)} · ${compCurta(x.proxima.competencia)}${x.proxima.ajuste ? ' <span class="tag alerta">ajustado</span>' : ''}`
            : x.rescisao ? '<span class="tag alerta">descontar na rescisão</span>' : '—'}</td>
          <td class="ce">${x.restantes || '—'}</td></tr>`).join('')}
      </tbody><tfoot><tr class="jor-total"><td colspan="4">Total em aberto</td><td class="ce">${brl(tot)}</td><td colspan="2"></td></tr></tfoot></table>`
        : '<div class="vazio">Ninguém deve nada hoje.</div>'}
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="empImpGeral">Imprimir extrato geral</button>
        <button class="btn mini" type="button" id="empCsvGeral">Baixar dados (Excel)</button>
      </div>`;
  } else if (fid) {
    const movs = movimentosDa(fid), r = resumoDa(fid), proj = projecaoDa(fid);
    const numDe = id => numeroTxt(emprestimos().find(e => e.id === id) || {});
    const saldoFinal = movs.length ? movs[movs.length - 1].saldo : 0;
    corpo = `
      <div class="jor-cartoes">
        <div class="jor-cartao"><b>${brl(r.emprestado)}</b><span>TOTAL EMPRESTADO</span></div>
        <div class="jor-cartao"><b>${brl(r.abatido)}</b><span>JÁ ABATIDO</span></div>
        <div class="jor-cartao alerta"><b>${brl(r.aberto + r.rescisao)}</b><span>SALDO EM ABERTO</span></div>
        <div class="jor-cartao"><b>${r.proxima ? brl(r.proxima.valor) : '—'}</b><span>${r.proxima ? 'PRÓXIMA · ' + compCurta(r.proxima.competencia).toUpperCase() : 'SEM PARCELA A VENCER'}</span></div>
      </div>
      ${r.rescisao ? `<div class="jor-caixa alerta">${brl(r.rescisao)} a descontar na rescisão — acerto com o escritório.</div>` : ''}
      ${r.aguardando.length ? `<div class="jor-caixa alerta">${r.aguardando.length} empréstimo(s) aguardando a liberação do administrador (${
        r.aguardando.map(e => `${numeroTxt(e)} · ${brl(e.valor)}`).join(', ')}). Só entram na conta depois de liberados.</div>` : ''}

      <h3 class="jor-h3">Movimentos</h3>
      ${movs.length ? `<table class="dc-planilha"><thead><tr><th>Data</th><th>Histórico</th>
        <th class="ce">Débito</th><th class="ce">Crédito</th><th class="ce">Saldo</th></tr></thead><tbody>
        ${movs.map(m => `<tr><td>${dataBR(m.quando)}</td><td>${esc(m.historico)}</td>
          <td class="ce">${m.debito ? brl(m.debito) : ''}</td><td class="ce">${m.credito ? brl(m.credito) : ''}</td>
          <td class="ce"><b>${brl(m.saldo)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr class="jor-total"><td colspan="4">Saldo atual</td><td class="ce">${brl(saldoFinal)}</td></tr></tfoot></table>`
        : '<div class="vazio">Nenhum empréstimo lançado para esta pessoa.</div>'}

      ${proj.length ? `<h3 class="jor-h3">Parcelas a vencer</h3>
      <table class="dc-planilha"><thead><tr><th>Competência</th><th>Empréstimo</th><th class="ce">Valor</th></tr></thead><tbody>
        ${proj.map(p => `<tr><td>${compLonga(p.competencia)}</td><td>${numDe(p.emprestimo_id)}</td>
          <td class="ce">${brl(p.valor)}${p.ajuste ? ` <span class="tag alerta">ajustado</span><br><span class="dc-sem">${esc(p.ajuste.justificativa || '')}</span>` : ''}</td></tr>`).join('')}
      </tbody><tfoot><tr class="jor-total"><td colspan="2">Total a vencer</td><td class="ce">${brl(proj.reduce((s, p) => s + p.valor, 0))}</td></tr></tfoot></table>
      <p class="dc-sem jor-nota">Previsão. Mês sem desconto ou desconto parcial no fechamento empurra o que faltou para o fim.</p>` : ''}

      <div class="jor-acoes">
        ${movs.length ? '<button class="btn principal" type="button" id="empImpExtrato">Imprimir extrato</button>' : ''}
        ${proj.length ? `<button class="btn" type="button" id="empAjustar">Ajustar desconto de ${compCurta(competenciaAberta(fid))}</button>` : ''}
        ${ativosDa(fid).some(e => saldo(e) > 0.004) ? '<button class="btn mini" type="button" id="empDesligH">Registrar desligamento</button>' : ''}
      </div>`;
  }

  $('telaEmpHistorico').innerHTML = cabecalho('Conta corrente', 'Escolha o funcionário e veja o extrato completo') + `
    <div class="jor-corpo">
      <div class="jor-barra">
        <select id="empPessoa" class="dc-mini" style="max-width:360px">
          <option value="*" ${fid === '*' ? 'selected' : ''}>Todos que devem (extrato geral)</option>
          <optgroup label="Com empréstimo">${opc(pessoas.filter(f => comEmp.has(f.id)))}</optgroup>
          ${pessoas.some(f => !comEmp.has(f.id)) ? `<optgroup label="Sem empréstimo">${opc(pessoas.filter(f => !comEmp.has(f.id)))}</optgroup>` : ''}
        </select>
      </div>
      ${corpo}
      ${barraDoc('empBarraHist')}
    </div>`;

  $('empPessoa').addEventListener('change', ev => { est.pessoa = ev.target.value; fecharPrevia(); desenharHistorico(); });
  $('empImpExtrato')?.addEventListener('click', () => mostrarDoc(extratoHTML(fid), 'empBarraHist'));
  $('empAjustar')?.addEventListener('click', () => dlgAjuste(fid, null, desenharHistorico));
  $('empImpGeral')?.addEventListener('click', () => mostrarDoc(devedoresHTML(), 'empBarraHist'));
  $('empCsvGeral')?.addEventListener('click', () => baixarCSV(devedoresCSV()));
  document.querySelectorAll('[data-conta]').forEach(b => b.addEventListener('click', () => {
    est.pessoa = b.dataset.conta; fecharPrevia(); desenharHistorico();
  }));
  $('empDesligH')?.addEventListener('click', () => desligamento(fid));
  ligarBarraDoc($('telaEmpHistorico'));
}

/* ---------------- Salário base (Configurações) ---------------- */

const salarioVigente = (fid, data = hoje()) => (jd.dados.salarios || [])
  .filter(s => s.funcionario_id === fid && s.desde <= data)
  .sort((a, b) => b.desde.localeCompare(a.desde) || (b.criado_em || '').localeCompare(a.criado_em || ''))[0] || null;

function desenharSalarios() {
  const b = est.buscaSal.toLowerCase();
  const lista = ativos().filter(f => !b || f.nome.toLowerCase().includes(b));
  const com = ativos().filter(f => salarioVigente(f.id)).length;
  $('telaEmpSalarios').innerHTML = cabecalho('Salário base', 'Só para o teto do empréstimo — o app não calcula folha') + `
    <div class="jor-corpo">
      <div class="jor-caixa">Cada reajuste abre uma vigência nova; a anterior fica no histórico. O teto do empréstimo usa o salário
        vigente <b>na data da concessão</b>. Só quem tem esta tela vê os valores — nas outras telas aparece apenas o teto.</div>
      <div class="jor-barra">
        <input id="empBuscaSal" type="search" placeholder="Buscar funcionário" value="${esc(est.buscaSal)}">
        <span class="dc-sem">${com} de ${ativos().length} com salário cadastrado</span>
      </div>
      <table class="dc-planilha"><thead><tr><th>Funcionário</th><th class="ce">Salário vigente</th><th>Desde</th>
        <th class="ce">Teto (${TETO_PERC}%)</th><th>Histórico</th><th></th></tr></thead><tbody>
        ${lista.map(f => {
          const s = salarioVigente(f.id);
          const h = (jd.dados.salarios || []).filter(x => x.funcionario_id === f.id && x !== s).sort((a, c) => c.desde.localeCompare(a.desde));
          return `<tr><td>${esc(f.nome)}</td><td class="ce">${s ? brl(s.valor) : '<span class="tag perigo">sem salário</span>'}</td>
            <td>${s ? dataBR(s.desde) : '—'}</td><td class="ce">${s ? brl(s.valor * TETO_PERC / 100) : '—'}</td>
            <td class="dc-sem">${h.map(x => `${brl(x.valor)} desde ${dataBR(x.desde)}`).join('<br>') || '—'}</td>
            <td class="ce"><button class="btn mini" data-sal="${f.id}">${s ? 'Reajuste' : 'Cadastrar'}</button></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  $('empBuscaSal').addEventListener('input', ev => { est.buscaSal = ev.target.value; desenharSalarios(); focarNoFim($('empBuscaSal')); });
  document.querySelectorAll('[data-sal]').forEach(bt => bt.addEventListener('click', () => dlgSalario(bt.dataset.sal)));
}

function dlgSalario(fid) {
  const s = salarioVigente(fid);
  dialogo(`<h3>${s ? 'Reajuste' : 'Salário base'} — ${esc(nomeDe(fid))}</h3>
    <p class="dc-sem">${s ? `Vigente: ${brl(s.valor)} desde ${dataBR(s.desde)}. Ele continua valendo até a véspera da nova data.` : 'Primeiro registro.'}</p>
    <div class="grade">
      <label class="campo">Salário base<input type="number" id="empSalValor" step="0.01" min="0.01"></label>
      <label class="campo">A partir de<input type="date" id="empSalData" value="${s ? hoje() : (pessoa(fid)?.admissao || hoje())}"></label>
    </div>
    ${campoJust(s ? 'Justificativa (obrigatória)' : 'Observação (opcional)')}
    ${rodapeDlg('<button class="btn principal" type="button" id="empOkDlg">Gravar</button>')}`, () =>
    $('empOkDlg').addEventListener('click', async () => {
      const v = num($('empSalValor').value), d = $('empSalData').value;
      if (!v || !d) { $('empDlgErro').textContent = 'Informe o valor e a data.'; return; }
      let j = ($('empDlgJust').value || '').trim();
      if (s) { j = exigeJust(); if (!j) return; }
      if (s && d <= s.desde) { $('empDlgErro').textContent = `A nova vigência precisa começar depois de ${dataBR(s.desde)}.`; return; }
      const novo = { funcionario_id: fid, valor: v, desde: d, justificativa: j || null, criado_por: usuario(), criado_em: agora() };
      const g = await jd.salvar('salarios', novo);
      await jd.registrar({ tabela: 'jor_salarios', registro_id: g.id, acao: 'insert', antes: s || null, depois: g, justificativa: j || null });
      tetoCache.clear();
      $('dlgEmp').close(); avisar('Salário gravado com vigência.', true); desenharSalarios();
    }));
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */

export function ligarEmprestimos(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}

export function limparEmprestimos() {
  tetoCache.clear();
  est.busca = ''; est.buscaSal = ''; est.pessoa = '*'; est.filtro = 'aberto'; est.importar = false;
}
