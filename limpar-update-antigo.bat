@echo off
title ATOM - Limpeza
echo.
echo ========================================
echo   ATOM - Removendo atualizador antigo
echo ========================================
echo.

:: Mata processos VBS rodando
taskkill /f /im wscript.exe 2>nul >nul
echo Processos VBS encerrados.

:: Remove VBS do Startup
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP_DIR%\Skychart-AutoUpdate.vbs" (
    del "%STARTUP_DIR%\Skychart-AutoUpdate.vbs" 2>nul
    echo VBS antigo removido do Startup.
) else (
    echo VBS nao encontrado no Startup (ja removido).
)

:: Cria Scheduled Task invisivel
schtasks /delete /tn "AtomAutoUpdate" /f 2>nul >nul
set INSTALL_DIR=%USERPROFILE%\.gemini\antigravity\scratch\skychart-extension
schtasks /create /tn "AtomAutoUpdate" /tr "wscript.exe \"%INSTALL_DIR%\auto-update.vbs\"" /sc MINUTE /mo 2 /f >nul 2>nul

if %ERRORLEVEL% equ 0 (
    echo Scheduled Task criado (invisivel, a cada 2 min).
) else (
    echo AVISO: Scheduled Task falhou.
)

echo.
echo ========================================
echo   LIMPEZA COMPLETA!
echo   CMD nao vai mais piscar.
echo ========================================
echo.
pause
