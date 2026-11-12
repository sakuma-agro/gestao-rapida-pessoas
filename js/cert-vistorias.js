// cert-vistorias.js — Certificação › CHECKS Digital › Vistorias (12/11/2026).
//
// Pedido do Guilherme: "esse check list [Vistoria da moradia dos trabalhadores,
// Rainforest 5.7.1] quero que tenha no registro em certificações, histórico fique
// lá para apresentar! Vamos interligar os 2 app, Vistorias e Certificações".
//
// Os checklists prontos de certificação são preenchidos na área Vistorias e
// Segurança (é lá que estão as fotos, o NC vira apontamento com prazo e o
// relatório completo). Esta tela mostra o histórico deles dentro da Certificação,
// do jeito de apresentar na auditoria:
//  · um cartão por checklist de certificação (último, quantos, faixa dos períodos),
//    com "Preencher no Vistorias" (abre a área já no checklist) e "Histórico";
//  · tabela de todos os preenchimentos (filtros checklist/ano/fazenda), com
//    C · NC · NA e a % de conformidade;
//  · "Ver" monta a folha de apresentação aqui mesmo (para quem só tem a
//    Certificação) e "Relatório com fotos" abre o relatório do Vistorias.
//
// Qual checklist é de certificação: nome/norma com Rainforest, GLOBALG.A.P., GRASP,
// SMETA ou FORMAGR — a mesma regra do banco (vistorias.e_certificacao), que libera
// a leitura desses registros para quem tem a Certificação
// (supabase/cert-vistorias.sql). No Vistorias o cartão do checklist ganha o selo
// "Certificação · ver histórico" (vistorias/lop-depois.js, fonte no sakuma-vistorias).

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { cartaoRegistro, cobrir, situacaoCob } from './cert-cartoes.js';
import { entrarNaArea, podeArea } from './areas.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');

export const RE_CERT = /(rainforest|global ?g\.?a\.?p|grasp|smeta|formagr)/i;
export const eCert = m => !!m && RE_CERT.test([m.sigla, m.titulo, m.subtitulo, m.ref].join(' '));

/* Os checklists de certificação que já existem no Vistorias (cartão aparece mesmo
   sem nenhum preenchido). Checklist novo de certificação criado lá entra sozinho
   na tela assim que tiver o primeiro registro. Periodicidade = faixa do cartão. */
const CONHECIDOS = [
  { chave: 'modelo:ra-moradia', sigla: 'RA Moradia', titulo: 'Vistoria da moradia dos trabalhadores', ref: 'Rainforest Alliance 2020 · 5.7.1', per: 'Anual' },
  { chave: 'modelo:globalgap-ifa6', sigla: 'IFA v6', titulo: 'Auditoria interna GLOBALG.A.P. IFA v6', ref: 'GLOBALG.A.P. IFA v6 (GFS)', per: 'Anual' },
  { chave: 'modelo:grasp-v2', sigla: 'GRASP v2', titulo: 'Autoavaliação GRASP v2', ref: 'GLOBALG.A.P. GRASP v2.0', per: 'Anual' },
  { chave: 'modelo:formagr-02-colheita', sigla: 'FORMAGR-02', titulo: 'Inspeção Colheita', ref: 'FORMAGR-02 – Inspeção de Colheita', per: 'Por evento' },
];

/* ---------------- estado ---------------- */
const E = { carregado: false, regs: [], fl: { ck: '', ano: '', faz: '' } };
const CAIXA = 'cert-vistorias.cache';

const modeloDe = v => (Array.isArray(v.checklist) && v.checklist[0] && v.checklist[0].modelo) || null;
const chaveDe = v => modeloDe(v)?.chave || '';

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { E.regs = c0.regs || []; E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia do histórico neste aparelho.');
  }
  const { data, error } = await c.schema('vistorias').from('vistorias')
    .select('id,codigo,unidade,setor,data,tecnico,cargo,motivo,aprovador,responsavel_turma,colaboradores,observacoes,checklist,criado_em')
    .order('data', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  E.regs = (data || []).filter(v => eCert(modeloDe(v)));
  E.carregado = true;
  nucleo.gravarCaixa(CAIXA, { regs: E.regs });
}

/* ---------------- contas ---------------- */
function conta(v) {
  const k = { C: 0, NC: 0, NA: 0, sem: 0, fotos: 0 };
  (v.checklist || []).forEach(b => (b.itens || []).forEach(it => {
    k.fotos += (it.fotos || []).length;
    if (it.tp) return;                       // item de texto/data: não entra na conta
    if (it.r === 'C' || it.r === 'NC' || it.r === 'NA') k[it.r]++; else k.sem++;
  }));
  k.pct = k.C + k.NC ? Math.round(100 * k.C / (k.C + k.NC)) : null;
  return k;
}
const pctTag = p => p == null ? '—' : `<b style="color:${p >= 95 ? 'var(--verde-escuro, #4E7D00)' : p >= 80 ? '#8A6D00' : '#A12A1E'}">${p}%</b>`;
const resumoTags = k => `<span class="cv-t cv-c">${k.C} C</span> <span class="cv-t cv-nc">${k.NC} NC</span> <span class="cv-t cv-na">${k.NA} NA</span>`;

/* Mesmo mapeamento do Vistorias (ckCampoCab): campo do cabeçalho do checklist
   que mora numa coluna da vistoria. */
function campoCab(rot) {
  const r = String(rot || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[:.]/g, '').trim();
  if (/^(fazenda|unidade|propriedade)/.test(r)) return 'unidade';
  if (/^data da (verificacao|vistoria|inspecao)/.test(r)) return 'data';
  if (/(trabalhadores|colaboradores)/.test(r)) return 'colaboradores';
  if (r === 'responsavel' || /^responsavel (pela|do|da) (turma|setor|area)/.test(r)) return 'responsavel_turma';
  if (/^(atividade|talhao|setor|local)/.test(r)) return 'setor';
  if (/^(elaboracao|elaborado|tecnico|inspetor|verificado por)/.test(r)) return 'tecnico';
  if (/^(aprovacao|aprovado)/.test(r)) return 'aprovador';
  return null;
}
function camposDe(v) {
  const m = modeloDe(v) || {};
  return (m.campos || []).map(rot => {
    const k = campoCab(rot);
    let val = k ? v[k] : (m.valores || {})[rot];
    if (k === 'data' || /^data/i.test(rot)) val = br(val) || val;
    return [rot, val == null ? '' : String(val)];
  });
}
/* O que identifica o preenchimento além da fazenda (ex.: a casa / alojamento) */
const detalheDe = v => camposDe(v).filter(([r]) => !campoCab(r) && !/^data/i.test(r)).map(([, x]) => x).filter(Boolean).slice(0, 2).join(' · ');

/* Lista dos checklists: os conhecidos + qualquer outro de certificação que já tenha registro */
function catalogo() {
  const l = CONHECIDOS.map(x => ({ ...x }));
  E.regs.forEach(v => {
    const m = modeloDe(v); if (!m || l.some(x => x.chave === m.chave)) return;
    l.push({ chave: m.chave, sigla: m.sigla || '', titulo: m.titulo || 'Checklist', ref: m.ref || '', per: 'Por evento' });
  });
  return l;
}
const nomeCk = chave => { const x = catalogo().find(c => c.chave === chave); return x ? `${x.sigla ? x.sigla + ' · ' : ''}${x.titulo}` : chave; };

/* ---------------- ligações com o Vistorias ---------------- */
function preencherNoVistorias(chave) {
  if (!podeArea('vistorias')) return alert('Para preencher, é preciso ter acesso à área Vistorias e Segurança. Peça a liberação ao administrador.');
  entrarNaArea('vistorias', null, 'ck=' + encodeURIComponent(chave));
}
function relatorioNoVistorias(id) {
  if (!podeArea('vistorias')) return alert('O relatório com fotos abre na área Vistorias e Segurança, e você ainda não tem acesso a ela. Use "Ver" para apresentar por aqui.');
  entrarNaArea('vistorias', null, 'vist=' + encodeURIComponent(id));
}

/* ===================================================================
   TELA
   =================================================================== */
function desenhar() {
  const tela = $('telaClVistorias'); if (!tela) return;
  const f = E.fl;
  const cat = catalogo();
  const regsDo = ch => E.regs.filter(v => chaveDe(v) === ch);
  const cartao = c => {
    const l = regsDo(c.chave), ult = l[0];
    const ano = hoje().slice(0, 4), noAno = l.filter(v => String(v.data || '').startsWith(ano));
    const ncs = noAno.reduce((s, v) => s + conta(v).NC, 0);
    const cob = cobrir(c.per, l.map(v => v.data));
    return cartaoRegistro({ cod: c.sigla || 'CL', nome: c.titulo, sit: situacaoCob(cob, c.per),
      nums: [{ n: noAno.length, rot: 'neste ano' }, { n: l.length, rot: 'no total' }, { n: ncs, rot: 'NC no ano', ruim: ncs > 0 }], cob,
      linha: `${ult ? `Último: ${br(ult.data)}${ult.unidade ? ' · ' + esc(ult.unidade) : ''} · ${esc(ult.codigo || '')} · ${pctTag(conta(ult).pct)} conforme` : 'Nenhum preenchido ainda'} · ${esc(c.ref)}`,
      botoes: [{ rot: 'Preencher no Vistorias', attr: `data-cv-preencher="${esc(c.chave)}"`, principal: true }, { rot: 'Histórico', attr: `data-cv-hist="${esc(c.chave)}"` }] });
  };
  const anos = [...new Set(E.regs.map(v => String(v.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const fazendas = [...new Set(E.regs.map(v => String(v.unidade || '').trim()).filter(Boolean))].sort();
  const l = E.regs.filter(v => (!f.ck || chaveDe(v) === f.ck) && (!f.ano || String(v.data || '').startsWith(f.ano)) && (!f.faz || String(v.unidade || '').trim() === f.faz));
  const tot = l.reduce((s, v) => { const k = conta(v); s.C += k.C; s.NC += k.NC; s.NA += k.NA; return s; }, { C: 0, NC: 0, NA: 0 });
  const pctGeral = tot.C + tot.NC ? Math.round(100 * tot.C / (tot.C + tot.NC)) : null;

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Checklists de certificação · feitos no Vistorias</h2>
      <p class="dica" style="margin:2px 0 0">Preenchidos na área Vistorias e Segurança (com fotos, e o NC vira apontamento com prazo). Aqui fica o histórico para apresentar na auditoria.</p></div></div>
    <div class="rc-cards" style="margin-top:14px">${cat.map(cartao).join('')}</div>
    <div class="rc-legenda"><span><i style="background:var(--verde)"></i>com registro</span><span><i style="border:1.5px dashed var(--suave)"></i>período atual em aberto</span><span><i style="background:var(--marrom);opacity:.75"></i>passou sem registro</span></div>
  </div>
  <div class="cartao naoimprimir" id="cvHist">
    <h3 style="margin:0 0 8px">Histórico</h3>
    <div class="grade larga">
      <label class="campo">Checklist <select id="cvFCk">${opcoes(cat.map(c => [c.chave, `${c.sigla ? c.sigla + ' · ' : ''}${c.titulo}`]), f.ck, 'Todos')}</select></label>
      <label class="campo">Ano <select id="cvFAno">${opcoes(anos, f.ano, 'Todos')}</select></label>
      <label class="campo">Fazenda <select id="cvFFaz">${opcoes(fazendas, f.faz, 'Todas')}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      <div class="pv-card pv-calma"><span>Preenchimentos</span><strong>${l.length}</strong><small>no filtro</small></div>
      <div class="pv-card ${tot.NC ? 'pv-perigo' : 'pv-calma'}"><span>Itens NC</span><strong>${tot.NC}</strong><small>viram apontamento no Vistorias</small></div>
      <div class="pv-card pv-calma"><span>Conformidade</span><strong>${pctGeral == null ? '—' : pctGeral + '%'}</strong><small>C ÷ (C + NC), sem contar NA</small></div>
    </div>
    <div class="qp-bloco">${l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>Nº</th><th>Checklist</th><th>Fazenda · local</th><th class="ce">Resultado</th><th class="ce">Conforme</th><th>Feito por</th><th></th></tr></thead><tbody>
      ${l.map(v => { const k = conta(v), m = modeloDe(v) || {}; const det = detalheDe(v);
        return `<tr><td class="ce">${br(v.data)}</td><td><b>${esc(v.codigo || '—')}</b></td>
        <td><b>${esc(m.sigla || '')}</b> <small>${esc(m.titulo || '')}</small></td>
        <td>${esc(v.unidade || '')}${det ? `<br><small>${esc(det)}</small>` : ''}</td>
        <td class="ce">${resumoTags(k)}${k.sem ? `<br><small>${k.sem} sem resposta</small>` : ''}</td><td class="ce">${pctTag(k.pct)}</td>
        <td><small>${esc(v.tecnico || '')}</small></td>
        <td class="ce"><button class="btn mini" type="button" data-cv-ver="${esc(v.id)}">Ver</button> <button class="btn mini" type="button" data-cv-rel="${esc(v.id)}" title="Relatório completo, com fotos e apontamentos (área Vistorias)">Relatório com fotos</button></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="vazio">${E.regs.length ? 'Nenhum preenchimento neste filtro.' : 'Nenhum checklist de certificação salvo no Vistorias ainda. Toque em "Preencher no Vistorias" num cartão acima.'}</div>`}</div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn" type="button" id="cvXlsx">Excel</button> <button class="btn" type="button" id="cvAtual">Atualizar</button></div>`;

  $('cvFCk').addEventListener('change', e => { f.ck = e.target.value; desenhar(); });
  $('cvFAno').addEventListener('change', e => { f.ano = e.target.value; desenhar(); });
  $('cvFFaz').addEventListener('change', e => { f.faz = e.target.value; desenhar(); });
  tela.querySelectorAll('[data-cv-preencher]').forEach(b => b.addEventListener('click', () => preencherNoVistorias(b.dataset.cvPreencher)));
  tela.querySelectorAll('[data-cv-hist]').forEach(b => b.addEventListener('click', () => { f.ck = b.dataset.cvHist; desenhar(); $('cvHist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  tela.querySelectorAll('[data-cv-ver]').forEach(b => b.addEventListener('click', () => { const v = E.regs.find(x => x.id === b.dataset.cvVer); if (v) apresentar(v); }));
  tela.querySelectorAll('[data-cv-rel]').forEach(b => b.addEventListener('click', () => relatorioNoVistorias(b.dataset.cvRel)));
  $('cvXlsx').addEventListener('click', () => exportar(l));
  $('cvAtual').addEventListener('click', async () => {
    $('cvAtual').disabled = true;
    try { await carregar(); } catch (e) { alert('Não consegui atualizar: ' + (e.message || e)); }
    desenhar();
  });
}

/* ===================================================================
   FOLHA DE APRESENTAÇÃO — o preenchimento como está no Vistorias,
   sem as fotos (essas ficam no "Relatório com fotos")
   =================================================================== */
function apresentar(v) {
  const m = modeloDe(v) || {}, k = conta(v);
  const rotR = { C: 'C', NC: 'NC', NA: 'NA' };
  const cab = camposDe(v).filter(([, x]) => x);
  const blocos = (v.checklist || []).map((b, bi) => `
    <tr class="cv-grupo"><td colspan="4">${bi + 1} · ${esc(b.titulo || '')}</td></tr>
    ${(b.itens || []).map(it => {
      const res = it.tp ? '' : (rotR[it.r] || '—');
      const obs = [it.val ? (it.tp === 'data' ? br(it.val) : it.val) : '', it.obs || '', it.r === 'NC' && it.prazo ? `prazo ${br(it.prazo)}` : '', (it.fotos || []).length ? `📷 ${(it.fotos || []).length}` : '']
        .filter(Boolean).join(' · ');
      return `<tr><td class="cv-cod">${esc(it.cod || `${bi + 1}.${it.n}`)}</td><td>${esc(it.txt || '')}</td>
        <td class="cv-res cv-r-${esc(it.r || 'x')}">${res}</td><td>${esc(obs)}</td></tr>`;
    }).join('')}`).join('');
  const html = `<article class="rel cv-folha">
    <header class="cv-cab"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div><h1>${esc(m.titulo || 'Checklist')}</h1><p>${esc(m.subtitulo || m.ref || '')}</p></div>
      <div class="cv-id"><div>Nº <b>${esc(v.codigo || '—')}</b></div><div>Data: <b>${esc(br(v.data))}</b></div><div>${esc(m.sigla || '')}</div></div></header>
    ${m.ref ? `<p class="cv-ref"><b>Referência:</b> ${esc(m.ref)}</p>` : ''}
    <div class="cv-campos">${cab.map(([r, x]) => `<div><span>${esc(r)}</span><b>${esc(x)}</b></div>`).join('')}</div>
    <div class="cv-resumo">
      <div><span>Itens</span><b>${k.C + k.NC + k.NA + k.sem}</b></div>
      <div class="c"><span>Conformes</span><b>${k.C}</b></div>
      <div class="nc"><span>Não conformes</span><b>${k.NC}</b></div>
      <div><span>Não se aplica</span><b>${k.NA}</b></div>
      <div><span>Conformidade</span><b>${k.pct == null ? '—' : k.pct + '%'}</b></div>
    </div>
    <table class="cv-tab"><colgroup><col style="width:16%"><col><col style="width:9%"><col style="width:28%"></colgroup>
      <thead><tr><th>Item</th><th>Verificação</th><th>Resultado</th><th>Observação / ação</th></tr></thead>
      <tbody>${blocos}</tbody></table>
    ${v.observacoes ? `<p class="cv-obs"><b>Observações:</b> ${esc(v.observacoes)}</p>` : ''}
    <p class="cv-legenda"><b>C</b> = Conforme · <b>NC</b> = Não conforme (vira apontamento com prazo no Vistorias) · <b>NA</b> = Não se aplica.
      Feito por: ${esc(v.tecnico || '—')}${v.cargo ? ' (' + esc(v.cargo) + ')' : ''}. Registro na área Vistorias e Segurança do LOP - Gestão Rápida; fotos no relatório completo.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
  mostrar(html, { barra: true });
}

async function exportar(l) {
  const linhas = [];
  l.forEach(v => {
    const m = modeloDe(v) || {}, det = detalheDe(v);
    (v.checklist || []).forEach(b => (b.itens || []).forEach(it => linhas.push([
      v.data, v.codigo || '', m.sigla || '', m.titulo || '', v.unidade || '', det, b.titulo || '', it.cod || '', it.txt || '',
      it.tp ? '' : (it.r || ''), [it.val, it.obs].filter(Boolean).join(' · '), it.r === 'NC' ? br(it.prazo) : '', v.tecnico || ''])));
  });
  await baixarXlsx(`checklists-certificacao-${hoje()}.xlsx`, [
    { nome: 'Checklists', titulo: 'Checklists de certificação — feitos no Vistorias', subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Nº', larg: 10 }, { rot: 'Sigla', larg: 12 }, { rot: 'Checklist', larg: 30 }, { rot: 'Fazenda', larg: 22 },
        { rot: 'Local / casa', larg: 22 }, { rot: 'Grupo', larg: 24 }, { rot: 'Item', larg: 12 }, { rot: 'Verificação', larg: 50 }, { rot: 'Resultado', larg: 10 },
        { rot: 'Observação', larg: 34 }, { rot: 'Prazo do NC', larg: 12 }, { rot: 'Feito por', larg: 24 }],
      linhas },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_CERT_VIST = ['clVistorias'];
export async function abrirCertVistorias() {
  const alvo = $('telaClVistorias'); if (!alvo) return;
  /* vindo do selo "Certificação · ver histórico" do Vistorias: já filtra o checklist */
  if (window.cvFiltroPedido != null) { E.fl.ck = window.cvFiltroPedido; window.cvFiltroPedido = null; }
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o histórico dos checklists…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o histórico: ${esc(e.message || e)}</div></div>`; return; }
    desenhar();
  } else {
    desenhar();
    if (navigator.onLine) carregar().then(() => { if (!alvo.hidden) desenhar(); }).catch(() => {});
  }
  if (E.fl.ck) setTimeout(() => $('cvHist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}
export function limparCertVistorias() {
  E.carregado = false; E.regs = []; Object.assign(E.fl, { ck: '', ano: '', faz: '' });
  nucleo.apagarCaixa(CAIXA);
}
/** Para a tela CHECKS Digital: quantos preenchimentos de certificação existem no Vistorias */
export const totalCertVistorias = () => E.regs.length;
