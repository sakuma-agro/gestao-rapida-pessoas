-- Área Colheita e Produção do LOP - Gestão Rápida (20/10/2026).
-- Substitui as planilhas "Controle Colheita - <cultura>" (cenoura, batata,
-- café, milho, trigo, abacate). Tabelas no esquema public com o prefixo cp_.
-- Rodar uma vez no SQL Editor do Supabase; só cria o que não existe.
--
-- Desenho: uma estrutura só para todas as culturas. O que muda de uma para
-- outra (unidade, classificação, campos da carga, conferência) é PERFIL,
-- guardado em cp_culturas (jsonb), não em tabelas separadas.

-- Culturas / perfis -----------------------------------------------------------
create table if not exists public.cp_culturas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                     -- cenoura, batata, cafe, milho, trigo, abacate…
  nome text not null,
  unidade_nome text not null default 'sc',       -- 'cx' | 'sc'
  unidade_kg numeric,                            -- 29 (cenoura), 25 (batata), 60 (grãos, café); vazio = sem conversão por peso
  unidade_area text not null default 'plantio',  -- rótulo da unidade de comparação: plantio | quadra | talhão
  conciliacao text not null default 'balanca',   -- nenhuma | balanca | balanca_coop | coop
  palavra_chave text,                            -- filtra as linhas da cultura nos relatórios da balança (ITEM)
  classes jsonb not null default '[]'::jsonb,    -- [{chave, nome, modo:'kg'|'un'}] classificação da carga
  campos jsonb not null default '{}'::jsonb,     -- quais campos aparecem na carga
  parametros jsonb not null default '{}'::jsonb, -- tolerâncias, fretes de referência…
  cor text,                                      -- cor da cultura no painel
  ordem int default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Safras: uma linha por cultura e safra ('Inverno 2026', '2025/2026', 'Safrinha 2026'…)
create table if not exists public.cp_safras (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  nome text not null,
  inicio date,
  fim date,
  atual boolean not null default false,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_safras_cultura on public.cp_safras(cultura_id);

-- Plantios / quadras / talhões: a unidade de comparação de cada cultura
create table if not exists public.cp_plantios (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  cod_agro text,
  nome text not null,                 -- 'Pl 21', 'Q4', 'Pivot 1 - Lote 35'
  nome_completo text,                 -- 'Cen Pl 21 - Pivot 3 - Faca 2'
  fazenda text,
  setor text,                         -- pivô / talhão
  bloco text,                         -- café: duas quadras colhidas juntas somam no mesmo bloco
  area numeric not null default 0,
  variedade text,
  ano_plantio int,
  espacamento text,
  n_plantas int,
  inicio_plantio date,
  fim_plantio date,
  situacao text,                      -- livre: 'Gradeado', 'A colher'…
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_plantios_cultura on public.cp_plantios(cultura_id);
create index if not exists cp_plantios_safra on public.cp_plantios(safra_id);

-- Cargas: uma linha por carregamento (a "fichinha" do campo). Os campos que
-- cada cultura usa estão em cp_culturas.campos; os outros ficam vazios.
create table if not exists public.cp_cargas (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  plantio_id uuid references public.cp_plantios(id),
  data date not null,
  placa text,
  motorista text,
  turmeiro text,
  ticket_faz text,                    -- ticket da fazenda (bloco)
  ticket_balanca text,                -- ticket da balança (relatório)
  nf text,
  nf_coop text,
  lote text,
  lote_controle text,
  boletim text,                       -- nº boletim / NF do lavador
  tipo text,                          -- cenoura: Lavada | Suja
  bags int,
  quantidade numeric,                 -- caixas/sacas contadas no campo
  pct_carga numeric not null default 100,  -- carga com dois plantios = duas linhas com % cada
  peso_entrada numeric,               -- kg (roça / bruto)
  peso_liquido numeric,               -- kg líquido (balança / beneficiado)
  classes jsonb not null default '{}'::jsonb,  -- {AAA: 5177, AA: 1650…} ou {EXTRA: 460, '1X': 22…} ou {BX,BM,ESC}
  umidade_pct numeric,
  impureza_pct numeric,
  umidade_kg numeric,
  impureza_kg numeric,
  quebra_kg numeric,
  situacao_pagto text,                -- batata: Pago | Pendente
  ticket_coop text,
  data_pagto date,
  frete_tipo text,                    -- Próprio | Terceiro | Sem frete
  valor_frete numeric,
  valor_beneficiamento numeric,
  valor_embalagem numeric,
  valor_aluguel_cx numeric,
  valor_arranquio numeric,
  valor_mo numeric,
  valor_servico numeric,
  conferido boolean not null default false,
  status_conc text,                   -- ok | divergente | sem_balanca | sem_coop | manual
  alertas text,
  obs text,
  criado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_cargas_safra on public.cp_cargas(safra_id);
create index if not exists cp_cargas_plantio on public.cp_cargas(plantio_id);
create index if not exists cp_cargas_data on public.cp_cargas(data);
create index if not exists cp_cargas_tkb on public.cp_cargas(ticket_balanca);

-- Relatório da balança (importado do xlsx/csv): uma linha por ticket.
create table if not exists public.cp_balanca (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  ticket text not null,
  data date,
  placa text,
  item text,
  motorista text,
  fornecedor text,
  nf text,
  romaneio_prop text,                 -- "NÚMERO ROMANEIO PROPRIETÁRIO" = ticket da fazenda
  peso_bruto numeric,                 -- PESO SUBTOTAL (KG) = carga bruta
  peso_liquido numeric,
  desconto_kg numeric,
  impureza_pct numeric, impureza_kg numeric,
  umidade_pct numeric,  umidade_kg numeric,
  quebrado_pct numeric, quebrado_kg numeric,
  bruto jsonb,                        -- a linha original
  importado_em timestamptz default now(),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (ticket)
);
create index if not exists cp_balanca_safra on public.cp_balanca(safra_id);
create index if not exists cp_balanca_rom on public.cp_balanca(romaneio_prop);

-- Relatório da cooperativa (importado): uma linha por ticket.
create table if not exists public.cp_cooperativa (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid references public.cp_culturas(id),
  safra_id uuid references public.cp_safras(id),
  ticket text not null,
  nf text,
  lote text,
  data date,
  placa text,
  material text,
  propriedade text,
  safra_coop text,
  entrada_bruta numeric,
  impurezas numeric,
  umidade numeric,
  quebra numeric,
  sacas_entrada numeric,
  bruto jsonb,
  importado_em timestamptz default now(),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (ticket)
);
create index if not exists cp_coop_safra on public.cp_cooperativa(safra_id);

-- Histórico de safras (para o comparativo de produtividade desde 2019).
create table if not exists public.cp_historico (
  id uuid primary key default gen_random_uuid(),
  cultura_id uuid not null references public.cp_culturas(id),
  safra_nome text not null,
  fazenda text,                       -- vazio = total da safra
  area numeric,
  producao_kg numeric,
  unidades numeric,                   -- sacas ou caixas
  produtividade numeric,              -- unidades / ha
  fonte text,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_historico_cultura on public.cp_historico(cultura_id);

-- Custos lançados por plantio fora da carga (frete por premissa, beneficiamento total…)
create table if not exists public.cp_custos (
  id uuid primary key default gen_random_uuid(),
  plantio_id uuid not null references public.cp_plantios(id),
  tipo text not null,                 -- Frete | Beneficiamento | Embalagem | Arranquio | MO | Outros
  descricao text,
  data date,
  quantidade numeric,
  valor_unitario numeric,
  valor numeric not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists cp_custos_plantio on public.cp_custos(plantio_id);

-- Placas e motoristas (lista de apoio no lançamento)
create table if not exists public.cp_veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  motorista text,
  frete_tipo text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Carimbo do servidor, RLS (quem tem o módulo 'colheita' ou é admin) e permissões.
-- Sem drop/revoke de propósito (20/10/2026): o painel pedia confirmação extra
-- e cancelava; assim o bloco só cria o que falta e pode rodar de novo.
do $$ declare t text; begin
  foreach t in array array['cp_culturas','cp_safras','cp_plantios','cp_cargas','cp_balanca','cp_cooperativa','cp_historico','cp_custos','cp_veiculos'] loop
    if not exists (select 1 from pg_trigger where tgname='marcar_atualizacao' and tgrelid=('public.'||t)::regclass) then
      execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    end if;
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='cp_ler') then
      execute format('create policy cp_ler on public.%I for select to authenticated using (public.app_pode(''colheita''))', t);
      execute format('create policy cp_gravar on public.%I for insert to authenticated with check (public.app_pode(''colheita''))', t);
      execute format('create policy cp_trocar on public.%I for update to authenticated using (public.app_pode(''colheita'')) with check (public.app_pode(''colheita''))', t);
    end if;
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
  -- limpar uma importação (balança/cooperativa) apaga as linhas de verdade
  if not exists (select 1 from pg_policies where tablename='cp_balanca' and policyname='cp_apagar') then
    execute 'create policy cp_apagar on public.cp_balanca for delete to authenticated using (public.app_pode(''colheita''))';
    execute 'create policy cp_apagar on public.cp_cooperativa for delete to authenticated using (public.app_pode(''colheita''))';
  end if;
  execute 'grant delete on public.cp_balanca, public.cp_cooperativa to authenticated';
end $$;

-- Os 6 perfis das planilhas de out/2026. Só insere o que falta.
insert into public.cp_culturas (slug, nome, unidade_nome, unidade_kg, unidade_area, conciliacao, palavra_chave, classes, campos, parametros, cor, ordem)
select v.* from (values
  ('cenoura', 'Cenoura', 'cx', 29, 'plantio', 'balanca', 'CENOURA',
   '[{"chave":"AAA","nome":"AAA","modo":"kg"},{"chave":"AA","nome":"AA","modo":"kg"},{"chave":"A","nome":"A","modo":"kg"},{"chave":"G","nome":"G","modo":"kg"}]'::jsonb,
   '{"quantidade":"Caixas","tipo":["Lavada","Suja"],"boletim":true,"ticket_balanca":true,"peso_liquido":"Prod. roça (kg)","sacas_por_peso":true,"financeiro":["valor_arranquio","valor_frete","valor_beneficiamento","valor_embalagem","valor_aluguel_cx"]}'::jsonb,
   '{"tolerancia_data":3,"tolerancia_peso_pct":0.5,"preco_arranquio_cx":4.57}'::jsonb, '#E8711A', 1),
  ('batata', 'Batata', 'sc', 25, 'plantio', 'coop', 'BATATA',
   '[{"chave":"EXTRA","nome":"Extra","modo":"un"},{"chave":"1X","nome":"1ª X","modo":"un"},{"chave":"2","nome":"2ª","modo":"un"},{"chave":"BONECA","nome":"Boneca","modo":"un"},{"chave":"FLORAO","nome":"Florão","modo":"un"}]'::jsonb,
   '{"motorista":true,"bags":true,"situacao_pagto":true,"ticket_coop":true,"data_pagto":true,"quantidade_auto":"soma_classes","classe_destaque":"EXTRA","financeiro":["valor_frete","valor_beneficiamento"]}'::jsonb,
   '{"frete_por_carga":645,"beneficiamento_por_sc":6.5}'::jsonb, '#C9A227', 2),
  ('cafe', 'Café', 'sc', 60, 'quadra', 'balanca_coop', 'CAFE',
   '[{"chave":"BX","nome":"BX","modo":"un"},{"chave":"BM","nome":"BM","modo":"un"},{"chave":"ESC","nome":"Esc.","modo":"un"}]'::jsonb,
   '{"peso_entrada":"Peso entrada (kg)","peso_liquido":"Peso líq. (kg)","ticket_balanca":true,"nf":true,"lote":true,"lote_controle":true,"quantidade_auto":"soma_classes","rendimento":true,"financeiro":["valor_beneficiamento","valor_frete"]}'::jsonb,
   '{"tolerancia_data":3,"tolerancia_peso_pct":10,"conferir_nf":true}'::jsonb, '#744F28', 3),
  ('milho', 'Milho', 'sc', 60, 'plantio', 'balanca_coop', 'MILHO',
   '[]'::jsonb,
   '{"ticket_balanca":true,"nf":true,"umidade":true,"impureza":true,"frete_tipo":true,"pct_carga":true,"sacas_por_peso":true,"financeiro":["valor_frete","valor_servico"]}'::jsonb,
   '{"tolerancia_data":3,"tolerancia_peso_pct":0.5,"frete_proprio_sc":3.68,"frete_terceiro_t":115,"patronal_pct":4,"conferir_nf":true}'::jsonb, '#D4A017', 4),
  ('trigo', 'Trigo', 'sc', 60, 'plantio', 'balanca_coop', 'TRIGO',
   '[]'::jsonb,
   '{"ticket_balanca":true,"nf":true,"umidade":true,"impureza":true,"frete_tipo":true,"pct_carga":true,"sacas_por_peso":true,"financeiro":["valor_frete","valor_servico"]}'::jsonb,
   '{"tolerancia_data":3,"tolerancia_peso_pct":0.5,"frete_proprio_sc":3.68,"frete_terceiro_t":115,"patronal_pct":4,"conferir_nf":true}'::jsonb, '#B8860B', 5),
  ('abacate', 'Abacate', 'cx', null, 'talhão', 'balanca', 'ABACATE',
   '[]'::jsonb,
   '{"quantidade":"Caixas","turmeiro":true,"ticket_balanca":true,"peso_liquido":"Peso líq. (kg)","boletim":true,"nf":true,"financeiro":["valor_mo","valor_frete","valor_beneficiamento","valor_embalagem"]}'::jsonb,
   '{"tolerancia_data":3}'::jsonb, '#3F8A4F', 6)
) v(slug, nome, unidade_nome, unidade_kg, unidade_area, conciliacao, palavra_chave, classes, campos, parametros, cor, ordem)
where not exists (select 1 from public.cp_culturas c where c.slug = v.slug);

-- 26/10/2026 — Financeiro › Controle de pagamento de fretes (carga por carga).
-- O valor fica em valor_frete (o mesmo de "Custos desta carga"); a situação do
-- pagamento do frete tem campos próprios (situacao_pagto/data_pagto são do
-- pagamento da cooperativa). Migração "cp_cargas_pagamento_frete".
alter table public.cp_cargas add column if not exists valor_frete numeric;
alter table public.cp_cargas add column if not exists frete_situacao text;   -- Pendente | Pago
alter table public.cp_cargas add column if not exists frete_pago_em date;
alter table public.cp_cargas add column if not exists frete_forma text;      -- PIX, Transferência, Boleto, Dinheiro, Cheque
alter table public.cp_cargas add column if not exists frete_obs text;
