-- Área Estoque do LOP - Gestão Rápida: contagem mensal dos insumos por
-- almoxarifado (15/10/2026). Rodar uma vez no SQL Editor do Supabase.
-- Só cria tabelas novas (est_*); não mexe em nada que já existe.

create table if not exists public.est_locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fazenda text,
  acerto_grupo text,   -- vazio = acerto junto com as outras fazendas; com nome = acerto independente
  ordem int default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.est_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text,
  grupo text not null default 'Defensivos',  -- Defensivos, Fertilizantes, EPIs, Lubrificantes, Material de limpeza, Papelaria
  estoque_minimo numeric,      -- chegou nele (ou abaixo) na contagem → avisa reposição
  pedido_reposicao numeric,    -- quanto pedir quando chegar no mínimo
  locais_contagem uuid[],      -- estoques em que o item é contado; vazio = em todos
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.est_locais add column if not exists acerto_grupo text;

-- quem rodar o script depois de já ter a tabela ganha as duas colunas também
alter table public.est_itens add column if not exists estoque_minimo numeric;
alter table public.est_itens add column if not exists pedido_reposicao numeric;
alter table public.est_itens add column if not exists locais_contagem uuid[];

-- id = '<local_id>:<AAAA-MM>': dois aparelhos abrindo o mesmo mês caem no mesmo registro.
create table if not exists public.est_contagens (
  id text primary key,
  local_id uuid not null references public.est_locais(id),
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  responsavel text,
  aberta_por text,
  fechada_por text,
  fechada_em timestamptz,
  obs text,
  atualizado_em timestamptz not null default now(),
  unique (local_id, mes)
);

-- id = '<contagem_id>:<item_id>': regravar o mesmo item nunca duplica.
create table if not exists public.est_contagem_itens (
  id text primary key,
  contagem_id text not null references public.est_contagens(id) on delete cascade,
  item_id uuid not null references public.est_itens(id),
  quantidade numeric,
  contado_por text,
  atualizado_em timestamptz not null default now(),
  unique (contagem_id, item_id)
);
create index if not exists est_ci_contagem on public.est_contagem_itens(contagem_id);

-- Lotes de um item na contagem (pedido dele, 15/10/2026): quando o produto tem
-- lotes e vencimentos diferentes, cada lote é uma linha; o total do item em
-- est_contagem_itens é a soma dos lotes ativos. Lote tirado = ativo false.
create table if not exists public.est_contagem_lotes (
  id uuid primary key default gen_random_uuid(),
  contagem_id text not null references public.est_contagens(id) on delete cascade,
  item_id uuid not null references public.est_itens(id),
  lote text,
  validade date,
  quantidade numeric,
  contado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_cl_contagem on public.est_contagem_lotes(contagem_id);

-- Compra inteligente (pedido dele, 15/10/2026): o agrônomo levanta o que vai
-- precisar aplicar (etapa 1), confere só esses produtos no estoque (etapa 2,
-- sem ligação com o balanço mensal) e a etapa 3 mostra o que comprar
-- (necessário − estoque), editável.
create table if not exists public.est_compras (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,                 -- ex.: "Batata Pivô 1 — novembro"
  local_id uuid references public.est_locais(id),   -- estoque de DESTINO (onde vai ser usado)
  etapa int not null default 1 check (etapa between 1 and 3),
  status text not null default 'aberta' check (status in ('aberta','concluida')),
  criado_por text,
  criado_em timestamptz not null default now(),
  concluida_por text,
  concluida_em timestamptz,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.est_compra_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.est_compras(id) on delete cascade,
  item_id uuid not null references public.est_itens(id),
  necessario numeric,                   -- etapa 1
  estoque numeric,                      -- etapa 2 (conferido na prateleira)
  comprar numeric,                      -- etapa 3: vazio = necessário − estoque
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_cpi_compra on public.est_compra_itens(compra_id);

-- Etapa 2 por estoque (pedido dele, 15/10/2026): quanto tem de cada produto em
-- cada um dos estoques. id = '<compra_item_id>:<local_id>'. O total vai para
-- est_compra_itens.estoque.
create table if not exists public.est_compra_estoques (
  id text primary key,
  compra_item_id uuid not null references public.est_compra_itens(id) on delete cascade,
  local_id uuid not null references public.est_locais(id),
  quantidade numeric,
  transferir numeric,                   -- etapa 3: vazio = sugestão automática
  atualizado_em timestamptz not null default now()
);
alter table public.est_compra_estoques add column if not exists transferir numeric;
create index if not exists est_cpe_item on public.est_compra_estoques(compra_item_id);

-- Acerto (pedido dele, 15/10/2026): o saldo do sistema (estoque virtual do
-- sistema agro) lançado no app, por mês, item e estoque. O físico é a última
-- contagem fechada de cada estoque. id = 'AAAA-MM:<item_id>:<local_id>'.
create table if not exists public.est_saldos_sistema (
  id text primary key,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  item_id uuid not null references public.est_itens(id),
  local_id uuid not null references public.est_locais(id),
  saldo numeric,
  lancado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_ss_mes on public.est_saldos_sistema(mes);

-- Estoque Faz. Quebra Cocão (pedido dele, 15/10/2026): controle de entradas e
-- saídas, sem ligação com contagem nem acerto. Saldo = entradas − saídas.
-- Entrada: compra, transferência (ou saldo inicial, na implantação).
-- Saída: uso ou transferência — nº do documento, plantio, operador e, na
-- transferência, a fazenda de destino. Lançamento tirado = ativo false.
create table if not exists public.est_movimentos (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.est_locais(id),
  data date not null,
  sentido text not null check (sentido in ('entrada','saida')),
  tipo text not null,                 -- compra | transferencia | saldo_inicial | uso
  item_id uuid not null references public.est_itens(id),
  quantidade numeric not null,
  documento text,                     -- nº do documento / NF
  plantio text,
  operador text,
  outra_fazenda text,                 -- origem (entrada por transferência) ou destino (saída por transferência)
  fornecedor text,
  obs text,
  lancamento_id uuid,                 -- agrupa os itens lançados juntos (uma NF, uma requisição)
  criado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.est_movimentos add column if not exists lancamento_id uuid;
create index if not exists est_mov_local on public.est_movimentos(local_id, data);

-- Carimbo do servidor, RLS (quem tem o módulo 'estoque' ou é admin) e permissões.
do $$ declare t text; begin
  foreach t in array array['est_locais','est_itens','est_contagens','est_contagem_itens','est_contagem_lotes','est_compras','est_compra_itens','est_compra_estoques','est_saldos_sistema','est_movimentos'] loop
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

-- Os cinco estoques (pedido dele, 15/10/2026). O nome liga a contagem ao
-- Acerto pela aba "Sistema - ..." da planilha ("Lote 35" casa com
-- "Lote 35 PADAP"). Só insere o que ainda não existe.
insert into public.est_locais (nome, fazenda, ordem)
select v.nome, v.fazenda, v.ordem from (values
  ('Lote 35 PADAP', 'Lote 35 PADAP', 1),
  ('Faz. Faca', 'Fazenda Faca', 2),
  ('Faz. Morro Branco', 'Fazenda Morro Branco', 3),
  ('Faz. Três Riachos', 'Fazenda Três Riachos', 4),
  ('Faz. Quebra Cocão', 'Fazenda Quebra Cocão', 5)) v(nome, fazenda, ordem)
where not exists (select 1 from public.est_locais l where lower(l.nome) = lower(v.nome));

-- Quebra Cocão tem acerto independente: não troca transferência com as outras.
update public.est_locais set acerto_grupo = 'Quebra Cocão'
 where lower(nome) = lower('Faz. Quebra Cocão') and acerto_grupo is null;

-- Valor por unidade nas entradas do Estoque Quebra Cocão (21/10/2026, pedido dele).
-- A saída não guarda valor: o app calcula pelo custo médio das entradas.
alter table public.est_movimentos add column if not exists valor_unitario numeric;

-- AGROFIT no cadastro de itens (22/10/2026) — dados do MAPA (dados.agricultura.gov.br, Produto Formulado)
alter table public.est_itens
  add column if not exists agrofit_situacao text,
  add column if not exists agrofit_registro text,
  add column if not exists agrofit_marca text,
  add column if not exists agrofit_classe text,
  add column if not exists agrofit_ingrediente_ativo text,
  add column if not exists agrofit_formulacao text,
  add column if not exists agrofit_toxicologica text,
  add column if not exists agrofit_ambiental text,
  add column if not exists agrofit_titular text,
  add column if not exists agrofit_culturas text;
