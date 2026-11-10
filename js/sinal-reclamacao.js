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
//   2. Instrução (A4) — como usar e o que acontece depois;
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

/* ---------------- 1. Placa A4 ---------------- */
async function htmlPlaca() {
  const qr = await svgQrBonito(LINK_FORM);
  return `<style>
    .rq-folha{width:210mm;height:296mm;box-sizing:border-box;padding:10mm 14mm 8mm;margin:0 auto;background:#fff;color:${GRAFITE};
      font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;align-items:center;page-break-after:always;break-after:page;overflow:hidden}
    .rq-folha:last-child{page-break-after:auto;break-after:auto}
    .rq-logo{height:17mm;margin-bottom:3mm}
    .rq-h1{font-size:30pt;font-weight:800;margin:0;letter-spacing:-.5pt;text-align:center;line-height:1.05}
    .rq-sub{font-size:14pt;margin:2mm 0 0;color:${CINZA};text-align:center}
    .rq-anon{display:inline-flex;align-items:center;gap:2.5mm;margin:4mm 0 4mm;padding:2.5mm 6mm;border:.7mm solid ${GRAFITE};border-radius:20mm;font-size:14pt;font-weight:800}
    .rq-anon svg{width:7mm;height:7mm}
    .rq-qrbox{position:relative;width:108mm;height:108mm;padding:3.5mm}
    .rq-qrbox svg{width:100%;height:100%;display:block}
    .rq-canto{position:absolute;width:14mm;height:14mm;border:1.6mm solid ${VERDE}}
    .rq-canto.a{top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:5mm}
    .rq-canto.b{top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:5mm}
    .rq-canto.c{bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:5mm}
    .rq-canto.d{bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:5mm}
    .rq-aponte{font-size:16pt;font-weight:800;margin:3mm 0 4mm}
    .rq-tipos{display:flex;gap:9mm;margin-bottom:5mm}
    .rq-tipo{display:flex;flex-direction:column;align-items:center;gap:1.5mm;font-size:12pt;font-weight:700}
    .rq-tipo span{width:16mm;height:16mm;border-radius:50%;border:.6mm solid ${GRAFITE};display:flex;align-items:center;justify-content:center}
    .rq-tipo svg{width:10mm;height:10mm}
    .rq-passos{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;width:100%}
    .rq-passo{border:.4mm solid #C9CBC2;border-radius:3mm;padding:3.5mm 3mm;text-align:center;font-size:11.5pt;line-height:1.3}
    .rq-passo b{display:flex;align-items:center;justify-content:center;width:8mm;height:8mm;margin:0 auto 2mm;border-radius:50%;background:${GRAFITE};color:#fff;font-size:12pt}
    .rq-pe{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-end;border-top:1.4mm solid ${VERDE};padding-top:3mm;font-size:9.5pt;color:${CINZA}}
    .rq-pe img{height:9mm}
    @media print{.rq-folha{margin:0}}
  </style>
  <article class="rq-folha">
    <img class="rq-logo" src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
    <h1 class="rq-h1">SUA OPINIÃO<br>FAZ DIFERENÇA</h1>
    <p class="rq-sub">Reclamações, sugestões e elogios</p>
    <div class="rq-anon">${ICONE.cadeado} 100% ANÔNIMO — NÃO PEDE NOME</div>
    <div class="rq-qrbox"><i class="rq-canto a"></i><i class="rq-canto b"></i><i class="rq-canto c"></i><i class="rq-canto d"></i>${qr}</div>
    <div class="rq-aponte">Aponte a câmera do celular</div>
    <div class="rq-tipos">
      <div class="rq-tipo"><span>${ICONE.reclamacao}</span>Reclamação</div>
      <div class="rq-tipo"><span>${ICONE.sugestao}</span>Sugestão</div>
      <div class="rq-tipo"><span>${ICONE.elogio}</span>Elogio</div>
    </div>
    <div class="rq-passos">
      <div class="rq-passo"><b>1</b>Aponte a câmera e toque no link que aparecer</div>
      <div class="rq-passo"><b>2</b>Escolha o tipo e a fazenda</div>
      <div class="rq-passo"><b>3</b>Escreva o que aconteceu e toque em <strong>Enviar</strong></div>
    </div>
    <footer class="rq-pe"><span>FORM 042 · Reclamação e sugestão<br>Sem celular? Fale com o escritório ou use a caixa de sugestões.</span>
      <img src="img/lop-marca.png" alt="LOP"></footer>
  </article>`;
}

/* ---------------- 2. Instrução A4 ---------------- */
async function htmlInstrucao() {
  const qr = await svgQrBonito(LINK_FORM, { margem: 3 });
  const passo = (n, ic, tit, txt) => `<div class="ri-passo"><div class="ri-n">${n}</div><div class="ri-ic">${ic}</div>
    <div><b>${tit}</b><p>${txt}</p></div></div>`;
  return `<style>
    .ri-folha{width:210mm;height:296mm;overflow:hidden;box-sizing:border-box;padding:9mm 13mm 7mm;margin:0 auto;background:#fff;color:${GRAFITE};
      font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;font-size:10pt;line-height:1.32}
    .ri-cab{display:flex;align-items:center;gap:6mm;border-bottom:1.4mm solid ${VERDE};padding-bottom:4mm}
    .ri-cab img{height:13mm}
    .ri-cab h1{font-size:17pt;margin:0;line-height:1.15}
    .ri-cab small{display:block;font-size:10.5pt;color:${CINZA};font-weight:400;margin-top:1mm}
    .ri-topo{display:grid;grid-template-columns:1fr 40mm;gap:6mm;margin:4mm 0 0;align-items:center}
    .ri-topo p{margin:0 0 1.8mm}
    .ri-qr{text-align:center;font-size:9pt;color:${CINZA}}
    .ri-qr svg{width:40mm;height:40mm;display:block;border:.4mm solid #C9CBC2;border-radius:2mm}
    .ri-h2{font-size:12pt;margin:4mm 0 2mm;padding-left:3mm;border-left:1.6mm solid ${VERDE}}
    .ri-passo{display:grid;grid-template-columns:9mm 11mm 1fr;gap:3mm;align-items:center;padding:1.6mm 0;border-bottom:.3mm solid #E0E1DA}
    .ri-passo p{margin:.5mm 0 0;color:${CINZA}}
    .ri-n{width:8mm;height:8mm;border-radius:50%;background:${GRAFITE};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
    .ri-ic svg{width:10mm;height:10mm;color:${GRAFITE}}
    .ri-fluxo{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm}
    .ri-etapa{border:.4mm solid #C9CBC2;border-radius:2.5mm;padding:2.5mm 2.5mm;font-size:9.5pt;position:relative}
    .ri-etapa b{display:block;font-size:10.5pt;margin-bottom:1mm}
    .ri-etapa:not(:last-child)::after{content:"›";position:absolute;right:-2.6mm;top:50%;transform:translateY(-50%);font-size:16pt;color:${VERDE_ESC};font-weight:800}
    .ri-duas{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
    .ri-caixa{border:.4mm solid #C9CBC2;border-radius:2.5mm;padding:3mm 4mm}
    .ri-caixa ul{margin:1.5mm 0 0;padding-left:5mm}
    .ri-caixa li{margin:.6mm 0}
    .ri-alerta{margin-top:4mm;border:.7mm solid ${GRAFITE};border-radius:2.5mm;padding:3mm 4mm;font-size:10.5pt}
    .ri-pe{margin-top:auto;padding-top:4mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:9pt;color:${CINZA}}
    .ri-pe img{height:8mm}
    .ri-folha{page-break-after:always;break-after:page}
    .ri-folha:last-of-type{page-break-after:auto;break-after:auto}
    /* página 2: o formulário como aparece no celular (prints de 10/11/2026) */
    .ri-telas{display:grid;grid-template-columns:1fr 1fr;gap:9mm;margin-top:4mm;align-items:start}
    .ri-cel{border:1.6mm solid ${GRAFITE};border-radius:7mm;padding:3mm 2mm 4mm;background:${GRAFITE}}
    .ri-cel .ri-tel{position:relative;border-radius:3mm;overflow:visible;background:#fff}
    .ri-cel .ri-tel img{border-radius:3mm}
    .ri-cel img{display:block;width:100%}
    .ri-cel .ri-fala{display:block;width:12mm;height:1.2mm;border-radius:1mm;background:#4A535C;margin:0 auto 2.5mm}
    .ri-mk{position:absolute;left:-7mm;display:flex;align-items:center;gap:1.5mm;transform:translateY(-50%)}
    .ri-mk b{width:8.5mm;height:8.5mm;border-radius:50%;background:${VERDE};color:${GRAFITE};font-size:13pt;display:flex;align-items:center;justify-content:center;
      border:.7mm solid ${GRAFITE};box-shadow:0 0 0 .8mm #fff}
    .ri-leg{display:flex;flex-direction:column;gap:3mm}
    .ri-leg > div:not(.ri-cel){display:grid;grid-template-columns:9mm 1fr;gap:2.5mm;align-items:start;font-size:10.5pt}
    .ri-leg b.n{width:8mm;height:8mm;border-radius:50%;background:${VERDE};color:${GRAFITE};border:.6mm solid ${GRAFITE};display:flex;align-items:center;justify-content:center;font-size:12pt}
    .ri-leg p{margin:.5mm 0 0;color:${CINZA}}
    .ri-ex{margin-top:5mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
    .ri-ex div{border:.4mm solid #C9CBC2;border-radius:2.5mm;padding:3mm 4mm;font-size:10pt}
    .ri-ex .bom{border-color:${VERDE_ESC};border-width:.7mm}
    .ri-ex i{display:block;margin-top:1.5mm;font-style:normal;background:#F2F2EE;border-radius:1.5mm;padding:2mm 3mm}
  </style>
  <article class="ri-folha">
    <header class="ri-cab"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <h1>Como usar o QR Code de reclamação e sugestão<small>Instrução para os colaboradores · FORM 042</small></h1></header>
    <div class="ri-topo">
      <div>
        <p><b>Para que serve:</b> é o canal para você contar o que está ruim, dar uma ideia ou elogiar — sobre o trabalho,
          segurança, alojamento, refeição, transporte, ferramentas, EPIs ou o jeito como as coisas são feitas.</p>
        <p><b>É anônimo:</b> o formulário não pede nome, telefone nem e-mail. Ninguém fica sabendo quem enviou.</p>
        <p><b>Onde fica:</b> nas placas com este QR Code e no quadro de avisos de cada fazenda.</p>
      </div>
      <div class="ri-qr">${qr}Aponte a câmera aqui</div>
    </div>

    <h2 class="ri-h2">Passo a passo</h2>
    ${passo(1, ICONE.camera, 'Abra a câmera do celular', 'Aponte para o QR Code e espere aparecer o link na tela. Toque nele. (Funciona com a câmera ou com o leitor de QR do WhatsApp/Google Lens.)')}
    ${passo(2, ICONE.lista, 'Escolha o tipo e a fazenda', 'Marque Reclamação, Sugestão ou Elogio e escolha a fazenda: Faca, Lote 35, Três Riachos, Morro Branco ou Quebra Cocão.')}
    ${passo(3, ICONE.reclamacao, 'Escreva o que aconteceu', 'Conte com detalhes: o que foi, onde, quando e, se tiver, uma ideia de como resolver. Quanto mais claro, mais rápido resolve.')}
    ${passo(4, ICONE.enviar, 'Toque em Enviar', 'Pronto: a mensagem chega na hora para o escritório. Não precisa avisar ninguém.')}

    <h2 class="ri-h2">O que acontece depois</h2>
    <div class="ri-fluxo">
      <div class="ri-etapa"><b>Recebido</b>Chega no sistema do escritório no mesmo instante.</div>
      <div class="ri-etapa"><b>Analisado</b>O responsável avalia e define o que fazer e o prazo.</div>
      <div class="ri-etapa"><b>Resolvido</b>A ação é feita e registrada no FORM 042.</div>
      <div class="ri-etapa"><b>Devolutiva</b>O retorno é dado a todos: DDS, reunião, quadro de avisos ou WhatsApp.</div>
    </div>

    <div class="ri-duas" style="margin-top:4mm">
      <div class="ri-caixa"><b>Pode e deve enviar</b><ul>
        <li>Problemas de segurança, EPI ou máquina</li><li>Condições do alojamento, banheiro, refeitório e água</li>
        <li>Transporte, refeição e horários</li><li>Ideias para melhorar o trabalho</li><li>Elogios a colegas e equipes</li></ul></div>
      <div class="ri-caixa"><b>Combinados</b><ul>
        <li>Fale com respeito — critique a situação, não a pessoa</li><li>Não escreva nome, CPF ou telefone de ninguém</li>
        <li>Um assunto por envio facilita a solução</li><li>Pode enviar quantas vezes quiser</li></ul></div>
    </div>

    <div class="ri-alerta"><b>Emergência ou acidente não é pelo QR Code.</b> Avise na hora o encarregado ou o técnico de
      segurança e siga o plano de emergência da fazenda. Sem celular? Fale com o escritório ou use a caixa de sugestões.</div>

    <footer class="ri-pe"><span>SAKUMA Agronegócios · FORM 042 — Reclamação e sugestão</span><img src="img/lop-marca.png" alt="LOP"></footer>
  </article>
  <article class="ri-folha">
    <header class="ri-cab"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <h1>Veja como é o formulário no celular<small>É esta tela que abre quando você aponta a câmera para o QR Code · FORM 042</small></h1></header>
    <div class="ri-telas">
      <div class="ri-cel"><span class="ri-fala"></span><div class="ri-tel">
        <img src="img/jotform-042-tela1.jpg" alt="Início do formulário: título, tipo de feedback e local">
        <span class="ri-mk" style="top:71.5%"><b>1</b></span>
        <span class="ri-mk" style="top:91%"><b>2</b></span></div></div>
      <div class="ri-leg">
        <div><b class="n">1</b><span><b>Tipo de feedback</b><p>Toque em RECLAMAÇÃO, SUGESTÃO ou ELOGIO.</p></span></div>
        <div><b class="n">2</b><span><b>Local</b><p>Toque na fazenda onde aconteceu: Faca, Lote 35, Três Riachos, Morro Branco ou Quebra Cocão.</p></span></div>
        <div class="ri-cel" style="display:block;margin-top:3mm"><span class="ri-fala"></span><div class="ri-tel">
          <img src="img/jotform-042-tela2.jpg" alt="Final do formulário: campo para escrever e botão Enviar">
          <span class="ri-mk" style="top:36%"><b>3</b></span>
          <span class="ri-mk" style="top:80%"><b>4</b></span></div></div>
        <div><b class="n">3</b><span><b>Descreva seu feedback</b><p>Escreva o que aconteceu. É o único campo obrigatório. Role a tela para baixo se não aparecer.</p></span></div>
        <div><b class="n">4</b><span><b>Enviar</b><p>Toque no botão verde Enviar. A tela muda confirmando o envio: pronto, chegou no escritório.</p></span></div>
      </div>
    </div>
    <div class="ri-alerta" style="margin-top:5mm"><b>O topo diz "É totalmente anônimo!"</b> — o formulário não tem campo de nome nem de telefone. Ninguém sabe quem enviou.</div>
    <div class="ri-ex">
      <div><b>Mensagem que ajuda pouco</b><i>"O banheiro está ruim."</i></div>
      <div class="bom"><b>Mensagem que ajuda a resolver</b><i>"Banheiro do alojamento da Faca: a descarga do 2º vaso está vazando desde segunda e falta papel toalha."</i></div>
    </div>
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
        <h3>Placa A4</h3><p>Para a parede e o quadro de avisos de cada fazenda. Lê bem em preto e branco; plastificar ajuda.</p>
        <button type="button" class="btn principal" data-rq="placa">Ver e imprimir a placa</button></section>
      <section class="rq-card"><div class="rq-prev rq-prev-ins" id="rqPrevIns"></div>
        <h3>Instrução</h3><p>Como usar, o que pode enviar, o que acontece depois e os combinados. Para DDS e integração.</p>
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
