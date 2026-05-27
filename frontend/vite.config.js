import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Todas as chamadas /api/* vão para o backend Node
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
