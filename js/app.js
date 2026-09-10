// app.js — telas, eventos e ligação com o armazenamento
import * as db from './store.js';
import { estado, modeloAtual } from './store.js';
import { montarFicha, linhaVazia, MESES, TRACO } from './ficha.js';
import { montarLista, listaAtual, LISTA_PADRAO } from './lista.js';
import { lerFuncionarios, comparar, aplicarEm } from './planilha.js';
import { aniversariantes, semNascimento, montarAniversarios, textoWhatsapp, linkWhatsapp,
  imagemAniversarios, nomeImagem } from './aniversarios.js';
import { SEED_MODELO } from './seed.js';
import { ligarDisc, abrirDisc, limparDisc } from './disc.js';
import { carregarAcesso, montarMenu, desenharConfig, ligarAcesso, limparAcesso } from './acesso.js';
import { ligarJornada, abrirJornada, limparJornada } from './jornada.js';
import { ligarSst, abrirSst, limparSst } from './sst.js';
import * as jd from './jornada-dados.js';
import { pode, podeTela } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const marcados = new Set();     // ids de funcionários selecionados (fichas)
const naLista = new Set();      // ids de funcionários na lista de presença
const rascunhos = new Map();    // chave -> {linhas:[], id}
let editandoFunc = null;
let editandoEpi = null;

/* =============== telas =============== */
function mostrar(qual) {
  $('telaLogin').hidden = qual !== 'login';
  $('app').hidden = qual !== 'app';
}

function abrirAba(nome) {
  $('telaFichas').hidden = nome !== 'fichas';
  $('telaLista').hidden = nome !== 'lista';
  $('telaFuncionarios').hidden = nome !== 'funcionarios';
  $('telaFuncionariosN2').hidden = nome !== 'funcionariosN2';
  $('telaAniversarios').hidden = nome !== 'aniversarios';
  $('telaEpis').hidden = nome !== 'epis';
  $('telaModelo').hidden = nome !== 'modelo';
  $('telaDisc').hidden = nome !== 'disc';
  $('telaConfig').hidden = nome !== 'config';
  $('telaExVenc').hidden  = nome !== 'exVenc';
  $('telaExTipos').hidden = nome !== 'exTipos';
  $('telaTrVenc').hidden  = nome !== 'trVenc';
  $('telaTrTipos').hidden = nome !== 'trTipos';
  $('telaJorPainel').hidden       = nome !== 'jorPainel';
  $('telaJorLancar').hidden       = nome !== 'jorLancar';
  $('telaJorBoletins').hidden     = nome !== 'jorBoletins';
  $('telaJorFechamento').hidden   = nome !== 'jorFechamento';
  $('telaJorRelatorios').hidden   = nome !== 'jorRelatorios';
  $('telaJorConfig').hidden       = nome !== 'jorConfig';
  if (nome === 'lista') { preencherLista(); desenharSelecaoLista(); }
  if (nome === 'aniversarios') atualizarAniversarios();
  if (nome === 'funcionarios') desenharFuncionarios();
  if (nome === 'funcionariosN2') desenharFuncN2();
  if (nome === 'epis') desenharEpis();
  if (nome === 'modelo') preencherModelo();
  if (nome === 'disc') abrirDisc();
  if (nome === 'config') desenharConfig();
  if (['exVenc', 'exTipos', 'trVenc', 'trTipos'].includes(nome)) abrirSst(nome);
  if (nome.startsWith('jor')) abrirJornada(nome);
}

/* =============== login =============== */
$('formLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('erroLogin'); erro.hidden = true;
  const botao = $('btnEntrar'); botao.disabled = true; botao.textContent = 'Entrando...';
  try {
    await db.entrar($('logEmail').value.trim(), $('logSenha').value);
    mostrar('app');
    await carregarTudo();
  } catch (e) {
    erro.textContent = traduzirErro(e);
    erro.hidden = false;
  } finally {
    botao.disabled = false; botao.textContent = 'Entrar';
  }
});

$('btnSair').addEventListener('click', async () => {
  await db.sair();
  marcados.clear(); rascunhos.clear();
  limparDisc(); limparAcesso(); limparJornada(); limparSst();
  mostrar('login');
});

function traduzirErro(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Confirme no painel do Supabase.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o Supabase. Verifique a internet ou a URL do projeto.';
  if (/relation .* does not exist/i.test(m)) return 'As tabelas ainda não existem. Rode o SQL do arquivo supabase.sql no SQL Editor.';
  return m || 'Não foi possível concluir.';
}

/* =============== carga =============== */
async function carregarTudo() {
  const aviso = $('avisoGlobal');
  try {
    await db.sincronizar();
    aviso.hidden = true;
  } catch (e) {
    aviso.textContent = 'Usando os dados salvos neste aparelho. ' + traduzirErro(e);
    aviso.hidden = false;
  }
  preencherControles();
  desenharSelecao();
  await carregarAcesso();

  /* Os cadastros do DP (unidade, setor, função, jornada) alimentam as listas
     do cadastro de funcionário. Carrega aqui para elas estarem prontas mesmo
     que a pessoa vá direto para Funcionários, sem abrir o DP. */
  if (pode('jornada')) {
    try { await jd.carregar(); } catch { /* sem rede: usa o que está no cache */ }
  }

  montarMenu(abrirAba);
}

function preencherControles() {
  const m = modeloAtual();
  if (!$('selMes').options.length) {
    MESES.forEach((nome, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = nome[0].toUpperCase() + nome.slice(1);
      $('selMes').appendChild(o);
    });
    const hoje = new Date();
    $('selMes').value = hoje.getMonth();
    $('selAno').value = hoje.getFullYear();
  }
  if (!$('selLinhas').value) $('selLinhas').value = m.linhas_padrao || 20;

  const emps = [...new Set(estado.funcionarios.map(f => f.empregador).filter(Boolean))].sort();
  const opcoes = '<option value="">Todos</option>' + emps.map(e => `<option>${esc(e)}</option>`).join('');
  $('fEmp').innerHTML = opcoes;
  $('fEmpLista').innerHTML = opcoes;
  $('lista-empregadores').innerHTML =
    [...new Set([...(m.empregadores || []), ...emps])].map(e => `<option value="${esc(e)}">`).join('');
  const cargos = [...new Set([...(m.cargos || []), ...estado.funcionarios.map(f => f.cargo).filter(Boolean)])].sort();
  $('lista-cargos').innerHTML = cargos.map(c => `<option value="${esc(c)}">`).join('');
  const fazendas = [...new Set(estado.funcionarios.map(f => f.fazenda).filter(Boolean))].sort();
  $('lista-fazendas').innerHTML = fazendas.map(f => `<option value="${esc(f)}">`).join('');
  if (!$('anMes').options.length) {
    MESES.forEach((nome, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = nome[0].toUpperCase() + nome.slice(1);
      $('anMes').appendChild(o);
    });
    const hoje = new Date();
    $('anMes').value = hoje.getMonth();
    $('anAno').value = hoje.getFullYear();
  }
  $('lista-epis').innerHTML = estado.epis.filter(e => e.ativo !== false)
    .map(e => `<option value="${esc(e.descricao)}">${esc(e.ca ? 'C.A ' + e.ca : '')}</option>`).join('');
}

/* =============== aba FICHAS =============== */
function visiveis() {
  const q = $('busca').value.trim().toLowerCase();
  const s = $('fSit').value, e = $('fEmp').value;
  return estado.funcionarios.filter(f =>
    (!q || f.nome.toLowerCase().includes(q)) &&
    (!s || f.situacao === s) &&
    (!e || f.empregador === e));
}

function desenharSelecao() {
  const vs = visiveis(), box = $('listaSel');
  box.innerHTML = vs.length ? vs.map(f => `
    <label class="item" for="s_${f.id}">
      <input type="checkbox" id="s_${f.id}" data-id="${f.id}" ${marcados.has(f.id) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
    </label>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  box.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? marcados.add(cb.dataset.id) : marcados.delete(cb.dataset.id);
      atualizarFichas();
    }));
  atualizarFichas();
}

const chaveFicha = (id, mes, ano) => `${id}|${mes}|${ano}`;

function linhasDe(func, mes, ano, n) {
  const ch = chaveFicha(func.id, mes, ano);
  if (!rascunhos.has(ch)) {
    const salva = estado.fichas.find(f =>
      f.funcionario_id === func.id && f.mes === mes && f.ano === ano);
    rascunhos.set(ch, {
      id: salva?.id || db.novoId(),
      linhas: Array.isArray(salva?.linhas) ? salva.linhas.map(l => ({ ...linhaVazia(), ...l })) : [],
    });
  }
  const r = rascunhos.get(ch);
  while (r.linhas.length < n) r.linhas.push(linhaVazia());
  return { chave: ch, rascunho: r, linhas: r.linhas.slice(0, n) };
}

function atualizarFichas() {
  const n = marcados.size;
  $('cnt').textContent = n;
  ['bImprimir', 'bSalvarFichas', 'bLimparFichas'].forEach(id => { $(id).disabled = n === 0; });

  const mes = +$('selMes').value, ano = +$('selAno').value || new Date().getFullYear();
  const qtd = Math.max(1, Math.min(40, parseInt($('selLinhas').value) || 20));
  const modelo = modeloAtual();
  const sel = estado.funcionarios.filter(f => marcados.has(f.id));

  $('saida').innerHTML = sel.map(f => {
    const { chave, linhas } = linhasDe(f, mes, ano, qtd);
    return montarFicha(f, modelo, { mes, ano, linhas, chave });
  }).join('');
}

// digitação dentro das fichas
$('saida').addEventListener('input', ev => {
  const alvo = ev.target;
  if (!alvo.classList.contains('cx')) return;
  const ficha = alvo.closest('.ficha');
  const r = rascunhos.get(ficha.dataset.chave);
  if (!r) return;
  const i = +alvo.dataset.linha, campo = alvo.dataset.campo;
  while (r.linhas.length <= i) r.linhas.push(linhaVazia());
  r.linhas[i][campo] = alvo.value;
  alvo.closest('.cw').classList.toggle('preenchida', alvo.value !== '');

  // ao escolher um EPI do catálogo, completa o C.A da mesma linha
  if (campo === 'descricao') {
    const epi = estado.epis.find(e => e.descricao.toLowerCase() === alvo.value.trim().toLowerCase());
    if (epi && epi.ca) {
      const campoCa = ficha.querySelector(`.cx[data-linha="${i}"][data-campo="ca"]`);
      if (campoCa && !campoCa.value) {
        campoCa.value = epi.ca;
        r.linhas[i].ca = epi.ca;
        campoCa.closest('.cw').classList.add('preenchida');
      }
    }
  }
});

$('bSalvarFichas').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  botao.disabled = true; botao.textContent = 'Salvando...';
  const mes = +$('selMes').value, ano = +$('selAno').value;
  const usadas = new Set();
  for (const f of estado.funcionarios.filter(x => marcados.has(x.id))) {
    const ch = chaveFicha(f.id, mes, ano);
    const r = rascunhos.get(ch);
    if (!r) continue;
    const linhas = r.linhas.filter(l => Object.values(l).some(v => String(v || '').trim()));
    usadas.add(ch);
    await db.salvarFicha({
      id: r.id, funcionario_id: f.id, mes, ano,
      setor: f.setor || modeloAtual().setor_padrao || 'CAMPO', linhas,
    });
  }
  botao.textContent = usadas.size ? 'Salvo' : 'Salvar preenchimento';
  setTimeout(() => { botao.textContent = 'Salvar preenchimento'; botao.disabled = false; }, 1600);
});

$('bLimparFichas').addEventListener('click', () => {
  if (!confirm('Limpar as linhas preenchidas das fichas visíveis?')) return;
  const mes = +$('selMes').value, ano = +$('selAno').value;
  estado.funcionarios.filter(f => marcados.has(f.id))
    .forEach(f => rascunhos.delete(chaveFicha(f.id, mes, ano)));
  atualizarFichas();
});

['busca', 'fSit', 'fEmp'].forEach(id => $(id).addEventListener('input', desenharSelecao));
['selMes', 'selAno', 'selLinhas'].forEach(id => $(id).addEventListener('input', atualizarFichas));
$('bTodos').addEventListener('click', () => { visiveis().forEach(f => marcados.add(f.id)); desenharSelecao(); });
$('bNenhum').addEventListener('click', () => { marcados.clear(); desenharSelecao(); });
$('bImprimir').addEventListener('click', () => window.print());
$('zoom').addEventListener('input', () => {
  const z = $('zoom').value;
  $('zoomV').textContent = z + '%';
  $('saida').style.transform = `scale(${z / 100})`;
  $('saida').style.transformOrigin = 'top center';
});

/* =============== aba LISTA DE PRESENÇA =============== */
function preencherLista() {
  const c = listaAtual(modeloAtual());
  $('lpTitulo').value = c.titulo || '';
  $('lpCodigo').value = c.codigo || '';
  $('lpData').value = c.data || '';
  $('lpRevisao').value = c.revisao || '';
  $('lpElaboracao').value = c.elaboracao || '';
  $('lpAprovacao').value = c.aprovacao || '';
}

function visiveisLista() {
  const q = $('buscaLista').value.trim().toLowerCase();
  const s = $('fSitLista').value, e = $('fEmpLista').value;
  return estado.funcionarios.filter(f =>
    (!q || f.nome.toLowerCase().includes(q)) &&
    (!s || f.situacao === s) &&
    (!e || f.empregador === e));
}

function desenharSelecaoLista() {
  const vs = visiveisLista(), box = $('listaSelLista');
  box.innerHTML = vs.length ? vs.map(f => `
    <label class="item" for="l_${f.id}">
      <input type="checkbox" id="l_${f.id}" data-id="${f.id}" ${naLista.has(f.id) ? 'checked' : ''}>
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
    </label>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  box.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => {
      cb.checked ? naLista.add(cb.dataset.id) : naLista.delete(cb.dataset.id);
      atualizarLista();
    }));
  atualizarLista();
}

// o que está digitado no cabeçalho agora (aparece na prévia antes de salvar)
const cabecalhoLista = () => ({
  ...listaAtual(modeloAtual()),
  titulo: $('lpTitulo').value,
  codigo: $('lpCodigo').value,
  data: $('lpData').value,
  revisao: $('lpRevisao').value,
  elaboracao: $('lpElaboracao').value,
  aprovacao: $('lpAprovacao').value,
});

function atualizarLista() {
  const gente = estado.funcionarios.filter(f => naLista.has(f.id));
  $('cntLista').textContent = gente.length;
  $('saidaLista').innerHTML = montarLista(gente, cabecalhoLista());
  $('cntFolhas').textContent = $('saidaLista').children.length;
}

['lpTitulo', 'lpCodigo', 'lpData', 'lpRevisao', 'lpElaboracao', 'lpAprovacao']
  .forEach(id => $(id).addEventListener('input', atualizarLista));

['buscaLista', 'fSitLista', 'fEmpLista'].forEach(id =>
  $(id).addEventListener('input', desenharSelecaoLista));
$('bTodosLista').addEventListener('click', ev => {
  ev.preventDefault();
  visiveisLista().forEach(f => naLista.add(f.id));
  desenharSelecaoLista();
});
$('bNenhumLista').addEventListener('click', ev => {
  ev.preventDefault();
  naLista.clear();
  desenharSelecaoLista();
});
$('bImprimirLista').addEventListener('click', () => window.print());
$('zoomLista').addEventListener('input', () => {
  const z = $('zoomLista').value;
  $('zoomVLista').textContent = z + '%';
  $('saidaLista').style.transform = `scale(${z / 100})`;
  $('saidaLista').style.transformOrigin = 'top center';
});

$('formLista').addEventListener('submit', async ev => {
  ev.preventDefault();
  const c = cabecalhoLista();
  await db.salvarModelo({
    ...modeloAtual(),
    lista: {
      titulo: c.titulo.trim(), codigo: c.codigo.trim(), data: c.data.trim(),
      revisao: c.revisao.trim(), elaboracao: c.elaboracao.trim(), aprovacao: c.aprovacao.trim(),
    },
  });
  atualizarLista();
  const b = ev.submitter; if (b) { b.textContent = 'Salvo'; setTimeout(() => b.textContent = 'Salvar cabeçalho', 1600); }
});

$('bRestaurarLista').addEventListener('click', async () => {
  if (!confirm('Voltar os textos do cabeçalho ao original do formulário?')) return;
  await db.salvarModelo({ ...modeloAtual(), lista: { ...LISTA_PADRAO } });
  preencherLista(); atualizarLista();
});

/* =============== aba FUNCIONÁRIOS =============== */
function desenharFuncionarios() {
  const q = $('buscaFunc').value.trim().toLowerCase();
  const s = $('fSitFunc').value;
  const lista = estado.funcionarios.filter(f =>
    (!q || [f.nome, f.cargo, f.cadastro, f.empregador].some(v => String(v || '').toLowerCase().includes(q))) &&
    (!s || f.situacao === s));
  $('cntFunc').textContent = estado.funcionarios.length;
  $('listaFunc').innerHTML = lista.length ? lista.map(f => `
    <div class="item" data-id="${f.id}" style="grid-template-columns:1fr auto auto">
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(f.cargo || '—')} · ${esc(f.empregador || '—')}${f.cadastro ? ' · nº ' + esc(f.cadastro) : ''}${f.admissao ? ' · desde ' + esc(dataBr(f.admissao)) : ''}</span>
      </span>
      <span class="tag ${f.situacao === 'ATIVO' ? 'ativo' : 'inativo'}">${esc(f.situacao || '—')}</span>
      <span class="acoes"><button class="btn mini" data-editar="${f.id}">Editar</button></span>
    </div>`).join('')
    : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  $('listaFunc').querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirFuncionario(b.dataset.editar)));
}

const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

function abrirFuncionario(id) {
  const f = id ? estado.funcionarios.find(x => x.id === id) : null;
  editandoFunc = f ? { ...f } : { id: db.novoId(), situacao: 'ATIVO', setor: modeloAtual().setor_padrao || 'CAMPO' };
  $('tituloFunc').textContent = f ? 'Editar funcionário' : 'Novo funcionário';
  $('fuNome').value = editandoFunc.nome || '';
  $('fuApelido').value = editandoFunc.apelido || '';
  $('fuCadastro').value = editandoFunc.cadastro || '';
  $('fuNascimento').value = (editandoFunc.nascimento || '').slice(0, 10);
  $('fuTelefone').value = editandoFunc.telefone || '';
  $('fuAdmissao').value = (editandoFunc.admissao || '').slice(0, 10);
  $('fuCpf').value = editandoFunc.cpf || '';
  montarListasDoCadastro(editandoFunc);
  $('fuCalcado').value = editandoFunc.tam_calcado || '';
  $('fuCamisa').value = editandoFunc.tam_camisa || '';
  $('fuSituacao').value = editandoFunc.situacao || 'ATIVO';
  $('bApagarFunc').hidden = !f;
  $('dlgFunc').showModal();
}

/* As listas de unidade, setor e função saem dos cadastros do DP — é o que
   faz o cadastro do funcionário servir todos os módulos, sem digitar
   empregador e fazenda na mão em cada tela. */
function montarListasDoCadastro(f) {
  const temDP = pode('jornada') || podeTela('funcionariosN2');
  const v = jd.vinculoDe(f.id);
  const opcoes = (lista, sel, rotulo = x => x.nome) =>
    '<option value=""></option>' + lista
      .filter(x => x.ativo !== false)
      .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(rotulo(x))}</option>`)
      .join('');

  $('fuUnidade').innerHTML = opcoes(jd.dados.unidades, v?.unidade_id, u => jd.nomeUnidade(u));
  $('fuSetor').innerHTML   = opcoes(jd.dados.setores, v?.setor_id);
  $('fuCargo').innerHTML   = opcoes(jd.dados.funcoes, v?.funcao_id);

  // Ainda sem vínculo: mostra o que estava escrito, para não parecer que sumiu.
  const escrito = [f.empregador, f.fazenda].filter(Boolean).join(' · ');
  $('fuUnidadeAtual').textContent = (!v?.unidade_id && escrito)
    ? 'Hoje está escrito: ' + escrito + ' — escolha a unidade para padronizar.'
    : '';

}

/* =============== cadastro nível 2 =============== */

let editandoN2 = null;

function desenharFuncN2() {
  const q = $('buscaFuncN2').value.trim().toLowerCase();
  const lista = estado.funcionarios
    .filter(f => (f.situacao || 'ATIVO') === 'ATIVO')
    .filter(f => !q || String(f.nome || '').toLowerCase().includes(q));

  $('listaFuncN2').innerHTML = lista.length ? lista.map(f => {
    const v = jd.vinculoDe(f.id);
    const jornada = jd.dados.jornadas.find(j => j.id === v?.jornada_id);
    const setor = jd.dados.setores.find(s => s.id === v?.setor_id);
    const riscos = [
      v?.periculosidade ? 'periculosidade 30%' : null,
      v?.insalubridade && v.insalubridade !== 'nao' ? 'insalubridade ' + v.insalubridade : null,
    ].filter(Boolean).join(' · ');
    return `<div class="item" data-id="${f.id}" style="grid-template-columns:1fr auto auto">
      <span>
        <span class="nome">${esc(f.nome)}</span><br>
        <span class="sub">${esc(jornada?.nome || (setor ? 'jornada do setor ' + setor.nome : 'sem jornada definida'))}${riscos ? ' · ' + esc(riscos) : ''}${v?.matricula ? ' · matr. ' + esc(v.matricula) : ''}</span>
      </span>
      <span class="tag ${riscos ? 'inativo' : 'ativo'}">${riscos ? 'com adicional' : 'sem adicional'}</span>
      <span class="acoes"><button class="btn mini" data-n2="${f.id}">Editar</button></span>
    </div>`;
  }).join('') : '<div class="vazio">Nenhum funcionário encontrado.</div>';

  $('listaFuncN2').querySelectorAll('[data-n2]').forEach(b =>
    b.addEventListener('click', () => abrirFuncN2(b.dataset.n2)));
}

function abrirFuncN2(id) {
  const f = estado.funcionarios.find(x => x.id === id);
  if (!f) return;
  const v = jd.vinculoDe(id) || {};
  editandoN2 = { id, nome: f.nome };

  const opcoes = (lista, sel) => '<option value=""></option>' + lista
    .filter(x => x.ativo !== false)
    .map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');

  const unidade = jd.unidadeDe(v);
  $('tituloFuncN2').textContent = f.nome;
  $('subFuncN2').textContent = unidade
    ? jd.nomeUnidade(unidade)
    : 'Sem unidade no Nível 1 — a apuração precisa dela para saber o destino de DP.';
  $('n2Jornada').innerHTML = opcoes(jd.dados.jornadas, v.jornada_id);
  $('n2Matricula').value = v.matricula || f.cadastro || '';
  $('n2Insal').value = v.insalubridade || 'nao';
  $('n2Peric').checked = !!v.periculosidade;
  $('dlgFuncN2').showModal();
}

$('buscaFuncN2').addEventListener('input', desenharFuncN2);

$('formFuncN2').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!editandoN2) return;
  await jd.salvarVinculo(editandoN2.id, {
    jornada_id: $('n2Jornada').value || null,
    matricula: $('n2Matricula').value.trim() || null,
    periculosidade: $('n2Peric').checked,
    insalubridade: $('n2Insal').value,
  });
  $('dlgFuncN2').close();
  desenharFuncN2();
});

$('bNovoFunc').addEventListener('click', () => abrirFuncionario(null));
['buscaFunc', 'fSitFunc'].forEach(id => $(id).addEventListener('input', desenharFuncionarios));

$('formFunc').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = {
    ...editandoFunc,
    nome: $('fuNome').value.trim().replace(/\s+/g, ' '),
    apelido: $('fuApelido').value.trim(),
    cadastro: $('fuCadastro').value.trim(),
    nascimento: $('fuNascimento').value || null,
    telefone: $('fuTelefone').value.trim(),
    admissao: $('fuAdmissao').value || null,
    cpf: $('fuCpf').value.trim(),
    tam_calcado: $('fuCalcado').value.trim(),
    tam_camisa: $('fuCamisa').value.trim(),
    situacao: $('fuSituacao').value,
  };
  if (!f.nome) return;

  /* O que foi escolhido nas listas vira também texto no cadastro, porque a
     ficha de EPI e a lista de presença imprimem esses nomes. Sem escolha,
     o que já estava escrito fica como estava. */
  const temDP = pode('jornada');
  const unidade = temDP ? jd.dados.unidades.find(u => u.id === $('fuUnidade').value) : null;
  const setor   = temDP ? jd.dados.setores.find(s => s.id === $('fuSetor').value) : null;
  const funcao  = temDP ? jd.dados.funcoes.find(x => x.id === $('fuCargo').value) : null;

  if (unidade) {
    f.empregador = jd.empregadorDe(unidade)?.nome || f.empregador;
    f.fazenda = jd.fazendaDe(unidade)?.nome || f.fazenda;
  }
  if (setor) f.setor = setor.nome;
  if (funcao) f.cargo = funcao.nome;

  await db.salvarFuncionario(f);

  if (temDP) {
    // Só os campos do Nível 1. Jornada e riscos ficam como estão.
    await jd.salvarVinculo(f.id, {
      unidade_id: $('fuUnidade').value || null,
      setor_id: $('fuSetor').value || null,
      funcao_id: $('fuCargo').value || null,
      admissao: f.admissao,
      ativo: f.situacao === 'ATIVO',
    });
  }

  $('dlgFunc').close();
  preencherControles(); desenharFuncionarios(); desenharSelecao();
});

$('bApagarFunc').addEventListener('click', async () => {
  if (!editandoFunc?.id) return;
  if (!confirm(`Apagar ${editandoFunc.nome}? As fichas salvas dele também saem.`)) return;
  await db.apagarFuncionario(editandoFunc.id);
  marcados.delete(editandoFunc.id);
  naLista.delete(editandoFunc.id);
  $('dlgFunc').close();
  desenharFuncionarios(); desenharSelecao();
});

/* =============== importar a planilha =============== */
const ROTULOS = {
  apelido: 'apelido', cpf: 'CPF', nascimento: 'nascimento', telefone: 'telefone',
  cadastro: 'nº de cadastro', admissao: 'admissão', empregador: 'empregador',
  fazenda: 'fazenda', setor: 'setor', cargo: 'cargo',
  tam_camisa: 'tam. camisa', tam_calcado: 'tam. calçado',
};
let importacao = null;   // { novos, completar } segurando o resultado da conferência

$('bImportar').addEventListener('click', () => { $('arqPlanilha').value = ''; $('arqPlanilha').click(); });

$('arqPlanilha').addEventListener('change', async ev => {
  const arquivo = ev.target.files && ev.target.files[0];
  if (!arquivo) return;
  const erro = $('erroImportar'); erro.hidden = true;
  $('resumoImportar').innerHTML = '<div class="imp-nada">Lendo a planilha...</div>';
  $('bConfirmarImportar').disabled = true;
  $('dicaImportar').textContent = '';
  $('dlgImportar').showModal();
  try {
    const daPlanilha = await lerFuncionarios(arquivo);
    if (!daPlanilha.length) throw new Error('Não achei nenhuma pessoa preenchida na aba Funcionários.');
    importacao = comparar(daPlanilha, estado.funcionarios);
    desenharImportacao(arquivo.name, daPlanilha.length);
  } catch (e) {
    importacao = null;
    $('resumoImportar').innerHTML = '';
    erro.textContent = e?.message || 'Não consegui ler a planilha.';
    erro.hidden = false;
  }
});

function desenharImportacao(nomeArquivo, lidas) {
  const { novos, completar, iguais } = importacao;
  const bloco = (titulo, itens, corpo) => `
    <div class="imp-grupo">
      <h4>${esc(titulo)}</h4>
      <div class="cx">${itens.length ? itens.map(corpo).join('') : '<div class="imp-nada">Nenhum.</div>'}</div>
    </div>`;

  $('resumoImportar').innerHTML =
    `<p class="dica">${esc(nomeArquivo)} · ${lidas} pessoa(s) na planilha.</p>` +
    bloco(`Entram no cadastro (${novos.length})`, novos, p => `
      <div class="imp-linha"><b>${esc(p.nome)}</b>
        <span class="sub">${esc(p.cargo || '—')} · ${esc(p.empregador || '—')}${p.cadastro ? ' · nº ' + esc(p.cadastro) : ''}${p.nascimento ? ' · nasc. ' + esc(dataBr(p.nascimento)) : ''}</span>
      </div>`) +
    bloco(`Já cadastrados, completando o que está em branco (${completar.length})`, completar, c => `
      <div class="imp-linha"><b>${esc(c.atual.nome)}</b>
        <span class="sub">achado por ${esc(c.por)} · ${c.campos.length ? 'completa ' + c.campos.map(x => ROTULOS[x] || x).join(', ') : 'sem campos a completar'}${c.trocaSituacao ? ` · passa para ${esc(c.planilha.situacao)}` : ''}</span>
      </div>`);

  $('dicaImportar').textContent = `${iguais.length} já estão iguais e não serão tocados.`;
  $('bConfirmarImportar').disabled = !(novos.length || completar.length);
}

$('formImportar').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!importacao) return;
  const botao = $('bConfirmarImportar');
  botao.disabled = true; botao.textContent = 'Gravando...';
  const { novos, completar } = importacao;
  try {
    for (const p of novos) {
      const f = { id: db.novoId() };
      for (const campo of ['nome', 'apelido', 'cpf', 'nascimento', 'telefone', 'cadastro',
        'admissao', 'empregador', 'fazenda', 'setor', 'cargo', 'tam_camisa', 'tam_calcado', 'situacao']) {
        f[campo] = p[campo] || (campo === 'nascimento' || campo === 'admissao' ? null : '');
      }
      f.situacao = p.situacao;
      await db.salvarFuncionario(f);
    }
    for (const c of completar) {
      await db.salvarFuncionario(aplicarEm(c.atual, c.planilha, c.campos, c.trocaSituacao));
    }
    mostrarAviso(`Importação pronta: ${novos.length} novo(s) e ${completar.length} completado(s).`);
  } finally {
    botao.textContent = 'Gravar';
    importacao = null;
    $('dlgImportar').close();
    preencherControles(); desenharFuncionarios(); desenharSelecao(); desenharSelecaoLista();
  }
});

function mostrarAviso(texto) {
  const a = $('avisoGlobal');
  a.textContent = texto; a.className = 'aviso ok'; a.hidden = false;
  setTimeout(() => { a.hidden = true; a.className = 'aviso info'; }, 6000);
}

/* =============== aba ANIVERSARIANTES =============== */
function listaAniversarios() {
  const mes = +$('anMes').value;
  const soAtivos = $('anSit').value === 'ativos';
  return { mes, ano: +$('anAno').value || new Date().getFullYear(), soAtivos,
    gente: aniversariantes(estado.funcionarios, mes, soAtivos) };
}

function atualizarAniversarios() {
  const { mes, ano, soAtivos, gente } = listaAniversarios();

  $('anLista').innerHTML = gente.length ? gente.map(a => `
    <div class="item" style="grid-template-columns:auto 1fr">
      <span class="tag ativo">dia ${String(a.dia).padStart(2, '0')}</span>
      <span class="nome">${esc(a.nome)}${a.apelido ? ' (' + esc(a.apelido) + ')' : ''}</span>
    </div>`).join('')
    : '<div class="vazio">Ninguém faz aniversário neste mês.</div>';

  const faltando = semNascimento(estado.funcionarios, soAtivos);
  const aviso = $('anAviso');
  if (faltando) {
    aviso.textContent = `${faltando} pessoa(s) ainda estão sem data de nascimento no cadastro — ` +
      'importe a planilha ou preencha na aba Funcionários para aparecerem aqui.';
    aviso.hidden = false;
  } else aviso.hidden = true;

  $('saidaAniversarios').innerHTML = montarAniversarios(gente, mes, ano);
}

['anMes', 'anAno', 'anSit'].forEach(id => $(id).addEventListener('input', atualizarAniversarios));
$('bImprimirAniv').addEventListener('click', () => window.print());
$('zoomAniv').addEventListener('input', () => {
  const z = $('zoomAniv').value;
  $('zoomVAniv').textContent = z + '%';
  $('saidaAniversarios').style.transform = `scale(${z / 100})`;
  $('saidaAniversarios').style.transformOrigin = 'top center';
});

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Manda a imagem do mês junto com o texto. O link do wa.me só carrega texto,
   então o caminho bom é o compartilhamento do próprio aparelho
   (navigator.share); onde ele não existe, a imagem é baixada e o WhatsApp abre
   com o texto para ele anexar. */
$('bWhatsapp').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  const { mes, ano, gente } = listaAniversarios();
  const texto = textoWhatsapp(gente, mes, ano);
  botao.disabled = true; botao.textContent = 'Preparando...';
  try {
    const png = await imagemAniversarios(gente, mes, ano);
    const arquivo = new File([png], nomeImagem(mes, ano), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: texto });
    } else {
      baixar(png, arquivo.name);
      window.open(linkWhatsapp(texto), '_blank', 'noopener');
      mostrarAviso('A imagem foi baixada. No WhatsApp que abriu, anexe o arquivo ' +
        arquivo.name + ' junto com o texto.');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;          // ele fechou o compartilhamento
    window.open(linkWhatsapp(texto), '_blank', 'noopener');
  } finally {
    botao.disabled = false; botao.textContent = 'Enviar no WhatsApp';
  }
});

$('bBaixarAniv').addEventListener('click', async ev => {
  const botao = ev.currentTarget;
  const { mes, ano, gente } = listaAniversarios();
  botao.disabled = true;
  try {
    baixar(await imagemAniversarios(gente, mes, ano), nomeImagem(mes, ano));
  } finally { botao.disabled = false; }
});

$('bCopiarAniv').addEventListener('click', async ev => {
  const { mes, ano, gente } = listaAniversarios();
  const botao = ev.currentTarget;
  try {
    await navigator.clipboard.writeText(textoWhatsapp(gente, mes, ano));
    botao.textContent = 'Copiado';
  } catch { botao.textContent = 'Não deu para copiar'; }
  setTimeout(() => { botao.textContent = 'Copiar texto'; }, 1600);
});

/* =============== aba EPIS =============== */
function desenharEpis() {
  const q = $('buscaEpi').value.trim().toLowerCase();
  const lista = estado.epis.filter(e =>
    !q || [e.descricao, e.ca, e.atividade].some(v => String(v || '').toLowerCase().includes(q)));
  $('listaEpi').innerHTML = lista.length ? lista.map(e => `
    <div class="item" style="grid-template-columns:1fr auto">
      <span>
        <span class="nome">${esc(e.descricao)}</span><br>
        <span class="sub">${e.ca ? 'C.A ' + esc(e.ca) : 'sem C.A'}${e.observacao ? ' · ' + esc(e.observacao) : ''}${e.atividade ? ' · ' + esc(e.atividade) : ''}</span>
      </span>
      <span class="acoes"><button class="btn mini" data-editar="${e.id}">Editar</button></span>
    </div>`).join('')
    : '<div class="vazio">Nenhum EPI encontrado.</div>';
  $('listaEpi').querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrirEpi(b.dataset.editar)));
}

function abrirEpi(id) {
  const e = id ? estado.epis.find(x => x.id === id) : null;
  editandoEpi = e ? { ...e } : { id: db.novoId(), ativo: true };
  $('tituloEpi').textContent = e ? 'Editar EPI' : 'Novo EPI';
  $('epDescricao').value = editandoEpi.descricao || '';
  $('epCa').value = editandoEpi.ca || '';
  $('epObs').value = editandoEpi.observacao || '';
  $('epAtividade').value = editandoEpi.atividade || '';
  $('bApagarEpi').hidden = !e;
  $('dlgEpi').showModal();
}

$('bNovoEpi').addEventListener('click', () => abrirEpi(null));
$('buscaEpi').addEventListener('input', desenharEpis);

$('formEpi').addEventListener('submit', async ev => {
  ev.preventDefault();
  const e = {
    ...editandoEpi,
    descricao: $('epDescricao').value.trim(),
    ca: $('epCa').value.trim(),
    observacao: $('epObs').value.trim(),
    atividade: $('epAtividade').value.trim(),
  };
  if (!e.descricao) return;
  await db.salvarEpi(e);
  $('dlgEpi').close();
  preencherControles(); desenharEpis();
});

$('bApagarEpi').addEventListener('click', async () => {
  if (!editandoEpi?.id) return;
  if (!confirm(`Apagar "${editandoEpi.descricao}" do catálogo?`)) return;
  await db.apagarEpi(editandoEpi.id);
  $('dlgEpi').close();
  preencherControles(); desenharEpis();
});

/* =============== aba MODELO =============== */
function preencherModelo() {
  const m = modeloAtual();
  $('mTitulo').value = m.titulo || '';
  $('mRotuloFaz').value = m.rotulo_faz || '';
  $('mRotuloMer').value = m.rotulo_mer || '';
  $('mLegFaz').value = (m.legenda_faz || []).join('\n');
  $('mLegMer').value = (m.legenda_mer || []).join('\n');
  $('mDeclTitulo').value = m.declaracao_titulo || '';
  $('mDecls').value = (m.declaracoes || []).join('\n');
  $('mDeclLonga').value = m.declaracao_longa || '';
  $('mRodape').value = m.rodape_demissao || '';
  $('mSetor').value = m.setor_padrao || '';
  $('mLinhas').value = m.linhas_padrao || 20;
}

const emLinhas = txt => txt.split('\n').map(s => s.trim()).filter(Boolean);

$('formModelo').addEventListener('submit', async ev => {
  ev.preventDefault();
  await db.salvarModelo({
    ...modeloAtual(),
    titulo: $('mTitulo').value,
    rotulo_faz: $('mRotuloFaz').value,
    rotulo_mer: $('mRotuloMer').value,
    legenda_faz: emLinhas($('mLegFaz').value),
    legenda_mer: emLinhas($('mLegMer').value),
    declaracao_titulo: $('mDeclTitulo').value,
    declaracoes: emLinhas($('mDecls').value),
    declaracao_longa: $('mDeclLonga').value,
    rodape_demissao: $('mRodape').value,
    setor_padrao: $('mSetor').value,
    linhas_padrao: Math.max(1, Math.min(40, parseInt($('mLinhas').value) || 20)),
  });
  atualizarFichas();
  const b = ev.submitter; if (b) { b.textContent = 'Salvo'; setTimeout(() => b.textContent = 'Salvar modelo', 1600); }
});

$('bRestaurarModelo').addEventListener('click', async () => {
  if (!confirm('Voltar todos os textos ao original da planilha?')) return;
  await db.salvarModelo({ ...SEED_MODELO });
  preencherModelo(); atualizarFichas();
});

/* =============== geral =============== */
document.querySelectorAll('[data-fechar]').forEach(b =>
  b.addEventListener('click', () => b.closest('dialog').close()));

db.aoMudar(() => {
  const online = estado.online;
  $('estadoTexto').textContent = estado.pendentes
    ? `${estado.pendentes} para enviar`
    : (online ? 'sincronizado' : 'offline');
  $('estadoRede').querySelector('.pt').classList.toggle('off', !online || estado.pendentes > 0);
});

/* instalação do PWA */
let promptInstalar = null;
addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  promptInstalar = ev;
  $('btnInstalar').hidden = false;
});
$('btnInstalar').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  $('btnInstalar').hidden = true;
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* arranque */
ligarDisc(); ligarAcesso(); ligarJornada(abrirAba); ligarSst(mostrarAviso);
(async () => {
  const r = await db.iniciar();
  mostrar(r.etapa);
  if (r.etapa === 'app') await carregarTudo();
})();
