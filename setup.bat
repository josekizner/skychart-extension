@echo off
title Atom - Setup
color 0B

echo.
echo  ===================================
echo   ATOM - Setup Extensao Mond Shipping
echo  ===================================
echo.

set "INSTALL_DIR=%USERPROFILE%\atom-extension"
set "ZIP_URL=https://github.com/josekizner/skychart-extension/archive/refs/heads/main.zip"
set "ZIP_FILE=%TEMP%\atom-ext.zip"

:: 1. Baixa o ZIP do GitHub
echo [1/4] Baixando extensao...
powershell -Command "Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%ZIP_FILE%'" 2>nul
if not exist "%ZIP_FILE%" (
    echo [ERRO] Falha ao baixar. Verifique a internet.
    pause
    exit /b 1
)
echo   Download concluido!

:: 2. Extrai
echo [2/4] Extraindo...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%" >nul 2>nul
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%TEMP%\atom-tmp' -Force"
move "%TEMP%\atom-tmp\skychart-extension-main" "%INSTALL_DIR%" >nul 2>nul
rmdir /s /q "%TEMP%\atom-tmp" >nul 2>nul
del "%ZIP_FILE%" >nul 2>nul

if not exist "%INSTALL_DIR%\manifest.json" (
    echo [ERRO] Falha na extracao.
    pause
    exit /b 1
)
echo   Extraido em %INSTALL_DIR%

:: 3. Seleciona departamento
echo.
echo [3/4] Selecione o departamento:
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

:: 4. Auto-update (baixa ZIP a cada 30 min)
echo [4/4] Configurando auto-update...

(
echo @echo off
echo set "INSTALL_DIR=%INSTALL_DIR%"
echo set "ZIP_URL=%ZIP_URL%"
echo set "ZIP_FILE=%%TEMP%%\atom-ext.zip"
echo powershell -Command "Invoke-WebRequest -Uri '%%ZIP_URL%%' -OutFile '%%ZIP_FILE%%'" 2^>nul
echo if not exist "%%ZIP_FILE%%" exit /b 1
echo powershell -Command "Expand-Archive -Path '%%ZIP_FILE%%' -DestinationPath '%%TEMP%%\atom-tmp' -Force"
echo xcopy "%%TEMP%%\atom-tmp\skychart-extension-main\*" "%%INSTALL_DIR%%\" /s /y /q ^>nul 2^>nul
echo rmdir /s /q "%%TEMP%%\atom-tmp" ^>nul 2^>nul
echo del "%%ZIP_FILE%%" ^>nul 2^>nul
) > "%INSTALL_DIR%\do-update.bat"

schtasks /create /tn "AtomExtensionUpdate" /tr "\"%INSTALL_DIR%\do-update.bat\"" /sc minute /mo 30 /f >nul 2>nul
if errorlevel 1 (
    echo   Auto-update nao agendado. Execute do-update.bat manualmente.
) else (
    echo   Auto-update agendado (a cada 30 min).
)

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
