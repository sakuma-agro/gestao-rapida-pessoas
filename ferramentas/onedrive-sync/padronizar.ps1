# LOP - Gestão Rápida — padroniza as pastas da Certificação no OneDrive (03/11/2026).
#
# Padrão aprovado pelo Guilherme (documento "Padronização das pastas e arquivos — AN e RG"):
#   <documento>\<ANO>\<FAZENDA, só nos AN por fazenda>\<assunto, se houver>\<arquivo>
#   - ano sempre logo abaixo do documento (arquivos soltos vão para o ano do nome ou da data do arquivo);
#   - fazenda com um dos 5 nomes fixos: FAZ. FACA · FAZ. MORRO BRANCO · FAZ. TRES RIACHOS ·
#     FAZ. REUNIDAS QUEBRA COCAO · LOTE 35 PADAP;
#   - sem subpasta de mês ou de data: o arquivo sobe para o ano e, se o nome não tem data, ganha a
#     data da pasta na frente (ex.: "Abril - 2024\ABR.pdf" -> "2024\2024-04 - ABR.pdf").
#
# NÃO move nada sem -Aplicar. Sem ele, só grava padronizar-previa.csv (de;para;motivo) para conferir.
# Com -Aplicar, move os arquivos e acrescenta cada um em movidos.json: na próxima rodada a
# sincronização troca o caminho no app sem reenviar (a evidência não duplica).
#
# Uso (no sakumasrv, na pasta LOP-Sync, com a sincronização parada no momento):
#   powershell -ExecutionPolicy Bypass -File padronizar.ps1 -Lote alta              # prévia do lote 1
#   powershell -ExecutionPolicy Bypass -File padronizar.ps1 -Docs "AN 82","RG 038"  # prévia de alguns
#   ... mesmo comando + -Aplicar                                                    # move de verdade

param(
  [string[]]$Docs = @(),
  [ValidateSet('', 'alta', 'inverter', 'media')][string]$Lote = '',
  [switch]$Aplicar
)
$ErrorActionPreference = 'Stop'
$Base  = 'C:\NUVEM\OneDrive\1 - ADM - PRINCIPAL\6 - Certificações'
$Topos = @('3 - ANEXOS', '5 - REGISTROS')
$Aqui  = $PSScriptRoot
$Url   = 'https://ysvmfmnwbcxgsrjewwsy.supabase.co/functions/v1/onedrive-sync'
$Prev  = Join-Path $Aqui 'padronizar-previa.csv'
$MovArq = Join-Path $Aqui 'movidos.json'
$Log   = Join-Path $Aqui 'sincronizar.log'
function Log($t) { Add-Content -Encoding UTF8 -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  padronizar: {1}" -f (Get-Date), $t) }

$LOTES = @{
  alta     = @('AN 09','AN 101','AN 107','AN 109','AN 113','AN 115','AN 79','AN 82','AN 98','RG 002','RG 007','RG 011','RG 012','RG 030','RG 038','RG 044','RG 047','RG 049','RG 050','RG 056','RG CL 01')
  inverter = @('AN 06','AN 08','AN 114','AN 22','AN 71')
  media    = @('AN 111','AN 116','AN 117','AN 12','AN 37','AN 58','AN 62','AN 68','AN 72','AN 77','AN 81','AN 83','AN 84','AN 85','AN 86','AN 88','AN 89','AN 92','AN 94','RG 004','RG 020','RG 021','RG 023','RG 042','RG 045','RG 052','RG 055')
}
$NAO_MEXER = @('AN 19', 'AN 30')
if ($Lote) { $Docs += $LOTES[$Lote] }
if (-not $Docs.Count) { Write-Host 'Diga quais documentos: -Lote alta|inverter|media ou -Docs "AN 82","RG 038"'; exit 1 }

$Trava = Join-Path $Aqui 'rodando.lock'
if ((Test-Path $Trava) -and (Get-Item $Trava).LastWriteTime -gt (Get-Date).AddHours(-3)) {
  Write-Host 'A sincronização está rodando agora. Espere terminar e rode de novo.'; exit 1
}

function SemAcento($s) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  -join ($n.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })
}
function Chave($s) { ((SemAcento $s).ToUpperInvariant() -replace '\s+', ' ').Trim() }
function CodDoc($nomePasta) { ((($nomePasta -split ' - ')[0]) -replace '\s+', ' ').Trim().ToUpperInvariant() }
function MesmoCod($a, $b) {   # "AN 9" = "AN 09", "RG CL 01" = "RG CL 1"
  $f = { param($x) $m = [regex]::Match((Chave $x), '^([A-Z ]+?)\s*0*(\d+)$'); if ($m.Success) { $m.Groups[1].Value.Trim() + ' ' + $m.Groups[2].Value } else { Chave $x } }
  (& $f $a) -eq (& $f $b)
}

# fazenda: nome da pasta -> um dos 5 nomes fixos (ou $null)
function Fazenda($seg) {
  $k = Chave $seg
  if ($k -match '^((FAZ\.?|FAZENDA)\s*)?FACA$') { return 'FAZ. FACA' }
  if ($k -match '^((FAZ\.?|FAZENDA)\s*)?MORRO (DE )?BRANCO$') { return 'FAZ. MORRO BRANCO' }
  if ($k -match '^((FAZ\.?|FAZENDA)\s*)?TRES RIACHOS$') { return 'FAZ. TRES RIACHOS' }
  if ($k -match '^((FAZ\.?|FAZENDAS?)\s*)?(REUNIDAS )?QUEBRA COCAO$') { return 'FAZ. REUNIDAS QUEBRA COCAO' }
  if ($k -match '^LOTE ?35( ?-? ?PADAP)?$') { return 'LOTE 35 PADAP' }
  return $null
}
# ano: "2026", "Colheita 2026", "Safra 2026", "DEV.2026", "DEV. 2026" -> 2026
function Ano($seg) {
  $k = Chave $seg
  if ($k -match '^(19|20)\d\d$') { return $k }
  if ($k -match '^(COLHEITA|SAFRA|DEV\.?)\s*((19|20)\d\d)$') { return $Matches[2] }
  return $null
}
$MESES = @('JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO')
$ABREV = @('JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ')
# pasta de mês ou de data -> "AAAA-MM-DD" / "AAAA-MM" (ou $null se não for)
function DataDaPasta($seg, $anoCtx) {
  $k = Chave $seg
  if ($k -eq 'FEVEVEIRO') { $k = 'FEVEREIRO' }
  $m = [regex]::Match($k, '(^|\D)(\d{1,2})-(\d{1,2})-((19|20)\d\d)(\D|$)')
  if ($m.Success) { return '{0}-{1:00}-{2:00}' -f $m.Groups[4].Value, [int]$m.Groups[3].Value, [int]$m.Groups[2].Value }
  $m = [regex]::Match($k, '^(\d{1,2})-((19|20)\d\d)$')
  if ($m.Success) { return '{0}-{1:00}' -f $m.Groups[2].Value, [int]$m.Groups[1].Value }
  for ($i = 0; $i -lt 12; $i++) {
    if ($k -match "^($($MESES[$i])|$($ABREV[$i]))\b") {
      $a = [regex]::Match($k, '(19|20)\d\d'); $ano = if ($a.Success) { $a.Value } else { $anoCtx }
      if ($ano) { return '{0}-{1:00}' -f $ano, ($i + 1) }
    }
  }
  # "CONTROLE-09-04-2025-14051", "Check list-05-11-2025", "melhorias contínuas-01-07-2025": data dentro do nome da pasta
  $m = [regex]::Match($k, '(\d{2})-(\d{2})-((19|20)\d\d)')
  if ($m.Success -and $k -match '^(CONTROLE|CHECK LIST|MELHORIAS)') { return '{0}-{1}-{2}' -f $m.Groups[3].Value, $m.Groups[2].Value, $m.Groups[1].Value }
  return $null
}
# o nome do arquivo já tem data?
function TemData($nome) {
  $k = Chave ([IO.Path]::GetFileNameWithoutExtension($nome))
  if ($k -match '\d{1,2}[.\-_]\d{1,2}[.\-_](19|20)\d\d' -or $k -match '(19|20)\d\d[.\-_]\d{2}([.\-_]\d{2})?' -or $k -match '^\d{8}_\d{6}') { return $true }
  if ($k -match '(^|[^\d])\d{1,2}-\d{1,2}([^\d]|$)') { return $true }
  foreach ($x in $MESES) { if ($k -match "(^|[^A-Z])$x([^A-Z]|$)") { return $true } }
  foreach ($x in $ABREV) { if ($k -match "(^|[^A-Z])$x[^A-Z0-9]{0,3}((19|20)?\d\d)") { return $true } }
  return $false
}
# ano escrito no nome do arquivo (data completa), senão $null
function AnoDoNome($nome) {
  $k = Chave $nome
  $m = [regex]::Match($k, '\d{1,2}[.\-_]\d{1,2}[.\-_]((19|20)\d\d)'); if ($m.Success) { return $m.Groups[1].Value }
  $m = [regex]::Match($k, '(^|\D)((19|20)\d\d)[.\-_]\d{2}[.\-_]\d{2}'); if ($m.Success) { return $m.Groups[2].Value }
  $m = [regex]::Match($k, '^\d{4}((19|20)\d\d)_\d{6}'); if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

# quais documentos são por fazenda (vem do app)
$porFaz = @{}
try {
  $Token = (Get-Content -Raw -Encoding UTF8 (Join-Path $Aqui 'token.txt')).Trim()
  $mapa = Invoke-RestMethod -Method Get -Uri "$Url`?acao=mapa" -Headers @{ 'x-sync-token' = $Token }
  foreach ($d in $mapa.docs) { if ($d.por_fazenda) { $porFaz[(Chave $d.codigo)] = $true } }
} catch { Write-Host "Não consegui ler o app ($($_.Exception.Message)). Sem isso não sei quais AN são por fazenda."; exit 1 }
function EhPorFaz($cod) { foreach ($k in $porFaz.Keys) { if (MesmoCod $k $cod) { return $true } }; return $false }

$plano = New-Object System.Collections.Generic.List[object]
$destinos = @{}
foreach ($topo in $Topos) {
  $raiz = Join-Path $Base $topo
  foreach ($pasta in Get-ChildItem -LiteralPath $raiz -Directory) {
    $cod = CodDoc $pasta.Name
    if (-not ($Docs | Where-Object { MesmoCod $_ $cod })) { continue }
    if ($NAO_MEXER | Where-Object { MesmoCod $_ $cod }) { continue }
    $pf = EhPorFaz $cod
    $arqs = Get-ChildItem -LiteralPath $pasta.FullName -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\(bkp|HIST[ÓO]RICO)\\' -and $_.Name -notlike '.*' -and $_.Name -notlike '~$*' }
    foreach ($a in $arqs) {
      $resto = $a.FullName.Substring($pasta.FullName.Length + 1)
      $segs = @($resto.Split('\')); $nome = $segs[-1]; $dirs = if ($segs.Count -gt 1) { $segs[0..($segs.Count - 2)] } else { @() }
      $ano = $null; $faz = $null; $prefixo = $null; $outros = @(); $motivos = @()
      foreach ($s in $dirs) { $y = Ano $s; if ($y) { $ano = $y } }   # o ano mais de dentro vale
      foreach ($s in $dirs) {
        if (Ano $s) { continue }
        $f = Fazenda $s
        if ($f) {
          if ($pf -and -not $faz) { $faz = $f; continue }
          if ($f -ne $s) { $motivos += "fazenda $s -> $f" }
          $outros += $f; continue
        }
        $dp = DataDaPasta $s $ano
        if ($dp) { $prefixo = $dp; $motivos += "tira a pasta de data $s"; continue }
        $outros += $s
      }
      if (-not $ano) {
        $ano = AnoDoNome $nome; if (-not $ano -and $prefixo) { $ano = $prefixo.Substring(0, 4) }
        if (-not $ano) { $ano = $a.LastWriteTime.ToString('yyyy') }
        $motivos += "solto -> pasta $ano"
      }
      $novoNome = if ($prefixo -and -not (TemData $nome)) { "$prefixo - $nome" } else { $nome }
      $partes = @($ano) + $(if ($faz) { @($faz) } else { @() }) + $outros + @($novoNome)
      $novo = Join-Path $pasta.FullName ($partes -join '\')
      if ($novo -eq $a.FullName) { continue }
      $orig = (@($dirs) + @($nome)) -join '\'
      if ($pf -and $faz -and ($orig -notmatch "^(19|20)\d\d\\")) { $motivos += 'ano antes da fazenda' }
      if ($novoNome -ne $nome) { $motivos += 'data no nome' }
      $alvoKey = $novo.ToUpperInvariant()
      $conflito = (Test-Path -LiteralPath $novo) -or $destinos.ContainsKey($alvoKey)
      $destinos[$alvoKey] = $true
      $plano.Add([pscustomobject]@{
        de = $a.FullName.Substring($Base.Length + 1); para = $novo.Substring($Base.Length + 1)
        motivo = $(if ($conflito) { 'CONFLITO: já existe arquivo com esse nome no destino — fica onde está' } else { ($motivos | Select-Object -Unique) -join '; ' })
        ok = -not $conflito; full = $a.FullName; novo = $novo
      })
    }
  }
}

$plano | Select-Object de, para, motivo | Export-Csv -LiteralPath $Prev -Delimiter ';' -Encoding UTF8 -NoTypeInformation
$nOk = ($plano | Where-Object ok).Count; $nCf = $plano.Count - $nOk
Write-Host "$($plano.Count) arquivo(s) mudam ($nCf com conflito). Prévia: $Prev"
if (-not $Aplicar) { Write-Host 'Nada foi movido. Confira a prévia e rode de novo com -Aplicar.'; exit 0 }

$movidos = New-Object System.Collections.Generic.List[object]
if (Test-Path $MovArq) { foreach ($m in (Get-Content -Raw -Encoding UTF8 $MovArq | ConvertFrom-Json)) { $movidos.Add($m) } }
$feitos = 0
foreach ($p in ($plano | Where-Object ok)) {
  try {
    $dir = Split-Path -Parent $p.novo
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Move-Item -LiteralPath $p.full -Destination $p.novo
    $movidos.Add([pscustomobject]@{ de = 'onedrive:' + $p.de.Replace('\', '/'); para = 'onedrive:' + $p.para.Replace('\', '/') })
    $feitos++
  } catch { Log "não moveu $($p.de): $($_.Exception.Message)" }
}
$movidos | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 $MovArq
# pastas que ficaram vazias (de baixo para cima, só dentro dos documentos mexidos)
foreach ($topo in $Topos) {
  foreach ($pasta in Get-ChildItem -LiteralPath (Join-Path $Base $topo) -Directory) {
    $cod = CodDoc $pasta.Name
    if (-not ($Docs | Where-Object { MesmoCod $_ $cod })) { continue }
    Get-ChildItem -LiteralPath $pasta.FullName -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending |
      Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force) } | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
  }
}
Log "$feitos arquivo(s) movidos ($($Docs -join ', ')); o app troca o caminho na próxima sincronização."
Write-Host "$feitos arquivo(s) movidos. Na próxima sincronização o app troca o caminho (sem duplicar)."
