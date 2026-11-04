// cert-impressoes.js — Certificação › Documentos › Impressões (04/11/2026)
//
// Pedido do Guilherme: "crie um submódulo na certificação, impressões! coloque
// lista de presença, reunião com gerência, ata da reunião grasp + lista de
// presença grasp". Antes ele pediu a lista "tipo a de presença, onde eu vou
// imprimir e seleciono os funcionários e função para aparecer".
//
// Só imprime: nada fica gravado no banco (a reunião GRASP registrada continua em
// FORMS Digital › Reunião GRASP). Os textos seguem os modelos do OneDrive
// (6 - Certificações › 2 - FORMULÁRIOS): FORM 018, FORM 024 e FORM 044.
// Cada impresso: campos do cabeçalho + funcionários marcados do cadastro de
// ativos, com a função (cargo) do cadastro; sobram linhas em branco para quem
// aparecer sem estar marcado.

import { estado, modeloAtual } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
// Ficha de EPI (04/11/2026): a mesma ficha de SST › EPI's › Fichas, com as medidas
// da planilha (182 mm) e os textos do "Modelo da ficha". Aqui só imprime.
import { montarFicha, linhaVazia, MESES as MESES_FICHA } from './ficha.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const linhas = t => so(t).split('\n').map(so).filter(Boolean);

const ELAB = 'Guilherme Ribeiro Lopes';
const FORMS = {
  f018: { codigo: 'FORM 018', titulo: 'Lista de presença', data: '01/12/2026', nrev: '02', aprovador: 'Produtor – Fabio Massao Sakuma' },
  f024: { codigo: 'FORM 024', titulo: 'Reunião com a gerência e funcionários', data: '01/12/2026', nrev: '02', aprovador: 'Fabio Massao Sakuma' },
  f044: { codigo: 'FORM 044', titulo: 'Ata de reunião mensal – GRASP', data: '01/12/2026', nrev: '01', aprovador: 'Produtor – Fabio Massao Sakuma' },
  // 04/11/2026: fichas de papel por funcionário (uma folha para cada marcado).
  f007: { codigo: 'FORM 007', titulo: "Higienização dos EPI's", data: '01/11/2026', nrev: '02', aprovador: 'Produtor – Fabio Massao Sakuma' },
  f054: { codigo: 'FORM 054', titulo: 'Controle de banho e higiene pessoal', data: '01/11/2026', nrev: '01', aprovador: 'Produtor – Fabio Massao Sakuma' },
  f045: { codigo: 'FORM 045', titulo: 'Ata de treinamento do representante dos trabalhadores – GRASP', data: '01/12/2026', nrev: '01', aprovador: 'Produtor – Fabio Massao Sakuma' },
  f046: { codigo: 'FORM 046', titulo: 'Declaração de direitos e deveres do representante dos trabalhadores', data: '01/12/2026', nrev: '01', aprovador: 'Produtor – Fabio Massao Sakuma' },
};
const POR_FUNC = new Set(['f007', 'f054']);

/* Revisão e data (04/11/2026, pergunta dele "a data de revisão, aonde eu altero?"):
   os valores acima são só o padrão. Ao abrir a tela, vêm da Lista mestra
   (cert_documentos.revisao / data_revisao do FORM de mesmo código) — é lá que
   se altera: Certificação › Lista mestra › FORM › Editar. Cópia no aparelho
   para funcionar sem internet. A Ficha de EPI usa o "Modelo da ficha" do SST. */
const CAIXA_REV = 'cert-impressoes-revisoes';
function aplicarRevisoes(docs) {
  for (const f of Object.values(FORMS)) {
    const d = (docs || []).find(x => String(x.codigo || '').replace(/\s+/g, ' ').trim().toUpperCase() === f.codigo);
    if (!d) continue;
    if (d.revisao) f.nrev = String(d.revisao).padStart(2, '0');
    if (d.data_revisao) f.data = br(d.data_revisao);
  }
  document.querySelectorAll('#telaCeImpressoes [data-rev]').forEach(b => {
    const f = FORMS[b.dataset.rev]; if (f) b.textContent = `${f.nrev} de ${f.data}`; });
}
async function carregarRevisoes() {
  try { aplicarRevisoes(await nucleo.lerCaixa(CAIXA_REV, [])); } catch { /* sem cópia */ }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) return;
  try {
    const { data, error } = await c.from('cert_documentos').select('codigo, revisao, data_revisao').ilike('codigo', 'FORM%');
    if (error || !data) return;
    aplicarRevisoes(data); nucleo.gravarCaixa(CAIXA_REV, data);
  } catch { /* fica o padrão */ }
}
const DO_REPRESENTANTE = new Set(['f045', 'f046']);
const TEMA_024 = 'Saúde, segurança e bem-estar dos trabalhadores';
const EMPRESA_044 = 'FABIO MASSAO SAKUMA E OUTROS';
const ENDERECO_044 = 'Fazenda Faca, S/N – Zona Rural – Campos Altos/MG';

/* ---------------- o que fica lembrado neste aparelho (só conveniência) ---------------- */
const CHAVE = 'gr-cert-impressoes';
const lembrado = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; } };
const lembrar = (tipo, v) => { try { const t = lembrado(); t[tipo] = v; localStorage.setItem(CHAVE, JSON.stringify(t)); } catch { /* sem armazenamento */ } };

/* ---------------- funcionários ---------------- */
const funcionarios = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO')
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
const fazendasFunc = fs => [...new Set(fs.map(f => so(f.fazenda)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('');

/* ===================================================================
   DOCUMENTOS
   =================================================================== */
function documento(f, corpo, subtitulo = '', { classe = '', compacto = false } = {}) {
  // compacto: as fichas por funcionário (FORM 007/054) precisam caber numa folha
  // só, então os dados do documento vão numa linha fina em vez da ficha cinza.
  const dadosDoc = compacto
    ? `<p class="rel-nota" style="margin:-8px 0 6px">${f.codigo} · Revisão ${f.nrev} · Data ${f.data} · Elaboração/revisão: ${ELAB} · Aprovação: ${esc(f.aprovador)}</p>`
    : `<div class="rel-ficha"><div><span>Código</span><b>${f.codigo}</b></div><div><span>Data</span><b>${f.data}</b></div><div><span>Revisão</span><b>${f.nrev}</b></div>
      <div><span>Elaboração / revisão</span><b>${ELAB}</b></div><div><span>Aprovação</span><b>${esc(f.aprovador)}</b></div></div>`;
  // ci-pag (04/11/2026, pedido dele): numeração "Página X de Y" no pé de cada
  // folha, como no original. Só nos documentos de várias páginas (não nas
  // fichas por funcionário, que saem várias juntas de 1 página cada).
  const pag = compacto ? '' : ' ci-pag';
  return `<article class="rel${classe ? ' ' + classe : ''}${pag}">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(f.titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>código</span><strong>${f.codigo}</strong><span>rev. ${f.nrev}</span></div></header>
    ${dadosDoc}
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
const linha = (rot, val, larga) => `<div${larga ? ' style="grid-column:1/-1"' : ''}><span>${esc(rot)}</span><b>${val ? esc(val) : '&nbsp;'}</b></div>`;
const ficha = itens => `<div class="rel-ficha" style="margin-top:6px">${itens.join('')}</div>`;
/** Caixa com o texto ou, vazia, com pautas para escrever à mão. */
const caixa = (txt, alt = 3) => txt
  ? `<div style="border:1px solid #C9CCC3;border-radius:4px;padding:6px 8px;font-size:11px">${linhas(txt).map(l => `<p style="margin:0 0 3px">${esc(l)}</p>`).join('')}</div>`
  : `<div style="border:1px solid #C9CCC3;border-radius:4px;height:${alt * 22}px;background:repeating-linear-gradient(transparent 0 21px,#E2E4DE 21px 22px)"></div>`;
const secao = (t, quebra) => `<p class="rel-secao"${quebra ? ' style="page-break-before:always"' : ''}>${esc(t)}</p>`;
const assinaturas = pares => `<div class="rel-assinaturas">${pares.map(([nome, papel]) =>
  `<div class="rel-assina"><span></span><small>${nome ? esc(nome) + '<br>' : ''}${esc(papel)}</small></div>`).join('')}</div>`;
/** Lista de presença: marcados primeiro, depois linhas em branco (mínimo `min`, pelo menos 4 sobrando). */
function tabelaPresenca(pres, { funcao = true, min = 15 } = {}) {
  const total = Math.max(pres.length + 4, min);
  const todas = [...pres, ...Array.from({ length: total - pres.length }, () => ['', ''])];
  return `<table class="rel-tabela"><thead><tr><th style="width:5%">Nº</th><th style="width:${funcao ? 40 : 55}%">Nome</th>${funcao ? '<th style="width:22%">Função</th>' : ''}<th>Assinatura</th></tr></thead><tbody>
    ${todas.map(([n, f], i) => `<tr><td>${i + 1}</td><td style="height:24px">${esc(n)}</td>${funcao ? `<td>${esc(f)}</td>` : ''}<td></td></tr>`).join('')}
  </tbody></table>`;
}

/* FORM 018 — Lista de presença (treinamentos, palestras, qualquer evento) */
function doc018(v) {
  const temas = linhas(v.temas);
  return documento(FORMS.f018, `
    ${ficha([linha('Data', br(v.data) || '____/____/______'), linha('Propriedade', v.local), linha('Responsável (nome / assinatura)', v.responsavel, true)])}
    ${secao('I. Temas')}${caixa(temas.join('\n'), 3)}
    ${secao('II. Horário')}${caixa(v.horario, 1)}
    ${secao('III. Ministrante')}${assinaturas([[v.ministrante, 'Ministrante']])}
    ${secao('IV. Participantes')}${tabelaPresenca(v.pres, { min: 20 })}`, 'Treinamentos, palestras e reuniões');
}
/* FORM 024 — Reunião com a gerência e funcionários */
function doc024(v) {
  return documento(FORMS.f024, `
    ${ficha([linha('Data', br(v.data) || '____/____/______'), linha('Fazenda / sítio', v.local), linha('Responsável pela gerência', v.responsavel, true)])}
    ${secao('1) Temas')}${caixa(so(v.temas) || TEMA_024, 3)}
    ${secao('2) Horário')}${caixa(v.horario, 1)}
    ${secao('3) Ministrante')}${assinaturas([[v.ministrante, 'Ministrante'], [v.responsavel, 'Responsável pela gerência']])}
    ${secao('4) Assuntos abordados pelos funcionários (reclamações, sugestões ou relatos)')}${caixa('', 7)}
    ${secao('5) Análises e ações tomadas pela gerência sobre os assuntos abordados')}${caixa('', 7)}
    ${secao('6) Participantes', true)}${tabelaPresenca(v.pres, { min: 20 })}`, 'Reunião da gerência com os funcionários');
}
/* FORM 044 — Ata de reunião mensal GRASP (texto do modelo do OneDrive) */
const marcado = t => `<p style="margin:0 0 3px;font-size:11px">☐ ${esc(t)}</p>`;
const campoLinha = (rot, val) => `<p style="margin:0 0 6px;font-size:11px">${esc(rot)}: ${val ? `<b>${esc(val)}</b>` : '<span style="display:inline-block;width:60%;border-bottom:1px solid #9A9D93">&nbsp;</span>'}</p>`;
function doc044(v) {
  return documento(FORMS.f044, `
    <p class="rel-nota" style="margin:8px 0 4px"><b>Reunião entre trabalhadores, representante eleito e gestão</b></p>
    ${ficha([linha('Empresa', EMPRESA_044), linha('Endereço', ENDERECO_044)])}
    ${secao('1. Identificação da reunião')}
    ${ficha([linha('Data', br(v.data) || '____/____/______'), linha('Horário', v.horario), linha('Local', v.local)])}
    ${secao('2. Participantes')}
    ${ficha([linha('Representante dos trabalhadores (eleito)', v.representante), linha('Representante da gestão', v.responsavel), linha('Cargo', v.cargoGestao)])}
    ${assinaturas([[v.representante, 'Representante dos trabalhadores'], [v.responsavel, 'Representante da gestão']])}
    <p class="rel-nota" style="margin:4px 0 0">Trabalhadores presentes: lista de presença anexa (FORM 018).</p>
    ${secao('3. Pauta obrigatória – temas GRASP')}
    <p style="margin:0 0 4px;font-size:11px"><b>3.1 Informações sobre jornada, salários e condições de trabalho</b></p>
    ${campoLinha('Informações sobre horários e escalas')}${campoLinha('Informações sobre pagamentos')}
    ${campoLinha('Alterações nas condições de trabalho (se houver)')}${campoLinha('Outros temas de interesse levantados')}
    <p style="margin:8px 0 4px;font-size:11px"><b>3.2 Política de Direitos Humanos</b> — foi reforçado aos trabalhadores:</p>
    ${['respeito às condições dignas de trabalho;', 'proibição de discriminação;', 'proibição de trabalho infantil e forçado;', 'garantia de não retaliação.'].map(marcado).join('')}
    ${campoLinha('Observações')}
    <p style="margin:8px 0 4px;font-size:11px"><b>3.3 Processo de reclamação</b> — foram esclarecidos:</p>
    ${['formas de registro de reclamação;', 'possibilidade de confidencialidade;', 'garantia de ausência de retaliação;', 'papel do representante dos trabalhadores no processo.'].map(marcado).join('')}
    ${campoLinha('Dúvidas ou manifestações')}
    <p style="margin:8px 0 4px;font-size:11px"><b>3.4 Contatos importantes</b> — foram reforçados os contatos disponíveis aos trabalhadores:</p>
    ${campoLinha('Autoridade trabalhista local')}${campoLinha('Outros canais relevantes')}
    ${secao('4. Manifestação dos trabalhadores')}${caixa('', 5)}
    ${secao('5. Encaminhamentos definidos')}
    <table class="rel-tabela"><thead><tr><th style="width:5%">Nº</th><th>Ação acordada</th><th style="width:24%">Responsável</th><th style="width:14%">Prazo</th></tr></thead><tbody>
      ${[1, 2, 3].map(n => `<tr><td>${n}</td><td style="height:24px"></td><td></td><td></td></tr>`).join('')}</tbody></table>
    ${campoLinha('Responsável pelo acompanhamento')}${campoLinha('Prazo para retorno')}`, 'Reunião mensal com o representante dos trabalhadores · GLOBALG.A.P. GRASP');
}
/* ---------------- fichas por funcionário (papel) ----------------
   Textos da planilha do OneDrive (2 - FORMULÁRIOS › FORM 007 e FORM 054).
   `p` = { nome, cargo, fazenda } (vazio = folha em branco); `folha` = índice,
   a partir da segunda começa em página nova. */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ORIENT_007 = 'Informar o nº do EPI usado no dia e mês em que aconteceu a lavagem, e assim sucessivamente. Realizar sempre a lavagem após o dia de pulverização.';
const RECOM_007 = 'Seguir as orientações do fabricante; caso não possua, recomenda-se: usar luvas à base de nitrila; a lavagem deve ser feita preferencialmente com sabão neutro e as vestimentas não devem ficar de molho; os EPIs devem ser enxaguados com água corrente para diluir e remover os resíduos da pulverização e o sabão utilizado; devem ser secados à sombra; após a aplicação e a lavagem dos EPIs, o colaborador deverá tomar banho em água fria e em seguida vestir roupas limpas.';
const ORIENT_054 = 'Após a aplicação e a lavagem dos EPIs, o trabalhador deve tomar banho em água fria e em seguida vestir roupas limpas. Registrar cada aplicação com o horário de início e de fim e informar se o banho foi tomado; anotar em Observações qualquer EPI danificado.';
const EMPREGADOR = 'FABIO MASSAO SAKUMA E OUTROS';
const texto = (rot, t) => `<p style="margin:4px 0 0;font-size:9.5px;line-height:1.35"><b style="color:#744F28">${esc(rot)}</b> ${esc(t)}</p>`;
const mesAno = ym => { const [a, m] = so(ym).split('-'); return a && m ? `${doisD(m)}/${a}` : ''; };

function doc007(p, v, folha) {
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const td = 'style="padding:0;height:25px"';
  return documento(FORMS.f007, `
    ${ficha([linha('Colaborador', p.nome), linha('Função', p.cargo), linha('Fazenda', p.fazenda),
      linha('Ano', v.ano), linha('CA conjunto APL 01', v.ca1), linha('CA conjunto APL 02', v.ca2)])}
    <p style="margin:0 0 4px;font-size:10px;color:#744F28"><b>Registro de lavagem:</b> marcar a cada lavagem o número do EPI (1 ou 2) no dia do mês.</p>
    <table class="rel-tabela f007" style="table-layout:fixed;font-size:8.5px;margin-bottom:4px"><thead><tr>
      <th style="width:58px;padding:3px 4px">Mês / dia</th>${dias.map(d => `<th style="padding:3px 0;text-align:center">${d}</th>`).join('')}
      <th style="width:96px;padding:3px 4px">Assinatura</th><th style="width:74px;padding:3px 4px">Data do fornecimento</th><th style="width:74px;padding:3px 4px">Data da troca do EPI</th></tr></thead>
      <tbody>${MESES.map(m => `<tr><td style="padding:0 4px;height:29px;vertical-align:middle">${m}</td>${dias.map(() => `<td ${td}></td>`).join('')}<td ${td}></td><td ${td}></td><td ${td}></td></tr>`).join('')}</tbody></table>
    ${texto('Orientação:', ORIENT_007)}
    ${texto('Recomendação de lavagem do EPI:', RECOM_007)}
    <div style="display:flex;gap:18px;align-items:flex-end;margin-top:6px">
      <div style="flex:1"><span style="font-size:9px;color:#8A8D86;text-transform:uppercase;letter-spacing:.4px">Observação</span>${caixa('', 2)}</div>
      <div class="rel-assina" style="flex:0 0 36%"><span></span><small>${p.nome ? esc(p.nome) + '<br>' : ''}Assinatura do funcionário</small></div>
    </div>`, 'Registro anual de lavagem dos EPIs por colaborador',
  { classe: 'rel-paisagem f007-folha' + (folha ? ' folha2' : ''), compacto: true });
}

function doc054(p, v, folha) {
  const td = 'style="height:29px;vertical-align:middle"';
  return documento(FORMS.f054, `
    ${ficha([linha('Empregador', v.empregador), linha('Identificação da propriedade', v.propriedade || p.fazenda), linha('Mês / ano', mesAno(v.mes)),
      linha('Nome do trabalhador', p.nome), linha('Função / cargo', p.cargo)])}
    <table class="rel-tabela" style="table-layout:fixed;font-size:9.5px;margin-bottom:4px"><thead><tr>
      <th style="width:12%">Data</th><th style="width:11%">Início da aplicação</th><th style="width:11%">Fim da aplicação</th>
      <th style="width:18%">Banho tomado</th><th>Observações (EPI danificado etc.)</th><th style="width:21%">Assinatura do trabalhador</th></tr></thead>
      <tbody>${Array.from({ length: 24 }, () => `<tr><td ${td}>&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/</td><td style="height:29px;vertical-align:middle;text-align:center">:</td><td style="height:29px;vertical-align:middle;text-align:center">:</td>
        <td ${td}>(&nbsp;&nbsp;&nbsp;) SIM&nbsp;&nbsp;(&nbsp;&nbsp;&nbsp;) NÃO</td><td ${td}></td><td ${td}></td></tr>`).join('')}</tbody></table>
    ${texto('Orientação:', ORIENT_054)}`, 'Ficha mensal do trabalhador da aplicação',
  { classe: folha ? 'folha2' : '', compacto: true });
}

/* ---------------- representante dos trabalhadores (GRASP) ----------------
   Textos do Word do OneDrive (FORM 045 e FORM 046). `v` = { data, horario, local,
   representante, cargoRep, responsavel, cargoResp }. */
const topicos = itens => `<ul style="margin:2px 0 6px 18px;padding:0;font-size:10.5px">${itens.map(i => `<li style="margin:0 0 1px">${esc(i)}</li>`).join('')}</ul>`;
const par = t => `<p style="margin:3px 0;font-size:10.5px">${esc(t)}</p>`;
const sub = t => `<p style="margin:6px 0 2px;font-size:10.5px;color:#744F28"><b>${esc(t)}</b></p>`;
const cabEmpresa = () => ficha([linha('Empresa', EMPRESA_044), linha('Endereço', ENDERECO_044)]);

function doc045(v) {
  return documento(FORMS.f045, `
    ${cabEmpresa()}
    ${secao('1. Identificação')}
    ${ficha([linha('Data do treinamento', br(v.data) || '____/____/______'), linha('Horário', v.horario), linha('Local', v.local),
      linha('Representante dos trabalhadores', v.representante), linha('Função', v.cargoRep),
      linha('Responsável pelo treinamento', v.responsavel), linha('Cargo do responsável', v.cargoResp)])}
    ${secao('2. Objetivo do treinamento')}
    ${par('Capacitar formalmente o representante dos trabalhadores quanto:')}
    ${topicos(['Aos seus direitos e deveres no âmbito do GRASP;', 'Ao uso correto do processo de reclamação previsto na propriedade;',
      'À atuação em nome de outros trabalhadores, conforme requisito GRASP 03.03;', 'À obrigação de confidencialidade;',
      'À necessidade de autorização expressa do trabalhador quando a reclamação for apresentada em seu nome;',
      'Ao procedimento específico para casos de solicitação de anonimato;', 'À garantia de não retaliação no exercício da função representativa.'])}
    ${secao('3. Conteúdo abordado')}
    ${par('Durante o treinamento foram apresentados e discutidos os seguintes temas:')}
    ${sub('3.1 Papel e atribuições do representante dos trabalhadores')}
    ${topicos(['Representação dos interesses dos trabalhadores perante a gestão;', 'Participação em reuniões mensais relacionadas ao GRASP;', 'Comunicação organizada de demandas coletivas.'])}
    ${sub('3.2 Processo de reclamação')}
    ${par('Foi explicado detalhadamente que o processo permite reclamações:')}
    ${topicos(['Presencialmente (diretamente à gestão);', 'De forma anônima;', 'Por meio do representante dos trabalhadores.'])}
    ${par('Foi instruído que:')}
    ${topicos(['O trabalhador deve autorizar formalmente o representante antes da apresentação de reclamação em seu nome;',
      'O documento de autorização deve ser arquivado, quando aplicável;', 'A confidencialidade deve ser mantida em todos os casos;',
      'Quando solicitado anonimato, a identidade do reclamante não será divulgada e o processo seguirá normalmente, sem prejuízo da análise.'])}
    ${sub('3.3 Alternativas à representação')}
    ${par('Foi esclarecido que trabalhadores podem optar por:')}
    ${topicos(['Registrar reclamação diretamente à gestão;', 'Solicitar apoio de outro trabalhador;', 'Utilizar canal independente previsto no procedimento interno.'])}
    ${sub('3.4 Garantia de não retaliação')}
    ${par('Foi reforçado que o representante não poderá sofrer qualquer forma de retaliação, penalidade ou prejuízo em razão do exercício de sua função.')}
    ${secao('4. Declaração do representante')}
    ${par('Declaro que:')}
    ${topicos(['Recebi instrução formal e suficiente sobre o uso do processo de reclamação em nome de trabalhadores;',
      'Fui orientado quanto à necessidade de autorização expressa;', 'Estou ciente da obrigação de confidencialidade;',
      'Compreendo o procedimento aplicável quando houver solicitação de anonimato;', 'Comprometo-me a atuar de forma ética, imparcial e independente.'])}
    ${assinaturas([[v.representante, 'Representante dos trabalhadores'], [v.responsavel, 'Responsável pelo treinamento']])}`,
  'Capacitação formal do representante eleito · GLOBALG.A.P. GRASP');
}

function doc046(v) {
  return documento(FORMS.f046, `
    ${cabEmpresa()}
    ${ficha([linha('Representante dos trabalhadores', v.representante), linha('Função', v.cargoRep), linha('Data', br(v.data) || '____/____/______')])}
    ${secao('1. Finalidade')}
    ${par('Esta declaração estabelece os direitos, responsabilidades e deveres do representante dos trabalhadores eleito pelos colaboradores da propriedade, bem como registra que o representante foi formalmente instruído quanto ao uso do processo de reclamação previsto no GRASP.')}
    ${secao('2. Instrução formal sobre o processo de reclamação')}
    ${par('Fica formalmente registrado que o representante dos trabalhadores recebeu orientação da gestão sobre:')}
    ${sub('2.1 Utilização do processo de reclamação em nome de outro trabalhador, incluindo:')}
    ${topicos(['Recebimento da demanda;', 'Registro da reclamação no canal adequado;', 'Acompanhamento dos prazos de resposta;', 'Comunicação do resultado ao trabalhador interessado.'])}
    ${sub('2.2 Autorização expressa')}
    ${par('Foi esclarecido que o trabalhador deve autorizar formalmente o representante antes que este apresente reclamação em seu nome.')}
    ${sub('2.3 Arquivamento da autorização')}
    ${par('Quando aplicável, o documento de autorização do trabalhador deverá ser formalizado e arquivado como evidência do consentimento.')}
    ${sub('2.4 Confidencialidade')}
    ${par('O representante foi instruído quanto à obrigação de manter absoluta confidencialidade sobre todas as informações recebidas no âmbito das reclamações.')}
    ${sub('2.5 Procedimento em caso de solicitação de anonimato')}
    ${par('Quando o trabalhador solicitar anonimato:')}
    ${topicos(['A identidade do reclamante não será divulgada;', 'O processo seguirá regularmente;', 'A solicitação de anonimato não influenciará a análise ou o resultado da reclamação.'])}
    ${sub('2.6 Alternativas à representação')}
    ${par('Foi esclarecido que trabalhadores que optarem por não utilizar a representação poderão:')}
    ${topicos(['Registrar reclamação diretamente junto à gestão;', 'Solicitar apoio de outro trabalhador;', 'Utilizar canal independente previsto no procedimento interno.'])}
    ${secao('3. Direitos do representante dos trabalhadores')}
    ${par('O representante eleito possui o direito de:')}
    ${topicos(['Representar os interesses dos trabalhadores perante a gestão;', 'Ter acesso às áreas necessárias ao desempenho de suas funções, inclusive áreas de campo;',
      'Reunir-se com trabalhadores em horário apropriado, sem prejuízo das atividades produtivas;', 'Participar das reuniões periódicas relacionadas ao GRASP;',
      'Ser informado sobre o andamento e o desfecho das reclamações, respeitados os critérios de confidencialidade;',
      'Exercer suas funções sem sofrer qualquer forma de retaliação, discriminação ou prejuízo.'])}
    ${secao('4. Deveres do representante dos trabalhadores')}
    ${par('O representante compromete-se a:')}
    ${par('4.1 Atuar de forma imparcial, ética e independente.')}
    ${par('4.2 Manter confidencialidade absoluta sobre informações recebidas.')}
    ${par('4.3 Solicitar autorização formal do trabalhador antes de apresentar reclamação em seu nome.')}
    ${par('4.4 Informar aos trabalhadores que o processo de reclamação pode ser utilizado:')}
    ${topicos(['Presencialmente;', 'De forma anônima;', 'Por meio do representante.'])}
    ${par('4.5 Esclarecer aos trabalhadores:')}
    ${topicos(['Onde registrar reclamações;', 'Qual o prazo estimado de resposta;', 'A garantia de não retaliação.'])}
    ${par('4.6 Assegurar que trabalhadores próprios e subcontratados compreendam os canais disponíveis.')}
    ${par('4.7 Participar das reuniões mensais relacionadas ao GRASP.')}
    ${par('4.8 Comunicar à gestão demandas coletivas de forma organizada e fundamentada.')}
    ${secao('5. Garantia de não retaliação')}
    ${par('A empresa assegura que o representante não sofrerá qualquer penalidade, prejuízo ou discriminação em razão do exercício de sua função representativa, conforme os princípios da Política de Direitos Humanos da propriedade e da norma GRASP.')}
    ${secao('6. Abrangência')}
    ${par('Esta declaração aplica-se a:')}
    ${topicos(['Trabalhadores próprios;', 'Trabalhadores subcontratados enquanto atuarem na propriedade.'])}
    ${assinaturas([[v.representante, 'Representante dos trabalhadores'], [v.responsavel, 'Representante da gestão']])}`,
  'Representante eleito pelos trabalhadores · GLOBALG.A.P. GRASP');
}

/* ===================================================================
   TELA
   =================================================================== */
/* 04/11/2026: a GRASP imprime só a ata (mensal); a presença sai na Lista de presença (FORM 018). */
const IMPRESSOS = [
  { tipo: 'fichaEpi', codigo: 'Ficha de EPI', freq: 'Mensal · por funcionário', nome: 'Ficha de EPI', desc: 'A ficha de entrega de EPI de SST › EPI\'s › Fichas, com o modelo do app. Uma ficha para cada funcionário marcado; o que já foi preenchido no mês vem junto.' },
  { tipo: 'f018', codigo: 'FORM 018', freq: 'Por evento', nome: 'Lista de presença', desc: 'Treinamentos, palestras e reuniões (também a reunião GRASP): temas, horário, ministrante e quem assina.' },
  { tipo: 'f024', codigo: 'FORM 024', freq: 'Anual', nome: 'Reunião com a gerência', desc: 'Reunião da gerência com os funcionários, com a lista de participantes.' },
  { tipo: 'f044', codigo: 'FORM 044', freq: 'Mensal', nome: 'Ata da reunião GRASP', desc: 'Ata da reunião mensal com o representante dos trabalhadores. A presença vai na Lista de presença (FORM 018).' },
  // 04/11/2026: fichas de papel por funcionário — uma folha para cada marcado.
  { tipo: 'f007', codigo: 'FORM 007', freq: 'Anual · por funcionário', nome: "Higienização dos EPI's", desc: 'Ficha do ano de cada aplicador: marca 1 ou 2 no dia de cada lavagem. Sai uma folha (A4 deitada) por funcionário marcado.' },
  { tipo: 'f054', codigo: 'FORM 054', freq: 'Mensal · por funcionário', nome: 'Banho e higiene pessoal', desc: 'Ficha do mês de cada trabalhador da aplicação: início/fim, banho tomado e assinatura. Uma folha por funcionário marcado.' },
  { tipo: 'f045', codigo: 'FORM 045', freq: 'Anual · representante', nome: 'Treinamento do representante', desc: 'Ata do treinamento do representante dos trabalhadores (GRASP), com a declaração e as duas assinaturas.' },
  { tipo: 'f046', codigo: 'FORM 046', freq: 'Anual · representante', nome: 'Direitos e deveres do representante', desc: 'Declaração dos direitos e deveres do representante eleito, para ele e a gestão assinarem.' },
];
function desenhar() {
  const tela = $('telaCeImpressoes'); if (!tela) return;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <h2 style="margin:0">Impressões</h2>
    <p class="dica" style="margin:2px 0 12px">A revisão e a data de cada FORM vêm da Lista mestra (Editar no documento). Escolha o impresso, preencha o que quiser do cabeçalho (o que ficar vazio sai em branco para escrever à mão) e marque os funcionários: cada um sai na lista com a função do cadastro. Nada fica gravado — é só para imprimir.</p>
    <div class="ce-ent-lista">${IMPRESSOS.map(i => `<button type="button" class="pv-card pv-calma" data-imp="${i.tipo}" style="text-align:left">
      <span>${esc(i.codigo)} · ${esc(i.freq)}${FORMS[i.tipo] ? ` · rev. <b data-rev="${i.tipo}">${FORMS[i.tipo].nrev} de ${FORMS[i.tipo].data}</b>` : ''}</span><strong style="font-size:17px">${esc(i.nome)}</strong><small>${esc(i.desc)}</small></button>`).join('')}</div>
  </div>`;
  tela.querySelectorAll('[data-imp]').forEach(b => b.addEventListener('click', () => formImpresso(b.dataset.imp)));
}

function dialogo(html, ligar) {
  let d = $('dlgCi');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCi'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgCi')?.open && $('dlgCi').close();

function formImpresso(tipo) {
  if (tipo === 'fichaEpi') return formFichaEpi();
  const f = FORMS[tipo], ant = lembrado()[tipo] || {};
  const fs = funcionarios();
  const ehGrasp = tipo === 'f044';
  if (ehGrasp) return formAta(f, ant);
  if (POR_FUNC.has(tipo)) return formPorFunc(tipo, f, ant);
  if (DO_REPRESENTANTE.has(tipo)) return formRepresentante(tipo, f, ant);
  const rotLocal = tipo === 'f018' ? 'Propriedade' : tipo === 'f024' ? 'Fazenda / sítio' : 'Local';
  const rotResp = tipo === 'f018' ? 'Responsável' : tipo === 'f024' ? 'Responsável pela gerência' : 'Representante da gestão';
  dialogo(`<h3>${esc(f.titulo)} <small class="dica">${f.codigo}</small></h3>
    <div class="grade">
      <label class="campo">Data <span class="dc-sem">(opcional)</span><input type="date" id="ciData"></label>
      <label class="campo">Horário <input type="text" id="ciHora" value="${esc(ant.horario || '')}" placeholder="${ehGrasp ? '07:00' : '08:00 às 10:00'}"></label>
      <label class="campo">${rotLocal} <input type="text" id="ciLocal" value="${esc(ant.local || '')}" list="ciFazs"></label>
      <label class="campo">${rotResp} <span class="dc-sem">(opcional)</span><input type="text" id="ciResp" value="${esc(ant.responsavel || '')}" list="ciFuncs"></label>
      ${ehGrasp ? `<label class="campo">Cargo do representante da gestão <input type="text" id="ciCargo" value="${esc(ant.cargoGestao || '')}"></label>
        <label class="campo">Representante dos trabalhadores <input type="text" id="ciRep" value="${esc(ant.representante || '')}" list="ciFuncs" placeholder="Nome do representante eleito"></label>`
      : `<label class="campo">Ministrante <input type="text" id="ciMin" value="${esc(ant.ministrante || '')}" list="ciFuncs"></label>`}
    </div>
    ${ehGrasp ? '' : `<label class="campo">Temas <span class="dc-sem">(opcional, um por linha)</span><textarea id="ciTemas" rows="3">${esc(tipo === 'f024' ? TEMA_024 : '')}</textarea></label>`}
    <datalist id="ciFuncs">${fs.map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
    <datalist id="ciFazs">${fazendasFunc(fs).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${htmlSeletor(fs, 'Quem vai assinar')}
    <label class="campo">Outros participantes <span class="dc-sem">(um por linha; para pôr a função, use "Nome - Função")</span><textarea id="ciOutros" rows="2"></textarea></label>
    <div class="barra entre">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <div class="barra fim" style="margin:0"><button class="btn principal" type="button" data-sai="doc">Imprimir</button></div>
    </div>`, d => {
    const marcados = ligarSeletor(d, fs);
    const ler = () => {
      const pres = [...marcados().map(x => [x.nome, x.cargo || '']),
        ...linhas($('ciOutros').value).map(l => { const [n, ...r] = l.split(/\s+-\s+/); return [n, r.join(' - ')]; })];
      return { data: $('ciData').value, horario: so($('ciHora').value), local: so($('ciLocal').value), responsavel: so($('ciResp').value),
        ministrante: so($('ciMin')?.value), temas: $('ciTemas')?.value || '', representante: so($('ciRep')?.value), cargoGestao: so($('ciCargo')?.value), pres };
    };
    d.querySelectorAll('[data-sai]').forEach(b => b.addEventListener('click', () => {
      const v = ler();
      lembrar(tipo, { horario: v.horario, local: v.local, responsavel: v.responsavel, ministrante: v.ministrante, representante: v.representante, cargoGestao: v.cargoGestao });
      fechar(); mostrar(tipo === 'f018' ? doc018(v) : doc024(v), { barra: true });
    }));
  });
}
/* Lista de funcionários com busca, filtro por fazenda e "Marcar os visíveis". */
function htmlSeletor(fs, titulo) {
  return `<div class="np-passo" style="margin-top:10px">${esc(titulo)} <span class="dica" id="ciConta"></span></div>
    <div class="barra" style="margin:6px 0"><input type="search" id="ciBusca" placeholder="Buscar funcionário" style="flex:1">
      <select id="ciFaz">${opcoes(fazendasFunc(fs), '', 'Todas as fazendas')}</select>
      <button class="btn mini" type="button" id="ciTodos">Marcar os visíveis</button><button class="btn mini" type="button" id="ciNenhum">Limpar</button></div>
    <div id="ciLista" style="max-height:260px;overflow:auto;border:1px solid var(--linha);border-radius:8px;padding:6px 8px">
      ${fs.length ? fs.map(x => `<label data-nome="${esc(String(x.nome).toLowerCase())}" data-faz="${esc(so(x.fazenda))}" style="display:flex;gap:8px;align-items:center;padding:2px 0">
        <input type="checkbox" data-pid="${esc(x.id)}"> <span>${esc(x.nome)} <small class="dica">${esc(x.cargo || '')}${x.fazenda ? ' · ' + esc(x.fazenda) : ''}</small></span></label>`).join('')
        : '<p class="dica">O cadastro de funcionários não está neste aparelho. Use "Outros" ou imprima a folha em branco.</p>'}
    </div>`;
}
/** Liga busca/filtro/marcar e devolve a função que lê os funcionários marcados (na ordem do nome). */
function ligarSeletor(d, fs) {
  const caixas = () => [...d.querySelectorAll('#ciLista [data-nome]')];
  const conta = () => { $('ciConta').textContent = `· ${d.querySelectorAll('#ciLista input:checked').length} marcado(s)`; };
  const filtrar = () => { const q = $('ciBusca').value.trim().toLowerCase(), fz = $('ciFaz').value;
    caixas().forEach(x => { x.style.display = (!q || x.dataset.nome.includes(q)) && (!fz || x.dataset.faz === fz) ? '' : 'none'; }); };
  d.querySelectorAll('#ciLista input').forEach(x => x.addEventListener('change', conta)); conta();
  $('ciBusca').addEventListener('input', filtrar); $('ciFaz').addEventListener('change', filtrar);
  $('ciTodos').addEventListener('click', () => { caixas().forEach(x => { if (x.style.display !== 'none') x.querySelector('input').checked = true; }); conta(); });
  $('ciNenhum').addEventListener('click', () => { d.querySelectorAll('#ciLista input').forEach(x => { x.checked = false; }); conta(); });
  return () => { const marc = new Set([...d.querySelectorAll('#ciLista input:checked')].map(x => x.dataset.pid));
    return fs.filter(x => marc.has(String(x.id))); };
}

/** FORM 007 / FORM 054: uma folha por funcionário marcado (nome, função e fazenda do cadastro). */
function formPorFunc(tipo, f, ant) {
  const fs = funcionarios();
  const e007 = tipo === 'f007';
  dialogo(`<h3>${esc(f.titulo)} <small class="dica">${f.codigo} · ${e007 ? 'anual' : 'mensal'} · por funcionário</small></h3>
    <p class="dica" style="margin:0 0 8px">Marque os funcionários: sai <b>uma folha para cada um</b>, já com nome, função e fazenda do cadastro. O que ficar vazio sai em branco para escrever à mão.</p>
    <div class="grade">${e007
      ? `<label class="campo">Ano <span class="dc-sem">(opcional)</span><input type="number" id="ciAno" min="2020" max="2100" value="${esc(ant.ano || new Date().getFullYear())}"></label>
        <label class="campo">CA conjunto APL 01 <span class="dc-sem">(opcional)</span><input type="text" id="ciCa1" value="${esc(ant.ca1 || '')}"></label>
        <label class="campo">CA conjunto APL 02 <span class="dc-sem">(opcional)</span><input type="text" id="ciCa2" value="${esc(ant.ca2 || '')}"></label>`
      : `<label class="campo">Mês / ano <span class="dc-sem">(opcional)</span><input type="month" id="ciMes"></label>
        <label class="campo">Empregador <input type="text" id="ciEmp" value="${esc(ant.empregador ?? EMPREGADOR)}"></label>
        <label class="campo">Identificação da propriedade <span class="dc-sem">(vazio = fazenda do cadastro)</span><input type="text" id="ciProp" value="${esc(ant.propriedade || '')}" list="ciFazs"></label>`}
    </div>
    <datalist id="ciFazs">${fazendasFunc(fs).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${htmlSeletor(fs, 'Funcionários')}
    <label class="campo">Outros <span class="dc-sem">(um por linha, quem não está no cadastro; "Nome - Função")</span><textarea id="ciOutros" rows="2"></textarea></label>
    <label style="display:flex;gap:8px;align-items:center;margin:4px 0 8px"><input type="checkbox" id="ciBranco"> Incluir também uma folha em branco</label>
    <div class="barra entre">
      <button class="btn" type="button" data-fechar>Cancelar</button>
      <div class="barra fim" style="margin:0"><button class="btn principal" type="button" id="ciImpFunc">Imprimir</button></div>
    </div>`, d => {
    const marcados = ligarSeletor(d, fs);
    $('ciImpFunc').addEventListener('click', () => {
      const pessoas = [...marcados().map(x => ({ nome: x.nome, cargo: x.cargo || '', fazenda: so(x.fazenda) })),
        ...linhas($('ciOutros').value).map(l => { const [n, ...r] = l.split(/\s+-\s+/); return { nome: n, cargo: r.join(' - '), fazenda: '' }; })];
      if ($('ciBranco').checked || !pessoas.length) pessoas.push({ nome: '', cargo: '', fazenda: '' });
      const v = e007
        ? { ano: so($('ciAno').value), ca1: so($('ciCa1').value), ca2: so($('ciCa2').value) }
        : { mes: $('ciMes').value, empregador: so($('ciEmp').value), propriedade: so($('ciProp').value) };
      lembrar(tipo, e007 ? v : { empregador: v.empregador, propriedade: v.propriedade });
      const gera = e007 ? doc007 : doc054;
      fechar(); mostrar(pessoas.map((p, i) => gera(p, v, i)).join(''), { barra: true });
    });
  });
}

/** FORM 045 / FORM 046: escolhe o representante (função vem do cadastro) e quem assina pela gestão. */
function formRepresentante(tipo, f, ant) {
  const fs = funcionarios();
  const e045 = tipo === 'f045';
  // o representante e o responsável valem para os dois documentos (e para a ata GRASP)
  const comum = { ...(lembrado().f044 || {}), ...(lembrado().representante || {}) };
  const cargoDe = nome => so(fs.find(x => so(x.nome).toLowerCase() === so(nome).toLowerCase())?.cargo);
  dialogo(`<h3>${esc(f.titulo)} <small class="dica">${f.codigo}</small></h3>
    <p class="dica" style="margin:0 0 8px">Escolha o representante dos trabalhadores no cadastro (a função vem junto). O que ficar vazio sai em branco para escrever à mão.</p>
    <div class="grade">
      <label class="campo">Representante dos trabalhadores <input type="text" id="ciRep" value="${esc(comum.representante || '')}" list="ciFuncs" placeholder="Nome do representante eleito"></label>
      <label class="campo">Função do representante <span class="dc-sem">(vem do cadastro)</span><input type="text" id="ciCargoRep" value="${esc(cargoDe(comum.representante))}"></label>
      <label class="campo">Data <span class="dc-sem">(opcional)</span><input type="date" id="ciData"></label>
      ${e045 ? `<label class="campo">Horário <input type="text" id="ciHora" value="${esc(ant.horario || '')}" placeholder="08:00 às 09:00"></label>
        <label class="campo">Local <input type="text" id="ciLocal" value="${esc(ant.local || '')}" placeholder="Escritório, refeitório…"></label>` : ''}
      <label class="campo">${e045 ? 'Responsável pelo treinamento' : 'Representante da gestão'} <span class="dc-sem">(opcional)</span><input type="text" id="ciResp" value="${esc(comum.responsavel || '')}" list="ciFuncs"></label>
      ${e045 ? `<label class="campo">Cargo do responsável <input type="text" id="ciCargoResp" value="${esc(comum.cargoGestao || '')}"></label>` : ''}
    </div>
    <datalist id="ciFuncs">${fs.map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
    <div class="barra entre"><button class="btn" type="button" data-fechar>Cancelar</button>
      <div class="barra fim" style="margin:0"><button class="btn principal" type="button" id="ciImpRep">Imprimir</button></div></div>`, () => {
    $('ciRep').addEventListener('change', () => { const c = cargoDe($('ciRep').value); if (c) $('ciCargoRep').value = c; });
    $('ciImpRep').addEventListener('click', () => {
      const v = { data: $('ciData').value, horario: so($('ciHora')?.value), local: so($('ciLocal')?.value),
        representante: so($('ciRep').value), cargoRep: so($('ciCargoRep').value),
        responsavel: so($('ciResp').value), cargoResp: so($('ciCargoResp')?.value) };
      lembrar('representante', { representante: v.representante, responsavel: v.responsavel, ...(e045 ? { cargoGestao: v.cargoResp } : {}) });
      if (e045) lembrar('f045', { horario: v.horario, local: v.local });
      fechar(); mostrar(e045 ? doc045(v) : doc046(v), { barra: true });
    });
  });
}

/** Ficha de EPI: mês/ano e linhas como em SST › Fichas; cada marcado sai na ficha do app. */
function formFichaEpi() {
  const fs = funcionarios(), m = modeloAtual(), d0 = new Date();
  const ant = lembrado().fichaEpi || {};
  const linhasPadrao = Math.max(1, Math.min(40, parseInt(ant.linhas) || m.linhas_padrao || 20));
  dialogo(`<h3>Ficha de EPI <small class="dica">mensal · por funcionário</small></h3>
    <p class="dica" style="margin:0 0 8px">Sai a mesma ficha de SST › EPI's › Fichas, uma para cada funcionário marcado. O que já foi preenchido e salvo naquele mês vem junto; o resto sai em branco. Para lançar e salvar as entregas, use SST › EPI's › Fichas.</p>
    <div class="grade">
      <label class="campo">Mês <select id="ciFeMes">${MESES_FICHA.map((n, i) => `<option value="${i}" ${i === d0.getMonth() ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="campo">Ano <input type="number" id="ciFeAno" min="2020" max="2100" value="${d0.getFullYear()}"></label>
      <label class="campo">Linhas da tabela <input type="number" id="ciFeLinhas" min="1" max="40" value="${linhasPadrao}"></label>
    </div>
    ${htmlSeletor(fs, 'Funcionários')}
    <label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="ciBranco"> Incluir também uma ficha em branco</label>
    <div class="barra entre"><button class="btn" type="button" data-fechar>Cancelar</button>
      <div class="barra fim" style="margin:0"><button class="btn principal" type="button" id="ciImpFe">Imprimir</button></div></div>`, d => {
    const marcados = ligarSeletor(d, fs);
    $('ciImpFe').addEventListener('click', () => {
      const mes = +$('ciFeMes').value, ano = +$('ciFeAno').value || d0.getFullYear();
      const n = Math.max(1, Math.min(40, parseInt($('ciFeLinhas').value) || 20));
      lembrar('fichaEpi', { linhas: n });
      const linhasDe = func => {
        const salva = func.id && (estado.fichas || []).find(x => x.funcionario_id === func.id && x.mes === mes && x.ano === ano);
        const ls = Array.isArray(salva?.linhas) ? salva.linhas.map(l => ({ ...linhaVazia(), ...l })) : [];
        while (ls.length < n) ls.push(linhaVazia());
        return ls.slice(0, n);
      };
      const pessoas = [...marcados()];
      if ($('ciBranco').checked || !pessoas.length) pessoas.push({ id: '', nome: '', cargo: '', setor: '' });
      const html = pessoas.map(func => montarFicha(func, m, { mes, ano, linhas: linhasDe(func), chave: `ci|${func.id}|${mes}|${ano}` })).join('');
      fechar(); mostrar(`<div class="previa" style="margin-top:0">${html}</div>`, { barra: true });
    });
  });
}

/** Ata GRASP (mensal): só o cabeçalho da reunião; os presentes assinam a Lista de presença (FORM 018). */
function formAta(f, ant) {
  dialogo(`<h3>${esc(f.titulo)} <small class="dica">${f.codigo} · mensal</small></h3>
    <p class="dica" style="margin:0 0 8px">Reunião mensal com o representante dos trabalhadores. Os presentes assinam a <b>Lista de presença (FORM 018)</b>, que fica anexa à ata.</p>
    <div class="grade">
      <label class="campo">Data <span class="dc-sem">(opcional)</span><input type="date" id="ciData"></label>
      <label class="campo">Horário <input type="text" id="ciHora" value="${esc(ant.horario || '')}" placeholder="07:00"></label>
      <label class="campo">Local <input type="text" id="ciLocal" value="${esc(ant.local || '')}" placeholder="Refeitório, escritório…"></label>
      <label class="campo">Representante dos trabalhadores <input type="text" id="ciRep" value="${esc(ant.representante || '')}" list="ciFuncs" placeholder="Nome do representante eleito"></label>
      <label class="campo">Representante da gestão <span class="dc-sem">(opcional)</span><input type="text" id="ciResp" value="${esc(ant.responsavel || '')}" list="ciFuncs"></label>
      <label class="campo">Cargo do representante da gestão <input type="text" id="ciCargo" value="${esc(ant.cargoGestao || '')}"></label>
    </div>
    <datalist id="ciFuncs">${funcionarios().map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
    <div class="barra entre"><button class="btn" type="button" id="ciIrLista">Abrir a Lista de presença</button>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="ciImpAta">Imprimir ata</button></div></div>`, () => {
    $('ciIrLista').addEventListener('click', () => formImpresso('f018'));
    $('ciImpAta').addEventListener('click', () => {
      const v = { data: $('ciData').value, horario: so($('ciHora').value), local: so($('ciLocal').value), representante: so($('ciRep').value),
        responsavel: so($('ciResp').value), cargoGestao: so($('ciCargo').value) };
      lembrar('f044', v.data ? { ...v, data: undefined } : v);
      fechar(); mostrar(doc044(v), { barra: true });
    });
  });
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_IMPRESSOES = ['ceImpressoes'];
export function abrirImpressoes(tela) { if (tela === 'ceImpressoes') { desenhar(); carregarRevisoes(); } }
export function limparImpressoes() { fechar(); const t = $('telaCeImpressoes'); if (t) t.innerHTML = ''; }
export const _ci = { doc018, doc024, doc044, doc007, doc054, doc045, doc046 };
