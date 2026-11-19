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
import { enviarWhatsapp, FRASE_LOP } from './pdf.js';

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
    ${aFazer.length ? `<div class="barra fim">
      <button class="btn btn-zap" type="button" id="tfWhats"><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar PDF no WhatsApp</button>
      <button class="btn principal" type="button" id="tfImprimir">Imprimir a guia</button></div>` : ''}

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
  $('tfImprimir')?.addEventListener('click', () => { folhaTransf(porFazenda); setTimeout(() => window.print(), 60); });
  $('tfWhats')?.addEventListener('click', ev => enviarWhatsapp(pdfTransf(porFazenda), ev.currentTarget));
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

/* ---------------- Guia de transferência (19/11/2026, pedido dele:
   "quero poder imprimir o relatório de transferências") ----------------
   Uma folha por fazenda de destino, no padrão SAKUMA: o que sai do principal,
   com linha para quem entrega e para quem recebe. É o papel que vai junto com
   o material. Lista o que ainda falta fazer — o que já foi marcado como
   concluído sai da guia. */
const hojeBR = () => new Date().toLocaleDateString('pt-BR');
const POR_FOLHA = 24;
const origemNome = () => { const l = localPrincipal(); return l ? l.nome : 'Estoque principal'; };

function folhaTransf(porFazenda) {
  const folhas = [];
  for (const ts of porFazenda.values()) {
    const pags = [];
    for (let i = 0; i < ts.length; i += POR_FOLHA) pags.push(ts.slice(i, i + POR_FOLHA));
    const total = ts.reduce((t, x) => t + x.qtd, 0);
    pags.forEach((pag, k) => folhas.push(`<div class="folha rel">
      <div class="rel-topo">
        <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
        <div class="rel-tit"><h1>Guia de Transferência</h1>
          <p>${esc(origemNome())} &rarr; <b>${esc(ts[0].para.nome)}</b> · emitida em ${esc(hojeBR())}${pags.length > 1 ? ' · folha ' + (k + 1) + ' de ' + pags.length : ''}</p></div>
      </div>
      <table class="rel-tab" style="margin-top:6mm"><thead><tr>
        <th class="ce" style="width:12mm">Nº</th><th>Produto</th><th style="width:34mm">Tipo</th>
        <th class="ce" style="width:16mm">Un.</th><th class="ce" style="width:24mm">Qtd.</th>
        <th class="ce" style="width:26mm">Conferido</th></tr></thead>
      <tbody>${pag.map(t => `<tr>
        <td class="ce">${ts.indexOf(t) + 1}</td><td>${esc(t.item.nome)}</td><td>${esc(t.grupo)}</td>
        <td class="ce">${esc(un(t.item))}</td><td class="ce"><b>${esc(mostrarNumero(t.qtd))}</b></td>
        <td class="ce">&nbsp;</td></tr>`).join('')}
        ${k === pags.length - 1 ? `<tr><td></td><td><b>Total: ${ts.length} ${ts.length === 1 ? 'item' : 'itens'}</b></td><td></td><td></td>
          <td class="ce"><b>${esc(mostrarNumero(total))}</b></td><td></td></tr>` : ''}</tbody></table>
      ${k === pags.length - 1 ? `<p style="font-size:8.5pt;color:#51534A;margin:0 0 4mm">O material sai do ${esc(origemNome())} e entra no estoque da ${esc(ts[0].para.nome)}.
        Confira item a item na entrega e assine as duas vias.</p>` : ''}
      <div class="rel-pe">
        <div class="rel-assina"><span></span><small>Entregue por — ${esc(origemNome())}</small></div>
        <div class="rel-assina"><span></span><small>Recebido por — ${esc(ts[0].para.nome)}</small></div>
        <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
      </div>
    </div>`));
  }
  $('tfFolha').innerHTML = folhas.join('');
}

/** A mesma guia em PDF, para mandar no WhatsApp: uma tabela por fazenda. */
function pdfTransf(porFazenda) {
  const fs = [...porFazenda.values()];
  const itens = fs.reduce((t, ts) => t + ts.length, 0);
  return {
    titulo: 'Guia de Transferência',
    subtitulo: `Saída do ${origemNome()}${filtro ? ' · ' + filtro : ''} · emitida em ${hojeBR()}`,
    arquivo: `Guia de Transferencia ${new Date().toISOString().slice(0, 10)}${filtro ? ' ' + filtro : ''}`,
    kpis: [['Origem', origemNome()], ['Fazendas', String(fs.length)], ['Itens', String(itens)]],
    secoes: fs.map(ts => ({
      titulo: origemNome() + ' > ' + ts[0].para.nome,
      head: ['Nº', 'Produto', 'Tipo', 'Un.', 'Qtd.'],
      centro: [0, 3, 4],
      body: ts.map((t, k) => [k + 1, t.item.nome, t.grupo, un(t.item), mostrarNumero(t.qtd)]),
      total: ['', `Total: ${ts.length} ${ts.length === 1 ? 'item' : 'itens'}`, '', '', mostrarNumero(ts.reduce((s, x) => s + x.qtd, 0))],
    })),
    notas: { titulo: 'Conferência', texto: ['O material sai do ' + origemNome() + ' e entra no estoque da fazenda de destino. Confira item a item na entrega.'] },
  };
}
