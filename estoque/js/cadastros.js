// cadastros.js — Cadastros › Itens e Almoxarifados da área Estoque (15/10/2026).
//
// A lista de itens é cadastrada no próprio app (decisão do Guilherme). Cada
// item é contado nos estoques marcados em "Contado em" (nada marcado à parte =
// todos). Nada se apaga: desativa-se, e o item some das
// contagens novas sem sumir das que já foram fechadas.
import { $, esc, pronto, todos, gravar, aviso, GRUPOS, UNIDADES, itensOrdenados, lerNumero, mostrarNumero, temMinimo,
  locais, contaNoLocal } from './dados.js';

/** Campo de número opcional: vazio = null; texto que não é número = NaN. */
const numOpc = v => lerNumero(v);

let buscaItens = '';
let filtroLocal = '';
const nomeCurto = n => String(n || '').replace(/^Faz(enda)?\.?\s+/i, '');

/** Caixinhas "Contado em": todas marcadas = conta em todos os estoques. */
function caixasLocais(marcados) {
  const todosMarcados = !Array.isArray(marcados) || !marcados.length;
  return `<fieldset class="campo plena cad-locais"><legend>Contado em</legend>
    ${locais().map(l => `<label class="es-check"><input type="checkbox" data-local="${esc(l.id)}"${
      todosMarcados || marcados.includes(l.id) ? ' checked' : ''}> ${esc(l.nome)}</label>`).join('')}
  </fieldset>`;
}
/** null = todos; [] = nenhum (não pode); [ids] = só esses. */
function lerLocais(raiz) {
  const cx = [...raiz.querySelectorAll('.cad-locais [data-local]')];
  const ids = cx.filter(c => c.checked).map(c => c.dataset.local);
  return ids.length === cx.length ? null : ids;
}
function textoLocais(i) {
  const l = i.locais_contagem;
  if (!Array.isArray(l) || !l.length) return '';
  const nomes = locais().filter(x => l.includes(x.id)).map(x => nomeCurto(x.nome));
  return ` · contado em ${esc(nomes.join(', ') || '—')}`;
}
let verInativos = false;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ---- AGROFIT (22/10/2026): dados do MAPA gravados em est_itens.agrofit_* ----
   Situação: Encontrado / Nome aproximado – conferir / Vários registros – conferir /
   Não encontrado no AGROFIT / Não se aplica (não é agrotóxico). */
const toxCurta = t => { const m = String(t || '').match(/Categoria\s*(\d)/i); return m ? 'Tox. ' + m[1] : (t ? 'Tox. NC' : ''); };
function resumoAgrofit(i) {
  const s = i.agrofit_situacao || '';
  if (!s || /^Não se aplica/.test(s)) return '';
  if (/^Não encontrado/.test(s)) return ' · <span class="cad-agro fora">fora do AGROFIT</span>';
  const conf = /conferir/.test(s) ? ' <span class="tag alerta">conferir</span>' : '';
  const partes = [i.agrofit_classe, toxCurta(i.agrofit_toxicologica), i.agrofit_registro ? 'MAPA ' + i.agrofit_registro : ''].filter(Boolean);
  return partes.length ? ` · <span class="cad-agro">${esc(partes.join(' · '))}</span>${conf}` : conf;
}
function blocoAgrofit(i) {
  const s = i.agrofit_situacao;
  if (!s) return '';
  const linhas = [['Situação', s], ['Marca comercial', i.agrofit_marca], ['Nº registro MAPA', i.agrofit_registro],
    ['Classe agronômica', i.agrofit_classe], ['Ingrediente ativo', i.agrofit_ingrediente_ativo], ['Formulação', i.agrofit_formulacao],
    ['Classificação toxicológica', i.agrofit_toxicologica], ['Classificação ambiental', i.agrofit_ambiental],
    ['Titular do registro', i.agrofit_titular]].filter(l => l[1]);
  const cult = i.agrofit_culturas ? `<details class="cad-agro-cult"><summary>Culturas registradas (${i.agrofit_culturas.split(', ').length})</summary><p>${esc(i.agrofit_culturas)}</p></details>` : '';
  return `<fieldset class="campo plena cad-agro-bloco"><legend>AGROFIT (MAPA)</legend>
    <dl>${linhas.map(l => `<dt>${esc(l[0])}</dt><dd>${esc(l[1])}</dd>`).join('')}</dl>${cult}</fieldset>`;
}

/* ============================ ITENS ============================ */

function desenharItens() {
  const alvo = $('cadItensCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const todosItens = todos('est_itens');
  const lista = itensOrdenados(todosItens.filter(i => verInativos || i.ativo !== false));
  const b = semAcento(buscaItens);
  const vistos = lista.filter(i => (!b || semAcento(i.nome).includes(b)) && (!filtroLocal || contaNoLocal(i, filtroLocal)));
  const nAtivos = todosItens.filter(i => i.ativo !== false).length;

  let grupo = null;
  alvo.innerHTML = `
    <form class="grade larga cad-novo" id="cadItemNovo" autocomplete="off">
      <label class="campo">Nome do item <input type="text" name="nome" required placeholder="ex.: Glifosato 480"></label>
      <label class="campo">Unidade <select name="unidade">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Grupo <select name="grupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
      <label class="campo">Estoque mínimo <input type="text" name="minimo" inputmode="decimal" placeholder="ex.: 10"></label>
      <label class="campo">Pedido de reposição <input type="text" name="pedido" inputmode="decimal" placeholder="quanto pedir"></label>
      ${caixasLocais(null)}
      <div class="barra fim" style="align-self:end"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <div class="barra entre">
      <span class="dc-sem">${nAtivos} ${nAtivos === 1 ? 'item ativo' : 'itens ativos'} · cada item aparece na contagem dos estoques marcados em "Contado em"</span>
      <button class="btn" type="button" id="cadColar">Colar uma lista</button>
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar
        <input type="text" id="cadBusca" placeholder="Digite parte do nome..." value="${esc(buscaItens)}"></label>
      <label class="campo">Contado em <select id="cadFiltroLocal"><option value="">Todos os estoques</option>${locais().map(l =>
        `<option value="${esc(l.id)}"${l.id === filtroLocal ? ' selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="es-check"><input type="checkbox" id="cadInativos"${verInativos ? ' checked' : ''}> mostrar desativados</label>
    </div>
    <div class="lista">${vistos.map(i => {
      const cab = i.grupo !== grupo ? `<h3 class="es-secao">${esc(grupo = i.grupo)}</h3>` : '';
      return cab + `<div class="item"><span></span>
        <div><div class="nome">${esc(i.nome)}${i.ativo === false ? ' <span class="tag inativo">desativado</span>' : ''}</div>
          <div class="sub">${esc(i.unidade || 'sem unidade')}${temMinimo(i)
            ? ` · mínimo ${esc(mostrarNumero(i.estoque_minimo))}${i.pedido_reposicao != null && i.pedido_reposicao !== ''
              ? ` · pedir ${esc(mostrarNumero(i.pedido_reposicao))}` : ''}`
            : ' · <span class="cad-sem-min">sem estoque mínimo</span>'}${textoLocais(i)}${resumoAgrofit(i)}</div></div>
        <div class="acoes"><button class="btn mini" type="button" data-editar="${esc(i.id)}">Editar</button></div>
      </div>`;
    }).join('') || `<div class="vazio">${todosItens.length ? 'Nenhum item com esse nome.' : 'Nenhum item cadastrado ainda.'}</div>`}</div>`;

  $('cadItemNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nome = String(f.get('nome') || '').trim().replace(/\s+/g, ' ');
    if (!nome) return;
    if (todosItens.some(i => semAcento(i.nome) === semAcento(nome))) {
      aviso('Já existe um item com esse nome.', true); return;
    }
    const minimo = numOpc(f.get('minimo')), pedido = numOpc(f.get('pedido'));
    if (Number.isNaN(minimo) || Number.isNaN(pedido)) { aviso('Estoque mínimo e pedido: use só números (ex.: 10 ou 2,5).', true); return; }
    const onde = lerLocais(e.target);
    if (onde && !onde.length) { aviso('Marque pelo menos um estoque em "Contado em".', true); return; }
    await gravar('est_itens', { nome, unidade: f.get('unidade'), grupo: f.get('grupo'),
      estoque_minimo: minimo, pedido_reposicao: pedido, locais_contagem: onde, ativo: true });
    aviso('Item adicionado.');
    desenharItens();
    $('cadItemNovo').querySelector('[name=nome]').focus();
  });
  $('cadBusca').addEventListener('input', e => {
    buscaItens = e.target.value;
    const pos = e.target.selectionStart;
    desenharItens();
    const el = $('cadBusca'); el.focus(); el.setSelectionRange(pos, pos);
  });
  $('cadFiltroLocal').addEventListener('change', e => { filtroLocal = e.target.value; desenharItens(); });
  $('cadInativos').addEventListener('change', e => { verInativos = e.target.checked; desenharItens(); });
  $('cadColar').addEventListener('click', colarLista);
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editarItem(b.dataset.editar)));
}

function editarItem(id) {
  const i = todos('est_itens').find(x => x.id === id);
  if (!i) return;
  const unidades = UNIDADES.includes(i.unidade) || !i.unidade ? UNIDADES : [i.unidade, ...UNIDADES];
  window.abrirModal('Editar item', `
    <form id="cadEditar" autocomplete="off">
      <label class="campo">Nome <input type="text" name="nome" required value="${esc(i.nome)}"></label>
      <div class="grade">
        <label class="campo">Unidade <select name="unidade">${unidades.map(u =>
          `<option${u === i.unidade ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
        <label class="campo">Grupo <select name="grupo">${GRUPOS.map(g =>
          `<option${g === i.grupo ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="campo">Estoque mínimo <input type="text" name="minimo" inputmode="decimal"
          value="${esc(mostrarNumero(i.estoque_minimo))}" placeholder="ex.: 10"></label>
        <label class="campo">Pedido de reposição <input type="text" name="pedido" inputmode="decimal"
          value="${esc(mostrarNumero(i.pedido_reposicao))}" placeholder="quanto pedir"></label>
      </div>
      ${caixasLocais(i.locais_contagem)}
      ${blocoAgrofit(i)}
      <p class="dc-sem">Quando a contagem der igual ou abaixo do mínimo, o item aparece na Reposição com a quantidade a pedir.</p>
      <div class="barra entre">
        <button class="btn${i.ativo === false ? '' : ' perigo'}" type="button" id="cadAtivo">${i.ativo === false ? 'Reativar' : 'Desativar'}</button>
        <button class="btn principal" type="submit">Salvar</button>
      </div>
    </form>`, corpo => {
    corpo.querySelector('#cadEditar').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const nome = String(f.get('nome') || '').trim().replace(/\s+/g, ' ');
      if (!nome) return;
      if (todos('est_itens').some(x => x.id !== id && semAcento(x.nome) === semAcento(nome))) {
        aviso('Já existe outro item com esse nome.', true); return;
      }
      const minimo = numOpc(f.get('minimo')), pedido = numOpc(f.get('pedido'));
      if (Number.isNaN(minimo) || Number.isNaN(pedido)) { aviso('Estoque mínimo e pedido: use só números (ex.: 10 ou 2,5).', true); return; }
      const onde = lerLocais(e.target);
      if (onde && !onde.length) { aviso('Marque pelo menos um estoque em "Contado em".', true); return; }
      await gravar('est_itens', Object.assign({}, i, { nome, unidade: f.get('unidade'), grupo: f.get('grupo'),
        estoque_minimo: minimo, pedido_reposicao: pedido, locais_contagem: onde }));
      window.fecharModal(); desenharItens();
    });
    corpo.querySelector('#cadAtivo').addEventListener('click', async () => {
      await gravar('est_itens', Object.assign({}, i, { ativo: i.ativo === false }));
      window.fecharModal(); desenharItens();
    });
  });
}

/** Cola a lista inteira de uma vez: um item por linha, "nome ; unidade ; grupo". */
function colarLista() {
  window.abrirModal('Colar uma lista de itens', `
    <p class="dica">Um item por linha. Se quiser, depois do nome ponha a unidade, o grupo, o estoque mínimo e
      o pedido de reposição, separados por ponto e vírgula (ou cole direto as colunas de uma planilha):</p>
    <pre class="cad-exemplo">Afalon ; L ; Defensivos ; 20 ; 100
MAP 11-52-00 ; kg ; Fertilizantes
Luva nitrílica ; par ; EPIs ; 30 ; 100
Óleo 15W40 ; L ; Lubrificantes
Detergente ; L ; Material de limpeza
Papel A4 ; pct ; Papelaria</pre>
    <div class="grade">
      <label class="campo">Unidade padrão <select id="colUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Grupo padrão <select id="colGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
    </div>
    ${caixasLocais(null)}
    <label class="campo plena">Lista <textarea id="colTexto" rows="9" placeholder="Cole aqui..."></textarea></label>
    <p class="dc-sem" id="colResumo"></p>
    <div class="barra fim"><button class="btn principal" type="button" id="colOk" disabled>Adicionar</button></div>`, corpo => {
    const ler = () => {
      const existentes = new Set(todos('est_itens').map(i => semAcento(i.nome)));
      const vistos = new Set();
      const novos = [];
      let repetidos = 0;
      for (const bruta of corpo.querySelector('#colTexto').value.split(/\r?\n/)) {
        const partes = bruta.split(/\s*[;\t]\s*/).map(s => s.trim());
        const nome = (partes[0] || '').replace(/\s+/g, ' ');
        if (!nome) continue;
        const k = semAcento(nome);
        if (existentes.has(k) || vistos.has(k)) { repetidos++; continue; }
        vistos.add(k);
        const uni = UNIDADES.find(u => u.toLowerCase() === (partes[1] || '').toLowerCase()) || partes[1] || corpo.querySelector('#colUni').value;
        const grupo = GRUPOS.find(g => semAcento(g) === semAcento(partes[2] || '')) || corpo.querySelector('#colGrupo').value;
        const min = lerNumero(partes[3] || ''), ped = lerNumero(partes[4] || '');
        novos.push({ nome, unidade: uni, grupo, ativo: true,
          estoque_minimo: Number.isNaN(min) ? null : min, pedido_reposicao: Number.isNaN(ped) ? null : ped });
      }
      corpo.querySelector('#colResumo').textContent = novos.length || repetidos
        ? `${novos.length} ${novos.length === 1 ? 'item novo' : 'itens novos'}${repetidos ? ` · ${repetidos} já cadastrado(s), ficam de fora` : ''}`
        : '';
      corpo.querySelector('#colOk').disabled = !novos.length;
      return novos;
    };
    ['input', 'change'].forEach(ev => corpo.addEventListener(ev, ler));
    corpo.querySelector('#colOk').addEventListener('click', async () => {
      const novos = ler();
      const onde = lerLocais(corpo);
      if (onde && !onde.length) { aviso('Marque pelo menos um estoque em "Contado em".', true); return; }
      corpo.querySelector('#colOk').disabled = true;
      for (const n of novos) await gravar('est_itens', Object.assign(n, { locais_contagem: onde }));
      window.fecharModal();
      aviso(novos.length + ' itens adicionados.');
      desenharItens();
    });
  });
}

/* ========================= ALMOXARIFADOS ========================= */

function desenharLocais() {
  const alvo = $('cadLocaisCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = todos('est_locais').slice()
    .sort((a, b) => (a.ativo === false) - (b.ativo === false) || (a.ordem || 0) - (b.ordem || 0)
      || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  alvo.innerHTML = `
    <form class="grade larga cad-novo" id="cadLocalNovo" autocomplete="off">
      <label class="campo">Nome <input type="text" name="nome" required placeholder="ex.: Faz. Faca"></label>
      <label class="campo">Fazenda <input type="text" name="fazenda" placeholder="ex.: Fazenda Faca"></label>
      <div class="barra fim" style="align-self:end"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <p class="es-nota">O nome do almoxarifado é o que liga a contagem ao Acerto: precisa começar igual ao da aba
      <strong>"Sistema - …"</strong> da planilha (ex.: Faz. Faca; "Lote 35 PADAP" casa com a aba "Lote 35").</p>
    <div class="lista">${lista.map(l => `<div class="item"><span></span>
      <div><div class="nome">${esc(l.nome)} <span class="tag ${l.ativo === false ? 'inativo">desativado' : 'ativo">ativo'}</span></div>
        <div class="sub">${esc(l.fazenda || '')}${l.acerto_grupo ? ' · acerto independente' : ''}</div></div>
      <div class="acoes"><button class="btn mini" type="button" data-local="${esc(l.id)}">Editar</button></div>
    </div>`).join('') || '<div class="vazio">Nenhum almoxarifado cadastrado.</div>'}</div>`;

  $('cadLocalNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nome = String(f.get('nome') || '').trim();
    if (!nome) return;
    const maior = Math.max(0, ...todos('est_locais').map(l => l.ordem || 0));
    await gravar('est_locais', { nome, fazenda: String(f.get('fazenda') || '').trim() || null, ordem: maior + 1, ativo: true });
    aviso('Almoxarifado adicionado.');
    desenharLocais();
  });
  alvo.querySelectorAll('[data-local]').forEach(b => b.addEventListener('click', () => {
    const l = todos('est_locais').find(x => x.id === b.dataset.local);
    if (!l) return;
    window.abrirModal('Editar almoxarifado', `
      <form id="cadLocalEd" autocomplete="off">
        <label class="campo">Nome <input type="text" name="nome" required value="${esc(l.nome)}"></label>
        <label class="campo">Fazenda <input type="text" name="fazenda" value="${esc(l.fazenda || '')}"></label>
        <label class="es-check" style="margin:4px 0 12px"><input type="checkbox" name="indep"${l.acerto_grupo ? ' checked' : ''}>
          Acerto independente (não troca transferência com as outras fazendas)</label>
        <div class="barra entre">
          <button class="btn${l.ativo === false ? '' : ' perigo'}" type="button" id="cadLocalAtivo">${l.ativo === false ? 'Reativar' : 'Desativar'}</button>
          <button class="btn principal" type="submit">Salvar</button>
        </div>
      </form>`, corpo => {
      corpo.querySelector('#cadLocalEd').addEventListener('submit', async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const nome = String(f.get('nome') || '').trim();
        if (!nome) return;
        await gravar('est_locais', Object.assign({}, l, { nome, fazenda: String(f.get('fazenda') || '').trim() || null,
          acerto_grupo: f.get('indep') ? (l.acerto_grupo || nome) : null }));
        window.fecharModal(); desenharLocais();
      });
      corpo.querySelector('#cadLocalAtivo').addEventListener('click', async () => {
        await gravar('est_locais', Object.assign({}, l, { ativo: l.ativo === false }));
        window.fecharModal(); desenharLocais();
      });
    });
  }));
}

/* ============================ ligação ============================ */
const DESENHOS = { cadItens: desenharItens, cadLocais: desenharLocais };
let telaAberta = null;

export function abrirCadastro(tela) {
  telaAberta = tela;
  (DESENHOS[tela] || (() => {}))();
}
export function soltarCadastro() { telaAberta = null; }

window.addEventListener('estoque-dados', () => {
  if (!telaAberta || !DESENHOS[telaAberta]) return;
  const foco = document.activeElement;
  if (foco && foco.closest && foco.closest('#cadItensCorpo, #cadLocaisCorpo') && /INPUT|TEXTAREA|SELECT/.test(foco.tagName)) return;
  if (document.querySelector('#modal') && !document.querySelector('#modal.oculto')) return;
  DESENHOS[telaAberta]();
});
