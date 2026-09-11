// jornada-relatorios.js — J5 · os relatórios da competência
//
// REL-DP      Relatório DP — formato de hoje, total único de horas extras
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
import { consolidar, formatarHoras } from './jornada-fechamento.js';
import { minParaHHMM } from './jornada-motor.js';

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
    </footer>
  </article>`;
}

const blocoAssinaturas = nomes => `
  <div class="rel-assinaturas">
    ${nomes.map(n => `<div class="rel-assina"><span></span><small>${esc(n)}</small></div>`).join('')}
  </div>`;

/* ------------------------------------------------------------------
   REL-DP — o que o escritório recebe hoje
   ------------------------------------------------------------------ */

export function relatorioDP(competencia, destinoId) {
  const c = consolidar(competencia, destinoId);
  const fmt = c.destino?.formato_horas || 'decimal';
  const comp = jd.competenciaDoDestino(competencia, destinoId);
  const h = m => formatarHoras(m, fmt);

  const porUnidade = c.unidades.map(u => {
    const linhas = c.linhas.filter(l => l.unidade?.id === u.id);
    if (!linhas.length) return '';
    const soma = campo => linhas.reduce((s, l) => s + (l[campo] || 0), 0);
    return `
      <h2 class="rel-unidade">${esc(jd.nomeUnidade(u))}
        <small>${esc(jd.fazendaDe(u)?.municipio || '')} · CAEPF ${esc(u.caepf || '—')}${u.codigo_empresa ? ` · empresa ${esc(u.codigo_empresa)}` : ''}</small>
      </h2>
      <table class="rel-tabela">
        <thead><tr>
          <th class="rel-num">Matr.</th><th>Funcionário</th>
          <th class="rel-num">Horas extras</th><th class="rel-num">Déficit</th>
          <th class="rel-num">Faltas</th><th class="rel-num">Atestado</th>
        </tr></thead>
        <tbody>${linhas.map(l => `<tr>
          <td class="rel-num">${esc(l.matricula)}</td>
          <td>${esc(l.nome)}</td>
          <td class="rel-num">${h(l.minExtraTotal)}</td>
          <td class="rel-num">${l.minDeficitAvulso ? h(l.minDeficitAvulso) : '—'}</td>
          <td class="rel-num">${l.faltasInformadas || '—'}</td>
          <td class="rel-num">${l.diasAtestado || '—'}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="2">Total da unidade — ${linhas.length} pessoa(s)</td>
          <td class="rel-num">${h(soma('minExtraTotal'))}</td>
          <td class="rel-num">${h(soma('minDeficitAvulso'))}</td>
          <td class="rel-num">${soma('faltasInformadas')}</td>
          <td class="rel-num">${soma('diasAtestado')}</td>
        </tr></tfoot>
      </table>`;
  }).join('');

  const corpo = `
    ${porUnidade || '<p class="rel-vazio">Nenhum lançamento nesta competência.</p>'}
    <div class="rel-resumo">
      <b>Total do destino:</b> ${c.totais.pessoas} pessoa(s) ·
      ${h(c.totais.extraTotal)} de horas extras ·
      ${c.totais.faltasInformadas} falta(s) · ${c.totais.atestados} dia(s) de atestado.
      ${c.totais.intervaloSuprimido ? `<br><b>Intervalo suprimido:</b> ${minParaHHMM(c.totais.intervaloSuprimido)} — verba indenizatória, art. 71 §4º da CLT, paga à parte das horas extras.` : ''}
    </div>
    <p class="rel-nota">Horas em ${fmt === 'hm' ? 'horas e minutos' : 'decimal, duas casas'}.
    Apuração em minutos exatos, tolerância de 5 min por marcação e 10 min no dia (art. 58 §1º).</p>`;

  return documento({
    titulo: 'Relatório de Horas — DP',
    subtitulo: 'Apuração de jornada para processamento da folha',
    destino: c.destino, competencia, versao: comp?.versao || 1, corpo,
    assinaturas: ['Gerente de Campo', 'Gerente Administrativo', 'Analista Administrativo'],
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
        <th class="rel-num">Interv. supr.</th><th class="rel-num">Déficit</th>
        <th class="rel-num">Noturnas</th><th class="rel-num">Faltas</th>
      </tr></thead>
      <tbody>${c.linhas.map(l => `<tr>
        <td class="rel-num">${esc(l.matricula)}</td>
        <td>${esc(l.nome)}</td>
        <td class="rel-mini">${esc(l.unidadeNome)}</td>
        <td class="rel-num">${h(l.minExtra50)}</td>
        <td class="rel-num">${h(l.minExtra100)}</td>
        <td class="rel-num">${l.minIntervaloSuprimido ? minParaHHMM(l.minIntervaloSuprimido) : '—'}</td>
        <td class="rel-num">${l.minDeficitAvulso ? h(l.minDeficitAvulso) : '—'}</td>
        <td class="rel-num">${l.minNoturnas ? minParaHHMM(l.minNoturnas) : '—'}</td>
        <td class="rel-num">${l.faltasInformadas || '—'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td colspan="3">Total — ${c.totais.pessoas} pessoa(s)</td>
        <td class="rel-num">${h(c.totais.extra50)}</td>
        <td class="rel-num">${h(c.totais.extra100)}</td>
        <td class="rel-num">${minParaHHMM(c.totais.intervaloSuprimido)}</td>
        <td class="rel-num">${h(c.totais.deficit)}</td>
        <td class="rel-num">${minParaHHMM(c.totais.noturnas)}</td>
        <td class="rel-num">${c.totais.faltasInformadas}</td>
      </tr></tfoot>
    </table>
    <div class="rel-resumo">
      <b>Como ler esta abertura.</b>
      O <b>intervalo suprimido</b> não está somado às horas extras: é o período efetivamente
      suprimido, pago com 50% e de natureza <b>indenizatória</b> (art. 71 §4º da CLT, redação
      da Lei 13.467/2017). As <b>noturnas</b> são registradas para conferência; o adicional
      noturno está desligado por parâmetro. Faltas já consideram a compensação por horas
      extras: só é informada a falta que as extras do próprio mês não cobriram.
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
          <td>${dataBR(b.data_fato)}</td>
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

export function mostrar(html) {
  const alvo = document.getElementById('jorImpressao');
  if (!alvo) return;
  alvo.innerHTML = html;
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
                   'Horas extras', 'Deficit', 'Intervalo suprimido (min)',
                   'Faltas (dias)', 'Atestado (dias)'];

  const linhas = c.linhas.map(l => [
    l.codigoEmpresa, l.matricula, cpfBR(l.cpf), l.nome, l.unidadeNome, l.caepf,
    h(l.minExtraTotal), h(l.minDeficitAvulso), l.minIntervaloSuprimido,
    l.faltasInformadas, l.diasAtestado,
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
