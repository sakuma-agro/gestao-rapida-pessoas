-- NR de cada treinamento do catálogo (22/10/2026, pedido do Guilherme).
-- Já aplicado no banco (migração sst_tipos_treinamento_nr).
alter table public.sst_tipos_treinamento add column if not exists nr text;
-- Os 13 tipos que já existiam receberam a NR pelo nome do curso
-- (NR-06, 07, 20, 23, 31, 35). Ficaram sem NR, por não serem de norma
-- regulamentadora: transporte de passageiros, drone, 5S e café pós-colheita.
