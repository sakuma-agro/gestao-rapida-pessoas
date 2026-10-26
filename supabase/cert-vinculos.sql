-- cert-vinculos.sql — Lista mestra: cadeia POP → FORM → evidências (26/10/2026).
-- Pedido do Guilherme: "um pop é vinculado a um form e depois aos Anexos que são evidências".
-- Migração "cert_vinculos_evidencias". Os FORMs 002–052 entraram no lugar dos RG 01–32 (ids 170–201,
-- apagados; lista guardada no documento do projeto cert-lista-mestra-por-tipo.md).
create table if not exists public.cert_vinculos (
  id bigint generated always as identity primary key,
  de_id bigint not null references public.cert_documentos(id) on delete cascade,   -- quem exige (POP)
  para_id bigint not null references public.cert_documentos(id) on delete cascade, -- o exigido (FORM, anexo)
  origem text not null default 'manual',                                          -- 'texto do POP' | 'manual'
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  unique (de_id, para_id), check (de_id <> para_id)
);
create table if not exists public.cert_evidencias (
  id uuid primary key default gen_random_uuid(),
  documento_id bigint not null references public.cert_documentos(id) on delete cascade,
  data date not null,
  descricao text,
  link text,                                   -- OneDrive (opcional); arquivo no Drive: certificacao/evidencia/<id>/…
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cert_evidencias_doc on public.cert_evidencias(documento_id, data desc);
drop trigger if exists ce_carimbo on public.cert_evidencias;
create trigger ce_carimbo before update on public.cert_evidencias for each row execute function public.marcar_atualizacao();
do $$ declare t text; begin
  foreach t in array array['cert_vinculos','cert_evidencias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cv_leem on public.%I', t);
    execute format('drop policy if exists cv_escrevem on public.%I', t);
    execute format('create policy cv_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cv_escrevem on public.%I for all to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
  end loop;
end $$;
grant usage on sequence public.cert_vinculos_id_seq to authenticated;

-- Ligações lidas do texto dos POPs (seção "Formulários" de cada .docx).
insert into public.cert_vinculos(de_id, para_id, origem)
select p.id, f.id, 'texto do POP'
from (values ('POP 001','FORM 002'),('POP 001','FORM 004'),('POP 004','FORM 013'),('POP 006','FORM 011'),('POP 006','FORM 012'),
  ('POP 010','FORM 004'),('POP 012','FORM 042'),('POP 015','FORM 002'),('POP 015','FORM 004'),('POP 019','FORM 004'),('POP 019','FORM 020'),
  ('POP 020','FORM 027'),('POP 021','FORM 023')) v(pop, form)
join public.cert_documentos p on p.codigo = v.pop join public.cert_documentos f on f.codigo = v.form
on conflict do nothing;
