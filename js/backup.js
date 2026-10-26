// backup.js — o botão Backup, na aba Configurações (só administrador).
//
// Lê todas as tabelas do app e entrega dois arquivos:
//  · a planilha .xlsx, uma aba por tabela, para ler e arquivar;
//  · o .json fiel ao banco, que é o que serve para recolocar os dados no ar
//    se algo se perder — a planilha formata, o json guarda.
//
// Duas decisões que valem a pena repetir:
//  · Nada de biblioteca: o CDN é bloqueado, então o .xlsx é escrito aqui.
//    Um .xlsx é um ZIP com XML dentro; como o backup é pequeno, os arquivos
//    entram GUARDADOS (sem compactar) — o Excel abre igual e o código cabe
//    em meia página, sem depender de CompressionStream.
//  · Tabela que o banco recusar (o RH só abre para quem tem o módulo) não
//    derruba o backup: entra na aba Resumo com o motivo, à vista. Backup que
//    falha calado é pior do que backup nenhum.
// backup.js — o Backup de todo o LOP - Gestão Rápida (só administrador).
//
// Dois lugares chamam a mesma rotina: a faixa "Backup de todo o app" na tela
// inicial (escolha da área) e o cartão em Usuários - Acessos.
//
// Lê TODAS as tabelas das áreas — Pessoas (esquema public), Manutenções
// (esquema manutencao) e Vistorias e Segurança (esquema vistorias) — e entrega
// dois arquivos com a data e a hora no nome:
//  · a planilha .xlsx, uma aba por tabela, para ler e arquivar;
//  · o .json fiel ao banco, que é o que serve para recolocar os dados no ar
//    se algo se perder — a planilha formata, o json guarda.
//
// Pasta fixa (14/10/2026, pedido dele): no Chrome/Edge do computador o app
// lembra a pasta escolhida (File System Access API, o "atalho" da pasta fica no
// IndexedDB) e grava lá direto, sem perguntar. Onde a API não existe (celular)
// ou a permissão é negada, cai no download comum.
//
// Decisões que valem a pena repetir:
//  · Nada de biblioteca: o CDN é bloqueado, então o .xlsx é escrito aqui.
//  · Leitura em páginas de 1000: o Supabase devolve no máximo 1000 linhas por
//    pedido, e uma tabela grande sairia cortada sem ninguém perceber.
//  · Tabela que o banco recusar não derruba o backup: entra na aba Resumo com
//    o motivo, à vista. Backup que falha calado é pior do que backup nenhum.
//  · Fotos e PDFs anexados ficam no Google Drive (e uns poucos antigos no
//    Storage); o backup guarda os registros (com o caminho de cada arquivo),
//    não os arquivos em si.
//
// Backup completo (19/10/2026, pedido dele):
//  · Terceiro arquivo, o …-esquema.sql: a ESTRUTURA do banco (tabelas,
//    funções, políticas, gatilhos…), gerada na hora por public.backup_esquema().
//    É o que permite reconstruir o sistema num projeto Supabase vazio e então
//    recolocar os dados do .json. Dado sem estrutura não religa nada.
//  · O banco diz quais tabelas existem (public.backup_tabelas()); se alguma
//    não está na lista abaixo, a aba Resumo avisa em vermelho. Foi assim que
//    Programação Campo, Estoque e Reunião ficaram 5 dias fora do backup.
import { estado } from './store.js';

const $ = id => document.getElementById(id);

/* [grupo, esquema, tabelas], na ordem em que fazem sentido para quem abre a
   planilha. Fica de fora só o que não é deste app: out_* (Controle de Outorga,
   outro sistema no mesmo banco), integracao_privada e cópias de segurança
   feitas à mão no banco (*_bkp_*). Tabela nova no banco = uma linha aqui. */
const GRUPOS = [
  ['Funcionários', 'public', ['funcionarios']],
  ['EPIs', 'public', ['epis', 'fichas', 'modelo']],
  ['Exames', 'public', ['sst_tipos_exame', 'sst_exames', 'sst_exames_funcao', 'sst_aso_itens']],
  ['Treinamentos', 'public', ['sst_tipos_treinamento', 'sst_treinamentos', 'sst_treinamentos_funcao']],
  ['Atividades SST', 'public', ['sst_atividades', 'sst_atividade_treinamentos', 'sst_atividade_exames', 'sst_atividade_funcionarios']],
  ['Acidentes e CAT', 'public', ['sst_acidentes']],
  ['DISC', 'public', ['disc_perfis', 'disc_combinacoes', 'disc_avaliacoes', 'disc_marcacoes',
    'disc_cargos_esperado', 'disc_acesso']],
  ['RH', 'public', ['rh_cargos', 'rh_propostas', 'rh_modelo', 'rh_reajustes']],
  ['RH · Salário digno', 'public', ['rh_sd_parametros', 'rh_sd_planos', 'rh_sd_andamentos', 'rh_sd_fotos']],
  ['RH · Indicadores', 'public', ['rh_ind_vinculos', 'rh_ind_ausencias', 'rh_ind_jornada_mes',
    'rh_ind_lacunas', 'rh_ind_lotes', 'rh_ind_metas', 'rh_ind_tipos_deslig']],
  ['Estrutura', 'public', ['jor_empregadores', 'jor_fazendas', 'jor_unidades', 'jor_destinos_dp',
    'jor_funcoes', 'jor_setores']],
  ['DP', 'public', ['jor_jornadas', 'jor_vinculos', 'jor_boletins', 'jor_ocorrencias', 'jor_apuracoes',
    'jor_decisoes', 'jor_competencias', 'jor_emissoes', 'jor_tipos_ocorrencia',
    'jor_feriados', 'jor_parametros', 'jor_perfis', 'jor_auditoria',
    'jor_fechamentos', 'jor_tipos_he_especial']],
  ['DP · Entregas', 'public', ['jor_bol_entregas', 'jor_doc_entregas']],
  ['DP · Folha de ponto', 'public', ['jor_folha_ponto_config', 'jor_folha_ponto_impressos']],
  ['DP · Ticket', 'public', ['jor_ticket_mes', 'jor_ticket_emissoes']],
  ['DP · Empréstimo e Férias', 'public', ['jor_emprestimos', 'jor_emprestimo_abatimentos', 'jor_salarios',
    'jor_afastamentos', 'jor_ferias_inicial', 'jor_ferias_gozos', 'jor_ferias_perdas']],
  ['Certificação', 'public', ['cert_certificacoes', 'cert_requisitos', 'cert_documentos', 'cert_eventos']],
  ['Manutenções', 'manutencao', ['equipamentos', 'tipos_equipamento', 'marcas', 'locais', 'setores',
    'planos_manutencao', 'tipos_manutencao', 'manutencoes', 'responsaveis_manutencao',
    'leituras', 'ajustes_contador', 'usos_implemento', 'parametros', 'importacoes']],
  ['Manutenções · Ordens de serviço', 'manutencao', ['ordens_servico', 'os_itens']],
  ['Manutenções · Check list', 'manutencao', ['checklist_modelos', 'checklist_versoes', 'checklist_grupos',
    'checklist_itens', 'checklist_equipamento', 'checklists', 'checklist_respostas', 'checklist_fotos']],
  ['Patrimônio', 'manutencao', ['bens_patrimonio', 'patrimonio_movimentos']],
  ['Manutenções · Acesso', 'manutencao', ['administradores', 'usuario_fazendas', 'usuario_locais', 'auditoria']],
  ['Vistorias e Segurança', 'vistorias', ['vistorias', 'itens', 'antes_depois', 'anomalias_relatorios',
    'extintores', 'fotos_drive', 'configuracoes', 'administradores']],
  // vistorias.importacao_chave fica de fora: guarda chave de importação e o banco não abre para ninguém.
  ['Programação Campo', 'programacao', ['locais', 'culturas', 'tipos_atividade', 'maquinas_genericas',
    'implementos_genericos', 'atividades', 'historico', 'diarios', 'reunioes', 'parametros',
    'usuario_fazendas', 'usuarios_antigos']],
  // programacao.contadores e _pacotes_antigo: internos, fechados para o app.
  ['Estoque', 'public', ['est_locais', 'est_itens', 'est_saldos_sistema', 'est_movimentos',
    'est_contagem_lotes', 'est_contagens', 'est_contagem_itens', 'est_compras', 'est_compra_itens',
    'est_compra_estoques']],
  ['Custo Base', 'public', ['cb_culturas', 'cb_talhoes', 'cb_meses', 'cb_itens', 'cb_hh_parametros', 'cb_hh_meses', 'cb_hh_itens']],
  ['Colheita e Produção', 'public', ['cp_culturas', 'cp_safras', 'cp_plantios', 'cp_cargas', 'cp_balanca', 'cp_cooperativa', 'cp_historico', 'cp_custos', 'cp_veiculos', 'cp_lotes_venda']],
  ['Projetos (PMBOK)', 'public', ['pj_projetos', 'pj_partes', 'pj_premissas', 'pj_requisitos', 'pj_eap', 'pj_raci', 'pj_riscos',
    'pj_comunicacao', 'pj_reunioes', 'pj_custos', 'pj_mudancas', 'pj_ocorrencias', 'pj_licoes', 'pj_status']],
  ['Reunião semanal', 'public', ['reu_config', 'reu_pessoas', 'reu_atividades', 'reu_semanas']],
  ['Anexos no Drive (lista)', 'public', ['arquivos']],
  ['Acesso', 'public', ['app_usuarios', 'app_preferencias', 'ia_uso']],
];
/* Tabelas que existem no banco e ficam de fora de propósito: o aviso de
   "tabela esquecida" não reclama destas. */
const FORA_DE_PROPOSITO = new Set([
  'vistorias.importacao_chave', 'programacao.contadores', 'programacao._pacotes_antigo',
  'public.backup_config', 'public.drive_autorizacao', 'public.drive_autorizacao_estado',
  'public.integracao_privada',
]);
const foraDeProposito = (esq, t) => FORA_DE_PROPOSITO.has(`${esq}.${t}`)
  || t.startsWith('out_') || t.includes('_bkp_');
/* A chave de cada tabela no .json e o nome da aba: as do Pessoas ficam com o
   nome de sempre (o .json antigo continua lendo igual); as das outras áreas
   ganham prefixo, porque "administradores" existe nas duas. */
const PREFIXO = { public: '', manutencao: 'man_', vistorias: 'vis_', programacao: 'prog_' };
const TABELAS = GRUPOS.flatMap(([grupo, esquema, ts]) =>
  ts.map(t => ({ grupo, esquema, tabela: t, chave: PREFIXO[esquema] + t })));

const doisDig = n => String(n).padStart(2, '0');
const carimbo = d => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
const carimboHora = d => `${carimbo(d)} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
const dataBr = d => `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}/${d.getFullYear()} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;

/* ---------------- leitura ---------------- */
const PAGINA = 1000;
async function lerTabela(esquema, tabela) {
  const base = esquema === 'public' ? estado.cliente : estado.cliente.schema(esquema);
  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await base.from(tabela).select('*').range(de, de + PAGINA - 1);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

async function lerTudo(passo = () => {}) {
  const dados = {}, resumo = [];
  for (let i = 0; i < TABELAS.length; i++) {
    const { grupo, esquema, tabela, chave } = TABELAS[i];
    passo(`Lendo ${grupo} · ${tabela}… (${i + 1} de ${TABELAS.length})`);
    try {
      dados[chave] = await lerTabela(esquema, tabela);
      resumo.push({ grupo, tabela: chave, registros: dados[chave].length, obs: '' });
    } catch (e) {
      dados[chave] = [];
      resumo.push({ grupo, tabela: chave, registros: 0, obs: `não veio: ${e.message || e}` });
    }
  }
  return { dados, resumo };
}

/* Pergunta ao banco quais tabelas existem e devolve as que não estão na
   lista deste arquivo (e não são "fora de propósito"). Lista vazia = em dia.
   Se a pergunta falhar, devolve null: o Resumo diz que não conferiu. */
async function tabelasEsquecidas() {
  const { data, error } = await estado.cliente.rpc('backup_tabelas');
  if (error) return null;
  const temos = new Set(TABELAS.map(t => `${t.esquema}.${t.tabela}`));
  return (data || [])
    .filter(t => !temos.has(`${t.esquema}.${t.tabela}`) && !foraDeProposito(t.esquema, t.tabela))
    .map(t => `${t.esquema}.${t.tabela}`);
}

/* A estrutura do banco, em SQL. Falhou? Devolve null e o backup segue só
   com os dados — mas avisa. */
async function lerEsquema() {
  const { data, error } = await estado.cliente.rpc('backup_esquema');
  if (error || typeof data !== 'string' || data.length < 1000) return null;
  return data;
}

/* ---------------- planilha ---------------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** ZIP com os arquivos guardados (sem compactar) — é o que o .xlsx precisa. */
function zipar(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let desl = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = a.dados instanceof Uint8Array ? a.dados : enc.encode(a.dados);
    const crc = crc32(dados);
    const cab = new Uint8Array(30 + nome.length);
    const v = new DataView(cab.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);   // nomes em UTF-8
    v.setUint16(8, 0, true);        // método 0 = guardado
    v.setUint16(10, 0, true); v.setUint16(12, 0x2821, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, dados.length, true);
    v.setUint32(22, dados.length, true);
    v.setUint16(26, nome.length, true);
    cab.set(nome, 30);
    partes.push(cab, dados);

    const c = new Uint8Array(46 + nome.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true); w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true);
    w.setUint16(12, 0, true); w.setUint16(14, 0x2821, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, dados.length, true); w.setUint32(24, dados.length, true);
    w.setUint16(28, nome.length, true);
    w.setUint32(42, desl, true);
    c.set(nome, 46);
    central.push(c);
    desl += cab.length + dados.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desl, true);
  return new Blob([...partes, ...central, fim], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* XML 1.0 não aceita caractere de controle; texto vindo de campo livre pode
   ter, e um só deixa o arquivo ilegível para o Excel. */
const limpar = s => String(s).replace(/[ --]/g, '');
const x = s => limpar(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function coluna(n) {          // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

const valorDeCelula = v => {
  if (v == null) return null;
  if (typeof v === 'number') return { n: v };
  if (typeof v === 'boolean') return { t: v ? 'SIM' : 'NÃO' };
  if (typeof v === 'object') return { t: JSON.stringify(v) };
  return { t: String(v) };
};

/** Uma aba: primeira linha com os nomes das colunas, o resto é dado. */
function aba(linhas) {
  const corpo = linhas.map((linha, i) => {
    const celulas = linha.map((v, j) => {
      const c = valorDeCelula(v);
      const ref = coluna(j + 1) + (i + 1);
      if (c == null) return '';
      if (c.n != null) return `<c r="${ref}"><v>${c.n}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(c.t)}</t></is></c>`;
    }).join('');
    return `<row r="${i + 1}">${celulas}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${corpo}</sheetData></worksheet>`;
}

/* O Excel recusa nome de aba com : \ / ? * [ ] e acima de 31 caracteres. */
function nomeDeAba(nome, usados) {
  let n = limpar(nome).replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'aba';
  let base = n, i = 2;
  while (usados.has(n.toLowerCase())) { n = `${base.slice(0, 28)}_${i++}`; }
  usados.add(n.toLowerCase());
  return n;
}

function planilha(abas) {           // [{nome, linhas}]
  const usados = new Set();
  const nomes = abas.map(a => nomeDeAba(a.nome, usados));
  const arquivos = [
    {
      nome: '[Content_Types].xml',
      dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      nome: '_rels/.rels',
      dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      nome: 'xl/workbook.xml',
      dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + nomes.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + '</Relationships>',
    },
  ];
  abas.forEach((a, i) => arquivos.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: aba(a.linhas) }));
  return zipar(arquivos);
}

/** Cada tabela vira uma aba: as colunas são a união das chaves das linhas. */
function abasDoBackup(dados, resumo, quando, extras = {}) {
  const { esquecidas, temEsquema } = extras;
  const avisos = [];
  if (esquecidas === null) avisos.push(['ATENÇÃO', 'Não deu para conferir se há tabela nova fora do backup.']);
  else if (esquecidas?.length) avisos.push(['ATENÇÃO', `Tabelas que existem no banco e NÃO estão neste backup: ${esquecidas.join(', ')}. Pedir ao Claude para incluir em js/backup.js.`]);
  if (!temEsquema) avisos.push(['ATENÇÃO', 'O arquivo …-esquema.sql (estrutura do banco) não foi gerado. Só com os dados não dá para reconstruir o sistema.']);
  const abas = [{
    nome: 'Resumo',
    linhas: [
      ['Backup do LOP - Gestão Rápida (todas as áreas) · SAKUMA Agronegócios'],
      ['Gerado em', carimboHora(quando)],
      ['Gerado por', estado.sessao?.user?.email || ''],
      ['Arquivos', temEsquema ? 'planilha .xlsx (leitura) · .json (dados) · -esquema.sql (estrutura)' : 'planilha .xlsx (leitura) · .json (dados)'],
      ...avisos,
      [],
      ['Módulo', 'Tabela', 'Registros', 'Observação'],
      ...resumo.map(r => [r.grupo, r.tabela, r.registros, r.obs]),
      [],
      ['Total de registros', resumo.reduce((s, r) => s + r.registros, 0)],
    ],
  }];
  for (const { chave } of TABELAS) {
    const linhas = dados[chave] || [];
    const colunas = [];
    linhas.forEach(l => Object.keys(l).forEach(k => { if (!colunas.includes(k)) colunas.push(k); }));
    abas.push({
      nome: chave,
      linhas: colunas.length
        ? [colunas, ...linhas.map(l => colunas.map(c => l[c]))]
        : [['(sem registros)']],
    });
  }
  return abas;
}


/* ---------------- pasta fixa ---------------- */
/* O "atalho" da pasta (FileSystemDirectoryHandle) não cabe no localStorage;
   o IndexedDB guarda ele inteiro. Vale para este navegador deste computador. */
const BD = 'lop-backup', LOJA = 'pasta';
function idb(modo, fn) {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onerror = () => falha(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
      tx.onerror = () => { db.close(); falha(tx.error); };
    };
  });
}
const lerPasta = () => idb('readonly', s => s.get('h')).catch(() => null);
const gravarPasta = h => idb('readwrite', s => s.put(h, 'h'));
const esquecerPasta = () => idb('readwrite', s => s.delete('h')).catch(() => {});

/** Chrome/Edge do computador sabem gravar numa pasta; celular e Safari não. */
export const temPastaFixa = () => typeof window.showDirectoryPicker === 'function';

/** Abre o seletor de pasta e guarda a escolha. Precisa vir de um clique. */
export async function escolherPasta() {
  const h = await window.showDirectoryPicker({ id: 'lop-backup', mode: 'readwrite', startIn: 'documents' });
  await gravarPasta(h);
  return h;
}

/* Devolve a pasta pronta para gravar, pedindo a permissão de novo se o
   navegador tiver esquecido (acontece depois de reiniciar o Chrome). Chamar
   logo no começo do clique: o Chrome só mostra o pedido perto do toque. */
async function pastaPronta() {
  if (!temPastaFixa()) return null;
  let h = await lerPasta();
  if (!h) h = await escolherPasta();
  const opc = { mode: 'readwrite' };
  if (await h.queryPermission(opc) === 'granted') return h;
  return (await h.requestPermission(opc)) === 'granted' ? h : null;
}

async function gravarNaPasta(h, blob, nome) {
  const arq = await h.getFileHandle(nome, { create: true });
  const w = await arq.createWritable();
  await w.write(blob);
  await w.close();
}

/* ---------------- download (reserva) ---------------- */
function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- último backup (por navegador) ---------------- */
const K_ULTIMO = 'lop-backup-ultimo';
function lerUltimo() { try { return JSON.parse(localStorage.getItem(K_ULTIMO) || 'null'); } catch { return null; } }
function gravarUltimo(u) { try { localStorage.setItem(K_ULTIMO, JSON.stringify(u)); } catch { /* sem armazenamento: só não lembra */ } }

/* ---------------- a rotina ---------------- */
/**
 * Lê tudo, monta os dois arquivos e entrega: na pasta fixa quando dá, senão
 * em Downloads. Devolve { resumo, total, falhas, destino, pasta, nome }.
 */
export async function gerarBackup(passo = () => {}, { usarPasta = true } = {}) {
  // 1º a pasta (ainda dentro do clique), depois a leitura demorada.
  let pasta = null, motivoSemPasta = '';
  if (usarPasta && temPastaFixa()) {
    try { pasta = await pastaPronta(); if (!pasta) motivoSemPasta = 'sem permissão na pasta'; }
    catch (e) { motivoSemPasta = e.name === 'AbortError' ? 'pasta não escolhida' : (e.message || String(e)); }
  }

  const quando = new Date();
  const { dados, resumo } = await lerTudo(passo);
  passo('Conferindo se há tabela nova fora do backup…');
  const esquecidas = await tabelasEsquecidas();
  passo('Lendo a estrutura do banco (esquema)…');
  const esquemaSql = await lerEsquema();

  passo('Montando a planilha…');
  const xlsx = planilha(abasDoBackup(dados, resumo, quando, { esquecidas, temEsquema: !!esquemaSql }));
  const json = new Blob([JSON.stringify({
    app: 'LOP - Gestão Rápida · SAKUMA',
    versao_backup: 3,
    gerado_em: quando.toISOString(),
    gerado_por: estado.sessao?.user?.email || null,
    esquema_no_arquivo: esquemaSql ? '-esquema.sql ao lado deste .json' : null,
    tabelas_fora_do_backup: esquecidas,
    origem: Object.fromEntries(TABELAS.map(t => [t.chave, `${t.esquema}.${t.tabela}`])),
    tabelas: dados,
  }, null, 2)], { type: 'application/json' });
  const sql = esquemaSql ? new Blob([esquemaSql], { type: 'application/sql' }) : null;

  /* Data e hora no nome: dá para ver de quando é cada um, e um segundo
     backup no mesmo dia não apaga o primeiro. */
  const nome = `backup-lop-gestao-rapida-${carimbo(quando)}_${doisDig(quando.getHours())}h${doisDig(quando.getMinutes())}`;

  let destino = 'downloads';
  if (pasta) {
    passo(`Gravando na pasta ${pasta.name}…`);
    try {
      await gravarNaPasta(pasta, xlsx, `${nome}.xlsx`);
      await gravarNaPasta(pasta, json, `${nome}.json`);
      if (sql) await gravarNaPasta(pasta, sql, `${nome}-esquema.sql`);
      destino = 'pasta';
    } catch (e) {
      // pasta apagada, movida ou sem espaço: não perde o backup, baixa
      motivoSemPasta = `não deu para gravar na pasta (${e.message || e})`;
      if (e.name === 'NotFoundError') await esquecerPasta();
    }
  }
  if (destino === 'downloads') {
    baixar(xlsx, `${nome}.xlsx`);
    /* O Chrome descarta o segundo download quando os dois saem no mesmo
       instante; meio segundo entre um e outro resolve. */
    await new Promise(r => setTimeout(r, 600));
    baixar(json, `${nome}.json`);
    if (sql) { await new Promise(r => setTimeout(r, 600)); baixar(sql, `${nome}-esquema.sql`); }
  }

  const total = resumo.reduce((s, r) => s + r.registros, 0);
  const falhas = resumo.filter(r => r.obs);
  const avisos = [];
  if (!sql) avisos.push('a estrutura do banco (-esquema.sql) não foi gerada');
  if (esquecidas === null) avisos.push('não deu para conferir tabelas novas');
  else if (esquecidas.length) avisos.push(`${esquecidas.length} tabela(s) do banco estão fora do backup: ${esquecidas.join(', ')}`);
  gravarUltimo({ quando: quando.toISOString(), total, falhas: falhas.length + avisos.length, destino,
    pasta: destino === 'pasta' ? pasta.name : '' });
  return { resumo, total, falhas, avisos, temEsquema: !!sql, destino, pasta: pasta?.name || '', nome, motivoSemPasta };
}

/** Frase única de "deu certo", usada pelos dois botões. */
function frasePronto(r) {
  const onde = r.destino === 'pasta'
    ? `salvos na pasta "${r.pasta}"`
    : `baixados para Downloads${r.motivoSemPasta ? ` (${r.motivoSemPasta})` : ''}`;
  const oque = r.temEsquema ? 'planilha, .json e esquema' : 'planilha e .json';
  return `Backup pronto: ${r.total.toLocaleString('pt-BR')} registros, ${oque} ${onde}.`
    + (r.falhas.length ? ` Atenção: ${r.falhas.length} tabela(s) não vieram — a aba Resumo diz qual e por quê.` : '')
    + (r.avisos?.length ? ` Atenção: ${r.avisos.join('; ')}.` : '');
}

function textoUltimo() {
  const u = lerUltimo();
  if (!u) return 'Nenhum backup feito neste computador ainda.';
  const d = new Date(u.quando);
  return `Último: ${dataBr(d)} · ${Number(u.total || 0).toLocaleString('pt-BR')} registros`
    + (u.destino === 'pasta' && u.pasta ? ` · pasta "${u.pasta}"` : ' · Downloads')
    + (u.falhas ? ` · ${u.falhas} aviso(s) — ver aba Resumo` : '');
}

async function textoPasta() {
  if (!temPastaFixa()) return 'Neste aparelho os arquivos vão para Downloads.';
  const h = await lerPasta();
  return h ? `Salva direto na pasta "${h.name}".` : 'Na primeira vez o app pergunta em qual pasta salvar e guarda a escolha.';
}

/* ---------------- faixa da tela inicial (só administrador) ---------------- */
/**
 * Desenha a faixa "Backup de todo o app" num elemento (a #arPe da tela das
 * áreas). Quem chama já conferiu que é administrador.
 */
export async function desenharBackupInicio(alvo, avisar = () => {}) {
  if (!alvo) return;
  /* 20/10/2026, pedido dele: o backup vira um ícone igual aos das áreas, só
     que menor. Tocar no ícone faz o backup; "trocar pasta" fica embaixo, em
     letra pequena, e o detalhe completo do último backup vai no title. */
  alvo.innerHTML = `
    <div class="arb-mini" role="group" aria-label="Backup de todo o app">
      <button type="button" class="ar-cartao arb-tile" id="arbFazer">
        <img src="icons/area-backup.v2.svg" alt="">
        <span class="ar-txt"><b>Backup</b></span>
        <small class="arb-quando" id="arbStatus"></small>
      </button>
      ${temPastaFixa() ? '<button type="button" class="arb-link" id="arbPasta">trocar pasta</button>' : ''}
    </div>`;
  const status = $('arbStatus');
  const botao = $('arbFazer');
  const curto = () => {
    const u = lerUltimo();
    if (!u) return 'nunca feito';
    const d = new Date(u.quando);
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  };
  const atualizar = async () => {
    botao.title = `Fazer backup de todo o app\n${await textoPasta()}\n${textoUltimo()}`;
    status.textContent = curto();
  };
  await atualizar();

  $('arbPasta')?.addEventListener('click', async () => {
    try { await escolherPasta(); await atualizar(); }
    catch (e) { if (e.name !== 'AbortError') avisar(`Não deu para escolher a pasta: ${e.message || e}`); }
  });

  botao.addEventListener('click', async () => {
    if (botao.disabled) return;
    botao.disabled = true;
    botao.classList.add('arb-fazendo');
    status.textContent = 'fazendo…';
    try {
      const r = await gerarBackup(() => { status.textContent = 'fazendo…'; });
      await atualizar();
      avisar(frasePronto(r));
    } catch (e) {
      await atualizar();
      avisar(`Não deu para gerar o backup: ${e.message || e}`);
    } finally { botao.disabled = false; botao.classList.remove('arb-fazendo'); }
  });
}

/* ---------------- cartão em Usuários - Acessos ---------------- */
export function ligarBackup(avisar = () => {}) {
  const botao = $('cfBackup');
  if (!botao) return;
  const status = $('cfBackupStatus');
  const dizer = t => { if (status) status.textContent = t; };

  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      const r = await gerarBackup(dizer);
      dizer(textoUltimo());
      avisar(frasePronto(r));
    } catch (e) {
      dizer('');
      avisar(`Não deu para gerar o backup: ${e.message || e}`);
    } finally { botao.disabled = false; }
  });
}
