-- cert-croqui.sql — Certificação › AN 21 Croqui da propriedade no satélite (30/10/2026).
-- Uma linha por fazenda: limite e feições (talhões, pivôs, reserva…) importados do KML/KMZ
-- do Google Earth pelo app (js/cert-croqui.js), e os dados da reserva legal digitados no app.
-- Importar de novo substitui limite/feições e mantém "reserva". Pode rodar de novo.
create table if not exists public.cert_croquis (
  fazenda_id uuid primary key references public.jor_fazendas(id),
  fazenda text not null,
  limite jsonb,                                  -- [[lon,lat],…] ou null
  area_total numeric,                            -- ha, do limite
  feicoes jsonb not null default '[]'::jsonb,    -- [{nome, rot, grupo, ha, c:[[lon,lat],…]}]
  reserva jsonb not null default '{}'::jsonb,    -- {car, rl_car_ha, app_ha, averbacao, situacao, obs}
  fonte text,
  importado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text default public.app_email()
);
drop trigger if exists cert_croquis_carimbo on public.cert_croquis;
create trigger cert_croquis_carimbo before update on public.cert_croquis for each row execute function public.marcar_atualizacao();
alter table public.cert_croquis enable row level security;
revoke all on public.cert_croquis from anon;
grant select, insert, update, delete on public.cert_croquis to authenticated;
drop policy if exists cert_croquis_leem on public.cert_croquis;
drop policy if exists cert_croquis_gravam on public.cert_croquis;
create policy cert_croquis_leem on public.cert_croquis for select to authenticated using (public.app_pode('cert') or public.app_pode('sst'));
create policy cert_croquis_gravam on public.cert_croquis for all to authenticated using (public.app_pode('cert')) with check (public.app_pode('cert'));
-- 30/10/2026 (2): pontos de captação (outorgas do AN 59) e origem do limite (KML ou CAR).
alter table public.cert_croquis add column if not exists pontos jsonb not null default '[]'::jsonb,   -- [{nome,tipo,curso,outorga,vazao,finalidade,validade,venc,lat,lon}]
  add column if not exists limite_fonte text;                                                          -- 'CAR' quando veio do shapefile do SICAR
