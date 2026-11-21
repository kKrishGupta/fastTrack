@echo off
title FaceTrack - ActivityWatch Monitoring
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20.19 or newer from https://nodejs.org/en/download then open this file again.
  pause
  exit /b 1
)
node "%~dp0index.mjs" run
pause
