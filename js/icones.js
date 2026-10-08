// icones.js — ícones de traço fino do app (29/09/2026)
// Usados no Acesso rápido (atalhos.js) e na faixa de ícones do menu (acesso.js).
// Cada ícone é o miolo de um <svg viewBox="0 0 24 24"> com stroke="currentColor".

export const ICONES = {
  organograma: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  predio: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M10 21v-6h4v6"/>',
  pizza: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>',
  historico: '<path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  ajuste: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  ficha: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  risco: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 9v4M12 16v.01"/>',
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',

  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.5 2.4 3.5 5.2"/>',
  bolo: '<path d="M4 21h16v-7H4z"/><path d="M4 14c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1.5 4 0"/><path d="M12 10V7M12 4.5v.01"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  exame: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M12 8v6"/>',
  treino: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 10v5c3 2 7 2 10 0v-5"/>',
  painel: '<path d="M5 20V10M11 20V4M17 20v-7"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  disc: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
  boletim: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 13l2 2 4-4"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  dinheiro: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9v.01M17 15v.01"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  documento: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cargo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  'seta-esq': '<path d="M15 5l-7 7 7 7"/>',
  balanca: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};

/** Ícone de cada tela da faixa do menu. Tela sem ícone aqui usa o do módulo. */
export const ICONE_TELA = {
  funcionarios: 'pessoa', funcionariosN2: 'ficha', aniversarios: 'bolo', folhaPonto: 'calendario',
  lista: 'check', termoSindical: 'documento', termoContrato: 'documento',
  cadRelatorios: 'grafico', rhQuadro: 'pizza', cadFuncoes: 'cargo', cadEstrutura: 'predio',
  fichas: 'escudo', epis: 'lista', modelo: 'lapis',
  exPainel: 'painel', exVenc: 'exame', exFuncoes: 'cargo', exTipos: 'ajuste',
  trPainel: 'painel', trVenc: 'treino', trTipos: 'ajuste',
  disc: 'disc', rhCargos: 'cargo', sdQuadro: 'balanca', sdPlanos: 'check', sdConfig: 'config', rhProposta: 'documento', rhOrganograma: 'organograma',
  jorPainel: 'painel', jorLancar: 'relogio', jorBoletins: 'lista', jorAbatimento: 'ajuste',
  jorFechamento: 'calendario', jorHistorico: 'historico',
  bdDia: 'boletim', bdMes: 'calendario', bdPend: 'alerta',
  dmPainel: 'painel', dmMes: 'recibo', dmScan: 'check',
  empEmissao: 'recibo', empRecibos: 'lista', empHistorico: 'dinheiro',
  ferPainel: 'sol', ferPrev: 'grafico', ferLanc: 'lista', ferAfast: 'calendario', ferRisco: 'risco', ferIni: 'lapis',
  jorRelatorios: 'grafico', jorConfig: 'config', empSalarios: 'dinheiro',
};
export const ICONE_MODULO = { pessoas: 'pessoa', sst: 'escudo', rh: 'cargo', jornada: 'relogio' };

export const svgIcone = (nome, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${ICONES[nome] || ICONES.lista}</svg>`;
