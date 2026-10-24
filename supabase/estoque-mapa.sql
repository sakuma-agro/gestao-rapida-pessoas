-- Estoque › Mapa do barracão (21/10/2026, pedido do Guilherme).
-- Na contagem dos fertilizantes, quem conta marca em qual quadra está cada
-- produto e quantos bags tem ali. O app desenha o mapa do barracão com a
-- ocupação de cada quadra. Layout aprovado do barracão do Lote 35 PADAP.
create table if not exists public.est_mapas (
  id text primary key,                         -- = local_id (um mapa por estoque)
  local_id uuid not null unique references public.est_locais(id),
  nome text,
  layout jsonb not null,                       -- quadras, áreas reservadas, pilares, medidas
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.est_contagem_quadras (
  id text primary key,                         -- contagem_id:item_id:quadra
  contagem_id text not null references public.est_contagens(id) on delete cascade,
  item_id uuid not null references public.est_itens(id),
  quadra text not null,                        -- código da quadra (A1, B3...)
  bags numeric,
  contado_por text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists est_cq_contagem on public.est_contagem_quadras(contagem_id);

do $$ declare t text; begin
  foreach t in array array['est_mapas','est_contagem_quadras'] loop
    execute format('drop trigger if exists marcar_atualizacao on public.%I', t);
    execute format('create trigger marcar_atualizacao before insert or update on public.%I for each row execute function public.marcar_atualizacao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists est_ler on public.%I', t);
    execute format('drop policy if exists est_gravar on public.%I', t);
    execute format('drop policy if exists est_trocar on public.%I', t);
    execute format('create policy est_ler on public.%I for select to authenticated using (public.app_pode(''estoque''))', t);
    execute format('create policy est_gravar on public.%I for insert to authenticated with check (public.app_pode(''estoque''))', t);
    execute format('create policy est_trocar on public.%I for update to authenticated using (public.app_pode(''estoque'')) with check (public.app_pode(''estoque''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- Barracão de fertilizantes do Lote 35 PADAP (layout v4 de 23/10/2026: paredão em U, 3 bags de largura na fileira A e 4 na B,
-- A numerada a partir dos fundos, A5 fecha o U ao lado das colheitadeiras, passagens de 0,5 m nas paredes (NR-11), 381 bags).
insert into public.est_mapas (id, local_id, nome, layout)
select l.id::text, l.id, 'Barracão de fertilizantes', '{"areas":[{"l":36.2,"p":7.7,"x":0,"y":0,"obs":"JD 5090, 5080, 6125 e NH TT3880","nome":"Meia-água · tratores","tipo":"reservada"},{"l":36.2,"p":4.4,"x":0,"y":25.1,"obs":"Plantadeiras Jumil e colhedora de batata","nome":"Meia-água · implementos","tipo":"reservada"},{"nome":"Livre · sem adubo","tipo":"reservada","x":0,"y":7.8,"l":11.566,"p":5.2},{"nome":"Colheitadeiras","tipo":"reservada","x":0,"y":13,"l":11.566,"p":8.9,"obs":"John Deere STS e Jacto K3 · entram de frente"},{"nome":"Oficina","tipo":"reservada","x":0,"y":21.9,"l":11.566,"p":3.2},{"nome":"Passagem 0,5 m (NR-11)","tipo":"reservada","x":11.566,"y":7.8,"l":24.134,"p":0.5},{"nome":"Corredor","tipo":"corredor","x":15.166,"y":11.9,"l":21.034,"p":6.0},{"nome":"Faixa livre · sem adubo","tipo":"reservada","x":11.566,"y":22.7,"l":24.634,"p":2.4},{"nome":"","tipo":"reservada","x":35.7,"y":8.3,"l":0.5,"p":3.6},{"nome":"","tipo":"reservada","x":35.7,"y":17.9,"l":0.5,"p":4.8}],"folga":0.6,"muros":[7.7,25.1],"frente":"esquerda","versao":4,"largura":29.5,"pilares":[[0,7.7],[0,25.1],[6.033,7.7],[6.033,25.1],[12.066,7.7],[12.066,25.1],[18.099,7.7],[18.099,25.1],[24.132,7.7],[24.132,25.1],[30.165,7.7],[30.165,25.1],[36.198,7.7],[36.198,25.1],[6.033,13],[6.033,21.9],[12.066,13],[12.066,21.9],[18.099,13],[18.099,21.9],[24.132,13],[24.132,21.9],[30.165,13],[30.165,21.9],[36.198,13],[36.198,21.9]],"quadras":[{"codigo":"A1","fileira":"A","x":29.665,"y":8.3,"l":6.033,"p":3.6},{"codigo":"A2","fileira":"A","x":23.632,"y":8.3,"l":6.033,"p":3.6},{"codigo":"A3","fileira":"A","x":17.599,"y":8.3,"l":6.033,"p":3.6},{"codigo":"A4","fileira":"A","x":11.566,"y":8.3,"l":6.033,"p":3.6},{"codigo":"A5","fileira":"A","x":11.566,"y":11.9,"l":3.6,"p":6.0,"capacidade":45},{"codigo":"B1","fileira":"B","x":11.566,"y":17.9,"l":6.033,"p":4.8},{"codigo":"B2","fileira":"B","x":17.599,"y":17.9,"l":6.033,"p":4.8},{"codigo":"B3","fileira":"B","x":23.632,"y":17.9,"l":6.033,"p":4.8},{"codigo":"B4","fileira":"B","x":29.665,"y":17.9,"l":6.033,"p":4.8}],"medida_bag":1.2,"comprimento":36.2,"peso_bag_kg":1000,"altura_pilha":3}'::jsonb
from public.est_locais l where l.nome = 'Lote 35 PADAP'
on conflict (id) do nothing;
