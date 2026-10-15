-- Arquivos de todo o app no Google Drive (15/10/2026). Função: supabase/functions/arquivos.
-- O arquivo fica no Drive; aqui só a linha de controle.

create table if not exists public.arquivos (
  chave      text primary key,                 -- <área>/<tipo>/<dono>/<arquivo>.<ext>
  area       text not null check (area in ('pessoas','manutencoes','certificacao')),
  tipo       text not null check (tipo in ('funcionario','treinamento','exame','os','checklist','documento')),
  dono_id    text not null,                    -- id do registro a que o arquivo pertence
  nome       text not null,                    -- nome que aparece no Drive e para baixar
  mime       text not null,
  tamanho    integer not null,
  drive_id   text not null,
  criado_por uuid default auth.uid(),
  criado_em  timestamptz not null default now()
);
create index if not exists arquivos_dono on public.arquivos (tipo, dono_id);

-- Quem vê / quem grava, por área e tipo (admin pode tudo via app_pode_algum).
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  if p_area = 'pessoas' and p_tipo = 'funcionario' then
    return case when p_escrever then public.app_pode_algum('{pessoas,rh}')
                else public.app_pode_algum('{pessoas,rh,sst,epis,jornada}') end;
  elsif p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
    return public.app_pode_algum('{sst,epis}');
  elsif p_area = 'certificacao' and p_tipo = 'documento' then
    return public.app_pode_algum('{cert,certificacao}');
  elsif p_area = 'manutencoes' and p_tipo in ('os','checklist') then
    return public.app_pode_algum('{manutencoes}') or coalesce(manutencao.pode(), false);
  end if;
  return false;
end $$;
revoke all on function public.arquivo_pode(text,text,boolean) from public, anon;
grant execute on function public.arquivo_pode(text,text,boolean) to authenticated;

alter table public.arquivos enable row level security;
drop policy if exists arq_ler on public.arquivos;
drop policy if exists arq_inserir on public.arquivos;
drop policy if exists arq_trocar on public.arquivos;
drop policy if exists arq_apagar on public.arquivos;
create policy arq_ler     on public.arquivos for select to authenticated using (public.arquivo_pode(area, tipo, false));
create policy arq_inserir on public.arquivos for insert to authenticated with check (public.arquivo_pode(area, tipo, true));
create policy arq_trocar  on public.arquivos for update to authenticated using (public.arquivo_pode(area, tipo, true)) with check (public.arquivo_pode(area, tipo, true));
create policy arq_apagar  on public.arquivos for delete to authenticated using (public.arquivo_pode(area, tipo, true));
revoke all on public.arquivos from anon;
grant select, insert, update, delete on public.arquivos to authenticated;
grant select on public.arquivos to service_role;
