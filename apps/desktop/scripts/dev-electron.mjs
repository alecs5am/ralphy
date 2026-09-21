import { spawn } from "node:child_process";

import electron from "electron";
import { createServer } from "vite";

await import("./build-electron.mjs");

const server = await createServer({
  server: { host: "127.0.0.1", port: 4180, strictPort: true },
});
await server.listen();

const devUrl = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4180/";
const desktop = spawn(electron, ["."], {
  env: { ...process.env, VITE_DEV_SERVER_URL: devUrl },
  stdio: "inherit",
});

const stop = (signal) => desktop.kill(signal);
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const code = await new Promise((resolve, reject) => {
  desktop.once("error", reject);
  desktop.once("close", resolve);
});
await server.close();
process.exitCode = code ?? 1;
