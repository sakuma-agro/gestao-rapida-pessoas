// =====================================================================
// MOTOR DE APURAÇÃO — Módulo Gestão de Jornada
// Para o app "Gestão Rápida" (sakuma-agro/gestao-rapida-pessoas) · JavaScript puro
//
// Função PURA: não acessa banco, não guarda estado, não tem efeito
// colateral. Entra um dia, sai um resultado. É o que permite testar
// sozinho e é o que impede que uma mudança de tela quebre o cálculo.
//
// Regras: RN-60.1 a 60.5, RN-143, RN-11 (corrigida por A-01), RN-12,
// RN-14/15/16, RN-16.1, RN-23.1, art. 58 §1º, Súmula 366 do TST,
// art. 71 §4º (Lei 13.467/2017), art. 59.
//
// Emitido em 09/09/2026 — Guilherme Lopes
// =====================================================================

'use strict';

// ------------------------------------------------------------------
// Conversões. O sistema guarda SEMPRE minutos. Decimal e h:mm são
// apresentação (RN-60.4).
// ------------------------------------------------------------------

export function hhmmParaMin(s) {
  if (!s) return null;
  const [h, m] = String(s).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minParaHHMM(min) {
  const neg = min < 0;
  const t = Math.abs(Math.round(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return (neg ? '-' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function minParaDecimal(min) {
  return Math.round((min / 60) * 100) / 100;
}

export function formatar(min, formato) {
  return formato === 'hm' ? minParaHHMM(min) : minParaDecimal(min).toFixed(2).replace('.', ',');
}

// ------------------------------------------------------------------
// Auxiliares
// ------------------------------------------------------------------

function diaDaSemana(dataISO) {
  // Sem fuso: 0 = domingo ... 6 = sábado
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function num(parametros, chave, padrao) {
  const v = parametros?.[chave];
  return v === undefined || v === null || v === '' ? padrao : Number(v);
}

function bool(parametros, chave, padrao) {
  const v = parametros?.[chave];
  if (v === undefined || v === null || v === '') return padrao;
  return v === true || v === 'true' || v === '1';
}

// União de faixas, para não contar duas vezes um horário sobreposto.
function unirFaixas(faixas) {
  const ord = faixas.slice().sort((a, b) => a.ini - b.ini);
  const out = [];
  for (const f of ord) {
    const ult = out[out.length - 1];
    if (ult && f.ini <= ult.fim) ult.fim = Math.max(ult.fim, f.fim);
    else out.push({ ini: f.ini, fim: f.fim });
  }
  return out;
}

// Minutos de interseção entre as faixas trabalhadas e a faixa noturna,
// que pode atravessar a meia-noite (21:00 → 05:00).
function minutosNoturnos(faixas, ini, fim) {
  if (ini == null || fim == null) return 0;
  const janelas = ini < fim ? [[ini, fim]] : [[ini, 1440], [0, fim]];
  let total = 0;
  for (const f of faixas) {
    for (const [ji, jf] of janelas) {
      total += Math.max(0, Math.min(f.fim, jf) - Math.max(f.ini, ji));
    }
  }
  return total;
}

// ------------------------------------------------------------------
// APURAÇÃO DO DIA
// ------------------------------------------------------------------
/**
 * @param {object} e
 *   e.data          'YYYY-MM-DD'
 *   e.boletins      [{ numero, ini:'07:00', fim:'16:00', intervalo:60, heEspecial:0 }]
 *   e.jornadaDia    { ini:'07:00', fim:'16:00', int:60 } | null
 *   e.tipo          { codigo, nome, apura, deducao, contaDias, percentualForcado }
 *   e.feriado       { nome } | null
 *   e.regimeSetor   'boletim' (Campo) | 'excecao' (Administrativo)
 *   e.funcao        { faixaNoturna: {ini,fim} | null }
 *   e.parametros    { chave: valor } — vigentes NA DATA DO FATO (RN-124)
 *   e.funcionarioAtivo  boolean
 */
export function apurarDia(e) {
  const p = e.parametros || {};
  const avisos = [];
  const linhas = [];

  const dow = diaDaSemana(e.data);
  const tipo = e.tipo || { codigo: 'NORMAL', apura: true, deducao: 'nenhuma', contaDias: false };

  // 1. Situação que define o PERCENTUAL: feriado > domingo > sábado > normal.
  //    O TIPO define, em paralelo, se apura e se deduz (RF-09).
  let situacao = 'NORMAL';
  if (e.feriado) situacao = 'FERIADO';
  else if (dow === 0) situacao = 'DOMINGO';
  else if (dow === 6) situacao = 'SABADO';

  const percentual = tipo.percentualForcado != null && !e.feriado && dow !== 0
    ? Number(tipo.percentualForcado)
    : situacao === 'FERIADO' ? num(p, 'perc_extra_feriado', 100)
    : situacao === 'DOMINGO' ? num(p, 'perc_extra_domingo', 100)
    : situacao === 'SABADO'  ? num(p, 'perc_extra_sabado', 50)
    :                          num(p, 'perc_extra_normal', 50);

  linhas.push(`Dia ${e.data} · situação: ${situacao}` + (e.feriado ? ` (${e.feriado.nome})` : ''));

  if (e.funcionarioAtivo === false) avisos.push('Funcionário inativo na data do fato.');

  // 2. Tempo previsto. Domingo e feriado não têm jornada prevista.
  const jd = e.jornadaDia;
  const previstoJornada = jd && jd.ini && jd.fim
    ? Math.max(0, hhmmParaMin(jd.fim) - hhmmParaMin(jd.ini) - (jd.int || 0))
    : 0;
  const minPrevistos = (situacao === 'DOMINGO' || situacao === 'FERIADO') ? 0 : previstoJornada;
  linhas.push(`Previsto pela jornada: ${minParaHHMM(minPrevistos)}`);

  // 3. Tempo trabalhado, com união de faixas (RN-11 corrigida por A-01:
  //    o dia tem fechamento único; vários boletins somam, não multiplicam).
  const faixas = [];
  let intervaloReal = 0;
  let heEspecial = 0;

  for (const b of (e.boletins || [])) {
    const bi = hhmmParaMin(b.ini);
    const bf = hhmmParaMin(b.fim);
    heEspecial += Number(b.heEspecial || 0);
    if (bi == null || bf == null) continue;
    if (bf <= bi) {
      avisos.push(`Boletim ${b.numero || ''}: hora final anterior à inicial (${b.ini}–${b.fim}).`);
      continue; // nunca assume jornada atravessando a meia-noite (ERRO-010)
    }
    let inter = Number(b.intervalo || 0);
    if (inter > bf - bi) {
      avisos.push(`Boletim ${b.numero || ''}: intervalo maior que o período trabalhado.`);
      inter = bf - bi;
    }
    intervaloReal += inter;
    faixas.push({ ini: bi, fim: bf });
  }

  const unidas = unirFaixas(faixas);
  const brutoFaixas = faixas.reduce((s, f) => s + (f.fim - f.ini), 0);
  const somaUnidas = unidas.reduce((s, f) => s + (f.fim - f.ini), 0);
  if (somaUnidas < brutoFaixas) avisos.push('Horários sobrepostos no mesmo dia — o tempo comum foi contado uma vez só.');

  const minTrabalhados = Math.max(0, somaUnidas - intervaloReal);
  linhas.push(`Trabalhado: ${minParaHHMM(minTrabalhados)} (${(e.boletins || []).length} boletim(ns), intervalo ${intervaloReal} min)`);

  // 4. Intervalo suprimido (RN-143 · art. 71 §4º, Lei 13.467/2017).
  //    Apenas o período suprimido, 50%, INDENIZATÓRIO, em coluna própria.
  //    Sai do cálculo da hora extra para não pagar duas vezes.
  //    O descanso real é o intervalo declarado MAIS os vãos entre boletins
  //    do mesmo dia (quem sai 13:00 e volta 14:00 descansou uma hora).
  const intervaloPrevisto = jd && jd.int ? jd.int : 0;
  const span = unidas.length
    ? unidas[unidas.length - 1].fim - unidas[0].ini
    : 0;
  const descansoReal = Math.max(0, span - somaUnidas) + intervaloReal;
  const minIntervaloSuprimido = (minTrabalhados > 0 && intervaloPrevisto > 0)
    ? Math.max(0, intervaloPrevisto - descansoReal)
    : 0;
  if (minIntervaloSuprimido > 0) {
    linhas.push(`Intervalo suprimido: ${minIntervaloSuprimido} min → coluna própria, 50%, indenizatório`);
  }

  let minExtra50 = 0, minExtra100 = 0, minDeficit = 0, contaDias = 0;

  if (tipo.apura === false) {
    // 5a. Tipo que não apura: falta, falta justificada, atestado.
    if (tipo.contaDias) contaDias = 1;
    if (tipo.deducao === 'fixa_8h' || tipo.deducao === 'jornada_dia') {
      const ded = e.regimeSetor === 'excecao'
        ? previstoJornada                       // Administrativo: jornada do dia
        : num(p, 'falta_campo_min', 480);       // Campo: 8h fixas, inclusive sábado (RN-12)
      minDeficit = ded;
      linhas.push(`${tipo.nome || tipo.codigo}: dedução de ${minParaHHMM(ded)} (${e.regimeSetor === 'excecao' ? 'jornada do dia' : '8h fixas do Campo'})`);
    } else {
      linhas.push(`${tipo.nome || tipo.codigo}: sem dedução, conta ${contaDias} dia`);
    }
  } else if (situacao === 'DOMINGO' || situacao === 'FERIADO') {
    // 5b. Domingo e feriado: TODO o tempo trabalhado é extra (RN-15/RN-16).
    const extra = Math.max(0, minTrabalhados - minIntervaloSuprimido) + heEspecial;
    if (percentual >= 100) minExtra100 = extra; else minExtra50 = extra;
    linhas.push(`Todo o tempo do dia é extra a ${percentual}%: ${minParaHHMM(extra)}`);
  } else {
    // 5c. Dia útil e sábado.
    const bruto = minTrabalhados - minPrevistos - minIntervaloSuprimido;
    const marcacoes = Math.max(2, faixas.length * 2);
    const limite = Math.min(
      num(p, 'tolerancia_dia_min', 10),
      marcacoes * num(p, 'tolerancia_marcacao_min', 5)
    );
    linhas.push(`Diferença bruta: ${bruto >= 0 ? '+' : ''}${minParaHHMM(bruto)} · tolerância do dia: ${limite} min`);

    let diferenca;
    if (Math.abs(bruto) <= limite) {
      diferenca = 0;
      linhas.push('Dentro da tolerância (art. 58 §1º), nos dois sentidos → nada a lançar.');
    } else {
      diferenca = bruto; // Súmula 366: passada a tolerância, conta o tempo todo
      linhas.push('Acima da tolerância → conta integral (Súmula 366 do TST), em valor exato, sem bloco.');
    }

    if (diferenca > 0) {
      const extra = diferenca + heEspecial;
      if (percentual >= 100) minExtra100 = extra; else minExtra50 = extra;
      linhas.push(`Hora extra a ${percentual}%: ${minParaHHMM(extra)} (${minParaDecimal(extra).toFixed(2)})`);
    } else if (diferenca < 0) {
      minDeficit = -diferenca;
      linhas.push(`Déficit: ${minParaHHMM(minDeficit)} — mesma régua da hora extra (RN-60.5)`);
      if (heEspecial > 0) {
        if (percentual >= 100) minExtra100 = heEspecial; else minExtra50 = heEspecial;
      }
    } else if (heEspecial > 0) {
      if (percentual >= 100) minExtra100 = heEspecial; else minExtra50 = heEspecial;
      linhas.push(`Hora extra especial: ${minParaHHMM(heEspecial)}`);
    }
  }

  // 6. Horas noturnas — calculadas e gravadas em silêncio (RN-16.1).
  const fn = e.funcao?.faixaNoturna;
  const nIni = hhmmParaMin(fn?.ini || p.noturno_ini || '21:00');
  const nFim = hhmmParaMin(fn?.fim || p.noturno_fim || '05:00');
  const minNoturnos = minutosNoturnos(unidas, nIni, nFim);
  const noturnoLigado = bool(p, 'noturno_ligado', false);
  if (minNoturnos > 0) {
    linhas.push(`Horas noturnas: ${minParaHHMM(minNoturnos)} — adicional ${noturnoLigado ? 'LIGADO' : 'desligado'} por parâmetro`);
  }

  // 7. Avisos
  const totalExtra = minExtra50 + minExtra100;
  const limiteArt59 = num(p, 'limite_extra_dia_min', 120);
  if (totalExtra > limiteArt59) {
    avisos.push(`Extras de ${minParaHHMM(totalExtra)} no dia — acima do limite do art. 59 da CLT (${minParaHHMM(limiteArt59)}).`);
  }

  return {
    data: e.data,
    situacao,
    percentual,
    minTrabalhados,
    minPrevistos,
    minExtra50,
    minExtra100,
    minDeficit,
    minNoturnos,
    minIntervaloSuprimido,
    contaDias,
    noturnoLigado,
    avisos,
    memoria: linhas.join('\n'),
  };
}

// ------------------------------------------------------------------
// APURAÇÃO DA COMPETÊNCIA
// Compensação falta × extras — Leitura A (RN-23.1).
// Só abate se as extras cobrirem o TOTAL da dedução, bloco a bloco,
// da falta mais antiga para a mais recente. A base é o saldo da
// PRÓPRIA competência (achado A-03): horas de competência anterior
// entram em coluna própria e não absorvem falta do mês corrente.
// ------------------------------------------------------------------

export function apurarCompetencia({ dias, parametros = {}, minExtraAnterior = 0 }) {
  const soma = (f) => dias.reduce((s, d) => s + (f(d) || 0), 0);

  let extra50  = soma(d => d.minExtra50);
  let extra100 = soma(d => d.minExtra100);
  const intervaloSuprimido = soma(d => d.minIntervaloSuprimido);
  const noturnas = soma(d => d.minNoturnos);

  // Blocos de falta, em ordem cronológica
  const faltas = dias
    .filter(d => d.minDeficit > 0 && d.contaDias > 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  // Déficit que não é falta (atraso/saída antecipada)
  const deficitAvulso = dias
    .filter(d => !(d.minDeficit > 0 && d.contaDias > 0))
    .reduce((s, d) => s + (d.minDeficit || 0), 0);

  const passos = [];
  let faltasInformadas = 0, faltasAbsorvidas = 0;

  for (const f of faltas) {
    const disponivel = extra50 + extra100;
    if (disponivel >= f.minDeficit) {
      // abate primeiro das de 50%, que é o que o DP recebe como base
      let resto = f.minDeficit;
      const tira50 = Math.min(extra50, resto); extra50 -= tira50; resto -= tira50;
      extra100 -= resto;
      faltasAbsorvidas += 1;
      passos.push(`Falta de ${f.data}: absorvida por ${minParaHHMM(f.minDeficit)} de extras (Leitura A).`);
    } else {
      faltasInformadas += 1;
      passos.push(`Falta de ${f.data}: extras insuficientes (${minParaHHMM(disponivel)}) — paga as extras integralmente e informa a falta ao DP.`);
    }
  }

  const diasAtestado = dias.filter(d => d.contaDias > 0 && d.minDeficit === 0).length;

  return {
    minExtra50: extra50,
    minExtra100: extra100,
    minExtraTotal: extra50 + extra100,
    minExtraAnterior,               // coluna própria (RN-18/RN-29)
    minIntervaloSuprimido: intervaloSuprimido,
    minNoturnas: noturnas,
    minDeficitAvulso: deficitAvulso,
    faltasAbsorvidas,
    faltasInformadas,
    diasAtestado,
    avisos: dias.flatMap(d => d.avisos || []),
    memoria: passos.join('\n'),
  };
}

export default { apurarDia, apurarCompetencia, hhmmParaMin, minParaHHMM, minParaDecimal, formatar };
