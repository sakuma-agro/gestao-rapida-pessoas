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
