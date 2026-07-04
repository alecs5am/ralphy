import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        studio: "index.html",
        storybook: "storybook.html",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4861,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4860",
      "/ws": {
        target: "ws://127.0.0.1:4860",
        ws: true,
      },
    },
  },
});
