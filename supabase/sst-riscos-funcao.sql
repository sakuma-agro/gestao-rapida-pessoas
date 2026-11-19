-- SST › Riscos por função (19/11/2026, gr-v732). Já aplicado (migração sst_riscos_funcao).
-- Pedido dele: o quadro 04 do ASO impresso sair com os riscos da função já
-- marcados, do mesmo jeito que os exames. A marcação mora aqui.
--
-- sst_riscos_funcao(funcao, grupo, risco) — chave pelos três.
--   grupo: fis | qui | bio | erg
--   risco: o rótulo do próprio ASO ("Ruídos", "Poeiras"…), vindo da lista fixa
--          RISCOS do js/aso.js. Não é cadastro livre: são os riscos do modelo.
-- RLS: logados leem; grava quem tem sst/epis (app_pode_algum), igual à
--      sst_exames_funcao.
-- Entra sozinha no backup diário (a lista vem da rpc backup_tabelas).

create table if not exists public.sst_riscos_funcao (
  funcao text not null,
  grupo text not null,
  risco text not null,
  criado_em timestamptz not null default now(),
  primary key (funcao, grupo, risco)
);

create index if not exists sst_riscos_funcao_funcao_idx on public.sst_riscos_funcao (funcao);

alter table public.sst_riscos_funcao enable row level security;

create policy logados_leem on public.sst_riscos_funcao
  for select to authenticated using (true);
create policy modulo_insere on public.sst_riscos_funcao
  for insert to authenticated with check (app_pode_algum(array['sst','epis']::text[]));
create policy modulo_altera on public.sst_riscos_funcao
  for update to authenticated using (app_pode_algum(array['sst','epis']::text[]))
  with check (app_pode_algum(array['sst','epis']::text[]));
create policy modulo_apaga on public.sst_riscos_funcao
  for delete to authenticated using (app_pode_algum(array['sst','epis']::text[]));
