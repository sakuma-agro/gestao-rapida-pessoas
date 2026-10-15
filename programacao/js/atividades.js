/* =====================================================================
   Gestão Rápida · Programação Campo — atividades
   Lançar, editar, repetir, reprogramar, concluir e listar.
   ===================================================================== */

/* ---------------------------------------------------------------- formulário */

/* Desenha o formulário da atividade dentro de `alvo`.
   `base` pode trazer valores para preencher (local, data, etc.).
   `aoSalvar(registros)` é chamado depois de gravar. */
function formAtividade(alvo, base = {}, aoSalvar) {
  const a = Object.assign({ status: 'Planejado' }, base);
  const novo = !a.id;
  alvo.innerHTML = `
    <div class="colunas">
      ${campoTexto('Data *', 'data', a.data || hoje(), 'date', '&nbsp;')}
      <div class="campo"><label for="f-local_id">Local *</label>
        <select id="f-local_id" name="local_id">${opcoesLocais(a.local_id)}</select></div>
      ${campoLista('Cultura *', 'cultura_id', q.ordenado('culturas'), a.cultura_id)}
      ${campoTexto('Plantio', 'plantio', a.plantio || '', 'text', 'Opcional. Ex.: PL 21')}
      ${campoLista('Atividade *', 'tipo_id', q.ordenado('tipos_atividade'), a.tipo_id)}
      ${campoLista('Operador', 'operador_id', q.ordenado('operadores'), a.operador_id, '— a definir —')}
      ${campoLista('Status *', 'status', STATUS, a.status, null)}
      ${campoLista('Prioridade', 'prioridade', PRIORIDADES, a.prioridade, 'Normal')}
      ${campoLista('Máquina', 'maquina_id', listaMaquinas(), a.maquina_id, '— nenhuma —')}
      ${campoLista('Implemento', 'implemento_id', listaImplementos(), a.implemento_id, '— nenhum —')}
      ${campoTexto('Horas previstas', 'horas_previstas', fmtNum(a.horas_previstas), 'text', '', 'inputmode="decimal"')}
      ${campoTexto('Horas realizadas', 'horas_realizadas', fmtNum(a.horas_realizadas), 'text', '', 'inputmode="decimal"')}
    </div>
    ${campoArea('Observações', 'observacoes', a.observacoes)}
    ${novo ? `
    <details class="pc-repetir">
      <summary>Repetir esta atividade em outras datas ou outros locais</summary>
      <div class="campo"><label>Outras datas</label>
        <div id="rp-datas" class="pc-chips"></div>
        <div class="pc-linha">
          <input type="date" id="rp-data">
          <button type="button" class="btn neutro" id="rp-add">Adicionar data</button>
        </div>
        <p class="ajuda">Ex.: Kcl - 1 e Kcl - 2. Cada data vira uma atividade.</p>
      </div>
      <div class="campo"><label>Também nos locais</label>
        <div class="pc-locais">${fazendasOrdenadas().map(f => {
          const ls = locaisOrdenados().filter(l => l.fazenda_id === f.id);
          return ls.length ? `<fieldset><legend>${esc(f.nome)}</legend>${ls.map(l =>
            `<label class="pc-cx"><input type="checkbox" class="rp-local" value="${l.id}"> ${esc(l.nome)}</label>`).join('')}</fieldset>` : '';
        }).join('')}</div>
      </div>
    </details>` : ''}
    <div class="acoes">
      <button type="button" class="btn" id="fa-salvar">${novo ? 'Salvar' : 'Salvar alterações'}</button>
      ${novo ? '<button type="button" class="btn secundario" id="fa-outra">Salvar e lançar outra</button>' : ''}
    </div>`;

  const $a = s => alvo.querySelector(s);
  const extras = [];

  const mostrarSemana = () => {
    const d = $a('#f-data').value;
    $a('#aj-data').innerHTML = d ? `Cai em <strong>${esc(rotuloSemana(chaveSemana(d)))}</strong> (${esc(diaSemana(d))})` : '&nbsp;';
  };
  $a('#f-data').oninput = mostrarSemana;
  mostrarSemana();

  // local com cultura fixa (abacate, café) preenche a cultura sozinho
  $a('#f-local_id').onchange = () => {
    const l = q.por_id('locais', $a('#f-local_id').value);
    if (l && l.cultura_id) $a('#f-cultura_id').value = l.cultura_id;
  };
  if (novo && a.local_id && !a.cultura_id) $a('#f-local_id').onchange();

  if (novo) {
    const pintar = () => {
      $a('#rp-datas').innerHTML = extras.map((d, i) =>
        `<span class="pc-chip">${br(d)} · S${semanaDe(d)} <button type="button" data-tira="${i}" aria-label="Tirar">×</button></span>`).join('')
        || '<small>nenhuma</small>';
      $a('#rp-datas').querySelectorAll('[data-tira]').forEach(b => b.onclick = () => { extras.splice(+b.dataset.tira, 1); pintar(); });
    };
    pintar();
    $a('#rp-add').onclick = () => {
      const d = $a('#rp-data').value;
      if (!d) return aviso('Escolha a data.', true);
      if (!extras.includes(d)) extras.push(d);
      extras.sort(); $a('#rp-data').value = ''; pintar();
    };
  }

  const salvar = async (continuar) => {
    const f = lerForm(alvo);
    for (const [c, rot] of [['data', 'a data'], ['local_id', 'o local'], ['cultura_id', 'a cultura'],
                            ['tipo_id', 'a atividade']]) {
      if (!f[c]) return aviso('Falta informar ' + rot + '.', true);
    }
    const reg = Object.assign({}, a, {
      data: f.data, local_id: f.local_id, cultura_id: f.cultura_id, tipo_id: f.tipo_id,
      operador_id: f.operador_id, status: f.status || 'Planejado', plantio: f.plantio,
      prioridade: f.prioridade || null,
      maquina_id: f.maquina_id, implemento_id: f.implemento_id,
      horas_previstas: num(f.horas_previstas), horas_realizadas: num(f.horas_realizadas),
      observacoes: f.observacoes, ativo: true
    });
    if (!novo && a.data !== reg.data) {
      const m = prompt('Motivo da mudança de data (fica no histórico):', a.motivo || '');
      if (m === null) return;
      reg.motivo = m.trim() || null;
    }
    const salvos = [];
    if (novo) {
      const datas = [reg.data, ...extras.filter(d => d !== reg.data)];
      const locais = [reg.local_id, ...Array.from(alvo.querySelectorAll('.rp-local:checked')).map(x => x.value)
                                              .filter(x => x !== reg.local_id)];
      for (const lid of locais) for (const d of datas) {
        const l = q.por_id('locais', lid);
        const r = Object.assign({}, reg, {
          id: crypto.randomUUID(), local_id: lid, data: d,
          // local com cultura própria mantém a dele
          cultura_id: (lid !== reg.local_id && l && l.cultura_id) ? l.cultura_id : reg.cultura_id
        });
        salvos.push(await gravarAtividade(r));
      }
    } else {
      salvos.push(await gravarAtividade(reg));
    }
    aviso(salvos.length > 1 ? `${salvos.length} atividades salvas.`
      : `Salvo em ${rotuloSemana(chaveSemana(salvos[0].data))}.`);
    if (continuar) {
      formAtividade(alvo, { data: reg.data, local_id: reg.local_id, cultura_id: reg.cultura_id, plantio: reg.plantio,
                            operador_id: reg.operador_id, maquina_id: reg.maquina_id }, aoSalvar);
    } else if (aoSalvar) aoSalvar(salvos);
  };
  $a('#fa-salvar').onclick = () => salvar(false);
  if (novo) $a('#fa-outra').onclick = () => salvar(true);
}

TELAS.lancar = el => {
  el.innerHTML = `<h1>Lançar atividade</h1>
    <p class="sub">A data já coloca a atividade no mês e na semana certos do painel.</p>
    <div class="pc-cartao" id="la-form"></div>`;
  const base = window.baseLancamento || {};
  window.baseLancamento = null;
  formAtividade($('#la-form'), base, () => TELAS.lancar(el));
};

/* ---------------------------------------------------------------- ficha da atividade */

async function abrirAtividade(id, depois) {
  const a = q.por_id('atividades', id);
  if (!a) return aviso('Atividade não encontrada.', true);
  const st = statusDe(a);
  abrirModal(`${nomeAtividade(a)} · ${q.nome('locais', a.local_id)}`, `
    <p class="sub">${br(a.data)} (${esc(diaSemana(a.data))}) · ${esc(rotuloSemana(chaveSemana(a.data)))} · ${etqStatus(a)} ${etqPrioridade(a)}</p>
    <div class="acoes pc-rapidas">
      ${st !== 'Concluído' ? '<button type="button" class="btn" data-ac="concluir">Concluir</button>' : ''}
      ${st !== 'Em andamento' && st !== 'Concluído' ? '<button type="button" class="btn secundario" data-ac="andamento">Em andamento</button>' : ''}
      <button type="button" class="btn secundario" data-ac="reprogramar">Reprogramar</button>
      ${st !== 'Cancelado' ? '<button type="button" class="btn neutro" data-ac="cancelar">Cancelar</button>' : ''}
      ${st === 'Concluído' || st === 'Cancelado' ? '<button type="button" class="btn neutro" data-ac="reabrir">Voltar para planejado</button>' : ''}
    </div>
    <div id="fa-edit"></div>
    <h3 class="pc-h3">Histórico</h3>
    <div id="fa-hist"><p class="sub">${App.online ? 'Buscando…' : 'O histórico aparece com internet.'}</p></div>
    <div class="acoes"><button type="button" class="btn-fantasma pc-excluir" data-ac="excluir">Excluir atividade</button></div>`,
  corpo => {
    const fim = () => { fecharModal(); if (depois) depois(); };
    formAtividade(corpo.querySelector('#fa-edit'), a, fim);
    corpo.querySelectorAll('[data-ac]').forEach(b => b.onclick = async () => {
      const ok = await acaoRapida(a, b.dataset.ac);
      if (ok) fim();
    });
    carregarHistorico(a.id, corpo.querySelector('#fa-hist'));
  });
}

async function carregarHistorico(id, alvo) {
  if (!App.online) return;
  const { data, error } = await App.sb.from('historico').select('*').eq('atividade_id', id).order('em', { ascending: false });
  if (error) { alvo.innerHTML = `<p class="sub">Não consegui ler o histórico.</p>`; return; }
  if (!data.length) { alvo.innerHTML = '<p class="sub">Ainda não subiu para o servidor.</p>'; return; }
  const quem = await nomesUsuarios(data.map(h => h.usuario_id));
  alvo.innerHTML = '<ul class="lista pc-hist">' + data.map(h => `<li><div class="info">
    <strong>${esc(h.campo)}</strong>${h.antes || h.depois ? `: ${esc(h.antes || '—')} → ${esc(h.depois || '—')}` : ''}
    ${h.motivo ? `<small>Motivo: ${esc(h.motivo)}</small>` : ''}
    <small>${new Date(h.em).toLocaleString('pt-BR')}${quem[h.usuario_id] ? ' · ' + esc(quem[h.usuario_id]) : ''}</small>
  </div></li>`).join('') + '</ul>';
}

const cacheNomes = {};
async function nomesUsuarios(ids) {
  q.todos('usuarios').forEach(u => { if (!(u.id in cacheNomes)) cacheNomes[u.id] = u.nome; });
  const faltam = [...new Set(ids.filter(x => x && !(x in cacheNomes)))];
  if (faltam.length && App.online) {
    // Gente do LOP e quem lançou no app antigo (programacao.usuarios).
    const { data } = await App.sb.from('usuarios').select('id,nome').in('id', faltam);
    (data || []).forEach(u => { cacheNomes[u.id] = u.nome; });
    faltam.forEach(x => { if (!(x in cacheNomes)) cacheNomes[x] = ''; });
  }
  return cacheNomes;
}

/* Ações de um toque, usadas na ficha, no painel e na reunião. */
async function acaoRapida(a, acao) {
  const r = Object.assign({}, a, { motivo: null });
  if (acao === 'concluir') {
    r.status = 'Concluído';
    if (r.horas_realizadas == null) {
      const h = prompt('Horas realizadas (pode deixar em branco):', '');
      if (h === null) return false;
      r.horas_realizadas = num(h);
    }
  } else if (acao === 'andamento') {
    r.status = 'Em andamento';
  } else if (acao === 'reabrir') {
    r.status = 'Planejado';
  } else if (acao === 'cancelar') {
    const m = prompt('Motivo do cancelamento:', '');
    if (m === null) return false;
    if (!m.trim()) { aviso('Informe o motivo do cancelamento.', true); return false; }
    r.status = 'Cancelado'; r.motivo = m.trim();
  } else if (acao === 'reprogramar') {
    return reprogramar(a);
  } else if (acao === 'excluir') {
    const m = prompt('Excluir esta atividade? Informe o motivo:', '');
    if (m === null) return false;
    r.ativo = false; r.motivo = m.trim() || 'excluída';
  }
  await gravarAtividade(r);
  aviso(acao === 'excluir' ? 'Atividade excluída.' : `Status: ${statusDe(r)}.`);
  return true;
}

/* Reprogramar pede a nova data e o motivo. Se `sugestao` vier (arrastar
   no painel), já abre com ela. */
function reprogramar(a, sugestao) {
  return new Promise(ok => {
    abrirModal('Reprogramar atividade', `
      <p class="sub"><strong>${esc(nomeAtividade(a))}</strong> · ${esc(q.nome('locais', a.local_id))}<br>
        Hoje está em ${br(a.data)} — ${esc(rotuloSemana(chaveSemana(a.data)))}.</p>
      ${campoTexto('Nova data *', 'nova', sugestao || a.data, 'date', '&nbsp;')}
      ${campoTexto('Motivo', 'motivo', '', 'text', 'Fica guardado no histórico. Ex.: chuva, máquina quebrada.')}
      <div class="acoes">
        <button type="button" class="btn" id="rp-ok">Reprogramar</button>
        <button type="button" class="btn neutro" id="rp-nao">Cancelar</button>
      </div>`, corpo => {
      const d = corpo.querySelector('#f-nova');
      const aj = corpo.querySelector('#aj-nova');
      const pinta = () => { aj.innerHTML = d.value ? 'Vai para <strong>' + esc(rotuloSemana(chaveSemana(d.value))) + '</strong>' : '&nbsp;'; };
      d.oninput = pinta; pinta();
      corpo.querySelector('#rp-nao').onclick = () => { fecharModal(); ok(false); };
      corpo.querySelector('#rp-ok').onclick = async () => {
        if (!d.value) return aviso('Escolha a nova data.', true);
        if (d.value === a.data) { fecharModal(); return ok(false); }
        const r = Object.assign({}, a, {
          data: d.value, motivo: corpo.querySelector('#f-motivo').value.trim() || null,
          status: a.status === 'Cancelado' || a.status === 'Concluído' ? 'Planejado' : a.status
        });
        await gravarAtividade(r);
        fecharModal();
        aviso('Reprogramada para ' + br(r.data) + '.');
        ok(true);
      };
    });
  });
}

/* ---------------------------------------------------------------- lista */

const filtroAtiv = { de: '', ate: '', fazenda: '', local: '', cultura: '', tipo: '', operador: '', status: '', busca: '' };

function filtrarAtividades(f) {
  const t = (f.busca || '').toLowerCase();
  return atividadesVisiveis().filter(a => {
    if (f.de && a.data < f.de) return false;
    if (f.ate && a.data > f.ate) return false;
    if (f.fazenda && fazendaDoLocal(a.local_id) !== f.fazenda) return false;
    if (f.local && a.local_id !== f.local) return false;
    if (f.cultura && a.cultura_id !== f.cultura) return false;
    if (f.tipo && a.tipo_id !== f.tipo) return false;
    if (f.operador && a.operador_id !== f.operador) return false;
    if (f.status === 'pendentes' ? !pendente(statusDe(a)) : (f.status && statusDe(a) !== f.status)) return false;
    if (f.prioridade && (a.prioridade || 'normal') !== f.prioridade) return false;
    if (t) {
      const txt = [nomeAtividade(a), q.nome('locais', a.local_id), q.nome('culturas', a.cultura_id), a.plantio,
        q.nome('operadores', a.operador_id), maqImpl(a), a.observacoes].join(' ').toLowerCase();
      if (!txt.includes(t)) return false;
    }
    return true;
  }).sort((a, b) => a.data.localeCompare(b.data) ||
    q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR'));
}

TELAS.atividades = el => {
  if (window.filtroInicialAtividades) {
    Object.keys(filtroAtiv).forEach(k => { filtroAtiv[k] = ''; });
    Object.assign(filtroAtiv, window.filtroInicialAtividades);
    window.filtroInicialAtividades = null;
  }
  const f = filtroAtiv;
  el.innerHTML = `
    <h1>Atividades</h1>
    <p class="sub">Toque na linha para abrir. Marque várias para mudar o status de uma vez ou copiar a sequência para outro local.</p>
    <div class="filtros pc-filtros">
      <label>De <input type="date" data-f="de" value="${esc(f.de)}"></label>
      <label>Até <input type="date" data-f="ate" value="${esc(f.ate)}"></label>
      <select data-f="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-f="local">${opcoesLocais(f.local, 'Todos os locais')}</select>
      <select data-f="cultura">${opcoes(q.ordenado('culturas'), f.cultura, 'Todas as culturas')}</select>
      <select data-f="tipo">${opcoes(q.ordenado('tipos_atividade'), f.tipo, 'Todas as atividades')}</select>
      <select data-f="operador">${opcoes(q.ordenado('operadores'), f.operador, 'Todos os operadores')}</select>
      <select data-f="status">${opcoes([{ id: 'pendentes', nome: 'Pendentes' }, ...STATUS_TODOS], f.status, 'Todos os status')}</select>
      <select data-f="prioridade">${opcoes([...PRIORIDADES, { id: 'normal', nome: 'Normal' }], f.prioridade, 'Todas as prioridades')}</select>
      <input type="search" data-f="busca" placeholder="Buscar…" value="${esc(f.busca)}">
      <button type="button" class="btn-fantasma" id="at-limpar">Limpar</button>
    </div>
    <div class="acoes">
      <button type="button" class="btn" id="at-novo">Lançar atividade</button>
      <button type="button" class="btn secundario" id="at-excel">Exportar Excel</button>
      <span class="cresce"></span>
      <span id="at-sel" class="pc-sel oculto">
        <strong id="at-qtd"></strong>
        <button type="button" class="btn secundario" data-lote="concluir">Concluir</button>
        <button type="button" class="btn secundario" data-lote="andamento">Em andamento</button>
        <button type="button" class="btn secundario" data-lote="copiar">Copiar para outro local</button>
      </span>
    </div>
    <div id="at-lista"></div>`;

  el.querySelectorAll('[data-f]').forEach(c => {
    c.oninput = c.onchange = () => { f[c.dataset.f] = c.value; desenhar(); };
  });
  el.querySelector('#at-limpar').onclick = () => { Object.keys(f).forEach(k => { f[k] = ''; }); TELAS.atividades(el); };
  el.querySelector('#at-novo').onclick = () => irPara('lancar');
  el.querySelector('#at-excel').onclick = () => exportarExcel(filtrarAtividades(f));

  const sel = new Set();
  const pintarSel = () => {
    el.querySelector('#at-sel').classList.toggle('oculto', !sel.size);
    el.querySelector('#at-qtd').textContent = sel.size + ' marcada' + (sel.size > 1 ? 's' : '');
  };
  el.querySelectorAll('[data-lote]').forEach(b => b.onclick = async () => {
    const lista = [...sel].map(id => q.por_id('atividades', id)).filter(Boolean);
    if (b.dataset.lote === 'copiar') return copiarSequencia(lista, () => TELAS.atividades(el));
    const novo = b.dataset.lote === 'concluir' ? 'Concluído' : 'Em andamento';
    if (!confirm(`Marcar ${lista.length} atividade(s) como ${novo}?`)) return;
    for (const a of lista) await gravarAtividade(Object.assign({}, a, { status: novo, motivo: null }));
    aviso(`${lista.length} atividade(s) atualizadas.`);
    TELAS.atividades(el);
  });

  function desenhar() {
    const lista = filtrarAtividades(f);
    sel.clear(); pintarSel();
    const alvo = el.querySelector('#at-lista');
    if (!lista.length) { alvo.innerHTML = '<div class="vazio"><p>Nenhuma atividade com esses filtros.</p></div>'; return; }
    const horas = lista.reduce((s, a) => s + (Number(a.horas_previstas) || 0), 0);
    alvo.innerHTML = `<div class="rolagem"><table class="tabela pc-grade">
      <thead><tr><th class="ce"><input type="checkbox" id="at-todas" aria-label="Marcar todas"></th>
        <th>Data</th><th>Semana</th><th>Atividade</th><th>Local</th><th>Cultura</th><th>Plantio</th>
        <th>Operador</th><th>Máquina / implemento</th><th class="num">Horas</th><th>Status</th><th class="ce">Ação</th></tr></thead>
      <tbody>${lista.map(a => `<tr data-id="${a.id}" class="${STATUS_CLASSE[statusDe(a)]}">
        <td class="ce"><input type="checkbox" class="at-cx" value="${a.id}"></td>
        <td>${br(a.data)}<br><small>${esc(diaSemana(a.data))}</small></td>
        <td>S${semanaDe(a.data)} · ${MESES_CURTOS[partes(a.data).mes - 1]}</td>
        <td><strong>${esc(nomeAtividade(a))}</strong>${a.prioridade ? '<br>' + etqPrioridade(a, true) : ''}</td>
        <td>${esc(q.nome('locais', a.local_id))}</td>
        <td><span class="pc-cor" style="background:${esc(corCultura(a.cultura_id))}"></span>${esc(q.nome('culturas', a.cultura_id))}</td>
        <td>${esc(a.plantio || '')}</td>
        <td>${esc(q.nome('operadores', a.operador_id)) || '<span class="pc-falta">a definir</span>'}</td>
        <td>${esc(maqImpl(a))}</td>
        <td class="num">${fmtNum(a.horas_realizadas ?? a.horas_previstas)}</td>
        <td>${etqStatus(a)}</td>
        <td class="ce">${pendente(statusDe(a))
          ? `<button type="button" class="at-ok" data-ok="${a.id}" title="Marcar como concluída">✓ Concluir</button>`
          : statusDe(a) === 'Concluído'
            ? `<button type="button" class="at-reabrir" data-reabrir="${a.id}" title="Voltar para planejado">Reabrir</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="pc-total"><td></td><td colspan="8">Total: ${lista.length} atividade${lista.length > 1 ? 's' : ''}</td>
        <td class="num">${fmtNum(horas)}</td><td></td><td></td></tr></tfoot>
    </table></div>`;
    alvo.querySelectorAll('tbody tr').forEach(tr => tr.onclick = e => {
      if (e.target.closest('input,button')) return;
      abrirAtividade(tr.dataset.id, desenhar);
    });
    // concluir com um toque, direto da lista (sem abrir a atividade)
    alvo.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
      const a = q.por_id('atividades', b.dataset.ok);
      if (!a) return;
      b.disabled = true;
      await gravarAtividade(Object.assign({}, a, { status: 'Concluído', motivo: null }));
      aviso(`${nomeAtividade(a)} · ${q.nome('locais', a.local_id)}: concluída.`);
      desenhar();
    });
    alvo.querySelectorAll('[data-reabrir]').forEach(b => b.onclick = async () => {
      const a = q.por_id('atividades', b.dataset.reabrir);
      if (a && await acaoRapida(a, 'reabrir')) desenhar();
    });
    alvo.querySelectorAll('.at-cx').forEach(cx => cx.onchange = () => {
      cx.checked ? sel.add(cx.value) : sel.delete(cx.value); pintarSel();
    });
    alvo.querySelector('#at-todas').onchange = e => {
      alvo.querySelectorAll('.at-cx').forEach(cx => { cx.checked = e.target.checked; cx.checked ? sel.add(cx.value) : sel.delete(cx.value); });
      pintarSel();
    };
  }
  desenhar();
};

/* Copia uma sequência (preparo, adubação, plantio…) para outro local,
   mantendo o intervalo entre as datas a partir de uma data inicial nova. */
function copiarSequencia(lista, depois) {
  if (!lista.length) return;
  lista = lista.slice().sort((a, b) => a.data.localeCompare(b.data));
  const primeira = lista[0].data;
  abrirModal('Copiar programação para outro local', `
    <p class="sub">${lista.length} atividade(s), de ${br(primeira)} a ${br(lista[lista.length - 1].data)}.
      As datas andam juntas: a primeira cai na data inicial e as outras mantêm a mesma distância.</p>
    <div class="campo"><label for="cp-local">Local de destino *</label>
      <select id="cp-local">${opcoesLocais('')}</select></div>
    ${campoTexto('Data inicial *', 'cp-data', primeira, 'date')}
    <div class="campo"><label class="pc-cx"><input type="checkbox" id="cp-op"> Manter os operadores</label></div>
    <div id="cp-previa"></div>
    <div class="acoes"><button type="button" class="btn" id="cp-ok">Copiar</button>
      <button type="button" class="btn neutro" id="cp-nao">Cancelar</button></div>`, corpo => {
    const loc = corpo.querySelector('#cp-local'), dt = corpo.querySelector('#f-cp-data');
    const previa = () => {
      const d0 = dt.value;
      corpo.querySelector('#cp-previa').innerHTML = d0 ? '<ul class="lista">' + lista.map(a => {
        const nd = somaDias(d0, difDias(primeira, a.data));
        return `<li><div class="info"><strong>${esc(nomeAtividade(a))}</strong><small>${br(nd)} · S${semanaDe(nd)} ${MESES_CURTOS[partes(nd).mes - 1]}</small></div></li>`;
      }).join('') + '</ul>' : '';
    };
    dt.oninput = previa; previa();
    corpo.querySelector('#cp-nao').onclick = fecharModal;
    corpo.querySelector('#cp-ok').onclick = async () => {
      if (!loc.value || !dt.value) return aviso('Escolha o local e a data inicial.', true);
      const l = q.por_id('locais', loc.value);
      const manterOp = corpo.querySelector('#cp-op').checked;
      for (const a of lista) {
        await gravarAtividade({
          id: crypto.randomUUID(), data: somaDias(dt.value, difDias(primeira, a.data)),
          local_id: loc.value, cultura_id: (l && l.cultura_id) || a.cultura_id, tipo_id: a.tipo_id,
          operador_id: manterOp ? a.operador_id : null, maquina_id: a.maquina_id, implemento_id: a.implemento_id,
          horas_previstas: a.horas_previstas, status: 'Planejado', observacoes: a.observacoes, ativo: true
        });
      }
      fecharModal();
      aviso(`${lista.length} atividade(s) copiadas para ${l ? l.nome : 'o local'}.`);
      if (depois) depois();
    };
  });
}

/* ---------------------------------------------------------------- Excel */

function linhasPlanilha(lista) {
  return lista.map(a => ({
    'Data': br(a.data),
    'Semana': 'Semana ' + semanaDe(a.data),
    'Mês': MESES[partes(a.data).mes - 1],
    'Fazenda': q.nome('fazendas', fazendaDoLocal(a.local_id)),
    'Local': q.nome('locais', a.local_id),
    'Cultura': q.nome('culturas', a.cultura_id),
    'Plantio': a.plantio || '',
    'Atividade': nomeAtividade(a),
    'Operador': q.nome('operadores', a.operador_id),
    'Máquina': nomeMaquina(a.maquina_id),
    'Implemento': nomeImplemento(a.implemento_id),
    'Horas previstas': a.horas_previstas ?? '',
    'Horas realizadas': a.horas_realizadas ?? '',
    'Status': statusDe(a),
    'Prioridade': nomePrioridade(a.prioridade) || 'Normal',
    'Observações': a.observacoes || ''
  }));
}

function exportarExcel(lista, nome = 'Programacao_Campo') {
  if (!window.XLSX) return aviso('A biblioteca do Excel não carregou. Abra o app com internet uma vez.', true);
  if (!lista.length) return aviso('Nada para exportar.', true);
  const ws = XLSX.utils.json_to_sheet(linhasPlanilha(lista));
  ws['!cols'] = [10, 10, 10, 14, 26, 18, 12, 24, 18, 16, 14, 10, 10, 12, 30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tarefas');
  XLSX.writeFile(wb, `${nome}_${hoje()}.xlsx`);
}

Object.assign(window, {
  formAtividade, abrirAtividade, acaoRapida, reprogramar, filtrarAtividades,
  copiarSequencia, exportarExcel, linhasPlanilha
});
