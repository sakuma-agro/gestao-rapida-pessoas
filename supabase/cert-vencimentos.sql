-- Certificação › Vencimentos (03/11/2026, pedido do Guilherme: "painel lean de vencimentos e lembretes"
-- para AN, RG e CL; cadastro mais enxuto; fechar a tarefa com a evidência e já ficar a próxima data).
--
-- cert_documentos.vence_em   — próximo vencimento. Ao registrar "Feito" o app avança pela periodicidade
--                              mantendo o dia (todo dia 3 continua dia 3, mesmo feito com atraso).
--                              Vazio: o app usa a última evidência + periodicidade.
-- cert_documentos.aviso_dias — quantos dias antes aparece em "vence logo" (vazio = padrão da periodicidade).
-- cert_contatos              — WhatsApp de cada responsável, para o lembrete (nome = o mesmo do campo responsável).

alter table public.cert_documentos add column if not exists vence_em date;
alter table public.cert_documentos add column if not exists aviso_dias integer;

create table if not exists public.cert_contatos (
  nome text primary key,
  whatsapp text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text default public.app_email()
);
alter table public.cert_contatos enable row level security;
revoke all on public.cert_contatos from anon;
grant select, insert, update, delete on public.cert_contatos to authenticated;
drop policy if exists cct_leem on public.cert_contatos;
drop policy if exists cct_escrevem on public.cert_contatos;
create policy cct_leem on public.cert_contatos for select to authenticated using (public.app_pode('cert'));
create policy cct_escrevem on public.cert_contatos for all to authenticated using (public.app_pode('cert')) with check (public.app_pode('cert'));

-- Dia fixo do vencimento (03/11/2026, pedido do Guilherme: AN 82 "mensal, vence todo dia 01").
-- Vale para o próximo vencimento calculado (inclusive nos AN por fazenda): a primeira data com esse dia.
alter table public.cert_documentos add column if not exists dia_vencimento integer check (dia_vencimento between 1 and 31);
