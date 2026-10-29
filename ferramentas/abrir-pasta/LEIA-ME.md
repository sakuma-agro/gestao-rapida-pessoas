# Abrir pasta no computador (29/10/2026)

O botão **💻 No computador** da Lista mestra (Certificação) abre a pasta do documento no
Explorador de Arquivos. Navegador não abre pasta do Windows sozinho, então cada computador
precisa deste atalho, instalado **uma vez**:

1. Dê dois cliques em `instalar.bat` (não precisa ser administrador).
2. No app, clique em **💻 No computador**. O Chrome pergunta "Abrir LOP - abrir pasta?":
   marque **Sempre permitir** e clique em **Abrir**.

Segurança: `abrir-pasta.ps1` só abre **pastas que existem dentro do OneDrive** do computador
(C:\NUVEM\OneDrive no sakumasrv; nos outros, a pasta do OneDrive do usuário). Nada é executado.
Desinstalar: apagar a chave `HKCU\Software\Classes\lop-pasta` e a pasta `%LOCALAPPDATA%\LOP`.
