// sst.js — submódulos Exames e Treinamentos do módulo SST.
//
// Os dois funcionam igual: um cadastro de tipos (com a periodicidade em meses)
// e uma tela de vencimentos, onde cada lançamento ganha a data de vencimento
// calculada pelo tipo. Por isso quase tudo aqui é escrito uma vez só e recebe
// a "receita" do exame ou do treinamento em RECEITAS.
import { estado } from './store.js';
import { LOGO, PE_LOP } from './seed.js';
import { definirTipos, carregarAso, limparAso, desenharItens, salvarItens,
  conferenciaDo, pendenciasDe } from './aso.js';
import { documentoFichaSst, verFichaSst, fecharFichaSst, imprimirFichaSst } from './sst-ficha.js';
import { abrirModulo } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const hoje = () => new Date().toISOString().slice(0, 10);

/** Soma meses a uma data ISO, segurando o fim de mês (31/01 + 1 mês = 28/02). */
export function somarMeses(iso, meses) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m || !meses) return null;
  const ano = +m[1], mes = +m[2] - 1, dia = +m[3];
  const d = new Date(Date.UTC(ano, mes + Number(meses), 1));
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}

/* As gavetas do painel de alerta. São exclusivas de propósito: quem está em
   "31 a 60" não aparece também em "até 30", senão a soma dos cartões não bate
   com o total e ninguém confia no número. */
export const FAIXAS = [
  { chave: 'vencido', rotulo: 'Vencidos', curto: 'Vencidos', dica: 'Refazer agora', cor: 'perigo' },
  { chave: 'ate30', rotulo: 'Vence em até 30 dias', curto: 'Até 30 dias', dica: 'Agendar esta semana', cor: 'alerta' },
  { chave: 'ate60', rotulo: 'De 31 a 60 dias', curto: '31 a 60 dias', dica: 'Já dá para marcar', cor: 'atencao' },
  { chave: 'ate90', rotulo: 'De 61 a 90 dias', curto: '61 a 90 dias', dica: 'Entra no radar', cor: 'calma' },
];
const faixaDe = dias => {
  if (dias == null) return 'semvalidade';
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'ate30';
  if (dias <= 60) return 'ate60';
  if (dias <= 90) return 'ate90';
  return 'emdia';
};

/** Em dia, vencendo (30 dias) ou vencido — mais a faixa de 60/90 do painel. */
export function situacaoDe(vence) {
  if (!vence) return { chave: 'semvalidade', rotulo: 'Sem validade', cor: 'neutra', dias: null, faixa: 'semvalidade' };
  const dias = Math.round((Date.parse(vence + 'T00:00:00Z') - Date.parse(hoje() + 'T00:00:00Z')) / 86400000);
  const faixa = faixaDe(dias);
  if (dias < 0) return { chave: 'vencido', rotulo: `Vencido há ${-dias} dia${-dias > 1 ? 's' : ''}`, cor: 'perigo', dias, faixa };
  if (dias <= 30) return { chave: 'vencendo', rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias > 1 ? 's' : ''}`, cor: 'alerta', dias, faixa };
  return { chave: 'emdia', rotulo: 'Em dia', cor: 'ativo', dias, faixa };
}

/* =============== as duas receitas =============== */
const RECEITAS = {
  exame: {
    id: 'exame',
    titulo: 'Vencimento dos exames',
    rotuloTipo: 'Exame',
    tabelaTipos: 'sst_tipos_exame',
    tabelaRegs: 'sst_exames',
    tela: 'exVenc', telaTipos: 'exTipos', telaPainel: 'exPainel',
    semNenhum: 'sem nenhum exame lançado',
    tituloFolha: 'PAINEL DE ALERTA · EXAMES OCUPACIONAIS',
    completo: false,                   // exame guarda só tipo, data e vencimento
    el: {
      pCards: 'exPnCards', pAlerta: 'exPnAlerta', pTipos: 'exPnTipos', pSemNada: 'exPnSemNada',
      pSaida: 'exPnSaida', pImprimir: 'bImprimirPnEx', pZoom: 'zoomPnEx', pZoomV: 'zoomVPnEx',
      busca: 'exBusca', fTipo: 'exFiltroTipo', fStatus: 'exFiltroStatus', fSit: 'exFiltroSit',
      resumo: 'exResumo', historico: 'exHistorico', tabela: 'exTabela', semNada: 'exSemNada',
      saida: 'exSaida', zoom: 'zoomEx', zoomV: 'zoomVEx', imprimir: 'bImprimirEx',
      novo: 'bNovoExame', listaTipos: 'listaTipoEx', novoTipo: 'bNovoTipoEx',
      ficha: 'bFichaEx', barraFicha: 'barraFichaEx', barraLista: 'rodapeEx',
      fichaImprimir: 'bImprimirFichaEx', fichaFechar: 'bFecharFichaEx',
      dlg: 'dlgExame', form: 'formExame', titulo: 'tituloExame', erro: 'erroExame',
      func: 'exFunc', tipo: 'exTipo', data: 'exData', vence: 'exVence',
      dica: 'exDicaVence', apagar: 'bApagarExame',
      dlgTipo: 'dlgTipoEx', formTipo: 'formTipoEx', tituloTipo: 'tituloTipoEx', erroTipo: 'erroTipoEx',
      tNome: 'txNome', tMeses: 'txMeses', tAtivo: 'txAtivo', tApagar: 'bApagarTipoEx', tCarga: null,
      tCategoria: 'txCategoria',
    },
  },
  treinamento: {
    id: 'treinamento',
    titulo: 'Vencimento dos treinamentos',
    rotuloTipo: 'Treinamento',
    tabelaTipos: 'sst_tipos_treinamento',
    tabelaRegs: 'sst_treinamentos',
    tela: 'trVenc', telaTipos: 'trTipos', telaPainel: 'trPainel',
    semNenhum: 'sem nenhum treinamento lançado',
    tituloFolha: 'PAINEL DE ALERTA · TREINAMENTOS',
    completo: true,                    // treinamento guarda carga, instrutor e observação
    el: {
      pCards: 'trPnCards', pAlerta: 'trPnAlerta', pTipos: 'trPnTipos', pSemNada: 'trPnSemNada',
      pSaida: 'trPnSaida', pImprimir: 'bImprimirPnTr', pZoom: 'zoomPnTr', pZoomV: 'zoomVPnTr',
      busca: 'trBusca', fTipo: 'trFiltroTipo', fStatus: 'trFiltroStatus', fSit: 'trFiltroSit',
      resumo: 'trResumo', historico: 'trHistorico', tabela: 'trTabela', semNada: 'trSemNada',
      saida: 'trSaida', zoom: 'zoomTr', zoomV: 'zoomVTr', imprimir: 'bImprimirTr',
      novo: 'bNovoTrein', listaTipos: 'listaTipoTr', novoTipo: 'bNovoTipoTr',
      ficha: 'bFichaTr', barraFicha: 'barraFichaTr', barraLista: 'rodapeTr',
      fichaImprimir: 'bImprimirFichaTr', fichaFechar: 'bFecharFichaTr',
      dlg: 'dlgTreino', form: 'formTreino', titulo: 'tituloTreino', erro: 'erroTreino',
      func: 'trFunc', tipo: 'trTipo', data: 'trData', vence: 'trVence',
      dica: 'trDicaVence', apagar: 'bApagarTreino',
      carga: 'trCarga', instrutor: 'trInstrutor', obs: 'trObs',
      dlgTipo: 'dlgTipoTr', formTipo: 'formTipoTr', tituloTipo: 'tituloTipoTr', erroTipo: 'erroTipoTr',
      tNome: 'ttNome', tMeses: 'ttMeses', tAtivo: 'ttAtivo', tCarga: 'ttCarga', tApagar: 'bApagarTipoTr',
      tRecicla: 'ttRecicla',
    },
  },
};

/* =============== dados =============== */
const S = { exame: { tipos: [], regs: [] }, treinamento: { tipos: [], regs: [] }, carregado: false };
const editando = { exame: null, treinamento: null };
const editandoTipo = { exame: null, treinamento: null };

export async function carregarSst() {
  const c = estado.cliente;
  const [te, ex, tt, tr] = await Promise.all([
    c.from('sst_tipos_exame').select('*').order('ordem').order('nome'),
    c.from('sst_exames').select('*').order('realizado', { ascending: false }),
    c.from('sst_tipos_treinamento').select('*').order('ordem').order('nome'),
    c.from('sst_treinamentos').select('*').order('realizado', { ascending: false }),
  ]);
  const erro = te.error || ex.error || tt.error || tr.error;
  if (erro) throw erro;
  S.exame.tipos = te.data || [];
  S.exame.regs = ex.data || [];
  S.treinamento.tipos = tt.data || [];
  S.treinamento.regs = tr.data || [];
  S.carregado = true;
  definirTipos(S.exame.tipos);
  await carregarAso();
}

export function limparSst() {
  limparAso();
  fecharFicha();
  S.exame = { tipos: [], regs: [] };
  S.treinamento = { tipos: [], regs: [] };
  S.carregado = false;
}

const funcionario = id => estado.funcionarios.find(f => f.id === id);
const tipoDe = (r, id) => S[r.id].tipos.find(t => t.id === id);

/* O "grupo" de um tipo: ele mesmo, ou o treinamento que ele recicla. A
   reciclagem NR-31 renova o curso inicial de mecanização, então os dois contam
   como o mesmo assunto — senão o inicial de 2005 fica cobrando para sempre,
   mesmo com a reciclagem feita. A volta é limitada para o caso de alguém
   cadastrar A recicla B e B recicla A. */
function grupoDe(r, tipoId) {
  let id = tipoId;
  for (let volta = 0; volta < 10; volta++) {
    const t = S[r.id].tipos.find(x => x.id === id);
    if (!t || !t.recicla_tipo_id) return id;
    id = t.recicla_tipo_id;
  }
  return id;
}

/* =============== abrir uma tela =============== */
export async function abrirSst(tela) {
  const r = Object.values(RECEITAS).find(x =>
    x.tela === tela || x.telaTipos === tela || x.telaPainel === tela);
  if (!r) return;
  // o #jorImpressao é compartilhado: prévia esquecida aqui sairia na impressão
  // de outra tela
  fecharFicha();
  if (!S.carregado) {
    try { await carregarSst(); }
    catch (e) {
      const alvo = tela === r.telaTipos ? $(r.el.listaTipos)
        : tela === r.telaPainel ? $(r.el.pCards) : $(r.el.tabela);
      alvo.innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`;
      return;
    }
  }
  if (tela === r.telaTipos) desenharTipos(r);
  else if (tela === r.telaPainel) desenharPainel(r);
  else desenharVenc(r);
}

/* =============== cadastro de tipos =============== */
function desenharTipos(r) {
  if (r.id === 'exame') return desenharTiposExame();
  const tipos = S[r.id].tipos;
  $(r.el.listaTipos).innerHTML = tipos.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>${esc(r.rotuloTipo)}</th>
      <th class="ce">${r.id === 'exame' ? 'Refazer a cada' : 'Reciclagem'}</th>
      ${r.completo ? '<th class="ce">Carga horária</th>' : ''}
      <th class="ce">Lançamentos</th><th class="ce">Situação</th><th></th>
    </tr></thead><tbody>
    ${tipos.map(t => {
      const usos = S[r.id].regs.filter(x => x.tipo_id === t.id).length;
      const recicla = t.recicla_tipo_id ? tipoDe(r, t.recicla_tipo_id) : null;
      return `<tr>
        <td><b>${esc(t.nome)}</b>${recicla
          ? `<br><span class="dc-sem">recicla: ${esc(recicla.nome)}</span>` : ''}</td>
        <td class="ce">${t.meses ? t.meses + ' meses' : '<span class="dc-sem">não vence</span>'}</td>
        ${r.completo ? `<td class="ce">${t.carga_horaria ? Number(t.carga_horaria) + ' h' : '—'}</td>` : ''}
        <td class="ce">${usos}</td>
        <td class="ce"><span class="tag ${t.ativo ? 'ativo' : 'inativo'}">${t.ativo ? 'EM USO' : 'DESATIVADO'}</span></td>
        <td class="ce"><button class="btn mini" data-tipo="${t.id}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nenhum tipo cadastrado ainda.</div>';

  $(r.el.listaTipos).querySelectorAll('[data-tipo]').forEach(b =>
    b.addEventListener('click', () => abrirTipo(r, b.dataset.tipo)));
}

/* O exame tem duas naturezas e por isso duas tabelas: o ASO em si e os
   complementares que entram na lista da função. */
function desenharTiposExame() {
  const r = RECEITAS.exame;
  const bloco = (titulo, dica, lista) => `
    <h3 class="sst-bloco">${esc(titulo)}</h3>
    <p class="dica" style="margin:0 0 8px">${esc(dica)}</p>
    ${lista.length ? `<table class="dc-planilha"><thead><tr>
      <th>Exame</th><th class="ce">Refazer a cada</th>
      <th class="ce">Lançamentos</th><th class="ce">Situação</th><th></th>
    </tr></thead><tbody>
    ${lista.map(t => {
      const usos = S.exame.regs.filter(x => x.tipo_id === t.id).length;
      return `<tr>
        <td><b>${esc(t.nome)}</b></td>
        <td class="ce">${t.meses ? t.meses + ' meses' : '<span class="dc-sem">segue o ASO</span>'}</td>
        <td class="ce">${usos}</td>
        <td class="ce"><span class="tag ${t.ativo ? 'ativo' : 'inativo'}">${t.ativo ? 'EM USO' : 'DESATIVADO'}</span></td>
        <td class="ce"><button class="btn mini" data-tipo="${t.id}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nada cadastrado aqui ainda.</div>'}`;

  const asos = S.exame.tipos.filter(t => t.categoria === 'aso');
  const comps = S.exame.tipos.filter(t => t.categoria !== 'aso');

  $(r.el.listaTipos).innerHTML =
    bloco('ASO', 'O atestado em si. A periodicidade calcula o vencimento sozinha.', asos) +
    bloco('Exames complementares',
      'Entram na lista da função. Sem meses, valem enquanto o ASO valer.', comps);

  $(r.el.listaTipos).querySelectorAll('[data-tipo]').forEach(b =>
    b.addEventListener('click', () => abrirTipo(r, b.dataset.tipo)));
}

function abrirTipo(r, id) {
  const t = id ? S[r.id].tipos.find(x => x.id === id) : null;
  editandoTipo[r.id] = t ? { ...t } : { nome: '', meses: null, carga_horaria: null, ativo: true, novo: true };
  const e = editandoTipo[r.id];
  $(r.el.tituloTipo).textContent = t ? `Editar ${r.rotuloTipo.toLowerCase()}` : `Novo tipo de ${r.rotuloTipo.toLowerCase()}`;
  $(r.el.erroTipo).hidden = true;
  $(r.el.tNome).value = e.nome || '';
  $(r.el.tMeses).value = e.meses ?? '';
  if (r.el.tCarga) $(r.el.tCarga).value = e.carga_horaria ?? '';
  if (r.el.tRecicla) {
    // não deixo escolher ele mesmo nem quem já aponta para ele: viraria laço
    const opcoes = S[r.id].tipos.filter(o =>
      o.id !== e.id && grupoDe(r, o.id) !== e.id);
    $(r.el.tRecicla).innerHTML = '<option value="">Nenhum — é um treinamento por si só</option>' +
      opcoes.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');
    $(r.el.tRecicla).value = e.recicla_tipo_id || '';
  }
  if (r.el.tCategoria) $(r.el.tCategoria).value = e.categoria || 'complementar';
  $(r.el.tAtivo).value = e.ativo === false ? '0' : '1';
  $(r.el.tApagar).hidden = !t;
  $(r.el.dlgTipo).showModal();
}

/* =============== vencimentos =============== */
function visiveis(r) {
  const q = so($(r.el.busca).value).toLowerCase();
  const tipo = $(r.el.fTipo).value;
  const status = $(r.el.fStatus).value;
  const sit = $(r.el.fSit).value;
  const historico = $(r.el.historico).checked;

  let regs = S[r.id].regs.filter(x => {
    const f = funcionario(x.funcionario_id);
    if (!f) return false;
    if (sit && f.situacao !== sit) return false;
    if (tipo && grupoDe(r, x.tipo_id) !== grupoDe(r, tipo)) return false;
    if (q && !f.nome.toLowerCase().includes(q)) return false;
    return true;
  });

  // sem histórico: fica só o lançamento mais novo de cada funcionário + grupo
  if (!historico) {
    const vistos = new Set();
    regs = regs.filter(x => {
      const chave = x.funcionario_id + '|' + grupoDe(r, x.tipo_id);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  const comSit = regs.map(x => ({ ...x, sit: situacaoDe(x.vence) }));
  const filtradas = status ? comSit.filter(x => x.sit.faixa === status) : comSit;

  // primeiro o que está mais perto de vencer
  return filtradas.sort((a, b) => {
    const da = a.sit.dias ?? 99999, db = b.sit.dias ?? 99999;
    if (da !== db) return da - db;
    return (funcionario(a.funcionario_id)?.nome || '').localeCompare(funcionario(b.funcionario_id)?.nome || '', 'pt-BR');
  });
}

/* O retrato de hoje: o lançamento mais novo de cada funcionário ativo em cada
   tipo. É a base do resumo da tela de vencimentos e do painel inteiro — se as
   duas contas saíssem de lugares diferentes, uma hora dariam números diferentes.
   Os regs já chegam do banco do mais novo para o mais velho. */
function atuais(r) {
  const vistos = new Set();
  const fora = [];
  S[r.id].regs.forEach(x => {
    const f = funcionario(x.funcionario_id);
    if (!f || f.situacao !== 'ATIVO') return;
    const chave = x.funcionario_id + '|' + grupoDe(r, x.tipo_id);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    fora.push({ ...x, f, sit: situacaoDe(x.vence) });
  });
  return fora.sort((a, b) => {
    const da = a.sit.dias ?? 99999, db = b.sit.dias ?? 99999;
    if (da !== db) return da - db;
    return a.f.nome.localeCompare(b.f.nome, 'pt-BR');
  });
}

/** Quem está ativo e não tem nenhum lançamento — o buraco que o painel não vê. */
function semNenhum(r) {
  const comAlgum = new Set(S[r.id].regs.map(x => x.funcionario_id));
  return estado.funcionarios
    .filter(f => f.situacao === 'ATIVO' && !comAlgum.has(f.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* Dentro do painel, "Em dia" não ajuda: a lista inteira já é do que precisa de
   atenção. Quem está a 45 dias merece ler "Vence em 45 dias". */
function avisoDe(sit) {
  if (sit.faixa === 'vencido' || sit.faixa === 'ate30') return { cor: sit.cor, texto: sit.rotulo };
  return { cor: 'neutra', texto: `Vence em ${sit.dias} dias` };
}

/* =============== painel de alerta =============== */
function desenharPainel(r) {
  const linhas = atuais(r);
  const conta = ch => linhas.filter(x => x.sit.faixa === ch).length;
  const emDia = conta('emdia');
  const semVal = conta('semvalidade');

  /* ---- cartões, um por faixa ---- */
  $(r.el.pCards).innerHTML = FAIXAS.map(fx => {
    const n = conta(fx.chave);
    return `<button type="button" class="pv-card pv-${fx.cor}${n ? '' : ' pv-zero'}" data-faixa="${fx.chave}">
      <span>${esc(fx.rotulo)}</span>
      <strong>${n}</strong>
      <small>${n ? esc(fx.dica) : 'nada aqui'}</small>
    </button>`;
  }).join('') + `
    <button type="button" class="pv-card pv-ok" data-faixa="emdia">
      <span>Em dia</span><strong>${emDia}</strong>
      <small>${semVal ? `+ ${semVal} sem validade` : 'mais de 90 dias'}</small>
    </button>`;

  $(r.el.pCards).querySelectorAll('[data-faixa]').forEach(b =>
    b.addEventListener('click', () => irParaVencimentos(r, b.dataset.faixa)));

  /* ---- a lista que precisa de ação: vencido + 90 dias ---- */
  const urgentes = linhas.filter(x => ['vencido', 'ate30', 'ate60', 'ate90'].includes(x.sit.faixa));
  $(r.el.pAlerta).innerHTML = urgentes.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>${esc(r.rotuloTipo)}</th>
      <th class="ce">Vence</th><th class="ce">Situação</th><th></th>
    </tr></thead><tbody>
    ${urgentes.map(x => {
      const t = tipoDe(r, x.tipo_id) || {};
      const a = avisoDe(x.sit);
      return `<tr>
        <td><b>${esc(x.f.nome)}</b><br><span class="dc-sem">${esc(x.f.cargo || '—')}</span></td>
        <td>${esc(t.nome || '—')}</td>
        <td class="ce">${dataBr(x.vence)}</td>
        <td class="ce"><span class="tag ${a.cor}">${esc(a.texto)}</span></td>
        <td class="ce"><button class="btn mini" data-reg="${x.id}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nada vence nos próximos 90 dias. Tudo em ordem.</div>';

  $(r.el.pAlerta).querySelectorAll('[data-reg]').forEach(b =>
    b.addEventListener('click', () => abrirReg(r, b.dataset.reg)));

  /* ---- o mesmo recorte, agora por tipo ---- */
  const usados = S[r.id].tipos.filter(t => linhas.some(x => grupoDe(r, x.tipo_id) === t.id));
  $(r.el.pTipos).innerHTML = usados.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>${esc(r.rotuloTipo)}</th>
      ${FAIXAS.map(fx => `<th class="ce">${esc(fx.curto)}</th>`).join('')}
      <th class="ce">Em dia</th><th class="ce">Total</th>
    </tr></thead><tbody>
    ${usados.map(t => {
      const dele = linhas.filter(x => grupoDe(r, x.tipo_id) === t.id);
      const c = ch => dele.filter(x => x.sit.faixa === ch).length;
      return `<tr>
        <td><b>${esc(t.nome)}</b></td>
        ${FAIXAS.map(fx => {
          const n = c(fx.chave);
          return `<td class="ce${n ? ' pv-num-' + fx.cor : ' dc-sem'}">${n || '—'}</td>`;
        }).join('')}
        <td class="ce">${c('emdia') + c('semvalidade') || '—'}</td>
        <td class="ce"><b>${dele.length}</b></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nenhum lançamento ainda.</div>';

  /* ---- e quem nem começou ---- */
  const faltando = semNenhum(r);
  const aviso = $(r.el.pSemNada);
  if (faltando.length) {
    aviso.innerHTML = `<b>${faltando.length} funcionário(s) ativo(s) ${esc(r.semNenhum)}:</b> ` +
      faltando.map(f => esc(f.nome)).join(' · ');
    aviso.hidden = false;
  } else aviso.hidden = true;

  $(r.el.pSaida).innerHTML = folhaPainel(r, urgentes, faltando);
}

/** Clicar no cartão leva para a lista já filtrada — o painel aponta, a outra tela resolve. */
function irParaVencimentos(r, faixa) {
  $(r.el.fStatus).value = faixa;
  $(r.el.fSit).value = 'ATIVO';
  $(r.el.busca).value = '';
  $(r.el.fTipo).value = '';
  $(r.el.historico).checked = false;
  abrirModulo('sst', r.tela);
}

function desenharVenc(r) {
  // filtro de tipos
  const sel = $(r.el.fTipo);
  const antes = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    S[r.id].tipos.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  sel.value = antes;

  const linhas = visiveis(r);

  // resumo (conta sempre o último de cada par, sem os filtros de situação)
  const retrato = atuais(r);
  const conta = c => retrato.filter(x => x.sit.chave === c).length;
  $(r.el.resumo).innerHTML = `
    <span class="contagem"><b>${conta('emdia')}</b> em dia</span>
    <span class="contagem"><b>${conta('vencendo')}</b> vencendo</span>
    <span class="contagem"><b>${conta('vencido')}</b> vencido(s)</span>`;

  $(r.el.tabela).innerHTML = linhas.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>${esc(r.rotuloTipo)}</th>
      <th class="ce">Realizado</th><th class="ce">Vence</th>
      ${r.completo ? '<th class="ce">Carga</th><th>Instrutor</th>' : ''}
      <th class="ce">Situação</th><th></th>
    </tr></thead><tbody>
    ${linhas.map(x => {
      const f = funcionario(x.funcionario_id) || {};
      const t = tipoDe(r, x.tipo_id) || {};
      return `<tr>
        <td><b>${esc(f.nome || '—')}</b><br><span class="dc-sem">${esc(f.cargo || '—')}</span></td>
        <td>${esc(t.nome || '—')}</td>
        <td class="ce">${dataBr(x.realizado)}</td>
        <td class="ce">${dataBr(x.vence)}</td>
        ${r.completo ? `<td class="ce">${x.carga_horaria ? Number(x.carga_horaria) + ' h' : '—'}</td>
        <td>${esc(x.instrutor || '—')}</td>` : ''}
        <td class="ce"><span class="tag ${x.sit.cor}">${esc(x.sit.rotulo)}</span>
          ${etiquetaConferencia(r, x, f)}</td>
        <td class="ce"><button class="btn mini" data-reg="${x.id}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nada lançado com esses filtros.</div>';

  $(r.el.tabela).querySelectorAll('[data-reg]').forEach(b =>
    b.addEventListener('click', () => abrirReg(r, b.dataset.reg)));

  // quem ainda não tem nenhum lançamento
  const faltando = semNenhum(r);
  const aviso = $(r.el.semNada);
  if (faltando.length) {
    aviso.innerHTML = `<b>${faltando.length} funcionário(s) ativo(s) sem nenhum ${r.id} lançado:</b> ` +
      faltando.map(f => esc(f.nome)).join(' · ');
    aviso.hidden = false;
  } else aviso.hidden = true;

  $(r.el.saida).innerHTML = montarFolhas(r, linhas);
}

/** "3 de 5 exames" quando o ASO ainda tem exame da função por fazer. */
function etiquetaConferencia(r, x, f) {
  if (r.id !== 'exame') return '';
  const c = conferenciaDo(x, f);
  if (!c || c.completo) return '';
  return `<br><span class="tag alerta">faltam ${c.total - c.feitos} de ${c.total}</span>`;
}

/* =============== lançamento =============== */
function abrirReg(r, id) {
  const x = id ? S[r.id].regs.find(y => y.id === id) : null;
  editando[r.id] = x ? { ...x } : { funcionario_id: '', tipo_id: '', realizado: hoje(), vence: null, novo: true };
  const e = editando[r.id];

  $(r.el.titulo).textContent = x ? `Editar ${r.id}` : `Lançar ${r.id}`;
  $(r.el.erro).hidden = true;

  const ativos = estado.funcionarios.filter(f => f.situacao === 'ATIVO' || f.id === e.funcionario_id);
  $(r.el.func).innerHTML = '<option value="">Escolha...</option>' +
    ativos.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('');
  $(r.el.func).value = e.funcionario_id || '';

  const tipos = S[r.id].tipos.filter(t => t.ativo !== false || t.id === e.tipo_id);
  $(r.el.tipo).innerHTML = '<option value="">Escolha...</option>' +
    tipos.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
  $(r.el.tipo).value = e.tipo_id || '';

  $(r.el.data).value = e.realizado || hoje();
  $(r.el.vence).value = e.vence || '';
  if (r.completo) {
    $(r.el.carga).value = e.carga_horaria ?? '';
    $(r.el.instrutor).value = e.instrutor || '';
    $(r.el.obs).value = e.observacao || '';
  }
  $(r.el.apagar).hidden = !x;
  atualizarVencimento(r, !x);
  if (r.id === 'exame') mostrarItens(r);
  $(r.el.dlg).showModal();
}

/** A lista de exames da função, dentro do lançamento do ASO. */
function mostrarItens(r) {
  const e = editando[r.id] || {};
  desenharItens(e.novo ? null : e.id, $(r.el.func).value, $(r.el.tipo).value);
}

/** Recalcula o vencimento pela periodicidade do tipo. */
function atualizarVencimento(r, forcar) {
  const t = tipoDe(r, $(r.el.tipo).value);
  const data = $(r.el.data).value;
  const dica = $(r.el.dica);

  if (!t) { dica.textContent = ''; return; }
  if (r.completo && forcar && t.carga_horaria && !so($(r.el.carga).value)) {
    $(r.el.carga).value = Number(t.carga_horaria);
  }
  if (!t.meses) {
    dica.textContent = `${t.nome} está cadastrado como sem validade.`;
    if (forcar) $(r.el.vence).value = '';
    return;
  }
  const calculado = somarMeses(data, t.meses);
  dica.textContent = `${t.nome} vale ${t.meses} meses` +
    (calculado ? ` — pelo cadastro venceria em ${dataBr(calculado)}.` : '.');
  if (forcar || !so($(r.el.vence).value)) $(r.el.vence).value = calculado || '';
}

/* =============== folha para imprimir =============== */
const POR_FOLHA = 13;

function montarFolhas(r, linhas) {
  if (!linhas.length) return '';
  const total = Math.ceil(linhas.length / POR_FOLHA);
  const titulo = r.id === 'exame' ? 'EXAMES OCUPACIONAIS' : 'TREINAMENTOS';
  const folhas = [];
  for (let p = 0; p < total; p++) {
    const fatia = linhas.slice(p * POR_FOLHA, (p + 1) * POR_FOLHA);
    folhas.push(`<div class="an-folha">
      <div class="an-topo">
        <img src="${LOGO}" alt="">
        <div class="an-tit">
          <h1>${titulo}</h1>
          <p>Controle de vencimento · ${dataBr(hoje())} · SAKUMA Agronegócios</p>
        </div>
      </div>
      <table class="an-tab sst-folha-tab">
        <colgroup><col><col style="width:48mm"><col style="width:22mm"><col style="width:22mm"><col style="width:28mm"></colgroup>
        <thead><tr><th>FUNCIONÁRIO</th><th>${esc(r.rotuloTipo.toUpperCase())}</th>
          <th>REALIZADO</th><th>VENCE</th><th>SITUAÇÃO</th></tr></thead>
        <tbody>${fatia.map(x => {
          const f = funcionario(x.funcionario_id) || {};
          const t = tipoDe(r, x.tipo_id) || {};
          return `<tr>
            <td class="an-nome">${esc(f.nome || '—')}</td>
            <td>${esc(t.nome || '—')}</td>
            <td class="ce">${dataBr(x.realizado)}</td>
            <td class="ce">${dataBr(x.vence)}</td>
            <td class="ce sst-${x.sit.chave}">${esc(x.sit.chave === 'emdia' ? 'Em dia'
              : x.sit.chave === 'vencido' ? 'Vencido'
              : x.sit.chave === 'vencendo' ? 'A vencer' : 'Sem validade')}${(() => {
                const c = r.id === 'exame' ? conferenciaDo(x, f) : null;
                return c && !c.completo ? `<br><span class="sst-vencendo">faltam ${c.total - c.feitos}</span>` : '';
              })()}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div class="an-pe">
        <span>${linhas.length} lançamento(s)</span>
        <span>${total > 1 ? `folha ${p + 1} de ${total}` : ''}</span>
      </div>
      ${PE_LOP}
    </div>`);
  }
  return folhas.join('');
}

/* A folha do painel. Sem fundo colorido em lugar nenhum: o Chrome imprime
   sem "gráficos de plano de fundo" e a cor viraria papel em branco. Quem
   marca a urgência é a borda e a cor da letra. */
function folhaPainel(r, urgentes, faltando) {
  const conta = ch => urgentes.filter(x => x.sit.faixa === ch).length;
  const caixas = FAIXAS.map(fx => `
    <div class="pn-cx pn-${fx.cor}">
      <b>${conta(fx.chave)}</b>
      <span>${esc(fx.curto.toUpperCase())}</span>
    </div>`).join('');

  const total = Math.max(1, Math.ceil(urgentes.length / POR_FOLHA));
  const folhas = [];
  for (let p = 0; p < total; p++) {
    const fatia = urgentes.slice(p * POR_FOLHA, (p + 1) * POR_FOLHA);
    folhas.push(`<div class="an-folha">
      <div class="an-topo">
        <img src="${LOGO}" alt="">
        <div class="an-tit">
          <h1>${esc(r.tituloFolha)}</h1>
          <p>O que vence nos próximos 90 dias · ${dataBr(hoje())} · SAKUMA Agronegócios</p>
        </div>
      </div>
      ${p === 0 ? `<div class="pn-resumo">${caixas}</div>` : ''}
      ${fatia.length ? `<table class="an-tab sst-folha-tab">
        <colgroup><col><col style="width:46mm"><col style="width:24mm"><col style="width:22mm"><col style="width:26mm"></colgroup>
        <thead><tr><th>FUNCIONÁRIO</th><th>${esc(r.rotuloTipo.toUpperCase())}</th>
          <th>VENCE</th><th>DIAS</th><th>SITUAÇÃO</th></tr></thead>
        <tbody>${fatia.map(x => {
          const t = tipoDe(r, x.tipo_id) || {};
          const fx = FAIXAS.find(y => y.chave === x.sit.faixa);
          return `<tr>
            <td class="an-nome">${esc(x.f.nome)}</td>
            <td>${esc(t.nome || '—')}</td>
            <td class="ce">${dataBr(x.vence)}</td>
            <td class="ce">${x.sit.dias < 0 ? `há ${-x.sit.dias}` : x.sit.dias}</td>
            <td class="ce pn-${fx ? fx.cor : 'calma'}">${esc(fx ? fx.curto : '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="pn-nada">Nada vence nos próximos 90 dias.</p>'}
      ${p === total - 1 && faltando.length ? `<p class="pn-obs"><b>Sem nenhum lançamento
        (${faltando.length}):</b> ${faltando.map(f => esc(f.nome)).join(' · ')}</p>` : ''}
      <div class="an-pe">
        <span>${urgentes.length} lançamento(s) a vencer</span>
        <span>${total > 1 ? `folha ${p + 1} de ${total}` : ''}</span>
      </div>
      ${PE_LOP}
    </div>`);
  }
  return folhas.join('');
}

/* =============== relatório de uma pessoa só ===============
   As telas de Vencimentos olham a empresa inteira. Este documento vira o
   retrato de uma pessoa: o que vale hoje em cada tipo e, nos exames, o que a
   função exige e ela nunca fez. A folha em si está no sst-ficha.js — aqui só
   se monta o que ela precisa saber. */

/* Enquanto a folha de uma pessoa está na prévia, a barra da lista sai do ar:
   as duas juntas empilhariam dois rodapés, e o "Imprimir" de lá mandaria a
   lista inteira e a folha da pessoa na mesma impressão. */
function fecharFicha() {
  fecharFichaSst();
  Object.values(RECEITAS).forEach(x => {
    const b = $(x.el.barraLista);
    if (b) b.hidden = false;
  });
}

/** O vigente de cada tipo para uma pessoa, do mais urgente para o menos. */
function vigentesDa(r, funcionarioId) {
  // os regs já chegam do banco do mais novo para o mais velho
  const dela = S[r.id].regs.filter(x => x.funcionario_id === funcionarioId);
  const vistos = new Set();
  const vigentes = [];
  dela.forEach(x => {
    const chave = grupoDe(r, x.tipo_id);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    vigentes.push(x);
  });
  return { todos: dela, vigentes };
}

/** Monta a folha de uma pessoa e joga na prévia. */
function gerarFicha(r, funcionarioId) {
  const f = funcionario(funcionarioId);
  if (!f) return;
  const { todos, vigentes } = vigentesDa(r, funcionarioId);

  const linhas = vigentes
    .map(x => ({ ...x, sit: situacaoDe(x.vence) }))
    .sort((a, b) => {
      const da = a.sit.dias ?? 99999, db = b.sit.dias ?? 99999;
      if (da !== db) return da - db;
      const ta = tipoDe(r, a.tipo_id)?.nome || '', tb = tipoDe(r, b.tipo_id)?.nome || '';
      return ta.localeCompare(tb, 'pt-BR');
    })
    .map(x => ({
      nome: tipoDe(r, x.tipo_id)?.nome || '—',
      realizado: x.realizado,
      vence: x.vence,
      sit: x.sit,
      carga: x.carga_horaria,
      instrutor: x.instrutor,
      observacao: x.observacao,
      conferencia: r.id === 'exame' ? conferenciaDo(x, f) : null,
    }));

  // pendência é coisa de exame: treinamento não tem lista por função no app
  const pend = r.id === 'exame' ? pendenciasDe(f, todos) : { lista: [], semLista: false };

  const html = documentoFichaSst({
    tipo: r.id,
    funcionario: f,
    linhas,
    pendencias: pend.lista.map(t => ({ nome: t.nome })),
    funcaoSemLista: pend.semLista,
  });

  verFichaSst(html, `Ficha de ${r.id === 'exame' ? 'exames' : 'treinamentos'} - ${f.nome || ''}`,
    r.el.barraFicha);
  const barraLista = $(r.el.barraLista);
  if (barraLista) barraLista.hidden = true;
}

/** O diálogo de escolher a pessoa. É um só, servindo as duas telas. */
let receitaDaFicha = null;

function abrirEscolhaFicha(r) {
  receitaDaFicha = r;
  const sel = $('fsFunc');
  const ativos = estado.funcionarios.filter(f => f.situacao === 'ATIVO')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const outros = estado.funcionarios.filter(f => f.situacao !== 'ATIVO')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // quem está na busca da tela já vem escolhido — o caminho mais comum é
  // procurar a pessoa na lista e querer a folha dela
  const busca = so($(r.el.busca).value).toLowerCase();
  const achado = busca
    ? [...ativos, ...outros].find(f => f.nome.toLowerCase().includes(busca))
    : null;

  const grupo = (rotulo, lista) => lista.length
    ? `<optgroup label="${esc(rotulo)}">${lista.map(f =>
        `<option value="${f.id}">${esc(f.nome)}${f.cargo ? ` — ${esc(f.cargo)}` : ''}</option>`)
        .join('')}</optgroup>`
    : '';

  sel.innerHTML = grupo('Ativos', ativos) + grupo('Inativos', outros);
  sel.value = achado ? achado.id : (ativos[0]?.id || outros[0]?.id || '');

  $('fsTitulo').textContent = r.id === 'exame'
    ? 'Relatório de exames do funcionário' : 'Relatório de treinamentos do funcionário';
  $('fsDica').textContent = r.id === 'exame'
    ? 'Sai uma folha A4 com o exame mais recente de cada tipo, a situação de cada um e os exames que a função exige e nunca foram lançados.'
    : 'Sai uma folha A4 com o treinamento mais recente de cada tipo, com carga horária, instrutor e a situação de cada um.';
  $('dlgFichaSst').showModal();
}

/* =============== ligações =============== */
function ligarReceita(r, avisar) {
  // filtros
  [r.el.busca, r.el.fTipo, r.el.fStatus, r.el.fSit, r.el.historico].forEach(id =>
    $(id).addEventListener('input', () => desenharVenc(r)));

  // painel
  $(r.el.pImprimir).addEventListener('click', () => window.print());
  $(r.el.pZoom).addEventListener('input', () => {
    const z = $(r.el.pZoom).value;
    $(r.el.pZoomV).textContent = z + '%';
    $(r.el.pSaida).style.transform = `scale(${z / 100})`;
    $(r.el.pSaida).style.transformOrigin = 'top center';
  });

  $(r.el.novo).addEventListener('click', () => abrirReg(r, null));
  $(r.el.novoTipo).addEventListener('click', () => abrirTipo(r, null));

  // relatório de uma pessoa só
  $(r.el.ficha).addEventListener('click', () => abrirEscolhaFicha(r));
  $(r.el.fichaImprimir).addEventListener('click', imprimirFichaSst);
  $(r.el.fichaFechar).addEventListener('click', fecharFicha);
  $(r.el.imprimir).addEventListener('click', () => window.print());
  $(r.el.zoom).addEventListener('input', () => {
    const z = $(r.el.zoom).value;
    $(r.el.zoomV).textContent = z + '%';
    $(r.el.saida).style.transform = `scale(${z / 100})`;
    $(r.el.saida).style.transformOrigin = 'top center';
  });

  $(r.el.tipo).addEventListener('change', () => {
    atualizarVencimento(r, true);
    if (r.id === 'exame') mostrarItens(r);
  });
  $(r.el.data).addEventListener('change', () => atualizarVencimento(r, true));
  if (r.id === 'exame') $(r.el.func).addEventListener('change', () => mostrarItens(r));

  /* ---- salvar lançamento ---- */
  $(r.el.form).addEventListener('submit', async ev => {
    ev.preventDefault();
    const e = editando[r.id];
    if (!e) return;
    const linha = {
      funcionario_id: $(r.el.func).value,
      tipo_id: $(r.el.tipo).value,
      realizado: $(r.el.data).value,
      vence: $(r.el.vence).value || null,
    };
    if (!linha.funcionario_id || !linha.tipo_id || !linha.realizado) {
      return mostrarErro(r.el.erro, 'Escolha o funcionário, o tipo e a data.');
    }
    if (r.completo) {
      linha.carga_horaria = so($(r.el.carga).value) ? Number($(r.el.carga).value) : null;
      linha.instrutor = so($(r.el.instrutor).value) || null;
      linha.observacao = so($(r.el.obs).value) || null;
    }
    if (!e.novo) linha.id = e.id;

    const { data, error } = await estado.cliente.from(r.tabelaRegs)
      .upsert(linha).select().single();
    if (error) return mostrarErro(r.el.erro, error.message);

    const i = S[r.id].regs.findIndex(x => x.id === data.id);
    if (i >= 0) S[r.id].regs[i] = data; else S[r.id].regs.unshift(data);
    S[r.id].regs.sort((a, b) => String(b.realizado).localeCompare(String(a.realizado)));

    if (r.id === 'exame') {
      try { await salvarItens(data.id); }
      catch (err) { return mostrarErro(r.el.erro, 'O ASO foi salvo, mas a marcação dos exames não: ' + err.message); }
    }
    $(r.el.dlg).close();
    desenharVenc(r);
    desenharPainel(r);
    avisar(`${r.id === 'exame' ? 'Exame' : 'Treinamento'} salvo.`);
  });

  $(r.el.apagar).addEventListener('click', async () => {
    const e = editando[r.id];
    if (!e?.id) return;
    if (!confirm('Apagar este lançamento?')) return;
    const { error } = await estado.cliente.from(r.tabelaRegs).delete().eq('id', e.id);
    if (error) return mostrarErro(r.el.erro, error.message);
    S[r.id].regs = S[r.id].regs.filter(x => x.id !== e.id);
    $(r.el.dlg).close();
    desenharVenc(r);
    desenharPainel(r);
  });

  /* ---- salvar tipo ---- */
  $(r.el.formTipo).addEventListener('submit', async ev => {
    ev.preventDefault();
    const e = editandoTipo[r.id];
    if (!e) return;
    const linha = {
      nome: so($(r.el.tNome).value),
      meses: so($(r.el.tMeses).value) ? Number($(r.el.tMeses).value) : null,
      ativo: $(r.el.tAtivo).value === '1',
    };
    if (!linha.nome) return mostrarErro(r.el.erroTipo, 'Falta o nome.');
    if (r.el.tCarga) {
      linha.carga_horaria = so($(r.el.tCarga).value) ? Number($(r.el.tCarga).value) : null;
    }
    if (r.el.tCategoria) linha.categoria = $(r.el.tCategoria).value;
    if (r.el.tRecicla) linha.recicla_tipo_id = $(r.el.tRecicla).value || null;
    if (!e.novo) linha.id = e.id;

    const { data, error } = await estado.cliente.from(r.tabelaTipos)
      .upsert(linha).select().single();
    if (error) return mostrarErro(r.el.erroTipo, error.message);

    const i = S[r.id].tipos.findIndex(x => x.id === data.id);
    if (i >= 0) S[r.id].tipos[i] = data; else S[r.id].tipos.push(data);
    $(r.el.dlgTipo).close();
    desenharTipos(r);
  });

  $(r.el.tApagar).addEventListener('click', async () => {
    const e = editandoTipo[r.id];
    if (!e?.id) return;
    const usos = S[r.id].regs.filter(x => x.tipo_id === e.id).length;
    if (usos) {
      return mostrarErro(r.el.erroTipo,
        `Este tipo tem ${usos} lançamento(s). Desative em vez de apagar, senão o histórico se perde.`);
    }
    if (!confirm(`Apagar "${e.nome}"?`)) return;
    const { error } = await estado.cliente.from(r.tabelaTipos).delete().eq('id', e.id);
    if (error) return mostrarErro(r.el.erroTipo, error.message);
    S[r.id].tipos = S[r.id].tipos.filter(x => x.id !== e.id);
    $(r.el.dlgTipo).close();
    desenharTipos(r);
  });
}

function mostrarErro(id, texto) {
  const a = $(id);
  a.textContent = texto;
  a.hidden = false;
}

export function ligarSst(avisar = () => {}) {
  Object.values(RECEITAS).forEach(r => ligarReceita(r, avisar));

  // o diálogo de escolher a pessoa é um só para as duas telas
  $('formFichaSst').addEventListener('submit', ev => {
    ev.preventDefault();
    const r = receitaDaFicha;
    const id = $('fsFunc').value;
    if (!r || !id) return;
    $('dlgFichaSst').close();
    gerarFicha(r, id);
  });
}
