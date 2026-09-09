-- =====================================================================
--  Ficha de EPI · SAKUMA Agronegócios
--  Rode este arquivo inteiro em: Supabase → SQL Editor → New query → Run
--  Pode rodar de novo sem problema: nada é apagado.
-- =====================================================================

-- ---------- funcionários ----------
create table if not exists public.funcionarios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cadastro     text,
  admissao     date,
  cargo        text,
  empregador   text,
  cpf          text,
  setor        text default 'CAMPO',
  tam_calcado  text,
  tam_camisa   text,
  situacao     text not null default 'ATIVO',
  nascimento   date,
  telefone     text,
  apelido      text,
  fazenda      text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists funcionarios_nome_idx on public.funcionarios (nome);

-- campos usados pelos aniversariantes e pela importação da planilha,
-- para bancos criados antes
alter table public.funcionarios
  add column if not exists nascimento date,
  add column if not exists telefone   text,
  add column if not exists apelido    text,
  add column if not exists fazenda    text;
create index if not exists funcionarios_nascimento_idx on public.funcionarios (nascimento);

-- ---------- catálogo de EPIs ----------
create table if not exists public.epis (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  ca          text,
  observacao  text,
  atividade   text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- fichas preenchidas ----------
create table if not exists public.fichas (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  mes             smallint not null,
  ano             smallint not null,
  setor           text,
  linhas          jsonb not null default '[]'::jsonb,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists fichas_func_idx on public.fichas (funcionario_id, ano, mes);

-- ---------- modelo da ficha (uma linha só) ----------
create table if not exists public.modelo (
  id                 smallint primary key default 1 check (id = 1),
  titulo             text,
  rotulo_faz         text,
  rotulo_mer         text,
  legenda_faz        jsonb default '[]'::jsonb,
  legenda_mer        jsonb default '[]'::jsonb,
  declaracao_titulo  text,
  declaracoes        jsonb default '[]'::jsonb,
  declaracao_longa   text,
  rodape_demissao    text,
  setor_padrao       text default 'CAMPO',
  linhas_padrao      smallint default 20,
  cargos             jsonb default '[]'::jsonb,
  empregadores       jsonb default '[]'::jsonb,
  lista              jsonb default '{}'::jsonb,
  atualizado_em      timestamptz not null default now()
);

-- cabeçalho da lista de presença (FORMAGR-018), para bancos criados antes
alter table public.modelo add column if not exists lista jsonb default '{}'::jsonb;

-- ---------- carimbo de atualização ----------
create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists tg_func_upd on public.funcionarios;
create trigger tg_func_upd before update on public.funcionarios
  for each row execute function public.marcar_atualizacao();

drop trigger if exists tg_fichas_upd on public.fichas;
create trigger tg_fichas_upd before update on public.fichas
  for each row execute function public.marcar_atualizacao();

drop trigger if exists tg_modelo_upd on public.modelo;
create trigger tg_modelo_upd before update on public.modelo
  for each row execute function public.marcar_atualizacao();

-- =====================================================================
--  SEGURANÇA
--  Só quem estiver logado (usuário criado por você no Supabase) enxerga
--  ou altera qualquer coisa. Visitante anônimo não lê nada.
-- =====================================================================
alter table public.funcionarios enable row level security;
alter table public.epis         enable row level security;
alter table public.fichas       enable row level security;
alter table public.modelo       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['funcionarios','epis','fichas','modelo'] loop
    execute format('drop policy if exists "logados_leem" on public.%I', t);
    execute format('drop policy if exists "logados_escrevem" on public.%I', t);
    execute format(
      'create policy "logados_leem" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "logados_escrevem" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- =====================================================================
--  DEPOIS DE RODAR ISTO:
--  1) Authentication → Providers → Email: deixe ligado e DESLIGUE
--     "Confirm email" (senão o usuário precisa confirmar por e-mail).
--  2) Authentication → Users → "Add user" → crie os 2 usuários
--     com e-mail e senha. Só eles conseguem entrar no app.
--  3) Abra o app, cole a URL e a chave anon, faça login: os 51
--     funcionários e os 26 EPIs da planilha entram sozinhos na
--     primeira vez.
-- =====================================================================

-- =====================================================================
--  MÓDULO DISC — perfil comportamental (acesso restrito)
--  As tabelas disc_* só respondem para quem estiver em disc_acesso.
--  Os funcionários vêm da tabela funcionarios já existente.
-- =====================================================================
create table if not exists public.disc_perfis (
  codigo text primary key check (codigo in ('D','I','S','C')),
  nome text not null, cor text not null,
  resumo text, comportamentos text, pontos_fortes text, pontos_atencao text,
  comunicacao text, motivadores text, desmotivadores text,
  ambiente_ideal text, como_delegar text,
  ordem int not null default 0,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.disc_combinacoes (
  principal text not null references public.disc_perfis(codigo) on delete cascade,
  secundario text not null references public.disc_perfis(codigo) on delete cascade,
  titulo text, texto text,
  atualizado_em timestamptz not null default now(),
  primary key (principal, secundario),
  check (principal <> secundario)
);

create table if not exists public.disc_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data_teste date not null default current_date,
  origem text not null default 'notas' check (origem in ('notas','marcacoes','totais')),
  total_d numeric(5,1) not null default 0, total_i numeric(5,1) not null default 0,
  total_s numeric(5,1) not null default 0, total_c numeric(5,1) not null default 0,
  perfil_principal text references public.disc_perfis(codigo),
  perfil_secundario text references public.disc_perfis(codigo),
  empate boolean not null default false,
  intensidade text, observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (funcionario_id, data_teste)
);
create index if not exists disc_avaliacoes_func_idx
  on public.disc_avaliacoes (funcionario_id, data_teste desc);

create table if not exists public.disc_marcacoes (
  avaliacao_id uuid not null references public.disc_avaliacoes(id) on delete cascade,
  linha smallint not null check (linha between 1 and 10),
  coluna text not null check (coluna in ('D','I','S','C')),
  valor smallint not null default 1 check (valor between 1 and 4),
  primary key (avaliacao_id, linha, coluna)
);

create table if not exists public.disc_cargos_esperado (
  cargo text primary key,
  perfil_esperado text references public.disc_perfis(codigo),
  perfil_secundario_esperado text references public.disc_perfis(codigo),
  observacao text,
  atualizado_em timestamptz not null default now()
);

create or replace function public.disc_autorizado()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_pode('rh');
$$;

do $$
declare t text;
begin
  foreach t in array array['disc_perfis','disc_combinacoes','disc_avaliacoes',
                           'disc_marcacoes','disc_cargos_esperado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists disc_only on public.%I', t);
    execute format('create policy disc_only on public.%I for all to authenticated
      using (public.disc_autorizado()) with check (public.disc_autorizado())', t);
  end loop;
end $$;

-- =====================================================================
--  QUEM ENTRA E O QUE CADA UM ENXERGA
--  A aba Configurações do app edita esta tabela.
-- =====================================================================
create table if not exists public.app_usuarios (
  email text primary key,
  nome text,
  admin boolean not null default false,
  modulos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.app_usuarios enable row level security;

create or replace function public.app_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email',''));
$$;

create or replace function public.app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_usuarios
    where lower(email) = public.app_email() and admin);
$$;

create or replace function public.app_pode(modulo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_usuarios
    where lower(email) = public.app_email()
      and (admin or modulo = any(modulos)));
$$;

-- módulos do app:
--   pessoas      = cadastro de funcionários + aniversariantes
--   epis         = fichas + tipos de EPI + modelo da ficha
--   certificacao = lista de presença
--   rh           = DISC
insert into public.app_usuarios (email, nome, admin, modulos) values
  ('escritoriosakuma@hotmail.com','Guilherme Lopes', true,
   array['pessoas','epis','certificacao','rh']),
  ('escritoriosakuma4@hotmail.com','Escritório', false,
   array['pessoas','epis','certificacao'])
on conflict (email) do nothing;

drop policy if exists app_usuarios_ler on public.app_usuarios;
create policy app_usuarios_ler on public.app_usuarios for select to authenticated
  using (lower(email) = public.app_email() or public.app_admin());

drop policy if exists app_usuarios_admin on public.app_usuarios;
create policy app_usuarios_admin on public.app_usuarios for all to authenticated
  using (public.app_admin()) with check (public.app_admin());
