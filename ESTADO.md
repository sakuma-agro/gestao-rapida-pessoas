# Estado do LOP - Gestão Rápida (SAKUMA)

Atualizado em 17/11/2026 (versão `gr-v714`).

- **Endereço:** https://sakuma-agro.github.io/gestao-rapida-pessoas/ (GitHub Pages, repositório `sakuma-agro/gestao-rapida-pessoas`)
- **Banco:** Supabase, projeto `ysvmfmnwbcxgsrjewwsy`
- **Tipo:** app web instalável. Abre sem internet e guarda o que foi digitado offline numa fila, que sobe quando a conexão volta.

## O que o app tem hoje

Cada login vê só as áreas liberadas para ele (área **LOP - Principal → Usuários**).

| Área | O que tem |
|---|---|
| Rastro | Tarefas e prazos de todas as áreas: calendário, Kanban, lembrete no celular |
| Compras | Pedir compra · Meus pedidos · Quadro do comprador (QR code na parede) |
| Evento Cultura | Fotos e vídeos dos eventos de cultura, por ano |
| Pessoas | Cadastros de funcionários · RH · DP (jornada, boletins, férias, empréstimos, holerites, ticket, folha de ponto) |
| SST | EPIs e ficha de EPI · Exames · Treinamentos · Brigada · NRs · Campanhas · Acidentes |
| Máquinas e Patrimônio | Máquinas · Patrimônio · Vencimentos · Ordens de serviço · Check list |
| Certificação | IFA · GRASP · Rainforest · SMETA: listas, cronograma e caderno de campo |
| Vistorias e Segurança | Vistorias · Checklists · Anomalias · Extintores |
| Programação Campo | Painel anual · Por plantio · Atividades · Reunião semanal · Relatório diário |
| Estoque | Contagem · Movimentações · Transferências · Acerto entre fazendas · Cadastros |
| Custo Base | Rateio mensal por cultura · Hora-homem |
| Colheita e Produção | Painel da safra · Cargas · Balança · Beneficiamento · Comercialização · Fretes |
| Outorga e Irrigação | Recebimento e impressão das fichas do mês · Cadastros |
| Projetos (PMBOK) | Termo, EAP, riscos, custos, mudanças · Alertas · Lições aprendidas |
| LOP - Principal | Usuários e acessos · Backup manual |

## Onde fica cada coisa no código

| O quê | Onde |
|---|---|
| Página inicial, login e lista de áreas | `index.html`, `js/app.js`, `js/areas.js`, `js/acesso.js` |
| Pessoas, SST, Certificação, Rastro, Compras | `js/` (um arquivo por módulo: `jornada-*.js`, `sst-*.js`, `cert-*.js`, `cronograma.js`, `compras.js`…) |
| Ficha de EPI impressa | `js/ficha.js` e `css/app.css` |
| Áreas que abrem dentro do app | uma pasta cada: `estoque/`, `programacao/`, `manutencoes/`, `custobase/`, `colheita/`, `outorga/`, `projetos/`, `vistorias/` |
| Conexão com o banco | `js/store.js` (chave pública; quem protege os dados são as regras de acesso do banco) |
| Estrutura do banco | `supabase.sql` e `supabase/*.sql` (um arquivo por módulo) |
| Funções do servidor | `supabase/functions/` (backup no Drive, anexos, lembretes, consultas…) |
| Funcionamento sem internet e versão | `sw.js` (`VERSAO` e lista `ARQUIVOS`) |
| Backup manual (botão no app) | `js/backup.js`; como restaurar: `supabase/RESTAURAR.md` |

## Rotinas automáticas

- **Banco acordado:** o GitHub faz uma leitura no banco a cada 2 dias (`.github/workflows/manter-banco-ativo.yml`). A chave fica no secret `SUPABASE_ANON_KEY` do repositório.
- **Backup diário no Drive:** todo dia às 3h o próprio banco dispara a função `backup-drive`. Ela salva na pasta **Backup LOP** do Drive da escritoriosakuma1@gmail.com os dados (`.json`), a estrutura (`-esquema.sql`) e as fotos e anexos novos. Guarda 30 dias. Cada execução fica registrada na tabela `backup_execucoes`.
- **Aviso:** se o banco não responder, ou se o último backup tiver mais de 2 dias, a rotina do GitHub fica vermelha e o GitHub manda e-mail.
- **Atualização do app:** quando sai versão nova, aparece a faixa "Tem atualização — toque para recarregar". Nada recarrega sozinho.

## Como publicar

1. Fazer a mudança.
2. No `sw.js`, subir o número de `VERSAO` (ex.: `gr-v714` → `gr-v715`). Se criou arquivo novo do app, colocar também na lista `ARQUIVOS`.
3. Testar localmente: na pasta do projeto, rodar `python -m http.server 8765`, abrir `http://127.0.0.1:8765/index.html` e conferir no console (F12) que não há erro.
4. Antes de enviar, buscar o que outras pessoas publicaram (`git pull`). Se alguém usou o mesmo número de versão, subir mais um.
5. Enviar ao GitHub (`git push`). Em cerca de 1 minuto o site atualiza e os aparelhos mostram a faixa de atualização.

## Regras do projeto (sempre)

- A cada publicação, subir o número de `VERSAO` no `sw.js`. Arquivo novo entra também na lista `ARQUIVOS` do `sw.js`.
- Testar localmente antes de publicar: abrir o `index.html` por um servidor local e conferir que não há erro no console.
- Nunca digitar senha. Login e senha é o responsável que coloca.
- Não reativar o cadastro público do Supabase (o banco tem CPF e dados dos funcionários).
- Não mexer nas medidas da ficha de EPI impressa (182,0 mm de largura).
- Não renomear o repositório nem mudar o endereço do app.
- Nos documentos impressos, só a marca da LOP no rodapé, sem nome de pessoa.
- Escrever em português simples, sem termos técnicos desnecessários.
