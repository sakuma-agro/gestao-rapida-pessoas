-- Data da evidência pelo nome do arquivo (03/11/2026, pedido do Guilherme). Mesma regra da função
-- onedrive-sync (dataPeloNome): data completa no nome → ela; dia-mês sem ano → ano da pasta; nome do mês →
-- último dia do mês; nunca depois da data do arquivo. Usada uma vez para acertar as 610 evidências que já
-- estavam no app (as datas antigas ficaram em cert_evidencias_bkp_datas).
-- A definição completa está aplicada no banco: select pg_get_functiondef('public.cert_data_pelo_nome'::regproc);
create table if not exists public.cert_evidencias_bkp_datas(id uuid, data_antiga date, data_nova date, em timestamptz default now());
alter table public.cert_evidencias_bkp_datas enable row level security;
-- Para desfazer: update cert_evidencias e set data = b.data_antiga from cert_evidencias_bkp_datas b where b.id = e.id;
-- 03/11/2026 (2ª versão): também escâner (06122024_131843_…), câmera (2025-1127-161840), ano-mês (2026-10)
-- e mês abreviado com ano (ABR-2025, Dez2024, ago-26) — mais 201 evidências acertadas.
-- arquivos_mover (padronizar.ps1 → movidos.json) passou a acertar a data e a descrição pelo caminho novo.
