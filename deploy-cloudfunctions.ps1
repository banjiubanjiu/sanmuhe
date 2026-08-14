param(
  [string]$EnvId = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $Root "sanmuhe-miniprogram"
$OutDir = Join-Path $Root "downloads"
$DeployLog = Join-Path $OutDir "sanmuhe-cloudfunctions-deploy.log"
$FunctionNames = @(
  "getOpenId",
  "addressBook",
  "getCatalog",
  "seedDemoData",
  "manageCatalog",
  "manageOperations",
  "createOrder",
  "createPayment",
  "wechatPayNotify",
  "releaseOrderLocks",
  "createReservation",
  "listEvents",
  "createEvent",
  "joinEvent",
  "listMyRecords",
  "cleanupSmokeData",
  "memberCenter",
  "serviceNotify",
  "scheduledBackup"
)

if (-not $EnvId) {
  & (Join-Path $Root "read-cloud-config.ps1") | ForEach-Object {
    if ($_ -match "^ENV_ID=(.*)$") {
      $EnvId = $Matches[1]
    }
  }
}

if (-not $EnvId) {
  Write-Host "Cloud envId is required." -ForegroundColor Red
  exit 1
}

$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1
if (-not $Cli) {
  Write-Host "Cannot find WeChat DevTools CLI." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

& $Cli cloud functions deploy --project $Project --env $EnvId -r --names $FunctionNames > $DeployLog 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloud function deployment failed. Log:" -ForegroundColor Red
  Get-Content $DeployLog -ErrorAction SilentlyContinue
  exit 1
}

Write-Host "Cloud function deployment log: $DeployLog"
