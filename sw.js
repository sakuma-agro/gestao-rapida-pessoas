// Service worker: deixa o app abrir e imprimir mesmo sem internet.
//
// Estratégia: rede primeiro, cache como reserva.
// Com internet, o app sempre carrega a versão publicada — nunca fica preso
// numa versão antiga. Sem internet, cai no que estiver guardado.
const VERSAO = 'gr-v47';
const ARQUIVOS = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/store.js', './js/ficha.js', './js/lista.js',
  './js/planilha.js', './js/aniversarios.js', './js/seed.js', './js/sst.js', './js/ca.js', './js/rh.js', './js/aso.js',
  './js/acesso.js', './js/disc.js', './js/disc-dados.js', './js/disc-ficha.js',
  './js/jornada.js', './js/jornada-dados.js', './js/jornada-motor.js',
  './js/jornada-fechamento.js', './js/jornada-relatorios.js', './js/jornada-cadastros.js',
  './css/jornada.css', './css/jornada-marca.css', './css/jornada-impressao.css',
  './img/sakuma-logo.png', './img/sakuma-marca-vertical.png',
  './img/lop-assinatura-laser-claro.png', './img/lop-assinatura-laser-escuro.png',
  './vendor/supabase.js', './manifest.webmanifest',
  // Os ícones levam o número da versão no nome. Quando a arte mudar, suba
  // para .v3 aqui, no manifest e no index.html — assim o navegador é obrigado
  // a baixar o arquivo novo em vez de reaproveitar o que ficou guardado.
  './icons/favicon-gr.v2.ico', './icons/gr-32.v2.png', './icons/gr-180.v2.png',
  './icons/gr-192.v2.png', './icons/gr-512.v2.png',
  './icons/gr-maskable-192.v2.png', './icons/gr-maskable-512.v2.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO)
    .then(c => c.addAll(ARQUIVOS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  // chamadas ao Supabase nunca passam pelo cache
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
      return resp;
    } catch {
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      // navegação sem rede e sem cópia exata: entrega a tela inicial
      if (req.mode === 'navigate') {
        const inicial = await cache.match('./index.html');
        if (inicial) return inicial;
      }
      return Response.error();
    }
  })());
});
