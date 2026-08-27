import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Renderer lives in src/ and runs standalone in a browser (bun run dev) with a mock
// IPC bridge, so the design is checkable without Electron or a local `claude` install.
// The Electron build reads dist/ as the renderer (see electron/main.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Every cross-slice import in src/ is written `@/<layer>/…`. A relative path across FSD layers
  // churns every importer when a slice moves, which is the one thing the layout exists to stop.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  base: "./",
  server: { port: 4180 },
  build: { outDir: "dist" },
});
