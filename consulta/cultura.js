// Manual de Cultura na consulta por QR (10/11/2026, pedido do Guilherme: "crie um somente do manual de cultura,
// valorizando os valores da fazenda"). Texto tirado do "Manual_de_Cultura_SAKUMA - Versão Final.pdf" (Drive do
// escritório, jul/2026). Página feita para ler no celular, sem PDF.
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const I = {
  dono: '<path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z"/>',
  melhoria: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  respeito: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  eficiencia: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  honestidade: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
};
const ic = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

const VALORES = [
  { k: 'dono', n: '01', t: 'Postura de dono', s: 'Responsabilidade',
    q: 'Responsabilidade é a capacidade de responder pelos próprios atos e pelos resultados da sua função — com coragem e honestidade.',
    p: 'Agir com senso de dono, assumindo responsabilidade pelos resultados. Não espere que alguém resolva o que é seu para cuidar. Reconheça as suas entregas, os seus erros e os seus acertos.' },
  { k: 'melhoria', n: '02', t: 'Melhoria contínua', s: 'Evolução constante',
    q: 'Faça o seu melhor com os recursos e as condições que possui hoje, enquanto constrói as condições para fazer ainda melhor amanhã.',
    p: 'Buscar sempre aprender, aprimorar processos e superar desafios. Quem para de melhorar, começa a piorar. Na Sakuma, enxergamos cada dificuldade como uma oportunidade de crescer.' },
  { k: 'respeito', n: '03', t: 'Respeito', s: 'Pessoas e natureza',
    q: 'Respeite a si mesmo, ao próximo, à vida e à terra que nos alimenta.',
    p: 'Tratar pessoas, animais e meio ambiente com consideração e cuidado. Agir com respeito é reconhecer o valor do outro, aceitar as diferenças e construir relações mais cordiais e humanas.' },
  { k: 'eficiencia', n: '04', t: 'Eficiência', s: 'Resultados com foco',
    q: 'Cada recurso usado com sabedoria hoje garante a nossa capacidade de produzir com excelência amanhã.',
    p: 'Utilizar recursos de forma inteligente para maximizar resultados. Eficiência não é fazer mais, é fazer melhor — com o que temos, sem desperdícios, com foco no resultado que importa.' },
  { k: 'honestidade', n: '05', t: 'Honestidade', s: 'Transparência total',
    q: 'A confiança é construída com pequenos atos de honestidade todos os dias. Sem ela, não existe equipe.',
    p: 'Agir com integridade e transparência em todas as relações. Ser honesto é falar a verdade mesmo quando é difícil, é cumprir o que promete e é agir da mesma forma quando está sendo visto ou não.' },
];
const NAO = ['Mentira', 'Fofoca e intriga', 'Falta de respeito', 'Preguiça e vitimismo', 'Trabalhar contra a equipe',
  'Colocar o interesse pessoal acima da fazenda', 'Desperdício de recursos', 'Fazer a tarefa de qualquer jeito',
  'Descuido com animais', 'Descuido com máquinas, equipamentos e patrimônio', 'Não perguntar quando não entendeu',
  'Esconder erros', 'Não assumir responsabilidade pelos próprios atos', 'Agir sem pensar no impacto sobre a equipe',
  'Atitude negativa que contamina o ambiente', 'Desonestidade em qualquer forma'];
const HIST = [
  ['1935', 'A chegada ao Brasil', 'Shusaku Sakuma, imigrante japonês da quinta turma de estagiários Koutakusei, desembarca no Amazonas para trabalhar com a juta. Depois desce pelo Brasil em busca de uma nova vida.'],
  ['Londrina', 'Raízes no Paraná', 'Professor de japonês e agricultor, Shusaku cria os filhos — entre eles Massato — com disciplina, trabalho no campo, respeito e perseverança. Massato andava de 5 a 15 km até a escola, com o sapato nas mãos.'],
  ['Anos 70', 'O PADAP e o Cerrado', 'O Cerrado de São Gotardo era visto como terra que “não servia para nada”. Alysson Paolinelli e a Cooperativa Agrícola de Cotia criam o PADAP para transformá-lo em fronteira agrícola.'],
  ['1974', 'A bênção do pai e o Lote 35', 'Com a bênção de Shusaku e a venda da gleba do Palhano, Massato compra o Lote 35, em Rio Paranaíba. O primeiro trator, um Valmet, abre as áreas. Cada avanço veio com suor, risco e perseverança.'],
  ['1981', 'Fazenda Faca', 'Campos Altos – MG. Disciplina, trabalho de longo prazo e visão de crescimento.'],
  ['1987', 'Primeira irrigação', 'Um marco na modernização das lavouras do Cerrado Mineiro.'],
  ['1994', 'Nasce a COOPADAP', 'Com o fim da Cotia, os produtores do PADAP fundam a Cooperativa Agropecuária do Alto Paranaíba, em São Gotardo.'],
  ['1999', 'Fazenda Morro Branco', 'Rio Paranaíba – MG, o mesmo município onde tudo começou.'],
  ['2008', 'Cidadão Honorário', 'Massato Sakuma recebe o título de Cidadão Honorário de São Gotardo.'],
  ['2013', 'Fazenda Três Riachos', 'Ibiá – MG, uma nova fronteira com o mesmo espírito pioneiro.'],
  ['2022', 'Fazenda Reunidas Quebra Cocão', 'Bom Despacho – MG: mais área de cereais e o início da pecuária de corte.'],
  ['2023', 'Certificação', 'A Fazenda Faca recebe sua primeira certificação GLOBALG.A.P., ampliando depois para o SMETA.'],
];
const FAZENDAS = [['1974', 'Lote 35 (PADAP)', 'Rio Paranaíba', '189,84'], ['1981', 'Fazenda Faca', 'Campos Altos', '236,15'],
  ['1999', 'Fazenda Morro Branco', 'Rio Paranaíba', '125,99'], ['2013', 'Fazenda Três Riachos', 'Ibiá', '160,00'],
  ['2022', 'Fazenda Reunidas Quebra Cocão', 'Bom Despacho', '716,37']];
const CULTURAS = ['Gado de corte', 'Cenoura', 'Abacate', 'Batata', 'Milho', 'Trigo', 'Café', 'Soja'];

export function htmlCultura() {
  return `<article class="mc">
  <header class="mc-hero">
    <small>Manual de Cultura · SAKUMA Agronegócios</small>
    <h1>Somos Sakuma.<br>Cultivamos valores.<br>Colhemos o futuro.</h1>
  </header>

  <nav class="mc-ir" aria-label="Partes do manual">
    <a href="#mc-valores">Valores</a><a href="#mc-missao">Missão e visão</a><a href="#mc-nao">Não admitimos</a>
    <a href="#mc-historia">Nossa história</a><a href="#mc-fazendas">Fazendas</a><a href="#mc-jeito">Nosso jeito</a>
  </nav>

  <section class="mc-boas">
    <h2>Boas-vindas</h2>
    <p><b>Sejam bem-vindos à nossa fazenda!</b> Acreditamos que seu talento irá agregar muito no dia a dia da Sakuma Agronegócios, contribuindo com a qualidade dos alimentos que produzimos e entregamos ao mundo.</p>
    <p>Passamos muitas horas juntos, enfrentando desafios e conquistando resultados. Por isso, prezamos por um ambiente de confiança, cooperação e pertencimento, onde todos possam crescer e contribuir. <b>É muito bom ter você no nosso time!</b></p>
  </section>

  <section id="mc-valores">
    <p class="mc-rot">Pilares estratégicos</p>
    <h2 class="mc-t">Nossos 5 valores</h2>
    <p class="mc-sub">Cada valor fortalece o outro, formando uma cultura sólida e sustentável.</p>
    <div class="mc-chips">${VALORES.map(v => `<a href="#mc-v${v.n}"><span>${ic(v.k)}</span>${esc(v.t)}</a>`).join('')}</div>
    ${VALORES.map(v => `<div class="mc-valor" id="mc-v${v.n}">
      <div class="mc-v-topo"><span class="mc-v-ic">${ic(v.k)}</span><span class="mc-v-n">${v.n}</span></div>
      <h3>${esc(v.t)}</h3><p class="mc-v-s">${esc(v.s)}</p>
      <blockquote>“${esc(v.q)}”</blockquote>
      <p class="mc-v-p"><b>Como praticamos:</b> ${esc(v.p)}</p>
    </div>`).join('')}
  </section>

  <section id="mc-missao" class="mc-mv">
    <div><p class="mc-rot">Missão</p><p>Produzir alimentos com eficiência e responsabilidade, honrando o legado pioneiro da família Sakuma. Cultivamos com a mesma coragem que atravessou gerações, unindo tradição e inovação para levar nossa produção sustentável de alimentos ao mundo — gerando valor para pessoas, parceiros e sociedade, no Brasil e além.</p></div>
    <div><p class="mc-rot">Visão</p><p>Ser reconhecida, nos próximos 5 anos, como uma fazenda referência em gestão, produtividade e sustentabilidade, ampliando em 30% sua área de plantio de forma planejada, rentável e responsável, promovendo crescimento sólido para colaboradores, clientes e parceiros.</p></div>
  </section>

  <section id="mc-nao" class="mc-nao">
    <h2 class="mc-t">Não admitimos</h2>
    <p class="mc-sub">Atitudes que comprometem a equipe, os animais, a fazenda e os resultados.</p>
    <ul>${NAO.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  </section>

  <section id="mc-historia">
    <p class="mc-rot">Nossa história</p>
    <h2 class="mc-t">Uma terra desacreditada que virou celeiro</h2>
    <ol class="mc-linha">${HIST.map(([a, t, x]) => `<li><span class="mc-ano">${esc(a)}</span><b>${esc(t)}</b><p>${esc(x)}</p></li>`).join('')}</ol>
    <blockquote class="mc-bencao">“Todo mundo recebe oportunidades na vida. Às vezes, a pessoa está com a chance nas mãos e deixa escapar. Quem sabe esta seja a sua oportunidade.”<cite>— Shusaku Sakuma, ao filho Massato, em 1974. Uma lição que atravessa gerações.</cite></blockquote>
    <p class="mc-sub">Hoje, a segunda geração — Fábio Massao e Elisabete Hiromi Sakuma — dá continuidade ao legado: o espírito imigrante de Shusaku, a coragem empreendedora de Massato e o compromisso com o futuro.</p>
  </section>

  <section id="mc-fazendas">
    <h2 class="mc-t">Nossas fazendas</h2>
    <p class="mc-sub">Cinco propriedades, uma só trajetória.</p>
    <div class="mc-faz">${FAZENDAS.map(([a, n, c, h]) => `<div><span class="mc-ano">${a}</span><b>${esc(n)}</b><small>${esc(c)} – MG · ${h} ha de cultivo</small></div>`).join('')}</div>
    <p class="mc-rot" style="margin-top:16px">Hoje produzimos</p>
    <div class="mc-cult">${CULTURAS.map(c => `<span>${esc(c)}</span>`).join('')}</div>
  </section>

  <section id="mc-jeito">
    <p class="mc-rot">O que a nossa marca transparece</p>
    <div class="mc-marca">
      <div><b>Evolução</b><p>As folhas que crescem: a marca que evolui a cada safra, em processos, pessoas e resultados.</p></div>
      <div><b>União</b><p>O nome que nos une: a herança da família e o espírito coletivo. Aqui crescemos juntos, como uma família.</p></div>
      <div><b>Força</b><p>Que vem da terra: do solo que resiste, produz e se renova a cada safra.</p></div>
    </div>

    <h2 class="mc-t" style="margin-top:22px">Ciclo PDCA</h2>
    <p class="mc-sub">Nossa ferramenta de melhoria contínua, usada no dia a dia.</p>
    <div class="mc-pdca">
      <div><span>P</span><b>Planejar</b><p>Identifique o problema e por que começa. Plano de ação com os 3 Qs: O quê? Quando? Quem?</p></div>
      <div><span>D</span><b>Fazer</b><p>Envolva as pessoas e execute o plano.</p></div>
      <div><span>C</span><b>Checar</b><p>Verifique se o plano funcionou e analise as ações.</p></div>
      <div><span>A</span><b>Agir</b><p>Deu certo? Padronize e compartilhe. Não deu? Gire o PDCA de novo.</p></div>
    </div>
    <div class="mc-anom"><b>O que é uma anomalia?</b><p>Todo desvio do padrão — algo fora do normal no produto, no processo ou no ambiente. <b>Foco no erro, não em quem errou:</b> investigamos o que causou e o que fazer para não repetir, sem procurar culpados.</p></div>

    <div class="mc-cpd">
      <div><b>Contratamos</b><p>Alinhamento de valores · disposição para os desafios · foco no resultado.</p></div>
      <div><b>Promovemos</b><p>Liderança e compaixão · comprometimento e disciplina · performance sólida. Nenhum esforço sincero passa despercebido.</p></div>
      <div><b>Demitimos</b><p>Quem não vive nossa missão e visão, não está alinhado aos valores ou não apresenta performance.</p></div>
    </div>
  </section>

  <footer class="mc-fim">
    <h2>Bem-vindo à família Sakuma.</h2>
    <p>Aqui, cada pessoa faz a diferença. Nossos valores, nossa missão e nossa visão existem porque acreditamos que pessoas comprometidas e um ambiente de respeito constroem resultados extraordinários.</p>
  </footer>
</article>`;
}
