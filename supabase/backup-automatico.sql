-- Backup automático de módulo novo (29/10/2026, pedido dele: "já pensando em
-- criar outros módulos e já entrar sempre no bkp").
--
-- Antes: o js/backup.js tinha a lista de tabelas escrita à mão. Cada módulo
-- novo precisava de uma linha lá — e 34 tabelas (Caderno de campo, Melhoria
-- contínua, Fauna, Fornecedores, Energia, Campanhas, Brigada, Admissão e
-- demissão, mínimos e mapa do Estoque…) ficaram fora sem ninguém perceber.
--
-- Agora o BANCO diz o que existe e o backup leva tudo, menos o que a regra
-- abaixo põe de fora de propósito. Tabela nova, esquema novo: entra sozinha.
-- A lista do js/backup.js só serve para dar nome de módulo e ordem às abas.
--
--   backup_fora(esquema, tabela) → motivo de ficar fora, ou null (entra)
--   backup_esquemas()            → esquemas do app (os do postgres), para o
--                                  backup e para o gerador de estrutura
--   backup_tabelas()             → todas as tabelas, com linhas e "fora"
--
-- Rodar uma vez (pode rodar de novo: só substitui).

create or replace function public.backup_fora(esq text, tab text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when esq = 'integracao_privada'                       then 'integração interna (só no esquema.sql)'
    when tab like 'out\_%'                                 then 'Controle de Outorga (outro sistema)'
    when tab like '\_%' or tab like 'tmp\_%'
      or tab like '%\_bkp\_%' or tab ~ '_[0-9]{8}$'         then 'cópia ou sobra temporária'
    when tab ~ '(token|senha|segredo|autorizacao)'
      or esq || '.' || tab in ('public.backup_config', 'vistorias.importacao_chave')
                                                           then 'chave/senha — não vai para planilha'
    when esq || '.' || tab in ('programacao.contadores')   then 'interno do banco'
    else null
  end;
$$;

create or replace function public.backup_esquemas()
returns text[]
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select array_agg(n.nspname::text order by n.nspname <> 'public', n.nspname)
    from pg_namespace n join pg_roles r on r.oid = n.nspowner
   where r.rolname in ('postgres', 'pg_database_owner')
     and n.nspname not in ('extensions', 'supabase_migrations', 'information_schema')
     and n.nspname !~ '^pg_';
$$;

drop function if exists public.backup_tabelas();
create function public.backup_tabelas()
returns table(esquema text, tabela text, linhas bigint, fora text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (public.app_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'só administrador';
  end if;
  return query
    select n.nspname::text, c.relname::text, greatest(c.reltuples::bigint, 0),
           public.backup_fora(n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname = any (public.backup_esquemas())
     order by n.nspname <> 'public', 1, 2;
end $$;

revoke all on function public.backup_tabelas() from public, anon;
grant execute on function public.backup_tabelas() to authenticated, service_role;
revoke all on function public.backup_esquemas() from public, anon;
grant execute on function public.backup_esquemas() to authenticated, service_role;
grant execute on function public.backup_fora(text, text) to authenticated, service_role;

-- O gerador de estrutura (esquema_ddl) passa a pegar os esquemas da mesma
-- função: esquema novo também entra no -esquema.sql.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.esquema_ddl(text)'::regprocedure);
  if position('public.backup_esquemas()' in d) = 0 then
    d := replace(d,
      $q$esquemas text[] := array['public', 'manutencao', 'vistorias', 'programacao', 'integracao_privada'];$q$,
      $q$esquemas text[] := public.backup_esquemas();$q$);
    if position('public.backup_esquemas()' in d) = 0 then
      raise exception 'esquema_ddl: linha dos esquemas não encontrada';
    end if;
    execute d;
  end if;
end $$;
