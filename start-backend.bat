@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org/ and retry.
  pause
  exit /b 1
)
echo Starting backend API only: http://127.0.0.1:8000/api/docs
echo Keep this window open. Press Ctrl+C to stop.
echo.
node scripts/start-all.mjs --backend-only --no-browser
echo.
pause
