-- cert-checklist.sql — Certificação › Check List Digital (29/10/2026).
-- Pedido do Guilherme: "igual Forms digital, agora vamos criar Check list digitais,
-- aonde tem como pôr foto e deixar registrado". Decisões dele (29/10/2026):
--  · a lista de CL é refeita do zero (os 18 CL antigos eram modelo de outra fazenda;
--    backup em 6 - CHECK LIST\bkp\CL antigos - lista modelo.xlsx); o Check List Uso de EPI's vira CL 01;
--  · item marcado NC abre uma não conformidade no FORM 004 (cmc_casos, via CHECK LIST);
--  · começa pelo CL 01 como modelo; os outros entram um por um.
-- O registro do CL preenchido é o RG CL 01 (pasta 5 - REGISTROS). Pode rodar de novo.

-- Modelo de cada check list digital: itens e legenda. Um por documento CL da Lista mestra.
create table if not exists public.ccl_modelos (
  documento_id bigint primary key references public.cert_documentos(id) on delete cascade,
  titulo text not null,
  itens jsonb not null default '[]'::jsonb,        -- [{id, texto}]
  legenda jsonb not null default '{}'::jsonb,      -- {C, NC, NA}
  campos jsonb not null default '[]'::jsonb,       -- cabeçalho: ["fazenda","data","local","atividade","cultura","variedade","avaliado","responsavel"]
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Cada check list preenchido.
create table if not exists public.ccl_registros (
  id uuid primary key default gen_random_uuid(),
  documento_id bigint not null references public.cert_documentos(id),
  data date not null,
  fazenda text,
  local text,
  atividade text,
  cultura text,
  variedade text,
  avaliado text,                                   -- funcionário / equipe avaliada
  avaliado_id uuid,                                -- funcionarios.id quando escolhido do cadastro
  responsavel text,                                -- quem fez o check list
  respostas jsonb not null default '[]'::jsonb,    -- [{id, texto, st: C|NC|NA|null, obs, nc_id, prazo, resp_nc}]
  plano_acao text,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists ccl_registros_doc on public.ccl_registros(documento_id, data desc);

drop trigger if exists ccl_mod_carimbo on public.ccl_modelos;
create trigger ccl_mod_carimbo before update on public.ccl_modelos for each row execute function public.marcar_atualizacao();
drop trigger if exists ccl_reg_carimbo on public.ccl_registros;
create trigger ccl_reg_carimbo before update on public.ccl_registros for each row execute function public.marcar_atualizacao();

do $$ declare t text; begin
  foreach t in array array['ccl_modelos','ccl_registros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_leem', t);
    execute format('drop policy if exists %I on public.%I', t || '_gravam', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_pode(''cert'') or public.app_pode(''sst''))', t || '_leem', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.app_pode(''cert'') or public.app_pode(''sst'')) with check (public.app_pode(''cert'') or public.app_pode(''sst''))', t || '_gravam', t);
  end loop;
end $$;

-- Lista de CL refeita: saem os 18 antigos (sem ligação com requisito, vínculo, evidência ou arquivo),
-- entra o CL 01 Uso de EPI's e o RG CL 01.
delete from public.cert_documentos d
where d.categoria = 'CHECK LIST' and d.codigo ~ '^CL \d+$' and d.nome <> 'Check List Uso de EPI''s'
  and not exists (select 1 from public.ccl_modelos m where m.documento_id = d.id)
  and not exists (select 1 from public.cert_vinculos v where v.de_id = d.id or v.para_id = d.id)
  and not exists (select 1 from public.cert_evidencias e where e.documento_id = d.id)
  and not exists (select 1 from public.cert_requisitos r where d.id = any(r.documentos));

insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, revisao, data_revisao, certificacoes, observacao, caminho, link)
select 'CL 01', 'Check List Uso de EPI''s', 'CHECK LIST', 'Mensal', 'Em dia', '01', '2026-11-01', '{}',
  'Verificação do uso dos EPIs por funcionário e atividade (C / NC / NA). Check list digital: Certificação › Check List Digital — com foto por item; NC abre não conformidade no FORM 004.',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\6 - CHECK LIST\CL 01 - USO DE EPIS',
  'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2F6%20%2D%20CHECK%20LIST%2FCL%2001%20%2D%20USO%20DE%20EPIS'
where not exists (select 1 from public.cert_documentos where codigo = 'CL 01');

insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, certificacoes, observacao, caminho, link)
select 'RG CL 01', 'Check List Uso de EPI''s', 'REGISTROS', 'Mensal', 'Em dia', '{}',
  'Registros do CL 01 preenchido (papel escaneado em 5 - REGISTROS e os preenchidos no app).',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\5 - REGISTROS\RG CL 01 - USO DE EPIS',
  'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2F5%20%2D%20REGISTROS%2FRG%20CL%2001%20%2D%20USO%20DE%20EPIS'
where not exists (select 1 from public.cert_documentos where codigo = 'RG CL 01');

insert into public.cert_vinculos(de_id, para_id, origem)
select c.id, r.id, 'CL → RG' from public.cert_documentos c, public.cert_documentos r
where c.codigo = 'CL 01' and r.codigo = 'RG CL 01'
  and not exists (select 1 from public.cert_vinculos v where v.de_id = c.id and v.para_id = r.id);

insert into public.ccl_modelos(documento_id, titulo, itens, legenda, campos)
select d.id, 'Uso de EPI''s',
  (select jsonb_agg(jsonb_build_object('id', 'i' || lpad(n::text, 2, '0'), 'texto', t) order by n)
     from unnest(array['Avental PVC','Avental de Raspa','Bota de Borracha','Botina de Segurança','Boné Árabe','Capa de Chuva',
       'Capacete','Cinto de Segurança','Conjunto de Aplicação de Agrotóxico Completo','Luvas de Algodão','Luvas Nitrílicas',
       'Luvas de Raspa','Óculos de Segurança','Máscara de Proteção Respiratória','Máscara de Proteção Respiratória VA/GA',
       'Máscara de Solda','Perneiras','Protetor Auricular','Trava quedas de segurança']) with ordinality as x(t, n)),
  jsonb_build_object('C', 'Conforme (funcionários usando os EPI''s de acordo com a atividade)',
                     'NC', 'Não conforme (funcionários sem EPI''s)',
                     'NA', 'Não se aplica (EPI não se aplica à atividade)'),
  '["fazenda","data","local","atividade","cultura","variedade","avaliado","responsavel"]'::jsonb
from public.cert_documentos d where d.codigo = 'CL 01'
on conflict (documento_id) do nothing;
