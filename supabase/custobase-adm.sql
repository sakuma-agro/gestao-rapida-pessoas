-- Custo Base › Adm mensais (09/11/2026, pedido do Guilherme).
-- Substitui a planilha "Lançamento Administrativos Mensais" (CMA2): os
-- lançamentos que o administrativo faz todo mês (salário ADM, consultorias,
-- Starlink, energia, contabilidade…), com valor do mês e a caixinha "Lançado".
-- Rodar uma vez; só cria o que não existe. Importação em custobase-adm-importacao.sql.

-- Cadastro: o que precisa ser lançado. periodicidade 'anual' = só no mes_anual.
create table if not exists public.cb_adm_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo text,
  unidade text,
  detalhe text,
  valor_padrao numeric,
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','anual')),
  mes_anual int check (mes_anual between 1 and 12),
  dia_venc int check (dia_venc between 1 and 31),
  ordem int default 0,
  ativo boolean not null default true,
  obs text,
  atualizado_em timestamptz not null default now()
);

-- Um registro por item e mês. id = 'AAAA-MM:<item_id>'.
create table if not exists public.cb_adm_lanc (
  id text primary key,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  item_id uuid not null references public.cb_adm_itens(id),
  valor numeric,
  lancado boolean not null default false,
  lancado_em timestamptz,
  lancado_por text,
  obs text,
  atualizado_em timestamptz not null default now(),
  unique (mes, item_id)
);
create index if not exists cb_adm_lanc_mes on public.cb_adm_lanc(mes);

do $$ declare t text; begin
  foreach t in array array['cb_adm_itens','cb_adm_lanc'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists cb_ler on public.%I', t);
    execute format('drop policy if exists cb_gravar on public.%I', t);
    execute format('drop policy if exists cb_trocar on public.%I', t);
    execute format('create policy cb_ler on public.%I for select to authenticated using (public.app_pode(''custobase''))', t);
    execute format('create policy cb_gravar on public.%I for insert to authenticated with check (public.app_pode(''custobase''))', t);
    execute format('create policy cb_trocar on public.%I for update to authenticated using (public.app_pode(''custobase'')) with check (public.app_pode(''custobase''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
