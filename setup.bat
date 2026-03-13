@echo off
title Atom - Setup
color 0B

echo.
echo  ===================================
echo   ATOM - Setup Extensao Mond Shipping
echo  ===================================
echo.

set "INSTALL_DIR=%USERPROFILE%\atom-extension"
set "REPO=https://github.com/josekizner/skychart-extension.git"

:: 1. Verifica/instala Git
where git >nul 2>nul
if errorlevel 1 (
    echo [1/4] Git nao encontrado. Instalando...
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements >nul 2>nul
    set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
    where git >nul 2>nul
    if errorlevel 1 (
        echo [ERRO] Nao foi possivel instalar Git.
        echo   Instale manualmente: https://git-scm.com/download/win
        pause
        exit /b 1
    )
    echo   Git instalado.
) else (
    echo [1/4] Git encontrado.
)

:: 2. Clona ou atualiza
echo [2/4] Baixando extensao...
if exist "%INSTALL_DIR%\.git" (
    cd /d "%INSTALL_DIR%"
    git pull origin main --quiet
    echo   Atualizado.
) else (
    if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" >nul 2>nul
    git clone "%REPO%" "%INSTALL_DIR%" --quiet
    if errorlevel 1 (
        echo [ERRO] Falha ao clonar repositorio.
        pause
        exit /b 1
    )
    echo   Clonado.
)

:: 3. Seleciona departamento
echo.
echo [3/4] Selecione o departamento:
echo.
echo   1 = Financeiro   - Cambio, Serasa
echo   2 = Operacional  - Tracking, Frete
echo   3 = Comercial    - Cotacao, Frete
echo   4 = Master       - Todos
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
>"%INSTALL_DIR%\local-config.json" echo {"profile":"%PROFILE%"}
>"%INSTALL_DIR%\profile-config.js" echo var ATOM_PROFILE = "%PROFILE%";

:: 4. Auto-update a cada 30 min
echo [4/4] Configurando auto-update...

echo @echo off > "%INSTALL_DIR%\do-update.bat"
echo set "PATH=%%PATH%%;C:\Program Files\Git\cmd" >> "%INSTALL_DIR%\do-update.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\do-update.bat"
echo git pull origin main --quiet >> "%INSTALL_DIR%\do-update.bat"

:: VBS wrapper pra rodar invisivel (sem piscar CMD)
echo CreateObject("WScript.Shell").Run """%INSTALL_DIR%\do-update.bat""", 0, False > "%INSTALL_DIR%\do-update.vbs"

schtasks /create /tn "AtomExtensionUpdate" /tr "wscript.exe \"%INSTALL_DIR%\do-update.vbs\"" /sc minute /mo 30 /f >nul 2>nul
if errorlevel 1 (
    echo   Auto-update nao agendado.
) else (
    echo   Auto-update agendado.
)

echo.
echo  ===================================
echo   INSTALACAO CONCLUIDA
echo   Perfil: %PROFILE%
echo   Pasta:  %INSTALL_DIR%
echo   Auto-update: a cada 30 min
echo  ===================================
echo.
echo   PROXIMO PASSO:
echo   1. Abra o Chrome
echo   2. Va em chrome://extensions
echo   3. Ative Modo do desenvolvedor
echo   4. Clique Carregar sem compactacao
echo   5. Selecione: %INSTALL_DIR%
echo.
pause
