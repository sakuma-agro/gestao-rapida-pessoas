// jornada-ferias.js — DP → Férias (23/09/2026)
//
// Regras aprovadas pelo Guilherme em 16/09/2026 (doc. 02 e protótipo):
//   • o app controla o DIREITO e o PRAZO; o dinheiro (valor, 1/3, abono, a
//     dobra do art. 137) fica com o escritório;
//   • "venceu" = completou o período aquisitivo (ganhou o direito);
//     "limite de gozo" = fim do período concessivo (12 meses depois);
//   • alerta em faixas de 90/60/30 dias até o limite, no painel de Férias, na
//     lista de funcionários e no painel do DP;
//   • quem tem acesso lança e já vale; a divisão das férias é só registrada,
//     sem conferir os mínimos; dias vendidos é campo manual;
//   • não emite aviso nem recibo de férias; não há férias coletivas;
//   • o pessoal tira férias "no papel" e continua trabalhando: boletim dentro
//     das férias é aceito e só SINALIZADO (painel, ficha e fechamento);
//   • faltas do período aquisitivo: todas as lançadas, só informativo;
//   • situação inicial: o último período já quitado de cada pessoa;
//   • afastamento INSS (doença ou acidente) com início e fim previsto,
//     prorrogável. Ele alimenta:
//       – RN-80: desconto do empréstimo bloqueado a partir do 16º dia;
//       – RN-95 / art. 133, IV: mais de 6 meses de benefício no período
//         aquisitivo faz perder o período. O app NÃO encerra sozinho: lista,
//         e alguém confirma — fica gravado quem.
//
// Nada de saldo gravado: o saldo de dias sai sempre dos lançamentos.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { podeTela } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];

/* ---------------- datas (sempre texto AAAA-MM-DD, sem fuso) ---------------- */
const D = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDias = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMeses = (s, n) => {
  const d = D(s), dia = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ult = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ult));
  return iso(r);
};
const addAnos = (s, n) => addMeses(s, 12 * n);
const dias = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
/* Carimbo de data/hora (criado_em, confirmado_em) vem em UTC: mostra no fuso local. */
const brTs = ts => { if (!ts) return '—'; const d = new Date(ts); return isNaN(d) ? br(ts) : d.toLocaleDateString('pt-BR'); };
const fimDoMes = comp => addDias(addMeses(comp.slice(0, 8) + '01', 1), -1);
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();

const pessoa = id => estado.funcionarios.find(f => f.id === id) || null;
const nomeDe = id => pessoa(id)?.nome || '—';
const admissao = f => (f?.admissao || '').slice(0, 10) || null;
const ativa = f => (f.situacao || 'ATIVO') === 'ATIVO';
const ativos = () => estado.funcionarios.filter(ativa)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/* ===================================================================
   AFASTAMENTOS
   =================================================================== */

export const TIPOS_AFAST = {
  auxilio_doenca:      'INSS — doença',
  acidente_trabalho:   'INSS — acidente de trabalho',
  licenca_maternidade: 'Licença-maternidade',
  outro:               'Outro',
};
/* Só o benefício do INSS por doença ou acidente conta para o 16º dia (RN-80)
   e para os 6 meses do art. 133, IV. A licença-maternidade não entra em
   nenhum dos dois. */
const INSS = new Set(['auxilio_doenca', 'acidente_trabalho']);

const afastamentos = () => (jd.dados.afastamentos || []).filter(a => a.situacao !== 'cancelado');
export const afastDe = fid => afastamentos().filter(a => a.funcionario_id === fid)
  .sort((a, b) => a.data_ini.localeCompare(b.data_ini));
const fimAfast = a => a.fim_real || a.fim_previsto;
const dia16 = a => addDias(a.data_ini, 15);

/** Afastado hoje (qualquer tipo)? */
export const afastadoHoje = fid => afastDe(fid).find(a => a.data_ini <= hoje() && fimAfast(a) >= hoje()) || null;

/** Afastamento que cobre algum dia da competência (qualquer tipo). */
export const afastadoNaComp = (fid, comp) => afastDe(fid)
  .find(a => a.data_ini <= fimDoMes(comp) && fimAfast(a) >= comp.slice(0, 8) + '01') || null;

/**
 * RN-80: a parcela do empréstimo não é descontada na competência em que a
 * pessoa está recebendo do INSS — do 16º dia de afastamento em diante.
 * Os 15 primeiros dias são pagos pela empresa e não bloqueiam.
 */
export function bloqueioInss(fid, comp) {
  const ini = comp.slice(0, 8) + '01', fim = fimDoMes(comp);
  return afastDe(fid).find(a => INSS.has(a.tipo) && dia16(a) <= fim && fimAfast(a) >= (dia16(a) > ini ? dia16(a) : ini)) || null;
}

/* ===================================================================
   PERÍODOS AQUISITIVOS
   =================================================================== */

const inicialDe = fid => (jd.dados.feriasInicial || []).find(x => x.funcionario_id === fid) || null;
const perdasDe = fid => (jd.dados.feriasPerdas || []).filter(p => p.funcionario_id === fid);
const gozos = () => (jd.dados.feriasGozos || []).filter(g => g.situacao === 'lancado');
const gozosDe = fid => gozos().filter(g => g.funcionario_id === fid)
  .sort((a, b) => a.data_ini.localeCompare(b.data_ini));

/**
 * Os períodos da pessoa, da admissão até `ate`. Período k: aquisitivo de
 * [início, início + 1 ano − 1 dia]; vence (ganha o direito) em início + 1 ano;
 * limite de gozo em início + 2 anos − 1 dia. Um período perdido (art. 133, IV)
 * faz o seguinte começar no retorno ao trabalho.
 */
export function periodosDe(fid, ate = addAnos(hoje(), 2)) {
  const f = pessoa(fid), adm = admissao(f);
  if (!adm) return [];
  const ini0 = inicialDe(fid);
  const quitadoAte = ini0?.ultimo_quitado_fim || null;
  const perdas = perdasDe(fid);
  const out = [];
  let ini = adm;
  for (let k = 1; ini <= ate && k < 80; k++) {
    const p = { k, iniAq: ini, fimAq: addDias(addAnos(ini, 1), -1), vence: addAnos(ini, 1), limite: addDias(addAnos(ini, 2), -1) };
    const perda = perdas.find(x => x.aquisitivo_ini === ini);
    const l = gozosDe(fid).filter(g => g.aquisitivo_ini === ini);
    p.lanc = l;
    p.goz = l.reduce((s, g) => s + dias(g.data_ini, g.data_fim) + 1, 0);
    p.vend = l.reduce((s, g) => s + (g.dias_vendidos || 0), 0);
    p.saldo = 30 - p.goz - p.vend;
    p.quitadoInicial = !!quitadoAte && p.fimAq <= quitadoAte;
    p.perdido = perda || null;
    out.push(p);
    ini = perda ? perda.novo_aquisitivo_ini : p.vence;
  }
  return out;
}

/** Precisa informar a situação inicial? Só quem já completou algum período. */
const precisaInicial = fid => {
  const adm = admissao(pessoa(fid));
  return !!adm && addAnos(adm, 1) <= hoje() && !inicialDe(fid);
};

/** Períodos que já venceram e ainda têm saldo — o que a pessoa tem a tirar. */
export function pendentes(fid) {
  if (precisaInicial(fid)) return [];
  return periodosDe(fid, hoje())
    .filter(p => p.vence <= hoje() && !p.quitadoInicial && !p.perdido && p.saldo > 0);
}

/** O período em formação: o próximo a vencer. */
export const proximo = fid => periodosDe(fid).find(p => p.vence > hoje() && !p.perdido) || null;

export const FAIXAS = {
  vencida: { rot: 'Limite vencido', cls: 'pv-perigo',  tag: 'perigo', txt: 'passou do limite de gozo' },
  f30:     { rot: 'Até 30 dias',    cls: 'pv-alerta',  tag: 'alerta', txt: 'limite em até 30 dias' },
  f60:     { rot: '31 a 60 dias',   cls: 'pv-atencao', tag: 'alerta', txt: 'limite em 31 a 60 dias' },
  f90:     { rot: '61 a 90 dias',   cls: 'pv-calma',   tag: 'ativo',  txt: 'limite em 61 a 90 dias' },
  emdia:   { rot: 'Em dia',         cls: 'pv-ok',      tag: 'neutra', txt: 'mais de 90 dias ou nada a tirar' },
  semini:  { rot: 'Sem situação inicial', cls: 'pv-ok', tag: 'neutra', txt: 'informe o último período quitado' },
  sem:     { rot: 'Sem admissão',   cls: 'pv-ok',      tag: 'neutra', txt: 'cadastro sem data de admissão' },
};
export function faixa(fid) {
  if (!admissao(pessoa(fid))) return 'sem';
  if (precisaInicial(fid)) return 'semini';
  const pend = pendentes(fid);
  if (!pend.length) return 'emdia';
  const f = dias(hoje(), pend[0].limite);
  if (f < 0) return 'vencida';
  if (f <= 30) return 'f30';
  if (f <= 60) return 'f60';
  if (f <= 90) return 'f90';
  return 'emdia';
}

/** Faltas lançadas dentro de um período (todas, compensadas ou não). */
export const faltasEm = (fid, p) => p ? (jd.dados.faltas || [])
  .filter(x => x.funcionario_id === fid && x.data >= p.iniAq && x.data <= p.fimAq).length : 0;

/** Férias lançadas que não casam com nenhum período (admissão mudou ou houve perda). */
export const orfas = () => gozos().filter(g => !periodosDe(g.funcionario_id).some(p => p.iniAq === g.aquisitivo_ini));

/** Boletins lançados dentro de férias lançadas. */
export const bolNasFerias = fid => (jd.dados.bolFerias || []).filter(b => b.funcionario_id === fid);

/**
 * Art. 133, IV — mais de 6 meses de benefício do INSS dentro do mesmo período
 * aquisitivo, mesmo em afastamentos separados. Conta do 16º dia em diante;
 * "mais de 6 meses" = a partir do 181º dia de benefício. Usa o fim previsto
 * para avisar antes; só dá para confirmar depois que a data passou.
 */
export function emRisco() {
  const r = [];
  const pessoas = [...new Set(afastamentos().filter(a => INSS.has(a.tipo)).map(a => a.funcionario_id))];
  for (const fid of pessoas) {
    const f = pessoa(fid);
    if (!f || !admissao(f)) continue;
    const afs = afastDe(fid).filter(a => INSS.has(a.tipo));
    for (const p of periodosDe(fid, addAnos(hoje(), 1))) {
      if (p.quitadoInicial) continue;
      let conta = 0, passa = null, ultimo = null;
      for (const a of afs) {
        const ini = dia16(a) > p.iniAq ? dia16(a) : p.iniAq;
        const fim = fimAfast(a) < p.fimAq ? fimAfast(a) : p.fimAq;
        if (ini > fim) continue;
        const n = dias(ini, fim) + 1;
        if (!passa && conta + n > 180) passa = addDias(ini, 180 - conta);
        conta += n;
        ultimo = a;
      }
      if (!passa && !p.perdido) continue;
      const ateHoje = afs.reduce((s, a) => {
        const ini = dia16(a) > p.iniAq ? dia16(a) : p.iniAq;
        const lim = [fimAfast(a), p.fimAq, hoje()].sort()[0];
        return ini > lim ? s : s + dias(ini, lim) + 1;
      }, 0);
      r.push({ fid, f, per: p, afast: ultimo, passa, diasPrev: conta, diasHoje: ateHoje,
        confirmavel: !!passa && passa <= hoje(), perda: p.perdido });
    }
  }
  return r.sort((a, b) => (a.perda ? 1 : 0) - (b.perda ? 1 : 0) || (a.passa || '').localeCompare(b.passa || ''));
}

/** Quem vence (ganha o direito) no mês AAAA-MM. */
export function vencimentosNoMes(ym, lista = ativos()) {
  const r = [];
  for (const f of lista) {
    if (!admissao(f)) continue;
    for (const p of periodosDe(f.id, addDias(ym + '-01', 400))) {
      if (p.perdido) continue;
      if (p.vence.slice(0, 7) === ym) r.push({ f, per: p });
      if (p.vence.slice(0, 7) > ym) break;
    }
  }
  return r.sort((a, b) => a.per.vence.localeCompare(b.per.vence) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
}

/* ---------------- destino de DP (filtro) ---------------- */
const destinoIdDe = fid => jd.unidadeDe(jd.vinculoDe(fid))?.destino_id || '';
const nomeDestino = fid => jd.dados.destinos.find(d => d.id === destinoIdDe(fid))?.nome || 'Sem destino';
const casaDestino = (fid, filtro) => !filtro || (filtro === '-' ? !destinoIdDe(fid) : destinoIdDe(fid) === filtro);

/* ===================================================================
   RESUMOS PARA OUTRAS TELAS
   =================================================================== */

export const podeVerFerias = () => podeTela('ferPainel');

/** Cartões do painel do DP. */
export function resumoPainel() {
  if (!podeVerFerias()) return null;
  const l = ativos();
  const cont = k => l.filter(f => faixa(f.id) === k).length;
  return {
    vencida: cont('vencida'), f30: cont('f30'), f60: cont('f60'), f90: cont('f90'),
    semini: cont('semini'),
    afastados: l.filter(f => afastadoHoje(f.id)).length,
    risco: emRisco().filter(r => r.passa && !r.perda).length,
    bolFerias: l.reduce((s, f) => s + bolNasFerias(f.id).length, 0),
  };
}

/** A etiqueta da lista de funcionários (Cadastros). Vazia quando nada a dizer. */
export function etiquetaFicha(fid) {
  if (!podeVerFerias() || !jd.dados.carregado) return '';
  const partes = [];
  const fx = faixa(fid);
  if (['vencida', 'f30', 'f60', 'f90'].includes(fx)) {
    const p = pendentes(fid)[0];
    const n = dias(hoje(), p.limite);
    partes.push(`<span class="tag ${FAIXAS[fx].tag}" title="Limite de gozo das férias do ${p.k}º período: ${br(p.limite)}">Férias: ${
      n < 0 ? `limite vencido há ${-n} dia(s)` : `limite em ${n} dia(s)`}</span>`);
  }
  const b = bolNasFerias(fid).length;
  if (b) partes.push(`<span class="tag alerta" title="Boletins lançados dentro de férias lançadas — informativo">${b} boletim(ns) nas férias</span>`);
  if (afastadoHoje(fid)) partes.push('<span class="tag neutra">Afastado</span>');
  return partes.join(' ');
}

/** Caixa do Fechamento: boletim dentro de férias e afastados, por destino. */
export function avisosFechamento(competencia, linhas) {
  const ini = competencia.slice(0, 8) + '01', fim = fimDoMes(competencia);
  const fer = [], afs = [];
  for (const l of linhas) {
    const fid = l.vinculo?.funcionario_id;
    if (!fid) continue;
    for (const g of gozosDe(fid).filter(g => g.data_ini <= fim && g.data_fim >= ini)) {
      const bs = (jd.dados.boletins || []).filter(b => b.funcionario_id === fid && b.situacao !== 'cancelado' &&
        b.data_fato >= g.data_ini && b.data_fato <= g.data_fim);
      if (bs.length) fer.push(`${l.nome}: ${bs.length} boletim(ns) entre ${br(g.data_ini)} e ${br(g.data_fim)}, dentro das férias`);
    }
    const a = afastadoNaComp(fid, competencia);
    if (a) afs.push(`${l.nome}: ${TIPOS_AFAST[a.tipo] || a.tipo} de ${br(a.data_ini)} a ${br(fimAfast(a))}${a.fim_real ? '' : ' (previsto)'}`);
  }
  if (!fer.length && !afs.length) return '';
  return `<div class="jor-caixa">
    ${fer.length ? `<b>Férias × boletim (informativo — nada foi bloqueado):</b>
      <ul class="jor-lista">${fer.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${afs.length ? `<b>Afastados na competência:</b>
      <ul class="jor-lista">${afs.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/* ===================================================================
   DOCUMENTOS
   =================================================================== */

function cabecalhoDoc(titulo, sub, direita) {
  return `<header class="rel-cabecalho">
    <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div>
    <div class="rel-comp">${direita}</div></header>`;
}
const rodapeLop = () => `<footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>`;
const assinaNota = () => `<p class="rel-nota">Emitido em ${br(hoje())} por ${esc(usuario() || '—')} · responsável: Guilherme Lopes, Gerente Administrativo.</p>`;
const rotDestino = filtro => !filtro ? 'Todos os destinos' : filtro === '-' ? 'Sem destino de DP' :
  (jd.dados.destinos.find(d => d.id === filtro)?.nome || '—');
const doFiltro = filtro => ativos().filter(f => casaDestino(f.id, filtro));

export function relVencidos(ym, filtro = '') {
  const l = vencimentosNoMes(ym, doFiltro(filtro));
  const grupos = {};
  l.forEach(x => (grupos[x.f.fazenda || 'Sem fazenda no cadastro'] ||= []).push(x));
  const mes = `${MESES_L[+ym.slice(5) - 1]} de ${ym.slice(0, 4)}`;
  return `<article class="rel">
    ${cabecalhoDoc('Férias que venceram no mês', `Quem ganhou o direito às férias em ${mes}`,
      `competência<strong>${MESES[+ym.slice(5) - 1]}/${ym.slice(0, 4)}</strong>${esc(rotDestino(filtro))}`)}
    ${Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([faz, g]) => `
      <div class="rel-secao">${esc(faz)}</div>
      <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Admissão</th><th>Período aquisitivo</th>
        <th>Venceu em</th><th>Limite de gozo</th><th class="rel-num">Faltas no aquisitivo</th></tr></thead>
      <tbody>${g.map(x => `<tr><td>${esc(x.f.nome)}</td><td>${br(admissao(x.f))}</td>
        <td>${x.per.k}º · ${br(x.per.iniAq)} a ${br(x.per.fimAq)}</td><td>${br(x.per.vence)}</td>
        <td>${br(x.per.limite)}</td><td class="rel-num">${faltasEm(x.f.id, x.per)}</td></tr>`).join('')}</tbody></table>`).join('')
      || '<p class="rel-vazio">Ninguém venceu neste mês.</p>'}
    <div class="rel-resumo"><b>${l.length} ${l.length === 1 ? 'pessoa venceu' : 'pessoas venceram'}</b> em ${esc(mes)}.
      Cada uma tem até o limite de gozo para tirar as férias sem pagamento em dobro (art. 137 da CLT).</div>
    <p class="rel-nota">Faltas: todas as lançadas no período aquisitivo, compensadas ou não — apenas informativo; o app não reduz os dias.</p>
    ${assinaNota()}${rodapeLop()}</article>`;
}

function mesesPrevisao() {
  const base = hoje().slice(0, 8) + '01';
  return Array.from({ length: 12 }, (_, i) => addMeses(base, i).slice(0, 7));
}

export function relPrevisao(filtro = '') {
  const lista = doFiltro(filtro);
  const meses = mesesPrevisao().map(ym => ({ ym, l: vencimentosNoMes(ym, lista) }));
  const tot = meses.reduce((s, m) => s + m.l.length, 0);
  const a = meses[0].ym, b = meses[11].ym;
  return `<article class="rel">
    ${cabecalhoDoc('Previsão de vencimento de férias', 'Próximos 12 meses, por mês de vencimento',
      `período<strong>${MESES[+a.slice(5) - 1]}/${a.slice(0, 4)} a ${MESES[+b.slice(5) - 1]}/${b.slice(0, 4)}</strong>${esc(rotDestino(filtro))}`)}
    <table class="rel-tabela"><thead><tr><th>Mês</th><th>Funcionário</th><th>Fazenda</th><th>Vence em</th><th>Limite de gozo</th></tr></thead>
    <tbody>${meses.flatMap(m => m.l.map((x, i) => `<tr><td>${i ? '' : `${MESES_L[+m.ym.slice(5) - 1]}/${m.ym.slice(0, 4)}`}</td>
      <td>${esc(x.f.nome)}</td><td>${esc(x.f.fazenda || '—')}</td><td>${br(x.per.vence)}</td><td>${br(x.per.limite)}</td></tr>`)).join('')
      || '<tr><td colspan="5" class="rel-vazio">Ninguém vence nos próximos 12 meses.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total de vencimentos no período</td><td class="rel-num">${tot}</td></tr></tfoot></table>
    <p class="rel-nota">Pessoas sem data de admissão não entram na previsão.</p>
    ${assinaNota()}${rodapeLop()}</article>`;
}

const ORDEM_FX = ['vencida', 'f30', 'f60', 'f90', 'emdia', 'semini', 'sem'];
export function relSituacao(filtro = '') {
  const l = doFiltro(filtro).slice().sort((a, b) =>
    ORDEM_FX.indexOf(faixa(a.id)) - ORDEM_FX.indexOf(faixa(b.id)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const comPend = l.filter(f => pendentes(f.id).length).length;
  return `<article class="rel">
    ${cabecalhoDoc('Situação de férias da equipe', 'Saldo e limite de gozo por pessoa',
      `posição em<strong>${br(hoje())}</strong>${esc(rotDestino(filtro))}`)}
    <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th>Período</th><th>Venceu em</th>
      <th>Limite de gozo</th><th class="rel-num">Saldo</th><th>Situação</th></tr></thead>
    <tbody>${l.map(f => {
      const pend = pendentes(f.id), p = pend[0], fx = faixa(f.id);
      return `<tr><td>${esc(f.nome)}</td><td>${esc(f.fazenda || '—')}</td>
        <td>${p ? `${p.k}º${pend.length > 1 ? ` (+${pend.length - 1})` : ''}` : '—'}</td>
        <td>${p ? br(p.vence) : '—'}</td><td>${p ? br(p.limite) : '—'}</td>
        <td class="rel-num">${p ? p.saldo + ' dias' : '—'}</td>
        <td class="${fx === 'emdia' ? 'rel-ok' : 'rel-pend'}">${FAIXAS[fx].rot}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="6">Pessoas com férias a tirar</td><td>${comPend} de ${l.length}</td></tr></tfoot></table>
    <p class="rel-nota">O app controla o direito e o prazo. Valor das férias, 1/3, abono e a dobra do art. 137 ficam com o escritório.</p>
    ${assinaNota()}${rodapeLop()}</article>`;
}

export function csvFerias(tipo, ym, filtro = '') {
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  let cols, linhas, nome;
  if (tipo === 'venc') {
    cols = ['Fazenda', 'Funcionario', 'Admissao', 'Periodo', 'Inicio aquisitivo', 'Fim aquisitivo', 'Venceu em', 'Limite de gozo', 'Faltas no aquisitivo'];
    linhas = vencimentosNoMes(ym, doFiltro(filtro)).map(x => [x.f.fazenda || '', x.f.nome, br(admissao(x.f)), x.per.k,
      br(x.per.iniAq), br(x.per.fimAq), br(x.per.vence), br(x.per.limite), faltasEm(x.f.id, x.per)]);
    nome = `Ferias_venceram_${ym}.csv`;
  } else if (tipo === 'prev') {
    cols = ['Mes', 'Funcionario', 'Fazenda', 'Vence em', 'Limite de gozo'];
    const lista = doFiltro(filtro);
    linhas = mesesPrevisao().flatMap(m => vencimentosNoMes(m, lista).map(x => [m, x.f.nome, x.f.fazenda || '', br(x.per.vence), br(x.per.limite)]));
    nome = `Ferias_previsao_${hoje()}.csv`;
  } else {
    cols = ['Funcionario', 'Fazenda', 'Destino', 'Periodo', 'Venceu em', 'Limite de gozo', 'Saldo (dias)', 'Situacao', 'Faltas no aquisitivo'];
    linhas = doFiltro(filtro).map(f => {
      const p = pendentes(f.id)[0];
      return [f.nome, f.fazenda || '', nomeDestino(f.id), p ? p.k : '', p ? br(p.vence) : '', p ? br(p.limite) : '',
        p ? p.saldo : '', FAIXAS[faixa(f.id)].rot, faltasEm(f.id, p || proximo(f.id))];
    });
    nome = `Ferias_situacao_${hoje()}.csv`;
  }
  return { nome, conteudo: '﻿' + [cols, ...linhas].map(l => l.map(q).join(';')).join('\r\n') };
}

/* ===================================================================
   TELAS
   =================================================================== */

let avisar = () => {};
let irPara = () => {};
const est = { faixa: null, destino: '', mes: null, rascunhoIni: new Map(), buscaIni: '' };

function cabecalho(titulo, sub) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">posição em<strong class="jor-cabecalho__competencia">${br(hoje())}</strong></div></header>`;
}

const filtroDestino = () => `<label class="fer-filtro">Destino de DP
  <select id="ferDestino" class="dc-mini">
    <option value="">Todos</option>
    ${jd.dados.destinos.filter(d => d.ativo !== false).map(d =>
      `<option value="${d.id}" ${est.destino === d.id ? 'selected' : ''}>${esc(d.nome)}</option>`).join('')}
    <option value="-" ${est.destino === '-' ? 'selected' : ''}>Sem destino</option>
  </select></label>`;
const ligarFiltro = redesenhar => $('ferDestino')?.addEventListener('change', ev => { est.destino = ev.target.value; redesenhar(); });

export async function abrirFerias(tela) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados: ' + e.message); }
  }
  if (tela === 'ferPainel') desenharPainel();
  if (tela === 'ferPrev') desenharPrevisao();
  if (tela === 'ferLanc') desenharLancamentos();
  if (tela === 'ferAfast') desenharAfastamentos();
  if (tela === 'ferRisco') desenharRisco();
  if (tela === 'ferIni') desenharInicial();
}

/* ---------------- Painel ---------------- */

function desenharPainel() {
  const lista = ativos().filter(f => casaDestino(f.id, est.destino));
  const cont = Object.fromEntries(Object.keys(FAIXAS).map(k => [k, 0]));
  lista.forEach(f => cont[faixa(f.id)]++);
  const vis = est.faixa ? lista.filter(f => faixa(f.id) === est.faixa) : lista;
  const risco = emRisco().filter(r => r.passa && !r.perda && casaDestino(r.fid, est.destino));
  const bol = lista.filter(f => bolNasFerias(f.id).length);
  const mostrar = Object.keys(FAIXAS).filter(k => cont[k] || !['semini', 'sem'].includes(k));

  $('telaFerPainel').innerHTML = cabecalho('Férias da equipe', 'Quem venceu, até quando pode tirar e quanto falta') + `
    <div class="jor-corpo">
      <div class="jor-barra">${filtroDestino()}<span class="dc-sem">${lista.length} pessoa(s) ativa(s)</span></div>
      <div class="pv-cards">
        ${mostrar.map(k => `<button type="button" class="pv-card ${FAIXAS[k].cls} ${cont[k] ? '' : 'pv-zero'}" aria-pressed="${est.faixa === k}" data-fx="${k}">
          <span>${FAIXAS[k].rot}</span><strong>${cont[k]}</strong><small>${FAIXAS[k].txt}</small></button>`).join('')}
      </div>
      <p class="dc-sem jor-nota">A cor mostra a distância do <b>limite de gozo</b> (fim do período concessivo). As faixas não se repetem:
        a soma dos cartões é ${lista.length}. Clique num cartão para filtrar a lista; clique na pessoa para ver os períodos.</p>
      ${cont.semini ? `<div class="jor-caixa alerta"><b>${cont.semini} pessoa(s) sem situação inicial.</b> Sem ela o app não sabe o que já foi tirado.
        <button class="btn mini" type="button" data-ir="ferIni">Informar situação inicial</button></div>` : ''}
      ${risco.length ? `<div class="jor-caixa alerta"><b>${risco.length} período(s) aquisitivo(s) em risco</b> — afastamento do INSS acima de 6 meses (art. 133, IV). O app não encerra sozinho.
        <button class="btn mini" type="button" data-ir="ferRisco">Conferir</button></div>` : ''}
      ${orfas().length ? `<div class="jor-caixa alerta"><b>${orfas().length} férias lançada(s) sem período correspondente</b> — a admissão mudou
        ou houve perda do período. Elas não entram no saldo até serem corrigidas.
        <button class="btn mini" type="button" data-ir="ferLanc">Abrir lançamentos</button></div>` : ''}
      ${bol.length ? `<div class="jor-caixa"><b>${bol.reduce((s, f) => s + bolNasFerias(f.id).length, 0)} boletim(ns) lançado(s) dentro de férias</b>
        (${bol.map(f => esc(f.nome)).join(', ')}). Informativo — nada foi bloqueado.</div>` : ''}
      <div class="fer-rola"><table class="dc-planilha fer-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th>Período a tirar</th><th>Venceu em</th>
        <th>Limite de gozo</th><th class="ce">Saldo</th><th class="ce">Faltas no aquisitivo</th><th>Situação</th></tr></thead><tbody>
        ${vis.map(f => {
          const fx = faixa(f.id), pend = pendentes(f.id), p = pend[0], nx = proximo(f.id);
          const n = p ? dias(hoje(), p.limite) : null;
          const b = bolNasFerias(f.id).length;
          return `<tr class="fer-clica" data-pessoa="${f.id}" tabindex="0">
            <td><b>${esc(f.nome)}</b>${b ? ` <span class="tag alerta">${b} boletim(ns) nas férias</span>` : ''}${afastadoHoje(f.id) ? ' <span class="tag neutra">afastado</span>' : ''}</td>
            <td>${esc(f.fazenda || '—')}<br><span class="dc-sem">${esc(nomeDestino(f.id))}</span></td>
            <td>${p ? `${p.k}º · ${br(p.iniAq)} a ${br(p.fimAq)}${pend.length > 1 ? `<br><span class="dc-sem">+${pend.length - 1} período(s) anterior(es) pendente(s)</span>` : ''}`
              : nx ? `<span class="dc-sem">em formação até ${br(nx.fimAq)}</span>` : '—'}</td>
            <td>${p ? br(p.vence) : nx ? `<span class="dc-sem">vence ${br(nx.vence)}</span>` : '—'}</td>
            <td>${p ? `${br(p.limite)}<br><span class="dc-sem">${n < 0 ? `há ${-n} dia(s)` : `em ${n} dia(s)`}</span>` : '—'}</td>
            <td class="ce">${p ? `${p.saldo} dias${p.goz || p.vend ? `<br><span class="dc-sem">tirou ${p.goz}${p.vend ? ` · vendeu ${p.vend}` : ''}</span>` : ''}` : '—'}</td>
            <td class="ce">${admissao(f) ? faltasEm(f.id, p || nx) : '—'}</td>
            <td><span class="tag ${FAIXAS[fx].tag}">${FAIXAS[fx].rot}</span></td></tr>`;
        }).join('') || '<tr><td colspan="8" class="vazio">Ninguém nesta faixa.</td></tr>'}
      </tbody></table></div>
      <p class="dc-sem jor-nota">"Faltas no aquisitivo" conta todas as faltas lançadas no período, compensadas ou não. Só informa: o app não reduz os dias.</p>
    </div>`;

  ligarFiltro(desenharPainel);
  document.querySelectorAll('#telaFerPainel [data-fx]').forEach(b => b.addEventListener('click', () => {
    est.faixa = est.faixa === b.dataset.fx ? null : b.dataset.fx; desenharPainel();
  }));
  document.querySelectorAll('#telaFerPainel [data-ir]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.ir)));
  document.querySelectorAll('#telaFerPainel tr[data-pessoa]').forEach(r => {
    r.addEventListener('click', () => fichaFerias(r.dataset.pessoa));
    r.addEventListener('keydown', ev => { if (ev.key === 'Enter') fichaFerias(r.dataset.pessoa); });
  });
}

/* Ficha de férias da pessoa: todos os períodos, com o que foi lançado. */
export function fichaFerias(fid) {
  const f = pessoa(fid);
  if (!f) return;
  if (!admissao(f)) {
    dialogo(`<h3>${esc(f.nome)}</h3><div class="jor-caixa alerta">Sem data de admissão no cadastro. Sem ela o app não sabe quando as férias vencem.</div>
      ${rodape('<button class="btn principal" type="button" id="ferIrCad">Abrir o cadastro</button>', 'Fechar')}`, () =>
      $('ferIrCad').addEventListener('click', () => { $('dlgFer').close(); irPara('funcionarios'); }));
    return;
  }
  const ini = inicialDe(fid);
  const pers = periodosDe(fid, hoje()).filter(p => p.iniAq <= hoje());
  const b = bolNasFerias(fid);
  dialogo(`<h3>${esc(f.nome)}</h3>
    <p class="dc-sem">${esc(f.fazenda || '—')} · ${esc(nomeDestino(fid))} · admitido em ${br(admissao(f))}
      ${ini ? ` · situação inicial: ${ini.ultimo_quitado_fim ? `quitado até ${br(ini.ultimo_quitado_fim)}` : 'nenhum período quitado'}` : ''}</p>
    ${precisaInicial(fid) ? '<div class="jor-caixa alerta">Falta a situação inicial desta pessoa — os períodos abaixo ainda não dizem o que já foi tirado.</div>' : ''}
    ${b.length ? `<div class="jor-caixa">${b.length} boletim(ns) lançado(s) dentro de férias: ${b.slice(0, 8).map(x => br(x.data_fato)).join(', ')}${b.length > 8 ? '…' : ''}. Informativo.</div>` : ''}
    ${afastDe(fid).length ? `<div class="jor-caixa">Afastamentos: ${afastDe(fid).map(a => `${TIPOS_AFAST[a.tipo]} de ${br(a.data_ini)} a ${br(fimAfast(a))}${a.fim_real ? '' : ' (previsto)'}`).join('; ')}</div>` : ''}
    <div class="fer-rola"><table class="dc-planilha"><thead><tr><th>Período</th><th>Aquisitivo</th><th>Venceu</th><th>Limite</th>
      <th>Férias lançadas</th><th class="ce">Faltas</th><th>Situação</th></tr></thead><tbody>
      ${pers.map(p => {
        const venceu = p.vence <= hoje();
        const sit = p.perdido ? `<span class="tag perigo">Perdido (art. 133, IV)</span>`
          : p.quitadoInicial ? '<span class="tag neutra">Quitado (situação inicial)</span>'
          : !venceu ? '<span class="tag neutra">Em formação</span>'
          : p.saldo <= 0 ? '<span class="tag ativo">Quitado</span>'
          : `<span class="tag ${dias(hoje(), p.limite) < 0 ? 'perigo' : 'alerta'}">Saldo ${p.saldo} dias</span>`;
        return `<tr><td>${p.k}º</td><td>${br(p.iniAq)} a ${br(p.fimAq)}</td><td>${br(p.vence)}</td><td>${br(p.limite)}</td>
          <td>${p.lanc.map(g => `${br(g.data_ini)} a ${br(g.data_fim)} (${dias(g.data_ini, g.data_fim) + 1}d)${g.dias_vendidos ? ` · vendeu ${g.dias_vendidos}` : ''}`).join('<br>') || '—'}</td>
          <td class="ce">${faltasEm(fid, p)}</td><td>${sit}</td></tr>`;
      }).reverse().join('')}
    </tbody></table></div>
    ${rodape('<button class="btn principal" type="button" id="ferLancaAqui">Lançar férias</button>', 'Fechar')}`, () =>
    $('ferLancaAqui').addEventListener('click', () => dlgFerias(fid)));
}

/* ---------------- Previsão ---------------- */

function desenharPrevisao() {
  const lista = ativos().filter(f => casaDestino(f.id, est.destino));
  const meses = mesesPrevisao().map(ym => ({ ym, l: vencimentosNoMes(ym, lista) }));
  const max = Math.max(1, ...meses.map(m => m.l.length));
  const sel = meses.find(m => m.ym === est.mes) ? est.mes : meses[0].ym;
  const ms = meses.find(m => m.ym === sel);
  $('telaFerPrev').innerHTML = cabecalho('Previsão de vencimentos', 'Quantas pessoas ganham o direito às férias em cada mês') + `
    <div class="jor-corpo">
      <div class="jor-barra">${filtroDestino()}</div>
      <div class="fer-prev">${meses.map(m => `<button type="button" data-mes="${m.ym}" aria-pressed="${m.ym === sel}"
        title="${m.l.length} em ${MESES_L[+m.ym.slice(5) - 1]}"><b>${m.l.length}</b><span class="fer-barra" style="height:${Math.round(m.l.length / max * 100)}%"></span></button>`).join('')}</div>
      <div class="fer-prev-rot">${meses.map(m => `<span>${MESES[+m.ym.slice(5) - 1]}/${m.ym.slice(2, 4)}</span>`).join('')}</div>
      <h3 class="jor-h3">${MESES_L[+sel.slice(5) - 1]} de ${sel.slice(0, 4)} · ${ms.l.length} ${ms.l.length === 1 ? 'pessoa' : 'pessoas'}</h3>
      <table class="dc-planilha"><thead><tr><th>Vence em</th><th>Funcionário</th><th>Fazenda</th><th>Período aquisitivo</th><th>Limite de gozo</th></tr></thead><tbody>
        ${ms.l.map(x => `<tr><td>${br(x.per.vence)}</td><td>${esc(x.f.nome)}</td><td>${esc(x.f.fazenda || '—')}</td>
          <td>${x.per.k}º · ${br(x.per.iniAq)} a ${br(x.per.fimAq)}</td><td>${br(x.per.limite)}</td></tr>`).join('')
          || '<tr><td colspan="5" class="vazio">Ninguém vence neste mês.</td></tr>'}
      </tbody></table>
      <div class="jor-acoes"><button class="btn" type="button" data-ir="jorRelatorios">Emitir relatório (DP › Relatórios)</button></div>
    </div>`;
  ligarFiltro(desenharPrevisao);
  document.querySelectorAll('#telaFerPrev [data-mes]').forEach(b => b.addEventListener('click', () => { est.mes = b.dataset.mes; desenharPrevisao(); }));
  document.querySelectorAll('#telaFerPrev [data-ir]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.ir)));
}

/* ---------------- Lançamentos ---------------- */

function desenharLancamentos() {
  const l = gozos().slice().sort((a, b) => b.data_ini.localeCompare(a.data_ini));
  const perDe = g => periodosDe(g.funcionario_id).find(p => p.iniAq === g.aquisitivo_ini);
  $('telaFerLanc').innerHTML = cabecalho('Férias lançadas', 'Cada parte das férias é um lançamento') + `
    <div class="jor-corpo">
      <div class="jor-barra"><span class="dc-sem" style="flex:1">O app registra o que for informado — não confere os mínimos da divisão nem calcula valores.</span>
        <button class="btn principal" type="button" id="ferNova">Lançar férias</button></div>
      ${l.length ? `<table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Período aquisitivo</th><th>Gozo</th>
        <th class="ce">Dias</th><th class="ce">Vendidos</th><th>Lançado por</th><th></th></tr></thead><tbody>
        ${l.map(g => {
          const p = perDe(g);
          const b = bolNasFerias(g.funcionario_id).filter(x => x.data_fato >= g.data_ini && x.data_fato <= g.data_fim).length;
          return `<tr><td><b>${esc(nomeDe(g.funcionario_id))}</b>${b ? ` <span class="tag alerta">${b} boletim(ns) no período</span>` : ''}${
            p ? '' : ' <span class="tag perigo" title="O período deste lançamento não existe mais (mudou a admissão ou houve perda do período). Use Corrigir para apontar o período certo.">sem período — corrigir</span>'}</td>
            <td>${p ? `${p.k}º · ` : ''}${br(g.aquisitivo_ini)}${p ? ` a ${br(p.fimAq)}` : ''}</td>
            <td>${br(g.data_ini)} a ${br(g.data_fim)}</td><td class="ce">${dias(g.data_ini, g.data_fim) + 1}</td>
            <td class="ce">${g.dias_vendidos || '—'}</td>
            <td>${esc(g.criado_por || '—')}<br><span class="dc-sem">${brTs(g.criado_em)}</span>${g.observacao ? `<br><span class="dc-sem">${esc(g.observacao)}</span>` : ''}</td>
            <td class="ce"><button class="btn mini" type="button" data-corrigir="${g.id}">Corrigir</button>
              <button class="btn mini perigo" type="button" data-cancelar="${g.id}">Cancelar</button></td></tr>`;
        }).join('')}</tbody></table>` : '<div class="vazio">Nenhuma férias lançada ainda.</div>'}
    </div>`;
  $('ferNova').addEventListener('click', () => dlgFerias());
  document.querySelectorAll('#telaFerLanc [data-corrigir]').forEach(b => b.addEventListener('click', () => dlgFerias(null, b.dataset.corrigir)));
  document.querySelectorAll('#telaFerLanc [data-cancelar]').forEach(b => b.addEventListener('click', () => cancelarGozo(b.dataset.cancelar)));
}

function dlgFerias(fidIni, gozoId) {
  const ed = gozoId ? gozos().find(g => g.id === gozoId) : null;
  const lista = ativos().filter(f => admissao(f));
  if (!lista.length) { avisar('Nenhum funcionário ativo com data de admissão.'); return; }
  const fid0 = ed ? ed.funcionario_id : (fidIni && lista.some(f => f.id === fidIni) ? fidIni : '');
  dialogo(`<h3>${ed ? 'Corrigir férias' : 'Lançar férias'}</h3>
    <p class="dc-sem">Registra o período que a pessoa tirou ou vai tirar. Nada é calculado em dinheiro.</p>
    <div class="grade">
      <label class="campo plena">Funcionário<select id="ferP" ${ed ? 'disabled' : ''}>
        <option value=""></option>${lista.map(f => `<option value="${f.id}" ${f.id === fid0 ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
      <label class="campo plena">Período aquisitivo<select id="ferK"></select></label>
      <label class="campo">Início<input type="date" id="ferI" value="${ed ? ed.data_ini : ''}"></label>
      <label class="campo">Fim<input type="date" id="ferF" value="${ed ? ed.data_fim : ''}"></label>
      <label class="campo">Dias vendidos <small>opcional</small><input type="number" id="ferV" min="0" max="10" step="1" value="${ed?.dias_vendidos || ''}" placeholder="0"></label>
      <label class="campo plena">Observação <small>opcional</small><input type="text" id="ferObs" maxlength="200" value="${esc(ed?.observacao || '')}"></label>
    </div>
    <p class="dc-sem" id="ferResumo"></p>
    <div id="ferBol"></div>
    ${ed ? campoJust() : ''}
    ${rodape(`<button class="btn principal" type="button" id="ferOk">${ed ? 'Gravar correção' : 'Lançar férias'}</button>`)}`, () => {
    const opcK = () => {
      const fid = $('ferP').value;
      if (!fid) { $('ferK').innerHTML = ''; return; }
      const pend = pendentes(fid), nx = proximo(fid);
      const ops = pend.map(p => [p.iniAq, `${p.k}º · ${br(p.iniAq)} a ${br(p.fimAq)} — saldo ${p.saldo} dias`]);
      if (ed && !ops.some(o => o[0] === ed.aquisitivo_ini)) {
        const p = periodosDe(fid).find(x => x.iniAq === ed.aquisitivo_ini);
        ops.unshift([ed.aquisitivo_ini, p ? `${p.k}º · ${br(p.iniAq)} a ${br(p.fimAq)}` : br(ed.aquisitivo_ini)]);
      }
      if (nx && !ops.some(o => o[0] === nx.iniAq)) ops.push([nx.iniAq, `${nx.k}º · ${br(nx.iniAq)} a ${br(nx.fimAq)} — em formação (antecipação)`]);
      $('ferK').innerHTML = ops.map(o => `<option value="${o[0]}" ${ed && o[0] === ed.aquisitivo_ini ? 'selected' : ''}>${o[1]}</option>`).join('');
    };
    const resumo = () => {
      const fid = $('ferP').value, k = $('ferK').value, ini = $('ferI').value, fim = $('ferF').value, v = Number($('ferV').value) || 0;
      const semIni = fid && precisaInicial(fid)
        ? '<div class="jor-caixa alerta">Esta pessoa ainda não tem situação inicial. Informe primeiro em "Situação inicial" para os períodos saírem certos.</div>' : '';
      $('ferBol').innerHTML = semIni;
      if (!fid) { $('ferResumo').textContent = 'Escolha o funcionário.'; return; }
      if (!ini || !fim) { $('ferResumo').textContent = 'Informe o início e o fim.'; return; }
      if (fim < ini) { $('ferResumo').innerHTML = '<span class="jor-pend">O fim não pode ser antes do início.</span>'; return; }
      const p = periodosDe(fid).find(x => x.iniAq === k);
      const n = dias(ini, fim) + 1;
      const ant = ed && ed.aquisitivo_ini === k ? (dias(ed.data_ini, ed.data_fim) + 1 + (ed.dias_vendidos || 0)) : 0;
      const saldo = p ? p.saldo + ant - n - v : null;
      $('ferResumo').innerHTML = `<b>${n} dia(s)</b> de gozo${v ? ` + ${v} vendido(s)` : ''}.${saldo != null ? ` Saldo do período depois deste lançamento: <b>${saldo} dias</b>.` : ''}${
        saldo != null && saldo < 0 ? ' <span class="jor-pend">Passa de 30 dias — confira.</span>' : ''}`;
      const bs = (jd.dados.boletins || []).filter(b => b.funcionario_id === fid && b.situacao !== 'cancelado' && b.data_fato >= ini && b.data_fato <= fim);
      const outro = gozos().find(g => g.funcionario_id === fid && g.id !== ed?.id && g.data_ini <= fim && g.data_fim >= ini);
      $('ferBol').innerHTML = semIni + (bs.length ? `<div class="jor-caixa">Há ${bs.length} boletim(ns) lançado(s) dentro destas datas. O lançamento é aceito; o painel e o fechamento vão sinalizar.</div>` : '')
        + (outro ? `<div class="jor-caixa alerta">Já existem férias lançadas de ${br(outro.data_ini)} a ${br(outro.data_fim)} que cruzam estas datas.</div>` : '');
    };
    $('ferP').addEventListener('change', () => { opcK(); resumo(); });
    ['ferK', 'ferI', 'ferF', 'ferV'].forEach(i => $(i).addEventListener('input', resumo));
    opcK(); resumo();
    aoClicar('ferOk', async () => {
      const fid = $('ferP').value, k = $('ferK').value, ini = $('ferI').value, fim = $('ferF').value;
      const v = Math.floor(Number($('ferV').value) || 0);
      const erro = t => { $('ferDlgErro').textContent = t; };
      if (!fid) return erro('Escolha o funcionário.');
      if (!k) return erro('Escolha o período aquisitivo.');
      if (!ini || !fim || fim < ini) return erro('Confira as datas: o fim não pode ser antes do início.');
      if (v < 0 || v > 10) return erro('Dias vendidos vai de 0 a 10 (até 1/3 das férias, art. 143).');
      let j = null;
      if (ed) { j = exigeJust(); if (!j) return; }
      const novo = { ...(ed || { funcionario_id: fid, situacao: 'lancado', criado_por: usuario(), criado_em: agora() }),
        aquisitivo_ini: k, data_ini: ini, data_fim: fim, dias_vendidos: v, observacao: $('ferObs').value.trim() || null };
      delete novo.dias;   // coluna calculada no banco
      const g = await jd.salvar('feriasGozos', novo);
      await jd.registrar({ tabela: 'jor_ferias_gozos', registro_id: g.id, acao: ed ? 'update' : 'insert', antes: ed || null, depois: g, justificativa: j });
      try { await jd.carregarApoioFerias(); } catch {}
      $('dlgFer').close();
      avisar(ed ? 'Correção gravada, com o valor anterior e o novo na trilha.' : `Férias de ${nomeDe(fid)} lançadas.`, true);
      redesenharAtual();
    });
  });
}

function cancelarGozo(id) {
  const g = gozos().find(x => x.id === id);
  if (!g) return;
  dialogo(`<h3>Cancelar lançamento de férias</h3>
    <p class="dc-sem">${esc(nomeDe(g.funcionario_id))} · ${br(g.data_ini)} a ${br(g.data_fim)}. O lançamento sai do saldo, mas continua na trilha com quem cancelou.</p>
    ${campoJust()}${rodape('<button class="btn principal" type="button" id="ferOk">Cancelar lançamento</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const j = exigeJust(); if (!j) return;
      const novo = { ...g, situacao: 'cancelado', cancel_motivo: j };
      delete novo.dias;
      await jd.salvar('feriasGozos', novo);
      await jd.registrar({ tabela: 'jor_ferias_gozos', registro_id: g.id, acao: 'cancelar', antes: g, depois: novo, justificativa: j });
      try { await jd.carregarApoioFerias(); } catch {}
      $('dlgFer').close(); avisar('Lançamento cancelado. A trilha guardou o registro anterior.', true); redesenharAtual();
    }));
}

/* ---------------- Afastamentos ---------------- */

function desenharAfastamentos() {
  const l = (jd.dados.afastamentos || []).slice().sort((a, b) => b.data_ini.localeCompare(a.data_ini));
  $('telaFerAfast').innerHTML = cabecalho('Afastamentos', 'Do primeiro dia do afastamento até o retorno') + `
    <div class="jor-corpo">
      <div class="jor-barra"><span class="dc-sem" style="flex:1">Com o afastamento lançado, o app sabe sozinho quando bloquear o desconto do empréstimo
        (16º dia, INSS) e quando o período aquisitivo entra em risco (mais de 6 meses de INSS).</span>
        <button class="btn principal" type="button" id="ferNovoAf">Lançar afastamento</button></div>
      ${l.length ? `<table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Motivo</th><th>Início</th><th>Fim</th>
        <th>16º dia</th><th>6 meses</th><th>Situação</th><th></th></tr></thead><tbody>
        ${l.map(a => {
          const inss = INSS.has(a.tipo), fim = fimAfast(a), d16 = dia16(a), m6 = addDias(d16, 180);
          const cancel = a.situacao === 'cancelado';
          const sit = cancel ? '<span class="tag neutra">Cancelado</span>'
            : a.fim_real ? '<span class="tag neutra">Retornou</span>'
            : a.data_ini > hoje() ? '<span class="tag neutra">Programado</span>'
            : '<span class="tag alerta">Afastado</span>';
          return `<tr${cancel ? ' class="fer-apagado"' : ''}><td><b>${esc(nomeDe(a.funcionario_id))}</b>${a.observacao ? `<br><span class="dc-sem">${esc(a.observacao)}</span>` : ''}</td>
            <td>${esc(TIPOS_AFAST[a.tipo] || a.tipo)}</td><td>${br(a.data_ini)}</td>
            <td>${br(fim)}${a.fim_real ? '' : '<br><span class="dc-sem">previsto</span>'}</td>
            <td>${inss ? (d16 <= fim ? `${br(d16)}${d16 <= hoje() && !cancel ? '<br><span class="dc-sem">desconto bloqueado</span>' : ''}` : '<span class="dc-sem">não chega</span>') : '<span class="dc-sem">não se aplica</span>'}</td>
            <td>${inss ? (m6 <= fim ? br(m6) : '<span class="dc-sem">não chega</span>') : '<span class="dc-sem">não se aplica</span>'}</td>
            <td>${sit}</td>
            <td class="ce">${!cancel && !a.fim_real ? `<button class="btn mini" type="button" data-prorr="${a.id}">Prorrogar</button>
              <button class="btn mini" type="button" data-ret="${a.id}">Registrar retorno</button>` : ''}
              ${!cancel ? `<button class="btn mini perigo" type="button" data-canaf="${a.id}">Cancelar</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="vazio">Nenhum afastamento lançado.</div>'}
      <p class="dc-sem jor-nota">"6 meses" é o dia em que o benefício do INSS passa de 180 dias (conta do 16º dia). Afastamentos separados dentro do mesmo período aquisitivo somam.</p>
    </div>`;
  $('ferNovoAf').addEventListener('click', dlgAfastamento);
  document.querySelectorAll('#telaFerAfast [data-prorr]').forEach(b => b.addEventListener('click', () => dlgProrrogar(b.dataset.prorr)));
  document.querySelectorAll('#telaFerAfast [data-ret]').forEach(b => b.addEventListener('click', () => dlgRetorno(b.dataset.ret)));
  document.querySelectorAll('#telaFerAfast [data-canaf]').forEach(b => b.addEventListener('click', () => dlgCancelarAfast(b.dataset.canaf)));
}

function dlgAfastamento() {
  dialogo(`<h3>Lançar afastamento</h3>
    <div class="grade">
      <label class="campo plena">Funcionário<select id="afP"><option value=""></option>
        ${ativos().map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
      <label class="campo plena">Motivo<select id="afT">${Object.entries(TIPOS_AFAST).map(([k, r]) => `<option value="${k}">${r}</option>`).join('')}</select></label>
      <label class="campo">Primeiro dia<input type="date" id="afI" value="${hoje()}"></label>
      <label class="campo">Fim previsto<input type="date" id="afF"></label>
      <label class="campo plena">Observação <small>opcional</small><input type="text" id="afObs" maxlength="200" placeholder="Ex.: nº do benefício, CID não"></label>
    </div>
    <p class="dc-sem">Se o INSS prorrogar, use "Prorrogar" e informe o novo fim. O histórico fica na trilha.</p>
    ${rodape('<button class="btn principal" type="button" id="ferOk">Lançar afastamento</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const fid = $('afP').value, ini = $('afI').value, fim = $('afF').value;
      if (!fid) return ($('ferDlgErro').textContent = 'Escolha o funcionário.');
      if (!ini || !fim) return ($('ferDlgErro').textContent = 'Informe o primeiro dia e o fim previsto.');
      if (fim < ini) return ($('ferDlgErro').textContent = 'O fim previsto não pode ser antes do primeiro dia.');
      const cruza = afastDe(fid).find(a => a.data_ini <= fim && fimAfast(a) >= ini);
      if (cruza) return ($('ferDlgErro').textContent = `Já existe afastamento de ${br(cruza.data_ini)} a ${br(fimAfast(cruza))} nessas datas. Use "Prorrogar".`);
      const a = { funcionario_id: fid, tipo: $('afT').value, data_ini: ini, fim_previsto: fim, fim_real: null,
        observacao: $('afObs').value.trim() || null, situacao: 'ativo', criado_por: usuario(), criado_em: agora() };
      const g = await jd.salvar('afastamentos', a);
      await jd.registrar({ tabela: 'jor_afastamentos', registro_id: g.id, acao: 'insert', depois: g });
      $('dlgFer').close(); avisar(`Afastamento de ${nomeDe(fid)} lançado.`, true); redesenharAtual();
    }));
}

function dlgProrrogar(id) {
  const a = (jd.dados.afastamentos || []).find(x => x.id === id);
  if (!a) return;
  dialogo(`<h3>Prorrogar afastamento</h3><p class="dc-sem">${esc(nomeDe(a.funcionario_id))} · fim previsto atual ${br(a.fim_previsto)}</p>
    <div class="grade"><label class="campo">Novo fim previsto<input type="date" id="afNf" value="${addMeses(a.fim_previsto, 1)}"></label></div>
    ${campoJust()}${rodape('<button class="btn principal" type="button" id="ferOk">Gravar prorrogação</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const nf = $('afNf').value;
      if (!nf || nf <= a.fim_previsto) return ($('ferDlgErro').textContent = `O novo fim precisa ser depois de ${br(a.fim_previsto)}.`);
      const cruza = afastDe(a.funcionario_id).find(x => x.id !== a.id && x.data_ini <= nf && fimAfast(x) >= a.data_ini);
      if (cruza) return ($('ferDlgErro').textContent = `Cruza com o afastamento de ${br(cruza.data_ini)} a ${br(fimAfast(cruza))}. Confira as datas.`);
      const j = exigeJust(); if (!j) return;
      const novo = { ...a, fim_previsto: nf };
      await jd.salvar('afastamentos', novo);
      await jd.registrar({ tabela: 'jor_afastamentos', registro_id: a.id, acao: 'prorrogar', antes: a, depois: novo, justificativa: j });
      $('dlgFer').close(); avisar('Prorrogação gravada.', true); redesenharAtual();
    }));
}

function dlgRetorno(id) {
  const a = (jd.dados.afastamentos || []).find(x => x.id === id);
  if (!a) return;
  const sug = a.fim_previsto < hoje() ? a.fim_previsto : addDias(hoje(), -1) < a.data_ini ? a.data_ini : addDias(hoje(), -1);
  dialogo(`<h3>Registrar retorno</h3><p class="dc-sem">${esc(nomeDe(a.funcionario_id))} · afastado desde ${br(a.data_ini)}.
    Informe o último dia de afastamento; a partir do dia seguinte as parcelas do empréstimo voltam a ser descontadas.</p>
    <div class="grade"><label class="campo">Último dia afastado<input type="date" id="afRt" value="${sug}"></label></div>
    ${campoJust('Observação (obrigatória)')}${rodape('<button class="btn principal" type="button" id="ferOk">Registrar retorno</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const d = $('afRt').value;
      if (!d || d < a.data_ini) return ($('ferDlgErro').textContent = `O último dia não pode ser antes de ${br(a.data_ini)}.`);
      const j = exigeJust(); if (!j) return;
      const novo = { ...a, fim_real: d, situacao: 'encerrado' };
      await jd.salvar('afastamentos', novo);
      await jd.registrar({ tabela: 'jor_afastamentos', registro_id: a.id, acao: 'retorno', antes: a, depois: novo, justificativa: j });
      $('dlgFer').close(); avisar('Retorno registrado.', true); redesenharAtual();
    }));
}

function dlgCancelarAfast(id) {
  const a = (jd.dados.afastamentos || []).find(x => x.id === id);
  if (!a) return;
  dialogo(`<h3>Cancelar afastamento</h3><p class="dc-sem">${esc(nomeDe(a.funcionario_id))} · ${br(a.data_ini)} a ${br(fimAfast(a))}.
    Use só quando foi lançado por engano — o registro continua na trilha.</p>
    ${campoJust()}${rodape('<button class="btn principal" type="button" id="ferOk">Cancelar afastamento</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const j = exigeJust(); if (!j) return;
      const novo = { ...a, situacao: 'cancelado', cancel_motivo: j };
      await jd.salvar('afastamentos', novo);
      await jd.registrar({ tabela: 'jor_afastamentos', registro_id: a.id, acao: 'cancelar', antes: a, depois: novo, justificativa: j });
      $('dlgFer').close(); avisar('Afastamento cancelado.', true); redesenharAtual();
    }));
}

/* ---------------- Períodos em risco ---------------- */

function desenharRisco() {
  const l = emRisco();
  $('telaFerRisco').innerHTML = cabecalho('Períodos aquisitivos em risco', 'Afastamento do INSS acima de 6 meses (art. 133, IV)') + `
    <div class="jor-corpo">
      <div class="jor-caixa">Mais de 6 meses de benefício do INSS (doença ou acidente) dentro do período aquisitivo fazem perder o direito
        àquele período. <b>O app só avisa.</b> Quem encerra é você, e fica gravado quem confirmou. Ao encerrar, o período seguinte
        começa no retorno ao trabalho (art. 133, §2º). Confira com o escritório antes.</div>
      ${l.length ? `<table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Período aquisitivo</th><th>Afastamento</th>
        <th class="ce">Dias de INSS no período</th><th>Passa de 6 meses em</th><th></th></tr></thead><tbody>
        ${l.map(r => `<tr><td><b>${esc(r.f.nome)}</b></td>
          <td>${r.per.k}º · ${br(r.per.iniAq)} a ${br(r.per.fimAq)}</td>
          <td>${r.afast ? `${esc(TIPOS_AFAST[r.afast.tipo])}<br><span class="dc-sem">${br(r.afast.data_ini)} a ${br(fimAfast(r.afast))}${r.afast.fim_real ? '' : ' (previsto)'}</span>` : '—'}</td>
          <td class="ce">${r.diasHoje} até hoje${r.diasPrev !== r.diasHoje ? `<br><span class="dc-sem">${r.diasPrev} pelo previsto</span>` : ''}</td>
          <td>${r.passa ? br(r.passa) : '—'}${r.passa && !r.confirmavel ? '<br><span class="dc-sem">ainda não chegou</span>' : ''}</td>
          <td class="ce">${r.perda ? `<span class="tag neutra">Encerrado por ${esc(r.perda.confirmado_por)} em ${brTs(r.perda.confirmado_em)}</span>`
            : r.confirmavel ? `<button class="btn mini principal" type="button" data-conf="${r.fid}" data-ini="${r.per.iniAq}">Confirmar encerramento</button>`
            : '<span class="tag alerta">Acompanhar</span>'}</td></tr>`).join('')}
      </tbody></table>` : '<div class="vazio">Nenhum período em risco.</div>'}
    </div>`;
  document.querySelectorAll('#telaFerRisco [data-conf]').forEach(b => b.addEventListener('click', () => dlgConfirmarPerda(b.dataset.conf, b.dataset.ini)));
}

function dlgConfirmarPerda(fid, aqIni) {
  const r = emRisco().find(x => x.fid === fid && x.per.iniAq === aqIni);
  if (!r) return;
  const retorno = r.afast?.fim_real ? addDias(r.afast.fim_real, 1) : '';
  dialogo(`<h3>Confirmar encerramento do período</h3>
    <p class="dc-sem">${esc(r.f.nome)} · ${r.per.k}º período (${br(r.per.iniAq)} a ${br(r.per.fimAq)}). O período deixa de gerar férias
      e o seguinte começa no retorno ao trabalho.</p>
    <div class="grade"><label class="campo">Retorno ao trabalho (início do novo período)<input type="date" id="ferRet" value="${retorno}"></label></div>
    ${r.afast && !r.afast.fim_real ? '<p class="dc-sem">A pessoa ainda está afastada. Se o retorno ainda não aconteceu, confirme depois de registrar o retorno.</p>' : ''}
    ${campoJust()}${rodape('<button class="btn principal" type="button" id="ferOk">Confirmar encerramento</button>')}`, () =>
    aoClicar('ferOk', async () => {
      const ret = $('ferRet').value;
      if (!ret || ret <= r.per.iniAq) return ($('ferDlgErro').textContent = 'Informe a data de retorno ao trabalho.');
      const j = exigeJust(); if (!j) return;
      const p = { funcionario_id: fid, aquisitivo_ini: aqIni, afastamento_id: r.afast?.id || null, novo_aquisitivo_ini: ret,
        motivo: j, confirmado_por: usuario() || '—', confirmado_em: agora() };
      const g = await jd.salvar('feriasPerdas', p);
      await jd.registrar({ tabela: 'jor_ferias_perdas', registro_id: g.id, acao: 'confirmar_perda', depois: g, justificativa: j });
      $('dlgFer').close(); avisar('Encerramento confirmado e gravado com o seu usuário.', true); redesenharAtual();
    }));
}

/* ---------------- Situação inicial ---------------- */

function desenharInicial() {
  const b = est.buscaIni.toLowerCase();
  const com = ativos().filter(f => admissao(f) && (!b || f.nome.toLowerCase().includes(b)));
  const sem = ativos().filter(f => !admissao(f));
  const r = est.rascunhoIni;
  const valorDe = fid => r.has(fid) ? r.get(fid) : (inicialDe(fid) ? (inicialDe(fid).ultimo_quitado_fim || 'nenhum') : '');
  const faltam = ativos().filter(f => precisaInicial(f.id)).length;

  $('telaFerIni').innerHTML = cabecalho('Situação inicial das férias', 'Uma vez só, na implantação') + `
    <div class="jor-corpo">
      <div class="jor-caixa">Para cada pessoa, escolha <b>até qual período as férias já foram tiradas</b>. Tudo até ele conta como quitado;
        o app controla daí para frente. Depois de gravado, mudar exige justificativa.</div>
      <div class="jor-barra">
        <input id="ferBuscaIni" type="search" placeholder="Buscar funcionário" value="${esc(est.buscaIni)}">
        <span class="dc-sem">${faltam ? `<b class="jor-pend">${faltam} ainda sem situação inicial</b>` : 'Todos informados'}</span>
      </div>
      <table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Admissão</th><th>Último período já quitado</th><th>Fica a tirar</th></tr></thead><tbody>
        ${com.map(f => {
          const pers = periodosDe(f.id, hoje()).filter(p => p.vence <= hoje());
          const v = valorDe(f.id);
          if (!pers.length) return `<tr><td>${esc(f.nome)}</td><td>${br(admissao(f))}</td>
            <td colspan="2"><span class="dc-sem">Ainda não completou o 1º período (vence ${br(addAnos(admissao(f), 1))}) — nada a informar.</span></td></tr>`;
          const pend = v === '' ? null : pers.filter(p => !p.perdido && (v === 'nenhum' || p.fimAq > v) && p.saldo > 0);
          return `<tr${r.has(f.id) ? ' class="fer-mudou"' : ''}><td>${esc(f.nome)}</td><td>${br(admissao(f))}</td>
            <td><select data-quit="${f.id}" class="dc-mini" style="max-width:320px">
              <option value="" ${v === '' ? 'selected' : ''} disabled>— escolher —</option>
              <option value="nenhum" ${v === 'nenhum' ? 'selected' : ''}>Nenhum (tudo pendente)</option>
              ${pers.map(p => `<option value="${p.fimAq}" ${v === p.fimAq ? 'selected' : ''}>${p.k}º · ${br(p.iniAq)} a ${br(p.fimAq)}</option>`).join('')}
            </select>${inicialDe(f.id) && !r.has(f.id) ? `<br><span class="dc-sem">gravado por ${esc(inicialDe(f.id).informado_por || '—')}</span>` : ''}</td>
            <td>${pend == null ? '<span class="dc-sem">—</span>' : pend.length
              ? pend.map(p => `${p.k}º (limite ${br(p.limite)})`).join('<br>') : '<span class="dc-sem">nada a tirar</span>'}</td></tr>`;
        }).join('') || '<tr><td colspan="4" class="vazio">Ninguém encontrado.</td></tr>'}
      </tbody></table>
      ${sem.length ? `<h3 class="jor-h3">Sem data de admissão (${sem.length})</h3>
        <div class="jor-caixa alerta">${sem.map(f => esc(f.nome)).join(', ')} — complete o cadastro para entrarem no controle.
        <button class="btn mini" type="button" id="ferIrCad2">Abrir o cadastro</button></div>` : ''}
      <div class="jor-acoes"><button class="btn principal" type="button" id="ferGravarIni" ${r.size ? '' : 'disabled'}>Gravar situação inicial${r.size ? ` (${r.size})` : ''}</button>
        ${r.size ? '<button class="btn mini" type="button" id="ferDescartaIni">Descartar mudanças</button>' : ''}</div>
    </div>`;

  $('ferBuscaIni').addEventListener('input', ev => {
    est.buscaIni = ev.target.value; desenharInicial();
    const el = $('ferBuscaIni'); el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {}
  });
  document.querySelectorAll('#telaFerIni [data-quit]').forEach(s => s.addEventListener('change', () => {
    const fid = s.dataset.quit, atual = inicialDe(fid);
    const gravado = atual ? (atual.ultimo_quitado_fim || 'nenhum') : '';
    if (s.value === gravado) r.delete(fid); else r.set(fid, s.value);
    desenharInicial();
  }));
  $('ferIrCad2')?.addEventListener('click', () => irPara('funcionarios'));
  $('ferDescartaIni')?.addEventListener('click', () => { r.clear(); desenharInicial(); });
  $('ferGravarIni').addEventListener('click', gravarInicial);
}

function gravarInicial() {
  const r = est.rascunhoIni;
  const mudancas = [...r.entries()].filter(([, v]) => v);
  if (!mudancas.length) return;
  const alterando = mudancas.filter(([fid]) => inicialDe(fid)).length;
  dialogo(`<h3>Gravar situação inicial</h3>
    <p class="dc-sem">${mudancas.length} pessoa(s). Grava o ponto de partida de cada uma, com o seu usuário e a data de hoje.
      ${alterando ? `<b>${alterando} já tinha(m) situação gravada</b> — a mudança vai para a trilha com a justificativa.` : ''}</p>
    ${alterando ? campoJust() : ''}
    ${rodape('<button class="btn principal" type="button" id="ferOk">Gravar</button>')}`, () =>
    aoClicar('ferOk', async () => {
      let j = null;
      if (alterando) { j = exigeJust(); if (!j) return; }
      for (const [fid, v] of mudancas) {
        const antes = inicialDe(fid);
        const novo = { funcionario_id: fid, ultimo_quitado_fim: v === 'nenhum' ? null : v, informado_por: usuario(), informado_em: agora() };
        await jd.salvar('feriasInicial', novo);
        await jd.registrar({ tabela: 'jor_ferias_inicial', registro_id: fid, acao: antes ? 'update' : 'insert',
          antes: antes || null, depois: novo, justificativa: antes ? j : null });
      }
      r.clear();
      $('dlgFer').close(); avisar(`Situação inicial gravada (${mudancas.length}).`, true); desenharInicial();
    }));
}

/* ---------------- diálogo único do submódulo ---------------- */

/* Botão de gravar: fica travado enquanto grava, senão dois cliques rápidos
   gravam duas férias (ou dois afastamentos) iguais. */
function aoClicar(id, fn) {
  const b = $(id);
  if (!b) return;
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    try { await fn(); }
    catch (e) { const el = $('ferDlgErro'); if (el) el.textContent = 'Não consegui gravar: ' + (e.message || e); }
    finally { b.disabled = false; }
  });
}

function dialogo(html, aoAbrir) {
  const d = $('dlgFer');
  $('dlgFerCorpo').innerHTML = html;
  $('dlgFerCorpo').querySelectorAll('[data-fer-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  aoAbrir?.();
}
const campoJust = (rot = 'Justificativa (obrigatória)') =>
  `<div class="grade"><label class="campo plena">${rot}<textarea id="ferDlgJust" rows="2" maxlength="300"></textarea></label></div>`;
function exigeJust() {
  const v = ($('ferDlgJust')?.value || '').trim();
  if (v.length < 5) { $('ferDlgJust').focus(); $('ferDlgErro').textContent = 'Escreva a justificativa (pelo menos 5 letras).'; return null; }
  return v;
}
const rodape = (botoes, voltar = 'Voltar') => `<p class="jor-pend" id="ferDlgErro" style="margin:8px 0 0"></p>
  <div class="barra entre"><span></span><span><button class="btn" type="button" data-fer-fechar>${voltar}</button> ${botoes}</span></div>`;

const TELAS = ['ferPainel', 'ferPrev', 'ferLanc', 'ferAfast', 'ferRisco', 'ferIni'];
const telaAberta = () => TELAS.find(t => $('tela' + t[0].toUpperCase() + t.slice(1)) && !$('tela' + t[0].toUpperCase() + t.slice(1)).hidden);
function redesenharAtual() {
  const t = telaAberta();
  if (t) abrirFerias(t);
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */

export function ligarFerias(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}

export function limparFerias() {
  est.faixa = null; est.destino = ''; est.mes = null; est.buscaIni = '';
  est.rascunhoIni.clear();
}
