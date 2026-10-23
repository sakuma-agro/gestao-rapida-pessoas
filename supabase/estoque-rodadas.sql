-- Mais de uma contagem no mesmo mês (pedido de 23/10/2026).
-- A 1ª continua com o id local_id:AAAA-MM; a 2ª em diante usa local_id:AAAA-MM#n.
-- Aplicado no banco em 23/10/2026.
alter table public.est_contagens add column if not exists rodada integer not null default 1;
alter table public.est_contagens drop constraint if exists est_contagens_local_id_mes_key;
create unique index if not exists est_contagens_local_mes_rodada on public.est_contagens(local_id, mes, rodada);
notify pgrst, 'reload schema';
