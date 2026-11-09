-- Custo Base › Controle de irrigação (09/11/2026, pedido do Guilherme).
-- Substitui a planilha "Custo Irrigação": um acerto por fazenda e mês (como
-- cada aba da planilha), com as contas da fatura CEMIG, os lançamentos
-- (data, hora que ligou/desligou, plantio, produtor), o acerto por produtor
-- e o resumo por plantio com "Lançado Agro". Rodar uma vez; só cria o que falta.

-- Parâmetros de cada fazenda: produtores do acerto, e-mail e mensagem do envio.
create table if not exists public.cb_irr_fazendas (
  id text primary key,
  produtores jsonb not null default '["Sakuma","G8"]',
  email text,
  anexo text default 'Faturas CEMIG em PDF',
  mensagem text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Um acerto por fazenda e mês. id = 'AAAA-MM:<fazenda>'.
-- contas: [{nome, valor}] · linhas: [{id, data, liga, desliga, plantio, produtor}]
-- lancado_agro: {plantio: true}
create table if not exists public.cb_irr_acertos (
  id text primary key,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  fazenda text not null,
  contas jsonb not null default '[{"nome":"Conta 1","valor":null},{"nome":"Conta 2","valor":null}]',
  linhas jsonb not null default '[]',
  lancado_agro jsonb not null default '{}',
  enviado_em timestamptz,
  enviado_por text,
  obs text,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists cb_irr_acertos_mes on public.cb_irr_acertos(mes);

do $$ declare t text; begin
  foreach t in array array['cb_irr_fazendas','cb_irr_acertos'] loop
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

insert into public.cb_irr_fazendas (id, email, mensagem) values
 ('Fazenda Faca', 'contasapagargleba@g8agricola.com.br', E'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.'),
 ('Lote 35 PADAP', null, E'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.'),
 ('Fazenda Morro Branco', null, E'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.'),
 ('Fazenda Três Riachos', null, E'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.'),
 ('Fazenda Quebra Cocão', null, E'Por favor, após a efetivação do pagamento, peço que me retornem este e-mail com o respectivo comprovante para confirmação.\n\nObrigado.')
on conflict (id) do nothing;

-- Importação: aba "SETEMBRO 2026" da planilha (Fazenda Faca).
insert into public.cb_irr_acertos (id, mes, fazenda, contas, linhas, atualizado_por) values
 ('2026-09:Fazenda Faca', '2026-09', 'Fazenda Faca',
  '[{"nome":"Conta 1","valor":11762.17},{"nome":"Conta 2","valor":23895.36}]',
  '[{"id": "l01", "data": "2026-09-03", "liga": "13:09", "desliga": "00:50", "plantio": "ALHO - PL32", "produtor": "G8"}, {"id": "l02", "data": "2026-09-06", "liga": "07:00", "desliga": "15:00", "plantio": "ABACATE - T1", "produtor": "Sakuma"}, {"id": "l03", "data": "2026-09-09", "liga": "07:00", "desliga": "16:00", "plantio": "PIVO 5 - MILHO", "produtor": "Sakuma"}, {"id": "l04", "data": "2026-09-12", "liga": "07:00", "desliga": "11:00", "plantio": "PIVO 3 - MILHETO", "produtor": "Sakuma"}, {"id": "l05", "data": "2026-09-13", "liga": "07:00", "desliga": "14:00", "plantio": "PIVO 5 - MILHO", "produtor": "Sakuma"}, {"id": "l06", "data": "2026-09-18", "liga": "07:00", "desliga": "18:00", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}, {"id": "l07", "data": "2026-09-18", "liga": "18:00", "desliga": "21:20", "plantio": "PIVO 5 - MILHO", "produtor": "Sakuma"}, {"id": "l08", "data": "2026-09-19", "liga": "12:00", "desliga": "18:00", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}, {"id": "l09", "data": "2026-09-19", "liga": "20:00", "desliga": "11:00", "plantio": "PIVO 4 - MILHO", "produtor": "Sakuma"}, {"id": "l10", "data": "2026-09-20", "liga": "16:00", "desliga": "20:05", "plantio": "PIVO 5 - MILHO", "produtor": "Sakuma"}, {"id": "l11", "data": "2026-09-21", "liga": "14:20", "desliga": "20:05", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}, {"id": "l12", "data": "2026-09-22", "liga": "14:00", "desliga": "07:10", "plantio": "PIVO 1 - MILHO", "produtor": "Sakuma"}, {"id": "l13", "data": "2026-09-23", "liga": "14:00", "desliga": "13:00", "plantio": "PIVO 1 - MILHO", "produtor": "Sakuma"}, {"id": "l14", "data": "2026-09-24", "liga": "17:00", "desliga": "23:40", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}, {"id": "l15", "data": "2026-09-25", "liga": "14:00", "desliga": "00:55", "plantio": "PIVO 4 - MILHO", "produtor": "Sakuma"}, {"id": "l16", "data": "2026-09-26", "liga": "01:40", "desliga": "08:30", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}, {"id": "l17", "data": "2026-09-28", "liga": "12:00", "desliga": "01:30", "plantio": "PIVO 1 - MILHO", "produtor": "Sakuma"}, {"id": "l18", "data": "2026-09-29", "liga": "02:00", "desliga": "10:30", "plantio": "PIVO 5 - MILHO", "produtor": "Sakuma"}, {"id": "l19", "data": "2026-09-30", "liga": "12:00", "desliga": "23:47", "plantio": "PIVO 3 - MILHO", "produtor": "Sakuma"}]', 'Importado da planilha Custo Irrigação')
on conflict (id) do nothing;
