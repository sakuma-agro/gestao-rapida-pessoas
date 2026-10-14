// LOP - Gestão Rápida · área Vistorias e Segurança — fotos no Google Drive.
// (cópia da função do app avulso sakuma-vistorias, apontando para o esquema "vistorias")
//
// O app não fala com o Google: fala com esta função, que guarda a autorização
// do Drive como segredo do servidor. A permissão usada é a "drive.file": a
// função só enxerga os arquivos que ela mesma criou, nunca o resto do Drive.
//
// Segredos (Supabase → Edge Functions → Secrets), colados pelo Guilherme:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//   (autorizados com a conta escritoriosakuma1@gmail.com)
// Opcional: DRIVE_PASTA_ID — se vazio, a função cria/acha a pasta sozinha.
//
// Quem pode o quê é decidido no banco, com o login de quem chamou (nunca com a
// chave service_role): as regras são as mesmas do bucket "vistorias".
//   ler     → vistorias.foto_pode_ver(caminho)  (mesma regra de fotos_ler)
//   enviar  → qualquer conta logada           (fotos_enviar / fotos_trocar)
//   apagar  → só quem enviou                  (fotos_apagar)
//
// Ações (?acao=):
//   status            GET   → {drive, conta, livre_gb} — o app usa para decidir
//   enviar&caminho=   POST  corpo = imagem → grava no Drive e registra
//   ver&caminho=      GET   → a imagem; {origem:"supabase"} (JSON) se a foto for antiga, do bucket
//   apagar&caminho=   POST  → apaga do Drive e do registro
// Sem os segredos, responde 503 {erro:"drive-nao-configurado"} e o app continua
// guardando as fotos no Supabase, como antes.

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
// No LOP - Gestão Rápida as tabelas da área Vistorias ficam no esquema "vistorias".
const ESQUEMA = "vistorias";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_RENOVA = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const PASTA_FIXA = Deno.env.get("DRIVE_PASTA_ID") ?? "";
const PASTA_NOME = "SAKUMA Vistorias – fotos";
const MAX_BYTES = 8 * 1024 * 1024;              // mesmo limite do bucket
const CAMINHO_OK = /^[0-9a-f-]{36}\/[\w.-]{1,120}\.(jpe?g|png|webp)$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

class FalhaDrive extends Error { constructor(public codigo: string, msg?: string) { super(msg ?? codigo); } }

/* ─────────── Google: token de acesso (renovado a cada ~55 min) ─────────── */
let token = "", tokenAte = 0;
async function tokenGoogle(): Promise<string> {
  if (!G_ID || !G_SEGREDO || !G_RENOVA) throw new FalhaDrive("drive-nao-configurado");
  if (token && Date.now() < tokenAte) return token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SEGREDO, refresh_token: G_RENOVA, grant_type: "refresh_token" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // invalid_grant = autorização revogada ou expirada (app deixado "em teste" expira em 7 dias)
    throw new FalhaDrive(d.error === "invalid_grant" ? "drive-autorizacao-expirou" : "drive-token", JSON.stringify(d));
  }
  token = d.access_token; tokenAte = Date.now() + (Number(d.expires_in || 3600) - 300) * 1000;
  return token;
}
async function google(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await tokenGoogle();
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) { token = ""; }      // força renovar na próxima
  return r;
}

let pasta = PASTA_FIXA;
async function pastaFotos(): Promise<string> {
  if (pasta) return pasta;
  const q = `name='${PASTA_NOME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await google(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
  const d = await r.json();
  if (!r.ok) throw new FalhaDrive("drive-pasta", JSON.stringify(d));
  if (d.files?.length) return (pasta = d.files[0].id);
  const c = await google("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: PASTA_NOME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const n = await c.json();
  if (!c.ok) throw new FalhaDrive("drive-pasta", JSON.stringify(n));
  return (pasta = n.id);
}

/* ─────────── banco, sempre com o login de quem chamou ─────────── */
function banco(jwt: string) {
  return async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
      ...init,
      headers: { apikey: ANON, Authorization: jwt, "Content-Type": "application/json",
                 "Accept-Profile": ESQUEMA, "Content-Profile": ESQUEMA, ...(init.headers || {}) },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
  };
}

/* ─────────── ações ─────────── */
async function status() {
  try {
    await tokenGoogle();
    const id = await pastaFotos();
    let conta = "", livre_gb: number | null = null;
    const r = await google("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota");
    if (r.ok) {
      const a = await r.json();
      conta = a.user?.emailAddress ?? "";
      const q = a.storageQuota || {};
      if (q.limit) livre_gb = Math.round((Number(q.limit) - Number(q.usage || 0)) / 1e8) / 10;
    }
    return json({ drive: true, conta, livre_gb, pasta: id });
  } catch (e) {
    const codigo = e instanceof FalhaDrive ? e.codigo : "drive-erro";
    return json({ drive: false, erro: codigo }, 200);
  }
}

async function enviar(req: Request, db: ReturnType<typeof banco>, caminho: string) {
  const tipo = req.headers.get("content-type") || "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return json({ erro: "tipo-invalido" }, 415);
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (!corpo.length) return json({ erro: "vazio" }, 400);
  if (corpo.length > MAX_BYTES) return json({ erro: "grande-demais" }, 413);

  const atual = await db(`fotos_drive?select=drive_id&caminho=eq.${encodeURIComponent(caminho)}`);
  let driveId: string = atual?.[0]?.drive_id ?? "";

  if (driveId) {
    // mesma foto regravada (ex.: vistoria salva de novo): troca o conteúdo do arquivo
    const r = await google(`https://www.googleapis.com/upload/drive/v3/files/${driveId}?uploadType=media&fields=id`, {
      method: "PATCH", headers: { "Content-Type": tipo }, body: corpo,
    });
    if (r.status === 404) driveId = "";        // arquivo sumiu do Drive: cria de novo
    else if (!r.ok) throw new FalhaDrive("drive-gravar", await r.text());
  }
  if (!driveId) {
    const limite = "fronteira" + crypto.randomUUID();
    const meta = JSON.stringify({
      name: caminho.replace("/", " __ "), parents: [await pastaFotos()],
      description: `Gestão Rápida (Vistorias e Segurança) — ${caminho}`, appProperties: { caminho },
    });
    const enc = new TextEncoder();
    const ini = enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`);
    const fim = enc.encode(`\r\n--${limite}--`);
    const body = new Uint8Array(ini.length + corpo.length + fim.length);
    body.set(ini, 0); body.set(corpo, ini.length); body.set(fim, ini.length + corpo.length);
    const r = await google("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new FalhaDrive("drive-gravar", JSON.stringify(d));
    driveId = d.id;
  }
  await db("fotos_drive?on_conflict=caminho", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ caminho, drive_id: driveId, tamanho: corpo.length }),
  });
  return json({ caminho });
}

async function ver(db: ReturnType<typeof banco>, caminho: string) {
  const pode = await db("rpc/foto_pode_ver", { method: "POST", body: JSON.stringify({ p_caminho: caminho }) });
  if (pode !== true) return json({ erro: "sem-acesso" }, 403);
  const m = await db(`fotos_drive?select=drive_id&caminho=eq.${encodeURIComponent(caminho)}`);
  if (!m?.length) return json({ origem: "supabase" });   // foto antiga, no bucket: o app busca lá
  const r = await google(`https://www.googleapis.com/drive/v3/files/${m[0].drive_id}?alt=media`);
  if (!r.ok) return json({ erro: "drive-ler", status: r.status }, r.status === 404 ? 410 : 502);
  return new Response(r.body, {
    status: 200,
    headers: { ...CORS, "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}

async function apagar(db: ReturnType<typeof banco>, caminho: string) {
  // a regra do banco só deixa apagar o registro de quem enviou a foto
  const m = await db(`fotos_drive?caminho=eq.${encodeURIComponent(caminho)}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  });
  if (!m?.length) {
    const existe = await db(`fotos_drive?select=caminho&caminho=eq.${encodeURIComponent(caminho)}`);
    return existe?.length ? json({ erro: "sem-acesso" }, 403) : json({ origem: "supabase" });
  }
  // vai para a lixeira do Drive (some de vez em 30 dias): dá para recuperar se foi engano
  await google(`https://www.googleapis.com/drive/v3/files/${m[0].drive_id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  }).catch(() => null);
  return json({ apagado: caminho });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jwt = req.headers.get("Authorization") || "";
  if (!jwt.startsWith("Bearer ")) return json({ erro: "sem-login" }, 401);
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "";
  const caminho = u.searchParams.get("caminho") || "";
  try {
    if (acao === "status") return await status();
    if (!CAMINHO_OK.test(caminho)) return json({ erro: "caminho-invalido" }, 400);
    const db = banco(jwt);
    if (acao === "ver" && req.method === "GET") return await ver(db, caminho);
    if (acao === "enviar" && req.method === "POST") return await enviar(req, db, caminho);
    if (acao === "apagar" && req.method === "POST") return await apagar(db, caminho);
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    if (e instanceof FalhaDrive) {
      const s = e.codigo === "drive-nao-configurado" || e.codigo === "drive-autorizacao-expirou" ? 503 : 502;
      console.error(e.codigo, e.message);
      return json({ erro: e.codigo }, s);
    }
    console.error(String(e));
    return json({ erro: "falha", detalhe: String(e).slice(0, 200) }, 500);
  }
});
