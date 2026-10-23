// projetos.js — lista de projetos e a ficha do projeto com as abas do PMBOK (23/10/2026).
import { $, esc, pronto, carregando, projetos, projeto, resumo, semaforos, FASES, nomeFase, idxFase,
  SITUACOES, gravar, aviso, meuNome, proximoCodigo, pct, num, reais, dataBR, hojeISO, pendenciasPara,
  nomesSugeridos, datalist, semAcento, bolinha, NOME_COR, emAndamento } from './dados.js';
import { formModal, barra, etiqueta, vazio } from './ui.js';
import { abaTermo, abaPartes, abaComunicacao } from './abas-inicio.js';
import { abaEap, abaRaci } from './abas-plano.js';
import { abaRede } from './abas-rede.js';
import { abaEscopo } from './abas-escopo.js';
import { abaRiscos, abaCustos, abaMudancas, abaProblemas } from './abas-controle.js';
import { abaEncerramento } from './encerramento.js';
import { abaRelatorio } from './relatorio.js';

const ABAS = [
  ['termo', 'Termo de abertura', abaTermo],
  ['partes', 'Partes interessadas', abaPartes],
  ['escopo', 'Escopo e requisitos', abaEscopo],
  ['eap', 'EAP e cronograma', abaEap],
  ['rede', 'Rede do projeto', abaRede],
  ['raci', 'Responsabilidades', abaRaci],
  ['riscos', 'Riscos', abaRiscos],
  ['comunicacao', 'Comunicação', abaComunicacao],
  ['custos', 'Custos', abaCustos],
  ['mudancas', 'Mudanças', abaMudancas],
  ['problemas', 'Problemas', abaProblemas],
  ['encerramento', 'Encerramento', abaEncerramento],
  ['relatorio', 'Relatório', abaRelatorio],
];

let aberto = null;          // id do projeto na ficha
let aba = 'termo';
let filtroFase = '', filtroSit = 'andamento', busca = '';
let ouvindo = false;

/* ============================== lista ============================== */
function desenharLista() {
  const alvo = $('pjListaCorpo');
  $('pjFolha').innerHTML = '';
  if (!pronto() || carregando()) { alvo.innerHTML = vazio('Abrindo…'); return; }
  const todos = projetos();
  const lista = todos.filter(p => (!filtroFase || p.fase === filtroFase)
    && (filtroSit === '' || (filtroSit === 'andamento' ? emAndamento(p) : p.situacao === filtroSit))
    && (!busca || semAcento([p.codigo, p.nome, p.gerente, p.patrocinador].join(' ')).includes(semAcento(busca))));
  alvo.innerHTML = `
    <div class="barra pj-filtros">
      <button class="btn principal" type="button" id="pjNovo">+ Novo projeto</button>
      <span class="pj-cresce"></span>
      <label class="campo">Procurar <input type="text" id="pjBusca" value="${esc(busca)}" placeholder="nome, código, gerente"></label>
      <label class="campo">Fase <select id="pjFFase"><option value="">Todas</option>${FASES.map(([f, n]) => `<option value="${f}"${f === filtroFase ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo">Situação <select id="pjFSit">
        <option value="andamento"${filtroSit === 'andamento' ? ' selected' : ''}>Em andamento</option>
        ${Object.entries(SITUACOES).map(([s, n]) => `<option value="${s}"${s === filtroSit ? ' selected' : ''}>${n}</option>`).join('')}
        <option value=""${filtroSit === '' ? ' selected' : ''}>Todas</option></select></label>
    </div>
    ${!todos.length ? `<div class="pj-vazio-grande"><p><b>Nenhum projeto cadastrado ainda.</b></p><p class="dc-sem">Comece pelo <b>+ Novo projeto</b>: ele abre o Termo de Abertura.</p></div>` : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Código</th><th>Projeto</th><th>Gerente</th><th>Fase</th><th>Avanço</th><th class="ce">Prazo</th><th class="ce">Custo</th><th class="ce">Escopo</th><th>Término</th><th class="dir">Orçado</th><th class="dir">Realizado</th><th class="ce">Alertas</th></tr></thead>
      <tbody>${lista.map(p => {
        const r = resumo(p.id), s = semaforos(r);
        const alertas = r.atrasadas.length + r.altosSemPlano.length + r.mudPendVelhas.length + (r.prazoVencido ? 1 : 0);
        return `<tr class="pj-linha" data-abrir="${p.id}" tabindex="0">
          <td><b>${esc(p.codigo || '')}</b></td>
          <td><b>${esc(p.nome)}</b>${p.situacao !== 'ativo' ? ' ' + etiqueta(SITUACOES[p.situacao], p.situacao) : ''}</td>
          <td>${esc(p.gerente || '—')}</td>
          <td>${esc(nomeFase(p.fase))}</td>
          <td class="pj-av">${barra(r.fisico)} <b>${pct(r.fisico)}</b></td>
          <td class="ce">${bolinha(s.prazo, NOME_COR[s.prazo])}</td>
          <td class="ce">${bolinha(s.custo, NOME_COR[s.custo])}</td>
          <td class="ce">${bolinha(s.escopo, NOME_COR[s.escopo])}</td>
          <td>${dataBR(p.fim_previsto)}</td>
          <td class="dir">${reais(p.orcamento)}</td>
          <td class="dir">${reais(r.custoReal)}</td>
          <td class="ce">${alertas ? etiqueta(alertas, 'perigo') : '<span class="dc-sem">—</span>'}</td>
        </tr>`; }).join('') || `<tr><td colspan="12" class="vazio">Nenhum projeto com esses filtros.</td></tr>`}
      </tbody></table></div>
    <p class="dc-sem" style="margin-top:8px">Semáforos: ${bolinha('verde')} no rumo · ${bolinha('amarelo')} atenção · ${bolinha('vermelho')} crítico · ${bolinha('cinza')} sem dados. Toque no projeto para abrir a ficha.</p>`}`;

  $('pjNovo').onclick = novoProjeto;
  $('pjBusca').addEventListener('input', e => { busca = e.target.value; const pos = e.target.selectionStart; desenharLista(); const el = $('pjBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  $('pjFFase').onchange = e => { filtroFase = e.target.value; desenharLista(); };
  $('pjFSit').onchange = e => { filtroSit = e.target.value; desenharLista(); };
  alvo.querySelectorAll('[data-abrir]').forEach(tr => {
    tr.addEventListener('click', () => abrirFicha(tr.dataset.abrir));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') abrirFicha(tr.dataset.abrir); });
  });
}

function novoProjeto() {
  const nomes = nomesSugeridos();
  const lista = [
    { k: 'nome', rot: 'Nome do projeto', req: true, plena: true, ph: 'ex.: Implantação do novo barracão de insumos' },
    { k: 'objetivo', rot: 'Objetivo', tipo: 'area', plena: true, linhas: 2, ph: 'o que o projeto vai entregar e para quê' },
    { k: 'gerente', rot: 'Gerente do projeto', lista: 'pjNomes' },
    { k: 'patrocinador', rot: 'Patrocinador', lista: 'pjNomes' },
    { k: 'inicio', rot: 'Início', tipo: 'date' },
    { k: 'fim_previsto', rot: 'Término previsto', tipo: 'date' },
    { k: 'orcamento', rot: 'Orçamento (R$)', tipo: 'dinheiro' },
  ];
  formModal('Novo projeto', lista, { inicio: hojeISO() }, async o => {
    const p = {
      id: crypto.randomUUID(), codigo: proximoCodigo(), ...o, fase: 'iniciacao', situacao: 'ativo',
      criado_por: meuNome(), ativo: true,
      historico_fases: [{ de: null, para: 'iniciacao', em: new Date().toISOString(), por: meuNome() }],
      checklist_enc: {}, criterios_alcancados: {},
    };
    await gravar('pj_projetos', p);
    aviso('Projeto ' + p.codigo + ' criado. Complete o Termo de Abertura.');
    abrirFicha(p.id, 'termo');
  }, { extra: datalist('pjNomes', nomes), rotuloSalvar: 'Criar projeto' });
}

/* ============================== ficha ============================== */
export function abrirFicha(id, qualAba) {
  aberto = id;
  if (qualAba) aba = qualAba;
  desenhar();
  window.scrollTo({ top: 0 });
}

function desenharFicha() {
  const alvo = $('pjListaCorpo');
  const p = projeto(aberto);
  if (!p || p.ativo === false) { aberto = null; desenharLista(); return; }
  const r = resumo(p.id), s = semaforos(r);
  const i = idxFase(p.fase);
  const fechado = p.situacao === 'encerrado' || p.situacao === 'cancelado';
  alvo.innerHTML = `
    <div class="pj-ficha-topo naoimprimir">
      <button class="btn mini" type="button" id="pjVoltar">‹ Projetos</button>
      <div class="pj-ficha-tit">
        <small>${esc(p.codigo || '')}${p.gerente ? ' · gerente: ' + esc(p.gerente) : ''}${p.patrocinador ? ' · patrocinador: ' + esc(p.patrocinador) : ''}</small>
        <h3>${esc(p.nome)}</h3>
      </div>
      <label class="campo pj-sit">Situação <select id="pjSit">${Object.entries(SITUACOES).map(([k, n]) => `<option value="${k}"${p.situacao === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <ol class="pj-fases naoimprimir">${FASES.map(([f, n], k) =>
      `<li class="${k < i ? 'feita' : k === i ? 'atual' : ''}"><span>${k + 1}</span>${n}</li>`).join('')}</ol>
    <div class="barra pj-fase-barra naoimprimir">
      ${i > 0 && !fechado ? '<button class="btn" type="button" id="pjVoltarFase">‹ Voltar fase</button>' : ''}
      ${i < FASES.length - 1 && !fechado ? `<button class="btn principal" type="button" id="pjAvancar">Avançar para ${esc(FASES[i + 1][1])} ›</button>` : ''}
      ${fechado ? `<span class="dc-sem">Projeto ${esc(SITUACOES[p.situacao].toLowerCase())}${p.encerrado_em ? ' em ' + dataBR(p.encerrado_em) : ''}.</span>` : ''}
    </div>
    <div class="pj-kpis naoimprimir">
      <div><span>Avanço físico</span><b>${pct(r.fisico)}</b><small>planejado hoje: ${pct(r.planejado)}</small></div>
      <div><span>Prazo ${bolinha(s.prazo)}</span><b>${dataBR(p.fim_previsto)}</b><small>${p.fim_base && p.fim_base !== p.fim_previsto ? 'linha de base: ' + dataBR(p.fim_base) : 'IDP (SPI): ' + (r.spi == null ? '—' : num(r.spi))}</small></div>
      <div><span>Custo ${bolinha(s.custo)}</span><b>${reais(r.custoReal)}</b><small>de ${reais(p.orcamento)} · IDC (CPI): ${r.cpi == null ? '—' : num(r.cpi)}</small></div>
      <div><span>Escopo ${bolinha(s.escopo)}</span><b>${r.entregas.length} entrega(s)</b><small>${r.mudPend.length} mudança(s) pendente(s)</small></div>
      <div class="${r.atrasadas.length ? 'pj-kpi-alerta' : ''}"><span>Atrasos</span><b>${r.atrasadas.length}</b><small>${r.aVencer.length} vence(m) em 7 dias</small></div>
    </div>
    <nav class="pj-abas naoimprimir" role="tablist">${ABAS.map(([k, n]) =>
      `<button type="button" role="tab" class="pj-aba" data-aba="${k}" aria-selected="${k === aba}">${esc(n)}${contador(k, r)}</button>`).join('')}</nav>
    <div id="pjAbaCorpo" class="pj-aba-corpo"></div>`;

  $('pjVoltar').onclick = () => { aberto = null; desenhar(); };
  $('pjSit').onchange = e => trocarSituacao(p, e.target.value);
  const av = $('pjAvancar'); if (av) av.onclick = () => avancar(p, r);
  const vf = $('pjVoltarFase'); if (vf) vf.onclick = () => voltarFase(p);
  alvo.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; desenharFicha(); });
  const def = ABAS.find(a => a[0] === aba) || ABAS[0];
  $('pjFolha').innerHTML = '';
  def[2]($('pjAbaCorpo'), r, () => desenharFicha());
}

function contador(k, r) {
  const n = k === 'riscos' ? r.altosSemPlano.length : k === 'mudancas' ? r.mudPend.length
    : k === 'problemas' ? r.ocorrAbertas.length : k === 'eap' ? r.atrasadas.length : 0;
  return n ? ` <span class="pj-cont">${n}</span>` : '';
}

async function trocarSituacao(p, sit) {
  if (sit === p.situacao) return;
  if (sit === 'encerrado') {
    aviso('Para encerrar, use a aba Encerramento (aceite das entregas e lições aprendidas).', true);
    aba = 'encerramento'; desenharFicha(); return;
  }
  if (sit === 'cancelado' && !confirm('Cancelar o projeto? Ele sai da lista "em andamento" e dos alertas.')) { desenharFicha(); return; }
  await gravar('pj_projetos', { ...p, situacao: sit, encerrado_em: sit === 'cancelado' ? hojeISO() : p.encerrado_em });
  aviso('Situação: ' + SITUACOES[sit] + '.');
  desenharFicha();
}

async function avancar(p, r) {
  const i = idxFase(p.fase);
  const prox = FASES[i + 1][0];
  const falta = pendenciasPara(prox, r);
  if (falta.length && !confirm('Para ' + nomeFase(prox) + ' o PMBOK recomenda ter:\n\n• ' + falta.join('\n• ') + '\n\nAvançar mesmo assim?')) return;
  const novo = { ...p, fase: prox, historico_fases: [...(p.historico_fases || []), { de: p.fase, para: prox, em: new Date().toISOString(), por: meuNome() }] };
  let extra = '';
  if (prox === 'execucao' && !p.fim_base && !p.orcamento_base) {
    novo.fim_base = p.fim_previsto || null;
    novo.orcamento_base = p.orcamento != null ? p.orcamento : (r.previstoEap || null);
    if (novo.orcamento == null && r.previstoEap) novo.orcamento = r.previstoEap;
    extra = ' Linha de base gravada (prazo e orçamento).';
  }
  await gravar('pj_projetos', novo);
  aviso('Fase: ' + nomeFase(prox) + '.' + extra);
  if (prox === 'encerramento') aba = 'encerramento';
  desenharFicha();
}

async function voltarFase(p) {
  const i = idxFase(p.fase);
  const ant = FASES[i - 1][0];
  if (!confirm('Voltar o projeto para ' + nomeFase(ant) + '?')) return;
  await gravar('pj_projetos', { ...p, fase: ant, historico_fases: [...(p.historico_fases || []), { de: p.fase, para: ant, em: new Date().toISOString(), por: meuNome() }] });
  desenharFicha();
}

/* ============================== entrada ============================== */
function desenhar() { if (aberto) desenharFicha(); else desenharLista(); }

export function abrirProjetos() {
  if (!ouvindo) {
    window.addEventListener('projetos-dados', () => {
      if ($('telaPjLista').hidden) return;
      // não redesenha com um formulário aberto (perderia o que está sendo digitado)
      if (!document.getElementById('modal').classList.contains('oculto')) return;
      const foco = document.activeElement;
      if (foco && foco.closest && foco.closest('#pjAbaCorpo') && /INPUT|TEXTAREA|SELECT/.test(foco.tagName)) return;
      desenhar();
    });
    ouvindo = true;
  }
  desenhar();
}

window.pjAbrirProjeto = (id, qualAba) => { aberto = id; if (qualAba) aba = qualAba; window.abrirTelaProjetos('pjLista'); };
