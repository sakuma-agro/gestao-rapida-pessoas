/* =====================================================================
   LOP - Gestão Rápida · Manutenções — ATUALIZAR HORÍMETROS (28/10/2026)

   Pedido do Guilherme: um módulo só para atualizar os horímetros.
     Matriz        → 100% pelo arquivo (relatório da Realtec). Anexa,
                     confere a lista do que muda e grava.
     Quebra Cocão  → lançado à mão por enquanto: uma linha por máquina,
                     um campo só, um botão Salvar. No futuro pode ser pelo
                     arquivo também.
   Quem lança é básico: escolhe a fazenda, preenche, salva.
   ===================================================================== */

let fazHorimetro = '';   // id do local escolhido nesta tela

function localPorNome(trecho) {
  const t = trecho.toUpperCase();
  return q.ordenado('locais').find(l => String(l.nome || '').toUpperCase().includes(t)) || null;
}

TELAS.atualizar_horimetros = el => {
  const matriz = localPorNome('MATRIZ');
  const qc = localPorNome('QUEBRA');
  if (!fazHorimetro) fazHorimetro = matriz ? matriz.id : (qc ? qc.id : '');
  const ehQC = qc && fazHorimetro === qc.id;

  el.innerHTML = `
    <div id="ah-tela">
      <div class="pn-cabeca"><h1>Horímetros</h1>
        <button type="button" class="btn neutro" id="ah-lancados">Ver horímetros lançados</button></div>
      ${guiaPassos('horimetros', [
        'Escolha a fazenda',
        'Matriz: anexe o <b>relatório da Realtec</b>. Quebra Cocão: escreva o <b>número do painel</b> de cada máquina',
        'Toque em <b>Gravar</b> / <b>Salvar</b> — os vencimentos se acertam sozinhos'])}
      <div class="ah-faz">
        ${matriz ? `<button type="button" class="ah-op${!ehQC ? ' ativa' : ''}" data-faz="${esc(matriz.id)}">
          <b>${esc(matriz.nome)}</b><small>pelo arquivo</small></button>` : ''}
        ${qc ? `<button type="button" class="ah-op${ehQC ? ' ativa' : ''}" data-faz="${esc(qc.id)}">
          <b>${esc(qc.nome)}</b><small>lançar à mão</small></button>` : ''}
      </div>
      <div id="ah-corpo"></div>
    </div>`;
  el.querySelector('#ah-lancados').onclick = () => irPara('horimetros');
  el.querySelectorAll('[data-faz]').forEach(b => b.onclick = () => { fazHorimetro = b.dataset.faz; TELAS.atualizar_horimetros(el); });

  const corpo = el.querySelector('#ah-corpo');
  if (ehQC) return horimetroManual(corpo, qc, () => TELAS.atualizar_horimetros(el));
  horimetroArquivo(corpo, matriz);
};

/* ---- Matriz: pelo arquivo ---- */
function horimetroArquivo(corpo, local) {
  if (!local) { corpo.innerHTML = '<div class="vazio"><p>Fazenda Matriz não encontrada no cadastro.</p></div>'; return; }
  const ult = maquinasComMostrador(local.id)
    .map(e => e.leitura_data).filter(Boolean).sort().pop();
  corpo.innerHTML = `
    <div class="ah-cartao">
      <div class="ir-passo"><b>1</b> Anexe o relatório da Realtec <small>(Operações mecanizadas analítico, CSV ou Excel)</small></div>
      <label class="ir-arq">📎 Escolher o arquivo<input type="file" id="ah-arq" accept=".csv,.txt,.xlsx,.xls"></label>
      <p class="ajuda">${ult ? 'Última leitura na Matriz: ' + formatarData(ult) + '. ' : ''}Precisa de internet. Importar o mesmo arquivo de novo não soma duas vezes.</p>
      <div class="ir-passo"><b>2</b> Confira a lista e toque em <em>Gravar</em></div>
      <div id="ir-passo"></div>
    </div>
    ${painelUltimos(local)}`;
  corpo.querySelector('#ah-arq').onchange = ev => {
    const arq = ev.target.files[0];
    if (!arq) return;
    if (!ehAdmin()) { ev.target.value = ''; return aviso('Só o administrador importa o arquivo.', true); }
    corpo.querySelector('.ir-arq').firstChild.textContent = '📎 ' + arq.name;
    importarHorimetrosArquivo(arq, corpo.querySelector('#ir-passo'), local.id);
  };
}

/* Painel do último horímetro (28/10/2026, pedido dele: "painel de último
   horímetro com data"). Cada máquina com horímetro ou km da fazenda: o último
   número, a data da leitura e há quantos dias — as mais velhas no topo,
   amarelo a partir de 7 dias, vermelho a partir de 30. */
function painelUltimos(local) {
  const maqs = maquinasComMostrador(local.id).filter(e => typeof noGrupo !== 'function' || noGrupo(e));
  if (!maqs.length) return '';
  const idade = e => e.leitura_data ? diasEntre(String(e.leitura_data).slice(0, 10), hoje()) : Infinity;
  const lista = maqs.slice().sort((a, b) => idade(b) - idade(a) || porCodigo(a, b));
  const velhas = lista.filter(e => idade(e) >= 7).length;
  return `<div class="ah-cartao ah-painel">
    <div class="ah-painel-top"><b>Último horímetro de cada máquina · ${esc(local.nome)}</b>
      <span>${lista.length} máquinas${velhas ? ` · <em class="ah-velho">${velhas} com mais de 7 dias</em>` : ' · todas em dia'}</span></div>
    <table class="tabela ah-tab"><thead><tr><th>Máquina</th><th class="num">Último</th><th>Data</th><th>Há</th></tr></thead><tbody>
    ${lista.map(e => { const d = idade(e), u = unidadeDe(e);
      const cls = d === Infinity || d >= 30 ? 'ah-r' : d >= 7 ? 'ah-y' : '';
      return `<tr class="${cls}"><td><span class="codigo">${esc(e.codigo)}</span> ${esc(e.descricao || '')}</td>
        <td class="num"><b>${leituraDe(e) != null ? nHoras(leituraDe(e)) + ' ' + u : '—'}</b></td>
        <td>${e.leitura_data ? formatarData(e.leitura_data) : '—'}</td>
        <td>${d === Infinity ? 'nunca lançado' : d === 0 ? 'hoje' : d === 1 ? 'ontem' : d + ' dias'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}

/* ---- Quebra Cocão: à mão ---- */
function maquinasComMostrador(localId) {
  return q.ativos('equipamentos')
    .filter(e => e.local_id === localId && ['HORIMETRO', 'HODOMETRO'].includes(e.unidade_controle)
      && !['VENDIDO', 'BAIXADO'].includes(e.status))
    .sort(porCodigo);
}

function horimetroManual(corpo, local, depois) {
  const maqs = maquinasComMostrador(local.id);
  if (!maqs.length) { corpo.innerHTML = `<div class="vazio"><p>Nenhuma máquina com horímetro em ${esc(local.nome)}.</p></div>`; return; }
  const idade = e => e.leitura_data ? diasEntre(String(e.leitura_data).slice(0, 10), hoje()) : null;
  corpo.innerHTML = `
    <div class="ah-cartao">
      <div class="ah-topo">
        <label>Data da leitura<input type="date" id="ah-data" value="${hoje()}" max="${hoje()}"></label>
        <span class="ajuda">Escreva o número do mostrador de cada máquina. Deixe em branco o que não leu.</span>
      </div>
      <div class="ah-lista">
        ${maqs.map(e => {
          const d = idade(e), u = unidadeDe(e);
          return `<div class="ah-linha" data-id="${esc(e.id)}">
            <span class="ah-cod">${esc(e.codigo)}</span>
            <span class="ah-nm"><b>${esc(e.descricao || '')}</b>
              <small>último: ${leituraDe(e) != null ? nHoras(leituraDe(e)) + ' ' + u : '—'}${e.leitura_data ? ' em ' + formatarData(e.leitura_data) : ''}${d == null ? ' · nunca lançado'
                : ` · <em class="${d >= 7 ? 'ah-velho' : ''}">${d === 0 ? 'hoje' : d === 1 ? 'ontem' : 'há ' + d + ' dias'}</em>`}</small></span>
            <input type="number" inputmode="decimal" step="0.1" placeholder="novo (${u})" data-valor>
            <span class="ah-msg"></span>
          </div>`; }).join('')}
      </div>
      <div class="acoes"><button type="button" class="btn ah-salvar" id="ah-salvar">✓ Salvar os preenchidos</button></div>
    </div>`;

  corpo.querySelector('#ah-salvar').onclick = async () => {
    const data = corpo.querySelector('#ah-data').value;
    if (!data) return aviso('Informe a data da leitura.', true);
    if (data > hoje()) return aviso('A data não pode ser no futuro.', true);
    const linhas = [...corpo.querySelectorAll('.ah-linha')]
      .map(l => ({ l, e: q.por_id('equipamentos', l.dataset.id), v: num(l.querySelector('[data-valor]').value) }))
      .filter(x => x.v != null);
    if (!linhas.length) return aviso('Preencha pelo menos uma máquina.', true);
    // Horímetro não anda para trás: essas ficam marcadas e não salvam.
    let ruins = 0;
    linhas.forEach(x => {
      const atual = leituraDe(x.e);
      const volta = atual != null && x.v < atual;
      x.l.classList.toggle('ah-erro', volta);
      x.l.querySelector('.ah-msg').textContent = volta ? 'menor que o último — confira' : '';
      if (volta) ruins++;
    });
    if (ruins) return aviso(ruins + ' máquina(s) com número menor que o último. Corrija ou apague o campo.', true);

    const b = corpo.querySelector('#ah-salvar'); b.disabled = true; b.textContent = 'Salvando…';
    const agora = new Date().toISOString();
    for (const x of linhas) {
      await gravar('leituras', {
        id: crypto.randomUUID(), uuid_dispositivo: crypto.randomUUID(), equipamento_id: x.e.id,
        data_leitura: data, valor: x.v, origem: 'MANUAL', troca_aparelho: false,
        registrado_em: agora, criado_por: App.usuario.id || null
      });
      if (!x.e.leitura_data || data >= x.e.leitura_data) {
        await gravar('equipamentos', Object.assign(limparBem(x.e), { leitura_atual: x.v, leitura_data: data }));
      }
    }
    aviso(App.online ? `${linhas.length} horímetro(s) atualizado(s). Os vencimentos já foram recalculados.`
                     : 'Salvo no aparelho. Sobe quando a internet voltar.');
    depois();
  };
}
