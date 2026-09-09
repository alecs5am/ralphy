import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Several suites launch Electron and compilers; keep their combined load bounded.
    minThreads: 1,
    maxThreads: 4,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
