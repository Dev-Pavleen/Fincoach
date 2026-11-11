@echo off
setlocal
cd /d "%~dp0"

if not exist "package.json" (
  echo Could not find the FinCoach project files in this folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js 20.19 or newer, then restart VS Code.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Dependencies are missing. Run npm.cmd install in this folder first.
  pause
  exit /b 1
)

echo Starting the FinCoach website and account API.
echo Your default browser will open when both are ready.
echo Keep this window open while using FinCoach.
echo.
call npm.cmd run preview:local

echo.
echo FinCoach has stopped. Press any key to close this window.
pause >nul
