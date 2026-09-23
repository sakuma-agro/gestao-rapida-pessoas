// jornada.js — módulo Gestão de Jornada
//
// Segue o padrão do disc.js: expõe ligarJornada(), abrirJornada(tela) e
// limparJornada(). O cálculo não mora aqui — mora em jornada-motor.js,
// que é função pura e tem os 13 casos de aceite.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { ligarCadastros } from './jornada-cadastros.js';
import { apurarDia, minParaHHMM, minParaDecimal } from './jornada-motor.js';
import * as fech from './jornada-fechamento.js';
import * as rel from './jornada-relatorios.js';
import * as emp from './jornada-emprestimos.js';
import * as fer from './jornada-ferias.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

const estadoTela = {
  competencia: jd.competenciaAtual(),
  busca: '',
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

export async function abrirJornada(tela) {
  if (!jd.dados.carregado) {
    try { await jd.carregar(estadoTela.competencia); }
    catch (e) { aviso('Não consegui carregar os dados do módulo: ' + e.message); }
  }
  if (tela === 'jorPainel')       desenharPainel();
  if (tela === 'jorLancar')       desenharLancar();
  if (tela === 'jorBoletins')     desenharBoletins();
  if (tela === 'jorFechamento')   desenharFechamento();
  if (tela === 'jorRelatorios')   desenharRelatorios();
  if (tela === 'jorConfig')       desenharConfigJornada();
}

export function limparJornada() {
  jd.limparJornadaDados();
  emp.limparEmprestimos();
  fer.limparFerias();
  estadoTela.competencia = jd.competenciaAtual();

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
    <div class="jor-cabecalho__direita">competência
      <strong class="jor-cabecalho__competencia">${rotuloCompetencia(estadoTela.competencia)}</strong>
    </div>
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
        <label>Funcionário
          <select id="bFunc" required>
            <option value=""></option>
            ${ativos.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}
          </select>
          ${ativos.length ? '' : '<small class="jor-pend">Ninguém tem vínculo de jornada ainda.</small>'}
        </label>
        <div class="jor-linha">
          <label>Nº do boletim <input type="text" id="bNumero" inputmode="numeric"></label>
          <label>Data do fato <input type="date" id="bData" value="${hoje()}" required></label>
        </div>
        <label>Tipo do dia
          <select id="bTipo">
            ${jd.dados.tipos.filter(t => t.ativo !== false)
              .sort((a, b) => a.ordem - b.ordem)
              .map(t => `<option value="${t.id}" ${t.codigo === 'NORMAL' ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
          </select>
        </label>
        <div class="jor-linha">
          <label>Entrada <input type="time" id="bIni"></label>
          <label>Saída <input type="time" id="bFim"></label>
          <label>Intervalo (min) <input type="number" id="bInterv" min="0" step="5" value="60"></label>
        </div>
        <div class="jor-linha">
          <label>Hora extra especial (min) <input type="number" id="bEspecial" min="0" step="30" value="0"></label>
          <label class="jor-inline"><input type="checkbox" id="bInsal"> Insalubridade no dia</label>
        </div>
        <label>Observação <input type="text" id="bObs" maxlength="200"></label>
        <div class="jor-acoes">
          <button type="submit" class="btn principal">Lançar</button>
          <button type="button" class="btn mini" id="bLimpar">Limpar</button>
        </div>
      </form>

      <aside class="jor-apurado" id="jorApurado"></aside>
    </div>` + assinatura();

  ['bFunc','bData','bTipo','bIni','bFim','bInterv','bEspecial'].forEach(id =>
    $(id).addEventListener('input', mostrarApurado));
  $('bLimpar').addEventListener('click', () => { $('jorFormBoletim').reset(); mostrarApurado(); });
  $('jorFormBoletim').addEventListener('submit', gravarBoletim);
  mostrarApurado();
}

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

  return {
    data,
    boletins: ($('bIni').value && $('bFim').value) ? [{
      numero: $('bNumero').value,
      ini: $('bIni').value,
      fim: $('bFim').value,
      intervalo: Number($('bInterv').value || 0),
      heEspecial: Number($('bEspecial').value || 0),
    }] : [],
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

  const r = apurarDia(entrada);
  alvo.innerHTML = `
    <h4>Apurado</h4>
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
    <details><summary>Memória de cálculo</summary><pre>${esc(r.memoria)}</pre></details>`;
}

async function gravarBoletim(ev) {
  ev.preventDefault();
  const entrada = entradaDoFormulario();
  if (!entrada) return;

  const { v, unidade, funcionarioId } = entrada._contexto;
  const competencia = jd.competenciaDe(entrada.data);

  if (unidade && jd.travada(competencia, unidade.destino_id)) {
    aviso('Competência já enviada ao DP. Para corrigir, é preciso reabrir com motivo (RN-130).');
    return;
  }

  // O motor roda ANTES da gravação: boletim e apuração nascem juntos.
  const r = apurarDia(entrada);
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
    he_especial_min: Number($('bEspecial').value || 0),
    insalubridade_dia: $('bInsal').checked,
    observacao: $('bObs').value || null,
    situacao: 'lancado',
    criado_por: estado.sessao?.user?.email || null,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  // Nº repetido gera alerta, nunca bloqueio (RN-04).
  if (b.numero && jd.dados.boletins.some(x => x.numero === b.numero)) {
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
  await jd.registrar({ tabela: 'jor_boletins', registro_id: gravado.id, acao: 'insert', depois: b });

  $('bNumero').value = '';
  $('bIni').value = ''; $('bFim').value = ''; $('bObs').value = '';
  aviso(`Boletim de ${dataBR(entrada.data)} lançado.` + (estado.online ? '' : ' Sem rede — vai subir sozinho.'), true);
  mostrarApurado();
}

/* ===================================================================
   J.3 — BOLETINS DA COMPETÊNCIA
   =================================================================== */

function desenharBoletins() {
  const busca = estadoTela.busca.toLowerCase();
  const linhas = jd.dados.boletins
    .map(b => ({
      b,
      f: estado.funcionarios.find(x => x.id === b.funcionario_id),
      a: jd.dados.apuracoes.find(x => x.boletim_id === b.id),
    }))
    .filter(l => !busca ||
      (l.f?.nome || '').toLowerCase().includes(busca) ||
      (l.b.numero || '').includes(busca))
    .sort((x, y) => y.b.data_fato.localeCompare(x.b.data_fato));

  const soma = c => linhas.reduce((s, l) => s + (l.a?.[c] || 0), 0);

  $('telaJorBoletins').innerHTML = cabecalho('Jornadas lançadas', 'Conferência e correção da competência') + `
    <div class="jor-corpo">
      <div class="jor-barra">
        <input id="jorBuscaBol" type="search" placeholder="Buscar por funcionário ou nº do boletim" value="${esc(estadoTela.busca)}">
        <span class="dc-sem">${linhas.length} boletim(ns)</span>
      </div>
      ${linhas.length ? `<table class="dc-planilha"><thead><tr>
        <th>Data</th><th>Nº</th><th>Funcionário</th><th>Horário</th>
        <th class="ce">Extra 50%</th><th class="ce">Extra 100%</th>
        <th class="ce">Déficit</th><th class="ce">Interv.</th><th class="ce"></th>
      </tr></thead><tbody>
        ${linhas.map(({ b, f, a }) => `<tr>
          <td>${dataBR(b.data_fato)}</td>
          <td>${esc(b.numero || '—')}</td>
          <td>${esc(f?.nome || '—')}</td>
          <td>${b.hora_ini ? `${b.hora_ini.slice(0,5)}–${(b.hora_fim||'').slice(0,5)}` : '—'}</td>
          <td class="ce">${horas(a?.min_extra_50)}</td>
          <td class="ce">${horas(a?.min_extra_100)}</td>
          <td class="ce">${horas(a?.min_deficit)}</td>
          <td class="ce">${a?.min_intervalo_suprimido || 0}</td>
          <td class="ce"><button class="btn mini" data-memoria="${b.id}">Memória</button></td>
        </tr>`).join('')}
      </tbody><tfoot><tr class="jor-total">
        <td colspan="4">Total da competência</td>
        <td class="ce">${horas(soma('min_extra_50'))}</td>
        <td class="ce">${horas(soma('min_extra_100'))}</td>
        <td class="ce">${horas(soma('min_deficit'))}</td>
        <td class="ce">${soma('min_intervalo_suprimido')}</td><td></td>
      </tr></tfoot></table>` : '<div class="vazio">Nenhum boletim lançado nesta competência.</div>'}
    </div>` + assinatura();

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

      ${t('Jornadas',
        jd.dados.jornadas.map(j => `<tr>
          <td><b>${esc(j.nome)}</b></td>
          <td>${esc(resumoJornada(j))}</td>
          <td class="ce">${minParaHHMM(j.carga_semanal_min)}${j.carga_semanal_min !== 2640 ? ' <span class="jor-pend">≠ 44h</span>' : ''}</td></tr>`),
        ['Jornada', 'Dias', 'Carga semanal'])}

      ${t('Tipos de ocorrência',
        [...jd.dados.tipos].sort((a, b) => a.ordem - b.ordem).map(x => `<tr>
          <td><b>${esc(x.nome)}</b> <span class="dc-sem">${esc(x.codigo)}</span></td>
          <td>${x.apura ? 'apura horas' : 'não apura'}</td>
          <td>${x.deducao === 'nenhuma' ? '—' : esc(x.deducao)}</td>
          <td class="ce">${x.percentual_forcado ? x.percentual_forcado + '%' : '—'}</td></tr>`),
        ['Tipo', 'Cálculo', 'Dedução', 'Percentual'])}

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

}

function resumoJornada(j) {
  const nomes = ['dom','seg','ter','qua','qui','sex','sáb'];
  return Object.entries(j.dias || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${nomes[k]} ${v.ini}–${v.fim}${v.int ? ` (${v.int}min)` : ''}`)
    .join(' · ');
}

/* ===================================================================
   J.5 — FECHAMENTO DA COMPETÊNCIA, por destino de DP
   =================================================================== */

async function desenharFechamento() {
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
          const agora = c.totais.extraTotal || 0;
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
            <b>${h(c.totais.extraTotal)}</b>
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
          <th class="ce">Extras</th><th class="ce">Déficit</th>
          <th class="ce">Faltas</th><th class="ce">Atestado</th>
        </tr></thead><tbody>
          ${c.linhas.map(l => `<tr>
            <td>${esc(l.nome)}${fer.afastadoNaComp(l.vinculo.funcionario_id, estadoTela.competencia)
              ? ' <span class="tag neutra">afastado</span>'
              : l.boletins === 0 ? ' <span class="jor-pend">sem lançamento</span>' : ''}</td>
            <td class="dc-sem">${esc(l.unidadeNome)}</td>
            <td class="ce">${h(l.minExtraTotal)}</td>
            <td class="ce">${l.minDeficitAvulso ? h(l.minDeficitAvulso) : '—'}</td>
            <td class="ce">${l.faltasInformadas || '—'}</td>
            <td class="ce">${l.diasAtestado || '—'}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum vínculo neste destino.</td></tr>'}
        </tbody><tfoot><tr class="jor-total">
          <td colspan="2">Total</td>
          <td class="ce">${h(c.totais.extraTotal)}</td>
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
          <button class="btn mini" data-verdp="${d.id}">Ver Relatório DP</button>
        </div>
      </section>`;
  }));

  $('telaJorFechamento').innerHTML = cabecalho('Fechamento da competência', 'Um envio por destino de DP — nunca misturados') + `
    <div class="jor-corpo">${blocos.join('')}</div>` + assinatura();

  emp.ligarBlocoFechamento(() => desenharFechamento());

  document.querySelectorAll('[data-enviar]').forEach(b => b.addEventListener('click', async () => {
    const c = fech.consolidar(estadoTela.competencia, b.dataset.enviar);
    if (!confirm(`Enviar a competência de ${rotuloCompetencia(estadoTela.competencia)} ao ${c.destino.nome}?\n\n` +
                 `${c.totais.pessoas} pessoa(s) · ${fech.formatarHoras(c.totais.extraTotal, c.destino.formato_horas)} de horas extras.`)) return;
    // Empréstimo: confere antes, grava a baixa só depois que o envio deu certo.
    const prep = emp.prepararAbatimentos(estadoTela.competencia, b.dataset.enviar);
    if (prep.erro) { aviso(prep.erro); return; }
    try {
      await fech.enviar(c);
      await emp.lancarAbatimentos(estadoTela.competencia, b.dataset.enviar, prep);
      aviso('Competência enviada. Falta aprovar para travar.', true);
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
    rel.mostrar(rel.relatorioDP(estadoTela.competencia, b.dataset.verdp));
  }));
}

/* ===================================================================
   J.6 — RELATÓRIOS
   =================================================================== */

function desenharRelatorios() {
  const destinos = jd.dados.destinos.filter(d => d.ativo !== false);
  const pessoas = estado.funcionarios.filter(f => jd.vinculoDe(f.id));

  $('telaJorRelatorios').innerHTML = cabecalho('Relatórios', 'Prévia na tela primeiro; salvar é escolha sua') + `
    <div class="jor-corpo">
      <div class="jor-caixa">
        Todo relatório sai de <b>um destino de DP só</b>. Não existe emissão que junte destinos —
        é bloqueio, não filtro.
      </div>

      <h3 class="jor-h3">Da competência</h3>
      <div class="jor-barra">
        <label>Destino
          <select id="relDestino">
            ${destinos.map(d => `<option value="${d.id}">${esc(d.nome)}</option>`).join('')}
          </select>
        </label>
        <button class="btn principal" id="relDP">Relatório DP</button>
        <button class="btn" id="relDet">Detalhado DP</button>
        <button class="btn mini" id="relCsv">Baixar dados (Excel)</button>
      </div>

      <h3 class="jor-h3">De uma pessoa</h3>
      <div class="jor-barra">
        <label>Funcionário
          <select id="relPessoa">
            ${pessoas.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}
          </select>
        </label>
        <button class="btn" id="relExtrato">Extrato individual</button>
      </div>

      ${emp.podeVerEmprestimo() ? `<h3 class="jor-h3">Empréstimo Funcionário</h3>
      <div class="jor-barra">
        <button class="btn" id="relEmpDev">Extrato geral — todos que devem</button>
        <button class="btn mini" id="relEmpCsv">Baixar dados (Excel)</button>
      </div>` : ''}

      ${fer.podeVerFerias() ? `<h3 class="jor-h3">Férias</h3>
      <div class="jor-barra fer-barra-rel">
        <label>Relatório
          <select id="relFerTipo">
            <option value="venc">Venceram no mês</option>
            <option value="prev">Previsão dos próximos 12 meses</option>
            <option value="sit">Situação da equipe</option>
          </select>
        </label>
        <label id="relFerMesRot">Mês <input type="month" id="relFerMes" value="${mesAnterior()}"></label>
        <label>Destino
          <select id="relFerDest">
            <option value="">Todos</option>
            ${destinos.map(d => `<option value="${d.id}">${esc(d.nome)}</option>`).join('')}
            <option value="-">Sem destino</option>
          </select>
        </label>
        <button class="btn" id="relFerVer">Ver relatório</button>
        <button class="btn mini" id="relFerCsv">Baixar dados (Excel)</button>
      </div>
      <p class="dc-sem jor-nota">No início de cada mês, emita "Venceram no mês" do mês anterior.</p>` : ''}

      <div class="jor-acoes" id="relAcoes" hidden>
        <button class="btn principal" id="relImprimir">Imprimir / salvar em PDF</button>
        <button class="btn mini" id="relFechar">Fechar prévia</button>
      </div>
    </div>` + assinatura();

  const preview = html => { rel.mostrar(html); $('relAcoes').hidden = false; };

  $('relDP').addEventListener('click', () =>
    preview(rel.relatorioDP(estadoTela.competencia, $('relDestino').value)));
  $('relDet').addEventListener('click', () =>
    preview(rel.relatorioDetalhado(estadoTela.competencia, $('relDestino').value)));
  $('relExtrato').addEventListener('click', () =>
    preview(rel.extratoIndividual(estadoTela.competencia, $('relPessoa').value)));
  $('relCsv').addEventListener('click', () =>
    rel.baixar(rel.planilhaDP(estadoTela.competencia, $('relDestino').value)));
  $('relEmpDev')?.addEventListener('click', () => preview(emp.devedoresHTML()));
  $('relEmpCsv')?.addEventListener('click', () => emp.baixarCSV(emp.devedoresCSV()));
  const ferHtml = () => {
    const t = $('relFerTipo').value, d = $('relFerDest').value;
    return t === 'venc' ? fer.relVencidos($('relFerMes').value || mesAnterior(), d)
      : t === 'prev' ? fer.relPrevisao(d) : fer.relSituacao(d);
  };
  $('relFerTipo')?.addEventListener('change', () => { $('relFerMesRot').hidden = $('relFerTipo').value !== 'venc'; });
  $('relFerVer')?.addEventListener('click', () => preview(ferHtml()));
  $('relFerCsv')?.addEventListener('click', () =>
    rel.baixar(fer.csvFerias($('relFerTipo').value, $('relFerMes').value || mesAnterior(), $('relFerDest').value)));
  $('relImprimir').addEventListener('click', () => rel.imprimir());
  $('relFechar').addEventListener('click', () => {
    $('jorImpressao').hidden = true;
    $('jorImpressao').innerHTML = '';
    $('relAcoes').hidden = true;
  });
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

  $('jorCompetencia')?.addEventListener('change', async ev => {
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
  ['jorPainel','jorLancar','jorBoletins','jorFechamento','jorRelatorios','jorConfig']
    .find(t => !$('tela' + t.charAt(0).toUpperCase() + t.slice(1))?.hidden) || 'jorPainel';
