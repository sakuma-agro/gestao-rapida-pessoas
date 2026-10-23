// contrato-trabalho.js — Cadastros › Impressos › Contrato de trabalho (23/10/2026)
//
// Veio do modelo "contrato_trabalho_modelo_sakuma.docx" que ele mandou. O
// texto NÃO mora no código: o de fábrica abaixo é só ponto de partida e
// "Restaurar original"; o que vale é `modelo.termos.trabalho`, editado pela
// própria tela (mesma regra dos termos e da ficha de EPI).
//
// Marcações do texto (uma linha = um parágrafo):
//   **texto**  → negrito (como no modelo: números das cláusulas, EMPREGADO…)
//   {CHAVE}    → dado da pessoa/empregador (lista em CHAVES)
//
// O contrato tem mais de uma folha: os parágrafos são distribuídos em folhas
// A4 medindo o que cabe (paginar()), e o bloco de assinaturas nunca quebra.
import { estado, modeloAtual, salvarModelo } from './store.js';
import { LOGO, PE_LOP_SIMBOLO as PE_LOP } from './seed.js';
import * as jd from './jornada-dados.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const so = v => String(v == null ? '' : v).trim();
const semAcento = v => so(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const digitos = v => so(v).replace(/\D/g, '');
const cpfBr = c => { const d = digitos(c);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : so(c); };
const br = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const LINHA = '____________________';
const ASS = '________________________________________';

export const TELAS_CONTRATO = ['contratoTrab'];

/* =============== valor por extenso =============== */
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CT[c]);
  if (r < 20) { if (r) p.push(UN[r]); }
  else { p.push(DZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : '')); }
  return p.join(' e ');
}
function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), r = n % 1000;
  const p = [];
  if (mi) p.push(mi === 1 ? 'um milhão' : ate999(mi) + ' milhões');
  if (mil) p.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
  if (r) p.push(ate999(r));
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda
  if (p.length > 1 && r && (r < 100 || r % 100 === 0)) { const u = p.pop(); return p.join(' ') + ' e ' + u; }
  return p.join(' ');
}
export function reaisPorExtenso(v) {
  const centavosTot = Math.round(Number(v || 0) * 100);
  if (!centavosTot) return '';
  const reais = Math.floor(centavosTot / 100), cent = centavosTot % 100;
  const partes = [];
  if (reais) partes.push(inteiroExtenso(reais) + ((reais % 1e6 === 0) ? ' de reais' : reais === 1 ? ' real' : ' reais'));
  if (cent) partes.push(inteiroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.join(' e ');
}
const brl = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerValor = s => { const t = so(s).replace(/[^\d,.-]/g, ''); if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };

/* =============== texto de fábrica (o .docx que ele mandou) =============== */
const CORPO_PADRAO = [
  'De um lado o empregador **{EMPREGADOR}**, inscrito no CEI sob n. {CEI}, com sede na {SEDE}, aqui representado por {REPRESENTANTE}, CPF {REPRESENTANTE_CPF}, doravante denominado **EMPREGADOR** e, de outro lado o **{NOME}** portador do CPF n. {CPF} e CTPS n. {CTPS} – Série {SERIE}, com endereço atual no (a) {ENDERECO}, de acordo com o artigo 468 da CLT e demais legislações pertinentes ao assunto acordam por mútuo consentimento, e ajustam o seguinte, nos termos das cláusulas seguintes:',
  '**01-** O **EMPREGADO** foi contratado no dia {ADMISSAO}, última função {FUNCAO} – CBO: {CBO}, cujas atividades estão descritas no PGR.',
  '**Parágrafo único:** Fica estabelecido que o **EMPREGADO** poderá prestar serviços em qualquer local explorado pelo **EMPREGADOR**. Desde que todas as observações, a segurança do trabalho, saúde do trabalhador sejam respeitadas pelo empregador.',
  '**02** - O pagamento permanecerá sendo feito de forma mensal, hoje o equivalente a R$ {SALARIO} ( {SALARIO_EXTENSO} ), podendo ser efetuado os seguintes descontos (art. 462 CLT), com os quais o **EMPREGADO** desde já concorda, autorizando-os:',
  '**a)** descontos legais;',
  '**b)** benefícios que forem concedidos pelo **EMPREGADOR** e autorizados por lei seus respectivos descontos;',
  '**c)** adiantamentos salariais em casos excepcionais;',
  '**d)** importância correspondente aos prejuízos que causar a propriedade, já que esta possibilidade fica expressamente prevista em contrato.',
  '**03** – Fica assegurado a todo **EMPREGADO** transporte gratuito para deslocamento até o trabalho.',
  '**04-** Fica assegurado ao **EMPREGADO** o recebimento mensal de ticket alimentação que deverá ser entregue juntamente com o pagamento salário mensal a ser efetuado até o 5º (quinto) dia útil do mês subsequente trabalhado ticket alimentação.',
  '**05** – A jornada de trabalho é de 44:00 (quarenta e quatro) horas semanais, ou seja: Segunda a Sexta, horário: 07:00 as 16:00, com intervalo para repouso e alimentação das 11:00 as 12:00 com e aos sábados de 07:00 as 11:00',
  '**§ 1º.** Não serão descontadas nem computadas como jornada extraordinária as variações de horário do registro de ponto não excedentes de cinco minutos, observado o limite máximo de dez minutos diários (Art. 58, § 1º CLT e Súmula n. 366 do TST)',
  '**§ 2º.** Havendo necessidade de executar as suas funções fora do horário normal, havendo prévia concordância das partes, o **EMPREGADO** poderá trabalhar até 02 (duas) horas extras dia, limitada a jornada de 10 (dez) horas dia, devendo ser remuneradas com adicional legal (art. 59 CLT, art. 7º CF)',
  '**Parágrafo único:** Para avaliar as horas que deverão ser compensadas, o **EMPREGADOR** utilizará da Folha de Ponto, constando o dia e o horário das horas normais não trabalhadas, para que estas sejam compensadas na mesma proporção.',
  '**06** – O **EMPREGADO** se obriga a executar todos os serviços determinados pelo **EMPREGADOR**, não podendo chamar terceiros (filhos, irmãos etc.), para auxiliá-lo, com exceção de quando contratados por escrito e com o competente registro em carteira pelo **EMPREGADOR**.',
  '**07** - Fica estabelecido que as infrações contratuais por parte do **EMPREGADO** importarão em penas sucessivas de: a) Advertência (verbal ou por escrito); b) Suspensão; c) Demissão.',
  '**Parágrafo Único:** Salvo se a falta for tão grave que se justifique rescisão imediata (como a de atos de improbidade, agressão em serviço, a colega superior ou visitante, etc.).',
  '**08-** A cada período de 12 meses o **EMPREGADO** terá direito as férias nas seguintes proporções: 30 dias corridos caso não tenha mais de 5 faltas injustificadas; 24 dias corridos caso tenha 6 a 14 faltas injustificadas; 18 dias corridos caso tenha 15 a 23 faltas injustificadas; 12 dias corridos caso tenha 24 a 32 faltas injustificadas.',
  '**PARÁGRAFO ÚNICO:** O **EMPREGADO** perderá o período aquisitivo de férias caso tenha mais de 32 faltas injustificadas.',
  '**09** - Fica assegurado ao **EMPREGADO** o não desconto de seu salário em caso de falta justificada previstas em Lei, dentre elas: art. 473 CLT.',
  '**10** - O **EMPREGADO** terá direito a Licença médica; Licença à gestante; Licença Paternidade; Licença maternidade, conforme art.476 CLT, art. 7º da CF e Lei 8213/91',
  '**11** - Perderá a remuneração do dia de repouso o **EMPREGADO** que, sem motivo justificado ou em virtude de punição disciplinar, não tiver trabalhado durante toda a semana, cumprindo integralmente o seu horário de trabalho, de acordo com o artigo 158 do Decreto 10.854/2021 e demais legislações pertinentes ao assunto.',
  '**12** – O aviso prévio deverá ser concedido com a antecedência mínima de 30 dias, conforme disposto no art. (CF, art.7º, XXI; CLT, art. 487; Lei nº 12.506/2011, art. 1º)',
  '**13** - Fica expressamente proibido o uso de qualquer imagem da empresa, seja rede ou social, salvo autorização expressa do Departamento competente.',
  '**14** - O **EMPREGADO** se compromete a manter atualizado seus dados, bem como dar ciência ao **EMPREGADOR** da sua residência e demais dados pessoais que estabeleça ou altere durante toda a vigência do presente contrato de trabalho.',
  '**15** - O **EMPREGADO** fica ciente do Regulamento da Empresa e das Normas de Segurança que regulam suas atividades na empresa, e se compromete a usar os equipamentos de segurança fornecidos, sob pena de ser punido por falta grave, nos termos da legislação vigente e demais disposições inerentes à segurança e medicina do trabalho; bem como se compromete em conformidade com o artigo 75-E da CLT a seguir as instruções fornecidas pelo **EMPREGADOR**, quanto às precauções a tomar a fim de evitar doenças e acidentes de trabalho, e ainda cumprir com as normas e procedimentos relacionados à Segurança e Medicina do Trabalho.',
  '**Parágrafo único:** - O uso de EPIs é obrigatório e será fornecido gratuitamente a todos trabalhadores, devendo O **EMPREGADO** comunicar imediatamente ao **EMPREGADOR** em caso de desgaste natural, perda ou extravio, para que possa fazer a substituição de imediato.',
  '**16** - O **EMPREGADOR** recomenda O **EMPREGADO** que utilize os meios de transportes fornecidos pela empresa, sob pena das sanções da lei diante do não cumprimento das normas trabalhistas decorrentes do poder diretivo do **EMPREGADOR**, tais como atrasos ao trabalho; bem como de eximir **EMPREGADOR** de qualquer responsabilidade e/ou reparação de danos em casos de acidentes.',
  '**17** – O **EMPREGADOR** realizará o tratamento de dados pessoais do **EMPREGADO** e demais pessoas relacionadas a ele. Ademais, o uso dos dados pessoais coletados será para a finalidade exclusiva de prestar os serviços constantes deste instrumento.',
  '**§ 1º:** Os dados pessoais acima citados incluem nome, endereços, contatos telefônicos, endereços eletrônicos, data de nascimento, gênero, filiação, estado civil, naturalidade, nacionalidade, CPF e identificação civil. Outros dados, diferentes dos anteriormente citados, que possam ser eventualmente solicitados, serão previamente informados, bem como a finalidade de sua coleta será claramente especificada para que o **EMPREGADO** possa, de livre, consciente e manifesta vontade consentir ou não com seu tratamento.',
  '**§ 2º:** Fica autorizado pelo **EMPREGADO** que o **EMPREGADOR** poderá compartilhar os dados pessoais coletados, quando estritamente necessário para a execução dos trabalhos, a profissionais como contadores, advogados, empresas especializadas envolvidas nos trabalhos, entre outros, desde que tais pessoas assegurem e comprovem a segurança e confidencialidade dos dados compartilhados. Na hipótese de qualquer transferência que fuja o escopo inicial do trabalho contratado, um novo consentimento será solicitado, assim como as novas informações do tratamento serão informadas.',
  '**§ 3º:** Os dados serão mantidos sob arquivo do **EMPREGADOR** estritamente pelo tempo necessário para o cumprimento dos serviços objeto deste contrato. Após concluído o presente contrato, os dados pessoais acima citados serão destruídos, salvo aqueles que forem necessários para cumprimento de obrigação legal, na forma do Art. 16, I da Lei 13.709/18.',
  '**§ 4º:** O **EMPREGADO** poderá, a qualquer momento, solicitar ao **EMPREGADOR** acesso a todos os dados pessoais envolvidos nos trabalhos a serem prestados, bem como a sua retificação ou eliminação, a limitação do tratamento, e o direito de se opor ao tratamento, bem como do direito à portabilidade dos dados. Desde que o exercício de tais direitos, não o impossibilitem a execução do presente contrato, hipótese esta que será disciplinada conforme exposto no Art. 7º, V da Lei 13.709/18.',
  '**§ 5º:** Poderá ainda o **EMPREGADO** solicitar a retirada do consentimento em qualquer momento, sem comprometer a licitude do tratamento efetuado com base no cumprimento de obrigações legais ou com base no consentimento previamente dado, ressalvada a hipótese de impossibilidade de execução contratual do objeto deste Contrato.',
  '**18** - Diante de todo exposto, o **EMPREGADO** confere seu consentimento expresso e específico, de forma livre, inequívoca e devidamente informada, neste ato concordando com a coleta e tratamento dos dados pessoais mencionados acima, na forma do Art. 7º, inciso I, c/c Art. 14 da Lei nº 13.709/2018.',
  '**19** - Os contraentes elegem na melhor forma o Foro da Comarca de Rio Paranaíba/MG, para dirimir as dúvidas oriundas do presente instrumento e por estarem justos os contratados, assinam o presente, em duas vias, na presença de duas testemunhas',
  '**20** - As demais condições do contrato permanecem as mesmas.',
  'Por estar plenamente de acordo o presente aditamento de contrato assinam na presença de duas testemunhas.',
].join('\n');

export const CONTRATO_PADRAO = {
  titulo: 'CONTRATO DE TRABALHO POR PRAZO INDETERMINADO',
  corpo: CORPO_PADRAO,
  local: 'Campos Altos',
  representante: '',
  representante_cpf: '',
};

/* As chaves que o texto aceita (aparecem na dica da tela). */
export const CHAVES = ['NOME', 'CPF', 'CTPS', 'SERIE', 'ENDERECO', 'ADMISSAO', 'FUNCAO', 'CBO', 'SALARIO', 'SALARIO_EXTENSO',
  'EMPREGADOR', 'CEI', 'SEDE', 'REPRESENTANTE', 'REPRESENTANTE_CPF', 'FAZENDA'];

const atual = () => {
  const m = modeloAtual();
  return { ...CONTRATO_PADRAO, ...(m?.termos?.trabalho || {}) };
};
const cbosSalvos = () => modeloAtual()?.termos?.trabalho_cbo || {};

/* =============== dados =============== */
const fazendaDe = nome => (jd.dados.fazendas || []).find(f => semAcento(f.nome) === semAcento(nome)) || null;
const empregadorDe = (func) => {
  const u = jd.unidadeDe(jd.vinculoDe(func.id));
  return jd.empregadorDe(u) || (jd.dados.empregadores || []).find(e => semAcento(e.nome) === semAcento(func.empregador)) || null;
};
/** Último salário lançado no RH (só aparece para quem pode ver salário). */
const salarioDe = fid => [...(jd.dados.salarios || [])].filter(s => s.funcionario_id === fid)
  .sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')))[0] || null;
/** CTPS gravada como "12345/0001" ou "12345 série 0001" → [número, série]. */
function ctpsPartes(c) {
  const t = so(c);
  const m = /^(.*?)(?:\s*[\/-]\s*|\s+s[ée]rie\s*:?\s*)(\S+)$/i.exec(t);
  return m ? [so(m[1]), so(m[2])] : [t, ''];
}

function enderecoFunc(f, faz) {
  const partes = [so(f.logradouro), so(f.bairro), so(f.municipio)].filter(Boolean);
  if (partes.length) return partes.join(', ');
  return so(faz?.endereco) || [so(faz?.nome), so(faz?.municipio) && `${so(faz.municipio)}${faz?.uf ? '/' + faz.uf : ''}`].filter(Boolean).join(', ');
}

/** Tudo que o texto pode usar, com o que falta marcado. */
function dadosDe(f, extra) {
  const cfg = atual();
  const faz = fazendaDe(f.fazenda);
  const emp = empregadorDe(f);
  const u = jd.unidadeDe(jd.vinculoDe(f.id));
  const [ctpsN, ctpsS] = ctpsPartes(f.ctps);
  const sal = extra.salario;
  const sede = so(faz?.endereco) || [so(faz?.nome), so(faz?.municipio) && `${so(faz.municipio)}${faz?.uf ? '/' + faz.uf : ''}`].filter(Boolean).join(', ');
  const v = {
    NOME: so(f.nome),
    CPF: cpfBr(f.cpf),
    CTPS: ctpsN,
    SERIE: so(extra.serie) || ctpsS,
    ENDERECO: enderecoFunc(f, faz),
    ADMISSAO: br(extra.admissao),
    FUNCAO: so(f.cargo),
    CBO: so(extra.cbo),
    SALARIO: sal != null ? brl(sal) : '',
    SALARIO_EXTENSO: sal != null ? reaisPorExtenso(sal) : '',
    EMPREGADOR: so(emp?.nome) || so(f.empregador),
    CEI: so(u?.caepf),
    SEDE: sede,
    REPRESENTANTE: so(cfg.representante) || so(emp?.nome) || so(f.empregador),
    REPRESENTANTE_CPF: so(cfg.representante_cpf) ? cpfBr(cfg.representante_cpf) : cpfBr(emp?.cpf),
    FAZENDA: so(f.fazenda),
  };
  return v;
}

const ROTULO_FALTA = { CPF: 'CPF', CTPS: 'CTPS', SERIE: 'série da CTPS', ENDERECO: 'endereço', ADMISSAO: 'data de admissão',
  FUNCAO: 'função', CBO: 'CBO', SALARIO: 'salário', EMPREGADOR: 'empregador', CEI: 'CEI/CAEPF da unidade',
  SEDE: 'endereço da fazenda', REPRESENTANTE_CPF: 'CPF do representante' };

/** Troca as chaves; o que estiver vazio vira linha para escrever à mão. */
function preencher(texto, v, faltas) {
  const seguro = esc(texto);
  return seguro
    .replace(/\{(\w+)\}/g, (todo, k) => {
      if (!(k in v)) return todo;
      if (so(v[k])) return esc(v[k]);
      if (ROTULO_FALTA[k]) faltas.add(ROTULO_FALTA[k]);
      return k === 'SALARIO_EXTENSO' ? '______________________________' : LINHA;
    })
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/* =============== folhas =============== */
function folhaVazia(primeira, titulo, nome) {
  const d = document.createElement('div');
  d.className = 'an-folha ct-folha';
  d.innerHTML = `${primeira ? `<div class="an-topo ct-topo"><img src="${LOGO}" alt=""><div class="an-tit"><h1>${esc(titulo)}</h1><p>${esc(nome)}</p></div></div>`
    : `<div class="ct-cab"><span>${esc(titulo)}</span><span>${esc(nome)}</span></div>`}
    <div class="ct-corpo"></div>
    <div class="an-pe"><span>SAKUMA Agronegócios</span><span class="ct-pag"></span></div>${PE_LOP}`;
  return d;
}

function assinaturas(v, cfg, dataAss) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataAss || '');
  const quando = m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : '____ de ______________ de ________';
  return `<div class="ct-ass">
    <p class="ct-p">${esc(cfg.local)}, ${quando}.</p>
    <div class="ct-assin"><div><span>${ASS}</span><b>EMPREGADO</b><small>${esc(v.NOME)}</small></div>
      <div><span>${ASS}</span><b>EMPREGADOR</b><small>${esc(v.EMPREGADOR)}</small></div></div>
    <p class="ct-p" style="margin-top:6mm"><b>TESTEMUNHAS:</b></p>
    <div class="ct-assin"><div><span>1- ${ASS}</span><small>Nome e CPF</small></div>
      <div><span>2- ${ASS}</span><small>Nome e CPF</small></div></div>
  </div>`;
}

/** Monta e pagina. Devolve as faltas encontradas. */
function montar(saida, f, extra) {
  const cfg = atual();
  const v = dadosDe(f, extra);
  const faltas = new Set();
  const blocos = so(cfg.corpo).split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => `<p class="ct-p">${preencher(l, v, faltas)}</p>`);
  blocos.push(assinaturas(v, cfg, extra.dataAss));

  saida.innerHTML = '';
  let folha = folhaVazia(true, cfg.titulo, v.NOME);
  saida.appendChild(folha);
  let corpo = folha.querySelector('.ct-corpo');
  const estoura = () => folha.scrollHeight > folha.clientHeight + 1;
  for (const html of blocos) {
    corpo.insertAdjacentHTML('beforeend', html);
    if (estoura() && corpo.children.length > 1) {
      const ultimo = corpo.lastElementChild;
      ultimo.remove();
      folha = folhaVazia(false, cfg.titulo, v.NOME);
      saida.appendChild(folha);
      corpo = folha.querySelector('.ct-corpo');
      corpo.appendChild(ultimo);
    }
  }
  const pags = saida.querySelectorAll('.ct-folha');
  pags.forEach((p, i) => { p.querySelector('.ct-pag').textContent = `Página ${i + 1} de ${pags.length}`; });
  return [...faltas];
}

/* =============== tela =============== */
const ativos = () => (estado.funcionarios || []).filter(f => f.situacao === 'ATIVO')
  .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
const funcSel = () => (estado.funcionarios || []).find(f => String(f.id) === $('ctFunc')?.value) || null;

/** Ao escolher a pessoa: data, salário, CBO e série vêm do cadastro/RH. */
function preencherDaPessoa() {
  const f = funcSel();
  if (!f) return;
  $('ctAdmissao').value = so(f.admissao).slice(0, 10);
  const s = salarioDe(f.id);
  $('ctSalario').value = s?.valor != null ? brl(s.valor) : '';
  $('ctCbo').value = cbosSalvos()[semAcento(f.cargo)] || '';
  $('ctSerie').value = ctpsPartes(f.ctps)[1] || '';
}

function preencherSelect() {
  const sel = $('ctFunc');
  if (!sel) return;
  const antes = sel.value;
  sel.innerHTML = '<option value="">Escolha um funcionário...</option>'
    + ativos().map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('');
  if (ativos().some(f => String(f.id) === antes)) sel.value = antes;
}

function preencherTexto() {
  const cfg = atual();
  $('ctTitulo').value = cfg.titulo;
  $('ctCorpo').value = cfg.corpo;
  $('ctLocal').value = cfg.local;
  $('ctRepresentante').value = cfg.representante;
  $('ctRepresentanteCpf').value = cfg.representante_cpf;
}

export function desenharContrato() {
  const saida = $('ctSaida'), aviso = $('ctAviso');
  if (!saida) return;
  const f = funcSel();
  if (!f) {
    saida.innerHTML = '';
    aviso.textContent = 'Escolha um funcionário para montar o contrato.';
    aviso.className = 'aviso info'; aviso.hidden = false;
    return;
  }
  const faltas = montar(saida, f, {
    admissao: $('ctAdmissao').value, salario: lerValor($('ctSalario').value),
    cbo: $('ctCbo').value, serie: $('ctSerie').value, dataAss: $('ctDataAss').value,
  });
  if (faltas.length) {
    aviso.textContent = `Falta: ${faltas.join(', ')}. O contrato sai com a linha em branco nesses lugares para preencher à mão.`;
    aviso.className = 'aviso'; aviso.hidden = false;
  } else aviso.hidden = true;
}

export function abrirContrato() {
  preencherSelect();
  preencherTexto();
  if (funcSel() && !$('ctAdmissao').value) preencherDaPessoa();
  desenharContrato();
}

/** Abre já com a pessoa escolhida (tarefa de admissão, por exemplo). */
export function contratoDe(fid) {
  const sel = $('ctFunc');
  if (!sel) return;
  preencherSelect();
  sel.value = fid;
  preencherDaPessoa();
  desenharContrato();
}

export function ligarContrato(mostrarAviso) {
  $('ctFunc')?.addEventListener('change', () => { preencherDaPessoa(); desenharContrato(); });
  ['ctAdmissao', 'ctSalario', 'ctSerie', 'ctDataAss'].forEach(id => $(id)?.addEventListener('change', desenharContrato));
  /* O CBO fica guardado por função: na próxima pessoa da mesma função ele já vem. */
  $('ctCbo')?.addEventListener('change', async () => {
    const f = funcSel();
    desenharContrato();
    if (!f || !so(f.cargo)) return;
    const m = modeloAtual();
    const mapa = { ...(m.termos?.trabalho_cbo || {}), [semAcento(f.cargo)]: so($('ctCbo').value) };
    try { await salvarModelo({ ...m, termos: { ...(m.termos || {}), trabalho_cbo: mapa } }); } catch {}
  });
  $('formContrato')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const m = modeloAtual();
    const cfg = { titulo: so($('ctTitulo').value), corpo: $('ctCorpo').value, local: so($('ctLocal').value),
      representante: so($('ctRepresentante').value), representante_cpf: so($('ctRepresentanteCpf').value) };
    await salvarModelo({ ...m, termos: { ...(m.termos || {}), trabalho: cfg } });
    desenharContrato();
    mostrarAviso?.('Texto do contrato salvo.');
  });
  $('bRestaurarContrato')?.addEventListener('click', async () => {
    if (!confirm('Voltar o texto do contrato para o original?\n\nO que você escreveu aqui se perde.')) return;
    const m = modeloAtual();
    await salvarModelo({ ...m, termos: { ...(m.termos || {}), trabalho: null } });
    preencherTexto(); desenharContrato();
    mostrarAviso?.('Texto restaurado.');
  });
  $('bImprimirContrato')?.addEventListener('click', () => {
    if (!funcSel()) return;
    const antes = document.title;
    document.title = `Contrato de trabalho - ${funcSel().nome}`.replace(/[\\/:*?"<>|]/g, '-');
    window.print();
    setTimeout(() => { document.title = antes; }, 500);
  });
  const z = $('zoomCt');
  z?.addEventListener('input', () => {
    $('zoomCtV').textContent = z.value + '%';
    $('ctSaida').style.transform = `scale(${z.value / 100})`;
    $('ctSaida').style.transformOrigin = 'top center';
  });
}
