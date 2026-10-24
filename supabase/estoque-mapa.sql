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

-- Barracão de fertilizantes do Lote 35 PADAP (layout v5 de 24/10/2026: 7 vãos de 4,85 m medidos com trena = 33,95 m;
-- A1–A4 e B1–B4 nos vãos 7→4, coluna A6/A5/B5 no vão 3, colheitadeiras nos vãos 1–2, passagens de 0,5 m (NR-11), 411 bags).
insert into public.est_mapas (id, local_id, nome, layout)
select l.id::text, l.id, 'Barracão de fertilizantes', '{"areas":[{"nome":"Meia-água · tratores","tipo":"reservada","x":0,"y":0,"l":33.95,"p":7.7,"obs":"JD 5090, 5080, 6125 e NH TT3880"},{"nome":"Meia-água · implementos","tipo":"reservada","x":0,"y":25.1,"l":33.95,"p":4.4,"obs":"Plantadeiras Jumil e colhedora de batata"},{"nome":"Livre · sem adubo","tipo":"reservada","x":0,"y":7.8,"l":9.7,"p":4.1},{"nome":"Colheitadeiras","tipo":"reservada","x":0,"y":13,"l":9.7,"p":8.9,"obs":"John Deere STS e Jacto K3 · entram de frente"},{"nome":"Oficina","tipo":"reservada","x":0,"y":21.9,"l":9.7,"p":3.2},{"nome":"Passagem 0,5 m (NR-11)","tipo":"reservada","x":9.7,"y":7.8,"l":24.25,"p":0.5},{"nome":"Corredor","tipo":"corredor","x":14.55,"y":11.9,"l":19.4,"p":6.0},{"nome":"Faixa livre · sem adubo","tipo":"reservada","x":9.7,"y":22.7,"l":24.25,"p":2.4},{"nome":"","tipo":"reservada","x":33.45,"y":8.3,"l":0.5,"p":3.6},{"nome":"","tipo":"reservada","x":33.45,"y":17.9,"l":0.5,"p":4.8}],"folga":0.25,"muros":[7.7,25.1],"frente":"esquerda","versao":5,"largura":29.5,"pilares":[[0.0,7.7],[4.85,7.7],[9.7,7.7],[14.55,7.7],[19.4,7.7],[24.25,7.7],[29.1,7.7],[33.95,7.7],[0.0,25.1],[4.85,25.1],[9.7,25.1],[14.55,25.1],[19.4,25.1],[24.25,25.1],[29.1,25.1],[33.95,25.1],[4.85,13],[9.7,13],[14.55,13],[19.4,13],[24.25,13],[29.1,13],[33.95,13],[4.85,21.9],[9.7,21.9],[14.55,21.9],[19.4,21.9],[24.25,21.9],[29.1,21.9],[33.95,21.9]],"quadras":[{"codigo":"A1","fileira":"A","x":29.1,"y":8.3,"l":4.35,"p":3.6,"capacidade":27},{"codigo":"A2","fileira":"A","x":24.25,"y":8.3,"l":4.85,"p":3.6,"capacidade":36},{"codigo":"A3","fileira":"A","x":19.4,"y":8.3,"l":4.85,"p":3.6,"capacidade":36},{"codigo":"A4","fileira":"A","x":14.55,"y":8.3,"l":4.85,"p":3.6,"capacidade":36},{"codigo":"A5","fileira":"A","x":9.7,"y":11.9,"l":4.85,"p":6.0,"capacidade":60},{"codigo":"B1","fileira":"B","x":14.55,"y":17.9,"l":4.85,"p":4.8,"capacidade":36},{"codigo":"B2","fileira":"B","x":19.4,"y":17.9,"l":4.85,"p":4.8,"capacidade":36},{"codigo":"B3","fileira":"B","x":24.25,"y":17.9,"l":4.85,"p":4.8,"capacidade":36},{"codigo":"B4","fileira":"B","x":29.1,"y":17.9,"l":4.35,"p":4.8,"capacidade":36},{"codigo":"B5","fileira":"B","x":9.7,"y":17.9,"l":4.85,"p":4.8,"capacidade":36},{"codigo":"A6","fileira":"A","x":9.7,"y":8.3,"l":4.85,"p":3.6,"capacidade":36}],"medida_bag":1.2,"comprimento":33.95,"peso_bag_kg":1000,"altura_pilha":3}'::jsonb
from public.est_locais l where l.nome = 'Lote 35 PADAP'
on conflict (id) do nothing;
