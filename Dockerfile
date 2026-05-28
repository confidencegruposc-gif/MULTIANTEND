FROM node:20-alpine

WORKDIR /app

# Criar diretório para dados persistentes
RUN mkdir -p /data && chmod 777 /data

# Copiar arquivo de raiz
COPY package.json .

# Copiar código
COPY backend backend
COPY frontend frontend

# Instalar backend
RUN cd backend && npm install --omit=dev

# Instalar e buildar frontend
RUN cd frontend && npm install && npm run build

# Expor porta
EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/data

# Rodar backend
CMD ["node", "backend/server.js"]
