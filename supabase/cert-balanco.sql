-- Certificação › Balanço de massa (FORM 013 / FMAGR-013), 26/10/2026.
--
-- Pedido do Guilherme: "a de 2026 é o modelo … pegue os dados de 2025 e 2024".
-- As cargas moram na área Colheita e Produção (cp_cargas, cultura abacate); a
-- Certificação lê de lá e acrescenta o que a planilha de balanço tinha a mais:
--  · cp_lotes_venda — o que saiu para o packing house: um boletim de
--    beneficiamento (várias cargas) ou uma NF de carga suja. Guarda o peso
--    vendido do lote; o painel reparte entre as cargas pelo peso líquido.
--  · cp_cargas.lote_venda_id / rastreio / evid_url
--  · cp_plantios.expectativa_kg (expectativa de produção do talhão)
-- Rodar uma vez no SQL Editor; só cria o que não existe.

create table if not exists public.cp_lotes_venda (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  codigo text not null,                -- 'Boletim 798', 'NF 001031094-2'
  data date,                           -- data do boletim / da venda
  destino text,                        -- packing house: Coopadap, Carlini…
  tipo text,                           -- Beneficiado | Sujo | Lavado
  certificacao text,                   -- Com certificação | Sem certificação
  rastreio text,                       -- código de rastreabilidade do beneficiamento
  nfs text,                            -- NF-e(s) do lote
  peso_vendido numeric,                -- kg vendidos (relatório da cooperativa)
  evid_url text,                       -- pasta/arquivo de evidência da venda
  obs text,
  ativo boolean not null default true,
  criado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_lotes_venda_safra on public.cp_lotes_venda(safra_id);

alter table public.cp_cargas add column if not exists lote_venda_id uuid references public.cp_lotes_venda(id);
alter table public.cp_cargas add column if not exists rastreio text;
alter table public.cp_cargas add column if not exists evid_url text;
alter table public.cp_plantios add column if not exists expectativa_kg numeric;
create index if not exists cp_cargas_lote_venda on public.cp_cargas(lote_venda_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='marcar_atualizacao' and tgrelid='public.cp_lotes_venda'::regclass) then
    create trigger marcar_atualizacao before insert or update on public.cp_lotes_venda for each row execute function public.marcar_atualizacao();
  end if;
end $$;

alter table public.cp_lotes_venda enable row level security;
grant select, insert, update, delete on public.cp_lotes_venda to authenticated;

-- Sem drop de propósito (ver colheita.sql): só cria a política que falta.
do $$ declare t text; begin
  -- a Certificação lê as cargas, safras e talhões da Colheita…
  foreach t in array array['cp_culturas','cp_safras','cp_plantios','cp_cargas'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='cp_ler_cert') then
      execute format('create policy cp_ler_cert on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    end if;
  end loop;
  -- …liga a carga ao lote de venda e informa a expectativa do talhão
  foreach t in array array['cp_plantios','cp_cargas'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='cp_trocar_cert') then
      execute format('create policy cp_trocar_cert on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    end if;
  end loop;
  -- lotes de venda: quem tem Colheita ou Certificação
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cp_lotes_venda' and policyname='cp_lv_ler') then
    create policy cp_lv_ler on public.cp_lotes_venda for select to authenticated using (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_lv_gravar on public.cp_lotes_venda for insert to authenticated with check (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_lv_trocar on public.cp_lotes_venda for update to authenticated using (public.app_pode('colheita') or public.app_pode('cert')) with check (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_lv_apagar on public.cp_lotes_venda for delete to authenticated using (public.app_pode('colheita') or public.app_pode('cert'));
  end if;
end $$;

-- 26/10/2026 (2ª parte) — categorias do boletim do lavador e itens de venda.
-- Pedido: "quero um campo para colocar a qtde de cat 1, cat 2, e cat 3, de cada
-- boletim feito do lavador" e "colocar sobre o calibre do abacate hass, a qtde %
-- de cada um". Os calibres vêm do relatório de vendas da Coopadap: cada linha
-- (NF × material) vira um item; o material diz calibre (T12…T32), categoria e
-- embalagem. O peso vendido do lote passa a ser a soma dos itens dele.
alter table public.cp_lotes_venda add column if not exists cat1_kg numeric;
alter table public.cp_lotes_venda add column if not exists cat2_kg numeric;
alter table public.cp_lotes_venda add column if not exists cat3_kg numeric;
alter table public.cp_lotes_venda add column if not exists refugo_kg numeric;

create table if not exists public.cp_vendas_itens (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  lote_venda_id uuid references public.cp_lotes_venda(id) on delete set null,
  chave text unique,                   -- NF | documento de compras | item (evita importar duas vezes)
  data date,                           -- emissão da NF
  nf text,
  boletim text,
  material text,                       -- '7000755 - AVOCADO HASS CX PLASTICA T16 10KG'
  categoria text,                      -- CAT 1 | CAT 2 | CAT 3 | Sujo
  calibre int,                         -- frutos por caixa de 4 kg (T16 = 16)
  embalagem text,                      -- CX 10 kg | CX 4 kg | Contentor | Granel
  caixas numeric,
  kg numeric,
  talhao text,                         -- como veio no relatório (opcional)
  origem text,                         -- de onde veio (arquivo importado)
  ativo boolean not null default true,
  criado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_vendas_itens_lote on public.cp_vendas_itens(lote_venda_id);
create index if not exists cp_vendas_itens_safra on public.cp_vendas_itens(safra_id);
alter table public.cp_vendas_itens enable row level security;
grant select, insert, update, delete on public.cp_vendas_itens to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname='marcar_atualizacao' and tgrelid='public.cp_vendas_itens'::regclass) then
    create trigger marcar_atualizacao before insert or update on public.cp_vendas_itens for each row execute function public.marcar_atualizacao();
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cp_vendas_itens' and policyname='cp_vi_ler') then
    create policy cp_vi_ler on public.cp_vendas_itens for select to authenticated using (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_vi_gravar on public.cp_vendas_itens for insert to authenticated with check (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_vi_trocar on public.cp_vendas_itens for update to authenticated using (public.app_pode('colheita') or public.app_pode('cert')) with check (public.app_pode('colheita') or public.app_pode('cert'));
    create policy cp_vi_apagar on public.cp_vendas_itens for delete to authenticated using (public.app_pode('colheita') or public.app_pode('cert'));
  end if;
  -- a Certificação também importa o relatório da balança da cooperativa
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cp_balanca' and policyname='cp_ler_cert') then
    create policy cp_ler_cert on public.cp_balanca for select to authenticated using (public.app_pode('cert'));
  end if;
end $$;
