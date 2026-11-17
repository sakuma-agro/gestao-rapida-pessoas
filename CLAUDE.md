# CLAUDE.md — LOP - Gestão Rápida (SAKUMA)

Leia primeiro o [ESTADO.md](ESTADO.md): áreas do app, onde fica cada coisa, rotinas automáticas e como publicar.

- App: https://sakuma-agro.github.io/gestao-rapida-pessoas/ (GitHub Pages, branch `main`)
- Banco: Supabase, projeto `ysvmfmnwbcxgsrjewwsy` (dados de funcionários, com CPF)

## Como trabalhar com o responsável

- Escrever em português simples, sem termos técnicos desnecessários.
- Uma melhoria por vez. Antes de mexer: ler o código envolvido, explicar em poucas linhas o que vai fazer e esperar a aprovação.
- Antes de cada commit/push: mostrar o resumo e esperar o "ok".
- Quando ele disser "faça você", fazer de ponta a ponta com as ferramentas disponíveis, sem devolver passo a passo para ele. Só ficam com ele as senhas e os logins.

## Regras do projeto (sempre)

- A cada publicação, subir o número de `VERSAO` no `sw.js`. Arquivo novo do app entra também na lista `ARQUIVOS` do `sw.js`.
- Testar localmente antes de publicar: servir a pasta (`python -m http.server 8765`), abrir `http://127.0.0.1:8765/index.html` e conferir que não há erro no console.
- Nunca digitar senha. Login e senha é o responsável que coloca.
- Não reativar o cadastro público do Supabase.
- Não mexer nas medidas da ficha de EPI impressa (182,0 mm de largura).
- Não renomear o repositório nem mudar o endereço do app.
- Nos documentos impressos, só a marca da LOP no rodapé, sem nome de pessoa.

## Cuidados ao publicar

- Outras pessoas também publicam na `main`. Antes de enviar: `git fetch` e `git rebase origin/main`. Se o outro envio usou o mesmo número de `VERSAO`, subir mais um.
- Depois do push, o GitHub Pages leva cerca de 1 minuto. Conferir que o `sw.js` publicado mostra a versão nova.
- A versão nova só assume quando a pessoa toca na faixa "Tem atualização — toque para recarregar". Não recolocar `skipWaiting` no `install` do `sw.js`.

## Banco (Supabase)

- O conector do Supabase recusa comandos que **apagam** (`DROP`). Separar o SQL em partes; para trocar uma função que muda de retorno, renomear a antiga (`alter function … rename to …_antiga`) e criar a nova. Se precisar mesmo apagar, pedir ao responsável para rodar no SQL Editor.
- Tabela nova: ligar RLS e não liberar leitura para `anon`.
- Backup diário: função `backup-drive` (pasta "Backup LOP" no Drive), registro em `backup_execucoes`. Tabela nova entra sozinha no backup.
