import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `bun run dev` loads this server in Electron; `bun run dev:renderer` keeps the
// standalone browser fixture mode. Production reads dist/ (see electron/main.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Every cross-slice import in src/ is written `@/<layer>/…`. A relative path across FSD layers
  // churns every importer when a slice moves, which is the one thing the layout exists to stop.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  base: "./",
  server: { port: 4180 },
  build: { outDir: "dist" },
});
