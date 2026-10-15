// sst-calendario.js — SST › Calendário (15/10/2026)
//
// Pedido dele: um calendário do SST onde aparece tudo de exames e
// treinamentos num lugar só. Cada dia mostra:
//   • VENCE  — o vencimento do lançamento VIGENTE de cada pessoa em cada tipo
//              (o mais recente do grupo; reciclagem conta junto, como nas
//              telas de Vencimentos). Lançamento já renovado não aparece.
//   • FEITO  — o que foi realizado naquele dia (todos os lançamentos).
// Agendamento de turma futura ainda não existe — fica para quando ele pedir.
//
// Só leitura: "Abrir" usa o mesmo diálogo de lançamento das telas de
// Vencimentos, e só aparece para quem pode lançar ali.

import { estado } from './store.js';
import { podeTela } from './acesso.js';
import { mostrar, imprimir } from './jornada-relatorios.js';
import { garantirSst, sstCarregado, lancamentosSst, grupoSst, anexoSst, lerAnexosSst,
  abrirLancamentoSst, verAnexoSst } from './sst.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const KIND = { exame: 'Exame', treinamento: 'Treinamento' };
const TELA_LANC = { exame: 'exVenc', treinamento: 'trVenc' };

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const rotMes = ym => `${MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const diasNoMes = ym => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const diaSemana = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
const somaMes = (ym, n) => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); };

/* ---------------- filtros ---------------- */
const cal = {
  mes: hoje().slice(0, 7),
  dia: hoje(),
  kinds: { exame: true, treinamento: true },
  eventos: { vence: true, feito: true },
  func: '', fazenda: '', sit: 'ATIVO',
};

/* ---------------- os eventos ---------------- */
function todosEventos() {
  const L = lancamentosSst();
  const pessoas = new Map(estado.funcionarios.map(f => [f.id, f]));
  const out = [];
  for (const kind of ['exame', 'treinamento']) {
    const { tipos, regs } = L[kind];
    const tipo = id => tipos.find(t => t.id === id);
    // regs já vêm do mais novo para o mais velho: o primeiro de cada par é o vigente
    const vistos = new Set();
    for (const x of regs) {
      const f = pessoas.get(x.funcionario_id);
      if (!f) continue;
      const chave = x.funcionario_id + '|' + grupoSst(kind, x.tipo_id);
      const vigente = !vistos.has(chave);
      vistos.add(chave);
      const base = { kind, f, reg: x, nome: tipo(x.tipo_id)?.nome || '—' };
      if (x.realizado) out.push({ ...base, ev: 'feito', data: String(x.realizado).slice(0, 10) });
      if (vigente && x.vence) out.push({ ...base, ev: 'vence', data: String(x.vence).slice(0, 10) });
    }
  }
  return out;
}

function filtrados() {
  return todosEventos().filter(e =>
    cal.kinds[e.kind] && cal.eventos[e.ev] &&
    (!cal.func || e.f.id === cal.func) &&
    (!cal.fazenda || (cal.fazenda === '-' ? !limpo(e.f.fazenda) : limpo(e.f.fazenda) === cal.fazenda)) &&
    (!cal.sit || (e.f.situacao || 'ATIVO') === cal.sit || e.f.id === cal.func));
}

const ordem = (a, b) => (a.ev === b.ev ? 0 : a.ev === 'vence' ? -1 : 1) ||
  a.kind.localeCompare(b.kind) || a.f.nome.localeCompare(b.f.nome, 'pt-BR');

/* ---------------- a tela ---------------- */
export async function abrirCalendarioSst() {
  const alvo = $('telaSstCal');
  if (!alvo) return;
  if (!sstCarregado()) {
    alvo.innerHTML = '<div class="cartao"><div class="vazio">Carregando exames e treinamentos…</div></div>';
    try { await garantirSst(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div></div>`; return; }
  }
  desenhar();
  lerAnexosSst().then(() => { if (!alvo.hidden) desenhar(); }).catch(() => {});
}

function desenhar() {
  const alvo = $('telaSstCal');
  const evs = filtrados();
  const ym = cal.mes, h = hoje();
  const doMes = evs.filter(e => e.data.slice(0, 7) === ym);
  const porDia = new Map();
  doMes.forEach(e => { if (!porDia.has(e.data)) porDia.set(e.data, []); porDia.get(e.data).push(e); });

  // vencidos em aberto: o vigente já venceu e não foi renovado (qualquer mês)
  const atrasados = evs.filter(e => e.ev === 'vence' && e.data < h);
  const nVence = doMes.filter(e => e.ev === 'vence').length;
  const nFeito = doMes.filter(e => e.ev === 'feito').length;

  const comLanc = new Set(todosEventos().map(e => e.f.id));
  const gente = estado.funcionarios.filter(f => comLanc.has(f.id) && (!cal.sit || (f.situacao || 'ATIVO') === cal.sit || f.id === cal.func))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const fazendas = [...new Set(estado.funcionarios.map(f => limpo(f.fazenda)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // grade do mês, começando no domingo
  const n = diasNoMes(ym), pula = diaSemana(ym + '-01');
  const celulas = [];
  for (let i = 0; i < pula; i++) celulas.push('<div class="sc-dia sc-fora"></div>');
  for (let d = 1; d <= n; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const l = (porDia.get(iso) || []).sort(ordem);
    const cont = k => l.filter(e => e.kind === k.split(':')[0] && e.ev === k.split(':')[1]).length;
    const chips = l.slice(0, 3).map(e => `<span class="sc-chip sc-${e.kind} sc-${e.ev}${e.ev === 'vence' && e.data < h ? ' sc-atraso' : ''}">${e.ev === 'feito' ? '✓ ' : ''}${esc(e.f.apelido || e.f.nome.split(' ')[0])}</span>`).join('');
    const pontos = ['exame:vence', 'treinamento:vence', 'exame:feito', 'treinamento:feito']
      .map(k => cont(k) ? `<i class="sc-ponto sc-${k.replace(':', ' sc-')}">${cont(k)}</i>` : '').join('');
    celulas.push(`<button type="button" class="sc-dia${iso === h ? ' sc-hoje' : ''}${iso === cal.dia ? ' sc-sel' : ''}${l.length ? ' sc-tem' : ''}" data-dia="${iso}"
      aria-label="${d} de ${MESES[Number(ym.slice(5)) - 1]}: ${l.length} item(ns)">
      <span class="sc-num">${d}</span>
      <span class="sc-chips">${chips}${l.length > 3 ? `<span class="sc-mais">+${l.length - 3}</span>` : ''}</span>
      <span class="sc-pontos">${pontos}</span>
    </button>`);
  }

  const doDia = cal.dia.slice(0, 7) === ym ? (porDia.get(cal.dia) || []).sort(ordem) : [];

  alvo.innerHTML = `
    <div class="cartao">
      <div class="barra entre" style="margin:0">
        <div>
          <h2 style="margin:0">Calendário do SST</h2>
          <p class="dica" style="margin:2px 0 0">Vencimentos e realizados de exames e treinamentos. Toque num dia para ver a lista.</p>
        </div>
        <span class="barra">
          <button class="btn" type="button" id="scImp">Imprimir o mês</button>
        </span>
      </div>

      <div class="sc-nav">
        <button class="btn mini" type="button" id="scAnt" aria-label="Mês anterior">‹</button>
        <strong>${esc(rotMes(ym))}</strong>
        <button class="btn mini" type="button" id="scProx" aria-label="Próximo mês">›</button>
        ${ym !== h.slice(0, 7) ? '<button class="btn mini" type="button" id="scHoje">Hoje</button>' : ''}
      </div>

      <div class="grade larga sc-filtros">
        <label class="campo">Funcionário <select id="scFunc"><option value="">Todos</option>
          ${gente.map(f => `<option value="${f.id}"${f.id === cal.func ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
        <label class="campo">Fazenda <select id="scFaz"><option value="">Todas</option>
          ${fazendas.map(z => `<option${z === cal.fazenda ? ' selected' : ''}>${esc(z)}</option>`).join('')}
          ${estado.funcionarios.some(f => !limpo(f.fazenda)) ? `<option value="-"${cal.fazenda === '-' ? ' selected' : ''}>Sem fazenda</option>` : ''}</select></label>
        <label class="campo">Funcionários <select id="scSit">
          <option value="ATIVO"${cal.sit === 'ATIVO' ? ' selected' : ''}>Somente ativos</option>
          <option value=""${cal.sit === '' ? ' selected' : ''}>Todos</option></select></label>
      </div>
      <div class="sc-marcas">
        <label class="sc-marca sc-exame"><input type="checkbox" data-kind="exame"${cal.kinds.exame ? ' checked' : ''}> Exames</label>
        <label class="sc-marca sc-treinamento"><input type="checkbox" data-kind="treinamento"${cal.kinds.treinamento ? ' checked' : ''}> Treinamentos</label>
        <span class="sc-sep"></span>
        <label class="sc-marca"><input type="checkbox" data-ev="vence"${cal.eventos.vence ? ' checked' : ''}> Vencimentos</label>
        <label class="sc-marca"><input type="checkbox" data-ev="feito"${cal.eventos.feito ? ' checked' : ''}> Realizados</label>
      </div>

      <div class="sc-resumo">
        <span class="contagem"><b>${nVence}</b> vencimento(s) no mês</span>
        <span class="contagem"><b>${nFeito}</b> realizado(s) no mês</span>
        ${cal.eventos.vence && atrasados.length ? `<button type="button" class="contagem sc-atrasados" id="scAtr"><b>${atrasados.length}</b> vencido(s) sem renovar</button>` : ''}
      </div>

      <div class="sc-grade" role="grid">
        ${SEMANA.map(s => `<div class="sc-sem">${s}</div>`).join('')}
        ${celulas.join('')}
      </div>
      <p class="dica sc-legenda">
        <span class="sc-chip sc-exame sc-vence">Exame vence</span>
        <span class="sc-chip sc-treinamento sc-vence">Treinamento vence</span>
        <span class="sc-chip sc-exame sc-feito">✓ realizado</span>
        <span class="sc-chip sc-treinamento sc-vence sc-atraso">já vencido</span>
      </p>

      <div id="scLista">${listaDia(doDia)}</div>
    </div>`;

  ligar(alvo, atrasados);
}

function linha(e) {
  const atraso = e.ev === 'vence' && e.data < hoje();
  const podeAbrir = podeTela(TELA_LANC[e.kind]);
  const anexo = anexoSst(e.kind, e.reg.id);
  return `<tr>
    <td><b>${esc(e.f.nome)}</b><br><span class="dc-sem">${esc([limpo(e.f.cargo), limpo(e.f.fazenda)].filter(Boolean).join(' · ') || '—')}</span></td>
    <td><span class="sc-chip sc-${e.kind} sc-${e.ev}">${KIND[e.kind]}</span><br>${esc(e.nome)}</td>
    <td class="ce">${e.ev === 'vence'
      ? `<span class="tag ${atraso ? 'inativo' : 'alerta'}">${atraso ? 'Venceu' : 'Vence'} ${br(e.data)}</span>`
      : `<span class="tag ativo">Realizado ${br(e.data)}</span>`}</td>
    <td class="ce sc-acoes">
      ${anexo ? `<button class="btn mini principal" type="button" data-sc-anexo="${e.kind}|${e.reg.id}">${e.kind === 'exame' ? 'ASO' : 'Certificado'}</button>` : ''}
      ${podeAbrir ? `<button class="btn mini" type="button" data-sc-abrir="${e.kind}|${e.reg.id}">Abrir</button>` : ''}
    </td></tr>`;
}

function listaDia(l, titulo) {
  const t = titulo || `Dia ${br(cal.dia)}`;
  return `<div class="sc-dialista">
    <h3>${esc(t)}</h3>
    ${l.length ? `<div class="tc-rolagem"><table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>Exame / treinamento</th><th class="ce">Data</th><th></th></tr></thead>
      <tbody>${l.map(linha).join('')}</tbody></table></div>`
    : '<div class="vazio">Nada neste dia com os filtros escolhidos.</div>'}
  </div>`;
}

function ligar(alvo, atrasados) {
  const redesenha = () => desenhar();
  const irMes = ym => { cal.mes = ym; cal.dia = ym === hoje().slice(0, 7) ? hoje() : ym + '-01'; redesenha(); };
  $('scAnt').addEventListener('click', () => irMes(somaMes(cal.mes, -1)));
  $('scProx').addEventListener('click', () => irMes(somaMes(cal.mes, 1)));
  $('scHoje')?.addEventListener('click', () => irMes(hoje().slice(0, 7)));
  $('scFunc').addEventListener('change', ev => { cal.func = ev.target.value; redesenha(); });
  $('scFaz').addEventListener('change', ev => { cal.fazenda = ev.target.value; redesenha(); });
  $('scSit').addEventListener('change', ev => { cal.sit = ev.target.value; redesenha(); });
  alvo.querySelectorAll('[data-kind]').forEach(c => c.addEventListener('change', () => { cal.kinds[c.dataset.kind] = c.checked; redesenha(); }));
  alvo.querySelectorAll('[data-ev]').forEach(c => c.addEventListener('change', () => { cal.eventos[c.dataset.ev] = c.checked; redesenha(); }));
  alvo.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
    cal.dia = b.dataset.dia;
    alvo.querySelectorAll('.sc-sel').forEach(x => x.classList.remove('sc-sel'));
    b.classList.add('sc-sel');
    const l = filtrados().filter(e => e.data === cal.dia).sort(ordem);
    $('scLista').innerHTML = listaDia(l);
    ligarLista();
    $('scLista').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
  $('scAtr')?.addEventListener('click', () => {
    const l = [...atrasados].sort((a, b) => a.data.localeCompare(b.data) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
    $('scLista').innerHTML = listaDia(l, `Vencidos sem renovar (${l.length})`);
    ligarLista();
    $('scLista').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('scImp').addEventListener('click', () => { mostrar(documentoMes(), { barra: true }); setTimeout(() => imprimir(), 300); });
  ligarLista();
}

function ligarLista() {
  const lista = $('scLista');
  lista.querySelectorAll('[data-sc-abrir]').forEach(b => b.addEventListener('click', () => {
    const [k, id] = b.dataset.scAbrir.split('|');
    abrirLancamentoSst(k, id);
  }));
  lista.querySelectorAll('[data-sc-anexo]').forEach(b => b.addEventListener('click', () => {
    const [k, id] = b.dataset.scAnexo.split('|');
    verAnexoSst(k, id, b);
  }));
}

/* ---------------- o documento do mês (padrão SAKUMA) ---------------- */
function documentoMes() {
  const ym = cal.mes, h = hoje();
  const l = filtrados().filter(e => e.data.slice(0, 7) === ym)
    .sort((a, b) => a.data.localeCompare(b.data) || ordem(a, b));
  const recorte = [
    cal.func ? estado.funcionarios.find(f => f.id === cal.func)?.nome : '',
    cal.fazenda ? (cal.fazenda === '-' ? 'sem fazenda' : cal.fazenda) : 'todas as fazendas',
    [cal.kinds.exame && 'exames', cal.kinds.treinamento && 'treinamentos'].filter(Boolean).join(' e '),
  ].filter(Boolean).join(' · ');
  const nV = l.filter(e => e.ev === 'vence').length, nF = l.length - nV;
  return `
  <article class="rel rel-paisagem">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>CALENDÁRIO DO SST</h1>
        <p>${esc(rotMes(ym))} · exames e treinamentos</p>
      </div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(h)}</strong><span>${esc(recorte)}</span></div>
    </header>
    <div class="rel-ficha">
      <div><span>Vencimentos no mês</span><b>${nV}</b></div>
      <div><span>Realizados no mês</span><b>${nF}</b></div>
    </div>
    <table class="rel-tabela">
      <thead><tr><th>Data</th><th>Funcionário</th><th>Fazenda</th><th>Tipo</th><th>Exame / treinamento</th><th>Evento</th></tr></thead>
      <tbody>${l.length ? l.map(e => `<tr>
        <td>${br(e.data)}</td><td>${esc(e.f.nome)}</td><td>${esc(limpo(e.f.fazenda)) || '—'}</td>
        <td>${KIND[e.kind]}</td><td>${esc(e.nome)}</td>
        <td>${e.ev === 'feito' ? 'Realizado' : e.data < h ? 'Venceu' : 'Vence'}</td></tr>`).join('')
        : `<tr><td colspan="6" class="rel-vazio">Nada em ${esc(rotMes(ym))} com os filtros escolhidos.</td></tr>`}</tbody>
      ${l.length ? `<tfoot><tr><td colspan="6">${l.length} item(ns)</td></tr></tfoot>` : ''}
    </table>
    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}
