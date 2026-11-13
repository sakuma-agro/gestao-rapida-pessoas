// sst-epi-lavagem.js — SST › EPI's › Lavagem e higienização (13/11/2026).
//
// Pedido do Guilherme: "um painel sobre lavagem do EPI, higienização, estilo da
// certificação, onde vamos controlar". Escolhas dele (13/11/2026):
//   · lavagens por aplicador — lançadas a partir do FORM 007 (Higienização dos
//     EPI's, papel) recolhido pelo escritório; marca o dia e o conjunto APL 01/02;
//   · troca por nº de lavagens — avisa quando o conjunto chega ao limite do
//     fabricante (est_itens.lavagens_max, ou o limite digitado no conjunto) ou
//     à periodicidade de troca do EPI;
//   · recebimento do FORM 007 — recolhido e escaneado, por aplicador e mês.
// O FORM 007 continua sendo de papel (decisão de 28/10/2026); este painel só
// controla o que vem dele.
// Banco: cl_conjuntos (numero 1|2, ca, fornecido_em, trocado_em, item_id,
// limite_lavagens), cl_lavagens (data, conjunto 1|2), epi_form007 (id func|mês).
import { estado } from './store.js';
import { mostrar } from './jornada-relatorios.js';
import { entregasDeEpi } from './sst-epi-mov.js';
import { semAcento, somarPrazo } from './epi-saldo.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const chip = (cor, txt) => `<span class="tag ${cor}">${esc(txt)}</span>`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = m => { const [a, mm] = m.split('-').map(Number); return `${MESES[mm - 1]}/${a}`; };
const diasNoMes = m => { const [a, mm] = m.split('-').map(Number); return new Date(a, mm, 0).getDate(); };
const quem = () => estado.sessao?.user?.email || '';
const APL = n => 'APL ' + String(n).padStart(2, '0');
const AVISO = 0.8;   // a partir de 80% do limite: "trocar logo"

export const TELAS_EPI_LAV = ['epiLavagem'];

const L = { conjuntos: [], lavagens: [], forms: [], lido: 0, erro: '', mes: hoje().slice(0, 7), filtro: '', mov: null };

async function carregar(forcar) {
  if (!forcar && L.lido && Date.now() - L.lido < 60000) return;
  try {
    const [c, l, f, mov] = await Promise.all([
      estado.cliente.from('cl_conjuntos').select('*').order('fornecido_em'),
      estado.cliente.from('cl_lavagens').select('id,funcionario_id,data,conjunto').order('data').limit(20000),
      estado.cliente.from('epi_form007').select('*'),
      entregasDeEpi(forcar).catch(() => null),
    ]);
    for (const r of [c, l, f]) if (r.error) throw r.error;
    Object.assign(L, { conjuntos: c.data || [], lavagens: l.data || [], forms: f.data || [], mov, lido: Date.now(), erro: '' });
  } catch (e) { console.error(e); L.erro = (e && (e.message || e.details)) || String(e); }
}

const funcDe = id => (estado.funcionarios || []).find(f => f.id === id);
const itemDe = id => (L.mov && L.mov.D.itens.find(i => i.id === id)) || null;
const ehVestimenta = i => /PULVERIZ|APLICA|VESTIMENTA|MACACAO|CONJ/.test(semAcento(i.nome));

/* Situação de um conjunto: lavagens desde o fornecimento × limite; troca pela periodicidade. */
function situacao(c) {
  const ate = c.trocado_em || '9999-12-31';
  const n = L.lavagens.filter(l => l.funcionario_id === c.funcionario_id && Number(l.conjunto) === Number(c.numero)
    && (!c.fornecido_em || l.data >= c.fornecido_em) && l.data <= ate).length;
  const it = c.item_id ? itemDe(c.item_id) : null;
  const limite = Number(c.limite_lavagens) || Number(it && it.lavagens_max) || null;
  const proxima = it && it.troca_qtd && c.fornecido_em ? somarPrazo(c.fornecido_em, it.troca_qtd, it.troca_unidade) : '';
  const h = hoje();
  let sit;
  if (c.trocado_em) sit = { chave: 'trocado', cor: 'neutra', rotulo: 'trocado em ' + br(c.trocado_em) };
  else if (limite && n >= limite) sit = { chave: 'limite', cor: 'perigo', rotulo: 'chegou ao limite' };
  else if (proxima && proxima < h) sit = { chave: 'vencido', cor: 'perigo', rotulo: 'troca vencida' };
  else if ((limite && n >= limite * AVISO) || (proxima && Date.parse(proxima) - Date.parse(h) <= 15 * 86400000)) sit = { chave: 'logo', cor: 'alerta', rotulo: 'trocar logo' };
  else sit = { chave: 'ok', cor: 'ativo', rotulo: 'em uso' };
  return { n, limite, proxima, sit, it };
}
function aplicadores() {
  const ids = new Set(L.conjuntos.filter(c => !c.trocado_em).map(c => c.funcionario_id));
  for (const l of L.lavagens) if (l.data.startsWith(L.mes)) ids.add(l.funcionario_id);
  return [...ids].map(id => ({ id, f: funcDe(id) || { id, nome: '(funcionário não encontrado)' } }))
    .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
}
const formDe = (fid, mes) => L.forms.find(x => x.id === fid + '|' + mes) || null;
const ativosDe = fid => L.conjuntos.filter(c => c.funcionario_id === fid && !c.trocado_em).sort((a, b) => a.numero - b.numero);

let aberta = false;
export async function abrirEpiLavagem() {
  aberta = true;
  const t = $('telaEpiLavagem');
  if (!L.lido) t.innerHTML = '<div class="cartao"><p class="dica">Abrindo o painel de lavagem…</p></div>';
  await carregar(false);
  desenhar();
}

function desenhar() {
  const t = $('telaEpiLavagem');
  if (!t || t.hidden) return;
  if (L.erro && !L.lido) { t.innerHTML = `<div class="cartao"><p class="aviso erro">Não consegui abrir o painel (${esc(L.erro)}).</p></div>`; return; }
  const aps = aplicadores();
  const conjs = L.conjuntos.filter(c => !c.trocado_em).map(c => ({ c, s: situacao(c) }));
  const nLimite = conjs.filter(x => x.s.sit.chave === 'limite' || x.s.sit.chave === 'vencido').length;
  const nLogo = conjs.filter(x => x.s.sit.chave === 'logo').length;
  const semForm = aps.filter(a => !(formDe(a.id, L.mes) || {}).recolhido).length;
  const semScan = aps.filter(a => { const f = formDe(a.id, L.mes); return f && f.recolhido && !f.escaneado; }).length;
  const lavMes = L.lavagens.filter(l => l.data.startsWith(L.mes)).length;
  const card = (id, nome, n, cor, dica) => `<button type="button" class="pv-card pv-${cor}${n ? '' : ' pv-zero'}${id && L.filtro === id ? ' epm-ativo' : ''}" data-lv-card="${id}">
    <span>${nome}</span><strong>${n}</strong><small>${dica}</small></button>`;
  const vis = aps.filter(a => {
    if (!L.filtro) return true;
    const cs = ativosDe(a.id).map(situacao);
    if (L.filtro === 'troca') return cs.some(s => ['limite', 'vencido', 'logo'].includes(s.sit.chave));
    const fm = formDe(a.id, L.mes);
    if (L.filtro === 'form') return !(fm && fm.recolhido);
    if (L.filtro === 'scan') return fm && fm.recolhido && !fm.escaneado;
    return true;
  });

  t.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Lavagem e higienização dos EPIs</h2>
        <p class="dica" style="margin:2px 0 0">Conjuntos de aplicação de cada aplicador, lavagens lançadas do <b>FORM 007</b> (papel) e o recolhimento do formulário no mês.</p></div>
      <span class="barra"><button class="btn" type="button" id="lvAtualizar" title="Ler de novo do banco">↻</button>
        <button class="btn" type="button" id="lvRel">Relatório do mês</button>
        <button class="btn principal" type="button" id="lvNovo">+ Aplicador</button></span>
    </div>
    <div class="grade larga" style="margin-top:10px"><label class="campo">Mês do FORM 007 <input type="month" id="lvMes" value="${esc(L.mes)}"></label></div>
    <div class="pv-cards" style="margin-top:6px">
      ${card('', 'Aplicadores', aps.length, 'calma', `${lavMes} lavage${lavMes === 1 ? 'm' : 'ns'} em ${nomeMes(L.mes)}`)}
      ${card('troca', 'Conjuntos para trocar', nLimite + nLogo, nLimite ? 'perigo' : 'alerta', `${nLimite} no limite/vencidos · ${nLogo} perto`)}
      ${card('form', 'FORM 007 a recolher', semForm, 'alerta', 'no mês escolhido')}
      ${card('scan', 'Recolhidos sem escanear', semScan, 'ok', 'escanear para a pasta RG')}
    </div>
    <div class="tc-rolo" style="margin-top:12px"><table class="dc-planilha lv-tab"><thead><tr>
      <th>Aplicador</th><th>Conjuntos em uso</th><th class="ce">Lavagens no mês</th><th>FORM 007 · ${esc(nomeMes(L.mes))}</th><th style="width:1%"></th>
    </tr></thead><tbody>
    ${vis.length ? vis.map(({ id, f }) => {
      const cs = ativosDe(id);
      const fm = formDe(id, L.mes) || {};
      const nMes = L.lavagens.filter(l => l.funcionario_id === id && l.data.startsWith(L.mes)).length;
      return `<tr><td><b>${esc(f.nome)}</b><br><span class="dc-sem">${esc(f.cargo || '')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}</span></td>
        <td>${cs.length ? cs.map(c => { const s = situacao(c); const pct = s.limite ? Math.min(100, Math.round(s.n / s.limite * 100)) : 0;
          return `<div class="lv-conj"><b>${APL(c.numero)}</b>${c.ca ? ` <span class="dc-sem">CA ${esc(c.ca)}</span>` : ''} · desde ${br(c.fornecido_em)}
            · <b>${s.n}</b>${s.limite ? `/${s.limite}` : ''} lavage${s.n === 1 ? 'm' : 'ns'} ${chip(s.sit.cor, s.sit.rotulo)}
            ${s.limite ? `<span class="ce-pct lv-pct"><i style="width:${pct}%"></i></span>` : ''}
            ${s.proxima ? `<small class="dc-sem">troca pela periodicidade em ${br(s.proxima)}</small>` : ''}</div>`; }).join('')
          : '<span class="dc-sem">nenhum conjunto em uso</span>'}</td>
        <td class="ce"><b>${nMes}</b></td>
        <td style="white-space:nowrap">
          <label class="es-check"><input type="checkbox" data-lv-form="${esc(id)}" data-campo="recolhido"${fm.recolhido ? ' checked' : ''}> recolhido</label>
          <label class="es-check"><input type="checkbox" data-lv-form="${esc(id)}" data-campo="escaneado"${fm.escaneado ? ' checked' : ''}> escaneado</label></td>
        <td style="white-space:nowrap">
          <button class="btn mini principal" type="button" data-lv-lancar="${esc(id)}">Lavagens</button>
          <button class="btn mini" type="button" data-lv-conj="${esc(id)}">Conjuntos</button></td></tr>`;
    }).join('') : `<tr><td colspan="5" class="dc-sem">${aps.length ? 'Nenhum aplicador neste filtro.' : 'Nenhum aplicador ainda. Toque em "+ Aplicador" e cadastre o conjunto APL 01 / APL 02 que ele recebeu.'}</td></tr>`}
    </tbody></table></div>
    <p class="dica" style="margin:8px 0 0">Limite de lavagens: vem do cadastro do EPI (Estoque › Cadastros › Itens · "Limite de lavagens", conforme o fabricante) ou do próprio conjunto.
      Aviso amarelo a partir de 80% do limite ou 15 dias antes da troca pela periodicidade.</p>
  </div>`;

  $('lvAtualizar').onclick = async () => { await carregar(true); desenhar(); };
  $('lvMes').addEventListener('change', ev => { L.mes = ev.target.value || hoje().slice(0, 7); desenhar(); });
  $('lvNovo').onclick = dialogoNovoAplicador;
  $('lvRel').onclick = () => mostrar(relatorio(aps), { barra: true });
  t.querySelectorAll('[data-lv-card]').forEach(b => b.addEventListener('click', () => { L.filtro = L.filtro === b.dataset.lvCard ? '' : b.dataset.lvCard; desenhar(); }));
  t.querySelectorAll('[data-lv-lancar]').forEach(b => b.addEventListener('click', () => dialogoLavagens(b.dataset.lvLancar)));
  t.querySelectorAll('[data-lv-conj]').forEach(b => b.addEventListener('click', () => dialogoConjuntos(b.dataset.lvConj)));
  t.querySelectorAll('[data-lv-form]').forEach(cx => cx.addEventListener('change', async () => {
    const fid = cx.dataset.lvForm, atual = formDe(fid, L.mes) || { id: fid + '|' + L.mes, funcionario_id: fid, mes: L.mes, recolhido: false, escaneado: false };
    const novo = { ...atual, [cx.dataset.campo]: cx.checked, atualizado_por: quem() };
    if (cx.dataset.campo === 'escaneado' && cx.checked) novo.recolhido = true;
    const r = await estado.cliente.from('epi_form007').upsert(novo).select().single();
    if (r.error) { alert('Não consegui gravar: ' + r.error.message); cx.checked = !cx.checked; return; }
    L.forms = L.forms.filter(x => x.id !== novo.id).concat(r.data);
    desenhar();
  }));
}

function dialogo(html) {
  let d = $('dlgEpiLav');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgEpiLav'; d.className = 'epm-dlg'; document.body.appendChild(d); }
  d.innerHTML = html; d.showModal();
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  return d;
}

/* ---- lavagens do mês: um quadro de 1 a 31, como o FORM 007 ---- */
function dialogoLavagens(fid) {
  const f = funcDe(fid) || { nome: '' };
  let mes = L.mes;
  const d = dialogo(`<form method="dialog" id="lvFormL">
    <h3>Lavagens · ${esc(f.nome)}</h3>
    <div class="grade"><label class="campo">Mês <input type="month" id="lvLMes" value="${esc(mes)}"></label></div>
    <p class="dica" style="margin:4px 0 8px">Marque em cada dia o conjunto lavado, como no FORM 007 (1 = APL 01, 2 = APL 02). Toque de novo para trocar ou limpar.</p>
    <div id="lvDias" class="lv-dias"></div>
    <p class="dica" id="lvTotal" style="margin:8px 0 0"></p>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="submit" id="lvSalvarL">Salvar</button>
    </div></form>`);
  let marca = new Map();
  const ler = () => {
    marca = new Map();
    for (const l of L.lavagens) if (l.funcionario_id === fid && l.data.startsWith(mes)) {
      const dia = +l.data.slice(8, 10); marca.set(dia, (marca.get(dia) || new Set()).add(Number(l.conjunto)));
    }
  };
  const rot = s => !s || !s.size ? '' : [...s].sort().join('+');
  const ciclo = s => { const r = rot(s); return r === '' ? new Set([1]) : r === '1' ? new Set([2]) : r === '2' ? new Set([1, 2]) : new Set(); };
  const pintar = () => {
    const n = diasNoMes(mes), ini = new Date(mes + '-01T12:00:00').getDay();
    $('lvDias').innerHTML = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => `<span class="lv-sem">${x}</span>`).join('')
      + '<span></span>'.repeat(ini)
      + Array.from({ length: n }, (_, i) => { const dia = i + 1, r = rot(marca.get(dia));
        return `<button type="button" class="lv-dia${r ? ' lv-on' : ''}" data-dia="${dia}"><small>${dia}</small><b>${r || '·'}</b></button>`; }).join('');
    $('lvDias').querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { const dia = +b.dataset.dia; marca.set(dia, ciclo(marca.get(dia))); pintar(); }));
    const tot = [...marca.values()].reduce((s, x) => s + x.size, 0);
    $('lvTotal').textContent = `${tot} lavage${tot === 1 ? 'm' : 'ns'} em ${nomeMes(mes)}.`;
  };
  $('lvLMes').addEventListener('change', ev => { mes = ev.target.value || mes; ler(); pintar(); });
  ler(); pintar();
  $('lvFormL').addEventListener('submit', async ev => {
    ev.preventDefault();
    $('lvSalvarL').disabled = true;
    const antes = L.lavagens.filter(l => l.funcionario_id === fid && l.data.startsWith(mes));
    const chave = (dia, c) => `${mes}-${String(dia).padStart(2, '0')}|${c}`;
    const quero = new Set(); for (const [dia, s] of marca) for (const c of s) quero.add(chave(dia, c));
    const tem = new Map(antes.map(l => [l.data + '|' + Number(l.conjunto), l]));
    const apagar = antes.filter(l => !quero.has(l.data + '|' + Number(l.conjunto))).map(l => l.id);
    const novos = [...quero].filter(k => !tem.has(k)).map(k => { const [data, c] = k.split('|'); return { funcionario_id: fid, data, conjunto: Number(c), atualizado_por: quem() }; });
    if (apagar.length) { const r = await estado.cliente.from('cl_lavagens').delete().in('id', apagar); if (r.error) { alert(r.error.message); $('lvSalvarL').disabled = false; return; } }
    if (novos.length) { const r = await estado.cliente.from('cl_lavagens').insert(novos); if (r.error) { alert(r.error.message); $('lvSalvarL').disabled = false; return; } }
    d.close(); await carregar(true); desenhar();
  });
}

/* ---- conjuntos APL 01 / APL 02 do aplicador ---- */
function dialogoConjuntos(fid) {
  const f = funcDe(fid) || { nome: '' };
  const todos = L.conjuntos.filter(c => c.funcionario_id === fid).sort((a, b) => String(b.fornecido_em).localeCompare(String(a.fornecido_em)));
  const vests = L.mov ? L.mov.D.itens.filter(i => i.ativo !== false && ehVestimenta(i)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : [];
  // sugestão: última entrega de vestimenta a este funcionário (SST › EPI's › Entregas)
  const sug = L.mov ? L.mov.entregas.filter(e => e.funcionario_id === fid).flatMap(e => e.linhas.map(l => ({ e, l, it: L.mov.itemDe(l.item_id) })))
    .filter(x => ehVestimenta(x.it)).sort((a, b) => b.e.data.localeCompare(a.e.data))[0] : null;
  const d = dialogo(`<form method="dialog" id="lvFormC">
    <h3>Conjuntos de aplicação · ${esc(f.nome)}</h3>
    ${todos.length ? `<table class="dc-planilha"><thead><tr><th>Conj.</th><th>EPI / CA</th><th>Fornecido</th><th class="ce">Lavagens</th><th>Situação</th><th></th></tr></thead><tbody>
      ${todos.map(c => { const s = situacao(c); return `<tr><td><b>${APL(c.numero)}</b></td><td>${esc(s.it ? s.it.nome : 'CA ' + (c.ca || '—'))}</td><td>${br(c.fornecido_em)}</td>
        <td class="ce">${s.n}${s.limite ? '/' + s.limite : ''}</td><td>${chip(s.sit.cor, s.sit.rotulo)}</td>
        <td>${c.trocado_em ? '' : `<button class="btn mini" type="button" data-trocar="${esc(c.id)}">Trocado</button>`}</td></tr>`; }).join('')}</tbody></table>`
      : '<p class="dica">Nenhum conjunto cadastrado.</p>'}
    <h4 style="margin:14px 0 6px">Novo conjunto</h4>
    ${sug ? `<p class="dica" style="margin:0 0 6px">Última vestimenta entregue: <b>${esc(sug.it.nome)}</b> em ${br(sug.e.data)} — já vem preenchido.</p>` : ''}
    <div class="grade">
      <label class="campo">Conjunto <select id="lvNum"><option value="1">APL 01</option><option value="2">APL 02</option></select></label>
      <label class="campo">Fornecido em <input type="date" id="lvForn" value="${esc(sug ? sug.e.data : hoje())}"></label>
      <label class="campo plena">EPI (vestimenta) <select id="lvItem"><option value="">— outro / sem cadastro —</option>
        ${vests.map(i => `<option value="${esc(i.id)}"${sug && sug.it.id === i.id ? ' selected' : ''}>${esc(i.nome)}</option>`).join('')}</select></label>
      <label class="campo">CA <input type="text" id="lvCa" value="${esc(sug ? sug.it.ca || '' : '')}"></label>
      <label class="campo">Limite de lavagens <input type="number" id="lvLim" min="1" step="1" placeholder="do cadastro do EPI"></label>
    </div>
    <p class="dica" id="lvAvisoC" style="margin:6px 0 0"></p>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Fechar</button>
      <button class="btn principal" type="submit">Cadastrar conjunto</button>
    </div></form>`);
  const ocupado = n => todos.some(c => !c.trocado_em && Number(c.numero) === n);
  $('lvNum').value = ocupado(1) && !ocupado(2) ? '2' : '1';
  $('lvItem').addEventListener('change', () => { const it = itemDe($('lvItem').value); if (it) { $('lvCa').value = it.ca || ''; $('lvLim').placeholder = it.lavagens_max ? `${it.lavagens_max} (do cadastro)` : 'sem limite no cadastro'; } });
  $('lvItem').dispatchEvent(new Event('change'));
  d.querySelectorAll('[data-trocar]').forEach(b => b.addEventListener('click', async () => {
    const quando = prompt('Data da troca (dd/mm/aaaa):', br(hoje()));
    if (!quando) return;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(quando.trim());
    if (!m) { alert('Use dd/mm/aaaa.'); return; }
    const r = await estado.cliente.from('cl_conjuntos').update({ trocado_em: `${m[3]}-${m[2]}-${m[1]}`, atualizado_por: quem() }).eq('id', b.dataset.trocar);
    if (r.error) { alert(r.error.message); return; }
    d.close(); await carregar(true); desenhar(); dialogoConjuntos(fid);
  }));
  $('lvFormC').addEventListener('submit', async ev => {
    ev.preventDefault();
    const n = Number($('lvNum').value);
    if (ocupado(n)) { $('lvAvisoC').textContent = `O ${APL(n)} ainda está em uso. Marque "Trocado" nele antes de cadastrar o novo.`; return; }
    if (!$('lvForn').value) { $('lvAvisoC').textContent = 'Informe a data de fornecimento.'; return; }
    const lim = parseInt($('lvLim').value, 10);
    const r = await estado.cliente.from('cl_conjuntos').insert({ funcionario_id: fid, numero: n, ca: $('lvCa').value.trim() || null,
      fornecido_em: $('lvForn').value, item_id: $('lvItem').value || null, limite_lavagens: lim > 0 ? lim : null, atualizado_por: quem() });
    if (r.error) { $('lvAvisoC').textContent = 'Não consegui gravar: ' + r.error.message; return; }
    d.close(); await carregar(true); desenhar();
  });
}

function dialogoNovoAplicador() {
  const funcs = (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const d = dialogo(`<form method="dialog" id="lvFormA">
    <h3>Novo aplicador</h3>
    <label class="campo">Funcionário <input type="text" id="lvFunc" list="lvFuncs" required placeholder="nome"></label>
    <datalist id="lvFuncs">${funcs.map(f => `<option value="${esc(f.nome)}">`).join('')}</datalist>
    <div class="barra" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="submit">Continuar</button></div></form>`);
  $('lvFormA').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = funcs.find(x => semAcento(x.nome) === semAcento($('lvFunc').value));
    if (!f) return;
    d.close(); dialogoConjuntos(f.id);
  });
}

function relatorio(aps) {
  return `<article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Higienização dos EPIs</h1><p>Lavagens dos conjuntos de aplicação · FORM 007 · ${esc(nomeMes(L.mes))}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span></span></div>
    </header>
    <table class="rel-tabela"><thead><tr><th>Aplicador</th><th>Conjunto</th><th>CA</th><th>Fornecido</th><th style="text-align:center">Lavagens (total)</th>
      <th style="text-align:center">Limite</th><th style="text-align:center">No mês</th><th>Situação</th><th>FORM 007</th></tr></thead><tbody>
    ${aps.flatMap(({ id, f }) => {
      const cs = ativosDe(id); const fm = formDe(id, L.mes) || {};
      const lin = cs.length ? cs : [null];
      return lin.map((c, i) => { const s = c ? situacao(c) : null;
        const nMes = c ? L.lavagens.filter(l => l.funcionario_id === id && Number(l.conjunto) === Number(c.numero) && l.data.startsWith(L.mes)).length : 0;
        return `<tr><td>${i ? '' : esc(f.nome)}</td><td>${c ? APL(c.numero) : '—'}</td><td>${esc(c && c.ca || '—')}</td><td>${c ? br(c.fornecido_em) : '—'}</td>
          <td style="text-align:center">${s ? s.n : '—'}</td><td style="text-align:center">${s && s.limite || '—'}</td><td style="text-align:center">${nMes}</td>
          <td>${s ? (['limite', 'vencido'].includes(s.sit.chave) ? `<span class="rel-pend">${esc(s.sit.rotulo)}</span>` : esc(s.sit.rotulo)) : '—'}</td>
          <td>${i ? '' : fm.escaneado ? '<span class="rel-ok">escaneado</span>' : fm.recolhido ? 'recolhido' : '<span class="rel-pend">a recolher</span>'}</td></tr>`; });
    }).join('') || '<tr><td colspan="9">Nenhum aplicador.</td></tr>'}
    </tbody></table>
    <p class="rel-nota">Lavagens lançadas a partir do FORM 007 – Higienização dos EPI's (papel, rev. 02). Total = lavagens desde o fornecimento do conjunto.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
