// consulta-nrs — lê no portal do Ministério do Trabalho e Emprego (gov.br) a lista
// das Normas Regulamentadoras vigentes e a página de cada uma, e devolve em JSON:
// título, página, texto oficial em PDF, data "Atualizado em" e as portarias.
//
// Mesmo motivo da consulta-ca: o app roda no github.io e o navegador não deixa
// ler outro site direto. Quem lê o gov.br é esta função; o app só recebe o
// resultado limpo e grava em public.sst_nrs_portal (SST › NRs, 29/10/2026).
//
// Entrada:  POST {}            (ou { nrs: [1, 31] } para conferir só algumas)
// Saída:    { nrs: [ { nr, titulo, pagina, texto_pdf, atualizado_portal, ... } ], conferido_em }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LISTA = 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes';
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ent = (s: string) => s
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const texto = (html: string) => ent(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

async function ler(url: string): Promise<string> {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': NAVEGADOR, 'Accept': 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });
  if (!r.ok) throw new Error(`portal respondeu ${r.status}`);
  return await r.text();
}

/** Só o miolo da página (sem menu, rodapé e botões de compartilhar). */
function miolo(html: string): string {
  const i = html.indexOf('id="content"');
  const f = html.lastIndexOf('viewlet-below-content');   // a última; há uma logo no começo do miolo
  return html.slice(i >= 0 ? i : 0, f > i ? f : html.length);
}

type Link = { href: string; txt: string };
function links(html: string): Link[] {
  const saida: Link[] = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) saida.push({ href: ent(m[1]).trim(), txt: texto(m[2]) });
  return saida;
}

const numeroDaPagina = (href: string) =>
  Number((/(?:norma-regulamentadora-no-\d+-)?nr-(\d+)\/?$/i.exec(href.replace(/[?#].*$/, '')) || [])[1] || NaN);

const anoDe = (s: string) => Math.max(0, ...(s.match(/20\d\d|19\d\d/g) || []).map(Number));
const br2iso = (s: string | null) => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

async function umaNr(nr: number, pagina: string, tituloLista: string) {
  try {
    const html = await ler(pagina);
    const core = miolo(html);
    const txt = texto(core);
    const atual = /Atualizado em\s*(\d{2}\/\d{2}\/\d{4})/i.exec(txt);
    const pub = /Publicado em\s*(\d{2}\/\d{2}\/\d{4})/i.exec(txt);
    const ls = links(core);

    // Texto oficial: o PDF "nr-XX-atualizada-AAAA..." mais novo (sem manuais/guias).
    const pdfs = ls.filter((l) => /\.pdf/i.test(l.href) && !/sst-portarias|manual|guia|atas-ctpp|relatorio|pergunta|faq/i.test(l.href)
      && new RegExp(`nr[-_]?0?${nr}\\b|nr[-_]?0?${nr}[-_]`, 'i').test(l.href));
    pdfs.sort((a, b) => anoDe(b.href) - anoDe(a.href) || (b.href > a.href ? 1 : -1));
    const textoPdf = pdfs[0]?.href || null;

    // Portarias que a página cita (pasta sst-portarias/AAAA/).
    const vistos = new Set<string>();
    const portarias = ls.filter((l) => /sst-portarias\//i.test(l.href)).filter((l) => {
      if (vistos.has(l.href)) return false; vistos.add(l.href); return true;
    }).map((l, i) => {
      const arquivo = decodeURIComponent((l.href.replace(/\/(view|@@download\/file)$/i, '').split('/').pop() || '')
        .replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ')).trim();
      const txt = l.txt.replace(/^\(?\s*Última modificação:\s*/i, '').replace(/\)\s*$/, '');
      return {
        ano: anoDe((/sst-portarias\/([^/]+)\//i.exec(l.href) || [])[1] || l.href),
        // texto do link quando é o nome da portaria; senão, o nome do arquivo
        texto: /portaria|decreto|lei\b/i.test(txt) ? txt : arquivo,
        link: l.href,
        revogada: /revogad/i.test(l.href),
        ordem: i,
      };
    });
    // mais nova primeiro (mesmo ano: a que aparece por último na página)
    portarias.sort((a, b) => b.ano - a.ano || b.ordem - a.ordem);
    const ultima = portarias.find((p) => !p.revogada) || portarias[0];

    const titulo = tituloLista || texto((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '');
    return {
      nr, ok: true, titulo, pagina,
      texto_pdf: textoPdf,
      atualizado_portal: br2iso(atual?.[1] || pub?.[1] || null),
      revogada: /revogad/i.test(titulo) || /revogada/i.test(textoPdf || ''),
      texto_ano: textoPdf ? (anoDe(textoPdf.split('/').pop() || '') || null) : null,
      ultima_portaria: ultima?.texto || null,
      ultima_portaria_link: ultima?.link || null,
      portarias: portarias.map(({ ano, texto, link, revogada }) => ({ ano, texto, link, revogada })),
    };
  } catch (e) {
    return { nr, ok: false, pagina, titulo: tituloLista, motivo: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const corpo = await req.json().catch(() => ({}));
    const so = Array.isArray(corpo?.nrs) ? new Set(corpo.nrs.map(Number)) : null;

    const html = await ler(LISTA);
    const achadas = new Map<number, { pagina: string; titulo: string }>();
    for (const l of links(miolo(html))) {
      const n = numeroDaPagina(l.href);
      if (!Number.isFinite(n) || n < 1 || n > 99) continue;
      if (!/gov\.br\/trabalho-e-emprego/i.test(l.href) && !l.href.startsWith('/')) continue;
      const pagina = l.href.startsWith('/') ? 'https://www.gov.br' + l.href : l.href;
      const atual = achadas.get(n);
      // fica com o texto de link mais descritivo
      if (!atual || (l.txt.length > atual.titulo.length)) achadas.set(n, { pagina, titulo: l.txt });
    }
    if (!achadas.size) return json({ erro: 'não achei a lista de NRs no portal (o site pode ter mudado)' }, 502);

    const alvo = [...achadas.entries()].filter(([n]) => !so || so.has(n)).sort((a, b) => a[0] - b[0]);
    const nrs: unknown[] = [];
    for (let i = 0; i < alvo.length; i += 8) {
      nrs.push(...await Promise.all(alvo.slice(i, i + 8).map(([n, x]) => umaNr(n, x.pagina, x.titulo))));
    }
    return json({ nrs, fonte: LISTA, conferido_em: new Date().toISOString() });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
