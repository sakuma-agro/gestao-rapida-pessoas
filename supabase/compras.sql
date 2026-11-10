-- Rastro › Compras — solicitação de compra (10/11/2026, pedido do Guilherme)
-- Quem tem login no app lança o que precisa ser comprado; o comprador
-- (módulo 'compras' em Usuários e Acessos, ou administrador) vê todos os
-- pedidos e anda com eles: Solicitado → Em cotação → Comprado → Entregue
-- (ou Recusado). Quem pediu vê só os seus pedidos.

create or replace function public.app_usuario()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.app_usuarios where lower(email) = public.app_email());
$$;

create table if not exists public.cmp_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  item text not null check (length(trim(item)) > 0),
  quantidade numeric,
  unidade text,
  destino text,
  urgencia text not null default 'normal' check (urgencia in ('normal', 'urgente', 'parou')),
  motivo text,
  situacao text not null default 'solicitado'
    check (situacao in ('solicitado', 'cotacao', 'comprado', 'entregue', 'recusado')),
  pedido_por_email text not null default public.app_email(),
  pedido_por_nome text,
  fornecedor text,
  previsao date,
  obs_comprador text,
  recusa_motivo text,
  comprado_em date,
  entregue_em date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cmp_pedidos_sit on public.cmp_pedidos (situacao) where ativo;

alter table public.cmp_pedidos enable row level security;

drop policy if exists cmp_ver on public.cmp_pedidos;
create policy cmp_ver on public.cmp_pedidos for select to authenticated
  using (public.app_pode('compras') or (public.app_usuario() and lower(pedido_por_email) = public.app_email()));

drop policy if exists cmp_pedir on public.cmp_pedidos;
create policy cmp_pedir on public.cmp_pedidos for insert to authenticated
  with check (public.app_usuario() and lower(pedido_por_email) = public.app_email() and situacao = 'solicitado');

-- comprador muda tudo
drop policy if exists cmp_comprador on public.cmp_pedidos;
create policy cmp_comprador on public.cmp_pedidos for update to authenticated
  using (public.app_pode('compras')) with check (public.app_pode('compras'));

-- quem pediu corrige ou cancela o próprio pedido enquanto está Solicitado
drop policy if exists cmp_dono on public.cmp_pedidos;
create policy cmp_dono on public.cmp_pedidos for update to authenticated
  using (lower(pedido_por_email) = public.app_email() and situacao = 'solicitado')
  with check (lower(pedido_por_email) = public.app_email() and situacao = 'solicitado');

grant select, insert, update on public.cmp_pedidos to authenticated;

revoke execute on function public.app_usuario() from public, anon;
grant execute on function public.app_usuario() to authenticated;
revoke all on public.cmp_pedidos from anon;

-- ---------------------------------------------------------------------------
-- QR da parede SEM LOGIN (10/11/2026, "quero que o qr code não peça login,
-- funcione para qq um"). A página pedido.html chama cmp_pedir_publico com o
-- código secreto do QR. Sem login ninguém lê pedidos nem o código.
alter table public.cmp_pedidos add column if not exists origem text not null default 'app';

create table if not exists public.cmp_config (
  id int primary key default 1 check (id = 1),
  chave_qr text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  trocada_em timestamptz not null default now()
);
alter table public.cmp_config enable row level security;   -- sem políticas: só as funções leem
revoke all on public.cmp_config from anon, authenticated;
insert into public.cmp_config (id) values (1) on conflict do nothing;

create or replace function public.cmp_pedir_publico(
  p_chave text, p_nome text, p_item text, p_quantidade numeric, p_unidade text,
  p_destino text, p_urgencia text, p_motivo text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v_num bigint;
begin
  if p_chave is null or p_chave <> (select chave_qr from cmp_config where id = 1) then
    raise exception 'codigo_invalido' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 80 then raise exception 'nome_invalido'; end if;
  if length(trim(coalesce(p_item, ''))) < 2 or length(p_item) > 160 then raise exception 'item_invalido'; end if;
  if p_quantidade is not null and (p_quantidade <= 0 or p_quantidade > 1000000) then raise exception 'qtd_invalida'; end if;
  if length(coalesce(p_motivo, '')) > 400 or length(coalesce(p_unidade, '')) > 20 or length(coalesce(p_destino, '')) > 60 then
    raise exception 'texto_longo';
  end if;
  if (select count(*) from cmp_pedidos where origem = 'qr' and criado_em > now() - interval '1 hour') >= 60 then
    raise exception 'muitos_pedidos';
  end if;
  insert into cmp_pedidos (item, quantidade, unidade, destino, urgencia, motivo, pedido_por_email, pedido_por_nome, origem, atualizado_por)
  values (trim(p_item), p_quantidade, nullif(trim(p_unidade), ''), nullif(trim(p_destino), ''),
          case when p_urgencia in ('normal', 'urgente', 'parou') then p_urgencia else 'normal' end,
          nullif(trim(p_motivo), ''), 'qr', trim(p_nome), 'qr', trim(p_nome) || ' (QR)')
  returning numero into v_num;
  return v_num;
end $$;
revoke all on function public.cmp_pedir_publico(text, text, text, numeric, text, text, text, text) from public;
grant execute on function public.cmp_pedir_publico(text, text, text, numeric, text, text, text, text) to anon, authenticated;

create or replace function public.cmp_chave_qr()
returns text language sql stable security definer set search_path to 'public' as $$
  select chave_qr from cmp_config where id = 1 and public.app_pode('compras');
$$;
create or replace function public.cmp_trocar_chave_qr()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v text;
begin
  if not public.app_admin() then raise exception 'so_admin'; end if;
  update cmp_config set chave_qr = encode(extensions.gen_random_bytes(12), 'hex'), trocada_em = now() where id = 1 returning chave_qr into v;
  return v;
end $$;
revoke all on function public.cmp_chave_qr() from public, anon;
revoke all on function public.cmp_trocar_chave_qr() from public, anon;
grant execute on function public.cmp_chave_qr() to authenticated;
grant execute on function public.cmp_trocar_chave_qr() to authenticated;
