// backup-drive — entrega o backup de todo o LOP - Gestão Rápida para o
// script do Google Drive (Apps Script do Guilherme), que roda sozinho toda semana.
//
// Sem login de usuário: quem chama prova que é o script mandando o cabeçalho
// x-backup-token. Vale o segredo BACKUP_TOKEN (Edge Function secret), se ele
// existir; senão, o sha256 do que veio tem que bater com public.backup_config
// (a senha em si só existe no Apps Script). Sem nenhum dos dois, não entrega nada.
// Lê com a chave de serviço, então nenhuma tabela fica de fora por RLS.
// A lista de tabelas é a mesma do js/backup.js — tabela nova entra nos dois.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRUPOS: [string, string, string[]][] = [
  ['Funcionários', 'public', ['funcionarios']],
  ['EPIs', 'public', ['epis', 'fichas', 'modelo']],
  ['Exames', 'public', ['sst_tipos_exame', 'sst_exames', 'sst_exames_funcao', 'sst_aso_itens']],
  ['Treinamentos', 'public', ['sst_tipos_treinamento', 'sst_treinamentos', 'sst_treinamentos_funcao']],
  ['Acidentes e CAT', 'public', ['sst_acidentes']],
  ['DISC', 'public', ['disc_perfis', 'disc_combinacoes', 'disc_avaliacoes', 'disc_marcacoes', 'disc_cargos_esperado', 'disc_acesso']],
  ['RH', 'public', ['rh_cargos', 'rh_propostas', 'rh_modelo']],
  ['RH · Salário digno', 'public', ['rh_sd_parametros', 'rh_sd_planos', 'rh_sd_andamentos', 'rh_sd_fotos']],
  ['RH · Indicadores', 'public', ['rh_ind_vinculos', 'rh_ind_ausencias', 'rh_ind_jornada_mes', 'rh_ind_lacunas', 'rh_ind_lotes', 'rh_ind_metas', 'rh_ind_tipos_deslig']],
  ['Estrutura', 'public', ['jor_empregadores', 'jor_fazendas', 'jor_unidades', 'jor_destinos_dp', 'jor_funcoes', 'jor_setores']],
  ['DP', 'public', ['jor_jornadas', 'jor_vinculos', 'jor_boletins', 'jor_ocorrencias', 'jor_apuracoes', 'jor_decisoes', 'jor_competencias', 'jor_emissoes', 'jor_tipos_ocorrencia', 'jor_feriados', 'jor_parametros', 'jor_perfis', 'jor_auditoria', 'jor_fechamentos', 'jor_tipos_he_especial']],
  ['DP · Entregas', 'public', ['jor_bol_entregas', 'jor_doc_entregas']],
  ['DP · Folha de ponto', 'public', ['jor_folha_ponto_config', 'jor_folha_ponto_impressos']],
  ['DP · Ticket', 'public', ['jor_ticket_mes', 'jor_ticket_emissoes']],
  ['DP · Empréstimo e Férias', 'public', ['jor_emprestimos', 'jor_emprestimo_abatimentos', 'jor_salarios', 'jor_afastamentos', 'jor_ferias_inicial', 'jor_ferias_gozos', 'jor_ferias_perdas']],
  ['Certificação', 'public', ['cert_certificacoes', 'cert_requisitos', 'cert_documentos', 'cert_eventos']],
  ['Manutenções', 'manutencao', ['equipamentos', 'tipos_equipamento', 'marcas', 'locais', 'setores', 'planos_manutencao', 'tipos_manutencao', 'manutencoes', 'responsaveis_manutencao', 'leituras', 'ajustes_contador', 'usos_implemento', 'parametros', 'importacoes']],
  ['Manutenções · Ordens de serviço', 'manutencao', ['ordens_servico', 'os_itens']],
  ['Manutenções · Check list', 'manutencao', ['checklist_modelos', 'checklist_versoes', 'checklist_grupos', 'checklist_itens', 'checklist_equipamento', 'checklists', 'checklist_respostas', 'checklist_fotos']],
  ['Patrimônio', 'manutencao', ['bens_patrimonio', 'patrimonio_movimentos']],
  ['Manutenções · Acesso', 'manutencao', ['administradores', 'usuario_fazendas', 'usuario_locais', 'auditoria']],
  ['Vistorias e Segurança', 'vistorias', ['vistorias', 'itens', 'antes_depois', 'anomalias_relatorios', 'extintores', 'fotos_drive', 'configuracoes', 'administradores']],
  ['Anexos no Drive (lista)', 'public', ['arquivos']],
  ['Acesso', 'public', ['app_usuarios', 'app_preferencias', 'ia_uso']],
];
const PREFIXO: Record<string, string> = { public: '', manutencao: 'man_', vistorias: 'vis_' };
const PAGINA = 1000;

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

  const tabelas: Record<string, unknown[]> = {};
  const origem: Record<string, string> = {};
  const resumo: { grupo: string; tabela: string; registros: number; obs: string }[] = [];

  for (const [grupo, esquema, ts] of GRUPOS) {
    const base = esquema === 'public' ? sb : sb.schema(esquema);
    for (const t of ts) {
      const chave = PREFIXO[esquema] + t;
      origem[chave] = `${esquema}.${t}`;
      try {
        const linhas: unknown[] = [];
        for (let de = 0; ; de += PAGINA) {
          const { data, error } = await base.from(t).select('*').range(de, de + PAGINA - 1);
          if (error) throw error;
          linhas.push(...(data || []));
          if (!data || data.length < PAGINA) break;
        }
        tabelas[chave] = linhas;
        resumo.push({ grupo, tabela: chave, registros: linhas.length, obs: '' });
      } catch (e) {
        tabelas[chave] = [];
        resumo.push({ grupo, tabela: chave, registros: 0, obs: `não veio: ${(e as Error).message || e}` });
      }
    }
  }

  // Fotos e anexos do Storage: o script baixa cada um pelo link assinado (vale 2 h).
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
    versao_backup: 2,
    gerado_em: new Date().toISOString(),
    gerado_por: 'backup automático (Google Drive)',
    origem, resumo, tabelas, arquivos, obs_arquivos: obsArquivos,
  });
});
