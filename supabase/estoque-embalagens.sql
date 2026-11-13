-- Embalagens dos produtos (13/11/2026, pedido dele: Cadastros › Embalagens).
-- Cada produto pode ter embalagens (Bag = 1000 kg, Galão = 20 L, Caixa = 12 un):
-- na entrada/saída a pessoa digita "3 bags" e o estoque grava 3000 kg.
create table if not exists public.est_embalagens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  nome text not null,
  fator numeric not null check (fator > 0),   -- quanto da unidade do produto cabe em 1 embalagem
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_embalagens_item on public.est_embalagens(item_id);
-- RLS igual às outras est_* (app_pode('estoque')) — aplicada pelo MCP em 13/11/2026.
