-- SST › Brigada e primeiros socorros (22/10/2026)
-- Pedido do Guilherme: mostrar quantos brigadistas e socorristas a SAKUMA
-- tem, quantos precisa ter (mínimo digitado por ele, um número para a
-- empresa toda) e avisar quando um desligamento ou vencimento deixa abaixo.
--
-- Quem conta = ativo + designado na atividade (sst_atividade_funcionarios)
-- + treinamento da atividade em dia. As duas atividades ficam em
-- sst_atividades; aqui só se guarda o mínimo e qual atividade é qual.

create table if not exists public.sst_brigada_config (
  id               int primary key default 1 check (id = 1),
  min_brigada      int not null default 0 check (min_brigada >= 0),
  min_socorros     int not null default 0 check (min_socorros >= 0),
  aviso_dias       int not null default 60 check (aviso_dias between 0 and 365),
  atividade_brigada_id  uuid references public.sst_atividades(id) on delete set null,
  atividade_socorros_id uuid references public.sst_atividades(id) on delete set null,
  atualizado_em    timestamptz not null default now(),
  atualizado_por   text
);

alter table public.sst_brigada_config enable row level security;
drop policy if exists logados_leem on public.sst_brigada_config;
create policy logados_leem on public.sst_brigada_config for select to authenticated using (true);
drop policy if exists modulo_insere on public.sst_brigada_config;
create policy modulo_insere on public.sst_brigada_config for insert to authenticated with check (app_pode_algum('{sst,epis}'::text[]));
drop policy if exists modulo_altera on public.sst_brigada_config;
create policy modulo_altera on public.sst_brigada_config for update to authenticated
  using (app_pode_algum('{sst,epis}'::text[])) with check (app_pode_algum('{sst,epis}'::text[]));

-- atividade "Primeiros socorros", ligada ao curso de primeiros socorros
insert into public.sst_atividades (nome, descricao, ativo, ordem)
select 'Primeiros socorros', 'Socorristas designados (pessoa treinada em primeiros socorros)', true,
       coalesce((select ordem from public.sst_atividades where nome = 'Brigada de incêndio' limit 1), 10) + 1
where not exists (select 1 from public.sst_atividades where nome = 'Primeiros socorros');

insert into public.sst_atividade_treinamentos (atividade_id, tipo_id)
select a.id, t.id
from public.sst_atividades a, public.sst_tipos_treinamento t
where a.nome = 'Primeiros socorros'
  and t.nome = 'CURSO DE PREVENÇÃO DE ACIDENTES E NOÇÕES BÁSICAS DE PRIMEIROS SOCORROS'
  and not exists (select 1 from public.sst_atividade_treinamentos x where x.atividade_id = a.id and x.tipo_id = t.id);

insert into public.sst_brigada_config (id, atividade_brigada_id, atividade_socorros_id)
select 1,
  (select id from public.sst_atividades where nome = 'Brigada de incêndio' limit 1),
  (select id from public.sst_atividades where nome = 'Primeiros socorros' limit 1)
on conflict (id) do nothing;

-- 22/10/2026 (tarde): cursos que também valem como primeiros socorros
-- (a brigada orgânica ITMG-12 "E PRIMEIRO SOCORROS" já inclui o conteúdo).
alter table public.sst_brigada_config add column if not exists socorros_equivalentes uuid[] not null default '{}';
update public.sst_brigada_config set socorros_equivalentes = array(
  select id from public.sst_tipos_treinamento where nome ilike '%ITMG-12%' and nome ilike '%INICIAL%')
where id = 1 and socorros_equivalentes = '{}';
