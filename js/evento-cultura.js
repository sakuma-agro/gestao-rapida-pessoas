// evento-cultura.js — Evento Cultura: fotos e vídeos dos eventos de cultura
// (11/11/2026, pedido do Guilherme: "colocar dentro do app, Evento Cultura e
// criar 2026, anexar tudo no Google Drive").
//
// Os arquivos ficam no Google Drive da conta escritoriosakuma1, na pasta
// "LOP - Gestão Rápida – arquivos › Evento Cultura › <ano>", compartilhada como
// "qualquer pessoa com o link pode ver" — o funcionário abre e baixa sem login
// e sem instalar nada, mas não consegue apagar nem alterar.
//
// Ano novo: um item a mais em ANOS (pasta do ano, de Fotos e de Vídeos, uma
// foto de capa e algumas de amostra — os ids estão na URL do Drive).
// Para todo login (mesma regra de Compras); quem não tem login recebe o link.

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PASTA = id => `https://drive.google.com/drive/folders/${id}`;
const MINI = (id, w = 800) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const FOTO = id => `https://drive.google.com/file/d/${id}/view`;

export const ANOS = [
  {
    ano: 2026,
    titulo: 'Lançamento do Manual de Cultura',
    data: 'Setembro de 2026',
    pasta: '12LEpeDB8TPyHJsoKY52XnRNmgkFn5D_w',
    fotos: { pasta: '1rqxrp_0Hw7XjnEAdTYXuuGf7CCi7t7-B', qtd: 244 },
    videos: { pasta: '1QTGy3mHM0SOqrsbMYFcndUnKdxWvdVS0', qtd: 2 },
    capa: '17kvN_MX5L0eJoROBijzjb7cPj3joWcB3',
    amostra: ['1eVcCa4IfSjWjkAsMvWvKpe_gZyZ0I9S-', '1RhyIB5t9B8P3mcEIJx6RZJ8XYCl3JZn6',
      '1G14TIgTdaDTHChzNfS7p6qcTT9oirl55', '1GrrD1kHKtxC4zy48wTJWpoAzdsbwmnIZ',
      '14tpCjGc9miPjCHaR_2IKLFnMefVnNE1w', '1_YCfS0CoGrRMvyiAKkaJ3-jQatrGlOlM'],
  },
];

let anoAtual = ANOS[0].ano;
let qrLib = null;

function carregarQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (qrLib) return qrLib;
  qrLib = new Promise((ok, nao) => {
    const s = document.createElement('script');
    s.src = 'vendor/qrcode-generator.js';
    s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; nao(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLib;
}

const textoZap = a => `📸 Fotos e vídeos do Evento de Cultura SAKUMA ${a.ano}\n` +
  `Abra o link para ver e baixar (não precisa de login):\n${PASTA(a.pasta)}`;

export function abrirEventoCultura(alvo) {
  if (!alvo) return;
  const a = ANOS.find(x => x.ano === anoAtual) || ANOS[0];
  alvo.innerHTML = `<div class="ev">
    <div class="ev-cab">
      <div><h2>Evento Cultura</h2>
        <p class="ev-sub">Fotos e vídeos dos eventos de cultura da SAKUMA. Qualquer pessoa com o link vê e baixa — ninguém consegue apagar.</p></div>
    </div>
    ${ANOS.length > 1 ? `<div class="ev-anos" role="tablist">${ANOS.map(x =>
      `<button type="button" role="tab" data-ano="${x.ano}" aria-selected="${x.ano === a.ano}">${x.ano}</button>`).join('')}</div>` : ''}
    <section class="ev-card">
      <a class="ev-capa" href="${FOTO(a.capa)}" target="_blank" rel="noopener">
        <img src="${MINI(a.capa, 1600)}" alt="Foto do evento ${a.ano}" loading="lazy">
        <span class="ev-ano">${a.ano}</span>
      </a>
      <div class="ev-info">
        <h3>${esc(a.titulo)}</h3>
        <p class="ev-sub">${esc(a.data)} · ${a.fotos.qtd} fotos · ${a.videos.qtd} vídeos</p>
        <div class="ev-acoes">
          <a class="btn principal" href="${PASTA(a.fotos.pasta)}" target="_blank" rel="noopener">Ver e baixar as fotos</a>
          <a class="btn" href="${PASTA(a.videos.pasta)}" target="_blank" rel="noopener">Vídeos</a>
          <a class="btn" href="https://wa.me/?text=${encodeURIComponent(textoZap(a))}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
          <button type="button" class="btn" id="evCopiar">Copiar link</button>
        </div>
        <p class="ev-nota" id="evAviso" hidden></p>
        <p class="ev-nota">Para baixar tudo de uma vez: abra a pasta e clique em <b>Baixar</b> (o Drive manda um .zip).</p>
      </div>
      <div class="ev-qr" id="evQr" title="Aponte a câmera do celular"></div>
    </section>
    <div class="ev-amostra">${a.amostra.map(id =>
      `<a href="${FOTO(id)}" target="_blank" rel="noopener"><img src="${MINI(id, 600)}" alt="" loading="lazy"></a>`).join('')}</div>
    <section class="ev-todas">
      <h3>Todas as fotos</h3>
      ${navigator.onLine
        ? `<iframe title="Fotos do evento ${a.ano}" src="https://drive.google.com/embeddedfolderview?id=${a.fotos.pasta}#grid" loading="lazy"></iframe>`
        : '<p class="ev-nota">Sem internet agora — as fotos aparecem quando a conexão voltar.</p>'}
    </section>
  </div>`;

  alvo.querySelectorAll('[data-ano]').forEach(b => b.addEventListener('click', () => {
    anoAtual = Number(b.dataset.ano); abrirEventoCultura(alvo);
  }));
  $('evCopiar').addEventListener('click', async () => {
    const av = $('evAviso');
    try { await navigator.clipboard.writeText(PASTA(a.pasta)); av.textContent = 'Link copiado. É só colar no grupo.'; }
    catch { av.textContent = PASTA(a.pasta); }
    av.hidden = false;
  });
  carregarQrLib().then(qrcode => {
    const q = qrcode(0, 'M'); q.addData(PASTA(a.pasta)); q.make();
    const el = $('evQr'); if (el) el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + '<small>Aponte a câmera</small>';
  }).catch(() => { const el = $('evQr'); if (el) el.hidden = true; });
}
