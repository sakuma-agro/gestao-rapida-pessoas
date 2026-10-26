-- cert-fauna.sql — Certificação › Biodiversidade: monitoramento de animais (FORM 050), 26/10/2026.
-- Pedido do Guilherme: "Form 050, vamos fazer um painel dentro do app, de
-- monitoramento de animais". Substitui a planilha FORM 050 - MONITORAMENTO DE
-- ANIMAIS.xlsx (Plano de Biodiversidade, câmeras de trilha).
--
-- Pode rodar de novo sem estragar nada. Permissão: módulo 'cert' (ou admin).
-- Aplicado no Supabase como migração "cert_fauna_monitoramento".
--
--  · cf_especies  — catálogo: nome comum, científico, família, classe, status IUCN e Brasil (MMA), exótica
--  · cf_cameras   — as câmeras de trilha (nome, local, coordenadas, instalação, ativa)
--  · cf_registros — cada flagrante: data, hora, espécie, câmera, tipo (foto/vídeo…), evidência (link OneDrive) e anexos no Drive
create extension if not exists pgcrypto;

create table if not exists public.cf_especies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                 -- nome comum
  cientifico text,                    -- gênero/espécie
  familia text,
  classe text not null default 'Ave' check (classe in ('Ave','Mamífero','Réptil','Anfíbio','Outro')),
  status_iucn text check (status_iucn in ('LC','NT','VU','EN','CR','DD','NE')),
  status_brasil text check (status_brasil in ('VU','EN','CR')),  -- Lista nacional (Portaria MMA 148/2022); vazio = não consta
  exotica boolean not null default false,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists cf_especies_nome on public.cf_especies(lower(nome));

create table if not exists public.cf_cameras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                 -- Câmera 1…
  local text,                         -- onde está (mata, APP, trilha…)
  fazenda text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  instalada_em date,
  ativa boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists cf_cameras_nome on public.cf_cameras(lower(nome));

create table if not exists public.cf_registros (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora time,
  especie_id uuid not null references public.cf_especies(id),
  camera_id uuid references public.cf_cameras(id),
  tipo text not null default 'Foto' check (tipo in ('Foto','Vídeo','Avistamento','Vestígio')),
  individuos int check (individuos is null or individuos > 0),
  evidencia text,                     -- link do OneDrive (foto ou vídeo)
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cf_registros_data on public.cf_registros(data desc, hora desc);
create index if not exists cf_registros_especie on public.cf_registros(especie_id);

do $$ declare t text; begin
  foreach t in array array['cf_especies','cf_cameras','cf_registros'] loop
    execute format('drop trigger if exists cf_carimbo on public.%I', t);
    execute format('create trigger cf_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cf_leem on public.%I', t);
    execute format('drop policy if exists cf_inserem on public.%I', t);
    execute format('drop policy if exists cf_alteram on public.%I', t);
    execute format('drop policy if exists cf_apagam on public.%I', t);
    execute format('create policy cf_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cf_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy cf_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    execute format('create policy cf_apagam on public.%I for delete to authenticated using (public.app_pode(''cert''))', t);
  end loop;
end $$;

-- Anexos (fotos) dos registros no Google Drive: certificacao/fauna/<id do registro>/….jpg
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_area = 'pessoas' and p_tipo = 'funcionario' then
      case when p_escrever then public.app_pode_algum('{pessoas,rh}'::text[])
           else exists (select 1 from public.app_usuarios where lower(email) = public.app_email()) end
    when p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
      public.app_pode_algum('{sst,epis}'::text[]) or (not p_escrever and public.app_pode_algum('{pessoas,rh}'::text[]))
    when p_area = 'certificacao' and p_tipo in ('documento','caderno','fauna') then public.app_pode_algum('{cert,certificacao}'::text[])
    when p_area = 'manutencoes' and p_tipo in ('os','checklist','maquina','patrimonio') then public.app_pode('manutencoes')
    when p_area = 'programacao' and p_tipo in ('diario','atividade','reuniao') then public.app_pode('programacao')
    else false end;
$$;
