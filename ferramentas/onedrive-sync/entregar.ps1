# LOP - Gestão Rápida — grava no OneDrive o que foi anexado no app na Certificação (30/10/2026).
# Pedido do Guilherme: "deixe o Drive somente para os outros apps, vamos usar na certificação o OneDrive" (opção 1).
# Roda a cada 5 minutos (tarefa agendada "LOP - Entregar anexos no OneDrive", criada pelo sincronizar.ps1).
#  - pega no app a lista do que foi anexado e ainda não está no OneDrive (arquivos.od_destino);
#  - baixa e grava na pasta certa dentro de "6 - Certificações" (se já existir um arquivo com o mesmo
#    nome, grava como "nome (2).pdf" — nunca sobrescreve);
#  - avisa o app (origem = onedrive:<caminho>), e o sincronizador não manda de novo;
#  - arquivo que o app mandou e depois foi apagado no app vai para 7 - CONFIGURAÇÕES\Para apagar.
# O que acontece fica em sincronizar.log, nesta pasta.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base   = 'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações'
$Lixo   = Join-Path $Base '7 - CONFIGURAÇÕES\Para apagar'
$Url    = 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/onedrive-sync'
$Aqui   = $PSScriptRoot
$Token  = (Get-Content -Raw -Encoding UTF8 (Join-Path $Aqui 'token.txt')).Trim()
$Log    = Join-Path $Aqui 'sincronizar.log'
$Trava  = Join-Path $Aqui 'entregar.lock'

function Log($t) { try { Add-Content -Encoding UTF8 -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $t) } catch { } }
function Postar($acao, $obj) {
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  Invoke-RestMethod -Method Post -Uri "$Url`?acao=$acao" -Headers @{ 'x-sync-token' = $Token } -ContentType 'application/json; charset=utf-8' -Body $b -TimeoutSec 120 | Out-Null
}
function LivreNome($caminho) {
  if (-not (Test-Path -LiteralPath $caminho)) { return $caminho }
  $dir = Split-Path $caminho -Parent; $nome = [IO.Path]::GetFileNameWithoutExtension($caminho); $ext = [IO.Path]::GetExtension($caminho)
  $i = 2
  while (Test-Path -LiteralPath (Join-Path $dir ("{0} ({1}){2}" -f $nome, $i, $ext))) { $i++ }
  return (Join-Path $dir ("{0} ({1}){2}" -f $nome, $i, $ext))
}

if (Test-Path $Trava) { if ((Get-Item $Trava).LastWriteTime -gt (Get-Date).AddMinutes(-30)) { exit 0 } }
Set-Content -Path $Trava -Value $PID
try {
  if (-not (Test-Path -LiteralPath $Base)) { exit 0 }
  $H = @{ 'x-sync-token' = $Token }
  $p = Invoke-RestMethod -Method Get -Uri "$Url`?acao=pendentes" -Headers $H -TimeoutSec 120
  $n = 0; $nl = 0
  foreach ($a in @($p.arquivos)) {
    if (-not $a) { continue }
    try {
      $rel = ([string]$a.od_destino).Trim('/') -replace '/', '\'
      if ($rel -match '\.\.') { throw "caminho inválido: $rel" }
      $dest = Join-Path $Base $rel
      New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
      $tmp = Join-Path $env:TEMP ("lop-entrega-" + [guid]::NewGuid().ToString() + ".tmp")
      Invoke-WebRequest -Uri ("$Url`?acao=baixar&chave=" + [uri]::EscapeDataString([string]$a.chave)) -Headers $H -OutFile $tmp -UseBasicParsing -TimeoutSec 300
      if (Test-Path -LiteralPath $dest) {
        $igual = ((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash)
        if ($igual) { Remove-Item -LiteralPath $tmp -Force; $final = $dest }
        else { $final = LivreNome $dest; Move-Item -LiteralPath $tmp -Destination $final }
      } else { $final = $dest; Move-Item -LiteralPath $tmp -Destination $final }
      $relFinal = $final.Substring($Base.Length + 1) -replace '\\', '/'
      Postar 'entregue' @{ chave = [string]$a.chave; rel = $relFinal }
      $n++
    } catch { Log "Entrega no OneDrive: ERRO em $($a.od_destino) : $($_.Exception.Message)" }
  }
  foreach ($l in @($p.lixo)) {
    if (-not $l) { continue }
    try {
      $src = Join-Path $Base (([string]$l.rel) -replace '/', '\')
      if (Test-Path -LiteralPath $src) {
        New-Item -ItemType Directory -Force -Path $Lixo | Out-Null
        Move-Item -LiteralPath $src -Destination (LivreNome (Join-Path $Lixo ("{0:yyyy-MM-dd} {1}" -f (Get-Date), (Split-Path $src -Leaf))))
      }
      Postar 'lixo_feito' @{ id = $l.id }
      $nl++
    } catch { Log "Entrega no OneDrive: ERRO ao tirar $($l.rel) : $($_.Exception.Message)" }
  }
  if ($n -or $nl) { Log "Entrega no OneDrive: $n arquivo(s) anexado(s) no app gravado(s) na pasta; $nl tirado(s) para 7 - CONFIGURAÇÕES\Para apagar." }
} catch {
  Log "Entrega no OneDrive: erro $($_.Exception.Message)"
} finally {
  Remove-Item -Path $Trava -Force -ErrorAction SilentlyContinue
}
