# Como reconstruir o LOP - Gestão Rápida a partir de um backup

O botão **Fazer backup** (tela inicial, só administrador) grava três arquivos
com a mesma data e hora no nome:

| Arquivo | O que é | Para quê |
|---|---|---|
| `backup-…​.xlsx` | planilha, uma aba por tabela | ler, conferir, arquivar |
| `backup-…​.json` | todas as linhas de todas as tabelas, como estão no banco | recolocar os dados |
| `backup-…-esquema.sql` | a estrutura: tabelas, funções, políticas, gatilhos, grants | reconstruir o banco |

A aba **Resumo** da planilha diz, em vermelho, se alguma tabela do banco ficou
fora do backup ou se o esquema não foi gerado. Backup com aviso vermelho não é
completo — pedir ao Claude para corrigir `js/backup.js` e refazer.

## Se o projeto Supabase for perdido

1. Criar um projeto novo no Supabase (região São Paulo).
2. **SQL Editor** → colar o `…-esquema.sql` inteiro → Run. Tem que terminar
   sem erro (testado em 19/10/2026 num Postgres vazio: 147 tabelas, 56
   funções, 263 políticas, 148 gatilhos).
3. **Integrations › Data API › Settings** → expor os esquemas `manutencao`,
   `vistorias` e `programacao` além do `public`.
4. **Authentication** → criar os logins (os e-mails estão em `app_usuarios`
   no .json); cada pessoa define senha nova. O `id` novo não importa: o app
   reconhece pelo e-mail.
5. Recolocar os dados do `.json`: pedir ao Claude, que tem a ordem das tabelas
   (pais antes de filhos) e grava com a chave `service_role` do projeto novo.
   Nunca colar a chave `service_role` no app nem em chat público.
6. Trocar URL e chave `anon` para o projeto novo em `js/store.js`,
   `manutencoes/js/config.js`, `programacao/js/config.js`,
   `estoque/js/config.js` e `vistorias/lop-antes.js`; subir o `VERSAO` do
   `sw.js` e publicar.
7. Anexos: ficam no Google Drive (conta escritoriosakuma1) e não dependem do
   Supabase. Os poucos antigos no Storage (fotos de vistoria de antes de
   14/10/2026) só se recuperam de um backup do Storage — não há.

## Atenção
- `integracao_privada.destinos` e `manut_importar_pedir()` guardam chaves do
  projeto antigo da Programação Campo. O esquema.sql leva essas chaves no
  texto: guardar o backup em pasta restrita.
- Tabela nova no banco → acrescentar em `js/backup.js` (lista `GRUPOS`). O
  Resumo avisa quando esquecer.
