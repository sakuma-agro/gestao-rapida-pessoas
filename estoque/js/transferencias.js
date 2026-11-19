// transferencias.js — Contagem › Transferências (19/11/2026, pedido do Guilherme).
//
// "Meu objetivo é saber o que preciso fazer ao contar todos os estoques: se é
// transferir ou comprar. A compra é para todos os estoques, mas sempre a
// transferência vem do principal, Lote 35."
//
// A FAZER: não é cadastro, é conta — sai na hora das últimas contagens
// fechadas de cada tipo (a conta mora em resultado.js). Fazenda no mínimo ou
// abaixo precisa do pedido cadastrado; o que o principal tem na prateleira vai
// de transferência, o resto vira compra.
// CONCLUÍDAS: est_transferencias, o que ele marcou como já entregue. Marcar
// não mexe em saldo nem em contagem — só tira a linha do "a fazer" e faz o
// Resultado parar de pedir aquilo de novo.
import {
  $, esc, pronto, todos, gravar, aviso, meuNome, lerNumero, mostrarNumero, dataHora,
  localPrincipal, transferenciasFeitas, GRUPOS,
} from './dados.js';
import { transferenciasAFazer } from './resultado.js';

let filtro = '';          // tipo (grupo); vazio = todos
let pendentes = new Map(); // chave → a sugestão que está na tela

const chaveDe = t => t.contagemId + '|' + t.item.id;
const nomeLocal = id => (todos('est_locais').find(l => l.id === id) || {}).nome || '—';
const itemDe = id => todos('est_itens').find(i => i.id === id) || null;
const un = i => (i && i.unidade) || '';

export function desenharTransferencias() {
  const alvo = $('ctTransfCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }

  const princ = localPrincipal();
  const sugeridas = transferenciasAFazer();
  const feitasTodas = transferenciasFeitas();
  const aFazer = sugeridas.filter(t => !filtro || t.grupo === filtro);
  const feitas = feitasTodas.filter(t => !filtro || t.grupo === filtro)
    .sort((a, b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')));
  const grupos = [...new Set([...sugeridas, ...feitasTodas].map(t => t.grupo).filter(Boolean))]
    .sort((a, b) => (GRUPOS.indexOf(a) + 1 || 99) - (GRUPOS.indexOf(b) + 1 || 99));

  pendentes = new Map(aFazer.map(t => [chaveDe(t), t]));
  const porFazenda = new Map();
  for (const t of aFazer) {
    if (!porFazenda.has(t.para.id)) porFazenda.set(t.para.id, []);
    porFazenda.get(t.para.id).push(t);
  }
  const total = aFazer.reduce((s, t) => s + t.qtd, 0);

  alvo.innerHTML = `
    <div class="grade">
      <label class="campo">Tipo <select id="tfGrupo"><option value="">Todos</option>${grupos.map(g =>
        `<option${g === filtro ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
    </div>
    <p class="es-nota">Sai tudo do estoque principal${princ ? ' — <strong>' + esc(princ.nome) + '</strong>' : ''}, pela última contagem fechada de cada tipo.
      O que ele não tem para mandar está na coluna <strong>Comprar</strong> do Resultado. Marcar <strong>Concluído</strong> não mexe no saldo:
      só tira daqui e faz o Resultado parar de pedir de novo.</p>

    <h3 class="es-secao">Transferências a fazer ${aFazer.length ? `<small>${aFazer.length} ${aFazer.length === 1 ? 'item' : 'itens'} · ${esc(mostrarNumero(total))} no total</small>` : ''}</h3>
    ${aFazer.length ? [...porFazenda.values()].map(ts => `
      <h4 class="tf-faz">${esc(princ ? princ.nome : 'Principal')} <span>&rarr;</span> ${esc(ts[0].para.nome)}</h4>
      <div class="lista">${ts.map(t => `<div class="item"><span></span>
        <div><div class="nome">${esc(t.item.nome)} <span class="tag alerta">${esc(t.grupo)}</span></div>
          <div class="sub">a fazenda precisa de ${esc(mostrarNumero(t.precisa))} ${esc(un(t.item))} · mandar ${esc(mostrarNumero(t.qtd))}</div></div>
        <div class="acoes tf-acoes">
          <input class="tf-qtd" inputmode="decimal" value="${esc(mostrarNumero(t.qtd))}" aria-label="quantidade" data-ch="${esc(chaveDe(t))}">
          <button class="btn mini principal tf-ok" type="button" data-ch="${esc(chaveDe(t))}">Concluído</button>
        </div>
      </div>`).join('')}</div>`).join('')
      : `<div class="vazio">Nada para transferir${filtro ? ' em ' + esc(filtro) : ''}. O que falta nas fazendas — se faltar — o principal não tem para mandar: está no Comprar do Resultado.</div>`}

    <h3 class="es-secao">Transferências concluídas ${feitas.length ? `<small>${feitas.length}</small>` : ''}</h3>
    ${feitas.length ? `<div class="lista">${feitas.map(t => {
      const i = itemDe(t.item_id);
      return `<div class="item tf-feita"><span></span>
        <div><div class="nome">${esc(i ? i.nome : '—')} <span class="tag">${esc(t.grupo || '')}</span></div>
          <div class="sub">${esc(mostrarNumero(t.quantidade))} ${esc(un(i))} · ${esc(nomeLocal(t.de_local_id))} &rarr; ${esc(nomeLocal(t.para_local_id))}
            · ${esc(t.concluida_por || '')} ${esc(dataHora(t.concluida_em))}</div></div>
        <div class="acoes"><button class="btn mini tf-desfazer" type="button" data-id="${esc(t.id)}">Desfazer</button></div>
      </div>`;
    }).join('')}</div>` : `<div class="vazio">Nenhuma transferência marcada como concluída${filtro ? ' em ' + esc(filtro) : ''}.</div>`}`;

  $('tfGrupo').addEventListener('change', e => { filtro = e.target.value; desenharTransferencias(); });
  alvo.querySelectorAll('.tf-ok').forEach(b => b.addEventListener('click', () => concluir(b.dataset.ch, alvo)));
  alvo.querySelectorAll('.tf-desfazer').forEach(b => b.addEventListener('click', () => desfazer(b.dataset.id)));
}

/** Marca como feita: grava o que saiu de verdade (a quantidade da caixinha). */
async function concluir(chave, alvo) {
  const t = pendentes.get(chave);
  if (!t) return;
  const campo = alvo.querySelector(`.tf-qtd[data-ch="${CSS.escape(chave)}"]`);
  const qtd = lerNumero(campo ? campo.value : t.qtd);
  if (!(qtd > 0)) { aviso('Quantidade inválida.', true); return; }
  if (!t.de || !t.para) { aviso('Sem estoque principal para tirar.', true); return; }
  await gravar('est_transferencias', {
    id: crypto.randomUUID(),
    item_id: t.item.id,
    de_local_id: t.de.id,
    para_local_id: t.para.id,
    quantidade: qtd,
    grupo: t.grupo,
    contagem_id: t.contagemId,
    concluida_em: new Date().toISOString(),
    concluida_por: meuNome(),
    ativo: true,
  });
  aviso(`${t.item.nome}: ${mostrarNumero(qtd)} ${un(t.item)} de ${t.de.nome} para ${t.para.nome}.`);
  desenharTransferencias();
}

/** Marcou sem querer: volta para "a fazer". */
async function desfazer(id) {
  const t = transferenciasFeitas().find(x => x.id === id);
  if (!t) return;
  await gravar('est_transferencias', Object.assign({}, t, { ativo: false }));
  aviso('Transferência desfeita: voltou para a lista do que falta fazer.');
  desenharTransferencias();
}
