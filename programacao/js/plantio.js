/* =====================================================================
   Gestão Rápida · Programação Campo — programação por plantio
   Quadro horizontal como o painel: cada linha é um plantio (com o local),
   as colunas são os meses × S1–S4, do primeiro ao último serviço.
   "PL 27 e PL 28" entra nas duas linhas. Sem plantio informado, a
   linha fica pelo local e cultura.
   ===================================================================== */

const filtroPlantio = { fazenda: '', cultura: '', busca: '', situacao: 'pendentes', semPlantio: true };

/* "PL 27 e PL 28" → ['PL 27', 'PL 28']; texto livre fica como está */
function plantiosDe(a) {
  const t = (a.plantio || '').trim();
  if (!t) return [''];
  const pls = t.match(/PL\s*-?\s*\d+/gi);
  return pls ? [...new Set(pls.map(p => 'PL ' + p.replace(/\D/g, '')))] : [t];
}
const numPlantio = p => { const m = /(\d+)/.exec(p); return m ? Number(m[1]) : 9999; };

function gruposPlantio() {
  const g = {};
  atividadesVisiveis().forEach(a => plantiosDe(a).forEach(pl => {
    const k = a.local_id + '|' + a.cultura_id + '|' + pl;
    (g[k] = g[k] || { chave: k, local_id: a.local_id, cultura_id: a.cultura_id, plantio: pl, ativs: [] }).ativs.push(a);
  }));
  const hj = hoje();
  return Object.values(g).map(x => {
    x.ativs.sort((a, b) => a.data.localeCompare(b.data) || pesoPrioridade(a) - pesoPrioridade(b));
    const validas = x.ativs.filter(a => a.status !== 'Cancelado');
    x.total = validas.length;
    x.feitas = validas.filter(a => a.status === 'Concluído').length;
    x.atrasadas = validas.filter(a => statusDe(a) === 'Atrasado').length;
    x.pendentes = validas.filter(a => pendente(statusDe(a))).length;
    x.ini = x.ativs[0].data;
    x.fim = x.ativs[x.ativs.length - 1].data;
    x.proxima = validas.find(a => pendente(statusDe(a)) && a.data >= hj) || null;
    x.fazenda_id = fazendaDoLocal(x.local_id);
    return x;
  });
}

TELAS.plantio = el => {
  document.body.classList.add('modo-quadro');
  const f = filtroPlantio;
  el.innerHTML = `
    <h1>Programação por plantio</h1>
    <p class="sub">Cada linha é um plantio com o local e todo o cronograma. Toque no plantio para ver a lista; numa atividade para abrir; numa semana vazia para lançar.</p>
    <details class="pc-maisfiltros" ${window.innerWidth >= 760 ? 'open' : ''}>
    <summary>Filtros</summary>
    <div class="filtros pc-filtros">
      <input type="search" id="pl-busca" placeholder="Buscar plantio ou local (ex.: PL 29)" value="${esc(f.busca)}">
      <select data-f="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-f="cultura">${opcoes(q.ordenado('culturas'), f.cultura, 'Todas as culturas')}</select>
      <select data-f="situacao">${opcoes([
        { id: 'pendentes', nome: 'Com serviço pendente' },
        { id: 'atrasados', nome: 'Com atraso' },
        { id: 'encerrados', nome: 'Encerrados' }], f.situacao, 'Todos os plantios')}</select>
      <label class="pc-cx"><input type="checkbox" id="pl-sem" ${f.semPlantio ? 'checked' : ''}> Locais sem plantio informado</label>
    </div>
    </details>
    <div class="pc-barra-quadro">
      <div class="legenda pc-legenda">${q.ordenado('culturas').map(c =>
      `<span class="lg"><i style="background:${esc(c.cor)}"></i>${esc(c.nome)}</span>`).join('')}</div>
      <div class="pc-zoom" role="group" aria-label="Tamanho do quadro">
        <button type="button" class="btn neutro" data-z="-1" title="Diminuir">A−</button>
        <span id="pl-zv"></span>
        <button type="button" class="btn neutro" data-z="1" title="Ampliar">A+</button>
        <button type="button" class="btn neutro" id="pl-cheia">Tela cheia</button>
      </div>
    </div>
    <div class="rolagem pc-rolagem" id="pl-quadro"></div>`;

  el.querySelectorAll('[data-f]').forEach(s => s.onchange = () => { f[s.dataset.f] = s.value; desenhar(); });
  el.querySelector('#pl-sem').onchange = e => { f.semPlantio = e.target.checked; desenhar(); };
  el.querySelector('#pl-busca').oninput = e => { f.busca = e.target.value; desenhar(); };

  // mesmo tamanho guardado do painel anual
  const quadro = el.querySelector('#pl-quadro');
  const lerZoom = () => { try { return Number(localStorage.getItem('pc.zoom')) || 1.25; } catch (e) { return 1.25; } };
  const aplicarZoom = z => {
    z = Math.min(2.2, Math.max(0.8, Math.round(z * 100) / 100));
    try { localStorage.setItem('pc.zoom', z); } catch (e) { /* sem armazenamento */ }
    quadro.style.setProperty('--z', z);
    el.querySelector('#pl-zv').textContent = Math.round(z * 100) + '%';
    return z;
  };
  let zoom = aplicarZoom(lerZoom());
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zoom = aplicarZoom(zoom + 0.15 * Number(b.dataset.z)); });
  el.querySelector('#pl-cheia').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (quadro.requestFullscreen) quadro.requestFullscreen().catch(() => aviso('Este aparelho não abre em tela cheia.', true));
  };

  function filtrados() {
    const busca = f.busca.trim().toLowerCase();
    const ordLocal = {};
    locaisOrdenados(false).forEach((l, i) => { ordLocal[l.id] = i; });
    return gruposPlantio().filter(x => {
      if (!x.plantio && !f.semPlantio) return false;
      if (f.fazenda && x.fazenda_id !== f.fazenda) return false;
      if (f.cultura && x.cultura_id !== f.cultura) return false;
      if (f.situacao === 'pendentes' && !x.pendentes) return false;
      if (f.situacao === 'atrasados' && !x.atrasadas) return false;
      if (f.situacao === 'encerrados' && x.pendentes) return false;
      if (busca && ![x.plantio, q.nome('locais', x.local_id), q.nome('culturas', x.cultura_id)].join(' ').toLowerCase().includes(busca)) return false;
      return true;
    }).sort((a, b) => (ordLocal[a.local_id] ?? 999) - (ordLocal[b.local_id] ?? 999) ||
      (!a.plantio) - (!b.plantio) || numPlantio(a.plantio) - numPlantio(b.plantio) ||
      a.plantio.localeCompare(b.plantio, 'pt-BR') || q.nome('culturas', a.cultura_id).localeCompare(q.nome('culturas', b.cultura_id), 'pt-BR'));
  }

  function desenhar() {
    const grupos = filtrados();
    if (!grupos.length) {
      quadro.innerHTML = `<div class="vazio"><p>Nenhum plantio com esses filtros.</p>
        <p class="sub">O plantio é o campo "Plantio" do lançamento (ex.: PL 29).</p></div>`;
      return;
    }
    // meses: do primeiro ao último serviço da tela, sempre incluindo o mês atual
    const agora = chaveSemana(hoje());
    const km = (a, m) => a * 12 + m - 1;
    let mi = km(agora.ano, agora.mes), mf = mi;
    grupos.forEach(x => {
      const pi = partes(x.ini), pf = partes(x.fim);
      mi = Math.min(mi, km(pi.ano, pi.mes)); mf = Math.max(mf, km(pf.ano, pf.mes));
    });
    const cols = [];
    for (let k = mi; k <= mf; k++) cols.push({ ano: Math.floor(k / 12), mes: k % 12 + 1 });
    const chaveCol = c => c.ano + '-' + c.mes;
    const viraAno = new Set(cols.map(c => c.ano)).size > 1;
    const colAgora = chaveCol(agora) + '|' + agora.semana;
    const ehAgora = c => chaveCol(c) === chaveCol(agora);

    let html = `<table class="pc-quadro pc-quadro-pl"><thead><tr><th class="pc-loc" rowspan="2">Plantio · local</th>
      ${cols.map(c => `<th colspan="4" class="pc-mes${ehAgora(c) ? ' agora' : ''}${c.mes === 1 && viraAno ? ' pc-vira' : ''}">${MESES[c.mes - 1]}${viraAno ? '/' + String(c.ano).slice(2) : ''}</th>`).join('')}</tr>
      <tr>${cols.map(c => [1, 2, 3, 4].map(s =>
        `<th class="pc-sem${colAgora === chaveCol(c) + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}${s === 1 && c.mes === 1 && viraAno ? ' pc-vira' : ''}">S${s}</th>`).join('')).join('')}</tr></thead><tbody>`;

    let fazAtual;
    grupos.forEach(x => {
      if (x.fazenda_id !== fazAtual) {
        fazAtual = x.fazenda_id;
        html += `<tr class="pc-faz"><th class="pc-loc">${esc(q.nome('fazendas', fazAtual) || 'Sem fazenda')}</th><td colspan="${cols.length * 4}"></td></tr>`;
      }
      const cel = {};
      x.ativs.forEach(a => {
        const p = partes(a.data);
        const k = p.ano + '-' + p.mes + '|' + semanaDe(a.data);
        (cel[k] = cel[k] || []).push(a);
      });
      const cor = corCultura(x.cultura_id);
      html += `<tr><th class="pc-loc pc-pl-cab" data-k="${esc(x.chave)}" style="--cor:${esc(cor)}" title="Ver o cronograma em lista">
        <span class="pc-pl-nome">${x.plantio ? esc(x.plantio) : '<i>Sem plantio</i>'}</span>
        <span class="pc-pl-cult"><i style="background:${esc(cor)}"></i>${esc(q.nome('culturas', x.cultura_id))}</span>
        <small class="pc-pl-local">${esc(q.nome('locais', x.local_id))}</small>
        <span class="pc-barra" title="${x.feitas} de ${x.total} concluídos"><i style="width:${x.total ? Math.round(100 * x.feitas / x.total) : 0}%"></i></span>
        <small class="pc-pl-conta">${x.feitas}/${x.total} concluídos${x.atrasadas ? ` · <b>${x.atrasadas} atrasad${x.atrasadas > 1 ? 'os' : 'o'}</b>` : ''}</small></th>`;
      cols.forEach(c => [1, 2, 3, 4].forEach(s => {
        const lista = (cel[chaveCol(c) + '|' + s] || []).sort((a, b) => a.data.localeCompare(b.data) || pesoPrioridade(a) - pesoPrioridade(b));
        html += `<td class="pc-cel${colAgora === chaveCol(c) + '|' + s ? ' agora' : ''}${s === 1 ? ' ini' : ''}${s === 1 && c.mes === 1 && viraAno ? ' pc-vira' : ''}"
          data-k="${esc(x.chave)}" data-ano="${c.ano}" data-mes="${c.mes}" data-sem="${s}">${lista.map(a => `
          <div class="pc-etq ${STATUS_CLASSE[statusDe(a)]}${a.prioridade ? ' pri-' + a.prioridade : ''}" draggable="true" data-id="${a.id}"
            style="--cor:${esc(cor)}"
            title="${esc(br(a.data) + ' · ' + nomeAtividade(a) + (a.prioridade ? ' · ' + nomePrioridade(a.prioridade) : '') + ' · ' + statusDe(a) + (a.operador_id ? ' · ' + q.nome('operadores', a.operador_id) : ''))}">
            <b>${partes(a.data).dia}</b> ${esc(nomeAtividade(a))}</div>`).join('')}</td>`;
      }));
      html += '</tr>';
    });
    html += '</tbody></table>';
    quadro.innerHTML = html;

    // abre com o mês atual logo depois da coluna dos plantios
    const iAgora = cols.findIndex(ehAgora);
    if (iAgora > 0) {
      const ths = quadro.querySelectorAll('thead tr:nth-child(2) th');
      const ini = ths[iAgora * 4];
      const loc = quadro.querySelector('thead th.pc-loc');
      if (ini && loc) quadro.scrollLeft = Math.max(0, ini.offsetLeft - loc.getBoundingClientRect().width - 4);
    }

    const porChave = k => grupos.find(g => g.chave === k);
    quadro.querySelectorAll('.pc-pl-cab').forEach(th => th.onclick = () => listaPlantio(porChave(th.dataset.k), desenhar));
    quadro.querySelectorAll('.pc-etq').forEach(e => {
      e.onclick = ev => { ev.stopPropagation(); abrirAtividade(e.dataset.id, desenhar); };
      e.ondragstart = ev => { ev.dataTransfer.setData('text/plain', e.dataset.id); e.classList.add('arrastando'); };
      e.ondragend = () => e.classList.remove('arrastando');
    });
    quadro.querySelectorAll('.pc-cel').forEach(td => {
      const an = Number(td.dataset.ano), m = Number(td.dataset.mes), s = Number(td.dataset.sem);
      td.onclick = () => {
        const x = porChave(td.dataset.k);
        if (!x) return;
        const sem = { ano: an, mes: m, semana: s };
        window.baseLancamento = { local_id: x.local_id, cultura_id: x.cultura_id, plantio: x.plantio,
          data: mesmaSemana(hoje(), sem) ? hoje() : inicioSemana(an, m, s) };
        irPara('lancar');
      };
      td.ondragover = ev => { ev.preventDefault(); td.classList.add('alvo'); };
      td.ondragleave = () => td.classList.remove('alvo');
      td.ondrop = async ev => {
        ev.preventDefault(); td.classList.remove('alvo');
        const a = q.por_id('atividades', ev.dataTransfer.getData('text/plain'));
        if (!a) return;
        const x = porChave(td.dataset.k);
        if (!x || !x.ativs.includes(a)) return aviso('Arraste só dentro da linha do mesmo plantio.', true);
        if (mesmaSemana(a.data, { ano: an, mes: m, semana: s })) return;
        const desloc = (partes(a.data).dia - 1) % 7;
        let dia = (s - 1) * 7 + 1 + desloc;
        const fim = partes(fimSemana(an, m, s)).dia;
        if (dia > fim) dia = fim;
        const ok = await reprogramar(a, montaData(an, m, dia));
        if (ok) desenhar();
      };
    });
  }
  desenhar();
};

/* Cronograma do plantio em lista (toque no nome do plantio) */
function listaPlantio(x, depois) {
  if (!x) return;
  const titulo = (x.plantio || 'Sem plantio') + ' · ' + q.nome('locais', x.local_id);
  abrirModal(titulo, `
    <p class="sub">${esc(q.nome('culturas', x.cultura_id))} · ${br(x.ini)} a ${br(x.fim)} · ${x.feitas} de ${x.total} concluídos${x.atrasadas ? ` · ${x.atrasadas} atrasado${x.atrasadas > 1 ? 's' : ''}` : ''}</p>
    <div class="rolagem"><table class="tabela pc-pl-tab">
      <thead><tr><th>Data</th><th>Sem.</th><th>Tarefa</th><th>Operador</th><th>Máquina / implemento</th><th>Status</th></tr></thead>
      <tbody>${x.ativs.map(a => `
        <tr data-id="${a.id}" class="${STATUS_CLASSE[statusDe(a)]}">
          <td class="pc-nw">${br(a.data)} <small>${esc(diaSemana(a.data))}</small></td>
          <td class="pc-nw">S${semanaDe(a.data)}/${MESES_CURTOS[partes(a.data).mes - 1]}</td>
          <td><b>${esc(nomeAtividade(a))}</b> ${etqPrioridade(a, true)}</td>
          <td>${esc(q.nome('operadores', a.operador_id) || '— a definir —')}</td>
          <td>${esc(maqImpl(a) || '')}</td>
          <td>${etqStatus(a)}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    <div class="acoes"><button type="button" class="btn" id="lp-novo">Lançar ${x.plantio ? 'neste plantio' : 'neste local'}</button></div>`, corpo => {
    corpo.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { fecharModal(); abrirAtividade(tr.dataset.id, depois); });
    corpo.querySelector('#lp-novo').onclick = () => {
      fecharModal();
      window.baseLancamento = { local_id: x.local_id, cultura_id: x.cultura_id, plantio: x.plantio, data: hoje() };
      irPara('lancar');
    };
  });
}
