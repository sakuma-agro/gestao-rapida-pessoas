-- SST › EPI's › Cronograma de troca (28/10/2026)
-- Pedido do Guilherme: não controlar entrada e saída de EPI no sistema; só,
-- para alguns EPIs, marcar QUANDO foi entregue e ver a PRÓXIMA troca.
-- Veio do apontamento da auditoria (item 1.26 "Frequência de entrega e
-- termo de EPI": conferir a frequência de reposição e o procedimento).
--
-- A frequência mora no próprio tipo de EPI (epis.troca_qtd/troca_unidade,
-- já existiam). troca_confirmada separa o que ele/técnico confirmou do que
-- entrou como sugestão do Claude. Uma entrega = data + para quem (grupo,
-- equipe ou fazenda, texto livre; vazio = todos). Próxima troca = última
-- entrega do tipo+grupo + frequência (calculada no app, não gravada).

alter table public.epis add column if not exists troca_confirmada boolean not null default false;

create table if not exists public.epi_entregas (
  id            uuid primary key default gen_random_uuid(),
  epi_id        uuid not null references public.epis(id) on delete cascade,
  entregue_em   date not null,
  para          text not null default '',
  obs           text,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists epi_entregas_epi on public.epi_entregas (epi_id, entregue_em desc);

drop trigger if exists lop_atualizado on public.epi_entregas;
create trigger lop_atualizado before update on public.epi_entregas
  for each row execute function marcar_atualizacao();

alter table public.epi_entregas enable row level security;
drop policy if exists logados_leem on public.epi_entregas;
create policy logados_leem on public.epi_entregas for select to authenticated using (true);
drop policy if exists modulo_insere on public.epi_entregas;
create policy modulo_insere on public.epi_entregas for insert to authenticated with check (app_pode_algum('{sst,epis}'::text[]));
drop policy if exists modulo_altera on public.epi_entregas;
create policy modulo_altera on public.epi_entregas for update to authenticated
  using (app_pode_algum('{sst,epis}'::text[])) with check (app_pode_algum('{sst,epis}'::text[]));
drop policy if exists modulo_apaga on public.epi_entregas;
create policy modulo_apaga on public.epi_entregas for delete to authenticated using (app_pode_algum('{sst,epis}'::text[]));

-- O que ele já tinha preenchido vale como confirmado.
update public.epis set troca_confirmada = true where troca_qtd is not null and troca_confirmada = false;

-- Frequências SUGERIDAS (28/10/2026, escolha dele: "sugestão minha p/ conferir").
-- Prática comum no campo; quem confirma é o técnico de segurança, na tela.
-- Só preenche o que está em branco. Duráveis (cinto, máscara de solda,
-- respirador full face, tirante, garrafa) ficam "conforme desgaste".
update public.epis e set troca_qtd = s.qtd, troca_unidade = s.un, troca_confirmada = false
from (values
  ('ABAFADOR 19 DB', 12, 'meses'), ('ABAFADOR 22 DB', 12, 'meses'),
  ('AVENTAL RASPA BABEIRO', 12, 'meses'), ('AVENTAL TRANSP', 6, 'meses'),
  ('BONÉ ARABE', 6, 'meses'), ('BOTA PVC BRANCA FORRADA', 6, 'meses'),
  ('BOTINA SEG. BC PVC', 6, 'meses'), ('CALÇA PLÁSTICA TRANSP.', 6, 'meses'),
  ('CAMISA PV CAPUZ SAKUMA', 6, 'meses'), ('CAPA DE CHUVA', 12, 'meses'),
  ('CAPACETE SEGURANÇA', 24, 'meses'), ('CARTUCHO FILTRO 900', 6, 'meses'),
  ('CONJ. APLICAÇÃO 01 OU 02', 6, 'meses'), ('CONJ. MOTOQ.CHUVA', 12, 'meses'),
  ('KIT MOTOSSERRA VISEIRA/ABAFADOR', 12, 'meses'),
  ('LUVA LATEX', 1, 'meses'), ('LUVA NITRILICA', 1, 'meses'), ('LUVA NITRILICA C/ FORRO', 1, 'meses'),
  ('LUVA PANO PIGMENTADA', 15, 'dias'), ('LUVA VAQUETA', 2, 'meses'),
  ('MACACÃO BRANCO', 3, 'meses'), ('MACACÃO MECÂNICO', 12, 'meses'),
  ('MASCARA 3M SERIE 6200', 12, 'meses'),
  ('MASCARA PFF1', 1, 'semanas'), ('MASCARA PFF1 C/F', 1, 'semanas'),
  ('MASCARA PFF2 C/ FILTRO - CA', 1, 'semanas'), ('MASCARA PFF2 C/V', 1, 'semanas'),
  ('OCULOS PROTEÇÃO AV', 6, 'meses'), ('OCULOS PROTEÇÃO FUMÊ', 6, 'meses'), ('OCULOS PROTEÇÃO TRANSP.', 6, 'meses'),
  ('PERNEIRA 3 TALAS', 12, 'meses'), ('PERNEIRA 3 TALAS C/ VELCRO', 12, 'meses'),
  ('PROTETOR FACIAL', 12, 'meses')
) as s(nome, qtd, un)
where e.descricao = s.nome and e.troca_qtd is null;
