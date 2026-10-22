-- Contagem controlada por tipo (22/10/2026, pedido dele): cada grupo (Defensivos,
-- EPIs, Fertilizantes…) de uma contagem tem data, quem contou e fechamento próprios.
-- A contagem do mês (est_contagens) fica fechada quando todos os tipos fecharem.
create table if not exists public.est_contagem_grupos (
  id text primary key,                          -- contagem_id:grupo
  contagem_id text not null references public.est_contagens(id) on delete cascade,
  grupo text not null,
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  data_contagem date,
  responsavel text,
  fechada_por text,
  fechada_em timestamptz,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_cg_contagem on public.est_contagem_grupos(contagem_id);

do $$ declare t text; begin
  foreach t in array array['est_contagem_grupos'] loop
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
