# 🟢 MultiAtend — WhatsApp Kanban com IA

Dashboard para gerenciar **4 contas WhatsApp simultaneamente** (2 Uazapi + 2 Normal)
com classificação automática por IA, kanban de status e backup automático a cada 1h.

---

## 📁 Estrutura

```
multiatend/
├── backend/          ← Node.js + Express (proxy OpenAI + Uazapi)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/         ← React + Vite
    ├── src/
    │   ├── main.jsx
    │   └── App.jsx
    ├── public/
    │   └── favicon.svg
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🚀 Rodar localmente (desenvolvimento)

### Pré-requisitos
- [Node.js 18+](https://nodejs.org/)
- Chave da [OpenAI API](https://platform.openai.com/api-keys)

### Passo a passo

```bash
# 1. Instalar tudo de uma vez
bash setup.sh

# 2. Adicionar a chave no .env
nano backend/.env
# OPENAI_API_KEY=sk-sua-chave-aqui

# 3. Terminal 1 — backend
cd backend && npm run dev

# 4. Terminal 2 — frontend
cd frontend && npm run dev
```

Acesse: **http://localhost:5173**

---

## 🖥️ Rodar em servidor VPS / máquina dedicada

### Opção A — Rodar direto com Node (simples)

```bash
# No servidor, instale o Node se não tiver:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Suba os arquivos do projeto e instale:
bash setup.sh

# Configure o .env:
nano backend/.env

# Build do frontend (gera pasta dist/):
cd frontend && npm run build && cd ..

# Sirva o frontend estático pelo próprio backend:
# (o backend já serve /dist automaticamente — veja server.js)
cd backend && node server.js
```

Acesse pelo IP do servidor: **http://SEU-IP:3001**

### Opção B — PM2 (mantém rodando em background)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Build do frontend
cd frontend && npm run build && cd ..

# Iniciar backend com PM2
cd backend
pm2 start server.js --name multiatend
pm2 save
pm2 startup   # faz reiniciar automaticamente no boot

# Ver logs
pm2 logs multiatend
pm2 status
```

---

## 🌐 Acessar de qualquer lugar (sem domínio)

Se quiser acessar de fora da rede local sem comprar domínio:

```bash
# Instalar cloudflared (túnel gratuito da Cloudflare)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared

# Criar túnel temporário (sem conta, funciona na hora)
./cloudflared tunnel --url http://localhost:3001
# Gera uma URL pública do tipo: https://xxxx.trycloudflare.com
```

---

## 🔧 Configuração (.env)

```env
# Obrigatório — pegue em https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-sua-chave-aqui

# Porta do servidor (padrão: 3001)
PORT=3001

# Liberar acesso do frontend (em produção coloque o IP/domínio)
FRONTEND_ORIGIN=*
```

---

## 📡 Rotas do Backend

| Método | Rota              | Descrição                              |
|--------|-------------------|----------------------------------------|
| `POST` | `/api/classify`   | Classifica mensagem via ChatGPT (IA)   |
| `ALL`  | `/api/uazapi/*`   | Proxy reverso para sua Uazapi          |
| `GET`  | `/api/health`     | Healthcheck                            |
| `GET`  | `/`               | Serve o frontend (build estático)      |

---

## ⚡ Funcionalidades

- **4 contas simultâneas** — 2 Uazapi (API real) + 2 Normal (simuladas)
- **Kanban automático** — IA classifica: Espera / Em Atendimento / Urgente / Concluído
- **Histórico** — últimas 50 mensagens via Uazapi
- **Backup automático** — a cada 1 hora no localStorage
- **QR Code** — para conectar cada conta Uazapi
- **Cores por conta** — identidade visual única por conexão

---

## 💰 Custo

O modelo usado é o **gpt-4o-mini** — barato e rápido.
Classificar centenas de mensagens custa menos de **US$ 0,01**.
Contas novas na OpenAI ganham crédito grátis.

---

## 🛠️ Tecnologias

- **Frontend**: React 18, Vite 5
- **Backend**: Node.js, Express
- **IA**: ChatGPT (OpenAI API — gpt-4o-mini)
- **WhatsApp**: Uazapi
