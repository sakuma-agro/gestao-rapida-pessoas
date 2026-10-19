-- ═══════════════════════════════════════════════════════════════════════════
-- LOP - Gestão Rápida · área VISTORIAS E SEGURANÇA
-- Tudo da área mora no esquema "vistorias", separado de Pessoas e Manutenções.
-- Veio do projeto antigo "SAKUMA Vistorias & Segurança" (jhwnmtekxsdkhvgcjzhj),
-- com as mesmas regras, e passa a usar o login e os módulos do LOP:
--   • só entra quem tem o módulo "vistorias" em app_usuarios (ou é admin do LOP);
--   • administrador da área = admin do LOP ou quem está em vistorias.administradores;
--   • "Vê todas" (ve_tudo) = admin do LOP ou marcado em vistorias.administradores.
-- Diferente do app antigo: lista de administradores vazia NÃO libera ninguém
-- (no LOP sempre existe o admin do sistema).
-- Pode rodar de novo sem quebrar nada.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists vistorias;
grant usage on schema vistorias to authenticated, service_role;

-- ─────────────────────────── funções base ───────────────────────────
create or replace function vistorias.marca_atualizacao()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

create table if not exists vistorias.administradores (
  email      text primary key,
  nome       text,
  ve_tudo    boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);

create or replace function vistorias.pode_usar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_pode('vistorias');
$$;

create or replace function vistorias.eh_admin()
returns boolean language sql stable security definer set search_path = vistorias, public as $$
  select public.app_admin()
      or (public.app_pode('vistorias') and exists (
            select 1 from vistorias.administradores a where lower(a.email) = public.app_email()));
$$;

create or replace function vistorias.ve_tudo()
returns boolean language sql stable security definer set search_path = vistorias, public as $$
  select public.app_admin()
      or (public.app_pode('vistorias') and exists (
            select 1 from vistorias.administradores a where lower(a.email) = public.app_email() and a.ve_tudo));
$$;

-- ─────────────────────────── tabelas ───────────────────────────
create table if not exists vistorias.vistorias (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id),
  codigo            text not null,
  unidade           text, setor text, data date, tecnico text, cargo text, motivo text,
  aprovador         text, aprovador_cargo text,
  checklist         jsonb not null default '[]'::jsonb,
  proprietario      text, responsavel_turma text, colaboradores int,
  hora_inicio       text, hora_fim text, tecnico_registro text, observacoes text,
  designado_id      uuid references auth.users(id) on delete set null,
  designado_email   text, designado_nome text, designado_em timestamptz, designado_por text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists vistorias.itens (
  id                uuid primary key default gen_random_uuid(),
  vistoria_id       uuid not null references vistorias.vistorias(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id),
  ordem             int  not null default 0,
  chave text, categoria text, titulo text, local text, encontrada text, risco text,
  grau              text check (grau in ('Crítico','Alto','Médio','Baixo')),
  normas            text[] not null default '{}',
  normas_texto      jsonb  not null default '[]'::jsonb,   -- texto congelado ao salvar
  requerida text, acao text, prazo text, prazo_data date, responsavel text,
  evidencia text, pendencias text,
  status            text not null default 'Aberto' check (status in ('Aberto','Em andamento','Concluído')),
  foto_encontrada text, foto_requerida text, foto_encerramento text,
  encerrado_em timestamptz, encerrado_obs text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists itens_vistoria_idx on vistorias.itens (vistoria_id);
create index if not exists itens_status_idx   on vistorias.itens (status);
create index if not exists itens_prazo_idx    on vistorias.itens (prazo_data);
create index if not exists vistorias_data_idx on vistorias.vistorias (data desc);

create table if not exists vistorias.configuracoes (
  id             int primary key default 1 check (id = 1),
  regras         jsonb not null default '{}'::jsonb,
  normas         jsonb not null default '{}'::jsonb,
  anomalias      jsonb not null default '{}'::jsonb,
  checklists     jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
insert into vistorias.configuracoes (id) values (1) on conflict (id) do nothing;

create table if not exists vistorias.antes_depois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  autor text, codigo text, titulo text not null, unidade text, local text, descricao text,
  data_antes date, foto_antes text, data_depois date, foto_depois text, obs_depois text, responsavel text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
-- Mais fotos (19/10/2026): lista de {lado, caminho} além da foto principal de cada lado.
alter table vistorias.antes_depois add column if not exists fotos_mais jsonb not null default '[]'::jsonb;

create index if not exists antes_depois_data_idx on vistorias.antes_depois (data_antes desc);

create table if not exists vistorias.extintores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  codigo text not null, unidade text, local text, tipo text, capacidade text,
  recarga_data date, recarga_validade date, teste_data date, teste_validade date,
  obs text, ativo boolean not null default true,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists extintores_unidade_idx on vistorias.extintores (unidade);

create table if not exists vistorias.anomalias_relatorios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  codigo text, local text, responsavel text, data date,
  itens jsonb not null default '[]'::jsonb,
  assinatura text, assinado_em timestamptz,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists anomalias_relatorios_data_idx on vistorias.anomalias_relatorios (data desc);
-- Observação do relatório (14/10/2026)
alter table vistorias.anomalias_relatorios add column if not exists observacoes text;

-- Fotos no Google Drive (conta escritoriosakuma1): caminho → arquivo no Drive.
create table if not exists vistorias.fotos_drive (
  caminho text primary key,
  drive_id text not null,
  tamanho integer,
  user_id uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['vistorias','itens','configuracoes','antes_depois','extintores','anomalias_relatorios','fotos_drive'] loop
    execute format('drop trigger if exists %1$s_atualizado on vistorias.%1$I', t);
    execute format('create trigger %1$s_atualizado before update on vistorias.%1$I for each row execute function vistorias.marca_atualizacao()', t);
    execute format('alter table vistorias.%I enable row level security', t);
  end loop;
end $$;
alter table vistorias.administradores enable row level security;

-- ─────────────────── responsável pela vistoria ───────────────────
create or replace function vistorias.pode_tratar(p_vistoria uuid)
returns boolean language sql stable security definer set search_path = vistorias, public as $$
  select exists (select 1 from vistorias.vistorias v
                 where v.id = p_vistoria and (v.user_id = auth.uid() or v.designado_id = auth.uid()));
$$;

create or replace function vistorias.trava_designado()
returns trigger language plpgsql security definer set search_path = vistorias, public as $$
begin
  if (new.designado_id is distinct from old.designado_id
      or new.designado_email is distinct from old.designado_email
      or new.designado_nome is distinct from old.designado_nome)
     and not vistorias.eh_admin() then
    raise exception 'Só administrador altera o responsável da vistoria.';
  end if;
  return new;
end $$;
drop trigger if exists vistorias_trava_designado on vistorias.vistorias;
create trigger vistorias_trava_designado before update on vistorias.vistorias
  for each row execute function vistorias.trava_designado();

-- Contas que podem receber uma vistoria: quem tem o módulo no LOP.
create or replace function vistorias.contas_da_area()
returns table (id uuid, email text, nome text)
language sql stable security definer set search_path = vistorias, public, auth as $$
  select u.id, u.email, coalesce(nullif(a.nome,''), a.usuario, u.email)
    from public.app_usuarios a
    join auth.users u on lower(u.email) = lower(a.email)
   where vistorias.pode_usar() and (a.admin or 'vistorias' = any(a.modulos))
     and (u.banned_until is null or u.banned_until < now())
   order by 3;
$$;

create or replace function vistorias.designar_responsavel(p_vistoria uuid, p_usuario uuid)
returns json language plpgsql security definer set search_path = vistorias, public, auth as $$
declare u record;
begin
  if not vistorias.eh_admin() then raise exception 'Só administrador altera o responsável da vistoria.'; end if;
  if not exists (select 1 from vistorias.vistorias where id = p_vistoria) then raise exception 'Vistoria não encontrada.'; end if;
  if p_usuario is null then
    update vistorias.vistorias set designado_id = null, designado_email = null, designado_nome = null,
           designado_em = now(), designado_por = public.app_email() where id = p_vistoria;
    return json_build_object('ok', true);
  end if;
  select c.id, c.email, c.nome into u from vistorias.contas_da_area() c where c.id = p_usuario;
  if not found then raise exception 'Essa conta não tem a área Vistorias liberada no LOP.'; end if;
  update vistorias.vistorias set designado_id = u.id, designado_email = u.email, designado_nome = u.nome,
         designado_em = now(), designado_por = public.app_email() where id = p_vistoria;
  return json_build_object('ok', true, 'email', u.email, 'nome', u.nome);
end $$;

create or replace function vistorias.foto_pode_ver(p_caminho text)
returns boolean language sql stable security definer set search_path = vistorias, public as $$
  select vistorias.pode_usar() and (
         vistorias.ve_tudo()
      or exists (select 1 from vistorias.fotos_drive f where f.caminho = p_caminho and f.user_id = auth.uid())
      or exists (select 1 from storage.objects o where o.bucket_id = 'vistorias' and o.name = p_caminho and o.owner = auth.uid())
      or exists (select 1 from vistorias.vistorias v where (v.user_id = auth.uid() or v.designado_id = auth.uid())
                   and v.id::text = split_part(p_caminho, '/', 1))
      or exists (select 1 from vistorias.antes_depois a where a.user_id = auth.uid() and a.id::text = split_part(p_caminho, '/', 1))
      or exists (select 1 from vistorias.anomalias_relatorios r where r.user_id = auth.uid() and r.id::text = split_part(p_caminho, '/', 1)));
$$;

-- ─────────────────── regras de acesso (RLS) ───────────────────
-- Toda regra começa exigindo o módulo "vistorias" no LOP.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'vistorias' loop
    execute format('drop policy %I on vistorias.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy vistorias_ler     on vistorias.vistorias for select to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or designado_id = auth.uid() or vistorias.ve_tudo()));
create policy vistorias_inserir on vistorias.vistorias for insert to authenticated
  with check (vistorias.pode_usar() and user_id = auth.uid());
create policy vistorias_alterar on vistorias.vistorias for update to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or designado_id = auth.uid() or vistorias.ve_tudo()))
  with check (vistorias.pode_usar() and (user_id = auth.uid() or designado_id = auth.uid() or vistorias.ve_tudo()));
create policy vistorias_apagar  on vistorias.vistorias for delete to authenticated
  using (vistorias.pode_usar() and user_id = auth.uid());

create policy itens_ler     on vistorias.itens for select to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo() or vistorias.pode_tratar(vistoria_id)));
create policy itens_inserir on vistorias.itens for insert to authenticated
  with check (vistorias.pode_usar() and user_id = auth.uid());
create policy itens_alterar on vistorias.itens for update to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo() or vistorias.pode_tratar(vistoria_id)))
  with check (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo() or vistorias.pode_tratar(vistoria_id)));
create policy itens_apagar  on vistorias.itens for delete to authenticated
  using (vistorias.pode_usar() and user_id = auth.uid());

create policy config_ler     on vistorias.configuracoes for select to authenticated using (vistorias.pode_usar());
create policy config_alterar on vistorias.configuracoes for update to authenticated
  using (vistorias.eh_admin()) with check (vistorias.eh_admin());

create policy admin_ler     on vistorias.administradores for select to authenticated using (vistorias.pode_usar());
create policy admin_inserir on vistorias.administradores for insert to authenticated with check (vistorias.eh_admin());
create policy admin_alterar on vistorias.administradores for update to authenticated using (vistorias.eh_admin()) with check (vistorias.eh_admin());
create policy admin_apagar  on vistorias.administradores for delete to authenticated using (vistorias.eh_admin());

create policy ad_ler     on vistorias.antes_depois for select to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo()));
create policy ad_inserir on vistorias.antes_depois for insert to authenticated with check (vistorias.pode_usar() and user_id = auth.uid());
create policy ad_alterar on vistorias.antes_depois for update to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo())) with check (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo()));
create policy ad_apagar  on vistorias.antes_depois for delete to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.eh_admin()));

create policy ext_ler     on vistorias.extintores for select to authenticated using (vistorias.pode_usar());
create policy ext_inserir on vistorias.extintores for insert to authenticated with check (vistorias.pode_usar() and user_id = auth.uid());
create policy ext_alterar on vistorias.extintores for update to authenticated using (vistorias.pode_usar()) with check (vistorias.pode_usar());
create policy ext_apagar  on vistorias.extintores for delete to authenticated using (vistorias.eh_admin());

create policy an_ler     on vistorias.anomalias_relatorios for select to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo()));
create policy an_inserir on vistorias.anomalias_relatorios for insert to authenticated with check (vistorias.pode_usar() and user_id = auth.uid());
create policy an_alterar on vistorias.anomalias_relatorios for update to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo())) with check (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.ve_tudo()));
create policy an_apagar  on vistorias.anomalias_relatorios for delete to authenticated using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.eh_admin()));

create policy fd_ler     on vistorias.fotos_drive for select to authenticated using (vistorias.pode_usar());
create policy fd_inserir on vistorias.fotos_drive for insert to authenticated with check (vistorias.pode_usar() and user_id = auth.uid());
create policy fd_trocar  on vistorias.fotos_drive for update to authenticated using (vistorias.pode_usar()) with check (vistorias.pode_usar());
create policy fd_apagar  on vistorias.fotos_drive for delete to authenticated using (vistorias.pode_usar() and user_id = auth.uid());

-- ─────────────────── visão de pendências (aba Em aberto) ───────────────────
drop view if exists vistorias.pendencias;
create view vistorias.pendencias with (security_invoker = true) as
select
  i.id, i.vistoria_id, i.ordem, i.chave, i.categoria, i.titulo, i.local, i.grau, i.status,
  i.encontrada, i.risco, i.requerida, i.acao, i.evidencia, i.pendencias,
  i.responsavel, i.prazo, i.prazo_data, i.normas, i.normas_texto,
  i.foto_encontrada, i.foto_requerida, i.foto_encerramento, i.encerrado_em, i.encerrado_obs,
  v.codigo as vistoria_codigo, v.unidade as unidade, v.setor as setor, v.data as vistoria_data, v.tecnico as tecnico,
  case when i.status = 'Concluído' then 'Concluído'
       when i.prazo_data is null then 'Sem prazo'
       when i.prazo_data < current_date then 'Vencido'
       when i.prazo_data <= current_date + 3 then 'Vence em breve'
       else 'No prazo' end as situacao_prazo,
  (current_date - v.data) as dias_em_aberto,
  v.motivo as vistoria_motivo,
  (jsonb_typeof(v.checklist) = 'array' and jsonb_array_length(v.checklist) > 0) as eh_checklist,
  v.designado_id, v.designado_email, v.designado_nome
from vistorias.itens i join vistorias.vistorias v on v.id = i.vistoria_id;

-- ─────────────────── fotos de reserva (se o Drive cair) ───────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vistorias', 'vistorias', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists vs_fotos_ler    on storage.objects;
drop policy if exists vs_fotos_enviar on storage.objects;
drop policy if exists vs_fotos_trocar on storage.objects;
drop policy if exists vs_fotos_apagar on storage.objects;
create policy vs_fotos_ler    on storage.objects for select to authenticated
  using (bucket_id = 'vistorias' and vistorias.foto_pode_ver(name));
create policy vs_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'vistorias' and vistorias.pode_usar());
create policy vs_fotos_trocar on storage.objects for update to authenticated
  using (bucket_id = 'vistorias' and vistorias.pode_usar()) with check (bucket_id = 'vistorias' and vistorias.pode_usar());
create policy vs_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'vistorias' and owner = auth.uid());

-- ─────────────────── permissões ───────────────────
grant select, insert, update, delete on all tables in schema vistorias to authenticated;
grant select on vistorias.pendencias to authenticated;
revoke all on all functions in schema vistorias from public, anon;
grant execute on all functions in schema vistorias to authenticated;

notify pgrst, 'reload schema';
