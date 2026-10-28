-- Área Cronograma geral do LOP - Gestão Rápida (28/10/2026, pedido dele).
-- Junta num lugar só as tarefas e os vencimentos de todas as áreas, por
-- pessoa do escritório, com visão de Calendário e de Kanban.
--
--   cron_tarefas : tarefas lançadas à mão (podem repetir toda semana ou mês)
--   cron_estado  : situação (a fazer / fazendo / feito) e responsável de cada
--                  item automático (vencimento vindo de outra área) e de cada
--                  ocorrência de tarefa que repete. chave = 'origem:id[:data]'
--   cron_config  : responsável padrão de cada origem automática
--
-- As pessoas são as do escritório (reu_pessoas, as mesmas da reunião
-- semanal). Quem entra: administrador ou módulo 'cronograma'
-- (public.app_pode('cronograma')). Rodar uma vez; só cria o que não existe.

create table if not exists public.cron_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  area text not null default 'escritorio',
  responsavel_id uuid references public.reu_pessoas(id),
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
  responsavel_id uuid references public.reu_pessoas(id),
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
