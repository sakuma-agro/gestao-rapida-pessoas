// jornada-fechamento.js — J5 · fechamento da competência por destino de DP
//
// Fluxo: analista envia → administrador aprova → competência travada.
// Reabertura exige motivo e gera versão 2 (RN-19, RN-130).
//
// Requisito crítico: nada aqui mistura destinos de DP. Cada destino tem
// a própria competência, o próprio envio e o próprio relatório.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { apurarCompetencia, minParaHHMM, minParaDecimal } from './jornada-motor.js';

/**
 * Consolida a competência de um destino: uma linha por funcionário,
 * já com a compensação falta × extras aplicada (Leitura A, RN-23.1).
 */
export function consolidar(competencia, destinoId) {
  const unidades = jd.dados.unidades.filter(u => u.destino_id === destinoId);
  const idsUnidade = new Set(unidades.map(u => u.id));

  const vinculos = jd.dados.vinculos.filter(v => idsUnidade.has(v.unidade_id) && v.ativo !== false);

  const linhas = vinculos.map(v => {
    const f = estado.funcionarios.find(x => x.id === v.funcionario_id);
    const boletins = jd.dados.boletins.filter(b =>
      b.funcionario_id === v.funcionario_id &&
      b.competencia === competencia &&
      b.situacao !== 'cancelado');

    /* Falta justificada (28/09/2026) entra na conta das faltas com a dedução
       que teria se não fosse justificada — 8h no Campo, jornada do dia no
       Administrativo —, para o analista poder compensar ou descontar. Sem
       decisão, o motor a deixa sem desconto. */
    const codigoDe = b => jd.dados.tipos.find(t => t.id === b.tipo_id)?.codigo || '';
    const regime = jd.setorDe(v)?.regime || 'boletim';

    // Um "dia" por boletim apurado, do jeito que o motor da competência espera.
    const dias = boletins.filter(b => !jd.deCompetenciaAnterior(b)).map(b => {
      const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id) || {};
      if (codigoDe(b) === 'FALTAJ') {
        const ded = regime === 'excecao' ? (a.min_previstos || 0)
          : Number(jd.parametrosEm(b.data_fato).falta_campo_min ?? 480);
        return { data: b.data_fato, minExtra50: 0, minExtra100: 0, minDeficit: ded,
          minIntervaloSuprimido: 0, minNoturnos: 0, contaDias: ded > 0 ? 1 : 0,
          boletimId: b.id, decisao: b.compensacao || null, justificada: true, avisos: a.avisos || [] };
      }
      return {
        data: b.data_fato,
        minExtra50: a.min_extra_50 || 0,
        minExtra100: a.min_extra_100 || 0,
        minDeficit: a.min_deficit || 0,
        minIntervaloSuprimido: a.min_intervalo_suprimido || 0,
        minNoturnos: a.min_noturnos || 0,
        contaDias: (a.min_deficit || 0) > 0 && !b.hora_ini ? 1 : 0,
        boletimId: b.id,
        decisao: b.compensacao || null,
        avisos: a.avisos || [],
      };
    });

    /* Boletim atrasado (RN-18, 28/09/2026): fato de um mês já enviado, pago
       neste. As horas entram à parte e NÃO absorvem falta deste mês (A-03).
       Falta atrasada vai direto como informada — o mês dela já fechou. */
    const atrasados = boletins.filter(b => jd.deCompetenciaAnterior(b)).map(b => {
      const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id) || {};
      const extra = (a.min_extra_50 || 0) + (a.min_extra_100 || 0);
      const falta = (a.min_deficit || 0) > 0 && !b.hora_ini;
      return { b, data: b.data_fato, origem: jd.competenciaDe(b.data_fato),
               extra, falta, deficit: falta ? 0 : (a.min_deficit || 0),
               supr: a.min_intervalo_suprimido || 0 };
    });
    const minExtraAnterior = atrasados.reduce((s, x) => s + x.extra, 0);

    const r = apurarCompetencia({ dias, parametros: jd.parametrosEm(competencia), minExtraAnterior });
    const faltasAtrasadas = atrasados.filter(x => x.falta).map(x => ({ data: x.data, absorvida: false, atrasada: true }));
    r.faltasInformadas += faltasAtrasadas.length;
    r.faltasDatas = [...(r.faltasDatas || []), ...faltasAtrasadas];
    r.minDeficitAvulso += atrasados.reduce((s, x) => s + x.deficit, 0);
    r.minIntervaloSuprimido += atrasados.reduce((s, x) => s + x.supr, 0);
    // Horas extras por mês do fato — o relatório de conferência abre por aqui.
    const porMes = { [competencia]: r.minExtraTotal };
    for (const x of atrasados) porMes[x.origem] = (porMes[x.origem] || 0) + x.extra;
    const unidade = jd.unidadeDe(v);

    /* Para os relatórios de faltas, atestados e o de horas no formato 12.7
       (25/09/2026). A fonte é a Gestão de jornada, a mesma do cálculo acima:
       o tipo do dia de cada boletim. */
    const codigo = b => jd.dados.tipos.find(t => t.id === b.tipo_id)?.codigo || '';
    const datasDe = cod => boletins.filter(b => codigo(b) === cod).map(b => b.data_fato).sort();
    const insal = v.insalubridade || 'nao';

    return {
      vinculo: v,
      funcionario: f,
      unidade,
      nome: f?.nome || '—',
      cpf: f?.cpf || '',
      matricula: v.matricula || f?.cadastro || '',
      caepf: unidade?.caepf || '',
      codigoEmpresa: unidade?.codigo_empresa || '',
      unidadeNome: unidade ? jd.nomeUnidade(unidade) : '—',
      boletins: boletins.length,
      ...r,
      atrasados,
      porMes,
      // O que vai para a folha: as extras do mês + as de competência anterior.
      minExtraPagar: r.minExtraTotal + minExtraAnterior,
      faltasNJ: (r.faltasDatas || []).filter(x => !x.justificada),   // [{ data, absorvida }]
      faltasTodas: r.faltasDatas || [],                              // não justificadas + justificadas
      faltasJDesc: (r.faltasDatas || []).filter(x => x.justificada && x.desconta).map(x => x.data),
      faltasJComp: (r.faltasDatas || []).filter(x => x.justificada && x.absorvida).map(x => x.data),
      faltasJ: datasDe('FALTAJ'),               // falta justificada não desconta
      atestadoDatas: datasDe('ATESTADO'),
      /* Correção (25/09/2026): o motor contava atestado como "dia sem
         dedução com contaDias", mas o fechamento só marca contaDias quando
         há déficit — o atestado saía sempre 0 no Detalhado e no Excel.
         O número de dias vem agora direto dos boletins do tipo Atestado. */
      diasAtestado: datasDe('ATESTADO').length,
      // RN-27/RN-28: permanente paga sempre; sem permanente, paga se algum
      // boletim do mês marcou a exposição no dia.
      insalubridadePagar: insal === 'permanente' || boletins.some(b => b.insalubridade_dia),
      periculosidade: !!v.periculosidade,
    };
  });

  // Quem tem mais extras primeiro — é onde o olho precisa cair.
  linhas.sort((a, b) => b.minExtraTotal - a.minExtraTotal || a.nome.localeCompare(b.nome, 'pt-BR'));

  const total = campo => linhas.reduce((s, l) => s + (l[campo] || 0), 0);

  return {
    competencia,
    destino: jd.dados.destinos.find(d => d.id === destinoId) || null,
    unidades,
    linhas,
    totais: {
      pessoas: linhas.length,
      extra50: total('minExtra50'),
      extra100: total('minExtra100'),
      extraTotal: total('minExtraTotal'),
      extraAnterior: total('minExtraAnterior'),
      extraPagar: total('minExtraPagar'),
      atrasados: linhas.reduce((s, l) => s + l.atrasados.length, 0),
      deficit: total('minDeficitAvulso'),
      intervaloSuprimido: total('minIntervaloSuprimido'),
      noturnas: total('minNoturnas'),
      faltasInformadas: total('faltasInformadas'),
      faltasAbsorvidas: total('faltasAbsorvidas'),
      atestados: total('diasAtestado'),
      boletins: total('boletins'),
    },
  };
}

/**
 * "Posso enviar?" — separa o que impede de enviar do que é só para saber.
 * Bloqueio é coisa que quebra o relatório; o resto informa e deixa passar.
 */
export function podeEnviar(consolidado) {
  const bloqueios = [];
  const informativos = [];
  const { competencia, destino, linhas, unidades } = consolidado;

  if (!destino) bloqueios.push('Destino de DP não encontrado.');

  const comp = jd.competenciaDoDestino(competencia, destino?.id);
  if (comp && ['enviada', 'aprovada', 'travada'].includes(comp.situacao)) {
    bloqueios.push(`Competência já ${comp.situacao} em ${(comp.enviada_em || '').slice(0, 10).split('-').reverse().join('/')}. Para mexer, reabra com motivo.`);
  }

  if (!linhas.length) bloqueios.push('Nenhum funcionário com vínculo neste destino.');

  // Boletim sem apuração é erro de gravação — nunca deve sair para o DP.
  const semApuracao = jd.dados.boletins.filter(b =>
    b.competencia === competencia &&
    unidades.some(u => u.id === b.unidade_id) &&
    !jd.dados.apuracoes.some(a => a.boletim_id === b.id));
  if (semApuracao.length) {
    bloqueios.push(`${semApuracao.length} boletim(ns) sem cálculo gravado. Reabra e grave de novo antes de enviar.`);
  }

  const atrasados = linhas.flatMap(l => l.atrasados.map(x => ({ l, x })));
  if (atrasados.length) {
    const meses = [...new Set(atrasados.map(a => a.x.origem))].sort().map(mesCurto).join(', ');
    informativos.push(`${atrasados.length} boletim(ns) de competência anterior (${meses}) lançado(s) depois do envio — `
      + `entram neste pagamento, somados às horas extras, e não abatem falta deste mês.`);
  }

  const semCodigo = unidades.filter(u => !u.codigo_empresa);
  if (semCodigo.length) {
    informativos.push(`${semCodigo.length} unidade(s) sem código da empresa — o Excel sai identificando por CPF e matrícula.`);
  }

  const semLancamento = linhas.filter(l => l.boletins === 0);
  if (semLancamento.length) {
    informativos.push(`${semLancamento.length} pessoa(s) sem nenhum lançamento no mês: ${semLancamento.slice(0, 5).map(l => l.nome).join(', ')}${semLancamento.length > 5 ? '…' : ''}`);
  }

  const faltas = linhas.flatMap(l => l.faltasNJ || []);
  if (faltas.length) {
    const comp = faltas.filter(f => f.absorvida).length;
    informativos.push(`${faltas.length} falta(s) não justificada(s): ${comp} compensada(s) com horas extras, ${faltas.length - comp} vão ao DP para desconto. `
      + `Para mudar, use Gestão de jornada › Abatimento de horas.`);
  }

  const comArt59 = linhas.filter(l => (l.avisos || []).some(a => a.includes('art. 59')));
  if (comArt59.length) {
    informativos.push(`${comArt59.length} pessoa(s) com dia acima de 2h de extra (art. 59 da CLT).`);
  }

  const comSuprimido = linhas.filter(l => l.minIntervaloSuprimido > 0);
  if (comSuprimido.length) {
    informativos.push(`${comSuprimido.length} pessoa(s) com intervalo suprimido — verba indenizatória, em coluna própria.`);
  }

  return { bloqueios, informativos, pode: bloqueios.length === 0 };
}

const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
export const mesCurto = c => { const [a, m] = c.split('-').map(Number); return `${MESES_ABREV[m - 1]}/${a}`; };

/** Comparativo com o mês anterior, para o número estranho saltar aos olhos. */
export async function comparativo(competencia, destinoId) {
  const [a, m] = competencia.split('-').map(Number);
  const ant = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;

  if (!estado.cliente || !estado.sessao) return null;
  const { data, error } = await estado.cliente
    .from('jor_competencias').select('*')
    .eq('competencia', ant).eq('destino_id', destinoId).maybeSingle();
  if (error || !data?.snapshot?.totais) return null;
  return { competencia: ant, totais: data.snapshot.totais };
}

/* ------------------------------------------------------------------
   Mudanças de situação. Cada uma grava trilha.
   ------------------------------------------------------------------ */

const agora = () => new Date().toISOString();
const usuario = () => estado.sessao?.user?.email || null;

export async function enviar(consolidado) {
  const { competencia, destino, totais } = consolidado;
  const atual = jd.competenciaDoDestino(competencia, destino.id);

  const linha = {
    ...(atual || {}),
    competencia,
    destino_id: destino.id,
    situacao: 'enviada',
    versao: atual?.versao || 1,
    enviada_por: usuario(),
    enviada_em: agora(),
    // O snapshot congela os parâmetros e os totais: competência fechada
    // nunca recalcula, mesmo que alguém mude um percentual depois (A-06).
    snapshot: {
      parametros: jd.parametrosEm(competencia),
      totais,
      em: agora(),
    },
  };

  const gravada = await jd.salvar('competencias', linha);
  await jd.registrar({
    tabela: 'jor_competencias', registro_id: gravada.id,
    acao: atual ? 'update' : 'insert', antes: atual || null, depois: gravada,
  });
  return gravada;
}

export async function aprovar(competencia, destinoId) {
  const atual = jd.competenciaDoDestino(competencia, destinoId);
  if (!atual) throw new Error('Envie a competência antes de aprovar.');

  const linha = {
    ...atual,
    situacao: 'aprovada',
    aprovada_por: usuario(),
    aprovada_em: agora(),
  };
  const gravada = await jd.salvar('competencias', linha);
  await jd.registrar({
    tabela: 'jor_competencias', registro_id: gravada.id,
    acao: 'update', antes: atual, depois: gravada,
  });
  return gravada;
}

/** Reabrir exige motivo e sobe a versão — a próxima emissão sai como versão 2. */
export async function reabrir(competencia, destinoId, motivo) {
  const atual = jd.competenciaDoDestino(competencia, destinoId);
  if (!atual) throw new Error('Não há competência fechada para reabrir.');
  if (!motivo || motivo.trim().length < 5) throw new Error('O motivo da reabertura é obrigatório.');

  const linha = {
    ...atual,
    situacao: 'reaberta',
    versao: (atual.versao || 1) + 1,
    motivo_reabertura: motivo.trim(),
  };
  const gravada = await jd.salvar('competencias', linha);
  await jd.registrar({
    tabela: 'jor_competencias', registro_id: gravada.id,
    acao: 'update', antes: atual, depois: gravada, justificativa: motivo.trim(),
  });
  return gravada;
}

export const formatarHoras = (min, formato) =>
  formato === 'hm' ? minParaHHMM(min) : minParaDecimal(min).toFixed(2).replace('.', ',');
