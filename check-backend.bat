@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org/ and retry.
  pause
  exit /b 1
)
echo Step 1/2 - environment check
echo.
node scripts/start-all.mjs --check
echo.
echo Step 2/2 - live connection test (starts backend if needed, then stops it)
echo.
node scripts/start-all.mjs --verify
echo.
pause
