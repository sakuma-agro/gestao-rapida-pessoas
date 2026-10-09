/* =====================================================================
   Gestão Rápida · Manutenções — MÁQUINAS
   Cadastro da máquina e, dentro dela, os itens de manutenção que ela
   controla: a cada quantas horas (ou km) e/ou dias, e o que usa — tipo de
   óleo, litragem, número do filtro. É daqui que o painel de vencimentos
   faz a conta e é isso que sai impresso na OS.
   ===================================================================== */

const ehAdmin = () => !!(window.Acesso && Acesso.admin);

/* Colunas que o banco calcula sozinho e recusa no envio */
function limparBem(reg) {
  const r = Object.assign({}, reg);
  delete r.horas_acumuladas; delete r.km_acumulados;
  return r;
}

function planosDa(idMaquina) {
  return q.ativos('planos_manutencao').filter(p => p.equipamento_id === idMaquina)
    .sort((a, b) => ordemItem(a.tipo_manutencao_id) - ordemItem(b.tipo_manutencao_id));
}
function ordemItem(idTipo) {
  const t = q.por_id('tipos_manutencao', idTipo);
  return t && t.ordem ? Number(t.ordem) : 999;
}

/* A pior situação entre os itens da máquina — é a cor da linha na lista */
function piorSituacao(idMaquina) {
  const peso = { VENCIDO: 0, ATENCAO: 1, OK: 2, SEM_DADO: 3 };
  let pior = null;
  for (const p of planosDa(idMaquina)) {
    const s = calcular(p).status;
    if (pior === null || peso[s] < peso[pior]) pior = s;
  }
  return pior;
}

/* ---------------------------------------------------------------- lista */

let filtroMaq = { busca: '', local: '', tipo: '' };

TELAS.maquinas = el => {
  el.innerHTML = `
    <h1>Máquinas</h1>
    <p class="sub">Cadastro das máquinas e dos itens de manutenção de cada uma — a cada quantas
       horas ou dias, e qual óleo e filtro ela usa.</p>
    <div class="acoes">
      ${ehAdmin() ? '<button type="button" class="btn" id="mq-nova">Cadastrar máquina</button>' : ''}
      ${ehAdmin() ? '<button type="button" class="btn neutro" id="mq-importar">Importar horímetros (Realtec)</button>' : ''}
      ${ehAdmin() ? '<button type="button" class="btn-fantasma" id="mq-itens">Lista de itens de manutenção</button>' : ''}
    </div>
    <div class="filtros">
      <input type="search" id="mq-busca" placeholder="Buscar por código ou descrição" value="${esc(filtroMaq.busca)}">
      <select id="mq-local"><option value="">Todos os locais</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}"${l.id === filtroMaq.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}
      </select>
      <select id="mq-tipo"><option value="">Todos os tipos</option>
        ${q.ordenado('tipos_equipamento').map(t => `<option value="${esc(t.id)}"${t.id === filtroMaq.tipo ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}
      </select>
    </div>
    <div id="mq-lista"></div>`;

  const desenhar = () => {
    filtroMaq = { busca: $('#mq-busca').value, local: $('#mq-local').value, tipo: $('#mq-tipo').value };
    const b = filtroMaq.busca.toLowerCase();
    const lista = q.ativos('equipamentos').filter(e =>
      (!filtroMaq.local || e.local_id === filtroMaq.local) &&
      (!filtroMaq.tipo || e.tipo_equipamento_id === filtroMaq.tipo) &&
      (!b || (e.codigo + ' ' + e.descricao).toLowerCase().includes(b))
    ).sort(porCodigo);

    $('#mq-lista').innerHTML = lista.length === 0
      ? '<div class="vazio"><p>Nenhuma máquina com esses filtros.</p></div>'
      : `<p class="sub">${lista.length} ${lista.length === 1 ? 'máquina' : 'máquinas'}</p>
        <table class="tabela mq-tabela"><thead><tr>
          <th>Código</th><th>Descrição</th><th>Local</th>
          <th class="num">Horímetro / km</th><th>Itens controlados</th><th></th>
        </tr></thead><tbody>` + lista.map(e => {
          const n = planosDa(e.id).length;
          const pior = piorSituacao(e.id);
          const data = e.unidade_controle === 'ACUMULADO' ? e.ultimo_uso_data : e.leitura_data;
          const leitura = e.unidade_controle === 'CALENDARIO' ? '—'
            : `${nHoras(leituraDe(e))} ${unidadeDe(e)}${data ? `<small>${formatarData(data)}</small>` : ''}`;
          return `<tr data-abrir="${esc(e.id)}">
            <td class="codigo">${esc(e.codigo)}</td>
            <td>${esc(e.descricao)}</td>
            <td>${esc(q.nome('locais', e.local_id))}</td>
            <td class="num mq-leitura">${leitura}</td>
            <td>${n === 0 ? '<span class="sub" style="margin:0">nenhum</span>'
                 : n + (n === 1 ? ' item ' : ' itens ') + (pior ? etq(pior) : '')}</td>
            <td><button type="button" class="btn-fantasma">Abrir</button></td>
          </tr>`;
        }).join('') + '</tbody></table>';

    $$('#mq-lista [data-abrir]').forEach(tr => tr.onclick = () => fichaMaquina(tr.dataset.abrir));
  };
  ['mq-busca', 'mq-local', 'mq-tipo'].forEach(id => { const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar; });
  const bn = $('#mq-nova'); if (bn) bn.onclick = () => formMaquina();
  const bi = $('#mq-importar'); if (bi) bi.onclick = telaImportarRealtec;
  const bt = $('#mq-itens'); if (bt) bt.onclick = telaItensManutencao;
  desenhar();
};

/* ---------------------------------------------------------------- ficha */

function fichaMaquina(id) {
  const e = q.por_id('equipamentos', id);
  if (!e) return;
  const u = unidadeDe(e);
  const planos = planosDa(id);
  const osAbertas = q.todos('ordens_servico').filter(o => o.equipamento_id === id && ['ABERTA', 'EM_EXECUCAO'].includes(o.status));
  const feitas = q.todos('manutencoes').filter(m => m.equipamento_id === id)
    .sort((a, b) => (b.data_manutencao || '').localeCompare(a.data_manutencao || '')).slice(0, 8);
  const corretivas = q.todos('ordens_servico').filter(o => o.equipamento_id === id && o.tipo === 'CORRETIVA' && o.status === 'CONCLUIDA')
    .sort((a, b) => (b.data_execucao || '').localeCompare(a.data_execucao || '')).slice(0, 5);

  const medido = e.unidade_controle !== 'CALENDARIO';
  const dataLeitura = e.unidade_controle === 'ACUMULADO' ? e.ultimo_uso_data : e.leitura_data;

  abrirModal(e.codigo + ' — ' + e.descricao, `
    <div class="mq-cab">
      <div><span>Local</span><b>${esc(q.nome('locais', e.local_id))}</b></div>
      <div><span>Tipo</span><b>${esc(q.nome('tipos_equipamento', e.tipo_equipamento_id))}</b></div>
      <div><span>Marca / modelo</span><b>${esc([q.nome('marcas', e.marca_id), e.modelo].filter(Boolean).join(' ') || '—')}</b></div>
      <div><span>${esc(rotuloUnidade(e.unidade_controle))}</span>
        <b>${medido ? nHoras(leituraDe(e)) + ' ' + u : '—'}</b>
        ${dataLeitura ? `<small>em ${formatarData(dataLeitura)}</small>` : ''}</div>
    </div>
    <div class="acoes">
      ${medido ? `<button type="button" class="btn" id="fm-leitura">${e.unidade_controle === 'ACUMULADO' ? 'Ajustar contador' : 'Lançar horímetro'}</button>` : ''}
      ${medido ? '<button type="button" class="btn-fantasma" id="fm-hist">Histórico de leituras</button>' : ''}
      ${ehAdmin() ? '<button type="button" class="btn neutro" id="fm-editar">Editar cadastro</button>' : ''}
      ${ehAdmin() ? '<button type="button" class="btn-fantasma" id="fm-duplicar">Duplicar</button>' : ''}
    </div>

    <h2 class="fm-titulo">Itens de manutenção
      ${ehAdmin() ? '<button type="button" class="btn" id="fm-item">+ Item</button>' : ''}</h2>
    ${planos.length === 0
      ? '<div class="vazio"><p>Nenhum item cadastrado. Ex.: Óleo e filtro de motor — a cada 500 h ou 180 dias.</p></div>'
      : `<table class="tabela"><thead><tr>
          <th>Item</th><th>A cada</th><th>O que usa</th><th>Última troca</th><th>Próxima</th><th>Situação</th>
        </tr></thead><tbody>` + planos.map(p => {
          const c = calcular(p);
          return `<tr ${ehAdmin() ? `data-plano="${esc(p.id)}" class="clicavel"` : ''}>
            <td><strong>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</strong></td>
            <td>${esc(periodicidadeTexto(p, e))}</td>
            <td class="fm-usa">${p.materiais ? esc(p.materiais) : '<span class="falta">não informado</span>'}</td>
            <td>${p.ultima_troca_data ? formatarData(p.ultima_troca_data) : '—'}
                ${p.ultima_troca_leitura != null ? '<small>' + nHoras(p.ultima_troca_leitura) + ' ' + u + '</small>' : ''}</td>
            <td>${proximaTroca(c)}</td>
            <td>${etq(c.status)}<small>${esc(c.motivo)}</small></td>
          </tr>`;
        }).join('') + '</tbody></table>'}

    ${osAbertas.length ? `<h2 class="fm-titulo">OS abertas</h2><ul class="lista">` + osAbertas.map(o => `
      <li><div class="info"><strong>OS ${o.numero ? 'nº ' + o.numero : '(aguardando envio)'}</strong>
        <small>${o.tipo === 'CORRETIVA' ? 'Corretiva' : 'Preventiva'} · aberta em ${formatarData(o.data_emissao)} · ${esc(resumoOS(o))}</small></div>
        <button type="button" class="btn-fantasma" data-os="${esc(o.id)}">Abrir</button></li>`).join('') + '</ul>' : ''}

    <h2 class="fm-titulo">Últimas manutenções feitas</h2>
    ${feitas.length + corretivas.length === 0 ? '<p class="sub">Nada registrado ainda.</p>'
      : '<ul class="lista">' + feitas.map(m => `<li><div class="info">
          <strong>${esc(q.nome('tipos_manutencao', m.tipo_manutencao_id))}</strong>
          <small>${formatarData(m.data_manutencao)}${m.leitura != null ? ' · ' + nHoras(m.leitura) + ' ' + u : ''}${m.observacao ? ' · ' + esc(m.observacao) : ''}</small></div>
          <span class="etq ok">preventiva</span></li>`).join('')
        + corretivas.map(o => `<li><div class="info"><strong>${esc(o.descricao || 'Corretiva')}</strong>
          <small>${formatarData(o.data_execucao)}${o.observacao ? ' · ' + esc(o.observacao) : ''}</small></div>
          <span class="etq vencido">corretiva</span></li>`).join('') + '</ul>'}
  `, corpo => {
    const bl = corpo.querySelector('#fm-leitura');
    if (bl) bl.onclick = () => {
      const voltar = () => { irPara('maquinas'); fichaMaquina(id); };
      if (e.unidade_controle === 'ACUMULADO') formAjusteContador(e); else formLeitura(e, voltar);
    };
    const bh = corpo.querySelector('#fm-hist'); if (bh) bh.onclick = () => historicoLeituras(id);
    const be = corpo.querySelector('#fm-editar'); if (be) be.onclick = () => formMaquina(e);
    const bd = corpo.querySelector('#fm-duplicar'); if (bd) bd.onclick = () => formMaquina(null, e);
    const bi = corpo.querySelector('#fm-item'); if (bi) bi.onclick = () => formItem(e);
    corpo.querySelectorAll('[data-plano]').forEach(tr =>
      tr.onclick = () => formItem(e, q.por_id('planos_manutencao', tr.dataset.plano)));
    corpo.querySelectorAll('[data-os]').forEach(b => b.onclick = () => abrirOS(b.dataset.os));
  });
}

/* ---------------------------------------------------------------- cadastro da máquina */

/* novo: e = null · editar: e = máquina · duplicar: e = null, modelo = máquina de origem.
   Duplicar herda os itens de manutenção (com o que usa), sem a última troca —
   a frota tem vários modelos repetidos. */
function formMaquina(e, modelo) {
  const novo = !e;
  const base = e || (modelo ? Object.assign({}, modelo, { id: null, codigo: '', leitura_atual: null, leitura_data: null })
                            : { unidade_controle: 'HORIMETRO', rege_preventiva: 'HORAS' });
  const titulo = novo ? (modelo ? 'Duplicar ' + modelo.codigo : 'Cadastrar máquina') : 'Editar ' + e.codigo;

  abrirModal(titulo, `
    ${modelo ? `<p class="sub">A nova máquina já nasce com os ${planosDa(modelo.id).length} itens de manutenção do ${esc(modelo.codigo)}.
       A última troca fica em branco para você preencher.</p>` : ''}
    <div class="colunas">
      ${campoTexto('Código', 'codigo', base.codigo, 'text', 'Ex.: T.01, P.28, V.04, C.06')}
      ${campoTexto('Descrição', 'descricao', base.descricao)}
      ${campoLista('Tipo', 'tipo_equipamento_id', q.ordenado('tipos_equipamento'), base.tipo_equipamento_id)}
      ${campoLista('Local', 'local_id', q.ordenado('locais'), base.local_id)}
      ${campoLista('Marca', 'marca_id', q.ordenado('marcas'), base.marca_id, '—')}
      ${campoTexto('Modelo', 'modelo', base.modelo)}
      ${campoLista('Como é medido', 'unidade_controle', [
        { id: 'HORIMETRO', nome: 'Horímetro (horas)' },
        { id: 'HODOMETRO', nome: 'Hodômetro (km)' },
        { id: 'ACUMULADO', nome: 'Implemento — horas acumuladas' },
        { id: 'CALENDARIO', nome: 'Só por data' }], base.unidade_controle, null)}
      ${novo ? campoTexto('Horímetro / km atual', 'leitura_atual', base.leitura_atual, 'number', 'Depois disso, use "Lançar horímetro"') : ''}
    </div>
    ${campoArea('Observações', 'observacoes', base.observacoes)}
    <div class="acoes">
      <button type="button" class="btn" id="fq-salvar">Salvar</button>
      <button type="button" class="btn neutro" id="fq-cancelar">Cancelar</button>
      ${!novo ? '<button type="button" class="btn-fantasma" id="fq-inativar" style="margin-left:auto">Tirar da frota</button>' : ''}
    </div>`, corpo => {
    corpo.querySelector('#fq-cancelar').onclick = () => (novo ? fecharModal() : fichaMaquina(e.id));
    corpo.querySelector('#fq-salvar').onclick = async () => {
      const d = lerForm(corpo);
      d.codigo = (d.codigo || '').toUpperCase();
      if (!d.codigo || !d.descricao) return aviso('Código e descrição são obrigatórios.', true);
      if (!d.tipo_equipamento_id) return aviso('Escolha o tipo.', true);
      if (!d.local_id) return aviso('Escolha o local.', true);
      const dup = q.todos('equipamentos').find(x => x.codigo === d.codigo && x.id !== (e && e.id));
      if (dup) return aviso('Já existe uma máquina com o código ' + d.codigo + '.', true);

      const reg = limparBem(Object.assign({}, novo ? {} : e, d, { ativo: true, atualizado_em: new Date().toISOString() }));
      if (novo) {
        reg.id = crypto.randomUUID();
        reg.leitura_atual = num(d.leitura_atual);
        reg.leitura_data = reg.leitura_atual != null ? hoje() : null;
        reg.status = 'ATIVO';
        reg.criado_por = App.usuario.id || null;
      }
      await gravar('equipamentos', reg);
      // a cópia da tela continua mostrando o acumulado do implemento
      if (!novo) { reg.horas_acumuladas = e.horas_acumuladas; reg.km_acumulados = e.km_acumulados; }

      if (modelo) {
        for (const p of planosDa(modelo.id)) {
          await gravar('planos_manutencao', {
            id: crypto.randomUUID(), equipamento_id: reg.id, tipo_manutencao_id: p.tipo_manutencao_id,
            periodicidade_horas: p.periodicidade_horas, periodicidade_dias: p.periodicidade_dias,
            margem_horas: p.margem_horas, materiais: p.materiais, ativo: true
          });
        }
      }
      aviso(App.online ? 'Máquina salva.' : 'Salva no aparelho. Sobe quando a internet voltar.');
      irPara('maquinas');
      fichaMaquina(reg.id);
    };
    const bx = corpo.querySelector('#fq-inativar');
    if (bx) bx.onclick = async () => {
      if (!confirm(`Tirar o ${e.codigo} da frota? Ele some das listas, mas o histórico fica guardado.`)) return;
      await gravar('equipamentos', limparBem(Object.assign({}, e, { ativo: false })));
      fecharModal(); irPara('maquinas'); aviso(e.codigo + ' fora da frota.');
    };
  });
}

/* ---------------------------------------------------------------- item de manutenção */

/* Ex.: Óleo e filtro de motor — a cada 500 h ou 180 dias — usa 15W40 12 L + filtro RE504836 */
function formItem(e, p) {
  const novo = !p;
  p = p || {};
  const u = unidadeDe(e);
  const jaTem = planosDa(e.id).map(x => x.tipo_manutencao_id);
  const tipos = q.ordenado('tipos_manutencao').filter(t => !novo ? true : !jaTem.includes(t.id));

  abrirModal((novo ? 'Novo item — ' : 'Item — ') + e.codigo, `
    <div class="campo"><label for="f-tipo_manutencao_id">Item de manutenção</label>
      <select id="f-tipo_manutencao_id" name="tipo_manutencao_id" ${novo ? '' : 'disabled'}>
        <option value="">— selecione —</option>
        ${tipos.map(t => `<option value="${esc(t.id)}"${t.id === p.tipo_manutencao_id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}
        ${novo ? '<option value="__novo">+ Criar um item novo…</option>' : ''}
      </select></div>
    <div class="campo oculto" id="fi-novo-campo"><label for="fi-novo">Nome do item novo</label>
      <input type="text" id="fi-novo" placeholder="Ex.: CORREIA DO ALTERNADOR"></div>

    <div class="colunas">
      ${e.unidade_controle === 'CALENDARIO' ? '' :
        campoTexto('A cada quantas ' + (u === 'km' ? 'km' : 'horas'), 'periodicidade_horas', p.periodicidade_horas, 'number', 'Ex.: 500')}
      ${campoTexto('E/ou a cada quantos dias', 'periodicidade_dias', p.periodicidade_dias, 'number', 'Ex.: 180 — o que vencer primeiro manda')}
    </div>
    ${campoArea('O que usa', 'materiais', p.materiais,
      'Tipo de óleo e litragem, número do filtro… Ex.: Óleo 15W40 — 12 L · Filtro RE504836. Sai impresso na OS.')}

    <fieldset><legend>Última troca</legend>
      <div class="colunas">
        ${campoTexto('Data', 'ultima_troca_data', p.ultima_troca_data, 'date')}
        ${e.unidade_controle === 'CALENDARIO' ? '' :
          campoTexto((u === 'km' ? 'Km' : 'Horímetro') + ' na troca', 'ultima_troca_leitura', p.ultima_troca_leitura, 'number')}
      </div>
      <p class="ajuda">É daqui que sai a conta do vencimento. Depois de cada OS concluída o app
         atualiza sozinho.</p>
    </fieldset>
    ${!novo ? campoTexto('Motivo da alteração', 'motivo', '', 'text', 'Obrigatório se mexer na última troca') : ''}

    <div class="acoes">
      <button type="button" class="btn" id="fi-salvar">Salvar</button>
      <button type="button" class="btn neutro" id="fi-cancelar">Cancelar</button>
      ${!novo ? '<button type="button" class="btn-fantasma" id="fi-remover" style="margin-left:auto">Parar de controlar</button>' : ''}
    </div>`, corpo => {
    const sel = corpo.querySelector('#f-tipo_manutencao_id');
    sel.onchange = () => corpo.querySelector('#fi-novo-campo').classList.toggle('oculto', sel.value !== '__novo');
    corpo.querySelector('#fi-cancelar').onclick = () => fichaMaquina(e.id);

    corpo.querySelector('#fi-salvar').onclick = async () => {
      const d = lerForm(corpo);
      let idTipo = novo ? sel.value : p.tipo_manutencao_id;
      if (idTipo === '__novo') {
        const nome = corpo.querySelector('#fi-novo').value.trim().toUpperCase();
        if (!nome) return aviso('Escreva o nome do item novo.', true);
        const existe = q.todos('tipos_manutencao').find(t => t.nome.toUpperCase() === nome);
        if (existe) { idTipo = existe.id; if (existe.ativo === false) { existe.ativo = true; await gravar('tipos_manutencao', existe); } }
        else {
          const maior = Math.max(0, ...q.todos('tipos_manutencao').map(t => Number(t.ordem) || 0));
          const t = await gravar('tipos_manutencao', { id: crypto.randomUUID(), nome, ordem: maior + 1, ativo: true });
          idTipo = t.id;
        }
      }
      if (!idTipo) return aviso('Escolha o item de manutenção.', true);
      const horas = num(d.periodicidade_horas), dias = num(d.periodicidade_dias);
      if (horas == null && dias == null) return aviso('Informe a cada quantas horas e/ou dias.', true);

      const ultData = d.ultima_troca_data || null, ultLeit = num(d.ultima_troca_leitura);
      const mexeuUltima = !novo && (ultData !== (p.ultima_troca_data || null) ||
                                    ultLeit !== (p.ultima_troca_leitura == null ? null : Number(p.ultima_troca_leitura)));
      if (mexeuUltima && !d.motivo) return aviso('Diga o motivo de mudar a última troca.', true);
      // A correção fica auditada no servidor — por isso esta mudança pede internet.
      if (mexeuUltima && !App.online) return aviso('Mudar a última troca precisa de internet (fica registrado quem mudou e por quê).', true);

      // Item que já foi controlado e desligado volta a valer, sem duplicar
      const antigo = novo ? q.todos('planos_manutencao').find(x => x.equipamento_id === e.id && x.tipo_manutencao_id === idTipo) : null;
      const reg = Object.assign({}, antigo || p, {
        id: (antigo || p).id || crypto.randomUUID(), equipamento_id: e.id, tipo_manutencao_id: idTipo,
        periodicidade_horas: horas, periodicidade_dias: dias == null ? null : Math.round(dias),
        materiais: d.materiais || null, ultima_troca_data: ultData, ultima_troca_leitura: ultLeit, ativo: true
      });
      await gravar('planos_manutencao', reg);

      if (mexeuUltima) {
        // Corrigir a última troca estraga o painel inteiro se feito errado: fica auditado.
        const { error } = await App.sb.from('auditoria').insert({
          tabela: 'planos_manutencao', registro_id: reg.id, operacao: 'CORRECAO_ULTIMA_TROCA',
          valor_antigo: { data: p.ultima_troca_data || null, leitura: p.ultima_troca_leitura ?? null },
          valor_novo: { data: ultData, leitura: ultLeit }, motivo: d.motivo,
          criado_por: App.usuario.id || null
        });
        if (error) console.warn('auditoria não gravou:', error.message);
      }
      aviso('Item salvo.');
      fichaMaquina(e.id);
    };

    const br = corpo.querySelector('#fi-remover');
    if (br) br.onclick = async () => {
      if (!confirm('Parar de controlar este item nesta máquina? O histórico fica guardado.')) return;
      await gravar('planos_manutencao', Object.assign({}, p, { ativo: false }));
      fichaMaquina(e.id);
    };
  });
}

/* ---------------------------------------------------------------- lista de itens */

/* Nomes dos itens (Óleo e filtro motor, Filtro de ar…) e a ordem das colunas */
function telaItensManutencao() {
  const desenhar = () => {
    const tipos = q.todos('tipos_manutencao').slice().sort((a, b) => (Number(a.ordem) || 999) - (Number(b.ordem) || 999));
    abrirModal('Itens de manutenção', `
      <p class="sub">A lista de itens que as máquinas podem controlar. A periodicidade e o que
         cada máquina usa ficam dentro da máquina.</p>
      <ul class="lista">${tipos.map(t => {
        const n = q.ativos('planos_manutencao').filter(p => p.tipo_manutencao_id === t.id).length;
        return `<li><div class="info"><strong>${esc(t.nome)}</strong>
          <small>${n} ${n === 1 ? 'máquina' : 'máquinas'}${t.ativo === false ? ' · desativado' : ''}</small></div>
          <button type="button" class="btn-fantasma" data-ren="${esc(t.id)}">Renomear</button>
          <button type="button" class="btn-fantasma" data-at="${esc(t.id)}">${t.ativo === false ? 'Reativar' : 'Desativar'}</button></li>`;
      }).join('')}</ul>
      <div class="acoes"><button type="button" class="btn" id="ti-novo">+ Item novo</button></div>`, corpo => {
      corpo.querySelector('#ti-novo').onclick = async () => {
        const nome = (prompt('Nome do item novo (ex.: CORREIA DO ALTERNADOR):') || '').trim().toUpperCase();
        if (!nome) return;
        if (q.todos('tipos_manutencao').some(t => t.nome.toUpperCase() === nome)) return aviso('Esse item já existe.', true);
        const maior = Math.max(0, ...q.todos('tipos_manutencao').map(t => Number(t.ordem) || 0));
        await gravar('tipos_manutencao', { id: crypto.randomUUID(), nome, ordem: maior + 1, ativo: true });
        desenhar();
      };
      corpo.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
        const t = q.por_id('tipos_manutencao', b.dataset.ren);
        const nome = (prompt('Novo nome:', t.nome) || '').trim().toUpperCase();
        if (!nome || nome === t.nome) return;
        t.nome = nome; await gravar('tipos_manutencao', t); desenhar();
      });
      corpo.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
        const t = q.por_id('tipos_manutencao', b.dataset.at);
        t.ativo = t.ativo === false; await gravar('tipos_manutencao', t); desenhar();
      });
    });
  };
  desenhar();
}

Object.assign(window, { fichaMaquina, formMaquina, formItem, planosDa, limparBem, ehAdmin });
