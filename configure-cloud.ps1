param(
  [string]$AppId,
  [string]$EnvId
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root "sanmuhe-miniprogram"
$ProjectConfigPath = Join-Path $ProjectDir "project.config.json"
$RootProjectConfigPath = Join-Path $Root "project.config.json"
$CloudConfigPath = Join-Path $ProjectDir "config\cloud.js"
$CloudbaseRcPath = Join-Path $ProjectDir "cloudbaserc.json"
$AdminAppPath = Join-Path $ProjectDir "admin-src\src\App.vue"

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

if (Test-Path $RootProjectConfigPath) {
  $RootProjectJson = Get-Content $RootProjectConfigPath -Raw | ConvertFrom-Json
  $RootProjectJson.appid = $AppId
  $RootProjectJson | ConvertTo-Json -Depth 100 | Set-Content $RootProjectConfigPath -Encoding UTF8
}

$CloudConfig = @"
module.exports = {
  // Configured by configure-cloud.ps1.
  envId: "$EnvId",
  useCloud: true
};
"@

Set-Content $CloudConfigPath -Value $CloudConfig -Encoding UTF8

if (Test-Path $CloudbaseRcPath) {
  $Rc = Get-Content $CloudbaseRcPath -Raw | ConvertFrom-Json
  $Rc.envId = $EnvId
  $Rc | ConvertTo-Json -Depth 100 | Set-Content $CloudbaseRcPath -Encoding UTF8
}

if (Test-Path $AdminAppPath) {
  $AdminSrc = Get-Content $AdminAppPath -Raw
  $AdminSrc = [regex]::Replace($AdminSrc, 'envId:\s*"[^"]*"', "envId: `"$EnvId`"")
  $AdminSrc = [regex]::Replace($AdminSrc, 'appid:\s*"[^"]*"', "appid: `"$AppId`"", 1)
  Set-Content $AdminAppPath -Value $AdminSrc -Encoding UTF8
}

Write-Host ""
Write-Host "禾煦云开发配置已写入：" -ForegroundColor Green
Write-Host "  AppID: $AppId"
Write-Host "  envId: $EnvId"
Write-Host ""
Write-Host "下一步："
Write-Host "  1. 双击 open-sanmuhe-devtools.bat 打开项目"
Write-Host "  2. 在微信开发者工具里编译并部署全部云函数"
Write-Host "  3. 真机调用 getOpenId，把新 openid 写入云函数 ADMIN_OPENIDS / MEMBER_TEST_OPENIDS"
Write-Host "  4. 管理后台需在 admin-src 填入新环境 Publishable Key 后 npm run admin:build"
Write-Host "  5. 详见 docs/新小程序迁移清单.md"
