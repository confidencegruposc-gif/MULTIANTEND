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
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

// ── WebSocket ─────────────────────────────────────────────────────────────────
const io = socketIo(server, { cors: { origin: "*" } });
io.on("connection", (socket) => {
  console.log(`📱 Cliente conectado: ${socket.id}`);
  socket.on("disconnect", () => console.log(`📱 Desconectado: ${socket.id}`));
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Webhook ───────────────────────────────────────────────────────────────────
app.post("/api/webhook", async (req, res) => {
  const { event, data } = req.body || {};
  if (event === "messages" && data && !data.fromMe) {
    const classified = await classifyMsg(data.senderName || "Desconhecido", data.body || "");
    io.emit("new_message", {
      phone: data.phone, contact: data.senderName || "Desconhecido",
      message: data.body, lane: classified.lane, reason: classified.reason,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
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
  if (!contact || !message) return res.status(400).json({ error: "Campos obrigatórios: contact, message" });
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

// ── Start — ESCUTAR EM 0.0.0.0 ────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ MultiAtend rodando em http://0.0.0.0:${PORT}`);
  console.log(`   📡 WebSocket (socket.io)`);
  console.log(`   🔔 Webhook: POST /api/webhook`);
  console.log(`   💬 Classify: POST /api/classify`);
  console.log(`   🔗 Proxy: /api/uazapi/*\n`);
});
