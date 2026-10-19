-- esquema_ddl.sql — função que escreve o esquema completo do banco (DDL) a
-- partir do catálogo do Postgres: esquemas, tipos, sequências, tabelas,
-- restrições, índices, visões, funções, gatilhos, RLS, políticas e grants.
--
-- Para quê: o backup do app guarda os DADOS; este é o jeito de guardar a
-- ESTRUTURA, para reconstruir o banco do zero num projeto Supabase novo.
--
-- Quem roda: só o Claude, pelo MCP do Supabase (papel postgres). Ninguém do
-- app consegue chamar (sem execute para anon/authenticated).
--
-- Uso:  select public.esquema_ddl('tudo');            -- arquivo inteiro
--       select public.esquema_ddl('tabelas');         -- uma parte só
-- Partes, na ordem em que precisam ser aplicadas: cabecalho, esquemas, tipos,
-- sequencias, funcoes_base (as usadas em default de coluna, antes das tabelas),
-- tabelas, funcoes, restricoes, indices, visoes, gatilhos, politicas, grants.
--
-- O resultado é salvo em supabase/esquema-completo.sql (ver backup.js, que o
-- grava junto com os dados) e regenerado a cada publicação que mexer no banco.

create or replace function public.esquema_ddl(p_parte text default 'tudo')
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  esquemas text[] := array['public', 'manutencao', 'vistorias', 'programacao', 'integracao_privada'];
  s text := '';
  r record;
  col record;
  cols text;
  parte text;
  partes text[] := array['cabecalho','esquemas','tipos','sequencias','funcoes_base','tabelas','funcoes',
                         'restricoes','indices','visoes','gatilhos','politicas','grants'];
begin
  if p_parte = 'tudo' then
    foreach parte in array partes loop
      s := s || public.esquema_ddl(parte) || E'\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- cabeçalho
  if p_parte = 'cabecalho' then
    s := '-- esquema-completo.sql — LOP - Gestão Rápida · SAKUMA Agronegócios' || E'\n'
      || '-- Gerado em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' (horário de Brasília) por public.esquema_ddl()' || E'\n'
      || '-- Postgres ' || current_setting('server_version') || E'\n'
      || '-- Aplicar num projeto Supabase vazio, no SQL Editor, de cima para baixo.' || E'\n'
      || '-- Depois: criar os logins em Authentication, expor os esquemas manutencao,' || E'\n'
      || '--   vistorias e programacao em Integrations › Data API, e restaurar os dados do .json.' || E'\n\n'
      || 'set check_function_bodies = off;' || E'\n'
      || 'set client_min_messages = warning;' || E'\n';
    for r in select extname, extversion from pg_extension
              where extname not in ('plpgsql') order by extname loop
      s := s || format('create extension if not exists %I;', r.extname) || E'\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- esquemas
  if p_parte = 'esquemas' then
    s := E'\n-- ===== esquemas =====\n';
    for r in select nspname from pg_namespace where nspname = any(esquemas) and nspname <> 'public' order by 1 loop
      s := s || format('create schema if not exists %I;', r.nspname) || E'\n'
             || format('grant usage on schema %I to anon, authenticated, service_role;', r.nspname) || E'\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- tipos (enum, domínio, composto)
  if p_parte = 'tipos' then
    s := E'\n-- ===== tipos =====\n';
    for r in
      select n.nspname, t.typname, t.typtype, t.oid
        from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = any(esquemas) and t.typtype in ('e','d')
       order by 1, 2
    loop
      if r.typtype = 'e' then
        select string_agg(quote_literal(enumlabel), ', ' order by enumsortorder) into cols
          from pg_enum where enumtypid = r.oid;
        s := s || format('create type %I.%I as enum (%s);', r.nspname, r.typname, cols) || E'\n';
      else
        s := s || format('create domain %I.%I as %s;', r.nspname, r.typname,
                         format_type((select typbasetype from pg_type where oid = r.oid), null)) || E'\n';
      end if;
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- sequências avulsas (serial)
  if p_parte = 'sequencias' then
    s := E'\n-- ===== sequências =====\n';
    for r in
      select n.nspname, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'S' and n.nspname = any(esquemas)
         and not exists (select 1 from pg_attribute a join pg_depend d on d.refobjid = a.attrelid and d.refobjsubid = a.attnum
                          where d.objid = c.oid and a.attidentity <> '')
       order by 1, 2
    loop
      s := s || format('create sequence if not exists %I.%I;', r.nspname, r.relname) || E'\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- tabelas (colunas + chave primária)
  if p_parte = 'tabelas' then
    s := E'\n-- ===== tabelas =====\n';
    for r in
      select n.nspname, c.relname, c.oid
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname = any(esquemas)
       order by 1, 2
    loop
      cols := '';
      for col in
        select a.attname, format_type(a.atttypid, a.atttypmod) tipo, a.attnotnull,
               pg_get_expr(d.adbin, d.adrelid) padrao, a.attidentity, a.attgenerated
          from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
         order by a.attnum
      loop
        cols := cols || (case when cols = '' then '' else E',\n' end)
          || '  ' || quote_ident(col.attname) || ' ' || col.tipo
          || case when col.attgenerated = 's' then ' generated always as (' || col.padrao || ') stored'
                  when col.attidentity = 'a' then ' generated always as identity'
                  when col.attidentity = 'd' then ' generated by default as identity'
                  when col.padrao is not null then ' default ' || col.padrao else '' end
          || case when col.attnotnull then ' not null' else '' end;
      end loop;
      -- chave primária junto da tabela (as outras restrições vêm depois, por causa das FKs)
      for col in select conname, pg_get_constraintdef(oid) def from pg_constraint
                where conrelid = r.oid and contype = 'p' loop
        cols := cols || E',\n  constraint ' || quote_ident(col.conname) || ' ' || col.def;
      end loop;
      s := s || format(E'create table if not exists %I.%I (\n%s\n);\n', r.nspname, r.relname, cols);
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- funções usadas em default de coluna
  -- Vêm antes das tabelas (um default como app_email() precisa da função
  -- existindo). As demais vêm depois, porque podem devolver "setof tabela".
  if p_parte = 'funcoes_base' then
    s := E'\n-- ===== funções usadas em default de coluna =====\n';
    for r in
      select distinct n.nspname, p.proname, p.oid
        from pg_depend d
        join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
        join pg_namespace n on n.oid = p.pronamespace
       where d.classid = 'pg_attrdef'::regclass and n.nspname = any(esquemas)
       order by 1, 2, 3
    loop
      s := s || pg_get_functiondef(r.oid) || E';\n\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- funções
  if p_parte = 'funcoes' then
    s := E'\n-- ===== funções =====\n';
    for r in
      select n.nspname, p.proname, p.oid
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = any(esquemas) and p.prokind in ('f','p')
         and p.proname <> 'esquema_ddl'
       order by 1, 2, p.oid
    loop
      s := s || pg_get_functiondef(r.oid) || E';\n\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- restrições (unique, check, FK)
  if p_parte = 'restricoes' then
    s := E'\n-- ===== restrições =====\n';
    for r in
      select n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid) def, k.contype
        from pg_constraint k
        join pg_class c on c.oid = k.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = any(esquemas) and c.relkind = 'r' and k.contype in ('u','c','f','x')
       order by case k.contype when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end, 1, 2, 3
    loop
      s := s || format('alter table %I.%I add constraint %I %s;', r.nspname, r.relname, r.conname, r.def) || E'\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- índices (fora os de restrição)
  if p_parte = 'indices' then
    s := E'\n-- ===== índices =====\n';
    for r in
      select i.indexdef
        from pg_indexes i
        join pg_class c on c.relname = i.indexname
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = i.schemaname
       where i.schemaname = any(esquemas)
         and not exists (select 1 from pg_constraint k where k.conindid = c.oid)
       order by i.schemaname, i.tablename, i.indexname
    loop
      s := s || replace(r.indexdef, 'CREATE INDEX', 'CREATE INDEX IF NOT EXISTS')
                  || E';\n';
    end loop;
    s := replace(s, 'CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ');
    return s;
  end if;

  -- ---------------------------------------------------------------- visões
  if p_parte = 'visoes' then
    s := E'\n-- ===== visões =====\n';
    for r in
      select n.nspname, c.relname, c.oid,
             coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') inv
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'v' and n.nspname = any(esquemas)
       order by 1, 2
    loop
      s := s || format(E'create or replace view %I.%I\n  with (security_invoker = %s) as\n%s;\n\n',
                       r.nspname, r.relname, r.inv, rtrim(pg_get_viewdef(r.oid, true), E'; \n'));
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- gatilhos
  if p_parte = 'gatilhos' then
    s := E'\n-- ===== gatilhos =====\n';
    for r in
      select t.oid, n.nspname, c.relname, t.tgname
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname = any(esquemas)
       order by 2, 3, 4
    loop
      s := s || format('drop trigger if exists %I on %I.%I;', r.tgname, r.nspname, r.relname) || E'\n'
             || pg_get_triggerdef(r.oid, true) || E';\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- RLS + políticas
  if p_parte = 'politicas' then
    s := E'\n-- ===== segurança por linha (RLS) =====\n';
    for r in
      select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname = any(esquemas) and c.relrowsecurity
       order by 1, 2
    loop
      s := s || format('alter table %I.%I enable row level security;', r.nspname, r.relname) || E'\n';
      if r.relforcerowsecurity then
        s := s || format('alter table %I.%I force row level security;', r.nspname, r.relname) || E'\n';
      end if;
    end loop;
    s := s || E'\n-- políticas\n';
    for r in
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        from pg_policies where schemaname = any(esquemas)
       order by 1, 2, 3
    loop
      s := s || format('drop policy if exists %I on %I.%I;', r.policyname, r.schemaname, r.tablename) || E'\n'
             || format('create policy %I on %I.%I as %s for %s to %s',
                       r.policyname, r.schemaname, r.tablename, lower(r.permissive), r.cmd,
                       array_to_string(r.roles, ', '))
             || case when r.qual is not null then E'\n  using (' || r.qual || ')' else '' end
             || case when r.with_check is not null then E'\n  with check (' || r.with_check || ')' else '' end
             || E';\n';
    end loop;
    return s;
  end if;

  -- ---------------------------------------------------------------- grants
  if p_parte = 'grants' then
    s := E'\n-- ===== permissões (anon, authenticated, service_role) =====\n';
    for r in
      select table_schema, table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) privs
        from information_schema.role_table_grants
       where table_schema = any(esquemas) and grantee in ('anon','authenticated','service_role')
       group by 1, 2, 3 order by 1, 2, 3
    loop
      s := s || format('grant %s on %I.%I to %I;', lower(r.privs), r.table_schema, r.table_name, r.grantee) || E'\n';
    end loop;
    s := s || E'\n-- funções: tudo revogado de public, depois só o que cada papel tem hoje\n';
    for r in
      select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.oid,
             (select string_agg(quote_ident(g.grantee::regrole::text), ', ' order by 1)
                from aclexplode(p.proacl) g
               where g.privilege_type = 'EXECUTE' and g.grantee::regrole::text in ('anon','authenticated','service_role')) quem
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = any(esquemas) and p.prokind in ('f','p') and p.proname <> 'esquema_ddl'
       order by 1, 2
    loop
      s := s || format('revoke all on function %I.%I(%s) from public;', r.nspname, r.proname, r.args) || E'\n';
      if r.quem is not null then
        s := s || format('grant execute on function %I.%I(%s) to %s;', r.nspname, r.proname, r.args, r.quem) || E'\n';
      end if;
    end loop;
    for r in
      select n.nspname, c.relname, g.grantee::regrole::text papel, string_agg(g.privilege_type, ', ') privs
        from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) g
       where c.relkind = 'S' and n.nspname = any(esquemas) and g.grantee::regrole::text in ('anon','authenticated','service_role')
       group by 1, 2, 3 order by 1, 2, 3
    loop
      s := s || format('grant %s on sequence %I.%I to %I;', lower(r.privs), r.nspname, r.relname, r.papel) || E'\n';
    end loop;
    return s;
  end if;

  raise exception 'parte desconhecida: %', p_parte;
end
$fn$;

revoke all on function public.esquema_ddl(text) from public, anon, authenticated;
