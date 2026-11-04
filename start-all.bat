@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org/ and retry.
  echo.
  pause
  exit /b 1
)
echo Starting full stack: backend API + web page.
echo Keep this window open. Press Ctrl+C to stop everything.
echo.
node scripts/start-all.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Startup failed. Read the messages above, or run check-backend.bat.
)
echo.
pause
