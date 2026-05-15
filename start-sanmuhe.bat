@echo off
setlocal

set "ROOT=%~dp0"

:menu
cls
echo.
echo === Sanmuhe Mini Program Launcher ===
echo.
echo 1. Open browser preview now
echo 2. Configure AppID and cloud envId
echo 3. Check cloud readiness
echo 4. Login WeChat DevTools CLI
echo 5. Run full cloud preview wizard
echo 6. Open WeChat DevTools project
echo 7. Check preview output files
echo 0. Exit
echo.

choice /c 12345670 /m "Choose an action"
set "ACTION=%ERRORLEVEL%"

if "%ACTION%"=="8" exit /b 0
if "%ACTION%"=="1" call "%ROOT%open-preview.bat"
if "%ACTION%"=="2" call "%ROOT%configure-cloud.bat"
if "%ACTION%"=="3" call "%ROOT%check-cloud-ready.bat"
if "%ACTION%"=="4" call "%ROOT%wechat-devtools-login.bat"
if "%ACTION%"=="5" call "%ROOT%sanmuhe-cloud-preview.bat"
if "%ACTION%"=="6" call "%ROOT%open-sanmuhe-devtools.bat"
if "%ACTION%"=="7" call "%ROOT%check-preview-output.bat"

goto menu
