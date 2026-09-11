# Gestão Rápida (Pessoas) · SAKUMA Agronegócios

Aplicativo web para cadastrar funcionários e imprimir as fichas de EPI em A4,
reproduzindo célula por célula a aba **Ficha EPI** da planilha
`FICHA DE EPI  NOVA 2025.xlsx`.

Funciona no computador e no celular, pode ser instalado como aplicativo
e continua abrindo sem internet.

---

## O que ele faz

- **Fichas** — marca os funcionários, preenche as linhas de EPI direto na tela
  (com sugestão do catálogo, que já completa o C.A) e imprime uma página por pessoa.
- **Funcionários** — cadastra, edita e desativa. Nome, nº de cadastro, admissão,
  cargo, empregador, CPF, setor, tamanhos e situação.
- **EPIs** — catálogo de equipamentos com C.A, observação e atividade.
- **Modelo da ficha** — muda os textos fixos impressos (título, legendas FAZ e
  M.E.R, declarações, rodapé), valendo para todos os usuários.

Tudo fica salvo no Supabase e é compartilhado entre os usuários. O que você
digita sem internet fica numa fila e sobe sozinho quando a conexão volta.

---

## Instalar no computador e no celular

Abra o endereço do app no navegador e:

- **Android / Chrome** — menu ⋮ → *Instalar aplicativo*.
- **iPhone / Safari** — botão compartilhar → *Adicionar à Tela de Início*.
- **Windows / Chrome ou Edge** — ícone de instalar na barra de endereço,
  ou o botão **Instalar app** no topo da tela.

---

## Supabase

O projeto já está configurado e embutido no app — ninguém precisa colar
nada ao abrir. O que foi feito:

- Projeto `gestao-rapida-pessoas` na organização `sakuma-agro`, região São Paulo.
  (a referência do projeto continua `ysvmfmnwbcxgsrjewwsy` — é ela que manda na URL e na chave)
- Tabelas, índices e regras de acesso do [`supabase.sql`](supabase.sql).
- **Cadastro público desligado**: ninguém cria conta sozinho.
- Confirmação de e-mail desligada, já que só o administrador cria usuários.

### Liberar acesso para alguém

Em **Authentication → Users → Add user → Create new user**, informe
e-mail e senha e marque **Auto Confirm User**. Só quem estiver nessa
lista consegue entrar.

Na primeira entrada, os **51 funcionários** e os **26 EPIs** da planilha
são carregados automaticamente.

### Sobre a chave no código

A chave gravada em `js/store.js` é a *publishable*, feita para ficar
visível no navegador. Quem protege os dados são as regras de acesso (RLS)
do `supabase.sql`, que só liberam leitura e escrita para quem está logado —
sem login, a chave não enxerga nada. Para apontar o app para outro projeto,
use **Trocar de projeto Supabase** na tela de login.

---

## Como a ficha foi reproduzida

As medidas saíram direto do arquivo `.xlsx`:

| Item | Origem |
|---|---|
| Larguras das colunas | A 10 · B 31 · C 11,29 · D 20,29 · E 49,14 · F 31 · G 49,43 · H 18,71 |
| Alturas das linhas | 25,15pt (cabeçalho) · 30pt (dados) · 20,25pt (declarações) · 49,9pt (tabela) |
| Escala de impressão | 42%, igual à configurada na planilha |
| Papel | A4 retrato, margens 20mm em cima/baixo e 13mm nas laterais |
| Fontes | Arial nos tamanhos originais (10 a 20pt), Times New Roman na linha de assinatura |
| Bordas | `medium` e `thin` do Excel, na mesma posição de cada célula |

Conferido contra o PDF gerado pela própria planilha: **181,7mm de largura**
(mesma medida) e diferença de altura abaixo de 4mm.

---

## Estrutura

```
index.html              telas e diálogos
css/app.css             interface + reprodução da ficha
js/app.js               eventos e navegação
js/store.js             Supabase, cache local e fila offline
js/ficha.js             montagem da ficha
js/seed.js              dados extraídos da planilha
vendor/supabase.js      biblioteca supabase-js 2.112.4
sw.js                   service worker (funciona sem internet)
supabase.sql            tabelas, índices e regras de acesso
```

Sem build, sem dependências para instalar: são arquivos estáticos.
Para rodar na sua máquina, `python3 -m http.server` na pasta e abra
`http://localhost:8000`.
