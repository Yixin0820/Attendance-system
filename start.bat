@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org/ and retry.
  pause
  exit /b 1
)
echo Frontend-only demo mode (local sample data, no backend).
echo For real data use start-all.bat instead.
echo Keep this window open. Press Ctrl+C to stop.
echo.
node scripts/start-all.mjs --frontend-only --no-browser
echo.
pause
