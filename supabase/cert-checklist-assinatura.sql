-- cert-checklist-assinatura.sql — Check List Digital: assinatura de quem preencheu (05/11/2026).
-- Pedido do Guilherme no CL 03 Colheita – Abacate: "responsável pelo preenchimento e pedir assinatura".
-- Modelo com config.assinatura = true pede a assinatura desenhada na tela; vai como PNG (data URL).
alter table public.ccl_registros add column if not exists assinatura text;
alter table public.ccl_registros add column if not exists assinado_em timestamptz;
update public.ccl_modelos m set config = m.config
  || jsonb_build_object('assinatura', true)
  || jsonb_build_object('rotulos', coalesce(m.config->'rotulos', '{}'::jsonb) || jsonb_build_object('responsavel', 'Responsável pelo preenchimento'))
from public.cert_documentos d where d.id = m.documento_id and d.codigo = 'CL 03';
notify pgrst, 'reload schema';
