// holerite-motor.js — cálculo do Holerite do DP 2 (03/11/2026)
//
// Segue a planilha "Controle folha de pagamento Quebra Cocão - DP2":
//   diária = salário base / 30
//   sal. p/ cálc. H.E. = base + gratificação + insalubridade + periculosidade
//   hora extra = sal. p/ cálc. H.E. / 220 × 1,5 — todas a 50%, como a planilha
//   (03/11/2026: domingo e feriado também entram aqui, pedido dele)
//   reflexo H.E. = valor das H.E. / dias de salário normal × (D.S.R. + feriados)
//   salário normal, D.S.R., feriado, falta justificada, atestado e licenças
//   = dias × diária; o mês fecha sempre em 30 dias (mês comercial)
//   bruto = soma dos vencimentos; líquido = bruto − faltas − adiantamento
//   horas por fora = horas × base / 220 × 1,5 (fora do líquido)
//
// Puro: não importa nada do app. Recebe o "automático" já levantado pela
// tela (jornada-holerite.js) e os ajustes que a pessoa digitou, e devolve
// cada linha com a referência, o valor e se foi alterado à mão.

export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

/* As linhas do holerite, na ordem da planilha. tipo: v = vencimento,
   d = desconto, f = por fora. un: unidade da referência ('' = só valor). */
export const LINHAS = [
  { k: 'sal',      nome: 'Salário normal (dias trabalhados)', tipo: 'v', un: 'dias' },
  { k: 'dsr',      nome: 'D.S.R.',                       tipo: 'v', un: 'dias' },
  { k: 'feriado',  nome: 'Feriado remunerado',           tipo: 'v', un: 'dias' },
  { k: 'ferias',   nome: 'Férias',                       tipo: 'v', un: 'dias' },
  { k: 'indevido', nome: 'Pagamento indevido',           tipo: 'v', un: '' },
  { k: 'he50',     nome: 'Horas extras 50%',             tipo: 'v', un: 'h' },
  { k: 'reflexo',  nome: 'Reflexo H.E. (D.S.R.)',        tipo: 'v', un: '' },
  { k: 'grat',     nome: 'Grat. de função',              tipo: 'v', un: '' },
  { k: 'fj',       nome: 'Falta justificada',            tipo: 'v', un: 'dias' },
  { k: 'atest',    nome: 'Falta atestado',               tipo: 'v', un: 'dias' },
  { k: 'obito',    nome: 'Lic. óbito',                   tipo: 'v', un: 'dias' },
  { k: 'licmat',   nome: 'Lic. mat./pat.',               tipo: 'v', un: 'dias' },
  { k: 'insal',    nome: 'Ad. insalubridade 20%',        tipo: 'v', un: '' },
  { k: 'peric',    nome: 'Ad. periculosidade 30%',       tipo: 'v', un: '' },
  { k: 'faltas',   nome: 'Faltas não justificadas',      tipo: 'd', un: 'dias' },
  { k: 'adiant',   nome: 'Descontar adiantamento',       tipo: 'd', un: '' },
  { k: 'porfora',  nome: 'Horas por fora',               tipo: 'f', un: 'h' },
];

/* Campos de texto e de pagamento (não entram na conta). */
export const CAMPOS = ['banco', 'conta_tipo', 'agencia', 'conta', 'cpf', 'pix', 'obs'];

/* Dias de salário (base da proporção dos adicionais): o que é pago como
   diária neste holerite — férias e INSS ficam de fora. */
const DIAS_PAGOS = ['sal', 'dsr', 'feriado', 'fj', 'atest', 'obito', 'licmat'];

const temAjuste = (aj, campo) => aj && Object.prototype.hasOwnProperty.call(aj, campo)
  && aj[campo] !== null && aj[campo] !== '';

/**
 * auto = { base, gratMes, insalMes, pericMes, q: {sal, dsr, …}, v: {adiant} ,
 *          texto: {banco, …} }
 * ajustes = { 'base': n, 'sal.q': n, 'sal.v': n, 'banco': 't', 'pag1': n, … }
 */
export function calcular(auto, ajustes = {}) {
  const aj = ajustes || {};
  const num = (campo, padrao) => temAjuste(aj, campo) ? Number(aj[campo]) || 0 : padrao;

  const base = r2(num('base', auto.base || 0));
  const diaria = base / 30;
  const q = {};
  for (const l of LINHAS) if (l.un) q[l.k] = r2(num(l.k + '.q', auto.q?.[l.k] || 0));

  const diasPagos = DIAS_PAGOS.reduce((s, k) => s + (q[k] || 0), 0);
  const fator = Math.min(1, Math.max(0, diasPagos / 30));

  const v = {};
  const val = (k, calc) => { v[k] = r2(num(k + '.v', calc)); return v[k]; };

  // Adicionais primeiro: entram no salário para cálculo das horas extras.
  val('grat', (auto.gratMes || 0) * fator);
  val('insal', (auto.insalMes || 0) * fator);
  val('peric', (auto.pericMes || 0) * fator);
  const salHE = r2(num('salHE', base + v.grat + v.insal + v.peric));
  const hora = salHE / 220;

  val('sal', q.sal * diaria);
  val('dsr', q.dsr * diaria);
  val('feriado', q.feriado * diaria);
  // Férias: vão no recibo de férias — aqui só os dias, salvo valor digitado.
  val('ferias', 0);
  val('indevido', 0);
  val('he50', q.he50 * hora * 1.5);
  val('reflexo', q.sal > 0 ? v.he50 / q.sal * (q.dsr + q.feriado) : 0);
  val('fj', q.fj * diaria);
  val('atest', q.atest * diaria);
  val('obito', q.obito * diaria);
  val('licmat', q.licmat * diaria);
  val('faltas', q.faltas * diaria);
  val('adiant', auto.v?.adiant || 0);
  val('porfora', q.porfora * (base / 220) * 1.5);

  const soma = tipo => r2(LINHAS.filter(l => l.tipo === tipo).reduce((s, l) => s + (v[l.k] || 0), 0));
  const bruto = soma('v'), descontos = soma('d'), porFora = soma('f');
  const liquido = r2(bruto - descontos);

  const texto = {};
  for (const c of CAMPOS) texto[c] = temAjuste(aj, c) ? String(aj[c]) : (auto.texto?.[c] || '');
  // Como na planilha: Pagamento 1 = líquido, Pagamento 2 = horas por fora.
  const pag1 = r2(num('pag1', liquido));
  const pag2 = r2(num('pag2', porFora));

  // Quais campos a pessoa mexeu (a tela marca e oferece "voltar ao automático").
  const alterado = new Set(Object.keys(aj).filter(c => temAjuste(aj, c)));

  return {
    base, diaria: r2(diaria), salHE, hora50: r2(hora * 1.5),
    q, v, bruto, descontos, liquido, porFora, totalPagar: r2(liquido + porFora),
    pag1, pag2, texto, alterado, fator,
  };
}

/* ------------------------------------------------------------------
   Dias do mês → referências automáticas.
   dias: [{ data, ferias, afast: 'licmat'|'inss15'|'inss'|'outro'|null,
            domingo, feriado, codigo: 'FALTA'|'FALTAJ'|'ATESTADO'|…|null,
            fjDesconta }]
   O mês comercial tem 30 dias: a diferença (mês de 31, fevereiro) sai do
   salário normal — admitido no meio do mês recebe 30 − (dia − 1).
   ------------------------------------------------------------------ */
export function contarDias(dias, { inicioDia = 1 } = {}) {
  const q = { sal: 0, dsr: 0, feriado: 0, ferias: 0, fj: 0, atest: 0, obito: 0, licmat: 0, inss: 0, outro: 0 };
  for (const d of dias) {
    if (d.ferias) q.ferias++;
    else if (d.afast === 'licmat') q.licmat++;
    else if (d.afast === 'inss15') q.atest++;
    else if (d.afast === 'inss') q.inss++;
    else if (d.afast === 'outro') q.outro++;
    else if (d.domingo) q.dsr++;
    else if (d.feriado) q.feriado++;
    else if (d.codigo === 'FALTAJ' && !d.fjDesconta) q.fj++;
    else if (d.codigo === 'ATESTADO') q.atest++;
    else q.sal++;                // dia normal, sem lançamento, falta (descontada à parte)
  }
  const alvo = Math.max(0, 30 - (inicioDia - 1));
  let dif = alvo - dias.length;  // 31 dias: −1; fevereiro: +2
  if (dif < 0) {
    for (const k of ['sal', 'ferias', 'dsr']) { const t = Math.min(q[k], -dif); q[k] -= t; dif += t; if (!dif) break; }
  } else if (dif > 0) {
    if (q.ferias && !q.sal) q.ferias += dif; else q.sal += dif;
  }
  return q;
}
