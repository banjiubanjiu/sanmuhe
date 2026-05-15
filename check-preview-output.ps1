param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Downloads = Join-Path $Root "downloads"
$PreviewQr = Join-Path $Downloads "sanmuhe-preview.png"
$PreviewInfo = Join-Path $Downloads "sanmuhe-preview-info.json"
$DeployLog = Join-Path $Downloads "sanmuhe-cloudfunctions-deploy.log"
$FunctionListLog = Join-Path $Downloads "sanmuhe-cloudfunctions-list.txt"
$PreviewLog = Join-Path $Downloads "sanmuhe-preview-cli.log"

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
  "listMyRecords"
)

function Write-Check($Name, $Ok, $Detail) {
  $Status = if ($Ok) { "OK" } else { "FAIL" }
  $Color = if ($Ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} - {2}" -f $Status, $Name, $Detail) -ForegroundColor $Color
}

function Test-NonEmptyFile($Path) {
  if (-not (Test-Path $Path)) {
    return $false
  }
  return ((Get-Item $Path).Length -gt 0)
}

Write-Host ""
Write-Host "=== Sanmuhe Preview Output Check ==="
Write-Host ""

$PreviewQrOk = Test-NonEmptyFile $PreviewQr
Write-Check "preview QR" $PreviewQrOk $PreviewQr

$PreviewInfoOk = Test-NonEmptyFile $PreviewInfo
Write-Check "preview info" $PreviewInfoOk $PreviewInfo

$DeployLogOk = Test-NonEmptyFile $DeployLog
Write-Check "deploy log" $DeployLogOk $DeployLog

$PreviewLogOk = Test-NonEmptyFile $PreviewLog
Write-Check "preview log" $PreviewLogOk $PreviewLog

$FunctionListLogOk = Test-NonEmptyFile $FunctionListLog
Write-Check "cloud function list log" $FunctionListLogOk $FunctionListLog

if ($FunctionListLogOk) {
  $FunctionListText = Get-Content $FunctionListLog -Raw
  $MissingFunctions = $RequiredFunctions | Where-Object { $FunctionListText -notmatch [regex]::Escape($_) }
  Write-Check "cloud functions listed" ($MissingFunctions.Count -eq 0) ($(if ($MissingFunctions.Count -eq 0) { "$($RequiredFunctions.Count) function names found" } else { "missing: $($MissingFunctions -join ', ')" }))
} else {
  Write-Check "cloud functions listed" $false "function list log missing"
}

Write-Host ""
Write-Host "If all checks are OK, scan the preview QR and run the in-app cloud status checks."
