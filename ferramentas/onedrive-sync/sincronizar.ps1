# LOP - Gestão Rápida — sincroniza a pasta da Certificação no OneDrive com o app.
# Roda no sakumasrv a cada hora (tarefa agendada "LOP - Sincronizar OneDrive").
#
# Varre 1 - PROCEDIMENTOS, 2 - FORMULÁRIOS, 3 - ANEXOS, 4 - POLÍTICAS, 5 - REGISTROS e 6 - CHECK LIST (nomes desde 30/10/2026) (registros: todo arquivo vira registro do RG) dentro de "6 - Certificações"
# e manda para o app cada PDF/foto novo ou alterado (até 15 MB):
#   - arquivo da pasta do documento  -> vira o PDF/anexo daquele documento no app
#   - arquivo na subpasta de uma fazenda de um AN por fazenda -> evidência daquela fazenda
#   - arquivo na subpasta EVIDÊNCIAS de um documento -> evidência do documento
# Não apaga nada no app nem no OneDrive. Pastas "bkp" ficam de fora.
# Registro do que já subiu: estado.json; o que aconteceu: sincronizar.log (nesta pasta).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base   = 'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações'
$Topos  = @('1 - PROCEDIMENTOS', '2 - FORMULÁRIOS', '3 - ANEXOS', '4 - POLÍTICAS', '5 - REGISTROS', '6 - CHECK LIST')
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
  $AbrirOrig = Join-Path $Base '7 - CONFIGURAÇÕES\Ferramentas\Abrir pasta no computador\abrir-pasta.ps1'
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

# Entrega no OneDrive (30/10/2026, pedido do Guilherme: Certificação com o OneDrive como lugar oficial):
# cria uma vez a tarefa que roda o entregar.ps1 a cada 5 minutos, sem abrir janela (entregar.vbs).
try {
  $TnEnt = 'LOP - Entregar anexos no OneDrive'
  $Vbs = Join-Path $Aqui 'entregar.vbs'
  if ((Test-Path -LiteralPath $Vbs) -and -not (Get-ScheduledTask -TaskName $TnEnt -ErrorAction SilentlyContinue)) {
    schtasks /Create /TN $TnEnt /SC MINUTE /MO 5 /TR ('wscript.exe ' + $Vbs) /F | Out-Null
    Log "Tarefa '$TnEnt' criada: grava no OneDrive, a cada 5 minutos, o que for anexado no app."
  }
} catch { Log "Tarefa de entrega no OneDrive não criada: $($_.Exception.Message)" }

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

  # Arquivos movidos por organização (29/10/2026, pastas de ano nos AN): movidos.json nesta pasta traz
  # [{de, para}] (caminhos "onedrive:..."). O app troca o caminho sem reenviar e o "já enviado" acompanha.
  $MovArq = Join-Path $Aqui 'movidos.json'
  if (Test-Path $MovArq) {
    try {
      $corpoM = [IO.File]::ReadAllBytes($MovArq)
      $rm = Invoke-RestMethod -Method Post -Uri "$Url`?acao=mover" -Headers $H -ContentType 'application/json; charset=utf-8' -Body $corpoM -TimeoutSec 300
      $movs = Get-Content -Raw -Encoding UTF8 $MovArq | ConvertFrom-Json
      foreach ($m in $movs) {
        $de = ([string]$m.de).Substring(9).Replace('/', '\'); $para = ([string]$m.para).Substring(9).Replace('/', '\')
        if ($feito.ContainsKey($de)) { $feito[$para] = $feito[$de]; $feito.Remove($de) }
      }
      $feito | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $Estado
      Move-Item -Force $MovArq (Join-Path $Aqui ("movidos-feito-{0:yyyyMMdd-HHmm}.json" -f (Get-Date)))
      Log "Arquivos movidos: $($rm.arquivos) arquivo(s) e $($rm.evidencias) evidência(s) com caminho novo no app ($($rm.lista) movidos)."
    } catch { Log "Movidos não aplicados (tenta na próxima hora): $($_.Exception.Message)" }
  }

  # Lista dos arquivos (29/10/2026), ANTES de enviar: manda caminho e data de todos os arquivos. O app grava a
  # data (abre o PDF da pasta de ano mais nova / o mais novo), tira os PDFs que saíram da pasta (movidos para
  # a pasta do ano, renomeados ou apagados; só limpa se a lista vier completa) e devolve os que estão na
  # pasta mas não no app — esses saem do "já enviado" e sobem nesta rodada.
  $lista = foreach ($topo in $Topos) {
    $raiz = Join-Path $Base $topo
    if (Test-Path $raiz) {
      Get-ChildItem -LiteralPath $raiz -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '^\.(pdf|jpe?g|png)$' } |
        ForEach-Object { @{ o = 'onedrive:' + $_.FullName.Substring($Base.Length + 1).Replace('\', '/'); d = $_.LastWriteTime.ToString('yyyy-MM-dd') } }
    }
  }
  try {
    $corpo = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($lista) -Depth 3 -Compress))
    $r = Invoke-RestMethod -Method Post -Uri "$Url`?acao=datas" -Headers $H -ContentType 'application/json; charset=utf-8' -Body $corpo -TimeoutSec 300
    $refaz = 0
    foreach ($o in @($r.faltando)) {
      $rel = ([string]$o).Substring(9).Replace('/', '\')
      if ($feito.ContainsKey($rel) -and -not ([string]$feito[$rel]).StartsWith('grande|')) { $feito.Remove($rel); $refaz++ }
    }
    if ($r.datas -or $r.removidos -or $refaz) { Log "Lista dos arquivos: $($r.datas) data(s) atualizada(s), $($r.removidos) arquivo(s) que saíram da pasta tirados do app, $refaz arquivo(s) que faltavam no app vão subir de novo ($($r.lista) na pasta)." }
  } catch { Log "Lista dos arquivos não enviada: $($_.Exception.Message)" }

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
        if ($topo -eq '5 - REGISTROS' -or $resto -match '^EVID[ÊE]NCIAS\\') {
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

} catch {
  if ("$_" -ne 'parar') { Log "FALHOU: $($_.Exception.Message)" }
  if ($feito) { $feito | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $Estado }
} finally {
  Remove-Item -Force $Trava -ErrorAction SilentlyContinue
}
