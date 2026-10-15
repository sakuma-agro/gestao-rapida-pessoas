-- Máquinas e Patrimônio (15/10/2026) — JÁ APLICADO no Supabase (projeto ysvmfmnwbcxgsrjewwsy).
-- Pedido do Guilherme: a área Manutenções virou "Máquinas e Patrimônio", com um
-- módulo Patrimônio para bens como furadeira; uma foto principal por máquina e
-- por bem, no Drive; código de patrimônio com numeração única entre máquinas e bens.

create table if not exists manutencao.bens_patrimonio (
  id uuid primary key default gen_random_uuid(),
  patrimonio text,
  descricao text not null,
  categoria text,
  marca text,
  modelo text,
  numero_serie text,
  local_id uuid references manutencao.locais(id),
  responsavel text,
  situacao text not null default 'EM_USO'
    check (situacao in ('EM_USO','GUARDADO','EM_MANUTENCAO','EMPRESTADO','BAIXADO')),
  data_compra date,
  valor_compra numeric(14,2),
  foto_url text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz default now()
);
create unique index if not exists uq_bens_patrimonio on manutencao.bens_patrimonio(patrimonio) where patrimonio is not null;
create index if not exists ix_bens_local on manutencao.bens_patrimonio(local_id);

create table if not exists manutencao.patrimonio_movimentos (
  id uuid primary key default gen_random_uuid(),
  bem_id uuid not null references manutencao.bens_patrimonio(id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('CADASTRO','TRANSFERENCIA','EMPRESTIMO','DEVOLUCAO','MANUTENCAO','RETORNO','BAIXA','AJUSTE')),
  de_local_id uuid references manutencao.locais(id),
  para_local_id uuid references manutencao.locais(id),
  de_situacao text,
  para_situacao text,
  responsavel text,
  observacao text,
  registrado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists ix_movs_bem on manutencao.patrimonio_movimentos(bem_id, data);

create unique index if not exists uq_equip_patrimonio on manutencao.equipamentos(patrimonio)
  where patrimonio is not null and patrimonio <> '';

-- Próximo número livre: maior número entre máquinas e bens + 1, com 6 dígitos.
create or replace function manutencao.proximo_patrimonio()
returns text language sql stable security definer set search_path = manutencao, public as $f$
  select lpad((coalesce(max(n), 0) + 1)::text, 6, '0') from (
    select patrimonio::bigint n from manutencao.equipamentos where patrimonio ~ '^[0-9]{1,12}$'
    union all
    select patrimonio::bigint from manutencao.bens_patrimonio where patrimonio ~ '^[0-9]{1,12}$'
  ) x;
$f$;

create or replace function manutencao.patrimonio_em_uso(p text, p_id uuid)
returns boolean language sql stable security definer set search_path = manutencao, public as $f$
  select exists (select 1 from manutencao.equipamentos where patrimonio = p and id <> p_id)
      or exists (select 1 from manutencao.bens_patrimonio where patrimonio = p and id <> p_id);
$f$;

-- Antes de gravar: número só com dígitos vira 6 dígitos; vazio num cadastro novo
-- recebe o próximo livre; número de outro (dois aparelhos sem internet escolheram
-- o mesmo) faz o cadastro NOVO pegar o próximo livre — o app recebe o número
-- certo de volta. Em alteração, número repetido é recusado.
create or replace function manutencao.tg_patrimonio_unico()
returns trigger language plpgsql security definer set search_path = manutencao, public as $f$
declare novo boolean;
begin
  new.patrimonio := nullif(btrim(coalesce(new.patrimonio, '')), '');
  if new.patrimonio ~ '^[0-9]{1,6}$' then new.patrimonio := lpad(new.patrimonio, 6, '0'); end if;
  novo := tg_op = 'INSERT' and not exists (
    select 1 from manutencao.equipamentos where id = new.id
    union all select 1 from manutencao.bens_patrimonio where id = new.id);
  if new.patrimonio is null then
    if novo then new.patrimonio := manutencao.proximo_patrimonio(); end if;
  elsif manutencao.patrimonio_em_uso(new.patrimonio, new.id) then
    if novo then new.patrimonio := manutencao.proximo_patrimonio();
    else raise exception 'O codigo de patrimonio ja e de outra maquina ou bem: %', new.patrimonio;
    end if;
  end if;
  return new;
end $f$;

create trigger tg_patrimonio_unico before insert or update of patrimonio on manutencao.bens_patrimonio
  for each row execute procedure manutencao.tg_patrimonio_unico();
create trigger tg_patrimonio_unico before insert or update of patrimonio on manutencao.equipamentos
  for each row execute procedure manutencao.tg_patrimonio_unico();

alter table manutencao.bens_patrimonio enable row level security;
alter table manutencao.patrimonio_movimentos enable row level security;
create policy bens_all on manutencao.bens_patrimonio for all to authenticated
  using (manutencao.pode() and (local_id is null or local_id in (select manutencao.locais_do_usuario())))
  with check (manutencao.pode() and (local_id is null or local_id in (select manutencao.locais_do_usuario())));
create policy movs_all on manutencao.patrimonio_movimentos for all to authenticated
  using (manutencao.pode() and exists (select 1 from manutencao.bens_patrimonio b where b.id = bem_id))
  with check (manutencao.pode() and exists (select 1 from manutencao.bens_patrimonio b where b.id = bem_id));
grant select, insert, update on manutencao.bens_patrimonio, manutencao.patrimonio_movimentos to authenticated;
grant all on manutencao.bens_patrimonio, manutencao.patrimonio_movimentos to service_role;

-- Fotos de máquina e de bem no Drive (função "arquivos"): tipos 'maquina' e 'patrimonio'
alter table public.arquivos drop constraint arquivos_tipo_check, add constraint arquivos_tipo_check
  check (tipo in ('funcionario','treinamento','exame','os','checklist','documento','maquina','patrimonio'));
-- public.arquivo_pode: manutencoes + ('os','checklist','maquina','patrimonio') → app_pode('manutencoes')
