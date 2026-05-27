const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

// Servir frontend
const distPath = path.join(__dirname, "../frontend/dist");
const hasFiles = fs.existsSync(distPath);

console.log(`📁 Frontend em: ${distPath}`);
console.log(`📁 Existe? ${hasFiles}`);

if (hasFiles) {
  // Servir arquivos estáticos
  app.use(express.static(distPath));
  
  // Catchall - servir index.html
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Start
const server = app.listen(PORT, () => {
  console.log(`\n✅ Servidor simples rodando na porta ${PORT}\n`);
});
