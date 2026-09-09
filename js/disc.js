// disc.js — módulo DISC (perfil comportamental)
// Acesso restrito: as tabelas disc_* só respondem para quem está na
// lista disc_acesso do banco. Sem isso a aba nem aparece.
import { estado } from './store.js';
import { COLUNAS, GRUPOS, PADRAO, analisar } from './disc-dados.js';
import { montarFichaDisc } from './disc-ficha.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};
const hoje = () => new Date().toISOString().slice(0, 10);

const D = {
  autorizado: false,
  carregado: false,
  perfis: {},        // codigo -> linha de disc_perfis
  combinacoes: {},   // "DI" -> {titulo, texto}
  avaliacoes: [],    // todas
  cargos: {},        // cargo -> linha de disc_cargos_esperado
};

let lanc = null;     // { funcionario_id, id, data_teste, origem, marcas:Set('1D'), totais:{} }
let subaba = 'lancar';

/* =============== acesso =============== */
export async function verificarAcesso() {
  try {
    const { data, error } = await estado.cliente.rpc('disc_autorizado');
    D.autorizado = !error && data === true;
  } catch { D.autorizado = false; }
  $('abaDisc').hidden = !D.autorizado;
  return D.autorizado;
}

/* =============== carga =============== */
async function carregar() {
  const c = estado.cliente;
  const [p, k, a, g] = await Promise.all([
    c.from('disc_perfis').select('*').order('ordem'),
    c.from('disc_combinacoes').select('*'),
    c.from('disc_avaliacoes').select('*').order('data_teste', { ascending: false }),
    c.from('disc_cargos_esperado').select('*'),
  ]);
  const erro = p.error || k.error || a.error || g.error;
  if (erro) throw erro;
  D.perfis = {};
  (p.data || []).forEach(x => { D.perfis[x.codigo] = x; });
  COLUNAS.forEach(cod => {
    if (!D.perfis[cod]) D.perfis[cod] = { codigo: cod, ...PADRAO[cod] };
  });
  D.combinacoes = {};
  (k.data || []).forEach(x => { D.combinacoes[x.principal + x.secundario] = x; });
  D.avaliacoes = a.data || [];
  D.cargos = {};
  (g.data || []).forEach(x => { D.cargos[x.cargo] = x; });
  D.carregado = true;
}

const funcionario = id => estado.funcionarios.find(f => f.id === id);

// última avaliação de cada funcionário
function ultimaDe(id) {
  return D.avaliacoes.find(a => a.funcionario_id === id) || null;
}
function leituraDe(av) {
  if (!av) return null;
  return analisar({ D: +av.total_d, I: +av.total_i, S: +av.total_s, C: +av.total_c });
}

/* =============== abertura =============== */
export async function abrirDisc() {
  if (!D.autorizado) return;
  const aviso = $('discAviso');
  if (!D.carregado) {
    aviso.textContent = 'Carregando o DISC...';
    aviso.className = 'aviso info'; aviso.hidden = false;
    try { await carregar(); aviso.hidden = true; }
    catch (e) {
      aviso.textContent = 'Não consegui carregar o DISC: ' + (e?.message || e);
      aviso.className = 'aviso erro'; aviso.hidden = false;
      return;
    }
  }
  abrirSub(subaba);
}

function abrirSub(nome) {
  subaba = nome;
  document.querySelectorAll('.subaba').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.sub === nome)));
  const telas = { lancar: 'discLancar', ficha: 'discFicha', equipe: 'discEquipe',
    cargos: 'discCargos', textos: 'discTextos' };
  Object.entries(telas).forEach(([chave, id]) => { $(id).hidden = chave !== nome; });
  if (nome === 'lancar') desenharLancar();
  if (nome === 'ficha') desenharFicha();
  if (nome === 'equipe') desenharEquipe();
  if (nome === 'cargos') desenharCargos();
  if (nome === 'textos') desenharTextos();
}

/* =============== seletor de funcionário =============== */
function opcoesFuncionarios(sel, { soComTeste = false, soAtivos = true } = {}) {
  const atual = sel.value;
  const lista = estado.funcionarios
    .filter(f => (!soAtivos || f.situacao === 'ATIVO') && (!soComTeste || ultimaDe(f.id)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  sel.innerHTML = '<option value="">— escolha —</option>' + lista.map(f => {
    const av = ultimaDe(f.id);
    const l = leituraDe(av);
    const marca = l ? ` (${l.principal}${l.secundario || ''})` : '';
    return `<option value="${f.id}">${esc(f.nome)}${marca}</option>`;
  }).join('');
  if (atual && lista.some(f => f.id === atual)) sel.value = atual;
}

/* =============== 1) LANÇAR =============== */
function desenharLancar() {
  opcoesFuncionarios($('dcFunc'), { soAtivos: $('dcSoAtivos').checked });
  if (!lanc) montarGrade();
  atualizarLanc();
  desenharHistorico();
}

function montarGrade() {
  $('dcGrade').innerHTML = `
    <table class="dc-tab">
      <thead><tr><th class="dc-n">#</th>${COLUNAS.map(c => {
        const p = D.perfis[c] || PADRAO[c];
        return `<th style="background:${p.cor};color:${c === 'I' ? '#3d3400' : '#fff'}">${c} · ${esc(p.nome)}</th>`;
      }).join('')}</tr></thead>
      <tbody>${GRUPOS.map((linha, i) => `<tr>
        <td class="dc-n">${i + 1}</td>
        ${linha.map((txt, j) => {
          const ch = `${i + 1}${COLUNAS[j]}`;
          return `<td><button type="button" class="dc-cx" data-ch="${ch}"
            style="--cor:${(D.perfis[COLUNAS[j]] || PADRAO[COLUNAS[j]]).cor}">${esc(txt)}</button></td>`;
        }).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
  $('dcGrade').querySelectorAll('.dc-cx').forEach(b =>
    b.addEventListener('click', () => {
      if (!lanc) return;
      const ch = b.dataset.ch;
      lanc.marcas.has(ch) ? lanc.marcas.delete(ch) : lanc.marcas.add(ch);
      atualizarLanc();
    }));
}

function totaisDoLancamento() {
  if (!lanc) return { D: 0, I: 0, S: 0, C: 0 };
  if (lanc.origem === 'totais') return { ...lanc.totais };
  const t = { D: 0, I: 0, S: 0, C: 0 };
  lanc.marcas.forEach(ch => { t[ch.slice(-1)]++; });
  return t;
}

function atualizarLanc() {
  const temFunc = !!lanc?.funcionario_id;
  $('dcPainel').hidden = !temFunc;
  $('dcNadaFunc').hidden = temFunc;
  if (!temFunc) return;

  $('dcGrade').hidden = lanc.origem !== 'marcacoes';
  $('dcTotaisMan').hidden = lanc.origem !== 'totais';
  document.querySelectorAll('[data-origem]').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.origem === lanc.origem)));

  $('dcGrade').querySelectorAll('.dc-cx').forEach(b =>
    b.classList.toggle('on', lanc.marcas.has(b.dataset.ch)));

  const t = totaisDoLancamento();
  const soma = COLUNAS.reduce((s, c) => s + (+t[c] || 0), 0);
  const l = analisar(t);

  $('dcResumo').innerHTML = COLUNAS.map(c => {
    const p = D.perfis[c] || PADRAO[c];
    return `<div class="dc-res" style="border-color:${p.cor}">
      <span class="dc-res-l" style="color:${p.cor}">${c}</span>
      <span class="dc-res-n">${esc(p.nome)}</span>
      <span class="dc-res-v">${num(t[c])}</span>
      <span class="dc-res-p">${num(l.pct[c])}%</span>
    </div>`;
  }).join('') + `<div class="dc-res dc-res-total">
      <span class="dc-res-n">Total marcado</span>
      <span class="dc-res-v">${num(soma)}</span>
      <span class="dc-res-p">100%</span>
    </div>`;

  const av = $('dcAvisoSoma');
  if (lanc.origem === 'totais' && soma && Math.abs(soma - 100) > 0.05) {
    av.textContent = `Os quatro totais somam ${num(soma)} — no papel a soma tem de dar 100. Confira antes de salvar.`;
    av.hidden = false;
  } else av.hidden = true;

  $('dcLeitura').innerHTML = l.principal
    ? `<b>${esc(D.perfis[l.principal]?.nome)}</b> como principal${l.secundario
        ? ` e <b>${esc(D.perfis[l.secundario]?.nome)}</b> como secundário` : ''}` +
      (l.empate ? ' — <b>empate</b>, os dois entram como principal' : '') +
      (l.intensidade ? ` · ${l.intensidade}` : '') +
      (l.parentesco ? ` · ${l.parentesco}` : '')
    : 'Marque as caixas do papel para ver o resultado.';

  $('dcSalvar').disabled = !soma;
  $('dcApagar').hidden = !lanc.existente;
}

function carregarLancamento(funcId) {
  const av = ultimaDe(funcId);
  lanc = {
    funcionario_id: funcId,
    id: null, existente: false,
    data_teste: hoje(),
    origem: 'marcacoes',
    marcas: new Set(),
    totais: { D: 0, I: 0, S: 0, C: 0 },
  };
  $('dcData').value = lanc.data_teste;
  $('dcObs').value = '';
  COLUNAS.forEach(c => { $('dcT' + c).value = ''; });
  atualizarLanc();
  if (av) desenharHistorico();
}

async function editarAvaliacao(id) {
  const av = D.avaliacoes.find(a => a.id === id);
  if (!av) return;
  const { data, error } = await estado.cliente
    .from('disc_marcacoes').select('*').eq('avaliacao_id', id);
  lanc = {
    funcionario_id: av.funcionario_id,
    id: av.id, existente: true,
    data_teste: av.data_teste,
    origem: av.origem,
    marcas: new Set(error ? [] : (data || []).map(m => `${m.linha}${m.coluna}`)),
    totais: { D: +av.total_d, I: +av.total_i, S: +av.total_s, C: +av.total_c },
  };
  $('dcFunc').value = av.funcionario_id;
  $('dcData').value = av.data_teste;
  $('dcObs').value = av.observacoes || '';
  COLUNAS.forEach(c => { $('dcT' + c).value = lanc.totais[c] || ''; });
  atualizarLanc();
  $('dcPainel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function desenharHistorico() {
  const id = lanc?.funcionario_id;
  const lista = id ? D.avaliacoes.filter(a => a.funcionario_id === id) : [];
  $('dcHist').innerHTML = lista.length ? lista.map(a => {
    const l = leituraDe(a);
    return `<div class="item" style="grid-template-columns:auto 1fr auto">
      <span class="tag ativo">${dataBr(a.data_teste)}</span>
      <span>
        <span class="nome">${esc(D.perfis[l.principal]?.nome || '—')}${l.secundario ? ' + ' + esc(D.perfis[l.secundario]?.nome) : ''}</span><br>
        <span class="sub">${COLUNAS.map(c => `${c} ${num(l.pct[c])}%`).join(' · ')} · lançado por ${esc(a.origem === 'totais' ? 'totais' : 'marcações')}</span>
      </span>
      <span class="acoes"><button class="btn mini" data-editar-av="${a.id}">Abrir</button></span>
    </div>`;
  }).join('') : '<div class="vazio">Nenhum teste lançado para esta pessoa.</div>';
  $('dcHist').querySelectorAll('[data-editar-av]').forEach(b =>
    b.addEventListener('click', () => editarAvaliacao(b.dataset.editarAv)));
}

async function salvarLancamento() {
  if (!lanc) return;
  const botao = $('dcSalvar');
  botao.disabled = true; botao.textContent = 'Salvando...';
  try {
    const t = totaisDoLancamento();
    const l = analisar(t);
    const linha = {
      funcionario_id: lanc.funcionario_id,
      data_teste: $('dcData').value || hoje(),
      origem: lanc.origem,
      total_d: t.D, total_i: t.I, total_s: t.S, total_c: t.C,
      perfil_principal: l.principal, perfil_secundario: l.secundario,
      empate: l.empate, intensidade: l.intensidade,
      observacoes: $('dcObs').value.trim() || null,
      atualizado_em: new Date().toISOString(),
    };
    if (lanc.id) linha.id = lanc.id;

    const { data, error } = await estado.cliente
      .from('disc_avaliacoes')
      .upsert(linha, { onConflict: 'funcionario_id,data_teste' })
      .select().single();
    if (error) throw error;

    // marcações: regrava do zero
    await estado.cliente.from('disc_marcacoes').delete().eq('avaliacao_id', data.id);
    if (lanc.origem === 'marcacoes' && lanc.marcas.size) {
      const linhas = [...lanc.marcas].map(ch => ({
        avaliacao_id: data.id, linha: +ch.slice(0, -1), coluna: ch.slice(-1),
      }));
      const r = await estado.cliente.from('disc_marcacoes').insert(linhas);
      if (r.error) throw r.error;
    }

    D.avaliacoes = D.avaliacoes.filter(a => a.id !== data.id);
    D.avaliacoes.push(data);
    D.avaliacoes.sort((a, b) => String(b.data_teste).localeCompare(String(a.data_teste)));
    lanc.id = data.id; lanc.existente = true;

    desenharHistorico();
    opcoesFuncionarios($('dcFunc'), { soAtivos: $('dcSoAtivos').checked });
    $('dcFunc').value = lanc.funcionario_id;
    botao.textContent = 'Salvo';
  } catch (e) {
    alert('Não consegui salvar: ' + (e?.message || e));
    botao.textContent = 'Salvar lançamento';
  } finally {
    setTimeout(() => { botao.textContent = 'Salvar lançamento'; atualizarLanc(); }, 1400);
  }
}

async function apagarLancamento() {
  if (!lanc?.id) return;
  const f = funcionario(lanc.funcionario_id);
  if (!confirm(`Apagar o teste de ${f?.nome || 'este funcionário'} de ${dataBr(lanc.data_teste)}?`)) return;
  const { error } = await estado.cliente.from('disc_avaliacoes').delete().eq('id', lanc.id);
  if (error) { alert('Não consegui apagar: ' + error.message); return; }
  D.avaliacoes = D.avaliacoes.filter(a => a.id !== lanc.id);
  carregarLancamento(lanc.funcionario_id);
  desenharHistorico();
}

/* =============== 2) FICHA =============== */
function desenharFicha() {
  opcoesFuncionarios($('dfFunc'), { soComTeste: true, soAtivos: false });
  const id = $('dfFunc').value;
  const f = funcionario(id);
  const av = f ? ultimaDe(id) : null;
  const l = leituraDe(av);
  $('dfSaida').innerHTML = (f && l && l.principal)
    ? montarFichaDisc(f, l, D.perfis, D.combinacoes[l.principal + (l.secundario || '')]?.texto, av)
    : '';
  $('dfImprimir').disabled = !(f && l && l.principal);
}

/* =============== 3) EQUIPE =============== */
function filtrosEquipe() {
  return {
    fazenda: $('deFazenda').value,
    setor: $('deSetor').value,
    cargo: $('deCargo').value,
    situacao: $('deSit').value,
  };
}

function linhasEquipe() {
  const f = filtrosEquipe();
  return estado.funcionarios
    .filter(x => (!f.fazenda || x.fazenda === f.fazenda)
      && (!f.setor || x.setor === f.setor)
      && (!f.cargo || x.cargo === f.cargo)
      && (!f.situacao || x.situacao === f.situacao))
    .map(x => {
      const av = ultimaDe(x.id);
      return { func: x, av, leitura: leituraDe(av) };
    })
    .sort((a, b) => a.func.nome.localeCompare(b.func.nome, 'pt-BR'));
}

function preencherFiltrosEquipe() {
  const unicos = campo => [...new Set(estado.funcionarios.map(f => f[campo]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  [['deFazenda', 'fazenda'], ['deSetor', 'setor'], ['deCargo', 'cargo']].forEach(([id, campo]) => {
    const sel = $(id), atual = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' +
      unicos(campo).map(v => `<option>${esc(v)}</option>`).join('');
    sel.value = atual;
  });
}

function desenharEquipe() {
  preencherFiltrosEquipe();
  const linhas = linhasEquipe();
  const comTeste = linhas.filter(l => l.leitura?.principal);
  const contagem = { D: 0, I: 0, S: 0, C: 0 };
  comTeste.forEach(l => { contagem[l.leitura.principal]++; });
  const total = comTeste.length;

  $('deCards').innerHTML = COLUNAS.map(c => {
    const p = D.perfis[c] || PADRAO[c];
    const n = contagem[c];
    const pc = total ? Math.round(n * 1000 / total) / 10 : 0;
    return `<div class="dc-card" style="--cor:${p.cor}">
      <span class="dc-card-l">${c}</span>
      <span class="dc-card-n">${esc(p.nome)}</span>
      <span class="dc-card-v">${n}</span>
      <span class="dc-card-p">${num(pc)}% da equipe</span>
      <span class="dc-card-bar"><i style="width:${pc}%"></i></span>
    </div>`;
  }).join('');

  const sem = linhas.length - total;
  $('deCobertura').innerHTML =
    `<b>${linhas.length}</b> funcionário(s) no filtro · <b>${total}</b> com teste lançado` +
    (sem ? ` · <b>${sem}</b> ainda sem teste` : ' · todos com teste');

  // distribuição por fazenda e por setor
  const porGrupo = campo => {
    const mapa = {};
    comTeste.forEach(l => {
      const k = l.func[campo] || '—';
      mapa[k] = mapa[k] || { D: 0, I: 0, S: 0, C: 0, n: 0 };
      mapa[k][l.leitura.principal]++; mapa[k].n++;
    });
    const chaves = Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (!chaves.length) return '<div class="vazio">Sem dados para o filtro atual.</div>';
    return `<table class="dc-planilha"><thead><tr><th>${campo === 'fazenda' ? 'Fazenda' : 'Setor'}</th>
      ${COLUNAS.map(c => `<th class="ce">${c}</th>`).join('')}<th class="ce">Total</th></tr></thead>
      <tbody>${chaves.map(k => `<tr><td>${esc(k)}</td>
        ${COLUNAS.map(c => `<td class="ce">${mapa[k][c] || ''}</td>`).join('')}
        <td class="ce"><b>${mapa[k].n}</b></td></tr>`).join('')}
      <tr class="dc-total"><td>Total</td>${COLUNAS.map(c =>
        `<td class="ce">${contagem[c]}</td>`).join('')}<td class="ce">${total}</td></tr></tbody></table>`;
  };
  $('deFazendas').innerHTML = porGrupo('fazenda');
  $('deSetores').innerHTML = porGrupo('setor');

  $('deTabela').innerHTML = linhas.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>Funcionário</th><th>Cargo</th><th>Setor</th><th>Fazenda</th>
      <th>Principal</th><th>Secundário</th><th class="ce">Data</th>
    </tr></thead><tbody>${linhas.map(l => {
      const p = l.leitura?.principal, s = l.leitura?.secundario;
      return `<tr>
        <td><b>${esc(l.func.nome)}</b></td>
        <td>${esc(l.func.cargo || '—')}</td>
        <td>${esc(l.func.setor || '—')}</td>
        <td>${esc(l.func.fazenda || '—')}</td>
        <td>${p ? `<span class="dc-pin" style="background:${D.perfis[p].cor};color:${p === 'I' ? '#3d3400' : '#fff'}">${p} ${esc(D.perfis[p].nome)}</span>` : '<span class="dc-sem">sem teste</span>'}</td>
        <td>${s ? `<span class="dc-pin fraco" style="border-color:${D.perfis[s].cor};color:${D.perfis[s].cor}">${s} ${esc(D.perfis[s].nome)}</span>` : ''}</td>
        <td class="ce">${l.av ? dataBr(l.av.data_teste) : ''}</td>
      </tr>`;
    }).join('')}</tbody></table>`
    : '<div class="vazio">Nenhum funcionário no filtro.</div>';
}

function baixarCsv() {
  const linhas = linhasEquipe();
  const cab = ['Nome', 'Cargo', 'Setor', 'Fazenda', 'Situacao', 'Data do teste',
    'Principal', 'Secundario', '%D', '%I', '%S', '%C', 'Intensidade'];
  const corpo = linhas.map(l => {
    const p = l.leitura;
    return [l.func.nome, l.func.cargo || '', l.func.setor || '', l.func.fazenda || '',
      l.func.situacao || '', l.av ? dataBr(l.av.data_teste) : '',
      p?.principal ? D.perfis[p.principal].nome : '',
      p?.secundario ? D.perfis[p.secundario].nome : '',
      ...COLUNAS.map(c => p ? String(p.pct[c]).replace('.', ',') : ''),
      p?.intensidade || ''];
  });
  const csv = [cab, ...corpo]
    .map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `disc-sakuma-${hoje()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* =============== 4) CARGOS =============== */
function desenharCargos() {
  const cargos = [...new Set(estado.funcionarios
    .filter(f => f.situacao === 'ATIVO' || $('dgTodos').checked)
    .map(f => (f.cargo || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const pessoas = cargo => estado.funcionarios
    .filter(f => (f.cargo || '').trim() === cargo && (f.situacao === 'ATIVO' || $('dgTodos').checked))
    .map(f => ({ func: f, leitura: leituraDe(ultimaDe(f.id)) }));

  const opc = sel => '<option value="">—</option>' + COLUNAS.map(c =>
    `<option value="${c}"${sel === c ? ' selected' : ''}>${c} · ${esc(D.perfis[c].nome)}</option>`).join('');

  $('dgTabela').innerHTML = cargos.length ? `
    <table class="dc-planilha"><thead><tr>
      <th>Cargo</th><th class="ce">Pessoas</th><th>Predominante hoje</th>
      <th>Perfil esperado</th><th>Secundário esperado</th><th class="ce">Aderência</th>
    </tr></thead><tbody>${cargos.map(cargo => {
      const gente = pessoas(cargo);
      const comTeste = gente.filter(g => g.leitura?.principal);
      const cont = { D: 0, I: 0, S: 0, C: 0 };
      comTeste.forEach(g => cont[g.leitura.principal]++);
      const pred = COLUNAS.filter(c => cont[c]).sort((a, b) => cont[b] - cont[a])[0];
      const cfg = D.cargos[cargo] || {};
      const esperado = cfg.perfil_esperado || '';
      const aderentes = esperado ? comTeste.filter(g => g.leitura.principal === esperado).length : 0;
      const parcial = esperado ? comTeste.filter(g =>
        g.leitura.principal !== esperado && g.leitura.secundario === esperado).length : 0;
      return `<tr>
        <td><b>${esc(cargo)}</b></td>
        <td class="ce">${gente.length}${comTeste.length < gente.length ? ` <span class="dc-sem">(${comTeste.length} c/ teste)</span>` : ''}</td>
        <td>${pred ? `<span class="dc-pin" style="background:${D.perfis[pred].cor};color:${pred === 'I' ? '#3d3400' : '#fff'}">${pred} ${esc(D.perfis[pred].nome)}</span>` : '<span class="dc-sem">—</span>'}</td>
        <td><select class="dc-mini" data-cargo="${esc(cargo)}" data-campo="perfil_esperado">${opc(esperado)}</select></td>
        <td><select class="dc-mini" data-cargo="${esc(cargo)}" data-campo="perfil_secundario_esperado">${opc(cfg.perfil_secundario_esperado || '')}</select></td>
        <td class="ce">${esperado && comTeste.length
          ? `<b>${aderentes}</b>/${comTeste.length}${parcial ? ` <span class="dc-sem">+${parcial} parcial</span>` : ''}`
          : '<span class="dc-sem">—</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table>` : '<div class="vazio">Nenhum cargo no cadastro.</div>';

  $('dgTabela').querySelectorAll('select[data-cargo]').forEach(sel =>
    sel.addEventListener('change', () => salvarCargo(sel.dataset.cargo, sel.dataset.campo, sel.value)));

  // quem destoa
  const fora = [];
  cargos.forEach(cargo => {
    const cfg = D.cargos[cargo];
    if (!cfg?.perfil_esperado) return;
    pessoas(cargo).forEach(g => {
      if (!g.leitura?.principal) return;
      if (g.leitura.principal === cfg.perfil_esperado) return;
      fora.push({ ...g, cargo, esperado: cfg.perfil_esperado,
        parcial: g.leitura.secundario === cfg.perfil_esperado });
    });
  });
  $('dgFora').innerHTML = fora.length ? fora.map(x => `
    <div class="item" style="grid-template-columns:1fr auto">
      <span>
        <span class="nome">${esc(x.func.nome)}</span><br>
        <span class="sub">${esc(x.cargo)} · esperado ${esc(D.perfis[x.esperado].nome)} · tem ${esc(D.perfis[x.leitura.principal].nome)}${x.leitura.secundario ? ' + ' + esc(D.perfis[x.leitura.secundario].nome) : ''}</span>
      </span>
      <span class="tag ${x.parcial ? 'ativo' : 'inativo'}">${x.parcial ? 'aderência parcial' : 'divergente'}</span>
    </div>`).join('')
    : '<div class="vazio">Nada a listar — defina o perfil esperado dos cargos acima.</div>';
}

async function salvarCargo(cargo, campo, valor) {
  const atual = D.cargos[cargo] || { cargo };
  const linha = { ...atual, [campo]: valor || null, atualizado_em: new Date().toISOString() };
  D.cargos[cargo] = linha;
  const { error } = await estado.cliente.from('disc_cargos_esperado')
    .upsert(linha, { onConflict: 'cargo' });
  if (error) alert('Não consegui salvar o cargo: ' + error.message);
  desenharCargos();
}

/* =============== 5) TEXTOS =============== */
const CAMPOS_PERFIL = [
  ['resumo', 'Frase-resumo'], ['comportamentos', 'Comportamentos'],
  ['pontos_fortes', 'Pontos fortes'], ['pontos_atencao', 'Pontos de atenção'],
  ['comunicacao', 'Como se comunicar'], ['motivadores', 'O que motiva e o que desmotiva'],
  ['ambiente_ideal', 'Onde rende mais'], ['como_delegar', 'Como delegar'],
];

function desenharTextos() {
  const sel = $('dtPerfil');
  if (!sel.options.length) {
    sel.innerHTML = COLUNAS.map(c => `<option value="${c}">${c} · ${esc(D.perfis[c].nome)}</option>`).join('');
  }
  const p = D.perfis[sel.value || 'D'];
  $('dtCampos').innerHTML = CAMPOS_PERFIL.map(([k, rot]) => `
    <label class="campo plena">${esc(rot)}
      <textarea data-campo="${k}" rows="${k === 'resumo' ? 2 : 3}">${esc(p[k] || '')}</textarea>
    </label>`).join('');

  const combos = [];
  COLUNAS.forEach(a => COLUNAS.forEach(b => { if (a !== b) combos.push(a + b); }));
  $('dtCombos').innerHTML = combos.map(k => {
    const c = D.combinacoes[k] || {};
    return `<label class="campo plena">${esc(D.perfis[k[0]].nome)} com ${esc(D.perfis[k[1]].nome)}
      <textarea data-combo="${k}" rows="3">${esc(c.texto || '')}</textarea>
    </label>`;
  }).join('');
}

async function salvarTextos() {
  const botao = $('dtSalvar');
  botao.disabled = true; botao.textContent = 'Salvando...';
  try {
    const cod = $('dtPerfil').value;
    const linha = { codigo: cod, atualizado_em: new Date().toISOString() };
    $('dtCampos').querySelectorAll('textarea[data-campo]')
      .forEach(t => { linha[t.dataset.campo] = t.value.trim() || null; });
    const r1 = await estado.cliente.from('disc_perfis').update(linha).eq('codigo', cod);
    if (r1.error) throw r1.error;
    Object.assign(D.perfis[cod], linha);

    const combos = [...$('dtCombos').querySelectorAll('textarea[data-combo]')].map(t => ({
      principal: t.dataset.combo[0], secundario: t.dataset.combo[1],
      titulo: `${D.perfis[t.dataset.combo[0]].nome} com ${D.perfis[t.dataset.combo[1]].nome}`,
      texto: t.value.trim() || null, atualizado_em: new Date().toISOString(),
    }));
    const r2 = await estado.cliente.from('disc_combinacoes')
      .upsert(combos, { onConflict: 'principal,secundario' });
    if (r2.error) throw r2.error;
    combos.forEach(c => { D.combinacoes[c.principal + c.secundario] = c; });
    botao.textContent = 'Salvo';
  } catch (e) {
    alert('Não consegui salvar os textos: ' + (e?.message || e));
    botao.textContent = 'Salvar textos';
  } finally {
    setTimeout(() => { botao.textContent = 'Salvar textos'; botao.disabled = false; }, 1400);
  }
}

/* =============== ligações =============== */
export function ligarDisc() {
  document.querySelectorAll('.subaba').forEach(b =>
    b.addEventListener('click', () => abrirSub(b.dataset.sub)));

  $('dcFunc').addEventListener('change', () => {
    const id = $('dcFunc').value;
    if (!id) { lanc = null; atualizarLanc(); desenharHistorico(); return; }
    carregarLancamento(id);
    desenharHistorico();
  });
  $('dcSoAtivos').addEventListener('change', () =>
    opcoesFuncionarios($('dcFunc'), { soAtivos: $('dcSoAtivos').checked }));
  document.querySelectorAll('[data-origem]').forEach(b =>
    b.addEventListener('click', () => {
      if (!lanc) return;
      lanc.origem = b.dataset.origem;
      atualizarLanc();
    }));
  COLUNAS.forEach(c => $('dcT' + c).addEventListener('input', () => {
    if (!lanc) return;
    lanc.totais[c] = parseFloat($('dcT' + c).value.replace(',', '.')) || 0;
    atualizarLanc();
  }));
  $('dcData').addEventListener('change', () => { if (lanc) lanc.data_teste = $('dcData').value; });
  $('dcLimpar').addEventListener('click', () => {
    if (!lanc) return;
    lanc.marcas.clear();
    COLUNAS.forEach(c => { lanc.totais[c] = 0; $('dcT' + c).value = ''; });
    atualizarLanc();
  });
  $('dcSalvar').addEventListener('click', salvarLancamento);
  $('dcApagar').addEventListener('click', apagarLancamento);

  $('dfFunc').addEventListener('change', desenharFicha);
  $('dfImprimir').addEventListener('click', () => window.print());
  $('dfZoom').addEventListener('input', () => {
    const z = $('dfZoom').value;
    $('dfZoomV').textContent = z + '%';
    $('dfSaida').style.transform = `scale(${z / 100})`;
    $('dfSaida').style.transformOrigin = 'top center';
  });

  ['deFazenda', 'deSetor', 'deCargo', 'deSit'].forEach(id =>
    $(id).addEventListener('change', desenharEquipe));
  $('deCsv').addEventListener('click', baixarCsv);

  $('dgTodos').addEventListener('change', desenharCargos);

  $('dtPerfil').addEventListener('change', desenharTextos);
  $('dtSalvar').addEventListener('click', salvarTextos);
}

export function limparDisc() {
  D.carregado = false; D.autorizado = false;
  D.avaliacoes = []; lanc = null;
  $('abaDisc').hidden = true;
}
