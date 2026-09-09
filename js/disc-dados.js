// disc-dados.js — o questionário DISC em papel, transcrito
// (material "Teste DISC de Perfil Comportamental", Acelerador Empresarial).
// 10 linhas x 4 colunas, na mesma ordem da folha.

export const COLUNAS = ['D', 'I', 'S', 'C'];

export const GRUPOS = [
  ['Autoconfiante · Independente · Dominante',   'Comunicativo · Alegre · Extrovertido',            'Acolhedor · Amigável · Paciente',             'Autodisciplinado · Atento a detalhes · Diligente'],
  ['Pró-ativo · Empreendedor · Corajoso',        'Participativo · Relacional · Flexível',           'Agradável · Tranquilo · Organizado',          'Criterioso · Cuidadoso · Especialista'],
  ['Prático · Rápido · Eficiente',               'Persuasivo · Contagiante · Estimulador',          'Calmo · Rotineiro · Constante',               'Idealizador · Perfeccionista · Uniforme'],
  ['Objetivo · Assertivo · Focado em resultados','Preza pelo prazer · Emotivo · Divertido',         'Conciliador · Conselheiro · Bom ouvinte',     'Conforme · Sistemático · Sensato'],
  ['Determinado · Firme · Enérgico',             'Criativo · Falante · Distraído',                  'Comedido · Amável · Mediador',                'Preciso · Lógico · Racional'],
  ['Lutador · Combativo · Agressivo',            'Solidário · Facilitador · Influenciador',         'Autocontrolado · Conservador · Responsável',  'Profundo · Perceptivo · Estratégico'],
  ['Automotivado · Pioneiro · Impulsionador',    'Articulador · Empolgante · Motivador',            'Persistente · Prevenido · Tolerante',         'Exato · Exigente · Estruturado'],
  ['Resolvedor · Destemido · Desafiador',        'Vaidoso · Simpático · Gosta de ser reconhecido',  'Aconselhador · Harmônico · Apoiador',         'Ponderado · Ordenador · Analisador'],
  ['Competitivo · Assume riscos · Desbravador',  'Entusiasmado · Impulsivo · Otimista',             'Moderado · Equilibrado · Estável',            'Teórico · Conservador · Aprofunda conhecimentos'],
  ['Direcionador · Solucionador · Audacioso',    'Agregador · Sociável · Mobilidade',               'Educado · Observador · Diplomático',          'Regulador · Técnico · Orientador'],
];

// nome e cor de reserva, caso o banco ainda não tenha os textos
export const PADRAO = {
  D: { nome: 'Executor',    cor: '#D62839' },
  I: { nome: 'Comunicador', cor: '#E9C46A' },
  S: { nome: 'Planejador',  cor: '#2A9D5C' },
  C: { nome: 'Analista',    cor: '#2B9EB3' },
};

// pares adjacentes no quadrante do material ("primos"); o resto é "irmão"
const PRIMOS = new Set(['DI', 'ID', 'IS', 'SI', 'SC', 'CS', 'CD', 'DC']);
export const parentesco = (a, b) =>
  !a || !b || a === b ? '' : (PRIMOS.has(a + b) ? 'primos' : 'irmãos');

/* ---------------- cálculo ---------------- */

// Percentuais a partir das marcações, ajustados para somar exatamente 100.
export function percentuais(cont) {
  const total = COLUNAS.reduce((s, c) => s + (cont[c] || 0), 0);
  if (!total) return { D: 0, I: 0, S: 0, C: 0 };
  const bruto = {}, arred = {};
  COLUNAS.forEach(c => {
    bruto[c] = (cont[c] || 0) * 100 / total;
    arred[c] = Math.round(bruto[c] * 10) / 10;
  });
  // sobra do arredondamento vai para quem tem a maior parte fracionária
  let dif = Math.round((100 - COLUNAS.reduce((s, c) => s + arred[c], 0)) * 10) / 10;
  if (dif) {
    const ordem = [...COLUNAS].sort((a, b) =>
      (bruto[b] - arred[b]) - (bruto[a] - arred[a]));
    arred[dif > 0 ? ordem[0] : ordem[ordem.length - 1]] += dif;
    COLUNAS.forEach(c => { arred[c] = Math.round(arred[c] * 10) / 10; });
  }
  return arred;
}

export function intensidade(pct) {
  if (!pct) return '';
  if (pct > 50) return 'perfil forte';
  if (pct >= 36) return 'perfil moderado';
  return 'perfil pouco marcado';
}

// Recebe {D,I,S,C} em pontos ou percentual e devolve a leitura completa.
export function analisar(totais) {
  const pct = percentuais(totais);
  const ordem = [...COLUNAS].sort((a, b) => pct[b] - pct[a]);
  const principal = pct[ordem[0]] > 0 ? ordem[0] : null;
  const secundario = principal && pct[ordem[1]] > 0 ? ordem[1] : null;
  const empate = !!(principal && secundario && pct[principal] === pct[secundario]);
  return {
    pct, principal, secundario, empate,
    intensidade: principal ? intensidade(pct[principal]) : '',
    parentesco: parentesco(principal, secundario),
  };
}
