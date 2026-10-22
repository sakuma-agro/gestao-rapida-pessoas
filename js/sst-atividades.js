// sst-atividades.js — SST › Atividades (22/10/2026, prévia aprovada por ele).
//
// A tela: lista das atividades com os treinamentos e exames que cada uma exige
// e quantas pessoas fazem; editar marca o que exige e quem faz. No cadastro do
// funcionário entra o bloco "Atividades que faz" (desenharAtvFuncionario).
// Os dados e as perguntas "o que essa pessoa exige?" ficam em
// js/atividades-dados.js. Grava direto no banco (tela só com internet).
import { estado } from './store.js';
import { carregarAtividades, todasAtividades, ligacoes, atividadesDaPessoa,
  atividadesCarregadas } from './atividades-dados.js';
import { garantirSst, sstCarregado, lancamentosSst, guardarCopiaSst } from './sst.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

const treinos = () => lancamentosSst().treinamento.tipos;
const exames = () => lancamentosSst().exame.tipos.filter(t => t.categoria !== 'aso');
const ativos = () => estado.funcionarios.filter(f => f.situacao === 'ATIVO')
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const daAtv = (lista, id) => lista.filter(x => x.atividade_id === id);

let editando = null;   // { id?, nome, descricao, ativo, trein:Set, exames:Set, pessoas:Set }

async function preparar() {
  if (!sstCarregado()) await garantirSst();
  await carregarAtividades();
}

/* =============== lista =============== */
export async function abrirAtividades() {
  try { await preparar(); }
  catch (e) {
    if (!atividadesCarregadas()) {
      $('atvTabela').innerHTML = `<div class="vazio">Não consegui carregar: ${esc(e.message || e)}</div>`;
      return;
    }
  }
  desenhar();
}

function chips(ids, catalogo, classe) {
  const nomes = catalogo.filter(t => ids.includes(t.id)).map(t => t.nr ? `${t.nome} · ${t.nr}` : t.nome);
  return nomes.length
    ? `<div class="atv-chips">${nomes.map(n => `<span class="atv-chip ${classe}">${esc(n)}</span>`).join('')}</div>`
    : '<span class="dc-sem">—</span>';
}

function desenhar() {
  const L = ligacoes();
  const lista = todasAtividades();
  const vivos = new Set(estado.funcionarios.filter(f => f.situacao === 'ATIVO').map(f => f.id));
  $('atvResumo').textContent = `${lista.filter(a => a.ativo !== false).length} atividade(s) em uso · ` +
    `${new Set(L.pessoas.filter(p => vivos.has(p.funcionario_id)).map(p => p.funcionario_id)).size} funcionário(s) ativo(s) com atividade marcada.`;
  $('atvTabela').innerHTML = !lista.length ? '<div class="vazio">Nenhuma atividade cadastrada.</div>' : `
    <table class="dc-planilha"><thead><tr>
      <th style="width:24%">Atividade</th><th>Treinamentos exigidos</th><th style="width:26%">Exames exigidos</th>
      <th class="ce" style="width:8%">Quem faz</th><th style="width:7%"></th>
    </tr></thead><tbody>
    ${lista.map(a => {
      const qtd = daAtv(L.pessoas, a.id).filter(p => vivos.has(p.funcionario_id)).length;
      return `<tr>
        <td><b>${esc(a.nome)}</b>${a.ativo === false ? ' <span class="tag inativo">DESATIVADA</span>' : ''}
          ${a.descricao ? `<br><span class="dc-sem">${esc(a.descricao)}</span>` : ''}</td>
        <td>${chips(daAtv(L.trein, a.id).map(x => x.tipo_id), treinos(), 'tr')}</td>
        <td>${chips(daAtv(L.exames, a.id).map(x => x.tipo_id), exames(), 'ex')}</td>
        <td class="ce"><b>${qtd}</b></td>
        <td class="ce"><button class="btn mini" type="button" data-atv="${a.id}">Editar</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  $('atvTabela').querySelectorAll('[data-atv]').forEach(b =>
    b.addEventListener('click', () => abrirEdicao(b.dataset.atv)));
}

/* =============== editar =============== */
function abrirEdicao(id) {
  const L = ligacoes();
  const a = id ? todasAtividades().find(x => x.id === id) : null;
  editando = {
    id: a?.id || null,
    nome: a?.nome || '', descricao: a?.descricao || '', ativo: a ? a.ativo !== false : true,
    trein: new Set(a ? daAtv(L.trein, a.id).map(x => x.tipo_id) : []),
    exames: new Set(a ? daAtv(L.exames, a.id).map(x => x.tipo_id) : []),
    pessoas: new Set(a ? daAtv(L.pessoas, a.id).map(x => x.funcionario_id) : []),
  };
  $('tituloAtv').textContent = a ? 'Editar atividade' : 'Nova atividade';
  $('erroAtv').hidden = true;
  $('atvNome').value = editando.nome;
  $('atvDesc').value = editando.descricao;
  $('atvAtivo').value = editando.ativo ? '1' : '0';
  $('atvBusca').value = '';
  $('bApagarAtv').hidden = !a;
  const item = (grupo, t, extra = '') => `<label class="item" for="atv_${grupo}_${t.id}" style="grid-template-columns:22px 1fr">
      <input type="checkbox" id="atv_${grupo}_${t.id}" data-g="${grupo}" data-id="${t.id}" ${editando[grupo].has(t.id) ? 'checked' : ''}>
      <span><span class="nome">${esc(t.nome)}</span>${extra ? `<br><span class="sub">${esc(extra)}</span>` : ''}</span>
    </label>`;
  $('atvTreinos').innerHTML = treinos().filter(t => t.ativo !== false || editando.trein.has(t.id))
    .map(t => item('trein', t, t.nr || '')).join('') || '<div class="vazio">Catálogo de treinamentos vazio.</div>';
  $('atvExames').innerHTML = exames().filter(t => t.ativo !== false || editando.exames.has(t.id))
    .map(t => item('exames', t, t.meses ? `a cada ${t.meses} meses` : '')).join('') || '<div class="vazio">Nenhum exame complementar.</div>';
  desenharPessoas();
  $('dlgAtv').querySelectorAll('#atvTreinos [data-g], #atvExames [data-g]').forEach(cx =>
    cx.addEventListener('change', () => {
      const s = editando[cx.dataset.g];
      if (cx.checked) s.add(cx.dataset.id); else s.delete(cx.dataset.id);
    }));
  $('dlgAtv').showModal();
}

/* Quem faz: marcados primeiro, depois os outros ativos; a busca filtra por nome ou função. */
function desenharPessoas() {
  const q = so($('atvBusca').value).toLowerCase();
  const gente = ativos().filter(f => editando.pessoas.has(f.id) ||
    !q || f.nome.toLowerCase().includes(q) || so(f.cargo).toLowerCase().includes(q));
  gente.sort((a, b) => (editando.pessoas.has(b.id) - editando.pessoas.has(a.id)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  $('atvQuemConta').textContent = `(${editando.pessoas.size})`;
  $('atvPessoas').innerHTML = gente.map(f => `<label class="item" for="atvp_${f.id}" style="grid-template-columns:22px 1fr">
      <input type="checkbox" id="atvp_${f.id}" data-p="${f.id}" ${editando.pessoas.has(f.id) ? 'checked' : ''}>
      <span><span class="nome">${esc(f.nome)}</span> <span class="sub">${esc(f.cargo || '')}</span></span>
    </label>`).join('') || '<div class="vazio">Ninguém com esse nome.</div>';
  $('atvPessoas').querySelectorAll('[data-p]').forEach(cx => cx.addEventListener('change', () => {
    if (cx.checked) editando.pessoas.add(cx.dataset.p); else editando.pessoas.delete(cx.dataset.p);
    $('atvQuemConta').textContent = `(${editando.pessoas.size})`;
  }));
}

/* Troca as ligações de uma atividade pelo que está marcado. */
async function trocarLigacoes(tabela, campo, atividadeId, ids) {
  const c = estado.cliente;
  const { error: e1 } = await c.from(tabela).delete().eq('atividade_id', atividadeId);
  if (e1) throw e1;
  if (!ids.length) return;
  const { error: e2 } = await c.from(tabela).insert(ids.map(id => ({ atividade_id: atividadeId, [campo]: id })));
  if (e2) throw e2;
}

async function salvar(ev) {
  ev.preventDefault();
  if (!editando) return;
  const nome = so($('atvNome').value);
  if (!nome) { $('erroAtv').textContent = 'Falta o nome da atividade.'; $('erroAtv').hidden = false; return; }
  if (!navigator.onLine) { $('erroAtv').textContent = 'Sem internet: as atividades só são alteradas com conexão.'; $('erroAtv').hidden = false; return; }
  const b = $('formAtv').querySelector('[type=submit]');
  b.disabled = true;
  try {
    const c = estado.cliente;
    const linha = { nome, descricao: so($('atvDesc').value) || null, ativo: $('atvAtivo').value === '1' };
    let id = editando.id;
    if (id) {
      const { error } = await c.from('sst_atividades').update(linha).eq('id', id);
      if (error) throw error;
    } else {
      linha.ordem = todasAtividades().length + 1;
      const { data, error } = await c.from('sst_atividades').insert(linha).select('id').single();
      if (error) throw error;
      id = data.id;
    }
    await trocarLigacoes('sst_atividade_treinamentos', 'tipo_id', id, [...editando.trein]);
    await trocarLigacoes('sst_atividade_exames', 'tipo_id', id, [...editando.exames]);
    // quem faz: só mexe nos funcionários ativos; desligado que estava marcado continua no histórico
    const vivos = new Set(ativos().map(f => f.id));
    const L = ligacoes();
    const antes = new Set(daAtv(L.pessoas, id).map(p => p.funcionario_id));
    const sair = [...antes].filter(f => vivos.has(f) && !editando.pessoas.has(f));
    const entrar = [...editando.pessoas].filter(f => !antes.has(f));
    if (sair.length) {
      const { error } = await c.from('sst_atividade_funcionarios').delete().eq('atividade_id', id).in('funcionario_id', sair);
      if (error) throw error;
    }
    if (entrar.length) {
      const { error } = await c.from('sst_atividade_funcionarios').insert(entrar.map(f => ({ atividade_id: id, funcionario_id: f })));
      if (error) throw error;
    }
    await carregarAtividades();
    guardarCopiaSst();
    $('dlgAtv').close();
    desenhar();
    dispatchEvent(new Event('gr:sst-mudou'));
  } catch (e) {
    $('erroAtv').textContent = 'Não deu para salvar: ' + (e.message || e);
    $('erroAtv').hidden = false;
  } finally { b.disabled = false; }
}

async function apagar() {
  if (!editando?.id) return;
  const n = editando.pessoas.size;
  if (!confirm(`Apagar a atividade "${editando.nome}"?` +
    (n ? `\n\n${n} funcionário(s) estão marcados nela e deixam de ser cobrados do que ela exige.` : '') +
    '\n\nSe só quer parar de usar, troque a Situação para Desativada.')) return;
  try {
    const { error } = await estado.cliente.from('sst_atividades').delete().eq('id', editando.id);
    if (error) throw error;
    await carregarAtividades();
    guardarCopiaSst();
    $('dlgAtv').close();
    desenhar();
    dispatchEvent(new Event('gr:sst-mudou'));
  } catch (e) {
    $('erroAtv').textContent = 'Não deu para apagar: ' + (e.message || e);
    $('erroAtv').hidden = false;
  }
}

/* =============== no cadastro do funcionário =============== */
/** Desenha "Atividades que faz" no cadastro. `aoMudar` atualiza a linha de resumo. */
export async function desenharAtvFuncionario(funcionarioId, aoMudar = () => {}) {
  const alvo = $('fuAtividades');
  if (!alvo) return;
  if (!funcionarioId) {
    alvo.innerHTML = '<span class="dc-sem">Salve o cadastro para marcar as atividades que a pessoa faz.</span>';
    return;
  }
  if (!atividadesCarregadas()) {
    alvo.innerHTML = '<span class="dc-sem">Carregando as atividades…</span>';
    try { await preparar(); } catch {
      alvo.innerHTML = '<span class="dc-sem">Sem conexão para carregar as atividades.</span>';
      return;
    }
  }
  const marcadas = new Set(atividadesDaPessoa(funcionarioId).map(a => a.id));
  const lista = todasAtividades().filter(a => a.ativo !== false);
  alvo.innerHTML = !lista.length ? '<span class="dc-sem">Nenhuma atividade cadastrada em SST › Atividades.</span>' :
    `<div class="atv-marcas">${lista.map(a => `<label class="atv-marca" for="fua_${a.id}" title="${esc(a.descricao || '')}">
      <input type="checkbox" id="fua_${a.id}" data-fua="${a.id}" ${marcadas.has(a.id) ? 'checked' : ''}> ${esc(a.nome)}
    </label>`).join('')}</div>`;
  alvo.querySelectorAll('[data-fua]').forEach(cx => cx.addEventListener('change', async () => {
    cx.disabled = true;
    try {
      const c = estado.cliente;
      const { error } = cx.checked
        ? await c.from('sst_atividade_funcionarios').insert({ atividade_id: cx.dataset.fua, funcionario_id: funcionarioId })
        : await c.from('sst_atividade_funcionarios').delete().eq('atividade_id', cx.dataset.fua).eq('funcionario_id', funcionarioId);
      if (error) throw error;
      await carregarAtividades();
      guardarCopiaSst();
      aoMudar();
      dispatchEvent(new Event('gr:sst-mudou'));
    } catch (e) {
      cx.checked = !cx.checked;
      alert('Não deu para salvar a atividade: ' + (e.message || e));
    } finally { cx.disabled = false; }
  }));
}

/* =============== ligações =============== */
export function ligarAtividades() {
  $('bNovaAtv').addEventListener('click', () => abrirEdicao(null));
  $('formAtv').addEventListener('submit', salvar);
  $('bApagarAtv').addEventListener('click', apagar);
  $('atvBusca').addEventListener('input', desenharPessoas);
}
