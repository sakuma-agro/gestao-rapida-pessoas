// treino-consolidado.js — SST › Treinamentos › Consolidado (22/10/2026).
//
// Pedido dele (prévia aprovada em 22/10/2026): todos os treinamentos já
// realizados, com as reciclagens, sem situação de vencimento. Escolhido um
// funcionário, aparece o cartão dele e o histórico completo separado por ano.
// Cada linha abre o certificado do Drive.
//
// Não guarda nada próprio: lê o catálogo e os lançamentos do sst.js (que já
// têm cópia local, então a tela abre sem internet; só o certificado precisa).
import { estado } from './store.js';
import { LOGO, PE_LOP } from './seed.js';
import { iniciais } from './aniversarios.js';
import { garantirSst, sstCarregado, lancamentosSst, anexoSst, lerAnexosSst,
  verAnexoSst, abrirLancamentoSst } from './sst.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const hoje = () => new Date().toISOString().slice(0, 10);
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const num = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const horas = n => n ? num(n) + ' h' : '—';

const dados = () => lancamentosSst().treinamento;
const tipoDe = id => dados().tipos.find(t => t.id === id) || {};
const pessoa = id => estado.funcionarios.find(f => f.id === id);
/* Nº do certificado: a importação da planilha guardou na observação
   ("Cert. nº 1318314 · Conclusão ..."). */
const nCert = x => (/cert\.?\s*n[º°o.]?\s*([\w\-/.]+)/i.exec(x.observacao || '') || [])[1] || '';

/* =============== filtros =============== */
function linhas() {
  const fid = $('tcFunc').value, tid = $('tcTipo').value, nr = $('tcNr').value;
  const de = $('tcDe').value, ate = $('tcAte').value, sit = $('tcSit').value;
  return dados().regs.filter(x => {
    const f = pessoa(x.funcionario_id);
    if (!f) return false;
    if (fid) { if (x.funcionario_id !== fid) return false; }
    else if (sit && f.situacao !== sit) return false;
    if (tid && x.tipo_id !== tid) return false;
    const n = tipoDe(x.tipo_id).nr || '';
    if (nr === '-' ? n : nr && n !== nr) return false;
    if (de && (x.realizado || '') < de) return false;
    if (ate && (x.realizado || '') > ate) return false;
    return true;
  }).sort((a, b) => so(b.realizado).localeCompare(so(a.realizado)) ||
    so(pessoa(a.funcionario_id)?.nome).localeCompare(so(pessoa(b.funcionario_id)?.nome), 'pt-BR'));
}

function montarFiltros() {
  const { tipos, regs } = dados();
  const sit = $('tcSit').value;

  const selF = $('tcFunc'), antesF = selF.value;
  const comReg = new Set(regs.map(x => x.funcionario_id));
  selF.innerHTML = '<option value="">Todos</option>' + estado.funcionarios
    .filter(f => comReg.has(f.id) && (!sit || f.situacao === sit || f.id === antesF))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('');
  selF.value = antesF;

  const selT = $('tcTipo'), antesT = selT.value;
  selT.innerHTML = '<option value="">Todos</option>' +
    tipos.filter(t => regs.some(x => x.tipo_id === t.id) || t.id === antesT)
      .map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  selT.value = antesT;

  const selN = $('tcNr'), antesN = selN.value;
  const nrs = [...new Set(tipos.map(t => so(t.nr)).filter(Boolean))].sort();
  selN.innerHTML = '<option value="">Todas</option>' +
    nrs.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
    '<option value="-">Sem NR</option>';
  selN.value = antesN;
}

/* =============== tela =============== */
const tagRec = t => t.recicla_tipo_id ? '<br><span class="tag tc-rec">RECICLAGEM</span>' : '';
const celNr = t => t.nr ? `<b>${esc(t.nr)}</b>` : '<span class="dc-sem">—</span>';
const celCert = x => anexoSst('treinamento', x.id)
  ? `<button class="btn mini principal" type="button" data-cert="${x.id}">Abrir</button>`
  : '<span class="dc-sem">não anexado</span>';

function desenhar() {
  if (!sstCarregado()) return;
  montarFiltros();
  const lista = linhas();
  const fid = $('tcFunc').value;
  const f = fid ? pessoa(fid) : null;
  const totH = lista.reduce((s, x) => s + Number(x.carga_horaria || 0), 0);
  const comCert = lista.filter(x => anexoSst('treinamento', x.id)).length;

  if (f) {
    const meta = [f.cargo, f.admissao ? 'Admissão ' + dataBr(f.admissao) : '', f.fazenda]
      .filter(Boolean).map(esc).join(' · ');
    $('tcResumo').innerHTML = `
      <div class="tc-pessoa">
        <div class="tc-foto">${esc(iniciais(f.nome))}</div>
        <div class="tc-quem"><h3>${esc(f.nome)}</h3><div class="dc-sem">${meta || '—'}</div></div>
        <div class="tc-nums">
          <div>Treinamentos<b>${lista.length}</b></div>
          <div>Horas<b>${num(totH)}</b></div>
          <div>Certificados<b>${comCert} de ${lista.length}</b></div>
        </div>
      </div>`;
  } else {
    const gente = new Set(lista.map(x => x.funcionario_id)).size;
    $('tcResumo').innerHTML = `<div class="tc-chips">
      <span class="tc-chip"><b>${lista.length}</b>treinamentos realizados</span>
      <span class="tc-chip"><b>${gente}</b>funcionários</span>
      <span class="tc-chip"><b>${num(totH)}</b>horas de treinamento</span>
      <span class="tc-chip"><b>${comCert}</b>com certificado anexado</span>
    </div>`;
  }

  let ano = '';
  $('tcTabela').innerHTML = !lista.length
    ? '<div class="vazio">Nenhum treinamento com esses filtros.</div>'
    : `<table class="dc-planilha"><thead><tr>
        ${f ? '' : '<th>Funcionário</th>'}<th>Treinamento</th><th class="ce">NR</th>
        <th class="ce">Realizado em</th><th class="ce">Carga</th><th>Instrutor</th>
        ${f ? '<th>Nº do certificado</th>' : ''}<th class="ce">Certificado</th><th></th>
      </tr></thead><tbody>
      ${lista.map(x => {
        const t = tipoDe(x.tipo_id), p = pessoa(x.funcionario_id) || {};
        const a = so(x.realizado).slice(0, 4);
        const grupo = f && a !== ano ? `<tr class="tc-ano"><td colspan="8">${esc(a || 'Sem data')}</td></tr>` : '';
        ano = a;
        return grupo + `<tr>
          ${f ? '' : `<td><b>${esc(p.nome)}</b><br><span class="dc-sem">${esc(p.cargo || '—')}</span></td>`}
          <td>${esc(t.nome || '—')}${tagRec(t)}</td>
          <td class="ce">${celNr(t)}</td>
          <td class="ce tc-n">${dataBr(x.realizado)}</td>
          <td class="ce tc-n">${horas(x.carga_horaria)}</td>
          <td>${esc(x.instrutor || '—')}</td>
          ${f ? `<td class="tc-n">${esc(nCert(x) || '—')}</td>` : ''}
          <td class="ce">${celCert(x)}</td>
          <td class="ce"><button class="btn mini" type="button" data-reg="${x.id}">Editar</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;

  $('tcTabela').querySelectorAll('[data-cert]').forEach(b =>
    b.addEventListener('click', () => verAnexoSst('treinamento', b.dataset.cert, b)));
  $('tcTabela').querySelectorAll('[data-reg]').forEach(b =>
    b.addEventListener('click', () => abrirLancamentoSst('treinamento', b.dataset.reg)));

  $('tcDicaImp').textContent = f
    ? 'Imprime o histórico de treinamentos do funcionário (A4).'
    : 'Imprime a lista filtrada (A4 deitada).';
  $('tcSaida').innerHTML = documento(lista, f, totH);
}

/* =============== impresso =============== */
const folha = (titulo, subtitulo, corpo, pe, deitada) => `
  <div class="an-folha${deitada ? ' deitada' : ''}">
    <div class="an-topo">
      <img src="${LOGO}" alt="">
      <div class="an-tit"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
    </div>
    ${corpo}
    <div class="an-pe"><span>${esc(pe || '')}</span><span>SAKUMA Agronegócios</span></div>
    ${PE_LOP}
  </div>`;

function documento(lista, f, totH) {
  const deitada = !f;
  const porFolha = f ? 22 : 14;
  const titulo = f ? 'HISTÓRICO DE TREINAMENTOS' : 'TREINAMENTOS CONSOLIDADOS';
  const subt = (f ? `${f.nome}${f.cargo ? ' · ' + f.cargo : ''} · ` : '') + dataBr(hoje());
  const pe = `${lista.length} treinamento(s) · ${num(totH)} h`;
  if (!lista.length) return folha(titulo, subt, '<p class="pn-nada">Nenhum treinamento com esses filtros.</p>', pe, deitada);
  const total = Math.ceil(lista.length / porFolha);
  const out = [];
  for (let p = 0; p < total; p++) {
    const fatia = lista.slice(p * porFolha, (p + 1) * porFolha);
    const corpo = `<table class="an-tab tc-imp">
      <colgroup>${f ? '' : '<col style="width:62mm">'}<col><col style="width:16mm"><col style="width:22mm"><col style="width:15mm"><col style="width:${f ? 32 : 45}mm"></colgroup>
      <thead><tr>${f ? '' : '<th>FUNCIONÁRIO</th>'}<th>TREINAMENTO</th><th class="ce">NR</th>
        <th class="ce">REALIZADO</th><th class="ce">CARGA</th><th>INSTRUTOR</th></tr></thead>
      <tbody>${fatia.map(x => {
        const t = tipoDe(x.tipo_id), pz = pessoa(x.funcionario_id) || {};
        return `<tr>${f ? '' : `<td class="an-nome">${esc(pz.nome)}</td>`}
          <td>${esc(t.nome || '—')}${t.recicla_tipo_id ? ' <b>(reciclagem)</b>' : ''}</td>
          <td class="ce">${esc(t.nr || '—')}</td><td class="ce">${dataBr(x.realizado)}</td>
          <td class="ce">${horas(x.carga_horaria)}</td><td>${esc(x.instrutor || '—')}</td></tr>`;
      }).join('')}</tbody></table>`;
    out.push(folha(titulo, subt, corpo, pe + (total > 1 ? ` · folha ${p + 1} de ${total}` : ''), deitada));
  }
  return out.join('');
}

/* =============== ligações =============== */
export async function abrirConsolidado() {
  if (!sstCarregado()) {
    try { await garantirSst(); }
    catch (e) { $('tcTabela').innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`; return; }
  }
  desenhar();
  try { await lerAnexosSst(); } catch { /* sem internet: segue sem saber quem tem certificado */ }
  if (!$('telaTrConsol').hidden) desenhar();
}

export function ligarConsolidado() {
  ['tcFunc', 'tcTipo', 'tcNr', 'tcDe', 'tcAte', 'tcSit'].forEach(id =>
    $(id).addEventListener('change', desenhar));
  $('bLancarTc').addEventListener('click', () => abrirLancamentoSst('treinamento', null));
  $('bImprimirTc').addEventListener('click', () => { if (so($('tcSaida').innerHTML)) window.print(); });
  addEventListener('gr:sst-mudou', () => { if (!$('telaTrConsol').hidden) desenhar(); });
}
