// rh-ind-vinculos.js — histórico de vínculos para os indicadores (30/09/2026)
//
// Base do turnover (spec 07, seção 6): cada passagem de uma pessoa pela
// empresa é uma linha em rh_ind_vinculos, com admissão e desligamento.
// O cadastro (Nível 1 e 2) chama estas funções quando alguém é admitido,
// desligado, readmitido ou transferido de empregador.
//
//  - Desligamento lançado no app exige tipo e motivo (D-28). O banco também
//    recusa sem eles (constraint rh_ind_deslig_completo).
//  - Readmissão abre um vínculo novo, marcado (D-27).
//  - Transferência fecha o vínculo com N1/N2 e abre outro ligado a ele;
//    não conta como desligamento no turnover (D-23).
//
// Grava pelo jd.salvar: cache local, escrita otimista e fila sem rede.

import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Mesma lista semeada no banco — usada se a tabela ainda não veio (1º acesso sem rede). */
const TIPOS_PADRAO = [
  { codigo: 'I1', nome: 'Dispensa sem justa causa', classe: 'involuntario', ordem: 1 },
  { codigo: 'J',  nome: 'Pedido de demissão', classe: 'voluntario', ordem: 2 },
  { codigo: 'I3', nome: 'Término de contrato de safra / a prazo', classe: 'involuntario', ordem: 3 },
  { codigo: 'H',  nome: 'Dispensa por justa causa', classe: 'involuntario', ordem: 4 },
  { codigo: 'AC', nome: 'Acordo entre as partes (art. 484-A)', classe: 'involuntario', ordem: 5 },
  { codigo: 'N1', nome: 'Transferência (mesmo empregador)', classe: 'transferencia', ordem: 6 },
  { codigo: 'N2', nome: 'Transferência (outro empregador do grupo)', classe: 'transferencia', ordem: 7 },
  { codigo: 'S2', nome: 'Falecimento', classe: 'outro', ordem: 8 },
];
const tipos = () => (jd.dados.tiposDeslig?.length ? jd.dados.tiposDeslig : TIPOS_PADRAO)
  .filter(t => t.ativo !== false).sort((a, b) => a.ordem - b.ordem);

/* Data local em AAAA-MM-DD (toISOString daria o dia seguinte depois das 21h). */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(new Date());
const diaAntes = s => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() - 1); return iso(d); };
const br = s => (/^(\d{4})-(\d{2})-(\d{2})/.exec(s || '') || []).slice(1).reverse().join('/');

/* ---------------- leitura ---------------- */

export const vinculosDe = fid => (jd.dados.indVinculos || [])
  .filter(v => v.funcionario_id === fid)
  .sort((a, b) => String(a.admissao || '').localeCompare(String(b.admissao || '')));
export const abertoDe = fid => vinculosDe(fid).filter(v => !v.desligamento).pop() || null;
const ultimoDe = fid => vinculosDe(fid).pop() || null;

/** Inativo com vínculo do app ainda aberto: saiu sem o desligamento registrado
 *  (ex.: inativado pela importação de planilha). A lista mostra o botão. */
export const desligPendente = f => (f.situacao || 'ATIVO') === 'INATIVO' && !!abertoDe(f.id);

/** Como a pessoa está hoje: é o que fica gravado no vínculo, para o recorte
 *  do indicador não mudar quando o cadastro mudar depois. */
export function retrato(f) {
  const v = jd.vinculoDe(f.id) || {};
  const u = jd.unidadeDe(v);
  return {
    nome: f.nome,
    sexo: f.sexo || null,
    unidade_id: v.unidade_id || null,
    empregador: (u && jd.empregadorDe(u)?.nome) || f.empregador || null,
    fazenda: (u && jd.fazendaDe(u)?.nome) || f.fazenda || null,
    setor: jd.setorDe(v)?.nome || f.setor || null,
    funcao: jd.funcaoDe(v)?.nome || f.cargo || null,
    jornada: jd.jornadaDe(v)?.nome || null,
    tipo_contrato: v.tipo_contrato || 'fixo',
  };
}

/* ---------------- gravação ---------------- */

const salvarV = item => jd.salvar('indVinculos', { ...item, atualizado_em: new Date().toISOString() });

const abrir = (f, admissao, extra = {}) => salvarV({
  funcionario_id: f.id, ...retrato(f), admissao: admissao || null,
  readmissao: false, origem: 'app', ...extra,
});

/** Depois de salvar o cadastro sem movimento: atualiza o vínculo aberto.
 *  Ativo sem vínculo nenhum ganha um, com a admissão do cadastro. */
export async function sincronizar(f) {
  const a = abertoDe(f.id);
  if (a) return salvarV({ ...a, ...retrato(f), admissao: a.admissao || f.admissao || null });
  if ((f.situacao || 'ATIVO') === 'ATIVO' && !ultimoDe(f.id)) return abrir(f, f.admissao);
}

export async function desligar(f, { data, tipo, motivo, obs }) {
  const a = abertoDe(f.id) || { funcionario_id: f.id, admissao: f.admissao || null, origem: 'app' };
  return salvarV({ ...a, ...retrato(f), desligamento: data, tipo_deslig: tipo,
    motivo: motivo.trim(), observacao: (obs || '').trim() || null });
}

export const readmitir = (f, data) => abrir(f, data, { readmissao: true });

/** Inativado por engano: reabre o último vínculo em vez de contar readmissão. */
export async function corrigirReativacao(f) {
  const u = ultimoDe(f.id);
  if (u?.desligamento) return salvarV({ ...u, ...retrato(f), desligamento: null, tipo_deslig: null, motivo: null, observacao: null });
  if (!u) return abrir(f, f.admissao);
}

/** Fecha o vínculo no dia anterior com N1/N2 e abre o novo a partir de `data`.
 *  `antes` é o retrato tirado antes de salvar a unidade nova. */
export async function transferir(f, antes, data, codigo, paraNome) {
  const a = abertoDe(f.id) || { funcionario_id: f.id, admissao: f.admissao || null, origem: 'app' };
  const fechado = await salvarV({ ...a, ...antes, desligamento: diaAntes(data), tipo_deslig: codigo,
    motivo: 'Transferência para ' + (paraNome || 'outra unidade'), observacao: a.observacao || null });
  return abrir(f, data, { transf_de: fechado.id });
}

/* ---------------- diálogo ---------------- */

const ESCOLHAS = {
  reativar: [
    ['readmissao', 'Readmissão — voltou a trabalhar depois de ter saído'],
    ['correcao', 'Correção — foi inativado por engano'],
  ],
  transferir: [
    ['transferencia', 'Transferência — passou a ser registrado pelo outro empregador'],
    ['correcao', 'Correção — a unidade estava errada no cadastro'],
  ],
};

let pedido = null;   // { modo, ctx, resolver }

/**
 * Pergunta o que aconteceu antes de salvar o cadastro.
 * @param {'desligar'|'reativar'|'transferir'} modo
 * @param {object} ctx  nome, admissao, de, para, mesmoEmpregador
 * @returns {Promise<object|null>}  null = cancelou (o cadastro não é salvo)
 */
export function pedirMovimento(modo, ctx) {
  const dlg = $('dlgMovVinc');
  $('mvErro').hidden = true;
  $('mvMotivo').value = ''; $('mvObs').value = '';
  $('mvData').value = hoje();

  // style.display, não hidden: o display do .campo no CSS passa por cima do atributo.
  const mostrar = (id, sim) => { $(id).style.display = sim ? '' : 'none'; };
  $('mvEscolha').innerHTML = (ESCOLHAS[modo] || [])
    .map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
  mostrar('mvEscolhaCampo', modo !== 'desligar');
  mostrar('mvTipoCampo', modo === 'desligar');
  mostrar('mvMotivoCampo', modo === 'desligar');
  mostrar('mvObsCampo', modo === 'desligar');

  if (modo === 'desligar') {
    $('mvTitulo').textContent = 'Desligamento — ' + ctx.nome;
    $('mvDica').textContent = 'Obrigatório para o turnover: sem tipo e motivo o cadastro não fica inativo.';
    $('mvDataRotulo').textContent = 'Data do desligamento';
    $('mvTipo').innerHTML = '<option value="">Escolha…</option>' + tipos()
      .filter(t => t.classe !== 'transferencia')
      .map(t => `<option value="${esc(t.codigo)}">${esc(t.nome)}</option>`).join('');
  } else if (modo === 'reativar') {
    $('mvTitulo').textContent = 'Reativar — ' + ctx.nome;
    $('mvDica').textContent = 'Readmissão conta como admissão nova no turnover. Correção só desfaz o desligamento.';
    $('mvDataRotulo').textContent = 'Data da readmissão';
  } else {
    $('mvTitulo').textContent = 'Troca de unidade — ' + ctx.nome;
    $('mvDica').textContent = `De ${ctx.de} para ${ctx.para}. Transferência não conta como desligamento no turnover.`;
    $('mvDataRotulo').textContent = 'Primeiro dia na unidade nova';
  }
  const ajustarData = () => mostrar('mvDataCampo', modo === 'desligar' || $('mvEscolha').value !== 'correcao');
  $('mvEscolha').onchange = ajustarData;
  ajustarData();

  return new Promise(resolver => {
    pedido = { modo, ctx, resolver };
    dlg.showModal();
  });
}

function responder(valor) {
  const p = pedido; pedido = null;
  if ($('dlgMovVinc').open) $('dlgMovVinc').close();
  p?.resolver(valor);
}

function erro(txt) { $('mvErro').textContent = txt; $('mvErro').hidden = false; }

export function ligarMovVinc() {
  $('mvCancelar').addEventListener('click', () => responder(null));
  // Esc fecha o diálogo sem passar pelo botão: conta como cancelar.
  $('dlgMovVinc').addEventListener('close', () => { if (pedido) responder(null); });

  $('formMovVinc').addEventListener('submit', ev => {
    ev.preventDefault();
    if (!pedido) return;
    const { modo, ctx } = pedido;
    const escolha = $('mvEscolha').value;
    const data = $('mvData').value;
    const precisaData = modo === 'desligar' || escolha !== 'correcao';
    if (precisaData && !data) return erro('Informe a data.');
    if (precisaData && ctx.admissao && modo === 'desligar' && data < ctx.admissao)
      return erro(`A data não pode ser antes da admissão (${br(ctx.admissao)}).`);

    if (modo === 'desligar') {
      const tipo = $('mvTipo').value, motivo = $('mvMotivo').value.trim();
      if (!tipo) return erro('Escolha o tipo de desligamento.');
      if (!motivo) return erro('Escreva o motivo — é ele que explica o número do turnover.');
      return responder({ modo, data, tipo, motivo, obs: $('mvObs').value });
    }
    if (modo === 'transferir') {
      return responder({ modo, escolha, data, tipo: ctx.mesmoEmpregador ? 'N1' : 'N2' });
    }
    return responder({ modo, escolha, data });
  });
}
