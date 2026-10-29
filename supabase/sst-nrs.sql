-- SST › NRs (29/10/2026): o que o botão "Atualizar do portal" traz do gov.br
-- (função consulta-nrs), uma linha por NR. Aplicado pelo conector em 29/10/2026.
create table if not exists public.sst_nrs_portal (
  nr integer primary key,
  titulo text,
  pagina text,
  texto_pdf text,
  texto_ano integer,
  atualizado_portal date,
  ultima_portaria text,
  ultima_portaria_link text,
  portarias jsonb not null default '[]'::jsonb,
  revogada boolean not null default false,
  mudou_em timestamptz,
  conferido_em timestamptz not null default now(),
  conferido_por text
);
alter table public.sst_nrs_portal enable row level security;
create policy logados_leem on public.sst_nrs_portal for select to authenticated using (true);
create policy modulo_insere on public.sst_nrs_portal for insert to authenticated with check (app_pode_algum('{sst,epis}'::text[]));
create policy modulo_altera on public.sst_nrs_portal for update to authenticated using (app_pode_algum('{sst,epis}'::text[])) with check (app_pode_algum('{sst,epis}'::text[]));
grant select, insert, update on public.sst_nrs_portal to authenticated;
