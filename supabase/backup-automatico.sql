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

-- ═══════════════════════════════════════════════════════════════════════════
-- Backup diário no Google Drive, sem Apps Script (17/11/2026).
-- O banco dispara a função backup-drive todo dia às 3h de Brasília; ela salva
-- na pasta "Backup LOP" do Drive da escritoriosakuma1@gmail.com (a mesma
-- autorização dos anexos, public.drive_autorizacao) e registra o resultado aqui.
-- ═══════════════════════════════════════════════════════════════════════════

-- Registro de cada backup (só as funções leem e gravam).
create table if not exists public.backup_execucoes (
  id             bigint generated always as identity primary key,
  iniciado_em    timestamptz not null default now(),
  terminado_em   timestamptz,
  ok             boolean,
  tabelas        int,
  registros      bigint,
  arquivos_novos int,
  avisos         text,
  erro           text
);
alter table public.backup_execucoes enable row level security;
revoke all on public.backup_execucoes from anon, authenticated;
grant select, insert, update on public.backup_execucoes to service_role;

-- Senha do backup: sorteada aqui e guardada só no banco. A função confere
-- pelo sha256 em public.backup_config. Ninguém precisa ver nem copiar.
insert into public.integracoes_tokens (nome, token)
select 'backup-drive', encode(extensions.gen_random_bytes(32), 'hex')
 where not exists (select 1 from public.integracoes_tokens where nome = 'backup-drive');

insert into public.backup_config (id, token_sha256)
select 1, encode(extensions.digest(token, 'sha256'), 'hex')
  from public.integracoes_tokens where nome = 'backup-drive'
on conflict (id) do update set token_sha256 = excluded.token_sha256, atualizado_em = now();

-- Quem o agendamento chama.
create or replace function public.backup_drive_disparar()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare k text;
begin
  select token into k from integracoes_tokens where nome = 'backup-drive';
  if k is null then return; end if;
  perform net.http_post(
    url := 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/backup-drive?salvar=drive',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-backup-token', k),
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.backup_drive_disparar() from public, anon, authenticated;

-- Todo dia às 06:00 UTC = 03:00 de Brasília.
select cron.unschedule('backup-drive') where exists (select 1 from cron.job where jobname = 'backup-drive');
select cron.schedule('backup-drive', '0 6 * * *', 'select public.backup_drive_disparar()');

-- Para a rotina do GitHub conferir: só a data/hora do último backup que deu
-- certo (nenhum dado). Sem backup ok há mais de 2 dias, ela fica vermelha.
create or replace function public.backup_ultimo_ok()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$ select max(terminado_em) from backup_execucoes where ok $$;
revoke all on function public.backup_ultimo_ok() from public;
grant execute on function public.backup_ultimo_ok() to anon, authenticated;

-- Conferência: deve mostrar o agendamento e a senha criada (sem mostrar a senha).
select (select schedule from cron.job where jobname = 'backup-drive') as agendamento,
       (select count(*) from public.integracoes_tokens where nome = 'backup-drive') as senha_criada;
