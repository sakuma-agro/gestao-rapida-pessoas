// saldo.js — Acerto › Saldo do sistema (15/10/2026).
//
// Pedido do Guilherme: no acerto, o físico vem da última contagem de cada
// estoque e ele lança o que está no estoque virtual do sistema agro. Esta tela
// é o lançamento: mês, estoque e o saldo na frente de cada item — digitado ou
// importado da planilha (abas "Sistema - ...").
import {
  $, esc, pronto, todos, aviso, meuNome, locais, itensOrdenados, GRUPOS,
  mesAtual, nomeMes, lerNumero, mostrarNumero,
} from './dados.js';
import { gravar as gravarDireto } from './dados.js';
import { listarAbas, lerAba, semAcento } from './planilha.js';

let corrente = Promise.resolve();
const gravar = (t, r) => {
  const p = corrente.then(() => gravarDireto(t, r));
  corrente = p.catch(() => {});
  return p;
};

const vazio = v => v === null || v === undefined || v === '';
const CHAVE_LOCAL = 'estoque.saldoLocal';
const sel = { mes: mesAtual(), localId: null };
try { sel.localId = localStorage.getItem(CHAVE_LOCAL); } catch { /* segue */ }
let busca = '';
let aberta = false;

export const idSaldo = (mes, itemId, localId) => `${mes}:${itemId}:${localId}`;
/** Saldo do sistema lançado: Map item_id → registro, de um mês e estoque. */
export const saldosDe = (mes, localId) => new Map(todos('est_saldos_sistema')
  .filter(s => s.mes === mes && s.local_id === localId).map(s => [s.item_id, s]));

function desenhar() {
  const alvo = $('acSaldoCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const ls = locais();
  if (!ls.some(l => l.id === sel.localId)) sel.localId = ls[0] ? ls[0].id : null;
  const itens = itensOrdenados();
  const saldos = saldosDe(sel.mes, sel.localId);
  const lancados = itens.filter(i => saldos.has(i.id) && !vazio(saldos.get(i.id).saldo)).length;
  // quantos estoques já têm saldo lançado neste mês
  const porLocal = ls.map(l => ({ l, n: [...saldosDe(sel.mes, l.id).values()].filter(s => !vazio(s.saldo)).length }));

  let grupo = null;
  alvo.innerHTML = `
    <div class="grade">
      <label class="campo">Mês do acerto <input type="month" id="ssMes" value="${esc(sel.mes)}" max="${mesAtual()}"></label>
      <label class="campo">Estoque <select id="ssLocal">${ls.map(l =>
        `<option value="${esc(l.id)}"${l.id === sel.localId ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
    </div>
    <div class="ss-locais">${porLocal.map(({ l, n }) => `<button type="button" class="ct-chip${l.id === sel.localId ? '" aria-pressed="true' : ''}"
      data-ss-local="${esc(l.id)}">${esc(l.nome)} <small>${n}/${itens.length}</small></button>`).join('')}</div>
    <div class="barra entre">
      <span class="dc-sem"><strong>${lancados}</strong> de ${itens.length} itens com saldo em ${esc(nomeMes(sel.mes))}</span>
      <span class="barra" style="margin:0">
        <label class="btn" for="ssArquivo">Importar da planilha</label>
        <input type="file" id="ssArquivo" accept=".xlsx,.xlsm" hidden>
      </span>
    </div>
    <p class="dc-sem">A planilha precisa das abas "Sistema - …" (produto na coluna A, quantidade na B). Os saldos entram
      em todos os estoques de uma vez, no mês escolhido. Item que não está no cadastro aparece para você decidir.</p>
    <label class="campo">Procurar item <input type="text" id="ssBusca" placeholder="Digite parte do nome..." value="${esc(busca)}"></label>
    <div class="ct-lista" id="ssLista">${itens.map(i => {
      const s = saldos.get(i.id);
      const v = s ? mostrarNumero(s.saldo) : '';
      const cab = i.grupo !== grupo ? `<h3 class="ct-grupo" data-grupo="${esc(i.grupo || 'Outros')}">${esc(grupo = i.grupo || 'Outros')}</h3>` : '';
      return cab + `<div class="ct-item" data-nome="${esc(semAcento(i.nome))}">
        <div class="ct-linha${v !== '' ? ' feito' : ''}">
          <label class="ct-nome" for="ss-${esc(i.id)}">${esc(i.nome)}<small>${esc(i.unidade || '')}</small></label>
          <input class="ct-qtd" id="ss-${esc(i.id)}" data-item="${esc(i.id)}" type="text" inputmode="decimal" enterkeyhint="next"
            autocomplete="off" value="${esc(v)}" placeholder="—" aria-label="Saldo do sistema de ${esc(i.nome)}">
        </div></div>`;
    }).join('') || '<div class="vazio">Nenhum item cadastrado.</div>'}</div>`;

  $('ssMes').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { sel.mes = e.target.value; desenhar(); } });
  const trocar = id => { sel.localId = id; try { localStorage.setItem(CHAVE_LOCAL, id); } catch { /* segue */ } desenhar(); };
  $('ssLocal').addEventListener('change', e => trocar(e.target.value));
  alvo.querySelectorAll('[data-ss-local]').forEach(b => b.addEventListener('click', () => trocar(b.dataset.ssLocal)));
  $('ssBusca').addEventListener('input', e => { busca = e.target.value; filtrar(); });
  $('ssArquivo').addEventListener('change', importar);
  filtrar();

  const campos = [...alvo.querySelectorAll('.ct-qtd')];
  campos.forEach((inp, k) => {
    inp.addEventListener('change', async () => {
      const digitado = inp.value;
      const n = lerNumero(digitado);
      const linha = inp.closest('.ct-linha');
      if (Number.isNaN(n)) { linha.classList.add('erro'); aviso('Use só números (ex.: 1250,5).', true); return; }
      linha.classList.remove('erro');
      await gravar('est_saldos_sistema', { id: idSaldo(sel.mes, inp.dataset.item, sel.localId), mes: sel.mes,
        item_id: inp.dataset.item, local_id: sel.localId, saldo: n, lancado_por: meuNome() });
      if (inp.value === digitado) inp.value = mostrarNumero(n);
      linha.classList.toggle('feito', n !== null);
      // contador do estoque e do topo
      const feitos = [...saldosDe(sel.mes, sel.localId).values()].filter(x => !vazio(x.saldo)).length;
      const chip = document.querySelector(`[data-ss-local="${CSS.escape(sel.localId)}"] small`);
      if (chip) chip.textContent = `${feitos}/${itens.length}`;
      const tot = document.querySelector('#acSaldoCorpo .dc-sem strong');
      if (tot) tot.textContent = feitos;
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = campos.slice(k + 1).find(x => x.closest('.ct-item').offsetParent !== null);
      if (prox) { prox.focus(); prox.select(); } else inp.blur();
    });
  });
}

function filtrar() {
  const b = semAcento(busca);
  document.querySelectorAll('#ssLista .ct-item').forEach(l => { l.hidden = !!b && !l.dataset.nome.includes(b); });
}

/* "Faz .Faca" e "Faz . Três Riachos" viram "FAZ. FACA"; "Lote 35" casa com "Lote 35 PADAP". */
const chave = s => semAcento(String(s || '').replace(/\s*\.\s*/g, '. ').replace(/\s+/g, ' '));
function acharLocal(nomeAba) {
  const k = chave(nomeAba);
  return locais().find(l => chave(l.nome) === k)
    || locais().find(l => chave(l.nome).startsWith(k + ' ') || k.startsWith(chave(l.nome) + ' '));
}

/** Lê as abas "Sistema - ..." e grava os saldos do mês em todos os estoques. */
async function importar(ev) {
  const arquivo = ev.target.files?.[0];
  ev.target.value = '';
  if (!arquivo) return;
  try {
    const abas = (await listarAbas(arquivo)).filter(a => semAcento(a).startsWith('SISTEMA -'));
    if (!abas.length) throw new Error('Não achei abas "Sistema - ..." nesta planilha.');
    const itens = new Map(todos('est_itens').filter(i => i.ativo !== false).map(i => [semAcento(i.nome), i]));
    const valores = new Map();     // `${item}|${local}` → soma
    const semItem = new Map();     // nome → unidade? (só o nome)
    const semLocal = [];
    for (const aba of abas) {
      const local = acharLocal(aba.slice(aba.indexOf('-') + 1));
      if (!local) { semLocal.push(aba); continue; }
      for (const l of await lerAba(arquivo, aba)) {
        if (!l) continue;
        const nome = String(l[0] ?? '').trim();
        const qtd = Number(l[1]);
        if (!nome || !isFinite(qtd) || semAcento(nome) === 'PRODUTO') continue;
        const item = itens.get(semAcento(nome));
        if (!item) { semItem.set(semAcento(nome), nome); continue; }
        const k = item.id + '|' + local.id;
        valores.set(k, (valores.get(k) || 0) + qtd);
      }
    }
    // gravar: os estoques que vieram na planilha recebem o saldo de cada item
    // (item que não veio na aba daquele estoque fica zero)
    const locaisLidos = new Set([...valores.keys()].map(k => k.split('|')[1]));
    let n = 0;
    for (const lid of locaisLidos) {
      for (const it of itensOrdenados()) {
        const v = valores.get(it.id + '|' + lid) || 0;
        await gravar('est_saldos_sistema', { id: idSaldo(sel.mes, it.id, lid), mes: sel.mes, item_id: it.id,
          local_id: lid, saldo: v, lancado_por: meuNome() });
        n++;
      }
    }
    desenhar();
    aviso(`Saldo de ${locaisLidos.size} estoque(s) importado para ${nomeMes(sel.mes)}.`);
    if (semItem.size || semLocal.length) mostrarFaltas([...semItem.values()], semLocal);
  } catch (e) {
    console.error(e);
    aviso(e.message || 'Não consegui ler a planilha.', true);
  }
}

/** Produtos da planilha que não estão no cadastro: cadastra de uma vez, se quiser. */
function mostrarFaltas(nomes, abas) {
  window.abrirModal('Importação do saldo', `
    ${abas.length ? `<p class="es-nota">Abas sem estoque correspondente (ficaram de fora): ${abas.map(esc).join(', ')}.
      Confira o nome em Cadastros › Almoxarifados.</p>` : ''}
    ${nomes.length ? `<p><strong>${nomes.length}</strong> produto(s) da planilha não estão no cadastro de itens e ficaram de fora:</p>
      <ul class="ct-branco">${nomes.slice(0, 30).map(n => `<li>${esc(n)}</li>`).join('')}${nomes.length > 30 ? `<li>… e mais ${nomes.length - 30}</li>` : ''}</ul>
      <div class="grade"><label class="campo">Cadastrar no grupo <select id="mfGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label></div>
      <p class="dc-sem">Depois de cadastrar, importe a planilha de novo para trazer o saldo deles.</p>
      <div class="barra fim"><button class="btn" type="button" id="mfNao">Deixar de fora</button>
        <button class="btn principal" type="button" id="mfSim">Cadastrar os ${nomes.length}</button></div>` : ''}`, corpo => {
    corpo.querySelector('#mfNao')?.addEventListener('click', window.fecharModal);
    corpo.querySelector('#mfSim')?.addEventListener('click', async () => {
      const grupo = corpo.querySelector('#mfGrupo').value;
      for (const nome of nomes) await gravar('est_itens', { nome: nome.replace(/\s+/g, ' '), unidade: 'L', grupo, ativo: true });
      window.fecharModal();
      aviso(`${nomes.length} itens cadastrados em ${grupo}. Confira a unidade em Cadastros › Itens e importe de novo.`);
      desenhar();
    });
  });
}

export function abrirSaldo() { aberta = true; desenhar(); }
export function soltarSaldo() { aberta = false; }

window.addEventListener('estoque-dados', () => {
  if (!aberta) return;
  const foco = document.activeElement;
  if (foco && foco.closest && foco.closest('#acSaldoCorpo') && /INPUT|SELECT/.test(foco.tagName)) return;
  if (document.querySelector('#modal') && !document.querySelector('#modal.oculto')) return;
  desenhar();
});
