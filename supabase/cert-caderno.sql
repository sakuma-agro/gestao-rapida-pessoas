-- cert-caderno.sql — Caderno de Campo (Certificação › Caderno de campo), 19/10/2026.
-- Registros de campo por plantio para a auditoria GLOBALG.A.P. IFA v6 (e o que
-- coincide em GRASP, Rainforest e SMETA). Rastreabilidade por lote NÃO mora
-- aqui (vai ser outro app); o caderno só amarra cada registro ao plantio.
--
-- Pode rodar de novo sem estragar nada. Permissão: módulo 'cert' (ou admin).
-- Aplicado no Supabase como migração "cert_caderno_campo".
--
-- Tabelas (todas prefixo cc_):
--  · cc_plantios          — o plantio/safra (talhão + cultura + data); tudo pendura nele
--  · cc_insumos           — defensivos, fertilizantes, corretivos (nº MAPA, carência, reentrada, dose máx.)
--  · cc_analises          — laudos de água/solo/resíduos com vencimento
--  · cc_calibracoes       — calibração dos pulverizadores (equipamento vem de manutencao.equipamentos)
--  · cc_registros         — o lançamento de campo (aplicação, adubação, irrigação, MIP, operação, colheita, higiene, ocorrência)
--  · cc_registro_versoes  — versão anterior de todo registro aprovado que foi retificado
--  · cc_config            — responsável técnico (nome, CREA) e outros ajustes
-- RPC:
--  · cc_referencias()     — talhões, culturas, fazendas, pulverizadores e aplicadores (com NR-31 e ASO
--                           vigentes), lidos com security definer porque um login só de Certificação
--                           não enxerga programacao.* / manutencao.* / sst_* pela RLS.

create extension if not exists pgcrypto;

create table if not exists public.cc_plantios (
  id uuid primary key default gen_random_uuid(),
  codigo text,                         -- ex.: CEN-25/26-P1L35 (livre)
  local_id uuid,                       -- programacao.locais.id (quando escolhido da lista)
  local text not null,                 -- nome do talhão/pivô como está no cadastro
  fazenda text,
  cultura text not null,
  variedade text,
  origem_semente text,                 -- fornecedor / origem da semente ou muda
  lote_semente text,
  data_plantio date not null,
  area_ha numeric(10,2),
  densidade text,                      -- plantas/ha, kg/ha, espaçamento…
  previsao_colheita date,
  status text not null default 'Em campo' check (status in ('Planejado','Em campo','Colhido','Encerrado')),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cc_plantios_status on public.cc_plantios(status, data_plantio desc);

create table if not exists public.cc_insumos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'Defensivo' check (tipo in ('Defensivo','Biológico','Adjuvante','Fertilizante','Corretivo')),
  nome text not null,                  -- nome comercial
  ingrediente_ativo text,
  registro_mapa text,
  classe_tox text,                     -- I a V (defensivo)
  classe_amb text,                     -- I a IV
  grupo_quimico text,
  formula text,                        -- fertilizante: 04-14-08 etc.
  carencia_dias int,                   -- padrão, dias
  carencias jsonb not null default '{}'::jsonb,   -- {"Cenoura": 14, "Batata": 7} — vale sobre o padrão
  reentrada_horas numeric(6,1),        -- REI em horas (24 = um dia)
  dose_max numeric(12,3),
  dose_unidade text,                   -- L/ha, kg/ha, mL/100L…
  max_aplicacoes int,                  -- por ciclo
  culturas text[] not null default '{}',          -- culturas autorizadas (vazio = sem restrição cadastrada)
  fornecedor text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cc_insumos_nome on public.cc_insumos(tipo, nome);

create table if not exists public.cc_analises (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('Água de irrigação','Água de lavagem','Água potável','Solo','Resíduos no produto','Folha','Outra')),
  ponto text not null,                 -- poço, pivô 1, bebedouro da sede…
  fazenda text,
  data date not null,
  vence date,
  laboratorio text,
  resultado text not null default 'Conforme' check (resultado in ('Conforme','Não conforme','Aguardando')),
  link text,                           -- laudo no OneDrive (o anexo vai para o Drive por arquivos)
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cc_analises_vence on public.cc_analises(vence);

create table if not exists public.cc_calibracoes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid,                 -- manutencao.equipamentos.id
  equipamento text not null,           -- "P.01 · Pulverizador Arbus 4000"
  data date not null,
  responsavel text,
  resultado text not null default 'Aprovado' check (resultado in ('Aprovado','Reprovado')),
  proxima date,
  bicos text,
  vazao text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cc_calibracoes_eq on public.cc_calibracoes(equipamento_id, data desc);

create table if not exists public.cc_registros (
  id uuid primary key default gen_random_uuid(),
  plantio_id uuid not null references public.cc_plantios(id),
  tipo text not null check (tipo in ('aplicacao','adubacao','irrigacao','monitoramento','operacao','colheita','higiene','ocorrencia')),
  data date not null,
  hora_inicio time,
  hora_fim time,
  responsavel text,                    -- quem executou (aplicador, operador, equipe)
  dados jsonb not null default '{}'::jsonb,       -- campos próprios de cada tipo (ver js/cert-caderno.js)
  lat numeric(9,6),
  lng numeric(9,6),
  situacao text not null default 'Lançado' check (situacao in ('Lançado','Aprovado','Cancelado')),
  aprovado_por text,
  aprovado_em timestamptz,
  assinado_por text,                   -- responsável técnico que assinou (nome · CREA)
  assinado_em timestamptz,
  liberado_reentrada timestamptz,      -- só aplicação: fim do REI
  liberado_colheita date,              -- só aplicação: fim da carência
  motivo_retificacao text,             -- obrigatório ao alterar registro aprovado
  versao int not null default 1,
  criado_em timestamptz not null default now(),
  criado_por text default public.app_email(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists cc_registros_plantio on public.cc_registros(plantio_id, data);
create index if not exists cc_registros_tipo on public.cc_registros(tipo, data desc);

create table if not exists public.cc_registro_versoes (
  id bigint generated by default as identity primary key,
  registro_id uuid not null references public.cc_registros(id) on delete cascade,
  versao int not null,
  conteudo jsonb not null,             -- a linha inteira como estava
  motivo text,
  alterado_por text default public.app_email(),
  alterado_em timestamptz not null default now()
);
create index if not exists cc_versoes_reg on public.cc_registro_versoes(registro_id, versao);

create table if not exists public.cc_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.cc_config (chave, valor) values ('tecnico', '{"nome": "", "crea": ""}'::jsonb) on conflict (chave) do nothing;

-- carimbo de atualização + quem alterou
create or replace function public.cc_carimbar()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  begin new.atualizado_por = public.app_email(); exception when others then null; end;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['cc_plantios','cc_registros'] loop
    execute format('drop trigger if exists cc_carimbo on public.%I', t);
    execute format('create trigger cc_carimbo before update on public.%I for each row execute function public.cc_carimbar()', t);
  end loop;
  foreach t in array array['cc_insumos','cc_analises','cc_calibracoes','cc_config'] loop
    execute format('drop trigger if exists cc_carimbo on public.%I', t);
    execute format('create trigger cc_carimbo before update on public.%I for each row execute function public.marcar_atualizacao()', t);
  end loop;
end $$;

-- Registro aprovado não some nem muda em silêncio: toda alteração de um
-- registro já aprovado exige motivo e guarda a versão anterior.
create or replace function public.cc_guardar_versao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.situacao = 'Aprovado' and (old.dados is distinct from new.dados or old.data is distinct from new.data
      or old.responsavel is distinct from new.responsavel or old.plantio_id is distinct from new.plantio_id
      or old.hora_inicio is distinct from new.hora_inicio or old.hora_fim is distinct from new.hora_fim
      or new.situacao = 'Cancelado') then
    if coalesce(new.motivo_retificacao, '') = '' then
      raise exception 'Registro aprovado: informe o motivo da retificação.' using errcode = 'P0001';
    end if;
    insert into public.cc_registro_versoes (registro_id, versao, conteudo, motivo)
      values (old.id, old.versao, to_jsonb(old), new.motivo_retificacao);
    new.versao = old.versao + 1;
  end if;
  return new;
end $$;
drop trigger if exists cc_versao on public.cc_registros;
create trigger cc_versao before update on public.cc_registros for each row execute function public.cc_guardar_versao();

-- RLS: módulo 'cert'. Apagar só o que ainda não foi aprovado.
do $$ declare t text; begin
  foreach t in array array['cc_plantios','cc_insumos','cc_analises','cc_calibracoes','cc_registros','cc_registro_versoes','cc_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cc_leem on public.%I', t);
    execute format('drop policy if exists cc_inserem on public.%I', t);
    execute format('drop policy if exists cc_alteram on public.%I', t);
    execute format('drop policy if exists cc_apagam on public.%I', t);
    execute format('create policy cc_leem on public.%I for select to authenticated using (public.app_pode(''cert''))', t);
    execute format('create policy cc_inserem on public.%I for insert to authenticated with check (public.app_pode(''cert''))', t);
    execute format('create policy cc_alteram on public.%I for update to authenticated using (public.app_pode(''cert'')) with check (public.app_pode(''cert''))', t);
  end loop;
end $$;
create policy cc_apagam on public.cc_plantios for delete to authenticated using (public.app_pode('cert') and not exists (select 1 from public.cc_registros r where r.plantio_id = cc_plantios.id));
create policy cc_apagam on public.cc_insumos for delete to authenticated using (public.app_pode('cert'));
create policy cc_apagam on public.cc_analises for delete to authenticated using (public.app_pode('cert'));
create policy cc_apagam on public.cc_calibracoes for delete to authenticated using (public.app_pode('cert'));
create policy cc_apagam on public.cc_registros for delete to authenticated using (public.app_pode('cert') and situacao <> 'Aprovado');
grant usage on sequence public.cc_registro_versoes_id_seq to authenticated;

-- Anexos do caderno (fotos, receituário, laudo, nota da embalagem) vão para o
-- Drive em certificacao/caderno/<id do registro ou análise>.
alter table public.arquivos drop constraint if exists arquivos_tipo_check;
alter table public.arquivos add constraint arquivos_tipo_check check (tipo in
  ('funcionario','treinamento','exame','os','checklist','documento','maquina','patrimonio','diario','atividade','reuniao','caderno'));
create or replace function public.arquivo_pode(p_area text, p_tipo text, p_escrever boolean default false)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_area = 'pessoas' and p_tipo = 'funcionario' then
      case when p_escrever then public.app_pode_algum('{pessoas,rh}'::text[])
           else exists (select 1 from public.app_usuarios where lower(email) = public.app_email()) end
    when p_area = 'pessoas' and p_tipo in ('treinamento','exame') then
      public.app_pode_algum('{sst,epis}'::text[]) or (not p_escrever and public.app_pode_algum('{pessoas,rh}'::text[]))
    when p_area = 'certificacao' and p_tipo in ('documento','caderno') then public.app_pode_algum('{cert,certificacao}'::text[])
    when p_area = 'manutencoes' and p_tipo in ('os','checklist','maquina','patrimonio') then public.app_pode('manutencoes')
    when p_area = 'programacao' and p_tipo in ('diario','atividade','reuniao') then public.app_pode('programacao')
    else false end;
$$;

-- Referências que o caderno consome de outras áreas. Security definer porque
-- quem tem só 'cert' não passa pela RLS de programacao/manutencao/sst.
create or replace function public.cc_referencias()
returns jsonb language plpgsql stable security definer set search_path = public, programacao, manutencao as $$
declare r jsonb;
begin
  if not public.app_pode('cert') then raise exception 'sem acesso ao módulo Certificação' using errcode = '42501'; end if;
  select jsonb_build_object(
    'talhoes', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'fazenda', f.nome, 'cultura', c.nome) order by f.nome, l.ordem, l.nome)
                 from programacao.locais l left join manutencao.locais f on f.id = l.fazenda_id left join programacao.culturas c on c.id = l.cultura_id
                 where l.ativo), '[]'::jsonb),
    'culturas', coalesce((select jsonb_agg(nome order by nome) from programacao.culturas where ativo), '[]'::jsonb),
    'fazendas', coalesce((select jsonb_agg(nome order by nome) from manutencao.locais where ativo and codigo <> 'ADEFINIR'), '[]'::jsonb),
    'equipamentos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'codigo', e.codigo, 'descricao', e.descricao, 'tipo', t.nome) order by e.codigo)
                 from manutencao.equipamentos e join manutencao.tipos_equipamento t on t.id = e.tipo_equipamento_id
                 where e.ativo and (t.nome ilike '%pulveriz%' or e.descricao ilike '%pulveriz%' or e.descricao ilike '%atomiz%' or t.nome = 'Trator')), '[]'::jsonb),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', p.id, 'nome', p.nome, 'cargo', p.cargo, 'fazenda', p.fazenda,
                   'nr31_vence', (select max(tr.vence) from public.sst_treinamentos tr join public.sst_tipos_treinamento tt on tt.id = tr.tipo_id
                                  where tr.funcionario_id = p.id and (tt.nome ilike '%defensivo%' or tt.nome ilike '%agrot%' or tt.nome ilike '%agroquím%')),
                   'aso_vence', (select max(ex.vence) from public.sst_exames ex join public.sst_tipos_exame te on te.id = ex.tipo_id
                                  where ex.funcionario_id = p.id and te.categoria = 'aso')
                 ) order by p.nome)
                 from public.funcionarios p where upper(coalesce(p.situacao, 'ATIVO')) not in ('INATIVO','DESLIGADO','DEMITIDO')), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.cc_referencias() to authenticated;
