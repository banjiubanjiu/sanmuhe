@echo off
setlocal

set "ROOT=%~dp0"

:menu
cls
echo.
echo === Sanmuhe Mini Program Launcher ===
echo.
echo 1. Configure AppID and cloud envId
echo 2. Check cloud readiness
echo 3. Deploy cloud functions
echo 4. Open WeChat DevTools project
echo 0. Exit
echo.

choice /c 12340 /m "Choose an action"
set "ACTION=%ERRORLEVEL%"

if "%ACTION%"=="5" exit /b 0
if "%ACTION%"=="1" call "%ROOT%configure-cloud.bat"
if "%ACTION%"=="2" call "%ROOT%check-cloud-ready.bat"
if "%ACTION%"=="3" call "%ROOT%deploy-cloudfunctions.bat"
if "%ACTION%"=="4" call "%ROOT%open-sanmuhe-devtools.bat"

goto menu
