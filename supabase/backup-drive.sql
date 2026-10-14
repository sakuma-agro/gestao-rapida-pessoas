-- Backup automático no Google Drive (14/10/2026). Função: supabase/functions/backup-drive.
-- O Apps Script do Guilherme chama a função com o cabeçalho x-backup-token; aqui fica
-- só o sha256 dessa senha (a senha mesmo só existe no script dele).
-- Trocar a senha: gerar outra, gravar o sha256 aqui e trocar CONFIG.SENHA no script.
create table if not exists public.backup_config (
  id int primary key default 1 check (id = 1),
  token_sha256 text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.backup_config enable row level security;
revoke all on public.backup_config from anon, authenticated;

create or replace function public.backup_arquivos()
returns table(bucket text, nome text, tamanho bigint, atualizado timestamptz)
language sql stable security definer set search_path = storage, public as $$
  select bucket_id::text, name::text, coalesce((metadata->>'size')::bigint,0), updated_at
  from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1,2;
$$;
revoke all on function public.backup_arquivos() from public, anon, authenticated;
grant execute on function public.backup_arquivos() to service_role;

grant select on vistorias.vistorias, vistorias.itens, vistorias.antes_depois,
  vistorias.anomalias_relatorios, vistorias.extintores, vistorias.fotos_drive,
  vistorias.configuracoes, vistorias.administradores to service_role;
