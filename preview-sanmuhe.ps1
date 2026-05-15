param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $Root "sanmuhe-miniprogram"
$OutDir = Join-Path $Root "downloads"
$PreviewQr = Join-Path $OutDir "sanmuhe-preview.png"
$PreviewInfo = Join-Path $OutDir "sanmuhe-preview-info.json"
$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1

if (-not $Cli) {
  Write-Host "Cannot find WeChat DevTools CLI." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

& $Cli preview --project $Project --qr-format image --qr-output $PreviewQr --info-output $PreviewInfo
Write-Host "Preview QR output: $PreviewQr"
if (Test-Path $PreviewQr) {
  Invoke-Item $PreviewQr
}
