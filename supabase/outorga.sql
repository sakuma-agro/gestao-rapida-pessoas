-- Área Outorga e Irrigação do LOP - Gestão Rápida (12/11/2026).
-- Traz para dentro do LOP o app avulso "Controle de Outorga e Irrigação"
-- (escritoriosakuma1-ui.github.io/outorga), que passa a ser aposentado.
-- As tabelas out_locais, out_controles e out_produtores já existiam (são as
-- do app avulso); aqui ganham ativo/atualizado_em para o núcleo das molduras
-- e passam a ter a regra de acesso do LOP (módulo 'outorga').
-- Novas: out_itens (o que se recolhe todo mês: fichas de outorga e de
-- irrigação) e out_recebidos (o que chegou em cada mês).

do $$
declare t text;
begin
  foreach t in array array['out_locais','out_controles','out_produtores'] loop
    execute format('alter table public.%I add column if not exists ativo boolean not null default true', t);
    execute format('alter table public.%I add column if not exists atualizado_em timestamptz not null default now()', t);
  end loop;
end $$;

-- O que é recolhido todo mês (um item do checklist "Recolhimento" do Rastro)
create table if not exists public.out_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                                   -- 'Outorga - Faz. Faca B1', 'Irrigação Faca (G8)'
  tipo text not null default 'outorga' check (tipo in ('outorga','irrigacao')),
  local_id uuid references public.out_locais(id),
  controle_id uuid references public.out_controles(id), -- ficha de outorga ligada (opcional)
  produtor text,                                        -- irrigação: G8, SAKUMA…
  ordem int not null default 0,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Recebido no mês: id 'AAAA-MM:<item_id>' (mês da ficha, não do recolhimento)
create table if not exists public.out_recebidos (
  id text primary key,
  mes text not null,
  item_id uuid not null references public.out_itens(id),
  recebido boolean not null default false,
  recebido_em timestamptz,
  recebido_por text,
  obs text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists out_recebidos_mes on public.out_recebidos(mes);

do $$
declare t text;
begin
  foreach t in array array['out_locais','out_controles','out_produtores','out_itens','out_recebidos'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_trigger where tgname='marcar_atualizacao' and tgrelid=('public.'||t)::regclass) then
      execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    end if;
    execute format('drop policy if exists logados_acessam on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso_livre', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='out_ler') then
      execute format('create policy out_ler on public.%I for select to authenticated using (public.app_pode(''outorga''))', t);
      execute format('create policy out_gravar on public.%I for insert to authenticated with check (public.app_pode(''outorga''))', t);
      execute format('create policy out_trocar on public.%I for update to authenticated using (public.app_pode(''outorga'')) with check (public.app_pode(''outorga''))', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Itens iniciais: os 15 do checklist "Recolhimento" do Rastro (Vinícius, Semana 1).
-- Só liga a ficha de outorga quando o ponto é o mesmo sem dúvida; o resto se
-- liga no cadastro da área.
insert into public.out_itens (nome, tipo, local_id, controle_id, produtor, ordem)
select v.nome, v.tipo,
  (select id from public.out_locais where nome = v.local),
  (select c.id from public.out_controles c join public.out_locais l on l.id = c.local_id where l.nome = v.local and c.nav_label = v.ponto),
  v.produtor, v.ordem
from (values
  ('Outorga - Lote 35',                                   'outorga',   'Lote 35 Padap',     'Principal',           null,     1),
  ('Outorga - Faz. Faca B1',                              'outorga',   'Faz. Faca',         'Bomba D''Água Nº 1',  null,     2),
  ('Outorga - Faz. Faca B2',                              'outorga',   'Faz. Faca',         'Bomba D''Água Nº 2',  null,     3),
  ('Outorga - Faz. Faca poço',                            'outorga',   'Faz. Faca',         null,                  null,     4),
  ('Outorga - Faz. Morro Branco',                         'outorga',   'Faz. Morro Branco', 'Principal',           null,     5),
  ('Outorga - Faz. Três Riachos bomba',                   'outorga',   'Faz. Três Riachos', null,                  null,     6),
  ('Outorga - Faz. Três Riachos poço - bomba horímetro',  'outorga',   'Faz. Três Riachos', null,                  null,     7),
  ('Outorga - Faz. Três Riachos poço hidrômetro',         'outorga',   'Faz. Três Riachos', null,                  null,     8),
  ('Outorga - Faz. Três Riachos - hidrômetro',            'outorga',   'Faz. Três Riachos', null,                  null,     9),
  ('Irrigação Lote 35',                                   'irrigacao', 'Lote 35 Padap',     null,                  'SAKUMA', 10),
  ('Irrigação Faca (SK)',                                 'irrigacao', 'Faz. Faca',         null,                  'SAKUMA', 11),
  ('Irrigação Faca (G8)',                                 'irrigacao', 'Faz. Faca',         null,                  'G8',     12),
  ('Irrigação Morro Branco (SK)',                         'irrigacao', 'Faz. Morro Branco', null,                  'SAKUMA', 13),
  ('Irrigação Morro Branco (G8)',                         'irrigacao', 'Faz. Morro Branco', null,                  'G8',     14),
  ('Irrigação Três Riachos',                              'irrigacao', 'Faz. Três Riachos', null,                  'SAKUMA', 15)
) as v(nome, tipo, local, ponto, produtor, ordem)
where not exists (select 1 from public.out_itens);
