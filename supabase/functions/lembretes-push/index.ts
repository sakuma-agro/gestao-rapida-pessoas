// lembretes-push — Rastro: aviso no celular na hora do lembrete (16/11/2026).
//
// Pedido do Guilherme: "criar a tarefa e um lembrete que vibre no celular
// quando chegar a data", só para o responsável, com "lembrar 15 min antes".
//
// Quem chama: o pg_cron, a cada minuto, por public.cron_lembretes_disparar()
// — e só quando há aviso vencido. Segurança: ?k=<token> igual ao de
// integracoes_tokens 'lembretes-push' (verify_jwt desligado).
// O app monta a fila (cron_lembretes); aqui só se envia (Web Push, VAPID).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const resp = (t: string, s = 200) => new Response(t, { status: s, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
const hora = (d: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const dia = (d: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(d));
const quanto = (m: number) => m >= 1440 ? (m === 1440 ? '1 dia' : `${Math.round(m / 1440)} dias`) : m >= 60 ? (m === 60 ? '1 hora' : `${Math.round(m / 60)} horas`) : `${m} min`;

Deno.serve(async req => {
  const url = new URL(req.url);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: toks } = await db.from('integracoes_tokens').select('nome,token').in('nome', ['lembretes-push', 'vapid-privada', 'vapid-publica']);
  const tk = Object.fromEntries((toks || []).map(t => [t.nome, t.token]));
  if (!tk['lembretes-push'] || url.searchParams.get('k') !== tk['lembretes-push']) return resp('não autorizado', 401);
  webpush.setVapidDetails('https://sakuma-agro.github.io/gestao-rapida-pessoas/', tk['vapid-publica'], tk['vapid-privada']);

  // pega os vencidos de uma vez (marcando), para dois disparos seguidos não mandarem duas vezes
  const agora = new Date(), limite = new Date(agora.getTime() - 3 * 3600e3);
  const { data: lista, error } = await db.from('cron_lembretes')
    .update({ enviado_em: agora.toISOString(), resultado: 'enviando' })
    .is('enviado_em', null).lte('avisar_em', agora.toISOString()).gt('avisar_em', limite.toISOString())
    .select('*');
  if (error) return resp('erro: ' + error.message, 500);
  if (!lista?.length) return resp('nada');

  let enviados = 0;
  for (const l of lista) {
    let resultado = '';
    try {
      // concluída ou apagada depois que o aviso entrou na fila: não avisa
      const { data: t } = l.tarefa_id ? await db.from('cron_tarefas').select('ativo,situacao,recorrencia').eq('id', l.tarefa_id).maybeSingle() : { data: null };
      let feito = !t || t.ativo === false || ((t.recorrencia || 'nenhuma') === 'nenhuma' && t.situacao === 'feito');
      if (!feito && t && t.recorrencia !== 'nenhuma') {
        const { data: e } = await db.from('cron_estado').select('situacao').eq('chave', l.chave).maybeSingle();
        feito = e?.situacao === 'feito';
      }
      if (feito) { resultado = 'cancelado (concluída)'; }
      else {
        const { data: subs } = await db.from('push_inscricoes').select('*').eq('pessoa_id', l.pessoa_id);
        if (!subs?.length) resultado = 'sem aparelho ativado';
        else {
          const ehHoje = dia(l.quando) === dia(agora.toISOString());
          const quandoTxt = `${ehHoje ? '' : dia(l.quando) + ' '}às ${hora(l.quando)}`;
          const payload = JSON.stringify({
            title: '⏰ ' + l.titulo,
            body: l.antes > 0 ? `Daqui a ${quanto(l.antes)} — ${quandoTxt}` : `Agora — ${quandoTxt}`,
            tag: l.id,
            url: './?area=cronograma&tarefa=' + encodeURIComponent(l.chave),
          });
          let ok = 0;
          for (const s of subs) {
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' });
              ok++;
            } catch (e) {
              const st = (e as { statusCode?: number }).statusCode;
              if (st === 404 || st === 410) await db.from('push_inscricoes').delete().eq('endpoint', s.endpoint);
              else console.warn('push falhou', st, String(e).slice(0, 200));
            }
          }
          enviados += ok;
          resultado = `enviado ${ok}/${subs.length}`;
        }
      }
    } catch (e) {
      resultado = 'erro: ' + String(e).slice(0, 180);
    }
    await db.from('cron_lembretes').update({ resultado }).eq('id', l.id);
  }
  return resp(`ok ${lista.length} lembrete(s), ${enviados} aviso(s)`);
});
