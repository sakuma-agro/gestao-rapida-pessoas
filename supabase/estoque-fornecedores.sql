-- Fornecedores do Estoque (13/11/2026, pedido dele: "crie também um local aonde
-- cadastramos fornecedores"). Lojas/distribuidores de EPI e material de limpeza,
-- escolhidos na entrada. Separado do cadastro da Certificação (cfo_fornecedores),
-- que cria pasta no AN 20 e exige o CL 07.
create table if not exists public.est_fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  telefone text,
  contato text,
  cidade text,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.est_movimentos add column if not exists fornecedor_id uuid;

do $$ declare t text; begin
  foreach t in array array['est_fornecedores'] loop
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
