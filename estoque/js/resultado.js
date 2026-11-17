// resultado.js — Contagem › Resultado (17/11/2026, pedido do Guilherme).
//
// "Um local onde eu vou ver o resultado das contagens: o item, o que tem em
// cada fazenda — uma coluna de cada fazenda — e o que eu preciso comprar",
// com uma coluna só somando o que falta em todas as fazendas.
//
// De cada fazenda vale a última contagem FECHADA daquele tipo (EPIs, Material
// de limpeza…) — est_contagem_grupos fechado, ou a contagem inteira fechada
// antes de existir o fechamento por tipo. Uma contagem nova, aberta e ainda
// vazia, não esconde o resultado da anterior.
//
// Comprar: em cada fazenda onde o item ficou igual ou abaixo do mínimo da
// fazenda, entra o "pedir" do cadastro (ou, sem ele, o que falta para o
// mínimo). A coluna soma todas as fazendas.
import {
  $, esc, pronto, todos, locais as todosLocais, podeLocal, linhasDe, itensOrdenados, contaNoLocal,
  comMinimoDo, temMinimo, precisaRepor, mostrarNumero, dataBR, rodadaDe, GRUPOS,
} from './dados.js';
import { enviarWhatsapp } from './pdf.js';

const locais = () => todosLocais().filter(l => podeLocal(l.id));
const CHAVE = 'estoque.resultadoGrupo';
let grupo = 'EPIs';
let soComprar = false;
let busca = '';
try { grupo = localStorage.getItem(CHAVE) || grupo; } catch { /* sem localStorage */ }

const temQtd = l => !!l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '';
const grupoDe = i => (i && i.grupo) || 'Outros';

/** A última contagem fechada do tipo em cada fazenda: { contagem, data, quem }. */
function ultimaFechada(localId, g) {
  const contagens = [...new Map(todos('est_contagens').filter(c => c.local_id === localId).map(c => [c.id, c])).values()];
  const cgs = new Map();
  todos('est_contagem_grupos').forEach(x => cgs.set(x.id, x));   // a última versão de cada um
  const opcoes = [];
  for (const c of contagens) {
    const cg = cgs.get(c.id + ':' + g);
    if (cg && cg.ativo !== false) {
      if (cg.status === 'fechada') opcoes.push({ c, data: cg.data_contagem || c.data_contagem || '', em: cg.fechada_em || '', quem: cg.fechada_por || '' });
    } else if (c.status === 'fechada' && linhasDe(c.id).some(l => temQtd(l) && grupoDe(itemPorId().get(l.item_id)) === g)) {
      opcoes.push({ c, data: c.data_contagem || '', em: c.fechada_em || '', quem: c.fechada_por || '' });
    }
  }
  opcoes.sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.em).localeCompare(String(a.em))
    || b.c.mes.localeCompare(a.c.mes) || rodadaDe(b.c) - rodadaDe(a.c));
  return opcoes[0] || null;
}

let cacheItens = null;
const itemPorId = () => cacheItens || (cacheItens = new Map(todos('est_itens').map(i => [i.id, i])));

const numero = v => Number(v) || 0;
/** Quanto comprar para uma fazenda: o "pedir" do cadastro; sem ele, o que falta para o mínimo. */
function aComprar(item, qtd) {
  if (!precisaRepor(item, qtd)) return 0;
  const p = item.pedido_reposicao;
  if (p !== null && p !== undefined && p !== '') return numero(p);
  return Math.max(numero(item.estoque_minimo) - numero(qtd), 0);
}

/** Monta a tabela: fazendas (colunas) e itens (linhas). */
function montar() {
  cacheItens = null;
  const fazendas = locais().map(l => ({ local: l, ref: ultimaFechada(l.id, grupo) }));
  const comContagem = fazendas.filter(f => f.ref);
  const semContagem = fazendas.filter(f => !f.ref);
  const linhasPor = new Map(comContagem.map(f => [f.local.id, new Map(linhasDe(f.ref.c.id).map(l => [l.item_id, l]))]));
  const itens = itensOrdenados().filter(i => grupoDe(i) === grupo);
  const linhas = [];
  for (const item of itens) {
    let total = 0, comprar = 0, algum = false;
    const cel = comContagem.map(f => {
      const ln = linhasPor.get(f.local.id).get(item.id);
      const im = comMinimoDo(item, f.local.id);
      const conta = contaNoLocal(item, f.local.id);
      /* Item com mínimo na fazenda que não apareceu na contagem fechada: não
         tinha nada na prateleira — vale zero. Sem mínimo e sem linha: em branco. */
      let qtd = temQtd(ln) ? numero(ln.quantidade) : null;
      if (qtd === null && conta && temMinimo(im) && im.minimo_da_fazenda) qtd = 0;
      if (qtd !== null) { algum = true; total += qtd; }
      const falta = qtd !== null && precisaRepor(im, qtd);
      const c = qtd !== null ? aComprar(im, qtd) : 0;
      comprar += c;
      return { qtd, falta, minimo: temMinimo(im) ? im.estoque_minimo : null };
    });
    // zerado em todas as fazendas e nada a comprar: não ocupa linha
    if (!algum || (!total && !comprar)) continue;
    linhas.push({ item, cel, total, comprar });
  }
  return { comContagem, semContagem, linhas };
}

function filtradas(linhas) {
  const b = busca.trim().toLowerCase();
  return linhas.filter(r => (!soComprar || r.comprar > 0) && (!b || String(r.item.nome).toLowerCase().includes(b)));
}

const cab = f => `${f.local.nome}`;
const dataCab = f => f.ref.data ? dataBR(f.ref.data) : '';

export function desenharResultado() {
  const alvo = $('ctResCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const grupos = [...new Set(todos('est_itens').filter(i => i.ativo !== false).map(grupoDe))]
    .sort((a, b) => (GRUPOS.indexOf(a) + 1 || 99) - (GRUPOS.indexOf(b) + 1 || 99));
  if (!grupos.includes(grupo) && grupos.length) grupo = grupos[0];
  const { comContagem, semContagem, linhas } = montar();
  const lista = filtradas(linhas);
  const nComprar = linhas.filter(r => r.comprar > 0).length;
  const foco = document.activeElement && document.activeElement.id === 'resBusca';

  alvo.innerHTML = `
    <div class="grade">
      <label class="campo">Tipo <select id="resGrupo">${grupos.map(g =>
        `<option${g === grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="campo">Procurar item <input id="resBusca" type="search" value="${esc(busca)}" placeholder="nome do item"></label>
    </div>
    <div class="barra">
      <label class="es-check"><input type="checkbox" id="resSoComprar"${soComprar ? ' checked' : ''}> Só o que precisa comprar</label>
      <span class="dc-sem">${linhas.length} itens · ${nComprar} para comprar</span>
    </div>
    ${semContagem.length ? `<p class="es-nota">Sem contagem fechada de ${esc(grupo)}: ${semContagem.map(f => esc(f.local.nome)).join(', ')}.</p>` : ''}
    ${!comContagem.length ? `<div class="vazio">Nenhuma contagem fechada de ${esc(grupo)} ainda.</div>` : `
    <div class="es-larga res-tab-caixa"><table class="dc-planilha res-tab"><thead><tr>
      <th>Item</th><th class="ce">Un.</th>
      ${comContagem.map(f => `<th class="ce">${esc(cab(f))}<small>${esc(dataCab(f))}</small></th>`).join('')}
      <th class="ce">Total</th><th class="ce res-comprar">Comprar</th></tr></thead>
    <tbody>${lista.map(r => `<tr>
      <td>${esc(r.item.nome)}</td><td class="ce">${esc(r.item.unidade || '')}</td>
      ${r.cel.map(c => `<td class="ce${c.falta ? ' res-falta' : ''}"${c.minimo !== null ? ` title="mínimo ${esc(mostrarNumero(c.minimo))}"` : ''}>${c.qtd === null ? '—' : esc(mostrarNumero(c.qtd))}</td>`).join('')}
      <td class="ce"><strong>${esc(mostrarNumero(r.total))}</strong></td>
      <td class="ce res-comprar">${r.comprar > 0 ? `<strong>${esc(mostrarNumero(r.comprar))}</strong>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="${comContagem.length + 4}" class="ce">Nada para mostrar.</td></tr>`}</tbody></table></div>
    <p class="es-nota">Em vermelho: a fazenda está no mínimo ou abaixo. <strong>Comprar</strong> soma, de todas as fazendas,
      a quantidade de pedido cadastrada (Cadastros › Produtos, mínimo da fazenda). Item com mínimo que não apareceu na contagem conta como zero.</p>
    <div class="barra fim">
      <button class="btn btn-zap" type="button" id="resWhats"><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar PDF no WhatsApp</button>
      <button class="btn principal" type="button" id="resImprimir">Imprimir</button>
    </div>`}`;

  $('resGrupo').addEventListener('change', e => {
    grupo = e.target.value;
    try { localStorage.setItem(CHAVE, grupo); } catch { /* sem localStorage */ }
    desenharResultado();
  });
  $('resSoComprar').addEventListener('change', e => { soComprar = e.target.checked; desenharResultado(); });
  const ib = $('resBusca');
  ib.addEventListener('input', e => { busca = e.target.value; desenharResultado(); });
  if (foco) { ib.focus(); ib.setSelectionRange(ib.value.length, ib.value.length); }
  $('resImprimir')?.addEventListener('click', () => { montarFolha(comContagem, lista); setTimeout(() => window.print(), 50); });
  $('resWhats')?.addEventListener('click', ev => enviarWhatsapp(pdf(comContagem, lista), ev.currentTarget));
}

const subtitulo = comContagem => `${grupo} · ${comContagem.map(f => f.local.nome + (dataCab(f) ? ' ' + dataCab(f) : '')).join(' · ')}${soComprar ? ' · só o que precisa comprar' : ''}`;

function pdf(comContagem, lista) {
  const hoje = new Date();
  return {
    titulo: 'Resultado da Contagem',
    subtitulo: subtitulo(comContagem) + ' · emitido em ' + hoje.toLocaleDateString('pt-BR'),
    arquivo: `Resultado da Contagem ${grupo} ${hoje.toISOString().slice(0, 10)}`,
    paisagem: comContagem.length > 3,
    secoes: [{
      titulo: grupo,
      head: ['Item', 'Un.', ...comContagem.map(f => f.local.nome + (dataCab(f) ? '\n' + dataCab(f) : '')), 'Total', 'Comprar'],
      centro: [1, ...comContagem.map((_, k) => k + 2), comContagem.length + 2, comContagem.length + 3],
      body: lista.map(r => [r.item.nome, r.item.unidade || '', ...r.cel.map(c => c.qtd === null ? '—' : mostrarNumero(c.qtd) + (c.falta ? ' !' : '')),
        mostrarNumero(r.total), r.comprar > 0 ? mostrarNumero(r.comprar) : '']),
    }],
    notas: { titulo: '', texto: ['"!" = a fazenda está no mínimo ou abaixo. Comprar = soma de todas as fazendas.'] },
  };
}

/** Folha A4 no padrão SAKUMA: marca no alto, tabela com grade, LOP no pé. */
function montarFolha(comContagem, lista) {
  $('resFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Resultado da Contagem</h1>
        <p>${esc(subtitulo(comContagem))} · emitido em ${esc(new Date().toLocaleDateString('pt-BR'))}</p>
      </div>
    </div>
    <table class="rel-tab" style="margin-top:6mm"><thead><tr><th>Item</th><th class="ce">Un.</th>
      ${comContagem.map(f => `<th class="ce">${esc(f.local.nome)}${dataCab(f) ? '<br>' + esc(dataCab(f)) : ''}</th>`).join('')}
      <th class="ce">Total</th><th class="ce">Comprar</th></tr></thead>
    <tbody>${lista.map(r => `<tr><td>${esc(r.item.nome)}</td><td class="ce">${esc(r.item.unidade || '')}</td>
      ${r.cel.map(c => `<td class="ce"${c.falta ? ' style="color:#a5342a;font-weight:bold"' : ''}>${c.qtd === null ? '—' : esc(mostrarNumero(c.qtd))}</td>`).join('')}
      <td class="ce">${esc(mostrarNumero(r.total))}</td><td class="ce"><b>${r.comprar > 0 ? esc(mostrarNumero(r.comprar)) : ''}</b></td></tr>`).join('')}</tbody></table>
    <p style="font-size:8pt;color:#51534A;margin:0">Em vermelho: a fazenda está no mínimo ou abaixo. Comprar = soma de todas as fazendas.</p>
    <div class="rel-pe"><span></span><img class="rel-lop" src="img/lop-marca.png" alt="LOP"></div>
  </div>`;
}
