@echo off
chcp 65001 >nul 2>nul
title Atom - Setup
color 0B

echo.
echo  ===================================
echo   ATOM - Setup Extensao Mond Shipping
echo  ===================================
echo.

:: Verifica git
where git >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Git nao esta instalado!
    echo Baixe em: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Pasta de instalacao
set "INSTALL_DIR=%USERPROFILE%\atom-extension"
echo [1/4] Pasta: %INSTALL_DIR%

if exist "%INSTALL_DIR%\.git" (
    echo   Extensao ja instalada. Atualizando...
    cd /d "%INSTALL_DIR%"
    git pull origin main --quiet
    echo   Atualizado!
) else (
    echo   Clonando repositorio...
    git clone https://github.com/josekizner/skychart-extension.git "%INSTALL_DIR%" --quiet
    if errorlevel 1 (
        echo [ERRO] Falha ao clonar.
        pause
        exit /b 1
    )
    echo   Clonado!
)

:: Seleciona departamento
echo.
echo [2/4] Selecione o departamento:
echo.
echo   1 = Financeiro   (Cambio + Serasa + Frete)
echo   2 = Operacional  (Tracking + Frete)
echo   3 = Comercial    (Cotacao + Frete)
echo   4 = Master       (Todos)
echo.
set /p DEPT="Digite 1, 2, 3 ou 4: "

if "%DEPT%"=="1" set "PROFILE=financeiro"
if "%DEPT%"=="2" set "PROFILE=operacional"
if "%DEPT%"=="3" set "PROFILE=comercial"
if "%DEPT%"=="4" set "PROFILE=master"

if not defined PROFILE (
    echo [ERRO] Opcao invalida.
    pause
    exit /b 1
)

echo   Perfil: %PROFILE%

:: Salva config
echo {"profile":"%PROFILE%"} > "%INSTALL_DIR%\local-config.json"
echo [3/4] Configuracao salva.

:: Auto-update via Task Scheduler
echo [4/4] Configurando auto-update...
echo @echo off > "%INSTALL_DIR%\do-update.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\do-update.bat"
echo git pull origin main --quiet >> "%INSTALL_DIR%\do-update.bat"

schtasks /create /tn "AtomExtensionUpdate" /tr "\"%INSTALL_DIR%\do-update.bat\"" /sc minute /mo 30 /f >nul 2>nul
if errorlevel 1 (
    echo   Auto-update nao agendado. Execute do-update.bat manualmente.
) else (
    echo   Auto-update agendado (a cada 30 min).
)

:: Pronto
echo.
echo  ===================================
echo   INSTALACAO CONCLUIDA!
echo   Perfil: %PROFILE%
echo   Pasta:  %INSTALL_DIR%
echo  ===================================
echo.
echo   PROXIMO PASSO:
echo   1. Abra o Chrome
echo   2. Va em chrome://extensions
echo   3. Ative "Modo do desenvolvedor"
echo   4. Clique "Carregar sem compactacao"
echo   5. Selecione: %INSTALL_DIR%
echo.
pause
