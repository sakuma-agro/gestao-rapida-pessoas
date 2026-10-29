// cert-checklist.js — Certificação › Check List Digital (29/10/2026).
//
// Pedido do Guilherme: "igual Forms digital, agora vamos criar Check list
// digitais, aonde tem como pôr foto e deixar registrado". Decisões dele:
//  · a lista de CL foi refeita do zero; o Check List Uso de EPI's virou CL 01
//    e é o modelo — os outros entram um por um (cada um é só um modelo no banco,
//    sem código novo: tela Modelos);
//  · item marcado NC abre uma não conformidade no FORM 004 (cmc_casos, via
//    CHECK LIST), com prazo e responsável, e ela cai no Cronograma;
//  · cada CL preenchido é registro do RG CL nn (Lista mestra; o papel escaneado
//    vai para 5 - RG\RG CL nn).
//
// Telas: Check lists (cartões + preencher), Registros (filtros, abrir, imprimir)
// e Modelos (itens e legenda de cada CL). Tabelas ccl_modelos e ccl_registros
// (supabase/cert-checklist.sql), abertas para 'cert' ou 'sst'.
// Fotos no Drive: certificacao/evidencia/cl-<registro>-<item>/foto.* (uma por
// item) e certificacao/evidencia/cl-<registro>/… (fotos gerais).

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { campoAnexos, fotosDe, urlDoArquivo, listarArquivos } from './arquivos.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const rotMes = am => `${MES[Number(am.slice(5, 7)) - 1]} de ${am.slice(0, 4)}`;

const FAZENDAS = ['FACA', 'LOTE 35 PADAP', 'MORRO BRANCO', 'TRÊS RIACHOS', 'QUEBRA COCÃO'];
const ROT_FAZ = { 'FACA': 'Faz. Faca', 'LOTE 35 PADAP': 'Lote 35 PADAP', 'MORRO BRANCO': 'Faz. Morro Branco', 'TRÊS RIACHOS': 'Faz. Três Riachos', 'QUEBRA COCÃO': 'Faz. Quebra Cocão' };
const ST = ['C', 'NC', 'NA'];
const LEG_PADRAO = { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' };
const ASSIN = { elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Fabio Massao Sakuma' };
const donoItem = (rid, iid) => `cl-${rid}-${iid}`;
const donoGeral = rid => `cl-${rid}`;

/* ---------------- estado ---------------- */
const E = { carregado: false, mods: [], docs: [], reg: [], fl: { doc: '', mes: '', faz: '' } };
const CAIXA = 'checklist.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { mods: E.mods, docs: E.docs, reg: E.reg });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { mods: c0.mods || [], docs: c0.docs || [], reg: c0.reg || [] }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia dos check lists neste aparelho.');
  }
  const [m, d, r] = await Promise.all([
    c.from('ccl_modelos').select('*'),
    c.from('cert_documentos').select('id, codigo, nome, revisao, data_revisao, periodicidade').eq('categoria', 'CHECK LIST'),
    c.from('ccl_registros').select('*').order('data', { ascending: false }),
  ]);
  const erro = m.error || d.error || r.error;
  if (erro && E.carregado) return;
  if (erro) {
    if (/ccl_|relation|does not exist|schema cache/i.test(erro.message || '')) throw new Error('As tabelas do check list digital ainda não foram criadas no banco (supabase/cert-checklist.sql).');
    throw erro;
  }
  E.mods = m.data || []; E.docs = (d.data || []).sort(porCodigo); E.reg = r.data || [];
  E.carregado = true;
  salvarCaixa();
}

/* ---------------- contas ---------------- */
const porCodigo = (a, b) => so(a.codigo).localeCompare(so(b.codigo), 'pt-BR', { numeric: true });
const docDe = id => E.docs.find(x => String(x.id) === String(id)) || null;
const modDe = id => E.mods.find(x => String(x.documento_id) === String(id)) || null;
const codDe = id => docDe(id)?.codigo || 'CL';
const tituloDe = id => modDe(id)?.titulo || docDe(id)?.nome || 'Check list';
const legDe = id => ({ ...LEG_PADRAO, ...(modDe(id)?.legenda || {}) });
const conta = r => { const o = { C: 0, NC: 0, NA: 0, vazio: 0 }; (r.respostas || []).forEach(x => { o[ST.includes(x.st) ? x.st : 'vazio']++; }); return o; };
const regsDo = id => E.reg.filter(r => String(r.documento_id) === String(id));
const funcs = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

/* ---------------- peças ---------------- */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
function dialogo(html, ligar) {
  let d = $('dlgCl');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCl'; d.className = 'rs-largo cl-dlg'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgCl')?.open && $('dlgCl').close();
const erroDlg = t => { const e = $('clErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgCl')) $('dlgCl').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
const resumoTags = r => { const k = conta(r); return `${k.C ? tag(k.C + ' C', 'ativo') : ''} ${k.NC ? tag(k.NC + ' NC', 'perigo') : ''} ${k.NA ? tag(k.NA + ' NA', 'neutra') : ''}`; };

/* ===================================================================
   TELA · CHECK LISTS
   =================================================================== */
function desenharLista() {
  const tela = $('telaClLista');
  const am = hoje().slice(0, 7);
  const comMod = E.docs.filter(d => modDe(d.id));
  const semMod = E.docs.filter(d => !modDe(d.id));
  const cartao = d => {
    const l = regsDo(d.id), ult = l[0], mes = l.filter(r => r.data.startsWith(am));
    const ncs = mes.reduce((s, r) => s + conta(r).NC, 0);
    return `<div class="cl-card">
      <div class="cl-card-topo"><span class="cl-cod">${esc(d.codigo)}</span><b>${esc(tituloDe(d.id))}</b></div>
      <div class="cl-card-num"><div><strong>${mes.length}</strong><span>neste mês</span></div><div><strong>${l.length}</strong><span>no total</span></div>
        <div class="${ncs ? 'cl-ruim' : ''}"><strong>${ncs}</strong><span>NC no mês</span></div></div>
      <p class="dica" style="margin:6px 0 10px">${ult ? `Último: ${br(ult.data)}${ult.fazenda ? ' · ' + esc(ROT_FAZ[ult.fazenda] || ult.fazenda) : ''}${ult.avaliado ? ' · ' + esc(ult.avaliado) : ''}` : 'Nenhum preenchido ainda.'} · ${esc(d.periodicidade || '')}</p>
      <div class="barra" style="margin:0"><button class="btn principal" type="button" data-preencher="${esc(d.id)}">Preencher</button>
        <button class="btn" type="button" data-regs="${esc(d.id)}">Registros</button>
        <button class="btn" type="button" data-branco="${esc(d.id)}">Em branco</button></div></div>`;
  };
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('CHECKS Digital', 'Preencha no celular: marque C, NC ou NA em cada item, tire foto e grave. Item NC abre uma não conformidade no FORM 004. Cada preenchimento conta como registro do RG CL.')}
    ${comMod.length ? `<div class="cl-cards">${comMod.map(cartao).join('')}</div>` : '<div class="vazio" style="margin-top:12px">Nenhum check list digital ainda. Crie em <b>Modelos</b>.</div>'}
    ${semMod.length ? `<div class="qp-bloco"><h3>CL da Lista mestra ainda sem versão digital</h3>
      ${semMod.map(d => `<div class="barra entre" style="margin:4px 0"><span><b>${esc(d.codigo)}</b> ${esc(d.nome)}</span><button class="btn mini" type="button" data-criar="${esc(d.id)}">Criar versão digital</button></div>`).join('')}</div>` : ''}
  </div>`;
  tela.querySelectorAll('[data-preencher]').forEach(b => b.addEventListener('click', () => formRegistro(null, b.dataset.preencher)));
  tela.querySelectorAll('[data-regs]').forEach(b => b.addEventListener('click', () => { E.fl.doc = b.dataset.regs; abrirModulo('cert', 'clRegistros'); }));
  tela.querySelectorAll('[data-branco]').forEach(b => b.addEventListener('click', () => imprimir(null, b.dataset.branco)));
  tela.querySelectorAll('[data-criar]').forEach(b => b.addEventListener('click', () => formModelo(b.dataset.criar)));
}

/* ===================================================================
   TELA · REGISTROS
   =================================================================== */
function desenharRegistros() {
  const tela = $('telaClRegistros');
  const f = E.fl;
  const meses = [...new Set(E.reg.map(r => r.data.slice(0, 7)))].sort().reverse();
  const l = E.reg.filter(r => (!f.doc || String(r.documento_id) === String(f.doc)) && (!f.mes || r.data.startsWith(f.mes)) && (!f.faz || r.fazenda === f.faz));
  const k = l.reduce((s, r) => { const c = conta(r); s.NC += c.NC; s.abertas += (r.respostas || []).filter(x => x.st === 'NC' && x.nc_id).length; return s; }, { NC: 0, abertas: 0 });
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Registros dos check lists', 'Cada check list preenchido no app. Toque em Abrir para ver as fotos, corrigir ou imprimir.', '<button class="btn principal" type="button" id="clNovo">Preencher</button>')}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Check list <select id="clFDoc">${opcoes(E.docs.filter(d => modDe(d.id)).map(d => [d.id, `${d.codigo} · ${tituloDe(d.id)}`]), f.doc, 'Todos')}</select></label>
      <label class="campo">Mês <select id="clFMes">${opcoes(meses.map(m => [m, rotMes(m)]), f.mes, 'Todos')}</select></label>
      <label class="campo">Fazenda <select id="clFFaz">${opcoes(FAZENDAS.map(x => [x, ROT_FAZ[x]]), f.faz, 'Todas')}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      <div class="pv-card pv-calma"><span>Preenchidos</span><strong>${l.length}</strong><small>no filtro</small></div>
      <div class="pv-card ${k.NC ? 'pv-perigo' : 'pv-calma'}"><span>Itens NC</span><strong>${k.NC}</strong><small>${k.abertas} com não conformidade aberta no FORM 004</small></div>
    </div>
    <div class="qp-bloco">${l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>Check list</th><th>Fazenda</th><th>Avaliado</th><th>Atividade / local</th><th class="ce">Resultado</th><th>Feito por</th><th></th></tr></thead><tbody>
      ${l.map(r => `<tr><td class="ce">${br(r.data)}</td><td><b>${esc(codDe(r.documento_id))}</b> <small>${esc(tituloDe(r.documento_id))}</small></td>
        <td>${esc(ROT_FAZ[r.fazenda] || r.fazenda || '')}</td><td>${esc(r.avaliado || '')}</td><td><small>${esc([r.atividade, r.local].filter(Boolean).join(' · '))}</small></td>
        <td class="ce">${resumoTags(r)}</td><td><small>${esc(r.responsavel || '')}</small></td>
        <td class="ce"><button class="btn mini" type="button" data-ab="${esc(r.id)}">Abrir</button> <button class="btn mini" type="button" data-imp="${esc(r.id)}">Imprimir</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum check list preenchido neste filtro.</div>'}</div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn" type="button" id="clXlsx">Excel</button></div>`;
  $('clFDoc').addEventListener('change', e => { f.doc = e.target.value; desenharRegistros(); });
  $('clFMes').addEventListener('change', e => { f.mes = e.target.value; desenharRegistros(); });
  $('clFFaz').addEventListener('change', e => { f.faz = e.target.value; desenharRegistros(); });
  $('clNovo').addEventListener('click', () => {
    const ids = E.docs.filter(d => modDe(d.id)).map(d => d.id);
    const alvo = f.doc || (ids.length === 1 ? ids[0] : '');
    if (alvo) formRegistro(null, alvo); else abrirModulo('cert', 'clLista');
  });
  tela.querySelectorAll('[data-ab]').forEach(b => b.addEventListener('click', () => { const r = E.reg.find(x => x.id === b.dataset.ab); if (r) formRegistro(r, r.documento_id); }));
  tela.querySelectorAll('[data-imp]').forEach(b => b.addEventListener('click', () => { const r = E.reg.find(x => x.id === b.dataset.imp); if (r) imprimir(r, r.documento_id); }));
  $('clXlsx').addEventListener('click', () => exportar(l));
}

/* ===================================================================
   PREENCHER / ABRIR UM CHECK LIST
   =================================================================== */
function formRegistro(r, docId) {
  const mod = modDe(docId);
  if (!mod) return alert('Este check list ainda não tem versão digital.');
  const leg = legDe(docId);
  const rid = r?.id || novoId();
  const resp = new Map((r?.respostas || []).map(x => [x.id, x]));
  const itens = (mod.itens || []).map(it => ({ ...it, ...(resp.get(it.id) || {}), id: it.id, texto: it.texto }));
  // itens que saíram do modelo mas foram respondidos continuam no registro
  (r?.respostas || []).forEach(x => { if (!itens.some(i => i.id === x.id)) itens.push({ ...x }); });
  const v = r || { data: hoje(), fazenda: '', local: '', atividade: '', cultura: '', variedade: '', avaliado: '', responsavel: estado.sessao?.user?.user_metadata?.nome || '', plano_acao: '', observacao: '' };
  const fs = funcs();
  const linha = it => `<div class="cl-it" data-it="${esc(it.id)}">
    <div class="cl-it-topo"><span class="cl-it-txt">${esc(it.texto)}</span>
      <div class="cl-st" role="group">${ST.map(s => `<button type="button" class="cl-b cl-b-${s.toLowerCase()} ${it.st === s ? 'on' : ''}" data-st="${s}" title="${esc(leg[s])}">${s}</button>`).join('')}</div></div>
    <div class="cl-it-mais">
      <input type="text" data-obs placeholder="Observação" value="${esc(it.obs || '')}">
      <button type="button" class="btn mini" data-foto>📷 Foto</button>
    </div>
    <div class="cl-it-nc" ${it.st === 'NC' ? '' : 'hidden'}>
      ${it.nc_id ? `<span class="dica">Não conformidade aberta no FORM 004.</span>` : `<span class="dica">Ao gravar, abre uma não conformidade no FORM 004:</span>`}
      <label class="campo">Prazo <input type="date" data-prazo value="${esc(it.prazo || '')}" ${it.nc_id ? 'disabled' : ''}></label>
      <label class="campo">Responsável <input type="text" data-respnc value="${esc(it.resp_nc || '')}" ${it.nc_id ? 'disabled' : ''}></label>
    </div>
    <div class="cl-it-foto" hidden></div></div>`;
  dialogo(`<h3>${esc(codDe(docId))} · ${esc(tituloDe(docId))} <small class="dica">${r ? 'registro de ' + br(r.data) : 'novo preenchimento'}</small></h3>
    <div class="aviso erro" id="clErro" hidden></div>
    <div class="grade">
      <label class="campo">Fazenda <select id="clFaz">${opcoes(FAZENDAS.map(x => [x, ROT_FAZ[x]]), v.fazenda, 'Escolha')}</select></label>
      <label class="campo">Data <input type="date" id="clData" value="${esc(v.data)}" max="${hoje()}"></label>
      <label class="campo">Local <input type="text" id="clLocal" value="${esc(v.local || '')}"></label>
      <label class="campo">Atividade <input type="text" id="clAtv" value="${esc(v.atividade || '')}"></label>
      <label class="campo">Cultura <input type="text" id="clCult" value="${esc(v.cultura || '')}"></label>
      <label class="campo">Variedade <input type="text" id="clVar" value="${esc(v.variedade || '')}"></label>
      <label class="campo">Funcionário / equipe avaliada <input type="text" id="clAval" list="clFuncs" value="${esc(v.avaliado || '')}"></label>
      <label class="campo">Feito por <input type="text" id="clResp" list="clFuncs" value="${esc(v.responsavel || '')}"></label>
    </div>
    <datalist id="clFuncs">${fs.map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist>
    <div class="barra entre" style="margin:12px 0 4px"><b>Itens</b>
      <div class="barra" style="margin:0"><button class="btn mini" type="button" id="clTodosC">Vazios = C</button><button class="btn mini" type="button" id="clTodosNA">Vazios = NA</button></div></div>
    <div class="cl-itens">${itens.map(linha).join('')}</div>
    <p class="dica cl-leg"><b>C</b> = ${esc(leg.C)} · <b>NC</b> = ${esc(leg.NC)} · <b>NA</b> = ${esc(leg.NA)}</p>
    <label class="campo">Plano de ação de não conformidades <textarea id="clPlano" rows="3">${esc(v.plano_acao || '')}</textarea></label>
    <label class="campo">Observação geral <input type="text" id="clObs" value="${esc(v.observacao || '')}"></label>
    <div class="qp-bloco"><div id="clFotosGerais"></div></div>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="clApagar">Apagar</button> <button class="btn" type="button" id="clImpDlg">Imprimir</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="clOk">Gravar</button></div></div>`, d => {
    const campos = new Map();
    const abrirFoto = (box, iid) => {
      const alvo = box.querySelector('.cl-it-foto'); alvo.hidden = false;
      if (campos.has(iid)) return;
      const c = campoAnexos(alvo, { area: 'certificacao', tipo: 'evidencia', rotulo: 'Foto do item', dica: 'tire ou escolha a foto', foto: true });
      c.abrir(r ? donoItem(rid, iid) : null); campos.set(iid, c);
    };
    d.querySelectorAll('.cl-it').forEach(box => {
      const iid = box.dataset.it;
      box.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
        const ja = b.classList.contains('on');
        box.querySelectorAll('[data-st]').forEach(x => x.classList.remove('on'));
        if (!ja) b.classList.add('on');
        const nc = !ja && b.dataset.st === 'NC';
        box.querySelector('.cl-it-nc').hidden = !nc;
        if (nc) abrirFoto(box, iid);
      }));
      box.querySelector('[data-foto]').addEventListener('click', () => abrirFoto(box, iid));
    });
    // registro já gravado: mostra as fotos que ele tem
    if (r) fotosDe('certificacao', 'evidencia', itens.map(it => donoItem(rid, it.id))).then(m => {
      d.querySelectorAll('.cl-it').forEach(box => { if (m.has(donoItem(rid, box.dataset.it))) { abrirFoto(box, box.dataset.it); box.querySelector('[data-foto]').textContent = '📷 Foto ✓'; } });
    }).catch(() => {});
    const gerais = campoAnexos($('clFotosGerais'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Fotos gerais / check list em papel', dica: 'fotos do local, da equipe ou do papel assinado' });
    gerais.abrir(r ? donoGeral(rid) : null);
    const vazios = st => d.querySelectorAll('.cl-it').forEach(box => { if (!box.querySelector('[data-st].on')) box.querySelector(`[data-st="${st}"]`).classList.add('on'); });
    $('clTodosC').addEventListener('click', () => vazios('C'));
    $('clTodosNA').addEventListener('click', () => vazios('NA'));
    $('clImpDlg')?.addEventListener('click', () => { fechar(); imprimir(r, docId); });
    $('clApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar este check list? As não conformidades abertas no FORM 004 continuam lá.') || precisaRede()) return;
      const { error } = await estado.cliente.from('ccl_registros').delete().eq('id', r.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      E.reg = E.reg.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
    $('clOk').addEventListener('click', async () => {
      const respostas = [...d.querySelectorAll('.cl-it')].map(box => {
        const ant = itens.find(i => i.id === box.dataset.it) || {};
        return { id: box.dataset.it, texto: ant.texto, st: box.querySelector('[data-st].on')?.dataset.st || null,
          obs: so(box.querySelector('[data-obs]').value) || null, nc_id: ant.nc_id || null,
          prazo: box.querySelector('[data-prazo]').value || null, resp_nc: so(box.querySelector('[data-respnc]').value) || null };
      });
      const l = { data: $('clData').value, fazenda: $('clFaz').value || null, local: so($('clLocal').value) || null, atividade: so($('clAtv').value) || null,
        cultura: so($('clCult').value) || null, variedade: so($('clVar').value) || null, avaliado: so($('clAval').value) || null,
        responsavel: so($('clResp').value) || null, plano_acao: so($('clPlano').value) || null, observacao: so($('clObs').value) || null };
      const fAval = fs.find(f => f.nome === l.avaliado); l.avaliado_id = fAval ? fAval.id : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return erroDlg('Informe a data do check list.');
      if (l.data > hoje()) return erroDlg('O check list se lança no dia em que foi feito — não no futuro.');
      if (!l.fazenda) return erroDlg('Escolha a fazenda.');
      if (!respostas.some(x => x.st)) return erroDlg('Marque pelo menos um item (C, NC ou NA).');
      if (precisaRede()) return;
      $('clOk').disabled = true;
      const t = estado.cliente.from('ccl_registros');
      // não conformidades novas no FORM 004
      const cl = estado.cliente;
      for (const x of respostas.filter(y => y.st === 'NC' && !y.nc_id)) {
        const titulo = `${codDe(docId)} · ${x.texto}${l.avaliado ? ' — ' + l.avaliado : ''}`;
        const { data: caso, error } = await cl.from('cmc_casos').insert({
          natureza: 'NC', tipo: 'NÃO CONFORMIDADE', titulo: titulo.length > 120 ? titulo.slice(0, 117) + '…' : titulo,
          descricao: `Check list ${codDe(docId)} (${tituloDe(docId)}) de ${br(l.data)}: item "${x.texto}" não conforme.${x.obs ? ' Observação: ' + x.obs : ''}${l.atividade ? ' Atividade: ' + l.atividade + '.' : ''}${l.plano_acao ? ' Plano de ação: ' + l.plano_acao : ''}`,
          via: 'CHECK LIST', local: l.local, fazenda: l.fazenda, solicitante: l.responsavel, responsavel: x.resp_nc, prioridade: 'MÉDIA',
          data_abertura: l.data, etapa: 'ABERTA', previsao: x.prazo, origem_externa: `cl:${rid}:${x.id}`,
        }).select('id').single();
        if (error) { $('clOk').disabled = false; return erroDlg('Não consegui abrir a não conformidade do item "' + esc(x.texto) + '": ' + esc(error.message)); }
        x.nc_id = caso.id;
        const it0 = itens.find(i => i.id === x.id); if (it0) it0.nc_id = caso.id;   // se a gravação falhar, não abre de novo
      }
      const { data, error } = r ? await t.update({ ...l, respostas, atualizado_por: quem() }).eq('id', rid).select().single()
        : await t.insert({ id: rid, documento_id: Number(docId), ...l, respostas, criado_por: quem() }).select().single();
      if (error) { $('clOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      for (const [iid, c] of campos) if (c.mudou) await c.salvar(donoItem(rid, iid));
      if (gerais.mudou) await gerais.salvar(donoGeral(rid));
      const i = E.reg.findIndex(x => x.id === data.id); if (i >= 0) E.reg[i] = data; else E.reg.unshift(data);
      E.reg.sort((a, b) => b.data.localeCompare(a.data)); salvarCaixa(); fechar(); redesenhar();
      const novas = respostas.filter(y => y.st === 'NC').length;
      if (!r && novas) alert(`${novas} item(ns) NC: as não conformidades foram abertas no FORM 004 (FORMS Digital › Não conformidades).`);
    });
  });
}

/* ===================================================================
   TELA · MODELOS — itens e legenda de cada CL
   =================================================================== */
function desenharModelos() {
  const tela = $('telaClModelos');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Modelos dos check lists', 'Os itens de cada CL. Para passar um CL novo para o digital, cadastre o CL na Lista mestra e crie a versão digital aqui.')}
    <div class="qp-bloco">${E.docs.length ? `<table class="dc-planilha"><thead><tr><th>Código</th><th>Nome</th><th class="ce">Itens</th><th class="ce">Revisão</th><th></th></tr></thead><tbody>
      ${E.docs.map(d => { const m = modDe(d.id); return `<tr><td><b>${esc(d.codigo)}</b></td><td>${esc(m?.titulo || d.nome)}</td><td class="ce">${m ? (m.itens || []).length : '—'}</td>
        <td class="ce">${esc(d.revisao || '—')}${d.data_revisao ? ' · ' + br(d.data_revisao) : ''}</td>
        <td class="ce"><button class="btn mini" type="button" data-mod="${esc(d.id)}">${m ? 'Editar itens' : 'Criar versão digital'}</button></td></tr>`; }).join('')}
      </tbody></table>` : '<div class="vazio">Nenhum CL na Lista mestra.</div>'}</div></div>`;
  tela.querySelectorAll('[data-mod]').forEach(b => b.addEventListener('click', () => formModelo(b.dataset.mod)));
}
function formModelo(docId) {
  const d = docDe(docId), m = modDe(docId);
  const leg = legDe(docId);
  dialogo(`<h3>${esc(d?.codigo || 'CL')} · versão digital</h3>
    <div class="aviso erro" id="clErro" hidden></div>
    <label class="campo">Título no check list <input type="text" id="cmTit" value="${esc(m?.titulo || so(d?.nome).replace(/^check\s*list\s*/i, ''))}"></label>
    <label class="campo">Itens — um por linha <textarea id="cmItens" rows="14">${esc((m?.itens || []).map(x => x.texto).join('\n'))}</textarea></label>
    <div class="grade">
      <label class="campo">Legenda C <input type="text" id="cmC" value="${esc(leg.C)}"></label>
      <label class="campo">Legenda NC <input type="text" id="cmNC" value="${esc(leg.NC)}"></label>
      <label class="campo">Legenda NA <input type="text" id="cmNA" value="${esc(leg.NA)}"></label>
    </div>
    <p class="dica">Os registros já gravados guardam os itens como estavam: mudar o modelo não altera o que já foi preenchido.</p>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="cmOk">Salvar</button></div>`, () => {
    $('cmOk').addEventListener('click', async () => {
      const textos = $('cmItens').value.split('\n').map(so).filter(Boolean);
      if (!textos.length) return erroDlg('Escreva pelo menos um item.');
      const ant = m?.itens || [];
      let n = ant.reduce((x, i) => Math.max(x, Number(String(i.id).replace(/\D/g, '')) || 0), 0);
      const itens = textos.map(t => ant.find(i => i.texto === t) || { id: 'i' + doisD(++n), texto: t });
      const linha = { documento_id: Number(docId), titulo: so($('cmTit').value) || d?.nome || 'Check list', itens,
        legenda: { C: so($('cmC').value) || LEG_PADRAO.C, NC: so($('cmNC').value) || LEG_PADRAO.NC, NA: so($('cmNA').value) || LEG_PADRAO.NA },
        campos: m?.campos || ['fazenda', 'data', 'local', 'atividade', 'cultura', 'variedade', 'avaliado', 'responsavel'] };
      if (precisaRede()) return;
      $('cmOk').disabled = true;
      const { data, error } = await estado.cliente.from('ccl_modelos').upsert({ ...linha, atualizado_por: quem() }).select().single();
      if (error) { $('cmOk').disabled = false; return erroDlg('Não consegui salvar: ' + esc(error.message)); }
      const i = E.mods.findIndex(x => String(x.documento_id) === String(docId)); if (i >= 0) E.mods[i] = data; else E.mods.push(data);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   IMPRESSO — A4 em pé, como o papel (com as fotos no fim)
   =================================================================== */
async function imprimir(r, docId) {
  const mod = modDe(docId), d = docDe(docId);
  if (!mod) return;
  const leg = legDe(docId);
  const itens = r ? (r.respostas || []) : (mod.itens || []).map(x => ({ ...x }));
  let fotos = [];
  if (r && navigator.onLine) {
    try {
      const mapa = await fotosDe('certificacao', 'evidencia', itens.map(x => donoItem(r.id, x.id)));
      for (const x of itens) { const ch = mapa.get(donoItem(r.id, x.id)); if (ch) fotos.push({ rot: x.texto, st: x.st, url: await urlDoArquivo(ch) }); }
      const ger = await listarArquivos('certificacao', 'evidencia', donoGeral(r.id)).catch(() => []);
      for (const g of ger) if (/^image\//.test(g.mime || '') || /\.(jpe?g|png|webp)$/i.test(g.nome || '')) fotos.push({ rot: 'Foto geral', url: await urlDoArquivo(g.chave) });
    } catch { /* sem as fotos, imprime o resto */ }
  }
  const x = s => s ? '<b>X</b>' : '';
  const faz = FAZENDAS.map(f => `<span class="cl-fz">(${r?.fazenda === f ? 'X' : '&nbsp;&nbsp;'}) ${esc(ROT_FAZ[f])}</span>`).join('');
  const linhasVazias = Math.max(0, 22 - itens.length);
  const html = `<article class="rel cl-folha">
    <header class="cl-cab"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <h1>Check List<br>${esc(mod.titulo)}</h1>
      <div class="cl-id"><div>Identificação: <b>${esc(d?.codigo || '')}</b></div><div>Revisão: ${esc(d?.revisao || '00')}</div><div>Página: 1</div>
        <div>Elaborado por: ${ASSIN.elaborador}</div><div>Aprovado por: ${ASSIN.aprovador}</div><div>Data: ${esc(br(d?.data_revisao) || '')}</div></div></header>
    <div class="cl-linha"><b>FAZENDA:</b> ${faz}</div>
    <div class="cl-dupla"><div><b>DATA:</b> ${esc(br(r?.data))}</div><div><b>LOCAL:</b> ${esc(r?.local || '')}</div></div>
    <div class="cl-linha"><b>ATIVIDADE:</b> ${esc(r?.atividade || '')}</div>
    <div class="cl-dupla"><div><b>CULTURA:</b> ${esc(r?.cultura || '')}</div><div><b>RESPONSÁVEL:</b> ${esc(r?.avaliado || '')}</div></div>
    <div class="cl-dupla"><div><b>VARIEDADE:</b> ${esc(r?.variedade || '')}</div><div><b>ASSINATURA:</b> ${esc(r?.responsavel || '')}</div></div>
    <table class="cl-imp"><colgroup><col class="c-it"><col class="c-st"><col class="c-st"><col class="c-st"><col class="c-obs"></colgroup>
      <thead><tr><th>${esc(mod.titulo.toUpperCase())}</th><th>C</th><th>NC</th><th>NA</th><th>OBS</th></tr></thead>
      <tbody>${itens.map(i => `<tr><td class="cl-t">${esc(i.texto)}</td><td>${x(i.st === 'C')}</td><td class="cl-nc">${x(i.st === 'NC')}</td><td>${x(i.st === 'NA')}</td>
        <td class="cl-o">${esc(i.obs || '')}${i.st === 'NC' && i.nc_id ? ' <small>(NC aberta no FORM 004)</small>' : ''}</td></tr>`).join('')}
        ${Array.from({ length: r ? 0 : linhasVazias }, () => '<tr><td class="cl-t"></td><td></td><td></td><td></td><td></td></tr>').join('')}</tbody></table>
    <div class="cl-plano"><b>Plano de ação de não conformidades:</b> ${esc(r?.plano_acao || '')}${r?.observacao ? `<br><b>Observação:</b> ${esc(r.observacao)}` : ''}</div>
    <p class="cl-legenda"><b>C</b> = ${esc(leg.C)}<br><b>NC</b> = ${esc(leg.NC)}<br><b>NA</b> = ${esc(leg.NA)}</p>
    ${fotos.length ? `<div class="cl-fotos">${fotos.map(f => `<figure><img src="${esc(f.url)}" alt=""><figcaption>${esc(f.rot)}${f.st ? ' · ' + esc(f.st) : ''}</figcaption></figure>`).join('')}</div>` : ''}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
  mostrar(html, { barra: true });
}

async function exportar(l) {
  const linhas = [];
  l.forEach(r => (r.respostas || []).forEach(x => linhas.push([r.data, codDe(r.documento_id), ROT_FAZ[r.fazenda] || r.fazenda || '', r.avaliado || '', r.atividade || '', r.local || '', x.texto, x.st || '', x.obs || '', x.nc_id ? 'Sim' : '', r.responsavel || ''])));
  await baixarXlsx(`check-lists-${hoje()}.xlsx`, [
    { nome: 'Check lists', titulo: 'CHECKS Digital — itens respondidos', subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'CL', larg: 8 }, { rot: 'Fazenda', larg: 18 }, { rot: 'Avaliado', larg: 28 }, { rot: 'Atividade', larg: 20 },
        { rot: 'Local', larg: 18 }, { rot: 'Item', larg: 36 }, { rot: 'Resultado', larg: 10 }, { rot: 'Observação', larg: 34 }, { rot: 'NC aberta', larg: 10 }, { rot: 'Feito por', larg: 24 }],
      linhas },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_CHECKLIST = ['clLista', 'clRegistros', 'clModelos'];
const DESENHO = { clLista: desenharLista, clRegistros: desenharRegistros, clModelos: desenharModelos };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirChecklist(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando os check lists…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir os check lists: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgCl')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparChecklist() {
  E.carregado = false; E.mods = []; E.docs = []; E.reg = [];
  Object.assign(E.fl, { doc: '', mes: '', faz: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cl = { E, imprimir };
