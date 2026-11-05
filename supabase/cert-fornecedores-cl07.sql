-- cert-fornecedores-cl07.sql — Certificação › Fornecedores: CL 07 e AN 20 ligados ao FORM 023 (05/11/2026).
-- Pedido do Guilherme: "altere essa avaliação de fornecedores, obrigatório 1 vez ou renovação de contrato!
-- PCMSO, PGR. An 20 será vinculado ao Form 23. Ao criar um novo fornecedor uma pasta será criada dentro
-- do An 20 com o nome do fornecedor!"
--  · O CL 07 (Check List Auto Auditoria de Fornecedores de Produtos e Serviços, planilha com uma aba por
--    tipo de fornecedor) vira a qualificação documental do cadastro: feita uma vez, no cadastro, e de novo
--    só na renovação do contrato. PCMSO e PGR entram em todos os modelos.
--  · Os tipos do CL 07 que não tinham parte no FORM 023 entram como categorias do cadastro.
--  · Cada fornecedor novo ganha a pasta 3 - ANEXOS\AN 20 - …\<NOME>; o computador do escritório
--    (entregar.ps1, a cada 5 min) cria a pasta e avisa (onedrive_pastas.feito_em).
-- Pode rodar de novo. Migração "cert_fornecedores_cl07".

alter table public.cfo_fornecedores drop constraint if exists cfo_fornecedores_categoria_check;
alter table public.cfo_fornecedores add constraint cfo_fornecedores_categoria_check check (categoria in (
  'viveiro','pragas','caixa_agua','colheita','packing',
  'insumos','laboratorio','seg_trabalho','med_trabalho','calib_balanca','calib_compressor','consultoria','manutencao','residuos'));
alter table public.cfo_fornecedores drop constraint if exists cfo_fornecedores_periodicidade_check;
alter table public.cfo_fornecedores add constraint cfo_fornecedores_periodicidade_check check (periodicidade in (
  'Mensal','Bimestral','Trimestral','Semestral','Anual','A cada entrega','Renovação de contrato'));

alter table public.cfo_fornecedores
  add column if not exists servico text,            -- PRODUTOS / SERVIÇOS do CL 07
  add column if not exists telefone text,
  add column if not exists email text,
  add column if not exists contrato_fim date,        -- vencimento do contrato: na renovação, novo CL 07
  add column if not exists cl07_data date,           -- data da qualificação (CL 07)
  add column if not exists cl07_itens jsonb not null default '{}'::jsonb,   -- chave -> 'S' | 'N' | 'NA'
  add column if not exists cl07_qualificado boolean,
  add column if not exists cl07_comentario text,
  add column if not exists cl07_aprovador text,
  add column if not exists cl07_hist jsonb not null default '[]'::jsonb,    -- qualificações anteriores (renovações)
  add column if not exists pasta_od text;            -- pasta do fornecedor, dentro de 6 - Certificações

-- Pastas que o computador do escritório precisa criar no OneDrive.
create table if not exists public.onedrive_pastas (
  id bigint generated always as identity primary key,
  rel text not null unique,          -- caminho dentro de 6 - Certificações, com /
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  feito_em timestamptz
);
alter table public.onedrive_pastas enable row level security;
revoke all on public.onedrive_pastas from anon;
grant select on public.onedrive_pastas to authenticated;
drop policy if exists odp_leem on public.onedrive_pastas;
create policy odp_leem on public.onedrive_pastas for select to authenticated using (public.app_pode('cert'));

-- Pasta do fornecedor no AN 20 (o caminho do AN 20 vem da Lista mestra).
create or replace function public.cfo_pasta_an20(p_nome text) returns text
language sql stable security definer set search_path = public as $$
  select regexp_replace(replace(d.caminho, '\', '/'), '^.*?6 - Certificações/', '') || '/' ||
         btrim(regexp_replace(regexp_replace(upper(btrim(p_nome)), '[\\/:*?"<>|]+', ' ', 'g'), '\s+', ' ', 'g'), ' .')
  from public.cert_documentos d
  where d.codigo ~* '^AN\s*0?20$' and coalesce(d.caminho, '') ilike '%6 - Certificações%'
  order by d.id limit 1
$$;
create or replace function public.cfo_forn_pasta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pasta_od is null then new.pasta_od := public.cfo_pasta_an20(new.nome); end if;
  if new.pasta_od is not null then
    insert into public.onedrive_pastas (rel, motivo) values (new.pasta_od, 'Fornecedor ' || new.nome || ' (FORM 023 / AN 20)')
    on conflict (rel) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists cfo_forn_pasta on public.cfo_fornecedores;
create trigger cfo_forn_pasta before insert on public.cfo_fornecedores for each row execute function public.cfo_forn_pasta();

-- Os já cadastrados também ganham a pasta.
update public.cfo_fornecedores set pasta_od = public.cfo_pasta_an20(nome) where pasta_od is null;
insert into public.onedrive_pastas (rel, motivo)
select distinct pasta_od, 'Fornecedor ' || nome || ' (FORM 023 / AN 20)' from public.cfo_fornecedores where pasta_od is not null
on conflict (rel) do nothing;

-- Fornecedores que só existiam no CL 07 preenchido (planilha): entram no cadastro, a qualificar.
insert into public.cfo_fornecedores (categoria, nome, periodicidade, contato, telefone, email, servico, criado_por)
select v.c, v.n, 'Renovação de contrato', v.ct, v.t, v.e, v.s, 'importado do CL 07'
from (values
  ('calib_compressor','TIAGO SILVERIO GUIMARAES XAVIER','TIAGO - ENGENHEIRO MECÂNICO','(34) 99132-4313',null,'Calibração de vazopressão dos compressores'),
  ('residuos','PROAMBIENTAL','ALTIERES','(34) 99814-5423','vendas4@proambientaltecnologia.com.br','Recolhimento de resíduos contaminantes'),
  ('insumos','COOPADAP','ADRIANO CAMARGOS','(34) 99739-5382',null,'Insumos')
) v(c, n, ct, t, e, s)
where not exists (select 1 from public.cfo_fornecedores f where f.categoria = v.c and upper(f.nome) = v.n);
-- O CL 07 preenchido do compressor (aprovado por Jussara em 23/01/2024).
update public.cfo_fornecedores set cl07_data = '2024-01-23', cl07_qualificado = true, cl07_aprovador = 'Jussara',
  cl07_itens = '{"alvara_sanit":"S","alvara_cnpj":"S","rbc":"S","padroes":"S","prontidao":"S","atendimento":"S","dados_cert":"S","prazo_cert":"S","historico":"S","recomendado":"S","infantil":"N","pcmso":"NA","pgr":"NA"}'::jsonb
where categoria = 'calib_compressor' and upper(nome) = 'TIAGO SILVERIO GUIMARAES XAVIER' and cl07_data is null;
-- Contatos que estavam no CL 07.
update public.cfo_fornecedores set contato = coalesce(contato, 'MATHEUS'), telefone = coalesce(telefone, '(14) 99680-1179'), servico = coalesce(servico, 'Packing house - beneficiamento avocado') where categoria = 'packing' and upper(nome) = 'CARLINI';
update public.cfo_fornecedores set contato = coalesce(contato, 'HELEN'), servico = coalesce(servico, 'Packing house - beneficiamento avocado') where categoria = 'packing' and upper(nome) = 'COOPADAP';
update public.cfo_fornecedores set contato = coalesce(contato, 'SIDNEY SIQUEIRA'), telefone = coalesce(telefone, '(34) 99989-0679'), servico = coalesce(servico, 'Colheita HF') where categoria = 'colheita' and upper(nome) = 'COOPADAP';

-- AN 20 ligado ao FORM 023 (cadeia da Lista mestra) e por evento: cada fornecedor novo / renovação.
insert into public.cert_vinculos (de_id, para_id, origem)
select f.id, a.id, 'manual' from public.cert_documentos f, public.cert_documentos a
where f.codigo ~* '^FORM\s*0?23$' and a.codigo ~* '^AN\s*0?20$'
on conflict (de_id, para_id) do nothing;
update public.cert_documentos set periodicidade = 'Por evento',
  observacao = coalesce(nullif(observacao, '') || E'\n', '') || 'Ligado ao FORM 023: cada fornecedor tem a sua pasta aqui (criada no cadastro) com os documentos do CL 07 — CNPJ, alvará, PCMSO, PGR, contrato…'
where codigo ~* '^AN\s*0?20$' and coalesce(observacao, '') not ilike '%FORM 023%';
