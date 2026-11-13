-- Extintores: natureza do fogo e inspeções semanal/trimestral (13/11/2026)
alter table vistorias.extintores add column if not exists classe text;   -- classes que o extintor apaga (A, B, C)
alter table vistorias.extintores add column if not exists risco  text;   -- natureza do fogo do local

create table if not exists vistorias.extintores_inspecoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  autor text,
  extintor_id uuid not null references vistorias.extintores(id) on delete cascade,
  codigo text, unidade text, local text,
  periodicidade text not null check (periodicidade in ('semanal','trimestral')),
  data date not null,
  responsavel text,
  respostas jsonb not null default '{}'::jsonb,   -- {pressao:{r:'c'|'nc'|'na', obs}}
  nc integer not null default 0,
  obs text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists extintores_inspecoes_ext_idx on vistorias.extintores_inspecoes (extintor_id, data desc);
create index if not exists extintores_inspecoes_data_idx on vistorias.extintores_inspecoes (data desc);

drop trigger if exists extintores_inspecoes_atualizado on vistorias.extintores_inspecoes;
create trigger extintores_inspecoes_atualizado before update on vistorias.extintores_inspecoes
  for each row execute function vistorias.marca_atualizacao();

alter table vistorias.extintores_inspecoes enable row level security;
drop policy if exists exi_ler on vistorias.extintores_inspecoes;
drop policy if exists exi_inserir on vistorias.extintores_inspecoes;
drop policy if exists exi_alterar on vistorias.extintores_inspecoes;
drop policy if exists exi_apagar on vistorias.extintores_inspecoes;
create policy exi_ler     on vistorias.extintores_inspecoes for select to authenticated using (vistorias.pode_usar());
create policy exi_inserir on vistorias.extintores_inspecoes for insert to authenticated with check (vistorias.pode_usar() and user_id = auth.uid());
create policy exi_alterar on vistorias.extintores_inspecoes for update to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.eh_admin())) with check (vistorias.pode_usar());
create policy exi_apagar  on vistorias.extintores_inspecoes for delete to authenticated
  using (vistorias.pode_usar() and (user_id = auth.uid() or vistorias.eh_admin()));
grant select, insert, update, delete on vistorias.extintores_inspecoes to authenticated;
grant select on vistorias.extintores_inspecoes to service_role;

notify pgrst, 'reload schema';
