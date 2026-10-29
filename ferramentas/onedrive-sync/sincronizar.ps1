# LOP - Gestão Rápida — sincroniza a pasta da Certificação no OneDrive com o app.
# Roda no sakumasrv a cada hora (tarefa agendada "LOP - Sincronizar OneDrive").
#
# Varre 1 - POP, 2 - FORM, 3 - AN, 4 - POLÍTICAS e 5 - RG (registros: todo arquivo vira registro do RG) dentro de "Certificação - Lop Gestão Rápida"
# e manda para o app cada PDF/foto novo ou alterado (até 15 MB):
#   - arquivo da pasta do documento  -> vira o PDF/anexo daquele documento no app
#   - arquivo na subpasta de uma fazenda de um AN por fazenda -> evidência daquela fazenda
#   - arquivo na subpasta EVIDÊNCIAS de um documento -> evidência do documento
# Não apaga nada no app nem no OneDrive. Pastas "bkp" ficam de fora.
# Registro do que já subiu: estado.json; o que aconteceu: sincronizar.log (nesta pasta).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base   = 'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações\Certificação - Lop Gestão Rápida'
$Topos  = @('1 - POP', '2 - FORM', '3 - AN', '4 - POLÍTICAS', '5 - RG', '6 - CL')
$Url    = 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/onedrive-sync'
$Aqui   = $PSScriptRoot
$Token  = (Get-Content -Raw -Encoding UTF8 (Join-Path $Aqui 'token.txt')).Trim()
$Estado = Join-Path $Aqui 'estado.json'
$Log    = Join-Path $Aqui 'sincronizar.log'
$Trava  = Join-Path $Aqui 'rodando.lock'
$MaxB   = 15MB

function Log($t) { Add-Content -Encoding UTF8 -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $t) }
function SemAcento($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
}
function Chave($s) { (SemAcento $s).ToUpperInvariant().Trim() }

# Atalho "Abrir no computador" do LOP (29/10/2026, pedido do Guilherme: "faça você"): instala uma vez,
# para este usuário, o link lop-pasta: que abre no Explorador a pasta pedida pelo app.
try {
  $AbrirDir = Join-Path $env:LOCALAPPDATA 'LOP'
  $AbrirPs1 = Join-Path $AbrirDir 'abrir-pasta.ps1'
  $AbrirOrig = Join-Path $Base '_ferramentas\Abrir pasta no computador\abrir-pasta.ps1'
  if ((Test-Path -LiteralPath $AbrirOrig) -and -not (Test-Path 'HKCU:\Software\Classes\lop-pasta\shell\open\command')) {
    New-Item -ItemType Directory -Force -Path $AbrirDir | Out-Null
    Copy-Item -LiteralPath $AbrirOrig -Destination $AbrirPs1 -Force
    $k = 'HKCU:\Software\Classes\lop-pasta'
    New-Item -Force -Path "$k\shell\open\command" | Out-Null
    Set-Item -Path $k -Value 'URL:LOP - abrir pasta'
    New-ItemProperty -Force -Path $k -Name 'URL Protocol' -Value '' | Out-Null
    Set-Item -Path "$k\shell\open\command" -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AbrirPs1 + '" "%1"')
    Log 'Atalho "Abrir no computador" (lop-pasta:) instalado para este usuário.'
  }
} catch { Log "Atalho lop-pasta não instalado: $($_.Exception.Message)" }

# uma execução por vez (se a anterior travou há mais de 3 h, segue)
if (Test-Path $Trava) {
  if ((Get-Item $Trava).LastWriteTime -gt (Get-Date).AddHours(-3)) { exit 0 }
}
Set-Content -Path $Trava -Value $PID

try {
  # o que já subiu
  $feito = @{}
  if (Test-Path $Estado) {
    $j = Get-Content -Raw -Encoding UTF8 $Estado | ConvertFrom-Json
    foreach ($p in $j.PSObject.Properties) { $feito[$p.Name] = $p.Value }
  }

  # documentos e fazendas do app
  $H = @{ 'x-sync-token' = $Token }
  $mapa = Invoke-RestMethod -Method Get -Uri "$Url`?acao=mapa" -Headers $H
  $docs = @{}
  foreach ($d in $mapa.docs) { $docs[(Chave $d.codigo)] = $d }
  $itens = @{}   # "<doc id>|<FAZENDA>" -> item id (o item sem "local" tem preferência)
  foreach ($i in $mapa.itens) {
    $k = "$($i.documento_id)|$(Chave $i.fazenda)"
    if (-not $itens.ContainsKey($k) -or -not $i.local) { $itens[$k] = $i.id }
  }

  $env = 0; $pul = 0; $err = 0
  foreach ($topo in $Topos) {
    $raiz = Join-Path $Base $topo
    if (-not (Test-Path $raiz)) { continue }
    foreach ($pasta in Get-ChildItem -LiteralPath $raiz -Directory) {
      $cod = ($pasta.Name -split ' - ')[0]
      $doc = $docs[(Chave $cod)]
      if (-not $doc) { continue }
      $arqs = Get-ChildItem -LiteralPath $pasta.FullName -File -Recurse -ErrorAction SilentlyContinue -ErrorVariable errLista |
        Where-Object { $_.Extension -match '^\.(pdf|jpe?g|png)$' -and $_.Name -notlike '.*' -and $_.FullName -notmatch '\\(bkp|HIST[ÓO]RICO)\\' }
      foreach ($e in $errLista) { Log "CAMINHO LONGO OU INACESSÍVEL (pulado): $($e.TargetObject)" }
      foreach ($a in $arqs) {
        $rel = $a.FullName.Substring($Base.Length + 1)
        $assin = "$($a.Length)|$($a.LastWriteTimeUtc.Ticks)"
        if ($feito[$rel] -eq $assin) { continue }
        if ($a.Length -gt $MaxB) {
          if ($feito[$rel] -ne "grande|$assin") { Log "GRANDE DEMAIS (mais de 15 MB, fica só no OneDrive): $rel" }
          $feito[$rel] = "grande|$assin"; continue
        }
        # dentro da subpasta de uma fazenda de um AN por fazenda?
        $destino = 'doc'; $id = $doc.id
        $resto = $a.FullName.Substring($pasta.FullName.Length + 1)
        if ($topo -eq '5 - RG' -or $resto -match '^EVID[ÊE]NCIAS\\') {
          # subpasta EVIDÊNCIAS -> evidência do documento (linha do tempo)
          $destino = 'evid'
        } elseif ($doc.por_fazenda -and $resto.Contains('\')) {
          # a pasta da fazenda pode estar logo abaixo do AN ou dentro da pasta do ano (AN xx\2026\FAZ. FACA\...) — 29/10/2026
          $segs = $resto.Split('\'); $segs = $segs[0..($segs.Length - 2)]
          foreach ($sg in $segs) {
            $k = "$($doc.id)|$(Chave $sg)"
            if ($itens.ContainsKey($k)) { $destino = 'item'; $id = $itens[$k]; break }
          }
        }
        $mime = switch -regex ($a.Extension.ToLower()) { '\.pdf' { 'application/pdf' } '\.png' { 'image/png' } default { 'image/jpeg' } }
        $q = "acao=enviar&destino=$destino&id=$([uri]::EscapeDataString([string]$id))" +
             "&caminho=$([uri]::EscapeDataString($rel))&nome=$([uri]::EscapeDataString($a.Name))" +
             "&data=$($a.LastWriteTime.ToString('yyyy-MM-dd'))"
        try {
          $r = Invoke-RestMethod -Method Post -Uri "$Url`?$q" -Headers $H -ContentType $mime -Body ([IO.File]::ReadAllBytes($a.FullName)) -TimeoutSec 300
          if ($r.pulado) { $pul++ } else { $env++ }
          $feito[$rel] = $assin
        } catch {
          $err++; Log "ERRO em $rel : $($_.Exception.Message)"
          if ($err -ge 20) { Log 'Muitos erros seguidos: para e tenta na próxima hora.'; throw 'parar' }
        }
        # grava o progresso de tempos em tempos
        if ((($env + $pul) % 25) -eq 0) { $feito | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $Estado }
      }
    }
  }
  $feito | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $Estado
  if ($env -or $pul -or $err) { Log "Fim: $env enviado(s), $pul já estavam no app, $err erro(s)." }

  # Lista dos arquivos (29/10/2026): a cada rodada manda caminho e data de todos os arquivos. O app grava a
  # data (abre o PDF mais novo / da pasta de ano mais novo) e tira os PDFs que saíram da pasta (movidos para
  # a pasta do ano, renomeados ou apagados). Só limpa se a lista vier completa (proteção no banco).
  if ($true) {
    $lista = foreach ($topo in $Topos) {
      $raiz = Join-Path $Base $topo
      if (Test-Path $raiz) {
        Get-ChildItem -LiteralPath $raiz -File -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $_.Extension -match '^\.(pdf|jpe?g|png)$' } |
          ForEach-Object { @{ o = 'onedrive:' + $_.FullName.Substring($Base.Length + 1).Replace('\', '/'); d = $_.LastWriteTime.ToString('yyyy-MM-dd') } }
      }
    }
    $corpo = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($lista) -Depth 3 -Compress))
    $r = Invoke-RestMethod -Method Post -Uri "$Url`?acao=datas" -Headers $H -ContentType 'application/json; charset=utf-8' -Body $corpo -TimeoutSec 300
    if ($r.datas -or $r.removidos) { Log "Lista dos arquivos: $($r.datas) data(s) atualizada(s), $($r.removidos) arquivo(s) que saíram da pasta tirados do app ($($r.lista) na pasta)." }
  }
} catch {
  if ("$_" -ne 'parar') { Log "FALHOU: $($_.Exception.Message)" }
  if ($feito) { $feito | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $Estado }
} finally {
  Remove-Item -Force $Trava -ErrorAction SilentlyContinue
}
