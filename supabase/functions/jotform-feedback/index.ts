// jotform-feedback — Certificação › Forms › Reclamações e sugestões (FORM 042), 26/10/2026.
//
// Pedido do Guilherme: o QR Code colado na fazenda abre o JotForm
// "FORMAGR-042 - Formulário reclamação e sugestão" (anônimo: tipo, local e o
// texto). Cada resposta chega aqui pelo webhook do JotForm e vira um caso
// FEEDBACK em cmc_casos, etapa RECEBIDO, via "QR CODE (JOTFORM)".
//
// Segurança: o endereço do webhook leva ?k=<token>; o token fica na tabela
// integracoes_tokens (só o servidor lê). Também confere o número do formulário.
// A mesma resposta não entra duas vezes (origem_externa = jotform:<submissionID>).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
// 12/11/2026: novo tipo DENÚNCIA (assédio moral, sexual, discriminação…) — pedido do Guilherme.
// Entra como prioridade URGENTE e, pelo RLS (supabase/cert-denuncias.sql), só os admins do app veem.

const FORM_ID = '243023601071642';
const TIPOS = ['RECLAMAÇÃO', 'SUGESTÃO', 'ELOGIO', 'DENÚNCIA'];
const FAZENDAS: [RegExp, string][] = [
  [/faca/i, 'FACA'], [/lote\s*35/i, 'LOTE 35 PADAP'], [/tr[eê]s\s*riachos/i, 'TRÊS RIACHOS'],
  [/morro\s*branco/i, 'MORRO BRANCO'], [/quebra\s*coc[aã]o/i, 'QUEBRA COCÃO'],
];
const semAc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
/** "DENÚNCIA (assédio, …)" também conta como DENÚNCIA (nome do tipo seguido de parênteses). */
const ehTipo = (v: string, t: string) => { const a = semAc(v), b = semAc(t); return a === b || (a.startsWith(b + ' (') && a.length < 80); };
const resp = (t: string, s = 200) => new Response(t, { status: s, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** Os valores das respostas, venham de rawRequest (JSON) ou de "pretty". */
function valores(campos: Record<string, string>): string[] {
  const out: string[] = [];
  try {
    const raw = JSON.parse(campos.rawRequest || '{}');
    for (const [k, v] of Object.entries(raw)) {
      if (!/^q\d+_/.test(k)) continue;
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) out.push(v.join(', '));
      else if (v && typeof v === 'object') out.push(Object.values(v as Record<string, unknown>).join(' '));
    }
  } catch { /* segue para o pretty */ }
  if (!out.length && campos.pretty) {
    // "Tipo de feedback:SUGESTÃO, Local:Faz. Faca, Descreva seu feedback:texto"
    for (const parte of campos.pretty.split(/,\s*(?=[^,:]{2,40}:)/)) {
      const i = parte.indexOf(':'); if (i > 0) out.push(parte.slice(i + 1).trim());
    }
  }
  return out.map(v => String(v || '').trim()).filter(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resp('ok');
  const url = new URL(req.url);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: tk } = await sb.from('integracoes_tokens').select('token').eq('nome', 'jotform-feedback').maybeSingle();
  if (!tk?.token || url.searchParams.get('k') !== tk.token) return resp('não autorizado', 401);

  // JotForm manda multipart/form-data (às vezes urlencoded); JSON também é aceito para teste.
  const campos: Record<string, string> = {};
  const tipoConteudo = req.headers.get('content-type') || '';
  try {
    if (tipoConteudo.includes('application/json')) Object.assign(campos, await req.json());
    else { const fd = await req.formData(); fd.forEach((v, k) => { campos[k] = typeof v === 'string' ? v : ''; }); }
  } catch { return resp('corpo inválido', 400); }

  if (campos.formID && String(campos.formID) !== FORM_ID) return resp('formulário errado', 400);
  const vals = valores(campos);
  const tipo = TIPOS.find(t => vals.some(v => ehTipo(v, t))) || 'SUGESTÃO';
  const valFaz = vals.find(v => FAZENDAS.some(([re]) => re.test(v)) && v.length < 40);
  const fazenda = valFaz ? FAZENDAS.find(([re]) => re.test(valFaz))![1] : null;
  const texto = vals.filter(v => v !== valFaz && !TIPOS.some(t => ehTipo(v, t)))
    .sort((a, b) => b.length - a.length)[0] || '';
  if (!texto) return resp('sem texto', 200);   // nada a registrar (não faz o JotForm tentar de novo)

  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);   // horário de Brasília
  const titulo = texto.length > 90 ? texto.slice(0, 87).trimEnd() + '…' : texto;
  const sid = campos.submissionID || campos.submission_id || '';
  const { error } = await sb.from('cmc_casos').insert({
    natureza: 'FEEDBACK', tipo, titulo, prioridade: tipo === 'DENÚNCIA' ? 'URGENTE' : null, descricao: texto, via: 'QR CODE (JOTFORM)',
    fazenda, local: valFaz || null, solicitante: null, etapa: 'RECEBIDO', data_abertura: hoje,
    origem_externa: sid ? 'jotform:' + sid : null, criado_por: 'JotForm (QR Code)',
  });
  if (error && !/duplicate key|cmc_casos_origem_externa/.test(error.message)) return resp('erro: ' + error.message, 500);
  return resp('registrado');
});
