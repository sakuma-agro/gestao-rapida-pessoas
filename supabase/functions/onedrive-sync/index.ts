// LOP - Gestão Rápida — sincronização OneDrive → app (27/10/2026).
//
// Pedido do Guilherme: o app "ler o OneDrive direto". O sakumasrv já tem o
// OneDrive sincronizado; um script agendado nele (ferramentas/onedrive-sync)
// varre a pasta "Certificação - Lop Gestão Rápida" (1 - POP, 2 - FORM, 3 - AN)
// e manda para cá cada arquivo novo ou alterado. Esta função grava no Google
// Drive do app (mesma pasta e mesma tabela public.arquivos da função
// "arquivos") e liga o arquivo ao documento da lista mestra:
//   - arquivo da pasta do documento → certificacao/documento/<id>/od-….pdf
//     (vira o PDF do documento no app; se já existe um arquivo com o mesmo
//     nome, enviado à mão, não duplica)
//   - arquivo dentro da subpasta de uma fazenda num AN por fazenda → uma
//     evidência (cert_evidencias, item_id = a fazenda) com o arquivo em
//     certificacao/evidencia/<id>/od-….pdf; a fazenda recebe ultima_data.
// Nada é apagado aqui: tirar um arquivo do OneDrive não tira do app.
//
// Autenticação: cabeçalho x-sync-token, conferido pelo sha-256 na tabela
// public.sync_tokens (sem login de pessoa). Roda com service_role.
//
// Ações (?acao=):
//   mapa                     GET  → documentos (id, codigo, por_fazenda) e itens (id, documento_id, fazenda)
//   enviar&destino=doc|item&id=&caminho=&nome=&data=   POST corpo = arquivo

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_RENOVA = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const RAIZ_NOME = "LOP - Gestão Rápida – arquivos";
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_OK = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const NOME_TIPO: Record<string, string> = { documento: "Documentos", evidencia: "Evidências" };

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
class Falha extends Error { constructor(public codigo: string, msg?: string) { super(msg ?? codigo); } }

/* ─────────── banco (service_role) ─────────── */
async function db(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function tokenValido(t: string) {
  if (!t || t.length < 20) return false;
  const h = await sha256(t);
  const r = await db(`sync_tokens?select=nome&hash=eq.${h}`);
  if (!r?.length) return false;
  db(`sync_tokens?nome=eq.${encodeURIComponent(r[0].nome)}`, { method: "PATCH", body: JSON.stringify({ ultimo_uso: new Date().toISOString() }) }).catch(() => {});
  return true;
}

/* ─────────── Google (igual à função "arquivos") ─────────── */
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
  if (!G_ID || !G_SEGREDO || !rt) throw new Falha("drive-nao-configurado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SEGREDO, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { renovaAte = 0; throw new Falha(d.error === "invalid_grant" ? "drive-autorizacao-expirou" : "drive-token", JSON.stringify(d)); }
  token = d.access_token; tokenAte = Date.now() + (Number(d.expires_in || 3600) - 300) * 1000;
  return token;
}
async function google(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${await tokenGoogle()}` } });
  if (r.status === 401) token = "";
  return r;
}
const pastas = new Map<string, string>();
async function pasta(nome: string, mae: string | null) {
  const k = (mae || "raiz") + "/" + nome;
  if (pastas.has(k)) return pastas.get(k)!;
  const q = `name='${nome.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (mae ? ` and '${mae}' in parents` : "");
  const r = await google(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime&spaces=drive`);
  const d = await r.json();
  if (!r.ok) throw new Falha("drive-pasta", JSON.stringify(d));
  let id = d.files?.[0]?.id;
  if (!id) {
    const c = await google("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", ...(mae ? { parents: [mae] } : {}) }),
    });
    const n = await c.json();
    if (!c.ok) throw new Falha("drive-pasta", JSON.stringify(n));
    id = n.id;
  }
  pastas.set(k, id);
  return id;
}
async function pastaDe(tipo: string) {
  const raiz = await pasta(RAIZ_NOME, null);
  return await pasta(NOME_TIPO[tipo], await pasta("Certificação", raiz));
}

function nomeLimpo(nome: string, ext: string) {
  let n = (nome || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!n) n = "arquivo";
  if (!n.toLowerCase().endsWith("." + ext)) n += "." + ext;
  return n;
}
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s: string) => semAcento(s).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "arquivo";

/** Grava (ou atualiza) o arquivo no Drive e na tabela arquivos. */
async function gravar(chave: string, tipo: string, dono: string, nome: string, mime: string, corpo: Uint8Array, origem: string) {
  const atual = await db(`arquivos?select=drive_id&chave=eq.${encodeURIComponent(chave)}`);
  let driveId: string = atual?.[0]?.drive_id ?? "";
  if (driveId) {
    const r = await google(`https://www.googleapis.com/upload/drive/v3/files/${driveId}?uploadType=media&fields=id`, { method: "PATCH", headers: { "Content-Type": mime }, body: corpo });
    if (r.status === 404) driveId = "";
    else if (!r.ok) throw new Falha("drive-gravar", await r.text());
  }
  if (!driveId) {
    const limite = "fronteira" + crypto.randomUUID();
    const meta = JSON.stringify({ name: nome, parents: [await pastaDe(tipo)], description: `LOP - Gestão Rápida — ${chave} (OneDrive)`, ...(new TextEncoder().encode(chave).length <= 110 ? { appProperties: { chave } } : {}) });
    const enc = new TextEncoder();
    const ini = enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`);
    const fim = enc.encode(`\r\n--${limite}--`);
    const body = new Uint8Array(ini.length + corpo.length + fim.length);
    body.set(ini, 0); body.set(corpo, ini.length); body.set(fim, ini.length + corpo.length);
    const r = await google("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Falha("drive-gravar", JSON.stringify(d));
    driveId = d.id;
  }
  await db("arquivos?on_conflict=chave", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chave, area: "certificacao", tipo, dono_id: dono, nome, mime, tamanho: corpo.length, drive_id: driveId, origem, enviado_por: "onedrive@sakumasrv" }),
  });
}

/* ─────────── ações ─────────── */
async function mapa() {
  const docs = await db("cert_documentos?select=id,codigo,categoria,por_fazenda&order=codigo");
  const itens = await db("cert_doc_itens?select=id,documento_id,local,jor_fazendas(nome)&ativo=eq.true");
  return json({ docs, itens: (itens || []).map((i: any) => ({ id: i.id, documento_id: i.documento_id, local: i.local, fazenda: i.jor_fazendas?.nome ?? "" })) });
}

async function enviar(req: Request, u: URL) {
  const destino = u.searchParams.get("destino") || "";
  const id = u.searchParams.get("id") || "";
  const caminho = (u.searchParams.get("caminho") || "").slice(0, 400);
  const nomeOrig = u.searchParams.get("nome") || caminho.split(/[\\/]/).pop() || "";
  const data = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("data") || "") ? u.searchParams.get("data")! : new Date().toISOString().slice(0, 10);
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!TIPOS_OK.test(mime)) return json({ erro: "tipo-invalido" }, 415);
  if (!caminho) return json({ erro: "sem-caminho" }, 400);
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (!corpo.length) return json({ erro: "vazio" }, 400);
  if (corpo.length > MAX_BYTES) return json({ erro: "grande-demais" }, 413);
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const nome = nomeLimpo(nomeOrig, ext);
  const origem = "onedrive:" + caminho.replace(/\\/g, "/");
  const sufixo = (await sha256(origem)).slice(0, 10);

  if (destino === "doc") {
    const d = await db(`cert_documentos?select=id&id=eq.${encodeURIComponent(id)}`);
    if (!d?.length) return json({ erro: "documento-nao-encontrado" }, 404);
    // já foi enviado à mão com o mesmo nome? não duplica
    const igual = await db(`arquivos?select=chave,origem&area=eq.certificacao&tipo=eq.documento&dono_id=eq.${encodeURIComponent(id)}&nome=eq.${encodeURIComponent(nome)}`);
    // mesmo nome enviado à mão (sem origem): o arquivo do OneDrive passa a ser a fonte e atualiza o mesmo registro
    if (igual?.length && igual[0].origem && igual[0].origem !== origem) return json({ ok: true, pulado: "ja-existe-no-app" });
    const chave = igual?.length ? igual[0].chave : `certificacao/documento/${id}/od-${sufixo}-${slug(nome)}.${ext}`;
    await gravar(chave, "documento", String(id), nome, mime, corpo, origem);
    return json({ ok: true, chave });
  }

  if (destino === "item") {
    const it = await db(`cert_doc_itens?select=id,documento_id,ultima_data&id=eq.${encodeURIComponent(id)}`);
    if (!it?.length) return json({ erro: "item-nao-encontrado" }, 404);
    const item = it[0];
    const ev = await db("cert_evidencias?on_conflict=origem", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ documento_id: item.documento_id, item_id: item.id, data, descricao: caminho.split(/[\\/]/).slice(1).join(" / ").slice(0, 300) || nome, origem, criado_por: "onedrive@sakumasrv" }),
    });
    const evId = ev?.[0]?.id;
    if (!evId) throw new Error("evidência não gravada");
    const chave = `certificacao/evidencia/${evId}/od-${sufixo}-${slug(nome)}.${ext}`;
    await gravar(chave, "evidencia", String(evId), nome, mime, corpo, origem);
    if (!item.ultima_data || data > item.ultima_data)
      await db(`cert_doc_itens?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ ultima_data: data, atualizado_em: new Date().toISOString() }) });
    return json({ ok: true, chave, evidencia: evId });
  }
  return json({ erro: "destino-invalido" }, 400);
}

Deno.serve(async (req) => {
  try {
    if (!(await tokenValido(req.headers.get("x-sync-token") || ""))) return json({ erro: "sem-acesso" }, 401);
    const u = new URL(req.url);
    const acao = u.searchParams.get("acao") || "";
    if (acao === "mapa" && req.method === "GET") return await mapa();
    if (acao === "enviar" && req.method === "POST") return await enviar(req, u);
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    if (e instanceof Falha) { console.error(e.codigo, e.message); return json({ erro: e.codigo }, 502); }
    console.error(String(e));
    return json({ erro: "falha", detalhe: String(e).slice(0, 300) }, 500);
  }
});
