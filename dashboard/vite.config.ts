import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:4321",
      "/media": "http://localhost:4321",
      "/ws": {
        target: "ws://localhost:4321",
        ws: true,
      },
      "/pty": {
        target: "ws://localhost:4321",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
