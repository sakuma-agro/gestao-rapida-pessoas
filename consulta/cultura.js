// Manual de Cultura na consulta por QR (10/11/2026). Pedido do Guilherme: "crie um somente do manual de cultura,
// valorizando os valores da fazenda" e depois "coloque a versão original, com fotos de fundo". Por isso a página
// mostra as próprias páginas do manual oficial ("Manual de Cultura - Sakuma Oficial.pdf", 207 MB, OneDrive
// 6 - Certificações › 3 - ANEXOS › AN 54 e AN 15), convertidas em imagens leves (cultura/pNN.v1.jpg, 1240 px,
// 26 páginas — a 2 e a 28 são em branco) e um PDF leve para baixar (cultura/Manual-de-Cultura-SAKUMA.pdf).
// Trocar o manual: gerar de novo as imagens e o PDF a partir do original e subir o ".v1" para ".v2".
const PAGINAS = 26, V = 'v1';
const PARTES = [
  ['Boas-vindas', 3], ['Nossa história', 4], ['Linha do tempo', 7], ['Hoje e fazendas', 8], ['Nossa marca', 10],
  ['Missão, visão e valores', 11], ['Responsabilidade', 12], ['Melhoria contínua', 13], ['Respeito', 14],
  ['Eficiência', 15], ['Honestidade', 16], ['Nosso jeito Sakuma', 17], ['Antes de decidir', 18],
  ['O que esperamos', 19], ['O que não aceitamos', 20], ['Condutas que não toleramos', 21], ['Ferramentas Lean', 22],
  ['Anomalia', 23], ['Ciclo PDCA', 24], ['Nosso time', 25], ['O futuro continua', 26],
];
const dois = n => String(n).padStart(2, '0');

export function htmlCultura() {
  const pags = Array.from({ length: PAGINAS }, (_, i) => i + 1).map(n => `
    <figure class="mc-pag" id="mc-p${dois(n)}">
      <a href="cultura/p${dois(n)}.${V}.jpg" target="_blank" rel="noopener" aria-label="Abrir a página ${n} em tela cheia">
        <img src="cultura/p${dois(n)}.${V}.jpg" width="1240" height="1771" ${n > 2 ? 'loading="lazy" decoding="async"' : ''} alt="Manual de Cultura – página ${n}">
      </a>
      <figcaption>${n} / ${PAGINAS}</figcaption>
    </figure>`).join('');
  return `<article class="mc">
    <header class="mc-hero">
      <small>SAKUMA Agronegócios</small>
      <h1>Somos Sakuma.<br>Cultivamos valores.<br>Colhemos o futuro.</h1>
      <p>O manual completo, página por página. Toque numa página para ver em tela cheia e ampliar com os dedos.</p>
    </header>
    <nav class="mc-ir" aria-label="Ir para">
      ${PARTES.map(([t, p]) => `<a href="#mc-p${dois(p)}">${t}</a>`).join('')}
    </nav>
    <div class="mc-pags">${pags}</div>
    <a class="cq-acao mc-baixar" href="cultura/Manual-de-Cultura-SAKUMA.pdf" target="_blank" rel="noopener">Baixar o manual completo (PDF)</a>
    <footer class="mc-fim"><h2>Bem-vindo à família Sakuma.</h2><p>Aqui, cada pessoa faz a diferença.</p></footer>
  </article>`;
}
