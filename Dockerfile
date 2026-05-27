FROM node:18-alpine

WORKDIR /app

# Copiar package.json do backend
COPY backend/package.json backend/package.json
COPY backend/package-lock.json* backend/package-lock.json

# Copiar package.json do frontend
COPY frontend/package.json frontend/package.json
COPY frontend/package-lock.json* frontend/package-lock.json

# Instalar dependências
RUN cd backend && npm install --omit=dev
RUN cd frontend && npm install

# Copiar código
COPY backend backend
COPY frontend frontend

# Build frontend
RUN cd frontend && npm run build

# Expor porta
EXPOSE 3000

# Rodar backend
CMD ["node", "backend/server.js"]
