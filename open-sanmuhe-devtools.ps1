param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $Root "sanmuhe-miniprogram"
$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1

if (-not $Cli) {
  Write-Host "Cannot find WeChat DevTools CLI." -ForegroundColor Red
  exit 1
}

& $Cli open --project $Project
