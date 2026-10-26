-- cert-melhorias.sql — Certificação › Melhoria contínua: registro de melhorias,
-- não conformidades, reclamações, sugestões e elogios (FORM 020 / FORM 042), 26/10/2026.
-- Pedido do Guilherme, com a planilha "FORMAGR-42A - Gestão de Anomalias e Feedbacks":
-- "ignore somente das manutenções de máquinas, vamos fazer sobre melhorias contínuas, registro".
-- (As manutenções de máquinas ficam na área Máquinas e Patrimônio.)
-- Pode rodar de novo. Permissão: módulo 'cert'. Migração "cert_melhorias".
-- Evidências (arquivos): certificacao/evidencia/mc-<id>/… (abertura) e mcr-<id>/… (resolução).
create table if not exists public.cmc_registros (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'EM ABERTO' check (status in ('EM ABERTO','FINALIZADO')),
  data_abertura date not null,
  via text,                 -- AUDITORIA INTERNA, AUDITORIA EXTERNA, QUADRO, WHATSAPP, DIGITAL, VIA PAPEL, CHECK LIST
  tipo text not null,       -- MELHORIA, NÃO CONFORMIDADE, RECLAMAÇÃO, SUGESTÃO, ELOGIO
  local text,
  fazenda text,
  solicitante text,
  descricao text not null,  -- descrição / causa raiz
  evid_url text,
  prioridade text,          -- URGENTE, ALTA, MÉDIA, BAIXA
  previsao date,            -- previsão de fechamento (sem ela: abertura + 10 dias)
  resp_resolucao text,
  resolucao text,
  evid_resolucao_url text,
  data_fechamento date,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cmc_registros_abertura on public.cmc_registros(data_abertura desc);
drop trigger if exists cmc_carimbo on public.cmc_registros;
create trigger cmc_carimbo before update on public.cmc_registros for each row execute function public.marcar_atualizacao();
alter table public.cmc_registros enable row level security;
revoke all on public.cmc_registros from anon;
grant select, insert, update, delete on public.cmc_registros to authenticated;
drop policy if exists cmc_leem on public.cmc_registros;
drop policy if exists cmc_inserem on public.cmc_registros;
drop policy if exists cmc_alteram on public.cmc_registros;
drop policy if exists cmc_apagam on public.cmc_registros;
create policy cmc_leem on public.cmc_registros for select to authenticated using (public.app_pode('cert'));
create policy cmc_inserem on public.cmc_registros for insert to authenticated with check (public.app_pode('cert'));
create policy cmc_alteram on public.cmc_registros for update to authenticated using (public.app_pode('cert')) with check (public.app_pode('cert'));
create policy cmc_apagam on public.cmc_registros for delete to authenticated using (public.app_pode('cert'));

-- Histórico da planilha FORMAGR-42A (as 17 linhas que não são manutenção de máquinas).
insert into public.cmc_registros (status,data_abertura,via,tipo,local,fazenda,solicitante,descricao,prioridade,previsao,resp_resolucao,resolucao,data_fechamento,criado_por)
select v.status, v.data_abertura::date, v.via, v.tipo, v.local, v.fazenda, v.solicitante, v.descricao, v.prioridade, v.previsao::date, v.resp_resolucao, v.resolucao, v.data_fechamento::date, 'importado do FORMAGR-42A' from (values
  ('FINALIZADO','2024-12-03','AUDITORIA INTERNA','MELHORIA','SPDA','FACA','GUILHERME RIBEIRO LOPES','SOLICITAR ENGENHEIRO PROJETO','URGENTE',null,'ANDERSON SANTANA JUNIOR','FOI SOLICITADO E AUTORIZADO ORÇAMENTO DO PROJETO','2025-01-10'),
  ('FINALIZADO','2025-01-10','AUDITORIA INTERNA','MELHORIA','SPDA','FACA','ANDERSON SANTANA JUNIOR','EXECUÇÃO DO PROJETO','URGENTE',null,'ANDERSON SANTANA JUNIOR','ENTREGA DO PROJETO','2025-03-13'),
  ('FINALIZADO','2025-01-29','AUDITORIA EXTERNA','NÃO CONFORMIDADE','Pista de Abastecimento Diesel','FACA','GUILHERME RIBEIRO LOPES','INSTALAR LAVA OLHOS','ALTA',null,'CA CONSTRUTORA','LAVA OLHOS INSTALADO','2025-04-09'),
  ('FINALIZADO','2025-01-29','AUDITORIA EXTERNA','NÃO CONFORMIDADE','F.06 - Vaso de Pressão - Faca - (schulz)','FACA','GUILHERME RIBEIRO LOPES','SOLICITAR CONSTRUÇÃO DE PORTÃO DE EVACUAÇÃO','ALTA',null,'CA CONSTRUTORA','CONSTRUÇÃO CONCLUÍDA','2025-04-09'),
  ('FINALIZADO','2025-01-29','AUDITORIA EXTERNA','NÃO CONFORMIDADE','F.07 - Vaso de Pressão - Faca (inativo)','FACA','GUILHERME RIBEIRO LOPES','SOLICITAR CASINHA PARA O COMPRESSOR','ALTA',null,'CA CONSTRUTORA','CONSTRUÇÃO CONCLUÍDA','2025-04-09'),
  ('FINALIZADO','2025-03-01','AUDITORIA INTERNA','MELHORIA','Administrativo',null,'GUILHERME RIBEIRO LOPES','CONTROLE DAS MANUTENÇÕES VIA APLICATIVO','MÉDIA',null,'GUILHERME RIBEIRO LOPES','FOI IMPLEMENTADO O EXALT','2025-03-10'),
  ('FINALIZADO','2025-03-13','AUDITORIA INTERNA','MELHORIA','SPDA','FACA','GUILHERME RIBEIRO LOPES','ORÇAMENTO MATERIAL E INSTALAÇÃO','URGENTE',null,'FIVE STAR EXTINTORES','ORÇAMENTO REALIZADO - VALOR INVIÁVEL NO MOMENTO','2025-06-12'),
  ('FINALIZADO','2025-05-01','AUDITORIA INTERNA','MELHORIA','Administrativo',null,'GUILHERME RIBEIRO LOPES','QUADRO CRONOGRAMA MANUTEÇÕES PREVENTIVAS','ALTA',null,'GUILHERME RIBEIRO LOPES','Guilherme e Vinicius Implementaram o Quadro','2025-06-01'),
  ('EM ABERTO','2025-07-07','AUDITORIA INTERNA','MELHORIA','SPDA','FACA','GUILHERME RIBEIRO LOPES','PROCURANDO OUTRAS EMPRESAS ESPECIALIZADAS EM SPDA','URGENTE','2028-12-31',null,null,null),
  ('FINALIZADO','2025-07-21','AUDITORIA INTERNA','MELHORIA','Pista de Preparo de Calda','MORRO BRANCO','GUILHERME RIBEIRO LOPES','SOLICITAR ORÇAMENTO','ALTA',null,'CA CONSTRUTORA','ORÇAMENTO AUTORIZADO','2025-07-30'),
  ('FINALIZADO','2025-07-30','AUDITORIA INTERNA','MELHORIA','Pista de Preparo de Calda','MORRO BRANCO','CA CONSTRUTORA','CONSTRUÇÃO DA ÁREA DE PREPARO DE CALDA','ALTA',null,'CA CONSTRUTORA','CONSTRUÇÃO CONCLUÍDA','2025-11-10'),
  ('FINALIZADO','2025-08-04','AUDITORIA INTERNA','MELHORIA','Administrativo',null,'GUILHERME RIBEIRO LOPES','ADESIVO CONTROLE MANUTENÇÕES PREVENTIVAS','ALTA',null,'GUILHERME RIBEIRO LOPES','FOI FEITO ADESIVOS TROCAS DE ÓLEO','2025-09-01'),
  ('EM ABERTO','2025-08-14','AUDITORIA INTERNA','MELHORIA','Administrativo','FACA','GUILHERME RIBEIRO LOPES','FAZER PISTA DE CALDA PERTO DO PISCINÃO','MÉDIA','2027-08-14',null,null,null),
  ('EM ABERTO','2026-02-18','AUDITORIA INTERNA','NÃO CONFORMIDADE','Administrativo','FACA','VINICIUS DALBEN DE OLIVEIRA','NÂO HÁ EVIDÊNCIA DOCUMENTADA DA ABERTURA DA CAIXA DE RECLAMAÇÂO','ALTA','2026-05-20',null,null,null),
  ('EM ABERTO','2026-01-13','AUDITORIA INTERNA','MELHORIA','Administrativo','LOTE 35 PADAP','GUILHERME RIBEIRO LOPES','PINTURA ESCRITÓRIO E REFEITÓRIO','MÉDIA','2026-03-20','GUILHERME RIBEIRO LOPES','JÁ ESTA PITANDO',null),
  ('EM ABERTO','2026-02-18','AUDITORIA INTERNA','MELHORIA','Administrativo','LOTE 35 PADAP','GUILHERME RIBEIRO LOPES','FUNCIONÁRIOS PEDIRAM BLUSA DE FRIO','MÉDIA','2026-04-21','GUILHERME RIBEIRO LOPES','ESTÁ FAZENDO ORÇAMENTOS',null),
  ('FINALIZADO','2025-11-03','AUDITORIA INTERNA','NÃO CONFORMIDADE','Administrativo','FACA','VINICIUS DALBEN DE OLIVEIRA','FALTA EVIDENCIA ATA DE TREINAMENTO','ALTA',null,'VINICIUS DALBEN DE OLIVEIRA','VAMOS EVIDENCIAR ATA TREINAMENTO','2026-02-18')
) v(status,data_abertura,via,tipo,local,fazenda,solicitante,descricao,prioridade,previsao,resp_resolucao,resolucao,data_fechamento)
where not exists (select 1 from public.cmc_registros);
