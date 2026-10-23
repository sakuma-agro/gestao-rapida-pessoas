-- Área Projetos (PMBOK) do LOP - Gestão Rápida (23/10/2026).
-- Gerenciamento dos projetos internos da SAKUMA pelas boas práticas do Guia
-- PMBOK: termo de abertura, partes interessadas, EAP e cronograma, RACI,
-- riscos, comunicação, custos, mudanças, problemas e ações corretivas,
-- relatórios de progresso, encerramento e lições aprendidas.
-- Tabelas no esquema public com o prefixo pj_. Rodar uma vez no SQL Editor
-- do Supabase; só cria o que não existe. Quem entra: administrador ou quem tem
-- o módulo 'projetos' em app_usuarios.modulos (public.app_pode('projetos')).
-- "Apagar" no app é inativar (ativo = false), como nas outras áreas.

-- Projeto + Termo de Abertura (TAP). Linha de base (fim_base, orcamento_base)
-- é gravada ao entrar em Execução; mudanças aprovadas mexem só no vigente
-- (fim_previsto, orcamento). historico_fases = [{de, para, em, por}].
create table if not exists public.pj_projetos (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nome text not null,
  objetivo text,
  justificativa text,
  escopo text,
  fora_escopo text,
  premissas text,
  restricoes text,
  recursos text,
  criterios_sucesso text,              -- um por linha
  business_case text,                  -- viabilidade: por que vale a pena
  escopo_produto text,                 -- o que (características e funções do resultado)
  categoria text,                      -- melhoria, inovação, obra, implantação, TI…
  inovacao_objeto text,                -- produto | processo | marketing | organizacional
  inovacao_grau text,                  -- incremental | radical
  patrocinador text,
  gerente text,
  fazenda text,
  setor text,
  inicio date,
  fim_previsto date,
  orcamento numeric,
  fim_base date,
  orcamento_base numeric,
  fase text not null default 'iniciacao'
    check (fase in ('iniciacao','planejamento','execucao','monitoramento','encerramento')),
  situacao text not null default 'ativo'
    check (situacao in ('ativo','suspenso','encerrado','cancelado')),
  termo_aprovado_em timestamptz,
  termo_aprovado_por text,
  historico_fases jsonb not null default '[]'::jsonb,
  checklist_enc jsonb not null default '{}'::jsonb,
  criterios_alcancados jsonb not null default '{}'::jsonb,
  resultado_final text,
  encerrado_em date,
  criado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Partes interessadas. interesse / influencia: 1 baixo · 2 médio · 3 alto.
create table if not exists public.pj_partes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  nome text not null,
  funcionario_id uuid,
  papel text,
  organizacao text,
  interesse int not null default 2 check (interesse between 1 and 3),
  influencia int not null default 2 check (influencia between 1 and 3),
  expectativas text,
  contato text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_partes_proj on public.pj_partes(projeto_id);

-- EAP: entregas, tarefas e marcos em árvore (pai_id). Cronograma, %,
-- custo previsto, critério de aceite (qualidade) e aceite da entrega.
create table if not exists public.pj_eap (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  pai_id uuid,
  tipo text not null default 'tarefa' check (tipo in ('entrega','tarefa','marco')),
  ordem int not null default 0,
  nome text not null,
  descricao text,
  responsavel text,
  inicio date,
  fim date,
  fim_real date,
  pct int not null default 0 check (pct between 0 and 100),
  custo_previsto numeric not null default 0,
  criterio_aceite text,
  -- dicionário da EAP
  premissas text,
  recursos text,
  referencias text,
  -- rede (CPM/PERT): duração em dias; vazia = pelas datas.
  -- predecessoras = [{id, rel: 'FI'|'II'|'TT'|'IT', lag: dias, dep: 'obrigatoria'|'arbitrada'|'externa'|'interna'}]
  duracao numeric,
  dur_otimista numeric,
  dur_provavel numeric,
  dur_pessimista numeric,
  predecessoras jsonb not null default '[]'::jsonb,
  aceite_situacao text not null default 'pendente' check (aceite_situacao in ('pendente','aceita','recusada')),
  aceite_em date,
  aceite_por text,
  aceite_obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_eap_proj on public.pj_eap(projeto_id);

-- Premissas e restrições (registro do escopo).
create table if not exists public.pj_premissas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  tipo text not null default 'premissa' check (tipo in ('premissa','restricao_projeto','restricao_produto')),
  descricao text not null,
  situacao text not null default 'valida' check (situacao in ('valida','confirmada','falhou')),
  risco_id uuid,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_premissas_proj on public.pj_premissas(projeto_id);

-- Requisitos e rastreabilidade (requisito → entrega da EAP → aceite).
create table if not exists public.pj_requisitos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  codigo text,
  descricao text not null,
  origem text,
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  criterio_aceite text,
  eap_id uuid,
  situacao text not null default 'proposto' check (situacao in ('proposto','aprovado','atendido','excluido')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_requisitos_proj on public.pj_requisitos(projeto_id);

-- Matriz RACI. id = '<eap_id>:<parte_id>'; papel vazio = sem papel.
create table if not exists public.pj_raci (
  id text primary key,
  projeto_id uuid not null references public.pj_projetos(id),
  eap_id uuid not null references public.pj_eap(id),
  parte_id uuid not null references public.pj_partes(id),
  papel text not null default '' check (papel in ('','R','A','C','I')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_raci_proj on public.pj_raci(projeto_id);

-- Riscos (ameaças e oportunidades). probabilidade / impacto: 1 a 5.
create table if not exists public.pj_riscos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  descricao text not null,
  causa text,
  categoria text,
  tipo text not null default 'ameaca' check (tipo in ('ameaca','oportunidade')),
  probabilidade int not null default 3 check (probabilidade between 1 and 5),
  impacto int not null default 3 check (impacto between 1 and 5),
  estrategia text,
  plano text,
  dono text,
  prazo date,
  situacao text not null default 'aberto' check (situacao in ('aberto','tratamento','ocorreu','encerrado')),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_riscos_proj on public.pj_riscos(projeto_id);

-- Plano de comunicação.
create table if not exists public.pj_comunicacao (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  informacao text not null,
  publico text,
  frequencia text,
  meio text,
  responsavel text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_comunicacao_proj on public.pj_comunicacao(projeto_id);

-- Reuniões do projeto (atas curtas).
create table if not exists public.pj_reunioes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  data date not null default current_date,
  titulo text,
  participantes text,
  pauta text,
  decisoes text,
  encaminhamentos text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_reunioes_proj on public.pj_reunioes(projeto_id);

-- Custos realizados (lançamentos), ligados a uma entrega/tarefa ou ao projeto.
create table if not exists public.pj_custos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  eap_id uuid,
  data date not null default current_date,
  descricao text not null,
  fornecedor text,
  documento text,
  valor numeric not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_custos_proj on public.pj_custos(projeto_id);

-- Pedidos de mudança. Aprovada + aplicada = mexeu no prazo/orçamento vigente.
create table if not exists public.pj_mudancas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  numero int,
  data date not null default current_date,
  solicitante text,
  descricao text not null,
  motivo text,
  impacto_prazo_dias int not null default 0,
  impacto_custo numeric not null default 0,
  impacto_escopo text,
  situacao text not null default 'pendente' check (situacao in ('pendente','aprovada','rejeitada')),
  decidido_por text,
  decidido_em date,
  parecer text,
  aplicada boolean not null default false,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_mudancas_proj on public.pj_mudancas(projeto_id);

-- Problemas (desvios) e ações corretivas.
create table if not exists public.pj_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  eap_id uuid,
  data date not null default current_date,
  descricao text not null,
  gravidade text not null default 'media' check (gravidade in ('baixa','media','alta')),
  acao text,
  responsavel text,
  prazo date,
  situacao text not null default 'aberta' check (situacao in ('aberta','resolvida')),
  resolvida_em date,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_ocorrencias_proj on public.pj_ocorrencias(projeto_id);

-- Lições aprendidas.
create table if not exists public.pj_licoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  fase text,
  categoria text,
  tipo text not null default 'melhorar' check (tipo in ('acerto','melhorar')),
  situacao text not null,
  aprendizado text,
  recomendacao text,
  registrado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_licoes_proj on public.pj_licoes(projeto_id);

-- Relatórios de progresso salvos (fotografia do status numa data).
create table if not exists public.pj_status (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pj_projetos(id),
  data date not null default current_date,
  fase text,
  pct_fisico numeric,
  pct_planejado numeric,
  custo_real numeric,
  spi numeric,
  cpi numeric,
  dominios jsonb not null default '{}'::jsonb,
  comentario text,
  proximos_passos text,
  criado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists pj_status_proj on public.pj_status(projeto_id);

-- Carimbo do servidor, RLS e permissões.
do $$ declare t text; begin
  foreach t in array array['pj_projetos','pj_partes','pj_eap','pj_raci','pj_premissas','pj_requisitos','pj_riscos','pj_comunicacao',
    'pj_reunioes','pj_custos','pj_mudancas','pj_ocorrencias','pj_licoes','pj_status'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists pj_ler on public.%I', t);
    execute format('drop policy if exists pj_gravar on public.%I', t);
    execute format('drop policy if exists pj_trocar on public.%I', t);
    execute format('create policy pj_ler on public.%I for select to authenticated using (public.app_pode(''projetos''))', t);
    execute format('create policy pj_gravar on public.%I for insert to authenticated with check (public.app_pode(''projetos''))', t);
    execute format('create policy pj_trocar on public.%I for update to authenticated using (public.app_pode(''projetos'')) with check (public.app_pode(''projetos''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
