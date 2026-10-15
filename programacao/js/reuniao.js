/* =====================================================================
   Gestão Rápida · Programação Campo — reunião semanal
   Semana anterior (programado × feito), semana atual e próxima semana,
   com ações rápidas e as anotações da reunião.
   ===================================================================== */

const estadoReuniao = { semana: null, fazenda: '' };

function atividadesDaSemana(s, fazenda) {
  return atividadesVisiveis().filter(a => mesmaSemana(a.data, s) &&
    (!fazenda || fazendaDoLocal(a.local_id) === fazenda))
    .sort((a, b) => a.data.localeCompare(b.data) ||
      q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR'));
}

function indicadores(lista) {
  const c = { total: 0, concluido: 0, atrasado: 0, andamento: 0, planejado: 0, cancelado: 0 };
  lista.forEach(a => {
    const s = statusDe(a);
    if (s === 'Cancelado') { c.cancelado++; return; }
    c.total++;
    if (s === 'Concluído') c.concluido++;
    else if (s === 'Atrasado') c.atrasado++;
    else if (s === 'Em andamento') c.andamento++;
    else c.planejado++;
  });
  c.pct = c.total ? Math.round(c.concluido * 100 / c.total) : 0;
  return c;
}

function reuniaoDe(s, fazenda) {
  return q.todos('reunioes').find(r => r.ano === s.ano && r.mes === s.mes && r.semana === s.semana &&
    (r.fazenda_id || '') === (fazenda || ''));
}

function atividadesEntre(de, ate, fazenda) {
  return atividadesVisiveis().filter(a => a.data >= de && a.data <= ate &&
    (!fazenda || fazendaDoLocal(a.local_id) === fazenda))
    .sort((a, b) => a.data.localeCompare(b.data) ||
      q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR'));
}

/* Período da reunião: uma semana do quadro (S1–S4) ou datas escolhidas. */
function periodoSemana(s) {
  const de = inicioSemana(s.ano, s.mes, s.semana), ate = fimSemana(s.ano, s.mes, s.semana);
  return { de, ate, semana: s, titulo: rotuloSemana(s), faixa: `${br(de)} a ${br(ate)}`,
           arquivo: `S${s.semana}_${MESES[s.mes - 1]}_${s.ano}` };
}
function periodoDatas(de, ate) {
  const dias = difDias(de, ate) + 1;
  return { de, ate, dias, semana: chaveSemana(de), titulo: `${br(de)} a ${br(ate)}`,
           faixa: `${dias} dia${dias > 1 ? 's' : ''}`, arquivo: `${de}_a_${ate}` };
}

TELAS.reuniao = el => {
  document.body.classList.remove('modo-quadro');
  const E = estadoReuniao;
  if (!E.semana) E.semana = chaveSemana(hoje());
  const livre = !!(E.de && E.ate);
  let P, ANT, PROX;
  if (livre) {
    P = periodoDatas(E.de, E.ate);
    ANT = periodoDatas(somaDias(E.de, -P.dias), somaDias(E.de, -1));
    PROX = periodoDatas(somaDias(E.ate, 1), somaDias(E.ate, P.dias));
  } else {
    P = periodoSemana(E.semana);
    ANT = periodoSemana(semanaVizinha(E.semana, -1));
    PROX = periodoSemana(semanaVizinha(E.semana, 1));
  }
  const s = P.semana;   // as anotações ficam guardadas na semana em que o período começa
  const atual = atividadesEntre(P.de, P.ate, E.fazenda);
  const listaAnt = atividadesEntre(ANT.de, ANT.ate, E.fazenda);
  const listaProx = atividadesEntre(PROX.de, PROX.ate, E.fazenda);
  const ind = indicadores(atual);
  const indAnt = indicadores(listaAnt);
  const reu = reuniaoDe(s, E.fazenda) || {};
  const nomeAnt = livre ? 'Período anterior' : 'Semana anterior';
  const nomeAtual = livre ? 'Período escolhido' : 'Esta semana';
  const nomeProx = livre ? 'Período seguinte' : 'Próxima semana';

  el.innerHTML = `
    <h1>Reunião semanal</h1>
    <div class="pc-navsem">
      <button type="button" class="btn neutro" id="rn-ant" aria-label="${nomeAnt}">‹</button>
      <div><strong>${esc(P.titulo)}</strong><small>${esc(P.faixa)}</small></div>
      <button type="button" class="btn neutro" id="rn-prox" aria-label="${nomeProx}">›</button>
      <button type="button" class="btn-fantasma" id="rn-hoje">Semana atual</button>
      <select id="rn-faz">${opcoes(fazendasOrdenadas(), E.fazenda, 'Todas as fazendas')}</select>
    </div>
    <div class="pc-periodo">
      <label>Data inicial <input type="date" id="rn-de" value="${esc(P.de)}"></label>
      <label>Data final <input type="date" id="rn-ate" value="${esc(P.ate)}"></label>
      <button type="button" class="btn" id="rn-aplicar">Ver período</button>
      ${livre ? '<span class="etq neutro">período escolhido</span>' : ''}
    </div>

    <div class="painel pc-ind">
      <div class="cartao"><b>${ind.total}</b><span>programadas</span></div>
      <div class="cartao pc-c-ok"><b>${ind.concluido}</b><span>concluídas</span></div>
      <div class="cartao"><b>${ind.andamento + ind.planejado}</b><span>a fazer</span></div>
      <div class="cartao ${ind.atrasado ? 'alerta' : ''}"><b>${ind.atrasado}</b><span>atrasadas</span></div>
      <div class="cartao"><b>${ind.pct}%</b><span>cumprimento</span></div>
      <div class="cartao"><b>${indAnt.pct}%</b><span>${nomeAnt.toLowerCase()}</span></div>
    </div>

    <div class="pc-reuniao">
      <section>${blocoPeriodo(nomeAnt + ' — programado × feito', ANT, listaAnt, true)}</section>
      <section>${blocoPeriodo(nomeAtual, P, atual)}</section>
      <section>${blocoPeriodo(nomeProx, PROX, listaProx)}</section>
    </div>

    <section class="pc-cartao">
      <h2>Anotações da reunião</h2>
      <div class="colunas">
        ${campoTexto('Data da reunião', 'data_reuniao', reu.data_reuniao || hoje(), 'date')}
        ${campoTexto('Participantes', 'participantes', reu.participantes || '')}
      </div>
      ${campoArea('Anotações, decisões e combinados', 'anotacoes', reu.anotacoes || '')}
      <div class="acoes">
        <button type="button" class="btn" id="rn-salvar">Salvar anotações</button>
        <button type="button" class="btn secundario" id="rn-pdf">Relatório da reunião (PDF)</button>
        <button type="button" class="btn secundario" id="rn-ficha">Ficha de conferência (imprimir)</button>
        <button type="button" class="btn secundario" id="rn-ficha-op">Ficha por operador (imprimir)</button>
        <button type="button" class="btn secundario" id="rn-lancar">Lançar atividade</button>
      </div>
    </section>`;

  const ir = alvo => {
    if (livre) { E.de = alvo.de; E.ate = alvo.ate; } else { E.semana = alvo.semana; }
    TELAS.reuniao(el);
  };
  el.querySelector('#rn-ant').onclick = () => ir(ANT);
  el.querySelector('#rn-prox').onclick = () => ir(PROX);
  el.querySelector('#rn-hoje').onclick = () => { E.de = E.ate = null; E.semana = chaveSemana(hoje()); TELAS.reuniao(el); };
  el.querySelector('#rn-faz').onchange = e => { E.fazenda = e.target.value; TELAS.reuniao(el); };
  el.querySelector('#rn-aplicar').onclick = () => {
    const de = el.querySelector('#rn-de').value, ate = el.querySelector('#rn-ate').value;
    if (!de || !ate) return aviso('Escolha a data inicial e a data final.', true);
    if (ate < de) return aviso('A data final não pode ser antes da inicial.', true);
    if (difDias(de, ate) > 366) return aviso('Escolha um período de até um ano.', true);
    E.de = de; E.ate = ate;
    TELAS.reuniao(el);
  };
  el.querySelector('#rn-lancar').onclick = () => {
    window.baseLancamento = { data: (hoje() >= P.de && hoje() <= P.ate) ? hoje() : P.de };
    irPara('lancar');
  };

  el.querySelectorAll('[data-rid]').forEach(b => b.onclick = async () => {
    const a = q.por_id('atividades', b.dataset.rid);
    if (b.dataset.ac === 'abrir') return abrirAtividade(a.id, () => TELAS.reuniao(el));
    const ok = await acaoRapida(a, b.dataset.ac);
    if (ok) TELAS.reuniao(el);
  });

  const salvarNotas = async () => {
    const f = lerForm(el.querySelector('.pc-cartao'));
    const r = Object.assign({}, reu, {
      id: reu.id || crypto.randomUUID(), ano: s.ano, mes: s.mes, semana: s.semana,
      fazenda_id: E.fazenda || null, data_reuniao: f.data_reuniao,
      participantes: f.participantes, anotacoes: f.anotacoes, ativo: true,
      atualizado_em: new Date().toISOString()
    });
    await gravar('reunioes', r);
    return r;
  };
  const rotuloPdf = `${P.titulo} (${P.faixa})`;
  el.querySelector('#rn-salvar').onclick = async () => { await salvarNotas(); aviso('Anotações salvas.'); };
  const ficha = modo => {
    const itens = atual.filter(a => statusDe(a) !== 'Cancelado');
    if (!itens.length) return aviso('Nada programado nesse período.', true);
    gerarRelatorio({ tipo: 'ficha', titulo: 'Ficha de conferência das atividades', agrupar: modo,
      periodo: rotuloPdf, fazenda: E.fazenda, lista: itens,
      arquivo: (modo === 'operador' ? 'Ficha_por_operador_' : 'Ficha_') + P.arquivo });
  };
  el.querySelector('#rn-ficha').onclick = () => ficha('');
  el.querySelector('#rn-ficha-op').onclick = () => ficha('operador');
  el.querySelector('#rn-pdf').onclick = async () => {
    const r = await salvarNotas();
    gerarRelatorio({
      titulo: 'Relatório da reunião semanal',
      periodo: rotuloPdf,
      fazenda: E.fazenda,
      lista: atual,
      blocos: [
        { titulo: `${nomeAnt} — ${ANT.titulo}`, lista: listaAnt },
        { titulo: `${nomeProx} — ${PROX.titulo}`, lista: listaProx }
      ],
      reuniao: r,
      arquivo: 'Reuniao_' + P.arquivo
    });
  };
};

function blocoPeriodo(titulo, P, lista, retrospectiva = false) {
  const ind = indicadores(lista);
  return `<h2>${esc(titulo)}</h2>
    <p class="sub">${esc(P.titulo)} · ${ind.total} programada${ind.total === 1 ? '' : 's'}${retrospectiva ? ` · ${ind.concluido} feita${ind.concluido === 1 ? '' : 's'} (${ind.pct}%)` : ''}</p>
    ${lista.length ? '<ul class="lista pc-rlista">' + lista.map(a => {
      const st = statusDe(a);
      return `<li class="${STATUS_CLASSE[st]}${a.prioridade ? ' pri-' + a.prioridade : ''}">
        <div class="info"><strong>${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}</strong>
          <small>${br(a.data)} (${esc(diaSemana(a.data))}) · ${esc(q.nome('locais', a.local_id))}${a.plantio ? ' · Plantio ' + esc(a.plantio) : ''}</small>
          <small>${esc(q.nome('operadores', a.operador_id) || 'operador a definir')}${maqImpl(a) ? ' · ' + esc(maqImpl(a)) : ''}</small></div>
        ${etqStatus(st)} ${etqPrioridade(a, true)}
        <div class="pc-mini">
          ${st !== 'Concluído' && st !== 'Cancelado' ? `<button type="button" class="btn" data-rid="${a.id}" data-ac="concluir">Concluir</button>` : ''}
          ${pendente(st) && st !== 'Em andamento' ? `<button type="button" class="btn secundario" data-rid="${a.id}" data-ac="andamento">Em andamento</button>` : ''}
          ${pendente(st) ? `<button type="button" class="btn secundario" data-rid="${a.id}" data-ac="reprogramar">Reprogramar</button>` : ''}
          ${pendente(st) ? `<button type="button" class="btn neutro" data-rid="${a.id}" data-ac="cancelar">Cancelar</button>` : ''}
          <button type="button" class="btn-fantasma" data-rid="${a.id}" data-ac="abrir">Abrir</button>
        </div></li>`;
    }).join('') + '</ul>' : '<div class="vazio"><p>Nada programado.</p></div>'}`;
}

Object.assign(window, { atividadesDaSemana, atividadesEntre, indicadores });
