// parametros.js — Parâmetros: Culturas (perfil) e Carga inicial das planilhas (20/10/2026).
import { $, esc, pronto, carregando, todos, culturas, gravar, aviso, souAdmin, campos, classes, param, num, lerNumero } from './dados.js';

const MODOS = [['balanca', 'Balança (ticket)'], ['balanca_coop', 'Balança + cooperativa'], ['coop', 'Só cooperativa (pagamento)'], ['nenhuma', 'Sem conferência']];

/* ================================================================ culturas */
function desenharCulturas() {
  const alvo = $('cpCultCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  alvo.innerHTML = `<div class="cp-cult-grade">${culturas().map(c => `
    <div class="cp-cult" style="--cor:${esc(c.cor || '#84BD00')}">
      <header><i></i><b>${esc(c.nome)}</b><button class="btn mini" type="button" data-editar="${esc(c.id)}">Editar</button></header>
      <dl>
        <dt>Unidade</dt><dd>${esc(c.unidade_nome)}${c.unidade_kg ? ' de ' + num(c.unidade_kg, 0) + ' kg' : ''} · ${campos(c).sacas_por_peso ? 'pelo peso líquido' : campos(c).quantidade_auto === 'soma_classes' ? 'soma das classes' : 'contada na carga'}</dd>
        <dt>Compara por</dt><dd>${esc(c.unidade_area)}</dd>
        <dt>Classificação</dt><dd>${classes(c).map(k => esc(k.nome)).join(' · ') || '—'}${classes(c)[0] ? ` <small>(${classes(c)[0].modo === 'kg' ? 'kg' : esc(c.unidade_nome)})</small>` : ''}</dd>
        <dt>Conferência</dt><dd>${esc((MODOS.find(m => m[0] === c.conciliacao) || [, c.conciliacao])[1])}${c.palavra_chave ? ' · produto "' + esc(c.palavra_chave) + '"' : ''}</dd>
        <dt>Tolerâncias</dt><dd>data ±${esc(param(c, 'tolerancia_data', 3))} dias · peso ±${esc(num(param(c, 'tolerancia_peso_pct', 0.5), 1))}%${param(c, 'conferir_nf') ? ' · confere NF' : ''}</dd>
        ${param(c, 'frete_por_carga') ? `<dt>Frete premissa</dt><dd>R$ ${esc(num(param(c, 'frete_por_carga'), 2))} por carga</dd>` : ''}
      </dl></div>`).join('')}</div>
    ${souAdmin() ? '' : '<p class="dc-sem">Só o administrador altera os parâmetros.</p>'}`;
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
}

function editar(id) {
  if (!souAdmin()) { aviso('Só o administrador altera os parâmetros.', true); return; }
  const c = todos('cp_culturas').find(x => x.id === id);
  const cp = campos(c);
  const clsTxt = classes(c).map(k => k.chave + ' = ' + k.nome).join('\n');
  window.abrirModal('Parâmetros · ' + c.nome, `
    <form class="grade" id="cpCuForm" autocomplete="off">
      <label class="campo">Nome <input type="text" name="nome" required value="${esc(c.nome)}"></label>
      <label class="campo">Cor <input type="color" name="cor" value="${esc(c.cor || '#84BD00')}"></label>
      <label class="campo">Unidade <input type="text" name="unidade_nome" required value="${esc(c.unidade_nome)}" placeholder="cx, sc"></label>
      <label class="campo">Kg por unidade <input type="text" name="unidade_kg" inputmode="decimal" value="${c.unidade_kg ? esc(num(c.unidade_kg, 0)) : ''}" placeholder="vazio = sem peso fixo"></label>
      <label class="campo">Como contar as unidades <select name="conta">
        <option value="peso"${cp.sacas_por_peso ? ' selected' : ''}>Peso líquido ÷ kg por unidade</option>
        <option value="classes"${cp.quantidade_auto === 'soma_classes' ? ' selected' : ''}>Soma das classes da carga</option>
        <option value="contada"${!cp.sacas_por_peso && cp.quantidade_auto !== 'soma_classes' ? ' selected' : ''}>Quantidade contada na carga</option></select></label>
      <label class="campo">Compara por <select name="unidade_area">${['plantio', 'quadra', 'talhão'].map(t => `<option${t === c.unidade_area ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo plena">Classificação — uma por linha, "CHAVE = Nome" (vazio = sem classificação)
        <textarea name="classes" rows="5">${esc(clsTxt)}</textarea></label>
      <label class="campo">Classificação em <select name="modo"><option value="kg"${(classes(c)[0] || {}).modo === 'kg' ? ' selected' : ''}>kg (boletim)</option><option value="un"${(classes(c)[0] || {}).modo !== 'kg' ? ' selected' : ''}>${esc(c.unidade_nome)}</option></select></label>
      <label class="campo">Conferência <select name="conciliacao">${MODOS.map(([v, r]) => `<option value="${v}"${v === c.conciliacao ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="campo">Palavra-chave do produto nos relatórios <input type="text" name="palavra_chave" value="${esc(c.palavra_chave || '')}"></label>
      <label class="campo">Tolerância de data (dias) <input type="text" name="tolerancia_data" inputmode="numeric" value="${esc(param(c, 'tolerancia_data', 3))}"></label>
      <label class="campo">Tolerância de peso (%) <input type="text" name="tolerancia_peso_pct" inputmode="decimal" value="${esc(num(param(c, 'tolerancia_peso_pct', 0.5), 2))}"></label>
      <label class="campo">Frete por carga, premissa (R$) <input type="text" name="frete_por_carga" inputmode="decimal" value="${param(c, 'frete_por_carga') ? esc(num(param(c, 'frete_por_carga'), 2)) : ''}"></label>
      <label class="cb-check plena"><input type="checkbox" name="conferir_nf"${param(c, 'conferir_nf') ? ' checked' : ''}> conferir a NF da carga com a da balança/cooperativa</label>
      <p class="cb-param-aviso plena">Mudar unidade ou classificação muda as contas de todas as safras desta cultura (o que foi lançado nas cargas não se perde).</p>
      <div class="barra fim plena"><button class="btn" type="button" id="cpCuNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#cpCuNao').onclick = () => window.fecharModal();
    corpo.querySelector('#cpCuForm').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const kg = lerNumero(fd.get('unidade_kg')), tolD = lerNumero(fd.get('tolerancia_data')), tolP = lerNumero(fd.get('tolerancia_peso_pct')), frete = lerNumero(fd.get('frete_por_carga'));
      if ([kg, tolD, tolP, frete].some(n => Number.isNaN(n))) { aviso('Use só números nos campos numéricos.', true); return; }
      const modo = fd.get('modo');
      const cls = String(fd.get('classes') || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [ch, ...nm] = l.split('='); const chave = ch.trim().toUpperCase().replace(/\s+/g, '');
        return { chave, nome: (nm.join('=').trim() || ch.trim()), modo };
      });
      if (new Set(cls.map(k => k.chave)).size !== cls.length) { aviso('Há classes com a mesma chave.', true); return; }
      const conta = fd.get('conta');
      if (conta === 'peso' && !kg) { aviso('Para contar pelo peso, informe os kg por unidade.', true); return; }
      const novosCampos = { ...cp, sacas_por_peso: conta === 'peso' };
      if (conta === 'classes') novosCampos.quantidade_auto = 'soma_classes'; else delete novosCampos.quantidade_auto;
      await gravar('cp_culturas', { ...c, nome: String(fd.get('nome')).trim(), cor: fd.get('cor'), unidade_nome: String(fd.get('unidade_nome')).trim(), unidade_kg: kg,
        unidade_area: fd.get('unidade_area'), classes: cls, conciliacao: fd.get('conciliacao'), palavra_chave: String(fd.get('palavra_chave') || '').trim().toUpperCase() || null,
        campos: novosCampos,
        parametros: { ...(c.parametros || {}), tolerancia_data: tolD ?? 3, tolerancia_peso_pct: tolP ?? 0.5, frete_por_carga: frete, conferir_nf: fd.get('conferir_nf') === 'on' } });
      window.fecharModal(); aviso('Parâmetros salvos.'); desenharCulturas();
    });
  });
}
export function abrirCulturas() { desenharCulturas(); }

/* ================================================================ carga inicial */
const ORDEM = ['cp_safras', 'cp_plantios', 'cp_veiculos', 'cp_historico', 'cp_balanca', 'cp_cooperativa', 'cp_cargas', 'cp_custos'];
const NOMES = { cp_safras: 'Safras', cp_plantios: 'Plantios / quadras', cp_veiculos: 'Placas', cp_historico: 'Histórico de safras',
  cp_balanca: 'Tickets da balança', cp_cooperativa: 'Tickets da cooperativa', cp_cargas: 'Cargas', cp_custos: 'Custos' };
function desenharCargaIni() {
  const alvo = $('cpCargaIniCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  if (!souAdmin()) { alvo.innerHTML = '<div class="vazio">Só o administrador faz a carga inicial.</div>'; return; }
  alvo.innerHTML = `
    <table class="dc-planilha cb-tab" style="max-width:520px"><thead><tr><th>No app hoje</th><th class="dir">Registros</th></tr></thead>
      <tbody>${ORDEM.map(t => `<tr><td>${NOMES[t]}</td><td class="dir">${todos(t).filter(x => x.ativo !== false).length}</td></tr>`).join('')}</tbody></table>
    <div class="barra"><label class="btn principal cp-arq">Escolher carga-inicial-colheita.json<input type="file" accept=".json,application/json" id="cpCiArq" hidden></label>
      <span class="dc-sem" id="cpCiProg"></span></div>
    <div id="cpCiRes"></div>`;
  $('cpCiArq').addEventListener('change', async e => {
    const arq = e.target.files[0]; if (!arq) return;
    let dados;
    try { dados = JSON.parse(await arq.text()); } catch (er) { aviso('Arquivo inválido: ' + er.message, true); return; }
    const tabs = dados && dados.tabelas;
    if (!tabs || dados.origem !== 'lop-colheita') { aviso('Este arquivo não é a carga inicial da Colheita.', true); return; }
    const prog = $('cpCiProg'), res = [];
    e.target.disabled = true;
    try {
      for (const t of ORDEM) {
        const linhas = tabs[t] || [];
        if (!linhas.length) continue;
        const conflito = t === 'cp_balanca' || t === 'cp_cooperativa' ? 'ticket' : 'id';
        await window.gravarLote(t, linhas, { ignorarRepetidos: true, conflito, aoAvancar: (f, tot) => { prog.textContent = `${NOMES[t]}: ${f} de ${tot}…`; } });
        res.push([NOMES[t], linhas.length]);
      }
      prog.textContent = 'Concluído.';
      aviso('Carga inicial feita. Abra o Painel da safra.');
      await window.baixarBase(true);
      window.avisarDados();
      $('cpCiRes').innerHTML = `<div class="aviso info">Enviado: ${res.map(([n, q]) => `${esc(n)} ${q}`).join(' · ')}. O que já existia (mesmo id ou ticket) foi mantido.</div>`;
    } catch (er) {
      aviso('A carga parou: ' + (er.message || er) + '. Pode escolher o arquivo de novo — o que já subiu não duplica.', true);
      prog.textContent = '';
    } finally { e.target.disabled = false; }
  });
}
export function abrirCargaInicial() { desenharCargaIni(); }
