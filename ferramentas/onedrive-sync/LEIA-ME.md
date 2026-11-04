# Sincronizar OneDrive → app (Certificação)

Instalado no sakumasrv em `C:\Users\Sakuma\Documents\LOP-Sync` (fora do OneDrive).
Tarefa agendada do Windows "LOP - Sincronizar OneDrive", a cada hora.

- `sincronizar.ps1` varre `6 - Certificações\1 - PROCEDIMENTOS, 2 - FORMULÁRIOS, 3 - ANEXOS, 4 - POLÍTICAS, 5 - REGISTROS, 6 - CHECK LIST`
  e manda PDF/JPG/PNG novos ou alterados (até 15 MB) para a função `onedrive-sync`.
- `token.txt` (só no sakumasrv, não vai para o git): chave conferida pelo sha-256 em
  `public.sync_tokens` (nome `sakumasrv-onedrive`). Para trocar: gerar outra, gravar o
  hash na tabela e o texto no token.txt.
- `estado.json`: o que já subiu (caminho → tamanho|data). Apagar faz reenviar tudo
  (não duplica: o servidor atualiza pela origem).
- `sincronizar.log`: o que aconteceu.
- Para instalar de novo: dois cliques em `instalar.bat`.

## Padronizar as pastas (03/11/2026)

`padronizar.ps1` arruma as pastas dos AN e RG no padrão **documento › ano › fazenda › arquivo**
(documento "Padronização das pastas e arquivos — AN e RG"). Copiar para esta pasta e rodar:

1. `powershell -ExecutionPolicy Bypass -File padronizar.ps1 -Lote alta` → só gera `padronizar-previa.csv`
   (de;para;motivo). Nada é movido. Conferir.
2. O mesmo comando com `-Aplicar` → move e grava `movidos.json`. Na próxima sincronização o app troca o
   caminho de cada arquivo (e acerta a data pelo nome novo), sem duplicar evidência.

Lotes: `alta` (21 documentos com periodicidade), `inverter` (5 que só trocam fazenda › ano), `media` (27).
Um documento só: `-Docs "AN 82"`. Não rodar enquanto a sincronização estiver rodando (o script confere).
**Nunca mover à mão** arquivos já sincronizados: o app os vê como novos e a evidência duplica.

### 04/11/2026 — versão em Python (a usada de fato)
`padronizar_previa.py <lote>` gera `padronizar-previa-<lote>.csv` e `previa-<lote>.json` (mesmas regras do .ps1, com a
correção de que pastas com data + descrição/número — `CONTROLE-09-04-2024-14051`, `14-06-2021 - Ferro velho` — ficam).
`padronizar_aplicar.py` move o que está no json e grava `movidos.json` para a sincronização. Lote **alta** aplicado em
04/11/2026: 636 arquivos movidos, 239 pastas vazias tiradas.
