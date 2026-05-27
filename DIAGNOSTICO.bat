@echo off
title MultiAtend - Diagnostico
color 0E
cls

echo.
echo  ==========================================
echo   MULTIATEND - Diagnostico de problemas
echo  ==========================================
echo.

set "ERRO=0"

echo  [1] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  PROBLEMA: Node.js nao encontrado!
    echo.
    echo  SOLUCAO: Acesse https://nodejs.org
    echo  Baixe a versao LTS e instale.
    echo.
    set "ERRO=1"
) else (
    echo  OK - Node.js encontrado.
)

echo.
echo  [2] Verificando NPM...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  PROBLEMA: NPM nao encontrado!
    set "ERRO=1"
) else (
    echo  OK - NPM encontrado.
)

echo.
echo  [3] Verificando arquivo .env...
if not exist "backend\.env" (
    echo  AVISO: Arquivo .env nao existe.
    copy "backend\.env.example" "backend\.env" >nul
    echo  Criado! Abra backend\.env e cole sua OPENAI_API_KEY
) else (
    findstr /i "OPENAI_API_KEY=sk-" "backend\.env" >nul
    if errorlevel 1 (
        echo  AVISO: OPENAI_API_KEY parece vazia ou incorreta!
    ) else (
        echo  OK - Chave OpenAI encontrada.
    )
)

echo.
echo  [4] Verificando porta 3001...
netstat -an | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo  AVISO: Porta 3001 ja esta em uso!
) else (
    echo  OK - Porta 3001 disponivel.
)

echo.
echo  =========================================
echo.
if %ERRO% equ 1 (
    color 0C
    echo  Corrija os problemas acima.
    echo  Depois rode o INICIAR.bat novamente.
    echo.
    pause
    exit /b 1
)

color 0A
echo  Tudo OK! Instalando e iniciando...
echo.

pushd "%~dp0"

if not exist "backend\node_modules" (
    echo  [*] Instalando backend...
    pushd backend
    call npm install
    popd
)

if not exist "frontend\node_modules" (
    echo  [*] Instalando frontend...
    pushd frontend
    call npm install
    popd
)

if not exist "frontend\dist" (
    echo  [*] Buildando frontend...
    pushd frontend
    call npm run build
    popd
)

echo.
echo  ==========================================
echo   Iniciando servidor...
echo  ==========================================
echo.

start /b cmd /c "timeout /t 4 >nul && start http://localhost:3001"
pushd backend
call node server.js
popd

echo.
echo  Servidor encerrado.
popd
pause
