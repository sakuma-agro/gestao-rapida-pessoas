/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — VENCIMENTOS no desenho da planilha
   (09/10/2026, pedido dele: "painel completo, estilo o da planilha")

   Volta o quadro da "NOVO Controle_Troca_Oleo", que é como o Guilherme lê a
   frota há anos — uma linha por máquina e, para cada item de manutenção, o
   bloco ÚLTIMA TROCA (data, hora) e PRÓXIMA TROCA (hora, quanto falta, data,
   status) —, com os cartões do painel no alto. Três jeitos de ver:
     Planilha     — os blocos de seis colunas, rolando para o lado
     Consolidado  — uma célula por item, a frota inteira numa tela
     Lista        — uma linha por item vencido, com Abrir OS na linha
   Na planilha e no consolidado, tocar no item marca para a OS; "Gerar OS"
   abre uma preventiva por máquina com os itens marcados dela.

   Este arquivo carrega depois do ordens.js e troca a tela de vencimentos de
   lá; o resto (abrirOSPreventiva, abrirOS, filtroVenc) continua vindo de lá.
   ===================================================================== */

let modoVenc = (() => { try { return localStorage.getItem('gr.manut.modoVenc') || 'planilha'; } catch (e) { return 'planilha'; } })();
let letraVenc = '';
const marcadosVenc = new Set();

/* A letra do código é a família do bem: T trator, F vaso de pressão,
   P pulverizador/pivô, V veículo. Sai do próprio código cadastrado. */
function letraDe(e) {
  const m = String(e && e.codigo || '').trim().match(/^[A-Za-zÀ-ÿ]+/);
  return m ? m[0].toUpperCase() : '';
}
function letrasDaFrota() {
  const conta = new Map();
  q.ativos('equipamentos').filter(noGrupo).forEach(e => { const l = letraDe(e); if (l) conta.set(l, (conta.get(l) || 0) + 1); });
  return [...conta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

/* Número no formato contábil da planilha: negativo entre parênteses. */
function nContabil(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return n < 0 ? '(' + nHoras(Math.abs(n)) + ')' : nHoras(n);
}

/* O que falta, dito do jeito que o mecânico fala. */
function quantoFalta(p, c, u) {
  if (c.horas_restantes != null) {
    return c.horas_restantes < 0 ? 'passou ' + nHoras(-c.horas_restantes) + ' ' + u
                                 : 'faltam ' + nHoras(c.horas_restantes) + ' ' + u;
  }
  if (c.dias != null && p.periodicidade_dias != null) {
    const d = Number(p.periodicidade_dias) - c.dias;
    return d < 0 ? 'passou ' + (-d) + (d === -1 ? ' dia' : ' dias') : 'faltam ' + d + (d === 1 ? ' dia' : ' dias');
  }
  return 'sem última troca';
}

const CURTO_V = { VENCIDO: 'VENCIDO', ATENCAO: 'ATENÇÃO', OK: 'EM DIA', SEM_DADO: '—' };

TELAS.vencimentos = el => {
  const todos = q.ativos('planos_manutencao')
    .map(p => ({ p, c: calcular(p) }))
    .filter(x => x.c.equipamento && x.c.equipamento.ativo !== false
      && !['VENDIDO', 'BAIXADO'].includes(x.c.equipamento.status) && noGrupo(x.c.equipamento));
  const abertas = q.todos('ordens_servico').filter(o => ABERTAS.includes(o.status) && noGrupoId(o.equipamento_id)).length;

  el.innerHTML = `
    <div class="pn-cabeca">
      <div><h1>Vencimentos${grupoAtual ? ' · ' + esc(nomeGrupo(grupoAtual)) : ''}</h1>
        <p class="sub">Toda a frota no desenho da planilha. Toque nos itens para marcar e gere a OS de uma vez.</p></div>
    </div>
    <div class="pn-cards" id="vc-cards"></div>
    <div class="filtros">
      <input type="search" id="vc-busca" placeholder="Buscar máquina" value="${esc(filtroVenc.busca)}">
      <select id="vc-sit">
        <option value="pendentes">Vencidos e perto de vencer</option>
        <option value="VENCIDO">Só vencidos</option>
        <option value="ATENCAO">Só perto de vencer</option>
        <option value="SEM_DADO">Sem última troca</option>
        <option value="todos">Todas as situações</option>
      </select>
      ${seletorGrupo('vc-grupo')}
      <select id="vc-letra"><option value="">Toda a frota (T, F, P, V…)</option>
        ${letrasDaFrota().map(([l, n]) => `<option value="${esc(l)}">${esc(l)} — ${n} ${n === 1 ? 'bem' : 'bens'}</option>`).join('')}</select>
      <select id="vc-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
      <select id="vc-item"><option value="">Todos os itens</option>
        ${q.ordenado('tipos_manutencao', 'ordem').map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>
      <select id="vc-modo" aria-label="Jeito de ver">
        <option value="planilha">Planilha — última e próxima troca</option>
        <option value="quadro">Consolidado — tudo numa tela</option>
        <option value="lista">Lista — um item por linha</option>
      </select>
    </div>
    <div class="acoes pv-acoes oculto" id="vc-acoes">
      <button type="button" class="btn" id="vc-gerar">Gerar OS</button>
      <button type="button" class="btn neutro" id="vc-limpar">Limpar marcação</button>
    </div>
    <div id="vc-lista"></div>`;

  $('#vc-sit').value = filtroVenc.sit || 'pendentes';
  $('#vc-local').value = filtroVenc.local || '';
  $('#vc-item').value = filtroVenc.item || '';
  $('#vc-letra').value = letraVenc;
  $('#vc-modo').value = modoVenc;

  const desenhar = () => {
    filtroVenc = { busca: $('#vc-busca').value, sit: $('#vc-sit').value, local: $('#vc-local').value, item: $('#vc-item').value };
    letraVenc = $('#vc-letra').value;
    modoVenc = $('#vc-modo').value;
    try { localStorage.setItem('gr.manut.modoVenc', modoVenc); } catch (e) {}
    const b = filtroVenc.busca.toLowerCase();

    // Os cartões contam o recorte da frota (fazenda e letra), não a busca.
    const recorte = todos.filter(({ c }) => (!filtroVenc.local || c.equipamento.local_id === filtroVenc.local)
      && (!letraVenc || letraDe(c.equipamento) === letraVenc));
    const conta = s => recorte.filter(x => x.c.status === s).length;
    const cartao = (cls, rot, n, dica, sit) => `<button type="button" class="pn-card ${cls}${n ? '' : ' pn-zero'}${filtroVenc.sit === sit ? ' pn-ativo' : ''}" data-sit="${sit}">
      <span>${esc(rot)}</span><strong>${n}</strong><small>${n ? esc(dica) : 'nada aqui'}</small></button>`;
    $('#vc-cards').innerHTML =
      cartao('pn-vencido', 'Vencidos', conta('VENCIDO'), 'passaram da hora ou da data', 'VENCIDO') +
      cartao('pn-atencao', 'Perto de vencer', conta('ATENCAO'), 'dentro da margem de segurança', 'ATENCAO') +
      `<button type="button" class="pn-card pn-osc${abertas ? '' : ' pn-zero'}" data-os="1"><span>OS abertas</span><strong>${abertas}</strong><small>${abertas ? 'na oficina agora' : 'nada aqui'}</small></button>` +
      cartao('pn-ck', 'Sem última troca', conta('SEM_DADO'), 'lance a última troca na máquina', 'SEM_DADO') +
      cartao('pn-ok', 'Em dia', conta('OK'), 'dentro do prazo', 'todos');
    $$('#vc-cards [data-sit]').forEach(x => x.onclick = () => { $('#vc-sit').value = x.dataset.sit; desenhar(); });
    const bOS = $('#vc-cards [data-os]'); if (bOS) bOS.onclick = () => { filtroOS.aba = 'abertas'; irPara('ordens'); };

    const passa = ({ p, c }) => {
      const e = c.equipamento;
      if (filtroVenc.local && e.local_id !== filtroVenc.local) return false;
      if (letraVenc && letraDe(e) !== letraVenc) return false;
      if (b && !(e.codigo + ' ' + e.descricao).toLowerCase().includes(b)) return false;
      return true;
    };
    const statusOk = c => filtroVenc.sit === 'todos' ? true
      : filtroVenc.sit === 'pendentes' ? ['VENCIDO', 'ATENCAO'].includes(c.status)
      : c.status === filtroVenc.sit;

    document.body.classList.toggle('modo-quadro', modoVenc !== 'lista');

    if (modoVenc === 'lista') {
      const lista = todos.filter(x => passa(x) && statusOk(x.c) && (!filtroVenc.item || x.p.tipo_manutencao_id === filtroVenc.item));
      $('#vc-lista').innerHTML = listaVenc(lista);
    } else {
      // agrupa por máquina; a máquina entra se algum item dela passa no filtro de situação
      const porMaq = new Map();
      for (const x of todos) {
        if (!passa(x)) continue;
        const id = x.c.equipamento.id;
        if (!porMaq.has(id)) porMaq.set(id, { e: x.c.equipamento, itens: {} });
        porMaq.get(id).itens[x.p.tipo_manutencao_id] = x;
      }
      const usados = new Set(todos.map(x => x.p.tipo_manutencao_id));
      const colunas = q.ordenado('tipos_manutencao', 'ordem')
        .filter(t => usados.has(t.id) && (!filtroVenc.item || t.id === filtroVenc.item))
        .sort((a, b) => (a.ordem == null ? 9e9 : Number(a.ordem)) - (b.ordem == null ? 9e9 : Number(b.ordem))
          || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      const linhas = [...porMaq.values()]
        .filter(m => Object.values(m.itens).some(x => statusOk(x.c) && (!filtroVenc.item || x.p.tipo_manutencao_id === filtroVenc.item)))
        .sort((a, b) => a.e.codigo.localeCompare(b.e.codigo, 'pt-BR', { numeric: true }));
      $('#vc-lista').innerHTML = !linhas.length ? '<div class="vazio"><p>Nada com esses filtros.</p></div>'
        : modoVenc === 'quadro' ? quadroVenc(linhas, colunas) : planilhaVenc(linhas, colunas);
      ajustarAlturaVenc();
    }

    // marcar para a OS (planilha e consolidado)
    $$('#vc-lista [data-plano]').forEach(c => {
      const alterna = () => {
        const id = c.dataset.plano, ligar = !marcadosVenc.has(id);
        ligar ? marcadosVenc.add(id) : marcadosVenc.delete(id);
        $$('#vc-lista [data-plano="' + CSS.escape(id) + '"]').forEach(a => a.classList.toggle('marcada', ligar));
        barraVenc();
      };
      c.onclick = alterna;
      c.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alterna(); } };
    });
    // lista: botões da linha
    $$('#vc-lista [data-abrir]').forEach(x => x.onclick = () => abrirOSPreventiva(x.dataset.abrir));
    $$('#vc-lista [data-os]').forEach(x => x.onclick = () => abrirOS(x.dataset.os));
    $$('#vc-lista [data-maq]').forEach(x => x.onclick = () => fichaMaquina(x.dataset.maq));
    barraVenc();
  };

  ['vc-busca', 'vc-sit', 'vc-local', 'vc-item', 'vc-letra', 'vc-modo'].forEach(id => {
    const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar;
  });
  ligarSeletorGrupo('vc-grupo');
  $('#vc-limpar').onclick = () => { marcadosVenc.clear(); desenhar(); };
  $('#vc-gerar').onclick = gerarOSMarcadas;
  desenhar();
};

function barraVenc() {
  const n = marcadosVenc.size;
  const barra = $('#vc-acoes'), bt = $('#vc-gerar');
  if (!barra) return;
  barra.classList.toggle('oculto', n === 0);
  const maqs = new Set([...marcadosVenc].map(id => (q.por_id('planos_manutencao', id) || {}).equipamento_id));
  bt.textContent = `Gerar OS de ${n} ${n === 1 ? 'item marcado' : 'itens marcados'}` +
    (maqs.size > 1 ? ` (${maqs.size} máquinas)` : '');
}

/* Uma preventiva por máquina: os itens marcados da mesma máquina entram juntos,
   e se ela já tem uma preventiva aberta, entram nela. */
async function gerarOSMarcadas() {
  const ids = [...marcadosVenc];
  if (!ids.length) return;
  const bt = $('#vc-gerar'); bt.disabled = true; bt.textContent = 'Gerando…';
  let ultima = null;
  const maqs = new Set();
  for (const id of ids) {
    const p = q.por_id('planos_manutencao', id);
    if (!p) continue;
    if (osAbertaDoPlano(p)) continue;      // já está numa OS aberta
    ultima = await abrirOSPreventiva(id, { silencioso: true });
    maqs.add(p.equipamento_id);
  }
  marcadosVenc.clear();
  bt.disabled = false;
  aviso(maqs.size ? `OS preventiva gerada para ${maqs.size} ${maqs.size === 1 ? 'máquina' : 'máquinas'}.`
                  : 'Os itens marcados já estavam em OS aberta.');
  irPara('vencimentos');
  if (ultima && maqs.size === 1) abrirOS(ultima.id);
}

/* ------------------------------------------------------------- planilha */
function planilhaVenc(linhas, colunas) {
  const cabTipo = colunas.map(t => `<th class="bl-tipo" colspan="6">${esc(t.nome)}</th>`).join('');
  const cabGrupo = colunas.map(() => `<th class="bl-ult" colspan="2">ÚLTIMA TROCA</th><th class="bl-prox" colspan="4">PRÓXIMA TROCA</th>`).join('');
  const cabCampo = colunas.map(() => `<th class="bl-ult">DATA ÚLTIMA</th><th class="bl-ult num">HR ÚLTIMA</th>
     <th class="num">HR DA PRÓXIMA</th><th class="num">HR PARA TROCAR</th><th>DATA DA PRÓXIMA</th><th>STATUS</th>`).join('');
  return `<p class="sub vc-conta">${linhas.length} ${linhas.length === 1 ? 'máquina' : 'máquinas e implementos'} ·
      role para o lado para ver os outros itens · toque no bloco para marcar para a OS</p>
    <div class="rolagem"><table class="tabela pl"><thead>
      <tr><th class="col-cod" rowspan="3">COD</th><th class="col-maq" rowspan="3">DESCRIÇÃO</th>
          <th class="num agora" rowspan="3">AGORA</th>${cabTipo}</tr>
      <tr>${cabGrupo}</tr>
      <tr class="campos">${cabCampo}</tr>
    </thead><tbody>` + linhas.map(m => {
      const e = m.e, u = unidadeDe(e);
      return `<tr>
        <td class="col-cod codigo">${esc(e.codigo)}</td>
        <td class="col-maq">${esc(e.descricao)}<small>${esc(q.nome('locais', e.local_id))}</small></td>
        <td class="num agora">${leituraDe(e) == null ? '—' : nHoras(leituraDe(e))}<small>${u}</small></td>
        ${colunas.map(t => {
          const x = m.itens[t.id];
          if (!x) return '<td class="pl-vazia" colspan="6">—</td>';
          const c = x.c, p = x.p;
          const [cls] = ETIQUETA[c.status] || ETIQUETA.SEM_DADO;
          const os = osAbertaDoPlano(p);
          const marca = marcadosVenc.has(p.id) ? ' marcada' : '';
          const dado = os ? `title="Já está na OS ${esc(numeroOS(os))}"` : `data-plano="${esc(p.id)}" tabindex="0" role="button" title="${esc(t.nome)} · ${esc(c.motivo)}"`;
          return `
            <td class="pl-ult${marca}" ${dado}>${p.ultima_troca_data ? formatarData(p.ultima_troca_data) : '—'}</td>
            <td class="pl-ult num${marca}" ${dado}>${nHoras(p.ultima_troca_leitura)}</td>
            <td class="num${marca}" ${dado}>${c.proximo_hr == null ? '—' : nHoras(c.proximo_hr)}</td>
            <td class="num falta${c.horas_restantes != null && c.horas_restantes < 0 ? ' neg' : ''}${marca}" ${dado}>${nContabil(c.horas_restantes)}</td>
            <td class="num${marca}" ${dado}>${c.proxima_data ? formatarData(c.proxima_data) : '—'}</td>
            <td class="pl-status st-${cls}${marca}" ${dado}>${os ? 'NA OS' : CURTO_V[c.status]}</td>`;
        }).join('')}
      </tr>`;
    }).join('') + '</tbody></table></div>';
}

/* ------------------------------------------------------------- consolidado */
function quadroVenc(linhas, colunas) {
  return `<div class="legenda">
      <span class="lg st-urgente">vencido</span><span class="lg st-atencao">perto de vencer</span>
      <span class="lg st-ok">em dia</span><span class="lg st-neutro">sem última troca</span>
      <span class="lg-pe">a marca em destaque é a próxima troca · toque para marcar</span>
    </div>
    <div class="rolagem"><table class="tabela quadro"><thead><tr>
      <th class="col-cod">Código</th><th class="col-maq">Máquina / equipamento</th><th class="num">Agora</th>
      ${colunas.map(t => `<th>${esc(t.nome)}</th>`).join('')}
    </tr></thead><tbody>` + linhas.map(m => {
      const e = m.e, u = unidadeDe(e);
      return `<tr>
        <td class="col-cod codigo">${esc(e.codigo)}</td>
        <td class="col-maq">${esc(e.descricao)}<small>${esc(q.nome('locais', e.local_id))}</small></td>
        <td class="num agora">${leituraDe(e) == null ? '—' : nHoras(leituraDe(e))}<small>${u}</small></td>
        ${colunas.map(t => {
          const x = m.itens[t.id];
          if (!x) return '<td class="cel vazia">—</td>';
          const c = x.c, p = x.p;
          const [cls] = ETIQUETA[c.status] || ETIQUETA.SEM_DADO;
          const os = osAbertaDoPlano(p);
          return `<td class="cel st-${cls}${marcadosVenc.has(p.id) ? ' marcada' : ''}" ${os ? '' : `data-plano="${esc(p.id)}" tabindex="0" role="button"`}
                      title="${esc(t.nome)} · ${esc(c.motivo)}${os ? ' · na OS ' + esc(numeroOS(os)) : ''}">
            <strong>${esc(proximaTroca(c))}</strong>
            <span>${os ? 'NA OS ' + esc(numeroOS(os)) : CURTO_V[c.status] + ' · ' + esc(quantoFalta(p, c, u))}</span>
          </td>`;
        }).join('')}
      </tr>`;
    }).join('') + '</tbody></table></div>';
}

/* ------------------------------------------------------------- lista */
function listaVenc(lista) {
  const peso = { VENCIDO: 0, ATENCAO: 1, SEM_DADO: 2, OK: 3 };
  lista.sort((x, y) => (peso[x.c.status] - peso[y.c.status]) || porCodigo(x.c.equipamento, y.c.equipamento));
  return !lista.length ? '<div class="vazio"><p>Nada com esses filtros.</p></div>'
    : `<table class="tabela vc-tabela"><thead><tr>
        <th>Máquina</th><th>Item</th><th>O que usa</th><th>Situação</th><th>Próxima</th><th></th>
      </tr></thead><tbody>` + lista.map(({ p, c }) => {
        const e = c.equipamento, os = osAbertaDoPlano(p);
        return `<tr class="st-${c.status.toLowerCase()}">
          <td><span class="codigo">${esc(e.codigo)}</span><small>${esc(e.descricao)}</small></td>
          <td><strong>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</strong><small>a cada ${esc(periodicidadeTexto(p, e))}</small></td>
          <td class="fm-usa">${p.materiais ? esc(p.materiais) : '<span class="falta">não informado</span>'}</td>
          <td>${etq(c.status)}<small>${esc(c.motivo)}</small></td>
          <td>${proximaTroca(c)}</td>
          <td class="vc-acao">${os
            ? `<button type="button" class="btn neutro" data-os="${esc(os.id)}">OS ${esc(numeroOS(os))}</button>`
            : c.status === 'SEM_DADO'
              ? `<button type="button" class="btn-fantasma" data-maq="${esc(e.id)}">Lançar última troca</button>`
              : `<button type="button" class="btn" data-abrir="${esc(p.id)}">Abrir OS</button>`}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
}

/* As colunas de identificação ficam grudadas à esquerda e a frota rola dentro
   do quadro, que ocupa o que sobra da tela. */
function ajustarAlturaVenc() {
  const t = document.querySelector('#vc-lista table.pl');
  const tr = t && t.tBodies[0] && t.tBodies[0].rows[0];
  if (tr && tr.cells.length >= 3) {
    const l1 = tr.cells[0].offsetWidth;
    t.style.setProperty('--l1', l1 + 'px');
    t.style.setProperty('--l2', (l1 + tr.cells[1].offsetWidth) + 'px');
  }
  const cx = document.querySelector('#vc-lista .rolagem');
  if (cx) cx.style.maxHeight = Math.max(260, window.innerHeight - cx.getBoundingClientRect().top - 12) + 'px';
}
window.addEventListener('resize', () => { if (document.querySelector('#vc-lista')) ajustarAlturaVenc(); });

/* Saindo da tela de vencimentos, a largura volta ao normal. */
const irParaOriginalVenc = window.irPara;
window.irPara = nome => { if (nome !== 'vencimentos') document.body.classList.remove('modo-quadro'); return irParaOriginalVenc(nome); };
const marcaOriginalVenc = TELAS.marca;
TELAS.marca = el => { document.body.classList.remove('modo-quadro'); return marcaOriginalVenc(el); };
