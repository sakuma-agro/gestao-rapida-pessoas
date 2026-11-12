-- 12/11/2026 · Certificação › CHECKS Digital › Vistorias (js/cert-vistorias.js)
-- Os checklists de certificação feitos na área Vistorias (RA Moradia, IFA, GRASP,
-- FORMAGR…) ficam visíveis para quem tem a Certificação. Aplicado como migração
-- vistorias_checklists_certificacao.
create or replace function vistorias.e_certificacao(ck jsonb)
returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(ck) = 'array'
    and (ck->0->'modelo') is not null
    and concat_ws(' ', ck->0->'modelo'->>'sigla', ck->0->'modelo'->>'titulo', ck->0->'modelo'->>'subtitulo', ck->0->'modelo'->>'ref')
        ~* '(rainforest|global ?g\.?a\.?p|grasp|smeta|formagr)', false);
$$;
drop policy if exists vistorias_ler_certificacao on vistorias.vistorias;
create policy vistorias_ler_certificacao on vistorias.vistorias
  for select to authenticated
  using (public.app_pode('cert') and vistorias.e_certificacao(checklist));
grant execute on function vistorias.e_certificacao(jsonb) to authenticated;
