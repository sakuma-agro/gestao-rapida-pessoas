-- Área Cronograma geral do LOP - Gestão Rápida (28/10/2026, pedido dele).
-- Junta num lugar só as tarefas e os vencimentos de todas as áreas, por
-- pessoa do escritório, com visão de Calendário e de Kanban.
--
--   cron_tarefas : tarefas lançadas à mão (podem repetir toda semana ou mês)
--   cron_estado  : situação (a fazer / fazendo / feito) e responsável de cada
--                  item automático (vencimento vindo de outra área) e de cada
--                  ocorrência de tarefa que repete. chave = 'origem:id[:data]'
--   cron_config  : responsável padrão de cada origem automática ('responsaveis')
--                  e de cada área/unidade ('responsaveis_area')
--
-- As pessoas são as do escritório (reu_pessoas, as mesmas da reunião
-- semanal). Quem entra: administrador ou módulo 'cronograma'
-- (public.app_pode('cronograma')). Rodar uma vez; só cria o que não existe.

create table if not exists public.cron_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  area text not null default 'escritorio',
  responsavel_id text references public.reu_pessoas(id),
  data date not null,
  recorrencia text not null default 'nenhuma'
    check (recorrencia in ('nenhuma','semanal','mensal')),
  ate date,
  situacao text not null default 'afazer'
    check (situacao in ('afazer','fazendo','feito')),
  feita_em date,
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.cron_estado (
  chave text primary key,
  situacao text not null default 'afazer'
    check (situacao in ('afazer','fazendo','feito')),
  responsavel_id text references public.reu_pessoas(id),
  feita_em date,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.cron_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.cron_tarefas enable row level security;
alter table public.cron_estado enable row level security;
alter table public.cron_config enable row level security;

drop policy if exists cron_tarefas_todos on public.cron_tarefas;
create policy cron_tarefas_todos on public.cron_tarefas for all to authenticated
  using (public.app_pode('cronograma')) with check (public.app_pode('cronograma'));
drop policy if exists cron_estado_todos on public.cron_estado;
create policy cron_estado_todos on public.cron_estado for all to authenticated
  using (public.app_pode('cronograma')) with check (public.app_pode('cronograma'));
drop policy if exists cron_config_ler on public.cron_config;
create policy cron_config_ler on public.cron_config for select to authenticated
  using (public.app_pode('cronograma'));
drop policy if exists cron_config_gravar on public.cron_config;
create policy cron_config_gravar on public.cron_config for all to authenticated
  using (public.app_admin()) with check (public.app_admin());

create index if not exists cron_tarefas_data on public.cron_tarefas (data);

-- 07/11/2026 — Cronograma geral: reunião matinal de 15 minutos (pedido do Guilherme).
-- Situação Bloqueado (com "depende de"), Foco do dia (foco_em) e importação do Trello.
alter table public.cron_tarefas drop constraint if exists cron_tarefas_situacao_check;
alter table public.cron_tarefas add constraint cron_tarefas_situacao_check check (situacao in ('afazer','fazendo','bloqueado','feito'));
alter table public.cron_estado drop constraint if exists cron_estado_situacao_check;
alter table public.cron_estado add constraint cron_estado_situacao_check check (situacao in ('afazer','fazendo','bloqueado','feito'));
alter table public.cron_tarefas
  add column if not exists bloq_motivo text,
  add column if not exists bloq_quem text references public.reu_pessoas(id),
  add column if not exists bloq_cobrar date,
  add column if not exists bloq_desde date,
  add column if not exists inicio_em date,
  add column if not exists foco_em date,
  add column if not exists trello_id text;
create unique index if not exists cron_tarefas_trello_id_uq on public.cron_tarefas(trello_id) where trello_id is not null;
alter table public.cron_estado
  add column if not exists bloq_motivo text,
  add column if not exists bloq_quem text references public.reu_pessoas(id),
  add column if not exists bloq_cobrar date,
  add column if not exists bloq_desde date,
  add column if not exists inicio_em date,
  add column if not exists foco_em date;

-- 07/11/2026 — rotinas do Trello com checklist e ligação com as telas do app.
alter table public.cron_tarefas add column if not exists checklist jsonb, add column if not exists checks jsonb, add column if not exists ir text;
alter table public.cron_estado add column if not exists checks jsonb;

-- 09/11/2026 — número fixo de cada tarefa (#123) para falar na reunião e pesquisar.
-- cron_numerar(chaves) dá o próximo número às chaves que ainda não têm, na ordem enviada.
create table if not exists public.cron_numeros (
  chave text primary key,
  numero bigint generated always as identity unique,
  criado_em timestamptz not null default now()
);
alter table public.cron_numeros enable row level security;
drop policy if exists cron_numeros_ler on public.cron_numeros;
create policy cron_numeros_ler on public.cron_numeros for select to authenticated using (public.app_pode('cronograma'));
drop policy if exists cron_numeros_inserir on public.cron_numeros;
create policy cron_numeros_inserir on public.cron_numeros for insert to authenticated with check (public.app_pode('cronograma'));
create or replace function public.cron_numerar(p_chaves text[])
returns table(chave text, numero bigint)
language plpgsql security invoker set search_path = public as $$
begin
  insert into public.cron_numeros(chave)
  select u.c from unnest(p_chaves) with ordinality as u(c, o)
  where u.c is not null and not exists (select 1 from public.cron_numeros n where n.chave = u.c)
  order by u.o
  on conflict do nothing;
  return query select n.chave, n.numero from public.cron_numeros n where n.chave = any(p_chaves);
end $$;
grant execute on function public.cron_numerar(text[]) to authenticated;

-- 09/11/2026 — rotinas do Trello separadas em um cartão por grupo do checklist
-- (pedido dele: "igual ao Trello"). Os 23 cartões "Rotina · …" ficaram com
-- ativo = false (não foram apagados); os novos têm descricao 'Rotina · <quando>'
-- e checklist com um só grupo. Situação, foco e marcações de hoje foram levados
-- para os cartões novos (cron_estado com a mesma data).
