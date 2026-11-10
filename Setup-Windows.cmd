@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\bootstrap-windows.ps1" %*
set "SETUP_EXIT=%ERRORLEVEL%"
if not "%SETUP_EXIT%"=="0" (
  echo Setup stopped. Read the message above, then run this file again.
  pause
)
exit /b %SETUP_EXIT%
