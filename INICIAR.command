#!/bin/bash
# Mac/Linux — clique duas vezes para abrir

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

clear
echo ""
echo "  =========================================="
echo "   MULTIATEND - WhatsApp Kanban com IA"
echo "  =========================================="
echo ""

# Verificar Node
if ! command -v node &> /dev/null; then
    echo "  [ERRO] Node.js não encontrado!"
    echo ""
    echo "  Baixe em: https://nodejs.org"
    echo ""
    open "https://nodejs.org" 2>/dev/null || xdg-open "https://nodejs.org" 2>/dev/null
    read -p "  Pressione Enter após instalar..."
    exit 1
fi

echo "  Node.js: $(node -v)"
echo ""

# Criar .env se não existir
if [ ! -f "backend/.env" ]; then
    cp "backend/.env.example" "backend/.env"
    echo "  [!] Arquivo .env criado!"
    echo ""
    echo "  Adicione sua chave OPENAI_API_KEY em backend/.env"
    echo "  (pegue em: https://platform.openai.com/api-keys)"
    echo ""
    # Tenta abrir no editor padrão
    open "backend/.env" 2>/dev/null || xdg-open "backend/.env" 2>/dev/null || nano "backend/.env"
    echo ""
    read -p "  Pressione Enter após salvar a chave..."
fi

# Instalar dependências
if [ ! -d "backend/node_modules" ]; then
    echo "  Instalando backend..."
    cd backend && npm install --silent && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "  Instalando frontend..."
    cd frontend && npm install --silent && cd ..
fi

# Build frontend
if [ ! -d "frontend/dist" ]; then
    echo "  Preparando interface..."
    cd frontend && npm run build && cd ..
fi

echo ""
echo "  =========================================="
echo "   Iniciando servidor..."
echo "  =========================================="
echo ""

# Abre o navegador após 3s
(sleep 3 && (open "http://localhost:3001" 2>/dev/null || xdg-open "http://localhost:3001" 2>/dev/null)) &

echo "  Servidor rodando! Não feche esta janela."
echo ""
echo "  Acesse: http://localhost:3001"
echo ""

cd backend && node server.js
