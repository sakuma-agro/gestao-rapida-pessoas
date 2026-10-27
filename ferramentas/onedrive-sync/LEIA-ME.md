# Sincronizar OneDrive → app (Certificação)

Instalado no sakumasrv em `C:\Users\Sakuma\Documents\LOP-Sync` (fora do OneDrive).
Tarefa agendada do Windows "LOP - Sincronizar OneDrive", a cada hora.

- `sincronizar.ps1` varre `Certificação - Lop Gestão Rápida\1 - POP, 2 - FORM, 3 - AN`
  e manda PDF/JPG/PNG novos ou alterados (até 15 MB) para a função `onedrive-sync`.
- `token.txt` (só no sakumasrv, não vai para o git): chave conferida pelo sha-256 em
  `public.sync_tokens` (nome `sakumasrv-onedrive`). Para trocar: gerar outra, gravar o
  hash na tabela e o texto no token.txt.
- `estado.json`: o que já subiu (caminho → tamanho|data). Apagar faz reenviar tudo
  (não duplica: o servidor atualiza pela origem).
- `sincronizar.log`: o que aconteceu.
- Para instalar de novo: dois cliques em `instalar.bat`.
