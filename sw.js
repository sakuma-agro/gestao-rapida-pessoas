// Service worker: deixa o app abrir e imprimir mesmo sem internet.
//
// Estratégia: rede primeiro, cache como reserva.
// Com internet, o app sempre carrega a versão publicada — nunca fica preso
// numa versão antiga. Sem internet, cai no que estiver guardado.
const VERSAO = 'gr-v236';
const ARQUIVOS = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/store.js', './js/ficha.js', './js/ficha-cadastral.js', './js/lista.js',
  './js/planilha.js', './js/aniversarios.js', './js/seed.js', './js/sst.js', './js/sst-ficha.js', './js/sst-acidentes.js', './js/sst-calendario.js', './js/reuniao.js', './js/ca.js', './js/rh.js', './js/aso.js',
  './js/acesso.js', './js/atalhos.js', './js/termos.js', './js/backup.js', './js/disc.js', './js/disc-dados.js', './js/disc-ficha.js',
  './js/jornada.js', './js/jornada-dados.js', './js/jornada-motor.js',
  './js/jornada-fechamento.js', './js/jornada-relatorios.js', './js/jornada-cadastros.js', './js/jornada-emprestimos.js', './js/jornada-ferias.js', './js/jornada-boletins.js', './js/jornada-documentos.js', './js/jornada-ticket.js', './js/jornada-folhaponto.js', './js/multisel.js', './js/cad-relatorios.js', './js/organograma.js', './js/rh-ind-vinculos.js', './js/rh-indicadores.js', './js/rh-salarios.js', './js/rh-salario-digno.js', './js/excel.js', './js/icones.js',
  './css/jornada.css', './css/jornada-marca.css', './css/jornada-impressao.css',
  './img/sakuma-logo.png', './img/sakuma-marca-vertical.png',
  './img/lop-assinatura-laser-claro.png', './img/lop-assinatura-laser-escuro.png',
  './img/lop-marca.png', './img/whatsapp.png', './img/folha-ponto.png',
  './vendor/supabase.js', './vendor/xlsx-js-style.min.js', './manifest.webmanifest',
  // Os ícones levam o número da versão no nome. Quando a arte mudar, suba
  // para .v3 aqui, no manifest e no index.html — assim o navegador é obrigado
  // a baixar o arquivo novo em vez de reaproveitar o que ficou guardado.
  './icons/favicon-gr.v2.ico', './icons/gr-32.v2.png', './icons/gr-180.v2.png',
  './icons/gr-192.v2.png', './icons/gr-512.v2.png',
  './icons/gr-maskable-192.v2.png', './icons/gr-maskable-512.v2.png',
  // LOP - Gestão Rápida (09/10/2026): a plataforma, as áreas e a área Manutenções,
  // que precisa abrir sem internet no pátio (a base dela mora no IndexedDB).
  './js/areas.js', './js/certificacao.js', './js/arquivos.js', './js/nucleo.js',
  // Pergunte ao LOP (13/10/2026)
  './js/assistente.js', './css/assistente.css',
  './icons/lop-gr-favicon.v1.ico', './icons/lop-gr-32.v1.png', './icons/lop-gr-180.v1.png',
  './icons/lop-gr-192.v1.png', './icons/lop-gr-512.v1.png',
  './icons/lop-gr-maskable-192.v1.png', './icons/lop-gr-maskable-512.v1.png',
  './icons/mod-manutencoes.v1.png', './icons/mod-certificacao.v1.png',
  './manutencoes/', './manutencoes/index.html', './manutencoes/css/app.css',
  './manutencoes/js/config.js', './manutencoes/js/base.js', './manutencoes/js/comum.js',
  './manutencoes/js/acesso.js', './manutencoes/js/maquinas.js', './manutencoes/js/ordens.js',
  './manutencoes/js/horimetro.js', './manutencoes/js/checklist.js', './manutencoes/js/painel.js', './manutencoes/js/vencimentos.js', './manutencoes/js/grupos.js', './manutencoes/js/modelos_ck.js', './manutencoes/js/patrimonio.js',
  // Vistorias e Segurança (14/10/2026): abre sem sinal no campo, como o app avulso abria.
  './icons/mod-vistorias.v1.png',
  /* ícones das áreas (14/10/2026): uma família, cor e símbolo por área */
  './icons/area-pessoas.v1.svg', './icons/area-manutencoes.v1.svg',
  './icons/area-certificacao.v1.svg', './icons/area-vistorias.v1.svg', './icons/area-usuarios.v1.svg',
  // Programação Campo (15/10/2026): abre sem sinal no campo, como o app avulso abria.
  './icons/area-programacao.v1.svg',
  './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
  './programacao/', './programacao/index.html', './programacao/css/app.css', './programacao/css/programacao.css',
  './programacao/js/config.js', './programacao/js/base.js', './programacao/js/comum.js', './programacao/js/acesso.js',
  './programacao/js/painel.js', './programacao/js/atividades.js', './programacao/js/reuniao.js', './programacao/js/relatorio.js',
  './programacao/js/cadastros.js', './programacao/js/ficha.js', './programacao/js/diario.js',
  './programacao/img/sakuma-logo.png', './programacao/img/lop-marca.png',
  './programacao/img/whatsapp.png',
  // Estoque (15/10/2026): conta-se no almoxarifado, muitas vezes sem sinal.
  './icons/area-estoque.v2.svg',
  './estoque/', './estoque/index.html', './estoque/css/app.css', './estoque/css/estoque.css',
  './estoque/js/app.js', './estoque/js/acesso.js', './estoque/js/acerto.js',
  './estoque/js/acerto-motor.js', './estoque/js/planilha.js',
  './estoque/img/sakuma-logo.png', './estoque/img/lop-marca.png',
  './vistorias/', './vistorias/index.html', './vistorias/lop-antes.js', './vistorias/lop-depois.js', './vistorias/vistorias.js',
  './vistorias/img/sakuma-marca-vertical.png', './vistorias/img/lop-marca.png', './vistorias/img/lop-assinatura-laser-escuro.png',
  './vistorias/icons/gr-vs-192.v1.png', './vistorias/icons/area-vistorias.v1.svg',
  // Excel sem internet (14/10/2026): o modelo NR-24 que a Vistorias oferece para baixar.
  './vistorias/arquivos/Checklist_NR24_Portaria_MTE_1590_2026.xlsx',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO)
    // cache: 'reload' (15/10/2026): o GitHub Pages manda guardar cada arquivo
    // por 10 min; sem isso a versão nova nascia com o JS da anterior.
    .then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Estratégia por tipo (15/10/2026) — antes era "rede primeiro" sem limite
   de tempo, e com sinal fraco cada arquivo ficava esperando a rede mesmo já
   guardado.
   - Página, JS e CSS do app: rede primeiro, mas desiste em 3 s e usa a cópia
     guardada; a resposta que chegar depois ainda atualiza a cópia. Continua
     rede primeiro (e não cópia primeiro) para a página nova nunca abrir com o
     JS da versão anterior logo depois de uma publicação.
   - Bibliotecas (vendor/), imagens e ícones: abrem na hora pela cópia e a
     rede é conferida por trás. São os arquivos pesados e mudam raramente.
   - Supabase e outros endereços: nunca passam por aqui. */
const ESPERA_REDE_MS = 3000;
const PESADO = /\/(vendor|img|icons)\/|\.(png|jpe?g|svg|ico|webp|woff2?|xlsx)$/i;

function buscarEGuardar(cache, req, pesado = false) {
  // Página, JS e CSS: sempre confere com o servidor (no-cache), para a
  // publicação aparecer na hora e não depois dos 10 min do GitHub Pages.
  // (uma navegação não pode ser copiada com opções: refaz pelo endereço)
  const pedido = pesado ? req
    : req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(req, { cache: 'no-cache' });
  return fetch(pedido).then(resp => {
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  });
}

async function reserva(cache, req) {
  const guardado = await cache.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  // navegação sem rede e sem cópia exata: entrega a tela inicial
  if (req.mode === 'navigate') {
    const inicial = await cache.match('./index.html');
    if (inicial) return inicial;
  }
  return Response.error();
}

async function redeComPrazo(ev, cache, req) {
  const rede = buscarEGuardar(cache, req);
  ev.waitUntil(rede.catch(() => {}));
  const tempo = new Promise(ok => setTimeout(() => ok(null), ESPERA_REDE_MS));
  try {
    const resp = await Promise.race([rede, tempo]);
    if (resp) return resp;
  } catch { /* sem rede: cai na reserva */ }
  const guardado = await cache.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  // nada guardado: espera a rede até o fim
  try { return await rede; } catch { return reserva(cache, req); }
}

async function copiaPrimeiro(ev, cache, req) {
  const guardado = await cache.match(req);
  if (guardado) {
    ev.waitUntil(buscarEGuardar(cache, req, true).catch(() => {}));
    return guardado;
  }
  try { return await buscarEGuardar(cache, req, true); }
  catch { return reserva(cache, req); }
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  // chamadas ao Supabase nunca passam pelo cache
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(caches.open(VERSAO).then(cache =>
    PESADO.test(new URL(req.url).pathname) ? copiaPrimeiro(ev, cache, req) : redeComPrazo(ev, cache, req)));
});
