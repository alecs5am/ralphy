import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Renderer lives in src/ and runs standalone in a browser (bun run dev) with a mock
// IPC bridge, so the design is checkable without Electron or a local `claude` install.
// The Electron build reads dist/ as the renderer (see electron/main.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: { port: 4180 },
  build: { outDir: "dist" },
});
