// culturas.js — Rateio mensal culturas › Culturas (20/10/2026).
// A tabela lateral da planilha: índice e ciclo de cada cultura. Permanente
// (abacate, café) nunca sai do rateio por tempo; as outras ficam "meses no
// rateio" meses (vazio = ciclo ÷ 30, arredondado) e depois saem sozinhas.
import { $, esc, pronto, carregando, todos, culturas, gravar, aviso, lerNumero, num, mesesDaCultura, semAcento, mesFechado, nomeMes, CADEADO } from './dados.js';

/* Parâmetro alterado (pedido dele, 20/10/2026): vale para os meses ABERTOS —
   as linhas deles recebem o índice e o ciclo novos — e nunca para os
   fechados, que estão com cadeado e guardam os números da época. */
async function levarAosMesesAbertos(c) {
  const linhas = todos('cb_itens').filter(i => i.cultura_id === c.id && !mesFechado(i.mes)
    && (Number(i.indice) !== Number(c.indice) || Number(i.ciclo) !== Number(c.ciclo)));
  for (const i of linhas) await gravar('cb_itens', { ...i, indice: Number(c.indice), ciclo: Number(c.ciclo) });
  return [...new Set(linhas.map(i => i.mes))].sort();
}

let ouvindo = false;
let verInativas = false;

function desenhar() {
  const alvo = $('cbCulturasCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = todos('cb_culturas').filter(c => verInativas || c.ativo !== false)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  alvo.innerHTML = `
    <p class="cb-param-aviso"><span class="cb-cadeado">${CADEADO} Cadeado</span> Mudar o índice ou o ciclo de uma cultura vale para os meses <b>abertos</b> e para os próximos. Os meses <b>fechados</b> ficam como foram fechados.</p>
    <form class="grade cad-novo" id="cbCultNova" autocomplete="off">
      <label class="campo">Cultura <input type="text" name="nome" required placeholder="ex.: Cebola"></label>
      <label class="campo">Índice <input type="text" name="indice" inputmode="decimal" required placeholder="ex.: 25000"></label>
      <label class="campo">Ciclo (dias) <input type="text" name="ciclo" inputmode="numeric" required placeholder="ex.: 150"></label>
      <label class="campo">Meses no rateio <input type="text" name="meses" inputmode="numeric" placeholder="vazio = ciclo ÷ 30"></label>
      <label class="cb-check" style="align-self:end"><input type="checkbox" name="permanente"> permanente (não sai por tempo)</label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <div class="barra entre">
      <span class="dc-sem">Peso do plantio = índice × área × (12 ÷ ciclo).</span>
      <label class="cb-check"><input type="checkbox" id="cbCultInativas"${verInativas ? ' checked' : ''}> mostrar desativadas</label>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Cultura</th><th class="dir">Índice</th><th class="dir">Ciclo (dias)</th><th class="ce">Meses no rateio</th><th>Regra</th><th></th></tr></thead>
      <tbody>${lista.map(c => {
        const lim = mesesDaCultura(c);
        return `<tr${c.ativo === false ? ' class="cb-inativa"' : ''}>
          <td><b>${esc(c.nome)}</b>${c.ativo === false ? ' <span class="tag inativo">desativada</span>' : ''}</td>
          <td class="dir">${esc(num(c.indice, 0))}</td>
          <td class="dir">${esc(c.ciclo)}</td>
          <td class="ce">${c.permanente ? '—' : lim + (c.meses_rateio ? '' : ' <small class="dc-sem">(auto)</small>')}</td>
          <td class="dc-sem">${c.permanente ? 'permanente: fica em todos os meses' : `sai do rateio depois de ${lim} ${lim === 1 ? 'mês' : 'meses'}`}</td>
          <td class="dir"><button class="btn mini" type="button" data-editar="${esc(c.id)}">Editar</button></td>
        </tr>`; }).join('') || '<tr><td colspan="6" class="vazio">Nenhuma cultura cadastrada.</td></tr>'}
      </tbody></table></div>`;

  $('cbCultNova').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = lerCampos(f);
    if (!r) return;
    if (todos('cb_culturas').some(c => semAcento(c.nome) === semAcento(r.nome))) { aviso('Já existe uma cultura com esse nome.', true); return; }
    const ordem = Math.max(0, ...todos('cb_culturas').map(c => Number(c.ordem) || 0)) + 1;
    await gravar('cb_culturas', { ...r, ordem, ativo: true });
    aviso('Cultura adicionada.');
    desenhar();
  });
  $('cbCultInativas').addEventListener('change', e => { verInativas = e.target.checked; desenhar(); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
}

function lerCampos(f) {
  const nome = String(f.get('nome') || '').trim().replace(/\s+/g, ' ');
  const indice = lerNumero(f.get('indice')), ciclo = lerNumero(f.get('ciclo')), meses = lerNumero(f.get('meses'));
  if (!nome) { aviso('Dê um nome à cultura.', true); return null; }
  if (indice === null || Number.isNaN(indice) || ciclo === null || Number.isNaN(ciclo) || ciclo <= 0) { aviso('Índice e ciclo: use só números (ciclo em dias, maior que zero).', true); return null; }
  if (Number.isNaN(meses)) { aviso('Meses no rateio: número inteiro, ou vazio.', true); return null; }
  return { nome, indice, ciclo: Math.round(ciclo), meses_rateio: meses ? Math.round(meses) : null, permanente: f.get('permanente') === 'on' };
}

function editar(id) {
  const c = todos('cb_culturas').find(x => x.id === id);
  if (!c) return;
  window.abrirModal('Editar cultura', `
    <form class="grade" id="cbCultEd" autocomplete="off">
      <label class="campo plena">Cultura <input type="text" name="nome" required value="${esc(c.nome)}"></label>
      <label class="campo">Índice <input type="text" name="indice" inputmode="decimal" value="${esc(num(c.indice, 0))}"></label>
      <label class="campo">Ciclo (dias) <input type="text" name="ciclo" inputmode="numeric" value="${esc(c.ciclo)}"></label>
      <label class="campo">Meses no rateio <input type="text" name="meses" inputmode="numeric" value="${esc(c.meses_rateio || '')}" placeholder="vazio = ciclo ÷ 30"></label>
      <label class="cb-check plena"><input type="checkbox" name="permanente"${c.permanente ? ' checked' : ''}> permanente (não sai do rateio por tempo)</label>
      <label class="cb-check plena"><input type="checkbox" name="ativo"${c.ativo !== false ? ' checked' : ''}> ativa (aparece na lista de culturas)</label>
      <div class="barra fim plena"><button class="btn" type="button" id="cbCultCancelar">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#cbCultCancelar').onclick = () => window.fecharModal();
    corpo.querySelector('#cbCultEd').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = lerCampos(f);
      if (!r) return;
      const nova = await gravar('cb_culturas', { ...c, ...r, ativo: f.get('ativo') === 'on' });
      window.fecharModal();
      const mudou = Number(c.indice) !== Number(r.indice) || Number(c.ciclo) !== Number(r.ciclo);
      const meses = mudou ? await levarAosMesesAbertos(nova) : [];
      try { if (window.cbSincronizarAbertos) await window.cbSincronizarAbertos(); } catch (e) { /* segue */ }
      aviso('Cultura salva.' + (meses.length ? ' Atualizada nos meses abertos: ' + meses.map(nomeMes).join(', ') + '. Os fechados não mudaram.' : mudou ? ' Nenhum mês aberto usa esta cultura; os fechados não mudaram.' : ''));
      desenhar();
    });
  });
}

export function abrirCulturas() {
  if (!ouvindo) { window.addEventListener('custobase-dados', () => { if (!$('telaRtCulturas').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
