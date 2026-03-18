@echo off
:: ============================================================
:: ATOM | MOND SHIPPING — Instalador Completo (1 clique)
:: Instala Git, clona repositorio, configura perfil, auto-update
:: ============================================================

title ATOM - Instalador

echo ============================================
echo   ATOM - Mond Shipping
echo   Instalador Automatico
echo ============================================
echo.

:: ===== VARIAVEIS =====
set REPO_URL=https://github.com/josekizner/skychart-extension.git
set INSTALL_DIR=%USERPROFILE%\.gemini\antigravity\scratch\skychart-extension
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_NAME=Skychart-AutoUpdate

:: ===== 1. VERIFICA/INSTALA GIT =====
echo [1/5] Verificando Git...
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Git nao encontrado. Instalando...
    echo Baixando Git for Windows...
    
    :: Baixa o instalador do Git
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe' -OutFile '%TEMP%\git-installer.exe'"
    
    if not exist "%TEMP%\git-installer.exe" (
        echo ERRO: Falha ao baixar Git. Verifique sua internet.
        pause
        exit /b 1
    )
    
    echo Instalando Git silenciosamente...
    "%TEMP%\git-installer.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
    
    :: Atualiza PATH
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
    
    echo Git instalado!
) else (
    echo Git OK!
)

:: ===== 2. CLONA OU ATUALIZA REPOSITORIO =====
echo.
echo [2/5] Preparando extensao...

if exist "%INSTALL_DIR%\.git" (
    echo Extensao ja existe. Atualizando...
    cd /d "%INSTALL_DIR%"
    git pull origin main --quiet 2>nul
    echo Atualizado!
) else (
    echo Clonando repositorio...
    
    :: Cria diretorio pai se nao existe
    if not exist "%USERPROFILE%\.gemini\antigravity\scratch" (
        mkdir "%USERPROFILE%\.gemini\antigravity\scratch"
    )
    
    cd /d "%USERPROFILE%\.gemini\antigravity\scratch"
    git clone %REPO_URL% skychart-extension 2>nul
    
    if not exist "%INSTALL_DIR%\.git" (
        echo ERRO: Falha ao clonar. Verifique sua internet.
        pause
        exit /b 1
    )
    echo Clonado!
)

:: ===== 3. CONFIGURA PERFIL =====
echo.
echo [3/5] Selecione o perfil do colaborador:
echo.
echo   1 - Financeiro (Cambio + Serasa + Chequeio)
echo   2 - Financeiro + Demurrage + Chequeio
echo   3 - Operacional (Tracking + Frete + Chequeio)
echo   4 - Comercial (Cotacao + Frete)
echo   5 - Demurrage
echo   6 - Master (Todos os modulos)
echo.
set /p CHOICE="Digite o numero: "

if "%CHOICE%"=="1" set PROFILE=financeiro
if "%CHOICE%"=="2" set PROFILE=financeiro-demurrage
if "%CHOICE%"=="3" set PROFILE=operacional
if "%CHOICE%"=="4" set PROFILE=comercial
if "%CHOICE%"=="5" set PROFILE=demurrage
if "%CHOICE%"=="6" set PROFILE=master

if not defined PROFILE (
    echo Opcao invalida! Usando perfil financeiro.
    set PROFILE=financeiro
)

:: Cria local-config.json (nao vai pro git, ta no .gitignore)
echo {"profile":"%PROFILE%"} > "%INSTALL_DIR%\local-config.json"
echo Perfil configurado: %PROFILE%

:: ===== 4. INSTALA AUTO-UPDATE (Scheduled Task - mais confiavel que VBS) =====
echo.
echo [4/5] Instalando auto-update...

:: Remove VBS antigo se existir
if exist "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs" del "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs" 2>nul

:: Remove task anterior se existir
schtasks /delete /tn "AtomAutoUpdate" /f 2>nul

:: Cria Scheduled Task que roda git pull a cada 2 minutos
schtasks /create /tn "AtomAutoUpdate" /tr "cmd /c cd /d \"%INSTALL_DIR%\" && git pull origin main --quiet 2>nul" /sc MINUTE /mo 2 /f >nul 2>nul

if %ERRORLEVEL% equ 0 (
    echo Auto-update instalado via Scheduled Task!
    echo   Frequencia: a cada 2 minutos
    echo   Gerenciado pelo Windows - nao para nunca
) else (
    echo AVISO: Scheduled Task falhou. Usando metodo VBS como fallback...
    set VBS_FILE=%INSTALL_DIR%\skychart-autoupdate.vbs
    (
    echo Set WshShell = CreateObject^("WScript.Shell"^)
    echo WshShell.Run "cmd /c cd /d ""%INSTALL_DIR%"" ^&^& :LOOP ^&^& git pull origin main --quiet 2^>nul ^&^& timeout /t 120 /nobreak ^>nul ^&^& goto LOOP", 0, False
    ) > "%VBS_FILE%"
    copy /y "%VBS_FILE%" "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs" >nul 2>nul
    start "" wscript.exe "%STARTUP_DIR%\%SHORTCUT_NAME%.vbs"
    echo Auto-update instalado via VBS fallback!
)

:: ===== 5. INSTRUCOES FINAIS =====
echo.
echo [5/5] Instrucoes para ativar no Chrome:
echo.
echo ============================================
echo   INSTALACAO COMPLETA!
echo.
echo   Perfil: %PROFILE%
echo   Pasta:  %INSTALL_DIR%
echo.
echo   AGORA FACA NO CHROME:
echo   1. Abra chrome://extensions
echo   2. Ative "Modo do desenvolvedor"
echo   3. Clique "Carregar sem compactacao"
echo   4. Selecione a pasta:
echo      %INSTALL_DIR%
echo   5. PRONTO!
echo.
echo   Auto-update: ativo (git pull a cada 5 min)
echo ============================================
echo.
pause
