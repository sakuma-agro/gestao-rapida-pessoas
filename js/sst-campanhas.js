// sst-campanhas.js — SST › Campanhas de segurança e saúde (21/10/2026)
//
// Uma campanha é uma ação de conscientização com começo e fim: tema, período,
// público, atividades e evidências. Três tabelas:
//  · sst_campanha_temas      — catálogo (Abril Verde, calor, NR-31…), vem com
//                              objetivo, público e atividades sugeridas;
//  · sst_campanhas           — a campanha em si;
//  · sst_campanha_atividades — DDS, palestra, treinamento, material, inspeção,
//                              simulado… cada uma com data, local, ministrante
//                              e os funcionários que assinaram (participantes).
//
// Regras:
//  · Cobertura = funcionários ativos do público que participaram de pelo menos
//    uma atividade realizada. Público = setores e/ou fazendas marcados; nada
//    marcado = todo mundo ativo.
//  · "Gerar lista" leva para Cadastros › Certificação › Lista de presença com
//    tema, horário, ministrante e participantes já preenchidos (app.js expõe
//    prepararListaPresenca). Quem assinou volta pelo botão "Presença".
//  · Calendário anual: cada mês mostra as campanhas que o tocam e os temas do
//    catálogo cujo mes_sugerido casa; "Criar" nasce da linha do catálogo.
//  · Banco trancado por app_pode('sst'). Documento na moldura .rel do DP.

import { estado } from './store.js';
import { mostrar } from './jornada-relatorios.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const brCurto = s => s ? String(s).slice(5, 10).split('-').reverse().join('/') : '—';
const quem = () => estado.sessao?.user?.email || null;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ---------------- listas fixas ---------------- */
export const TIPOS_ATIV = {
  dds: 'DDS', palestra: 'Palestra', treinamento: 'Treinamento', material: 'Material / cartaz',
  inspecao: 'Inspeção', simulado: 'Simulado', outro: 'Outro',
};
const SIT_CAMP = { planejada: ['Planejada', 'alerta'], andamento: ['Em andamento', 'ativo'], encerrada: ['Encerrada', 'neutra'] };
const SIT_ATIV = { planejada: ['Planejada', 'neutra'], agendada: ['Agendada', 'alerta'], realizada: ['Realizada', 'ativo'], cancelada: ['Cancelada', 'perigo'] };

/* ---------------- estado ---------------- */
const S = { carregado: false, temas: [], camps: [], ativs: [], ano: '', aberta: null, filtro: { sit: '', q: '' } };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const [t, k, a] = await Promise.all([
    c.from('sst_campanha_temas').select('*').order('nome'),
    c.from('sst_campanhas').select('*').order('inicio', { ascending: false }),
    c.from('sst_campanha_atividades').select('*').order('data'),
  ]);
  for (const r of [t, k, a]) if (r.error) throw r.error;
  S.temas = t.data || []; S.camps = k.data || []; S.ativs = a.data || [];
  S.carregado = true;
}

const temaDe = c => S.temas.find(t => t.id === c?.tema_id) || null;
const ativsDe = c => S.ativs.filter(a => a.campanha_id === c.id);
const funcionario = id => (estado.funcionarios || []).find(f => f.id === id) || null;
const ativos = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO');
const anoDe = c => String(c.inicio || '').slice(0, 4);
const fazendas = () => [...new Set(ativos().map(f => so(f.fazenda)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const setores = () => [...new Set(ativos().map(f => so(f.setor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/* ===================================================================
   AS CONTAS
   =================================================================== */
/** Funcionários ativos que fazem parte do público da campanha. */
export function publicoDe(c) {
  const set = (c.setores || []).map(so).filter(Boolean);
  const faz = (c.fazendas || []).map(so).filter(Boolean);
  return ativos().filter(f =>
    (!set.length || set.includes(so(f.setor))) && (!faz.length || faz.includes(so(f.fazenda))));
}
export function coberturaDe(c) {
  const pub = publicoDe(c);
  const assinaram = new Set();
  ativsDe(c).filter(a => a.situacao === 'realizada').forEach(a => (a.participantes || []).forEach(id => assinaram.add(id)));
  const dentro = pub.filter(f => assinaram.has(f.id)).length;
  return { publico: pub.length, participaram: dentro, pct: pub.length ? Math.round(dentro / pub.length * 100) : 0, total: assinaram.size };
}
const contagem = c => {
  const l = ativsDe(c).filter(a => a.situacao !== 'cancelada');
  return { feitas: l.filter(a => a.situacao === 'realizada').length, total: l.length };
};
/** Situação deduzida das datas, quando quem cadastrou não mexeu. */
const sitEfetiva = c => c.situacao;

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function desenharPainel() {
  const tela = $('telaCamPainel');
  if (!S.ano) S.ano = String(new Date().getFullYear());
  const anos = [...new Set([String(new Date().getFullYear()), ...S.camps.map(anoDe).filter(Boolean)])].sort().reverse();
  const doAno = S.camps.filter(c => anoDe(c) === S.ano);
  const andamento = S.camps.filter(c => sitEfetiva(c) === 'andamento');
  const planejadas = S.camps.filter(c => sitEfetiva(c) === 'planejada');

  // cobertura do ano: quem participou de qualquer atividade realizada no ano
  const assin = new Set();
  S.ativs.filter(a => a.situacao === 'realizada' && String(a.data || '').startsWith(S.ano))
    .forEach(a => (a.participantes || []).forEach(id => assin.add(id)));
  const at = ativos();
  const cob = at.filter(f => assin.has(f.id)).length;
  const ativAno = S.ativs.filter(a => doAno.some(c => c.id === a.campanha_id) && a.situacao !== 'cancelada');
  const feitas = ativAno.filter(a => a.situacao === 'realizada').length;

  const proximas = S.ativs.filter(a => ['agendada', 'planejada'].includes(a.situacao) && a.data && a.data >= hoje())
    .sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  const atrasadas = S.ativs.filter(a => a.situacao === 'agendada' && a.data && a.data < hoje());

  const cartao = (cor, rot, n, dica) => `<div class="pv-card pv-${cor}${n ? '' : ' pv-zero'}"><span>${esc(rot)}</span><strong>${n}</strong><small>${esc(dica)}</small></div>`;

  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Campanhas de segurança e saúde</h2>
        <p class="dica" style="margin:2px 0 0">Ações de conscientização com começo e fim: tema, período, público, atividades e quem participou.</p></div>
      <span class="barra">
        <label class="campo" style="margin:0">Ano <select id="cmPnAno">${anos.map(a => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <button class="btn principal" type="button" id="cmPnNova">Nova campanha</button>
      </span>
    </div>

    <div class="pv-cards" style="margin-top:12px">
      ${cartao('ok', 'Em andamento', andamento.length, planejadas.length ? `${planejadas.length} planejada(s)` : 'nenhuma planejada')}
      ${cartao('calma', `Cobertura em ${S.ano}`, `${at.length ? Math.round(cob / at.length * 100) : 0}%`, `${cob} de ${at.length} ativos participaram`)}
      ${cartao('atencao', 'Atividades', `${feitas} / ${ativAno.length}`, `realizadas × planejadas em ${S.ano}`)}
      ${cartao(atrasadas.length ? 'perigo' : 'ok', 'Atrasadas', atrasadas.length, atrasadas.length ? 'agendadas com data passada' : 'nada atrasado')}
    </div>

    <div class="qp-bloco">
      <h3>Em andamento e planejadas</h3>
      ${tabelaCampanhas([...andamento, ...planejadas])}
    </div>

    <div class="qp-bloco">
      <h3>Próximas atividades</h3>
      <p class="dica" style="margin:0 0 8px">Agendadas com data passada aparecem primeiro, como atrasadas.</p>
      ${tabelaAtividades([...atrasadas, ...proximas], true)}
    </div>
  </div>`;

  $('cmPnAno').addEventListener('change', e => { S.ano = e.target.value; desenharPainel(); });
  $('cmPnNova').addEventListener('click', () => formCampanha(null));
  ligarBotoes(tela);
}

function tabelaCampanhas(lista) {
  if (!lista.length) return '<div class="vazio">Nenhuma campanha. Clique em "Nova campanha" ou crie a partir do Calendário anual.</div>';
  return `<div class="ac-rola"><table class="dc-planilha">
    <thead><tr><th>Campanha</th><th>Período</th><th>Atividades</th><th>Cobertura</th><th>Situação</th><th></th></tr></thead>
    <tbody>${lista.map(c => {
      const n = contagem(c), cb = coberturaDe(c), s = SIT_CAMP[c.situacao] || SIT_CAMP.planejada;
      return `<tr>
        <td><b>${esc(c.nome)}</b><br><span class="sub">${esc(temaDe(c)?.nome || '')}${c.publico ? ' · ' + esc(c.publico) : ''}</span></td>
        <td>${brCurto(c.inicio)} – ${c.fim ? brCurto(c.fim) : '…'}</td>
        <td>${n.feitas} de ${n.total}</td>
        <td><span class="cm-barra"><i style="width:${cb.pct}%"></i></span>${cb.pct}% <span class="sub">(${cb.participaram}/${cb.publico})</span></td>
        <td><span class="tag ${s[1]}">${s[0]}</span></td>
        <td><button class="btn mini" type="button" data-abrir="${c.id}">Abrir</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function tabelaAtividades(lista, comCampanha) {
  if (!lista.length) return '<div class="vazio">Nenhuma atividade agendada.</div>';
  return `<div class="ac-rola"><table class="dc-planilha">
    <thead><tr><th>Data</th><th>Tipo</th><th>Atividade</th>${comCampanha ? '<th>Campanha</th>' : ''}<th>Local</th><th>Ministrante</th><th>Partic.</th><th>Situação</th><th></th></tr></thead>
    <tbody>${lista.map(a => {
      const c = S.camps.find(k => k.id === a.campanha_id);
      const s = SIT_ATIV[a.situacao] || SIT_ATIV.planejada;
      const atras = a.situacao === 'agendada' && a.data && a.data < hoje();
      return `<tr${atras ? ' class="cm-atrasada"' : ''}>
        <td>${br(a.data)}${a.hora ? '<br><span class="sub">' + esc(a.hora) + '</span>' : ''}</td>
        <td>${esc(TIPOS_ATIV[a.tipo] || a.tipo)}</td>
        <td><b>${esc(a.titulo)}</b></td>
        ${comCampanha ? `<td>${esc(c?.nome || '—')}</td>` : ''}
        <td>${esc(a.local || '—')}</td><td>${esc(a.ministrante || '—')}</td>
        <td>${(a.participantes || []).length || '—'}</td>
        <td><span class="tag ${s[1]}">${atras ? 'Atrasada' : s[0]}</span></td>
        <td class="acoes">
          ${a.situacao !== 'cancelada' ? `<button class="btn mini" type="button" data-lista="${a.id}" title="Abre a lista de presença com tema, horário e ministrante preenchidos">Gerar lista</button>` : ''}
          <button class="btn mini" type="button" data-presenca="${a.id}" title="Marcar quem assinou">Presença</button>
          <button class="btn mini" type="button" data-ativ="${a.id}">Editar</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function ligarBotoes(raiz) {
  raiz.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirCampanha(b.dataset.abrir)));
  raiz.querySelectorAll('[data-ativ]').forEach(b => b.addEventListener('click', () => formAtividade(b.dataset.ativ, null)));
  raiz.querySelectorAll('[data-presenca]').forEach(b => b.addEventListener('click', () => formPresenca(b.dataset.presenca)));
  raiz.querySelectorAll('[data-lista]').forEach(b => b.addEventListener('click', () => gerarLista(b.dataset.lista)));
}

/* ===================================================================
   TELA · CAMPANHAS (lista + campanha aberta)
   =================================================================== */
function desenharCampanhas() {
  const tela = $('telaCamLista');
  if (S.aberta) return desenharAberta(tela);
  const f = S.filtro;
  const lista = S.camps.filter(c =>
    (!f.sit || c.situacao === f.sit) &&
    (!f.q || [c.nome, temaDe(c)?.nome, c.publico, c.responsavel].some(v => so(v).toLowerCase().includes(f.q.toLowerCase()))));
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0 0 10px">
      <div><h2 style="margin:0">Campanhas</h2><p class="dica" style="margin:2px 0 0">Todas as campanhas, de qualquer ano. Abra uma para lançar as atividades.</p></div>
      <button class="btn principal" type="button" id="cmNova">Nova campanha</button>
    </div>
    <div class="grade">
      <label class="campo">Buscar <input type="search" id="cmQ" value="${esc(f.q)}" placeholder="Nome, tema, responsável…"></label>
      <label class="campo">Situação <select id="cmSit">
        <option value="">Todas</option>${Object.entries(SIT_CAMP).map(([k, v]) => `<option value="${k}" ${f.sit === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
    </div>
    <div style="margin-top:12px">${tabelaCampanhas(lista)}</div>
  </div>`;
  $('cmNova').addEventListener('click', () => formCampanha(null));
  $('cmQ').addEventListener('input', e => { f.q = e.target.value; desenharCampanhas(); });
  $('cmSit').addEventListener('change', e => { f.sit = e.target.value; desenharCampanhas(); });
  ligarBotoes(tela);
}

function abrirCampanha(id) {
  S.aberta = id;
  abrirModulo('sst', 'camLista');
  desenharCampanhas();
}

function desenharAberta(tela) {
  const c = S.camps.find(k => k.id === S.aberta);
  if (!c) { S.aberta = null; return desenharCampanhas(); }
  const t = temaDe(c), cb = coberturaDe(c), n = contagem(c), s = SIT_CAMP[c.situacao] || SIT_CAMP.planejada;
  const ativs = ativsDe(c);
  const campo = (rot, val) => `<div class="campo"><span class="sub">${rot}</span><div>${val || '—'}</div></div>`;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0 0 10px">
      <div><button class="btn mini" type="button" id="cmVoltar">← Campanhas</button></div>
      <span class="barra" style="margin:0">
        <button class="btn" type="button" id="cmEditar">Editar campanha</button>
        <button class="btn" type="button" id="cmPdf">Relatório PDF</button>
        ${c.situacao !== 'encerrada' ? '<button class="btn" type="button" id="cmEncerrar">Encerrar campanha</button>' : '<button class="btn" type="button" id="cmReabrir">Reabrir</button>'}
      </span>
    </div>
    <h2 style="margin:0">${esc(c.nome)} <span class="tag ${s[1]}">${s[0]}</span></h2>
    <p class="dica">${esc(t?.nome || 'Sem tema do catálogo')} · ${br(c.inicio)} a ${c.fim ? br(c.fim) : 'sem fim definido'}</p>
    <div class="pv-cards">
      <div class="pv-card pv-calma"><span>Cobertura</span><strong>${cb.pct}%</strong><small>${cb.participaram} de ${cb.publico} do público</small></div>
      <div class="pv-card pv-atencao"><span>Atividades</span><strong>${n.feitas} / ${n.total}</strong><small>realizadas × planejadas</small></div>
      <div class="pv-card pv-ok"><span>Participações</span><strong>${ativs.filter(a => a.situacao === 'realizada').reduce((s, a) => s + (a.participantes || []).length, 0)}</strong><small>assinaturas somadas</small></div>
    </div>
    <div class="grade" style="margin-top:12px">
      ${campo('Público', esc(c.publico))}
      ${campo('Setores', (c.setores || []).length ? esc(c.setores.join(', ')) : 'Todos')}
      ${campo('Fazendas', (c.fazendas || []).length ? esc(c.fazendas.join(', ')) : 'Todas')}
      ${campo('Responsável', esc(c.responsavel))}
    </div>
    ${c.objetivo ? `<div class="campo" style="margin-top:10px"><span class="sub">Objetivo</span><div>${esc(c.objetivo)}</div></div>` : ''}
    ${c.resultado ? `<div class="campo" style="margin-top:10px"><span class="sub">Resultado / encerramento</span><div>${esc(c.resultado)}</div></div>` : ''}

    <div class="qp-bloco">
      <div class="barra entre" style="margin:0 0 6px"><h3 style="margin:0">Atividades</h3>
        <button class="btn principal mini" type="button" id="cmNovaAtiv">+ Nova atividade</button></div>
      <p class="dica" style="margin:0 0 8px">"Gerar lista" abre a lista de presença já preenchida. Depois de assinada, use "Presença" para marcar quem participou — é isso que conta na cobertura.</p>
      ${tabelaAtividades(ativs, false)}
    </div>
  </div>`;
  $('cmVoltar').addEventListener('click', () => { S.aberta = null; desenharCampanhas(); });
  $('cmEditar').addEventListener('click', () => formCampanha(c.id));
  $('cmPdf').addEventListener('click', () => mostrar(docCampanha(c), { barra: true }));
  $('cmNovaAtiv').addEventListener('click', () => formAtividade(null, c.id));
  $('cmEncerrar')?.addEventListener('click', () => encerrar(c));
  $('cmReabrir')?.addEventListener('click', () => gravarCampanha({ ...c, situacao: 'andamento' }));
  ligarBotoes(tela);
}

/* ===================================================================
   DIÁLOGOS
   =================================================================== */
function dialogo(html, ligar) {
  let d = $('dlgCm');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCm'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgCm')?.open && $('dlgCm').close();
const marcaveis = (nome, itens, marcados) => itens.length
  ? itens.map(i => `<label class="cm-chk"><input type="checkbox" name="${nome}" value="${esc(i)}" ${marcados.includes(i) ? 'checked' : ''}> ${esc(i)}</label>`).join('')
  : '<span class="sub">Nenhum cadastrado</span>';
const lidos = (d, nome) => [...d.querySelectorAll(`input[name=${nome}]:checked`)].map(i => i.value);

function formCampanha(id, base) {
  const c = id ? S.camps.find(x => x.id === id) : null;
  const v = c || { situacao: 'planejada', inicio: hoje(), setores: [], fazendas: [], ...(base || {}) };
  dialogo(`<h2>${c ? 'Editar campanha' : 'Nova campanha'}</h2>
    <div class="grade larga">
      <label class="campo plena">Nome <input type="text" id="cmfNome" value="${esc(v.nome)}" placeholder="Ex.: Calor e hidratação – verão 2026/27"></label>
      <label class="campo">Tema (catálogo) <select id="cmfTema"><option value="">— sem tema —</option>${S.temas.filter(t => t.ativo !== false).map(t => `<option value="${t.id}" ${v.tema_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
      <label class="campo">Situação <select id="cmfSit">${Object.entries(SIT_CAMP).map(([k, s]) => `<option value="${k}" ${v.situacao === k ? 'selected' : ''}>${s[0]}</option>`).join('')}</select></label>
      <label class="campo">Início <input type="date" id="cmfIni" value="${esc(v.inicio)}"></label>
      <label class="campo">Fim <input type="date" id="cmfFim" value="${esc(v.fim)}"></label>
      <label class="campo plena">Público (descrição) <input type="text" id="cmfPub" value="${esc(v.publico)}" placeholder="Ex.: Campo e colheita"></label>
      <div class="campo"><span>Setores (vazio = todos)</span><div class="cm-chks">${marcaveis('cmfSet', setores(), v.setores || [])}</div></div>
      <div class="campo"><span>Fazendas (vazio = todas)</span><div class="cm-chks">${marcaveis('cmfFaz', fazendas(), v.fazendas || [])}</div></div>
      <label class="campo">Responsável <input type="text" id="cmfResp" value="${esc(v.responsavel)}"></label>
      <label class="campo plena">Objetivo <textarea id="cmfObj" rows="2">${esc(v.objetivo)}</textarea></label>
    </div>
    <div class="barra fim">
      ${c ? '<button class="btn perigo" type="button" id="cmfApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cmfGravar">Gravar</button>
    </div>`, d => {
    // escolher um tema preenche objetivo e público, se estiverem vazios
    $('cmfTema').addEventListener('change', () => {
      const t = S.temas.find(x => x.id === $('cmfTema').value); if (!t) return;
      if (!so($('cmfObj').value)) $('cmfObj').value = t.objetivo || '';
      if (!so($('cmfPub').value)) $('cmfPub').value = t.publico || '';
      if (!so($('cmfNome').value)) $('cmfNome').value = t.nome;
    });
    $('cmfGravar').addEventListener('click', async () => {
      const nome = so($('cmfNome').value);
      if (!nome) return alert('Dê um nome à campanha.');
      if (!$('cmfIni').value) return alert('Informe a data de início.');
      const reg = {
        ...(c || {}), nome, tema_id: $('cmfTema').value || null, situacao: $('cmfSit').value,
        inicio: $('cmfIni').value, fim: $('cmfFim').value || null, publico: so($('cmfPub').value) || null,
        setores: lidos(d, 'cmfSet'), fazendas: lidos(d, 'cmfFaz'),
        responsavel: so($('cmfResp').value) || null, objetivo: so($('cmfObj').value) || null,
      };
      if (!c) reg.criado_por = quem();
      const novo = await gravarCampanha(reg);
      // campanha nova a partir de um tema: já cria as atividades sugeridas
      if (!c && novo && !base?.semSugestoes) {
        const t = S.temas.find(x => x.id === reg.tema_id);
        const sug = so(t?.atividades_sugeridas).split(/\r?\n/).map(so).filter(Boolean);
        if (sug.length && confirm(`Criar as ${sug.length} atividades sugeridas do tema como "planejadas"?`)) {
          const cli = estado.cliente;
          const linhas = sug.map(titulo => ({ campanha_id: novo.id, titulo, tipo: tipoPorTexto(titulo), situacao: 'planejada' }));
          const { data, error } = await cli.from('sst_campanha_atividades').insert(linhas).select();
          if (error) alert('Não consegui criar as atividades: ' + error.message);
          else S.ativs.push(...data);
        }
        abrirCampanha(novo.id);
      }
    });
    $('cmfApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar esta campanha e todas as atividades dela?')) return;
      const { error } = await estado.cliente.from('sst_campanhas').delete().eq('id', c.id);
      if (error) return alert('Não consegui apagar: ' + error.message);
      S.camps = S.camps.filter(x => x.id !== c.id); S.ativs = S.ativs.filter(a => a.campanha_id !== c.id);
      S.aberta = null; fechar(); redesenhar();
    });
  });
}
const tipoPorTexto = t => {
  const s = t.toLowerCase();
  if (s.startsWith('dds')) return 'dds';
  if (s.includes('palestra') || s.includes('roda de conversa')) return 'palestra';
  if (s.includes('treinamento') || s.includes('vacina')) return 'treinamento';
  if (s.includes('inspeção') || s.includes('inspecao') || s.includes('mutirão')) return 'inspecao';
  if (s.includes('simulado')) return 'simulado';
  if (s.includes('cartaz') || s.includes('entrega') || s.includes('material')) return 'material';
  return 'outro';
};

async function gravarCampanha(reg) {
  const cli = estado.cliente;
  const { data, error } = await cli.from('sst_campanhas').upsert(reg).select().single();
  if (error) { alert('Não consegui gravar: ' + error.message); return null; }
  const i = S.camps.findIndex(x => x.id === data.id);
  if (i >= 0) S.camps[i] = data; else S.camps.unshift(data);
  fechar(); redesenhar();
  return data;
}

function encerrar(c) {
  dialogo(`<h2>Encerrar campanha</h2>
    <p class="dica">Registre em poucas linhas o resultado: o que foi feito, o que mudou, o que fica para a próxima.</p>
    <label class="campo plena">Resultado <textarea id="cmeRes" rows="4">${esc(c.resultado)}</textarea></label>
    <label class="campo">Data de encerramento <input type="date" id="cmeFim" value="${esc(c.fim || hoje())}"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cmeOk">Encerrar</button></div>`, () => {
    $('cmeOk').addEventListener('click', () => gravarCampanha({ ...c, situacao: 'encerrada', resultado: so($('cmeRes').value) || null, fim: $('cmeFim').value || c.fim }));
  });
}

function formAtividade(id, campanhaId) {
  const a = id ? S.ativs.find(x => x.id === id) : null;
  const v = a || { campanha_id: campanhaId, tipo: 'dds', situacao: 'agendada', data: hoje(), participantes: [] };
  dialogo(`<h2>${a ? 'Editar atividade' : 'Nova atividade'}</h2>
    <div class="grade larga">
      <label class="campo plena">Atividade <input type="text" id="cmaTit" value="${esc(v.titulo)}" placeholder="Ex.: DDS – Sintomas de insolação"></label>
      <label class="campo">Tipo <select id="cmaTipo">${Object.entries(TIPOS_ATIV).map(([k, n]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo">Situação <select id="cmaSit">${Object.entries(SIT_ATIV).map(([k, s]) => `<option value="${k}" ${v.situacao === k ? 'selected' : ''}>${s[0]}</option>`).join('')}</select></label>
      <label class="campo">Data <input type="date" id="cmaData" value="${esc(v.data)}"></label>
      <label class="campo">Horário <input type="text" id="cmaHora" value="${esc(v.hora)}" placeholder="07:00 às 07:20"></label>
      <label class="campo">Local <input type="text" id="cmaLocal" value="${esc(v.local)}" list="cmaLocais"><datalist id="cmaLocais">${fazendas().map(f => `<option value="${esc(f)}">`).join('')}<option value="Sede"></datalist></label>
      <label class="campo">Ministrante <input type="text" id="cmaMin" value="${esc(v.ministrante)}"></label>
      <label class="campo plena">Observação <textarea id="cmaObs" rows="2">${esc(v.observacao)}</textarea></label>
    </div>
    <p class="dica">Participantes: ${(v.participantes || []).length} — use o botão "Presença" na tabela para marcar quem assinou.</p>
    <div class="barra fim">
      ${a ? '<button class="btn perigo" type="button" id="cmaApagar">Apagar</button><span class="cresce"></span>' : ''}
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cmaGravar">Gravar</button>
    </div>`, () => {
    $('cmaGravar').addEventListener('click', async () => {
      const titulo = so($('cmaTit').value);
      if (!titulo) return alert('Descreva a atividade.');
      const reg = { ...(a || {}), campanha_id: v.campanha_id, titulo, tipo: $('cmaTipo').value, situacao: $('cmaSit').value,
        data: $('cmaData').value || null, hora: so($('cmaHora').value) || null, local: so($('cmaLocal').value) || null,
        ministrante: so($('cmaMin').value) || null, observacao: so($('cmaObs').value) || null };
      await gravarAtividade(reg);
    });
    $('cmaApagar')?.addEventListener('click', async () => {
      if (!confirm('Apagar esta atividade?')) return;
      const { error } = await estado.cliente.from('sst_campanha_atividades').delete().eq('id', a.id);
      if (error) return alert('Não consegui apagar: ' + error.message);
      S.ativs = S.ativs.filter(x => x.id !== a.id); fechar(); redesenhar();
    });
  });
}

async function gravarAtividade(reg) {
  const { data, error } = await estado.cliente.from('sst_campanha_atividades').upsert(reg).select().single();
  if (error) { alert('Não consegui gravar: ' + error.message); return null; }
  const i = S.ativs.findIndex(x => x.id === data.id);
  if (i >= 0) S.ativs[i] = data; else S.ativs.push(data);
  fechar(); redesenhar();
  return data;
}

/* Quem assinou: marca os funcionários do público (e qualquer outro pela busca). */
function formPresenca(id) {
  const a = S.ativs.find(x => x.id === id); if (!a) return;
  const c = S.camps.find(k => k.id === a.campanha_id);
  const marc = new Set(a.participantes || []);
  const pub = new Set(publicoDe(c).map(f => f.id));
  const todos = ativos().slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  const linhas = q => todos.filter(f => !q || f.nome.toLowerCase().includes(q)).map(f => `
    <label class="item" for="cmp_${f.id}">
      <input type="checkbox" id="cmp_${f.id}" data-id="${f.id}" ${marc.has(f.id) ? 'checked' : ''}>
      <span><span class="nome">${esc(f.nome)}</span><br><span class="sub">${esc(f.cargo || '—')}${f.fazenda ? ' · ' + esc(f.fazenda) : ''}${pub.has(f.id) ? '' : ' · fora do público'}</span></span>
    </label>`).join('');
  dialogo(`<h2>Presença · ${esc(a.titulo)}</h2>
    <p class="dica">${br(a.data)}${a.local ? ' · ' + esc(a.local) : ''}. Marque quem assinou a lista. <b id="cmpN">${marc.size}</b> marcado(s).</p>
    <div class="barra" style="margin:0 0 8px">
      <input type="search" id="cmpQ" placeholder="Buscar nome…" style="flex:1">
      <button class="btn mini" type="button" id="cmpPub">Marcar todo o público (${pub.size})</button>
      <button class="btn mini" type="button" id="cmpNenhum">Desmarcar todos</button>
    </div>
    <div class="lista rolagem" id="cmpLista" style="max-height:50vh">${linhas('')}</div>
    <label class="campo" style="margin-top:10px"><span>Marcar a atividade como</span><select id="cmpSit">${Object.entries(SIT_ATIV).map(([k, s]) => `<option value="${k}" ${(a.situacao === k) ? 'selected' : ''}>${s[0]}</option>`).join('')}</select></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cmpOk">Gravar presença</button></div>`, d => {
    const ligar = () => d.querySelectorAll('#cmpLista input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      cb.checked ? marc.add(cb.dataset.id) : marc.delete(cb.dataset.id); $('cmpN').textContent = marc.size;
    }));
    ligar();
    $('cmpQ').addEventListener('input', () => { $('cmpLista').innerHTML = linhas($('cmpQ').value.trim().toLowerCase()); ligar(); });
    $('cmpPub').addEventListener('click', () => { pub.forEach(i => marc.add(i)); $('cmpLista').innerHTML = linhas($('cmpQ').value.trim().toLowerCase()); ligar(); $('cmpN').textContent = marc.size; });
    $('cmpNenhum').addEventListener('click', () => { marc.clear(); $('cmpLista').innerHTML = linhas(''); ligar(); $('cmpN').textContent = 0; });
    // quem marca presença normalmente está dizendo que aconteceu
    if (a.situacao !== 'realizada') $('cmpSit').value = 'realizada';
    $('cmpOk').addEventListener('click', () => gravarAtividade({ ...a, participantes: [...marc], situacao: $('cmpSit').value }));
  });
}

/* Leva para a lista de presença com tudo preenchido. */
function gerarLista(id) {
  const a = S.ativs.find(x => x.id === id); if (!a) return;
  const c = S.camps.find(k => k.id === a.campanha_id);
  const ids = (a.participantes || []).length ? a.participantes : publicoDe(c).map(f => f.id);
  const tema = [a.titulo, c?.nome && c.nome !== a.titulo ? `Campanha: ${c.nome}` : ''].filter(Boolean).join('\n');
  window.prepararListaPresenca?.({ tema, horario: a.hora || '', ministrante: a.ministrante || '', ids });
  abrirModulo('pessoas', 'lista');
}

/* ===================================================================
   TELA · CALENDÁRIO ANUAL
   =================================================================== */
function desenharCalendario() {
  const tela = $('telaCamCal');
  if (!S.ano) S.ano = String(new Date().getFullYear());
  const anos = [...new Set([String(new Date().getFullYear()), String(new Date().getFullYear() + 1), ...S.camps.map(anoDe).filter(Boolean)])].sort();
  // campanhas que tocam cada mês do ano
  const meses = MESES.map((nome, i) => {
    const m = `${S.ano}-${String(i + 1).padStart(2, '0')}`;
    const camps = S.camps.filter(c => {
      const ini = String(c.inicio || '').slice(0, 7), fim = String(c.fim || c.inicio || '').slice(0, 7);
      return ini <= m && fim >= m;
    });
    const temas = S.temas.filter(t => t.ativo !== false && mesCasa(t.mes_sugerido, i));
    const ativs = S.ativs.filter(a => String(a.data || '').startsWith(m) && a.situacao !== 'cancelada');
    return { nome, i, camps, temas, ativs };
  });
  const mesAtual = new Date().getMonth();
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0 0 10px">
      <div><h2 style="margin:0">Calendário anual de campanhas</h2>
        <p class="dica" style="margin:2px 0 0">O que está planejado em cada mês e os temas sugeridos do catálogo. "Criar" nasce da sugestão com objetivo e atividades prontos.</p></div>
      <span class="barra" style="margin:0">
        <label class="campo" style="margin:0">Ano <select id="cmCalAno">${anos.map(a => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <button class="btn" type="button" id="cmCalImp">Imprimir calendário</button>
      </span>
    </div>
    <div class="cm-meses">${meses.map(m => `
      <div class="cm-mes${S.ano === String(new Date().getFullYear()) && m.i === mesAtual ? ' cm-mes-atual' : ''}${m.camps.length ? ' cm-mes-ok' : ''}">
        <h3>${m.nome}</h3>
        ${m.camps.map(c => `<button type="button" class="cm-mes-camp" data-abrir="${c.id}"><b>${esc(c.nome)}</b><br><span class="sub">${esc((SIT_CAMP[c.situacao] || [])[0] || '')}${m.ativs.filter(a => a.campanha_id === c.id).length ? ` · ${m.ativs.filter(a => a.campanha_id === c.id).length} atividade(s)` : ''}</span></button>`).join('')}
        ${m.temas.filter(t => !m.camps.some(c => c.tema_id === t.id)).map(t => `<div class="cm-mes-sug"><span class="sub">Sugestão: </span><b>${esc(t.nome)}</b>
          <button type="button" class="btn mini" data-criar="${t.id}" data-mes="${m.i}">Criar</button></div>`).join('')}
        ${!m.camps.length && !m.temas.length ? '<div class="sub">Sem campanha</div>' : ''}
      </div>`).join('')}</div>
  </div>`;
  $('cmCalAno').addEventListener('change', e => { S.ano = e.target.value; desenharCalendario(); });
  $('cmCalImp').addEventListener('click', () => mostrar(docCalendario(meses), { barra: true }));
  tela.querySelectorAll('[data-criar]').forEach(b => b.addEventListener('click', () => {
    const t = S.temas.find(x => x.id === b.dataset.criar); const i = +b.dataset.mes;
    const ini = `${S.ano}-${String(i + 1).padStart(2, '0')}-01`;
    const fim = `${S.ano}-${String(i + 1).padStart(2, '0')}-${String(new Date(+S.ano, i + 1, 0).getDate()).padStart(2, '0')}`;
    formCampanha(null, { nome: `${t.nome} – ${MESES_C[i]}/${S.ano}`, tema_id: t.id, inicio: ini, fim, objetivo: t.objetivo, publico: t.publico });
  }));
  ligarBotoes(tela);
}
/** "Abril", "Out – Mar", "Outubro a março", "Livre" → o mês (0-11) casa? */
function mesCasa(txt, i) {
  const s = so(txt).toLowerCase(); if (!s || s === 'livre') return false;
  const idx = n => MESES.findIndex(m => m.toLowerCase().startsWith(n.slice(0, 3)));
  const achados = s.split(/\s*(?:a|–|-|até|e)\s*/).map(p => idx(p.trim())).filter(n => n >= 0);
  if (!achados.length) return false;
  if (achados.length === 1) return achados[0] === i;
  const [a, b] = achados;
  return a <= b ? (i >= a && i <= b) : (i >= a || i <= b);
}

/* ===================================================================
   TELA · CATÁLOGO DE TEMAS
   =================================================================== */
function desenharTemas() {
  const tela = $('telaCamTemas');
  const usos = t => S.camps.filter(c => c.tema_id === t.id).length;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <div class="barra entre" style="margin:0 0 10px">
      <div><h2 style="margin:0">Catálogo de temas</h2>
        <p class="dica" style="margin:2px 0 0">Temas prontos para repetir todo ano. A campanha criada a partir de um tema herda objetivo, público e atividades sugeridas.</p></div>
      <button class="btn principal" type="button" id="cmTemaNovo">+ Novo tema</button>
    </div>
    <div class="ac-rola"><table class="dc-planilha">
      <thead><tr><th>Tema</th><th>Mês sugerido</th><th>Público</th><th>Atividades sugeridas</th><th>Referência</th><th>Usado</th><th></th></tr></thead>
      <tbody>${S.temas.map(t => `<tr${t.ativo === false ? ' class="cm-inativo"' : ''}>
        <td><b>${esc(t.nome)}</b>${t.objetivo ? `<br><span class="sub">${esc(t.objetivo)}</span>` : ''}</td>
        <td>${esc(t.mes_sugerido || '—')}</td><td>${esc(t.publico || '—')}</td>
        <td class="sub">${esc(so(t.atividades_sugeridas).split(/\r?\n/).filter(Boolean).join(' · '))}</td>
        <td class="sub">${esc(t.referencia || '')}</td><td>${usos(t) || '—'}</td>
        <td class="acoes"><button class="btn mini" type="button" data-tema="${t.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>
  </div>`;
  $('cmTemaNovo').addEventListener('click', () => formTema(null));
  tela.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => formTema(b.dataset.tema)));
}

function formTema(id) {
  const t = id ? S.temas.find(x => x.id === id) : null;
  const v = t || { ativo: true };
  dialogo(`<h2>${t ? 'Editar tema' : 'Novo tema'}</h2>
    <div class="grade larga">
      <label class="campo plena">Nome <input type="text" id="cmtNome" value="${esc(v.nome)}"></label>
      <label class="campo">Mês sugerido <input type="text" id="cmtMes" value="${esc(v.mes_sugerido)}" placeholder="Abril · Out – Mar · Livre"></label>
      <label class="campo">Público padrão <input type="text" id="cmtPub" value="${esc(v.publico)}"></label>
      <label class="campo plena">Objetivo padrão <textarea id="cmtObj" rows="2">${esc(v.objetivo)}</textarea></label>
      <label class="campo plena">Atividades sugeridas (uma por linha) <textarea id="cmtAtiv" rows="4">${esc(v.atividades_sugeridas)}</textarea></label>
      <label class="campo plena">Materiais (nomes dos arquivos no Drive) <input type="text" id="cmtMat" value="${esc(v.materiais)}"></label>
      <label class="campo">Norma / referência <input type="text" id="cmtRef" value="${esc(v.referencia)}"></label>
      <label class="campo"><span>&nbsp;</span><label class="cm-chk"><input type="checkbox" id="cmtAtivo" ${v.ativo !== false ? 'checked' : ''}> Ativo (aparece nas sugestões)</label></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="cmtGravar">Gravar</button></div>`, () => {
    $('cmtGravar').addEventListener('click', async () => {
      const nome = so($('cmtNome').value); if (!nome) return alert('Dê um nome ao tema.');
      const reg = { ...(t || {}), nome, mes_sugerido: so($('cmtMes').value) || null, publico: so($('cmtPub').value) || null,
        objetivo: so($('cmtObj').value) || null, atividades_sugeridas: so($('cmtAtiv').value) || null,
        materiais: so($('cmtMat').value) || null, referencia: so($('cmtRef').value) || null, ativo: $('cmtAtivo').checked };
      const { data, error } = await estado.cliente.from('sst_campanha_temas').upsert(reg).select().single();
      if (error) return alert('Não consegui gravar: ' + error.message);
      const i = S.temas.findIndex(x => x.id === data.id); if (i >= 0) S.temas[i] = data; else S.temas.push(data);
      S.temas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   DOCUMENTOS
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo }) {
  return `<article class="rel">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

function docCampanha(c) {
  const t = temaDe(c), cb = coberturaDe(c), n = contagem(c);
  const ativs = ativsDe(c).filter(a => a.situacao !== 'cancelada');
  const ficha = [['Tema', t?.nome], ['Período', `${br(c.inicio)} a ${c.fim ? br(c.fim) : '—'}`], ['Situação', (SIT_CAMP[c.situacao] || [])[0]],
    ['Público', c.publico || 'Todos'], ['Setores', (c.setores || []).join(', ') || 'Todos'], ['Fazendas', (c.fazendas || []).join(', ') || 'Todas'],
    ['Responsável', c.responsavel], ['Cobertura', `${cb.pct}% (${cb.participaram} de ${cb.publico})`], ['Atividades', `${n.feitas} realizadas de ${n.total}`]];
  const participantes = new Map();
  ativs.filter(a => a.situacao === 'realizada').forEach(a => (a.participantes || []).forEach(id => participantes.set(id, (participantes.get(id) || 0) + 1)));
  const gente = [...participantes.entries()].map(([id, qt]) => ({ f: funcionario(id), qt })).filter(x => x.f)
    .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  return documento({ titulo: 'Campanha de segurança e saúde', subtitulo: c.nome, canto: br(c.inicio), corpo: `
    <div class="rel-ficha">${ficha.map(([r, v]) => `<div><span>${r}</span><b>${esc(v || '—')}</b></div>`).join('')}</div>
    ${c.objetivo ? `<div class="rel-resumo"><b>Objetivo.</b> ${esc(c.objetivo)}</div>` : ''}
    <h2 class="rel-secao">Atividades</h2>
    <table class="rel-tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Atividade</th><th>Local</th><th>Ministrante</th><th class="rel-num">Partic.</th><th>Situação</th></tr></thead>
    <tbody>${ativs.length ? ativs.map(a => `<tr><td>${br(a.data)}${a.hora ? ' ' + esc(a.hora) : ''}</td><td>${esc(TIPOS_ATIV[a.tipo] || a.tipo)}</td><td>${esc(a.titulo)}${a.observacao ? `<br><span class="rel-mini">${esc(a.observacao)}</span>` : ''}</td>
      <td>${esc(a.local || '—')}</td><td>${esc(a.ministrante || '—')}</td><td class="rel-num">${(a.participantes || []).length || '—'}</td><td>${esc((SIT_ATIV[a.situacao] || [])[0] || '')}</td></tr>`).join('')
      : '<tr><td colspan="7" class="rel-vazio">Nenhuma atividade.</td></tr>'}</tbody></table>
    <h2 class="rel-secao">Participantes (${gente.length})</h2>
    <table class="rel-tabela"><thead><tr><th>Nome</th><th>Função</th><th>Fazenda</th><th class="rel-num">Atividades</th></tr></thead>
    <tbody>${gente.length ? gente.map(({ f, qt }) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cargo || '—')}</td><td>${esc(f.fazenda || '—')}</td><td class="rel-num">${qt}</td></tr>`).join('')
      : '<tr><td colspan="4" class="rel-vazio">Ninguém marcado ainda — lance a presença nas atividades realizadas.</td></tr>'}</tbody></table>
    ${c.resultado ? `<div class="rel-resumo"><b>Resultado.</b> ${esc(c.resultado)}</div>` : ''}
    <p class="rel-nota">Cobertura = funcionários ativos do público que participaram de pelo menos uma atividade realizada. Evidências (fotos, listas assinadas) ficam no Drive da SAKUMA.</p>` });
}

function docCalendario(meses) {
  return documento({ titulo: 'Calendário anual de campanhas', subtitulo: `Segurança e saúde · ${S.ano}`, canto: S.ano, corpo: `
    <table class="rel-tabela"><thead><tr><th style="width:14%">Mês</th><th>Campanha / tema</th><th>Situação</th><th class="rel-num">Atividades</th></tr></thead>
    <tbody>${meses.map(m => {
      const linhas = [...m.camps.map(c => [c.nome, (SIT_CAMP[c.situacao] || [])[0], m.ativs.filter(a => a.campanha_id === c.id).length]),
        ...m.temas.filter(t => !m.camps.some(c => c.tema_id === t.id)).map(t => [t.nome + ' (sugestão)', 'A planejar', ''])];
      return linhas.length
        ? linhas.map((l, i) => `<tr>${i === 0 ? `<td rowspan="${linhas.length}"><b>${m.nome}</b></td>` : ''}<td>${esc(l[0])}</td><td>${esc(l[1])}</td><td class="rel-num">${l[2] || '—'}</td></tr>`).join('')
        : `<tr><td><b>${m.nome}</b></td><td colspan="3" class="rel-mini">—</td></tr>`;
    }).join('')}</tbody></table>` });
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_CAMPANHAS = ['camPainel', 'camLista', 'camCal', 'camTemas'];
let telaAtual = '';
function redesenhar() {
  if (telaAtual === 'camPainel') desenharPainel();
  else if (telaAtual === 'camLista') desenharCampanhas();
  else if (telaAtual === 'camCal') desenharCalendario();
  else if (telaAtual === 'camTemas') desenharTemas();
}

export async function abrirCampanhas(tela) {
  const alvo = $('tela' + tela[0].toUpperCase() + tela.slice(1));
  if (!alvo) return;
  telaAtual = tela;
  if (!S.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando as campanhas…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir as campanhas: ${esc(e.message || e)}</div></div>`; return; }
  }
  redesenhar();
}

export function limparCampanhas() {
  S.carregado = false; S.temas = []; S.camps = []; S.ativs = []; S.ano = ''; S.aberta = null;
  Object.assign(S.filtro, { sit: '', q: '' });
  telaAtual = ''; fechar();
}

/** Para o SST › Calendário: atividades de campanha do mês (aaaa-mm). */
export async function atividadesCampanhaDoMes(mes) {
  if (!S.carregado) { try { await carregar(); } catch { return []; } }
  return S.ativs.filter(a => String(a.data || '').startsWith(mes) && a.situacao !== 'cancelada')
    .map(a => ({ ...a, campanha: S.camps.find(c => c.id === a.campanha_id)?.nome || '' }));
}

/* Para testes. */
export const _cm = { S, publicoDe, coberturaDe, mesCasa };
