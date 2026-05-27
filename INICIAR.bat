@echo off
title MultiAtend - Iniciando...
color 0A
cls

echo.
echo  ==========================================
echo   MULTIATEND - WhatsApp Kanban com IA
echo  ==========================================
echo.

echo  [1] Verificando Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERRO: Node.js nao esta instalado!
    echo.
    echo  Abrindo site para download...
    start https://nodejs.org/pt/download
    echo.
    echo  1. Baixe a versao LTS
    echo  2. Instale normalmente
    echo  3. Feche e abra INICIAR.bat novamente
    echo.
    pause
    exit /b
)
echo  OK

echo.
echo  [2] Verificando OpenAI API Key...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    color 0E
    echo.
    echo  ATENCAO: Arquivo .env criado!
    echo.
    echo  Abrindo para voce colar a chave...
    echo  (pegue em: https://platform.openai.com/api-keys)
    echo.
    start notepad "backend\.env"
    echo  Cole sua chave sk-... no lugar de sk-xxxxxxxxxxxxxxxx
    echo  Salve (Ctrl+S) e feche o Notepad.
    echo.
    pause
)
echo  OK

echo.
echo  [3] Instalando dependencias...
pushd "%~dp0"

if not exist "backend\node_modules" (
    echo  [*] Backend...
    pushd backend
    call npm install --silent
    popd
)

if not exist "frontend\node_modules" (
    echo  [*] Frontend...
    pushd frontend
    call npm install --silent
    popd
)
echo  OK

echo.
echo  [4] Preparando interface...
if not exist "frontend\dist" (
    echo  [*] Buildando...
    pushd frontend
    call npm run build
    popd
)
echo  OK

echo.
echo  [5] Iniciando servidor...
echo.
color 0A
echo  ==========================================
echo   Servidor rodando!
echo   Nao feche esta janela.
echo.
echo   Acesse: http://localhost:3001
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
