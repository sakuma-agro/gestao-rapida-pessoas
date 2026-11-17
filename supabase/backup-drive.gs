/**
 * Backup automático do LOP - Gestão Rápida no Google Drive.
 * Como ligar (uma vez só):
 *  1. No Supabase → SQL Editor, rodar supabase/backup-automatico.sql.
 *  2. script.google.com → Novo projeto → apagar o que vier e colar este arquivo.
 *     Em ⚙ Configurações do projeto, fuso horário "(GMT-03:00) São Paulo".
 *  3. Escolher a função "configurar" no alto e clicar em Executar
 *     (o Google pede para autorizar Drive, e-mail e acesso externo: permitir).
 *  4. Copiar a linha "insert into public.backup_config …" do Registro de
 *     execução, colar no SQL Editor do Supabase e clicar em Run.
 *  5. Testar: escolher "fazerBackup" e Executar. A pasta "Backup LOP" aparece no Drive.
 * Trocar a senha: apagar a propriedade SENHA_BACKUP (⚙ → Propriedades do
 * script), rodar "configurar" de novo e colar a nova linha no SQL Editor.
 *
 * Todo dia, de madrugada, "fazerBackup":
 *  · chama a função backup-drive do Supabase com a senha do backup;
 *  · salva na pasta "Backup LOP" do Drive:
 *      lop-backup-AAAA-MM-DD.json        (todos os dados)
 *      lop-backup-AAAA-MM-DD-esquema.sql (a estrutura do banco)
 *  · baixa para "Backup LOP/arquivos" só as fotos e anexos novos ou alterados;
 *  · guarda os últimos MANTER_DIAS backups e manda o resto para a lixeira;
 *  · se der erro, manda e-mail para a conta dona do script.
 *
 * A senha do backup é criada aqui e só existe nas propriedades deste script.
 * O banco guarda apenas a "impressão digital" (sha256) dela.
 */
const CONFIG = {
  URL: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/backup-drive',
  PASTA: 'Backup LOP',
  MANTER_DIAS: 30,
  HORA: 3, // 3h da manhã (fuso do projeto do Apps Script)
};
const FUSO = 'America/Sao_Paulo';

/** Rode UMA vez. Cria a senha (se ainda não existir), agenda o backup diário
 *  e mostra no "Registro de execução" a linha de SQL para colar no Supabase. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let senha = props.getProperty('SENHA_BACKUP');
  if (!senha) {
    senha = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SENHA_BACKUP', senha);
  }
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'fazerBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('fazerBackup').timeBased().everyDays(1).atHour(CONFIG.HORA).inTimezone(FUSO).create();

  const sql = "insert into public.backup_config (id, token_sha256) values (1, '" + sha256(senha) + "') " +
    'on conflict (id) do update set token_sha256 = excluded.token_sha256, atualizado_em = now();';
  console.log('Backup agendado para todo dia às ' + CONFIG.HORA + 'h.');
  console.log('Cole a linha abaixo no SQL Editor do Supabase e clique em Run:');
  console.log(sql);
}

/** O backup em si. Roda sozinho todo dia; pode rodar na mão para testar. */
function fazerBackup() {
  try {
    const senha = PropertiesService.getScriptProperties().getProperty('SENHA_BACKUP');
    if (!senha) throw new Error('Senha do backup não existe: rode "configurar" primeiro.');

    const r = UrlFetchApp.fetch(CONFIG.URL, {
      method: 'post',
      headers: { 'x-backup-token': senha },
      muteHttpExceptions: true,
    });
    const texto = r.getContentText('UTF-8');
    if (r.getResponseCode() !== 200) throw new Error('Supabase respondeu ' + r.getResponseCode() + ': ' + texto.slice(0, 500));
    const corpo = JSON.parse(texto);

    const pasta = pastaPrincipal();
    const dia = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
    const esquema = corpo.esquema_sql;
    delete corpo.esquema_sql;
    substituir(pasta, 'lop-backup-' + dia + '.json', JSON.stringify(corpo), 'application/json');
    if (esquema) substituir(pasta, 'lop-backup-' + dia + '-esquema.sql', esquema, 'text/plain');

    const avisos = [];
    (corpo.resumo || []).filter(x => x.obs).forEach(x => avisos.push(x.tabela + ': ' + x.obs));
    if (corpo.obs_esquema) avisos.push(corpo.obs_esquema);
    if (corpo.obs_arquivos) avisos.push(corpo.obs_arquivos);
    avisos.push(...baixarArquivos(pasta, corpo.arquivos || []));
    limparAntigos(pasta);

    const registros = (corpo.resumo || []).reduce((s, x) => s + x.registros, 0);
    console.log('Backup ' + dia + ': ' + (corpo.resumo || []).length + ' tabelas, ' + registros + ' registros.');
    if (avisos.length) avisar('Backup LOP ' + dia + ' — feito, com avisos', avisos.join('\n'));
  } catch (e) {
    avisar('Backup LOP — FALHOU', String(e && e.stack || e));
    throw e;
  }
}

function pastaPrincipal() {
  const it = DriveApp.getFoldersByName(CONFIG.PASTA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.PASTA);
}
function subpasta(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}
/** Grava o arquivo; se já existir um com o mesmo nome (rodou 2x no dia), troca. */
function substituir(pasta, nome, conteudo, tipo) {
  const it = pasta.getFilesByName(nome);
  while (it.hasNext()) it.next().setTrashed(true);
  return pasta.createFile(Utilities.newBlob(conteudo, tipo, nome));
}

/** Baixa só o que é novo ou mudou (compara a data de alteração guardada na descrição). */
function baixarArquivos(pasta, arquivos) {
  const destino = subpasta(pasta, 'arquivos');
  const avisos = [];
  arquivos.forEach(a => {
    const nome = a.bucket + '__' + a.nome.replace(/\//g, '__');
    const it = destino.getFilesByName(nome);
    const atual = it.hasNext() ? it.next() : null;
    if (atual && atual.getDescription() === a.atualizado) return;
    if (!a.url) { avisos.push('arquivo sem link: ' + nome); return; }
    try {
      const r = UrlFetchApp.fetch(a.url, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
      if (atual) atual.setTrashed(true);
      destino.createFile(r.getBlob().setName(nome)).setDescription(a.atualizado);
    } catch (e) {
      avisos.push('arquivo não baixou: ' + nome + ' (' + e + ')');
    }
  });
  return avisos;
}

/** Mantém os últimos MANTER_DIAS dias de backup; o resto vai para a lixeira. */
function limparAntigos(pasta) {
  const porDia = {};
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(/^lop-backup-(\d{4}-\d{2}-\d{2})/);
    if (m) (porDia[m[1]] = porDia[m[1]] || []).push(f);
  }
  Object.keys(porDia).sort().reverse().slice(CONFIG.MANTER_DIAS)
    .forEach(d => porDia[d].forEach(f => f.setTrashed(true)));
}

function avisar(assunto, texto) {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), assunto, texto);
}
function sha256(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
