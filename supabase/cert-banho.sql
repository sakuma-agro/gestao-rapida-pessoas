-- cert-banho.sql — Certificação › FORMS Digital › Banho e higiene pessoal (FORM 054), 28/10/2026.
-- Pedido do Guilherme ("mais esse!"), junto com a ficha de lavagem de EPI (que ficou como documento, FORM 055):
-- a planilha "FICHA DE CONTROLE DE BANHO E HIGIENE PESSOAL" — por trabalhador e
-- por mês: data, início e fim da aplicação, banho tomado (sim/não), observações
-- (EPI danificado etc.) e assinatura. Não existia FORM para ela: virou o
-- FORM 054 (e o RG 054). Pode rodar de novo. Permissão: módulo 'cert' ou 'sst'.

create table if not exists public.cb_banhos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null,                 -- funcionarios.id (sem FK: o cadastro é sincronizado)
  data date not null,
  inicio text,                                  -- início da aplicação, HH:MM
  fim text,                                     -- fim da aplicação, HH:MM
  banho boolean,                                -- banho tomado? (null = não informado)
  observacao text,                              -- EPI danificado etc.
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cb_banhos_data on public.cb_banhos(data desc);
create index if not exists cb_banhos_func on public.cb_banhos(funcionario_id);

drop trigger if exists cb_carimbo on public.cb_banhos;
create trigger cb_carimbo before update on public.cb_banhos for each row execute function public.marcar_atualizacao();
alter table public.cb_banhos enable row level security;
revoke all on public.cb_banhos from anon;
grant select, insert, update, delete on public.cb_banhos to authenticated;
drop policy if exists cb_leem on public.cb_banhos;
drop policy if exists cb_inserem on public.cb_banhos;
drop policy if exists cb_alteram on public.cb_banhos;
drop policy if exists cb_apagam on public.cb_banhos;
create policy cb_leem on public.cb_banhos for select to authenticated using (public.app_pode('cert') or public.app_pode('sst'));
create policy cb_inserem on public.cb_banhos for insert to authenticated with check (public.app_pode('cert') or public.app_pode('sst'));
create policy cb_alteram on public.cb_banhos for update to authenticated using (public.app_pode('cert') or public.app_pode('sst')) with check (public.app_pode('cert') or public.app_pode('sst'));
create policy cb_apagam on public.cb_banhos for delete to authenticated using (public.app_pode('cert') or public.app_pode('sst'));

-- Lista mestra: FORM 054 (modelo) e RG 054 (registros), ligados FORM → RG.
insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, revisao, data_revisao, certificacoes, observacao)
select 'FORM 054', 'Controle de banho e higiene pessoal', 'FORMULÁRIOS', 'Por evento', 'Em dia', '01', '2026-12-01', '{}',
  'Ficha mensal por trabalhador da aplicação: início e fim da aplicação, banho tomado e observações. Preenchido no app: Certificação › FORMS Digital › Banho e higiene pessoal (ficha por funcionário para imprimir).'
where not exists (select 1 from public.cert_documentos where codigo = 'FORM 054');
insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, certificacoes, observacao)
select 'RG 054', 'Controle de banho e higiene pessoal', 'REGISTROS', 'Por evento', 'Em dia', '{}', 'Registros do FORM 054 preenchido; os lançamentos do app contam como registro.'
where not exists (select 1 from public.cert_documentos where codigo = 'RG 054');
insert into public.cert_vinculos(de_id, para_id, origem)
select f.id, r.id, 'FORM → RG' from public.cert_documentos f, public.cert_documentos r
where f.codigo = 'FORM 054' and r.codigo = 'RG 054'
  and not exists (select 1 from public.cert_vinculos v where v.de_id = f.id and v.para_id = r.id);
