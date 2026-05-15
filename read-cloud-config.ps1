param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectConfigPath = Join-Path $Root "sanmuhe-miniprogram\project.config.json"
$CloudConfigPath = Join-Path $Root "sanmuhe-miniprogram\config\cloud.js"

$AppId = ""
$EnvId = ""

if (Test-Path $ProjectConfigPath) {
  $ProjectJson = Get-Content $ProjectConfigPath -Raw | ConvertFrom-Json
  $AppId = [string]$ProjectJson.appid
}

if (Test-Path $CloudConfigPath) {
  $CloudConfig = Get-Content $CloudConfigPath -Raw
  $EnvMatch = [regex]::Match($CloudConfig, 'envId:\s*"([^"]*)"')
  if ($EnvMatch.Success) {
    $EnvId = $EnvMatch.Groups[1].Value
  }
}

Write-Output "APP_ID=$AppId"
Write-Output "ENV_ID=$EnvId"
