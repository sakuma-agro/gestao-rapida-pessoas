-- Área Estoque do LOP - Gestão Rápida: contagem mensal dos insumos por
-- almoxarifado (15/10/2026). Rodar uma vez no SQL Editor do Supabase.
-- Só cria tabelas novas (est_*); não mexe em nada que já existe.

create table if not exists public.est_locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fazenda text,
  ordem int default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.est_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text,
  grupo text not null default 'Insumos',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- id = '<local_id>:<AAAA-MM>': dois aparelhos abrindo o mesmo mês caem no mesmo registro.
create table if not exists public.est_contagens (
  id text primary key,
  local_id uuid not null references public.est_locais(id),
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  responsavel text,
  aberta_por text,
  fechada_por text,
  fechada_em timestamptz,
  obs text,
  atualizado_em timestamptz not null default now(),
  unique (local_id, mes)
);

-- id = '<contagem_id>:<item_id>': regravar o mesmo item nunca duplica.
create table if not exists public.est_contagem_itens (
  id text primary key,
  contagem_id text not null references public.est_contagens(id) on delete cascade,
  item_id uuid not null references public.est_itens(id),
  quantidade numeric,
  contado_por text,
  atualizado_em timestamptz not null default now(),
  unique (contagem_id, item_id)
);
create index if not exists est_ci_contagem on public.est_contagem_itens(contagem_id);

-- Carimbo do servidor, RLS (quem tem o módulo 'estoque' ou é admin) e permissões.
do $$ declare t text; begin
  foreach t in array array['est_locais','est_itens','est_contagens','est_contagem_itens'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists est_ler on public.%I', t);
    execute format('drop policy if exists est_gravar on public.%I', t);
    execute format('drop policy if exists est_trocar on public.%I', t);
    execute format('create policy est_ler on public.%I for select to authenticated using (public.app_pode(''estoque''))', t);
    execute format('create policy est_gravar on public.%I for insert to authenticated with check (public.app_pode(''estoque''))', t);
    execute format('create policy est_trocar on public.%I for update to authenticated using (public.app_pode(''estoque'')) with check (public.app_pode(''estoque''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Os quatro depósitos da planilha do acerto, com o mesmo nome das abas
-- "Sistema - ..." (é por esse nome que a contagem entra no Acerto).
insert into public.est_locais (nome, fazenda, ordem)
select v.nome, v.fazenda, v.ordem from (values
  ('Lote 35', 'Lote 35 PADAP', 1),
  ('Faz. Faca', 'Fazenda Faca', 2),
  ('Faz. Morro Branco', 'Fazenda Morro Branco', 3),
  ('Faz. Três Riachos', 'Fazenda Três Riachos', 4)) v(nome, fazenda, ordem)
where not exists (select 1 from public.est_locais);
