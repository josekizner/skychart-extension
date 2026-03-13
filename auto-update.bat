@echo off
:: =====================================================
:: ATOM Auto-Update Script
:: Faz git pull na pasta da extensão periodicamente
:: Adicione ao Task Scheduler do Windows (a cada 30 min)
:: =====================================================

set EXTENSION_PATH=%~dp0

echo [Atom Update] %date% %time% - Verificando atualizações...

cd /d "%EXTENSION_PATH%"

:: Verifica se é um repositório git
if not exist ".git" (
    echo [Atom Update] ERRO: Pasta não é um repositório git
    exit /b 1
)

:: Salva hash atual
for /f %%i in ('git rev-parse HEAD') do set OLD_HASH=%%i

:: Faz pull
git pull origin main --quiet

:: Compara hash
for /f %%i in ('git rev-parse HEAD') do set NEW_HASH=%%i

if "%OLD_HASH%"=="%NEW_HASH%" (
    echo [Atom Update] Sem atualizações.
) else (
    echo [Atom Update] ATUALIZADO! %OLD_HASH:~0,8% → %NEW_HASH:~0,8%
    echo [Atom Update] Recarregue a extensão no Chrome: chrome://extensions
)

exit /b 0
