// LOP - Gestão Rápida — consulta pública por QR Code (10/11/2026).
//
// Pedido do Guilherme: "preciso que os funcionários acessem os POPs, políticas, manual de cultura por um
// QR Code, aonde não vai pedir senha e nada, somente para visualizar, e outro QR Code para acessar as
// FISPQs (FDS)". A página consulta/ do GitHub Pages chama esta função, SEM login.
//
// Segurança: só sai daqui o que está marcado em cert_documentos.qr ('docs' ou 'fds'), documento não
// Inativo, arquivo atual do documento (fora HISTÓRICO, EVIDÊNCIAS, Revisões, EDITÁVEL). Nada de pessoas,
// nada de outras tabelas. Somente leitura. Roda com service_role, mas só lê por estes dois caminhos.
//
// Ações (?acao=):
//   lista&g=docs|fds   GET → { grupo, documentos: [{codigo, nome, revisao, data_revisao, arquivos: [{chave, nome, pasta, tamanho, data}]}] }
//   ver&chave=         GET → o PDF (inline)

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_RENOVA = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (o: unknown, s = 200, cache = "no-store") =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache } });

async function db(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

/* Google Drive (mesma autorização das funções "arquivos" e "onedrive-sync") */
let renova = "", renovaAte = 0;
async function refreshToken() {
  if (renova && Date.now() < renovaAte) return renova;
  let t = "";
  try { t = (await db("drive_autorizacao?select=refresh_token&id=eq.1"))?.[0]?.refresh_token ?? ""; } catch { /* segredo */ }
  renova = t || G_RENOVA; renovaAte = Date.now() + 5 * 60000;
  return renova;
}
let token = "", tokenAte = 0;
async function tokenGoogle() {
  if (token && Date.now() < tokenAte) return token;
  const rt = await refreshToken();
  if (!G_ID || !G_SEGREDO || !rt) throw new Error("drive-nao-configurado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SEGREDO, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { renovaAte = 0; throw new Error("drive-token"); }
  token = d.access_token; tokenAte = Date.now() + (Number(d.expires_in || 3600) - 300) * 1000;
  return token;
}

const FORA = /\/(HIST[ÓO]RICO|EVID[ÊE]NCIAS|Revis[õo]es|EDIT[ÁA]VEL|bkp)\//i;

async function lista(g: string) {
  if (g !== "docs" && g !== "fds") return json({ erro: "grupo-invalido" }, 400);
  const [l, cats] = await Promise.all([
    db("rpc/consulta_qr_lista", { method: "POST", body: JSON.stringify({ p_grupo: g }) }),
    db(`cert_documentos?select=codigo,categoria&qr=eq.${g}`),
  ]);
  const cat = new Map<string, string>((cats || []).map((c: any) => [c.codigo, c.categoria]));
  const docs = new Map<string, any>();
  for (const x of l || []) {
    if (!docs.has(x.codigo)) docs.set(x.codigo, { codigo: x.codigo, nome: x.nome, categoria: cat.get(x.codigo) || "", revisao: x.revisao, data_revisao: x.data_revisao, arquivos: [] });
    docs.get(x.codigo).arquivos.push({ chave: x.chave, nome: x.arquivo, pasta: x.pasta, tamanho: x.tamanho, data: x.data_arquivo });
  }
  return json({ grupo: g, documentos: [...docs.values()], gerado_em: new Date().toISOString() }, 200, "public, max-age=120");
}

async function ver(chave: string) {
  if (!/^certificacao\/documento\/\d+(-[\w]+)?\/[\w.-]{1,160}$/.test(chave)) return json({ erro: "chave-invalida" }, 400);
  const a = (await db(`arquivos?select=drive_id,mime,nome,dono_id,origem&area=eq.certificacao&tipo=eq.documento&chave=eq.${encodeURIComponent(chave)}`))?.[0];
  if (!a?.drive_id || /-rev/.test(a.dono_id) || FORA.test(String(a.origem || ""))) return json({ erro: "nao-encontrado" }, 404);
  const d = (await db(`cert_documentos?select=qr,situacao&id=eq.${encodeURIComponent(String(a.dono_id).split("-")[0])}`))?.[0];
  if (!d?.qr || d.situacao === "Inativo") return json({ erro: "nao-encontrado" }, 404);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${a.drive_id}?alt=media`, { headers: { Authorization: `Bearer ${await tokenGoogle()}` } });
  if (r.status === 401) token = "";
  if (!r.ok) return json({ erro: "indisponivel" }, 502);
  return new Response(r.body, {
    status: 200,
    headers: {
      ...CORS, "Content-Type": a.mime || "application/pdf",
      "Cache-Control": "public, max-age=900",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome || "documento.pdf")}`,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ erro: "metodo" }, 405);
  const u = new URL(req.url);
  try {
    const acao = u.searchParams.get("acao") || "lista";
    if (acao === "lista") return await lista(u.searchParams.get("g") || "");
    if (acao === "ver") return await ver(u.searchParams.get("chave") || "");
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    console.error(String(e));
    return json({ erro: "falha" }, 500);
  }
});
