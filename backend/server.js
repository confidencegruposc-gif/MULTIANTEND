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

// Helper para extrair caption de mídia
function caption_(data) {
  return data.caption || data.text || "";
}

// ── Mapa de tokens → accountId ────────────────────────────────────────────────
const TOKEN_TO_ACCOUNT = {
  "4b246ec4-afec-46af-8c9f-39cbabcc9775": 1, // confir MEI
  "b611340c-989d-4975-9f97-bc937503202f": 2, // Confidence
  "a5821f84-85d9-46e4-9212-c1c76e8beb58": 4, // Pet Family
};

// ── Gerenciamento de grupos ───────────────────────────────────────────────────
function loadGroups() {
  const cfg = loadConfig();
  return cfg.groups || {}; // { "id@g.us": { name, enabled, accountId } }
}

function saveGroups(groups) {
  const cfg = loadConfig();
  cfg.groups = groups;
  saveConfig(cfg);
}

// Endpoint: listar grupos detectados
app.get("/api/groups", requireAuth, (_req, res) => {
  res.json(loadGroups());
});

// Endpoint: atualizar grupos (ativar/desativar)
app.post("/api/groups", requireAuth, (req, res) => {
  saveGroups(req.body);
  res.json({ ok: true });
});

// ── Webhook ───────────────────────────────────────────────────────────────────
app.post("/api/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || body.type || body.EventType;
    const data = body.data || body.message || body;

    // DEBUG: logar estrutura quando NÃO for texto simples
    const _dbgType = data.messageType || data.type || "";
    if (_dbgType && !_dbgType.includes("text") && !_dbgType.includes("conversation")) {
      console.log(`📦 PAYLOAD [${_dbgType}]:`, JSON.stringify(data).slice(0, 500));
    }

    const isMessage = event === "messages" || event === "message" || body.message || data.body || data.text || data.mediaUrl || data.messageType;

    if (isMessage) {
      const rawId = data.chatid || data.phone || data.from || data.sender || data.number || "";
      const text = data.body || data.text || data.message || data.content || data.conversation || "";
      const fromMe = data.fromMe || data.fromme || data.isFromMe || false;
      const contact = data.senderName || data.pushName || data.notifyName || data.name || rawId;

      // Identificar conta - tenta vários campos
      const token = body.token || body.Token || data.token || "";
      const owner = body.owner || body.Owner || data.owner || body.instance || body.Instance || "";

      // Log para debug de identificação
      console.log(`🔍 ID fields → token:"${token.slice(0,12)}" owner:"${owner}" base:"${body.BaseUrl || ""}"`);

      // Mapa por número dono (owner) → accountId
      const OWNER_TO_ACCOUNT = {
        "554792285773": 1, // confir MEI
        "554792189753": 2, // Confidence
        "554732125603": 4, // Pet Family
      };

      // Tenta identificar por token, depois por owner
      let accountId = TOKEN_TO_ACCOUNT[token];
      if (!accountId) {
        const ownerClean = owner.replace(/\D/g, "");
        accountId = OWNER_TO_ACCOUNT[ownerClean];
      }
      if (!accountId) accountId = 1; // fallback

      // É grupo?
      const isGroup = rawId.includes("@g.us");

      if (isGroup) {
        // Registrar grupo na lista (se novo)
        const groups = loadGroups();
        if (!groups[rawId]) {
          groups[rawId] = { name: contact, enabled: false, accountId, lastSeen: new Date().toISOString() };
          saveGroups(groups);
          console.log(`👥 Novo grupo detectado: ${contact} (desativado por padrão)`);
        } else {
          // Atualizar nome e lastSeen
          groups[rawId].name = contact;
          groups[rawId].lastSeen = new Date().toISOString();
          saveGroups(groups);
        }

        // Se grupo NÃO está ativado, ignorar a mensagem
        if (!groups[rawId].enabled) {
          return res.json({ ok: true, skipped: "grupo desativado" });
        }
        // Grupo ativado → continua processando abaixo
      }

      const phone = rawId.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@g.us", "");

      // Detectar tipo de mídia
      const msgType = (data.messageType || data.type || "text").toLowerCase();
      const mediaUrl = data.mediaUrl || data.url || data.fileUrl || data.audioUrl || data.imageUrl || data.documentUrl || "";
      const isAudio = msgType.includes("audio") || msgType.includes("ptt") || msgType.includes("voice");
      const isImage = msgType.includes("image") || msgType.includes("photo");
      const isDoc = msgType.includes("document") || msgType.includes("file");

      let displayText = text;
      if (isAudio) displayText = "🎤 [Áudio]";
      else if (isImage) displayText = caption_(data) || "📷 [Imagem]";
      else if (isDoc) displayText = "📄 [Documento]";

      if (!fromMe && (text || mediaUrl)) {
        console.log(`🔔 [Conta ${accountId}]${isGroup ? " [GRUPO]" : ""} ${contact}: ${displayText.slice(0, 40)}`);
        const classified = await classifyMsg(contact, text || displayText);
        io.emit("new_message", {
          accountId, phone, contact,
          message: displayText,
          mediaUrl, msgType, isAudio, isImage, isDoc,
          isGroup,
          lane: classified.lane, reason: classified.reason,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }
  } catch (err) {
    console.error("❌ Erro webhook:", err.message);
  }
  res.json({ ok: true });
});

// Aceitar a rota alternativa que a Uazapi usa
app.post("/api/webhook/messages/text", (req, res) => res.json({ ok: true }));
app.post("/api/webhook/*", (req, res) => res.json({ ok: true }));

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

// ── ENVIAR MENSAGEM (texto, imagem, arquivo, áudio) ───────────────────────────
const ACCOUNT_TOKENS = {
  1: "4b246ec4-afec-46af-8c9f-39cbabcc9775",
  2: "b611340c-989d-4975-9f97-bc937503202f",
  4: "a5821f84-85d9-46e4-9212-c1c76e8beb58",
};
const UAZAPI_BASE = "https://scpetfamily.uazapi.com";

app.post("/api/send", async (req, res) => {
  const { accountId, phone, type, text, file, filename, caption } = req.body;
  const token = ACCOUNT_TOKENS[accountId];
  if (!token) return res.status(400).json({ error: "Conta inválida" });

  const number = phone.includes("@") ? phone : `${phone}`;

  try {
    let endpoint, payload;

    if (type === "text") {
      endpoint = "/send/text";
      payload = { number, text };
    } else if (type === "image") {
      endpoint = "/send/media";
      payload = { number, type: "image", file, caption: caption || "" };
    } else if (type === "document") {
      endpoint = "/send/media";
      payload = { number, type: "document", file, docName: filename || "arquivo", caption: caption || "" };
    } else if (type === "audio") {
      endpoint = "/send/media";
      payload = { number, type: "audio", file };
    } else {
      return res.status(400).json({ error: "Tipo inválido" });
    }

    const r = await fetch(`${UAZAPI_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    console.log(`📤 Enviado [${type}] para ${number} via conta ${accountId}`);
    res.json({ ok: r.ok, data });
  } catch (err) {
    console.error("Erro ao enviar:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── BUSCAR HISTÓRICO de uma conversa ──────────────────────────────────────────
app.post("/api/history", async (req, res) => {
  const { accountId, phone } = req.body;
  const token = ACCOUNT_TOKENS[accountId];
  if (!token) return res.status(400).json({ error: "Conta inválida" });

  try {
    const r = await fetch(`${UAZAPI_BASE}/message/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ chatid: phone, limit: 50 }),
    });
    const data = await r.json();
    res.json({ ok: true, messages: Array.isArray(data) ? data : (data.messages || []) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── TRANSCREVER ÁUDIO (Whisper) ───────────────────────────────────────────────
app.post("/api/transcribe", async (req, res) => {
  const { audioUrl } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "OpenAI não configurada" });

  try {
    // Baixar o áudio
    const audioResp = await fetch(audioUrl);
    const audioBuffer = await audioResp.buffer();

    // Enviar pro Whisper
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "audio.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, ...form.getHeaders() },
      body: form,
    });
    const data = await r.json();
    res.json({ ok: true, text: data.text || "" });
  } catch (err) {
    console.error("Erro transcrição:", err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── RESUMO DA CONVERSA (GPT) ──────────────────────────────────────────────────
app.post("/api/summary", async (req, res) => {
  const { messages } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: "OpenAI não configurada" });
  if (!messages || messages.length === 0) return res.json({ ok: true, summary: "Sem mensagens para resumir." });

  try {
    const conversa = messages.map((m) => `${m.from === "me" ? "Atendente" : "Cliente"}: ${m.text}`).join("\n");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          { role: "system", content: "Resuma a conversa de atendimento de forma clara e objetiva, destacando: o que o cliente quer, status do atendimento e próximos passos. Máximo 4 linhas." },
          { role: "user", content: conversa },
        ],
      }),
    });
    const data = await r.json();
    res.json({ ok: true, summary: data.choices?.[0]?.message?.content || "Erro ao resumir" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
