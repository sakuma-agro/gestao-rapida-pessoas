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

import { estado } from './store.js';
import { mostrar } from './jornada-relatorios.js';

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
};
const POR_FUNC = new Set(['f007', 'f054']);
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
  return `<article class="rel${classe ? ' ' + classe : ''}">
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

/* ===================================================================
   TELA
   =================================================================== */
/* 04/11/2026: a GRASP imprime só a ata (mensal); a presença sai na Lista de presença (FORM 018). */
const IMPRESSOS = [
  { tipo: 'f018', codigo: 'FORM 018', freq: 'Por evento', nome: 'Lista de presença', desc: 'Treinamentos, palestras e reuniões (também a reunião GRASP): temas, horário, ministrante e quem assina.' },
  { tipo: 'f024', codigo: 'FORM 024', freq: 'Anual', nome: 'Reunião com a gerência', desc: 'Reunião da gerência com os funcionários, com a lista de participantes.' },
  { tipo: 'f044', codigo: 'FORM 044', freq: 'Mensal', nome: 'Ata da reunião GRASP', desc: 'Ata da reunião mensal com o representante dos trabalhadores. A presença vai na Lista de presença (FORM 018).' },
  // 04/11/2026: fichas de papel por funcionário — uma folha para cada marcado.
  { tipo: 'f007', codigo: 'FORM 007', freq: 'Anual · por funcionário', nome: "Higienização dos EPI's", desc: 'Ficha do ano de cada aplicador: marca 1 ou 2 no dia de cada lavagem. Sai uma folha (A4 deitada) por funcionário marcado.' },
  { tipo: 'f054', codigo: 'FORM 054', freq: 'Mensal · por funcionário', nome: 'Banho e higiene pessoal', desc: 'Ficha do mês de cada trabalhador da aplicação: início/fim, banho tomado e assinatura. Uma folha por funcionário marcado.' },
];
function desenhar() {
  const tela = $('telaCeImpressoes'); if (!tela) return;
  tela.innerHTML = `<div class="cartao naoimprimir">
    <h2 style="margin:0">Impressões</h2>
    <p class="dica" style="margin:2px 0 12px">Escolha o impresso, preencha o que quiser do cabeçalho (o que ficar vazio sai em branco para escrever à mão) e marque os funcionários: cada um sai na lista com a função do cadastro. Nada fica gravado — é só para imprimir.</p>
    <div class="ce-ent-lista">${IMPRESSOS.map(i => `<button type="button" class="pv-card pv-calma" data-imp="${i.tipo}" style="text-align:left">
      <span>${esc(i.codigo)} · ${esc(i.freq)}</span><strong style="font-size:17px">${esc(i.nome)}</strong><small>${esc(i.desc)}</small></button>`).join('')}</div>
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
  const f = FORMS[tipo], ant = lembrado()[tipo] || {};
  const fs = funcionarios();
  const ehGrasp = tipo === 'f044';
  if (ehGrasp) return formAta(f, ant);
  if (POR_FUNC.has(tipo)) return formPorFunc(tipo, f, ant);
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
export function abrirImpressoes(tela) { if (tela === 'ceImpressoes') desenhar(); }
export function limparImpressoes() { fechar(); const t = $('telaCeImpressoes'); if (t) t.innerHTML = ''; }
export const _ci = { doc018, doc024, doc044, doc007, doc054 };
