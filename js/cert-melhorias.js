// cert-melhorias.js — Certificação › Forms › Melhoria contínua, versão 2 (26/10/2026).
//
// Pedido do Guilherme: "sobre melhorias contínuas e não conformidades, vamos procurar algo
// melhor … SPDA é uma não conformidade que já teve início, orçamento, um ficou caro, estamos
// procurando outras empresas … vai ter mais etapas … pesquise em grandes empresas como
// controlam não conformidades e melhorias contínuas, melhorias que vamos fazer no futuro".
// Modelo aprovado ("SIM"):
//  · NÃO CONFORMIDADE = caso CAPA com etapas (ABERTA → CAUSA ANALISADA → PLANO DE AÇÃO →
//    EM EXECUÇÃO → AGUARDANDO RECURSO → VERIFICAÇÃO → ENCERRADA), 5 porquês, plano de ação
//    5W2H, andamentos (linha do tempo) e verificação de eficácia para encerrar.
//  · MELHORIA = banco de melhorias (IDEIA → AVALIADA → APROVADA → EM EXECUÇÃO → CONCLUÍDA /
//    ARQUIVADA), impacto × custo, ano/trimestre previsto — o plano de melhorias do ano.
//  · RECLAMAÇÃO / SUGESTÃO / ELOGIO = feedback (RECEBIDO → TRATADO), pode gerar NC ou melhoria.
// Tabelas cmc_casos, cmc_acoes, cmc_andamentos (supabase/cert-melhorias-casos.sql); a
// cmc_registros (versão 1, planilha FORMAGR-42A) fica só como cópia.
// Evidências: link e arquivos no Drive em certificacao/evidencia/mc-<id do caso>/….

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
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const num = v => { const t = so(v); if (!t) return null; const n = parseFloat(t.replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const reais = v => v == null || v === '' ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'n' + Date.now() + Math.random());

/* Cada um com o seu FORM (26/10/2026, pedido dele). */
const ASSIN = { data: '01/12/2026', elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
const FORMS = {
  NC: { ...ASSIN, codigo: 'FORM 004', titulo: 'Não conformidades', nrev: '02' },
  MELHORIA: { ...ASSIN, codigo: 'FORM 020', titulo: 'Melhorias contínuas', nrev: '01' },
  FEEDBACK: { ...ASSIN, codigo: 'FORM 042', titulo: 'Reclamações e sugestões', nrev: '02' },
};
const FORM = FORMS.MELHORIA;
const ETAPAS = {
  NC: ['ABERTA', 'CAUSA ANALISADA', 'PLANO DE AÇÃO', 'EM EXECUÇÃO', 'AGUARDANDO RECURSO', 'VERIFICAÇÃO', 'ENCERRADA'],
  MELHORIA: ['IDEIA', 'AVALIADA', 'APROVADA', 'EM EXECUÇÃO', 'CONCLUÍDA', 'ARQUIVADA'],
  FEEDBACK: ['RECEBIDO', 'TRATADO'],
};
const FIM = new Set(['ENCERRADA', 'CONCLUÍDA', 'ARQUIVADA', 'TRATADO']);
const NOME_NAT = { NC: 'Não conformidade', MELHORIA: 'Melhoria', FEEDBACK: 'Reclamação / sugestão' };
const TIPOS_FB = ['RECLAMAÇÃO', 'SUGESTÃO', 'ELOGIO'];
const VIAS = ['AUDITORIA INTERNA', 'AUDITORIA EXTERNA', 'QUADRO', 'WHATSAPP', 'DIGITAL', 'VIA PAPEL', 'CAIXA DE SUGESTÕES', 'CHECK LIST'];
const FAZENDAS = ['FACA', 'LOTE 35 PADAP', 'MORRO BRANCO', 'TRÊS RIACHOS', 'QUEBRA COCÃO'];
const PRIORIDADES = ['URGENTE', 'ALTA', 'MÉDIA', 'BAIXA'];
const NIVEL = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' };
const ST_ACAO = ['A FAZER', 'EM ANDAMENTO', 'CONCLUÍDA', 'CANCELADA'];
const COR_ETAPA = e => FIM.has(e) ? 'ativo' : e === 'AGUARDANDO RECURSO' ? 'alerta' : e === 'VERIFICAÇÃO' ? 'tc' : e === 'ABERTA' || e === 'IDEIA' || e === 'RECEBIDO' ? 'neutra' : 'alerta';

/* ---------------- estado ---------------- */
const M = { carregado: false, casos: [], acoes: [], ands: [], arq: new Set(),
  fn: { ver: 'abertas', q: '' }, fm: { ver: 'lista', etapa: 'abertas', q: '' }, ff: { ver: 'abertas' } };
const CAIXA = 'melhorias2.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { casos: M.casos, acoes: M.acoes, ands: M.ands });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !M.carregado) { Object.assign(M, { casos: c0.casos || [], acoes: c0.acoes || [], ands: c0.ands || [] }); M.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (M.carregado) return;
    throw new Error('Sem internet e sem cópia da melhoria contínua neste aparelho.');
  }
  const [a, b, d] = await Promise.all([
    c.from('cmc_casos').select('*').order('data_abertura', { ascending: false }),
    c.from('cmc_acoes').select('*').order('ordem').order('criado_em'),
    c.from('cmc_andamentos').select('*').order('data'),
  ]);
  const erro = a.error || b.error || d.error;
  if (erro) {
    if (M.carregado) return;
    if (/cmc_|relation|does not exist|schema cache/i.test(erro.message || '')) throw new Error('As tabelas da melhoria contínua ainda não foram criadas no banco (supabase/cert-melhorias-casos.sql).');
    throw erro;
  }
  Object.assign(M, { casos: a.data || [], acoes: b.data || [], ands: d.data || [], carregado: true });
  salvarCaixa();
  M.arq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}

/* ---------------- contas ---------------- */
const aberto = c => !FIM.has(c.etapa);
const acoesDe = c => M.acoes.filter(a => a.caso_id === c.id).sort((x, y) => (x.ordem || 0) - (y.ordem || 0) || String(x.criado_em).localeCompare(String(y.criado_em)));
const andsDe = c => M.ands.filter(a => a.caso_id === c.id).sort((x, y) => String(x.data).localeCompare(String(y.data)));
const acaoAtrasada = a => a.quando && a.quando < hoje() && !['CONCLUÍDA', 'CANCELADA'].includes(a.status);
const proximaAcao = c => acoesDe(c).filter(a => !['CONCLUÍDA', 'CANCELADA'].includes(a.status)).sort((x, y) => String(x.quando || '9').localeCompare(String(y.quando || '9')))[0] || null;
/** Situação do caso para a lista e os alertas. */
function situacao(c) {
  if (!aberto(c)) return { rot: c.data_encerramento ? 'Concluído ' + br(c.data_encerramento) : 'Concluído', cor: 'ativo', nivel: 0 };
  if (c.etapa === 'AGUARDANDO RECURSO') {
    if (!c.reavaliar_em) return { rot: 'Aguardando recurso · sem data para reavaliar', cor: 'alerta', nivel: 1 };
    const d = dias(hoje(), c.reavaliar_em);
    return d <= 0 ? { rot: 'Reavaliar agora (era ' + br(c.reavaliar_em) + ')', cor: 'perigo', nivel: 2 } : { rot: 'Aguardando recurso · reavaliar ' + br(c.reavaliar_em), cor: 'alerta', nivel: d <= 15 ? 1 : 0 };
  }
  const atr = acoesDe(c).filter(acaoAtrasada).length;
  if (atr) return { rot: `${atr} ação(ões) atrasada(s)`, cor: 'perigo', nivel: 2 };
  if (c.previsao && c.previsao < hoje()) return { rot: `Atrasado ${dias(c.previsao, hoje())} d`, cor: 'perigo', nivel: 2 };
  if (c.natureza === 'NC' && !acoesDe(c).length && dias(c.data_abertura, hoje()) > 7) return { rot: 'Sem plano de ação', cor: 'alerta', nivel: 1 };
  if (c.etapa === 'VERIFICAÇÃO') return { rot: 'Verificar eficácia', cor: 'alerta', nivel: 1 };
  return { rot: c.previsao ? 'No prazo · ' + br(c.previsao) : 'Em andamento', cor: 'ativo', nivel: 0 };
}
const alertas = () => M.casos.filter(aberto).map(c => ({ c, s: situacao(c) })).filter(x => x.s.nivel > 0).sort((a, b) => b.s.nivel - a.s.nivel);

/* ---------------- peças ---------------- */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
function dialogo(html, ligar) {
  let d = $('dlgMc');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgMc'; d.className = 'rs-largo mc-dlg'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgMc')?.open && $('dlgMc').close();
const erroDlg = t => { const e = $('mcErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgMc')) $('dlgMc').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
const cab = (titulo, dica, botoes) => `<div class="barra entre" style="margin:0"><div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div><div class="barra" style="margin:0">${botoes || ''}</div></div>`;
const ligarAbrir = el => el.querySelectorAll('[data-caso]').forEach(b => b.addEventListener('click', () => ficha(M.casos.find(c => c.id === b.dataset.caso))));

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaMcPainel');
  const ano = hoje().slice(0, 4);
  const nc = M.casos.filter(c => c.natureza === 'NC'), me = M.casos.filter(c => c.natureza === 'MELHORIA'), fb = M.casos.filter(c => c.natureza === 'FEEDBACK');
  const al = alertas();
  const acAtr = M.acoes.filter(acaoAtrasada).filter(a => { const c = M.casos.find(x => x.id === a.caso_id); return c && aberto(c); });
  const concAno = M.casos.filter(c => !aberto(c) && c.etapa !== 'ARQUIVADA' && String(c.data_encerramento || '').startsWith(ano)).length;
  const plano = me.filter(c => ['AVALIADA', 'APROVADA', 'EM EXECUÇÃO'].includes(c.etapa));
  const pipe = (nat, lista) => `<div class="mc-pipe">${ETAPAS[nat].map(e => { const n = lista.filter(c => c.etapa === e).length; return `<div class="mc-pipe-e${n ? '' : ' vazio'}"><b>${n}</b><span>${esc(e)}</span></div>`; }).join('')}</div>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cab('Melhoria contínua', `${FORM.codigo} · FORM 042 — não conformidades tratadas por etapas, melhorias planejadas e reclamações/sugestões.`,
      `<button class="btn" type="button" data-novo="FEEDBACK">+ Reclamação / sugestão</button><button class="btn" type="button" data-novo="MELHORIA">+ Melhoria</button><button class="btn principal" type="button" data-novo="NC">+ Não conformidade</button>`)}
    <div class="pv-cards" style="margin-top:12px">
      <button type="button" class="pv-card pv-perigo" data-ir="mcNcs"><span>Não conformidades abertas</span><strong>${nc.filter(aberto).length}</strong><small>${nc.filter(c => c.etapa === 'AGUARDANDO RECURSO').length} aguardando recurso</small></button>
      <button type="button" class="pv-card pv-alerta" data-ir="mcNcs"><span>Ações atrasadas</span><strong>${acAtr.length}</strong><small>do plano de ação</small></button>
      <button type="button" class="pv-card pv-calma" data-ir="mcMelhorias"><span>Melhorias no plano</span><strong>${plano.length}</strong><small>${me.filter(c => c.etapa === 'IDEIA').length} ideia(s) para avaliar</small></button>
      <button type="button" class="pv-card pv-ok" data-ir="mcMelhorias"><span>Concluídas em ${ano}</span><strong>${concAno}</strong><small>NC e melhorias</small></button>
      <button type="button" class="pv-card pv-calma" data-ir="mcFeedbacks"><span>Reclamações / sugestões</span><strong>${fb.filter(aberto).length}</strong><small>sem tratar</small></button>
    </div>
    <h3 class="bm-h3">Precisa de atenção</h3>
    ${al.length ? `<div class="ac-rola"><table class="dc-planilha bm-tab"><thead><tr><th>Caso</th><th>Tipo</th><th>Etapa</th><th>Situação</th><th>Próximo passo</th><th>Responsável</th><th></th></tr></thead><tbody>
      ${al.map(({ c, s }) => { const p = proximaAcao(c); return `<tr><td><b>${esc(c.titulo)}</b><br><small class="dica">${esc([c.local, c.fazenda].filter(Boolean).join(' · '))}</small></td><td>${esc(NOME_NAT[c.natureza])}</td>
        <td>${tag(c.etapa, COR_ETAPA(c.etapa))}</td><td>${tag(s.rot, s.cor)}</td><td>${p ? esc(p.oque) + (p.quando ? ` <small class="dica">até ${br(p.quando)}</small>` : '') : '<span class="dica">—</span>'}</td>
        <td>${esc(c.responsavel || '')}</td><td class="ce"><button class="btn mini" type="button" data-caso="${esc(c.id)}">Abrir</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="aviso ok">Nada atrasado nem aguardando reavaliação.</div>'}
    <div class="mc-duas">
      <div><h3 class="bm-h3">Não conformidades por etapa</h3>${pipe('NC', nc)}</div>
      <div><h3 class="bm-h3">Melhorias por etapa</h3>${pipe('MELHORIA', me)}</div>
    </div>
  </div>
  <div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="mcImp">Imprimir</button><button class="btn" type="button" id="mcXlsx">Excel</button></div>`;
  tela.querySelectorAll('[data-novo]').forEach(b => b.addEventListener('click', () => ficha(null, b.dataset.novo)));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', b.dataset.ir)));
  $('mcImp').addEventListener('click', () => mostrar(docCasos(M.casos.filter(c => c.natureza !== 'FEEDBACK'), 'Não conformidades e melhorias'), { barra: true }));
  $('mcXlsx').addEventListener('click', () => exportar());
  ligarAbrir(tela);
}

/* ===================================================================
   TELA · NÃO CONFORMIDADES
   =================================================================== */
function tabelaCasos(lista, colunasExtra = '') {
  if (!lista.length) return '<div class="vazio">Nada para mostrar.</div>';
  return `<div class="ac-rola"><table class="dc-planilha bm-tab mc-tab"><thead><tr><th class="ce">Abertura</th><th>Caso</th><th>Local / fazenda</th><th>Etapa</th><th>Situação</th><th class="ce">Ações</th><th>Próximo passo</th><th>Último andamento</th><th>Responsável</th>${colunasExtra ? '<th>Plano</th>' : ''}<th></th></tr></thead><tbody>
    ${lista.map(c => { const s = situacao(c), ac = acoesDe(c), p = proximaAcao(c), an = andsDe(c).slice(-1)[0];
      return `<tr${s.nivel === 2 ? ' class="mc-atrasado"' : ''}><td class="ce">${br(c.data_abertura)}</td><td><b>${esc(c.titulo)}</b>${c.prioridade ? `<br><small class="dica">${esc(c.prioridade)}${c.via ? ' · ' + esc(c.via) : ''}</small>` : ''}</td>
        <td>${esc([c.local, c.fazenda].filter(Boolean).join(' · '))}</td><td>${tag(c.etapa, COR_ETAPA(c.etapa))}</td><td>${tag(s.rot, s.cor)}</td>
        <td class="ce">${ac.length ? `${ac.filter(a => a.status === 'CONCLUÍDA').length}/${ac.filter(a => a.status !== 'CANCELADA').length}` : '—'}</td>
        <td>${p ? esc(p.oque) + (p.quando ? `<br><small class="dica">${esc(p.quem || '')} · até ${br(p.quando)}</small>` : p.quem ? `<br><small class="dica">${esc(p.quem)}</small>` : '') : '—'}</td>
        <td>${an ? `<small class="dica">${br(an.data)}</small> ${esc(an.texto)}${an.valor != null ? ' · ' + reais(an.valor) : ''}` : '—'}</td><td>${esc(c.responsavel || '')}</td>
        ${colunasExtra ? `<td>${c.ano_previsto ? esc(c.ano_previsto) + (c.trimestre_previsto ? ' · T' + c.trimestre_previsto : '') : '—'}${c.custo_estimado != null ? '<br><small class="dica">' + reais(c.custo_estimado) + '</small>' : ''}</td>` : ''}
        <td class="ce"><button class="btn mini" type="button" data-caso="${esc(c.id)}">Abrir</button></td></tr>`; }).join('')}
  </tbody></table></div>`;
}
const filtroTexto = (lista, q) => { const t = semAc(q); return t ? lista.filter(c => semAc([c.titulo, c.descricao, c.local, c.fazenda, c.responsavel, c.solicitante].join(' ')).includes(t)) : lista; };
function desenharNcs() {
  const tela = $('telaMcNcs'); const f = M.fn;
  let L = M.casos.filter(c => c.natureza === 'NC');
  L = f.ver === 'abertas' ? L.filter(aberto) : f.ver === 'encerradas' ? L.filter(c => !aberto(c)) : f.ver === 'todas' ? L : L.filter(c => c.etapa === f.ver);
  L = filtroTexto(L, f.q).sort((a, b) => situacao(b).nivel - situacao(a).nivel || String(b.data_abertura).localeCompare(String(a.data_abertura)));
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cab('Não conformidades · FORM 004', 'Cada uma passa pelas etapas: causa raiz → plano de ação → execução → verificação de eficácia. Os andamentos (orçamentos, contatos, decisões) ficam na linha do tempo do caso.', '<button class="btn principal" type="button" id="mcNovaNc">+ Não conformidade</button>')}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Mostrar <select id="mcFn">${opcoes([['abertas', 'Abertas'], ...ETAPAS.NC.map(e => [e, e[0] + e.slice(1).toLowerCase()]), ['encerradas', 'Encerradas'], ['todas', 'Todas']], f.ver)}</select></label>
      <label class="campo" style="grid-column:span 2">Procurar <input type="search" id="mcFnQ" value="${esc(f.q)}" placeholder="caso, local, responsável…"></label>
    </div>
    <p class="dica" style="margin:8px 0 4px">${L.length} caso(s).</p>${tabelaCasos(L)}
  </div>
  ${rodapeForm('NC')}`;
  ligarRodape('NC', L);
  $('mcNovaNc').addEventListener('click', () => ficha(null, 'NC'));
  $('mcFn').addEventListener('change', e => { f.ver = e.target.value; desenharNcs(); });
  $('mcFnQ').addEventListener('input', e => { f.q = e.target.value; const p = e.target.selectionStart; desenharNcs(); const i = $('mcFnQ'); i.focus(); i.setSelectionRange(p, p); });
  ligarAbrir(tela);
}

/* ===================================================================
   TELA · MELHORIAS (banco de melhorias e plano)
   =================================================================== */
function desenharMelhorias() {
  const tela = $('telaMcMelhorias'); const f = M.fm;
  const todas = M.casos.filter(c => c.natureza === 'MELHORIA');
  let L = f.etapa === 'abertas' ? todas.filter(aberto) : f.etapa === 'todas' ? todas : todas.filter(c => c.etapa === f.etapa);
  L = filtroTexto(L, f.q);
  let corpo = '';
  if (f.ver === 'lista') corpo = tabelaCasos(L.sort((a, b) => ETAPAS.MELHORIA.indexOf(a.etapa) - ETAPAS.MELHORIA.indexOf(b.etapa) || String(a.previsao || '9').localeCompare(String(b.previsao || '9'))), true);
  else if (f.ver === 'matriz') {
    const vivas = L.filter(aberto);
    const sem = vivas.filter(c => !c.impacto || !c.custo);
    const cel = (i, k) => vivas.filter(c => c.impacto === i && c.custo === k);
    const rot = { '3-1': 'Fazer já', '3-2': 'Planejar', '3-3': 'Grande projeto', '2-1': 'Fazer quando der', '2-2': 'Avaliar', '2-3': 'Rever', '1-1': 'Rápido', '1-2': 'Talvez', '1-3': 'Evitar' };
    corpo = `<div class="mc-matriz"><div class="mc-mx-eixo-y">Impacto ↑</div><div class="mc-mx-grade">
      ${[3, 2, 1].map(i => [1, 2, 3].map(k => `<div class="mc-mx-cel mc-mx-${i}${k}"><span class="mc-mx-rot">${rot[i + '-' + k]} <small>impacto ${NIVEL[i].toLowerCase()} · custo ${NIVEL[k].toLowerCase()}</small></span>
        ${cel(i, k).map(c => `<button type="button" class="mc-chip" data-caso="${esc(c.id)}" title="${esc(c.etapa)}">${esc(c.titulo)}</button>`).join('')}</div>`).join('')).join('')}
      </div><div class="mc-mx-eixo-x">Custo / esforço →</div></div>
      ${sem.length ? `<p class="dica" style="margin-top:8px">Sem impacto/custo definido: ${sem.map(c => `<button type="button" class="ce-link" data-caso="${esc(c.id)}">${esc(c.titulo)}</button>`).join(' · ')}</p>` : ''}`;
  } else {
    const grupos = new Map();
    L.filter(aberto).forEach(c => { const k = c.ano_previsto ? `${c.ano_previsto}${c.trimestre_previsto ? ' · ' + c.trimestre_previsto + 'º trimestre' : ''}` : 'Sem ano definido'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); });
    const chaves = [...grupos.keys()].sort((a, b) => (a.startsWith('Sem') ? 1 : 0) - (b.startsWith('Sem') ? 1 : 0) || a.localeCompare(b));
    corpo = chaves.length ? chaves.map(k => { const g = grupos.get(k); const tot = g.reduce((s, c) => s + Number(c.custo_estimado || 0), 0);
      return `<h3 class="bm-h3">${esc(k)} <small style="font-weight:400">— ${g.length} melhoria(s)${tot ? ' · ' + reais(tot) : ''}</small></h3>${tabelaCasos(g, true)}`; }).join('') : '<div class="vazio">Nenhuma melhoria em aberto.</div>';
  }
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cab('Melhorias contínuas · FORM 020', 'O banco de melhorias da fazenda: ideia → avaliada (impacto × custo) → aprovada (ano e orçamento) → em execução → concluída.', '<button class="btn principal" type="button" id="mcNovaMe">+ Melhoria</button>')}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Ver <select id="mcFmVer">${opcoes([['lista', 'Lista'], ['matriz', 'Matriz impacto × custo'], ['plano', 'Plano por ano']], f.ver)}</select></label>
      <label class="campo">Etapa <select id="mcFmEt">${opcoes([['abertas', 'Em aberto'], ...ETAPAS.MELHORIA.map(e => [e, e[0] + e.slice(1).toLowerCase()]), ['todas', 'Todas']], f.etapa)}</select></label>
      <label class="campo">Procurar <input type="search" id="mcFmQ" value="${esc(f.q)}" placeholder="melhoria, local…"></label>
    </div>
    <div style="margin-top:10px">${corpo}</div>
  </div>
  ${rodapeForm('MELHORIA', '<button class="btn" type="button" id="mcImpPl">Imprimir plano de melhorias</button>')}`;
  ligarRodape('MELHORIA', L);
  $('mcNovaMe').addEventListener('click', () => ficha(null, 'MELHORIA'));
  $('mcFmVer').addEventListener('change', e => { f.ver = e.target.value; desenharMelhorias(); });
  $('mcFmEt').addEventListener('change', e => { f.etapa = e.target.value; desenharMelhorias(); });
  $('mcFmQ').addEventListener('input', e => { f.q = e.target.value; const p = e.target.selectionStart; desenharMelhorias(); const i = $('mcFmQ'); i.focus(); i.setSelectionRange(p, p); });
  $('mcImpPl').addEventListener('click', () => mostrar(docCasos(todas.filter(aberto), 'Plano de melhorias'), { barra: true }));
  ligarAbrir(tela);
}

/* ===================================================================
   TELA · RECLAMAÇÕES E SUGESTÕES (FORM 042)
   =================================================================== */
function desenharFeedbacks() {
  const tela = $('telaMcFeedbacks'); const f = M.ff;
  const todas = M.casos.filter(c => c.natureza === 'FEEDBACK');
  const L = (f.ver === 'abertas' ? todas.filter(aberto) : todas).sort((a, b) => String(b.data_abertura).localeCompare(String(a.data_abertura)));
  const gerado = c => M.casos.find(x => x.origem_id === c.id);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cab('Reclamações e sugestões · FORM 042', 'Reclamações, sugestões e elogios — o que chega pela caixa de sugestões, quadro, WhatsApp ou conversa. Ao tratar, pode virar uma não conformidade ou uma melhoria.', '<button class="btn principal" type="button" id="mcNovoFb">+ Registrar</button>')}
    <div class="grade larga" style="margin-top:12px"><label class="campo">Mostrar <select id="mcFf">${opcoes([['abertas', 'Sem tratar'], ['todas', 'Todos']], f.ver)}</select></label></div>
    ${L.length ? `<div class="ac-rola" style="margin-top:10px"><table class="dc-planilha bm-tab"><thead><tr><th class="ce">Data</th><th>Tipo</th><th>O que foi dito</th><th>Via</th><th>Quem</th><th>Situação</th><th>Virou</th><th></th></tr></thead><tbody>
      ${L.map(c => { const g = gerado(c); return `<tr><td class="ce">${br(c.data_abertura)}</td><td>${tag(c.tipo, c.tipo === 'RECLAMAÇÃO' ? 'perigo' : c.tipo === 'ELOGIO' ? 'ativo' : 'neutra')}</td><td><b>${esc(c.titulo)}</b>${c.descricao ? `<br><small class="dica">${esc(c.descricao)}</small>` : ''}</td>
        <td>${esc(c.via || '')}</td><td>${esc(c.solicitante || 'Anônimo')}</td><td>${tag(c.etapa, COR_ETAPA(c.etapa))}</td><td>${g ? `<button type="button" class="ce-link" data-caso="${esc(g.id)}">${esc(NOME_NAT[g.natureza])}</button>` : '—'}</td>
        <td class="ce"><button class="btn mini" type="button" data-caso="${esc(c.id)}">Abrir</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vazio" style="margin-top:10px">Nada registrado.</div>'}
  </div>
  ${rodapeForm('FEEDBACK')}`;
  ligarRodape('FEEDBACK', L);
  $('mcNovoFb').addEventListener('click', () => ficha(null, 'FEEDBACK'));
  $('mcFf').addEventListener('change', e => { f.ver = e.target.value; desenharFeedbacks(); });
  ligarAbrir(tela);
}

/* ===================================================================
   A FICHA DO CASO (abrir / novo)
   =================================================================== */
let anexos = null;
/* Classificação (26/10/2026, pedido dele): uma melhoria pode virar sugestão ou
   reclamação, e vice-versa. Para FEEDBACK o valor é o tipo (RECLAMAÇÃO…). */
const CLASSES = [['NC', 'Não conformidade'], ['MELHORIA', 'Melhoria'], ['RECLAMAÇÃO', 'Reclamação'], ['SUGESTÃO', 'Sugestão'], ['ELOGIO', 'Elogio']];
const natDaClasse = k => k === 'NC' || k === 'MELHORIA' ? k : 'FEEDBACK';
function etapaNaNova(etapa, natNova) {
  const l = ETAPAS[natNova];
  if (l.includes(etapa)) return etapa;
  if (FIM.has(etapa)) return natNova === 'NC' ? 'ENCERRADA' : natNova === 'MELHORIA' ? 'CONCLUÍDA' : 'TRATADO';
  return l[0];
}

function ficha(c, natNovo, pre) {
  const nat = (pre && pre.natureza) || (c ? c.natureza : natNovo);
  const v = c ? { ...c, ...(pre || {}) } : { natureza: nat, tipo: nat === 'NC' ? 'NÃO CONFORMIDADE' : nat === 'MELHORIA' ? 'MELHORIA' : 'SUGESTÃO', etapa: ETAPAS[nat][0], data_abertura: hoje(), prioridade: 'MÉDIA', via: nat === 'FEEDBACK' ? 'CAIXA DE SUGESTÕES' : 'AUDITORIA INTERNA', porques: [], ...(pre || {}) };
  let acoes = pre?._acoes || (c ? acoesDe(c).map(a => ({ ...a })) : []);
  let ands = pre?._ands || (c ? andsDe(c).map(a => ({ ...a })) : []);
  const mudouClasse = c && (c.natureza !== nat || (nat === 'FEEDBACK' && c.tipo !== v.tipo));
  const pessoas = [...new Set(M.casos.flatMap(x => [x.solicitante, x.responsavel]).concat(M.acoes.map(a => a.quem)).filter(Boolean))].sort();
  const locais = [...new Set(M.casos.map(x => x.local).filter(Boolean))].sort();
  const pq = Array.from({ length: 5 }, (_, i) => (v.porques || [])[i] || '');
  const ehNC = nat === 'NC', ehMe = nat === 'MELHORIA', ehFb = nat === 'FEEDBACK';
  const classe = ehFb ? (v.tipo || 'SUGESTÃO') : nat;
  dialogo(`<div class="barra entre" style="margin:0 0 6px"><h3 style="margin:0">${c ? esc(c.titulo) : 'Novo — ' + esc(NOME_NAT[nat])}</h3>
      <label class="mc-classe mc-classe-${ehNC ? 'nc' : ehMe ? 'me' : 'fb'}" title="Mudar a classificação">É uma <select id="mcClasse">${opcoes(CLASSES, classe)}</select></label></div>
    <div class="aviso erro" id="mcErro" hidden></div>
    ${mudouClasse ? `<div class="aviso info">Classificação muda de <b>${esc(c.natureza === 'FEEDBACK' ? (c.tipo || 'Reclamação / sugestão').toLowerCase() : NOME_NAT[c.natureza].toLowerCase())}</b> para <b>${esc((CLASSES.find(x => x[0] === classe) || [, ''])[1].toLowerCase())}</b> ao salvar.</div>` : ''}
    <div class="mc-etapas" role="radiogroup" aria-label="Etapa">${ETAPAS[nat].map((e, i) => `<button type="button" class="mc-etapa${e === v.etapa ? ' atual' : ''}${ETAPAS[nat].indexOf(v.etapa) > i ? ' feita' : ''}" data-etapa="${esc(e)}"><b>${i + 1}</b>${esc(e[0] + e.slice(1).toLowerCase())}</button>`).join('')}</div>
    <fieldset class="cp-fs"><legend>${ehFb ? 'O que chegou' : 'Identificação'}</legend>
      <div class="grade">
        <label class="campo" style="grid-column:span 2">${ehFb ? 'Resumo' : 'Título'} <input type="text" id="mcTit" value="${esc(v.titulo || '')}"></label>
        ${ehFb ? `<label class="campo">Tipo <select id="mcTipo">${opcoes(TIPOS_FB, v.tipo)}</select></label>` : ''}
        <label class="campo">Abertura <input type="date" id="mcAb" value="${esc(String(v.data_abertura || '').slice(0, 10))}"></label>
        <label class="campo">Via <select id="mcVia">${opcoes(VIAS, v.via, '—')}</select></label>
        ${ehFb ? '' : `<label class="campo">Prioridade <select id="mcPri">${opcoes(PRIORIDADES, v.prioridade, '—')}</select></label>`}
        <label class="campo">Local <input type="text" id="mcLocal" list="mcLocais" value="${esc(v.local || '')}"></label>
        <label class="campo">Fazenda <select id="mcFaz">${opcoes(FAZENDAS, v.fazenda, '—')}</select></label>
        <label class="campo">${ehFb ? 'Quem trouxe (vazio = anônimo)' : 'Solicitante'} <input type="text" id="mcSol" list="mcPessoas" value="${esc(v.solicitante || '')}"></label>
        <label class="campo">Responsável <input type="text" id="mcResp" list="mcPessoas" value="${esc(v.responsavel || '')}"></label>
        ${ehFb ? '' : `<label class="campo">Previsão de conclusão <input type="date" id="mcPrev" value="${esc(String(v.previsao || '').slice(0, 10))}"></label>`}
      </div>
      <label class="campo">Descrição <textarea id="mcDesc" rows="2">${esc(v.descricao || '')}</textarea></label>
    </fieldset>
    ${ehNC ? `<fieldset class="cp-fs"><legend>Contenção e causa raiz</legend>
      <label class="campo">Ação imediata (contenção) <input type="text" id="mcCont" value="${esc(v.contencao || '')}" placeholder="o que foi feito na hora para conter o problema"></label>
      <div class="mc-pq">${pq.map((p, i) => `<label class="campo">${i + 1}º Por quê? <input type="text" data-pq="${i}" value="${esc(p)}"></label>`).join('')}</div>
      <label class="campo">Causa raiz <input type="text" id="mcCausa" value="${esc(v.causa_raiz || '')}"></label>
    </fieldset>` : ''}
    ${ehMe ? `<fieldset class="cp-fs"><legend>Avaliação e plano</legend><div class="grade">
      <label class="campo">Impacto <select id="mcImpac">${opcoes([[1, 'Baixo'], [2, 'Médio'], [3, 'Alto']], v.impacto, '—')}</select></label>
      <label class="campo">Custo / esforço <select id="mcCusto">${opcoes([[1, 'Baixo'], [2, 'Médio'], [3, 'Alto']], v.custo, '—')}</select></label>
      <label class="campo">Custo estimado (R$) <input type="text" inputmode="decimal" id="mcCustoR" value="${v.custo_estimado != null ? esc(Number(v.custo_estimado).toLocaleString('pt-BR')) : ''}"></label>
      <label class="campo">Ano previsto <input type="number" id="mcAno" min="2024" max="2040" value="${esc(v.ano_previsto || '')}"></label>
      <label class="campo">Trimestre <select id="mcTri">${opcoes([[1, '1º'], [2, '2º'], [3, '3º'], [4, '4º']], v.trimestre_previsto, '—')}</select></label>
    </div></fieldset>` : ''}
    <fieldset class="cp-fs mc-aguarda" ${v.etapa === 'AGUARDANDO RECURSO' ? '' : 'hidden'}><legend>Aguardando recurso</legend>
      <label class="campo">Reavaliar em <input type="date" id="mcReav" value="${esc(String(v.reavaliar_em || '').slice(0, 10))}"></label>
      <p class="dica" style="margin:0">Enquanto aguarda, o caso não conta como atrasado; o painel avisa 15 dias antes desta data.</p></fieldset>
    ${ehFb ? '' : `<fieldset class="cp-fs"><legend>Plano de ação (o quê · quem · até quando · quanto · status)</legend><div id="mcAcoes"></div>
      <button class="btn mini" type="button" id="mcAcMais">＋ Ação</button></fieldset>`}
    <fieldset class="cp-fs"><legend>Andamentos (linha do tempo)</legend><div id="mcAnds"></div>
      <button class="btn mini" type="button" id="mcAnMais">＋ Andamento</button>
      <p class="dica" style="margin:4px 0 0">Orçamentos, contatos com empresas, decisões, entregas — com data, valor e link.</p></fieldset>
    ${ehNC ? `<fieldset class="cp-fs"><legend>Verificação de eficácia (para encerrar)</legend><div class="grade">
      <label class="campo">Data <input type="date" id="mcVd" value="${esc(String(v.verif_data || '').slice(0, 10))}"></label>
      <label class="campo">Verificado por <input type="text" id="mcVp" list="mcPessoas" value="${esc(v.verif_por || '')}"></label>
      <label class="campo">Resolveu? <select id="mcVe">${opcoes([['1', 'Sim — eficaz'], ['0', 'Não — reabrir o plano']], v.verif_eficaz == null ? '' : v.verif_eficaz ? '1' : '0', '—')}</select></label></div>
      <label class="campo">Resultado <input type="text" id="mcVr" value="${esc(v.verif_resultado || '')}"></label>
      <label class="campo">Padronização (virou POP, IT, treinamento?) <input type="text" id="mcPad" value="${esc(v.padronizacao || '')}"></label></fieldset>` : ''}
    ${ehMe ? `<label class="campo">Resultado / o que mudou <input type="text" id="mcPad" value="${esc(v.padronizacao || '')}"></label>` : ''}
    <fieldset class="cp-fs"><legend>Evidências</legend>
      <label class="campo">Link (OneDrive) <input type="url" id="mcEv" value="${esc(v.evid_url || '')}" placeholder="https://…"></label>
      <div id="mcAnx" style="margin-top:6px"></div></fieldset>
    <datalist id="mcPessoas">${pessoas.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <datalist id="mcLocais">${locais.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <div class="barra entre"><div class="barra" style="margin:0">${c ? '<button class="btn perigo" type="button" id="mcApagar">Apagar</button>' : ''}
      ${c && ehFb ? '<button class="btn" type="button" id="mcGerarNc">Gerar não conformidade</button><button class="btn" type="button" id="mcGerarMe">Gerar melhoria</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="mcOk">Salvar</button></div></div>`, d => {
    anexos = campoAnexos($('mcAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Arquivos', dica: 'PDF ou foto — orçamento, relatório, foto do antes e depois' });
    anexos.abrir(c ? 'mc-' + c.id : null);
    let etapa = v.etapa;
    $('mcClasse').addEventListener('change', e => {
      const k = e.target.value, natNova = natDaClasse(k);
      if (natNova === 'FEEDBACK' && nat === 'FEEDBACK' && $('mcTipo')) { $('mcTipo').value = k; return; }
      lerLinhas();
      const val = id => $(id) ? $(id).value : undefined;
      const atual = { titulo: val('mcTit'), data_abertura: val('mcAb'), via: val('mcVia'), local: val('mcLocal'), fazenda: val('mcFaz'),
        solicitante: val('mcSol'), responsavel: val('mcResp'), descricao: val('mcDesc'), evid_url: val('mcEv') };
      Object.keys(atual).forEach(x => atual[x] === undefined && delete atual[x]);
      ficha(c, natNova, { ...(c ? {} : v), ...atual, natureza: natNova, tipo: natNova === 'FEEDBACK' ? k : natNova === 'NC' ? 'NÃO CONFORMIDADE' : 'MELHORIA',
        etapa: etapaNaNova(etapa, natNova), _acoes: acoes, _ands: ands });
    });
    if ($('mcTipo')) $('mcTipo').addEventListener('change', e => { $('mcClasse').value = e.target.value; });
    d.querySelectorAll('[data-etapa]').forEach(b => b.addEventListener('click', () => {
      etapa = b.dataset.etapa;
      d.querySelectorAll('[data-etapa]').forEach((x, i) => { x.classList.toggle('atual', x.dataset.etapa === etapa); x.classList.toggle('feita', ETAPAS[nat].indexOf(etapa) > i); });
      d.querySelector('.mc-aguarda').hidden = etapa !== 'AGUARDANDO RECURSO';
    }));
    const lerLinhas = () => {
      d.querySelectorAll('[data-ac]').forEach(i => { const a = acoes[i.dataset.ac]; if (a) a[i.dataset.k] = i.value; });
      d.querySelectorAll('[data-an]').forEach(i => { const a = ands[i.dataset.an]; if (a) a[i.dataset.k] = i.value; });
    };
    const desenharAcoes = () => {
      if (!$('mcAcoes')) return;
      $('mcAcoes').innerHTML = acoes.length ? `<div class="mc-linhas">${acoes.map((a, i) => `<div class="mc-ac${a.status === 'CONCLUÍDA' ? ' feita' : ''}${acaoAtrasada(a) ? ' atrasada' : ''}">
        <input type="text" data-ac="${i}" data-k="oque" value="${esc(a.oque || '')}" placeholder="O quê">
        <input type="text" data-ac="${i}" data-k="quem" value="${esc(a.quem || '')}" placeholder="Quem" list="mcPessoas">
        <input type="date" data-ac="${i}" data-k="quando" value="${esc(String(a.quando || '').slice(0, 10))}" title="Até quando">
        <input type="text" data-ac="${i}" data-k="quanto" inputmode="decimal" value="${a.quanto != null && a.quanto !== '' ? esc(String(a.quanto).replace('.', ',')) : ''}" placeholder="R$">
        <select data-ac="${i}" data-k="status">${opcoes(ST_ACAO, a.status || 'A FAZER')}</select>
        <button class="btn mini" type="button" data-acx="${i}" title="Tirar">✕</button>
        <input type="text" class="mc-ac-res" data-ac="${i}" data-k="resultado" value="${esc(a.resultado || '')}" placeholder="Resultado / como (opcional)"></div>`).join('')}</div>` : '<p class="dica" style="margin:0">Nenhuma ação ainda.</p>';
      d.querySelectorAll('[data-acx]').forEach(b => b.addEventListener('click', () => { lerLinhas(); acoes.splice(Number(b.dataset.acx), 1); desenharAcoes(); }));
    };
    const donoAnd = a => a.id && !a._novo ? 'mc-an-' + a.id : null;
    const temAnx = a => !!(donoAnd(a) && M.arq.has(donoAnd(a))) || !!a._anx?.mudou;
    const campoDoAnd = a => {
      if (!a._anxEl) {
        a._anxEl = document.createElement('div'); a._anxEl.className = 'mc-an-anx';
        a._anx = campoAnexos(a._anxEl, { area: 'certificacao', tipo: 'evidencia', rotulo: 'Arquivos do andamento', dica: 'orçamento, proposta, foto' });
        a._anx.abrir(donoAnd(a));
      }
      return a._anxEl;
    };
    const desenharAnds = () => {
      const ord = ands.map((a, i) => [a, i]).sort((x, y) => String(x[0].data).localeCompare(String(y[0].data)));
      $('mcAnds').innerHTML = ands.length ? `<div class="mc-tempo">${ord.map(([a, i]) => `<div class="mc-an">
        <input type="date" data-an="${i}" data-k="data" value="${esc(String(a.data || '').slice(0, 10))}">
        <input type="text" data-an="${i}" data-k="texto" value="${esc(a.texto || '')}" placeholder="O que aconteceu">
        <input type="text" data-an="${i}" data-k="empresa" value="${esc(a.empresa || '')}" placeholder="Empresa / pessoa">
        <input type="text" data-an="${i}" data-k="valor" inputmode="decimal" value="${a.valor != null && a.valor !== '' ? esc(String(a.valor).replace('.', ',')) : ''}" placeholder="R$">
        <input type="url" data-an="${i}" data-k="link" value="${esc(a.link || '')}" placeholder="link">
        <button class="btn mini${temAnx(a) ? ' mc-an-com' : ''}" type="button" data-anclip="${i}" title="Anexar arquivos a este andamento (orçamento, proposta, foto)">📎</button>
        <button class="btn mini" type="button" data-anx="${i}" title="Tirar">✕</button>
        <div class="mc-an-slot" data-anslot="${i}"></div></div>`).join('')}</div>` : '<p class="dica" style="margin:0">Nenhum andamento ainda.</p>';
      d.querySelectorAll('[data-anx]').forEach(b => b.addEventListener('click', () => { lerLinhas(); ands.splice(Number(b.dataset.anx), 1); desenharAnds(); }));
      /* Arquivos de cada andamento (26/10/2026, pedido dele): o campo é criado
         uma vez e só muda de lugar quando a lista é redesenhada. */
      d.querySelectorAll('[data-anslot]').forEach(slot => {
        const a = ands[slot.dataset.anslot];
        if (a && (a._aberto || temAnx(a))) slot.appendChild(campoDoAnd(a));
      });
      d.querySelectorAll('[data-anclip]').forEach(b => b.addEventListener('click', () => {
        lerLinhas(); const a = ands[b.dataset.anclip]; a._aberto = !a._aberto; desenharAnds();
      }));
    };
    desenharAcoes(); desenharAnds();
    $('mcAcMais')?.addEventListener('click', () => { lerLinhas(); acoes.push({ _novo: true, oque: '', status: 'A FAZER', ordem: acoes.length + 1 }); desenharAcoes(); d.querySelector(`[data-ac="${acoes.length - 1}"][data-k="oque"]`)?.focus(); });
    $('mcAnMais').addEventListener('click', () => { lerLinhas(); ands.push({ _novo: true, data: hoje(), texto: '' }); desenharAnds(); d.querySelector(`[data-an="${ands.length - 1}"][data-k="texto"]`)?.focus(); });

    const salvar = async (depois) => {
      if (precisaRede()) return null;
      lerLinhas();
      const val = id => $(id) ? so($(id).value) || null : undefined;
      const linha = { natureza: nat, titulo: so($('mcTit').value), tipo: ehFb ? $('mcTipo').value : ehNC ? 'NÃO CONFORMIDADE' : 'MELHORIA', etapa,
        data_abertura: $('mcAb').value, via: $('mcVia').value || null, local: val('mcLocal'), fazenda: $('mcFaz').value || null,
        solicitante: val('mcSol'), responsavel: val('mcResp'), descricao: val('mcDesc'), evid_url: val('mcEv'),
        reavaliar_em: etapa === 'AGUARDANDO RECURSO' ? ($('mcReav').value || null) : null };
      if (!ehFb) Object.assign(linha, { prioridade: $('mcPri').value || null, previsao: $('mcPrev').value || null });
      if (ehNC) Object.assign(linha, { contencao: val('mcCont'), causa_raiz: val('mcCausa'), porques: [...d.querySelectorAll('[data-pq]')].map(i => so(i.value)).filter(Boolean),
        verif_data: $('mcVd').value || null, verif_por: val('mcVp'), verif_eficaz: $('mcVe').value === '' ? null : $('mcVe').value === '1', verif_resultado: val('mcVr'), padronizacao: val('mcPad') });
      if (ehMe) {
        const cr = num($('mcCustoR').value); if (Number.isNaN(cr)) return erroDlg('Confira o custo estimado.');
        Object.assign(linha, { impacto: Number($('mcImpac').value) || null, custo: Number($('mcCusto').value) || null, custo_estimado: cr,
          ano_previsto: Number($('mcAno').value) || null, trimestre_previsto: Number($('mcTri').value) || null, padronizacao: val('mcPad') });
      }
      if (!linha.titulo) return erroDlg('Informe o título.');
      if (!linha.data_abertura) return erroDlg('Informe a data de abertura.');
      if (ehNC && etapa === 'ENCERRADA' && !(c && c.criado_por === 'importado do FORMAGR-42A' && c.etapa === 'ENCERRADA') && (linha.verif_eficaz !== true || !linha.verif_data))
        return erroDlg('Para encerrar a não conformidade, registre a verificação de eficácia (data e "Sim — eficaz").');
      if (ehNC && linha.verif_eficaz === false && etapa === 'ENCERRADA') return erroDlg('A verificação diz que não resolveu: volte para o plano de ação.');
      linha.data_encerramento = FIM.has(etapa) ? (v.data_encerramento && FIM.has(v.etapa) ? v.data_encerramento : (linha.verif_data || hoje())) : null;
      const acs = acoes.map((a, i) => ({ ...a, oque: so(a.oque), quem: so(a.quem) || null, quando: a.quando || null, quanto: num(a.quanto), resultado: so(a.resultado) || null, ordem: i + 1 })).filter(a => a.oque);
      if (acs.some(a => Number.isNaN(a.quanto))) return erroDlg('Confira o valor de uma das ações.');
      const ans = ands.map(a => ({ ...a, texto: so(a.texto), empresa: so(a.empresa) || null, link: so(a.link) || null, valor: num(a.valor) })).filter(a => a.texto);
      if (ans.some(a => Number.isNaN(a.valor) || !a.data)) return erroDlg('Confira a data e o valor dos andamentos.');
      if ([linha.evid_url, ...ans.map(a => a.link)].some(u => u && !/^https?:\/\//i.test(u))) return erroDlg('Os links precisam começar com https://');
      $('mcOk').disabled = true;
      try {
        const cl = estado.cliente;
        const t = cl.from('cmc_casos');
        const { data: caso, error } = c ? await t.update(linha).eq('id', c.id).select().single() : await t.insert({ ...linha, origem_id: v.origem_id || null }).select().single();
        if (error) throw error;
        /* ações: grava as que ficaram, apaga as que saíram */
        const antesAc = c ? acoesDe(c).map(a => a.id) : [], ficamAc = new Set();
        for (const a of acs) {
          const reg = { caso_id: caso.id, oque: a.oque, quem: a.quem, quando: a.quando, quanto: a.quanto, status: a.status || 'A FAZER', resultado: a.resultado, ordem: a.ordem,
            concluida_em: a.status === 'CONCLUÍDA' ? (a.concluida_em || hoje()) : null };
          const r = a.id && !a._novo ? await cl.from('cmc_acoes').update(reg).eq('id', a.id).select().single() : await cl.from('cmc_acoes').insert(reg).select().single();
          if (r.error) throw r.error; ficamAc.add(r.data.id);
          const i = M.acoes.findIndex(x => x.id === r.data.id); if (i >= 0) M.acoes[i] = r.data; else M.acoes.push(r.data);
        }
        for (const id of antesAc.filter(x => !ficamAc.has(x))) { await cl.from('cmc_acoes').delete().eq('id', id); M.acoes = M.acoes.filter(x => x.id !== id); }
        const antesAn = c ? andsDe(c).map(a => a.id) : [], ficamAn = new Set();
        for (const a of ans) {
          const reg = { caso_id: caso.id, data: a.data, texto: a.texto, empresa: a.empresa, valor: a.valor, link: a.link };
          const r = a.id && !a._novo ? await cl.from('cmc_andamentos').update(reg).eq('id', a.id).select().single() : await cl.from('cmc_andamentos').insert(reg).select().single();
          if (r.error) throw r.error; ficamAn.add(r.data.id);
          if (a._anx?.mudou) { await a._anx.salvar('mc-an-' + r.data.id); M.arq.add('mc-an-' + r.data.id); }
          const i = M.ands.findIndex(x => x.id === r.data.id); if (i >= 0) M.ands[i] = r.data; else M.ands.push(r.data);
        }
        for (const id of antesAn.filter(x => !ficamAn.has(x))) { await cl.from('cmc_andamentos').delete().eq('id', id); M.ands = M.ands.filter(x => x.id !== id); }
        const i = M.casos.findIndex(x => x.id === caso.id); if (i >= 0) M.casos[i] = caso; else M.casos.unshift(caso);
        if (anexos?.mudou) { await anexos.salvar('mc-' + caso.id); M.arq.add('mc-' + caso.id); }
        salvarCaixa();
        if (depois) return depois(caso);
        fechar(); redesenhar(); return caso;
      } catch (e) { if ($('mcOk')) $('mcOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); return null; }
    };
    $('mcOk').addEventListener('click', () => salvar());
    const gerar = natG => salvar(async fb => {
      /* o feedback vira tratado e abre a ficha nova já preenchida */
      const { data } = await estado.cliente.from('cmc_casos').update({ etapa: 'TRATADO', data_encerramento: hoje() }).eq('id', fb.id).select().single();
      if (data) { const i = M.casos.findIndex(x => x.id === data.id); if (i >= 0) M.casos[i] = data; salvarCaixa(); }
      ficha(null, natG, { titulo: fb.titulo, descricao: [fb.tipo, fb.descricao].filter(Boolean).join(' — '), via: fb.via, local: fb.local, fazenda: fb.fazenda, solicitante: fb.solicitante, origem_id: fb.id });
      redesenhar();
    });
    $('mcGerarNc')?.addEventListener('click', () => gerar('NC'));
    $('mcGerarMe')?.addEventListener('click', () => gerar('MELHORIA'));
    $('mcApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar este caso, com o plano de ação e os andamentos?')) return;
      if (precisaRede()) return;
      const { error } = await estado.cliente.from('cmc_casos').delete().eq('id', c.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      M.casos = M.casos.filter(x => x.id !== c.id); M.acoes = M.acoes.filter(x => x.caso_id !== c.id); M.ands = M.ands.filter(x => x.caso_id !== c.id);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   IMPRESSÃO E EXCEL
   =================================================================== */
/* Rodapé de cada tela: imprime o FORM dela (o que está na lista) e o Excel. */
const rodapeForm = (nat, extra = '') => `<div class="rodape-fixo naoimprimir"><button class="btn principal" type="button" id="mcImpF">Imprimir ${FORMS[nat].codigo}</button>${extra}<button class="btn" type="button" id="mcXlsxF">Excel</button></div>`;
function ligarRodape(nat, lista) {
  $('mcImpF')?.addEventListener('click', () => mostrar(docCasos(lista, FORMS[nat].titulo, FORMS[nat]), { barra: true }));
  $('mcXlsxF')?.addEventListener('click', () => exportar(nat));
}
function docCasos(lista, titulo, F) {
  if (!F) { const nats = [...new Set(lista.map(c => c.natureza))]; F = nats.length === 1 ? FORMS[nats[0]] : FORM; }
  const FORM_ = F;
  const L = lista.slice().sort((a, b) => a.natureza.localeCompare(b.natureza) || String(a.data_abertura).localeCompare(String(b.data_abertura)));
  return `<article class="rel">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(FORM_.titulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${FORM_.codigo}</span></div></header>
    <div class="rel-ficha"><div><span>Código</span><b>${FORM_.codigo}</b></div><div><span>Data</span><b>${FORM_.data}</b></div><div><span>Revisão</span><b>${FORM_.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM_.elaborador}</b></div><div><span>Aprovação</span><b>${FORM_.aprovador}</b></div><div><span>Casos</span><b>${L.length}</b></div></div>
    ${L.map(c => { const ac = acoesDe(c), an = andsDe(c); return `<section class="mc-rel-caso"><h2 class="rel-secao">${esc(NOME_NAT[c.natureza])} · ${esc(c.titulo)}</h2>
      <p class="rel-nota">Abertura ${br(c.data_abertura)} · ${esc([c.via, c.local, c.fazenda].filter(Boolean).join(' · '))} · etapa <b>${esc(c.etapa)}</b> · ${esc(situacao(c).rot)}${c.responsavel ? ' · responsável ' + esc(c.responsavel) : ''}</p>
      ${c.causa_raiz ? `<p class="rel-nota"><b>Causa raiz:</b> ${esc(c.causa_raiz)}</p>` : ''}
      ${c.natureza === 'MELHORIA' && (c.impacto || c.ano_previsto) ? `<p class="rel-nota">Impacto ${esc(NIVEL[c.impacto] || '—')} · custo ${esc(NIVEL[c.custo] || '—')}${c.custo_estimado != null ? ' · ' + reais(c.custo_estimado) : ''}${c.ano_previsto ? ' · previsto ' + c.ano_previsto + (c.trimestre_previsto ? ' T' + c.trimestre_previsto : '') : ''}</p>` : ''}
      ${ac.length ? `<table class="rel-tabela"><thead><tr><th>Ação</th><th>Quem</th><th>Até</th><th>Valor</th><th>Status</th><th>Resultado</th></tr></thead><tbody>${ac.map(a => `<tr><td>${esc(a.oque)}</td><td>${esc(a.quem || '')}</td><td>${br(a.quando)}</td><td>${reais(a.quanto)}</td><td>${esc(a.status)}</td><td>${esc(a.resultado || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${an.length ? `<table class="rel-tabela" style="margin-top:4px"><thead><tr><th>Data</th><th>Andamento</th><th>Empresa</th><th>Valor</th></tr></thead><tbody>${an.map(a => `<tr><td>${br(a.data)}</td><td>${esc(a.texto)}</td><td>${esc(a.empresa || '')}</td><td>${reais(a.valor)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${c.verif_data ? `<p class="rel-nota"><b>Verificação de eficácia:</b> ${br(c.verif_data)} · ${esc(c.verif_por || '')} · ${c.verif_eficaz ? 'eficaz' : 'não eficaz'}${c.verif_resultado ? ' — ' + esc(c.verif_resultado) : ''}</p>` : ''}
    </section>`; }).join('') || '<p>Nenhum caso.</p>'}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
async function exportar(nat) {
  const nomeCaso = id => M.casos.find(c => c.id === id)?.titulo || '';
  const F = nat ? FORMS[nat] : FORM;
  const casos = nat ? M.casos.filter(c => c.natureza === nat) : M.casos;
  const ids = new Set(casos.map(c => c.id));
  await baixarXlsx(`${F.codigo.replace(' ', '-')}-${semAc(F.titulo).toLowerCase().replace(/\s+/g, '-')}-${hoje()}`, [
    { nome: 'Casos', titulo: `${F.codigo} — ${F.titulo}`, subtitulo: `SAKUMA Agronegócios · emitido em ${br(hoje())}`,
      colunas: [{ rot: 'Natureza', larg: 16 }, { rot: 'Tipo', larg: 18 }, { rot: 'Título', larg: 44 }, { rot: 'Abertura', larg: 11, tipo: 'data' }, { rot: 'Etapa', larg: 18 }, { rot: 'Situação', larg: 30 },
        { rot: 'Via', larg: 18 }, { rot: 'Local', larg: 24 }, { rot: 'Fazenda', larg: 14 }, { rot: 'Responsável', larg: 24 }, { rot: 'Previsão', larg: 11, tipo: 'data' }, { rot: 'Reavaliar em', larg: 11, tipo: 'data' },
        { rot: 'Causa raiz', larg: 40 }, { rot: 'Impacto', larg: 8 }, { rot: 'Custo', larg: 8 }, { rot: 'Custo estimado', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Ano previsto', larg: 8 }, { rot: 'Encerramento', larg: 11, tipo: 'data' }],
      linhas: casos.map(c => [NOME_NAT[c.natureza], c.tipo, c.titulo, c.data_abertura, c.etapa, situacao(c).rot, c.via || '', c.local || '', c.fazenda || '', c.responsavel || '', c.previsao, c.reavaliar_em,
        c.causa_raiz || '', NIVEL[c.impacto] || '', NIVEL[c.custo] || '', c.custo_estimado != null ? Number(c.custo_estimado) : null, c.ano_previsto || '', c.data_encerramento]) },
    { nome: 'Plano de ação', colunas: [{ rot: 'Caso', larg: 40 }, { rot: 'Ação', larg: 40 }, { rot: 'Quem', larg: 24 }, { rot: 'Até', larg: 11, tipo: 'data' }, { rot: 'Valor', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Status', larg: 14 }, { rot: 'Resultado', larg: 40 }],
      linhas: M.acoes.filter(a => ids.has(a.caso_id)).map(a => [nomeCaso(a.caso_id), a.oque, a.quem || '', a.quando, a.quanto != null ? Number(a.quanto) : null, a.status, a.resultado || '']) },
    { nome: 'Andamentos', colunas: [{ rot: 'Caso', larg: 40 }, { rot: 'Data', larg: 11, tipo: 'data' }, { rot: 'Andamento', larg: 60 }, { rot: 'Empresa', larg: 24 }, { rot: 'Valor', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Link', larg: 40 }],
      linhas: M.ands.filter(a => ids.has(a.caso_id)).map(a => [nomeCaso(a.caso_id), a.data, a.texto, a.empresa || '', a.valor != null ? Number(a.valor) : null, a.link || '']) },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_MELHORIAS = ['mcPainel', 'mcNcs', 'mcMelhorias', 'mcFeedbacks'];
const DESENHO = { mcPainel: desenharPainel, mcNcs: desenharNcs, mcMelhorias: desenharMelhorias, mcFeedbacks: desenharFeedbacks };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirMelhorias(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!M.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando a melhoria contínua…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a melhoria contínua: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgMc')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparMelhorias() {
  Object.assign(M, { carregado: false, casos: [], acoes: [], ands: [], arq: new Set() });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _mc = { M, situacao, alertas };
