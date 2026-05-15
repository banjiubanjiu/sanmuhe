param(
  [switch]$SkipLoginCheck
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root "sanmuhe-miniprogram"
$ProjectConfigPath = Join-Path $ProjectDir "project.config.json"
$CloudConfigPath = Join-Path $ProjectDir "config\cloud.js"
$CloudFunctionsDir = Join-Path $ProjectDir "cloudfunctions"

$RequiredFunctions = @(
  "getOpenId",
  "getCatalog",
  "seedDemoData",
  "manageCatalog",
  "createOrder",
  "createReservation",
  "listEvents",
  "createEvent",
  "joinEvent",
  "listMyRecords",
  "cleanupSmokeData"
)

function Write-Check($Name, $Ok, $Detail) {
  $Status = if ($Ok) { "OK" } else { "FAIL" }
  $Color = if ($Ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} - {2}" -f $Status, $Name, $Detail) -ForegroundColor $Color
}

Write-Host ""
Write-Host "=== Sanmuhe Cloud Readiness Check ==="
Write-Host ""

$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1
Write-Check "WeChat DevTools CLI" ([bool]$Cli) ($(if ($Cli) { $Cli } else { "not found" }))

if (-not (Test-Path $ProjectConfigPath)) {
  Write-Check "project.config.json" $false "missing"
  exit 1
}

$ProjectJson = Get-Content $ProjectConfigPath -Raw | ConvertFrom-Json
$AppIdOk = $ProjectJson.appid -and $ProjectJson.appid -ne "touristappid"
Write-Check "AppID" $AppIdOk $ProjectJson.appid

$CloudRootOk = $ProjectJson.cloudfunctionRoot -eq "cloudfunctions/"
Write-Check "cloudfunctionRoot" $CloudRootOk $ProjectJson.cloudfunctionRoot

if (-not (Test-Path $CloudConfigPath)) {
  Write-Check "config/cloud.js" $false "missing"
  exit 1
}

$CloudConfig = Get-Content $CloudConfigPath -Raw
$EnvMatch = [regex]::Match($CloudConfig, 'envId:\s*"([^"]*)"')
$EnvId = if ($EnvMatch.Success) { $EnvMatch.Groups[1].Value } else { "" }
$EnvOk = -not [string]::IsNullOrWhiteSpace($EnvId)
Write-Check "cloud envId" $EnvOk ($(if ($EnvOk) { $EnvId } else { "empty" }))

$MissingFunctions = @()
foreach ($Name in $RequiredFunctions) {
  $IndexPath = Join-Path $CloudFunctionsDir "$Name\index.js"
  $PackagePath = Join-Path $CloudFunctionsDir "$Name\package.json"
  if (-not (Test-Path $IndexPath) -or -not (Test-Path $PackagePath)) {
    $MissingFunctions += $Name
  }
}

Write-Check "cloud functions" ($MissingFunctions.Count -eq 0) ($(if ($MissingFunctions.Count -eq 0) { "$($RequiredFunctions.Count) functions ready" } else { "missing: $($MissingFunctions -join ', ')" }))

if ($Cli -and -not $SkipLoginCheck) {
  Write-Host ""
  Write-Host "Checking DevTools login state..."
  & $Cli islogin
  Write-Host "If this says not logged in, open WeChat DevTools and scan to login."
}

Write-Host ""
if ($Cli -and $AppIdOk -and $EnvOk -and $CloudRootOk -and $MissingFunctions.Count -eq 0) {
  Write-Host "Preflight passed. Open WeChat DevTools and use compile / hot deploy." -ForegroundColor Green
} else {
  Write-Host "Preflight has blocking items. Fix FAIL lines before compiling in WeChat DevTools." -ForegroundColor Yellow
}
