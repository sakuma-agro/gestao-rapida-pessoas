// termos.js — os dois termos que a Certificação exige por funcionário:
// liberdade sindical (módulo GRASP do GLOBALG.A.P.) e recebimento da segunda
// via do contrato de trabalho.
//
// Vieram da planilha TERMOS.xlsx, onde cada um puxava nome, CPF, função,
// empregador e fazenda com XLOOKUP na aba FUNCIONARIOS. Aqui esses dados já
// estão no cadastro: o termo é só escolher a pessoa e imprimir.
//
// O texto NÃO fica no código. Mora em `modelo.termos`, do mesmo jeito que o
// cabeçalho da lista de presença mora em `modelo.lista` — quem muda o telefone
// do sindicato ou uma cláusula é ele, pelo próprio app.
import { estado, modeloAtual, salvarModelo } from './store.js';
import { LOGO, PE_LOP_SIMBOLO as PE_LOP } from './seed.js';
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();

/* No cadastro de funcionário a fazenda é texto livre, e no cadastro de
   fazendas ela é registro. "FAZ. REUNIDAS QUEBRA COCÃO" e "Faz. Reunidas
   Quebra Cocao" são a mesma coisa — então compara-se sem acento, sem caixa e
   sem espaço sobrando. */
const semAcento = v => so(v).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');
const fazendaDe = nome => (jd.dados.fazendas || [])
  .find(f => semAcento(f.nome) === semAcento(nome)) || null;

const cpfBr = c => {
  const d = so(c).replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : so(c);
};

const LINHA = '______/______/______';
const ASSINATURA = '____________________________________________________';

/* =============== texto de fábrica ===============
   Só serve de ponto de partida e de "Restaurar original". O que vale é o que
   está salvo em `modelo.termos`.

   Em `itens`, cada linha é um parágrafo. Linha que começa com "- " vira item
   recuado, que é como a planilha listava os sub-itens de cada cláusula. */
export const TERMOS_PADRAO = {
  sindical: {
    titulo: 'TERMO DE LIBERDADE SINDICAL',
    abertura: 'A empresa {EMPREGADOR}, estabelecida na {ENDERECO}, em conformidade '
      + 'com o artigo 8º da Constituição Federal, com a Consolidação das Leis do Trabalho '
      + '(CLT) e com o módulo GRASP do GLOBALG.A.P., declara e informa que:',
    itens: [
      '1. Todo trabalhador possui plena liberdade sindical, sendo-lhe assegurado o direito de:',
      '- filiar-se a sindicato ou organização representativa de sua categoria profissional;',
      '- não se filiar ou desfiliar-se a qualquer momento;',
      '- participar da fundação de entidade sindical, conforme a legislação vigente.',
      '2. A decisão de filiação sindical é livre, voluntária e individual, não sendo admitida qualquer forma de:',
      '- pressão;',
      '- coação;',
      '- indução;',
      '- constrangimento;',
      '- discriminação ou penalização.',
      '3. A empresa respeita integralmente a autonomia e liberdade de escolha do trabalhador, '
        + 'não condicionando admissão, manutenção do emprego, benefícios ou quaisquer vantagens '
        + 'à filiação ou não filiação sindical.',
      '4. O trabalhador poderá, a qualquer momento, alterar sua condição de filiação sindical, conforme sua vontade.',
      '5. Eventuais contribuições ou mensalidades sindicais somente poderão ser descontadas em folha '
        + 'mediante autorização expressa e individual do trabalhador, conforme legislação aplicável.',
      '6. Para conhecimento dos trabalhadores, informa-se que a entidade sindical representativa '
        + 'da categoria na região é:',
      '- {SINDICATO}',
      '- Telefone: {SINDICATO_TELEFONE}',
      '- E-mail: {SINDICATO_EMAIL}',
      '7. Este direito aplica-se igualmente a:',
      '- trabalhadores próprios (CLT);',
      '- trabalhadores subcontratados enquanto estiverem exercendo atividades nesta propriedade.',
    ].join('\n'),
    fecho: 'O presente termo é firmado para fins de informação, registro e comprovação do '
      + 'respeito à liberdade sindical assegurada aos trabalhadores.',
    sindicato: 'Sindicato dos Trabalhadores Rurais de São Gotardo',
    sindicato_telefone: '(34) 9958-6551',
    sindicato_email: 'sindicadostrabalhadoresg@hotmail.com',
    ciencia_titulo: 'CIÊNCIA DO TRABALHADOR',
    ciencia: 'Declaro que recebi, li e compreendi as informações acima relativas à minha liberdade sindical.',
  },
  contrato: {
    titulo: 'TERMO DE RECEBIMENTO DE SEGUNDA VIA DO CONTRATO DE TRABALHO',
    corpo: 'Eu, {NOME}, portador(a) do CPF nº {CPF}, declaro para os devidos fins que recebi '
      + 'nesta data a segunda via do meu Contrato de Trabalho, firmado com a empresa {EMPREGADOR}.',
    ciencia: 'Declaro, ainda, que estou ciente de todas as cláusulas e condições nele contidas, '
      + 'nada tendo a reclamar quanto ao seu conteúdo.',
    fecho: 'Por ser verdade, firmo o presente termo.',
    local: 'São Gotardo',
  },
};

/** O que está valendo: o de fábrica coberto pelo que ele salvou. */
export const termosAtuais = modelo => {
  const t = modelo?.termos || {};
  return {
    sindical: { ...TERMOS_PADRAO.sindical, ...(t.sindical || {}) },
    contrato: { ...TERMOS_PADRAO.contrato, ...(t.contrato || {}) },
  };
};

/* =============== dados do funcionário ===============
   A planilha buscava tudo pelo nome. Aqui vem do cadastro, e o endereço da
   fazenda vem do cadastro de fazendas (Cadastros › Empregador e fazenda). */
export function dadosDe(func) {
  if (!func) return null;
  const faz = fazendaDe(func.fazenda);
  const municipio = so(faz?.municipio);
  return {
    nome: so(func.nome),
    cpf: cpfBr(func.cpf) || '—',
    funcao: so(func.cargo) || '—',
    empregador: so(func.empregador) || '—',
    fazenda: so(func.fazenda) || '—',
    endereco: so(faz?.endereco)
      || [so(faz?.nome), municipio && `${municipio}${faz?.uf ? '/' + faz.uf : ''}`].filter(Boolean).join(', ')
      || '—',
  };
}

/** Troca {NOME}, {CPF}, {EMPREGADOR}... pelo que veio do cadastro. */
function preencher(texto, d, cfg) {
  const de = {
    NOME: d.nome, CPF: d.cpf, FUNCAO: d.funcao, EMPREGADOR: d.empregador,
    FAZENDA: d.fazenda, ENDERECO: d.endereco,
    SINDICATO: cfg.sindicato, SINDICATO_TELEFONE: cfg.sindicato_telefone,
    SINDICATO_EMAIL: cfg.sindicato_email, LOCAL: cfg.local,
  };
  return so(texto).replace(/\{(\w+)\}/g, (todo, chave) =>
    de[chave] !== undefined ? de[chave] : todo);
}

const paragrafos = (texto, d, cfg) => so(texto).split('\n')
  .map(l => l.trim()).filter(Boolean)
  .map(l => l.startsWith('- ')
    ? `<p class="tm-item">${esc(preencher(l.slice(2), d, cfg))}</p>`
    : `<p class="tm-p">${esc(preencher(l, d, cfg))}</p>`)
  .join('');

/* =============== as folhas =============== */
function moldura(titulo, subtitulo, miolo, rodape) {
  return `<div class="an-folha tm-folha">
    <div class="an-topo">
      <img src="${LOGO}" alt="">
      <div class="an-tit">
        <h1>${esc(titulo)}</h1>
        <p>${esc(subtitulo)}</p>
      </div>
    </div>
    <div class="tm-corpo">${miolo}</div>
    <div class="an-pe"><span>${esc(rodape)}</span><span></span></div>
    ${PE_LOP}
  </div>`;
}

export function folhaSindical(func, modelo) {
  const cfg = termosAtuais(modelo).sindical;
  const d = dadosDe(func);
  if (!d) return '';
  return moldura(cfg.titulo, `${d.empregador} · ${d.fazenda}`, `
    <p class="tm-p">${esc(preencher(cfg.abertura, d, cfg))}</p>
    ${paragrafos(cfg.itens, d, cfg)}
    <p class="tm-p">${esc(preencher(cfg.fecho, d, cfg))}</p>
    <div class="tm-ciencia">
      <strong>${esc(cfg.ciencia_titulo)}</strong>
      <p class="tm-p">${esc(preencher(cfg.ciencia, d, cfg))}</p>
      <p class="tm-campo">Nome: ${esc(d.nome)}</p>
      <p class="tm-campo">CPF: ${esc(d.cpf)}</p>
      <p class="tm-campo">Função: ${esc(d.funcao)}</p>
      <p class="tm-campo">Data: ${LINHA}</p>
      <p class="tm-campo">Assinatura: ${ASSINATURA}</p>
    </div>`, 'SAKUMA Agronegócios');
}

export function folhaContrato(func, modelo, dataIso) {
  const cfg = termosAtuais(modelo).contrato;
  const d = dadosDe(func);
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataIso || '');
  const quando = m ? `${m[3]}/${m[2]}/${m[1]}` : LINHA;
  return moldura(cfg.titulo, `${d.empregador} · ${d.fazenda}`, `
    <p class="tm-p">${esc(preencher(cfg.corpo, d, cfg))}</p>
    <p class="tm-p">${esc(preencher(cfg.ciencia, d, cfg))}</p>
    <p class="tm-p">${esc(preencher(cfg.fecho, d, cfg))}</p>
    <div class="tm-ciencia">
      <p class="tm-campo">Local e data: ${esc(cfg.local)} ${quando}</p>
      <p class="tm-campo">Assinatura do(a) empregado(a): ${ASSINATURA}</p>
    </div>`, 'SAKUMA Agronegócios');
}

/* =============== telas =============== */
const QUAIS = {
  termoSindical: {
    grupo: 'sindical',
    sel: 'tmSinFunc', saida: 'tmSinSaida', aviso: 'tmSinAviso',
    form: 'formTmSindical', restaurar: 'bRestaurarTmSindical',
    campos: {
      tmSinTitulo: 'titulo', tmSinAbertura: 'abertura', tmSinItens: 'itens',
      tmSinFecho: 'fecho', tmSinSindicato: 'sindicato',
      tmSinTelefone: 'sindicato_telefone', tmSinEmail: 'sindicato_email',
      tmSinCienciaTitulo: 'ciencia_titulo', tmSinCiencia: 'ciencia',
    },
    folha: f => folhaSindical(f, modeloAtual()),
  },
  termoContrato: {
    grupo: 'contrato',
    sel: 'tmConFunc', saida: 'tmConSaida', aviso: 'tmConAviso',
    form: 'formTmContrato', restaurar: 'bRestaurarTmContrato',
    campos: {
      tmConTitulo: 'titulo', tmConCorpo: 'corpo', tmConCiencia: 'ciencia',
      tmConFecho: 'fecho', tmConLocal: 'local',
    },
    folha: f => folhaContrato(f, modeloAtual(), $('tmConData').value),
  },
};

const ativos = () => (estado.funcionarios || [])
  .filter(f => f.situacao === 'ATIVO')
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

function preencherSelect(q) {
  const sel = $(q.sel);
  if (!sel) return;
  const antes = sel.value;
  const lista = ativos();
  sel.innerHTML = '<option value="">Escolha um funcionário...</option>'
    + lista.map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('');
  if (lista.some(f => String(f.id) === antes)) sel.value = antes;
}

function preencherTexto(q) {
  const cfg = termosAtuais(modeloAtual())[q.grupo];
  for (const [id, chave] of Object.entries(q.campos)) {
    const el = $(id);
    if (el) el.value = cfg[chave] ?? '';
  }
}

function desenhar(q) {
  const sel = $(q.sel);
  const saida = $(q.saida);
  const aviso = $(q.aviso);
  if (!sel || !saida) return;
  const func = (estado.funcionarios || []).find(f => String(f.id) === sel.value);
  if (!func) {
    saida.innerHTML = '';
    aviso.textContent = 'Escolha um funcionário para montar o termo.';
    aviso.className = 'aviso info'; aviso.hidden = false;
    return;
  }
  saida.innerHTML = q.folha(func);

  /* O endereço da fazenda é o único dado que pode faltar: ele só existe depois
     que alguém preenche em Cadastros › Empregador e fazenda. Sem ele o termo
     ainda sai, com fazenda e município no lugar — mas o aviso avisa. */
  const faz = fazendaDe(func.fazenda);
  const faltas = [];
  if (!so(func.cpf)) faltas.push('CPF');
  if (!so(func.empregador)) faltas.push('empregador');
  if (q.grupo === 'sindical' && !so(faz?.endereco)) faltas.push('endereço da fazenda');

  /* A folha tem altura fixa e corta o que passa dela — num termo que vai ser
     assinado, texto cortado é defeito grave e silencioso. Como ele pode
     aumentar o texto pela aba acima, a sobra é medida e denunciada na hora. */
  const folha = saida.querySelector('.an-folha');
  const sobra = folha ? folha.scrollHeight - folha.clientHeight : 0;

  if (sobra > 1) {
    aviso.textContent = 'O texto passou do tamanho da folha e seria cortado na '
      + 'impressão. Encurte o texto do termo na aba acima.';
    aviso.className = 'aviso erro'; aviso.hidden = false;
  } else if (faltas.length) {
    aviso.textContent = `Falta no cadastro: ${faltas.join(', ')}. `
      + 'O termo sai assim mesmo, mas o campo fica incompleto.';
    aviso.className = 'aviso'; aviso.hidden = false;
  } else aviso.hidden = true;
}

/** Redesenha a tela aberta — chamado quando o cadastro muda. */
export function abrirTermos(nome) {
  const q = QUAIS[nome];
  if (!q) return;
  preencherSelect(q);
  preencherTexto(q);
  desenhar(q);
}

export function ligarTermos(mostrarAviso) {
  for (const [nome, q] of Object.entries(QUAIS)) {
    const sel = $(q.sel);
    if (sel) sel.addEventListener('change', () => desenhar(q));

    const form = $(q.form);
    if (form) form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const cfg = { ...termosAtuais(modeloAtual())[q.grupo] };
      for (const [id, chave] of Object.entries(q.campos)) {
        const el = $(id);
        if (el) cfg[chave] = el.value;
      }
      const m = modeloAtual();
      await salvarModelo({ ...m, termos: { ...(m.termos || {}), [q.grupo]: cfg } });
      desenhar(q);
      mostrarAviso?.('Texto do termo salvo.');
    });

    const bRest = $(q.restaurar);
    if (bRest) bRest.addEventListener('click', async () => {
      if (!confirm('Voltar o texto deste termo para o original?\n\n'
        + 'O que você escreveu aqui se perde.')) return;
      const m = modeloAtual();
      await salvarModelo({ ...m, termos: { ...(m.termos || {}), [q.grupo]: null } });
      preencherTexto(q);
      desenhar(q);
      mostrarAviso?.('Texto restaurado.');
    });
  }

  const data = $('tmConData');
  if (data) data.addEventListener('input', () => desenhar(QUAIS.termoContrato));

  $('bImprimirTmSindical')?.addEventListener('click', () => window.print());
  $('bImprimirTmContrato')?.addEventListener('click', () => window.print());

  for (const [zoom, saida] of [['zoomTmSin', 'tmSinSaida'], ['zoomTmCon', 'tmConSaida']]) {
    const z = $(zoom);
    if (!z) continue;
    z.addEventListener('input', () => {
      $(zoom + 'V').textContent = z.value + '%';
      $(saida).style.transform = `scale(${z.value / 100})`;
      $(saida).style.transformOrigin = 'top center';
    });
  }
}
