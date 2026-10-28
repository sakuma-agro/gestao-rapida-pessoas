// motivos-ausencia.js — motivo da ausência (28/10/2026, certificação).
// Usado no Lançar jornada (obrigatório em falta, falta justificada e atestado)
// e em RH › Indicadores (Ausências por motivo). A chave é o que fica gravado em
// jor_boletins.motivo_tipo (check no banco); o rótulo é o que aparece.
export const MOTIVOS_AUSENCIA = [
  ['pessoal', 'Pessoal'], ['doenca', 'Doença'], ['funeral', 'Funeral'],
  ['casamento', 'Casamento'], ['maternidade_paternidade', 'Maternidade/paternidade'],
];
export const rotMotivo = k => (MOTIVOS_AUSENCIA.find(m => m[0] === k) || [])[1] || '';
