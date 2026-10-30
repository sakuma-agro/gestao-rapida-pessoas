// LOP - Gestão Rápida — sincronização OneDrive → app (27/10/2026).
//
// Pedido do Guilherme: o app "ler o OneDrive direto". O sakumasrv já tem o
// OneDrive sincronizado; um script agendado nele (ferramentas/onedrive-sync)
// varre a pasta "6 - Certificações" (1 - PROCEDIMENTOS, 2 - FORMULÁRIOS, 3 - ANEXOS, 5 - REGISTROS)
// e manda para cá cada arquivo novo ou alterado. Esta função registra o arquivo
// na tabela public.arquivos (desde 30/10/2026 sem cópia no Google Drive: o app lê
// direto do OneDrive pela origem) e liga o arquivo ao documento da lista mestra:
//   - arquivo da pasta do documento → certificacao/documento/<id>/od-….pdf
//     (vira o PDF do documento no app; se já existe um arquivo com o mesmo
//     nome, enviado à mão, não duplica)
//   - arquivo dentro da subpasta de uma fazenda num AN por fazenda → uma
//     evidência (cert_evidencias, item_id = a fazenda) com o arquivo em
//     certificacao/evidencia/<id>/od-….pdf; a fazenda recebe ultima_data.
//   - arquivo dentro da subpasta EVIDÊNCIAS de qualquer documento → uma
//     evidência do documento (sem fazenda), na linha do tempo dele.
// Nada é apagado aqui: tirar um arquivo do OneDrive não tira do app.
//
// Autenticação: cabeçalho x-sync-token, conferido pelo sha-256 na tabela
// public.sync_tokens (sem login de pessoa). Roda com service_role.
//
// Ações (?acao=):
//   mapa                     GET  → documentos (id, codigo, por_fazenda) e itens (id, documento_id, fazenda)
//   enviar&destino=doc|item|evid&id=&caminho=&nome=&data=   POST corpo = arquivo
//   datas                    POST [{o: origem, d: data}] → arquivos.data_arquivo; tira os PDFs de documento que saíram da pasta
//   mover                    POST [{de, para}] → troca o caminho de arquivos/evidências movidos

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TIPOS_OK = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

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

function nomeLimpo(nome: string, ext: string) {
  let n = (nome || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!n) n = "arquivo";
  if (!n.toLowerCase().endsWith("." + ext)) n += "." + ext;
  return n;
}
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s: string) => semAcento(s).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "arquivo";

/** Registra (ou atualiza) o arquivo na tabela arquivos. Desde 30/10/2026 não há cópia no Google Drive:
 *  o app lê o arquivo direto do OneDrive pela origem (função "arquivos", ../_shared/onedrive.ts). */
async function gravar(chave: string, tipo: string, dono: string, nome: string, mime: string, tamanho: number, origem: string, dataArquivo: string | null = null) {
  await db("arquivos?on_conflict=chave", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chave, area: "certificacao", tipo, dono_id: dono, nome, mime, tamanho, drive_id: null, origem, enviado_por: "onedrive@sakumasrv", ...(dataArquivo ? { data_arquivo: dataArquivo } : {}) }),
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
  // 30/10/2026: o conteúdo não é mais guardado (fica no OneDrive). O script pode mandar só &tamanho=.
  const corpo = new Uint8Array(await req.arrayBuffer());
  const tamanho = corpo.length || Number(u.searchParams.get("tamanho") || 0);
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const nome = nomeLimpo(nomeOrig, ext);
  const origem = "onedrive:" + caminho.replace(/\\/g, "/");
  const sufixo = (await sha256(origem)).slice(0, 10);
  // já registrado (enviado pelo app direto no OneDrive, ou rodada anterior): só atualiza data e tamanho
  const ja = await db(`arquivos?select=chave&origem=eq.${encodeURIComponent(origem)}`);
  if (ja?.length) {
    await db(`arquivos?origem=eq.${encodeURIComponent(origem)}`, { method: "PATCH", body: JSON.stringify({ data_arquivo: data, ...(tamanho ? { tamanho } : {}), atualizado_em: new Date().toISOString() }) });
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
    await gravar(chave, "documento", String(id), nome, mime, tamanho, origem, data);
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
    await gravar(chave, "evidencia", String(evId), nome, mime, tamanho, origem);
    if (!item.ultima_data || data > item.ultima_data)
      await db(`cert_doc_itens?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ ultima_data: data, atualizado_em: new Date().toISOString() }) });
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
      body: JSON.stringify({ documento_id: Number(id), item_id: null, data, descricao, origem, criado_por: "onedrive@sakumasrv" }),
    });
    const evId = ev?.[0]?.id;
    if (!evId) throw new Error("evidência não gravada");
    const chave = `certificacao/evidencia/${evId}/od-${sufixo}-${slug(nome)}.${ext}`;
    await gravar(chave, "evidencia", String(evId), nome, mime, tamanho, origem);
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
    return json({ erro: "acao-invalida" }, 400);
  } catch (e) {
    if (e instanceof Falha) { console.error(e.codigo, e.message); return json({ erro: e.codigo }, 502); }
    console.error(String(e));
    return json({ erro: "falha", detalhe: String(e).slice(0, 300) }, 500);
  }
});
