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
      <button type="button" class="btn neutro" id="pv-atualizar">Atualizar</button></span>
    </div>
    <div class="pv-abas">
      ${aba('fazer', 'pv-a-fazer', fazer.length, 'A fazer', 'vencido ou perto, sem OS')}
      ${aba('andamento', 'pv-a-and', osAbertas.length, 'Em andamento', 'com OS aberta')}
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
        const linhaMaq = m => `<div class="pv-linha pv-maq ${m.vencida ? 'pv-r' : 'pv-y'}">${maq(m.e)}
          <span class="pv-itens">${m.itens.map(({ p, c }) => `<span class="pv-subitem ${c.status === 'VENCIDO' ? 'pv-r' : 'pv-y'}">
            <span class="pv-item">${esc(nomeTipo(p.tipo_manutencao_id))}${ultimaTxt(p, c.equipamento)}</span>
            <span class="pv-sit"><b>${esc(textoSituacao(c))}</b><i class="pv-barra"><i style="width:${usoDoIntervalo(p, c)}%"></i></i></span>
          </span>`).join('')}</span>
          <span class="pv-acao"><button type="button" class="btn" data-abrir-maq="${esc(m.itens.map(x => x.p.id).join(','))}">Abrir OS${m.itens.length > 1 ? ' (' + m.itens.length + ' itens)' : ''}</button></span>
        </div>`;
        const venc = maqs.filter(m => m.vencida), perto = maqs.filter(m => !m.vencida);
        html = (venc.length ? `<div class="pv-grupo">Com troca vencida · ${venc.length} máquina(s)</div>` + venc.map(linhaMaq).join('') : '')
             + (perto.length ? `<div class="pv-grupo">Perto de vencer · ${perto.length} máquina(s)</div>` + perto.map(linhaMaq).join('') : '');
        if (!html) html = vazio('Nada a fazer: as trocas estão em dia ou já têm OS aberta');
      } else {
        html = base.map(linha).join('') || vazio('Todos os itens têm a troca lançada');
      }
    } else if (abaPrev === 'andamento') {
      html = F.andamento.map(o => {
        const e = q.por_id('equipamentos', o.equipamento_id) || { codigo: '—', descricao: '' };
        const d = diasDesde(o.data_emissao);
        return `<div class="pv-linha pv-b">${maq(e)}
          <span class="pv-item">${esc(resumoOS(o))}</span>
          <span class="pv-sit"><b class="pv-os">OS ${esc(numeroOS(o))}</b><small>aberta ${esc(dataCurta(o.data_emissao))}
            · <em class="${d > OS_ATRASADA_DIAS ? 'pv-atraso' : ''}">${d == null ? '' : d === 0 ? 'hoje' : d + (d === 1 ? ' dia' : ' dias')}</em></small></span>
          <span class="pv-acao"><button type="button" class="btn neutro" data-os="${esc(o.id)}">Ver OS</button>
            <button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}">✓ Fechar OS</button></span>
        </div>`;
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
      aviso(`OS ${numeroOS(os)} aberta para o ${e ? e.codigo : ''} com ${ids.length} ${ids.length === 1 ? 'item' : 'itens'}.`);
      TELAS.painel(el);
      if (os) abrirOS(os.id);
    });
    $$('#pv-lista [data-os]').forEach(x => x.onclick = () => abrirOS(x.dataset.os));
    $$('#pv-lista [data-fechar]').forEach(x => x.onclick = () => {
      const os = q.por_id('ordens_servico', x.dataset.fechar);
      if (os) formFeita(os);
    });
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
  $('#pv-atualizar').onclick = async () => {
    if (!App.online) return aviso('Sem internet: a tela mostra o que está guardado neste aparelho.', true);
    aviso('Atualizando…');
    await baixarBase();
    irPara('painel');
  };
  desenhar();
};

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
