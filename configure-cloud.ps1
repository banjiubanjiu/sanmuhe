param(
  [string]$AppId,
  [string]$EnvId
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root "sanmuhe-miniprogram"
$ProjectConfigPath = Join-Path $ProjectDir "project.config.json"
$CloudConfigPath = Join-Path $ProjectDir "config\cloud.js"

if (-not $AppId) {
  $AppId = Read-Host "请输入真实小程序 AppID"
}

if (-not $EnvId) {
  $EnvId = Read-Host "请输入云开发环境 ID envId"
}

if (-not $AppId -or $AppId -eq "touristappid") {
  throw "AppID 无效。云开发不能使用 touristappid。"
}

if (-not $EnvId) {
  throw "envId 不能为空。"
}

if (-not (Test-Path $ProjectConfigPath)) {
  throw "找不到 project.config.json: $ProjectConfigPath"
}

if (-not (Test-Path $CloudConfigPath)) {
  throw "找不到 cloud.js: $CloudConfigPath"
}

$ProjectJson = Get-Content $ProjectConfigPath -Raw | ConvertFrom-Json
$ProjectJson.appid = $AppId
$ProjectJson | ConvertTo-Json -Depth 100 | Set-Content $ProjectConfigPath -Encoding UTF8

$CloudConfig = @"
module.exports = {
  // Configured by configure-cloud.ps1.
  envId: "$EnvId",
  useCloud: true
};
"@

Set-Content $CloudConfigPath -Value $CloudConfig -Encoding UTF8

Write-Host ""
Write-Host "三木合云开发配置已写入：" -ForegroundColor Green
Write-Host "  AppID: $AppId"
Write-Host "  envId: $EnvId"
Write-Host ""
Write-Host "下一步："
Write-Host "  1. 双击 open-sanmuhe-devtools.bat 打开项目"
Write-Host "  2. 在微信开发者工具里编译/热部署查看效果"
Write-Host "  3. 如需重新部署云函数，运行 deploy-cloudfunctions.bat $EnvId"
