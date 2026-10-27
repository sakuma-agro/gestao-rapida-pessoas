// cert-grasp.js — Certificação › FORMS Digital › Reunião GRASP (FORM 044), 27/10/2026.
//
// Pedido do Guilherme: "tem alguma lista de presença da reunião do representante
// GRASP?" … "esse form está atrasado de abril 2026". O FORM 044 (Ata de reunião
// mensal GRASP) só existia em papel e nada avisava o atraso.
//
// O que faz: uma reunião por linha (data real, Agendada/Realizada/Cancelada),
// representante dos trabalhadores, participantes marcados do cadastro, pauta,
// assuntos tratados, reclamações e sugestões, encaminhamentos. Imprime a ata
// com a lista de presença para assinar (em branco quando está Agendada).
// Painel de meses desde abril/2026: o mês fica "feito" quando tem reunião
// Realizada com data dentro dele. NUNCA lançar reunião com data que não seja a
// real — o mês atrasado continua atrasado; a regularização é a reunião do mês.
// Ao salvar uma Realizada, marca como feita a ocorrência do mês no evento
// mensal do Cronograma (cert_eventos, título com "FORM 044").
//
// Tabela cg_reunioes (supabase/cert-grasp.sql), trancada por app_pode('cert').
// Ata assinada escaneada: Drive certificacao/evidencia/<id da reunião>/…

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';
import { campoAnexos, donosComArquivo } from './arquivos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = MES.map(m => m.slice(0, 3));
const rotMes = am => { const [a, m] = am.slice(0, 7).split('-'); return `${MES3[Number(m) - 1]}/${a.slice(2)}`; };
const mesLongo = am => { const [a, m] = am.slice(0, 7).split('-'); return `${MES[Number(m) - 1]} de ${a}`; };
const mesAtual = () => hoje().slice(0, 7);
const proxMes = am => { let [a, m] = am.split('-').map(Number); m++; if (m > 12) { m = 1; a++; } return `${a}-${doisD(m)}`; };
const linhas = t => so(t).split('\n').map(so).filter(Boolean);
const paragrafos = t => linhas(t).map(l => `<p style="margin:0 0 3px">${esc(l)}</p>`).join('');

const FORM = { codigo: 'FORM 044', titulo: 'Ata de reunião mensal GRASP', data: '01/12/2026', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
/** Primeiro mês cobrado no painel: o FORM está atrasado desde abril/2026 (ele, 27/10/2026). */
const INICIO = '2026-04';
const SITUACOES = ['Agendada', 'Realizada', 'Cancelada'];
const COR_SIT = { Agendada: 'alerta', Realizada: 'ativo', Cancelada: 'neutra' };
const SIT_ENC = ['Aberto', 'Em andamento', 'Concluído'];
/** Pauta de partida (GRASP v2: representante, canal de reclamação, direitos). */
const PAUTA_PADRAO = [
  'Leitura e acompanhamento dos encaminhamentos da reunião anterior',
  'Reclamações e sugestões dos trabalhadores (caixa de sugestões e conversas com o representante)',
  'Condições de trabalho, jornada, horas extras e pagamentos',
  'Saúde e segurança, EPI, alojamento, água e refeitório',
  'Assuntos gerais',
].join('\n');

/* ---------------- estado ---------------- */
const E = { carregado: false, reun: [], faz: [], arq: new Set(), ev: null, fl: { ano: '', sit: '' } };
const CAIXA = 'grasp.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { reun: E.reun, faz: E.faz, ev: E.ev });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { reun: c0.reun || [], faz: c0.faz || [], ev: c0.ev || null }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia das reuniões GRASP neste aparelho.');
  }
  const [r, f, ev] = await Promise.all([
    c.from('cg_reunioes').select('*').order('data', { ascending: false }),
    c.from('jor_fazendas').select('id, nome').eq('ativo', true).order('nome'),
    c.from('cert_eventos').select('*').ilike('titulo', '%FORM 044%').limit(1),
  ]);
  if (r.error && E.carregado) return;
  if (r.error) {
    if (/cg_|relation|does not exist|schema cache/i.test(r.error.message || '')) throw new Error('A tabela das reuniões GRASP ainda não foi criada no banco (supabase/cert-grasp.sql).');
    throw r.error;
  }
  E.reun = r.data || [];
  if (!f.error) E.faz = f.data || [];
  if (!ev.error) E.ev = (ev.data || [])[0] || null;
  E.carregado = true;
  salvarCaixa();
  E.arq = await donosComArquivo('certificacao', 'evidencia').catch(() => new Set());
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const nomeFaz = id => E.faz.find(x => x.id === id)?.nome || '';
const realizadas = () => E.reun.filter(r => r.situacao === 'Realizada');
const funcionarios = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO')
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
const anos = () => [...new Set(E.reun.map(r => r.data.slice(0, 4)))].sort().reverse();
const encAbertos = () => E.reun.flatMap(r => (r.encaminhamentos || []).filter(e => e.situacao !== 'Concluído').map(e => ({ ...e, r })));

/** Meses desde INICIO até o atual, com a situação de cada um. */
function meses() {
  const fim = mesAtual(), out = [];
  const comeco = [INICIO, ...E.reun.map(r => r.data.slice(0, 7))].sort()[0];
  for (let m = comeco; m <= fim && out.length < 240; m = proxMes(m)) {
    const doMes = E.reun.filter(r => r.data.startsWith(m));
    const feita = doMes.find(r => r.situacao === 'Realizada');
    const agendada = doMes.find(r => r.situacao === 'Agendada');
    const sit = feita ? 'feita' : m < fim ? 'atrasada' : agendada ? 'agendada' : 'no prazo';
    out.push({ m, sit, feita, agendada, doMes });
  }
  return out;
}
const COR_MES = { feita: 'ativo', atrasada: 'perigo', agendada: 'alerta', 'no prazo': 'neutra' };
const ROT_MES = { feita: 'feita', atrasada: 'atrasada', agendada: 'agendada', 'no prazo': 'vence no fim do mês' };

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
function dialogo(html, ligar) {
  let d = $('dlgGp');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgGp'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgGp')?.open && $('dlgGp').close();
const erroDlg = t => { const e = $('gpErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgGp')) $('dlgGp').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaGpPainel');
  const ms = meses();
  const atras = ms.filter(x => x.sit === 'atrasada');
  const atual = ms[ms.length - 1];
  const ult = realizadas().map(r => r.data).sort().pop();
  const encs = encAbertos();
  const vencidos = encs.filter(e => e.prazo && e.prazo < hoje());
  const rep = realizadas().sort((a, b) => b.data.localeCompare(a.data))[0]?.representante || E.reun[0]?.representante || '';
  const cartao = (cor, rot, val, dica, alvo) => `<button type="button" class="pv-card pv-${cor}" ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></button>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Reunião mensal GRASP', `${FORM.codigo} · reunião com o representante dos trabalhadores · cobrada todo mês desde ${rotMes(INICIO)}`,
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="gpAgendar">Agendar</button><button class="btn principal" type="button" id="gpNova">Lançar reunião</button></div>`)}
    ${atras.length ? `<div class="aviso erro" style="margin-top:12px"><b>${atras.length} ${atras.length > 1 ? 'meses' : 'mês'} sem reunião:</b> ${atras.map(x => rotMes(x.m)).join(', ')}.
      Faça a reunião deste mês e lance com a data real — não lance reunião com data passada que não aconteceu. Na ata, registre que os meses anteriores ficaram sem reunião e o motivo.</div>` : ''}
    <div class="pv-cards" style="margin-top:12px">
      ${cartao(atras.length ? 'perigo' : 'calma', 'Meses atrasados', atras.length, atras.length ? `desde ${rotMes(atras[0].m)}` : 'todos em dia')}
      ${cartao(atual.sit === 'feita' ? 'calma' : atual.sit === 'agendada' ? 'alerta' : 'atencao', `Reunião de ${rotMes(atual.m)}`, ROT_MES[atual.sit],
        atual.feita ? `em ${br(atual.feita.data)}` : atual.agendada ? `para ${br(atual.agendada.data)}` : 'agende com o representante', 'gpReunioes')}
      ${cartao('calma', 'Última realizada', ult ? br(ult) : '—', `${realizadas().length} reunião(ões) lançada(s)`, 'gpReunioes')}
      ${cartao(vencidos.length ? 'alerta' : 'calma', 'Encaminhamentos abertos', encs.length, vencidos.length ? `${vencidos.length} com prazo vencido` : 'nenhum vencido')}
      ${cartao(rep ? 'calma' : 'atencao', 'Representante', rep ? esc(rep.split(' ').slice(0, 2).join(' ')) : '—', rep ? 'da última reunião' : 'informe na primeira reunião')}
    </div>
    <div class="qp-bloco"><h3>Mês a mês</h3>
      <div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Mês</th><th class="ce">Situação</th><th class="ce">Data</th><th>Representante</th><th class="ce">Presentes</th><th class="ce">Ata assinada</th><th></th></tr></thead><tbody>
      ${ms.slice().reverse().map(x => { const r = x.feita || x.agendada;
        return `<tr><td><b>${esc(mesLongo(x.m))}</b></td><td class="ce">${tag(ROT_MES[x.sit], COR_MES[x.sit])}</td><td class="ce">${r ? br(r.data) : '—'}</td>
        <td>${esc(r?.representante || '')}</td><td class="ce">${r ? nPresentes(r) || '—' : '—'}</td>
        <td class="ce">${x.feita ? (E.arq.has(String(x.feita.id)) ? '📎 anexada' : tag('anexar', 'alerta')) : '—'}</td>
        <td class="ce">${r ? `<button class="btn mini" type="button" data-ed="${esc(r.id)}">Abrir</button>` : x.sit === 'no prazo' ? '<button class="btn mini" type="button" data-agendar>Agendar</button>' : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    ${encs.length ? `<div class="qp-bloco"><h3>Encaminhamentos em aberto</h3>
      <table class="dc-planilha"><thead><tr><th class="ce">Reunião</th><th>Ação</th><th>Responsável</th><th class="ce">Prazo</th><th class="ce">Situação</th></tr></thead><tbody>
      ${encs.sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9')).map(e => `<tr><td class="ce">${br(e.r.data)}</td><td>${esc(e.acao)}</td><td>${esc(e.responsavel || '')}</td>
        <td class="ce">${e.prazo ? br(e.prazo) + (e.prazo < hoje() ? '<br>' + tag('vencido', 'perigo') : '') : '—'}</td><td class="ce">${tag(e.situacao || 'Aberto', e.situacao === 'Em andamento' ? 'alerta' : 'neutra')}</td></tr>`).join('')}
      </tbody></table><p class="dica" style="margin:6px 0 0">Reclamação que vira problema real vai também para Não conformidades (FORM 004) ou Reclamações e sugestões (FORM 042).</p></div>` : ''}
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="gpBranco">Imprimir ata em branco</button>
    <button class="btn" type="button" id="gpImpPainel">Imprimir o painel</button>
    <button class="btn" type="button" id="gpXlsx">Excel</button>
  </div>`;
  $('gpNova').addEventListener('click', () => formReuniao(null, { situacao: 'Realizada' }));
  $('gpAgendar').addEventListener('click', () => formReuniao(null, { situacao: 'Agendada' }));
  tela.querySelectorAll('[data-agendar]').forEach(b => b.addEventListener('click', () => formReuniao(null, { situacao: 'Agendada' })));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formReuniao(E.reun.find(r => r.id === b.dataset.ed))));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => abrirModulo('cert', b.dataset.ir)));
  $('gpBranco').addEventListener('click', () => mostrar(docAta(null), { barra: true }));
  $('gpImpPainel').addEventListener('click', () => mostrar(docPainel(ms, encs), { barra: true }));
  $('gpXlsx').addEventListener('click', exportar);
}
const nPresentes = r => (r.participantes || []).length + linhas(r.outros).length;

/* ===================================================================
   TELA · REUNIÕES
   =================================================================== */
function desenharReunioes() {
  const tela = $('telaGpReunioes');
  const l = E.reun.filter(r => (!E.fl.ano || r.data.startsWith(E.fl.ano)) && (!E.fl.sit || r.situacao === E.fl.sit)).sort((a, b) => b.data.localeCompare(a.data));
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Reuniões GRASP', 'Uma linha por reunião, com a data real. Agendada imprime a ata e a lista de presença em branco; depois da reunião, abra, marque Realizada e anexe a ata assinada.',
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="grAgendar">Agendar</button><button class="btn principal" type="button" id="grNova">Lançar reunião</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Ano <select id="grAno">${opcoes(anos(), E.fl.ano, 'Todos')}</select></label>
      <label class="campo">Situação <select id="grSit">${opcoes(SITUACOES, E.fl.sit, 'Todas')}</select></label>
    </div>
    <div style="margin-top:12px">${l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th class="ce">Tipo</th><th class="ce">Situação</th><th>Representante</th><th class="ce">Presentes</th><th>Pauta</th><th class="ce">Ata</th><th></th></tr></thead><tbody>
      ${l.map(r => `<tr><td class="ce">${br(r.data)}${r.horario ? `<br><small class="dica">${esc(r.horario)}</small>` : ''}</td><td class="ce">${esc(r.tipo)}</td><td class="ce">${tag(r.situacao, COR_SIT[r.situacao])}</td>
        <td>${esc(r.representante || '')}</td><td class="ce">${nPresentes(r) || '—'}</td><td><small>${esc(linhas(r.pauta).slice(0, 2).join(' · '))}</small></td>
        <td class="ce">${E.arq.has(String(r.id)) ? '📎' : r.situacao === 'Realizada' ? tag('anexar', 'alerta') : ''}</td>
        <td class="ce"><button class="btn mini" type="button" data-ed="${esc(r.id)}">Abrir</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma reunião lançada.</div>'}</div>
  </div>`;
  $('grAno').addEventListener('change', e => { E.fl.ano = e.target.value; desenharReunioes(); });
  $('grSit').addEventListener('change', e => { E.fl.sit = e.target.value; desenharReunioes(); });
  $('grNova').addEventListener('click', () => formReuniao(null, { situacao: 'Realizada' }));
  $('grAgendar').addEventListener('click', () => formReuniao(null, { situacao: 'Agendada' }));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formReuniao(E.reun.find(r => r.id === b.dataset.ed))));
}

/* ===================================================================
   FORMULÁRIO DA REUNIÃO
   =================================================================== */
let anexos = null;
function formReuniao(r, pre = {}) {
  const ant = E.reun.slice().sort((a, b) => b.data.localeCompare(a.data))[0];
  const v = r || { data: hoje(), horario: '', local: ant?.local || '', tipo: 'Ordinária', situacao: pre.situacao || 'Realizada',
    fazenda_id: '', representante_id: ant?.representante_id || null, representante: ant?.representante || '', conduzida_por: ant?.conduzida_por || '',
    participantes: [], outros: '', pauta: PAUTA_PADRAO, assuntos: '', reclamacoes: '', encaminhamentos: [], observacao: '' };
  const fs = funcionarios();
  const marcados = new Set((v.participantes || []).map(p => String(p.id)));
  const encs = (v.encaminhamentos || []).map(e => ({ ...e }));
  const linhaEnc = (e, i) => `<tr data-i="${i}"><td><input type="text" data-k="acao" value="${esc(e.acao || '')}" placeholder="O que fazer"></td>
    <td><input type="text" data-k="responsavel" value="${esc(e.responsavel || '')}"></td><td><input type="date" data-k="prazo" value="${esc(e.prazo || '')}"></td>
    <td><select data-k="situacao">${opcoes(SIT_ENC, e.situacao || 'Aberto')}</select></td><td class="ce"><button class="btn mini" type="button" data-tira="${i}">✕</button></td></tr>`;
  dialogo(`<h3>${r ? 'Reunião GRASP' : pre.situacao === 'Agendada' ? 'Agendar reunião GRASP' : 'Lançar reunião GRASP'} <small class="dica">${FORM.codigo}</small></h3>
    <div class="aviso erro" id="gpErro" hidden></div>
    <div class="grade">
      <label class="campo">Data <input type="date" id="gfData" value="${esc(v.data)}"></label>
      <label class="campo">Horário <input type="text" id="gfHora" value="${esc(v.horario || '')}" placeholder="07:00"></label>
      <label class="campo">Situação <select id="gfSit">${opcoes(SITUACOES, v.situacao)}</select></label>
      <label class="campo">Tipo <select id="gfTipo">${opcoes(['Ordinária', 'Extraordinária'], v.tipo)}</select></label>
      <label class="campo">Local <input type="text" id="gfLocal" value="${esc(v.local || '')}" placeholder="Refeitório, escritório…"></label>
      <label class="campo">Fazenda <select id="gfFaz">${opcoes(E.faz.map(f => [f.id, f.nome]), v.fazenda_id, 'Todas / geral')}</select></label>
      <label class="campo">Representante dos trabalhadores <input type="text" id="gfRep" value="${esc(v.representante || '')}" list="gfFuncs" placeholder="Nome do representante eleito"></label>
      <label class="campo">Conduzida pela empresa por <input type="text" id="gfCond" value="${esc(v.conduzida_por || '')}"></label>
    </div>
    <datalist id="gfFuncs">${fs.map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist>
    <details ${v.situacao === 'Agendada' && !marcados.size ? '' : 'open'} style="margin-top:10px"><summary><b>Participantes</b> <span class="dica" id="gfConta"></span></summary>
      <div class="barra" style="margin:6px 0"><input type="search" id="gfBusca" placeholder="Buscar funcionário" style="flex:1">
        <button class="btn mini" type="button" id="gfTodos">Marcar todos os ativos</button><button class="btn mini" type="button" id="gfNenhum">Limpar</button></div>
      <div id="gfLista" style="max-height:220px;overflow:auto;border:1px solid var(--linha);border-radius:8px;padding:6px 8px">
        ${fs.length ? fs.map(f => `<label class="item" data-nome="${esc(String(f.nome).toLowerCase())}" style="display:flex;gap:8px;align-items:center;padding:2px 0">
          <input type="checkbox" data-pid="${esc(f.id)}" ${marcados.has(String(f.id)) ? 'checked' : ''}> <span>${esc(f.nome)} <small class="dica">${esc(f.cargo || '')}</small></span></label>`).join('')
          : '<p class="dica">O cadastro de funcionários não está neste aparelho. Use "Outros participantes".</p>'}
      </div>
      <label class="campo">Outros participantes <span class="dc-sem">(um por linha: empregador, consultor, visitante)</span><textarea id="gfOutros" rows="2">${esc(v.outros || '')}</textarea></label>
    </details>
    <label class="campo">Pauta <span class="dc-sem">(um item por linha)</span><textarea id="gfPauta" rows="4">${esc(v.pauta || '')}</textarea></label>
    <label class="campo">Assuntos tratados <textarea id="gfAssuntos" rows="4">${esc(v.assuntos || '')}</textarea></label>
    <label class="campo">Reclamações e sugestões trazidas pelos trabalhadores <textarea id="gfRecl" rows="3" placeholder="Se não houve, escreva: nenhuma reclamação apresentada">${esc(v.reclamacoes || '')}</textarea></label>
    <div class="qp-bloco"><h3 style="margin:0 0 6px">Encaminhamentos</h3>
      <table class="dc-planilha"><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody id="gfEncs"></tbody></table>
      <button class="btn mini" type="button" id="gfMaisEnc" style="margin-top:6px">＋ Encaminhamento</button></div>
    <label class="campo">Observação <textarea id="gfObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div id="gfAnx" style="margin-top:8px"></div>
    <div class="barra entre">
      <div>${r ? '<button class="btn perigo" type="button" id="gfApagar">Apagar</button> ' : ''}<button class="btn" type="button" id="gfImp">Imprimir ata e lista</button></div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="gfOk">Salvar</button></div>
    </div>`, d => {
    const conta = () => { $('gfConta').textContent = `· ${d.querySelectorAll('#gfLista input:checked').length} marcado(s)`; };
    d.querySelectorAll('#gfLista input').forEach(x => x.addEventListener('change', conta)); conta();
    $('gfBusca').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase();
      d.querySelectorAll('#gfLista [data-nome]').forEach(x => { x.style.display = !q || x.dataset.nome.includes(q) ? '' : 'none'; }); });
    $('gfTodos').addEventListener('click', () => { d.querySelectorAll('#gfLista input').forEach(x => { x.checked = true; }); conta(); });
    $('gfNenhum').addEventListener('click', () => { d.querySelectorAll('#gfLista input').forEach(x => { x.checked = false; }); conta(); });
    const lerEncs = () => [...$('gfEncs').querySelectorAll('tr')].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(x => [x.dataset.k, so(x.value)])));
    const desenharEncs = () => { $('gfEncs').innerHTML = encs.length ? encs.map(linhaEnc).join('') : '<tr><td colspan="5" class="dica">Nenhum encaminhamento.</td></tr>';
      $('gfEncs').querySelectorAll('[data-tira]').forEach(b => b.addEventListener('click', () => { encs.splice(0, encs.length, ...lerEncs()); encs.splice(Number(b.dataset.tira), 1); desenharEncs(); })); };
    desenharEncs();
    $('gfMaisEnc').addEventListener('click', () => { encs.splice(0, encs.length, ...(encs.length ? lerEncs() : [])); encs.push({ situacao: 'Aberto' }); desenharEncs(); });
    anexos = campoAnexos($('gfAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: 'Ata e lista de presença assinadas', dica: 'PDF ou foto — evidência do RG 044' });
    anexos.abrir(r ? r.id : null);
    const ler = () => {
      const marc = new Set([...d.querySelectorAll('#gfLista input:checked')].map(x => x.dataset.pid));
      const part = fs.filter(f => marc.has(String(f.id))).map(f => ({ id: f.id, nome: f.nome, funcao: f.cargo || '' }));
      // quem estava marcado mas saiu do cadastro de ativos continua na ata
      for (const p of v.participantes || []) if (!fs.some(f => String(f.id) === String(p.id))) part.push(p);
      const repNome = so($('gfRep').value); const repF = fs.find(f => f.nome === repNome);
      return { data: $('gfData').value, horario: so($('gfHora').value) || null, situacao: $('gfSit').value, tipo: $('gfTipo').value,
        local: so($('gfLocal').value) || null, fazenda_id: $('gfFaz').value || null, representante: repNome || null,
        representante_id: repF ? repF.id : (repNome === v.representante ? v.representante_id : null), conduzida_por: so($('gfCond').value) || null,
        participantes: part, outros: so($('gfOutros').value) || null, pauta: so($('gfPauta').value) || null, assuntos: so($('gfAssuntos').value) || null,
        reclamacoes: so($('gfRecl').value) || null, encaminhamentos: (encs.length ? lerEncs() : []).filter(e => e.acao).map(e => ({ ...e, prazo: e.prazo || null })),
        observacao: so($('gfObs').value) || null };
    };
    $('gfImp').addEventListener('click', () => { fechar(); mostrar(docAta({ ...v, ...ler(), id: r?.id }), { barra: true }); });
    $('gfApagar')?.addEventListener('click', () => confirmarApagar(r));
    $('gfOk').addEventListener('click', async () => {
      const l = ler();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return erroDlg('Informe a data da reunião.');
      if (l.situacao === 'Realizada' && l.data > hoje()) return erroDlg('Reunião com data no futuro fica como <b>Agendada</b>.');
      if (l.situacao === 'Agendada' && l.data < hoje()) return erroDlg('A data já passou: se a reunião aconteceu, marque <b>Realizada</b>; se não, <b>Cancelada</b>.');
      if (l.situacao === 'Realizada') {
        if (!l.representante) return erroDlg('Informe o representante dos trabalhadores.');
        if (!nPresentes(l)) return erroDlg('Marque quem participou.');
        if (!l.assuntos) return erroDlg('Descreva os assuntos tratados.');
      }
      if (precisaRede()) return;
      $('gfOk').disabled = true;
      try {
        const t = estado.cliente.from('cg_reunioes');
        const { data, error } = r ? await t.update({ ...l, atualizado_por: quem() }).eq('id', r.id).select().single()
          : await t.insert({ id: novoId(), ...l, criado_por: quem() }).select().single();
        if (error) throw error;
        const i = E.reun.findIndex(x => x.id === data.id); if (i >= 0) E.reun[i] = data; else E.reun.unshift(data);
        E.reun.sort((a, b) => b.data.localeCompare(a.data));
        salvarCaixa();
        if (anexos?.mudou) { await anexos.salvar(data.id); E.arq.add(String(data.id)); }
        if (data.situacao === 'Realizada') await marcarCronograma(data.data);
        fechar(); redesenhar();
      } catch (e) { $('gfOk').disabled = false; erroDlg('Não consegui gravar: ' + esc(e.message || e)); }
    });
  });
}
function confirmarApagar(r) {
  dialogo(`<h3>Apagar reunião</h3><p>${br(r.data)} · ${esc(r.situacao)}</p><div class="aviso erro" id="gpErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn perigo" type="button" id="gpApOk">Apagar</button></div>`, () => {
    $('gpApOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('gpApOk').disabled = true;
      const { error } = await estado.cliente.from('cg_reunioes').delete().eq('id', r.id);
      if (error) { $('gpApOk').disabled = false; return erroDlg('Não consegui apagar: ' + esc(error.message)); }
      E.reun = E.reun.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
  });
}
/** Dá como feita, no Cronograma, a ocorrência do evento FORM 044 no mês da reunião. */
async function marcarCronograma(dataReuniao) {
  const ev = E.ev; if (!ev?.repetir) return;
  const m = dataReuniao.slice(0, 7);
  const dia = Math.min(Number(ev.data.slice(8, 10)), new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate());
  const ocorr = `${m}-${doisD(dia)}`;
  if (ocorr < ev.data || (ev.feitos || []).includes(ocorr)) return;
  const feitos = [...(ev.feitos || []), ocorr].sort();
  const { data, error } = await estado.cliente.from('cert_eventos').update({ feitos }).eq('id', ev.id).select().single();
  if (!error && data) { E.ev = data; salvarCaixa(); }
}

/* ===================================================================
   IMPRESSOS E EXCEL
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo }) {
  return `<article class="rel">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div></header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
const fichaForm = extra => `<div class="rel-ficha"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
  <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div>${extra || ''}</div>`;
const caixa = (txt, alt = 3) => txt ? `<div style="border:1px solid #C9CCC3;border-radius:4px;padding:6px 8px;font-size:11px">${paragrafos(txt)}</div>`
  : `<div style="border:1px solid #C9CCC3;border-radius:4px;height:${alt * 18}px;background:repeating-linear-gradient(transparent 0 17px,#E2E4DE 17px 18px)"></div>`;
/** Ata + lista de presença. Sem reunião (r = null) ou Agendada: campos em branco para preencher à mão. */
function docAta(r) {
  const branco = !r || r.situacao !== 'Realizada';
  const pres = r ? [...(r.participantes || []).map(p => [p.nome, p.funcao]), ...linhas(r.outros).map(n => [n, ''])] : [];
  const total = Math.max(pres.length + (branco ? 4 : 0), 15);
  const vazias = Array.from({ length: total - pres.length }, () => ['', '']);
  const enc = (r?.encaminhamentos || []);
  return documento({ titulo: FORM.titulo, subtitulo: 'Reunião com o representante dos trabalhadores · GLOBALG.A.P. GRASP', canto: FORM.codigo, corpo: `
    ${fichaForm()}
    <div class="rel-ficha" style="margin-top:6px">
      <div><span>Data</span><b>${r?.data ? br(r.data) : '____/____/______'}</b></div>
      <div><span>Horário</span><b>${esc(r?.horario || '______')}</b></div>
      <div><span>Tipo</span><b>${esc(r?.tipo || 'Ordinária ( )  Extraordinária ( )')}</b></div>
      <div><span>Local</span><b>${esc(r?.local || '')}${r?.fazenda_id ? ' · ' + esc(nomeFaz(r.fazenda_id)) : ''}</b></div>
      <div><span>Representante dos trabalhadores</span><b>${esc(r?.representante || '')}</b></div>
      <div><span>Conduzida pela empresa por</span><b>${esc(r?.conduzida_por || '')}</b></div>
    </div>
    <p class="rel-secao">1. Pauta</p>${caixa(r?.pauta || (r ? '' : PAUTA_PADRAO), 4)}
    <p class="rel-secao">2. Assuntos tratados</p>${caixa(branco ? '' : r.assuntos, 6)}
    <p class="rel-secao">3. Reclamações e sugestões dos trabalhadores</p>${caixa(branco ? '' : r.reclamacoes, 3)}
    <p class="rel-secao">4. Encaminhamentos</p>
    <table class="rel-tabela"><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
      ${enc.length ? enc.map(e => `<tr><td>${esc(e.acao)}</td><td>${esc(e.responsavel || '')}</td><td>${e.prazo ? br(e.prazo) : ''}</td><td>${esc(e.situacao || 'Aberto')}</td></tr>`).join('')
        : Array.from({ length: 3 }, () => '<tr><td style="height:20px"></td><td></td><td></td><td></td></tr>').join('')}
    </tbody></table>
    ${r?.observacao && !branco ? `<p class="rel-secao">Observação</p>${caixa(r.observacao)}` : ''}
    <div class="rel-assinaturas"><div class="rel-assina"><span></span><small>${esc(r?.representante || 'Representante dos trabalhadores')}<br>Representante dos trabalhadores</small></div>
      <div class="rel-assina"><span></span><small>${esc(r?.conduzida_por || 'Responsável pela empresa')}<br>Pela empresa</small></div></div>
    <p class="rel-secao" style="page-break-before:always">5. Lista de presença</p>
    <p class="rel-nota" style="margin:0 0 6px">Reunião GRASP de ${r?.data ? br(r.data) : '____/____/______'} · assinatura de próprio punho de cada participante.</p>
    <table class="rel-tabela"><thead><tr><th style="width:5%">Nº</th><th style="width:42%">Nome</th><th style="width:23%">Função</th><th>Assinatura</th></tr></thead><tbody>
      ${[...pres, ...vazias].map(([n, f], i) => `<tr><td>${i + 1}</td><td style="height:24px">${esc(n)}</td><td>${esc(f)}</td><td></td></tr>`).join('')}
    </tbody></table>` });
}
function docPainel(ms, encs) {
  return documento({ titulo: 'Reunião mensal GRASP — situação', subtitulo: `${rotMes(ms[0].m)} a ${rotMes(ms[ms.length - 1].m)}`, canto: FORM.codigo, corpo: `
    <table class="rel-tabela"><thead><tr><th>Mês</th><th>Situação</th><th>Data</th><th>Representante</th><th>Presentes</th><th>Ata assinada</th></tr></thead><tbody>
      ${ms.map(x => { const r = x.feita || x.agendada; return `<tr><td>${esc(mesLongo(x.m))}</td><td class="${x.sit === 'atrasada' ? 'rel-pend' : ''}">${esc(ROT_MES[x.sit])}</td>
        <td>${r ? br(r.data) : '—'}</td><td>${esc(r?.representante || '')}</td><td class="rel-num">${r ? nPresentes(r) : ''}</td><td>${x.feita ? (E.arq.has(String(x.feita.id)) ? 'anexada' : 'falta anexar') : ''}</td></tr>`; }).join('')}
    </tbody></table>
    ${encs.length ? `<p class="rel-secao">Encaminhamentos em aberto</p><table class="rel-tabela"><thead><tr><th>Reunião</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
      ${encs.map(e => `<tr><td>${br(e.r.data)}</td><td>${esc(e.acao)}</td><td>${esc(e.responsavel || '')}</td><td class="${e.prazo && e.prazo < hoje() ? 'rel-pend' : ''}">${e.prazo ? br(e.prazo) : '—'}</td><td>${esc(e.situacao || 'Aberto')}</td></tr>`).join('')}</tbody></table>` : ''}` });
}
async function exportar() {
  const sub = `SAKUMA Agronegócios · emitido em ${br(hoje())}`;
  const l = E.reun.slice().sort((a, b) => a.data.localeCompare(b.data));
  await baixarXlsx(`reunioes-grasp-${hoje()}.xlsx`, [
    { nome: 'Reuniões', titulo: `${FORM.codigo} — Reuniões GRASP`, subtitulo: sub,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Horário', larg: 9 }, { rot: 'Tipo', larg: 14 }, { rot: 'Situação', larg: 12 }, { rot: 'Local', larg: 20 },
        { rot: 'Representante', larg: 28 }, { rot: 'Conduzida por', larg: 24 }, { rot: 'Presentes', larg: 10, tipo: 'num', casas: 0 }, { rot: 'Participantes', larg: 60 },
        { rot: 'Pauta', larg: 50 }, { rot: 'Assuntos tratados', larg: 60 }, { rot: 'Reclamações e sugestões', larg: 50 }, { rot: 'Ata anexada', larg: 10 }, { rot: 'Observação', larg: 36 }],
      linhas: l.map(r => [r.data, r.horario || '', r.tipo, r.situacao, r.local || '', r.representante || '', r.conduzida_por || '', nPresentes(r),
        [...(r.participantes || []).map(p => p.nome), ...linhas(r.outros)].join('; '), linhas(r.pauta).join('; '), r.assuntos || '', r.reclamacoes || '',
        E.arq.has(String(r.id)) ? 'Sim' : 'Não', r.observacao || '']) },
    { nome: 'Encaminhamentos', titulo: `${FORM.codigo} — Encaminhamentos`, subtitulo: sub,
      colunas: [{ rot: 'Reunião', larg: 12, tipo: 'data' }, { rot: 'Ação', larg: 60 }, { rot: 'Responsável', larg: 24 }, { rot: 'Prazo', larg: 12, tipo: 'data' }, { rot: 'Situação', larg: 14 }],
      linhas: l.flatMap(r => (r.encaminhamentos || []).map(e => [r.data, e.acao, e.responsavel || '', e.prazo || '', e.situacao || 'Aberto'])) },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_GRASP = ['gpPainel', 'gpReunioes'];
const DESENHO = { gpPainel: desenharPainel, gpReunioes: desenharReunioes };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirGrasp(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando as reuniões GRASP…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir as reuniões GRASP: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgGp')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparGrasp() {
  E.carregado = false; E.reun = []; E.faz = []; E.arq = new Set(); E.ev = null;
  Object.assign(E.fl, { ano: '', sit: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cg = { E, meses };
