-- Área Custo Base do LOP - Gestão Rápida (20/10/2026).
-- Módulo Rateio mensal culturas: substitui a planilha "Rateio - Direcionador
-- Mensal ADM". Tabelas no esquema public com o prefixo cb_. Rodar uma vez no
-- SQL Editor do Supabase; só cria o que não existe.

-- Culturas: índice (peso por hectare) e ciclo em dias, como na tabela lateral
-- da planilha. Permanente = abacate, café: nunca sai do rateio por tempo.
-- meses_rateio = quantos meses um plantio dessa cultura fica no rateio;
-- vazio = arredonda ciclo/30. Ao completar, o plantio vem desmarcado no mês
-- seguinte (pedido dele, 20/10/2026).
create table if not exists public.cb_culturas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  indice numeric not null default 0,
  ciclo int not null default 1,
  permanente boolean not null default false,
  meses_rateio int,
  ordem int default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Plantios (talhões): o "Cód. Agro" é o código do plantio no sistema agro —
-- muda a cada safra, até para abacate e café. Área padrão em hectares; cada
-- mês guarda a sua própria cópia da área.
create table if not exists public.cb_talhoes (
  id uuid primary key default gen_random_uuid(),
  cod_agro text,
  nome text not null,
  cultura_id uuid references public.cb_culturas(id),
  fazenda text,
  area numeric not null default 0,
  obs text,
  ativo boolean not null default true,         -- false = encerrado: não entra nos próximos meses
  atualizado_em timestamptz not null default now()
);
create index if not exists cb_talhoes_cod on public.cb_talhoes(cod_agro);

-- Um registro por mês. id = 'AAAA-MM'. custo_adm (R$) é opcional: sem ele sai só o %.
create table if not exists public.cb_meses (
  id text primary key check (id ~ '^\d{4}-\d{2}$'),
  custo_adm numeric,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  fechado_por text,
  fechado_em timestamptz,
  obs text,
  atualizado_em timestamptz not null default now()
);

-- Os plantios de cada mês, com área, índice e ciclo copiados na hora (como a
-- aba da planilha guarda os seus próprios números). id = 'AAAA-MM:<talhao_id>'.
-- incluido=false: ficou fora do rateio naquele mês (ex.: completou o ciclo).
create table if not exists public.cb_itens (
  id text primary key,
  mes text not null references public.cb_meses(id) on delete cascade,
  talhao_id uuid not null references public.cb_talhoes(id),
  cultura_id uuid references public.cb_culturas(id),
  area numeric not null default 0,
  indice numeric not null default 0,
  ciclo int not null default 1,
  incluido boolean not null default true,
  obs text,
  atualizado_em timestamptz not null default now(),
  unique (mes, talhao_id)
);
create index if not exists cb_itens_mes on public.cb_itens(mes);
create index if not exists cb_itens_talhao on public.cb_itens(talhao_id);

-- Carimbo do servidor, RLS (quem tem o módulo 'custobase' ou é admin) e permissões.
do $$ declare t text; begin
  foreach t in array array['cb_culturas','cb_talhoes','cb_meses','cb_itens'] loop
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
  -- tirar um plantio de um mês aberto apaga a linha do mês (não o plantio)
  execute 'create policy cb_apagar on public.cb_itens for delete to authenticated using (public.app_pode(''custobase''))';
  execute 'grant delete on public.cb_itens to authenticated';
end $$;

-- As culturas da planilha (índice e ciclo de out/2026). Só insere o que falta.
insert into public.cb_culturas (nome, indice, ciclo, permanente, ordem)
select v.nome, v.indice, v.ciclo, v.perm, v.ordem from (values
  ('Abacate',   4000, 365, true,  1),
  ('Alho',     25000, 365, false, 2),
  ('Batata',   25000, 140, false, 3),
  ('Café',      4800, 365, true,  4),
  ('Cebola',   25000, 150, false, 5),
  ('Cenoura',  25000, 150, false, 6),
  ('Milho',     3500, 140, false, 7),
  ('Soja',      2500, 140, false, 8),
  ('Sorgo',     2000, 140, false, 9),
  ('Trigo',     2000, 120, false, 10),
  ('Triticale', 2000, 120, false, 11)) v(nome, indice, ciclo, perm, ordem)
where not exists (select 1 from public.cb_culturas c where lower(c.nome) = lower(v.nome));
