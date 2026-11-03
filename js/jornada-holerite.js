// jornada-holerite.js — DP › Gestão de jornada › Fechamento › Holerites (03/11/2026)
//
// Pedido dele: um holerite por funcionário, no formato da planilha
// "Controle folha de pagamento Quebra Cocão - DP2", que puxa sozinho do app
// os dias trabalhados, D.S.R., feriados, férias, atestados, faltas
// justificadas e não justificadas, horas extras, adicionais e o adiantamento
// (parcela do empréstimo). Tudo o que vem puxado pode ser alterado na tela;
// a alteração fica gravada em jor_holerites (chave funcionario_id|AAAA-MM)
// e vale só para aquele mês.
//
// Só para o DP 2 (Quebra Cocão): o botão aparece apenas no bloco desse
// destino. A conta mora em holerite-motor.js.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { consolidar } from './jornada-fechamento.js';
import { valorParaFolha } from './jornada-emprestimos.js';
import { imprimir } from './jornada-relatorios.js';
import { LINHAS, CAMPOS, calcular, contarDias, r2 } from './holerite-motor.js';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rotuloComp = c => `${MESES[+c.slice(5, 7) - 1]} de ${c.slice(0, 4)}`;
const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
const cpfBR = c => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '');
};
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fimDoMes = comp => new Date(Date.UTC(+comp.slice(0, 4), +comp.slice(5, 7), 0)).toISOString().slice(0, 10);

/* Números na tela: dinheiro com 2 casas; referência sem casas quando inteira. */
const moeda = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
/* "1.035,86" / "1035,86" / "1035.86" / "-50" → número; vazio → null */
function lerNum(t) {
  t = String(t ?? '').trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? r2(n) : NaN;
}

/* Salário mínimo 2026 — base da insalubridade de 20% quando o RH › Salários
   não traz o valor (a planilha usa 1.621,00 × 20%). */
const SAL_MINIMO = 1621;

/** O destino é o DP 2? (só ele tem o holerite) */
export const ehDp2 = d => !!d && (String(d.nome || '').replace(/\s+/g, '').toUpperCase() === 'DP2');

/* ---------------- automático ---------------- */

function salarioEm(fid, data) {
  return (jd.dados.salarios || []).filter(s => s.funcionario_id === fid && String(s.desde || '') <= data)
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)))[0] || null;
}

const AFAST = { licenca_maternidade: 'licmat', auxilio_doenca: 'inss', acidente_trabalho: 'inss', outro: 'outro' };

/** Tudo o que o holerite puxa do app para uma linha do consolidado. */
function automatico(l, competencia) {
  const fid = l.vinculo.funcionario_id;
  const f = l.funcionario || {};
  const ini = competencia.slice(0, 8) + '01';
  const fim = fimDoMes(competencia);
  const inicio = l.admissao && l.admissao > ini ? l.admissao : ini;
  const u = l.unidade;
  const mun = jd.fazendaDe(u)?.municipio;

  const gozos = (jd.dados.feriasGozos || []).filter(g => g.funcionario_id === fid && g.situacao === 'lancado');
  const afasts = (jd.dados.afastamentos || []).filter(a => a.funcionario_id === fid && a.situacao !== 'cancelado');
  const codigo = b => jd.dados.tipos.find(t => t.id === b.tipo_id)?.codigo || '';
  const bols = jd.dados.boletins.filter(b => b.funcionario_id === fid && b.situacao !== 'cancelado'
    && b.data_fato >= inicio && b.data_fato <= fim);
  const fjDesc = new Set(l.faltasJDesc || []);

  const dias = [];
  for (let d = inicio; d <= fim; d = addDias(d, 1)) {
    const a = afasts.find(x => x.data_ini <= d && (x.fim_real || x.fim_previsto || '9999') >= d);
    let afast = a ? AFAST[a.tipo] || 'outro' : null;
    if (afast === 'inss' && d < addDias(a.data_ini, 15)) afast = 'inss15';   // 15 primeiros dias: empresa paga
    const doDia = bols.filter(b => b.data_fato === d).map(codigo);
    const cod = ['ATESTADO', 'FALTAJ', 'FALTA'].find(c => doDia.includes(c)) || doDia[0] || null;
    dias.push({
      data: d,
      ferias: gozos.some(g => g.data_ini <= d && g.data_fim >= d),
      afast,
      domingo: new Date(d + 'T12:00:00Z').getUTCDay() === 0,
      feriado: !!jd.feriadoEm(d, mun, u?.destino_id),
      codigo: cod,
      fjDesconta: fjDesc.has(d),
    });
  }
  const q = contarDias(dias, { inicioDia: +inicio.slice(8, 10) });

  // Faltas que vão para desconto: as que não foram abatidas das horas.
  const naoAbatidas = (l.faltasTodas || []).filter(x => !x.absorvida && (!x.justificada || x.desconta));
  const compensadas = (l.faltasTodas || []).filter(x => x.absorvida && !x.justificada).length;

  const s = salarioEm(fid, fim);
  const base = Number(s?.valor) || 0;
  const pericMes = l.periculosidade ? (Number(s?.periculosidade) || r2(base * 0.30)) : 0;
  const insalMes = l.insalubridadePagar ? (Number(s?.insalubridade) || r2(SAL_MINIMO * 0.20)) : 0;

  return {
    base, pericMes, insalMes, gratMes: Number(s?.gratificacao) || 0,
    semSalario: !s,
    q: {
      ...q,
      faltas: naoAbatidas.length,
      he50: r2(((l.minExtra50 || 0) + (l.minExtraAnterior || 0)) / 60),
      he100: r2((l.minExtra100 || 0) / 60),
      porfora: 0,
    },
    v: { adiant: valorParaFolha(fid, competencia) || 0 },
    texto: {
      banco: f.banco || '', conta_tipo: f.conta_tipo || '', agencia: f.agencia || '', conta: f.conta || '',
      cpf: cpfBR(f.cpf), pix: f.pix_chave || '', obs: '',
    },
    info: { inss: q.inss, outro: q.outro, compensadas },
  };
}

/* ---------------- dados da tela ---------------- */

const est = { todas: false, competencia: null, destinoId: null, pessoa: '', avisar: () => {}, itens: [] };
const ymDe = c => c.slice(0, 7);
const chaveDe = (fid, c) => `${fid}|${ymDe(c)}`;
const ajustesDe = (fid, c) => ((jd.dados.holerites || []).find(r => r.chave === chaveDe(fid, c))?.ajustes) || {};

function montar() {
  const c = consolidar(est.competencia, est.destinoId);
  est.destino = c.destino;
  est.itens = c.linhas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(l => {
    const auto = automatico(l, est.competencia);
    const fid = l.vinculo.funcionario_id;
    const ajustes = ajustesDe(fid, est.competencia);
    const u = l.unidade;
    return {
      fid, l, auto, ajustes, res: calcular(auto, ajustes),
      nome: l.nome,
      cargo: jd.funcaoDe(l.vinculo)?.nome || l.funcionario?.cargo || '',
      empregador: jd.empregadorDe(u)?.nome || '',
      fazenda: jd.fazendaDe(u)?.nome || '',
      admissao: l.admissao,
    };
  });
}

/* Valor resolvido de um campo (o que o holerite está mostrando). */
function valorCampo(res, campo) {
  const [k, p] = campo.split('.');
  if (p === 'q') return res.q[k];
  if (p === 'v') return res.v[k];
  if (CAMPOS.includes(campo)) return res.texto[campo];
  return res[campo];
}

async function gravarAjuste(item, campo, bruto) {
  const texto = CAMPOS.includes(campo);
  const novo = texto ? String(bruto || '').trim() : lerNum(bruto);
  if (!texto && Number.isNaN(novo)) { est.avisar('Número inválido. Use vírgula para os centavos, ex.: 1.250,50'); return false; }
  const ajustes = { ...item.ajustes };
  delete ajustes[campo];
  // Igual ao automático (ou apagado) → volta a ser automático.
  const auto = valorCampo(calcular(item.auto, ajustes), campo);
  const igual = novo === null || novo === '' || (texto ? novo === String(auto || '') : Math.abs(novo - (auto || 0)) < 0.005);
  if (!igual) ajustes[campo] = novo;
  await salvarAjustes(item, ajustes);
  return true;
}

async function salvarAjustes(item, ajustes) {
  item.ajustes = ajustes;
  item.res = calcular(item.auto, ajustes);
  try {
    await jd.salvar('holerites', {
      chave: chaveDe(item.fid, est.competencia), funcionario_id: item.fid,
      competencia: ymDe(est.competencia), destino_id: est.destinoId, ajustes,
      atualizado_por: estado.sessao?.user?.email || null,
    });
  } catch (e) { est.avisar('Não consegui gravar a alteração: ' + e.message); }
}

/* ---------------- desenho ---------------- */

/* 03/11/2026 (2ª versão, pedido dele): mais simples e sem o líquido — igual à
   planilha: Descrição · Quantidade · Valor, total BRUTO e, abaixo dele, faltas,
   adiantamento e horas por fora. Linha zerada não aparece (na tela, o botão
   "Mostrar linhas zeradas" abre todas para editar). */
const ORDEM_V = ['sal', 'dsr', 'feriado', 'ferias', 'he50', 'he100', 'reflexo', 'grat', 'fj', 'atest',
  'obito', 'licmat', 'insal', 'peric', 'indevido'];
const ORDEM_D = ['faltas', 'adiant', 'porfora'];
const SEMPRE = new Set(['sal', 'dsr', 'feriado']);
const linhaDe = k => LINHAS.find(l => l.k === k);
const temLinha = (res, l) => (l.un && res.q[l.k]) || res.v[l.k];

function holerite(it, editavel) {
  const r = it.res;
  const alt = c => r.alterado.has(c) ? ' hol-alt' : '';
  const titAuto = c => {
    if (!r.alterado.has(c)) return '';
    const a = { ...it.ajustes }; delete a[c];
    const v = valorCampo(calcular(it.auto, a), c);
    return ` title="Alterado à mão — automático: ${esc(CAMPOS.includes(c) ? (v || 'vazio') : (c.endsWith('.q') ? qtd(v) : moeda(v)))}"`;
  };
  const inNum = (c, v, fmt = moeda) => editavel
    ? `<input class="hol-in${alt(c)}" data-hol-f="${c}" data-hol-p="${it.fid}" value="${fmt(v)}" inputmode="decimal"${titAuto(c)}>`
    : (v ? fmt(v) : '');
  const inTxt = c => editavel
    ? `<input class="hol-in hol-txt${alt(c)}" data-hol-f="${c}" data-hol-p="${it.fid}" value="${esc(r.texto[c])}"${titAuto(c)}>`
    : esc(r.texto[c] || '—');

  const mostra = l => SEMPRE.has(l.k) || temLinha(r, l) || (editavel && est.todas);
  const linha = k => {
    const l = linhaDe(k);
    if (!mostra(l)) return '';
    const ref = l.un && (editavel || r.q[l.k]) ? `${inNum(l.k + '.q', r.q[l.k], qtd)} <small>${l.un === 'h' ? 'h' : 'dias'}</small>` : '';
    const nome = l.k === 'faltas' ? 'Faltas (descontar)' : l.k === 'ferias' && !r.v.ferias ? 'Férias <span class="rel-mini">(recibo de férias)</span>' : esc(l.nome);
    return `<tr><td>${nome}</td><td class="rel-c">${ref}</td><td class="rel-num">${inNum(l.k + '.v', r.v[l.k])}</td></tr>`;
  };
  const abaixo = ORDEM_D.map(linha).join('');

  const notas = [];
  if (it.auto.semSalario) notas.push('Sem salário cadastrado em RH › Salários — digite o salário base.');
  if (it.auto.info.inss) notas.push(`${it.auto.info.inss} dia(s) afastado pelo INSS (a partir do 16º dia) — não pagos.`);
  if (it.auto.info.outro) notas.push(`${it.auto.info.outro} dia(s) de afastamento (outro motivo) — não pagos.`);
  if (it.auto.info.compensadas) notas.push(`${it.auto.info.compensadas} falta(s) compensada(s) com horas — não descontadas.`);
  if (it.l.registroNoMes) notas.push(`Registrado em ${dataBR(it.admissao)} — mês proporcional.`);
  const banco = ['banco', 'conta_tipo', 'agencia', 'conta', 'pix'].some(c => r.texto[c]);

  return `
  <article class="rel hol" data-hol="${it.fid}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo">
        <h1>HOLERITE</h1>
        <p>Referente a ${esc(rotuloComp(est.competencia))}</p>
      </div>
      <div class="rel-comp"><strong>${esc(MESES[+est.competencia.slice(5, 7) - 1].slice(0, 3))}/${est.competencia.slice(0, 4)}</strong><span>${esc(est.destino?.nome || '')}</span></div>
    </header>

    <div class="hol-id">
      <div><span>Funcionário</span><b>${esc(it.nome)}</b></div>
      <div><span>Cargo</span><b>${esc(it.cargo || '—')}</b></div>
      <div><span>Salário base</span><b>${inNum('base', r.base)}</b></div>
      <div><span>Fazenda</span><b>${esc(it.fazenda || '—')}</b></div>
      <div><span>Admissão</span><b>${esc(dataBR(it.admissao) || '—')}</b></div>
      <div><span>CPF</span><b>${inTxt('cpf')}</b></div>
    </div>

    <table class="rel-tabela hol-tab">
      <thead><tr><th>Descrição</th><th class="rel-c">Quantidade</th><th class="rel-num">Valor</th></tr></thead>
      <tbody>${ORDEM_V.map(linha).join('')}</tbody>
      <tbody class="hol-bruto"><tr><td colspan="2">Bruto</td><td class="rel-num">${moeda(r.bruto)}</td></tr></tbody>
      ${abaixo ? `<tbody>${abaixo}</tbody>` : ''}
    </table>

    ${editavel || banco ? `<div class="hol-pag">
      <div><span>Banco</span><b>${inTxt('banco')}</b></div>
      <div><span>Tipo</span><b>${inTxt('conta_tipo')}</b></div>
      <div><span>Agência</span><b>${inTxt('agencia')}</b></div>
      <div><span>Conta</span><b>${inTxt('conta')}</b></div>
      <div><span>PIX</span><b>${inTxt('pix')}</b></div>
    </div>` : ''}

    ${editavel || r.texto.obs ? `<div class="hol-obs"><span>Observação</span>${editavel
      ? `<input class="hol-in hol-txt${alt('obs')}" data-hol-f="obs" data-hol-p="${it.fid}" value="${esc(r.texto.obs)}" placeholder="opcional">`
      : `<p>${esc(r.texto.obs)}</p>`}</div>` : ''}

    ${editavel && notas.length ? `<ul class="hol-notas">${notas.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

    ${editavel ? `<div class="hol-acoes"><button class="btn mini" type="button" data-hol-reset="${it.fid}"
        ${Object.keys(it.ajustes).length ? '' : 'disabled'}>Voltar tudo ao automático</button></div>` : `
    <div class="hol-assina">
      <p>Declaro ter recebido os valores discriminados neste holerite.</p>
      <div><span></span><small>Data</small></div>
      <div><span></span><small>Assinatura do funcionário</small></div>
    </div>`}

    <footer class="rel-rodape">
      <img src="img/lop-marca.png" alt="LOP">
      <span class="rel-lop">Inteligência para o agronegócio</span>
    </footer>
  </article>`;
}

function desenhar() {
  const alvo = document.getElementById('jorImpressao');
  if (!alvo) return;
  const lista = est.itens.filter(it => !est.pessoa || it.fid === est.pessoa);
  const total = k => est.itens.reduce((s, it) => s + (it.res[k] || 0), 0);
  alvo.innerHTML = `
    <div class="rel-barra-tela hol-barra">
      <label>Funcionário <select data-hol-pessoa>
        <option value="">Todos (${est.itens.length})</option>
        ${est.itens.map(it => `<option value="${it.fid}"${it.fid === est.pessoa ? ' selected' : ''}>${esc(it.nome)}</option>`).join('')}
      </select></label>
      <span class="hol-tot">Bruto ${moeda(total('bruto'))} · Por fora ${moeda(total('porFora'))}</span>
      <button class="btn mini" type="button" data-hol-todas>${est.todas ? 'Esconder linhas zeradas' : 'Mostrar linhas zeradas'}</button>
      <button class="btn principal" type="button" data-hol-imprimir>Imprimir / salvar em PDF</button>
      <button class="btn mini" type="button" data-hol-fechar>Fechar</button>
    </div>
    <p class="hol-dica">Valores puxados do app. Para mudar, clique no número e digite — a alteração fica gravada só para
      ${esc(rotuloComp(est.competencia))}. Campo em <b class="hol-alt-ex">marrom</b> foi alterado à mão (passe o mouse para ver o automático);
      apague o número para voltar ao automático. Linhas zeradas ficam escondidas (e não saem na impressão).</p>
    <div class="hol-editor">${lista.map(it => holerite(it, true)).join('') || '<p class="rel-vazio">Nenhum funcionário neste destino.</p>'}</div>
    <div class="hol-papel"></div>`;
  ligar(alvo);
  alvo.hidden = false;
}

function redesenharCartao(it) {
  const el = document.querySelector(`#jorImpressao .hol-editor [data-hol="${it.fid}"]`);
  if (!el) return desenhar();
  el.outerHTML = holerite(it, true);
  ligar(document.querySelector(`#jorImpressao .hol-editor [data-hol="${it.fid}"]`));
  const tot = document.querySelector('#jorImpressao .hol-tot');
  const total = k => est.itens.reduce((s, x) => s + (x.res[k] || 0), 0);
  if (tot) tot.textContent = `Bruto ${moeda(total('bruto'))} · Por fora ${moeda(total('porFora'))}`;
}

function ligar(raiz) {
  raiz.querySelectorAll('[data-hol-f]').forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', async () => {
      const it = est.itens.find(x => x.fid === inp.dataset.holP);
      if (!it) return;
      if (await gravarAjuste(it, inp.dataset.holF, inp.value)) {
        // Tab para o próximo campo: o cartão é redesenhado e o foco volta para ele.
        await new Promise(r => setTimeout(r, 0));
        const prox = document.activeElement?.closest?.(`[data-hol="${it.fid}"]`) ? document.activeElement.dataset.holF : null;
        redesenharCartao(it);
        if (prox) document.querySelector(`#jorImpressao .hol-editor [data-hol="${it.fid}"] [data-hol-f="${prox}"]`)?.focus();
        est.avisar('Holerite de ' + it.nome + ' atualizado.', true);
      }
    });
  });
  raiz.querySelectorAll('[data-hol-reset]').forEach(b => b.addEventListener('click', async () => {
    const it = est.itens.find(x => x.fid === b.dataset.holReset);
    if (!it || !confirm(`Voltar o holerite de ${it.nome} aos valores automáticos?\n\nAs alterações feitas à mão neste mês serão perdidas.`)) return;
    await salvarAjustes(it, {});
    redesenharCartao(it);
  }));
  raiz.querySelector('[data-hol-todas]')?.addEventListener('click', () => { est.todas = !est.todas; desenhar(); });
  raiz.querySelector('[data-hol-pessoa]')?.addEventListener('change', e => { est.pessoa = e.target.value; desenhar(); });
  raiz.querySelector('[data-hol-fechar]')?.addEventListener('click', () => {
    const alvo = document.getElementById('jorImpressao'); alvo.hidden = true; alvo.innerHTML = '';
  });
  raiz.querySelector('[data-hol-imprimir]')?.addEventListener('click', () => {
    const papel = document.querySelector('#jorImpressao .hol-papel');
    const lista = est.itens.filter(it => !est.pessoa || it.fid === est.pessoa);
    papel.innerHTML = lista.map(it => holerite(it, false)).join('');
    setTimeout(() => imprimir(), 300);   // deixa as marcas carregarem antes do papel
  });
}

/** Abre os holerites do destino (DP 2) na competência, prontos para editar e imprimir. */
export function abrirHolerites(competencia, destinoId, aviso = () => {}) {
  est.competencia = competencia;
  est.destinoId = destinoId;
  est.avisar = aviso;
  est.pessoa = '';
  montar();
  desenhar();
  document.getElementById('jorImpressao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
