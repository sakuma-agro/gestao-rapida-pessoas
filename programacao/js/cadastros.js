/* =====================================================================
   Gestão Rápida · Programação Campo — cadastros e importação
   Tudo editável pela tela. Item já usado nunca é apagado: é desativado.
   ===================================================================== */

/* 15/10/2026 (LOP - Gestão Rápida): fazendas, operadores e as máquinas e
   implementos da frota vêm dos cadastros do LOP — fazendas e frota de Máquinas
   e Patrimônio, operadores dos funcionários do Pessoas. Aqui ficam só os
   cadastros próprios da Programação e a lista curta de genéricos (Trator,
   Grade…), que o Guilherme decidiu manter ao lado das máquinas reais. */
const CADASTROS = [
  { t: 'locais', nome: 'Locais', campos: [['nome', 'Nome *'], ['fazenda_id', 'Fazenda *', 'fazendas'],
      ['cultura_id', 'Cultura fixa (abacate, café…)', 'culturas'], ['ordem', 'Ordem no painel', 'numero']] },
  { t: 'culturas', nome: 'Culturas', campos: [['nome', 'Nome *'], ['cor', 'Cor no painel', 'cor']] },
  { t: 'tipos_atividade', nome: 'Atividades', campos: [['nome', 'Nome *']] },
  { t: 'maquinas_genericas', nome: 'Máquinas genéricas', campos: [['nome', 'Nome *'], ['tipo', 'Tipo']] },
  { t: 'implementos_genericos', nome: 'Implementos genéricos', campos: [['nome', 'Nome *']] },
];

const USO = {
  locais: r => atividadesVisiveis().some(a => a.local_id === r.id),
  culturas: r => atividadesVisiveis().some(a => a.cultura_id === r.id),
  tipos_atividade: r => atividadesVisiveis().some(a => a.tipo_id === r.id),
  maquinas_genericas: r => atividadesVisiveis().some(a => a.maquina_id === r.id),
  implementos_genericos: r => atividadesVisiveis().some(a => a.implemento_id === r.id),
};

let abaCadastro = 'locais';
let verInativos = false;

TELAS.cadastros = el => {
  document.body.classList.remove('modo-quadro');
  const cad = CADASTROS.find(c => c.t === abaCadastro);
  const lista = (verInativos ? q.todos(cad.t) : q.ativos(cad.t)).slice().sort((a, b) =>
    cad.t === 'locais' || cad.t === 'fazendas'
      ? 0 : a.nome.localeCompare(b.nome, 'pt-BR'));
  const ordenada = cad.t === 'locais'
    ? locaisOrdenados(!verInativos)
    : cad.t === 'fazendas' ? fazendasOrdenadas(!verInativos) : lista;

  el.innerHTML = `
    <h1>Cadastros</h1>
    <p class="sub">O que aparece nas listas do lançamento e no painel. Item já usado em atividade não é apagado — fica desativado.</p>
    <p class="ajuda">Operadores vêm dos funcionários ativos da área <strong>Pessoas</strong>. Fazendas, máquinas e
      implementos da frota vêm de <strong>Máquinas e Patrimônio</strong>. Cadastre lá e eles aparecem aqui.</p>
    <div class="abas">${CADASTROS.map(c =>
      `<button type="button" data-aba="${c.t}" class="${c.t === abaCadastro ? 'ativo' : ''}">${esc(c.nome)}
        <small>(${q.ativos(c.t).length})</small></button>`).join('')}</div>
    <div class="acoes">
      <button type="button" class="btn" id="cd-novo">Novo</button>
      <label class="pc-cx"><input type="checkbox" id="cd-inat" ${verInativos ? 'checked' : ''}> Mostrar desativados</label>
    </div>
    <div class="rolagem"><table class="tabela pc-grade">
      <thead><tr>${cad.campos.map(([, r]) => `<th>${esc(r.replace(' *', ''))}</th>`).join('')}<th></th></tr></thead>
      <tbody>${ordenada.map(r => `<tr data-id="${r.id}" class="${r.ativo === false ? 'pc-inativo' : ''}">
        ${cad.campos.map(([c, , tipo]) => `<td>${valorCelula(r, c, tipo)}</td>`).join('')}
        <td>${r.ativo === false ? '<span class="etq inativo">desativado</span>' : ''}</td></tr>`).join('')
        || `<tr><td colspan="${cad.campos.length + 1}">Nada cadastrado.</td></tr>`}</tbody>
    </table></div>`;

  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { abaCadastro = b.dataset.aba; TELAS.cadastros(el); });
  el.querySelector('#cd-inat').onchange = e => { verInativos = e.target.checked; TELAS.cadastros(el); };
  el.querySelector('#cd-novo').onclick = () => editarCadastro(cad, {}, () => TELAS.cadastros(el));
  el.querySelectorAll('tbody tr[data-id]').forEach(tr => tr.onclick = () =>
    editarCadastro(cad, q.por_id(cad.t, tr.dataset.id), () => TELAS.cadastros(el)));
};

function valorCelula(r, c, tipo) {
  const v = r[c];
  if (tipo === 'cor') return `<span class="pc-cor" style="background:${esc(v || '#E2EFD0')}"></span>${esc(v || '')}`;
  if (tipo === 'fazendas' || tipo === 'culturas') {
    const n = q.nome(tipo, v);
    return tipo === 'culturas' && v ? `<span class="pc-cor" style="background:${esc(corCultura(v))}"></span>${esc(n)}` : esc(n);
  }
  if (c === 'nome') return `<strong>${esc(v)}</strong>`;
  return esc(v ?? '');
}

function editarCadastro(cad, reg, depois) {
  const novo = !reg.id;
  const usado = !novo && USO[cad.t] && USO[cad.t](reg);
  abrirModal(`${novo ? 'Novo' : 'Editar'} · ${cad.nome}`, `
    ${cad.campos.map(([c, rot, tipo]) => {
      if (tipo === 'fazendas') return campoLista(rot, c, fazendasOrdenadas(), reg[c], rot.includes('*') ? '— selecione —' : '— nenhuma —');
      if (tipo === 'culturas') return campoLista(rot, c, q.ordenado('culturas'), reg[c], '— nenhuma —');
      if (tipo === 'cor') return campoTexto(rot, c, reg[c] || '#E2EFD0', 'color');
      if (tipo === 'numero') return campoTexto(rot, c, reg[c] ?? '', 'number');
      return campoTexto(rot, c, reg[c] || '');
    }).join('')}
    <div class="acoes">
      <button type="button" class="btn" id="cd-ok">Salvar</button>
      ${!novo && reg.ativo !== false ? `<button type="button" class="btn neutro" id="cd-off">${usado ? 'Desativar' : 'Desativar'}</button>` : ''}
      ${!novo && reg.ativo === false ? '<button type="button" class="btn secundario" id="cd-on">Reativar</button>' : ''}
    </div>
    ${usado ? '<p class="ajuda">Este item já foi usado em atividades — por isso não é apagado.</p>' : ''}`, corpo => {
    corpo.querySelector('#cd-ok').onclick = async () => {
      const f = lerForm(corpo);
      const nome = (f.nome || '').replace(/\s+/g, ' ').trim();
      if (!nome) return aviso('Informe o nome.', true);
      const repetido = q.todos(cad.t).find(x => x.id !== reg.id &&
        x.nome.localeCompare(nome, 'pt-BR', { sensitivity: 'base' }) === 0);
      if (repetido) return aviso(`Já existe "${repetido.nome}"${repetido.ativo === false ? ' (desativado — reative)' : ''}.`, true);
      if (cad.t === 'locais' && !f.fazenda_id) return aviso('Escolha a fazenda do local.', true);
      const r = Object.assign({}, reg, { nome, ativo: reg.ativo !== false });
      cad.campos.forEach(([c, , tipo]) => {
        if (c === 'nome') return;
        r[c] = tipo === 'numero' ? (num(f[c]) ?? 0) : (f[c] ?? null);
      });
      await gravar(cad.t, r);
      fecharModal(); aviso('Salvo.'); depois();
    };
    const off = corpo.querySelector('#cd-off');
    if (off) off.onclick = async () => {
      if (!confirm(`Desativar "${reg.nome}"? Ele some das listas, mas o histórico continua.`)) return;
      await gravar(cad.t, Object.assign({}, reg, { ativo: false }));
      fecharModal(); aviso('Desativado.'); depois();
    };
    const on = corpo.querySelector('#cd-on');
    if (on) on.onclick = async () => {
      await gravar(cad.t, Object.assign({}, reg, { ativo: true }));
      fecharModal(); aviso('Reativado.'); depois();
    };
  });
}

/* ---------------------------------------------------------------- importar planilha

   Lê a aba "Tarefas" do "Planejamento Anual – Sakuma SK-01.xlsx".
   Nome que não existe no cadastro é criado na hora (com aviso na prévia).
   Linha igual a uma atividade que já existe (mesma data, local, cultura e
   atividade) é pulada, para poder importar a planilha mais de uma vez. */

const limpa = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const chaveNome = v => limpa(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function dataPlanilha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return montaData(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? montaData(d.y, d.m, d.d) : null;
  }
  const s = limpa(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return montaData(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const STATUS_PLANILHA = {
  'planejado': 'Planejado', 'em andamento': 'Em andamento', 'concluido': 'Concluído',
  'cancelado': 'Cancelado', 'atrasado': 'Planejado'   // atrasado é calculado pela data
};

TELAS.importar = el => {
  document.body.classList.remove('modo-quadro');
  el.innerHTML = `
    <h1>Importar planilha</h1>
    <p class="sub">Escolha a planilha "Planejamento Anual" (.xlsx). O app lê a aba <strong>Tarefas</strong>
      (Data, Local, Cultura, Atividade, Operador, Máquina, Implemento, Duração, Status, Observações) e mostra
      uma prévia antes de gravar. Linhas sem data são ignoradas e atividades repetidas são puladas.</p>
    <div class="pc-cartao">
      <div class="campo"><label for="im-arq">Arquivo</label>
        <input type="file" id="im-arq" accept=".xlsx,.xlsm,.xls"></div>
    </div>
    <div id="im-previa"></div>`;
  el.querySelector('#im-arq').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    if (!window.XLSX) return aviso('A leitura de Excel não carregou. Abra o app com internet.', true);
    try {
      const wb = XLSX.read(await arq.arrayBuffer(), { cellDates: true });
      const aba = wb.SheetNames.find(n => chaveNome(n) === 'tarefas') || wb.SheetNames[0];
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { defval: null });
      previaImportacao(el.querySelector('#im-previa'), linhas, aba);
    } catch (err) {
      aviso('Não consegui ler o arquivo: ' + err.message, true);
    }
  };
};

function previaImportacao(alvo, linhas, aba) {
  const col = (l, ...nomes) => {
    const k = Object.keys(l).find(x => nomes.includes(chaveNome(x)));
    return k ? l[k] : null;
  };
  const achar = (t, nome) => nome ? q.todos(t).find(x => chaveNome(x.nome) === chaveNome(nome)) : null;
  const novos = { fazendas: new Map(), locais: new Map(), culturas: new Map(), tipos_atividade: new Map(),
                  operadores: new Map(), maquinas: new Map(), implementos: new Map() };
  const itens = [], erros = [];
  const existentes = new Set(atividadesVisiveis().map(a =>
    [a.data, a.local_id, a.cultura_id, a.tipo_id].join('|')));

  linhas.forEach((l, i) => {
    const data = dataPlanilha(col(l, 'data'));
    const local = limpa(col(l, 'local'));
    const cultura = limpa(col(l, 'cultura'));
    const atividade = limpa(col(l, 'atividade', 'tarefa'));
    if (!data && !local && !atividade) return;   // linha vazia
    if (!data) { erros.push(`Linha ${i + 2}: sem data.`); return; }
    if (!local || !cultura || !atividade) { erros.push(`Linha ${i + 2}: falta local, cultura ou atividade.`); return; }
    const reg = {
      linha: i + 2, data, local, cultura, atividade,
      operador: limpa(col(l, 'operador')), maquina: limpa(col(l, 'maquina')),
      implemento: limpa(col(l, 'implemento')),
      horas: num(col(l, 'duracao (h)', 'duracao', 'horas')),
      status: STATUS_PLANILHA[chaveNome(col(l, 'status'))] || 'Planejado',
      obs: limpa(col(l, 'observacoes', 'observacao')) || null,
      plantio: limpa(col(l, 'plantio')) || null
    };
    // local novo: a fazenda sai do nome ("Pivot 2 - Três Riachos" → Três Riachos)
    [['locais', reg.local], ['culturas', reg.cultura], ['tipos_atividade', reg.atividade],
     ['operadores', reg.operador], ['maquinas', reg.maquina], ['implementos', reg.implemento]].forEach(([t, n]) => {
      if (n && !achar(t, n)) novos[t].set(chaveNome(n), n);
    });
    itens.push(reg);
  });

  // fazenda dos locais novos
  const fazDoLocal = {};
  novos.locais.forEach((nome, k) => {
    const parte = nome.split(' - ').pop();
    const f = q.todos('fazendas').find(x => chaveNome(x.nome).includes(chaveNome(parte)) || chaveNome(parte).includes(chaveNome(x.nome)));
    if (f) fazDoLocal[k] = f.id;
    else { novos.fazendas.set(chaveNome(parte), parte); fazDoLocal[k] = 'novo:' + chaveNome(parte); }
  });

  const faltam = Object.entries(novos).filter(([, m]) => m.size);
  const rotulos = { fazendas: 'Fazendas', locais: 'Locais', culturas: 'Culturas', tipos_atividade: 'Atividades',
                    operadores: 'Operadores', maquinas: 'Máquinas', implementos: 'Implementos' };

  alvo.innerHTML = `
    <div class="painel pc-ind">
      <div class="cartao"><b>${itens.length}</b><span>linhas com atividade (aba ${esc(aba)})</span></div>
      <div class="cartao ${erros.length ? 'alerta' : ''}"><b>${erros.length}</b><span>linhas com problema</span></div>
      <div class="cartao"><b>${faltam.reduce((s, [, m]) => s + m.size, 0)}</b><span>nomes novos no cadastro</span></div>
    </div>
    ${faltam.length ? `<div class="pc-cartao"><h2>Vão ser cadastrados</h2>${faltam.map(([t, m]) =>
      `<p><strong>${rotulos[t]}:</strong> ${[...m.values()].map(esc).join(', ')}</p>`).join('')}
      <p class="ajuda">Se algum for erro de digitação, corrija na planilha antes de importar.</p></div>` : ''}
    ${erros.length ? `<details class="pc-cartao"><summary>${erros.length} linha(s) ignorada(s)</summary>
      <ul>${erros.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    <div class="rolagem"><table class="tabela pc-grade"><thead><tr>
      <th>Linha</th><th>Data</th><th>Sem.</th><th>Local</th><th>Cultura</th><th>Atividade</th><th>Operador</th>
      <th>Máquina / implemento</th><th>Status</th></tr></thead><tbody>
      ${itens.map(r => `<tr><td>${r.linha}</td><td>${br(r.data)}</td><td>S${semanaDe(r.data)} ${MESES_CURTOS[partes(r.data).mes - 1]}</td>
        <td>${esc(r.local)}</td><td>${esc(r.cultura)}</td><td>${esc(r.atividade)}</td>
        <td>${esc(r.operador) || '<span class="pc-falta">a definir</span>'}</td>
        <td>${esc([r.maquina, r.implemento].filter(Boolean).join(' + '))}</td><td>${esc(r.status)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="acoes">
      <button type="button" class="btn" id="im-ok" ${itens.length ? '' : 'disabled'}>Importar ${itens.length} atividade(s)</button>
    </div>`;

  const bt = alvo.querySelector('#im-ok');
  bt.onclick = async () => {
    bt.disabled = true; bt.textContent = 'Importando…';
    const ids = {};
    // 1) cadastros novos, na ordem das dependências
    for (const t of ['fazendas', 'culturas', 'tipos_atividade', 'operadores', 'maquinas', 'implementos', 'locais']) {
      for (const [k, nome] of novos[t]) {
        const r = { id: crypto.randomUUID(), nome, ativo: true };
        if (t === 'fazendas') r.ordem = 99;
        if (t === 'locais') {
          const fz = fazDoLocal[k];
          r.fazenda_id = fz.startsWith('novo:') ? ids['fazendas|' + fz.slice(5)] : fz;
          r.ordem = 99;
        }
        await gravar(t, r);
        ids[t + '|' + k] = r.id;
      }
    }
    const idDe = (t, n) => n ? (ids[t + '|' + chaveNome(n)] || (achar(t, n) || {}).id || null) : null;
    // 2) atividades
    let criadas = 0, puladas = 0;
    for (const r of itens) {
      const a = {
        id: crypto.randomUUID(), data: r.data,
        local_id: idDe('locais', r.local), cultura_id: idDe('culturas', r.cultura),
        tipo_id: idDe('tipos_atividade', r.atividade), operador_id: idDe('operadores', r.operador),
        maquina_id: idDe('maquinas', r.maquina), implemento_id: idDe('implementos', r.implemento),
        horas_previstas: r.horas, status: r.status, observacoes: r.obs, plantio: r.plantio, ativo: true
      };
      const k = [a.data, a.local_id, a.cultura_id, a.tipo_id].join('|');
      if (existentes.has(k)) { puladas++; continue; }
      existentes.add(k);
      await gravarAtividade(a);
      criadas++;
    }
    aviso(`${criadas} atividade(s) importadas${puladas ? `, ${puladas} já existiam` : ''}.`);
    irPara('atividades');
  };
}

Object.assign(window, { CADASTROS, editarCadastro });
