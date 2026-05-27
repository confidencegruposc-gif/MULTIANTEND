FROM node:18-alpine

WORKDIR /app

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

# Definir variável de ambiente
ENV NODE_ENV=production

# Rodar backend (que vai servir o frontend estático)
CMD ["node", "backend/server.js"]
