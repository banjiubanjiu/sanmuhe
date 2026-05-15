param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = Join-Path $Root "downloads"
$LoginQr = Join-Path $OutDir "wechat-devtools-login.png"
$LoginResult = Join-Path $OutDir "wechat-devtools-login-result.json"
$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1

if (-not $Cli) {
  Write-Host "Cannot find WeChat DevTools CLI." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

Write-Host "CLI: $Cli"
Write-Host "Checking current login state..."
& $Cli islogin

Write-Host ""
Write-Host "Generating login QR if needed..."
& $Cli login --qr-format image --qr-output $LoginQr --result-output $LoginResult
Write-Host "Login QR: $LoginQr"
if (Test-Path $LoginQr) {
  Invoke-Item $LoginQr
}
