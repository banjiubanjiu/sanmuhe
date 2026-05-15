@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-preview-output.ps1"
pause
