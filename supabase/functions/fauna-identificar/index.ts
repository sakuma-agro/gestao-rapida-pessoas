// fauna-identificar — Certificação › Biodiversidade (26/10/2026).
//
// Pedido do Guilherme: "nesse painel, quero ter um lugar aonde vou soltar as
// fotos e vídeos e você vai identificar". O app manda até 3 quadros (JPEG
// reduzidos — de um vídeo, o app tira os quadros no próprio navegador) e a
// lista de espécies já cadastradas; esta função pergunta ao Claude qual é o
// animal e devolve a identificação estruturada. Nada é gravado aqui: quem
// confere e lança é a pessoa, na tela.
//
// Acesso: login do app com o módulo 'cert' (app_pode). Chave: ANTHROPIC_API_KEY
// (a mesma do "Pergunte ao LOP"). Uso registrado em cf_ia_uso; limite diário
// FAUNA_LIMITE_DIA (padrão 400 arquivos por pessoa).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODELO = Deno.env.get('FAUNA_MODELO') || Deno.env.get('IA_MODELO') || 'claude-sonnet-5-5';
const LIMITE_DIA = Number(Deno.env.get('FAUNA_LIMITE_DIA') || 400);
const WORKSPACE = Deno.env.get('IA_WORKSPACE_ID') || 'wrkspc_015DEwxkhixtGSziwuZY172v';
const MAX_IMG = 3;
const MAX_B64 = 1_500_000;   // por imagem (~1,1 MB)

const FERRAMENTA = {
  name: 'identificacao',
  description: 'Devolve a identificação do animal flagrado pela câmera de trilha.',
  input_schema: {
    type: 'object',
    properties: {
      animal_presente: { type: 'boolean', description: 'false se não há animal visível (disparo por vento, sombra, pessoa, veículo, imagem vazia).' },
      pessoa_ou_veiculo: { type: 'boolean', description: 'true se o disparo foi por pessoa, veículo ou animal doméstico de criação.' },
      especie_do_catalogo: { type: ['string', 'null'], description: 'Nome EXATO de uma espécie da lista do catálogo, se for ela. null se for outra.' },
      nome_comum: { type: 'string', description: 'Nome popular em português do Brasil (ex.: Tamanduá-bandeira).' },
      cientifico: { type: 'string', description: 'Nome científico; use "Gênero sp." se não der para cravar a espécie.' },
      familia: { type: 'string' },
      classe: { type: 'string', enum: ['Ave', 'Mamífero', 'Réptil', 'Anfíbio', 'Outro'] },
      confianca: { type: 'string', enum: ['alta', 'média', 'baixa'] },
      individuos: { type: 'integer', minimum: 1 },
      status_iucn: { type: ['string', 'null'], enum: ['LC', 'NT', 'VU', 'EN', 'CR', 'DD', 'NE', null] },
      status_brasil: { type: ['string', 'null'], enum: ['VU', 'EN', 'CR', null], description: 'Lista Nacional (Portaria MMA 148/2022); null se não consta.' },
      exotica: { type: 'boolean', description: 'true se não é nativa do Brasil (ex.: lebre-europeia, javali).' },
      data_carimbo: { type: ['string', 'null'], description: 'Data impressa na imagem pela câmera, em AAAA-MM-DD; null se não houver.' },
      hora_carimbo: { type: ['string', 'null'], description: 'Hora impressa na imagem, HH:MM (24 h); null se não houver.' },
      camera_carimbo: { type: ['string', 'null'], description: 'Nome/número da câmera impresso na imagem, se houver.' },
      observacao: { type: 'string', description: 'Uma frase curta em português: o que se vê e por que essa espécie (marcas que ajudaram).' },
    },
    required: ['animal_presente', 'nome_comum', 'cientifico', 'familia', 'classe', 'confianca', 'observacao'],
  },
};

function instrucoes(catalogo: string[], cameras: string[]) {
  return `Você identifica fauna em imagens de câmeras de trilha (armadilhas fotográficas) instaladas em fragmentos de mata e APPs de uma fazenda agrícola no Brasil, para o Plano de Biodiversidade da certificação (GLOBALG.A.P./GRASP/SMETA).

Regras:
- Responda SEMPRE chamando a ferramenta "identificacao".
- Imagens noturnas costumam ser infravermelho em preto e branco; considere silhueta, porte, cauda, focinho, marcas e comportamento.
- Se o animal for uma espécie do catálogo abaixo, devolva em "especie_do_catalogo" o nome EXATAMENTE como está escrito na lista e repita os mesmos nomes comum/científico. Só fuja do catálogo quando tiver certeza de que é outro animal.
- Não chute espécie: se só der para chegar no gênero ou na família, diga isso no nome científico (ex.: "Penelope sp.") e use confiança "baixa" ou "média".
- Se não houver animal (disparo falso, vegetação, sombra), animal_presente = false. Pessoas, veículos, gado, cães e gatos domésticos: animal_presente = true e pessoa_ou_veiculo = true.
- Leia o carimbo que a câmera imprime na imagem (data, hora, nome da câmera, temperatura) quando existir.
- Status de conservação: IUCN e Lista Nacional (Portaria MMA nº 148/2022) só quando souber; senão null.

Catálogo de espécies já registradas na fazenda: ${catalogo.length ? catalogo.join('; ') : '(vazio)'}
Câmeras cadastradas: ${cameras.length ? cameras.join(', ') : '(nenhuma)'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  const chave = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim().replace(/^["']|["']$/g, '');
  if (!chave.startsWith('sk-ant-')) return json({ erro: 'Falta a chave da API do Claude no Supabase (ANTHROPIC_API_KEY).' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const daLista = (nome: string) => { try { const d = JSON.parse(Deno.env.get(nome) || '{}'); return d.default || Object.values(d)[0] || ''; } catch { return ''; } };
  const anon = (daLista('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY')) as string;
  const servico = (daLista('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) as string;
  const auth = req.headers.get('Authorization') || '';
  const db = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  const email = u?.user?.email?.toLowerCase();
  if (!email) return json({ erro: 'Entre no sistema de novo.' }, 401);
  const { data: pode } = await db.rpc('app_pode', { modulo: 'cert' });
  if (pode !== true) return json({ erro: 'Seu login não tem a Certificação liberada.' }, 403);

  const adm = createClient(url, servico, { auth: { persistSession: false } });
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const { count: usadas } = await adm.from('cf_ia_uso').select('id', { count: 'exact', head: true }).eq('email', email).gte('criado_em', hoje + 'T03:00:00Z');
  if ((usadas ?? 0) >= LIMITE_DIA) return json({ erro: `Limite de ${LIMITE_DIA} identificações por dia atingido. Volta amanhã.` }, 429);

  const corpo = await req.json().catch(() => ({}));
  const arquivo = String(corpo?.arquivo || '').slice(0, 200);
  const imagens: string[] = (Array.isArray(corpo?.imagens) ? corpo.imagens : []).slice(0, MAX_IMG)
    .map((s: unknown) => String(s || '').replace(/^data:image\/jpeg;base64,/, ''))
    .filter((s: string) => s.length > 100 && s.length <= MAX_B64 && /^[A-Za-z0-9+/=]+$/.test(s));
  if (!imagens.length) return json({ erro: 'Nenhuma imagem válida (JPEG, até 1 MB cada).' }, 400);
  const catalogo = (Array.isArray(corpo?.especies) ? corpo.especies : []).slice(0, 300).map((s: unknown) => String(s).slice(0, 120));
  const cameras = (Array.isArray(corpo?.cameras) ? corpo.cameras : []).slice(0, 50).map((s: unknown) => String(s).slice(0, 60));
  const video = !!corpo?.video;

  const conteudo = [
    ...imagens.map(b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
    { type: 'text', text: `${video ? `Quadros de um vídeo (${imagens.length}), em ordem de tempo.` : 'Foto da câmera de trilha.'} Arquivo: ${arquivo || '(sem nome)'}. Identifique o animal.` },
  ];
  const corpoReq = JSON.stringify({
    model: MODELO, max_tokens: 1200,
    system: [{ type: 'text', text: instrucoes(catalogo, cameras), cache_control: { type: 'ephemeral' } }],
    tools: [FERRAMENTA], tool_choice: { type: 'tool', name: 'identificacao' },
    messages: [{ role: 'user', content: conteudo }],
  });
  const enviar = (modo: 'bearer' | 'x-api-key') => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...(modo === 'bearer' ? { authorization: `Bearer ${chave}` } : { 'x-api-key': chave }),
      'anthropic-workspace-id': WORKSPACE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: corpoReq,
  });
  let r = await enviar('bearer');
  if (r.status === 401) r = await enviar('x-api-key');
  const resp = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = resp?.error?.message || `status ${r.status}`;
    return json({ erro: /credit|balance/i.test(msg) ? 'Os créditos da API do Claude acabaram — recarregue no Claude Console.' : 'A API do Claude respondeu: ' + msg }, 502);
  }
  // deno-lint-ignore no-explicit-any
  const bloco = (resp.content || []).find((b: any) => b.type === 'tool_use');
  if (!bloco) return json({ erro: 'O Claude não devolveu a identificação.' }, 502);
  const id = bloco.input || {};

  await adm.from('cf_ia_uso').insert({
    email, arquivo, modelo: MODELO, resultado: id,
    tokens_entrada: resp.usage?.input_tokens ?? 0, tokens_saida: resp.usage?.output_tokens ?? 0,
  });
  return json({ identificacao: id, modelo: MODELO });
});
