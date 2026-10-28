/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — PREVENTIVAS (21/10/2026)

   Pedido do Guilherme: o painel e a planilha estavam pesados de ler. Ele quer
   ver o que está pendente e o que já foi resolvido: "precisa trocar o óleo do
   motor, assim que abrir a OS fica como pendente, ou fechado".

   Esta tela substitui o antigo Painel (mesmo id 'painel', para atalhos e
   links continuarem valendo). Cada linha é uma troca e ela anda sozinha:
     A fazer       → vencido ou perto de vencer, ainda sem OS  (Abrir OS)
     Em andamento  → OS preventiva aberta                      (Fechar OS)
     Feitas no mês → OS fechada, troca registrada
   e, à parte, "Falta cadastrar": item sem última troca ou sem horímetro,
   para não inflar a contagem de vencidos.

   Cores só onde precisa agir: vermelho = vencido sem OS, amarelo = perto,
   azul = com OS aberta (já está sendo tratado), verde = feito.
   A planilha completa continua na tela Vencimentos, que no menu virou
   "Planilha".
   ===================================================================== */

let abaPrev = 'fazer';
let filtroPrev = { busca: '', item: '', local: '' };
const OS_ATRASADA_DIAS = 15;
const HORIMETRO_VELHO_DIAS = 7;  // leitura mais antiga que isso: o "faltam X h" pode estar errado

/* Dias desde a última leitura do mostrador (só máquina com horímetro/hodômetro;
   implemento soma pelo uso do trator e não entra aqui). */
function idadeLeitura(e) {
  if (!e || !['HORIMETRO', 'HODOMETRO'].includes(e.unidade_controle)) return null;
  return e.leitura_data ? Math.max(0, diasEntre(String(e.leitura_data).slice(0, 10), hoje())) : Infinity;
}
function txtIdade(d) {
  if (d == null) return '';
  if (d === Infinity) return 'nunca lançado';
  return d === 0 ? 'lido hoje' : d === 1 ? 'lido ontem' : 'lido há ' + d + ' dias';
}   // OS aberta há mais que isso fica com os dias em vermelho

function planosDaFrota() {
  return q.ativos('planos_manutencao')
    .map(p => ({ p, c: calcular(p) }))
    .filter(x => x.c.equipamento && x.c.equipamento.ativo !== false
      && !['VENDIDO', 'BAIXADO'].includes(x.c.equipamento.status) && noGrupo(x.c.equipamento));
}

/* Quanto do intervalo já foi usado, de 0 a 100 — vale o que estiver mais perto. */
function usoDoIntervalo(p, c) {
  if (c.status === 'VENCIDO') return 100;
  let u = 0;
  if (c.horas_restantes != null && Number(p.periodicidade_horas) > 0)
    u = Math.max(u, 1 - c.horas_restantes / Number(p.periodicidade_horas));
  if (c.dias != null && Number(p.periodicidade_dias) > 0)
    u = Math.max(u, c.dias / Number(p.periodicidade_dias));
  return Math.round(Math.min(1, Math.max(0, u)) * 100);
}

const dataCurta = d => d ? formatarData(d).slice(0, 5) : '';
const maiuscula = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function textoSituacao(c) {
  let t = maiuscula(c.motivo);
  if (c.proxima_data) t += (c.status === 'VENCIDO' ? ' · venceu ' : ' · até ') + dataCurta(c.proxima_data);
  return t;
}

/* "última: 21/04/2026 · 4.195 h" embaixo do item (21/10/2026) */
function ultimaTxt(p, e) {
  const partes = [];
  if (p.ultima_troca_data) partes.push(formatarData(p.ultima_troca_data));
  if (p.ultima_troca_leitura != null) partes.push(nHoras(p.ultima_troca_leitura) + ' ' + unidadeDe(e));
  return partes.length ? '<small class="pv-ult">última: ' + esc(partes.join(' · ')) + '</small>' : '';
}

TELAS.painel = el => {
  document.body.classList.remove('modo-quadro');
  /* Uma OS por máquina (28/10/2026): se apareceu OS duplicada (dois aparelhos
     sem internet), junta na mais antiga e redesenha. */
  if (typeof juntarOSDuplicadas === 'function' && temOSDuplicada()) {
    juntarOSDuplicadas().then(n => { if (n) aviso(n + ' OS duplicada(s) juntada(s) na OS mais antiga da máquina.'); TELAS.painel(el); });
    return;
  }
  const planos = planosDaFrota();
  const mes = hoje().slice(0, 7);

  // Em andamento: uma linha por OS preventiva aberta (a OS pode ter vários itens)
  const osAbertas = q.todos('ordens_servico')
    .filter(o => o.tipo !== 'CORRETIVA' && ABERTAS.includes(o.status) && noGrupoId(o.equipamento_id))
    .sort((a, b) => String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')));
  // A fazer: precisa de troca e ninguém abriu OS ainda
  const fazer = planos.filter(x => ['VENCIDO', 'ATENCAO'].includes(x.c.status) && !osAbertaDoPlano(x.p))
    .sort((a, b) => (a.c.status === b.c.status
      ? (a.c.horas_restantes ?? 9e9) - (b.c.horas_restantes ?? 9e9) || porCodigo(a.c.equipamento, b.c.equipamento)
      : a.c.status === 'VENCIDO' ? -1 : 1));
  const semDado = planos.filter(x => x.c.status === 'SEM_DADO' && !osAbertaDoPlano(x.p));
  // Feitas no mês: cada troca registrada neste mês
  const feitas = q.todos('manutencoes')
    .filter(m => String(m.data_manutencao || '').slice(0, 7) === mes && noGrupoId(m.equipamento_id)
      && q.por_id('equipamentos', m.equipamento_id))
    .sort((a, b) => String(b.data_manutencao).localeCompare(String(a.data_manutencao)));
  // Máquinas cujo vencimento depende de horas e o mostrador está velho
  const velhas = [...new Map(planos
    .filter(x => x.p.periodicidade_horas != null && idadeLeitura(x.c.equipamento) >= HORIMETRO_VELHO_DIAS)
    .map(x => [x.c.equipamento.id, x.c.equipamento])).values()]
    .sort((a, b) => idadeLeitura(b) - idadeLeitura(a) || porCodigo(a, b));
  const ckAtraso = (typeof agendaChecklists === 'function' ? agendaChecklists() : [])
    .filter(a => a.status === 'atrasado' || a.status === 'nunca').length;

  const aba = (id, cls, n, rot, dica) => `
    <button type="button" class="pv-aba ${cls}${abaPrev === id ? ' ativa' : ''}" data-aba="${id}">
      <strong>${n}</strong><span><b>${rot}</b><small>${dica}</small></span></button>`;

  el.innerHTML = `
    <div class="pn-cabeca">
      <div><h1>Preventivas${grupoAtual ? ' · ' + esc(nomeGrupo(grupoAtual)) : ''}</h1>
        <p class="sub">Cada linha é uma troca: <b>A fazer</b> → abriu a OS → <b>Em andamento</b> → fechou a OS → <b>Feita</b>.</p></div>
      <span class="pv-cab-acoes"><button type="button" class="btn oculto" id="pv-hm">+ Hora máquina</button>
      ${ehAdmin() ? '<button type="button" class="btn neutro" id="pv-importar" title="Anexar o relatório da Realtec e atualizar os horímetros">⬆ Importar horímetros</button>' : ''}
      <button type="button" class="btn neutro" id="pv-levant" title="Folha para o responsável escrever a última troca de cada serviço">🖨 Levantamento da última troca</button>
      <button type="button" class="btn neutro" id="pv-atualizar">Atualizar</button></span>
    </div>
    <div class="pv-abas">
      ${aba('fazer', 'pv-a-fazer', fazer.length, 'A fazer', 'vencido ou perto, sem OS · clique para abrir uma OS')}
      ${aba('andamento', 'pv-a-and', osAbertas.length, 'Em andamento', 'com OS aberta · registrar troca')}
      ${aba('feitas', 'pv-a-feita', feitas.length, 'Feitas no mês', 'OS fechada, troca registrada')}
      ${aba('semdado', 'pv-a-sem', semDado.length, 'Falta cadastrar', 'sem última troca ou horímetro')}
    </div>
    ${velhas.length ? `<p class="pv-ck"><button type="button" class="pv-hor" id="pv-hor">⏱ ${velhas.length} máquina(s) com horímetro sem leitura há mais de ${HORIMETRO_VELHO_DIAS} dias — o "faltam X h" delas pode estar errado. Lançar →</button></p>` : ''}
    ${ckAtraso ? `<p class="pv-ck"><button type="button" class="btn-fantasma" id="pv-ck">${ckAtraso} máquina(s) com check list atrasado →</button></p>` : ''}
    <div class="filtros">
      <input type="search" id="pv-busca" placeholder="Buscar máquina ou item" value="${esc(filtroPrev.busca)}">
      <select id="pv-item"><option value="">Todos os itens</option>
        ${q.ordenado('tipos_manutencao', 'ordem').map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>
      <select id="pv-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
    </div>
    <div id="pv-lista"></div>`;

  $('#pv-item').value = filtroPrev.item;
  $('#pv-local').value = filtroPrev.local;

  const desenhar = () => {
    filtroPrev = { busca: $('#pv-busca').value, item: $('#pv-item').value, local: $('#pv-local').value };
    const b = filtroPrev.busca.toLowerCase();
    const casa = (e, nomeItem) => (!filtroPrev.local || (e && e.local_id === filtroPrev.local))
      && (!b || ((e ? e.codigo + ' ' + e.descricao : '') + ' ' + nomeItem).toLowerCase().includes(b));
    const nomeTipo = id => q.nome('tipos_manutencao', id);
    /* 21/10/2026: os números das abas seguem os filtros (fazenda, item, busca).
       Antes contavam a frota toda e, filtrando uma fazenda, a lista vinha em
       branco com "118" no alto. */
    const passaPlano = ({ p, c }) => (!filtroPrev.item || p.tipo_manutencao_id === filtroPrev.item) && casa(c.equipamento, nomeTipo(p.tipo_manutencao_id));
    const F = {
      fazer: fazer.filter(passaPlano),
      semdado: semDado.filter(passaPlano),
      andamento: osAbertas.filter(o => (!filtroPrev.item || itensDaOS(o.id).some(i => i.tipo_manutencao_id === filtroPrev.item))
        && casa(q.por_id('equipamentos', o.equipamento_id), resumoOS(o))),
      feitas: feitas.filter(m => (!filtroPrev.item || m.tipo_manutencao_id === filtroPrev.item)
        && casa(q.por_id('equipamentos', m.equipamento_id), nomeTipo(m.tipo_manutencao_id))),
    };
    Object.keys(F).forEach(k => { const n = document.querySelector(`.pv-aba[data-aba="${k}"] strong`); if (n) n.textContent = F[k].length; });
    const filtrando = !!(filtroPrev.local || filtroPrev.item || b);
    const recorte = [filtroPrev.local && q.nome('locais', filtroPrev.local), filtroPrev.item && nomeTipo(filtroPrev.item), b && '"' + filtroPrev.busca + '"']
      .filter(Boolean).join(' · ');
    /* Lista vazia nunca fica em branco: diz o porquê e mostra o que há nas outras abas. */
    const vazio = msg => {
      const maqsNoLocal = filtroPrev.local
        ? q.ativos('equipamentos').filter(e => e.local_id === filtroPrev.local && !['VENDIDO', 'BAIXADO'].includes(e.status) && noGrupo(e)).length : null;
      if (maqsNoLocal === 0) return `<div class="pv-alerta pv-alerta-forte"><b>Nenhuma máquina cadastrada em ${esc(q.nome('locais', filtroPrev.local))}${grupoAtual ? ' no grupo ' + esc(nomeGrupo(grupoAtual)) : ''}.</b>
        <span>Confira em Cadastros se as máquinas dessa fazenda estão com o local certo.</span></div>`;
      const rot = { fazer: 'a fazer', andamento: 'em andamento', feitas: 'feitas no mês', semdado: 'falta cadastrar' };
      const outras = Object.keys(F).filter(k => k !== abaPrev && F[k].length);
      return `<div class="pv-alerta"><b>${esc(msg)}${filtrando ? ' — em ' + esc(recorte) : ''}.</b>
        ${outras.length ? `<span>Nas outras abas: ${outras.map(k => `<button type="button" class="pv-ir" data-ir-aba="${k}">${F[k].length} ${rot[k]}</button>`).join(' ')}</span>` : ''}
        ${filtrando ? '<button type="button" class="btn-fantasma" id="pv-limpar">Limpar filtros</button>' : ''}</div>`;
    };
    // Tocar no código ou no nome abre a ficha da máquina (21/10/2026).
    const maq = e => `<button type="button" class="pv-cod" data-maq="${esc(e.id)}" title="Abrir a ficha">${esc(e.codigo)}</button>
      <span class="pv-nm"><b class="pv-abre" data-maq="${esc(e.id)}">${esc(e.descricao)}</b><small>${esc(q.nome('locais', e.local_id))}${leituraDe(e) != null ? ' · agora ' + nHoras(leituraDe(e)) + ' ' + unidadeDe(e) : ''}${(() => {
        const d = idadeLeitura(e);
        return d == null ? '' : ` <em class="pv-idade${d >= HORIMETRO_VELHO_DIAS ? ' velho' : ''}">(${txtIdade(d)})</em>`; })()}</small></span>`;
    let html = '';

    if (abaPrev === 'fazer' || abaPrev === 'semdado') {
      const base = abaPrev === 'fazer' ? F.fazer : F.semdado;
      const linha = ({ p, c }) => {
        const cls = c.status === 'VENCIDO' ? 'pv-r' : c.status === 'ATENCAO' ? 'pv-y' : 'pv-n';
        return `<div class="pv-linha ${cls}">${maq(c.equipamento)}
          <span class="pv-item">${esc(nomeTipo(p.tipo_manutencao_id))}${ultimaTxt(p, c.equipamento)}</span>
          <span class="pv-sit">${abaPrev === 'fazer'
            ? `<b>${esc(textoSituacao(c))}</b><i class="pv-barra"><i style="width:${usoDoIntervalo(p, c)}%"></i></i>`
            : `<b>${esc(maiuscula(c.motivo))}</b><small>informe a última ou a próxima troca</small>`}</span>
          <span class="pv-acao">${abaPrev === 'fazer'
            ? `<button type="button" class="btn" data-abrir="${esc(p.id)}">Abrir OS</button>`
            : ehAdmin() ? `<button type="button" class="btn" data-prox="${esc(p.id)}">Informar troca</button>`
            : `<button type="button" class="btn neutro" data-maq="${esc(c.equipamento.id)}">Abrir ficha</button>`}</span>
        </div>`;
      };
      if (abaPrev === 'fazer') {
        /* Uma linha por máquina, com todos os itens dela e um botão só
           (21/10/2026): o mecânico faz tudo numa ida e a lista encolhe. */
        const porMaq = new Map();
        for (const x of base) {
          const id = x.c.equipamento.id;
          if (!porMaq.has(id)) porMaq.set(id, { e: x.c.equipamento, itens: [] });
          porMaq.get(id).itens.push(x);
        }
        const maqs = [...porMaq.values()].map(m => Object.assign(m, { vencida: m.itens.some(x => x.c.status === 'VENCIDO') }));
        const linhaMaq = m => `<div class="pv-linha pv-maq pv-com-sel ${m.vencida ? 'pv-r' : 'pv-y'}">
          <label class="pv-sel" title="Marcar para abrir junto"><input type="checkbox" data-sel="${esc(m.itens.map(x => x.p.id).join(','))}"></label>${maq(m.e)}
          <span class="pv-itens">${m.itens.map(({ p, c }) => `<span class="pv-subitem ${c.status === 'VENCIDO' ? 'pv-r' : 'pv-y'}">
            <span class="pv-item">${esc(nomeTipo(p.tipo_manutencao_id))}${ultimaTxt(p, c.equipamento)}</span>
            <span class="pv-sit"><b>${esc(textoSituacao(c))}</b><i class="pv-barra"><i style="width:${usoDoIntervalo(p, c)}%"></i></i></span>
          </span>`).join('')}</span>
          <span class="pv-acao"><button type="button" class="btn" data-abrir-maq="${esc(m.itens.map(x => x.p.id).join(','))}">Abrir OS${m.itens.length > 1 ? ' (' + m.itens.length + ' itens)' : ''}</button></span>
        </div>`;
        const venc = maqs.filter(m => m.vencida), perto = maqs.filter(m => !m.vencida);
        /* Abrir várias de uma vez (28/10/2026): marca as máquinas e sai uma
           OS por máquina, já pronta para imprimir e levar à oficina. */
        const barraSel = maqs.length ? `<div class="pv-barra-sel">
            <label><input type="checkbox" id="pv-sel-todas"> Marcar todas</label>
            <span id="pv-sel-n">nenhuma marcada</span>
            <button type="button" class="btn neutro" id="pv-abrir-sel" disabled>Abrir marcadas</button>
            <button type="button" class="btn" id="pv-imp-sel" disabled>Abrir e imprimir marcadas</button></div>` : '';
        html = barraSel + (venc.length ? `<div class="pv-grupo">Com troca vencida · ${venc.length} máquina(s)</div>` + venc.map(linhaMaq).join('') : '')
             + (perto.length ? `<div class="pv-grupo">Perto de vencer · ${perto.length} máquina(s)</div>` + perto.map(linhaMaq).join('') : '');
        if (!html) html = vazio('Nada a fazer: as trocas estão em dia ou já têm OS aberta');
      } else {
        html = base.map(linha).join('') || vazio('Todos os itens têm a troca lançada');
      }
    } else if (abaPrev === 'andamento') {
      html = F.andamento.map(o => {
        const e = q.por_id('equipamentos', o.equipamento_id) || { codigo: '—', descricao: '' };
        const d = diasDesde(o.data_emissao);
        const esquecida = d != null && d > OS_ATRASADA_DIAS;
        return `<div class="pv-os-bloco" data-bloco="${esc(o.id)}"><div class="pv-linha pv-b">${maq(e)}
          <span class="pv-item">${esc(resumoOS(o))}</span>
          <span class="pv-sit"><b class="pv-os">OS ${esc(numeroOS(o))}</b><small>aberta ${esc(dataCurta(o.data_emissao))}
            · <em class="${esquecida ? 'pv-atraso' : ''}">${d == null ? '' : d === 0 ? 'hoje' : d + (d === 1 ? ' dia' : ' dias')}</em></small></span>
          <span class="pv-acao"><button type="button" class="btn neutro" data-os="${esc(o.id)}">Ver OS</button>
            ${esquecida
              ? `<button type="button" class="btn neutro" data-naofeita="${esc(o.id)}">Não foi feita</button>
                 <button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}" data-esquecida="1">✓ Já foi feita</button>`
              : `<button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}">✓ Fechar OS</button>`}</span>
        </div><div class="pv-fecha oculto" data-painel="${esc(o.id)}"></div></div>`;
      }).join('') || vazio('Nenhuma OS preventiva aberta');
    } else {
      html = F.feitas
        .map(m => {
          const e = q.por_id('equipamentos', m.equipamento_id);
          const os = m.os_id ? q.por_id('ordens_servico', m.os_id) : null;
          return `<div class="pv-linha pv-g">${maq(e)}
            <span class="pv-item">${esc(nomeTipo(m.tipo_manutencao_id))}</span>
            <span class="pv-sit"><b>Feita em ${esc(formatarData(m.data_manutencao))}</b><small>${m.leitura != null ? nHoras(m.leitura) + ' ' + unidadeDe(e) + ' · ' : ''}${esc(m.observacao || '')}</small></span>
            <span class="pv-acao">${os ? `<button type="button" class="btn neutro" data-os="${esc(os.id)}">OS ${esc(numeroOS(os))}</button>` : ''}</span>
          </div>`;
        }).join('') || vazio('Nenhuma troca registrada neste mês');
    }

    $('#pv-lista').innerHTML = `<div class="pv-lista">${html}</div>`;
    $$('#pv-lista [data-ir-aba]').forEach(x => x.onclick = () => {
      abaPrev = x.dataset.irAba;
      $$('.pv-aba').forEach(y => y.classList.toggle('ativa', y.dataset.aba === abaPrev));
      desenhar();
    });
    const lf = $('#pv-limpar'); if (lf) lf.onclick = () => {
      $('#pv-busca').value = ''; $('#pv-item').value = ''; $('#pv-local').value = ''; desenhar();
    };
    $$('#pv-lista [data-abrir]').forEach(x => x.onclick = async () => {
      await abrirOSPreventiva(x.dataset.abrir);
      if (document.querySelector('#pv-lista')) TELAS.painel(el);
    });
    // Uma OS com todos os itens da máquina
    $$('#pv-lista [data-abrir-maq]').forEach(x => x.onclick = async () => {
      x.disabled = true;
      const ids = x.dataset.abrirMaq.split(',');
      let os = null;
      for (const id of ids) os = await abrirOSPreventiva(id, { silencioso: true });
      const e = os && q.por_id('equipamentos', os.equipamento_id);
      aviso(`OS ${numeroOS(os)} aberta para o ${e ? e.codigo : ''} com ${ids.length} ${ids.length === 1 ? 'item' : 'itens'}. Está em Em andamento.`);
      TELAS.painel(el);
    });
    $$('#pv-lista [data-os]').forEach(x => x.onclick = () => abrirOS(x.dataset.os));
    $$('#pv-lista [data-fechar]').forEach(x => x.onclick = () => {
      const os = q.por_id('ordens_servico', x.dataset.fechar);
      if (os) painelFechar(os, !!x.dataset.esquecida, () => TELAS.painel(el));
    });
    $$('#pv-lista [data-naofeita]').forEach(x => x.onclick = async () => {
      const os = q.por_id('ordens_servico', x.dataset.naofeita);
      if (!os || !confirm(`A OS ${numeroOS(os)} não foi feita? Ela é cancelada e os serviços voltam para A fazer.`)) return;
      await cancelarOS(os);
      aviso(`OS ${numeroOS(os)} cancelada. Os serviços voltaram para A fazer.`);
      TELAS.painel(el);
    });
    // Caixinhas de A fazer
    const sels = $$('#pv-lista [data-sel]');
    const contarSel = () => {
      const n = sels.filter(c => c.checked).length;
      const t = $('#pv-sel-n'); if (!t) return;
      t.textContent = n ? n + (n === 1 ? ' máquina marcada' : ' máquinas marcadas') : 'nenhuma marcada';
      $('#pv-abrir-sel').disabled = !n; $('#pv-imp-sel').disabled = !n;
      $('#pv-sel-todas').checked = n > 0 && n === sels.length;
    };
    sels.forEach(c => c.onchange = contarSel);
    const st = $('#pv-sel-todas'); if (st) st.onchange = () => { sels.forEach(c => c.checked = st.checked); contarSel(); };
    const abrirMarcadas = async imprimir => {
      const marcadas = sels.filter(c => c.checked);
      if (!marcadas.length) return;
      $('#pv-abrir-sel').disabled = $('#pv-imp-sel').disabled = true;
      const oss = [];
      for (const c of marcadas) {
        let os = null;
        for (const id of c.dataset.sel.split(',')) os = await abrirOSPreventiva(id, { silencioso: true });
        if (os && !oss.includes(os)) oss.push(os);
      }
      aviso(`${oss.length} OS ${oss.length === 1 ? 'aberta' : 'abertas'}. Estão em Em andamento.`);
      TELAS.painel(el);
      if (imprimir) imprimirVariasOS(oss);
    };
    const bas = $('#pv-abrir-sel'); if (bas) bas.onclick = () => abrirMarcadas(false);
    const bis = $('#pv-imp-sel'); if (bis) bis.onclick = () => abrirMarcadas(true);
    $$('#pv-lista [data-maq]').forEach(x => x.onclick = () => fichaMaquina(x.dataset.maq));
    $$('#pv-lista [data-prox]').forEach(x => x.onclick = () => {
      const p = q.por_id('planos_manutencao', x.dataset.prox);
      formItem(q.por_id('equipamentos', p.equipamento_id), p, { modo: 'proxima', depois: () => TELAS.painel(el) });
    });
  };

  $$('.pv-aba').forEach(x => x.onclick = () => {
    abaPrev = x.dataset.aba;
    $$('.pv-aba').forEach(y => y.classList.toggle('ativa', y === x));
    desenhar();
  });
  ['pv-busca', 'pv-item', 'pv-local'].forEach(id => { const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar; });
  const bh = $('#pv-hor'); if (bh) bh.onclick = () => listaHorimetroVelho(velhas, () => TELAS.painel(el));
  const ck = $('#pv-ck'); if (ck) ck.onclick = () => { abaChecklist = 'agenda'; irPara('checklist'); };
  // + Hora máquina (Quebra Cocão): mesmo painel do DP › Lançar jornada
  if (window.HoraMaquina && App.sb) window.HoraMaquina.disponivel(App.sb).then(ok => {
    const bhm = $('#pv-hm'); if (!bhm) return;
    bhm.classList.toggle('oculto', !ok);
    bhm.onclick = () => window.HoraMaquina.abrir({ cliente: App.sb, aoSalvar: () => { baixarBase().then(() => { if (document.querySelector('#pv-lista')) TELAS.painel(el); }).catch(() => {}); } });
  });
  $('#pv-levant').onclick = () => escolherLevantamento();
  const bimp = $('#pv-importar'); if (bimp) bimp.onclick = () => telaImportarRealtec();
  $('#pv-atualizar').onclick = async () => {
    if (!App.online) return aviso('Sem internet: a tela mostra o que está guardado neste aparelho.', true);
    aviso('Atualizando…');
    await baixarBase();
    irPara('painel');
  };
  desenhar();
};

function temOSDuplicada() {
  const vistos = new Set();
  return q.todos('ordens_servico').some(o => {
    if (o.tipo === 'CORRETIVA' || !ABERTAS.includes(o.status)) return false;
    if (vistos.has(o.equipamento_id)) return true;
    vistos.add(o.equipamento_id); return false;
  });
}

/* Fechar OS na própria linha (28/10/2026, pedido dele: "mais simples, lean,
   prático"). Abre embaixo da linha: os serviços já marcados como feitos,
   horímetro, quem fez, data, foto do adesivo e o botão Feito. Sem janela.
   esquecida = OS aberta há mais de 15 dias ("Já foi feita"): a data vem em
   branco para informar quando foi e a foto fica opcional. */
function painelFechar(os, esquecida, depois) {
  const box = document.querySelector(`[data-painel="${os.id}"]`);
  if (!box) return formFeita(os);
  /* Separação visual (28/10/2026, pedido dele): a máquina que está sendo
     fechada vira um cartão com borda verde e espaço em volta; as outras
     linhas ficam apagadas até terminar ou cancelar. */
  const lista = box.closest('.pv-lista'), bloco = box.closest('.pv-os-bloco');
  const botaoDe = b => b && b.querySelector('[data-fechar]');
  const fechar = () => {
    $$('.pv-fecha').forEach(x => { x.classList.add('oculto'); x.innerHTML = ''; });
    $$('.pv-os-bloco.aberto').forEach(b => { b.classList.remove('aberto'); const bt = botaoDe(b); if (bt) bt.textContent = bt.dataset.rot; });
    if (lista) lista.classList.remove('tem-aberto');
  };
  if (!box.classList.contains('oculto')) return fechar();
  fechar();
  if (bloco) {
    bloco.classList.add('aberto');
    const bt = botaoDe(bloco); if (bt) { bt.dataset.rot = bt.textContent; bt.textContent = '✕ Cancelar'; }
  }
  if (lista) lista.classList.add('tem-aberto');
  const e = q.por_id('equipamentos', os.equipamento_id);
  const u = unidadeDe(e);
  const medido = e.unidade_controle !== 'CALENDARIO';
  const acumulado = e.unidade_controle === 'ACUMULADO';
  const itens = itensDaOS(os.id).filter(i => !i.feito);
  const fotoObrig = !esquecida && pedeAdesivo(itens);
  const lt = u === 'km' ? 'Km' : 'Horímetro';
  let foto = null;
  box.innerHTML = `
    <div class="pv-fi-tit">Registrar a OS ${esc(numeroOS(os))} como feita</div>
    ${itens.length > 1 ? `<div class="pv-fi-itens">${itens.map(it => `<label class="pv-chip"><input type="checkbox" data-it="${esc(it.id)}" checked>
      ${esc(q.nome('tipos_manutencao', it.tipo_manutencao_id))}</label>`).join('')}
      <small>desmarque o que não foi feito</small></div>` : ''}
    <div class="pv-fi-campos">
      ${medido ? `<label>${lt} ${esquecida ? 'quando foi feita' : 'agora'}<input type="number" inputmode="decimal" step="0.1" data-f="leitura"
        value="${acumulado && leituraDe(e) != null ? esc(leituraDe(e)) : ''}" placeholder="${leituraDe(e) != null ? 'último: ' + esc(nHoras(leituraDe(e))) : 'do mostrador'}"></label>` : ''}
      <label>Quem fez<input type="text" data-f="quem" list="pv-mecanicos" autocomplete="off" value="${esc(ultimoMecanico())}" placeholder="nome">
        <datalist id="pv-mecanicos">${mecanicos().map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label>${esquecida ? 'Quando foi feita' : 'Data'}<input type="date" data-f="data" max="${hoje()}" value="${esquecida ? '' : hoje()}"></label>
      <label class="pv-fi-foto${fotoObrig ? ' obrig' : ''}"><span data-f="foto-txt">📷 ${fotoObrig ? 'Foto do adesivo' : 'Foto (opcional)'}</span>
        <input type="file" accept="image/*" capture="environment" data-f="foto"></label>
      <button type="button" class="btn pv-fi-ok" data-f="ok">✓ Feito</button>
    </div>
    <div class="pv-fi-obs"><input type="text" data-f="obs" placeholder="Observação (opcional) — ex.: filtro de ar não precisou"></div>`;
  box.classList.remove('oculto');
  const f = k => box.querySelector(`[data-f="${k}"]`);
  (f('leitura') && !acumulado ? f('leitura') : f('quem')).focus();
  f('foto').onchange = ev => {
    foto = ev.target.files[0] || null;
    f('foto-txt').textContent = foto ? '✓ Foto escolhida' : '📷 ' + (fotoObrig ? 'Foto do adesivo' : 'Foto (opcional)');
    f('foto').parentElement.classList.toggle('feita', !!foto);
  };
  f('ok').onclick = async () => {
    const marcados = itens.length > 1 ? itens.filter(it => box.querySelector(`[data-it="${it.id}"]`).checked) : itens;
    const b = f('ok');
    const r = await registrarFeita(os, {
      data: f('data').value, leitura: medido ? num(f('leitura').value) : null, executado_por: f('quem').value,
      observacao: f('obs').value.trim(), foto, marcados
    }, () => { b.disabled = true; b.textContent = 'Salvando…'; }, { fotoOpcional: esquecida });
    if (r.erro) { b.disabled = false; b.textContent = '✓ Feito'; return aviso(r.erro, true); }
    aviso(r.msg);
    if (depois) depois();
  };
}

/* Lista das máquinas com o horímetro velho, cada uma com "Lançar" (21/10/2026). */
function listaHorimetroVelho(velhas, depois) {
  abrirModal('Horímetro sem leitura recente', `
    <p class="sub">O vencimento por horas usa a última leitura. Se ela é antiga, o app pode dizer
      "faltam 300 h" quando a troca já passou. Lance a leitura do mostrador.</p>
    <ul class="lista">${velhas.map(e => `<li><div class="info"><strong>${esc(e.codigo)} — ${esc(e.descricao)}</strong>
      <small>${leituraDe(e) != null ? nHoras(leituraDe(e)) + ' ' + unidadeDe(e) + ' · ' : ''}${esc(txtIdade(idadeLeitura(e)))}${e.leitura_data ? ' (' + formatarData(e.leitura_data) + ')' : ''}</small></div>
      <button type="button" class="btn" data-lancar="${esc(e.id)}">Lançar</button></li>`).join('')}</ul>`, corpo => {
    corpo.querySelectorAll('[data-lancar]').forEach(b => b.onclick = () => {
      const e = q.por_id('equipamentos', b.dataset.lancar);
      formLeitura(e, () => { fecharModal(); depois(); });
    });
  });
}

/* =====================================================================
   LEVANTAMENTO DA ÚLTIMA TROCA (28/10/2026, pedido dele: "estamos
   desatualizados"). Folha A4 em paisagem, por fazenda, para o responsável
   escrever à mão o horímetro de hoje de cada máquina e, em cada serviço, o
   horímetro e a data da última troca, se tem o adesivo dessa troca e se tirou
   a foto, e Obs. A folha NÃO mostra o que o app tem hoje — só os campos.
   Entram todas as máquinas ativas da fazenda; os itens "acompanha" do vaso
   (check list) ficam de fora, porque não são troca.
   ===================================================================== */
function escolherLevantamento() {
  abrirModal('Levantamento da última troca', `
    <p class="sub">Folha em paisagem para o responsável escrever a última troca de cada serviço, com o adesivo e a foto.</p>
    <div class="campo"><label for="lv-local">Fazenda</label>
      <select id="lv-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select></div>
    <div class="acoes"><button type="button" class="btn" id="lv-imp">Imprimir</button>
      <button type="button" class="btn neutro" id="lv-voltar">Voltar</button></div>`, corpo => {
    corpo.querySelector('#lv-local').value = filtroPrev.local || '';
    corpo.querySelector('#lv-voltar').onclick = fecharModal;
    corpo.querySelector('#lv-imp').onclick = () => imprimirLevantamento(corpo.querySelector('#lv-local').value);
  });
}

function imprimirLevantamento(localId) {
  const tipo = id => q.por_id('tipos_manutencao', id) || {};
  const planos = planosDaFrota().filter(x => (!localId || x.c.equipamento.local_id === localId) && !tipo(x.p.tipo_manutencao_id).acompanha);
  if (!planos.length) return aviso('Nenhuma máquina com serviço cadastrado nessa fazenda.', true);
  const porMaq = new Map();
  planos.forEach(x => { const e = x.c.equipamento; if (!porMaq.has(e.id)) porMaq.set(e.id, { e, itens: [] }); porMaq.get(e.id).itens.push(x.p); });
  const grupos = [...porMaq.values()].sort((a, b) => porCodigo(a.e, b.e));
  const ordem = p => Number(tipo(p.tipo_manutencao_id).ordem ?? 999);
  grupos.forEach(g => g.itens.sort((a, b) => ordem(a) - ordem(b) || String(q.nome('tipos_manutencao', a.tipo_manutencao_id)).localeCompare(q.nome('tipos_manutencao', b.tipo_manutencao_id))));
  const fazenda = localId ? q.nome('locais', localId) : 'Todas as fazendas';
  const linha = '<div class="ln"></div>';
  const quad = '<i class="ck"></i>';
  const aCada = (p, e) => {
    const u = unidadeDe(e), partes = [];
    if (p.periodicidade_horas != null && e.unidade_controle !== 'CALENDARIO') partes.push(nHoras(p.periodicidade_horas).replace(',0', '') + ' ' + u);
    if (p.periodicidade_dias != null) partes.push(p.periodicidade_dias + ' d');
    return partes.join(' / ') || '—';
  };
  const leituraHoje = e => e.unidade_controle === 'HORIMETRO' ? 'Horímetro hoje' : e.unidade_controle === 'HODOMETRO' ? 'Km hoje' : '';
  const corpo = grupos.map(({ e, itens }) => {
    const rot = leituraHoje(e);
    const medido = e.unidade_controle !== 'CALENDARIO';
    return `<tbody><tr class="maq"><td colspan="7"><b>${esc(e.codigo || '')} — ${esc(e.descricao || '')}</b>
        ${!localId ? `<span>${esc(q.nome('locais', e.local_id) || '')}</span>` : ''}
        ${rot ? `<span>${rot}: <i class="hj"></i></span>` : ''}</td></tr>` +
      itens.map(p => {
        const semHora = !medido || p.periodicidade_horas == null;
        return `<tr><td>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</td><td class="nw">${esc(aCada(p, e))}</td>
          <td class="f${semHora ? ' cinza' : ''}">${semHora ? '' : linha}</td><td class="f dt">____/____/______</td>
          <td class="f c">${quad}</td><td class="f c">${quad}</td><td>${linha}</td></tr>`;
      }).join('') + '</tbody>';
  }).join('');
  const nServ = planos.length;
  const w = window.open('', '_blank');
  if (!w) return aviso('O navegador bloqueou a janela de impressão.', true);
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Levantamento da última troca — ${esc(fazenda)}</title>
    <style>
      @page{size:A4 landscape;margin:9mm 10mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#51534A;margin:0;font-size:11px}
      .top{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #c9dfa0;padding-bottom:7px}
      .top img{height:40px}
      .tit{text-align:center}.tit h1{margin:0;font-size:17px;letter-spacing:1.2px;color:#3d3f38;text-transform:uppercase}
      .tit p{margin:3px 0 0;font-size:10.5px;color:#7a7c72}
      .inf{border:1px solid #d7d9cf;border-radius:7px;padding:5px 9px;font-size:10.5px;text-align:right;line-height:1.5}
      .inf b{color:#3d3f38}
      .aviso{margin:7px 0 6px;background:#f1f6e6;border-left:4px solid #84BD00;padding:5px 9px;font-size:10.5px}
      .aviso b{color:#744F28}
      table{width:100%;border-collapse:collapse}
      thead{display:table-header-group}
      tbody{break-inside:avoid;page-break-inside:avoid}
      th{background:#f4f5f0;font-size:8.5px;text-transform:uppercase;text-align:left;padding:4px 5px;border:1px solid #cfd2c7;letter-spacing:.3px}
      th.g{background:#eaf3d6;text-align:center;color:#4f7300}
      td{border:1px solid #d7d9cf;padding:3px 7px;height:31px;vertical-align:bottom}
      tr.maq td{background:#eef5de;color:#3d3f38;height:25px;vertical-align:middle}
      tr.maq span{margin-left:16px}
      .hj{display:inline-block;width:120px;border-bottom:1px solid #9a9c92;height:12px;vertical-align:bottom}
      .ln{border-bottom:1px solid #9a9c92;height:16px;margin-bottom:3px}
      .f{background:#fbfcf8}.f.cinza{background:#eeeee9}
      .dt{color:#9a9c92;text-align:center;letter-spacing:2px;font-size:12px;padding-bottom:5px}
      .c{text-align:center;vertical-align:middle}
      .nw{white-space:nowrap}
      .ck{display:inline-block;width:14px;height:14px;border:1.4px solid #51534A;border-radius:2px}
      .pe{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;font-size:11px;break-inside:avoid}
      .ass{width:320px;text-align:center;border-top:1px solid #51534A;padding-top:4px}
      .ft{text-align:right;margin-top:8px}.ft img{height:18px}
      th,td,.f,.aviso,tr.maq td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    </style></head><body>
    <div class="top"><img src="${new URL('../img/sakuma-logo.png', location.href)}" alt="SAKUMA Agronegócios">
      <div class="tit"><h1>Levantamento da última troca</h1><p>Escreva quando foi a última troca de cada serviço — pelo adesivo da máquina, caderno ou nota da peça</p></div>
      <div class="inf">Fazenda: <b>${esc(fazenda)}</b><br>Emitido em <b>${formatarData(hoje())}</b><br>${grupos.length} ${grupos.length === 1 ? 'máquina' : 'máquinas'} · ${nServ} ${nServ === 1 ? 'serviço' : 'serviços'}</div></div>
    <div class="aviso"><b>Como preencher:</b> em cada máquina, o horímetro de hoje. Depois, em cada serviço, o horímetro e a data da última troca, se tem o adesivo dessa troca na máquina e se tirou a foto do adesivo. Não sabe? Escreva em Obs.</div>
    <table><thead>
      <tr><th rowspan="2" style="width:20%">Serviço</th><th rowspan="2" style="width:9%">A cada</th>
        <th colspan="2" class="g">Última troca de verdade</th><th colspan="2" class="g">Adesivo</th><th rowspan="2">Obs.</th></tr>
      <tr><th class="g" style="width:16%">Horímetro</th><th class="g" style="width:16%">Data</th><th class="g" style="width:5.5%">Tem</th><th class="g" style="width:5.5%">Foto</th></tr>
    </thead>${corpo}</table>
    <div class="pe"><span>Data do levantamento: ____/____/_______</span><div class="ass">Responsável</div></div>
    <div class="ft"><img src="${new URL('../img/lop-marca.png', location.href)}" alt="LOP"></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
    </body></html>`);
  w.document.close();
}
