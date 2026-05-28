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
const PORT = 3000;

// ── Configuração de Persistência ──────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || "/data";
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

// Criar diretório se não existir
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✅ Diretório criado: ${DATA_DIR}`);
  } catch (e) {
    console.warn(`⚠️ Não foi possível criar ${DATA_DIR}, usando fallback`);
  }
}

// Fallback se /data não existir
const FALLBACK_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  if (!fs.existsSync(FALLBACK_DIR)) fs.mkdirSync(FALLBACK_DIR, { recursive: true });
}

const ACTUAL_CONFIG_FILE = fs.existsSync(DATA_DIR) ? CONFIG_FILE : path.join(FALLBACK_DIR, "config.json");
console.log(`📁 Arquivo de config: ${ACTUAL_CONFIG_FILE}`);

// ── Funções de leitura/escrita ────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(ACTUAL_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(ACTUAL_CONFIG_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Erro ao ler config:", e.message);
  }
  return { accounts: [], convs: [] };
}

function saveConfig(data) {
  try {
    fs.writeFileSync(ACTUAL_CONFIG_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Erro ao salvar config:", e.message);
    return false;
  }
}

// ── CORS e Body Parser ────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

// ── LOG TODAS AS REQUISIÇÕES (debug) ──────────────────────────────────────────
app.use((req, res, next) => {
  if (!req.path.startsWith("/assets") && req.path !== "/" && !req.path.includes("favicon")) {
    console.log(`📥 [${req.method}] ${req.path} | from: ${req.headers["user-agent"]?.slice(0,30) || "?"}`);
    if (req.method === "POST" && req.body && Object.keys(req.body).length > 0) {
      console.log(`   📦 Body: ${JSON.stringify(req.body).slice(0, 200)}`);
    }
  }
  next();
});

// ── AUTENTICAÇÃO POR SENHA ────────────────────────────────────────────────────
const APP_PASSWORD = process.env.APP_PASSWORD || "multiatend2026";

// Middleware de autenticação
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || req.query.token;
  if (auth === APP_PASSWORD || auth === `Bearer ${APP_PASSWORD}`) {
    return next();
  }
  return res.status(401).json({ error: "Não autorizado", needsAuth: true });
}

// Endpoint de login
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === APP_PASSWORD) {
    return res.json({ ok: true, token: APP_PASSWORD });
  }
  return res.status(401).json({ error: "Senha incorreta" });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const io = socketIo(server, { cors: { origin: "*" } });
io.on("connection", (socket) => {
  console.log(`📱 Cliente conectado: ${socket.id}`);
  socket.on("disconnect", () => console.log(`📱 Desconectado: ${socket.id}`));
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, configFile: ACTUAL_CONFIG_FILE }));

// ── CONFIG: GET e POST ────────────────────────────────────────────────────────
app.get("/api/config", requireAuth, (_req, res) => {
  res.json(loadConfig());
});

app.post("/api/config", requireAuth, (req, res) => {
  const ok = saveConfig(req.body);
  if (ok) res.json({ ok: true });
  else res.status(500).json({ error: "Erro ao salvar" });
});

// ── Webhook ───────────────────────────────────────────────────────────────────
app.post("/api/webhook", async (req, res) => {
  console.log("🔔 WEBHOOK RECEBIDO!");
  console.log("   Payload:", JSON.stringify(req.body).slice(0, 500));

  try {
    const body = req.body || {};
    // Uazapi pode mandar em formatos diferentes
    const event = body.event || body.type || body.EventType;
    const data = body.data || body.message || body;

    // Detectar se é mensagem
    const isMessage = event === "messages" || event === "message" || body.message || data.body || data.text;

    if (isMessage) {
      // Extrair campos (vários formatos possíveis)
      const phone = data.phone || data.chatid || data.from || data.sender || data.number || "desconhecido";
      const text = data.body || data.text || data.message || data.content || data.conversation || "";
      const fromMe = data.fromMe || data.fromme || data.isFromMe || false;
      const contact = data.senderName || data.pushName || data.notifyName || data.name || phone;

      console.log(`   📱 De: ${contact} (${phone}) | fromMe: ${fromMe}`);
      console.log(`   💬 Texto: ${text}`);

      if (!fromMe && text) {
        const classified = await classifyMsg(contact, text);
        io.emit("new_message", {
          phone, contact, message: text,
          lane: classified.lane, reason: classified.reason,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        });
        console.log(`   ✅ Enviado pro app: ${contact} → ${classified.lane}`);
      } else {
        console.log(`   ⏭️ Ignorado (fromMe=${fromMe} ou texto vazio)`);
      }
    } else {
      console.log(`   ⏭️ Evento não é mensagem: ${event}`);
    }
  } catch (err) {
    console.error("   ❌ Erro no webhook:", err.message);
  }

  res.json({ ok: true });
});

// ── Classify ──────────────────────────────────────────────────────────────────
async function classifyMsg(contact, message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("xxxx")) return { lane: "espera", reason: "" };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", max_tokens: 80, temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Classifique mensagens WhatsApp. Retorne JSON: {"lane":"urgente"|"atendimento"|"espera"|"concluido","reason":"motivo"}' },
          { role: "user", content: `Contato: ${contact}\nMensagem: "${message}"` }
        ]
      })
    });
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '{"lane":"espera","reason":""}';
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch { return { lane: "espera", reason: "erro" }; }
}

app.post("/api/classify", async (req, res) => {
  const { contact, message } = req.body;
  if (!contact || !message) return res.status(400).json({ error: "Campos obrigatórios" });
  res.json(await classifyMsg(contact, message));
});

// ── Proxy Uazapi ──────────────────────────────────────────────────────────────
app.all("/api/uazapi/*", async (req, res) => {
  const base = req.query.base;
  if (!base) return res.status(400).json({ error: "Query param 'base' obrigatório." });
  const uazPath = req.path.replace(/^\/api\/uazapi/, "");
  const qs = new URLSearchParams(req.query);
  qs.delete("base");
  const url = `${base.replace(/\/$/, "")}${uazPath}${qs.toString() ? "?" + qs.toString() : ""}`;
  try {
    const opts = {
      method: req.method,
      headers: { "Content-Type": "application/json", token: req.headers["token"] || "", sessionkey: req.headers["sessionkey"] || "" }
    };
    if (["POST","PUT","PATCH"].includes(req.method) && req.body) opts.body = JSON.stringify(req.body);
    const upstream = await fetch(url, opts);
    const text = await upstream.text();
    res.status(upstream.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Frontend ──────────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, "../frontend/dist");
console.log(`📁 Frontend: ${distPath} | Existe: ${fs.existsSync(distPath)}`);
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ MultiAtend rodando em http://0.0.0.0:${PORT}`);
  console.log(`   🔒 Senha: ${APP_PASSWORD === "multiatend2026" ? "PADRÃO (mude!)" : "CUSTOMIZADA ✓"}`);
  console.log(`   📁 Config: ${ACTUAL_CONFIG_FILE}`);
  console.log(`   📡 WebSocket | 🔔 Webhook | 💬 Classify | 🔗 Proxy Uazapi\n`);
});
