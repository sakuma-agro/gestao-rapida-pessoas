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
let modoVarias = false;   // caixinhas de "Abrir várias" (28/10/2026)
let servicoSel = '';      // aba "Por serviço" (28/10/2026)
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

function textoSituacao(c) { return textoPorQue(c); }

/* "última: 21/04/2026 · 4.195 h" embaixo do item (21/10/2026) */
function ultimaTxt(p, e) {
  const partes = [];
  if (p.ultima_troca_data) partes.push(formatarData(p.ultima_troca_data));
  if (p.ultima_troca_leitura != null) partes.push(nHoras(p.ultima_troca_leitura) + ' ' + unidadeDe(e));
  return partes.length ? '<small class="pv-ult">última: ' + esc(partes.join(' · ')) + '</small>' : '';
}

/* Vencido por horímetro (ou km) ou por período? (28/10/2026, pedido dele)
   O calcular() já diz o motivo: "passou/faltam X h|km" é pelo mostrador;
   "período vencido há N dias" / "vence em N dias" é pelo calendário. */
function porQueVence(c) {
  const m = String(c.motivo || '');
  const km = / km$/.test(m);
  const periodoVencido = c.proxima_data && c.proxima_data < hoje();
  if (/^passou /.test(m)) return periodoVencido
    ? { tipo: (km ? 'km' : 'horímetro') + ' e período', ic: '⏱📅', txt: 'passou ' + m.slice(7) + ' e venceu ' + dataCurta(c.proxima_data) }
    : { tipo: km ? 'km' : 'horímetro', ic: '⏱', txt: 'passou ' + m.slice(7) };
  if (/^faltam /.test(m)) return { tipo: km ? 'km' : 'horímetro', ic: '⏱', txt: m };
  if (/^período vencido há/.test(m)) return { tipo: 'período', ic: '📅', txt: m.replace(/^período vencido há/, 'venceu há') };
  if (/^vence /.test(m)) return { tipo: 'período', ic: '📅', txt: m };
  return { tipo: '', ic: '', txt: m };
}
const textoPorQue = c => { const v = porQueVence(c); return v.tipo ? v.ic + ' Por ' + v.tipo + ': ' + v.txt : maiuscula(v.txt); };

TELAS.painel = el => {
  document.body.classList.remove('modo-quadro');
  /* Uma OS por máquina (28/10/2026): se apareceu OS duplicada (dois aparelhos
     sem internet), junta na mais antiga e redesenha. */
  /* 28/10/2026 (mais tarde): desligado — agora a mesma máquina pode ter
     mais de uma OS de propósito (serviços que não podem ir juntos). */
  if (false && typeof juntarOSDuplicadas === 'function' && temOSDuplicada()) {
    juntarOSDuplicadas().then(n => { if (n) aviso(n + ' OS duplicada(s) juntada(s) na OS mais antiga da máquina.'); TELAS.painel(el); });
    return;
  }
  // Tela do auxiliar (28/10/2026, aprovada com imagem): quem não é
  // administrador começa por três blocos grandes; "Ver tudo" abre a lista.
  if (!ehAdmin() && !listaCompletaAux) return inicioAuxiliar(el);
  if (!ehAdmin() && abaPrev === 'semdado') abaPrev = 'fazer';
  const planos = planosDaFrota();
  const mes = hoje().slice(0, 7);

  // Em andamento: uma linha por OS preventiva aberta (a OS pode ter vários itens)
  const osAbertas = q.todos('ordens_servico')
    .filter(o => o.tipo !== 'CORRETIVA' && ABERTAS.includes(o.status) && noGrupoId(o.equipamento_id))
    .sort((a, b) => String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')));
  // Consertos (28/10/2026): OS corretivas abertas, no mesmo fluxo das preventivas
  const consertos = q.todos('ordens_servico')
    .filter(o => o.tipo === 'CORRETIVA' && ABERTAS.includes(o.status) && noGrupoId(o.equipamento_id))
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

  /* Tela mais leve (28/10/2026, pedido dele: "a tela não está pesada?"):
     título + "Mais ▾"; abas em etiquetas numa linha; avisos numa linha de
     links; só a busca à vista (fazenda e serviço em "Filtros ▾"); caixinhas
     de marcar só em "Abrir várias"; uma linha por máquina. E a aba
     "Por serviço": escolhe o serviço e vê o vencimento de todas as máquinas. */
  /* OS atrasada (28/10/2026, pedido dele): aberta há mais de 15 dias fica
     escrita "ATRASADA", com a linha em vermelho, e aparece na aba e nos avisos. */
  const atrasadas = [...osAbertas, ...consertos].filter(o => { const d = diasDesde(o.data_emissao); return d != null && d > OS_ATRASADA_DIAS; });
  const aba = (id, cls, n, rot) => `<button type="button" class="pv-aba ${cls}${abaPrev === id ? ' ativa' : ''}" data-aba="${id}">${n === null ? '' : `<strong>${n}</strong>`}<b>${rot}</b></button>`;
  const avisos = [
    atrasadas.length ? `<button type="button" class="pv-av-r" data-ir-aba="${atrasadas.some(o => o.tipo !== 'CORRETIVA') ? 'andamento' : 'consertos'}">⚠ ${atrasadas.length} OS atrasada(s) — aberta(s) há mais de ${OS_ATRASADA_DIAS} dias</button>` : '',
    velhas.length ? `<button type="button" id="pv-hor">⏱ ${velhas.length} horímetro(s) com mais de ${HORIMETRO_VELHO_DIAS} dias</button>` : '',
    ckAtraso ? `<button type="button" id="pv-ck">☑ ${ckAtraso} check list(s) atrasado(s)</button>` : '',
    ehAdmin() && semDado.length ? `<button type="button" data-ir-aba="semdado">✎ ${semDado.length} sem a troca cadastrada</button>` : ''
  ].filter(Boolean);

  el.innerHTML = `
    <div class="pn-cabeca pv-cab-leve">
      <h1>Hoje${grupoAtual ? ' · ' + esc(nomeGrupo(grupoAtual)) : ''}</h1>
      <span class="pv-cab-acoes">${!ehAdmin() ? '<button type="button" class="btn neutro" id="pv-inicio">← Início</button>' : ''}
        <details class="pv-menu-mais"><summary class="btn neutro">Mais ▾</summary><div class="pv-mais-lista">
          <button type="button" class="oculto" id="pv-hm">+ Hora máquina</button>
          <button type="button" id="pv-levant">🖨 Levantamento da última troca</button>
          <button type="button" id="pv-atualizar">↻ Atualizar dados</button>
          ${ehAdmin() ? '<button type="button" data-ir="calendario">Calendário</button><button type="button" data-ir="vencimentos">Planilha</button><button type="button" data-ir="ordens">Todas as OS</button>' : ''}
        </div></details></span>
    </div>
    ${guiaPassos('hoje', [
      'Em <b>A fazer</b>, toque em <b>Abrir OS</b> na máquina vencida',
      'Toque em <b>WhatsApp</b> para mandar a OS a quem vai fazer',
      'Feita a troca, em <b>Em andamento</b> toque em <b>Fechar OS</b> e preencha o horímetro']) }
    <div class="pv-tabs">
      ${aba('fazer', 'pv-a-fazer', fazer.length, 'A fazer')}
      ${aba('andamento', 'pv-a-and', osAbertas.length, 'Em andamento' + (atrasadas.filter(o => o.tipo !== 'CORRETIVA').length ? ` <em class="pv-aba-atr">${atrasadas.filter(o => o.tipo !== 'CORRETIVA').length} atrasada(s)</em>` : ''))}
      ${aba('consertos', 'pv-a-con', consertos.length, 'Consertos')}
      ${aba('feitas', 'pv-a-feita', feitas.length, 'Feitas no mês')}
      ${aba('servico', 'pv-a-serv', null, '⚙ Por serviço')}
      ${abaPrev === 'semdado' ? aba('semdado', 'pv-a-sem', semDado.length, 'Sem a troca cadastrada') : ''}
    </div>
    ${avisos.length ? `<p class="pv-avisos">${avisos.join('<span>·</span>')}</p>` : ''}
    <div class="filtros pv-filtros">
      <input type="search" id="pv-busca" placeholder="Buscar máquina" value="${esc(filtroPrev.busca)}">
      <details class="pv-filtros-mais"${filtroPrev.local || filtroPrev.item ? ' open' : ''}><summary>Filtros ▾</summary>
        <select id="pv-item"><option value="">Todos os serviços</option>
          ${q.ordenado('tipos_manutencao', 'ordem').map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>
        <select id="pv-local"><option value="">Todas as fazendas</option>
          ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
      </details>
      ${abaPrev === 'fazer' ? `<button type="button" class="btn-fantasma" id="pv-varias">${modoVarias ? '✕ Sair de abrir várias' : 'Abrir várias'}</button>` : ''}
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
      consertos: consertos.filter(o => casa(q.por_id('equipamentos', o.equipamento_id), o.descricao || '')),
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
      const rot = { fazer: 'a fazer', andamento: 'em andamento', consertos: 'consertos', feitas: 'feitas no mês', semdado: 'sem a troca cadastrada' };
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
        const chip = ({ p, c }) => `<span class="pv-chip-s ${c.status === 'VENCIDO' ? 'r' : 'y'}">${esc(nomeTipo(p.tipo_manutencao_id).toLowerCase().replace(/^./, x => x.toUpperCase()))} · ${(() => { const v = porQueVence(c); return v.tipo ? `<i>${v.ic} por ${v.tipo}</i> ${esc(v.txt)}` : esc(v.txt); })()}</span>`;
        const linhaMaq = m => `<div class="pv-os-bloco" data-bloco-maq="${esc(m.e.id)}"><div class="pv-linha pv-leve${modoVarias ? ' com-sel' : ''} ${m.vencida ? 'pv-r' : 'pv-y'}">
          ${modoVarias ? `<label class="pv-sel" title="Marcar para abrir junto"><input type="checkbox" data-sel="${esc(m.itens.map(x => x.p.id).join(','))}"></label>` : ''}
          <button type="button" class="pv-cod" data-maq="${esc(m.e.id)}" title="Abrir a ficha">${esc(m.e.codigo)}</button>
          <span class="pv-nm2"><b class="pv-abre" data-maq="${esc(m.e.id)}">${esc(m.e.descricao)}</b><span class="pv-chips">${m.itens.map(chip).join('')}</span></span>
          <span class="pv-acao"><button type="button" class="btn" data-abrir-maq="${esc(m.itens.map(x => x.p.id).join(','))}">Abrir OS</button></span>
        </div><div class="pv-fecha oculto" data-painel-abrir="${esc(m.e.id)}"></div></div>`;
        const venc = maqs.filter(m => m.vencida), perto = maqs.filter(m => !m.vencida);
        /* Abrir várias de uma vez (28/10/2026): marca as máquinas e sai uma
           OS por máquina, já pronta para imprimir e levar à oficina. */
        const barraSel = maqs.length && modoVarias ? `<div class="pv-barra-sel">
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
    } else if (abaPrev === 'servico') {
      const usados = [...new Set(planos.map(x => x.p.tipo_manutencao_id))]
        .map(id => q.por_id('tipos_manutencao', id)).filter(Boolean)
        .sort((x, y) => (Number(x.ordem) || 999) - (Number(y.ordem) || 999) || x.nome.localeCompare(y.nome));
      if (!usados.some(t => t.id === servicoSel)) servicoSel = (usados[0] || {}).id || '';
      const ordem = { VENCIDO: 0, ATENCAO: 1, OK: 2, SEM_DADO: 3 };
      const lista = planos.filter(x => x.p.tipo_manutencao_id === servicoSel && casa(x.c.equipamento, ''))
        .sort((a, b) => (ordem[a.c.status] ?? 2) - (ordem[b.c.status] ?? 2) || usoDoIntervalo(b.p, b.c) - usoDoIntervalo(a.p, a.c) || porCodigo(a.c.equipamento, b.c.equipamento));
      const n = st => lista.filter(x => x.c.status === st).length;
      html = `<div class="pv-serv-top"><label>Serviço <select id="pv-serv">${usados.map(t => `<option value="${esc(t.id)}"${t.id === servicoSel ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
          <span><b>${lista.length}</b> máquinas · <b class="r">${n('VENCIDO')}</b> vencidas · <b class="y">${n('ATENCAO')}</b> perto · <b class="g">${n('OK')}</b> em dia${n('SEM_DADO') ? ' · ' + n('SEM_DADO') + ' sem a troca' : ''}</span></div>`
        + (lista.map(({ p, c }) => {
          const e = c.equipamento, os = osAbertaDoPlano(p);
          const cls = { VENCIDO: 'pv-r', ATENCAO: 'pv-y', OK: 'pv-g', SEM_DADO: 'pv-n' }[c.status] || 'pv-n';
          const ult = [p.ultima_troca_data ? formatarData(p.ultima_troca_data) : '', p.ultima_troca_leitura != null ? nHoras(p.ultima_troca_leitura) + ' ' + unidadeDe(e) : ''].filter(Boolean).join(' · ');
          return `<div class="pv-linha pv-serv ${cls}">
            <button type="button" class="pv-cod" data-maq="${esc(e.id)}">${esc(e.codigo)}</button>
            <span class="pv-nm2"><b class="pv-abre" data-maq="${esc(e.id)}">${esc(e.descricao)}</b><small>${esc(q.nome('locais', e.local_id))}${ult ? ' · última ' + esc(ult) : ''}</small></span>
            <span class="pv-sit"><b>${esc(textoPorQue(c))}</b><small>${c.status === 'SEM_DADO' ? '' : 'próxima: ' + proximaTroca(c)}</small></span>
            <span class="pv-acao">${os ? `<button type="button" class="btn neutro" data-os="${esc(os.id)}">OS ${esc(numeroOS(os))}</button>`
              : ['VENCIDO', 'ATENCAO'].includes(c.status) ? `<button type="button" class="btn" data-abrir="${esc(p.id)}">Abrir OS</button>`
              : c.status === 'SEM_DADO' && ehAdmin() ? `<button type="button" class="btn neutro" data-prox="${esc(p.id)}">Informar troca</button>` : ''}</span>
          </div>`;
        }).join('') || vazio('Nenhuma máquina com esse serviço'));
    } else if (abaPrev === 'andamento' || abaPrev === 'consertos') {
      const conserto = abaPrev === 'consertos';
      html = (conserto ? `<div class="pv-grupo pv-grupo-acao">Algo quebrou? <button type="button" class="btn" id="pv-novo-conserto">+ Novo conserto</button></div>` : '')
        + (conserto ? F.consertos : F.andamento).map(o => {
        const e = q.por_id('equipamentos', o.equipamento_id) || { codigo: '—', descricao: '' };
        const d = diasDesde(o.data_emissao);
        const esquecida = d != null && d > OS_ATRASADA_DIAS;
        return `<div class="pv-os-bloco" data-bloco="${esc(o.id)}"><div class="pv-linha ${esquecida ? 'pv-r pv-atrasada' : conserto ? 'pv-c' : 'pv-b'}">${maq(e)}
          <span class="pv-item">${esc(conserto ? (o.descricao || 'Conserto') : resumoOS(o))}</span>
          <span class="pv-sit">${esquecida ? '<span class="pv-tag-atr">ATRASADA</span> ' : ''}<b class="pv-os">OS ${esc(numeroOS(o))}</b><small>aberta ${esc(dataCurta(o.data_emissao))}
            · <em class="${esquecida ? 'pv-atraso' : ''}">${d == null ? '' : d === 0 ? 'hoje' : d + (d === 1 ? ' dia' : ' dias')}</em></small></span>
          <span class="pv-acao"><button type="button" class="btn neutro" data-os="${esc(o.id)}">Ver OS</button>
            <button type="button" class="btn pv-wpp" data-wpp="${esc(o.id)}" title="Enviar pelo WhatsApp">WhatsApp</button>
            ${esquecida
              ? `<button type="button" class="btn neutro" data-naofeita="${esc(o.id)}">Não foi feita</button>
                 <button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}" data-esquecida="1">✓ Já foi feita</button>`
              : `<button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}">✓ Fechar OS</button>`}</span>
        </div><div class="pv-fecha oculto" data-painel="${esc(o.id)}"></div></div>`;
      }).join('') || vazio(conserto ? 'Nenhum conserto em aberto' : 'Nenhuma OS preventiva aberta');
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
    $$('#pv-lista [data-ir-aba]').forEach(x => x.onclick = () => { abaPrev = x.dataset.irAba; TELAS.painel(el); });
    const lf = $('#pv-limpar'); if (lf) lf.onclick = () => {
      $('#pv-busca').value = ''; $('#pv-item').value = ''; $('#pv-local').value = ''; desenhar();
    };
    $$('#pv-lista [data-abrir]').forEach(x => x.onclick = async () => {
      await abrirOSPreventiva(x.dataset.abrir);
      if (document.querySelector('#pv-lista')) TELAS.painel(el);
    });
    /* Abrir OS (28/10/2026): com um serviço, abre na hora. Com mais de um,
       abre embaixo da linha a lista dos serviços, todos marcados — desmarca
       o que não pode ir junto; o que ficar desmarcado continua em A fazer
       e pode virar outra OS depois. */
    const abrirComItens = async ids => {
      let os = null;
      for (const id of ids) os = await abrirOSPreventiva(id, os ? { silencioso: true, osAlvo: os } : { silencioso: true, nova: true });
      const e = os && q.por_id('equipamentos', os.equipamento_id);
      aviso(`OS ${numeroOS(os)} aberta para o ${e ? e.codigo : ''} com ${ids.length} ${ids.length === 1 ? 'serviço' : 'serviços'}. Está em Em andamento.`);
      TELAS.painel(el);
    };
    $$('#pv-lista [data-abrir-maq]').forEach(x => x.onclick = async () => {
      const ids = x.dataset.abrirMaq.split(',');
      if (ids.length === 1) { x.disabled = true; return abrirComItens(ids); }
      const bloco = x.closest('.pv-os-bloco'), box = bloco.querySelector('[data-painel-abrir]'), lista = bloco.closest('.pv-lista');
      const fechar = () => {
        $$('.pv-fecha').forEach(y => { y.classList.add('oculto'); y.innerHTML = ''; });
        $$('.pv-os-bloco.aberto').forEach(y => y.classList.remove('aberto'));
        $$('[data-abrir-maq]').forEach(y => { if (y.dataset.rot) y.textContent = y.dataset.rot; });
        if (lista) lista.classList.remove('tem-aberto');
      };
      if (!box.classList.contains('oculto')) return fechar();
      fechar();
      bloco.classList.add('aberto'); lista.classList.add('tem-aberto');
      x.dataset.rot = x.textContent; x.textContent = '✕ Cancelar';
      box.innerHTML = `<div class="pv-fi-tit">Quais serviços vão nesta OS?</div>
        <div class="pv-fi-itens">${ids.map(id => { const p = q.por_id('planos_manutencao', id);
          return `<label class="pv-chip"><input type="checkbox" data-ab="${esc(id)}" checked> ${esc(nomeTipo(p.tipo_manutencao_id))}</label>`; }).join('')}
          <small>desmarque o que não pode ir junto — fica em A fazer para outra OS</small></div>
        <div><button type="button" class="btn pv-fi-ok" data-ab-ok>Abrir OS com os marcados</button></div>`;
      box.classList.remove('oculto');
      box.querySelector('[data-ab-ok]').onclick = async ev => {
        const sel = [...box.querySelectorAll('[data-ab]')].filter(c => c.checked).map(c => c.dataset.ab);
        if (!sel.length) return aviso('Marque pelo menos um serviço.', true);
        ev.target.disabled = true; ev.target.textContent = 'Abrindo…';
        await abrirComItens(sel);
      };
    });
    $$('#pv-lista [data-os]').forEach(x => x.onclick = () => abrirOS(x.dataset.os));
    const sv = $('#pv-serv'); if (sv) sv.onchange = () => { servicoSel = sv.value; desenhar(); };
    const bnc = $('#pv-novo-conserto'); if (bnc) bnc.onclick = () => formCorretiva();
    $$('#pv-lista [data-fechar]').forEach(x => x.onclick = () => {
      const os = q.por_id('ordens_servico', x.dataset.fechar);
      if (os) painelFechar(os, !!x.dataset.esquecida, () => TELAS.painel(el));
    });
    $$('#pv-lista [data-wpp]').forEach(x => x.onclick = () => {
      const os = q.por_id('ordens_servico', x.dataset.wpp);
      if (os) enviarOSWhatsApp(os, x);
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
        for (const id of c.dataset.sel.split(',')) os = await abrirOSPreventiva(id, os ? { silencioso: true, osAlvo: os } : { silencioso: true, nova: true });
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

  $$('.pv-aba').forEach(x => x.onclick = () => { abaPrev = x.dataset.aba; TELAS.painel(el); });
  ['pv-busca', 'pv-item', 'pv-local'].forEach(id => { const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar; });
  const bh = $('#pv-hor'); if (bh) bh.onclick = () => irPara('atualizar_horimetros');
  const ck = $('#pv-ck'); if (ck) ck.onclick = () => { abaChecklist = 'agenda'; irPara('checklist'); };
  // + Hora máquina (Quebra Cocão): mesmo painel do DP › Lançar jornada
  if (window.HoraMaquina && App.sb) window.HoraMaquina.disponivel(App.sb).then(ok => {
    const bhm = $('#pv-hm'); if (!bhm) return;
    bhm.classList.toggle('oculto', !ok);
    bhm.onclick = () => window.HoraMaquina.abrir({ cliente: App.sb, aoSalvar: () => { baixarBase().then(() => { if (document.querySelector('#pv-lista')) TELAS.painel(el); }).catch(() => {}); } });
  });
  $('#pv-levant').onclick = () => escolherLevantamento();
  el.querySelectorAll('.pv-mais-lista [data-ir]').forEach(b => b.onclick = () => irPara(b.dataset.ir));
  el.querySelectorAll('.pv-avisos [data-ir-aba]').forEach(b => b.onclick = () => { abaPrev = b.dataset.irAba; TELAS.painel(el); });
  const bv = $('#pv-varias'); if (bv) bv.onclick = () => { modoVarias = !modoVarias; TELAS.painel(el); };
  const bini = $('#pv-inicio'); if (bini) bini.onclick = () => { listaCompletaAux = false; TELAS.painel(el); };
  $('#pv-atualizar').onclick = async () => {
    if (!App.online) return aviso('Sem internet: a tela mostra o que está guardado neste aparelho.', true);
    aviso('Atualizando…');
    await baixarBase();
    irPara('painel');
  };
  desenhar();
};

/* Enviar pelo WhatsApp (28/10/2026, pedido dele: "somente o PDF, saindo o
   número da OS e a máquina, nada de texto"). Monta o PDF da própria folha da
   OS (a mesma do Imprimir), com o nome "OS 12 - T.16.pdf", e compartilha só
   o arquivo. No celular abre direto a escolha do WhatsApp; no computador
   baixa o PDF e abre o WhatsApp Web para anexar. */
function carregarScript(src) {
  return new Promise((ok, erro) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => erro(new Error('não consegui carregar ' + src)); document.head.appendChild(s);
  });
}
/* PDF a partir da folha em HTML (a mesma do Imprimir). Folha comprida
   (check list com fotos) vira várias páginas A4. opts.largura: largura da
   folha na tela; opts.preparar(caixa): ajuste antes da foto (check list). */
async function pdfDeHtml(html, opts = {}) {
  if (!window.html2canvas) await carregarScript('../vendor/html2canvas.min.js');
  if (!window.jspdf) await carregarScript('../vendor/jspdf.umd.min.js');
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + (opts.largura || '760px') + ';background:#fff;padding:0';
  caixa.innerHTML = html;
  document.body.appendChild(caixa);
  try {
    await Promise.all([...caixa.querySelectorAll('img')].map(i => i.complete ? 0
      : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
    if (opts.preparar) opts.preparar(caixa);
    caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + (opts.largura || '760px') + ';background:#fff;padding:0';
    const cv = await html2canvas(caixa, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const M = 10, L = 210 - 2 * M, A = 297 - 2 * M;
    const pxPorMm = cv.width / L, fatia = Math.floor(A * pxPorMm);
    if (cv.height <= fatia * 1.08) {   // cabe numa folha (encolhe um pouco se passar)
      let w = L, h = cv.height / pxPorMm;
      if (h > A) { h = A; w = cv.width * A / cv.height; }
      doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', M + (L - w) / 2, M, w, h);
    } else {
      for (let y = 0, pg = 0; y < cv.height; y += fatia, pg++) {
        const c = document.createElement('canvas'); c.width = cv.width; c.height = Math.min(fatia, cv.height - y);
        c.getContext('2d').drawImage(cv, 0, y, cv.width, c.height, 0, 0, cv.width, c.height);
        if (pg) doc.addPage();
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, L, c.height / pxPorMm);
      }
    }
    return doc.output('blob');
  } finally { caixa.remove(); }
}
const pdfDaOS = os => pdfDeHtml(folhaOS(os));

/* Só o arquivo, sem texto (pedido dele). Celular: escolhe o contato no
   WhatsApp; computador: baixa e abre o WhatsApp Web para anexar. */
async function compartilharPdf(gerar, nome, botao) {
  nome = nome.replace(/[\\/:*?"<>|]+/g, '-');
  const rot = botao && botao.innerHTML;
  if (botao) { botao.disabled = true; botao.textContent = 'Preparando…'; }
  try {
    const arq = new File([await gerar()], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [arq] })) {
      try { await navigator.share({ files: [arq] }); return true; }
      catch (x) { if (x && x.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(arq), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    window.open('https://web.whatsapp.com/', '_blank', 'noopener');
    aviso('PDF baixado (' + nome + '). Anexe na conversa do WhatsApp.');
    return true;
  } catch (x) {
    aviso('Não consegui montar o PDF: ' + (x.message || x), true);
    return false;
  } finally {
    if (botao) { botao.disabled = false; botao.innerHTML = rot; }
  }
}
function enviarOSWhatsApp(os, botao) {
  const e = q.por_id('equipamentos', os.equipamento_id) || {};
  return compartilharPdf(() => pdfDaOS(os), 'OS ' + (os.numero || 'nova') + ' - ' + (e.codigo || 'maquina') + '.pdf', botao);
}
Object.assign(window, { pdfDeHtml, compartilharPdf });

let listaCompletaAux = false;
function inicioAuxiliar(el) {
  const abertas = q.todos('ordens_servico').filter(o => ABERTAS.includes(o.status) && noGrupoId(o.equipamento_id));
  const nCons = abertas.filter(o => o.tipo === 'CORRETIVA').length;
  const ck = podeTela('checklist') && typeof agendaChecklists === 'function'
    ? agendaChecklists().filter(a => ['atrasado', 'hoje', 'nunca'].includes(a.status)) : null;
  const qc = typeof localPorNome === 'function' ? localPorNome('QUEBRA') : null;
  const hor = podeTela('atualizar_horimetros') && qc
    ? q.ativos('equipamentos').filter(e => e.local_id === qc.id && ['HORIMETRO', 'HODOMETRO'].includes(e.unidade_controle)
        && !['VENDIDO', 'BAIXADO'].includes(e.status) && idadeLeitura(e) >= HORIMETRO_VELHO_DIAS) : null;
  const nome = String((App.usuario && App.usuario.nome) || '').split(' ')[0];
  const bloco = (id, n, cor, titulo, dica) => `<button type="button" class="aux-bloco" data-aux="${id}" style="--c:${cor}">
      <span class="aux-n">${n}</span><span class="aux-t"><b>${titulo}</b><small>${dica}</small></span><span class="aux-go">Abrir</span></button>`;
  el.innerHTML = `
    <div class="aux">
      <h1>${nome ? 'Olá, ' + esc(nome) : 'Hoje'}</h1>
      <p class="sub">O que tem para fazer hoje. Toque no bloco.</p>
      ${bloco('os', abertas.length, '#2E6DA4', 'OS para fechar', abertas.length ? 'troca ou conserto feito? registre aqui' + (nCons ? ' · ' + nCons + ' conserto(s)' : '') : 'nenhuma OS aberta')}
      ${ck ? bloco('ck', ck.length, '#4E8B1F', 'Check list para fazer', ck.length ? ck.slice(0, 3).map(a => a.e.codigo).join(', ') + (ck.length > 3 ? '…' : '') + ' — preencha no celular' : 'tudo em dia') : ''}
      ${hor ? bloco('hor', hor.length, '#A87508', 'Horímetros para lançar', hor.length ? esc(qc.nome) + ' · escreva o número do painel' : 'tudo em dia') : ''}
      <p class="aux-tudo"><button type="button" data-aux="tudo">Ver a lista completa (A fazer, consertos, feitas) →</button></p>
    </div>`;
  el.querySelectorAll('[data-aux]').forEach(b => b.onclick = () => {
    const a = b.dataset.aux;
    if (a === 'ck') return irPara('checklist');
    if (a === 'hor') { if (typeof fazHorimetro !== 'undefined') fazHorimetro = qc.id; return irPara('atualizar_horimetros'); }
    listaCompletaAux = true;
    if (a === 'os') abaPrev = abertas.some(o => o.tipo !== 'CORRETIVA') ? 'andamento' : (nCons ? 'consertos' : 'andamento');
    TELAS.painel(el);
  });
}

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
    <div class="pv-fi-obs"><input type="text" data-f="obs" placeholder="${os.tipo === 'CORRETIVA' ? 'O que foi feito (obrigatório) — ex.: trocado o retentor do cubo' : 'Observação (opcional) — ex.: filtro de ar não precisou'}"></div>`;
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
  const porMaq = new Map();
  planos.forEach(x => { const e = x.c.equipamento; if (!porMaq.has(e.id)) porMaq.set(e.id, { e, itens: [] }); porMaq.get(e.id).itens.push(x.p); });
  /* 28/10/2026 (pedido dele: "até os que tiverem sem dados"): máquina ativa
     sem nenhum serviço cadastrado também entra, com linhas em branco para o
     responsável escrever o serviço e a última troca. */
  q.ativos('equipamentos').filter(e => e.ativo !== false && !['VENDIDO', 'BAIXADO'].includes(e.status) && noGrupo(e)
      && (!localId || e.local_id === localId) && !porMaq.has(e.id))
    .forEach(e => porMaq.set(e.id, { e, itens: [], semCadastro: true }));
  if (!porMaq.size) return aviso('Nenhuma máquina nessa fazenda.', true);
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
  const LINHAS_VAZIAS = 3;
  const corpo = grupos.map(({ e, itens, semCadastro }) => {
    const rot = leituraHoje(e);
    const medido = e.unidade_controle !== 'CALENDARIO';
    return `<tbody><tr class="maq"><td colspan="7"><b>${esc(e.codigo || '')} — ${esc(e.descricao || '')}</b>
        ${!localId ? `<span>${esc(q.nome('locais', e.local_id) || '')}</span>` : ''}
        ${rot ? `<span>${rot}: <i class="hj"></i></span>` : ''}
        ${semCadastro ? '<span class="sc">sem serviço cadastrado — escreva os serviços</span>' : ''}</td></tr>` +
      (semCadastro ? Array.from({ length: LINHAS_VAZIAS }, () => `<tr><td>${linha}</td><td>${linha}</td>
          <td class="f">${medido ? linha : ''}</td><td class="f dt">____/____/______</td>
          <td class="f c">${quad}</td><td class="f c">${quad}</td><td>${linha}</td></tr>`).join('') : '') +
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
      .sc{color:#A0662E;font-style:italic}
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
