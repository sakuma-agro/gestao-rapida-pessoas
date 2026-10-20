-- Custo Base · cadeado do mês fechado (20/10/2026, pedido dele).
-- "Depois de fechar o mês, quero botar um cadeado: se eu alterar um parâmetro
-- de alguma cultura, não altere os rateios do passado."
-- 1) Hora-homem: o mês guarda o encargo e a hora padrão do fechamento.
-- 2) Gatilhos: o banco recusa mudar linhas de mês fechado (rateio e
--    hora-homem). Exceção: marcar/desmarcar "Agro" na hora-homem.
--    Para mudar, o administrador reabre o mês.

alter table public.cb_hh_meses add column if not exists encargo_fixo numeric;
alter table public.cb_hh_meses add column if not exists encargo_temporario numeric;
alter table public.cb_hh_meses add column if not exists horas_padrao numeric;

-- meses já fechados (importados da planilha) ficam com os índices da planilha
update public.cb_hh_meses m
   set encargo_fixo = 1.3917, encargo_temporario = 1.5705,
       horas_padrao = (('{"01":192,"02":200,"03":208,"04":192,"05":208,"06":208,"07":200,"08":216,"09":200,"10":192,"11":192,"12":208}'::jsonb) ->> substr(m.id, 6, 2))::numeric
 where m.status = 'fechado' and m.encargo_fixo is null;

create or replace function public.cb_trava_rateio() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.cb_meses where id = coalesce(new.mes, old.mes) and status = 'fechado')
     or (tg_op = 'UPDATE' and exists (select 1 from public.cb_meses where id = old.mes and status = 'fechado')) then
    raise exception 'Mês % fechado (cadeado). Reabra o mês para alterar.', coalesce(new.mes, old.mes) using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists cb_trava on public.cb_itens;
create trigger cb_trava before insert or update or delete on public.cb_itens
  for each row execute function public.cb_trava_rateio();

create or replace function public.cb_trava_hh() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.cb_hh_meses where id in (coalesce(new.mes, old.mes), old.mes) and status = 'fechado') then
    -- só a marcação "Agro" pode mudar em mês fechado
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'lancado_agro' - 'atualizado_em') = (to_jsonb(old) - 'lancado_agro' - 'atualizado_em') then
      return new;
    end if;
    raise exception 'Mês % fechado (cadeado). Reabra o mês para alterar.', coalesce(new.mes, old.mes) using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists cb_trava on public.cb_hh_itens;
create trigger cb_trava before insert or update or delete on public.cb_hh_itens
  for each row execute function public.cb_trava_hh();
