// LOP - Gestão Rápida — acesso ao OneDrive do escritório pela Microsoft Graph (30/10/2026).
//
// Pedido do Guilherme: "deixe o Drive somente para os outros apps, vamos usar na
// certificação o OneDrive". Os arquivos da Certificação (AN, RG, FORM, POP e as
// evidências) ficam só no OneDrive, na pasta do documento; o app lê e grava lá.
//
// Autorização: refresh token da conta Microsoft dona do OneDrive, guardado na
// tabela public.onedrive_autorizacao (função onedrive-autorizar; só as funções
// leem). A Microsoft troca o refresh token a cada renovação: o novo é gravado.
// Cliente: segredos MS_CLIENT_ID e MS_CLIENT_SECRET (app "LOP - Gestão Rápida"
// no Microsoft Entra, contas pessoais).

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MS_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const MS_SEGREDO = Deno.env.get("MS_CLIENT_SECRET") ?? "";
export const MS_ESCOPOS = "offline_access Files.ReadWrite User.Read";
export const MS_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const GRAPH = "https://graph.microsoft.com/v1.0";

/** Pasta da Certificação dentro do OneDrive (raiz = "Documentos" da conta). */
export const BASE_CERT = "1 - ADM - PRINCIPAL/6 - Certificações";
/** Prefixo do caminho no computador (campo cert_documentos.caminho). */
export const BASE_PC = "C:\\NUVEM\\OneDrive\\1 - ADM - PRINCIPAL\\6 - Certificações\\";

export class FalhaOneDrive extends Error { constructor(public codigo: string, msg?: string) { super(msg ?? codigo); } }

async function servico(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

let acesso = "", acessoAte = 0;
export async function tokenOneDrive(): Promise<string> {
  if (acesso && Date.now() < acessoAte) return acesso;
  if (!MS_ID || !MS_SEGREDO || !SERVICO) throw new FalhaOneDrive("onedrive-nao-configurado");
  const linha = (await servico("onedrive_autorizacao?select=refresh_token&id=eq.1"))?.[0];
  if (!linha?.refresh_token) throw new FalhaOneDrive("onedrive-nao-configurado");
  const r = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_ID, client_secret: MS_SEGREDO, refresh_token: linha.refresh_token, grant_type: "refresh_token", scope: MS_ESCOPOS }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new FalhaOneDrive(d.error === "invalid_grant" ? "onedrive-autorizacao-expirou" : "onedrive-token", JSON.stringify(d).slice(0, 300));
  if (d.refresh_token && d.refresh_token !== linha.refresh_token) {
    await servico("onedrive_autorizacao?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ refresh_token: d.refresh_token, atualizado_em: new Date().toISOString() }) }).catch(() => null);
  }
  acesso = d.access_token; acessoAte = Date.now() + (Number(d.expires_in || 3600) - 300) * 1000;
  return acesso;
}

export async function graph(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await tokenOneDrive();
  const r = await fetch(url.startsWith("http") ? url : GRAPH + url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) acesso = "";
  return r;
}

/** Endereço Graph de um caminho relativo a "6 - Certificações" (ex.: "3 - ANEXOS/AN 37 - …/x.pdf"). */
export const itemPorCaminho = (rel: string) =>
  "/me/drive/root:/" + (BASE_CERT + "/" + rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .split("/").filter(Boolean).map(encodeURIComponent).join("/") + ":";

/** "C:\NUVEM\…\6 - Certificações\3 - ANEXOS\AN 37" → "3 - ANEXOS/AN 37" (ou "" se estiver fora). */
export function relDoCaminhoPc(caminho: string | null | undefined): string {
  const c = String(caminho || "");
  if (!c.toLowerCase().startsWith(BASE_PC.toLowerCase())) return "";
  return c.slice(BASE_PC.length).replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Lê o conteúdo de um arquivo (caminho relativo). */
export async function lerArquivo(rel: string): Promise<Response> {
  return await graph(itemPorCaminho(rel) + "/content", { redirect: "follow" });
}

/** Grava o arquivo na pasta (cria as pastas que faltam). substituir=false → se já existe, a Microsoft renomeia ("x 1.pdf"). */
export async function gravarArquivo(pastaRel: string, nome: string, corpo: Uint8Array, substituir = false): Promise<{ id: string; rel: string; nome: string }> {
  const alvo = (pastaRel ? pastaRel.replace(/\/+$/, "") + "/" : "") + nome;
  const s = await graph(itemPorCaminho(alvo) + "/createUploadSession", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": substituir ? "replace" : "rename" } }),
  });
  const sd = await s.json().catch(() => ({}));
  if (!s.ok || !sd.uploadUrl) throw new FalhaOneDrive("onedrive-gravar", JSON.stringify(sd).slice(0, 300));
  // até 15 MB: um pedaço só (a Microsoft aceita até 60 MB por pedaço)
  const r = await fetch(sd.uploadUrl, {
    method: "PUT",
    headers: { "Content-Length": String(corpo.length), "Content-Range": `bytes 0-${corpo.length - 1}/${corpo.length}` },
    body: corpo,
  });
  const it = await r.json().catch(() => ({}));
  if (!r.ok || !it.id) throw new FalhaOneDrive("onedrive-gravar", JSON.stringify(it).slice(0, 300));
  const pai = decodeURIComponent(String(it.parentReference?.path || "").replace(/^\/drive\/root:\/?/, ""));
  const relPai = pai.startsWith(BASE_CERT) ? pai.slice(BASE_CERT.length).replace(/^\/+/, "") : (pastaRel || "");
  return { id: it.id, rel: (relPai ? relPai + "/" : "") + it.name, nome: it.name };
}

/** Manda para a lixeira do OneDrive (recuperável). */
export async function apagarArquivo(rel: string): Promise<boolean> {
  const r = await graph(itemPorCaminho(rel), { method: "DELETE" });
  return r.ok || r.status === 404;
}

/** Quem é a conta (para conferir que é o OneDrive certo). */
export async function contaOneDrive(): Promise<{ conta: string; driveId: string; livre_gb: number | null }> {
  const r = await graph("/me/drive?$select=id,owner,quota");
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new FalhaOneDrive("onedrive-conta", JSON.stringify(d).slice(0, 300));
  const q = d.quota || {};
  return { conta: d.owner?.user?.displayName || "", driveId: String(d.id || "").toLowerCase(), livre_gb: q.remaining ? Math.round(Number(q.remaining) / 1e8) / 10 : null };
}
