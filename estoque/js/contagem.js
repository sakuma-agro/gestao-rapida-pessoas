// contagem.js — módulo Contagem da área Estoque (15/10/2026).
//
// Todo mês, em cada almoxarifado, a pessoa abre a lista de insumos e digita
// só o total que está na prateleira, na frente de cada um. A lista é a mesma
// em todos os almoxarifados (decisão do Guilherme: "todos em todos"). Cada
// número é guardado no aparelho na hora e sobe quando há sinal. Fechada a
// contagem, ela entra sozinha no Acerto, no lugar das abas "Físico".
import {
  $, esc, pronto, todos, aviso, souAdmin, meuNome, locais, itensOrdenados,
  mesAtual, nomeMes, idContagem, idLinha, contagem, linhasDe, progresso,
  lerNumero, mostrarNumero, dataHora, lotesDe, dataBR, hojeISO,
} from './dados.js';
import { gravar as gravarDireto } from './dados.js';

/* Gravações uma de cada vez (15/10/2026): dois campos do mesmo lote salvos
   quase juntos (lote e validade) entravam em dobro na lista do aparelho. */
let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

/* O que está escolhido na tela Contar. */
const CHAVE_LOCAL = 'estoque.contarLocal';
const sel = { localId: null, mes: mesAtual() };
try { sel.localId = localStorage.getItem(CHAVE_LOCAL); } catch { /* sem localStorage */ }

let telaAberta = null;
const abertos = new Set();   // itens com a lista de lotes aberta (sobrevive ao redesenho)
let soFalta = false;
let grupoFiltro = '';   // '' = todos os grupos
let busca = '';

/* ===================================================================
   Tela Contar
   =================================================================== */

function cabecalhoEscolha() {
  const ls = locais();
  if (!ls.some(l => l.id === sel.localId)) sel.localId = ls[0] ? ls[0].id : null;
  return `<div class="cartao naoimprimir">
    <h2>Contar o estoque</h2>
    <p class="dica">Escolha o almoxarifado e o mês. Depois é só digitar o total de cada item,
      do jeito que está na prateleira. Salva sozinho, mesmo sem internet.</p>
    <div class="grade">
      <label class="campo">Almoxarifado
        <select id="ctLocal">${ls.map(l =>
          `<option value="${esc(l.id)}"${l.id === sel.localId ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}
        </select></label>
      <label class="campo">Mês da contagem
        <input type="month" id="ctMes" value="${esc(sel.mes)}" max="${mesAtual()}"></label>
    </div>
  </div>`;
}

function desenharContar() {
  const alvo = $('ctCorpo');
  if (!alvo) return;
  if (!pronto()) {
    alvo.innerHTML = `<div class="cartao"><div class="vazio">${window.App && window.App.carregando
      ? 'Baixando a lista de itens para usar sem internet…'
      : 'Abrindo a contagem…'}</div></div>`;
    return;
  }
  if (!locais().length) {
    alvo.innerHTML = `<div class="cartao"><h2>Contar o estoque</h2>
      <div class="vazio">Nenhum almoxarifado cadastrado. Cadastre em <strong>Cadastros › Almoxarifados</strong>.</div></div>`;
    return;
  }
  const itens = itensOrdenados();
  if (!itens.length) {
    alvo.innerHTML = cabecalhoEscolha() + `<div class="cartao">
      <div class="vazio">Nenhum item cadastrado ainda. Cadastre os insumos em
      <strong>Cadastros › Itens</strong> — dá para colar a lista inteira de uma vez.</div></div>`;
    ligarEscolha();
    return;
  }

  const c = contagem(sel.localId, sel.mes);
  const fechada = c && c.status === 'fechada';
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const p = c ? progresso(c.id) : { feitos: 0, total: itens.length };
  const pct = p.total ? Math.round(100 * p.feitos / p.total) : 0;
  const local = locais().find(l => l.id === sel.localId);

  const estado = !c
    ? `<span class="tag neutra">não começada</span>`
    : fechada
      ? `<span class="tag ativo">fechada</span> <small>por ${esc(c.fechada_por || '—')} em ${esc(dataHora(c.fechada_em))}</small>`
      : `<span class="tag alerta">em andamento</span>${c.responsavel ? ` <small>começada por ${esc(c.responsavel)}</small>` : ''}`;

  let grupoAtual = null;
  const corpo = itens.map(i => {
    const l = linhas.get(i.id);
    const valor = l ? mostrarNumero(l.quantidade) : '';
    const lotes = c ? lotesDe(c.id, i.id) : [];
    let cab = '';
    if (i.grupo !== grupoAtual) {
      grupoAtual = i.grupo;
      cab = `<h3 class="ct-grupo" data-grupo="${esc(i.grupo || 'Outros')}">${esc(i.grupo || 'Outros')}${i.grupo === 'Fertilizantes'
        ? ' <small>sempre em quilos — o peso total, não o número de sacas</small>' : ''}</h3>`;
    }
    return cab + `<div class="ct-item" data-nome="${esc(semAcento(i.nome))}" data-item="${esc(i.id)}" data-grupo="${esc(i.grupo || 'Outros')}">
      <div class="ct-linha${valor !== '' ? ' feito' : ''}">
        <label class="ct-nome" for="q-${esc(i.id)}">${esc(i.nome)}<small>${esc(i.unidade || '')}${lotes.length
          ? ` · <b>${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}</b>${vencido(lotes) ? ' · <span class="ct-venc">tem lote vencido</span>' : ''}` : ''}</small></label>
        <input class="ct-qtd" id="q-${esc(i.id)}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
          data-item="${esc(i.id)}" value="${esc(valor)}" placeholder="—"${fechada || lotes.length ? ' disabled' : ''}
          title="${lotes.length ? 'Soma dos lotes' : ''}" aria-label="Total de ${esc(i.nome)}">
        <button class="ct-mais${abertos.has(i.id) ? ' aberto' : ''}" type="button" data-mais="${esc(i.id)}"
          aria-expanded="${abertos.has(i.id)}" title="Lotes e vencimentos">${abertos.has(i.id) ? '−' : '+'}</button>
      </div>
      <div class="ct-lotes"${abertos.has(i.id) ? '' : ' hidden'}>${desenharLotes(i, lotes, fechada)}</div>
    </div>`;
  }).join('');

  alvo.innerHTML = cabecalhoEscolha() + `
  <div class="cartao">
    <div class="ct-topo">
      <div><h2>${esc(local ? local.nome : '')} · ${esc(nomeMes(sel.mes))}</h2>
        <div class="ct-estado">${estado}</div></div>
      <div class="ct-conta"><strong>${p.feitos}</strong> de ${p.total} contados</div>
    </div>
    <div class="ct-barra"><span style="width:${pct}%"></span></div>
    ${chipsGrupos(itens, linhas)}
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar item
        <input type="text" id="ctBusca" placeholder="Digite parte do nome..." value="${esc(busca)}"></label>
      <label class="es-check"><input type="checkbox" id="ctSoFalta"${soFalta ? ' checked' : ''}> só o que falta contar</label>
    </div>
    <div class="ct-lista${soFalta ? ' so-falta' : ''}" id="ctLista">${corpo}</div>
    <div class="barra entre ct-pe">
      <span class="dc-sem">${fechada
        ? 'Contagem fechada: já está valendo no Acerto.'
        : 'Pode parar e continuar depois: o que foi digitado fica guardado.'}</span>
      ${fechada
        ? (souAdmin() ? `<button class="btn" type="button" id="ctReabrir">Reabrir a contagem</button>` : '')
        : `<button class="btn principal" type="button" id="ctFechar">Fechar a contagem</button>`}
    </div>
  </div>`;

  ligarEscolha();
  filtrar();
  $('ctBusca').addEventListener('input', e => { busca = e.target.value; filtrar(); });
  alvo.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
    grupoFiltro = b.dataset.chip;
    alvo.querySelectorAll('[data-chip]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    filtrar();
  }));
  $('ctSoFalta').addEventListener('change', e => {
    soFalta = e.target.checked;
    $('ctLista').classList.toggle('so-falta', soFalta);
  });
  $('ctFechar')?.addEventListener('click', confirmarFechar);
  $('ctReabrir')?.addEventListener('click', reabrir);

  alvo.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => alternarLotes(b.dataset.mais)));
  ligarLotes(alvo);

  const campos = [...alvo.querySelectorAll('.ct-qtd')];
  campos.forEach((inp, k) => {
    inp.addEventListener('change', () => salvarCampo(inp));
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // vai para o próximo campo visível
      const prox = campos.slice(k + 1).find(x => !x.disabled && x.closest('.ct-item').offsetParent !== null);
      if (prox) { prox.focus(); prox.select(); } else inp.blur();
    });
  });
}

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/* Chips dos grupos (15/10/2026): cada um com quantos já foram contados.
   Quem conta só os EPIs, por exemplo, escolhe o grupo e vê só ele. */
function chipsGrupos(itens, linhas) {
  const grupos = [];
  for (const i of itens) {
    const g = i.grupo || 'Outros';
    let r = grupos.find(x => x.nome === g);
    if (!r) grupos.push(r = { nome: g, feitos: 0, total: 0 });
    r.total++;
    const l = linhas.get(i.id);
    if (l && l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '') r.feitos++;
  }
  if (grupos.length < 2) return '';
  if (grupoFiltro && !grupos.some(g => g.nome === grupoFiltro)) grupoFiltro = '';
  const chip = (id, rot, f, t) => `<button type="button" class="ct-chip${t && f === t ? ' completo' : ''}" data-chip="${esc(id)}"
    aria-pressed="${grupoFiltro === id}">${esc(rot)}${t ? ` <small>${f}/${t}</small>` : ''}</button>`;
  return `<div class="ct-chips">${chip('', 'Todos', 0, 0)}${grupos.map(g => chip(g.nome, g.nome, g.feitos, g.total)).join('')}</div>`;
}

function filtrar() {
  const b = semAcento(busca).trim();
  document.querySelectorAll('#ctLista .ct-item').forEach(l => {
    l.hidden = (!!b && !l.dataset.nome.includes(b)) || (!!grupoFiltro && l.dataset.grupo !== grupoFiltro);
  });
  document.querySelectorAll('#ctLista .ct-grupo').forEach(h => {
    h.hidden = !!grupoFiltro && h.dataset.grupo !== grupoFiltro;
  });
}

function ligarEscolha() {
  $('ctLocal')?.addEventListener('change', e => {
    sel.localId = e.target.value;
    try { localStorage.setItem(CHAVE_LOCAL, sel.localId); } catch { /* sem localStorage */ }
    desenharContar();
  });
  $('ctMes')?.addEventListener('change', e => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) { sel.mes = e.target.value; desenharContar(); }
  });
}

/* ===================================================================
   Lotes — "+" na frente do item (pedido dele, 15/10/2026): quando o produto
   tem lotes e vencimentos diferentes, cada lote vira uma linha. O total do
   item passa a ser a soma dos lotes e é ele que vai para o Acerto.
   =================================================================== */
const vencido = lotes => lotes.some(l => l.validade && String(l.validade).slice(0, 10) < hojeISO());

function linhaLote(l, fechada) {
  const venc = l.validade && String(l.validade).slice(0, 10) < hojeISO();
  if (fechada) return `<div class="ct-lote fixo">
      <span>${esc(l.lote || 'sem nº')}</span>
      <span class="${venc ? 'ct-venc' : ''}">${l.validade ? 'val. ' + esc(dataBR(l.validade)) : 'sem validade'}${venc ? ' · vencido' : ''}</span>
      <strong>${esc(mostrarNumero(l.quantidade))}</strong></div>`;
  return `<div class="ct-lote${venc ? ' vencido' : ''}" data-lote="${esc(l.id)}">
      <label>Lote <input type="text" class="cl-lote" value="${esc(l.lote || '')}" placeholder="nº do lote" autocomplete="off"></label>
      <label>Validade <input type="date" class="cl-val" value="${esc(l.validade ? String(l.validade).slice(0, 10) : '')}"></label>
      <label>Quantidade <input type="text" class="cl-qtd" inputmode="decimal" value="${esc(mostrarNumero(l.quantidade))}" placeholder="—" autocomplete="off"></label>
      <button type="button" class="cl-tirar" title="Tirar este lote" aria-label="Tirar este lote">×</button>
    </div>`;
}

function desenharLotes(item, lotes, fechada) {
  return `${lotes.map(l => linhaLote(l, fechada)).join('') || (fechada ? '<p class="dc-sem">Sem lotes separados.</p>' : '')}
    ${fechada ? '' : `<div class="ct-lotes-pe">
      <button type="button" class="btn mini" data-novo-lote="${esc(item.id)}">+ Adicionar lote</button>
      <span class="dc-sem">${lotes.length ? 'O total do item é a soma dos lotes.' : 'Use quando o produto tiver lotes ou vencimentos diferentes.'}</span>
    </div>`}`;
}

function alternarLotes(itemId) {
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  if (!bloco) return;
  const abrir = !abertos.has(itemId);
  if (abrir) abertos.add(itemId); else abertos.delete(itemId);
  bloco.querySelector('.ct-lotes').hidden = !abrir;
  const b = bloco.querySelector('[data-mais]');
  b.textContent = abrir ? '−' : '+';
  b.classList.toggle('aberto', abrir);
  b.setAttribute('aria-expanded', String(abrir));
  // sem lote nenhum ainda: já abre o primeiro para preencher
  if (abrir && !bloco.querySelector('.ct-lote') && bloco.querySelector('[data-novo-lote]')) novoLote(itemId);
}

function ligarLotes(raiz) {
  raiz.querySelectorAll('[data-novo-lote]').forEach(b => b.onclick = () => novoLote(b.dataset.novoLote));
  raiz.querySelectorAll('.ct-lote[data-lote]').forEach(ligarLinhaLote);
}

function ligarLinhaLote(div) {
  div.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => salvarLote(div)));
  div.querySelector('.cl-qtd').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  div.querySelector('.cl-tirar').addEventListener('click', () => tirarLote(div));
}

/** Linha nova de lote. O primeiro lote herda o total já digitado, para nada se perder. */
function novoLote(itemId) {
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  if (!bloco) return;
  const pe = bloco.querySelector('.ct-lotes-pe');
  const primeiro = !bloco.querySelector('.ct-lote');
  const totalAtual = primeiro ? lerNumero(bloco.querySelector('.ct-qtd').value) : null;
  const tmp = document.createElement('div');
  tmp.innerHTML = linhaLote({ id: crypto.randomUUID(), quantidade: Number.isNaN(totalAtual) ? null : totalAtual }, false);
  const div = tmp.firstElementChild;
  pe.before(div);
  ligarLinhaLote(div);
  div.querySelector('.cl-lote').focus();
  if (primeiro && totalAtual !== null && !Number.isNaN(totalAtual)) salvarLote(div);
}

async function salvarLote(div) {
  const itemId = div.closest('.ct-item').dataset.item;
  const qtdInp = div.querySelector('.cl-qtd');
  const digitado = qtdInp.value;
  const n = lerNumero(digitado);
  if (Number.isNaN(n)) {
    div.classList.add('erro');
    aviso('Essa quantidade não deu para entender. Use só algarismos e vírgula, ex.: 1250,5', true);
    return;
  }
  div.classList.remove('erro');
  try {
    const c = await garantirContagem();
    if (c.status === 'fechada') { aviso('Esta contagem já foi fechada.', true); return; }
    const validade = div.querySelector('.cl-val').value || null;
    await gravar('est_contagem_lotes', {
      id: div.dataset.lote, contagem_id: c.id, item_id: itemId,
      lote: div.querySelector('.cl-lote').value.trim() || null,
      validade, quantidade: n, contado_por: meuNome(), ativo: true,
    });
    // só arruma o número se a pessoa não digitou outro enquanto gravava
    if (qtdInp.value === digitado) qtdInp.value = mostrarNumero(n);
    div.classList.toggle('vencido', !!validade && validade < hojeISO());
    await somarLotes(c, itemId);
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar esse lote (' + (e.message || e) + ').', true);
  }
}

async function tirarLote(div) {
  const itemId = div.closest('.ct-item').dataset.item;
  const salvo = todos('est_contagem_lotes').find(l => l.id === div.dataset.lote);
  div.remove();
  if (!salvo) return;
  await gravar('est_contagem_lotes', Object.assign({}, salvo, { ativo: false }));
  const c = contagem(sel.localId, sel.mes);
  if (c) await somarLotes(c, itemId);
}

/** Total do item = soma dos lotes ativos. Sem lote nenhum, o total volta a ser digitado. */
async function somarLotes(c, itemId) {
  const lotes = lotesDe(c.id, itemId);
  const bloco = document.querySelector(`.ct-item[data-item="${CSS.escape(itemId)}"]`);
  const inp = bloco && bloco.querySelector('.ct-qtd');
  if (lotes.length) {
    const comQtd = lotes.filter(l => l.quantidade !== null && l.quantidade !== undefined && l.quantidade !== '');
    const total = comQtd.length ? comQtd.reduce((t, l) => t + Number(l.quantidade), 0) : null;
    await gravar('est_contagem_itens', {
      id: idLinha(c.id, itemId), contagem_id: c.id, item_id: itemId, quantidade: total, contado_por: meuNome(),
    });
    if (inp) { inp.value = mostrarNumero(total); inp.disabled = true; inp.title = 'Soma dos lotes'; }
    if (bloco) bloco.querySelector('.ct-linha').classList.toggle('feito', total !== null);
  } else if (inp) { inp.disabled = false; inp.title = ''; }
  if (bloco) {
    const small = bloco.querySelector('.ct-nome small');
    const item = todos('est_itens').find(i => i.id === itemId);
    small.innerHTML = esc(item && item.unidade || '') + (lotes.length
      ? ` · <b>${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'}</b>${vencido(lotes) ? ' · <span class="ct-venc">tem lote vencido</span>' : ''}` : '');
    const msg = bloco.querySelector('.ct-lotes-pe .dc-sem');
    if (msg) msg.textContent = lotes.length ? 'O total do item é a soma dos lotes.' : 'Use quando o produto tiver lotes ou vencimentos diferentes.';
  }
  atualizarConta();
}

/** A contagem do mês nasce no primeiro número digitado. */
async function garantirContagem() {
  const existente = contagem(sel.localId, sel.mes);
  if (existente) return existente;
  return gravar('est_contagens', {
    id: idContagem(sel.localId, sel.mes),
    local_id: sel.localId, mes: sel.mes, status: 'aberta',
    responsavel: meuNome(), aberta_por: meuNome(),
  });
}

async function salvarCampo(inp) {
  const digitado = inp.value;
  const n = lerNumero(digitado);
  const linha = inp.closest('.ct-linha');
  if (Number.isNaN(n)) {
    linha.classList.add('erro');
    aviso('Esse número não deu para entender. Use só algarismos e vírgula, ex.: 1250,5', true);
    return;
  }
  linha.classList.remove('erro');
  try {
    const c = await garantirContagem();
    if (c.status === 'fechada') { aviso('Esta contagem já foi fechada.', true); return; }
    await gravar('est_contagem_itens', {
      id: idLinha(c.id, inp.dataset.item), contagem_id: c.id, item_id: inp.dataset.item,
      quantidade: n, contado_por: meuNome(),
    });
    if (inp.value === digitado) inp.value = mostrarNumero(n);
    linha.classList.toggle('feito', n !== null);
    atualizarConta();
  } catch (e) {
    console.error(e);
    aviso('Não consegui guardar esse número (' + (e.message || e) + ').', true);
  }
}

function atualizarConta() {
  const c = contagem(sel.localId, sel.mes);
  if (!c) return;
  const chips = document.querySelector('.ct-chips');
  if (chips) {
    const linhas = new Map(linhasDe(c.id).map(l => [l.item_id, l]));
    const novo = document.createElement('div');
    novo.innerHTML = chipsGrupos(itensOrdenados(), linhas);
    const n = novo.firstElementChild;
    if (n) {
      chips.querySelectorAll('[data-chip]').forEach(b => {
        const igual = n.querySelector(`[data-chip="${CSS.escape(b.dataset.chip)}"]`);
        if (igual) { b.innerHTML = igual.innerHTML; b.classList.toggle('completo', igual.classList.contains('completo')); }
      });
    }
  }
  const p = progresso(c.id);
  const el = document.querySelector('.ct-conta');
  if (el) el.innerHTML = `<strong>${p.feitos}</strong> de ${p.total} contados`;
  const barra = document.querySelector('.ct-barra span');
  if (barra) barra.style.width = (p.total ? Math.round(100 * p.feitos / p.total) : 0) + '%';
  const est = document.querySelector('.ct-estado');
  if (est && est.textContent.includes('não começada'))
    est.innerHTML = `<span class="tag alerta">em andamento</span> <small>começada por ${esc(c.responsavel || '')}</small>`;
}

function confirmarFechar() {
  // o que estiver no campo e ainda não saiu dele também vale
  if (document.activeElement && document.activeElement.classList.contains('ct-qtd')) document.activeElement.blur();
  const c = contagem(sel.localId, sel.mes);
  const itens = itensOrdenados();
  const linhas = new Map((c ? linhasDe(c.id) : []).map(l => [l.item_id, l]));
  const branco = itens.filter(i => {
    const l = linhas.get(i.id);
    return !l || l.quantidade === null || l.quantidade === undefined || l.quantidade === '';
  });
  const local = locais().find(l => l.id === sel.localId);
  window.abrirModal('Fechar a contagem', `
    <p>${esc(local ? local.nome : '')} · <strong>${esc(nomeMes(sel.mes))}</strong></p>
    ${branco.length
      ? `<p><strong>${branco.length}</strong> ${branco.length === 1 ? 'item ficou' : 'itens ficaram'} em branco e
         ${branco.length === 1 ? 'vai entrar' : 'vão entrar'} como <strong>zero</strong> (não tem na prateleira):</p>
         <ul class="ct-branco">${branco.slice(0, 12).map(i => `<li>${esc(i.nome)}</li>`).join('')}${branco.length > 12
           ? `<li>… e mais ${branco.length - 12}</li>` : ''}</ul>`
      : '<p>Todos os itens foram contados.</p>'}
    <p class="dc-sem">Depois de fechada, a contagem entra no Acerto e não pode mais ser alterada${souAdmin()
      ? ' (o administrador pode reabrir)' : ''}.</p>
    <div class="barra fim">
      <button class="btn" type="button" id="ctVoltar">Voltar e contar</button>
      <button class="btn principal" type="button" id="ctConfirmar">Fechar a contagem</button>
    </div>`, corpo => {
    corpo.querySelector('#ctVoltar').onclick = window.fecharModal;
    corpo.querySelector('#ctConfirmar').onclick = async () => {
      corpo.querySelector('#ctConfirmar').disabled = true;
      try {
        const ct = await garantirContagem();
        for (const i of branco) {
          await gravar('est_contagem_itens', {
            id: idLinha(ct.id, i.id), contagem_id: ct.id, item_id: i.id, quantidade: 0, contado_por: meuNome(),
          });
        }
        await gravar('est_contagens', Object.assign({}, ct, {
          status: 'fechada', fechada_por: meuNome(), fechada_em: new Date().toISOString(),
        }));
        window.fecharModal();
        aviso('Contagem fechada. Ela já entra no Acerto.');
        desenharContar();
      } catch (e) {
        console.error(e);
        aviso('Não consegui fechar (' + (e.message || e) + ').', true);
        corpo.querySelector('#ctConfirmar').disabled = false;
      }
    };
  });
}

async function reabrir() {
  const c = contagem(sel.localId, sel.mes);
  if (!c || !souAdmin()) return;
  if (!confirm('Reabrir a contagem de ' + nomeMes(sel.mes) + '? Ela sai do Acerto até ser fechada de novo.')) return;
  await gravar('est_contagens', Object.assign({}, c, { status: 'aberta', fechada_por: null, fechada_em: null }));
  aviso('Contagem reaberta.');
  desenharContar();
}

/* ===================================================================
   Tela Em andamento — o mês inteiro, almoxarifado por almoxarifado
   =================================================================== */
let mesAndamento = mesAtual();

function desenharAndamento() {
  const alvo = $('ctAndCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ls = locais();
  const linhas = ls.map(l => {
    const c = contagem(l.id, mesAndamento);
    const p = c ? progresso(c.id) : { feitos: 0, total: itensOrdenados().length };
    const situ = !c ? '<span class="tag neutra">não começada</span>'
      : c.status === 'fechada' ? '<span class="tag ativo">fechada</span>'
        : '<span class="tag alerta">em andamento</span>';
    const quem = !c ? '' : c.status === 'fechada'
      ? `fechada por ${esc(c.fechada_por || '—')} em ${esc(dataHora(c.fechada_em))}`
      : `começada por ${esc(c.responsavel || '—')}`;
    return `<div class="item">
      <span></span>
      <div><div class="nome">${esc(l.nome)} ${situ}</div>
        <div class="sub">${p.feitos} de ${p.total} itens${quem ? ' · ' + quem : ''}</div></div>
      <div class="acoes"><button class="btn mini${c && c.status === 'fechada' ? '' : ' principal'}" type="button"
        data-contar="${esc(l.id)}">${c && c.status === 'fechada' ? 'Ver' : 'Contar'}</button></div>
    </div>`;
  }).join('');
  const fechadas = ls.filter(l => (contagem(l.id, mesAndamento) || {}).status === 'fechada').length;
  alvo.innerHTML = `
    <div class="barra">
      <label class="campo">Mês <input type="month" id="ctAndMes" value="${esc(mesAndamento)}" max="${mesAtual()}"></label>
      <span class="dc-sem">${fechadas} de ${ls.length} almoxarifados fechados em ${esc(nomeMes(mesAndamento))}</span>
    </div>
    <div class="lista">${linhas || '<div class="vazio">Nenhum almoxarifado cadastrado.</div>'}</div>`;
  $('ctAndMes').addEventListener('change', e => {
    if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesAndamento = e.target.value; desenharAndamento(); }
  });
  alvo.querySelectorAll('[data-contar]').forEach(b => b.addEventListener('click', () => {
    sel.localId = b.dataset.contar; sel.mes = mesAndamento;
    window.abrirTelaEstoque('ctNova');
  }));
}

/* ===================================================================
   Tela Histórico — contagens fechadas, com folha para imprimir
   =================================================================== */
function desenharHistorico() {
  const alvo = $('ctHistCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const nomeLocal = id => (todos('est_locais').find(l => l.id === id) || {}).nome || '—';
  const fechadas = todos('est_contagens').filter(c => c.status === 'fechada')
    .sort((a, b) => b.mes.localeCompare(a.mes) || nomeLocal(a.local_id).localeCompare(nomeLocal(b.local_id), 'pt-BR'));
  if (!fechadas.length) {
    alvo.innerHTML = '<div class="vazio">Nenhuma contagem fechada ainda.</div>';
    $('ctFolha').innerHTML = '';
    return;
  }
  let mes = null;
  alvo.innerHTML = fechadas.map(c => {
    const cab = c.mes !== mes ? `<h3 class="es-secao">${esc(nomeMes(mes = c.mes))}</h3>` : '';
    const n = linhasDe(c.id).length;
    return cab + `<div class="item"><span></span>
      <div><div class="nome">${esc(nomeLocal(c.local_id))}</div>
        <div class="sub">${n} itens · fechada por ${esc(c.fechada_por || '—')} em ${esc(dataHora(c.fechada_em))}</div></div>
      <div class="acoes">
        <button class="btn mini" type="button" data-ver="${esc(c.id)}">Ver</button>
        <button class="btn mini" type="button" data-imprimir="${esc(c.id)}">Imprimir</button>
      </div></div>`;
  }).join('');
  alvo.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
    const c = todos('est_contagens').find(x => x.id === b.dataset.ver);
    if (!c) return;
    sel.localId = c.local_id; sel.mes = c.mes;
    window.abrirTelaEstoque('ctNova');
  }));
  alvo.querySelectorAll('[data-imprimir]').forEach(b => b.addEventListener('click', () => {
    montarFolha(b.dataset.imprimir);
    setTimeout(() => window.print(), 50);
  }));
}

/** Folha A4 no padrão SAKUMA: marca no alto, tabela com grade, LOP no pé. */
function montarFolha(contagemId) {
  const c = todos('est_contagens').find(x => x.id === contagemId);
  if (!c) return;
  const local = todos('est_locais').find(l => l.id === c.local_id) || {};
  const itens = new Map(todos('est_itens').map(i => [i.id, i]));
  const linhas = linhasDe(c.id)
    .map(l => ({ item: itens.get(l.item_id) || { nome: '(item apagado)', grupo: 'Outros' }, qtd: l.quantidade }));
  const ordenadas = itensOrdenados(linhas.map(l => l.item));
  const porItem = new Map(linhas.map(l => [l.item, l.qtd]));
  const grupos = [];
  for (const i of ordenadas) {
    let g = grupos[grupos.length - 1];
    if (!g || g.nome !== (i.grupo || 'Outros')) grupos.push(g = { nome: i.grupo || 'Outros', linhas: [] });
    g.linhas.push([i.nome, i.unidade || '', mostrarNumero(porItem.get(i))]);
    for (const l of (i.id ? lotesDe(c.id, i.id) : [])) {
      g.linhas.push(['   Lote ' + (l.lote || 's/ nº') + (l.validade ? ' · val. ' + dataBR(l.validade) : ''), '', mostrarNumero(l.quantidade), 'sub']);
    }
  }
  $('ctFolha').innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Contagem de Estoque — ${esc(local.nome || '')}</h1>
        <p>${esc(nomeMes(c.mes))} · fechada em ${esc(dataHora(c.fechada_em))} · ${linhas.length} itens</p>
      </div>
    </div>
    ${grupos.map(g => `<h3 class="rel-secao">${esc(g.nome)}</h3>
      <table class="rel-tab"><thead><tr><th>Item</th><th class="ce">Unidade</th><th class="ce">Quantidade</th></tr></thead>
      <tbody>${g.linhas.map(l => `<tr${l[3] ? ' class="rel-sub"' : ''}><td>${esc(l[0])}</td><td class="ce">${esc(l[1])}</td><td class="ce">${esc(l[2])}</td></tr>`).join('')}</tbody></table>`).join('')}
    <div class="rel-pe">
      <div class="rel-assina"><span></span><small>Responsável pela contagem</small></div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`;
}

/* ===================================================================
   ligação com o app.js
   =================================================================== */
const DESENHOS = { ctNova: desenharContar, ctAndamento: desenharAndamento, ctHistorico: desenharHistorico };

export function abrirContagem(tela) {
  telaAberta = tela;
  (DESENHOS[tela] || (() => {}))();
}

/* A base mudou (chegou do servidor ou terminou de abrir): redesenha, mas
   nunca embaixo do dedo de quem está digitando um número. */
window.addEventListener('estoque-dados', () => {
  if (!telaAberta || !DESENHOS[telaAberta]) return;
  const foco = document.activeElement;
  if (foco && (foco.classList.contains('ct-qtd') || foco.id === 'ctBusca' || foco.closest && foco.closest('.ct-lote'))) return;
  if (!document.querySelector('#modal.oculto') && document.querySelector('#modal')) return;
  DESENHOS[telaAberta]();
});

export const telaAtualDaContagem = () => telaAberta;
export function soltarContagem() { telaAberta = null; }
