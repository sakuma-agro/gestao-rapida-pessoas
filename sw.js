// Service worker: deixa o app abrir e imprimir mesmo sem internet.
//
// Estratégia: rede primeiro, cache como reserva.
// Com internet, o app sempre carrega a versão publicada — nunca fica preso
// numa versão antiga. Sem internet, cai no que estiver guardado.
const VERSAO = 'epi-v15';
const ARQUIVOS = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/store.js', './js/ficha.js', './js/lista.js',
  './js/planilha.js', './js/aniversarios.js', './js/seed.js',
  './js/disc.js', './js/disc-dados.js', './js/disc-ficha.js',
  './vendor/supabase.js', './manifest.webmanifest', './favicon.ico',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './icons/maskable-192.png', './icons/maskable-512.png',
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
