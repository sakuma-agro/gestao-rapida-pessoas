/* =====================================================================
   LOP - Gestão Rápida · área Máquinas e Patrimônio — PATRIMÔNIO (15/10/2026)

   Pedido do Guilherme: além das máquinas, controlar os bens da empresa que
   não têm manutenção por horímetro — furadeira, gerador, móveis, computador.
   Cada bem tem código de patrimônio, descrição, categoria, marca/modelo/nº de
   série, fazenda, situação, data e valor de compra, uma foto principal (vai
   para o Drive) e o histórico de movimentação.

   Código de patrimônio: numeração ÚNICA entre máquinas e bens (6 dígitos).
   O app propõe o próximo livre; o banco confere e, se dois aparelhos sem
   internet escolheram o mesmo número, o segundo cadastro recebe o próximo
   livre e a tela passa a mostrar o número certo depois do envio.

   Também mora aqui a foto principal da máquina (fotoPrincipalHtml/ligarFoto),
   usada pela ficha da máquina em maquinas.js.
   ===================================================================== */

const SITUACOES_BEM = [
  { id: 'EM_USO', nome: 'Em uso', cls: 'ok' },
  { id: 'GUARDADO', nome: 'Guardado', cls: 'neutro' },
  { id: 'EM_MANUTENCAO', nome: 'Em manutenção', cls: 'atencao' },
  { id: 'EMPRESTADO', nome: 'Emprestado', cls: 'atencao' },
  { id: 'BAIXADO', nome: 'Baixado', cls: 'inativo' },
];
const nomeSituacao = s => (SITUACOES_BEM.find(x => x.id === s) || { nome: s || '—' }).nome;
const etqSituacao = s => {
  const x = SITUACOES_BEM.find(y => y.id === s);
  return x ? `<span class="etq ${x.cls}">${esc(x.nome.toUpperCase())}</span>` : '';
};

/* Categorias sugeridas; o que for digitado de novo entra na lista sozinho. */
const CATEGORIAS_BASE = ['Ferramenta elétrica', 'Ferramenta manual', 'Equipamento de oficina',
  'Gerador / motor', 'Informática', 'Móveis e utensílios', 'Eletrodoméstico', 'Comunicação', 'Outros'];

const TIPOS_MOV = {
  CADASTRO: 'Cadastro', TRANSFERENCIA: 'Transferência de fazenda', EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO: 'Devolução', MANUTENCAO: 'Foi para manutenção', RETORNO: 'Voltou da manutenção',
  BAIXA: 'Baixa', AJUSTE: 'Ajuste',
};
/* Cada tipo de movimentação leva o bem para uma situação. */
const SITUACAO_DO_MOV = {
  TRANSFERENCIA: null, EMPRESTIMO: 'EMPRESTADO', DEVOLUCAO: 'EM_USO',
  MANUTENCAO: 'EM_MANUTENCAO', RETORNO: 'EM_USO', BAIXA: 'BAIXADO', AJUSTE: null,
};

const ehAdminP = () => !!(window.Acesso && (Acesso.admin || Acesso.gestor));   // 22/10/2026: gestor da fazenda também
const dinheiro = v => v == null || v === '' ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------------------------------------------------------------- código */

/* Próximo número livre olhando máquinas e bens que este aparelho conhece.
   O banco confere de novo na hora de gravar. */
function proximoPatrimonio() {
  let maior = 0;
  for (const t of ['equipamentos', 'bens_patrimonio'])
    for (const r of q.todos(t)) {
      const s = String(r.patrimonio || '');
      if (/^\d{1,12}$/.test(s)) maior = Math.max(maior, Number(s));
    }
  return String(maior + 1).padStart(6, '0');
}
function normalizarPatrimonio(v) {
  const s = String(v || '').trim().toUpperCase();
  return /^\d{1,6}$/.test(s) ? s.padStart(6, '0') : s;
}
/* Quem já usa esse número (máquina ou bem), fora o próprio registro. */
function donoDoPatrimonio(pat, id) {
  if (!pat) return null;
  const m = q.todos('equipamentos').find(x => x.patrimonio === pat && x.id !== id);
  if (m) return 'da máquina ' + m.codigo;
  const b = q.todos('bens_patrimonio').find(x => x.patrimonio === pat && x.id !== id);
  if (b) return 'do bem ' + b.descricao;
  return null;
}

/* ---------------------------------------------------------------- foto principal */

/* Caixa da foto: mostra a que está no aparelho ou no Drive; "Trocar foto" abre
   a câmera no celular. tipo = 'maquina' | 'patrimonio'. */
function fotoPrincipalHtml(caminho, podeTrocar) {
  return `<div class="pt-foto" data-foto="${esc(caminho || '')}">
      <div class="pt-foto-img">${caminho ? '<span class="pt-foto-msg">carregando a foto…</span>'
        : '<span class="pt-foto-msg">sem foto</span>'}</div>
      ${podeTrocar ? `<div class="pt-foto-botoes">
        <label class="btn-fantasma pt-foto-btn">Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden></label>
        <label class="btn-fantasma pt-foto-btn">Escolher da galeria
          <input type="file" accept="image/*" hidden></label>
      </div>` : ''}
    </div>`;
}

/* Liga a caixa: carrega a imagem e, ao escolher arquivo, guarda no aparelho
   (sobe para o Drive sozinho) e chama aoTrocar(caminho). */
async function ligarFoto(corpo, tipo, idDono, aoTrocar) {
  const caixa = corpo.querySelector('.pt-foto');
  if (!caixa) return;
  const img = caixa.querySelector('.pt-foto-img');
  const mostrar = async caminho => {
    if (!caminho) return;
    let blob = await blobDaFoto(caminho);
    if (!blob && window.blobDoDrive) blob = await blobDoDrive(caminho);
    if (!caixa.isConnected) return;
    img.innerHTML = blob
      ? `<img src="${URL.createObjectURL(blob)}" alt="Foto">`
      : `<span class="pt-foto-msg">${App.online ? 'foto ainda não chegou ao Drive' : 'foto disponível com internet'}</span>`;
  };
  mostrar(caixa.dataset.foto);
  caixa.querySelectorAll('input[type=file]').forEach(inp => inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      img.innerHTML = '<span class="pt-foto-msg">guardando…</span>';
      const caminho = await guardarFoto(f, 'drive', tipo + '/' + idDono);
      caixa.dataset.foto = caminho;
      inp.value = '';
      await aoTrocar(caminho);
      await mostrar(caminho);
      aviso(App.online ? 'Foto guardada. Sobe para o Drive agora.' : 'Foto guardada no aparelho. Sobe quando a internet voltar.');
    } catch (e) {
      img.innerHTML = '<span class="pt-foto-msg">não consegui ler a foto</span>';
      aviso('Não consegui guardar a foto: ' + (e.message || e), true);
    }
  });
}

/* ---------------------------------------------------------------- lista */

let filtroBem = { busca: '', local: '', categoria: '', situacao: '' };

function categoriasBens() {
  const usadas = q.todos('bens_patrimonio').map(b => b.categoria).filter(Boolean);
  return [...new Set([...CATEGORIAS_BASE, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

TELAS.patrimonio = el => {
  el.innerHTML = `
    <h1>Patrimônio</h1>
    <p class="sub">Bens da empresa fora da frota — ferramentas, equipamentos de oficina, móveis,
       informática. O código de patrimônio é único entre máquinas e bens.</p>
    <div class="acoes">
      ${ehAdminP() ? '<button type="button" class="btn" id="pt-novo">Cadastrar bem</button>' : ''}
      <button type="button" class="btn-fantasma" id="pt-imprimir">Imprimir lista</button>
    </div>
    <div class="filtros">
      <input type="search" id="pt-busca" placeholder="Buscar por código, descrição, marca ou nº de série" value="${esc(filtroBem.busca)}">
      <select id="pt-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}"${l.id === filtroBem.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}
      </select>
      <select id="pt-cat"><option value="">Todas as categorias</option>
        ${categoriasBens().map(c => `<option${c === filtroBem.categoria ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <select id="pt-sit"><option value="">Ativos (sem baixados)</option>
        ${SITUACOES_BEM.map(s => `<option value="${s.id}"${s.id === filtroBem.situacao ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}
        <option value="TODOS"${filtroBem.situacao === 'TODOS' ? ' selected' : ''}>Todos, inclusive baixados</option>
      </select>
    </div>
    <div id="pt-resumo"></div>
    <div id="pt-lista"></div>`;

  const filtrados = () => {
    const b = filtroBem.busca.toLowerCase();
    return q.ativos('bens_patrimonio').filter(x =>
      (!filtroBem.local || x.local_id === filtroBem.local) &&
      (!filtroBem.categoria || x.categoria === filtroBem.categoria) &&
      (filtroBem.situacao === 'TODOS' ? true
        : filtroBem.situacao ? x.situacao === filtroBem.situacao : x.situacao !== 'BAIXADO') &&
      (!b || [x.patrimonio, x.descricao, x.marca, x.modelo, x.numero_serie, x.responsavel]
        .filter(Boolean).join(' ').toLowerCase().includes(b))
    ).sort((a, c) => String(a.patrimonio || '').localeCompare(String(c.patrimonio || ''), 'pt-BR', { numeric: true }));
  };

  const desenhar = () => {
    filtroBem = { busca: $('#pt-busca').value, local: $('#pt-local').value,
      categoria: $('#pt-cat').value, situacao: $('#pt-sit').value };
    const lista = filtrados();
    const total = lista.reduce((s, x) => s + (Number(x.valor_compra) || 0), 0);
    const porSit = SITUACOES_BEM.map(s => [s, lista.filter(x => x.situacao === s.id).length]).filter(([, n]) => n);
    $('#pt-resumo').innerHTML = lista.length ? `<div class="pt-resumo">
        <div><span>Bens</span><b>${lista.length}</b></div>
        <div><span>Valor de compra</span><b>${dinheiro(total)}</b></div>
        ${porSit.map(([s, n]) => `<div><span>${esc(s.nome)}</span><b>${n}</b></div>`).join('')}
      </div>` : '';
    $('#pt-lista').innerHTML = lista.length === 0
      ? `<div class="vazio"><p>${q.ativos('bens_patrimonio').length ? 'Nenhum bem com esses filtros.'
          : 'Nenhum bem cadastrado ainda.' + (ehAdminP() ? ' Use "Cadastrar bem".' : '')}</p></div>`
      : `<table class="tabela mq-tabela pt-tabela"><thead><tr>
          <th>Patrimônio</th><th>Descrição</th><th>Categoria</th><th>Fazenda</th>
          <th>Situação</th><th class="num">Valor</th><th></th>
        </tr></thead><tbody>` + lista.map(x => `<tr data-bem="${esc(x.id)}" class="clicavel">
          <td class="codigo">${esc(x.patrimonio || '—')}</td>
          <td><strong>${esc(x.descricao)}</strong>
            ${[x.marca, x.modelo].filter(Boolean).length ? `<small>${esc([x.marca, x.modelo].filter(Boolean).join(' '))}</small>` : ''}</td>
          <td>${esc(x.categoria || '—')}</td>
          <td>${esc(q.nome('locais', x.local_id) || '—')}</td>
          <td>${etqSituacao(x.situacao)}${x.responsavel ? `<small>${esc(x.responsavel)}</small>` : ''}</td>
          <td class="num">${dinheiro(x.valor_compra)}</td>
          <td><button type="button" class="btn-fantasma">Abrir</button></td>
        </tr>`).join('') + '</tbody></table>';
    $$('#pt-lista [data-bem]').forEach(tr => tr.onclick = () => fichaBem(tr.dataset.bem));
  };
  ['pt-busca', 'pt-local', 'pt-cat', 'pt-sit'].forEach(id => {
    const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar;
  });
  const bn = $('#pt-novo'); if (bn) bn.onclick = () => formBem();
  $('#pt-imprimir').onclick = () => imprimirPatrimonio(filtrados());
  desenhar();
};

/* ---------------------------------------------------------------- ficha */

function movimentosDo(id) {
  return q.todos('patrimonio_movimentos').filter(m => m.bem_id === id)
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criado_em || '').localeCompare(a.criado_em || ''));
}

function fichaBem(id) {
  const b = q.por_id('bens_patrimonio', id);
  if (!b) return;
  const movs = movimentosDo(id);
  abrirModal((b.patrimonio ? b.patrimonio + ' — ' : '') + b.descricao, `
    <div class="pt-ficha">
      ${fotoPrincipalHtml(b.foto_url, true)}
      <div class="mq-cab pt-dados">
        <div><span>Patrimônio</span><b>${esc(b.patrimonio || 'aguardando envio')}</b></div>
        <div><span>Situação</span><b>${esc(nomeSituacao(b.situacao))}</b></div>
        <div><span>Fazenda</span><b>${esc(q.nome('locais', b.local_id) || '—')}</b></div>
        <div><span>Responsável</span><b>${esc(b.responsavel || '—')}</b></div>
        <div><span>Categoria</span><b>${esc(b.categoria || '—')}</b></div>
        <div><span>Marca / modelo</span><b>${esc([b.marca, b.modelo].filter(Boolean).join(' ') || '—')}</b></div>
        <div><span>Nº de série</span><b>${esc(b.numero_serie || '—')}</b></div>
        <div><span>Compra</span><b>${b.data_compra ? formatarData(b.data_compra) : '—'}</b>
          ${b.valor_compra != null ? `<small>${dinheiro(b.valor_compra)}</small>` : ''}</div>
      </div>
    </div>
    ${b.observacoes ? `<p class="sub">${esc(b.observacoes)}</p>` : ''}
    <div class="acoes">
      ${b.situacao !== 'BAIXADO' ? '<button type="button" class="btn" id="fb-mov">Registrar movimentação</button>' : ''}
      ${ehAdminP() ? '<button type="button" class="btn neutro" id="fb-editar">Editar cadastro</button>' : ''}
      ${ehAdminP() ? '<button type="button" class="btn-fantasma" id="fb-duplicar">Duplicar</button>' : ''}
    </div>
    <h2 class="fm-titulo">Histórico de movimentação</h2>
    ${movs.length === 0 ? '<p class="sub">Nada registrado ainda.</p>'
      : '<ul class="lista">' + movs.map(m => {
          const de = q.nome('locais', m.de_local_id), para = q.nome('locais', m.para_local_id);
          const detalhe = [
            de || para ? (de && para && de !== para ? de + ' → ' + para : (para || de)) : '',
            m.de_situacao !== m.para_situacao && m.para_situacao ? nomeSituacao(m.para_situacao) : '',
            m.responsavel ? 'com ' + m.responsavel : '',
            m.observacao || '',
          ].filter(Boolean).join(' · ');
          return `<li><div class="info"><strong>${esc(TIPOS_MOV[m.tipo] || m.tipo)}</strong>
            <small>${formatarData(m.data)}${detalhe ? ' · ' + esc(detalhe) : ''}${m.registrado_por ? ' · por ' + esc(m.registrado_por) : ''}</small></div></li>`;
        }).join('') + '</ul>'}
  `, corpo => {
    ligarFoto(corpo, 'patrimonio', b.id, async caminho => {
      const atual = q.por_id('bens_patrimonio', b.id) || b;
      await gravar('bens_patrimonio', Object.assign({}, atual, { foto_url: caminho, atualizado_em: new Date().toISOString() }));
    });
    const bm = corpo.querySelector('#fb-mov'); if (bm) bm.onclick = () => formMovimento(b);
    const be = corpo.querySelector('#fb-editar'); if (be) be.onclick = () => formBem(b);
    const bd = corpo.querySelector('#fb-duplicar'); if (bd) bd.onclick = () => formBem(null, b);
  });
}

/* ---------------------------------------------------------------- cadastro */

const quemRegistra = () => (App.usuario && (App.usuario.nome || App.usuario.email)) || null;

/* novo: b = null · editar: b = bem · duplicar: b = null, modelo = bem de origem */
function formBem(b, modelo) {
  if (b) b = q.por_id('bens_patrimonio', b.id) || b;
  const novo = !b;
  const base = b || Object.assign({ situacao: 'EM_USO' }, modelo ? {
    descricao: modelo.descricao, categoria: modelo.categoria, marca: modelo.marca, modelo: modelo.modelo,
    local_id: modelo.local_id, data_compra: modelo.data_compra, valor_compra: modelo.valor_compra,
  } : {}, { patrimonio: proximoPatrimonio() });
  const titulo = novo ? (modelo ? 'Duplicar bem' : 'Cadastrar bem') : 'Editar ' + (b.patrimonio || b.descricao);
  // A foto entra já no cadastro (15/10/2026): o id do bem novo nasce aqui para
  // a foto ter onde morar antes de salvar.
  const idBem = novo ? crypto.randomUUID() : b.id;
  let fotoEscolhida = novo ? null : (b.foto_url || null);

  abrirModal(titulo, `
    <div class="pt-foto-form">${fotoPrincipalHtml(fotoEscolhida, true)}</div>
    <div class="colunas">
      ${campoTexto('Código de patrimônio', 'patrimonio', base.patrimonio, 'text',
        novo ? 'Próximo número livre já preenchido. Único entre máquinas e bens.' : 'Único entre máquinas e bens.')}
      ${campoTexto('Descrição', 'descricao', base.descricao, 'text', 'Ex.: Furadeira de impacto 1/2"')}
      <div class="campo"><label for="f-categoria">Categoria</label>
        <input type="text" id="f-categoria" name="categoria" list="pt-cats" value="${esc(base.categoria || '')}">
        <datalist id="pt-cats">${categoriasBens().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      ${campoTexto('Marca', 'marca', base.marca)}
      ${campoTexto('Modelo', 'modelo', base.modelo)}
      ${campoTexto('Nº de série', 'numero_serie', novo ? '' : base.numero_serie)}
      ${campoLista('Fazenda', 'local_id', locaisEditaveis(), base.local_id)}
      ${novo || ehAdminP() ? campoLista('Situação', 'situacao', SITUACOES_BEM, base.situacao, null) : ''}
      ${campoTexto('Responsável / com quem está', 'responsavel', novo ? '' : base.responsavel)}
      ${campoTexto('Data de compra', 'data_compra', base.data_compra, 'date')}
      ${campoTexto('Valor de compra (R$)', 'valor_compra', base.valor_compra, 'number')}
    </div>
    ${campoArea('Observações', 'observacoes', novo ? '' : base.observacoes)}
    ${!novo ? '<p class="ajuda">Mudou de fazenda, emprestou ou mandou consertar? Use "Registrar movimentação" na ficha — assim fica no histórico.</p>' : ''}
    <div class="acoes">
      <button type="button" class="btn" id="fb-salvar">Salvar</button>
      <button type="button" class="btn neutro" id="fb-cancelar">Cancelar</button>
      ${!novo ? '<button type="button" class="btn-fantasma" id="fb-excluir" style="margin-left:auto">Excluir cadastro</button>' : ''}
    </div>`, corpo => {
    ligarFoto(corpo, 'patrimonio', idBem, async caminho => { fotoEscolhida = caminho; });
    corpo.querySelector('#fb-cancelar').onclick = () => (novo ? fecharModal() : fichaBem(b.id));
    corpo.querySelector('#fb-salvar').onclick = async () => {
      const d = lerForm(corpo);
      d.patrimonio = normalizarPatrimonio(d.patrimonio) || null;
      if (!d.descricao) return aviso('Escreva a descrição do bem.', true);
      if (!d.local_id) return aviso('Escolha a fazenda.', true);
      const dono = donoDoPatrimonio(d.patrimonio, b && b.id);
      if (dono) return aviso('O patrimônio ' + d.patrimonio + ' já é ' + dono + '.', true);
      d.valor_compra = num(d.valor_compra);
      d.descricao = d.descricao.trim();

      const agora = new Date().toISOString();
      const reg = Object.assign({}, novo ? {} : b, d, { foto_url: fotoEscolhida, ativo: true, atualizado_em: agora });
      if (novo) { reg.id = idBem; reg.criado_por = App.usuario.id || null; reg.criado_em = agora; }
      await gravar('bens_patrimonio', reg);
      if (novo) {
        await gravar('patrimonio_movimentos', {
          id: crypto.randomUUID(), bem_id: reg.id, data: hoje(), tipo: 'CADASTRO',
          para_local_id: reg.local_id, para_situacao: reg.situacao, responsavel: reg.responsavel || null,
          registrado_por: quemRegistra(), criado_em: agora,
        });
      } else if (b.local_id !== reg.local_id || b.situacao !== reg.situacao) {
        // Edição que mexeu em fazenda ou situação também entra no histórico.
        await gravar('patrimonio_movimentos', {
          id: crypto.randomUUID(), bem_id: reg.id, data: hoje(), tipo: 'AJUSTE',
          de_local_id: b.local_id, para_local_id: reg.local_id,
          de_situacao: b.situacao, para_situacao: reg.situacao,
          observacao: 'alterado no cadastro', registrado_por: quemRegistra(), criado_em: agora,
        });
      }
      aviso(App.online ? 'Bem salvo.' : 'Salvo no aparelho. Sobe quando a internet voltar.');
      irPara('patrimonio');
      fichaBem(reg.id);
    };
    const bx = corpo.querySelector('#fb-excluir');
    if (bx) bx.onclick = async () => {
      if (!confirm('Excluir o cadastro de "' + b.descricao + '"? Use só para cadastro feito por engano — '
        + 'bem vendido, perdido ou descartado é "Baixa" em Registrar movimentação.')) return;
      await inativar('bens_patrimonio', b.id);
      fecharModal(); irPara('patrimonio'); aviso('Cadastro excluído.');
    };
  });
}

/* ---------------------------------------------------------------- movimentação */

function formMovimento(b) {
  b = q.por_id('bens_patrimonio', b.id) || b;   // a ficha pode ter trocado a foto depois de aberta
  const opcoes = Object.entries(TIPOS_MOV).filter(([k]) => k !== 'CADASTRO' && k !== 'AJUSTE')
    .filter(([k]) => !(k === 'DEVOLUCAO' && b.situacao !== 'EMPRESTADO'))
    .filter(([k]) => !(k === 'RETORNO' && b.situacao !== 'EM_MANUTENCAO'))
    .map(([id, nome]) => ({ id, nome }));
  abrirModal('Movimentação — ' + (b.patrimonio || b.descricao), `
    <p class="sub">${esc(b.descricao)} · hoje em <strong>${esc(q.nome('locais', b.local_id) || '—')}</strong>,
      ${esc(nomeSituacao(b.situacao).toLowerCase())}.</p>
    <div class="colunas">
      ${campoLista('O que aconteceu', 'tipo', opcoes, opcoes[0] && opcoes[0].id, null)}
      ${campoTexto('Data', 'data', hoje(), 'date')}
      <div id="fm-para">${campoLista('Para qual fazenda', 'para_local_id', locaisEditaveis(), b.local_id)}</div>
      ${campoTexto('Com quem fica / quem levou', 'responsavel', '', 'text', 'Ex.: nome do funcionário ou da oficina')}
    </div>
    ${campoArea('Observação', 'observacao', '')}
    <div class="acoes">
      <button type="button" class="btn" id="fmv-salvar">Registrar</button>
      <button type="button" class="btn neutro" id="fmv-cancelar">Cancelar</button>
    </div>`, corpo => {
    const sel = corpo.querySelector('#f-tipo');
    const ajustar = () => { corpo.querySelector('#fm-para').hidden = sel.value === 'BAIXA'; };
    sel.onchange = ajustar; ajustar();
    corpo.querySelector('#fmv-cancelar').onclick = () => fichaBem(b.id);
    corpo.querySelector('#fmv-salvar').onclick = async () => {
      const d = lerForm(corpo);
      if (!d.tipo) return aviso('Escolha o que aconteceu.', true);
      if (!d.data) return aviso('Informe a data.', true);
      const para = d.tipo === 'BAIXA' ? b.local_id : (d.para_local_id || b.local_id);
      if (d.tipo === 'TRANSFERENCIA' && para === b.local_id) return aviso('Escolha uma fazenda diferente da atual.', true);
      if (d.tipo === 'BAIXA' && !d.observacao) return aviso('Diga o motivo da baixa (vendido, perdido, quebrado…).', true);
      if (d.tipo === 'EMPRESTIMO' && !d.responsavel) return aviso('Diga com quem o bem ficou.', true);
      const novaSit = SITUACAO_DO_MOV[d.tipo] || b.situacao;
      const agora = new Date().toISOString();
      await gravar('patrimonio_movimentos', {
        id: crypto.randomUUID(), bem_id: b.id, data: d.data, tipo: d.tipo,
        de_local_id: b.local_id, para_local_id: para, de_situacao: b.situacao, para_situacao: novaSit,
        responsavel: d.responsavel, observacao: d.observacao, registrado_por: quemRegistra(), criado_em: agora,
      });
      const resp = ['EMPRESTIMO', 'MANUTENCAO', 'TRANSFERENCIA'].includes(d.tipo) && d.responsavel ? d.responsavel
        : ['DEVOLUCAO', 'RETORNO'].includes(d.tipo) ? (d.responsavel || null) : b.responsavel;
      await gravar('bens_patrimonio', Object.assign({}, b, {
        local_id: para, situacao: novaSit, responsavel: resp, atualizado_em: agora,
      }));
      aviso(App.online ? 'Movimentação registrada.' : 'Registrada no aparelho. Sobe quando a internet voltar.');
      irPara('patrimonio');
      fichaBem(b.id);
    };
  });
}

/* ---------------------------------------------------------------- impressão */

/* Lista do patrimônio em A4, no mesmo pé dos documentos da área: só a marca
   da LOP no canto, cores suaves. */
function imprimirPatrimonio(lista) {
  if (!lista.length) return aviso('Nada para imprimir com esses filtros.', true);
  const total = lista.reduce((s, x) => s + (Number(x.valor_compra) || 0), 0);
  const filtros = [
    filtroBem.local ? q.nome('locais', filtroBem.local) : 'Todas as fazendas',
    filtroBem.categoria || 'todas as categorias',
    filtroBem.situacao === 'TODOS' ? 'inclusive baixados' : filtroBem.situacao ? nomeSituacao(filtroBem.situacao) : 'ativos',
  ].join(' · ');
  const w = window.open('', '_blank');
  if (!w) return aviso('O navegador bloqueou a janela de impressão.', true);
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Patrimônio — ${esc(filtros)}</title>
    <style>
      @page{size:A4 landscape;margin:12mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#51534A;margin:0;font-size:11px}
      .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #c9dd94;padding-bottom:8px;margin-bottom:10px}
      .cab img{height:42px}
      h1{font-size:17px;margin:0;color:#744F28}
      .cab p{margin:2px 0 0;font-size:11px}
      table{width:100%;border-collapse:collapse}
      th{background:#eef3e0;text-align:left;padding:5px 6px;border:1px solid #d7dccb;font-size:10.5px}
      td{padding:5px 6px;border:1px solid #d7dccb;vertical-align:top}
      tbody tr:nth-child(even) td{background:#f7f9f1}
      td.n{text-align:right;white-space:nowrap}
      tfoot td{background:#e4ead2;font-weight:bold}
      .pe{margin-top:14px;display:flex;justify-content:flex-end;align-items:center;gap:8px;font-size:9px;letter-spacing:.06em}
      .pe img{height:22px}
    </style></head><body>
    <div class="cab"><img src="${new URL('../img/sakuma-marca-vertical.png', location.href)}" alt="SAKUMA">
      <div><h1>Patrimônio</h1><p>${esc(filtros)} · ${lista.length} ${lista.length === 1 ? 'bem' : 'bens'} · emitido em ${formatarData(hoje())}</p></div></div>
    <table><thead><tr><th>Patrimônio</th><th>Descrição</th><th>Categoria</th><th>Marca / modelo</th>
      <th>Nº de série</th><th>Fazenda</th><th>Situação</th><th>Responsável</th><th>Compra</th><th>Valor</th></tr></thead>
    <tbody>${lista.map(x => `<tr><td>${esc(x.patrimonio || '')}</td><td>${esc(x.descricao)}</td><td>${esc(x.categoria || '')}</td>
      <td>${esc([x.marca, x.modelo].filter(Boolean).join(' '))}</td><td>${esc(x.numero_serie || '')}</td>
      <td>${esc(q.nome('locais', x.local_id) || '')}</td><td>${esc(nomeSituacao(x.situacao))}</td><td>${esc(x.responsavel || '')}</td>
      <td>${x.data_compra ? formatarData(x.data_compra) : ''}</td><td class="n">${x.valor_compra != null ? dinheiro(x.valor_compra) : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="9">Total</td><td class="n">${dinheiro(total)}</td></tr></tfoot></table>
    <div class="pe"><img src="${new URL('../img/lop-marca.png', location.href)}" alt=""><span>DESENVOLVIDO POR LOP · INTELIGÊNCIA PARA O AGRONEGÓCIO</span></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
    </body></html>`);
  w.document.close();
}

/* ---------------------------------------------------------------- movimentações

   15/10/2026: segunda tela do módulo Patrimônio. O histórico de todos os bens
   numa lista só — o que saiu, para onde foi, quem levou. Lançar continua sendo
   pela ficha do bem (botão "Registrar movimentação"); aqui é para consultar. */

let filtroMov = { busca: '', local: '', tipo: '', de: '', ate: '' };

TELAS.patrimonio_mov = el => {
  el.innerHTML = `
    <h1>Movimentações</h1>
    <p class="sub">Histórico de todos os bens: transferências, empréstimos, idas para manutenção e baixas.
       Para registrar uma, abra o bem em <strong>Bens</strong>.</p>
    <div class="filtros">
      <input type="search" id="pm-busca" placeholder="Buscar por código, descrição ou responsável" value="${esc(filtroMov.busca)}">
      <select id="pm-local"><option value="">Todas as fazendas</option>
        ${q.ordenado('locais').map(l => `<option value="${esc(l.id)}"${l.id === filtroMov.local ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}
      </select>
      <select id="pm-tipo"><option value="">Todos os tipos</option>
        ${Object.entries(TIPOS_MOV).map(([k, n]) => `<option value="${k}"${k === filtroMov.tipo ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
      <input type="date" id="pm-de" value="${esc(filtroMov.de)}" title="De">
      <input type="date" id="pm-ate" value="${esc(filtroMov.ate)}" title="Até">
    </div>
    <div id="pm-resumo"></div>
    <div id="pm-lista"></div>`;

  const desenhar = () => {
    filtroMov = { busca: $('#pm-busca').value, local: $('#pm-local').value, tipo: $('#pm-tipo').value,
      de: $('#pm-de').value, ate: $('#pm-ate').value };
    const b = filtroMov.busca.toLowerCase();
    const lista = q.todos('patrimonio_movimentos').map(m => [m, q.por_id('bens_patrimonio', m.bem_id)])
      .filter(([m, bem]) => bem &&
        (!filtroMov.local || m.de_local_id === filtroMov.local || m.para_local_id === filtroMov.local) &&
        (!filtroMov.tipo || m.tipo === filtroMov.tipo) &&
        (!filtroMov.de || (m.data || '') >= filtroMov.de) &&
        (!filtroMov.ate || (m.data || '') <= filtroMov.ate) &&
        (!b || [bem.patrimonio, bem.descricao, m.responsavel, m.observacao, m.registrado_por]
          .filter(Boolean).join(' ').toLowerCase().includes(b)))
      .sort(([a], [c]) => (c.data || '').localeCompare(a.data || '') || (c.criado_em || '').localeCompare(a.criado_em || ''));

    const fora = q.ativos('bens_patrimonio').filter(x => x.situacao === 'EMPRESTADO' || x.situacao === 'EM_MANUTENCAO');
    $('#pm-resumo').innerHTML = `<div class="pt-resumo">
        <div><span>Movimentações</span><b>${lista.length}</b></div>
        <div><span>Emprestados agora</span><b>${fora.filter(x => x.situacao === 'EMPRESTADO').length}</b></div>
        <div><span>Em manutenção agora</span><b>${fora.filter(x => x.situacao === 'EM_MANUTENCAO').length}</b></div>
      </div>`;
    $('#pm-lista').innerHTML = lista.length === 0
      ? `<div class="vazio"><p>${q.todos('patrimonio_movimentos').length ? 'Nenhuma movimentação com esses filtros.'
          : 'Nenhuma movimentação registrada ainda.'}</p></div>`
      : `<table class="tabela mq-tabela pt-tabela"><thead><tr>
          <th>Data</th><th>Patrimônio</th><th>Bem</th><th>O que aconteceu</th><th>Fazenda</th><th>Com quem</th><th>Por</th>
        </tr></thead><tbody>` + lista.map(([m, bem]) => {
          const de = q.nome('locais', m.de_local_id), para = q.nome('locais', m.para_local_id);
          const faz = de && para && de !== para ? de + ' → ' + para : (para || de || '—');
          return `<tr data-bem="${esc(bem.id)}" class="clicavel">
            <td>${m.data ? formatarData(m.data) : '—'}</td>
            <td class="codigo">${esc(bem.patrimonio || '—')}</td>
            <td><strong>${esc(bem.descricao)}</strong>${m.observacao ? `<small>${esc(m.observacao)}</small>` : ''}</td>
            <td>${esc(TIPOS_MOV[m.tipo] || m.tipo)}</td>
            <td>${esc(faz)}</td>
            <td>${esc(m.responsavel || '—')}</td>
            <td>${esc(m.registrado_por || '—')}</td>
          </tr>`;
        }).join('') + '</tbody></table>';
    $$('#pm-lista [data-bem]').forEach(tr => tr.onclick = () => fichaBem(tr.dataset.bem));
  };
  ['pm-busca', 'pm-local', 'pm-tipo', 'pm-de', 'pm-ate'].forEach(id => {
    const x = document.getElementById(id); x.oninput = desenhar; x.onchange = desenhar;
  });
  desenhar();
};

Object.assign(window, {
  proximoPatrimonio, normalizarPatrimonio, donoDoPatrimonio, fotoPrincipalHtml, ligarFoto, fichaBem,
});
