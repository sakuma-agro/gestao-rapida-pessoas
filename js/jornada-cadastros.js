// jornada-cadastros.js — cadastrar empregador, fazenda, unidade e destino de DP.
//
// A unidade é o par empregador + fazenda: é ela que o funcionário aponta no
// cadastro (Nível 1) e é por ela que o DP separa o que vai para cada escritório
// de contabilidade. Até aqui essas quatro tabelas só vinham do seed e a tela de
// Configurações do DP era de leitura; agora dá para cadastrar por dentro.
//
// Nada é apagado de verdade — inativa-se (RN-129), senão o histórico de
// boletim e competência fechada fica apontando para o vazio.
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

const ativos = lista => lista.filter(x => x.ativo !== false);
const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

/* =============== as quatro receitas ===============
   campos: t = texto, s = escolha (opcoes devolve [valor, rótulo]) */
const CADASTROS = {
  empregadores: {
    titulo: 'Empregadores',
    dica: 'Quem assina a carteira. O CPF é o do empregador rural. '
      + 'Com a data de nascimento, ele também sai na folha de aniversariantes.',
    singular: 'empregador',
    novo: 'Novo empregador',
    colunas: ['Empregador', 'CPF', 'Nascimento', 'Unidades'],
    linha: e => [
      `<b>${esc(e.nome)}</b>`,
      esc(cpfBr(e.cpf)),
      esc(dataBr(e.nascimento)),
      String(jd.dados.unidades.filter(u => u.empregador_id === e.id).length),
    ],
    campos: [
      { k: 'nome', rotulo: 'Nome', t: 't', req: true, plena: true },
      { k: 'cpf', rotulo: 'CPF', t: 't' },
      { k: 'nascimento', rotulo: 'Data de nascimento', t: 'd' },
    ],
  },

  fazendas: {
    titulo: 'Fazendas',
    dica: 'O município manda no feriado municipal da apuração. O endereço completo é o que sai no termo de liberdade sindical.',
    singular: 'fazenda',
    novo: 'Nova fazenda',
    colunas: ['Fazenda', 'Município', 'UF', 'Endereço', 'Unidades'],
    linha: f => [
      `<b>${esc(f.nome)}</b>`, esc(f.municipio || '—'), esc(f.uf || '—'),
      esc(f.endereco || '—'),
      String(jd.dados.unidades.filter(u => u.fazenda_id === f.id).length),
    ],
    campos: [
      { k: 'nome', rotulo: 'Nome', t: 't', req: true, plena: true },
      { k: 'municipio', rotulo: 'Município', t: 't' },
      { k: 'uf', rotulo: 'UF', t: 't' },
      // é o "estabelecida na ..." do termo de liberdade sindical
      { k: 'endereco', rotulo: 'Endereço completo', t: 't', plena: true },
    ],
  },

  unidades: {
    titulo: 'Unidades (empregador + fazenda)',
    dica: 'É o que o funcionário aponta no cadastro e o que separa o envio para cada DP.',
    singular: 'unidade',
    novo: 'Nova unidade',
    colunas: ['Unidade', 'CAEPF', 'Cód. empresa', 'Destino do DP', 'Pessoas'],
    linha: u => [
      `<b>${esc(jd.nomeUnidade(u))}</b>`,
      esc(u.caepf || '—'),
      esc(u.codigo_empresa || '—'),
      esc(jd.destinoDe(u)?.nome || '—'),
      String(jd.dados.vinculos.filter(v => v.unidade_id === u.id).length),
    ],
    campos: [
      { k: 'empregador_id', rotulo: 'Empregador', t: 's', req: true,
        opcoes: () => ativos(jd.dados.empregadores).sort(porNome).map(e => [e.id, e.nome]) },
      { k: 'fazenda_id', rotulo: 'Fazenda', t: 's', req: true,
        opcoes: () => ativos(jd.dados.fazendas).sort(porNome).map(f => [f.id, f.nome]) },
      { k: 'caepf', rotulo: 'CAEPF', t: 't' },
      { k: 'codigo_empresa', rotulo: 'Código da empresa no DP', t: 't' },
      { k: 'destino_id', rotulo: 'Destino do DP', t: 's', plena: true,
        opcoes: () => ativos(jd.dados.destinos).sort(porNome).map(d => [d.id, d.nome]) },
    ],
  },

  /* As funções seguem o plano de cargos do RH (24/09/2026). Nome, nível e
     situação de uma função do plano vêm de rh_cargos, por um gatilho no banco
     (rh_cargo_para_funcao): mexeu no plano, a função acompanha. Por isso ela
     não se edita aqui. Aqui só nasce função FORA do plano (o Vaqueiro). */
  funcoes: {
    titulo: 'Funções',
    dica: 'Seguem o plano de cargos: nome e nível de uma função do plano se mudam em RH › Cargos e salários › Plano de cargos. '
      + 'Aqui entra só a função que está fora do plano.',
    singular: 'função',
    novo: 'Nova função fora do plano',
    ordenar: (a, b) => (a.ativo === false) - (b.ativo === false)
      || (a.ordem ?? 9999) - (b.ordem ?? 9999) || porNome(a, b),
    travado: f => f.rh_cargo_id
      ? 'Esta função vem do plano de cargos. Para mudar o nome, o nível ou desativar, vá em RH › Cargos e salários › Plano de cargos — a função acompanha sozinha.'
      : '',
    colunas: ['Função', 'Nível', 'Plano de cargos', 'Pessoas'],
    linha: f => [
      `<b>${esc(f.nome)}</b>`,
      esc(f.nivel || '—'),
      f.rh_cargo_id ? 'no plano' : '<span class="dc-sem">fora do plano</span>',
      String(jd.dados.vinculos.filter(v => v.funcao_id === f.id && v.ativo !== false).length),
    ],
    campos: [
      { k: 'nome', rotulo: 'Nome', t: 't', req: true, plena: true },
      { k: 'nivel', rotulo: 'Nível', t: 's',
        opcoes: () => NIVEIS.map(n => [n, n]) },
    ],
  },

  setores: {
    titulo: 'Setores',
    dica: 'Onde a pessoa trabalha. O setor traz a jornada padrão de quem entra nele.',
    singular: 'setor',
    novo: 'Novo setor',
    colunas: ['Setor', 'Jornada padrão', 'Pessoas'],
    linha: s => [
      `<b>${esc(s.nome)}</b>`,
      esc(jd.dados.jornadas.find(j => j.id === s.jornada_id)?.nome || '—'),
      String(jd.dados.vinculos.filter(v => v.setor_id === s.id).length),
    ],
    campos: [
      { k: 'nome', rotulo: 'Nome', t: 't', req: true, plena: true },
      { k: 'jornada_id', rotulo: 'Jornada padrão', t: 's',
        opcoes: () => ativos(jd.dados.jornadas).sort(porNome).map(j => [j.id, j.nome]) },
    ],
  },

  destinos: {
    titulo: 'Destinos do DP',
    dica: 'Cada escritório de contabilidade que recebe os relatórios.',
    singular: 'destino',
    novo: 'Novo destino',
    colunas: ['Destino', 'Responsável', 'Contato', 'Horas', 'Unidades'],
    linha: d => [
      `<b>${esc(d.nome)}</b>`, esc(d.responsavel || '—'),
      esc(d.email || d.telefone || '—'),
      d.formato_horas === 'hhmm' ? 'h:mm' : 'decimal',
      String(jd.dados.unidades.filter(u => u.destino_id === d.id).length),
    ],
    campos: [
      { k: 'nome', rotulo: 'Nome', t: 't', req: true, plena: true },
      { k: 'responsavel', rotulo: 'Responsável', t: 't' },
      { k: 'email', rotulo: 'E-mail', t: 't' },
      { k: 'telefone', rotulo: 'Telefone', t: 't' },
      { k: 'formato_horas', rotulo: 'Formato das horas', t: 's',
        opcoes: () => [['decimal', 'Decimal (1,50)'], ['hhmm', 'Horas e minutos (1:30)']] },
    ],
  },
};

export const NIVEIS = ['Estratégico', 'Tático', 'Operacional'];

const cpfBr = c => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '—');
};

const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/* =============== desenho =============== */
let editando = null;      // { chave, item }
let aoSalvar = () => {};
let ultimoAlvo = { alvoId: 'jorCadastros', quais: null };
const redesenhar = () => desenharCadastros(ultimoAlvo.alvoId, ultimoAlvo.quais);

/* `quais` escolhe quais cadastros a tela desenha. É o que deixa o mesmo
   mecanismo servir duas telas diferentes — Funções e setores numa, empregador
   e fazenda noutra — sem duplicar nada. Sem `quais`, desenha todos. */
export function desenharCadastros(alvoId, quais, callback) {
  if (typeof quais === 'function') { callback = quais; quais = null; }
  if (callback) aoSalvar = callback;
  const alvo = $(alvoId);
  if (!alvo) return;
  ultimoAlvo = { alvoId, quais };

  const lista = (quais || Object.keys(CADASTROS)).filter(k => CADASTROS[k]);
  alvo.innerHTML = lista.map(chave => {
    const c = CADASTROS[chave];
    const itens = [...jd.dados[chave]].sort(c.ordenar || porNome);
    return `
    <div class="jor-cad">
      <div class="barra entre" style="margin:0">
        <div>
          <h3 class="jor-h3" style="margin:0">${esc(c.titulo)}</h3>
          <p class="dc-sem" style="margin:2px 0 0">${esc(c.dica)}</p>
        </div>
        <button class="btn mini" data-novo="${chave}">${esc(c.novo)}</button>
      </div>
      ${itens.length ? `<table class="dc-planilha" style="margin-top:10px"><thead><tr>
        ${c.colunas.map(x => `<th>${esc(x)}</th>`).join('')}<th class="ce">Situação</th><th></th>
      </tr></thead><tbody>${itens.map(x => `<tr${x.ativo === false ? ' class="rh-off"' : ''}>
        ${c.linha(x).map(v => `<td>${v}</td>`).join('')}
        <td class="ce"><span class="tag ${x.ativo === false ? 'inativo' : 'ativo'}">${x.ativo === false ? 'INATIVO' : 'ATIVO'}</span></td>
        <td class="ce"><button class="btn mini" data-editar="${chave}" data-id="${x.id}">Editar</button></td>
      </tr>`).join('')}</tbody></table>`
      : '<div class="vazio">Nada cadastrado ainda.</div>'}
    </div>`;
  }).join('');

  alvo.querySelectorAll('[data-novo]').forEach(b =>
    b.addEventListener('click', () => abrir(b.dataset.novo, null)));
  alvo.querySelectorAll('[data-editar]').forEach(b =>
    b.addEventListener('click', () => abrir(b.dataset.editar, b.dataset.id)));
}

function abrir(chave, id) {
  const c = CADASTROS[chave];
  if (!c) return;
  const item = id ? jd.dados[chave].find(x => x.id === id) : null;
  editando = { chave, item: item ? { ...item } : { ativo: true } };

  $('cadTitulo').textContent = item ? `Editar ${c.singular}` : c.novo;
  $('cadErro').hidden = true;

  // Registro que é de outro cadastro (função do plano de cargos): só se lê.
  const trava = item && c.travado ? c.travado(item) : '';
  $('formCadastro').querySelector('[type=submit]').hidden = !!trava;
  if (trava) {
    $('cadCampos').innerHTML = `<p style="grid-column:1/-1;margin:0"><b>${esc(item.nome)}</b>`
      + `${item.nivel ? ' · nível ' + esc(item.nivel) : ''}</p><p class="dc-sem" style="grid-column:1/-1;margin:0">${esc(trava)}</p>`;
    $('bDesativarCad').hidden = true;
    $('dlgCadastro').showModal();
    return;
  }

  $('cadCampos').innerHTML = c.campos.map(f => {
    const v = editando.item[f.k] ?? '';
    if (f.t === 's') {
      const ops = f.opcoes();
      return `<label class="campo${f.plena ? ' plena' : ''}">${esc(f.rotulo)}
        <select data-campo="${f.k}">
          <option value="">${f.req ? 'Escolha...' : '—'}</option>
          ${ops.map(([val, rot]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(rot)}</option>`).join('')}
        </select></label>`;
    }
    return `<label class="campo${f.plena ? ' plena' : ''}">${esc(f.rotulo)}
      <input type="${f.t === 'd' ? 'date' : 'text'}" data-campo="${f.k}" value="${esc(v)}"></label>`;
  }).join('') + `
    <label class="campo">Situação
      <select data-campo="ativo">
        <option value="1"${editando.item.ativo === false ? '' : ' selected'}>Em uso</option>
        <option value="0"${editando.item.ativo === false ? ' selected' : ''}>Inativo</option>
      </select>
    </label>`;

  $('bDesativarCad').hidden = !item || item.ativo === false;
  $('dlgCadastro').showModal();
}

function erro(texto) {
  $('cadErro').textContent = texto;
  $('cadErro').hidden = false;
}

/* =============== ligações =============== */
export function ligarCadastros() {
  $('formCadastro').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!editando) return;
    const { chave } = editando;
    const c = CADASTROS[chave];

    const linha = { ...editando.item };
    $('cadCampos').querySelectorAll('[data-campo]').forEach(el => {
      const k = el.dataset.campo;
      linha[k] = k === 'ativo' ? el.value === '1' : (so(el.value) || null);
    });

    for (const f of c.campos) {
      if (f.req && !linha[f.k]) return erro(`Falta preencher: ${f.rotulo}.`);
    }

    // não deixa nascer unidade repetida — é o par que identifica
    if (chave === 'unidades') {
      const igual = jd.dados.unidades.find(u =>
        u.id !== linha.id &&
        u.empregador_id === linha.empregador_id &&
        u.fazenda_id === linha.fazenda_id);
      if (igual) return erro('Já existe uma unidade com esse empregador e essa fazenda.');
    }

    try {
      await jd.salvar(chave, linha);
      $('dlgCadastro').close();
      redesenhar();
      aoSalvar();
    } catch (e) {
      erro(e.message || String(e));
    }
  });

  $('bDesativarCad').addEventListener('click', async () => {
    if (!editando?.item?.id) return;
    const c = CADASTROS[editando.chave];
    if (!confirm(`Desativar ${c.singular} "${editando.item.nome || jd.nomeUnidade(editando.item)}"?\n\n` +
      'Ele some das listas novas, mas continua no histórico. Nada é apagado.')) return;
    try {
      await jd.inativar(editando.chave, editando.item.id);
      $('dlgCadastro').close();
      redesenhar();
      aoSalvar();
    } catch (e) { erro(e.message || String(e)); }
  });
}
