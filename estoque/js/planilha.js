// planilha.js — lê uma planilha .xlsx/.xlsm dentro do próprio navegador.
// Sem biblioteca nenhuma: um .xlsx é um ZIP com
// arquivos XML, e o Chrome já sabe descompactar (DecompressionStream) e ler XML
// (DOMParser). Assim não entra mais nada na pasta vendor.

/* ---------------- ZIP ---------------- */
async function inflar(bruto, metodo) {
  if (metodo === 0) return bruto;                       // guardado sem compressão
  const fluxo = new Blob([bruto]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

function abrirZip(buffer) {
  const dv = new DataView(buffer), u8 = new Uint8Array(buffer), td = new TextDecoder();
  let fim = -1;
  for (let i = buffer.byteLength - 22; i >= 0 && i > buffer.byteLength - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('Este arquivo não parece uma planilha .xlsx.');
  const qtd = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const itens = new Map();
  for (let i = 0; i < qtd; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const compTam = dv.getUint32(p + 20, true);
    const nomeTam = dv.getUint16(p + 28, true);
    const extraTam = dv.getUint16(p + 30, true);
    const comTam = dv.getUint16(p + 32, true);
    const desloc = dv.getUint32(p + 42, true);
    itens.set(td.decode(u8.subarray(p + 46, p + 46 + nomeTam)), { metodo, compTam, desloc });
    p += 46 + nomeTam + extraTam + comTam;
  }
  return { dv, u8, itens };
}

async function texto(zip, caminho) {
  const it = zip.itens.get(caminho.replace(/^\//, ''));
  if (!it) return null;
  const h = it.desloc;
  const ini = h + 30 + zip.dv.getUint16(h + 26, true) + zip.dv.getUint16(h + 28, true);
  const dados = await inflar(zip.u8.subarray(ini, ini + it.compTam), it.metodo);
  return new TextDecoder().decode(dados);
}

/* ---------------- planilha ---------------- */
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const atributo = (el, local) => {
  for (const a of el.attributes) if (a.name === local || a.name.endsWith(':' + local)) return a.value;
  return null;
};
const colunaDe = ref => {
  let n = 0;
  for (const c of (ref.match(/^[A-Z]+/) || [''])[0]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

export const semAcento = s => String(s == null ? '' : s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase();

/** Lê uma aba pelo nome e devolve uma matriz de linhas. */
export async function lerAba(arquivo, nomeAba) {
  const zip = abrirZip(await arquivo.arrayBuffer());
  const livro = xml(await texto(zip, 'xl/workbook.xml'));
  const relacoes = xml(await texto(zip, 'xl/_rels/workbook.xml.rels'));

  const aba = [...livro.getElementsByTagName('sheet')]
    .find(s => semAcento(s.getAttribute('name')) === semAcento(nomeAba));
  if (!aba) throw new Error(`A planilha não tem a aba "${nomeAba}".`);
  const rid = atributo(aba, 'id');
  const rel = [...relacoes.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
  const alvo = (rel.getAttribute('Target') || '').replace(/^\//, '').replace(/^xl\//, '');

  // textos compartilhados
  const ssTexto = await texto(zip, 'xl/sharedStrings.xml');
  const compart = ssTexto
    ? [...xml(ssTexto).getElementsByTagName('si')]
        .map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
    : [];

  const folha = xml(await texto(zip, 'xl/' + alvo));
  const linhas = [];
  for (const tr of folha.getElementsByTagName('row')) {
    const n = parseInt(tr.getAttribute('r'), 10) - 1;
    const linha = [];
    for (const c of tr.getElementsByTagName('c')) {
      const tipo = c.getAttribute('t');
      let valor = null;
      if (tipo === 'inlineStr') {
        valor = [...c.getElementsByTagName('t')].map(t => t.textContent).join('');
      } else {
        const v = c.getElementsByTagName('v')[0];
        if (v) {
          const cru = v.textContent;
          if (tipo === 's') valor = compart[+cru] ?? '';
          else if (tipo === 'b') valor = cru === '1';
          else if (tipo === 'str' || tipo === 'e') valor = cru;
          else valor = +cru;
        }
      }
      linha[colunaDe(c.getAttribute('r') || '')] = valor;
    }
    linhas[n] = linha;
  }
  return linhas;
}


/** Os nomes das abas, na ordem em que estão no arquivo. */
export async function listarAbas(arquivo) {
  const zip = abrirZip(await arquivo.arrayBuffer());
  const livro = xml(await texto(zip, 'xl/workbook.xml'));
  return [...livro.getElementsByTagName('sheet')].map(s => s.getAttribute('name'));
}
