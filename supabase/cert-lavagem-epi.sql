-- cert-lavagem-epi.sql — Certificação › FORMS Digital › Higienização dos EPIs (FORM 007), 28/10/2026.
-- Pedido do Guilherme: "vamos criar esse form, e também deixar para imprimir
-- selecionando o funcionário" — a planilha "RG 29 - Registro de Lavagem de EPI"
-- (código antigo; hoje FORM 007 / RG 007). Pode rodar de novo.
-- Permissão: módulo 'cert' ou 'sst' (o responsável é a Segurança).
--
--  · cl_conjuntos — conjunto de aplicação (APL 01 / APL 02) de cada aplicador:
--    C.A, data do fornecimento e data da troca. Uma linha por conjunto entregue
--    (o histórico fica: o conjunto trocado ganha trocado_em e entra um novo).
--  · cl_lavagens  — uma linha por lavagem: funcionário, dia e o conjunto lavado
--    (1 ou 2). No impresso o dia mostra 1, 2 ou 1·2, como na planilha.

create table if not exists public.cl_conjuntos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null,                        -- funcionarios.id (sem FK: o cadastro é sincronizado)
  numero smallint not null check (numero in (1, 2)),   -- APL 01 / APL 02
  ca text,
  fornecido_em date,
  trocado_em date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cl_conjuntos_func on public.cl_conjuntos(funcionario_id);

create table if not exists public.cl_lavagens (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null,
  data date not null,
  conjunto smallint not null check (conjunto in (1, 2)),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  unique (funcionario_id, data, conjunto)
);
create index if not exists cl_lavagens_data on public.cl_lavagens(data desc);

do $$
declare t text;
begin
  foreach t in array array['cl_conjuntos', 'cl_lavagens'] loop
    execute format('drop trigger if exists cl_carimbo on public.%I', t);
    execute format('create trigger cl_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cl_leem on public.%I', t);
    execute format('drop policy if exists cl_inserem on public.%I', t);
    execute format('drop policy if exists cl_alteram on public.%I', t);
    execute format('drop policy if exists cl_apagam on public.%I', t);
    execute format('create policy cl_leem on public.%I for select to authenticated using (public.app_pode(''cert'') or public.app_pode(''sst''))', t);
    execute format('create policy cl_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert'') or public.app_pode(''sst''))', t);
    execute format('create policy cl_alteram on public.%I for update to authenticated using (public.app_pode(''cert'') or public.app_pode(''sst'')) with check (public.app_pode(''cert'') or public.app_pode(''sst''))', t);
    execute format('create policy cl_apagam on public.%I for delete to authenticated using (public.app_pode(''cert'') or public.app_pode(''sst''))', t);
  end loop;
end $$;

update public.cert_documentos set observacao = 'Registro de lavagem dos conjuntos de aplicação (APL 01 / APL 02) por aplicador. Preenchido no app: Certificação › FORMS Digital › Higienização dos EPIs (ficha por funcionário para imprimir).'
where codigo = 'FORM 007' and observacao is null;
