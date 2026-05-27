/**
 * MultiAtend – Backend com WebSocket + Webhook
 * ─────────────────────────────────────────────────────────────────────────────
 * Rotas:
 *   POST /api/classify          → ChatGPT (classifica mensagens)
 *   POST /api/webhook           → Uazapi (recebe mensagens em tempo real)
 *   ALL  /api/uazapi/:path(*)   → proxy Uazapi
 *   GET  /api/health            → healthcheck
 *   GET  /                      → frontend estático
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","token","sessionkey"],
}));
app.use(express.json({ limit: "5mb" }));

// ── WebSocket Connection ──────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`📱 Cliente conectado: ${socket.id}`);
  
  socket.on("disconnect", () => {
    console.log(`📱 Cliente desconectado: ${socket.id}`);
  });
});

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), clients: io.engine.clientsCount });
});

// ── Webhook Uazapi (recebe mensagens em tempo real) ──────────────────────────
app.post("/api/webhook", async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`🔔 Webhook recebido: ${event}`);
    
    // Se for mensagem chegando
    if (event === "messages" && data) {
      const { phone, body, fromMe } = data;
      
      // Não processar mensagens que você mesmo enviou
      if (fromMe) return res.json({ ok: true });
      
      // Pegar nome do contato (simplificado)
      const contact = data.senderName || data.contact || "Desconhecido";
      
      // Classificar com IA
      const classified = await classifyMsg(contact, body);
      
      // Enviar pra todos os clientes conectados via WebSocket
      io.emit("new_message", {
        phone,
        contact,
        message: body,
        lane: classified.lane,
        reason: classified.reason,
        time: new Date().toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}),
      });
      
      console.log(`✅ Mensagem processada: ${contact} → ${classified.lane}`);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Proxy OpenAI → classificação de mensagens ─────────────────────────────────
async function classifyMsg(contact, message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("xxxx")) {
    return { lane: "espera", reason: "API não configurada" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 80,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Classifique mensagens de WhatsApp.
Retorne JSON: {"lane":"urgente"|"atendimento"|"espera"|"concluido","reason":"motivo"}
Regras: urgente=reclamação/CAPS/DEFEITO, atendimento=dúvida, espera=saudação, concluido=elogio`,
          },
          {
            role: "user",
            content: `Contato: ${contact}\nMensagem: "${message}"`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{"lane":"espera","reason":""}';
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("Classify error:", err.message);
    return { lane: "espera", reason: "erro" };
  }
}

app.post("/api/classify", async (req, res) => {
  const { contact, message } = req.body;
  if (!contact || !message) {
    return res.status(400).json({ error: "Campos 'contact' e 'message' obrigatórios." });
  }
  const classified = await classifyMsg(contact, message);
  res.json(classified);
});

// ── Proxy Uazapi → resolve CORS ───────────────────────────────────────────────
app.all("/api/uazapi/*", async (req, res) => {
  const base = req.query.base;
  if (!base) return res.status(400).json({ error: "Query param 'base' obrigatório." });

  const uazPath = req.path.replace(/^\/api\/uazapi/, "");
  const qs = new URLSearchParams(req.query);
  qs.delete("base");
  const url = `${base.replace(/\/$/, "")}${uazPath}${qs.toString() ? "?" + qs.toString() : ""}`;

  try {
    const fetchOpts = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        token: req.headers["token"] || "",
        sessionkey: req.headers["sessionkey"] || "",
      },
    };
    if (["POST","PUT","PATCH"].includes(req.method) && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();
    res.status(upstream.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (err) {
    console.error("Uazapi proxy error:", err.message);
    res.status(502).json({ error: "Erro ao conectar na Uazapi: " + err.message });
  }
});

// ── Servir frontend buildado ──────────────────────────────────────────────────
const distPath = path.join(__dirname, "../frontend/dist");
const hasFrontend = fs.existsSync(distPath);

console.log(`📁 Procurando frontend em: ${distPath}`);
console.log(`📁 Frontend existe? ${hasFrontend}`);

if (hasFrontend) {
  const files = fs.readdirSync(distPath);
  console.log(`📁 Arquivos em dist/: ${files.join(", ")}`);
  
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  console.warn(`⚠️  Frontend não encontrado em ${distPath}`);
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.status(404).json({ error: "Frontend não buildado", path: distPath });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n✅  MultiAtend rodando em http://localhost:${PORT}`);
  console.log(`   📡 WebSocket ativo (socket.io)`);
  console.log(`   🔔 Webhook: POST /api/webhook`);
  console.log(`   💬 Chat: POST /api/classify`);
  console.log(`   🔗 Proxy: ALL /api/uazapi/*`);
  if (hasFrontend) {
    console.log(`   🌐 Frontend estático: GET /\n`);
  }
});
