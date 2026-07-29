import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Assets do build vão pra "static/" (não "assets/") pra não colidir com a rota /assets do SPA.
  // Sem isso, o F5 em /assets cai na pasta física de assets e o Nginx dá 301/404 em vez do index.html.
  build: {
    assetsDir: "static",
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
