-- cert-grasp.sql — Certificação › FORMS Digital › Reunião GRASP (FORM 044), 27/10/2026.
-- Pedido do Guilherme: o FORM 044 (Ata de reunião mensal GRASP com o representante
-- dos trabalhadores) estava atrasado desde abril/2026 e o app não avisava.
-- Pode rodar de novo. Permissão: módulo 'cert'.
--
--  · cg_reunioes — uma linha por reunião: data real, situação (Agendada/Realizada),
--    representante, participantes, pauta, assuntos, reclamações e encaminhamentos.
--  Ata assinada / lista de presença escaneada: Drive certificacao/evidencia/<id>/…
--  O mês conta como feito quando há uma reunião Realizada com data dentro dele.
--  Nunca se lança reunião com data que não seja a real (auditoria).

create table if not exists public.cg_reunioes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  horario text,
  local text,
  tipo text not null default 'Ordinária' check (tipo in ('Ordinária','Extraordinária')),
  situacao text not null default 'Realizada' check (situacao in ('Agendada','Realizada','Cancelada')),
  fazenda_id uuid references public.jor_fazendas(id),
  representante_id uuid,                              -- funcionarios.id (sem FK: o cadastro é sincronizado)
  representante text,
  conduzida_por text,                                 -- quem conduziu pela empresa
  participantes jsonb not null default '[]'::jsonb,   -- [{id, nome, funcao}]
  outros text,                                        -- participantes de fora do cadastro, um por linha
  pauta text,
  assuntos text,                                      -- o que foi tratado
  reclamacoes text,                                   -- reclamações e sugestões trazidas pelos trabalhadores
  encaminhamentos jsonb not null default '[]'::jsonb, -- [{acao, responsavel, prazo, situacao}]
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cg_reunioes_data on public.cg_reunioes(data desc);

drop trigger if exists cg_carimbo on public.cg_reunioes;
create trigger cg_carimbo before update on public.cg_reunioes for each row execute function public.marcar_atualizacao();
alter table public.cg_reunioes enable row level security;
revoke all on public.cg_reunioes from anon;
grant select, insert, update, delete on public.cg_reunioes to authenticated;
drop policy if exists cg_leem on public.cg_reunioes;
drop policy if exists cg_inserem on public.cg_reunioes;
drop policy if exists cg_alteram on public.cg_reunioes;
drop policy if exists cg_apagam on public.cg_reunioes;
create policy cg_leem on public.cg_reunioes for select to authenticated using (public.app_pode('cert'));
create policy cg_inserem on public.cg_reunioes for insert to authenticated with check (public.app_pode('cert'));
create policy cg_alteram on public.cg_reunioes for update to authenticated using (public.app_pode('cert')) with check (public.app_pode('cert'));
create policy cg_apagam on public.cg_reunioes for delete to authenticated using (public.app_pode('cert'));

-- Cronograma: evento mensal ligado ao FORM 044 (o app marca a ocorrência do mês
-- como feita quando a reunião do mês é lançada como Realizada).
insert into public.cert_eventos(data, tipo, titulo, certificacoes, repetir, observacao)
select '2026-04-28', 'Reunião', 'Reunião mensal GRASP com o representante dos trabalhadores (FORM 044)', array['GRASP'], 'Mensal',
  'Lançar em Certificação › FORMS Digital › Reunião GRASP. A ocorrência do mês é dada como feita sozinha quando a reunião do mês é lançada como Realizada.'
where not exists (select 1 from public.cert_eventos where titulo ilike '%FORM 044%');

update public.cert_documentos set observacao = 'Ata da reunião mensal GRASP com o representante dos trabalhadores. Preenchido no app: Certificação › FORMS Digital › Reunião GRASP.'
where codigo = 'FORM 044' and observacao is null;
