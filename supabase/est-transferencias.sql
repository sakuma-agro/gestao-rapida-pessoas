-- Estoque › Contagem › Transferências (19/11/2026, gr-v734). Já aplicada.
-- Pedido dele: "meu objetivo é saber o que preciso fazer ao contar todos os
-- estoques, se é transferir ou comprar; a compra é para todos os estoques,
-- mas sempre a transferência vem do principal, Lote 35".
--
-- O que falta fazer NÃO mora aqui: é calculado na hora, das últimas contagens
-- fechadas de cada tipo (estoque/js/resultado.js). Esta tabela guarda só o que
-- ele marcou como CONCLUÍDO — a transferência que realmente saiu do principal.
-- Com ela, o item sai da lista do que falta transferir e não volta a ser
-- pedido na coluna Comprar do Resultado.
--
-- id: uuid gerado no aparelho (pode ter mais de uma transferência do mesmo
--     item para a mesma fazenda — entrega parcial).
-- contagem_id: a contagem fechada do DESTINO que gerou a sugestão. Contagem
--     nova = sugestão nova; o que foi feito na rodada anterior fica no
--     histórico sem atrapalhar.
-- Desfazer grava ativo = false (nada é apagado).
-- RLS igual às outras est_*: lê quem tem estoque/sst/epis, grava quem tem estoque.
-- Entra sozinha no backup diário (a lista vem da rpc backup_tabelas).

create table if not exists public.est_transferencias (
  id text primary key,
  item_id uuid not null,
  de_local_id uuid not null,
  para_local_id uuid not null,
  quantidade numeric not null,
  grupo text,
  contagem_id text,
  concluida_em timestamptz,
  concluida_por text,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create index if not exists est_transferencias_contagem_idx on public.est_transferencias (contagem_id);
create index if not exists est_transferencias_item_idx on public.est_transferencias (item_id);

create trigger marcar_atualizacao before insert or update on public.est_transferencias
  for each row execute function marcar_atualizacao();

alter table public.est_transferencias enable row level security;

create policy est_ler on public.est_transferencias
  for select to authenticated using (app_pode_algum(array['estoque','sst','epis']::text[]));
create policy est_gravar on public.est_transferencias
  for insert to authenticated with check (app_pode('estoque'::text));
create policy est_trocar on public.est_transferencias
  for update to authenticated using (app_pode('estoque'::text)) with check (app_pode('estoque'::text));
