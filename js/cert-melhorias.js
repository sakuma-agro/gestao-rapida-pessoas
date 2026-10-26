// cert-melhorias.js — Certificação › Melhoria contínua: registro (FORM 020 / FORM 042), 26/10/2026.
//
// Pedido do Guilherme, com a planilha "FORMAGR-42A - Gestão de Anomalias e
// Feedbacks": "ignore somente das manutenções de máquinas, vamos fazer sobre
// melhorias contínuas, registro". Fica a aba "Registro Checklist" da planilha
// sem as manutenções (que moram em Máquinas e Patrimônio): melhorias, não
// conformidades, reclamações, sugestões e elogios — abertura (data, via, tipo,
// local, fazenda, solicitante, descrição/causa raiz, prioridade, previsão) e
// resolução (responsável, descrição, data de fechamento, evidências).
// Prazo: previsão digitada ou, sem ela, abertura + 10 dias (o "DEFINIR PRAZO
// (DIAS) 10" da planilha). Em aberto depois da previsão = ATRASADO.
// Tabela cmc_registros (supabase/cert-melhorias.sql), trancada por app_pode('cert').
// Evidências: links (OneDrive) e arquivos no Drive em certificacao/evidencia/mc-<id>
// (abertura) e mcr-<id> (resolução). Sem internet: só consulta.

import { estado } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { campoAnexos, donosComArquivo } from './arquivos.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const doisD = n => String(n).padStart(2, '0');
const isoD = d => `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`;
const hoje = () => isoD(new Date());
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const semAc = s => so(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const maisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoD(d); };
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = am => `${MES3[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;

const FORM = { codigo: 'FORM 020', titulo: 'Melhorias contínuas', data: '01/12/2026', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
const TIPOS = ['MELHORIA', 'NÃO CONFORMIDADE', 'RECLAMAÇÃO', 'SUGESTÃO', 'ELOGIO'];
const VIAS = ['AUDITORIA INTERNA', 'AUDITORIA EXTERNA', 'QUADRO', 'WHATSAPP', 'DIGITAL', 'VIA PAPEL', 'CHECK LIST'];
const FAZENDAS = ['FACA', 'LOTE 35 PADAP', 'MORRO BRANCO', 'TRÊS RIACHOS', 'QUEBRA COCÃO'];
const PRIORIDADES = ['URGENTE', 'ALTA', 'MÉDIA', 'BAIXA'];
const PRAZO_PADRAO = 10;
const COR_TIPO = { 'MELHORIA': 'ativo', 'NÃO CONFORMIDADE': 'perigo', 'RECLAMAÇÃO': 'alerta', 'SUGESTÃO': 'neutra', 'ELOGIO': 'ativo' };

/* ---------------- estado ---------------- */
const M = { carregado: false, regs: [], arq: new Set(), f: { status: 'EM ABERTO', tipo: '', faz: '', ano: '', q: '' } };
const CAIXA = 'melhorias.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { regs: M.regs });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !M.carregado) { M.regs = c0.regs || []; M.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (M.carregado) return;
    throw new Error('Sem internet e sem cópia do registro de melhorias neste aparelho.');
  }
  const r = await c.from('cmc_registros').select('*').order('data_abertura', { ascending: false });
  if (r.error) {
    if (M.carregado) return;
    if (/cmc_|relation|does not exist|schema cache/i.test(r.error.message || '')) throw new Error('A tabela do registro de melhorias ainda não foi criada no banco (supabase/cert-melhorias.sql).');
    throw r.error;
  }
  M.regs = r.data || []; M.carregado = true; salvarCaixa();
  M.arq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}

/* ---------------- contas ---------------- */
const aberto = r => r.status !== 'FINALIZADO';
const previsaoDe = r => r.previsao || (r.data_abertura ? maisDias(r.data_abertura, PRAZO_PADRAO) : null);
function prazo(r) {
  const p = previsaoDe(r);
  if (aberto(r)) return !p ? { rot: '—', cor: 'neutra' } : hoje() > p ? { rot: `Atrasado ${dias(p, hoje())} d`, cor: 'perigo', atrasado: true } : { rot: `No prazo · faltam ${dias(hoje(), p)} d`, cor: 'ativo' };
  return p && r.data_fechamento && r.data_fechamento > p ? { rot: 'Fechado com atraso', cor: 'alerta' } : { rot: 'OK', cor: 'ativo' };
}
const anos = () => [...new Set(M.regs.map(r => String(r.data_abertura || '').slice(0, 4)).filter(Boolean))].sort().reverse();

/* ---------------- peças ---------------- */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => `<option value="${esc(o)}" ${String(o) === String(val ?? '') ? 'selected' : ''}>${esc(o)}</option>`).join('');
const link = (u, rot) => u ? `<a class="ce-link" href="${esc(u)}" target="_blank" rel="noopener">${rot}</a>` : '';
const evid = r => [link(r.evid_url, 'abertura'), link(r.evid_resolucao_url, 'resolução'), M.arq.has('mc-' + r.id) || M.arq.has('mcr-' + r.id) ? '📎' : ''].filter(Boolean).join(' · ') || '—';
function dialogo(html, ligar) {
  let d = $('dlgMc');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgMc'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgMc')?.open && $('dlgMc').close();
const erroDlg = t => { const e = $('mcErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgMc')) $('dlgMc').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaMcPainel');
  const ab = M.regs.filter(aberto), atr = ab.filter(r => prazo(r).atrasado);
  const ano = hoje().slice(0, 4);
  const finAno = M.regs.filter(r => !aberto(r) && String(r.data_fechamento || '').startsWith(ano));
  const fechados = M.regs.filter(r => !aberto(r) && r.data_fechamento && r.data_abertura);
  const media = fechados.length ? Math.round(fechados.reduce((s, r) => s + dias(r.data_abertura, r.data_fechamento), 0) / fechados.length) : null;
  const porTipo = TIPOS.map(t => ({ t, ab: ab.filter(r => r.tipo === t).length, fin: M.regs.filter(r => r.tipo === t && !aberto(r)).length })).filter(x => x.ab + x.fin);
  const meses = []; { const d = new Date(); d.setDate(1); for (let i = 11; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); meses.push(isoD(x).slice(0, 7)); } }
  const porMes = meses.map(m => ({ m, ab: M.regs.filter(r => String(r.data_abertura || '').startsWith(m)).length, fin: M.regs.filter(r => String(r.data_fechamento || '').startsWith(m)).length }));
  const max = Math.max(1, ...porMes.map(x => Math.max(x.ab, x.fin)));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Melhoria contínua</h2>
      <p class="dica" style="margin:2px 0 0">${FORM.codigo} · melhorias, não conformidades, reclamações, sugestões e elogios — da abertura à resolução.</p></div>
      <button class="btn principal" type="button" id="mcNovoP">+ Novo registro</button></div>
    <div class="pv-cards" style="margin-top:12px">
      <button type="button" class="pv-card pv-alerta" data-ver="EM ABERTO"><span>Em aberto</span><strong>${ab.length}</strong><small>aguardando resolução</small></button>
      <button type="button" class="pv-card pv-perigo" data-ver="ATRASADO"><span>Atrasados</span><strong>${atr.length}</strong><small>passaram da previsão</small></button>
      <button type="button" class="pv-card pv-ok" data-ver="FINALIZADO"><span>Finalizados em ${ano}</span><strong>${finAno.length}</strong><small>${M.regs.filter(r => !aberto(r)).length} no total</small></button>
      <div class="pv-card pv-calma"><span>Tempo médio para fechar</span><strong>${media != null ? media + ' d' : '—'}</strong><small>da abertura ao fechamento</small></div>
    </div>
    <h3 class="bm-h3">Em aberto</h3>
    ${ab.length ? tabela(ab.slice().sort((a, b) => String(previsaoDe(a)).localeCompare(String(previsaoDe(b)))), true, true) : '<p class="dica">Nada em aberto.</p>'}
    <div class="mc-duas">
      <div><h3 class="bm-h3">Por tipo</h3>
        <table class="dc-planilha bm-tab"><thead><tr><th>Tipo</th><th class="ce">Em aberto</th><th class="ce">Finalizados</th><th class="ce">Total</th></tr></thead><tbody>
        ${porTipo.map(x => `<tr><td>${tag(x.t, COR_TIPO[x.t] || 'neutra')}</td><td class="ce">${x.ab}</td><td class="ce">${x.fin}</td><td class="ce">${x.ab + x.fin}</td></tr>`).join('') || '<tr><td colspan="4">Sem registros.</td></tr>'}
        </tbody></table></div>
      <div><h3 class="bm-h3">Abertos × finalizados — últimos 12 meses</h3>
        <div class="mc-graf" role="img" aria-label="Registros abertos e finalizados por mês">${porMes.map(x => `<div class="mc-col" title="${rotMes(x.m)}: ${x.ab} aberto(s), ${x.fin} finalizado(s)">
          <div class="mc-barras"><i class="mc-ab" style="height:${x.ab / max * 100}%"></i><i class="mc-fin" style="height:${x.fin / max * 100}%"></i></div><span>${rotMes(x.m)}</span></div>`).join('')}</div>
        <p class="dica" style="margin:4px 0 0"><span class="mc-leg mc-ab"></span> abertos <span class="mc-leg mc-fin"></span> finalizados</p></div>
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="mcImp">Imprimir registro</button>
    <button class="btn" type="button" id="mcXlsx">Excel</button>
  </div>`;
  $('mcNovoP').addEventListener('click', () => formReg(null));
  $('mcImp').addEventListener('click', () => mostrar(docRegistro(M.regs), { barra: true }));
  $('mcXlsx').addEventListener('click', () => exportar());
  ligarTabela(tela);
  tela.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => { M.f.status = b.dataset.ver; abrirModulo('cert', 'mcRegistros'); }));
}

/* ===================================================================
   TELA · REGISTROS (a planilha)
   =================================================================== */
function tabela(lista, edita, curta) {
  return `<div class="ac-rola"><table class="dc-planilha bm-tab mc-tab"><thead><tr><th>Situação</th><th class="ce">Abertura</th>${curta ? '' : '<th>Via</th>'}<th>Tipo</th><th>Local</th>${curta ? '' : '<th>Fazenda</th><th>Solicitante</th>'}
    <th>Descrição / causa raiz</th><th>Prioridade</th><th class="ce">Previsão</th><th>Prazo</th>${curta ? '' : '<th>Responsável (resolução)</th><th>Resolução</th><th class="ce">Fechamento</th><th class="ce">Evidências</th>'}${edita ? '<th></th>' : ''}</tr></thead><tbody>
    ${lista.map(r => { const p = prazo(r); return `<tr${p.atrasado ? ' class="mc-atrasado"' : ''}><td>${tag(aberto(r) ? 'EM ABERTO' : 'FINALIZADO', aberto(r) ? 'alerta' : 'ativo')}</td><td class="ce">${br(r.data_abertura)}</td>${curta ? '' : `<td>${esc(r.via || '')}</td>`}
      <td>${tag(r.tipo, COR_TIPO[r.tipo] || 'neutra')}</td><td>${esc(r.local || '')}</td>${curta ? '' : `<td>${esc(r.fazenda || '')}</td><td>${esc(r.solicitante || '')}</td>`}
      <td>${esc(r.descricao || '')}</td><td>${esc(r.prioridade || '')}</td><td class="ce">${br(previsaoDe(r))}${r.previsao ? '' : '<br><small class="dica">padrão</small>'}</td><td>${tag(p.rot, p.cor)}</td>
      ${curta ? '' : `<td>${esc(r.resp_resolucao || '')}</td><td>${esc(r.resolucao || '')}</td><td class="ce">${r.data_fechamento ? br(r.data_fechamento) : ''}</td><td class="ce">${evid(r)}</td>`}
      ${edita ? `<td class="ce"><button class="btn mini" type="button" data-mc="${esc(r.id)}">Abrir</button></td>` : ''}</tr>`; }).join('')}
  </tbody></table></div>`;
}
function ligarTabela(el) { el.querySelectorAll('[data-mc]').forEach(b => b.addEventListener('click', () => formReg(M.regs.find(x => x.id === b.dataset.mc)))); }
function filtrados() {
  const f = M.f, q = semAc(f.q);
  return M.regs.filter(r => (!f.status || (f.status === 'ATRASADO' ? prazo(r).atrasado : f.status === 'EM ABERTO' ? aberto(r) : !aberto(r)))
    && (!f.tipo || r.tipo === f.tipo) && (!f.faz || r.fazenda === f.faz) && (!f.ano || String(r.data_abertura || '').startsWith(f.ano))
    && (!q || semAc([r.descricao, r.local, r.solicitante, r.resp_resolucao, r.resolucao, r.via].join(' ')).includes(q)));
}
function desenharRegistros() {
  const tela = $('telaMcRegistros'); const f = M.f;
  const L = filtrados();
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0"><div><h2 style="margin:0">Registro — ${FORM.titulo}</h2>
      <p class="dica" style="margin:2px 0 0">Uma linha por registro, como a planilha. Sem previsão, o prazo é a abertura + ${PRAZO_PADRAO} dias.</p></div>
      <button class="btn principal" type="button" id="mcNovo">+ Novo registro</button></div>
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Situação <select id="mcFSt">${['EM ABERTO', 'ATRASADO', 'FINALIZADO'].map(s => `<option value="${s}"${s === f.status ? ' selected' : ''}>${s === 'EM ABERTO' ? 'Em aberto' : s === 'ATRASADO' ? 'Atrasados' : 'Finalizados'}</option>`).join('')}<option value=""${!f.status ? ' selected' : ''}>Todos</option></select></label>
      <label class="campo">Tipo <select id="mcFTipo">${opcoes(TIPOS, f.tipo, 'Todos')}</select></label>
      <label class="campo">Fazenda <select id="mcFFaz">${opcoes(FAZENDAS, f.faz, 'Todas')}</select></label>
      <label class="campo">Ano <select id="mcFAno">${opcoes(anos(), f.ano, 'Todos')}</select></label>
      <label class="campo" style="grid-column:span 2">Procurar <input type="search" id="mcFQ" value="${esc(f.q)}" placeholder="descrição, local, responsável…"></label>
    </div>
    <p class="dica" style="margin:8px 0 4px">${L.length} registro(s).</p>
    ${L.length ? tabela(L, true, false) : '<div class="vazio">Nada com esses filtros.</div>'}
  </div>`;
  $('mcNovo').addEventListener('click', () => formReg(null));
  const liga = (id, k) => $(id).addEventListener('change', e => { M.f[k] = e.target.value; desenharRegistros(); });
  liga('mcFSt', 'status'); liga('mcFTipo', 'tipo'); liga('mcFFaz', 'faz'); liga('mcFAno', 'ano');
  $('mcFQ').addEventListener('input', e => { M.f.q = e.target.value; const p = e.target.selectionStart; desenharRegistros(); const i = $('mcFQ'); i.focus(); i.setSelectionRange(p, p); });
  ligarTabela(tela);
}

/* ---------------- formulário ---------------- */
let anxAb = null, anxRes = null;
function formReg(r) {
  const v = r || { status: 'EM ABERTO', data_abertura: hoje(), via: 'AUDITORIA INTERNA', tipo: 'MELHORIA', prioridade: 'MÉDIA' };
  const pessoas = [...new Set(M.regs.flatMap(x => [x.solicitante, x.resp_resolucao]).filter(Boolean))].sort();
  const locais = [...new Set(M.regs.map(x => x.local).filter(Boolean))].sort();
  dialogo(`<h3>${r ? 'Registro de ' + br(r.data_abertura) : 'Novo registro'} · ${FORM.titulo}</h3>
    <div class="aviso erro" id="mcErro" hidden></div>
    <fieldset class="cp-fs"><legend>Abertura</legend>
      <div class="grade">
        <label class="campo">Data de abertura <input type="date" id="mcData" value="${esc(String(v.data_abertura || '').slice(0, 10))}"></label>
        <label class="campo">Tipo <select id="mcTipo">${opcoes(TIPOS, v.tipo)}</select></label>
        <label class="campo">Via <select id="mcVia">${opcoes(VIAS, v.via, '—')}</select></label>
        <label class="campo">Prioridade <select id="mcPri">${opcoes(PRIORIDADES, v.prioridade, '—')}</select></label>
        <label class="campo">Local <input type="text" id="mcLocal" list="mcLocais" value="${esc(v.local || '')}"></label>
        <label class="campo">Fazenda <select id="mcFaz">${opcoes(FAZENDAS, v.fazenda, '—')}</select></label>
        <label class="campo">Solicitante <input type="text" id="mcSol" list="mcPessoas" value="${esc(v.solicitante || '')}"></label>
        <label class="campo">Previsão de fechamento <input type="date" id="mcPrev" value="${esc(String(v.previsao || '').slice(0, 10))}"><small class="dica">vazio = abertura + ${PRAZO_PADRAO} dias</small></label>
      </div>
      <label class="campo">Descrição / causa raiz <textarea id="mcDesc" rows="2">${esc(v.descricao || '')}</textarea></label>
      <label class="campo">Evidência (link) <input type="url" id="mcEv" value="${esc(v.evid_url || '')}" placeholder="https://…"></label>
      <div id="mcAnxAb" style="margin-top:6px"></div>
    </fieldset>
    <fieldset class="cp-fs"><legend>Resolução</legend>
      <div class="grade">
        <label class="campo">Responsável (resolução) <input type="text" id="mcResp" list="mcPessoas" value="${esc(v.resp_resolucao || '')}"></label>
        <label class="campo">Situação <select id="mcSt">${opcoes(['EM ABERTO', 'FINALIZADO'], v.status)}</select></label>
        <label class="campo">Data de fechamento <input type="date" id="mcFech" value="${esc(String(v.data_fechamento || '').slice(0, 10))}"></label>
      </div>
      <label class="campo">Descrição da resolução <textarea id="mcRes" rows="2">${esc(v.resolucao || '')}</textarea></label>
      <label class="campo">Evidência da resolução (link) <input type="url" id="mcEvR" value="${esc(v.evid_resolucao_url || '')}" placeholder="https://…"></label>
      <div id="mcAnxRes" style="margin-top:6px"></div>
    </fieldset>
    <datalist id="mcPessoas">${pessoas.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <datalist id="mcLocais">${locais.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="mcApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="mcOk">Salvar</button></div></div>`, () => {
    anxAb = campoAnexos($('mcAnxAb'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Evidência da abertura', dica: 'PDF ou foto' });
    anxRes = campoAnexos($('mcAnxRes'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Evidência da resolução', dica: 'PDF ou foto' });
    anxAb.abrir(r ? 'mc-' + r.id : null); anxRes.abrir(r ? 'mcr-' + r.id : null);
    $('mcSt').addEventListener('change', e => { if (e.target.value === 'FINALIZADO' && !$('mcFech').value) $('mcFech').value = hoje(); });
    $('mcFech').addEventListener('change', e => { if (e.target.value) $('mcSt').value = 'FINALIZADO'; });
    $('mcOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      const linha = { data_abertura: $('mcData').value, tipo: $('mcTipo').value, via: $('mcVia').value || null, prioridade: $('mcPri').value || null,
        local: so($('mcLocal').value) || null, fazenda: $('mcFaz').value || null, solicitante: so($('mcSol').value) || null, previsao: $('mcPrev').value || null,
        descricao: so($('mcDesc').value), evid_url: so($('mcEv').value) || null, resp_resolucao: so($('mcResp').value) || null,
        status: $('mcSt').value, data_fechamento: $('mcFech').value || null, resolucao: so($('mcRes').value) || null, evid_resolucao_url: so($('mcEvR').value) || null };
      if (!linha.data_abertura) return erroDlg('Informe a data de abertura.');
      if (!linha.descricao) return erroDlg('Descreva o registro (descrição / causa raiz).');
      if (linha.status === 'FINALIZADO' && !linha.data_fechamento) return erroDlg('Informe a data de fechamento.');
      if (linha.status === 'FINALIZADO' && !linha.resolucao) return erroDlg('Descreva a resolução para finalizar.');
      if (linha.data_fechamento && linha.data_fechamento < linha.data_abertura) return erroDlg('O fechamento não pode ser antes da abertura.');
      if ([linha.evid_url, linha.evid_resolucao_url].some(u => u && !/^https?:\/\//i.test(u))) return erroDlg('Os links de evidência precisam começar com https://');
      if (linha.status === 'EM ABERTO') linha.data_fechamento = null;
      $('mcOk').disabled = true;
      try {
        const t = estado.cliente.from('cmc_registros');
        const { data, error } = r ? await t.update(linha).eq('id', r.id).select().single() : await t.insert(linha).select().single();
        if (error) throw error;
        const i = M.regs.findIndex(x => x.id === data.id); if (i >= 0) M.regs[i] = data; else M.regs.unshift(data);
        if (anxAb?.mudou) { await anxAb.salvar('mc-' + data.id); M.arq.add('mc-' + data.id); }
        if (anxRes?.mudou) { await anxRes.salvar('mcr-' + data.id); M.arq.add('mcr-' + data.id); }
        salvarCaixa(); fechar(); redesenhar();
      } catch (e) { if ($('mcOk')) $('mcOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
    });
    $('mcApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar este registro?')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cmc_registros').delete().eq('id', r.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      M.regs = M.regs.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   IMPRESSÃO E EXCEL
   =================================================================== */
function docRegistro(lista) {
  const L = lista.slice().sort((a, b) => String(a.data_abertura).localeCompare(String(b.data_abertura)));
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(FORM.titulo)}</h1><p>Registro de melhorias, não conformidades, reclamações, sugestões e elogios</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${FORM.codigo}</span></div></header>
    <div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div>
      <div><span>Registros</span><b>${L.length} · ${L.filter(aberto).length} em aberto</b></div></div>
    <table class="rel-tabela"><thead><tr><th>Status</th><th>Abertura</th><th>Via</th><th>Tipo</th><th>Local</th><th>Fazenda</th><th>Solicitante</th><th>Descrição / causa raiz</th><th>Prioridade</th><th>Previsão</th><th>Prazo</th><th>Resp. resolução</th><th>Resolução</th><th>Fechamento</th></tr></thead><tbody>
    ${L.map(r => `<tr><td>${aberto(r) ? 'EM ABERTO' : 'FINALIZADO'}</td><td>${br(r.data_abertura)}</td><td>${esc(r.via || '')}</td><td>${esc(r.tipo)}</td><td>${esc(r.local || '')}</td><td>${esc(r.fazenda || '')}</td><td>${esc(r.solicitante || '')}</td>
      <td>${esc(r.descricao || '')}</td><td>${esc(r.prioridade || '')}</td><td>${br(previsaoDe(r))}</td><td>${esc(prazo(r).rot)}</td><td>${esc(r.resp_resolucao || '')}</td><td>${esc(r.resolucao || '')}</td><td>${r.data_fechamento ? br(r.data_fechamento) : ''}</td></tr>`).join('')}
    </tbody></table>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
async function exportar() {
  const L = M.regs.slice().sort((a, b) => String(a.data_abertura).localeCompare(String(b.data_abertura)));
  await baixarXlsx(`melhorias-continuas-${hoje()}`, [{ nome: 'Registro', titulo: `${FORM.codigo} — ${FORM.titulo}`, subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Status', larg: 12 }, { rot: 'Abertura', larg: 11, tipo: 'data' }, { rot: 'Via', larg: 18 }, { rot: 'Tipo', larg: 18 }, { rot: 'Local', larg: 26 }, { rot: 'Fazenda', larg: 14 },
      { rot: 'Solicitante', larg: 26 }, { rot: 'Descrição / causa raiz', larg: 50 }, { rot: 'Prioridade', larg: 11 }, { rot: 'Previsão', larg: 11, tipo: 'data' }, { rot: 'Prazo', larg: 18 },
      { rot: 'Responsável (resolução)', larg: 26 }, { rot: 'Resolução', larg: 50 }, { rot: 'Fechamento', larg: 11, tipo: 'data' }, { rot: 'Evidência', larg: 40 }, { rot: 'Evidência resolução', larg: 40 }],
    linhas: L.map(r => [aberto(r) ? 'EM ABERTO' : 'FINALIZADO', r.data_abertura, r.via || '', r.tipo, r.local || '', r.fazenda || '', r.solicitante || '', r.descricao || '', r.prioridade || '',
      previsaoDe(r), prazo(r).rot, r.resp_resolucao || '', r.resolucao || '', r.data_fechamento || '', r.evid_url || '', r.evid_resolucao_url || '']) }]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_MELHORIAS = ['mcPainel', 'mcRegistros'];
const DESENHO = { mcPainel: desenharPainel, mcRegistros: desenharRegistros };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirMelhorias(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!M.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o registro de melhorias…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o registro de melhorias: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgMc')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparMelhorias() {
  M.carregado = false; M.regs = []; M.arq = new Set(); Object.assign(M.f, { status: 'EM ABERTO', tipo: '', faz: '', ano: '', q: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _mc = { M, prazo, previsaoDe };
