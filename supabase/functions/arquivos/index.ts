// LOP - Gestão Rápida — arquivos de todo o app no Google Drive (15/10/2026).
//
// Pedido do Guilherme: toda foto ou documento anexado no app vai para o Google
// Drive, para não pesar o Supabase. No banco fica só uma linha por arquivo
// (public.arquivos): chave, área, tipo, dono, nome, tamanho e o ID no Drive.
//
// Autorização do Drive: tabela public.drive_autorizacao (função drive-autorizar) ou os segredos
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN, da conta
// escritoriosakuma1@gmail.com. Permissão "drive.file": a função só enxerga o
// que ela mesma criou.
//
// Quem pode o quê é decidido no banco (public.arquivo_pode), sempre com o
// login de quem chamou — nunca com service_role.
//
// Chave: <área>/<tipo>/<dono>/<arquivo>.<ext>
//   pessoas/funcionario/<id do funcionário>/foto-….jpg
//   pessoas/treinamento/<id do lançamento>/….pdf
//   pessoas/exame/<id do lançamento>/….pdf
//   certificacao/documento/<id do documento>/….pdf
//   certificacao/caderno/<id do registro ou análise>/….pdf  (Caderno de campo, 19/10/2026)
//   certificacao/fauna/<id do registro>/….jpg  (Biodiversidade — FORM 050, 26/10/2026)
//   certificacao/energia/<id do lançamento>/….pdf  (Consumo de energia — FORM 043, 26/10/2026)
//   certificacao/evidencia/<id da evidência>/….pdf  (evidências da lista mestra, 26/10/2026)
//   certificacao/residuo/<id da saída>/….pdf  (Gestão de resíduos — FORM 053, 27/10/2026)
//   manutencoes/os/<código>/<uuid>.jpg  ·  manutencoes/checklist/<código>/<uuid>.jpg
//   manutencoes/maquina/<id da máquina>/<uuid>.jpg  ·  manutencoes/patrimonio/<id do bem>/<uuid>.jpg
//   programacao/diario/<id do diário>/<uuid>.jpg  (Programação Campo, 15/10/2026)
//
// No Drive: pasta "LOP - Gestão Rápida – arquivos" › área › tipo.
//
// Ações (?acao=):
//   status                    GET  → {drive, conta, livre_gb}
//   enviar&chave=&nome=       POST corpo = arquivo → grava no Drive e registra
//   ver&chave=                GET  → o arquivo
//   apagar&chave=             POST → lixeira do Drive (recuperável 30 dias) e tira o registro
//
// Certificação: o OneDrive é o lugar oficial (30/10/2026, pedido do Guilherme — "deixe o Drive
// somente para os outros apps, vamos usar na certificação o OneDrive", opção 1). Todo arquivo
// certificacao/… enviado aqui continua indo para o Drive, mas só para abrir na tela; a linha ganha
// od_destino = a pasta do documento no OneDrive (caminho dentro de "6 - Certificações") e o
// computador do escritório (sakumasrv, entregar.ps1 a cada 5 min) grava lá e marca a origem.
// Apagar no app um arquivo que o app mandou: o computador tira da pasta (vai para
// 7 - CONFIGURAÇÕES › Para apagar). O que veio do OneDrive pelo sincronizador não é tocado na pasta.

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_RENOVA = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const RAIZ_NOME = "LOP - Gestão Rápida – arquivos";
const MAX_BYTES = 15 * 1024 * 1024;
const CHAVE_OK = /^(pessoas|manutencoes|certificacao|programacao)\/(funcionario|treinamento|exame|os|checklist|documento|maquina|patrimonio|diario|atividade|reuniao|caderno|fauna|energia|evidencia|residuo)\/[\w.-]{1,80}\/[\w.-]{1,120}\.(jpe?g|png|webp|pdf)$/;   // chaves geradas pelo app, sempre em minúsculas
const TIPOS_OK = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

const NOME_AREA: Record<string, string> = { pessoas: "Pessoas", manutencoes: "Manutenções", certificacao: "Certificação", programacao: "Programação Campo" };
const NOME_TIPO: Record<string, string> = {
  funcionario: "Fotos dos funcionários", treinamento: "Certificados de treinamento", exame: "ASO e exames",
  os: "Ordens de serviço", checklist: "Check lists", documento: "Documentos",
  maquina: "Fotos das máquinas", patrimonio: "Fotos do patrimônio",
  diario: "Relatórios diários", atividade: "Atividades", reuniao: "Reuniões semanais",
  caderno: "Caderno de campo", fauna: "Monitoramento de animais",
  energia: "Consumo de energia", evidencia: "Evidências", residuo: "Comprovantes de resíduos",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

class FalhaDrive extends Error { constructor(public codigo: string, msg?: string) { super(msg ?? codigo); } }

/* ─────────── Google ─────────── */
// Autorização do Drive (15/10/2026): vem primeiro da tabela public.drive_autorizacao,
// gravada pela função "drive-autorizar" (um clique, sem copiar token); se a tabela
// estiver vazia, usa o segredo GOOGLE_REFRESH_TOKEN, como antes.
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
let renova = "", renovaAte = 0;
async function refreshToken(): Promise<string> {
  if (renova && Date.now() < renovaAte) return renova;
  let t = "";
  if (SERVICO) {
    try {
      const r = await fetch(`${URL_BASE}/rest/v1/drive_autorizacao?select=refresh_token&id=eq.1`,
        { headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` } });
      if (r.ok) t = (await r.json())?.[0]?.refresh_token ?? "";
    } catch { /* sem banco: fica com o segredo */ }
  }
  renova = t || G_RENOVA; renovaAte = Date.now() + 5 * 60000;
  return renova;
}
let token = "", tokenAte = 0;
async function tokenGoogle(): Promise<string> {
  if (token && Date.now() < tokenAte) return token;
  const rt = await refreshToken();
  if (!G_ID || !G_SEGREDO || !rt) throw new FalhaDrive("drive-nao-configurado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SEGREDO, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) renovaAte = 0;
  if (!r.ok) throw new FalhaDrive(d.error === "invalid_grant" ? "drive-autorizacao-expirou" : "drive-token", JSON.stringify(d));
  token = d.access_token; tokenAte = Date.now() + (Number(d.expires_in || 3600) - 300) * 1000;
  return token;
}
async function google(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await tokenGoogle();
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) token = "";
  return r;
}

/* pastas: acha pelo nome dentro da pasta-mãe; se não existir, cria */
const pastas = new Map<string, string>();
async function pasta(nome: string, mae: string | null): Promise<string> {
  const k = (mae || "raiz") + "/" + nome;
  if (pastas.has(k)) return pastas.get(k)!;
  const q = `name='${nome.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
    (mae ? ` and '${mae}' in parents` : "");
  const r = await google(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime&spaces=drive`);
  const d = await r.json();
  if (!r.ok) throw new FalhaDrive("drive-pasta", JSON.stringify(d));
  let id = d.files?.[0]?.id;
  if (!id) {
    const c = await google("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", ...(mae ? { parents: [mae] } : {}) }),
    });
    const n = await c.json();
    if (!c.ok) throw new FalhaDrive("drive-pasta", JSON.stringify(n));
    id = n.id;
  }
  pastas.set(k, id);
  return id;
}
async function pastaDe(area: string, tipo: string) {
  const raiz = await pasta(RAIZ_NOME, null);
  const a = await pasta(NOME_AREA[area], raiz);
  return await pasta(NOME_TIPO[tipo], a);
}

/* ─────────── banco, com o login de quem chamou ─────────── */
function banco(jwt: string) {
  return async (caminho: string, init: RequestInit = {}) => {
    const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
      ...init,
      headers: { apikey: ANON, Authorization: jwt, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
    return t ? JSON.parse(t) : null;
  };
}
type Db = ReturnType<typeof banco>;
const pode = (db: Db, area: string, tipo: string, escrever: boolean) =>
  db("rpc/arquivo_pode", { method: "POST", body: JSON.stringify({ p_area: area, p_tipo: tipo, p_escrever: escrever }) });

/* ─────────── Certificação: pasta do OneDrive para onde o arquivo vai ─────────── */
const SERV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
async function sdb(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { ...init, headers: { apikey: SERV, Authorization: `Bearer ${SERV}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}
const BASE_PC = "C:\\NUVEM\\OneDrive\\1 - ADM - PRINCIPAL\\6 - Certificações\\";
const ODLINK = /[?&]id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2F([^&]*)/i;
const relDoLink = (l: string | null | undefined) => { const m = String(l || "").match(ODLINK); try { return m ? decodeURIComponent(m[1]) : ""; } catch { return ""; } };
function relDoCaminhoPc(c: string | null | undefined) {
  const x = String(c || "");
  return x.toLowerCase().startsWith(BASE_PC.toLowerCase()) ? x.slice(BASE_PC.length).replace(/\\/g, "/").replace(/\/+$/, "") : "";
}
async function pastaDoc(id: string | number): Promise<{ rel: string; codigo: string }> {
  const d = (await sdb(`cert_documentos?select=codigo,caminho,link&id=eq.${encodeURIComponent(String(id))}`))?.[0];
  return d ? { rel: relDoCaminhoPc(d.caminho) || relDoLink(d.link), codigo: d.codigo } : { rel: "", codigo: "" };
}
async function pastaPorCodigo(codigo: string, reserva: string) {
  const d = (await sdb(`cert_documentos?select=id&codigo=eq.${encodeURIComponent(codigo)}`))?.[0];
  return (d && (await pastaDoc(d.id)).rel) || reserva;
}
const ANO = () => String(new Date().getFullYear());
const SEM_LUGAR = (tipo: string, dono: string) => `7 - CONFIGURAÇÕES/Anexos do app/${tipo}/${dono}`;
async function pastaOneDrive(tipo: string, dono: string): Promise<string> {
  if (tipo === "documento") {
    const [id, rev] = dono.split("-");
    const p = (await pastaDoc(id)).rel;
    return p ? (rev === "rev" ? p + "/Revisões" : p) : SEM_LUGAR(tipo, dono);
  }
  if (tipo === "evidencia") {
    const ev = /^\d+$/.test(dono) ? (await sdb(`cert_evidencias?select=documento_id,item_id,data&id=eq.${dono}`))?.[0] : null;
    if (!ev) return SEM_LUGAR(tipo, dono);
    const doc = await pastaDoc(ev.documento_id);
    if (!doc.rel) return SEM_LUGAR(tipo, dono);
    const ano = String(ev.data || "").slice(0, 4) || ANO();
    if (ev.item_id) {
      const it = (await sdb(`cert_doc_itens?select=local,link,jor_fazendas(nome)&id=eq.${ev.item_id}`))?.[0];
      const ri = relDoLink(it?.link);
      if (ri && ri.startsWith(doc.rel + "/")) return ri + "/" + ano;
      const local = String(it?.jor_fazendas?.nome || it?.local || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\\/:*?"<>|]+/g, " ").trim();
      return doc.rel + "/" + (local || "GERAL") + "/" + ano;
    }
    return doc.codigo.startsWith("RG ") ? doc.rel + "/" + ano : doc.rel + "/EVIDÊNCIAS/" + ano;
  }
  const porTipo: Record<string, [string, string]> = {
    caderno: ["AN 09", "3 - ANEXOS/AN 09 - CADERNO DE CAMPO (RELATÓRIO DAS ATIVIDADES DO CAMPO)"],
    fauna: ["RG 050", "5 - REGISTROS/RG 050 - MONITORAMENTO DE ANIMAIS"],
    energia: ["RG 043", "5 - REGISTROS/RG 043 - TABELA CONSUMO DE ENERGIAS"],
    residuo: ["RG 053", "5 - REGISTROS/RG 053 - GESTÃO DE RESÍDUOS"],
  };
  const x = porTipo[tipo];
  return x ? (await pastaPorCodigo(x[0], x[1])) + "/" + ANO() : SEM_LUGAR(tipo, dono);
}

/* ─────────── ações ─────────── */
async function status() {
  try {
    await tokenGoogle();
    let conta = "", livre_gb: number | null = null;
    const r = await google("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota");
    if (r.ok) {
      const a = await r.json();
      conta = a.user?.emailAddress ?? "";
      const q = a.storageQuota || {};
      if (q.limit) livre_gb = Math.round((Number(q.limit) - Number(q.usage || 0)) / 1e8) / 10;
    }
    return json({ drive: true, conta, livre_gb });
  } catch (e) {
    return json({ drive: false, erro: e instanceof FalhaDrive ? e.codigo : "drive-erro" });
  }
}

function nomeLimpo(nome: string, chave: string) {
  const ext = chave.split(".").pop()!.toLowerCase();
  let n = (nome || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!n) n = chave.split("/").pop()!;
  if (!n.toLowerCase().endsWith("." + ext)) n += "." + ext;
  return n;
}

async function enviar(req: Request, db: Db, chave: string, area: string, tipo: string, dono: string, nome: string) {
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!TIPOS_OK.test(mime)) return json({ erro: "tipo-invalido" }, 415);
  if ((mime === "application/pdf") !== chave.toLowerCase().endsWith(".pdf")) return json({ erro: "tipo-invalido" }, 415);
  if ((await pode(db, area, tipo, true)) !== true) return json({ erro: "sem-acesso" }, 403);
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (!corpo.length) return json({ erro: "vazio" }, 400);
  if (corpo.length > MAX_BYTES) return json({ erro: "grande-demais" }, 413);
  const nomeFinal = nomeLimpo(nome, chave);

  const atual = await db(`arquivos?select=drive_id,origem&chave=eq.${encodeURIComponent(chave)}`);
  let driveId: string = atual?.[0]?.drive_id ?? "";
  if (driveId) {
    const r = await google(`https://www.googleapis.com/upload/drive/v3/files/${driveId}?uploadType=media&fields=id`, {
      method: "PATCH", headers: { "Content-Type": mime }, body: corpo,
    });
    if (r.status === 404) driveId = "";
    else if (!r.ok) throw new FalhaDrive("drive-gravar", await r.text());
  }
  if (!driveId) {
    const limite = "fronteira" + crypto.randomUUID();
    const meta = JSON.stringify({
      name: nomeFinal, parents: [await pastaDe(area, tipo)],
      description: `LOP - Gestão Rápida — ${chave}`, appProperties: { chave },
    });
    const enc = new TextEncoder();
    const ini = enc.encode(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`);
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
  await db("arquivos?on_conflict=chave", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chave, area, tipo, dono_id: dono, nome: nomeFinal, mime, tamanho: corpo.length, drive_id: driveId }),
  });
  // Certificação: o computador do escritório grava no OneDrive (mesmo lugar, se for troca do arquivo)
  let destino: string | null = null;
  if (area === "certificacao") {
    const ori = String(atual?.[0]?.origem || "");
    destino = ori.startsWith("onedrive:") ? ori.slice(9) : (await pastaOneDrive(tipo, dono)) + "/" + nomeFinal;
    await sdb(`arquivos?chave=eq.${encodeURIComponent(chave)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ od_destino: destino }) });
  }
  return json({ chave, nome: nomeFinal, tamanho: corpo.length, mime, ...(destino ? { onedrive: destino } : {}) });
}

async function ver(db: Db, chave: string) {
  // a linha só aparece para quem pode ver (RLS)
  const m = await db(`arquivos?select=drive_id,mime,nome&chave=eq.${encodeURIComponent(chave)}`);
  if (!m?.length) return json({ erro: "nao-encontrado" }, 404);
  const r = await google(`https://www.googleapis.com/drive/v3/files/${m[0].drive_id}?alt=media`);
  if (!r.ok) return json({ erro: "drive-ler", status: r.status }, r.status === 404 ? 410 : 502);
  return new Response(r.body, {
    status: 200,
    headers: {
      ...CORS, "Content-Type": m[0].mime || r.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(m[0].nome || "arquivo")}`,
    },
  });
}

async function apagar(db: Db, chave: string) {
  const m = await db(`arquivos?chave=eq.${encodeURIComponent(chave)}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  });
  if (!m?.length) return json({ erro: "nao-encontrado-ou-sem-acesso" }, 404);
  // arquivo da Certificação que o app mandou para o OneDrive: o computador tira da pasta
  if (m[0].area === "certificacao" && String(m[0].origem || "").startsWith("onedrive:") && !String(m[0].enviado_por || "").startsWith("onedrive@"))
    await sdb("onedrive_lixo", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ rel: m[0].origem.slice(9) }) }).catch(() => null);
  await google(`https://www.googleapis.com/drive/v3/files/${m[0].drive_id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  }).catch(() => null);
  return json({ apagado: chave });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jwt = req.headers.get("Authorization") || "";
  if (!jwt.startsWith("Bearer ")) return json({ erro: "sem-login" }, 401);
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "";
  const chave = u.searchParams.get("chave") || "";
  try {
    if (acao === "status") return await status();
    if (!CHAVE_OK.test(chave)) return json({ erro: "chave-invalida" }, 400);
    const [area, tipo, dono] = chave.split("/");
    const db = banco(jwt);
    if (acao === "ver" && req.method === "GET") return await ver(db, chave);
    if (acao === "enviar" && req.method === "POST") return await enviar(req, db, chave, area, tipo, dono, u.searchParams.get("nome") || "");
    if (acao === "apagar" && req.method === "POST") return await apagar(db, chave);
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    if (e instanceof FalhaDrive) {
      console.error(e.codigo, e.message);
      return json({ erro: e.codigo }, e.codigo === "drive-nao-configurado" || e.codigo === "drive-autorizacao-expirou" ? 503 : 502);
    }
    console.error(String(e));
    return json({ erro: "falha", detalhe: String(e).slice(0, 200) }, 500);
  }
});
