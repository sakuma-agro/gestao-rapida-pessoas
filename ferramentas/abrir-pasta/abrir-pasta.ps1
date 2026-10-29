# LOP - Gestão Rápida — abre no Explorador a pasta pedida pelo app (link lop-pasta:).
# Instalado por instalar.bat (uma vez por computador). 29/10/2026.
# Só abre PASTAS que existem dentro do OneDrive deste computador; qualquer outra coisa é ignorada.
param([string]$u)
try {
  $p = [uri]::UnescapeDataString(($u -replace '^lop-pasta:(//)?', '')).Trim().Trim('"').TrimEnd('/', '\') -replace '/', '\'
  if ($p -match '\.\.') { exit 1 }
  # o caminho gravado no app é o do sakumasrv (C:\NUVEM\OneDrive\...); em outro computador troca pela pasta do OneDrive dele
  $raizes = @('C:\NUVEM\OneDrive', $env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial) | Where-Object { $_ } | Select-Object -Unique
  $resto = $null
  foreach ($r in $raizes) { if ($p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)) { $resto = $p.Substring($r.Length + 1); break } }
  if (-not $resto) { exit 1 }
  foreach ($r in $raizes) {
    $alvo = Join-Path $r $resto
    if (Test-Path -LiteralPath $alvo -PathType Container) { Start-Process -FilePath 'explorer.exe' -ArgumentList ('"{0}"' -f $alvo); exit 0 }
  }
} catch { }
exit 1
