// cert-banho.js — Certificação › FORMS Digital › Banho e higiene pessoal (FORM 054), 28/10/2026.
//
// Pedido do Guilherme ("mais esse!"), junto com a ficha de lavagem de EPI
// (que ficou como documento, FORM 055 — não é form digital, decisão dele). Veio da planilha "FICHA DE CONTROLE DE BANHO
// E HIGIENE PESSOAL": uma folha por trabalhador e por mês, uma linha por
// aplicação — data, início e fim da aplicação, banho tomado (sim/não),
// observações (EPI danificado etc.) e assinatura. Não existia FORM para ela na
// Lista mestra: entrou como FORM 054 / RG 054 (supabase/cert-banho.sql).
//
// No app:
//  · Registros — mês a mês; "Lançar aplicação" grava a mesma data e horário
//    para vários trabalhadores de uma vez, com banho Sim/Não de cada um.
//  · Ficha por funcionário — escolhe a pessoa e o mês; imprime a ficha com os
//    registros (e linhas em branco até completar a folha) ou em branco, só com
//    o cabeçalho, para preencher à mão.
//
// Tabela cb_banhos, aberta para 'cert' ou 'sst'. Ficha assinada escaneada:
// Drive certificacao/evidencia/banho-<funcionário>-<aaaa-mm>/…

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
const rotMes = am => `${MES[Number(am.slice(5, 7)) - 1]} de ${am.slice(0, 4)}`;
const hora = v => { const m = so(v).replace(/[h.]/i, ':').match(/^(\d{1,2})(?::?(\d{2}))?$/); return m ? `${doisD(Math.min(23, Number(m[1])))}:${m[2] || '00'}` : so(v) || null; };

const FORM = { codigo: 'FORM 054', titulo: 'Ficha de controle de banho e higiene pessoal', data: '01/12/2026', nrev: '01',
  elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Produtor – Fabio Massao Sakuma' };
const ORIENTACAO = 'Após a aplicação e a lavagem dos EPIs, o trabalhador deve tomar banho em água fria e em seguida vestir roupas limpas. Registrar cada aplicação com o horário de início e de fim e informar se o banho foi tomado; anotar em Observações qualquer EPI danificado.';
const LINHAS_FOLHA = 24;

/* ---------------- estado ---------------- */
const E = { carregado: false, reg: [], apl: [], fl: { mes: hoje().slice(0, 7), func: '', fmes: hoje().slice(0, 7) } };
const CAIXA = 'banho.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { reg: E.reg, apl: E.apl });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { reg: c0.reg || [], apl: c0.apl || [] }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia dos registros de banho neste aparelho.');
  }
  const r = await c.from('cb_banhos').select('*').order('data', { ascending: false });
  if (r.error && E.carregado) return;
  if (r.error) {
    if (/cb_|relation|does not exist|schema cache/i.test(r.error.message || '')) throw new Error('A tabela do controle de banho ainda não foi criada no banco (supabase/cert-banho.sql).');
    throw r.error;
  }
  E.reg = r.data || [];
  E.carregado = true;
  salvarCaixa();
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR');
const func = id => (estado.funcionarios || []).find(f => String(f.id) === String(id)) || null;
const nomeDe = id => func(id)?.nome || '(funcionário fora do cadastro)';
const ordem = (a, b) => a.data.localeCompare(b.data) || so(a.inicio).localeCompare(so(b.inicio));
const idsAplicadores = () => new Set([...E.apl, ...E.reg.map(r => String(r.funcionario_id))]);
function listaFuncs() {
  const apl = idsAplicadores();
  const ativos = (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO');
  return { aplic: ativos.filter(f => apl.has(String(f.id))).sort(porNome), outros: ativos.filter(f => !apl.has(String(f.id))).sort(porNome) };
}
const regDe = (fid, am) => E.reg.filter(r => String(r.funcionario_id) === String(fid) && r.data.startsWith(am)).sort(ordem);
const rotBanho = b => b === true ? 'Sim' : b === false ? 'Não' : '—';

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const tagBanho = b => b === true ? tag('Sim', 'ativo') : b === false ? tag('Não', 'perigo') : tag('não informado', 'alerta');
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
function opcoesFuncs(val) {
  const { aplic, outros } = listaFuncs();
  const op = f => `<option value="${esc(f.id)}" ${String(f.id) === String(val) ? 'selected' : ''}>${esc(f.nome)}${f.cargo ? ' · ' + esc(f.cargo) : ''}</option>`;
  return `<option value="">Escolha o funcionário</option>${aplic.length ? `<optgroup label="Aplicadores">${aplic.map(op).join('')}</optgroup>` : ''}
    <optgroup label="${aplic.length ? 'Demais funcionários ativos' : 'Funcionários ativos'}">${outros.map(op).join('')}</optgroup>`;
}
const mesesComDado = extra => [...new Set([hoje().slice(0, 7), extra, ...E.reg.map(r => r.data.slice(0, 7))].filter(Boolean))].sort().reverse();
function dialogo(html, ligar) {
  let d = $('dlgBh');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgBh'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgBh')?.open && $('dlgBh').close();
const erroDlg = t => { const e = $('bhErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgBh')) $('dlgBh').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

/* ===================================================================
   TELA · REGISTROS
   =================================================================== */
function desenharRegistros() {
  const tela = $('telaBhRegistros');
  const m = E.fl.mes;
  const l = E.reg.filter(r => r.data.startsWith(m)).sort((a, b) => b.data.localeCompare(a.data) || nomeDe(a.funcionario_id).localeCompare(nomeDe(b.funcionario_id), 'pt-BR'));
  const nao = l.filter(r => r.banho === false), semInfo = l.filter(r => r.banho == null);
  const pessoas = [...new Set(l.map(r => String(r.funcionario_id)))];
  const cartao = (cor, rot, val, dica) => `<div class="pv-card pv-${cor}"><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></div>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Banho e higiene pessoal', `${FORM.codigo} · uma linha por aplicação: início e fim, banho tomado e observações (EPI danificado etc.)`,
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="bhAbrirFicha">Ficha por funcionário</button><button class="btn principal" type="button" id="bhLancar">Lançar aplicação</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Mês <select id="bhMes">${opcoes(mesesComDado(m).map(x => [x, rotMes(x)]), m)}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Registros no mês', l.length, `${new Set(l.map(r => r.data)).size} dia(s) de aplicação`)}
      ${cartao('calma', 'Trabalhadores', pessoas.length, 'com registro no mês')}
      ${cartao(nao.length ? 'perigo' : 'calma', 'Banho não tomado', nao.length, nao.length ? 'registre a orientação dada' : 'nenhum')}
      ${cartao(semInfo.length ? 'atencao' : 'calma', 'Sem informação do banho', semInfo.length, semInfo.length ? 'complete o registro' : 'todos informados')}
    </div>
    <div class="qp-bloco"><h3>Registros de ${esc(rotMes(m).toLowerCase())}</h3>
      ${l.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th>Trabalhador</th><th>Função</th><th class="ce">Início</th><th class="ce">Fim</th><th class="ce">Banho tomado</th><th>Observações</th><th></th></tr></thead><tbody>
      ${l.map(r => { const f = func(r.funcionario_id); return `<tr><td class="ce">${br(r.data)}</td><td><b>${esc(nomeDe(r.funcionario_id))}</b></td><td>${esc(f?.cargo || '')}</td>
        <td class="ce">${esc(r.inicio || '—')}</td><td class="ce">${esc(r.fim || '—')}</td><td class="ce">${tagBanho(r.banho)}</td><td><small>${esc(r.observacao || '')}</small></td>
        <td class="ce"><button class="btn mini" type="button" data-ed="${esc(r.id)}">Editar</button> <button class="btn mini" type="button" data-ficha="${esc(r.funcionario_id)}">Ficha</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum registro neste mês. Toque em <b>Lançar aplicação</b>.</div>'}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="bhImpMes">Imprimir fichas do mês</button>
    <button class="btn" type="button" id="bhImpBranco">Fichas em branco dos aplicadores</button>
    <button class="btn" type="button" id="bhXlsx">Excel</button>
  </div>`;
  $('bhMes').addEventListener('change', e => { E.fl.mes = e.target.value; desenharRegistros(); });
  $('bhLancar').addEventListener('click', () => formLancar());
  $('bhAbrirFicha').addEventListener('click', () => irFicha('', m));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formRegistro(E.reg.find(r => r.id === b.dataset.ed))));
  tela.querySelectorAll('[data-ficha]').forEach(b => b.addEventListener('click', () => irFicha(b.dataset.ficha, m)));
  const comReg = pessoas.map(id => func(id) || { id, nome: nomeDe(id) }).sort(porNome).map(f => f.id);
  $('bhImpMes').addEventListener('click', () => comReg.length ? mostrar(docFichas(comReg, m, false), { barra: true }) : alert('Nenhum registro neste mês.'));
  const apl = listaFuncs().aplic.map(f => f.id);
  $('bhImpBranco').addEventListener('click', () => apl.length ? mostrar(docFichas(apl, m, true), { barra: true }) : alert('Nenhum aplicador ainda: lance uma aplicação primeiro.'));
  $('bhXlsx').addEventListener('click', exportar);
}
function irFicha(fid, mes) {
  if (fid) E.fl.func = String(fid);
  if (mes) E.fl.fmes = mes;
  abrirModulo('cert', 'bhFicha');
}

/** Lançar a aplicação do dia para vários trabalhadores, com o banho de cada um. */
function formLancar() {
  const { aplic, outros } = listaFuncs();
  const item = f => `<div class="bh-item" data-nome="${esc(String(f.nome).toLowerCase())}">
    <label style="display:flex;gap:8px;align-items:center;flex:1"><input type="checkbox" data-pid="${esc(f.id)}"> <span>${esc(f.nome)} <small class="dica">${esc(f.cargo || '')}</small></span></label>
    <select data-banho="${esc(f.id)}" title="Banho tomado?"><option value="s">Banho: Sim</option><option value="n">Banho: Não</option><option value="">Banho: não informado</option></select>
    <input type="text" data-obs="${esc(f.id)}" placeholder="Observação (EPI danificado…)"></div>`;
  dialogo(`<h3>Lançar aplicação <small class="dica">${FORM.codigo}</small></h3>
    <div class="aviso erro" id="bhErro" hidden></div>
    <div class="grade">
      <label class="campo">Data <input type="date" id="blData" value="${hoje()}" max="${hoje()}"></label>
      <label class="campo">Início da aplicação <input type="time" id="blIni"></label>
      <label class="campo">Fim da aplicação <input type="time" id="blFim"></label>
    </div>
    <div class="barra" style="margin:8px 0 6px"><input type="search" id="blBusca" placeholder="Buscar trabalhador" style="flex:1">
      <button class="btn mini" type="button" id="blApl">Marcar os aplicadores</button><button class="btn mini" type="button" id="blNenhum">Limpar</button></div>
    <div id="blLista" class="bh-lista">
      ${aplic.length ? `<p class="dica" style="margin:2px 0">Aplicadores</p>${aplic.map(item).join('')}${outros.length ? '<p class="dica" style="margin:8px 0 2px">Demais funcionários ativos</p>' : ''}` : ''}
      ${outros.map(item).join('')}${!aplic.length && !outros.length ? '<p class="dica">O cadastro de funcionários não está neste aparelho.</p>' : ''}
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="blOk">Gravar</button></div>`, d => {
    const aplIds = new Set(aplic.map(f => String(f.id)));
    $('blBusca').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase();
      d.querySelectorAll('#blLista [data-nome]').forEach(x => { x.style.display = !q || x.dataset.nome.includes(q) ? '' : 'none'; }); });
    $('blApl').addEventListener('click', () => d.querySelectorAll('#blLista input[type=checkbox]').forEach(x => { if (aplIds.has(x.dataset.pid)) x.checked = true; }));
    $('blNenhum').addEventListener('click', () => d.querySelectorAll('#blLista input[type=checkbox]').forEach(x => { x.checked = false; }));
    $('blOk').addEventListener('click', async () => {
      const data = $('blData').value, inicio = hora($('blIni').value), fim = hora($('blFim').value);
      const ids = [...d.querySelectorAll('#blLista input[type=checkbox]:checked')].map(x => x.dataset.pid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erroDlg('Informe a data da aplicação.');
      if (data > hoje()) return erroDlg('A aplicação se lança no dia em que aconteceu — não no futuro.');
      if (inicio && fim && fim < inicio) return erroDlg('O fim da aplicação está antes do início.');
      if (!ids.length) return erroDlg('Marque quem trabalhou na aplicação.');
      if (precisaRede()) return;
      const sel = id => d.querySelector(`[data-banho="${CSS.escape(id)}"]`).value;
      const novos = ids.map(fid => ({ id: novoId(), funcionario_id: fid, data, inicio, fim, banho: sel(fid) === 's' ? true : sel(fid) === 'n' ? false : null,
        observacao: so(d.querySelector(`[data-obs="${CSS.escape(fid)}"]`).value) || null, criado_por: quem() }));
      $('blOk').disabled = true;
      const { data: gravados, error } = await estado.cliente.from('cb_banhos').insert(novos).select();
      if (error) { $('blOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      E.reg.unshift(...(gravados || [])); E.reg.sort((a, b) => b.data.localeCompare(a.data)); salvarCaixa();
      E.fl.mes = data.slice(0, 7); fechar(); redesenhar();
    });
  });
}
/** Editar (ou criar, na ficha) um registro de um trabalhador. */
function formRegistro(r, fid) {
  const v = r || { funcionario_id: fid, data: hoje(), inicio: '', fim: '', banho: true, observacao: '' };
  dialogo(`<h3>${r ? 'Registro de aplicação' : 'Novo registro'} <small class="dica">${esc(nomeDe(v.funcionario_id))}</small></h3>
    <div class="aviso erro" id="bhErro" hidden></div>
    <div class="grade">
      <label class="campo">Data <input type="date" id="brData" value="${esc(v.data)}" max="${hoje()}"></label>
      <label class="campo">Início da aplicação <input type="time" id="brIni" value="${esc(v.inicio || '')}"></label>
      <label class="campo">Fim da aplicação <input type="time" id="brFim" value="${esc(v.fim || '')}"></label>
      <label class="campo">Banho tomado? <select id="brBanho">${opcoes([['s', 'Sim'], ['n', 'Não'], ['', 'Não informado']], v.banho === true ? 's' : v.banho === false ? 'n' : '')}</select></label>
    </div>
    <label class="campo">Observações <input type="text" id="brObs" value="${esc(v.observacao || '')}" placeholder="EPI danificado, etc."></label>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="brApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="brOk">Salvar</button></div></div>`, () => {
    $('brApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar este registro?') || precisaRede()) return;
      const { error } = await estado.cliente.from('cb_banhos').delete().eq('id', r.id);
      if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
      E.reg = E.reg.filter(x => x.id !== r.id); salvarCaixa(); fechar(); redesenhar();
    });
    $('brOk').addEventListener('click', async () => {
      const b = $('brBanho').value;
      const l = { data: $('brData').value, inicio: hora($('brIni').value), fim: hora($('brFim').value), banho: b === 's' ? true : b === 'n' ? false : null, observacao: so($('brObs').value) || null };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return erroDlg('Informe a data.');
      if (l.data > hoje()) return erroDlg('Data no futuro não vale.');
      if (l.inicio && l.fim && l.fim < l.inicio) return erroDlg('O fim da aplicação está antes do início.');
      if (precisaRede()) return;
      $('brOk').disabled = true;
      const t = estado.cliente.from('cb_banhos');
      const { data, error } = r ? await t.update({ ...l, atualizado_por: quem() }).eq('id', r.id).select().single()
        : await t.insert({ id: novoId(), funcionario_id: v.funcionario_id, ...l, criado_por: quem() }).select().single();
      if (error) { $('brOk').disabled = false; return erroDlg('Não consegui gravar: ' + esc(error.message)); }
      const i = E.reg.findIndex(x => x.id === data.id); if (i >= 0) E.reg[i] = data; else E.reg.unshift(data);
      E.reg.sort((a, b) => b.data.localeCompare(a.data)); salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · FICHA POR FUNCIONÁRIO
   =================================================================== */
function desenharFicha() {
  const tela = $('telaBhFicha');
  const fid = E.fl.func, am = E.fl.fmes;
  const f = fid ? func(fid) || { id: fid, nome: nomeDe(fid) } : null;
  const l = f ? regDe(f.id, am) : [];
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Ficha de banho por funcionário', `${FORM.codigo} · escolha o trabalhador e o mês. Sai uma folha por mês, com os registros lançados e linhas em branco até completar.`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Trabalhador <select id="bhFunc">${opcoesFuncs(fid)}</select></label>
      <label class="campo">Mês <input type="month" id="bhFMes" value="${esc(am)}"></label>
    </div>
    <div style="margin-top:12px">${!f ? '<div class="vazio">Escolha o funcionário para ver e imprimir a ficha.</div>' : `
      <div class="rel-ficha" style="margin-bottom:10px"><div><span>Trabalhador</span><b>${esc(f.nome)}</b></div><div><span>Função / cargo</span><b>${esc(f.cargo || '—')}</b></div>
        <div><span>Propriedade</span><b>${esc(f.fazenda || '—')}</b></div><div><span>Empregador</span><b>${esc(f.empregador || '—')}</b></div>
        <div><span>Mês / ano</span><b>${esc(rotMes(am))}</b></div><div><span>Registros</span><b>${l.length}</b></div></div>
      <div class="barra entre" style="margin:0 0 6px"><span class="dica">${l.filter(r => r.banho === false).length ? `<b>${l.filter(r => r.banho === false).length}</b> aplicação(ões) sem banho tomado` : ''}</span>
        <button class="btn mini" type="button" id="bhNovoReg">＋ Registro</button></div>
      ${l.length ? `<table class="dc-planilha"><thead><tr><th class="ce">Data</th><th class="ce">Início aplicação</th><th class="ce">Fim aplicação</th><th class="ce">Banho tomado</th><th>Observações</th><th></th></tr></thead><tbody>
        ${l.map(r => `<tr><td class="ce">${br(r.data)}</td><td class="ce">${esc(r.inicio || '—')}</td><td class="ce">${esc(r.fim || '—')}</td><td class="ce">${tagBanho(r.banho)}</td>
          <td><small>${esc(r.observacao || '')}</small></td><td class="ce"><button class="btn mini" type="button" data-ed="${esc(r.id)}">Editar</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Nenhum registro deste trabalhador no mês.</div>'}
      <div class="qp-bloco"><div id="bhAnx"></div><button class="btn mini" type="button" id="bhAnxOk" style="margin-top:6px">Gravar anexo</button></div>`}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="bhImp" ${f ? '' : 'disabled'}>Imprimir ficha</button>
    <button class="btn" type="button" id="bhImpVazia" ${f ? '' : 'disabled'}>Imprimir em branco (preencher à mão)</button>
  </div>`;
  $('bhFunc').addEventListener('change', e => { E.fl.func = e.target.value; desenharFicha(); });
  $('bhFMes').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { E.fl.fmes = e.target.value; desenharFicha(); } });
  if (!f) return;
  $('bhImp').addEventListener('click', () => mostrar(docFichas([f.id], am, false), { barra: true }));
  $('bhImpVazia').addEventListener('click', () => mostrar(docFichas([f.id], am, true), { barra: true }));
  $('bhNovoReg').addEventListener('click', () => formRegistro(null, f.id));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formRegistro(E.reg.find(r => r.id === b.dataset.ed))));
  const dono = `banho-${f.id}-${am}`;
  const anx = campoAnexos($('bhAnx'), { area: 'certificacao', tipo: 'evidencia', rotulo: `Ficha assinada de ${rotMes(am).toLowerCase()}`, dica: 'PDF ou foto da ficha preenchida — evidência do RG 054' });
  anx.abrir(dono);
  $('bhAnxOk').addEventListener('click', async () => { if (anx.mudou) { await anx.salvar(dono); alert('Anexo gravado.'); } });
}

/* ===================================================================
   IMPRESSO — uma folha A4 em pé por trabalhador e mês, igual à planilha
   =================================================================== */
function folhas(fid, am, branco, primeira) {
  const f = func(fid) || { id: fid, nome: nomeDe(fid) };
  const l = branco ? [] : regDe(fid, am);
  const total = Math.max(LINHAS_FOLHA, Math.ceil(l.length / LINHAS_FOLHA) * LINHAS_FOLHA);
  const linhas = [...l, ...Array.from({ length: total - l.length }, () => null)];
  const out = [];
  for (let p = 0; p < total / LINHAS_FOLHA; p++) {
    const pedaco = linhas.slice(p * LINHAS_FOLHA, (p + 1) * LINHAS_FOLHA);
    out.push(`<article class="rel bh-folha${primeira && p === 0 ? '' : ' bh-quebra'}">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(FORM.titulo)}</h1><p>Trabalhadores da aplicação de defensivos · banho depois da aplicação</p></div>
      <div class="rel-comp"><span>mês / ano</span><strong>${esc(am.slice(5, 7))}/${esc(am.slice(0, 4))}</strong><span>${FORM.codigo}${total > LINHAS_FOLHA ? ` · folha ${p + 1}` : ''}</span></div></header>
    <div class="rel-ficha bh-ficha-form"><div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data</span><b>${FORM.data}</b></div><div><span>Revisão</span><b>${FORM.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${FORM.elaborador}</b></div><div><span>Aprovação</span><b>${FORM.aprovador}</b></div></div>
    <div class="rel-ficha bh-ficha-func">
      <div><span>Empregador</span><b>${esc(f.empregador || '')}&nbsp;</b></div><div><span>Identificação da propriedade</span><b>${esc(f.fazenda || '')}&nbsp;</b></div>
      <div><span>Mês / ano</span><b>${esc(rotMes(am))}</b></div>
      <div class="bh-largo"><span>Nome do trabalhador</span><b>${esc(f.nome)}</b></div><div><span>Função / cargo</span><b>${esc(f.cargo || '')}&nbsp;</b></div></div>
    <table class="bh-imp"><colgroup><col class="c-data"><col class="c-h"><col class="c-h"><col class="c-banho"><col class="c-obs"><col class="c-ass"></colgroup>
      <thead><tr><th>Data</th><th>Início aplicação</th><th>Fim aplicação</th><th>Condições do banho (tomado?)</th><th>Observações (EPI danificado, etc.)</th><th>Assinatura</th></tr></thead>
      <tbody>${pedaco.map(r => `<tr><td>${r ? br(r.data) : ''}</td><td>${esc(r?.inicio || '')}</td><td>${esc(r?.fim || '')}</td>
        <td class="bh-sn">(${r?.banho === true ? '<b>X</b>' : '&nbsp;&nbsp;'}) SIM&nbsp;&nbsp;(${r?.banho === false ? '<b>X</b>' : '&nbsp;&nbsp;'}) NÃO</td>
        <td class="bh-obs">${esc(r?.observacao || '')}</td><td></td></tr>`).join('')}</tbody></table>
    <p class="bh-orient"><b>Orientação:</b> ${esc(ORIENTACAO)}</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`);
  }
  return out.join('');
}
const docFichas = (ids, am, branco) => ids.map((id, i) => folhas(id, am, branco, i === 0)).join('');

async function exportar() {
  const sub = `SAKUMA Agronegócios · emitido em ${br(hoje())}`;
  const l = E.reg.slice().sort((a, b) => ordem(a, b) || nomeDe(a.funcionario_id).localeCompare(nomeDe(b.funcionario_id), 'pt-BR'));
  await baixarXlsx(`banho-higiene-${hoje()}.xlsx`, [
    { nome: 'Registros', titulo: `${FORM.codigo} — Controle de banho e higiene pessoal`, subtitulo: sub,
      colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Trabalhador', larg: 36 }, { rot: 'Função', larg: 22 }, { rot: 'Fazenda', larg: 22 },
        { rot: 'Início aplicação', larg: 10 }, { rot: 'Fim aplicação', larg: 10 }, { rot: 'Banho tomado', larg: 12 }, { rot: 'Observações', larg: 40 }],
      linhas: l.map(r => { const f = func(r.funcionario_id); return [r.data, nomeDe(r.funcionario_id), f?.cargo || '', f?.fazenda || '', r.inicio || '', r.fim || '', rotBanho(r.banho), r.observacao || '']; }) },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_BANHO = ['bhRegistros', 'bhFicha'];
const DESENHO = { bhRegistros: desenharRegistros, bhFicha: desenharFicha };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirBanho(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o controle de banho…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o controle de banho: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgBh')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparBanho() {
  E.carregado = false; E.reg = []; E.apl = [];
  Object.assign(E.fl, { mes: hoje().slice(0, 7), func: '', fmes: hoje().slice(0, 7) });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cb = { E, docFichas };
