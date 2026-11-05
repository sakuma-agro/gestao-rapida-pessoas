-- cert-cl03-colheita.sql — Certificação › CL 03 Check List Colheita – Abacate (05/11/2026).
-- Pedido do Guilherme: "quero criar esse form como check list no lugar do Form 002"
-- (modelo: Check List Colheita - Abacate do CLICQ/PariPassu). Decisões dele:
--  · vira CL 03 + RG CL 03; FORM 002 e RG 002 ficam Inativos com o histórico
--    (118 evidências) e os vínculos dos POP 001 e POP 015 passam para o CL 03;
--  · só abacate: cultura já preenchida.
-- Cabeçalho: Fazenda, Data, Romaneio, Lote, PL, Cultura, Variedade, Responsável pela turma;
-- no fim: Data de higienização das caixas + Plano de ação. Pode rodar de novo.

-- configuração por modelo e campos extras do registro
alter table public.ccl_modelos add column if not exists config jsonb not null default '{}'::jsonb;   -- {rotulos, padroes, extras:[{id,rot,tipo,lugar}]}
alter table public.ccl_registros add column if not exists extras jsonb not null default '{}'::jsonb; -- {romaneio, pl, higienizacao}

insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, revisao, data_revisao, certificacoes, observacao, caminho, link)
select 'CL 03', 'Check List Colheita – Abacate', 'CHECK LIST', 'Diário', 'Em dia', '00', '2026-11-05', '{}',
  'Inspeção da colheita de abacate por romaneio (área liberada, sanitários, refeitório, identificação da área, ponto de colheita, caixas/bins, acondicionamento e dano mecânico). Substitui o FORM 002 Inspeção de colheita. Check list digital com foto por item; NC abre não conformidade no FORM 004.',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\6 - CHECK LIST\CL 03 - COLHEITA ABACATE',
  'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2F6%20%2D%20CHECK%20LIST%2FCL%2003%20%2D%20COLHEITA%20ABACATE'
where not exists (select 1 from public.cert_documentos where codigo = 'CL 03');

insert into public.cert_documentos(codigo, nome, categoria, periodicidade, situacao, certificacoes, observacao, caminho, link)
select 'RG CL 03', 'Check List Colheita – Abacate', 'REGISTROS', 'Diário', 'Em dia', '{}',
  'Registros do CL 03 preenchido (no app e o papel escaneado). Substitui o RG 002 Inspeção de colheita (campo).',
  'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\5 - REGISTROS\RG CL 03 - COLHEITA ABACATE',
  'https://onedrive.live.com/my?id=%2Fpersonal%2F048fac336e81a458%2FDocuments%2F1%20%2D%20ADM%20%2D%20PRINCIPAL%2F6%20%2D%20Certifica%C3%A7%C3%B5es%2F5%20%2D%20REGISTROS%2FRG%20CL%2003%20%2D%20COLHEITA%20ABACATE'
where not exists (select 1 from public.cert_documentos where codigo = 'RG CL 03');

-- vínculos: CL 03 → RG CL 03 e os POP que citavam o FORM 002 passam a citar o CL 03
insert into public.cert_vinculos(de_id, para_id, origem)
select c.id, r.id, 'CL → RG' from public.cert_documentos c, public.cert_documentos r
where c.codigo = 'CL 03' and r.codigo = 'RG CL 03'
  and not exists (select 1 from public.cert_vinculos v where v.de_id = c.id and v.para_id = r.id);
insert into public.cert_vinculos(de_id, para_id, origem)
select v.de_id, c.id, 'substitui FORM 002' from public.cert_vinculos v
join public.cert_documentos f on f.id = v.para_id and f.codigo = 'FORM 002'
join public.cert_documentos c on c.codigo = 'CL 03'
where not exists (select 1 from public.cert_vinculos x where x.de_id = v.de_id and x.para_id = c.id);
update public.cert_requisitos q set documentos = array(select distinct unnest(q.documentos || c.id))
from public.cert_documentos f, public.cert_documentos c
where f.codigo = 'FORM 002' and c.codigo = 'CL 03' and f.id = any(q.documentos) and not c.id = any(q.documentos);

-- FORM 002 e RG 002 saem de uso (histórico e evidências ficam)
update public.cert_documentos set situacao = 'Inativo',
  observacao = trim(coalesce(observacao, '') || ' Substituído pelo ' || case when codigo = 'FORM 002' then 'CL 03' else 'RG CL 03' end || ' (Check List Colheita – Abacate) em 05/11/2026.')
where codigo in ('FORM 002', 'RG 002') and situacao <> 'Inativo';

insert into public.ccl_modelos(documento_id, titulo, itens, legenda, campos, config)
select d.id, 'Colheita – Abacate',
  (select jsonb_agg(jsonb_build_object('id', 'i' || lpad(n::text, 2, '0'), 'texto', t) order by n)
     from unnest(array['Área está liberada para colheita?',
       'Os sanitários estão em local que não compromete a segurança alimentar?',
       'Refeitório está em local seguro?',
       'Área a ser colhida está identificada?',
       'O fruto está em ponto de colheita?',
       'Caixas, bags, bins ou caçambas estão em bom estado de conservação?',
       'Caixas, bags, bins ou caçambas foram lavados?',
       'Produtos colhidos foram acondicionados corretamente?',
       'Produto está livre de dano mecânico?']) with ordinality as x(t, n)),
  jsonb_build_object('C', 'Conforme', 'NC', 'Não conforme', 'NA', 'Não se aplica'),
  '["fazenda","data","local","atividade","cultura","variedade","avaliado","responsavel"]'::jsonb,
  jsonb_build_object(
    'rotulos', jsonb_build_object('local', 'Lote', 'avaliado', 'Responsável pela turma', 'responsavel', 'Avaliador'),
    'padroes', jsonb_build_object('cultura', 'ABACATE', 'atividade', 'Colheita'),
    'linhas_papel', 12,
    'extras', jsonb_build_array(
      jsonb_build_object('id', 'romaneio', 'rot', 'Romaneio', 'tipo', 'text'),
      jsonb_build_object('id', 'pl', 'rot', 'PL', 'tipo', 'text'),
      jsonb_build_object('id', 'higienizacao', 'rot', 'Data de higienização das caixas', 'tipo', 'date', 'lugar', 'plano')))
from public.cert_documentos d where d.codigo = 'CL 03'
on conflict (documento_id) do nothing;

notify pgrst, 'reload schema';
