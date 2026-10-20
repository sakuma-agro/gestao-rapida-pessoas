-- Rateio de outubro/2026 acertado igual ao lançado no Agro (PDF
-- "Rateio_mensal_Outubro_2026.pdf", 20/10/2026). Já rodado no SQL Editor.
-- Saíram 827/829 (Trigos) e 830 (Cen Pl 24): ficaram de jun a set (4 meses).
-- Entrou 869 Soja - Pivot 4 - Morro Branco 26/2027 (14,02 ha), a partir de out.
-- 34 plantios, todos marcados "Lançado no Agro"; custo ADM 114.891,63.
update public.cb_talhoes set qtde_meses = 4 where cod_agro in ('827','829','830');
delete from public.cb_itens where mes = '2026-10'
  and talhao_id in (select id from public.cb_talhoes where cod_agro in ('827','829','830'));
insert into public.cb_talhoes (id, cod_agro, nome, cultura_id, fazenda, area, ativo, data_inicial, qtde_meses)
select gen_random_uuid(), '869', 'Soja - Pivot 4 - Morro Branco 26/2027', c.id,
       coalesce((select fazenda from public.cb_talhoes where nome ilike '%Morro Branco%' and fazenda is not null limit 1), 'Fazenda Morro Branco'),
       14.02, true, '2026-10-01', 5
  from public.cb_culturas c where c.nome = 'Soja'
   and not exists (select 1 from public.cb_talhoes where cod_agro = '869');
insert into public.cb_itens (id, mes, talhao_id, cultura_id, area, indice, ciclo, incluido, lancado_agro)
select '2026-10:' || t.id, '2026-10', t.id, t.cultura_id, t.area, c.indice, c.ciclo, true, true
  from public.cb_talhoes t join public.cb_culturas c on c.id = t.cultura_id
 where t.cod_agro = '869'
on conflict (id) do nothing;
update public.cb_itens set lancado_agro = true where mes = '2026-10';
update public.cb_meses set custo_adm = 114891.63 where id = '2026-10';
