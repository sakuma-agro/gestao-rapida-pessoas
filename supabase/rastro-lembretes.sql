-- Rastro — lembrete com aviso no celular (16/11/2026, pedido do Guilherme).
-- "Criar a tarefa e um lembrete que vibre no celular quando chegar a hora";
-- avisa só o responsável; opção "lembrar 15 min antes".
--
--   cron_tarefas.lembrete_hora / lembrete_antes : hora da tarefa e quantos
--       minutos antes avisar (0 = na hora). Vale para todas as vezes da rotina.
--   push_inscricoes : cada aparelho que tocou em "Ativar avisos" (Web Push),
--       ligado à pessoa do escritório (reu_pessoas).
--   cron_lembretes  : fila dos avisos dos próximos dias — quem monta é o
--       próprio app ao abrir o Rastro (ele já sabe calcular cada vez da
--       rotina); o servidor só envia.
--   pg_cron, a cada minuto: se há aviso vencido, chama a edge function
--   lembretes-push (token em integracoes_tokens 'lembretes-push'; chaves
--   VAPID em 'vapid-privada' / 'vapid-publica').
-- Aplicado no banco pela migração rastro_lembretes_push.

alter table public.cron_tarefas
  add column if not exists lembrete_hora time,
  add column if not exists lembrete_antes smallint;

create table if not exists public.push_inscricoes (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_id uuid not null,
  email text,
  pessoa_id text references public.reu_pessoas(id) on delete set null,
  aparelho text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_inscricoes_meus on public.push_inscricoes;
create policy push_inscricoes_meus on public.push_inscricoes for select to authenticated
  using (user_id = auth.uid());

-- O mesmo celular pode trocar de usuário: a inscrição passa para quem ativou por último.
create or replace function public.push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_pessoa text, p_aparelho text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.app_pode('cronograma') then raise exception 'sem acesso'; end if;
  insert into push_inscricoes (endpoint, p256dh, auth, user_id, email, pessoa_id, aparelho)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), public.app_email(), nullif(p_pessoa, ''), p_aparelho)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    email = excluded.email, pessoa_id = excluded.pessoa_id, aparelho = excluded.aparelho, atualizado_em = now();
end $$;
create or replace function public.push_sair(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.push_inscrever(text, text, text, text, text) from public, anon;
revoke all on function public.push_sair(text) from public, anon;
grant execute on function public.push_inscrever(text, text, text, text, text) to authenticated;
grant execute on function public.push_sair(text) to authenticated;

create table if not exists public.cron_lembretes (
  id text primary key,                 -- chave do item | pessoa
  chave text not null,                 -- t:<id> ou t:<id>:<data>
  tarefa_id uuid,
  pessoa_id text not null references public.reu_pessoas(id) on delete cascade,
  titulo text not null,
  quando timestamptz not null,         -- hora da tarefa
  avisar_em timestamptz not null,      -- quando - antes
  antes smallint not null default 0,
  enviado_em timestamptz,
  resultado text,
  privada boolean not null default false,
  dono_email text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cron_lembretes_pendentes on public.cron_lembretes (avisar_em) where enviado_em is null;
alter table public.cron_lembretes enable row level security;
drop policy if exists cron_lembretes_todos on public.cron_lembretes;
create policy cron_lembretes_todos on public.cron_lembretes for all to authenticated
  using (public.app_pode('cronograma') and (not privada or lower(coalesce(dono_email,'')) = public.app_email()))
  with check (public.app_pode('cronograma') and (not privada or lower(coalesce(dono_email,'')) = public.app_email()));

-- Só chama a função quando há aviso para sair (não gasta nada nos outros minutos).
create or replace function public.cron_lembretes_disparar()
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not exists (select 1 from cron_lembretes where enviado_em is null
                 and avisar_em <= now() and avisar_em > now() - interval '3 hours') then return; end if;
  select token into k from integracoes_tokens where nome = 'lembretes-push';
  if k is null then return; end if;
  perform net.http_post(
    url := 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/lembretes-push?k=' || k,
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.cron_lembretes_disparar() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule('rastro-lembretes') where exists (select 1 from cron.job where jobname = 'rastro-lembretes');
select cron.schedule('rastro-lembretes', '* * * * *', 'select public.cron_lembretes_disparar()');

-- Limpeza: aviso enviado há mais de 30 dias sai da fila (todo dia às 3h).
select cron.unschedule('rastro-lembretes-limpar') where exists (select 1 from cron.job where jobname = 'rastro-lembretes-limpar');
select cron.schedule('rastro-lembretes-limpar', '0 6 * * *',
  $$delete from public.cron_lembretes where coalesce(enviado_em, avisar_em) < now() - interval '30 days'$$);
