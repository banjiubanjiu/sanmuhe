param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Project = Join-Path $Root "sanmuhe-miniprogram"
$OutDir = Join-Path $Root "downloads"
$DeployLog = Join-Path $OutDir "sanmuhe-cloudfunctions-deploy.log"
$FunctionsLog = Join-Path $OutDir "sanmuhe-cloudfunctions-list.txt"
$PreviewLog = Join-Path $OutDir "sanmuhe-preview-cli.log"
$PreviewQr = Join-Path $OutDir "sanmuhe-preview.png"
$PreviewInfo = Join-Path $OutDir "sanmuhe-preview-info.json"
$FunctionNames = @(
  "getOpenId",
  "getCatalog",
  "seedDemoData",
  "manageCatalog",
  "createOrder",
  "createReservation",
  "listEvents",
  "createEvent",
  "joinEvent",
  "listMyRecords"
)

function Stop-WithMessage($Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

$Cli = & (Join-Path $Root "resolve-wechat-cli.ps1") | Select-Object -First 1
if (-not $Cli) {
  Stop-WithMessage "Cannot find WeChat DevTools CLI. Open WeChat DevTools or check the install path."
}

Write-Host ""
Write-Host "=== Sanmuhe Cloud Preview Wizard ==="
Write-Host ""
Write-Host "CLI: $Cli"

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$AppId = ""
$EnvId = ""
& (Join-Path $Root "read-cloud-config.ps1") | ForEach-Object {
  if ($_ -match "^APP_ID=(.*)$") {
    $AppId = $Matches[1]
  }
  if ($_ -match "^ENV_ID=(.*)$") {
    $EnvId = $Matches[1]
  }
}

if ($AppId) {
  Write-Host "Current AppID: $AppId"
}
if (-not $AppId -or $AppId -eq "touristappid") {
  if ($AppId -eq "touristappid") {
    Write-Host "touristappid cannot use cloud development." -ForegroundColor Yellow
  }
  $AppId = Read-Host "Please enter your real Mini Program AppID"
}
if (-not $AppId) {
  Stop-WithMessage "AppID is required."
}

if ($EnvId) {
  Write-Host "Current envId: $EnvId"
}
if (-not $EnvId) {
  $EnvId = Read-Host "Please enter your cloud envId"
}
if (-not $EnvId) {
  Stop-WithMessage "envId is required."
}

Write-Host ""
Write-Host "Writing project cloud config..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "configure-cloud.ps1") -AppId $AppId -EnvId $EnvId
if ($LASTEXITCODE -ne 0) {
  Stop-WithMessage "Configure failed."
}

Write-Host ""
Write-Host "Opening WeChat DevTools..."
& $Cli open --project $Project

Write-Host ""
Write-Host "Deploying cloud functions..."
& $Cli cloud functions deploy --project $Project --env $EnvId -r --names $FunctionNames > $DeployLog 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloud function deployment failed. Log:" -ForegroundColor Red
  Get-Content $DeployLog -ErrorAction SilentlyContinue
  exit 1
}
Write-Host "Cloud function deployment log: $DeployLog"

Write-Host ""
Write-Host "Fetching cloud function list..."
& $Cli cloud functions list --project $Project --env $EnvId > $FunctionsLog 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloud function list check failed. Continuing to preview." -ForegroundColor Yellow
  Write-Host "Function list log: $FunctionsLog"
} else {
  Write-Host "Cloud function list: $FunctionsLog"
}

Write-Host ""
Write-Host "Generating preview QR code..."
& $Cli preview --project $Project --qr-format image --qr-output $PreviewQr --info-output $PreviewInfo > $PreviewLog 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Preview QR generation failed. Log:" -ForegroundColor Red
  Get-Content $PreviewLog -ErrorAction SilentlyContinue
  exit 1
}

Write-Host ""
Write-Host "Done."
Write-Host "Preview QR: $PreviewQr"
Write-Host "Preview CLI log: $PreviewLog"

if (Test-Path $PreviewQr) {
  Invoke-Item $PreviewQr
}

Write-Host ""
Write-Host "Open the preview, then run the in-app cloud status checks."
