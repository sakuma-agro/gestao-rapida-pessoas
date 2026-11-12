// Consulta pública por QR Code — LOP - Gestão Rápida (10/11/2026).
//
// Pedido do Guilherme: QR no quadro de avisos para os funcionários verem POPs, políticas, leis
// trabalhistas, manual e FISPQ/FDS, sem senha, só para visualizar. Substitui o "MENU - SAKUMA.pdf"
// (PDF com botões que levavam a pastas do Google Drive). Agora a lista vem do app: o que é marcado
// "Mostrar no QR" na Lista mestra da Certificação aparece aqui sozinho, sempre a versão atual.
//
// Telas (pelo # do endereço, para o "voltar" do celular funcionar):
//   (vazio)            menu              #fispq        FISPQ/FDS por categoria, com busca
//   #s/<seção>         lista da seção    #ver/<chave>  o documento aberto (pdf.js, página por página)
//   #conduta           Condutas e direitos (abre a POL 11 — Código de Conduta dos Colaboradores)
// ?g=fds abre direto na FISPQ (QR do depósito).
// ?g=vis abre direto nas regras para visitantes (QR próprio, na portaria/entrada — 12/11/2026).

import { htmlCultura } from './cultura.js?v=2';

const FUNCAO = 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/consulta-publica';

// Botões que ainda não estão no app: continuam no link do Google Drive do cardápio antigo.
// Quando o documento entrar no app e for marcado para o QR, o botão passa a mostrar a lista do app.
const LINKS = {
  telefones: 'https://drive.google.com/file/d/1bjfpmG70binBJaaw-ZuHZHrOMG9pfJI0/view',
  mapa: 'https://drive.google.com/file/d/1GVXDQbztM06iwJ5L2_pnLMQR_cRZ-cuA/view',
};

// Leis trabalhistas (10/11/2026, pedido dele: "precisa dar acesso aos links para os funcionários clicarem; eu
// deixei somente um resumo de cada lei, cláusula"). Textos do "Acesso - Leis Trabalhistas.pdf" (fundamentação legal
// do aditivo do contrato de trabalho) — tela própria, cada cláusula com o resumo e o botão para a lei.
const LEIS = [
  { c: 'Cláusula 4ª – Da jornada de trabalho / período de safra',
    r: 'Artigo 67 da Consolidação das Leis do Trabalho (CLT), Lei nº 605/1949 e Portaria SEPRT nº 19.809, de 24 de agosto de 2020, bem como demais normas trabalhistas aplicáveis.',
    l: 'Lei nº 605/1949 – repouso semanal remunerado', u: 'https://www.planalto.gov.br/ccivil_03/leis/l0605.htm' },
  { c: 'Cláusula 4ª – Da jornada de trabalho em período de safra',
    r: 'O regime atende ao artigo 67 da CLT, à Lei 5.889/1973, à Lei nº 605/1949 e à Portaria SEPRT nº 19.809, de 24 de agosto de 2020.',
    l: 'Lei nº 5.889/1973 – trabalho rural', u: 'https://www.planalto.gov.br/ccivil_03/leis/l5889.htm' },
  { c: 'Cláusula 6ª – Da remuneração', r: 'Artigo 462, § 1º, da CLT.',
    l: 'Artigo 462, § 1º, da CLT', u: 'https://www.jusbrasil.com.br/topicos/10712448/paragrafo-1-artigo-462-do-decreto-lei-n-5452-de-01-de-maio-de-1943' },
  { c: 'Cláusula 8ª – Das penalidades disciplinares', r: 'Artigo 482 da CLT.',
    l: 'Artigo 482 da CLT', u: 'https://www.jusbrasil.com.br/topicos/10709394/artigo-482-do-decreto-lei-n-5452-de-01-de-maio-de-1943' },
  { c: 'Cláusula 10ª – Da segurança do trabalho', r: 'Artigo 75-E da CLT.',
    l: 'Artigo 75-E da CLT', u: 'https://www.jusbrasil.com.br/topicos/173000250/artigo-75e-do-decreto-lei-n-5452-de-01-de-maio-de-1943' },
  { c: 'Cláusula 15ª – Da proteção de dados', r: 'Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).',
    l: 'Lei nº 13.709/2018 – LGPD', u: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm' },
];

// Regras para visitantes (12/11/2026, pedido dele: "Regras de visitantes vamos fazer um QR Code próprio").
// Vinham do botão "Regras visitantes" da folha POL 13 (Acesso e divulgação das políticas). Texto juntado de
// "regras gerais da fazenda" e "Regras EPI - Visitantes" (IT-A 41 — Regras Gerais para Visitantes).
const VISITANTES = [
  { t: 'Antes de entrar', r: [
    'Não entre sem autorização em locais de entrada restrita.',
    'Receba os EPIs antes de entrar nas áreas de produção.',
    'Não é permitida a entrada de animais domésticos.',
  ] },
  { t: 'EPIs obrigatórios', r: [
    'Capacete: onde há risco de queda de objetos.',
    'Botas de segurança ou de borracha: contra escorregões, animais e produtos químicos.',
    'Óculos de proteção: em pulverização ou manuseio de produtos químicos.',
    'Máscara respiratória: com poeira, fumaça ou defensivos agrícolas.',
    'Luvas: nas áreas de preparo, aplicação, descarte e armazenamento de defensivos.',
    'Perneira: onde há risco de cobras, escorpiões ou vegetação espinhosa.',
  ] },
  { t: 'Uso do EPI', r: [
    'Use o EPI durante toda a visita, sem tirar nenhuma peça.',
    'Não empreste nem troque EPI com outros visitantes.',
    'Ajuste o EPI ao corpo para que ele proteja de verdade.',
    'Se o EPI estragar ou incomodar, avise o responsável na hora.',
  ] },
  { t: 'Na fazenda', r: [
    'Velocidade máxima dos veículos: 10 km/h. A poeira faz mal às pessoas e às plantas.',
    'Não entre em áreas pulverizadas.',
    'Não acione nenhum equipamento: pode ser perigoso.',
    'Não toque nos frutos dentro das áreas de produção.',
    'Proibido fumar.',
    'Proibido comer e beber nas áreas de produção.',
    'Use os banheiros para as necessidades e a higiene.',
  ] },
  { t: 'Natureza e limpeza', r: [
    'Preserve a natureza: não cace, mate ou prenda nenhum animal.',
    'Não jogue lixo no chão, nas áreas ou nos canais.',
  ] },
  { t: 'Na saída', r: [
    'Devolva os EPIs no ponto de coleta indicado.',
    'Higienize botas e luvas antes de devolver.',
    'Jogue os descartáveis (máscaras, toucas) nos recipientes próprios.',
  ] },
];

const IC = {
  pop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
  pol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 21h14M7 7h10"/><path d="m7 7-3 7a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7z"/></svg>',
  lei: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 8h7M9 12h5"/></svg>',
  man: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
  fds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v6L4.5 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-3L14 8V2"/><path d="M8.5 2h7M7 15h10"/></svg>',
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z"/><path d="M12 7v6M9 10h6"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tela = $('cq');

/* ---------------- dados ---------------- */
const cache = {};
async function lista(g) {
  if (cache[g]) return cache[g];
  cache[g] = fetch(`${FUNCAO}?acao=lista&g=${g}`).then(async r => {
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()).documentos || [];
  }).catch(e => { delete cache[g]; throw e; });
  return cache[g];
}
const urlArquivo = chave => `${FUNCAO}?acao=ver&chave=${encodeURIComponent(chave)}`;

const eLei = a => /leis?\s+trabalhist/i.test(a.nome);
const eManual = d => /manual|cultura/i.test(d.nome);
const eTelefones = d => /telefone/i.test(d.nome);
const eMapa = d => /mapa/i.test(d.nome) && /socorro|hospital|rota/i.test(d.nome);
/** Separa os documentos do grupo "docs" nas seções do menu. */
function secoes(docs) {
  const s = { procedimentos: [], politicas: [], leis: [], manual: [], telefones: [], mapa: [], instrucoes: [], outros: [] };
  for (const d of docs) {
    const arqs = d.arquivos.filter(a => !eLei(a));
    d.arquivos.filter(eLei).forEach(a => s.leis.push({ ...d, codigo: '', nome: limparNome(a.nome), arquivos: [a] }));
    if (!arqs.length) continue;
    const x = { ...d, arquivos: arqs };
    if (d.categoria === 'P.O.Ps') s.procedimentos.push(x);
    else if (d.categoria === 'POLÍTICAS') s.politicas.push(x);
    else if (eTelefones(d)) s.telefones.push(x);   // 10/11/2026: AN 51 — placa "Telefones úteis"
    else if (eMapa(d)) s.mapa.push(x);
    else if (eManual(d)) s.manual.push(x);
    else if (d.categoria === 'INST. TRABALHO') s.instrucoes.push(x);
    else s.outros.push(x);
  }
  return s;
}
const SECOES = {
  procedimentos: { t: 'Procedimentos', sub: 'POPs — como fazer cada atividade', ic: IC.pop, vazio: 'Os procedimentos estão sendo atualizados. Em breve aparecem aqui.' },
  politicas: { t: 'Políticas', sub: 'O que a empresa garante a todos', ic: IC.pol },
  leis: { t: 'Leis trabalhistas', sub: 'Fundamentação legal do contrato', ic: IC.lei },
  manual: { t: 'Manual de cultura', sub: 'Quem somos e como trabalhamos', ic: IC.man },
  telefones: { t: 'Telefones úteis', sub: 'Emergência e contatos', ic: IC.tel },
  mapa: { t: 'Mapa – pronto-socorro', sub: 'Faz. Faca até o pronto-socorro', ic: IC.mapa },
  instrucoes: { t: 'Instruções de trabalho', sub: 'Passo a passo das tarefas', ic: IC.doc },
  outros: { t: 'Outros documentos', sub: 'Anexos e orientações', ic: IC.doc },
};

/** "FDS - AMISTAR TOP.pdf" → "Amistar Top"; nome de arquivo vira nome de produto legível. */
function limparNome(n) {
  let s = String(n || '').replace(/\.(pdf|jpe?g|png|webp)$/i, '')
    .replace(/^\s*(fispq|fds|ficha de seg\.?|fspq)\s*[-–_:]?\s*/i, '')
    .replace(/[_-]+(fispq|fds|sds)\b.*$/i, '').replace(/\s*[-–]\s*(fispq|fds)\s*$/i, '')
    .replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s|\(|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return s || n;
}
const tituloCat = p => String(p || 'Outros').replace(/^\d+\s*[-.]?\s*/, '');

/* ---------------- telas ---------------- */
function cabecalho(titulo, voltar = '#', sub = '') {
  return `<div class="cq-titulo"><a class="cq-voltar" href="${voltar}" aria-label="Voltar">‹</a><h1>${esc(titulo)}</h1></div>` +
    (sub ? `<p class="cq-sub">${esc(sub)}</p>` : '');
}
function botao(href, ic, titulo, sub, extra = '', externo = false) {
  return `<a class="cq-bt ${extra}" href="${href}"${externo ? ' target="_blank" rel="noopener"' : ''}>
    <span class="ic">${ic}</span><span class="tx"><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="seta">›</span></a>`;
}

async function menu() {
  document.title = 'Consulta de documentos · SAKUMA';
  let s = null;
  try { s = secoes(await lista('docs')); } catch { /* mostra o menu mesmo assim */ }
  const b = [];
  b.push(botao('#cultura', IC.man, 'Manual de Cultura', 'Nossos valores e nossa história', 'cultura'));
  // 12/11/2026: "Condutas e direitos" (vinha da folha POL 13) — abre o Código de Conduta (POL 11).
  b.push(botao('#conduta', IC.pol, 'Condutas e direitos', 'Código de Conduta: deveres, direitos e convivência'));
  b.push(botao('#s/procedimentos', IC.pop, 'Procedimentos', s?.procedimentos.length ? `${s.procedimentos.length} POPs` : 'POPs'));
  for (const k of ['politicas', 'leis', 'instrucoes', 'outros']) {
    if (k === 'leis') { b.push(botao('#leis', IC.lei, 'Leis trabalhistas', 'Cada cláusula com o link da lei')); continue; }
    if (s && s[k].length) b.push(botao(`#s/${k}`, SECOES[k].ic, SECOES[k].t, SECOES[k].sub));
  }
  b.push(botao('#fispq', IC.fds, 'FISPQ / FDS', 'Fichas de segurança dos produtos', 'fds'));
  // Telefones e mapa: do app quando o documento estiver marcado para o QR; senão, o link antigo do Drive.
  for (const k of ['telefones', 'mapa'])
    b.push(s && s[k].length ? botao(`#s/${k}`, SECOES[k].ic, SECOES[k].t, SECOES[k].sub)
      : botao(LINKS[k], SECOES[k].ic, SECOES[k].t, SECOES[k].sub, '', true));
  tela.innerHTML = `<div class="cq-menu"><div class="cq-chamada">Consulta de documentos<small>Toque para abrir</small></div>${b.join('')}</div>` +
    (s ? '' : '<p class="cq-erro" style="margin-top:14px">Sem conexão com o servidor agora. Os botões de telefones e mapa funcionam; tente os outros daqui a pouco.</p>');
}

function itemDoc(d, a, rotulo) {
  const varios = d.arquivos.length > 1;
  const nome = rotulo || (varios ? limparNome(a.nome) : d.nome);
  const sub = varios ? d.nome : (d.revisao ? `Revisão ${d.revisao}` : '');
  return `<li><a class="cq-item" href="#ver/${encodeURIComponent(a.chave)}">
    ${d.codigo ? `<span class="cod">${esc(d.codigo)}</span>` : ''}
    <span class="nm">${esc(nome)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="pdf">${/\.pdf$/i.test(a.nome) ? 'PDF' : 'FOTO'}</span></a></li>`;
}

async function secao(k) {
  const S = SECOES[k];
  if (!S) return irPara('');
  document.title = S.t + ' · SAKUMA';
  tela.innerHTML = cabecalho(S.t, '#', S.sub) + '<p class="cq-carregando">Carregando…</p>';
  let docs;
  try { docs = secoes(await lista('docs'))[k]; } catch { return erro(S.t); }
  if (!docs.length) { tela.innerHTML = cabecalho(S.t, '#', S.sub) + `<p class="cq-vazio">${esc(S.vazio || 'Nada por aqui ainda.')}</p>`; return; }
  // seção com um documento só: abre direto
  if (docs.length === 1 && docs[0].arquivos.length === 1) return irPara('ver/' + encodeURIComponent(docs[0].arquivos[0].chave), true);
  const itens = docs.flatMap(d => d.arquivos.map(a => itemDoc(d, a)));
  tela.innerHTML = cabecalho(S.t, '#', S.sub) + `<ul class="cq-lista">${itens.join('')}</ul>`;
}

let filtroFds = '';
async function fispq() {
  document.title = 'FISPQ / FDS · SAKUMA';
  const voltar = new URLSearchParams(location.search).get('g') === 'fds' ? '' : '#';
  const topo = (voltar ? cabecalho('FISPQ / FDS', voltar) : '<div class="cq-titulo"><h1>FISPQ / FDS</h1></div>') +
    '<p class="cq-sub">Ficha com os cuidados, primeiros socorros e o que fazer em caso de acidente com cada produto.</p>';
  tela.innerHTML = topo + '<p class="cq-carregando">Carregando…</p>';
  let docs;
  try { docs = await lista('fds'); } catch { return erro('FISPQ / FDS', voltar || '#fispq'); }
  const arqs = docs.flatMap(d => d.arquivos.map(a => ({ ...a, produto: limparNome(a.nome), cat: tituloCat(a.pasta), ordem: a.pasta || 'zz' })));
  arqs.sort((x, y) => x.produto.localeCompare(y.produto, 'pt-BR'));
  tela.innerHTML = topo +
    `<label class="cq-busca">${IC.lupa}<input id="cqBusca" type="search" inputmode="search" autocomplete="off" placeholder="Nome do produto…" value="${esc(filtroFds)}" aria-label="Buscar produto"></label>
     <div id="cqFds"></div>`;
  const alvo = $('cqFds');
  const desenhar = () => {
    const q = semAcento(filtroFds).trim();
    const li = a => `<li><a class="cq-item" href="#ver/${encodeURIComponent(a.chave)}"><span class="nm">${esc(a.produto)}${q ? `<small>${esc(a.cat)}</small>` : ''}</span><span class="pdf">PDF</span></a></li>`;
    if (q) {
      const achou = arqs.filter(a => semAcento(a.produto + ' ' + a.nome).includes(q));
      alvo.innerHTML = achou.length ? `<ul class="cq-lista">${achou.map(li).join('')}</ul>`
        : '<p class="cq-vazio">Nenhum produto com esse nome. Confira a escrita ou procure pela categoria.</p>';
      return;
    }
    const grupos = new Map();
    [...arqs].sort((x, y) => x.ordem.localeCompare(y.ordem, 'pt-BR', { numeric: true })).forEach(a => {
      if (!grupos.has(a.cat)) grupos.set(a.cat, []);
      grupos.get(a.cat).push(a);
    });
    alvo.innerHTML = [...grupos].map(([c, l]) =>
      `<details class="cq-grupo"><summary>${esc(c)}<span class="n">${l.length}</span></summary><ul class="cq-lista">${l.sort((x, y) => x.produto.localeCompare(y.produto, 'pt-BR')).map(li).join('')}</ul></details>`).join('')
      || '<p class="cq-vazio">As fichas estão sendo carregadas no sistema. Volte daqui a pouco.</p>';
  };
  $('cqBusca').addEventListener('input', e => { filtroFds = e.target.value; desenhar(); });
  desenhar();
}

function cultura() {
  document.title = 'Manual de Cultura · SAKUMA';
  tela.innerHTML = cabecalho('Manual de Cultura', '#') + htmlCultura();
  // os atalhos internos (#mc-…) rolam a página sem trocar de tela
  tela.querySelectorAll('a[href^="#mc-"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function leis() {
  document.title = 'Leis trabalhistas · SAKUMA';
  tela.innerHTML = cabecalho('Leis trabalhistas', '#', 'Fundamentação legal do aditivo do contrato de trabalho. Toque no botão para ler a lei.') +
    `<div class="cq-leis">${LEIS.map(x => `<section class="cq-lei">
      <h2>${esc(x.c)}</h2><p>${esc(x.r)}</p>
      <a class="cq-acao cq-link-lei" href="${esc(x.u)}" target="_blank" rel="noopener">Ler: ${esc(x.l)} ↗</a></section>`).join('')}</div>
     <p class="cq-nota">A empresa coloca à disposição dos colaboradores a possibilidade de solicitar vias dos documentos sempre que houver necessidade.</p>`;
}

/** Condutas e direitos: abre a POL 11 (Código de Conduta dos Colaboradores) — sempre a versão marcada no QR. */
async function conduta() {
  const T = 'Condutas e direitos';
  document.title = T + ' · SAKUMA';
  tela.innerHTML = cabecalho(T, '#') + '<p class="cq-carregando">Carregando…</p>';
  let docs;
  try { docs = await lista('docs'); } catch { return erro(T); }
  const d = docs.find(x => /^POL\s*0*11$/i.test(String(x.codigo || '').trim())) || docs.find(x => /conduta/i.test(x.nome));
  const a = d?.arquivos?.[0];
  if (!a) { tela.innerHTML = cabecalho(T, '#') + '<p class="cq-vazio">O Código de Conduta está sendo atualizado. Em breve aparece aqui.</p>'; return; }
  irPara('ver/' + encodeURIComponent(a.chave), true);
}

/** Regras para visitantes — tela de texto, abre pelo QR próprio (?g=vis). */
function visitantes() {
  document.title = 'Regras para visitantes · SAKUMA';
  const doQr = new URLSearchParams(location.search).get('g') === 'vis';
  const topo = doQr ? '<div class="cq-titulo"><h1>Regras para visitantes</h1></div>' : cabecalho('Regras para visitantes', '#');
  tela.innerHTML = topo + '<p class="cq-sub">Bem-vindo à SAKUMA Agronegócios. Para a sua segurança e a de todos, siga estas regras durante a visita.</p>' +
    `<div class="cq-leis">${VISITANTES.map(g => `<section class="cq-lei"><h2>${esc(g.t)}</h2><ul class="cq-regras">${g.r.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}</div>
     <div class="cq-acoes" style="margin-top:14px"><a class="cq-acao" href="#s/telefones">Telefones de emergência</a></div>
     <p class="cq-nota">Em caso de dúvida, procure o responsável que acompanha a sua visita.</p>`;
}

/* ---------------- leitor ---------------- */
let pdfjs = null;
async function lib() {
  if (pdfjs) return pdfjs;
  await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
let leituraAtual = 0;
async function ver(chave) {
  const minha = ++leituraAtual;
  // título: procura o documento nas listas já carregadas
  let titulo = 'Documento', voltar = '#';
  for (const g of ['docs', 'fds']) {
    if (!cache[g]) continue;
    try {
      for (const d of await cache[g]) {
        const a = d.arquivos.find(x => x.chave === chave);
        if (a) { titulo = g === 'fds' ? limparNome(a.nome) : eLei(a) ? 'Leis trabalhistas' : eTelefones(d) ? 'Telefones úteis' : `${d.codigo} ${d.nome}`.trim(); voltar = g === 'fds' ? '#fispq' : '#'; }
      }
    } catch { /* lista falhou: segue com o título padrão */ }
  }
  if (history.length > 1) voltar = 'javascript:history.back()';
  document.title = titulo + ' · SAKUMA';
  const url = urlArquivo(chave);
  tela.innerHTML = cabecalho(titulo, voltar) +
    `<div class="cq-acoes"><a class="cq-acao" href="${url}" target="_blank" rel="noopener">Abrir em tela cheia</a></div>
     <div class="cq-leitor" id="cqLeitor"><p class="cq-carregando">Abrindo o documento…</p></div>`;
  const alvo = $('cqLeitor');
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const tipo = r.headers.get('content-type') || '';
    if (minha !== leituraAtual) return;
    if (tipo.startsWith('image/')) {
      const u = URL.createObjectURL(await r.blob());
      alvo.innerHTML = `<img class="cq-img" src="${u}" alt="${esc(titulo)}">`;
      return;
    }
    const dados = await r.arrayBuffer();
    const L = await lib();
    const doc = await L.getDocument({ data: dados }).promise;
    if (minha !== leituraAtual) return;
    alvo.innerHTML = '';
    const larg = Math.min(alvo.clientWidth || 360, 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (let p = 1; p <= doc.numPages; p++) {
      if (minha !== leituraAtual) return;
      const pag = await doc.getPage(p);
      const v1 = pag.getViewport({ scale: 1 });
      const vp = pag.getViewport({ scale: (larg / v1.width) * dpr });
      const cv = document.createElement('canvas');
      cv.className = 'cq-pag'; cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.setAttribute('aria-label', `Página ${p} de ${doc.numPages}`);
      alvo.appendChild(cv);
      await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      if (doc.numPages > 1) alvo.insertAdjacentHTML('beforeend', `<p class="cq-pag-n">Página ${p} de ${doc.numPages}</p>`);
    }
  } catch {
    if (minha !== leituraAtual) return;
    alvo.innerHTML = `<p class="cq-erro">Não consegui mostrar o documento aqui. Toque em <b>Abrir em tela cheia</b> acima.</p>`;
  }
}

function erro(titulo, voltar = '#') {
  tela.innerHTML = cabecalho(titulo, voltar) +
    '<p class="cq-erro">Sem conexão com o servidor agora. Confira a internet do celular e tente de novo.</p>' +
    '<div class="cq-acoes"><a class="cq-acao" href="javascript:location.reload()">Tentar de novo</a></div>';
}

/* ---------------- navegação ---------------- */
function irPara(h, trocar = false) {
  const alvo = h ? '#' + h : location.pathname + location.search;
  if (trocar) history.replaceState(null, '', alvo); else history.pushState(null, '', alvo);
  rota();
}
function rota() {
  const h = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);
  if (h.startsWith('ver/')) return ver(h.slice(4));
  if (h.startsWith('s/')) return secao(h.slice(2));
  if (h === 'fispq') return fispq();
  if (h === 'leis' || h === 's/leis') return leis();
  if (h === 'cultura' || h === 's/manual') return cultura();
  if (h === 'conduta') return conduta();
  if (h === 'visitantes') return visitantes();
  const g = new URLSearchParams(location.search).get('g');
  if (g === 'fds') return fispq();
  if (g === 'vis') return visitantes();
  return menu();
}
window.addEventListener('hashchange', rota);
rota();
