-- cert-fornecedores.sql — Certificação › Fornecedores: avaliação de fornecedores (FORM 023), 26/10/2026.
-- Pedido do Guilherme: "o form 23 conseguimos fazer uma aba no app".
-- Segue o POP 021 (Fornecedores): avaliar a cada entrega, monitorar a cada 4 entregas;
-- nota 10 = todas conformes, nota 8 = uma não conforme, reprovado = 2 ou mais.
-- Pode rodar de novo. Permissão: módulo 'cert'. Migração "cert_fornecedores".
--
--  · cfo_avaliacoes — uma linha por entrega/visita avaliada: categoria do FORM
--    (viveiro, pragas, caixa_agua, colheita, packing), data, fornecedor, lote, NF,
--    as respostas SIM/NÃO de cada pergunta (itens, jsonb), conforme, justificativa.
-- Evidências (arquivos): certificacao/evidencia/f23-<id da avaliação>/… e o link do OneDrive em evid_url.
create table if not exists public.cfo_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('viveiro','pragas','caixa_agua','colheita','packing')),
  data date not null,
  fornecedor text not null,
  lote text,
  nf text,
  itens jsonb not null default '{}'::jsonb,
  conforme boolean not null default true,
  justificativa text,
  evid_url text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cfo_avaliacoes_cat on public.cfo_avaliacoes(categoria, data desc);
drop trigger if exists cfo_carimbo on public.cfo_avaliacoes;
create trigger cfo_carimbo before update on public.cfo_avaliacoes for each row execute function public.marcar_atualizacao();
alter table public.cfo_avaliacoes enable row level security;
revoke all on public.cfo_avaliacoes from anon;
grant select, insert, update, delete on public.cfo_avaliacoes to authenticated;
drop policy if exists cfo_leem on public.cfo_avaliacoes;
drop policy if exists cfo_inserem on public.cfo_avaliacoes;
drop policy if exists cfo_alteram on public.cfo_avaliacoes;
drop policy if exists cfo_apagam on public.cfo_avaliacoes;
create policy cfo_leem on public.cfo_avaliacoes for select to authenticated using (public.app_pode('cert'));
create policy cfo_inserem on public.cfo_avaliacoes for insert to authenticated with check (public.app_pode('cert'));
create policy cfo_alteram on public.cfo_avaliacoes for update to authenticated using (public.app_pode('cert')) with check (public.app_pode('cert'));
create policy cfo_apagam on public.cfo_avaliacoes for delete to authenticated using (public.app_pode('cert'));

-- Histórico do FORM 023 preenchido (FV-GFS 04.01), 2024–2026 — todas conformes.
insert into public.cfo_avaliacoes (categoria, data, fornecedor, itens, conforme, criado_por)
select v.cat, v.d::date, v.f, v.i::jsonb, true, 'importado do FORM 023'
from (values
  ('viveiro','2024-12-20','CURTS GOODSON GUIMARAES','{"nf":true,"defensivos":true}'),
  ('colheita','2024-03-23','COOPADAP','{"pop01":true,"pop06":true,"ficha":true,"produto":true}'),
  ('colheita','2025-03-11','COOPADAP','{"pop01":true,"pop06":true,"ficha":true,"produto":true}'),
  ('colheita','2026-03-06','COOPADAP','{"pop01":true,"pop06":true,"ficha":true,"produto":true}'),
  ('caixa_agua','2024-02-17','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('caixa_agua','2024-11-25','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('caixa_agua','2025-05-02','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('caixa_agua','2025-11-04','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2024-01-15','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2024-04-10','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2024-07-10','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2024-10-14','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2025-01-13','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2025-04-14','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2025-07-15','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2025-10-19','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('pragas','2026-01-12','DETE HIGI','{"frequencia":true,"relatorio":true,"fispq":true}'),
  ('packing','2024-03-23','COOPADAP','{"manuseio":true}'),
  ('packing','2025-03-11','COOPADAP','{"manuseio":true}'),
  ('packing','2025-03-11','CARLINI','{"manuseio":true}'),
  ('packing','2026-03-06','COOPADAP','{"manuseio":true}')
) v(cat, d, f, i)
where not exists (select 1 from public.cfo_avaliacoes);
