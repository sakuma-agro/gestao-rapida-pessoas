-- cert-energia.sql — Certificação › Energia: consumo de energias (FORM 043), 26/10/2026.
-- Pedido do Guilherme: "o form 43, gostaria de ter um igual o form 50 … uma tela, um sub modulo".
-- Substitui a planilha FORM 043 - TABELA CONSUMO DE ENERGIAS.xlsx (abas 2024 e 2025).
-- Pode rodar de novo. Permissão: módulo 'cert'. Migração "cert_energia".
--
--  · ce_fontes    — as fontes de energia: renovável ou não, unidade e fator de conversão para kWh
--  · ce_consumos  — cada lançamento: mês, fonte, quantidade, de onde veio (fatura, nota, instalação)
-- Anexos (fatura/nota): certificacao/energia/<id do lançamento>/…
create table if not exists public.ce_fontes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  renovavel boolean not null default false,
  unidade text not null default 'kWh',
  fator_kwh numeric(10,4) not null default 1,       -- 1 unidade = X kWh
  ordem int not null default 0,
  ativa boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists ce_fontes_nome on public.ce_fontes(lower(nome));

create table if not exists public.ce_consumos (
  id uuid primary key default gen_random_uuid(),
  competencia date not null check (extract(day from competencia) = 1),
  fonte_id uuid not null references public.ce_fontes(id),
  quantidade numeric(14,3) not null check (quantidade >= 0),
  origem text,                                       -- instalação, fatura, posto, nota
  fazenda text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists ce_consumos_comp on public.ce_consumos(competencia desc);

do $$ declare t text; begin
  foreach t in array array['ce_fontes','ce_consumos'] loop
    execute format('drop trigger if exists ce_carimbo on public.%I', t);
    execute format('create trigger ce_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists ce_leem on public.%I', t);
    execute format('drop policy if exists ce_inserem on public.%I', t);
    execute format('drop policy if exists ce_alteram on public.%I', t);
    execute format('drop policy if exists ce_apagam on public.%I', t);
    execute format('create policy ce_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy ce_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy ce_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    execute format('create policy ce_apagam on public.%I for delete to authenticated using (public.app_pode(''cert''))', t);
  end loop;
end $$;

-- Anexos: tipos 'energia' (fatura/nota) e 'evidencia' (evidências da lista mestra) na Certificação.
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_area = 'pessoas' and p_tipo = 'funcionario' then
      case when p_escrever then public.app_pode_algum('{pessoas,rh}'::text[])
           else exists (select 1 from public.app_usuarios where lower(email) = public.app_email()) end
    when p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
      public.app_pode_algum('{sst,epis}'::text[]) or (not p_escrever and public.app_pode_algum('{pessoas,rh}'::text[]))
    when p_area = 'certificacao' and p_tipo in ('documento','caderno','fauna','energia','evidencia') then public.app_pode_algum('{cert,certificacao}'::text[])
    when p_area = 'manutencoes' and p_tipo in ('os','checklist','maquina','patrimonio') then public.app_pode('manutencoes')
    when p_area = 'programacao' and p_tipo in ('diario','atividade','reuniao') then public.app_pode('programacao')
    else false end;
$$;
alter table public.arquivos drop constraint if exists arquivos_tipo_check;
alter table public.arquivos add constraint arquivos_tipo_check check (tipo = any (array['funcionario','treinamento','exame','os','checklist','documento','maquina','patrimonio','diario','atividade','reuniao','caderno','fauna','energia','evidencia']));

-- Fontes da planilha (fatores como estavam nela, exceto o Diesel S10 — ver nota).
insert into public.ce_fontes(nome, renovavel, unidade, fator_kwh, ordem, observacao) values
  ('Solar', true, 'kWh', 1, 1, null),
  ('Eólica', true, 'kWh', 1, 2, null),
  ('Hidráulica (elétrica)', true, 'kWh', 1, 3, 'Energia elétrica da rede (CEMIG), contada como renovável como na planilha FORM 043.'),
  ('Etanol', true, 'litros', 6.26, 4, null),
  ('Gasolina', false, 'litros', 9.7, 5, null),
  ('Diesel', false, 'litros', 9.94, 6, null),
  ('Diesel S10', false, 'litros', 9.94, 7, 'Na planilha FORM 043 o fator era 2,52 (provável fator de CO₂ em kg/L, não kWh). Corrigido para 9,94 kWh/L como o Diesel — conferir.')
on conflict do nothing;
