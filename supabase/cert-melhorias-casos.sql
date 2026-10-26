-- cert-melhorias-casos.sql — Certificação › Forms › Melhoria contínua, versão 2 (26/10/2026).
-- Pedido do Guilherme: "sobre melhorias contínuas e não conformidades, vamos procurar algo
-- melhor … SPDA é uma não conformidade que já teve início, orçamento, um ficou caro, estamos
-- procurando outras empresas … vai ter mais etapas. Pesquise em grandes empresas como
-- controlam não conformidades e melhorias contínuas, melhorias que vamos fazer no futuro."
-- Aprovado ("SIM") o modelo:
--  · Não conformidade = caso CAPA: ABERTA → CAUSA ANALISADA → PLANO DE AÇÃO → EM EXECUÇÃO →
--    AGUARDANDO RECURSO → VERIFICAÇÃO → ENCERRADA (encerrar só com verificação de eficácia).
--  · Melhoria = banco de melhorias: IDEIA → AVALIADA → APROVADA → EM EXECUÇÃO → CONCLUÍDA (ou ARQUIVADA),
--    com impacto × custo e ano/trimestre previsto.
--  · Feedback (reclamação, sugestão, elogio): RECEBIDO → TRATADO, podendo gerar NC ou melhoria.
-- Cada caso tem plano de ação (5W2H: o quê, quem, quando, quanto, como, status) e
-- andamentos (linha do tempo: data, o que aconteceu, valor, empresa, link).
-- A tabela antiga cmc_registros fica como cópia (não é mais usada pelo app).
-- Migração "cert_melhorias_casos". Permissão: módulo 'cert'.
create table if not exists public.cmc_casos (
  id uuid primary key default gen_random_uuid(),
  natureza text not null check (natureza in ('NC','MELHORIA','FEEDBACK')),
  tipo text not null,                 -- NÃO CONFORMIDADE, MELHORIA, RECLAMAÇÃO, SUGESTÃO, ELOGIO
  titulo text not null,
  descricao text,
  via text, local text, fazenda text,
  solicitante text, responsavel text,
  prioridade text,                    -- URGENTE, ALTA, MÉDIA, BAIXA
  data_abertura date not null,
  etapa text not null,
  previsao date,                      -- previsão de conclusão do caso
  reavaliar_em date,                  -- aguardando recurso: quando olhar de novo
  contencao text,                     -- ação imediata (NC)
  porques jsonb not null default '[]'::jsonb,   -- 5 porquês
  causa_raiz text,
  impacto int check (impacto between 1 and 3),  -- melhoria: 1 baixo · 2 médio · 3 alto
  custo int check (custo between 1 and 3),      -- melhoria: 1 baixo · 2 médio · 3 alto
  custo_estimado numeric,
  ano_previsto int, trimestre_previsto int check (trimestre_previsto between 1 and 4),
  verif_data date, verif_por text, verif_resultado text, verif_eficaz boolean,
  padronizacao text,                  -- o que virou POP/IT/treinamento
  data_encerramento date,
  evid_url text,
  origem_id uuid references public.cmc_casos(id) on delete set null,   -- feedback que gerou
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create table if not exists public.cmc_acoes (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.cmc_casos(id) on delete cascade,
  oque text not null, quem text, quando date, quanto numeric, como text,
  status text not null default 'A FAZER' check (status in ('A FAZER','EM ANDAMENTO','CONCLUÍDA','CANCELADA')),
  concluida_em date, resultado text, ordem int not null default 0,
  criado_em timestamptz not null default now(), criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(), atualizado_por text
);
create table if not exists public.cmc_andamentos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.cmc_casos(id) on delete cascade,
  data date not null, texto text not null, valor numeric, empresa text, link text,
  criado_em timestamptz not null default now(), criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(), atualizado_por text
);
create index if not exists cmc_acoes_caso on public.cmc_acoes(caso_id);
create index if not exists cmc_andamentos_caso on public.cmc_andamentos(caso_id, data);
do $$ declare t text; begin
  foreach t in array array['cmc_casos','cmc_acoes','cmc_andamentos'] loop
    execute format('drop trigger if exists cmc_carimbo on public.%I', t);
    execute format('create trigger cmc_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cmc_leem on public.%I', t);
    execute format('drop policy if exists cmc_inserem on public.%I', t);
    execute format('drop policy if exists cmc_alteram on public.%I', t);
    execute format('drop policy if exists cmc_apagam on public.%I', t);
    execute format('create policy cmc_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cmc_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy cmc_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
    execute format('create policy cmc_apagam on public.%I for delete to authenticated using (public.app_pode(''cert''))', t);
  end loop;
end $$;

-- Os 17 registros da planilha viram 13 casos (os 4 do SPDA viram um caso; os 2 da pista de calda do Morro Branco, outro).
do $$ declare c uuid; begin
  if exists (select 1 from public.cmc_casos) then return; end if;

  -- SPDA (Faca): não conformidade aguardando recurso
  insert into public.cmc_casos (natureza,tipo,titulo,descricao,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,causa_raiz,criado_por)
  values ('NC','NÃO CONFORMIDADE','SPDA — sistema de proteção contra descargas atmosféricas','Adequar o SPDA da fazenda (projeto, material e instalação).','AUDITORIA INTERNA','SPDA','FACA','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','URGENTE','2024-12-03','AGUARDANDO RECURSO',
    'Instalação exige projeto de engenharia e investimento acima do orçamento disponível no momento.','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado,ordem) values
    (c,'Solicitar projeto ao engenheiro','ANDERSON SANTANA JUNIOR','CONCLUÍDA','2025-01-10','Solicitado e autorizado o orçamento do projeto',1),
    (c,'Executar o projeto de SPDA','ANDERSON SANTANA JUNIOR','CONCLUÍDA','2025-03-13','Projeto entregue',2),
    (c,'Orçamento de material e instalação','FIVE STAR EXTINTORES','CONCLUÍDA','2025-06-12','Orçamento realizado — valor inviável no momento',3),
    (c,'Procurar outras empresas especializadas em SPDA','GUILHERME RIBEIRO LOPES','EM ANDAMENTO',null,null,4);
  insert into public.cmc_andamentos (caso_id,data,texto,empresa) values
    (c,'2024-12-03','Aberto na auditoria interna: solicitar engenheiro para o projeto.',null),
    (c,'2025-01-10','Orçamento do projeto autorizado.','ANDERSON SANTANA JUNIOR'),
    (c,'2025-03-13','Projeto de SPDA entregue.','ANDERSON SANTANA JUNIOR'),
    (c,'2025-06-12','Orçamento de material e instalação — valor inviável no momento.','FIVE STAR EXTINTORES'),
    (c,'2025-07-07','Procurando outras empresas especializadas em SPDA.',null),
    (c,'2026-10-26','Novo orçamento — ainda acima do que a fazenda pode pagar neste momento. (completar empresa e valor)',null);

  -- Pista de preparo de calda (Morro Branco): melhoria concluída
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,criado_por)
  values ('MELHORIA','MELHORIA','Área de preparo de calda — Morro Branco','AUDITORIA INTERNA','Pista de Preparo de Calda','MORRO BRANCO','GUILHERME RIBEIRO LOPES','CA CONSTRUTORA','ALTA','2025-07-21','CONCLUÍDA','2025-11-10','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado,ordem) values
    (c,'Solicitar orçamento','CA CONSTRUTORA','CONCLUÍDA','2025-07-30','Orçamento autorizado',1),
    (c,'Construção da área de preparo de calda','CA CONSTRUTORA','CONCLUÍDA','2025-11-10','Construção concluída',2);
  insert into public.cmc_andamentos (caso_id,data,texto,empresa) values
    (c,'2025-07-30','Orçamento autorizado.','CA CONSTRUTORA'), (c,'2025-11-10','Construção concluída.','CA CONSTRUTORA');

  -- Não conformidades da auditoria externa (jan/2025) — encerradas
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,verif_resultado,criado_por)
  values ('NC','NÃO CONFORMIDADE','Instalar lava-olhos na pista de abastecimento','AUDITORIA EXTERNA','Pista de Abastecimento Diesel','FACA','GUILHERME RIBEIRO LOPES','CA CONSTRUTORA','ALTA','2025-01-29','ENCERRADA','2025-04-09','Lava-olhos instalado (encerrada na planilha)','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado) values (c,'Instalar lava-olhos','CA CONSTRUTORA','CONCLUÍDA','2025-04-09','Lava-olhos instalado');
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,verif_resultado,criado_por)
  values ('NC','NÃO CONFORMIDADE','Portão de evacuação — vaso de pressão F.06','AUDITORIA EXTERNA','F.06 - Vaso de Pressão - Faca - (schulz)','FACA','GUILHERME RIBEIRO LOPES','CA CONSTRUTORA','ALTA','2025-01-29','ENCERRADA','2025-04-09','Construção concluída (encerrada na planilha)','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado) values (c,'Construir portão de evacuação','CA CONSTRUTORA','CONCLUÍDA','2025-04-09','Construção concluída');
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,verif_resultado,criado_por)
  values ('NC','NÃO CONFORMIDADE','Abrigo (casinha) para o compressor — vaso de pressão F.07','AUDITORIA EXTERNA','F.07 - Vaso de Pressão - Faca (inativo)','FACA','GUILHERME RIBEIRO LOPES','CA CONSTRUTORA','ALTA','2025-01-29','ENCERRADA','2025-04-09','Construção concluída (encerrada na planilha)','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado) values (c,'Construir abrigo para o compressor','CA CONSTRUTORA','CONCLUÍDA','2025-04-09','Construção concluída');

  -- Não conformidades internas
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,verif_resultado,criado_por)
  values ('NC','NÃO CONFORMIDADE','Falta evidência da ata de treinamento','AUDITORIA INTERNA','Administrativo','FACA','VINICIUS DALBEN DE OLIVEIRA','VINICIUS DALBEN DE OLIVEIRA','ALTA','2025-11-03','ENCERRADA','2026-02-18','Encerrada na planilha','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_acoes (caso_id,oque,quem,status,concluida_em,resultado) values (c,'Evidenciar a ata de treinamento','VINICIUS DALBEN DE OLIVEIRA','CONCLUÍDA','2026-02-18','Ata evidenciada');
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,prioridade,data_abertura,etapa,previsao,criado_por)
  values ('NC','NÃO CONFORMIDADE','Não há evidência documentada da abertura da caixa de reclamação','AUDITORIA INTERNA','Administrativo','FACA','VINICIUS DALBEN DE OLIVEIRA','ALTA','2026-02-18','ABERTA','2026-05-20','importado do FORMAGR-42A');

  -- Melhorias concluídas
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,solicitante,responsavel,prioridade,data_abertura,etapa,data_encerramento,padronizacao,criado_por)
  values ('MELHORIA','MELHORIA','Controle das manutenções por aplicativo','AUDITORIA INTERNA','Administrativo','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','MÉDIA','2025-03-01','CONCLUÍDA','2025-03-10','Implementado o Exalt','importado do FORMAGR-42A'),
         ('MELHORIA','MELHORIA','Quadro do cronograma de manutenções preventivas','AUDITORIA INTERNA','Administrativo','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','ALTA','2025-05-01','CONCLUÍDA','2025-06-01','Guilherme e Vinicius implementaram o quadro','importado do FORMAGR-42A'),
         ('MELHORIA','MELHORIA','Adesivo de controle das manutenções preventivas','AUDITORIA INTERNA','Administrativo','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','ALTA','2025-08-04','CONCLUÍDA','2025-09-01','Feitos adesivos das trocas de óleo','importado do FORMAGR-42A');

  -- Melhorias em andamento / futuras
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,previsao,ano_previsto,criado_por)
  values ('MELHORIA','MELHORIA','Pista de calda perto do piscinão','AUDITORIA INTERNA','Administrativo','FACA','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','MÉDIA','2025-08-14','AVALIADA','2027-08-14',2027,'importado do FORMAGR-42A');
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,previsao,criado_por)
  values ('MELHORIA','MELHORIA','Pintura do escritório e do refeitório','AUDITORIA INTERNA','Administrativo','LOTE 35 PADAP','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','MÉDIA','2026-01-13','EM EXECUÇÃO','2026-03-20','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_andamentos (caso_id,data,texto) values (c,'2026-01-13','Já está pintando.');
  insert into public.cmc_casos (natureza,tipo,titulo,via,local,fazenda,solicitante,responsavel,prioridade,data_abertura,etapa,previsao,criado_por)
  values ('MELHORIA','MELHORIA','Blusa de frio para os funcionários (pedido deles)','AUDITORIA INTERNA','Administrativo','LOTE 35 PADAP','GUILHERME RIBEIRO LOPES','GUILHERME RIBEIRO LOPES','MÉDIA','2026-02-18','EM EXECUÇÃO','2026-04-21','importado do FORMAGR-42A') returning id into c;
  insert into public.cmc_andamentos (caso_id,data,texto) values (c,'2026-02-18','Fazendo orçamentos.');
end $$;

-- ---------------------------------------------------------------------------
-- JotForm (QR Code) → Reclamações e sugestões (26/10/2026). Migração "cmc_jotform_webhook".
-- Função: supabase/functions/jotform-feedback (verify_jwt desligado; confere ?k=token).
alter table public.cmc_casos add column if not exists origem_externa text;
create unique index if not exists cmc_casos_origem_externa on public.cmc_casos (origem_externa) where origem_externa is not null;
create table if not exists public.integracoes_tokens (
  nome text primary key,
  token text not null,
  criado_em timestamptz not null default now()
);
alter table public.integracoes_tokens enable row level security;   -- sem política: só o servidor lê
insert into public.integracoes_tokens (nome, token)
values ('jotform-feedback', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (nome) do nothing;

-- Reclamações e sugestões: conclusão e devolutiva aos funcionários (26/10/2026). Migração "cmc_conclusao_devolutiva".
alter table public.cmc_casos add column if not exists conclusao text;
alter table public.cmc_casos add column if not exists comunicado_como text;
alter table public.cmc_casos add column if not exists comunicado_detalhe text;
