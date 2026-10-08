// rh-salario-digno.js — RH › Salário digno (07/10/2026)
//
// Trazido do LOP ERP (doc 07 · RN-111, RN-145, RF-73, RN-124 a 128). Compara a
// remuneração de cada FUNÇÃO + FAIXA em uso com o benchmark de salário digno.
// Decisões dele (07/10/2026 — não reabrir sem ele pedir):
//  · Linha = função do plano + faixa que algum funcionário ATIVO ocupa hoje.
//    Função ou faixa sem ninguém não entra. O valor é o da TABELA (rh_cargos),
//    não o salário da pessoa — por isso o grupo mínimo n ≥ 3 não se aplica.
//  · Entram todas as funções, menos gerência (rh_cargos.salario_digno = false
//    para Diretor e Gerentes; editável em Configurações).
//  · Remuneração = faixa + ticket fixo + transporte/moradia fixo (RN-145: os
//    fixos valem SÓ aqui; no resto do app nada muda).
//  · Situação: Não atende (gap < 0) pede plano de ação; Atenção (gap ≥ 0 e
//    abaixo da margem %); Atende.
//  · Parâmetros com vigência (início/fim/valor): alterar encerra o período
//    anterior e abre outro.
//  · Foto de hoje + fotos salvas (rh_sd_fotos congela o quadro).
//  · Plano de ação: ação, responsável, prazo, valor proposto, custo, situação,
//    acompanhamento; quando a linha passa a atender o app avisa e ele confirma.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { mostrar } from './jornada-relatorios.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- datas e números ---------------- */
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const diaAntes = s => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const brl = v => v == null || !isFinite(v) ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pctTxt = v => v == null || !isFinite(v) ? '—'
  : `${v >= 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const num2 = v => v == null || !isFinite(v) ? '' : Number(v).toFixed(2).replace('.', ',');
function lerValor(v, zeroOk = false) {
  let s = String(v ?? '').trim().replace(/[R$%\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && (n > 0 || (zeroOk && n === 0)) ? Math.round(n * 100) / 100 : null;
}
const quem = () => estado.sessao?.user?.email || null;

/* ---------------- o olho (mesma senha do Plano de cargos) ---------------- */
const SENHA_SALARIO = 'sk123';
const OCULTO = '<span class="rh-oculto">••••••</span>';
let aberto = false;
const V = v => aberto ? brl(v) : OCULTO;

/* ---------------- cadastros fixos ---------------- */
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const COLUNA = { A: 'faixa_a', B: 'faixa_media', C: 'faixa_c', D: 'faixa_d', E: 'faixa_e' };
const PARAMS = [
  { chave: 'benchmark', nome: 'Benchmark do salário digno (MG)', un: 'R$', dica: 'Remuneração mínima considerada digna. Fonte e revisão semestral (RN-111).' },
  { chave: 'ticket', nome: 'Ticket alimentação (fixo)', un: 'R$', dica: 'Igual para todas as funções; vale só nesta conta (RN-145).' },
  { chave: 'transporte_moradia', nome: 'Transporte / moradia (fixo)', un: 'R$', dica: 'Igual para todas as funções; vale só nesta conta (RN-145).' },
  { chave: 'margem_pct', nome: 'Margem de atenção', un: '%', dica: 'Função que atende, mas fica menos que este % acima do benchmark, aparece em Atenção.' },
];
const ACOES = {
  subir_faixa: 'Subir o valor da faixa na tabela',
  mover_faixa: 'Mover as pessoas para outra faixa',
  reajuste: 'Reajuste geral',
  outro: 'Outro',
};
const SITS = {
  aberto: ['Aberto', 'alerta'], andamento: ['Em andamento', 'neutra'],
  concluido: ['Concluído', 'ativo'], cancelado: ['Cancelado', 'inativo'],
};
const SITUACAO_LINHA = {
  nao: ['Não atende', 'perigo'], atencao: ['Atenção', 'alerta'], atende: ['Atende', 'ativo'], semvalor: ['Sem valor na tabela', 'neutra'],
};

const S = { carregado: false, cargos: [], params: [], planos: [], andamentos: [], fotos: [],
  filtro: '', nivel: '', filtroPlano: 'abertos', ctx: {} };

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const [cg, pr, pl, an, ft] = await Promise.all([
    c.from('rh_cargos').select('*').order('ordem').order('nome'),
    c.from('rh_sd_parametros').select('*').order('inicio'),
    c.from('rh_sd_planos').select('*').order('criado_em', { ascending: false }),
    c.from('rh_sd_andamentos').select('*').order('criado_em'),
    c.from('rh_sd_fotos').select('id,data,motivo,criado_por,criado_em,quadro,parametros').order('criado_em', { ascending: false }),
    jd.dados.carregado ? null : jd.carregar(),
  ]);
  for (const r of [cg, pr, pl, an, ft]) if (r.error) throw r.error;
  S.cargos = cg.data || []; S.params = pr.data || []; S.planos = pl.data || [];
  S.andamentos = an.data || []; S.fotos = ft.data || [];
  S.carregado = true;
}

/* ===================================================================
   A CONTA (uma fonte só para tela, relatório, Excel e foto)
   =================================================================== */
/** Registro de parâmetro que vale na data (o de maior início, dentro do período). */
export const paramReg = (chave, data = hoje()) => S.params
  .filter(p => p.chave === chave && p.inicio <= data && (!p.fim || p.fim >= data))
  .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null;
const param = (chave, data) => { const r = paramReg(chave, data); return r ? Number(r.valor) : null; };
export const parametros = (data = hoje()) => ({
  benchmark: param('benchmark', data), ticket: param('ticket', data) ?? 0,
  transporte: param('transporte_moradia', data) ?? 0, margem: (param('margem_pct', data) ?? 0) / 100,
  bench: paramReg('benchmark', data),
});

const cargoPorId = id => S.cargos.find(c => c.id === id) || null;
const valorFaixa = (cargo, L) => { const v = cargo ? Number(cargo[COLUNA[L]]) : NaN; return isFinite(v) && v > 0 ? v : null; };
const ativos = () => (estado.funcionarios || []).filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const chaveLinha = (cargoId, faixa) => `${cargoId}|${faixa}`;

/** Classifica um gap: nao | atencao | atende | semvalor. */
export function classificar(gap, gapPct, margem) {
  if (gap == null) return 'semvalor';
  if (gap < 0) return 'nao';
  return gapPct < margem ? 'atencao' : 'atende';
}

/**
 * O quadro: uma linha por função do plano + faixa em uso por ativos.
 * Também devolve quem falta enquadrar (sem função do plano, sem faixa).
 */
export function quadro() {
  const p = parametros();
  const grupos = new Map();
  const falta = { semFuncao: [], semFaixa: [], foraDoPlano: [] };
  for (const f of ativos()) {
    const v = jd.vinculoDe(f.id), fn = jd.funcaoDe(v);
    if (!fn) { falta.semFuncao.push({ f, txt: f.cargo || 'sem função' }); continue; }
    const cargo = cargoPorId(fn.rh_cargo_id);
    if (!cargo) {
      // Função ativa fora do plano (ex.: Vaqueiro) é escolha dele; função genérica inativa ainda precisa de enquadramento.
      (fn.ativo === false ? falta.semFuncao : falta.foraDoPlano).push({ f, txt: fn.nome });
      continue;
    }
    if (cargo.salario_digno === false) continue;          // gerência fica de fora
    if (!v.faixa) { falta.semFaixa.push({ f, txt: cargo.nome }); continue; }
    const k = chaveLinha(cargo.id, v.faixa);
    if (!grupos.has(k)) grupos.set(k, { cargo, faixa: v.faixa, pessoas: [] });
    grupos.get(k).pessoas.push(f);
  }
  const linhas = [...grupos.values()].map(g => {
    const valor = valorFaixa(g.cargo, g.faixa);
    const remun = valor == null ? null : valor + p.ticket + p.transporte;
    const gap = remun == null || p.benchmark == null ? null : remun - p.benchmark;
    const gapPct = gap == null ? null : gap / p.benchmark;
    const sit = classificar(gap, gapPct, p.margem);
    return { ...g, chave: chaveLinha(g.cargo.id, g.faixa), valor, remun, gap, gapPct, sit,
      plano: planoDaLinha(g.cargo.id, g.faixa) };
  }).sort((a, b) => (a.cargo.ordem ?? 99) - (b.cargo.ordem ?? 99) || a.faixa.localeCompare(b.faixa));
  return { p, linhas, falta };
}

const vivo = pl => pl.situacao === 'aberto' || pl.situacao === 'andamento';
const planoDaLinha = (cargoId, faixa) => {
  const da = S.planos.filter(pl => pl.rh_cargo_id === cargoId && pl.faixa === faixa);
  return da.find(vivo) || da[0] || null;
};
/** Valor mínimo que a faixa precisa para atender o benchmark. */
const minimoParaAtender = p => p.benchmark == null ? null : Math.max(0, p.benchmark - p.ticket - p.transporte);

/** Plano vivo cuja linha já atende (ou ficou sem ninguém): pede confirmação. */
function resolvido(pl, q) {
  if (!vivo(pl)) return null;
  const l = q.linhas.find(x => x.chave === chaveLinha(pl.rh_cargo_id, pl.faixa));
  if (!l) return 'Ninguém mais ocupa esta função e faixa.';
  if (l.sit === 'atende' || l.sit === 'atencao') return `A linha passou a atender (gap ${pctTxt(l.gapPct)}).`;
  return null;
}

/* ===================================================================
   MOLDURA DE DOCUMENTO E CSV
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo, paisagem }) {
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
function baixarCsv(nome, linhas) {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + linhas.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ===================================================================
   DIÁLOGO E SENHA
   =================================================================== */
function dialogo(html, ligar, largo = false) {
  let d = $('dlgSd');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgSd'; document.body.appendChild(d); }
  d.classList.toggle('rs-largo', largo);
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgSd')?.open && $('dlgSd').close();

function pedirSenha(depois) {
  if (aberto) { depois(); return; }
  dialogo(`<h3>Mostrar os valores</h3>
    <p class="dica">Os valores das faixas ficam escondidos. Digite a senha para abrir (a mesma do Plano de cargos).</p>
    <div class="aviso erro" id="sdSenhaErro" hidden></div>
    <label class="campo plena">Senha<input type="password" id="sdSenha" autocomplete="off"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="sdSenhaOk">Mostrar</button></div>`, d => {
    const ok = () => {
      if ($('sdSenha').value.trim() !== SENHA_SALARIO) {
        $('sdSenhaErro').textContent = 'Senha incorreta.'; $('sdSenhaErro').hidden = false; $('sdSenha').focus(); return;
      }
      aberto = true; d.close(); depois();
    };
    $('sdSenhaOk').addEventListener('click', ok);
    $('sdSenha').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    $('sdSenha').focus();
  });
}
const botaoOlho = id => `<button class="btn olho" type="button" id="${id}" aria-pressed="${aberto}">${aberto ? 'Esconder valores' : 'Mostrar valores'}</button>`;
const ligarOlho = (id, redesenhar) => $(id)?.addEventListener('click', () => {
  if (aberto) { aberto = false; redesenhar(); } else pedirSenha(redesenhar);
});

/* Selo do benchmark: provisório, fonte e próxima revisão. */
function seloBenchmark(p) {
  const b = p.bench;
  if (!b) return '<div class="aviso erro">Benchmark não cadastrado. Informe em Configurações.</div>';
  const rev = b.proxima_revisao;
  const atrasada = rev && rev < hoje();
  return `<div class="sd-selo${b.provisorio ? ' sd-prov' : ''}">
    <div><span>Benchmark salário digno · MG</span><strong>${brl(Number(b.valor))}</strong>
      ${b.provisorio ? '<span class="tag alerta">PROVISÓRIO</span>' : '<span class="tag ativo">confirmado</span>'}</div>
    <small>${esc(b.fonte || 'fonte não informada')} · vale desde ${br(b.inicio)}
      · ${rev ? `próxima revisão ${br(rev)}${atrasada ? ' <b class="sd-atraso">(vencida)</b>' : ''}` : 'próxima revisão não registrada'}</small>
    <small>Composição: faixa da tabela + ticket ${brl(p.ticket)} + transporte/moradia ${brl(p.transporte)}
      · atenção abaixo de +${(p.margem * 100).toLocaleString('pt-BR')}%</small>
  </div>`;
}

/* ===================================================================
   TELA · FUNÇÕES (o quadro)
   =================================================================== */
function desenharQuadro() {
  const tela = $('telaSdQuadro');
  const q = quadro();
  const conta = k => q.linhas.filter(l => l.sit === k).length;
  const lista = q.linhas.filter(l => (!S.filtro || l.sit === S.filtro || (S.filtro === 'semplano' && l.sit === 'nao' && !(l.plano && vivo(l.plano))))
    && (!S.nivel || l.cargo.nivel === S.nivel));
  const vivos = S.planos.filter(vivo);
  const vencidos = vivos.filter(pl => pl.prazo && pl.prazo < hoje()).length;
  const pessoasNoQuadro = q.linhas.reduce((t, l) => t + l.pessoas.length, 0);
  const nFalta = q.falta.semFuncao.length + q.falta.semFaixa.length;
  const niveis = [...new Set(S.cargos.filter(c => c.salario_digno !== false).map(c => c.nivel).filter(Boolean))];

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Salário digno · funções</h2>
        <p class="dica" style="margin:2px 0 0">Cada função e faixa em uso hoje, comparada com o benchmark. Gerência fica de fora.</p></div>
      <span class="acoes">${botaoOlho('sdOlho')}
        <button class="btn" type="button" id="sdFoto">Salvar foto</button>
        <button class="btn" type="button" id="sdRel">Relatório</button>
        <button class="btn mini" type="button" id="sdCsv">Excel</button></span>
    </div>
    ${seloBenchmark(q.p)}
    <div class="rs-kpis">
      <div><span>Linhas avaliadas</span><strong>${q.linhas.length}</strong><small>${pessoasNoQuadro} pessoa(s) enquadrada(s)</small></div>
      <div class="sd-k-ok"><span>Atendem</span><strong>${conta('atende')}</strong><small>acima da margem</small></div>
      <div class="sd-k-at"><span>Atenção</span><strong>${conta('atencao')}</strong><small>perto do limite</small></div>
      <div class="${conta('nao') ? 'rs-alerta' : ''}"><span>Não atendem</span><strong>${conta('nao')}</strong><small>precisam de plano de ação</small></div>
      <div><span>Planos abertos</span><strong>${vivos.length}</strong><small>${vencidos ? `<b class="sd-atraso">${vencidos} com prazo vencido</b>` : 'nenhum vencido'}</small></div>
    </div>
    ${nFalta ? `<details class="sd-falta" ${q.linhas.length ? '' : 'open'}><summary><b>Falta enquadrar: ${nFalta} pessoa(s)</b>
        — só entra no quadro quem tem função do plano <b>e</b> faixa no cadastro.</summary>
      ${q.falta.semFaixa.length ? `<p class="sd-falta-t">Sem faixa (${q.falta.semFaixa.length})</p><div class="sd-chips">${q.falta.semFaixa.map(x => chipPessoa(x)).join('')}</div>` : ''}
      ${q.falta.semFuncao.length ? `<p class="sd-falta-t">Sem função do plano (${q.falta.semFuncao.length})</p><div class="sd-chips">${q.falta.semFuncao.map(x => chipPessoa(x)).join('')}</div>` : ''}
      ${q.falta.foraDoPlano.length ? `<p class="dica">Função fora do plano, por escolha (não entram): ${q.falta.foraDoPlano.map(x => esc(x.f.nome) + ' · ' + esc(x.txt)).join(', ')}.</p>` : ''}
      <p class="dica">Clique no nome para abrir o cadastro e preencher a função e a faixa.</p></details>` : ''}
    <div class="barra">
      <label class="campo">Mostrar<select id="sdFiltro">${[['', 'Todas'], ['nao', 'Não atendem'], ['semplano', 'Não atendem, sem plano'], ['atencao', 'Atenção'], ['atende', 'Atendem']]
        .map(([k, t]) => `<option value="${k}" ${k === S.filtro ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Nível<select id="sdNivel"><option value="">Todos</option>${niveis.map(n => `<option ${n === S.nivel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    </div>
    <div class="rolagem sd-rola" style="margin-top:12px">
    <table class="dc-planilha sd-tab"><thead><tr><th>Função</th><th class="ce">Faixa</th><th class="ce">Pessoas</th>
      <th class="ce">Valor da faixa</th><th class="ce">+ Ticket</th><th class="ce">+ Transp./moradia</th><th class="ce">Remuneração</th>
      <th class="ce">Benchmark</th><th class="ce">Gap</th><th class="ce">Situação</th><th>Plano de ação</th></tr></thead><tbody>
      ${lista.map(l => `<tr class="sd-l-${l.sit}">
        <td><b>${esc(l.cargo.nome)}</b><br><span class="dc-sem">${esc(l.cargo.nivel || '')}</span></td>
        <td class="ce"><b>${l.faixa}</b></td>
        <td class="ce"><span title="${esc(l.pessoas.map(f => f.nome).join(', '))}">${l.pessoas.length}</span></td>
        <td class="ce">${l.valor != null ? V(l.valor) : '—'}</td>
        <td class="ce">${brl(q.p.ticket)}</td><td class="ce">${brl(q.p.transporte)}</td>
        <td class="ce"><b>${l.remun != null ? V(l.remun) : '—'}</b></td>
        <td class="ce">${brl(q.p.benchmark)}</td>
        <td class="ce">${l.gap != null ? `${V(l.gap)}<br><span class="dc-sem">${aberto ? pctTxt(l.gapPct) : ''}</span>` : '—'}</td>
        <td class="ce"><span class="tag ${SITUACAO_LINHA[l.sit][1]}">${SITUACAO_LINHA[l.sit][0]}</span></td>
        <td>${celulaPlano(l)}</td></tr>`).join('')
        || `<tr><td colspan="11" class="vazio">${q.linhas.length ? 'Nenhuma linha neste filtro.' : 'Nenhuma função e faixa em uso ainda. Enquadre as pessoas (função do plano + faixa) no cadastro.'}</td></tr>`}
    </tbody></table></div>
    <p class="dica" style="margin-top:10px">A conta usa o valor da faixa na tabela do Plano de cargos, não o salário de cada pessoa.
      Passe o mouse sobre o número de pessoas para ver os nomes.</p>

    <h3 class="rs-h3">Fotos salvas</h3>
    <div class="rolagem sd-rola"><table class="dc-planilha rs-mini"><thead><tr><th>Data</th><th>Motivo</th><th class="ce">Linhas</th><th class="ce">Não atendem</th><th>Salva por</th><th></th></tr></thead><tbody>
      ${S.fotos.map(ft => `<tr><td>${br(ft.data)}</td><td>${esc(ft.motivo)}</td><td class="ce">${(ft.quadro || []).length}</td>
        <td class="ce">${(ft.quadro || []).filter(l => l.sit === 'nao').length}</td><td class="dc-sem">${esc(ft.criado_por || '')}</td>
        <td class="ce"><button class="btn mini" type="button" data-sd-foto="${ft.id}">Ver</button>
          <button class="btn mini" type="button" data-sd-foto-csv="${ft.id}">Excel</button></td></tr>`).join('')
        || '<tr><td colspan="6" class="vazio">Nenhuma foto salva. Use "Salvar foto" na auditoria ou na revisão semestral para comparar depois.</td></tr>'}
    </tbody></table></div>
  </div>`;

  $('sdFiltro').addEventListener('change', e => { S.filtro = e.target.value; desenharQuadro(); });
  $('sdNivel').addEventListener('change', e => { S.nivel = e.target.value; desenharQuadro(); });
  ligarOlho('sdOlho', desenharQuadro);
  tela.querySelectorAll('[data-sd-pessoa]').forEach(b => b.addEventListener('click', () => abrirCadastro(b.dataset.sdPessoa)));
  tela.querySelectorAll('[data-sd-criar]').forEach(b => b.addEventListener('click', () => {
    const [cid, fx] = b.dataset.sdCriar.split('|');
    pedirSenha(() => { desenharQuadro(); formPlano(null, { cargoId: cid, faixa: fx }); });
  }));
  tela.querySelectorAll('[data-sd-ver-plano]').forEach(b => b.addEventListener('click', () => pedirSenha(() => { desenharQuadro(); verPlano(b.dataset.sdVerPlano); })));
  $('sdRel').addEventListener('click', () => pedirSenha(() => { desenharQuadro(); mostrar(relQuadro(fotografar(q), q.p, 'Situação de hoje'), { barra: true }); }));
  $('sdCsv').addEventListener('click', () => pedirSenha(() => { desenharQuadro(); csvQuadro(fotografar(q), `Salario_digno_${hoje()}.csv`); }));
  $('sdFoto').addEventListener('click', () => pedirSenha(() => { desenharQuadro(); formFoto(q); }));
  tela.querySelectorAll('[data-sd-foto]').forEach(b => b.addEventListener('click', () => pedirSenha(() => {
    desenharQuadro();
    const ft = S.fotos.find(x => x.id === b.dataset.sdFoto);
    mostrar(relQuadro(ft.quadro, ft.parametros, `Foto de ${br(ft.data)} · ${ft.motivo}`), { barra: true });
  })));
  tela.querySelectorAll('[data-sd-foto-csv]').forEach(b => b.addEventListener('click', () => pedirSenha(() => {
    desenharQuadro();
    const ft = S.fotos.find(x => x.id === b.dataset.sdFotoCsv);
    csvQuadro(ft.quadro, `Salario_digno_foto_${ft.data}.csv`);
  })));
}

const chipPessoa = x => `<button type="button" class="sd-chip" data-sd-pessoa="${x.f.id}">${esc(x.f.nome)}<small>${esc(x.txt)}</small></button>`;

function celulaPlano(l) {
  const pl = l.plano;
  if (pl && vivo(pl)) {
    const venc = pl.prazo && pl.prazo < hoje();
    return `<button class="btn mini" type="button" data-sd-ver-plano="${pl.id}">Ver plano</button>
      <span class="tag ${SITS[pl.situacao][1]}">${SITS[pl.situacao][0]}</span>
      ${pl.prazo ? `<br><span class="dc-sem${venc ? ' sd-atraso' : ''}">prazo ${br(pl.prazo)}${venc ? ' · vencido' : ''}</span>` : ''}`;
  }
  if (l.sit === 'nao') return `<button class="btn mini principal" type="button" data-sd-criar="${l.cargo.id}|${l.faixa}">Criar plano de ação</button>
    ${pl ? `<br><span class="dc-sem">último: ${SITS[pl.situacao][0].toLowerCase()}</span>` : ''}`;
  if (pl) return `<button class="btn mini" type="button" data-sd-ver-plano="${pl.id}">${SITS[pl.situacao][0]}</button>`;
  return l.sit === 'atencao' ? `<button class="btn mini" type="button" data-sd-criar="${l.cargo.id}|${l.faixa}">Criar plano</button>` : '<span class="dc-sem">—</span>';
}

function abrirCadastro(fid) {
  if (!S.ctx.abrirFuncionario) return;
  S.ctx.abrirFuncionario(fid);
  const d = $('dlgFunc');
  d?.addEventListener('close', () => { if (!$('telaSdQuadro').hidden) desenharQuadro(); }, { once: true });
}

/** O quadro congelado: o que vai para foto, relatório e Excel. */
function fotografar(q) {
  return q.linhas.map(l => ({
    funcao: l.cargo.nome, nivel: l.cargo.nivel || '', faixa: l.faixa, pessoas: l.pessoas.length,
    nomes: l.pessoas.map(f => f.nome), valor: l.valor, remun: l.remun, gap: l.gap, gapPct: l.gapPct, sit: l.sit,
    plano: l.plano ? { situacao: l.plano.situacao, prazo: l.plano.prazo, responsavel: l.plano.responsavel } : null,
  }));
}
const fotoParams = p => ({ benchmark: p.benchmark, ticket: p.ticket, transporte: p.transporte, margem: p.margem,
  provisorio: !!p.bench?.provisorio, fonte: p.bench?.fonte || '' });

function relQuadro(linhas, p, canto) {
  const n = k => linhas.filter(l => l.sit === k).length;
  const prov = p.provisorio ?? !!p.bench?.provisorio;
  return documento({
    titulo: 'Salário digno por função', subtitulo: 'Remuneração da função e faixa em uso × benchmark de Minas Gerais',
    canto, paisagem: true,
    corpo: `<div class="rel-resumo"><b>Benchmark:</b> ${brl(p.benchmark)}${prov ? ' <b class="rel-pend">(PROVISÓRIO)</b>' : ''} ·
        <b>ticket</b> ${brl(p.ticket)} · <b>transporte/moradia</b> ${brl(p.transporte)} ·
        <b>${linhas.length}</b> linha(s): <span class="rel-ok">${n('atende')} atendem</span>, ${n('atencao')} em atenção,
        <span class="rel-pend">${n('nao')} não atendem</span></div>
      <table class="rel-tabela"><thead><tr><th>Função</th><th>Nível</th><th>Faixa</th><th class="rel-num">Pessoas</th>
        <th class="rel-num">Valor da faixa</th><th class="rel-num">Remuneração</th><th class="rel-num">Gap</th><th class="rel-num">Gap %</th>
        <th>Situação</th><th>Plano de ação</th></tr></thead>
      <tbody>${linhas.map(l => `<tr><td>${esc(l.funcao)}</td><td>${esc(l.nivel)}</td><td>${l.faixa}</td><td class="rel-num">${l.pessoas}</td>
        <td class="rel-num">${brl(l.valor)}</td><td class="rel-num">${brl(l.remun)}</td><td class="rel-num">${brl(l.gap)}</td>
        <td class="rel-num">${pctTxt(l.gapPct)}</td>
        <td class="${l.sit === 'nao' ? 'rel-pend' : l.sit === 'atende' ? 'rel-ok' : ''}">${SITUACAO_LINHA[l.sit][0]}</td>
        <td>${l.plano ? `${SITS[l.plano.situacao][0]}${l.plano.prazo ? ' · prazo ' + br(l.plano.prazo) : ''}` : (l.sit === 'nao' ? 'sem plano' : '—')}</td></tr>`).join('')
        || '<tr><td colspan="10" class="rel-vazio">Nenhuma função e faixa em uso.</td></tr>'}</tbody></table>
      <p class="rel-nota">Remuneração = valor da faixa no Plano de cargos + ticket + transporte/moradia (valores fixos aceitos pela auditoria, RN-145).
        A conta usa a tabela do plano, não o salário individual. Gerência não entra.${prov ? ' Benchmark provisório: fonte oficial a confirmar na próxima auditoria.' : ''}</p>`,
  });
}
function csvQuadro(linhas, nome) {
  baixarCsv(nome, [
    ['Funcao', 'Nivel', 'Faixa', 'Pessoas', 'Valor da faixa', 'Remuneracao', 'Gap R$', 'Gap %', 'Situacao', 'Plano de acao', 'Prazo', 'Responsavel'],
    ...linhas.map(l => [l.funcao, l.nivel, l.faixa, l.pessoas, num2(l.valor), num2(l.remun), num2(l.gap),
      l.gapPct != null ? (l.gapPct * 100).toFixed(1).replace('.', ',') : '', SITUACAO_LINHA[l.sit][0],
      l.plano ? SITS[l.plano.situacao][0] : '', l.plano?.prazo ? br(l.plano.prazo) : '', l.plano?.responsavel || '']),
  ]);
}

function formFoto(q) {
  dialogo(`<h3>Salvar foto do quadro</h3>
    <p class="dica">Congela o quadro de hoje (${q.linhas.length} linha(s)) e os parâmetros, para comparar depois. A foto não muda mais.</p>
    <div class="aviso erro" id="sdFotoErro" hidden></div>
    <label class="campo plena">Motivo<input type="text" id="sdFotoMotivo" maxlength="120" placeholder="ex.: Auditoria GRASP 2026, revisão semestral"></label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="sdFotoOk">Salvar foto</button></div>`, d => {
    $('sdFotoMotivo').focus();
    $('sdFotoOk').addEventListener('click', async () => {
      const motivo = $('sdFotoMotivo').value.trim();
      if (!motivo) { $('sdFotoErro').textContent = 'Escreva o motivo da foto.'; $('sdFotoErro').hidden = false; return; }
      $('sdFotoOk').disabled = true;
      try {
        const { data, error } = await estado.cliente.from('rh_sd_fotos').insert({
          data: hoje(), motivo, quadro: fotografar(q), parametros: fotoParams(q.p), criado_por: quem(),
        }).select().single();
        if (error) throw error;
        S.fotos.unshift(data); d.close(); desenharQuadro();
      } catch (e) { $('sdFotoOk').disabled = false; $('sdFotoErro').textContent = 'Não consegui salvar: ' + (e.message || e); $('sdFotoErro').hidden = false; }
    });
  });
}

/* ===================================================================
   TELA · PLANOS DE AÇÃO
   =================================================================== */
const custoMensal = pl => pl.valor_proposto != null && pl.valor_atual != null && pl.pessoas != null
  ? (Number(pl.valor_proposto) - Number(pl.valor_atual)) * pl.pessoas : null;

function desenharPlanos() {
  const tela = $('telaSdPlanos');
  const q = quadro();
  const filtros = { abertos: 'Abertos e em andamento', todos: 'Todos', concluido: 'Concluídos', cancelado: 'Cancelados' };
  const lista = S.planos.filter(pl => S.filtroPlano === 'todos' ? true : S.filtroPlano === 'abertos' ? vivo(pl) : pl.situacao === S.filtroPlano);
  const vivos = S.planos.filter(vivo);
  const custo = vivos.reduce((t, pl) => t + (custoMensal(pl) || 0), 0);
  const aConfirmar = vivos.filter(pl => resolvido(pl, q));
  const semPlano = q.linhas.filter(l => l.sit === 'nao' && !(l.plano && vivo(l.plano)));

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Planos de ação</h2>
        <p class="dica" style="margin:2px 0 0">O que será feito em cada função e faixa abaixo do salário digno.</p></div>
      <span class="acoes">${botaoOlho('spOlho')}
        <button class="btn principal" type="button" id="spNovo">Novo plano</button>
        <button class="btn" type="button" id="spRel">Relatório</button>
        <button class="btn mini" type="button" id="spCsv">Excel</button></span>
    </div>
    <div class="rs-kpis">
      <div><span>Abertos / em andamento</span><strong>${vivos.length}</strong><small>${vivos.filter(pl => pl.prazo && pl.prazo < hoje()).length} com prazo vencido</small></div>
      <div class="${semPlano.length ? 'rs-alerta' : ''}"><span>Não atendem sem plano</span><strong>${semPlano.length}</strong><small>${semPlano.map(l => esc(l.cargo.nome) + ' ' + l.faixa).join(', ') || 'nenhuma'}</small></div>
      <div><span>Custo mensal dos planos abertos</span><strong>${V(custo)}</strong><small>proposto − atual × pessoas</small></div>
      <div><span>Concluídos</span><strong>${S.planos.filter(pl => pl.situacao === 'concluido').length}</strong><small>desde o início</small></div>
    </div>
    ${aConfirmar.length ? `<div class="aviso info sd-confirmar">${aConfirmar.map(pl => {
      const c = cargoPorId(pl.rh_cargo_id);
      return `<div><b>${esc(c?.nome || '?')} · faixa ${pl.faixa}</b>: ${esc(resolvido(pl, q))}
        <button class="btn mini principal" type="button" data-sp-concluir="${pl.id}">Confirmar conclusão</button></div>`;
    }).join('')}</div>` : ''}
    <div class="barra"><label class="campo">Mostrar<select id="spFiltro">${Object.entries(filtros).map(([k, t]) => `<option value="${k}" ${k === S.filtroPlano ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="rolagem sd-rola" style="margin-top:12px">
    <table class="dc-planilha sd-tab"><thead><tr><th>Função · faixa</th><th>Ação</th><th>Responsável</th><th class="ce">Prazo</th>
      <th class="ce">Atual → proposto</th><th class="ce">Custo/mês</th><th class="ce">Situação</th><th></th></tr></thead><tbody>
      ${lista.map(pl => {
        const c = cargoPorId(pl.rh_cargo_id), venc = vivo(pl) && pl.prazo && pl.prazo < hoje();
        const nAnd = S.andamentos.filter(a => a.plano_id === pl.id).length;
        return `<tr><td><b>${esc(c?.nome || '?')}</b> · faixa <b>${pl.faixa}</b><br><span class="dc-sem">${pl.pessoas ?? '—'} pessoa(s)</span></td>
          <td>${esc(ACOES[pl.tipo_acao] || pl.tipo_acao)}${pl.descricao ? `<br><span class="dc-sem">${esc(pl.descricao)}</span>` : ''}</td>
          <td>${esc(pl.responsavel || '—')}</td>
          <td class="ce${venc ? ' sd-atraso' : ''}">${br(pl.prazo)}${venc ? '<br>vencido' : ''}</td>
          <td class="ce">${V(Number(pl.valor_atual))}<br>→ <b>${V(Number(pl.valor_proposto))}</b></td>
          <td class="ce">${V(custoMensal(pl))}</td>
          <td class="ce"><span class="tag ${SITS[pl.situacao][1]}">${SITS[pl.situacao][0]}</span>${nAnd ? `<br><span class="dc-sem">${nAnd} anotação(ões)</span>` : ''}</td>
          <td class="ce"><button class="btn mini" type="button" data-sp-abrir="${pl.id}">Abrir</button></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="vazio">Nenhum plano neste filtro. Crie a partir da tela Funções ou em "Novo plano".</td></tr>'}
    </tbody></table></div>
  </div>`;

  $('spFiltro').addEventListener('change', e => { S.filtroPlano = e.target.value; desenharPlanos(); });
  ligarOlho('spOlho', desenharPlanos);
  $('spNovo').addEventListener('click', () => pedirSenha(() => { desenharPlanos(); formPlano(null, {}); }));
  tela.querySelectorAll('[data-sp-abrir]').forEach(b => b.addEventListener('click', () => pedirSenha(() => { desenharPlanos(); verPlano(b.dataset.spAbrir); })));
  tela.querySelectorAll('[data-sp-concluir]').forEach(b => b.addEventListener('click', () => confirmarConclusao(b.dataset.spConcluir)));
  $('spRel').addEventListener('click', () => pedirSenha(() => { desenharPlanos(); mostrar(relPlanos(lista, filtros[S.filtroPlano]), { barra: true }); }));
  $('spCsv').addEventListener('click', () => pedirSenha(() => { desenharPlanos(); csvPlanos(lista); }));
}

const redesenharTudo = () => {
  if (!$('telaSdQuadro')?.hidden) desenharQuadro();
  if (!$('telaSdPlanos')?.hidden) desenharPlanos();
  if (!$('telaSdConfig')?.hidden) desenharConfig();
};

/** Formulário do plano (novo quando `id` é nulo; `pre` traz função e faixa). */
function formPlano(id, pre) {
  const ed = id ? S.planos.find(x => x.id === id) : null;
  const q = quadro();
  const p = q.p;
  const linhas = q.linhas;
  const cargoId0 = ed?.rh_cargo_id || pre.cargoId || '';
  const faixa0 = ed?.faixa || pre.faixa || '';
  const minimo = minimoParaAtender(p);

  dialogo(`<h3>${ed ? 'Editar plano de ação' : 'Novo plano de ação'}</h3>
    <div class="aviso erro" id="spErro" hidden></div>
    <div class="grade">
      <label class="campo">Função e faixa<select id="spLinha"><option value="">— escolha —</option>
        ${linhas.map(l => `<option value="${l.chave}" ${l.chave === chaveLinha(cargoId0, faixa0) ? 'selected' : ''}>${esc(l.cargo.nome)} · faixa ${l.faixa} — ${SITUACAO_LINHA[l.sit][0].toLowerCase()}</option>`).join('')}
        ${ed && !linhas.some(l => l.chave === chaveLinha(ed.rh_cargo_id, ed.faixa)) ? `<option value="${chaveLinha(ed.rh_cargo_id, ed.faixa)}" selected>${esc(cargoPorId(ed.rh_cargo_id)?.nome || '?')} · faixa ${ed.faixa} — sem ninguém hoje</option>` : ''}
      </select></label>
      <label class="campo">Ação<select id="spTipo">${Object.entries(ACOES).map(([k, t]) => `<option value="${k}" ${k === (ed?.tipo_acao || 'subir_faixa') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo plena">O que será feito<input type="text" id="spDesc" maxlength="300" value="${esc(ed?.descricao || '')}" placeholder="ex.: subir a faixa A do Trab. Rural II na tabela 2027"></label>
      <label class="campo">Responsável<input type="text" id="spResp" maxlength="80" value="${esc(ed?.responsavel || '')}"></label>
      <label class="campo">Prazo<input type="date" id="spPrazo" value="${ed?.prazo || ''}"></label>
      <label class="campo">Valor atual da faixa<input type="text" id="spAtual" readonly></label>
      <label class="campo">Valor proposto (R$) <small>sugestão: o mínimo para atender</small><input type="text" id="spProp" inputmode="decimal"
        value="${ed?.valor_proposto != null ? String(ed.valor_proposto).replace('.', ',') : ''}"></label>
      <div class="sd-conf plena"><b>Conferência</b><div id="spConf"></div></div>
      ${ed ? `<label class="campo">Situação<select id="spSit">${Object.entries(SITS).map(([k, [t]]) => `<option value="${k}" ${k === ed.situacao ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo" id="spMotivoCanc" hidden>Motivo do cancelamento<input type="text" id="spMotivo" maxlength="200" value="${esc(ed.motivo_cancelamento || '')}"></label>` : ''}
    </div>
    <div class="barra fim"><button class="btn" type="button" ${ed ? 'id="spVoltar"' : 'data-fechar'}>${ed ? 'Voltar' : 'Cancelar'}</button>
      <button class="btn principal" type="button" id="spGravar">Gravar</button></div>`, d => {
    const linhaSel = () => linhas.find(l => l.chave === $('spLinha').value) || null;
    const atualizar = (sugerir) => {
      const l = linhaSel();
      const cid = $('spLinha').value.split('|')[0];
      const valorAtual = l ? l.valor : (ed ? Number(ed.valor_atual) : valorFaixa(cargoPorId(cid), $('spLinha').value.split('|')[1]));
      $('spAtual').value = valorAtual != null ? brl(valorAtual) : '—';
      if (sugerir && minimo != null && !$('spProp').value) $('spProp').value = String(minimo.toFixed(2)).replace('.', ',');
      const prop = lerValor($('spProp').value);
      const pessoas = l ? l.pessoas.length : (ed?.pessoas ?? 0);
      const partes = [];
      if (prop != null && minimo != null) partes.push(prop + 0.004 >= minimo
        ? `<span class="tag ativo">atende</span> remuneração ${brl(prop + p.ticket + p.transporte)} (${pctTxt((prop + p.ticket + p.transporte) / p.benchmark - 1)})`
        : `<span class="tag perigo">ainda não atende</span> faltam ${brl(minimo - prop)} na faixa`);
      if (prop != null && valorAtual != null) partes.push(`custo ${brl((prop - valorAtual) * pessoas)}/mês (${pessoas} pessoa(s) × ${brl(prop - valorAtual)})`);
      $('spConf').innerHTML = partes.join(' · ') || '—';
    };
    $('spLinha').addEventListener('change', () => atualizar(true));
    $('spProp').addEventListener('input', () => atualizar(false));
    const mostraMotivo = () => { if ($('spMotivoCanc')) $('spMotivoCanc').hidden = $('spSit').value !== 'cancelado'; };
    $('spSit')?.addEventListener('change', mostraMotivo); mostraMotivo();
    atualizar(!ed);
    $('spVoltar')?.addEventListener('click', () => verPlano(ed.id));
    $('spGravar').addEventListener('click', async () => {
      const erro = t => { $('spErro').textContent = t; $('spErro').hidden = false; };
      const l = linhaSel();
      const [cid, fx] = ($('spLinha').value || '|').split('|');
      if (!cid) return erro('Escolha a função e a faixa.');
      const prop = lerValor($('spProp').value);
      if (!prop) return erro('Informe o valor proposto.');
      if (!$('spResp').value.trim()) return erro('Informe o responsável.');
      if (!$('spPrazo').value) return erro('Informe o prazo.');
      const sit = $('spSit')?.value || 'aberto';
      if (sit === 'cancelado' && !$('spMotivo').value.trim()) return erro('Escreva o motivo do cancelamento.');
      if (!ed && S.planos.some(x => vivo(x) && x.rh_cargo_id === cid && x.faixa === fx)) return erro('Já existe um plano aberto para esta função e faixa.');
      const reg = {
        rh_cargo_id: cid, faixa: fx, tipo_acao: $('spTipo').value, descricao: $('spDesc').value.trim() || null,
        responsavel: $('spResp').value.trim(), prazo: $('spPrazo').value,
        valor_atual: l ? l.valor : (ed?.valor_atual ?? null), valor_proposto: prop,
        pessoas: l ? l.pessoas.length : (ed?.pessoas ?? 0),
        situacao: sit, motivo_cancelamento: sit === 'cancelado' ? $('spMotivo').value.trim() : null,
        concluido_em: sit === 'concluido' ? (ed?.concluido_em || hoje()) : null,
        atualizado_em: new Date().toISOString(),
      };
      $('spGravar').disabled = true;
      try {
        const c = estado.cliente.from('rh_sd_planos');
        const { data, error } = ed
          ? await c.update(reg).eq('id', ed.id).select().single()
          : await c.insert({ ...reg, criado_por: quem() }).select().single();
        if (error) throw error;
        if (ed) {
          S.planos[S.planos.findIndex(x => x.id === ed.id)] = data;
          if (ed.situacao !== data.situacao) await anotar(data.id, `Situação: ${SITS[ed.situacao][0]} → ${SITS[data.situacao][0]}${data.motivo_cancelamento ? ' — ' + data.motivo_cancelamento : ''}`);
        } else {
          S.planos.unshift(data);
          await anotar(data.id, 'Plano criado.');
        }
        redesenharTudo();
        verPlano(data.id);
      } catch (e) { $('spGravar').disabled = false; erro('Não consegui gravar: ' + (e.message || e)); }
    });
  }, true);
}

async function anotar(planoId, texto) {
  const { data, error } = await estado.cliente.from('rh_sd_andamentos')
    .insert({ plano_id: planoId, texto, criado_por: quem() }).select().single();
  if (error) throw error;
  S.andamentos.push(data);
  return data;
}

/** Ficha do plano: dados, acompanhamento e as ações. */
function verPlano(id) {
  const pl = S.planos.find(x => x.id === id);
  if (!pl) return;
  const c = cargoPorId(pl.rh_cargo_id);
  const q = quadro();
  const l = q.linhas.find(x => x.chave === chaveLinha(pl.rh_cargo_id, pl.faixa));
  const res = resolvido(pl, q);
  const ands = S.andamentos.filter(a => a.plano_id === id);
  dialogo(`<h3>${esc(c?.nome || '?')} · faixa ${pl.faixa}</h3>
    <p class="dica" style="margin-top:-8px"><span class="tag ${SITS[pl.situacao][1]}">${SITS[pl.situacao][0]}</span>
      ${pl.concluido_em ? ` em ${br(pl.concluido_em)}` : ''} · criado em ${br(pl.criado_em)} por ${esc(pl.criado_por || '—')}</p>
    ${res ? `<div class="aviso info">${esc(res)} <button class="btn mini principal" type="button" id="spConcluirAqui">Confirmar conclusão</button></div>` : ''}
    <table class="dc-planilha rs-mini"><tbody>
      <tr><td>Hoje</td><td>${l ? `${l.pessoas.length} pessoa(s) · faixa ${V(l.valor)} · remuneração ${V(l.remun)} · gap ${V(l.gap)}
        <span class="tag ${SITUACAO_LINHA[l.sit][1]}">${SITUACAO_LINHA[l.sit][0]}</span>` : 'ninguém ocupa esta função e faixa hoje'}</td></tr>
      <tr><td>Ação</td><td><b>${esc(ACOES[pl.tipo_acao])}</b>${pl.descricao ? ` — ${esc(pl.descricao)}` : ''}</td></tr>
      <tr><td>Responsável</td><td>${esc(pl.responsavel || '—')}</td></tr>
      <tr><td>Prazo</td><td class="${vivo(pl) && pl.prazo && pl.prazo < hoje() ? 'sd-atraso' : ''}">${br(pl.prazo)}</td></tr>
      <tr><td>Valor</td><td>${V(Number(pl.valor_atual))} → <b>${V(Number(pl.valor_proposto))}</b> · custo ${V(custoMensal(pl))}/mês (${pl.pessoas ?? '—'} pessoa(s))</td></tr>
      ${pl.motivo_cancelamento ? `<tr><td>Cancelamento</td><td>${esc(pl.motivo_cancelamento)}</td></tr>` : ''}
    </tbody></table>
    <h4 class="rs-h4">Acompanhamento</h4>
    <div class="sd-ands">${ands.map(a => `<div><small>${br(a.criado_em.slice(0, 10))} · ${esc(a.criado_por || '')}</small>${esc(a.texto)}</div>`).join('')
      || '<p class="dica">Nenhuma anotação.</p>'}</div>
    ${vivo(pl) ? `<div class="barra"><input type="text" id="spAnd" maxlength="300" placeholder="Anotar o andamento (ex.: proposta enviada à diretoria)" style="flex:1">
      <button class="btn" type="button" id="spAndOk">Anotar</button></div>` : ''}
    <div class="aviso erro" id="spVerErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button>
      <button class="btn" type="button" id="spRelUm">Imprimir</button>
      <button class="btn principal" type="button" id="spEditar">Editar</button></div>`, () => {
    $('spEditar').addEventListener('click', () => formPlano(id));
    $('spConcluirAqui')?.addEventListener('click', () => confirmarConclusao(id));
    $('spRelUm').addEventListener('click', () => { fechar(); mostrar(relPlanos([pl], 'Plano de ação', true), { barra: true }); });
    $('spAndOk')?.addEventListener('click', async () => {
      const t = $('spAnd').value.trim();
      if (!t) { $('spAnd').focus(); return; }
      $('spAndOk').disabled = true;
      try {
        await anotar(id, t);
        if (pl.situacao === 'aberto') await mudarSituacao(pl, 'andamento');
        verPlano(id); redesenharTudo();
      } catch (e) { $('spAndOk').disabled = false; $('spVerErro').textContent = 'Não consegui anotar: ' + (e.message || e); $('spVerErro').hidden = false; }
    });
  }, true);
}

async function mudarSituacao(pl, sit, extra = {}) {
  const { data, error } = await estado.cliente.from('rh_sd_planos')
    .update({ situacao: sit, atualizado_em: new Date().toISOString(), ...extra }).eq('id', pl.id).select().single();
  if (error) throw error;
  S.planos[S.planos.findIndex(x => x.id === pl.id)] = data;
  return data;
}

function confirmarConclusao(id) {
  const pl = S.planos.find(x => x.id === id);
  const q = quadro();
  const motivo = resolvido(pl, q);
  dialogo(`<h3>Concluir o plano</h3>
    <p>${esc(cargoPorId(pl.rh_cargo_id)?.nome || '')} · faixa ${pl.faixa}: ${esc(motivo || '')}</p>
    <p class="dica">O plano vira <b>Concluído</b> com a data de hoje e a anotação fica no acompanhamento.</p>
    <div class="aviso erro" id="spCcErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Agora não</button>
      <button class="btn principal" type="button" id="spCcOk">Confirmar conclusão</button></div>`, d => {
    $('spCcOk').addEventListener('click', async () => {
      $('spCcOk').disabled = true;
      try {
        await mudarSituacao(pl, 'concluido', { concluido_em: hoje() });
        await anotar(pl.id, `Concluído: ${motivo}`);
        d.close(); redesenharTudo();
      } catch (e) { $('spCcOk').disabled = false; $('spCcErro').textContent = 'Não consegui gravar: ' + (e.message || e); $('spCcErro').hidden = false; }
    });
  });
}

function relPlanos(lista, canto, comAndamento = false) {
  const custo = lista.filter(vivo).reduce((t, pl) => t + (custoMensal(pl) || 0), 0);
  return documento({
    titulo: lista.length === 1 && comAndamento ? 'Plano de ação · salário digno' : 'Planos de ação · salário digno',
    subtitulo: 'Funções e faixas abaixo do benchmark e o que será feito', canto, paisagem: true,
    corpo: `<div class="rel-resumo"><b>${lista.length}</b> plano(s) · custo mensal dos abertos: <b>${brl(custo)}</b></div>
      <table class="rel-tabela"><thead><tr><th>Função</th><th>Faixa</th><th>Ação</th><th>Responsável</th><th>Prazo</th>
        <th class="rel-num">Atual</th><th class="rel-num">Proposto</th><th class="rel-num">Pessoas</th><th class="rel-num">Custo/mês</th><th>Situação</th></tr></thead>
      <tbody>${lista.map(pl => `<tr><td>${esc(cargoPorId(pl.rh_cargo_id)?.nome || '?')}</td><td>${pl.faixa}</td>
        <td>${esc(ACOES[pl.tipo_acao])}${pl.descricao ? ' — ' + esc(pl.descricao) : ''}</td><td>${esc(pl.responsavel || '')}</td>
        <td class="${vivo(pl) && pl.prazo && pl.prazo < hoje() ? 'rel-pend' : ''}">${br(pl.prazo)}</td>
        <td class="rel-num">${brl(Number(pl.valor_atual))}</td><td class="rel-num">${brl(Number(pl.valor_proposto))}</td>
        <td class="rel-num">${pl.pessoas ?? ''}</td><td class="rel-num">${brl(custoMensal(pl))}</td>
        <td class="${pl.situacao === 'concluido' ? 'rel-ok' : vivo(pl) ? 'rel-pend' : ''}">${SITS[pl.situacao][0]}${pl.concluido_em ? ' ' + br(pl.concluido_em) : ''}</td></tr>`).join('')
        || '<tr><td colspan="10" class="rel-vazio">Nenhum plano.</td></tr>'}</tbody></table>
      ${comAndamento ? lista.map(pl => `<div class="rel-secao">Acompanhamento</div>
        <table class="rel-tabela"><thead><tr><th>Data</th><th>Por</th><th>Anotação</th></tr></thead><tbody>
        ${S.andamentos.filter(a => a.plano_id === pl.id).map(a => `<tr><td>${br(a.criado_em.slice(0, 10))}</td><td>${esc(a.criado_por || '')}</td><td>${esc(a.texto)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="rel-vazio">Nenhuma anotação.</td></tr>'}</tbody></table>`).join('') : ''}
      <p class="rel-nota">Custo/mês = (valor proposto − valor atual da faixa) × pessoas na função e faixa quando o plano foi gravado.</p>`,
  });
}
function csvPlanos(lista) {
  baixarCsv(`Planos_salario_digno_${hoje()}.csv`, [
    ['Funcao', 'Faixa', 'Acao', 'Descricao', 'Responsavel', 'Prazo', 'Valor atual', 'Valor proposto', 'Pessoas', 'Custo mensal', 'Situacao', 'Concluido em', 'Criado em'],
    ...lista.map(pl => [cargoPorId(pl.rh_cargo_id)?.nome || '', pl.faixa, ACOES[pl.tipo_acao], pl.descricao || '', pl.responsavel || '',
      br(pl.prazo), num2(pl.valor_atual), num2(pl.valor_proposto), pl.pessoas ?? '', num2(custoMensal(pl)), SITS[pl.situacao][0],
      pl.concluido_em ? br(pl.concluido_em) : '', br(pl.criado_em)]),
  ]);
}

/* ===================================================================
   TELA · CONFIGURAÇÕES
   =================================================================== */
const fmtParam = (chave, v) => v == null ? '—' : chave === 'margem_pct'
  ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : brl(Number(v));

function desenharConfig() {
  const tela = $('telaSdConfig');
  const p = parametros();
  const cargos = S.cargos.filter(c => c.ativo !== false);
  tela.innerHTML = `<div class="cartao">
    <h2 style="margin:0">Configurações do salário digno</h2>
    <p class="dica" style="margin:2px 0 0">Valores com vigência: alterar encerra o período de hoje e abre outro. O histórico fica embaixo de cada um.</p>
    <div class="sd-params">
      ${PARAMS.map(pp => {
        const reg = paramReg(pp.chave);
        const hist = S.params.filter(x => x.chave === pp.chave).sort((a, b) => b.inicio.localeCompare(a.inicio));
        return `<div class="sd-param">
          <div class="sd-param-top"><div><span class="sd-param-n">${esc(pp.nome)}</span>
            <strong>${fmtParam(pp.chave, reg?.valor)}</strong>
            ${pp.chave === 'benchmark' && reg ? (reg.provisorio ? '<span class="tag alerta">PROVISÓRIO</span>' : '<span class="tag ativo">confirmado</span>') : ''}</div>
            <button class="btn mini" type="button" data-sd-param="${pp.chave}">Alterar</button></div>
          <p class="dica">${esc(pp.dica)}</p>
          ${pp.chave === 'benchmark' && reg ? `<p class="dica"><b>Fonte:</b> ${esc(reg.fonte || 'não informada')} · <b>próxima revisão:</b> ${reg.proxima_revisao ? br(reg.proxima_revisao) : 'não registrada'}</p>` : ''}
          <details><summary class="dc-sem">Histórico (${hist.length})</summary>
            <table class="dc-planilha rs-mini"><thead><tr><th>Valor</th><th>De</th><th>Até</th><th>Por</th></tr></thead><tbody>
            ${hist.map(h => `<tr><td>${fmtParam(pp.chave, h.valor)}${h.provisorio ? ' <span class="tag alerta">prov.</span>' : ''}</td><td>${br(h.inicio)}</td><td>${h.fim ? br(h.fim) : 'em vigor'}</td><td class="dc-sem">${esc(h.criado_por || '')}</td></tr>`).join('')}
            </tbody></table></details>
        </div>`;
      }).join('')}
    </div>
    <div class="sd-conta">Mínimo que a faixa precisa para atender hoje: <b>${brl(minimoParaAtender(p))}</b>
      <span class="dc-sem">(benchmark − ticket − transporte/moradia)</span></div>

    <h3 class="rs-h3">Funções que entram no salário digno</h3>
    <p class="dica">Desmarcada, a função some do quadro (gerência vem desmarcada). Vale para todas as faixas da função.</p>
    <div class="rolagem sd-rola"><table class="dc-planilha rs-mini"><thead><tr><th class="ce">Entra</th><th>Função</th><th>Nível</th><th class="ce">Pessoas ativas</th></tr></thead><tbody>
      ${cargos.map(c => {
        const n = ativos().filter(f => cargoPorId(jd.funcaoDe(jd.vinculoDe(f.id))?.rh_cargo_id)?.id === c.id).length;
        return `<tr><td class="ce"><input type="checkbox" data-sd-entra="${c.id}" ${c.salario_digno !== false ? 'checked' : ''}></td>
          <td>${esc(c.nome)}</td><td>${esc(c.nivel || '')}</td><td class="ce">${n}</td></tr>`;
      }).join('')}
    </tbody></table></div>
    <div class="aviso erro" id="scErro" hidden></div>
  </div>`;

  tela.querySelectorAll('[data-sd-param]').forEach(b => b.addEventListener('click', () => formParam(b.dataset.sdParam)));
  tela.querySelectorAll('[data-sd-entra]').forEach(cb => cb.addEventListener('change', async () => {
    cb.disabled = true;
    const { data, error } = await estado.cliente.from('rh_cargos').update({ salario_digno: cb.checked }).eq('id', cb.dataset.sdEntra).select().single();
    if (error) { cb.checked = !cb.checked; cb.disabled = false; $('scErro').textContent = 'Não consegui gravar: ' + error.message; $('scErro').hidden = false; return; }
    S.cargos[S.cargos.findIndex(c => c.id === data.id)] = data;
    cb.disabled = false;
  }));
}

/** Alterar um parâmetro: encerra o período vigente na véspera e abre outro. */
function formParam(chave) {
  const pp = PARAMS.find(x => x.chave === chave);
  const reg = paramReg(chave);
  const bench = chave === 'benchmark';
  dialogo(`<h3>Alterar · ${esc(pp.nome)}</h3>
    <p class="dica" style="margin-top:-8px">Hoje: <b>${fmtParam(chave, reg?.valor)}</b>${reg ? ` desde ${br(reg.inicio)}` : ''}. O valor de hoje fica no histórico.</p>
    <div class="aviso erro" id="spmErro" hidden></div>
    <div class="grade">
      <label class="campo">Novo valor (${pp.un})<input type="text" id="spmValor" inputmode="decimal" value="${reg ? String(Number(reg.valor)).replace('.', ',') : ''}"></label>
      <label class="campo">Vale a partir de<input type="date" id="spmIni" value="${hoje()}"></label>
      ${bench ? `<label class="campo plena">Fonte<input type="text" id="spmFonte" maxlength="200" value="${esc(reg?.fonte || '')}"></label>
        <label class="campo">Próxima revisão<input type="date" id="spmRev" value="${reg?.proxima_revisao || ''}"></label>
        <label class="campo rs-check"><input type="checkbox" id="spmProv" ${reg?.provisorio ? 'checked' : ''}> Provisório (fonte ainda a confirmar)</label>`
      : `<label class="campo plena">Observação / fonte <small>opcional</small><input type="text" id="spmFonte" maxlength="200" value=""></label>`}
    </div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="spmOk">Gravar</button></div>`, d => {
    $('spmOk').addEventListener('click', async () => {
      const erro = t => { $('spmErro').textContent = t; $('spmErro').hidden = false; };
      const valor = lerValor($('spmValor').value, chave === 'margem_pct');
      const ini = $('spmIni').value;
      if (valor == null) return erro('Informe o valor.');
      if (!ini) return erro('Informe a data a partir de quando vale.');
      if (reg && ini <= reg.inicio) return erro(`A data precisa ser depois de ${br(reg.inicio)}, início do valor de hoje.`);
      if (S.params.some(x => x.chave === chave && x.inicio > (reg?.inicio || '') && x.id !== reg?.id && x.inicio >= ini))
        return erro('Já existe uma alteração programada para esta data ou depois. Ajuste a data.');
      $('spmOk').disabled = true;
      try {
        const c = estado.cliente.from('rh_sd_parametros');
        if (reg) {
          const { data, error } = await c.update({ fim: diaAntes(ini) }).eq('id', reg.id).select().single();
          if (error) throw error;
          S.params[S.params.findIndex(x => x.id === reg.id)] = data;
        }
        const novo = { chave, valor, inicio: ini, fonte: $('spmFonte').value.trim() || null, criado_por: quem(),
          provisorio: bench ? $('spmProv').checked : false, proxima_revisao: bench ? ($('spmRev').value || null) : null };
        const { data, error } = await estado.cliente.from('rh_sd_parametros').insert(novo).select().single();
        if (error) throw error;
        S.params.push(data);
        d.close(); desenharConfig();
      } catch (e) { $('spmOk').disabled = false; erro('Não consegui gravar: ' + (e.message || e)); }
    });
  });
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_SALARIO_DIGNO = ['sdQuadro', 'sdPlanos', 'sdConfig'];
const ALVO = { sdQuadro: 'telaSdQuadro', sdPlanos: 'telaSdPlanos', sdConfig: 'telaSdConfig' };

export async function abrirSalarioDigno(tela, ctx = {}) {
  const alvo = $(ALVO[tela]);
  if (!alvo) return;
  S.ctx = ctx;
  aberto = false;   // como no Plano de cargos: entrar de novo pede a senha
  if (!S.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o salário digno…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o salário digno: ${esc(e.message || e)}</div></div>`; return; }
  }
  if (tela === 'sdQuadro') desenharQuadro();
  else if (tela === 'sdPlanos') desenharPlanos();
  else desenharConfig();
}

export function limparSalarioDigno() {
  S.carregado = false; S.cargos = []; S.params = []; S.planos = []; S.andamentos = []; S.fotos = [];
  S.filtro = ''; S.nivel = ''; S.filtroPlano = 'abertos';
  aberto = false; fechar();
}

/* Para testes. */
export const _sd = { S, quadro, parametros, resolvido, formPlano, verPlano };
