-- cert-desmatamento.sql — Certificação › Desmatamento (FV-GFS 22.03.01), 05/11/2026.
-- Pedido do Guilherme: "crie um submodulo sobre desmatamento, 2014 em diante, referente a fazenda faca,
-- mostrando por ano". Base: relatório "Monitoramento da Reserva Legal · 2014 a 2024 — Faz. Faca e Quilombo"
-- (MapBiomas Coleção 10 + PRODES Cerrado/INPE + CAR/SICAR, consultas de 13/10/2026).
-- Pode rodar de novo. Permissão: módulo 'cert'. Migração "cert_desmatamento".
--
--  · cd_imoveis — cada imóvel monitorado: CAR, áreas (imóvel, RL, APP), marco de corte, conclusão
--  · cd_anos    — um ano por imóvel: vegetação nativa na RL, na APP e no imóvel, perdas no ano
--  · cd_alertas — polígonos PRODES que tocam o imóvel ou o entorno e a verificação de campo
-- Evidências ficam no OneDrive: só o link (padrão da Certificação desde 03/11/2026).
create table if not exists public.cd_imoveis (
  id uuid primary key default gen_random_uuid(),
  fazenda text not null,
  car text,
  situacao_car text,
  area_imovel numeric(10,2),
  rl_ha numeric(10,2),
  app_ha numeric(10,2),
  marco date not null default '2014-01-01',
  conclusao text,
  link_relatorio text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists cd_imoveis_fazenda on public.cd_imoveis(lower(fazenda));

create table if not exists public.cd_anos (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.cd_imoveis(id) on delete cascade,
  ano int not null check (ano between 1985 and 2100),
  nativa_rl numeric(10,2),
  nativa_app numeric(10,2),
  nativa_imovel numeric(10,2),
  perda_rl numeric(10,2),
  perda_imovel numeric(10,2),
  fonte text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  unique (imovel_id, ano)
);

create table if not exists public.cd_alertas (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null references public.cd_imoveis(id) on delete cascade,
  ano int not null,
  data_imagem date,
  area_total numeric(10,2),
  dentro_imovel numeric(10,2),
  dentro_rl numeric(10,2),
  distancia_m int,
  fonte text default 'PRODES Cerrado (INPE)',
  verificacao text not null default 'Não se aplica'
    check (verificacao in ('Não se aplica','Pendente','Sem desmatamento','Desmatamento confirmado')),
  verificado_em date,
  link_evidencia text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cd_alertas_imovel on public.cd_alertas(imovel_id, ano);

do $$ declare t text; begin
  foreach t in array array['cd_imoveis','cd_anos','cd_alertas'] loop
    execute format('drop trigger if exists cd_carimbo on public.%I', t);
    execute format('create trigger cd_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cd_leem on public.%I', t);
    execute format('drop policy if exists cd_inserem on public.%I', t);
    execute format('drop policy if exists cd_alteram on public.%I', t);
    execute format('drop policy if exists cd_apagam on public.%I', t);
    execute format('create policy cd_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cd_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy cd_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    execute format('create policy cd_apagam on public.%I for delete to authenticated using (public.app_pode(''cert''))', t);
  end loop;
end $$;

-- Carga: Fazenda Faca e Quilombo, números do relatório de 13/10/2026.
insert into public.cd_imoveis(fazenda, car, situacao_car, area_imovel, rl_ha, app_ha, conclusao, observacao)
values ('Fazenda Faca e Quilombo', 'MG-3111507-375A.687D.DDA2.4EBD.8500.FF71.08EB.3736', 'Aguardando análise', 315.6, 42.82, 7.6,
  'Entre 2014 e 2024 não foi identificada conversão de vegetação nativa em uso agrícola na Reserva Legal, nas APPs ou no restante do imóvel (MapBiomas Coleção 10 e PRODES Cerrado). A vegetação nativa do imóvel aumentou cerca de 2 ha no período.',
  'Os ~2 ha da RL fora da vegetação nativa aparecem como mosaico de usos e pastagem já em 2008 e 2014 (antes do marco) — efeito de borda do pixel de 30 m.')
on conflict do nothing;

with i as (select id from public.cd_imoveis where lower(fazenda) = lower('Fazenda Faca e Quilombo'))
insert into public.cd_anos(imovel_id, ano, nativa_rl, nativa_app, nativa_imovel, perda_rl, perda_imovel, fonte, observacao)
select i.id, v.ano, v.rl, 7.28, v.im, v.prl, v.pim, 'MapBiomas Coleção 10', v.obs from i, (values
  (2014, 40.62, 48.39, null::numeric, null::numeric, 'Ano do marco de corte (1º/01/2014).'),
  (2015, 40.62, 48.39, 0, 0, null), (2016, 40.62, 48.39, 0, 0, null), (2017, 40.62, 48.39, 0, 0, null),
  (2018, 40.62, 48.39, 0, 0, null),
  (2019, 40.62, 48.36, 0, 0.03, 'Um único pixel de borda fora da Reserva Legal.'),
  (2020, 40.62, 49.77, 0, 0, 'Regeneração sobre antigas pastagens.'), (2021, 40.62, 49.77, 0, 0, null),
  (2022, 40.62, 49.77, 0, 0, null), (2023, 40.73, 50.36, 0, 0, null), (2024, 40.73, 50.42, 0, 0, null)
) as v(ano, rl, im, prl, pim, obs)
on conflict (imovel_id, ano) do nothing;

with i as (select id from public.cd_imoveis where lower(fazenda) = lower('Fazenda Faca e Quilombo'))
insert into public.cd_alertas(imovel_id, ano, data_imagem, area_total, dentro_imovel, dentro_rl, distancia_m, verificacao, observacao)
select i.id, v.ano, v.dt::date, v.at, v.di, v.drl, v.dist, v.ver, v.obs from i, (values
  (2025, '2025-07-27', 1.49, 0.08, 0.08, 0, 'Pendente', 'Na divisa sul: polígono quase todo no vizinho; a ponta cai 0,08 ha na RL. Imagens 2024 e set/2026 mostram mata — conferir em campo com foto georreferenciada.'),
  (2025, '2025-07-27', 6.33, 0, 0, 180, 'Não se aplica', null),
  (2024, '2024-08-11', 7.69, 0, 0, 635, 'Não se aplica', null),
  (2018, '2018-07-29', 39.24, 0, 0, 1113, 'Não se aplica', null),
  (2012, null, null, 0.06, null, 0, 'Não se aplica', 'Dentro do perímetro, anterior ao marco de corte.'),
  (2010, null, null, 1.40, null, 0, 'Não se aplica', 'Dentro do perímetro, anterior ao marco de corte.'),
  (2004, null, null, 2.13, null, 0, 'Não se aplica', 'Dentro do perímetro, anterior ao marco de corte.')
) as v(ano, dt, at, di, drl, dist, ver, obs)
where not exists (select 1 from public.cd_alertas a where a.imovel_id = i.id);
