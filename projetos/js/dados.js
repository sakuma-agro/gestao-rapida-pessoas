// dados.js — o que as telas da área Projetos (PMBOK) usam em comum (23/10/2026).
// Os dados moram no núcleo das molduras (../../js/moldura-nucleo.js), que
// guarda tudo no aparelho e manda para o servidor quando há sinal.
//
// AS CONTAS
//   % físico de uma entrega  = média do % dos filhos, ponderada pela duração
//   % físico do projeto      = média do % das tarefas e marcos (folhas da EAP),
//                              ponderada pela duração (marco = 1 dia)
//   % planejado (hoje)       = quanto de cada folha já deveria estar feito pelas
//                              datas, ponderado do mesmo jeito
//   Valor agregado simplificado (orçamento no término = soma do custo previsto
//   das folhas; sem isso, o orçamento do termo):
//     VP = orçamento × % planejado · VA = orçamento × % físico · CR = custo real
//     IDP (SPI) = VA ÷ VP          · IDC (CPI) = VA ÷ CR

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pronto = () => !!(window.App && window.App.usuario);
export const carregando = () => !!(window.App && window.App.carregando);
export const todos = t => (window.App && window.App.dados[t]) || [];
export const ativos = t => todos(t).filter(x => x.ativo !== false);
export const gravar = (t, r) => window.gravar(t, r);
export const aviso = (texto, erro) => window.aviso && window.aviso(texto, erro);
export const meuNome = () => (window.App && window.App.usuario && window.App.usuario.nome) || '';
export const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* "Apagar" = inativar (o registro some da tela e fica no banco). */
export async function apagar(tabela, reg) { await gravar(tabela, { ...reg, ativo: false }); }

/* ---------------------------------------------------------------- formatos */
export const reais = v => (v == null || v === '' || isNaN(v)) ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
export const reaisCurto = v => (v == null || isNaN(v)) ? '—'
  : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export const num = (v, c = 2) => (v == null || v === '' || isNaN(v)) ? '—'
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
export const pct = (v, c = 0) => (v == null || isNaN(v)) ? '—' : num(v * 100, c) + '%';
export const lerNum = s => {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s|R\$/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return isNaN(n) ? null : n;
};
export const hojeISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export const dataBR = s => { if (!s) return '—'; const [a, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };
export const dataCurta = s => { if (!s) return '—'; const [, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m; };
const dia = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d) / 86400000; };
export const diasEntre = (a, b) => dia(b) - dia(a);
export const somarDias = (s, n) => {
  const d = new Date((dia(s) + Number(n || 0)) * 86400000);
  return d.toISOString().slice(0, 10);
};

/* ---------------------------------------------------------------- fases */
export const FASES = [
  ['iniciacao', 'Iniciação'],
  ['planejamento', 'Planejamento'],
  ['execucao', 'Execução'],
  ['monitoramento', 'Monitoramento e Controle'],
  ['encerramento', 'Encerramento'],
];
export const nomeFase = f => (FASES.find(x => x[0] === f) || [, '—'])[1];
export const idxFase = f => Math.max(0, FASES.findIndex(x => x[0] === f));
export const SITUACOES = { ativo: 'Ativo', suspenso: 'Suspenso', encerrado: 'Encerrado', cancelado: 'Cancelado' };

/* ---------------------------------------------------------------- projetos */
export const projetos = () => ativos('pj_projetos').slice()
  .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true }));
export const projeto = id => todos('pj_projetos').find(p => p.id === id) || null;
export const emAndamento = p => p.situacao === 'ativo' || p.situacao === 'suspenso';
export function proximoCodigo() {
  const ano = new Date().getFullYear();
  const n = todos('pj_projetos').map(p => String(p.codigo || '')).filter(c => c.startsWith('PJ-' + ano + '-'))
    .map(c => Number(c.split('-')[2]) || 0);
  return 'PJ-' + ano + '-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0');
}
export const doProjeto = (t, pid) => ativos(t).filter(x => x.projeto_id === pid);
export const partes = pid => doProjeto('pj_partes', pid).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

/* Nomes para escolher gerente, patrocinador, responsável: funcionários
   ativos (se a pessoa tem o Pessoas), partes interessadas e nomes já usados. */
export function nomesSugeridos(pid) {
  const s = new Set();
  (window.App && window.App.pessoas || []).forEach(p => p.nome && s.add(p.nome));
  ativos('pj_partes').filter(x => !pid || x.projeto_id === pid).forEach(x => x.nome && s.add(x.nome));
  ativos('pj_projetos').forEach(p => { p.gerente && s.add(p.gerente); p.patrocinador && s.add(p.patrocinador); });
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
export const datalist = (id, nomes) => `<datalist id="${id}">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;

/* ---------------------------------------------------------------- EAP */
/** A EAP em ordem de árvore, com código (1, 1.1, 1.2…), nível e filhos. */
export function arvore(pid) {
  const itens = doProjeto('pj_eap', pid);
  const ids = new Set(itens.map(i => i.id));
  const filhos = id => itens.filter(i => (i.pai_id && ids.has(i.pai_id) ? i.pai_id : null) === id)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const lista = [];
  const andar = (pai, prefixo, nivel) => filhos(pai).forEach((it, i) => {
    const cod = prefixo ? prefixo + '.' + (i + 1) : String(i + 1);
    const f = filhos(it.id);
    lista.push({ ...it, _cod: cod, _nivel: nivel, _filhos: f.map(x => x.id), _folha: !f.length });
    andar(it.id, cod, nivel + 1);
  });
  andar(null, '', 0);
  // entrega sem datas próprias (atividade sumarizadora): início = o mais cedo
  // das de dentro, término = o mais tarde. De baixo para cima.
  const porId = Object.fromEntries(lista.map(i => [i.id, i]));
  for (let k = lista.length - 1; k >= 0; k--) {
    const it = lista[k];
    if (it._folha) continue;
    const fs = it._filhos.map(id => porId[id]);
    const inis = fs.map(f => f.inicio || f.fim).filter(Boolean).sort();
    const fins = fs.map(f => f.fim).filter(Boolean).sort();
    if (!it.inicio && inis.length) { it.inicio = inis[0]; it._datasDeDentro = true; }
    if (!it.fim && fins.length) { it.fim = fins[fins.length - 1]; it._datasDeDentro = true; }
  }
  return lista;
}
const duracao = it => {
  if (it.tipo === 'marco' || !it.inicio || !it.fim) return 1;
  return Math.max(1, diasEntre(it.inicio, it.fim) + 1);
};
/** Quanto da folha já deveria estar feito na data (0 a 1). */
function planejadoEm(it, d) {
  if (!it.fim) return 0;
  if (d >= it.fim) return 1;
  if (it.tipo === 'marco' || !it.inicio) return 0;
  if (d < it.inicio) return 0;
  return Math.min(1, (diasEntre(it.inicio, d) + 1) / duracao(it));
}

/** Números de um projeto: avanço, custos, valor agregado, atrasos, alertas. */
export function resumo(pid, hoje = hojeISO()) {
  const p = projeto(pid) || {};
  const arv = arvore(pid);
  const porId = Object.fromEntries(arv.map(i => [i.id, i]));
  const folhas = arv.filter(i => i._folha);
  // % e custo previsto de cada nó (folha = o próprio; pai = dos filhos)
  const calc = {};
  const no = id => {
    if (calc[id]) return calc[id];
    const it = porId[id];
    if (it._folha) {
      calc[id] = { pct: Number(it.pct || 0) / 100, plan: planejadoEm(it, hoje), peso: duracao(it), prev: Number(it.custo_previsto || 0) };
    } else {
      const fs = it._filhos.map(no);
      const peso = fs.reduce((s, f) => s + f.peso, 0) || 1;
      calc[id] = {
        pct: fs.reduce((s, f) => s + f.pct * f.peso, 0) / peso,
        plan: fs.reduce((s, f) => s + f.plan * f.peso, 0) / peso,
        peso, prev: fs.reduce((s, f) => s + f.prev, 0) + Number(it.custo_previsto || 0),
      };
    }
    return calc[id];
  };
  arv.forEach(i => no(i.id));
  const pesoT = folhas.reduce((s, f) => s + calc[f.id].peso, 0);
  const fisico = pesoT ? folhas.reduce((s, f) => s + calc[f.id].pct * calc[f.id].peso, 0) / pesoT : 0;
  const planejado = pesoT ? folhas.reduce((s, f) => s + calc[f.id].plan * calc[f.id].peso, 0) / pesoT : 0;
  const custos = doProjeto('pj_custos', pid);
  const custoReal = custos.reduce((s, c) => s + Number(c.valor || 0), 0);
  const previstoEap = arv.reduce((s, i) => s + Number(i.custo_previsto || 0), 0);
  const bac = previstoEap || Number(p.orcamento || 0);
  const vp = bac * planejado, va = bac * fisico;
  const spi = vp > 0 ? va / vp : null;
  const cpi = custoReal > 0 ? va / custoReal : null;
  const ativo = emAndamento(p);
  const atrasadas = ativo ? folhas.filter(f => f.fim && f.fim < hoje && Number(f.pct || 0) < 100) : [];
  const em7 = somarDias(hoje, 7);
  const aVencer = ativo ? folhas.filter(f => f.fim && f.fim >= hoje && f.fim <= em7 && Number(f.pct || 0) < 100) : [];
  const riscos = doProjeto('pj_riscos', pid);
  const riscosAbertos = riscos.filter(r => r.situacao === 'aberto' || r.situacao === 'tratamento');
  const riscosAltos = riscosAbertos.filter(r => r.tipo !== 'oportunidade' && nivelRisco(r) === 'alto');
  const altosSemPlano = riscosAltos.filter(r => !String(r.plano || '').trim());
  const mudancas = doProjeto('pj_mudancas', pid);
  const mudPend = mudancas.filter(m => m.situacao === 'pendente');
  const mudPendVelhas = mudPend.filter(m => m.data && diasEntre(m.data, hoje) > 7);
  const ocorrAbertas = doProjeto('pj_ocorrencias', pid).filter(o => o.situacao === 'aberta');
  const entregas = arv.filter(i => i.tipo === 'entrega');
  const prazoVencido = ativo && p.fim_previsto && p.fim_previsto < hoje && fisico < 1;
  return {
    p, arv, calc, folhas, entregas, fisico, planejado, custoReal, previstoEap, bac, vp, va, spi, cpi,
    atrasadas, aVencer, riscos, riscosAbertos, riscosAltos, altosSemPlano, mudancas, mudPend, mudPendVelhas,
    ocorrAbertas, prazoVencido, partes: partes(pid), comunicacao: doProjeto('pj_comunicacao', pid),
  };
}

/* ---------------------------------------------------------------- riscos */
export const nivelNum = r => Number(r.probabilidade || 0) * Number(r.impacto || 0);
export const nivelRisco = r => { const n = nivelNum(r); return n >= 15 ? 'alto' : n >= 6 ? 'medio' : 'baixo'; };
export const NOME_NIVEL = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
export const ESTRATEGIAS = {
  ameaca: ['Evitar', 'Mitigar', 'Transferir', 'Aceitar', 'Escalar'],
  oportunidade: ['Explorar', 'Melhorar', 'Compartilhar', 'Aceitar', 'Escalar'],
};
export const SIT_RISCO = { aberto: 'Aberto', tratamento: 'Em tratamento', ocorreu: 'Ocorreu', encerrado: 'Encerrado' };

/* ---------------------------------------------------------------- partes */
export const NIVEL3 = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' };
export function estrategiaParte(x) {
  const inf = Number(x.influencia || 2) >= 3, int = Number(x.interesse || 2) >= 3;
  if (inf && int) return 'Gerenciar de perto';
  if (inf) return 'Manter satisfeito';
  if (int) return 'Manter informado';
  return 'Monitorar';
}

/* ---------------------------------------------------------------- semáforos */
// 'verde' | 'amarelo' | 'vermelho' | 'cinza' (sem dado)
const porIndice = v => v == null ? 'cinza' : v >= 0.95 ? 'verde' : v >= 0.85 ? 'amarelo' : 'vermelho';
export function semaforos(r) {
  let prazo = porIndice(r.spi);
  if (r.prazoVencido) prazo = 'vermelho';
  else if (r.atrasadas.length && prazo === 'verde') prazo = 'amarelo';
  let custo = porIndice(r.cpi);
  const orc = Number(r.p.orcamento || 0);
  if (orc && r.custoReal > orc) custo = 'vermelho';
  else if (orc && r.custoReal > orc * 0.9 && custo === 'verde') custo = 'amarelo';
  if (custo === 'cinza' && orc) custo = 'verde';
  const recusadas = r.entregas.filter(e => e.aceite_situacao === 'recusada').length;
  const escopo = recusadas ? 'vermelho' : r.mudPend.length ? 'amarelo' : r.arv.length ? 'verde' : 'cinza';
  return { prazo, custo, escopo };
}

/* Saúde por domínio de desempenho do PMBOK 7 (calculada pelos dados). */
export function dominios(r) {
  const folhas = r.folhas.filter(f => f.tipo !== 'marco');
  const semResp = folhas.filter(f => !String(f.responsavel || '').trim()).length;
  const semDatas = r.folhas.filter(f => !f.fim).length;
  const semCriterio = r.entregas.filter(e => !String(e.criterio_aceite || '').trim()).length;
  const recusadas = r.entregas.filter(e => e.aceite_situacao === 'recusada').length;
  const idxMin = [r.spi, r.cpi].filter(v => v != null);
  const piorIdx = idxMin.length ? Math.min(...idxMin) : null;
  const d = [];
  d.push(['Partes interessadas', !r.partes.length ? 'vermelho' : !r.comunicacao.length ? 'amarelo' : 'verde',
    !r.partes.length ? 'nenhuma parte interessada cadastrada' : !r.comunicacao.length ? 'sem plano de comunicação' : r.partes.length + ' partes · plano de comunicação ok']);
  d.push(['Equipe', !folhas.length ? 'cinza' : semResp > folhas.length * 0.3 ? 'vermelho' : semResp ? 'amarelo' : 'verde',
    !folhas.length ? 'sem tarefas' : semResp ? semResp + ' tarefa(s) sem responsável' : 'todas as tarefas com responsável']);
  d.push(['Planejamento', !r.arv.length ? 'vermelho' : semDatas ? 'amarelo' : 'verde',
    !r.arv.length ? 'EAP vazia' : semDatas ? semDatas + ' item(ns) sem prazo' : 'EAP e cronograma completos']);
  d.push(['Trabalho do projeto', !r.folhas.length ? 'cinza' : r.atrasadas.length > Math.max(2, r.folhas.length * 0.2) ? 'vermelho' : r.atrasadas.length || r.ocorrAbertas.length ? 'amarelo' : 'verde',
    r.atrasadas.length + ' atrasada(s) · ' + r.ocorrAbertas.length + ' problema(s) em aberto']);
  d.push(['Entrega', !r.entregas.length ? 'cinza' : recusadas ? 'vermelho' : semCriterio ? 'amarelo' : 'verde',
    !r.entregas.length ? 'sem entregas' : recusadas ? recusadas + ' entrega(s) recusada(s)' : semCriterio ? semCriterio + ' entrega(s) sem critério de aceite' : 'entregas com critério de aceite']);
  d.push(['Medição', porIndice(piorIdx), piorIdx == null ? 'sem dados para IDP/IDC' : 'IDP ' + (r.spi == null ? '—' : num(r.spi)) + ' · IDC ' + (r.cpi == null ? '—' : num(r.cpi))]);
  d.push(['Incerteza', r.altosSemPlano.length ? 'vermelho' : !r.riscos.length || r.riscosAltos.length ? 'amarelo' : 'verde',
    !r.riscos.length ? 'nenhum risco registrado' : r.altosSemPlano.length ? r.altosSemPlano.length + ' risco(s) alto(s) sem plano' : r.riscosAltos.length + ' risco(s) alto(s) em aberto']);
  return d;
}
export const bolinha = (cor, titulo = '') => `<span class="pj-sem ${cor}" title="${esc(titulo)}"></span>`;
export const NOME_COR = { verde: 'No rumo', amarelo: 'Atenção', vermelho: 'Crítico', cinza: 'Sem dados' };

/* ---------------------------------------------------------------- passagem de fase */
/** O que falta para entrar na fase (avisa; não bloqueia — decisão dele). */
export function pendenciasPara(fase, r) {
  const p = r.p, falta = [];
  if (fase === 'planejamento') {
    if (!p.termo_aprovado_em) falta.push('termo de abertura aprovado');
    if (!String(p.objetivo || '').trim()) falta.push('objetivo no termo de abertura');
    if (!r.partes.length) falta.push('ao menos uma parte interessada');
  }
  if (fase === 'execucao') {
    if (!r.entregas.length) falta.push('EAP com ao menos uma entrega');
    if (r.folhas.some(f => !f.fim)) falta.push('prazo em todas as tarefas');
    if (!Number(p.orcamento || 0) && !r.previstoEap) falta.push('orçamento previsto');
    if (!r.riscos.length) falta.push('registro de riscos');
    if (!r.comunicacao.length) falta.push('plano de comunicação');
  }
  if (fase === 'encerramento') {
    const semAceite = r.entregas.filter(e => e.aceite_situacao !== 'aceita');
    if (semAceite.length) falta.push(semAceite.length + ' entrega(s) sem aceite');
    if (r.fisico < 0.999) falta.push('tarefas em 100%');
    if (r.mudPend.length) falta.push('decidir ' + r.mudPend.length + ' pedido(s) de mudança');
  }
  return falta;
}

export const CHECKLIST_ENC = [
  ['entregas', 'Entregas validadas e aceitas pelo patrocinador'],
  ['contratos', 'Contratos e compras do projeto encerrados'],
  ['custos', 'Custos finais lançados e conferidos'],
  ['documentos', 'Documentação do projeto arquivada'],
  ['equipe', 'Equipe liberada e reconhecida'],
  ['licoes', 'Lições aprendidas registradas'],
  ['comunicado', 'Encerramento comunicado às partes interessadas'],
];

/* Linhas de texto (critérios de sucesso, um por linha). */
export const linhas = s => String(s || '').split(/\n+/).map(x => x.replace(/^[-•▪*\s]+/, '').trim()).filter(Boolean);

/* ---------------------------------------------------------------- rede (CPM/PERT)
   Material do MBA (Plano de Projeto I e II): atividades com predecessoras e
   relação término-início (FI), início-início (II), término-término (TT) ou
   início-término (IT), com espera (lag, +) ou antecipação (lead, −) em dias.
   Caminho de ida → DIMC/DTMC; caminho de volta → DIMT/DTMT; folga total =
   DIMT − DIMC; folga livre = o que atrasa sem mexer na sucessora; crítico =
   folga total 0. As entregas são atividades sumarizadoras (a duração sai das
   de dentro), por isso a rede é feita só com as folhas da EAP. */
export const RELACOES = { FI: 'Término → Início', II: 'Início → Início', TT: 'Término → Término', IT: 'Início → Término' };
export const DEPENDENCIAS = { obrigatoria: 'Obrigatória', arbitrada: 'Arbitrada', externa: 'Externa', interna: 'Interna' };
const arred = v => Math.round(v * 10) / 10;

/** Duração da atividade em dias: PERT (O+4M+P)/6 se houver as 3 estimativas;
    senão a duração digitada; senão pelas datas. Marco = 0. */
export function duracaoDe(it) {
  if (it.tipo === 'marco') return { dur: 0, fonte: 'marco', sigma: 0 };
  const o = Number(it.dur_otimista), m = Number(it.dur_provavel), p = Number(it.dur_pessimista);
  if (it.dur_otimista != null && it.dur_provavel != null && it.dur_pessimista != null && !isNaN(o + m + p) && p >= o)
    return { dur: arred((o + 4 * m + p) / 6), fonte: 'PERT', sigma: (p - o) / 6 };
  if (it.duracao != null && it.duracao !== '' && !isNaN(Number(it.duracao))) return { dur: Number(it.duracao), fonte: 'informada', sigma: 0 };
  if (it.inicio && it.fim) return { dur: diasEntre(it.inicio, it.fim) + 1, fonte: 'datas', sigma: 0 };
  return { dur: 1, fonte: 'sem dado', sigma: 0 };
}

export function rede(r) {
  const folhas = r.folhas;
  const ids = new Set(folhas.map(f => f.id));
  const nos = {};
  folhas.forEach(f => {
    const d = duracaoDe(f);
    const preds = (Array.isArray(f.predecessoras) ? f.predecessoras : [])
      .filter(x => x && ids.has(x.id) && x.id !== f.id)
      .map(x => ({ id: x.id, rel: RELACOES[x.rel] ? x.rel : 'FI', lag: Number(x.lag || 0), dep: x.dep || 'obrigatoria' }));
    nos[f.id] = { it: f, dur: d.dur, fonte: d.fonte, sigma: d.sigma, preds, succs: [] };
  });
  Object.values(nos).forEach(n => n.preds.forEach(p => nos[p.id].succs.push({ id: n.it.id, rel: p.rel, lag: p.lag })));
  // ordem topológica (Kahn)
  const grau = Object.fromEntries(Object.keys(nos).map(k => [k, nos[k].preds.length]));
  const fila = Object.keys(nos).filter(k => !grau[k]);
  const ordem = [];
  while (fila.length) {
    const k = fila.shift(); ordem.push(k);
    nos[k].succs.forEach(s => { if (--grau[s.id] === 0) fila.push(s.id); });
  }
  const ciclo = ordem.length < Object.keys(nos).length;
  // caminho de ida
  ordem.forEach(k => {
    const n = nos[k];
    let es = 0;
    n.preds.forEach(p => {
      const a = nos[p.id];
      const v = p.rel === 'FI' ? a.ef + p.lag : p.rel === 'II' ? a.es + p.lag : p.rel === 'TT' ? a.ef + p.lag - n.dur : a.es + p.lag - n.dur;
      es = Math.max(es, v);
    });
    n.es = arred(es); n.ef = arred(es + n.dur);
  });
  const duracao = ordem.reduce((m, k) => Math.max(m, nos[k].ef), 0);
  // caminho de volta
  ordem.slice().reverse().forEach(k => {
    const n = nos[k];
    let lf = duracao;
    n.succs.forEach(s => {
      const b = nos[s.id];
      const v = s.rel === 'FI' ? b.ls - s.lag : s.rel === 'II' ? b.ls - s.lag + n.dur : s.rel === 'TT' ? b.lf - s.lag : b.lf - s.lag + n.dur;
      lf = Math.min(lf, v);
    });
    n.lf = arred(lf); n.ls = arred(lf - n.dur);
    n.ft = arred(n.ls - n.es);
    let fl = duracao - n.ef;
    n.succs.forEach(s => {
      const b = nos[s.id];
      const v = s.rel === 'FI' ? b.es - s.lag - n.ef : s.rel === 'II' ? b.es - s.lag - n.es : s.rel === 'TT' ? b.ef - s.lag - n.ef : b.ef - s.lag - n.es;
      fl = Math.min(fl, v);
    });
    n.fl = arred(Math.max(0, fl));
    n.critico = Math.abs(n.ft) < 0.05;
  });
  const criticos = ordem.filter(k => nos[k].critico);
  const sigma = Math.sqrt(criticos.reduce((s, k) => s + nos[k].sigma * nos[k].sigma, 0));
  const temDependencia = Object.values(nos).some(n => n.preds.length);
  return { nos, ordem, duracao, ciclo, criticos, sigma, temDependencia };
}
