-- Custo Base › Conferência de horímetros (09/11/2026, pedido do Guilherme).
-- Veio do HTML "Conferência de Horímetros — SAKUMA": lê o PDF "Operações
-- Mecanizadas Analítico" e mostra, por máquina, onde o Fim de um lançamento
-- não bate com o Início do seguinte. Uma conferência por mês (id 'AAAA-MM').
-- A tarefa mensal do Rastro (dia 10, ir = 'hzConf') fica Em andamento quando
-- o mês tem conferência e Concluída quando não sobra diferença pendente.

create table if not exists public.cb_hor_conf (
  id text primary key check (id ~ '^\d{4}-\d{2}$'),
  arquivos jsonb,                 -- [{name, machines, rows}]
  maquinas jsonb not null,        -- [{machine, rowCount, gaps:[...]}] (diferenças com tolerância 0)
  linhas int not null default 0,
  diferencas int not null default 0,
  corrigidas int not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Marca de cada diferença (corrigida + observação). A chave é a própria
-- diferença (máquina|data|doc|fim|data|doc|início): reimportar o mesmo PDF
-- não perde o que já foi marcado.
create table if not exists public.cb_hor_marcas (
  chave text primary key,
  mes text,
  ok boolean not null default false,
  obs text,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['cb_hor_conf','cb_hor_marcas'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists cb_ler on public.%I', t);
    execute format('drop policy if exists cb_gravar on public.%I', t);
    execute format('drop policy if exists cb_trocar on public.%I', t);
    execute format('create policy cb_ler on public.%I for select to authenticated using (public.app_pode(''custobase''))', t);
    execute format('create policy cb_gravar on public.%I for insert to authenticated with check (public.app_pode(''custobase''))', t);
    execute format('create policy cb_trocar on public.%I for update to authenticated using (public.app_pode(''custobase'')) with check (public.app_pode(''custobase''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Tarefa mensal no Rastro (criada em 09/11/2026).
insert into public.cron_tarefas (titulo, descricao, area, responsavel_id, data, recorrencia, ir, criado_por, privada, dono_email)
select 'Conferência de horímetros',
 'Gerar o PDF "Operações Mecanizadas Analítico" do mês, jogar em Custo Base › Conferência de horímetros e corrigir as diferenças. Fica Em andamento quando o mês tem conferência e Concluída quando não sobra diferença pendente.',
 'custo', 'reu-lincoln', date '2026-11-10', 'mensal', 'hzConf', 'Claude · pedido do Guilherme (09/11/2026)', false, null
where not exists (select 1 from public.cron_tarefas where ir = 'hzConf' and ativo);
