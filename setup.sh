#!/bin/bash
# ─────────────────────────────────────────────────
# MultiAtend – setup e start rápido
# ─────────────────────────────────────────────────

echo ""
echo "🟢  MultiAtend – Setup"
echo "─────────────────────────────────────────────────"

# Backend
echo ""
echo "📦  Instalando dependências do backend..."
cd backend && npm install --silent
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️   Arquivo .env criado!"
  echo "     Edite backend/.env e coloque sua OPENAI_API_KEY"
fi
cd ..

# Frontend
echo ""
echo "📦  Instalando dependências do frontend..."
cd frontend && npm install --silent
cd ..

echo ""
echo "✅  Instalação concluída!"
echo ""
echo "─────────────────────────────────────────────────"
echo ""
echo "▶  MODO DESENVOLVIMENTO (2 terminais):"
echo ""
echo "   Terminal 1:  cd backend  && npm run dev"
echo "   Terminal 2:  cd frontend && npm run dev"
echo "   Acesse:      http://localhost:5173"
echo ""
echo "─────────────────────────────────────────────────"
echo ""
echo "▶  MODO SERVIDOR (tudo num terminal só):"
echo ""
echo "   cd frontend && npm run build && cd .."
echo "   cd backend  && node server.js"
echo "   Acesse:      http://localhost:3001"
echo ""
echo "─────────────────────────────────────────────────"
echo ""
echo "▶  COM PM2 (background, reinicia no boot):"
echo ""
echo "   npm install -g pm2"
echo "   cd frontend && npm run build && cd .."
echo "   cd backend  && pm2 start server.js --name multiatend"
echo "   pm2 save && pm2 startup"
echo ""
echo "─────────────────────────────────────────────────"
