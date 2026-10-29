-- arquivos.data_arquivo (29/10/2026): data do arquivo no OneDrive (última modificação),
-- gravada pelo onedrive-sync. Com mais de um PDF na pasta de um documento, a Lista
-- mestra abre o mais novo (caso do AN 97: plano de 2024 × PGRS de 2026).
alter table public.arquivos add column if not exists data_arquivo date;
