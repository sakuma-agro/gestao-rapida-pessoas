// cert-fornecedores.js — Certificação › Fornecedores: avaliação de fornecedores (FORM 023), 26/10/2026.
//
// Pedido do Guilherme: "o form 23 conseguimos fazer uma aba no app". Segue o
// POP 021 (Fornecedores): cada entrega/visita é avaliada com as perguntas do
// FORM 023 (SIM/NÃO); a cada 4 entregas o fornecedor recebe a nota:
//   APROVADO (NOTA 10) — todas conformes · APROVADO (NOTA 8) — uma não conforme ·
//   REPROVADO — duas ou mais não conformes (buscar outro fornecedor).
// As 5 partes do FORM viram 5 categorias, cada uma com as suas perguntas.
// Tabela cfo_avaliacoes (supabase/cert-fornecedores.sql), trancada por
// app_pode('cert'). Histórico 2024–2026 importado do FORM 023 preenchido.
// Evidências: link do OneDrive (evid_url) e/ou arquivos no Drive em
// certificacao/evidencia/f23-<id>/…  Sem internet: só consulta.

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { campoAnexos, donosComArquivo } from './arquivos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const semAc = s => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const FORM = { codigo: 'FORM 023', titulo: 'Avaliação de fornecedores', data: '01/12/2026', nrev: '02',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };

/* As 5 partes do FORM 023, com as perguntas de cada uma (SIM/NÃO). */
const CATS = [
  { id: 'viveiro', nome: 'Viveiro de mudas', forn: 'Viveiro', lote: true, nf: true,
    itens: [['nf', 'Nota fiscal'], ['defensivos', 'Declaração dos defensivos aplicados']] },
  { id: 'pragas', nome: 'Empresa de controle de pragas domissanitárias', forn: 'Empresa',
    itens: [['frequencia', 'Frequência combinada?'], ['relatorio', 'Entrega de relatório'], ['fispq', 'FISPQs dos produtos utilizados']] },
  { id: 'caixa_agua', nome: 'Empresa de limpeza de caixa d’água', forn: 'Empresa',
    itens: [['frequencia', 'Frequência combinada?'], ['relatorio', 'Entrega de relatório'], ['fispq', 'FISPQs dos produtos utilizados']] },
  { id: 'colheita', nome: 'Subcontratado da colheita', forn: 'Subcontratado',
    itens: [['pop01', 'Funcionários conhecem a higiene na colheita (POP 01)?'], ['pop06', 'Funcionários conhecem a higiene pessoal (POP 06)?'],
      ['ficha', 'Funcionários conhecem o produto (ficha técnica Hass Cat 1 e Cat 2)?'], ['produto', 'Produto final conforme a ficha técnica Hass Cat 1 e Cat 2?']] },
  { id: 'packing', nome: 'Packing house', forn: 'Packing house', nf: true, rotNf: 'NF de remessa',
    itens: [['manuseio', 'Cumpre os requisitos de manuseio das frutas no packing house?']] },
];
const cat = id => CATS.find(c => c.id === id);
const JANELA = 4;   /* POP 021: monitorar a cada 4 entregas */

/* ---------------- estado ---------------- */
const F = { carregado: false, regs: [], forn: [], arq: new Set(), fc: '', fq: '' };
const CAIXA = 'fornecedores.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { regs: F.regs, forn: F.forn });

/* Periodicidade da avaliação (cadastro do fornecedor, 26/10/2026): pedido dele
   "cadastrar o fornecedor e o tempo de avaliação, mensal, trimestral e etc, para
   alertar". Próxima = última avaliação + período; alerta vencida e até 15 dias. */
const PERIODOS = { 'Mensal': 1, 'Bimestral': 2, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12, 'A cada entrega': 0 };
const AVISO_DIAS = 15;
const maisMeses = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const diasAte = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5);
const avalsDe = f => F.regs.filter(r => r.categoria === f.categoria && semAc(r.fornecedor) === semAc(f.nome));
function agenda(f) {
  const l = avalsDe(f).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const ultima = l[0]?.data || null, meses = PERIODOS[f.periodicidade] ?? 12;
  const proxima = meses && ultima ? maisMeses(ultima, meses) : null;
  let st = { rot: 'Em dia', cor: 'ativo', nivel: 0 };
  if (!f.ativo) st = { rot: 'Inativo', cor: 'neutra', nivel: 0 };
  else if (!meses) st = { rot: 'A cada entrega', cor: 'neutra', nivel: 0 };
  else if (!ultima) st = { rot: 'Nunca avaliado', cor: 'perigo', nivel: 2 };
  else { const d = diasAte(proxima); st = d < 0 ? { rot: `Vencida há ${-d} d`, cor: 'perigo', nivel: 2 } : d <= AVISO_DIAS ? { rot: d ? `Vence em ${d} d` : 'Vence hoje', cor: 'alerta', nivel: 1 } : { rot: 'Em dia', cor: 'ativo', nivel: 0 }; }
  let cert = null;
  if (f.ativo && f.cert_validade) { const d = diasAte(f.cert_validade); cert = d < 0 ? { rot: `Certificado vencido há ${-d} d`, cor: 'perigo', nivel: 2 } : d <= 30 ? { rot: `Certificado vence em ${d} d`, cor: 'alerta', nivel: 1 } : null; }
  return { l, ultima, proxima, st, cert, sit: l.length ? situacao(l) : null };
}
/** Alertas para o painel (e para quem quiser mostrar em outro lugar). */
export function alertasFornecedores() {
  return F.forn.filter(f => f.ativo).flatMap(f => { const a = agenda(f); return [a.st.nivel ? { f, a, txt: a.st.rot, cor: a.st.cor, nivel: a.st.nivel } : null, a.cert ? { f, a, txt: a.cert.rot, cor: a.cert.cor, nivel: a.cert.nivel } : null].filter(Boolean); })
    .sort((x, y) => y.nivel - x.nivel);
}

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !F.carregado) { F.regs = c0.regs || []; F.forn = c0.forn || []; F.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (F.carregado) return;
    throw new Error('Sem internet e sem cópia da avaliação de fornecedores neste aparelho.');
  }
  const [r, fo] = await Promise.all([c.from('cfo_avaliacoes').select('*').order('data', { ascending: false }), c.from('cfo_fornecedores').select('*').order('nome')]);
  if (r.error) {
    if (F.carregado) return;
    if (/cfo_|relation|does not exist|schema cache/i.test(r.error.message || '')) throw new Error('A tabela da avaliação de fornecedores ainda não foi criada no banco (supabase/cert-fornecedores.sql).');
    throw r.error;
  }
  F.regs = r.data || []; F.forn = fo.error ? F.forn : fo.data || []; F.carregado = true; salvarCaixa();
  F.arq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}

/* ---------------- as contas (POP 021) ---------------- */
const chaveForn = r => r.categoria + '|' + semAc(r.fornecedor);
/** Situação de um fornecedor nas últimas 4 avaliações. */
function situacao(lista) {
  const ult = lista.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, JANELA);
  const nc = ult.filter(r => !r.conforme).length;
  return { ult, nc, nota: nc === 0 ? 10 : nc === 1 ? 8 : 0, rot: nc === 0 ? 'Aprovado · nota 10' : nc === 1 ? 'Aprovado · nota 8' : 'Reprovado', cor: nc === 0 ? 'ativo' : nc === 1 ? 'alerta' : 'perigo' };
}
function porFornecedor() {
  const m = new Map();
  for (const r of F.regs) { const k = chaveForn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.values()].map(l => { const s = situacao(l); return { c: cat(l[0].categoria), nome: l[0].fornecedor, n: l.length, ultima: s.ult[0]?.data, s }; })
    .sort((a, b) => CATS.indexOf(a.c) - CATS.indexOf(b.c) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
/** Conforme = todas as perguntas com SIM. */
const tudoSim = (c, itens) => c.itens.every(([k]) => itens[k] === true);

/* ---------------- peças ---------------- */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const simNao = v => v === true ? '<span class="cfo-sim">SIM</span>' : v === false ? '<span class="cfo-nao">NÃO</span>' : '—';
const linksDe = r => (Array.isArray(r.evid_links) && r.evid_links.length ? r.evid_links : r.evid_url ? [{ rot: 'Evidência', url: r.evid_url }] : []);
const evid = r => [...linksDe(r).map(x => `<a class="ce-link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.rot || 'Evidência')}</a>`), F.arq.has('f23-' + r.id) ? '📎' : ''].filter(Boolean).join('<br>') || '—';
function dialogo(html, ligar) {
  let d = $('dlgFo');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgFo'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgFo')?.open && $('dlgFo').close();
const erroDlg = t => { const e = $('foErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgFo')) $('dlgFo').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · PAINEL (situação de cada fornecedor)
   =================================================================== */
function desenharPainel() {
  const tela = $('telaFoPainel');
  const L = porFornecedor();
  const n = { ok: L.filter(x => x.s.nc === 0).length, oito: L.filter(x => x.s.nc === 1).length, rep: L.filter(x => x.s.nc >= 2).length };
  const al = alertasFornecedores();
  const ag = F.forn.filter(f => f.ativo).map(f => ({ f, a: agenda(f) })).sort((x, y) => y.a.st.nivel - x.a.st.nivel || String(x.a.proxima || '9').localeCompare(String(y.a.proxima || '9')));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Avaliação de fornecedores</h2>
      <p class="dica" style="margin:2px 0 0">${FORM.codigo} · POP 021 — cada entrega é avaliada; a nota sai das últimas ${JANELA} avaliações de cada fornecedor.</p></div>
      <button class="btn principal" type="button" id="foNovaP">+ Nova avaliação</button></div>
    <div class="pv-cards" style="margin-top:12px">
      <div class="pv-card pv-ok"><span>Aprovados · nota 10</span><strong>${n.ok}</strong><small>todas conformes</small></div>
      <div class="pv-card pv-alerta"><span>Aprovados · nota 8</span><strong>${n.oito}</strong><small>uma entrega não conforme</small></div>
      <div class="pv-card pv-perigo"><span>Reprovados</span><strong>${n.rep}</strong><small>2 ou mais não conformes — buscar outro</small></div>
      <div class="pv-card pv-calma"><span>Avaliações</span><strong>${F.regs.length}</strong><small>${L.length} fornecedor(es)</small></div>
    </div>
    ${al.length ? `<div class="aviso alerta cfo-alertas" style="margin-top:12px"><b>⚠ ${al.length} alerta(s)</b><ul>${al.map(x => `<li>${tag(x.txt, x.cor)} ${esc(x.f.nome)} <small class="dica">· ${esc(cat(x.f.categoria)?.nome || '')} · ${esc(x.f.periodicidade)}${x.a.proxima ? ' · próxima ' + br(x.a.proxima) : ''}</small>
      <button class="ce-link" type="button" data-avaliar="${esc(x.f.id)}">avaliar agora</button></li>`).join('')}</ul></div>` : '<div class="aviso ok" style="margin-top:12px">Nenhuma avaliação vencida ou vencendo nos próximos 15 dias.</div>'}
    ${ag.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha bm-tab"><thead><tr><th>Categoria</th><th>Fornecedor</th><th>Periodicidade</th><th class="ce">Últimas ${JANELA}</th><th class="ce">Última avaliação</th><th class="ce">Próxima</th><th>Prazo</th><th>Nota (POP 021)</th></tr></thead><tbody>
      ${ag.map(({ f, a }) => `<tr><td>${esc(cat(f.categoria)?.nome || f.categoria)}</td><td><b>${esc(f.nome)}</b></td><td>${esc(f.periodicidade)}</td>
        <td class="ce">${a.sit ? a.sit.ult.map(r => r.conforme ? '<span class="cfo-sim" title="' + br(r.data) + '">✓</span>' : '<span class="cfo-nao" title="' + br(r.data) + '">✗</span>').join(' ') : '—'}</td>
        <td class="ce">${br(a.ultima)}</td><td class="ce">${a.proxima ? br(a.proxima) : '—'}</td><td>${tag(a.st.rot, a.st.cor)}${a.cert ? ' ' + tag(a.cert.rot, a.cert.cor) : ''}</td><td>${a.sit ? tag(a.sit.rot, a.sit.cor) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio" style="margin-top:12px">Nenhum fornecedor cadastrado. Cadastre em Fornecedores › Cadastro.</div>'}
    <p class="dica" style="margin-top:8px">Somente são avaliados fornecedores com certificado GLOBALG.A.P. válido até o fim da prestação do serviço. Reprovado: buscar outro fornecedor em definitivo ou até o anterior se readequar.</p>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="foImp">Imprimir FORM 023</button>
    <button class="btn" type="button" id="foXlsx">Excel</button>
  </div>`;
  $('foNovaP').addEventListener('click', () => formAval(null, F.fc || 'pragas'));
  tela.querySelectorAll('[data-avaliar]').forEach(b => b.addEventListener('click', () => { const f = F.forn.find(x => x.id === b.dataset.avaliar); formAval(null, f.categoria, f.nome); }));
  $('foImp').addEventListener('click', () => mostrar(docForm(), { barra: true }));
  $('foXlsx').addEventListener('click', () => exportar());
}

/* ===================================================================
   TELA · AVALIAÇÕES (as tabelas do FORM 023)
   =================================================================== */
function tabCat(c, regs, edita) {
  const L = regs.filter(r => r.categoria === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const porF = new Map(); L.forEach(r => { const k = semAc(r.fornecedor); if (!porF.has(k)) porF.set(k, []); porF.get(k).push(r); });
  const sit = [...porF.values()].map(l => `${esc(l[0].fornecedor)}: ${tag(situacao(l).rot, situacao(l).cor)}`).join(' · ');
  return `<h3 class="bm-h3">${esc(c.nome)} ${sit ? `<small style="font-weight:400">— ${sit}</small>` : ''}</h3>
    ${L.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab cfo-tab"><thead><tr><th class="ce">Data</th><th>${esc(c.forn)}</th>${c.lote ? '<th>Nº lote</th>' : ''}${c.nf ? `<th>${esc(c.rotNf || 'Nota fiscal')}</th>` : ''}
      ${c.itens.map(([, r]) => `<th class="ce">${esc(r)}</th>`).join('')}<th class="ce">Conforme?</th><th>Justificativa</th><th class="ce">Evidência</th>${edita ? '<th></th>' : ''}</tr></thead><tbody>
      ${L.map(r => `<tr${r.conforme ? '' : ' class="cfo-linha-nc"'}><td class="ce">${br(r.data)}</td><td>${esc(r.fornecedor)}</td>${c.lote ? `<td>${esc(r.lote || '')}</td>` : ''}${c.nf ? `<td>${esc(r.nf || '')}</td>` : ''}
        ${c.itens.map(([k]) => `<td class="ce">${simNao((r.itens || {})[k])}</td>`).join('')}<td class="ce">${simNao(r.conforme)}</td><td>${esc(r.justificativa || '')}</td><td class="ce">${evid(r)}</td>
        ${edita ? `<td class="ce"><button class="btn mini" type="button" data-fo="${esc(r.id)}">Abrir</button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : '<p class="dica">Nenhuma avaliação nesta categoria.</p>'}`;
}
function desenharAval() {
  const tela = $('telaFoAvaliacoes');
  const q = semAc(F.fq);
  const regs = q ? F.regs.filter(r => semAc([r.fornecedor, r.nf, r.lote, r.justificativa].join(' ')).includes(q)) : F.regs;
  const cats = F.fc ? [cat(F.fc)] : CATS;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Avaliações — ${FORM.codigo}</h2>
      <p class="dica" style="margin:2px 0 0">Uma linha por entrega ou visita. Conforme = todas as respostas SIM.</p></div>
      <button class="btn principal" type="button" id="foNova">+ Nova avaliação</button></div>
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Categoria <select id="foCat"><option value="">Todas</option>${CATS.map(c => `<option value="${c.id}"${c.id === F.fc ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo" style="grid-column:span 2">Procurar <input type="search" id="foQ" value="${esc(F.fq)}" placeholder="fornecedor, NF, lote…"></label>
    </div>
    ${cats.map(c => tabCat(c, regs, true)).join('')}
  </div>`;
  $('foNova').addEventListener('click', () => formAval(null, F.fc || 'pragas'));
  $('foCat').addEventListener('change', e => { F.fc = e.target.value; desenharAval(); });
  $('foQ').addEventListener('input', e => { F.fq = e.target.value; const p = e.target.selectionStart; desenharAval(); const i = $('foQ'); i.focus(); i.setSelectionRange(p, p); });
  tela.querySelectorAll('[data-fo]').forEach(b => b.addEventListener('click', () => { const r = F.regs.find(x => x.id === b.dataset.fo); formAval(r, r.categoria); }));
}

/* ---------------- formulário ---------------- */
let anexos = null;
function formAval(r, catId, fornPre) {
  const c = cat(r ? r.categoria : catId);
  const v = r || { data: hoje(), fornecedor: fornPre || '', lote: '', nf: '', itens: {}, justificativa: '', evid_url: '', evid_links: [], observacao: '' };
  const forns = [...new Set([...F.forn.filter(x => x.categoria === c.id && x.ativo).map(x => x.nome), ...F.regs.filter(x => x.categoria === c.id).map(x => x.fornecedor)])];
  let links = linksDe(v).map(x => ({ ...x }));
  const radio = (k, val) => `<span class="cfo-sn"><label><input type="radio" name="fo_${k}" value="1" ${val === true ? 'checked' : ''}> SIM</label>
    <label><input type="radio" name="fo_${k}" value="0" ${val === false ? 'checked' : ''}> NÃO</label></span>`;
  dialogo(`<h3>${r ? 'Avaliação de ' + esc(r.fornecedor) : 'Nova avaliação'} · ${FORM.codigo}</h3>
    <div class="aviso erro" id="foErro" hidden></div>
    <div class="grade">
      <label class="campo">Categoria <select id="foCatF" ${r ? 'disabled' : ''}>${CATS.map(x => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label class="campo">Data da entrega / visita <input type="date" id="foData" value="${esc(String(v.data || '').slice(0, 10))}"></label>
      <label class="campo">${esc(c.forn)} <input type="text" id="foForn" list="foForns" value="${esc(v.fornecedor || '')}"></label>
      ${c.lote ? `<label class="campo">Nº lote <input type="text" id="foLote" value="${esc(v.lote || '')}"></label>` : ''}
      ${c.nf ? `<label class="campo">${esc(c.rotNf || 'Nota fiscal')} <input type="text" id="foNf" value="${esc(v.nf || '')}"></label>` : ''}
    </div>
    <datalist id="foForns">${forns.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <fieldset class="cp-fs"><legend>Perguntas do FORM 023 <span class="dica" id="foConf"></span></legend>
      ${c.itens.map(([k, rot]) => `<div class="cfo-perg"><span>${esc(rot)}</span>${radio(k, (v.itens || {})[k])}</div>`).join('')}
    </fieldset>
    <label class="campo">Justificativa (obrigatória se alguma resposta for NÃO) <input type="text" id="foJust" value="${esc(v.justificativa || '')}"></label>
    <fieldset class="cp-fs"><legend>Evidências (links do OneDrive)</legend><div id="foLinks"></div>
      <button class="btn mini" type="button" id="foLinkMais">＋ Link</button></fieldset>
    <div id="foAnx" style="margin-top:8px"></div>
    <label class="campo">Observação <input type="text" id="foObs" value="${esc(v.observacao || '')}"></label>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="foApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="foOk">Salvar</button></div></div>`, d => {
    anexos = campoAnexos($('foAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Evidência (arquivo)', dica: 'PDF ou foto — relatório, FISPQ, NF, declaração' });
    anexos.abrir(r ? 'f23-' + r.id : null);
    $('foCatF').addEventListener('change', e => formAval(null, e.target.value));
    const desenharLinks = () => {
      $('foLinks').innerHTML = links.map((x, i) => `<div class="cfo-link"><input type="text" data-lr="${i}" value="${esc(x.rot || '')}" placeholder="Relatório, FISPQ, NF…">
        <input type="url" data-lu="${i}" value="${esc(x.url || '')}" placeholder="https://1drv.ms/…"><button class="btn mini" type="button" data-lx="${i}" title="Tirar">✕</button>
        ${x.url ? `<a class="ce-link" href="${esc(x.url)}" target="_blank" rel="noopener">abrir</a>` : ''}</div>`).join('') || '<p class="dica" style="margin:0">Nenhum link.</p>';
      $('foLinks').querySelectorAll('[data-lr]').forEach(i => i.addEventListener('input', () => { links[i.dataset.lr].rot = i.value; }));
      $('foLinks').querySelectorAll('[data-lu]').forEach(i => i.addEventListener('input', () => { links[i.dataset.lu].url = i.value; }));
      $('foLinks').querySelectorAll('[data-lx]').forEach(b => b.addEventListener('click', () => { links.splice(Number(b.dataset.lx), 1); desenharLinks(); }));
    };
    desenharLinks();
    $('foLinkMais').addEventListener('click', () => { links.push({ rot: '', url: '' }); desenharLinks(); });
    const lerItens = () => Object.fromEntries(c.itens.map(([k]) => { const s = d.querySelector(`input[name="fo_${k}"]:checked`); return [k, s ? s.value === '1' : null]; }));
    const conta = () => { const it = lerItens(); const falta = c.itens.filter(([k]) => it[k] === null).length;
      $('foConf').textContent = falta ? `— faltam ${falta} resposta(s)` : tudoSim(c, it) ? '— CONFORME' : '— NÃO CONFORME'; };
    d.querySelectorAll('.cfo-perg input').forEach(i => i.addEventListener('change', conta)); conta();
    $('foOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const it = lerItens();
      if (c.itens.some(([k]) => it[k] === null)) return erroDlg('Responda SIM ou NÃO em todas as perguntas.');
      const linha = { categoria: c.id, data: $('foData').value, fornecedor: so($('foForn').value), lote: $('foLote') ? so($('foLote').value) || null : null,
        nf: $('foNf') ? so($('foNf').value) || null : null, itens: it, conforme: tudoSim(c, it), justificativa: so($('foJust').value) || null,
        observacao: so($('foObs').value) || null };
      const ls = links.map(x => ({ rot: so(x.rot) || 'Evidência', url: so(x.url) })).filter(x => x.url);
      if (ls.some(x => !/^https?:\/\//i.test(x.url))) return erroDlg('Os links de evidência precisam começar com https://');
      linha.evid_links = ls; linha.evid_url = ls[0]?.url || null;
      if (!linha.data) return erroDlg('Informe a data.');
      if (!linha.fornecedor) return erroDlg('Informe o fornecedor.');
      if (!linha.conforme && !linha.justificativa) return erroDlg('Escreva a justificativa da não conformidade.');
      $('foOk').disabled = true;
      try {
        const t = estado.cliente.from('cfo_avaliacoes');
        const { data, error } = r ? await t.update(linha).eq('id', r.id).select().single() : await t.insert(linha).select().single();
        if (error) throw error;
        const i = F.regs.findIndex(x => x.id === data.id); if (i >= 0) F.regs[i] = data; else F.regs.unshift(data);
        if (anexos?.mudou) { await anexos.salvar('f23-' + data.id); F.arq.add('f23-' + data.id); }
        salvarCaixa(); fechar(); redesenhar();
      } catch (e) { if ($('foOk')) $('foOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
    });
    $('foApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar esta avaliação?')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cfo_avaliacoes').delete().eq('id', r.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      F.regs = F.regs.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · CADASTRO DE FORNECEDORES (periodicidade da avaliação)
   =================================================================== */
function desenharCadastro() {
  const tela = $('telaFoCadastro');
  const L = F.forn.slice().sort((a, b) => Number(b.ativo) - Number(a.ativo) || CATS.findIndex(c => c.id === a.categoria) - CATS.findIndex(c => c.id === b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Cadastro de fornecedores</h2>
      <p class="dica" style="margin:2px 0 0">Cada fornecedor com a periodicidade da avaliação. O painel alerta quando a próxima avaliação vence ou falta ${AVISO_DIAS} dias, e quando o certificado GLOBALG.A.P. está para vencer.</p></div>
      <button class="btn principal" type="button" id="foFNovo">+ Novo fornecedor</button></div>
    ${L.length ? `<div class="ac-rola" style="margin-top:12px"><table class="dc-planilha bm-tab"><thead><tr><th>Categoria</th><th>Fornecedor</th><th>Periodicidade</th><th class="ce">Avaliações</th><th class="ce">Última</th><th class="ce">Próxima</th><th>Prazo</th><th class="ce">Certificado até</th><th>Contato</th><th></th></tr></thead><tbody>
      ${L.map(f => { const a = agenda(f); return `<tr${f.ativo ? '' : ' class="cfo-inativo"'}><td>${esc(cat(f.categoria)?.nome || f.categoria)}</td><td><b>${esc(f.nome)}</b>${f.ativo ? '' : ' <small class="dica">(inativo)</small>'}</td><td>${esc(f.periodicidade)}</td>
        <td class="ce">${a.l.length}</td><td class="ce">${br(a.ultima)}</td><td class="ce">${a.proxima ? br(a.proxima) : '—'}</td><td>${tag(a.st.rot, a.st.cor)}</td>
        <td class="ce">${f.cert_validade ? br(f.cert_validade) : '—'}${a.cert ? '<br>' + tag(a.cert.rot, a.cert.cor) : ''}</td><td>${esc(f.contato || '')}</td>
        <td class="ce"><button class="btn mini" type="button" data-ff="${esc(f.id)}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vazio" style="margin-top:12px">Nenhum fornecedor cadastrado.</div>'}
  </div>`;
  $('foFNovo').addEventListener('click', () => formForn(null));
  tela.querySelectorAll('[data-ff]').forEach(b => b.addEventListener('click', () => formForn(F.forn.find(x => x.id === b.dataset.ff))));
}
function formForn(f) {
  const v = f || { categoria: F.fc || 'pragas', nome: '', periodicidade: 'Trimestral', cert_validade: '', contato: '', ativo: true, observacao: '' };
  dialogo(`<h3>${f ? esc(f.nome) : 'Novo fornecedor'}</h3>
    <div class="aviso erro" id="foErro" hidden></div>
    <div class="grade">
      <label class="campo">Categoria <select id="ffCat">${CATS.map(c => `<option value="${c.id}"${c.id === v.categoria ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo">Nome <input type="text" id="ffNome" value="${esc(v.nome || '')}"></label>
      <label class="campo">Avaliar <select id="ffPer">${Object.keys(PERIODOS).map(p => `<option${p === v.periodicidade ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="campo">Certificado GLOBALG.A.P. válido até <input type="date" id="ffCert" value="${esc(String(v.cert_validade || '').slice(0, 10))}"></label>
      <label class="campo">Contato <input type="text" id="ffCont" value="${esc(v.contato || '')}" placeholder="telefone, e-mail"></label>
      <label class="campo rs-check" style="align-self:end"><input type="checkbox" id="ffAtivo" ${v.ativo ? 'checked' : ''}> Ativo</label>
    </div>
    <label class="campo">Observação <input type="text" id="ffObs" value="${esc(v.observacao || '')}"></label>
    <p class="dica">“A cada entrega” não gera alerta de prazo (avalia-se quando houver entrega). Fornecedor inativo sai dos alertas.</p>
    <div class="barra entre"><div>${f ? '<button class="btn perigo" type="button" id="ffApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="ffOk">Salvar</button></div></div>`, () => {
    $('ffOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const linha = { categoria: $('ffCat').value, nome: so($('ffNome').value).toUpperCase(), periodicidade: $('ffPer').value, cert_validade: $('ffCert').value || null,
        contato: so($('ffCont').value) || null, ativo: $('ffAtivo').checked, observacao: so($('ffObs').value) || null };
      if (!linha.nome) return erroDlg('Informe o nome do fornecedor.');
      $('ffOk').disabled = true;
      try {
        const t = estado.cliente.from('cfo_fornecedores');
        const { data, error } = f ? await t.update(linha).eq('id', f.id).select().single() : await t.insert(linha).select().single();
        if (error) throw error;
        if (f && semAc(f.nome) !== semAc(linha.nome) && f.categoria === linha.categoria) {
          /* renomeou: as avaliações acompanham o nome */
          const r = await estado.cliente.from('cfo_avaliacoes').update({ fornecedor: linha.nome }).eq('categoria', f.categoria).ilike('fornecedor', f.nome).select();
          if (!r.error) r.data.forEach(x => { const i = F.regs.findIndex(y => y.id === x.id); if (i >= 0) F.regs[i] = x; });
        }
        const i = F.forn.findIndex(x => x.id === data.id); if (i >= 0) F.forn[i] = data; else F.forn.push(data);
        salvarCaixa(); fechar(); redesenhar();
      } catch (e) { if ($('ffOk')) $('ffOk').disabled = false; erroDlg(/duplicate|unique/i.test(String(e.message)) ? 'Esse fornecedor já está cadastrado nessa categoria.' : 'Não consegui gravar: ' + esc(e.message || e)); }
    });
    $('ffApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar o cadastro? As avaliações continuam (para tirar dos alertas, prefira desmarcar "Ativo").')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cfo_fornecedores').delete().eq('id', f.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      F.forn = F.forn.filter(x => x.id !== f.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   IMPRESSÃO E EXCEL
   =================================================================== */
function docForm() {
  const corpo = CATS.map(c => {
    const L = F.regs.filter(r => r.categoria === c.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const porF = new Map(); L.forEach(r => { const k = semAc(r.fornecedor); if (!porF.has(k)) porF.set(k, []); porF.get(k).push(r); });
    return `<h2 class="rel-secao">${esc(c.nome)}</h2>
      <table class="rel-tabela"><thead><tr><th>Data</th><th>${esc(c.forn)}</th>${c.lote ? '<th>Nº lote</th>' : ''}${c.nf ? `<th>${esc(c.rotNf || 'Nota fiscal')}</th>` : ''}${c.itens.map(([, rot]) => `<th>${esc(rot)}</th>`).join('')}<th>Conforme?</th><th>Justificativa</th></tr></thead><tbody>
      ${L.map(r => `<tr><td>${br(r.data)}</td><td>${esc(r.fornecedor)}</td>${c.lote ? `<td>${esc(r.lote || '')}</td>` : ''}${c.nf ? `<td>${esc(r.nf || '')}</td>` : ''}${c.itens.map(([k]) => `<td>${(r.itens || {})[k] === true ? 'SIM' : (r.itens || {})[k] === false ? 'NÃO' : ''}</td>`).join('')}<td><b>${r.conforme ? 'SIM' : 'NÃO'}</b></td><td>${esc(r.justificativa || '')}</td></tr>`).join('') || `<tr><td colspan="${4 + c.itens.length + (c.lote ? 1 : 0) + (c.nf ? 1 : 0)}">Sem avaliações.</td></tr>`}
      </tbody></table>
      ${porF.size ? `<p class="rel-nota">Situação (últimas ${JANELA}): ${[...porF.values()].map(l => `${esc(l[0].fornecedor)} — ${situacao(l).rot}`).join(' · ')}</p>` : ''}`;
  }).join('');
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(FORM.titulo)}</h1><p>POP 021 — Fornecedores</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${FORM.codigo}</span></div></header>
    <div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>
    ${corpo}
    <p class="rel-nota">APROVADO (NOTA 10): todas as entregas conformes · APROVADO (NOTA 8): uma entrega não conforme · REPROVADO: 2 ou mais entregas não conformes. Somente são avaliados fornecedores com certificado GLOBALG.A.P. válido até a finalização da prestação do serviço.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
async function exportar() {
  const linhas = F.regs.slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || String(a.data).localeCompare(String(b.data))).map(r => { const c = cat(r.categoria);
    return [r.data, c?.nome || r.categoria, r.fornecedor, r.lote || '', r.nf || '', (c?.itens || []).map(([k, rot]) => `${rot}: ${(r.itens || {})[k] === true ? 'SIM' : (r.itens || {})[k] === false ? 'NÃO' : '—'}`).join(' | '),
      r.conforme ? 'SIM' : 'NÃO', r.justificativa || '', linksDe(r).map(x => `${x.rot}: ${x.url}`).join(' | ')]; });
  await baixarXlsx(`avaliacao-fornecedores-${hoje()}`, [{ nome: 'FORM 023', titulo: `${FORM.codigo} — ${FORM.titulo}`, subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'Categoria', larg: 30 }, { rot: 'Fornecedor', larg: 26 }, { rot: 'Lote', larg: 10 }, { rot: 'NF', larg: 12 },
      { rot: 'Respostas', larg: 70 }, { rot: 'Conforme', larg: 10 }, { rot: 'Justificativa', larg: 30 }, { rot: 'Evidência', larg: 40 }],
    linhas }]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_FORNECEDORES = ['foPainel', 'foAvaliacoes', 'foCadastro'];
const DESENHO = { foPainel: desenharPainel, foAvaliacoes: desenharAval, foCadastro: desenharCadastro };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirFornecedores(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!F.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando a avaliação de fornecedores…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a avaliação de fornecedores: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgFo')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparFornecedores() {
  F.carregado = false; F.regs = []; F.forn = []; F.arq = new Set(); F.fc = ''; F.fq = '';
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
/** Meses com avaliação (evidência "viva" do FORM 023 na Lista mestra). */
export const _cfo = { F, situacao, porFornecedor };
