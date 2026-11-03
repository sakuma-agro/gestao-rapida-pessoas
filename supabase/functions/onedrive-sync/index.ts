// LOP - Gestão Rápida — sincronização OneDrive → app (27/10/2026).
//
// Pedido do Guilherme: o app "ler o OneDrive direto". O sakumasrv já tem o
// OneDrive sincronizado; um script agendado nele (ferramentas/onedrive-sync)
// varre a pasta "6 - Certificações" (1 - PROCEDIMENTOS, 2 - FORMULÁRIOS, 3 - ANEXOS, 5 - REGISTROS)
// e manda para cá cada arquivo novo ou alterado. Esta função grava no Google
// Drive do app (mesma pasta e mesma tabela public.arquivos da função
// "arquivos") e liga o arquivo ao documento da lista mestra:
//   - arquivo da pasta do documento → certificacao/documento/<id>/od-….pdf
//     (vira o PDF do documento no app; se já existe um arquivo com o mesmo
//     nome, enviado à mão, não duplica)
//   - arquivo dentro da subpasta de uma fazenda num AN por fazenda → uma
//     evidência (cert_evidencias, item_id = a fazenda) com o arquivo em
//     certificacao/evidencia/<id>/od-….pdf; a fazenda recebe ultima_data.
//   - arquivo dentro da subpasta EVIDÊNCIAS de qualquer documento → uma
//     evidência do documento (sem fazenda), na linha do tempo dele.
// Nada é apagado aqui: tirar um arquivo do OneDrive não tira do app.
// Desde 01/11/2026 só POP e FORM ganham cópia no Drive (abrem como PDF no app); o resto é só
// registrado (drive_id vazio) e o app abre a pasta no computador ou na nuvem.
//
// Autenticação: cabeçalho x-sync-token, conferido pelo sha-256 na tabela
// public.sync_tokens (sem login de pessoa). Roda com service_role.
//
// Ações (?acao=):
//   mapa                     GET  → documentos (id, codigo, por_fazenda) e itens (id, documento_id, fazenda)
//   enviar&destino=doc|item|evid&id=&caminho=&nome=&data=   POST corpo = arquivo
//   datas                    POST [{o: origem, d: data}] → arquivos.data_arquivo; tira os PDFs de documento que saíram da pasta
//   mover                    POST [{de, para}] → troca o caminho de arquivos/evidências movidos
//   pendentes                GET  → arquivos anexados no app que o computador ainda precisa gravar no OneDrive
//                                   (arquivos.od_destino) e os que precisa tirar da pasta (onedrive_lixo)  — 30/10/2026
//   baixar&chave=            GET  → o arquivo (cópia do Drive) para o computador gravar
//   entregue                 POST {chave, rel} → gravado no OneDrive: origem = onedrive:<rel>, od_destino = null
//   lixo_feito               POST {id}
//   limpar_drive&n=          POST → tira do Drive as cópias que não são de POP/FORM (01/11/2026: só POP e FORM abrem no app)

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_RENOVA = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const RAIZ_NOME = "LOP - Gestão Rápida – arquivos";
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_OK = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const NOME_TIPO: Record<string, string> = { documento: "Documentos", evidencia: "Evidências" };

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8" } });
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
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (s: string) => semAcento(s).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "arquivo";

/** Só POP e FORM abrem como PDF no app (01/11/2026); o resto fica só no OneDrive, sem cópia no Drive. */
const abreNoApp = async (tipo: string, dono: string) =>
  (await db("rpc/arquivo_cert_abre_no_app", { method: "POST", body: JSON.stringify({ p_tipo: tipo, p_dono: dono }) })) === true;
async function lixeiraDrive(id: string) {
  if (id) await google(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }).catch(() => null);
}

/** Grava (ou atualiza) o arquivo no Drive (só POP/FORM) e na tabela arquivos. */
async function gravar(chave: string, tipo: string, dono: string, nome: string, mime: string, corpo: Uint8Array, origem: string, dataArquivo: string | null = null) {
  const atual = await db(`arquivos?select=drive_id&chave=eq.${encodeURIComponent(chave)}`);
  let driveId: string = atual?.[0]?.drive_id ?? "";
  if (!(await abreNoApp(tipo, dono))) {
    // só no OneDrive: registra sem cópia (e tira a cópia antiga, se havia)
    await lixeiraDrive(driveId);
    await db("arquivos?on_conflict=chave", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ chave, area: "certificacao", tipo, dono_id: dono, nome, mime, tamanho: corpo.length, drive_id: null, origem, enviado_por: "onedrive@sakumasrv", ...(dataArquivo ? { data_arquivo: dataArquivo } : {}) }),
    });
    return;
  }
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
    body: JSON.stringify({ chave, area: "certificacao", tipo, dono_id: dono, nome, mime, tamanho: corpo.length, drive_id: driveId, origem, enviado_por: "onedrive@sakumasrv", ...(dataArquivo ? { data_arquivo: dataArquivo } : {}) }),
  });
}

/** Data da evidência pelo nome do arquivo (03/11/2026, pedido do Guilherme: as declarações de setembro e
 *  outubro do AN 82 entraram como 03/11, o dia em que foram para a pasta). Na ordem: data completa no nome
 *  (2026-08-10, 21.08.2026, 21-08-2026) → ela; dia-mês sem ano (31-03) → com o ano da pasta (2026) ou do
 *  arquivo; nome do mês (setembro, outubro…) → último dia do mês. Nunca depois da data do arquivo. Sem nada
 *  disso, fica a data do arquivo. */
const MESES_NOME = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPeloNome(caminho: string, padrao: string) {
  const partes = caminho.split(/[\\/]/);
  const nome = semAcento(partes[partes.length - 1] || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const dois = (n: number) => String(n).padStart(2, "0");
  const valida = (aa: number, mm: number, dd: number) => mm >= 1 && mm <= 12 && new Date(Date.UTC(aa, mm - 1, dd)).getUTCDate() === dd;
  const limite = (d: string) => d > padrao ? padrao : d;
  const anoPasta = partes.slice(0, -1).map(p => p.trim()).filter(p => /^(19|20)\d\d$/.test(p)).pop();
  const anoNome = nome.match(/(?:^|\D)(20\d\d)(?:\D|$)/)?.[1];
  const iso = nome.match(/(?:^|\D)(20\d\d)[.\-_](\d{2})[.\-_](\d{2})(?:\D|$)/);
  if (iso && valida(+iso[1], +iso[2], +iso[3])) return limite(`${iso[1]}-${iso[2]}-${iso[3]}`);
  const dt = nome.match(/(?:^|\D)(\d{1,2})[.\/_-](\d{1,2})[.\/_-](20\d\d)(?:\D|$)/);
  if (dt && valida(+dt[3], +dt[2], +dt[1])) return limite(`${dt[3]}-${dois(+dt[2])}-${dois(+dt[1])}`);
  const dm = nome.match(/(?:^|[^\d])(\d{1,2})[.\-_](\d{1,2})(?![.\-_]?\d)/);
  if (dm) {
    const aa = Number(anoNome || anoPasta || padrao.slice(0, 4));
    if (valida(aa, +dm[2], +dm[1])) {
      let d = `${aa}-${dois(+dm[2])}-${dois(+dm[1])}`;
      if (!anoNome && !anoPasta && d > padrao) d = `${aa - 1}-${dois(+dm[2])}-${dois(+dm[1])}`;
      return limite(d);
    }
  }
  const i = MESES_NOME.findIndex(m => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(nome));
  if (i < 0) return padrao;
  let ano = Number(anoNome || anoPasta || padrao.slice(0, 4));
  if (!anoNome && !anoPasta && i + 1 > Number(padrao.slice(5, 7))) ano--;
  return limite(`${ano}-${dois(i + 1)}-${dois(new Date(Date.UTC(ano, i + 1, 0)).getUTCDate())}`);
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
  // já está no app (anexado pelo app e gravado no OneDrive pelo computador, ou rodada anterior): não duplica
  const ja = await db(`arquivos?select=chave&origem=eq.${encodeURIComponent(origem)}`);
  if (ja?.length) {
    await db(`arquivos?origem=eq.${encodeURIComponent(origem)}`, { method: "PATCH", body: JSON.stringify({ data_arquivo: data, atualizado_em: new Date().toISOString() }) });
    return json({ ok: true, chave: ja[0].chave, ja: true });
  }

  if (destino === "doc") {
    const d = await db(`cert_documentos?select=id&id=eq.${encodeURIComponent(id)}`);
    if (!d?.length) return json({ erro: "documento-nao-encontrado" }, 404);
    // O mesmo arquivo (mesmo caminho) atualiza o registro dele. Mesmo nome em outra pasta (ex.: 2024/PGRS.pdf
    // e 2026/PGRS.pdf, pastas de ano — 29/10/2026) é outro arquivo. Só o enviado à mão (sem origem) com o
    // mesmo nome é assumido pelo arquivo do OneDrive.
    const mesmo = await db(`arquivos?select=chave&area=eq.certificacao&tipo=eq.documento&origem=eq.${encodeURIComponent(origem)}`);
    const igual = mesmo?.length ? [] : await db(`arquivos?select=chave&area=eq.certificacao&tipo=eq.documento&dono_id=eq.${encodeURIComponent(id)}&nome=eq.${encodeURIComponent(nome)}&origem=is.null`);
    const chave = mesmo?.length ? mesmo[0].chave : igual?.length ? igual[0].chave : `certificacao/documento/${id}/od-${sufixo}-${slug(nome)}.${ext}`;
    // data do arquivo no OneDrive (29/10/2026): com dois PDFs na pasta, o app abre o mais novo
    await gravar(chave, "documento", String(id), nome, mime, corpo, origem, data);
    return json({ ok: true, chave });
  }

  const dataEv = dataPeloNome(caminho, data);   // 03/11/2026: evidência com o mês/data do nome do arquivo
  if (destino === "item") {
    const it = await db(`cert_doc_itens?select=id,documento_id,ultima_data&id=eq.${encodeURIComponent(id)}`);
    if (!it?.length) return json({ erro: "item-nao-encontrado" }, 404);
    const item = it[0];
    const ev = await db("cert_evidencias?on_conflict=origem", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ documento_id: item.documento_id, item_id: item.id, data: dataEv, descricao: caminho.split(/[\\/]/).slice(1).join(" / ").slice(0, 300) || nome, origem, criado_por: "onedrive@sakumasrv" }),
    });
    const evId = ev?.[0]?.id;
    if (!evId) throw new Error("evidência não gravada");
    const chave = `certificacao/evidencia/${evId}/od-${sufixo}-${slug(nome)}.${ext}`;
    await gravar(chave, "evidencia", String(evId), nome, mime, corpo, origem);
    if (!item.ultima_data || dataEv > item.ultima_data)
      await db(`cert_doc_itens?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ ultima_data: dataEv, atualizado_em: new Date().toISOString() }) });
    return json({ ok: true, chave, evidencia: evId });
  }
  // arquivo na subpasta EVIDÊNCIAS de um documento (FORM, AN…) → evidência do documento (sem fazenda)
  if (destino === "evid") {
    const d = await db(`cert_documentos?select=id&id=eq.${encodeURIComponent(id)}`);
    if (!d?.length) return json({ erro: "documento-nao-encontrado" }, 404);
    const partes = caminho.split(/[\\/]/);
    const i = partes.findIndex(p => /^EVID[ÊE]NCIAS$/i.test(p));
    const descricao = (i >= 0 ? partes.slice(i + 1) : partes.slice(1)).join(" / ").slice(0, 300) || nome;
    const ev = await db("cert_evidencias?on_conflict=origem", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ documento_id: Number(id), item_id: null, data: dataEv, descricao, origem, criado_por: "onedrive@sakumasrv" }),
    });
    const evId = ev?.[0]?.id;
    if (!evId) throw new Error("evidência não gravada");
    const chave = `certificacao/evidencia/${evId}/od-${sufixo}-${slug(nome)}.${ext}`;
    await gravar(chave, "evidencia", String(evId), nome, mime, corpo, origem);
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
    // datas (29/10/2026): [{o: origem, d: aaaa-mm-dd}] → arquivos.data_arquivo (data do arquivo no OneDrive)
    if (acao === "datas" && req.method === "POST") {
      const l = await req.json();
      if (!Array.isArray(l) || l.length > 5000) return json({ erro: "lista-invalida" }, 400);
      const n = await db("rpc/arquivos_marcar_datas", { method: "POST", body: JSON.stringify({ l }) });
      return json({ ok: true, ...(n || {}) });
    }
    // mover (29/10/2026): [{de, para}] → troca o caminho dos arquivos e evidências movidos no OneDrive (sem reenviar)
    if (acao === "mover" && req.method === "POST") {
      const l = await req.json();
      if (!Array.isArray(l) || l.length > 10000) return json({ erro: "lista-invalida" }, 400);
      const n = await db("rpc/arquivos_mover", { method: "POST", body: JSON.stringify({ l }) });
      return json({ ok: true, ...(n || {}) });
    }
    // entrega no OneDrive (30/10/2026): o computador grava o que foi anexado no app
    if (acao === "pendentes" && req.method === "GET") {
      const arqs = await db("arquivos?select=chave,od_destino,nome,tamanho,criado_em&od_destino=not.is.null&area=eq.certificacao&order=criado_em&limit=200");
      const lixo = await db("onedrive_lixo?select=id,rel&feito_em=is.null&order=id&limit=200");
      return json({ arquivos: arqs || [], lixo: lixo || [] });
    }
    if (acao === "baixar" && req.method === "GET") {
      const chave = u.searchParams.get("chave") || "";
      const m = (await db(`arquivos?select=drive_id,mime&chave=eq.${encodeURIComponent(chave)}`))?.[0];
      if (!m?.drive_id) return json({ erro: "nao-encontrado" }, 404);
      const r = await google(`https://www.googleapis.com/drive/v3/files/${m.drive_id}?alt=media`);
      if (!r.ok) return json({ erro: "drive-ler", status: r.status }, 502);
      return new Response(r.body, { status: 200, headers: { "Content-Type": m.mime || "application/octet-stream" } });
    }
    if (acao === "entregue" && req.method === "POST") {
      const b = await req.json();
      const chave = String(b?.chave || ""), rel = String(b?.rel || "").replace(/\\/g, "/");
      if (!chave || !rel) return json({ erro: "dados" }, 400);
      const ar = (await db(`arquivos?select=tipo,dono_id,drive_id&chave=eq.${encodeURIComponent(chave)}`))?.[0];
      const fica = ar ? await abreNoApp(ar.tipo, ar.dono_id) : true;
      if (ar && !fica) await lixeiraDrive(ar.drive_id);
      await db(`arquivos?chave=eq.${encodeURIComponent(chave)}`, { method: "PATCH",
        body: JSON.stringify({ origem: "onedrive:" + rel, od_destino: null, data_arquivo: new Date().toISOString().slice(0, 10), atualizado_em: new Date().toISOString(), ...(fica ? {} : { drive_id: null }) }) });
      return json({ ok: true });
    }
    // limpar_drive (01/11/2026): tira do Drive as cópias da Certificação que não são de POP/FORM (já estão no OneDrive)
    if (acao === "limpar_drive" && req.method === "POST") {
      const n = Math.min(Number(u.searchParams.get("n") || 100), 300);
      const l = await db("rpc/arquivos_cert_copias_sobrando", { method: "POST", body: JSON.stringify({ p_limite: n }) });
      let feitos = 0;
      for (const x of l || []) {
        await lixeiraDrive(x.drive_id);
        await db(`arquivos?chave=eq.${encodeURIComponent(x.chave)}`, { method: "PATCH", body: JSON.stringify({ drive_id: null }) });
        feitos++;
      }
      return json({ ok: true, feitos });
    }
    if (acao === "lixo_feito" && req.method === "POST") {
      const b = await req.json();
      await db(`onedrive_lixo?id=eq.${Number(b?.id) || 0}`, { method: "PATCH", body: JSON.stringify({ feito_em: new Date().toISOString() }) });
      return json({ ok: true });
    }
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    if (e instanceof Falha) { console.error(e.codigo, e.message); return json({ erro: e.codigo }, 502); }
    console.error(String(e));
    return json({ erro: "falha", detalhe: String(e).slice(0, 300) }, 500);
  }
});
