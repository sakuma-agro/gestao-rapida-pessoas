-- cert-denuncias.sql — Denúncia de assédio no QR de reclamação (12/11/2026).
-- Pedido do Guilherme: "poderíamos colocar sobre denúncia sobre assédio, sexual e etc".
-- Decisões dele: novo tipo "DENÚNCIA" no FORM 042 do JotForm; só ele e a diretoria
-- (usuários admin do app) veem as denúncias. Quem tem o módulo 'cert' continua vendo
-- reclamações, sugestões e elogios, mas não enxerga a denúncia nem as ações e o
-- andamento dela — o bloqueio é no banco (RLS), não só na tela.
-- Migração "cert_denuncias".
create or replace function public.cmc_pode_caso(p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_pode('cert') and (coalesce(p_tipo,'') <> 'DENÚNCIA' or public.app_admin());
$$;
create or replace function public.cmc_pode_caso_id(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.cmc_pode_caso(c.tipo) from public.cmc_casos c where c.id = p_caso), false);
$$;
revoke all on function public.cmc_pode_caso(text), public.cmc_pode_caso_id(uuid) from anon;

drop policy if exists cmc_leem on public.cmc_casos;
drop policy if exists cmc_inserem on public.cmc_casos;
drop policy if exists cmc_alteram on public.cmc_casos;
drop policy if exists cmc_apagam on public.cmc_casos;
create policy cmc_leem on public.cmc_casos for select to authenticated using (public.cmc_pode_caso(tipo));
create policy cmc_inserem on public.cmc_casos for insert to authenticated with check (public.cmc_pode_caso(tipo));
create policy cmc_alteram on public.cmc_casos for update to authenticated using (public.cmc_pode_caso(tipo)) with check (public.cmc_pode_caso(tipo));
create policy cmc_apagam on public.cmc_casos for delete to authenticated using (public.cmc_pode_caso(tipo));

do $$ declare t text; begin
  foreach t in array array['cmc_acoes','cmc_andamentos'] loop
    execute format('drop policy if exists cmc_leem on public.%I', t);
    execute format('drop policy if exists cmc_inserem on public.%I', t);
    execute format('drop policy if exists cmc_alteram on public.%I', t);
    execute format('drop policy if exists cmc_apagam on public.%I', t);
    execute format('create policy cmc_leem on public.%I for select to authenticated using (public.cmc_pode_caso_id(caso_id))', t);
    execute format('create policy cmc_inserem on public.%I for insert to authenticated with check (public.cmc_pode_caso_id(caso_id))', t);
    execute format('create policy cmc_alteram on public.%I for update to authenticated using (public.cmc_pode_caso_id(caso_id)) with check (public.cmc_pode_caso_id(caso_id))', t);
    execute format('create policy cmc_apagam on public.%I for delete to authenticated using (public.cmc_pode_caso_id(caso_id))', t);
  end loop;
end $$;
