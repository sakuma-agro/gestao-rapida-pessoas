// organograma.js — RH › Organograma (29/09/2026)
//
// A hierarquia é por FUNÇÃO, decisão dele: cada função diz a quem responde
// (jor_funcoes.superior_id) e as pessoas entram sozinhas pela função do
// Cadastro Nível 1 (jor_vinculos.funcao_id). Trocou alguém de função no
// cadastro, o organograma já mostra no lugar novo.
//
// Desenho em HTML (caixas com borda e linhas de borda), não em fundo colorido:
// no papel o Chrome não imprime fundo, e borda imprime sempre.

import { estado } from './store.js';
import { montarMulti } from './multisel.js';
import { mostrar, imprimir } from './jornada-relatorios.js';
import { pode } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const limpo = s => String(s || '').trim();
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const br = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';

const NIVEIS = ['Estratégico', 'Tático', 'Operacional'];
const clsNivel = n => ({ 'Estratégico': 'og-estr', 'Tático': 'og-tat', 'Operacional': 'og-oper' }[n] || 'og-sem');

const est = {
  carregado: false,
  funcoes: [],
  vinculos: [],
  fazendas: [],
  unidades: [],
  destinos: [],
  dp: '',          // '' = todos; senão o id do destino de DP (29/09/2026)
  nomes: true,
  vazias: false,
  editar: false,
  erro: '',
};

async function carregar() {
  const c = estado.cliente;
  if (!c) throw new Error('Sem conexão com o banco.');
  const [f, v, u, d] = await Promise.all([
    c.from('jor_funcoes').select('id,nome,nivel,ordem,superior_id,categoria,ativo').order('ordem', { nullsFirst: false }).order('nome'),
    c.from('jor_vinculos').select('funcionario_id,funcao_id,unidade_id,ativo'),
    c.from('jor_unidades').select('id,destino_id'),
    c.from('jor_destinos_dp').select('id,nome,ativo').order('nome'),
  ]);
  if (f.error) throw f.error;
  if (v.error) throw v.error;
  est.vinculos = (v.data || []).filter(x => x.ativo !== false);
  /* Função inativa que ainda tem gente ligada (a "Tratorista" e a "Trabalhador
     Rural" antigas, sem grau) continua no desenho — senão a pessoa sumia. */
  const usadas = new Set(est.vinculos.map(x => x.funcao_id));
  est.funcoes = (f.data || []).filter(x => x.ativo !== false || usadas.has(x.id))
    .map(x => ({ ...x, _antiga: x.ativo === false }));
  est.unidades = u.error ? [] : (u.data || []);
  est.destinos = d.error ? [] : (d.data || []).filter(x => x.ativo !== false);
  est.carregado = true;
}

/* ---------------- montagem da árvore ---------------- */

const ordem = (a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || a.nome.localeCompare(b.nome, 'pt-BR');

function pessoasPorFuncao() {
  const ativos = new Map(estado.funcionarios
    .filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
    .filter(f => !est.fazendas.length || est.fazendas.some(z => z === '-' ? !limpo(f.fazenda) : limpo(f.fazenda) === z))
    .map(f => [f.id, f]));
  const mapa = new Map();
  const comFuncao = new Set();
  /* Organograma por DP (29/09/2026): cada pessoa entra no DP da unidade dela.
     O nível Estratégico (Diretor, Gerente Administrativo) é comum aos dois. */
  const destinoDe = v => est.unidades.find(u => u.id === v.unidade_id)?.destino_id || '';
  const nivelDe = id => est.funcoes.find(x => x.id === id)?.nivel || '';
  const vale = v => !est.dp || destinoDe(v) === est.dp || nivelDe(v.funcao_id) === 'Estratégico';
  for (const v of est.vinculos) {
    const f = ativos.get(v.funcionario_id);
    if (!f || !vale(v)) { ativos.delete(v.funcionario_id); continue; }
    if (!v.funcao_id) continue;
    comFuncao.add(f.id);
    if (!mapa.has(v.funcao_id)) mapa.set(v.funcao_id, []);
    mapa.get(v.funcao_id).push(f);
  }
  mapa.forEach(l => l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  if (est.dp) {                      // sem vínculo não tem DP: fica fora do recorte de um DP
    const comVinculo = new Set(est.vinculos.map(v => v.funcionario_id));
    [...ativos.keys()].forEach(id => { if (!comVinculo.has(id)) ativos.delete(id); });
  }
  const semFuncao = [...ativos.values()].filter(f => !comFuncao.has(f.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { mapa, semFuncao, total: ativos.size };
}

/** Árvore de funções. Função que aponta para superior inexistente vira topo. */
function arvore(mapa) {
  const ids = new Set(est.funcoes.map(f => f.id));
  const filhos = new Map();
  const raizes = [];
  for (const f of est.funcoes) {
    if (f.superior_id && ids.has(f.superior_id) && f.superior_id !== f.id) {
      if (!filhos.has(f.superior_id)) filhos.set(f.superior_id, []);
      filhos.get(f.superior_id).push(f);
    } else raizes.push(f);
  }
  const no = (f, visto = new Set()) => {
    if (visto.has(f.id)) return null;           // proteção contra ciclo
    visto.add(f.id);
    const sub = (filhos.get(f.id) || []).sort(ordem).map(x => no(x, new Set(visto))).filter(Boolean);
    const gente = mapa.get(f.id) || [];
    const total = gente.length + sub.reduce((s, x) => s + x.total, 0);
    return { f, gente, sub, total };
  };
  const podar = n => {
    n.sub = n.sub.filter(x => est.vazias || x.total > 0).map(podar);
    return n;
  };
  return juntar(raizes.sort(ordem).map(r => no(r)).filter(Boolean))
    .filter(n => est.vazias || n.total > 0).map(podar);
}

/* Categoria (29/09/2026): irmãs da mesma categoria — Tratorista I, II, III e
   IV debaixo do mesmo chefe — viram uma caixa só, "Tratorista". Cada pessoa
   leva o grau ao lado do nome. Vale na tela e no papel. */
const cat = f => limpo(f.categoria);
const grau = (f, c) => { const n = limpo(f.nome); return n.toLowerCase().startsWith(c.toLowerCase()) ? n.slice(c.length).trim() : n; };
function juntar(irmas) {
  const out = [];
  const grupos = new Map();
  for (const n of irmas) {
    n.sub = juntar(n.sub);
    const c = cat(n.f);
    if (!c) { out.push(n); continue; }
    let g = grupos.get(c.toLowerCase());
    if (!g) {
      g = { f: { id: 'cat:' + c, nome: c, nivel: n.f.nivel, ordem: n.f.ordem, categoria: c }, gente: [], sub: [], total: 0, membros: [] };
      grupos.set(c.toLowerCase(), g);
      out.push(g);
    }
    g.membros.push(n.f);
    (g.nos ||= []).push(n);
    if ((n.f.ordem ?? 9999) < (g.f.ordem ?? 9999)) g.f.ordem = n.f.ordem;
    g.gente.push(...n.gente.map(p => ({ ...p, _grau: p._grau || grau(n.f, c) })));
    g.sub.push(...n.sub);
    g.total += n.total;
  }
  grupos.forEach(g => {
    g.gente.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    g.sub = juntar(g.sub);
  });
  // Categoria com uma função só (ex.: Motorista = Motorista) fica como estava.
  return out.map(n => n.nos && n.nos.length === 1 ? n.nos[0] : n).sort((a, b) => ordem(a.f, b.f));
}

/* Descendentes, para não deixar escolher como chefe alguém que está abaixo. */
function abaixoDe(id) {
  const out = new Set();
  const pilha = [id];
  while (pilha.length) {
    const x = pilha.pop();
    for (const f of est.funcoes) if (f.superior_id === x && !out.has(f.id)) { out.add(f.id); pilha.push(f.id); }
  }
  return out;
}

const caixa = (n, papel = false) => `
  <div class="og-caixa ${clsNivel(n.f.nivel)}">
    <b>${esc(n.f.nome)}</b>
    <span class="og-meta">${esc(n.f.nivel || 'sem nível')} · ${n.gente.length} ${n.gente.length === 1 ? 'pessoa' : 'pessoas'}${n.membros ? ` · ${n.membros.length} graus` : ''}</span>
    ${est.nomes && n.gente.length ? `<ul class="og-nomes">${n.gente.map(p => `<li>${esc(p.nome)}${p._grau ? ` <em class="og-grau">${esc(p._grau)}</em>` : ''}${!papel && limpo(p.fazenda) ? ` <small>${esc(p.fazenda)}</small>` : ''}</li>`).join('')}</ul>` : ''}
  </div>`;

const ramo = (n, papel) => `<li>${caixa(n, papel)}${n.sub.length ? `<ul>${n.sub.map(x => ramo(x, papel)).join('')}</ul>` : ''}</li>`;
const desenhoArvore = (raizes, papel = false) => raizes.length
  ? `<div class="og-arvore${papel ? ' og-papel' : ''}"><ul>${raizes.map(r => ramo(r, papel)).join('')}</ul></div>`
  : '<p class="vazio">Nenhuma função com gente neste recorte.</p>';

const nomeDp = () => est.dp ? (est.destinos.find(d => d.id === est.dp)?.nome || '') : '';
const recorte = () => [nomeDp(), est.fazendas.length ? est.fazendas.map(z => z === '-' ? 'sem fazenda' : z).join(', ') : 'todas as fazendas'].filter(Boolean).join(' · ');

/* ---------------- documento ---------------- */

function documento() {
  const { mapa, semFuncao, total } = pessoasPorFuncao();
  const raizes = arvore(mapa);
  const nomeSup = id => est.funcoes.find(f => f.id === id)?.nome || '—';
  const linhas = est.funcoes.slice().sort(ordem)
    .filter(f => est.vazias || (mapa.get(f.id) || []).length)
    .map(f => `<tr><td>${esc(f.nome)}</td><td>${esc(cat(f) || '—')}</td><td>${esc(f.nivel || '—')}</td><td>${esc(f.superior_id ? nomeSup(f.superior_id) : 'topo')}</td>
      <td class="rel-num">${(mapa.get(f.id) || []).length}</td></tr>`).join('');
  return `
  <article class="rel rel-paisagem og-doc">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>ORGANOGRAMA${nomeDp() ? ' · ' + esc(nomeDp().toUpperCase()) : ''}</h1><p>SAKUMA Agronegócios · hierarquia por função</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(recorte())} · ${total} pessoa(s) ativa(s)</span></div>
    </header>
    ${desenhoArvore(raizes, true)}
    ${semFuncao.length ? `<p class="rel-nota"><b>${semFuncao.length} pessoa(s) sem função no Cadastro Nível 1:</b> ${semFuncao.map(p => esc(p.nome)).join(', ')}.</p>` : ''}
    <h2 class="rel-secao">Funções e a quem respondem</h2>
    <table class="rel-tabela"><thead><tr><th>Função</th><th>Categoria</th><th>Nível</th><th>Responde a</th><th class="rel-num">Pessoas</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="5" class="rel-vazio">Nenhuma função.</td></tr>'}</tbody></table>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}

function csv() {
  const { mapa } = pessoasPorFuncao();
  const nomeSup = id => est.funcoes.find(f => f.id === id)?.nome || '';
  const l = [['Funcao', 'Categoria', 'Nivel', 'Responde a', 'Pessoa', 'Fazenda']];
  est.funcoes.slice().sort(ordem).forEach(f => {
    const g = mapa.get(f.id) || [];
    if (!g.length) { if (est.vazias) l.push([f.nome, cat(f), f.nivel || '', nomeSup(f.superior_id), '', '']); return; }
    g.forEach(p => l.push([f.nome, cat(f), f.nivel || '', nomeSup(f.superior_id), p.nome, limpo(p.fazenda)]));
  });
  const limpar = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + l.map(r => r.map(limpar).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `organograma-${(nomeDp() || 'todos').replace(/\W+/g, '').toLowerCase()}-${hoje()}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------- a tela ---------------- */

export async function abrirOrganograma() {
  const alvo = $('telaRhOrganograma');
  if (!alvo) return;
  if (!est.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o organograma…</p></div>';
    try { await carregar(); est.erro = ''; }
    catch (e) { est.erro = e.message || String(e); }
  }
  desenhar();
}

export function limparOrganograma() { est.carregado = false; est.funcoes = []; est.vinculos = []; }

function desenhar() {
  const alvo = $('telaRhOrganograma');
  if (est.erro) {
    alvo.innerHTML = `<div class="cartao"><div class="vazio">Não deu para abrir o organograma: ${esc(est.erro)}</div></div>`;
    return;
  }
  const { mapa, semFuncao, total } = pessoasPorFuncao();
  const raizes = arvore(mapa);
  const semChefe = est.funcoes.filter(f => !f.superior_id).length;
  const editavel = pode('rh');

  alvo.innerHTML = `
    <div class="cartao">
      <div class="linha entre">
        <div><h2 style="margin:0">Organograma</h2>
          <p class="dica" style="margin:2px 0 0">Hierarquia por função — as pessoas entram pela função do Cadastro Nível 1.</p></div>
        <span class="acoes">
          <button class="btn" type="button" id="ogCsv">Excel</button>
          <button class="btn" type="button" id="ogVer">Visualizar</button>
          <button class="btn principal" type="button" id="ogImp">Imprimir</button>
        </span>
      </div>
      <div class="rel-abas og-dps" role="tablist">
        <button type="button" role="tab" class="rel-aba${!est.dp ? ' ativa' : ''}" data-og-dp="">Todos</button>
        ${est.destinos.map(d => `<button type="button" role="tab" class="rel-aba${est.dp === d.id ? ' ativa' : ''}" data-og-dp="${d.id}">${esc(d.nome)}</button>`).join('')}
      </div>
      ${est.dp ? '<p class="dica og-dica">Recorte por destino de DP: cada pessoa entra no DP da unidade dela. O nível <b>Estratégico</b> aparece nos dois organogramas.</p>' : ''}
      <div class="jor-barra og-barra">
        <div class="cr-campo">Fazenda <div id="ogFaz"></div></div>
        <label class="og-chk"><input type="checkbox" id="ogNomes" ${est.nomes ? 'checked' : ''}> Mostrar nomes</label>
        <label class="og-chk"><input type="checkbox" id="ogVazias" ${est.vazias ? 'checked' : ''}> Mostrar funções sem ninguém</label>
        ${editavel ? `<button class="btn${est.editar ? ' principal' : ''}" type="button" id="ogEditar">${est.editar ? 'Concluir' : 'Definir hierarquia'}</button>` : ''}
        <span class="dc-sem">${total} pessoa(s) ativa(s)</span>
      </div>
      <div class="og-legenda"><span class="og-estr">Estratégico</span><span class="og-tat">Tático</span><span class="og-oper">Operacional</span></div>
      ${semChefe === est.funcoes.length && est.funcoes.length > 1 ? `<div class="jor-caixa alerta">Nenhuma função tem chefe definido ainda, por isso todas aparecem lado a lado.
        Clique em <b>Definir hierarquia</b> e diga a quem cada função responde.</div>` : ''}
      ${est.editar ? editor() : ''}
      <div class="og-rola">${desenhoArvore(raizes)}</div>
      ${semFuncao.length ? `<div class="jor-caixa"><b>${semFuncao.length} pessoa(s) ativa(s) sem função</b> no Cadastro Nível 1 — não entram no desenho:
        ${semFuncao.map(p => esc(p.nome)).join(', ')}.</div>` : ''}
    </div>`;

  const semFaz = estado.funcionarios.some(f => !limpo(f.fazenda));
  const fazendas = [...new Set(estado.funcionarios.map(f => limpo(f.fazenda)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  montarMulti($('ogFaz'), {
    opcoes: [...fazendas.map(z => [z, z]), ...(semFaz ? [['-', 'Sem fazenda']] : [])],
    marcados: est.fazendas, todas: 'Todas as fazendas', plural: 'fazendas',
  });
  $('ogFaz').addEventListener('change', () => { est.fazendas = $('ogFaz').valores; desenhar(); });
  alvo.querySelectorAll('[data-og-dp]').forEach(b => b.addEventListener('click', () => { est.dp = b.dataset.ogDp; desenhar(); }));
  $('ogNomes').addEventListener('change', ev => { est.nomes = ev.target.checked; desenhar(); });
  $('ogVazias').addEventListener('change', ev => { est.vazias = ev.target.checked; desenhar(); });
  $('ogEditar')?.addEventListener('click', () => { est.editar = !est.editar; if (est.editar) est.vazias = true; desenhar(); });
  /* Árvore larga não cabe na folha deitada: encolhe o desenho até caber. */
  const verDoc = () => {
    mostrar(documento(), { barra: true });
    const arv = document.querySelector('#jorImpressao .og-papel');
    if (arv) {
      arv.style.zoom = '';
      const larg = arv.parentElement.clientWidth - 8;
      if (arv.scrollWidth > larg) arv.style.zoom = String(Math.max(0.35, larg / arv.scrollWidth));
    }
  };
  $('ogVer').addEventListener('click', verDoc);
  $('ogImp').addEventListener('click', () => { verDoc(); setTimeout(() => imprimir(), 300); });
  $('ogCsv').addEventListener('click', csv);

  alvo.querySelectorAll('[data-og-cat]').forEach(i => i.addEventListener('change', async () => {
    const f = est.funcoes.find(x => x.id === i.dataset.ogCat);
    const antes = f.categoria;
    f.categoria = limpo(i.value) || null;
    i.disabled = true;
    const { error } = await estado.cliente.from('jor_funcoes').update({ categoria: f.categoria }).eq('id', f.id);
    if (error) { f.categoria = antes; alert('Não deu para gravar: ' + error.message); }
    desenhar();
  }));
  alvo.querySelectorAll('[data-og-sup]').forEach(s => s.addEventListener('change', async () => {
    const f = est.funcoes.find(x => x.id === s.dataset.ogSup);
    const antes = f.superior_id;
    f.superior_id = s.value || null;
    s.disabled = true;
    const { error } = await estado.cliente.from('jor_funcoes').update({ superior_id: f.superior_id }).eq('id', f.id);
    if (error) { f.superior_id = antes; alert('Não deu para gravar: ' + error.message); }
    desenhar();
  }));
}

function editor() {
  const lista = est.funcoes.slice().sort(ordem);
  return `
    <div class="og-editor">
      <p class="dica" style="margin:0 0 8px">Para cada função, escolha a quem ela responde. Grava na hora. Deixe <b>— topo —</b> para quem não responde a ninguém.
        <b>Categoria</b> junta funções numa caixa só (ex.: Tratorista I a IV = Tratorista); deixe em branco para a função ter caixa própria.</p>
      <datalist id="ogCategorias">${[...new Set(est.funcoes.map(cat).filter(Boolean))].sort().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <table class="dc-planilha"><thead><tr><th>Função</th><th>Nível</th><th>Categoria</th><th>Responde a</th></tr></thead><tbody>
        ${lista.map(f => {
          const proibidos = abaixoDe(f.id); proibidos.add(f.id);
          return `<tr><td><b>${esc(f.nome)}</b>${f._antiga ? ' <span class="tag neutra" title="Função desativada no cadastro que ainda tem gente ligada">antiga</span>' : ''}</td><td class="dc-sem">${esc(f.nivel || '—')}</td>
            <td><input class="dc-mini og-cat" list="ogCategorias" data-og-cat="${f.id}" value="${esc(cat(f))}" placeholder="—"></td>
            <td><select class="dc-mini" data-og-sup="${f.id}">
              <option value="">— topo —</option>
              ${lista.filter(x => !proibidos.has(x.id)).map(x => `<option value="${x.id}"${x.id === f.superior_id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}
            </select></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
}
