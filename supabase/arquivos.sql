-- Anexos do LOP - Gestão Rápida no Google Drive (15/10/2026) — já aplicado no
-- Supabase como migração "arquivos_no_drive". Uma linha por arquivo; o conteúdo
-- fica no Drive (conta escritoriosakuma1), enviado pela função "arquivos".
create table if not exists public.arquivos (
  chave       text primary key,
  area        text not null check (area in ('pessoas','manutencoes','certificacao')),
  tipo        text not null check (tipo in ('funcionario','treinamento','exame','os','checklist','documento')),
  dono_id     text not null,
  nome        text not null,
  mime        text not null,
  tamanho     bigint not null default 0,
  drive_id    text not null,
  enviado_por text default public.app_email(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists arquivos_dono on public.arquivos (area, tipo, dono_id);

-- Quem lê e quem grava, por área/tipo:
--   foto do funcionário  → todo login do app vê; grava quem tem Cadastros (pessoas) ou RH
--   treinamento / exame  → SST ou EPI's gravam e veem; Cadastros e RH só veem
--   documento da Certificação → módulo Certificação
--   OS / check list      → módulo Manutenções
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_area = 'pessoas' and p_tipo = 'funcionario' then
      case when p_escrever then public.app_pode_algum('{pessoas,rh}'::text[])
           else exists (select 1 from public.app_usuarios where lower(email) = public.app_email()) end
    when p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
      public.app_pode_algum('{sst,epis}'::text[]) or (not p_escrever and public.app_pode_algum('{pessoas,rh}'::text[]))
    when p_area = 'certificacao' and p_tipo = 'documento' then public.app_pode_algum('{cert,certificacao}'::text[])
    when p_area = 'manutencoes' and p_tipo in ('os','checklist') then public.app_pode('manutencoes')
    else false end;
$$;
grant execute on function public.arquivo_pode(text,text,boolean) to authenticated;

alter table public.arquivos enable row level security;
revoke all on public.arquivos from anon;
grant select, insert, update, delete on public.arquivos to authenticated;
create policy arquivos_le     on public.arquivos for select to authenticated using (public.arquivo_pode(area, tipo, false));
create policy arquivos_insere on public.arquivos for insert to authenticated with check (public.arquivo_pode(area, tipo, true));
create policy arquivos_altera on public.arquivos for update to authenticated using (public.arquivo_pode(area, tipo, true)) with check (public.arquivo_pode(area, tipo, true));
create policy arquivos_apaga  on public.arquivos for delete to authenticated using (public.arquivo_pode(area, tipo, true));
