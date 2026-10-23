/* =====================================================================
   LOP - Gestão Rápida · "+ Insumo" (21/10/2026, pedido do Guilherme)

   Saída de produto do Estoque Faz. Quebra Cocão (área Estoque › Estoque
   Quebra Cocão) direto do DP › Lançar jornada: direcionador, produto e
   quantidade. Grava em est_movimentos exatamente como a tela "Saídas" do
   estoque da Quebra Cocão grava uma saída do tipo "Uso":
     local_id = estoque da Quebra Cocão · sentido 'saida' · tipo 'uso'
     documento = nº do boletim · plantio = direcionador · operador
   Vários produtos no mesmo lançamento levam o mesmo lancamento_id, e o
   lançamento aparece em Movimentações e no saldo do estoque.

   Usa o visual do painel + Hora máquina (HoraMaquina.estilo). Grava direto
   no servidor: precisa de internet e de acesso à área Estoque.
   ===================================================================== */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const num = v => { if (v == null || v === '') return null; const s = String(v).trim().replace(/\s/g, '');
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : null; };
  const fmt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  async function carregar(cliente) {
    const sb = cliente.schema('public');
    const { data: locais, error } = await sb.from('est_locais').select('id,nome,ativo');
    if (error) throw new Error(error.message);
    const local = (locais || []).find(l => l.ativo !== false && semAcento(l.nome).includes('QUEBRA COCAO'));
    if (!local) return { local: null, itens: [], saldo: new Map(), direcionadores: [], operadores: [] };
    const [ri, rm] = await Promise.all([
      sb.from('est_itens').select('id,nome,unidade,grupo,ativo,locais_contagem'),
      sb.from('est_movimentos').select('item_id,sentido,quantidade,plantio,operador,ativo,pendente').eq('local_id', local.id).limit(20000),
    ]);
    if (ri.error || rm.error) throw new Error((ri.error || rm.error).message);
    const movs = (rm.data || []).filter(m => m.ativo !== false && !m.pendente);   // pendência não mexe no saldo (23/10/2026)
    const saldo = new Map();
    movs.forEach(m => saldo.set(m.item_id, (saldo.get(m.item_id) || 0) + (m.sentido === 'entrada' ? 1 : -1) * (Number(m.quantidade) || 0)));
    const conta = item => !Array.isArray(item.locais_contagem) || !item.locais_contagem.length || item.locais_contagem.includes(local.id);
    const itens = (ri.data || []).filter(i => i.ativo !== false && conta(i))
      .sort((a, b) => String(a.grupo || '').localeCompare(String(b.grupo || ''), 'pt-BR') || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const unicos = c => [...new Set(movs.map(m => m[c]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { local, itens, saldo, direcionadores: unicos('plantio'), operadores: unicos('operador') };
  }

  /** true quando este login enxerga o estoque da Quebra Cocão. */
  async function disponivel(cliente) {
    if (!cliente || !navigator.onLine) return false;
    try {
      const { data } = await cliente.schema('public').from('est_locais').select('nome').limit(50);
      return (data || []).some(l => semAcento(l.nome).includes('QUEBRA COCAO'));
    } catch (e) { return false; }
  }

  /** op = { cliente, data?, operador?, boletim?, aoSalvar? } */
  async function abrir(op) {
    if (window.HoraMaquina && HoraMaquina.estilo) HoraMaquina.estilo();
    if (!document.getElementById('ins-estilo')) {
      const st = document.createElement('style'); st.id = 'ins-estilo';
      st.textContent = `
.ins-lin{display:grid;grid-template-columns:minmax(0,1fr) 120px 36px;gap:8px;align-items:start;margin-bottom:8px}
.ins-lin small{grid-column:1/-1;margin-top:-4px;font-size:12px;color:#8A8C83}
.ins-lin small.neg{color:#9B2C22;font-weight:bold}
.ins-x{border:1px solid #D5D7CF;background:#fff;border-radius:8px;min-height:44px;font-size:20px;cursor:pointer;color:#8A8C83}
.hm-cab.ins{background:#744F28}
@media(max-width:560px){.ins-lin{grid-template-columns:1fr 90px 36px}}`;
      document.head.appendChild(st);
    }
    const fundo = document.createElement('div');
    fundo.className = 'hm-fundo';
    fundo.innerHTML = `<div class="hm-caixa" role="dialog" aria-modal="true">
      <div class="hm-cab ins"><b>+ Insumo</b><small>saída · Estoque Faz. Quebra Cocão</small><button type="button" class="hm-x" aria-label="Fechar">×</button></div>
      <div class="hm-corpo"><p>Carregando os produtos…</p></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.querySelector('.hm-x').onclick = fechar;
    fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
    const corpo = fundo.querySelector('.hm-corpo');

    if (!navigator.onLine) { corpo.innerHTML = '<div class="hm-erro">Sem internet. A saída de insumo grava direto no servidor — lance quando a conexão voltar.</div>'; return; }
    let c;
    try { c = await carregar(op.cliente); }
    catch (e) {
      corpo.innerHTML = /permission|security|denied/i.test(e.message)
        ? '<div class="hm-erro">Seu login não tem acesso à área Estoque. Peça ao administrador.</div>'
        : `<div class="hm-erro">Não consegui ler o estoque: ${esc(e.message)}</div>`;
      return;
    }
    if (!c.local) { corpo.innerHTML = '<div class="hm-erro">Não achei o "Estoque Faz. Quebra Cocão" em Estoque › Cadastros › Almoxarifados.</div>'; return; }
    if (!c.itens.length) {
      corpo.innerHTML = '<div class="hm-erro">Ainda não há produtos no estoque da Quebra Cocão. Cadastre os produtos ou use "Importar planilhas antigas" em Estoque › Estoque Quebra Cocão.</div>';
      return;
    }
    const itemPorNome = nome => c.itens.find(i => semAcento(i.nome) === semAcento(nome));
    const linha = () => `<div class="ins-lin">
      <div class="hm-c"><input type="text" class="ins-prod" list="ins-produtos" placeholder="produto" autocomplete="off" aria-label="Produto"></div>
      <div class="hm-c"><input type="text" class="ins-qtd" inputmode="decimal" placeholder="qtde" autocomplete="off" aria-label="Quantidade"></div>
      <button type="button" class="ins-x" title="Tirar" aria-label="Tirar a linha">×</button>
      <small class="ins-info"></small></div>`;
    corpo.innerHTML = `
      <div class="hm-erro" id="ins-erro" hidden></div>
      <div class="hm-l hm-tres">
        <div class="hm-c"><label for="ins-data">Data</label><input type="date" id="ins-data" value="${esc(op.data || hojeISO())}" max="${hojeISO()}"></div>
        <div class="hm-c"><label for="ins-doc">Nº boletim / doc. *</label><input type="text" id="ins-doc" value="${esc(op.boletim || '')}" maxlength="30" autocomplete="off"></div>
        <div class="hm-c"><label for="ins-oper">Operador *</label><input type="text" id="ins-oper" list="ins-operadores" value="${esc(op.operador || '')}" maxlength="80"></div>
      </div>
      <div class="hm-l um"><div class="hm-c"><label for="ins-dir">Direcionador * <small style="display:inline;font-weight:normal">(plantio, área, máquina ou local)</small></label>
        <input type="text" id="ins-dir" list="ins-direcionadores" autocomplete="off" maxlength="120"></div></div>
      <div class="hm-c"><label>Produtos e quantidades *</label></div>
      <div id="ins-lins">${linha()}${linha()}</div>
      <p style="margin:0 0 12px"><button type="button" class="hm-btn n" id="ins-mais" style="min-height:36px;padding:6px 12px;font-size:13px">+ produto</button></p>
      <div class="hm-l um"><div class="hm-c"><label for="ins-obs">Observação</label><input type="text" id="ins-obs" maxlength="200"></div></div>
      <div class="hm-acoes">
        <button type="button" class="hm-btn p" id="ins-salvar" style="background:#744F28">Dar saída</button>
        <button type="button" class="hm-btn n" id="ins-fechar">Fechar</button>
      </div>
      <datalist id="ins-produtos">${c.itens.map(i => `<option value="${esc(i.nome)}">${esc(i.unidade || '')} · saldo ${fmt(c.saldo.get(i.id) || 0)}</option>`).join('')}</datalist>
      <datalist id="ins-direcionadores">${c.direcionadores.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <datalist id="ins-operadores">${c.operadores.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    const $ = id => corpo.querySelector('#' + id);
    const erro = t => { $('ins-erro').hidden = !t; $('ins-erro').textContent = t || ''; if (t) $('ins-erro').scrollIntoView({ block: 'nearest' }); };

    const ligar = () => corpo.querySelectorAll('.ins-lin:not([data-ok])').forEach(l => {
      l.dataset.ok = '1';
      const info = () => {
        const it = itemPorNome(l.querySelector('.ins-prod').value), q = num(l.querySelector('.ins-qtd').value);
        const s = l.querySelector('.ins-info');
        if (!l.querySelector('.ins-prod').value) { s.textContent = ''; s.className = 'ins-info'; return; }
        if (!it) { s.textContent = 'Produto não cadastrado no estoque da Quebra Cocão — escolha da lista.'; s.className = 'ins-info neg'; return; }
        const sd = c.saldo.get(it.id) || 0, fica = sd - (q || 0);
        s.textContent = `${it.grupo || ''} · saldo ${fmt(sd)} ${it.unidade || ''}${q ? ` · fica ${fmt(fica)} ${it.unidade || ''}` : ''}`;
        s.className = 'ins-info' + (q && fica < 0 ? ' neg' : '');
      };
      l.querySelector('.ins-prod').addEventListener('input', info);
      l.querySelector('.ins-qtd').addEventListener('input', info);
      l.querySelector('.ins-x').onclick = () => { if (corpo.querySelectorAll('.ins-lin').length > 1) l.remove(); else { l.querySelectorAll('input').forEach(i => { i.value = ''; }); info(); } };
    });
    ligar();
    $('ins-mais').onclick = () => { $('ins-lins').insertAdjacentHTML('beforeend', linha()); ligar(); };
    $('ins-fechar').onclick = fechar;

    $('ins-salvar').onclick = async () => {
      erro('');
      const data = $('ins-data').value, doc = $('ins-doc').value.trim(), oper = $('ins-oper').value.trim(), dir = $('ins-dir').value.trim();
      if (!data) return erro('Informe a data.');
      if (data > hojeISO()) return erro('A data não pode ser no futuro.');
      if (!doc) return erro('Informe o nº do boletim ou documento.');
      if (!oper) return erro('Informe o operador.');
      if (!dir) return erro('Informe o direcionador.');
      const linhas = [];
      for (const l of corpo.querySelectorAll('.ins-lin')) {
        const nome = l.querySelector('.ins-prod').value.trim(), q = num(l.querySelector('.ins-qtd').value);
        if (!nome && q == null) continue;
        const it = itemPorNome(nome);
        if (!it) return erro(`"${nome || '(sem produto)'}" não está cadastrado no estoque da Quebra Cocão.`);
        if (q == null || q <= 0) return erro(`Informe a quantidade de ${it.nome}.`);
        linhas.push({ it, q });
      }
      if (!linhas.length) return erro('Escolha pelo menos um produto e a quantidade.');
      // falta estoque: sai o que tem e o resto fica em Pendências (23/10/2026, mesma regra da tela Saídas)
      const disp = new Map(c.saldo);
      linhas.forEach(x => { const tem = Math.max(0, disp.get(x.it.id) || 0); x.sai = Math.min(x.q, tem); x.pend = Math.round((x.q - x.sai) * 1000) / 1000; disp.set(x.it.id, tem - x.sai); });
      const faltam = linhas.filter(x => x.pend > 0);
      if (faltam.length && !confirm(`Falta estoque:\n${faltam.map(x => `${x.it.nome}: sai ${fmt(x.sai)}, fica pendente ${fmt(x.pend)}`).join('\n')}\n\nSai o que tem e o resto fica em Estoque › Pendências. Lançar assim?`)) return;
      const b = $('ins-salvar'); b.disabled = true; b.textContent = 'Salvando…';
      const lanc = uuid(), agora = new Date().toISOString(), obs = $('ins-obs').value.trim();
      const linhaDe = (x, q, pend) => ({
        id: uuid(), local_id: c.local.id, data, sentido: 'saida', tipo: 'uso', item_id: x.it.id, quantidade: q,
        documento: doc, plantio: dir, operador: oper, obs: obs || null, lancamento_id: lanc,
        criado_por: 'DP · + Insumo', ativo: true, atualizado_em: agora,
        pendente: pend, pendente_desde: pend ? data : null,
      });
      const rows = linhas.flatMap(x => [x.sai > 0 ? linhaDe(x, x.sai, false) : null, x.pend > 0 ? linhaDe(x, x.pend, true) : null].filter(Boolean));
      const { error } = await op.cliente.schema('public').from('est_movimentos').insert(rows);
      if (error) {
        b.disabled = false; b.textContent = 'Dar saída';
        return erro(/security|permission/i.test(error.message) ? 'Seu login não pode lançar no Estoque. Peça ao administrador.' : 'Não salvou: ' + error.message);
      }
      linhas.forEach(x => c.saldo.set(x.it.id, (c.saldo.get(x.it.id) || 0) - x.sai));
      b.textContent = '✓ Saída lançada';
      if (typeof op.aoSalvar === 'function') { try { op.aoSalvar(rows); } catch (e) {} }
      setTimeout(() => {   // pronto para o próximo: mantém data, boletim, operador e direcionador
        b.disabled = false; b.textContent = 'Dar saída';
        $('ins-lins').innerHTML = linha() + linha(); ligar(); $('ins-obs').value = '';
      }, 800);
    };
  }

  window.Insumo = { abrir, disponivel };
})();
