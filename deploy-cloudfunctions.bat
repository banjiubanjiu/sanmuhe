@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloudfunctions.ps1" %*
pause
