@echo off
cd /d "%~dp0"
title Dhanya OS - Dev Server
echo ================================================
echo    DHANYA OS - Starting...
echo    Browser mein kholo: http://localhost:3000
echo    Band karne ke liye: CTRL+C dabao
echo ================================================
where bun >nul 2>nul
if %errorlevel%==0 (
    bun x next dev -p 3000
) else (
    "%USERPROFILE%\.bun\bin\bun.exe" x next dev -p 3000
)
pause
