// cadastros.js — Cadastros › Itens e Almoxarifados da área Estoque (15/10/2026).
//
// A lista de itens é cadastrada no próprio app (decisão do Guilherme) e vale
// para todos os almoxarifados. Nada se apaga: desativa-se, e o item some das
// contagens novas sem sumir das que já foram fechadas.
import { $, esc, pronto, todos, gravar, aviso, GRUPOS, UNIDADES, itensOrdenados } from './dados.js';

let buscaItens = '';
let verInativos = false;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ============================ ITENS ============================ */

function desenharItens() {
  const alvo = $('cadItensCorpo');
  if (!alvo) return;
  if (!pronto()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const todosItens = todos('est_itens');
  const lista = itensOrdenados(todosItens.filter(i => verInativos || i.ativo !== false));
  const b = semAcento(buscaItens);
  const vistos = lista.filter(i => !b || semAcento(i.nome).includes(b));
  const nAtivos = todosItens.filter(i => i.ativo !== false).length;

  let grupo = null;
  alvo.innerHTML = `
    <form class="grade larga cad-novo" id="cadItemNovo" autocomplete="off">
      <label class="campo">Nome do item <input type="text" name="nome" required placeholder="ex.: Glifosato 480"></label>
      <label class="campo">Unidade <select name="unidade">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Grupo <select name="grupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
      <div class="barra fim" style="align-self:end"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <div class="barra entre">
      <span class="dc-sem">${nAtivos} ${nAtivos === 1 ? 'item ativo' : 'itens ativos'} · todos aparecem na contagem de todos os almoxarifados</span>
      <button class="btn" type="button" id="cadColar">Colar uma lista</button>
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar
        <input type="text" id="cadBusca" placeholder="Digite parte do nome..." value="${esc(buscaItens)}"></label>
      <label class="es-check"><input type="checkbox" id="cadInativos"${verInativos ? ' checked' : ''}> mostrar desativados</label>
    </div>
    <div class="lista">${vistos.map(i => {
      const cab = i.grupo !== grupo ? `<h3 class="es-secao">${esc(grupo = i.grupo)}</h3>` : '';
      return cab + `<div class="item"><span></span>
        <div><div class="nome">${esc(i.nome)}${i.ativo === false ? ' <span class="tag inativo">desativado</span>' : ''}</div>
          <div class="sub">${esc(i.unidade || 'sem unidade')}</div></div>
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
    await gravar('est_itens', { nome, unidade: f.get('unidade'), grupo: f.get('grupo'), ativo: true });
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
      </div>
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
      await gravar('est_itens', Object.assign({}, i, { nome, unidade: f.get('unidade'), grupo: f.get('grupo') }));
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
    <p class="dica">Um item por linha. Se quiser, depois do nome ponha a unidade e o grupo separados por
      ponto e vírgula (ou cole direto as colunas de uma planilha):</p>
    <pre class="cad-exemplo">Afalon ; L ; Defensivos
MAP 11-52-00 ; kg ; Fertilizantes
Luva nitrílica ; par ; EPIs
Óleo 15W40 ; L ; Lubrificantes
Detergente ; L ; Material de limpeza
Papel A4 ; pct ; Papelaria</pre>
    <div class="grade">
      <label class="campo">Unidade padrão <select id="colUni">${UNIDADES.map(u => `<option>${u}</option>`).join('')}</select></label>
      <label class="campo">Grupo padrão <select id="colGrupo">${GRUPOS.map(g => `<option>${g}</option>`).join('')}</select></label>
    </div>
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
        novos.push({ nome, unidade: uni, grupo, ativo: true });
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
      corpo.querySelector('#colOk').disabled = true;
      for (const n of novos) await gravar('est_itens', n);
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
      <label class="campo">Nome <input type="text" name="nome" required placeholder="igual ao da aba Sistema - ... da planilha"></label>
      <label class="campo">Fazenda <input type="text" name="fazenda" placeholder="ex.: Fazenda Faca"></label>
      <div class="barra fim" style="align-self:end"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <p class="es-nota">O nome do almoxarifado é o que liga a contagem ao Acerto: precisa ser o mesmo da aba
      <strong>"Sistema - …"</strong> da planilha (ex.: Faz. Faca).</p>
    <div class="lista">${lista.map(l => `<div class="item"><span></span>
      <div><div class="nome">${esc(l.nome)} <span class="tag ${l.ativo === false ? 'inativo">desativado' : 'ativo">ativo'}</span></div>
        <div class="sub">${esc(l.fazenda || '')}</div></div>
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
        await gravar('est_locais', Object.assign({}, l, { nome, fazenda: String(f.get('fazenda') || '').trim() || null }));
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
