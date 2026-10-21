/* =====================================================================
   LOP - Gestão Rápida · Manutenções — HORÍMETROS LANÇADOS (21/10/2026)

   Pedido do Guilherme: o que entra pelo "+ Hora máquina" (DP › Lançar
   jornada e Preventivas) tem de aparecer em Máquinas e Patrimônio.
   Esta tela lista as leituras de horímetro/km do período — de qualquer
   origem (Hora máquina, lançamento manual, Realtec, OS, check list) — e,
   embaixo, quanto cada implemento somou no período.
   As leituras não ficam guardadas no aparelho: a tela lê do servidor.
   ===================================================================== */

let filtroHL = null;

const ORIGEM_HL = {
  HORA: 'Hora máquina', MANUAL: 'Lançamento manual', IMPORTACAO: 'Realtec',
  ORDEM_SERVICO: 'OS', CHECKLIST: 'Check list', CARGA_INICIAL: 'Carga inicial', MANUTENCAO: 'Manutenção',
};

/* "Hora máquina · José · 11.052,0 → 11.060,5 h (8,5) · impl. I.101, I.102 · boletim 1234" */
function lerObsHora(obs) {
  const partes = String(obs || '').split(' · ');
  const r = { operador: '', inicio: null, fim: null, impl: '', boletim: '' };
  for (const p of partes.slice(1)) {
    const m = p.match(/^([\d.,]+)\s*→\s*([\d.,]+)/);
    if (m) { r.inicio = num(m[1]); r.fim = num(m[2]); }
    else if (p.startsWith('impl. ')) r.impl = p.slice(6);
    else if (p.startsWith('boletim ')) r.boletim = p.slice(8);
    else if (!r.operador && r.inicio == null) r.operador = p;
  }
  return r;
}

TELAS.horimetros = async el => {
  document.body.classList.remove('modo-quadro');
  if (!filtroHL) filtroHL = { de: somarDias(hoje(), -30), ate: hoje(), local: '', maq: '', origem: '' };
  const maquinas = q.ativos('equipamentos')
    .filter(e => ['HORIMETRO', 'HODOMETRO'].includes(e.unidade_controle) && noGrupo(e))
    .sort(porCodigo);

  el.innerHTML = `
    <div class="pn-cabeca">
      <div><h1>Horímetros lançados</h1>
        <p class="sub">Cada leitura de horímetro ou km das máquinas, de onde veio e quanto a máquina trabalhou. Embaixo, as horas que cada implemento somou.</p></div>
      <span class="pv-cab-acoes"><button type="button" class="btn oculto" id="hl-hm">+ Hora máquina</button></span>
    </div>
    <div class="filtros">
      <label class="hl-per">De <input type="date" id="hl-de" value="${esc(filtroHL.de)}"></label>
      <label class="hl-per">até <input type="date" id="hl-ate" value="${esc(filtroHL.ate)}"></label>
      <select id="hl-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
      <select id="hl-maq"><option value="">Todas as máquinas</option>
        ${maquinas.map(e => `<option value="${esc(e.id)}">${esc(e.codigo)} — ${esc(e.descricao)}</option>`).join('')}</select>
      <select id="hl-origem"><option value="">Todas as origens</option>
        ${Object.entries(ORIGEM_HL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
    </div>
    <div id="hl-lista"><p class="sub">Carregando…</p></div>`;
  $('#hl-local').value = filtroHL.local; $('#hl-maq').value = filtroHL.maq; $('#hl-origem').value = filtroHL.origem;

  const bhm = $('#hl-hm');
  if (window.HoraMaquina && App.sb) HoraMaquina.disponivel(App.sb).then(ok => {
    bhm.classList.toggle('oculto', !ok);
    bhm.onclick = () => HoraMaquina.abrir({ cliente: App.sb, aoSalvar: () => { if ($('#hl-lista')) carregar(); } });
  });

  async function carregar() {
    filtroHL = { de: $('#hl-de').value, ate: $('#hl-ate').value, local: $('#hl-local').value, maq: $('#hl-maq').value, origem: $('#hl-origem').value };
    const alvo = $('#hl-lista');
    if (!App.online || !App.sb) { alvo.innerHTML = '<div class="pv-alerta pv-alerta-forte"><b>Sem internet.</b><span>Os horímetros lançados são lidos do servidor. Abra de novo quando a conexão voltar.</span></div>'; return; }
    if (!filtroHL.de || !filtroHL.ate || filtroHL.de > filtroHL.ate) { alvo.innerHTML = '<div class="pv-alerta"><b>Confira o período.</b></div>'; return; }
    alvo.innerHTML = '<p class="sub">Carregando…</p>';
    const ids = maquinas.filter(e => (!filtroHL.local || e.local_id === filtroHL.local) && (!filtroHL.maq || e.id === filtroHL.maq)).map(e => e.id);
    if (!ids.length) { alvo.innerHTML = '<div class="pv-alerta"><b>Nenhuma máquina com horímetro nesse recorte.</b></div>'; return; }

    // um dia antes do período, para saber a leitura anterior da primeira do período
    const [rl, ru] = await Promise.all([
      App.sb.from('leituras').select('id,equipamento_id,data_leitura,valor,origem,observacao,registrado_em')
        .in('equipamento_id', ids).gte('data_leitura', somarDias(filtroHL.de, -60)).lte('data_leitura', filtroHL.ate)
        .is('substituida_por', null).order('data_leitura').order('registrado_em').limit(5000),
      App.sb.from('usos_implemento').select('implemento_id,equipamento_pai_id,data_uso,quantidade,documento,unidade')
        .in('equipamento_pai_id', ids).gte('data_uso', filtroHL.de).lte('data_uso', filtroHL.ate).limit(10000),
    ]);
    if (rl.error || ru.error) { alvo.innerHTML = `<div class="pv-alerta pv-alerta-forte"><b>Não consegui ler.</b><span>${esc((rl.error || ru.error).message)}</span></div>`; return; }

    // horas de cada leitura = valor − leitura anterior da mesma máquina
    const anterior = new Map(); const linhas = [];
    for (const l of rl.data || []) {
      const hora = String(l.observacao || '').startsWith('Hora máquina');
      const o = hora ? lerObsHora(l.observacao) : null;
      const ant = anterior.get(l.equipamento_id);
      const inicio = o && o.inicio != null ? o.inicio : ant != null ? ant : null;
      anterior.set(l.equipamento_id, Number(l.valor));
      if (l.data_leitura < filtroHL.de) continue;
      const origem = hora ? 'HORA' : l.origem;
      if (filtroHL.origem && filtroHL.origem !== origem) continue;
      linhas.push({ l, o, origem, inicio, fim: Number(l.valor), horas: inicio != null ? Number(l.valor) - inicio : null });
    }
    linhas.reverse();   // mais recente primeiro

    const totMaq = new Map();
    linhas.forEach(x => { if (x.horas != null && x.horas >= 0) totMaq.set(x.l.equipamento_id, (totMaq.get(x.l.equipamento_id) || 0) + x.horas); });
    const totImp = new Map();
    (ru.data || []).forEach(u => {
      const t = totImp.get(u.implemento_id) || { horas: 0, vezes: 0, hora: 0, unidade: u.unidade };
      t.horas += Number(u.quantidade) || 0; t.vezes++; if (String(u.documento).startsWith('HORA-MAQUINA')) t.hora++;
      totImp.set(u.implemento_id, t);
    });
    const bem = id => q.por_id('equipamentos', id) || { codigo: '—', descricao: '' };

    alvo.innerHTML = `
      <section class="pn-bloco"><h2>Leituras no período · ${linhas.length}</h2>
      ${linhas.length ? `<div class="rolagem"><table class="tabela hl-tab"><thead><tr>
          <th>Data</th><th>Máquina</th><th>Inicial</th><th>Final</th><th>Trabalhou</th><th>Implementos</th><th>Operador</th><th>Boletim</th><th>Origem</th>
        </tr></thead><tbody>${linhas.map(x => {
          const e = bem(x.l.equipamento_id), u = unidadeDe(e);
          return `<tr>
            <td>${esc(formatarData(x.l.data_leitura))}</td>
            <td><button type="button" class="pv-link-maq" data-maq="${esc(e.id)}"><b>${esc(e.codigo)}</b></button><small>${esc(e.descricao)}</small></td>
            <td class="num">${x.inicio != null ? nHoras(x.inicio) : '—'}</td>
            <td class="num"><b>${nHoras(x.fim)}</b></td>
            <td class="num">${x.horas == null ? '—' : x.horas < 0 ? '<span class="pv-atraso">' + nHoras(x.horas) + '</span>' : nHoras(x.horas) + ' ' + u}</td>
            <td>${esc(x.o ? x.o.impl : '') || '—'}</td>
            <td>${esc(x.o ? x.o.operador : '') || '—'}</td>
            <td>${esc(x.o ? x.o.boletim : '') || '—'}</td>
            <td><span class="hl-origem hl-o-${x.origem.toLowerCase()}">${esc(ORIGEM_HL[x.origem] || x.origem)}</span></td>
          </tr>`; }).join('')}</tbody></table></div>`
        : '<div class="pv-alerta"><b>Nenhum horímetro lançado nesse período.</b></div>'}
      </section>

      <div class="pn-duas">
        <section class="pn-bloco"><h2>Total por máquina</h2>
        ${totMaq.size ? `<table class="tabela pn-num"><thead><tr><th>Máquina</th><th>Trabalhou no período</th></tr></thead><tbody>
          ${[...totMaq.entries()].sort((a, b) => porCodigo(bem(a[0]), bem(b[0]))).map(([id, h]) =>
            `<tr><td><b>${esc(bem(id).codigo)}</b> <small>${esc(bem(id).descricao)}</small></td><td>${nHoras(h)} ${unidadeDe(bem(id))}</td></tr>`).join('')}
          </tbody></table>` : '<p class="sub">—</p>'}
        </section>
        <section class="pn-bloco"><h2>Implementos — horas somadas</h2>
        ${totImp.size ? `<table class="tabela pn-num"><thead><tr><th>Implemento</th><th>Somou</th><th>Usos</th></tr></thead><tbody>
          ${[...totImp.entries()].sort((a, b) => porCodigo(bem(a[0]), bem(b[0]))).map(([id, t]) =>
            `<tr><td><b>${esc(bem(id).codigo)}</b> <small>${esc(bem(id).descricao)}</small></td><td>${nHoras(t.horas)} ${t.unidade === 'HODOMETRO' ? 'km' : 'h'}</td>
              <td>${t.vezes}${t.hora ? ` <small>(${t.hora} pelo + Hora máquina)</small>` : ''}</td></tr>`).join('')}
          </tbody></table>` : '<p class="sub">Nenhum implemento usado no período.</p>'}
        </section>
      </div>`;
    alvo.querySelectorAll('[data-maq]').forEach(b => b.onclick = () => fichaMaquina(b.dataset.maq));
  }

  ['hl-de', 'hl-ate', 'hl-local', 'hl-maq', 'hl-origem'].forEach(id => { $('#' + id).onchange = carregar; });
  carregar();
};
