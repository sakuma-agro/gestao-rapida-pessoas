// onedrive-autorizar — liga o app ao OneDrive do escritório com um login (30/10/2026).
//
// Abrir esta função no navegador leva para a tela da Microsoft; depois do login
// com a conta dona do OneDrive (a do C:\NUVEM\OneDrive do sakumasrv), a
// autorização (refresh token) fica guardada na tabela public.onedrive_autorizacao,
// que só as funções leem. Ninguém copia nem cola token. Outro OneDrive é recusado
// (o drive certo é o 048fac336e81a458, o mesmo dos links da Certificação).
//
// Cliente: MS_CLIENT_ID / MS_CLIENT_SECRET (app no Microsoft Entra, contas pessoais),
// com este endereço em "URIs de redirecionamento".

import { MS_ESCOPOS, MS_TOKEN_URL } from "../_shared/onedrive.ts";

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MS_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const MS_SEGREDO = Deno.env.get("MS_CLIENT_SECRET") ?? "";
const DRIVE_CERTO = "048fac336e81a458";
const VOLTA = `${URL_BASE}/functions/v1/onedrive-autorizar`;

async function rest(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const texto = (titulo: string, msg: string, ok: boolean) =>
  new Response(`${ok ? "✔" : "✖"} ${titulo}\n\n${msg}\n\nLOP · Gestão Rápida — Inteligência para o agronegócio\n`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  if (!MS_ID || !MS_SEGREDO || !SERVICO) return texto("Falta configuração", "O cliente da Microsoft não está configurado no servidor.", false);
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const estado = u.searchParams.get("state") || "";
  const erro = u.searchParams.get("error");
  try {
    if (erro) return texto("Autorização cancelada", `Nada foi alterado. (${u.searchParams.get("error_description") || erro})`, false);

    // 1º passo: manda para a tela da Microsoft
    if (!code) {
      const novo = crypto.randomUUID();
      await rest("onedrive_autorizacao_estado", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: novo }) });
      const m = new URL("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
      m.search = new URLSearchParams({
        client_id: MS_ID, redirect_uri: VOLTA, response_type: "code", response_mode: "query",
        scope: MS_ESCOPOS, prompt: "select_account", state: novo,
      }).toString();
      return Response.redirect(m.toString(), 302);
    }

    // 2º passo: volta da Microsoft
    const achado = await rest(`onedrive_autorizacao_estado?estado=eq.${encodeURIComponent(estado)}&criado_em=gte.${encodeURIComponent(new Date(Date.now() - 20 * 60000).toISOString())}`, {
      method: "DELETE", headers: { Prefer: "return=representation" },
    });
    if (!achado?.length) return texto("Link vencido", "Abra o link de autorização de novo e conclua em até 20 minutos.", false);

    const r = await fetch(MS_TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: MS_ID, client_secret: MS_SEGREDO, redirect_uri: VOLTA, grant_type: "authorization_code", scope: MS_ESCOPOS }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.refresh_token) { console.error("troca", JSON.stringify(d)); return texto("Não deu certo", "A Microsoft recusou a autorização. Tente de novo.", false); }

    // confere o OneDrive
    const g = await fetch("https://graph.microsoft.com/v1.0/me/drive?$select=id,owner", { headers: { Authorization: `Bearer ${d.access_token}` } });
    const drv = await g.json().catch(() => ({}));
    const driveId = String(drv.id || "").toLowerCase();
    if (driveId !== DRIVE_CERTO) return texto("OneDrive errado", `Esta conta não é a dona do OneDrive da Certificação (C:\\NUVEM\\OneDrive). Entre com a conta do escritório. Nada foi alterado.`, false);

    await rest("onedrive_autorizacao?on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: 1, refresh_token: d.refresh_token, conta: drv.owner?.user?.displayName || "", drive_id: driveId, escopos: d.scope, autorizado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }),
    });
    await rest(`onedrive_autorizacao_estado?criado_em=lt.${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`, { method: "DELETE" }).catch(() => null);
    return texto("OneDrive autorizado", "Pronto. Os arquivos da Certificação do LOP - Gestão Rápida agora são gravados e lidos direto no OneDrive do escritório. Pode fechar esta página.", true);
  } catch (e) {
    console.error(String(e));
    return texto("Não deu certo", "Erro no servidor. Tente de novo em alguns minutos.", false);
  }
});
