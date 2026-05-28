@echo off
REM MRM Extractor - launch backend (8000) + frontend (5173)
cd /d "%~dp0"
start "MRM Backend" cmd /k "cd backend && python backend.py"
timeout /t 2 >nul
start "MRM Frontend" cmd /k "cd frontend && npm run dev"
echo.
echo Backend  -^> http://127.0.0.1:8000
echo Frontend -^> http://localhost:5173
