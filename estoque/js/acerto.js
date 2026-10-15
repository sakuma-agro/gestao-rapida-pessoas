// acerto.js — lê a planilha do acerto e desenha as telas do módulo.
//
// A planilha de origem é a "Acerto_Insumos": abas "Sistema - <depósito>" e
// "Físico - <depósito>", cada uma com produto na coluna A e quantidade na B.
// O app não precisa da aba Acerto nem das macros — refaz a conta sozinho, com
// o mesmo critério (ver acerto-motor.js).
import { lerAba, listarAbas, semAcento } from './planilha.js';
import { acertar, classificacao, numero, TIPOS_SAIDA, TIPOS_ENTRADA } from './acerto-motor.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* O que está carregado agora. Fica também no localStorage, para o app abrir
   já com a última importação — mesmo sem internet. */
let dados = null;   // { arquivo, quando, depositos, itens, fora }
let conta = null;   // saída do motor

const CHAVE = 'estoque.acerto';
const CHAVE_FORA = 'estoque.incluirFora';

/* Produtos que estão nas abas de estoque mas não na aba Cadastro.
   A planilha os ignora em silêncio — a aba Acerto só lista o que vem do
   Cadastro. O app faz o mesmo por padrão, para bater número a número com
   ela, e deixa o Guilherme ligar a chave quando quiser vê-los. */
let incluirFora = false;
try { incluirFora = localStorage.getItem(CHAVE_FORA) === '1'; } catch { /* sem localStorage */ }

const itensDaConta = () =>
  (dados?.itens || []).filter(i => incluirFora || i.noCadastro);

function recalcular() {
  conta = dados ? acertar(itensDaConta(), dados.depositos) : null;
}

/* =============== leitura da planilha =============== */

/** "Faz .Faca" e "Faz . Três Riachos" viram "Faz. Faca" e "Faz. Três Riachos". */
const arrumarNome = s => String(s || '').replace(/\s+/g, ' ')
  .replace(/\s*\.\s*/g, '. ').replace(/\s+/g, ' ').trim();

const chaveProduto = s => semAcento(s).replace(/\s+/g, ' ').trim();

export async function importarPlanilha(arquivo) {
  const abas = await listarAbas(arquivo);
  const achar = prefixo => abas
    .filter(a => semAcento(a).startsWith(prefixo))
    .map(a => ({ aba: a, dep: arrumarNome(a.slice(a.indexOf('-') + 1)) }));

  const sistema = achar('SISTEMA -');
  const fisico = achar('FISICO -');
  if (!sistema.length || !fisico.length) {
    throw new Error('Não achei as abas "Sistema - ..." e "Físico - ..." nesta planilha.');
  }

  // a ordem dos depósitos é a ordem das abas de sistema — a mesma das colunas
  // da planilha, e é ela que manda no cruzamento das transferências
  const depositos = sistema.map(s => s.dep);
  const ondeFisico = new Map(fisico.map(f => [semAcento(f.dep), f.aba]));

  const porProduto = new Map();   // chave -> { produto, dep:{} }
  const cadastro = new Set();
  try {
    for (const l of await lerAba(arquivo, 'Cadastro')) {
      const nome = l && l[1];
      if (nome && chaveProduto(nome) !== 'NOME DO PRODUTO') cadastro.add(chaveProduto(nome));
    }
  } catch { /* planilha sem aba Cadastro: segue com o que as abas trouxerem */ }

  const somar = async (aba, dep, campo) => {
    const linhas = await lerAba(arquivo, aba);
    for (const l of linhas) {
      if (!l) continue;
      const nome = String(l[0] ?? '').trim();
      const qtd = Number(l[1]);
      if (!nome || !isFinite(qtd)) continue;
      const k = chaveProduto(nome);
      if (k === 'PRODUTO') continue;                       // linha de título
      if (!porProduto.has(k)) porProduto.set(k, { produto: nome, dep: {} });
      const item = porProduto.get(k);
      item.dep[dep] = item.dep[dep] || { sistema: 0, fisico: 0 };
      item.dep[dep][campo] += qtd;                          // soma repetidos, como o SOMASE
    }
  };

  for (const s of sistema) await somar(s.aba, s.dep, 'sistema');
  for (const s of sistema) {
    const aba = ondeFisico.get(semAcento(s.dep));
    if (aba) await somar(aba, s.dep, 'fisico');
  }

  const itens = [...porProduto.entries()]
    .map(([k, v]) => ({ ...v, noCadastro: cadastro.size === 0 || cadastro.has(k) }))
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));

  dados = {
    arquivo: arquivo.name,
    quando: new Date().toISOString(),
    depositos,
    itens,
    fora: itens.filter(i => !i.noCadastro).length,
  };
  recalcular();
  guardar();
  return dados;
}

function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* sem espaço: segue sem guardar */ }
}

function recuperar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return;
    dados = JSON.parse(cru);
    recalcular();
  } catch { dados = null; conta = null; }
}

/* =============== telas =============== */

const dataHora = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR').slice(0, 5);
};

function cabecalhoOrigem() {
  if (!dados) return '';
  const contados = itensDaConta().length;
  return `<p class="es-origem">Planilha <strong>${esc(dados.arquivo)}</strong> ·
    lida em ${dataHora(dados.quando)} · ${numero(contados)} produtos ·
    ${dados.depositos.length} depósitos${dados.fora
      ? ` · <span class="es-fora">${dados.fora} fora do cadastro ${incluirFora ? 'incluídos' : 'de fora'}</span>`
      : ''}</p>`;
}

const semDados = onde => `<div class="vazio">
  Nenhuma planilha carregada. Abra <strong>Acerto → Painel</strong> e escolha o arquivo do acerto${onde ? ' para ver ' + onde : ''}.
</div>`;

function desenharPainel() {
  const alvo = $('acPainelCorpo');
  if (!conta) { alvo.innerHTML = ''; $('acResumo').innerHTML = ''; return; }
  const r = conta.resumo;
  $('acResumo').innerHTML = cabecalhoOrigem() + `
    <div class="es-cards">
      <div class="es-card es-ok"><span>Itens conferidos</span><strong>${numero(r.conferidos)}</strong>
        <small>de ${numero(r.produtos)} produtos</small></div>
      <div class="es-card es-transf"><span>Transferir entre fazendas</span><strong>${numero(conta.transferencias.length)}</strong>
        <small>${numero(r.qtdTransferida)} em quantidade</small></div>
      <div class="es-card es-falta"><span>Saídas a registrar</span><strong>${numero(conta.saidas.length)}</strong>
        <small>${numero(r.qtdSaida)} a baixar no sistema</small></div>
      <div class="es-card es-sobra"><span>Entradas a registrar</span><strong>${numero(conta.entradas.length)}</strong>
        <small>${numero(r.qtdEntrada)} a lançar no sistema</small></div>
    </div>`;

  alvo.innerHTML = `
    <div class="cartao">
      <h2>Plano de ação</h2>
      <p class="dica">${numero(r.acoes)} ações no total, na mesma ordem da aba Sugestão de Acerto.</p>
      ${bloco('Transferências entre depósitos', conta.transferencias.map((t, i) =>
        [i + 1, t.produto, t.origem, t.destino, numero(t.qtd)]),
        ['Nº', 'Produto', 'Origem (sobra)', 'Destino (falta)', 'Qtd.'])}
      ${bloco('Saídas a registrar — baixa no sistema', conta.saidas.map((s, i) =>
        [i + 1, s.produto, s.deposito, numero(s.qtd), TIPOS_SAIDA[0]]),
        ['Nº', 'Produto', 'Depósito', 'Qtd. a baixar', 'Tipo de saída'])}
      ${bloco('Entradas a registrar — NF, estorno ou devolução', conta.entradas.map((e, i) =>
        [i + 1, e.produto, e.deposito, numero(e.qtd), TIPOS_ENTRADA[0]]),
        ['Nº', 'Produto', 'Depósito', 'Qtd. a lançar', 'Origem da diferença'])}
    </div>`;
}

function bloco(titulo, linhas, titulos) {
  if (!linhas.length) return `<h3 class="es-secao">${esc(titulo)}</h3><div class="vazio">Nada aqui.</div>`;
  const mostra = linhas.slice(0, 40);
  return `<h3 class="es-secao">${esc(titulo)} <small>${numero(linhas.length)}</small></h3>
    <table class="dc-planilha"><thead><tr>${titulos.map((t, i) =>
      `<th class="${i === 0 || i > 2 ? 'ce' : ''}">${esc(t)}</th>`).join('')}</tr></thead>
    <tbody>${mostra.map(l => `<tr>${l.map((c, i) =>
      `<td class="${i === 0 || i > 2 ? 'ce' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
    ${linhas.length > mostra.length
      ? `<tr class="dc-total"><td colspan="${titulos.length}">e mais ${numero(linhas.length - mostra.length)} — o relatório traz a lista inteira</td></tr>`
      : ''}</tbody></table>`;
}

function desenharDivergencias() {
  const alvo = $('acDivCorpo');
  if (!conta) { alvo.innerHTML = semDados('as diferenças'); return; }
  const soDif = $('acSoDif')?.checked !== false;
  const busca = semAcento($('acBusca')?.value || '');
  const linhas = conta.linhas.filter(l =>
    (!soDif || !l.ok) && (!busca || semAcento(l.produto).includes(busca)));

  const deps = dados.depositos;
  alvo.innerHTML = cabecalhoOrigem() + `
    <table class="dc-planilha es-larga"><thead>
      <tr><th rowspan="2">Produto</th>${deps.map(d =>
        `<th colspan="3" class="ce">${esc(d)}</th>`).join('')}<th rowspan="2">Resultado</th></tr>
      <tr>${deps.map(() => '<th class="ce">Sistema</th><th class="ce">Físico</th><th class="ce">Dif.</th>').join('')}</tr>
    </thead><tbody>
      ${linhas.slice(0, 300).map(l => `<tr>
        <td>${esc(l.produto)}</td>
        ${deps.map(d => {
          const x = l.dif[d] || { sistema: 0, fisico: 0, diferenca: 0 };
          const cor = x.diferenca > 0.0001 ? 'es-num-sobra' : (x.diferenca < -0.0001 ? 'es-num-falta' : '');
          return `<td class="ce">${numero(x.sistema)}</td><td class="ce">${numero(x.fisico)}</td>
                  <td class="ce ${cor}">${x.diferenca ? numero(x.diferenca) : '—'}</td>`;
        }).join('')}
        <td><span class="dc-pin ${l.ok ? 'es-pin-ok' : (l.saidaResidual > 0.0001 ? 'es-pin-falta' : 'es-pin-transf')}">${esc(classificacao(l))}</span></td>
      </tr>`).join('')}
      ${linhas.length > 300 ? `<tr class="dc-total"><td colspan="${deps.length * 3 + 2}">
        mostrando 300 de ${numero(linhas.length)} — use a busca para chegar no produto</td></tr>` : ''}
      ${!linhas.length ? `<tr><td colspan="${deps.length * 3 + 2}" class="ce dc-sem">Nada para mostrar com este filtro.</td></tr>` : ''}
    </tbody></table>`;
}

function desenharTransferencias() {
  const alvo = $('acTransfCorpo');
  if (!conta) { alvo.innerHTML = semDados('as transferências'); return; }
  const t = conta.transferencias;
  alvo.innerHTML = cabecalhoOrigem() + (t.length ? `
    <table class="dc-planilha"><thead><tr>
      <th class="ce">Nº</th><th>Produto</th><th>De (sobra no sistema)</th><th>Para (falta no sistema)</th><th class="ce">Qtd.</th>
    </tr></thead><tbody>
      ${t.map((x, i) => `<tr><td class="ce">${i + 1}</td><td>${esc(x.produto)}</td>
        <td>${esc(x.origem)}</td><td>${esc(x.destino)}</td><td class="ce">${numero(x.qtd)}</td></tr>`).join('')}
      <tr class="dc-total"><td colspan="4">Total transferido</td><td class="ce">${numero(conta.resumo.qtdTransferida)}</td></tr>
    </tbody></table>` : '<div class="vazio">Nenhuma transferência necessária.</div>');
}

/* =============== relatório em A4 =============== */
function desenharRelatorio() {
  const alvo = $('acRelCorpo');
  if (!conta) { alvo.innerHTML = semDados('o relatório'); return; }
  const r = conta.resumo;
  const hoje = new Date().toLocaleDateString('pt-BR');

  const tabela = (titulo, titulos, linhas) => !linhas.length ? '' : `
    <h3 class="rel-secao">${esc(titulo)}</h3>
    <table class="rel-tab"><thead><tr>${titulos.map((t, i) =>
      `<th class="${i === 0 || i === titulos.length - 1 ? 'ce' : ''}">${esc(t)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((c, i) =>
      `<td class="${i === 0 || i === l.length - 1 ? 'ce' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  alvo.innerHTML = `<div class="folha rel">
    <div class="rel-topo">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-tit">
        <h1>Acerto de Estoque — Insumos</h1>
        <p>Balanço de ${esc(dados.depositos.join(' · '))} · emitido em ${hoje}</p>
      </div>
    </div>

    <div class="rel-kpis">
      <div><span>Produtos</span><b>${numero(r.produtos)}</b></div>
      <div><span>Conferidos</span><b>${numero(r.conferidos)}</b></div>
      <div><span>Transferências</span><b>${numero(conta.transferencias.length)}</b></div>
      <div><span>Saídas</span><b>${numero(conta.saidas.length)}</b></div>
      <div><span>Entradas</span><b>${numero(conta.entradas.length)}</b></div>
    </div>

    ${tabela('Transferências entre depósitos', ['Nº', 'Produto', 'Origem', 'Destino', 'Qtd.'],
      conta.transferencias.map((t, i) => [i + 1, t.produto, t.origem, t.destino, numero(t.qtd)]))}
    ${tabela('Saídas a registrar', ['Nº', 'Produto', 'Depósito', 'Qtd. a baixar'],
      conta.saidas.map((s, i) => [i + 1, s.produto, s.deposito, numero(s.qtd)]))}
    ${tabela('Entradas a registrar', ['Nº', 'Produto', 'Depósito', 'Qtd. a lançar'],
      conta.entradas.map((e, i) => [i + 1, e.produto, e.deposito, numero(e.qtd)]))}

    <div class="rel-pe">
      <div class="rel-assina">
        <span></span>
        <small>Guilherme Lopes · Gerente Administrativo</small>
      </div>
      <img class="rel-lop" src="img/lop-marca.png" alt="LOP">
    </div>
  </div>`;
}

/* =============== ligação com o app =============== */
export function ligarAcerto(aviso) {
  recuperar();

  $('acArquivo').addEventListener('change', async ev => {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    const botao = $('acArquivoRot');
    botao.textContent = 'Lendo a planilha...';
    try {
      await importarPlanilha(arquivo);
      aviso(`Planilha lida: ${numero(dados.itens.length)} produtos e ${numero(conta.resumo.acoes)} ações de acerto.`, 'ok');
      abrirAcerto('acPainel');
    } catch (e) {
      aviso(e.message || 'Não consegui ler esta planilha.', 'erro');
    } finally {
      botao.textContent = 'Escolher planilha do acerto';
      ev.target.value = '';
    }
  });

  $('acFora')?.addEventListener('change', ev => {
    incluirFora = ev.target.checked;
    try { localStorage.setItem(CHAVE_FORA, incluirFora ? '1' : '0'); } catch { /* segue */ }
    recalcular();
    desenharPainel();
  });

  $('acBusca')?.addEventListener('input', desenharDivergencias);
  $('acSoDif')?.addEventListener('change', desenharDivergencias);
  $('acImprimir')?.addEventListener('click', () => window.print());
}

export function abrirAcerto(tela) {
  const chave = $('acFora');
  if (chave) {
    chave.checked = incluirFora;
    chave.closest('.es-check').hidden = !dados?.fora;
  }
  if (tela === 'acPainel') desenharPainel();
  if (tela === 'acDivergencias') desenharDivergencias();
  if (tela === 'acTransferencias') desenharTransferencias();
  if (tela === 'acRelatorio') desenharRelatorio();
}

export const temDados = () => !!conta;
