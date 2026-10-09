/* =====================================================================
   Gestão Rápida · Manutenções — VENCIMENTOS e ORDENS DE SERVIÇO

   Dois tipos de OS:
     PREVENTIVA — nasce no painel de vencimentos (venceu por hora ou data)
     CORRETIVA  — nasce do check list (item RUIM) ou aberta na mão

   Quando a OS é registrada como feita, a data e o horímetro viram a
   "última troca" do item e o próximo vencimento é recalculado sozinho.
   ===================================================================== */

const ABERTAS = ['ABERTA', 'EM_EXECUCAO'];

function itensDaOS(idOS) { return q.todos('os_itens').filter(i => i.os_id === idOS); }

/* "Óleo e filtro motor + Filtro de ar" ou a descrição da corretiva */
function resumoOS(o) {
  if (o.tipo === 'CORRETIVA') return o.descricao || 'Corretiva';
  const nomes = itensDaOS(o.id).map(i => q.nome('tipos_manutencao', i.tipo_manutencao_id));
  return nomes.join(' + ') || o.descricao || 'Preventiva';
}

/* OS aberta que já cobre este item da máquina */
function osAbertaDoPlano(plano) {
  const it = q.todos('os_itens').find(i => i.plano_id === plano.id && !i.feito &&
    ABERTAS.includes((q.por_id('ordens_servico', i.os_id) || {}).status));
  return it ? q.por_id('ordens_servico', it.os_id) : null;
}

function numeroOS(o) { return o.numero ? 'nº ' + o.numero : '(aguardando envio)'; }

/* ================================================================ VENCIMENTOS */

let filtroVenc = { busca: '', local: '', item: '', sit: 'pendentes' };

TELAS.vencimentos = el => {
  const linhas = q.ativos('planos_manutencao')
    .map(p => ({ p, c: calcular(p) }))
    .filter(x => x.c.equipamento && x.c.equipamento.ativo !== false);

  const n = s => linhas.filter(x => x.c.status === s).length;
  const abertas = q.todos('ordens_servico').filter(o => ABERTAS.includes(o.status)).length;

  el.innerHTML = `
    <h1>Vencimentos</h1>
    <p class="sub">O que já venceu ou está perto de vencer. Toque em <strong>Abrir OS</strong>
       para mandar para a oficina.</p>
    <div class="painel" style="margin-bottom:14px">
      <div class="cartao alerta"><b>${n('VENCIDO')}</b><span>vencidos</span></div>
      <div class="cartao"><b>${n('ATENCAO')}</b><span>perto de vencer</span></div>
      <div class="cartao"><b>${abertas}</b><span>OS abertas</span></div>
      <div class="cartao"><b>${n('SEM_DADO')}</b><span>sem última troca</span></div>
    </div>
    <div class="filtros">
      <input type="search" id="vc-busca" placeholder="Buscar máquina" value="${esc(filtroVenc.busca)}">
      <select id="vc-sit">
        <option value="pendentes">Vencidos e perto de vencer</option>
        <option value="VENCIDO">Só vencidos</option>
        <option value="SEM_DADO">Sem última troca</option>
        <option value="todos">Todos</option>
      </select>
      <select id="vc-local"><option value="">Todos os locais</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
      <select id="vc-item"><option value="">Todos os itens</option>
        ${q.ordenado('tipos_manutencao').map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>
    </div>
    <div id="vc-lista"></div>`;
  $('#vc-sit').value = filtroVenc.sit; $('#vc-local').value = filtroVenc.local; $('#vc-item').value = filtroVenc.item;

  const peso = { VENCIDO: 0, ATENCAO: 1, SEM_DADO: 2, OK: 3 };
  const desenhar = () => {
    filtroVenc = { busca: $('#vc-busca').value, sit: $('#vc-sit').value, local: $('#vc-local').value, item: $('#vc-item').value };
    const b = filtroVenc.busca.toLowerCase();
    const lista = linhas.filter(({ p, c }) => {
      const e = c.equipamento;
      if (filtroVenc.sit === 'pendentes' && !['VENCIDO', 'ATENCAO'].includes(c.status)) return false;
      if (['VENCIDO', 'SEM_DADO'].includes(filtroVenc.sit) && c.status !== filtroVenc.sit) return false;
      if (filtroVenc.local && e.local_id !== filtroVenc.local) return false;
      if (filtroVenc.item && p.tipo_manutencao_id !== filtroVenc.item) return false;
      if (b && !(e.codigo + ' ' + e.descricao).toLowerCase().includes(b)) return false;
      return true;
    }).sort((x, y) => (peso[x.c.status] - peso[y.c.status]) || porCodigo(x.c.equipamento, y.c.equipamento));

    $('#vc-lista').innerHTML = lista.length === 0
      ? '<div class="vazio"><p>Nada com esses filtros. 👍</p></div>'
      : `<table class="tabela vc-tabela"><thead><tr>
          <th>Máquina</th><th>Item</th><th>O que usa</th><th>Situação</th><th>Próxima</th><th></th>
        </tr></thead><tbody>` + lista.map(({ p, c }) => {
          const e = c.equipamento;
          const os = osAbertaDoPlano(p);
          return `<tr class="st-${c.status.toLowerCase()}">
            <td><span class="codigo">${esc(e.codigo)}</span><small>${esc(e.descricao)}</small></td>
            <td><strong>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</strong>
                <small>a cada ${esc(periodicidadeTexto(p, e))}</small></td>
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

    $$('#vc-lista [data-abrir]').forEach(x => x.onclick = () => abrirOSPreventiva(x.dataset.abrir));
    $$('#vc-lista [data-os]').forEach(x => x.onclick = () => abrirOS(x.dataset.os));
    $$('#vc-lista [data-maq]').forEach(x => x.onclick = () => fichaMaquina(x.dataset.maq));
  };
  ['vc-busca', 'vc-sit', 'vc-local', 'vc-item'].forEach(id => { const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar; });
  desenhar();
};

/* Abre a OS preventiva do item. Se a máquina já tem uma preventiva aberta,
   o item entra nela — o mecânico faz tudo numa ida só. */
async function abrirOSPreventiva(idPlano, opcoes = {}) {
  const p = q.por_id('planos_manutencao', idPlano);
  const e = q.por_id('equipamentos', p.equipamento_id);
  const c = calcular(p);
  const agora = new Date().toISOString();

  let os = q.todos('ordens_servico').find(o => o.equipamento_id === e.id && o.tipo === 'PREVENTIVA' && ABERTAS.includes(o.status));
  const juntou = !!os;
  if (!os) {
    os = await gravar('ordens_servico', {
      id: crypto.randomUUID(), uuid_dispositivo: crypto.randomUUID(), tipo: 'PREVENTIVA',
      equipamento_id: e.id, local_id: e.local_id, data_emissao: hoje(), status: 'ABERTA',
      leitura_emissao: leituraDe(e), criado_em: agora, atualizado_em: agora,
      criado_por: App.usuario.id || null, fotos_execucao: []
    });
  }
  await gravar('os_itens', {
    id: crypto.randomUUID(), os_id: os.id, equipamento_id: e.id, tipo_manutencao_id: p.tipo_manutencao_id,
    plano_id: p.id, motivo: c.motivo, periodicidade_horas: p.periodicidade_horas,
    periodicidade_dias: p.periodicidade_dias, horas_restantes: c.horas_restantes, feito: false
  });
  // Vários itens marcados na planilha geram as OS de uma vez: aí quem avisa e
  // abre a tela é quem chamou.
  if (opcoes.silencioso) return os;
  aviso(juntou ? `Item incluído na OS ${numeroOS(os)} que já estava aberta para o ${e.codigo}.`
               : `OS preventiva aberta para o ${e.codigo}.`);
  if (document.querySelector('#vc-lista')) irPara('vencimentos');
  abrirOS(os.id);
  return os;
}

/* ================================================================ ORDENS DE SERVIÇO */

let filtroOS = { aba: 'abertas', busca: '', tipo: '', local: '' };

TELAS.ordens = el => {
  el.innerHTML = `
    <h1>Ordens de serviço</h1>
    <p class="sub">Preventiva vem dos vencimentos; corretiva vem do check list (item ruim) ou é
       aberta aqui. Abra a OS e toque em <strong>Registrar como feita</strong> quando o serviço terminar.</p>
    <div class="abas">
      <button type="button" data-aba="abertas">Abertas</button>
      <button type="button" data-aba="feitas">Feitas</button>
    </div>
    <div class="acoes"><button type="button" class="btn" id="os-corretiva">Nova OS corretiva</button></div>
    <div class="filtros">
      <input type="search" id="os-busca" placeholder="Buscar máquina ou nº da OS" value="${esc(filtroOS.busca)}">
      <select id="os-tipo"><option value="">Preventivas e corretivas</option>
        <option value="PREVENTIVA">Só preventivas</option><option value="CORRETIVA">Só corretivas</option></select>
      <select id="os-local"><option value="">Todos os locais</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join('')}</select>
    </div>
    <ul class="lista" id="os-lista"></ul>`;
  el.querySelector(`[data-aba="${filtroOS.aba}"]`).classList.add('ativo');
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { filtroOS.aba = b.dataset.aba; TELAS.ordens(el); });
  $('#os-tipo').value = filtroOS.tipo; $('#os-local').value = filtroOS.local;
  $('#os-corretiva').onclick = () => formCorretiva();

  const desenhar = () => {
    Object.assign(filtroOS, { busca: $('#os-busca').value, tipo: $('#os-tipo').value, local: $('#os-local').value });
    const b = filtroOS.busca.toLowerCase();
    const lista = q.todos('ordens_servico').filter(o => {
      const e = q.por_id('equipamentos', o.equipamento_id) || {};
      if (filtroOS.aba === 'abertas' ? !ABERTAS.includes(o.status) : o.status !== 'CONCLUIDA') return false;
      if (filtroOS.tipo && (o.tipo || 'PREVENTIVA') !== filtroOS.tipo) return false;
      if (filtroOS.local && o.local_id !== filtroOS.local) return false;
      if (b && !((e.codigo || '') + ' ' + (e.descricao || '') + ' ' + (o.numero || '')).toLowerCase().includes(b)) return false;
      return true;
    }).sort((a, x) => filtroOS.aba === 'abertas'
      ? (a.data_emissao || '').localeCompare(x.data_emissao || '') || (a.numero || 0) - (x.numero || 0)
      : (x.data_execucao || '').localeCompare(a.data_execucao || ''));

    $('#os-lista').innerHTML = lista.length === 0
      ? `<div class="vazio"><p>${filtroOS.aba === 'abertas' ? 'Nenhuma OS aberta.' : 'Nenhuma OS feita ainda.'}</p></div>`
      : lista.slice(0, 150).map(o => {
        const e = q.por_id('equipamentos', o.equipamento_id) || {};
        const dias = diasEntre(o.data_emissao, hoje());
        return `<li class="clicavel" data-os="${esc(o.id)}">
          <div class="info">
            <strong>OS ${esc(numeroOS(o))} · <span class="codigo">${esc(e.codigo || '')}</span> ${esc(e.descricao || '')}</strong>
            <small>${esc(resumoOS(o))}</small>
            <small>${esc(q.nome('locais', o.local_id))} · ${filtroOS.aba === 'abertas'
              ? 'aberta em ' + formatarData(o.data_emissao) + (dias > 0 ? ` (há ${dias} ${dias === 1 ? 'dia' : 'dias'})` : ' (hoje)')
              : 'feita em ' + formatarData(o.data_execucao) + (o.executado_por ? ' por ' + esc(o.executado_por) : '')}</small>
          </div>
          <span class="etq ${o.tipo === 'CORRETIVA' ? 'vencido' : 'ok'}">${o.tipo === 'CORRETIVA' ? 'CORRETIVA' : 'PREVENTIVA'}</span>
        </li>`;
      }).join('');
    $$('#os-lista [data-os]').forEach(li => li.onclick = () => abrirOS(li.dataset.os));
  };
  ['os-busca', 'os-tipo', 'os-local'].forEach(id => { const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar; });
  desenhar();
};

/* Corretiva aberta na mão: a máquina e o que está errado. */
function formCorretiva(idMaquina) {
  const maquinas = q.ativos('equipamentos').slice().sort(porCodigo);
  abrirModal('Nova OS corretiva', `
    ${campoLista('Máquina', 'equipamento_id', maquinas.map(e => ({ id: e.id, nome: e.codigo + ' — ' + e.descricao })), idMaquina)}
    ${campoArea('O que está errado', 'descricao', '', 'Ex.: vazamento de óleo no cubo da roda traseira')}
    <div class="acoes">
      <button type="button" class="btn" id="fc-salvar">Abrir OS</button>
      <button type="button" class="btn neutro" id="fc-cancelar">Cancelar</button>
    </div>`, corpo => {
    corpo.querySelector('#fc-cancelar').onclick = fecharModal;
    corpo.querySelector('#fc-salvar').onclick = async () => {
      const d = lerForm(corpo);
      if (!d.equipamento_id) return aviso('Escolha a máquina.', true);
      if (!d.descricao) return aviso('Escreva o que está errado.', true);
      const os = await criarCorretiva(q.por_id('equipamentos', d.equipamento_id), d.descricao);
      irPara('ordens');
      abrirOS(os.id);
    };
  });
}

async function criarCorretiva(e, descricao, extra = {}) {
  const agora = new Date().toISOString();
  return gravar('ordens_servico', Object.assign({
    id: crypto.randomUUID(), uuid_dispositivo: crypto.randomUUID(), tipo: 'CORRETIVA',
    equipamento_id: e.id, local_id: e.local_id, data_emissao: hoje(), status: 'ABERTA',
    leitura_emissao: leituraDe(e), descricao, criado_em: agora, atualizado_em: agora,
    criado_por: App.usuario.id || null, fotos_execucao: []
  }, extra));
}

/* ---------------------------------------------------------------- a OS (tela e impressão) */

function abrirOS(idOS) {
  const os = q.por_id('ordens_servico', idOS);
  if (!os) return aviso('OS não encontrada neste aparelho.', true);
  const e = q.por_id('equipamentos', os.equipamento_id) || {};
  const u = unidadeDe(e);
  const itens = itensDaOS(os.id);
  const feita = os.status === 'CONCLUIDA';
  const corretiva = os.tipo === 'CORRETIVA';
  const ck = os.checklist_id ? q.por_id('checklists', os.checklist_id) : null;

  /* OS de oficina (09/10/2026, refeita no modelo das ordens de serviço de
     concessionária — John Deere, Fiat, Volkswagen): identificação do bem em
     caixas, o que fazer com uma caixa grande de "feito" na frente, peças
     usadas, mão de obra com hora de início e fim, inspeção de saída e as
     assinaturas. Na corretiva, o roteiro "problema → causa → correção".
     Cores suaves (a folha vai para a oficina, preto e branco) e, no pé, só a
     marca da LOP no canto, como nos relatórios da área Pessoas. */
  const lt = u === 'km' ? 'Km' : 'Horímetro';
  const linhaBranca = '<span class="os-preencher"></span>';
  const val = (v, vazio = linhaBranca) => (v === null || v === undefined || v === '') ? vazio : esc(v);
  const caixa = (rot, conteudo, cls = '') => `<div class="os-cx ${cls}"><span>${rot}</span><b>${conteudo}</b></div>`;
  const marcaModelo = [q.nome('marcas', e.marca_id), e.modelo].filter(Boolean).join(' ');
  const serie = [(e.dados_tecnicos || {}).placa, e.numero_serie, e.patrimonio ? 'Pat. ' + e.patrimonio : ''].filter(Boolean).join(' · ');

  const blocoPreventiva = `
    <section class="os-bloco">
      <h3>Serviços a executar <small>marque o quadrado do que for feito</small></h3>
      <table class="os-tab"><thead><tr>
        <th class="os-ok">Feito</th><th>Serviço</th><th>A cada</th><th>Material a usar</th><th>Última troca</th><th>Por que entrou</th>
      </tr></thead><tbody>` + itens.map(it => {
        const p = it.plano_id ? q.por_id('planos_manutencao', it.plano_id) : null;
        return `<tr>
          <td class="os-ok"><span class="os-quad${it.feito ? ' on' : ''}">${it.feito ? '✓' : ''}</span></td>
          <td><b>${esc(q.nome('tipos_manutencao', it.tipo_manutencao_id))}</b></td>
          <td>${p ? esc(periodicidadeTexto(p, e)) : '—'}</td>
          <td class="os-mat">${p && p.materiais ? esc(p.materiais) : '<i>informar no cadastro da máquina</i>'}</td>
          <td>${feita && it.data_troca ? 'trocado em ' + formatarData(it.data_troca)
               : (p && p.ultima_troca_data ? formatarData(p.ultima_troca_data) : '—') +
                 (p && p.ultima_troca_leitura != null ? '<small>' + nHoras(p.ultima_troca_leitura) + ' ' + u + '</small>' : '')}</td>
          <td class="os-motivo">${esc(it.motivo || '')}</td>
        </tr>`;
      }).join('') + `
        <tr class="os-extra"><td class="os-ok"><span class="os-quad"></span></td><td colspan="5">Outro serviço: ${linhaBranca}</td></tr>
      </tbody></table>
    </section>`;

  const blocoCorretiva = `
    <section class="os-bloco">
      <h3>1 · Problema relatado</h3>
      <div class="os-texto">${esc(os.descricao || '')}</div>
      ${ck ? `<p class="os-origem">Apontado no check list ${ck.numero ? 'nº ' + ck.numero : ''} de ${formatarData(ck.data_verificacao)}${ck.operador ? ' · operador ' + esc(ck.operador) : ''}</p>` : ''}
    </section>
    <section class="os-bloco">
      <h3>2 · Causa encontrada <small>o que o mecânico viu</small></h3>
      <div class="os-linhas">${feita ? '' : '<span></span><span></span>'}</div>
    </section>`;

  const blocoPecas = `
    <section class="os-bloco">
      <h3>Peças e materiais usados</h3>
      <table class="os-tab os-pecas"><thead><tr>
        <th style="width:22%">Código / part number</th><th>Descrição</th><th style="width:10%">Qtd</th><th style="width:10%">Unid.</th>
      </tr></thead><tbody>${'<tr><td></td><td></td><td></td><td></td></tr>'.repeat(4)}</tbody></table>
    </section>`;

  const blocoExecucao = `
    <section class="os-bloco">
      <h3>${corretiva ? '3 · Correção — o que foi feito' : 'Execução'}</h3>
      <div class="os-grade os-g5">
        ${caixa('Mecânico', feita ? val(os.executado_por) : linhaBranca)}
        ${caixa('Data', feita ? formatarData(os.data_execucao) : '___ /___ /_____')}
        ${caixa('Hora início', linhaBranca)}
        ${caixa('Hora fim', linhaBranca)}
        ${caixa(lt + ' na saída', feita && os.leitura_execucao != null ? nHoras(os.leitura_execucao) + ' ' + u : linhaBranca)}
      </div>
      <div class="os-obs"><span>${corretiva ? 'O que foi feito' : 'Observações'}</span>
        ${feita && os.observacao ? `<p>${esc(os.observacao)}</p>` : '<div class="os-linhas"><span></span><span></span></div>'}</div>
    </section>
    <section class="os-bloco os-saida">
      <h3>Antes de liberar a máquina</h3>
      <div class="os-checks">
        ${['Sem vazamento', 'Níveis completos', 'Máquina testada', 'Área limpa', corretiva ? 'Problema resolvido' : 'Adesivo de troca colado e fotografado']
          .map(t => `<span><i class="os-quad"></i>${t}</span>`).join('')}
      </div>
    </section>`;

  const html = `
    <div id="os-impresso" class="os-folha">
      <header class="os-cab">
        <img src="../img/sakuma-logo.png" alt="SAKUMA Agronegócios" class="os-logo">
        <div class="os-titulo">
          <h2>Ordem de serviço</h2>
          <span class="os-tipo ${corretiva ? 'corr' : 'prev'}">${corretiva ? 'Corretiva' : 'Preventiva'}</span>
        </div>
        <div class="os-numero"><span>Nº</span><b>${esc(os.numero || '—')}</b><small>aberta em ${formatarData(os.data_emissao)}</small></div>
      </header>

      <section class="os-bloco">
        <h3>Equipamento</h3>
        <div class="os-grade os-g4">
          ${caixa('Código', esc(e.codigo || '—'), 'forte')}
          ${caixa('Descrição', esc(e.descricao || '—'), 'larga')}
          ${caixa('Prazo', os.prazo ? formatarData(os.prazo) : linhaBranca)}
          ${caixa('Fazenda', esc(q.nome('locais', os.local_id) || '—'))}
          ${caixa('Marca / modelo', marcaModelo ? esc(marcaModelo) : linhaBranca)}
          ${caixa('Placa / série', serie ? esc(serie) : linhaBranca)}
          ${caixa(lt + ' na abertura', os.leitura_emissao != null ? nHoras(os.leitura_emissao) + ' ' + u : linhaBranca)}
        </div>
      </section>

      ${corretiva ? blocoCorretiva : blocoPreventiva}
      ${blocoPecas}
      ${blocoExecucao}

      <section class="os-assinaturas">
        <div><span></span>Mecânico</div>
        <div><span></span>Responsável pela manutenção</div>
        <div><span></span>Operador / recebido por</div>
      </section>

      <footer class="os-pe">
        <img src="../img/lop-marca.png" alt="LOP">
        <span>Inteligência para o agronegócio</span>
      </footer>
    </div>

    <div class="acoes">
      ${feita ? '' : '<button type="button" class="btn" id="os-feita">Registrar como feita</button>'}
      <button type="button" class="btn btn-pdf" id="os-imprimir">Imprimir</button>
      ${feita ? '' : '<button type="button" class="btn-fantasma" id="os-cancelar" style="margin-left:auto">Cancelar OS</button>'}
    </div>`;

  abrirModal('OS ' + numeroOS(os) + ' — ' + (e.codigo || ''), html, corpo => {
    corpo.querySelector('#os-imprimir').onclick = () => {
      document.body.classList.add('imprimindo-os');
      window.print();
      setTimeout(() => document.body.classList.remove('imprimindo-os'), 500);
    };
    const bf = corpo.querySelector('#os-feita'); if (bf) bf.onclick = () => formFeita(os);
    const bx = corpo.querySelector('#os-cancelar');
    if (bx) bx.onclick = async () => {
      if (!confirm('Cancelar esta OS? O item volta a aparecer nos vencimentos.')) return;
      await gravar('ordens_servico', Object.assign(os, { status: 'CANCELADA', atualizado_em: new Date().toISOString() }));
      fecharModal(); recarregarTela(); aviso('OS cancelada.');
    };
  });
}

/* Redesenha a tela aberta, para a lista refletir o que mudou */
function recarregarTela() {
  const ativo = document.querySelector('#vc-lista') ? 'vencimentos'
              : document.querySelector('#os-lista') ? 'ordens'
              : document.querySelector('#mq-lista') ? 'maquinas' : null;
  if (ativo) irPara(ativo);
}

/* ---------------------------------------------------------------- registrar como feita */

function formFeita(os) {
  const e = q.por_id('equipamentos', os.equipamento_id);
  const u = unidadeDe(e);
  const itens = itensDaOS(os.id).filter(i => !i.feito);
  const corretiva = os.tipo === 'CORRETIVA';
  const medido = e.unidade_controle !== 'CALENDARIO';
  let foto = null;

  abrirModal('Registrar OS ' + numeroOS(os) + ' como feita', `
    <p class="sub"><strong>${esc(e.codigo)}</strong> — ${esc(e.descricao)}</p>
    ${!corretiva && itens.length > 1 ? `<fieldset><legend>O que foi feito</legend>${itens.map(it => `
      <label class="ff-item"><input type="checkbox" data-item="${esc(it.id)}" checked>
        ${esc(q.nome('tipos_manutencao', it.tipo_manutencao_id))}</label>`).join('')}
      <p class="ajuda">Desmarque o que não foi feito: ele continua vencido no painel.</p></fieldset>` : ''}
    <div class="colunas">
      ${campoTexto('Data do serviço', 'data', hoje(), 'date')}
      ${medido ? campoTexto((u === 'km' ? 'Km' : 'Horímetro') + ' na hora do serviço', 'leitura',
          e.unidade_controle === 'ACUMULADO' ? (leituraDe(e) ?? '') : '', 'number',
          e.unidade_controle === 'ACUMULADO' ? 'Implemento: o contador acumulado de agora'
            : 'Valor exato do mostrador — nunca estimado. Atual no app: ' + nHoras(leituraDe(e)) + ' ' + u) : ''}
      ${campoTexto('Quem fez', 'executado_por', '')}
    </div>
    ${campoArea(corretiva ? 'O que foi feito' : 'Observação', 'observacao', '')}
    <div class="campo"><label>${corretiva ? 'Foto (opcional)' : 'Foto do adesivo de troca (obrigatória)'}</label>
      <label class="ck-foto">📷 Tirar / escolher foto<input type="file" accept="image/*" capture="environment" id="ff-foto"></label>
      <div class="ck-miniaturas" id="ff-min"></div></div>
    <div class="acoes">
      <button type="button" class="btn" id="ff-salvar">Salvar</button>
      <button type="button" class="btn neutro" id="ff-voltar">Voltar</button>
    </div>`, corpo => {
    corpo.querySelector('#ff-voltar').onclick = () => abrirOS(os.id);
    corpo.querySelector('#ff-foto').onchange = ev => {
      foto = ev.target.files[0] || null;
      corpo.querySelector('#ff-min').innerHTML = foto ? `<img src="${URL.createObjectURL(foto)}" alt="">` : '';
    };
    corpo.querySelector('#ff-salvar').onclick = async () => {
      const d = lerForm(corpo);
      const leitura = medido ? num(d.leitura) : null;
      if (!d.data) return aviso('Informe a data do serviço.', true);
      if (d.data > hoje()) return aviso('A data não pode ser no futuro.', true);
      if (medido && !corretiva && leitura == null) return aviso('Informe o ' + (u === 'km' ? 'km' : 'horímetro') + ' na hora do serviço.', true);
      if (!d.executado_por) return aviso('Diga quem fez o serviço.', true);
      if (corretiva && !d.observacao) return aviso('Escreva o que foi feito.', true);
      if (!corretiva && !foto) return aviso('A foto do adesivo de troca é obrigatória.', true);

      const marcados = itens.length > 1
        ? itens.filter(it => corpo.querySelector(`[data-item="${it.id}"]`).checked) : itens;
      if (!corretiva && marcados.length === 0) return aviso('Marque pelo menos um item feito.', true);

      const atual = leituraDe(e);
      const ehMostrador = e.unidade_controle === 'HORIMETRO' || e.unidade_controle === 'HODOMETRO';
      if (ehMostrador && leitura != null && atual != null && leitura < atual &&
          !confirm(`O ${u === 'km' ? 'km' : 'horímetro'} informado (${nHoras(leitura)}) é menor que o atual da máquina (${nHoras(atual)}). ` +
                   'Ele fica na OS, mas não muda o horímetro da máquina. Continuar?')) return;

      const b = corpo.querySelector('#ff-salvar'); b.disabled = true; b.textContent = 'Salvando…';
      const agora = new Date().toISOString();
      const caminho = foto ? await guardarFoto(foto, 'manutencao-ordens-servico', 'os/' + e.codigo.replace(/[^\w.-]/g, '_')) : null;

      // 1. horímetro novo da máquina (o gatilho do banco atualiza o bem)
      if (ehMostrador && leitura != null && (atual == null || leitura >= atual)) {
        await gravar('leituras', {
          id: crypto.randomUUID(), uuid_dispositivo: crypto.randomUUID(), equipamento_id: e.id,
          data_leitura: d.data, valor: leitura, origem: 'ORDEM_SERVICO',
          observacao: 'OS ' + numeroOS(os), registrado_em: agora, criado_por: App.usuario.id || null
        });
        if (!e.leitura_data || d.data >= e.leitura_data) {
          await gravar('equipamentos', Object.assign(limparBem(e), { leitura_atual: leitura, leitura_data: d.data }));
          Object.assign(q.por_id('equipamentos', e.id), { horas_acumuladas: e.horas_acumuladas, km_acumulados: e.km_acumulados });
        }
      }

      // 2. cada item feito vira a "última troca" do plano — é o que recalcula o vencimento
      for (const it of marcados) {
        await gravar('os_itens', Object.assign(it, { feito: true, data_troca: d.data, leitura_troca: leitura }));
        await gravar('manutencoes', {
          id: crypto.randomUUID(), uuid_dispositivo: crypto.randomUUID(), equipamento_id: e.id,
          tipo_manutencao_id: it.tipo_manutencao_id, local_id: e.local_id, data_manutencao: d.data,
          leitura, os_id: os.id, observacao: [d.executado_por ? 'Feito por ' + d.executado_por : '', d.observacao || ''].filter(Boolean).join(' · ') || null,
          foto_adesivo_path: caminho, registrado_em: agora, custo_pecas: 0, custo_servico: 0,
          criado_por: App.usuario.id || null
        });
        const p = it.plano_id ? q.por_id('planos_manutencao', it.plano_id) : null;
        if (p && (!p.ultima_troca_data || d.data >= p.ultima_troca_data)) {
          await gravar('planos_manutencao', Object.assign(p, {
            ultima_troca_data: d.data, ultima_troca_leitura: leitura ?? p.ultima_troca_leitura, ultima_os_id: os.id
          }));
        }
      }

      // 3. a OS fecha
      await gravar('ordens_servico', Object.assign(os, {
        status: 'CONCLUIDA', data_execucao: d.data, leitura_execucao: leitura,
        executado_por: d.executado_por, observacao: d.observacao || null,
        foto_adesivo: caminho, concluida_em: agora, finalizada_em: agora, atualizado_em: agora
      }));

      fecharModal(); recarregarTela();
      aviso(App.online ? 'OS registrada como feita. Próximo vencimento recalculado.'
                       : 'Salvo no aparelho. Sobe quando a internet voltar.');
    };
  });
}

Object.assign(window, { abrirOS, abrirOSPreventiva, criarCorretiva, formCorretiva, resumoOS, osAbertaDoPlano });
