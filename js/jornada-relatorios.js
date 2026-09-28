// jornada-relatorios.js — J5 · os relatórios da competência
//
// REL-DP      Relatório Horas Extras — formato do protótipo 12.7 (25/09/2026):
//             por empregador, com insalubridade, periculosidade, faltas e
//             a parcela do empréstimo na mesma linha
// REL-FAL     Relatório de Faltas — só as informadas ao DP, com as datas
// REL-FAL-TOT Relatório Faltas Totais — todas, compensadas marcadas (uso interno)
// REL-ATE     Relatório de Atestados — períodos e dias, sem motivo
// REL-MES     Horas extras por mês — conferência: uma coluna por mês do fato
//             (o boletim atrasado aparece no mês em que aconteceu), 28/09/2026
// REL-DP-DET  Detalhado DP — abertura por percentual, intervalo e déficit
// REL-EXT     Extrato individual — dia a dia, com a memória de cálculo
//
// Identidade dos documentos: padrão SAKUMA (verde #84BD00, marrom #744F28,
// cinza #51534A, Arial, sem preto), marca no alto de toda página e a
// assinatura da LOP uma vez só, no fim. Regra do capítulo 9.
//
// Bloqueio técnico: o relatório é sempre de UM destino de DP. Não existe
// caminho neste arquivo que junte destinos diferentes.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { consolidar, formatarHoras, mesCurto } from './jornada-fechamento.js';
import { minParaHHMM } from './jornada-motor.js';
import { valorParaFolha, secaoRelatorioDP } from './jornada-emprestimos.js';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

const rotuloComp = c => {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
};
const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const cpfBR = c => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : (c || '');
};

/* ------------------------------------------------------------------
   Moldura do documento — igual em todos os relatórios
   ------------------------------------------------------------------ */

function documento({ titulo, subtitulo, destino, competencia, versao, corpo, assinaturas }) {
  const tarja = versao > 1
    ? `<div class="rel-tarja">VERSÃO ${versao} — substitui a versão anterior desta competência</div>`
    : '';

  return `
  <article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>${esc(titulo)}</h1>
        <p>${esc(subtitulo)}</p>
      </div>
      <div class="rel-comp">
        <span>competência</span>
        <strong>${esc(rotuloComp(competencia))}</strong>
        <span>${esc(destino?.nome || '')}</span>
      </div>
    </header>
    ${tarja}
    ${corpo}
    ${assinaturas ? blocoAssinaturas(assinaturas) : ''}
    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

const blocoAssinaturas = nomes => `
  <div class="rel-assinaturas">
    ${nomes.map(n => `<div class="rel-assina"><span></span><small>${esc(n)}</small></div>`).join('')}
  </div>`;

/* ------------------------------------------------------------------
   Moldura do protótipo 12.7 (25/09/2026) — Relatório Horas Extras,
   Faltas, Faltas Totais e Atestados. É o formato que o escritório lê
   "de sempre": título no centro, mês por extenso, destino e versão à
   direita, um bloco por empregador + fazenda.
   ------------------------------------------------------------------ */

const MAIUSC = s => String(s || '').toLocaleUpperCase('pt-BR');
const mesRef = c => { const [a, m] = c.split('-').map(Number); return `REFERENTE AO MÊS DE ${MAIUSC(MESES[m - 1])} ${a}`; };
const compCurta = c => { const [a, m] = c.split('-').map(Number); return `${MESES[m - 1]}/${a}`; };

function documentoDP({ titulo, competencia, destino, versao, corpo, assinaturas, interno, classe = '', pagina = '' }) {
  const tarjaInterna = interno
    ? '<div class="rel-tarja rel-tarja--interna">USO INTERNO — não enviar ao escritório</div>' : '';
  const tarjaVersao = versao > 1
    ? `<div class="rel-tarja">VERSÃO ${versao} — substitui a versão anterior desta competência</div>` : '';
  return `
  <article class="rel rel-dp ${classe}">
    <header class="rel-cabecalho rel-cab-dp">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>${esc(titulo)}</h1>
        <p>${esc(mesRef(competencia))}</p>
      </div>
      <div class="rel-comp">${esc(destino?.nome || '')}<br>${interno ? 'uso interno' : `versão ${versao || 1}`}${pagina ? `<br>${esc(pagina)}` : ''}</div>
    </header>
    ${tarjaInterna}${tarjaVersao}
    ${corpo}
    ${assinaturas ? blocoAssinaturas(assinaturas) : ''}
    <footer class="rel-rodape rel-rodape-dp">
      <span class="rel-pe">${esc(titulo.charAt(0) + titulo.slice(1).toLocaleLowerCase('pt-BR'))} · ${esc(compCurta(competencia))} · ${esc(destino?.nome || '')} · ${interno ? 'uso interno' : `versão ${versao || 1}`}</span>
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

/** Linhas do consolidado agrupadas por unidade (empregador + fazenda), em ordem alfabética. */
function porEmpregador(c, filtro = () => true) {
  return c.unidades.map(u => {
    const linhas = c.linhas.filter(l => l.unidade?.id === u.id && filtro(l))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const emp = jd.empregadorDe(u)?.nome || '';
    const faz = jd.fazendaDe(u)?.nome || '';
    const rotulo = 'EMPREGADOR: ' + MAIUSC([emp, faz].filter(Boolean).join(' — ') || jd.nomeUnidade(u));
    return { u, rotulo, linhas };
  }).filter(g => g.linhas.length)
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
const blocoEmp = t => `<p class="rel-emp">${esc(t)}</p>`;
const assinaturasDP = ['Gerente de Campo', 'Gerente Administrativo', 'Analista Administrativo'];
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ------------------------------------------------------------------
   REL-DP — Relatório Horas Extras (protótipo 12.7, decisão de 25/09/2026)
   Colunas: Funcionário · Horas extras · Insalubridade · Periculosidade 30%
   · Faltas justif. · Faltas não justif. · Saldo devedor (parcela do mês).
   ------------------------------------------------------------------ */

export function relatorioDP(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const fmt = c.destino?.formato_horas || 'decimal';
  const comp = jd.competenciaDoDestino(competencia, destinoId);
  const h = m => m ? formatarHoras(m, fmt) : '';

  /* 28/09/2026: uma folha por CAEPF (raiz de 9 dígitos), em paisagem. No DP 1
     o Lote 35 (001.141591) sai numa folha — Massato e Fabio — e Faca, Morro
     Branco e Três Riachos (004.143000) na outra. Unidade sem CAEPF: folha própria. */
  const raiz = u => String(u?.caepf || '').replace(/\D/g, '').slice(0, 9) || 'sem';
  const paginas = [];
  for (const g of porEmpregador(c)) {
    const k = raiz(g.u);
    let p = paginas.find(x => x.k === k);
    if (!p) paginas.push(p = { k, grupos: [], caepf: g.u?.caepf || '' });
    p.grupos.push(g);
  }
  paginas.sort((a, b) => (a.k === 'sem') - (b.k === 'sem') || a.k.localeCompare(b.k));

  const tabela = g => `
      ${blocoEmp(g.rotulo)}
      <table class="rel-tabela rel-tabela-dp rel-he">
        <thead><tr>
          <th>Funcionário</th><th class="rel-c">Horas extras</th>
          <th class="rel-c rel-justo">Insalubridade</th><th class="rel-c rel-justo">Periculosidade 30%</th>
          <th class="rel-c">Faltas justif.</th><th class="rel-c">Faltas não justif.</th>
          <th class="rel-c">Saldo devedor</th>
        </tr></thead>
        <tbody>${g.linhas.map(l => {
          const parcela = valorParaFolha(l.vinculo.funcionario_id, competencia);
          return `<tr>
          <td>${esc(l.nome)}</td>
          <td class="rel-c"><b>${h(l.minExtraPagar)}</b>${l.atrasados.some(x => x.extra) ? '<sup>*</sup>' : ''}</td>
          <td class="rel-c">${l.insalubridadePagar ? 'PAGAR' : ''}</td>
          <td class="rel-c">${l.periculosidade ? 'PAGAR' : ''}</td>
          <td class="rel-c">${l.faltasJ.length || ''}${l.faltasJDesc.length ? `<br><span class="rel-mini">${l.faltasJDesc.length} a descontar</span>` : ''}</td>
          <td class="rel-c">${l.faltasInformadas || ''}</td>
          <td class="rel-c">${parcela > 0.004 ? brl(parcela) : ''}</td>
        </tr>`; }).join('')}</tbody>
      </table>`;

  // Notas da folha: só das pessoas daquela folha.
  const nota = linhas => {
    const atrasadas = linhas.flatMap(l => l.atrasados.filter(x => x.extra).map(x => ({ l, x })))
      .sort((a, b) => a.l.nome.localeCompare(b.l.nome, 'pt-BR') || a.x.data.localeCompare(b.x.data));
    const supr = linhas.reduce((s, l) => s + (l.minIntervaloSuprimido || 0), 0);
    return `${atrasadas.length ? `<div class="rel-resumo"><b>* Inclui horas de competência anterior</b>, lançadas depois do envio
      daquele mês: ${atrasadas.map(({ l, x }) => `${esc(l.nome)} — ${dataBR(x.data)}, ${h(x.extra)}`).join(' · ')}.
      Abertura por mês no Relatório Horas Extras por Mês.</div>` : ''}
    ${supr ? `<div class="rel-resumo"><b>Intervalo suprimido:</b> ${minParaHHMM(supr)} nesta folha — verba indenizatória, art. 71 §4º da CLT, paga à parte das horas extras (ver Relatório Detalhado).</div>` : ''}
`;   // a frase de explicação das colunas saiu a pedido dele (28/09/2026)
  };

  if (!paginas.length) return documentoDP({
    titulo: 'RELATÓRIO HORAS EXTRAS', competencia, destino: c.destino, classe: 'rel-paisagem',
    versao: comp?.versao || 1, corpo: '<p class="rel-vazio">Nenhum funcionário com vínculo neste destino.</p>', assinaturas: null,
  });

  return paginas.map((p, i) => documentoDP({
    titulo: 'RELATÓRIO HORAS EXTRAS', competencia, destino: c.destino,
    classe: 'rel-paisagem' + (i ? ' folha2' : ''),
    pagina: `${p.k === 'sem' ? 'sem CAEPF' : `CAEPF ${p.k.slice(0, 3)}.${p.k.slice(3)}`}${paginas.length > 1 ? ` · folha ${i + 1} de ${paginas.length}` : ''}`,
    versao: comp?.versao || 1,
    corpo: p.grupos.map(tabela).join('') + nota(p.grupos.flatMap(g => g.linhas)),
    assinaturas: assinaturasDP,
  })).join('');
}

/* ------------------------------------------------------------------
   REL-MES — Horas extras por mês (28/09/2026). Conferência do boletim
   atrasado: uma coluna por mês do fato, o total é o que o Relatório
   Horas Extras manda pagar nesta competência.
   ------------------------------------------------------------------ */

export function relatorioPorMes(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const fmt = c.destino?.formato_horas || 'decimal';
  const comp = jd.competenciaDoDestino(competencia, destinoId);
  const h = m => m ? formatarHoras(m, fmt) : '—';

  const meses = [...new Set(c.linhas.flatMap(l => Object.keys(l.porMes)))].sort();
  if (!meses.includes(competencia)) meses.push(competencia);
  const grupos = porEmpregador(c);
  const soma = (ls, k) => ls.reduce((s, l) => s + (l.porMes[k] || 0), 0);

  const corpo = grupos.map(g => `
      ${blocoEmp(g.rotulo)}
      <table class="rel-tabela rel-tabela-dp">
        <thead><tr><th>Funcionário</th>
          ${meses.map(m => `<th class="rel-num">${esc(mesCurto(m))}${m < competencia ? '<br><span style="font-weight:400">anterior</span>' : ''}</th>`).join('')}
          <th class="rel-num">Total a pagar</th></tr></thead>
        <tbody>${g.linhas.map(l => `<tr><td>${esc(l.nome)}</td>
          ${meses.map(m => `<td class="rel-num">${h(l.porMes[m])}</td>`).join('')}
          <td class="rel-num"><b>${h(l.minExtraPagar)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>
          ${meses.map(m => `<td class="rel-num">${h(soma(g.linhas, m))}</td>`).join('')}
          <td class="rel-num">${h(g.linhas.reduce((s, l) => s + l.minExtraPagar, 0))}</td></tr></tfoot>
      </table>`).join('') || '<p class="rel-vazio">Nenhum funcionário com vínculo neste destino.</p>';

  const detalhe = c.linhas.flatMap(l => l.atrasados.map(x => ({ l, x })));
  const nota = detalhe.length
    ? `<div class="rel-resumo"><b>Boletins de competência anterior pagos neste mês:</b>
        ${detalhe.sort((a, b) => a.x.data.localeCompare(b.x.data)).map(({ l, x }) =>
          `${esc(l.nome)} — ${dataBR(x.data)}${x.falta ? ' (falta, informada ao DP)' : `, ${h(x.extra)}`}`).join(' · ')}.</div>`
    : `<p class="rel-nota">Nenhum boletim de competência anterior neste mês: todas as horas são de ${esc(compCurta(competencia))}.</p>`;

  return documentoDP({
    titulo: 'RELATÓRIO HORAS EXTRAS POR MÊS', competencia, destino: c.destino,
    versao: comp?.versao || 1,
    corpo: corpo + nota + `<p class="rel-nota">Cada coluna é o mês em que o trabalho aconteceu. O total a pagar é o mesmo do Relatório Horas Extras.</p>`,
    assinaturas: null,
  });
}

/* ------------------------------------------------------------------
   Faltas (vai ao DP) e FALTAS TOTAIS (uso interno) — 25/09/2026
   Faltas: só as informadas ao DP. Faltas Totais: todas, com a
   compensada marcada. Fonte: Gestão de jornada.
   ------------------------------------------------------------------ */

export function relatorioFaltas(competencia, destinoId, { totais = false } = {}) {
  const c = consolidar(competencia, destinoId);
  const comp = jd.competenciaDoDestino(competencia, destinoId);

  const nj = l => l.faltasNJ.filter(f => totais || !f.absorvida);
  const temFalta = l => l.faltasJ.length + nj(l).length > 0;
  const datas = l => nj(l).map(f => dataBR(f.data) + (f.absorvida ? ' <span class="rel-mini">(compensada)</span>'
    : f.atrasada ? ' <span class="rel-mini">(mês anterior)</span>' : ''));

  const grupos = porEmpregador(c, temFalta);
  let qJ = 0, qNJ = 0, qComp = 0;
  const corpo = grupos.map(g => `
      ${blocoEmp(g.rotulo)}
      <table class="rel-tabela rel-tabela-dp">
        <thead><tr>
          <th>Funcionário</th><th class="rel-c">Faltas justificadas</th>
          <th class="rel-c">Faltas não justificadas</th><th class="rel-num">Total</th>
        </tr></thead>
        <tbody>${g.linhas.map(l => {
          const n = nj(l);
          qJ += l.faltasJ.length; qNJ += n.length; qComp += n.filter(f => f.absorvida).length;
          return `<tr>
          <td>${esc(l.nome)}</td>
          <td class="rel-c">${l.faltasJ.map(d => dataBR(d) + (l.faltasJDesc.includes(d) ? ' <span class="rel-mini">(descontar)</span>'
            : totais && l.faltasJComp.includes(d) ? ' <span class="rel-mini">(compensada)</span>' : '')).join(', ') || '—'}</td>
          <td class="rel-c">${datas(l).join(', ') || '—'}</td>
          <td class="rel-num"><b>${l.faltasJ.length + n.length}</b></td>
        </tr>`; }).join('')}</tbody>
      </table>`).join('')
    || `<p class="rel-vazio">Nenhuma falta ${totais ? 'lançada' : 'informada ao DP'} nesta competência.</p>`;

  const resumo = totais
    ? `<div class="rel-resumo"><b>Resumo:</b> ${qJ + qNJ} falta(s) no mês — ${qJ} justificada(s) e ${qNJ} não justificada(s).
       Das não justificadas, ${qComp} foram compensadas por horas extras e ${qNJ - qComp} foram informadas ao DP.</div>`
    : `<p class="rel-nota">Constam só as faltas informadas ao DP. A falta não justificada que as horas extras do mês cobriram não aparece aqui.</p>`;

  return documentoDP({
    titulo: totais ? 'RELATÓRIO FALTAS TOTAIS' : 'RELATÓRIO DE FALTAS',
    competencia, destino: c.destino, versao: comp?.versao || 1, interno: totais,
    corpo: corpo + resumo, assinaturas: totais ? null : assinaturasDP,
  });
}

/* ------------------------------------------------------------------
   Atestados — 25/09/2026. Dias seguidos viram um período. Sem motivo
   e sem CID: o documento só informa os dias.
   ------------------------------------------------------------------ */

function periodos(datas) {
  const dia = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const r = [];
  for (const d of [...new Set(datas)].sort()) {
    const u = r[r.length - 1];
    if (u && dia(d) - dia(u.fim) === 86400000) u.fim = d;
    else r.push({ ini: d, fim: d });
  }
  return r;
}

export function relatorioAtestados(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const comp = jd.competenciaDoDestino(competencia, destinoId);
  const grupos = porEmpregador(c, l => l.atestadoDatas.length > 0);
  let total = 0;
  const corpo = grupos.map(g => `
      ${blocoEmp(g.rotulo)}
      <table class="rel-tabela rel-tabela-dp">
        <thead><tr><th>Funcionário</th><th class="rel-c">Período do atestado</th><th class="rel-num">Dias</th></tr></thead>
        <tbody>${g.linhas.map(l => {
          total += l.atestadoDatas.length;
          return `<tr>
          <td>${esc(l.nome)}</td>
          <td class="rel-c">${periodos(l.atestadoDatas).map(p => p.ini === p.fim ? dataBR(p.ini) : `${dataBR(p.ini)} a ${dataBR(p.fim)}`).join('<br>')}</td>
          <td class="rel-num"><b>${l.atestadoDatas.length}</b></td>
        </tr>`; }).join('')}</tbody>
      </table>`).join('') || '<p class="rel-vazio">Nenhum atestado nesta competência.</p>';

  const nota = `<p class="rel-nota">${total ? `${total} dia(s) de atestado no destino. ` : ''}Atestado não desconta horas: o relatório só informa os dias.</p>`;
  return documentoDP({
    titulo: 'RELATÓRIO DE ATESTADOS', competencia, destino: c.destino,
    versao: comp?.versao || 1, corpo: corpo + nota, assinaturas: assinaturasDP,
  });
}

/* ------------------------------------------------------------------
   REL-DP-DET — o mesmo mês, aberto
   ------------------------------------------------------------------ */

export function relatorioDetalhado(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const fmt = c.destino?.formato_horas || 'decimal';
  const comp = jd.competenciaDoDestino(competencia, destinoId);
  const h = m => formatarHoras(m, fmt);

  const corpo = `
    <table class="rel-tabela">
      <thead><tr>
        <th class="rel-num">Matr.</th><th>Funcionário</th><th>Unidade</th>
        <th class="rel-num">50%</th><th class="rel-num">100%</th>
        ${c.totais.atrasados ? '<th class="rel-num">Comp. ant.</th>' : ''}
        <th class="rel-num">Interv. supr.</th><th class="rel-num">Déficit</th>
        <th class="rel-num">Noturnas</th><th class="rel-num">Faltas</th>
      </tr></thead>
      <tbody>${c.linhas.map(l => `<tr>
        <td class="rel-num">${esc(l.matricula)}</td>
        <td>${esc(l.nome)}</td>
        <td class="rel-mini">${esc(l.unidadeNome)}</td>
        <td class="rel-num">${h(l.minExtra50)}</td>
        <td class="rel-num">${h(l.minExtra100)}</td>
        ${c.totais.atrasados ? `<td class="rel-num">${l.minExtraAnterior ? h(l.minExtraAnterior) : '—'}</td>` : ''}
        <td class="rel-num">${l.minIntervaloSuprimido ? minParaHHMM(l.minIntervaloSuprimido) : '—'}</td>
        <td class="rel-num">${l.minDeficitAvulso ? h(l.minDeficitAvulso) : '—'}</td>
        <td class="rel-num">${l.minNoturnas ? minParaHHMM(l.minNoturnas) : '—'}</td>
        <td class="rel-num">${l.faltasInformadas || '—'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td colspan="3">Total — ${c.totais.pessoas} pessoa(s)</td>
        <td class="rel-num">${h(c.totais.extra50)}</td>
        <td class="rel-num">${h(c.totais.extra100)}</td>
        ${c.totais.atrasados ? `<td class="rel-num">${h(c.totais.extraAnterior)}</td>` : ''}
        <td class="rel-num">${minParaHHMM(c.totais.intervaloSuprimido)}</td>
        <td class="rel-num">${h(c.totais.deficit)}</td>
        <td class="rel-num">${minParaHHMM(c.totais.noturnas)}</td>
        <td class="rel-num">${c.totais.faltasInformadas}</td>
      </tr></tfoot>
    </table>
    ${secaoRelatorioDP(competencia, destinoId)}
    <div class="rel-resumo">
      <b>Como ler esta abertura.</b>
      O <b>intervalo suprimido</b> não está somado às horas extras: é o período efetivamente
      suprimido, pago com 50% e de natureza <b>indenizatória</b> (art. 71 §4º da CLT, redação
      da Lei 13.467/2017). As <b>noturnas</b> são registradas para conferência; o adicional
      noturno está desligado por parâmetro. Faltas já consideram a compensação por horas
      extras: só é informada a falta que as extras do próprio mês não cobriram.
      ${c.totais.atrasados ? `<br><b>Comp. ant.</b> são horas de um mês já enviado, lançadas depois e pagas neste; não entram nos 50% e 100% do mês nem abatem falta dele.` : ''}
      ${c.totais.faltasAbsorvidas ? `<br>Neste mês, ${c.totais.faltasAbsorvidas} falta(s) foram absorvidas por horas extras e não vão ao DP.` : ''}
    </div>`;

  return documento({
    titulo: 'Relatório Detalhado — DP',
    subtitulo: 'Abertura por percentual, intervalo suprimido, déficit e horas noturnas',
    destino: c.destino, competencia, versao: comp?.versao || 1, corpo,
    assinaturas: ['Gerente Administrativo', 'Analista Administrativo'],
  });
}

/* ------------------------------------------------------------------
   REL-EXT — extrato individual, com a memória de cálculo
   ------------------------------------------------------------------ */

export function extratoIndividual(competencia, funcionarioId) {
  const f = estado.funcionarios.find(x => x.id === funcionarioId);
  const v = jd.vinculoDe(funcionarioId);
  const unidade = jd.unidadeDe(v);
  const destino = jd.destinoDe(unidade);
  const fmt = destino?.formato_horas || 'decimal';
  const h = m => formatarHoras(m, fmt);

  const boletins = jd.dados.boletins
    .filter(b => b.funcionario_id === funcionarioId && b.competencia === competencia && b.situacao !== 'cancelado')
    .sort((a, b) => a.data_fato.localeCompare(b.data_fato));

  const corpo = `
    <div class="rel-ficha">
      <div><span>Funcionário</span><b>${esc(f?.nome || '—')}</b></div>
      <div><span>CPF</span><b>${esc(cpfBR(f?.cpf))}</b></div>
      <div><span>Matrícula</span><b>${esc(v?.matricula || f?.cadastro || '—')}</b></div>
      <div><span>Unidade</span><b>${esc(unidade ? jd.nomeUnidade(unidade) : '—')}</b></div>
      <div><span>Função</span><b>${esc(jd.dados.funcoes.find(x => x.id === v?.funcao_id)?.nome || '—')}</b></div>
      <div><span>Admissão</span><b>${dataBR(v?.admissao)}</b></div>
    </div>

    <table class="rel-tabela">
      <thead><tr>
        <th>Data</th><th class="rel-num">Nº</th><th>Horário</th>
        <th class="rel-num">Previsto</th><th class="rel-num">Trabalhado</th>
        <th class="rel-num">50%</th><th class="rel-num">100%</th><th class="rel-num">Déficit</th>
      </tr></thead>
      <tbody>${boletins.map(b => {
        const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id) || {};
        return `<tr>
          <td>${dataBR(b.data_fato)}${jd.deCompetenciaAnterior(b) ? ' <span class="rel-mini">(mês anterior)</span>' : ''}</td>
          <td class="rel-num">${esc(b.numero || '—')}</td>
          <td>${b.hora_ini ? `${String(b.hora_ini).slice(0,5)}–${String(b.hora_fim || '').slice(0,5)}` : '—'}</td>
          <td class="rel-num">${minParaHHMM(a.min_previstos || 0)}</td>
          <td class="rel-num">${minParaHHMM(a.min_trabalhados || 0)}</td>
          <td class="rel-num">${h(a.min_extra_50 || 0)}</td>
          <td class="rel-num">${h(a.min_extra_100 || 0)}</td>
          <td class="rel-num">${a.min_deficit ? h(a.min_deficit) : '—'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="rel-vazio">Nenhum lançamento nesta competência.</td></tr>'}</tbody>
    </table>

    <h2 class="rel-unidade">Memória de cálculo</h2>
    ${boletins.map(b => {
      const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id);
      return a?.memoria ? `<pre class="rel-memoria">${esc(a.memoria)}</pre>` : '';
    }).join('') || '<p class="rel-nota">Sem memória de cálculo gravada.</p>'}`;

  return documento({
    titulo: 'Extrato Individual de Jornada',
    subtitulo: 'Dia a dia da competência, com a memória de cálculo de cada lançamento',
    destino, competencia, versao: 1, corpo,
    assinaturas: ['Funcionário', 'Analista Administrativo'],
  });
}

/* ------------------------------------------------------------------
   Impressão — prévia na tela primeiro, salvar é escolha do usuário
   ------------------------------------------------------------------ */

/* `barra: true` põe no alto da prévia os botões Imprimir e Fechar (só na tela —
   o CSS esconde no papel). Serve a telas que não têm barra própria, como o
   Fechamento (28/09/2026). */
export function mostrar(html, { barra = false } = {}) {
  const alvo = document.getElementById('jorImpressao');
  if (!alvo) return;
  alvo.innerHTML = (barra ? `<div class="rel-barra-tela">
      <button class="btn principal" type="button" data-rel-imprimir>Imprimir / salvar em PDF</button>
      <button class="btn mini" type="button" data-rel-fechar>Fechar prévia</button></div>` : '') + html;
  alvo.querySelector('[data-rel-imprimir]')?.addEventListener('click', () => imprimir());
  alvo.querySelector('[data-rel-fechar]')?.addEventListener('click', () => { alvo.hidden = true; alvo.innerHTML = ''; });
  alvo.hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function imprimir() {
  document.body.classList.add('jor-imprimindo');
  const soltar = () => {
    document.body.classList.remove('jor-imprimindo');
    removeEventListener('afterprint', soltar);
  };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);   // navegador que não dispara afterprint
}

/* ------------------------------------------------------------------
   Dados para a folha — o arquivo que o escritório importa
   Uma linha por funcionário. Separador ";" e BOM, que é o que o Excel
   em português abre com as colunas já separadas.
   ------------------------------------------------------------------ */

export function planilhaDP(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const fmt = c.destino?.formato_horas || 'decimal';
  const h = m => formatarHoras(m, fmt);

  const colunas = ['Codigo da empresa', 'Matricula', 'CPF', 'Nome', 'Unidade', 'CAEPF',
                   'Horas extras', 'Horas extras de competencia anterior (ja somadas)', 'Deficit', 'Intervalo suprimido (min)',
                   'Faltas (dias)', 'Faltas justificadas a descontar (dias)', 'Atestado (dias)', 'Emprestimo a descontar'];

  const linhas = c.linhas.map(l => [
    l.codigoEmpresa, l.matricula, cpfBR(l.cpf), l.nome, l.unidadeNome, l.caepf,
    h(l.minExtraPagar), h(l.minExtraAnterior || 0), h(l.minDeficitAvulso), l.minIntervaloSuprimido,
    l.faltasInformadas, l.faltasJDesc.length, l.diasAtestado,
    // Parcela do empréstimo: a lançada no envio, ou a prevista enquanto aberta.
    valorParaFolha(l.vinculo.funcionario_id, competencia).toFixed(2).replace('.', ','),
  ]);

  const limpar = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = [colunas, ...linhas].map(l => l.map(limpar).join(';')).join('\r\n');

  return {
    nome: `Jornada_${(c.destino?.nome || 'DP').replace(/\W+/g, '')}_${competencia.slice(0, 7)}.csv`,
    conteudo: '﻿' + csv,
  };
}

export function baixar({ nome, conteudo }) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
