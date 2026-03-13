@echo off
chcp 65001 >nul
title Atom - Setup Extensão Mond Shipping
color 0B

echo.
echo   ╔═══════════════════════════════════════════╗
echo   ║   ATOM - Setup Extensão Mond Shipping     ║
echo   ║   Instalação e Configuração               ║
echo   ╚═══════════════════════════════════════════╝
echo.

:: =====================================================
:: 1. Verifica se git está instalado
:: =====================================================
where git >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Git nao esta instalado!
    echo Baixe em: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: =====================================================
:: 2. Define pasta de instalação
:: =====================================================
set INSTALL_DIR=%USERPROFILE%\atom-extension
echo [1/4] Pasta de instalacao: %INSTALL_DIR%

if exist "%INSTALL_DIR%\.git" (
    echo   Extensao ja instalada. Atualizando...
    cd /d "%INSTALL_DIR%"
    git pull origin main --quiet
    echo   Atualizado!
) else (
    echo   Clonando repositorio...
    git clone https://github.com/josekizner/skychart-extension.git "%INSTALL_DIR%" --quiet
    if errorlevel 1 (
        echo [ERRO] Falha ao clonar. Verifique acesso ao repositorio.
        pause
        exit /b 1
    )
    echo   Clonado!
)

:: =====================================================
:: 3. Seleciona departamento
:: =====================================================
echo.
echo [2/4] Selecione o departamento:
echo.
echo   1. Financeiro   (Cambio + Serasa + Frete)
echo   2. Operacional  (Tracking + Frete)
echo   3. Comercial    (Cotacao + Frete)
echo   4. Master       (Todos os agentes)
echo.
set /p DEPT="Digite o numero (1-4): "

if "%DEPT%"=="1" (
    set PROFILE=financeiro
    set AGENTS=cambio,serasa,frete
    set LABEL=Financeiro
) else if "%DEPT%"=="2" (
    set PROFILE=operacional
    set AGENTS=tracking,frete
    set LABEL=Operacional
) else if "%DEPT%"=="3" (
    set PROFILE=comercial
    set AGENTS=cotacao,frete
    set LABEL=Comercial
) else if "%DEPT%"=="4" (
    set PROFILE=master
    set AGENTS=cambio,serasa,frete,tracking,cotacao
    set LABEL=Master
) else (
    echo [ERRO] Opcao invalida.
    pause
    exit /b 1
)

echo   Perfil selecionado: %LABEL%

:: =====================================================
:: 4. Salva config do perfil (será lida pelo popup.js)
:: =====================================================
echo {"profile":"%PROFILE%","agents":[%AGENTS%]} > "%INSTALL_DIR%\local-config.json"
echo [3/4] Configuracao salva.

:: =====================================================
:: 5. Configura auto-update no Task Scheduler (30 min)
:: =====================================================
echo.
echo [4/4] Configurando atualizacao automatica...

:: Cria script de update
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo git pull origin main --quiet
) > "%INSTALL_DIR%\do-update.bat"

:: Agenda no Task Scheduler (roda a cada 30 min)
schtasks /create /tn "AtomExtensionUpdate" /tr "\"%INSTALL_DIR%\do-update.bat\"" /sc minute /mo 30 /f >nul 2>nul
if errorlevel 1 (
    echo   [AVISO] Nao foi possivel agendar auto-update.
    echo   Execute manualmente: %INSTALL_DIR%\do-update.bat
) else (
    echo   Auto-update agendado! (a cada 30 minutos^)
)

:: =====================================================
:: PRONTO!
:: =====================================================
echo.
echo   ╔═══════════════════════════════════════════╗
echo   ║   INSTALACAO CONCLUIDA!                   ║
echo   ║                                           ║
echo   ║   Perfil: %LABEL%                         
echo   ║   Pasta:  %INSTALL_DIR%                   
echo   ║                                           ║
echo   ║   PROXIMO PASSO:                          ║
echo   ║   1. Abra chrome://extensions             ║
echo   ║   2. Ative "Modo do desenvolvedor"        ║
echo   ║   3. Clique "Carregar sem compactacao"    ║
echo   ║   4. Selecione: %INSTALL_DIR%             ║
echo   ║                                           ║
echo   ╚═══════════════════════════════════════════╝
echo.
pause
