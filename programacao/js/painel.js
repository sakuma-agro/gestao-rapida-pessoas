/* =====================================================================
   Gestão Rápida · Programação Campo — painel anual
   O quadro da parede: locais nas linhas, 12 meses × 4 semanas nas colunas.
   ===================================================================== */

const filtroPainel = {
  ano: null, visao: 'ano', fazenda: '', cultura: '', operador: '', mes: '',
  status: new Set(['Planejado', 'Em andamento', 'Atrasado'])
};

TELAS.painel = el => {
  document.body.classList.add('modo-quadro');
  const f = filtroPainel;
  const agora = chaveSemana(hoje());
  if (!f.ano) f.ano = agora.ano;

  // Colunas do quadro: os 12 meses de um ano, ou os próximos 12 meses
  // a partir do mês atual (atravessando a virada do ano).
  const base = f.visao === '12m'
    ? Array.from({ length: 12 }, (_, i) => { const m = agora.mes - 1 + i; return { ano: agora.ano + Math.floor(m / 12), mes: m % 12 + 1 }; })
    : MESES.map((_, i) => ({ ano: f.ano, mes: i + 1 }));
  const chaveCol = c => c.ano + '-' + c.mes;
  const viraAno = new Set(base.map(c => c.ano)).size > 1;
  const nomeMes = c => MESES[c.mes - 1] + (viraAno ? '/' + String(c.ano).slice(2) : '');
  // no celular, abre um mês por vez
  if (!f.mesTocado && window.innerWidth < 760) f.mes = chaveCol(agora);
  if (f.mes && !base.some(c => chaveCol(c) === f.mes)) f.mes = '';

  const anos = new Set([agora.ano - 1, agora.ano, agora.ano + 1, f.ano]);
  atividadesVisiveis().forEach(a => anos.add(partes(a.data).ano));
  const valorVisao = f.visao === '12m' ? '12m' : 'ano:' + f.ano;
  const fim12 = f.visao === '12m' ? base[11] : { ano: agora.mes === 1 ? agora.ano : agora.ano + 1, mes: (agora.mes + 10) % 12 + 1 };
  const opcoesVisao = [...anos].sort().map(a => `<option value="ano:${a}"${valorVisao === 'ano:' + a ? ' selected' : ''}>Ano ${a}</option>`).join('') +
    `<option value="12m"${valorVisao === '12m' ? ' selected' : ''}>Próximos 12 meses (${MESES_CURTOS[agora.mes - 1]}/${String(agora.ano).slice(2)} a ${MESES_CURTOS[fim12.mes - 1]}/${String(fim12.ano).slice(2)})</option>`;

  // pendências fora do que está na tela (ex.: tarefas já lançadas para o ano que vem)
  const naTela = new Set(base.map(chaveCol));
  const fora = {};
  atividadesVisiveis().forEach(a => {
    const p = partes(a.data);
    if (naTela.has(p.ano + '-' + p.mes) || !pendente(statusDe(a))) return;
    fora[p.ano] = (fora[p.ano] || 0) + 1;
  });

  el.innerHTML = `
    <h1>${f.visao === '12m' ? 'Painel — próximos 12 meses' : 'Painel anual ' + f.ano}</h1>
    <p class="sub">Toque numa semana para ver, concluir ou lançar. No computador dá para arrastar a atividade para outra semana.</p>
    <details class="pc-maisfiltros" ${window.innerWidth >= 760 || f.abertos ? 'open' : ''}>
    <summary>Filtros e status</summary>
    <div class="filtros pc-filtros">
      <span class="pc-anos">
        <button type="button" class="btn neutro" id="pn-ano-ant" title="Ano anterior">‹</button>
        <select id="pn-visao" title="Período do quadro">${opcoesVisao}</select>
        <button type="button" class="btn neutro" id="pn-ano-prox" title="Próximo ano">›</button>
      </span>
      <select data-p="mes">${opcoes(base.map(c => ({ id: chaveCol(c), nome: MESES[c.mes - 1] + (viraAno ? ' ' + c.ano : '') })), f.mes, f.visao === '12m' ? 'Os 12 meses' : 'Ano inteiro')}</select>
      <select data-p="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-p="cultura">${opcoes(q.ordenado('culturas'), f.cultura, 'Todas as culturas')}</select>
      <select data-p="operador">${opcoes(q.ordenado('operadores'), f.operador, 'Todos os operadores')}</select>
    </div>
    <div class="pc-status">${STATUS_TODOS.map(s => `<label class="pc-cx ${STATUS_CLASSE[s]}">
      <input type="checkbox" data-st="${esc(s)}" ${f.status.has(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}
    </div>
    </details>
    ${Object.keys(fora).length ? `<div class="pc-fora">${Object.entries(fora).map(([a, n]) =>
      `<button type="button" class="pc-chip-ano" data-ir-ano="${a}">${n} pendente${n > 1 ? 's' : ''} em ${a} ${Number(a) > f.ano ? '→' : '←'}</button>`).join('')}</div>` : ''}
    <div class="pc-barra-quadro">
      <div class="legenda pc-legenda">${q.ordenado('culturas').map(c =>
      `<span class="lg"><i style="background:${esc(c.cor)}"></i>${esc(c.nome)}</span>`).join('')}</div>
      <div class="pc-zoom" role="group" aria-label="Tamanho do painel">
        <button type="button" class="btn neutro" data-z="-1" title="Diminuir">A−</button>
        <span id="pn-zv"></span>
        <button type="button" class="btn neutro" data-z="1" title="Ampliar">A+</button>
        <button type="button" class="btn neutro" id="pn-cheia">Tela cheia</button>
      </div>
      <button type="button" class="btn" id="pn-novo">Lançar atividade</button>
    </div>
    <div class="rolagem pc-rolagem" id="pn-quadro"></div>`;

  // tamanho do painel: fica guardado neste aparelho
  const lerZoom = () => { try { return Number(localStorage.getItem('pc.zoom')) || 1.25; } catch (e) { return 1.25; } };
  const aplicarZoom = z => {
    z = Math.min(2.2, Math.max(0.8, Math.round(z * 100) / 100));
    try { localStorage.setItem('pc.zoom', z); } catch (e) { /* sem armazenamento */ }
    el.querySelector('#pn-quadro').style.setProperty('--z', z);
    el.querySelector('#pn-zv').textContent = Math.round(z * 100) + '%';
    return z;
  };
  let zoom = aplicarZoom(lerZoom());
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zoom = aplicarZoom(zoom + 0.15 * Number(b.dataset.z)); });
  el.querySelector('#pn-cheia').onclick = () => {
    const q = el.querySelector('#pn-quadro');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (q.requestFullscreen) q.requestFullscreen().catch(() => aviso('Este aparelho não abre em tela cheia.', true));
  };

  const irAno = a => { f.visao = 'ano'; f.ano = a; f.mes = ''; f.mesTocado = true; TELAS.painel(el); };
  el.querySelector('#pn-ano-ant').onclick = () => irAno((f.visao === '12m' ? agora.ano : f.ano) - 1);
  el.querySelector('#pn-ano-prox').onclick = () => irAno((f.visao === '12m' ? agora.ano : f.ano) + 1);
  el.querySelector('#pn-visao').onchange = e => {
    if (e.target.value === '12m') { f.visao = '12m'; f.mes = ''; f.mesTocado = true; TELAS.painel(el); }
    else irAno(Number(e.target.value.slice(4)));
  };
  el.querySelectorAll('[data-ir-ano]').forEach(b => b.onclick = () => irAno(Number(b.dataset.irAno)));

  el.querySelectorAll('[data-p]').forEach(s => s.onchange = () => {
    f[s.dataset.p] = s.value;
    if (s.dataset.p === 'mes') f.mesTocado = true;
    f.abertos = true;
    TELAS.painel(el);
  });
  el.querySelectorAll('[data-st]').forEach(cx => cx.onchange = () => {
    cx.checked ? f.status.add(cx.dataset.st) : f.status.delete(cx.dataset.st);
    desenharQuadro();
  });
  el.querySelector('#pn-novo').onclick = () => irPara('lancar');

  function desenharQuadro() {
    const cols = f.mes ? base.filter(c => chaveCol(c) === f.mes) : base;
    const noQuadro = new Set(cols.map(chaveCol));
    const ativs = atividadesVisiveis().filter(a => {
      const p = partes(a.data);
      if (!noQuadro.has(p.ano + '-' + p.mes)) return false;
      if (f.cultura && a.cultura_id !== f.cultura) return false;
      if (f.operador && a.operador_id !== f.operador) return false;
      return f.status.has(statusDe(a));
    });
    const cel = {};
    ativs.forEach(a => {
      const p = partes(a.data);
      const k = a.local_id + '|' + p.ano + '-' + p.mes + '|' + semanaDe(a.data);
      (cel[k] = cel[k] || []).push(a);
    });

    const colAgora = chaveCol(agora) + '|' + agora.semana;
    const ehAgora = c => chaveCol(c) === chaveCol(agora);
    let html = `<table class="pc-quadro"><thead><tr><th class="pc-loc" rowspan="2">Local</th>
      ${cols.map(c => `<th colspan="4" class="pc-mes${ehAgora(c) ? ' agora' : ''}${c.mes === 1 && viraAno ? ' pc-vira' : ''}">${nomeMes(c)}</th>`).join('')}</tr>
      <tr>${cols.map(c => [1, 2, 3, 4].map(s =>
        `<th class="pc-sem${colAgora === chaveCol(c) + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}${s === 1 && c.mes === 1 && viraAno ? ' pc-vira' : ''}">S${s}</th>`).join('')).join('')}</tr></thead><tbody>`;

    fazendasOrdenadas().filter(fz => !f.fazenda || fz.id === f.fazenda).forEach(fz => {
      const locais = locaisOrdenados().filter(l => l.fazenda_id === fz.id);
      if (!locais.length) return;
      html += `<tr class="pc-faz"><th class="pc-loc">${esc(fz.nome)}</th><td colspan="${cols.length * 4}"></td></tr>`;
      locais.forEach(l => {
        html += `<tr><th class="pc-loc">${esc(l.nome)}</th>`;
        cols.forEach(c => [1, 2, 3, 4].forEach(s => {
          const lista = (cel[l.id + '|' + chaveCol(c) + '|' + s] || []).sort((a, b) => pesoPrioridade(a) - pesoPrioridade(b) || a.data.localeCompare(b.data));
          html += `<td class="pc-cel${colAgora === chaveCol(c) + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}${s === 1 && c.mes === 1 && viraAno ? ' pc-vira' : ''}"
            data-local="${l.id}" data-ano="${c.ano}" data-mes="${c.mes}" data-sem="${s}">${lista.map(a => `
            <div class="pc-etq ${STATUS_CLASSE[statusDe(a)]}${a.prioridade ? ' pri-' + a.prioridade : ''}" draggable="true" data-id="${a.id}"
              style="--cor:${esc(corCultura(a.cultura_id))}"
              title="${esc(br(a.data) + ' · ' + nomeAtividade(a) + ' – ' + q.nome('culturas', a.cultura_id) + (a.plantio ? ' · Plantio ' + a.plantio : '') + (a.prioridade ? ' · ' + nomePrioridade(a.prioridade) : '') + ' · ' + statusDe(a) + (a.operador_id ? ' · ' + q.nome('operadores', a.operador_id) : ''))}">
              <b>${partes(a.data).dia}</b> ${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}${a.plantio ? ` <i class="pc-pl">${esc(a.plantio)}</i>` : ''}</div>`).join('')}</td>`;
        }));
        html += '</tr>';
      });
    });
    html += '</tbody></table>';
    const q2 = el.querySelector('#pn-quadro');
    q2.innerHTML = html;

    // rola até a semana atual
    // abre com o mês atual logo depois da coluna dos locais
    const iAgora = cols.findIndex(ehAgora);
    if (!f.mes && iAgora > 0) {
      const ths = q2.querySelectorAll('thead tr:nth-child(2) th');
      const ini = ths[iAgora * 4];
      const loc = q2.querySelector('thead th.pc-loc');
      if (ini && loc) q2.scrollLeft = Math.max(0, ini.offsetLeft - loc.getBoundingClientRect().width - 4);
    }

    q2.querySelectorAll('.pc-etq').forEach(e => {
      e.onclick = ev => { ev.stopPropagation(); abrirAtividade(e.dataset.id, desenharQuadro); };
      e.ondragstart = ev => { ev.dataTransfer.setData('text/plain', e.dataset.id); e.classList.add('arrastando'); };
      e.ondragend = () => e.classList.remove('arrastando');
    });
    q2.querySelectorAll('.pc-cel').forEach(td => {
      td.onclick = () => abrirCelula(td.dataset.local, Number(td.dataset.ano), Number(td.dataset.mes), Number(td.dataset.sem), desenharQuadro);
      td.ondragover = ev => { ev.preventDefault(); td.classList.add('alvo'); };
      td.ondragleave = () => td.classList.remove('alvo');
      td.ondrop = async ev => {
        ev.preventDefault(); td.classList.remove('alvo');
        const a = q.por_id('atividades', ev.dataTransfer.getData('text/plain'));
        if (!a) return;
        const an = Number(td.dataset.ano), m = Number(td.dataset.mes), s = Number(td.dataset.sem);
        const mesmoLocal = td.dataset.local === a.local_id;
        if (!mesmoLocal) return aviso('Arraste só dentro da linha do mesmo local. Para trocar o local, abra a atividade.', true);
        if (mesmaSemana(a.data, { ano: an, mes: m, semana: s })) return;
        // sugere o mesmo dia da semana dentro da nova semana, sem passar do fim
        const desloc = (partes(a.data).dia - 1) % 7;
        let dia = (s - 1) * 7 + 1 + desloc;
        const fim = partes(fimSemana(an, m, s)).dia;
        if (dia > fim) dia = fim;
        const ok = await reprogramar(a, montaData(an, m, dia));
        if (ok) desenharQuadro();
      };
    });
  }
  desenharQuadro();
};

/* A célula do quadro: tudo daquele local na semana, com ações rápidas. */
function abrirCelula(localId, ano, mes, semana, depois) {
  const s = { ano, mes, semana };
  const l = q.por_id('locais', localId);
  const lista = atividadesVisiveis().filter(a => a.local_id === localId && mesmaSemana(a.data, s))
    .sort((a, b) => a.data.localeCompare(b.data));
  abrirModal(`${l ? l.nome : ''} · ${rotuloSemana(s)}`, `
    <p class="sub">De ${br(inicioSemana(ano, mes, semana))} a ${br(fimSemana(ano, mes, semana))}.</p>
    ${lista.length ? '<ul class="lista">' + lista.map(a => `
      <li data-id="${a.id}">
        <div class="info"><strong>${esc(nomeAtividade(a))} – ${esc(q.nome('culturas', a.cultura_id))}</strong>
          <small>${br(a.data)}${a.plantio ? ' · Plantio ' + esc(a.plantio) : ''} · ${esc(q.nome('operadores', a.operador_id) || 'operador a definir')}${maqImpl(a) ? ' · ' + esc(maqImpl(a)) : ''}</small></div>
        ${etqStatus(a)}
        <div class="pc-mini">
          ${statusDe(a) !== 'Concluído' ? '<button type="button" class="btn" data-ac="concluir">Concluir</button>' : ''}
          <button type="button" class="btn secundario" data-ac="reprogramar">Reprogramar</button>
          <button type="button" class="btn neutro" data-ac="abrir">Abrir</button>
        </div>
      </li>`).join('') + '</ul>' : '<div class="vazio"><p>Nada programado nesta semana.</p></div>'}
    <div class="acoes"><button type="button" class="btn" id="cl-novo">Lançar nesta semana</button></div>`, corpo => {
    corpo.querySelectorAll('li[data-id]').forEach(li => li.querySelectorAll('[data-ac]').forEach(b => b.onclick = async () => {
      const a = q.por_id('atividades', li.dataset.id);
      if (b.dataset.ac === 'abrir') return abrirAtividade(a.id, depois);
      const ok = await acaoRapida(a, b.dataset.ac);
      if (ok) { fecharModal(); depois(); }
    }));
    corpo.querySelector('#cl-novo').onclick = () => {
      fecharModal();
      const d = mesmaSemana(hoje(), s) ? hoje() : inicioSemana(ano, mes, semana);
      window.baseLancamento = { local_id: localId, data: d };
      irPara('lancar');
    };
  });
}

window.abrirCelula = abrirCelula;
