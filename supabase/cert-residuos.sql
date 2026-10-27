-- cert-residuos.sql — Certificação › Forms › Resíduos (FORM 053), 27/10/2026.
-- Pedido do Guilherme: "sobre gestão de resíduos, quero fazer esse form no app
-- certificação, para ter indicadores". Decisões dele: quantidade sempre em kg
-- (pesado ou estimado), avaliação do manejo mensal, sem meta por enquanto.
-- Atende o POP 004 (Gestão de Resíduos): "registro de saída de resíduos" e
-- "avaliação do manejo de resíduos". Pode rodar de novo. Permissão: módulo 'cert'.
--
--  · cr_tipos       — tipos de resíduo: classe e destinação de costume
--  · cr_saidas      — cada saída: data, fazenda, tipo, kg, destinação, quem recebeu, comprovante
--  · cr_avaliacoes  — check list mensal do manejo por fazenda (C / NC / NA por item)
-- Anexo da saída (MTR, nota de devolução, recibo): Drive certificacao/residuo/<id>/…

create table if not exists public.cr_tipos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  classe text not null check (classe in ('Reciclável','Orgânico','Perigoso','Embalagem de agrotóxico','Rejeito')),
  destinacao text,                                   -- destinação de costume (sugerida ao lançar)
  ordem int not null default 0,
  ativo boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists cr_tipos_nome on public.cr_tipos(lower(nome));

create table if not exists public.cr_saidas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  fazenda_id uuid references public.jor_fazendas(id),
  tipo_id uuid not null references public.cr_tipos(id),
  kg numeric(12,2) not null check (kg >= 0),
  destinacao text not null,
  destinatario text,                                 -- quem recebeu / transportou
  comprovante text,                                  -- nº do MTR, NF de devolução, recibo
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cr_saidas_data on public.cr_saidas(data desc);

create table if not exists public.cr_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null check (extract(day from competencia) = 1),
  fazenda_id uuid not null references public.jor_fazendas(id),
  itens jsonb not null default '{}'::jsonb,          -- { "lixeiras": "C" | "NC" | "NA", … }
  avaliador text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  unique (competencia, fazenda_id)
);

do $$ declare t text; begin
  foreach t in array array['cr_tipos','cr_saidas','cr_avaliacoes'] loop
    execute format('drop trigger if exists cr_carimbo on public.%I', t);
    execute format('create trigger cr_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cr_leem on public.%I', t);
    execute format('drop policy if exists cr_inserem on public.%I', t);
    execute format('drop policy if exists cr_alteram on public.%I', t);
    execute format('drop policy if exists cr_apagam on public.%I', t);
    execute format('create policy cr_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cr_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy cr_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    execute format('create policy cr_apagam on public.%I for delete to authenticated using (public.app_pode(''cert''))', t);
  end loop;
end $$;

-- Anexos: tipo 'residuo' (comprovante de destinação) na Certificação.
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_area = 'pessoas' and p_tipo = 'funcionario' then
      case when p_escrever then public.app_pode_algum('{pessoas,rh}'::text[])
           else exists (select 1 from public.app_usuarios where lower(email) = public.app_email()) end
    when p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
      public.app_pode_algum('{sst,epis}'::text[]) or (not p_escrever and public.app_pode_algum('{pessoas,rh}'::text[]))
    when p_area = 'certificacao' and p_tipo in ('documento','caderno','fauna','energia','evidencia','residuo') then public.app_pode_algum('{cert,certificacao}'::text[])
    when p_area = 'manutencoes' and p_tipo in ('os','checklist','maquina','patrimonio') then public.app_pode('manutencoes')
    when p_area = 'programacao' and p_tipo in ('diario','atividade','reuniao') then public.app_pode('programacao')
    else false end;
$$;
alter table public.arquivos drop constraint if exists arquivos_tipo_check;
alter table public.arquivos add constraint arquivos_tipo_check check (tipo = any (array['funcionario','treinamento','exame','os','checklist','documento','maquina','patrimonio','diario','atividade','reuniao','caderno','fauna','energia','evidencia','residuo']));

-- Tipos de partida (dá para mudar em Resíduos › Tipos).
insert into public.cr_tipos(nome, classe, destinacao, ordem) values
  ('Papel e papelão',                         'Reciclável',              'Reciclagem', 1),
  ('Plástico (sem agrotóxico)',               'Reciclável',              'Reciclagem', 2),
  ('Metal e sucata',                          'Reciclável',              'Reciclagem', 3),
  ('Vidro',                                   'Reciclável',              'Reciclagem', 4),
  ('Restos de alimentos (refeitório)',        'Orgânico',                'Compostagem', 5),
  ('Restos de cultura, poda e refugo',        'Orgânico',                'Compostagem', 6),
  ('Óleo lubrificante usado',                 'Perigoso',                'Rerrefino / logística reversa', 7),
  ('Filtros, estopas e panos contaminados',   'Perigoso',                'Empresa licenciada', 8),
  ('Baterias e pilhas',                       'Perigoso',                'Rerrefino / logística reversa', 9),
  ('Lâmpadas',                                'Perigoso',                'Empresa licenciada', 10),
  ('Pneus',                                   'Perigoso',                'Rerrefino / logística reversa', 11),
  ('Embalagens rígidas lavadas',              'Embalagem de agrotóxico', 'Devolução de embalagens', 12),
  ('Embalagens flexíveis e contaminadas',     'Embalagem de agrotóxico', 'Devolução de embalagens', 13),
  ('Lixo comum (banheiro, varrição)',         'Rejeito',                 'Coleta municipal / aterro', 14)
on conflict do nothing;

-- Lista mestra: FORM 053 (modelo) e RG 053 (registros), ligados FORM → RG.
insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, revisao, data_revisao, caminho, observacao)
select 'FORM 053', 'Gestão de resíduos', 'FORMULÁRIOS', 'Mensal', 'Em dia', '01', '2026-12-01',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\Certificação - Lop Gestão Rápida\2 - FORM\FORM 053 - GESTÃO DE RESÍDUOS',
  'Saída de resíduos e avaliação mensal do manejo (POP 004). Preenchido no app: Certificação › Forms › Resíduos.'
where not exists (select 1 from public.cert_documentos where codigo = 'FORM 053');
insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, caminho, observacao)
select 'RG 053', 'Gestão de resíduos', 'REGISTROS', 'Mensal', 'Em dia',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\Certificação - Lop Gestão Rápida\5 - RG\RG 053 - GESTÃO DE RESÍDUOS',
  'Registros do FORM 053 preenchido (modelo em 2 - FORM).'
where not exists (select 1 from public.cert_documentos where codigo = 'RG 053');
insert into public.cert_vinculos(de_id, para_id, origem)
select f.id, r.id, 'FORM → RG' from public.cert_documentos f, public.cert_documentos r
where f.codigo = 'FORM 053' and r.codigo = 'RG 053'
  and not exists (select 1 from public.cert_vinculos v where v.de_id = f.id and v.para_id = r.id);
update public.cert_documentos set link = 'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2FCertifica%C3%A7%C3%A3o%20%2D%20Lop%20Gest%C3%A3o%20R%C3%A1pida%2F2%20%2D%20FORM%2FFORM%20053%20%2D%20GEST%C3%83O%20DE%20RES%C3%8DDUOS'
where codigo = 'FORM 053' and link is null;
update public.cert_documentos set link = 'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2FCertifica%C3%A7%C3%A3o%20%2D%20Lop%20Gest%C3%A3o%20R%C3%A1pida%2F5%20%2D%20RG%2FRG%20053%20%2D%20GEST%C3%83O%20DE%20RES%C3%8DDUOS'
where codigo = 'RG 053' and link is null;
