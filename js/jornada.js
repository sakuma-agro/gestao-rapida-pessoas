// jornada.js — módulo Gestão de Jornada
//
// Segue o padrão do disc.js: expõe ligarJornada(), abrirJornada(tela) e
// limparJornada(). O cálculo não mora aqui — mora em jornada-motor.js,
// que é função pura e tem os 13 casos de aceite.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { ligarCadastros, desenharCadastros } from './jornada-cadastros.js';
import { apurarDia, minParaHHMM, minParaDecimal } from './jornada-motor.js';
import * as fech from './jornada-fechamento.js';
import * as rel from './jornada-relatorios.js';
import * as emp from './jornada-emprestimos.js';
import * as fer from './jornada-ferias.js';
import * as bol from './jornada-boletins.js';
import * as docm from './jornada-documentos.js';
import { podeTela } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

const estadoTela = {
  competencia: jd.competenciaAtual(),
  busca: '',
  filtroSit: '',        // Lançados: '' todos · 'aberto' · 'fechado'
  editando: null,       // id do boletim em edição na tela Lançar jornada
  reabrindo: null,
};

const rotuloCompetencia = c => {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} / ${a}`;
};

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';

/* Formato de horas do destino: decimal (padrão) ou h:mm — RN-60.4.
   É só apresentação; o banco guarda minutos. */
function horas(min, formato = 'decimal') {
  if (!min) return formato === 'hm' ? '00:00' : '0,00';
  return formato === 'hm' ? minParaHHMM(min) : minParaDecimal(min).toFixed(2).replace('.', ',');
}

/* ===================================================================
   ENTRADA DO MÓDULO
   =================================================================== */

/* Início do mês (28/09/2026): do dia 1 ao DIAS_FECHAMENTO, se o mês anterior
   ainda não foi enviado ao DP em algum destino, o DP abre nele — é o mês que
   precisa ser fechado. Só na primeira abertura: depois vale o seletor. */
const DIAS_FECHAMENTO = 10;
let competenciaDecidida = false;

/** 'aaaa-mm' de n meses antes da competência (inclusive a própria como 0). */
function mesesAntes(comp, n) {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

function mesAnteriorPendente() {
  if (new Date().getDate() > DIAS_FECHAMENTO) return null;
  const [a, m] = jd.competenciaAtual().split('-').map(Number);
  const ant = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
  const pendentes = jd.dados.destinos.filter(d => d.ativo !== false)
    .filter(d => jd.dados.unidades.some(u => u.destino_id === d.id &&
      jd.dados.vinculos.some(v => v.unidade_id === u.id && v.ativo !== false)))
    .filter(d => !jd.travada(ant, d.id));
  return pendentes.length ? { ant, pendentes } : null;
}

export async function abrirJornada(tela) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(estadoTela.competencia); }
    catch (e) { aviso('Não consegui carregar os dados do módulo: ' + e.message); }
  }
  if (!competenciaDecidida && jd.dados.carregado) {
    competenciaDecidida = true;
    const p = mesAnteriorPendente();
    if (p && estadoTela.competencia !== p.ant) {
      estadoTela.competencia = p.ant;
      try {
        await jd.carregar(p.ant);
        aviso(`Aberto em ${rotuloCompetencia(p.ant)}: ainda não enviado ao ${p.pendentes.map(d => d.nome).join(' e ')}. `
          + `Confira, feche e envie. Para ver o mês novo, troque a competência no alto — o lançamento de boletins segue sempre a data do fato.`, true);
      } catch (e) { aviso(e.message); }
    }
  }
  if (tela === 'jorPainel')       desenharPainel();
  if (tela === 'jorLancar')       desenharLancar();
  if (tela === 'jorBoletins')     desenharBoletins();
  if (tela === 'jorFechamento')   desenharFechamento();
  if (tela === 'jorHistorico')    desenharHistorico();
  if (tela === 'jorAbatimento')   desenharAbatimento();
  if (tela === 'jorRelatorios')   desenharRelatorios();
  if (tela === 'jorConfig')       desenharConfigJornada();
}

export function limparJornada() {
  jd.limparJornadaDados();
  emp.limparEmprestimos();
  fer.limparFerias();
  bol.limparBoletins();
  docm.limparDocumentos();
  estadoTela.competencia = jd.competenciaAtual();
  competenciaDecidida = false;
  estadoTela.editando = null;
}

function aviso(texto, ok = false) {
  const el = $('jorAviso');
  if (!el) return;
  el.textContent = texto;
  el.className = 'jor-aviso' + (ok ? ' ok' : '');
  el.hidden = !texto;
}

/* Cabeçalho da tela. A marca da SAKUMA não se repete aqui: ela já está
   na barra do app, e marca repetida na mesma página vira ruído. */
function cabecalho(titulo, sub) {
  return `<header class="jor-cabecalho">
    <div>
      <div class="jor-cabecalho__titulo">${esc(titulo)}</div>
      <div class="jor-cabecalho__sub">${esc(sub || '')}</div>
    </div>
    <label class="jor-cabecalho__direita">competência
      <input type="month" class="jor-comp-sel" value="${estadoTela.competencia.slice(0, 7)}"
        title="Escolha o mês — no início do mês, volte ao anterior para fechar">
      <strong class="jor-cabecalho__competencia">${rotuloCompetencia(estadoTela.competencia)}</strong>
    </label>
  </header>`;
}

/* A assinatura da LOP agora é do app inteiro, no rodapé da página — não
   de cada tela. Nos documentos impressos ela continua, porque lá o rodapé
   do app não existe (ver jornada-relatorios.js). */
const assinatura = () => '';

/* ===================================================================
   J.1 — PAINEL
   =================================================================== */

function desenharPainel() {
  const bs = jd.dados.boletins;
  const aps = jd.dados.apuracoes;
  const somar = campo => aps.reduce((s, a) => s + (a[campo] || 0), 0);

  const extras = somar('min_extra_50') + somar('min_extra_100');
  const avisos = aps.flatMap(a => a.avisos || []);
  const semVinculo = estado.funcionarios.filter(f =>
    (f.situacao || 'ATIVO') === 'ATIVO' && !jd.vinculoDe(f.id)).length;

  $('telaJorPainel').innerHTML = cabecalho('Departamento Pessoal', 'Apuração de jornada · Campo e Administrativo') + `
    <div class="jor-corpo">
      <div class="jor-cartoes">
        ${cartao(bs.length, 'BOLETINS LANÇADOS')}
        ${cartao(horas(extras), 'HORAS EXTRAS')}
        ${cartao(horas(somar('min_deficit')), 'DÉFICIT')}
        ${cartao(avisos.length, 'AVISOS', avisos.length ? 'alerta' : '')}
      </div>

      ${painelEmprestimos()}
      ${painelFerias()}
      ${painelBoletins()}
      ${painelDocumentos()}
      ${painelAtrasados()}

      ${semVinculo ? `<div class="jor-caixa alerta">
        <b>${semVinculo} funcionário(s) ainda sem vínculo de jornada.</b>
        Unidade, setor e função são preenchidos no cadastro de Funcionários — é lá que a pessoa é cadastrada uma vez só, para todos os módulos.
        <button class="btn mini" id="jorIrVinculos">Abrir o cadastro de Funcionários</button>
      </div>` : ''}

      <h3 class="jor-h3">Situação por destino de DP</h3>
      ${tabelaDestinos()}

      ${avisos.length ? `<h3 class="jor-h3">Avisos da competência</h3>
        <ul class="jor-lista">${avisos.slice(0, 12).map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>` + assinatura();

  $('jorIrVinculos')?.addEventListener('click', () => irPara('funcionarios'));
  $('jorIrEmprestimos')?.addEventListener('click', () => irPara('empRecibos'));
  document.querySelectorAll('#telaJorPainel [data-ir-fer]').forEach(b =>
    b.addEventListener('click', () => irPara(b.dataset.irFer)));
}

/* Pendências de competência anterior (RN-18, 28/09/2026): boletim de um mês já
   enviado, lançado depois e pago nesta competência. */
function painelAtrasados() {
  const lista = jd.dados.boletins
    .filter(b => b.situacao !== 'cancelado' && b.competencia === estadoTela.competencia && jd.deCompetenciaAnterior(b))
    .sort((a, b) => a.data_fato.localeCompare(b.data_fato));
  if (!lista.length) return '';
  return `<h3 class="jor-h3">Pendências de competência anterior</h3>
    <p class="dc-sem jor-nota" style="margin:0 0 8px">Boletins de um mês já enviado ao DP, lançados depois. Entram no pagamento de
    ${rotuloCompetencia(estadoTela.competencia)}, somados às horas extras, sem reabrir o mês do fato.</p>
    <table class="dc-planilha"><thead><tr><th>Funcionário</th><th>Data do fato</th><th>Lançado em</th><th class="ce">Horas extras</th><th>Destino</th></tr></thead>
    <tbody>${lista.map(b => {
      const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id) || {};
      const u = jd.dados.unidades.find(x => x.id === b.unidade_id);
      return `<tr><td>${esc(estado.funcionarios.find(f => f.id === b.funcionario_id)?.nome || '—')}</td>
        <td>${dataBR(b.data_fato)}</td><td>${dataBR(String(b.criado_em || '').slice(0, 10))}</td>
        <td class="ce">${horas((a.min_extra_50 || 0) + (a.min_extra_100 || 0))}</td>
        <td>${esc(jd.destinoDe(u)?.nome || '—')}</td></tr>`;
    }).join('')}</tbody></table>`;
}

/* Boletins diários no painel: só para quem enxerga a tela de pendências. */
function painelBoletins() {
  if (!podeTela('bdPend')) return '';
  const r = bol.resumoPainel();
  if (!r.pendentes) return '';
  return `<div class="jor-caixa alerta"><b>${r.pendentes} boletim(ns) de serviço pendente(s)</b> — ${r.naoEntregou} não entregue(s), ${r.correcao} em correção — de ${r.pessoas} pessoa(s).
    <button class="btn mini" data-ir-fer="bdPend">Ver pendências</button></div>`;
}

/* Folha, holerite e recibo no painel: só para quem enxerga o Painel do submódulo. */
function painelDocumentos() {
  if (!podeTela('dmPainel')) return '';
  const r = docm.resumoPainel();
  if (!r.pendentes && !r.escanear) return '';
  return `<div class="jor-caixa ${r.pendentes ? 'alerta' : ''}">${r.pendentes ? `<b>${r.pendentes} documento(s) mensal(is) pendente(s)</b> — ${r.naoEntregue} não entregue(s), ${r.correcao} em correção — de ${r.pessoas} pessoa(s)` : ''}${
    r.pendentes && r.escanear ? '; ' : ''}${r.escanear ? `${r.escanear} entregue(s) falta(m) escanear` : ''}.
    <button class="btn mini" data-ir-fer="dmPainel">Folha, holerite e recibo</button></div>`;
}

/* Férias no painel: só para quem enxerga o submódulo. As faixas são as do
   painel de Férias — 90/60/30 dias até o limite de gozo. */
function painelFerias() {
  const r = fer.resumoPainel();
  if (!r) return '';
  return `<h3 class="jor-h3">Férias</h3>
    <div class="jor-cartoes">
      ${cartao(r.vencida, 'LIMITE VENCIDO', r.vencida ? 'alerta' : '')}
      ${cartao(r.f30, 'LIMITE EM ATÉ 30 DIAS', r.f30 ? 'alerta' : '')}
      ${cartao(r.f60 + r.f90, 'LIMITE EM 31 A 90 DIAS')}
      ${cartao(r.afastados, 'AFASTADOS HOJE')}
    </div>
    ${r.vencida || r.f30 || r.risco || r.semini ? `<div class="jor-caixa alerta">
      ${r.vencida ? `<b>${r.vencida} pessoa(s) passaram do limite de gozo</b> — férias em dobro (art. 137), a conta é do escritório. ` : ''}
      ${r.f30 ? `${r.f30} com limite nos próximos 30 dias. ` : ''}
      ${r.risco ? `${r.risco} período(s) aquisitivo(s) em risco por afastamento. ` : ''}
      ${r.semini ? `${r.semini} pessoa(s) sem situação inicial. ` : ''}
      <button class="btn mini" data-ir-fer="ferPainel">Abrir Férias</button></div>` : ''}
    ${r.bolFerias ? `<div class="jor-caixa">${r.bolFerias} boletim(ns) lançado(s) dentro de férias — informativo.
      <button class="btn mini" data-ir-fer="ferLanc">Ver lançamentos</button></div>` : ''}`;
}

/* Empréstimo Funcionário no painel: só para quem enxerga o submódulo. */
function painelEmprestimos() {
  const r = emp.resumoPainel();
  if (!r) return '';
  return `<h3 class="jor-h3">Empréstimo Funcionário</h3>
    <div class="jor-cartoes">
      ${cartao(r.brl(r.saldo), 'SALDO EM ABERTO')}
      ${cartao(r.desconto, 'EM DESCONTO')}
      ${cartao(r.fila, 'NA FILA')}
      ${cartao(r.aguardando, 'AGUARDANDO LIBERAÇÃO', r.aguardando ? 'alerta' : '')}
    </div>
    ${r.aguardando ? `<div class="jor-caixa alerta"><b>${r.aguardando} empréstimo(s) acima do teto</b> esperando o administrador.
      <button class="btn mini" id="jorIrEmprestimos">Abrir Recibos emitidos</button></div>` : ''}`;
}

const cartao = (valor, rotulo, tom = '') =>
  `<div class="jor-cartao ${tom}"><b>${esc(valor)}</b><span>${esc(rotulo)}</span></div>`;

function tabelaDestinos() {
  if (!jd.dados.destinos.length) return '<div class="vazio">Nenhum destino de DP cadastrado.</div>';
  return `<table class="dc-planilha"><thead><tr>
    <th>Destino</th><th>Unidades</th><th class="ce">Boletins</th>
    <th class="ce">Extras</th><th class="ce">Situação</th></tr></thead><tbody>
    ${jd.dados.destinos.filter(d => d.ativo !== false).map(d => {
      const unids = jd.dados.unidades.filter(u => u.destino_id === d.id);
      const ids = new Set(unids.map(u => u.id));
      const bs = jd.dados.boletins.filter(b => ids.has(b.unidade_id));
      const min = bs.reduce((s, b) => {
        const a = jd.dados.apuracoes.find(x => x.boletim_id === b.id);
        return s + ((a?.min_extra_50 || 0) + (a?.min_extra_100 || 0));
      }, 0);
      const comp = jd.competenciaDoDestino(estadoTela.competencia, d.id);
      const sit = comp?.situacao || 'aberta';
      return `<tr>
        <td><b>${esc(d.nome)}</b><br><span class="dc-sem">horas em ${d.formato_horas === 'hm' ? 'h:mm' : 'decimal'}</span></td>
        <td>${unids.length}</td>
        <td class="ce">${bs.length}</td>
        <td class="ce">${horas(min, d.formato_horas)}</td>
        <td class="ce"><span class="tag ${sit === 'aberta' ? 'ativo' : ''}">${esc(sit)}</span></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

/* ===================================================================
   J.2 — LANÇAR BOLETIM (com o painel "Apurado" ao vivo)
   =================================================================== */

function desenharLancar() {
  const ativos = estado.funcionarios
    .filter(f => (f.situacao || 'ATIVO') === 'ATIVO' && jd.vinculoDe(f.id));

  $('telaJorLancar').innerHTML = cabecalho('Lançar jornada', 'O número vem do talão; o cálculo é do sistema') + `
    <div class="jor-corpo jor-duas">
      <form id="jorFormBoletim" class="jor-form">
        <div class="jor-linha jor-linha-cad">
          <label>Nº do cadastro <input type="text" id="bCadastro" inputmode="numeric" autocomplete="off"></label>
          <label>Funcionário
            <select id="bFunc" required>
              <option value=""></option>
              ${ativos.map(f => `<option value="${f.id}">${esc(f.nome)}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}</option>`).join('')}
            </select>
          </label>
        </div>
        <small class="jor-dica" id="bCadAviso">${ativos.length ? '' : '<span class="jor-pend">Ninguém tem vínculo de jornada ainda.</span>'}</small>
        <div class="jor-linha">
          <label>Nº do boletim <input type="text" id="bNumero" inputmode="numeric"></label>
          <label>Data do fato <input type="date" id="bData" value="${hoje()}" required></label>
        </div>
        <div class="jor-dia-auto" id="bDiaAuto"></div>
        <div class="jor-dia-ja" id="bDiaJa" hidden></div>
        <label>Tipo do dia
          <select id="bTipo">
            ${jd.dados.tipos.filter(t => t.ativo !== false && !PELA_DATA.includes(t.codigo))
              .sort((a, b) => a.ordem - b.ordem)
              .map(t => `<option value="${t.id}" ${t.codigo === 'NORMAL' ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
          </select>
        </label>
        <label id="bMotivoRot" hidden>Motivo
          <input type="text" id="bMotivo" maxlength="200" placeholder="Ex.: consulta médica, doença na família, não justificou…">
        </label>
        <div class="jor-linha">
          <label>Entrada <input type="time" id="bIni"></label>
          <label>Saída <input type="time" id="bFim"></label>
          <label>Intervalo (min) <input type="number" id="bInterv" min="0" step="5" value="60"></label>
        </div>
        <small class="jor-dica" id="bJorPadrao"></small>
        <label class="jor-inline" id="bDifRot"><input type="checkbox" id="bDif"> O funcionário marcou diferente do correto</label>
        <div class="jor-caixa jor-marcado" id="bMarcadoBox" hidden>
          <p class="dc-sem" style="margin:0 0 6px">Em cima fica o <b>correto</b> — é o que vai para a folha.
            Aqui fica o que o funcionário <b>marcou</b> no boletim.</p>
          <div class="jor-linha">
            <label>Entrada marcada <input type="time" id="bMIni"></label>
            <label>Saída marcada <input type="time" id="bMFim"></label>
            <label>Intervalo marcado (min) <input type="number" id="bMInterv" min="0" step="5"></label>
          </div>
          <label>Por que é diferente? ${selOrigem('bMOrigem')}</label>
          <label>Motivo <input type="text" id="bMMotivo" maxlength="200" placeholder="Ex.: gerente de campo confirmou saída às 16h"></label>
        </div>
        <div class="jor-linha">
          <label>Hora extra especial
            <select id="bEspecial">
              <option value="">Nenhuma</option>
              ${tiposHeAtivos().map(t => `<option value="${t.id}">${esc(t.nome)} (${minParaHHMM(t.minutos)})</option>`).join('')}
            </select>
          </label>
          <label class="jor-inline"><input type="checkbox" id="bInsal"> Insalubridade no dia</label>
        </div>
        <div class="jor-nivel" role="radiogroup" aria-label="Nível do boletim">
          <span>Nível do boletim</span>
          ${NIVEIS.map(([k, t]) => `<label class="jor-nivel__op jor-nivel--${k}"><input type="radio" name="bNivel" value="${k}"> ${t}</label>`).join('')}
        </div>
        <label>Observação <input type="text" id="bObs" maxlength="200"></label>
        <div class="jor-acoes">
          <button type="submit" class="btn principal">Lançar</button>
          <button type="button" class="btn mini" id="bLimpar">Limpar</button>
        </div>
      </form>

      <aside class="jor-apurado" id="jorApurado"></aside>
    </div>` + assinatura();

  ['bFunc','bData','bTipo','bIni','bFim','bInterv','bEspecial','bMIni','bMFim','bMInterv'].forEach(id =>
    $(id).addEventListener('input', mostrarApurado));
  $('bDif').addEventListener('change', () => {
    // Ao marcar, o que está em cima (o que veio do talão) desce para "marcado";
    // aí é só corrigir em cima o horário certo.
    if ($('bDif').checked && !$('bMIni').value && !$('bMFim').value) {
      $('bMIni').value = $('bIni').value; $('bMFim').value = $('bFim').value;
      $('bMInterv').value = $('bInterv').value;
      if (!$('bMOrigem').value) $('bMOrigem').value = 'gerente';
    }
    mostrarMarcado(); mostrarApurado();
  });
  // Funcionário, data ou tipo do dia mudou → a jornada padrão entra de novo.
  ['bFunc','bData','bTipo'].forEach(id => $(id).addEventListener('change', () => {
    if (id === 'bFunc') cadastroDoSelecionado();
    mostrarDiaAuto(); mostrarMotivo();
    preencherJornadaPadrao(); mostrarApurado();
    carregarDia();
  }));
  $('bCadastro').addEventListener('input', () => {
    buscarPorCadastro(); preencherJornadaPadrao(); mostrarApurado(); carregarDia();
  });
  $('bLimpar').addEventListener('click', () => {
    $('jorFormBoletim').reset(); $('bCadAviso').innerHTML = ''; $('bJorPadrao').textContent = '';
    mostrarDiaAuto(); mostrarMotivo(); mostrarMarcado(); mostrarApurado();
  });
  $('jorFormBoletim').addEventListener('submit', gravarBoletim);
  prepararEdicao();
  mostrarDiaAuto(); mostrarMotivo(); mostrarApurado();
  carregarDia();
}

/* ---------- Complemento do dia (28/09/2026) ----------
   Se a pessoa já tem boletim com horário naquele dia (mesmo num mês já
   fechado), o novo lançamento é calculado JUNTO com o que existe — o dia tem
   fechamento único (A-01) — e grava só a diferença. Ex.: 30/09 lançado
   07–16 e fechado; em 10/10 aparece a hora extra 16–19: o app apura o dia
   07–19, desconta o que já foi pago e grava 3h, pagas em outubro. */
const dia = { chave: '', boletins: [], apuracoes: [] };

const outrosDoDia = (fid, data) => (fid + '|' + data) !== dia.chave ? []
  : dia.boletins.filter(b => b.id !== estadoTela.editando && b.situacao !== 'cancelado' && b.hora_ini && b.hora_fim);

async function carregarDia() {
  const fid = $('bFunc')?.value, data = $('bData')?.value;
  const chave = fid && data ? fid + '|' + data : '';
  if (!chave) { dia.chave = ''; dia.boletins = []; dia.apuracoes = []; mostrarDiaJa(); return; }
  if (chave === dia.chave) { mostrarDiaJa(); return; }
  const r = await jd.boletinsDoDia(fid, data);
  if ((($('bFunc')?.value || '') + '|' + ($('bData')?.value || '')) !== chave) return;   // trocou no meio
  Object.assign(dia, { chave, boletins: r.boletins, apuracoes: r.apuracoes });
  if (!estadoTela.editando) preencherJornadaPadrao();
  mostrarDiaJa(); mostrarApurado();
}

function mostrarDiaJa() {
  const box = $('bDiaJa');
  if (!box) return;
  const fid = $('bFunc').value, data = $('bData').value;
  const outros = outrosDoDia(fid, data);
  const todos = (fid + '|' + data) === dia.chave ? dia.boletins.filter(b => b.id !== estadoTela.editando) : [];
  if (!todos.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<b>Já existe lançamento neste dia:</b> ${todos.map(b => {
    const s = situacaoBoletim(b);
    const tipo = jd.dados.tipos.find(t => t.id === b.tipo_id);
    return `${b.hora_ini ? `${b.hora_ini.slice(0, 5)}–${(b.hora_fim || '').slice(0, 5)}` : esc(tipo?.nome || '—')}${b.numero ? ` (nº ${esc(b.numero)})` : ''}
      · ${s.fechado ? `fechado, pago em ${esc(fech.mesCurto(s.pagoEm))}` : `em aberto, a pagar em ${esc(fech.mesCurto(s.pagoEm))}`}`;
  }).join('; ')}.
  ${outros.length ? `<br>Este lançamento entra como <b>complemento</b>: o app junta com o que já existe e grava só a diferença.
    Para corrigir o lançamento em aberto, use <b>Editar</b> em Lançados.` : ''}`;
}

/** Apura o dia inteiro e, se já havia boletim com horário, devolve só a diferença. */
function apurarComplemento(entrada) {
  const r = apurarDia(entrada);
  const outros = outrosDoDia(entrada._contexto.funcionarioId, entrada.data);
  if (!outros.length || entrada.tipo?.apura === false) return r;
  const aps = outros.map(b => dia.apuracoes.find(a => a.boletim_id === b.id) || {});
  const ja = k => aps.reduce((s, a) => s + (a[k] || 0), 0);
  const menos = (v, k) => Math.max(0, v - ja(k));
  const extraDia = r.minExtra50 + r.minExtra100;
  const out = {
    ...r,
    minPrevistos: menos(r.minPrevistos, 'min_previstos'),
    minTrabalhados: menos(r.minTrabalhados, 'min_trabalhados'),
    minExtra50: menos(r.minExtra50, 'min_extra_50'),
    minExtra100: menos(r.minExtra100, 'min_extra_100'),
    minDeficit: menos(r.minDeficit, 'min_deficit'),
    minNoturnos: menos(r.minNoturnos, 'min_noturnos'),
    minIntervaloSuprimido: menos(r.minIntervaloSuprimido, 'min_intervalo_suprimido'),
    avisos: [...r.avisos],
    complemento: { trabalhadoDia: r.minTrabalhados, extraDia, extraJa: ja('min_extra_50') + ja('min_extra_100') },
  };
  if (r.minDeficit < ja('min_deficit'))
    out.avisos.push(`O dia agora tem menos déficit do que o já lançado (${horas(ja('min_deficit'))}). O desconto já feito não volta sozinho — acerte com o escritório.`);
  out.memoria = `COMPLEMENTO DO DIA — ${outros.length} lançamento(s) anterior(es) neste dia.\n`
    + `Dia inteiro: ${minParaHHMM(r.minTrabalhados)} trabalhadas, extras ${minParaHHMM(extraDia)}, déficit ${minParaHHMM(r.minDeficit)}.\n`
    + `Já lançado: extras ${minParaHHMM(ja('min_extra_50') + ja('min_extra_100'))}, déficit ${minParaHHMM(ja('min_deficit'))}.\n`
    + `Este lançamento grava só a diferença: extras ${minParaHHMM(out.minExtra50 + out.minExtra100)}, déficit ${minParaHHMM(out.minDeficit)}.\n\n`
    + r.memoria;
  return out;
}

/* Editar lançamento em aberto (28/09/2026): a tela Lançados manda o id em
   estadoTela.editando; o formulário abre preenchido, pede o motivo da
   alteração e grava por cima do mesmo boletim (situação "corrigido"). */
/* Nível do boletim (28/09/2026): nota de quem lança sobre a qualidade do
   boletim preenchido à mão. Opcional; vai para o painel Qualidade dos boletins. */
const NIVEIS = [['ruim', 'Ruim'], ['bom', 'Bom'], ['otimo', 'Ótimo']];
const nivelMarcado = () => document.querySelector('input[name="bNivel"]:checked')?.value || null;
const nivelTexto = k => (NIVEIS.find(n => n[0] === k) || [])[1] || '';

const ORIGENS = {
  gerente:   'Conferido com o gerente de campo — o funcionário marcou diferente',
  digitacao: 'Erro de digitação no lançamento',
  outro:     'Outro',
};
const selOrigem = id => `<select id="${id}"><option value="">— escolha —</option>
  ${Object.entries(ORIGENS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>`;

/* Marcado × correto já no lançamento (28/09/2026): a caixa "O funcionário
   marcou diferente" guarda o que veio no talão; os campos de cima são o
   correto e é só ele que vai para a apuração e para a folha. */
function mostrarMarcado() {
  const box = $('bMarcadoBox');
  if (box) box.hidden = !$('bDif')?.checked;
}
function entradaMarcada(e) {
  if (!$('bDif')?.checked) return null;
  const m = { ini: $('bMIni').value, fim: $('bMFim').value, intervalo: Number($('bMInterv').value || 0) };
  if (!m.ini || !m.fim) return null;
  const bs = [...e.boletins];
  const novo = ($('bIni').value && $('bFim').value) ? bs.pop() : { numero: $('bNumero').value, heEspecial: minutosHe() };
  bs.push({ ...novo, ...m });
  return { ...e, boletins: bs };
}

function prepararEdicao() {
  const b = estadoTela.editando && jd.dados.boletins.find(x => x.id === estadoTela.editando);
  if (!b || b.situacao === 'cancelado' || situacaoBoletim(b).fechado) { estadoTela.editando = null; return; }
  const f = estado.funcionarios.find(x => x.id === b.funcionario_id);
  const form = $('jorFormBoletim');
  form.insertAdjacentHTML('afterbegin', `<div class="jor-caixa alerta" id="bEditando">
    <b>Editando</b> o lançamento de ${esc(f?.nome || '—')} de ${dataBR(b.data_fato)}${b.numero ? ` (boletim nº ${esc(b.numero)})` : ''}.
    <button class="btn mini" type="button" id="bCancelarEdicao">Cancelar edição</button></div>`);
  $('bObs').closest('label').insertAdjacentHTML('afterend',
    `<label>Motivo da alteração (obrigatório) <input type="text" id="bMotivoAlt" maxlength="200" required></label>`);
  if (![...$('bFunc').options].some(o => o.value === b.funcionario_id))
    $('bFunc').insertAdjacentHTML('beforeend', `<option value="${b.funcionario_id}">${esc(f?.nome || '—')}</option>`);
  $('bFunc').value = b.funcionario_id; cadastroDoSelecionado();
  $('bNumero').value = b.numero || '';
  $('bData').value = b.data_fato;
  if (b.tipo_id) $('bTipo').value = b.tipo_id;
  $('bIni').value = (b.hora_ini || '').slice(0, 5);
  $('bFim').value = (b.hora_fim || '').slice(0, 5);
  $('bInterv').value = b.intervalo_min ?? 0;
  $('bEspecial').value = b.he_especial_tipo_id || '';
  $('bInsal').checked = !!b.insalubridade_dia;
  $('bObs').value = b.observacao || '';
  document.querySelectorAll('input[name="bNivel"]').forEach(r => { r.checked = r.value === b.qualidade; });
  mostrarMotivo();
  $('bMotivo').value = b.motivo || '';
  form.querySelector('[type=submit]').textContent = 'Salvar alteração';
  // Editar tem a mesma caixa do Lançar: marcado × correto só quando você marca.
  const mc = b.marcado;
  $('bDif').checked = !!mc;
  $('bMIni').value = mc ? String(mc.hora_ini || '').slice(0, 5) : '';
  $('bMFim').value = mc ? String(mc.hora_fim || '').slice(0, 5) : '';
  $('bMInterv').value = mc ? (mc.intervalo_min ?? '') : '';
  $('bMOrigem').value = mc ? (b.origem_alteracao || '') : '';
  $('bMMotivo').value = mc ? (b.motivo_alteracao || '') : '';
  mostrarMarcado();
  $('bJorPadrao').textContent = '';
  $('bCancelarEdicao').addEventListener('click', () => { estadoTela.editando = null; irPara('jorBoletins'); });
}

/* ---------- Sábado, domingo e feriado vêm da data (25/09/2026) ----------
   O motor já decide o percentual pela data (feriado > domingo > sábado), então
   esses três saíram da lista do Tipo do dia e aparecem sozinhos aqui. */
const PELA_DATA = ['SABADO', 'DOMINGO', 'FERIADO'];
const SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

function mostrarDiaAuto() {
  const alvo = $('bDiaAuto');
  const data = $('bData').value;
  if (!data) { alvo.innerHTML = ''; return; }
  const [a, m, d] = data.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const v = jd.vinculoDe($('bFunc').value);
  const fer = jd.feriadoEm(data, jd.fazendaDe(jd.unidadeDe(v))?.municipio);
  const p = jd.parametrosEm(data);
  const perc = (k, pad) => p[k] != null ? Number(p[k]) : pad;
  let cls = '', txt;
  if (fer) { cls = 'forte'; txt = `<b>Feriado</b> — ${esc(fer.nome)} · todas as horas são extra a ${perc('perc_extra_feriado', 100)}%`; }
  else if (dow === 0) { cls = 'forte'; txt = `<b>Domingo</b> · todas as horas são extra a ${perc('perc_extra_domingo', 100)}%`; }
  else if (dow === 6) { cls = 'medio'; txt = `<b>Sábado</b> · extra a ${perc('perc_extra_sabado', 50)}% além da jornada do sábado`; }
  else txt = `${SEMANA[dow].charAt(0).toUpperCase() + SEMANA[dow].slice(1)} · dia útil`;
  // Boletim atrasado (RN-18): o mês do fato já foi enviado → paga no próximo aberto.
  const dest = jd.unidadeDe(v)?.destino_id;
  const pag = jd.competenciaDePagamento(data, dest);
  if (dest && pag !== jd.competenciaDe(data)) {
    cls = 'forte';
    txt += `<br><b>${rotuloCompetencia(jd.competenciaDe(data))} já foi enviado ao ${esc(jd.destinoDe(jd.unidadeDe(v))?.nome || 'DP')}.</b>
      Este boletim entra no pagamento de <b>${rotuloCompetencia(pag)}</b>, marcado como competência anterior. O mês do fato não é reaberto.`;
  }
  alvo.className = 'jor-dia-auto ' + cls;
  alvo.innerHTML = txt;
}

/* Falta, falta justificada e atestado (tipos que não apuram horas) pedem o motivo. */
function mostrarMotivo() {
  const tipo = jd.dados.tipos.find(t => t.id === $('bTipo').value);
  const pede = !!tipo && tipo.apura === false;
  $('bMotivoRot').hidden = !pede;
  if (!pede) $('bMotivo').value = '';
}

/* ---------- Nº do cadastro → funcionário (25/09/2026) ----------
   Compara só os dígitos e sem zero à esquerda: "007" e "7" são o mesmo. */
const numCad = v => String(v == null ? '' : v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');

function buscarPorCadastro() {
  const n = numCad($('bCadastro').value);
  const aviso = $('bCadAviso');
  if (!n) { aviso.innerHTML = ''; return; }
  const achados = estado.funcionarios.filter(f => numCad(f.cadastro) === n);
  const bom = achados.find(f => (f.situacao || 'ATIVO') === 'ATIVO' && jd.vinculoDe(f.id));
  if (bom) {
    $('bFunc').value = bom.id;
    aviso.innerHTML = '';
    return;
  }
  $('bFunc').value = '';
  aviso.innerHTML = achados.length
    ? `<span class="jor-pend">Nº ${esc(n)} é de ${esc(achados[0].nome)}, que está inativo ou sem vínculo de jornada.</span>`
    : `<span class="jor-pend">Nenhum funcionário com o nº de cadastro ${esc(n)}.</span>`;
}

function cadastroDoSelecionado() {
  const f = estado.funcionarios.find(x => x.id === $('bFunc').value);
  $('bCadastro').value = f?.cadastro || '';
  $('bCadAviso').innerHTML = '';
}

/* ---------- Jornada padrão nos horários (25/09/2026) ----------
   Entrada, saída e intervalo vêm da jornada do funcionário para aquele dia
   da semana. Continuam editáveis: é sugestão, não trava. Tipo do dia que não
   apura horas (falta, atestado) ou dia sem jornada (domingo) limpa os campos. */
function preencherJornadaPadrao() {
  const dica = $('bJorPadrao');
  const fid = $('bFunc').value, data = $('bData').value;
  if (!fid || !data) { dica.textContent = ''; return; }
  // Já tem horário lançado neste dia: a jornada padrão viraria dia em dobro.
  if (!estadoTela.editando && outrosDoDia(fid, data).length) {
    $('bIni').value = ''; $('bFim').value = ''; $('bInterv').value = 0;
    dica.textContent = 'Já há horário lançado neste dia — informe só o horário a mais (ex.: 16:00 a 19:00).';
    return;
  }
  const v = jd.vinculoDe(fid);
  const tipo = jd.dados.tipos.find(t => t.id === $('bTipo').value);
  const j = jd.jornadaDe(v);
  const dia = jd.jornadaDoDia(v, data);
  if (tipo && tipo.apura === false) {
    $('bIni').value = ''; $('bFim').value = '';
    dica.textContent = `${tipo.nome}: sem horários.`;
    return;
  }
  if (!j) {
    dica.innerHTML = '<span class="jor-pend">Funcionário sem jornada no cadastro (Nível 2) — preencha os horários à mão.</span>';
    return;
  }
  // Feriado não tem jornada prevista: deixar 07–16 preenchido viraria 8h de
  // extra a 100% para quem só esqueceu de apagar.
  const fer = jd.feriadoEm(data, jd.fazendaDe(jd.unidadeDe(v))?.municipio);
  if (fer) {
    $('bIni').value = ''; $('bFim').value = '';
    dica.textContent = 'Feriado: sem jornada prevista — se trabalhou, preencha os horários.';
    return;
  }
  if (!dia) {
    $('bIni').value = ''; $('bFim').value = '';
    dica.textContent = `Jornada ${j.nome}: sem expediente neste dia — se trabalhou, preencha os horários.`;
    return;
  }
  $('bIni').value = dia.ini || '';
  $('bFim').value = dia.fim || '';
  $('bInterv').value = dia.int ?? 0;
  dica.textContent = `Jornada padrão (${j.nome}) preenchida — altere se o boletim trouxer outro horário.`;
}

const tiposHeAtivos = () => (jd.dados.tiposHe || [])
  .filter(t => t.ativo !== false)
  .sort((a, b) => (a.ordem - b.ordem) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

const minutosHe = () =>
  Number((jd.dados.tiposHe || []).find(t => t.id === $('bEspecial').value)?.minutos || 0);

/** Monta a entrada do motor a partir do formulário. Um lugar só. */
function entradaDoFormulario() {
  const funcionarioId = $('bFunc').value;
  const data = $('bData').value;
  if (!funcionarioId || !data) return null;

  const v = jd.vinculoDe(funcionarioId);
  const setor = jd.setorDe(v);
  const unidade = jd.unidadeDe(v);
  const fazenda = jd.fazendaDe(unidade);
  const tipo = jd.dados.tipos.find(t => t.id === $('bTipo').value);
  const funcao = jd.dados.funcoes.find(f => f.id === v?.funcao_id);

  const doDia = outrosDoDia(funcionarioId, data).map(b => ({
    numero: b.numero, ini: b.hora_ini.slice(0, 5), fim: b.hora_fim.slice(0, 5),
    intervalo: Number(b.intervalo_min || 0), heEspecial: Number(b.he_especial_min || 0),
  }));
  return {
    data,
    boletins: [...doDia, ...(($('bIni').value && $('bFim').value) ? [{
      numero: $('bNumero').value,
      ini: $('bIni').value,
      fim: $('bFim').value,
      intervalo: Number($('bInterv').value || 0),
      heEspecial: minutosHe(),
    }] : [])],
    jornadaDia: jd.jornadaDoDia(v, data),
    tipo: tipo ? {
      codigo: tipo.codigo, nome: tipo.nome, apura: tipo.apura,
      deducao: tipo.deducao, contaDias: tipo.conta_dias,
      percentualForcado: tipo.percentual_forcado,
    } : null,
    feriado: jd.feriadoEm(data, fazenda?.municipio),
    regimeSetor: setor?.regime || 'boletim',
    funcao: { faixaNoturna: funcao?.faixa_noturna || null },
    parametros: jd.parametrosEm(data),
    funcionarioAtivo: true,
    _contexto: { v, unidade, funcionarioId },
  };
}

/** O painel "Apurado" roda o motor a cada tecla — sem gravar nada. */
function mostrarApurado() {
  const entrada = entradaDoFormulario();
  const alvo = $('jorApurado');
  if (!entrada) { alvo.innerHTML = '<div class="vazio">Escolha o funcionário e a data.</div>'; return; }

  const r = apurarComplemento(entrada);
  alvo.innerHTML = `
    <h4>Apurado${r.complemento ? ' <span class="dc-sem">— só a diferença</span>' : ''}</h4>
    ${r.complemento ? `<p class="dc-sem" style="margin:0 0 6px">Dia inteiro com os lançamentos anteriores: ${minParaHHMM(r.complemento.trabalhadoDia)} trabalhadas,
      extras ${horas(r.complemento.extraDia)}. Já lançado antes: extras ${horas(r.complemento.extraJa)}.</p>` : ''}
    <dl class="jor-apurado__grade">
      <dt>Situação</dt><dd>${esc(r.situacao)}</dd>
      <dt>Previsto</dt><dd>${minParaHHMM(r.minPrevistos)}</dd>
      <dt>Trabalhado</dt><dd>${minParaHHMM(r.minTrabalhados)}</dd>
      <dt>Extra 50%</dt><dd>${horas(r.minExtra50)}</dd>
      <dt>Extra 100%</dt><dd>${horas(r.minExtra100)}</dd>
      <dt>Déficit</dt><dd>${horas(r.minDeficit)}</dd>
      <dt>Interv. suprimido</dt><dd>${r.minIntervaloSuprimido} min</dd>
      <dt>Noturnas</dt><dd>${minParaHHMM(r.minNoturnos)}</dd>
    </dl>
    ${r.avisos.length ? `<ul class="jor-avisos">${r.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    ${blocoMarcado(entrada, r)}
    <details><summary>Memória de cálculo</summary><pre>${esc(r.memoria)}</pre></details>`;
}

function blocoMarcado(entrada, r) {
  const em = entradaMarcada(entrada);
  if (!em) return $('bDif')?.checked ? '<p class="jor-pend">Preencha a entrada e a saída que o funcionário marcou.</p>' : '';
  const m = apurarComplemento(em);
  const exM = m.minExtra50 + m.minExtra100, exC = r.minExtra50 + r.minExtra100;
  const dif = exC - exM;
  return `<div class="jor-caixa jor-marcado-res">
      <b>Marcado × correto</b><br>
      Marcado: ${esc($('bMIni').value)}–${esc($('bMFim').value)} · extras ${horas(exM)}${m.minDeficit ? ` · déficit ${horas(m.minDeficit)}` : ''}<br>
      Correto: ${esc($('bIni').value || '—')}–${esc($('bFim').value || '—')} · extras ${horas(exC)}${r.minDeficit ? ` · déficit ${horas(r.minDeficit)}` : ''}<br>
      Diferença em extras: <b>${dif ? (dif < 0 ? '−' : '+') + horas(Math.abs(dif)) : 'nenhuma'}</b>
    </div>`;
}

async function gravarBoletim(ev) {
  ev.preventDefault();
  const entrada = entradaDoFormulario();
  if (!entrada) return;

  const { v, unidade, funcionarioId } = entrada._contexto;
  // RN-18 (28/09/2026): mês do fato já enviado → o boletim é pago no primeiro
  // mês aberto seguinte, com a data do fato preservada. Nada é reaberto.
  const competencia = jd.competenciaDePagamento(entrada.data, unidade?.destino_id);
  const atrasado = competencia !== jd.competenciaDe(entrada.data);

  const original = estadoTela.editando ? jd.dados.boletins.find(x => x.id === estadoTela.editando) : null;
  const motivoAlt = $('bMotivoAlt')?.value.trim() || '';
  if (original) {
    if (situacaoBoletim(original).fechado) { aviso('Este lançamento já está fechado — para corrigir, reabra a competência no Fechamento.'); return; }
    if (motivoAlt.length < 5) { aviso('Escreva o motivo da alteração (pelo menos 5 letras).'); $('bMotivoAlt').focus(); return; }
  }

  let marcadoNovo = null;
  if ($('bDif').checked) {
    const em = entradaMarcada(entrada);
    if (!em) { aviso('Preencha a entrada e a saída que o funcionário marcou (ou desmarque "marcou diferente").'); $('bMIni').focus(); return; }
    if ($('bMIni').value === $('bIni').value && $('bMFim').value === $('bFim').value
        && Number($('bMInterv').value || 0) === Number($('bInterv').value || 0)) {
      aviso('O marcado está igual ao correto. Corrija o horário em cima ou desmarque "marcou diferente".'); return;
    }
    if (!$('bMOrigem').value) { aviso('Escolha por que o marcado é diferente.'); $('bMOrigem').focus(); return; }
    // No Editar, o motivo da alteração serve também para a diferença.
    if (!$('bMMotivo').value.trim() && original) $('bMMotivo').value = motivoAlt;
    if ($('bMMotivo').value.trim().length < 5) { aviso('Escreva o motivo da diferença (pelo menos 5 letras).'); $('bMMotivo').focus(); return; }
    const m = apurarComplemento(em);
    marcadoNovo = {
      hora_ini: $('bMIni').value, hora_fim: $('bMFim').value, intervalo_min: Number($('bMInterv').value || 0),
      tipo_id: $('bTipo').value || null, he_especial_min: minutosHe(),
      min_extra_50: m.minExtra50, min_extra_100: m.minExtra100, min_deficit: m.minDeficit,
      min_trabalhados: m.minTrabalhados, no_lancamento: true,
      lancado_por: original?.marcado?.lancado_por || estado.sessao?.user?.email || null,
      lancado_em: original?.marcado?.lancado_em || new Date().toISOString(),
    };
  }

  // O motor roda ANTES da gravação: boletim e apuração nascem juntos. Com
  // outro boletim no mesmo dia, grava só a diferença (complemento do dia).
  const r = apurarComplemento(entrada);
  const b = {
    numero: $('bNumero').value || null,
    data_fato: entrada.data,
    competencia,
    funcionario_id: funcionarioId,
    unidade_id: v?.unidade_id || null,
    tipo_id: $('bTipo').value || null,
    hora_ini: $('bIni').value || null,
    hora_fim: $('bFim').value || null,
    intervalo_min: Number($('bInterv').value || 0),
    intervalo_suprimido_min: r.minIntervaloSuprimido,
    he_especial_min: minutosHe(),
    he_especial_tipo_id: $('bEspecial').value || null,
    insalubridade_dia: $('bInsal').checked,
    observacao: $('bObs').value || null,
    qualidade: nivelMarcado(),
    motivo: $('bMotivoRot').hidden ? null : ($('bMotivo').value.trim() || null),
    situacao: original ? 'corrigido' : 'lancado',
    criado_por: original ? original.criado_por : (estado.sessao?.user?.email || null),
    criado_em: original ? original.criado_em : new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  if (marcadoNovo) {
    b.marcado = marcadoNovo;
    b.origem_alteracao = $('bMOrigem').value;
    b.motivo_alteracao = $('bMMotivo').value.trim();
  }
  if (original) {
    b.id = original.id; b.compensacao = original.compensacao ?? null;
    if (!marcadoNovo) { b.marcado = null; b.origem_alteracao = null; b.motivo_alteracao = null; }
  }

  // Nº repetido gera alerta, nunca bloqueio (RN-04).
  if (b.numero && jd.dados.boletins.some(x => x.numero === b.numero && x.id !== b.id && x.situacao !== 'cancelado')) {
    aviso(`Atenção: o boletim nº ${b.numero} já foi lançado antes. Lançado assim mesmo — confira o talão.`);
  }

  const gravado = await jd.salvar('boletins', b);
  await jd.salvar('apuracoes', {
    boletim_id: gravado.id,
    min_trabalhados: r.minTrabalhados,
    min_previstos: r.minPrevistos,
    min_extra_50: r.minExtra50,
    min_extra_100: r.minExtra100,
    min_deficit: r.minDeficit,
    min_noturnos: r.minNoturnos,
    min_intervalo_suprimido: r.minIntervaloSuprimido,
    avisos: r.avisos,
    memoria: r.memoria,
    parametros: entrada.parametros,
    calculado_em: new Date().toISOString(),
  });
  await jd.registrar({ tabela: 'jor_boletins', registro_id: gravado.id, acao: original ? 'update' : 'insert',
    antes: original || null, depois: b, justificativa: original ? motivoAlt : null });
  if (original) {
    estadoTela.editando = null;
    aviso(`Lançamento de ${dataBR(entrada.data)} alterado.`, true);
    irPara('jorBoletins');
    return;
  }

  $('bNumero').value = '';
  $('bEspecial').value = ''; $('bInsal').checked = false; $('bObs').value = ''; $('bMotivo').value = '';
  $('bDif').checked = false; ['bMIni','bMFim','bMInterv','bMOrigem','bMMotivo'].forEach(id => { $(id).value = ''; });
  document.querySelectorAll('input[name="bNivel"]').forEach(r => { r.checked = false; });
  mostrarMarcado();
  dia.chave = '';
  preencherJornadaPadrao();   // mesmo funcionário, próximo boletim já vem com a jornada
  carregarDia();
  aviso(`Boletim de ${dataBR(entrada.data)} lançado`
    + (atrasado ? ` — entra no pagamento de ${rotuloCompetencia(competencia)} como competência anterior.` : '.')
    + (estado.online ? '' : ' Sem rede — vai subir sozinho.'), true);
  mostrarApurado();
}

/* ===================================================================
   J.3 — BOLETINS DA COMPETÊNCIA
   =================================================================== */

/* Situação do boletim (28/09/2026): Fechado quando a competência em que ele é
   pago já foi enviada ao DP daquele destino; senão Em aberto (a pagar). Só o
   boletim em aberto pode ser editado ou excluído. */
function situacaoBoletim(b) {
  const u = jd.dados.unidades.find(x => x.id === b.unidade_id);
  const comp = u ? jd.competenciaDoDestino(b.competencia, u.destino_id) : null;
  const fechado = !!comp && ['enviada', 'aprovada', 'travada'].includes(comp.situacao);
  return { fechado, pagoEm: b.competencia, fechadoEm: fechado ? (comp.enviada_em || comp.aprovada_em || '').slice(0, 10) : null };
}

function desenharBoletins() {
  const busca = estadoTela.busca.toLowerCase();
  const todas = jd.dados.boletins
    .filter(b => b.competencia === estadoTela.competencia && b.situacao !== 'cancelado')
    .map(b => ({
      b,
      f: estado.funcionarios.find(x => x.id === b.funcionario_id),
      a: jd.dados.apuracoes.find(x => x.boletim_id === b.id),
      s: situacaoBoletim(b),
    }));
  const linhas = todas
    .filter(l => !busca ||
      (l.f?.nome || '').toLowerCase().includes(busca) ||
      (l.b.numero || '').includes(busca))
    .filter(l => !estadoTela.filtroSit || (estadoTela.filtroSit === 'fechado') === l.s.fechado)
    .sort((x, y) => y.b.data_fato.localeCompare(x.b.data_fato));
  const nAberto = todas.filter(l => !l.s.fechado).length;

  const soma = c => linhas.reduce((s, l) => s + (l.a?.[c] || 0), 0);

  $('telaJorBoletins').innerHTML = cabecalho('Jornadas lançadas', 'Conferência e correção da competência') + `
    <div class="jor-corpo">
      <div class="jor-barra">
        <input id="jorBuscaBol" type="search" placeholder="Buscar por funcionário ou nº do boletim" value="${esc(estadoTela.busca)}">
        <select id="jorFiltroSit" aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="aberto" ${estadoTela.filtroSit === 'aberto' ? 'selected' : ''}>Em aberto (a pagar) · ${nAberto}</option>
          <option value="fechado" ${estadoTela.filtroSit === 'fechado' ? 'selected' : ''}>Fechado (já pago) · ${todas.length - nAberto}</option>
        </select>
        <span class="dc-sem">${linhas.length} boletim(ns)</span>
      </div>
      ${linhas.length ? `<table class="dc-planilha"><thead><tr>
        <th>Data</th><th>Nº</th><th>Funcionário</th><th>Horário</th>
        <th class="ce">Extra 50%</th><th class="ce">Extra 100%</th>
        <th class="ce">Déficit</th><th class="ce">Interv.</th><th>Situação</th><th class="ce"></th>
      </tr></thead><tbody>
        ${linhas.map(({ b, f, a, s }) => `<tr>
          <td>${dataBR(b.data_fato)}${jd.deCompetenciaAnterior(b) ? `<br><span class="jor-pend">pago em ${esc(rotuloCompetencia(b.competencia))}</span>` : ''}</td>
          <td>${esc(b.numero || '—')}${b.qualidade ? `<br><span class="jor-nivel-tag jor-nivel--${b.qualidade}">${nivelTexto(b.qualidade)}</span>` : ''}</td>
          <td>${esc(f?.nome || '—')}</td>
          <td>${b.hora_ini ? `${b.hora_ini.slice(0,5)}–${(b.hora_fim||'').slice(0,5)}`
            : esc(jd.dados.tipos.find(t => t.id === b.tipo_id)?.nome || '—')}${b.motivo ? `<br><span class="dc-sem">${esc(b.motivo)}</span>` : ''}${b.marcado?.hora_ini
              ? `<br><span class="dc-sem">marcado ${b.marcado.hora_ini.slice(0,5)}–${(b.marcado.hora_fim||'').slice(0,5)} · marcou diferente</span>` : ''}</td>
          <td class="ce">${horas(a?.min_extra_50)}</td>
          <td class="ce">${horas(a?.min_extra_100)}</td>
          <td class="ce">${horas(a?.min_deficit)}</td>
          <td class="ce">${a?.min_intervalo_suprimido || 0}</td>
          <td>${s.fechado
            ? `<span class="tag ativo">Fechado</span><br><span class="dc-sem">pago em ${esc(fech.mesCurto(s.pagoEm))}${s.fechadoEm ? ` · fechado em ${dataBR(s.fechadoEm)}` : ''}</span>`
            : `<span class="tag alerta">Em aberto</span><br><span class="dc-sem">a pagar em ${esc(fech.mesCurto(s.pagoEm))}</span>`}</td>
          <td class="ce jor-bol-acoes"><button class="btn mini" data-memoria="${b.id}">Memória</button>${s.fechado ? ''
            : `<button class="btn mini" data-editar-bol="${b.id}">Editar</button><button class="btn mini perigo" data-excluir-bol="${b.id}">Excluir</button>`}</td>
        </tr>`).join('')}
      </tbody><tfoot><tr class="jor-total">
        <td colspan="4">Total da competência</td>
        <td class="ce">${horas(soma('min_extra_50'))}</td>
        <td class="ce">${horas(soma('min_extra_100'))}</td>
        <td class="ce">${horas(soma('min_deficit'))}</td>
        <td class="ce">${soma('min_intervalo_suprimido')}</td><td></td><td></td>
      </tr></tfoot></table>` : '<div class="vazio">Nenhum boletim nesta competência com esse filtro.</div>'}
      <p class="dc-sem jor-nota"><b>Fechado</b>: a competência em que o boletim é pago já foi enviada ao DP — para corrigir, reabra no Fechamento.
      <b>Em aberto</b>: ainda vai ser pago; dá para editar ou excluir (com motivo, fica registrado).</p>
    </div>
    <dialog id="dlgJorExcluir"><form method="dialog" id="formJorExcluir">
      <h3>Excluir lançamento</h3>
      <p class="dc-sem" id="jorExcluirQual"></p>
      <label class="campo plena">Motivo (obrigatório)<textarea id="jorExcluirMotivo" rows="3" maxlength="300"></textarea></label>
      <p class="jor-pend" id="jorExcluirErro"></p>
      <div class="barra entre"><button class="btn" type="button" data-fechar-exc>Cancelar</button>
        <button class="btn perigo" type="submit">Excluir</button></div>
    </form></dialog>` + assinatura();

  $('jorFiltroSit').addEventListener('change', ev => { estadoTela.filtroSit = ev.target.value; desenharBoletins(); });
  document.querySelectorAll('#telaJorBoletins [data-editar-bol]').forEach(btn => btn.addEventListener('click', () => {
    estadoTela.editando = btn.dataset.editarBol;
    irPara('jorLancar');
  }));
  let excluindo = null;
  document.querySelectorAll('#telaJorBoletins [data-excluir-bol]').forEach(btn => btn.addEventListener('click', () => {
    excluindo = jd.dados.boletins.find(x => x.id === btn.dataset.excluirBol);
    if (!excluindo) return;
    const f = estado.funcionarios.find(x => x.id === excluindo.funcionario_id);
    $('jorExcluirQual').textContent = `${f?.nome || '—'} · ${dataBR(excluindo.data_fato)}${excluindo.numero ? ` · boletim nº ${excluindo.numero}` : ''}. `
      + 'O lançamento sai das contas do mês; fica guardado no histórico com o motivo.';
    $('jorExcluirMotivo').value = ''; $('jorExcluirErro').textContent = '';
    $('dlgJorExcluir').showModal();
  }));
  $('dlgJorExcluir').querySelector('[data-fechar-exc]').addEventListener('click', () => $('dlgJorExcluir').close());
  $('formJorExcluir').addEventListener('submit', async ev => {
    ev.preventDefault();
    const motivo = $('jorExcluirMotivo').value.trim();
    if (motivo.length < 5) { $('jorExcluirErro').textContent = 'Escreva o motivo (pelo menos 5 letras).'; return; }
    const b = excluindo;
    if (!b || situacaoBoletim(b).fechado) { $('jorExcluirErro').textContent = 'Este lançamento já está fechado.'; return; }
    try {
      const depois = { ...b, situacao: 'cancelado', atualizado_em: new Date().toISOString() };
      await jd.salvar('boletins', depois);
      await jd.registrar({ tabela: 'jor_boletins', registro_id: b.id, acao: 'cancelar', antes: b, depois, justificativa: motivo });
      $('dlgJorExcluir').close();
      aviso(`Lançamento de ${dataBR(b.data_fato)} excluído.`, true);
      desenharBoletins();
    } catch (e) { $('jorExcluirErro').textContent = e.message; }
  });

  $('jorBuscaBol').addEventListener('input', ev => {
    estadoTela.busca = ev.target.value;
    desenharBoletins();
  });
  document.querySelectorAll('[data-memoria]').forEach(btn =>
    btn.addEventListener('click', () => {
      const a = jd.dados.apuracoes.find(x => x.boletim_id === btn.dataset.memoria);
      $('jorMemoriaTexto').textContent = a?.memoria || 'Sem memória de cálculo gravada.';
      $('dlgJorMemoria').showModal();
    }));
}

/* ===================================================================
   J.7 — CONFIGURAÇÕES DO MÓDULO
   =================================================================== */

function desenharConfigJornada() {
  // os quatro cadastros são desenhados depois, porque o innerHTML abaixo
  // recria a tela inteira e levaria os ouvintes junto

  const t = (titulo, linhas, colunas) => `
    <h3 class="jor-h3">${esc(titulo)}</h3>
    ${linhas.length ? `<table class="dc-planilha"><thead><tr>${colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.join('')}</tbody></table>` : '<div class="vazio">Nada cadastrado.</div>'}`;

  const par = jd.parametrosEm(hoje());

  $('telaJorConfig').innerHTML = cabecalho('Configurações do DP', 'Parâmetros e tabelas com vigência') + `
    <div class="jor-corpo">
      <p class="dc-sem jor-nota" style="margin:0 0 14px">Empregador, fazenda, unidade, destino,
      função e setor saíram daqui em 11/09/2026 — agora ficam no módulo <b>Cadastros</b>,
      porque o app inteiro usa essa informação, não só o DP.</p>

      <div id="jorCfgCad"></div>

      ${t('Parâmetros vigentes hoje',
        Object.entries(par).sort().map(([k, v]) => `<tr><td>${esc(k)}</td><td class="ce"><b>${esc(v)}</b></td></tr>`),
        ['Parâmetro', 'Valor'])}

      <p class="dc-sem jor-nota">Alterar um parâmetro encerra o período vigente e abre outro — competência
      fechada nunca recalcula. A tela de edição com o botão <b>História</b> entra na etapa J4.</p>

      ${t('Feriados do ano',
        [...jd.dados.feriados].sort((a, b) => a.data.localeCompare(b.data)).map(f => `<tr>
          <td>${dataBR(f.data)}</td><td>${esc(f.nome)}</td><td>${esc(f.abrangencia)}</td></tr>`),
        ['Data', 'Feriado', 'Abrangência'])}
    </div>` + assinatura();

  // Jornadas, tipos do dia e tipos de hora extra especial: cadastráveis aqui
  // (25/09/2026). O que mudar vale para os próximos lançamentos.
  desenharCadastros('jorCfgCad', ['jornadas', 'tipos', 'tiposHe'], () => {});
}

function resumoJornada(j) {
  const nomes = ['dom','seg','ter','qua','qui','sex','sáb'];
  return Object.entries(j.dias || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${nomes[k]} ${v.ini}–${v.fim}${v.int ? ` (${v.int}min)` : ''}`)
    .join(' · ');
}

/* ===================================================================
   ABATIMENTO DE HORAS (28/09/2026) — decisão falta a falta
   A regra automática (RN-23.1, Leitura A) vem marcada; o analista troca
   para "compensar com horas extras", "compensar com horas guardadas" ou
   "descontar no salário". Grava em jor_boletins.compensacao (null =
   automático). Competência enviada trava.

   HORAS GUARDADAS (01/10/2026) — antes de fechar, o analista guarda parte
   das extras que sobraram no mês (50% e 100% separadas) para abater falta
   ou pagar depois. Sem vencimento: ele decide quando pagar ou abater.
   Movimentos em jor_banco_horas (guardar / pagar / usar).
   =================================================================== */

/* Aceita 10, 10:30, 10,5 ou 10.5 (horas). Vazio = 0. null = inválido. */
function lerHoras(txt) {
  const t = String(txt || '').trim();
  if (!t) return 0;
  if (t.includes(':')) {
    const [h, m] = t.split(':');
    const hh = Number(h || 0), mm = Number(m || 0);
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 60);
}
const hm = min => min ? minParaHHMM(min) : '';

/* Uso de horas guardadas sem falta por trás (lançamento excluído ou decisão
   trocada fora desta tela) devolve as horas ao saldo. Só olha o mês aberto,
   que é o que está carregado. */
function limparUsosOrfaos(comp) {
  if (!jd.dados.carregado) return;
  const ativos = new Set(jd.dados.boletins
    .filter(b => b.situacao !== 'cancelado' && b.compensacao === 'compensar').map(b => b.id));
  (jd.dados.banco || [])
    .filter(m => m.tipo === 'usar' && m.competencia === comp && !ativos.has(m.boletim_id))
    .forEach(m => { jd.apagar('banco', m.chave).catch(() => {}); });
}

function desenharAbatimento() {
  const comp = estadoTela.competencia;
  limparUsosOrfaos(comp);
  const destinos = jd.dados.destinos.filter(d => d.ativo !== false);
  let nFaltas = 0, nComp = 0, nDP = 0, minAbatido = 0, minGuardadoMes = 0, minSaldo = 0;

  const blocos = destinos.map(d => {
    const c = fech.consolidar(comp, d.id);
    const sit = jd.competenciaDoDestino(comp, d.id)?.situacao || 'aberta';
    const pode = sit === 'aberta' || sit === 'reaberta';
    const h = m => fech.formatarHoras(m, d.formato_horas);
    const pessoas = c.linhas.filter(l => (l.faltasTodas || []).length);
    const noBanco = c.linhas.filter(l => (l.minExtraMes50 + l.minExtraMes100) > 0
      || l.minGuardado || l.minBancoPago || fech.saldoInicio(l.vinculo.funcionario_id, comp).total > 0);
    if (!pessoas.length && !noBanco.length) return '';
    noBanco.forEach(l => { minGuardadoMes += l.minGuardado || 0; minSaldo += Math.max(0, l.saldoBanco.total); });

    const faltasHtml = pessoas.map(l => {
      const fid = l.vinculo.funcionario_id;
      const fs = l.faltasTodas;
      const abatido = fs.filter(f => f.absorvida && !f.banco).reduce((s, f) => s + (f.minDeficit || 0), 0);
      const doBanco = fs.filter(f => f.banco).reduce((s, f) => s + (f.minDeficit || 0), 0);
      const sobrou = l.minExtraMes50 + l.minExtraMes100;
      const antes = sobrou + abatido;
      nFaltas += fs.length; nComp += fs.filter(f => f.absorvida).length; minAbatido += abatido + doBanco;
      nDP += fs.filter(f => f.justificada ? f.desconta : !f.absorvida).length;
      return `<div class="jor-abat">
        <div class="jor-abat__topo"><b>${esc(l.nome)}</b>
          <span class="dc-sem">horas extras do mês <b>${h(antes)}</b> → abatido <b>${h(abatido)}</b>${l.minGuardado ? ` → guardado <b>${h(l.minGuardado)}</b>` : ''}${l.minBancoPago ? ` → pago do saldo <b>+${h(l.minBancoPago)}</b>` : ''} → vão para a folha <b>${h(l.minExtraTotal)}</b>${l.minExtraAnterior ? ` + ${h(l.minExtraAnterior)} de comp. anterior` : ''}</span></div>
        <div class="jor-rolar"><table class="dc-planilha"><thead><tr><th>Data</th><th>Falta</th><th>Motivo</th><th class="ce">Horas</th><th>Decisão</th><th>Resultado</th></tr></thead><tbody>
        ${fs.slice().sort((x, y) => x.data.localeCompare(y.data)).map(f => {
          const b = jd.dados.boletins.find(x => x.id === f.boletimId);
          const res = f.atrasada ? '<span class="jor-pend">mês anterior — vai ao DP</span>'
            : f.banco ? `compensada — sai ${h(f.minDeficit)} das horas guardadas`
            : f.absorvida ? `compensada — sai ${h(f.minDeficit)} das extras`
            : f.semBanco ? `<span class="jor-pend">horas guardadas insuficientes — ${f.justificada ? 'fica sem desconto' : 'vai ao DP'}</span>`
            : f.justificada ? (f.desconta ? '<span class="jor-pend">vai ao DP — desconto em folha</span>'
              : f.semSaldo ? `<span class="jor-pend">extras insuficientes — fica sem desconto</span>`
              : 'sem desconto (justificada)')
            : f.semSaldo ? `<span class="jor-pend">extras insuficientes (${h(antes - abatido)}) — vai ao DP</span>`
            : '<span class="jor-pend">vai ao DP — desconto em folha</span>';
          const disp = b ? fech.disponivel(fid, comp, fech.chaveUsar(b.id)).total : 0;
          const sel = f.atrasada || !b ? '<span class="dc-sem">—</span>'
            : `<select data-abat="${b.id}" data-min="${f.minDeficit || 0}" ${pode ? '' : 'disabled'}>
                <option value="" ${!f.decisao ? 'selected' : ''}>${f.justificada ? 'Não descontar'
                  : `Automático${!f.decisao ? ` (${f.sugerida === 'compensar' ? 'compensar' : 'descontar'})` : ''}`}</option>
                <option value="compensar" ${f.decisao === 'compensar' ? 'selected' : ''}>Compensar com horas extras</option>
                <option value="banco" ${f.decisao === 'banco' ? 'selected' : ''}>Compensar com horas guardadas (saldo ${h(disp)})</option>
                <option value="descontar" ${f.decisao === 'descontar' ? 'selected' : ''}>Descontar no salário</option>
              </select>`;
          return `<tr><td>${dataBR(f.data)}</td><td>${f.justificada ? 'Justificada' : '<b>Não justificada</b>'}</td><td>${esc(b?.motivo || '—')}</td>
            <td class="ce">${f.minDeficit ? h(f.minDeficit) : '—'}</td><td>${sel}</td><td>${res}</td></tr>`;
        }).join('')}</tbody></table></div></div>`;
    }).join('');

    const bancoHtml = noBanco.length ? `<div class="jor-abat">
      <div class="jor-abat__topo"><b>Horas guardadas</b>
        <span class="dc-sem">guarde parte do que sobrou no mês ou pague do saldo — horas em h:mm (ex.: 10:00)</span></div>
      <div class="jor-rolar"><table class="dc-planilha jor-banco"><thead><tr>
        <th>Funcionário</th><th class="ce">Sobrou no mês<br>50% · 100%</th><th class="ce">Guardar<br>50%</th><th class="ce">Guardar<br>100%</th>
        <th class="ce">Saldo do mês anterior<br>50% · 100%</th><th class="ce">Pagar do saldo<br>50%</th><th class="ce">Pagar do saldo<br>100%</th>
        <th class="ce">Saldo ao fim<br>50% · 100%</th><th class="ce">Folha</th><th></th></tr></thead><tbody>
      ${noBanco.map(l => {
        const fid = l.vinculo.funcionario_id;
        const g = fech.guardadoEm(fid, comp), p = fech.pagoEm(fid, comp);
        const ini = fech.saldoInicio(fid, comp), fim = l.saldoBanco;
        const par = (a, b) => `${h(a)} · ${h(b)}`;
        const dis = pode ? '' : 'disabled';
        const inp = (campo, val) => `<input class="jor-banco__h" data-campo="${campo}" value="${hm(val)}" placeholder="0:00" inputmode="decimal" ${dis}>`;
        return `<tr data-banco="${fid}">
          <td>${esc(l.nome)}${l.guardadoAcima ? '<br><span class="jor-pend">guardado acima do que sobrou — vale só o que sobrou</span>' : ''}</td>
          <td class="ce">${par(l.minExtraMes50, l.minExtraMes100)}</td>
          <td class="ce">${inp('g50', g.min_50)}</td><td class="ce">${inp('g100', g.min_100)}</td>
          <td class="ce">${par(ini.min_50, ini.min_100)}</td>
          <td class="ce">${inp('p50', p.min_50)}</td><td class="ce">${inp('p100', p.min_100)}</td>
          <td class="ce"><b>${par(fim.min_50, fim.min_100)}</b></td>
          <td class="ce">${h(l.minExtraTotal)}</td>
          <td>${pode ? `<button class="btn mini" data-banco-gravar="${fid}" data-destino="${d.id}">Gravar</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="dc-sem" style="margin:6px 0 0">O que é guardado neste mês sai das extras da folha e entra no saldo a partir do mês seguinte.
      Pagar do saldo soma às extras deste mês, no mesmo percentual. As horas guardadas não vencem sozinhas — você decide quando pagar ou abater.</p>
    </div>` : '';

    return `<section class="jor-destino">
      <div class="jor-destino__topo"><div><h3>${esc(d.nome)}</h3>
        <span class="dc-sem">${pessoas.length} pessoa(s) com falta · ${noBanco.length} com horas extras ou saldo guardado</span></div>
        <span class="tag ${pode ? 'ativo' : ''}">${esc(sit)}</span></div>
      ${pode ? '' : `<div class="jor-caixa">Competência ${esc(sit)} — as decisões estão travadas. Para mudar, reabra com motivo no Fechamento.</div>`}
      ${faltasHtml}${bancoHtml}
    </section>`;
  }).join('');

  $('telaJorAbatimento').innerHTML = cabecalho('Abatimento de horas', 'Faltas e horas guardadas: compensar com horas extras, com horas guardadas ou descontar no salário') + `
    <div class="jor-corpo">
      <div class="jor-cartoes seis">
        ${cartao(nFaltas, 'FALTAS NO MÊS')}
        ${cartao(nComp, 'COMPENSADAS')}
        ${cartao(nDP, 'VÃO AO DP', nDP ? 'alerta' : '')}
        ${cartao(horas(minAbatido), 'HORAS ABATIDAS')}
        ${cartao(horas(minGuardadoMes), 'GUARDADAS NO MÊS')}
        ${cartao(horas(minSaldo), 'SALDO GUARDADO')}
      </div>
      <p class="dc-sem jor-nota" style="margin:0 0 12px"><b>Não justificada:</b> a sugestão automática compensa quando as horas extras do mês
      cobrem a falta inteira, da mais antiga para a mais recente. <b>Justificada:</b> por padrão não desconta; escolha compensar ou descontar
      só quando quiser. A falta vale 8h no Campo e a jornada do dia no Administrativo. <b>Descontar no salário</b> preserva as horas extras
      para a folha. <b>Compensar com horas guardadas</b> usa o saldo de meses anteriores e não mexe nas extras deste mês. Atestado nunca desconta e não aparece aqui.</p>
      ${blocos || '<div class="vazio">Nenhuma falta, hora extra ou saldo guardado nesta competência.</div>'}
    </div>` + assinatura();

  document.querySelectorAll('#telaJorAbatimento [data-abat]').forEach(s => s.addEventListener('change', async () => {
    const b = jd.dados.boletins.find(x => x.id === s.dataset.abat);
    if (!b) return;
    const antes = fech.decisaoDe(b);
    const depois = s.value || null;
    const chaveU = fech.chaveUsar(b.id);
    try {
      if (depois === 'banco') {
        const min = Number(s.dataset.min) || 0;
        const disp = fech.disponivel(b.funcionario_id, comp, chaveU);
        if (disp.total < min) {
          aviso(`Horas guardadas insuficientes: o saldo disponível é ${minParaHHMM(disp.total)} e a falta pede ${minParaHHMM(min)}.`);
          desenharAbatimento();
          return;
        }
        const uso = { chave: chaveU, funcionario_id: b.funcionario_id, competencia: comp, tipo: 'usar',
          boletim_id: b.id, data_falta: b.data_fato, ...fech.partir(min, disp),
          usuario: estado.sessao?.user?.email || null, atualizado_em: new Date().toISOString() };
        const furo = fech.saldoFicaNegativo(b.funcionario_id, uso);
        if (furo) {
          aviso(`Assim o saldo guardado fica negativo em ${fech.mesCurto(furo)}: essas horas já foram pagas ou usadas depois.`);
          desenharAbatimento();
          return;
        }
        await jd.salvar('banco', uso);
      } else if (fech.usoDe(b.id)) {
        await jd.apagar('banco', chaveU);
      }
      await jd.salvar('boletins', { ...b, compensacao: depois === 'banco' ? 'compensar' : depois, atualizado_em: new Date().toISOString() });
      await jd.registrar({ tabela: 'jor_boletins', registro_id: b.id, acao: 'update',
        antes: { compensacao: antes }, depois: { compensacao: depois },
        justificativa: 'Abatimento de horas: ' + (depois || 'automático') });
    } catch (e) { aviso(e.message); }
    desenharAbatimento();
  }));

  document.querySelectorAll('#telaJorAbatimento [data-banco-gravar]').forEach(bt => bt.addEventListener('click', async () => {
    const fid = bt.dataset.bancoGravar;
    const tr = bt.closest('tr');
    const v = {};
    for (const i of tr.querySelectorAll('[data-campo]')) {
      const m = lerHoras(i.value);
      if (m === null) { aviso(`Valor inválido: "${i.value}". Use h:mm (10:30) ou horas (10,5).`); i.focus(); return; }
      v[i.dataset.campo] = m;
    }
    const linha = fech.consolidar(comp, bt.dataset.destino).linhas.find(l => l.vinculo.funcionario_id === fid);
    if (!linha) return;
    if (v.g50 > linha.minExtraMes50 || v.g100 > linha.minExtraMes100) {
      aviso(`Só dá para guardar o que sobrou no mês: ${minParaHHMM(linha.minExtraMes50)} de 50% e ${minParaHHMM(linha.minExtraMes100)} de 100%.`);
      return;
    }
    const chP = fech.chavePagar(fid, comp), chG = fech.chaveGuardar(fid, comp);
    const disp = fech.disponivel(fid, comp, chP);
    if (v.p50 > disp.min_50 || v.p100 > disp.min_100) {
      aviso(`O saldo guardado disponível é ${minParaHHMM(disp.min_50)} de 50% e ${minParaHHMM(disp.min_100)} de 100%.`);
      return;
    }
    const agoraISO = new Date().toISOString(), quem = estado.sessao?.user?.email || null;
    const novoG = { chave: chG, funcionario_id: fid, competencia: comp, tipo: 'guardar', min_50: v.g50, min_100: v.g100, usuario: quem, atualizado_em: agoraISO };
    const novoP = { chave: chP, funcionario_id: fid, competencia: comp, tipo: 'pagar', min_50: v.p50, min_100: v.p100, usuario: quem, atualizado_em: agoraISO };
    const furo = fech.saldoFicaNegativo(fid, novoG) || fech.saldoFicaNegativo(fid, novoP);
    if (furo) {
      aviso(`Assim o saldo fica negativo em ${fech.mesCurto(furo)}: as horas guardadas aqui já foram usadas ou pagas depois. Desfaça aquele movimento antes.`);
      return;
    }
    const antes = { guardar: fech.guardadoEm(fid, comp), pagar: fech.pagoEm(fid, comp) };
    try {
      for (const n of [novoG, novoP]) {
        if (n.min_50 || n.min_100) await jd.salvar('banco', n);
        else if ((jd.dados.banco || []).some(m => m.chave === n.chave)) await jd.apagar('banco', n.chave);
      }
      await jd.registrar({ tabela: 'jor_banco_horas', registro_id: fid, acao: 'update',
        antes: { guardar: [antes.guardar.min_50, antes.guardar.min_100], pagar: [antes.pagar.min_50, antes.pagar.min_100] },
        depois: { guardar: [v.g50, v.g100], pagar: [v.p50, v.p100] },
        justificativa: `Horas guardadas ${fech.mesCurto(comp)}: guardar ${minParaHHMM(v.g50 + v.g100)}, pagar do saldo ${minParaHHMM(v.p50 + v.p100)}` });
      aviso(`${linha.nome}: horas guardadas gravadas.`, true);
    } catch (e) { aviso(e.message); }
    desenharAbatimento();
  }));
}

/* ===================================================================
   J.5 — FECHAMENTO DA COMPETÊNCIA, por destino de DP
   =================================================================== */

async function desenharFechamento() {
  limparUsosOrfaos(estadoTela.competencia);
  const destinos = jd.dados.destinos.filter(d => d.ativo !== false);

  const blocos = await Promise.all(destinos.map(async d => {
    const c = fech.consolidar(estadoTela.competencia, d.id);
    const check = fech.podeEnviar(c);
    const comp = jd.competenciaDoDestino(estadoTela.competencia, d.id);
    const sit = comp?.situacao || 'aberta';
    const ant = await fech.comparativo(estadoTela.competencia, d.id);
    const h = m => fech.formatarHoras(m, d.formato_horas);

    const variacao = ant
      ? (() => {
          const antes = ant.totais.extraTotal || 0;
          const agora = c.totais.extraTotal || 0;   // só o mês — o atrasado distorceria a comparação
          if (!antes) return '';
          const p = Math.round(((agora - antes) / antes) * 100);
          return `<span class="dc-sem">mês anterior ${h(antes)} · ${p >= 0 ? '+' : ''}${p}%</span>`;
        })()
      : '';

    return `
      <section class="jor-destino" data-destino="${d.id}">
        <div class="jor-destino__topo">
          <div>
            <h3>${esc(d.nome)}</h3>
            <span class="dc-sem">${c.unidades.length} unidade(s) · ${c.totais.pessoas} pessoa(s) · ${c.totais.boletins} boletim(ns)</span>
          </div>
          <div class="jor-destino__num">
            <b>${h(c.totais.extraPagar)}</b>
            <span>horas extras</span>
            ${variacao}
          </div>
          <span class="tag ${sit === 'aberta' ? 'ativo' : ''}">${esc(sit)}${comp?.versao > 1 ? ` · v${comp.versao}` : ''}</span>
        </div>

        ${check.bloqueios.length ? `<div class="jor-caixa alerta">
          <b>Não dá para enviar ainda:</b>
          <ul class="jor-lista">${check.bloqueios.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>` : ''}

        ${check.informativos.length ? `<div class="jor-caixa">
          <b>Para você saber antes de enviar:</b>
          <ul class="jor-lista">${check.informativos.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>` : ''}

        ${fer.avisosFechamento(estadoTela.competencia, c.linhas)}

        <table class="dc-planilha"><thead><tr>
          <th>Funcionário</th><th>Unidade</th>
          <th class="ce">Extras</th>${c.totais.atrasados ? '<th class="ce">Comp. anterior</th>' : ''}<th class="ce">Déficit</th>
          <th class="ce">Faltas</th><th class="ce">Atestado</th>
        </tr></thead><tbody>
          ${c.linhas.map(l => `<tr>
            <td>${esc(l.nome)}${fer.afastadoNaComp(l.vinculo.funcionario_id, estadoTela.competencia)
              ? ' <span class="tag neutra">afastado</span>'
              : l.boletins === 0 ? ' <span class="jor-pend">sem lançamento</span>' : ''}</td>
            <td class="dc-sem">${esc(l.unidadeNome)}</td>
            <td class="ce">${h(l.minExtraTotal)}</td>
            ${c.totais.atrasados ? `<td class="ce">${l.atrasados.length
              ? `${l.minExtraAnterior ? `<b class="jor-pend">${h(l.minExtraAnterior)}</b><br>` : ''}<span class="dc-sem">${l.atrasados.map(x => (x.falta ? 'falta ' : '') + dataBR(x.data).slice(0, 5)).join(', ')}</span>`
              : '—'}</td>` : ''}
            <td class="ce">${l.minDeficitAvulso ? h(l.minDeficitAvulso) : '—'}</td>
            <td class="ce">${l.faltasInformadas || '—'}</td>
            <td class="ce">${l.diasAtestado || '—'}</td>
          </tr>`).join('') || `<tr><td colspan="${c.totais.atrasados ? 7 : 6}" class="vazio">Nenhum vínculo neste destino.</td></tr>`}
        </tbody><tfoot><tr class="jor-total">
          <td colspan="2">Total</td>
          <td class="ce">${h(c.totais.extraTotal)}</td>
          ${c.totais.atrasados ? `<td class="ce">${h(c.totais.extraAnterior)}</td>` : ''}
          <td class="ce">${h(c.totais.deficit)}</td>
          <td class="ce">${c.totais.faltasInformadas}</td>
          <td class="ce">${c.totais.atestados}</td>
        </tr></tfoot></table>

        ${emp.blocoFechamento(estadoTela.competencia, d, sit)}

        <div class="jor-acoes">
          ${sit === 'aberta' || sit === 'reaberta'
            ? `<button class="btn principal" data-enviar="${d.id}" ${check.pode ? '' : 'disabled'}>Enviar ao ${esc(d.nome)}</button>`
            : ''}
          ${sit === 'enviada' ? `<button class="btn principal" data-aprovar="${d.id}">Aprovar e travar</button>` : ''}
          ${['enviada','aprovada','travada'].includes(sit)
            ? `<button class="btn mini" data-reabrir="${d.id}">Reabrir com motivo</button>` : ''}
          <button class="btn" data-verdp="${d.id}">Visualizar Relatório Horas Extras</button>
          <button class="btn mini" data-imprimirdp="${d.id}">Imprimir</button>
        </div>
      </section>`;
  }));

  $('telaJorFechamento').innerHTML = cabecalho('Fechamento da competência', 'Um envio por destino de DP — nunca misturados') + `
    <div class="jor-corpo">${blocos.join('')}</div>` + assinatura();

  emp.ligarBlocoFechamento(() => desenharFechamento());

  document.querySelectorAll('[data-enviar]').forEach(b => b.addEventListener('click', async () => {
    const c = fech.consolidar(estadoTela.competencia, b.dataset.enviar);
    if (!confirm(`Enviar a competência de ${rotuloCompetencia(estadoTela.competencia)} ao ${c.destino.nome}?\n\n` +
                 `${c.totais.pessoas} pessoa(s) · ${fech.formatarHoras(c.totais.extraPagar, c.destino.formato_horas)} de horas extras`
                 + (c.totais.atrasados ? ` (${fech.formatarHoras(c.totais.extraAnterior, c.destino.formato_horas)} de competência anterior).` : '.'))) return;
    // Empréstimo: confere antes, grava a baixa só depois que o envio deu certo.
    const prep = emp.prepararAbatimentos(estadoTela.competencia, b.dataset.enviar);
    if (prep.erro) { aviso(prep.erro); return; }
    try {
      const gravada = await fech.enviar(c);
      await emp.lancarAbatimentos(estadoTela.competencia, b.dataset.enviar, prep);
      // Congela os relatórios como foram enviados — Histórico de fechamentos.
      try {
        const pacote = await rel.pacoteEnvio(estadoTela.competencia, b.dataset.enviar);
        await fech.arquivar(gravada, fech.consolidar(estadoTela.competencia, b.dataset.enviar).totais, pacote);
        aviso('Competência enviada e arquivada no Histórico de fechamentos. Falta aprovar para travar.', true);
      } catch (e) {
        aviso('Competência enviada, mas não consegui arquivar os relatórios: ' + e.message + '. Avise para arquivar de novo.');
      }
      desenharFechamento();
    }
    catch (e) { aviso(e.message); }
  }));

  document.querySelectorAll('[data-aprovar]').forEach(b => b.addEventListener('click', async () => {
    try {
      await fech.aprovar(estadoTela.competencia, b.dataset.aprovar);
      aviso('Competência aprovada e travada. Correção agora exige reabertura com motivo.', true);
      desenharFechamento();
    } catch (e) { aviso(e.message); }
  }));

  document.querySelectorAll('[data-reabrir]').forEach(b => b.addEventListener('click', () => {
    estadoTela.reabrindo = b.dataset.reabrir;
    $('jorMotivoTexto').value = '';
    $('dlgJorReabrir').showModal();
  }));

  document.querySelectorAll('[data-verdp]').forEach(b => b.addEventListener('click', () => {
    rel.mostrar(rel.relatorioDP(estadoTela.competencia, b.dataset.verdp), { barra: true });
  }));
  document.querySelectorAll('[data-imprimirdp]').forEach(b => b.addEventListener('click', () => {
    rel.mostrar(rel.relatorioDP(estadoTela.competencia, b.dataset.imprimirdp), { barra: true });
    setTimeout(() => rel.imprimir(), 300);   // deixa a marca carregar antes do papel
  }));
}

/* ===================================================================
   J.6 — RELATÓRIOS
   =================================================================== */

/* Relatórios em abas por assunto (28/09/2026, opção C escolhida por ele):
   Escritório (DP) · Conferência interna · Por funcionário · Empréstimo · Férias.
   Cada aba mostra só os filtros que usa; cada relatório tem Visualizar e
   Imprimir. A prévia abre com Imprimir/Fechar no alto (rel.mostrar barra). */
const relTela = { aba: 'esc', destino: '', pessoa: '', de: '', ate: '', ferDest: '', ferMes: '', ferSel: null, ferPlano: null };

function desenharRelatorios() {
  const destinos = jd.dados.destinos.filter(d => d.ativo !== false);
  const pessoas = estado.funcionarios.filter(f => jd.vinculoDe(f.id));
  if (!destinos.some(d => d.id === relTela.destino)) relTela.destino = destinos[0]?.id || '';
  if (!relTela.de) relTela.de = mesesAntes(estadoTela.competencia, 5);
  if (!relTela.ate) relTela.ate = estadoTela.competencia.slice(0, 7);
  if (!relTela.ferMes) relTela.ferMes = mesAnterior();

  // Atalho do Painel de Férias: abre direto a aba Férias com o relatório pedido.
  const pedido = fer.podeVerFerias() ? fer.tomarPedidoRelatorio() : null;
  if (pedido) { relTela.aba = 'fer'; relTela.ferDest = pedido.destino || ''; if (pedido.mes) relTela.ferMes = pedido.mes; }
  // A seleção da tela "Liberados em aberto" só vale para o relatório pedido por ela.
  relTela.ferSel = pedido?.sel || null;
  relTela.ferPlano = pedido?.plano || null;

  const abas = [
    ['esc', 'Escritório (DP)'], ['conf', 'Conferência interna'], ['pessoa', 'Por funcionário'],
    ...(emp.podeVerEmprestimo() ? [['emp', 'Empréstimo']] : []),
    ...(fer.podeVerFerias() ? [['fer', 'Férias']] : []),
  ];
  if (!abas.some(a => a[0] === relTela.aba)) relTela.aba = 'esc';

  const comp = () => estadoTela.competencia;
  const dest = () => relTela.destino;
  const semPessoa = () => { aviso('Escolha um funcionário para o extrato.'); return null; };
  const doPeriodo = async () => {
    const { de, ate } = relTela;
    if (!de || !ate || de > ate) { aviso('Escolha o período: "De" antes de "Até".'); return null; }
    const [a, m] = ate.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return { de, ate, boletins: await jd.boletinsDoPeriodo(de + '-01', fim),
             funcionarioId: relTela.pessoa || null, destinoId: dest() };
  };
  const qualidade = async () => { const p = await doPeriodo(); return p && rel.relatorioQualidade(p); };
  const marcadoConf = async () => {
    const p = await doPeriodo(); if (!p) return null;
    const ids = p.boletins.filter(b => b.marcado).map(b => b.id);
    return rel.relatorioConferencia({ ...p, apuracoes: await jd.apuracoesDe(ids) });
  };
  const ferRel = t => t === 'venc' ? fer.relVencidos(relTela.ferMes || mesAnterior(), relTela.ferDest)
    : t === 'conc' ? fer.relConcessao(relTela.ferDest, relTela.ferSel, relTela.ferPlano)
    : t === 'prev' ? fer.relPrevisao(relTela.ferDest) : fer.relSituacao(relTela.ferDest);
  const ferCsv = t => rel.baixar(fer.csvFerias(t, relTela.ferMes || mesAnterior(), relTela.ferDest));

  // Cada relatório: nome, o que é, como gerar (html) e, se tiver, o Excel.
  const RELS = {
    esc: [
      { k: 'dp', nome: 'Relatório Horas Extras', desc: 'Horas extras, insalubridade, periculosidade, faltas e saldo devedor — uma folha por CAEPF', principal: true,
        html: () => rel.relatorioDP(comp(), dest()) },
      { k: 'fal', nome: 'Faltas', desc: 'Só as informadas ao DP, com as datas', html: () => rel.relatorioFaltas(comp(), dest()) },
      { k: 'ate', nome: 'Atestados', desc: 'Períodos e dias, sem motivo', html: () => rel.relatorioAtestados(comp(), dest()) },
      { k: 'csv', nome: 'Baixar dados', desc: 'Planilha do mês para o escritório', csv: () => rel.baixar(rel.planilhaDP(comp(), dest())) },
    ],
    conf: [
      { k: 'mes', nome: 'Horas extras por mês', desc: 'Uma coluna por mês do fato — mostra o boletim atrasado no mês em que aconteceu', html: () => rel.relatorioPorMes(comp(), dest()) },
      { k: 'ftot', nome: 'Faltas totais', desc: 'Todas as faltas do mês, inclusive as compensadas por horas extras', html: () => rel.relatorioFaltas(comp(), dest(), { totais: true }) },
      { k: 'det', nome: 'Detalhado DP', desc: 'Abertura por percentual, intervalo e déficit', html: () => rel.relatorioDetalhado(comp(), dest()) },
    ],
    pessoa: [
      { k: 'ext', nome: 'Extrato individual', desc: 'Dia a dia da competência, com a memória de cálculo — precisa de um funcionário',
        html: () => relTela.pessoa ? rel.extratoIndividual(comp(), relTela.pessoa) : semPessoa() },
      { k: 'mxc', nome: 'Marcado × Conferido', desc: 'O que o funcionário marcou × o que ficou valendo, no período — de um funcionário ou de todos do destino', html: marcadoConf },
      { k: 'qual', nome: 'Qualidade dos boletins', desc: 'Nível do boletim (Ruim, Bom, Ótimo) no período — de um funcionário ou de todos do destino', html: qualidade },
    ],
    emp: [
      { k: 'empdev', nome: 'Extrato geral', desc: 'Todos que devem, com saldo e parcelas', html: () => emp.devedoresHTML(), csv: () => emp.baixarCSV(emp.devedoresCSV()) },
    ],
    fer: [
      { k: 'conc', nome: 'Período de concessão', desc: 'Em aberto e concedidas', html: () => ferRel('conc'), csv: () => ferCsv('conc') },
      { k: 'venc', nome: 'Venceram no mês', desc: 'Emita no início de cada mês, do mês anterior (usa o Mês acima)', html: () => ferRel('venc'), csv: () => ferCsv('venc') },
      { k: 'prev', nome: 'Previsão dos próximos 12 meses', desc: 'Quem vence e quando', html: () => ferRel('prev'), csv: () => ferCsv('prev') },
      { k: 'sit', nome: 'Situação da equipe', desc: 'Saldo e período de cada um', html: () => ferRel('sit'), csv: () => ferCsv('sit') },
    ],
  };

  const optDest = (sel, extra = '') => extra + destinos.map(d => `<option value="${d.id}"${d.id === sel ? ' selected' : ''}>${esc(d.nome)}</option>`).join('');
  const selDestino = `<label>Destino de DP <select data-rel-f="destino">${optDest(relTela.destino)}</select></label>`;
  const filtros = {
    esc: selDestino, conf: selDestino,
    pessoa: `<label>Funcionário <select data-rel-f="pessoa">
        <option value="">Todos do destino</option>
        ${pessoas.map(f => `<option value="${f.id}"${f.id === relTela.pessoa ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
      ${selDestino}
      <label>De <input type="month" data-rel-f="de" value="${relTela.de}"></label>
      <label>Até <input type="month" data-rel-f="ate" value="${relTela.ate}"></label>`,
    emp: '',
    fer: `<label>Mês <input type="month" data-rel-f="ferMes" value="${relTela.ferMes}"></label>
      <label>Destino <select data-rel-f="ferDest">${optDest(relTela.ferDest, `<option value="">Todos</option>`)}
        <option value="-"${relTela.ferDest === '-' ? ' selected' : ''}>Sem destino</option></select></label>`,
  };
  const dicas = {
    esc: 'O que vai ao escritório no fechamento. Competência: troque no alto, à direita. Todo relatório sai de <b>um destino de DP só</b>.',
    conf: 'Uso interno — para conferir antes de enviar. Não vai ao escritório.',
    pessoa: 'Uso interno. O Extrato usa a competência do alto e precisa de um funcionário; Marcado × Conferido e Qualidade usam De/Até.',
    emp: 'Não depende da competência.',
    fer: 'O Mês vale só para "Venceram no mês".',
  };

  const linha = r => `<div class="rel-linha">
      <b>${esc(r.nome)}</b><span class="dc-sem">${esc(r.desc)}</span>
      <span class="rel-linha__acoes">
        ${r.html ? `<button class="btn${r.principal ? ' principal' : ''}" data-rel-ver="${r.k}">Visualizar</button>
        <button class="btn" data-rel-imp="${r.k}">Imprimir</button>` : ''}
        ${r.csv ? `<button class="btn mini" data-rel-csv="${r.k}">Excel</button>` : ''}
      </span></div>`;

  $('telaJorRelatorios').innerHTML = cabecalho('Relatórios', 'Uma aba por assunto; prévia na tela primeiro') + `
    <div class="jor-corpo">
      <div class="rel-abas" role="tablist">
        ${abas.map(([k, t]) => `<button type="button" role="tab" class="rel-aba${k === relTela.aba ? ' ativa' : ''}" data-rel-aba="${k}">${t}</button>`).join('')}
      </div>
      <div class="rel-abacorpo">
        ${filtros[relTela.aba] ? `<div class="jor-barra rel-filtros">${filtros[relTela.aba]}</div>` : ''}
        <p class="dc-sem jor-nota rel-dica">${dicas[relTela.aba]}</p>
        ${RELS[relTela.aba].map(linha).join('')}
      </div>
    </div>` + assinatura();

  const achar = k => (RELS[relTela.aba] || []).find(r => r.k === k);
  const gerar = async (k, imprimir) => {
    const html = await achar(k)?.html();
    if (!html) return;
    rel.mostrar(html, { barra: true });
    if (imprimir) setTimeout(() => rel.imprimir(), 300);   // deixa a marca carregar antes do papel
  };
  const tela = $('telaJorRelatorios');
  tela.querySelectorAll('[data-rel-aba]').forEach(b => b.addEventListener('click', () => {
    relTela.aba = b.dataset.relAba;
    $('jorImpressao').hidden = true; $('jorImpressao').innerHTML = '';
    desenharRelatorios();
  }));
  tela.querySelectorAll('[data-rel-f]').forEach(el => el.addEventListener('change', () => { relTela[el.dataset.relF] = el.value; }));
  tela.querySelectorAll('[data-rel-ver]').forEach(b => b.addEventListener('click', () => gerar(b.dataset.relVer, false)));
  tela.querySelectorAll('[data-rel-imp]').forEach(b => b.addEventListener('click', () => gerar(b.dataset.relImp, true)));
  tela.querySelectorAll('[data-rel-csv]').forEach(b => b.addEventListener('click', () => achar(b.dataset.relCsv)?.csv()));

  if (pedido) gerar(pedido.tipo, false);
}

/* ===================================================================
   HISTÓRICO DE FECHAMENTOS (29/09/2026) — todo envio ao DP, versão a versão,
   com os relatórios exatamente como saíram. Não depende da competência do
   alto: mostra todos os meses. Nada aqui altera o que foi enviado.
   =================================================================== */

const histTela = { destino: '' };

async function desenharHistorico() {
  const alvo = $('telaJorHistorico');
  alvo.innerHTML = cabecalho('Histórico de fechamentos', 'O que foi enviado ao DP, como foi enviado — cada reenvio vira uma versão nova')
    + `<div class="jor-corpo"><p class="dc-sem">Carregando…</p></div>`;
  let lista = [];
  try { lista = await fech.listarArquivo(); }
  catch (e) { aviso('Não consegui ler o histórico: ' + e.message); }

  const destinos = jd.dados.destinos;
  const nomeDest = id => destinos.find(d => d.id === id)?.nome || '—';
  const filtrada = lista.filter(x => !histTela.destino || x.destino_id === histTela.destino);
  const porComp = new Map();
  filtrada.forEach(x => { if (!porComp.has(x.competencia)) porComp.set(x.competencia, []); porComp.get(x.competencia).push(x); });
  // A versão mais alta de cada destino no mês é a que vale; as outras ficam como substituídas.
  const vigente = new Set();
  lista.forEach(x => {
    const top = lista.filter(y => y.competencia === x.competencia && y.destino_id === x.destino_id)
      .reduce((a, y) => (y.versao > a.versao ? y : a), x);
    vigente.add(top.id);
  });
  const quando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const opcoes = rel.RELATORIOS_ARQUIVADOS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('');

  const linha = x => {
    const d = destinos.find(y => y.id === x.destino_id);
    const h = m => fech.formatarHoras(m || 0, d?.formato_horas);
    const t = x.totais || {};
    return `<tr>
      <td><b>${esc(nomeDest(x.destino_id))}</b></td>
      <td class="ce">v${x.versao}${vigente.has(x.id) ? ' <span class="tag ativo">vale</span>' : ' <span class="tag neutra">substituída</span>'}</td>
      <td>${esc(quando(x.enviada_em))}<br><span class="dc-sem">${esc(x.enviada_por || '')}</span></td>
      <td class="ce">${h(t.extraPagar ?? t.extraTotal)}</td>
      <td class="ce">${t.pessoas ?? '—'}</td>
      <td class="dc-sem">${x.motivo_reabertura ? 'Reaberta: ' + esc(x.motivo_reabertura) : '—'}</td>
      <td><span class="rel-linha__acoes">
        <select data-hist-rel="${x.id}">${opcoes}</select>
        <button class="btn principal" type="button" data-hist-ver="${x.id}">Visualizar</button>
        <button class="btn" type="button" data-hist-imp="${x.id}">Imprimir</button>
        ${x.csv_nome ? `<button class="btn mini" type="button" data-hist-csv="${x.id}">Excel</button>` : ''}
      </span></td></tr>`;
  };

  alvo.innerHTML = cabecalho('Histórico de fechamentos', 'O que foi enviado ao DP, como foi enviado — cada reenvio vira uma versão nova') + `
    <div class="jor-corpo">
      <div class="jor-barra">
        <label>Destino <select data-hist-dest><option value="">Todos</option>
          ${destinos.map(d => `<option value="${d.id}"${d.id === histTela.destino ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}
        </select></label>
      </div>
      <p class="dc-sem jor-nota">Cada envio fica guardado aqui do jeito que saiu — reabrir e reenviar cria uma versão nova e mantém a anterior para consulta.
        O arquivo começa nos envios feitos a partir de 29/09/2026.</p>
      ${porComp.size ? [...porComp.entries()].map(([comp, l]) => `
        <section class="jor-destino">
          <div class="jor-destino__topo"><h3>${esc(rotuloCompetencia(comp))}</h3></div>
          <table class="dc-planilha"><thead><tr>
            <th>Destino</th><th class="ce">Versão</th><th>Enviado em / por</th>
            <th class="ce">Horas extras</th><th class="ce">Pessoas</th><th>Motivo</th><th>Relatórios</th>
          </tr></thead><tbody>${l.map(linha).join('')}</tbody></table>
        </section>`).join('')
        : '<p class="vazio">Nenhum fechamento arquivado ainda. O primeiro aparece aqui quando você enviar uma competência ao DP.</p>'}
    </div>` + assinatura();

  alvo.querySelector('[data-hist-dest]')?.addEventListener('change', ev => { histTela.destino = ev.target.value; desenharHistorico(); });
  const abrir = async (id, imprimir) => {
    try {
      const reg = await fech.abrirArquivo(id);
      const k = alvo.querySelector(`[data-hist-rel="${id}"]`)?.value || 'dp';
      const r = reg?.relatorios?.[k];
      if (!r?.html) { aviso('Este relatório não foi arquivado neste envio.'); return; }
      rel.mostrar(r.html, { barra: true });
      if (imprimir) setTimeout(() => rel.imprimir(), 300);
    } catch (e) { aviso(e.message); }
  };
  alvo.querySelectorAll('[data-hist-ver]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.histVer, false)));
  alvo.querySelectorAll('[data-hist-imp]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.histImp, true)));
  alvo.querySelectorAll('[data-hist-csv]').forEach(b => b.addEventListener('click', async () => {
    try {
      const reg = await fech.abrirArquivo(b.dataset.histCsv);
      if (reg?.csv) rel.baixar({ nome: reg.csv_nome, conteudo: reg.csv });
    } catch (e) { aviso(e.message); }
  }));
}

const mesAnterior = () => {
  const d = new Date();
  d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ===================================================================
   LIGAÇÃO — chamada uma vez, na abertura do app
   =================================================================== */

let irPara = () => {};

export function ligarJornada(navegar) {
  if (navegar) irPara = navegar;
  ligarCadastros();
  emp.ligarEmprestimos(irPara, aviso);
  fer.ligarFerias(irPara, aviso);
  bol.ligarBoletins(irPara, aviso);
  docm.ligarDocumentos(irPara, aviso);

  /* Seletor de competência no cabeçalho de toda tela do DP (28/09/2026). O
     cabeçalho é redesenhado a cada tela, então o ouvinte fica no documento. */
  document.addEventListener('change', async ev => {
    if (!ev.target.matches?.('.jor-comp-sel') || !/^\d{4}-\d{2}$/.test(ev.target.value)) return;
    estadoTela.competencia = ev.target.value + '-01';
    try { await jd.carregar(estadoTela.competencia); } catch (e) { aviso(e.message); }
    abrirJornada(telaAtual());
  });

  $('formJorReabrir')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const motivo = $('jorMotivoTexto').value.trim();
    try {
      await fech.reabrir(estadoTela.competencia, estadoTela.reabrindo, motivo);
      await emp.estornarAbatimentos(estadoTela.competencia, estadoTela.reabrindo, 'Reabertura: ' + motivo);
      $('dlgJorReabrir').close();
      aviso('Competência reaberta. A próxima emissão sai como versão nova, marcada no cabeçalho.', true);
      desenharFechamento();
    } catch (e) { aviso(e.message); }
  });

  jd.aoMudarJornada(() => {
    const t = telaAtual();
    if (t === 'jorPainel') desenharPainel();
  });
}

const telaAtual = () =>
  ['jorPainel','jorLancar','jorBoletins','jorAbatimento','jorFechamento','jorHistorico','jorRelatorios','jorConfig']
    .find(t => !$('tela' + t.charAt(0).toUpperCase() + t.slice(1))?.hidden) || 'jorPainel';
