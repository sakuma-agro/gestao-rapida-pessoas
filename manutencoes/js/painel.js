/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — PAINEL (09/10/2026)

   No modelo dos painéis da área Pessoas: cartões no alto (cada um leva à
   tela já filtrada), a lista do que precisa de ação, e o mesmo retrato
   recortado por fazenda. O painel aponta; a outra tela resolve.
   ===================================================================== */

function dadosDoPainel() {
  const planos = q.ativos('planos_manutencao')
    .map(p => ({ p, c: calcular(p) }))
    .filter(x => x.c.equipamento && x.c.equipamento.ativo !== false
      && !['VENDIDO', 'BAIXADO'].includes(x.c.equipamento.status));
  const osAbertas = q.todos('ordens_servico').filter(o => ABERTAS.includes(o.status));
  const agenda = (typeof agendaChecklists === 'function') ? agendaChecklists() : [];
  return { planos, osAbertas, agenda };
}

const diasDesde = d => d ? Math.max(0, diasEntre(String(d).slice(0, 10), hoje())) : null;

TELAS.painel = el => {
  const { planos, osAbertas, agenda } = dadosDoPainel();
  const conta = s => planos.filter(x => x.c.status === s).length;
  const ckAtraso = agenda.filter(a => a.status === 'atrasado' || a.status === 'nunca');
  const ckSemana = agenda.filter(a => a.status === 'hoje' || a.status === 'semana');
  const preventivas = osAbertas.filter(o => o.tipo !== 'CORRETIVA').length;

  const cartao = (cls, rot, n, dica, ir) => `
    <button type="button" class="pn-card ${cls}${n ? '' : ' pn-zero'}" data-ir="${ir}">
      <span>${esc(rot)}</span><strong>${n}</strong><small>${n ? esc(dica) : 'nada aqui'}</small>
    </button>`;

  const urgentes = planos.filter(x => ['VENCIDO', 'ATENCAO'].includes(x.c.status))
    .sort((a, b) => (a.c.status === b.c.status ? porCodigo(a.c.equipamento, b.c.equipamento) : a.c.status === 'VENCIDO' ? -1 : 1));

  const fazendas = q.ordenado('locais').map(l => {
    const pl = planos.filter(x => x.c.equipamento.local_id === l.id);
    const maqs = new Set(q.ativos('equipamentos').filter(e => e.local_id === l.id && !['VENDIDO', 'BAIXADO'].includes(e.status)).map(e => e.id));
    return {
      l, maquinas: maqs.size,
      vencido: pl.filter(x => x.c.status === 'VENCIDO').length,
      atencao: pl.filter(x => x.c.status === 'ATENCAO').length,
      semdado: pl.filter(x => x.c.status === 'SEM_DADO').length,
      os: osAbertas.filter(o => o.local_id === l.id).length,
      ck: ckAtraso.filter(a => a.e.local_id === l.id).length,
    };
  }).filter(f => f.maquinas || f.os);

  const n = v => v ? `<b>${v}</b>` : '<span class="pn-tr">—</span>';

  el.innerHTML = `
    <div class="pn-cabeca">
      <div><h1>Painel</h1>
        <p class="sub">Como está a manutenção hoje. Toque num cartão para abrir a lista já filtrada.</p></div>
      <button type="button" class="btn neutro" id="pn-atualizar">Atualizar</button>
    </div>

    <div class="pn-cards">
      ${cartao('pn-vencido', 'Trocas vencidas', conta('VENCIDO'), 'passaram da hora ou da data', 'venc:VENCIDO')}
      ${cartao('pn-atencao', 'Perto de vencer', conta('ATENCAO'), 'dentro da margem de segurança', 'venc:pendentes')}
      ${cartao('pn-osc', 'OS abertas', osAbertas.length, `${preventivas} preventiva(s) · ${osAbertas.length - preventivas} corretiva(s)`, 'os')}
      ${cartao('pn-ck', 'Check list atrasado', ckAtraso.length, ckSemana.length ? `+ ${ckSemana.length} vencem esta semana` : 'máquinas sem check list em dia', 'ck')}
      ${cartao('pn-ok', 'Trocas em dia', conta('OK'), conta('SEM_DADO') ? `+ ${conta('SEM_DADO')} sem última troca` : 'tudo dentro do prazo', 'venc:todos')}
    </div>

    <section class="pn-bloco">
      <h2>Precisa de ação</h2>
      ${urgentes.length ? `<div class="rolagem"><table class="tabela pn-tab"><thead><tr>
          <th>Máquina</th><th>Item</th><th>Fazenda</th><th>Situação</th><th>Próxima</th><th></th>
        </tr></thead><tbody>${urgentes.slice(0, 20).map(({ p, c }) => {
          const e = c.equipamento, os = osAbertaDoPlano(p);
          return `<tr class="st-${c.status.toLowerCase()}">
            <td><span class="codigo">${esc(e.codigo)}</span><small>${esc(e.descricao)}</small></td>
            <td><strong>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</strong></td>
            <td>${esc(q.nome('locais', e.local_id))}</td>
            <td>${etq(c.status)}<small>${esc(c.motivo)}</small></td>
            <td>${proximaTroca(c)}</td>
            <td class="vc-acao">${os
              ? `<button type="button" class="btn neutro" data-os="${esc(os.id)}">OS ${esc(numeroOS(os))}</button>`
              : `<button type="button" class="btn" data-abrir="${esc(p.id)}">Abrir OS</button>`}</td>
          </tr>`; }).join('')}</tbody></table></div>
        ${urgentes.length > 20 ? `<p class="sub pn-mais"><button type="button" class="btn-fantasma" data-ir="venc:pendentes">Ver os ${urgentes.length} em Vencimentos →</button></p>` : ''}`
      : '<div class="vazio"><p>Nenhuma troca vencida ou perto de vencer. Tudo em ordem.</p></div>'}
    </section>

    <div class="pn-duas">
      <section class="pn-bloco">
        <h2>Por fazenda</h2>
        ${fazendas.length ? `<div class="rolagem"><table class="tabela pn-tab pn-num"><thead><tr>
            <th>Fazenda</th><th>Máquinas</th><th>Vencidas</th><th>Perto</th><th>Sem última troca</th><th>OS abertas</th><th>Check list atrasado</th>
          </tr></thead><tbody>${fazendas.map(f => `<tr>
            <td><button type="button" class="pn-link" data-local="${esc(f.l.id)}">${esc(f.l.nome)}</button></td>
            <td>${f.maquinas}</td>
            <td class="${f.vencido ? 'pn-c-vencido' : ''}">${n(f.vencido)}</td>
            <td class="${f.atencao ? 'pn-c-atencao' : ''}">${n(f.atencao)}</td>
            <td>${n(f.semdado)}</td><td>${n(f.os)}</td>
            <td class="${f.ck ? 'pn-c-vencido' : ''}">${n(f.ck)}</td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio"><p>Nenhuma máquina nas fazendas que você enxerga.</p></div>'}
      </section>

      <section class="pn-bloco">
        <h2>OS abertas</h2>
        ${osAbertas.length ? `<ul class="lista pn-lista">${osAbertas
          .sort((a, b) => String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')))
          .slice(0, 8).map(o => {
            const e = q.por_id('equipamentos', o.equipamento_id) || {};
            const d = diasDesde(o.data_emissao);
            return `<li><button type="button" class="pn-os" data-os="${esc(o.id)}">
              <span class="codigo">${esc(e.codigo || '—')}</span>
              <span class="pn-os-txt"><b>OS ${esc(numeroOS(o))} · ${o.tipo === 'CORRETIVA' ? 'corretiva' : 'preventiva'}</b>
                <small>${esc(resumoOS(o))}</small></span>
              <span class="pn-dias${d > 7 ? ' pn-c-vencido' : ''}">${d == null ? '' : d === 0 ? 'hoje' : d + ' dia(s)'}</span>
            </button></li>`; }).join('')}</ul>
          ${osAbertas.length > 8 ? `<p class="sub pn-mais"><button type="button" class="btn-fantasma" data-ir="os">Ver todas as ${osAbertas.length} →</button></p>` : ''}`
        : '<div class="vazio"><p>Nenhuma OS aberta.</p></div>'}
      </section>
    </div>`;

  // cartões e links levam às telas já filtradas
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
    const [tela, filtro] = b.dataset.ir.split(':');
    if (tela === 'venc') { filtroVenc.sit = filtro; filtroVenc.local = ''; filtroVenc.busca = ''; filtroVenc.item = ''; irPara('vencimentos'); }
    else if (tela === 'os') { filtroOS.aba = 'abertas'; irPara('ordens'); }
    else if (tela === 'ck') { abaChecklist = 'agenda'; irPara('checklist'); }
  });
  el.querySelectorAll('[data-local]').forEach(b => b.onclick = () => {
    filtroVenc = { busca: '', sit: 'todos', local: b.dataset.local, item: '' };
    irPara('vencimentos');
  });
  el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = async () => {
    await abrirOSPreventiva(b.dataset.abrir);
    if (el.querySelector('.pn-cards')) TELAS.painel(el);   // o cartão e a lista já contam a OS nova
  });
  el.querySelectorAll('[data-os]').forEach(b => b.onclick = () => abrirOS(b.dataset.os));
  el.querySelector('#pn-atualizar').onclick = async () => {
    if (!App.online) return aviso('Sem internet: o painel mostra o que está guardado neste aparelho.', true);
    aviso('Atualizando…');
    await baixarBase();
    irPara('painel');
  };
};
