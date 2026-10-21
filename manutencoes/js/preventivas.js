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
const OS_ATRASADA_DIAS = 15;   // OS aberta há mais que isso fica com os dias em vermelho

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
  const ckAtraso = (typeof agendaChecklists === 'function' ? agendaChecklists() : [])
    .filter(a => a.status === 'atrasado' || a.status === 'nunca').length;

  const aba = (id, cls, n, rot, dica) => `
    <button type="button" class="pv-aba ${cls}${abaPrev === id ? ' ativa' : ''}" data-aba="${id}">
      <strong>${n}</strong><span><b>${rot}</b><small>${dica}</small></span></button>`;

  el.innerHTML = `
    <div class="pn-cabeca">
      <div><h1>Preventivas${grupoAtual ? ' · ' + esc(nomeGrupo(grupoAtual)) : ''}</h1>
        <p class="sub">Cada linha é uma troca: <b>A fazer</b> → abriu a OS → <b>Em andamento</b> → fechou a OS → <b>Feita</b>.</p></div>
      <button type="button" class="btn neutro" id="pv-atualizar">Atualizar</button>
    </div>
    <div class="pv-abas">
      ${aba('fazer', 'pv-a-fazer', fazer.length, 'A fazer', 'vencido ou perto, sem OS')}
      ${aba('andamento', 'pv-a-and', osAbertas.length, 'Em andamento', 'com OS aberta')}
      ${aba('feitas', 'pv-a-feita', feitas.length, 'Feitas no mês', 'OS fechada, troca registrada')}
      ${aba('semdado', 'pv-a-sem', semDado.length, 'Falta cadastrar', 'sem última troca ou horímetro')}
    </div>
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
    // Tocar no código ou no nome abre a ficha da máquina (21/10/2026).
    const maq = e => `<button type="button" class="pv-cod" data-maq="${esc(e.id)}" title="Abrir a ficha">${esc(e.codigo)}</button>
      <span class="pv-nm"><b class="pv-abre" data-maq="${esc(e.id)}">${esc(e.descricao)}</b><small>${esc(q.nome('locais', e.local_id))}${leituraDe(e) != null ? ' · agora ' + nHoras(leituraDe(e)) + ' ' + unidadeDe(e) : ''}</small></span>`;
    let html = '';

    if (abaPrev === 'fazer' || abaPrev === 'semdado') {
      const base = (abaPrev === 'fazer' ? fazer : semDado)
        .filter(({ p, c }) => (!filtroPrev.item || p.tipo_manutencao_id === filtroPrev.item) && casa(c.equipamento, nomeTipo(p.tipo_manutencao_id)));
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
        const venc = base.filter(x => x.c.status === 'VENCIDO'), perto = base.filter(x => x.c.status === 'ATENCAO');
        html = (venc.length ? `<div class="pv-grupo">Vencidas · ${venc.length}</div>` + venc.map(linha).join('') : '')
             + (perto.length ? `<div class="pv-grupo">Perto de vencer · ${perto.length}</div>` + perto.map(linha).join('') : '');
        if (!html) html = '<div class="vazio"><p>Nada a fazer. Todas as trocas estão em dia ou já têm OS aberta.</p></div>';
      } else {
        html = base.map(linha).join('') || '<div class="vazio"><p>Todos os itens têm última troca lançada.</p></div>';
      }
    } else if (abaPrev === 'andamento') {
      html = osAbertas.filter(o => {
        const e = q.por_id('equipamentos', o.equipamento_id);
        const its = itensDaOS(o.id);
        return (!filtroPrev.item || its.some(i => i.tipo_manutencao_id === filtroPrev.item)) && casa(e, resumoOS(o));
      }).map(o => {
        const e = q.por_id('equipamentos', o.equipamento_id) || { codigo: '—', descricao: '' };
        const d = diasDesde(o.data_emissao);
        return `<div class="pv-linha pv-b">${maq(e)}
          <span class="pv-item">${esc(resumoOS(o))}</span>
          <span class="pv-sit"><b class="pv-os">OS ${esc(numeroOS(o))}</b><small>aberta ${esc(dataCurta(o.data_emissao))}
            · <em class="${d > OS_ATRASADA_DIAS ? 'pv-atraso' : ''}">${d == null ? '' : d === 0 ? 'hoje' : d + (d === 1 ? ' dia' : ' dias')}</em></small></span>
          <span class="pv-acao"><button type="button" class="btn neutro" data-os="${esc(o.id)}">Ver OS</button>
            <button type="button" class="btn pv-fechar" data-fechar="${esc(o.id)}">✓ Fechar OS</button></span>
        </div>`;
      }).join('') || '<div class="vazio"><p>Nenhuma OS preventiva aberta.</p></div>';
    } else {
      html = feitas.filter(m => (!filtroPrev.item || m.tipo_manutencao_id === filtroPrev.item)
          && casa(q.por_id('equipamentos', m.equipamento_id), nomeTipo(m.tipo_manutencao_id)))
        .map(m => {
          const e = q.por_id('equipamentos', m.equipamento_id);
          const os = m.os_id ? q.por_id('ordens_servico', m.os_id) : null;
          return `<div class="pv-linha pv-g">${maq(e)}
            <span class="pv-item">${esc(nomeTipo(m.tipo_manutencao_id))}</span>
            <span class="pv-sit"><b>Feita em ${esc(formatarData(m.data_manutencao))}</b><small>${m.leitura != null ? nHoras(m.leitura) + ' ' + unidadeDe(e) + ' · ' : ''}${esc(m.observacao || '')}</small></span>
            <span class="pv-acao">${os ? `<button type="button" class="btn neutro" data-os="${esc(os.id)}">OS ${esc(numeroOS(os))}</button>` : ''}</span>
          </div>`;
        }).join('') || '<div class="vazio"><p>Nenhuma troca registrada neste mês ainda.</p></div>';
    }

    $('#pv-lista').innerHTML = `<div class="pv-lista">${html}</div>`;
    $$('#pv-lista [data-abrir]').forEach(x => x.onclick = async () => {
      await abrirOSPreventiva(x.dataset.abrir);
      if (document.querySelector('#pv-lista')) TELAS.painel(el);
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
  const ck = $('#pv-ck'); if (ck) ck.onclick = () => { abaChecklist = 'agenda'; irPara('checklist'); };
  $('#pv-atualizar').onclick = async () => {
    if (!App.online) return aviso('Sem internet: a tela mostra o que está guardado neste aparelho.', true);
    aviso('Atualizando…');
    await baixarBase();
    irPara('painel');
  };
  desenhar();
};
