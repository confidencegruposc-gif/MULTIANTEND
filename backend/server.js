/**
 * MultiAtend – Backend Proxy
 * ─────────────────────────────────────────────────────────────────────────────
 * Rotas:
 *   POST /api/classify          → proxy para OpenAI (classifica mensagens)
 *   ALL  /api/uazapi/:path(*)   → proxy para Uazapi (resolve CORS)
 *   GET  /api/health            → healthcheck
 *   GET  /                      → serve frontend buildado (frontend/dist)
 */

require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","token","sessionkey"],
}));
app.use(express.json({ limit: "5mb" }));

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Proxy OpenAI → classificação de mensagens ─────────────────────────────────
app.post("/api/classify", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("xxxx")) {
    return res.status(500).json({ error: "OPENAI_API_KEY não configurada no backend/.env" });
  }

  const { contact, message } = req.body;
  if (!contact || !message) {
    return res.status(400).json({ error: "Campos 'contact' e 'message' obrigatórios." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",   // barato e rápido — troque por gpt-4o se quiser mais precisão
        max_tokens: 80,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Classifique mensagens de WhatsApp para atendimento ao cliente.
Retorne SOMENTE JSON válido (sem markdown):
{"lane":"urgente"|"atendimento"|"espera"|"concluido","reason":"motivo curto"}

Regras:
- urgente:      reclamações graves, CAPS agressivo, DEFEITO/REEMBOLSO/NÃO CHEGOU/CANCELAR
- atendimento:  dúvidas, pedidos, perguntas sobre produto/preço/prazo/plano
- espera:       saudações, primeiro contato, mensagens genéricas
- concluido:    agradecimentos, elogios, confirmações positivas`,
          },
          {
            role: "user",
            content: `Contato: ${contact}\nMensagem: "${message}"`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(response.status).json({ error: data.error?.message || "Erro OpenAI" });
    }

    const text  = data.choices?.[0]?.message?.content || '{"lane":"espera","reason":""}';
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      res.json(JSON.parse(clean));
    } catch {
      res.json({ lane: "espera", reason: "resposta inválida" });
    }

  } catch (err) {
    console.error("Classify error:", err.message);
    res.status(500).json({ lane: "espera", reason: "erro interno" });
  }
});

// ── Proxy Uazapi → resolve CORS do navegador ──────────────────────────────────
app.all("/api/uazapi/*", async (req, res) => {
  const base = req.query.base;
  if (!base) return res.status(400).json({ error: "Query param 'base' obrigatório." });

  const uazPath = req.path.replace(/^\/api\/uazapi/, "");
  const qs = new URLSearchParams(req.query);
  qs.delete("base");
  const url = `${base.replace(/\/$/, "")}${uazPath}${qs.toString() ? "?" + qs.toString() : ""}`;

  try {
    const fetchOpts = {
      method:  req.method,
      headers: {
        "Content-Type": "application/json",
        token:          req.headers["token"]      || "",
        sessionkey:     req.headers["sessionkey"] || "",
      },
    };
    if (["POST","PUT","PATCH"].includes(req.method) && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, fetchOpts);
    const text     = await upstream.text();
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

if (hasFrontend) {
  app.use(express.static(distPath));
  // SPA fallback: tudo que não for /api/* devolve o index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  MultiAtend rodando em http://localhost:${PORT}`);
  console.log(`   POST /api/classify   → ChatGPT (OpenAI)`);
  console.log(`   ALL  /api/uazapi/*   → proxy Uazapi`);
  if (hasFrontend) {
    console.log(`   GET  /               → frontend estático\n`);
  } else {
    console.log(`   ⚠️   frontend/dist não encontrado.`);
    console.log(`       Rode: cd frontend && npm run build\n`);
  }
});
