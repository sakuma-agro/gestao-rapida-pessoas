// jornada-boletins.js — DP → Boletins diários (24/09/2026)
//
// Substitui a planilha "Controle_Entrega_Boletim.xlsx": marca, dia a dia, quem
// entregou o boletim de serviço e, de quem não entregou, emite o relatório
// individual do que falta (folha A4 + texto pronto para o WhatsApp).
//
// Decisões do Guilherme em 24/09/2026:
//   • situações da planilha: Entregou (1), Não entregou (0), Faltou, Férias,
//     Afastado — o "2" da planilha era erro e não existe aqui; Folga entrou
//     para o dia de semana sem serviço não ficar "sem marcação" para sempre;
//   • quem aparece: só ATIVOS do Campo (setor de regime "boletim" no vínculo
//     ou, sem vínculo, setor CAMPO no cadastro). Administrativo fica de fora;
//   • nada importado da planilha — começa do zero;
//   • relatório individual em PDF A4 no padrão SAKUMA + texto para o WhatsApp;
//   • (mais tarde, no mesmo dia) situação "Em correção": boletim devolvido ao
//     funcionário para corrigir. Conta como pendência e dá para cobrar só ela;
//   • relatório individual em calendário: não entregou marrom, em correção
//     amarelo, falta vermelho, legenda ao lado; sem e-mail e sem responsável.
//
// O que o app preenche sozinho (em itálico na tela; marcar por cima vale mais):
//   • boletim lançado na Gestão de jornada naquele dia → Entregou;
//   • afastamento lançado em DP → Férias e afastamentos → Afastado;
//   • férias lançadas → Férias.
// Domingo e feriado não cobram boletim — dá para marcar, mas o vazio não pesa.
//
// Banco: jor_bol_entregas (chave = funcionario_id|AAAA-MM-DD), RLS
// app_pode('jornada'). O "não entregou" que chega depois vira Entregou com
// entregue_em = dia em que chegou: some das pendências e fica o atraso.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];
const SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const SEM_CURTA = ['dom','seg','ter','qua','qui','sex','sáb'];
const SEM_LETRA = ['D','S','T','Q','Q','S','S'];

/* ---------------- datas (texto AAAA-MM-DD, sem fuso) ---------------- */
const D = s => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDias = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = s => D(s).getUTCDay();
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const brCurto = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
const fimDoMes = ym => iso(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)));
const usuario = () => estado.sessao?.user?.email || null;
const agora = () => new Date().toISOString();

/* ---------------- situações ---------------- */
export const SIT = {
  entregou:     { rot: 'Entregou',     curto: '✓',  cls: 'bd-ok' },
  nao_entregou: { rot: 'Não entregou', curto: '✗',  cls: 'bd-nao' },
  correcao:     { rot: 'Em correção',  curto: 'EC', cls: 'bd-corr' },
  faltou:       { rot: 'Faltou',       curto: 'FT', cls: 'bd-falta' },
  ferias:       { rot: 'Férias',       curto: 'FE', cls: 'bd-neutro' },
  afastado:     { rot: 'Afastado',     curto: 'AF', cls: 'bd-neutro' },
  folga:        { rot: 'Folga',        curto: 'FG', cls: 'bd-neutro' },
};
const ORDEM = Object.keys(SIT);
/* Pendência = o que o funcionário ainda deve ao DP: boletim que não veio e
   boletim devolvido para correção (pedido dele em 24/09/2026). */
export const PEND = ['nao_entregou', 'correcao'];
const ehPend = s => PEND.includes(s);
const TIPOS_PEND = { '': 'Todos os pendentes', nao_entregou: 'Só não entregou', correcao: 'Só em correção' };

/* ---------------- quem entra ---------------- */
const pessoa = id => estado.funcionarios.find(f => f.id === id) || null;
const ativa = f => (f.situacao || 'ATIVO') === 'ATIVO';
const doCampo = f => {
  const s = jd.setorDe(jd.vinculoDe(f.id));
  if (s) return s.regime === 'boletim';
  return String(f.setor || '').trim().toUpperCase() === 'CAMPO';
};
export const equipe = () => estado.funcionarios.filter(f => ativa(f) && doCampo(f))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const admissao = f => (f?.admissao || '').slice(0, 10) || null;

const municipioDe = fid => jd.fazendaDe(jd.unidadeDe(jd.vinculoDe(fid)))?.municipio || null;
export const feriado = (d, fid) => jd.feriadoEm(d, fid ? municipioDe(fid) : null);
/** Domingo ou feriado: dá para marcar, mas o vazio não é cobrado. */
export const naoCobra = (d, fid) => dow(d) === 0 || !!feriado(d, fid);

/* ---------------- a situação de um dia ---------------- */
const chave = (fid, d) => `${fid}|${d}`;
const marcacao = (fid, d) => (jd.dados.bolEntregas || []).find(x => x.chave === chave(fid, d)) || null;
const fimAfast = a => a.fim_real || a.fim_previsto || '9999-12-31';

/**
 * O que vale naquele dia para aquela pessoa.
 * origem: 'marcado' (alguém marcou) · 'jornada' · 'dp' (férias/afastamento) · null
 */
export function situacaoDia(fid, d) {
  const m = marcacao(fid, d);
  if (m) return { sit: m.situacao, origem: 'marcado', reg: m };
  if ((jd.dados.bolJornada || []).some(b => b.funcionario_id === fid && b.data_fato === d))
    return { sit: 'entregou', origem: 'jornada' };
  if ((jd.dados.afastamentos || []).some(a => a.funcionario_id === fid && a.situacao !== 'cancelado' &&
      a.data_ini <= d && fimAfast(a) >= d)) return { sit: 'afastado', origem: 'dp' };
  if ((jd.dados.feriasGozos || []).some(g => g.funcionario_id === fid && g.situacao === 'lancado' &&
      g.data_ini <= d && g.data_fim >= d)) return { sit: 'ferias', origem: 'dp' };
  return { sit: null, origem: null };
}
const ORIGEM_TXT = { jornada: 'boletim lançado na Gestão de jornada', dp: 'lançado em Férias e afastamentos' };

/** Pendências (não entregou / em correção) de uma pessoa, em ordem de data. tipo '' = as duas. */
export const pendenciasDe = (fid, ini = '', fim = '', tipo = '') => (jd.dados.bolEntregas || [])
  .filter(x => x.funcionario_id === fid && (tipo ? x.situacao === tipo : ehPend(x.situacao)) &&
    (!ini || x.data >= ini) && (!fim || x.data <= fim))
  .sort((a, b) => a.data.localeCompare(b.data));

/** Todas as pessoas com pendência — inclusive quem saiu do Campo ou foi desligado. */
function comPendencia(ini, fim, fazenda, tipo = '') {
  const ids = [...new Set((jd.dados.bolEntregas || []).filter(x => ehPend(x.situacao)).map(x => x.funcionario_id))];
  return ids.map(id => ({ f: pessoa(id), p: pendenciasDe(id, ini, fim, tipo) }))
    .filter(x => x.f && x.p.length && casaFazenda(x.f, fazenda))
    .sort((a, b) => b.p.length - a.p.length || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
}

/* O controle começou no dia da primeira marcação (nada foi importado da
   planilha). Antes dela, dia vazio não é cobrado — senão o app estrearia
   com centenas de "sem marcação". */
const inicioControle = () => (jd.dados.bolEntregas || []).reduce((m, x) => !m || x.data < m ? x.data : m, null) || hoje();

/** Dias cobrados (seg–sáb, fora feriado, desde o início do controle e a admissão, até hoje) sem nada. */
function semMarcacao(lista, ini, fim) {
  const r = [];
  const ate = fim < hoje() ? fim : hoje();
  if (ini < inicioControle()) ini = inicioControle();
  for (const f of lista) {
    const adm = admissao(f);
    for (let d = ini; d <= ate; d = addDias(d, 1)) {
      if (adm && d < adm) continue;
      if (naoCobra(d, f.id)) continue;
      if (!situacaoDia(f.id, d).sit) r.push({ f, d });
    }
  }
  return r;
}

const casaFazenda = (f, fz) => !fz || (fz === '-' ? !f.fazenda : f.fazenda === fz);
const fazendas = () => [...new Set(equipe().map(f => f.fazenda).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* ---------------- escrita ---------------- */
async function marcar(fid, d, sit, extra = {}) {
  const k = chave(fid, d);
  if (!sit) { await jd.apagar('bolEntregas', k); return; }
  const antes = marcacao(fid, d);
  await jd.salvar('bolEntregas', {
    chave: k, funcionario_id: fid, data: d, situacao: sit,
    observacao: extra.observacao ?? antes?.observacao ?? null,
    entregue_em: sit === 'entregou' ? (extra.entregue_em ?? (ehPend(antes?.situacao) && d < hoje() ? hoje() : antes?.entregue_em ?? null)) : null,
    marcado_por: usuario(), marcado_em: agora(),
  });
}

/* ---------------- carregamento ---------------- */
const carregados = new Set();
async function garantir(ini, fim, forcar = false) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(); } catch (e) { avisar('Não consegui carregar os dados do DP: ' + e.message); }
  }
  const k = ini + '|' + fim;
  if (!forcar && carregados.has(k)) return;
  try { await jd.carregarEntregas(ini, fim); carregados.add(k); }
  catch (e) { avisar('Sem conexão: mostrando o que ficou guardado neste aparelho. ' + (e.message || '')); }
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
const rotPeriodo = (ini, fim) => !ini && !fim ? 'todas em aberto' : `${ini ? br(ini) : 'início'} a ${fim ? br(fim) : br(hoje())}`;
const campo = (rot, v) => `<div><span>${esc(rot)}</span><b>${esc(v || '—')}</b></div>`;

/* Plural simples: "1 boletim", "3 boletins". */
const nBol = n => `${n} ${n === 1 ? 'boletim' : 'boletins'}`;
const CINZA = '#51534A';
/* Cores do calendário (pedido dele em 24/09/2026): não entregou marrom,
   em correção amarelo, falta vermelho. Iguais às da grade do app. */
const COR_CAL = {
  nao_entregou: { fundo: '#744F28', letra: '#fff' },
  correcao:     { fundo: '#F2C500', letra: '#51534A' },
  faltou:       { fundo: '#C0392B', letra: '#fff' },
};

/**
 * Relatório individual — modelo calendário (escolhido em 24/09/2026).
 * Os meses que têm pendência, com os dias pintados, e a legenda ao lado com
 * a contagem. Sem e-mail e sem linha de responsável no pé (pedido dele).
 * As faltas do mês entram no calendário só como informação.
 */
export function relIndividual(fid, ini = '', fim = '', tipo = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, ini, fim, tipo);
  const quem = [f?.cargo, f?.fazenda].filter(Boolean).map(esc).join(' · ');
  const meses = [...new Set(p.map(x => x.data.slice(0, 7)))].sort();
  const marca = new Map(p.map(x => [x.data, x.situacao]));
  const faltas = (jd.dados.bolEntregas || []).filter(x => x.funcionario_id === fid && x.situacao === 'faltou' &&
    meses.includes(x.data.slice(0, 7)));
  faltas.forEach(x => { if (!marca.has(x.data)) marca.set(x.data, 'faltou'); });
  const n = k => [...marca.values()].filter(v => v === k).length;
  const nNao = n('nao_entregou'), nCor = n('correcao'), nFal = n('faltou');

  const quad = (k, extra = '') => `<span style="display:inline-block;width:16px;height:16px;border-radius:3px;vertical-align:-3px;${
    k ? `background:${COR_CAL[k].fundo}` : 'border:1px solid #D5D7D0'};${extra}"></span>`;
  const cal = ym => {
    const d1 = ym + '-01', dias = +fimDoMes(ym).slice(8), pul = dow(d1);
    const cels = [...Array(pul).fill(''), ...Array.from({ length: dias }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
    return `<div style="width:270px">
      <div style="font-size:12px;font-weight:700;color:${CINZA};margin-bottom:6px;text-transform:capitalize">${MESES_L[+ym.slice(5) - 1]} ${ym.slice(0, 4)}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:11px;text-align:center">
        ${SEM_LETRA.map(l => `<div style="font-weight:700;color:#8A8D86;padding:2px 0">${l}</div>`).join('')}
        ${cels.map(d => {
          if (!d) return '<div></div>';
          const k = marca.get(d);
          return k ? `<div style="background:${COR_CAL[k].fundo};color:${COR_CAL[k].letra};font-weight:700;border-radius:4px;padding:5px 0">${+d.slice(8)}</div>`
            : `<div style="color:${CINZA};border:1px solid #EEE;border-radius:4px;padding:4px 0">${+d.slice(8)}</div>`;
        }).join('')}
      </div></div>`;
  };
  const linhaLeg = (k, rot, qtd, nota) => `<div style="display:flex;gap:9px;align-items:flex-start;margin-bottom:10px">
    ${quad(k, 'flex:none;margin-top:1px')}<div style="font-size:12px;color:${CINZA};line-height:1.35">
    <b>${rot}</b>${qtd == null ? '' : ` — ${qtd}`}<br><span style="font-size:10.5px;color:#8A8D86">${nota}</span></div></div>`;
  const legenda = `<div style="flex:1;min-width:200px;border:1px solid #E1E2DE;border-radius:8px;padding:12px 14px;background:#F7F8F5">
    <div style="font-size:10px;font-weight:700;color:#8A8D86;letter-spacing:.4px;margin-bottom:10px">LEGENDA</div>
    ${tipo !== 'correcao' ? linhaLeg('nao_entregou', 'Não entregou', nNao, 'Entregar o boletim no DP') : ''}
    ${tipo !== 'nao_entregou' ? linhaLeg('correcao', 'Em correção', nCor, 'Boletim devolvido: corrigir e devolver ao DP') : ''}
    ${nFal ? linhaLeg('faltou', 'Falta', nFal, 'Dia de falta — só informação') : ''}
    ${linhaLeg('', 'Dia normal', null, 'Nada a fazer')}
  </div>`;
  const partes = [nNao && tipo !== 'correcao' ? `${nNao} não ${nNao === 1 ? 'entregue' : 'entregues'}` : '',
                  nCor && tipo !== 'nao_entregou' ? `${nCor} em correção` : ''].filter(Boolean);
  const titulo = tipo === 'correcao' ? 'Boletins devolvidos para correção' : 'Boletins que faltam entregar';

  return `<article class="rel">
    ${cabecalhoDoc(titulo, 'Aviso ao funcionário', `data<strong>${br(hoje())}</strong>`)}
    <div style="margin:4px 0 14px"><div style="font-size:17px;font-weight:700;color:${CINZA}">${esc(f?.nome || '')}</div>
      <div style="font-size:11px;color:#8A8D86;margin-top:2px">${quem}</div></div>
    ${p.length ? `
      <div style="font-size:13px;color:${CINZA};margin-bottom:14px">Faltam <b>${nBol(p.length)}</b>${partes.length > 1 ? `: ${partes.join(' e ')}` : ''}.</div>
      <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:18px">${meses.map(cal).join('')}</div>
        ${legenda}
      </div>
      <div class="rel-resumo" style="font-size:12px;margin-top:16px">${
        tipo === 'correcao' ? 'Corrija os boletins dos dias pintados e devolva no escritório (DP).'
        : tipo === 'nao_entregou' ? 'Entregue no escritório (DP) os boletins dos dias pintados.'
        : 'Entregue no escritório (DP) os boletins dos dias pintados — os amarelos precisam ser corrigidos antes.'}</div>`
      : '<div class="rel-resumo" style="font-size:12px"><b>Tudo em dia.</b> Nenhum boletim pendente.</div>'}
    ${rodapeLop()}</article>`;
}

/** Relatório geral: todos que têm pendência. */
export function relGeral(ini = '', fim = '', fazenda = '', tipo = '') {
  const l = comPendencia(ini, fim, fazenda, tipo);
  const tot = l.reduce((s, x) => s + x.p.length, 0);
  const data = y => y.situacao === 'correcao' ? `${brCurto(y.data)} <span class="rel-mini">(correção)</span>` : brCurto(y.data);
  return `<article class="rel">
    ${cabecalhoDoc(tipo === 'correcao' ? 'Boletins devolvidos para correção' : 'Boletins de serviço pendentes',
      `Todos os funcionários · ${TIPOS_PEND[tipo].toLowerCase()}`,
      `posição em<strong>${br(hoje())}</strong>${esc(rotPeriodo(ini, fim))}${fazenda ? ' · ' + esc(fazenda === '-' ? 'sem fazenda' : fazenda) : ''}`)}
    <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Fazenda</th><th class="rel-num">Pendentes</th><th>Datas</th></tr></thead>
    <tbody>${l.map(x => `<tr><td>${esc(x.f.nome)}${ativa(x.f) ? '' : ' <span class="rel-mini">(inativo)</span>'}</td><td>${esc(x.f.fazenda || '—')}</td>
      <td class="rel-num">${x.p.length}</td><td>${x.p.map(data).join(', ')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="rel-vazio">Ninguém com boletim pendente.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="rel-num">${tot}</td><td>${l.length} pessoa(s)</td></tr></tfoot></table>
    ${rodapeLop()}</article>`;
}

/** O texto para o WhatsApp — o mesmo recado da "Área para enviar via Whatsapp". */
export function textoZap(fid, ini = '', fim = '', tipo = '') {
  const f = pessoa(fid);
  const p = pendenciasDe(fid, ini, fim, tipo);
  if (!p.length) return `*BOLETIM DE SERVIÇO*\n*${f?.nome || ''}*\n\nNenhum boletim pendente. Obrigado!`;
  const bloco = (k, rot) => {
    const l = p.filter(x => x.situacao === k);
    return l.length ? `${rot}\n` + l.map(x => `• ${brCurto(x.data)} (${SEM_CURTA[dow(x.data)]})`).join('\n') : '';
  };
  return `*BOLETIM DE SERVIÇO*\n*${f?.nome || ''}*\n\n` +
    [bloco('nao_entregou', 'Não entregou:'), bloco('correcao', 'Devolvido para correção:')].filter(Boolean).join('\n\n') +
    `\n\nTotal: ${nBol(p.length)} pendente${p.length === 1 ? '' : 's'}. Favor entregar no DP.\n\nSAKUMA Agronegócios`;
}
const linkZap = t => `https://wa.me/?text=${encodeURIComponent(t)}`;

export function csvMes(ym, lista) {
  const q = c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`;
  const dias = diasDoMes(ym);
  const cols = ['Funcionario', 'Fazenda', ...dias.map(d => brCurto(d)), 'Nao entregou', 'Em correcao'];
  const linhas = lista.map(f => {
    let n = 0, c = 0;
    const cel = dias.map(d => { const s = situacaoDia(f.id, d).sit; if (s === 'nao_entregou') n++; if (s === 'correcao') c++; return s ? SIT[s].rot : ''; });
    return [f.nome, f.fazenda || '', ...cel, n, c];
  });
  return { nome: `Boletins_${ym}.csv`, conteudo: '﻿' + [cols, ...linhas].map(l => l.map(q).join(';')).join('\r\n') };
}
function baixarCSV({ nome, conteudo }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8;' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* Prévia no #jorImpressao, como os outros documentos do app. Quem limpa na
   troca de tela é o limparPrevias() do app.js, que chama fecharDocBoletins(). */
let barraAtual = null;
function mostrarDoc(html, barraId) {
  const alvo = $('jorImpressao');
  alvo.innerHTML = html;
  alvo.hidden = false;
  if (barraAtual && barraAtual !== barraId && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = barraId;
  if ($(barraId)) $(barraId).hidden = false;
  alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function fecharDocBoletins() {
  if (barraAtual && $(barraAtual)) $(barraAtual).hidden = true;
  barraAtual = null;
}
function fecharPrevia() {
  const alvo = $('jorImpressao');
  alvo.innerHTML = ''; alvo.hidden = true;
  fecharDocBoletins();
}
function imprimirDoc() {
  document.body.classList.add('jor-imprimindo');
  const soltar = () => { document.body.classList.remove('jor-imprimindo'); removeEventListener('afterprint', soltar); };
  addEventListener('afterprint', soltar);
  print();
  setTimeout(soltar, 3000);
}
/* Div sem classe em volta: .jor-acoes tem display próprio e venceria o hidden. */
const barraDoc = id => `<div id="${id}" hidden><div class="jor-acoes">
  <button class="btn principal" type="button" data-doc-imprimir>Imprimir / salvar em PDF</button>
  <button class="btn mini" type="button" data-doc-fechar>Fechar prévia</button></div></div>`;
function ligarBarraDoc(raiz) {
  raiz.querySelectorAll('[data-doc-imprimir]').forEach(b => b.addEventListener('click', imprimirDoc));
  raiz.querySelectorAll('[data-doc-fechar]').forEach(b => b.addEventListener('click', fecharPrevia));
}

/* ===================================================================
   TELAS
   =================================================================== */

let avisar = () => {};
let irPara = () => {};
const est = { dia: null, mes: null, busca: '', fazenda: '', pIni: '', pFim: '', pFaz: '', pTipo: '' };

function cabecalho(titulo, sub, direita) {
  return `<header class="jor-cabecalho"><div>
    <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
    <div class="jor-cabecalho__sub">${esc(sub || '')}</div></div>
    <div class="jor-cabecalho__direita">${direita}</div></header>`;
}
const filtros = (idBusca, idFaz) => `
  <input id="${idBusca}" type="search" placeholder="Buscar funcionário" value="${esc(est.busca)}">
  <select id="${idFaz}" class="dc-mini bd-sel" aria-label="Fazenda">
    <option value="">Todas as fazendas</option>
    ${fazendas().map(z => `<option ${est.fazenda === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}
    <option value="-" ${est.fazenda === '-' ? 'selected' : ''}>Sem fazenda</option>
  </select>`;
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const filtrada = () => equipe().filter(f => casaFazenda(f, est.fazenda) &&
  (!est.busca || normal(f.nome + ' ' + (f.apelido || '')).includes(normal(est.busca))));
function ligarFiltros(idBusca, idFaz, redesenhar) {
  $(idBusca)?.addEventListener('input', ev => {
    est.busca = ev.target.value; redesenhar();
    const el = $(idBusca); el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {}
  });
  $(idFaz)?.addEventListener('change', ev => { est.fazenda = ev.target.value; redesenhar(); });
}

export async function abrirBoletins(tela) {
  if (!est.dia) est.dia = hoje();
  if (!est.mes) est.mes = hoje().slice(0, 7);
  if (tela === 'bdDia') {
    await garantir(est.dia.slice(0, 8) + '01', fimDoMes(est.dia.slice(0, 7)), true);
    desenharDia();
  }
  if (tela === 'bdMes') {
    await garantir(est.mes + '-01', fimDoMes(est.mes), true);
    desenharMes();
  }
  if (tela === 'bdPend') {
    const ini = addDias(hoje(), -45);
    await garantir(ini, hoje(), true);
    desenharPend();
  }
}

/* ---------------- Marcar o dia ---------------- */

function desenharDia() {
  const d = est.dia;
  const todos = equipe().filter(f => !admissao(f) || admissao(f) <= d);
  const lista = filtrada().filter(f => !admissao(f) || admissao(f) <= d);
  const cont = { entregou: 0, nao_entregou: 0, correcao: 0, outros: 0, vazio: 0 };
  todos.forEach(f => {
    const s = situacaoDia(f.id, d).sit;
    if (!s) { if (!naoCobra(d, f.id)) cont.vazio++; }
    else if (s === 'entregou' || ehPend(s)) cont[s]++;
    else cont.outros++;
  });
  const fer = feriado(d);
  const vazios = lista.filter(f => !situacaoDia(f.id, d).sit);
  const aviso = dow(d) === 0 ? 'Domingo — dia sem boletim. Marque só quem trabalhou.'
    : fer ? `Feriado (${esc(fer.nome)}) — dia sem boletim. Marque só quem trabalhou.` : '';

  $('telaBdDia').innerHTML = cabecalho('Boletins diários', 'Marque quem entregou o boletim de serviço do dia',
    `dia<strong class="jor-cabecalho__competencia">${br(d)}</strong>${SEMANA[dow(d)]}`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <span class="bd-dia">
          <button class="btn mini" type="button" id="bdAnt" aria-label="Dia anterior">◀</button>
          <input type="date" id="bdData" value="${d}" max="${hoje()}">
          <button class="btn mini" type="button" id="bdProx" aria-label="Próximo dia" ${d >= hoje() ? 'disabled' : ''}>▶</button>
          ${d !== hoje() ? '<button class="btn mini" type="button" id="bdHoje">Hoje</button>' : ''}
        </span>
        ${filtros('bdBusca', 'bdFaz')}
      </div>
      ${aviso ? `<div class="jor-caixa">${aviso}</div>` : ''}
      <div class="pv-cards bd-cards">
        <div class="pv-card pv-calma"><span>Entregou</span><strong>${cont.entregou}</strong><small>de ${todos.length} no Campo</small></div>
        <div class="pv-card ${cont.nao_entregou + cont.correcao ? 'pv-atencao' : 'pv-ok'}"><span>Não entregou · em correção</span><strong>${cont.nao_entregou + cont.correcao}</strong><small>${cont.nao_entregou} não entregou · ${cont.correcao} em correção</small></div>
        <div class="pv-card pv-ok"><span>Faltou · férias · afast. · folga</span><strong>${cont.outros}</strong><small>não cobra boletim</small></div>
        <div class="pv-card ${cont.vazio ? 'pv-alerta' : 'pv-ok'}"><span>Sem marcação</span><strong>${cont.vazio}</strong><small>${cont.vazio ? 'falta marcar' : 'dia completo'}</small></div>
      </div>
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="bdTodos" ${vazios.length ? '' : 'disabled'}>Marcar ${vazios.length} sem marcação como Entregou</button>
        <span class="dc-sem bd-dica">Depois, troque só as exceções.</span>
      </div>
      <div class="bd-lista">
        ${lista.map(f => {
          const s = situacaoDia(f.id, d);
          const auto = s.origem && s.origem !== 'marcado';
          const atraso = s.reg?.entregue_em && s.reg.entregue_em > d;
          return `<div class="bd-linha">
            <div class="bd-quem"><b>${esc(f.nome)}</b>
              <span class="dc-sem">${esc(f.fazenda || 'sem fazenda')}${auto ? ` · <i>${esc(ORIGEM_TXT[s.origem])}</i>` : ''}${
                atraso ? ` · <span class="tag alerta">chegou em ${br(s.reg.entregue_em)}</span>` : ''}</span></div>
            <div class="bd-botoes" role="group" aria-label="Situação de ${esc(f.nome)}">
              ${ORDEM.map(k => `<button type="button" class="bd-op ${SIT[k].cls} ${auto && s.sit === k ? 'bd-auto' : ''}"
                data-fid="${f.id}" data-sit="${k}" aria-pressed="${s.sit === k}">${SIT[k].rot}</button>`).join('')}
            </div></div>`;
        }).join('') || '<div class="vazio">Ninguém do Campo com esse filtro.</div>'}
      </div>
      <p class="dc-sem jor-nota">Clique de novo no botão marcado para desmarcar. Em itálico é o que o app preencheu sozinho
        (boletim lançado na Gestão de jornada, férias ou afastamento) — marcar por cima vale mais.
        Só aparece quem está ativo no Campo.</p>
    </div>`;

  const irDia = n => { est.dia = n; abrirBoletins('bdDia'); };
  $('bdAnt').addEventListener('click', () => irDia(addDias(d, -1)));
  $('bdProx').addEventListener('click', () => { if (d < hoje()) irDia(addDias(d, 1)); });
  $('bdHoje')?.addEventListener('click', () => irDia(hoje()));
  $('bdData').addEventListener('change', ev => { const v = ev.target.value; if (v && v <= hoje()) irDia(v); });
  ligarFiltros('bdBusca', 'bdFaz', desenharDia);
  $('bdTodos').addEventListener('click', async () => {
    const alvo = filtrada().filter(f => (!admissao(f) || admissao(f) <= d) && !situacaoDia(f.id, d).sit);
    for (const f of alvo) await marcar(f.id, d, 'entregou');
    avisar(`${alvo.length} marcado(s) como Entregou em ${br(d)}.` + (navigator.onLine ? '' : ' Sem rede — vai subir sozinho.'), true);
    desenharDia();
  });
  document.querySelectorAll('#telaBdDia .bd-op').forEach(b => b.addEventListener('click', async () => {
    const fid = b.dataset.fid, k = b.dataset.sit;
    const s = situacaoDia(fid, d);
    const nova = s.origem === 'marcado' && s.sit === k ? null : k;
    await marcar(fid, d, nova);
    desenharDia();
  }));
}

/* ---------------- Mês ---------------- */

const diasDoMes = ym => { const r = []; for (let d = ym + '-01', f = fimDoMes(ym); d <= f; d = addDias(d, 1)) r.push(d); return r; };

function desenharMes() {
  const ym = est.mes;
  const dias = diasDoMes(ym);
  const lista = filtrada();
  const h = hoje();
  const pendMes = lista.reduce((s, f) => s + dias.filter(d => ehPend(situacaoDia(f.id, d).sit)).length, 0);
  const sm = semMarcacao(lista, ym + '-01', fimDoMes(ym)).length;
  const ini0 = inicioControle();

  $('telaBdMes').innerHTML = cabecalho('Boletins do mês', 'A grade da planilha: uma linha por pessoa, uma coluna por dia',
    `mês<strong class="jor-cabecalho__competencia">${MESES[+ym.slice(5) - 1]}/${ym.slice(0, 4)}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <input type="month" id="bdMesSel" value="${ym}" max="${h.slice(0, 7)}">
        ${filtros('bdBuscaMes', 'bdFazMes')}
        <button class="btn mini" type="button" id="bdCsvMes">Baixar o mês (CSV)</button>
      </div>
      ${sm ? `<div class="jor-caixa alerta"><b>${sm} dia(s) cobrado(s) sem marcação</b> neste mês (segunda a sábado, fora feriado). Aparecem com contorno tracejado.</div>` : ''}
      <div class="bd-legenda">${ORDEM.map(k => `<span><i class="bd-cel ${SIT[k].cls}">${SIT[k].curto}</i>${SIT[k].rot}</span>`).join('')}
        <span><i class="bd-cel bd-nc"></i>Domingo / feriado</span><span><i class="bd-cel bd-vazio-cob"></i>Sem marcação</span></div>
      <div class="bd-rola"><table class="bd-grade"><thead><tr><th class="bd-nome">Funcionário</th>
        ${dias.map(d => `<th class="${naoCobra(d) ? 'bd-nc' : ''}" title="${SEMANA[dow(d)]}${feriado(d) ? ' · ' + esc(feriado(d).nome) : ''}">${+d.slice(8)}<small>${SEM_LETRA[dow(d)]}</small></th>`).join('')}
        <th class="bd-tot" title="Pendentes no mês (não entregou + em correção)">Pend.</th></tr></thead><tbody>
        ${lista.map(f => {
          const adm = admissao(f);
          let n = 0;
          const cels = dias.map(d => {
            if (d > h || (adm && d < adm)) return `<td class="bd-fora"></td>`;
            const s = situacaoDia(f.id, d);
            if (ehPend(s.sit)) n++;
            const nc = naoCobra(d, f.id);
            const cls = s.sit ? SIT[s.sit].cls : nc ? 'bd-nc' : d < ini0 ? '' : 'bd-vazio-cob';
            const tit = `${br(d)} · ${s.sit ? SIT[s.sit].rot : 'sem marcação'}${s.origem && s.origem !== 'marcado' ? ' (' + ORIGEM_TXT[s.origem] + ')' : ''}${
              s.reg?.entregue_em && s.reg.entregue_em > d ? ' · chegou em ' + br(s.reg.entregue_em) : ''}`;
            return `<td class="${cls}${s.origem && s.origem !== 'marcado' ? ' bd-auto' : ''}${s.reg?.entregue_em > d ? ' bd-atraso' : ''}">
              <button type="button" data-fid="${f.id}" data-d="${d}" title="${esc(tit)}">${s.sit ? SIT[s.sit].curto : ''}</button></td>`;
          }).join('');
          return `<tr><th class="bd-nome"><button type="button" class="bd-pessoa" data-pessoa="${f.id}">${esc(f.nome)}</button></th>${cels}
            <td class="bd-tot ${n ? 'bd-tem' : ''}">${n || ''}</td></tr>`;
        }).join('') || `<tr><td colspan="${dias.length + 2}" class="vazio">Ninguém do Campo com esse filtro.</td></tr>`}
      </tbody><tfoot><tr><th class="bd-nome">Pendentes no dia</th>
        ${dias.map(d => { const n = lista.filter(f => ehPend(situacaoDia(f.id, d).sit)).length; return `<td>${n || ''}</td>`; }).join('')}
        <td class="bd-tot">${pendMes || ''}</td></tr></tfoot></table></div>
      ${barraDoc('bdBarraMes')}
      <p class="dc-sem jor-nota">Clique na célula e escolha a situação no menu (Esc fecha).
        Clique no nome para ver as pendências da pessoa e emitir o relatório. Célula com ponto marrom: boletim que chegou atrasado.</p>
    </div>`;

  $('bdMesSel').addEventListener('change', ev => { if (ev.target.value) { est.mes = ev.target.value; abrirBoletins('bdMes'); } });
  ligarFiltros('bdBuscaMes', 'bdFazMes', desenharMes);
  $('bdCsvMes').addEventListener('click', () => baixarCSV(csvMes(ym, lista)));
  ligarBarraDoc($('telaBdMes'));
  document.querySelectorAll('#telaBdMes td button[data-d]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    menuCelula(b);
  }));
  document.querySelectorAll('#telaBdMes [data-pessoa]').forEach(b => b.addEventListener('click', () => dlgPessoa(b.dataset.pessoa)));
}

/* Menu ao clicar na célula (pedido dele em 24/09/2026 — ficar clicando até
   chegar na situação certa dava trabalho). Um clique abre, outro escolhe. */
function fecharMenu() {
  const m = $('bdMenu');
  if (m) m.remove();
  document.removeEventListener('pointerdown', foraDoMenu, true);
  document.removeEventListener('keydown', teclaMenu, true);
  window.removeEventListener('resize', fecharMenu);
  document.querySelector('#telaBdMes .bd-rola')?.removeEventListener('scroll', fecharMenu);
}
function foraDoMenu(ev) { if (!ev.target.closest('#bdMenu')) fecharMenu(); }
function teclaMenu(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); fecharMenu(); return; }
  if (!['ArrowDown', 'ArrowUp'].includes(ev.key)) return;
  const bs = [...document.querySelectorAll('#bdMenu button')];
  const i = bs.indexOf(document.activeElement);
  ev.preventDefault();
  bs[(i + (ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
}
function menuCelula(cel) {
  fecharMenu();
  const fid = cel.dataset.fid, d = cel.dataset.d;
  const s = situacaoDia(fid, d);
  const f = pessoa(fid);
  const m = document.createElement('div');
  m.id = 'bdMenu';
  m.className = 'bd-menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="bd-menu-tit"><b>${esc((f?.apelido || f?.nome || '').split(' ').slice(0, 2).join(' '))}</b>${brCurto(d)} · ${SEM_CURTA[dow(d)]}</div>
    ${ORDEM.map(k => `<button type="button" role="menuitem" data-sit="${k}" class="${s.sit === k ? 'bd-atual' : ''}">
      <i class="bd-cel ${SIT[k].cls}">${SIT[k].curto}</i>${SIT[k].rot}${s.sit === k && s.origem !== 'marcado' ? ' <small>(automático)</small>' : ''}</button>`).join('')}
    ${s.origem === 'marcado' ? '<button type="button" role="menuitem" data-sit="" class="bd-menu-apaga"><i class="bd-cel"></i>Apagar marcação</button>' : ''}`;
  document.body.appendChild(m);
  // Posição: embaixo da célula; se não couber, em cima. Nunca sai da tela.
  const r = cel.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  const top = r.bottom + h + 8 <= innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  (m.querySelector('.bd-atual') || m.querySelector('button')).focus();
  m.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    fecharMenu();
    await marcar(fid, d, b.dataset.sit || null);
    const x = document.querySelector('#telaBdMes .bd-rola')?.scrollLeft || 0;
    desenharMes();
    const r2 = document.querySelector('#telaBdMes .bd-rola'); if (r2) r2.scrollLeft = x;
    document.querySelector(`#telaBdMes button[data-fid="${fid}"][data-d="${d}"]`)?.focus();
  }));
  setTimeout(() => {
    document.addEventListener('pointerdown', foraDoMenu, true);
    document.addEventListener('keydown', teclaMenu, true);
    window.addEventListener('resize', fecharMenu);
    document.querySelector('#telaBdMes .bd-rola')?.addEventListener('scroll', fecharMenu);
  });
}
export const fecharMenuBoletins = fecharMenu;

/* ---------------- Pendências ---------------- */

function desenharPend() {
  const l = comPendencia(est.pIni, est.pFim, est.pFaz, est.pTipo);
  const tot = l.reduce((s, x) => s + x.p.length, 0);
  const todosPend = comPendencia(est.pIni, est.pFim, est.pFaz).flatMap(x => x.p);
  const nNao = todosPend.filter(x => x.situacao === 'nao_entregou').length;
  const nCor = todosPend.filter(x => x.situacao === 'correcao').length;
  const tagData = y => y.situacao === 'correcao'
    ? `<span class="bd-dt bd-corr" title="Em correção">${brCurto(y.data)}</span>` : `<span class="bd-dt bd-nao" title="Não entregou">${brCurto(y.data)}</span>`;
  const ini30 = addDias(hoje(), -30);
  const sm = semMarcacao(equipe(), ini30, addDias(hoje(), -1));

  $('telaBdPend').innerHTML = cabecalho('Pendências de boletim', 'Quem não entregou ou está com boletim em correção — relatório e WhatsApp',
    `posição em<strong class="jor-cabecalho__competencia">${br(hoje())}</strong>`) + `
    <div class="jor-corpo">
      <div class="jor-barra bd-barra">
        <label class="fer-filtro">De <input type="date" id="bdPIni" value="${est.pIni}" max="${hoje()}"></label>
        <label class="fer-filtro">até <input type="date" id="bdPFim" value="${est.pFim}" max="${hoje()}"></label>
        <select id="bdPTipo" class="dc-mini bd-sel" aria-label="O que cobrar">
          ${Object.entries(TIPOS_PEND).map(([k, v]) => `<option value="${k}" ${est.pTipo === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select id="bdPFaz" class="dc-mini bd-sel" aria-label="Fazenda">
          <option value="">Todas as fazendas</option>
          ${fazendas().map(z => `<option ${est.pFaz === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}
        </select>
        ${est.pIni || est.pFim || est.pFaz || est.pTipo ? '<button class="btn mini" type="button" id="bdPLimpa">Limpar filtro</button>' : ''}
      </div>
      <div class="pv-cards bd-cards">
        <button type="button" class="pv-card ${nNao ? 'pv-atencao' : 'pv-ok'}" data-tipo="nao_entregou" aria-pressed="${est.pTipo === 'nao_entregou'}"><span>Não entregou</span><strong>${nNao}</strong><small>${est.pIni || est.pFim ? 'no período' : 'todos em aberto'}</small></button>
        <button type="button" class="pv-card ${nCor ? 'pv-alerta' : 'pv-ok'}" data-tipo="correcao" aria-pressed="${est.pTipo === 'correcao'}"><span>Em correção</span><strong>${nCor}</strong><small>devolvidos para corrigir</small></button>
        <div class="pv-card ${l.length ? 'pv-atencao' : 'pv-ok'}"><span>Pessoas devendo</span><strong>${l.length}</strong><small>com ao menos 1 boletim</small></div>
        <div class="pv-card ${sm.length ? 'pv-alerta' : 'pv-ok'}"><span>Sem marcação</span><strong>${sm.length}</strong><small>dias cobrados · últimos 30 dias</small></div>
      </div>
      ${sm.length ? `<div class="jor-caixa alerta"><b>${sm.length} dia(s) sem marcação</b> nos últimos 30 dias — enquanto não marcar, eles não viram pendência.
        <button class="btn mini" type="button" id="bdIrMes">Abrir o mês</button></div>` : ''}
      <div class="jor-acoes">
        <button class="btn principal" type="button" id="bdRelGeral" ${l.length ? '' : 'disabled'}>Relatório geral (todos)</button>
        ${est.pTipo ? `<span class="dc-sem">Mostrando: <b>${TIPOS_PEND[est.pTipo].toLowerCase()}</b> — relatórios e WhatsApp seguem o filtro.</span>` : ''}
      </div>
      ${barraDoc('bdBarraPend')}
      <div class="fer-rola"><table class="dc-planilha fer-tabela bd-pend"><thead><tr><th>Funcionário</th><th class="ce">Pendentes</th><th>Datas</th><th></th></tr></thead><tbody>
        ${l.map(x => `<tr class="fer-clica" data-pessoa="${x.f.id}" tabindex="0">
          <td><b>${esc(x.f.nome)}</b>${ativa(x.f) ? '' : ' <span class="tag inativo">inativo</span>'}<br><span class="dc-sem">${esc(x.f.fazenda || 'sem fazenda')}</span></td>
          <td class="ce"><span class="pv-num-perigo">${x.p.length}</span></td>
          <td>${x.p.slice(0, 8).map(tagData).join(' ')}${x.p.length > 8 ? ` <span class="dc-sem">+${x.p.length - 8}</span>` : ''}</td>
          <td class="bd-acoes-l"><button class="btn mini" type="button" data-rel="${x.f.id}">Relatório</button>
            <button class="btn mini btn-zap" type="button" data-zap="${x.f.id}"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button></td></tr>`).join('')
          || '<tr><td colspan="4" class="vazio">Ninguém com boletim pendente. 👏</td></tr>'}
      </tbody></table></div>
      <p class="dc-sem jor-nota">Data em marrom: não entregou · em amarelo: devolvido para correção. Clique nos cartões para cobrar só um tipo.
        Clique na pessoa para ver as datas e dar baixa quando o boletim chegar ou voltar corrigido.</p>
    </div>`;

  const setP = (k, v) => { est[k] = v; desenharPend(); };
  $('bdPIni').addEventListener('change', ev => setP('pIni', ev.target.value));
  $('bdPFim').addEventListener('change', ev => setP('pFim', ev.target.value));
  $('bdPFaz').addEventListener('change', ev => setP('pFaz', ev.target.value));
  $('bdPTipo').addEventListener('change', ev => setP('pTipo', ev.target.value));
  document.querySelectorAll('#telaBdPend [data-tipo]').forEach(b => b.addEventListener('click', () =>
    setP('pTipo', est.pTipo === b.dataset.tipo ? '' : b.dataset.tipo)));
  $('bdPLimpa')?.addEventListener('click', () => { est.pIni = ''; est.pFim = ''; est.pFaz = ''; est.pTipo = ''; desenharPend(); });
  $('bdIrMes')?.addEventListener('click', () => { est.mes = sm[0].d.slice(0, 7); irPara('bdMes'); });
  $('bdRelGeral').addEventListener('click', () => mostrarDoc(relGeral(est.pIni, est.pFim, est.pFaz, est.pTipo), 'bdBarraPend'));
  ligarBarraDoc($('telaBdPend'));
  const t = $('telaBdPend');
  t.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); verRelatorio(b.dataset.rel, 'bdBarraPend');
  }));
  t.querySelectorAll('[data-zap]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); window.open(linkZap(textoZap(b.dataset.zap, est.pIni, est.pFim, est.pTipo)), '_blank', 'noopener');
  }));
  t.querySelectorAll('tr[data-pessoa]').forEach(r => {
    r.addEventListener('click', () => dlgPessoa(r.dataset.pessoa));
    r.addEventListener('keydown', ev => { if (ev.key === 'Enter') dlgPessoa(r.dataset.pessoa); });
  });
}

/* ---------------- Diálogo da pessoa ---------------- */

function dlgPessoa(fid) {
  const f = pessoa(fid);
  if (!f) return;
  const p = pendenciasDe(fid, est.pIni, est.pFim, est.pTipo);
  const dlg = $('dlgBd');
  $('dlgBdCorpo').innerHTML = `<h3>${esc(f.nome)}</h3>
    <p class="dc-sem">${esc(f.fazenda || 'sem fazenda')}${f.cargo ? ' · ' + esc(f.cargo) : ''} · ${p.length} boletim(ns) pendente(s)${
      est.pIni || est.pFim ? ' no período ' + esc(rotPeriodo(est.pIni, est.pFim)) : ''}</p>
    ${p.length ? `<table class="dc-planilha"><thead><tr><th>Data</th><th>Dia</th><th>Situação</th><th></th></tr></thead><tbody>
      ${p.map(x => `<tr><td>${br(x.data)}</td><td>${SEMANA[dow(x.data)]}</td>
        <td><span class="bd-dt ${SIT[x.situacao].cls}">${SIT[x.situacao].rot}</span></td>
        <td class="ce"><button class="btn mini" type="button" data-chegou="${x.data}" data-sit="${x.situacao}">${
          x.situacao === 'correcao' ? 'Voltou corrigido' : 'Chegou hoje'}</button></td></tr>`).join('')}
    </tbody></table>` : '<div class="vazio">Nada pendente.</div>'}
    <label class="campo plena" style="margin-top:10px">Recado para o WhatsApp
      <textarea id="bdZapTexto" rows="7" readonly>${esc(textoZap(fid, est.pIni, est.pFim, est.pTipo))}</textarea></label>
    <div class="barra entre" style="margin-top:10px"><button class="btn" type="button" id="bdDlgFechar">Fechar</button>
      <span><button class="btn mini" type="button" id="bdCopiar">Copiar texto</button>
      <button class="btn mini btn-zap" type="button" id="bdDlgZap"><img class="ic-zap" src="img/whatsapp.png" alt="">WhatsApp</button>
      <button class="btn principal" type="button" id="bdDlgRel">Relatório individual</button></span></div>`;
  if (!dlg.open) dlg.showModal();
  $('bdDlgFechar').addEventListener('click', () => dlg.close());
  $('bdCopiar').addEventListener('click', async () => {
    const t = $('bdZapTexto').value;
    try { await navigator.clipboard.writeText(t); avisar('Texto copiado — é só colar na conversa.', true); }
    catch { $('bdZapTexto').select(); document.execCommand?.('copy'); avisar('Texto selecionado — use Ctrl+C.', true); }
  });
  $('bdDlgZap').addEventListener('click', () => window.open(linkZap(textoZap(fid, est.pIni, est.pFim, est.pTipo)), '_blank', 'noopener'));
  $('bdDlgRel').addEventListener('click', () => {
    dlg.close();
    const tela = !$('telaBdMes')?.hidden ? 'bdMes' : 'bdPend';
    verRelatorio(fid, tela === 'bdMes' ? 'bdBarraMes' : 'bdBarraPend');
  });
  $('dlgBdCorpo').querySelectorAll('[data-chegou]').forEach(b => b.addEventListener('click', async () => {
    await marcar(fid, b.dataset.chegou, 'entregou', { entregue_em: hoje() });
    avisar(b.dataset.sit === 'correcao' ? `Boletim de ${br(b.dataset.chegou)} voltou corrigido em ${br(hoje())}.`
      : `Boletim de ${br(b.dataset.chegou)} baixado — chegou em ${br(hoje())}.`, true);
    dlgPessoa(fid);
    const aberta = ['bdPend', 'bdMes', 'bdDia'].find(t => !$('tela' + t[0].toUpperCase() + t.slice(1))?.hidden);
    if (aberta === 'bdPend') desenharPend();
    if (aberta === 'bdMes') desenharMes();
  }));
}

/* O calendário mostra as faltas dos meses que têm pendência: carrega esses
   meses antes de montar a folha. */
async function verRelatorio(fid, barra) {
  const meses = [...new Set(pendenciasDe(fid, est.pIni, est.pFim, est.pTipo).map(x => x.data.slice(0, 7)))];
  for (const ym of meses) await garantir(ym + '-01', fimDoMes(ym));
  mostrarDoc(relIndividual(fid, est.pIni, est.pFim, est.pTipo), barra);
}

/* ---------------- resumo para o Painel do DP ---------------- */
export function resumoPainel() {
  const pend = (jd.dados.bolEntregas || []).filter(x => ehPend(x.situacao));
  return { pendentes: pend.length, pessoas: new Set(pend.map(x => x.funcionario_id)).size,
    naoEntregou: pend.filter(x => x.situacao === 'nao_entregou').length, correcao: pend.filter(x => x.situacao === 'correcao').length };
}

/* ===================================================================
   LIGAÇÃO
   =================================================================== */

export function ligarBoletins(navegar, aviso) {
  if (navegar) irPara = navegar;
  if (aviso) avisar = aviso;
}

export function limparBoletins() {
  carregados.clear();
  Object.assign(est, { dia: null, mes: null, busca: '', fazenda: '', pIni: '', pFim: '', pFaz: '', pTipo: '' });
}
