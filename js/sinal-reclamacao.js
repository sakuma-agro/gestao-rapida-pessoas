// sinal-reclamacao.js — Certificação › Sinalética › QR de reclamação (10/11/2026)
//
// Pedido do Guilherme: "quero que você crie o sinalética dele [do QR de
// reclamação do JotForm], crie uma imagem melhor do QR code, e crie uma
// instrução dele também — não juntar com esse outro QR code [o de Compras],
// fazer independente."
//
// O QR abre o formulário do JotForm "FORMAGR-042 - Formulário reclamação e
// sugestão" (id 243023601071642, conferido em 10/11/2026: anônimo; tipo
// Reclamação/Sugestão/Elogio; local; texto). Cada resposta já entra sozinha
// em Certificação › Reclamações e sugestões (função jotform-feedback).
//
// Três peças, cada uma independente:
//   1. Placa A4 em pé para a parede/quadro de avisos;
//   2. Instrução (uma folha A4, 12/11/2026) — como usar e o que acontece depois;
//   3. Imagem do QR (PNG em alta, para mandar ou pôr em outros materiais).
// Tudo legível em preto e branco (a impressora do escritório é P&B).

import { mostrar } from './jornada-relatorios.js';

export const LINK_FORM = 'https://form.jotform.com/243023601071642';
const GRAFITE = '#1B232B', VERDE = '#84BD00', VERDE_ESC = '#5E8A00', CINZA = '#51534A';

/* ---------------- QR (qrcode-generator, já no vendor/) ---------------- */
let qrLib = null;
function carregarQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLib) qrLib = new Promise((ok, nao) => {
    const s = document.createElement('script');
    s.src = 'vendor/qrcode-generator.js';
    s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; nao(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLib;
}
async function matriz(texto) {
  const qrcode = await carregarQrLib();
  const q = qrcode(0, 'H');           // correção alta: aguenta placa riscada, suja ou plastificada com reflexo
  q.addData(texto); q.make();
  const n = q.getModuleCount();
  return { n, escuro: (y, x) => q.isDark(y, x) };
}
const ehOlho = (n, y, x) => (y < 7 && x < 7) || (y < 7 && x >= n - 7) || (y >= n - 7 && x < 7);

/** QR desenhado à mão em SVG: módulos quadrados (lê melhor) e os três "olhos"
    arredondados, em grafite. `margem` em módulos (mínimo 4 para ler bem). */
async function svgQrBonito(texto, { cor = GRAFITE, margem = 4 } = {}) {
  const { n, escuro } = await matriz(texto);
  const t = n + margem * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (escuro(y, x) && !ehOlho(n, y, x)) d += `M${x + margem} ${y + margem}h1v1h-1z`;
  const olho = (ox, oy) => {
    const X = ox + margem, Y = oy + margem;
    return `<rect x="${X + 0.5}" y="${Y + 0.5}" width="6" height="6" rx="1" fill="none" stroke="${cor}" stroke-width="1"/>
      <rect x="${X + 2}" y="${Y + 2}" width="3" height="3" rx="0.5" fill="${cor}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="QR Code do formulário de reclamação e sugestão">
    <rect width="${t}" height="${t}" fill="#fff"/>
    <path d="${d}" fill="${cor}"/>
    <g shape-rendering="geometricPrecision">${olho(0, 0)}${olho(n - 7, 0)}${olho(0, n - 7)}</g></svg>`;
}

/** PNG grande (para WhatsApp, Canva, outros materiais): QR com moldura, título
    e "100% anônimo". Desenhado no canvas, sem perda. */
async function pngQr(lado = 2000) {
  const { n, escuro } = await matriz(LINK_FORM);
  const margem = 4, mod = Math.floor((lado * 0.78) / (n + margem * 2));
  const qrPx = mod * (n + margem * 2);
  const topo = Math.round(lado * 0.17), base = Math.round(lado * 0.2);
  const W = lado, H = topo + qrPx + base;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // faixa grafite no alto
  g.fillStyle = GRAFITE; g.fillRect(0, 0, W, topo - Math.round(lado * 0.03));
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(lado * 0.06)}px Arial`;
  g.fillText('RECLAMAÇÃO E SUGESTÃO', W / 2, topo * 0.42);
  g.fillStyle = VERDE; g.font = `bold ${Math.round(lado * 0.034)}px Arial`;
  g.fillText('100% ANÔNIMO · NÃO PEDE NOME', W / 2, topo * 0.74);
  // QR
  const ox = Math.round((W - qrPx) / 2), oy = topo;
  g.fillStyle = GRAFITE;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (escuro(y, x) && !ehOlho(n, y, x)) g.fillRect(ox + (x + margem) * mod, oy + (y + margem) * mod, mod, mod);
  const arred = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const X = ox + (cx + margem) * mod, Y = oy + (cy + margem) * mod;
    g.lineWidth = mod; g.strokeStyle = GRAFITE;
    arred(X + mod / 2, Y + mod / 2, mod * 6, mod * 6, mod * 1); g.stroke();
    arred(X + mod * 2, Y + mod * 2, mod * 3, mod * 3, mod * 0.5); g.fill();
  }
  // texto de baixo
  g.fillStyle = GRAFITE; g.font = `bold ${Math.round(lado * 0.04)}px Arial`;
  g.fillText('Aponte a câmera do celular', W / 2, oy + qrPx + base * 0.32);
  g.fillStyle = CINZA; g.font = `${Math.round(lado * 0.03)}px Arial`;
  g.fillText('Reclamação · Sugestão · Elogio — FORM 042', W / 2, oy + qrPx + base * 0.62);
  g.fillStyle = VERDE; g.fillRect(0, H - Math.round(lado * 0.02), W, Math.round(lado * 0.02));
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}

/* ---------------- ícones simples (traço, funcionam em P&B) ---------------- */
const ICONE = {
  reclamacao: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h32v22H22l-9 7v-7H8z"/><path d="M24 15v9"/><circle cx="24" cy="28.5" r="1.2" fill="currentColor"/></svg>`,
  sugestao: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 31c-3-2.5-5-6-5-10a12 12 0 0 1 24 0c0 4-2 7.5-5 10v4H17z"/><path d="M19 40h10"/></svg>`,
  elogio: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v18H8V21z"/><path d="M15 22l7-12c3 0 4.5 2 4 5l-1 5h11c2.5 0 4 2 3.5 4.5l-2.5 11c-.5 2-2 3.5-4 3.5H15"/></svg>`,
  camera: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="5" width="22" height="38" rx="4"/><path d="M20 37h8"/><path d="M18 14h4M18 14v4M30 14h-4M30 14v4M18 28h4M18 28v-4M30 28h-4M30 28v-4"/></svg>`,
  lista: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="7" width="30" height="34" rx="3"/><path d="M16 17l2 2 4-4M26 17h7M16 27l2 2 4-4M26 27h7"/></svg>`,
  enviar: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 23 42 8 30 41l-7-14z"/><path d="M23 27 42 8"/></svg>`,
  cadeado: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="21" width="28" height="20" rx="3"/><path d="M16 21v-6a8 8 0 0 1 16 0v6"/><circle cx="24" cy="31" r="2" fill="currentColor"/></svg>`,
};

/* ---------------- 1. Placa A4 (refeita 12/11/2026) ----------------
   Pedido dele: "vamos melhorar a placa, deixando instrutiva e com o print de quando
   abre o QR Code". Mesmo estilo da placa "Você sabe o que fazer se…" e da instrução:
   logo no branco, faixa grafite, QR grande ao lado do celular com a tela real do
   formulário (img/jotform-042-tela1.jpg) e os 4 passos numerados nas telas.
   Legível em P&B (marcadores com borda grafite). */
export async function htmlPlaca() {
  const qr = await svgQrBonito(LINK_FORM, { margem: 3 });
  const passo = (n, ic, tit, txt) => `<div class="rp-passo"><b class="rp-n">${n}</b><span class="rp-ic">${ic}</span><b class="rp-t">${tit}</b><em>${txt}</em></div>`;
  return `<style>
    .rq-folha{width:210mm;height:296mm;box-sizing:border-box;padding:6mm 11mm 5mm;margin:0 auto;background:#fff;color:${GRAFITE};
      font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;align-items:center;overflow:hidden;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    .rp-logo{height:13mm;margin-bottom:2.5mm}
    .rp-faixa{align-self:stretch;margin:0 -11mm;background:${GRAFITE};border-top:1.4mm solid ${VERDE};border-bottom:1.4mm solid ${VERDE};
      text-align:center;padding:3.5mm 0 4mm;position:relative}
    .rp-faixa::after{content:"";position:absolute;left:50%;bottom:-5.2mm;margin-left:-4mm;border:4mm solid transparent;border-top-color:${VERDE};border-bottom:0}
    .rp-k{color:#fff;font-size:15pt;font-weight:700;letter-spacing:2.6mm}
    .rp-faixa h1{color:${VERDE};font-size:40pt;margin:1mm 0 0;line-height:1;letter-spacing:-.5pt}
    .rp-sub{color:#fff;font-size:12pt;margin-top:1.5mm}
    .rp-selos{display:flex;justify-content:center;gap:2.5mm;margin:7mm 0 0;flex-wrap:nowrap}
    .rp-selo{display:inline-flex;align-items:center;gap:1.6mm;border:.6mm solid ${GRAFITE};border-radius:20mm;padding:1.5mm 3.6mm;font-size:11pt;font-weight:800;white-space:nowrap}
    .rp-selo svg{width:5.8mm;height:5.8mm}
    .rp-selo.v{background:${VERDE};border-color:${VERDE}}
    .rp-meio{display:flex;align-items:center;gap:6mm;margin-top:8mm}
    .rp-qrcol{display:flex;flex-direction:column;align-items:center}
    .rp-qrbox{position:relative;width:96mm;height:96mm;padding:3.5mm;box-sizing:border-box}
    .rp-qrbox svg{width:100%;height:100%;display:block}
    .rp-canto{position:absolute;width:14mm;height:14mm;border:1.6mm solid ${VERDE}}
    .rp-canto.a{top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:5mm}
    .rp-canto.b{top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:5mm}
    .rp-canto.c{bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:5mm}
    .rp-canto.d{bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:5mm}
    .rp-cap{font-size:13pt;font-weight:800;margin-top:2mm;text-align:center}
    .rp-cap small{display:block;font-size:10pt;font-weight:400;color:${CINZA};margin-top:.5mm}
    .rp-seta{font-size:30pt;color:${VERDE_ESC};font-weight:800;margin-bottom:12mm}
    .rp-celcol{display:flex;flex-direction:column;align-items:center}
    .rp-cel{width:52mm;border:1.3mm solid ${GRAFITE};border-radius:6mm;padding:2.6mm 1.8mm 3.2mm;background:${GRAFITE};box-sizing:border-box}
    .rp-fala{display:block;width:10mm;height:1mm;border-radius:1mm;background:#4A535C;margin:0 auto 2mm}
    .rp-tel{position:relative;background:#fff;border-radius:2.6mm}
    .rp-tel img{display:block;width:100%;border-radius:2.6mm}
    .rp-mk{position:absolute;left:-6mm;transform:translateY(-50%);width:8.5mm;height:8.5mm;border-radius:50%;background:${VERDE};color:${GRAFITE};
      font-weight:800;font-size:13pt;display:flex;align-items:center;justify-content:center;border:.6mm solid ${GRAFITE};box-shadow:0 0 0 .7mm #fff}
    .rp-celcol .rp-cap{color:${VERDE_ESC}}
    .rp-h2{align-self:stretch;font-size:13pt;margin:7mm 0 4mm;padding-left:2.5mm;border-left:1.6mm solid ${VERDE};line-height:1.1}
    .rp-passos{align-self:stretch;display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
    .rp-passo{background:#F3F8E6;border-radius:3mm;padding:3mm 2.5mm 3mm;text-align:center;display:flex;flex-direction:column;align-items:center;position:relative}
    .rp-n{position:absolute;top:-3mm;left:-1.5mm;width:8mm;height:8mm;border-radius:50%;background:${VERDE};color:${GRAFITE};border:.6mm solid ${GRAFITE};
      display:flex;align-items:center;justify-content:center;font-size:12pt}
    .rp-ic svg{width:10mm;height:10mm;color:${GRAFITE}}
    .rp-t{font-size:11pt;margin-top:1mm;line-height:1.15}
    .rp-passo em{font-style:normal;font-size:9.3pt;color:${CINZA};margin-top:1mm;line-height:1.25}
    .rp-depois{align-self:stretch;margin-top:4mm;border:.6mm solid ${GRAFITE};border-radius:3mm;padding:2.5mm 4mm;font-size:10.3pt;display:flex;gap:3mm;align-items:center}
    .rp-depois b.i{flex:none;width:9mm;height:9mm;border-radius:50%;background:${GRAFITE};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13pt}
    .rq-pe{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-end;border-top:1.4mm solid ${VERDE};padding-top:2.5mm;font-size:9pt;color:${CINZA}}
    .rq-pe img{height:8.5mm}
    @media print{.rq-folha{margin:0}}
  </style>
  <article class="rq-folha">
    <img class="rp-logo" src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="rp-faixa"><div class="rp-k">SUA OPINIÃO</div><h1>FAZ DIFERENÇA</h1><div class="rp-sub">Reclamações, sugestões e elogios pelo celular</div></div>
    <div class="rp-selos">
      <span class="rp-selo v">${ICONE.cadeado} 100% ANÔNIMO · NÃO PEDE NOME</span>
      <span class="rp-selo">${ICONE.reclamacao} Reclamação</span>
      <span class="rp-selo">${ICONE.sugestao} Sugestão</span>
      <span class="rp-selo">${ICONE.elogio} Elogio</span>
    </div>
    <div class="rp-meio">
      <div class="rp-qrcol">
        <div class="rp-qrbox"><i class="rp-canto a"></i><i class="rp-canto b"></i><i class="rp-canto c"></i><i class="rp-canto d"></i>${qr}</div>
        <div class="rp-cap">Aponte a câmera do celular<small>Serve a câmera, o WhatsApp ou o Google Lens</small></div>
      </div>
      <div class="rp-seta">➜</div>
      <div class="rp-celcol">
        <div class="rp-cel"><span class="rp-fala"></span><div class="rp-tel">
          <img src="img/jotform-042-tela1.jpg" alt="Tela do formulário que abre: tipo de feedback e local">
          <span class="rp-mk" style="top:71.5%">2</span><span class="rp-mk" style="top:91%">3</span></div></div>
        <div class="rp-cap">É isso que abre<br>no seu celular</div>
      </div>
    </div>
    <h2 class="rp-h2">Como enviar, em 4 passos</h2>
    <div class="rp-passos">
      ${passo(1, ICONE.camera, 'Aponte a câmera', 'E toque no link que aparecer na tela')}
      ${passo(2, ICONE.lista, 'Escolha o tipo', 'Reclamação, Sugestão ou Elogio')}
      ${passo(3, ICONE.reclamacao, 'Fazenda e texto', 'Marque a fazenda e conte o que aconteceu: o quê, onde e quando')}
      ${passo(4, ICONE.enviar, 'Toque em Enviar', 'Chega na hora no escritório. Ninguém sabe quem enviou')}
    </div>
    <div class="rp-depois"><b class="i">✓</b><span><b>Depois:</b> o escritório analisa, resolve e dá o retorno a todos no DDS, reunião, quadro ou WhatsApp.
      <b>Emergência ou acidente não é por aqui</b> — avise na hora o encarregado.</span></div>
    <footer class="rq-pe"><span>SAKUMA Agronegócios · FORM 042 — Reclamação e sugestão<br>Sem celular? Fale com o escritório ou use a caixa de sugestões.</span>
      <img src="img/lop-marca.png" alt="LOP"></footer>
  </article>`;
}

/* ---------------- 2. Instrução — uma folha A4 (12/11/2026) ----------------
   Pedido dele: "sobre as instruções, vamos deixar melhor, tamanho de uma folha A4".
   Antes eram 2 páginas (texto + telas do JotForm); agora tudo numa folha, no mesmo
   estilo da placa "Você sabe o que fazer se…": logo no branco, faixa grafite com o
   título, os 4 passos desenhados em cima das telas reais do formulário, o que
   acontece depois, pode enviar × combinados, exemplo de mensagem e o alerta de
   emergência. Continua legível em P&B (marcadores com borda grafite). */
export async function htmlInstrucao() {
  const qr = await svgQrBonito(LINK_FORM, { margem: 3 });
  const leg = (n, tit, txt) => `<div class="ri-leg"><b class="ri-n">${n}</b><span><b>${tit}</b><em>${txt}</em></span></div>`;
  return `<style>
    .ri-folha{width:210mm;height:296mm;overflow:hidden;box-sizing:border-box;padding:6mm 11mm 5mm;margin:0 auto;background:#fff;color:${GRAFITE};
      font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;font-size:10pt;line-height:1.28;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    .ri-logo{height:11mm;align-self:center;margin-bottom:2mm}
    .ri-faixa{margin:0 -11mm;background:${GRAFITE};border-top:1.4mm solid ${VERDE};border-bottom:1.4mm solid ${VERDE};
      text-align:center;padding:3mm 0 3.2mm;position:relative}
    .ri-faixa::after{content:"";position:absolute;left:50%;bottom:-5.2mm;margin-left:-4mm;border:4mm solid transparent;border-top-color:${VERDE};border-bottom:0}
    .ri-k{color:#fff;font-size:12pt;font-weight:700;letter-spacing:2.2mm}
    .ri-faixa h1{color:${VERDE};font-size:27pt;margin:1mm 0 0;line-height:1;letter-spacing:-.3pt}
    .ri-selos{display:flex;justify-content:center;gap:3mm;margin:5.5mm 0 0;flex-wrap:wrap}
    .ri-selo{display:inline-flex;align-items:center;gap:1.8mm;border:.6mm solid ${GRAFITE};border-radius:20mm;padding:1.4mm 4mm;font-size:10.5pt;font-weight:800}
    .ri-selo svg{width:5.5mm;height:5.5mm}
    .ri-selo.v{background:${VERDE};border-color:${VERDE}}
    .ri-h2{font-size:12.5pt;margin:3.5mm 0 2mm;padding-left:2.5mm;border-left:1.6mm solid ${VERDE};line-height:1.1}
    .ri-h2 small{font-weight:400;color:${CINZA};font-size:9.5pt}
    /* passos sobre as telas */
    .ri-passos{display:grid;grid-template-columns:44mm 46mm 1fr;gap:7mm;align-items:start}
    .ri-col{display:flex;flex-direction:column;gap:2.5mm}
    .ri-qr{border:.6mm solid ${GRAFITE};border-radius:3mm;padding:2.5mm;position:relative}
    .ri-qr svg{width:100%;height:auto;display:block}
    .ri-cel{border:1.3mm solid ${GRAFITE};border-radius:5mm;padding:2.4mm 1.6mm 3mm;background:${GRAFITE}}
    .ri-cel .ri-fala{display:block;width:10mm;height:1mm;border-radius:1mm;background:#4A535C;margin:0 auto 2mm}
    .ri-tel{position:relative;background:#fff;border-radius:2.4mm}
    .ri-tel img{display:block;width:100%;border-radius:2.4mm}
    .ri-mk{position:absolute;left:-5.5mm;transform:translateY(-50%);width:8mm;height:8mm;border-radius:50%;background:${VERDE};color:${GRAFITE};
      font-weight:800;font-size:12pt;display:flex;align-items:center;justify-content:center;border:.6mm solid ${GRAFITE};box-shadow:0 0 0 .7mm #fff}
    .ri-qr .ri-mk{top:2mm;left:-4.5mm;transform:none}
    .ri-leg{display:grid;grid-template-columns:7.5mm 1fr;gap:2mm;align-items:start}
    .ri-n{width:7mm;height:7mm;border-radius:50%;background:${VERDE};color:${GRAFITE};border:.5mm solid ${GRAFITE};display:flex;align-items:center;justify-content:center;font-size:11pt}
    .ri-leg span b{display:block;font-size:10.5pt}
    .ri-leg em{display:block;font-style:normal;color:${CINZA};font-size:9.3pt;margin-top:.4mm}
    .ri-ex{display:grid;grid-template-columns:1fr 2fr;gap:4mm;margin-top:2.5mm}
    .ri-ex div{border:.4mm solid #C9CBC2;border-radius:2mm;padding:1.8mm 3mm;font-size:9.3pt;display:flex;flex-direction:column;justify-content:center}
    .ri-ex .bom{border:.7mm solid ${VERDE_ESC}}
    .ri-ex b{display:flex;align-items:center;gap:1.5mm;font-size:9.5pt}
    .ri-ex i{display:block;font-style:normal;margin-top:.6mm;color:${GRAFITE}}
    /* depois */
    .ri-fluxo{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
    .ri-etapa{background:#F3F8E6;border-radius:2.5mm;padding:1.8mm 2.5mm;font-size:9.2pt;position:relative;color:${CINZA}}
    .ri-etapa b{display:block;font-size:10.5pt;color:${GRAFITE};margin-bottom:.6mm}
    .ri-etapa:not(:last-child)::after{content:"›";position:absolute;right:-2.9mm;top:50%;transform:translateY(-50%);font-size:16pt;color:${VERDE_ESC};font-weight:800}
    .ri-duas{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:3mm}
    .ri-caixa{border:.4mm solid #C9CBC2;border-radius:2.5mm;padding:2.5mm 3.5mm;font-size:9.5pt}
    .ri-caixa > b{display:block;font-size:10.5pt;margin-bottom:1mm}
    .ri-caixa ul{margin:0;padding:0;list-style:none}
    .ri-caixa li{padding-left:5mm;position:relative;margin:.4mm 0}
    .ri-caixa li::before{content:"✓";position:absolute;left:0;color:${VERDE_ESC};font-weight:800}
    .ri-caixa.c li::before{content:"•";color:${GRAFITE}}
    .ri-alerta{margin-top:3mm;border:.8mm solid ${GRAFITE};border-radius:2.5mm;padding:2.5mm 3.5mm;font-size:9.8pt;display:flex;gap:3mm;align-items:center}
    .ri-alerta .x{flex:none;width:9mm;height:9mm;border-radius:50%;background:${GRAFITE};color:#fff;font-weight:800;font-size:14pt;display:flex;align-items:center;justify-content:center}
    .ri-pe{margin-top:auto;padding-top:3mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:8.8pt;color:${CINZA};border-top:.4mm solid #E0E1DA}
    .ri-pe img{height:8mm}
    @media print{.ri-folha{margin:0}}
  </style>
  <article class="ri-folha">
    <img class="ri-logo" src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <div class="ri-faixa"><div class="ri-k">COMO USAR O QR CODE DE</div><h1>RECLAMAÇÃO E SUGESTÃO</h1></div>
    <div class="ri-selos">
      <span class="ri-selo v">${ICONE.cadeado} 100% ANÔNIMO · NÃO PEDE NOME</span>
      <span class="ri-selo">${ICONE.reclamacao} Reclamação</span>
      <span class="ri-selo">${ICONE.sugestao} Sugestão</span>
      <span class="ri-selo">${ICONE.elogio} Elogio</span>
    </div>

    <h2 class="ri-h2">Em 4 passos, pelo celular <small>· leva menos de 2 minutos</small></h2>
    <div class="ri-passos">
      <div class="ri-col">
        <div class="ri-qr"><span class="ri-mk">1</span>${qr}</div>
        ${leg(1, 'Aponte a câmera', 'Para este QR ou o da placa e toque no link que aparecer.')}
      </div>
      <div class="ri-col">
        <div class="ri-cel"><span class="ri-fala"></span><div class="ri-tel">
          <img src="img/jotform-042-tela1.jpg" alt="Início do formulário: tipo de feedback e local">
          <span class="ri-mk" style="top:71.5%">2</span><span class="ri-mk" style="top:91%">2</span></div></div>
        ${leg(2, 'Tipo e fazenda', 'Reclamação, Sugestão ou Elogio e a fazenda onde aconteceu.')}
      </div>
      <div class="ri-col">
        <div class="ri-cel"><span class="ri-fala"></span><div class="ri-tel">
          <img src="img/jotform-042-tela2.jpg" alt="Final do formulário: campo para escrever e botão Enviar">
          <span class="ri-mk" style="top:36%">3</span><span class="ri-mk" style="top:80%">4</span></div></div>
        ${leg(3, 'Escreva o que aconteceu', 'O quê, onde e quando — e, se tiver, uma ideia para resolver.')}
        ${leg(4, 'Toque em Enviar', 'Chega na hora no escritório. Não precisa avisar ninguém.')}
      </div>
    </div>
    <div class="ri-ex">
      <div><b>✗ Ajuda pouco</b><i>"O banheiro está ruim."</i></div>
      <div class="bom"><b>✓ Ajuda a resolver</b><i>"Banheiro do alojamento da Faca: a descarga do 2º vaso vaza desde segunda e falta papel toalha."</i></div>
    </div>

    <h2 class="ri-h2">O que acontece depois</h2>
    <div class="ri-fluxo">
      <div class="ri-etapa"><b>1 · Recebido</b>Cai no sistema do escritório no mesmo instante.</div>
      <div class="ri-etapa"><b>2 · Analisado</b>O responsável define o que fazer e o prazo.</div>
      <div class="ri-etapa"><b>3 · Resolvido</b>A ação é feita e registrada no FORM 042.</div>
      <div class="ri-etapa"><b>4 · Devolutiva</b>Retorno a todos no DDS, reunião, quadro ou WhatsApp.</div>
    </div>

    <div class="ri-duas">
      <div class="ri-caixa"><b>Pode e deve enviar</b><ul>
        <li>Segurança, EPI ou máquina com problema</li><li>Alojamento, banheiro, refeitório e água</li>
        <li>Transporte, refeição e horários</li><li>Ideias para melhorar o trabalho</li><li>Elogios a colegas e equipes</li></ul></div>
      <div class="ri-caixa c"><b>Combinados</b><ul>
        <li>Respeito: critique a situação, não a pessoa</li><li>Não escreva nome, CPF ou telefone de ninguém</li>
        <li>Um assunto por envio</li><li>Pode enviar quantas vezes quiser</li>
        <li>Sem celular? Fale com o escritório ou use a caixa de sugestões</li></ul></div>
    </div>

    <div class="ri-alerta"><span class="x">!</span><span><b>Emergência ou acidente não é pelo QR Code.</b> Avise na hora o encarregado
      ou o técnico de segurança e siga o plano de emergência da fazenda.</span></div>

    <footer class="ri-pe"><span>SAKUMA Agronegócios · FORM 042 — Reclamação e sugestão</span><img src="img/lop-marca.png" alt="LOP"></footer>
  </article>`;
}

/* ---------------- a tela ---------------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function desenharReclamacaoQr(el) {
  el.innerHTML = `<div class="rq-tela">
    <div class="rq-tcab"><h2>QR de reclamação e sugestão</h2>
      <p>O QR abre o formulário anônimo do JotForm (FORM 042). As respostas já entram sozinhas em Certificação › Reclamações e sugestões.
        Independente do QR de Compras.</p></div>
    <div class="rq-cards">
      <section class="rq-card"><div class="rq-prev" id="rqPrevPlaca"></div>
        <h3>Placa A4</h3><p>Para a parede e o quadro de avisos: QR grande, a tela que abre no celular e os 4 passos. Lê bem em preto e branco; plastificar ajuda.</p>
        <button type="button" class="btn principal" data-rq="placa">Ver e imprimir a placa</button></section>
      <section class="rq-card"><div class="rq-prev rq-prev-ins" id="rqPrevIns"></div>
        <h3>Instrução</h3><p>Uma folha A4: os 4 passos com as telas do formulário, o que acontece depois e os combinados. Para DDS e integração.</p>
        <button type="button" class="btn principal" data-rq="instrucao">Ver e imprimir a instrução</button></section>
      <section class="rq-card"><div class="rq-prev rq-prev-img"><img id="rqImg" alt="QR Code de reclamação e sugestão"></div>
        <h3>Imagem do QR</h3><p>PNG em alta qualidade para mandar no WhatsApp ou usar em outros materiais.</p>
        <div class="rq-bts"><button type="button" class="btn" data-rq="baixar">Baixar imagem</button>
          <button type="button" class="btn" data-rq="zap">Enviar pelo WhatsApp</button></div></section>
    </div>
    <p class="rq-link">Endereço do formulário: <a href="${LINK_FORM}" target="_blank" rel="noopener">${esc(LINK_FORM)}</a></p>
  </div>`;
  // miniaturas
  try {
    const png = await pngQr(700);
    el.querySelector('#rqImg').src = URL.createObjectURL(png);
    el.querySelector('#rqPrevPlaca').innerHTML = `<div class="rq-mini">${await svgQrBonito(LINK_FORM)}<b>SUA OPINIÃO FAZ DIFERENÇA</b><small>100% anônimo</small></div>`;
    el.querySelector('#rqPrevIns').innerHTML = `<div class="rq-mini rq-mini-ins"><b>Como usar o QR Code</b><i></i><i></i><i></i><i></i><small>Passo a passo · depois · combinados</small></div>`;
  } catch { /* sem a biblioteca: os botões continuam */ }

  el.querySelectorAll('[data-rq]').forEach(b => b.addEventListener('click', async () => {
    const q = b.dataset.rq;
    try {
      if (q === 'placa') mostrar(await htmlPlaca(), { barra: true });
      else if (q === 'instrucao') mostrar(await htmlInstrucao(), { barra: true });
      else if (q === 'baixar') {
        const png = await pngQr(2000);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(png); a.download = 'QR - Reclamação e sugestão (FORM 042).png';
        document.body.appendChild(a); a.click(); a.remove();
      } else if (q === 'zap') {
        const texto = `*Reclamação, sugestão ou elogio — SAKUMA*\nÉ 100% anônimo, não pede nome. Toque no link, escolha o tipo e a fazenda, escreva e envie:\n${LINK_FORM}`;
        const png = await pngQr(1200);
        const arq = png && new File([png], 'QR - Reclamação e sugestão.png', { type: 'image/png' });
        if (arq && navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], text: texto }); return; }
        window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') alert('Não deu para montar agora. Tente de novo.');
    }
  }));
}
