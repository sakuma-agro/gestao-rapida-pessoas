-- Custo Base · Hora-homem: nível da função decide Campo x ADM (20/10/2026).
-- Pedido dele: "Quem for campo - operacional, entra em campo; quem for adm -
-- operacional, entra adm; quem for tático e estratégico entra adm".
-- O nível (Estratégico/Tático/Operacional) já existe na função
-- (jor_funcoes.nivel, RH › Organograma); vem pelo vínculo (jor_vinculos).
-- Função nova (v2) para não quebrar quem ainda está com o app antigo.
alter table public.cb_hh_itens add column if not exists nivel text;
alter table public.cb_hh_itens add column if not exists funcao text;

create or replace function public.cb_horas_mes_v2(p_mes text)
returns table (funcionario_id uuid, cadastro text, nome text, setor text, situacao text,
               tipo_contrato text, minutos bigint, boletins bigint, salario numeric,
               funcao text, nivel text)
language sql stable security definer set search_path = public as $$
  with h as (
    select b.funcionario_id, coalesce(sum(a.min_trabalhados), 0)::bigint minutos, count(b.id)::bigint boletins
      from public.jor_boletins b
      left join public.jor_apuracoes a on a.boletim_id = b.id
     where p_mes ~ '^\d{4}-\d{2}$'
       and to_char(b.competencia, 'YYYY-MM') = p_mes
       and coalesce(b.situacao, '') <> 'cancelado'
     group by b.funcionario_id)
  select f.id, f.cadastro, f.nome, f.setor, f.situacao, v.tipo_contrato,
         coalesce(h.minutos, 0), coalesce(h.boletins, 0),
         case when public.app_pode('ver_salarios') or public.app_pode('rh') then
           (select s.valor from public.jor_salarios s
             where s.funcionario_id = f.id
               and s.desde <= ((p_mes || '-01')::date + interval '1 month' - interval '1 day')::date
             order by s.desde desc limit 1)
         end,
         fn.nome, fn.nivel
    from public.funcionarios f
    left join h on h.funcionario_id = f.id
    left join public.jor_vinculos v on v.funcionario_id = f.id
    left join public.jor_funcoes fn on fn.id = v.funcao_id
   where public.app_pode('custobase')
     and (upper(coalesce(f.situacao, '')) = 'ATIVO' or h.funcionario_id is not null)
$$;
revoke all on function public.cb_horas_mes_v2(text) from public, anon;
grant execute on function public.cb_horas_mes_v2(text) to authenticated;
