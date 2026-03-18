@echo off
title ATOM - Atualizando...
echo.
echo ========================================
echo   ATOM - Atualizando extensao...
echo ========================================
echo.

cd /d "%USERPROFILE%\.gemini\antigravity\scratch\skychart-extension"

echo Baixando atualizacoes...
git pull origin main 2>nul

echo.
echo ========================================
echo   ATUALIZADO!
echo.
echo   Agora no Chrome:
echo   1. Abra chrome://extensions
echo   2. Clique no botao de recarregar
echo      do "Atom - Multiagentes"
echo ========================================
echo.
pause
