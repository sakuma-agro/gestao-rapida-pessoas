-- Custo Base · módulo Hora-homem (20/10/2026). Substitui a planilha
-- "Controle Mensal - Hora Homem - Campo". Rodar depois do custobase.sql.
-- Só cria o que não existe.
--
-- R$/h = (salário bruto × encargo + valor pago em recibo) ÷ horas trabalhadas.
-- Horas trabalhadas vêm do Pessoas (DP › Gestão de jornada): soma das horas
-- apuradas dos boletins da competência, sem os cancelados.

-- Índices (aba "Indices" da planilha): encargo fixo/temporário e as horas
-- padrão de cada mês, usadas quando a pessoa não tem horas no mês.
create table if not exists public.cb_hh_parametros (
  id text primary key default 'geral',
  encargo_fixo numeric not null default 1.3917,
  encargo_temporario numeric not null default 1.5705,
  horas_padrao jsonb not null default '{"01":192,"02":200,"03":208,"04":192,"05":208,"06":208,"07":200,"08":216,"09":200,"10":192,"11":192,"12":208}',
  atualizado_em timestamptz not null default now()
);

-- Um registro por mês (id 'AAAA-MM'). Fechado = números travados.
create table if not exists public.cb_hh_meses (
  id text primary key check (id ~ '^\d{4}-\d{2}$'),
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  fechado_por text,
  fechado_em timestamptz,
  obs text,
  atualizado_em timestamptz not null default now()
);

-- Uma linha por pessoa no mês. id = 'AAAA-MM:<funcionario_id ou chave>'.
-- horas_pessoas = o que veio do Pessoas na última atualização;
-- horas_manual  = correção digitada (vale no lugar de horas_pessoas).
create table if not exists public.cb_hh_itens (
  id text primary key,
  mes text not null references public.cb_hh_meses(id) on delete cascade,
  funcionario_id uuid,
  cadastro text,
  nome text not null,
  relacao text not null default 'Fixo' check (relacao in ('Fixo','Temporário')),
  horas_pessoas numeric,
  horas_manual numeric,
  salario_bruto numeric,
  recibo numeric,
  lancado_agro boolean not null default false,
  incluido boolean not null default true,
  obs text,
  atualizado_em timestamptz not null default now()
);
create index if not exists cb_hh_itens_mes on public.cb_hh_itens(mes);

do $$ declare t text; begin
  foreach t in array array['cb_hh_parametros','cb_hh_meses','cb_hh_itens'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists cb_ler on public.%I', t);
    execute format('drop policy if exists cb_gravar on public.%I', t);
    execute format('drop policy if exists cb_trocar on public.%I', t);
    execute format('drop policy if exists cb_apagar on public.%I', t);
    execute format('create policy cb_ler on public.%I for select to authenticated using (public.app_pode(''custobase''))', t);
    execute format('create policy cb_gravar on public.%I for insert to authenticated with check (public.app_pode(''custobase''))', t);
    execute format('create policy cb_trocar on public.%I for update to authenticated using (public.app_pode(''custobase'')) with check (public.app_pode(''custobase''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
  execute 'create policy cb_apagar on public.cb_hh_itens for delete to authenticated using (public.app_pode(''custobase''))';
  execute 'grant delete on public.cb_hh_itens to authenticated';
end $$;

insert into public.cb_hh_parametros (id) values ('geral') on conflict (id) do nothing;

-- Horas do Pessoas para o Custo Base. Quem tem o Custo Base lê as horas sem
-- precisar do módulo de jornada. O salário vigente (só sugestão) volta apenas
-- para quem é administrador, tem 'ver_salarios' ou o RH.
create or replace function public.cb_horas_mes(p_mes text)
returns table (funcionario_id uuid, cadastro text, nome text, setor text, situacao text,
               tipo_contrato text, minutos bigint, boletins bigint, salario numeric)
language sql stable security definer set search_path = public as $$
  select f.id, f.cadastro, f.nome, f.setor, f.situacao, v.tipo_contrato,
         coalesce(sum(a.min_trabalhados), 0)::bigint, count(b.id)::bigint,
         case when public.app_pode('ver_salarios') or public.app_pode('rh') then
           (select s.valor from public.jor_salarios s
             where s.funcionario_id = f.id
               and s.desde <= ((p_mes || '-01')::date + interval '1 month' - interval '1 day')::date
             order by s.desde desc limit 1)
         end
    from public.jor_boletins b
    join public.funcionarios f on f.id = b.funcionario_id
    left join public.jor_apuracoes a on a.boletim_id = b.id
    left join public.jor_vinculos v on v.funcionario_id = f.id
   where public.app_pode('custobase')
     and p_mes ~ '^\d{4}-\d{2}$'
     and to_char(b.competencia, 'YYYY-MM') = p_mes
     and coalesce(b.situacao, '') <> 'cancelado'
   group by f.id, f.cadastro, f.nome, f.setor, f.situacao, v.tipo_contrato
$$;
revoke all on function public.cb_horas_mes(text) from public, anon;
grant execute on function public.cb_horas_mes(text) to authenticated;

-- Composição editável dos encargos (20/10/2026): encargo = 1 + Σ % dos itens.
alter table public.cb_hh_parametros add column if not exists componentes jsonb;
update public.cb_hh_parametros set componentes = '{
  "fixo": [
    {"nome":"Férias","pct":11.11},{"nome":"13º salário","pct":8.33},{"nome":"FGTS","pct":8},
    {"nome":"Patronal","pct":0.2},{"nome":"Multa rescisória","pct":3.2},{"nome":"Aviso demissão","pct":8.33}],
  "temporario": [
    {"nome":"Encargos do temporário (total da planilha)","pct":57.05}]
}'::jsonb where id = 'geral' and componentes is null;
