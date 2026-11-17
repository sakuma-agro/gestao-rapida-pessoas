// backup-drive — entrega o backup de todo o LOP - Gestão Rápida para o
// script do Google Drive (supabase/backup-drive.gs), que roda sozinho todo dia.
//
// Sem login de usuário: quem chama prova que é o script mandando o cabeçalho
// x-backup-token. Vale o segredo BACKUP_TOKEN (Edge Function secret), se ele
// existir; senão, o sha256 do que veio tem que bater com public.backup_config
// (a senha em si só existe no Apps Script). Sem nenhum dos dois, não entrega nada.
// Lê com a chave de serviço, então nenhuma tabela fica de fora por RLS.
//
// Quais tabelas entram (17/11/2026): quem diz é o BANCO, por
// rpc('backup_tabelas') — igual ao js/backup.js. Tabela nova entra sozinha;
// fica fora só o que public.backup_fora() exclui de propósito (chaves, sobras,
// Outorga). Precisa do supabase/backup-automatico.sql rodado (é ele que deixa
// a chave de serviço chamar backup_tabelas). Se o banco não devolver a lista,
// o backup FALHA (o script manda e-mail) em vez de sair pela metade.
//
// GRUPOS abaixo é a mesma lista do js/backup.js e serve só para dar NOME de
// módulo e ORDEM às abas. Tabela sem linha aqui entra igual.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRUPOS: [string, string, string[]][] = [
  ['Funcionários', 'public', ['funcionarios']],
  ['EPIs', 'public', ['epis', 'fichas', 'epi_entregas', 'modelo']],
  ['Exames', 'public', ['sst_tipos_exame', 'sst_exames', 'sst_exames_funcao', 'sst_aso_itens']],
  ['Treinamentos', 'public', ['sst_tipos_treinamento', 'sst_treinamentos', 'sst_treinamentos_funcao']],
  ['Atividades SST', 'public', ['sst_atividades', 'sst_atividade_treinamentos', 'sst_atividade_exames', 'sst_atividade_funcionarios']],
  ['Acidentes e CAT', 'public', ['sst_acidentes']],
  ['Campanhas SST', 'public', ['sst_campanhas', 'sst_campanha_temas', 'sst_campanha_atividades']],
  ['Brigada e socorros', 'public', ['sst_brigada_config']],
  ['NRs', 'public', ['sst_nrs_portal']],
  ['DISC', 'public', ['disc_perfis', 'disc_combinacoes', 'disc_avaliacoes', 'disc_marcacoes', 'disc_cargos_esperado', 'disc_acesso']],
  ['RH', 'public', ['rh_cargos', 'rh_propostas', 'rh_modelo', 'rh_reajustes']],
  ['RH · Salário digno', 'public', ['rh_sd_parametros', 'rh_sd_planos', 'rh_sd_andamentos', 'rh_sd_fotos']],
  ['RH · Indicadores', 'public', ['rh_ind_vinculos', 'rh_ind_ausencias', 'rh_ind_jornada_mes', 'rh_ind_lacunas', 'rh_ind_lotes', 'rh_ind_metas', 'rh_ind_tipos_deslig']],
  ['Estrutura', 'public', ['jor_empregadores', 'jor_fazendas', 'jor_unidades', 'jor_destinos_dp', 'jor_funcoes', 'jor_setores']],
  ['DP', 'public', ['jor_jornadas', 'jor_vinculos', 'jor_boletins', 'jor_ocorrencias', 'jor_apuracoes', 'jor_decisoes', 'jor_competencias', 'jor_emissoes', 'jor_tipos_ocorrencia', 'jor_feriados', 'jor_parametros', 'jor_perfis', 'jor_auditoria', 'jor_fechamentos', 'jor_tipos_he_especial']],
  ['Admissão e demissão', 'public', ['jor_tarefa_modelos', 'jor_tarefas']],
  ['DP · Entregas', 'public', ['jor_bol_entregas', 'jor_doc_entregas']],
  ['DP · Folha de ponto', 'public', ['jor_folha_ponto_config', 'jor_folha_ponto_impressos']],
  ['DP · Ticket', 'public', ['jor_ticket_mes', 'jor_ticket_emissoes']],
  ['DP · Holerites (DP 2)', 'public', ['jor_holerites']],
  ['DP · Empréstimo e Férias', 'public', ['jor_emprestimos', 'jor_emprestimo_abatimentos', 'jor_salarios', 'jor_afastamentos', 'jor_ferias_inicial', 'jor_ferias_gozos', 'jor_ferias_perdas']],
  ['Certificação', 'public', ['cert_certificacoes', 'cert_requisitos', 'cert_documentos', 'cert_doc_itens', 'cert_vinculos', 'cert_evidencias', 'cert_eventos', 'cr_tipos', 'cr_saidas', 'cr_avaliacoes']],
  ['Certificação · Caderno de campo', 'public', ['cc_config', 'cc_plantios', 'cc_insumos', 'cc_registros', 'cc_registro_versoes', 'cc_analises', 'cc_calibracoes']],
  ['Certificação · Melhoria contínua', 'public', ['cmc_casos', 'cmc_andamentos', 'cmc_acoes', 'cmc_registros', 'cmc_caixas', 'cmc_aberturas']],
  ['Certificação · Fauna', 'public', ['cf_especies', 'cf_cameras', 'cf_registros', 'cf_ia_uso']],
  ['Certificação · Fornecedores', 'public', ['cfo_fornecedores', 'cfo_avaliacoes']],
  ['Certificação · Energia', 'public', ['ce_fontes', 'ce_consumos']],
  ['Certificação · Banho e lavagem de EPI', 'public', ['cb_banhos', 'cl_conjuntos', 'cl_lavagens']],
  ['Manutenções', 'manutencao', ['equipamentos', 'tipos_equipamento', 'marcas', 'locais', 'setores', 'planos_manutencao', 'tipos_manutencao', 'manutencoes', 'responsaveis_manutencao', 'leituras', 'ajustes_contador', 'usos_implemento', 'parametros', 'importacoes']],
  ['Manutenções · Ordens de serviço', 'manutencao', ['ordens_servico', 'os_itens']],
  ['Manutenções · Check list', 'manutencao', ['checklist_modelos', 'checklist_versoes', 'checklist_grupos', 'checklist_itens', 'checklist_equipamento', 'checklists', 'checklist_respostas', 'checklist_fotos']],
  ['Patrimônio', 'manutencao', ['bens_patrimonio', 'patrimonio_movimentos']],
  ['Manutenções · Acesso', 'manutencao', ['administradores', 'usuario_fazendas', 'usuario_locais', 'auditoria']],
  ['Vistorias e Segurança', 'vistorias', ['vistorias', 'itens', 'antes_depois', 'anomalias_relatorios', 'extintores', 'fotos_drive', 'configuracoes', 'administradores']],
  ['Programação Campo', 'programacao', ['locais', 'culturas', 'tipos_atividade', 'maquinas_genericas', 'implementos_genericos', 'atividades', 'historico', 'diarios', 'reunioes', 'parametros', 'usuario_fazendas', 'usuarios_antigos']],
  ['Estoque', 'public', ['est_locais', 'est_itens', 'est_saldos_sistema', 'est_movimentos', 'est_contagem_lotes', 'est_contagens', 'est_contagem_itens', 'est_compras', 'est_compra_itens', 'est_compra_estoques', 'est_minimos', 'est_mapas', 'est_contagem_grupos', 'est_contagem_quadras']],
  ['Custo Base', 'public', ['cb_culturas', 'cb_talhoes', 'cb_meses', 'cb_itens', 'cb_hh_parametros', 'cb_hh_meses', 'cb_hh_itens', 'cb_adm_itens', 'cb_adm_lanc', 'cb_hor_conf', 'cb_hor_marcas', 'cb_irr_fazendas', 'cb_irr_acertos']],
  ['Outorga e Irrigação', 'public', ['out_locais', 'out_controles', 'out_produtores', 'out_itens', 'out_recebidos']],
  ['Colheita e Produção', 'public', ['cp_culturas', 'cp_safras', 'cp_plantios', 'cp_cargas', 'cp_balanca', 'cp_cooperativa', 'cp_historico', 'cp_custos', 'cp_veiculos', 'cp_pivos', 'cp_variedades', 'cp_lotes_venda', 'cp_vendas_itens', 'cp_notas_fiscais']],
  ['Projetos (PMBOK)', 'public', ['pj_projetos', 'pj_partes', 'pj_premissas', 'pj_requisitos', 'pj_eap', 'pj_raci', 'pj_riscos', 'pj_comunicacao', 'pj_reunioes', 'pj_custos', 'pj_mudancas', 'pj_ocorrencias', 'pj_licoes', 'pj_status']],
  ['Reunião semanal', 'public', ['reu_config', 'reu_pessoas', 'reu_atividades', 'reu_semanas']],
  ['Cronograma geral', 'public', ['cron_tarefas', 'cron_estado', 'cron_config']],
  ['Anexos no Drive (lista)', 'public', ['arquivos']],
  ['Acesso', 'public', ['app_usuarios', 'app_preferencias', 'ia_uso']],
];
// Mesmo prefixo do js/backup.js: o .json lê igual ao do backup manual.
const PREFIXO: Record<string, string> = { public: '', manutencao: 'man_', vistorias: 'vis_', programacao: 'prog_' };
const prefixo = (esq: string) => PREFIXO[esq] ?? `${esq}_`;
const PAGINA = 1000;

type Item = { grupo: string; esquema: string; tabela: string; chave: string };
const LISTA = GRUPOS.flatMap(([grupo, esquema, ts]) => ts.map(t => ({ grupo, esquema, tabela: t, chave: prefixo(esquema) + t })));
const GRUPO_DE = new Map(LISTA.map(t => [`${t.esquema}.${t.tabela}`, t.grupo]));

// Tabela que entrou sozinha: grupo da tabela irmã (mesmo começo do nome) ou "Módulo novo".
function grupoDe(esq: string, t: string) {
  const g = GRUPO_DE.get(`${esq}.${t}`);
  if (g) return g;
  const pre = t.includes('_') ? t.slice(0, t.indexOf('_') + 1) : t;
  const irma = LISTA.find(x => x.esquema === esq && x.tabela.startsWith(pre));
  return irma ? irma.grupo : `Módulo novo · ${esq === 'public' ? '' : esq + '.'}${pre}`;
}

function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sha256(t: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const veio = req.headers.get('x-backup-token') || '';
  const segredo = Deno.env.get('BACKUP_TOKEN') || '';
  let ok = false;
  if (segredo.length >= 20) {
    ok = igual(veio, segredo);
  } else {
    const { data } = await sb.from('backup_config').select('token_sha256').eq('id', 1).maybeSingle();
    if (!data?.token_sha256) return resp(503, { erro: 'senha do backup não configurada' });
    ok = veio.length >= 20 && igual(await sha256(veio), data.token_sha256);
  }
  if (!ok) return resp(401, { erro: 'não autorizado' });

  // 1) O banco diz o que existe e o que fica fora de propósito.
  const { data: doBanco, error: erroLista } = await sb.rpc('backup_tabelas');
  if (erroLista || !Array.isArray(doBanco) || !doBanco.length) {
    return resp(500, { erro: `o banco não devolveu a lista de tabelas (rodou o supabase/backup-automatico.sql?): ${erroLista?.message || 'lista vazia'}` });
  }
  if (!('fora' in doBanco[0])) {
    return resp(500, { erro: 'backup_tabelas está na versão antiga: rode o supabase/backup-automatico.sql no SQL Editor' });
  }
  const fora: { tabela: string; motivo: string }[] = [];
  const entram: Item[] = [];
  for (const t of doBanco as { esquema: string; tabela: string; fora: string | null }[]) {
    if (t.fora) { fora.push({ tabela: `${t.esquema}.${t.tabela}`, motivo: t.fora }); continue; }
    entram.push({ grupo: grupoDe(t.esquema, t.tabela), esquema: t.esquema, tabela: t.tabela, chave: prefixo(t.esquema) + t.tabela });
  }
  // Ordem das abas: a de sempre (GRUPOS); as novas logo atrás da irmã; ordena por grupo.
  const ordem = new Map(LISTA.map((t, i) => [`${t.esquema}.${t.tabela}`, i]));
  const novas = entram.filter(t => !ordem.has(`${t.esquema}.${t.tabela}`)).map(t => `${t.esquema}.${t.tabela}`);
  const tabelasLista = [
    ...entram.filter(t => ordem.has(`${t.esquema}.${t.tabela}`)).sort((a, b) => ordem.get(`${a.esquema}.${a.tabela}`)! - ordem.get(`${b.esquema}.${b.tabela}`)!),
    ...entram.filter(t => !ordem.has(`${t.esquema}.${t.tabela}`)),
  ];
  const posGrupo = new Map<string, number>();
  tabelasLista.forEach((t, i) => { if (!posGrupo.has(t.grupo)) posGrupo.set(t.grupo, i); });
  tabelasLista.sort((x, y) => posGrupo.get(x.grupo)! - posGrupo.get(y.grupo)!);

  // 2) Lê cada tabela, de 1000 em 1000 — 6 tabelas por vez, para caber no tempo da função.
  const tabelas: Record<string, unknown[]> = {};
  const origem: Record<string, string> = {};
  const resumoPorPos: { grupo: string; tabela: string; registros: number; obs: string }[] = [];
  async function lerUma(i: number) {
    const { grupo, esquema, tabela, chave } = tabelasLista[i];
    const base = esquema === 'public' ? sb : sb.schema(esquema);
    origem[chave] = `${esquema}.${tabela}`;
    try {
      const linhas: unknown[] = [];
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await base.from(tabela).select('*').range(de, de + PAGINA - 1);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < PAGINA) break;
      }
      tabelas[chave] = linhas;
      resumoPorPos[i] = { grupo, tabela: chave, registros: linhas.length, obs: '' };
    } catch (e) {
      tabelas[chave] = [];
      resumoPorPos[i] = { grupo, tabela: chave, registros: 0, obs: `não veio: ${(e as Error).message || e}` };
    }
  }
  // já cria as chaves na ordem das abas (a leitura em paralelo termina fora de ordem)
  for (const t of tabelasLista) { tabelas[t.chave] = []; origem[t.chave] = `${t.esquema}.${t.tabela}`; }
  let proxima = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (proxima < tabelasLista.length) await lerUma(proxima++);
  }));
  const resumo = resumoPorPos.filter(Boolean);

  // 3) A estrutura do banco em SQL (para reconstruir num projeto vazio).
  let esquemaSql: string | null = null;
  let obsEsquema = '';
  try {
    const { data, error } = await sb.rpc('esquema_ddl', { p_parte: 'tudo' });
    if (error) throw error;
    esquemaSql = typeof data === 'string' ? data : null;
  } catch (e) {
    obsEsquema = `estrutura não veio: ${(e as Error).message || e}`;
  }

  // 4) Fotos e anexos do Storage: o script baixa cada um pelo link assinado (vale 2 h).
  const arquivos: { bucket: string; nome: string; tamanho: number; atualizado: string; url: string | null }[] = [];
  let obsArquivos = '';
  try {
    const { data, error } = await sb.rpc('backup_arquivos');
    if (error) throw error;
    for (const a of data || []) {
      const { data: s } = await sb.storage.from(a.bucket).createSignedUrl(a.nome, 7200);
      arquivos.push({ bucket: a.bucket, nome: a.nome, tamanho: a.tamanho, atualizado: a.atualizado, url: s?.signedUrl || null });
    }
  } catch (e) {
    obsArquivos = `lista de arquivos não veio: ${(e as Error).message || e}`;
  }

  return resp(200, {
    app: 'LOP - Gestão Rápida · SAKUMA',
    versao_backup: 3,
    gerado_em: new Date().toISOString(),
    gerado_por: 'backup automático (Google Drive)',
    tabelas_novas: novas,
    tabelas_fora_de_proposito: fora,
    origem, resumo, tabelas,
    esquema_sql: esquemaSql, obs_esquema: obsEsquema,
    arquivos, obs_arquivos: obsArquivos,
  });
});
