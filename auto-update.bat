@echo off
:: ============================================================
:: SKYCHART AI — Auto-Update Agent
:: Roda git pull a cada 5 minutos automaticamente
:: Para instalar: copie este arquivo para a pasta Startup
:: Win+R → shell:startup → cole o atalho aqui
:: ============================================================

title Skychart AI Auto-Update

:: Caminho da extensão (ajuste se necessário)
set EXT_PATH=%~dp0

:: Se o script está na pasta da extensão, usa o diretório dele
:: Se não, tenta o caminho padrão
if not exist "%EXT_PATH%.git" (
    :: Tenta caminhos comuns
    for %%P in (
        "%USERPROFILE%\.gemini\antigravity\scratch\skychart-extension"
        "%USERPROFILE%\Desktop\skychart-extension"
        "%USERPROFILE%\Documents\skychart-extension"
    ) do (
        if exist "%%~P\.git" set EXT_PATH=%%~P
    )
)

echo ============================================
echo   SKYCHART AI — Auto-Update Agent
echo   Pasta: %EXT_PATH%
echo   Intervalo: 5 minutos
echo   NÃO feche esta janela!
echo ============================================
echo.

:LOOP
echo [%date% %time%] Verificando atualizações...

cd /d "%EXT_PATH%"

:: Faz git fetch pra ver se tem mudanças
git fetch origin main --quiet 2>nul

:: Checa se tem commits novos
for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do set BEHIND=%%i

if "%BEHIND%"=="" set BEHIND=0

if %BEHIND% GTR 0 (
    echo [%date% %time%] %BEHIND% commits novos encontrados! Atualizando...
    git pull origin main --quiet
    echo [%date% %time%] ATUALIZADO! Extensão vai recarregar sozinha.
) else (
    echo [%date% %time%] Tudo atualizado.
)

:: Aguarda 5 minutos (300 segundos)
timeout /t 300 /nobreak >nul
goto LOOP
