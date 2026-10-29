// Service worker: deixa o app abrir e imprimir mesmo sem internet.
//
// Estratégia: rede primeiro, cache como reserva.
// Com internet, o app sempre carrega a versão publicada — nunca fica preso
// numa versão antiga. Sem internet, cai no que estiver guardado.
const VERSAO = 'gr-v487';
const ARQUIVOS = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/store.js', './js/ficha.js', './js/ficha-cadastral.js', './js/lista.js',
  './js/planilha.js', './js/aniversarios.js', './js/seed.js', './js/sst.js', './js/sst-ficha.js', './js/sst-acidentes.js', './js/sst-campanhas.js', './js/sst-brigada.js', './js/sst-nrs.js', './js/sst-epi-crono.js', './js/epi-cronograma-dados.js', './js/sst-calendario.js', './js/reuniao.js', './js/ca.js', './js/rh.js', './js/aso.js', './js/sst-exames-rel.js', './js/treino-funcao.js', './js/treino-consolidado.js', './js/atividades-dados.js', './js/sst-atividades.js',
  './js/acesso.js', './js/atalhos.js', './js/termos.js', './js/contrato-trabalho.js', './js/backup.js', './js/disc.js', './js/disc-dados.js', './js/disc-ficha.js',
  './js/jornada.js', './js/jornada-dados.js', './js/jornada-motor.js',
  './js/jornada-fechamento.js', './js/jornada-relatorios.js', './js/jornada-cadastros.js', './js/jornada-emprestimos.js', './js/jornada-ferias.js', './js/jornada-boletins.js', './js/jornada-documentos.js', './js/dp-tarefas.js', './js/jornada-ticket.js', './js/jornada-folhaponto.js', './js/multisel.js', './js/cad-relatorios.js', './js/etiquetas.js', './js/etiquetas-envelope.js', './js/organograma.js', './js/rh-ind-vinculos.js', './js/rh-indicadores.js', './js/motivos-ausencia.js', './js/rh-salarios.js', './js/rh-enquadramento.js', './js/rh-reajuste-tabela.js', './js/rh-salario-digno.js', './js/excel.js', './js/icones.js',
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
  // Cronograma geral (28/10/2026)
  './js/cronograma.js', './css/cronograma.css', './icons/area-cronograma.v1.svg',
  './js/areas.js', './js/certificacao.js', './js/cert-caderno.js', './js/cert-fauna.js', './js/cert-energia.js', './js/cert-residuos.js', './js/cert-grasp.js', './js/cert-banho.js', './js/cert-checklist.js', './js/folhas-estoque.js', './js/sinaletica.js', './sinaletica/placas.json', './js/cert-balanco.js', './js/cert-fornecedores.js', './js/cert-melhorias.js', './js/arquivos.js', './js/nucleo.js', './js/moldura-nucleo.js',
  // Pergunte ao LOP (13/10/2026)
  './js/assistente.js', './css/assistente.css',
  './icons/lop-gr-favicon.v1.ico', './icons/lop-gr-32.v1.png', './icons/lop-gr-180.v1.png',
  './icons/lop-gr-192.v1.png', './icons/lop-gr-512.v1.png',
  './img/abertura-lobo.v1.png', './img/abertura-olho.v1.png',
  './icons/lop-gr-maskable-192.v1.png', './icons/lop-gr-maskable-512.v1.png',
  './icons/mod-manutencoes.v1.png', './icons/mod-certificacao.v1.png',
  './js/categoria-moldura.js', './js/hora-maquina.js', './js/insumo-qc.js', './css/categoria-moldura.css',
  './manutencoes/', './manutencoes/index.html', './manutencoes/css/app.css',
  './manutencoes/js/config.js', './manutencoes/js/base.js', './manutencoes/js/comum.js',
  './manutencoes/js/acesso.js', './manutencoes/js/maquinas.js', './manutencoes/js/vasos.js', './manutencoes/js/laudos.js', './manutencoes/js/ordens.js',
  './manutencoes/js/horimetro.js', './manutencoes/js/atualizar-horimetros.js', './manutencoes/js/checklist.js', './manutencoes/js/painel.js', './manutencoes/js/preventivas.js', './manutencoes/js/horimetros-lancados.js', './manutencoes/js/vencimentos.js', './manutencoes/js/grupos.js', './manutencoes/js/modelos_ck.js', './manutencoes/js/patrimonio.js',
  // Vistorias e Segurança (14/10/2026): abre sem sinal no campo, como o app avulso abria.
  './icons/mod-vistorias.v1.png',
  /* ícones das áreas (14/10/2026): uma família, cor e símbolo por área */
  './icons/area-pessoas.v2.svg', './icons/area-manutencoes.v2.svg',
  './icons/area-certificacao.v2.svg', './icons/area-vistorias.v2.svg', './icons/area-usuarios.v3.svg', './icons/area-backup.v2.svg',
  // Programação Campo (15/10/2026): abre sem sinal no campo, como o app avulso abria.
  './icons/area-programacao.v3.svg',
  './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js', './vendor/html2canvas.min.js',
  './programacao/', './programacao/index.html', './programacao/css/app.css', './programacao/css/programacao.css',
  './programacao/js/config.js', './programacao/js/base.js', './programacao/js/comum.js', './programacao/js/acesso.js',
  './programacao/js/painel.js', './programacao/js/atividades.js', './programacao/js/reuniao.js', './programacao/js/relatorio.js',
  './programacao/js/cadastros.js', './programacao/js/ficha.js', './programacao/js/diario.js',
  './programacao/img/sakuma-logo.png', './programacao/img/lop-marca.png',
  './programacao/img/whatsapp.png',
  // Estoque (15/10/2026): conta-se no almoxarifado, muitas vezes sem sinal.
  './icons/area-estoque.v3.svg',
  './estoque/', './estoque/index.html', './estoque/css/app.css', './estoque/css/estoque.css',
  './estoque/js/app.js', './estoque/js/acesso.js', './estoque/js/acerto.js',
  './estoque/js/acerto-motor.js', './estoque/js/planilha.js',
  './estoque/js/config.js', './estoque/js/base.js', './estoque/js/dados.js',
  './estoque/js/contagem.js', './estoque/js/cadastros.js', './estoque/js/compra.js', './estoque/js/saldo.js', './estoque/js/qc.js', './estoque/js/qc-importar.js', './estoque/js/mapa.js', './estoque/js/pdf.js',
  './vendor/three.min.js', './vendor/three-orbit.js',
  './estoque/img/sakuma-logo.png', './estoque/img/lop-marca.png', './estoque/img/whatsapp.png',
  // Custo Base (20/10/2026): rateio mensal por cultura, que era a planilha do ADM.
  './icons/area-custobase.v3.svg',
  './custobase/', './custobase/index.html', './custobase/css/app.css', './custobase/css/custobase.css',
  './custobase/js/config.js', './custobase/js/base.js', './custobase/js/acesso.js', './custobase/js/app.js',
  './custobase/js/dados.js', './custobase/js/rateio.js', './custobase/js/historico.js', './custobase/js/talhoes.js', './custobase/js/culturas.js', './custobase/js/horahomem.js', './custobase/js/pdf.js', './custobase/img/whatsapp.png',
  './custobase/img/sakuma-logo.png', './custobase/img/lop-marca.png', './custobase/img/sakuma-marca-vertical.png', './custobase/img/lop-assinatura-laser-claro.png',
  // Colheita e Produção (20/10/2026)
  './icons/area-colheita.v3.svg',
  './colheita/', './colheita/index.html', './colheita/css/app.css', './colheita/css/base.css', './colheita/css/colheita.css',
  './colheita/js/config.js', './colheita/js/base.js', './colheita/js/acesso.js', './colheita/js/app.js', './colheita/js/dados.js',
  './colheita/js/painel.js', './colheita/js/cargas.js', './colheita/js/conciliacao.js', './colheita/js/cadastros.js',
  './colheita/js/financeiro.js', './colheita/js/parametros.js', './colheita/js/pdf.js',
  './colheita/img/sakuma-logo.png', './colheita/img/lop-marca.png', './colheita/img/sakuma-marca-vertical.png',
  './colheita/img/lop-assinatura-laser-claro.png', './colheita/img/whatsapp.png',
  './icons/area-projetos.v2.svg',
  './projetos/', './projetos/index.html', './projetos/css/app.css', './projetos/css/projetos.css',
  './projetos/js/config.js', './projetos/js/base.js', './projetos/js/acesso.js', './projetos/js/app.js', './projetos/js/dados.js',
  './projetos/js/ui.js', './projetos/js/painel.js', './projetos/js/projetos.js', './projetos/js/abas-inicio.js',
  './projetos/js/abas-escopo.js', './projetos/js/abas-plano.js', './projetos/js/abas-rede.js', './projetos/js/abas-controle.js',
  './projetos/js/encerramento.js', './projetos/js/relatorio.js', './projetos/js/alertas.js', './projetos/js/licoes.js', './projetos/js/pdf.js',
  './projetos/img/sakuma-logo.png', './projetos/img/lop-marca.png', './projetos/img/sakuma-marca-vertical.png',
  './projetos/img/lop-assinatura-laser-claro.png', './projetos/img/whatsapp.png',
  './vistorias/', './vistorias/index.html', './vistorias/lop-antes.js', './vistorias/lop-depois.js', './vistorias/vistorias.js',
  './vistorias/img/sakuma-marca-vertical.png', './vistorias/img/lop-marca.png', './vistorias/img/lop-assinatura-laser-escuro.png',
  './vistorias/icons/gr-vs-192.v1.png', './vistorias/icons/area-vistorias.v2.svg',
  // Excel sem internet (14/10/2026): o modelo NR-24 que a Vistorias oferece para baixar.
  './vistorias/arquivos/Checklist_NR24_Portaria_MTE_1590_2026.xlsx',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO)
    // cache: 'reload' (15/10/2026): o GitHub Pages manda guardar cada arquivo
    // por 10 min; sem isso a versão nova nascia com o JS da anterior.
    /* Um a um (26/10/2026): com addAll, um único arquivo faltando no servidor
       derrubava a instalação inteira e todo mundo ficava preso na versão
       velha (aconteceu: vistorias/icons/area-vistorias.v2.svg). O que falhar
       fica de fora do cache e é buscado na rede quando for pedido. */
    .then(c => Promise.allSettled(ARQUIVOS.map(u => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});

/* Versão no topo do app (20/10/2026, pedido dele): a página pergunta e o
   service worker responde com a VERSAO que está servindo. */
self.addEventListener('message', ev => {
  if (ev.data?.tipo === 'gr-versao') ev.source?.postMessage({ tipo: 'gr-versao', versao: VERSAO });
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
