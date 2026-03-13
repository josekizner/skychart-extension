@echo off
title Atom - Setup
color 0B

echo.
echo  ===================================
echo   ATOM - Setup Extensao Mond Shipping
echo  ===================================
echo.

set "SOURCE_DIR=%~dp0"
set "INSTALL_DIR=%USERPROFILE%\atom-extension"

:: 1. Copia a pasta pra perfil do usuario
echo [1/3] Copiando extensao para %INSTALL_DIR%...

if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" >nul 2>nul
xcopy "%SOURCE_DIR%*" "%INSTALL_DIR%\" /s /e /y /q >nul 2>nul

if not exist "%INSTALL_DIR%\manifest.json" (
    echo [ERRO] Falha ao copiar. Verifique permissoes.
    pause
    exit /b 1
)
echo   Copiado!

:: 2. Seleciona departamento
echo.
echo [2/3] Selecione o departamento:
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
echo {"profile":"%PROFILE%"} > "%INSTALL_DIR%\local-config.json"
echo [3/3] Perfil salvo!

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
echo   Para atualizar: copie a pasta nova
echo   e rode setup.bat de novo.
echo.
pause
