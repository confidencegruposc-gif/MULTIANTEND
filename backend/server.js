const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// LOG DE BOOT
console.log(`\n🚀 INICIANDO SERVIDOR`);
console.log(`📁 __dirname: ${__dirname}`);
console.log(`📁 cwd: ${process.cwd()}`);

// Verificar frontend
const distPath = path.join(__dirname, "../frontend/dist");
console.log(`\n📁 Procurando dist em: ${distPath}`);
console.log(`📁 Existe? ${fs.existsSync(distPath)}`);

if (fs.existsSync(distPath)) {
  const files = fs.readdirSync(distPath);
  console.log(`📁 Arquivos: ${files.join(", ")}`);
  const indexPath = path.join(distPath, "index.html");
  console.log(`📁 index.html existe? ${fs.existsSync(indexPath)}`);
}

// ROTA: /health
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ROTA: /api/*
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint não encontrado" });
});

// SERVIR FRONTEND ESTÁTICO
app.use(express.static(distPath, { 
  maxAge: "1d",
  etag: false 
}));

// CATCHALL: qualquer coisa que chegar aqui, serve index.html
app.use((req, res) => {
  const indexPath = path.join(distPath, "index.html");
  console.log(`[CATCHALL] ${req.method} ${req.path} -> ${indexPath}`);
  
  if (fs.existsSync(indexPath)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "index.html não encontrado", path: indexPath });
  }
});

// START
app.listen(PORT, () => {
  console.log(`\n✅ SERVIDOR RODANDO NA PORTA ${PORT}\n`);
});
