@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo [ARS3NAL] Node.js is required. Install from https://nodejs.org and re-run. && pause && exit /b 1)

if not exist node_modules (
  echo [ARS3NAL] Installing dependencies ^(first run^)...
  call npm install || (echo [ARS3NAL] npm install failed. & pause & exit /b 1)
)

if not exist data\arsenal.db (
  echo [ARS3NAL] Seeding database ^(first run^)...
  call npm run seed
)

echo [ARS3NAL] Building UI...
call npm run build

echo.
echo [ARS3NAL] Starting on http://localhost:7331
start "" http://localhost:7331
call npm run start
