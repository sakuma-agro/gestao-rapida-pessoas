-- Data da evidência pelo nome do arquivo (03/11/2026, pedido do Guilherme). Mesma regra da função
-- onedrive-sync (dataPeloNome): data completa no nome → ela; dia-mês sem ano → ano da pasta; nome do mês →
-- último dia do mês; nunca depois da data do arquivo. Usada uma vez para acertar as 610 evidências que já
-- estavam no app (as datas antigas ficaram em cert_evidencias_bkp_datas).
-- A definição completa está aplicada no banco: select pg_get_functiondef('public.cert_data_pelo_nome'::regproc);
create table if not exists public.cert_evidencias_bkp_datas(id uuid, data_antiga date, data_nova date, em timestamptz default now());
alter table public.cert_evidencias_bkp_datas enable row level security;
-- Para desfazer: update cert_evidencias e set data = b.data_antiga from cert_evidencias_bkp_datas b where b.id = e.id;
