// cert-lavagem.js — Certificação › FORMS Digital › Higienização dos EPIs (FORM 007), 28/10/2026.
//
// Pedido do Guilherme: "vamos criar esse form, e também deixar para imprimir
// selecionando o funcionário". Veio da planilha "RG 29 - Registro de Lavagem de
// EPI" (código antigo da lista de registros; hoje é o FORM 007 / RG 007).
//
// A planilha é uma folha por colaborador e por ano: meses nas linhas, dias 1 a
// 31 nas colunas, e em cada dia que houve lavagem o número do conjunto lavado
// (1 ou 2 = conjunto de aplicação APL 01 / APL 02). No alto o C.A de cada
// conjunto; à direita assinatura, data do fornecimento e data da troca do EPI.
//
// No app:
//  · Painel — lavagens do mês por aplicador e "Lançar lavagem" para vários de
//    uma vez (depois da pulverização costuma lavar a turma toda).
//  · Ficha por funcionário — escolhe a pessoa e o ano; a grade é a da planilha
//    e cada toque no dia troca vazio → 1 → 2 → 1·2 → vazio (grava na hora).
//    Conjuntos APL 01/02 com C.A, fornecimento e troca. Imprime a ficha com as
//    lavagens lançadas ou em branco, só com o cabeçalho preenchido, para
//    pendurar e marcar à mão.
//
// Tabelas cl_conjuntos e cl_lavagens (supabase/cert-lavagem-epi.sql),
// abertas para quem tem 'cert' ou 'sst'. Ficha assinada escaneada: Drive
// certificacao/evidencia/lav-<funcionário>-<ano>/…

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { campoAnexos } from './arquivos.js';
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
const diasNoMes = (a, m) => new Date(a, m, 0).getDate();   // m = 1..12

const FORM = { codigo: 'FORM 007', titulo: 'Registro de higienização (lavagem) dos EPIs', data: '01/12/2026', nrev: '02',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
/** Textos da planilha, como estavam. */
const INSTRUCAO = 'Marcar a cada lavagem o número do EPI (conjunto 1 ou 2) no dia em que aconteceu.';
const ORIENTACAO = 'Informar o nº do EPI usado no dia e mês em que aconteceu a lavagem, e assim sucessivamente. Realizar sempre a lavagem após o dia de pulverização.';
const RECOMENDACAO = 'Seguir as orientações do fabricante; caso não possua, recomenda-se: usar luvas à base de nitrila; a lavagem deve ser feita preferencialmente com sabão neutro e as vestimentas não devem ficar de molho; os EPIs devem ser enxaguados com água corrente para diluir e remover os resíduos da pulverização e o sabão utilizado; devem ser secados à sombra; após a aplicação e a lavagem dos EPIs, o colaborador deverá tomar banho em água fria e em seguida vestir roupas limpas.';

/* ---------------- estado ---------------- */
const E = { carregado: false, lav: [], conj: [], caPadrao: '', fl: { mes: hoje().slice(0, 7), func: '', ano: Number(hoje().slice(0, 4)) } };
const CAIXA = 'lavagem-epi.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { lav: E.lav, conj: E.conj, caPadrao: E.caPadrao });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { lav: c0.lav || [], conj: c0.conj || [], caPadrao: c0.caPadrao || '' }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia das lavagens neste aparelho.');
  }
  const [l, k, ep] = await Promise.all([
    c.from('cl_lavagens').select('id, funcionario_id, data, conjunto, observacao').order('data', { ascending: false }),
    c.from('cl_conjuntos').select('*').order('fornecido_em', { ascending: false, nullsFirst: false }),
    c.from('epis').select('descricao, ca').ilike('descricao', 'CONJ%APLICA%').eq('ativo', true).limit(1),
  ]);
  if (l.error && E.carregado) return;
  if (l.error) {
    if (/cl_|relation|does not exist|schema cache/i.test(l.error.message || '')) throw new Error('As tabelas da lavagem de EPI ainda não foram criadas no banco (supabase/cert-lavagem-epi.sql).');
    throw l.error;
  }
  E.lav = l.data || [];
  if (!k.error) E.conj = k.data || [];
  if (!ep.error) E.caPadrao = so((ep.data || [])[0]?.ca);
  E.carregado = true;
  salvarCaixa();
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');
const func = id => (estado.funcionarios || []).find(f => String(f.id) === String(id)) || null;
const nomeDe = id => func(id)?.nome || '(funcionário fora do cadastro)';
/** Aplicadores: quem tem conjunto entregue ou alguma lavagem lançada. */
const idsAplicadores = () => new Set([...E.conj.map(c => String(c.funcionario_id)), ...E.lav.map(l => String(l.funcionario_id))]);
function listaFuncs() {
  const apl = idsAplicadores();
  const ativos = (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO' || apl.has(String(f.id)));
  return { aplic: ativos.filter(f => apl.has(String(f.id))).sort(porNome), outros: ativos.filter(f => !apl.has(String(f.id))).sort(porNome) };
}
const lavDe = (fid, prefixo) => E.lav.filter(l => String(l.funcionario_id) === String(fid) && l.data.startsWith(prefixo));
/** Conjuntos do funcionário, o mais novo primeiro. */
const conjDe = fid => E.conj.filter(c => String(c.funcionario_id) === String(fid))
  .sort((a, b) => so(b.fornecido_em || '0').localeCompare(so(a.fornecido_em || '0')));
/** Conjunto nº n em uso no ano (o último fornecido até o fim do ano e não trocado antes do começo). */
function conjNoAno(fid, n, ano) {
  return conjDe(fid).find(c => c.numero === n && (!c.fornecido_em || c.fornecido_em <= `${ano}-12-31`) && (!c.trocado_em || c.trocado_em >= `${ano}-01-01`)) || null;
}
/** { 'aaaa-mm-dd': Set(1,2) } */
function mapaDias(fid, ano) {
  const m = {};
  for (const l of lavDe(fid, String(ano))) (m[l.data] ||= new Set()).add(l.conjunto);
  return m;
}
const rotDia = s => !s || !s.size ? '' : [...s].sort().join('·');
/** Fornecimentos e trocas do mês (para as colunas da direita). */
function eventosMes(fid, ano, mes) {
  const pre = `${ano}-${doisD(mes)}`;
  const cs = conjDe(fid).slice().reverse();
  const forn = cs.filter(c => so(c.fornecido_em).startsWith(pre)).map(c => `${br(c.fornecido_em).slice(0, 5)} (${c.numero})`);
  const troc = cs.filter(c => so(c.trocado_em).startsWith(pre)).map(c => `${br(c.trocado_em).slice(0, 5)} (${c.numero})`);
  return { forn: forn.join(' '), troc: troc.join(' ') };
}

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
function opcoesFuncs(val) {
  const { aplic, outros } = listaFuncs();
  const op = f => `<option value="${esc(f.id)}" ${String(f.id) === String(val) ? 'selected' : ''}>${esc(f.nome)}${f.cargo ? ' · ' + esc(f.cargo) : ''}</option>`;
  return `<option value="">Escolha o funcionário</option>${aplic.length ? `<optgroup label="Aplicadores (com conjunto ou lavagem)">${aplic.map(op).join('')}</optgroup>` : ''}
    <optgroup label="${aplic.length ? 'Demais funcionários ativos' : 'Funcionários ativos'}">${outros.map(op).join('')}</optgroup>`;
}
function dialogo(html, ligar) {
  let d = $('dlgLv');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgLv'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgLv')?.open && $('dlgLv').close();
const erroDlg = t => { const e = $('lvErro'); if (e) { e.innerHTML = t; e.hidden = false; } };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaLvPainel');
  const m = E.fl.mes;
  const [a, mm] = m.split('-').map(Number);
  const doMes = E.lav.filter(l => l.data.startsWith(m));
  const apl = [...idsAplicadores()].map(id => func(id) || { id, nome: nomeDe(id) }).sort(porNome);
  const linhas = apl.map(f => {
    const ls = doMes.filter(l => String(l.funcionario_id) === String(f.id));
    const dias = [...new Set(ls.map(l => l.data))].sort();
    const ult = E.lav.filter(l => String(l.funcionario_id) === String(f.id)).map(l => l.data).sort().pop();
    const c1 = conjNoAno(f.id, 1, a), c2 = conjNoAno(f.id, 2, a);
    return { f, dias, ult, c1, c2 };
  });
  const semLav = linhas.filter(x => !x.dias.length && x.f.situacao === 'ATIVO');
  const cartao = (cor, rot, val, dica) => `<div class="pv-card pv-${cor}"><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></div>`;
  const meses = [...new Set([hoje().slice(0, 7), ...E.lav.map(l => l.data.slice(0, 7))])].sort().reverse();
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Higienização dos EPIs', `${FORM.codigo} · lavagem dos conjuntos de aplicação (APL 01 / APL 02) · sempre depois do dia de pulverização`,
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="lvAbrirFicha">Ficha por funcionário</button><button class="btn principal" type="button" id="lvLancar">Lançar lavagem</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Mês <select id="lvMes">${opcoes(meses.map(x => [x, `${MES[Number(x.slice(5, 7)) - 1]} de ${x.slice(0, 4)}`]), m)}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Lavagens no mês', doMes.length, `${new Set(doMes.map(l => l.data)).size} dia(s) com lavagem`)}
      ${cartao('calma', 'Aplicadores', apl.length, 'com conjunto ou lavagem lançada')}
      ${cartao(semLav.length ? 'atencao' : 'calma', 'Sem lavagem no mês', semLav.length, semLav.length ? 'confira se pulverizaram' : 'todos com registro')}
    </div>
    <div class="qp-bloco"><h3>Aplicadores em ${esc(MES[mm - 1].toLowerCase())} de ${a}</h3>
      ${linhas.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Função</th><th class="ce">C.A APL 01</th><th class="ce">C.A APL 02</th><th class="ce">Dias com lavagem</th><th>Dias</th><th class="ce">Última lavagem</th><th></th></tr></thead><tbody>
      ${linhas.map(x => `<tr><td><b>${esc(x.f.nome)}</b>${x.f.situacao && x.f.situacao !== 'ATIVO' ? ' ' + tag('inativo', 'neutra') : ''}</td><td>${esc(x.f.cargo || '')}</td>
        <td class="ce">${esc(x.c1?.ca || '—')}</td><td class="ce">${esc(x.c2?.ca || '—')}</td>
        <td class="ce">${x.dias.length ? `<b>${x.dias.length}</b>` : tag('nenhum', 'alerta')}</td><td><small>${x.dias.map(d => d.slice(8, 10)).join(', ')}</small></td>
        <td class="ce">${x.ult ? br(x.ult) : '—'}</td>
        <td class="ce"><button class="btn mini" type="button" data-ficha="${esc(x.f.id)}">Ficha</button></td></tr>`).join('')}
      </tbody></table></div>`
      : '<div class="vazio">Nenhum aplicador ainda. Toque em <b>Lançar lavagem</b> ou abra a <b>Ficha por funcionário</b> e cadastre o conjunto de aplicação.</div>'}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="lvImpTodos">Imprimir fichas dos aplicadores</button>
    <button class="btn" type="button" id="lvImpBrancoTodos">Fichas em branco dos aplicadores</button>
    <button class="btn" type="button" id="lvXlsx">Excel</button>
  </div>`;
  $('lvMes').addEventListener('change', e => { E.fl.mes = e.target.value; desenharPainel(); });
  $('lvLancar').addEventListener('click', () => formLavagem());
  $('lvAbrirFicha').addEventListener('click', () => irFicha(''));
  tela.querySelectorAll('[data-ficha]').forEach(b => b.addEventListener('click', () => irFicha(b.dataset.ficha)));
  const ids = apl.filter(f => f.situacao === 'ATIVO').map(f => f.id);
  $('lvImpTodos').addEventListener('click', () => ids.length ? mostrar(docFichas(ids, a, false), { barra: true }) : alert('Nenhum aplicador ativo.'));
  $('lvImpBrancoTodos').addEventListener('click', () => ids.length ? mostrar(docFichas(ids, a, true), { barra: true }) : alert('Nenhum aplicador ativo.'));
  $('lvXlsx').addEventListener('click', exportar);
}
function irFicha(fid) {
  if (fid) E.fl.func = String(fid);
  abrirModulo('cert', 'lvFicha');
}

/** Lançar a lavagem do dia para um ou vários aplicadores. */
function formLavagem() {
  const { aplic, outros } = listaFuncs();
  const item = (f, marcado) => `<label class="item" data-nome="${esc(String(f.nome).toLowerCase())}" style="display:flex;gap:8px;align-items:center;padding:2px 0">
    <input type="checkbox" data-pid="${esc(f.id)}" ${marcado ? 'checked' : ''}> <span>${esc(f.nome)} <small class="dica">${esc(f.cargo || '')}</small></span></label>`;
  dialogo(`<h3>Lançar lavagem <small class="dica">${FORM.codigo}</small></h3>
    <div class="aviso erro" id="lvErro" hidden></div>
    <div class="grade">
      <label class="campo">Dia da lavagem <input type="date" id="lfData" value="${hoje()}" max="${hoje()}"></label>
      <label class="campo">Conjunto lavado <select id="lfConj">${opcoes([['1', 'APL 01'], ['2', 'APL 02'], ['12', 'Os dois (1 e 2)']], '1')}</select></label>
    </div>
    <p class="dica" style="margin:6px 0">${esc(ORIENTACAO)}</p>
    <div class="barra" style="margin:6px 0"><input type="search" id="lfBusca" placeholder="Buscar funcionário" style="flex:1">
      <button class="btn mini" type="button" id="lfApl">Marcar os aplicadores</button><button class="btn mini" type="button" id="lfNenhum">Limpar</button></div>
    <div id="lfLista" style="max-height:260px;overflow:auto;border:1px solid var(--linha);border-radius:8px;padding:6px 8px">
      ${aplic.length ? `<p class="dica" style="margin:2px 0">Aplicadores</p>${aplic.map(f => item(f, false)).join('')}<p class="dica" style="margin:8px 0 2px">Demais funcionários ativos</p>` : ''}
      ${outros.map(f => item(f, false)).join('') || '<p class="dica">O cadastro de funcionários não está neste aparelho.</p>'}
    </div>
    <label class="campo">Observação <input type="text" id="lfObs" placeholder="Opcional"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="lfOk">Gravar</button></div>`, d => {
    const aplIds = new Set(aplic.map(f => String(f.id)));
    $('lfBusca').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase();
      d.querySelectorAll('#lfLista [data-nome]').forEach(x => { x.style.display = !q || x.dataset.nome.includes(q) ? 'flex' : 'none'; }); });
    $('lfApl').addEventListener('click', () => d.querySelectorAll('#lfLista input').forEach(x => { if (aplIds.has(x.dataset.pid)) x.checked = true; }));
    $('lfNenhum').addEventListener('click', () => d.querySelectorAll('#lfLista input').forEach(x => { x.checked = false; }));
    $('lfOk').addEventListener('click', async () => {
      const data = $('lfData').value;
      const conjs = $('lfConj').value === '12' ? [1, 2] : [Number($('lfConj').value)];
      const ids = [...d.querySelectorAll('#lfLista input:checked')].map(x => x.dataset.pid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erroDlg('Informe o dia da lavagem.');
      if (data > hoje()) return erroDlg('A lavagem se lança no dia em que aconteceu — não no futuro.');
      if (!ids.length) return erroDlg('Marque quem lavou o EPI.');
      if (precisaRede()) return;
      const obs = so($('lfObs').value) || null;
      const novos = ids.flatMap(fid => conjs.filter(n => !E.lav.some(l => String(l.funcionario_id) === fid && l.data === data && l.conjunto === n))
        .map(n => ({ id: novoId(), funcionario_id: fid, data, conjunto: n, observacao: obs, criado_por: quem() })));
      if (!novos.length) { fechar(); return; }
      $('lfOk').disabled = true;
      const { data: gravados, error } = await estado.cliente.from('cl_lavagens').upsert(novos, { onConflict: 'funcionario_id,data,conjunto', ignoreDuplicates: true }).select('id, funcionario_id, data, conjunto, observacao');
      if (error) { $('lfOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      E.lav.unshift(...(gravados || [])); E.lav.sort((x, y) => y.data.localeCompare(x.data)); salvarCaixa();
      E.fl.mes = data.slice(0, 7);
      fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · FICHA POR FUNCIONÁRIO
   =================================================================== */
function desenharFicha() {
  const tela = $('telaLvFicha');
  const fid = E.fl.func, ano = E.fl.ano;
  const f = fid ? func(fid) || { id: fid, nome: nomeDe(fid) } : null;
  const anos = [...new Set([Number(hoje().slice(0, 4)), ano, ...E.lav.map(l => Number(l.data.slice(0, 4)))])].sort((x, y) => y - x);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Ficha de lavagem por funcionário', `${FORM.codigo} · escolha o colaborador e o ano. Toque no dia para marcar o conjunto lavado: vazio → 1 → 2 → 1·2 → vazio.`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Colaborador <select id="lvFunc">${opcoesFuncs(fid)}</select></label>
      <label class="campo">Ano <select id="lvAno">${opcoes(anos.map(String), String(ano))}</select></label>
    </div>
    <div id="lvCorpo" style="margin-top:12px">${f ? corpoFicha(f, ano) : '<div class="vazio">Escolha o funcionário para ver e imprimir a ficha.</div>'}</div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="lvImp" ${f ? '' : 'disabled'}>Imprimir ficha</button>
    <button class="btn" type="button" id="lvImpBranco" ${f ? '' : 'disabled'}>Imprimir em branco (preencher à mão)</button>
  </div>`;
  $('lvFunc').addEventListener('change', e => { E.fl.func = e.target.value; desenharFicha(); });
  $('lvAno').addEventListener('change', e => { E.fl.ano = Number(e.target.value); desenharFicha(); });
  if (!f) return;
  $('lvImp').addEventListener('click', () => mostrar(docFichas([f.id], ano, false), { barra: true }));
  $('lvImpBranco').addEventListener('click', () => mostrar(docFichas([f.id], ano, true), { barra: true }));
  $('lvNovoConj')?.addEventListener('click', () => formConjunto(null, f));
  tela.querySelectorAll('[data-conj]').forEach(b => b.addEventListener('click', () => formConjunto(E.conj.find(c => c.id === b.dataset.conj), f)));
  tela.querySelectorAll('[data-dia]').forEach(td => td.addEventListener('click', () => alternarDia(f.id, td.dataset.dia, td)));
  const anx = campoAnexos($('lvAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: `Ficha assinada de ${ano}`, dica: 'PDF ou foto da ficha preenchida — evidência do RG 007' });
  anx.abrir(`lav-${f.id}-${ano}`);
  $('lvAnxOk')?.addEventListener('click', async () => { if (anx.mudou) { await anx.salvar(`lav-${f.id}-${ano}`); alert('Anexo gravado.'); } });
}
function corpoFicha(f, ano) {
  const mapa = mapaDias(f.id, ano);
  const cs = conjDe(f.id);
  const c1 = conjNoAno(f.id, 1, ano), c2 = conjNoAno(f.id, 2, ano);
  const total = Object.keys(mapa).length;
  const hj = hoje();
  return `<div class="rel-ficha" style="margin-bottom:10px">
      <div><span>Colaborador</span><b>${esc(f.nome)}</b></div><div><span>Função</span><b>${esc(f.cargo || '—')}</b></div>
      <div><span>Fazenda</span><b>${esc(f.fazenda || '—')}</b></div>
      <div><span>C.A conjunto APL 01</span><b>${esc(c1?.ca || '—')}</b></div><div><span>C.A conjunto APL 02</span><b>${esc(c2?.ca || '—')}</b></div>
      <div><span>Dias com lavagem em ${ano}</span><b>${total}</b></div></div>
    <div class="ac-rola"><table class="lv-grade"><thead><tr><th class="lv-mes">Mês / dia</th>${Array.from({ length: 31 }, (_, i) => `<th>${i + 1}</th>`).join('')}<th class="lv-n">Total</th></tr></thead><tbody>
    ${MES.map((nm, i) => { const n = diasNoMes(ano, i + 1); let t = 0;
      const cels = Array.from({ length: 31 }, (_, d) => { if (d + 1 > n) return '<td class="lv-fora"></td>';
        const k = `${ano}-${doisD(i + 1)}-${doisD(d + 1)}`; const v = rotDia(mapa[k]); if (v) t++;
        return k > hj ? `<td class="lv-futuro" title="${br(k)}">${v}</td>` : `<td data-dia="${k}" class="lv-dia${v ? ' lv-sim' : ''}" title="${br(k)}">${v}</td>`; }).join('');
      return `<tr><th class="lv-mes">${nm}</th>${cels}<td class="lv-n">${t || ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="qp-bloco"><div class="barra entre" style="margin:0"><h3 style="margin:0">Conjuntos de aplicação</h3><button class="btn mini" type="button" id="lvNovoConj">＋ Conjunto entregue</button></div>
      ${cs.length ? `<table class="dc-planilha" style="margin-top:6px"><thead><tr><th class="ce">Conjunto</th><th class="ce">C.A</th><th class="ce">Fornecido em</th><th class="ce">Trocado em</th><th>Observação</th><th></th></tr></thead><tbody>
        ${cs.map(c => `<tr><td class="ce"><b>APL ${doisD(c.numero)}</b></td><td class="ce">${esc(c.ca || '—')}</td><td class="ce">${br(c.fornecido_em) || '—'}</td>
          <td class="ce">${c.trocado_em ? br(c.trocado_em) : tag('em uso', 'ativo')}</td><td><small>${esc(c.observacao || '')}</small></td>
          <td class="ce"><button class="btn mini" type="button" data-conj="${esc(c.id)}">Editar</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="dica" style="margin:6px 0 0">Nenhum conjunto cadastrado. Cadastre o APL 01 e o APL 02 com o C.A e a data do fornecimento — eles saem no alto da ficha.</p>'}
    </div>
    <div class="qp-bloco"><div id="lvAnx"></div><button class="btn mini" type="button" id="lvAnxOk" style="margin-top:6px">Gravar anexo</button></div>`;
}
let gravando = false;
async function alternarDia(fid, dia, td) {
  if (gravando || precisaRede()) return;
  const atual = new Set(E.lav.filter(l => String(l.funcionario_id) === String(fid) && l.data === dia).map(l => l.conjunto));
  const ciclo = ['', '1', '2', '1·2'];
  const prox = ciclo[(ciclo.indexOf(rotDia(atual)) + 1) % ciclo.length];
  const quer = new Set(prox ? prox.split('·').map(Number) : []);
  const tirar = E.lav.filter(l => String(l.funcionario_id) === String(fid) && l.data === dia && !quer.has(l.conjunto));
  const por = [...quer].filter(n => !atual.has(n)).map(n => ({ id: novoId(), funcionario_id: fid, data: dia, conjunto: n, criado_por: quem() }));
  gravando = true; td.classList.add('lv-gravando');
  try {
    if (tirar.length) { const { error } = await estado.cliente.from('cl_lavagens').delete().in('id', tirar.map(l => l.id)); if (error) throw error; }
    if (por.length) { const { data, error } = await estado.cliente.from('cl_lavagens').insert(por).select('id, funcionario_id, data, conjunto, observacao'); if (error) throw error; E.lav.push(...(data || [])); }
    const fora = new Set(tirar.map(l => l.id));
    E.lav = E.lav.filter(l => !fora.has(l.id)).sort((x, y) => y.data.localeCompare(x.data));
    salvarCaixa();
    td.textContent = prox; td.classList.toggle('lv-sim', !!prox);
    const tr = td.closest('tr'); const n = tr.querySelectorAll('td.lv-sim').length; tr.querySelector('.lv-n').textContent = n || '';
  } catch (e) { alert('Não consegui gravar: ' + (e.message || e)); }
  finally { gravando = false; td.classList.remove('lv-gravando'); }
}
function formConjunto(c, f) {
  const v = c || { numero: conjDe(f.id).some(x => x.numero === 1 && !x.trocado_em) ? 2 : 1, ca: E.caPadrao, fornecido_em: hoje(), trocado_em: null, observacao: '' };
  dialogo(`<h3>${c ? 'Conjunto de aplicação' : 'Conjunto entregue'} <small class="dica">${esc(f.nome)}</small></h3>
    <div class="aviso erro" id="lvErro" hidden></div>
    <div class="grade">
      <label class="campo">Conjunto <select id="lcNum">${opcoes([['1', 'APL 01'], ['2', 'APL 02']], String(v.numero))}</select></label>
      <label class="campo">C.A <input type="text" id="lcCa" value="${esc(v.ca || '')}" placeholder="${esc(E.caPadrao || 'nº do C.A')}"></label>
      <label class="campo">Data do fornecimento <input type="date" id="lcForn" value="${esc(v.fornecido_em || '')}"></label>
      <label class="campo">Data da troca <input type="date" id="lcTroca" value="${esc(v.trocado_em || '')}"></label>
    </div>
    <p class="dica" style="margin:4px 0">Quando o conjunto for trocado, preencha a data da troca neste e cadastre o novo conjunto entregue — o histórico fica.${E.caPadrao ? ` O C.A sugerido (${esc(E.caPadrao)}) vem do catálogo de EPIs.` : ''}</p>
    <label class="campo">Observação <input type="text" id="lcObs" value="${esc(v.observacao || '')}"></label>
    <div class="barra entre"><div>${c ? '<button class="btn perigo" type="button" id="lcApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="lcOk">Salvar</button></div></div>`, () => {
    $('lcApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar este conjunto? Use só para lançamento errado; conjunto trocado ganha a data da troca.') || precisaRede()) return;
      const { error } = await estado.cliente.from('cl_conjuntos').delete().eq('id', c.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      E.conj = E.conj.filter(x => x.id !== c.id); salvarCaixa(); fechar(); redesenhar();
    });
    $('lcOk').addEventListener('click', async () => {
      const l = { funcionario_id: f.id, numero: Number($('lcNum').value), ca: so($('lcCa').value) || null,
        fornecido_em: $('lcForn').value || null, trocado_em: $('lcTroca').value || null, observacao: so($('lcObs').value) || null };
      if (l.fornecido_em && l.trocado_em && l.trocado_em < l.fornecido_em) return erroDlg('A troca não pode ser antes do fornecimento.');
      if (precisaRede()) return;
      $('lcOk').disabled = true;
      const t = estado.cliente.from('cl_conjuntos');
      const { data, error } = c ? await t.update({ ...l, atualizado_por: quem() }).eq('id', c.id).select().single()
        : await t.insert({ id: novoId(), ...l, criado_por: quem() }).select().single();
      if (error) { $('lcOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      const i = E.conj.findIndex(x => x.id === data.id); if (i >= 0) E.conj[i] = data; else E.conj.push(data);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   IMPRESSO — uma folha A4 deitada por funcionário, igual à planilha
   =================================================================== */
function folha(fid, ano, branco, i) {
  const f = func(fid) || { id: fid, nome: nomeDe(fid) };
  const mapa = branco ? {} : mapaDias(fid, ano);
  const c1 = conjNoAno(fid, 1, ano), c2 = conjNoAno(fid, 2, ano);
  return `<article class="rel rel-paisagem lv-folha${i ? ' folha2' : ''}">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(FORM.titulo)}</h1><p>${esc(INSTRUCAO)}</p></div>
      <div class="rel-comp"><span>ano</span><strong>${ano}</strong><span>${FORM.codigo}</span></div></header>
    <div class="rel-ficha lv-ficha-form"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>
    <div class="rel-ficha lv-ficha-func">
      <div class="lv-col"><span>Colaborador</span><b>${esc(f.nome)}</b></div><div><span>Função</span><b>${esc(f.cargo || '')}</b></div>
      <div><span>Fazenda</span><b>${esc(f.fazenda || '')}</b></div>
      <div><span>C.A conjunto APL 01</span><b>${esc(c1?.ca || '')}&nbsp;</b></div><div><span>C.A conjunto APL 02</span><b>${esc(c2?.ca || '')}&nbsp;</b></div></div>
    <table class="lv-imp"><colgroup><col class="c-mes">${'<col class="c-dia">'.repeat(31)}<col class="c-ass"><col class="c-dt"><col class="c-dt"></colgroup>
      <thead><tr><th>Meses / dias</th>${Array.from({ length: 31 }, (_, d) => `<th>${d + 1}</th>`).join('')}<th>Assinatura</th><th>Data do fornecimento</th><th>Data da troca do EPI</th></tr></thead>
      <tbody>${MES.map((nm, m) => { const n = diasNoMes(ano, m + 1); const ev = branco ? { forn: '', troc: '' } : eventosMes(fid, ano, m + 1);
        return `<tr><th>${nm}</th>${Array.from({ length: 31 }, (_, d) => d + 1 > n ? '<td class="lv-x"></td>'
          : `<td>${esc(rotDia(mapa[`${ano}-${doisD(m + 1)}-${doisD(d + 1)}`]))}</td>`).join('')}<td></td><td>${esc(ev.forn)}</td><td>${esc(ev.troc)}</td></tr>`; }).join('')}</tbody></table>
    <div class="lv-textos"><p><b>Orientação:</b> ${esc(ORIENTACAO)}</p><p><b>Recomendação para a lavagem do EPI:</b> ${esc(RECOMENDACAO)}</p></div>
    <div class="lv-pe"><div class="lv-obs"><span>Observação</span></div><div class="lv-ass"><span></span><small>${esc(f.nome)}<br>Assinatura do funcionário</small></div></div>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
const docFichas = (ids, ano, branco) => ids.map((id, i) => folha(id, ano, branco, i)).join('');

async function exportar() {
  const sub = `SAKUMA Agronegócios · emitido em ${br(hoje())}`;
  const l = E.lav.slice().sort((a, b) => a.data.localeCompare(b.data) || nomeDe(a.funcionario_id).localeCompare(nomeDe(b.funcionario_id), 'pt-BR'));
  await baixarXlsx(`lavagem-epi-${hoje()}.xlsx`, [
    { nome: 'Lavagens', titulo: `${FORM.codigo} — Lavagens de EPI`, subtitulo: sub,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Funcionário', larg: 36 }, { rot: 'Função', larg: 22 }, { rot: 'Conjunto', larg: 10 }, { rot: 'Observação', larg: 36 }],
      linhas: l.map(x => [x.data, nomeDe(x.funcionario_id), func(x.funcionario_id)?.cargo || '', `APL ${doisD(x.conjunto)}`, x.observacao || '']) },
    { nome: 'Conjuntos', titulo: `${FORM.codigo} — Conjuntos de aplicação`, subtitulo: sub,
      colunas: [{ rot: 'Funcionário', larg: 36 }, { rot: 'Conjunto', larg: 10 }, { rot: 'C.A', larg: 12 }, { rot: 'Fornecido em', larg: 13, tipo: 'data' }, { rot: 'Trocado em', larg: 13, tipo: 'data' }, { rot: 'Observação', larg: 36 }],
      linhas: E.conj.slice().sort((a, b) => nomeDe(a.funcionario_id).localeCompare(nomeDe(b.funcionario_id), 'pt-BR') || a.numero - b.numero)
        .map(c => [nomeDe(c.funcionario_id), `APL ${doisD(c.numero)}`, c.ca || '', c.fornecido_em || '', c.trocado_em || '', c.observacao || '']) },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_LAVAGEM = ['lvPainel', 'lvFicha'];
const DESENHO = { lvPainel: desenharPainel, lvFicha: desenharFicha };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirLavagem(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando as lavagens de EPI…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir a higienização dos EPIs: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgLv')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparLavagem() {
  E.carregado = false; E.lav = []; E.conj = []; E.caPadrao = '';
  Object.assign(E.fl, { mes: hoje().slice(0, 7), func: '', ano: Number(hoje().slice(0, 4)) });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cl = { E, mapaDias, docFichas };
