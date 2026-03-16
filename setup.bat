@echo off
:: ============================================================
:: SKYCHART AI — Setup Completo (1 clique)
:: Instala auto-update no Startup do Windows automaticamente
:: ============================================================

echo ============================================
echo   SKYCHART AI — Setup Automatico
echo ============================================
echo.

set EXT_PATH=%~dp0
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_FILE=%EXT_PATH%skychart-autoupdate.vbs
set SHORTCUT_NAME=Skychart-AutoUpdate

:: 1. Cria o VBS que roda o git pull invisível (sem janela CMD)
echo [1/3] Criando auto-updater silencioso...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "cmd /c cd /d ""%EXT_PATH%"" ^&^& :LOOP ^&^& git pull origin main --quiet 2^>nul ^&^& timeout /t 300 /nobreak ^>nul ^&^& goto LOOP", 0, False
) > "%VBS_FILE%"

:: 2. Copia o VBS pro Startup do Windows
echo [2/3] Instalando no Startup do Windows...
copy /y "%VBS_FILE%" "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs" >nul 2>nul

:: 3. Inicia agora
echo [3/3] Iniciando auto-update...
start "" wscript.exe "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs"

echo.
echo ============================================
echo   PRONTO! Auto-update instalado!
echo   - Git pull a cada 5 minutos (invisivel)  
echo   - Extensao recarrega sozinha
echo   - Nunca mais precisa fazer nada
echo ============================================
echo.
pause
