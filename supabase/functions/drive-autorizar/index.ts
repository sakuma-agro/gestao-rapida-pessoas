// drive-autorizar — autoriza o Google Drive do LOP - Gestão Rápida com um clique (15/10/2026).
//
// Abrir esta função no navegador leva para a tela do Google; depois de confirmar
// com a conta escritoriosakuma1@gmail.com, a autorização (refresh token) fica
// guardada na tabela public.drive_autorizacao, que só as funções leem.
// Ninguém copia nem cola token. Outra conta do Google é recusada.
//
// Usa o mesmo cliente OAuth das fotos (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
// O endereço desta função está em "URIs de redirecionamento autorizados" do
// cliente "fotos" no Google Cloud (projeto sakuma-vistorias-fotos).
// O Supabase não deixa função mostrar página HTML no domínio padrão, então o
// resultado volta como texto simples.

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const CONTA = "escritoriosakuma1@gmail.com";
const VOLTA = `${URL_BASE}/functions/v1/drive-autorizar`;
const ESCOPOS = "https://www.googleapis.com/auth/drive.file openid email";

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

function emailDoIdToken(t: string): string {
  try {
    const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(p + "===".slice((p.length + 3) % 4))).email || "").toLowerCase();
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (!G_ID || !G_SEGREDO || !SERVICO) return texto("Falta configuração", "O cliente do Google não está configurado no servidor.", false);
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const estado = u.searchParams.get("state") || "";
  const erro = u.searchParams.get("error");

  try {
    if (erro) return texto("Autorização cancelada", "Nada foi alterado. A autorização anterior continua valendo.", false);

    // 1º passo: manda para a tela do Google
    if (!code) {
      const novo = crypto.randomUUID();
      await rest("drive_autorizacao_estado", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ estado: novo }) });
      const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      g.search = new URLSearchParams({
        client_id: G_ID, redirect_uri: VOLTA, response_type: "code", scope: ESCOPOS,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", login_hint: CONTA, state: novo,
      }).toString();
      return Response.redirect(g.toString(), 302);
    }

    // 2º passo: volta do Google
    const achado = await rest(`drive_autorizacao_estado?estado=eq.${encodeURIComponent(estado)}&criado_em=gte.${encodeURIComponent(new Date(Date.now() - 20 * 60000).toISOString())}`, {
      method: "DELETE", headers: { Prefer: "return=representation" },
    });
    if (!achado?.length) return texto("Link vencido", "Abra o link de autorização de novo e conclua em até 20 minutos.", false);

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SEGREDO, redirect_uri: VOLTA, grant_type: "authorization_code" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("troca", JSON.stringify(d)); return texto("Não deu certo", "O Google recusou a autorização. Tente de novo.", false); }

    const email = emailDoIdToken(d.id_token || "");
    if (email !== CONTA) return texto("Conta errada", `A autorização precisa ser feita com ${CONTA}. Nada foi alterado.`, false);
    if (!String(d.scope || "").includes("drive.file")) return texto("Falta permissão", "Marque a permissão do Google Drive na tela do Google e tente de novo.", false);
    if (!d.refresh_token) return texto("Não deu certo", "O Google não devolveu a autorização permanente. Tente de novo.", false);

    await rest("drive_autorizacao?on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: 1, refresh_token: d.refresh_token, conta: email, escopos: d.scope, autorizado_em: new Date().toISOString() }),
    });
    await rest(`drive_autorizacao_estado?criado_em=lt.${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`, { method: "DELETE" }).catch(() => null);
    return texto("Google Drive autorizado", `Pronto. Os anexos do LOP - Gestão Rápida e as fotos das Vistorias usam o Drive de ${CONTA}, sem prazo para vencer. Pode fechar esta página.`, true);
  } catch (e) {
    console.error(String(e));
    return texto("Não deu certo", "Erro no servidor. Tente de novo em alguns minutos.", false);
  }
});
